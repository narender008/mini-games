"""Rampart Warden: the armoured spear knight of the bone legion. Blackened steel plate with aged-gold trims over a skeleton, a
tall tower shield with a worn silver crescent (left arm), a 2.6 m spear (right hand), a closed helm with a glowing teal visor
slit, a ragged navy cape (baked cloth). 2.0 m tall. Set gloamwall, 72 px/m, 8 directions mirrored.

Frames: warden_idle 6 @ 8 (loop), warden_walk 8 @ 11 (loop), warden_thrust 10 @ 14 (wind up 0-5, lunge 6, recover 7-9),
warden_charge 6 @ 14 (loop, cloth air (0, +8, 0)), warden_hit 3 @ 16, warden_death 10 @ 12 (topples, armour clatters);
portrait warden.
"""
import math

import numpy as np
from mathutils import Vector, Matrix

import bl
import mats
from bl import Mesh, trans, rotx, roty, rotz, scale
from cloth import Cloth
from rig import Pose, smooth, frame_along
import undead
from undead import Undead, cloth_mesh, dir_of, MIRROR, I4

SET = 'gloamwall'
PI = math.pi
S = 1.1
WALK_SPEED = 2.2         # assumed game speeds (m/s) for the cloth's wind
CHARGE_AIR = 8.0
CAPE_R_PELVIS = 0.165     # capsules the cape rests on (the cape pins stand 0.196 behind the chest axis)
CAPE_R_CHEST = 0.145
SETTLE = 1.6              # the cape starts from the idle pose; give it time to hang from the first pose

mats.define('wrd_cape', base='#202340', base2='#343a60', pattern='weave', pscale=3, pamt=0.65, seed=61, dirt=0.3)
mats.define('wrd_shield', base='#222833', base2='#3a4352', pattern='noise', pscale=9, pamt=0.55, gloss=0.4, wear=0.7, bump=0.25,
            bscale=60, seed=62, bevel=0.006, tex='wrd_crescent', tex_gloss=0.55, tex_bump=0.15)
mats.define('wrd_plate', base='#2b313c', base2='#4b5565', pattern='noise', pscale=8, pamt=0.6, gloss=0.62, wear=0.75, bump=0.2,
            bscale=70, seed=63, bevel=0.006)
mats.define('wrd_spearwood', base='#2a1c14', base2='#4a3524', pattern='grain', pscale=9, pamt=0.6, gloss=0.3, wear=0.4, seed=64)


def _smooth_noise(rng, h, w, cell):
    g = rng.rand(h // cell + 3, w // cell + 3).astype(np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fy, fx = yy / cell, xx / cell
    iy, ix = fy.astype(int), fx.astype(int)
    ty, tx = fy - iy, fx - ix
    ty, tx = ty * ty * (3 - 2 * ty), tx * tx * (3 - 2 * tx)
    a = g[iy, ix] * (1 - tx) + g[iy, ix + 1] * tx
    b = g[iy + 1, ix] * (1 - tx) + g[iy + 1, ix + 1] * tx
    return a * (1 - ty) + b * ty


def crescent_image():
    """The shield's worn silver crescent on a transparent ground, 256 x 384."""
    w, h = 256, 384
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2 - 8, 164.0
    outer = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) - 92.0
    inner = np.sqrt((xx - (cx + 40.0)) ** 2 + (yy - (cy - 14.0)) ** 2) - 80.0
    d = np.maximum(outer, -inner)                                    # signed distance to the crescent
    cres = np.clip(0.5 - d / 1.5, 0, 1)
    rng = np.random.RandomState(9)
    n = 0.55 * _smooth_noise(rng, h, w, 40) + 0.3 * _smooth_noise(rng, h, w, 14) + 0.15 * _smooth_noise(rng, h, w, 5)
    worn = np.clip((n - 0.25) * 2.1, 0, 1)
    scratch = np.clip(1.0 - np.abs(np.sin((xx * 0.8 + yy * 0.55) / 7.0 + 3.0 * _smooth_noise(rng, h, w, 30))) * 6.0, 0, 1)
    a = cres * np.clip(0.30 + 0.7 * worn - 0.25 * scratch, 0, 1)
    img = np.zeros((h, w, 4), np.float32)
    shade = 0.62 + 0.3 * worn - 0.1 * scratch
    img[..., 0], img[..., 1], img[..., 2] = 0.70 * shade, 0.75 * shade, 0.82 * shade
    img[..., 3] = a
    return img


# ------------------------------------------------------------------------------------------------ armour prototypes

def ring(m, rx, ry, z, mat, r=0.01, cy=0.0, n=28, mx=None, flat=1.0):
    pts = [(rx * math.sin(2 * PI * k / n), cy - ry * math.cos(2 * PI * k / n), z) for k in range(n + 1)]
    m.tube(pts, r, mat, seg=5, mx=mx, flat=flat)


