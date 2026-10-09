"""The brute: a hulking red horned demon (about 2.3 m, hunched) with gorilla arms and huge fists, a small angry head with curved cream
horns, a spiked iron collar, a studded belt, clawed feet and a heavy stomping walk. Also its gore parts.

Frames (default bl.PPM px/m, pivot = the ground under the body):
  brute_walk_0..7     heavy stomp
  brute_nohead_0..7   the same walk, head gone, a spurting neck stump
  brute_attack_0..3   double-fist smash: both fists up and a roar (0), coming down (1), impact on the ground (2), recover (3)
  brute_head, brute_arm, brute_leg, brute_torso, brute_horn   gibs (pivot = centre of mass)
Anchors: head.brute (the head's centre on the walk frames, game units from the pivot), size.brute_head, fist.brute (the point
between both fists at the smash impact, attack frame 2).
"""
import math

from mathutils import Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Skeleton, Pose, walk, planted, at

PI = math.pi

SK = Skeleton(hip_h=0.9, hip_w=0.2, thigh=0.5, shin=0.5, spine=0.62, sh_w=0.5, upper=0.52, fore=0.52, neck=0.08, ankle_h=0.12)
HEAD_R = 0.27
FIST_R = 0.2

mats.define('brute_dark', base='#8f1b19', base2='#5e0f0e', pattern='noise', pscale=5, pamt=0.6, bump=0.4, seed=61)
mats.define('brute_belly', base='#f0774f', base2='#d2543a', pattern='noise', pscale=6, pamt=0.6, bump=0.3, seed=62)
mats.define('brute_iron', base='#40444f', base2='#2b2e37', pattern='noise', pscale=8, pamt=0.5, bevel=0.012, seed=63)
mats.define('brute_steel', base='#a3aab6', bevel=0.01)
mats.define('brute_leather', base='#5a3a28', base2='#3d271b', pattern='noise', pscale=7, pamt=0.7, bump=0.3, seed=64)
mats.define('brute_lava', base='#ffb12e', emit=1.0, bevel=0.006)
mats.define('brute_horn_base', base='#a8895c', base2='#6d5636', pattern='noise', pscale=9, pamt=0.5, bevel=0.01, seed=65)
mats.define('brute_horn', base='#f4e8c8', base2='#d8c498', pattern='noise', pscale=8, pamt=0.4, bevel=0.01, seed=66)


def horn_path(s):
    """Points (head frame) and radii of one curved horn: out, up and in toward the tip. s = -1 / +1 for the side."""
    pts = [(s * 0.15, 0.0, 0.34), (s * 0.27, 0.02, 0.42), (s * 0.36, 0.01, 0.56), (s * 0.34, -0.04, 0.72), (s * 0.23, -0.1, 0.84)]
    return pts, [0.075, 0.066, 0.052, 0.034, 0.01]


def horn(m, s, mx):
    pts, rad = horn_path(s)
    m.tube(pts[:3], rad[:3], 'brute_horn_base', seg=10, mx=mx, cap=False)
    m.tube(pts[2:], rad[2:], 'brute_horn', seg=10, mx=mx, cap=True)
    for i in (1, 2):                                                         # a few ridges so the horn reads as a horn
        p = Vector(pts[i])
        m.ball(p, (rad[i] * 1.12,) * 3, 'brute_horn_base' if i == 1 else 'brute_horn', mx=mx)


