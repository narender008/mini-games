"""The hellhound: a charred black beast about 1.2 m at the shoulder and 2 m long, glowing orange lava cracks across its hide, a bony
skull-like snout, burning eyes, a spiked spine and long curved horns, galloping toward the camera.

Frames (default bl.PPM px/m, pivot = the ground under the body):
  hound_run_0..5      gallop: 0 = stretched out (front legs reaching, hind legs trailing), 3 = gathered (all four paws under the
                      body, back arched); the body hops and the head nods
  hound_attack_0..2   lunging bite: crouch and coil with the jaws opening (0), leap with paws reaching (1), pounce with jaws wide (2)
  hound_head, hound_leg, hound_torso   gibs (pivot = centre of mass)
Anchors: head.hound (the skull centre on the run frames, game units from the pivot), size.hound_head (skull diameter).
Glow (emit): the lava cracks, the eyes and the throat. Everything else is a dark charred hide with pale bone (snout, teeth, claws,
spikes, horn tips) so the silhouette still reads on a dark hell floor.
"""
import math

from mathutils import Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Pose

PI = math.pi

CR = (0.37, 0.42, 0.40)       # chest ellipsoid radii
RR = (0.34, 0.40, 0.36)       # rump
WR = (0.29, 0.34, 0.30)       # waist
SKULL_R = (0.3, 0.3, 0.27)
L1, L2 = 0.46, 0.46           # upper and lower leg
BODY_Z = 0.8                  # centre height of the body at rest

mats.define('hound_skin', base='#4a3a3e', base2='#251a1d', pattern='noise', pscale=4.5, pamt=0.75, bump=0.5, bevel=0.02, seed=81)
mats.define('hound_skin2', base='#33262a', base2='#1b1215', pattern='noise', pscale=6, pamt=0.7, bump=0.4, bevel=0.02, seed=82)
mats.define('hound_char', base='#6b5348', base2='#3a2a2a', pattern='noise', pscale=3.5, pamt=0.7, bump=0.3, seed=83)
mats.define('hound_lava', base='#ff7a1c', emit=1.0, bevel=0.004)
mats.define('hound_lava_hot', base='#ffc63c', emit=1.0, bevel=0.004)
mats.define('hound_eye', base='#ffdc3c', emit=1.0, bevel=0.003)
mats.define('hound_throat', base='#ff5412', emit=1.0, bevel=0.004)
mats.define('hound_bone', base='#eadfc2', base2='#b6a684', pattern='noise', pscale=8, pamt=0.5, bevel=0.012, seed=84)
mats.define('hound_snout', base='#d9cdae', base2='#4d3d38', pattern='noise', pscale=5, pamt=0.5, bump=0.25, bevel=0.015, seed=85)
mats.define('hound_horn', base='#2a2023', base2='#5d4a42', pattern='noise', pscale=8, pamt=0.5, bevel=0.012, seed=86)
mats.define('hound_horn_tip', base='#f2e6c4', bevel=0.008)
mats.define('hound_claw', base='#efe3c4', bevel=0.004)
mats.define('hound_meat', base='#a3202c', base2='#d23c46', pattern='noise', pscale=6, pamt=0.7, bump=0.5, seed=87)


# ------------------------------------------------------------------------------------------------ small helpers

def sph(c, R, th, ph, off=1.03):
    """A point on (just above) an ellipsoid: th degrees from the top (+Z), ph degrees from the front (-Y) toward +X."""
    t, f = math.radians(th), math.radians(ph)
    d = Vector((math.sin(t) * math.sin(f), -math.sin(t) * math.cos(f), math.cos(t)))
    return Vector((c[0] + R[0] * d.x * off, c[1] + R[1] * d.y * off, c[2] + R[2] * d.z * off))


def crack(m, mx, c, R, pts, r=0.02, mat='hound_lava'):
    """A glowing lava crack: a thin tapering tube through (theta, phi) points on an ellipsoid."""
    P = [sph(c, R, th, ph) for th, ph in pts]
    n = len(P)
    rad = [r * (0.55 + 0.7 * math.sin(PI * (i + 0.5) / n)) for i in range(n)]
    m.tube(P, rad, mat, seg=5, mx=mx, cap=True)


