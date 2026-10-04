"""Bulwark: heavy tank, 8 m hull, seven road wheels behind deep side skirts, a huge wedge-shaped composite turret (fictional)."""
import math
import random
from math import pi, sin, cos

from bl import Mesh, trans, roty, rotx, rotz, at_xz, scale
from parts import *
from gear import make_gear

NAME = 'bulwark'
G = dict(p=0.22, th=0.10, n_rw=12, rw_x=[(i - 3) * 0.90 for i in range(7)], zu=1.12,
         sprocket=(-3.45, 13), idler=(3.45, 12), rollers=[-2.25, -0.45, 1.35],
         y_out=-1.85, y_in=-1.20, y_wheel=-1.52, sag=0.17, lost_wheels=(2, 5), lost_rollers=(1,), **{'break': (1.2, 2.6)},
         thrown=[(4.25, 0.0, 0.0), (4.5, 0.02, 0.12), (4.76, 0.0, -0.07), (4.98, 0.06, 0.4)])
TURRET_AT = (0.40, 1.46)
GUN_AT = (1.55, 0.74)
MUZZLE = 6.0
HATCH_AT = (-0.42, 1.32)
LENGTH, HEIGHT = 8.0, 2.6
TRACK_LEN = 5.4
RING_Z = TURRET_AT[1]
HW = 1.30
SKIRT_X0, SKIRT_W, SKIRT_N = -3.02, 0.90, 7


