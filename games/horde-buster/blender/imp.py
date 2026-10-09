"""The imp: a small flying demon (about 1 m, big grinning head) with red-orange skin, bat wings, horns, glowing yellow eyes, claws and a
spade-tipped tail. It FLIES: the body hovers HOVER metres above the pivot (the ground point), so the frame has no ground contact and
the game draws the shadow at the pivot.

Frames (default bl.PPM px/m, pivot = the ground point under the imp, which lies BELOW the sprite):
  imp_fly_0..5      wing-flap loop (0 = wings at the top of the stroke, 3 = at the bottom; the body bobs against the wings)
  imp_attack_0..2   dive: rear back with wings flared (0), swoop (1), strike with claws out and jaws wide (2)
  imp_head, imp_wing, imp_torso   gibs (pivot = centre of mass)
Anchors: head.imp (head centre, averaged over the fly loop, game units from the pivot), size.imp_head, body.imp (the body centre,
HOVER above the pivot, same units), value hover.imp = [metres, game units straight up] (the attack frames dip a little lower).
"""
import math

from mathutils import Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Pose, at

PI = math.pi

HOVER = 1.3          # body centre above the pivot, metres (the game draws the shadow at the pivot)
SC = 0.95            # the model is built around 1.05 m tall and drawn at about 1 m
HEAD_C = (0.0, 0.0, 0.13)
HEAD_R = (0.245, 0.215, 0.205)

mats.define('imp_skin', base='#ff5a1f', base2='#e03a16', pattern='noise', pscale=6, pamt=0.55, bump=0.3, seed=71)
mats.define('imp_belly', base='#ffb36a', base2='#ff8c4a', pattern='noise', pscale=8, pamt=0.5, bump=0.2, seed=72)
mats.define('imp_dark', base='#a32116', base2='#74130f', pattern='noise', pscale=7, pamt=0.6, bump=0.25, seed=73)
mats.define('imp_wing', base='#b81f33', base2='#f2552e', pattern='noise', pscale=3.2, pamt=0.7, bump=0.1, bevel=0.01, seed=74)
mats.define('imp_bone', base='#ffb066', base2='#d9803c', pattern='noise', pscale=9, pamt=0.5, bevel=0.01, seed=75)
mats.define('imp_horn', base='#f7e9c6', base2='#d2b985', pattern='noise', pscale=8, pamt=0.4, bevel=0.01, seed=76)
mats.define('imp_horn_base', base='#8a5b34', base2='#5a3722', pattern='noise', pscale=9, pamt=0.5, bevel=0.01, seed=77)
mats.define('imp_spade', base='#8c1710', base2='#c42a14', pattern='noise', pscale=6, pamt=0.6, bevel=0.01, seed=78)


# ------------------------------------------------------------------------------------------------ parts

