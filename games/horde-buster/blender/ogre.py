"""The Ogre: the chapter 1 boss. A huge hunched green ogre (about 5 m), spiked leather pauldrons, chest straps, a loincloth with a skull
buckle, bracers, tusks, small glowing yellow eyes under an angry brow, and fists like boulders.

Frames (default px/m, never an explicit ppm; pivot = the ground under the body; the model is about 7 m tall, pauldrons about 5 m across):
  ogre_walk_0..5      heavy stomp
  ogre_charge_0..3    head down, shoulder first, running
  ogre_slam_0..3      both fists up (0), coming down (1), impact on the ground (2), recover (3)
  ogre_shoot_0..2     winds up and roars (0), mouth wide and glowing red (1), spits (2)
  ogre_head (no jaw), ogre_jaw, ogre_arm, ogre_leg, ogre_torso, ogre_pauldron    gibs (pivot = centre of mass)
Anchors: mouth.ogre (shoot frame 1), fist.ogre (between both fists on slam frame 2), head.ogre (walk average), size.ogre_head.
"""
import math

from mathutils import Matrix, Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Skeleton, Pose, walk, planted, at

PI = math.pi
SCALE = 1.3          # the whole model is built at 'human-ogre' size, then scaled up so it dominates the road (about 7 m tall)

mats.define('ogre_skin', base='#5da23f', base2='#3f7b2e', pattern='noise', pscale=3.2, pamt=0.65, bump=0.45, bscale=26, seed=51)
mats.define('ogre_skin_hi', base='#86c45a', base2='#62a443', pattern='noise', pscale=4, pamt=0.6, bump=0.4, bscale=26, seed=52)
mats.define('ogre_belly', base='#a6d874', base2='#7cba55', pattern='noise', pscale=3.5, pamt=0.6, bump=0.35, bscale=24, seed=53)
mats.define('ogre_leather', base='#a2703f', base2='#744a27', pattern='noise', pscale=4, pamt=0.7, bump=0.6, bscale=22, seed=54)
mats.define('ogre_leather_dark', base='#5f3d24', base2='#402816', pattern='noise', pscale=5, pamt=0.7, bump=0.5, bscale=22, seed=55)
mats.define('ogre_steel', base='#a9b6c6', base2='#6b7a8f', pattern='noise', pscale=3, pamt=0.5, bevel=0.02, seed=56)
mats.define('ogre_brass', base='#f0b43f', base2='#c58c25', pattern='noise', pscale=5, pamt=0.5, bevel=0.02, seed=57)
mats.define('ogre_cloth', base='#cfa266', base2='#a07440', pattern='noise', pscale=4, pamt=0.7, bump=0.4, bscale=20, seed=58)
mats.define('ogre_cloth_red', base='#b6382e', base2='#85231f', pattern='noise', pscale=4, pamt=0.7, bump=0.4, bscale=20, seed=59)
mats.define('ogre_hair', base='#2e2a38', base2='#1c1822', pattern='noise', pscale=8, pamt=0.7, bump=0.5, seed=60)
mats.define('ogre_tusk', base='#f8eecb', base2='#d5c08c', pattern='noise', pscale=4, pamt=0.5, bevel=0.02, seed=61)
mats.define('ogre_nail', base='#eadb8e', bevel=0.012)
mats.define('ogre_glow', base='#ff2812', base2='#ff8a1e', pattern='noise', pscale=3, pamt=0.6, emit=1.0, bevel=0.02, seed=62)
mats.define('ogre_scar', base='#e58b86', base2='#c76a6c', pattern='noise', pscale=8, pamt=0.5, bevel=0.01, seed=63)

SK = Skeleton(hip_h=1.95, hip_w=0.62, thigh=1.1, shin=1.05, spine=1.5, sh_w=1.05, upper=1.15, fore=1.1, neck=0.3, ankle_h=0.3)

# the head, in its own frame (z up from the top of the neck)
SKC = Vector((0.0, 0.03, 0.56))
SKR = (0.63, 0.58, 0.55)
JAW_PIVOT = (0.0, -0.1, 0.3)
HS = 1.4                              # the head is drawn this much bigger than its modelled size
HEAD_D = 1.3 * HS * SCALE             # head width, metres (for the size anchor)

# torso ellipsoids in the spine frame: (centre, radii)
BELLY = (Vector((0.0, -0.15, 0.5)), (0.92, 0.74, 0.74))
CHEST = (Vector((0.0, -0.05, 1.1)), (1.12, 0.76, 0.62))
PECL = (Vector((-0.52, -0.4, 1.2)), (0.56, 0.42, 0.42))
PECR = (Vector((0.52, -0.4, 1.2)), (0.56, 0.42, 0.42))
FRONT = (BELLY, CHEST, PECL, PECR)


