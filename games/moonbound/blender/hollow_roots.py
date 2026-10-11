"""Hollow lane: the Elder Yew's roots (ho_root_a .. f, ho_root_arch) and the cave rocks (ho_rock_a .. d).

Each builder returns a Mesh built around the origin (front = -Y, base on z = 0); hollow_props recentres it on its footprint."""
import math
import random

from mathutils import Vector

import hollow_geo as G
from bl import Mesh, trans, rotz
from hollow_geo import bark_tube, braid, path_at, rootlet, moss_pads, blob, rock, stalagmite

PI = math.pi


def _branch(m, pts, rads, rng, f, side, length, r0, seed, mat='hl_bark', rise=0.18, wig=0.22, depth=1, tip=0.42, yaw=0.0):
    """A side root forking from the main one at fraction f: it leaves outward, arches, and dives into the ground."""
    p, tg, r = path_at(pts, rads, f)
    r0 = min(r0, r * 0.7)
    perp = Vector((-tg.y, tg.x, 0.0)).normalized() * side
    d = (perp * 0.85 + tg * rng.uniform(-0.6, 0.6)).normalized()
    if yaw:
        c, s = math.cos(yaw), math.sin(yaw)
        d = Vector((d.x * c - d.y * s, d.x * s + d.y * c, 0.0))
    n = 5
    ctrl = [Vector((p.x, p.y, p.z + 0.02))]
    radii = [r0 * 1.25]
    z0 = max(p.z, r0 * 1.0)
    for k in range(1, n + 1):
        t = k / n
        q = p + d * length * t
        q = q + Vector((rng.uniform(-wig, wig), rng.uniform(-wig, wig), 0.0)) * length * 0.35 * t
        q.z = max(0.03, z0 * (1 - t) ** 1.6 + rise * math.sin(PI * t) * length * 0.5 + r0 * 0.5 * (1 - t))
        ctrl.append(q)
        radii.append(r0 * (1 - t * (1 - tip)) * (1.0 + 0.12 * math.sin(t * 6 + seed)))
    bp, br = bark_tube(m, ctrl, radii, mat, seg=16, step=0.06, seed=seed, lump=0.22, ridge=0.015, floor=0.0, tile=max(0.45, 3.2 * r0),
                       ends=(False, True), knots=[(0.5, 0.2, 0.2)])
    if depth > 0 and length > 0.8:
        for sd_ in (-1, 1):
            _branch(m, bp, br, rng, rng.uniform(0.4, 0.75), sd_, length * rng.uniform(0.4, 0.55), r0 * 0.6,
                    seed + rng.random() * 9, mat, depth=depth - 1, wig=wig, tip=0.5)
    return bp, br


def _dress(m, pts, rads, rng, seed, moss=14, fringe=8, side_roots=4, length=1.4, side_r=0.14):
    """Side roots, hanging rootlets and moss pads on a main root."""
    for k in range(side_roots):
        f = (k + 0.5) / side_roots + rng.uniform(-0.08, 0.08)
        f = min(max(f, 0.08), 0.92)
        _branch(m, pts, rads, rng, f, 1 if k % 2 == 0 else -1, length * rng.uniform(0.7, 1.3), side_r * rng.uniform(0.8, 1.4),
                seed + k * 3.3, wig=0.2)
    for _ in range(fringe):
        f = rng.uniform(0.05, 0.95)
        p, tg, r = path_at(pts, rads, f)
        side = rng.choice((-1, 1))
        perp = Vector((-tg.y, tg.x, 0.0)).normalized() * side
        base = p + perp * r * rng.uniform(0.7, 0.95) + Vector((0, 0, r * rng.uniform(0.1, 0.5)))
        rootlet(m, base, rng.uniform(0.25, 0.7) * min(1.0, max(base.z, 0.2) + 0.2), 0.012, rng, perp.x * 0.15, perp.y * 0.15)
    moss_pads(m, pts, rads, rng, moss, size=(0.07, 0.2), seed=seed)


