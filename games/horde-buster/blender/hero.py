"""The hero: a chunky soldier in glossy blue armour, seen from behind, holding a white-and-blue energy blaster straight up the road.

The body is built with the shared rig (which faces -Y), then every joint frame is turned half a circle so the hero faces +Y and the
camera sees his back: the rig's 'l' side lands on screen RIGHT (the gun arm) and 'r' on screen LEFT (the bomb arm). Arms are solved
with a two-bone IK towards hand targets given in "chest space" (x screen right, y forward, z up, metres from the shoulder line), so the
rifle can stay steady while the other arm pumps, winds up and throws.

Frames (default bl.PPM px/m, pivot = the ground under the body):
  hero_idle_0..3    breathing, gun steady
  hero_run_0..7     running in place (the game moves him); boot soles flip up toward the camera
  hero_throw_0..3   the left arm throws a bomb overhand (0 wind-up with the bomb, 1 over, 2 release, 3 follow-through)
  hero_head, hero_arm, hero_leg, hero_torso   gibs (pivot = centre of mass)
Anchors: muzzle.hero (gun tip, idle), hand.hero (throwing hand at release, throw frame 2), head.hero, size.hero_head.
"""
import math

from mathutils import Matrix, Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Skeleton, Pose, planted, at

PI = math.pi
R180 = rotz(PI)

SK = Skeleton(hip_h=0.72, hip_w=0.12, thigh=0.34, shin=0.34, spine=0.44, sh_w=0.27, upper=0.27, fore=0.26, neck=0.1, ankle_h=0.1)
HR = 0.205            # head radius
GUN_LEN = 0.9         # grip to muzzle tip, in gun units
GUN_SCALE = 1.2       # a chunky toy-like rifle: it has to read at about 8 px wide

mats.define('hair_light', base='#8a5a34', base2='#b0764a', pattern='noise', pscale=14, pamt=0.6, bump=0.6)
mats.define('hero_trim', base='#a9d8ff', bevel=0.012)
mats.define('hero_sole', base='#9aa3b4', bevel=0.01)
mats.define('hero_bomb', base='#d9262d', base2='#ff6a5a', pattern='fade', z0=0.0, z1=1.0, pamt=0.2, bevel=0.02)
mats.define('hero_fuse', base='#ffb347', emit=1.0, bevel=0.005)


def frames(p):
    """Joint frames in the world the sprite is drawn in: the rig's, turned to face +Y."""
    return {k: R180 @ v for k, v in SK.frames(p).items()}


def cl(F, x, y, z):
    """A point given in chest space: x screen right, y forward (up the road), z up, from the middle of the shoulder line."""
    return Vector(at(F['chest'], -x, -y, z))


def cdir(F, x, y, z):
    return F['chest'].to_3x3() @ Vector((-x, -y, z))


def two_bone(S, T, l1, l2, pole):
    """Elbow (or knee) of a two-bone limb from S reaching T, bending toward `pole`. Returns (elbow, wrist)."""
    S, T = Vector(S), Vector(T)
    d = T - S
    dist = min(max(d.length, 0.05), (l1 + l2) * 0.995)
    n = d.normalized()
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    q = Vector(pole)
    q = q - n * q.dot(n)
    if q.length < 1e-5:
        q = n.cross(Vector((0, 0, 1)))
    q.normalize()
    return S + n * a + q * h, S + n * dist


# ------------------------------------------------------------------------------------------------ parts

