"""Lynx: light, fast tank, 6.4 m hull, five road wheels, no skirts, low small turret, slender 90 mm gun (fictional)."""
import math
import random
from math import pi, sin, cos

from bl import Mesh, trans, roty, rotx, rotz, at_xz, scale
from parts import *
from gear import make_gear
import kit

NAME = 'lynx'
G = dict(p=0.16, th=0.075, n_rw=12, rw_x=[(i - 2) * 0.80 for i in range(5)], zu=0.84,
         sprocket=(-2.72, 12), idler=(2.78, 12), rollers=[-1.2, -0.4, 0.4, 1.2],
         y_out=-1.45, y_in=-0.97, y_wheel=-1.22, sag=0.12, lost_wheels=(1,), lost_rollers=(2,), **{'break': (1.0, 2.2)},
         thrown=[(3.45, 0.0, 0.0), (3.64, 0.02, 0.12), (3.84, 0.0, -0.08), (4.02, 0.05, 0.35)])
TURRET_AT = (0.20, 1.10)
GUN_AT = (0.98, 0.44)
MUZZLE = 3.5
HATCH_AT = (-0.22, 0.70)
LENGTH, HEIGHT = 6.4, 1.9
TRACK_LEN = 3.2
RING_Z = TURRET_AT[1]
HW = 0.95


def hull_body(T, wreck=False):
    m = Mesh('hull_body')
    prof = [(-3.18, 0.38), (2.95, 0.36), (3.26, 0.52), (3.32, 0.70), (2.30, 1.10), (-0.7, 1.12), (-3.18, 1.02)]
    cuts = [((0.0, -0.9205, 0.3907), 0.9205 * HW + 0.3907 * 0.90), ((0.0, 0.9205, 0.3907), 0.9205 * HW + 0.3907 * 0.90),
            ((0.6, -0.8, 0.0), 0.6 * 2.3 + 0.8 * HW), ((0.6, 0.8, 0.0), 0.6 * 2.3 + 0.8 * HW)]
    m.slab(prof, -HW, HW, T.hull, cuts=cuts, bevel=0.012)
    # light swept fenders, with the front ones raked down
    for sgn in (-1, 1):
        y0, y1 = (-1.55, -0.92) if sgn < 0 else (0.92, 1.55)
        m.box(-3.05, 2.62, y0, y1, 0.885, 0.915, T.hull, bevel=0.008)
        lip0, lip1 = (y0, y0 + 0.024) if sgn < 0 else (y1 - 0.024, y1)
        m.box(-3.05, 2.62, lip0, lip1, 0.83, 0.915, T.hull, bevel=0.006)
        m.prism([(2.62, 0.915), (3.1, 0.86), (3.5, 0.72), (3.5, 0.69), (3.1, 0.825), (2.62, 0.885)], y0, y1, T.hull, bevel=0.006)
        m.prism([(-3.05, 0.915), (-3.4, 0.80), (-3.4, 0.765), (-3.05, 0.885)], y0, y1, T.hull, bevel=0.006)
    for i in range(30):
        bolt(m, -2.95 + i * 0.2, 0.86, -1.55, 0.012, 0.007, T.steel)
    # shock absorbers and bump stops between track and fender
    for x in G['rw_x']:
        m.cyl((x, -HW - 0.01, 0.74), (x, -HW - 0.09, 0.74), 0.045, 0.04, T.dark, seg=12, smooth=40, bevel=0.003)
        m.cyl((x, -HW - 0.09, 0.74), (x, -HW - 0.11, 0.74), 0.026, 0.026, T.steel, seg=6, smooth=0)
    # turret ring
    m.cyl((TURRET_AT[0], 0, RING_Z - 0.05), (TURRET_AT[0], 0, RING_Z), 0.87, 0.84, T.dark, seg=40, smooth=30)
    m.cyl((TURRET_AT[0], 0, RING_Z - 0.16), (TURRET_AT[0], 0, RING_Z - 0.045), 0.91, 0.87, T.hull, seg=40, smooth=30)
    for k in range(23):
        a = (k - 11) * 0.12
        bx, by = TURRET_AT[0] + 0.9 * sin(a), -0.9 * cos(a)
        m.cyl((bx, by, RING_Z - 0.10), (bx + 0.012 * sin(a), by - 0.012 * cos(a), RING_Z - 0.10), 0.014, 0.012, T.steel, seg=6, smooth=0)
    # engine deck: louvres, grille, small exhaust
    for i in range(9):
        x = -3.0 + i * 0.2
        m.box(x, x + 0.035, -0.65, 0.65, 1.015, 1.055, T.dark, bevel=0.004)
    m.box(-3.05, -2.2, -0.45, 0.45, 1.02, 1.12, T.hull, bevel=0.01)
    exhaust_grille(m, -3.03, -2.22, 1.025, 1.10, -0.46, T, n=5)
    for yy in (-0.62, 0.62):
        m.cyl((-3.18, yy, 0.78), (-3.36, yy, 0.78), 0.065, 0.055, T.dark, seg=14, smooth=40)
        m.cyl((-3.36, yy, 0.78), (-3.365, yy, 0.78), 0.04, 0.04, 'steel_dark', seg=10, smooth=0)
    # driver's hatch (left) and periscopes
    m.cyl((1.8, -0.4, 1.09), (1.8, -0.4, 1.17), 0.25, 0.23, T.hull, seg=24, smooth=30, bevel=0.005)
    m.cyl((1.8, -0.4, 1.17), (1.8, -0.4, 1.195), 0.22, 0.21, T.dark, seg=24, smooth=30)
    for dy in (-0.15, 0.0, 0.15):
        periscope(m, 2.1, 1.10, -0.4 + dy, 0.14, 0.08, 0.06, T)
    # headlights with guards, tow eyes, mudflaps
    for sgn in (-1, 1):
        yy = sgn * 1.25
        m.box(2.55, 2.78, yy - 0.08, yy + 0.08, 0.915, 1.06, T.dark, bevel=0.01)
        m.cyl((2.78, yy, 0.985), (2.79, yy, 0.985), 0.06, 0.06, 'glass', seg=14, smooth=0)
        for dz in (-0.04, 0.0, 0.04):
            m.cyl((2.78, yy - 0.06, 0.985 + dz), (2.82, yy + 0.06, 0.985 + dz), 0.006, 0.006, T.steel, seg=4, smooth=0)
    for yy in (-0.7, 0.7):
        m.cyl((3.28, yy, 0.58), (3.36, yy, 0.58), 0.05, 0.045, T.dark, seg=14, smooth=30)
        m.cyl((3.36, yy, 0.58), (3.365, yy, 0.58), 0.025, 0.025, 'steel_dark', seg=10, smooth=0)
    mudflap(m, 3.2, 0.74, -1.5, -0.98, 0.3, T, 0.1)
    mudflap(m, -3.38, 0.78, -1.5, -0.98, 0.34, T, -0.05)
    kit.hull_dressing(m, T, (3.36, -0.7, 0.58), (-3.4, -0.62, 0.62), (-2.8, -0.97, 0.86), (0.7, 0.25))
    return m


