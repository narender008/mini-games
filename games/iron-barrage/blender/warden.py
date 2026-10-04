"""Warden: medium MBT, 7.4 m hull, six road wheels, welded angular turret with a bustle, 120 mm gun (fictional)."""
import math
import random
from math import pi, sin, cos

from bl import Mesh, trans, roty, rotx, rotz, at_xz, scale
from parts import *
from gear import make_gear
import kit

NAME = 'warden'
G = dict(p=0.19, th=0.085, n_rw=12, rw_x=[(i - 2.5) * 0.82 for i in range(6)], zu=0.97,
         sprocket=(-3.15, 13), idler=(3.2, 10), rollers=[-1.64, -0.82, 0.82, 1.64],
         y_out=-1.62, y_in=-1.04, y_wheel=-1.34, sag=0.14, lost_wheels=(1, 4), lost_rollers=(1,),
         thrown=[(3.95, 0.0, 0.0), (4.18, 0.02, 0.1), (4.42, 0.0, -0.06), (4.62, 0.05, 0.35)])
TURRET_AT = (0.35, 1.34)           # turret ring centre relative to the hull pivot (x, z)
GUN_AT = (1.28, 0.68)              # trunnion relative to the turret ring centre
MUZZLE = 5.0
HATCH_AT = (-0.28, 1.15)           # commander's waist relative to the turret ring centre
LENGTH, HEIGHT = 7.4, 2.4
TRACK_LEN = 4.1
RING_Z = TURRET_AT[1]
HW = 1.15                          # hull half width


