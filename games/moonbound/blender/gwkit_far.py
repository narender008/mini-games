"""Gloamwall kit: the far backdrop (24 px/m): distant floating ruins of the citadel seen through fog: towers with a few warm lit windows,
a broken bridge, an arch, rock islands with ruins and hanging roots. Big (10-40 m), simple, mostly dark blue-grey with strong rims.

Pivots: towers, spire, arch and bridge stand on z = 0 at the middle of their base; islands have z = 0 at the top surface (the rock hangs
below, into negative z) with the pivot at the middle of the top.
"""
import math
import random

from mathutils import Vector

import bl
from bl import Mesh, trans, rotx, roty, rotz, scale, PI
from gwkit_shapes import revolve, folds, smoothstep

ST, STH, RK, RKH, RT, MS = 'gw_far_stone', 'gw_far_stone_hi', 'gw_far_rock', 'gw_far_rock_hi', 'gw_far_root', 'gw_far_moss'


def windows(m, rng, x0, x1, y_face, z0, z1, n, lit=0.4, w=0.7, h=1.6, face=-1, mat_lit='gw_window', step=None):
    """Narrow arched windows on a face at y_face between heights z0 and z1; a few are lit (emissive)."""
    for i in range(n):
        x = x0 + (x1 - x0) * (i + 0.5) / n
        z = z0 + (z1 - z0) * rng.uniform(0.0, 1.0) if step is None else z0 + step * i
        on = rng.random() < lit
        m.box(x - w / 2, x + w / 2, y_face + 0.0 * face - 0.12 * (1 if face < 0 else -1), y_face + 0.2, z, z + h, mat_lit if on else 'gw_far_dark', bevel=0.05)
        if on:
            m.ball((x, y_face - 0.1, z + h), (w / 2, 0.1, w * 0.45), mat_lit, seg=8, rings=5)


def crenels(m, x0, x1, y0, y1, z, h, n, mat=ST):
    """A row of merlons along x between y0..y1."""
    w = (x1 - x0) / (n * 2 - 1)
    for i in range(n):
        a = x0 + 2 * i * w
        m.box(a, a + w, y0, y1, z, z + h, mat, bevel=0.06)


def hanging_roots(m, rng, cx, cy, z0, r, n, length, mat=RT):
    for i in range(n):
        a = rng.uniform(0, 2 * PI)
        d = r * math.sqrt(rng.random())
        x, y = cx + d * math.cos(a), cy + d * math.sin(a)
        L = length * rng.uniform(0.4, 1.0)
        pts = []
        for k in range(8):
            t = k / 7
            pts.append((x + 0.6 * math.sin(t * 4 + i) * t, y + 0.4 * math.cos(t * 3 + i) * t, z0 - L * t))
        m.tube(pts, [0.55 * (1 - 0.8 * k / 7) for k in range(8)], mat, seg=5, cap=True)


