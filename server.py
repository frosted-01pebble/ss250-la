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
import json, re, traceback, threading, time, os, html as html_lib
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, date, timedelta

app = Flask(__name__, static_folder='.')
CORS(app)

# ── Cache ──────────────────────────────────────────────────────────────────────
_cache = {'data': None, 'fetched_at': 0}
CACHE_TTL = 3600  # refresh every hour
_loading_progress = {'status': 'idle', 'done': 0, 'total': 0}

_year_cache = {}  # title -> year int or None

def _lookup_year(title):
    """Search TMDB for a film title and return its release year, or None."""
    key = title.lower().strip()
    if key in _year_cache:
        return _year_cache[key]
    params = {'api_key': TMDB_KEY, 'query': title, 'language': 'en-US'}
    try:
        r = requests.get('https://api.themoviedb.org/3/search/movie',
                         params=params, headers=HEADERS, timeout=8)
        results = r.json().get('results', [])
        if results:
            year_str = (results[0].get('release_date') or '')[:4]
            year = int(year_str) if year_str.isdigit() else None
            _year_cache[key] = year
            return year
    except Exception:
        pass
    _year_cache[key] = None
    return None

_DOUBLE_SEP = re.compile(r' / |/')

def _enrich_double_features(events):
    """For double-feature titles, embed TMDB release year into each part that lacks one."""
    for ev in events:
        title = ev.get('title', '')
        if '/' not in title:
            continue
        sep = ' / ' if ' / ' in title else '/'
        parts = [p.strip() for p in title.split(sep)]
        enriched = []
        changed = False
        for part in parts:
            if re.search(r'\(\d{4}\)', part):
                enriched.append(part)
            else:
                year = _lookup_year(part)
                if year:
                    enriched.append(f'{part} ({year})')
                    changed = True
                else:
                    enriched.append(part)
        if changed:
            ev['title'] = f' / '.join(enriched)

def _build_cache():
    global _loading_progress
    today_str = date.today().strftime('%Y-%m-%d')

    scrapers = [
        ('americancinematheque', fetch_ac_events),
        ('newbeverly',           fetch_newbev_events),
        ('vista',                fetch_vista_events),
        ('academy',              fetch_academy_events),
        ('braindead',            fetch_braindead_events),
        ('nuart',                fetch_nuart_events),
        ('billywilder',          fetch_billywilder_events),
        ('gardena',              fetch_gardena_events),
        ('vidiots',              fetch_vidiots_events),
        ('alamo',                fetch_alamo_events),
    ]

    _loading_progress = {'status': 'loading', 'done': 0, 'total': len(scrapers)}
    results = {'events': [], 'errors': {}}
    lock = threading.Lock()

    def run_scraper(key, fetcher):
        try:
            evs = fetcher()
            with lock:
                results['events'].extend(evs)
        except Exception as e:
            with lock:
                results['errors'][key] = str(e)
            traceback.print_exc()
        finally:
            with lock:
                _loading_progress['done'] += 1

    with ThreadPoolExecutor(max_workers=len(scrapers)) as ex:
        futures = [ex.submit(run_scraper, key, fetcher) for key, fetcher in scrapers]
        for f in as_completed(futures):
            pass

    # Preserve today's events from the previous cache that the fresh fetch may have dropped.
    prev_data = _cache.get('data')
    if prev_data:
        new_keys = {(e['theater'], e['title'], e['date']) for e in results['events']}
        for ev in prev_data.get('events', []):
            if ev.get('date') == today_str and (ev['theater'], ev['title'], ev['date']) not in new_keys:
                results['events'].append(ev)

    _enrich_double_features(results['events'])
    _cache['data'] = results
    _cache['fetched_at'] = time.time()
    _loading_progress['status'] = 'ready'
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

_BODY_YEAR_RE = re.compile(r'([A-Z\u2019\u2018\u201C\u201D\u00C0-\u024F][^\n,]{2,100}?),\s*(\d{4}),\s*Dir\.', re.MULTILINE)