def build_helm():
    """Closed helm in the head frame (z up, face -Y): a smooth sculpted armet with a beaked face, a glowing visor slit, a crest."""
    m = Mesh('whelm')
    O = (0.0, 0.01, 0.05)
    ELL = [((0.0, 0.012, 0.088), (0.093, 0.114, 0.098)),            # dome
           ((0.0, -0.022, 0.012), (0.088, 0.108, 0.086)),           # face guard
           ((0.0, -0.012, -0.040), (0.078, 0.102, 0.062)),          # chin and jaw
           ((0.0, -0.088, 0.004), (0.034, 0.068, 0.062)),           # the beak
           ((0.0, 0.03, -0.095), (0.098, 0.102, 0.03))]             # neck skirt
    DENTS = [((0.0, -0.118, 0.054), 0.064, 0.017, 0.024, True),     # the visor slit
             ((0.034, -0.15, -0.012), 0.008, 0.008, 0.012, False),  # breath holes
             ((0.034, -0.15, -0.036), 0.008, 0.008, 0.012, False),
             ((0.034, -0.15, 0.012), 0.008, 0.008, 0.012, False),
             ((-0.034, -0.15, -0.012), 0.008, 0.008, 0.012, False),
             ((-0.034, -0.15, -0.036), 0.008, 0.008, 0.012, False),
             ((-0.034, -0.15, 0.012), 0.008, 0.008, 0.012, False)]

    def rho(u):
        d = [undead._exit(O, u, c, r) for c, r in ELL]
        rr = undead._smax(d, 300.0)
        px, py, pz = O[0] + u[0] * rr, O[1] + u[1] * rr, O[2] + u[2] * rr
        wv = 0.0
        for (qx, qy, qz), rx, rz, depth, glow in DENTS:
            dd = math.sqrt(((px - qx) / rx) ** 2 + ((pz - qz) / rz) ** 2 + ((py - qy) / 0.03) ** 2)
            if dd < 1.0:
                w = min((1.0 - dd) / 0.6, 1.0)
                rr -= depth * w * w * (3 - 2 * w)
                if glow:
                    wv = max(wv, min(w * 1.8, 1.0))
        return rr, wv
    undead.radial_mesh(m, O, rho, 56, 84, 'wrd_plate', 'soul_teal')
    # brow band, crest ridge, a spike and gold trims
    crest = [(0.0, 0.012 + 0.118 * math.cos(t), 0.088 + 0.104 * math.sin(t)) for t in [k * PI / 16 for k in range(17)]]
    m.tube(crest, 0.0105, 'gold_dark', seg=6, flat=0.9)
    m.cyl((0.0, -0.002, 0.19), (0.0, 0.0, 0.225), 0.012, 0.0, 'gold_dark', seg=6)
    ring(m, 0.086, 0.106, -0.062, 'gold_dark', r=0.008, cy=0.02)
    m.tube([(-0.075, -0.1, 0.075), (0.0, -0.126, 0.08), (0.075, -0.1, 0.075)], 0.007, 'gold_dark', seg=5)
    return m


def build_cuirass():
    """Chest frame: breastplate and backplate as one barrel, a gold keel, trims, rivets."""
    m = Mesh('cuirass')
    prof = [(-0.025, 0.128), (0.03, 0.146), (0.10, 0.168), (0.17, 0.178), (0.23, 0.174), (0.27, 0.152), (0.295, 0.105), (0.308, 0.078)]

    def rprof(z):
        for (z0, r0), (z1, r1) in zip(prof, prof[1:]):
            if z0 <= z <= z1:
                return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return prof[-1][1]
    cyc, ysc = -0.012, 0.8
    m.lathe(prof, 'wrd_plate', trans(0, cyc, 0) @ scale(1, ysc, 1), seg=30, smooth=60, cap=True)
    ring(m, 0.13, 0.13 * ysc, -0.025, 'gold_dark', r=0.011, cy=cyc)
    ring(m, 0.175, 0.175 * ysc, 0.12, 'gold_dark', r=0.007, cy=cyc)
    key = [(0.0, cyc - ysc * rprof(z) - 0.004, z) for z in (0.27, 0.22, 0.17, 0.12, 0.07, 0.02)]
    m.tube(key, 0.012, 'gold_dark', seg=6)
    spine = [(0.0, cyc + ysc * rprof(z) + 0.004, z) for z in (0.27, 0.2, 0.13, 0.06)]
    m.tube(spine, 0.01, 'gold_dark', seg=5)
    for sx in (-1, 1):
        for z in (0.05, 0.13, 0.21):
            r = rprof(z)
            m.ball((sx * r * 0.995, cyc + 0.0, z), 0.0085, 'gold_dark', seg=6, rings=4)
        # the plate's arm hole rim
        m.tube([(sx * 0.15, cyc - 0.02, 0.255), (sx * 0.175, cyc, 0.23), (sx * 0.16, cyc + 0.06, 0.25)], 0.009, 'gold_dark', seg=5)
    m.warp(0.0015, 22, 4.0)
    return m


def build_gorget():
    """Neck frame (origin at the base of the neck)."""
    m = Mesh('gorget')
    m.lathe([(-0.01, 0.105), (0.03, 0.092), (0.065, 0.074), (0.1, 0.068)], 'wrd_plate', trans(0, 0.012, 0) @ scale(1, 0.92, 1), seg=24, cap=False)
    ring(m, 0.108, 0.1, -0.012, 'gold_dark', r=0.009, cy=0.012)
    ring(m, 0.07, 0.065, 0.095, 'gold_dark', r=0.007, cy=0.012)
    return m


def build_fauld():
    """Pelvis frame: three articulated lames and a gold belt."""
    m = Mesh('fauld')
    for i, (z0, ra, rb) in enumerate(((0.07, 0.172, 0.164), (0.012, 0.184, 0.176), (-0.046, 0.19, 0.182))):
        m.lathe([(z0, ra), (z0 + 0.062, rb)], 'wrd_plate', trans(0, -0.004, 0) @ scale(1, 0.8, 1), seg=28, cap=False, smooth=50)
        ring(m, ra, ra * 0.8, z0, 'gold_dark', r=0.007, cy=-0.004)
    ring(m, 0.164, 0.131, 0.132, 'gold_dark', r=0.012, cy=-0.004)
    m.box(-0.03, 0.03, -0.17, -0.12, 0.1, 0.16, 'gold_dark', bevel=0.005)
    return m


def build_pauldron():
    """Left shoulder (origin at the joint, +X outward): a domed pauldron with lames and a spike."""
    m = Mesh('pauldron')
    T = roty(0.5)
    m.lathe([(0.0, 0.12), (0.022, 0.116), (0.048, 0.098), (0.07, 0.062), (0.082, 0.0)], 'wrd_plate', trans(0.012, 0, 0.02) @ T @ scale(1, 0.92, 1), seg=24, smooth=50)
    for k in range(3):
        z = -0.002 - 0.036 * k
        m.lathe([(z - 0.036, 0.122 - 0.004 * k), (z, 0.128 - 0.004 * k)], 'wrd_plate', trans(0.012, 0, 0.02) @ T @ scale(1, 0.92, 1), seg=24, cap=False, smooth=50)
        pts = [tuple(trans(0.012, 0, 0.02) @ T @ Vector((0.13 * math.sin(2 * PI * j / 24), -0.12 * math.cos(2 * PI * j / 24), z))) for j in range(25)]
        m.tube(pts, 0.006, 'gold_dark', seg=5)
    m.cyl(tuple(trans(0.012, 0, 0.02) @ T @ Vector((0, 0, 0.078))), tuple(trans(0.012, 0, 0.02) @ T @ Vector((0, 0, 0.13))), 0.016, 0.0, 'gold_dark', seg=6)
    return m