def tower_a(seed=1001):
    """A tall square tower with buttresses, a crenellated top and a few lit windows."""
    rng = random.Random(seed)
    m = Mesh('far_tower_a')
    # a stepped base, the shaft, a setback and the crowning storey with a machicolated overhang
    m.box(-3.6, 3.6, -3.6, 3.6, 0, 2.5, ST, bevel=0.15)
    m.hull([(sx * 3.4, sy * 3.4, 2.5) for sx in (-1, 1) for sy in (-1, 1)] + [(sx * 2.9, sy * 2.9, 5.0) for sx in (-1, 1) for sy in (-1, 1)], STH, bevel=0.12)
    m.box(-2.9, 2.9, -2.9, 2.9, 5.0, 22.5, ST, bevel=0.12)
    for z in (9.5, 15.0):
        m.box(-3.1, 3.1, -3.1, 3.1, z, z + 0.5, STH, bevel=0.1)
    # buttresses at the corners
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.hull([(sx * 3.4, sy * 3.4, 0.0), (sx * 2.7, sy * 3.4, 0.0), (sx * 3.4, sy * 2.7, 0.0), (sx * 3.0, sy * 3.0, 11.0), (sx * 2.7, sy * 3.0, 11.0),
                    (sx * 3.0, sy * 2.7, 11.0)], STH, bevel=0.1)
    m.box(-3.5, 3.5, -3.5, 3.5, 22.5, 23.5, STH, bevel=0.1)
    m.box(-3.9, 3.9, -3.9, 3.9, 23.5, 25.0, ST, bevel=0.15)
    for row, (a, b, c, d) in enumerate(((-3.9, 3.9, -3.9, -3.2), (-3.9, 3.9, 3.2, 3.9), (-3.9, -3.2, -3.2, 3.2), (3.2, 3.9, -3.2, 3.2))):
        m.box(a, b, c, d, 25.0, 25.6, STH, bevel=0.08)
    crenels(m, -3.9, 3.9, -3.9, -3.3, 25.6, 1.4, 4)
    crenels(m, -3.9, 3.9, 3.3, 3.9, 25.6, 1.4, 4)
    m.box(-3.9, -3.3, -2.9, 2.9, 25.6, 27.0, ST, bevel=0.08)
    m.box(3.3, 3.9, -2.9, 2.9, 25.6, 27.0, ST, bevel=0.08)
    # windows: tall slits on the south face, a few lit
    windows(m, rng, -1.6, 1.6, -2.9, 8.0, 21.0, 0, lit=0.3)
    for z, lit in ((7.0, True), (11.5, False), (13.0, True), (17.5, False), (19.5, True)):
        for x in (-1.6, 1.6):
            on = lit and (x > 0) == (z > 12)
            m.box(x - 0.35, x + 0.35, -3.05, -2.7, z, z + 2.0, 'gw_window' if on else 'gw_far_dark', bevel=0.05)
    m.box(-0.5, 0.5, -3.05, -2.7, 3.2, 4.8, 'gw_far_dark', bevel=0.05)          # a doorway
    # a small turret on the north-east corner and a broken lean-to
    m.hull([(2.6 + sx * 1.3, 2.6 + sy * 1.3, 18.0) for sx in (-1, 1) for sy in (-1, 1)] + [(2.6 + sx * 1.0, 2.6 + sy * 1.0, 29.0) for sx in (-1, 1) for sy in (-1, 1)], STH, bevel=0.1)
    m.hull([(2.6 + sx * 1.35, 2.6 + sy * 1.35, 29.0) for sx in (-1, 1) for sy in (-1, 1)] + [(2.6, 2.6, 32.0)], 'gw_far_roof', bevel=0.1)
    m.box(-4.5, -2.9, -1.5, 1.5, 5.0, 9.0, ST, bevel=0.1)
    m.hull([(-4.5, -1.5, 9.0), (-4.5, 1.5, 9.0), (-2.9, -1.5, 11.5), (-2.9, 1.5, 11.5), (-4.5, -1.5, 8.5), (-2.9, -1.5, 9.0)], 'gw_far_roof', bevel=0.1)
    # damage: a chunk missing from the top on the left
    m.hull([(-3.9, -3.9, 27.0), (-1.0, -3.9, 27.0), (-3.9, 0.0, 27.0), (-3.9, -3.9, 29.0), (-2.4, -3.9, 28.4), (-3.9, -1.5, 28.0)], STH, bevel=0.1)
    m.warp(0.12, 0.35, seed)
    return m