def _body_key(t):
    """Normalize a film title for body-year lookup: uppercase, collapse whitespace, strip punctuation."""
    t = html_lib.unescape(t)
    t = re.sub(r'[^\w\s]', '', t)   # remove punctuation (apostrophes, hyphens, etc.)
    return re.sub(r'\s+', ' ', t).upper().strip()

def _extract_body_film_years(body_html):
    """Parse 'FILM TITLE, YEAR, Dir.' patterns from AC body HTML. Returns {normalized_key: year}."""
    if not body_html:
        return {}
    plain = re.sub(r'<[^>]+>', ' ', body_html)
    plain = html_lib.unescape(plain)
    years = {}
    for m in _BODY_YEAR_RE.finditer(plain):
        raw_title = m.group(1).strip()
        year = int(m.group(2))
        years[_body_key(raw_title)] = year
    return years

def _enrich_title_with_body_years(title, body_years):
    """For double-feature titles, append (YEAR) to each part found in body_years."""
    if not body_years or '/' not in title:
        return title
    sep = ' / ' if ' / ' in title else '/'
    parts = [p.strip() for p in title.split(sep)]
    new_parts = []
    for part in parts:
        clean = re.sub(r'\s*\(\d{4}\)', '', part).strip()
        year = body_years.get(_body_key(clean))
        if year and not re.search(r'\(\d{4}\)', part):
            new_parts.append(f'{clean} ({year})')
        else:
            new_parts.append(part)
    return ' / '.join(new_parts)

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

            # Title (strip HTML tags, decode entities)
            title = (e.get('title') or {}).get('rendered') or ''
            title = html_lib.unescape(re.sub(r'<[^>]+>', '', title)).strip()

            # Poster
            card_img = acf.get('event_card_image') or {}
            poster_url = card_img.get('url') if isinstance(card_img, dict) else None

            # Format — extracted from intro_text or main_body_text
            intro    = hero.get('intro_text') or '' if isinstance(hero, dict) else ''
            main_sec = acf.get('event_main_section') or {}
            body     = main_sec.get('main_body_text') or '' if isinstance(main_sec, dict) else ''
            fmt      = _extract_ac_format(intro, body)

            # For double features, embed release years from body description
            if '/' in title:
                body_years = _extract_body_film_years(body)
                title = _enrich_title_with_body_years(title, body_years)

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
    r'\b(70mm|35mm|16mm|4K\s*DCP|2K\s*DCP|DCP|Blu-?ray|digital)\b',
    re.IGNORECASE
)
_VISTA_BASE = 'https://ticketing.uswest.veezi.com'

