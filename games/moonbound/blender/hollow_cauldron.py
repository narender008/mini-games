"""Hollow lane: the Moonwell Cauldron on its runed dais (ho_cauldron)."""
import math
import random

from mathutils import Vector

import hollow_geo as G
from bl import Mesh, trans, rotx, roty, rotz
from hollow_geo import Lights, lathe_uv, torus, disc, rock, blob

PI = math.pi
TAU = 2 * PI
DAIS_TOP = 0.40
OUTER = [(0.52, 0.0), (0.53, 0.25), (0.58, 0.47), (0.70, 0.68), (0.87, 0.84), (1.06, 0.90), (1.25, 0.88), (1.40, 0.82), (1.52, 0.76),
         (1.60, 0.745), (1.64, 0.80), (1.665, 0.83)]
BREW_Z = 1.43


def belly_r(z):
    for (z0, r0), (z1, r1) in zip(OUTER, OUTER[1:]):
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return OUTER[-1][1]


def cauldron():
    m = Mesh('cauldron')
    L = Lights()
    rng = random.Random(51)
    # ---- the stepped dais
    for R, z0, z1 in ((1.70, 0.0, 0.14), (1.52, 0.14, 0.27), (1.36, 0.27, DAIS_TOP)):
        prof = [(z0, R), (z0 + 0.015, R), (z1 - 0.03, R * 0.995), (z1 - 0.012, R * 0.985), (z1, R * 0.955), (z1, 0.0)]
        lathe_uv(m, prof, 'hl_stone', seg=72, smooth=50.0, bevel=0.0)
    disc(m, 1.355, DAIS_TOP + 0.002, 'hl_stone_top', seg=72)
    for k in range(9):
        a = rng.uniform(0, TAU)
        r = rng.uniform(1.72, 1.95)
        s = rng.uniform(0.07, 0.2)
        rock(m, (math.cos(a) * r, math.sin(a) * r, 0), (s, s * 0.8, s * 0.6), seed=rng.random() * 90, seg=14, rings=9)
    # ---- the iron pot: outer wall, rolled rim, inner wall down to below the brew
    prof = OUTER + [(1.685, 0.82), (1.685, 0.72), (1.66, 0.70), (1.55, 0.69), (1.40, 0.68)]
    lathe_uv(m, prof, 'hl_iron', su=5, sv=3, seg=64, smooth=55.0)
    torus(m, 0.78, 0.058, 'hl_iron', trans(0, 0, 1.68), seg=64, rseg=10)
    for z, rr in ((1.0, 0.034), (1.38, 0.028)):
        torus(m, belly_r(z) + 0.012, rr, 'hl_iron', trans(0, 0, z), seg=64, rseg=8)
    for i in range(28):
        a = TAU * (i + 0.5) / 28
        R = belly_r(1.0) + 0.04
        m.ball((R * math.cos(a), R * math.sin(a), 1.0), (0.02, 0.02, 0.02), 'hl_iron', seg=8, rings=5)
    for i in range(22):
        a = TAU * (i + 0.5) / 22
        R = belly_r(1.38) + 0.03
        m.ball((R * math.cos(a), R * math.sin(a), 1.38), (0.017, 0.017, 0.017), 'hl_iron', seg=8, rings=5)
    # ear handles
    for sx in (-1, 1):
        zc = 1.5
        x = sx * (belly_r(zc) + 0.01)
        m.box(x - 0.045, x + 0.045, -0.06, 0.06, zc - 0.08, zc + 0.08, 'hl_iron', bevel=0.012)
        torus(m, 0.14, 0.032, 'hl_iron', trans(x + sx * 0.13, 0, zc) @ rotx(PI / 2), seg=32, rseg=8)
    # ---- the brew
    disc(m, 0.685, BREW_Z, 'hl_brew', seg=64)
    # drips of brew down the front
    for th, ln in ((-0.5, 0.2), (0.12, 0.4), (0.55, 0.16)):
        pts, rr = [], []
        for t in (0.0, 0.25, 0.55, 0.85, 1.0):
            z = 1.66 - ln * t
            R = belly_r(z) + 0.02
            pts.append((R * math.sin(th), -R * math.cos(th), z))
            rr.append((0.022, 0.024, 0.02, 0.034, 0.015)[(0.0, 0.25, 0.55, 0.85, 1.0).index(t)])
        m.tube(pts, rr, 'hl_glass_green', seg=8)
    # ---- the gold crescent on the front
    zc = 1.20
    Rc = 0.2

    def cres(u, v):
        a = 0.75 + (TAU - 1.5) * u
        w = 0.14 * math.sin(PI * u) ** 0.7 + 0.004
        rr = Rc + (v - 0.5) * w
        px, pz = rr * math.cos(a), rr * math.sin(a)
        z = zc + pz
        R = belly_r(z) + 0.012
        return (px, -math.sqrt(max(R * R - px * px, 0.01)), z)

    m.grid_sheet(cres, 28, 4, 'hl_gold', smooth=60.0, thick=0.012)
    # ---- three clawed feet
    for phi in (PI / 2, PI * 7 / 6, PI * 11 / 6):
        d = Vector((math.cos(phi), math.sin(phi), 0.0))
        ctrl = [(d * 0.66 + Vector((0, 0, 0.95))), (d * 0.86 + Vector((0, 0, 0.7))), (d * 0.95 + Vector((0, 0, 0.52))),
                (d * 0.98 + Vector((0, 0, 0.47)))]
        pts, rads, _ = G.sample_path(ctrl, [0.12, 0.1, 0.09, 0.08], 0.04)
        m.tube(pts, rads, 'hl_iron', seg=12, smooth=60.0)
        m.ball(d * 0.98 + Vector((0, 0, 0.46)), (0.095, 0.095, 0.085), 'hl_iron', seg=12, rings=8)
        for ang in (-0.5, 0.0, 0.5):
            c, s = math.cos(ang), math.sin(ang)
            dd = Vector((d.x * c - d.y * s, d.x * s + d.y * c, 0.0))
            base = d * 0.98 + Vector((0, 0, 0.45))
            m.tube([base, base + dd * 0.1 + Vector((0, 0, 0.0)), base + dd * 0.19 + Vector((0, 0, -0.04))], [0.045, 0.035, 0.012], 'hl_iron', seg=8)
    L.add((0.0, 0.0, 1.6))
    return m, L
