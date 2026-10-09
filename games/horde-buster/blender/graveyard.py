"""Chapter 2 props: a moonlit night graveyard (tombstones, a crypt, dead trees, iron fences, candles, a broken coffin, a hearse ...).

Chunky cartoon stone in cold blue-greys, mossy greens, rusty iron and dead grey wood, with warm candle and lantern flames as the only
glow (a little eerie green behind the crypt door). Everything stands on the XY plane with its base centre at the origin (the pivot),
faces -Y toward the camera and uses `gy_*` materials (defined below) so the chapter can be restyled in one place.
The albedo is bright on purpose: the game lights the night with a dim cold key and violet ambient, which darkens it a lot.

Frames (56 px/m, pivot = base centre): tombstone_0..3 (rounded headstone, cross, cracked slab, obelisk), crypt, dead_tree_0..2,
fence_iron, gate_iron, candles, coffin, angel_statue, skull_pile, grave_open, lantern_post, hearse, bones_0..1, urn, tomb.
Anchors: glow.lantern_post and flame.candles (the lead adds the point lights), radius.<name> for the blocking props.
"""
import math
import random

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from mathutils import Vector
from props import rock, shaded_rock, sit, panel, clip_poly_x, crack_windscreen, one

PI = math.pi


# ------------------------------------------------------------------------------------------------ materials

def _materials():
    d = mats.define
    # stone: light cold blue-grey, a mid and a deep tone for shading by hand, a dark one for carvings and recesses
    d('gy_stone', base='#aeb9cc', base2='#8794ad', pattern='noise', pscale=4, pamt=0.55, bevel=0.03, bump=0.35, bscale=26, seed=201)
    d('gy_stone_hi', base='#cbd4e2', base2='#aab5c9', pattern='noise', pscale=4, pamt=0.5, bevel=0.03, bump=0.3, bscale=26, seed=202)
    d('gy_stone_lo', base='#8591aa', base2='#657189', pattern='noise', pscale=4, pamt=0.5, bevel=0.03, bump=0.35, bscale=26, seed=203)
    d('gy_stone_dark', base='#3b4358', bevel=0.01)
    d('gy_slate', base='#617092', base2='#4a5775', pattern='noise', pscale=5, pamt=0.55, bevel=0.025, bump=0.3, seed=204)
    d('gy_void', base='#0b0f19', bevel=0.004)
    # living things on the dead
    d('gy_moss', base='#4f9f4c', base2='#2f7040', pattern='noise', pscale=9, pamt=0.7, bevel=0.05, bump=0.6, bscale=40, seed=205)
    d('gy_moss_hi', base='#86cc5c', base2='#5ba84c', pattern='noise', pscale=8, pamt=0.6, bevel=0.05, bump=0.5, bscale=40, seed=206)
    d('gy_vine', base='#3c8744', bevel=0.01)
    d('gy_grass', base='#3fa070', base2='#26704f', pattern='fade', z0=0.0, z1=0.3, pamt=0.8, bevel=0.004)
    d('gy_dirt', base='#6d5543', base2='#47372c', pattern='noise', pscale=7, pamt=0.6, bevel=0.05, bump=0.7, bscale=34, seed=207)
    d('gy_dirt_dark', base='#2d241f', base2='#1d1714', pattern='noise', pscale=6, pamt=0.5, bevel=0.03, bump=0.4, seed=208)
    # iron and wood
    d('gy_iron', base='#3a4156', base2='#262b3b', pattern='noise', pscale=6, pamt=0.5, bevel=0.012, bump=0.15, seed=209)
    d('gy_iron_hi', base='#5d6985', bevel=0.012)
    d('gy_rust', base='#a35c36', base2='#6c3a24', pattern='noise', pscale=9, pamt=0.7, bevel=0.012, bump=0.5, seed=210)
    d('gy_wood', base='#85705c', base2='#5a493a', pattern='noise', pscale=8, pamt=0.6, bevel=0.03, bump=0.55, bscale=22, seed=211)
    d('gy_wood_dark', base='#4b3c31', base2='#33271f', pattern='noise', pscale=8, pamt=0.6, bevel=0.03, bump=0.55, bscale=22, seed=212)
    d('gy_wood_char', base='#4a443f', base2='#6c645b', pattern='noise', pscale=8, pamt=0.7, bevel=0.03, bump=0.6, bscale=22, seed=213)
    d('gy_coffin', base='#8a5230', base2='#5a331d', pattern='stripes', pscale=9, pamt=0.5, bevel=0.025, bump=0.35, seed=214)
    d('gy_coffin_in', base='#2a1a14', bevel=0.02)
    d('gy_satin', base='#7b4aa3', base2='#55307a', pattern='noise', pscale=9, pamt=0.6, bevel=0.03, bump=0.3, seed=215)
    d('gy_cobweb', base='#e8eef8', bevel=0.003)
    d('gy_crow', base='#1f2438', base2='#343b58', pattern='noise', pscale=8, pamt=0.5, bevel=0.02, seed=216)
    # light
    d('gy_flame', base='#ffb52e', base2='#fff0a0', pattern='fade', z0=0.0, z1=0.18, pamt=0.7, emit=1.0, bevel=0.003)
    d('gy_flame_core', base='#fff7d0', emit=1.0, bevel=0.003)
    d('gy_lantern', base='#ffc860', base2='#fff0b0', pattern='noise', pscale=10, pamt=0.5, emit=1.0, bevel=0.006, seed=217)
    d('gy_ghost', base='#7dffc8', emit=0.95, bevel=0.004)
    d('gy_wax', base='#efe4c6', base2='#cdbf9c', pattern='fade', z0=0.0, z1=0.3, pamt=0.6, bevel=0.012)
    d('gy_wax_red', base='#c0394a', base2='#8f2434', pattern='noise', pscale=6, pamt=0.5, bevel=0.012, seed=218)
    d('gy_brass', base='#d9a93c', base2='#a47a24', pattern='noise', pscale=8, pamt=0.5, bevel=0.01, seed=219)
    # the hearse
    d('gy_paint', base='#2a3046', base2='#161a28', pattern='noise', pscale=2.2, pamt=0.4, bevel=0.04, bump=0.2, shade=0.3, seed=220)
    d('gy_paint_scuff', base='#4a526c', bevel=0.01)
    d('gy_chrome', base='#b8c2d6', base2='#8e99b0', pattern='noise', pscale=6, pamt=0.5, bevel=0.012, seed=221)
    d('gy_glass', base='#3a5078', base2='#1d2c4a', pattern='fade', z0=0.8, z1=1.8, pamt=0.7, bevel=0.01)
    d('gy_glass_hole', base='#070a12', bevel=0.004)
    d('gy_curtain', base='#8a2a44', base2='#5c1a2e', pattern='noise', pscale=7, pamt=0.5, bevel=0.02, bump=0.3, seed=222)
    d('gy_tyre', base='#1c1d26', base2='#2d2f3c', pattern='noise', pscale=8, pamt=0.5, bevel=0.03, seed=223)
    d('gy_lamp_dead', base='#c8c0a2', bevel=0.01)


_materials()


# ------------------------------------------------------------------------------------------------ helpers

def blob(m, c, rx, ry, rz, mat='gy_moss', seg=10, rings=6):
    m.ball(c, (rx, ry, rz), mat, seg=seg, rings=rings)


def tuft(m, x, y, h=0.3, n=6, seed=0, mat='gy_grass', z=0.0):
    """A little clump of grass blades: thin cones leaning outward."""
    r = random.Random(seed)
    for k in range(n):
        a = 2 * PI * k / n + r.uniform(-0.3, 0.3)
        lean = r.uniform(0.06, 0.2)
        hh = h * r.uniform(0.7, 1.15)
        m.cyl((x, y, z), (x + math.cos(a) * lean, y + math.sin(a) * lean * 0.7, z + hh), 0.04, 0.0, mat, seg=4, smooth=0.0)


def vine(m, pts, r=0.03, leaf=0.1, seed=0):
    """Ivy: a thin tube with flat leaves on its camera side."""
    m.tube(pts, r, 'gy_vine', seg=5)
    rr = random.Random(seed)
    for p in pts[1:]:
        for _ in range(2):
            blob(m, (p[0] + rr.uniform(-0.09, 0.09), p[1] - 0.025, p[2] + rr.uniform(-0.07, 0.07)), leaf, leaf * 0.3, leaf * 0.75,
                 'gy_moss_hi' if rr.random() < 0.4 else 'gy_moss', seg=6, rings=4)


def engrave(m, x, z, w, h, y, mat='gy_stone_dark'):
    """A carved line on the front face at y (a thin dark box just proud of the stone)."""
    m.box(x - w / 2, x + w / 2, y - 0.014, y + 0.004, z, z + h, mat, bevel=0.004)


def crack_line(m, pts, y, w=0.018, mat='gy_stone_dark'):
    """A crack across a front face: pts = [(x, z), ...]."""
    for (x0, z0), (x1, z1) in zip(pts[:-1], pts[1:]):
        m.cyl((x0, y, z0), (x1, y, z1), w, w * 0.8, mat, seg=4, smooth=0.0)


def cobweb(m, corner, a, b, y, mat='gy_cobweb'):
    """A little web in a corner: spokes from the corner and two arcs. a, b = unit (x, z) directions along the two edges."""
    cx, cz = corner
    L = 0.5
    ends = [(cx + a[0] * L * s, cz + a[1] * L * s) for s in (1.0,)] + [(cx + b[0] * L, cz + b[1] * L)]
    mid = (cx + (a[0] + b[0]) * L * 0.5, cz + (a[1] + b[1]) * L * 0.5)
    for ex, ez in ends + [mid]:
        m.cyl((cx, y, cz), (ex, y, ez), 0.007, 0.005, mat, seg=3, smooth=0.0)
    for k in (0.4, 0.75):
        p0 = (cx + a[0] * L * k, cz + a[1] * L * k)
        p1 = (cx + (a[0] + b[0]) * L * 0.5 * k * 1.15, cz + (a[1] + b[1]) * L * 0.5 * k * 1.15)
        p2 = (cx + b[0] * L * k, cz + b[1] * L * k)
        for (x0, z0), (x1, z1) in ((p0, p1), (p1, p2)):
            m.cyl((x0, y, z0), (x1, y, z1), 0.006, 0.006, mat, seg=3, smooth=0.0)


def arch_pts(w, z0, z1, n=10, jitter=0.0, seed=0):
    """Outline of a headstone: straight sides up to z0, then a round top to z1 (x, z) points, counter-clockwise."""
    r = random.Random(seed)
    pts = [(-w / 2, 0.0), (w / 2, 0.0)]
    rad = w / 2
    zc = z1 - rad
    for k in range(n + 1):
        a = k * PI / n
        j = 1 + r.uniform(-jitter, jitter)
        pts.append((rad * math.cos(a) * j, zc + rad * math.sin(a) * j))
    return [(pts[0][0], pts[0][1]), (pts[1][0], pts[1][1])] + pts[2:]


# ------------------------------------------------------------------------------------------------ tombstones

