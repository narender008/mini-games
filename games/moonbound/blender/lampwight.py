"""Lampwight: a tall hooded wraith with three soul lanterns, a ranged caster. 2.2 m, 72 px/m, pivot = the ground under its robe.

A gaunt figure in a long hooded robe that tatters into smoke-like rags (no feet), two teal eyes burning in the hood, very long thin
arms; two iron lanterns hang by chains from its hands and a third from its belt, each with a cyan soul flame. The lanterns, their
chains and the rags are baked (swinging, trailing).

Frames (set gloamwall, 8 directions mirrored):
  lampwight_idle   8 @ 8 loop
  lampwight_drift  8 @ 8 loop      slow, 2 m/s (air = (0, +2, 0))
  lampwight_cast   10 @ 12 one-shot  0-5 raise both lanterns high and forward, 6 thrust forward (the game fires soul orbs), 7-9 lower
  lampwight_pyre   10 @ 12 one-shot  0-6 slowly lift both arms wide, 7 slam the lanterns down (the burst), 8-9 recover
  lampwight_hit    3 @ 16
  lampwight_death  10 @ 12         crumples, the lanterns drop and gutter
Codex portrait: lampwight.
Anchors (kind 'lantern', game metres [east, south, up] from the pivot, model facing south, idle frame 0): lampwight_l, lampwight_r
(the flames of the two hand lanterns, the character's left = screen right) and lampwight_belt; lampwight_cast_l / _r at frame 6 of cast.
"""
import math
import os
import random

from mathutils import Vector, Matrix

import bl
import mats
import rig
import spirits_kit as K
from bl import Mesh, trans, rotx, roty, rotz
from rig import Pose

SET = 'gloamwall'
PPM = int(os.environ.get('SPIRITS_PPM_LAMPWIGHT', os.environ.get('SPIRITS_PPM', '72')))
PI = math.pi

HEM_Z, WAIST_Z, SH_Z, HEAD_Z = 0.14, 1.12, 1.76, 1.97
SH_X = 0.2
UPPER, FORE = 0.56, 0.6
LANT_S = 1.3
CHAIN_LEN = 0.3


# ------------------------------------------------------------------------------------------------ geometry of a pose

def geom(p):
    ws, vs = 1.0 + p.ws, 1.0 - p.vs
    Troot = trans(0, 0, p.b) @ Matrix.Diagonal((ws, ws, vs, 1.0))
    piv = Vector((0, 0, WAIST_Z))
    Tt = Troot @ trans(*piv) @ rotx(p.lean) @ rotz(p.twist) @ trans(*(-piv))
    head = Tt @ trans(0, -0.02, HEAD_Z) @ rotx(p.hp) @ rotz(p.hy) @ roty(p.hr)
    G = dict(Troot=Troot, Tt=Tt, head=head, ph=p.ph, vs=p.vs)
    for side, sx in (('l', 1.0), ('r', -1.0)):
        S = Tt @ Vector((sx * SH_X, 0.0, SH_Z - 0.04))
        T = Troot @ Vector((p.get(side + 'x', sx * 0.5), p.get(side + 'y', -0.5), p.get(side + 'z', 1.1)))
        E, W = rig.two_bone(S, T, UPPER, FORE, Vector((sx * 0.45, 0.85, -0.45)))
        G['S' + side], G['E' + side], G['W' + side] = S, E, W
        f = (W - E).normalized()
        G['F' + side] = f
        G['C' + side] = W + f * 0.075 + Vector((0, 0, -0.01))
    G['belt'] = Tt @ Vector((0.215, -0.1, 1.1))
    return G


def lantern_roots(G):
    return [G['Cl'], G['Cr'], G['belt']]


# ------------------------------------------------------------------------------------------------ the rag skirt and veils

