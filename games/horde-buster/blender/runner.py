"""The runner: a thin, fast, pale grey-green zombie in an orange tank top and shorts, one red shoe, sprinting flat out at the camera
with its long arms flung back and its jaw wide open. Also its gore parts.

Frames (default bl.PPM px/m, pivot = the ground under the body):
  runner_walk_0..7     the sprint cycle (the game's name for the locomotion loop)
  runner_nohead_0..7   the same sprint, head gone, a spurting neck stump
  runner_attack_0..2   crouch, lunge, claw down
  runner_head, runner_arm, runner_leg, runner_torso   gibs (pivot = centre of mass)
Anchors: head.runner (the head's centre on the sprint frames, game units from the pivot), size.runner_head.
"""
import math

from mathutils import Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Skeleton, Pose, walk, planted, at

PI = math.pi

SK = Skeleton(hip_h=0.84, hip_w=0.1, thigh=0.43, shin=0.43, spine=0.54, sh_w=0.21, upper=0.34, fore=0.34, neck=0.1, ankle_h=0.07)
HEAD_R = 0.205

mats.define('runner_skin', base='#a6bd9c', base2='#7f9a78', pattern='noise', pscale=5, pamt=0.6, bump=0.3, seed=51)
mats.define('runner_skin_dark', base='#7f9a78', bevel=0.01)
mats.define('runner_tank', base='#f08f2e', base2='#c2641a', pattern='noise', pscale=7, pamt=0.7, bump=0.2, seed=52)
mats.define('runner_shorts', base='#35467a', base2='#26335a', pattern='noise', pscale=6, pamt=0.6, bump=0.2, seed=53)
mats.define('runner_shoe', base='#e2362f', base2='#a8201d', pattern='noise', pscale=6, pamt=0.4, bevel=0.012, seed=54)
mats.define('runner_sole', base='#f1ece0', bevel=0.01)
mats.define('runner_hair', base='#4a4452', bevel=0.004)


def head(m, F, jaw=0.8, mx=None):
    """A long skull, sunken glowing red eyes under angry brows, pointed ears, a few wisps of hair and a jaw hanging wide open."""
    H = F['head'] if mx is None else mx
    R = HEAD_R
    m.ball((0, 0, R * 0.98), (R * 0.9, R * 0.92, R * 1.04), 'runner_skin', mx=H)
    m.ball((0, -R * 0.55, R * 0.62), (R * 0.62, R * 0.5, R * 0.38), 'runner_skin', mx=H)           # long face
    for sx in (-1, 1):
        m.ball((sx * 0.085, -R * 0.78, R * 1.05), (0.078, 0.05, 0.08), 'mouth', mx=H)               # sunken sockets
        m.ball((sx * 0.085, -R * 0.93, R * 1.05), (0.058, 0.03, 0.062), 'eye_glow_red', mx=H)       # glowing eyes
        m.ball((sx * 0.085 - sx * 0.006, -R * 1.03, R * 1.04), (0.011, 0.012, 0.036), 'pupil', mx=H)  # slit pupils
        m.capsule((sx * 0.155, -0.165, R * 1.42), (sx * 0.035, -0.19, R * 1.22), 0.02, 0.02, 'runner_skin_dark', mx=H)   # angry brows
        m.cyl((sx * R * 0.85, 0, R * 0.95), (sx * R * 1.4, 0.03, R * 1.3), 0.05, 0.0, 'runner_skin', seg=8, mx=H)         # pointed ears
        m.ball((sx * 0.025, -R * 0.93, R * 0.78), (0.014, 0.014, 0.018), 'mouth', mx=H)             # nose pits
    for x, y, dx, dy in ((0.0, 0.0, 0.0, 0.06), (0.06, 0.03, 0.05, 0.07), (-0.06, 0.03, -0.05, 0.07), (0.03, 0.08, 0.03, 0.09), (-0.03, 0.08, -0.03, 0.09)):
        m.cyl((x, y, R * 1.9), (x + dx, y + dy, R * 1.9 + 0.08), 0.014, 0.0, 'runner_hair', seg=5, mx=H)    # thin wisps
    # the open mouth: a dark cavity, fangs above, the lower jaw swung down on a hinge
    m.ball((0, -R * 0.62, R * 0.5), (0.115, 0.07, 0.1), 'mouth', mx=H)
    for x in (-0.07, -0.035, 0.0, 0.035, 0.07):
        m.cyl((x, -R * 0.82, R * 0.66), (x, -R * 0.82, R * 0.66 - 0.05 - 0.02 * (abs(x) < 0.05)), 0.016, 0.0, 'teeth', seg=6, mx=H)
    J = H @ trans(0, -0.04, R * 0.55) @ rotx(jaw)
    m.ball((0, -0.09, -0.045), (0.11, 0.095, 0.06), 'runner_skin', mx=J)
    m.ball((0, -0.12, 0.0), (0.09, 0.05, 0.03), 'mouth', mx=J)
    m.ball((0, -0.13, -0.01), (0.05, 0.1, 0.018), 'tongue', mx=J @ rotx(-0.2))                      # long tongue lolling out
    for x in (-0.06, -0.03, 0.0, 0.03, 0.06):
        m.cyl((x, -0.16, 0.0), (x, -0.16, 0.05 + 0.02 * (abs(x) < 0.04)), 0.014, 0.0, 'teeth', seg=6, mx=J)


