"""Review images built from the FINAL webp atlases and units.json (not from the Blender scene):
sprites-albedo.png, sprites-normal.png (the atlases on mid grey), sprites-assembled.png (each tank put together from the json
mounts, gun at 0 and 35 degrees, plus the wreck, lit with the normal map and tinted olive by the paint mask).

blender -b --factory-startup -P review.py -- --sprites DIR --out DIR --work DIR
"""
import json
import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np

import bl

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


SPR = opt('--sprites')
OUT = opt('--out')
WORK = opt('--work', bl.TMP)
DWEBP = '/opt/homebrew/bin/dwebp'


def decode(name):
    d = os.path.join(WORK, 'review')
    os.makedirs(d, exist_ok=True)
    png = os.path.join(d, name + '.png')
    subprocess.run([DWEBP, '-quiet', os.path.join(SPR, name + '.webp'), '-o', png], check=True)
    return bl.read_png(png)


def over(bg, rgb, a):
    return rgb * a[..., None] + bg * (1 - a[..., None])


def crop(atlas, fr):
    return atlas[fr['y']:fr['y'] + fr['h'], fr['x']:fr['x'] + fr['w']].astype(np.float32) / 255.0


def rotate(img, ang, px, py):
    """Rotate an RGBA(float) sprite visually counter-clockwise by ang about its pivot; returns (img, new px, new py)."""
    h, w = img.shape[:2]
    c, s = math.cos(ang), math.sin(ang)
    corners = [(-px, -py), (w - px, -py), (-px, h - py), (w - px, h - py)]
    rot = [(dx * c + dy * s, -dx * s + dy * c) for dx, dy in corners]
    x0, x1 = math.floor(min(r[0] for r in rot)), math.ceil(max(r[0] for r in rot))
    y0, y1 = math.floor(min(r[1] for r in rot)), math.ceil(max(r[1] for r in rot))
    ow, oh = x1 - x0, y1 - y0
    yy, xx = np.mgrid[0:oh, 0:ow]
    dx, dy = xx + x0 + 0.5, yy + y0 + 0.5
    sx = dx * c - dy * s + px - 0.5
    sy = dx * s + dy * c + py - 0.5
    ix, iy = np.floor(sx).astype(int), np.floor(sy).astype(int)
    fx, fy = (sx - ix)[..., None], (sy - iy)[..., None]
    pm = img.copy()
    pm[..., :3] *= pm[..., 3:4]
    pad = np.zeros((h + 2, w + 2, img.shape[2]), np.float32)
    pad[1:-1, 1:-1] = pm

    def tap(jx, jy):
        return pad[np.clip(jy + 1, 0, h + 1), np.clip(jx + 1, 0, w + 1)]
    out = (tap(ix, iy) * (1 - fx) * (1 - fy) + tap(ix + 1, iy) * fx * (1 - fy) + tap(ix, iy + 1) * (1 - fx) * fy + tap(ix + 1, iy + 1) * fx * fy)
    a = out[..., 3:4]
    out[..., :3] = np.where(a > 1e-4, out[..., :3] / np.maximum(a, 1e-4), 0)
    return out, -x0, -y0


class Canvas:
    def __init__(self, w, h, ppm=48):
        self.w, self.h, self.ppm = w, h, ppm
        self.alb = np.zeros((h, w, 4), np.float32)
        self.nrm = np.zeros((h, w, 4), np.float32)
        self.nrm[..., :3] = (0.5, 0.5, 1.0)

    def put(self, A, N, fr, wx, wz, ox, oy, ang=0.0, flip=False):
        a = crop(A, fr)
        n = crop(N, fr)
        px, py = fr['px'], fr['py']
        if abs(ang) > 1e-6:
            alpha = a[..., 3:4]
            a2, px2, py2 = rotate(a, ang, px, py)
            n2, _, _ = rotate(np.concatenate([n[..., :3], alpha], -1), ang, px, py)
            m2, _, _ = rotate(np.concatenate([n[..., 3:4], n[..., 3:4], n[..., 3:4], alpha], -1), ang, px, py)
            v = n2[..., :3] * 2 - 1
            c, s = math.cos(ang), math.sin(ang)
            vx, vy = v[..., 0] * c - v[..., 1] * s, v[..., 0] * s + v[..., 1] * c
            n = np.stack([vx * 0.5 + 0.5, vy * 0.5 + 0.5, v[..., 2] * 0.5 + 0.5, m2[..., 0]], -1)
            a = a2
            px, py = px2, py2
        x = int(round(ox + wx * self.ppm - px))
        y = int(round(oy - wz * self.ppm - py))
        h, w = a.shape[:2]
        xs0, ys0 = max(0, x), max(0, y)
        xs1, ys1 = min(self.w, x + w), min(self.h, y + h)
        if xs1 <= xs0 or ys1 <= ys0:
            return
        sa = a[ys0 - y:ys1 - y, xs0 - x:xs1 - x]
        sn = n[ys0 - y:ys1 - y, xs0 - x:xs1 - x]
        al = sa[..., 3:4]
        d = self.alb[ys0:ys1, xs0:xs1]
        d[..., :3] = sa[..., :3] * al + d[..., :3] * (1 - al)
        d[..., 3:4] = al + d[..., 3:4] * (1 - al)
        dn = self.nrm[ys0:ys1, xs0:xs1]
        dn[..., :3] = sn[..., :3] * al + dn[..., :3] * (1 - al)
        dn[..., 3:4] = sn[..., 3:4] * al + dn[..., 3:4] * (1 - al)


