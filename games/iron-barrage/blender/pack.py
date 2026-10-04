"""Pack the rendered frames into one atlas pair (albedo, normal+paint mask), write units.json and the two PNGs.

blender -b --factory-startup -P pack.py -- --frames DIR --out DIR_FOR_PNGS --json PATH [--interim]
cwebp is run by build.sh on the two PNGs.
"""
import glob
import importlib
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


PAD = 2
TANKS = ['warden', 'bulwark', 'lynx']


def load_frames(d):
    frames = {}
    for jp in sorted(glob.glob(os.path.join(d, '*.json'))):
        name = os.path.basename(jp)[:-5]
        meta = json.load(open(jp))
        a = bl.read_png(os.path.join(d, name + '.a.png'))
        n = bl.read_png(os.path.join(d, name + '.n.png'))
        frames[name] = dict(meta, a=a, n=n)
    return frames


def shelf_pack(items, W):
    """items: list of (key, w, h) already including padding. Returns (positions, H) or None."""
    items = sorted(items, key=lambda t: (-t[2], -t[1]))
    pos = {}
    x = y = shelf_h = 0
    for key, w, h in items:
        if w > W:
            return None
        if x + w > W:
            y += shelf_h
            x = 0
            shelf_h = 0
        pos[key] = (x, y)
        x += w
        shelf_h = max(shelf_h, h)
    return pos, y + shelf_h


def choose_layout(items):
    best = None
    for W in (256, 512, 1024, 2048):
        r = shelf_pack(items, W)
        if r is None:
            continue
        pos, H = r
        Hp = 1
        while Hp < H:
            Hp *= 2
        if Hp > 2048:
            continue
        # square-ish power-of-two preferred, then the smaller area
        score = (W * Hp, abs(W - Hp))
        if best is None or score < best[0]:
            best = (score, W, Hp, pos)
    if best is None:
        raise SystemExit('atlas does not fit in 2048x2048')
    return best[1], best[2], best[3]


def dilate(rgb, known, iters=4):
    """Extend colour into unknown pixels (up to `iters` px) by averaging known neighbours."""
    rgb = rgb.astype(np.float32).copy()
    known = known.copy()
    H, W = known.shape
    for _ in range(iters):
        acc = np.zeros_like(rgb)
        cnt = np.zeros((H, W), np.float32)
        kf = known.astype(np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                sh_k = np.roll(np.roll(kf, dy, 0), dx, 1)
                sh_c = np.roll(np.roll(rgb * kf[..., None], dy, 0), dx, 1)
                acc += sh_c
                cnt += sh_k
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
    interim = '--interim' in ARGV
    aliases = {}
    if interim:
        for t in TANKS[1:]:
            for k in list(frames):
                if k.startswith('warden_'):
                    nm = t + k[len('warden'):]
                    if nm not in frames:
                        aliases[nm] = k
    items = [(k, v['w'] + 2 * PAD, v['h'] + 2 * PAD) for k, v in frames.items()]
    W, H, pos = choose_layout(items)
    A = np.zeros((H, W, 4), np.uint8)
    N = np.zeros((H, W, 4), np.uint8)
    N[..., 0] = 128
    N[..., 1] = 128
    N[..., 2] = 255
    jf = {}
    for k, v in frames.items():
        x, y = pos[k]
        x += PAD
        y += PAD
        A[y:y + v['h'], x:x + v['w']] = v['a']
        N[y:y + v['h'], x:x + v['w']] = v['n']
        jf[k] = dict(x=x, y=y, w=v['w'], h=v['h'], px=v['px'], py=v['py'], ppm=v['ppm'])
    for k, src in aliases.items():
        jf[k] = dict(jf[src])
    # colour extrusion beyond the sprite edges so mip-mapping does not bleed dark fringes (alpha untouched)
    known = A[..., 3] > 0
    A[..., :3] = np.round(np.where(known[..., None], A[..., :3], dilate(A[..., :3], known))).astype(np.uint8)
    N[..., :3] = np.round(np.where(known[..., None], N[..., :3], dilate(N[..., :3], known))).astype(np.uint8)
    bl.write_png(os.path.join(outdir, 'units.png'), A)
    bl.write_png(os.path.join(outdir, 'units_n.png'), N)
    tanks = {}
    for t in TANKS:
        try:
            mod = importlib.import_module(t)
        except ImportError:
            mod = importlib.import_module('warden')
        tanks[t] = dict(
            turret=[round(mod.TURRET_AT[0], 3), round(mod.TURRET_AT[1], 3)],
            gun=[round(mod.GUN_AT[0], 3), round(mod.GUN_AT[1], 3)],
            muzzle=round(mod.MUZZLE, 3),
            hatch=[round(mod.HATCH_AT[0], 3), round(mod.HATCH_AT[1], 3)],
            length=round(mod.LENGTH, 3), height=round(mod.HEIGHT, 3), trackLength=round(mod.TRACK_LEN, 3))
    doc = dict(size=[W, H], frames=dict(sorted(jf.items())), tanks=tanks)
    with open(jpath, 'w') as f:
        json.dump(doc, f, indent=1)
    print('atlas %dx%d, %d frames (%d aliased)' % (W, H, len(frames), len(aliases)))


main()