def tombstone(kind):
    m = Mesh('tombstone')
    if kind == 0:                 # rounded headstone with an engraved cross and lines, moss at the foot
        w, t = 1.05, 0.3
        m.box(-0.78, 0.78, -0.4, 0.3, 0.0, 0.2, 'gy_stone_lo', bevel=0.04)
        pts = arch_pts(w, 1.1, 1.75, 12, 0.025, 3)
        m.prism(pts, -t / 2, t / 2, 'gy_stone', mx=trans(0, 0, 0.2), bevel=0.035)
        y = -t / 2 - 0.004
        engrave(m, 0.0, 1.14, 0.1, 0.46, y)                         # cross
        engrave(m, 0.0, 1.38, 0.34, 0.09, y)
        for z, ww in ((0.92, 0.52), (0.74, 0.38), (0.56, 0.46)):    # name lines
            engrave(m, 0.0, z, ww, 0.065, y)
        crack_line(m, [(0.28, 1.95), (0.2, 1.7), (0.3, 1.5), (0.22, 1.3)], y - 0.004, 0.014)
        blob(m, (-0.36, -0.12, 0.2), 0.34, 0.2, 0.15, 'gy_moss')
        blob(m, (0.4, -0.18, 0.18), 0.22, 0.15, 0.11, 'gy_moss_hi')
        blob(m, (-0.42, 0.0, 1.78), 0.22, 0.14, 0.09, 'gy_moss')
        tuft(m, -0.62, -0.28, 0.32, 6, 1)
        tuft(m, 0.66, -0.2, 0.26, 5, 2)
    elif kind == 1:               # a leaning celtic cross on stepped plinths
        m.box(-0.8, 0.8, -0.7, 0.7, 0.0, 0.22, 'gy_stone_lo', bevel=0.045)
        m.box(-0.58, 0.58, -0.5, 0.5, 0.22, 0.46, 'gy_stone', bevel=0.045)
        lean = Mesh('lean')
        lean.box(-0.19, 0.19, -0.16, 0.16, 0.0, 2.1, 'gy_stone', bevel=0.04)
        lean.box(-0.58, 0.58, -0.16, 0.16, 1.45, 1.78, 'gy_stone', bevel=0.04)
        ring = [(math.cos(2 * PI * k / 20) * 0.46, -0.0, 1.62 + math.sin(2 * PI * k / 20) * 0.46) for k in range(21)]
        lean.tube(ring, 0.07, 'gy_stone_hi', seg=8)
        lean.ball((0, -0.17, 1.62), (0.1, 0.03, 0.1), 'gy_stone_lo', seg=8, rings=5)
        for z, ww in ((0.75, 0.22), (0.55, 0.16)):
            engrave(lean, 0.0, z, ww, 0.055, -0.164)
        vine(lean, [(0.12, -0.18, 0.0), (0.15, -0.19, 0.4), (0.06, -0.19, 0.8), (0.14, -0.19, 1.15), (0.1, -0.19, 1.5)], 0.03, 0.1, 5)
        blob(lean, (-0.4, -0.03, 1.8), 0.17, 0.12, 0.07, 'gy_moss')
        m.add(lean, trans(0, 0, 0.46) @ rotx(-0.05) @ rotz(0.07))
        blob(m, (-0.4, -0.5, 0.22), 0.3, 0.16, 0.1, 'gy_moss')
        blob(m, (0.5, -0.46, 0.2), 0.22, 0.14, 0.09, 'gy_moss_hi')
        tuft(m, 0.7, -0.62, 0.3, 6, 3)
        tuft(m, -0.74, -0.58, 0.26, 5, 4)
    elif kind == 2:               # a slab cracked in two: the top half slid off and leans on the foot
        t = 0.3
        m.box(-0.8, 0.8, -0.4, 0.34, 0.0, 0.2, 'gy_stone_lo', bevel=0.04)
        low = [(-0.62, 0.0), (0.62, 0.0), (0.62, 0.62), (0.4, 0.78), (0.18, 0.56), (-0.05, 0.84), (-0.3, 0.6), (-0.62, 0.74)]
        m.prism(low, -t / 2, t / 2, 'gy_stone', mx=trans(0, 0, 0.2), bevel=0.035)
        for z, ww in ((0.55, 0.5), (0.38, 0.36)):
            engrave(m, 0.0, z + 0.2, ww, 0.06, -t / 2 - 0.004)
        crack_line(m, [(0.4, 0.98), (0.3, 0.75), (0.42, 0.45), (0.34, 0.25)], -t / 2 - 0.008, 0.014)
        up = Mesh('up')
        # the broken-off arch: a round cap with a jagged bottom
        cap = [(-0.6, 0.0), (-0.28, 0.24), (-0.02, 0.05), (0.2, 0.3), (0.42, 0.1), (0.6, 0.0), (0.6, 0.42)] + \
              [(0.6 * math.cos(a), 0.42 + 0.6 * math.sin(a)) for a in [PI * k / 8 for k in range(1, 8)]] + [(-0.6, 0.42)]
        up.prism(cap, -t / 2, t / 2, 'gy_stone_hi', bevel=0.035)
        engrave(up, 0.0, 0.55, 0.08, 0.34, -t / 2 - 0.004)
        engrave(up, 0.0, 0.72, 0.28, 0.07, -t / 2 - 0.004)
        blob(up, (-0.25, 0.0, 1.0), 0.2, 0.12, 0.06, 'gy_moss')
        m.add(up, trans(0.28, -0.5, 0.2) @ rotx(-0.5) @ rotz(0.28))
        for i, (x, y) in enumerate(((-0.62, -0.46), (0.9, -0.1), (-0.95, 0.1))):
            shaded_rock(m, (x, y, 0.1), (0.14, 0.12, 0.1), ('gy_stone_hi', 'gy_stone', 'gy_stone_lo'), seed=20 + i, n=9, bevel=0.01)
        blob(m, (-0.46, -0.3, 0.22), 0.28, 0.16, 0.09, 'gy_moss')
        tuft(m, 0.72, -0.5, 0.3, 6, 5)
        tuft(m, -0.92, -0.35, 0.26, 5, 6)
    else:                         # a tall obelisk on a stepped plinth, ivy climbing it
        m.box(-0.78, 0.78, -0.78, 0.78, 0.0, 0.26, 'gy_stone_lo', bevel=0.045)
        m.box(-0.6, 0.6, -0.6, 0.6, 0.26, 0.54, 'gy_stone', bevel=0.045)
        m.lathe([(0.54, 0.4), (0.62, 0.34), (2.55, 0.2)], 'gy_stone', mx=rotz(PI / 4), seg=4, smooth=0.0, cap=False, bevel=0.02)
        m.lathe([(2.55, 0.205), (2.95, 0.0)], 'gy_stone_hi', mx=rotz(PI / 4), seg=4, smooth=0.0, cap=False, bevel=0.02)
        y = -0.3
        engrave(m, 0.0, 1.5, 0.05, 0.42, y + 0.07)
        engrave(m, 0.0, 1.65, 0.2, 0.05, y + 0.07)
        for z, ww in ((1.2, 0.2), (1.05, 0.14)):
            engrave(m, 0.0, z, ww, 0.045, y + 0.07)
        vine(m, [(-0.2, -0.3, 0.55), (-0.26, -0.32, 0.95), (-0.14, -0.3, 1.3), (-0.22, -0.28, 1.68), (-0.12, -0.24, 2.0)], 0.032, 0.11, 7)
        blob(m, (0.3, -0.5, 0.52), 0.26, 0.14, 0.09, 'gy_moss')
        blob(m, (-0.4, -0.52, 0.28), 0.34, 0.16, 0.1, 'gy_moss_hi')
        tuft(m, 0.76, -0.74, 0.3, 6, 8)
        tuft(m, -0.8, -0.7, 0.26, 5, 9)
    return m


# ------------------------------------------------------------------------------------------------ the crypt

