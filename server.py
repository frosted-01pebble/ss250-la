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
from concurrent.futures import ThreadPoolExecutor, as_completed
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
        ('nuart',                fetch_nuart_events),
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

_FORMAT_RE = re.compile(
    r'\b(70mm|35mm|16mm|4K\s*DCP|2K\s*DCP|DCP|Blu-?ray|digital)\b',
    re.IGNORECASE
)

def _extract_ac_format(intro_text, body_text=''):
    """Pull a film format string from AC intro_text or main_body_text HTML."""
    # Prefer explicit "FORMAT: ..." label in body
    for html in (body_text, intro_text):
        if not html:
            continue
        plain = re.sub(r'<[^>]+>', ' ', html)
        # Explicit label takes priority
        m = re.search(r'FORMAT:\s*(\S[^\n]{0,30})', plain, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    # Fall back to format keyword anywhere in either field
    for html in (intro_text, body_text):
        if not html:
            continue
        plain = re.sub(r'<[^>]+>', ' ', html)
        m = _FORMAT_RE.search(plain)
        if m:
            return m.group(0).strip()
    return ''


def fetch_ac_venue(theater_name, location_term_id):
    """Fetch events for one AC venue using the event_location taxonomy filter.

    Posts are ordered newest-first (desc post date). We fetch posts published
    in the last 90 days (enough window for freshly-announced upcoming events)
    and filter by actual event date parsed from hero.dates >= today.
    """
    events = []
    page = 1
    today_str = date.today().strftime('%Y-%m-%d')
    after = (date.today() - timedelta(days=90)).strftime('%Y-%m-%dT00:00:00')

    while True:
        r = requests.get(
            f"https://www.americancinematheque.com/wp-json/wp/v2/event"
            f"?per_page=100&page={page}&after={after}&orderby=date&order=desc"
            f"&event_location={location_term_id}",
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

            # Title (strip HTML tags/entities)
            title = (e.get('title') or {}).get('rendered') or ''
            title = re.sub(r'<[^>]+>', '', title).strip()

            # Poster
            card_img = acf.get('event_card_image') or {}
            poster_url = card_img.get('url') if isinstance(card_img, dict) else None

            # Format — extracted from intro_text or main_body_text
            intro    = hero.get('intro_text') or '' if isinstance(hero, dict) else ''
            main_sec = acf.get('event_main_section') or {}
            body     = main_sec.get('main_body_text') or '' if isinstance(main_sec, dict) else ''
            fmt      = _extract_ac_format(intro, body)

            # Dates — may be range; only keep future events
            date_raw = hero.get('dates') or '' if isinstance(hero, dict) else ''
            time_raw = hero.get('times') or '' if isinstance(hero, dict) else ''
            dates    = expand_date_range(date_raw)
            times    = [t.strip() for t in re.split(r'[/,]', time_raw) if t.strip()]

            for d in (dates or [None]):
                if d and d < today_str:
                    continue  # skip past events
                events.append({
                    'theater': theater_name,
                    'title':   title,
                    'date':    d,
                    'times':   times,
                    'format':  fmt,
                    'url':     e.get('link') or '',
                    'poster':  poster_url,
                    'source':  'americancinematheque',
                })

        total_pages = int(r.headers.get('X-WP-TotalPages', 1))
        if page >= total_pages:
            break
        page += 1

    return events


def fetch_ac_events():
    """American Cinematheque — fetch each venue separately by event_location term ID."""
    venues = [
        ('Egyptian Theatre',  55),
        ('Aero Theatre',      54),
        ('Los Feliz 3',      102),
    ]
    events = []
    for theater_name, term_id in venues:
        events.extend(fetch_ac_venue(theater_name, term_id))
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


_VISTA_FORMAT_RE = re.compile(
    r'\s+(70mm|35mm|16mm|4K\s*DCP|2K\s*DCP|DCP|Blu-?ray|digital)$',
    re.IGNORECASE
)

def fetch_vista_events():
    """Vista Theatre — Veezi JSON-LD structured data embedded in sessions page.

    Format is appended to the event name (e.g. 'Rio Bravo 70mm').
    If no format is listed, default to 35mm per Vista's standard.
    Groups multiple showtimes for the same film+date into one event.
    """
    url = 'https://ticketing.uswest.veezi.com/sessions/?siteToken=20xhpa3yt2hhkwt4zjvfcwsaww'
    r = requests.get(url, headers=HEADERS, timeout=20)
    soup = BeautifulSoup(r.text, 'html.parser')

    # Collect sessions grouped by (title, date) -> {times, format, url}
    groups = {}

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
            raw_name = item.get('name') or ''

            # Extract format from name suffix; default to 35mm
            fmt_match = _VISTA_FORMAT_RE.search(raw_name)
            fmt   = fmt_match.group(1).strip() if fmt_match else '35mm'
            title = _VISTA_FORMAT_RE.sub('', raw_name).strip()

            start = item.get('startDate') or ''
            dt = None
            if start:
                try:
                    dt = datetime.fromisoformat(start)
                except Exception:
                    pass

            date_str = dt.strftime('%Y-%m-%d') if dt else None
            h = dt.hour % 12 or 12
            ampm = 'AM' if dt.hour < 12 else 'PM'
            time_str = f"{h}:{dt.strftime('%M')} {ampm}" if dt else ''

            key = (title, date_str)
            if key not in groups:
                groups[key] = {
                    'title': title, 'date': date_str, 'fmt': fmt,
                    'times': [], 'url': item.get('url') or '',
                }
            if time_str and time_str not in groups[key]['times']:
                groups[key]['times'].append(time_str)

    return [
        {
            'theater': 'Vista Theatre',
            'title':   g['title'],
            'date':    g['date'],
            'times':   g['times'],
            'format':  g['fmt'],
            'url':     g['url'],
            'poster':  None,
            'source':  'vista',
        }
        for g in groups.values()
    ]


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


def _fetch_academy_session_time(tk_id):
    """Fetch the showtime for one Academy Museum event from Ticketure API."""
    try:
        r = requests.get(
            f'https://tickets.academymuseum.org/api/events/{tk_id}/sessions',
            headers=HEADERS, timeout=10
        )
        sessions = r.json().get('event_session', {}).get('_data', [])
        if sessions:
            start_utc = sessions[0].get('start_datetime', '')
            if start_utc:
                dt_utc = datetime.fromisoformat(start_utc.replace('Z', '+00:00'))
                # Convert UTC → US/Pacific (approximate: UTC-7 PDT / UTC-8 PST)
                from datetime import timezone, timedelta as td
                offset = td(hours=-7) if 3 <= dt_utc.month <= 10 else td(hours=-8)
                dt_local = dt_utc.astimezone(timezone(offset))
                return dt_local.strftime('%-I:%M %p')
    except Exception:
        pass
    return None


def fetch_academy_events():
    """Academy Museum — Next.js __NEXT_DATA__ + Ticketure session times."""
    r = requests.get('https://www.academymuseum.org/en/calendar', headers=HEADERS, timeout=20)
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
                  r.text, re.DOTALL)
    if not m:
        return []
    data = json.loads(m.group(1))
    programs = (data.get('props', {})
                    .get('pageProps', {})
                    .get('cfProgramsKeyedByTkId', {}))
    today = date.today()

    # First pass: collect candidate programs
    candidates = []
    for prog in programs.values():
        start_raw = prog.get('activeStartDate') or ''
        end_raw   = prog.get('activeEndDate')   or start_raw
        if not start_raw:
            continue
        try:
            d0 = datetime.fromisoformat(start_raw.replace('Z', '+00:00')).date()
            d1 = datetime.fromisoformat(end_raw.replace('Z', '+00:00')).date()
        except Exception:
            continue
        if d1 < today:
            continue
        if (d1 - d0).days > 7:
            continue

        title_field = prog.get('programTitle') or prog.get('title') or {}
        if isinstance(title_field, dict):
            title = _extract_rich_text(title_field.get('json') or title_field)
        else:
            title = str(title_field)
        title = re.sub(r'\s+', ' ', title).strip()
        if not title:
            continue

        img       = prog.get('image') or {}
        poster    = img.get('url') if isinstance(img, dict) else None
        tk_id     = prog.get('ticketureIdProduction') or prog.get('ticketureId') or ''
        slug      = prog.get('slug') or ''
        url       = f'https://www.academymuseum.org/programs/detail/{slug}' if slug else \
                    'https://www.academymuseum.org/en/calendar'
        fmt       = prog.get('filmFormat1') or prog.get('filmFormat2') or ''

        candidates.append({'title': title, 'd0': d0, 'd1': d1,
                           'tk_id': tk_id, 'url': url,
                           'poster': poster, 'format': fmt})

    # Fetch session times in parallel
    tk_to_time = {}
    ids = [c['tk_id'] for c in candidates if c['tk_id']]
    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = {ex.submit(_fetch_academy_session_time, tk_id): tk_id for tk_id in ids}
        for fut in as_completed(futures):
            tk_id = futures[fut]
            t = fut.result()
            if t:
                tk_to_time[tk_id] = t

    # Build events
    events = []
    for c in candidates:
        times = [tk_to_time[c['tk_id']]] if c['tk_id'] in tk_to_time else []
        cur = c['d0']
        while cur <= c['d1']:
            events.append({
                'theater': 'Academy Museum',
                'title':   c['title'],
                'date':    cur.strftime('%Y-%m-%d'),
                'times':   times,
                'format':  c['format'],
                'url':     c['url'],
                'poster':  c['poster'],
                'source':  'academy',
            })
            cur += timedelta(days=1)

    return events


def _fetch_braindead_format(url):
    """Fetch a Brain Dead event page and extract the film format."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(r.text, 'html.parser')
        for label in soup.select('.show-spec-label'):
            if 'Format' in label.get_text():
                parent_text = label.parent.get_text(' ', strip=True)
                fmt = re.sub(r'Format:\s*', '', parent_text, flags=re.IGNORECASE).strip()
                return fmt
    except Exception:
        pass
    return ''


def fetch_braindead_events():
    """Brain Dead Studios — WordPress/Filmbot site; scrape upcoming shows panel."""
    r = requests.get('https://studios.wearebraindead.com', headers=HEADERS, timeout=20)
    soup = BeautifulSoup(r.text, 'html.parser')
    events = []
    today = date.today()

    # The upcoming-shows panel lists all future screenings
    panel = soup.find(attrs={'data-type': 'upcoming-shows'})
    if not panel:
        panel = soup

    for show in panel.select('a.show-link'):
        date_el  = show.select_one('.show__date')
        title_el = show.select_one('.show__title')
        if not date_el or not title_el:
            continue

        date_text  = date_el.get_text(strip=True)
        title_text = re.sub(r'\s+', ' ', title_el.get_text(' ', strip=True))
        parsed     = parse_date_str(date_text)
        if not parsed:
            continue

        img        = show.select_one('img')
        poster_url = img.get('src') if img else None
        url        = show.get('href') or 'https://studios.wearebraindead.com'

        events.append({
            'theater': 'Brain Dead Studios',
            'title':   title_text,
            'date':    parsed,
            'times':   ['8:00 PM'],
            'url':     url,
            'poster':  poster_url,
            'format':  '',
            'source':  'braindead',
        })

    # Also grab today's now-playing feature if present
    now_panel = soup.find(attrs={'data-type': 'now-playing'})
    if now_panel:
        title_el = now_panel.select_one('.show__title')
        if title_el:
            title_text = re.sub(r'\s+', ' ', title_el.get_text(' ', strip=True))
            times = [a.get_text(strip=True) for a in now_panel.select('ol.showtimes a.showtime') if a.get_text(strip=True)]
            img        = now_panel.select_one('img')
            poster_url = img.get('src') if img else None
            link       = now_panel.select_one('a[href]')
            url        = link['href'] if link else 'https://studios.wearebraindead.com'
            events.append({
                'theater': 'Brain Dead Studios',
                'title':   title_text,
                'date':    today.strftime('%Y-%m-%d'),
                'times':   times or ['8:00 PM'],
                'url':     url,
                'poster':  poster_url,
                'format':  '',
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

    # Fetch formats in parallel
    urls = [e['url'] for e in unique]
    with ThreadPoolExecutor(max_workers=8) as ex:
        formats = list(ex.map(_fetch_braindead_format, urls))
    for e, fmt in zip(unique, formats):
        e['format'] = fmt

    return unique

def _fetch_nuart_session_times(movie_url_map):
    """
    Use Playwright to visit each Nuart movie page, click date buttons,
    and capture schedule API responses (which only work from the browser context).

    The schedule API returns:
      { "X00CW": { "schedule": { movie_id: { date: [{ startsAt, ... }] } } }, ... }

    Args:
        movie_url_map: {str(movie_id): url}

    Returns:
        {(movie_id_str, date_str): [time_str, ...]}
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Nuart: playwright not installed — times will be empty")
        return {}

    result = {}

    def _parse_schedule_response(data):
        """Extract (mid, date_str) -> [time_str] from a schedule API response dict."""
        if not isinstance(data, dict):
            return
        # Theater-keyed format: {theater_id: {schedule: {movie_id: {date: [sessions]}}}}
        for theater_id, theater_data in data.items():
            if not isinstance(theater_data, dict):
                continue
            sched = theater_data.get('schedule') or {}
            for mid, dates in sched.items():
                if not isinstance(dates, dict):
                    continue
                for d_str, sessions in dates.items():
                    if not isinstance(sessions, list):
                        continue
                    for session in sessions:
                        if not isinstance(session, dict):
                            continue
                        if session.get('isExpired'):
                            continue
                        starts_at = session.get('startsAt') or ''
                        if not starts_at:
                            continue
                        try:
                            dt = datetime.fromisoformat(starts_at)
                            h = dt.hour % 12 or 12
                            ampm = 'AM' if dt.hour < 12 else 'PM'
                            t_str = f"{h}:{dt.strftime('%M')} {ampm}"
                        except Exception:
                            t_str = starts_at[11:16]
                        key = (str(mid), d_str)
                        if key not in result:
                            result[key] = []
                        if t_str not in result[key]:
                            result[key].append(t_str)

    def handle_response(response):
        if 'gatsby-source-boxofficeapi/schedule' not in response.url:
            return
        if response.status != 200:
            return
        try:
            _parse_schedule_response(response.json())
        except Exception:
            pass

    day_abbrevs = ['SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI']

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(user_agent=HEADERS['User-Agent'])
            page = context.new_page()
            page.on('response', handle_response)

            for mid, url in movie_url_map.items():
                try:
                    page.goto(url, wait_until='domcontentloaded', timeout=30000)
                    page.wait_for_timeout(2000)
                    # Dismiss cookie consent popup if present
                    try:
                        accept = page.locator('button:has-text("Accept and Continue")')
                        if accept.count() > 0:
                            accept.first.click(timeout=3000)
                            page.wait_for_timeout(800)
                    except Exception:
                        pass
                    # Click all enabled date buttons to trigger schedule API calls
                    for btn in page.locator('button:enabled').all():
                        try:
                            txt = btn.inner_text().strip().upper()
                            if any(d in txt for d in day_abbrevs):
                                btn.click(timeout=3000)
                                page.wait_for_timeout(1200)
                        except Exception:
                            pass
                except Exception as e:
                    print(f"Nuart playwright error for {url}: {e}")

            browser.close()
    except Exception as e:
        print(f"Nuart playwright session failed: {e}")

    print(f"Nuart: fetched times for {len(result)} (movie, date) pairs")
    return result


def _nuart_movie_paths():
    """Fetch the static allMovie query to get id->path mapping."""
    # Determine today's build date from the homepage JS src
    try:
        r0 = requests.get('https://www.landmarktheatres.com/', headers=HEADERS, timeout=10)
        m = re.search(r'webediamovies\.pro/prod/landmarktheatres/(\d{4}-\d{2}-\d{2})/', r0.text)
        build = m.group(1) if m else date.today().strftime('%Y-%m-%d')
    except Exception:
        build = date.today().strftime('%Y-%m-%d')

    paths = {}
    try:
        r = requests.get(
            f'https://cms-assets.webediamovies.pro/prod/landmarktheatres/{build}/public/page-data/sq/d/3360083659.json',
            headers=HEADERS, timeout=15
        )
        if r.status_code == 200:
            for m in r.json()['data']['allMovie']['nodes']:
                if m.get('path'):
                    paths[m['id']] = m['path']
    except Exception:
        pass
    return paths


def fetch_nuart_events():
    """Landmark Nuart Theatre — Gatsby boxofficeapi (scheduledMovies + movies endpoints)."""
    today_str = date.today().strftime('%Y-%m-%d')

    # Step 1: get movie IDs and their scheduled dates + id->path map (parallel)
    with ThreadPoolExecutor(max_workers=2) as ex:
        f_sched = ex.submit(requests.get,
            'https://www.landmarktheatres.com/api/gatsby-source-boxofficeapi/scheduledMovies',
            **{'params': {'theaterId': 'X00CW'}, 'headers': HEADERS, 'timeout': 20})
        f_paths = ex.submit(_nuart_movie_paths)
        r = f_sched.result()
        path_map = f_paths.result()

    if r.status_code != 200:
        return []
    sched_data = r.json() or {}
    scheduled_days = sched_data.get('scheduledDays') or {}

    # Filter to upcoming dates only
    upcoming = {mid: [d for d in days if d >= today_str]
                for mid, days in scheduled_days.items()}
    upcoming = {mid: days for mid, days in upcoming.items() if days}
    if not upcoming:
        return []

    # Step 2: fetch movie details in batches of 20
    movie_ids = list(upcoming.keys())
    movies = {}
    for i in range(0, len(movie_ids), 20):
        batch = movie_ids[i:i+20]
        params = [('basic', 'false'), ('castingLimit', '0')] + [('ids', mid) for mid in batch]
        r2 = requests.get(
            'https://www.landmarktheatres.com/api/gatsby-source-boxofficeapi/movies',
            params=params, headers=HEADERS, timeout=20
        )
        if r2.status_code == 200:
            for m in (r2.json() or []):
                movies[m['id']] = m

    # Step 3: build url map for Playwright time fetching
    movie_url_map = {}
    for mid in upcoming:
        path = path_map.get(mid) or ''
        if path:
            movie_url_map[str(mid)] = f'https://www.landmarktheatres.com{path}?theater=X00CW'

    # Step 4: fetch session times via Playwright (browser-only API)
    session_times = _fetch_nuart_session_times(movie_url_map) if movie_url_map else {}

    # Step 5: build events
    events = []
    for mid, days in upcoming.items():
        mid_str = str(mid)
        m = movies.get(mid) or {}
        title = m.get('title') or mid
        poster = (m.get('locale') or {}).get('poster', {})
        poster_url = poster.get('url') if isinstance(poster, dict) else None
        if not poster_url:
            poster_url = m.get('poster')
        path = path_map.get(mid) or ''
        url = (f'https://www.landmarktheatres.com{path}?theater=X00CW' if path
               else 'https://www.landmarktheatres.com/theaters/x00cw-landmark-nuart-theatre-west-los-angeles')

        for d in days:
            times = session_times.get((mid_str, d), [])
            events.append({
                'theater': 'Nuart Theatre',
                'title':   title,
                'date':    d,
                'times':   times,
                'format':  '',
                'url':     url,
                'poster':  poster_url,
                'source':  'nuart',
            })

    return events


# ── SS250 poster cache ────────────────────────────────────────────────────────

TMDB_KEY = os.environ.get('TMDB_API_KEY', '8054ed3692dfed2068f4c209e12148a2')
_ss250_cache = {'data': None, 'fetched_at': 0}
SS250_CACHE_TTL = 86400  # 24 hours

def _load_ss250_from_js():
    try:
        with open('ss250.js', encoding='utf-8') as f:
            text = f.read()
        pattern = r'\{\s*rank:\s*(\d+)\s*,\s*title:\s*"([^"]+)"\s*,\s*year:\s*(\d+)\s*\}'
        return [{'rank': int(r), 'title': t, 'year': int(y)}
                for r, t, y in re.findall(pattern, text)]
    except Exception as e:
        print(f'Failed to parse ss250.js: {e}')
        return []

def _tmdb_search(query, year=None):
    """Search TMDB by title. Uses primary_release_year for accuracy."""
    params = {'api_key': TMDB_KEY, 'query': query, 'language': 'en-US'}
    if year:
        params['primary_release_year'] = year
    try:
        r = requests.get('https://api.themoviedb.org/3/search/movie',
                         params=params, headers=HEADERS, timeout=10)
        results = r.json().get('results', [])
        # Prefer results whose year is within ±2 of target
        if year:
            for res in results:
                ry = int((res.get('release_date') or '0000')[:4] or 0)
                if abs(ry - year) <= 2 and res.get('poster_path'):
                    return res['poster_path']
            return None  # strict: don't return wrong-year result
        if results and results[0].get('poster_path'):
            return results[0]['poster_path']
    except Exception:
        pass
    return None

def _fetch_one_poster(film):
    title, year = film['title'], film['year']
    # 1. Exact year match
    path = _tmdb_search(title, year)
    # 2. Widen year by ±1 (catches off-by-one in TMDB data)
    if not path:
        path = _tmdb_search(title, year - 1) or _tmdb_search(title, year + 1)
    # 3. Strip leading article and retry
    if not path:
        alt = re.sub(r'^(The|A|An|La|Le|Les|L\'|Un|Une|Des|Il|Lo|El)\s+', '', title, flags=re.I)
        if alt != title:
            path = _tmdb_search(alt, year)
    # 4. No year constraint (last resort — only if nothing else works)
    if not path:
        path = _tmdb_search(title)
    poster = f'https://image.tmdb.org/t/p/w342{path}' if path else None
    return {**film, 'poster': poster}

def _build_ss250_cache():
    films = _load_ss250_from_js()
    if not films:
        return
    enriched = [None] * len(films)
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(_fetch_one_poster, f): i for i, f in enumerate(films)}
        for fut in as_completed(futures):
            enriched[futures[fut]] = fut.result()
    _ss250_cache['data'] = [f for f in enriched if f]
    _ss250_cache['fetched_at'] = time.time()
    print(f'SS250 poster cache built — {len(_ss250_cache["data"])} films')

# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/api/showtimes')
def showtimes():
    if _cache['data'] is None:
        # Cache not ready yet — build synchronously on first hit
        _build_cache()
    return jsonify(_cache['data'])

@app.route('/api/ss250')
def ss250_api():
    if _ss250_cache['data'] is None or time.time() - _ss250_cache['fetched_at'] > SS250_CACHE_TTL:
        threading.Thread(target=_build_ss250_cache, daemon=True).start() if _ss250_cache['data'] else _build_ss250_cache()
    return jsonify(_ss250_cache['data'] or [])

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