def fetch_vista_events():
    """Vista Theatre — Veezi HTML sessions page.

    Format is either a suffix in the title ('Project Hail Mary 70mm')
    or found in the subtitle paragraph ('Video Archives 16mm Screening').
    Defaults to 35mm when not listed.
    '/' in title = double feature; kept as-is in the title string.
    Groups multiple showtimes for the same film+date into one event.
    """
    url = f'{_VISTA_BASE}/sessions/?siteToken=20xhpa3yt2hhkwt4zjvfcwsaww'
    r = requests.get(url, headers=HEADERS, timeout=20)
    soup = BeautifulSoup(r.text, 'html.parser')

    groups = {}  # (title, date_str) -> event dict

    for date_div in soup.select('div#sessionsByDateConent div.date'):
        date_h3 = date_div.select_one('h3.date-title')
        if not date_h3:
            continue
        # Parse "Friday 27, March" → "March 27" → YYYY-MM-DD
        raw_date = date_h3.get_text(strip=True)
        m = re.match(r'\w+\s+(\d+),\s+(\w+)', raw_date)
        date_str = parse_date_str(f"{m.group(2)} {m.group(1)}") if m else None

        for film_div in date_div.select('div.film'):
            title_el = film_div.select_one('h3.title')
            raw_title = title_el.get_text(strip=True) if title_el else ''

            # Subtitle paragraph (after removing the censor span)
            p_el = film_div.select_one('h3.title + p')
            sub = ''
            if p_el:
                censor = p_el.select_one('.censor')
                if censor:
                    censor.extract()
                sub = p_el.get_text(strip=True)

            # Extract format: title suffix first, then subtitle, default 35mm
            fmt_m = _VISTA_FORMAT_RE.search(raw_title)
            if fmt_m:
                fmt = fmt_m.group(1).strip()
                # Strip format suffix from title (but preserve '/' double-feature slash)
                title = raw_title[:fmt_m.start()].strip()
            else:
                fmt_m2 = _VISTA_FORMAT_RE.search(sub)
                fmt = fmt_m2.group(1).strip() if fmt_m2 else '35mm'
                title = raw_title

            # Poster (relative URL → absolute)
            img = film_div.select_one('img.poster')
            poster = (_VISTA_BASE + img['src']) if img and img.get('src') else None

            # Session times and URLs for this date
            for li in film_div.select('ul.session-times li'):
                time_el = li.select_one('time')
                link_el = li.select_one('a[href]')
                time_str = time_el.get_text(strip=True) if time_el else ''
                sess_url = link_el['href'] if link_el else url

                key = (title, date_str)
                if key not in groups:
                    groups[key] = {
                        'title': title, 'date': date_str, 'fmt': fmt,
                        'times': [], 'url': sess_url, 'poster': poster,
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
            'poster':  g['poster'],
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
    Use async Playwright to visit all Nuart movie pages IN PARALLEL, clicking
    date buttons and capturing schedule API responses.

    Returns: {(movie_id_str, date_str): [time_str, ...]}
    """
    import asyncio
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("Nuart: playwright not installed — times will be empty")
        return {}

    result = {}
    day_abbrevs = ['SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI']

    def _parse_response_data(data):
        if not isinstance(data, dict):
            return
        for theater_data in data.values():
            if not isinstance(theater_data, dict):
                continue
            for mid, dates in (theater_data.get('schedule') or {}).items():
                if not isinstance(dates, dict):
                    continue
                for d_str, sessions in dates.items():
                    if not isinstance(sessions, list):
                        continue
                    for session in sessions:
                        if not isinstance(session, dict) or session.get('isExpired'):
                            continue
                        starts_at = session.get('startsAt') or ''
                        if not starts_at:
                            continue
                        try:
                            dt = datetime.fromisoformat(starts_at)
                            h = dt.hour % 12 or 12
                            t_str = f"{h}:{dt.strftime('%M')} {'AM' if dt.hour < 12 else 'PM'}"
                        except Exception:
                            t_str = starts_at[11:16]
                        key = (str(mid), d_str)
                        result.setdefault(key, [])
                        if t_str not in result[key]:
                            result[key].append(t_str)

    async def fetch_one(context, mid, url):
        page = await context.new_page()
        async def on_response(response):
            if 'gatsby-source-boxofficeapi/schedule' not in response.url or response.status != 200:
                return
            try:
                _parse_response_data(await response.json())
            except Exception:
                pass
        page.on('response', on_response)
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=25000)
            await page.wait_for_timeout(1500)
            try:
                accept = page.locator('button:has-text("Accept and Continue")')
                if await accept.count() > 0:
                    await accept.first.click(timeout=2000)
                    await page.wait_for_timeout(500)
            except Exception:
                pass
            for btn in await page.locator('button:enabled').all():
                try:
                    if any(d in (await btn.inner_text()).strip().upper() for d in day_abbrevs):
                        await btn.click(timeout=2000)
                        await page.wait_for_timeout(800)
                except Exception:
                    pass
        except Exception as e:
            print(f"Nuart playwright error for {url}: {e}")
        finally:
            await page.close()

    async def run_all():
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent=HEADERS['User-Agent'])
            await asyncio.gather(*[fetch_one(context, mid, url)
                                   for mid, url in movie_url_map.items()])
            await browser.close()

    try:
        asyncio.run(run_all())
    except Exception as e:
        print(f"Nuart async playwright failed: {e}")

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
                'theater': 'Landmark Nuart Theatre',
                'title':   title,
                'date':    d,
                'times':   times,
                'format':  '',
                'url':     url,
                'poster':  poster_url,
                'source':  'nuart',
            })

    return events


def fetch_billywilder_events():
    """Billy Wilder Theatre (UCLA FTVA) — Craft CMS GraphQL API."""
    from datetime import timezone, timedelta as td
    today = date.today().strftime('%Y-%m-%d')
    query = ('{ entries(section:"ftvaEvent", limit:200, orderBy:"startDateWithTime ASC",'
             f' startDateWithTime:">= {today}") {{'
             ' title, uri, startDateWithTime,'
             ' ftvaScreeningFormatFilters { title } } }')
    r = requests.post('https://craft.library.ucla.edu/api',
                      json={'query': query}, headers=HEADERS, timeout=20)
    entries = r.json().get('data', {}).get('entries', [])

    events = []
    for entry in entries:
        raw_title = entry.get('title', '')
        # Strip trailing date suffix like " 03-27-26"
        title = re.sub(r'\s+\d{2}-\d{2}-\d{2}\s*$', '', raw_title).strip()
        if not title:
            continue

        start_str = entry.get('startDateWithTime', '')
        if not start_str:
            continue
        dt_utc = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
        offset = td(hours=-7) if 3 <= dt_utc.month <= 10 else td(hours=-8)
        dt_local = dt_utc.astimezone(timezone(offset))
        date_str = dt_local.strftime('%Y-%m-%d')
        time_str = dt_local.strftime('%-I:%M %p')

        uri = entry.get('uri', '')
        url = (f'https://www.cinema.ucla.edu/{uri}' if uri
               else 'https://www.cinema.ucla.edu/events')

        fmt_terms = entry.get('ftvaScreeningFormatFilters') or []
        fmt = ', '.join(f['title'] for f in fmt_terms if f.get('title'))

        events.append({
            'theater': 'Billy Wilder Theatre',
            'title':   title,
            'date':    date_str,
            'times':   [time_str],
            'format':  fmt,
            'url':     url,
            'poster':  None,
            'source':  'billywilder',
        })

    return events


_GARDENA_SITETOKEN = 'he5nsxynkgmw2w1wvfey3mvh64'

def fetch_gardena_events():
    """Gardena Cinema — Veezi HTML sessions page (same structure as Vista)."""
    url = f'{_VISTA_BASE}/sessions/?siteToken={_GARDENA_SITETOKEN}'
    r = requests.get(url, headers=HEADERS, timeout=20)
    soup = BeautifulSoup(r.text, 'html.parser')

    groups = {}

    for date_div in soup.select('div#sessionsByDateConent div.date'):
        date_h3 = date_div.select_one('h3.date-title')
        if not date_h3:
            continue
        raw_date = date_h3.get_text(strip=True)
        m = re.match(r'\w+\s+(\d+),\s+(\w+)', raw_date)
        date_str = parse_date_str(f"{m.group(2)} {m.group(1)}") if m else None

        for film_div in date_div.select('div.film'):
            title_el = film_div.select_one('h3.title')
            title = title_el.get_text(strip=True) if title_el else ''

            img = film_div.select_one('img.poster')
            poster = (_VISTA_BASE + img['src']) if img and img.get('src') else None

            for li in film_div.select('ul.session-times li'):
                time_el = li.select_one('time')
                link_el = li.select_one('a[href]')
                time_str = time_el.get_text(strip=True) if time_el else ''
                sess_url = link_el['href'] if link_el else url

                key = (title, date_str)
                if key not in groups:
                    groups[key] = {
                        'title': title, 'date': date_str,
                        'times': [], 'url': sess_url, 'poster': poster,
                    }
                if time_str and time_str not in groups[key]['times']:
                    groups[key]['times'].append(time_str)

    return [
        {
            'theater': 'Gardena Cinema',
            'title':   g['title'],
            'date':    g['date'],
            'times':   g['times'],
            'url':     g['url'],
            'poster':  g['poster'],
            'source':  'gardena',
        }
        for g in groups.values()
    ]


def fetch_vidiots_events():
    """Vidiots — NightJar showtime listings API."""
    r = requests.get('https://vidiotsfoundation.org/wp-json/nj/v1/showtime/listings',
                     headers=HEADERS, timeout=20)
    data = r.json()

    movies = {m['movie_id']: m for m in data.get('movies', [])}

    # Batch-fetch show details (format + poster) in chunks of 50
    movie_ids = list(movies.keys())
    show_details = {}  # id -> {'format': str, 'poster': str}
    _FORMAT_MAP = {'Digital': 'Digital', '4K Digital': '4K Digital',
                   '35mm Film': '35mm', '16mm Film': '16mm', '70mm Film': '70mm'}
    for i in range(0, len(movie_ids), 50):
        batch = movie_ids[i:i+50]
        include_str = ','.join(str(m) for m in batch)
        r2 = requests.get(
            f'https://vidiotsfoundation.org/wp-json/nj/v1/show'
            f'?include={include_str}&per_page=50',
            headers=HEADERS, timeout=20
        )
        for show in r2.json():
            sid = show.get('id')
            if sid:
                fmt_terms = show.get('format', [])
                api_fmt = fmt_terms[0].get('name', '') if fmt_terms else ''
                show_details[sid] = {
                    'format': _FORMAT_MAP.get(api_fmt, api_fmt),
                    'poster': show.get('featured_media_url') or None,
                }

    # Format suffix in title takes priority over taxonomy (e.g. "Film on 35mm")
    _TITLE_FMT_RE = re.compile(
        r'(?:\s+(?:on|in))?\s+(35mm|16mm|70mm)\s*$', re.IGNORECASE)

    groups = {}
    for st in data.get('showtimes', []):
        mid = st['movie_id']
        dt_raw = st.get('datetime', '')  # "20260327160000"
        if len(dt_raw) < 8:
            continue
        date_str = f'{dt_raw[:4]}-{dt_raw[4:6]}-{dt_raw[6:8]}'
        if len(dt_raw) >= 12:
            hour, minute = int(dt_raw[8:10]), int(dt_raw[10:12])
            ampm = 'AM' if hour < 12 else 'PM'
            h12 = hour % 12 or 12
            time_str = f'{h12}:{minute:02d} {ampm}'
        else:
            time_str = ''

        key = (mid, date_str)
        if key not in groups:
            groups[key] = {
                'date': date_str, 'times': [],
                'url': st.get('purchase_url', 'https://vidiotsfoundation.org/coming-soon/'),
            }
        if time_str and time_str not in groups[key]['times']:
            groups[key]['times'].append(time_str)

    events = []
    for (mid, date_str), g in groups.items():
        movie = movies.get(mid, {})
        raw_name = movie.get('movie_name', '')
        if not raw_name:
            continue

        # Extract format from title suffix, else use taxonomy
        fmt_m = _TITLE_FMT_RE.search(raw_name)
        if fmt_m:
            title = raw_name[:fmt_m.start()].strip()
            fmt = fmt_m.group(1)
        else:
            title = raw_name
            fmt = show_details.get(mid, {}).get('format', '')

        poster = show_details.get(mid, {}).get('poster')

        events.append({
            'theater': 'Vidiots',
            'title':   title,
            'date':    date_str,
            'times':   g['times'],
            'format':  fmt,
            'url':     g['url'],
            'poster':  poster,
            'source':  'vidiots',
        })

    return events


def fetch_alamo_events():
    """Alamo Drafthouse DTLA — mother API v2 schedule."""
    r = requests.get(
        'https://drafthouse.com/s/mother/v2/schedule/market/1700',
        headers={**HEADERS, 'User-Agent': 'Mozilla/5.0'},
        timeout=20,
    )
    d = r.json()['data']

    # Build format slug → display title (skip 2d-digital and open-caption)
    _FORMAT_SLUGS = {f['slug']: f['title'] for f in d.get('formats', [])}
    _SKIP_FORMATS = {'2d-digital', 'open-caption'}

    # Build presentation lookup: slug → {title, poster, formatSlugs}
    pres_map = {}
    for p in d.get('presentations', []):
        show = p.get('show') or {}
        title = show.get('title', '') or ''
        if not title:
            continue
        posters = show.get('posterImages') or []
        poster = posters[0]['uri'] if posters else None
        pres_map[p['slug']] = {
            'title': title,
            'poster': poster,
            'formatSlugs': p.get('formatSlugs') or [],
        }

    # Group sessions by (presentationSlug, businessDateClt) → list of showTimeClt
    groups = {}
    for s in d.get('sessions', []):
        if s.get('isHidden'):
            continue
        pslug = s['presentationSlug']
        if pslug not in pres_map:
            continue
        bdate = s['businessDateClt']          # "2026-04-08"
        show_dt_str = s['showTimeClt']         # "2026-04-08T20:00:00"
        key = (pslug, bdate)
        groups.setdefault(key, {'times': [], 'formatSlug': s.get('formatSlug', '')})
        # Parse time
        dt = datetime.fromisoformat(show_dt_str)
        time_str = dt.strftime('%-I:%M %p')
        if time_str not in groups[key]['times']:
            groups[key]['times'].append(time_str)

    events = []
    for (pslug, bdate), g in sorted(groups.items(), key=lambda x: x[0]):
        p = pres_map[pslug]
        # Determine format: prefer session-level formatSlug, fall back to presentation
        fslug = g['formatSlug']
        if fslug in _SKIP_FORMATS:
            # Check if any non-standard format slug exists on the presentation
            extra = [fs for fs in p['formatSlugs'] if fs not in _SKIP_FORMATS]
            fslug = extra[0] if extra else ''
        fmt = '' if fslug in _SKIP_FORMATS or not fslug else _FORMAT_SLUGS.get(fslug, fslug)
        url = f'https://drafthouse.com/los-angeles/show/{pslug}'
        events.append({
            'theater': 'Alamo Drafthouse DTLA',
            'title':   p['title'],
            'date':    bdate,
            'times':   sorted(g['times']),
            'format':  fmt,
            'url':     url,
            'poster':  p['poster'],
            'source':  'alamo',
        })

    return events


# ── SS250 poster cache ────────────────────────────────────────────────────────

TMDB_KEY = os.environ.get('TMDB_API_KEY', '8054ed3692dfed2068f4c209e12148a2')
_ss250_cache = {'data': None, 'fetched_at': 0}
SS250_CACHE_TTL = 86400 * 7  # 7 days

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
    """Search TMDB by title. Returns full result dict or None."""
    params = {'api_key': TMDB_KEY, 'query': query, 'language': 'en-US'}
    if year:
        params['primary_release_year'] = year
    try:
        r = requests.get('https://api.themoviedb.org/3/search/movie',
                         params=params, headers=HEADERS, timeout=10)
        results = r.json().get('results', [])
        if year:
            for res in results:
                ry = int((res.get('release_date') or '0000')[:4] or 0)
                if abs(ry - year) <= 2:
                    return res
            return None
        if results:
            return results[0]
    except Exception:
        pass
    return None

def _fetch_imdb_id(tmdb_id):
    """Fetch IMDb ID for a given TMDB movie ID."""
    try:
        r = requests.get(f'https://api.themoviedb.org/3/movie/{tmdb_id}/external_ids',
                         params={'api_key': TMDB_KEY}, headers=HEADERS, timeout=10)
        return r.json().get('imdb_id')
    except Exception:
        return None

# Films that need direct TMDB IDs due to ambiguous search results or TV-only entries.
_FILM_TMDB_OVERRIDES = {
    ('close-up', 1989):               {'movie_id': 30017},
    ('the intruder', 2004):           {'movie_id': 47143},
    ('partie de campagne', 1936):     {'movie_id': 43878},
    ('twin peaks: the return', 2017): {'tv_id': 1920, 'season': 3, 'imdb_id': 'tt4093826'},
}

def _best_poster_path(tmdb_id, media_type='movie', season=None):
    """Return the file_path of the highest-voted poster from TMDB images endpoint."""
    try:
        if media_type == 'tv' and season is not None:
            url = f'https://api.themoviedb.org/3/tv/{tmdb_id}/season/{season}/images'
        elif media_type == 'tv':
            url = f'https://api.themoviedb.org/3/tv/{tmdb_id}/images'
        else:
            url = f'https://api.themoviedb.org/3/movie/{tmdb_id}/images'
        r = requests.get(url, params={'api_key': TMDB_KEY}, headers=HEADERS, timeout=10)
        posters = r.json().get('posters', [])
        if posters:
            posters.sort(key=lambda p: (p.get('vote_count', 0), p.get('vote_average', 0)), reverse=True)
            return posters[0]['file_path']
    except Exception:
        pass
    return None

_COUNTRY_SHORT = {
    'United States of America': 'USA',
    'United Kingdom': 'UK',
    'Soviet Union': 'USSR',
    'West Germany': 'W. Germany',
    'Hong Kong': 'Hong Kong',
}

def _extract_movie_meta(d):
    """Extract director, countries from a TMDB movie detail dict (with credits appended)."""
    directors = [c['name'] for c in (d.get('credits') or {}).get('crew', [])
                 if c.get('job') == 'Director']
    director = ', '.join(directors) if directors else None
    raw_countries = [c.get('name', '') for c in (d.get('production_countries') or [])]
    countries = [_COUNTRY_SHORT.get(c, c) for c in raw_countries]
    return director, countries

def _fetch_movie_detail(tmdb_id):
    """Fetch full movie detail including credits in one call."""
    r = requests.get(
        f'https://api.themoviedb.org/3/movie/{tmdb_id}',
        params={'api_key': TMDB_KEY, 'append_to_response': 'credits'},
        headers=HEADERS, timeout=10)
    return r.json()

def _fetch_one_poster(film):
    title, year = film['title'], film['year']
    key = (title.lower(), year)

    # Hardcoded override for films that are ambiguous or TV-only
    if key in _FILM_TMDB_OVERRIDES:
        ov = _FILM_TMDB_OVERRIDES[key]
        if 'tv_id' in ov:
            try:
                r = requests.get(
                    f'https://api.themoviedb.org/3/tv/{ov["tv_id"]}/season/{ov["season"]}',
                    params={'api_key': TMDB_KEY}, headers=HEADERS, timeout=10)
                d = r.json()
                overview = d.get('overview') or None
                path = _best_poster_path(ov['tv_id'], media_type='tv', season=ov['season']) \
                       or d.get('poster_path')
                poster = f'https://image.tmdb.org/t/p/w342{path}' if path else None
                imdb_id = ov.get('imdb_id')
                imdb_url = f'https://www.imdb.com/title/{imdb_id}/' if imdb_id else None
                # Fetch TV show details for director/country
                tv_r = requests.get(f'https://api.themoviedb.org/3/tv/{ov["tv_id"]}',
                                    params={'api_key': TMDB_KEY, 'append_to_response': 'credits'},
                                    headers=HEADERS, timeout=10)
                tv_d = tv_r.json()
                directors = [c['name'] for c in tv_d.get('credits', {}).get('crew', [])
                             if c.get('job') == 'Director']
                director = directors[0] if directors else \
                           (tv_d.get('created_by') or [{}])[0].get('name')
                raw_countries = [c.get('name','') for c in tv_d.get('production_countries', [])]
                countries = [_COUNTRY_SHORT.get(c, c) for c in raw_countries]
                return {**film, 'poster': poster, 'overview': overview, 'imdb_url': imdb_url,
                        'director': director, 'countries': countries}
            except Exception:
                pass
        else:
            try:
                d = _fetch_movie_detail(ov['movie_id'])
                overview = d.get('overview') or None
                path = _best_poster_path(ov['movie_id']) or d.get('poster_path')
                poster = f'https://image.tmdb.org/t/p/w342{path}' if path else None
                imdb_id = _fetch_imdb_id(ov['movie_id'])
                imdb_url = f'https://www.imdb.com/title/{imdb_id}/' if imdb_id else None
                director, countries = _extract_movie_meta(d)
                return {**film, 'poster': poster, 'overview': overview, 'imdb_url': imdb_url,
                        'director': director, 'countries': countries}
            except Exception:
                pass

    result = None
    # 1. Exact year match
    result = _tmdb_search(title, year)
    # 2. Widen year by ±1
    if not result:
        result = _tmdb_search(title, year - 1) or _tmdb_search(title, year + 1)
    # 3. Strip leading article and retry
    if not result:
        alt = re.sub(r'^(The|A|An|La|Le|Les|L\'|Un|Une|Des|Il|Lo|El)\s+', '', title, flags=re.I)
        if alt != title:
            result = _tmdb_search(alt, year)
    # 4. No year constraint (last resort)
    if not result:
        result = _tmdb_search(title)

    if not result:
        return {**film, 'poster': None, 'overview': None, 'imdb_url': None,
                'director': None, 'countries': []}

    tmdb_id = result.get('id')
    try:
        d = _fetch_movie_detail(tmdb_id)
    except Exception:
        d = result
    overview = d.get('overview') or result.get('overview') or None
    path = _best_poster_path(tmdb_id) if tmdb_id else result.get('poster_path')
    poster = f'https://image.tmdb.org/t/p/w342{path}' if path else None
    imdb_id = _fetch_imdb_id(tmdb_id) if tmdb_id else None
    imdb_url = f'https://www.imdb.com/title/{imdb_id}/' if imdb_id else None
    director, countries = _extract_movie_meta(d)
    return {**film, 'poster': poster, 'overview': overview, 'imdb_url': imdb_url,
            'director': director, 'countries': countries}

SS250_DISK_CACHE = 'ss250_data.json'

def _load_ss250_from_disk():
    """Load pre-fetched SS250 data from disk. Returns list or None."""
    try:
        with open(SS250_DISK_CACHE, encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, list) and data:
            print(f'SS250: loaded {len(data)} films from disk cache')
            return data
    except Exception:
        pass
    return None

def _save_ss250_to_disk(data):
    """Persist SS250 data to disk for fast startup."""
    try:
        with open(SS250_DISK_CACHE, 'w', encoding='utf-8') as f:
            json.dump(data, f)
        print(f'SS250: saved {len(data)} films to disk cache')
    except Exception as e:
        print(f'SS250: failed to save disk cache: {e}')

def _build_ss250_cache():
    films = _load_ss250_from_js()
    if not films:
        return
    # Keep old cache as fallback so rate-limited fetches don't wipe good data
    old_cache = {f['title']: f for f in (_ss250_cache.get('data') or _load_ss250_from_disk() or [])}
    enriched = [None] * len(films)
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(_fetch_one_poster, f): i for i, f in enumerate(films)}
        for fut in as_completed(futures):
            enriched[futures[fut]] = fut.result()
    data = []
    for f in enriched:
        if not f:
            continue
        # If this rebuild lost a poster/director that the old cache had, keep the old values
        old = old_cache.get(f['title'])
        if old:
            if not f.get('poster') and old.get('poster'):
                f = {**f, 'poster': old['poster']}
            if not f.get('director') and old.get('director'):
                f = {**f, 'director': old['director'], 'countries': old.get('countries', [])}
        data.append(f)
    _ss250_cache['data'] = data
    _ss250_cache['fetched_at'] = time.time()
    _save_ss250_to_disk(data)
    print(f'SS250 poster cache built — {len(data)} films')

# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/api/loading-status')
def loading_status():
    return jsonify({
        'ready': _cache['data'] is not None,
        'done':  _loading_progress['done'],
        'total': _loading_progress['total'],
    })

@app.route('/api/showtimes')
def showtimes():
    return jsonify(_cache['data'] or {'events': [], 'errors': {}})

@app.route('/api/ss250')
def ss250_api():
    if _ss250_cache['data'] is None:
        # Try disk cache first — instant load
        disk = _load_ss250_from_disk()
        if disk:
            _ss250_cache['data'] = disk
            _ss250_cache['fetched_at'] = time.time()
            # Refresh from TMDB in background if disk cache is stale
            if time.time() - os.path.getmtime(SS250_DISK_CACHE) > SS250_CACHE_TTL:
                threading.Thread(target=_build_ss250_cache, daemon=True).start()
        else:
            # No disk cache — build synchronously on first hit
            _build_ss250_cache()
    elif time.time() - _ss250_cache['fetched_at'] > SS250_CACHE_TTL:
        # In-memory cache stale — refresh in background, serve existing data
        threading.Thread(target=_build_ss250_cache, daemon=True).start()
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