def crypt():
    """A small stone mausoleum: stepped plinth, columns either side of a barred iron door, a skull in the pediment, moss and ivy."""
    m = Mesh('crypt')
    H = 3.0
    D2 = 1.15                                                  # half depth: shallow, so the roof does not swallow the facade
    yf = -D2                                                   # front wall plane
    m.box(-2.4, 2.4, -D2 - 0.25, D2 + 0.25, 0.0, 0.35, 'gy_stone_lo', bevel=0.05)
    m.box(-2.1, 2.1, -D2, D2, 0.35, H, 'gy_stone', bevel=0.04)
    # steps
    m.box(-1.45, 1.45, yf - 0.85, yf - 0.2, 0.0, 0.16, 'gy_stone_lo', bevel=0.04)
    m.box(-1.25, 1.25, yf - 0.55, yf - 0.2, 0.16, 0.34, 'gy_stone', bevel=0.04)
    # corner pilasters and the two columns by the door
    for sx in (-1, 1):
        m.box(sx * 2.1 - 0.22, sx * 2.1 + 0.22, yf - 0.12, yf + 0.35, 0.35, H, 'gy_stone_hi', bevel=0.04)
        x = sx * 1.28
        m.box(x - 0.3, x + 0.3, yf - 0.36, yf - 0.02, 0.35, 0.6, 'gy_stone_hi', bevel=0.04)
        m.lathe([(0.6, 0.2), (0.75, 0.22), (H - 0.35, 0.2), (H - 0.28, 0.25)], 'gy_stone', mx=trans(x, yf - 0.19, 0), seg=12, smooth=40.0, cap=False)
        m.box(x - 0.3, x + 0.3, yf - 0.36, yf - 0.02, H - 0.35, H, 'gy_stone_hi', bevel=0.04)
        for z in (1.4, 2.05):                                    # column drums
            m.lathe([(z - 0.03, 0.2), (z, 0.235), (z + 0.03, 0.2)], 'gy_stone_hi', mx=trans(x, yf - 0.19, 0), seg=12, smooth=40.0, cap=False)
    # door: void, stone jambs and lintel, iron leaves
    m.box(-0.82, 0.82, yf - 0.03, yf + 0.02, 0.35, 2.25, 'gy_void')
    for sx in (-1, 1):
        m.box(sx * 0.82 - (0.2 if sx < 0 else 0.0), sx * 0.82 + (0.0 if sx < 0 else 0.2), yf - 0.2, yf, 0.35, 2.5, 'gy_stone_hi', bevel=0.03)
    m.box(-1.05, 1.05, yf - 0.28, yf - 0.02, 2.25, 2.6, 'gy_stone_hi', bevel=0.04)
    m.prism([(-1.2, 2.6), (1.2, 2.6), (0.0, H - 0.02)], yf - 0.3, yf - 0.02, 'gy_stone', bevel=0.02)
    m.box(-0.025, 0.025, yf - 0.06, yf - 0.035, 0.5, 2.15, 'gy_ghost')                      # a green glimmer in the door gap
    for sx in (-1, 1):
        x0 = sx * 0.04
        x1 = sx * 0.8
        lo, hi = min(x0, x1), max(x0, x1)
        for z0, z1 in ((0.45, 0.58), (1.2, 1.3), (2.12, 2.24)):
            m.box(lo, hi, yf - 0.1, yf - 0.05, z0, z1, 'gy_iron', bevel=0.012)           # cross rails
        for k in range(6):
            x = x0 + (x1 - x0) * (k + 0.5) / 6.0
            m.box(x - 0.028, x + 0.028, yf - 0.1, yf - 0.06, 0.45, 2.24, 'gy_iron', bevel=0.01)
            m.cyl((x, yf - 0.08, 2.24), (x, yf - 0.08, 2.4), 0.04, 0.0, 'gy_iron', seg=4, smooth=0.0)
        m.ball((sx * 0.2, yf - 0.13, 1.25), (0.09, 0.03, 0.09), 'gy_brass', seg=8, rings=5)     # ring pulls
    m.tube([(-0.78, yf - 0.14, 1.0), (-0.3, yf - 0.16, 0.9), (0.2, yf - 0.16, 0.92), (0.78, yf - 0.14, 1.0)], 0.03, 'gy_iron_hi', seg=6)  # chain
    m.box(-0.1, 0.1, yf - 0.2, yf - 0.14, 0.7, 0.9, 'gy_brass', bevel=0.02)             # padlock
    # frieze plaque
    m.box(-0.8, 0.8, yf - 0.06, yf, 2.62, 2.93, 'gy_stone_dark', bevel=0.01)
    for z, ww in ((2.8, 1.1), (2.68, 0.7)):
        engrave(m, 0.0, z, ww, 0.05, yf - 0.06, 'gy_stone')
    # cornice, pediment, ribbed slate roof
    m.box(-2.5, 2.5, -D2 - 0.4, D2 + 0.4, H, H + 0.2, 'gy_stone_hi', bevel=0.05)
    top = H + 1.55
    m.prism([(-2.3, H + 0.2), (2.3, H + 0.2), (0.0, top)], -D2 - 0.3, D2 + 0.3, 'gy_slate', bevel=0.03)
    for sx in (-1, 1):                                                                  # standing seams down each slope
        for t in (0.22, 0.5, 0.78):
            x = sx * 2.3 * (1 - t)
            z = H + 0.2 + (top - H - 0.2) * t
            n = (sx * (top - H - 0.2), 2.3)                                             # slope normal (x, z), unnormalised
            L = math.hypot(*n)
            m.cyl((x + n[0] / L * 0.035, -D2 - 0.31, z + n[1] / L * 0.035), (x + n[0] / L * 0.035, D2 + 0.31, z + n[1] / L * 0.035), 0.035, 0.035, 'gy_stone_lo', seg=4, smooth=0.0)
    m.prism([(-2.0, H + 0.2), (2.0, H + 0.2), (0.0, top - 0.16)], yf - 0.45, yf - 0.27, 'gy_stone', bevel=0.03)
    for sx in (-1, 1):                                                                  # rake mouldings
        m.cyl((sx * 2.3, yf - 0.46, H + 0.24), (0.0, yf - 0.46, top + 0.02), 0.07, 0.07, 'gy_stone_hi', seg=6, smooth=0.0)
    # the skull relief in the pediment
    yp = yf - 0.5
    m.ball((0.0, yp, H + 0.7), (0.26, 0.1, 0.24), 'bone', seg=12, rings=8)
    m.box(-0.12, 0.12, yp - 0.07, yp + 0.05, H + 0.42, H + 0.54, 'bone', bevel=0.02)
    for sx in (-1, 1):
        m.ball((sx * 0.1, yp - 0.07, H + 0.74), (0.07, 0.03, 0.08), 'gy_void', seg=8, rings=5)
    m.ball((0.0, yp - 0.08, H + 0.62), (0.03, 0.02, 0.04), 'gy_void', seg=6, rings=4)
    # a cross on the ridge and urns on the corners
    m.box(-0.07, 0.07, -0.07, 0.07, top - 0.1, top + 0.55, 'gy_stone', bevel=0.02)
    m.box(-0.28, 0.28, -0.07, 0.07, top + 0.25, top + 0.4, 'gy_stone', bevel=0.02)
    for sx in (-1, 1):
        m.lathe([(0.0, 0.0), (0.0, 0.16), (0.14, 0.2), (0.3, 0.17), (0.4, 0.1), (0.46, 0.14), (0.5, 0.0)], 'gy_stone_hi',
                mx=trans(sx * 2.3, yf - 0.3, H + 0.2), seg=10, smooth=40.0, cap=False)
    # moss, cracks, ivy, webs, tufts
    blob(m, (-1.6, yf - 0.1, 0.4), 0.55, 0.2, 0.16, 'gy_moss')
    blob(m, (1.5, yf - 0.1, 0.38), 0.5, 0.2, 0.14, 'gy_moss_hi')
    blob(m, (-1.5, yf - 0.3, 0.36), 0.6, 0.3, 0.12, 'gy_moss')
    blob(m, (1.7, yf - 0.3, 0.36), 0.5, 0.25, 0.1, 'gy_moss')
    blob(m, (-1.2, yf - 0.36, H + 0.26), 0.6, 0.12, 0.09, 'gy_moss')
    blob(m, (-1.5, -0.2, H + 0.5), 0.55, 0.5, 0.22, 'gy_moss')
    blob(m, (1.45, 0.4, H + 0.55), 0.3, 0.4, 0.14, 'gy_moss_hi')
    crack_line(m, [(-1.55, 2.9), (-1.65, 2.5), (-1.5, 2.1), (-1.6, 1.7)], yf - 0.004, 0.02)
    crack_line(m, [(1.6, 1.5), (1.7, 1.1), (1.55, 0.7)], yf - 0.004, 0.02)
    vine(m, [(1.9, yf - 0.16, 0.4), (1.98, yf - 0.16, 0.9), (1.85, yf - 0.16, 1.4), (1.95, yf - 0.16, 1.9), (1.82, yf - 0.16, 2.35)], 0.035, 0.12, 11)
    cobweb(m, (-0.82, 2.25), (0.0, -1.0), (1.0, 0.0), yf - 0.2)
    tuft(m, -2.0, yf - 0.3, 0.34, 7, 12)
    tuft(m, 2.05, yf - 0.35, 0.3, 6, 13)
    tuft(m, -1.5, yf - 0.95, 0.26, 5, 14)
    return m


def tomb():
    """A stone sarcophagus with its lid shoved ajar."""
    m = Mesh('tomb')
    m.box(-1.2, 1.2, -0.62, 0.62, 0.0, 0.16, 'gy_stone_lo', bevel=0.04)
    m.box(-1.08, 1.08, -0.5, 0.5, 0.16, 0.8, 'gy_stone', bevel=0.05)
    for sx in (-1, 1):                                                  # carved feet
        m.box(sx * 1.08 - 0.12, sx * 1.08 + 0.12, -0.56, -0.4, 0.16, 0.8, 'gy_stone_hi', bevel=0.04)
    for k in range(3):                                                  # panel carvings on the front
        x = -0.6 + k * 0.6
        m.box(x - 0.22, x + 0.22, -0.515, -0.49, 0.28, 0.66, 'gy_stone_lo', bevel=0.02)
    m.box(-1.0, 1.0, -0.4, 0.4, 0.78, 0.84, 'gy_void')                  # the dark gap the lid slid off
    lid = Mesh('lid')
    lid.box(-1.25, 1.25, -0.36, 0.36, 0.0, 0.3, 'gy_stone_hi', bevel=0.06)
    lid.prism([(-1.2, 0.3), (1.2, 0.3), (0.9, 0.42), (-0.9, 0.42)], -0.3, 0.3, 'gy_stone', bevel=0.03)
    lid.box(-0.07, 0.07, -0.37, -0.34, 0.06, 0.28, 'gy_stone_dark')
    lid.box(-0.2, 0.2, -0.37, -0.34, 0.16, 0.22, 'gy_stone_dark')
    blob(lid, (-0.7, 0.0, 0.42), 0.4, 0.26, 0.1, 'gy_moss')
    blob(lid, (0.8, -0.1, 0.38), 0.26, 0.2, 0.08, 'gy_moss_hi')
    m.add(lid, trans(0.28, 0.12, 0.84) @ rotz(-0.22))
    m.ball((0.95, -0.4, 0.82), (0.07, 0.05, 0.04), 'bone', seg=8, rings=5)  # a finger bone slipped out
    blob(m, (-1.0, -0.62, 0.2), 0.34, 0.16, 0.1, 'gy_moss')
    blob(m, (1.0, -0.64, 0.18), 0.26, 0.14, 0.09, 'gy_moss_hi')
    tuft(m, -1.3, -0.6, 0.3, 6, 21)
    tuft(m, 1.34, -0.55, 0.26, 5, 22)
    cobweb(m, (-0.9, 0.72), (0.0, -1.0), (1.0, 0.0), -0.52)
    return m


# ------------------------------------------------------------------------------------------------ dead trees

def limb(m, p0, d, length, r0, depth, rr, mat='gy_wood', twist=0.45, n=5, lift=0.12):
    """A curved, tapering dead limb that forks: a tube that wanders, then up to three thinner limbs from its outer half."""
    p = Vector(p0)
    dv = Vector(d).normalized()
    pts = [Vector(p)]
    radii = [r0]
    for i in range(n):
        dv = (dv + Vector((rr.uniform(-twist, twist), rr.uniform(-twist * 0.5, twist * 0.5), rr.uniform(-twist * 0.2, twist * 0.5) + lift))).normalized()
        p = p + dv * (length / n)
        pts.append(Vector(p))
        radii.append(max(0.014, r0 * (1.0 - (i + 1) / n) ** 0.8 + 0.012))
    m.tube([tuple(q) for q in pts], radii, mat, seg=6 if r0 > 0.06 else 4, smooth=70.0)
    if depth > 0:
        for k in range(2 + (rr.random() < 0.45)):
            idx = rr.randint(2, n)
            side = Vector((rr.choice((-1, 1)) * rr.uniform(0.5, 1.1), rr.uniform(-0.6, 0.6), rr.uniform(0.1, 0.8)))
            nd = (dv * 0.6 + side).normalized()
            limb(m, tuple(pts[idx]), nd, length * rr.uniform(0.5, 0.72), radii[idx] * 0.78, depth - 1, rr, mat, twist, max(3, n - 1), lift)


def roots(m, n, r0, spread, seed, mat='gy_wood'):
    rr = random.Random(seed)
    for k in range(n):
        a = 2 * PI * k / n + rr.uniform(-0.3, 0.3)
        L = spread * rr.uniform(0.8, 1.2)
        pts = [(math.cos(a) * 0.1, math.sin(a) * 0.1, 0.5 * r0 * 2), (math.cos(a) * L * 0.45, math.sin(a) * L * 0.45, 0.16),
               (math.cos(a) * L, math.sin(a) * L * 0.8, 0.02)]
        m.tube(pts, [r0 * 0.9, r0 * 0.55, 0.04], mat, seg=6)


