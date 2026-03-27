#!/usr/bin/env python3
"""
Backend scraper for LA arthouse theater showtimes.
Fetches: American Cinematheque (Aero + Egyptian), New Beverly Cinema, Vista Theatre.
Also serves the static frontend files.
Run: python3 server.py
"""

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import json, re, traceback, threading, time, os
from datetime import datetime, date, timedelta

app = Flask(__name__, static_folder='.')
CORS(app)

# ── Cache ──────────────────────────────────────────────────────────────────────
_cache = {'data': None, 'fetched_at': 0}
CACHE_TTL = 3600  # refresh every hour

def _build_cache():
    results = {'events': [], 'errors': {}}
    for key, fetcher in [
        ('americancinematheque', fetch_ac_events),
        ('newbeverly',           fetch_newbev_events),
        ('vista',                fetch_vista_events),
        ('academy',              fetch_academy_events),
        ('braindead',            fetch_braindead_events),
    ]:
        try:
            results['events'].extend(fetcher())
        except Exception as e:
            results['errors'][key] = str(e)
            traceback.print_exc()
    _cache['data'] = results
    _cache['fetched_at'] = time.time()
    print(f"Cache refreshed — {len(results['events'])} events, errors: {list(results['errors'].keys()) or 'none'}")

def _refresh_loop():
    """Background thread: rebuild cache on startup then every CACHE_TTL seconds."""
    _build_cache()
    while True:
        time.sleep(CACHE_TTL)
        _build_cache()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

# ── Date parsing ──────────────────────────────────────────────────────────────

def parse_date_str(s):
    """Parse a loose date string to YYYY-MM-DD. Returns None on failure."""
    if not s:
        return None
    s = s.strip()
    # Strip day-of-week prefix: "SUN APR 5, 2026" → "APR 5, 2026"
    s = re.sub(r'^(MON|TUE|WED|THU|FRI|SAT|SUN),?\s+', '', s, flags=re.IGNORECASE)
    # Strip ordinal suffixes: "5th" → "5"
    s = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', s)
    s = s.strip().rstrip(',')

    formats = [
        '%b %d, %Y',   # APR 5, 2026
        '%B %d, %Y',   # April 5, 2026
        '%B %d',       # March 26
        '%b %d',       # Mar 26
        '%m/%d/%Y',
    ]
    today = date.today()
    for fmt in formats:
        try:
            dt = datetime.strptime(s, fmt)
            if dt.year == 1900:
                dt = dt.replace(year=today.year)
                if dt.date() < today - timedelta(days=1):
                    dt = dt.replace(year=today.year + 1)
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None

def expand_date_range(raw):
    """
    Handle ranges like "FRI APR 11 - SUN APR 13, 2026".
    Returns list of YYYY-MM-DD strings.
    """
    if not raw:
        return []
    parts = re.split(r'\s*[-–]\s*', raw, maxsplit=1)
    start = parse_date_str(parts[0])
    if not start:
        return []
    if len(parts) == 1:
        return [start]
    end = parse_date_str(parts[1])
    if not end:
        return [start]
    d0 = datetime.strptime(start, '%Y-%m-%d').date()
    d1 = datetime.strptime(end,   '%Y-%m-%d').date()
    out = []
    while d0 <= d1:
        out.append(d0.strftime('%Y-%m-%d'))
        d0 += timedelta(days=1)
    return out

# ── Scrapers ──────────────────────────────────────────────────────────────────

def fetch_ac_events():
    """American Cinematheque — WP REST API (custom 'event' post type with ACF)."""
    events = []
    page = 1
    today = date.today().strftime('%Y-%m-%dT00:00:00')
    while True:
        r = requests.get(
            f"https://www.americancinematheque.com/wp-json/wp/v2/event"
            f"?per_page=50&page={page}&after={today}&orderby=date&order=asc",
            headers=HEADERS, timeout=20
        )
        if r.status_code != 200:
            break
        data = r.json()
        if not data:
            break

        for e in data:
            acf  = e.get('acf') or {}
            hero = acf.get('event_hero') or {}
            loc  = acf.get('location_section') or {}

            # Theater name
            locs = loc.get('locations') or []
            theater = 'American Cinematheque'
            if locs and isinstance(locs[0], dict):
                theater = locs[0].get('location_title') or theater

            # Title (strip HTML entities)
            title = (e.get('title') or {}).get('rendered') or ''
            title = re.sub(r'<[^>]+>', '', title).strip()

            # Poster
            card_img = acf.get('event_card_image') or {}
            poster_url = card_img.get('url') if isinstance(card_img, dict) else None

            # Dates — may be range
            date_raw  = hero.get('dates') or '' if isinstance(hero, dict) else ''
            time_raw  = hero.get('times') or '' if isinstance(hero, dict) else ''
            dates     = expand_date_range(date_raw)
            times     = [t.strip() for t in re.split(r'[/,]', time_raw) if t.strip()]

            for d in (dates or [None]):
                events.append({
                    'theater': theater,
                    'title':   title,
                    'date':    d,
                    'times':   times,
                    'url':     e.get('link') or '',
                    'poster':  poster_url,
                    'source':  'americancinematheque',
                })

        total_pages = int(r.headers.get('X-WP-TotalPages', 1))
        if page >= total_pages:
            break
        page += 1

    return events