def head(m, F, jaw=0.45, mx=None, horns=True):
    """A small angry head: heavy brow, small glowing yellow eyes, a snub snout, an underbite with two tusks, curved horns."""
    H = F['head'] if mx is None else mx
    R = HEAD_R
    m.ball((0, 0, R * 0.95), (R * 1.02, R * 0.95, R * 0.95), 'skin_brute', mx=H)
    m.ball((0, -R * 0.62, R * 0.55), (R * 0.56, R * 0.48, R * 0.38), 'skin_brute', mx=H)            # snout
    for s in (-1, 1):
        m.capsule((s * 0.2, -0.17, 0.4), (s * 0.04, -0.225, 0.325), 0.058, 0.052, 'brute_dark', mx=H)   # heavy angry brow
        m.ball((s * 0.1, -0.215, 0.255), (0.068, 0.042, 0.05), 'mouth', mx=H)                           # eye sockets
        m.ball((s * 0.1, -0.243, 0.252), (0.05, 0.026, 0.036), 'eye_glow_yellow', mx=H)                 # small glowing eyes
        m.ball((s * 0.094, -0.266, 0.25), (0.012, 0.01, 0.03), 'pupil', mx=H)
        m.ball((s * 0.045, -0.31, 0.15), (0.02, 0.016, 0.014), 'mouth', mx=H)                          # nostrils
        m.cyl((s * 0.25, 0.03, 0.26), (s * 0.43, 0.1, 0.34), 0.06, 0.0, 'skin_brute', seg=8, mx=H)       # pointed ears
        m.cyl((s * 0.07, -0.285, 0.1), (s * 0.075, -0.3, -0.0), 0.022, 0.0, 'teeth', seg=6, mx=H)       # upper fangs
        m.ball((s * 0.15, -0.14, 0.4), (0.07, 0.06, 0.05), 'brute_dark', mx=H)                          # cheek and brow bumps
    m.ball((0, -0.18, 0.37), (0.1, 0.05, 0.04), 'brute_dark', mx=H)                                     # between the brows
    # jaw hinged at the back of the mouth: a heavy underbite with two curved tusks
    J = H @ trans(0, -0.04, R * 0.55) @ rotx(jaw)
    m.ball((0, -0.12, -0.04), (0.17, 0.14, 0.085), 'skin_brute', mx=J)
    m.ball((0, -0.2, 0.03), (0.12, 0.07, 0.03), 'mouth', mx=J)
    m.ball((0, -0.2, 0.03), (0.07, 0.04, 0.02), 'tongue', mx=J)
    for s in (-1, 1):
        m.tube([(s * 0.12, -0.2, 0.0), (s * 0.135, -0.235, 0.09), (s * 0.12, -0.24, 0.19)], [0.034, 0.028, 0.006], 'brute_horn', seg=8, mx=J)
    if horns:
        for s in (-1, 1):
            horn(m, s, H)