def ell(m, e, mat, mx, seg=24, rings=14):
    m.ball(e[0], e[1], mat, mx=mx, seg=seg, rings=rings)


def front_y(x, z, ells=FRONT):
    """Y of the front surface of the torso at (x, z) in the spine frame (None if outside every ellipsoid)."""
    best = None
    for c, r in ells:
        q = 1.0 - ((x - c.x) / r[0]) ** 2 - ((z - c.z) / r[2]) ** 2
        if q > 0:
            y = c.y - r[1] * math.sqrt(q)
            best = y if best is None else min(best, y)
    return best


def band(m, mx, e, z0, z1, mat, grow=1.06, steps=6, seg=28):
    """A band wrapped round an ellipsoid between two heights (belts, wraps): follows the surface."""
    c, r = e
    prof = []
    for i in range(steps + 1):
        z = z0 + (z1 - z0) * i / steps
        q = max(1.0 - ((z - c.z) / r[2]) ** 2, 0.01)
        prof.append((z, math.sqrt(q) * grow))
    m.lathe(prof, mat, mx @ trans(c.x, c.y, 0.0) @ Matrix.Diagonal((r[0], r[1], 1.0, 1.0)), seg=seg, smooth=60.0, cap=False)


def face_frame(x, z):
    """Frame on the front of the skull at (x, z): X right, Y up the skin, Z out of it (head coordinates)."""
    c, r = SKC, SKR
    q = max(1.0 - (x / r[0]) ** 2 - ((z - c.z) / r[2]) ** 2, 0.02)
    y = c.y - r[1] * math.sqrt(q)
    n = Vector((x / r[0] ** 2, (y - c.y) / r[1] ** 2, (z - c.z) / r[2] ** 2)).normalized()
    up = (Vector((0, 0, 1)) - n * n.z).normalized()
    rt = up.cross(n)
    return Matrix(((rt.x, up.x, n.x, x), (rt.y, up.y, n.y, y), (rt.z, up.z, n.z, z), (0, 0, 0, 1)))


# ------------------------------------------------------------------------------------------------ the head