# ------------------------------------------------------------------------------------------------ roots

def root_a():
    """A great straight run, 6 m, humped, cabled, with forks and a mossy back."""
    m = Mesh('root_a')
    rng = random.Random(11)
    ctrl = [(-3.15, 0.45, 0.05), (-2.3, 0.15, 0.36), (-1.1, -0.2, 0.52), (0.1, -0.1, 0.72), (1.3, 0.28, 0.56), (2.4, 0.18, 0.32),
            (3.15, -0.15, 0.05)]
    radii = [0.12, 0.42, 0.52, 0.6, 0.52, 0.4, 0.12]
    pts, rads = braid(m, ctrl, radii, n=3, turns=0.4, seed=1.3, flat=0.85, knots=[(0.28, 0.35, 0.22), (0.66, 0.3, 0.18)], uturns=1)
    _dress(m, pts, rads, rng, 1.3, moss=14, fringe=6, side_roots=5, length=1.6, side_r=0.3)
    return m


def root_b():
    """A pair of great strands twisting round each other, 5 m."""
    m = Mesh('root_b')
    rng = random.Random(12)
    allp = []
    for sgn, sd in ((1, 2.1), (-1, 3.7)):
        ctrl = []
        N = 9
        for i in range(N):
            t = i / (N - 1)
            x = -2.6 + 5.2 * t
            ph = t * PI * 3.0
            y = 0.36 * sgn * math.cos(ph) + 0.1 * math.sin(t * 7 + sd)
            z = 0.4 + 0.2 * sgn * math.sin(ph) + 0.1 * math.sin(t * 5 + sd)
            if i in (0, N - 1):
                z = 0.05
            ctrl.append((x, y, z))
        radii = [0.12, 0.34, 0.38, 0.37, 0.38, 0.36, 0.38, 0.32, 0.12]
        pts, rads = braid(m, ctrl, radii, n=2, turns=0.5, off=0.45, srad=0.62, core=False, seed=sd, flat=0.9, knots=[(0.45, 0.3, 0.18)])
        allp.append((pts, rads))
    for i, (pts, rads) in enumerate(allp):
        _dress(m, pts, rads, rng, 2.0 + i, moss=7, fringe=3, side_roots=2, length=1.2, side_r=0.2)
    return m


def root_c():
    """A short, fat knuckle of a root, 4 m, rearing up into an arch you could crawl under."""
    m = Mesh('root_c')
    rng = random.Random(13)
    ctrl = [(-2.1, -0.1, 0.05), (-1.5, 0.0, 0.5), (-0.9, 0.1, 1.0), (0.0, 0.15, 1.25), (0.9, 0.05, 1.0), (1.5, -0.1, 0.5), (2.1, 0.1, 0.05)]
    radii = [0.14, 0.44, 0.5, 0.5, 0.48, 0.42, 0.14]
    pts, rads = braid(m, ctrl, radii, n=3, turns=0.5, seed=3.9, flat=0.95, knots=[(0.5, 0.4, 0.2), (0.2, 0.25, 0.18), (0.8, 0.25, 0.18)])
    _dress(m, pts, rads, rng, 3.9, moss=14, fringe=8, side_roots=4, length=1.3, side_r=0.28)
    return m


def root_d():
    """A curved run: a bend of about 90 degrees, 5 m of root."""
    m = Mesh('root_d')
    rng = random.Random(14)
    ctrl = []
    N = 9
    for i in range(N):
        t = i / (N - 1)
        a = PI * 0.5 * t
        R = 3.0
        x = -R + R * math.sin(a) + 0.15 * math.sin(t * 9)
        y = R * (1 - math.cos(a)) + 0.12 * math.cos(t * 7)
        z = 0.38 + 0.2 * math.sin(t * 6.0 + 0.5)
        if i in (0, N - 1):
            z = 0.05
        ctrl.append((x, y, z))
    radii = [0.12, 0.38, 0.46, 0.5, 0.47, 0.5, 0.44, 0.34, 0.12]
    pts, rads = braid(m, ctrl, radii, n=3, turns=0.45, seed=5.1, flat=0.88, knots=[(0.4, 0.3, 0.2)])
    _dress(m, pts, rads, rng, 5.1, moss=14, fringe=6, side_roots=5, length=1.5, side_r=0.26)
    return m