def tower_b(seed=1011):
    """A round tower with a broken conical roof, a stair turret and lit windows."""
    rng = random.Random(seed)
    m = Mesh('far_tower_b')
    r_prof = [(0.0, 5.6), (2.5, 5.2), (3.0, 4.6), (16.0, 4.3), (16.6, 4.9), (18.5, 4.9), (19.0, 5.4), (21.0, 5.6)]
    m.lathe(r_prof, ST, seg=26, smooth=50.0, cap=True, bevel=0.0)
    m.lathe([(0.0, 6.2), (1.0, 6.0), (2.6, 5.4)], STH, seg=26, smooth=50.0, cap=False)
    for z in (6.5, 11.0):
        m.lathe([(z, 4.55), (z + 0.2, 4.95), (z + 0.6, 4.95), (z + 0.8, 4.55)], STH, seg=26, smooth=50.0, cap=False)
    # the broken cone: ribs standing up from the top, roof panels on one side only
    for k in range(10):
        a = 2 * PI * k / 10
        top = 26.0 + 4.5 * (0.5 + 0.5 * math.cos(a - 1.0)) - (3.0 if math.cos(a + 1.4) > 0.3 else 0.0)
        m.cyl((5.3 * math.cos(a), 5.3 * math.sin(a), 21.0), (1.0 * math.cos(a), 1.0 * math.sin(a), top), 0.35, 0.18, RK, seg=5, smooth=0.0)
    for k in range(10):
        a0, a1 = 2 * PI * k / 10, 2 * PI * (k + 1) / 10
        if math.cos((a0 + a1) / 2 - 1.0) > -0.1 and not (math.cos((a0 + a1) / 2 + 1.4) > 0.3):
            ro, ri = 5.4, 1.4
            hh = 26.0 + 4.0 * (0.5 + 0.5 * math.cos((a0 + a1) / 2 - 1.0)) - 1.0
            m.hull([(ro * math.cos(a0), ro * math.sin(a0), 21.0), (ro * math.cos(a1), ro * math.sin(a1), 21.0), (ri * math.cos(a0), ri * math.sin(a0), hh),
                    (ri * math.cos(a1), ri * math.sin(a1), hh)], 'gw_far_roof', bevel=0.06)
    # windows on the south side, lit and dark
    for z, ang, lit in ((7.0, -PI / 2, True), (10.5, -PI / 2 - 0.45, False), (13.5, -PI / 2 + 0.4, True), (18.0, -PI / 2, False), (17.0, -PI / 2 - 0.7, True)):
        x, y = 4.5 * math.cos(ang), 4.5 * math.sin(ang)
        m.box(x - 0.35, x + 0.35, y - 0.4, y + 0.1, z, z + 2.2, 'gw_window' if lit else 'gw_far_dark', bevel=0.05, mx=trans(0, 0, 0))
    # stair turret on the east, joined by a flying bridge stub to the west
    m.lathe([(0.0, 2.0), (14.5, 1.9), (15.0, 2.3), (17.0, 2.3)], STH, seg=18, smooth=50.0, cap=True, mx=trans(5.4, 1.6, 0))
    m.hull([(-4.5, -1.2, 11.0), (-4.5, 1.2, 11.0), (-12.0, -1.2, 10.4), (-12.0, 1.2, 10.4), (-4.5, -1.2, 12.0), (-4.5, 1.2, 12.0), (-12.0, -1.2, 11.1), (-12.0, 1.2, 11.1)],
           STH, bevel=0.1)
    m.warp(0.12, 0.35, seed)
    return m


def spire(seed=1021):
    """A needle spire with flying buttresses and pinnacles, its tip broken."""
    rng = random.Random(seed)
    m = Mesh('far_spire')
    m.box(-2.2, 2.2, -2.2, 2.2, 0, 3.0, ST, bevel=0.12)
    m.hull([(sx * 1.8, sy * 1.8, 3.0) for sx in (-1, 1) for sy in (-1, 1)] + [(sx * 1.2, sy * 1.2, 12.0) for sx in (-1, 1) for sy in (-1, 1)], STH, bevel=0.1)
    m.hull([(sx * 1.2, sy * 1.2, 12.0) for sx in (-1, 1) for sy in (-1, 1)] + [(sx * 0.7, sy * 0.7, 26.0) for sx in (-1, 1) for sy in (-1, 1)], ST, bevel=0.08)
    m.hull([(sx * 0.7, sy * 0.7, 26.0) for sx in (-1, 1) for sy in (-1, 1)] + [(0.25, -0.1, 33.0), (-0.1, 0.15, 33.4)], STH, bevel=0.05)
    for z in (8.0, 15.0, 21.0):
        m.box(-1.5 + 0.0 * z, 1.5, -1.5, 1.5, z, z + 0.45, STH, bevel=0.06)
    # four pinnacles round the base of the spire and flying buttresses to them
    for sx in (-1, 1):
        for sy in (-1, 1):
            px, py = sx * 3.0, sy * 3.0
            m.hull([(px + a * 0.7, py + b * 0.7, 0.0) for a in (-1, 1) for b in (-1, 1)] + [(px + a * 0.5, py + b * 0.5, 9.0) for a in (-1, 1) for b in (-1, 1)], STH, bevel=0.08)
            m.hull([(px + a * 0.6, py + b * 0.6, 9.0) for a in (-1, 1) for b in (-1, 1)] + [(px, py, 12.5)], STH, bevel=0.06)
            m.tube([(px * 0.95, py * 0.95, 8.0), (px * 0.62, py * 0.62, 10.8), (px * 0.45, py * 0.45, 11.6)], 0.38, ST, seg=4, cap=True)
    # a few lit slits
    for z, lit in ((6.5, True), (11.0, False), (17.0, True)):
        m.box(-0.2, 0.2, -1.5, -1.0, z, z + 1.8, 'gw_window' if lit else 'gw_far_dark', bevel=0.04)
    m.warp(0.1, 0.4, seed)
    return m