def mirror(pts):
    """The same crack on the other side (phi -> -phi), nudged so the two sides do not match."""
    return [(th + (3 if i % 2 else -2), -ph + (4 if i % 2 else -3)) for i, (th, ph) in enumerate(pts)]


def ik(root, foot, bend):
    """Two-bone leg in a plane: the middle joint bends toward +Y (bend = 1: elbow back) or -Y (bend = -1: knee forward), and up."""
    root, foot = Vector(root), Vector(foot)
    d = foot - root
    dist = max(0.05, min(d.length, L1 + L2 - 1e-3))
    dn = d.normalized()
    a = (dist * dist + L1 * L1 - L2 * L2) / (2 * dist)
    h = math.sqrt(max(L1 * L1 - a * a, 1e-6))
    pole = Vector((0.0, bend, 0.3))
    pole = (pole - dn * pole.dot(dn)).normalized()
    return root + dn * a + pole * h, root + dn * dist


# ------------------------------------------------------------------------------------------------ parts

def head(m, H, jaw=0.35, horns=True):
    """The head in frame H (snout toward -Y, +Z up, skull centre at the origin): a charred skull, a short pale bony snout with fangs,
    deep dark eye sockets with slanted burning eyes, tall horns and ears, a hinged lower jaw and a fiery mouth."""
    m.ball((0, 0, 0), SKULL_R, 'hound_skin', mx=H, seg=22, rings=12)
    m.ball((0, 0.08, 0.03), (0.24, 0.22, 0.24), 'hound_skin2', mx=H, seg=14, rings=8)                  # back of the skull
    # the snout: a short ridge of pale bone, a dark nose, a charred brow
    m.ball((0, -0.34, -0.065), (0.145, 0.27, 0.105), 'hound_snout', mx=H, seg=16, rings=9)
    m.ball((0, -0.2, 0.08), (0.15, 0.14, 0.11), 'hound_snout', mx=H, seg=12, rings=7)
    m.ball((0, -0.6, -0.055), (0.085, 0.065, 0.065), 'pupil', mx=H, seg=10, rings=6)
    for s in (-1, 1):
        sl = roty(-s * 0.5)                                                                            # outer corner up: angry
        m.ball((s * 0.16, -0.21, 0.1), (0.1, 0.055, 0.085), 'mouth', mx=H, seg=14, rings=8, rot=sl)    # deep sockets
        m.ball((s * 0.16, -0.245, 0.1), (0.074, 0.03, 0.05), 'hound_eye', mx=H, seg=14, rings=8, rot=sl)  # burning eyes
        m.ball((s * 0.152, -0.272, 0.1), (0.011, 0.01, 0.036), 'pupil', mx=H, seg=8, rings=5)
        m.capsule((s * 0.27, -0.1, 0.24), (s * 0.06, -0.25, 0.17), 0.045, 0.038, 'hound_skin2', mx=H, seg=10, rings=3)   # heavy brow
        m.cyl((s * 0.2, -0.12, -0.02), (s * 0.42, -0.06, -0.04), 0.05, 0.0, 'hound_bone', seg=8, mx=H)       # cheek spikes
        m.cyl((s * 0.2, 0.05, 0.16), (s * 0.44, 0.1, 0.36), 0.095, 0.0, 'hound_skin2', seg=8, mx=H)         # pointed ears, out to the sides
        m.cyl((s * 0.22, 0.02, 0.17), (s * 0.4, 0.07, 0.32), 0.055, 0.0, 'hound_lava', seg=6, mx=H)         # glowing inner ear
        if horns:
            pts = [(s * 0.1, 0.0, 0.2), (s * 0.15, 0.0, 0.34), (s * 0.2, -0.04, 0.46)]
            m.tube(pts, [0.075, 0.062, 0.045], 'hound_horn', seg=10, mx=H, cap=False)
            m.tube([pts[2], (s * 0.25, -0.09, 0.56), (s * 0.27, -0.17, 0.62)], [0.045, 0.028, 0.004], 'hound_horn_tip', seg=8, mx=H, cap=True)
    # lava on the skull
    crack(m, H, (0, 0, 0), SKULL_R, [(24, -8), (38, 12), (52, -6), (68, 14), (84, 0)], 0.017)
    crack(m, H, (0, 0, 0), SKULL_R, [(34, 56), (50, 64), (64, 52), (80, 68)], 0.014)
    crack(m, H, (0, 0, 0), SKULL_R, [(34, -56), (48, -66), (62, -54), (78, -70)], 0.014)
    # upper fangs along the bony lip, two big canines
    for k in range(5):
        y = -0.31 - 0.065 * k
        ln = 0.13 if k == 4 else 0.055 + 0.01 * (k % 2)
        for s in (-1, 1):
            m.cyl((s * (0.1 - 0.004 * k), y, -0.135), (s * (0.1 - 0.004 * k), y - 0.01, -0.135 - ln), 0.027 if k == 4 else 0.019, 0.0, 'hound_claw', seg=6, mx=H)
    # the lower jaw hinged under the skull: bone-coloured, teeth pointing up, a fiery mouth behind them
    J = H @ trans(0, -0.1, -0.12) @ rotx(jaw)
    m.ball((0, -0.26, -0.045), (0.1, 0.26, 0.05), 'hound_snout', mx=J, seg=14, rings=7)
    m.ball((0, -0.24, 0.005), (0.085, 0.22, 0.03), 'hound_throat', mx=J, seg=12, rings=6)             # burning mouth
    for k in range(4):
        y = -0.3 - 0.06 * k
        for s in (-1, 1):
            m.cyl((s * 0.07, y, 0.0), (s * 0.07, y - 0.005, (0.11 if k == 3 else 0.05)), 0.017, 0.0, 'hound_claw', seg=6, mx=J)
    m.ball((0, -0.08, 0.0), (0.14, 0.12, 0.05 + 0.08 * jaw), 'hound_throat', mx=J, seg=12, rings=7)    # glowing throat
    m.ball((0, -0.16, -0.07), (0.12, 0.18, 0.06), 'hound_skin', mx=J, seg=12, rings=7)                 # jowl


