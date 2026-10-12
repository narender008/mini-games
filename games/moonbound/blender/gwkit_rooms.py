"""Gloamwall kit: room features: the healing fountain, the shop table and the reward pedestal."""
import math
import random

from mathutils import Vector

import bl
from bl import Mesh, trans, rotx, roty, rotz, scale, PI
from gwkit_shapes import (rblock, poly_block, masonry, moss, moss_line, crack, crack_top, rivet, pick, STONES, crescent, star, revolve,
                          folds)
from gwkit_decor import circle_pts, prof, robe, hood, mantle


def ring_blocks(m, r0, r1, z0, z1, n, rng, mats, gap=0.018, bevel=0.02, phase=0.0, sub=3, chip=True):
    """A ring of wedge blocks (trapezoids with curved sides) between radii r0 and r1, z0..z1."""
    for k in range(n):
        a0 = phase + 2 * PI * k / n
        a1 = phase + 2 * PI * (k + 1) / n
        g0, g1 = a0 + gap / (r0 + r1) * 1.0, a1 - gap / (r0 + r1) * 1.0
        outer = [(r1 * math.cos(g0 + (g1 - g0) * i / sub), r1 * math.sin(g0 + (g1 - g0) * i / sub)) for i in range(sub + 1)]
        inner = [(r0 * math.cos(g0 + (g1 - g0) * i / sub), r0 * math.sin(g0 + (g1 - g0) * i / sub)) for i in range(sub, -1, -1)]
        m.prism_xy(outer + inner, z0, z1, rng.choice(mats), smooth=40.0, bevel=bevel)


def water_streams(m, pts_a, pts_b, r0=0.03, r1=0.04, mat='gw_water'):
    m.tube([pts_a, pts_b], [r0, r1], mat, seg=6, cap=True)


def stream(m, p0, p1, r0=0.03, r1=0.04, n=10, bow=0.0, mat='gw_water'):
    """A falling stream of moonwater from p0 to p1: accelerating fall, with a sideways bow."""
    pts = []
    for i in range(n + 1):
        t = i / n
        x = p0[0] + (p1[0] - p0[0]) * t
        y = p0[1] + (p1[1] - p0[1]) * t
        z = p0[2] + (p1[2] - p0[2]) * (t * t)
        pts.append((x, y, z))
    m.tube(pts, [r0 + (r1 - r0) * i / n for i in range(n + 1)], mat, seg=6, cap=True)


