#!/usr/bin/env python3
"""Build Android adaptive foreground layers from resources/icon.png.

The adaptive layer is 108dp and Android masks it (circle, rounded square,
...), so the artwork must sit inside the 66dp safe zone. The icon is placed
at 60/108 of the layer, centered. The background continues the icon's own
radial gradient outward (median of the darkest half of each ring, since the
artwork is bright and the background dark), so no edge seam is visible.

Usage: python3 scripts/make-android-foreground.py [source.png]
Called by scripts/make-icons.js.
"""
import sys

import numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else 'resources/icon.png'
DENSITIES = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
ART = 72 / 108  # artwork share of the 108dp layer

im = np.asarray(Image.open(SRC).convert('RGB'), dtype=np.float64)
H = W = im.shape[0]
cy = cx = (H - 1) / 2

yy, xx = np.mgrid[0:H, 0:W]
rr = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2)
r_max = rr.max()
n_steps = 720
edges = np.linspace(0, r_max, n_steps + 1)
grad = np.zeros((n_steps, 3))
lum = im.sum(axis=2)
for i in range(n_steps):
    m = (rr >= edges[i]) & (rr < edges[i + 1])
    if not m.any():
        grad[i] = grad[i - 1] if i else im[0, 0]
        continue
    vals = im[m]
    l = lum[m]
    thr = np.percentile(l, 50)
    grad[i] = vals[l <= thr].mean(axis=0)


def grad_at(r):
    idx = np.clip(np.searchsorted(edges, r) - 1, 0, n_steps - 1)
    return grad[idx]


master = Image.open(SRC).convert('RGB')
for dpi, layer in DENSITIES.items():
    art_px = round(layer * ART)
    art = master.resize((art_px, art_px), Image.LANCZOS)
    ly, lx = np.mgrid[0:layer, 0:layer]
    lc = (layer - 1) / 2
    lr = np.sqrt((ly - lc) ** 2 + (lx - lc) ** 2)
    mr = lr * (H / art_px)
    bg = grad_at(mr).astype(np.uint8)
    bgim = Image.fromarray(bg, 'RGB')
    off = (layer - art_px) // 2
    bgim.paste(art, (off, off))
    out = f'resources/android/res/mipmap-{dpi}/ic_launcher_foreground.png'
    bgim.save(out)
    print(f'[icons] {out}: layer {layer}px, artwork {art_px}px')