def rag_specs():
    rnd = random.Random(11)
    specs = []
    for j in range(20):                                       # smoke-like tatters from the hem
        phi = 2 * PI * j / 20 + (0.13 if j % 2 else 0.0)
        r = 0.27 if j % 2 else 0.29
        ln = 0.2 + 0.18 * rnd.random() + (0.16 if j % 5 == 1 else 0.0)
        specs.append(dict(kind='skirt', pos=(r * math.sin(phi), -r * 0.8 * math.cos(phi), HEM_Z + 0.07 + 0.05 * (j % 2)),
                          length=ln, w=0.085 - 0.014 * (j % 2), n=11))
    for j in range(8):                                        # a second tier of tatters half way up the robe
        phi = 2 * PI * j / 8 + 0.4
        r = 0.205
        specs.append(dict(kind='low', pos=(r * math.sin(phi), -r * 0.8 * math.cos(phi), 0.66),
                          length=0.24 + 0.16 * rnd.random(), w=0.05, n=8))
    for j in range(7):                                        # veil falling from the nape over the cowl
        x = (j - 3) * 0.055
        specs.append(dict(kind='veil', pos=(x, 0.205 * math.sqrt(max(1 - (x / 0.28) ** 2, 0.2)), SH_Z - 0.1),
                          length=0.5 + 0.22 * rnd.random(), w=0.06, n=11, mat='sp_rag_dim_teal'))
    for j in range(12):                                       # tatters of the cowl and robe at chest height
        phi = 2 * PI * j / 12 + 0.2
        specs.append(dict(kind='mid', pos=(0.25 * math.sin(phi), -0.2 * math.cos(phi), 1.5),
                          length=0.3 + 0.2 * rnd.random(), w=0.042, n=8))
    for side in ('l', 'r'):                                   # sleeve rags from the wrists
        for j in range(3):
            specs.append(dict(kind='cuff' + side, pos=((j - 1) * 0.03, 0.0, 0.0), length=0.3 + 0.18 * rnd.random(), w=0.04, n=9))
    for j, sp in enumerate(specs):
        sp['j'] = j
    return specs


SPECS = rag_specs()


def up_of(spec):
    x, y, _ = spec['pos']
    if spec['kind'] in ('skirt', 'mid', 'veil', 'low'):
        L = max(math.hypot(x, y), 1e-6)
        return (-y / L, x / L, 0.0)
    return (1.0, 0.0, 0.0)


def root_of(spec, G):
    k, q = spec['kind'], Vector(spec['pos'])
    if k in ('skirt', 'low'):
        r = G['Troot'] @ q
    elif k in ('veil', 'mid'):
        r = G['Tt'] @ q
    elif k.startswith('cuff'):
        r = G['W' + k[-1]] + q
    else:
        raise KeyError(k)
    j = spec['j']
    a = G['ph'] + 2.1 * j
    return r + Vector(up_of(spec)) * (0.018 * math.sin(a)) + Vector((0.0, 0.01 * math.cos(a + 0.7), 0.014 * math.sin(a + 1.3)))


IDLE_REF = Pose(lx=0.33, ly=-0.28, lz=1.0, rx=-0.33, ry=-0.28, rz=1.0)


def make_rags(gravity=1.0, drag=1.2, bend=0.08):
    rs = K.RagSim(gravity=gravity, drag=drag)
    G = geom(IDLE_REF)
    for sp in SPECS:
        rs.add(root_of(sp, G), sp['length'], n=sp['n'], w=sp['w'], up=up_of(sp), mat=sp.get('mat', 'sp_rag_teal'), bend=bend, flat=0.2)
    return rs


def make_chains():
    rs = K.RagSim(gravity=9.8, drag=0.5)
    G = geom(IDLE_REF)
    for root in lantern_roots(G):
        rs.add(root, CHAIN_LEN, n=6, w=0.01, kind='chain', bend=0.0, stiff=1.0, r=0.01)
    return rs


def colliders(G):
    T, Tt = G['Troot'], G['Tt']
    v = lambda z: tuple(T @ Vector((0, 0, z)))
    cols = [(v(0.25), v(0.5), 0.2), (v(0.5), v(0.8), 0.15), (v(0.8), v(1.1), 0.12),
            (tuple(T @ Vector((0, 0, WAIST_Z))), tuple(Tt @ Vector((0, 0, SH_Z - 0.05))), 0.13)]
    return cols


# ------------------------------------------------------------------------------------------------ drawing

mats.define('sp_robe_rune', base='#201e3a', base2='#423f7a', pattern='weave', pscale=3, pamt=0.8, seed=53, bump=0.2, bevel=0.012,
            tex='sp_runes', tex_emit=1.0)