def head(m, H, jaw=0.2, glow=0.0, with_jaw=True, with_head=True):
    """Skull, angry brow, small glowing eyes, big nose, ears, mohawk, and (optionally) the hinged lower jaw with tusks."""
    H = H @ scale(HS)
    if with_head:
        m.ball(SKC, SKR, 'ogre_skin', mx=H, seg=26, rings=14)
        # heavy brow: two ridges slanting down toward the nose
        for sx in (-1, 1):
            m.ball((sx * 0.26, -0.47, 0.79), (0.33, 0.19, 0.15), 'ogre_skin', mx=H, rot=roty(-sx * 0.5), seg=16, rings=8)
            # sockets, glowing eyes, slit pupils
            m.ball((sx * 0.25, -0.5, 0.63), (0.15, 0.09, 0.12), 'mouth', mx=H, seg=14, rings=8)
            m.ball((sx * 0.25, -0.54, 0.63), (0.108, 0.06, 0.09), 'eye_glow_yellow', mx=H, seg=14, rings=8)
            m.ball((sx * 0.25 - sx * 0.01, -0.585, 0.63), (0.026, 0.02, 0.07), 'pupil', mx=H, seg=8, rings=6)
            # cheekbones, ears
            m.ball((sx * 0.41, -0.36, 0.4), (0.21, 0.19, 0.18), 'ogre_skin', mx=H, seg=14, rings=8)
            m.cyl((sx * 0.55, 0.06, 0.58), (sx * 1.0, 0.16, 0.86), 0.15, 0.0, 'ogre_skin', seg=10, mx=H)
            m.cyl((sx * 0.6, 0.07, 0.6), (sx * 0.9, 0.14, 0.78), 0.085, 0.0, 'ogre_skin_hi', seg=8, mx=H)
            for k in range(3):   # a row of brass earrings
                m.ball((sx * (0.66 + 0.04 * k), 0.07 + 0.01 * k, 0.5 - 0.075 * k), 0.04, 'ogre_brass', mx=H, seg=8, rings=5)
        # nose, nostrils
        m.ball((0, -0.6, 0.42), (0.19, 0.16, 0.15), 'ogre_skin_hi', mx=H, seg=14, rings=8)
        for sx in (-1, 1):
            m.ball((sx * 0.085, -0.72, 0.38), (0.05, 0.04, 0.05), 'mouth', mx=H, seg=8, rings=5)
            m.ball((sx * 0.16, -0.64, 0.38), (0.07, 0.07, 0.07), 'ogre_skin_hi', mx=H, seg=8, rings=5)
        # upper lip, upper teeth
        m.ball((0, -0.4, 0.31), (0.44, 0.24, 0.15), 'ogre_skin', mx=H, seg=16, rings=8)
        for i, x in enumerate((-0.28, -0.14, 0.0, 0.14, 0.28)):
            m.box(x - 0.045, x + 0.045, -0.64, -0.56, 0.15, 0.25 - 0.02 * (i % 2), 'teeth', mx=H, bevel=0.012)
        # mohawk of dark spikes down the middle of the skull, warts and a stitched scar
        for k in range(5):                 # a ridge of three-row spikes: tall in the middle, leaning back
            f = k / 4.0
            y = -0.22 + 0.7 * f
            z = 0.98 - 0.2 * f + 0.1 * math.sin(PI * f)
            hgt = 0.34 + 0.2 * math.sin(PI * f)
            for dx in (-0.14, 0.0, 0.14) if k % 2 == 0 else (-0.07, 0.07):
                m.cyl((dx, y, z - 0.1), (dx * 1.4, y + 0.1, z - 0.05 + hgt), 0.1, 0.0, 'ogre_hair', seg=8, mx=H)
        for x, z, r in ((-0.3, 0.93, 0.05), (0.18, 0.96, 0.045), (0.36, 0.28, 0.04), (-0.2, 0.27, 0.035), (0.05, 0.88, 0.04)):
            m.ball((0, 0, 0.0), (r, r, r * 0.8), 'ogre_skin_hi', mx=H @ face_frame(x, z), seg=8, rings=5)
        a, b = Vector((-0.5, -0.43, 0.5)), Vector((-0.18, -0.55, 0.28))
        m.capsule(a, b, 0.018, 0.018, 'ogre_scar', mx=H, seg=6, rings=2)
        for k in range(5):
            p = a + (b - a) * (0.1 + 0.2 * k)
            m.capsule(p + Vector((-0.03, 0.0, 0.05)), p + Vector((0.03, 0.0, -0.05)), 0.01, 0.01, 'ogre_scar', mx=H, seg=5, rings=2)
    if with_jaw:
        J = H @ trans(*JAW_PIVOT) @ rotx(jaw)
        m.ball((0, -0.36, -0.14), (0.52, 0.38, 0.23), 'ogre_skin', mx=J, seg=18, rings=10)
        m.ball((0, -0.56, -0.14), (0.34, 0.2, 0.18), 'ogre_skin_hi', mx=J, seg=14, rings=8)
        m.ball((0, -0.4, 0.03), (0.4, 0.3, 0.07), 'mouth', mx=J, seg=14, rings=6)
        m.ball((0, -0.34, 0.07), (0.27, 0.2, 0.06), 'tongue', mx=J, seg=12, rings=6)
        if glow > 0:
            m.ball((0, -0.42, 0.1), (0.3 * glow, 0.2 * glow, 0.1 * glow), 'ogre_glow', mx=J, seg=14, rings=8)
            m.ball((0, -0.36, 0.45), (0.3 * glow, 0.12 * glow, 0.3 * glow), 'ogre_glow', mx=H, seg=14, rings=8)
        for i, x in enumerate((-0.2, -0.07, 0.07, 0.2)):
            m.box(x - 0.04, x + 0.04, -0.66, -0.58, 0.0, 0.11 - 0.02 * (i % 2), 'teeth', mx=J, bevel=0.012)
        for sx in (-1, 1):   # big curved tusks rising from the lower jaw past the upper lip
            m.tube([(sx * 0.33, -0.6, -0.1), (sx * 0.4, -0.76, 0.15), (sx * 0.38, -0.8, 0.5)], [0.13, 0.1, 0.025], 'ogre_tusk', seg=10, mx=J)
            m.ball((sx * 0.33, -0.6, -0.1), (0.15, 0.12, 0.09), 'ogre_skin', mx=J, seg=10, rings=6)


# ------------------------------------------------------------------------------------------------ the body

def pauldron(m, M):
    """A layered, spiked leather pauldron in frame M (local +Z is up out of the shoulder)."""
    m.ball((0, 0, -0.02), (0.8, 0.74, 0.46), 'ogre_leather', mx=M, seg=22, rings=12)
    m.ball((0, 0, -0.1), (0.88, 0.82, 0.12), 'ogre_leather_dark', mx=M, seg=22, rings=6)           # rim plate
    for k in range(9):                                                                          # studs round the rim
        a = 2 * PI * k / 9 + 0.2
        m.ball((0.88 * math.cos(a), 0.82 * math.sin(a), -0.08), 0.07, 'ogre_brass', mx=M, seg=8, rings=5)
    m.ball((0, 0, 0.2), (0.6, 0.55, 0.38), 'ogre_leather', mx=M, seg=20, rings=10)                # second plate
    m.ball((0, 0, 0.12), (0.66, 0.6, 0.09), 'ogre_leather_dark', mx=M, seg=20, rings=6)
    m.ball((0, 0, 0.42), (0.34, 0.31, 0.24), 'ogre_leather_dark', mx=M, seg=14, rings=8)          # cap
    # steel spikes on brass collars: a big one up, two slanting out and one forward
    for (dx, dy, tx, ty, ln, r, z) in ((0, 0, 0, 0, 1.05, 0.17, 0.58), (0.44, 0.0, 0.62, 0, 0.8, 0.14, 0.3),
                                       (-0.44, 0.0, -0.62, 0, 0.8, 0.14, 0.3), (0.0, -0.4, 0, 0.7, 0.7, 0.13, 0.28)):
        base = Vector((dx, dy, z))
        d = Vector((math.sin(tx), -math.sin(ty), math.cos(tx) * math.cos(ty))).normalized()
        m.ball(base, (r * 1.35, r * 1.35, 0.09), 'ogre_brass', mx=M, seg=10, rings=5)
        m.cyl(base, base + d * ln, r, 0.0, 'ogre_steel', seg=10, mx=M)


