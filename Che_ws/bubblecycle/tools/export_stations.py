"""Writes server/data/stations.json from the app's own location data (js/data/locations-seed.js).

The server needs station ids and coordinates to check check-ins. It reads them from this snapshot, so it
cannot disagree with what the map shows. Needs a Chrome or Edge install and `pip install playwright`
(developer tool only; the app itself needs neither). Run from the app folder: python tools/export_stations.py
"""
import functools
import http.server
import json
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


def main():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = functools.partial(Quiet, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{httpd.server_address[1]}/'
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page()
        page.goto(url + 'manifest.webmanifest')
        data = page.evaluate("""async () => {
          const m = await import('/js/data/locations-seed.js');
          return m.SEED_LOCATIONS.filter((l) => l.type === 'station')
            .map((l) => ({ id: l.id, name: l.name, lat: l.lat, lng: l.lng, source: l.source, sample: !!l.sample }));
        }""")
        browser.close()
    httpd.shutdown()
    out = ROOT / 'server' / 'data' / 'stations.json'
    out.write_text(json.dumps(data, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{len(data)} stations -> {out}')


if __name__ == '__main__':
    main()