def torso(m, F):
    """Barrel chest and gut, huge shoulders, a hump on the back, a studded belt and a spiked iron collar."""
    S = F['spine']
    m.ball((0, 0, 0.12), (0.3, 0.23, 0.22), 'skin_brute', mx=S)                                      # hips
    m.box(-0.14, 0.14, -0.25, -0.2, -0.25, 0.18, 'brute_leather', mx=S @ rotx(0.08), bevel=0.012)  # loincloth flap
    m.box(-0.12, 0.12, -0.27, -0.23, -0.18, -0.02, 'brute_dark', mx=S @ rotx(0.08), bevel=0.012)
    m.ball((0, 0, 0.27), (0.34, 0.26, 0.07), 'brute_leather', mx=S)                                  # belt
    m.ball((0, -0.25, 0.27), (0.11, 0.04, 0.1), 'brute_steel', mx=S)                                 # buckle
    m.ball((0, -0.28, 0.27), (0.05, 0.02, 0.05), 'brute_iron', mx=S)
    for k in range(-3, 4):                                                                           # belt studs and spikes
        a = k * 0.33
        x, y = 0.34 * math.sin(a), -0.26 * math.cos(a)
        if k != 0:
            m.cyl((x, y, 0.27), (x * 1.28, y * 1.28, 0.27), 0.034, 0.0, 'brute_steel', seg=6, mx=S)
    m.ball((0, -0.04, 0.42), (0.36, 0.27, 0.27), 'skin_brute', mx=S)                                 # gut
    m.ball((0, -0.2, 0.36), (0.22, 0.1, 0.19), 'brute_belly', mx=S)                                  # pale belly
    m.ball((0, 0.0, 0.62), (0.52, 0.31, 0.3), 'skin_brute', mx=S)                                   # chest and shoulders
    m.ball((0, -0.25, 0.62), (0.34, 0.1, 0.2), 'brute_belly', mx=S)                                  # pale chest
    m.capsule((0, -0.3, 0.48), (0, -0.31, 0.74), 0.014, 0.014, 'brute_dark', mx=S)                    # pectoral crease
    for s in (-1, 1):
        m.capsule((s * 0.02, -0.31, 0.54), (s * 0.3, -0.27, 0.57), 0.013, 0.013, 'brute_dark', mx=S)
    m.ball((0, 0.14, 0.82), (0.42, 0.26, 0.24), 'skin_brute', mx=S)                                  # the hump on the back
    for s in (-1, 1):                                                                                # bone spikes on the shoulders
        for (x0, y0, z0), (x1, y1, z1), r in (((0.42, 0.0, 0.84), (0.5, 0.03, 1.14), 0.075), ((0.62, 0.0, 0.76), (0.86, 0.0, 0.94), 0.07),
                                              ((0.3, -0.1, 0.9), (0.33, -0.15, 1.1), 0.05)):
            m.cyl((s * x0, y0, z0), (s * x1, y1, z1), r, 0.0, 'brute_horn', seg=8, mx=S)
            m.ball((s * x0, y0, z0), (r * 1.15, r * 1.15, r * 0.7), 'brute_horn_base', mx=S)
    # molten veins glowing through the skin of the belly and chest
    def front(x, z):
        y = 0.0
        for cx, cy, cz, rx, ry, rz in ((0, -0.04, 0.42, 0.36, 0.27, 0.27), (0, 0.0, 0.62, 0.52, 0.31, 0.3), (0, -0.2, 0.36, 0.22, 0.1, 0.19), (0, -0.25, 0.62, 0.34, 0.1, 0.2)):
            q = 1.0 - ((x - cx) / rx) ** 2 - ((z - cz) / rz) ** 2
            if q > 0:
                y = min(y, cy - ry * math.sqrt(q))
        return (x, y - 0.012, z)
    for pts in (((0.0, 0.31), (0.05, 0.4), (-0.03, 0.5), (0.04, 0.6), (0.0, 0.7)),
                ((0.04, 0.4), (0.13, 0.45), (0.17, 0.38), (0.26, 0.4)),
                ((-0.03, 0.5), (-0.12, 0.54), (-0.18, 0.49), (-0.28, 0.52)),
                ((0.04, 0.6), (0.12, 0.66), (0.2, 0.62))):
        m.tube([front(x, z) for x, z in pts], 0.011, 'brute_lava', seg=5, mx=S)
    # spiked iron collar around the neck, resting on the shoulders
    cz, cr = 0.84, 0.33
    m.lathe([(cz + 0.065 * math.sin(t), cr + 0.065 * math.cos(t)) for t in [i * PI / 4 for i in range(9)]], 'brute_iron', mx=S, seg=24, smooth=60.0, cap=False)
    for k in range(11):
        a = 2 * PI * k / 11 + 0.3
        c, s_ = math.cos(a), math.sin(a)
        m.cyl((cr * c, cr * s_, cz + 0.02), (cr * 1.2 * c, cr * 1.2 * s_, cz + 0.2), 0.055, 0.0, 'brute_steel', seg=6, mx=S)


def neck(m, F):
    m.capsule(at(F['chest'], 0, 0, 0.0), at(F['head'], 0, 0, 0.06), 0.15, 0.13, 'skin_brute')


def stump(m, F):
    """Where the head was: a thick column of torn red skin standing proud of the shoulders, raw meat and a white spine end."""
    C = F['chest']
    m.capsule(at(C, 0, 0, 0.05), at(C, 0, 0, 0.45), 0.175, 0.15, 'skin_brute')
    m.ball(at(C, 0, 0, 0.47), (0.16, 0.16, 0.05), 'meat')
    m.ball(at(C, 0, 0, 0.5), (0.115, 0.115, 0.03), 'guts')
    m.capsule(at(C, 0, 0, 0.47), at(C, 0, 0, 0.66), 0.065, 0.055, 'bone')
    m.ball(at(C, 0.07, -0.06, 0.5), (0.07, 0.07, 0.05), 'blood')
    m.ball(at(C, -0.08, 0.02, 0.5), (0.05, 0.05, 0.04), 'guts')
    m.ball(at(C, 0.0, -0.15, 0.4), (0.12, 0.04, 0.07), 'blood')


