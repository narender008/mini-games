"""The Bone Gaoler: the mini-boss of the Gloamwall. A hunched 3 m brute of fused bone and deep violet sinew: huge shoulders with
bone pauldrons and a skull, forearms armoured with many bones and ending in rusted shackles with long baked chains (the right one
ends in a spiked iron weight), a small skull in an iron jaw-cage, an iron collar, an open ribcage that is a CAGE of iron bars
holding trapped soul-light wisps, a rotten navy loincloth and bone-spur claws. It walks upright on its legs and knuckles its long
arms.

Frames (set gaoler, 60 px/m, 8 directions mirrored, pivot = the ground under the body), 4 atlas pages. BOSS_FIT=1 renders the
fewer frames in FIT (below) with the fps scaled to keep every duration, for a smaller download (about 2 pages); the action frame
stays a real frame (the slam impact, the sweep swing, the roar peak) and ctx.value('anim', name, ...) records the spec count and
fps, the action frame and which spec frame each rendered frame shows. The counts shipped:
  gaoler_idle 8 @ 8 loop      gaoler_walk 8 @ 9 loop      gaoler_slam 12 @ 12 (impact on 7)    gaoler_sweep 12 @ 12 (swing 6-8)
  gaoler_charge 6 @ 14 loop (air (0, +9, 0))               gaoler_roar 10 @ 10                 gaoler_hit 3 @ 14
  gaoler_death 14 @ 10
Anchors: slam.gaoler (the point between the fists on the impact frame), mouth.gaoler, cage.gaoler (the centre of the soul cage); per frame of
slam, sweep, roar and charge fist_l / fist_r, and ball (the flail head) per sweep frame. Portrait: gaoler.
"""
import math
import os

from mathutils import Matrix, Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Skeleton, Pose, keys, smooth, ease_out, ease_in, two_bone, frame_along
from cloth import Cloth
import bosses_lib as B
from bosses_lib import (spike, blade, torus, plate, knobbed_bone, limb_lathe, ring_pts, Chain, chain_links, bez, tendons, basis)

SET = 'gaoler'
PPM = 60
PI = math.pi

# ------------------------------------------------------------------------------------------------ proportions

SK = Skeleton(hip_h=1.25, hip_w=0.42, thigh=0.74, shin=0.68, spine=0.6, chest_h=0.56, sh_w=0.66, upper=1.0, fore=0.95,
              neck=0.26, hand=0.4)
LEAN0 = 0.36        # the resting hunch (torso pitch, rad)
HX, HY = 0.82, -0.65  # where the knuckles rest (x mirrored, y ahead)
ANK = 0.14          # ankle height above the sole
HAND = 0.30         # wrist to fist centre
DOWNFWD = Vector((0.0, -0.45, -1.0)).normalized()
RING_Y, RING_Z = 0.27, -0.05   # shackle ring position on the cuff (frame of the forearm)
CHAIN_PITCH = 0.16
CHAIN_LINKS = 8


class GP(Pose):
    """A pose: the kit's skeleton angles plus limb targets (world metres) and the gaoler's own scalars."""

    def v(self, name):
        return Vector((self.get(name + 'x', 0.0), self.get(name + 'y', 0.0), self.get(name + 'z', 0.0)))


def stance(**kw):
    """The standing pose: a wide stance, knuckles near the ground, hunched."""
    p = GP(lean=LEAN0, head_pitch=-0.18, bob=0.0,
           flx=0.5, fly=-0.02, flz=ANK, frx=-0.5, fry=0.08, frz=ANK,
           hlx=HX, hly=HY, hlz=0.30, hrx=-HX, hry=HY, hrz=0.30,
           cl=0.8, cr=0.8, hbl=0.75, hbr=0.75)
    for k, v in kw.items():
        p[k] = v
    return p


# ------------------------------------------------------------------------------------------------ rig: joint positions

def rig(P):
    """Skeleton frames plus IK for both legs and arms. Returns F (frames) and J (limb points)."""
    F = SK.frames(P)
    d = SK.d
    J = {}
    for s, sx in (('l', 1.0), ('r', -1.0)):
        Hp = F['hip_' + s].translation.copy()
        A = P.v('f' + s)
        K, A = two_bone(Hp, A, d['thigh'], d['shin'], (sx * 0.30, -1.0, 0.10))
        J['hip_' + s], J['knee_' + s], J['ank_' + s] = Hp, K, A
        Sp = F['sh_' + s].translation.copy()
        T = P.v('h' + s)
        hb = P.get('hb' + s, 0.7)
        g = (T - Sp)
        g = g.normalized() if g.length > 1e-6 else DOWNFWD
        hd = (g * (1 - hb) + DOWNFWD * hb).normalized()
        W = T - hd * HAND
        E, W = two_bone(Sp, W, d['upper'], d['fore'], (sx * 0.3, 0.9, 0.2))
        J['sh_' + s], J['elbow_' + s], J['wrist_' + s], J['hd_' + s] = Sp, E, W, hd
    return F, J


# ------------------------------------------------------------------------------------------------ pieces

def skull_small(m, M, s=1.0):
    """A little skull for the shoulder: cranium, brow, glowing sockets, a grin of teeth."""
    m.ball((0, 0, 0.0), (0.2 * s, 0.22 * s, 0.19 * s), 'bs_bone_hi', mx=M, seg=14, rings=8)
    m.ball((0, -0.12 * s, -0.12 * s), (0.13 * s, 0.1 * s, 0.09 * s), 'bs_bone', mx=M, seg=10, rings=6)
    for sx in (-1, 1):
        m.ball((sx * 0.08 * s, -0.17 * s, 0.03 * s), (0.06 * s, 0.05 * s, 0.06 * s), 'bs_void', mx=M, seg=10, rings=6)
        m.ball((sx * 0.08 * s, -0.2 * s, 0.03 * s), (0.038 * s, 0.03 * s, 0.038 * s), 'soul', mx=M, seg=8, rings=5)
    for i in range(5):
        x = (i - 2) * 0.045 * s
        m.box(x - 0.018 * s, x + 0.018 * s, -0.235 * s, -0.2 * s, -0.17 * s, -0.12 * s, 'bs_tooth', mx=M, bevel=0.004)