def robe(m, G, p):
    """The long robe: pleated, tapering to the narrow chest, its hem jagged, a stole and a hem band of glowing runes."""
    T, Tt = G['Troot'], G['Tt']
    body = Mesh('robe')
    prof = [(HEM_Z, 0.3), (0.25, 0.28), (0.45, 0.235), (0.7, 0.195), (0.95, 0.16), (WAIST_Z, 0.15), (1.3, 0.16), (1.5, 0.19),
            (1.66, 0.205), (SH_Z, 0.17), (SH_Z + 0.08, 0.1)]
    body.lathe(prof, 'sp_robe_rune', bl.scale(1.0, 0.8, 1.0), seg=40, smooth=45, cap=True)
    for v in body.bm.verts:
        th = math.atan2(v.co.y / 0.8, v.co.x)
        zf = max((WAIST_Z - v.co.z) / (WAIST_Z - HEM_Z), 0.0)
        rr = 1.0 + 0.1 * zf * math.sin(7 * th + 1.7 * zf) + 0.04 * zf * math.sin(3 * th)
        v.co.x *= rr
        v.co.y *= rr
        if v.co.z < HEM_Z + 0.02:
            v.co.z -= 0.09 * abs(math.sin(5.5 * th + 0.4)) ** 0.8
        # below the waist the robe follows the root, above it the leaning torso
        w = rig.smooth((v.co.z - 0.85) / 0.45)
        q0, q1 = T @ v.co, Tt @ v.co
        v.co = q0 * (1 - w) + q1 * w
    m.add(body)
    body.free()
    # high shoulders and cowl, sloping into the hood, glowing at its hem
    cowl = [(1.5, 0.225), (1.62, 0.285), (1.72, 0.255), (1.8, 0.195), (1.86, 0.16), (1.92, 0.14)]
    m.lathe(cowl, 'sp_robe_hi', Tt @ bl.scale(1.0, 0.78, 1.0), seg=26, smooth=50, cap=True)
    ring = [(0.2255 * math.cos(a), 0.2255 * 0.78 * math.sin(a), 1.502) for a in [2 * PI * i / 30 for i in range(31)]]
    m.tube(ring, 0.0065, 'sp_trim_teal', seg=4, mx=Tt, smooth=70)
    # belt, with a hook for the third lantern
    belt = [(0.168 * math.cos(a), 0.168 * 0.75 * math.sin(a), 1.13) for a in [2 * PI * i / 24 for i in range(25)]]
    m.tube(belt, 0.017, 'sp_iron_rust', seg=6, mx=Tt, smooth=70)
    m.ball((0, -0.128, 1.13), (0.032, 0.014, 0.032), 'gold_dark', mx=Tt, seg=8, rings=5)
    m.ball((0.178, -0.1, 1.11), 0.022, 'sp_iron', mx=Tt, seg=8, rings=5)


def head(m, G, p):
    H = G['head']
    hood = K.hood_mesh(h=0.44, r_collar=0.14, r_mid=0.145, depth=1.25, open_deg=34.0, tip_back=0.17, round=0.55, trim='sp_trim_teal',
                       trim_r=0.0055)
    m.add(hood, H @ trans(0, 0.0, -0.2))
    hood.free()
    # the face is a void with two burning eyes
    m.ball((0, -0.03, 0.0), (0.082, 0.07, 0.115), 'sp_hood_in', mx=H, seg=16, rings=9)
    g = max(1.0 - p.fade, 0.0)
    if g > 0.05:
        for sx in (-1, 1):
            m.ball((sx * 0.036, -0.09, 0.03), (0.03 * g, 0.009, 0.0125 * g + 0.002), 'sp_eye', mx=H, seg=10, rings=6, rot=roty(-sx * 0.38))


