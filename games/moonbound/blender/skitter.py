"""Skitterskull: a skull-faced spider that swarms. About 0.5 m tall, a metre across its legs, 72 px/m, pivot = the ground under its body.

A human-sized skull (cracked cranium, deep sockets lit with teal soul light, a hinged jaw with fangs) sits at the front of a violet-black
chitin body ridged with bone; eight long jointed legs end in hooked bone claws. Legs are two-bone IK from the body to ground targets,
walked in an alternating-tetrapod gait.

Frames (set gloamwall, 8 directions mirrored):
  skitter_idle    4 @ 10 loop      legs twitch, jaw flexes
  skitter_scuttle 6 @ 20 loop      fast alternating-tetrapod gait (the game moves it at 5.5 m/s)
  skitter_leap    6 @ 14 one-shot  0-1 crouch, 2-4 airborne (body high, legs reaching forward, jaw wide), 5 land
  skitter_hit     2 @ 16
  skitter_death   5 @ 14           legs curl up and it flips onto its back
Codex portrait: skitter.
"""
import math
import os

from mathutils import Vector

import bl
import mats
import rig
import spirits_kit as K
from bl import Mesh, trans, rotx, roty, rotz

SET = 'gloamwall'
PPM = int(os.environ.get('SPIRITS_PPM_SKITTER', os.environ.get('SPIRITS_PPM', '72')))
PI = math.pi

L1, L2 = 0.23, 0.33                  # femur, tibia
HIP_X, HIP_Z = 0.14, 0.27            # where the legs leave the thorax
HIP_Y = [-0.2, -0.1, 0.0, 0.1]
REST = [(0.34, -0.44), (0.48, -0.21), (0.49, 0.06), (0.38, 0.32)]    # ankle |x|, y on the ground
ANKLE_Z = 0.075
CENTRE = Vector((0, -0.02, 0.27))    # the body turns about this point
SKULL_S = 1.42


def body_matrix(x=0.0, y=0.0, z=0.0, pitch=0.0, roll=0.0, yaw=0.0):
    """Body frame: lifted by z, turned about the thorax centre. pitch > 0 dips the nose; roll > 0 rolls onto its right."""
    return trans(x, y, z) @ trans(*CENTRE) @ rotz(yaw) @ rotx(pitch) @ roty(roll) @ trans(*(-CENTRE))


def rib(m, A, yy, rx, rz, a0, a1, r, mat='sp_bone', n=8):
    """A bone ridge round the abdomen at height-along-body yy (frame A): an arc from angle a0 to a1 (0 = the dorsal midline)."""
    pts = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / (n - 1)
        pts.append((rx * math.sin(a) * 1.035, yy, rz * math.cos(a) * 1.035))
    m.tube(pts, [r * (0.55 + 0.45 * math.sin(PI * i / (n - 1))) for i in range(n)], mat, seg=6, mx=A, smooth=70, cap=True)


def body(m, B, jaw=0.2, glow=1.0, skull_pitch=-0.3, skull_yaw=0.0, belly=True):
    # thorax, carapace plate, collar
    m.ball((0, -0.04, 0.27), (0.155, 0.175, 0.115), 'sp_chitin', mx=B, seg=18, rings=10)
    m.ball((0, -0.07, 0.305), (0.118, 0.13, 0.062), 'sp_chitin_hi', mx=B, seg=16, rings=8)
    m.ball((0, -0.2, 0.25), (0.105, 0.075, 0.095), 'sp_chitin_dark', mx=B, seg=12, rings=7)
    m.ball((0, -0.03, 0.2), (0.1, 0.12, 0.05), 'sp_bone', mx=B, seg=12, rings=6)                       # sternum
    # abdomen, tipped up behind: dark chitin banded into plates, a bone spine along the back, thin ridges down the flanks
    A = B @ trans(0, 0.17, 0.31) @ rotx(0.3)
    rx0, ry0, rz0 = 0.165, 0.215, 0.155
    m.ball((0, 0, 0), (rx0, ry0, rz0), 'sp_chitin_dark', mx=A, seg=22, rings=12)
    for t in (-0.7, -0.4, -0.1, 0.2, 0.5, 0.78):
        s = math.sqrt(1 - t * t)
        yy = t * ry0
        wd = 0.052 - 0.01 * abs(t)
        m.ball((0, yy, 0), (rx0 * s * 1.035, wd, rz0 * s * 1.035), 'sp_chitin_hi' if int(t * 10) % 2 else 'sp_chitin', mx=A,
               seg=18, rings=8)
        h = 0.06 + 0.06 * (1 - abs(t))
        K.spike(m, (0, yy, rz0 * s * 1.0), (0, yy + 0.045, rz0 * s + h), 0.022 * (0.6 + 0.4 * s), 'sp_bone', mx=A)
        for sx in (-1, 1):
            a = 0.95
            p = (sx * rx0 * s * math.sin(a) * 1.02, yy, rz0 * s * math.cos(a) * 1.02)
            K.spike(m, p, (p[0] + sx * 0.06, yy + 0.03, p[2] + 0.04), 0.011, 'sp_bone', seg=5, mx=A)
        if belly:
            rib(m, A, yy, rx0 * s, rz0 * s, 2.0, 4.3, 0.008, n=10)
    for sx in (-1, 1):
        for t in (-0.55, -0.25, 0.05, 0.35, 0.64):
            s = math.sqrt(1 - t * t)
            m.ball((sx * rx0 * s * 1.05, t * ry0, 0.0), (0.011, 0.02, 0.016), 'sp_vent', mx=A, seg=8, rings=5)
        # curved horns sweeping up and back from the shoulders
        K.curved_spike(m, [(sx * 0.07, -0.02, 0.35), (sx * 0.115, 0.0, 0.42), (sx * 0.125, 0.06, 0.48), (sx * 0.095, 0.135, 0.5)],
                       0.024, 'sp_bone', seg=6, mx=B)
    # the skull, tilted up toward the viewer
    S = B @ trans(0, -0.27, 0.255) @ rotz(skull_yaw) @ rotx(skull_pitch) @ bl.scale(SKULL_S)
    K.skull(m, S, jaw=jaw, glow=glow)