def hull_stowage(T, wreck=False):
    m = Mesh('stowage')
    zf, yf = 0.915, -1.24
    toolbox(m, -2.85, -2.35, zf, zf + 0.24, -1.5, -1.28, T.hull, T.steel)
    for k, zz in enumerate((zf + 0.03, zf + 0.075)):
        pts = []
        for i in range(31):
            u = i / 30
            pts.append((-2.2 + u * 2.6, yf - 0.1 - 0.1 * k, zz + 0.01 * sin(u * 40 + k)))
        m.tube(pts, 0.017, T.cable, seg=8, smooth=70)
        for xx in (-2.2, 0.4):
            m.sphere((xx, yf - 0.1 - 0.1 * k, zz), 0.03, T.steel, seg=10, sc=(1.2, 1.0, 1.0))
    shovel(m, 0.55, 1.7, zf + 0.12, -1.42, T)
    for xx in (-1.6, -0.6, 0.4):
        m.box(xx - 0.025, xx + 0.025, yf - 0.28, yf - 0.02, zf, zf + 0.1, T.dark, bevel=0.005)
    # jerrycans strapped on the near fender, rear
    if not wreck:
        jerrycan(m, -1.95, zf + 0.23, -1.42, T.can, 0.0, 0.34, 0.46, 0.16, True)
        jerrycan(m, -1.58, zf + 0.23, -1.42, T.can, 0.0, 0.34, 0.46, 0.16, True)
    # fire extinguisher and a spare wheel hanging on the rear plate
    m.cyl((1.9, -1.4, zf), (1.9, -1.4, zf + 0.26), 0.055, 0.052, 'red' if not T.wreck else T.steel, seg=14, smooth=40)
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
    HY = 0.86
    body = [(-0.95, 0.0), (0.88, 0.0), (1.10, 0.10), (1.20, 0.26), (1.14, 0.44), (0.90, 0.60), (0.55, 0.70), (-0.1, 0.73), (-0.6, 0.70), (-0.9, 0.60), (-0.97, 0.44)]
    cuts = [((0.55, -0.835, 0.0), 0.55 * 0.2 + 0.835 * HY), ((0.55, 0.835, 0.0), 0.55 * 0.2 + 0.835 * HY),
            ((0.0, -0.6, 0.8), 0.6 * HY + 0.8 * 0.5), ((0.0, 0.6, 0.8), 0.6 * HY + 0.8 * 0.5)]
    m.slab(body, -HY, HY, T.turret, cuts=cuts, bevel=0.03, smooth=45.0)
    ys = -HY
    # small bustle with a stowage basket
    m.slab([(-1.38, 0.10), (-0.92, 0.04), (-0.92, 0.6), (-1.32, 0.52)], -0.72, 0.72, T.turret,
           cuts=[((-0.5, -0.866, 0), 0.5 * 1.3 + 0.866 * 0.72), ((-0.5, 0.866, 0), 0.5 * 1.3 + 0.866 * 0.72)], bevel=0.01)
    # near side: bolted plates with cut corners, welds, handles
    for (x0, x1, z1) in ((-0.82, -0.14, 0.56), (-0.06, 0.40, 0.62)):
        kit.plate_poly(m, T, [(x0, 0.08), (x1, 0.08), (x1, z1 - 0.07), (x1 - 0.07, z1), (x0 + 0.07, z1), (x0, z1 - 0.07)], ys, 0.026, bolt_r=0.014, step=0.2, bolts=True)
    weld_bead(m, (-0.85, 0.02), (-0.85, 0.5), ys - 0.002, 0.009, T.turret)
    weld_bead(m, (0.0, 0.05), (0.0, 0.66), ys - 0.002, 0.009, T.turret)
    handle(m, -0.55, -0.25, 0.62, ys - 0.03, T.steel, 0.011, 0.045)
    lug(m, 0.45, 0.12, ys, 0.036, 0.016, 0.025, T.steel)
    kit.smoke_launcher(m, T, 0.60, 0.40, ys - 0.02, n=4, spacing=0.07, ang=0.95, ln=0.2, r=0.029)
    kit.spare_links(m, T, 0.46, 0.10, ys - 0.03, n=3, w=0.30, th=0.05, depth=0.1)
    # roof: sight box, cupola, loader's hatch and MG
    kit.sight_hump(m, T, 0.28, 0.70, 0.68, 0.88, -0.52, -0.2)
    kit.grab_rail(m, T, -0.85, -0.5, 0.64, -0.55, 0.06, 3, 0.011)
    cx, cy = -0.22, -0.34
    m.cyl((cx, cy, 0.68), (cx, cy, 0.78), 0.30, 0.28, T.turret, seg=28, smooth=30, bevel=0.004)
    m.cyl((cx, cy, 0.78), (cx, cy, 0.805), 0.26, 0.255, T.dark, seg=28, smooth=30)
    for i in range(7):
        a = i * 2 * pi / 7 + pi / 7
        px, py = cx + 0.285 * cos(a), cy + 0.285 * sin(a)
        m.box(px - 0.042, px + 0.042, py - 0.033, py + 0.033, 0.79, 0.84, T.dark, bevel=0.005)
        if sin(a) < -0.3:
            m.box(px - 0.034, px + 0.034, py - 0.037, py - 0.03, 0.80, 0.83, 'optic')
    if not wreck:
        mxl = at_xz(cx - 0.31, 0.81, -1.3)
        m.cyl((0, cy, 0.0), (0, cy, 0.03), 0.29, 0.29, T.turret, mx=mxl, seg=24, smooth=30)
        m.cyl((0, cy, 0.03), (0, cy, 0.042), 0.16, 0.16, T.dark, mx=mxl, seg=18, smooth=30)
    lx, ly = -0.45, 0.4
    m.cyl((lx, ly, 0.69), (lx, ly, 0.745), 0.24, 0.23, T.turret, seg=24, smooth=30)
    m.cyl((lx, ly, 0.745), (lx, ly, 0.76), 0.21, 0.21, T.dark, seg=22, smooth=30)
    if not wreck:
        m.add(mg_gun(T, 0.9), trans(lx + 0.04, ly, 0.76) @ roty(-0.04))
    kit.whip_aerial(m, T, -0.75, 0.45, 0.62, h=1.2, lean=-0.10)
    kit.whip_aerial(m, T, -1.12, -0.5, 0.5, h=1.5, lean=-0.14, bend=0.12)
    rolled_tarp(m, -1.32, -0.95, 0.62, -0.3, 0.085, T)
    wire_basket(m, -1.55, -1.38, 0.12, 0.48, -0.74, 0.74, T, 0.1)
    return m