def crow(m, c, yaw=0.0, s=1.0):
    """A perched crow, facing the camera-ish."""
    M = trans(*c) @ rotz(yaw) @ scale(s)
    m.ball((0, 0, 0.14), (0.12, 0.2, 0.13), 'gy_crow', mx=M, seg=10, rings=6, rot=rotx(0.35))
    m.ball((0, -0.17, 0.3), (0.085, 0.085, 0.085), 'gy_crow', mx=M, seg=8, rings=5)
    m.cyl((0, -0.24, 0.3), (0, -0.37, 0.27), 0.04, 0.0, 'gy_wood_char', seg=5, mx=M)
    for sx in (-1, 1):
        m.ball((sx * 0.065, -0.235, 0.325), (0.022, 0.014, 0.022), 'eye_glow_yellow', mx=M, seg=6, rings=4)
        m.ball((sx * 0.11, 0.02, 0.17), (0.04, 0.17, 0.1), 'gy_crow', mx=M, seg=8, rings=5, rot=rotx(0.2))
    m.cyl((0, 0.16, 0.1), (0, 0.4, 0.02), 0.07, 0.03, 'gy_crow', seg=5, mx=M)


def dead_tree(kind):
    m = Mesh('dead_tree')
    rr = random.Random(40 + kind)
    if kind == 0:                 # a big gnarled trunk with a hollow and long reaching limbs
        m.tube([(0, 0, 0.0), (0.04, 0.0, 0.8), (-0.1, 0.04, 1.8), (0.0, 0.0, 2.7), (0.06, 0.0, 3.4)], [0.62, 0.44, 0.36, 0.3, 0.24], 'gy_wood', seg=9, smooth=70.0)
        roots(m, 5, 0.26, 0.95, 3)
        m.ball((0.0, -0.3, 1.25), (0.2, 0.09, 0.34), 'gy_void', seg=10, rings=6)                   # the hollow
        m.ball((0.0, -0.28, 1.25), (0.27, 0.07, 0.42), 'gy_wood_dark', seg=10, rings=6)
        m.ball((0.0, -0.31, 1.25), (0.2, 0.09, 0.33), 'gy_void', seg=10, rings=6)
        for a, (dx, dy, dz) in enumerate(((-1.0, -0.2, 0.9), (1.0, 0.1, 0.9), (-0.35, 0.3, 1.2), (0.55, -0.4, 1.1), (0.0, 0.2, 1.4))):
            limb(m, (0.03 * dx, 0.0, 2.6 + 0.2 * a), (dx, dy, dz), 1.7, 0.2, 2, rr)
        blob(m, (0.0, -0.45, 0.25), 0.55, 0.28, 0.16, 'gy_moss')
        blob(m, (0.32, -0.3, 0.9), 0.14, 0.12, 0.25, 'gy_moss_hi')
        tuft(m, -0.7, -0.6, 0.34, 7, 31)
    elif kind == 1:               # a thin leaning tree full of twigs, with a crow
        lean = Mesh('lean')
        lean.tube([(0, 0, 0.0), (0.0, 0.0, 0.7), (0.06, 0.02, 1.7), (0.02, 0.0, 2.6), (0.1, 0.0, 3.4)], [0.38, 0.27, 0.22, 0.17, 0.12], 'gy_wood', seg=8, smooth=70.0)
        roots(lean, 4, 0.18, 0.7, 5)
        for a, (dx, dy, dz) in enumerate(((-1.0, 0.0, 1.0), (0.9, -0.2, 1.0), (-0.5, 0.2, 1.3), (0.4, 0.3, 1.3), (0.0, -0.3, 1.4), (-0.9, -0.3, 0.6))):
            limb(lean, (0.0, 0.0, 1.9 + 0.35 * a), (dx, dy, dz), 1.4, 0.12, 3, rr, twist=0.5)
        blob(lean, (0.0, -0.3, 0.2), 0.4, 0.2, 0.12, 'gy_moss')
        m.add(lean, rotz(0.0) @ roty(0.1))
        # a thick bough with the crow
        m.tube([(0.0, 0.0, 2.3), (-0.6, -0.3, 2.5), (-1.15, -0.45, 2.55)], [0.1, 0.075, 0.05], 'gy_wood', seg=6)
        crow(m, (-0.85, -0.38, 2.55), yaw=0.4, s=1.35)
        for k in range(5):                                                 # hanging strands of dead moss
            x = rr.uniform(-1.3, 1.3)
            m.tube([(x, -0.05, 3.1 + rr.uniform(-0.2, 0.3)), (x + 0.04, -0.06, 2.8), (x - 0.02, -0.06, 2.5 - rr.uniform(0, 0.3))], 0.014, 'gy_vine', seg=4)
        tuft(m, 0.55, -0.4, 0.32, 6, 32)
    else:                         # a lightning-split charred trunk: a short thick stump that forks into a tall prong and a snapped one
        m.tube([(0, 0, 0.0), (0.02, 0.0, 0.5), (0.0, 0.0, 1.0)], [0.62, 0.52, 0.46], 'gy_wood_char', seg=9, smooth=70.0)
        m.tube([(-0.16, 0.0, 0.9), (-0.38, 0.0, 1.9), (-0.55, 0.04, 2.9), (-0.8, 0.04, 3.9)], [0.4, 0.3, 0.2, 0.06], 'gy_wood_char', seg=7, smooth=70.0)
        m.tube([(0.2, 0.0, 0.9), (0.42, 0.0, 1.5), (0.5, 0.0, 2.0)], [0.34, 0.27, 0.2], 'gy_wood_char', seg=7, smooth=70.0)
        for k, (x, z, h, lean) in enumerate(((0.5, 1.95, 0.55, 0.15), (0.38, 1.95, 0.35, -0.3), (0.62, 1.9, 0.3, 0.4))):     # splinters
            m.cyl((x, 0.0, z), (x + lean * 0.5, 0.0, z + h), 0.09, 0.0, 'gy_wood_char', seg=4, smooth=0.0)
        m.prism([(-0.1, 0.95), (0.12, 0.95), (0.0, 1.8)], -0.02, 0.1, 'gy_flame')                                     # an ember glowing in the split
        roots(m, 5, 0.24, 0.95, 7, 'gy_wood_char')
        for a, (dx, dy, dz, z, sx) in enumerate(((-1.0, 0.0, 0.8, 2.4, -1), (-0.8, -0.3, 0.9, 1.8, -1), (1.0, 0.0, 0.5, 1.6, 1))):
            limb(m, (-0.4 if sx < 0 else 0.4, 0.0, z), (dx, dy, dz), 1.2, 0.1, 2, rr, 'gy_wood_char')
        blob(m, (0.0, -0.45, 0.2), 0.55, 0.25, 0.13, 'gy_moss')
        tuft(m, 0.7, -0.5, 0.3, 6, 33)
        tuft(m, -0.75, -0.4, 0.3, 6, 34)
    return m


# ------------------------------------------------------------------------------------------------ iron fence and gate

def iron_bar(m, x, z0, z1, y=0.0, r=0.045, tip=0.3, mat='gy_iron', tilt=None):
    """A vertical bar with a spear head and a collar; tilt = (rotation about x, about z) bends it."""
    b = Mesh('bar')
    b.cyl((0, 0, z0), (0, 0, z1), r, r, mat, seg=6, smooth=0.0)
    b.cyl((0, 0, z1 - 0.01), (0, 0, z1 + tip), r * 1.5, 0.0, 'gy_iron_hi', seg=4, smooth=0.0)
    b.box(-r * 1.8, r * 1.8, -r * 0.7, r * 0.7, z1 - 0.05, z1 + 0.0, mat, bevel=0.006)
    mx = trans(x, y, 0)
    if tilt:
        mx = mx @ trans(0, 0, z0) @ rotx(tilt[0]) @ rotz(tilt[1]) @ trans(0, 0, -z0)
    m.add(b, mx)


def fence_iron():
    m = Mesh('fence_iron')
    L = 3.0
    m.box(-L / 2 - 0.05, L / 2 + 0.05, -0.2, 0.2, 0.0, 0.3, 'gy_stone_lo', bevel=0.04)             # low stone plinth
    for sx in (-1, 1):
        x = sx * (L / 2 - 0.08)
        m.box(x - 0.1, x + 0.1, -0.1, 0.1, 0.28, 1.72, 'gy_iron_hi', bevel=0.015)
        m.box(x - 0.14, x + 0.14, -0.14, 0.14, 1.62, 1.72, 'gy_iron_hi', bevel=0.015)
        m.ball((x, 0, 1.84), (0.13, 0.13, 0.13), 'gy_iron_hi', seg=10, rings=7)
        m.cyl((x, 0, 1.92), (x, 0, 2.22), 0.05, 0.0, 'gy_iron_hi', seg=5, smooth=0.0)
    for z in (0.55, 1.38):
        m.box(-L / 2, L / 2, -0.04, 0.04, z, z + 0.09, 'gy_iron', bevel=0.012)
    n = 8
    for i in range(n):
        x = -L / 2 + 0.38 + i * (L - 0.76) / (n - 1)
        if i == 5:
            iron_bar(m, x, 0.3, 1.2, tip=0.0)                                                         # snapped off
            m.cyl((x + 0.18, -0.34, 0.06), (x + 0.5, -0.4, 0.1), 0.04, 0.03, 'gy_iron', seg=5, smooth=0.0)
            m.cyl((x + 0.5, -0.4, 0.1), (x + 0.6, -0.42, 0.14), 0.04, 0.0, 'gy_iron_hi', seg=4, smooth=0.0)
        elif i == 2:
            iron_bar(m, x, 0.3, 1.62, tilt=(-0.18, 0.12))                                             # bent toward the camera
        else:
            iron_bar(m, x, 0.3, 1.64)
    ring = [(math.cos(2 * PI * k / 16) * 0.2, 0.0, 0.96 + math.sin(2 * PI * k / 16) * 0.2) for k in range(17)]
    m.tube(ring, 0.025, 'gy_iron', seg=5)                                                            # a scroll ring in the middle
    for x, z in ((-0.55, 0.9), (0.9, 1.0)):
        m.ball((x, -0.07, z), (0.12, 0.03, 0.06), 'gy_rust', seg=8, rings=5)
    blob(m, (-0.9, -0.2, 0.3), 0.45, 0.18, 0.1, 'gy_moss')
    blob(m, (1.0, -0.22, 0.28), 0.34, 0.16, 0.09, 'gy_moss_hi')
    tuft(m, -1.2, -0.3, 0.3, 6, 41)
    tuft(m, 0.2, -0.3, 0.26, 5, 42)
    cobweb(m, (-0.2, 1.38), (-1.0, 0.0), (0.0, -1.0), -0.06)
    return m


