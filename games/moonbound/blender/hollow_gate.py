"""Hollow lane: the Gate of Roots (ho_gate_closed, ho_gate_open): a root arch round a ring of voussoirs, a round stone door
carved with the crescent sigil, and a rock wall behind. The two share one origin and one frame, so the game can swap them."""
import math
import random

from mathutils import Vector

import hollow_geo as G
from bl import Mesh, trans, rotx, roty, rotz
from hollow_geo import Lights, braid, bark_tube, rootlet, moss_pads, rock, lathe_uv, vdisc, path_at, blob

PI = math.pi
TAU = 2 * PI
ZC = 1.55          # the door's centre height when it shuts the gate
RIN = 1.32         # opening radius
FOOT = (5.2, 2.2)  # footprint of the frame


def _frame(m, rng):
    # sills
    m.box(-2.2, 2.2, -1.1, -0.1, 0.0, 0.12, 'hl_stone', bevel=0.03)
    m.box(-1.85, 1.85, -0.65, 0.05, 0.12, 0.24, 'hl_stone', bevel=0.03)
    # the rock mass round the arch: hewn hull rocks stacked in columns and a lintel course
    for x, y, z, rx, ry, rz, sd in ((-2.55, 0.55, 0.0, 0.95, 0.9, 1.3, 1), (2.55, 0.55, 0.0, 0.95, 0.9, 1.3, 2), (-2.4, 0.5, 1.5, 0.85, 0.8, 1.0, 3),
                                    (2.4, 0.5, 1.5, 0.85, 0.8, 1.0, 4), (-2.0, 0.6, 2.7, 0.9, 0.8, 0.8, 5), (2.0, 0.6, 2.7, 0.9, 0.8, 0.8, 6),
                                    (-0.9, 0.7, 3.2, 1.0, 0.85, 0.7, 7), (0.9, 0.7, 3.2, 1.0, 0.85, 0.7, 11), (0.0, 0.8, 3.7, 1.3, 0.85, 0.6, 12),
                                    (-3.0, 0.4, 0.0, 0.6, 0.6, 0.8, 8), (3.0, 0.4, 0.0, 0.6, 0.6, 0.8, 9)):
        rock(m, (x, y, z), (rx, ry, rz), seed=sd, jag=0.3)
    # the voussoir ring
    n = 18
    for i in range(n):
        a = TAU * i / n + 0.05
        R = RIN + 0.25
        top = (math.cos(a - PI / 2) > 0.985)
        rad = 0.46 + (0.12 if top else 0.0) + rng.uniform(-0.04, 0.05)
        w = TAU * (RIN + 0.25) / n * 0.93
        dy = 0.27 + rng.uniform(-0.03, 0.05)
        mx = trans(R * math.cos(a), -0.02, ZC + R * math.sin(a)) @ roty(-a)
        G.wbox(m, -rad / 2 + (0.06 if top else 0), rad / 2 + (0.06 if top else 0), -dy, dy, -w / 2, w / 2, 'hl_stone_pale', grain='y', tile=1.2, bevel=0.025, mx=mx)
    # the sill the door runs on
    m.box(-1.7, 1.7, -0.4, 0.4, 0.0, ZC - RIN + 0.02, 'hl_stone', bevel=0.03)