def head(m, H, jaw=0.3, mx_scale=1.0):
    """The head in frame H (face toward -Y, +Z up): a wide skull, big glowing eyes under angry brows, a wide fanged grin, long ears, horns."""
    m.ball(HEAD_C, HEAD_R, 'imp_skin', mx=H, seg=22, rings=12)
    for s in (-1, 1):
        m.ball((s * 0.15, -0.1, 0.06), (0.105, 0.1, 0.09), 'imp_skin', mx=H, seg=12, rings=7)         # round cheeks
        # eye: dark socket, a big glowing yellow eye, a slit pupil
        m.ball((s * 0.1, -0.168, 0.2), (0.082, 0.045, 0.078), 'mouth', mx=H, seg=14, rings=8)
        m.ball((s * 0.1, -0.188, 0.2), (0.07, 0.036, 0.068), 'eye_glow_yellow', mx=H, seg=14, rings=8)
        m.ball((s * 0.094, -0.218, 0.2), (0.013, 0.012, 0.045), 'pupil', mx=H, seg=8, rings=5)
        # angry brow slanting down toward the nose
        m.capsule((s * 0.19, -0.13, 0.31), (s * 0.04, -0.19, 0.255), 0.034, 0.03, 'imp_dark', mx=H, seg=10, rings=3)
        # ears: long, pointed, sweeping out and up
        m.cyl((s * 0.2, 0.0, 0.17), (s * 0.5, 0.05, 0.3), 0.075, 0.0, 'imp_skin', seg=10, mx=H)
        m.cyl((s * 0.215, -0.03, 0.17), (s * 0.45, 0.02, 0.28), 0.045, 0.0, 'imp_belly', seg=8, mx=H)
        # horns: short, curving up and forward
        pts = [(s * 0.1, 0.0, 0.3), (s * 0.15, -0.02, 0.4), (s * 0.15, -0.07, 0.5)]
        m.tube(pts[:2], [0.062, 0.05], 'imp_horn_base', seg=10, mx=H, cap=False)
        m.tube(pts[1:] + [(s * 0.12, -0.13, 0.58)], [0.05, 0.036, 0.004], 'imp_horn', seg=10, mx=H, cap=True)
        # cheek-corner of the grin
        m.capsule((s * 0.165, -0.17, 0.0), (s * 0.2, -0.135, 0.075), 0.017, 0.015, 'imp_dark', mx=H, seg=8, rings=3)
    m.ball((0, -0.205, 0.12), (0.04, 0.03, 0.03), 'imp_dark', mx=H, seg=10, rings=6)                    # nose
    # the wide grin: dark mouth, lower jaw that drops with `jaw`, tongue, a row of teeth with two big fangs
    m.ball((0, -0.17, 0.0 - 0.02 * jaw), (0.155, 0.05, 0.062 + 0.06 * jaw), 'mouth', mx=H, seg=16, rings=8)
    m.ball((0, -0.12, -0.075 - 0.06 * jaw), (0.12, 0.1, 0.06), 'imp_skin', mx=H, seg=12, rings=6)       # chin
    m.ball((0, -0.185, -0.02 - 0.03 * jaw), (0.06, 0.035, 0.026), 'tongue', mx=H, seg=10, rings=6)
    zt = 0.052
    for k in range(-3, 4):
        x = k * 0.04
        ln = 0.062 if abs(k) == 2 else 0.032
        m.cyl((x, -0.205 + 0.0035 * k * k, zt), (x, -0.21 + 0.0035 * k * k, zt - ln), 0.017 if abs(k) == 2 else 0.013, 0.0, 'teeth', seg=6, mx=H)
    zb = -0.045 - 0.05 * jaw
    for k in (-2, -1, 1, 2):
        x = k * 0.045
        m.cyl((x, -0.2, zb), (x, -0.205, zb + (0.04 if abs(k) == 1 else 0.05)), 0.013, 0.0, 'teeth', seg=6, mx=H)


def torso(m, B):
    """A round belly with a pale front, a small chest, shoulder bumps and a stub of spine at the back."""
    m.ball((0, 0, 0), (0.16, 0.14, 0.18), 'imp_skin', mx=B, seg=18, rings=10)
    m.ball((0, -0.085, -0.01), (0.105, 0.07, 0.125), 'imp_belly', mx=B, seg=14, rings=8)
    m.ball((0, 0, 0.17), (0.15, 0.12, 0.12), 'imp_skin', mx=B, seg=16, rings=9)
    m.ball((0, -0.08, 0.17), (0.09, 0.05, 0.075), 'imp_belly', mx=B, seg=12, rings=7)
    m.ball((0, 0.02, 0.27), (0.075, 0.07, 0.06), 'imp_skin', mx=B, seg=10, rings=6)                   # neck
    for k in range(3):                                                                                 # little spikes down the back
        z = 0.2 - 0.12 * k
        m.cyl((0, 0.1 + 0.01 * k, z), (0, 0.17 + 0.01 * k, z - 0.03), 0.032, 0.0, 'imp_dark', seg=6, mx=B)


def arm(m, B, sx, hand, spread=0.5, curl=1.0):
    """A short arm to a given hand point (body frame), with a fist of three long claws."""
    sh = Vector((sx * 0.15, -0.01, 0.2))
    ha = Vector(hand)
    mid = (sh + ha) * 0.5
    el = mid + Vector((sx * 0.07, 0.07, -0.05))
    m.ball(sh, 0.075, 'imp_skin', mx=B, seg=10, rings=6)
    m.capsule(sh, el, 0.068, 0.056, 'imp_skin', mx=B, seg=10, rings=3)
    m.capsule(el, ha, 0.056, 0.05, 'imp_skin', mx=B, seg=10, rings=3)
    d = (ha - el).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 0.2:
        side = d.cross(Vector((1, 0, 0)))
    side.normalize()
    up = side.cross(d).normalized()
    m.ball(ha + d * 0.035, (0.065, 0.065, 0.06), 'imp_skin', mx=B, seg=10, rings=6)
    for k in (-1, 0, 1):
        base = ha + d * 0.07 + side * (k * 0.04) + up * 0.01
        tip = ha + d * (0.2 * curl + 0.05) + side * (k * 0.04 * (1 + spread * 2.0)) + up * (0.03 - 0.02 * abs(k))
        m.cyl(base, tip, 0.024, 0.0, 'claw', seg=6, mx=B)
    m.cyl(ha + side * (-sx * 0.04) + up * 0.02, ha + side * (-sx * 0.08) + d * 0.1 + up * 0.03, 0.02, 0.0, 'claw', seg=6, mx=B)  # thumb


