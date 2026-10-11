"""Gloamwall kit: decor and light sources: hooded statues, the soul brazier, the lantern post, pillars and the rune obelisk.

All pieces are built facing south (-Y) on z = 0 around the origin, as seen from the game camera.
"""
import math
import random

from mathutils import Vector

import bl
from bl import Mesh, trans, rotx, roty, rotz, scale, PI
from gwkit_shapes import (rblock, poly_block, masonry, moss, moss_line, crack, crack_top, rivet, pick, STONES, crescent, star,
                          revolve, folds, smoothstep)


def circle_pts(c, rx, rz, n=24, plane='xz', closed=True):
    cx, cy, cz = c
    out = []
    for i in range(n + (1 if closed else 0)):
        a = 2 * PI * i / n
        if plane == 'xz':
            out.append((cx + rx * math.cos(a), cy, cz + rz * math.sin(a)))
        elif plane == 'xy':
            out.append((cx + rx * math.cos(a), cy + rz * math.sin(a), cz))
        else:
            out.append((cx, cy + rx * math.cos(a), cz + rz * math.sin(a)))
    return out


def lerp(a, b, t):
    return a + (b - a) * t


def prof(pts):
    """Piecewise-smooth interpolation helper over [(z, r), ...] -> r(z)."""
    def f(z):
        if z <= pts[0][0]:
            return pts[0][1]
        for (z0, r0), (z1, r1) in zip(pts, pts[1:]):
            if z <= z1:
                t = (z - z0) / max(z1 - z0, 1e-9)
                t = t * t * (3 - 2 * t)
                return lerp(r0, r1, t)
        return pts[-1][1]
    return f


# ------------------------------------------------------------------------------------------------ statues

def plinth(m, seed, w=1.0, d=0.9, h=0.5, panel=True):
    """A statue plinth: base slab, die with a carved roundel, cap slab. Height h."""
    rng = random.Random(seed)
    rblock(m, -w / 2, w / 2, -d / 2, d / 2, 0.0, 0.12, 'gw_stone_dark', seed=seed + 1, bevel=0.025, bseg=2, cuts=3, chip=0.008)
    rblock(m, -w / 2 + 0.07, w / 2 - 0.07, -d / 2 + 0.07, d / 2 - 0.07, 0.12, h - 0.08, 'gw_plinth', seed=seed + 2, bevel=0.02, cuts=3, chip=0.006,
           pillow=0.01)
    rblock(m, -w / 2 + 0.02, w / 2 - 0.02, -d / 2 + 0.02, d / 2 - 0.02, h - 0.08, h, 'gw_cap', seed=seed + 3, bevel=0.025, bseg=2, cuts=3,
           chip=0.006)
    if panel:
        yf = -d / 2 + 0.07
        rblock(m, -0.2, 0.2, yf - 0.012, yf + 0.04, 0.17, 0.4, 'gw_cap', seed=seed + 4, bevel=0.01, cuts=1, chip=0.003)
        m.grid_sheet(lambda u, v: (-0.16 + 0.32 * u, yf - 0.02, 0.385 - 0.2 * v), 1, 1, 'gw_crescent_carve', smooth=0.0)
    mr = random.Random(seed + 7)
    moss_line(m, -w / 2 + 0.1, w / 2 - 0.1, -d / 2 - 0.03, 0.12, mr, density=3, r=0.045)
    moss_line(m, -w / 2 + 0.1, w / 2 - 0.1, -d / 2 - 0.02, 0.0, mr, density=3, r=0.045, mat='gw_moss_dark')
    moss(m, mr.uniform(-0.3, 0.3), mr.uniform(-0.2, 0.1), h, 0.07, mr)


R_PROF = prof([(0.0, 0.40), (0.1, 0.375), (0.28, 0.31), (0.55, 0.255), (0.85, 0.21), (1.1, 0.185), (1.3, 0.21), (1.48, 0.245), (1.6, 0.19),
               (1.72, 0.11)])