def torso(m, F):
    """A skinny body: bare ribs and belly, a cropped torn tank top with a ragged hem and a bloodstain, shorts."""
    S = F['spine']
    m.ball((0, 0, 0.1), (0.155, 0.11, 0.12), 'runner_shorts', mx=S)                                # hips in shorts
    m.ball((0, 0, 0.25), (0.125, 0.09, 0.15), 'runner_skin', mx=S)                                 # skinny belly
    for z in (0.15, 0.21, 0.27):                                                                   # ribs showing through
        m.tube([(-0.115, -0.04, z), (-0.06, -0.083, z - 0.008), (0.0, -0.094, z - 0.012), (0.06, -0.083, z - 0.008), (0.115, -0.04, z)],
               0.011, 'bone', seg=6, mx=S, cap=True)
    m.ball((0.05, -0.085, 0.2), (0.045, 0.03, 0.05), 'meat', mx=S)                                 # a ripped-open patch
    m.ball((0, 0, 0.44), (0.2, 0.125, 0.19), 'runner_tank', mx=S)                                # the tank top
    for x, ln in ((-0.14, 0.09), (-0.08, 0.14), (-0.02, 0.07), (0.05, 0.13), (0.11, 0.08), (0.15, 0.1)):  # ragged hem
        y = -0.115 * math.sqrt(max(0.0, 1.0 - (x / 0.19) ** 2)) - 0.005
        m.cyl((x, y, 0.36), (x, y - 0.012, 0.36 - ln), 0.032, 0.0, 'runner_tank', seg=4, mx=S)
    m.ball((0.06, -0.1, 0.44), (0.06, 0.03, 0.08), 'blood', mx=S)                                  # bloodstain
    m.ball((-0.1, -0.1, 0.5), (0.05, 0.03, 0.04), 'meat', mx=S)                                    # a bite
    m.ball((0, 0, 0.57), (0.1, 0.08, 0.05), 'runner_skin', mx=S)                                   # neck base
    for sx in (-1, 1):                                                                             # collarbones
        m.capsule((sx * 0.03, -0.05, 0.6), (sx * 0.14, -0.04, 0.57), 0.014, 0.014, 'runner_skin_dark', mx=S)


def neck(m, F):
    m.capsule(at(F['chest'], 0, 0, 0.0), at(F['head'], 0, 0, 0.05), 0.055, 0.05, 'runner_skin')


def stump(m, F):
    C = F['chest']
    m.capsule(at(C), at(C, 0, 0, 0.07), 0.058, 0.055, 'runner_skin')
    m.ball(at(C, 0, 0, 0.08), (0.055, 0.055, 0.022), 'meat')
    m.capsule(at(C, 0, 0, 0.06), at(C, 0, 0, 0.12), 0.017, 0.015, 'bone')
    m.ball(at(C, 0.025, -0.015, 0.1), (0.028, 0.028, 0.028), 'blood')


def arm(m, F, side, cut=False):
    """A long thin arm ending in a spidery hand with four claws."""
    sh, el, ha = F['sh_' + side], F['elbow_' + side], F['hand_' + side]
    if cut:
        m.cyl(at(sh), at(el), 0.06, 0.05, 'runner_skin', seg=12)
    else:
        m.ball(at(sh), (0.08, 0.08, 0.08), 'runner_skin')
        m.capsule(at(sh), at(el), 0.06, 0.05, 'runner_skin')
    m.ball(at(el), (0.058, 0.058, 0.058), 'runner_skin_dark')
    m.capsule(at(el), at(ha), 0.05, 0.042, 'runner_skin')
    m.ball(at(ha, 0, 0, -0.035), (0.068, 0.05, 0.072), 'runner_skin')
    for i, a in enumerate((-0.6, -0.2, 0.2, 0.6)):
        k = ha @ rotz(a * 0.35) @ rotx(-0.35 - 0.1 * (i % 2))
        m.capsule(at(k, a * 0.05, -0.01, -0.06), at(k, a * 0.09, -0.02, -0.17), 0.02, 0.013, 'runner_skin')
        m.capsule(at(k, a * 0.09, -0.02, -0.17), at(k, a * 0.1, -0.02, -0.25), 0.013, 0.004, 'claw')


