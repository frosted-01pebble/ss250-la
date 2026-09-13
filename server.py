#!/usr/bin/env python3
"""
Backend scraper for LA arthouse theater showtimes.
Fetches: American Cinematheque (Aero + Egyptian), New Beverly Cinema, Vista Theatre.
Also serves the static frontend files.
Run: python3 server.py
"""

from flask import Flask, Response, jsonify, request, send_from_directory
from flask_compress import Compress
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import base64, json, re, traceback, threading, time, os, html as html_lib
from concurrent.futures import ThreadPoolExecutor, as_completed
import ssr
from datetime import datetime, date, timedelta

app = Flask(__name__, static_folder='.')
CORS(app)

# Cloudflare compresses what it sends to browsers, but the origin→Cloudflare hop
# was uncompressed — and that's the hop the host bills for. /api/showtimes alone
# was leaving here at 381KB to arrive as 36KB.
Compress(app)

# ── Cache ──────────────────────────────────────────────────────────────────────
_cache = {'data': None, 'fetched_at': 0}
CACHE_TTL = 3600  # refresh every hour
_loading_progress = {'status': 'idle', 'done': 0, 'total': 0}
EVENTS_DISK_CACHE = os.path.join(os.path.dirname(__file__), 'events_cache.json')

def _save_events_to_disk(data):
    try:
        with open(EVENTS_DISK_CACHE, 'w', encoding='utf-8') as f:
            json.dump(data, f)
    except Exception as e:
        print(f'Events: failed to save disk cache: {e}')

