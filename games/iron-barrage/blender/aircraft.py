"""The ground-attack jet (about 16 m, facing +x, side view) and the cargo parachute. Fictional, no markings."""
import math
from math import pi, sin, cos, sqrt

from bl import Mesh, trans, roty, rotx, rotz, at_xz, scale
from parts import bolt
import ordnance as O

TOX = roty(pi / 2)
JA, JB, JD, JM = 'jet_two', 'jet_b', 'jet_dark', 'jet_metal'


def jet():
    """Twin-engined ground-attack jet, ~16 m, facing +x: slim fuselage, high rear nacelles, twin tail fins, low straight wing with stores."""
    m = Mesh('jet')
    # ---- fuselage: tail boom, mid fuselage, cockpit section and nose (lathe about +x)
    prof = [(-7.9, 0.0), (-7.9, 0.12), (-7.2, 0.20), (-5.6, 0.30), (-4.0, 0.42), (-2.4, 0.56), (-0.6, 0.66), (2.0, 0.68), (3.4, 0.64), (4.8, 0.54),
            (6.0, 0.42), (7.0, 0.28), (7.6, 0.14), (7.9, 0.06), (7.9, 0.0)]
    m.lathe(prof, JA, TOX, seg=40, smooth=45, cap=False)
    # dark nose radome, cannon barrel under the nose, pitot tube
    m.lathe([(6.5, 0.0), (6.5, 0.36), (7.0, 0.285), (7.6, 0.145), (7.9, 0.065), (7.9, 0.0)], JD, TOX, seg=32, smooth=45, cap=False)
    m.cyl((6.4, -0.02, -0.28), (8.0, -0.02, -0.28), 0.06, 0.05, 'steel_dark', seg=10, smooth=40)
    m.cyl((8.0, -0.02, -0.28), (8.02, -0.02, -0.28), 0.028, 0.028, 'steel', seg=8, smooth=0)
    m.cyl((7.9, 0, 0.0), (8.25, 0, 0.0), 0.028, 0.011, 'steel_bright', seg=8, smooth=40)
    # ---- cockpit: canopy bubble, its frames and the headrests
    m.sphere((4.7, 0, 0.5), 1.0, 'jet_canopy', seg=28, sc=(1.5, 0.5, 0.42), smooth=80)
    for ax in (3.8, 4.4, 5.0, 5.6):
        k = sqrt(max(0.0, 1 - ((ax - 4.7) / 1.5) ** 2))
        pts = [(ax, -0.5 * k * cos(t), 0.5 + 0.42 * k * sin(t)) for t in [pi / 2 * i / 6 for i in range(7)]]
        m.tube(pts, 0.022, 'steel_dark', seg=6, cap=False)
    spine = []
    for i in range(12):
        x = 3.3 + i * 0.25
        k = sqrt(max(0.0, 1 - ((x - 4.7) / 1.5) ** 2))
        spine.append((x, 0.0, 0.5 + 0.42 * k))
    m.tube(spine, 0.028, 'steel_dark', seg=6, cap=False)
    m.box(3.3, 6.0, -0.26, 0.26, 0.46, 0.52, JA, bevel=0.01)
    for xs in (4.4, 5.2):
        m.box(xs - 0.14, xs + 0.14, -0.12, 0.12, 0.52, 0.82, 'steel_dark', bevel=0.04)
    # ---- engine nacelles, high on the rear fuselage sides: intake lip, fan, nozzle, hot-section band
    for sy in (-1, 1):
        y, z = sy * 0.95, 0.85
        mx = trans(0, y, z) @ TOX
        m.lathe([(-5.4, 0.0), (-5.4, 0.30), (-5.1, 0.37), (-4.2, 0.49), (-3.2, 0.57), (-0.5, 0.58), (-0.25, 0.64), (0.0, 0.62), (0.0, 0.0)], JA, mx, seg=34, smooth=45, cap=False)
        m.lathe([(-0.42, 0.575), (-0.42, 0.59), (-0.3, 0.6), (-0.3, 0.575)], JD, mx, seg=34, smooth=40, cap=False)      # intake lip shadow line
        m.lathe([(0.0, 0.42), (0.0, 0.62), (0.2, 0.66), (0.3, 0.6), (0.3, 0.42), (0.05, 0.46)], JM, mx, seg=34, smooth=45, cap=False)
        m.lathe([(0.04, 0.0), (0.04, 0.42), (0.28, 0.44), (0.28, 0.0)], 'steel_dark', mx, seg=28, smooth=40, cap=True)
        m.lathe([(0.06, 0.0), (0.06, 0.17), (0.32, 0.13), (0.4, 0.0)], 'steel_bright', mx, seg=20, smooth=40, cap=False)
        m.lathe([(-5.4, 0.24), (-5.4, 0.32), (-5.8, 0.40), (-5.8, 0.33)], JM, mx, seg=34, smooth=45, cap=False)
        m.lathe([(-5.45, 0.0), (-5.45, 0.30), (-5.74, 0.36), (-5.74, 0.0)], JD, mx, seg=28, smooth=40, cap=True)
        m.lathe([(-4.0, 0.50), (-4.0, 0.52), (-3.2, 0.60), (-3.2, 0.575)], JM, mx, seg=34, smooth=40, cap=False)
    # ---- tail: twin fins at the tailplane tips (the near one shows), tailplane edge-on between them
    for sy in (-1, 1):
        y = sy * 2.0
        m.slab([(-7.5, 0.6), (-4.8, 0.6), (-4.2, 2.5), (-6.0, 2.5)], y - 0.05, y + 0.05, JA, bevel=0.012)
        m.slab([(-7.5, 0.6), (-7.1, 0.6), (-6.4, 2.5), (-6.7, 2.5)], y - 0.07, y + 0.07, JB, bevel=0.01)
        m.box(-6.2, -4.5, y - 0.07, y + 0.07, 2.48, 2.56, JD, bevel=0.01)
        m.sphere((-5.2, y, 2.58), 0.05, 'red', seg=8)
    m.slab([(-7.8, 0.52), (-5.0, 0.52), (-4.8, 0.7), (-7.6, 0.7)], -2.1, 2.1, JA, bevel=0.015)
    # ---- wing: edge-on, straight, with a darker leading-edge strip
    m.slab([(-1.4, 0.24), (3.6, 0.24), (3.4, 0.54), (-1.0, 0.5)], -8.4, 8.4, JA, bevel=0.015)
    m.slab([(-1.4, 0.24), (-0.7, 0.24), (-0.5, 0.52), (-1.0, 0.5)], -8.4, 8.4, JB, bevel=0.01)
    # ---- pylons and stores under the near wing: drop tank, two bombs, a missile, a wingtip rail; hung below the belly line
    def pylon(x, y, h):
        m.slab([(x - 0.5, 0.26), (x + 0.4, 0.26), (x + 0.3, 0.26 - h), (x - 0.3, 0.26 - h)], y - 0.08, y + 0.08, JA, bevel=0.01)
    pylon(0.7, -3.0, 0.62)
    tank = Mesh('tank')
    tank.lathe([(-1.3, 0.0), (-1.3, 0.16), (-1.0, 0.30), (-0.4, 0.36), (0.45, 0.36), (1.0, 0.29), (1.4, 0.11), (1.4, 0.0)], JB, TOX, seg=28, smooth=45, cap=False)
    tank.box(-0.3, 0.3, -0.06, 0.06, 0.34, 0.44, JM, bevel=0.01)
    m.add(tank, trans(0.7, -3.0, -0.78))
    pylon(2.0, -4.9, 0.5)
    pylon(2.0, -4.55, 0.5)
    for yy in (-4.9, -4.55):
        m.add(O.bomb(), trans(2.0, yy, -0.5))
    pylon(1.4, -6.5, 0.35)
    m.add(O.missile(), trans(1.4, -6.5, -0.2))
    m.box(0.0, 2.4, -8.5, -8.25, 0.34, 0.44, JA, bevel=0.01)
    m.add(O.missile(), trans(1.2, -8.38, 0.3) @ scale(0.7))
    # ---- fuselage details: access panel outlines, rivet rows, antennas, dispensers, tail light
    for x0, x1, z0, z1 in ((-0.5, 0.9, 0.1, 0.4), (1.3, 2.4, -0.4, -0.05), (3.0, 3.6, -0.4, -0.12), (-2.6, -1.7, 0.02, 0.3), (5.0, 5.6, -0.28, -0.02)):
        xc, zc = (x0 + x1) / 2, (z0 + z1) / 2
        rad = 0.68 if -1 < xc < 3.5 else (0.5 if xc > 3.5 else 0.4)
        yy = -sqrt(max(0.01, rad ** 2 - zc ** 2))
        for (a, b, c, d) in ((x0, x1, z0, z0 + 0.014), (x0, x1, z1 - 0.014, z1), (x0, x0 + 0.014, z0, z1), (x1 - 0.014, x1, z0, z1)):
            m.box(a, b, yy - 0.012, yy + 0.012, c, d, 'steel_dark')
    for i in range(36):
        x = -3.5 + i * 0.27
        bolt(m, x, 0.04, -0.62, 0.012, 0.006, 'steel')
    m.box(1.8, 2.0, -0.01, 0.01, 0.68, 1.1, 'steel_dark')
    m.cyl((3.0, 0.0, -0.62), (3.1, 0.0, -0.85), 0.028, 0.018, 'steel_dark', seg=6)
    m.cyl((5.7, 0.0, 0.38), (6.1, 0.0, 0.52), 0.022, 0.018, 'steel_bright', seg=6)
    m.box(-4.6, -3.9, -0.55, -0.45, -0.1, 0.08, 'steel_dark', bevel=0.02)
    m.sphere((-7.88, 0, 0.02), 0.06, 'red', seg=8)
    return m