def torso(m, F, pauldrons=True, flap_swing=0.0, cut=False):
    S, P, C = F['spine'], F['pelvis'], F['chest']
    m.ball((0, 0.0, 0.0), (0.8, 0.6, 0.52), 'ogre_leather_dark', mx=P, seg=18, rings=10)          # breeches under the belt
    ell(m, BELLY, 'ogre_skin', S)
    m.ball((0, -0.5, 0.45), (0.58, 0.36, 0.5), 'ogre_belly', mx=S, seg=18, rings=10)             # pale pot belly
    m.ball((0, -0.84, 0.44), (0.07, 0.04, 0.07), 'mouth', mx=S, seg=8, rings=5)                   # belly button
    ell(m, CHEST, 'ogre_skin', S)
    ell(m, PECL, 'ogre_skin_hi', S, seg=18, rings=10)
    ell(m, PECR, 'ogre_skin_hi', S, seg=18, rings=10)
    m.ball((0, 0.0, 1.5), (1.0, 0.58, 0.32), 'ogre_skin', mx=S, seg=18, rings=8)                  # trapezius
    m.ball((0, 0.4, 1.1), (0.96, 0.56, 0.66), 'ogre_skin', mx=S, seg=18, rings=10)                # back hump
    # chest scar with stitches
    a, b = Vector((-0.75, -0.55, 0.75)), Vector((-0.25, -0.62, 1.12))
    m.capsule(a, b, 0.032, 0.032, 'ogre_scar', mx=S, seg=6, rings=2)
    for k in range(6):
        p = a + (b - a) * (0.08 + 0.17 * k)
        m.capsule(p + Vector((0.07, 0.0, -0.05)), p + Vector((-0.07, 0.0, 0.05)), 0.016, 0.016, 'ogre_scar', mx=S, seg=5, rings=2)
    # belt, skull buckle
    band(m, S, BELLY, 0.0, 0.3, 'ogre_leather_dark', grow=1.07)
    band(m, S, BELLY, 0.1, 0.2, 'ogre_leather', grow=1.1)
    yb = front_y(0, 0.15, (BELLY,)) - 0.12
    m.ball((0, yb + 0.05, 0.15), (0.3, 0.07, 0.27), 'ogre_steel', mx=S, seg=14, rings=8)
    m.ball((0, yb, 0.17), (0.2, 0.15, 0.2), 'bone', mx=S, seg=14, rings=8)                         # the skull
    m.ball((0, yb - 0.07, 0.07), (0.12, 0.09, 0.08), 'bone', mx=S, seg=10, rings=6)
    for sx in (-1, 1):
        m.ball((sx * 0.08, yb - 0.12, 0.2), (0.058, 0.04, 0.062), 'mouth', mx=S, seg=8, rings=5)
    m.ball((0, yb - 0.15, 0.13), (0.03, 0.025, 0.04), 'mouth', mx=S, seg=6, rings=4)
    for sx in (-0.07, -0.025, 0.025, 0.07):
        m.box(sx - 0.016, sx + 0.016, yb - 0.17, yb - 0.1, 0.02, 0.07, 'teeth', mx=S)
    for sx in (-1, 1):
        m.ball((sx * 0.3, yb + 0.04, 0.15), 0.06, 'ogre_brass', mx=S, seg=8, rings=5)
    # crossed chest straps with a brass ring at the crossing
    for sx in (-1, 1):
        x0, z0, x1, z1 = sx * 0.95, 1.55, -sx * 0.62, 0.12
        n = 18
        for k in range(n + 1):
            t = k / n
            x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
            y = front_y(x, z)
            if y is not None:
                m.ball((x, y - 0.03, z), (0.14, 0.07, 0.14), 'ogre_leather', mx=S, seg=8, rings=5)
    yx = front_y(0.0, 0.84)
    m.ball((0, yx - 0.08, 0.84), (0.2, 0.09, 0.2), 'ogre_brass', mx=S, seg=14, rings=8)
    m.ball((0, yx - 0.13, 0.84), (0.1, 0.05, 0.1), 'ogre_leather_dark', mx=S, seg=10, rings=6)
    # necklace of bone fangs on a cord, lying on the upper chest (it also sets the head apart from the body)
    prev = None
    for k in range(13):
        x = -0.78 + 1.56 * k / 12
        z = 1.42 - 0.34 * (1.0 - (x / 0.78) ** 2)
        y = front_y(x, z)
        if y is None:
            continue
        p = Vector((x, y - 0.05, z))
        m.ball(p, 0.045, 'ogre_leather_dark', mx=S, seg=6, rings=4)
        if k % 2 == 0:
            ln = 0.26 if k == 6 else 0.18
            m.cyl(p, p + Vector((0, -0.04, -ln)), 0.065 if k == 6 else 0.05, 0.0, 'bone', seg=6, mx=S)
        prev = p
    # loincloth: a ragged flap hanging from the belt in front of the thighs, with a red stripe
    flap = [(-0.62, 0.0), (0.62, 0.0), (0.58, -1.3), (0.32, -1.78), (0.0, -1.4), (-0.32, -1.78), (-0.58, -1.3)]
    FM = P @ trans(0, -0.66, 0.12) @ rotx(-0.08 + flap_swing)
    m.prism(flap, -0.05, 0.05, 'ogre_cloth', mx=FM, bevel=0.015)
    m.prism([(-0.2, -0.1), (0.2, -0.1), (0.2, -1.2), (0.0, -1.0), (-0.2, -1.2)], -0.08, -0.04, 'ogre_cloth_red', mx=FM)
    # pauldrons on the shoulders, following the chest
    if pauldrons:
        for sx in (-1, 1):
            pauldron(m, C @ trans(sx * 1.2, 0.0, 0.2) @ roty(sx * 0.62) @ rotx(0.05))
    # neck
    if cut:
        m.cyl(at(C), at(F['head'], 0, 0, 0.25), 0.5, 0.42, 'ogre_skin', seg=16)
    else:
        m.capsule(at(C), at(F['head'], 0, 0, 0.25), 0.5, 0.42, 'ogre_skin', seg=16, rings=5)