def spike(m, mx, p, d, ln, r=0.055, mat='hound_horn'):
    """A spike: a dark cone with a pale bone tip."""
    dn = d.normalized()
    m.cyl(p, p + dn * ln * 0.62, r, r * 0.4, mat, seg=6, mx=mx)
    m.cyl(p + dn * ln * 0.62, p + dn * ln, r * 0.4, 0.0, 'hound_horn_tip', seg=6, mx=mx)


def body_shell(m, FC, FR, Wc, tilt):
    """Chest, waist and rump with their lava cracks and the spiked spine."""
    c0 = (0, 0, 0)
    m.ball(c0, CR, 'hound_skin', mx=FC, seg=22, rings=12)
    m.ball(c0, RR, 'hound_skin', mx=FR, seg=22, rings=12)
    m.ball(tuple(Wc), WR, 'hound_skin2', seg=18, rings=10, rot=tilt)
    m.ball((0, -0.2, -0.1), (0.2, 0.12, 0.2), 'hound_skin2', mx=FC, seg=12, rings=7)                    # the pale-ish chest tuft: darker patch
    # cracks over the chest and the shoulders (visible from the front and from above)
    A = [(30, 14), (46, 26), (58, 12), (74, 28), (92, 20), (108, 32)]
    B = [(22, 68), (38, 60), (52, 78), (66, 66), (84, 80)]
    C = [(70, -6), (84, 6), (94, -8), (110, 4), (122, -6)]
    D = [(16, 110), (30, 98), (44, 112), (60, 100)]
    for pts in (A, mirror(A), B, mirror(B), C):
        crack(m, FC, c0, CR, pts, 0.021)
    crack(m, FC, c0, CR, D, 0.017)
    crack(m, FC, c0, CR, mirror(D), 0.017)
    # rump: cracks over the back and haunches
    E = [(18, 40), (32, 52), (44, 40), (58, 56), (72, 46)]
    F = [(30, 108), (44, 120), (58, 108), (74, 122)]
    G = [(14, 150), (28, 140), (40, 154), (56, 142)]
    for pts in (E, mirror(E), F, mirror(F), G, mirror(G)):
        crack(m, FR, c0, RR, pts, 0.021)
    # spiked spine: bone spikes along the ridge of the back, swept toward the tail
    for FM, R, n in ((FC, CR, 4), (FR, RR, 4)):
        for k in range(n):
            s = -0.75 + 1.5 * k / (n - 1)
            th = 12 + abs(s) * 38
            ph = 0 if s < 0 else 180
            p = sph(c0, R, th, ph, 0.98)
            nrm = Vector((0, math.sin(math.radians(th)) * (-1 if s < 0 else 1), math.cos(math.radians(th))))
            spike(m, FM, p, nrm + Vector((0, 0.8, 0.15)), 0.17, 0.055)