def head(m, H):
    """Spiky brown hair seen from behind and above, a blue headband with a glowing buckle, ears with a cyan headset."""
    m.ball((0, 0, HR * 0.95), (HR * 0.95, HR, HR), 'skin_human', mx=H)
    m.ball((0, 0.015, HR * 1.07), (HR * 1.04, HR * 1.0, HR * 0.93), 'hair_brown', mx=H)             # hair cap
    m.ball((0, 0.1, HR * 0.78), (HR * 0.94, HR * 0.5, HR * 0.55), 'hair_brown', mx=H)                # hair down the nape
        # a swept-up crest of spiky tufts, leaning up the road (-Y in the head frame)
    for x, y, dx, dy, h, mt in ((0.0, 0.05, 0.0, -0.1, 0.1, 'hair_light'), (0.085, 0.07, 0.05, -0.07, 0.09, 'hair_brown'),
                                (-0.085, 0.07, -0.05, -0.07, 0.09, 'hair_brown'), (0.0, -0.04, 0.0, -0.11, 0.1, 'hair_light'),
                                (0.1, -0.03, 0.07, -0.06, 0.08, 'hair_brown'), (-0.1, -0.03, -0.07, -0.06, 0.08, 'hair_brown'),
                                (0.0, 0.13, 0.0, 0.05, 0.08, 'hair_brown')):
        m.cyl((x, y, HR * 1.75), (x + dx, y + dy, HR * 1.75 + h), 0.062, 0.0, mt, seg=10, mx=H)
    m.box(-0.03, 0.03, 0.192, 0.218, HR * 0.55, HR * 0.9, 'energy', mx=H, bevel=0.004)                  # light on the nape
    for sx in (-1, 1):
        m.ball((sx * HR * 0.97, 0.01, HR * 0.8), (0.03, 0.045, 0.055), 'skin_human', mx=H)           # ears
        m.ball((sx * HR * 1.03, 0.0, HR * 0.8), (0.04, 0.075, 0.075), 'armour_dark', mx=H)           # headset cups
        m.ball((sx * HR * 1.13, 0.0, HR * 0.8), (0.012, 0.035, 0.035), 'energy', mx=H)


def face(m, H, pain=1.0):
    """Eyes, brows, nose and a screaming mouth on the front (-Y) of the head. Only the head gib turns toward the camera."""
    for sx in (-1, 1):
        m.ball((sx * 0.085, -0.178, HR * 1.0), (0.05, 0.03, 0.055), 'eye_white', mx=H)
        m.ball((sx * 0.085 + sx * -0.008, -0.205, HR * 0.98), (0.022, 0.012, 0.03), 'pupil', mx=H)
        m.capsule((sx * 0.13, -0.17, HR * 1.28), (sx * 0.04, -0.19, HR * 1.18 + 0.03 * pain), 0.017, 0.017, 'hair_brown', mx=H)
    m.ball((0, -0.205, HR * 0.8), (0.03, 0.03, 0.035), 'skin_human', mx=H)
    m.ball((0, -0.17, HR * 0.4), (0.075, 0.05, 0.06), 'mouth', mx=H)
    m.box(-0.045, 0.045, -0.2, -0.185, HR * 0.5, HR * 0.57, 'teeth', mx=H)
    m.ball((0, -0.185, HR * 0.33), (0.04, 0.02, 0.02), 'tongue', mx=H)


def neck(m, F):
    m.capsule(at(F['chest'], 0, 0, -0.03), at(F['head'], 0, 0, 0.06), 0.085, 0.08, 'skin_human')
    m.ball(at(F['chest'], 0, 0.0, 0.0), (0.16, 0.12, 0.045), 'armour_dark', mx=None)               # collar


def torso(m, F):
    """Suit, chest plate, belt with pouches and a backpack with two glowing cells (the camera sees all of this)."""
    S = F['spine']
    m.ball((0, 0, 0.1), (0.2, 0.15, 0.13), 'suit', mx=S)                                          # hips
    m.ball((0, 0, 0.2), (0.235, 0.17, 0.045), 'armour_dark', mx=S)                                # belt
    m.box(-0.15, -0.05, 0.12, 0.2, 0.1, 0.22, 'gun_metal', mx=S, bevel=0.015)                     # pouches on the back of the belt
    m.box(0.05, 0.15, 0.12, 0.2, 0.1, 0.22, 'gun_metal', mx=S, bevel=0.015)
    m.ball((0, 0, 0.32), (0.26, 0.18, 0.2), 'suit', mx=S)                                         # chest
    m.ball((0, 0.075, 0.33), (0.25, 0.12, 0.2), 'armour_blue', mx=S)                              # back plate
    m.ball((0, 0.12, 0.43), (0.19, 0.06, 0.07), 'hero_trim', mx=S)                                # upper trim
    m.box(-0.012, 0.012, 0.14, 0.205, 0.17, 0.4, 'energy', mx=S)                                  # spine light strip
    # backpack: dark shell, blue frame, two glowing cells
    m.box(-0.15, 0.15, 0.17, 0.3, 0.1, 0.43, 'armour_dark', mx=S, bevel=0.03)
    m.box(-0.155, 0.155, 0.28, 0.31, 0.08, 0.125, 'armour_blue', mx=S, bevel=0.01)
    for sx in (-1, 1):
        m.cyl((sx * 0.075, 0.305, 0.16), (sx * 0.075, 0.305, 0.4), 0.042, 0.042, 'energy', seg=12, mx=S)
        m.box(sx * 0.075 - 0.056, sx * 0.075 + 0.056, 0.285, 0.305, 0.14, 0.17, 'armour_blue', mx=S, bevel=0.008)
        m.box(sx * 0.075 - 0.056, sx * 0.075 + 0.056, 0.285, 0.305, 0.39, 0.42, 'armour_blue', mx=S, bevel=0.008)
    m.cyl((0.12, 0.28, 0.4), (0.15, 0.3, 0.62), 0.012, 0.01, 'gun_metal', seg=6, mx=S)             # antenna
    m.ball((0.15, 0.3, 0.63), (0.025, 0.025, 0.025), 'energy', mx=S)


