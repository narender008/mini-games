"""Hollow lane: the carved weapon rack (ho_weapon_rack_both / _twins / _staff) and the heroine's weapons: the Waning Twins (two
crescent sickles) and the Tidecaller (a crescent-headed staff with a moonstone)."""
import math

from mathutils import Vector

import bl
import hollow_geo as G
from bl import Mesh, trans, rotx, roty, rotz
from hollow_geo import torus, wbox, lathe_uv

PI = math.pi
TAU = 2 * PI


def sickle(m, mx, flip=False):
    """One of the Waning Twins in the frame mx: pommel ring at z = 0, grip up to 0.34, guard ring, a crescent blade (silver) that
    hooks toward +x (-x with flip)."""
    f = -1.0 if flip else 1.0
    M = mx @ (bl.scale(-1, 1, 1) if flip else bl.trans(0, 0, 0))
    # grip with navy wrap, gold collars
    m.lathe([(0.04, 0.014), (0.05, 0.019), (0.18, 0.02), (0.32, 0.019), (0.34, 0.014)], 'hl_grip', M, 12, smooth=50.0)
    for z in (0.045, 0.335):
        m.lathe([(z - 0.008, 0.021), (z + 0.008, 0.021)], 'hl_gold', M, 12, smooth=50.0)
    # pommel ring and spike
    G.torus(m, 0.028, 0.0065, 'hl_gold', M @ trans(0, 0, 0.0) @ rotx(PI / 2), seg=20, rseg=6)
    m.cyl((0, 0, 0.034), (0, 0, 0.008), 0.014, 0.006, 'hl_gold', mx=M, seg=8)
    # guard: a gold ring round the blade's root and two small quillons
    G.torus(m, 0.04, 0.0075, 'hl_gold', M @ trans(0.012, 0, 0.38) @ rotx(PI / 2), seg=24, rseg=6)
    m.box(-0.045, 0.045, -0.008, 0.008, 0.352, 0.366, 'hl_gold', mx=M, bevel=0.003)
    # the blade: spine radius R round C, from 215 to 45 degrees, widest a third of the way along, edge on the inside
    R = 0.2
    cx, cz = 0.164, 0.495
    n = 28
    outer, inner = [], []
    for i in range(n + 1):
        t = i / n
        phi = math.radians(215 - 170 * t)
        w = 0.07 * math.sin(PI * (0.08 + 0.92 * t) ** 0.85) ** 0.9 + 0.003
        outer.append((cx + R * math.cos(phi), cz + R * math.sin(phi)))
        inner.append((cx + (R - w) * math.cos(phi), cz + (R - w) * math.sin(phi)))
    poly = outer + inner[::-1][1:-1]
    m.prism(poly, -0.0065, 0.0065, 'hl_silver', mx=M, smooth=30.0, bevel=0.003)
    # a gold inlay along the root of the spine
    inlay = outer[:9] + [(p[0] - (p[0] - cx) * 0.18 / R * 0.5, p[1] - (p[1] - cz) * 0.18 / R * 0.5) for p in outer[8::-1]]
    m.prism(inlay, -0.0075, 0.0075, 'hl_gold', mx=M, smooth=30.0, bevel=0.002)


def tidecaller(m, mx):
    """The staff: 1.7 m of dark wood with gold bands, a gold crescent cradling a glowing moonstone, tassels and charms."""
    m.lathe([(0.0, 0.01), (0.1, 0.017), (0.6, 0.018), (1.2, 0.017), (1.56, 0.016), (1.6, 0.013)], 'hl_wood_dark', mx, 12, smooth=50.0, cap=False)
    m.lathe([(0.55, 0.0195), (1.08, 0.0195)], 'hl_grip', mx, 12, smooth=50.0, cap=False)
    m.lathe([(0.0, 0.0), (0.0, 0.016), (0.1, 0.02), (0.14, 0.012), (0.17, 0.0)], 'hl_gold', mx @ trans(0, 0, -0.07), 10, smooth=50.0)
    for z in (0.5, 0.58, 1.1, 1.18, 1.5, 1.57):
        m.lathe([(z - 0.012, 0.021), (z + 0.012, 0.021)], 'hl_gold', mx, 12, smooth=50.0)
    # crescent head: a cup under the orb whose horns rise on both sides
    R = 0.115
    cz = 1.7
    n = 24
    outer, inner = [], []
    for i in range(n + 1):
        t = i / n
        phi = math.radians(200 + 140 * t)          # sweeps through the bottom (270 degrees)
        w = 0.036 * math.sin(PI * (0.03 + 0.94 * t)) ** 0.7 + 0.004
        outer.append((R * math.cos(phi), cz + R * math.sin(phi)))
        inner.append(((R - w) * math.cos(phi), cz + (R - w) * math.sin(phi)))
    poly = outer + inner[::-1][1:-1]
    m.prism(poly, -0.012, 0.012, 'hl_gold', mx=mx, smooth=30.0, bevel=0.004)
    m.ball((0, 0, cz + 0.015), (0.056, 0.056, 0.056), 'moonfire', mx=mx, seg=16, rings=10)
    # tiny moons and stars at the horn tips, a socket under the cup
    for sx in (-1, 1):
        m.ball((sx * R * 0.94, 0, cz + 0.045), (0.013, 0.013, 0.013), 'hl_gold', mx=mx, seg=8, rings=5)
    m.lathe([(1.6, 0.013), (1.63, 0.03), (1.665, 0.022), (1.69, 0.0)], 'hl_gold', mx, 12, smooth=50.0)
    # tassels and a hanging charm from the upper band
    for k, (dx, ln) in enumerate(((0.02, 0.2), (-0.02, 0.15))):
        a = Vector((dx, -0.012, 1.5))
        b = Vector((dx * 2, -0.02, 1.5 - ln))
        m.tube([mx @ a, mx @ (a + (b - a) * 0.5), mx @ b], [0.004, 0.004, 0.003], 'hl_cloth_teal', seg=5)
        m.ball(tuple(mx @ b), (0.01, 0.01, 0.018), 'hl_gold', seg=6, rings=4)