def robe(m, seed, s=1.0, mat='gw_statue', sleeves=True):
    """The robed body of a stone figure standing on z = 0 and facing -Y: a smooth swelling robe with long pleats (ribs) down it."""
    rng = random.Random(seed)
    body = Mesh('robe')
    zs = [0.0, 0.05, 0.12, 0.22, 0.34, 0.5, 0.7, 0.9, 1.1, 1.25, 1.4, 1.52, 1.62, 1.7, 1.74]

    def fn(z):
        amp = 0.035 * (1.0 - z / 1.8)

        def r(th):
            return R_PROF(z) * (1 + amp * math.sin(9 * th + seed))
        return r
    revolve(body, [(z, fn(z)) for z in zs], mat, seg=40, closed_top=True, closed_bottom=True, mx=bl.scale(1.12, 0.92, 1.0))
    # pleats: long ribs from the chest to the hem, flaring, slightly wavy
    n = 15
    for k in range(n):
        th = 2 * PI * (k + rng.uniform(-0.2, 0.2)) / n + 0.2
        pts, rs = [], []
        for i in range(13):
            t = i / 12
            z = 1.38 - 1.33 * t
            drift = 0.1 * math.sin(t * 3.0 + k) * t
            rr = R_PROF(z) * (1.0 + 0.045 + 0.05 * t)
            pts.append((rr * 1.12 * math.cos(th + drift), rr * 0.92 * math.sin(th + drift), z))
            rs.append(0.022 + 0.032 * t ** 1.3)
        body.tube(pts, rs, mat, seg=6, cap=True)
    body.warp(0.005, 4.5, seed)
    m.add(body, bl.scale(s, s, s))
    body.free()


def hood(m, seed, s=1.0, mat='gw_statue', lean=0.12, z0=1.55):
    """A deep pointed cowl with a shadowed face opening, set on the neck at height z0 (before scale s)."""
    h = Mesh('hood')
    hp = prof([(0.0, 0.235), (0.1, 0.255), (0.25, 0.255), (0.4, 0.215), (0.52, 0.15), (0.62, 0.085), (0.7, 0.03), (0.74, 0.0)])
    zs = [0.0, 0.06, 0.14, 0.24, 0.34, 0.44, 0.53, 0.61, 0.68, 0.72, 0.74]
    revolve(h, [(z, (lambda zz: (lambda th: hp(zz) * (1 + 0.04 * math.sin(7 * th + seed + zz * 3))))(z)) for z in zs], mat, seg=28, closed_bottom=False,
            closed_top=True, mx=bl.scale(0.95, 1.1, 1.0))
    # the face opening: a dark hollow framed by the hood's front edge
    h.ball((0, -0.2, 0.27), (0.115, 0.09, 0.17), 'gw_void', seg=14, rings=8)
    h.ball((0, -0.17, 0.13), (0.065, 0.055, 0.05), 'gw_statue_dark', seg=10, rings=6)       # chin in the shadow
    rim = circle_pts((0, -0.235, 0.29), 0.135, 0.205, 22, plane='xz')
    h.tube(rim, 0.03, mat, seg=6, cap=False)
    h.warp(0.005, 6.0, seed + 3)
    mx = trans(0, 0, z0 * s) @ rotx(-lean) @ bl.scale(s, s, s)
    m.add(h, mx)
    h.free()


def mantle(m, seed, s=1.0, mat='gw_statue'):
    """A shoulder cape over the robe: a broad shallow ring with a few long folds."""
    c = Mesh('mantle')
    zs = [1.12, 1.24, 1.36, 1.48, 1.58, 1.64, 1.68]
    rr = [0.29, 0.315, 0.32, 0.30, 0.22, 0.17, 0.13]
    revolve(c, [(z, (lambda r0, zz: (lambda th: r0 * (1 + 0.04 * math.sin(8 * th + seed + zz * 4))))(r, z)) for z, r in zip(zs, rr)], mat, seg=36,
            closed_top=False, closed_bottom=False, mx=bl.scale(1.12, 0.95, 1.0))
    c.warp(0.004, 5.0, seed)
    m.add(c, bl.scale(s, s, s))
    c.free()