def _roots(m, rng):
    ctrl = []
    N = 13
    for i in range(N):
        t = i / (N - 1)
        a = PI * t
        x = -2.3 * math.cos(a) * (1.0 - 0.05 * math.sin(a))
        z = 4.0 * math.sin(a) ** 0.75 + 0.05 + 0.08 * math.sin(t * 11)
        y = -0.2 + 0.08 * math.sin(t * 6)
        if i in (0, N - 1):
            z = 0.05
        ctrl.append((x, y, z))
    radii = [0.2, 0.64, 0.52, 0.44, 0.38, 0.34, 0.33, 0.34, 0.38, 0.44, 0.52, 0.64, 0.2]
    pts, rads = braid(m, ctrl, radii, n=3, turns=0.3, off=0.48, srad=0.6, seed=31.0, flat=1.0, seg=22,
                      knots=[(0.16, 0.3, 0.18), (0.84, 0.3, 0.18), (0.5, 0.4, 0.16)])
    # a second, thinner cable behind it
    ctrl2 = []
    for i in range(N):
        t = i / (N - 1)
        a = PI * t
        x = -2.05 * math.cos(a)
        z = 3.65 * math.sin(a) ** 0.75 + 0.05
        y = 0.45 + 0.1 * math.sin(t * 5)
        if i in (0, N - 1):
            z = 0.05
        ctrl2.append((x, y, z))
    pts2, rads2 = braid(m, ctrl2, [0.18, 0.4, 0.34, 0.3, 0.27, 0.25, 0.25, 0.25, 0.27, 0.3, 0.34, 0.4, 0.18], n=2, turns=0.35, off=0.45, srad=0.62,
                        core=False, seed=33.0, seg=18)
    # straps: roots wrapping over the stone ring
    for sgn, sd in ((1, 35.0), (-1, 36.0)):
        ctrl = [(sgn * 2.05, -0.5, 0.3), (sgn * 1.95, -0.55, 1.1), (sgn * 1.75, -0.5, 2.0), (sgn * 1.2, -0.45, 2.8)]
        bark_tube(m, ctrl, [0.2, 0.15, 0.12, 0.07], seed=sd, lump=0.2, ridge=0.015, tile=0.7, seg=14, ends=(False, True))
    # buttresses at the feet
    for sx in (-1, 1):
        for k, (dy, L) in enumerate(((-0.9, 1.3), (0.0, 1.0), (-0.45, 1.5))):
            ctrl = [(sx * 2.15, dy * 0.4, 0.5), (sx * (2.15 + L * 0.5), dy * 0.9 - 0.1, 0.3), (sx * (2.15 + L), dy * 1.3 - 0.2, 0.05)]
            bark_tube(m, ctrl, [0.36, 0.28, 0.17], seed=40.0 + k + sx, lump=0.2, ridge=0.015, tile=0.9, ends=(False, True), seg=14)
    moss_pads(m, pts, rads, rng, 12, size=(0.08, 0.2))
    moss_pads(m, pts2, rads2, rng, 4, size=(0.08, 0.16))
    for _ in range(20):
        f = rng.uniform(0.22, 0.78)
        p, tg, r = path_at(pts, rads, f)
        if p.z < 2.3:
            continue
        base = p + Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.5, -0.2), -r * rng.uniform(0.5, 0.9)))
        rootlet(m, base, rng.uniform(0.35, 1.0), 0.024, rng, rng.uniform(-0.1, 0.1), rng.uniform(-0.05, 0.05), floor=0.9)


def _door(m, x, y, zc, mat_face):
    mx = trans(x, y + 0.22, zc) @ rotx(PI / 2)
    R = RIN - 0.03
    lathe_uv(m, [(0, R * 0.97), (0.02, R), (0.42, R), (0.44, R * 0.97), (0.44, 0.0)], 'hl_rock_pale', mx=mx, seg=48, smooth=50.0)
    vdisc(m, R * 0.985, y - 0.2225, zc, mat_face, mx=trans(x, 0, 0), seg=64)
    # a few chips round the rim
    return m


def _passage(m):
    mx = trans(0, 1.5, ZC) @ rotx(PI / 2)
    m.lathe([(0, RIN - 0.02), (1.3, RIN - 0.02)], 'hl_passage', mx, 40, smooth=60.0, cap=False)
    vdisc(m, RIN - 0.01, 1.5, ZC, 'hl_void')
    for k in range(3):
        m.box(-1.0, 1.0, 0.45 + 0.3 * k, 0.78 + 0.3 * k, ZC - RIN, ZC - RIN + 0.1 * (k + 1) + 0.04, 'hl_stone', bevel=0.02)


def _gate(open_):
    m = Mesh('gate')
    L = Lights()
    rng = random.Random(61)
    _frame(m, rng)
    _roots(m, rng)
    if open_:
        _passage(m)
        _door(m, 2.75, -0.45, 1.3, 'hl_door_dormant')
        rock(m, (2.0, -0.7, 0), (0.28, 0.25, 0.2), seed=70, seg=12, rings=8)
        L.add((0.0, 0.3, ZC))
    else:
        _door(m, 0.0, 0.0, ZC, 'hl_door')
        L.add((0.0, -0.45, ZC + 0.2))
    return m, L, FOOT


def gate_closed():
    return _gate(False)


def gate_open():
    return _gate(True)
