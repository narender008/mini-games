"""Contact sheet of rendered frames, for checking art without running the game.

blender -b --factory-startup -P review.py -- --frames DIR --out FILE.png [--match prefix1,prefix2] [--since EPOCH] [--scale 1]
                                             [--max 600]

Frames from every set folder under DIR are shown lit roughly the way the game lights them (cool moonlight from the upper left
and behind, a dim violet bounce from below, a soft rim, a warm point light at the lower right, gloss highlights, glowing parts)
on dark flagstone grey. One row per animation and direction (the name without its trailing frame number). --since keeps
only the frames written at or after that time (build.sh passes its start, so the sheet shows what the run rendered).
"""
import glob
import re
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True  # Blender ignores PYTHONDONTWRITEBYTECODE; keep __pycache__ out of the repo

import numpy as np

import bl

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


def lit(a, n):
    alb = (a[..., :3].astype(np.float32) / 255.0) ** 2.2
    nx = n[..., 0:1].astype(np.float32) / 127.5 - 1.0
    ny = n[..., 1:2].astype(np.float32) / 127.5 - 1.0
    nz = np.sqrt(np.clip(1.0 - nx * nx - ny * ny, 0, 1))
    nn = np.concatenate([nx, ny, nz], -1)
    glo = n[..., 2:3].astype(np.float32) / 255.0
    emi = n[..., 3:4].astype(np.float32) / 255.0
    L = np.array([-0.45, 0.75, 0.48])
    L /= np.linalg.norm(L)
    d = np.clip(nn @ L, 0, 1)[..., None]
    P = np.array([0.6, -0.5, 0.62])
    P /= np.linalg.norm(P)
    dp = np.clip(nn @ P, 0, 1)[..., None]
    amb = np.array([0.16, 0.19, 0.3]) * (0.6 + 0.4 * ny) + np.array([0.09, 0.06, 0.12]) * (0.5 - 0.5 * ny)
    rim = np.clip(1.0 - nz, 0, 1) ** 2.5 * np.array([0.35, 0.5, 0.75])
    H = L + np.array([0, 0, 1.0])
    H /= np.linalg.norm(H)
    sp = np.clip(nn @ H, 0, 1)[..., None] ** 24 * glo
    c = alb * (amb + d * np.array([0.75, 0.85, 1.05]) + dp * np.array([1.1, 0.6, 0.25]) * 0.6) + rim * alb * 1.5 + sp * 0.9
    c = c * (1 - emi) + alb * 2.2 * emi
    c = np.clip(c, 0, 1) ** (1 / 2.2)
    return np.concatenate([np.round(c * 255), a[..., 3:4]], axis=-1).astype(np.uint8)


def over(bg, img, x, y):
    h, w = img.shape[:2]
    h = min(h, bg.shape[0] - y)
    w = min(w, bg.shape[1] - x)
    if h <= 0 or w <= 0:
        return
    img = img[:h, :w]
    a = img[..., 3:4].astype(np.float32) / 255.0
    region = bg[y:y + h, x:x + w, :3].astype(np.float32)
    bg[y:y + h, x:x + w, :3] = np.round(img[..., :3] * a + region * (1 - a)).astype(np.uint8)


def main():
    fdir = opt('--frames')
    out = opt('--out')
    match = opt('--match')
    match = match.split(',') if match else None
    since = float(opt('--since', '0'))
    sc = int(opt('--scale', '1'))
    mx = int(opt('--max', '600'))
    # numeric order: thrall_attack_d2_10 after _d2_9
    natural = lambda p: [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', p)]
    paths = sorted(glob.glob(os.path.join(fdir, '*', '*.json')), key=natural)
    names = []
    for jp in paths:
        if jp.endswith('.meta.json'):
            continue
        nm = os.path.basename(jp)[:-5]
        if match and not any(nm.startswith(m) for m in match):
            continue
        if os.path.getmtime(jp) < since:
            continue
        names.append((nm, os.path.dirname(jp)))
    if not names:
        print('review: no frames%s%s in %s, no sheet written' % (' matching ' + ','.join(match) if match else '',
                                                                ' rendered by this run' if since else '', fdir))
        return
    names = names[:mx]
    rows = {}
    for nm, d in names:
        key = nm.rsplit('_', 1)[0] if nm.rsplit('_', 1)[-1].isdigit() else nm
        rows.setdefault(key, []).append((nm, d))
    tiles = []
    for key, group in rows.items():
        row = []
        for nm, d in group:
            a = bl.read_png(os.path.join(d, nm + '.a.png'))
            n = bl.read_png(os.path.join(d, nm + '.n.png'))
            if sc > 1:
                a = a.repeat(sc, 0).repeat(sc, 1)
                n = n.repeat(sc, 0).repeat(sc, 1)
            row.append(lit(a, n))
        tiles.append(row)
    W = max(sum(t.shape[1] + 6 for t in row) for row in tiles) + 6
    H = sum(max(t.shape[0] for t in row) + 6 for row in tiles) + 6
    W, H = min(W, 8000), min(H, 8000)
    bg = np.zeros((H, W, 4), np.uint8)
    bg[..., 0] = 38
    bg[..., 1] = 40
    bg[..., 2] = 48
    bg[..., 3] = 255
    # faint flagstone grid
    bg[::64, :, :3] = 30
    bg[:, ::96, :3] = 30
    y = 6
    for row in tiles:
        x = 6
        for t in row:
            over(bg, t, x, y)
            x += t.shape[1] + 6
        y += max(t.shape[0] for t in row) + 6
        if y >= H:
            break
    bl.write_png(out, bg)
    print('review: %s (%d frames)' % (out, len(names)))


if __name__ == '__main__':
    main()