def statue_a(seed=201):
    """Hooded robed figure with praying hands (about 2.8 m with its plinth)."""
    m = Mesh('statue_a')
    plinth(m, seed)
    f = Mesh('fig')
    s = 1.0
    robe(f, seed, s)
    mantle(f, seed + 1, s)
    # sleeves and praying hands
    for sg in (-1, 1):
        S = (sg * 0.25, 0.0, 1.5)
        E = (sg * 0.3, -0.12, 1.2)
        H = (sg * 0.05, -0.27, 1.36)
        f.capsule(S, E, 0.085, 0.1, 'gw_statue', seg=14)
        f.capsule(E, H, 0.105, 0.07, 'gw_statue', seg=14)
        f.ball(E, (0.105, 0.105, 0.105), 'gw_statue', seg=12, rings=7)
    f.hull([(-0.045, -0.22, 1.28), (0.045, -0.22, 1.28), (-0.045, -0.32, 1.3), (0.045, -0.32, 1.3), (0.0, -0.27, 1.52)], 'gw_statue', bevel=0.01, smooth=40)
    # rope belt and tassels
    belt = [(0.19 * 1.12 * math.cos(2 * PI * i / 28), 0.19 * 0.92 * math.sin(2 * PI * i / 28), 1.08) for i in range(29)]
    f.tube(belt, 0.026, 'gw_statue_dark', seg=6, cap=False)
    for sg in (-1, 1):
        f.cyl((sg * 0.08, -0.19, 1.08), (sg * 0.11, -0.22, 0.74), 0.016, 0.01, 'gw_statue_dark', seg=6)
        f.ball((sg * 0.11, -0.22, 0.72), (0.03, 0.03, 0.04), 'gw_statue_dark', seg=6, rings=4)
    hood(f, seed + 2, s)
    f.warp(0.003, 7.0, seed + 9)
    m.add(f, trans(0, 0.0, 0.5))
    f.free()
    mr = random.Random(seed + 5)
    moss(m, -0.2, 0.0, 0.5 + 1.6, 0.07, mr, 'gw_moss_dark')
    moss(m, 0.22, 0.0, 0.5 + 1.57, 0.06, mr, 'gw_moss_dark')
    moss(m, 0.0, 0.14, 0.5 + 2.18, 0.05, mr)
    crack(m, [(0.1, 0.5 + 1.0), (0.13, 0.5 + 0.7), (0.08, 0.5 + 0.45)], -0.34, 0.006, rng=mr)
    return m


def statue_b(seed=211):
    """Hooded figure holding a stone crescent moon up (about 2.8 m with its plinth)."""
    m = Mesh('statue_b')
    plinth(m, seed)
    f = Mesh('fig')
    s = 0.76
    robe(f, seed, s)
    mantle(f, seed + 1, s)
    # arms raised, hands holding a crescent overhead (absolute metres: the crescent sits above the hood)
    for sg in (-1, 1):
        S = (sg * 0.2, 0.0, 1.14)
        E = (sg * 0.34, -0.1, 1.5)
        H = (sg * 0.14, -0.14, 1.92)
        f.capsule(S, E, 0.07, 0.08, 'gw_statue', seg=14)
        f.capsule(E, H, 0.085, 0.06, 'gw_statue', seg=14)
        f.ball(E, (0.09, 0.09, 0.09), 'gw_statue', seg=12, rings=7)
        f.ball(H, (0.055, 0.055, 0.055), 'gw_statue', seg=10, rings=6)
    cres = Mesh('cres')
    crescent(cres, 0.0, 0.0, 0.32, -0.05, 0.05, 'gw_statue', thick=0.55, off=0.42, tilt=PI / 2, bevel=0.012)
    f.add(cres, trans(0, -0.12, 2.14))
    cres.free()
    belt = [(0.19 * s * 1.12 * math.cos(2 * PI * i / 28), 0.19 * s * 0.92 * math.sin(2 * PI * i / 28), 1.08 * s) for i in range(29)]
    f.tube(belt, 0.022, 'gw_statue_dark', seg=6, cap=False)
    hood(f, seed + 2, s, lean=0.2)
    f.warp(0.003, 7.0, seed + 9)
    m.add(f, trans(0, 0.0, 0.5))
    f.free()
    mr = random.Random(seed + 5)
    moss(m, -0.18, 0.0, 0.5 + 1.2, 0.06, mr, 'gw_moss_dark')
    moss(m, 0.2, -0.05, 0.5 + 1.22, 0.06, mr, 'gw_moss_dark')
    crack(m, [(-0.1, 0.5 + 0.8), (-0.14, 0.5 + 0.55), (-0.09, 0.5 + 0.35)], -0.34, 0.006, rng=mr)
    return m