def _load_events_from_disk():
    try:
        with open(EVENTS_DISK_CACHE, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None

# Where a fresh container gets its first listings. A Railway deploy starts with
# no files, so there's no disk cache — but the previous deployment is still
# serving the site until this one passes its healthcheck.
SEED_URL = os.environ.get('SEED_URL', 'https://ss250la.com/api/showtimes')

def _seed_cache():
    """Start with the last listings in hand instead of none.

    Until the first scrape finishes (about a minute), an empty cache meant an
    empty server-rendered list for crawlers and a loading spinner for visitors
    after every deploy. This runs before the server opens its port, so /health
    can't pass — and Railway won't switch traffic — until it's done. The first
    scrape replaces this data as soon as it finishes.
    """
    data, source, fetched_at = _load_events_from_disk(), 'disk', None
    if data and data.get('events'):
        fetched_at = os.path.getmtime(EVENTS_DISK_CACHE)
    else:
        try:
            r = requests.get(SEED_URL, headers=HEADERS, timeout=10)
            r.raise_for_status()
            data, source = r.json(), SEED_URL
            fetched_at = data.get('fetched_at')
        except Exception as e:
            print(f'Seed: nothing on disk and {SEED_URL} failed: {e}', flush=True)
            return
    events = (data or {}).get('events') or []
    if not events:
        print(f'Seed: {source} had no listings', flush=True)
        return
    _cache['data'] = {'events': events, 'errors': data.get('errors') or {}}
    # Keep the listings' real age, so "Showtimes updated N min ago" stays honest
    _cache['fetched_at'] = fetched_at or time.time()
    print(f'Seed: {len(events)} events from {source}', flush=True)

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
    ss_list = _load_ss250_from_js()
    for ev in events:
        title = ev.get('title', '')
        if '/' not in title:
            continue
        sep = ' / ' if ' / ' in title else '/'
        parts = [p.strip() for p in title.split(sep)]
        enriched = []
        changed = False
        for part in parts:
            # The matcher rejects a half whose "(year)" isn't the S&S film's, and
            # TMDB's top hit for "Nosferatu" is the remake — so don't guess a
            # year for a half that is an S&S title. The listing shows the S&S
            # year for those anyway.
            if re.search(r'\(\d{4}\)', part) or ssr.find_ss_match(part, ss_list):
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

# ── Release years ──────────────────────────────────────────────────────────────
# Matching is by title, so a new film that shares a title with an S&S film
# ("RIVER", 2026, vs Renoir's The River) was listed as the classic. Each event
# carries the venue's own release year where one is available, and the matchers
# in ssr.py / app.js reject an S&S title whose year doesn't fit.

_ANNIVERSARY_RE = re.compile(r'\b(\d{1,3})(?:st|nd|rd|th)\s+Anniversary', re.I)

def _anniversary_year(text, date_str):
    """"30th Anniversary" on a 2026 screening → 1996."""
    m = _ANNIVERSARY_RE.search(text or '')
    if not m or not date_str:
        return None
    return int(date_str[:4]) - int(m.group(1))

_NEWBEV_YEAR_RE = re.compile(r'<dt>\s*Year\s*</dt>\s*<dd>\s*(\d{4})', re.I)
_newbev_year_cache = {}  # program url -> year or None

def _fetch_newbev_year(url):
    if url in _newbev_year_cache:
        return _newbev_year_cache[url]
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
    except Exception:
        return None  # don't cache a network failure
    m = _NEWBEV_YEAR_RE.search(r.text)
    year = int(m.group(1)) if m else None
    _newbev_year_cache[url] = year
    return year

def _fill_release_years(events):
    """Add a release year to single-film events whose scraper didn't supply one.

    New Beverly lists the year only on the program page, so those are fetched —
    but only for titles that look like S&S films, and cached by URL, so it's a
    handful of requests per refresh rather than one per listing.
    """
    ss_list = _load_ss250_from_js()
    newbev = []
    for ev in events:
        title = ev.get('title') or ''
        if ev.get('year') or '/' in title:
            continue
        year = _anniversary_year(title, ev.get('date'))
        if year:
            ev['year'] = year
        elif (ev.get('source') == 'newbeverly' and ev.get('url')
              and ssr.find_ss_match(ssr.strip_entities(title), ss_list)):
            newbev.append(ev)
    urls = list({ev['url'] for ev in newbev})
    with ThreadPoolExecutor(max_workers=6) as ex:
        years = dict(zip(urls, ex.map(_fetch_newbev_year, urls)))
    for ev in newbev:
        if years.get(ev['url']):
            ev['year'] = years[ev['url']]

# Theaters that publish no year (Laemmle, Vidiots, Alamo, Nuart, the Veezi
# venues...) get a title check instead. If TMDB knows another film by the same
# title as the S&S film, the listing's poster or its own page usually says which
# one it is. With no evidence either way, a same-titled film that is in its
# theatrical window is the likelier one to be playing.

_RIVALS_TTL = 86400  # re-search daily so new releases show up
_MAX_RIVALS = 8
_rivals_cache = {}     # S&S title -> (fetched_at, (S&S film's TMDB id, [rival dicts]))
_tmdb_meta_cache = {}  # (kind, TMDB id) -> images/credits json
_page_text_cache = {}  # listing url -> page text

# Signs a listing is a repertory screening rather than a new release: a film
# print, a restoration, or an anniversary
_REVIVAL_HINT_RE = re.compile(r'\b(35\s?mm|70\s?mm|16\s?mm|restor\w*|anniversary)\b', re.I)

_POSTER_TOKEN_RE = re.compile(r'/([A-Za-z0-9]{26,32})(?:-[a-z0-9]+)*\.(?:jpe?g|png|webp)\b', re.I)

def _ss_rivals(ss):
    """(TMDB id of the S&S film, other same-titled films on TMDB) for an S&S entry."""
    now = time.time()
    hit = _rivals_cache.get(ss['title'])
    if hit and now - hit[0] < _RIVALS_TTL:
        return hit[1]
    # "RIVER" matches The River, so search without the article too
    queries = {ss['title'], re.sub(r"^(the|a|an|la|le|les|l')\s+", '', ss['title'], flags=re.I)}
    found = {}
    for q in queries:
        for page in (1, 2):
            try:
                r = requests.get('https://api.themoviedb.org/3/search/movie',
                                 params={'api_key': TMDB_KEY, 'query': q, 'page': page},
                                 headers=HEADERS, timeout=10)
                results = r.json().get('results', [])
            except Exception:
                return (None, [])  # not cached — a failed lookup decides nothing
            for res in results:
                if (ssr.titles_match(ss['title'], res.get('title') or '')
                        or ssr.titles_match(ss['title'], res.get('original_title') or '')):
                    found[res['id']] = res
            if len(results) < 20:
                break

    ss_film, rivals = None, []
    for res in found.values():
        released = res.get('release_date') or ''
        if not re.match(r'\d{4}-\d{2}-\d{2}$', released):
            continue
        year = int(released[:4])
        if abs(year - ss['year']) <= ssr.YEAR_TOLERANCE:
            if ss_film is None or res.get('vote_count', 0) > ss_film.get('vote_count', 0):
                ss_film = res
        elif res.get('vote_count', 0) >= 1:
            # Zero-vote entries are mostly shorts and student films, not theatrical releases
            rivals.append({'id': res['id'], 'year': year, 'date': released,
                           'votes': res.get('vote_count', 0)})
    rivals.sort(key=lambda r: -r['votes'])
    value = (ss_film['id'] if ss_film else None, rivals)
    _rivals_cache[ss['title']] = (now, value)
    return value

def _tmdb_meta(kind, tmdb_id):
    key = (kind, tmdb_id)
    if key not in _tmdb_meta_cache:
        try:
            r = requests.get(f'https://api.themoviedb.org/3/movie/{tmdb_id}/{kind}',
                             params={'api_key': TMDB_KEY}, headers=HEADERS, timeout=10)
            r.raise_for_status()
            _tmdb_meta_cache[key] = r.json()
        except Exception:
            return {}
    return _tmdb_meta_cache[key]

def _tmdb_image_ids(tmdb_id):
    data = _tmdb_meta('images', tmdb_id)
    return {img['file_path'].strip('/').rsplit('.', 1)[0]
            for kind in ('posters', 'backdrops') for img in data.get(kind, [])
            if img.get('file_path')}

def _tmdb_directors(tmdb_id):
    return [c['name'] for c in _tmdb_meta('credits', tmdb_id).get('crew', [])
            if c.get('job') == 'Director' and c.get('name')]

def _page_text(url):
    if url not in _page_text_cache:
        try:
            r = requests.get(url, headers=HEADERS, timeout=10)
        except Exception:
            return ''
        text = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', r.text, flags=re.S | re.I)
        _page_text_cache[url] = html_lib.unescape(re.sub(r'<[^>]+>', ' ', text))
    return _page_text_cache[url]

def _recent_rival_year(rivals, date_str, before_days=180, after_days=365):
    """Year of a rival released within its theatrical window of the screening:
    up to ~6 months before, or up to a year after (festival premieres)."""
    try:
        screening = datetime.strptime(date_str or '', '%Y-%m-%d').date()
    except ValueError:
        return None
    for r in sorted(rivals, key=lambda r: r['date'], reverse=True):
        released = datetime.strptime(r['date'], '%Y-%m-%d').date()
        if -after_days <= (screening - released).days <= before_days:
            return r['year']
    return None

def _identify_listing(ev, ss, shared_urls):
    """Release year for a no-year listing of an S&S title, or None to leave it as is."""
    ss_id, rivals = _ss_rivals(ss)
    if not rivals:
        return None  # the title is unambiguous
    # Poster and director lookups cost a TMDB call per film, so check the
    # best-known rivals plus anything recent — a new release has few votes
    # ("RIVER", 2026, had 2) and would never make a votes-only cut.
    recent_cutoff = int((ev.get('date') or '0')[:4] or 0) - 1
    checked = rivals[:_MAX_RIVALS] + [r for r in rivals[_MAX_RIVALS:] if r['year'] >= recent_cutoff]
    candidates = [(tmdb_id, year) for tmdb_id, year in
                  [(ss_id, ss['year'])] + [(r['id'], r['year']) for r in checked] if tmdb_id]

    # Culver and Vidiots use TMDB's own poster files
    m = _POSTER_TOKEN_RE.search(ev.get('poster') or '')
    if m:
        for tmdb_id, year in candidates:
            if m.group(1) in _tmdb_image_ids(tmdb_id):
                return year

    # A director named on the listing's own page (Laemmle, Brain Dead, ...).
    # Skip URLs shared by several titles — a theater homepage says nothing.
    url = ev.get('url') or ''
    if url and url not in shared_urls:
        text = _page_text(url)
        named = {year for tmdb_id, year in candidates
                 if any(re.search(r'\b' + re.escape(d) + r'\b', text, re.I)
                        for d in _tmdb_directors(tmdb_id))}
        # Venue metadata can carry the wrong film's credits (Old Town's 1922
        # Nosferatu page lists the 2024 remake's director), so the S&S film's
        # year on the page counts too — conflicting evidence is no evidence.
        if re.search(r'\b%d\b' % ss['year'], text):
            named.add(ss['year'])
        if len(named) == 1:
            return named.pop()

    if _REVIVAL_HINT_RE.search(f"{ev.get('title') or ''} {ev.get('format') or ''}"):
        return ss['year']

    return _recent_rival_year(rivals, ev.get('date'))

def _identify_yearless_listings(events):
    ss_list = _load_ss250_from_js()
    titles_by_url = {}
    for ev in events:
        titles_by_url.setdefault(ev.get('url'), set()).add(ev.get('title'))
    shared_urls = {url for url, titles in titles_by_url.items() if len(titles) > 1}

    todo = []
    for ev in events:
        title = ev.get('title') or ''
        if ev.get('year') or '/' in title:
            continue
        ss = ssr.find_ss_match(ssr.strip_entities(title), ss_list)
        if ss:
            todo.append((ev, ss))
    with ThreadPoolExecutor(max_workers=6) as ex:
        years = list(ex.map(lambda p: _identify_listing(p[0], p[1], shared_urls), todo))
    for (ev, _), year in zip(todo, years):
        if year:
            ev['year'] = year

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
        ('finearts',             fetch_fine_arts_events),
        ('gardena',              fetch_gardena_events),
        ('vidiots',              fetch_vidiots_events),
        ('alamo',                fetch_alamo_events),
        ('oldtownmusichall',     fetch_oldtownmusichall_events),
        ('culver',               fetch_culver_events),
        ('laemmle',              fetch_laemmle_events),
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

    # Preserve today's events from the previous cache (in-memory or disk) that the
    # fresh fetch may have dropped — handles both mid-day venue API removals and
    # cold starts after a server restart.
    _EXHIBITION_PREFIXES = ('Calm Morning:', 'Family Matinee Series:')
    prev_data = _cache.get('data') or _load_events_from_disk()
    if prev_data:
        new_keys = {(e['theater'], e['title'], e['date']) for e in results['events']}
        for ev in prev_data.get('events', []):
            t = ev.get('title', '')
            if any(t.startswith(p) for p in _EXHIBITION_PREFIXES):
                continue  # never restore exhibition events
            if ev.get('date') == today_str and (ev['theater'], t, ev['date']) not in new_keys:
                results['events'].append(ev)

    _enrich_double_features(results['events'])
    _fill_release_years(results['events'])
    _identify_yearless_listings(results['events'])
    _cache['data'] = results
    _cache['fetched_at'] = time.time()
    _save_events_to_disk(results)
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

            # Release year of the film (single-film events only — for a double
            # feature it can't say which half it describes)
            details = acf.get('event_details') or {}
            year = None
            if '/' not in title and isinstance(details, dict):
                ym = re.search(r'\b(1[89]\d\d|20\d\d)\b', str(details.get('release_year') or ''))
                year = int(ym.group(1)) if ym else None

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
                    'year':    year,
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

        # Default 35mm; override only if an explicit format is noted in the title
        fmt_m = re.search(r'\b(70mm|16mm|DCP|digital|4K|IMAX)\b', title, re.IGNORECASE)
        fmt = fmt_m.group(1) if fmt_m else '35mm'

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
            'format':  fmt,
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
        # Skip exhibition/educational series that are not film screenings
        _EXHIBITION_PREFIXES = ('Calm Morning:', 'Family Matinee Series:')
        if any(title.startswith(p) for p in _EXHIBITION_PREFIXES):
            continue

        img       = prog.get('image') or {}
        poster    = img.get('url') if isinstance(img, dict) else None
        tk_id     = prog.get('ticketureIdProduction') or prog.get('ticketureId') or ''
        slug      = prog.get('slug') or ''
        url       = f'https://www.academymuseum.org/programs/detail/{slug}' if slug else \
                    'https://www.academymuseum.org/en/calendar'
        fmt       = prog.get('filmFormat1') or prog.get('filmFormat2') or ''

        # filmMetadata1 reads "1979 | 161 min | USSR | ..." — skip programs with
        # a second film, where one year can't describe the event
        meta = prog.get('filmMetadata1') or {}
        meta_text = _extract_rich_text(meta.get('json') if isinstance(meta, dict) else None)
        ym = re.match(r'\s*(\d{4})\s*\|', meta_text)
        year = int(ym.group(1)) if ym and not prog.get('filmMetadata2') else None

        candidates.append({'title': title, 'd0': d0, 'd1': d1,
                           'tk_id': tk_id, 'url': url,
                           'poster': poster, 'format': fmt, 'year': year})

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
                'year':    c['year'],
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

def _fetch_nuart_session_times(movie_ids, last_day):
    """{(movie_id, 'YYYY-MM-DD'): ['5:10 PM', ...]} from Landmark's schedule API.

    One plain request covers every film and date. This used to drive headless
    Chromium through each film page, clicking date buttons to catch this same
    response — slow, and on Railway it came back empty, so Nuart showed no times.
    """
    if not movie_ids:
        return {}
    theater = json.dumps({'id': 'X00CW', 'timeZone': 'America/Los_Angeles'}, separators=(',', ':'))
    # Days run 3am to 3am, as the site requests them, so after-midnight shows
    # stay with the evening they belong to. Start from today in Pacific time.
    params = ([('from', f'{ssr.today_str()}T03:00:00'),
               ('to', f'{(date.fromisoformat(last_day) + timedelta(days=1)).isoformat()}T03:00:00'),
               ('theaters', theater)]
              + [('movieIds', mid) for mid in movie_ids])
    try:
        r = requests.get('https://www.landmarktheatres.com/api/gatsby-source-boxofficeapi/schedule',
                         params=params, headers=HEADERS, timeout=30)
        schedule = ((r.json() or {}).get('X00CW') or {}).get('schedule') or {}
    except Exception as e:
        print(f'Nuart: schedule request failed: {e}')
        return {}

    result = {}
    for mid, dates in schedule.items():
        if not isinstance(dates, dict):
            continue
        for d_str, sessions in dates.items():
            starts = sorted(s['startsAt'] for s in (sessions or [])
                            if isinstance(s, dict) and s.get('startsAt') and not s.get('isExpired'))
            times = []
            for starts_at in starts:
                try:
                    dt = datetime.fromisoformat(starts_at)
                    t_str = f"{dt.hour % 12 or 12}:{dt.strftime('%M')} {'AM' if dt.hour < 12 else 'PM'}"
                except ValueError:
                    t_str = starts_at[11:16]
                if t_str not in times:
                    times.append(t_str)
            if times:
                result[(str(mid), d_str)] = times
    return result


def _nuart_movie_paths():
    """Movie id -> page path ("5120" -> "/movies/5120-singin-in-the-rain-1952/").

    Read from the sitemap. The old source, a Gatsby static-query file named by a
    content hash, silently 404'd once the site rebuilt, which left every Nuart
    listing linking to the theater page. The exact path matters: /movies/5120/
    renders an empty page.
    """
    try:
        r = requests.get('https://www.landmarktheatres.com/sitemap-0.xml',
                         headers=HEADERS, timeout=15)
    except Exception:
        return {}
    return {mid: path for path, mid in re.findall(
        r'<loc>https://www\.landmarktheatres\.com(/movies/(\d+)-[^<]*)</loc>', r.text)}


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

    # Step 3: session times for every film and date, in one request
    last_day = max(d for days in upcoming.values() for d in days)
    session_times = _fetch_nuart_session_times([str(mid) for mid in upcoming], last_day)

    # Step 4: build events
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

        for d in days:
            times = session_times.get((mid_str, d), [])
            # The film page opens on the Nuart's showtimes for that date
            url = (f'https://www.landmarktheatres.com{path}?theater=X00CW&date={d}' if path
                   else 'https://www.landmarktheatres.com/theaters/x00cw-landmark-nuart-theatre-west-los-angeles')
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


_FA_SITETOKEN     = 'tez3prscsvfbagchhkxbevjwk8'
_GARDENA_SITETOKEN = 'he5nsxynkgmw2w1wvfey3mvh64'

def fetch_fine_arts_events():
    """Fine Arts Theatre Beverly Hills — Veezi HTML sessions page.

    Title conventions are inconsistent:
      - "Wednesday with Welles VII/The Third Man"       → film after '/'
      - "2001 (70mm)-2010 Double Feature (Digital)"     → film before '-NNN Double Feature'
      - "Babylon 70mm"                                  → format suffix on plain title
      - "The Godfather"                                 → no format → Digital (default)
    """
    url = f'{_VISTA_BASE}/sessions/?siteToken={_FA_SITETOKEN}'
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
            raw_title = title_el.get_text(strip=True) if title_el else ''

            # Slash notation — keep only the film part after the last '/'
            working = raw_title.split('/')[-1].strip() if '/' in raw_title else raw_title

            # Detect format anywhere in the full raw title
            fmt_m = re.search(r'\b(70mm|35mm|16mm)\b', raw_title, re.IGNORECASE)
            fmt = fmt_m.group(1) if fmt_m else 'Digital'

            # Detect "FILM1 (FMT1)-FILM2 Double Feature" to preserve both films
            dash_df = re.match(
                r'^(.+?)\s*(?:\([^)]*\))?\s*-\s*(.+?)\s+double feature',
                working, re.IGNORECASE
            )
            if dash_df:
                film1 = re.sub(r'\s*\([^)]*\)', '', dash_df.group(1)).strip()
                film1 = re.sub(r'\s+\d+mm\s*$', '', film1, flags=re.IGNORECASE).strip()
                film2 = re.sub(r'\s*\([^)]*\)', '', dash_df.group(2)).strip()
                film2 = re.sub(r'\s+\d+mm\s*$', '', film2, flags=re.IGNORECASE).strip()
                title = f'{film1} / {film2}'
            else:
                # Clean working title: strip parenthetical annotations and format suffix
                title = re.sub(r'\s*\([^)]*\)', '', working).strip()
                title = re.sub(r'\s+\d+mm\s*$', '', title, flags=re.IGNORECASE).strip()

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
                        'title': title, 'date': date_str, 'fmt': fmt,
                        'times': [], 'url': sess_url, 'poster': poster,
                    }
                if time_str and time_str not in groups[key]['times']:
                    groups[key]['times'].append(time_str)

    return [
        {
            'theater': 'Fine Arts Theatre',
            'title':   g['title'],
            'date':    g['date'],
            'times':   g['times'],
            'format':  g['fmt'],
            'url':     g['url'],
            'poster':  g.get('poster'),
            'source':  'finearts',
        }
        for g in groups.values() if g['date']
    ]


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


