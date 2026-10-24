"""Writes sw-manifest.js (the offline file list and version) for static hosting. Run it before publishing the folder:

    python tools/build_precache.py

serve.py and the RECYCL IT! server generate the same file on request, so this is only needed on plain static hosts."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from server import precache  # noqa: E402


if __name__ == '__main__':
    out = ROOT / 'sw-manifest.js'
    out.write_text(precache.script(ROOT), encoding='utf-8')
    m = precache.manifest(ROOT)
    print(f"{out.name}: version {m['version']}, {len(m['files'])} files")