# ------------------------------------------------------------------------------------------------ brazier

def brazier(seed=221):
    """Tall black-iron brazier on a carved stone plinth (1.4 m), a glowing soul-coal bed in the bowl."""
    rng = random.Random(seed)
    m = Mesh('brazier')
    # the stone plinth
    rblock(m, -0.31, 0.31, -0.31, 0.31, 0.0, 0.14, 'gw_stone_dark', seed=seed + 1, bevel=0.022, bseg=2, cuts=3, chip=0.006)
    rblock(m, -0.255, 0.255, -0.255, 0.255, 0.14, 0.64, 'gw_plinth', seed=seed + 2, bevel=0.018, cuts=3, chip=0.005, pillow=0.008)
    rblock(m, -0.29, 0.29, -0.29, 0.29, 0.64, 0.72, 'gw_stone_d', seed=seed + 3, bevel=0.02, bseg=2, cuts=3, chip=0.005)
    rblock(m, -0.32, 0.32, -0.32, 0.32, 0.72, 0.82, 'gw_cap', seed=seed + 4, bevel=0.022, bseg=2, cuts=3, chip=0.006)
    # carved panel with a crescent in the die
    yf = -0.255
    rblock(m, -0.14, 0.14, yf - 0.012, yf + 0.04, 0.28, 0.54, 'gw_cap', seed=seed + 5, bevel=0.01, cuts=1, chip=0.003)
    m.grid_sheet(lambda u, v: (-0.11 + 0.22 * u, yf - 0.02, 0.5 - 0.2 * v), 1, 1, 'gw_crescent_carve', smooth=0.0)
    # the iron bowl on a stem
    bowl = [(0.82, 0.19), (0.86, 0.14), (0.98, 0.075), (1.06, 0.08), (1.12, 0.17), (1.2, 0.30), (1.3, 0.385), (1.37, 0.42), (1.395, 0.43)]
    m.lathe(bowl, 'gw_iron', seg=28, smooth=50.0, cap=False)
    # inner wall of the bowl
    inner = [(1.395, 0.405), (1.36, 0.395), (1.3, 0.365), (1.26, 0.33)]
    m.lathe(inner, 'gw_iron', seg=28, smooth=50.0, cap=False)
    # rim band and studs
    m.tube(circle_pts((0, 0, 1.38), 0.43, 0.43, 32, 'xy'), 0.02, 'gw_steel', seg=6, cap=False)
    for i in range(12):
        a = 2 * PI * i / 12
        rivet(m, 0.435 * math.cos(a), 0.435 * math.sin(a), 1.31, 0.02, 'gw_steel')
    # a decorative ring below the bowl and three scroll legs
    m.tube(circle_pts((0, 0, 1.0), 0.1, 0.1, 18, 'xy'), 0.022, 'gw_iron', seg=6, cap=False)
    for k in range(4):
        a = 2 * PI * k / 4 + PI / 4
        pts = []
        for i in range(10):
            t = i / 9
            rr = 0.12 + 0.2 * t ** 1.4
            zz = 0.86 + 0.34 * t + 0.05 * math.sin(PI * t * 2)
            pts.append((rr * math.cos(a + 0.5 * t), rr * math.sin(a + 0.5 * t), zz))
        m.tube(pts, [0.02 - 0.008 * i / 9 for i in range(10)], 'gw_iron', seg=6, cap=True)
    # the soul-coal bed: a dark crust with cyan glowing cracks and a few white-hot lumps
    m.ball((0, 0, 1.285), (0.36, 0.36, 0.09), 'char', seg=22, rings=8)
    r2 = random.Random(seed + 3)
    m.ball((0, 0, 1.30), (0.335, 0.335, 0.085), 'gw_soul', seg=22, rings=8)
    for i in range(11):
        a = r2.uniform(0, 2 * PI)
        rr = r2.uniform(0.0, 0.27)
        x, y = rr * math.cos(a), rr * math.sin(a)
        pts = [(x + r2.uniform(-0.07, 0.07), y + r2.uniform(-0.07, 0.07), 1.33 + r2.uniform(0.0, 0.07)) for _ in range(6)] + \
              [(x + r2.uniform(-0.06, 0.06), y + r2.uniform(-0.06, 0.06), 1.3) for _ in range(3)]
        m.hull(pts, 'char' if i % 3 else 'gw_soul_white', bevel=0.008, smooth=30)
    for i in range(9):
        a = r2.uniform(0, 2 * PI)
        rr = r2.uniform(0.05, 0.3)
        m.ball((rr * math.cos(a), rr * math.sin(a), 1.345), (0.045, 0.045, 0.03), 'gw_soul_white' if i % 4 == 0 else 'gw_soul', seg=6, rings=4)
    return m


