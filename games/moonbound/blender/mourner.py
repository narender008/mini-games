"""Mourner: a weeping wraith that phases through you. About 1.8 m tall, no legs, floating 0.3 m off the ground; 72 px/m.

A dark hood around a pale, hollow-eyed face of soul light (with glowing tears), a pointed shoulder mantle, long thin spectral arms ending
in clawed hands, and a long skirt of translucent rags (baked strands: dark cloth that fades to pale soul light at the tips) that trail
far behind and below.

Frames (set gloamwall, 8 directions mirrored, pivot = the ground under the figure):
  mourner_idle   8 @ 10 loop      bobbing float, rags drifting, one hand to the face
  mourner_drift  8 @ 10 loop      gliding forward (the game moves it at 3.8 m/s: rags stream back, air = (0, +3.8, 0))
  mourner_lunge  6 @ 14 one-shot  0-2 rears back, arms thrown wide behind (wind-up); 3-5 streaks forward arms-first (air = +14 m/s)
  mourner_hit    3 @ 16
  mourner_death  8 @ 12           unravels and sinks into its rags (the game dissolves the last frame)
Codex portrait: mourner.
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
PPM = int(os.environ.get('SPIRITS_PPM_MOURNER', os.environ.get('SPIRITS_PPM', '72')))
PI = math.pi

FLOAT = 0.3
WAIST_Z, SH_Z, HEAD_Z = 0.5, 1.0, 1.2
SH_X = 0.19
UPPER, FORE = 0.42, 0.46


# ------------------------------------------------------------------------------------------------ geometry of a pose

def geom(p):
    """Joint frames and points of the figure for pose p (a Pose; see the animation functions for the fields)."""
    ws, vs = 1.0 + p.ws, 1.0 - p.vs
    Troot = trans(0, 0, FLOAT + p.b) @ Matrix.Diagonal((ws, ws, vs, 1.0))
    piv = Vector((0, 0, WAIST_Z))
    Tt = Troot @ trans(*piv) @ rotx(p.lean) @ rotz(p.twist) @ trans(*(-piv))
    head = Tt @ trans(0, -0.012, HEAD_Z) @ rotx(p.hp) @ rotz(p.hy) @ roty(p.hr)
    G = dict(Troot=Troot, Tt=Tt, head=head, ph=p.ph, vs=p.vs)
    for side, sx in (('l', 1.0), ('r', -1.0)):
        S = Tt @ Vector((sx * SH_X, 0.0, SH_Z))
        T = Troot @ Vector((p.get(side + 'x', sx * 0.2), p.get(side + 'y', -0.3), p.get(side + 'z', 0.9)))
        pole = Vector((sx * 0.5, 0.9, -0.55))
        E, W = rig.two_bone(S, T, UPPER, FORE, pole)
        G['S' + side], G['E' + side], G['W' + side] = S, E, W
    return G


# ------------------------------------------------------------------------------------------------ the rag skirt and veils

def rag_specs():
    """Fixed list of strands. Roots are resolved per pose by `root_of`."""
    rnd = random.Random(7)
    specs = []
    for j in range(14):                                       # the skirt: broad rags in two staggered rings round the waist
        phi = 2 * PI * j / 14 + (0.22 if j % 2 else 0.0)
        r = 0.088 if j % 2 else 0.112
        ln = 0.5 + 0.22 * rnd.random()
        if j in (1, 6, 11):
            ln = 0.95 + 0.12 * rnd.random()                   # a few long tail rags trailing far behind and below
        specs.append(dict(kind='skirt', pos=(r * math.sin(phi), -r * math.cos(phi), WAIST_Z + 0.015 * (j % 2)),
                          length=ln, w=0.095 - 0.015 * (j % 2), n=12))
    for j in range(6):                                        # tatters of the mantle
        phi = 2 * PI * j / 6 + 0.5
        specs.append(dict(kind='shawl', pos=(0.215 * math.sin(phi), -0.17 * math.cos(phi), 0.82),
                          length=0.3 + 0.16 * rnd.random(), w=0.05, n=8))
    for side in ('l', 'r'):                                   # long sleeve rags hanging from the elbows
        for j in range(2):
            specs.append(dict(kind='elbow' + side, pos=((j - 0.5) * 0.03, 0.0, 0.0), length=0.42 + 0.14 * rnd.random(), w=0.042, n=9))
    for j, sp in enumerate(specs):
        sp['j'] = j
    return specs


SPECS = rag_specs()


def root_of(spec, G):
    k, q = spec['kind'], Vector(spec['pos'])
    if k == 'skirt':
        r = G['Troot'] @ q
    elif k == 'shawl':
        r = G['Tt'] @ q
    elif k.startswith('elbow'):
        r = G['E' + k[-1]] + q
    elif k.startswith('wrist'):
        r = G['W' + k[-1]] + q
    else:
        raise KeyError(k)
    # each rag's root flutters a little out of step with its neighbours, so waves run down the rags
    j = spec['j']
    a = G['ph'] + 2.1 * j
    return r + Vector(up_of(spec)) * (0.02 * math.sin(a)) + Vector((0.0, 0.012 * math.cos(a * 1.0 + 0.7), 0.018 * math.sin(a + 1.3)))


def up_of(spec):
    x, y, _ = spec['pos']
    if spec['kind'] in ('skirt', 'shawl'):
        L = max(math.hypot(x, y), 1e-6)
        return (-y / L, x / L, 0.0)
    return (1.0, 0.0, 0.0)


def make_sim(gravity=1.6, drag=1.3, bend=0.08):
    rs = K.RagSim(gravity=gravity, drag=drag)
    G = geom(IDLE_REF)
    for sp in SPECS:
        rs.add(root_of(sp, G), sp['length'], n=sp['n'], w=sp['w'], up=up_of(sp), mat='sp_rag', bend=bend, flat=0.2)
    return rs


IDLE_REF = Pose(lx=0.3, ly=-0.4, lz=0.62, rx=-0.12, ry=-0.34, rz=0.8)


def colliders(G):
    T, Tt = G['Troot'], G['Tt']
    cols = [(tuple(T @ Vector((0, 0, WAIST_Z - 0.2))), tuple(T @ Vector((0, 0, WAIST_Z + 0.1))), 0.07),
            (tuple(T @ Vector((0, 0, WAIST_Z + 0.1))), tuple(Tt @ Vector((0, 0, SH_Z))), 0.135)]
    return cols


# ------------------------------------------------------------------------------------------------ drawing

def torso(m, G, p):
    Tt = G['Tt']
    prof = [(0.44, 0.07), (0.5, 0.1), (0.64, 0.112), (0.8, 0.145), (0.92, 0.185), (1.0, 0.17), (1.07, 0.1)]
    m.lathe(prof, 'sp_robe', Tt @ bl.scale(1.0, 0.74, 1.0), seg=20, smooth=60, cap=True)
    # shoulder mantle with a glowing hem
    mant = [(0.8, 0.215), (0.9, 0.262), (1.0, 0.245), (1.07, 0.19), (1.14, 0.115), (1.18, 0.09)]
    m.lathe(mant, 'sp_robe_hi', Tt @ bl.scale(1.0, 0.8, 1.0), seg=22, smooth=55, cap=True)
    ring = [(0.2155 * math.cos(a), 0.2155 * 0.8 * math.sin(a), 0.802) for a in [2 * PI * i / 26 for i in range(27)]]
    m.tube(ring, 0.006, 'sp_trim', seg=4, mx=Tt, smooth=70)
    # cowl folds on the chest: two dark drapes crossing, hinting at a woman's shape
    for sx in (-1, 1):
        m.tube([(sx * 0.1, -0.14, 1.02), (sx * 0.06, -0.15, 0.86), (sx * 0.02, -0.13, 0.7)], [0.045, 0.036, 0.02], 'sp_robe_hi',
               seg=6, mx=Tt, flat=0.5, smooth=70)


def head(m, G, p):
    H = G['head']
    hood = K.hood_mesh(h=0.46, r_collar=0.155, r_mid=0.15, depth=1.18, open_deg=44.0, tip_back=0.12)
    m.add(hood, H @ trans(0, 0.0, -0.16))
    hood.free()
    g = max(1.0 - p.fade, 0.0)
    if g < 0.05:
        return
    S = bl.scale(g ** 0.4, 1.0, g ** 0.4)
    m.ball((0, -0.045, -0.004), (0.073, 0.058, 0.109), 'sp_face', mx=H @ S, seg=18, rings=10)
    m.ball((0, -0.07, -0.092), (0.034, 0.028, 0.044), 'sp_face', mx=H @ S, seg=10, rings=6)           # chin
    for sx in (-1, 1):
        m.ball((sx * 0.052, -0.07, -0.03), (0.018, 0.018, 0.015), 'sp_face', mx=H @ S, seg=8, rings=5)   # cheekbone
        # sunken, down-slanting eyes
        m.ball((sx * 0.032, -0.1, 0.02), (0.0145, 0.012, 0.034), 'sp_hood_in', mx=H @ S, seg=10, rings=6, rot=roty(-sx * 0.42))
        # tears running down the cheeks
        m.tube([(sx * 0.037, -0.102, -0.008), (sx * 0.044, -0.104, -0.044), (sx * 0.049, -0.096, -0.088)], [0.0058, 0.0048, 0.002],
               'sp_trim', seg=4, mx=H @ S, smooth=70)
    m.ball((0, -0.108, -0.062), (0.011 + 0.006 * p.wail, 0.01, 0.02 + 0.02 * p.wail), 'sp_hood_in', mx=H @ S, seg=10, rings=6)
    m.ball((0, -0.108, -0.02), (0.008, 0.008, 0.016), 'sp_ghostflesh', mx=H @ S, seg=6, rings=4)


def arm(m, G, p, side, sx):
    S, E, W = G['S' + side], G['E' + side], G['W' + side]
    s = max(1.0 - p.arm_s, 0.0)
    if s < 0.05:
        return
    r = lambda v: v * (0.4 + 0.6 * s)
    m.ball(S, r(0.062), 'sp_robe_hi', seg=10, rings=6)
    m.capsule(S, E, r(0.056), r(0.046), 'sp_robe', seg=10, rings=3)
    m.ball(E, r(0.05), 'sp_robe', seg=10, rings=6)
    m.capsule(E, W, r(0.034), r(0.021), 'sp_ghostflesh', seg=10, rings=3)
    m.ball(W, r(0.026), 'sp_ghostflesh', seg=8, rings=5)
    fd = (W - E).normalized()
    if s > 0.3:
        down = Vector((0, 0, -1))
        f = (fd * 0.75 + down * 0.35 + Vector((0, -0.25, 0))).normalized()
        dorsal = Vector((sx * 0.4, 0.1, 1.0))
        K.claw_hand(m, W, f, dorsal, spread=0.42, curl=p.curl, size=1.28 * (0.6 + 0.4 * s))


def make(p, X, rs):
    G = geom(p)
    m = Mesh('mourner')
    torso(m, G, p)
    head(m, G, p)
    arm(m, G, p, 'l', 1.0)
    arm(m, G, p, 'r', -1.0)
    off = 1.0 - p.get('rag_off', 0.0)
    rs.draw(m, X, scales={'elbowl': off, 'elbowr': off})
    return m


# ------------------------------------------------------------------------------------------------ animation poses

def idle_pose(u, period=0.8):
    a = 2 * PI * u / period
    return Pose(b=0.045 * math.sin(a), lean=0.05 + 0.025 * math.sin(a + 0.6), hp=0.2 + 0.05 * math.sin(a - 0.3),
                hy=0.09 * math.sin(a + 1.0), hr=0.04 * math.sin(a), twist=0.05 * math.sin(a + 2.0),
                lx=0.3, ly=-0.4 + 0.03 * math.sin(a + 1.0), lz=0.62 + 0.04 * math.sin(a + 1.0),
                rx=-0.12, ry=-0.34 + 0.02 * math.sin(a), rz=0.8 + 0.03 * math.sin(a), curl=0.55 + 0.1 * math.sin(a), wail=0.3)


def drift_pose(u, period=0.8):
    a = 2 * PI * u / period
    return Pose(b=0.05 * math.sin(a), lean=0.3 + 0.03 * math.sin(a + 0.4), hp=0.04 + 0.03 * math.sin(a), hy=0.06 * math.sin(a + 1.0),
                twist=0.06 * math.sin(a + 1.5),
                lx=0.4, ly=0.2 + 0.04 * math.sin(a), lz=0.78 + 0.06 * math.sin(a + 1.0),
                rx=-0.4, ry=0.2 + 0.04 * math.sin(a + 2.0), rz=0.78 + 0.06 * math.sin(a + 3.0), curl=0.3, wail=0.5)


def _arms(lx, ly, lz, rx, ry, rz, **kw):
    return Pose(lx=lx, ly=ly, lz=lz, rx=rx, ry=ry, rz=rz, **kw)


LUNGE = [(0, _arms(0.5, 0.05, 1.05, -0.5, 0.05, 1.05, lean=-0.14, b=0.04, hp=-0.1, curl=0.25, wail=0.5)),
         (1, _arms(0.62, 0.22, 1.25, -0.62, 0.22, 1.25, lean=-0.34, b=0.09, hp=-0.22, curl=0.2, wail=0.8)),
         (2.6, _arms(0.66, 0.3, 1.35, -0.66, 0.3, 1.35, lean=-0.45, b=0.11, hp=-0.28, curl=0.25, wail=1.0, twist=0.06)),
         (3, _arms(0.2, -0.95, 0.92, -0.2, -0.95, 0.92, lean=0.55, b=0.0, hp=0.12, curl=0.05, wail=1.0)),
         (4, _arms(0.34, -1.05, 0.82, -0.34, -1.05, 0.82, lean=0.62, b=-0.02, hp=0.14, curl=0.05, wail=1.0)),
         (5, _arms(0.3, -0.85, 0.78, -0.3, -0.85, 0.78, lean=0.48, b=0.0, hp=0.1, curl=0.2, wail=0.8))]

HIT = [(0, _arms(0.5, 0.05, 0.86, -0.5, 0.05, 0.86, lean=-0.3, b=0.05, hp=-0.32, curl=0.2, wail=1.0, hr=0.15, twist=0.1)),
       (1, _arms(0.62, 0.15, 1.0, -0.62, 0.15, 1.0, lean=-0.4, b=0.075, hp=-0.38, curl=0.2, wail=1.0, hr=0.2, twist=0.14)),
       (2, _arms(0.4, -0.15, 0.78, -0.3, -0.2, 0.86, lean=-0.1, b=0.03, hp=0.05, curl=0.4, wail=0.6))]

DEATH = [(0, _arms(0.5, 0.05, 0.86, -0.5, 0.05, 0.86, lean=-0.3, b=0.05, hp=-0.3, curl=0.2, wail=1.0, hr=0.15)),
         (1, _arms(0.5, 0.0, 0.66, -0.5, 0.0, 0.66, lean=-0.05, b=0.0, hp=0.15, curl=0.3, wail=1.0, vs=0.05)),
         (2, _arms(0.42, -0.1, 0.4, -0.42, -0.1, 0.4, lean=0.2, b=-0.05, hp=0.4, curl=0.4, wail=1.0, vs=0.14, ws=0.05, rag_off=0.5)),
         (3, _arms(0.4, -0.15, 0.3, -0.4, -0.15, 0.3, lean=0.28, b=-0.1, hp=0.55, curl=0.5, wail=1.0, vs=0.28, ws=0.1, rag_off=1.0)),
         (4, _arms(0.42, -0.2, 0.25, -0.42, -0.2, 0.25, lean=0.3, b=-0.16, hp=0.62, curl=0.6, wail=1.0, vs=0.45, ws=0.2, rag_off=1.0)),
         (5, _arms(0.44, -0.2, 0.14, -0.44, -0.2, 0.14, lean=0.3, b=-0.22, hp=0.66, curl=0.7, vs=0.58, ws=0.3, arm_s=0.55, fade=0.1, rag_off=1.0)),
         (6, _arms(0.46, -0.2, 0.08, -0.46, -0.2, 0.08, lean=0.3, b=-0.27, hp=0.7, curl=0.8, vs=0.7, ws=0.4, arm_s=0.85, fade=0.45, rag_off=1.0)),
         (7, _arms(0.46, -0.2, 0.05, -0.46, -0.2, 0.05, lean=0.3, b=-0.3, hp=0.72, curl=0.8, vs=0.78, ws=0.5, arm_s=1.0, fade=0.8, rag_off=1.0))]


def keyed(ks):
    return lambda f: rig.keys(f, ks)


# ------------------------------------------------------------------------------------------------ building

def bake(rs, pose_fn, times, period=None, air=(0, 0, 0), settle=0.8, air_fn=None, flutter=1.0):
    """Bake the strands. The pose given to the geometry carries a flutter phase: whole turns per `period` for loops (so they loop),
    a steady rate otherwise."""
    def pose_at(t):
        p = Pose(pose_fn(t))
        p['ph'] = 2 * PI * flutter * (t / period if period else t * 1.25)
        return p

    def roots(t):
        G = geom(pose_at(t))
        return [root_of(sp, G) for sp in SPECS]

    return rs.bake(roots, lambda t: colliders(geom(pose_at(t))), air_fn or (lambda t: air), times, period=period, settle=settle)


def flutter_air(period, amp=0.5):
    return lambda t: (amp * math.sin(2 * PI * t / period), amp * 0.6 * math.cos(2 * PI * t / period + 1.0), 0.0)


def portrait_mesh():
    rs = make_sim()
    pose = Pose(b=0.05, lean=0.08, hp=0.1, hy=0.2, hr=0.05, lx=0.55, ly=-0.75, lz=0.8, rx=-0.35, ry=-0.6, rz=1.1, curl=0.35,
                wail=0.8)
    sims = bake(rs, lambda t: pose, [0.0], settle=1.2)
    m = make(pose, sims[0], rs)
    m.transform(bl.facing(math.radians(110)))
    return m


def build(ctx):
    K.rag_images()
    ppm = PPM

    # ---- idle and drift: looping
    rs = make_sim(1.6, 1.3)
    n, fps = 8, 10
    ts = [i / fps for i in range(n)]
    sims = bake(rs, idle_pose, ts, period=n / fps, air_fn=flutter_air(n / fps, 0.45))
    K.anim(ctx, 'mourner_idle', n, lambda i: make(idle_pose(ts[i]), sims[i], rs), dirs=8, mirror=True, ppm=ppm, pad=1, fps=fps, loop=True)

    rs = make_sim(1.6, 1.3)
    sims = bake(rs, drift_pose, ts, period=n / fps, flutter=2.0,
                air_fn=lambda t: (0.7 * math.sin(2 * PI * t / (n / fps)), 3.8, 0.5 * math.sin(2 * PI * 2 * t / (n / fps) + 1.0)))
    K.anim(ctx, 'mourner_drift', n, lambda i: make(drift_pose(ts[i]), sims[i], rs), dirs=8, mirror=True, ppm=ppm, pad=1, fps=fps, loop=True)

    # ---- one-shots
    def oneshot(name, n, fps, ks, air_from=None, air=0.0, settle=0.7, bend=0.08, gravity=1.6, drag=1.3):
        rs = make_sim(gravity, drag, bend)
        pf = lambda t: rig.keys(t * fps, ks)
        ts = [i / fps for i in range(n)]
        air_fn = (lambda t: (0, air if t >= (air_from - 0.2) / fps else 0.0, 0)) if air_from is not None else None
        sims = bake(rs, pf, ts, air_fn=air_fn, settle=settle)
        K.anim(ctx, name, n, lambda i: make(pf(ts[i]), sims[i], rs), dirs=8, mirror=True, ppm=ppm, pad=1, fps=fps, loop=False)

    oneshot('mourner_lunge', 6, 14, LUNGE, air_from=3, air=14.0)
    oneshot('mourner_hit', 3, 16, HIT)
    oneshot('mourner_death', 8, 12, DEATH, settle=0.4, bend=0.0, gravity=6.0, drag=0.7)
    if ctx.want('mourner'):
        ctx.portrait('mourner', portrait_mesh(), ppm=300)
