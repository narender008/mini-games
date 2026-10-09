"""Pack the rendered frames into 2048x2048 atlas pages (albedo, normal + emissive), write sprites.json and the page PNGs.

blender -b --factory-startup -P pack.py -- --frames DIR --out DIR_FOR_PNGS --json PATH
build.sh runs cwebp on the PNGs. The game uploads the pages as layers of one texture array, so every page has the same size.
"""
import glob
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


PAD = 2
PAGE = 2048


def load_frames(d):
    frames = {}
    for jp in sorted(glob.glob(os.path.join(d, '*.json'))):
        if jp.endswith('.anchors.json'):
            continue
        name = os.path.basename(jp)[:-5]
        meta = json.load(open(jp))
        a = bl.read_png(os.path.join(d, name + '.a.png'))
        n = bl.read_png(os.path.join(d, name + '.n.png'))
        frames[name] = dict(meta, a=a, n=n)
    return frames


def maxrects(items, W, H):
    """MaxRects (best short side fit) into as many W x H pages as needed. items: (key, w, h). Returns {key: (page, x, y)}."""
    pages = []
    pos = {}
    for key, w, h in sorted(items, key=lambda t: (-max(t[1], t[2]), -min(t[1], t[2]), t[0])):
        if w > W or h > H:
            raise SystemExit('frame %s (%dx%d) is larger than a page' % (key, w, h))
        placed = False
        for pi, free in enumerate(pages):
            best = None
            for fx, fy, fw, fh in free:
                if w <= fw and h <= fh:
                    sc = (min(fw - w, fh - h), max(fw - w, fh - h))
                    if best is None or sc < best[0]:
                        best = (sc, fx, fy)
            if best is None:
                continue
            _, x, y = best
            pos[key] = (pi, x, y)
            pages[pi] = split(free, x, y, w, h)
            placed = True
            break
        if not placed:
            pages.append([(0, 0, W, H)])
            pos[key] = (len(pages) - 1, 0, 0)
            pages[-1] = split(pages[-1], 0, 0, w, h)
    return pos, len(pages)


def split(free, x, y, w, h):
    new_free = []
    for fx, fy, fw, fh in free:
        if x >= fx + fw or x + w <= fx or y >= fy + fh or y + h <= fy:
            new_free.append((fx, fy, fw, fh))
            continue
        if x > fx:
            new_free.append((fx, fy, x - fx, fh))
        if x + w < fx + fw:
            new_free.append((x + w, fy, fx + fw - x - w, fh))
        if y > fy:
            new_free.append((fx, fy, fw, y - fy))
        if y + h < fy + fh:
            new_free.append((fx, y + h, fw, fy + fh - y - h))
    return [r for i, r in enumerate(new_free)
            if not any(j != i and o[0] <= r[0] and o[1] <= r[1] and o[0] + o[2] >= r[0] + r[2] and o[1] + o[3] >= r[1] + r[3]
                       and (o != r or j < i) for j, o in enumerate(new_free))]


def dilate(rgb, known, iters=4):
    """Extend colour into unknown pixels (up to `iters` px) by averaging known neighbours, so mip-maps do not bleed dark fringes."""
    rgb = rgb.astype(np.float32).copy()
    known = known.copy()
    for _ in range(iters):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(known.shape, np.float32)
        kf = known.astype(np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                acc += np.roll(np.roll(rgb * kf[..., None], dy, 0), dx, 1)
                cnt += np.roll(np.roll(kf, dy, 0), dx, 1)
        new = (~known) & (cnt > 0)
        if not new.any():
            break
        rgb[new] = acc[new] / cnt[new][:, None]
        known = known | new
    return rgb


def main():
    fdir = opt('--frames')
    outdir = opt('--out')
    jpath = opt('--json')
    os.makedirs(outdir, exist_ok=True)
    frames = load_frames(fdir)
    items = [(k, v['w'] + 2 * PAD, v['h'] + 2 * PAD) for k, v in frames.items()]
    pos, npages = maxrects(items, PAGE, PAGE)
    # every page stays PAGE x PAGE: the layers of a texture array all have one size
    jf = {}
    for p in range(npages):
        A = np.zeros((PAGE, PAGE, 4), np.uint8)
        N = np.zeros((PAGE, PAGE, 4), np.uint8)
        N[..., 0] = 128
        N[..., 1] = 128
        N[..., 2] = 255
        for k, v in frames.items():
            pi, x, y = pos[k]
            if pi != p:
                continue
            x += PAD
            y += PAD
            A[y:y + v['h'], x:x + v['w']] = v['a']
            N[y:y + v['h'], x:x + v['w']] = v['n']
            jf[k] = dict(p=p, x=x, y=y, w=v['w'], h=v['h'], px=v['px'], py=v['py'], ppm=v['ppm'])
        known = A[..., 3] > 0
        A[..., :3] = np.round(np.where(known[..., None], A[..., :3], dilate(A[..., :3], known))).astype(np.uint8)
        N[..., :3] = np.round(np.where(known[..., None], N[..., :3], dilate(N[..., :3], known))).astype(np.uint8)
        bl.write_png(os.path.join(outdir, 'sprites_%d.png' % p), A)
        bl.write_png(os.path.join(outdir, 'sprites_%d_n.png' % p), N)
    anchors = {}
    for ap in sorted(glob.glob(os.path.join(fdir, '*.anchors.json'))):
        for kind, v in json.load(open(ap)).items():
            anchors.setdefault(kind, {}).update(v)
    doc = dict(page=PAGE, pages=npages, unitsPerMetre=bl.UNITS_PER_M, frames=dict(sorted(jf.items())), anchors=anchors)
    with open(jpath, 'w') as f:
        json.dump(doc, f, indent=1)
    used = sum((v['w'] + 2 * PAD) * (v['h'] + 2 * PAD) for v in frames.values())
    print('%d frames on %d page(s) of %d, %.0f%% filled' % (len(frames), npages, PAGE, 100.0 * used / (npages * PAGE * PAGE)))


main()