def lantern_post(seed=231):
    """Iron post (2.4 m) with a crook arm and a hanging soul lantern. The lantern core is at (0.4, 0, 1.98)."""
    rng = random.Random(seed)
    m = Mesh('lantern_post')
    rblock(m, -0.19, 0.19, -0.19, 0.19, 0.0, 0.1, 'gw_stone_dark', seed=seed + 1, bevel=0.02, bseg=2, cuts=2, chip=0.005)
    rblock(m, -0.14, 0.14, -0.14, 0.14, 0.1, 0.3, 'gw_plinth', seed=seed + 2, bevel=0.018, cuts=2, chip=0.005)
    rblock(m, -0.17, 0.17, -0.17, 0.17, 0.3, 0.36, 'gw_cap', seed=seed + 3, bevel=0.02, bseg=2, cuts=2, chip=0.005)
    # tapered round post with rings
    post = [(0.36, 0.07), (0.5, 0.062), (1.0, 0.052), (2.0, 0.042), (2.2, 0.04)]
    m.lathe(post, 'gw_iron', seg=14, smooth=50.0, cap=True)
    for z, r in ((0.42, 0.085), (1.1, 0.07), (1.9, 0.065), (2.2, 0.07)):
        m.lathe([(z - 0.03, r * 0.8), (z - 0.01, r), (z + 0.01, r), (z + 0.03, r * 0.8)], 'gw_iron', seg=14, smooth=50.0, cap=True)
    m.ball((0, 0, 2.27), (0.045, 0.045, 0.06), 'gw_iron', seg=10, rings=6)
    # the crook: a curve out to +x and a hook
    pts = []
    for i in range(14):
        t = i / 13
        pts.append((0.42 * math.sin(t * PI / 2) ** 1.0 * 1.0, 0.0, 2.1 + 0.28 * (1 - math.cos(t * PI / 2)) * 0.9 + 0.07 * t))
    pts = [(0.0, 0.0, 2.05), (0.04, 0, 2.2), (0.12, 0, 2.31), (0.24, 0, 2.38), (0.34, 0, 2.38), (0.4, 0, 2.33), (0.4, 0, 2.28)]
    m.tube(pts, 0.022, 'gw_iron', seg=8, cap=True)
    # a scroll under the arm
    scroll = [(0.02, 0, 2.0), (0.1, 0, 2.02), (0.2, 0, 2.1), (0.28, 0, 2.22), (0.3, 0, 2.3)]
    m.tube(scroll, 0.012, 'gw_iron', seg=6, cap=True)
    # chain and lantern
    for i in range(3):
        m.ball((0.4, 0, 2.25 - i * 0.04), (0.02, 0.008, 0.026), 'gw_iron', seg=6, rings=4)
    cz = 1.98
    cx = 0.4
    # cage: six ribs, a cap, a base, glass panels, the glowing core
    m.lathe([(cz + 0.2, 0.0), (cz + 0.17, 0.05), (cz + 0.15, 0.13), (cz + 0.14, 0.14)], 'gw_iron', mx=trans(cx, 0, 0), seg=12, smooth=50.0, cap=False)
    m.lathe([(cz - 0.16, 0.0), (cz - 0.14, 0.09), (cz - 0.13, 0.12)], 'gw_iron', mx=trans(cx, 0, 0), seg=12, smooth=50.0, cap=False)
    m.cyl((cx, 0, cz + 0.2), (cx, 0, cz + 0.27), 0.012, 0.012, 'gw_iron', seg=6)
    for i in range(6):
        a = 2 * PI * i / 6
        m.cyl((cx + 0.115 * math.cos(a), 0.115 * math.sin(a), cz - 0.14), (cx + 0.115 * math.cos(a), 0.115 * math.sin(a), cz + 0.14), 0.011, 0.011, 'gw_iron',
              seg=6)
    m.lathe([(cz - 0.13, 0.108), (cz + 0.13, 0.108)], 'gw_glass', mx=trans(cx, 0, 0), seg=12, smooth=0.0, cap=False)
    m.ball((cx, 0, cz), (0.075, 0.075, 0.09), 'gw_soul_core', seg=14, rings=8)
    return m