def arm(m, F, side, bracer=True, cut=False):
    sh, el, ha = F['sh_' + side], F['elbow_' + side], F['hand_' + side]
    sx = -1 if side == 'l' else 1
    if cut:   # a gib: the upper arm ends in a flat tear
        m.cyl(at(sh), at(el), 0.52, 0.4, 'ogre_skin', seg=16)
    else:
        m.ball(at(sh), 0.58, 'ogre_skin', seg=16, rings=9)
        m.capsule(at(sh), at(el), 0.5, 0.4, 'ogre_skin', seg=16, rings=5)
    m.ball(at(el), 0.42, 'ogre_skin', seg=14, rings=8)
    m.capsule(at(el), at(ha), 0.4, 0.36, 'ogre_skin', seg=16, rings=5)
    if bracer:
        # a studded leather bracer round the forearm, with steel spikes out of it
        m.cyl(at(el, 0, 0, -0.4), at(el, 0, 0, -1.0), 0.47, 0.43, 'ogre_leather_dark', seg=14)
        m.cyl(at(el, 0, 0, -0.43), at(el, 0, 0, -0.52), 0.495, 0.485, 'ogre_leather', seg=14)
        m.cyl(at(el, 0, 0, -0.88), at(el, 0, 0, -0.97), 0.455, 0.445, 'ogre_leather', seg=14)
        for k in range(5):
            a = 2 * PI * k / 5 + 0.6
            m.ball(at(el, 0.47 * math.cos(a), 0.47 * math.sin(a), -0.7), 0.06, 'ogre_brass', seg=8, rings=5)
        for ang in (-0.5, 0.0, 0.5):
            a = -PI / 2 + ang
            p0 = at(el, 0.45 * math.cos(a), 0.45 * math.sin(a), -0.7)
            p1 = at(el, 0.8 * math.cos(a), 0.8 * math.sin(a), -0.7)
            m.cyl(p0, p1, 0.1, 0.0, 'ogre_steel', seg=8)
    # fist: a boulder with four knuckles, a thumb and yellow nails
    m.ball(at(ha, 0, 0, -0.26), (0.46, 0.44, 0.4), 'ogre_skin', seg=16, rings=9)
    for i, x in enumerate((-0.27, -0.09, 0.09, 0.27)):
        m.ball(at(ha, x, -0.34, -0.36), (0.14, 0.14, 0.15), 'ogre_skin_hi', seg=10, rings=6)
    m.ball(at(ha, -sx * 0.34, -0.2, -0.16), (0.17, 0.2, 0.15), 'ogre_skin_hi', seg=10, rings=6)