def fetch_oldtownmusichall_events():
    """Old Town Music Hall (El Segundo) — GraphQL API behind their current site
    (an "Indy Systems" cinema platform; the old tickets.oldtownmusichall.org
    subdomain from a prior platform is dead). One request returns every
    upcoming showing for the site; no session/cookies needed, just the
    site-id/client-type headers the frontend itself sends."""
    from datetime import timezone, timedelta as td

    query = ('query { showingsForDate(siteIds: [321]) { data { '
             'id time movie { name urlSlug posterImage synopsis } } } }')
    headers = {
        **HEADERS,
        'Content-Type': 'application/json',
        'client-type': 'consumer',
        'site-id': '321',
    }
    try:
        r = requests.post('https://www.oldtownmusichall.org/graphql',
                          json={'query': query}, headers=headers, timeout=20)
        showings = r.json().get('data', {}).get('showingsForDate', {}).get('data', []) or []
    except Exception:
        return []

    events = []
    for s in showings:
        movie = s.get('movie') or {}
        title = movie.get('name')
        time_raw = s.get('time')
        if not title or not time_raw:
            continue

        dt_utc = datetime.fromisoformat(time_raw.replace('Z', '+00:00'))
        offset = td(hours=-7) if 3 <= dt_utc.month <= 10 else td(hours=-8)
        dt_local = dt_utc.astimezone(timezone(offset))

        poster_id = movie.get('posterImage')
        poster = f'https://indy-systems.imgix.net/{poster_id}?w=342' if poster_id else None
        url_slug = movie.get('urlSlug')
        url = (f'https://www.oldtownmusichall.org/movie/{url_slug}' if url_slug
               else 'https://www.oldtownmusichall.org/all-programs/')

        # The synopsis opens with the year ("1922 - Silent • ..."). Their
        # releaseDate field is not reliable: Nosferatu's is the 2024 remake's.
        synopsis = html_lib.unescape(re.sub(r'<[^>]+>', '', movie.get('synopsis') or ''))
        ym = re.match(r'\s*(\d{4})\b', synopsis)

        events.append({
            'theater': 'Old Town Music Hall',
            'title':   title,
            'date':    dt_local.strftime('%Y-%m-%d'),
            'times':   [dt_local.strftime('%-I:%M %p')],
            'format':  '',
            'url':     url,
            'poster':  poster,
            'source':  'oldtownmusichall',
            'year':    int(ym.group(1)) if ym else None,
        })
    return events