def leg(m, B, k, sx, target, thick=1.0, curl=0.0):
    """One leg from its root on the thorax to an ankle target (world); the knee rises above the chord like a spider's."""
    R = B.to_3x3()
    root = B @ Vector((sx * 0.085, HIP_Y[k], HIP_Z - 0.01))
    hip = B @ Vector((sx * HIP_X, HIP_Y[k], HIP_Z + 0.015))
    pole = (R @ Vector((sx * (0.5 + 0.7 * curl), -0.3 * curl * (1.5 - k) * 0.5, 1.0 - 1.7 * curl))).normalized()
    knee, ank = rig.two_bone(hip, Vector(target), L1, L2, pole)
    t = thick
    m.capsule(root, hip, 0.042 * t, 0.038 * t, 'sp_chitin_dark', seg=10, rings=3)
    m.ball(hip, 0.04 * t, 'sp_chitin_hi', seg=10, rings=6)
    m.capsule(hip, knee, 0.033 * t, 0.027 * t, 'sp_chitin_hi', seg=10, rings=3)
    f = (knee - hip)
    for u in (0.55,):                           # a spur along the femur
        p = hip + f * u
        n = (R @ Vector((sx * 0.45, 0, 1))).normalized()
        K.spike(m, p + n * 0.02, p + n * 0.075 + f.normalized() * 0.03, 0.014 * t, 'sp_bone', seg=5)
    m.ball(knee, 0.037 * t, 'sp_bone', seg=10, rings=6)
    out = (knee - (hip + ank) * 0.5)
    out = out.normalized() if out.length > 1e-4 else Vector((0, 0, 1))
    K.spike(m, knee + out * 0.02, knee + out * (0.105 - 0.05 * curl), 0.019 * t, 'sp_bone', seg=6)                    # knee spike
    m.capsule(knee, ank, 0.026 * t, 0.012 * t, 'sp_chitin', seg=8, rings=3)
    dt = (ank - knee).normalized()
    for u in (0.35, 0.62):
        p = knee + (ank - knee) * u
        side = dt.cross(Vector((0, 0, 1)))
        side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0))
        K.spike(m, p, p + (out * 0.7 + side * 0.0).normalized() * 0.045 + dt * 0.012, 0.009 * t, 'sp_bone', seg=5)
    # the hooked bone claw, curving in toward the body
    h = Vector((dt.x, dt.y, 0.0))
    h = h.normalized() if h.length > 1e-4 else Vector((sx, 0, 0))
    down = Vector((0, 0, -1))
    pts = [ank, ank + dt * 0.045, ank + dt * 0.078 - h * 0.018, ank + dt * 0.088 - h * 0.056 + down * 0.012]
    m.tube(pts, [0.0125 * t, 0.0105 * t, 0.007 * t, 0.0012], 'sp_bone', seg=6, smooth=70, cap=True)


def ground(k, sx, dx=0.0, dy=0.0, dz=0.0):
    x, y = REST[k]
    return Vector((sx * x + dx * sx, y + dy, ANKLE_Z + dz))


def build_frame(B, targets, jaw=0.2, glow=1.0, skull_pitch=-0.3, skull_yaw=0.0, curl=0.0, belly=True):
    """targets[(k, sx)] = world ankle point."""
    m = Mesh('skitter')
    body(m, B, jaw, glow, skull_pitch, skull_yaw, belly)
    for k in range(4):
        for sx in (-1, 1):
            leg(m, B, k, sx, targets[(k, sx)], 1.22 - 0.07 * k, curl)
    return m