def head(m, H, jaw=0.0, flare=0.0):
    """Small skull, heavy brow, glowing eyes, curved horns and an iron jaw-cage hinged on the lower jaw (opens with `jaw`)."""
    m.ball((0, -0.04, 0.2), (0.235, 0.27, 0.22), 'bs_bone', mx=H, seg=18, rings=10)
    m.ball((0, -0.24, 0.23), (0.25, 0.09, 0.065), 'bs_bone_hi', mx=H, seg=14, rings=7)               # brow ridge
    for sx in (-1, 1):
        m.ball((sx * 0.14, -0.21, 0.29), (0.11, 0.08, 0.055), 'bs_bone_hi', mx=H, rot=roty(-sx * 0.5), seg=10, rings=6)
        m.ball((sx * 0.1, -0.255, 0.175), (0.07, 0.055, 0.06), 'bs_void', mx=H, seg=10, rings=6)      # sockets
        m.ball((sx * 0.1, -0.285, 0.175), (0.052, 0.035, 0.052), 'soul', mx=H, seg=8, rings=5)
        m.ball((sx * 0.185, -0.16, 0.08), (0.08, 0.1, 0.075), 'bs_bone', mx=H, seg=10, rings=6)       # cheek
    m.ball((0, -0.24, 0.04), (0.15, 0.12, 0.11), 'bs_bone', mx=H, seg=12, rings=7)                   # maxilla
    m.ball((0, -0.295, 0.1), (0.038, 0.03, 0.05), 'bs_void', mx=H, seg=8, rings=5)                   # nose hole
    for i in range(6):                                                                             # upper teeth
        x = (i - 2.5) * 0.05
        m.box(x - 0.022, x + 0.022, -0.32, -0.26, -0.07, 0.0, 'bs_tooth', mx=H, bevel=0.004)
    # horns sweeping back and out, and a short ridge
    for sx in (-1, 1):
        blade(m, (sx * 0.17, 0.0, 0.36), (sx * 0.34, 0.3, 0.5), 0.07, 'bs_bone_old', bend=(sx * 0.03, 0.1, 0.1), up=(0, 0, 1), flat=0.7, mx=H)
    for k in range(3):
        blade(m, (0, 0.04 + 0.09 * k, 0.42 - 0.05 * k), (0, 0.14 + 0.13 * k, 0.6 - 0.04 * k), 0.04, 'bs_bone_hi', up=(1, 0, 0), flat=0.6, mx=H)
    # lower jaw and the iron cage, hinged behind the cheeks
    J = H @ trans(0, -0.02, 0.07) @ rotx(jaw)
    for sx in (-1, 1):
        m.capsule((sx * 0.15, 0.0, 0.0), (sx * 0.095, -0.29, -0.1), 0.045, 0.045, 'bs_bone_dark', mx=J, seg=8, rings=3)
    m.ball((0, -0.3, -0.11), (0.11, 0.075, 0.055), 'bs_bone_dark', mx=J, seg=10, rings=6)
    for i in range(5):
        x = (i - 2) * 0.05
        m.box(x - 0.02, x + 0.02, -0.305, -0.265, -0.06, 0.0, 'bs_tooth', mx=J, bevel=0.004)
    m.ball((0, -0.15, -0.035), (0.11, 0.13, 0.03), 'bs_void', mx=J, seg=8, rings=5)                  # mouth floor, dark
    if flare > 0:
        m.ball((0, -0.18, -0.02), (0.08 * flare, 0.1 * flare, 0.035), 'soul_teal', mx=J, seg=8, rings=5)
    band = [(-0.18, -0.0, 0.065), (-0.17, -0.21, 0.085), (-0.08, -0.33, 0.095), (0.08, -0.33, 0.095), (0.17, -0.21, 0.085), (0.18, 0.0, 0.065)]
    m.tube(band, 0.03, 'bs_iron', seg=6, mx=J)
    lower = [(-0.17, 0.02, -0.075), (-0.16, -0.23, -0.12), (-0.075, -0.35, -0.14), (0.075, -0.35, -0.14), (0.16, -0.23, -0.12), (0.17, 0.02, -0.075)]
    m.tube(lower, 0.033, 'bs_rust', seg=6, mx=J)
    for x in (-0.115, -0.04, 0.04, 0.115):
        m.tube([(x, -0.32, 0.095), (x * 1.05, -0.345, -0.02), (x, -0.35, -0.14)], 0.022, 'bs_iron', seg=5, mx=J)
    plate(m, (0, -0.36, -0.15), (0.28, 0.06, 0.11), 'bs_rust', mx=J, taper=0.8, bevel=0.01)
    blade(m, (0, -0.37, -0.17), (0, -0.5, -0.32), 0.04, 'bs_iron', up=(1, 0, 0), flat=0.7, mx=J)        # hook under the chin
    for sx in (-1, 1):
        m.ball((sx * 0.18, 0.0, 0.0), 0.045, 'bs_rust', mx=J, seg=8, rings=5)                        # hinge rivets


def collar(m, N):
    """An iron collar round the base of the neck, with a ring in front."""
    M = N @ trans(0, -0.02, 0.0)
    m.tube(ring_pts((0, 0.0), 0.26, 0.24, 0.0, 22), 0.07, 'bs_iron', seg=7, mx=M)
    m.tube(ring_pts((0, 0.0), 0.26, 0.24, 0.11, 22), 0.045, 'bs_rust', seg=6, mx=M)
    for k in range(5):
        a = 2 * PI * (k + 0.5) / 5 + PI * 0.0
        x, y = 0.34 * math.sin(a), -0.3 * math.cos(a) - 0.02
        blade(m, (x, y, 0.04), (x * 1.55, y * 1.55, 0.14), 0.05, 'bs_iron', up=(0, 0, 1), flat=0.6, mx=N)
    torus(m, (0, -0.33, 0.0), (0, 1, 0), 0.075, 0.024, 'bs_rust', mx=N)


def cage(m, C, flare=0.0, burst=0.0, t=0.0, breath=0.0):
    """The ribcage in the chest frame: an iron cage of hoops and bars at the front, bone ribs behind, a dark core full of
    trapped soul-light. burst > 0 throws the iron cage open (death)."""
    zs = [-0.47 + 0.157 * k for k in range(7)]

    def rx(z):
        u = (z + 0.5) / 1.0
        return (0.36 + 0.2 * u + 0.045 * math.sin(PI * u)) * (1.0 + 0.025 * breath)

    def ry(z):
        u = (z + 0.5) / 1.0
        return (0.32 + 0.1 * math.sin(PI * u)) * (1.0 + 0.04 * breath)

    # the dark back wall of the cage, a dim soul-glow in front of it, closed at the back by sinew
    m.ball((0, 0.16, 0.02), (0.5, 0.2, 0.6), 'bs_void', mx=C, seg=18, rings=10)
    gl = 0.8 + 0.25 * flare
    m.ball((0, -0.1, 0.0), (0.4 * gl, 0.2 * gl, 0.5 * gl), 'soul_teal' if flare > 0.5 else 'bs_soul_dim', mx=C, seg=14, rings=8)
    m.ball((0, 0.26, 0.05), (0.6, 0.28, 0.62), 'bs_sinew', mx=C, seg=18, rings=10)                  # back muscle
    for sx in (-1, 1):                                                                                # pecs and flanks
        m.ball((sx * 0.5, -0.08, 0.26), (0.24, 0.27, 0.3), 'bs_sinew_hi', mx=C, seg=14, rings=8)
        m.ball((sx * 0.55, 0.0, -0.1), (0.22, 0.29, 0.4), 'bs_sinew', mx=C, seg=14, rings=8)
        plate(m, (sx * 0.45, -0.12, 0.44), (0.3, 0.07, 0.2), 'bs_bone', mx=C, rot=roty(sx * 0.45) @ rotx(0.3), taper=0.7, bevel=0.012)   # collar bone
    spreads = [(0.3 + 0.2 * ((k * 37) % 5) / 5.0) for k in range(len(zs))]
    for k, z in enumerate(zs):
        for side in (-1, 1):
            pts = []
            for i in range(9):
                a = side * (0.0 + 1.1 * i / 8)
                x, y = rx(z) * math.sin(a), -ry(z) * math.cos(a)
                p = Vector((x, y, z))
                if burst > 0:
                    out = Vector((x, y * 1.4, 0.0)).normalized()
                    p = p + out * burst * spreads[k] * 0.7 + Vector((0, 0, -0.15 * burst * burst * (1 + 0.3 * k)))
                    p = p + Vector((side * 0.15 * burst, -0.1 * burst, 0.0))
                pts.append(tuple(p))
            m.tube(pts, 0.036, 'bs_iron' if k % 2 == 0 else 'bs_rust', seg=6, mx=C)
            pts = []
            for i in range(7):
                a = side * (1.1 + 0.62 * i / 6)
                x, y = rx(z) * math.sin(a), -ry(z) * math.cos(a)
                pts.append((x, y, z - 0.02 * i))
            m.tube(pts, 0.04, 'bs_bone', seg=6, mx=C)
            m.ball(pts[0], 0.05, 'bs_rust', mx=C, seg=8, rings=5)                                  # the rivet where iron meets bone
    for side in (-1, 1):
        for a in (0.3, 0.72):
            pts = []
            for z in [-0.48 + 0.96 * i / 8 for i in range(9)]:
                aa = side * a
                x, y = rx(z) * math.sin(aa) * 1.0, -ry(z) * math.cos(aa) * 1.03
                p = Vector((x, y, z))
                if burst > 0:
                    out = Vector((x, y * 1.4, 0.0)).normalized()
                    p = p + out * burst * 0.35 + Vector((side * 0.12 * burst, -0.15 * burst, -0.3 * burst * burst))
                pts.append(tuple(p))
            m.tube(pts, 0.033, 'bs_iron', seg=6, mx=C)
    if burst < 0.3:
        yb = -ry(-0.1)
        plate(m, (0, yb - 0.035, -0.02), (0.18, 0.06, 0.5), 'bs_iron', mx=C, taper=0.85, bevel=0.01)
        torus(m, (0, yb - 0.1, -0.3), (1, 0, 0), 0.08, 0.026, 'bs_iron', mx=C, start=0.0, arc=PI)
        m.box(-0.11, 0.11, yb - 0.2, yb - 0.07, -0.46, -0.24, 'bs_rust', mx=C, bevel=0.018)
        m.ball((0, yb - 0.205, -0.36), (0.03, 0.012, 0.05), 'bs_void', mx=C, seg=6, rings=4)
    # wisps swirling in the cage
    nw = 4
    for k in range(nw):
        ph = 2 * PI * (t + k / nw)
        sc = 1.0 + 0.9 * flare
        cx = 0.22 * math.sin(ph + k)
        cy = -0.12 + 0.07 * math.cos(ph + k * 2)
        cz = -0.3 + 0.2 * k + 0.07 * math.sin(2 * ph)
        if burst > 0:
            cz += burst * (0.45 + 0.3 * k)
            cx *= 1 + 1.4 * burst
            cy -= 0.3 * burst
        head_p = Vector((cx, cy, cz))
        dx, dz = 0.2 * math.cos(ph + k), 0.14 * math.cos(2 * ph)
        tail = [head_p, head_p - Vector((dx, 0.0, dz)) * 0.45, head_p - Vector((dx, -0.05, dz)) * 0.9 + Vector((0, 0, -0.08)),
                head_p - Vector((dx, -0.08, dz)) * 1.3 + Vector((0, 0, -0.15))]
        m.ball(head_p, (0.11 * sc, 0.09 * sc, 0.115 * sc), 'soul', mx=C, seg=10, rings=6)
        m.tube([tuple(p) for p in tail], [0.065 * sc, 0.048 * sc, 0.03 * sc, 0.006], 'soul_teal', seg=6, mx=C)
    if flare > 0:
        m.ball((0, -0.06, 0.05), (0.2 * flare, 0.1 * flare, 0.26 * flare), 'bs_soul_hot', mx=C, seg=12, rings=7)


