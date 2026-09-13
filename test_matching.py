#!/usr/bin/env python3
"""
Regression checks for matching listing titles to S&S films.

    python3 test_matching.py

The matcher exists twice — ssr.py (server-rendered list) and app.js (the live
page) — so every case runs against both, and app.js runs under node. Add a case
here whenever a listing turns out to be matched wrong.
"""

import json
import re
import shutil
import subprocess
import sys

import ssr

# (listing title, release year the venue gives or None, expected S&S title or None)
CASES = [
    # A new film sharing a classic's title, identified by its year
    ('RIVER', 2026, None),
    ('The River', 1951, 'The River'),
    ('Nosferatu', 2024, None),
    ('Crash', 2004, None),
    ('Crash', 1996, 'Crash'),
    # No year given: title alone still matches
    ('Crash', None, 'Crash'),
    ('The Thing in 4K', None, 'The Thing'),
    # " with " is the rest of another title, not an add-on to the screening
    ('The Thing with Two Heads (1972) / The Black Gestapo (1975)', None, None),
    ('The Thing with Two Heads', None, None),
    ('Nosferatu with Live Quarkestra Orchestra', None, 'Nosferatu'),
    # Years and double bills
    ("Singin' in the Rain (1952)", None, "Singin' in the Rain"),
    ('Aguirre, the Wrath of God (1972) / Lessons of Darkness (1992)', None,
     'Aguirre, the Wrath of God'),
    ('Some Film (1990) / Heat (1995)', None, 'Heat'),
    ("It's a Wonderful Life (80th Anniversary)", 1946, "It's a Wonderful Life"),
    ('Journey to Italy (Viaggio in Italia) in 4K', 1954, 'Journey to Italy'),
    ('Movie Club: Blue Velvet', 1986, 'Blue Velvet'),
]


def load_ss250():
    with open('ss250.js', encoding='utf-8') as f:
        text = f.read()
    return [{'rank': int(r), 'title': t, 'year': int(y)}
            for r, t, y in re.findall(
                r'\{\s*rank:\s*(\d+)\s*,\s*title:\s*"([^"]+)"\s*,\s*year:\s*(\d+)\s*\}', text)]


def run_js(cases):
    """Evaluate app.js's matcher (everything above its DOM helpers) under node."""
    with open('ss250.js', encoding='utf-8') as f:
        ss_js = f.read()
    with open('app.js', encoding='utf-8') as f:
        app_js = f.read().split('// --- Helpers ---')[0]
    program = (ss_js + '\n' + app_js + '\n'
               'const cases = ' + json.dumps(cases) + ';\n'
               'console.log(JSON.stringify(cases.map(([t, y]) => '
               '(findSSMatchByTitle(t, y) || {}).title || null)));\n')
    out = subprocess.run(['node', '-'], input=program, capture_output=True,
                         text=True, check=True)
    return json.loads(out.stdout)


def main():
    ss_list = load_ss250()
    py = [(ssr.find_ss_match(t, ss_list, y) or {}).get('title') for t, y, _ in CASES]

    if shutil.which('node'):
        js = run_js([[t, y] for t, y, _ in CASES])
    else:
        print('node not found — checking ssr.py only')
        js = py

    failures = 0
    for (title, year, want), got_py, got_js in zip(CASES, py, js):
        if got_py != want or got_js != want:
            failures += 1
            print(f'FAIL {title!r} year={year}: want {want!r}, ssr.py {got_py!r}, app.js {got_js!r}')
    print(f'{len(CASES) - failures}/{len(CASES)} matcher cases passed')

    # Listings with no year and no poster/page evidence: is a same-titled
    # film in its theatrical window? (rivals, screening date, expected year)
    from server import _recent_rival_year
    river = [{'id': 1, 'year': 2026, 'date': '2026-09-10', 'votes': 2}]
    rival_cases = [
        (river, '2026-09-30', 2026),   # plays weeks after release
        (river, '2026-01-15', 2026),   # festival premiere ahead of release
        (river, '2027-06-01', None),   # long out of theaters: the classic
        ([{'id': 2, 'year': 2025, 'date': '2025-09-15', 'votes': 1}], '2026-09-21', None),
    ]
    rival_failures = 0
    for rivals, date_str, want in rival_cases:
        got = _recent_rival_year(rivals, date_str)
        if got != want:
            rival_failures += 1
            print(f'FAIL rival {rivals[0]["date"]} screening {date_str}: want {want}, got {got}')
    print(f'{len(rival_cases) - rival_failures}/{len(rival_cases)} rival-window cases passed')
    return 1 if failures or rival_failures else 0


if __name__ == '__main__':
    sys.exit(main())