def hull_body(T, wreck=False):
    m = Mesh('hull_body')
    rnd = random.Random(11)
    # ---- main hull: lower hull + glacis, convex
    prof = [(-3.58, 0.46), (3.30, 0.44), (3.76, 0.64), (3.84, 0.82), (2.62, 1.30), (-0.9, 1.30), (-3.58, 1.20)]
    cuts = [((0.0, -0.9397, 0.342), 1.4637), ((0.0, 0.9397, 0.342), 1.4637),     # sloped upper sides
            ((0.62, -0.785, 0.0), 0.62 * 2.62 + 0.785 * 1.15 - 0.0),            # plan chamfer of the nose
            ((0.62, 0.785, 0.0), 0.62 * 2.62 + 0.785 * 1.15)]
    m.slab(prof, -HW, HW, T.hull, cuts=cuts, bevel=0.012)
    # ---- fenders (near side)
    for sgn in (-1, 1):
        y0, y1 = (-1.80, -1.02) if sgn < 0 else (1.02, 1.80)
        m.box(-3.52, 3.16, y0, y1, 1.085, 1.12, T.hull, bevel=0.01)
        lip0, lip1 = (y0, y0 + 0.028) if sgn < 0 else (y1 - 0.028, y1)
        m.box(-3.52, 3.16, lip0, lip1, 1.02, 1.12, T.hull, bevel=0.008)
        m.prism([(3.16, 1.12), (3.62, 1.05), (3.95, 0.92), (3.95, 0.875), (3.60, 0.99), (3.16, 1.085)], y0, y1, T.hull, bevel=0.008)
        m.prism([(-3.52, 1.12), (-3.80, 1.0), (-3.80, 0.955), (-3.52, 1.085)], y0, y1, T.hull, bevel=0.008)
    # fender lip bolts and a rolled edge
    yl = -1.80
    for i in range(36):
        x = -3.4 + i * 0.19
        bolt(m, x, 1.07, yl, 0.014, 0.008, T.steel)
    # fender front rolled edge
    m.cyl((3.9, -1.80, 0.893), (3.9, -1.02, 0.893), 0.02, 0.02, T.hull, seg=8)
    # ---- hull side details seen over the track: shock-absorber heads and bump stops at the wheel stations
    for x in G['rw_x']:
        m.cyl((x, -HW - 0.01, 0.84), (x, -HW - 0.1, 0.84), 0.052, 0.046, T.dark, seg=12, smooth=40, bevel=0.004)
        m.cyl((x, -HW - 0.1, 0.84), (x, -HW - 0.12, 0.84), 0.03, 0.03, T.steel, seg=6, smooth=0)
        m.box(x - 0.09, x + 0.09, -HW - 0.02, -HW, 0.78, 0.95, T.low, bevel=0.006)
    # ---- turret ring
    m.cyl((TURRET_AT[0], 0, RING_Z - 0.06), (TURRET_AT[0], 0, RING_Z), 1.16, 1.12, T.dark, seg=48, smooth=30)
    m.cyl((TURRET_AT[0], 0, RING_Z - 0.2), (TURRET_AT[0], 0, RING_Z - 0.055), 1.20, 1.16, T.hull, seg=48, smooth=30)
    for k in range(27):
        a = (k - 13) * 0.11
        bx, by = TURRET_AT[0] + 1.19 * sin(a), -1.19 * cos(a)
        m.cyl((bx, by, RING_Z - 0.12), (bx + 0.014 * sin(a), by - 0.014 * cos(a), RING_Z - 0.12), 0.016, 0.014, T.steel, seg=6, smooth=0)
    # ---- engine deck: louvres and a grille, exhaust stubs at the rear
    for i in range(10):
        x = -3.3 + i * 0.22
        m.box(x, x + 0.035, -0.8, 0.8, 1.20 + 0.0, 1.245, T.dark, bevel=0.004)
    m.box(-1.2, -0.95, -0.8, 0.8, 1.30, 1.36, T.hull, bevel=0.006)
    m.box(-3.3, -2.5, -0.5, 0.5, 1.20, 1.32, T.hull, bevel=0.01)     # engine hatch bulge
    exhaust_grille(m, -3.28, -2.55, 1.205, 1.30, -0.51, T, n=6)
    for yy in (-0.85, 0.85):
        m.cyl((-3.58, yy, 0.96), (-3.80, yy, 0.96), 0.08, 0.07, T.dark, seg=14, smooth=40)
        m.cyl((-3.80, yy, 0.96), (-3.805, yy, 0.96), 0.05, 0.05, 'steel_dark', seg=10, smooth=0)
    # rear plate details: tow eyes, lights, hinges
    for yy in (-0.9, 0.9):
        m.box(-3.62, -3.58, yy - 0.06, yy + 0.06, 0.6, 0.72, T.dark, bevel=0.004)
    # ---- driver's hatch and periscopes on the glacis deck
    m.cyl((2.15, -0.55, 1.28), (2.15, -0.55, 1.37), 0.30, 0.27, T.hull, seg=24, smooth=30, bevel=0.006)
    m.cyl((2.15, -0.55, 1.37), (2.15, -0.55, 1.405), 0.255, 0.25, T.dark, seg=24, smooth=30)
    for dx in (-0.1, 0.0, 0.1):
        periscope(m, 2.50 + dx * 0.0, 1.29, -0.55 + dx * 2.0, 0.17, 0.09, 0.07, T)
    # headlights on the front fenders with guard bars
    for sgn in (-1, 1):
        yy = sgn * 1.45
        m.box(3.05, 3.32, yy - 0.09, yy + 0.09, 1.12, 1.30, T.dark, bevel=0.012)
        m.cyl((3.32, yy, 1.21), (3.335, yy, 1.21), 0.07, 0.07, 'glass', seg=14, smooth=0)
        for dz in (-0.05, 0.0, 0.05):
            m.cyl((3.32, yy - 0.07, 1.21 + dz), (3.37, yy + 0.07, 1.21 + dz), 0.007, 0.007, T.steel, seg=4, smooth=0)
    # towing eyes on the nose, and a rolled mud flap behind the fender
    for yy in (-0.95, 0.95):
        m.cyl((3.80, yy, 0.72), (3.9, yy, 0.72), 0.06, 0.06, T.dark, seg=14, smooth=30)
        m.cyl((3.9, yy, 0.72), (3.905, yy, 0.72), 0.03, 0.03, 'steel_dark', seg=10, smooth=0)
    mudflap(m, 3.80, 0.86, -1.78, -1.12, 0.38, T, 0.07)
    mudflap(m, -3.64, 0.96, -1.78, -1.12, 0.42, T, -0.05)
    # welds along the glacis edge and deck seam
    kit.hull_dressing(m, T, (3.9, -0.95, 0.72), (-3.64, -0.9, 0.66), (-3.1, -1.17, 1.0), (0.9, 0.3))
    return m