def fountain(seed=801):
    """gw_fountain: a pale marble basin 2.4 m across on two round steps, a fluted pedestal and a robed woman holding up a crescent moon
    from which glowing moonwater falls into the basin. Lights: the crescent, the two splashes and the pool (values.lights)."""
    rng = random.Random(seed)
    m = Mesh('fountain')
    # steps
    ring_blocks(m, 0.0, 1.62, 0.0, 0.14, 1, rng, ['gw_slab'], sub=3) if False else None
    base = Mesh('base')
    base.lathe([(0.0, 0.0), (0.0, 1.6), (0.13, 1.6)], 'gw_stone_dark', seg=44, smooth=0.0, cap=True) if False else None
    ring_blocks(m, 1.35, 1.62, 0.0, 0.14, 24, rng, ['gw_stone_b', 'gw_stone_a', 'gw_slab'], bevel=0.022)
    ring_blocks(m, 1.18, 1.38, 0.14, 0.29, 22, rng, ['gw_stone_d', 'gw_stone_b', 'gw_slab'], phase=0.07, bevel=0.022)
    # the basin wall and its coping
    ring_blocks(m, 0.98, 1.22, 0.29, 0.72, 22, rng, ['gw_marble'], phase=0.14, bevel=0.02)
    ring_blocks(m, 0.94, 1.27, 0.72, 0.82, 22, rng, ['gw_marble', 'gw_cap'], phase=0.14 + PI / 22, bevel=0.024)
    m.lathe([(0.29, 0.0), (0.29, 1.0)], 'gw_core', seg=40, smooth=0.0, cap=False)       # the dark floor of the basin
    # the water: a luminous disc a little below the rim, ripples round the splashes
    m.lathe([(0.62, 0.0), (0.625, 0.98)], 'gw_water', seg=44, smooth=0.0, cap=True)
    m.lathe([(0.62, 0.0), (0.63, 0.5), (0.625, 0.98)], 'gw_water', seg=44, smooth=0.0, cap=False)
    for r, w, mat in ((0.3, 0.012, 'gw_soul_white'), (0.45, 0.009, 'gw_water_dim'), (0.7, 0.008, 'gw_water_dim')):
        m.tube(circle_pts((0, 0, 0.632), r, r, 40, 'xy'), w, mat, seg=4, cap=False)
    for sg in (-1, 1):
        for r, w in ((0.07, 0.01), (0.15, 0.008), (0.24, 0.006)):
            m.tube(circle_pts((sg * 0.55, -0.52, 0.632), r, r * 0.9, 24, 'xy'), w, 'gw_soul_white' if r < 0.1 else 'gw_water_dim', seg=4, cap=False)
    # pedestal rising from the water
    m.lathe([(0.29, 0.5), (0.4, 0.5), (0.5, 0.48), (0.6, 0.44), (0.78, 0.4), (0.82, 0.3)], 'gw_marble', seg=32, smooth=50.0, cap=True) if False else None
    ped = [(0.3, 0.5), (0.5, 0.5), (0.52, 0.46), (0.74, 0.4), (0.78, 0.3), (0.8, 0.26), (1.0, 0.24), (1.04, 0.3), (1.08, 0.42), (1.1, 0.4)]
    m.lathe(ped, 'gw_marble', seg=32, smooth=50.0, cap=True)
    for k in range(10):
        a = 2 * PI * k / 10
        m.cyl((0.27 * math.cos(a), 0.27 * math.sin(a), 0.8), (0.27 * math.cos(a), 0.27 * math.sin(a), 1.0), 0.03, 0.03, 'gw_marble', seg=8, smooth=60.0)
    m.tube(circle_pts((0, 0, 0.9), 0.31, 0.31, 28, 'xy'), 0.02, 'gw_gold', seg=6, cap=False)
    # the figure
    f = Mesh('fig')
    s = 0.74
    robe(f, seed, s, mat='gw_marble')
    mantle(f, seed + 1, s, mat='gw_marble')
    # head: a rounded hood framing a pale face
    h = Mesh('hood')
    hp = prof([(0.0, 0.235), (0.1, 0.255), (0.25, 0.26), (0.4, 0.235), (0.5, 0.19), (0.58, 0.12), (0.63, 0.05), (0.65, 0.0)])
    zs = [0.0, 0.06, 0.14, 0.24, 0.34, 0.44, 0.52, 0.58, 0.62, 0.65]
    revolve(h, [(z, (lambda zz: (lambda th: hp(zz) * (1 + 0.04 * math.sin(7 * th + zz * 3))))(z)) for z in zs], 'gw_marble', seg=28, closed_bottom=False,
            closed_top=True, mx=bl.scale(0.95, 1.1, 1.0))
    h.ball((0, -0.185, 0.27), (0.1, 0.075, 0.14), 'gw_statue_dark', seg=12, rings=8)      # the shadow in the hood
    h.ball((0, -0.205, 0.26), (0.078, 0.06, 0.105), 'gw_marble', seg=12, rings=8)           # the face
    for sg in (-1, 1):
        h.ball((sg * 0.03, -0.255, 0.28), (0.014, 0.01, 0.01), 'gw_statue_dark', seg=6, rings=4)
    h.tube(circle_pts((0, -0.235, 0.29), 0.125, 0.19, 22, 'xz'), 0.028, 'gw_marble', seg=6, cap=False)
    f.add(h, trans(0, 0, 1.55 * s) @ rotx(-0.08) @ bl.scale(s, s, s))
    h.free()
    # arms forward holding the crescent at chest height
    for sg in (-1, 1):
        S = (sg * 0.2, 0.0, 1.5 * s)
        E = (sg * 0.3, -0.14, 1.18 * s)
        H = (sg * 0.2, -0.3, 1.36 * s)
        f.capsule(S, E, 0.07, 0.085, 'gw_marble', seg=14)
        f.capsule(E, H, 0.088, 0.06, 'gw_marble', seg=14)
        f.ball(E, (0.088, 0.088, 0.088), 'gw_marble', seg=12, rings=7)
        f.ball(H, (0.052, 0.052, 0.052), 'gw_marble', seg=10, rings=6)
    cres = Mesh('cres')
    crescent(cres, 0.0, 0.0, 0.3, -0.045, 0.045, 'gw_marble', thick=0.55, off=0.42, tilt=PI / 2, bevel=0.012)
    # the glowing moonwater lying in the crescent's hollow
    crescent(cres, 0.0, 0.02, 0.265, -0.035, 0.035, 'gw_water', thick=0.4, off=0.42, tilt=PI / 2, bevel=0.006)
    f.add(cres, trans(0, -0.31, 1.58 * s))
    cres.free()
    belt = [(0.19 * s * 1.12 * math.cos(2 * PI * i / 28), 0.19 * s * 0.92 * math.sin(2 * PI * i / 28), 1.08 * s) for i in range(29)]
    f.tube(belt, 0.022, 'gw_marble', seg=6, cap=False)
    f.warp(0.003, 7.0, seed + 9)
    m.add(f, trans(0, 0.0, 1.1))
    f.free()
    # water pouring from the crescent into the basin: two arcs from the tips and a thin central fall
    zc = 1.1 + 1.58 * s
    tip_z = zc + 0.18
    for sg in (-1, 1):
        stream(m, (sg * 0.27, -0.31, tip_z - 0.1), (sg * 0.55, -0.52, 0.63), 0.026, 0.045, 12, mat='gw_water')
        stream(m, (sg * 0.2, -0.33, tip_z - 0.2), (sg * 0.45, -0.47, 0.63), 0.016, 0.026, 12, mat='gw_soul_white')
    stream(m, (0.0, -0.33, zc - 0.28), (0.0, -0.46, 0.63), 0.022, 0.032, 10, mat='gw_water')
    # carved crescent tablets on the basin's outer wall, gold inlay ring on the coping
    for k in range(5):
        a = -PI / 2 + (k - 2) * 0.62
        rr = 1.222
        cx, cy = rr * math.cos(a), rr * math.sin(a)
        rot = rotz(a + PI / 2)
        sh = Mesh('tab')
        sh.grid_sheet(lambda u, v: (-0.13 + 0.26 * u, -0.012, 0.64 - 0.0 - 0.2 * v - 0.0), 1, 1, 'gw_crescent_carve', smooth=0.0)
        m.add(sh, trans(cx, cy, 0.0) @ rot)
        sh.free()
    m.tube(circle_pts((0, 0, 0.827), 1.1, 1.1, 60, 'xy'), 0.012, 'gw_gold', seg=5, cap=False)
    mr = random.Random(seed + 4)
    for i in range(10):
        a = mr.uniform(PI * 0.1, PI * 0.9) * -1 - 0.1
        r = mr.uniform(1.42, 1.58)
        moss(m, r * math.cos(a), r * math.sin(a), 0.14, 0.07, mr, 'gw_moss_dark' if i % 2 else 'gw_moss')
    for i in range(6):
        a = mr.uniform(-PI * 0.95, -PI * 0.05)
        moss(m, 1.08 * math.cos(a), 1.08 * math.sin(a), 0.83, 0.06, mr)
    return m