def root_e():
    """A knotted clump: five roots clenched into a gnarl."""
    m = Mesh('root_e')
    rng = random.Random(15)
    blob(m, (0, 0, 0.5), (0.7, 0.62, 0.55), 'hl_bark', seed=2.0, amp=0.12, freq=2.0, seg=24, rings=14)
    ctrl = []
    N = 12
    for i in range(N):
        t = i / (N - 1)
        a = t * PI * 2.0 * 1.15 + 0.4
        R = 0.55 + 0.12 * math.sin(t * 9)
        ctrl.append((R * math.cos(a), R * math.sin(a) * 0.9, 0.34 + 0.6 * math.sin(PI * t) + 0.1 * math.sin(a * 2)))
    bark_tube(m, ctrl, [0.14, 0.24, 0.3, 0.32, 0.32, 0.3, 0.3, 0.28, 0.27, 0.24, 0.2, 0.12], seed=7.7, lump=0.2, ridge=0.022, tile=1.0,
              floor=0.0, twist=1.5)
    for k in range(5):
        a = 0.4 + k * 2 * PI / 5 + rng.uniform(-0.2, 0.2)
        L = rng.uniform(1.6, 2.2)
        ctrl = [(0.3 * math.cos(a), 0.3 * math.sin(a), 0.5), (0.85 * math.cos(a + 0.2), 0.85 * math.sin(a + 0.2), 0.7),
                (1.35 * math.cos(a - 0.15), 1.35 * math.sin(a - 0.15), 0.46), (L * math.cos(a + 0.1), L * math.sin(a + 0.1), 0.05)]
        pts, rads = braid(m, ctrl, [0.38, 0.36, 0.26, 0.09], n=2, turns=0.6, off=0.45, srad=0.62, core=False, seed=8.0 + k, flat=0.9,
                          ends=(False, True))
        _dress(m, pts, rads, rng, 8.0 + k, moss=3, fringe=2, side_roots=1, length=0.8, side_r=0.12)
    moss_pads(m, [Vector((0, 0, 0.7)), Vector((0.02, 0, 0.72))], [0.5, 0.5], rng, 6, size=(0.1, 0.22))
    return m


def root_f():
    """A forked run: a trunk of 3 m splits into two arms, 5.5 m overall."""
    m = Mesh('root_f')
    rng = random.Random(16)
    trunk = [(-2.8, 0.1, 0.05), (-2.1, 0.05, 0.36), (-1.0, -0.05, 0.52), (0.1, 0.0, 0.58)]
    tp, tr = braid(m, trunk, [0.12, 0.42, 0.52, 0.56], n=3, turns=0.4, seed=9.1, flat=0.88, ends=(True, False))
    for sgn, sd in ((1, 9.5), (-1, 9.9)):
        arm = [(0.0, 0.0, 0.56), (0.9, 0.25 * sgn, 0.54), (1.8, 0.65 * sgn, 0.4), (2.5, 1.15 * sgn, 0.24), (3.0, 1.45 * sgn, 0.05)]
        ap, ar = braid(m, arm, [0.5, 0.42, 0.32, 0.2, 0.08], n=2, turns=0.5, off=0.45, srad=0.62, core=False, seed=sd, flat=0.9, ends=(False, True))
        _dress(m, ap, ar, rng, sd, moss=5, fringe=3, side_roots=2, length=1.0, side_r=0.14)
    _dress(m, tp, tr, rng, 9.1, moss=9, fringe=4, side_roots=3, length=1.3, side_r=0.26)
    return m


