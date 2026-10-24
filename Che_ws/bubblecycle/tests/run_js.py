"""Runs the browser unit tests (tests/js) headlessly and exits non-zero on any failure.

    python tests/run_js.py          needs: pip install playwright   and Chrome or Edge installed

They exercise the same rules the server enforces (tests/fixtures/*.json are shared) plus the on-device demo's
store, in a real browser engine. These are mocked-environment tests: no camera, GPS or authenticator is involved.
"""
import functools
import http.server
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = functools.partial(Quiet, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{httpd.server_address[1]}/tests/js/index.html'
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(url)
        page.wait_for_function('window.__done === true', timeout=60_000)
        results = page.evaluate('window.__results')
        browser.close()
    httpd.shutdown()
    failed = [r for r in results if not r['ok']]
    for r in failed:
        print(f"FAIL {r['name']}\n     {r['error']}")
    print(f"{len(results) - len(failed)} passed, {len(failed)} failed" + (f", page errors: {errors}" if errors else ''))
    return 1 if failed or errors else 0


if __name__ == '__main__':
    sys.exit(main())