def arm(m, G, p, side, sx):
    S, E, W = G['S' + side], G['E' + side], G['W' + side]
    s = max(1.0 - p.arm_s, 0.0)
    r = lambda v: v * (0.5 + 0.5 * s)
    m.ball(S, r(0.062), 'sp_robe_hi', seg=10, rings=6)
    m.capsule(S, E, r(0.058), r(0.047), 'sp_robe', seg=10, rings=3)
    m.ball(E, r(0.05), 'sp_robe', seg=10, rings=6)
    m.capsule(E, W, r(0.044), r(0.07), 'sp_robe', seg=10, rings=3)           # a long sleeve flaring to a bell cuff
    K.claw_hand(m, W + G['F' + side] * 0.02, G['F' + side] * 0.8 + Vector((0, 0, -0.3)), Vector((sx * 0.5, -0.3, 1.0)), spread=0.5,
                curl=0.75, size=1.25, mat='sp_claw_bone', claw='sp_claw_bone')


def draw_lantern(m, pts, flame, glow=1.0, rust=False):
    P = [Vector(q) for q in pts]
    K.chain_links(m, P, r=0.0085)
    d = (P[-1] - P[-2]).normalized()
    Mx = rig.frame_along(P[-1], P[-1] + d, up=(0, 0, 1))
    K.lantern(m, Mx, flame=flame, glow=glow, rust=rust, s=LANT_S)


def lantern_frame(G, chains, X):
    out = []
    for k in range(3):
        P = chains.points(X, k)
        out.append(P)
    return out


def make(p, XR, rags, XC, chains):
    G = geom(p)
    m = Mesh('lampwight')
    robe(m, G, p)
    head(m, G, p)
    arm(m, G, p, 'l', 1.0)
    arm(m, G, p, 'r', -1.0)
    off = 1.0 - p.get('veil_off', 0.0)
    rags.draw(m, XR, scales={'veil': off, 'mid': off})
    fl = p.get('flame', 1.0)
    for k in range(3):
        draw_lantern(m, [tuple(q) for q in chains.points(XC, k)], fl * (0.94 + 0.06 * math.sin(p.ph * 2 + 2 * k)), rust=False)
    return m


def flame_point(pts):
    """World point of a lantern's flame (the lantern hangs along the last chain link)."""
    P = [Vector(q) for q in pts]
    d = (P[-1] - P[-2]).normalized()
    return P[-1] + d * 0.2 * LANT_S


# ------------------------------------------------------------------------------------------------ poses

def idle_pose(u, period=1.0):
    a = 2 * PI * u / period
    return Pose(b=0.04 * math.sin(a), lean=0.03 + 0.02 * math.sin(a + 0.5), hp=0.08 + 0.04 * math.sin(a - 0.3), hy=0.07 * math.sin(a + 1.0),
                twist=0.04 * math.sin(a + 2.0),
                lx=0.34 + 0.02 * math.sin(a + 1.0), ly=-0.28 + 0.04 * math.sin(a + 0.4), lz=1.0 + 0.04 * math.sin(a + 1.0),
                rx=-0.34, ry=-0.28 + 0.04 * math.sin(a + 2.4), rz=1.0 + 0.04 * math.sin(a + 2.6))


def drift_pose(u, period=1.0):
    a = 2 * PI * u / period
    return Pose(b=0.05 * math.sin(a), lean=0.14 + 0.02 * math.sin(a + 0.4), hp=0.05, hy=0.05 * math.sin(a + 1.0), twist=0.04 * math.sin(a + 1.5),
                lx=0.38, ly=-0.2 + 0.05 * math.sin(a), lz=0.98 + 0.05 * math.sin(a + 1.0),
                rx=-0.38, ry=-0.2 + 0.05 * math.sin(a + 2.0), rz=0.98 + 0.05 * math.sin(a + 3.0))


def _arms(l, r, **kw):
    return Pose(lx=l[0], ly=l[1], lz=l[2], rx=r[0], ry=r[1], rz=r[2], **kw)


def mir(x, y, z):
    return (x, y, z), (-x, y, z)


IDLE_K = _arms(*mir(0.34, -0.28, 1.0), lean=0.03, hp=0.08, b=0.0)
CAST = [(0, IDLE_K),
        (1, _arms(*mir(0.4, -0.5, 1.3), lean=0.0, hp=0.0, b=0.01)),
        (2, _arms(*mir(0.36, -0.58, 1.6), lean=-0.06, hp=-0.1, b=0.03)),
        (3, _arms(*mir(0.32, -0.62, 1.82), lean=-0.1, hp=-0.16, b=0.05)),
        (5, _arms(*mir(0.3, -0.62, 1.96), lean=-0.14, hp=-0.2, b=0.07, twist=0.0)),
        (6, _arms(*mir(0.27, -1.05, 1.88), lean=0.24, hp=0.12, b=0.02)),
        (7, _arms(*mir(0.34, -0.85, 1.6), lean=0.18, hp=0.1, b=0.0)),
        (8, _arms(*mir(0.38, -0.6, 1.3), lean=0.1, hp=0.08, b=0.0)),
        (9, IDLE_K)]