def gate_leaf(w, h, rr, damaged=False):
    """One iron gate leaf in its own frame: hinge edge at x = 0, extends to +w along x, bottom at z = 0."""
    g = Mesh('leaf')
    g.box(0.0, 0.1, -0.05, 0.05, 0.15, h, 'gy_iron_hi', bevel=0.012)
    g.box(w - 0.1, w, -0.05, 0.05, 0.15, h - 0.25, 'gy_iron_hi', bevel=0.012)
    for z in (0.25, h - 0.55):
        g.box(0.0, w, -0.04, 0.04, z, z + 0.1, 'gy_iron', bevel=0.012)
    n = 6
    for i in range(1, n):
        x = w * i / n
        iron_bar(g, x, 0.2, h - 0.5 + 0.28 * math.sin(PI * x / w), tip=0.25, r=0.04)
    # an arched top rail
    arc = [(w * k / 12, 0.0, h - 0.5 + 0.28 * math.sin(PI * k / 12) - 0.02) for k in range(13)]
    g.tube(arc, 0.04, 'gy_iron', seg=5)
    g.ball((w * 0.5, -0.02, h * 0.45), (0.2, 0.04, 0.2), 'gy_iron_hi', seg=10, rings=6)                 # a boss in the middle
    ring = [(w * 0.5 + math.cos(2 * PI * k / 14) * 0.23, -0.03, h * 0.45 + math.sin(2 * PI * k / 14) * 0.23) for k in range(15)]
    g.tube(ring, 0.022, 'gy_iron', seg=5)
    return g


def gate_iron():
    """Two stone gate piers with ball finials and a pair of iron gates hanging open on rusty hinges."""
    m = Mesh('gate_iron')
    rr = random.Random(4)
    xp = 1.95
    for sx in (-1, 1):
        x = sx * xp
        m.box(x - 0.5, x + 0.5, -0.5, 0.5, 0.0, 0.35, 'gy_stone_lo', bevel=0.05)
        m.box(x - 0.38, x + 0.38, -0.38, 0.38, 0.35, 2.55, 'gy_stone', bevel=0.04)
        for z in (0.9, 1.55):
            engrave(m, x, z, 0.46, 0.05, -0.39, 'gy_stone_lo')
        m.box(x - 0.5, x + 0.5, -0.5, 0.5, 2.5, 2.72, 'gy_stone_hi', bevel=0.05)
        m.lathe([(2.72, 0.0), (2.72, 0.34), (2.82, 0.3), (2.95, 0.2), (3.0, 0.0)], 'gy_stone_hi', mx=trans(x, 0, 0), seg=10, smooth=50.0, cap=False)
        m.ball((x, 0.0, 3.2), (0.28, 0.28, 0.28), 'gy_stone_hi', seg=12, rings=8)
        blob(m, (x - sx * 0.1, -0.5, 0.4), 0.42, 0.22, 0.14, 'gy_moss')
        blob(m, (x + sx * 0.25, -0.34, 2.75), 0.3, 0.15, 0.08, 'gy_moss_hi')
        # hinges
        for z in (0.6, 1.9):
            m.box(x - sx * 0.38 - sx * 0.05 - 0.1, x - sx * 0.38 - sx * 0.05 + 0.1, -0.22, -0.16, z, z + 0.1, 'gy_rust', bevel=0.01)
    # the leaves: hinged at the piers, swung open toward the camera by different amounts, the left one sagging off a hinge
    w = xp * 2 - 0.76 - 0.1
    wl = w / 2 + 0.28
    left = gate_leaf(wl, 2.2, rr)
    m.add(left, trans(-xp + 0.38, -0.3, 0.0) @ rotz(-0.78))
    right = gate_leaf(wl, 2.2, rr)
    m.add(right, trans(xp - 0.38, -0.3, 0.0) @ rotz(PI + 0.42) @ scale(1, 1, 1))
    # a wrought arch with a lantern bracket over the gap: an iron arc between the piers with a ring
    arc = [(math.cos(PI * k / 16) * (xp - 0.38) * -1, 0.0, 2.62 + math.sin(PI * k / 16) * 0.75) for k in range(17)]
    m.tube(arc, 0.055, 'gy_iron', seg=6)
    for k in range(1, 16, 2):
        p = arc[k]
        m.cyl((p[0], 0, p[2]), (p[0], 0, p[2] + 0.28), 0.04, 0.0, 'gy_iron_hi', seg=4, smooth=0.0)
    m.ball((0.0, 0.0, 3.5), (0.17, 0.05, 0.17), 'gy_iron_hi', seg=10, rings=6)
    # a broken chain and padlock on the ground
    m.tube([(-0.4, -0.7, 0.04), (-0.1, -0.85, 0.05), (0.2, -0.78, 0.04), (0.5, -0.9, 0.05)], 0.028, 'gy_iron_hi', seg=5)
    m.box(0.5, 0.68, -0.98, -0.84, 0.0, 0.2, 'gy_brass', bevel=0.02)
    tuft(m, -0.5, -0.55, 0.3, 6, 51)
    tuft(m, 1.0, -0.7, 0.28, 6, 52)
    return m


# ------------------------------------------------------------------------------------------------ candles, coffin

# x, y, height, radius, wax of each candle in the cluster (the cluster is built 1.3x, see candle_cluster)
CANDLES = [(-0.06, 0.02, 0.5, 0.1, 'gy_wax'), (0.28, -0.12, 0.34, 0.085, 'gy_wax_red'), (-0.3, -0.12, 0.28, 0.08, 'gy_wax'),
           (0.12, 0.18, 0.4, 0.09, 'gy_wax'), (-0.2, 0.2, 0.22, 0.075, 'gy_wax_red'), (0.36, 0.14, 0.18, 0.07, 'gy_wax'),
           (-0.02, -0.28, 0.16, 0.065, 'gy_wax')]


def candle_cluster():
    m = Mesh('candles')
    rr = random.Random(8)
    m.lathe([(0.0, 0.0), (0.0, 0.5), (0.05, 0.52), (0.1, 0.46), (0.12, 0.0)], 'gy_stone', seg=12, smooth=40.0, cap=False)     # a flat stone
    items = CANDLES
    for x, y, h, r, mat in items:
        z0 = 0.12
        m.lathe([(0.0, r * 1.5), (0.04, r * 1.3), (0.1, r), (h, r * 0.92), (h + 0.02, 0.0)], mat, mx=trans(x, y, z0), seg=10, smooth=50.0, cap=False)
        m.ball((x, y, z0 + 0.02), (r * 2.3, r * 2.0, 0.035), mat, seg=10, rings=5)                    # wax puddle
        m.ball((x + r * 0.8, y - r * 0.7, z0 + h * 0.8), (r * 0.35, r * 0.35, r * 0.9), mat, seg=6, rings=4)   # a drip
        m.cyl((x, y, z0 + h), (x, y, z0 + h + 0.05), 0.012, 0.012, 'gy_wood_char', seg=4, smooth=0.0)
        fz = z0 + h + 0.04
        m.lathe([(0.0, 0.0), (0.02, 0.06), (0.09, 0.075), (0.2, 0.04), (0.28, 0.0)], 'gy_flame', mx=trans(x, y, fz), seg=8, smooth=60.0, cap=False)
        m.lathe([(0.01, 0.0), (0.03, 0.035), (0.1, 0.03), (0.15, 0.0)], 'gy_flame_core', mx=trans(x, y, fz), seg=6, smooth=60.0, cap=False)
    # a little skull and a dead rose keep the candles company
    skull(m, (0.55, -0.3, 0.12), 0.55, yaw=0.5)
    m.tube([(-0.5, -0.3, 0.1), (-0.62, -0.32, 0.22), (-0.66, -0.3, 0.34)], 0.014, 'gy_vine', seg=4)
    m.ball((-0.66, -0.31, 0.38), (0.055, 0.05, 0.05), 'gy_curtain', seg=8, rings=5)
    m.transform(scale(1.3))
    return m


def skull(m, c, s=1.0, yaw=0.0, tilt=-0.5, glint=False):
    """A cartoon skull (chunky cranium, cheek bones, dark sockets, jaw with teeth) facing -Y, tilted up toward the camera."""
    M = trans(*c) @ rotz(yaw) @ rotx(tilt) @ scale(s)
    m.ball((0, 0, 0.19), (0.2, 0.21, 0.19), 'bone', mx=M, seg=12, rings=8)
    m.ball((0, -0.06, 0.1), (0.16, 0.14, 0.09), 'bone', mx=M, seg=10, rings=6)
    for sx in (-1, 1):
        m.ball((sx * 0.085, -0.17, 0.19), (0.062, 0.05, 0.07), 'gy_void', mx=M, seg=8, rings=5)
        if glint:
            m.ball((sx * 0.085, -0.2, 0.19), (0.03, 0.02, 0.035), 'gy_ghost', mx=M, seg=6, rings=4)
    m.ball((0, -0.2, 0.1), (0.028, 0.03, 0.04), 'gy_void', mx=M, seg=6, rings=4)
    m.box(-0.1, 0.1, -0.2, -0.1, 0.0, 0.07, 'bone', mx=M, bevel=0.015)
    for x in (-0.07, -0.025, 0.025, 0.07):
        m.box(x - 0.011, x + 0.011, -0.205, -0.19, 0.01, 0.06, 'teeth', mx=M)
    m.ball((0, -0.08, -0.005), (0.12, 0.1, 0.05), 'bone', mx=M, seg=8, rings=5)


def coffin():
    """A wooden coffin lying slantwise, lid shoved half off, a skeleton inside and a bony hand over the edge."""
    m = Mesh('coffin')
    plan = [(-1.05, -0.21), (-0.5, -0.34), (0.5, -0.43), (1.05, -0.27), (1.05, 0.27), (0.5, 0.43), (-0.5, 0.34), (-1.05, 0.21)]
    # prism(pts_xz, y0, y1) is built in the XZ plane and extruded along Y: lay it flat with rotx(90 degrees), plan y -> -z
    flat = rotx(PI / 2)
    m.prism([(x, -y) for x, y in plan], 0.0, 0.5, 'gy_coffin', mx=flat, bevel=0.03)
    inner = [(x * 0.84, y * 0.8) for x, y in plan]
    m.prism([(x, -y) for x, y in inner], 0.42, 0.53, 'gy_satin', mx=flat)
    rim = [(x, y, 0.53) for x, y in plan] + [(plan[0][0], plan[0][1], 0.53)]
    m.tube(rim, 0.06, 'gy_coffin', seg=6)
    m.prism([(x * 0.86, -y * 0.84) for x, y in plan], 0.45, 0.47, 'gy_coffin_in', mx=flat)
    # ribs, spine and a skull lying in it
    for k in range(5):
        x = 0.1 + k * 0.1
        w = 0.17 - k * 0.012
        m.tube([(x, -w, 0.5), (x - 0.02, 0.0, 0.62), (x, w, 0.5)], 0.016, 'bone', seg=5)
    m.tube([(-0.4, 0.0, 0.5), (0.0, 0.0, 0.52), (0.5, 0.0, 0.54)], 0.025, 'bone', seg=5)
    skull(m, (0.78, 0.0, 0.5), 0.8, yaw=PI / 2, tilt=-0.55)
    # the lid, slid toward the foot and tilted, with a cross and a splintered corner
    lid = Mesh('lid')
    lid.prism([(x * 1.04, -y * 1.06) for x, y in plan], 0.0, 0.1, 'gy_coffin', mx=flat, bevel=0.03)
    lid.box(-0.7, 0.4, -0.05, 0.05, 0.1, 0.13, 'gy_wood_dark', bevel=0.01)
    lid.box(-0.1, 0.0, -0.2, 0.2, 0.1, 0.13, 'gy_wood_dark', bevel=0.01)
    m.add(lid, trans(-0.95, 0.12, 0.54) @ rotz(0.22) @ rotx(-0.08))
    for x in (-0.2, 0.4):                                                      # brass handles
        m.box(x - 0.1, x + 0.1, -0.455, -0.43, 0.2, 0.28, 'gy_brass', bevel=0.012)
    # skeleton hand draped over the near edge
    m.tube([(0.9, -0.3, 0.5), (0.95, -0.46, 0.4), (0.98, -0.55, 0.2)], 0.025, 'bone', seg=5)
    m.ball((0.99, -0.58, 0.15), (0.06, 0.05, 0.03), 'bone', seg=8, rings=5)
    for k in range(4):
        a = -0.4 + k * 0.27
        m.cyl((0.99 + math.sin(a) * 0.02, -0.6, 0.14), (0.99 + math.sin(a) * 0.14, -0.74, 0.04), 0.013, 0.01, 'bone', seg=4, smooth=0.0)
    # splinters, dirt clods and a web
    for a, x, y in ((0.3, 0.4, -0.46), (-0.4, -0.3, -0.4), (0.8, 1.0, 0.32)):
        m.prism([(-0.05, 0.0), (0.05, 0.0), (0.0, 0.2)], -0.015, 0.015, 'gy_coffin', mx=trans(x, y, 0.5) @ rotz(a) @ rotx(-0.35))
    for k, (x, y) in enumerate(((-1.1, -0.4), (1.2, -0.3), (0.2, 0.55), (-0.5, -0.55))):
        shaded_rock(m, (x, y, 0.08), (0.17, 0.14, 0.1), ('gy_dirt', 'gy_dirt', 'gy_dirt_dark'), seed=60 + k, n=8, bevel=0.01)
    tuft(m, -1.25, -0.2, 0.28, 5, 61)
    tuft(m, 1.3, 0.1, 0.26, 5, 62)
    return m


