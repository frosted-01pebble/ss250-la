#!/usr/bin/env python3
"""
Local preview server. Boots the real app with the on-disk scraper cache
preloaded, so startup is instant and nothing hits the live theater sites.

Use this instead of `python3 server.py` when working on the frontend or on the
server-rendered listing in ssr.py.

    python3 devserve.py   →   http://127.0.0.1:5055
"""

import json
import time

import server

with open('events_cache.json', encoding='utf-8') as f:
    server._cache['data'] = json.load(f)
server._cache['fetched_at'] = time.time()
server._loading_progress.update(status='done', done=1, total=1)

if __name__ == '__main__':
    print('Preview server (cached data) on http://127.0.0.1:5055')
    server.app.run(host='127.0.0.1', port=5055, debug=False)