def arm(m, F, side, cut=False):
    """A thick gorilla arm: shoulder cap, bulging forearm in a studded leather guard, a huge clawed fist."""
    sh, el, ha = F['sh_' + side], F['elbow_' + side], F['hand_' + side]
    if cut:                                   # the gib: a flat cut across the top of the arm, meat and bone showing
        m.cyl(at(sh, 0, 0, 0.0), at(el), 0.2, 0.17, 'skin_brute', seg=16)
        m.ball(at(sh, 0, 0, 0.0), (0.2, 0.2, 0.05), 'meat')
        m.capsule(at(sh, 0, 0, -0.02), at(sh, 0, 0, 0.1), 0.045, 0.04, 'bone')
        m.ball(at(sh, 0.06, -0.05, 0.03), (0.05, 0.05, 0.03), 'blood')
    else:
        m.ball(at(sh), (0.27, 0.26, 0.26), 'skin_brute')
        m.capsule(at(sh), at(el), 0.2, 0.17, 'skin_brute')
    m.ball(at(el), (0.17, 0.17, 0.17), 'brute_dark')
    m.capsule(at(el), at(ha), 0.18, 0.165, 'skin_brute')
    m.capsule(at(el, 0, 0, -0.26), at(ha, 0, 0, 0.0), 0.19, 0.185, 'brute_leather')                  # wrist guard
    for z in (-0.32, -0.42):
        for sx in (-0.1, 0.1):
            m.ball(at(el, sx, -0.17, z), (0.034, 0.03, 0.034), 'brute_steel')
    m.ball(at(ha, 0, 0, -0.13), (FIST_R, FIST_R * 0.95, FIST_R * 0.95), 'skin_brute')              # the fist
    m.ball(at(ha, 0, -0.1, -0.12), (0.16, 0.1, 0.12), 'brute_dark')                                  # knuckle ridge
    for x in (-0.12, -0.04, 0.04, 0.12):
        m.cyl(at(ha, x, -0.18, -0.12), at(ha, x * 1.12, -0.27, -0.2), 0.035, 0.0, 'claw', seg=6)    # claws
    m.ball(at(ha, 0.17 * (1 if side == 'l' else -1), -0.05, -0.1), (0.07, 0.09, 0.07), 'skin_brute')  # thumb


def leg(m, F, side, cut=False):
    """A short, thick leg in a dark loincloth fringe and a broad clawed foot."""
    hip, kn, an = F['hip_' + side], F['knee_' + side], F['ankle_' + side]
    if cut:
        m.cyl(at(hip), at(kn), 0.2, 0.15, 'skin_brute', seg=16)
        m.ball(at(hip), (0.2, 0.2, 0.05), 'meat')
        m.capsule(at(hip, 0, 0, -0.02), at(hip, 0, 0, 0.1), 0.05, 0.045, 'bone')
        m.ball(at(hip, -0.07, -0.05, 0.03), (0.05, 0.05, 0.03), 'blood')
    else:
        m.capsule(at(hip), at(kn), 0.2, 0.15, 'skin_brute')
    m.ball(at(kn, 0, -0.04, 0), (0.14, 0.14, 0.14), 'brute_dark')
    m.capsule(at(kn), at(an), 0.14, 0.11, 'skin_brute')
    m.capsule(at(kn, 0, 0, -0.2), at(an, 0, 0, 0.1), 0.15, 0.13, 'brute_dark')                       # dark shaggy lower leg
    R = an.to_3x3().to_4x4()
    m.ball(at(an, 0, -0.1, -0.06), (0.15, 0.22, 0.09), 'skin_brute', rot=R)                          # the foot
    for x in (-0.09, 0.0, 0.09):                                                                     # three big toes with claws
        m.ball(at(an, x, -0.26, -0.085), (0.055, 0.075, 0.05), 'skin_brute', rot=R)
        m.cyl(at(an, x, -0.32, -0.08), at(an, x * 1.1, -0.44, -0.09), 0.04, 0.0, 'claw', seg=6)