PYRE = [(0, IDLE_K),
        (1, _arms(*mir(0.5, -0.4, 1.2), lean=0.0, hp=0.04, b=0.01)),
        (2, _arms(*mir(0.6, -0.3, 1.3), lean=-0.03, hp=0.0, b=0.02)),
        (4, _arms(*mir(0.74, -0.15, 1.6), lean=-0.08, hp=-0.1, b=0.05)),
        (6, _arms(*mir(0.82, -0.05, 1.88), lean=-0.16, hp=-0.22, b=0.08)),
        (6.6, _arms(*mir(0.82, -0.05, 1.88), lean=-0.17, hp=-0.24, b=0.085)),
        (7, _arms(*mir(0.46, -0.8, 0.8), lean=0.42, hp=0.25, b=-0.03)),
        (8, _arms(*mir(0.42, -0.6, 0.95), lean=0.2, hp=0.12, b=0.0)),
        (9, _arms(*mir(0.52, -0.55, 1.05), lean=0.08, hp=0.08, b=0.0))]
HIT = [(0, _arms(*mir(0.52, -0.15, 1.2), lean=-0.26, hp=-0.3, b=0.05, hr=0.14, twist=0.12, flame=0.7)),
       (1, _arms(*mir(0.58, 0.0, 1.3), lean=-0.34, hp=-0.36, b=0.07, hr=0.18, twist=0.16, flame=0.5)),
       (2, _arms(*mir(0.55, -0.4, 1.12), lean=-0.1, hp=0.0, b=0.02, hr=0.05, flame=0.85))]
DEATH = [(0, _arms(*mir(0.52, -0.15, 1.2), lean=-0.26, hp=-0.3, b=0.05, hr=0.14, twist=0.12, flame=0.7)),
         (1, _arms(*mir(0.6, -0.3, 1.0), lean=-0.05, hp=0.1, b=0.0, flame=0.75, veil_off=0.25)),
         (2, _arms(*mir(0.45, -0.4, 0.85), lean=0.2, hp=0.3, b=-0.03, vs=0.06, flame=0.6, veil_off=0.7)),
         (3, _arms(*mir(0.42, -0.45, 0.62), lean=0.34, hp=0.45, b=-0.06, vs=0.16, ws=0.03, flame=0.55, veil_off=1.0)),
         (4, _arms(*mir(0.4, -0.5, 0.42), lean=0.4, hp=0.55, b=-0.09, vs=0.3, ws=0.07, flame=0.45, veil_off=1.0)),
         (5, _arms(*mir(0.4, -0.5, 0.26), lean=0.4, hp=0.6, b=-0.12, vs=0.44, ws=0.12, flame=0.35, veil_off=1.0)),
         (6, _arms(*mir(0.4, -0.45, 0.14), lean=0.38, hp=0.62, b=-0.13, vs=0.58, ws=0.17, flame=0.28, veil_off=1.0)),
         (7, _arms(*mir(0.4, -0.4, 0.08), lean=0.35, hp=0.64, b=-0.14, vs=0.68, ws=0.22, flame=0.2, arm_s=0.3, veil_off=1.0)),
         (8, _arms(*mir(0.4, -0.4, 0.06), lean=0.32, hp=0.66, b=-0.14, vs=0.75, ws=0.26, flame=0.12, arm_s=0.7, fade=0.3, veil_off=1.0)),
         (9, _arms(*mir(0.4, -0.4, 0.05), lean=0.3, hp=0.68, b=-0.14, vs=0.8, ws=0.3, flame=0.05, arm_s=1.0, fade=0.8, veil_off=1.0))]


# ------------------------------------------------------------------------------------------------ building