def rest_targets(spread=1.0):
    return {(k, sx): ground(k, sx, dx=(spread - 1.0) * REST[k][0]) for k in range(4) for sx in (-1, 1)}


# ------------------------------------------------------------------------------------------------ gaits

def scuttle_targets(t, s=0.22, lift=0.21):
    """Alternating tetrapods: legs (0,+x) (1,-x) (2,+x) (3,-x) swing together, the others half a cycle later."""
    out = {}
    for k in range(4):
        for sx in (-1, 1):
            grp = (k + (0 if sx > 0 else 1)) % 2
            u = (t + 0.5 * grp) % 1.0
            if u < 0.5:
                off = s * (4 * u - 1)
                lf = 0.0
            else:
                off = s * (3 - 4 * u)
                lf = math.sin(PI * (u - 0.5) * 2.0)
            out[(k, sx)] = ground(k, sx, dx=-0.07 * lf, dy=off, dz=lift * lf)
    return out


def idle_targets(i):
    T = rest_targets()
    twitch = {1: [((1, 1), 0.045, 0.0, 0.07), ((2, -1), 0.0, 0.0, 0.0)],
              2: [((0, 1), 0.0, 0.03, 0.0), ((3, -1), 0.0, -0.025, 0.0)],
              3: [((2, -1), 0.03, 0.02, 0.06), ((1, -1), 0.0, 0.0, 0.025)],
              0: [((3, 1), 0.0, 0.02, 0.0)]}
    for (key, dx, dy, dz) in twitch.get(i, []):
        k, sx = key
        T[key] = ground(k, sx, dx=dx, dy=dy, dz=dz)
    return T


def air_targets(front, mid, back, spread=0.0):
    """Body-local ankle targets for the airborne frames: front legs reach, back legs trail."""
    loc = [(0.3, -0.62, 0.2 + front), (0.5, -0.38, 0.1 + mid), (0.56, 0.02, 0.05 + mid), (0.34, 0.5, 0.1 + back)]
    return loc


# ------------------------------------------------------------------------------------------------ animations

def idle(i):
    t = i / 4.0
    a = 2 * PI * t
    B = body_matrix(z=0.006 * math.sin(a), roll=0.02 * math.sin(a + 1), yaw=0.03 * math.sin(a))
    jaw = [0.1, 0.36, 0.22, 0.06][i]
    return build_frame(B, idle_targets(i), jaw=jaw, skull_pitch=-0.3 + 0.05 * math.sin(a + 1.2), skull_yaw=0.14 * math.sin(a))


def scuttle(i):
    t = i / 6.0
    a = 2 * PI * t
    B = body_matrix(z=0.02 * math.cos(2 * a), roll=0.05 * math.sin(2 * a), yaw=0.08 * math.sin(a), pitch=0.07)
    jaw = 0.12 + 0.13 * abs(math.sin(a * 1.5 + 0.5))
    return build_frame(B, scuttle_targets(t), jaw=jaw, skull_pitch=-0.32 + 0.04 * math.cos(2 * a), skull_yaw=-0.09 * math.sin(a))


def leap(i):
    # (body lift, pitch, jaw, kind)
    P = [dict(z=-0.05, pitch=-0.1, jaw=0.3, y=0.02, sp=-0.25),
         dict(z=-0.1, pitch=-0.28, jaw=0.5, y=0.05, sp=-0.5),
         dict(z=0.22, pitch=-0.3, jaw=0.95, y=-0.03, sp=-0.5),
         dict(z=0.4, pitch=0.0, jaw=1.05, y=-0.06, sp=-0.35),
         dict(z=0.26, pitch=0.28, jaw=1.1, y=-0.08, sp=-0.2),
         dict(z=-0.04, pitch=-0.12, jaw=0.5, y=-0.02, sp=-0.3)][i]
    B = body_matrix(y=P['y'], z=P['z'], pitch=P['pitch'])
    if i in (0, 1):
        T = rest_targets(spread=0.82 - 0.06 * i)
        for key in T:
            T[key] = T[key] + Vector((0, 0.05 * i, 0.0))
    elif i == 5:
        T = rest_targets(spread=1.1)
        for key in T:
            T[key] = T[key] + Vector((0, -0.07, 0.0))
    else:
        loc = air_targets(0.08 if i == 2 else 0.04, 0.0, 0.0)
        if i == 4:      # reaching down to land
            loc = [(0.32, -0.62, -0.14), (0.5, -0.4, -0.18), (0.54, 0.0, -0.2), (0.36, 0.42, -0.14)]
            loc = [(x, y, z + 0.0) for x, y, z in loc]
        T = {(k, sx): B @ Vector((sx * loc[k][0], loc[k][1], loc[k][2])) for k in range(4) for sx in (-1, 1)}
        if i == 4:
            for key in T:
                T[key].z = max(T[key].z, ANKLE_Z)
    return build_frame(B, T, jaw=P['jaw'], skull_pitch=P['sp'])