def body(p, parts=('head', 'torso', 'arm_l', 'arm_r', 'leg_l', 'leg_r'), stumped=False):
    p = planted(SK, p)
    F = SK.frames(p)
    m = Mesh('brute')
    if 'torso' in parts:
        torso(m, F)
        if stumped:
            stump(m, F)
        else:
            neck(m, F)
    if 'head' in parts:
        head(m, F, jaw=p.jaw or 0.45)
    for s in ('l', 'r'):
        if 'arm_' + s in parts:
            arm(m, F, s)
        if 'leg_' + s in parts:
            leg(m, F, s)
    return m


def stomp(t):
    """Heavy stomp: wide short steps, the whole body dropping on every footfall, torso rolling, fists swinging low and out."""
    p = walk(t, stride=0.36, knee=0.5, arm=0.0, bob=0.075, lean=0.4, roll=0.1)
    a = 2 * PI * t
    s = math.sin(a)
    lean = p.lean
    # arm angles are relative to the leaning chest: lean + x hangs straight down in the world
    p['sh_l'] = lean + 0.28 - 0.42 * s
    p['sh_r'] = lean + 0.28 + 0.42 * s
    p['sh_out_l'] = 0.3
    p['sh_out_r'] = 0.3
    p['elbow_l'] = 0.35 + 0.25 * max(0.0, -s)
    p['elbow_r'] = 0.35 + 0.25 * max(0.0, s)
    p['head_pitch'] = -0.95 + 0.06 * math.cos(2 * a)
    p['head_roll'] = 0.1 * s
    p['head_yaw'] = 0.1 * math.sin(a * 0.5)
    p['hip_out_l'] = 0.12
    p['hip_out_r'] = 0.12
    p['jaw'] = 0.45 + 0.12 * max(0.0, math.sin(a * 2))
    return p


def fists_to_ground(p, z=FIST_R + 0.02):
    """The shoulder angle at which both fists rest on the ground (bisection: a bigger angle lifts the hands)."""
    q = planted(SK, p)
    lo, hi = q.lean, q.lean + 1.6          # lean = arms hanging straight down in the world
    for _ in range(30):
        mid = (lo + hi) / 2
        q['sh_l'] = q['sh_r'] = mid
        F = SK.frames(q)
        fz = min(at(F['hand_l'], 0, 0, -0.13)[2], at(F['hand_r'], 0, 0, -0.13)[2])
        if fz > z:
            hi = mid
        else:
            lo = mid
    return mid


def attack(i):
    """Both fists up with a roar (0), crashing down (1), impact (2), pushing back up (3)."""
    p = Pose(knee_l=0.5, knee_r=0.5, hip_l=0.35, hip_r=0.35, hip_out_l=0.2, hip_out_r=0.2)
    if i == 0:
        p.update(lean=-0.08, head_pitch=-0.5, jaw=0.95, sh_l=2.85, sh_r=2.85, sh_out_l=0.3, sh_out_r=0.3, elbow_l=0.7, elbow_r=0.7,
                 knee_l=0.35, knee_r=0.35, hip_l=0.2, hip_r=0.2)
    elif i == 1:
        p.update(lean=0.45, head_pitch=-0.9, jaw=0.6, sh_l=2.6, sh_r=2.6, sh_out_l=0.12, sh_out_r=0.12, elbow_l=0.3, elbow_r=0.3,
                 knee_l=0.7, knee_r=0.7, hip_l=0.45, hip_r=0.45)
    elif i == 2:
        p.update(lean=0.85, head_pitch=-1.05, jaw=0.4, sh_out_l=0.1, sh_out_r=0.1, elbow_l=0.15, elbow_r=0.15,
                 knee_l=1.0, knee_r=1.0, hip_l=0.65, hip_r=0.65)
        a = fists_to_ground(p)
        p['sh_l'] = p['sh_r'] = a
    else:
        p.update(lean=0.65, head_pitch=-1.0, jaw=0.5, sh_out_l=0.15, sh_out_r=0.15, elbow_l=0.3, elbow_r=0.3,
                 knee_l=0.8, knee_r=0.8, hip_l=0.5, hip_r=0.5)
        p['sh_l'] = p['sh_r'] = p.lean + 0.75
    return p