def parachute():
    m = Mesh('parachute')
    R = 3.5
    z_rim = 5.35
    H = 2.35
    N = 16
    ph = 0.12

    def fn(u, v):
        a = 2 * pi * u
        t = v * pi / 2
        r = R * cos(t) * 0.998
        z = z_rim + H * sin(t) ** 0.85
        gp = (u * N) % 1.0
        bulge = sin(pi * gp) ** 0.6
        k = 1.0 + 0.055 * bulge * (1 - 0.5 * v) * cos(t * 0.4)
        zz = z + 0.06 * bulge * cos(t)
        if v < 0.06:
            zz -= 0.12 * (1 - bulge) * (1 - v / 0.06)
        return (r * k * cos(a + ph), r * k * sin(a + ph), zz)
    m.grid_sheet(fn, 192, 14, 'chute', smooth=70.0)
    for k in range(N):
        a = 2 * pi * k / N + ph
        pts = []
        for i in range(0, 13):
            t = i / 12 * pi / 2 * 0.96
            r = R * cos(t) * 1.012
            pts.append((r * cos(a), r * sin(a), z_rim + H * sin(t) ** 0.85 + 0.005))
        m.tube(pts, 0.032, 'strap', seg=6, smooth=60, cap=False)
    rim = [(R * cos(2 * pi * i / 64 + ph), R * sin(2 * pi * i / 64 + ph), z_rim) for i in range(65)]
    m.tube(rim, 0.04, 'strap', seg=6, smooth=60, cap=False)
    apex = z_rim + H
    m.lathe([(apex - 0.08, 0.34), (apex + 0.03, 0.30), (apex + 0.03, 0.18), (apex - 0.08, 0.2)], 'strap', seg=24, smooth=40, cap=False)
    for k in range(N):
        a = 2 * pi * k / N + ph
        top = (R * cos(a), R * sin(a), z_rim - 0.05)
        m.tube([(0, 0, 0.18), (top[0] * 0.5, top[1] * 0.5, 0.18 + (top[2] - 0.18) * 0.5), top], 0.018, 'rope', seg=5, smooth=60, cap=False)
    m.cyl((0, 0, 0.0), (0, 0, 0.22), 0.06, 0.07, 'steel_dark', seg=10)
    m.sphere((0, 0, -0.02), 0.07, 'steel', seg=10)
    m.cyl((0, 0, 0.22), (0, 0, 0.5), 0.05, 0.12, 'rope', seg=10, smooth=60)
    return m