# ------------------------------------------------------------------------------------------------ pillars and obelisk

def pillar_shaft(m, z0, z1, r, seed, flutes=14, amp=0.035, mat='gw_stone_b'):
    zs = [z0 + (z1 - z0) * i / 10 for i in range(11)]
    revolve(m, [(z, (lambda zz: (lambda th: r * (1.0 - 0.06 * (zz - z0) / (z1 - z0)) * (1 + amp * math.cos(flutes * th) ** 1.0 *
                                                                                    (1 if math.cos(flutes * th) > 0 else 0.6))))(z)) for z in zs],
            mat, seg=56, closed_top=True, closed_bottom=True)


def pillar(seed=241):
    """gw_pillar: a free-standing gothic pillar, 4 m: stepped square base, a fluted shaft ringed with slim colonnettes, a flared
    foliate capital and a square abacus."""
    rng = random.Random(seed)
    m = Mesh('pillar')
    rblock(m, -0.5, 0.5, -0.5, 0.5, 0.0, 0.22, 'gw_stone_dark', seed=seed + 1, bevel=0.03, bseg=2, cuts=3, chip=0.008)
    rblock(m, -0.42, 0.42, -0.42, 0.42, 0.22, 0.52, 'gw_plinth', seed=seed + 2, bevel=0.025, bseg=2, cuts=3, chip=0.007, pillow=0.01)
    rblock(m, -0.37, 0.37, -0.37, 0.37, 0.52, 0.6, 'gw_stone_d', seed=seed + 3, bevel=0.02, bseg=2, cuts=3, chip=0.005)
    # shaft: a core with eight slim colonnettes round it, bands at a third and two thirds
    sh = Mesh('shaft')
    pillar_shaft(sh, 0.6, 3.35, 0.27, seed, flutes=12, amp=0.03)
    for k in range(8):
        a = 2 * PI * k / 8 + PI / 8
        sh.cyl((0.27 * math.cos(a), 0.27 * math.sin(a), 0.6), (0.27 * math.cos(a), 0.27 * math.sin(a), 3.3), 0.06, 0.055, 'gw_stone_b', seg=10, smooth=60.0)
    for z in (1.45, 2.45):
        sh.lathe([(z - 0.06, 0.3), (z - 0.03, 0.37), (z + 0.03, 0.37), (z + 0.06, 0.3)], 'gw_stone_d', seg=32, smooth=50.0, cap=False)
    sh.warp(0.006, 3.0, seed)
    m.add(sh)
    sh.free()
    # capital: a flared bell with leaf lobes, a necking ring, abacus
    cap = [(3.3, 0.33), (3.4, 0.4), (3.55, 0.47), (3.68, 0.5), (3.72, 0.5)]
    m.lathe(cap, 'gw_stone_b', seg=32, smooth=60.0, cap=True)
    for k in range(8):
        a = 2 * PI * k / 8
        m.ball((0.5 * math.cos(a), 0.5 * math.sin(a), 3.52), (0.1, 0.1, 0.16), 'gw_stone_d', seg=8, rings=6)
    m.lathe([(3.72, 0.5), (3.74, 0.56), (3.86, 0.56), (3.9, 0.5)], 'gw_cap', seg=8, phase=PI / 8, smooth=0.0, cap=True, bevel=0.02)
    # the broken stub of an arch springing from the abacus on the east side: a rib that rises, curves out and ends ragged
    rblock(m, 0.34, 0.74, -0.17, 0.17, 3.9, 4.2, 'gw_stone_d', seed=seed + 7, bevel=0.03, bseg=2, cuts=2, chip=0.02, corner=(1, -1, 1, 0.12))
    rblock(m, 0.34, 0.58, -0.15, 0.15, 4.2, 4.42, 'gw_cap', seed=seed + 8, bevel=0.03, bseg=2, cuts=2, chip=0.02, corner=(1, 1, 1, 0.14))
    mr = random.Random(seed + 6)
    moss_line(m, -0.4, 0.4, -0.45, 0.22, mr, density=4, r=0.05)
    moss_line(m, -0.4, 0.4, -0.5, 0.0, mr, density=3, r=0.05, mat='gw_moss_dark')
    moss(m, -0.2, 0.0, 3.9, 0.08, mr)
    crack(m, [(0.1, 3.2), (0.14, 2.8), (0.08, 2.4), (0.12, 2.0)], -0.3, 0.007, rng=mr)
    return m