def pauldron(m, C, sx):
    """Fused bone over the shoulder: overlapping shingles of bone, a tall blade, and on the left a skull."""
    S = C @ trans(sx * 0.66, 0.0, 0.46)
    m.ball((0, 0, -0.04), (0.27, 0.26, 0.24), 'bs_sinew_hi', mx=S, seg=16, rings=9)                   # the deltoid mass
    n = 6
    for k in range(n):
        phi = 2 * PI * k / n + (0.3 if sx > 0 else 1.0)
        o = Vector((math.cos(phi), math.sin(phi) * 0.9, 0.0))
        c = Vector((o.x * 0.21, o.y * 0.2, 0.04))
        zd = Vector((-o.x * 0.55, -o.y * 0.55, 1.0))
        yd = Vector((o.x, o.y, 0.35))
        m.hull([tuple(q) for q in _shingle(0.27 - 0.02 * (k % 2), 0.32 - 0.04 * (k % 3), 0.055)], 'bs_bone' if k % 2 else 'bs_bone_old',
               mx=S @ basis(zd, yd, c), bevel=0.015)
    # the cap
    m.ball((0, 0, 0.2), (0.22, 0.2, 0.12), 'bs_bone_hi', mx=S, seg=12, rings=6)
    # tall blades
    blade(m, (sx * 0.08, 0.1, 0.2), (sx * 0.16, 0.3, 0.6), 0.09, 'bs_bone_hi', bend=(sx * 0.03, 0.08, 0.08), up=(1, 0, 0), flat=0.5, mx=S)
    if sx > 0:
        skull_small(m, S @ trans(0.04, -0.13, 0.34) @ rotz(-0.5) @ rotx(-0.25), 0.95)
    m.tube(ring_pts((0, 0), 0.4, 0.36, -0.08, 18), 0.03, 'bs_rust', seg=5, mx=S)


def _shingle(w, h, t):
    """Points of a tapered shingle plate (wide at the bottom, curved)."""
    return [(-w / 2, -t, -h / 2), (w / 2, -t, -h / 2), (w / 2, t, -h / 2), (-w / 2, t, -h / 2),
            (-w * 0.3, -t * 0.7, h / 2), (w * 0.3, -t * 0.7, h / 2), (w * 0.3, t * 0.7, h / 2), (-w * 0.3, t * 0.7, h / 2),
            (0, -t * 1.6, 0.0)]


def spine_ridge(m, F):
    """Fused vertebrae along the back with a crest of blades, growing toward the neck."""
    S, C = F['spine'], F['chest']
    pts = [(S, (0.0, 0.31, 0.06), 0.1), (S, (0.0, 0.32, 0.32), 0.12), (C, (0.0, 0.32, -0.34), 0.14), (C, (0.0, 0.34, -0.12), 0.16),
           (C, (0.0, 0.36, 0.1), 0.18), (C, (0.0, 0.36, 0.3), 0.2), (C, (0.0, 0.33, 0.5), 0.18)]
    for sx in (-1, 1):
        plate(m, (sx * 0.34, 0.5, 0.18), (0.42, 0.09, 0.56), 'bs_bone_old', mx=C, rot=roty(sx * 0.35) @ rotx(-0.25), taper=0.65, bevel=0.014,
              warp=0.015, seed=5 + sx)
        for k in range(4):
            z = -0.36 + 0.2 * k
            m.tube([(sx * 0.06, 0.38, z), (sx * 0.3, 0.45, z + 0.02), (sx * 0.58, 0.28, z - 0.08), (sx * 0.7, 0.05, z - 0.14)], 0.042,
                   'bs_bone', seg=6, mx=C)
    for i, (fr, p, ln) in enumerate(pts):
        m.ball(p, (0.1, 0.08, 0.08), 'bs_bone', mx=fr, seg=10, rings=6)
        blade(m, (p[0], p[1] + 0.03, p[2]), (p[0], p[1] + 0.08 + ln * 1.0, p[2] + 0.05 + ln * 0.9), 0.07, 'bs_bone_hi',
              bend=(0, 0.05, 0.1), up=(1, 0, 0), flat=0.5, mx=fr)
        if i in (3, 5):
            for sx in (-1, 1):
                blade(m, (sx * 0.12, p[1] + 0.04, p[2]), (sx * 0.38, p[1] + 0.14, p[2] + 0.14), 0.065, 'bs_bone_old',
                      bend=(0, 0.05, 0.08), up=(0, 1, 0), flat=0.5, mx=fr)


