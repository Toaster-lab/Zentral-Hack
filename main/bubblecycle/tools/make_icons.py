"""Builds the RECYCL IT! logo and app icons.

    pip install pillow
    python tools/make_icons.py <logo.png>     # first time, or when the logo changes: pass the full-size logo
    python tools/make_icons.py                # regenerate the icons from icons/logo.png

The logo is dark artwork on white, so it always sits on a white disc. The brand colour (orange #F2A33A) is the
background around that disc. Dark ink on that orange has a contrast of 7.6:1; white text on it would only
reach 2.1:1, so the app never puts white text on the orange.
The icons are already generated and committed; Pillow is only needed to change them.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'icons'
ORANGE = (242, 163, 58)  # #F2A33A, the brand colour
SS = 4                    # supersampling for smooth edges


def disc_logo(logo: Image.Image, diameter: int) -> Image.Image:
    """The logo cropped to a circle (its content sits well inside the circle), white behind it."""
    big = diameter * SS
    img = logo.convert('RGB').resize((big, big), Image.LANCZOS)
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    out = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out.resize((diameter, diameter), Image.LANCZOS)


def icon(logo: Image.Image, size: int, disc_fraction: float, corner: float) -> Image.Image:
    base = Image.new('RGBA', (size, size), ORANGE + (255,))
    d = round(size * disc_fraction)
    disc = disc_logo(logo, d)
    base.alpha_composite(disc, ((size - d) // 2, (size - d) // 2))
    if corner:  # rounded corners for icons that are shown as they are
        big = size * SS
        mask = Image.new('L', (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=round(big * corner), fill=255)
        mask = mask.resize((size, size), Image.LANCZOS)
        base.putalpha(mask)
    return base


def main():
    OUT.mkdir(exist_ok=True)
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT / 'logo.png'
    full = Image.open(src)
    logo = full.convert('RGB')
    logo512 = logo.resize((512, 512), Image.LANCZOS)
    logo512.save(OUT / 'logo.png', optimize=True)            # used inside the app (cropped to a circle with CSS)
    icon(logo512, 512, 0.84, 0.18).save(OUT / 'icon-512.png', optimize=True)
    icon(logo512, 192, 0.84, 0.18).save(OUT / 'icon-192.png', optimize=True)
    icon(logo512, 512, 0.62, 0).save(OUT / 'icon-maskable-512.png', optimize=True)   # inside the 80% safe zone
    icon(logo512, 180, 0.84, 0).convert('RGB').save(OUT / 'apple-touch-icon.png', optimize=True)
    for f in ('logo.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'):
        print('wrote', f, (OUT / f).stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