# Known event-series prefixes at The Culver Theater — strip to get bare film title
_CULVER_PREFIXES = (
    'Sunday Matinee: ', 'Movie-Mad Mondays: ', 'Hellraisers Film Club Presents: ',
    'From Culver with Love: ', 'Alula FF: ', 'FanMail Cinema Club Presents: ',
    'Rewind or Die: ', 'Hellraisers: ', 'From Culver With Love: ',
)

_CULVER_BASE = 'https://web.theculvertheater.com'
_REVIVALHOUSES_KEY = b'RHs'

def _culver_film_url(anchor_attrs):
    """The film's own page on the Culver site, e.g. /films/Movie-Mad-Mondays-Stalker/HO00000709.

    RevivalHouses' visible link is just the theater homepage; the real one is in
    the title link's data-f attribute, base64 XOR'd with a short repeating key
    that their script decodes on click. Returns None if it's absent or no longer
    decodes to a film path (say, the key changes), so the listing keeps its old link.
    """
    m = re.search(r'data-f="([^"]+)"', anchor_attrs or '')
    if not m:
        return None
    try:
        raw = base64.b64decode(m.group(1))
        path = bytes(b ^ _REVIVALHOUSES_KEY[i % len(_REVIVALHOUSES_KEY)]
                     for i, b in enumerate(raw)).decode('utf-8')
    except Exception:
        return None
    if not re.fullmatch(r'/films/[\w\-.%]+/HO\d+', path):
        return None
    return _CULVER_BASE + path