# ------------------------------------------------------------------------------------------------ statue, bones, graves, lantern, urn

def feather_wing(broken=False):
    """One stone wing in the XZ plane (root at the origin, sweeping out to +x and up), with carved feather ridges."""
    w = Mesh('wing')
    out = [(0.0, 0.0), (0.45, -0.38), (0.9, -0.1), (1.22, 0.5), (1.34, 1.2), (1.2, 1.9), (0.88, 2.3), (0.62, 1.8), (0.34, 1.0)]
    if broken:
        out = [(0.0, 0.0), (0.45, -0.38), (0.9, -0.1), (1.22, 0.5), (1.3, 1.0), (1.05, 1.15), (0.95, 1.4), (0.7, 1.35), (0.5, 1.0), (0.34, 0.8)]
    w.prism(out, -0.05, 0.05, 'gy_stone_hi', bevel=0.02)
    for k, (tx, tz) in enumerate(((0.5, -0.2), (0.85, 0.1), (1.1, 0.6), (1.2, 1.05))):
        w.cyl((0.15 + 0.02 * k, -0.062, 0.25 + 0.15 * k), (tx, -0.062, tz + 0.1), 0.026, 0.02, 'gy_stone_lo', seg=4, smooth=0.0)
    blob(w, (0.7, -0.07, 0.15), 0.2, 0.05, 0.1, 'gy_moss')
    return w


def angel_statue():
    """A weeping stone angel with folded wings on a stepped plinth; moss and rain stains, one wing snapped."""
    m = Mesh('angel')
    m.box(-0.72, 0.72, -0.72, 0.72, 0.0, 0.26, 'gy_stone_lo', bevel=0.05)
    m.box(-0.56, 0.56, -0.56, 0.56, 0.26, 0.8, 'gy_stone', bevel=0.05)
    m.box(-0.66, 0.66, -0.66, 0.66, 0.8, 0.92, 'gy_stone_hi', bevel=0.05)
    m.box(-0.3, 0.3, -0.585, -0.55, 0.42, 0.7, 'gy_stone_dark', bevel=0.01)
    for z, ww in ((0.6, 0.38), (0.5, 0.26)):
        engrave(m, 0.0, z, ww, 0.035, -0.585, 'gy_stone')
    fig = Mesh('fig')
    robe = [(0.0, 0.0), (0.0, 0.36), (0.1, 0.4), (0.4, 0.3), (0.75, 0.23), (0.95, 0.27), (1.05, 0.24), (1.1, 0.12), (1.12, 0.0)]
    fig.lathe(robe, 'gy_stone_hi', seg=14, smooth=45.0, cap=False)
    for z in (0.3, 0.6):                                                           # robe folds
        for sx in (-0.18, 0.0, 0.18):
            fig.cyl((sx, -0.34 + abs(sx) * 0.4, z + 0.2), (sx * 1.3, -0.42 + abs(sx) * 0.9, z - 0.3), 0.02, 0.018, 'gy_stone', seg=4, smooth=0.0)
    fig.ball((0, 0, 1.05), (0.31, 0.2, 0.15), 'gy_stone_hi', seg=12, rings=7)       # shoulders
    fig.ball((0, -0.02, 1.45), (0.17, 0.17, 0.19), 'gy_stone_hi', seg=12, rings=8, rot=rotx(0.3))   # head, tipped back toward the sky
    fig.ball((0, 0.05, 1.5), (0.19, 0.17, 0.2), 'gy_stone', seg=12, rings=8)                         # hair
    for sx in (-1, 1):
        fig.box(sx * 0.07 - 0.04, sx * 0.07 + 0.04, -0.2, -0.17, 1.46, 1.49, 'gy_stone_dark')                      # closed eyes
        fig.capsule((sx * 0.3, 0.0, 1.02), (sx * 0.06, -0.2, 0.82), 0.075, 0.065, 'gy_stone_hi')                    # arms folded to the chest
    fig.ball((0, -0.24, 0.8), (0.1, 0.08, 0.1), 'gy_stone_hi', seg=8, rings=5)
    halo = [(math.cos(a) * 0.36, 0.14, 1.55 + math.sin(a) * 0.36) for a in [0.35 + k * (PI * 2 - 1.2) / 18 for k in range(19)]]
    fig.tube(halo, 0.035, 'gy_stone_hi', seg=6)
    for sx in (-1, 1):
        fig.add(feather_wing(broken=(sx > 0)), trans(sx * 0.12, 0.2, 0.85) @ scale(sx * 0.75, 0.75, 0.75) @ rotz(0.5))
    for x, w in ((-0.14, 0.07), (0.12, 0.05)):                                    # rain stains down the robe
        fig.box(x - w / 2, x + w / 2, -0.4, -0.36, 0.1, 0.8, 'gy_stone_lo')
    blob(fig, (-0.2, -0.1, 1.2), 0.2, 0.1, 0.08, 'gy_moss')
    m.add(fig, trans(0, 0, 0.92) @ scale(1.35))
    blob(m, (-0.42, -0.62, 0.26), 0.36, 0.18, 0.12, 'gy_moss')
    blob(m, (0.5, -0.62, 0.28), 0.28, 0.16, 0.1, 'gy_moss_hi')
    vine(m, [(0.58, -0.5, 0.3), (0.6, -0.55, 0.6), (0.55, -0.58, 0.85)], 0.03, 0.1, 17)
    tuft(m, -0.88, -0.7, 0.3, 6, 71)
    tuft(m, 0.9, -0.78, 0.28, 6, 72)
    return m


def bone(m, a, b, r=0.035, mat='bone'):
    """A long bone: shaft with two knuckles at each end."""
    A, B = Vector(a), Vector(b)
    d = (B - A).normalized()
    p = d.cross(Vector((0, 0, 1)))
    if p.length < 0.2:
        p = d.cross(Vector((1, 0, 0)))
    p.normalize()
    m.cyl(a, b, r, r * 0.9, mat, seg=6)
    for E, sg in ((A, 1.0), (B, -1.0)):
        for s in (-1, 1):
            m.ball(tuple(E + p * r * 0.85 * s + d * sg * r * 0.1), r * 1.45, mat, seg=7, rings=5)


def skull_pile():
    m = Mesh('skull_pile')
    rr = random.Random(12)
    spots = [(-0.52, 0.06, 0.0), (-0.1, 0.2, 0.0), (0.38, 0.1, 0.0), (0.7, -0.1, 0.0), (-0.22, -0.3, 0.0), (0.25, -0.38, 0.0), (-0.78, -0.2, 0.0),
             (-0.3, 0.0, 0.3), (0.2, 0.0, 0.32), (0.5, -0.2, 0.28), (-0.62, -0.05, 0.26), (0.0, -0.1, 0.58), (0.3, -0.15, 0.6)]
    for k, (x, y, z) in enumerate(spots):
        yaw = rr.uniform(-1.0, 1.0)
        skull(m, (x, y, z), rr.uniform(0.85, 1.1), yaw=yaw, tilt=-0.45 + rr.uniform(-0.2, 0.2), glint=(k in (1, 7, 11)))
    for a, b in (((-0.9, -0.15, 0.1), (-0.3, -0.5, 0.5)), ((0.9, -0.2, 0.08), (0.2, -0.45, 0.62)), ((-0.1, 0.25, 0.1), (0.5, 0.25, 0.5))):
        bone(m, a, b, 0.04)
    for k, (x, y) in enumerate(((-0.95, -0.35), (1.0, -0.3), (0.1, -0.7))):
        m.ball((x, y, 0.08), (0.11, 0.09, 0.07), 'gy_dirt', seg=7, rings=5)
    tuft(m, -1.0, -0.2, 0.28, 5, 81)
    tuft(m, 1.1, -0.4, 0.26, 5, 82)
    return m


def bones(kind):
    m = Mesh('bones')
    if kind == 0:                 # crossed leg bones, a jaw and loose ribs
        bone(m, (-0.55, -0.05, 0.07), (0.5, 0.2, 0.08), 0.045)
        bone(m, (-0.4, 0.3, 0.07), (0.5, -0.25, 0.1), 0.04)
        # jawbone: a flat U of bone with teeth
        jaw = [(math.sin(a) * 0.19, -math.cos(a) * 0.15 + 0.04, 0.06) for a in [-1.5 + 3.0 * k / 8 for k in range(9)]]
        m.tube([(p[0] - 0.55, p[1] - 0.45, p[2]) for p in jaw], 0.035, 'bone', seg=6)
        for p in jaw[1:-1:2]:
            m.box(p[0] - 0.55 - 0.012, p[0] - 0.55 + 0.012, p[1] - 0.45 - 0.05, p[1] - 0.45, 0.06, 0.12, 'teeth')
        for k, (x, y, a) in enumerate(((0.55, -0.4, 0.4), (0.8, 0.1, -0.6), (0.2, -0.55, 1.0))):
            m.tube([(x - math.cos(a) * 0.2, y - math.sin(a) * 0.1, 0.05), (x, y, 0.16), (x + math.cos(a) * 0.2, y + math.sin(a) * 0.1, 0.05)], 0.02, 'bone', seg=5)
        tuft(m, -0.8, -0.3, 0.24, 5, 91)
    else:                         # a rib cage on its back, spine and a skull beside it
        for k in range(7):
            x = -0.45 + k * 0.15
            m.ball((x, 0.0, 0.09), (0.045, 0.05, 0.05), 'bone', seg=7, rings=5)
            w = 0.34 - 0.025 * abs(k - 2)
            for s in (-1, 1):
                m.tube([(x, s * 0.03, 0.1), (x - 0.02, s * w * 0.55, 0.36), (x - 0.01, s * w, 0.3), (x + 0.02, s * w * 1.1, 0.06)], 0.022, 'bone', seg=5)
        skull(m, (0.75, -0.25, 0.04), 0.9, yaw=-0.5, tilt=-0.55)
        bone(m, (-0.8, 0.3, 0.06), (-0.2, 0.5, 0.07), 0.04)
        bone(m, (0.3, 0.5, 0.06), (0.9, 0.35, 0.07), 0.035)
        for x, y in ((-0.7, -0.35), (0.3, -0.5)):
            m.ball((x, y, 0.06), (0.06, 0.05, 0.04), 'bone', seg=6, rings=4)
        tuft(m, 1.0, 0.1, 0.24, 5, 92)
        tuft(m, -0.95, 0.0, 0.24, 5, 93)
    return m