def build_arm(m, F, J, P, s):
    sx = 1.0 if s == 'l' else -1.0
    Sp, E, W, hd = J['sh_' + s], J['elbow_' + s], J['wrist_' + s], J['hd_' + s]
    hint = Vector((-sx * 0.4, -1.0, 0.0))
    UA = frame_along(Sp, E, hint)
    L1 = (E - Sp).length
    ua = lambda t: 0.27 + 0.03 * math.sin(PI * min(t * 1.4, 1.0)) - 0.06 * t
    limb_lathe(m, UA, L1, [(0, 0.26), (0.3, 0.29), (0.75, 0.24), (1, 0.2)], 'bs_sinew', sy=0.92)
    tendons(m, UA, L1, ua, 5, 'bs_sinew_hi', r=0.03, twist=0.5, phase=0.4, y0=0.0)
    for k, z in enumerate((0.3, 0.55, 0.78)):
        plate(m, (sx * 0.17, 0.14, -L1 * z), (0.3, 0.08, 0.26), 'bs_bone', mx=UA, rot=roty(sx * 0.2) @ rotx(0.15 * (k - 1)), taper=0.7, bevel=0.012)
    for k, z in enumerate((0.34, 0.6)):                                                                    # and the front of the upper arm
        plate(m, (0, -0.2, -L1 * z), (0.28, 0.08, 0.26), 'bs_bone' if k else 'bs_bone_old', mx=UA, rot=rotx(-0.12), taper=0.75, bevel=0.012, warp=0.012, seed=k + 20)
    m.ball((0, 0.05, -L1), (0.22, 0.21, 0.21), 'bs_bone_old', mx=UA, seg=12, rings=7)                 # the elbow
    FA = frame_along(E, W, hint)
    L2 = (W - E).length
    limb_lathe(m, FA, L2, [(0, 0.2), (0.35, 0.28), (0.8, 0.27), (1, 0.21)], 'bs_sinew_dark', sx=1.0, sy=0.95)
    blade(m, (0, 0.14, 0.0), (0, 0.42, 0.2), 0.09, 'bs_bone_hi', bend=(0, 0.05, 0.1), up=(1, 0, 0), flat=0.55, mx=FA)   # elbow spur
    for k in range(5):
        z = -L2 * (0.14 + 0.15 * k)
        w = 0.38 - 0.015 * k
        plate(m, (0, 0.2, z), (w, 0.09, 0.26), 'bs_bone' if k % 2 == 0 else 'bs_bone_old', mx=FA, rot=rotx(0.12), taper=0.82, bevel=0.014,
              warp=0.012, seed=k + (3 if sx > 0 else 0))
    for ox in (-1, 1):
        knobbed_bone(m, (ox * 0.09, -0.2, -L2 * 0.1), (ox * 0.08, -0.21, -L2 * 0.88), 0.042, 'bs_bone_hi', mx=FA, seg=7)
    for k in range(4):                                                                                   # armour on the front of the forearm
        z = -L2 * (0.2 + 0.19 * k)
        plate(m, (0, -0.22, z), (0.26 - 0.02 * k, 0.07, 0.22), 'bs_bone_old' if k % 2 == 0 else 'bs_bone', mx=FA, rot=rotx(-0.1), taper=0.8, bevel=0.012,
              warp=0.012, seed=k + 9)
    wz = -L2 + 0.03
    m.cyl((0, 0, wz + 0.1), (0, 0, wz - 0.1), 0.26, 0.25, 'bs_iron', seg=16, mx=FA, bevel=0.01)
    for dz in (-0.1, 0.1):
        torus(m, (0, 0, wz + dz), (0, 0, 1), 0.255, 0.038, 'bs_rust', mx=FA, n=18)
    for k in range(6):
        a = 2 * PI * k / 6 + 0.3
        m.ball((0.265 * math.cos(a), 0.265 * math.sin(a), wz), 0.03, 'bs_rust', mx=FA, seg=6, rings=4)
    m.box(-0.05, 0.05, 0.22, 0.31, wz - 0.07, wz + 0.05, 'bs_rust', mx=FA, bevel=0.01)
    torus(m, (0, RING_Y + 0.02, wz + RING_Z), (1, 0, 0), 0.09, 0.032, 'bs_iron', mx=FA)
    # a faint soul-light seam round the cuff
    m.tube(ring_pts((0, 0), 0.262, 0.262, 0.0, 20), 0.014, 'soul_teal', seg=4, mx=FA @ trans(0, 0, wz + 0.0) @ rotz(0))
    HD = frame_along(W, W + hd, hint)
    m.ball((0, 0.0, -0.12), (0.21, 0.16, 0.2), 'bs_sinew', mx=HD, seg=12, rings=7)
    plate(m, (0, 0.11, -0.1), (0.36, 0.1, 0.28), 'bs_bone', mx=HD, taper=0.8, bevel=0.014)
    cv = P.get('c' + s, 0.7)
    for i, fx in enumerate((-0.12, 0.0, 0.12)):
        scl = 1.0 - 0.1 * abs(i - 1.0)
        base = Vector((fx, 0.0, -0.24))
        ang = [0.15 + 0.7 * cv, 0.35 + 1.1 * cv, 0.25 + 1.0 * cv]
        segs = [0.14 * scl, 0.12 * scl, 0.1 * scl]
        pos = base
        cur = 0.0
        for j in range(3):
            cur += ang[j]
            dirv = Vector((0.0, -math.sin(cur), -math.cos(cur)))
            nxt = pos + dirv * segs[j]
            m.capsule(pos, nxt, 0.07 - 0.01 * j, 0.06 - 0.01 * j, 'bs_sinew_dark' if j else 'bs_bone', mx=HD, seg=8, rings=2)
            m.ball(nxt, 0.066 - 0.01 * j, 'bs_bone', mx=HD, seg=8, rings=4)
            pos = nxt
        cur += 0.5
        dirv = Vector((0.0, -math.sin(cur), -math.cos(cur)))
        blade(m, pos, pos + dirv * (0.22 * scl + 0.04), 0.06, 'bs_bone_hi', bend=(0, -0.02, 0.0), up=(1, 0, 0), flat=0.6, mx=HD, n=4)
    th0 = Vector((sx * 0.19, -0.06, -0.12))
    th1 = th0 + Vector((sx * 0.04, -0.12 - 0.08 * cv, -0.1))
    m.capsule(th0, th1, 0.07, 0.058, 'bs_bone', mx=HD, seg=8, rings=2)
    blade(m, th1, th1 + Vector((0, -0.08, -0.15)), 0.05, 'bs_bone_hi', up=(1, 0, 0), flat=0.6, mx=HD, n=3)


def foot(m, A, pitch, sx):
    FM = trans(*A) @ rotx(-pitch)
    m.ball((0, 0.05, -0.07), (0.21, 0.24, 0.075), 'bs_sinew_dark', mx=FM, seg=12, rings=6)
    m.ball((0, -0.2, -0.085), (0.25, 0.27, 0.06), 'bs_sinew', mx=FM, seg=12, rings=6)
    plate(m, (0, -0.06, -0.01), (0.36, 0.5, 0.05), 'bs_bone', mx=FM, rot=rotx(-0.1), taper=0.8, bevel=0.01)
    for i, x in enumerate((-0.14, 0.0, 0.14)):
        m.capsule((x, -0.3, -0.09), (x, -0.5, -0.1), 0.07, 0.06, 'bs_sinew', mx=FM, seg=8, rings=2)
        blade(m, (x, -0.5, -0.095), (x, -0.72 - 0.04 * (i == 1), -0.12), 0.06, 'bs_bone_hi', bend=(0, 0, -0.03), up=(1, 0, 0), flat=0.6, mx=FM, n=4)
    blade(m, (sx * 0.08, 0.2, -0.08), (sx * 0.1, 0.44, -0.02), 0.065, 'bs_bone_hi', bend=(0, 0, 0.05), up=(1, 0, 0), flat=0.6, mx=FM)   # heel spur


def build_leg(m, J, P, s):
    sx = 1.0 if s == 'l' else -1.0
    Hp, K, A = J['hip_' + s], J['knee_' + s], J['ank_' + s]
    hint = Vector((sx * 0.1, -1.0, 0.0))
    T = frame_along(Hp, K, hint)
    L1 = (K - Hp).length
    limb_lathe(m, T, L1, [(0, 0.31), (0.3, 0.35), (0.7, 0.28), (1, 0.22)], 'bs_sinew', sx=1.0, sy=1.05)
    for k, z in enumerate((0.28, 0.5, 0.72)):
        plate(m, (sx * 0.18, -0.22, -L1 * z), (0.25, 0.08, 0.26), 'bs_bone', mx=T, rot=roty(sx * 0.35), taper=0.75, bevel=0.014)
    S = frame_along(K, A, hint)
    L2 = (A - K).length
    m.ball((0, -0.12, 0.0), (0.21, 0.18, 0.21), 'bs_bone', mx=S, seg=12, rings=7)
    blade(m, (0, -0.2, 0.0), (0, -0.47, -0.1), 0.08, 'bs_bone_hi', bend=(0, 0, -0.04), up=(1, 0, 0), flat=0.55, mx=S)
    limb_lathe(m, S, L2, [(0, 0.21), (0.3, 0.25), (0.75, 0.18), (1, 0.14)], 'bs_sinew_dark', sx=0.95, sy=1.05)
    for k, z in enumerate((0.22, 0.44, 0.66)):
        plate(m, (0, -0.16, -L2 * z), (0.22, 0.07, 0.24), 'bs_bone_old', mx=S, taper=0.8, bevel=0.012)
    torus(m, (0, 0, -L2 + 0.02), (0, 0, 1), 0.17, 0.042, 'bs_rust', mx=S)


def pelvis(m, P_):
    m.ball((0, 0.02, 0.06), (0.54, 0.38, 0.3), 'bs_sinew_dark', mx=P_, seg=16, rings=9)
    for sx in (-1, 1):
        plate(m, (sx * 0.42, 0.0, 0.2), (0.3, 0.15, 0.3), 'bs_bone', mx=P_, rot=roty(sx * 0.6) @ rotx(-0.2), taper=0.7, bevel=0.014)
    blade(m, (0, 0.32, -0.02), (0, 0.62, -0.3), 0.085, 'bs_bone_hi', bend=(0, 0.06, -0.05), up=(1, 0, 0), flat=0.55, mx=P_)
    m.tube(ring_pts((0, 0.02), 0.54, 0.4, 0.22, 22), 0.05, 'bs_rust', seg=6, mx=P_)
    m.box(-0.11, 0.11, -0.46, -0.38, 0.13, 0.31, 'bs_iron', mx=P_, bevel=0.012)                       # belt buckle
    torus(m, (0.52, -0.14, 0.1), (1, 0, 0), 0.085, 0.018, 'bs_iron', mx=P_)                           # a ring of keys at the hip
    for k in range(3):
        m.cyl((0.54 + 0.02 * k, -0.14 + 0.03 * (k - 1), 0.02), (0.54 + 0.02 * k, -0.14 + 0.05 * (k - 1), -0.24 - 0.03 * k), 0.018, 0.018,
              'bs_rust', seg=5, mx=P_)