def arch(seed=1031):
    """A big ruined gothic arch on two piers: the left half of the pointed ring stands whole, the right half has fallen short, with a wall
    stub and a lit window in the right pier."""
    rng = random.Random(seed)
    m = Mesh('far_arch')
    half = 7.0                       # half the clear span
    zs = 10.0                        # springing height
    R = 2 * half                     # equilateral pointed arch: each side struck from the opposite springing point
    t = 1.9                          # ring thickness
    for sx in (-1, 1):
        x0, x1 = sorted((sx * (half - 0.3), sx * (half + 3.8)))
        m.box(x0, x1, -2.3, 2.3, 0, 3.0, ST, bevel=0.15)
        x0, x1 = sorted((sx * (half - 0.1), sx * (half + 3.4)))
        m.box(x0, x1, -1.9, 1.9, 3.0, zs, STH, bevel=0.12)
    apex = math.acos(half / R)       # angle (from the springing) where the two arcs meet
    n = 14
    for sgn in (-1, 1):
        cnt = n if sgn < 0 else 7                       # the right side is broken short
        for j in range(cnt):
            f0, f1 = j / float(n), (j + 1) / float(n)
            th = lambda f: PI - (PI - (PI - apex)) * f if False else PI - apex * f
            pts = []
            for rr, f in ((R, f0), (R, f1), (R + t, f1), (R + t, f0)):
                x = half + rr * math.cos(th(f))             # left arc, struck from x = +half
                z = zs + rr * math.sin(th(f))
                pts.append((-x if sgn > 0 else x, z))
            m.prism(pts, -1.5, 1.5, STH if j % 2 else ST, bevel=0.1)
    # keystone-less broken end: tumbling blocks hanging off the right ring and fallen at the right pier's foot
    top_x = half - R * math.cos(PI - apex * 7 / n * 1.0) * -1
    for k in range(4):
        m.box(half + 1.0 + k * 0.9, half + 2.0 + k * 0.9, -1.4, 1.4, 3.0 + k * 0.3, 3.8 + k * 0.3, ST, bevel=0.12, mx=trans(0, 0, 0) @ rotz(0.0))
    # a wall stub and merlons on the left pier, a lit window and a dark one
    m.box(-half - 3.6, -half + 1.0, -1.1, 1.1, zs, zs + 5.0, ST, bevel=0.12)
    crenels(m, -half - 3.6, -half + 1.0, -1.1, 1.1, zs + 5.0, 1.3, 2)
    m.box(-half - 2.4, -half - 1.4, -1.25, -0.9, zs + 1.6, zs + 3.8, 'gw_window', bevel=0.05)
    m.box(half + 0.6, half + 1.4, -2.05, -1.7, 4.5, 6.8, 'gw_window', bevel=0.05)
    m.box(half + 1.9, half + 2.7, -2.05, -1.7, 6.0, 8.4, 'gw_far_dark', bevel=0.05)
    m.warp(0.12, 0.3, seed)
    return m