def grave_open():
    """A freshly dug grave: dark hole with the corner of a coffin lid, a heap of earth with a shovel stuck in it, a bony hand on the rim."""
    m = Mesh('grave_open')
    PX, PY, D = 0.62, 1.0, 1.1
    m.box(-PX, PX, 0.55, PY, -D, -D + 0.05, 'gy_void')                                  # only the strip of floor the camera can see
    m.box(-PX, PX, PY, PY + 0.14, -D, 0.0, 'gy_dirt_dark', bevel=0.01)                  # far wall
    # no near wall: it would never be seen (the ground hides it) and the sprite has no ground to do that. A coffin lid at the bottom,
    # clipped to what the camera sees over the near rim (a 35 degree line of sight)
    m.box(-0.38, 0.38, 0.1, 0.92, -0.72, -0.52, 'gy_coffin', bevel=0.02)
    m.box(-0.38, 0.38, 0.1, 0.92, -0.54, -0.5, 'gy_wood_dark', bevel=0.01)
    for z in (-0.5, -0.25):
        m.box(-PX, PX, PY - 0.06, PY, z - 0.04, z + 0.04, 'gy_wood')                      # roots and boards
    # rim of loose earth
    rr = random.Random(3)
    for x in (-0.55, -0.15, 0.25, 0.62):
        blob(m, (x, -PY - 0.12, 0.05), 0.26, 0.16, 0.12, 'gy_dirt')
    for y in (-0.6, -0.1, 0.4, 0.95):
        blob(m, (-PX - 0.1, y, 0.05), 0.16, 0.26, 0.11, 'gy_dirt')
    for x in (-0.5, 0.0, 0.5):
        blob(m, (x, PY + 0.12, 0.05), 0.28, 0.14, 0.12, 'gy_dirt')
    # the heap on the right
    for (x, y, z, r) in ((1.35, 0.1, 0.28, 0.6), (1.1, -0.35, 0.18, 0.4), (1.6, 0.45, 0.2, 0.42), (1.3, 0.55, 0.2, 0.4), (1.2, 0.05, 0.62, 0.38), (1.78, -0.1, 0.14, 0.3)):
        m.ball((x, y, z), (r, r * 0.9, r * 0.75), 'gy_dirt', seg=10, rings=6)
    for k in range(5):
        shaded_rock(m, (rr.uniform(0.9, 1.9), rr.uniform(-0.5, 0.7), rr.uniform(0.1, 0.5)), (0.1, 0.09, 0.07), ('gy_dirt', 'gy_dirt', 'gy_dirt_dark'), seed=100 + k, n=7, bevel=0.0)
    # a shovel stuck in it
    m.tube([(1.0, -0.15, 0.3), (1.28, -0.2, 1.1), (1.46, -0.22, 1.7)], 0.03, 'gy_wood', seg=5)
    m.tube([(1.34, -0.22, 1.7), (1.46, -0.22, 1.7), (1.58, -0.22, 1.7)], 0.03, 'gy_wood', seg=5)
    m.box(-0.13, 0.13, -0.025, 0.025, -0.36, 0.0, 'gy_iron_hi', mx=trans(1.0, -0.15, 0.62) @ rotx(0.0) @ rotz(0.0) @ roty(-0.22), bevel=0.01)
    # the hand on the rim
    m.tube([(-0.25, -0.75, -0.2), (-0.22, -PY - 0.05, 0.1)], 0.028, 'bone', seg=5)
    m.ball((-0.22, -PY - 0.12, 0.1), (0.07, 0.07, 0.04), 'bone', seg=8, rings=5)
    for k in range(4):
        a = -0.45 + k * 0.3
        m.tube([(-0.22 + math.sin(a) * 0.04, -PY - 0.16, 0.1), (-0.22 + math.sin(a) * 0.1, -PY - 0.3, 0.14), (-0.22 + math.sin(a) * 0.16, -PY - 0.4, 0.04)], 0.014, 'bone', seg=4)
    # a wooden cross marker leaning at the foot
    cr = Mesh('cross')
    cr.box(-0.04, 0.04, -0.03, 0.03, 0.0, 0.9, 'gy_wood', bevel=0.008)
    cr.box(-0.22, 0.22, -0.03, 0.03, 0.55, 0.65, 'gy_wood', bevel=0.008)
    m.add(cr, trans(-1.15, -0.2, 0.0) @ rotz(0.0) @ rotx(-0.12) @ roty(0.2))
    tuft(m, -1.0, 0.6, 0.28, 6, 111)
    tuft(m, 0.9, -0.8, 0.26, 5, 112)
    return m


def lantern_post():
    """A slim wrought-iron post with a scrolled arm and a glowing lantern on top (the lead adds a point light at the glow anchor)."""
    m = Mesh('lantern_post')
    m.lathe([(0.0, 0.0), (0.0, 0.3), (0.08, 0.32), (0.2, 0.22), (0.42, 0.15), (0.52, 0.19), (0.6, 0.11)], 'gy_iron', seg=10, smooth=40.0, cap=False)
    m.cyl((0, 0, 0.58), (0, 0, 2.9), 0.085, 0.06, 'gy_iron', seg=8)
    for z in (1.1, 2.1):
        m.lathe([(z - 0.04, 0.085), (z, 0.13), (z + 0.04, 0.085)], 'gy_iron_hi', seg=8, smooth=50.0, cap=False)
    for sx in (-1, 1):                                                       # a scroll either side
        pts = [(sx * 0.02, 0.0, 1.6), (sx * 0.28, 0.0, 1.5), (sx * 0.45, 0.0, 1.75), (sx * 0.34, 0.0, 1.98), (sx * 0.2, 0.0, 1.9)]
        m.tube(pts, 0.03, 'gy_iron', seg=5)
    # lantern: plate, glowing panes in a cage, cap and finial
    zl = 2.9
    m.box(-0.25, 0.25, -0.25, 0.25, zl, zl + 0.07, 'gy_iron_hi', bevel=0.012)
    m.box(-0.19, 0.19, -0.19, 0.19, zl + 0.07, zl + 0.62, 'gy_lantern')
    m.ball((0, 0, zl + 0.34), (0.08, 0.08, 0.12), 'gy_flame_core', seg=8, rings=5)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box(sx * 0.2 - 0.03, sx * 0.2 + 0.03, sy * 0.2 - 0.03, sy * 0.2 + 0.03, zl + 0.05, zl + 0.66, 'gy_iron', bevel=0.008)
    m.box(-0.2, 0.2, -0.215, -0.185, zl + 0.33, zl + 0.37, 'gy_iron')
    m.lathe([(zl + 0.62, 0.34), (zl + 0.66, 0.3), (zl + 0.95, 0.04)], 'gy_iron_hi', mx=rotz(PI / 4), seg=4, smooth=0.0, cap=True)
    m.ball((0, 0, zl + 1.0), (0.05, 0.05, 0.05), 'gy_iron_hi', seg=6, rings=4)
    vine(m, [(0.06, -0.08, 0.5), (0.1, -0.1, 0.9), (0.02, -0.1, 1.3), (0.08, -0.09, 1.7)], 0.022, 0.08, 31)
    tuft(m, -0.3, -0.25, 0.28, 6, 121)
    tuft(m, 0.28, -0.2, 0.24, 5, 122)
    return m


def urn():
    """A stone funeral urn with handles and a pine-cone lid, on a plinth."""
    m = Mesh('urn')
    m.box(-0.5, 0.5, -0.5, 0.5, 0.0, 0.2, 'gy_stone_lo', bevel=0.04)
    m.box(-0.38, 0.38, -0.38, 0.38, 0.2, 0.7, 'gy_stone', bevel=0.04)
    m.box(-0.46, 0.46, -0.46, 0.46, 0.7, 0.84, 'gy_stone_hi', bevel=0.04)
    for z, ww in ((0.55, 0.3), (0.42, 0.2)):
        engrave(m, 0.0, z, ww, 0.04, -0.395, 'gy_stone_lo')
    z0 = 0.84
    m.lathe([(0.0, 0.0), (0.0, 0.18), (0.06, 0.25), (0.2, 0.36), (0.42, 0.43), (0.6, 0.37), (0.72, 0.26), (0.8, 0.24), (0.9, 0.34), (0.98, 0.37), (1.02, 0.3)],
            'gy_stone_hi', mx=trans(0, 0, z0), seg=14, smooth=45.0, cap=False)
    m.lathe([(1.02, 0.3), (1.04, 0.2), (1.2, 0.17), (1.34, 0.03)], 'gy_stone', mx=trans(0, 0, z0), seg=14, smooth=45.0, cap=True)       # lid
    m.ball((0, 0, z0 + 1.4), (0.07, 0.07, 0.1), 'gy_stone_hi', seg=8, rings=5)
    for z in (0.46, 0.5):
        m.lathe([(z, 0.428), (z + 0.03, 0.435)], 'gy_stone_lo', mx=trans(0, 0, z0), seg=14, smooth=40.0, cap=False)
    for sx in (-1, 1):                                                       # curly handles
        h = [(sx * 0.28, 0.0, z0 + 0.82), (sx * 0.5, 0.0, z0 + 0.9), (sx * 0.58, 0.0, z0 + 0.68), (sx * 0.46, 0.0, z0 + 0.5), (sx * 0.4, 0.0, z0 + 0.45)]
        m.tube(h, 0.045, 'gy_stone_hi', seg=6)
    blob(m, (-0.3, -0.45, 0.2), 0.3, 0.14, 0.1, 'gy_moss')
    blob(m, (0.22, -0.4, z0 + 0.42), 0.16, 0.08, 0.06, 'gy_moss_hi')
    vine(m, [(0.4, -0.45, 0.2), (0.44, -0.47, 0.6), (0.36, -0.46, 0.9)], 0.025, 0.08, 41)
    tuft(m, -0.7, -0.5, 0.28, 6, 131)
    tuft(m, 0.68, -0.52, 0.24, 5, 132)
    return m


