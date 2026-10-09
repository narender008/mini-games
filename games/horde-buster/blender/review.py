"""Contact sheet of rendered frames, for checking art without running the game.

blender -b --factory-startup -P review.py -- --frames DIR --out FILE.png [--match prefix1,prefix2] [--scale 2]

Each frame is shown twice on road grey: as stored (albedo, ink lines, outline) and lit the way the game lights it (toon bands
from a key light at the top left, a warm rim, emissive parts glowing), so wrong normals or missing glow show up at once.
Frames are grouped in rows by name prefix (the part before the last underscore).
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np

import bl

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


def lit(a, n):
    """The game's sprite shading, roughly: ambient + two toon bands of a key light + rim + emissive."""
    alb = (a[..., :3].astype(np.float32) / 255.0) ** 2.2
    nn = n[..., :3].astype(np.float32) / 127.5 - 1.0
    emi = n[..., 3:4].astype(np.float32) / 255.0
    L = np.array([-0.45, 0.6, 0.66])
    L /= np.linalg.norm(L)
    d = np.clip((nn @ L), 0, 1)[..., None]
    band = np.where(d > 0.55, 1.0, np.where(d > 0.18, 0.62, 0.3))
    rim = np.clip(1.0 - nn[..., 2:3], 0, 1) ** 3 * 0.35
    c = alb * (0.38 + 0.9 * band) + rim * np.array([1.0, 0.8, 0.6]) * alb.mean(-1, keepdims=True) * 2
    c = c * (1 - emi) + alb * 1.6 * emi
    c = np.clip(c, 0, 1) ** (1 / 2.2)
    return np.concatenate([np.round(c * 255), a[..., 3:4]], axis=-1).astype(np.uint8)


def over(bg, img, x, y):
    h, w = img.shape[:2]
    a = img[..., 3:4].astype(np.float32) / 255.0
    region = bg[y:y + h, x:x + w, :3].astype(np.float32)
    bg[y:y + h, x:x + w, :3] = np.round(img[..., :3] * a + region * (1 - a)).astype(np.uint8)


def main():
    fdir = opt('--frames')
    out = opt('--out')
    match = opt('--match')
    match = match.split(',') if match else None
    sc = int(opt('--scale', '2'))
    names = []
    for jp in sorted(glob.glob(os.path.join(fdir, '*.json'))):
        if jp.endswith('.anchors.json'):
            continue
        nm = os.path.basename(jp)[:-5]
        if match and not any(nm.startswith(m) for m in match):
            continue
        names.append(nm)
    rows = {}
    for nm in names:
        key = nm.rsplit('_', 1)[0] if nm.rsplit('_', 1)[-1].isdigit() else nm
        rows.setdefault(key, []).append(nm)
    tiles = []
    for key, group in rows.items():
        row = []
        for nm in group:
            a = bl.read_png(os.path.join(fdir, nm + '.a.png'))
            n = bl.read_png(os.path.join(fdir, nm + '.n.png'))
            meta = json.load(open(os.path.join(fdir, nm + '.json')))
            if sc > 1:
                a = a.repeat(sc, 0).repeat(sc, 1)
                n = n.repeat(sc, 0).repeat(sc, 1)
            row.append((a, lit(a, n), meta))
        tiles.append(row)
    gap = 8
    W = max(sum(t[0].shape[1] * 2 + gap * 3 for t in row) for row in tiles) + gap
    H = sum(max(t[0].shape[0] for t in row) + gap for row in tiles) + gap
    W = min(W, 8000)
    bg = np.zeros((H, W, 4), np.uint8)
    bg[..., :3] = (58, 60, 66)
    bg[..., 3] = 255
    y = gap
    for row in tiles:
        x = gap
        hmax = max(t[0].shape[0] for t in row)
        for a, l, meta in row:
            w = a.shape[1]
            if x + w * 2 + gap > W:
                break
            over(bg, a, x, y)
            over(bg, l, x + w + gap, y)
            # pivot marker
            px, py = meta['px'] * sc, meta['py'] * sc
            for k in (-3, -2, -1, 0, 1, 2, 3):
                for (xx, yy) in ((x + px + k, y + py), (x + px, y + py + k)):
                    if 0 <= yy < H and 0 <= xx < W:
                        bg[yy, xx, :3] = (0, 255, 120)
            x += w * 2 + gap * 3
        y += hmax + gap
    bl.write_png(out, bg)
    print('review: %d frames -> %s (%dx%d)' % (len(names), out, W, H))


main()