def fountain_lights(seed=801):
    s = 0.74
    zc = 1.1 + 1.58 * s
    # y is SOUTH-positive in the game; the model is built with y north-positive
    return [[0.0, 0.31, round(zc, 3)], [-0.55, 0.52, 0.72], [0.55, 0.52, 0.72], [0.0, 0.0, 0.8]]


# ------------------------------------------------------------------------------------------------ shop table

def candle(m, x, y, z, h, r=0.024, seed=0):
    rng = random.Random(seed)
    m.lathe([(0.0, r * 1.05), (h * 0.7, r), (h, r * 0.9)], 'gw_candle', mx=trans(x, y, z), seg=10, smooth=60.0, cap=True)
    # a drip of wax
    m.ball((x + r * 0.9, y, z + h * 0.7), (r * 0.35, r * 0.35, h * 0.2), 'gw_candle', seg=6, rings=4)
    # the flame: a small bright teardrop (the game adds the glow)
    m.lathe([(0.0, 0.0), (0.012, 0.011), (0.03, 0.013), (0.052, 0.006), (0.07, 0.0)], 'gw_ember', mx=trans(x, y, z + h), seg=8, smooth=60.0, cap=False)


def candle_cluster(m, x, y, z, seed, n=3, dish=True):
    rng = random.Random(seed)
    if dish:
        m.lathe([(0.0, 0.07), (0.012, 0.095), (0.03, 0.105), (0.035, 0.09)], 'gw_bronze', mx=trans(x, y, z), seg=14, smooth=50.0, cap=True)
    pts = []
    for i in range(n):
        a = 2 * PI * i / n + rng.uniform(0, 1)
        d = 0.045 if n > 1 else 0.0
        cx, cy = x + d * math.cos(a), y + d * math.sin(a)
        h = rng.uniform(0.09, 0.2)
        candle(m, cx, cy, z + 0.03, h, 0.022, seed + i)
        pts.append((cx, cy, z + 0.03 + h + 0.03))
    return pts