def build(ctx):
    ctx.anim('brute_walk', 8, lambda i: body(stomp(i / 8)))
    ctx.anim('brute_nohead', 8, lambda i: body(stomp(i / 8), parts=('torso', 'arm_l', 'arm_r', 'leg_l', 'leg_r'), stumped=True))
    ctx.anim('brute_attack', 4, lambda i: body(attack(i)))
    hx = hy = hyy = 0.0
    for i in range(8):
        F = SK.frames(planted(SK, stomp(i / 8)))
        c = F['head'] @ trans(0, 0, HEAD_R * 0.95)
        hx += c.translation.x / 8
        hy += c.translation.z / 8
        hyy += c.translation.y / 8
    ctx.anchor('head', 'brute', (hx, hyy, hy))
    ctx.value('size', 'brute_head', round(HEAD_R * 2 * bl.UNITS_PER_M, 1))
    F = SK.frames(planted(SK, attack(2)))
    fl, fr = Vector(at(F['hand_l'], 0, 0, -0.13)), Vector(at(F['hand_r'], 0, 0, -0.13))
    ctx.anchor('fist', 'brute', (fl + fr) / 2)

    # gibs: built around the origin so the pivot is their middle
    F0 = SK.frames(Pose())
    tilt = rotx(-0.5)
    Hh = tilt @ trans(0, 0, -HEAD_R * 0.95)
    g = Mesh('head')
    head(g, F0, jaw=0.8, mx=Hh)
    g.ball(Vector((0, 0.0, -HEAD_R * 0.85)), (0.14, 0.14, 0.04), 'meat', mx=tilt)
    g.capsule((0, 0, -HEAD_R * 0.95), (0, 0, -HEAD_R * 0.5), 0.04, 0.035, 'bone', mx=tilt)
    g.ball((0.06, -0.04, -HEAD_R * 0.9), (0.06, 0.06, 0.04), 'blood', mx=tilt)
    ctx.one('brute_head', g)

    a = Mesh('arm')
    Fa = SK.frames(Pose(sh_l=0.0))
    arm(a, Fa, 'l', cut=True)
    a.transform(trans(*(-Vector(at(Fa['elbow_l'])))))
    a.transform(roty(PI / 2))
    a.transform(rotz(-0.8))                  # turned so the cut end faces the camera
    ctx.one('brute_arm', a)

    lg = Mesh('leg')
    leg(lg, F0, 'r', cut=True)
    lg.transform(trans(*(-Vector(at(F0['knee_r'])))))
    lg.transform(roty(-PI / 2))
    lg.transform(rotz(0.8))
    ctx.one('brute_leg', lg)

    tr = Mesh('torso')
    torso(tr, F0)
    stump(tr, F0)
    for sx in (-1, 1):                         # the shoulders, cut across where the arms were torn off
        tr.ball((sx * 0.5, 0, 0.62), (0.27, 0.26, 0.26), 'skin_brute', mx=F0['spine'])
        tr.ball((sx * 0.74, 0, 0.62), (0.05, 0.2, 0.2), 'meat', mx=F0['spine'])
        tr.capsule((sx * 0.7, 0, 0.62), (sx * 0.84, 0, 0.62), 0.045, 0.04, 'bone', mx=F0['spine'])
    tr.ball(at(F0['spine'], 0, -0.1, 0.0), (0.26, 0.17, 0.07), 'guts')
    tr.ball(at(F0['spine'], 0, 0, -0.04), (0.28, 0.2, 0.05), 'meat')
    tr.transform(trans(0, 0, -at(F0['spine'], 0, 0, 0.45)[2]))
    tr.transform(rotx(-PI / 2 + 0.3))
    ctx.one('brute_torso', tr)

    hm = Mesh('horn')
    horn(hm, 1, trans(-0.28, 0.03, -0.6))
    hm.ball((-0.13, 0.03, -0.26), (0.09, 0.09, 0.04), 'meat')
    hm.transform(roty(PI / 2))
    hm.transform(rotz(0.35))
    ctx.one('brute_horn', hm)