def abdomen(m, S):
    m.ball((0, -0.02, 0.3), (0.46, 0.33, 0.44), 'bs_sinew', mx=S, seg=16, rings=9)
    for k in range(3):
        plate(m, (0, -0.29, 0.12 + 0.18 * k), (0.36 - 0.04 * k, 0.06, 0.15), 'bs_bone_old', mx=S, taper=0.9, bevel=0.012)


# ------------------------------------------------------------------------------------------------ the whole body

def loin_mesh(grids):
    m = Mesh('loin')
    for G, mat in grids:
        nr, nc = len(G), len(G[0])
        m.grid_sheet(lambda u, v, G=G, nr=nr, nc=nc: G[min(int(round(v * (nr - 1))), nr - 1)][min(int(round(u * (nc - 1))), nc - 1)],
                     nc - 1, nr - 1, mat, smooth=60, thick=0.012)
    return m


def chains_mesh(chains, tag):
    cm = Mesh('chains_' + tag)
    for s, pts in chains.items():
        chain_links(cm, pts, 0.032, 'bs_iron' if s == 'l' else 'bs_rust', pitch=CHAIN_PITCH)
        end, prev = Vector(pts[-1]), Vector(pts[-2])
        d = (end - prev).normalized()
        if s == 'r':
            c = end + d * 0.15
            cm.ball(c, (0.17, 0.17, 0.17), 'bs_rust', seg=14, rings=8)
            for dvec in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1), (0.7, 0.7, 0), (-0.7, 0.7, 0), (0.7, -0.7, 0),
                         (-0.7, -0.7, 0), (0.6, 0, 0.6), (-0.6, 0, 0.6)):
                dv = Vector(dvec).normalized()
                spike(cm, c + dv * 0.14, c + dv * 0.34, 0.055, 'bs_iron', seg=5, n=3)
        else:
            torus(cm, end + d * 0.07, (0, 0, 1) if abs(d.z) < 0.9 else (1, 0, 0), 0.1, 0.032, 'bs_iron')
    return cm


def body(P, t=0.0, loin=None, chains=None, tag='g'):
    """All the meshes of one frame (a list). loin = [(grid, material)] of baked points; chains = {'l': pts, 'r': pts}."""
    F, J = rig(P)
    m = Mesh('gaoler_' + tag)
    flare, burst, jaw, breath = P.get('flare', 0.0), P.get('burst', 0.0), P.get('jaw', 0.0), P.get('breath', 0.0)
    pelvis(m, F['pelvis'])
    abdomen(m, F['spine'])
    cage(m, F['chest'], flare, burst, t, breath)
    spine_ridge(m, F)
    for sx in (-1, 1):
        pauldron(m, F['chest'], sx)
    C, N, H = F['chest'], F['neck'], F['head']
    m.ball((0, 0.2, 0.38), (0.47, 0.3, 0.26), 'bs_sinew', mx=C, seg=16, rings=8)
    m.capsule((0, 0.0, 0.0), (0, -0.04, 0.3), 0.21, 0.18, 'bs_sinew', mx=N, seg=12, rings=3)
    collar(m, N)
    head(m, H, jaw, flare)
    for s in ('l', 'r'):
        build_arm(m, F, J, P, s)
        build_leg(m, J, P, s)
        foot(m, J['ank_' + s], P.get('fp' + s, 0.0), 1.0 if s == 'l' else -1.0)
    out = [m]
    if loin is not None:
        out.append(loin_mesh(loin))
    if chains is not None:
        out.append(chains_mesh(chains, tag))
    return out



# ------------------------------------------------------------------------------------------------ animation helpers

def lerp(a, b, t):
    return a + (b - a) * t


def S(f, ks, ease=smooth):
    """Keyed gaoler pose at frame f: ks = [(frame, GP), ...] (complete poses)."""
    return GP(keys(f, ks, ease))


ARM_SPREAD = 0.68   # the key poses below were drawn wide; this keeps the silhouette (and the atlas) compact


def K(f, **kw):
    for k in ('hlx', 'hrx'):
        if k in kw:
            kw[k] *= ARM_SPREAD
    return (float(f), stance(**kw))


def foot_path(phi, Ls, duty, lift):
    """A foot in the body frame: planted and carried back at ground speed for `duty` of the cycle, then swung forward.
    Returns (y offset, height above the sole, toe pitch)."""
    if phi < duty:
        s = phi / duty
        return -Ls / 2 + Ls * s, 0.0, 0.0
    s = (phi - duty) / (1 - duty)
    e = smooth(s)
    return Ls / 2 - Ls * e, lift * math.sin(PI * s) ** 0.85, 0.5 * math.sin(PI * min(1.0, s * 1.3)) - 0.15 * s


def hand_path(phi, y0, y1, lift, duty=0.5):
    """A knuckle on the ground carried back (y0 front -> y1 back), then lifted forward again."""
    if phi < duty:
        s = phi / duty
        return lerp(y0, y1, s), 0.0
    s = (phi - duty) / (1 - duty)
    return lerp(y1, y0, smooth(s)), lift * math.sin(PI * s) ** 0.8


def idle_pose(f):
    u = f / 8.0
    a = 2 * PI * u
    br = math.sin(a)
    p = stance(breath=br, bob=0.02 * br, lean=LEAN0 + 0.02 * br, twist=0.05 * math.sin(a + 0.8), head_pitch=-0.18 + 0.06 * math.sin(a - 0.6),
               sway=0.025 * math.sin(a + 1.2), roll=0.02 * math.sin(a + 0.4))
    for s, sx in (('l', 1.0), ('r', -1.0)):
        p['h%sx' % s] = sx * (HX + 0.03 * math.sin(a + 0.5 * sx))
        p['h%sy' % s] = HY + 0.04 * math.sin(a + 1.0 + 0.5 * sx)
        p['h%sz' % s] = 0.3 + 0.015 * math.sin(a + 1.4 * sx)
    return p


WALK_SPEED = 2.6
WALK_T = 8 / 9.0
WALK_LS = WALK_SPEED * 0.6 * WALK_T


def walk_pose(f):
    u = (f / 8.0) % 1.0
    p = stance()
    for s, sx, off in (('l', 1.0, 0.0), ('r', -1.0, 0.5)):
        phi = (u + off) % 1.0
        y, lift, pitch = foot_path(phi, WALK_LS, 0.6, 0.32)
        p['f%sx' % s] = sx * 0.55
        p['f%sy' % s] = y + 0.02
        p['f%sz' % s] = ANK + lift
        p['fp' + s] = pitch
    phl = u
    p['bob'] = 0.03 * math.cos(4 * PI * (phl - 0.3)) - 0.06
    p['sway'] = 0.07 * math.cos(2 * PI * (phl - 0.3))
    p['twist'] = 0.2 * math.cos(2 * PI * phl)
    p['hip_twist'] = -0.1 * math.cos(2 * PI * phl)
    p['roll'] = -0.05 * math.cos(2 * PI * (phl - 0.3))
    p['lean'] = LEAN0 + 0.04 + 0.03 * math.cos(4 * PI * (phl - 0.3))
    p['head_pitch'] = -0.25 + 0.05 * math.cos(4 * PI * (phl - 0.3))
    p['head_yaw'] = -0.1 * math.cos(2 * PI * phl)
    p['breath'] = math.sin(4 * PI * phl)
    # knuckles: the right hand lands with the left foot
    for s, sx, off in (('r', -1.0, 0.0), ('l', 1.0, 0.5)):
        phi = (u + off) % 1.0
        y, z = hand_path(phi, -1.15, -0.35, 0.3)
        p['h%sx' % s] = sx * HX
        p['h%sy' % s] = y
        p['h%sz' % s] = 0.3 + z
        p['c' + s] = 0.85 - 0.45 * (z / 0.34)
    return p


CHARGE_T = 6 / 14.0
CHARGE_SPEED = 9.0
CHARGE_LS = CHARGE_SPEED * 0.3 * CHARGE_T