def leg(m, root, foot, front, sx, lift, shoulder=True):
    """One leg from `root` to `foot` (world): a thick thigh or shoulder, an elbow or knee, a slim lower leg, a big paw with claws."""
    kn, ft = ik(root, foot, 1.0 if front else -1.0)
    if shoulder:
        m.ball(root, 0.19 if front else 0.2, 'hound_skin', seg=12, rings=7)
    m.capsule(root, kn, 0.15, 0.1, 'hound_skin', seg=12, rings=3)
    m.ball(kn, 0.105, 'hound_skin2', seg=10, rings=6)
    m.capsule(kn, ft, 0.085, 0.065, 'hound_skin2', seg=12, rings=3)
    # a lava crack down the front of the thigh and a ring at the knee
    d = (kn - root)
    side = Vector((sx, 0.0, 0.0))
    P = [root + d * u + Vector((sx * 0.045 * (1 if i % 2 else -1), -0.09, 0.03)) for i, u in enumerate((0.12, 0.34, 0.56, 0.82))]
    m.tube(P, [0.016, 0.026, 0.022, 0.014], 'hound_lava', seg=5, cap=True)
    lf = max(0.0, min(1.0, (ft.z - 0.06) / 0.4))
    pa = 0.15 + 0.75 * lf
    R = rotx(pa)
    m.ball(ft + Vector((0, -0.07, -0.02)), (0.105, 0.17, 0.07), 'hound_skin', seg=12, rings=7, rot=R)
    for k in (-1.5, -0.5, 0.5, 1.5):
        b = Vector((k * 0.045, -0.2, -0.045))
        e = Vector((k * 0.052, -0.3, -0.075))
        m.cyl(ft + R @ b, ft + R @ e, 0.03, 0.0, 'hound_claw', seg=6)


def tail(m, FR, sw):
    pts = [(0, 0.3, 0.12), (0.0, 0.55, 0.22), (0.05 * sw, 0.78, 0.2 + 0.04 * sw), (0.12 * sw, 0.98, 0.1 + 0.1 * sw)]
    m.tube(pts, [0.11, 0.085, 0.06, 0.03], 'hound_skin', seg=8, mx=FR, cap=True)
    m.tube([(0, 0.42, 0.18 + 0.02), (0.0, 0.62, 0.26), (0.04 * sw, 0.8, 0.24)], [0.014, 0.018, 0.008], 'hound_lava', seg=5, mx=FR)
    for k, y in enumerate((0.5, 0.68, 0.86)):
        m.cyl((0, y, 0.22 - 0.02 * k + 0.02 * sw * k), (0, y + 0.07, 0.38 - 0.04 * k), 0.04, 0.0, 'hound_bone', seg=6, mx=FR)


# ------------------------------------------------------------------------------------------------ poses and the whole hound

def foot_front(t, ph):
    u = 2 * PI * (t - ph)
    r, s = math.cos(u), math.sin(u)
    return 0.12 + 0.52 * r, 0.06 + 0.3 * max(0.0, -s) + 0.16 * max(0.0, -r)


def foot_hind(t, ph):
    u = 2 * PI * (t - ph)
    r, s = math.cos(u), math.sin(u)
    return 0.05 - 0.5 * r, 0.06 + 0.3 * max(0.0, s) + 0.1 * max(0.0, r)