def hull_body(T, wreck=False):
    m = Mesh('hull_body')
    rnd = random.Random(31)
    prof = [(-4.00, 0.52), (3.55, 0.50), (4.02, 0.70), (4.10, 0.92), (2.95, 1.42), (-1.0, 1.42), (-4.00, 1.32)]
    cuts = [((0.0, -0.9397, 0.342), 1.6388), ((0.0, 0.9397, 0.342), 1.6388),
            ((0.62, -0.785, 0.0), 0.62 * 2.95 + 0.785 * HW), ((0.62, 0.785, 0.0), 0.62 * 2.95 + 0.785 * HW)]
    m.slab(prof, -HW, HW, T.hull, cuts=cuts, bevel=0.014)
    # ---- skirt shelf along the top of the skirts (both sides) with a rolled lip
    for sgn in (-1, 1):
        y0, y1 = (-2.14, -1.25) if sgn < 0 else (1.25, 2.14)
        m.box(-3.95, 3.35, y0, y1, 1.205, 1.245, T.hull, bevel=0.01)
        ly0, ly1 = (y0, y0 + 0.03) if sgn < 0 else (y1 - 0.03, y1)
        m.box(-3.95, 3.35, ly0, ly1, 1.10, 1.245, T.hull, bevel=0.008)
        # front and rear mudguards
        m.prism([(3.35, 1.245), (3.85, 1.18), (4.30, 1.0), (4.30, 0.95), (3.85, 1.12), (3.35, 1.205)], y0, y1, T.hull, bevel=0.008)
        m.prism([(-3.95, 1.245), (-4.25, 1.12), (-4.25, 1.07), (-3.95, 1.205)], y0, y1, T.hull, bevel=0.008)
    # ---- deep side skirts: a row of hinged composite panels (near side only matters)
    ys = -2.14
    for i in range(SKIRT_N):
        x0 = SKIRT_X0 + i * SKIRT_W
        x1 = x0 + SKIRT_W - 0.05
        lost = wreck and i in (2, 5)
        if lost:
            # only the hinge strip and a torn stub remain
            m.box(x0, x1, ys, ys + 0.12, 1.08, 1.20, T.hull, bevel=0.01)
            continue
        z0, z1 = 0.46, 1.20
        ang = 0.0
        if wreck and i in (1, 4):
            ang = 0.22 if i == 1 else -0.14
        mx = at_xz(x0, z1, ang)
        # panel: chamfered slab hanging from the shelf
        lx1 = x1 - x0
        pts = [(0.0, -(z1 - z0) + 0.06), (0.06, -(z1 - z0)), (lx1 - 0.06, -(z1 - z0)), (lx1, -(z1 - z0) + 0.06), (lx1, 0.0), (0.0, 0.0)]
        m.slab(pts, ys, ys + 0.12, T.hull, mx=mx, bevel=0.012)
        # pressed ribs and bolt rows
        for zr in (-0.28, -0.50):
            m.box(0.05, lx1 - 0.05, ys - 0.014, ys + 0.004, zr - 0.012, zr + 0.012, T.hull, mx, bevel=0.004)
        for (bx, bz) in [(0.07, -0.09), (lx1 - 0.07, -0.09), (0.07, -(z1 - z0) + 0.1), (lx1 - 0.07, -(z1 - z0) + 0.1),
                         (lx1 / 2, -0.09), (lx1 / 2, -(z1 - z0) + 0.1), (0.07, -0.39), (lx1 - 0.07, -0.39)]:
            m.cyl((bx, ys, bz), (bx, ys - 0.016, bz), 0.02, 0.018, T.steel, seg=6, smooth=0, mx=mx)
        # hinges and a grab handle
        for hx in (0.12, lx1 - 0.12):
            m.box(hx - 0.045, hx + 0.045, ys - 0.018, ys + 0.004, -0.14, 0.02, T.dark, mx, bevel=0.004)
            m.cyl((hx, ys - 0.02, -0.12), (hx, ys - 0.02, 0.0), 0.014, 0.014, T.steel, seg=8, smooth=0, mx=mx)
        m.cyl((lx1 * 0.35, ys - 0.07, -0.19), (lx1 * 0.65, ys - 0.07, -0.19), 0.013, 0.013, T.steel, seg=8, mx=mx)
        m.cyl((lx1 * 0.35, ys, -0.19), (lx1 * 0.35, ys - 0.07, -0.19), 0.013, 0.013, T.steel, seg=8, mx=mx)
        m.cyl((lx1 * 0.65, ys, -0.19), (lx1 * 0.65, ys - 0.07, -0.19), 0.013, 0.013, T.steel, seg=8, mx=mx)
    # ---- the hull side over the wheels: shock-absorber heads in the gaps between skirt panels are hidden; show road wheel bump stops under the lip
    # ---- turret ring
    m.cyl((TURRET_AT[0], 0, RING_Z - 0.07), (TURRET_AT[0], 0, RING_Z), 1.42, 1.38, T.dark, seg=56, smooth=30)
    m.cyl((TURRET_AT[0], 0, RING_Z - 0.24), (TURRET_AT[0], 0, RING_Z - 0.065), 1.47, 1.42, T.hull, seg=56, smooth=30)
    for k in range(31):
        a = (k - 15) * 0.095
        bx, by = TURRET_AT[0] + 1.45 * sin(a), -1.45 * cos(a)
        m.cyl((bx, by, RING_Z - 0.14), (bx + 0.014 * sin(a), by - 0.014 * cos(a), RING_Z - 0.14), 0.018, 0.016, T.steel, seg=6, smooth=0)
    # ---- spaced armour blocks along the glacis (stepped silhouette) and the upper nose
    gx0, gz0, gx1, gz1 = 2.95, 1.42, 4.10, 0.92
    L = math.hypot(gx1 - gx0, gz1 - gz0)
    ang = math.atan2(gz1 - gz0, gx1 - gx0)
    n = 7
    for i in range(n):
        u = (i + 0.5) / n
        cx, cz = gx0 + (gx1 - gx0) * u, gz0 + (gz1 - gz0) * u
        bl_ = L / n
        mx = at_xz(cx, cz, ang)
        m.box(-bl_ / 2 + 0.012, bl_ / 2 - 0.012, -1.05, 1.05, 0.0, 0.17, T.hull, mx, bevel=0.012)
        m.box(-bl_ / 2 + 0.02, bl_ / 2 - 0.02, -1.05, 1.05, 0.17, 0.18, T.dark, mx)
        for yy in (-0.93, -0.5, 0.5, 0.93):
            m.cyl((0, yy, 0.18), (0, yy, 0.2), 0.016, 0.014, T.steel, seg=6, smooth=0, mx=mx)
    # front towing eyes, a rubber flap and headlight bars
    for yy in (-1.0, 1.0):
        m.cyl((4.06, yy, 0.72), (4.20, yy, 0.72), 0.075, 0.07, T.dark, seg=16, smooth=30)
        m.cyl((4.20, yy, 0.72), (4.205, yy, 0.72), 0.04, 0.04, 'steel_dark', seg=10, smooth=0)
    for sgn in (-1, 1):
        yy = sgn * 1.75
        m.box(3.55, 3.88, yy - 0.1, yy + 0.1, 1.245, 1.46, T.dark, bevel=0.014)
        m.cyl((3.88, yy, 1.35), (3.895, yy, 1.35), 0.08, 0.08, 'glass', seg=14, smooth=0)
        for dz in (-0.06, 0.0, 0.06):
            m.cyl((3.88, yy - 0.08, 1.35 + dz), (3.94, yy + 0.08, 1.35 + dz), 0.008, 0.008, T.steel, seg=4, smooth=0)
    mudflap(m, 4.27, 0.99, -2.12, -1.3, 0.5, T, 0.08)
    # ---- engine deck: louvres, grilles, a big air intake box and rear exhausts
    for i in range(14):
        x = -3.85 + i * 0.2
        m.box(x, x + 0.04, -1.0, 1.0, 1.30, 1.36, T.dark, bevel=0.004)
    m.box(-3.9, -2.7, -0.7, 0.7, 1.30, 1.50, T.hull, bevel=0.012)
    exhaust_grille(m, -3.88, -2.72, 1.32, 1.46, -0.71, T, n=8)
    m.box(-1.6, -1.0, -0.9, 0.9, 1.42, 1.50, T.hull, bevel=0.008)
    for yy in (-1.05, 1.05):
        m.cyl((-4.0, yy, 1.0), (-4.30, yy, 1.0), 0.10, 0.09, T.dark, seg=14, smooth=40)
        m.cyl((-4.30, yy, 1.0), (-4.305, yy, 1.0), 0.07, 0.07, 'steel_dark', seg=10, smooth=0)
    for yy in (-1.0, 1.0):
        m.box(-4.04, -4.0, yy - 0.08, yy + 0.08, 0.62, 0.78, T.dark, bevel=0.004)
    # driver's hatch and periscopes
    m.cyl((2.5, -0.6, 1.40), (2.5, -0.6, 1.50), 0.33, 0.30, T.hull, seg=24, smooth=30, bevel=0.006)
    m.cyl((2.5, -0.6, 1.50), (2.5, -0.6, 1.535), 0.28, 0.27, T.dark, seg=24, smooth=30)
    for dy in (-0.2, 0.0, 0.2):
        periscope(m, 2.88, 1.42, -0.6 + dy, 0.18, 0.10, 0.08, T)
    return m