def leg(m, F, side, wraps=True, cut=False):
    hip, kn, an = F['hip_' + side], F['knee_' + side], F['ankle_' + side]
    if cut:   # a gib: the thigh ends in a flat tear
        m.cyl(at(hip), at(kn), 0.55, 0.42, 'ogre_skin', seg=16)
    else:
        m.ball(at(hip), 0.55, 'ogre_leather_dark', seg=14, rings=8)
        m.capsule(at(hip), at(kn), 0.53, 0.42, 'ogre_skin', seg=16, rings=5)
    m.ball(at(kn), 0.44, 'ogre_skin', seg=14, rings=8)
    m.capsule(at(kn), at(an), 0.42, 0.32, 'ogre_skin', seg=16, rings=5)
    if wraps:   # leather wraps round the shin and a strap at the ankle
        m.cyl(at(kn, 0, 0, -0.18), at(kn, 0, 0, -0.38), 0.44, 0.43, 'ogre_leather_dark', seg=14)
        m.cyl(at(kn, 0, 0, -0.5), at(kn, 0, 0, -0.66), 0.4, 0.38, 'ogre_leather', seg=14)
        m.cyl(at(an, 0, 0, 0.1), at(an, 0, 0, 0.0), 0.37, 0.36, 'ogre_leather_dark', seg=14)
        m.ball(at(kn, 0, -0.42, 0.0), 0.1, 'ogre_brass', seg=8, rings=5)
    R = an.to_3x3().to_4x4()
    m.ball(at(an, 0, -0.34, -0.03), (0.48, 0.68, 0.3), 'ogre_skin', rot=R, seg=16, rings=9)
    for i, x in enumerate((-0.31, -0.1, 0.11, 0.32)):
        r = 0.17 - 0.015 * abs(i - 1.5)
        m.ball(at(an, x, -0.84 + 0.04 * abs(i - 1.5), -0.1), (r, r * 1.05, r * 0.9), 'ogre_skin_hi', rot=R, seg=10, rings=6)
        m.ball(at(an, x, -0.96 + 0.05 * abs(i - 1.5), -0.1), (0.09, 0.07, 0.08), 'ogre_nail', rot=R, seg=6, rings=4)


def body(p, parts=('head', 'jaw', 'torso', 'pauldrons', 'arm_l', 'arm_r', 'leg_l', 'leg_r')):
    p = planted(SK, p)
    F = SK.frames(p)
    m = Mesh('ogre')
    if 'torso' in parts:
        torso(m, F, pauldrons='pauldrons' in parts, flap_swing=p.flap)
    if 'head' in parts or 'jaw' in parts:
        head(m, F['head'], jaw=p.jaw, glow=p.glow, with_jaw='jaw' in parts, with_head='head' in parts)
    for s in ('l', 'r'):
        if 'arm_' + s in parts:
            arm(m, F, s)
        if 'leg_' + s in parts:
            leg(m, F, s)
    m.transform(scale(SCALE))
    return m


# ------------------------------------------------------------------------------------------------ poses

def stomp(t):
    """Heavy stomp: huge slow steps, shoulders rolling, fists swinging low, head rocking, jaw working."""
    p = walk(t, stride=0.5, knee=1.1, arm=0.3, bob=0.26, lean=0.14, roll=0.1, sway=0.16)
    a = 2 * PI * t
    s = math.sin(a)
    p['sh_l'] = 0.55 - 0.45 * s
    p['sh_r'] = 0.55 + 0.45 * s
    p['sh_out_l'] = p['sh_out_r'] = 0.2
    p['elbow_l'] = 0.7 + 0.2 * max(0.0, s)
    p['elbow_r'] = 0.7 + 0.2 * max(0.0, -s)
    p['head_pitch'] = -0.62
    p['head_roll'] = 0.07 * s
    p['head_yaw'] = 0.08 * math.sin(a + 1.0)
    p['jaw'] = 0.3 + 0.1 * math.sin(2 * a)
    p['hip_out_l'] = p['hip_out_r'] = 0.1
    p['flap'] = 0.12 * math.sin(2 * a)
    return p


def charge(i):
    """Head down, left shoulder first: a low run, huge strides, one fist driving forward and one hauled back."""
    t = i / 4.0
    a = 2 * PI * t
    s, c = math.sin(a), math.cos(a)
    p = walk(t, stride=0.85, knee=1.25, arm=0.0, bob=0.2, lean=0.52, roll=0.0, sway=0.0)
    p['twist'] = -0.3 + 0.1 * s
    p['roll'] = 0.12 * s
    p['sh_l'] = 1.55 - 0.9 * s
    p['sh_r'] = 1.55 + 0.9 * s
    p['sh_out_l'] = 0.5
    p['sh_out_r'] = 0.4
    p['elbow_l'] = 1.1
    p['elbow_r'] = 1.1
    p['head_pitch'] = -0.78
    p['head_yaw'] = -0.12
    p['head_roll'] = 0.1 * s
    p['jaw'] = 0.5 + 0.12 * c
    p['hip_out_l'] = p['hip_out_r'] = 0.09
    p['flap'] = 0.3 + 0.1 * c
    return p