def srgb2lin(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def lit(canvas, tint=(0.50, 0.58, 0.30), bg=(0.45, 0.55, 0.65)):
    """Quick stand-in for the game's lighting: tint painted pixels, light from the upper left in front."""
    a = canvas.alb
    n = canvas.nrm[..., :3] * 2 - 1
    ln = np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    n = n / ln
    L = np.array([-0.45, 0.55, 0.70])
    L = L / np.linalg.norm(L)
    nl = np.clip((n * L).sum(-1, keepdims=True), 0, 1)
    mask = canvas.nrm[..., 3:4]
    col = srgb2lin(a[..., :3])
    col = col * (1 - mask + mask * np.array(tint) * 1.9)
    H = L + np.array([0, 0, 1.0])
    H = H / np.linalg.norm(H)
    spec = np.clip((n * H).sum(-1, keepdims=True), 0, 1) ** 24 * 0.25
    res = col * (0.28 + 0.95 * nl) + spec * (0.4 + 0.6 * mask)
    res = bl.lin2srgb(res * 1.15)
    sky = np.zeros_like(res) + np.array(bg)
    return over(sky, res, a[..., 3])


def main():
    A = decode('units')
    N = decode('units_n')
    doc = json.load(open(os.path.join(SPR, 'units.json')))
    fr = doc['frames']
    bgc = np.array([0.42, 0.42, 0.42], np.float32)
    # contact sheets
    al = A.astype(np.float32) / 255.0
    sheet = over(np.zeros(al.shape[:2] + (3,), np.float32) + bgc, al[..., :3], al[..., 3])
    bl.write_png(os.path.join(OUT, 'sprites-albedo.png'), np.round(sheet * 255).astype(np.uint8))
    nn = N.astype(np.float32) / 255.0
    sheet = over(np.zeros(al.shape[:2] + (3,), np.float32) + bgc, nn[..., :3], al[..., 3])
    bl.write_png(os.path.join(OUT, 'sprites-normal.png'), np.round(sheet * 255).astype(np.uint8))
    mk = np.repeat(nn[..., 3:4], 3, -1)
    sheet = over(np.zeros(al.shape[:2] + (3,), np.float32) + np.array([0.2, 0.0, 0.25], np.float32), mk, al[..., 3])
    bl.write_png(os.path.join(OUT, 'sprites-mask.png'), np.round(sheet * 255).astype(np.uint8))
    # assembled tanks from the json numbers
    types = [t for t in ('warden', 'bulwark', 'lynx') if t in doc['tanks']]
    cw, ch = 560, 330
    cols = 3
    Wc, Hc = cw * cols, ch * len(types)
    img = np.zeros((Hc, Wc, 3), np.float32)
    ppm = 48
    for r, t in enumerate(types):
        info = doc['tanks'][t]
        for c, (elev, wreck) in enumerate(((0.0, False), (35.0, False), (0.0, True))):
            cv = Canvas(cw, ch, ppm)
            ox, oy = 215, ch - 24
            hull_k = 0
            if wreck:
                cv.put(A, N, fr[t + '_wreck_hull'], 0, 0, ox, oy)
                cv.put(A, N, fr[t + '_wreck_turret'], info['turret'][0], info['turret'][1], ox, oy)
            else:
                cv.put(A, N, fr[t + '_hull_%d' % hull_k], 0, 0, ox, oy)
                tx, tz = info['turret']
                gx, gz = tx + info['gun'][0], tz + info['gun'][1]
                cv.put(A, N, fr[t + '_gun'], gx, gz, ox, oy, ang=math.radians(elev))
                if 'crew_commander' in fr:
                    cv.put(A, N, fr['crew_commander'], tx + info['hatch'][0], tz + info['hatch'][1], ox, oy)
                cv.put(A, N, fr[t + '_turret'], tx, tz, ox, oy)
            tile = lit(cv)
            gy = oy
            tile[gy:, :] *= 0.55
            img[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = tile
    bl.write_png(os.path.join(OUT, 'sprites-assembled.png'), np.round(np.clip(img, 0, 1) * 255).astype(np.uint8))
    print('review images written to', OUT)


main()
