"""Pack one set's rendered frames into atlas pages: 2048x2048 albedo pages and 1024x1024 normal pages (half size: the same
UVs, a quarter of the memory), write <set>.json and the page PNGs.

blender -b --factory-startup -P pack.py -- --frames DIR/<set> --out DIR_FOR_PNGS --json PATH/<set>.json --set NAME
                                           [--old SHIPPED/<set>.json [--allow-shrink]]

Fails on a set with no frames, and on one missing frames that the --old json has (a partial render cache) unless
--allow-shrink.

build.sh runs cwebp on the PNGs. The game uploads a set's pages as layers of the shared sprite texture arrays.
json: {page, npage, pages, frames: {name: [page, x, y, w, h, px, py, ppm]}, anims, anchors, values}
x, y, w, h in albedo pixels; px, py = the pivot in pixels from the frame's top-left (y down); ppm = pixels per metre.
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
        if jp.endswith('.meta.json'):
            continue
        name = os.path.basename(jp)[:-5]
        meta = json.load(open(jp))
        a = bl.read_png(os.path.join(d, name + '.a.png'))
        n = bl.read_png(os.path.join(d, name + '.n.png'))
        # even sizes, so the half-size normal page lines up with whole pixels
        h, w = a.shape[:2]
        if w % 2 or h % 2:
            a2 = np.zeros((h + h % 2, w + w % 2, 4), np.uint8)
            n2 = np.zeros_like(a2)
            n2[..., 0] = 128
            n2[..., 1] = 128
            a2[:h, :w] = a
            n2[:h, :w] = n
            a, n = a2, n2
            meta['w'], meta['h'] = a.shape[1], a.shape[0]
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


def half_normal(N, A):
    """2x2 box-down of a normal page (RG = normal xy, B gloss, A emissive), weighted by coverage; normals renormalised."""
    h, w = A.shape
    a = (A.astype(np.float32) / 255.0).reshape(h // 2, 2, w // 2, 2)
    wsum = a.sum(axis=(1, 3))
    nx = N[..., 0].astype(np.float32) / 127.5 - 1.0
    ny = N[..., 1].astype(np.float32) / 127.5 - 1.0
    nz = np.sqrt(np.clip(1.0 - nx * nx - ny * ny, 0.0, 1.0))
    out = np.zeros((h // 2, w // 2, 4), np.float32)
    vec = []
    for ch in (nx, ny, nz):
        c = ch.reshape(h // 2, 2, w // 2, 2)
        vec.append(np.where(wsum > 1e-4, (c * a).sum(axis=(1, 3)) / np.maximum(wsum, 1e-4), c.mean(axis=(1, 3))))
    v = np.stack(vec, -1)
    v /= np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-6)
    out[..., 0] = v[..., 0] * 127.5 + 127.5
    out[..., 1] = v[..., 1] * 127.5 + 127.5
    for k in (2, 3):
        c = N[..., k].astype(np.float32).reshape(h // 2, 2, w // 2, 2)
        out[..., k] = np.where(wsum > 1e-4, (c * a).sum(axis=(1, 3)) / np.maximum(wsum, 1e-4), 0.0)
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def main():
    fdir = opt('--frames')
    outdir = opt('--out')
    jpath = opt('--json')
    name = opt('--set')
    os.makedirs(outdir, exist_ok=True)
    frames = load_frames(fdir)
    if not frames:
        raise SystemExit('set %s: no frames' % name)
    old = opt('--old')
    if old and os.path.exists(old) and '--allow-shrink' not in ARGV:
        lost = sorted(set(json.load(open(old))['frames']) - set(frames))
        if lost:
            raise SystemExit('set %s: %d frame(s) of %s are missing, such as %s (render them, or ALLOW_SHRINK=1 if they '
                             'were removed on purpose)' % (name, len(lost), old, ', '.join(lost[:4])))
    items = [(k, v['w'] + 2 * PAD, v['h'] + 2 * PAD) for k, v in frames.items()]
    pos, npages = maxrects(items, PAGE, PAGE)
    jf = {}
    for p in range(npages):
        A = np.zeros((PAGE, PAGE, 4), np.uint8)
        N = np.zeros((PAGE, PAGE, 4), np.uint8)
        N[..., 0] = 128
        N[..., 1] = 128
        for k, v in frames.items():
            pi, x, y = pos[k]
            if pi != p:
                continue
            x += PAD
            y += PAD
            A[y:y + v['h'], x:x + v['w']] = v['a']
            N[y:y + v['h'], x:x + v['w']] = v['n']
            jf[k] = [p, x, y, v['w'], v['h'], v['px'], v['py'], v['ppm']]
        known = A[..., 3] > 0
        A[..., :3] = np.round(np.where(known[..., None], A[..., :3], dilate(A[..., :3], known))).astype(np.uint8)
        Nh = half_normal(N, A[..., 3])
        kh = A[..., 3].reshape(PAGE // 2, 2, PAGE // 2, 2).max(axis=(1, 3)) > 0
        Nh[..., :3] = np.round(np.where(kh[..., None], Nh[..., :3], dilate(Nh[..., :3], kh, 2))).astype(np.uint8)
        bl.write_png(os.path.join(outdir, '%s_%d.png' % (name, p)), A)
        bl.write_png(os.path.join(outdir, '%s_%d_n.png' % (name, p)), Nh)
    doc = dict(page=PAGE, npage=PAGE // 2, pages=npages, frames=dict(sorted(jf.items())), anims={}, anchors={}, values={})
    for mp in sorted(glob.glob(os.path.join(fdir, '*.meta.json'))):
        m = json.load(open(mp))
        doc['anims'].update(m.get('anims', {}))
        for k in ('anchors', 'values'):
            for kind, v in m.get(k, {}).items():
                doc[k].setdefault(kind, {}).update(v)
    with open(jpath, 'w') as f:
        json.dump(doc, f, separators=(',', ':'))
    used = sum((v['w'] + 2 * PAD) * (v['h'] + 2 * PAD) for v in frames.values())
    print('set %s: %d frames on %d page(s), %.0f%% filled' % (name, len(frames), npages, 100.0 * used / (npages * PAGE * PAGE)))


main()