def slam(i):
    """Fists up (0), crash down (1), fists on the ground (2), recover (3)."""
    lean = (-0.12, 0.35, 0.62, 0.3)[i]
    p = walk(0.0, stride=0.15, knee=0.4, arm=0.0, bob=0.0, lean=lean, roll=0.0)
    p['knee_l'] = p['knee_r'] = (0.45, 0.25, 0.55, 0.3)[i]
    p['hip_l'] = p['hip_r'] = (0.1, -0.1, -0.3, 0.0)[i]
    p['hip_out_l'] = p['hip_out_r'] = 0.12
    p['sh_l'] = p['sh_r'] = (2.95, 2.0, 1.2, 1.7)[i]
    p['sh_out_l'] = p['sh_out_r'] = (0.28, 0.12, -0.12, 0.2)[i]
    p['elbow_l'] = p['elbow_r'] = (0.55, 0.3, 0.1, 0.4)[i]
    p['head_pitch'] = (-0.5, -0.78, -1.1, -0.75)[i]
    p['jaw'] = (0.6, 0.8, 0.3, 0.3)[i]
    p['flap'] = (0.1, 0.2, 0.4, 0.1)[i]
    return p


def shoot(i):
    """Winds up and roars (0), mouth wide and glowing (1), spits the fan (2)."""
    p = walk(0.0, stride=0.1, knee=0.3, arm=0.0, bob=0.0, lean=(-0.12, -0.25, 0.22)[i], roll=0.0)
    p['knee_l'] = p['knee_r'] = (0.3, 0.45, 0.25)[i]
    p['hip_out_l'] = p['hip_out_r'] = 0.1
    p['sh_l'] = p['sh_r'] = (0.9, 0.5, 0.8)[i]
    p['sh_out_l'] = p['sh_out_r'] = (0.75, 1.0, 0.65)[i]
    p['elbow_l'] = p['elbow_r'] = (0.9, 1.1, 0.7)[i]
    p['head_pitch'] = (-0.55, -0.45, -0.95)[i]
    p['jaw'] = (0.55, 1.0, 0.85)[i]
    p['glow'] = (0.5, 1.0, 1.0)[i]
    p['flap'] = (0.0, -0.1, 0.2)[i]
    return p


# ------------------------------------------------------------------------------------------------ build

def head_point(p, local):
    F = SK.frames(planted(SK, p))
    return ((F['head'] @ Vector(local)) * SCALE).to_tuple()