def gallop(t):
    """Stretch and gather: the body lengthens with the front legs thrown forward and the hind legs trailing, then bunches with all
    four paws under it and the back arched; the head nods against the stride."""
    a = 2 * PI * t
    r = math.cos(a)
    return Pose(
        hop=0.05 + 0.09 * math.cos(a - 1.0), L=0.84 + 0.22 * r, arch=-0.11 * r + 0.02, pf=0.14 * r - 0.03, pr=-0.12 * r,
        fl=foot_front(t, 0.0), fr=foot_front(t, 0.07), hl=foot_hind(t, 0.03), hr=foot_hind(t, 0.1),
        sway=0.07 * math.sin(a + 0.4), hd=0.0, hp=-0.32 + 0.16 * math.cos(a + 0.9), jaw=0.55 + 0.2 * math.cos(a + 0.4), tail=math.sin(a), hs=1.12, fx=0.0)


def attack_pose(i):
    if i == 0:      # coiling back: haunches low, front paws planted wide, head drawn back and up, jaws opening
        return Pose(hop=-0.14, L=0.76, arch=0.12, pf=-0.05, pr=-0.15,
                    fl=(0.2, 0.06), fr=(0.2, 0.06), hl=(0.38, 0.06), hr=(0.38, 0.06),
                    hd=-0.12, hp=-0.6, jaw=0.7, tail=-0.8, hs=1.12, fx=0.05)
    if i == 1:      # the leap: stretched out in the air, front paws thrown forward, jaws opening wide
        return Pose(hop=0.2, L=1.1, arch=-0.1, pf=0.08, pr=-0.1,
                    fl=(0.72, 0.42), fr=(0.66, 0.36), hl=(-0.5, 0.2), hr=(-0.44, 0.15),
                    hd=0.12, hp=-0.45, jaw=1.0, tail=0.6, hs=1.25, fx=0.1)
    return Pose(hop=0.16, L=1.0, arch=-0.04, pf=-0.2, pr=-0.22,                               # the pounce: reared up, claws out, jaws wide
                fl=(0.75, 0.75), fr=(0.7, 0.7), hl=(-0.2, 0.18), hr=(-0.14, 0.12),
                hd=0.3, hp=-0.55, jaw=1.15, tail=1.0, hs=1.4, fx=0.3)


def build_hound(p, with_head=True, tint=None):
    m = Mesh('hound')
    zc = BODY_Z + p.hop
    sw = p.sway
    C = Vector((sw, -p.L / 2, zc))
    Rr = Vector((-sw, p.L / 2, zc - 0.03))
    Wc = (C + Rr) / 2 + Vector((0, 0, p.arch))
    FC = trans(*C) @ rotx(p.pf)
    FR = trans(*Rr) @ rotx(p.pr)
    tilt = rotx(-(p.pf + p.pr) * 0.5)
    body_shell(m, FC, FR, Wc, tilt)
    tail(m, FR, p.tail)
    for sx, key in ((-1, 'fl'), (1, 'fr')):
        reach, lift = p.get(key)
        root = FC @ Vector((sx * 0.25, 0.06, -0.14))
        leg(m, root, Vector((root.x + sx * (0.06 + p.fx), root.y - reach, lift)), True, sx, lift)
    for sx, key in ((-1, 'hl'), (1, 'hr')):
        reach, lift = p.get(key)
        root = FR @ Vector((sx * 0.23, 0.0, -0.1))
        leg(m, root, Vector((root.x + sx * 0.06, root.y - reach, lift)), False, sx, lift)
    # neck, mane spikes and the head, thrust out toward the camera
    Hc = C + Vector((sw * 0.8, -0.62 - p.hd, 0.3))
    H = trans(*Hc) @ rotx(p.hp) @ scale(p.hs or 1.12)
    n0 = FC @ Vector((0, -0.2, 0.22))
    m.capsule(n0, Hc + Vector((0, 0.12, -0.04)), 0.27, 0.23, 'hound_skin', seg=14, rings=4)
    for k in range(3):
        u = 0.25 + 0.3 * k
        q = n0 * (1 - u) + (Hc + Vector((0, 0.1, 0.1))) * u
        m.cyl(q + Vector((0, 0.04, 0.2)), q + Vector((0, 0.2, 0.32 + 0.04 * k)), 0.06, 0.0, 'hound_bone', seg=6)
    crack(m, FC, (0, 0, 0), CR, [(40, -30), (36, -10), (30, 6), (36, 20)], 0.017)
    if with_head:
        head(m, H, jaw=p.jaw)
    return m