def pillar_broken(seed=251):
    """gw_pillar_broken: a 1.8 m stump with a jagged broken top and a fallen drum lying beside it."""
    rng = random.Random(seed)
    m = Mesh('pillar_broken')
    rblock(m, -0.5, 0.5, -0.5, 0.5, 0.0, 0.22, 'gw_stone_dark', seed=seed + 1, bevel=0.03, bseg=2, cuts=3, chip=0.008)
    rblock(m, -0.42, 0.42, -0.42, 0.42, 0.22, 0.52, 'gw_plinth', seed=seed + 2, bevel=0.025, bseg=2, cuts=3, chip=0.007, pillow=0.01)
    rblock(m, -0.37, 0.37, -0.37, 0.37, 0.52, 0.6, 'gw_stone_d', seed=seed + 3, bevel=0.02, bseg=2, cuts=3, chip=0.005)
    sh = Mesh('shaft')
    # the shaft up to ragged heights: a slanted cut
    pillar_shaft(sh, 0.6, 1.9, 0.27, seed, flutes=12, amp=0.03)
    for k in range(8):
        a = 2 * PI * k / 8 + PI / 8
        top = 1.45 + 0.35 * (0.5 + 0.5 * math.cos(a - 0.9)) + rng.uniform(-0.05, 0.05)
        sh.cyl((0.27 * math.cos(a), 0.27 * math.sin(a), 0.6), (0.27 * math.cos(a), 0.27 * math.sin(a), top), 0.06, 0.056, 'gw_stone_b', seg=10, smooth=60.0)
    sh.lathe([(1.39, 0.3), (1.42, 0.37), (1.48, 0.37), (1.51, 0.3)], 'gw_stone_d', seg=32, smooth=50.0, cap=False)
    # cut the shaft top with a slanted plane by clamping vertices
    for v in sh.bm.verts:
        lim = 1.55 + 0.3 * (v.co.x * math.cos(0.9) + v.co.y * math.sin(0.9)) / 0.3 * 0.5
        if v.co.z > lim and v.co.z > 1.2:
            v.co.z = lim + 0.02 * math.sin(v.co.x * 40 + v.co.y * 25)
    sh.warp(0.01, 4.0, seed)
    m.add(sh)
    sh.free()
    # the fallen drum, lying on its side to the west-south
    drum = Mesh('drum')
    drum.lathe([(0.0, 0.265), (0.02, 0.28), (0.52, 0.28), (0.54, 0.265)], 'gw_stone_b', seg=24, smooth=50.0, cap=True)
    for k in range(10):
        a = 2 * PI * k / 10
        drum.cyl((0.27 * math.cos(a), 0.27 * math.sin(a), 0.0), (0.27 * math.cos(a), 0.27 * math.sin(a), 0.54), 0.05, 0.05, 'gw_stone_b', seg=8, smooth=60.0)
    drum.warp(0.008, 4.0, seed + 2)
    m.add(drum, trans(-0.85, -0.2, 0.3) @ rotz(0.5) @ roty(PI / 2))
    drum.free()
    for i in range(10):
        cx, cy = rng.uniform(-0.8, 0.9), rng.uniform(-0.6, 0.5)
        if abs(cx) < 0.5 and abs(cy) < 0.5:
            continue
        r = rng.uniform(0.04, 0.12)
        pts = [(cx + rng.uniform(-r, r), cy + rng.uniform(-r, r), rng.uniform(0.0, r * 1.5)) for _ in range(8)] + \
              [(cx + sx * r, cy + sy * r, 0.0) for sx in (-1, 1) for sy in (-1, 1)]
        m.hull(pts, rng.choice(STONES), bevel=0.012, smooth=30)
    mr = random.Random(seed + 6)
    moss_line(m, -0.4, 0.4, -0.45, 0.22, mr, density=4, r=0.05)
    moss(m, 0.15, -0.05, 1.7, 0.1, mr)
    moss(m, -0.9, -0.2, 0.55, 0.12, mr)
    return m


