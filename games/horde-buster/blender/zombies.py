"""The shambler: a chunky green cartoon zombie in a torn shirt, arms out, lurching toward the camera. Also its gore parts.

Frames (48 px/m, pivot = the ground under the body):
  shambler_walk_0..7     lurching walk cycle
  shambler_nohead_0..7   the same walk with the head gone and a pumping neck stump (a decapitated body staggers on)
  shambler_attack_0..3   a two-armed overhead swipe
  shambler_head, shambler_arm, shambler_leg, shambler_torso   gibs (pivot = centre of mass)
Anchors: head.shambler (where the head's centre is on the walk frames, game units from the pivot), size.shambler_head.
"""
import math

import bl
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Skeleton, Pose, walk, planted, at

PI = math.pi

SK = Skeleton(hip_h=0.78, hip_w=0.12, thigh=0.38, shin=0.38, spine=0.46, sh_w=0.24, upper=0.3, fore=0.3, neck=0.07, ankle_h=0.07)
HEAD_R = 0.24


def head(m, F, jaw=0.35, mx=None):
    """The head in the `head` frame: a big lumpy skull, mismatched glowing eyes, an open jaw with a few teeth, a bald patch."""
    H = F['head'] if mx is None else mx
    c = (0, 0, HEAD_R * 0.95)
    m.ball(c, (HEAD_R * 0.98, HEAD_R * 0.9, HEAD_R), 'skin_zombie', mx=H)
    m.ball((0.05, 0.02, HEAD_R * 1.45), (0.09, 0.08, 0.06), 'skin_zombie_pale', mx=H)          # lump on top
    m.ball((0, -0.12, HEAD_R * 1.12), (0.16, 0.06, 0.05), 'skin_zombie', mx=H)                 # heavy brow
    for sx, r in ((-1, 0.075), (1, 0.06)):                                                    # eye sockets and big mismatched eyes
        m.ball((sx * 0.09, -HEAD_R * 0.78, HEAD_R * 0.98), (r * 1.15, 0.04, r * 1.1), 'mouth', mx=H)
        m.ball((sx * 0.09, -HEAD_R * 0.84, HEAD_R * 0.97), (r * 0.85, 0.03, r * 0.85), 'eye_glow_yellow', mx=H)
        m.ball((sx * 0.09 + 0.01, -HEAD_R * 0.87, HEAD_R * 0.95), (r * 0.3, 0.02, r * 0.3), 'pupil', mx=H)
    m.ball((0, -0.19, HEAD_R * 0.8), (0.03, 0.03, 0.035), 'skin_zombie_pale', mx=H)          # nose stub
    for sx in (-1, 1):                                                                        # ears
        m.ball((sx * HEAD_R * 0.98, 0, HEAD_R * 0.95), (0.03, 0.05, 0.06), 'skin_zombie', mx=H)
    # jaw hinges at the back of the mouth and drops open
    J = H @ trans(0, -0.04, HEAD_R * 0.55) @ rotx(jaw)
    m.ball((0, -0.1, -0.04), (0.13, 0.1, 0.07), 'skin_zombie', mx=J)
    m.ball((0, -0.13, 0.0), (0.1, 0.05, 0.035), 'mouth', mx=J)
    m.ball((0, -0.13, -0.005), (0.06, 0.03, 0.02), 'tongue', mx=J)
    for i, x in enumerate((-0.06, -0.02, 0.03, 0.065)):                                       # crooked teeth
        m.box(x - 0.012, x + 0.012, -0.2, -0.17, 0.0, 0.03 + 0.008 * (i % 2), 'teeth', mx=J)
    for x in (-0.05, 0.0, 0.05):
        m.box(x - 0.012, x + 0.012, -0.2, -0.17, -0.035, 0.0, 'teeth', mx=H @ trans(0, -0.02, HEAD_R * 0.68))


def torso(m, F):
    """Belly, chest and a torn shirt with a green gut showing; a bloody bite on the shoulder."""
    S = F['spine']
    m.ball((0, 0, 0.12), (0.2, 0.15, 0.17), 'pants_brown', mx=S)                               # hips in trousers
    m.ball((0, 0, 0.3), (0.25, 0.17, 0.25), 'shirt_torn', mx=S)                                 # chest in the shirt
    m.ball((0.05, -0.12, 0.2), (0.12, 0.07, 0.1), 'skin_zombie', mx=S)                          # belly through a rip
    m.ball((0.08, -0.17, 0.18), (0.05, 0.03, 0.04), 'guts', mx=S)                               # a bit of gut poking out
    m.ball((-0.17, -0.06, 0.45), (0.07, 0.06, 0.05), 'flesh', mx=S)                             # bite wound
    m.capsule((-0.2, -0.1, 0.43), (-0.12, -0.13, 0.45), 0.012, 0.01, 'bone', mx=S)
    m.box(-0.2, 0.2, -0.16, 0.16, 0.05, 0.1, 'pants', mx=S @ scale(1.0, 0.95, 1.0), bevel=0.01)  # belt line
    m.ball((0, 0, 0.53), (0.12, 0.1, 0.06), 'skin_zombie', mx=S)                                # neck base