def bridge(seed=1041):
    """A long stone bridge on tall piers with a parapet, collapsed at the right end."""
    rng = random.Random(seed)
    m = Mesh('far_bridge')
    deck_z = 11.0
    L = 40.0
    n = 5
    span = L / n
    for i in range(n + 1):
        x = -L / 2 + i * span
        if i == n:
            continue
        h = deck_z - 1.0
        m.hull([(x - 1.4, -1.7, 0.0), (x + 1.4, -1.7, 0.0), (x - 1.4, 1.7, 0.0), (x + 1.4, 1.7, 0.0), (x - 1.1, -1.5, h), (x + 1.1, -1.5, h), (x - 1.1, 1.5, h),
                (x + 1.1, 1.5, h)], STH, bevel=0.1)
    # the spandrel walls between the piers: a solid wall from the deck down to the springing, cut by a pointed opening
    for i in range(n):
        x0 = -L / 2 + i * span + 1.1
        x1 = -L / 2 + (i + 1) * span - 1.1
        if i >= n - 1:
            x1 = x0 + (x1 - x0) * 0.55            # the last span is broken short
        cx = (x0 + x1) / 2
        spring, H = deck_z - 5.2, 3.5
        k = 8
        def arch_z(t):
            return spring + H * math.sin(0.4 * PI * t) / math.sin(0.4 * PI)
        right = [(x1 + (cx - x1) * j / k, arch_z(j / float(k))) for j in range(k + 1)]
        left = [(cx + (x0 - cx) * j / k, arch_z(1.0 - j / float(k))) for j in range(1, k + 1)]
        m.prism([(x0, deck_z), (x1, deck_z), (x1, spring)] + right[1:-1] + [(cx, arch_z(1.0))] + left[:-1] + [(x0, spring)], -1.8, 1.8, ST if i % 2 else STH, bevel=0.08)
    m.box(-L / 2 + 1.0, L / 2 - 8.0, -1.8, 1.8, deck_z, deck_z + 0.6, STH, bevel=0.1)
    # parapets with a few gaps
    for sy in (-1, 1):
        for i in range(0, 26):
            x = -L / 2 + 1.0 + i * 1.1
            if x > L / 2 - 8.2 or (i in (8, 9, 17) and sy < 0) or (i in (13, 14) and sy > 0):
                continue
            m.box(x, x + 0.8, sy * 1.7 - 0.2, sy * 1.7 + 0.2, deck_z + 0.6, deck_z + 1.9, ST, bevel=0.06)
    # a gate tower at the left end with a lit window
    m.box(-L / 2 - 2.0, -L / 2 + 3.5, -2.8, 2.8, deck_z, deck_z + 9.0, ST, bevel=0.12)
    crenels(m, -L / 2 - 2.0, -L / 2 + 3.5, -2.8, -2.0, deck_z + 9.0, 1.2, 3)
    m.box(-L / 2 - 0.2, -L / 2 + 1.0, -2.95, -2.6, deck_z + 4.0, deck_z + 6.2, 'gw_window', bevel=0.05)
    m.box(-L / 2 + 1.6, -L / 2 + 2.6, -2.95, -2.6, deck_z + 1.0, deck_z + 5.2, 'gw_far_dark', bevel=0.05)
    # the broken end: jagged blocks and hanging chunks
    for k in range(5):
        x = L / 2 - 8.0 + k * 1.1
        m.hull([(x, -1.8, deck_z), (x + 1.0, -1.8, deck_z), (x, 1.8, deck_z), (x + 1.0, 1.8, deck_z), (x + 0.5, -1.7, deck_z - 1.0 - rng.uniform(0.5, 3.0)),
                (x + 0.5, 1.7, deck_z - 1.0 - rng.uniform(0.5, 3.0))], ST, bevel=0.1)
    m.warp(0.1, 0.4, seed)
    return m