def obelisk(seed=261):
    """gw_obelisk: a rune obelisk, 2.4 m, on two steps; a glowing carved crescent on the face and glowing rune strokes."""
    rng = random.Random(seed)
    m = Mesh('obelisk')
    rblock(m, -0.5, 0.5, -0.5, 0.5, 0.0, 0.14, 'gw_stone_dark', seed=seed + 1, bevel=0.025, bseg=2, cuts=3, chip=0.008)
    rblock(m, -0.42, 0.42, -0.42, 0.42, 0.14, 0.3, 'gw_plinth', seed=seed + 2, bevel=0.022, bseg=2, cuts=3, chip=0.007)
    # tapering shaft as a hull with a pyramidion
    b, t, z0, z1, z2 = 0.3, 0.2, 0.3, 2.05, 2.4
    m.hull([(sx * b, sy * b, z0) for sx in (-1, 1) for sy in (-1, 1)] + [(sx * t, sy * t, z1) for sx in (-1, 1) for sy in (-1, 1)], 'gw_stone_a',
           bevel=0.014, smooth=40)
    m.hull([(sx * t, sy * t, z1) for sx in (-1, 1) for sy in (-1, 1)] + [(0, 0, z2)], 'gw_cap', bevel=0.01, smooth=40)
    # the south face: recessed panel with the glowing crescent, plus rune strokes above and below
    yf = -(b + (t - b) * (1.0 - z0) / (z1 - z0))
    def face_y(z):
        return -(b + (t - b) * (z - z0) / (z1 - z0))
    zc = 1.35
    yc = face_y(zc)
    rblock(m, -0.19, 0.19, yc - 0.012, yc + 0.03, zc - 0.22, zc + 0.22, 'gw_stone_dark', seed=seed + 3, bevel=0.012, cuts=2, chip=0.002)
    m.grid_sheet(lambda u, v: (-0.16 + 0.32 * u, yc - 0.018, zc + 0.19 - 0.38 * v), 1, 1, 'gw_crescent_glow', smooth=0.0)
    # slanted so the sheet follows the face: the face leans back by (t - b)/(z1 - z0)
    for i, z in enumerate((0.55, 0.78, 1.7, 1.86)):
        yy = face_y(z)
        for k in range(3):
            x = -0.1 + 0.1 * k
            h = rng.uniform(0.04, 0.1)
            m.box(x - 0.012, x + 0.012, yy - 0.018, yy + 0.02, z - h, z + h, 'gw_soul')
        m.box(-0.13, 0.13, yy - 0.018, yy + 0.02, z - 0.012, z + 0.012, 'gw_soul')
    mr = random.Random(seed + 4)
    moss_line(m, -0.35, 0.35, -0.44, 0.3, mr, density=4, r=0.05)
    moss_line(m, -0.4, 0.4, -0.5, 0.0, mr, density=3, r=0.05, mat='gw_moss_dark')
    crack(m, [(-0.2, 0.5), (-0.15, 0.9), (-0.22, 1.2)], face_y(0.9) - 0.003, 0.006, rng=mr)
    return m