def root_arch():
    """The great arch: three cabled strands rise from flared feet 3 m apart and meet 3 m overhead; rootlets hang from it."""
    m = Mesh('root_arch')
    rng = random.Random(17)
    ctrl = []
    N = 13
    for i in range(N):
        t = i / (N - 1)
        a = PI * t
        x = -1.95 * math.cos(a) * (1.0 - 0.1 * math.sin(a))
        z = 3.0 * math.sin(a) ** 0.8 + 0.05 + 0.08 * math.sin(t * 11)
        y = 0.06 * math.sin(t * 6)
        if i in (0, N - 1):
            z = 0.05
        ctrl.append((x, y, z))
    radii = [0.2, 0.6, 0.5, 0.45, 0.41, 0.38, 0.37, 0.38, 0.41, 0.45, 0.5, 0.6, 0.2]
    pts, rads = braid(m, ctrl, radii, n=3, turns=0.32, off=0.48, srad=0.6, seed=21.0, flat=1.0, seg=22,
                      knots=[(0.18, 0.3, 0.18), (0.82, 0.3, 0.18), (0.5, 0.4, 0.18)])
    # buttresses at the feet
    for sx in (-1, 1):
        for k, (dy, L) in enumerate(((-0.7, 1.3), (0.6, 1.5), (0.0, 1.0))):
            ctrl = [(sx * 1.9, dy * 0.4, 0.5), (sx * (1.9 + L * 0.5), dy * 0.9, 0.3), (sx * (1.9 + L), dy * 1.6, 0.05)]
            bark_tube(m, ctrl, [0.34, 0.27, 0.17], seed=24.0 + k + sx, lump=0.2, ridge=0.015, tile=0.9, ends=(False, True), seg=14)
    moss_pads(m, pts, rads, rng, 10, size=(0.08, 0.18))
    for _ in range(18):
        f = rng.uniform(0.2, 0.8)
        p, tg, r = path_at(pts, rads, f)
        if p.z < 1.2:
            continue
        base = p + Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.55, -0.2), -r * rng.uniform(0.5, 0.9)))
        rootlet(m, base, rng.uniform(0.4, 1.3), 0.026, rng, rng.uniform(-0.1, 0.1), rng.uniform(-0.05, 0.05), floor=0.3)
    return m


# ------------------------------------------------------------------------------------------------ rocks

def rock_a():
    """A mossy boulder outcrop, 3 m wide."""
    m = Mesh('rock_a')
    rock(m, (0, 0, 0), (1.35, 0.95, 1.0), seed=4, bevel=0.06, npts=30, jag=0.3)
    rock(m, (1.15, -0.45, 0), (0.8, 0.6, 0.62), seed=5, bevel=0.05, npts=24)
    rock(m, (-1.2, 0.35, 0), (0.7, 0.55, 0.5), seed=6, bevel=0.05, npts=24)
    rock(m, (0.2, 0.75, 0), (0.6, 0.45, 0.45), seed=7, bevel=0.05, npts=20)
    rng = random.Random(41)
    for _ in range(14):
        a = rng.uniform(0, 6.28)
        r = rng.uniform(0.05, 0.3)
        rock(m, (math.cos(a) * rng.uniform(1.0, 1.7), math.sin(a) * rng.uniform(0.7, 1.1), 0), (r, r * 0.8, r * 0.6), seed=rng.random() * 100, bevel=0.015, npts=14)
    for _ in range(9):
        blob(m, (rng.uniform(-1.0, 1.1), rng.uniform(-0.6, 0.6), rng.uniform(0.7, 1.1)), (0.18, 0.14, 0.07), 'hl_moss', seed=rng.random() * 30,
             amp=0.05, freq=3.0)
    return m


