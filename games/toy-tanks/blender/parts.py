"""Reusable tank parts: wheels, tracks, barrels and small details (run inside Blender).

All sizes are in millimetres, in tank space: +X forward, +Y left, +Z up, ground at z = 0.
"""
from math import pi, sin, cos, radians
from mathutils import Vector, Matrix
import bmesh
import lib
from lib import PAINT, RUBBER, HUB, STAR, METAL

BELT_T = 3.8     # belt thickness
LUG_H = 2.4      # tread lug height
LUG_LEN = 3.6
TRACK_W = 26.0


def wheel(kind, r, width=22.0, segs=28):
    """One road wheel, sprocket or idler with its axle along Y at the origin, outer face towards +Y.
    A rubber tyre, a dark hub disc with a raised rim, and a big cap in the body paint (so it picks up the tank colour, like the
    toy in the picture). The hub is a shell that sits inside the tyre: only what can be seen is modelled."""
    tw = width
    k = r / 8.6  # details scale with the wheel
    bm = lib.bm_new()
    tyre_pts = [(-tw / 2, r * 0.55), (-tw / 2, r), (tw / 2, r), (tw / 2, r * 0.55)]
    prof = lib.fillet_path(tyre_pts, [0, 2.6 * k, 2.6 * k, 0], 4, closed=True)
    lib.merge(bm, lib.lathe(prof, segs, (0, 0, 0), (0, 1, 0), RUBBER, closed=True, up=(1, 0, 0)))
    ho = tw / 2 + 1.0 * k
    rh = r * (0.72 if kind == 'road' else 0.70)
    hp = lib.fillet_path([(ho - 2.0 * k, 0), (ho, 0), (ho, rh), (ho - 2.4 * k, rh)], [0, 0, 1.6 * k, 0], 4)
    lib.merge(bm, lib.lathe(hp[1:], segs, (0, 0, 0), (0, 1, 0), HUB, up=(1, 0, 0)))
    ring_pts = [(ho - 0.3 * k, rh * 0.82), (ho + 0.9 * k, rh * 0.74), (ho + 0.9 * k, rh * 0.58), (ho - 0.3 * k, rh * 0.52)]
    lib.merge(bm, lib.lathe(ring_pts, segs, (0, 0, 0), (0, 1, 0), HUB, up=(1, 0, 0)))
    cr = r * (0.40 if kind != 'idler' else 0.44)
    ch = 2.6 * k if kind != 'sprocket' else 3.2 * k
    cap = [(ho + 0.9 * k + ch * cos(a), cr * sin(a)) for a in [j * (pi / 2) / 5 for j in range(6)]]
    cap.append((ho + 0.9 * k - 0.8 * k, cr))
    lib.merge(bm, lib.lathe(cap, 20, (0, 0, 0), (0, 1, 0), PAINT, up=(1, 0, 0)))
    return bm


def wheel_set(wheels, side, y_c, width=22.0, segs=28):
    """Build every wheel as (name, bmesh in tank space, axle origin, kind, radius).
    `wheels` is a list of (kind, x, z, r) from rear to front; `side` is +1 (left) or -1 (right)."""
    out = []
    tag = 'L' if side > 0 else 'R'
    for i, (kind, x, z, r) in enumerate(wheels):
        bm = wheel(kind, r, width, segs)
        if side < 0:
            lib.mirror_y(bm)
        lib.translate(bm, x, side * y_c, z)
        out.append((f'wheel_{tag}{i}', bm, (x, side * y_c, z), kind, r))
    return out


def track(wheels, side, y_c, count_lugs=None, path_count=192, width=TRACK_W, thick=BELT_T, lug_h=LUG_H, lug_len=LUG_LEN, pitch=9.0):
    """Belt and lugs for one side. Returns (bmesh in tank space, coarse path in mm as (x, z) pairs, path length)."""
    circles = [(x, z, r) for kind, x, z, r in wheels]
    path, total = lib.track_path(circles, thick / 2.0, path_count)
    bm = lib.belt(path, side * y_c, width, thick, chamfer=min(1.0, thick * 0.26))
    n = count_lugs or int(round(total / pitch))
    lug_w = width - 4.0
    lib.merge(bm, lib.lugs(path, side * y_c, n, lug_len, lug_w, lug_h, thick / 2.0, bevel=min(0.7, lug_h * 0.28)))
    coarse = path[::2]
    return bm, coarse, total


def barrel(length, r, base_len=13.0, base_r=None, muzzle_len=5.0, muzzle_r=None, bore=None, segs=40, ball_r=None, twin=0.0, bulge=None):
    """The gun: origin at the trunnion, pointing +X. A ball mount (paint), a fat base sleeve, the tube and a
    muzzle ring with a dark bore. `twin` > 0 builds two tubes that far either side of the centre line.
    Returns (bmesh, muzzle_x)."""
    base_r = base_r or r * 1.32
    muzzle_r = muzzle_r or r * 1.24
    bore = bore or r * 0.62
    bm = lib.bm_new()
    offs = [0.0] if twin <= 0 else [-twin, twin]
    for oy in offs:
        kk = r / 5.0
        pts = [(0.0, 0.0), (0.0, base_r * 0.6), (base_len, base_r), (base_len + 1.8 * kk, r)]
        radii = [0, 0, 2.6 * kk, 1.4 * kk]
        if bulge:  # a fume extractor: a fatter section part-way along the tube (t0, t1, radius)
            b0, b1, br = bulge
            pts += [(b0, r), (b0 + 0.6 * kk, br), (b1 - 0.6 * kk, br), (b1, r)]
            radii += [0, 0.8 * kk, 0.8 * kk, 0]
        pts += [(length - muzzle_len - 1.6 * kk, r), (length - muzzle_len - 1.6 * kk, muzzle_r * 0.98), (length, muzzle_r), (length, bore), (length - 8.0 * kk, bore), (length - 8.0 * kk, 0.0)]
        radii += [1.2 * kk, 1.8 * kk, 1.9 * kk, 0.3 * kk, 0, 0]
        prof = lib.fillet_path(pts, radii, 4)
        t = lib.lathe(prof, segs, (0, oy, 0), (1, 0, 0), PAINT, up=(0, 0, 1))
        lib.merge(bm, t)
        dark = lib.cylinder((length - 7.8 * kk, oy, 0), (length - 7.6 * kk, oy, 0), bore - 0.05, segs=segs, mat=RUBBER)
        lib.merge(bm, dark)
    return bm, length


