"""The list of files the service worker stores for offline use, plus a version that changes whenever any of them do.

The version is a hash of the files' contents, so a release always produces a new cache name and the old
one is removed. `tools/build_precache.py` writes the result to sw-manifest.js for static hosting; the dev server and the
app server generate it on request.
"""
import hashlib
import json
from pathlib import Path

DIRS = ('css', 'js', 'vendor', 'icons')
TOP = ('index.html', 'offline.html', 'manifest.webmanifest')


def files(root: Path) -> list:
    out = [t for t in TOP if (root / t).is_file()]
    for d in DIRS:
        out += sorted(p.relative_to(root).as_posix() for p in (root / d).rglob('*') if p.is_file() and not p.name.startswith('.'))
    return out


def manifest(root: Path) -> dict:
    h = hashlib.sha256()
    names = files(root)
    for n in names:
        h.update(n.encode())
        h.update((root / n).read_bytes())
    return {'version': h.hexdigest()[:12], 'files': names}


def script(root: Path) -> str:
    return f'self.BC_PRECACHE = {json.dumps(manifest(root))};\n'
