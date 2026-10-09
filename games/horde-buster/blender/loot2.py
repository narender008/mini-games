"""Loot 2 (guns lane): the Tesla Gun and Saw Launcher pickups, and the saw blades their shots fly as.

The two guns are drawn like the pickups in loot.py: upright in the XZ plane facing the camera, elev=15, tilted 20 degrees, pivot =
centre of the icon, about 1.05 m long. The blades are drawn from straight above (elev=90, pivot = centre of the disc) so the game can
spin them: it rotates the sprite every frame. They are rendered at twice the usual pixels per metre because the game draws them
larger than their metre size says (the hit radius, not the art, sets the size).

Materials are keyed `l2_*`. Glow: `emit` below 0.5 on trim and icons (ink survives), above 0.5 only on hot spots (arcs, edges).

Frames: weapon_tesla, weapon_saw, sawblade (0.55 m), sawblade_big (1 m, the Bloodmill's).
"""
import math

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from loot import place, ring_y, disc_y, hazard, rot2, ELEV
from props import one

PI = math.pi
TAU = 2 * PI


def _materials():
    d = mats.define
    # copper and brass: the Tesla Gun
    d('l2_copper', base='#d9772e', base2='#f4a65e', pattern='noise', pscale=4, pamt=0.45, bevel=0.012, seed=301)
    d('l2_copper_hi', base='#ffbf80', bevel=0.01)
    d('l2_copper_dk', base='#8d4719', base2='#6d3511', pattern='noise', pscale=6, pamt=0.5, bevel=0.01, seed=302)
    d('l2_brass', base='#e3a82c', base2='#ffd978', pattern='noise', pscale=3, pamt=0.35, bevel=0.01, seed=303)
    # steel and rubber, shared by both guns
    d('l2_steel', base='#c9d1dd', base2='#98a3b4', pattern='noise', pscale=5, pamt=0.45, bevel=0.01, seed=304)
    d('l2_steel_dk', base='#4d5568', base2='#363c4c', pattern='noise', pscale=6, pamt=0.5, bevel=0.01, seed=305)
    d('l2_steel_lt', base='#e7edf5', bevel=0.008)
    d('l2_black', base='#1b1c22', bevel=0.008)
    d('l2_bsteel', base='#8793a7', base2='#667388', pattern='noise', pscale=6, pamt=0.5, bevel=0.01, seed=313)   # blades: a darker steel
    d('l2_bsteel_lt', base='#b2bdcd', base2='#97a3b6', pattern='noise', pscale=5, pamt=0.4, bevel=0.008, seed=314)
    d('l2_rubber', base='#2d2e37', base2='#3d3f4b', pattern='noise', pscale=7, pamt=0.5, bevel=0.015, seed=306)
    # electric blue: coils, cell, orb, arcs
    d('l2_coil', base='#35c8ff', base2='#5be0ff', pattern='noise', pscale=5, pamt=0.4, emit=0.44, bevel=0.012, seed=307)
    d('l2_coil_hi', base='#bdf4ff', emit=0.48, bevel=0.01)
    d('l2_coil_dk', base='#0f78c4', emit=0.3, bevel=0.01)
    d('l2_arc', base='#f0ffff', emit=0.66, bevel=0.01)
    d('l2_arc_blue', base='#7fe6ff', emit=0.62, bevel=0.01)
    d('l2_orb', base='#f6feff', emit=0.88, bevel=0.01)
    # the Saw Launcher: yellow and black
    d('l2_yellow', base='#ffcc1a', base2='#ffb400', pattern='noise', pscale=3, pamt=0.3, bevel=0.016, seed=308)
    d('l2_yellow_hi', base='#ffe46a', bevel=0.012)
    d('l2_yellow_dk', base='#c98a00', bevel=0.012)
    # blood on the blades
    d('l2_blood', base='#b3101a', base2='#7a0a12', pattern='noise', pscale=8, pamt=0.5, bevel=0.006, seed=309)
    d('l2_blood_dk', base='#5a070c', bevel=0.006)
    # the Bloodmill blade: dark iron with a glowing red-hot edge
    d('l2_iron', base='#5b6270', base2='#3c424f', pattern='noise', pscale=7, pamt=0.55, bevel=0.012, seed=310)
    d('l2_iron_lt', base='#8d95a6', base2='#6b7384', pattern='noise', pscale=6, pamt=0.5, bevel=0.012, seed=311)
    d('l2_hot', base='#ff4a14', base2='#ff7a1c', pattern='noise', pscale=6, pamt=0.5, emit=0.62, bevel=0.008, seed=312)
    d('l2_hot_y', base='#ffd23a', emit=0.7, bevel=0.006)