def build_arm_armour():
    """Upper arm in the humerus frame (origin at the shoulder, -Z down the bone)."""
    m = Mesh('rerebrace')
    m.cyl((0, 0, -0.05), (0, 0, -0.3), 0.055, 0.047, 'wrd_plate', seg=14)
    m.cyl((0, 0, -0.05), (0, 0, -0.065), 0.059, 0.059, 'gold_dark', seg=14)
    m.cyl((0, 0, -0.285), (0, 0, -0.3), 0.05, 0.05, 'gold_dark', seg=14)
    m.tube([(0, -0.052, -0.07), (0, -0.054, -0.18), (0, -0.046, -0.29)], 0.008, 'gold_dark', seg=5)
    return m


def build_couter():
    """Elbow cop and forearm armour in the forearm frame (origin at the elbow, +Y the elbow's point)."""
    m = Mesh('couter')
    m.ball((0, 0.012, 0.0), (0.058, 0.06, 0.055), 'wrd_plate', seg=12, rings=7)
    m.cyl((0, 0.04, 0.005), (0, 0.12, -0.03), 0.034, 0.0, 'gold_dark', seg=7)
    ring(m, 0.06, 0.062, 0.0, 'gold_dark', r=0.007, cy=0.012)
    m.cyl((0, 0, -0.045), (0, 0, -0.26), 0.05, 0.042, 'wrd_plate', seg=14)
    m.cyl((0, 0, -0.045), (0, 0, -0.06), 0.054, 0.054, 'gold_dark', seg=14)
    m.cyl((0, 0, -0.245), (0, 0, -0.26), 0.046, 0.046, 'gold_dark', seg=14)
    return m


def build_gauntlet():
    """Left hand in the wrist frame: an armoured fist and cuff."""
    m = Mesh('gauntlet')
    m.cyl((0, 0, 0.005), (0, 0, -0.07), 0.052, 0.046, 'wrd_plate', seg=12)
    m.cyl((0, 0, -0.06), (0, 0, -0.072), 0.05, 0.05, 'gold_dark', seg=12)
    m.ball((-0.012, 0.0, -0.115), (0.05, 0.056, 0.075), 'wrd_plate', seg=12, rings=7)
    for k in range(4):
        m.ball((-0.04, -0.03 + 0.02 * k, -0.15), 0.012, 'gold_dark', seg=6, rings=4)
    m.ball((-0.02, -0.05, -0.09), (0.02, 0.022, 0.03), 'wrd_plate', seg=8, rings=5)
    return m


def build_cuisse():
    """Thigh armour in the femur frame (origin at the hip, -Z down the bone), with a hanging tasset in front."""
    m = Mesh('cuisse')
    m.cyl((0, 0, -0.05), (0, 0, -0.41), 0.076, 0.058, 'wrd_plate', seg=16)
    m.cyl((0, 0, -0.05), (0, 0, -0.066), 0.08, 0.08, 'gold_dark', seg=16)
    m.cyl((0, 0, -0.394), (0, 0, -0.41), 0.062, 0.062, 'gold_dark', seg=16)

    def tas(u, v):
        x = (u - 0.5) * 0.17
        z = -0.0 - 0.27 * v
        y = -0.085 - 0.022 * (1 - (2 * u - 1) ** 2) - 0.02 * v
        return (x, y, z)
    m.grid_sheet(tas, 5, 5, 'wrd_plate', smooth=60, thick=0.012)
    m.tube([tas(u / 8.0, 1.0) for u in range(9)], 0.008, 'gold_dark', seg=5)
    return m


def build_poleyn():
    """Knee cop and shin armour in the tibia frame (origin at the knee)."""
    m = Mesh('greave')
    m.ball((0, -0.026, 0.0), (0.066, 0.06, 0.064), 'wrd_plate', seg=12, rings=7)
    m.cyl((0.04, -0.02, 0.0), (0.11, -0.02, 0.0), 0.03, 0.0, 'gold_dark', seg=7)
    m.cyl((0, -0.03, 0.0), (0, -0.075, 0.0), 0.018, 0.0, 'gold_dark', seg=7)
    m.cyl((0, 0, -0.06), (0, 0, -0.41), 0.058, 0.043, 'wrd_plate', seg=14)
    m.cyl((0, 0, -0.06), (0, 0, -0.075), 0.062, 0.062, 'gold_dark', seg=14)
    m.cyl((0, 0, -0.395), (0, 0, -0.41), 0.047, 0.047, 'gold_dark', seg=14)
    m.tube([(0, -0.058, -0.08), (0, -0.056, -0.24), (0, -0.044, -0.4)], 0.01, 'gold_dark', seg=5)
    return m