def gun_mesh(T, wreck=False):
    m = Mesh('gun')
    to_x = roty(pi / 2)
    m.slab([(-0.9, 0.0), (-0.85, -0.07), (-0.5, -0.13), (-0.04, -0.15), (-0.04, 0.16), (-0.5, 0.13), (-0.85, 0.07)], -0.14, 0.14, T.dark, bevel=0.008)
    m.cyl((-0.98, 0, 0.0), (-0.84, 0, 0.0), 0.02, 0.03, T.steel, seg=8)
    kit.cast_mantlet(m, T, 0.10, 0.25, 0.30, 0.21, 0.10)
    m.cyl((0.0, -0.32, 0.0), (0.0, -0.37, 0.0), 0.05, 0.05, T.steel, seg=12, smooth=40)
    m.lathe([(0.34, 0.14), (0.38, 0.125), (0.45, 0.10), (0.52, 0.085), (0.53, 0.0)], T.rubber, to_x, seg=22, smooth=40, cap=False)
    # slender barrel: bore evacuator, then the double-baffle brake
    m.lathe([(0.52, 0.0), (0.52, 0.074), (1.6, 0.074), (1.6, 0.0)], T.gunp, to_x, seg=22, smooth=40)
    for x in (0.62, 1.1, 1.55):
        m.lathe([(x - 0.012, 0.0), (x - 0.012, 0.084), (x + 0.012, 0.084), (x + 0.012, 0.0)], T.dark, to_x, seg=22, smooth=35)
    m.lathe([(1.6, 0.0), (1.6, 0.06), (1.66, 0.092), (2.0, 0.092), (2.06, 0.06), (2.06, 0.0)], T.gun, to_x, seg=22, smooth=40)
    m.lathe([(2.04, 0.0), (2.04, 0.058), (3.1, 0.052), (3.12, 0.0)], T.gun, to_x, seg=20, smooth=40)
    # double-baffle muzzle brake: two chambers with slots between
    m.lathe([(3.08, 0.0), (3.08, 0.1), (3.14, 0.118), (3.5, 0.118), (3.5, 0.0)], T.gun, to_x, seg=22, smooth=45)
    for x in (3.18, 3.30, 3.42):
        m.lathe([(x, 0.0), (x, 0.121), (x + 0.045, 0.121), (x + 0.045, 0.0)], 'steel_dark', to_x, seg=22, smooth=30)
    for x in (3.13, 3.255, 3.375):
        m.lathe([(x, 0.0), (x, 0.119), (x + 0.012, 0.119), (x + 0.012, 0.0)], T.steel, to_x, seg=22, smooth=30)
    m.cyl((3.5, 0, 0), (3.47, 0, 0), 0.045, 0.05, 'steel_dark', seg=12, smooth=0)
    return m


def wreck_hull_mesh(Tw):
    m, info = hull_mesh(Tw, 0, True, seed=4)
    lid = Mesh('lid')
    lid.slab([(0.0, 0.0), (0.7, 0.0), (0.72, 0.04), (0.0, 0.045)], -0.4, 0.4, Tw.hull, bevel=0.008)
    m.add(lid, at_xz(-2.55, 1.12, 0.9))
    m.warp(0.02, 1.4, 3)
    return m


def wreck_turret_mesh(Tw):
    m = turret_mesh(Tw, wreck=True)
    cx, cy = -0.22, -0.34
    mxl = at_xz(cx - 0.28, 0.83, 1.15)
    m.cyl((0, cy, 0.0), (0, cy, 0.035), 0.29, 0.29, Tw.turret, mx=mxl, seg=22, smooth=30)
    m.cyl((0, cy, 0.035), (0, cy, 0.05), 0.16, 0.16, Tw.dark, mx=mxl, seg=16, smooth=30)
    m.add(gun_mesh(Tw, True), at_xz(GUN_AT[0], GUN_AT[1], -0.08))
    m.warp(0.018, 1.7, 8)
    return m