def rock_island(m, rng, R, depth, top_noise=0.5, seed=0, strata=4):
    """The floating rock: a flat top at z = 0 and a ragged inverted cone below, with ledges. Returns nothing."""
    zs = [0.0, -0.8, -2.0, -4.0, -6.5, -9.0, -11.5, -13.5, -depth]
    rp = [1.0, 1.02, 0.96, 0.82, 0.62, 0.45, 0.28, 0.14, 0.0]

    def fn(z, k):
        def r(th):
            n = 1 + 0.18 * math.sin(3 * th + seed + k) + 0.1 * math.sin(7 * th + seed * 2 + k * 1.7) + 0.06 * math.sin(13 * th + k)
            led = 1.0 + 0.06 * math.sin(k * 2.7 + th * 2)
            return R * rp[k] * n * led
        return r
    revolve(m, [(z, fn(z, k)) for k, z in enumerate(zs)], RK, seg=36, closed_top=True, closed_bottom=True)
    # lighter, mossy top plate
    revolve(m, [(0.0, fn(0.0, 0)), (0.5, lambda th: R * (0.97 + 0.15 * math.sin(3 * th + seed)))], RKH, seg=36, closed_top=True, closed_bottom=False)
    m.ball((0, 0, 0.5), (R * 0.9, R * 0.9, 0.5), MS, seg=18, rings=5)


def island_a(seed=1051):
    """A big rock island with the ruins of a chapel and a broken tower, hanging roots."""
    rng = random.Random(seed)
    m = Mesh('far_island_a')
    R = 15.0
    isl = Mesh('rock')
    rock_island(isl, rng, R, 17.0, seed=seed)
    isl.warp(0.35, 0.18, seed)
    m.add(isl)
    isl.free()
    ruin = Mesh('ruin')
    # the chapel: two long walls with lancet windows, a gable end, a broken far wall
    ruin.box(-7.0, 3.5, -4.0, -3.4, 0.4, 7.0, ST, bevel=0.1)
    ruin.box(-7.0, 3.5, 3.4, 4.0, 0.4, 5.0, ST, bevel=0.1)
    ruin.box(-7.0, -6.4, -4.0, 4.0, 0.4, 9.0, ST, bevel=0.1)
    ruin.hull([(-7.0, -4.0, 9.0), (-7.0, 4.0, 9.0), (-6.4, -4.0, 9.0), (-6.4, 4.0, 9.0), (-6.7, 0.0, 12.5)], STH, bevel=0.1)
    for x in (-4.5, -1.5, 1.5):
        ruin.box(x - 0.4, x + 0.4, -4.1, -3.6, 2.5, 6.0, 'gw_window' if x == -1.5 else 'gw_far_dark', bevel=0.04)
    ruin.box(-6.55, -6.3, -0.4, 0.4, 3.5, 8.0, 'gw_window', bevel=0.04)
    # a tower stump on the east side with a lit window and a leaning piece of wall
    ruin.box(5.5, 10.5, -2.5, 2.5, 0.4, 14.0, STH, bevel=0.12)
    ruin.hull([(5.5, -2.5, 14.0), (10.5, -2.5, 14.0), (5.5, 2.5, 14.0), (10.5, 2.5, 14.0), (5.5, -2.5, 15.5), (8.0, -2.5, 17.5), (6.0, 2.5, 16.5)], STH, bevel=0.1)
    ruin.box(7.4, 8.4, -2.65, -2.4, 8.0, 10.2, 'gw_window', bevel=0.05)
    ruin.box(6.4, 7.0, -2.65, -2.4, 3.0, 5.0, 'gw_far_dark', bevel=0.05)
    # columns and rubble
    for i, (x, y) in enumerate(((-9.0, -6.0), (-2.0, 7.5), (0.5, -8.5), (3.5, 8.0))):
        h = rng.uniform(2.5, 6.0)
        ruin.cyl((x, y, 0.3), (x, y, 0.3 + h), 0.55, 0.5, STH, seg=8, smooth=0.0)
    ruin.warp(0.12, 0.4, seed + 1)
    m.add(ruin)
    ruin.free()
    # dead trees
    for (x, y, hgt) in ((-10.0, 4.5, 7.0), (11.5, -5.0, 6.0), (2.5, -9.0, 5.0)):
        pts = [(x, y, 0.3), (x + 0.2, y, hgt * 0.4), (x - 0.3, y + 0.2, hgt * 0.75), (x + 0.4, y, hgt)]
        m.tube(pts, [0.5, 0.35, 0.22, 0.05], RT, seg=5, cap=True)
        for k in range(3):
            a = rng.uniform(0, 2 * PI)
            m.tube([(x, y, hgt * (0.45 + 0.15 * k)), (x + 1.4 * math.cos(a), y + 1.4 * math.sin(a), hgt * (0.55 + 0.15 * k) + 0.8), (x + 2.6 * math.cos(a), y + 2.6 * math.sin(a),
                    hgt * (0.65 + 0.15 * k) + 1.0)], [0.16, 0.1, 0.03], RT, seg=4, cap=True)
    hanging_roots(m, rng, 0.0, 0.0, -2.0, R * 0.75, 26, 17.0)
    return m