_materials()


# ------------------------------------------------------------------------------------------------ helpers

def ribbon(pts, w, taper=True):
    """A polygon [(x, z)] hugging a polyline with half-width w (narrowing toward the end when taper): a flat lightning bolt."""
    left, right = [], []
    n = len(pts)
    for i, (x, z) in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, tz) or 1.0
        nx, nz = -tz / ln, tx / ln
        hw = w * (1.0 - 0.85 * i / (n - 1)) if taper else w
        left.append((x + nx * hw, z + nz * hw))
        right.append((x - nx * hw, z - nz * hw))
    return left + right[::-1]


def bolt_path(o, ang, L, kinks, amp, seed):
    """A zigzag polyline from o heading `ang` (radians, in the XZ plane) for length L with `kinks` bends."""
    import random
    r = random.Random(seed)
    c, s = math.cos(ang), math.sin(ang)
    pts = [tuple(o)]
    for i in range(1, kinks + 1):
        t = i / kinks
        off = (r.uniform(-1, 1) if i < kinks else 0.0) * amp
        pts.append((o[0] + c * L * t - s * off, o[1] + s * L * t + c * off))
    return pts


def torus_x(m, x, r_in, r_out, half, mat, seg=28):
    """A ring round the barrel (the X axis) centred at x: a rounded band from radius r_in out to r_out, `half` wide each way."""
    k = half * 0.55
    prof = [(-half, r_in), (-half, r_out - k), (-k, r_out), (k, r_out), (half, r_out - k), (half, r_in)]
    m.lathe(prof, mat, mx=trans(x, 0.0, 0.0) @ roty(PI / 2), seg=seg, smooth=50.0, cap=False)