def leg(m, F, side, cut=False):
    """Torn shorts, a bare knobbly leg; the right foot (screen right) wears a red sneaker, the left is bare with long toes."""
    hip, kn, an = F['hip_' + side], F['knee_' + side], F['ankle_' + side]
    if cut:
        m.cyl(at(hip), at(hip, 0, 0, -0.24), 0.088, 0.084, 'runner_shorts', seg=14)
    else:
        m.capsule(at(hip), at(hip, 0, 0, -0.24), 0.088, 0.084, 'runner_shorts')
    for a in range(5):                                                                             # frayed hem
        ang = 2 * PI * a / 5
        m.cyl(at(hip, 0.075 * math.cos(ang), 0.075 * math.sin(ang), -0.22), at(hip, 0.078 * math.cos(ang), 0.078 * math.sin(ang), -0.3), 0.03, 0.0, 'runner_shorts', seg=4)
    m.capsule(at(hip, 0, 0, -0.23), at(kn), 0.07, 0.058, 'runner_skin')
    m.ball(at(kn), (0.066, 0.066, 0.066), 'runner_skin_dark')
    m.capsule(at(kn), at(an), 0.058, 0.046, 'runner_skin')
    R = an.to_3x3().to_4x4()
    if side == 'r':
        m.ball(at(an, 0, -0.06, -0.025), (0.07, 0.14, 0.06), 'runner_shoe', rot=R)
        m.box(-0.07, 0.07, -0.2, 0.07, -0.075, -0.045, 'runner_sole', mx=an, bevel=0.01)
        m.box(-0.03, 0.03, -0.1, -0.03, 0.03, 0.05, 'runner_sole', mx=an, bevel=0.005)             # tongue
    else:
        m.ball(at(an, 0, -0.05, -0.03), (0.045, 0.1, 0.035), 'runner_skin', rot=R)
        for i, x in enumerate((-0.03, -0.01, 0.015, 0.035)):
            m.capsule(at(an, x, -0.13, -0.035), at(an, x * 1.3, -0.2, -0.045), 0.013, 0.01, 'runner_skin')
            m.ball(at(an, x * 1.3, -0.205, -0.047), (0.01, 0.014, 0.01), 'claw')


def body(p, parts=('head', 'torso', 'arm_l', 'arm_r', 'leg_l', 'leg_r'), stumped=False):
    p = planted(SK, p)
    F = SK.frames(p)
    m = Mesh('runner')
    if 'torso' in parts:
        torso(m, F)
        if stumped:
            stump(m, F)
        else:
            neck(m, F)
    if 'head' in parts:
        head(m, F, jaw=p.jaw or 0.8)
    for s in ('l', 'r'):
        if 'arm_' + s in parts:
            arm(m, F, s)
        if 'leg_' + s in parts:
            leg(m, F, s)
    return m


def sprint(t):
    """A sprint: low forward lean, knees driving, arms flung back and out like wings and pumping, head up at the camera."""
    a = 2 * PI * t
    s, c = math.sin(a), math.cos(a)
    p = Pose(lean=0.42, roll=0.07 * s, twist=0.3 * s, bob=0.06 * abs(c) - 0.02, sway=0.03 * s,
             hip_l=0.2 + 0.85 * s, hip_r=0.2 - 0.85 * s,
             knee_l=0.2 + 1.3 * max(0.0, math.cos(a - 0.8)), knee_r=0.2 + 1.3 * max(0.0, math.cos(a + PI - 0.8)),
             hip_out_l=0.08, hip_out_r=0.08)
    p['sh_l'] = -0.9 + 0.55 * s
    p['sh_r'] = -0.9 - 0.55 * s
    p['sh_out_l'] = 1.15
    p['sh_out_r'] = 1.15
    p['elbow_l'] = 0.8 + 0.35 * s
    p['elbow_r'] = 0.8 - 0.35 * s
    p['head_pitch'] = -0.85
    p['head_roll'] = 0.12 * math.sin(a * 0.5 + 1)
    p['head_yaw'] = 0.15 * s
    p['jaw'] = 0.85 + 0.15 * abs(c)
    return p