def leg(m, B, sx, swing):
    """A stubby leg dangling under the belly, a clawed foot."""
    hip = Vector((sx * 0.085, 0.0, -0.15))
    kn = hip + Vector((sx * 0.035, -0.08 - 0.06 * swing, -0.15))
    an = kn + Vector((-sx * 0.01, 0.07 + 0.05 * swing, -0.16))
    m.ball(hip, 0.085, 'imp_skin', mx=B, seg=10, rings=6)
    m.capsule(hip, kn, 0.078, 0.062, 'imp_skin', mx=B, seg=10, rings=3)
    m.ball(kn, 0.06, 'imp_dark', mx=B, seg=10, rings=6)
    m.capsule(kn, an, 0.058, 0.046, 'imp_skin', mx=B, seg=10, rings=3)
    m.ball(an + Vector((0, -0.04, -0.015)), (0.062, 0.09, 0.045), 'imp_skin', mx=B, seg=10, rings=6)
    for k in (-1, 0, 1):
        b = an + Vector((k * 0.04, -0.1, -0.025))
        m.cyl(b, b + Vector((k * 0.01, -0.07, -0.025)), 0.02, 0.0, 'claw', seg=6, mx=B)


def tail(m, B, sw, lift=0.0):
    """A thin tail curling out to the side and up, ending in a flat spade."""
    pts = [(0.0, 0.1, -0.13), (0.04, 0.17, -0.25 + 0.1 * lift), (0.17 + 0.07 * sw, 0.14, -0.38 + 0.2 * lift),
           (0.34 + 0.1 * sw, 0.03, -0.38 + 0.26 * lift), (0.46 + 0.1 * sw, -0.07, -0.26 + 0.3 * lift)]
    m.tube(pts, [0.04, 0.032, 0.026, 0.02, 0.016], 'imp_skin', seg=8, mx=B, cap=True)
    p0, p1 = Vector(pts[-2]), Vector(pts[-1])
    d = p1 - p0
    ang = math.atan2(d.x, d.z)                       # angle from +Z in the XZ plane
    ca, sa = math.cos(ang), math.sin(ang)
    spade = [(0.0, 0.0), (-0.065, 0.065), (0.0, 0.205), (0.065, 0.065)]
    pp = [(x * ca + z * sa + p1.x, -x * sa + z * ca + p1.z) for x, z in spade]
    m.prism(pp, p1.y - 0.02, p1.y + 0.02, 'imp_spade', mx=B, bevel=0.006)


def wing(sx, flap, sweep, bend, B, k=1.3, Bw=None):
    """One bat wing, shoulder at the back of the chest. flap: lift angle (rad, up positive); sweep: swung toward the back; bend:
    the outer part (fingers) bending up relative to the arm. sx = -1 / +1 for the left / right wing. Returns a Mesh in body space."""
    S = (0.0, 0.0)
    W = (0.4 * k, -0.1 * k)
    T1 = (0.84 * k, 0.04 * k)
    T2 = (0.74 * k, 0.4 * k)
    T3 = (0.4 * k, 0.56 * k)
    Bk = (0.03, 0.34 * k)

    def scallop(a, b, pull=0.3):
        mx_, mz_ = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        return (mx_ + (W[0] - mx_) * pull, mz_ + (W[1] - mz_) * pull)

    inner = Mesh('wing_in')
    outer = Mesh('wing_out')
    th = 0.014
    inner.prism([S, W, T3, scallop(T3, Bk, 0.22), Bk], -th, th, 'imp_wing')
    outer.prism([W, T1, scallop(T1, T2), T2, scallop(T2, T3), T3], -th, th, 'imp_wing')
    P = lambda p: (p[0], 0.0, p[1])
    inner.capsule(P(S), P(W), 0.04, 0.03, 'imp_bone', seg=10, rings=3)
    inner.ball(P(S), 0.065, 'imp_skin', seg=10, rings=6)
    inner.capsule(P(S), P((Bk[0], Bk[1] * 0.9)), 0.022, 0.016, 'imp_bone', seg=8, rings=2)
    for tip, r in ((T1, 0.026), (T2, 0.024), (T3, 0.022)):
        outer.capsule(P(W), P(tip), r, 0.008, 'imp_bone', seg=8, rings=3)
    outer.ball(P(W), 0.05, 'imp_bone', seg=10, rings=6)
    outer.cyl(P(W), (W[0] - 0.02, 0.0, W[1] - 0.1 * k), 0.026, 0.0, 'claw', seg=6)                    # the thumb claw at the wrist
    to_plane = rotx(-PI / 2)                                                                            # local z (back) -> world +Y
    seam = trans(W[0], 0, 0) @ rotz(-bend) @ trans(-W[0], 0, 0)                                          # bend about the seam line
    outer.transform(seam)
    w = Mesh('wing')
    w.add(inner)
    w.add(outer)
    inner.free()
    outer.free()
    w.transform(to_plane)
    w.transform(roty(-flap) @ rotz(sweep))
    if sx < 0:
        w.transform(scale(-1, 1, 1))
    # the root follows the body, but the wing plane leans with the body only a little, so it never goes edge-on to the camera
    w.transform(Bw if Bw is not None else B)
    w.transform(trans(*(B @ Vector((sx * 0.09, 0.12, 0.2)))))
    return w