def head_centre(p):
    return Vector((p.sway * 1.8, -p.L / 2 - 0.62 - p.hd, BODY_Z + p.hop + 0.3))


def build(ctx):
    n = 6
    ink = dict(outline=1.5, inner=0.75)
    ctx.anim('hound_run', n, lambda i: build_hound(gallop(i / n)), ink=ink)
    ctx.anim('hound_attack', 3, lambda i: build_hound(attack_pose(i)), ink=ink)
    hx = hy = hz = 0.0
    for i in range(n):
        c = head_centre(gallop(i / n))
        hx += c.x / n
        hy += c.y / n
        hz += c.z / n
    ctx.anchor('head', 'hound', (hx, hy, hz))
    ctx.value('size', 'hound_head', round(SKULL_R[0] * 2 * 1.12 * bl.UNITS_PER_M, 1))

    # ---- gibs, built around the origin so the pivot is their middle
    GH = trans(0, 0.05, 0.0) @ rotx(-0.55)
    g = Mesh('head')
    head(g, GH, jaw=0.8)
    g.ball((0, 0.34, -0.12), (0.2, 0.12, 0.17), 'hound_meat', mx=GH, seg=12, rings=7)             # torn neck
    g.capsule((0, 0.3, -0.12), (0, 0.5, -0.1), 0.05, 0.045, 'hound_bone', mx=GH, seg=8, rings=3)
    g.ball((0.07, 0.4, -0.04), (0.07, 0.06, 0.06), 'blood', mx=GH, seg=8, rings=5)
    ctx.one('hound_head', g, ink=ink)

    lg = Mesh('leg')                                                                           # a severed foreleg, cut end toward the camera
    root, foot = Vector((-0.12, -0.34, 0.24)), Vector((0.32, 0.3, 0.08))
    leg(lg, root, foot, True, 1, 0.1, shoulder=False)
    kn, _ = ik(root, foot, 1.0)
    dn = (kn - root).normalized()
    R = bl.axis_matrix((0, 0, 0), -dn).to_3x3().to_4x4()
    lg.ball(root - dn * 0.05, (0.165, 0.165, 0.07), 'hound_meat', seg=14, rings=7, rot=R)           # the torn stump
    lg.ball(root - dn * 0.1, (0.09, 0.09, 0.04), 'blood', seg=10, rings=5, rot=R)
    lg.capsule(root - dn * 0.05, root - dn * 0.25, 0.045, 0.04, 'hound_bone', seg=8, rings=3)
    ctx.one('hound_leg', lg, ink=ink)

    t = Mesh('torso')                                                                          # the chest, burst open: ribs, a glowing gut
    FC = trans(0, 0, 0)
    t.ball((0, 0, 0), CR, 'hound_skin', seg=22, rings=12)
    t.ball((0, -0.04, 0.3), (0.27, 0.3, 0.13), 'hound_meat', seg=16, rings=8)
    t.ball((0, -0.02, 0.38), (0.19, 0.2, 0.09), 'guts', seg=12, rings=7)
    for x, y in ((-0.1, -0.12), (0.1, 0.0), (-0.03, 0.12)):
        t.ball((x, y, 0.45), (0.09, 0.09, 0.07), 'hound_throat', seg=10, rings=6)
    for k in range(4):
        y = -0.21 + 0.14 * k
        w = 0.24 - 0.025 * abs(k - 1.5)
        t.tube([(-w, y, 0.3), (-w * 0.85, y - 0.02, 0.45), (0.0, y - 0.03, 0.51), (w * 0.85, y - 0.02, 0.45), (w, y, 0.3)],
               0.026, 'hound_bone', seg=6, cap=True)
    t.ball((0.2, -0.28, 0.26), (0.07, 0.07, 0.05), 'blood', seg=8, rings=5)
    for pts in ([(40, 14), (56, 26), (70, 12), (84, 28)], mirror([(40, 14), (56, 26), (70, 12), (84, 28)])):
        crack(t, FC, (0, 0, 0), CR, pts, 0.021)
    t.transform(rotx(-0.3))
    ctx.one('hound_torso', t, ink=ink)