def pauldron(m, S, side):
    sx = 1.0 if side == 'l' else -1.0     # screen side: 'l' is screen right after the half turn
    o = Vector((sx * 0.03, 0.0, 0.02))
    c = Vector(S) + o
    m.ball(c, (0.155, 0.14, 0.12), 'armour_blue')
    m.ball(c + Vector((sx * 0.015, 0, 0.065)), (0.1, 0.095, 0.055), 'hero_trim')
    m.ball(c + Vector((sx * 0.075, 0, -0.03)), (0.05, 0.12, 0.09), 'armour_dark')


def arm_parts(m, S, E, T, side, fist=True, cut=False):
    """Shoulder pad, sleeve, bracer and glove along the points S (shoulder), E (elbow), T (wrist). cut: a torn-off arm (no pad)."""
    if cut:
        m.cyl(S, E, 0.075, 0.068, 'armour_dark', seg=14)
    else:
        pauldron(m, S, side)
        m.capsule(S, E, 0.075, 0.068, 'armour_dark')
    m.ball(E, (0.075, 0.075, 0.075), 'armour_blue')
    ef = Vector(E) + (Vector(T) - Vector(E)) * 0.1
    wf = Vector(T) - (Vector(T) - Vector(E)) * 0.1
    m.capsule(ef, wf, 0.082, 0.07, 'armour_blue')
    if fist:
        m.ball(T, (0.088, 0.088, 0.088), 'armour_dark')


def leg(m, F, side, cut=False):
    hip, kn, an = F['hip_' + side], F['knee_' + side], F['ankle_' + side]
    if cut:
        m.cyl(at(hip), at(kn), 0.105, 0.088, 'armour_dark', seg=14)
    else:
        m.capsule(at(hip), at(kn), 0.105, 0.088, 'armour_dark')
    m.ball(at(hip, 0.0, 0.0, -0.17), (0.112, 0.112, 0.085), 'armour_blue')                          # thigh plate
    m.ball(at(kn, 0, -0.03, 0), (0.095, 0.098, 0.098), 'armour_blue')                               # knee pad
    m.capsule(at(kn), at(an), 0.08, 0.068, 'armour_dark')
    m.capsule(at(kn, 0, 0.012, -0.1), at(an, 0, 0.012, 0.12), 0.088, 0.078, 'armour_blue')          # greave
    m.ball(at(an, 0, 0, 0.03), (0.088, 0.088, 0.07), 'hero_trim')                                   # boot cuff
    # boot pointing forward (-Y in the ankle frame) with a light sole, so the sole reads when the foot flips up
    m.ball(at(an, 0, -0.06, -0.03), (0.088, 0.145, 0.072), 'boot', rot=F['ankle_' + side].to_3x3().to_4x4())
    m.box(-0.088, 0.088, -0.215, 0.085, -0.108, -0.066, 'hero_sole', mx=F['ankle_' + side], bevel=0.014)
    m.box(-0.07, 0.07, 0.07, 0.092, -0.07, 0.02, 'armour_blue', mx=F['ankle_' + side], bevel=0.008)   # heel stripe


def gun_frame(F, roll=-0.35):
    """Matrix of the rifle: origin at the grip, +Z along the barrel, +Y the top (faces the camera), fixed to the chest."""
    G = cl(F, 0.27, 0.22, -0.1)
    d = cdir(F, 0.16, 0.32, 0.93).normalized()         # up the road and steeply up (reads as vertical on screen), leaning out a little
    toward_cam = Vector((0, -math.cos(math.radians(bl.ELEV)), math.sin(math.radians(bl.ELEV))))
    up0 = (toward_cam - d * toward_cam.dot(d)).normalized()   # the rifle's top faces the camera
    side0 = up0.cross(d)
    t = up0 * math.cos(roll) + side0 * math.sin(roll)
    x = t.cross(d)
    return Matrix(((x.x, t.x, d.x, G.x), (x.y, t.y, d.y, G.y), (x.z, t.z, d.z, G.z), (0, 0, 0, 1))) @ scale(GUN_SCALE)