def charge_pose(f):
    u = (f / 6.0) % 1.0
    p = stance(lean=0.8, head_pitch=0.4)
    for s, sx, off in (('l', 1.0, 0.0), ('r', -1.0, 0.5)):
        phi = (u + off) % 1.0
        y, lift, pitch = foot_path(phi, CHARGE_LS, 0.3, 0.55)
        p['f%sx' % s] = sx * 0.5
        p['f%sy' % s] = y + 0.1
        p['f%sz' % s] = ANK + lift
        p['fp' + s] = pitch
    p['bob'] = 0.1 + 0.16 * max(0.0, math.sin(4 * PI * u + 0.5))
    p['sway'] = 0.05 * math.sin(2 * PI * u)
    p['twist'] = 0.22 * math.cos(2 * PI * u)
    p['hip_twist'] = -0.12 * math.cos(2 * PI * u)
    p['lean'] = 0.8 + 0.05 * math.sin(4 * PI * u)
    p['jaw'] = 0.25 + 0.1 * math.sin(4 * PI * u)
    p['flare'] = 0.25
    for s, sx, off in (('r', -1.0, 0.0), ('l', 1.0, 0.5)):
        phi = (u + off) % 1.0
        y, z = hand_path(phi, -1.4, -0.5, 0.4, duty=0.3)
        p['h%sx' % s] = sx * 0.82
        p['h%sy' % s] = y
        p['h%sz' % s] = 0.3 + z
        p['c' + s] = 0.9
    return p


def slam_pose(f):
    up = (1.0, 3.9)
    ks = [
        K(0, bob=0.0),
        K(1, bob=-0.14, lean=0.52, head_pitch=0.1, hlx=1.15, hly=-0.1, hlz=0.55, hrx=-1.15, hry=-0.1, hrz=0.55, cl=1.0, cr=1.0, hbl=0.5, hbr=0.5),
        K(2, bob=-0.02, lean=0.18, head_pitch=-0.2, hlx=1.0, hly=-0.75, hlz=1.7, hrx=-1.0, hry=-0.75, hrz=1.7, cl=1.0, cr=1.0, hbl=0.3, hbr=0.3, jaw=0.1),
        K(3, bob=0.0, lean=-0.1, head_pitch=-0.4, hlx=0.85, hly=-0.7, hlz=2.8, hrx=-0.85, hry=-0.7, hrz=2.8, cl=1.0, cr=1.0, hbl=0.2, hbr=0.2, jaw=0.2, flare=0.2),
        K(4, bob=0.03, lean=-0.26, head_pitch=-0.5, hlx=0.7, hly=-0.4, hlz=3.3, hrx=-0.7, hry=-0.4, hrz=3.3, cl=1.0, cr=1.0, hbl=0.1, hbr=0.1, jaw=0.35, flare=0.4),
        K(5, bob=0.06, lean=-0.36, head_pitch=-0.55, hlx=0.6, hly=-0.1, hlz=3.55, hrx=-0.6, hry=-0.1, hrz=3.55, cl=1.0, cr=1.0, hbl=0.1, hbr=0.1, jaw=0.45, flare=0.55),
        K(6, bob=0.07, lean=-0.4, head_pitch=-0.6, hlx=0.58, hly=0.0, hlz=3.6, hrx=-0.58, hry=0.0, hrz=3.6, cl=1.0, cr=1.0, hbl=0.1, hbr=0.1, jaw=0.5, flare=0.6),
        K(7, bob=-0.2, lean=0.8, head_pitch=0.35, hlx=0.5, hly=-1.8, hlz=0.22, hrx=-0.5, hry=-1.8, hrz=0.22, cl=1.0, cr=1.0, hbl=0.9, hbr=0.9, jaw=0.25, flare=0.8),
        K(8, bob=-0.16, lean=0.76, head_pitch=0.3, hlx=0.55, hly=-1.8, hlz=0.22, hrx=-0.55, hry=-1.8, hrz=0.22, cl=1.0, cr=1.0, hbl=0.9, hbr=0.9, jaw=0.2, flare=0.4),
        K(9, bob=-0.08, lean=0.6, head_pitch=0.15, hlx=0.8, hly=-1.5, hlz=0.4, hrx=-0.8, hry=-1.5, hrz=0.4, cl=0.95, cr=0.95, hbl=0.85, hbr=0.85, flare=0.15),
        K(10, bob=-0.03, lean=LEAN0 - 0.04, head_pitch=0.0, hlx=1.1, hly=-1.1, hlz=0.35, hrx=-1.1, hry=-1.1, hrz=0.35),
        K(11, bob=0.0, lean=LEAN0),
    ]
    p = S(f, ks, ease=lambda t: t * t * (3 - 2 * t))
    if f > 6.0 and f < 7.0:
        pass
    p['breath'] = 0.0
    return p


def sweep_pose(f):
    R = 1.3

    def arm(alpha, z):
        a = math.radians(alpha)
        return (R * math.sin(a), -0.15 - R * math.cos(a), z)
    # alpha: hand angle in the ground plane about the body (0 = ahead, positive = toward its left)
    keys_a = [(0, 0.0, 0.0, 0.3), (1, -12, -0.1, 0.3), (2, -40, -0.35, 0.8), (3, -75, -0.65, 1.3), (4, -100, -0.85, 1.7), (5, -112, -0.95, 1.9),
              (6, -25, -0.4, 1.9), (7, 95, 0.6, 1.8), (8, 195, 1.1, 1.5), (9, 235, 1.1, 1.2), (10, 215, 0.8, 0.8), (11, 120, 0.3, 0.45)]
    ks = []
    for fr, al, tw, z in keys_a:
        x, y, zz = arm(al, z)
        if fr >= 10:
            # recovery: the arm comes home to the side
            e = (fr - 9) / 2.0
            x, y, zz = lerp(arm(235, 1.2)[0], -HX, e), lerp(arm(235, 1.2)[1], HY, e), lerp(1.2, 0.3, e)
        ks.append(K(fr, twist=tw, hrx=x, hry=y, hrz=zz, lean=LEAN0 + (0.12 if fr in (6, 7) else 0.0) - (0.25 if fr in (3, 4, 5) else 0.0),
                    bob=-0.1 if fr in (3, 4, 5) else (-0.06 if fr in (6, 7, 8) else 0.0),
                    hlx=0.8 if 1 <= fr <= 9 else HX, hly=-1.0 if 1 <= fr <= 9 else HY, hlz=1.3 if 1 <= fr <= 9 else 0.3, cr=0.9, hbr=0.5,
                    head_yaw=-tw * 0.5, hip_twist=-tw * 0.3, jaw=0.15 if 5 <= fr <= 8 else 0.0, flare=0.2 if 5 <= fr <= 8 else 0.0))
    p = S(f, ks)
    p['breath'] = 0.0
    return p


def roar_pose(f):
    ks = [
        K(0, bob=0.0),
        K(1, bob=-0.1, lean=0.55, head_pitch=0.15, hlx=0.9, hly=-0.6, hlz=1.0, hrx=-0.9, hry=-0.6, hrz=1.0, cl=1.0, cr=1.0, hbl=0.3, hbr=0.3),
        K(2, bob=-0.14, lean=0.7, head_pitch=0.25, hlx=0.7, hly=-0.7, hlz=1.2, hrx=-0.7, hry=-0.7, hrz=1.2, cl=1.0, cr=1.0, hbl=0.3, hbr=0.3, flare=0.1),
        K(3, bob=0.0, lean=0.0, head_pitch=-0.4, hlx=1.3, hly=-0.4, hlz=1.7, hrx=-1.3, hry=-0.4, hrz=1.7, cl=0.2, cr=0.2, hbl=0.2, hbr=0.2, jaw=0.5, flare=0.5),
        K(4, bob=0.08, lean=-0.3, head_pitch=-0.75, hlx=1.55, hly=0.2, hlz=2.3, hrx=-1.55, hry=0.2, hrz=2.3, cl=0.0, cr=0.0, hbl=0.2, hbr=0.2, jaw=0.9, flare=1.0),
        K(5, bob=0.1, lean=-0.36, head_pitch=-0.8, hlx=1.65, hly=0.3, hlz=2.4, hrx=-1.65, hry=0.3, hrz=2.4, cl=0.0, cr=0.0, hbl=0.2, hbr=0.2, jaw=0.95, flare=1.0),
        K(6, bob=0.1, lean=-0.34, head_pitch=-0.78, hlx=1.65, hly=0.25, hlz=2.3, hrx=-1.65, hry=0.25, hrz=2.3, cl=0.0, cr=0.0, hbl=0.2, hbr=0.2, jaw=0.9, flare=0.95),
        K(7, bob=0.08, lean=-0.25, head_pitch=-0.7, hlx=1.55, hly=0.1, hlz=2.1, hrx=-1.55, hry=0.1, hrz=2.1, cl=0.1, cr=0.1, hbl=0.2, hbr=0.2, jaw=0.8, flare=0.8),
        K(8, bob=0.03, lean=0.0, head_pitch=-0.3, hlx=1.7, hly=-0.4, hlz=1.0, hrx=-1.7, hry=-0.4, hrz=1.0, cl=0.5, cr=0.5, hbl=0.4, hbr=0.4, jaw=0.3, flare=0.4),
        K(9, bob=0.0, lean=0.2, head_pitch=-0.1, hlx=1.4, hly=-0.8, hlz=0.5, hrx=-1.4, hry=-0.8, hrz=0.5, flare=0.15),
    ]
    p = S(f, ks)
    p['breath'] = 0.0
    return p


