#!/usr/bin/env python3
"""Render r/preview.jpg, the link-preview image for shared passages (/r/{id}).

Cream journal paper, a few lines of ink blurred past reading, and a small Jia mark.
The server can't read a passage (ADR-0064), so every share unfurls with this same image.

Reproducible: fixed seed, no network, only Pillow. Run from the repo root:
    python3 tools/make-passage-preview.py
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "logo.png"
OUT = ROOT / "r" / "preview.jpg"

W, H = 1200, 630
SS = 2                    # supersample the ink, then downscale
PAPER = (246, 241, 231)   # --paper in r/passage.css
INK = (28, 26, 23)        # --ink in r/passage.css
RULE = (226, 216, 198)
SEED = 358


def paper(rng):
    """Cream paper with a faint, fixed grain and a soft warm vignette."""
    img = Image.new("RGB", (W, H), PAPER)
    grain = Image.frombytes("L", (W, H), rng.randbytes(W * H)).filter(ImageFilter.GaussianBlur(0.6))
    # Centre the grain on mid-grey and keep it very faint.
    grain = grain.point(lambda v: 128 + (v - 128) // 10)
    img = ImageChops.overlay(img, Image.merge("RGB", (grain, grain, grain)))

    vignette = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vignette).ellipse((-W * 0.25, -H * 0.45, W * 1.25, H * 1.45), fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(120))
    edge = Image.new("RGB", (W, H), (232, 223, 206))
    return Image.composite(img, edge, vignette)


def rules(img, top, gap, count, left, right):
    d = ImageDraw.Draw(img)
    for i in range(count):
        y = top + i * gap
        d.line((left, y, right, y), fill=RULE, width=1)


def scribble(d, rng, x, y, width, height, stroke):
    """One handwritten-looking word: a running cursive loop, never letters."""
    pts = []
    step = 2.5 * SS
    phase = rng.uniform(0, math.pi)
    freq = rng.uniform(0.85, 1.15) / (7 * SS)
    tall = {rng.randrange(int(width / step) + 1) for _ in range(rng.randint(0, 2))}
    n = int(width / step)
    for i in range(n + 1):
        t = i * step
        lift = 0.5 + 0.5 * math.sin(phase + t * freq * math.tau)
        h = height * (1.9 if any(abs(i - k) < 4 for k in tall) else 1.0)
        pts.append((x + t + math.sin(t * freq * math.tau * 2) * 2 * SS, y - lift * h * 0.62))
    d.line(pts, fill=255, width=stroke, joint="curve")


def ink(rng, lines, left, top, gap, right):
    """Lines of 'words', drawn at 2x and blurred until nothing is readable."""
    mask = Image.new("L", (W * SS, H * SS), 0)
    d = ImageDraw.Draw(mask)
    for li, fraction in enumerate(lines):
        x = left * SS
        end = left * SS + (right - left) * SS * fraction
        base = (top + li * gap) * SS
        while x < end:
            w = rng.uniform(38, 120) * SS
            w = min(w, end - x)
            if w < 18 * SS:
                break
            scribble(d, rng, x, base, w, rng.uniform(15, 22) * SS, int(2.6 * SS))
            x += w + rng.uniform(14, 22) * SS
    mask = mask.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(4.2))
    return mask.point(lambda v: int(v * 0.58))


def mark(size):
    """The Jia logo as a small rounded tile."""
    logo = Image.open(LOGO).convert("RGB").resize((size * 4, size * 4), Image.LANCZOS)
    corner = Image.new("L", logo.size, 0)
    ImageDraw.Draw(corner).rounded_rectangle((0, 0, *logo.size), radius=int(size * 4 * 0.225), fill=255)
    tile = logo.resize((size, size), Image.LANCZOS)
    return tile, corner.resize((size, size), Image.LANCZOS)


def main():
    rng = random.Random(SEED)
    img = paper(rng)

    left, right = 150, 1050
    top, gap = 206, 74
    rules(img, top + 14, gap, 4, left - 30, right + 30)

    # Line lengths as fractions of the measure; the last trails off like a paragraph end.
    mask = ink(rng, [0.97, 0.92, 1.0, 0.58], left, top, gap, right)
    img.paste(Image.new("RGB", (W, H), INK), (0, 0), mask)

    tile, alpha = mark(64)
    shadow = Image.new("L", (W, H), 0)
    sx, sy = W - 64 - 56, H - 64 - 48
    shadow.paste(alpha.point(lambda v: v * 22 // 100), (sx, sy + 3))
    shadow = shadow.filter(ImageFilter.GaussianBlur(6))
    img.paste(Image.new("RGB", (W, H), (120, 100, 70)), (0, 0), shadow)
    img.paste(tile, (sx, sy), alpha)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "JPEG", quality=86, optimize=True, progressive=True)
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