def rock_b():
    """A cluster of stalagmites, 1.5 to 2.6 m tall."""
    m = Mesh('rock_b')
    rng = random.Random(42)
    spec = [(0.0, 0.0, 2.6, 0.38), (0.75, 0.25, 1.7, 0.3), (-0.65, 0.2, 1.4, 0.26), (0.3, -0.55, 1.0, 0.22), (-0.3, -0.5, 0.7, 0.18),
            (1.15, -0.2, 0.9, 0.2), (-1.1, -0.3, 0.55, 0.16)]
    for i, (x, y, h, r) in enumerate(spec):
        stalagmite(m, (x, y, 0), h, r, 'hl_rock_pale' if i % 2 else 'hl_rock', seed=i * 3 + 1, lean=(rng.uniform(-0.2, 0.2), rng.uniform(-0.1, 0.1)))
    rock(m, (0, 0.1, 0), (1.5, 0.9, 0.25), seed=8, bevel=0.04, npts=22)
    for _ in range(10):
        a = rng.uniform(0, 6.28)
        r = rng.uniform(0.06, 0.2)
        rock(m, (math.cos(a) * rng.uniform(0.9, 1.5), math.sin(a) * rng.uniform(0.5, 0.9), 0), (r, r, r * 0.7), seed=rng.random() * 100, bevel=0.012, npts=12)
    return m


def rock_c():
    """A low flat outcrop with a ledge, 3 m long."""
    m = Mesh('rock_c')
    rng = random.Random(43)
    rock(m, (0, 0, 0), (1.5, 0.8, 0.55), seed=9, bevel=0.05, npts=28, jag=0.3)
    rock(m, (-0.7, -0.35, 0), (0.9, 0.55, 0.85), seed=10, bevel=0.05, npts=24)
    rock(m, (0.95, 0.1, 0), (0.7, 0.55, 0.42), seed=11, bevel=0.04, npts=22)
    rock(m, (0.2, 0.55, 0), (0.7, 0.35, 0.9), seed=12, bevel=0.04, npts=22)
    for _ in range(12):
        a = rng.uniform(0, 6.28)
        r = rng.uniform(0.05, 0.22)
        rock(m, (math.cos(a) * rng.uniform(0.9, 1.9), math.sin(a) * rng.uniform(0.5, 0.9), 0), (r, r * 0.8, r * 0.55), seed=rng.random() * 100,
             bevel=0.012, npts=12)
    for _ in range(7):
        blob(m, (rng.uniform(-1.3, 1.3), rng.uniform(-0.4, 0.5), rng.uniform(0.45, 0.7)), (0.2, 0.15, 0.07), 'hl_moss_dry', seed=rng.random() * 30,
             amp=0.05, freq=3.0)
    return m


def rock_d():
    """A tall single spire, 3 m, with a small cairn at its foot."""
    m = Mesh('rock_d')
    rng = random.Random(44)
    stalagmite(m, (0, 0, 0), 3.0, 0.45, 'hl_rock', seed=13, lean=(0.25, -0.1), rings=18, flare=0.3)
    stalagmite(m, (0.55, 0.15, 0), 1.2, 0.2, 'hl_rock_pale', seed=14, lean=(-0.1, 0.0))
    rock(m, (-0.4, -0.25, 0), (0.5, 0.4, 0.3), seed=15, bevel=0.03, npts=20)
    rock(m, (0.1, -0.45, 0), (0.3, 0.25, 0.2), seed=16, bevel=0.02, npts=16)
    for _ in range(9):
        a = rng.uniform(0, 6.28)
        r = rng.uniform(0.05, 0.16)
        rock(m, (math.cos(a) * rng.uniform(0.5, 1.0), math.sin(a) * rng.uniform(0.4, 0.8), 0), (r, r, r * 0.7), seed=rng.random() * 100, bevel=0.01, npts=12)
    return m
