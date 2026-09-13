#!/usr/bin/env python3
"""
Server-side rendering of the "All Upcoming" screenings list.

The frontend is entirely client-rendered, so the HTML served to a crawler was a
header, two empty divs, and a footer — no film titles at all. Googlebot runs JS
only on a second, slower pass, so the site's actual content was effectively
invisible to search. This module renders the same list into the initial HTML.

It mirrors the matching rules in app.js (normalizeTitle / TITLE_ALIASES /
findSSMatchByTitle). Those are ported rather than shared, so if you change the
matching logic in app.js, change it here too — a drift shows up as the
pre-JS list disagreeing with the post-JS one.

app.js replaces #theater-detail wholesale on its first render, so this markup is
a static snapshot that the interactive version overwrites. It deliberately omits
the interactive pieces (double-bill grouping, ON FILM filter, show-more).
"""

import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

# The site is about LA screenings, so "today" is always Pacific — not the
# server's clock, which on Railway is UTC and would drop the evening's shows.
#
# This runs at import, so a missing tz database would take the whole server down
# rather than skew a date. requirements.txt pins tzdata to guarantee it's there;
# the fallback means a base-image change degrades the cutoff by a few hours
# instead of returning 500s.
try:
    PACIFIC = ZoneInfo('America/Los_Angeles')
except Exception:
    PACIFIC = timezone.utc

# Cap on rendered rows. The list is a crawlable snapshot, not the live UI, and
# every row is markup shipped on each request.
MAX_ROWS = 60


def today_str():
    return datetime.now(PACIFIC).strftime('%Y-%m-%d')


# ── Title matching (ported from app.js) ───────────────────────────────────────

# JS `\w` is ASCII-only without the /u flag, so accented characters are stripped
# there. The character class below is spelled out to reproduce that exactly —
# Python's \w would keep them and quietly desync the two lists.
_ARTICLE_RE = re.compile(r"^(the|a|an|la|le|les|l'|un|une|des)\s+", re.I)
_NONWORD_RE = re.compile(r'[^A-Za-z0-9_\s]')
_SPACE_RE = re.compile(r'\s+')


def normalize_title(t):
    t = (t or '').lower()
    t = _ARTICLE_RE.sub('', t)
    t = _NONWORD_RE.sub('', t)
    t = _SPACE_RE.sub(' ', t)
    return t.strip()


TITLE_ALIASES = {
    "jeanne dielman 23 quai du commerce 1080 bruxelles": ["jeanne dielman"],
    "regle du jeu":            ["the rules of the game", "rules of the game"],
    "cleo from 5 to 7":        ["cleo de 5 a 7"],
    "400 blows":               ["les quatre cents coups", "four hundred blows"],
    "latalante":               ["atalante"],
    "man with a movie camera": ["chelovek s kino-apparatom"],
    "passion of joan of arc":  ["la passion de jeanne darc"],
    "au hasard balthazar":     ["balthazar"],
    "8":                       ["otto e mezzo", "8 1/2", "federico fellini 8"],
    "andrei rublev":           ["andrei rublyov"],
    "bicycle thieves":         ["ladri di biciclette", "bicycle thief"],
    "dolce vita":              ["la dolce vita"],
    "avventura":               ["lavventura"],
    "conformist":              ["il conformista"],
    "leopard":                 ["il gattopardo"],
    "spirit of beehive":       ["el espiritu de la colmena"],
    "spirit of the beehive":   ["el espiritu de la colmena"],
    "werckmeister harmonies":  ["werckmeister harmoniák"],
    "colour of pomegranates":  ["sayat nova", "color of pomegranates"],
    "touki bouki":             ["journey of the hyena"],
    "ugetsu monogatari":       ["ugetsu"],
    "memories of underdevelopment": ["memorias del subdesarrollo"],
    "gospel according to st matthew": ["il vangelo secondo matteo", "gospel according to matthew"],
    "eclisse":                 ["leclisse", "eclipse"],
    "mepris":                  ["contempt", "le mepris"],
    "mulholland dr":           ["mulholland drive"],
    "beau travail":            ["beau work"],
    "satantango":              ["satantango", "the satan tango"],
    "vivre sa vie":            ["my life to live"],
    "bout de souffle":         ["breathless", "a bout de souffle"],
    "close-up":                ["close up", "nema-ye nazdik"],
    "night of the hunter":     ["the night of the hunter"],
    "ali fear eats the soul":  ["fear eats the soul", "angst essen seele auf"],
    "2001 a space odyssey":    ["2001"],
    "my neighbour totoro":     ["my neighbor totoro"],
}