def hull_stowage(T, wreck=False):
    """Fender stowage on the near fender: boxes, cable, tools, spare links, extinguisher, tow shackles."""
    m = Mesh('stowage')
    yf = -1.60               # centre of near fender
    zf = 1.12                # fender top
    # rear toolbox
    toolbox(m, -3.40, -2.70, zf, zf + 0.30, -1.74, -1.48, T.hull, T.steel)
    # tow cables: two long cables looped along the fender with eyes
    for k, zz in enumerate((zf + 0.035, zf + 0.085)):
        pts = []
        n = 40
        for i in range(n + 1):
            u = i / n
            x = -2.55 + u * 3.55
            pts.append((x, yf - 0.02 - 0.12 * k, zz + 0.012 * sin(u * 40 + k)))
        m.tube(pts, 0.021, T.cable, seg=8, smooth=70)
        for xx in (-2.55, 1.0):
            m.sphere((xx, yf - 0.02 - 0.12 * k, zz), 0.035, T.steel, seg=10, sc=(1.2, 1.0, 1.0))
    for xx in (-1.7, -0.6, 0.4):
        m.box(xx - 0.03, xx + 0.03, yf - 0.28, yf - 0.02, zf, zf + 0.12, T.dark, bevel=0.006)
        m.box(xx - 0.04, xx + 0.04, yf - 0.30, yf - 0.24, zf + 0.08, zf + 0.14, T.steel, bevel=0.006)
    # tools on a rack over the cables
    shovel(m, -1.95, -0.65, zf + 0.30, -1.66, T)
    pickaxe(m, -0.55, zf + 0.30, -1.66, T, 1.0)
    # spare track links on the front fender, strapped
    for i in range(4):
        x = 1.25 + i * 0.12
        m.box(x, x + 0.1, -1.76, -1.50, zf, zf + 0.24, T.track, bevel=0.005)
        m.cyl((x + 0.05, -1.77, zf + 0.04), (x + 0.05, -1.80, zf + 0.04), 0.016, 0.016, T.dark, seg=8, smooth=0)
        m.cyl((x + 0.05, -1.77, zf + 0.2), (x + 0.05, -1.80, zf + 0.2), 0.016, 0.016, T.dark, seg=8, smooth=0)
    m.box(1.22, 1.76, -1.79, -1.76, zf + 0.10, zf + 0.12, T.strap)
    # front toolbox and jack block
    toolbox(m, 2.20, 2.72, zf, zf + 0.26, -1.74, -1.50, T.hull, T.steel)
    m.box(1.90, 2.18, -1.70, -1.52, zf, zf + 0.16, T.wood, bevel=0.01)
    # fire extinguisher
    m.cyl((3.0 - 0.02, -1.70, zf + 0.02), (3.0 - 0.02, -1.70, zf + 0.30), 0.065, 0.062, 'red' if not T.wreck else T.steel, seg=14, smooth=40)
    m.cyl((3.0 - 0.02, -1.70, zf + 0.30), (3.0 - 0.02, -1.70, zf + 0.36), 0.03, 0.025, T.steel, seg=8)
    return m


def hull_wreck_extra(T):
    """Extra damage on a burnt-out hull: torn fender, peeled plate, gaping hatch."""
    m = Mesh('wreck_extra')
    return m


def hull_mesh(T, phase, wreck=False, seed=0):
    m = Mesh('hull')
    m.add(hull_body(T, wreck))
    m.add(hull_stowage(T, wreck) if not wreck else hull_stowage(T, wreck))
    g, info = make_gear(G, T, phase, wreck, seed)
    m.add(g)
    return m, info


# ================================================================================================ turret and gun

TX0, TX1 = -1.30, 1.52