def island_b(seed=1061):
    """A smaller rock island with a ruined gate arch, twisted trees and hanging roots."""
    rng = random.Random(seed)
    m = Mesh('far_island_b')
    R = 9.0
    isl = Mesh('rock')
    rock_island(isl, rng, R, 13.0, seed=seed)
    isl.warp(0.3, 0.2, seed)
    m.add(isl)
    isl.free()
    ruin = Mesh('ruin')
    # a freestanding gate: two piers and a broken pointed arch, a wall stub behind
    for sx in (-1, 1):
        ruin.box(sx * 3.2 - 1.0, sx * 3.2 + 1.0, -1.2, 1.2, 0.4, 7.5, STH, bevel=0.1)
    for k in range(7):
        f0, f1 = k / 8.0, (k + 1) / 8.0
        for sgn in (-1, 1):
            if sgn > 0 and k > 3:
                continue
            R2 = 3.2
            xc = -2.2 + R2 * 0.0
            a0, a1 = PI * (0.5 + 0.5 * f0), PI * (0.5 + 0.5 * f1)
            pts = []
            for rr, a in ((2.3, a0), (2.3, a1), (3.5, a1), (3.5, a0)):
                x = rr * math.cos(a) * 0.95
                z = 7.5 + rr * math.sin(a)
                pts.append((x * (-1 if sgn > 0 else 1) if False else (x if sgn < 0 else -x), z))
            if sgn > 0:
                pts = pts[::-1]
            ruin.prism(pts, -1.1, 1.1, STH if k % 2 else ST, bevel=0.1)
    ruin.box(-7.0, -4.0, -0.8, 0.8, 0.4, 5.5, ST, bevel=0.1)
    ruin.box(-5.5, -4.6, -0.9, -0.7, 2.0, 4.0, 'gw_window', bevel=0.04)
    ruin.box(5.0, 6.5, 1.5, 3.0, 0.4, 3.0, ST, bevel=0.1)
    ruin.warp(0.1, 0.45, seed + 1)
    m.add(ruin)
    ruin.free()
    for (x, y, hgt) in ((-2.5, 4.2, 5.5), (4.5, -3.5, 4.0), (-5.0, -3.0, 3.5)):
        pts = [(x, y, 0.3), (x + 0.3, y, hgt * 0.4), (x - 0.4, y + 0.2, hgt * 0.75), (x + 0.5, y, hgt)]
        m.tube(pts, [0.45, 0.3, 0.2, 0.05], RT, seg=5, cap=True)
        for k in range(3):
            a = rng.uniform(0, 2 * PI)
            m.tube([(x, y, hgt * (0.5 + 0.15 * k)), (x + 1.2 * math.cos(a), y + 1.2 * math.sin(a), hgt * (0.6 + 0.15 * k) + 0.7), (x + 2.2 * math.cos(a), y + 2.2 * math.sin(a),
                    hgt * (0.7 + 0.15 * k) + 0.8)], [0.14, 0.09, 0.03], RT, seg=4, cap=True)
    hanging_roots(m, rng, 0.0, 0.0, -2.0, R * 0.7, 20, 14.0)
    return m