def titles_match(ss_title, other):
    ss_norm = normalize_title(ss_title)
    other_norm = normalize_title(other)
    if ss_norm == other_norm:
        return True
    for alias in TITLE_ALIASES.get(ss_norm, []):
        if normalize_title(alias) == other_norm:
            return True
    return False


_FORMAT_SUFFIX_RE = re.compile(
    r'\s+in\s+(35mm|70mm|16mm|4k|DCP|HD|IMAX|digital)(\s+.*)?$', re.I)
_PARENS_RE = re.compile(r'\s*\([^)]+\)')


def _strip_formats(t):
    return _FORMAT_SUFFIX_RE.sub('', t).strip()


def _strip_parens(t):
    return _PARENS_RE.sub('', t).strip()


# A same-titled film from another year is not the S&S film: "RIVER" (2026) is not
# Renoir's The River (1951). A little slack covers festival-vs-release dates.
YEAR_TOLERANCE = 2

_PAREN_YEAR_RE = re.compile(r'\((\d{4})\)')

# What follows " with " in a real screening of the film — "Nosferatu with Live
# Orchestra". Anything else is probably the rest of a different film's title:
# "The Thing with Two Heads" is not The Thing.
_WITH_EXTRAS_RE = re.compile(
    r'\b(live|orchestra|quarkestra|score|q\s*&\s*a|in person|intro|guest|director|'
    r'filmmaker|cast|crew|discussion|conversation|panel|accompaniment|organ|'
    r'wurlitzer|special)', re.I)


def _paren_year(t):
    years = set(_PAREN_YEAR_RE.findall(t))
    return int(years.pop()) if len(years) == 1 else None


def _year_ok(ss, year):
    return not year or abs(ss['year'] - year) <= YEAR_TOLERANCE


def _matches_any_ss_title(t, ss_list):
    bare = _strip_parens(_strip_formats(t))
    return any(titles_match(ss['title'], bare) for ss in ss_list)


def _title_variants(t, ss_list):
    """Candidate film titles within one listing title (or one double-bill half).

    Handles "in 35mm" suffixes, "(Alt Title)" parentheticals, "Series Name: Film"
    prefixes, and "with"/"+"/"&" combined programs. Order matters: variants are
    tried in insertion order, mirroring the JS Set.
    """
    variants = []

    def add(v):
        v = (v or '').strip()
        if v and v not in variants:
            variants.append(v)

    add(t)
    add(_strip_formats(t))
    add(_strip_parens(t))
    add(_strip_parens(_strip_formats(t)))

    colon = t.find(': ')
    if colon > 0:
        after = t[colon + 2:].strip()
        add(after)
        add(_strip_formats(after))
        add(_strip_parens(after))

    clean_for_split = _strip_parens(t)
    for sep in (' with ', ' + ', ' & '):
        if sep in t:
            src = t
        elif sep in clean_for_split:
            src = clean_for_split
        else:
            continue
        parts = src.split(sep)
        for i, part in enumerate(parts):
            if sep == ' with ' and i < len(parts) - 1:
                rest = sep.join(parts[i + 1:])
                if not _WITH_EXTRAS_RE.search(rest) and not _matches_any_ss_title(rest, ss_list):
                    continue
            part = part.strip()
            add(part)
            add(_strip_parens(part))
            add(_strip_formats(part))
            add(_strip_parens(_strip_formats(part)))
    return variants


def find_ss_match(raw_title, ss_list, year=None):
    """Match a scraped listing title against the S&S list.

    `year` is the release year the venue gives for the film, if any. A double
    bill is matched half by half, each half checked against its own "(1972)"
    annotation, since a single event year can't say which half it belongs to.
    """
    has_slash = '/' in raw_title
    whole_year = _paren_year(raw_title)
    if whole_year is None and not has_slash:
        whole_year = year
    segments = [(raw_title, whole_year)]
    if has_slash:
        seen = {raw_title}
        for sep in (' / ', '/'):
            if sep not in raw_title:
                continue
            for seg in raw_title.split(sep):
                seg = seg.strip()
                if seg and seg not in seen:
                    seen.add(seg)
                    segments.append((seg, _paren_year(seg)))

    for seg, seg_year in segments:
        for v in _title_variants(seg, ss_list):
            for ss in ss_list:
                if titles_match(ss['title'], v) and _year_ok(ss, seg_year):
                    return ss
    return None