# ------------------------------------------------------------------------------------------------ poses and the whole imp

def fly_pose(t):
    a = 2 * PI * t
    c, s = math.cos(a), math.sin(a)
    return Pose(
        flap=0.12 + 0.82 * c, sweep=0.14 + 0.22 * c, bend=0.6 * s, flap_r=0.12 + 0.82 * math.cos(a - 0.12), bend_r=0.6 * math.sin(a - 0.12),
        z=-0.07 * c, lean=-0.22 - 0.05 * s, head_pitch=-0.55 + 0.05 * c, jaw=0.25 + 0.1 * max(0.0, s),
        hl=(-0.27, -0.36 + 0.05 * s, 0.07 + 0.05 * c), hr=(0.27, -0.36 - 0.05 * s, 0.07 - 0.05 * c), spread=0.5, curl=1.0,
        sl=math.sin(a + 0.8), sr=math.sin(a + 0.8 + PI), tail=math.sin(a - 0.6), tail_lift=0.25 + 0.2 * c, yaw=0.05 * s,
    )


def attack_pose(i):
    if i == 0:      # rearing back, wings flared up and wide, claws raised beside the head, jaws open
        return Pose(flap=0.7, sweep=0.3, bend=-0.1, flap_r=0.7, bend_r=-0.1, z=0.1, lean=-0.5, head_pitch=-0.5, jaw=0.7,
                    hl=(-0.36, -0.2, 0.34), hr=(0.36, -0.2, 0.34), spread=0.9, curl=1.0,
                    sl=-0.6, sr=-0.9, tail=-0.4, tail_lift=0.1, yaw=0.0)
    if i == 1:      # swooping in, wings swept back, claws coming up and out
        return Pose(flap=0.6, sweep=0.5, bend=-0.1, flap_r=0.6, bend_r=-0.1, z=-0.02, lean=0.2, head_pitch=-0.95, jaw=0.85,
                    hl=(-0.42, -0.38, 0.36), hr=(0.42, -0.38, 0.36), spread=1.2, curl=1.1,
                    sl=0.8, sr=0.5, tail=0.6, tail_lift=0.55, yaw=0.0)
    return Pose(flap=0.5, sweep=0.8, bend=-0.3, flap_r=0.5, bend_r=-0.3, z=-0.12, lean=0.4, head_pitch=-1.05, jaw=1.0,           # strike
                hl=(-0.5, -0.5, 0.4), hr=(0.5, -0.5, 0.4), spread=1.6, curl=1.2,
                sl=0.9, sr=0.9, tail=0.8, tail_lift=0.8, yaw=0.0)


def body_frame(p):
    return rotz(p.yaw) @ rotx(p.lean)


def build_imp(p, with_head=True):
    """The whole imp in pose p as one Mesh, centred on the body (z = 0), at drawing scale; the caller lifts it by the hover height."""
    m = Mesh('imp')
    B = body_frame(p)
    torso(m, B)
    if with_head:
        H = B @ trans(0.0, -0.03, 0.31) @ rotx(p.head_pitch - p.lean * 0.0)
        head(m, H, jaw=p.jaw)
    arm(m, B, -1, p.hl, p.spread, p.curl)
    arm(m, B, 1, p.hr, p.spread, p.curl)
    leg(m, B, -1, p.sl)
    leg(m, B, 1, p.sr)
    tail(m, B, p.tail, p.tail_lift)
    for sx, fl, bd in ((-1, p.flap, p.bend), (1, p.flap_r or p.flap, p.bend_r or p.bend)):
        w = wing(sx, fl, p.sweep, bd, B, Bw=rotz(p.yaw) @ rotx(p.lean * 0.4))
        m.add(w)
        w.free()
    return m