def fetch_culver_events():
    """The Culver Theater (Culver City) — scraped via RevivalHouses.com.
    The theater's own site (web.theculvertheater.com) blocks server-side access
    via Cloudflare WAF; RevivalHouses aggregates their classic/specialty listings."""
    today = date.today()
    today_str = today.strftime('%Y-%m-%d')

    r = requests.get(
        'https://www.revivalhouses.com/theaters/the-culver-theater/',
        headers=HEADERS, timeout=20
    )

    pattern = re.compile(
        r'<img[^>]+src="([^"]+)"[^>]*>.*?'
        r'<a\b([^>]*)>\s*<cite>([^<]+)</cite>.*?'
        r'Movie__time--date\">([^<]+)</p>.*?'
        r'<time>([^<]+)</time>(.*?)'
        r'href="(https://web\.theculvertheater[^"]+)"',
        re.DOTALL
    )

    events = []
    for m in pattern.finditer(r.text):
        raw_poster, title_link_attrs, raw_title, raw_date, raw_time, note, url = m.groups()
        url = _culver_film_url(title_link_attrs) or url

        # Strip series prefix to get bare film title
        title = raw_title.strip()
        for prefix in _CULVER_PREFIXES:
            if title.startswith(prefix):
                title = title[len(prefix):].strip()
                break

        # Parse "Sun, Mar 29" → YYYY-MM-DD
        dm = re.match(r'\w+,\s*(\w+ \d+)', raw_date.strip())
        if not dm:
            continue
        try:
            d = datetime.strptime(f'{dm.group(1)} {today.year}', '%b %d %Y').date()
            if d < today:
                d = datetime.strptime(f'{dm.group(1)} {today.year + 1}', '%b %d %Y').date()
        except ValueError:
            continue
        if d.strftime('%Y-%m-%d') < today_str:
            continue

        # Only keep TMDB poster URLs (skip local RevivalHouses placeholders)
        poster = raw_poster.strip() if raw_poster.startswith('https://image.tmdb.org') else None

        events.append({
            'theater': 'Culver Theater',
            'title':   title,
            'date':    d.strftime('%Y-%m-%d'),
            'times':   [raw_time.strip().upper()],
            'format':  '',
            'url':     url,
            'poster':  poster,
            'source':  'culver',
            # Notes like "30th Anniversary." are the only year hint here
            'year':    _anniversary_year(note, d.strftime('%Y-%m-%d')),
        })
    return events