_ENTITY_NUM_RE = re.compile(r'&#(\d+);')


def strip_entities(s):
    s = _ENTITY_NUM_RE.sub(lambda m: chr(int(m.group(1))), s or '')
    for a, b in (('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'), ('&quot;', '"')):
        s = s.replace(a, b)
    return s


def esc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('"', '&quot;'))


# ── Rendering ─────────────────────────────────────────────────────────────────

def format_date(date_str, today):
    try:
        d = datetime.strptime(date_str, '%Y-%m-%d').date()
        t = datetime.strptime(today, '%Y-%m-%d').date()
    except ValueError:
        return date_str
    diff = (d - t).days
    if diff == 0:
        return 'Today'
    if diff == 1:
        return 'Tomorrow'
    return d.strftime('%a, %b ') + str(d.day)


def upcoming_matches(events, ss_list, today):
    """Events from today forward that match an S&S film, sorted by date then rank."""
    matches = []
    for ev in events or []:
        date = ev.get('date') or ''
        if date < today:
            continue
        ss = find_ss_match(strip_entities(ev.get('title') or ''), ss_list, ev.get('year'))
        if ss:
            matches.append((ev, ss))
    matches.sort(key=lambda m: (m[0].get('date') or '', m[1].get('rank') or 0))
    return matches


def _row_html(ev, ss, today):
    # Same grid items as app.js's buildSingleRow, so the pre-JS list lays out
    # on the same lines as the interactive one that replaces it
    times = ', '.join(ev.get('times') or [])
    fmt = ' / '.join(p.strip() for p in (ev.get('format') or '').split(',') if p.strip())
    details = ''
    if ev.get('theater'):
        details += f'<span class="screening-theater">{esc(ev["theater"])}</span>'
    if times:
        details += f'<span class="screening-time">{esc(times)}</span>'
    if fmt:
        details += f'<span class="screening-format">{esc(fmt)}</span>'
    return (
        f'<a class="screening-row" href="{esc(ev.get("url") or "/")}" target="_blank" rel="noopener">'
        f'<div class="screening-date-col">'
        f'<span class="screening-date">{esc(format_date(ev.get("date") or "", today))}</span></div>'
        f'<span class="screening-rank">#{esc(ss.get("rank"))}</span>'
        f'<div class="screening-title"><em>{esc(ss["title"])}</em> '
        f'<span class="screening-year">({esc(ss.get("year"))})</span></div>'
        f'{details}</a>'
    )


def render_detail(events, ss_list, today=None):
    """Render the pre-JS #theater-detail contents. Empty string if there's nothing."""
    today = today or today_str()
    matches = upcoming_matches(events, ss_list, today)
    if not matches:
        return ''
    rows = ''.join(_row_html(ev, ss, today) for ev, ss in matches[:MAX_ROWS])
    return (
        '<div class="detail-header"><div class="detail-header-left">'
        '<div class="detail-title-row"><div class="detail-theater-name">All Upcoming</div></div>'
        '<div class="detail-meta">Every Sight &amp; Sound screening across all LA venues</div>'
        '</div></div>'
        f'<div class="screening-list">{rows}</div>'
    )


_DETAIL_DIV_RE = re.compile(
    r'<div id="theater-detail"[^>]*></div>')

# Matching every scraped event against 264 films takes the better part of a
# second — far too slow to redo on every request. The output only changes when
# the scraper refreshes or the Pacific date rolls over, so key on exactly those.
_render_cache = {'key': None, 'html': ''}


def render_detail_cached(events, ss_list, version, today=None):
    today = today or today_str()
    key = (version, today)
    if _render_cache['key'] == key:
        return _render_cache['html']
    html = render_detail(events, ss_list, today)
    _render_cache['key'], _render_cache['html'] = key, html
    return html


def inject(html, events, ss_list, version=0, today=None):
    """Put the rendered list inside #theater-detail and unhide it.

    Returns the page unchanged if there's nothing to render (e.g. the scraper
    cache is still warming up on a cold boot), so the client-side path still
    works exactly as before.
    """
    body = render_detail_cached(events, ss_list, version, today)
    if not body:
        return html
    return _DETAIL_DIV_RE.sub(
        f'<div id="theater-detail" class="theater-detail">{body}</div>', html, count=1)