def hit_pose(f):
    ks = [
        K(0, lean=0.12, bob=0.02, head_pitch=-0.45, hlx=1.5, hly=-0.5, hlz=0.8, hrx=-1.5, hry=-0.5, hrz=0.8, cl=0.3, cr=0.3, hbl=0.4, hbr=0.4, jaw=0.35, flare=0.3,
              fly=0.1, fry=0.18),
        K(1, lean=0.04, bob=0.04, head_pitch=-0.6, hlx=1.7, hly=-0.2, hlz=1.0, hrx=-1.7, hry=-0.2, hrz=1.0, cl=0.1, cr=0.1, hbl=0.4, hbr=0.4, jaw=0.45, flare=0.5,
              fly=0.15, fry=0.22, twist=0.1),
        K(2, lean=0.22, bob=-0.02, head_pitch=-0.2, hlx=1.4, hly=-0.7, hlz=0.5, hrx=-1.4, hry=-0.7, hrz=0.5, jaw=0.15, flare=0.2, fly=0.04, fry=0.12),
    ]
    p = S(f, ks, ease=lambda t: t)
    p['breath'] = 0.0
    return p


def death_pose(f):
    kneel = dict(flx=0.5, fly=0.25, flz=ANK, frx=-0.5, fry=0.3, frz=ANK, fpl=0.0, fpr=0.0)
    ks = [
        K(0, lean=0.1, head_pitch=-0.5, hlx=1.5, hly=-0.4, hlz=0.9, hrx=-1.5, hry=-0.4, hrz=0.9, cl=0.2, cr=0.2, jaw=0.4, flare=0.4),
        K(1, lean=0.0, bob=-0.1, head_pitch=-0.6, hlx=1.7, hly=-0.2, hlz=1.2, hrx=-1.7, hry=-0.2, hrz=1.2, cl=0.0, cr=0.0, jaw=0.6, flare=0.6, fly=0.1, fry=0.2),
        K(2, lean=0.1, bob=-0.35, head_pitch=-0.4, hlx=1.5, hly=-0.5, hlz=0.8, hrx=-1.5, hry=-0.5, hrz=0.8, jaw=0.5, flare=0.8, flx=0.5, fly=0.15, frx=-0.5, fry=0.25),
        K(3, lean=0.1, bob=-0.62, head_pitch=-0.2, hlx=1.4, hly=-0.8, hlz=0.4, hrx=-1.4, hry=-0.8, hrz=0.4, cl=0.5, cr=0.5, jaw=0.4, flare=0.9, **kneel),
        K(4, lean=0.0, bob=-0.7, head_pitch=-0.5, hlx=1.5, hly=-0.5, hlz=0.5, hrx=-1.5, hry=-0.5, hrz=0.5, cl=0.3, cr=0.3, jaw=0.7, flare=1.0, burst=0.1, **kneel),
        K(5, lean=-0.15, bob=-0.7, head_pitch=-0.7, hlx=1.9, hly=-0.2, hlz=1.3, hrx=-1.9, hry=-0.2, hrz=1.3, cl=0.0, cr=0.0, jaw=0.9, flare=1.0, burst=0.45, **kneel),
        K(6, lean=-0.2, bob=-0.7, head_pitch=-0.75, hlx=2.0, hly=0.1, hlz=1.7, hrx=-2.0, hry=0.1, hrz=1.7, cl=0.0, cr=0.0, jaw=1.0, flare=1.0, burst=0.8, **kneel),
        K(7, lean=-0.1, bob=-0.7, head_pitch=-0.6, hlx=1.9, hly=-0.2, hlz=1.3, hrx=-1.9, hry=-0.2, hrz=1.3, cl=0.0, cr=0.0, jaw=0.9, flare=0.8, burst=1.0, **kneel),
        K(8, lean=0.2, bob=-0.7, head_pitch=-0.3, hlx=1.6, hly=-0.6, hlz=0.8, hrx=-1.6, hry=-0.6, hrz=0.8, cl=0.2, cr=0.2, jaw=0.7, flare=0.5, burst=1.2, **kneel),
        K(9, lean=0.5, bob=-0.7, head_pitch=0.1, hlx=1.5, hly=-1.0, hlz=0.4, hrx=-1.5, hry=-1.0, hrz=0.4, cl=0.4, cr=0.4, jaw=0.5, flare=0.3, burst=1.3, **kneel),
        K(10, lean=0.85, bob=-0.7, head_pitch=0.3, hlx=1.3, hly=-1.5, hlz=0.25, hrx=-1.3, hry=-1.5, hrz=0.25, cl=0.6, cr=0.6, jaw=0.4, flare=0.1, burst=1.3, **kneel),
        K(11, lean=1.15, bob=-0.7, head_pitch=0.45, hlx=1.2, hly=-1.9, hlz=0.2, hrx=-1.2, hry=-1.9, hrz=0.2, cl=0.7, cr=0.7, jaw=0.3, burst=1.3, **kneel),
        K(12, lean=1.35, bob=-0.7, head_pitch=0.5, hlx=1.1, hly=-2.2, hlz=0.18, hrx=-1.1, hry=-2.2, hrz=0.18, cl=0.7, cr=0.7, jaw=0.2, burst=1.3, **kneel),
        K(13, lean=1.42, bob=-0.72, head_pitch=0.5, hlx=1.1, hly=-2.3, hlz=0.16, hrx=-1.1, hry=-2.3, hrz=0.16, cl=0.7, cr=0.7, jaw=0.1, burst=1.3, **kneel),
    ]
    p = S(f, ks)
    p['breath'] = 0.0
    return p


# ------------------------------------------------------------------------------------------------ baking: loincloth and chains

def ring_xy(a, rx=0.56, ry=0.42):
    return rx * math.sin(a), -ry * math.cos(a)


LOIN_LEN = [(0.85, 1.0, 0.7, 1.05, 0.8, 0.95), (0.9, 0.7, 1.05, 0.8, 1.0, 0.75)]


def loin_pins(F):
    """Belt points (world) of the two panels from the pelvis frame: [front row, back row]."""
    Pm = F['pelvis']
    out = []
    for panel, a0, a1 in ((0, -0.85, 0.85), (1, PI - 0.8, PI + 0.8)):
        row = []
        for c in range(6):
            a = a0 + (a1 - a0) * c / 5.0
            x, y = ring_xy(a, 0.58, 0.44)
            row.append(Pm @ Vector((x, y, 0.2)))
        out.append(row)
    return out


def bake_loin(posefn, fps, times, period, air):
    cl = Cloth(gravity=9.8, drag=1.9, iterations=10)
    p0 = posefn(times[0] * fps)
    F0, J0 = rig(p0)
    pins0 = loin_pins(F0)
    grids = []
    nr = 6
    for panel in (0, 1):
        rows = []
        for r in range(nr):
            row = []
            for c in range(6):
                base = pins0[panel][c]
                L = LOIN_LEN[panel][c]
                outv = (base - F0['pelvis'].translation)
                outv.z = 0.0
                outv = outv.normalized() if outv.length > 1e-6 else Vector((0, -1, 0))
                row.append(tuple(base + outv * 0.03 * r + Vector((0, 0, -L * r / (nr - 1)))))
            rows.append(row)
        grids.append(cl.grid(rows, pinned_row=True, stiff=0.9, shear=0.4, bend=0.25, r=0.025))

    def drive(t):
        P = posefn(t * fps)
        F, J = rig(P)
        pins = {}
        pp = loin_pins(F)
        for panel in (0, 1):
            for c in range(6):
                pins[grids[panel][0][c]] = tuple(pp[panel][c])
        pel = F['pelvis']
        cols = [(tuple(J['hip_l']), tuple(J['knee_l']), 0.36), (tuple(J['hip_r']), tuple(J['knee_r']), 0.36),
                (tuple(J['knee_l']), tuple(J['ank_l']), 0.22), (tuple(J['knee_r']), tuple(J['ank_r']), 0.22),
                (tuple(pel @ Vector((-0.2, 0.0, -0.02))), tuple(pel @ Vector((0.2, 0.0, -0.02))), 0.4)]
        return pins, cols, air

    sims = cl.bake(drive, times, loops=3, settle=0.7, period=period)
    outs = []
    for X in sims:
        fr = []
        for panel, mat in ((0, 'bs_cloth_navy'), (1, 'bs_cloth_violet')):
            G = [[Vector(X[i]) for i in row] for row in grids[panel]]
            fr.append((G, mat))
        outs.append(fr)
    return outs