def annulus_pts(r0, r1, a0, a1, n=8):
    """Outline of a ring sector between radii r0 and r1 from angle a0 to a1, as [(x, y)] (convex sectors only up to a quarter turn+)."""
    outer = [(r1 * math.cos(a0 + (a1 - a0) * i / n), r1 * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
    inner = [(r0 * math.cos(a0 + (a1 - a0) * i / n), r0 * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n, -1, -1)]
    return outer + inner


def flat_prism(m, pts, z0, z1, mat, bevel=0.004, mx=None):
    """A polygon [(x, y)] lying flat in the XY plane, from z0 up to z1 (seen from above)."""
    # prism() works in the XZ plane and extrudes along Y; rotx(pi/2) lays that plane flat (z -> -y, y -> z)
    p = [(x, -y) for x, y in pts]
    M = rotx(PI / 2) if mx is None else mx @ rotx(PI / 2)
    m.prism(p, z0, z1, mat, mx=M, bevel=bevel)


def saw_outline(n, r_root, r_tip, hook=0.7, phase=0.0, rot=0.0):
    """The sawtooth outline of a blade, [(x, y)]: for each tooth a long ramp out to the tip and a short drop back to the root."""
    out = []
    d = TAU / n
    for i in range(n):
        a0 = phase + i * d
        out.append((r_root * math.cos(a0), r_root * math.sin(a0)))
        out.append((r_tip * math.cos(a0 + d * hook), r_tip * math.sin(a0 + d * hook)))
    if rot:
        c, s = math.cos(rot), math.sin(rot)
        out = [(x * c - y * s, x * s + y * c) for x, y in out]
    return out


# ------------------------------------------------------------------------------------------------ Tesla Gun

def tesla():
    """A copper coil gun: a stack of glowing blue coil rings that shrink toward the muzzle, a white-blue orb at the tip with arcs
    snapping off it, a glass power cell in a copper body, a black grip and a cable."""
    m = Mesh('tesla')
    CU, CH, CD = 'l2_copper', 'l2_copper_hi', 'l2_copper_dk'
    SD, K = 'l2_steel_dk', 'l2_black'
    # the rod through the coils
    m.cyl((-0.12, 0, 0.0), (0.5, 0, 0.0), 0.075, 0.055, mat=SD, seg=14)
    # rear body: a fat copper drum with a glass power cell on the side
    m.cyl((-0.42, 0, 0.0), (-0.1, 0, 0.0), 0.19, 0.19, mat=CU, seg=24)
    m.ball((-0.42, 0, 0.0), (0.06, 0.19, 0.19), CU, seg=24, rings=8)
    m.cyl((-0.32, 0, 0.0), (-0.27, 0, 0.0), 0.2, 0.2, mat=CD, seg=24)                              # bands round the drum
    m.cyl((-0.17, 0, 0.0), (-0.12, 0, 0.0), 0.2, 0.2, mat=CD, seg=24)
    m.ball((-0.22, -0.165, 0.0), (0.095, 0.035, 0.105), 'l2_coil_hi', seg=14, rings=8)              # the cell
    m.ball((-0.22, -0.19, 0.0), (0.06, 0.016, 0.07), 'l2_orb', seg=10, rings=6)
    m.ball((-0.36, -0.12, 0.13), (0.06, 0.06, 0.045), CH, seg=10, rings=6)                          # a copper highlight
    m.cyl((-0.22, 0, 0.18), (-0.22, 0, 0.26), 0.035, 0.035, mat='l2_brass', seg=10)                 # filler cap
    # the coil stack: blue rings, shrinking to the muzzle, copper windings between them
    rings = ((-0.03, 0.27), (0.1, 0.235), (0.22, 0.2), (0.33, 0.165), (0.43, 0.13))
    for i, (x, r) in enumerate(rings):
        torus_x(m, x, 0.07, r, 0.05, 'l2_coil' if i % 2 == 0 else 'l2_coil_dk')
        m.ball((x - 0.01, -r * 0.5, r * 0.78), (0.026, 0.012, 0.026), 'l2_coil_hi', seg=8, rings=5)         # a glint on the ring
        if i < len(rings) - 1:
            x2, r2 = rings[i + 1]
            xm = (x + x2) / 2
            m.cyl((xm - 0.022, 0, 0), (xm + 0.022, 0, 0), min(r, r2) * 0.8, min(r, r2) * 0.8, mat=CU, seg=24)
    # muzzle: a copper nose and the electrode orb
    m.cyl((0.47, 0, 0.0), (0.57, 0, 0.0), 0.085, 0.04, mat=CU, seg=16)
    m.cyl((0.56, 0, 0.0), (0.62, 0, 0.0), 0.045, 0.034, mat='l2_brass', seg=12)
    m.ball((0.67, 0, 0.0), (0.085, 0.085, 0.085), 'l2_orb', seg=16, rings=10)
    # arcs snapping off the orb: flat jagged ribbons, blue with a white core
    for (ang, L, w, seed, dy) in ((62, 0.3, 0.022, 1, 0.0), (-48, 0.28, 0.022, 7, 0.01), (14, 0.36, 0.026, 3, -0.01), (-12, 0.24, 0.018, 5, 0.02)):
        pts = bolt_path((0.7, 0.0), math.radians(ang), L, 5, 0.07, seed)
        m.prism(ribbon(pts, w * 1.7), -0.03 + dy, 0.03 + dy, 'l2_arc_blue', bevel=0.008)
        m.prism(ribbon(pts, w * 0.75), -0.045 + dy, 0.0 + dy, 'l2_arc', bevel=0.005)
    # grip and trigger guard, a cable looping from the drum to the first coil
    m.box(-0.055, 0.055, -0.07, 0.07, -0.34, 0.0, 'l2_rubber', mx=trans(-0.22, 0, -0.14) @ roty(0.22), bevel=0.02)
    m.box(-0.06, 0.06, -0.075, 0.075, -0.07, -0.02, K, mx=trans(-0.22, 0, -0.14) @ roty(0.22), bevel=0.01)
    m.tube([(-0.12, 0, -0.17), (-0.04, 0, -0.22), (0.04, 0, -0.2), (0.1, 0, -0.14)], 0.02, K, seg=6)
    m.transform(scale(0.9))                                                                              # about the size of the other guns
    place(m, 20.0, yaw=0.0, roll=0.0)
    return m


# ------------------------------------------------------------------------------------------------ Saw Launcher

def blade_face(m, c, r, n, mat_body, mat_tip, teeth_blood=(0, 3, 4, 8, 9, 12)):
    """A saw blade standing in the XZ plane (face toward -Y) centred at c: sawtooth rim, a bright face, dark slots, a hub, blood."""
    cx, cz = c
    out = saw_outline(n, r * 0.76, r, hook=0.7)
    pts = [(cx + x, cz + z) for x, z in out]
    m.prism(pts, -0.02, 0.02, mat_body, bevel=0.006)
    ring_y(m, (cx, 0.0, cz), r * 0.3, r * 0.74, 0.027, 0.019, 'l2_steel_lt', seg=28)                    # bright face
    for k in range(5):                                                                                     # dark slots
        a0 = k * TAU / 5 + 0.25
        sector = annulus_pts(r * 0.42, r * 0.62, a0, a0 + 0.62, n=5)
        m.prism([(cx + x, cz + z) for x, z in sector], -0.032, -0.02, 'l2_steel_dk', bevel=0.004)
    disc_y(m, (cx, 0.0, cz), r * 0.26, 0.04, 0.02, 'l2_steel_dk', seg=18)                                 # hub
    disc_y(m, (cx, 0.0, cz), r * 0.14, 0.06, 0.04, 'l2_brass', seg=14)
    disc_y(m, (cx, 0.0, cz), r * 0.05, 0.068, 0.06, 'l2_black', seg=8)
    # teeth that have bitten: a red tip, and a smear of blood across the face
    d = TAU / n
    for i in teeth_blood:
        a0 = i * d
        tip = [(r * 0.9 * math.cos(a0 + d * 0.4), r * 0.9 * math.sin(a0 + d * 0.4)),
               (r * math.cos(a0 + d * 0.7), r * math.sin(a0 + d * 0.7)),
               (r * 0.86 * math.cos(a0 + d * 0.98), r * 0.86 * math.sin(a0 + d * 0.98))]
        m.prism([(cx + x, cz + z) for x, z in tip], -0.03, 0.0, mat_tip, bevel=0.004)
    smear = [(-0.5, 0.2), (-0.3, 0.36), (-0.1, 0.3), (-0.12, 0.12), (-0.3, 0.02)]
    m.prism([(cx + x * r, cz + z * r) for x, z in smear], -0.036, -0.026, 'l2_blood', bevel=0.004)


def saw():
    """A chunky yellow-and-black launcher: a boxy body with a hazard band, a fuel tank on top, a bloody round blade loaded in a
    half-ring guard at the front, a rubber grip and shoulder pad."""
    m = Mesh('saw')
    Y, YH, YD = 'l2_yellow', 'l2_yellow_hi', 'l2_yellow_dk'
    SD, K = 'l2_steel_dk', 'l2_black'
    # body, with a lighter top plate
    m.box(-0.5, 0.1, -0.15, 0.15, -0.17, 0.15, Y, bevel=0.04)
    m.box(-0.46, 0.06, -0.14, 0.14, 0.14, 0.17, YH, bevel=0.012)
    hazard(m, -0.4, -0.04, -0.14, 0.1, -0.158, n_w=0.07, ya='l2_yellow_hi', kb='l2_black')                 # hazard band on the side
    for x in (-0.48, 0.08):                                                                              # steel straps
        m.box(x - 0.025, x + 0.025, -0.16, 0.16, -0.18, 0.17, SD, bevel=0.012)
    # shoulder pad
    m.box(-0.6, -0.5, -0.16, 0.16, -0.2, 0.19, 'l2_rubber', bevel=0.03)
    # a fuel tank on top, along the barrel, with a brass cap and a yellow band
    m.cyl((-0.38, 0, 0.27), (0.0, 0, 0.27), 0.115, 0.115, mat='l2_steel_dk', seg=22)
    m.ball((-0.38, 0, 0.27), (0.05, 0.115, 0.115), 'l2_steel_dk', seg=16, rings=6)
    m.ball((0.0, 0, 0.27), (0.05, 0.115, 0.115), 'l2_steel_dk', seg=16, rings=6)
    m.ball((-0.2, -0.085, 0.31), (0.12, 0.03, 0.03), 'l2_steel', seg=10, rings=5)                          # a highlight along the tank
    m.cyl((-0.25, 0, 0.27), (-0.19, 0, 0.27), 0.122, 0.122, mat=YD, seg=22)
    m.cyl((-0.12, 0, 0.27), (-0.06, 0, 0.27), 0.122, 0.122, mat=YD, seg=22)
    m.cyl((-0.18, 0, 0.375), (-0.18, 0, 0.42), 0.03, 0.03, mat='l2_brass', seg=10)
    m.box(-0.35, -0.03, -0.04, 0.04, 0.15, 0.2, SD, bevel=0.01)                                           # tank cradle
    # the blade, standing in the guard at the front: a half ring round the top, a plate behind it, a bolt through the hub
    c = (0.32, -0.02)
    m.box(0.1, 0.4, 0.05, 0.1, -0.12, 0.14, YD, bevel=0.012)                                              # the plate behind the blade
    blade_face(m, c, 0.33, 14, 'l2_steel', 'l2_blood')
    sector = annulus_pts(0.355, 0.415, 0.0, PI, n=14)
    gp = [(c[0] + x, c[1] + z) for x, z in sector]
    m.prism(gp, -0.085, -0.05, Y, bevel=0.012)                                                            # guard, near side
    m.prism(gp, 0.05, 0.085, Y, bevel=0.012)
    m.prism([(c[0] + x, c[1] + z) for x, z in annulus_pts(0.395, 0.415, 0.0, PI, n=14)], -0.085, 0.085, YD, bevel=0.008)
    # grip, trigger, forehand grip
    m.box(-0.055, 0.055, -0.07, 0.07, -0.32, 0.0, 'l2_rubber', mx=trans(-0.2, 0, -0.17) @ roty(0.22), bevel=0.02)
    m.tube([(-0.28, 0, -0.17), (-0.3, 0, -0.26), (-0.23, 0, -0.29), (-0.17, 0, -0.2)], 0.02, SD, seg=6)
    m.box(0.0, 0.1, -0.055, 0.055, -0.26, -0.17, SD, bevel=0.01)
    m.transform(scale(0.88))
    place(m, 20.0, yaw=0.0, roll=0.0)
    return m


# ------------------------------------------------------------------------------------------------ the blades (seen from above)

def sawblade():
    """A 0.55 m circular saw blade from above: sawtooth rim, a bright face with five dark slots, a bolted hub, and blood on the
    teeth and in a smear, so a spinning blade shows its turn."""
    m = Mesh('sawblade')
    R = 0.275
    flat_prism(m, saw_outline(14, R * 0.77, R, hook=0.7), 0.0, 0.03, 'l2_bsteel', bevel=0.006)
    m.lathe([(0.03, 0.07), (0.03, R * 0.76), (0.036, R * 0.74), (0.036, 0.07)], 'l2_bsteel_lt', seg=30, smooth=50.0, cap=False)
    for k in range(5):
        a0 = k * TAU / 5 + 0.3
        flat_prism(m, annulus_pts(0.105, 0.17, a0, a0 + 0.62, n=5), 0.034, 0.042, 'l2_steel_dk', bevel=0.003)
    # the hub: a collar, a brass washer and a bolt
    m.cyl((0, 0, 0.03), (0, 0, 0.075), 0.075, 0.07, mat='l2_steel_dk', seg=16)
    m.cyl((0, 0, 0.074), (0, 0, 0.09), 0.045, 0.045, mat='l2_brass', seg=12)
    m.cyl((0, 0, 0.09), (0, 0, 0.1), 0.02, 0.02, mat='l2_black', seg=6)
    # blood: red tips on some teeth, a smear on the face
    d = TAU / 14
    for i in (1, 4, 5, 9, 12):
        a0 = i * d
        tip = [(R * 0.9 * math.cos(a0 + d * 0.4), R * 0.9 * math.sin(a0 + d * 0.4)),
               (R * math.cos(a0 + d * 0.7), R * math.sin(a0 + d * 0.7)),
               (R * 0.86 * math.cos(a0 + d * 0.98), R * 0.86 * math.sin(a0 + d * 0.98))]
        flat_prism(m, tip, 0.028, 0.038, 'l2_blood', bevel=0.003)
    smear = [(-0.17, 0.02), (-0.12, 0.1), (-0.03, 0.12), (-0.02, 0.05), (-0.09, -0.01)]
    flat_prism(m, smear, 0.038, 0.046, 'l2_blood', bevel=0.003)
    return m


def sawblade_big():
    """The Bloodmill's 1 m blade from above: nine hooked teeth, dark iron with spiral cut-outs, a spiked hub, blood, and a red-hot edge."""
    m = Mesh('sawblade_big')
    R = 0.5
    n = 9
    flat_prism(m, saw_outline(n, R * 0.74, R, hook=0.72), 0.0, 0.05, 'l2_iron', bevel=0.01)
    # the red-hot edge: the cutting ramp of every tooth glows orange, the tips yellow-white
    d = TAU / n
    for i in range(n):
        a0 = i * d
        edge = [(R * 0.76 * math.cos(a0 + d * 0.02), R * 0.76 * math.sin(a0 + d * 0.02)),
                (R * math.cos(a0 + d * 0.72), R * math.sin(a0 + d * 0.72)),
                (R * 0.86 * math.cos(a0 + d * 0.74), R * 0.86 * math.sin(a0 + d * 0.74)),
                (R * 0.8 * math.cos(a0 + d * 0.16), R * 0.8 * math.sin(a0 + d * 0.16))]
        flat_prism(m, edge, 0.046, 0.06, 'l2_hot', bevel=0.004)
        tip = [(R * 0.93 * math.cos(a0 + d * 0.62), R * 0.93 * math.sin(a0 + d * 0.62)),
               (R * math.cos(a0 + d * 0.72), R * math.sin(a0 + d * 0.72)),
               (R * 0.9 * math.cos(a0 + d * 0.76), R * 0.9 * math.sin(a0 + d * 0.76))]
        flat_prism(m, tip, 0.056, 0.066, 'l2_hot_y', bevel=0.002)
    # a lighter ring, then six spiral cut-outs
    m.lathe([(0.05, 0.14), (0.05, R * 0.72), (0.058, R * 0.7), (0.058, 0.14)], 'l2_iron_lt', seg=36, smooth=50.0, cap=False)
    for k in range(6):
        a0 = k * TAU / 6 + 0.2
        flat_prism(m, annulus_pts(0.2, 0.31, a0, a0 + 0.62, n=6), 0.054, 0.066, 'l2_black', bevel=0.003)
        flat_prism(m, annulus_pts(0.2, 0.235, a0 + 0.03, a0 + 0.58, n=6), 0.064, 0.07, 'l2_hot', bevel=0.002)
    # hub: a collar with four bolts and a spike
    m.cyl((0, 0, 0.05), (0, 0, 0.13), 0.13, 0.11, mat='l2_iron', seg=20)
    for k in range(4):
        a = k * PI / 2 + 0.4
        m.cyl((0.09 * math.cos(a), 0.09 * math.sin(a), 0.125), (0.09 * math.cos(a), 0.09 * math.sin(a), 0.15), 0.025, 0.02, mat='l2_steel', seg=8)
    m.cyl((0, 0, 0.13), (0, 0, 0.21), 0.06, 0.0, mat='l2_steel', seg=12)
    # blood: dark smears and spatter, and a red tooth or two
    flat_prism(m, [(-0.08, 0.2), (-0.02, 0.3), (0.1, 0.28), (0.12, 0.2), (0.04, 0.17)], 0.07, 0.078, 'l2_blood', bevel=0.004)
    flat_prism(m, [(0.2, -0.28), (0.3, -0.34), (0.36, -0.22), (0.26, -0.2)], 0.07, 0.076, 'l2_blood', bevel=0.004)
    flat_prism(m, [(-0.25, -0.2), (-0.15, -0.3), (-0.1, -0.2)], 0.074, 0.08, 'l2_blood_dk', bevel=0.003)
    return m


# ------------------------------------------------------------------------------------------------ frames

def build(ctx):
    kw = dict(elev=ELEV)
    one(ctx, 'weapon_tesla', tesla, **kw)
    one(ctx, 'weapon_saw', saw, **kw)
    # from straight above, at twice the usual pixels per metre (the game spins and enlarges them)
    one(ctx, 'sawblade', sawblade, ppm=2 * bl.PPM, elev=90.0)
    one(ctx, 'sawblade_big', sawblade_big, ppm=2 * bl.PPM, elev=90.0)