def build_sabaton():
    """Left foot in the ankle frame (ground at z = -0.065, toes toward -Y): a plated shoe over the bones."""
    m = Mesh('sabaton')
    m.hull([(-0.047, 0.082, -0.062), (0.047, 0.082, -0.062), (-0.052, 0.074, 0.012), (0.052, 0.074, 0.012), (-0.05, -0.03, 0.01), (0.05, -0.03, 0.01),
            (-0.052, -0.04, -0.062), (0.052, -0.04, -0.062)], 'wrd_plate', bevel=0.006)
    m.hull([(-0.052, -0.03, -0.062), (0.052, -0.03, -0.062), (-0.046, -0.04, 0.0), (0.046, -0.04, 0.0), (-0.052, -0.12, -0.062),
            (0.052, -0.12, -0.062), (-0.044, -0.12, -0.004), (0.044, -0.12, -0.004), (-0.046, -0.20, -0.062), (0.046, -0.20, -0.062),
            (-0.036, -0.2, -0.026), (0.036, -0.2, -0.026), (-0.02, -0.268, -0.062), (0.02, -0.268, -0.062), (0.0, -0.275, -0.04)],
           'wrd_plate', bevel=0.005)
    ring(m, 0.056, 0.064, 0.006, 'gold_dark', r=0.008, cy=0.012)
    m.tube([(0.0, -0.04, 0.0), (0.0, -0.12, -0.004), (0.0, -0.2, -0.026), (0.0, -0.268, -0.045)], 0.007, 'gold_dark', seg=5)
    m.tube([(-0.05, -0.12, -0.03), (0.0, -0.126, 0.0), (0.05, -0.12, -0.03)], 0.006, 'gold_dark', seg=5)
    return m


def build_shield():
    """Tower shield in its own frame: face toward -Y, upright, centred on the origin; a worn silver crescent, gold rim, boss."""
    m = Mesh('tower')
    W, H = 0.62, 1.22

    def shape(u, v):
        # v: 0 bottom .. 1 top; a rounded bottom, straight sides, a slightly bowed top
        f = 1.0
        if v < 0.45:
            f = 0.42 + 0.58 * math.sqrt(max(0.0, 1.0 - ((0.45 - v) / 0.45) ** 2))
        x = (u - 0.5) * W * f
        z = (v - 0.5) * H
        y = -0.06 * (1 - (2 * u - 1) ** 2) * (1 - 0.3 * v)
        return (x, y, z)
    m.grid_sheet(shape, 8, 14, 'wrd_shield', smooth=55, thick=0.03)
    # a gold rim along the sides, the top and round the foot of the face
    outline = [(0.0, 0.42 + 0.58 * k / 8) for k in range(9)] + [(k / 8, 1.0) for k in range(1, 8)] + [(1.0, 1.0 - 0.58 * k / 8) for k in range(0, 9)]
    pts = [Vector(shape(u, v)) + Vector((0, -0.02, 0)) for u, v in outline]
    m.tube(pts, 0.015, 'gold_dark', seg=6, flat=0.9)
    edge = [Vector(shape(1.0, 0.42 * (1 - k / 8.0))) + Vector((0, -0.02, 0)) for k in range(0, 9)]
    edge += [Vector(shape(1.0 - k / 16.0, 0.0)) + Vector((0, -0.02, 0)) for k in range(1, 17)]
    edge += [Vector(shape(0.0, 0.42 * k / 8.0)) + Vector((0, -0.02, 0)) for k in range(1, 9)]
    m.tube(edge, 0.015, 'gold_dark', seg=6, flat=0.9)
    # boss and bolts
    m.lathe([(0.0, 0.09), (0.012, 0.085), (0.032, 0.065), (0.05, 0.034), (0.058, 0.0)], 'gold_dark', trans(0, -0.07, 0.1) @ rotx(PI / 2), seg=20)
    for k in range(6):
        a = 2 * PI * k / 6
        m.ball((0.11 * math.cos(a), -0.066, 0.1 + 0.11 * math.sin(a)), 0.011, 'gold_dark', seg=6, rings=4)
    m.warp(0.0015, 14, 6.0)
    return m


def build_spear():
    """The spear in its own frame: butt at the origin, +Z toward the tip (2.6 m), blade flat in the XZ plane."""
    m = Mesh('spear')
    L = 2.6
    m.cyl((0, 0, 0), (0, 0, L - 0.32), 0.0185, 0.0175, 'wrd_spearwood', seg=8)
    m.cyl((0, 0, -0.05), (0, 0, 0.1), 0.0245, 0.0245, 'und_iron', seg=8)
    m.cyl((0, 0, -0.12), (0, 0, -0.05), 0.016, 0.0, 'und_iron', seg=6)                       # the butt spike
    for z in (0.6, 1.2, 1.8):
        m.cyl((0, 0, z), (0, 0, z + 0.025), 0.0215, 0.0215, 'gold_dark', seg=8)
    zc = L - 0.34
    m.cyl((0, 0, zc), (0, 0, zc + 0.1), 0.026, 0.0235, 'gold_dark', seg=8)                      # socket
    m.box(-0.08, 0.08, -0.009, 0.009, zc + 0.095, zc + 0.115, 'gold_dark', bevel=0.003)          # lugs
    pts = [(-0.007, zc + 0.1), (-0.04, zc + 0.14), (-0.052, zc + 0.19), (-0.03, zc + 0.27), (0.0, L + 0.04), (0.03, zc + 0.27), (0.052, zc + 0.19), (0.04, zc + 0.14), (0.007, zc + 0.1)]
    m.prism(pts, -0.007, 0.007, 'wrd_plate', bevel=0.002)
    m.box(-0.0035, 0.0035, -0.011, 0.011, zc + 0.12, L, 'wrd_plate', bevel=0.001)
    return m


def tower_matrix(J, P):
    """The tower shield stands upright on the left forearm: its face looks forward and a little outward (`sn_az`), the top leans back
    (`sn_tilt`, negative = leaning forward), the centre hangs `drop` below the wrist."""
    fwd = J['fwd']
    up = Vector((0, 0, 1))
    left = up.cross(fwd)
    az, tilt = P.get('sn_az', 0.3), P.get('sn_tilt', 0.12)
    n = fwd * math.cos(az) + left * math.sin(az)
    n = (n + up * math.sin(tilt)).normalized()
    z = (up - n * up.dot(n)).normalized()
    y = -n
    x = y.cross(z)
    c = J['wrist_l'] + n * P.get('sn_out', 0.13) - up * P.get('sn_drop', 0.12) - left * 0.03 + Vector((0, 0, P.get('sh_dz', 0.0)))
    c.z = max(c.z, 0.66)
    return undead._rot_from_axes(x, y, z, c)


# ------------------------------------------------------------------------------------------------ poses