def gun(m, M):
    """White-and-blue blaster with glowing cyan cells; a chunky toy-like proportion so it reads at 6 px wide."""
    m.box(-0.08, 0.08, -0.085, 0.085, -0.18, 0.4, 'gun_white', mx=M, bevel=0.028)                  # receiver
    m.box(-0.052, 0.052, -0.09, 0.07, -0.4, -0.16, 'gun_white', mx=M, bevel=0.02)                  # stock
    m.box(-0.058, 0.058, -0.095, 0.075, -0.44, -0.4, 'armour_blue', mx=M, bevel=0.012)             # butt pad
    for sx in (-1, 1):                                                                              # blue side panels with a light
        m.box(min(sx * 0.066, sx * 0.08), max(sx * 0.066, sx * 0.08), -0.05, 0.055, -0.1, 0.33, 'armour_blue', mx=M, bevel=0.01)
        m.box(min(sx * 0.078, sx * 0.086), max(sx * 0.078, sx * 0.086), -0.012, 0.03, 0.04, 0.26, 'energy', mx=M)
    m.box(-0.04, 0.04, 0.07, 0.092, -0.12, 0.38, 'gun_metal', mx=M, bevel=0.008)                     # top rail
    for z0 in (0.0, 0.12, 0.24):                                                                    # three energy cells on top
        m.box(-0.04, 0.04, 0.085, 0.112, z0 + 0.012, z0 + 0.1, 'energy', mx=M, bevel=0.008)
    m.box(-0.02, 0.02, 0.09, 0.14, 0.3, 0.34, 'gun_metal', mx=M, bevel=0.006)                        # sight
    m.box(-0.058, 0.058, -0.062, 0.062, 0.4, 0.66, 'gun_white', mx=M, bevel=0.02)                    # shroud
    m.cyl((0, 0, 0.6), (0, 0, 0.86), 0.03, 0.03, 'gun_metal', seg=12, mx=M)                          # barrel
    for z in (0.44, 0.62):
        m.cyl((0, 0, z), (0, 0, z + 0.035), 0.066, 0.066, 'energy', seg=14, mx=M)
    m.cyl((0, 0, 0.78), (0, 0, 0.9), 0.05, 0.058, 'gun_white', seg=14, mx=M)                         # muzzle emitter
    m.ball((0, 0, 0.91), (0.045, 0.045, 0.045), 'energy', mx=M)
    m.box(-0.03, 0.03, -0.24, -0.04, -0.1, 0.0, 'gun_metal', mx=M @ rotx(0.3), bevel=0.01)         # grip
    m.box(-0.04, 0.04, -0.16, -0.07, 0.14, 0.28, 'armour_blue', mx=M, bevel=0.01)                   # cell magazine
    m.box(-0.045, 0.045, -0.1, -0.072, 0.18, 0.24, 'energy', mx=M)


def bomb(m, c):
    m.ball(c, (0.1, 0.1, 0.1), 'hero_bomb')
    m.cyl(c + Vector((0, 0, 0.085)), c + Vector((0, 0, 0.125)), 0.035, 0.03, 'gun_metal', seg=10)
    m.ball(c + Vector((0, 0, 0.14)), (0.022, 0.022, 0.022), 'hero_fuse')


def body(p):
    """The hero in pose p (a Pose with optional hand targets): a list of one Mesh."""
    p = planted(SK, p)
    p['bob'] = p.get('bob', 0.0) + p.hop
    F = frames(p)
    m = Mesh('hero')
    torso(m, F)
    neck(m, F)
    head(m, F['head'])
    for s in ('l', 'r'):
        leg(m, F, s)
    # gun arm (screen right): fixed grip on the rifle
    M = gun_frame(F)
    gun(m, M)
    S = Vector(at(F['sh_l']))
    T = Vector((M @ Vector((0.0, -0.08, 0.02))))
    E, W = two_bone(S, T, SK.d['upper'], SK.d['fore'], cdir(F, 0.9, -0.5, -0.9))
    arm_parts(m, S, E, W, 'l')
    # free arm (screen left)
    S2 = Vector(at(F['sh_r']))
    tx, ty, tz = p.get('th_x', -0.3), p.get('th_y', 0.2), p.get('th_z', -0.4)
    T2 = cl(F, tx, ty, tz)
    pole = cdir(F, p.get('pl_x', -0.9), p.get('pl_y', -0.5), p.get('pl_z', -0.7))
    E2, W2 = two_bone(S2, T2, SK.d['upper'], SK.d['fore'], pole)
    arm_parts(m, S2, E2, W2, 'r')
    if p.bomb:
        bomb(m, W2 + Vector((0, 0.02, 0.1)))
    return [m]