def hull_stowage(T, wreck=False):
    m = Mesh('stowage')
    zf = 1.245
    yn = -2.10
    # three big stowage bins and a tool rack along the skirt shelf
    toolbox(m, -3.80, -2.85, zf, zf + 0.46, yn - 0.02, yn + 0.30, T.hull, T.steel)
    toolbox(m, -2.70, -1.95, zf, zf + 0.34, yn - 0.02, yn + 0.28, T.hull, T.steel)
    toolbox(m, 2.15, 3.05, zf, zf + 0.40, yn - 0.02, yn + 0.28, T.hull, T.steel)
    # tow cables and tools
    for k, zz in enumerate((zf + 0.03, zf + 0.08)):
        pts = []
        for i in range(41):
            u = i / 40
            pts.append((-1.8 + u * 3.5, yn + 0.12 + 0.12 * k, zz + 0.012 * sin(u * 40 + k)))
        m.tube(pts, 0.024, T.cable, seg=8, smooth=70)
        for xx in (-1.8, 1.7):
            m.sphere((xx, yn + 0.12 + 0.12 * k, zz), 0.04, T.steel, seg=10, sc=(1.2, 1.0, 1.0))
    for xx in (-1.2, -0.1, 0.9):
        m.box(xx - 0.03, xx + 0.03, yn + 0.0, yn + 0.28, zf, zf + 0.13, T.dark, bevel=0.006)
    shovel(m, -1.7, -0.4, zf + 0.32, yn + 0.02, T)
    pickaxe(m, -0.3, zf + 0.32, yn + 0.02, T, 1.0)
    # spare track links stacked on the shelf front
    for i in range(5):
        x = 3.15 + i * 0.12
        m.box(x, x + 0.1, yn + 0.0, yn + 0.3, zf, zf + 0.27, T.track, bevel=0.005)
    m.box(3.12, 3.77, yn - 0.02, yn + 0.0, zf + 0.12, zf + 0.14, T.strap)
    m.cyl((2.0 + 0.0, yn + 0.1, zf), (2.0, yn + 0.1, zf + 0.34), 0.07, 0.065, 'red' if not T.wreck else T.steel, seg=14, smooth=40)
    return m