def turret_mesh(T, wreck=False, with_gun=False, droop=0.0):
    """Welded, faceted turret: sloped upper sides under bolted appliqué plates, cheek wedges, sight hump, cupola, bustle with stowage."""
    m = Mesh('turret')
    HY = 1.18
    ZS, SA = 0.42, 0.46                       # the upper side leans in from height ZS by SA radians
    ys = -HY
    body = [(-1.28, 0.0), (1.22, 0.0), (1.50, 0.20), (1.50, 0.58), (1.30, 0.86), (1.06, 1.02), (0.05, 1.07), (-0.5, 1.08), (-0.96, 1.00), (-1.28, 0.84)]
    cuts = [((0.52, -0.854, 0.0), 0.52 * 0.35 + 0.854 * 1.18), ((0.52, 0.854, 0.0), 0.52 * 0.35 + 0.854 * 1.18)] + kit.chamfer_cuts(HY, ZS, SA)
    m.slab(body, -HY, HY, T.turret, cuts=cuts, bevel=0.014)
    # roof plate overhang
    m.slab([(-0.5, 1.06), (1.06, 1.02), (1.08, 1.05), (-0.5, 1.10)], -0.80, 0.80, T.turret, bevel=0.01)
    # ---- rear bustle
    m.slab([(-2.00, 0.10), (-1.22, 0.04), (-1.22, 0.94), (-1.92, 0.82)], -1.02, 1.02, T.turret,
           cuts=[((-0.5, -0.866, 0), 0.5 * 1.9 + 0.866 * 1.02), ((-0.5, 0.866, 0), 0.5 * 1.9 + 0.866 * 1.02)], bevel=0.012)
    m.slab([(-1.90, 0.82), (-1.22, 0.94), (-1.22, 0.99), (-1.88, 0.87)], -0.8, 0.8, T.turret, bevel=0.008)
    m.slab([(-1.95, 0.14), (-1.24, 0.08), (-1.24, 0.90), (-1.88, 0.78)], -1.06, -0.98, T.turret, bevel=0.008)
    # ---- near side, lower vertical band: bolted plates, welds
    for (x0, x1) in ((-1.18, -0.55), (-0.48, 0.14), (0.22, 0.9)):
        kit.plate_poly(m, T, [(x0, 0.08), (x1, 0.08), (x1, ZS - 0.02), (x0, ZS - 0.02)], ys, 0.03)
    # ---- near side, sloped upper band: plates in the slope frame, front cheek wedge cut to the profile
    sf = kit.slope_frame(HY, ZS, SA)
    for (x0, x1, s1) in ((-1.15, -0.55, 0.60), (-0.48, 0.14, 0.66), (0.22, 0.88, 0.66)):
        kit.plate_poly(m, T, [(x0, 0.04), (x1, 0.04), (x1, s1 - 0.05), (x1 - 0.05, s1), (x0, s1)], 0.0, 0.032, mx=sf)
    kit.plate_poly(m, T, [(0.95, 0.04), (1.44, 0.04), (1.44, 0.2), (1.28, 0.47), (1.04, 0.63), (0.95, 0.64)], 0.0, 0.036, mx=sf)
    # cheek ear: a thick cast wedge flanking the mantlet on the vertical band
    kit.plate_poly(m, T, [(0.96, 0.08), (1.46, 0.08), (1.52, 0.18), (1.52, ZS - 0.02), (0.96, ZS - 0.02)], ys, 0.045, bolt_r=0.02)
    weld_bead(m, (-1.28, 0.02), (-1.28, 0.8), ys - 0.002, 0.012, T.turret)
    weld_bead(m, (-0.51, 0.05), (-0.51, 0.40), ys - 0.002, 0.011, T.turret)
    weld_bead(m, (0.18, 0.06), (0.18, 0.40), ys - 0.002, 0.011, T.turret)
    # lifting eyes, hinges, grab handles, grab rail along the chamfer edge
    handle(m, -0.98, -0.60, 0.40, ys - 0.032, T.steel, 0.013, 0.05)
    lug(m, 0.40, 0.14, ys, 0.045, 0.02, 0.03, T.steel)
    lug(m, -1.18, 0.12, ys, 0.045, 0.02, 0.03, T.steel)
    hinge(m, -0.3, 0.30, ys - 0.032, 0.13)
    # spare track links strapped to the lower cheek, smoke launcher bank on the sloped front plate
    kit.spare_links(m, T, 1.00, 0.10, ys - 0.045, n=4, w=0.40, th=0.06, depth=0.12)
    sub = Mesh('smoke')
    kit.smoke_launcher(sub, T, 0.38, 0.30, -0.036, n=5, spacing=0.085, ang=0.95, ln=0.26, r=0.034)
    m.add(sub, sf)
    # ---- roof: gunner's sight hump (near side), commander's cupola, loader's hatch, aerials, rails
    kit.sight_hump(m, T, 0.52, 1.02, 1.05, 1.26, -0.66, -0.28)
    m.box(0.52, 0.6, -0.50, -0.44, 1.25, 1.31, T.dark, bevel=0.01)
    # commander's cupola
    cx, cy = -0.25, -0.50
    m.cyl((cx, cy, 1.07), (cx, cy, 1.22), 0.37, 0.35, T.turret, seg=32, smooth=30, bevel=0.005)
    m.cyl((cx, cy, 1.22), (cx, cy, 1.25), 0.33, 0.32, T.dark, seg=32, smooth=30)
    for i in range(8):
        a = i * 2 * pi / 8 + pi / 8
        px, py = cx + 0.35 * cos(a), cy + 0.35 * sin(a)
        m.box(px - 0.05, px + 0.05, py - 0.04, py + 0.04, 1.23, 1.285, T.dark, bevel=0.006)
        if sin(a) < -0.3:
            m.box(px - 0.04, px + 0.04, py - 0.045, py - 0.036, 1.242, 1.272, 'optic')
    m.cyl((cx, cy, 1.285), (cx, cy, 1.30), 0.30, 0.3, T.steel, seg=28, smooth=0)             # ring rim
    if not wreck:
        mxl = at_xz(cx - 0.38, 1.26, -1.35)
        m.cyl((0, cy, 0.0), (0, cy, 0.035), 0.35, 0.35, T.turret, mx=mxl, seg=28, smooth=30)
        m.cyl((0, cy, 0.035), (0, cy, 0.05), 0.2, 0.2, T.dark, mx=mxl, seg=20, smooth=30)
        m.box(-0.20, 0.20, cy - 0.1, cy + 0.1, 0.035, 0.07, T.dark, mxl, bevel=0.01)
    # loader hatch (far side) and its machine gun
    lx, ly = -0.55, 0.52
    m.cyl((lx, ly, 1.07), (lx, ly, 1.14), 0.30, 0.29, T.turret, seg=28, smooth=30)
    m.cyl((lx, ly, 1.14), (lx, ly, 1.155), 0.27, 0.27, T.dark, seg=24, smooth=30)
    if not wreck:
        m.add(mg_gun(T, 1.0), trans(lx + 0.05, ly, 1.14) @ roty(-0.04))
    # roof grab rails, aerial bases with whips
    kit.grab_rail(m, T, -1.15, -0.55, 1.07, -0.78, 0.08, 3)
    kit.whip_aerial(m, T, -1.0, 0.55, 1.08, h=1.3, lean=-0.10)
    kit.whip_aerial(m, T, -1.55, -0.56, 0.9, h=1.7, lean=-0.14, bend=0.12)
    # ---- bustle stowage
    rolled_tarp(m, -1.92, -1.30, 1.0, -0.40, 0.11, T)
    kit.side_bin(m, T, -1.92, -1.32, 0.10, 0.46, -1.06, 0.22, T.turret)
    jerrycan(m, -1.62, 0.70, -1.12, T.can, 0.0, 0.34, 0.46, 0.16, True)
    if not wreck:
        wire_basket(m, -2.18, -1.98, 0.15, 0.82, -1.04, 1.04, T, 0.1)
        m.box(-1.80, -1.44, -1.16, -1.14, 0.58, 0.60, T.strap)
    else:
        wire_basket(m, -2.18, -1.98, 0.15, 0.55, -1.04, 1.04, T, 0.12)
    return m