# ------------------------------------------------------------------------------------------------ poses

def idle(t):
    s = math.sin(2 * PI * t)
    return Pose(lean=0.1 + 0.012 * s, bob=0.012 * s - 0.004, hip_l=0.16, hip_r=-0.1, knee_l=0.18, knee_r=0.12,
                hip_out_l=0.1, hip_out_r=0.1, head_pitch=-0.1 - 0.02 * s, head_yaw=0.0,
                th_x=-0.4, th_y=0.12 + 0.01 * s, th_z=-0.5 + 0.012 * s)


def run(t):
    a = 2 * PI * t
    s, c = math.sin(a), math.cos(a)
    p = Pose(lean=0.2, roll=0.03 * s, twist=0.16 * s, sway=0.02 * s,
             hip_l=0.85 * s, hip_r=-0.85 * s,
             knee_l=0.2 + 1.4 * max(0.0, math.cos(a + 0.5)) ** 1.3,
             knee_r=0.2 + 1.4 * max(0.0, math.cos(a + PI + 0.5)) ** 1.3,
             hip_out_l=0.06, hip_out_r=0.06, head_pitch=-0.12, head_roll=-0.05 * s, hop=0.05 * abs(c))
    # the free arm pumps against the legs
    p['th_x'] = -0.4
    p['th_y'] = 0.1 + 0.34 * s
    p['th_z'] = -0.44 + 0.1 * max(0.0, s)
    return p


def throw(i):
    p = Pose(lean=0.1, hip_l=0.2, hip_r=-0.2, knee_l=0.2, knee_r=0.15, hip_out_l=0.12, hip_out_r=0.12, head_pitch=-0.1, bomb=0.0)
    if i == 0:      # bomb in the hand, cocked back beside the head, elbow out
        p.update(lean=0.0, roll=-0.1, twist=-0.3, th_x=-0.34, th_y=-0.28, th_z=0.18, pl_x=-1.0, pl_y=-0.4, pl_z=0.2, bomb=1.0)
    elif i == 1:    # arm over the shoulder, hand high above the head
        p.update(lean=-0.08, roll=-0.12, twist=-0.15, th_x=-0.3, th_y=-0.02, th_z=0.58, pl_x=-1.0, pl_y=-0.6, pl_z=0.0, bomb=1.0, hip_l=0.25, hip_r=-0.28)
    elif i == 2:    # release, reaching forward and up
        p.update(lean=0.3, roll=0.06, twist=0.25, th_x=-0.42, th_y=0.55, th_z=0.58, pl_x=-0.3, pl_y=-0.4, pl_z=0.9, hip_l=0.45, hip_r=-0.32, knee_l=0.4)
    else:           # follow-through
        p.update(lean=0.38, roll=0.08, twist=0.3, th_x=-0.52, th_y=0.42, th_z=-0.02, pl_x=-0.5, pl_y=-0.3, pl_z=-0.8, hip_l=0.45, hip_r=-0.3, knee_l=0.4)
    return p


# ------------------------------------------------------------------------------------------------ build