def hull_mesh(T, phase, wreck=False, seed=0):
    m = Mesh('hull')
    m.add(hull_body(T, wreck))
    m.add(hull_stowage(T, wreck))
    g, info = make_gear(G, T, phase, wreck, seed)
    m.add(g)
    return m, info


# ================================================================================================ turret and gun

def turret_mesh(T, wreck=False):
    m = Mesh('turret')
    HY = 1.45
    body = [(-1.75, 0.0), (1.80, 0.0), (2.30, 0.36), (2.14, 0.72), (1.05, 1.16), (-0.65, 1.20), (-1.75, 0.98)]
    cuts = [((0.62, -0.785, 0.0), 0.62 * 0.8 + 0.785 * HY), ((0.62, 0.785, 0.0), 0.62 * 0.8 + 0.785 * HY),
            ((0.0, -0.55, 0.835), 0.55 * HY + 0.835 * 0.86), ((0.0, 0.55, 0.835), 0.55 * HY + 0.835 * 0.86)]
    m.slab(body, -HY, HY, T.turret, cuts=cuts, bevel=0.016)
    ys = -HY
    # composite cheek module: a layered wedge on the front of the turret with bolted covers
    m.slab([(0.9, 0.06), (2.26, 0.06), (2.34, 0.38), (2.18, 0.76), (1.5, 1.05), (0.9, 1.05)], -HY - 0.05, -HY + 0.02, T.turret,
           cuts=[((0.62, -0.785, 0.0), 0.62 * 0.9 + 0.785 * HY + 0.06)], bevel=0.012)
    for (bx, bz) in [(1.05, 0.15), (1.8, 0.15), (2.15, 0.34), (2.07, 0.65), (1.55, 0.95), (1.05, 0.95), (1.4, 0.55)]:
        m.cyl((bx, ys - 0.05, bz), (bx, ys - 0.07, bz), 0.02, 0.018, T.steel, seg=6, smooth=0)
    # bustle
    m.slab([(-2.62, 0.14), (-1.72, 0.05), (-1.72, 1.06), (-2.52, 0.96)], -1.18, 1.18, T.turret,
           cuts=[((-0.5, -0.866, 0), 0.5 * 2.4 + 0.866 * 1.18), ((-0.5, 0.866, 0), 0.5 * 2.4 + 0.866 * 1.18)], bevel=0.014)
    m.slab([(-2.5, 0.96), (-1.72, 1.06), (-1.72, 1.12), (-2.48, 1.02)], -0.9, 0.9, T.turret, bevel=0.008)
    # near side: big bolted appliqué panels
    def panel(x0, x1, z0, z1, th=0.04):
        m.slab([(x0, z0), (x1, z0), (x1, z1 - 0.08), (x1 - 0.08, z1), (x0, z1)], ys - th, ys + 0.002, T.turret, bevel=0.008)
        pts = []
        nx = max(2, int((x1 - x0) / 0.28))
        for i in range(nx + 1):
            pts.append((x0 + 0.06 + (x1 - x0 - 0.12) * i / nx, z0 + 0.06))
            pts.append((x0 + 0.06 + (x1 - x0 - 0.12) * i / nx, z1 - 0.05))
        bolts_xz(m, pts, ys - th, 0.019, T.steel)
    panel(-1.60, -0.80, 0.10, 0.94)
    panel(-0.72, 0.08, 0.10, 1.02)
    panel(0.16, 0.86, 0.10, 1.10)
    weld_bead(m, (-1.64, 0.02), (-1.64, 0.9), ys - 0.002, 0.013, T.turret)
    weld_bead(m, (-0.76, 0.02), (-0.76, 1.0), ys - 0.002, 0.013, T.turret)
    weld_bead(m, (0.12, 0.02), (0.12, 1.05), ys - 0.002, 0.013, T.turret)
    # side stowage bin on the bustle, strapped, and a spare roadwheel-ish drum
    toolbox(m, -2.45, -1.78, 0.18, 0.62, -1.34, -1.12, T.turret, T.steel)
    if not wreck:
        jerrycan(m, -2.1, 0.86, -1.30, T.can, 0.0, 0.34, 0.46, 0.16, True)
    handle(m, -1.4, -1.0, 1.05, ys - 0.04, T.steel, 0.014, 0.06)
    lug(m, 0.9, 0.16, ys - 0.0, 0.05, 0.022, 0.03, T.steel)
    lug(m, -1.68, 0.14, ys, 0.05, 0.022, 0.03, T.steel)
    # smoke dischargers: two banks on the cheek
    smoke_bank(m, 1.15, 0.52, -1.02, T, n=6, ang=0.9, ln=0.30, r=0.042, face=-1)
    # roof: gunner's sight housing, commander's raised cupola with periscopes, loader's hatch and MG
    m.box(0.35, 0.95, -0.9, -0.5, 1.10, 1.28, T.turret, bevel=0.02)
    m.box(0.93, 0.97, -0.84, -0.56, 1.14, 1.25, 'optic')
    m.box(0.30, 0.40, -0.95, -0.45, 1.24, 1.30, T.dark, bevel=0.01)
    cx, cy = -0.42, -0.70
    m.cyl((cx, cy, 1.12), (cx, cy, 1.30), 0.44, 0.42, T.turret, seg=36, smooth=30, bevel=0.005)
    m.cyl((cx, cy, 1.30), (cx, cy, 1.34), 0.39, 0.38, T.dark, seg=36, smooth=30)
    for i in range(10):
        a = i * 2 * pi / 10 + pi / 10
        px, py = cx + 0.41 * cos(a), cy + 0.41 * sin(a)
        m.box(px - 0.055, px + 0.055, py - 0.04, py + 0.04, 1.31, 1.37, T.dark, bevel=0.006)
        if sin(a) < -0.3:
            m.box(px - 0.045, px + 0.045, py - 0.045, py - 0.036, 1.322, 1.36, 'optic')
    if not wreck:
        mxl = at_xz(cx - 0.42, 1.36, -1.3)
        m.cyl((0, cy, 0.0), (0, cy, 0.04), 0.42, 0.42, T.turret, mx=mxl, seg=30, smooth=30)
        m.cyl((0, cy, 0.04), (0, cy, 0.055), 0.23, 0.23, T.dark, mx=mxl, seg=22, smooth=30)
    lx, ly = -0.65, 0.75
    m.cyl((lx, ly, 1.14), (lx, ly, 1.22), 0.32, 0.30, T.turret, seg=28, smooth=30)
    m.cyl((lx, ly, 1.22), (lx, ly, 1.24), 0.28, 0.28, T.dark, seg=24, smooth=30)
    if not wreck:
        m.add(mg_gun(T, 1.05), trans(lx + 0.05, ly, 1.22) @ roty(-0.03))
    antenna_base(m, -1.35, 0.6, 1.05, T)
    antenna_base(m, -1.9, -0.8, 1.0, T, 0.26)
    rolled_tarp(m, -2.35, -1.8, 1.10, -0.5, 0.12, T)
    wire_basket(m, -2.85, -2.62, 0.18, 0.85, -1.1, 1.1, T, 0.1)
    return m