def gun_mesh(T, wreck=False, trunnion=(0, 0)):
    """The gun: cast mantlet, boot, shroud, thermal sleeve with clamps, fume extractor, muzzle. Origin at the trunnion, pointing +x."""
    m = Mesh('gun')
    to_x = roty(pi / 2)                                    # local +z -> world +x
    # breech and cradle behind the trunnion (hidden inside the turret)
    m.slab([(-1.0, 0.0), (-0.95, -0.10), (-0.55, -0.17), (-0.05, -0.20), (-0.05, 0.22), (-0.55, 0.19), (-0.95, 0.10)], -0.18, 0.18, T.dark, bevel=0.01)
    m.cyl((-1.06, 0, 0.0), (-0.9, 0, 0.0), 0.025, 0.04, T.steel, seg=8)
    kit.cast_mantlet(m, T, 0.20, 0.36, 0.42, 0.34, 0.14)
    m.cyl((0.0, -0.46, 0.0), (0.0, -0.52, 0.0), 0.07, 0.07, T.steel, seg=14, smooth=40)           # trunnion cap
    # rubber shroud (gun boot) in front of the mantlet
    m.lathe([(0.52, 0.22), (0.58, 0.20), (0.66, 0.16), (0.76, 0.135), (0.78, 0.0)], T.rubber, to_x, seg=24, smooth=40, cap=False)
    def band(x0, x1, r, mat=None):
        m.lathe([(x0, 0.0), (x0, r), (x1, r), (x1, 0.0)], mat or T.gunp, to_x, seg=28, smooth=35, cap=True)
    band(0.74, 1.95, 0.108)
    band(1.97, 3.16, 0.108)
    for x in (0.82, 1.35, 1.9, 2.04, 2.6, 3.1):
        m.lathe([(x - 0.014, 0.0), (x - 0.014, 0.119), (x + 0.014, 0.119), (x + 0.014, 0.0)], T.dark, to_x, seg=28, smooth=35)
    # fume extractor
    m.lathe([(3.18, 0.0), (3.18, 0.085), (3.24, 0.125), (3.74, 0.125), (3.80, 0.085), (3.80, 0.0)], T.gun, to_x, seg=28, smooth=40)
    m.lathe([(3.30, 0.0), (3.30, 0.13), (3.36, 0.13), (3.36, 0.0)], T.dark, to_x, seg=28, smooth=35)
    # bare barrel, muzzle ring and muzzle reference box
    m.lathe([(3.78, 0.0), (3.78, 0.078), (4.90, 0.070), (4.92, 0.082), (4.98, 0.082), (5.0, 0.07), (5.0, 0.0)], T.gun, to_x, seg=24, smooth=40)
    m.lathe([(4.76, 0.0), (4.76, 0.092), (4.84, 0.092), (4.84, 0.0)], T.dark, to_x, seg=24, smooth=35)
    m.box(4.55, 4.66, -0.05, 0.05, 0.075, 0.13, T.dark, bevel=0.008)
    m.cyl((5.0, 0, 0), (4.98, 0, 0), 0.04, 0.045, 'steel_dark', seg=14, smooth=0)
    return m