def cloth_front(m, x0, x1, y, z_top, drop, mat, seed, pleats=9):
    """A pleated hanging cloth in the plane facing -Y, hanging from z_top by `drop`."""
    rng = random.Random(seed)
    ph = rng.uniform(0, 6)
    hem = [rng.uniform(0.0, 0.05) for _ in range(12)]

    def fn(u, v):
        pl = math.sin(2 * PI * pleats * u + ph) * 0.5 + 0.5
        yy = y - 0.012 - (0.05 + 0.04 * pl) * (v ** 0.9) - 0.03 * v
        zz = z_top - drop * v * (1.0 - hem[min(int(u * 11), 11)])
        return (x0 + (x1 - x0) * u, yy, zz)
    m.grid_sheet(fn, 36, 8, mat, smooth=55.0, thick=0.008)


def shop_table(seed=811):
    """gw_shop_table: a stone slab on piers draped with dark violet cloth, a gold hem, candles, a few books, and three empty display
    spots marked with faint rings. slots = the three spots; lights = the candle flames."""
    rng = random.Random(seed)
    m = Mesh('shop_table')
    top = 0.94
    # piers and the slab
    for sg in (-1, 1):
        rblock(m, sg * 0.82 - 0.22, sg * 0.82 + 0.22, -0.36, 0.36, 0.0, 0.82, 'gw_plinth', seed=seed + sg, bevel=0.02, bseg=2, cuts=3, chip=0.007, pillow=0.008)
    rblock(m, -1.14, 1.14, -0.44, 0.44, 0.82, top, 'gw_cap', seed=seed + 5, bevel=0.025, bseg=2, cuts=3, chip=0.008)
    # the cloth: over the top, down the front and over both ends
    def topfn(u, v):
        return (-1.17 + 2.34 * u, -0.47 + 0.9 * v, top + 0.012 + 0.01 * math.sin(7 * u + 3 * v) + 0.006 * math.sin(19 * u))
    m.grid_sheet(topfn, 26, 8, 'gw_violet', smooth=55.0, thick=0.008)
    cloth_front(m, -1.17, 1.17, -0.46, top + 0.012, 0.62, 'gw_violet', seed + 1, 11)
    for sg in (-1, 1):
        def sidefn(u, v, sg=sg):
            pl = math.sin(2 * PI * 4 * u + sg) * 0.5 + 0.5
            return (sg * (1.17 + 0.012 + (0.04 + 0.03 * pl) * v ** 0.9), -0.47 + 0.9 * u, top + 0.012 - 0.55 * v * (1.0 - 0.06 * math.sin(9 * u + sg)))
        m.grid_sheet(sidefn, 10, 8, 'gw_violet_dark', smooth=55.0, thick=0.008)
    # a gold hem line along the front
    hem = [(-1.17 + 2.34 * i / 40, -0.47 - 0.06 - 0.02 * math.sin(2 * PI * 11 * i / 40 + 1.0), top + 0.012 - 0.57 + 0.015 * math.sin(i)) for i in range(41)]
    m.tube([(x, y, z) for (x, y, z) in hem], 0.007, 'gw_gold_dim', seg=4, cap=True)
    # three display spots
    slots = []
    for x in (-0.72, 0.0, 0.72):
        m.lathe([(0.0, 0.17), (0.012, 0.185), (0.025, 0.17), (0.028, 0.0)], 'gw_marble', mx=trans(x, -0.02, top + 0.02), seg=22, smooth=50.0, cap=True)
        m.tube(circle_pts((x, -0.02, top + 0.049), 0.135, 0.135, 28, 'xy'), 0.007, 'gw_soul', seg=4, cap=False)
        m.tube(circle_pts((x, -0.02, top + 0.049), 0.1, 0.1, 22, 'xy'), 0.004, 'gw_gold', seg=4, cap=False)
        slots.append([x, 0.02, round(top + 0.42, 3)])
    # candles: a cluster at each end and a candelabra at the back
    lights = []
    for p in candle_cluster(m, -1.0, 0.18, top + 0.02, seed + 20, 3):
        lights.append(p)
    for p in candle_cluster(m, 1.0, 0.18, top + 0.02, seed + 30, 3):
        lights.append(p)
    # candelabra: a bronze stem with three arms
    cx, cy = 0.0, 0.3
    m.lathe([(0.0, 0.07), (0.02, 0.06), (0.06, 0.025), (0.22, 0.02), (0.25, 0.03)], 'gw_bronze', mx=trans(cx, cy, top + 0.02), seg=12, smooth=50.0, cap=True)
    for k, dx in enumerate((-0.12, 0.0, 0.12)):
        arm_h = 0.22 + (0.07 if dx == 0 else 0.0)
        m.tube([(cx, cy, top + 0.2), (cx + dx * 0.6, cy, top + 0.22), (cx + dx, cy, top + 0.2 + (0.05 if dx else 0.07))], 0.008, 'gw_bronze', seg=6, cap=True)
        candle(m, cx + dx, cy, top + 0.28 + (0.07 if dx == 0 else 0.0), 0.09 + 0.02 * k, 0.018, seed + 50 + k)
        lights.append((cx + dx, cy, top + 0.28 + (0.07 if dx == 0 else 0.0) + 0.09 + 0.02 * k + 0.035))
    # books and a scroll on the left of the front edge
    bx = -0.45
    for i, (w, d, h, mat, rot) in enumerate(((0.22, 0.16, 0.035, 'gw_leather', 0.15), (0.2, 0.15, 0.03, 'gw_violet_dark', -0.1), (0.21, 0.15, 0.03, 'gw_navy', 0.2))):
        rblock(m, -w / 2, w / 2, -d / 2, d / 2, 0.0, h, mat, seed=seed + 60 + i, bevel=0.006, cuts=1, chip=0.002, mx=trans(bx, 0.22, top + 0.015 + 0.033 * i) @ rotz(rot))
    m.cyl((0.35, 0.26, top + 0.04), (0.55, 0.3, top + 0.04), 0.025, 0.025, 'gw_parchment', seg=10, smooth=60.0)
    m.ball((0.6, 0.12, top + 0.06), (0.045, 0.045, 0.055), 'gw_leather', seg=8, rings=6)
    # a little bottle
    m.lathe([(0.0, 0.03), (0.05, 0.036), (0.1, 0.02), (0.15, 0.011), (0.17, 0.013)], 'gw_glass_violet', mx=trans(0.5, 0.32, top + 0.015), seg=10, smooth=60.0, cap=True)
    mr = random.Random(seed + 2)
    moss_line(m, -1.0, 1.0, -0.4, 0.0, mr, density=0, r=0.04)
    return m, slots, lights