FEET0 = dict(fl_x=0.17, fl_f=0.10, fl_z=0.065, fl_yaw=0.12, fl_pitch=0.0, fr_x=-0.17, fr_f=-0.10, fr_z=0.065, fr_yaw=0.12, fr_pitch=0.0)


def wstance(**kw):
    p = Pose(ikf=1, lean=0.12, head_pitch=-0.10, bob=-0.05, curl_r=1.0, curl_l=1.0,
             gr_x=-0.28, gr_f=0.20, gr_z=1.10, gr_az=-0.05, gr_el=1.5, gr_roll=PI / 2, sp_off=1.1,
             wl_x=0.34, wl_f=0.30, wl_z=1.14, sn_az=0.3, sn_tilt=0.12, sh_dz=0.0, eo_l=0.7, ed_l=0.6, **FEET0)
    for k, v in kw.items():
        p[k] = v
    return p


def pose_idle(t):
    ph = (t / 0.75) % 1.0
    s, c = math.sin(2 * PI * ph), math.cos(2 * PI * ph)
    return wstance(lean=0.12 + 0.015 * s, bob=-0.05 + 0.01 * s, sway=0.008 * c, roll=0.02 * c, head_pitch=-0.1 + 0.025 * c,
                   head_yaw=0.1 * math.sin(2 * PI * ph + 0.8), twist=0.03 * s, gr_z=1.10 + 0.008 * s, wl_z=1.14 + 0.01 * s,
                   wl_f=0.30 + 0.008 * c, jaw=0.0)


DUTY = 0.6
STRIDE = 0.30


def foot_cycle(phi, A=None, duty=None, lift=0.15):
    phi %= 1.0
    A = STRIDE if A is None else A
    duty = DUTY if duty is None else duty
    ah = 0.065
    if phi < duty:
        s = phi / duty
        f = A - 2 * A * s
        th = 0.22 * (1 - smooth(s / 0.25)) - 0.42 * smooth((s - 0.78) / 0.22)
        z = ah + (0.05 * math.sin(th) if th > 0 else 0.19 * math.sin(-th))
    else:
        sw = (phi - duty) / (1 - duty)
        f = -A + 2 * A * smooth(sw)
        th = -0.42 * (1 - smooth(sw / 0.5)) + 0.22 * smooth((sw - 0.5) / 0.5)
        z = ah + lift * math.sin(PI * sw) ** 0.9 + (0.19 * math.sin(-th) if th < 0 else 0.0) * (1 - sw)
    return f, z, th


def pose_walk(t):
    ph = (t / (8 / 11.0)) % 1.0
    s, c = math.sin(2 * PI * ph), math.cos(2 * PI * ph)
    c2 = math.cos(4 * PI * ph)
    fl = foot_cycle(ph)
    fr = foot_cycle(ph + 0.5)
    return wstance(lean=0.15 + 0.012 * c2, bob=-0.09, sway=0.032 * s, roll=0.04 * s, twist=-0.1 * s, hip_twist=0.07 * s,
                   head_pitch=-0.12 - 0.015 * c2, head_yaw=-0.06 * s,
                   fl_x=0.15, fl_f=fl[0], fl_z=fl[1], fl_pitch=fl[2], fl_yaw=0.08,
                   fr_x=-0.15, fr_f=fr[0], fr_z=fr[1], fr_pitch=fr[2], fr_yaw=0.08,
                   gr_f=0.2 + 0.02 * s, gr_z=1.1 + 0.015 * c2, sp_off=1.05, wl_f=0.30 + 0.02 * s, wl_z=1.14 + 0.015 * c2)


CH_DUTY = 0.46
CH_STRIDE = 0.62


def pose_charge(t):
    ph = (t / (6 / 14.0)) % 1.0
    s, c = math.sin(2 * PI * ph), math.cos(2 * PI * ph)
    c2 = math.cos(4 * PI * ph)
    fl = foot_cycle(ph, CH_STRIDE, CH_DUTY, 0.24)
    fr = foot_cycle(ph + 0.5, CH_STRIDE, CH_DUTY, 0.24)
    return wstance(lean=0.42 + 0.03 * c2, bob=-0.2, sway=0.02 * s, roll=0.05 * s, twist=-0.18 * s, hip_twist=0.12 * s,
                   head_pitch=-0.5 - 0.03 * c2,
                   fl_x=0.15, fl_f=fl[0], fl_z=fl[1], fl_pitch=fl[2], fl_yaw=0.05,
                   fr_x=-0.15, fr_f=fr[0], fr_z=fr[1], fr_pitch=fr[2], fr_yaw=0.05,
                   gr_x=-0.30, gr_f=0.36 + 0.02 * s, gr_z=1.0 + 0.03 * c2, gr_az=-0.03, gr_el=0.12, sp_off=1.0,
                   wl_x=0.36, wl_f=0.44 + 0.02 * s, wl_z=1.0 + 0.03 * c2, sn_az=0.12, sn_tilt=-0.2, eo_l=0.5, ed_l=0.5)


def interp(frames, u):
    u = min(max(u, 0.0), len(frames) - 1.0)
    i = min(int(u), len(frames) - 2)
    return frames[i].mix(frames[i + 1], u - i)