def lifted(p, t_extra=0.0):
    m = build_imp(p)
    m.transform(scale(SC))
    m.transform(trans(0, 0, HOVER + p.z + t_extra))
    return m


def head_centre(p):
    B = body_frame(p)
    H = B @ trans(0.0, -0.03, 0.31) @ rotx(p.head_pitch)
    c = (H @ Vector(HEAD_C)) * SC
    return (c.x, c.y, c.z + HOVER + p.z)


def build(ctx):
    n = 6
    ink = dict(outline=1.3, inner=0.7)
    ctx.anim('imp_fly', n, lambda i: lifted(fly_pose(i / n)), ink=ink)
    ctx.anim('imp_attack', 3, lambda i: lifted(attack_pose(i)), ink=ink)
    hx = hy = hz = 0.0
    for i in range(n):
        c = head_centre(fly_pose(i / n))
        hx += c[0] / n
        hy += c[1] / n
        hz += c[2] / n
    ctx.anchor('head', 'imp', (hx, hy, hz))
    ctx.anchor('body', 'imp', (0.0, 0.0, HOVER))
    ctx.value('size', 'imp_head', round(HEAD_R[0] * 2 * SC * bl.UNITS_PER_M, 1))
    ctx.value('hover', 'imp', [HOVER, round(HOVER * bl.UNITS_PER_M, 1)])

    # ---- gibs, built around the origin so the pivot is their middle
    p0 = Pose(lean=0.0)
    g = Mesh('head')
    GH = trans(0, 0, -0.13) @ rotx(-0.35)
    head(g, GH, jaw=0.7)
    g.ball((0, 0.0, -0.02), (0.11, 0.1, 0.045), 'meat', mx=GH, seg=12, rings=6)
    g.capsule((0, 0, -0.05), (0, 0.02, 0.06), 0.028, 0.025, 'bone', mx=GH, seg=8, rings=3)
    g.ball((0.06, -0.04, -0.01), (0.05, 0.04, 0.035), 'blood', mx=GH, seg=8, rings=5)
    g.transform(scale(SC))
    ctx.one('imp_head', g, ink=ink)

    w = wing(1, 0.0, 0.0, 0.2, rotx(0.0))                      # a lone torn wing, lying flat with its root toward the camera
    w.ball((0.09, 0.12, 0.2), (0.075, 0.075, 0.05), 'meat', seg=10, rings=6)
    w.capsule((0.09, 0.12, 0.2), (0.0, 0.1, 0.2), 0.03, 0.026, 'bone', seg=8, rings=3)
    w.transform(trans(-0.5, -0.3, -0.2) @ rotz(0.3))
    w.transform(rotx(-0.15))
    w.transform(scale(SC))
    ctx.one('imp_wing', w, ink=ink)

    t = Mesh('torso')
    B = rotx(0.0)
    torso(t, B)
    t.ball((0, -0.01, 0.3), (0.1, 0.09, 0.05), 'meat', seg=10, rings=6)                              # torn neck, bone end
    t.capsule((0, -0.01, 0.3), (0, -0.01, 0.42), 0.034, 0.03, 'bone', seg=8, rings=3)
    t.ball((0.04, -0.04, 0.33), (0.045, 0.04, 0.03), 'blood', seg=8, rings=5)
    for sx in (-1, 1):                                                                              # torn off arms and wings
        t.ball((sx * 0.21, 0.0, 0.2), (0.06, 0.07, 0.07), 'meat', seg=10, rings=6)
        t.capsule((sx * 0.22, 0, 0.2), (sx * 0.3, 0, 0.2), 0.028, 0.024, 'bone', seg=8, rings=3)
        t.ball((sx * 0.1, 0.1, 0.24), (0.05, 0.04, 0.05), 'meat', seg=8, rings=5)
        t.ball((sx * 0.085, 0.0, -0.18), (0.065, 0.065, 0.045), 'meat', seg=8, rings=5)               # leg stumps
        t.capsule((sx * 0.085, 0, -0.18), (sx * 0.085, -0.02, -0.26), 0.022, 0.02, 'bone', seg=8, rings=3)
    t.ball((0, -0.12, -0.04), (0.1, 0.04, 0.07), 'guts', seg=10, rings=6)
    t.ball((0.05, -0.13, -0.1), (0.05, 0.035, 0.045), 'guts', seg=8, rings=5)
    t.transform(trans(0, 0, -0.05))
    t.transform(rotx(-0.45))
    t.transform(scale(SC))
    ctx.one('imp_torso', t, ink=ink)