# ------------------------------------------------------------------------------------------------ reward pedestal

def pedestal(seed=821):
    """gw_pedestal: a carved stone pedestal (0.9 m) with gold inlay and a shallow dish for the reward that floats above it."""
    rng = random.Random(seed)
    m = Mesh('pedestal')
    rblock(m, -0.42, 0.42, -0.42, 0.42, 0.0, 0.12, 'gw_stone_dark', seed=seed + 1, bevel=0.025, bseg=2, cuts=3, chip=0.006)
    # a slightly tapering die
    m.hull([(sx * 0.33, sy * 0.33, 0.12) for sx in (-1, 1) for sy in (-1, 1)] + [(sx * 0.27, sy * 0.27, 0.68) for sx in (-1, 1) for sy in (-1, 1)],
           'gw_plinth', bevel=0.018, smooth=40)
    # gold inlay: a crescent on the front face and border lines
    def face_y(z):
        return -(0.33 + (0.27 - 0.33) * (z - 0.12) / (0.56))
    zc = 0.4
    crescent(m, 0.0, zc, 0.1, face_y(zc) - 0.014, face_y(zc) + 0.004, 'gw_gold', thick=0.5, off=0.34, tilt=0.5, bevel=0.003)
    for z in (0.2, 0.6):
        m.box(-0.24, 0.24, face_y(z) - 0.012, face_y(z) + 0.004, z - 0.008, z + 0.008, 'gw_gold')
    for sx in (-1, 1):
        pts = [(sx * (0.25 - 0.06 * (z - 0.12) / 0.56 * 0.9), face_y(z) - 0.012, z) for z in (0.2, 0.4, 0.6)]
        m.tube(pts, 0.008, 'gw_gold', seg=4, cap=True)
    # the cap and the dish
    rblock(m, -0.4, 0.4, -0.4, 0.4, 0.68, 0.78, 'gw_cap', seed=seed + 3, bevel=0.025, bseg=2, cuts=3, chip=0.006, corner=(1, -1, 1, 0.1))
    m.lathe([(0.78, 0.0), (0.78, 0.22), (0.8, 0.26), (0.82, 0.27), (0.84, 0.25)], 'gw_marble', seg=28, smooth=50.0, cap=True)
    m.lathe([(0.8, 0.0), (0.8, 0.2), (0.81, 0.23)], 'gw_stone_dark', seg=28, smooth=40.0, cap=False)
    m.tube(circle_pts((0, 0, 0.838), 0.255, 0.255, 40, 'xy'), 0.009, 'gw_gold', seg=5, cap=False)
    m.tube(circle_pts((0, 0, 0.815), 0.17, 0.17, 30, 'xy'), 0.006, 'gw_gold_dim', seg=4, cap=False)
    mr = random.Random(seed + 4)
    moss_line(m, -0.35, 0.35, -0.42, 0.12, mr, density=3, r=0.04)
    moss_line(m, -0.35, 0.35, -0.46, 0.0, mr, density=3, r=0.04, mat='gw_moss_dark')
    return m