# Physical Laemmle locations — (display name, site slug).
# Claremont 5 is excluded: sold and closed as of Jan 2026 (laemmle.com/blog).
LAEMMLE_THEATERS = [
    ('Laemmle Royal',              'royal'),
    ('Laemmle Monica Film Center', 'monica-film-center'),
    ('Laemmle Glendale',           'glendale'),
    ('Laemmle Town Center 5',      'town-center-5'),
    ('Laemmle Newhall',            'newhall'),
    ('Laemmle NoHo 7',             'noho-7'),
]

def _fetch_laemmle_day(theater_name, slug, date_str):
    """One theater, one date — laemmle.com renders showtimes server-side per day
    (Drupal), with no broader-range API available."""
    try:
        r = requests.get(
            f'https://www.laemmle.com/theater/{slug}',
            params={'date': date_str}, headers=HEADERS, timeout=20
        )
    except Exception:
        return []
    if r.status_code != 200:
        return []

    soup = BeautifulSoup(r.text, 'html.parser')
    events = []
    for movie in soup.select('div.movie'):
        title_a = movie.select_one('.title > a')
        if not title_a:
            continue
        title = title_a.get_text(strip=True)
        if not title:
            continue
        href = title_a.get('href') or ''
        url = f'https://www.laemmle.com{href}' if href.startswith('/') else href

        img = movie.select_one('.poster img')
        poster = img['src'] if img and img.get('src') else None

        # Elapsed showtimes render as a bare <span>, not a ticket <a> — this
        # selector naturally excludes them.
        times = [a.get_text(strip=True).upper() for a in movie.select('.showtimes .showtime a')]
        if not times:
            continue

        events.append({
            'theater': theater_name,
            'title':   title,
            'date':    date_str,
            'times':   times,
            'format':  '',
            'url':     url,
            'poster':  poster,
            'source':  'laemmle',
        })
    return events