def gun_mesh(T, wreck=False):
    m = Mesh('gun')
    to_x = roty(pi / 2)
    m.slab([(-1.3, 0.0), (-1.2, -0.12), (-0.7, -0.2), (-0.05, -0.24), (-0.05, 0.26), (-0.7, 0.22), (-1.2, 0.12)], -0.22, 0.22, T.dark, bevel=0.012)
    m.cyl((-1.4, 0, 0.0), (-1.2, 0, 0.0), 0.03, 0.05, T.steel, seg=8)
    # big mantlet
    m.slab([(-0.1, -0.34), (0.34, -0.38), (0.52, -0.18), (0.52, 0.18), (0.34, 0.40), (-0.1, 0.36)], -0.52, 0.52, T.gunp, bevel=0.025,
           cuts=[((0.7, -0.714, 0), 0.7 * 0.52), ((0.7, 0.714, 0), 0.7 * 0.52)])
    for zz in (-0.25, 0.25):
        bolts_xz(m, [(0.0 + i * 0.12, zz) for i in range(4)], -0.525, 0.02, T.steel)
    m.box(0.30, 0.50, -0.56, -0.50, -0.12, 0.12, T.dark, bevel=0.01)
    m.cyl((0.0, -0.56, 0.0), (0.0, -0.64, 0.0), 0.085, 0.085, T.steel, seg=14, smooth=40)
    m.lathe([(0.50, 0.28), (0.60, 0.25), (0.75, 0.2), (0.95, 0.17), (0.96, 0.0)], T.rubber, to_x, seg=26, smooth=40, cap=False)

    def band(x0, x1, r, mat=None):
        m.lathe([(x0, 0.0), (x0, r), (x1, r), (x1, 0.0)], mat or T.gunp, to_x, seg=30, smooth=35)
    band(0.95, 2.45, 0.135)
    band(2.47, 3.85, 0.135)
    for x in (1.05, 1.7, 2.3, 2.55, 3.2, 3.75):
        m.lathe([(x - 0.016, 0.0), (x - 0.016, 0.148), (x + 0.016, 0.148), (x + 0.016, 0.0)], T.dark, to_x, seg=30, smooth=35)
    # fume extractor
    m.lathe([(3.88, 0.0), (3.88, 0.11), (3.95, 0.165), (4.55, 0.165), (4.62, 0.11), (4.62, 0.0)], T.gun, to_x, seg=30, smooth=40)
    m.lathe([(4.02, 0.0), (4.02, 0.172), (4.10, 0.172), (4.10, 0.0)], T.dark, to_x, seg=30, smooth=35)
    # barrel and a double-chamber slotted muzzle brake
    m.lathe([(4.60, 0.0), (4.60, 0.105), (5.38, 0.098), (5.40, 0.0)], T.gun, to_x, seg=26, smooth=40)
    m.lathe([(5.36, 0.0), (5.36, 0.20), (5.42, 0.215), (5.96, 0.215), (6.0, 0.18), (6.0, 0.0)], T.gun, to_x, seg=26, smooth=45)
    for x in (5.55, 5.78):
        m.lathe([(x, 0.0), (x, 0.222), (x + 0.07, 0.222), (x + 0.07, 0.0)], 'steel_dark', to_x, seg=26, smooth=30)
    for x in (5.46, 5.68, 5.9):
        m.lathe([(x, 0.0), (x, 0.2155), (x + 0.025, 0.2155), (x + 0.025, 0.0)], T.dark, to_x, seg=26, smooth=30)
    m.cyl((6.0, 0, 0), (5.97, 0, 0), 0.075, 0.08, 'steel_dark', seg=14, smooth=0)
    m.box(5.1, 5.24, -0.06, 0.06, 0.10, 0.17, T.dark, bevel=0.01)
    return m


def wreck_hull_mesh(Tw):
    m, info = hull_mesh(Tw, 0, True, seed=5)
    lid = Mesh('lid')
    lid.slab([(0.0, 0.0), (1.0, 0.0), (1.02, 0.05), (0.0, 0.055)], -0.55, 0.55, Tw.hull, bevel=0.01)
    m.add(lid, at_xz(-3.5, 1.50, 1.0))
    m.warp(0.024, 1.2, 9)
    return m


def wreck_turret_mesh(Tw):
    m = turret_mesh(Tw, wreck=True)
    cx, cy = -0.42, -0.70
    mxl = at_xz(cx - 0.4, 1.38, 1.1)
    m.cyl((0, cy, 0.0), (0, cy, 0.045), 0.42, 0.42, Tw.turret, mx=mxl, seg=26, smooth=30)
    m.cyl((0, cy, 0.045), (0, cy, 0.06), 0.23, 0.23, Tw.dark, mx=mxl, seg=20, smooth=30)
    m.add(gun_mesh(Tw, True), at_xz(GUN_AT[0], GUN_AT[1], -0.06))
    m.warp(0.022, 1.5, 6)
    return m
