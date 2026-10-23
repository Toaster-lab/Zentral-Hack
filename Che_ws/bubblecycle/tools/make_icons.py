"""Generate the app icons (green square with a white leaf) as PNGs, no libraries needed."""
import os, struct, sys, zlib

ROOT = sys.argv[1]
OUT = os.path.join(ROOT, 'icons')
os.makedirs(OUT, exist_ok=True)
BG = (31, 106, 67)
FG = (255, 253, 248)

def inside_leaf(x, y):
    # lens = intersection of two circles (centres (.3,.3) and (.7,.7), radius .4)
    d1 = (x - 0.3) ** 2 + (y - 0.3) ** 2
    d2 = (x - 0.7) ** 2 + (y - 0.7) ** 2
    if d1 <= 0.16 and d2 <= 0.16:
        return True
    # short stem towards the lower left
    t = ((x - 0.30) * (-0.08) + (y - 0.70) * 0.08) / 0.0128
    if 0 <= t <= 1:
        px, py = 0.30 - 0.08 * t, 0.70 + 0.08 * t
        return (x - px) ** 2 + (y - py) ** 2 <= 0.0004
    return False

def png(size, path, rounded):
    rows = []
    ss = 2
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            cov = 0
            for sj in range(ss):
                for si in range(ss):
                    x = (i + (si + .5) / ss) / size
                    y = (j + (sj + .5) / ss) / size
                    cov += inside_leaf(x, y)
            a = cov / (ss * ss)
            r = int(BG[0] + (FG[0] - BG[0]) * a)
            g = int(BG[1] + (FG[1] - BG[1]) * a)
            b = int(BG[2] + (FG[2] - BG[2]) * a)
            alpha = 255
            if rounded:  # corner transparency for non-maskable icons
                cx = min(i, size - 1 - i) / size
                cy = min(j, size - 1 - j) / size
                rad = 0.18
                if cx < rad and cy < rad and (rad - cx) ** 2 + (rad - cy) ** 2 > rad ** 2:
                    alpha = 0
            row += bytes((r, g, b, alpha))
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)
    print('wrote', os.path.basename(path), size)

png(192, os.path.join(OUT, 'icon-192.png'), True)
png(512, os.path.join(OUT, 'icon-512.png'), True)
png(512, os.path.join(OUT, 'icon-maskable-512.png'), False)
png(180, os.path.join(OUT, 'apple-touch-icon.png'), False)