FEET_T = dict(fl_x=0.19, fl_f=0.36, fl_yaw=0.15, fr_x=-0.2, fr_f=-0.24, fr_yaw=-0.25)
THRUST = [
    wstance(**FEET_T, lean=0.12, gr_x=-0.28, gr_f=0.20, gr_z=1.10, gr_el=1.5, sp_off=1.1),
    wstance(**FEET_T, lean=0.14, fwd=-0.02, gr_x=-0.28, gr_f=0.26, gr_z=1.16, gr_el=0.85, sp_off=1.0),
    wstance(**FEET_T, lean=0.12, fwd=-0.06, twist=-0.15, hip_twist=-0.08, gr_x=-0.30, gr_f=0.28, gr_z=1.22, gr_az=-0.05, gr_el=0.18, sp_off=0.9,
            wl_f=0.34),
    wstance(**FEET_T, lean=0.09, fwd=-0.10, twist=-0.28, hip_twist=-0.14, gr_x=-0.30, gr_f=0.14, gr_z=1.26, gr_az=-0.02, gr_el=0.10, sp_off=0.9,
            wl_f=0.38),
    wstance(**FEET_T, lean=0.06, fwd=-0.14, twist=-0.4, hip_twist=-0.2, gr_x=-0.28, gr_f=0.0, gr_z=1.28, gr_az=0.0, gr_el=0.06, sp_off=0.9,
            wl_f=0.42),
    wstance(**FEET_T, lean=0.04, fwd=-0.17, twist=-0.46, hip_twist=-0.24, head_pitch=-0.08, gr_x=-0.26, gr_f=-0.12, gr_z=1.30, gr_az=0.02,
            gr_el=0.05, sp_off=0.9, wl_f=0.46, wl_x=0.36),
    wstance(**dict(FEET_T, fr_f=-0.14), lean=0.32, fwd=0.30, bob=-0.12, twist=0.32, hip_twist=0.2, head_pitch=-0.3, gr_x=-0.18, gr_f=0.66, gr_z=1.22,
            gr_az=0.0, gr_el=0.02, sp_off=0.9, wl_f=0.34, wl_x=0.32),
    wstance(**dict(FEET_T, fr_f=-0.06), lean=0.26, fwd=0.24, bob=-0.1, twist=0.22, hip_twist=0.14, head_pitch=-0.24, gr_x=-0.2, gr_f=0.56, gr_z=1.2,
            gr_el=0.03, sp_off=0.95, wl_f=0.32),
    wstance(**dict(FEET_T, fr_f=0.0), lean=0.2, fwd=0.14, bob=-0.08, twist=0.1, hip_twist=0.07, gr_x=-0.24, gr_f=0.4, gr_z=1.18, gr_el=0.2, sp_off=1.0),
    wstance(**dict(FEET_T, fr_f=-0.1, fl_f=0.3), lean=0.14, fwd=0.04, gr_x=-0.27, gr_f=0.26, gr_z=1.14, gr_el=0.7, sp_off=1.05),
]
FEET_H = dict(fl_x=0.17, fl_f=0.10, fl_yaw=0.12, fr_x=-0.17, fr_f=-0.10, fr_yaw=0.12)
HIT = [
    wstance(**FEET_H, lean=0.06, fwd=-0.07, bob=-0.05, head_pitch=-0.3, roll=-0.03, wl_f=0.34, wl_z=1.2, gr_z=1.14),
    wstance(**FEET_H, lean=0.03, fwd=-0.12, bob=-0.04, head_pitch=-0.4, roll=-0.05, twist=0.08, wl_f=0.36, wl_z=1.24, wl_x=0.38, gr_z=1.18,
            gr_x=-0.32),
    wstance(**FEET_H, lean=0.1, fwd=-0.05, bob=-0.05, head_pitch=-0.18, roll=-0.02, wl_z=1.16),
]
FEET_D = dict(fl_x=0.17, fl_f=0.12, fl_yaw=0.12, fr_x=-0.17, fr_f=-0.1, fr_yaw=0.12)
DEATH = [
    wstance(**FEET_D, lean=-0.04, fwd=-0.16, bob=-0.05, head_pitch=-0.6, twist=0.15, roll=-0.06, soul=0.9, gr_z=1.2, gr_x=-0.34, wl_f=0.3, wl_z=1.25),
    wstance(**FEET_D, lean=0.28, fwd=-0.04, bob=-0.30, head_pitch=-0.1, twist=0.05, soul=0.6, gr_x=-0.32, gr_f=0.3, gr_z=0.9, gr_el=1.0, sp_off=1.1,
            wl_f=0.32, wl_z=0.95),
    wstance(**FEET_D, lean=0.55, fwd=0.14, bob=-0.55, head_pitch=0.2, soul=0.3, gr_x=-0.3, gr_f=0.4, gr_z=0.55, gr_el=0.7, sp_off=1.1, wl_f=0.4,
            wl_z=0.7, sn_tilt=-0.25, sn_drop=0.05),
]
DEATH_FPS = 12
TOPPLE = [0.0, 0.0, 0.0, 0.35, 0.85, 1.35, 1.5, 1.5, 1.5, 1.5]      # radians of the fall forward, per frame
PIVOT_Y = -0.34
FALL_TS = 1.0


def pose_at(name, t, fps):
    u = t * fps
    if name == 'idle':
        return pose_idle(t)
    if name == 'walk':
        return pose_walk(t)
    if name == 'charge':
        return pose_charge(t)
    if name == 'thrust':
        return interp(THRUST, u)
    if name == 'hit':
        return interp(HIT, u)
    if name == 'death':
        return interp(DEATH, u)
    raise KeyError(name)


# ------------------------------------------------------------------------------------------------ the figure