def fetch_laemmle_events():
    """Laemmle Theatres — 7 LA County arthouse locations. Mostly first-run, but
    the Anniversary Classics series occasionally screens Sight & Sound-caliber
    revivals, so all daily programming is pulled and matched client-side."""
    today = date.today()
    days = [(today + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(21)]
    tasks = [(name, slug, d) for name, slug in LAEMMLE_THEATERS for d in days]

    events = []
    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = [ex.submit(_fetch_laemmle_day, name, slug, d) for name, slug, d in tasks]
        for fut in as_completed(futures):
            events.extend(fut.result() or [])
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

@app.after_request
def no_index_api(resp):
    # The frontend is client-rendered, so Googlebot has to fetch /api/ to see any
    # content at all — robots.txt must not block it. Mark the JSON noindex instead
    # so it's crawlable for rendering but never surfaces as its own search result.
    if request.path.startswith('/api/') or request.path == '/health':
        resp.headers['X-Robots-Tag'] = 'noindex'
    return resp

@app.route('/api/loading-status')
def loading_status():
    return jsonify({
        'ready': _cache['data'] is not None,
        'done':  _loading_progress['done'],
        'total': _loading_progress['total'],
    })

@app.route('/api/showtimes')
def showtimes():
    data = _cache['data'] or {'events': [], 'errors': {}}
    # fetched_at lets the page say how fresh the showtimes are
    return jsonify({**data, 'fetched_at': int(_cache['fetched_at']) or None})

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
_ssr_ss250 = None  # canonical rank/title/year list, parsed once

@app.route('/')
def index():
    """Serve the homepage with the upcoming screenings pre-rendered into the HTML.

    The page is otherwise client-rendered, which left crawlers indexing an empty
    shell. app.js overwrites #theater-detail on its first render, so this is a
    snapshot the interactive version replaces.

    Any failure falls back to the plain shell — pre-rendering is an enhancement
    for crawlers and first paint, never a reason for the page not to load.
    """
    global _ssr_ss250
    try:
        with open('index.html', encoding='utf-8') as f:
            html = f.read()
        if _ssr_ss250 is None:
            _ssr_ss250 = _load_ss250_from_js()
        events = (_cache['data'] or {}).get('events') or []
        html = ssr.inject(html, events, _ssr_ss250, _cache['fetched_at'])
        return Response(html, mimetype='text/html')
    except Exception:
        traceback.print_exc()
        return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    # Serve the last listings until the first scrape lands (before the port opens)
    _seed_cache()

    # Start background refresh thread (daemon so it dies with the process)
    t = threading.Thread(target=_refresh_loop, daemon=True)
    t.start()

    port = int(os.environ.get('PORT', 5001))
    print(f'Starting SS250 server on http://localhost:{port}')
    app.run(host='0.0.0.0', port=port, debug=False)