def neck(m, F):
    m.capsule(at(F['chest']), at(F['head'], 0, 0, 0.05), 0.08, 0.075, 'skin_zombie')


def stump(m, F):
    """Where the head was: a ring of torn skin, red meat and a white spine end."""
    C = F['chest']
    m.capsule(at(C), at(C, 0, 0, 0.07), 0.085, 0.08, 'skin_zombie')
    m.ball(at(C, 0, 0, 0.08), (0.075, 0.075, 0.025), 'meat')
    m.capsule(at(C, 0, 0, 0.06), at(C, 0, 0, 0.12), 0.022, 0.02, 'bone')
    m.ball(at(C, 0.03, -0.02, 0.1), (0.03, 0.03, 0.03), 'blood')


def arm(m, F, side):
    """Upper arm in a torn sleeve, a bare green forearm and a big three-fingered hand."""
    sh, el, ha = F['sh_' + side], F['elbow_' + side], F['hand_' + side]
    m.ball(at(sh), (0.1, 0.1, 0.1), 'shirt_torn')
    m.capsule(at(sh), at(el), 0.085, 0.07, 'shirt_torn')
    m.capsule(at(el), at(ha), 0.062, 0.055, 'skin_zombie')
    m.ball(at(ha, 0, 0, -0.04), (0.07, 0.05, 0.075), 'skin_zombie', mx=None)
    for i, a in enumerate((-0.45, 0.0, 0.45)):
        k = ha @ rotz(a * 0.4) @ rotx(-0.5)
        m.capsule(at(k, a * 0.08, -0.02, -0.06), at(k, a * 0.11, -0.03, -0.16), 0.022, 0.016, 'skin_zombie')
        m.capsule(at(k, a * 0.11, -0.03, -0.16), at(k, a * 0.12, -0.02, -0.19), 0.014, 0.008, 'claw')


def leg(m, F, side):
    hip, kn, an = F['hip_' + side], F['knee_' + side], F['ankle_' + side]
    m.capsule(at(hip), at(kn), 0.1, 0.085, 'pants_brown')
    m.capsule(at(kn), at(an), 0.08, 0.065, 'pants_brown')
    if side == 'l':
        m.capsule(at(kn, 0, -0.02, -0.15), at(an, 0, 0, 0.08), 0.05, 0.045, 'skin_zombie')  # torn trouser leg, bare shin
    # a big boot pointing forward (-Y in the ankle frame)
    m.ball(at(an, 0, -0.06, -0.035), (0.075, 0.13, 0.06), 'shoe', rot=_rot_only(an))


def _rot_only(M):
    R = M.to_3x3().to_4x4()
    return R


def body(p, parts=('head', 'torso', 'arm_l', 'arm_r', 'leg_l', 'leg_r'), stumped=False):
    """The whole zombie in pose p, as one Mesh (with only the listed parts)."""
    p = planted(SK, p)
    F = SK.frames(p)
    m = Mesh('shambler')
    if 'torso' in parts:
        torso(m, F)
        if stumped:
            stump(m, F)
        else:
            neck(m, F)
    if 'head' in parts:
        head(m, F, jaw=p.jaw or 0.35)
    for s in ('l', 'r'):
        if 'arm_' + s in parts:
            arm(m, F, s)
        if 'leg_' + s in parts:
            leg(m, F, s)
    return m


def shamble(t):
    """The lurch: short dragging steps, torso pitched forward and rolling, arms reaching out and bobbing, head lolling."""
    p = walk(t, stride=0.32, knee=0.55, arm=0.08, bob=0.035, lean=0.22, roll=0.09)
    a = 2 * PI * t
    # arms reach out and up a little: from above, an arm pointing straight at the camera reads as hanging down
    p['sh_l'] = 1.85 + 0.14 * math.sin(a + 0.6)
    p['sh_r'] = 1.7 + 0.14 * math.sin(a + 2.4)
    p['sh_out_l'] = 0.42
    p['sh_out_r'] = 0.32
    p['elbow_l'] = 0.25
    p['elbow_r'] = 0.45
    p['head_roll'] = 0.22 * math.sin(a) + 0.1
    # faces look up at the camera (which is above and in front), against the forward lean
    p['head_pitch'] = -0.75
    p['head_yaw'] = 0.12 * math.sin(a * 0.5)
    p['jaw'] = 0.3 + 0.15 * max(0.0, math.sin(a * 2))
    p['hip_out_l'] = 0.06
    p['hip_out_r'] = 0.06
    return p