def fetch_newbev_events():
    """New Beverly Cinema — HTML scrape of /schedule/."""
    r = requests.get('https://thenewbev.com/schedule/', headers=HEADERS, timeout=20)
    soup = BeautifulSoup(r.text, 'html.parser')
    events = []

    for card in soup.select('article.event-card'):
        month_el = card.select_one('.event-card__month')
        numb_el  = card.select_one('.event-card__numb')
        date_str = ''
        if month_el and numb_el:
            date_str = f"{month_el.text.strip()} {numb_el.text.strip()}"
        parsed_date = parse_date_str(date_str)

        times = [t.text.strip() for t in card.select('.event-card__time')]

        title_el = card.select_one('.event-card__title')
        raw_title = title_el.get_text(' ', strip=True) if title_el else ''
        title = re.sub(r'\s+', ' ', raw_title).strip()
        title = re.sub(r'\s*/\s*', ' / ', title)

        # Poster
        img = card.select_one('.event-card__img img')
        poster_url = img['src'] if img and img.get('src') else None

        link_el = card.select_one('a[href]')
        url = link_el['href'] if link_el else ''

        events.append({
            'theater': 'New Beverly Cinema',
            'title':   title,
            'date':    parsed_date,
            'times':   times,
            'url':     url,
            'poster':  poster_url,
            'source':  'newbeverly',
        })

    return events


def fetch_vista_events():
    """Vista Theatre — Veezi JSON-LD structured data embedded in sessions page."""
    url = 'https://ticketing.uswest.veezi.com/sessions/?siteToken=20xhpa3yt2hhkwt4zjvfcwsaww'
    r = requests.get(url, headers=HEADERS, timeout=20)
    soup = BeautifulSoup(r.text, 'html.parser')
    events = []

    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string or '')
        except Exception:
            continue
        if not isinstance(data, list):
            continue
        for item in data:
            if item.get('@type') != 'VisualArtsEvent':
                continue
            start = item.get('startDate') or ''
            dt = None
            if start:
                try:
                    dt = datetime.fromisoformat(start)
                except Exception:
                    pass
            events.append({
                'theater': 'Vista Theatre',
                'title':   item.get('name') or '',
                'date':    dt.strftime('%Y-%m-%d') if dt else None,
                'times':   [dt.strftime('%-I:%M %p') if dt else ''],
                'url':     item.get('url') or '',
                'poster':  None,
                'source':  'vista',
            })

    return events


def _extract_rich_text(node):
    """Recursively extract plain text from Contentful rich-text JSON."""
    if not node or not isinstance(node, dict):
        return ''
    if node.get('nodeType') == 'text':
        return node.get('value', '')
    parts = []
    for child in node.get('content', []):
        parts.append(_extract_rich_text(child))
    return ''.join(parts).strip()