# ------------------------------------------------------------------------------------------------ the hearse

def hearse():
    """A wrecked black hearse, nose toward the camera and a little to the right: smashed windscreen, a door hanging open, the front
    wheel torn off, the side glass gone so the coffin shows in the back, dead roses on it, cobwebs."""
    m = Mesh('hearse')
    P, PS, CH = 'gy_paint', 'gy_paint_scuff', 'gy_chrome'
    around = (0.0, 0.0, 1.0)
    HW = 0.93
    body = [(-3.05, 0.3), (2.7, 0.3), (2.76, 0.62), (2.6, 0.9), (1.35, 1.02), (-3.05, 1.04)]
    m.prism(body, -HW, HW, P, bevel=0.07)
    m.box(1.3, 2.62, -0.62, 0.62, 1.0, 1.08, P, bevel=0.05)                                   # raised bonnet
    cab = [(-0.5, 1.02), (-0.22, 1.62), (0.75, 1.62), (1.35, 1.02)]
    m.prism(cab, -0.84, 0.84, P, bevel=0.05)
    # the windscreen: dark glass with a spider-web smash
    ws = [(1.35, -0.84, 1.02), (0.75, -0.84, 1.62), (0.75, 0.84, 1.62), (1.35, 0.84, 1.02)]
    panel(m, ws, 'gy_glass', inset=0.86, push=0.016, around=around)
    d = Vector((-0.6, 0.0, 0.6)).normalized()
    crack_windscreen(m, (Vector((1.05, 0.0, 1.32)), Vector((d.z, 0, -d.x)), d), off_y=-0.12, along=0.5, n=8, seed=5, scale=1.1)
    # near-side cab: the window is gone, the door hangs open on its front hinge
    m.box(-0.46, 1.3, -0.82, 0.82, 0.4, 1.02, 'gy_glass_hole')                                  # dark cabin
    m.box(-0.3, 0.45, -0.7, -0.1, 0.5, 0.66, 'pr_seat', bevel=0.04)
    m.box(-0.3, -0.18, -0.7, -0.1, 0.5, 1.3, 'pr_seat', bevel=0.04)
    door = Mesh('door')
    door.box(-1.05, 0.0, -0.05, 0.05, 0.38, 1.0, P, bevel=0.03)
    door.box(-0.95, -0.1, -0.06, 0.06, 1.0, 1.56, P, bevel=0.03)
    door.prism([(-0.95, 1.0), (-0.1, 1.0), (-0.2, 1.52), (-0.7, 1.52)], -0.08, -0.03, 'gy_glass_hole')
    door.prism([(-0.85, 1.05), (-0.45, 1.05), (-0.5, 1.4), (-0.72, 1.42)], -0.095, -0.08, 'gy_glass')
    door.box(-0.45, -0.15, -0.075, -0.05, 0.86, 0.92, CH, bevel=0.01)
    m.add(door, trans(1.15, -0.9, 0.0) @ rotz(1.08))
    # rear compartment: open sides, pillars, roof, the coffin inside
    m.box(-3.08, -0.38, -0.98, 0.98, 1.9, 2.0, P, bevel=0.05)
    for x in (-3.0, -1.7, -0.5):
        for sy in (-1, 1):
            m.box(x - 0.07, x + 0.07, sy * 0.86 - 0.06, sy * 0.86 + 0.06, 1.0, 1.92, P, bevel=0.02)
    m.box(-3.06, -3.0, -0.8, 0.8, 1.0, 1.92, 'gy_glass_hole')                                  # the back panel
    m.box(-3.0, -0.45, -0.8, 0.8, 0.98, 1.1, 'gy_iron')                                        # the deck
    for sy in (-1, 1):
        m.box(-3.08, -0.38, sy * 0.95 - 0.03, sy * 0.95 + 0.03, 1.86, 1.9, CH, bevel=0.01)     # chrome roof rail
        m.box(-3.05, -0.4, sy * 0.96 - 0.02, sy * 0.96 + 0.02, 1.0, 1.06, CH)
    plan = [(-1.15, -0.22), (-0.55, -0.37), (0.55, -0.46), (1.15, -0.29), (1.15, 0.29), (0.55, 0.46), (-0.55, 0.37), (-1.15, 0.22)]
    flat = trans(-1.75, 0.0, 1.1) @ rotz(0.05) @ rotx(PI / 2)
    m.prism([(x, -y) for x, y in plan], 0.0, 0.46, 'gy_coffin', mx=flat, bevel=0.03)
    m.prism([(x * 1.02, -y * 1.04) for x, y in plan], 0.46, 0.54, 'gy_coffin', mx=flat, bevel=0.03)
    for x in (-2.35, -1.75, -1.15):                                                         # brass handles on the near side
        m.box(x - 0.1, x + 0.1, -0.5, -0.46, 1.25, 1.33, 'gy_brass', bevel=0.012)
    ring = [(-1.7 + math.cos(2 * PI * k / 14) * 0.3, math.sin(2 * PI * k / 14) * 0.2, 1.68) for k in range(15)]
    m.tube(ring, 0.04, 'gy_vine', seg=5)
    for k in range(5):                                                                      # dead roses
        a = 2 * PI * k / 5 + 0.4
        m.ball((-1.7 + math.cos(a) * 0.3, math.sin(a) * 0.2, 1.72), (0.07, 0.07, 0.06), 'gy_curtain', seg=7, rings=5)
    for x in (-2.9, -1.0):                                                                  # curtains caught on the pillars
        for sy in (-1, 1):
            m.ball((x, sy * 0.86, 1.6), (0.13, 0.06, 0.32), 'gy_curtain', seg=8, rings=6)
    for x0, x1 in ((-2.95, -2.2), (-1.65, -0.9)):                                           # shards of glass left in the top corners
        m.poly([(x0, -0.9, 1.9), (x1, -0.9, 1.9), (x0 + 0.2, -0.9, 1.55)], 'gy_glass')
    m.poly([(-0.55, -0.9, 1.9), (-0.9, -0.9, 1.9), (-0.55, -0.9, 1.6)], 'gy_glass')
    # nose: grille, headlights, bumper, a winged ornament
    m.box(2.7, 2.82, -0.42, 0.42, 0.45, 0.98, 'gy_iron', bevel=0.012)
    for k in range(5):
        x = -0.32 + k * 0.16
        m.box(2.78, 2.84, x - 0.025, x + 0.025, 0.5, 0.95, CH)
    for sy, lit in ((-1, True), (1, False)):
        c = (2.66, sy * 0.66, 0.8)
        m.ball(c, (0.16, 0.16, 0.16), 'gy_lamp_dead' if lit else 'gy_glass_hole', seg=10, rings=7)
    m.box(2.74, 2.96, -0.93, 0.93, 0.28, 0.48, CH, bevel=0.04, mx=trans(2.8, 0.7, 0) @ rotz(0.1) @ trans(-2.8, -0.7, 0))   # bent bumper
    m.cyl((2.5, 0.0, 1.06), (2.5, 0.0, 1.22), 0.04, 0.0, CH, seg=5, smooth=0.0)
    m.box(2.46, 2.54, -0.2, 0.2, 1.14, 1.2, CH, bevel=0.01)
    # wheels: three on, the near front one torn off, its axle stub and the tyre lying beside it
    for x in (-1.9, 1.6):
        for sy in (-1, 1):
            if x > 0 and sy < 0:
                m.cyl((x, -0.45, 0.36), (x, -0.8, 0.36), 0.07, 0.09, 'gy_iron', seg=8)
                continue
            props_wheel(m, x, sy * 0.86, z=0.36, r=0.36, w=0.28, tyre='gy_tyre', rim=CH, edge=0.93)
    t = [(1.55 + math.cos(2 * PI * k / 18) * 0.36, -1.85 + math.sin(2 * PI * k / 18) * 0.36, 0.13) for k in range(19)]
    m.tube(t, 0.13, 'gy_tyre', seg=8, smooth=70.0)
    m.cyl((1.55, -1.85, 0.0), (1.55, -1.85, 0.2), 0.2, 0.2, CH, seg=12, bevel=0.01)
    # wear: scuffs and rust on the near flank, a dented roof corner, webs, tufts
    for x, z, w in ((-2.4, 0.55, 0.9), (-1.0, 0.7, 0.6), (0.3, 0.5, 0.5)):
        m.box(x, x + w, -HW - 0.012, -HW - 0.004, z, z + 0.08, PS)
    m.box(-3.0, 2.6, -HW - 0.012, -HW - 0.004, 0.88, 0.94, CH)
    for x, z in ((-2.0, 0.45), (0.9, 0.75)):
        m.ball((x, -HW - 0.01, z), (0.3, 0.02, 0.1), 'gy_rust', seg=8, rings=5)
    for x, y in ((-3.1, -1.1), (2.9, 0.9)):
        tuft(m, x, y, 0.3, 6, 141 + int(x))
    return m


def props_wheel(m, *a, **k):
    import props
    props.wheel(m, *a, **k)


def hearse_frame():
    m = hearse()
    m.transform(rotz(-PI / 2 + 0.55))
    sit(m)
    return m


# ------------------------------------------------------------------------------------------------ frames

def build(ctx):
    for i in range(4):
        one(ctx, 'tombstone_%d' % i, lambda i=i: tombstone(i))
    one(ctx, 'crypt', crypt)
    one(ctx, 'tomb', tomb)
    for i in range(3):
        one(ctx, 'dead_tree_%d' % i, lambda i=i: dead_tree(i))
    one(ctx, 'fence_iron', fence_iron)
    one(ctx, 'gate_iron', gate_iron)
    one(ctx, 'candles', candle_cluster)
    one(ctx, 'coffin', coffin)
    one(ctx, 'angel_statue', angel_statue)
    one(ctx, 'skull_pile', skull_pile)
    one(ctx, 'grave_open', grave_open)
    one(ctx, 'lantern_post', lantern_post)
    for i in range(2):
        one(ctx, 'bones_%d' % i, lambda i=i: bones(i))
    one(ctx, 'urn', urn)
    one(ctx, 'hearse', hearse_frame)
    # footprints (game units) for the blocking props, and where each light sits (screen offsets from the pivot, game units)
    u = bl.UNITS_PER_M
    for name, r in (('crypt', 2.3), ('hearse', 1.5), ('tomb', 1.2), ('coffin', 1.1), ('angel_statue', 0.7), ('grave_open', 0.9), ('urn', 0.5),
                    ('tombstone_0', 0.5), ('tombstone_1', 0.6), ('tombstone_2', 0.7), ('tombstone_3', 0.6), ('skull_pile', 0.8),
                    ('dead_tree_0', 0.5), ('dead_tree_1', 0.4), ('dead_tree_2', 0.5), ('lantern_post', 0.2)):
        ctx.value('radius', name, round(r * u, 1))
    ctx.anchor('glow', 'lantern_post', (0.0, 0.0, 3.24))
    ctx.anchor('glow', 'candles', (0.0, 0.0, 0.95))
    ctx.anchor('glow', 'crypt', (0.0, -1.5, 1.3))