def _rack(twins, staff):
    m = Mesh('rack')
    W = 2.0
    H = 2.15
    # skids and posts with carved collars
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.05)
        wbox(m, x - 0.07, x + 0.07, -0.3, 0.3, 0.0, 0.09, 'hl_wood_dark', grain='y', tile=0.8, bevel=0.015)
        wbox(m, x - 0.06, x + 0.06, -0.06, 0.06, 0.09, H, 'hl_wood', grain='z', tile=0.7, bevel=0.012)
        m.ball((x, 0.0, H + 0.06), (0.075, 0.075, 0.1), 'hl_wood_dark', seg=10, rings=6)
        for z in (0.45, 1.3, 1.95):
            lathe_uv(m, [(z - 0.03, 0.086), (z + 0.03, 0.086)], 'hl_wood_dark', mx=trans(x, 0, 0), seg=8, smooth=20.0, cap=False)
    wbox(m, -W / 2 + 0.1, W / 2 - 0.1, -0.05, 0.05, 0.09, 0.17, 'hl_wood_dark', grain='x', bevel=0.012)
    # the back: planks of dark wood with a carved brass crescent
    for k in range(7):
        x0 = -0.87 + k * 0.249
        wbox(m, x0 + 0.005, x0 + 0.244, 0.13, 0.17, 0.17, 1.9, 'hl_wood_dark', grain='z', tile=0.8, bevel=0.008)
    wbox(m, -W / 2 - 0.03, W / 2 + 0.03, -0.09, 0.19, 1.9, 2.07, 'hl_wood', grain='x', tile=1.0, bevel=0.015)
    wbox(m, -W / 2 + 0.06, W / 2 - 0.06, -0.3, 0.2, 0.09, 0.14, 'hl_wood', grain='x', tile=1.0, bevel=0.008)       # the floor board
    cres = Mesh('cres')
    R = 0.07
    n = 24
    outer, inner = [], []
    for i in range(n + 1):
        t = i / n
        phi = math.radians(50 + 260 * t)
        w = 0.036 * math.sin(PI * t) ** 0.7 + 0.004
        outer.append((R * math.cos(phi), R * math.sin(phi)))
        inner.append(((R - w) * math.cos(phi), (R - w) * math.sin(phi)))
    cres.prism(outer + inner[::-1][1:-1], -0.012, 0.012, 'hl_brass', smooth=30.0, bevel=0.004)
    m.add(cres, trans(0.0, -0.1, 1.985))
    cres.free()
    # pegs for the sickles (a hanging bar), cradles for the staff
    wbox(m, -1.0, 0.0, 0.0, 0.12, 1.66, 1.72, 'hl_wood', grain='x', bevel=0.008)
    for x in (-0.74, -0.3):
        m.cyl((x, 0.1, 1.69), (x, -0.07, 1.69), 0.014, 0.012, 'hl_iron', seg=8)
        m.ball((x, -0.07, 1.69), (0.02, 0.02, 0.02), 'hl_iron', seg=8, rings=5)
    for z in (0.62, 1.3):
        wbox(m, 0.38, 0.86, 0.0, 0.14, z - 0.025, z + 0.025, 'hl_wood_dark', grain='x', bevel=0.008)
        for x in (0.5, 0.74):
            m.cyl((x, 0.0, z), (x, -0.13, z + 0.0), 0.016, 0.014, 'hl_iron', seg=8)
    if twins:
        # the Waning Twins hang by their pommel rings, blades down, hooking toward each other
        sickle(m, trans(-0.74, -0.04, 1.69) @ roty(PI), flip=True)
        sickle(m, trans(-0.3, -0.04, 1.69) @ roty(PI), flip=True)
    if staff:
        tidecaller(m, trans(0.62, -0.06, 0.14))
    return m


def weapon_rack_both():
    return _rack(True, True)


def weapon_rack_twins():
    return _rack(True, False)


def weapon_rack_staff():
    return _rack(False, True)