def fetch_academy_events():
    """Academy Museum — Next.js __NEXT_DATA__ embedded JSON on the calendar page."""
    r = requests.get('https://www.academymuseum.org/en/calendar', headers=HEADERS, timeout=20)
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
                  r.text, re.DOTALL)
    if not m:
        return []
    data = json.loads(m.group(1))
    programs = (data.get('props', {})
                    .get('pageProps', {})
                    .get('cfProgramsKeyedByTkId', {}))
    events = []
    today = date.today()
    for prog in programs.values():
        start_raw = prog.get('activeStartDate') or ''
        end_raw   = prog.get('activeEndDate')   or start_raw
        if not start_raw:
            continue

        # Parse ISO dates and expand range
        try:
            d0 = datetime.fromisoformat(start_raw.replace('Z', '+00:00')).date()
            d1 = datetime.fromisoformat(end_raw.replace('Z', '+00:00')).date()
        except Exception:
            continue
        if d1 < today:
            continue

        # Extract title from Contentful rich-text JSON
        title_field = prog.get('programTitle') or prog.get('title') or {}
        if isinstance(title_field, dict):
            title = _extract_rich_text(title_field.get('json') or title_field)
        else:
            title = str(title_field)
        title = re.sub(r'\s+', ' ', title).strip()
        if not title:
            continue

        # Poster image
        img = prog.get('image') or {}
        poster_url = img.get('url') if isinstance(img, dict) else None

        # Slug → URL
        slug = prog.get('slug') or ''
        url  = f'https://www.academymuseum.org/en/programs/{slug}' if slug else \
               'https://www.academymuseum.org/en/calendar'

        # Only expand date ranges up to 7 days; longer ranges are exhibitions not screenings
        span = (d1 - d0).days
        if span > 7:
            continue

        cur = d0
        while cur <= d1:
            events.append({
                'theater': 'Academy Museum',
                'title':   title,
                'date':    cur.strftime('%Y-%m-%d'),
                'times':   [],
                'url':     url,
                'poster':  poster_url,
                'source':  'academy',
            })
            cur += timedelta(days=1)

    return events


def fetch_braindead_events():
    """Brain Dead Studios — WordPress/Filmbot site; scrape upcoming shows panel."""
    r = requests.get('https://studios.wearebraindead.com', headers=HEADERS, timeout=20)
    soup = BeautifulSoup(r.text, 'html.parser')
    events = []
    today = date.today()

    # The upcoming-shows panel lists all future screenings
    panel = soup.find(attrs={'data-type': 'upcoming-shows'})
    if not panel:
        # Fallback: search the whole page
        panel = soup

    for show in panel.select('a.show-link'):
        date_el  = show.select_one('.show__date')
        title_el = show.select_one('.show__title')
        if not date_el or not title_el:
            continue

        date_text  = date_el.get_text(strip=True)   # e.g. "Mar 29"
        title_text = re.sub(r'\s+', ' ', title_el.get_text(' ', strip=True))
        parsed     = parse_date_str(date_text)
        if not parsed:
            continue

        # Poster
        img = show.select_one('img')
        poster_url = img.get('src') if img else None

        # URL
        url = show.get('href') or 'https://studios.wearebraindead.com'

        events.append({
            'theater': 'Brain Dead Studios',
            'title':   title_text,
            'date':    parsed,
            'times':   ['8:00 PM'],
            'url':     url,
            'poster':  poster_url,
            'source':  'braindead',
        })

    # Also grab today's now-playing feature if present
    now_panel = soup.find(attrs={'data-type': 'now-playing'})
    if now_panel:
        title_el = now_panel.select_one('.show__title')
        if title_el:
            title_text = re.sub(r'\s+', ' ', title_el.get_text(' ', strip=True))
            # Collect showtimes from ol.showtimes
            times = []
            for a in now_panel.select('ol.showtimes a.showtime'):
                t = a.get_text(strip=True)
                if t:
                    times.append(t)
            img = now_panel.select_one('img')
            poster_url = img.get('src') if img else None
            link = now_panel.select_one('a[href]')
            url  = link['href'] if link else 'https://studios.wearebraindead.com'
            events.append({
                'theater': 'Brain Dead Studios',
                'title':   title_text,
                'date':    today.strftime('%Y-%m-%d'),
                'times':   times or ['8:00 PM'],
                'url':     url,
                'poster':  poster_url,
                'source':  'braindead',
            })

    # Deduplicate by (date, title)
    seen = set()
    unique = []
    for e in events:
        key = (e['date'], e['title'].lower())
        if key not in seen:
            seen.add(key)
            unique.append(e)
    return unique

# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/api/showtimes')
def showtimes():
    if _cache['data'] is None:
        # Cache not ready yet — build synchronously on first hit
        _build_cache()
    return jsonify(_cache['data'])

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

# Serve static frontend files
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    # Start background refresh thread (daemon so it dies with the process)
    t = threading.Thread(target=_refresh_loop, daemon=True)
    t.start()

    port = int(os.environ.get('PORT', 5001))
    print(f'Starting SS250 server on http://localhost:{port}')
    app.run(host='0.0.0.0', port=port, debug=False)