def ring_point(F, J, P, s):
    """Where the chain hangs from the shackle ring (world), from the forearm frame."""
    sx = 1.0 if s == 'l' else -1.0
    hint = Vector((-sx * 0.4, -1.0, 0.0))
    FA = frame_along(J['elbow_' + s], J['wrist_' + s], hint)
    L2 = (J['wrist_' + s] - J['elbow_' + s]).length
    wz = -L2 + 0.03
    return FA @ Vector((0.0, RING_Y + 0.09, wz + RING_Z - 0.05))


def bake_chains(posefn, fps, times, period, speed):
    out = {}
    for s in ('l', 'r'):
        ch = Chain(CHAIN_LINKS if s == 'r' else CHAIN_LINKS - 2, CHAIN_PITCH, r=0.04, end_inv=0.3 if s == 'r' else 0.6)

        def pin(t, s=s):
            P = posefn(t * fps)
            F, J = rig(P)
            return tuple(ring_point(F, J, P, s))

        def cols(t):
            P = posefn(t * fps)
            F, J = rig(P)
            return [(tuple(J['hip_l']), tuple(J['knee_l']), 0.36), (tuple(J['hip_r']), tuple(J['knee_r']), 0.36),
                    (tuple(J['knee_l']), tuple(J['ank_l']), 0.22), (tuple(J['knee_r']), tuple(J['ank_r']), 0.22)]

        out[s] = ch.bake(pin, times, speed=speed, period=period, loops=3, settle=1.2, cols_fn=cols, start_dir=(0.35 if s == 'l' else -0.35, -0.5, 0.0))
    return out


# ------------------------------------------------------------------------------------------------ build

# name: (spec frames, spec fps, loop, pose function, anchor frame (the action), ground speed for the chain drag, cloth air)
SPEC = [
    ('gaoler_idle', 8, 8, True, idle_pose, None, 0.0, (0.0, 0.0, 0.0)),
    ('gaoler_walk', 8, 9, True, walk_pose, None, WALK_SPEED, (0.0, WALK_SPEED, 0.0)),
    ('gaoler_slam', 12, 12, False, slam_pose, 7, 0.0, (0.0, 0.0, 0.0)),
    ('gaoler_sweep', 12, 12, False, sweep_pose, 7, 0.0, (0.0, 0.0, 0.0)),
    ('gaoler_charge', 6, 14, True, charge_pose, None, CHARGE_SPEED, (0.0, CHARGE_SPEED, 0.0)),
    ('gaoler_roar', 10, 10, False, roar_pose, 5, 0.0, (0.0, 0.0, 0.0)),
    ('gaoler_hit', 3, 14, False, hit_pose, None, 0.0, (0.0, 0.0, 0.0)),
    ('gaoler_death', 14, 10, False, death_pose, 7, 0.0, (0.0, 0.0, 0.0)),
]
# frame counts rendered under BOSS_FIT=1. Durations are kept: fps scales with the count.
FIT = {'gaoler_idle': 4, 'gaoler_walk': 6, 'gaoler_slam': 5, 'gaoler_sweep': 6, 'gaoler_charge': 6, 'gaoler_roar': 3, 'gaoler_hit': 3,
       'gaoler_death': 5}


def frame_map(n_spec, n, anchor, loop):
    """Spec-frame positions of the n frames rendered: even steps for loops, piecewise so the action frame stays a frame."""
    if n == n_spec:
        return [float(i) for i in range(n)]
    if loop or anchor is None:
        return [i * n_spec / float(n) for i in range(n)] if loop else [i * (n_spec - 1) / float(n - 1) for i in range(n)]
    a = max(1, min(n - 2, int(round(anchor * (n - 1) / float(n_spec - 1)))))
    out = []
    for i in range(n):
        if i <= a:
            out.append(i * anchor / float(a))
        else:
            out.append(anchor + (i - a) * (n_spec - 1 - anchor) / float(n - 1 - a))
    return out


def record_anchors(ctx, name, i, P, chains, is_action):
    """Points the game needs, [x east, y south, z up] metres with the figure facing south: both fists per frame of the slam and sweep
    (the slam anchor is their midpoint at the impact frame), the flail ball of the sweep, the mouth and the cage (from the first idle frame)."""
    F, J = rig(P)
    nm = '%s_%d' % (name, i)
    if name in ('gaoler_slam', 'gaoler_sweep', 'gaoler_roar', 'gaoler_charge'):
        fl = J['wrist_l'] + J['hd_l'] * HAND
        fr = J['wrist_r'] + J['hd_r'] * HAND
        ctx.anchor('fist_l', nm, tuple(fl))
        ctx.anchor('fist_r', nm, tuple(fr))
        if name == 'gaoler_slam' and is_action:
            ctx.anchor('slam', 'gaoler', tuple((fl + fr) * 0.5))
    if name == 'gaoler_sweep':
        pts = chains['r']
        end, prev = Vector(pts[-1]), Vector(pts[-2])
        ctx.anchor('ball', nm, tuple(end + (end - prev).normalized() * 0.15))
    if name == 'gaoler_roar' and is_action:
        ctx.anchor('mouth', 'gaoler_roar', tuple(F['head'] @ Vector((0.0, -0.32, 0.0))))
    if name == 'gaoler_idle' and i == 0:
        ctx.anchor('mouth', 'gaoler', tuple(F['head'] @ Vector((0.0, -0.32, 0.0))))
        ctx.anchor('cage', 'gaoler', tuple(F['chest'] @ Vector((0.0, -0.2, 0.0))))


def make_anim(ctx, name, n_spec, fps_spec, loop, posefn, anchor, speed, air):
    n = FIT[name] if os.environ.get('BOSS_FIT') else n_spec
    fmap = frame_map(n_spec, n, anchor, loop)
    fps = fps_spec * n / float(n_spec)
    state = {}
    times = [fp / float(fps_spec) for fp in fmap]
    period = n_spec / float(fps_spec) if loop else None

    def bake():
        if state:
            return
        state['loin'] = bake_loin(posefn, fps_spec, times, period, air)
        state['chains'] = bake_chains(posefn, fps_spec, times, period, speed)

    def frame(i):
        B.safe_flush(ctx)
        bake()
        P = posefn(fmap[i])
        chains = {s: state['chains'][s][i] for s in ('l', 'r')}
        record_anchors(ctx, name, i, P, chains, anchor is not None and abs(fmap[i] - anchor) < 1e-6)
        return body(P, t=fmap[i] / n_spec, loin=state['loin'][i], chains=chains, tag='%s_%d' % (name, i))

    ctx.anim(name, n, frame, dirs=8, mirror=True, ppm=PPM, fps=fps, loop=loop)
    act = None if anchor is None else min(range(n), key=lambda i: abs(fmap[i] - anchor))
    ctx.value('anim', name, dict(spec_n=n_spec, spec_fps=fps_spec, spec_action=anchor, action=act, frames=[round(x, 3) for x in fmap]))


def portrait(ctx):
    """The codex picture: mid-roar, arms wide, cage ablaze, turned about 110 degrees toward screen left."""
    if not ctx.want('gaoler'):
        return
    pf = lambda f: roar_pose(5.0)
    loin = bake_loin(pf, 10.0, [0.5], None, (0.0, 0.0, 0.0))
    ch = bake_chains(pf, 10.0, [0.5], None, 0.0)
    ms = body(pf(0), t=0.3, loin=loin[0], chains={s: ch[s][0] for s in ch}, tag='portrait')
    R = bl.facing(math.radians(110))
    for m in ms:
        m.transform(R)
    ctx.portrait('gaoler', ms, ppm=150, elev=22.0)


def build(ctx):
    B.define_materials()
    only = os.environ.get('BOSS_ANIMS')
    for a in SPEC:
        if only and a[0] not in only.split(','):
            continue
        make_anim(ctx, *a)
    if not only or 'portrait' in only.split(','):
        portrait(ctx)