class Warden:
    def __init__(self, lod=1):
        self.fig = Undead('warden', s=S, lod=lod)
        self.fig.extra = dict(helm=build_helm(), cuirass=build_cuirass(), gorget=build_gorget(), fauld=build_fauld(),
                              pauldron=build_pauldron(), rerebrace=build_arm_armour(), couter=build_couter(), gauntlet=build_gauntlet(),
                              cuisse=build_cuisse(), greave=build_poleyn(), sabaton=build_sabaton(), tower=build_shield(),
                              spear=build_spear())

    def joints(self, P):
        return self.fig.solve(P, arms={'r': 'grip', 'l': 'wrist'})

    def parts(self, P, J=None):
        fig = self.fig
        J = J or self.joints(P)
        F = J['F']
        s = scale(fig.s)
        parts = [p for p in fig.pieces(J)]
        parts.append(('helm', 'helm', F['head'] @ scale(fig.s * undead.HEAD_K)))
        parts.append(('cuirass', 'cuirass', F['chest'] @ s))
        parts.append(('gorget', 'gorget', F['neck'] @ s))
        parts.append(('fauld', 'fauld', F['pelvis'] @ s))
        b = fig.base
        for side, sx in (('l', 1.0), ('r', -1.0)):
            mir = I4 if sx > 0 else MIRROR
            parts.append(('pauldron_' + side, 'pauldron', F['chest'] @ s @ trans(sx * b['sh_w'], 0, b['chest_h'] - 0.03) @ mir))
            ed = -J['elbowdir_' + side]
            parts.append(('rerebrace_' + side, 'rerebrace', frame_along(J['sh_' + side], J['elbow_' + side], ed) @ s @ mir))
            parts.append(('couter_' + side, 'couter', frame_along(J['elbow_' + side], J['wrist_' + side], ed) @ s @ mir))
            parts.append(('gauntlet_' + side, 'gauntlet', J['hand_' + side] @ s @ mir))
            kd = J['kneedir_' + side]
            parts.append(('cuisse_' + side, 'cuisse', frame_along(J['hip_' + side], J['knee_' + side], kd) @ s @ mir))
            parts.append(('greave_' + side, 'greave', frame_along(J['knee_' + side], J['ankle_' + side], kd) @ s @ mir))
            parts.append(('sabaton_' + side, 'sabaton', J['foot_' + side] @ s @ mir))
        parts.append(('tower', 'tower', tower_matrix(J, J['P'])))
        parts.append(('spear', 'spear', J['wpn_r'] @ trans(0, 0, -P.get('sp_off', 1.1))))
        return J, parts

    # -- cape
    def cape_setup(self, P0):
        J = self.joints(P0)
        F = J['F']
        cl = Cloth(gravity=14.0, drag=2.5, damping=0.006, iterations=12)
        self.cl = cl
        self.ncol, self.nrow = 9, 11
        rng = np.random.RandomState(4)
        self.len_k = 0.8 + 0.2 * rng.rand(self.ncol)
        self.len_k[::3] *= 0.84
        rows = []
        for r in range(self.nrow):
            row = []
            for j in range(self.ncol):
                x = (j / (self.ncol - 1) - 0.5) * (0.32 + 0.012 * r)
                y = 0.178 + 0.006 * r
                z = 0.275 - 0.12 * r * self.len_k[j]
                w = F['chest'] @ Vector((x * S, y * S, z * S))
                row.append((w.x, w.y, w.z))
            rows.append(row)
        self.G = cl.grid(rows, pinned_row=True, stiff=0.92, shear=0.4, bend=0.35, r=0.03)

    def pin_pos(self, F, j):
        x = (j / (self.ncol - 1) - 0.5) * 0.32
        w = F['chest'] @ Vector((x * S, 0.178 * S, 0.275 * S))
        return (w.x, w.y, w.z)

    def cape_cols(self, J):
        F = J['F']
        cols = undead.body_colliders(self.fig, J, torso=False, head=False, arms=False)
        cols = [(a, b, r * 1.55) for a, b, r in cols]
        c0, c1, c2 = F['pelvis'] @ Vector((0, 0, 0.0)), F['chest'] @ Vector((0, 0.0, 0.0)), F['chest'] @ Vector((0, 0, 0.30 * S))
        cols.append((tuple(c0), tuple(c1), CAPE_R_PELVIS))
        cols.append((tuple(c1), tuple(c2), CAPE_R_CHEST))
        return cols

    def cape_bake(self, pose_fn, times, period=None, air=(0, 0, 0), drag=2.5):
        self.cl.drag = drag
        def drive(t):
            P = pose_fn(t)
            J = self.joints(P)
            F = J['F']
            return {self.G[0][j]: self.pin_pos(F, j) for j in range(self.ncol)}, self.cape_cols(J), air
        kw = dict(period=period, loops=3) if period else dict(settle=SETTLE)
        return self.cl.bake(drive, times, **kw)

    def cape_mesh(self, X):
        m = Mesh('cape')
        cloth_mesh(m, self.G, X, 'wrd_cape', thick=0.01, smooth=50)
        return m


def merge(m, extra):
    m.add(extra)
    extra.free()


def topple(parts, theta):
    """Rotate every piece rigidly about the line across the toes (the body falls forward)."""
    if theta == 0.0:
        return list(parts)
    T = trans(0, PIVOT_Y, 0) @ rotx(theta) @ trans(0, -PIVOT_Y, 0)
    lift = trans(0, 0, 0.16 * math.sin(min(theta, 1.5)))
    return [(n, k, lift @ T @ M) for n, k, M in parts]


def info_extra():
    z = Vector((0, 0, 1))
    return dict(helm=(Vector((0, 0.0, 0.05)), 'long', Vector((0, -1, 0)), 0.1),
                cuirass=(Vector((0, 0, 0.15)), 'long', Vector((0, 0, 1)), 0.15),
                gorget=(Vector((0, 0, 0.04)), 'long', Vector((0, 0, 1)), 0.07),
                fauld=(Vector((0, 0, 0.03)), 'long', Vector((1, 0, 0)), 0.12),
                pauldron=(Vector((0.02, 0, 0.0)), 'long', Vector((1, 0, 0)), 0.07),
                rerebrace=(Vector((0, 0, -0.17)), 'long', Vector((0, 0, -1)), 0.05),
                couter=(Vector((0, 0.02, -0.1)), 'long', Vector((0, 0, -1)), 0.05),
                gauntlet=(Vector((0, 0, -0.08)), 'long', Vector((0, 0, -1)), 0.05),
                cuisse=(Vector((0, -0.02, -0.22)), 'long', Vector((0, 0, -1)), 0.07),
                greave=(Vector((0, 0, -0.22)), 'long', Vector((0, 0, -1)), 0.055),
                sabaton=(Vector((0, -0.06, -0.03)), 'long', Vector((0, -1, 0)), 0.05),
                tower=(Vector((0, 0, 0)), 'flat', Vector((0, -1, 0)), 0.03),
                spear=(Vector((0, 0, 1.3)), 'long', Vector((0, 0, 1)), 0.03))


