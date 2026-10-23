"""Download the app's third-party files once, into bubblecycle/vendor, so it can run offline.
Pinned versions only. Run from the bubblecycle folder: python tools/vendor.py"""
import os, re, sys, urllib.request

ROOT = sys.argv[1]
V = os.path.join(ROOT, 'vendor')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

def get(url, binary=True):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    data = urllib.request.urlopen(req, timeout=60).read()
    return data if binary else data.decode('utf-8')

def save(rel, data):
    p = os.path.join(V, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'wb').write(data)
    print('saved', rel, len(data))

save('preact-htm.js', get('https://unpkg.com/htm@3.1.1/preact/standalone.module.js'))
save('leaflet/leaflet.js', get('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'))
save('leaflet/leaflet.css', get('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'))
for img in ['marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png', 'layers.png', 'layers-2x.png']:
    save('leaflet/images/' + img, get('https://unpkg.com/leaflet@1.9.4/dist/images/' + img))
save('zxing.min.js', get('https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js'))
save('qrcode.min.js', get('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'))

# Fonts: take the latin and latin-ext subsets and rewrite the CSS to local files.
css = get('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap', binary=False)
out = []
n = 0
for block in re.split(r'(?=/\* [a-z\-]+ \*/)', css):
    m = re.match(r'/\* ([a-z\-]+) \*/', block)
    if not m or m.group(1) not in ('latin', 'latin-ext'):
        continue
    url = re.search(r'url\((https://[^)]+\.woff2)\)', block).group(1)
    n += 1
    name = f'fonts/font-{n}.woff2'
    save(name, get(url))
    out.append(block.replace(url, name.replace('fonts/', '')).strip())
open(os.path.join(V, 'fonts', 'fonts.css'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('fonts.css written with', n, 'faces')
