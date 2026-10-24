"""Local server for RECYCL IT!. Needs only Python 3 (no packages).

    python serve.py            start on http://localhost:5173 and open the browser
    python serve.py 8080       use another port
    python serve.py --no-open  don't open the browser
    python serve.py --lan      also listen on your network (see the note below)

The app is plain HTML, CSS and JavaScript with its libraries bundled in ./vendor, so there is
nothing to install or build. It must be opened through a server (not by double-clicking
index.html): browsers block ES modules on file:// pages.

This is the demo server: everything runs on the device. To try the server-enforced version (accounts, points and
rewards kept on a server), run `python -m server` instead; see the README.

Camera scanning and "use my location" only work on https or http://localhost. With --lan,
other devices on your network can open the app, but those two features will be blocked there.
"""
import http.server
import os
import socket
import sys
import threading
import webbrowser
from functools import partial
from pathlib import Path

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
from server import precache  # noqa: E402  (pure standard library: the list of files the service worker stores)
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
FLAGS = {a for a in sys.argv[1:] if a.startswith('--')}
START_PORT = int(ARGS[0]) if ARGS else 5173
HOST = '0.0.0.0' if '--lan' in FLAGS else '127.0.0.1'


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
        '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
    }

    def do_GET(self):
        # The service worker's file list is generated from the files on disk, so it can never be out of date here.
        if self.path.split('?')[0] == '/sw-manifest.js':
            data = precache.script(Path(ROOT)).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def end_headers(self):
        # Always fetch fresh app files; the service worker keeps an offline copy.
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter console
        if '/vendor/' not in self.path and '/icons/' not in self.path:
            super().log_message(fmt, *args)


def free_port(start):
    for port in range(start, start + 30):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    raise SystemExit(f'No free port found between {start} and {start + 29}.')


def lan_address():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('10.255.255.255', 1))
            return s.getsockname()[0]
    except OSError:
        return None


if __name__ == '__main__':
    port = free_port(START_PORT)
    handler = partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer((HOST, port), handler) as httpd:
        url = f'http://localhost:{port}'
        print(f'\n  RECYCL IT! is running at {url}\n  Press Ctrl+C to stop.\n')
        if '--lan' in FLAGS and lan_address():
            print(f'  On your network: http://{lan_address()}:{port}  (camera and location need https there)\n')
        if '--no-open' not in FLAGS:
            threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n  Stopped.')