def attack(i):
    """Crouch with the arms cocked back (0), leap with both claws forward and up (1), rake down (2)."""
    p = Pose(hip_l=0.35, hip_r=-0.5, knee_l=0.9, knee_r=0.5, hip_out_l=0.15, hip_out_r=0.15)
    if i == 0:
        p.update(lean=0.55, bob=-0.1, head_pitch=-0.95, jaw=0.7, sh_l=-1.0, sh_r=-1.0, sh_out_l=1.1, sh_out_r=1.1, elbow_l=0.6, elbow_r=0.6)
    elif i == 1:
        # from the camera an arm pointing at it reads as hanging down: the arm angle is relative to the leaning chest, so overshoot
        p.update(lean=0.7, bob=0.1, head_pitch=-1.1, jaw=1.1, sh_l=3.35, sh_r=3.15, sh_out_l=0.4, sh_out_r=0.35, elbow_l=0.3, elbow_r=0.45,
                 hip_l=0.9, hip_r=-0.2, knee_l=1.0, knee_r=1.0)
    else:
        p.update(lean=0.9, bob=-0.02, head_pitch=-1.0, jaw=0.9, sh_l=3.0, sh_r=2.85, sh_out_l=0.25, sh_out_r=0.2, elbow_l=1.0, elbow_r=1.0,
                 hip_l=0.7, hip_r=-0.5, knee_l=0.7, knee_r=0.5)
    return p


def build(ctx):
    ctx.anim('runner_walk', 8, lambda i: body(sprint(i / 8)))
    ctx.anim('runner_nohead', 8, lambda i: body(sprint(i / 8), parts=('torso', 'arm_l', 'arm_r', 'leg_l', 'leg_r'), stumped=True))
    ctx.anim('runner_attack', 3, lambda i: body(attack(i)))
    hx = hy = hyy = 0.0
    for i in range(8):
        F = SK.frames(planted(SK, sprint(i / 8)))
        c = F['head'] @ trans(0, 0, HEAD_R * 0.95)
        hx += c.translation.x / 8
        hy += c.translation.z / 8
        hyy += c.translation.y / 8
    ctx.anchor('head', 'runner', (hx, hyy, hy))
    ctx.value('size', 'runner_head', round(HEAD_R * 2 * bl.UNITS_PER_M, 1))
    # gibs: built around the origin so the pivot is their middle
    F0 = SK.frames(Pose())
    g = Mesh('head')
    head(g, F0, jaw=1.0, mx=trans(0, 0, -HEAD_R * 0.95) @ rotx(-0.35))
    g.ball((0, 0.02, -HEAD_R * 0.8), (0.065, 0.065, 0.03), 'meat')
    g.capsule((0, 0.02, -HEAD_R * 0.95), (0, 0.02, -HEAD_R * 0.6), 0.018, 0.018, 'bone')
    ctx.one('runner_head', g)
    a = Mesh('arm')
    Fa = SK.frames(Pose(sh_l=0.0))
    arm(a, Fa, 'l', cut=True)
    a.ball(at(Fa['sh_l']), (0.055, 0.055, 0.025), 'meat')
    a.capsule(at(Fa['sh_l']), at(Fa['sh_l'], 0, 0, 0.07), 0.017, 0.017, 'bone')
    a.transform(trans(*(-Vector(at(Fa['elbow_l'])))))
    a.transform(roty(PI / 2))
    a.transform(rotz(0.7))                   # turned so the cut end faces the camera
    ctx.one('runner_arm', a)
    lg = Mesh('leg')
    leg(lg, F0, 'r', cut=True)
    lg.ball(at(F0['hip_r']), (0.088, 0.088, 0.03), 'meat')
    lg.capsule(at(F0['hip_r']), at(F0['hip_r'], 0, 0, 0.06), 0.022, 0.022, 'bone')
    lg.transform(trans(*(-Vector(at(F0['knee_r'])))))
    lg.transform(roty(-PI / 2))
    lg.transform(rotz(0.7))
    ctx.one('runner_leg', lg)
    tr = Mesh('torso')
    torso(tr, F0)
    stump(tr, F0)
    for s in ('l', 'r'):
        tr.ball(at(F0['sh_' + s]), (0.045, 0.045, 0.045), 'meat')
    tr.ball(at(F0['spine'], 0, -0.05, 0.05), (0.14, 0.09, 0.05), 'guts')
    tr.ball(at(F0['spine'], 0, 0, 0.0), (0.14, 0.1, 0.03), 'meat')
    tr.transform(trans(0, 0, -at(F0['spine'], 0, 0, 0.3)[2]))
    tr.transform(rotx(-PI / 2 + 0.3))
    ctx.one('runner_torso', tr)