def attack(i):
    """Overhead double swipe: arms up (0), crash down (1, 2), recover (3)."""
    k = (0.0, 1.0, 0.65, 0.2)[i]
    up = (1.0, 0.0, 0.0, 0.5)[i]
    p = walk(0.0, stride=0.15, knee=0.3, arm=0.0, bob=0.0, lean=0.1 + 0.35 * k, roll=0.0)
    p['sh_l'] = p['sh_r'] = 2.6 * up + 0.9 * (1 - up)
    p['elbow_l'] = p['elbow_r'] = 0.6 * up + 0.2
    p['sh_out_l'] = p['sh_out_r'] = 0.25
    p['jaw'] = 0.55
    p['head_pitch'] = -0.85 + 0.3 * k
    return p


def build(ctx):
    ctx.anim('shambler_walk', 8, lambda i: body(shamble(i / 8)))
    ctx.anim('shambler_nohead', 8, lambda i: body(shamble(i / 8), parts=('torso', 'arm_l', 'arm_r', 'leg_l', 'leg_r'), stumped=True))
    ctx.anim('shambler_attack', 4, lambda i: body(attack(i)))
    # where the head sits (averaged over the cycle) so a popped head starts in the right place
    hx = hy = 0.0
    for i in range(8):
        F = SK.frames(planted(SK, shamble(i / 8)))
        c = F['head'] @ trans(0, 0, HEAD_R * 0.95)
        hx += c.translation.x / 8
        hy += c.translation.z / 8
        hyy = c.translation.y
    ctx.anchor('head', 'shambler', (hx, hyy, hy))
    ctx.value('size', 'shambler_head', round(HEAD_R * 2 * bl.UNITS_PER_M, 1))
    # gibs: built around the origin so the pivot is their middle
    F0 = SK.frames(Pose())
    g = Mesh('head')
    head(g, F0, jaw=0.6, mx=trans(0, 0, -HEAD_R * 0.95))
    g.ball((0, 0, -HEAD_R * 0.75), (0.07, 0.07, 0.03), 'meat')
    g.capsule((0, 0, -HEAD_R * 0.9), (0, 0, -HEAD_R * 0.6), 0.02, 0.02, 'bone')
    ctx.one('shambler_head', g)
    a = Mesh('arm')
    Fa = SK.frames(Pose(sh_l=0.0))
    arm(a, Fa, 'l')
    a.ball(at(Fa['sh_l']), (0.08, 0.08, 0.04), 'meat')
    a.capsule(at(Fa['sh_l']), at(Fa['sh_l'], 0, 0, 0.06), 0.02, 0.02, 'bone')
    a.transform(trans(-at(Fa['elbow_l'])[0], -at(Fa['elbow_l'])[1], -at(Fa['elbow_l'])[2]))
    a.transform(roty(PI / 2))
    ctx.one('shambler_arm', a)
    lg = Mesh('leg')
    leg(lg, F0, 'r')
    lg.ball(at(F0['hip_r']), (0.09, 0.09, 0.04), 'meat')
    lg.capsule(at(F0['hip_r']), at(F0['hip_r'], 0, 0, 0.06), 0.025, 0.025, 'bone')
    lg.transform(trans(-at(F0['knee_r'])[0], -at(F0['knee_r'])[1], -at(F0['knee_r'])[2]))
    lg.transform(roty(-PI / 2))
    ctx.one('shambler_leg', lg)
    tr = Mesh('torso')
    torso(tr, F0)
    stump(tr, F0)
    for s, sx in (('l', -1), ('r', 1)):
        tr.ball(at(F0['sh_' + s]), (0.07, 0.07, 0.07), 'meat')
    tr.ball(at(F0['spine'], 0, -0.05, 0.05), (0.16, 0.1, 0.06), 'guts')
    tr.transform(trans(0, 0, -at(F0['spine'], 0, 0, 0.3)[2]))
    tr.transform(rotx(-PI / 2 + 0.3))
    ctx.one('shambler_torso', tr)