# ================================================================================================ wrecks

def wreck_hull_mesh(Tw):
    m, info = hull_mesh(Tw, 0, True, seed=3)
    # engine hatch blown up and bent, a torn plate hanging off the nose
    lid = Mesh('lid')
    lid.slab([(0.0, 0.0), (0.8, 0.0), (0.82, 0.045), (0.0, 0.05)], -0.46, 0.46, Tw.hull, bevel=0.01)
    lid.box(0.05, 0.75, -0.46, -0.44, 0.0, 0.05, Tw.steel)
    m.add(lid, at_xz(-2.85, 1.31, 0.95))
    m.warp(0.022, 1.4, 7)
    return m


def wreck_turret_mesh(Tw):
    m = turret_mesh(Tw, wreck=True)
    # hatch cover blown open and thrown back off the cupola
    cx, cy = -0.25, -0.58
    mxl = at_xz(cx - 0.34, 1.26, 1.1)
    m.cyl((0, cy, 0.0), (0, cy, 0.04), 0.36, 0.36, Tw.turret, mx=mxl, seg=24, smooth=30)
    m.cyl((0, cy, 0.04), (0, cy, 0.055), 0.2, 0.2, Tw.dark, mx=mxl, seg=20, smooth=30)
    m.add(gun_mesh(Tw, True), at_xz(GUN_AT[0], GUN_AT[1], -0.07))
    m.warp(0.02, 1.6, 4)
    return m