def build(ctx):
    ink = dict(outline=2.4)
    ctx.anim('ogre_walk', 6, lambda i: body(stomp(i / 6)), ink=ink)
    ctx.anim('ogre_charge', 4, lambda i: body(charge(i)), ink=ink)
    ctx.anim('ogre_slam', 4, lambda i: body(slam(i)), ink=ink)
    ctx.anim('ogre_shoot', 3, lambda i: body(shoot(i)), ink=ink)

    # ---- anchors
    p1 = shoot(1)
    F = SK.frames(planted(SK, p1))
    J = F['head'] @ trans(*JAW_PIVOT) @ rotx(p1.jaw)
    ctx.anchor('mouth', 'ogre', ((J @ Vector((0, -0.55, 0.05))) * SCALE).to_tuple())
    p2 = slam(2)
    F = SK.frames(planted(SK, p2))
    hl = (F['hand_l'] @ Vector((0, -0.2, -0.5)))
    hr = (F['hand_r'] @ Vector((0, -0.2, -0.5)))
    ctx.anchor('fist', 'ogre', (((hl + hr) / 2) * SCALE).to_tuple())
    hx = hy = hz = 0.0
    for i in range(6):
        c = head_point(stomp(i / 6), SKC)
        hx += c[0] / 6
        hy += c[1] / 6
        hz += c[2] / 6
    ctx.anchor('head', 'ogre', (hx, hy, hz))
    ctx.value('size', 'ogre_head', round(HEAD_D * bl.UNITS_PER_M, 1))

    # ---- gibs, built around the origin
    F0 = SK.frames(Pose(sh_out_l=0.0))
    # the skull without its jaw, a torn neck at the bottom; tipped so the face and the red stump show
    h = Mesh('head')
    head(h, trans(0, 0, 0), with_jaw=False)
    h.ball((0, 0.0, 0.08), (0.46, 0.4, 0.12), 'meat', seg=16, rings=6)
    h.ball((0, -0.02, 0.1), (0.27, 0.24, 0.1), 'guts', seg=12, rings=6)
    h.capsule((-0.08, 0.05, 0.1), (0.0, 0.1, 0.3), 0.07, 0.06, 'bone', seg=8, rings=3)
    h.transform(trans(-SKC.x, -SKC.y, -SKC.z))
    h.transform(rotx(-0.45))
    h.transform(scale(SCALE))
    ctx.one('ogre_head', h, ink=ink)

    j = Mesh('jaw')
    head(j, trans(0, 0, 0), jaw=0.0, with_head=False)
    j.ball((0, -0.12, 0.05), (0.42, 0.2, 0.13), 'meat', seg=12, rings=6)
    j.capsule((-0.3, -0.05, -0.1), (-0.5, 0.05, 0.1), 0.08, 0.06, 'bone', seg=8, rings=3)
    j.capsule((0.3, -0.05, -0.1), (0.5, 0.05, 0.1), 0.08, 0.06, 'bone', seg=8, rings=3)
    j.transform(trans(0.0, 0.5, 0.0))
    j.transform(rotx(0.3))
    j.transform(scale(SCALE))
    ctx.one('ogre_jaw', j, ink=ink)

    a = Mesh('arm')
    Fa = SK.frames(Pose(sh_l=0.9, elbow_l=0.9, sh_out_l=0.3))
    arm(a, Fa, 'l', cut=True)
    SH = Fa['sh_l']
    a.ball((0, 0, 0.0), (0.54, 0.52, 0.13), 'meat', mx=SH, seg=14, rings=6)                 # torn end of the upper arm
    a.ball((0, 0, 0.04), (0.34, 0.32, 0.1), 'guts', mx=SH, seg=12, rings=5)
    a.capsule((0.0, 0.0, 0.0), (0.0, 0.0, 0.3), 0.13, 0.11, 'bone', mx=SH, seg=8, rings=3)
    mid = (Vector(at(Fa['sh_l'])) + Vector(at(Fa['hand_l']))) / 2
    a.transform(trans(-mid.x, -mid.y, -mid.z))
    a.transform(rotx(0.55))
    a.transform(scale(SCALE))
    ctx.one('ogre_arm', a, ink=ink)

    lg = Mesh('leg')
    Fl = SK.frames(Pose(hip_r=0.5, knee_r=0.9))
    leg(lg, Fl, 'r', cut=True)
    HP = Fl['hip_r']
    lg.ball((0, 0, 0.0), (0.56, 0.55, 0.13), 'meat', mx=HP, seg=14, rings=6)                 # torn thigh
    lg.ball((0, 0, 0.04), (0.34, 0.32, 0.1), 'guts', mx=HP, seg=12, rings=5)
    lg.capsule((0.0, 0.0, 0.0), (0.0, 0.0, 0.3), 0.14, 0.12, 'bone', mx=HP, seg=8, rings=3)
    mid = (Vector(at(Fl['hip_r'])) + Vector(at(Fl['ankle_r']))) / 2
    lg.transform(trans(-mid.x, -mid.y, -mid.z))
    lg.transform(rotx(0.5))
    lg.transform(scale(SCALE))
    ctx.one('ogre_leg', lg, ink=ink)

    tr = Mesh('torso')
    torso(tr, F0, pauldrons=False, cut=True)
    for sx in (-1, 1):   # torn shoulders and hips
        tr.ball(at(F0['sh_l' if sx < 0 else 'sh_r']), (0.5, 0.5, 0.3), 'meat', seg=12, rings=6)
        tr.ball(at(F0['hip_l' if sx < 0 else 'hip_r']), (0.55, 0.5, 0.25), 'meat', seg=12, rings=6)
        tr.ball(at(F0['hip_l' if sx < 0 else 'hip_r'], 0, 0, -0.08), (0.3, 0.25, 0.15), 'guts', seg=10, rings=5)
    tr.ball(at(F0['head'], 0, 0, 0.25), (0.5, 0.47, 0.13), 'meat', seg=12, rings=6)
    tr.ball(at(F0['head'], 0, 0, 0.29), (0.28, 0.26, 0.1), 'guts', seg=10, rings=5)
    tr.capsule(at(F0['head'], 0, 0, 0.2), at(F0['head'], 0, 0, 0.5), 0.1, 0.08, 'bone', seg=8, rings=3)
    tr.transform(trans(0, 0, -1.0))
    tr.transform(rotx(-0.35))
    tr.transform(scale(SCALE))
    ctx.one('ogre_torso', tr, ink=ink)

    pa = Mesh('pauldron')
    pauldron(pa, Matrix.Identity(4))
    pa.ball((0, 0, -0.3), (0.7, 0.64, 0.14), 'meat', seg=14, rings=6)
    pa.transform(rotx(0.4))
    pa.transform(scale(SCALE))
    ctx.one('ogre_pauldron', pa, ink=ink)