def build(ctx):
    ctx.anim('hero_idle', 4, lambda i: body(idle(i / 4)))
    ctx.anim('hero_run', 8, lambda i: body(run(i / 8)))
    ctx.anim('hero_throw', 4, lambda i: body(throw(i)))

    # anchors from the idle pose (average over the loop) and the throw release
    muz = Vector((0, 0, 0))
    hd = Vector((0, 0, 0))
    for i in range(4):
        p = planted(SK, idle(i / 4))
        p['bob'] += p.hop
        F = frames(p)
        M = gun_frame(F)
        muz += (M @ Vector((0, 0, GUN_LEN + 0.04))) / 4
        hd += Vector(at(F['head'], 0, 0, HR * 0.95)) / 4
    ctx.anchor('muzzle', 'hero', muz)
    ctx.anchor('head', 'hero', hd)
    ctx.value('size', 'hero_head', round(HR * 2 * bl.UNITS_PER_M, 1))
    p = planted(SK, throw(2))
    F = frames(p)
    ctx.anchor('hand', 'hero', cl(F, p.th_x, p.th_y, p.th_z))

    # gibs, built around the origin so the pivot is their middle
    F0 = frames(Pose())
    Fr = SK.frames(Pose())            # the rig's own frames, facing -Y: gibs show their FRONT to the camera
    Hh = trans(0, 0, -HR * 0.95) @ rotx(-0.55)
    g = Mesh('head')
    head(g, Hh)
    face(g, Hh)
    g.ball((0, 0, -HR * 0.8), (0.07, 0.07, 0.03), 'meat', mx=rotx(-0.55) @ trans(0, 0, -0.02))
    g.capsule((0, 0, -HR * 0.95), (0, 0, -HR * 0.6), 0.025, 0.025, 'bone', mx=rotx(-0.55))
    g.ball((0.03, -0.02, -HR * 0.85), (0.04, 0.04, 0.03), 'blood', mx=rotx(-0.55))
    ctx.one('hero_head', g)

    a = Mesh('arm')
    S, E, T = Vector((-0.27, 0, 0)), Vector((0.0, -0.05, 0)), Vector((0.26, 0, 0))
    arm_parts(a, S, E, T, 'r', cut=True)
    a.ball(S, (0.035, 0.078, 0.078), 'meat')
    a.capsule(S, S - Vector((0.08, 0, 0)), 0.022, 0.022, 'bone')
    a.transform(rotz(0.7))                   # turned so the cut end faces the camera
    ctx.one('hero_arm', a)

    lg = Mesh('leg')
    leg(lg, F0, 'r', cut=True)
    lg.ball(at(F0['hip_r']), (0.1, 0.1, 0.045), 'meat')
    lg.capsule(at(F0['hip_r']), at(F0['hip_r'], 0, 0, 0.07), 0.028, 0.028, 'bone')
    lg.transform(trans(*(-Vector(at(F0['knee_r'])))))
    lg.transform(roty(-PI / 2))
    lg.transform(rotz(0.7))
    ctx.one('hero_leg', lg)

    tr = Mesh('torso')
    torso(tr, Fr)
    nk = Fr['chest']
    tr.capsule(at(nk, 0, 0, -0.03), at(nk, 0, 0, 0.07), 0.085, 0.08, 'skin_human')
    tr.ball(at(nk, 0, 0, 0.08), (0.075, 0.075, 0.025), 'meat')
    tr.capsule(at(nk, 0, 0, 0.06), at(nk, 0, 0, 0.13), 0.022, 0.02, 'bone')
    for side in ('l', 'r'):
        Sp = Vector(at(Fr['sh_' + side]))
        pauldron(tr, Sp, 'r' if side == 'l' else 'l')           # the rig is not turned here, so the sides swap
        tr.ball(Sp + Vector((-0.09 if side == 'l' else 0.09, 0, 0)), (0.07, 0.07, 0.07), 'meat')
    # the front: a chest plate torn open on a red hole with guts and ribs
    Sx = Fr['spine']
    tr.ball((0, -0.09, 0.34), (0.25, 0.1, 0.19), 'armour_blue', mx=Sx)
    tr.ball((0.02, -0.17, 0.3), (0.12, 0.05, 0.11), 'meat', mx=Sx)
    tr.ball((0.0, -0.2, 0.28), (0.09, 0.04, 0.07), 'guts', mx=Sx)
    for dz in (0.24, 0.31, 0.38):
        tr.capsule((-0.1, -0.2, dz), (0.1, -0.2, dz + 0.02), 0.014, 0.014, 'bone', mx=Sx)
    tr.ball((0, 0, 0.0), (0.17, 0.125, 0.035), 'meat', mx=Sx)                                    # the cut at the hips
    tr.capsule((-0.05, 0, -0.02), (-0.05, 0, 0.06), 0.02, 0.02, 'bone', mx=Sx)
    tr.capsule((0.06, 0.01, -0.02), (0.06, 0.01, 0.05), 0.017, 0.017, 'bone', mx=Sx)
    tr.transform(trans(0, 0, -at(Fr['spine'], 0, 0, 0.3)[2]))
    tr.transform(rotx(-PI / 2 + 0.3))
    ctx.one('hero_torso', tr)