def hit(i):
    P = [dict(y=0.1, z=-0.03, pitch=-0.38, jaw=0.62, sp=-0.62, spread=1.12, roll=0.08),
         dict(y=0.045, z=-0.015, pitch=-0.16, jaw=0.34, sp=-0.42, spread=1.05, roll=-0.03)][i]
    B = body_matrix(y=P['y'], z=P['z'], pitch=P['pitch'], roll=P['roll'])
    T = rest_targets(P['spread'])
    for key in T:
        T[key] = T[key] + Vector((0, 0.05 * (2 - i) * 0.6, 0))
    return build_frame(B, T, jaw=P['jaw'], skull_pitch=P['sp'])


DEATH = [dict(y=0.09, z=0.04, pitch=-0.45, roll=0.2, yaw=0.0, jaw=0.7, sp=-0.55, c=0.0),
         dict(y=0.14, z=0.24, pitch=-0.35, roll=1.0, yaw=0.25, jaw=0.9, sp=-0.5, c=0.28),
         dict(y=0.17, z=0.3, pitch=-0.2, roll=2.2, yaw=0.35, jaw=1.0, sp=-0.4, c=0.6),
         dict(y=0.17, z=-0.01, pitch=0.0, roll=PI, yaw=0.38, jaw=0.9, sp=-0.3, c=0.85),
         dict(y=0.17, z=-0.025, pitch=0.0, roll=PI, yaw=0.38, jaw=0.7, sp=-0.25, c=1.0)]


def death(i):
    P = DEATH[i]
    B = body_matrix(y=P['y'], z=P['z'], pitch=P['pitch'], roll=P['roll'], yaw=P['yaw'])
    c = P['c']
    T = {}
    for k in range(4):
        for sx in (-1, 1):
            g = ground(k, sx, dx=0.06 * (i > 0), dy=0.0, dz=0.0)
            if i == 0:
                g = g + Vector((0, 0.06, 0.03))
            # where a curled leg ends up: tucked toward the belly, in the body's own frame
            curled = B @ Vector((sx * (HIP_X - 0.05), HIP_Y[k] + 0.03 * (1.5 - k), HIP_Z - 0.13 - 0.01 * k))
            flail = B @ Vector((sx * (0.5 + 0.12 * math.sin(i * 2.1 + k)), REST[k][1] * 1.1, 0.27 + 0.14 * (1 + math.sin(i * 1.7 + k))))
            tgt = g * (1 - c) + curled * c
            if 0 < i < 3:
                tgt = tgt + (flail - tgt) * (0.55 * (1 - c))
            T[(k, sx)] = tgt
    glow = 1.0 if i < 3 else (0.7 if i == 3 else 0.45)
    return build_frame(B, T, jaw=P['jaw'], glow=glow, skull_pitch=P['sp'], curl=c)


def portrait_mesh():
    """An aggressive stance: raised on its legs, skull lifted, jaw wide."""
    B = body_matrix(y=0.02, z=0.08, pitch=-0.12)
    T = {}
    for k in range(4):
        for sx in (-1, 1):
            g = ground(k, sx, dx=0.05, dy=-0.03 if k < 2 else 0.03)
            if (k, sx) == (0, 1):
                g = ground(k, sx, dx=-0.08, dy=-0.12, dz=0.2)       # one front leg raised, clawing
            T[(k, sx)] = g
    m = build_frame(B, T, jaw=0.62, skull_pitch=-0.42)
    m.transform(bl.facing(math.radians(110)))
    return m


def build(ctx):
    K.rag_images()
    ppm = PPM
    K.anim(ctx, 'skitter_idle', 4, idle, dirs=8, mirror=True, ppm=ppm, pad=1, fps=10, loop=True)
    K.anim(ctx, 'skitter_scuttle', 6, scuttle, dirs=8, mirror=True, ppm=ppm, pad=1, fps=20, loop=True)
    K.anim(ctx, 'skitter_leap', 6, leap, dirs=8, mirror=True, ppm=ppm, pad=1, fps=14, loop=False)
    K.anim(ctx, 'skitter_hit', 2, hit, dirs=8, mirror=True, ppm=ppm, pad=1, fps=16, loop=False)
    K.anim(ctx, 'skitter_death', 5, death, dirs=8, mirror=True, ppm=ppm, pad=1, fps=14, loop=False)
    if ctx.want('skitter'):
        ctx.portrait('skitter', portrait_mesh(), ppm=430)