def bake_both(rags, chains, pose_fn, times, period=None, air_fn=None, air=(0, 0, 0), settle=0.8, flutter=1.0):
    def pose_at(t):
        p = Pose(pose_fn(t))
        p['ph'] = 2 * PI * flutter * (t / period if period else t * 1.25)
        return p

    af = air_fn or (lambda t: air)
    XR = rags.bake(lambda t: [root_of(sp, geom(pose_at(t))) for sp in SPECS], lambda t: colliders(geom(pose_at(t))), af, times,
                   period=period, settle=settle)
    XC = chains.bake(lambda t: lantern_roots(geom(pose_at(t))), lambda t: colliders(geom(pose_at(t))), lambda t: (0, 0, 0), times,
                     period=period, settle=settle)
    return XR, XC, pose_at


def portrait_mesh():
    rags, chains = make_rags(), make_chains()
    pose = Pose(b=0.05, lean=-0.04, hp=0.0, hy=0.15, lx=0.62, ly=-0.55, lz=1.3, rx=-0.45, ry=-0.7, rz=1.05, ph=0.0)
    XR, XC, pose_at = bake_both(rags, chains, lambda t: pose, [0.0], settle=1.5)
    m = make(pose_at(0.0), XR[0], rags, XC[0], chains)
    m.transform(bl.facing(math.radians(110)))
    return m


def build(ctx):
    K.rag_images()
    K.register_image('sp_runes', K.rune_image(192, 192, bands=[(0.035, 0.105)], stole=(0.71, 0.79, 0.14, 0.9), seed=4))
    ppm = PPM

    def loop(name, pose_fn, n, fps, period, air=(0, 0, 0), flutter=1.0):
        rags, chains = make_rags(), make_chains()
        ts = [i / fps for i in range(n)]
        af = (lambda t: (0.3 * math.sin(2 * PI * t / period) + air[0], air[1], 0.2 * math.sin(2 * PI * 2 * t / period + 1) + air[2]))
        XR, XC, pose_at = bake_both(rags, chains, pose_fn, ts, period=period, air_fn=af, flutter=flutter)
        K.anim(ctx, name, n, lambda i: make(pose_at(ts[i]), XR[i], rags, XC[i], chains), dirs=8, mirror=True, ppm=ppm, pad=1, fps=fps, loop=True)
        return rags, chains, XC, ts, pose_at

    rags, chains, XC, ts, pose_at = loop('lampwight_idle', idle_pose, 8, 8, 1.0)
    # the lanterns' flames in the idle pose: where the game puts its lights
    if XC:
        for k, nm in enumerate(('lampwight_l', 'lampwight_r', 'lampwight_belt')):
            ctx.anchor('lantern', nm, tuple(flame_point(chains.points(XC[0], k))))
    loop('lampwight_drift', drift_pose, 8, 8, 1.0, air=(0, 2.0, 0), flutter=2.0)

    def oneshot(name, n, fps, ks, settle=0.7, anchors=None, bend=0.08, gravity=1.0, drag=1.2):
        rags, chains = make_rags(gravity, drag, bend), make_chains()
        pf = lambda t: rig.keys(t * fps, ks)
        ts = [i / fps for i in range(n)]
        XR, XC, pose_at = bake_both(rags, chains, pf, ts, settle=settle, air_fn=lambda t: (0, 0, 0))
        if anchors:
            for k, nm in enumerate(anchors[1]):
                ctx.anchor('lantern', nm, tuple(flame_point(chains.points(XC[anchors[0]], k))))
        K.anim(ctx, name, n, lambda i: make(pose_at(ts[i]), XR[i], rags, XC[i], chains), dirs=8, mirror=True, ppm=ppm, pad=1, fps=fps, loop=False)

    oneshot('lampwight_cast', 10, 12, CAST, anchors=(6, ('lampwight_cast_l', 'lampwight_cast_r')))
    oneshot('lampwight_pyre', 10, 12, PYRE)
    oneshot('lampwight_hit', 3, 16, HIT)
    oneshot('lampwight_death', 10, 12, DEATH, settle=0.4, bend=0.0, gravity=6.0, drag=0.7)
    if ctx.want('lampwight'):
        ctx.portrait('lampwight', portrait_mesh(), ppm=250)