def death_parts(T, i, cache):
    if 'p2' not in cache:
        P2 = DEATH[2]
        J2, parts2 = T.parts(P2)
        cache['p2'] = (P2, J2, parts2)
    P2, J2, parts2 = cache['p2']
    th = TOPPLE[i]
    if i < 6:
        return J2, topple(parts2, th)
    lying = topple(parts2, TOPPLE[5])
    t = (i - 5) / float(DEATH_FPS) * 1.4
    info = undead.bone_info(T.fig)
    return J2, undead.collapse(lying, t, info, info_extra(), seed=11, spread=1.2, g=26.0, shrink=1.0, hop=0.12, drop=('glow', 'eye_l', 'eye_r'))


def build(ctx):
    undead.image('wrd_crescent', crescent_image())
    T = Warden()
    T.cape_setup(pose_idle(0.0))

    def make(name, n, fps, loop, air=(0.0, 0.0, 0.0), drag=2.5):
        cache = {}

        def prep():
            if 'sims' not in cache:
                times = [i / fps for i in range(n)]
                cache['sims'] = T.cape_bake(lambda t: pose_at(name, t, fps), times, period=(n / fps) if loop else None, air=air, drag=drag)

        def frame(i):
            prep()
            J, parts = T.parts(pose_at(name, i / fps, fps))
            m = Mesh('w')
            T.fig.assemble(m, parts)
            merge(m, T.cape_mesh(cache['sims'][i]))
            return m
        return frame

    def make_death():
        cache = {}

        def prep():
            if 'sims' in cache:
                return
            death_parts(T, 3, cache)
            P2, J2, parts2 = cache['p2']
            F2 = J2['F']
            M0 = [p[2] for p in parts2 if p[0] == 'cuirass'][0]
            inv = M0.inverted()
            loc = {T.G[0][j]: inv @ Vector(T.pin_pos(F2, j)) for j in range(T.ncol)}
            t2 = 2.0 / DEATH_FPS

            def drive(t):
                if t <= t2 + 1e-9:
                    P = pose_at('death', t, DEATH_FPS)
                    J = T.joints(P)
                    return {T.G[0][j]: T.pin_pos(J['F'], j) for j in range(T.ncol)}, T.cape_cols(J), (0, 0, 0)
                u = t * DEATH_FPS
                k = min(int(u), 9)
                a, b = TOPPLE[k], TOPPLE[min(k + 1, 9)]
                th = a + (b - a) * (u - k)
                parts = topple(parts2, th)
                if u > 5.0:
                    lying = topple(parts2, TOPPLE[5])
                    parts = undead.collapse(lying, (u - 5) / DEATH_FPS * 1.4, undead.bone_info(T.fig), info_extra(), seed=11, spread=1.2,
                                            g=26.0, shrink=1.0, hop=0.12)
                Mp = [p[2] for p in parts if p[0] == 'cuirass'][0]
                Mf = [p[2] for p in parts if p[0] == 'fauld'][0]
                cols = [(tuple(Mf @ Vector((0, 0, 0.0))), tuple(Mp @ Vector((0, 0, 0.0))), CAPE_R_PELVIS),
                        (tuple(Mp @ Vector((0, 0, 0.0))), tuple(Mp @ Vector((0, 0, 0.30))), CAPE_R_CHEST)]
                return {kk: tuple(Mp @ v) for kk, v in loc.items()}, cols, (0, 0, 0)
            T.cl.drag = 4.0
            cache['sims'] = T.cl.bake(drive, [i / DEATH_FPS for i in range(10)], settle=SETTLE)

        def frame(i):
            prep()
            m = Mesh('w')
            if i < 3:
                J, parts = T.parts(DEATH[i])
            else:
                J, parts = death_parts(T, i, cache)
            T.fig.assemble(m, parts)
            merge(m, T.cape_mesh(cache['sims'][i]))
            return m
        return frame

    undead.anim(ctx, 'warden_idle', 6, make('idle', 6, 8, True), dirs=8, fps=8, loop=True)
    undead.anim(ctx, 'warden_walk', 8, make('walk', 8, 11, True, (0.0, WALK_SPEED, 0.0)), dirs=8, fps=11, loop=True)
    undead.anim(ctx, 'warden_thrust', 10, make('thrust', 10, 14, False, drag=5.5), dirs=8, fps=14, loop=False)
    undead.anim(ctx, 'warden_charge', 6, make('charge', 6, 14, True, (0.0, CHARGE_AIR, 0.0)), dirs=8, fps=14, loop=True)
    undead.anim(ctx, 'warden_hit', 3, make('hit', 3, 16, False, drag=4.0), dirs=8, fps=16, loop=False)
    undead.anim(ctx, 'warden_death', 10, make_death(), dirs=8, fps=12, loop=False)

    # ---- anchors and values the game needs (model facing south: [x east, y south, z up] in metres)
    J6 = T.joints(THRUST[6])
    tip = J6['wpn_r'] @ Vector((0.0, 0.0, 2.6 - THRUST[6]['sp_off']))
    ctx.anchor('tip', 'warden_thrust_6', (tip.x, tip.y, tip.z))
    ctx.anchor('head', 'warden', (0.0, -0.05, 2.0))
    ctx.anchor('chest', 'warden', (0.0, 0.0, 1.4))
    ctx.value('size', 'warden', dict(height=2.0, radius=0.5, spear=2.6))
    ctx.value('speed', 'warden_walk', dict(authored=round(2 * STRIDE / (DUTY * 8 / 11.0), 2), game=WALK_SPEED))
    ctx.value('speed', 'warden_charge', dict(authored=round(2 * CH_STRIDE / (CH_DUTY * 6 / 14.0), 2), game=CHARGE_AIR))

    if ctx.want('warden'):
        TP = Warden(lod=2)
        P = Pose(THRUST[4])
        undead.turn_feet(P, -0.4)
        P['head_yaw'] = 0.15
        TP.cape_setup(P)
        sim = TP.cape_bake(lambda t: P, [0.0])[0]
        J, parts = TP.parts(P)
        m = Mesh('warden')
        TP.fig.assemble(m, parts)
        merge(m, TP.cape_mesh(sim))
        ctx.portrait('warden', [m], ppm=130, elev=22.0)
