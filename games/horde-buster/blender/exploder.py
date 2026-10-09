"""The exploder: a bloated zombie (about 1.9 m) with a huge round belly swollen with glowing toxic yellow-green boils, sickly
green-yellow skin, a tiny head sunk between hunched shoulders, stubby arms flung up and short bare legs. It waddles fast toward the
hero and bursts in a toxic gore explosion. Also its gore parts.

Frames (default bl.PPM px/m, pivot = the ground under the body):
  exploder_walk_0..7     fast waddle: the belly jiggles, the boils pulse
  exploder_attack_0..3   swelling up before it bursts: the belly inflates, the boils grow and burn hotter, the veins crack open
  exploder_head, exploder_arm, exploder_leg, exploder_torso (the burst belly skin, an open bowl of torn skin), exploder_boil   gibs
Anchors: head.exploder (the head's centre on the walk frames, game units from the pivot), size.exploder_head.
The boils, cracks and eyes carry the emissive mask (the game makes them glow); in the attack frames the boils and cracks turn from
lime to a near-white yellow, so a brighter glow reads as "about to blow".
"""
import math

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Skeleton, Pose, walk, planted, at

PI = math.pi

SK = Skeleton(hip_h=0.58, hip_w=0.21, thigh=0.28, shin=0.28, spine=0.84, sh_w=0.37, upper=0.25, fore=0.22, neck=0.05, ankle_h=0.07)
HEAD_R = 0.18
# the belly ellipsoid in the spine frame (centre, radii)
BELLY_C = (0.0, -0.14, 0.3)
BELLY_R = (0.54, 0.47, 0.44)

mats.define('exp_skin', base='#b9c74b', base2='#8da63a', pattern='noise', pscale=5, pamt=0.7, bump=0.3, seed=71)
mats.define('exp_belly', base='#c4cc62', base2='#9cb04e', pattern='noise', pscale=4, pamt=0.7, bump=0.35, seed=72)
mats.define('exp_dark', base='#5f7f27', base2='#42601c', pattern='noise', pscale=7, pamt=0.6, bump=0.3, seed=73)
mats.define('exp_boil', base='#b4ff1c', emit=1.0, bevel=0.004)
mats.define('exp_boil_warm', base='#c8ff2a', emit=1.0, bevel=0.004)
mats.define('exp_boil_blaze', base='#dcff44', emit=1.0, bevel=0.004)
mats.define('exp_boil_hot', base='#fdffc0', emit=1.0, bevel=0.004)
mats.define('exp_rag', base='#8db3cc', base2='#5f84a3', pattern='noise', pscale=6, pamt=0.7, bump=0.2, seed=74)
mats.define('exp_eye', base='#f6ff62', emit=1.0, bevel=0.003)
mats.define('exp_drool', base='#aee63a', bevel=0.004)


# ------------------------------------------------------------------------------------------------ boils and veins

def _make_boils():
    """Boil positions as unit normals on the belly ellipsoid (a jittered golden-spiral on the front half), sizes and pulse phases.
    Deterministic, so every frame (and every run) carries the same boils."""
    seed = [1234567]

    def rnd():
        seed[0] = (seed[0] * 1103515245 + 12345) & 0x7fffffff
        return seed[0] / 0x7fffffff

    ga = PI * (3.0 - math.sqrt(5.0))
    n = 50
    out = []
    for i in range(n):
        z = 1.0 - 2.0 * (i + 0.5) / n
        rr = math.sqrt(max(0.0, 1.0 - z * z))
        x, y = rr * math.cos(i * ga), rr * math.sin(i * ga)
        x += (rnd() - 0.5) * 0.2
        y += (rnd() - 0.5) * 0.2
        z += (rnd() - 0.5) * 0.2
        L = math.sqrt(x * x + y * y + z * z)
        x, y, z = x / L, y / L, z / L
        if y > 0.12 or z < -0.55:          # the back and the underside never show
            continue
        r = 0.045 + 0.055 * rnd()
        r *= 0.8 + 0.5 * max(0.0, -y)       # bigger toward the camera
        out.append([(x, y, z), r, rnd() * 2 * PI])
    # a few really big ones facing the camera, so the belly reads as boil-covered from far away
    out.sort(key=lambda b: b[0][1] - b[0][2] * 0.2)
    for b in out[:4]:
        b[1] = max(b[1], 0.115)
    return [tuple(b) for b in out]


BOILS = _make_boils()


def _make_veins():
    """Each boil is joined to its nearest neighbour by a curve over the belly: dark veins that crack open and glow as it swells."""
    links = set()
    veins = []
    for i, (ni, _, _) in enumerate(BOILS):
        if i % 2:
            continue
        best, bj = -2.0, -1
        for j, (nj, _, _) in enumerate(BOILS):
            if j == i:
                continue
            d = ni[0] * nj[0] + ni[1] * nj[1] + ni[2] * nj[2]
            if d > best and (min(i, j), max(i, j)) not in links:
                best, bj = d, j
        if bj < 0:
            continue
        links.add((min(i, bj), max(i, bj)))
        a, b = ni, BOILS[bj][0]
        om = math.acos(max(-1.0, min(1.0, best)))
        if om < 1e-3:
            continue
        pts = []
        for k in range(6):
            t = k / 5.0
            s0, s1 = math.sin((1 - t) * om) / math.sin(om), math.sin(t * om) / math.sin(om)
            pts.append(tuple(a[c] * s0 + b[c] * s1 for c in range(3)))
        veins.append(pts)
    return veins


VEINS = _make_veins()


def belly_pt(n, k=1.0, out=0.0, dz=0.0, dy=0.0):
    """A point on (or just off) the belly ellipsoid in the spine frame: n a unit direction, k the inflation."""
    c, r = BELLY_C, BELLY_R
    return (c[0] + n[0] * (r[0] * k + out), c[1] + dy + n[1] * (r[1] * k + out), c[2] + dz + n[2] * (r[2] * k + out))


# ------------------------------------------------------------------------------------------------ parts

def head(m, F, jaw=0.5, mx=None):
    """A tiny head: bulging glowing eyes under an angry brow, a stub nose, a loose open jaw dripping toxic slime, a boil on the temple."""
    H = F['head'] if mx is None else mx
    R = HEAD_R
    m.ball((0, 0, R * 0.95), (R, R * 0.92, R), 'exp_skin', mx=H)
    m.ball((0.06, 0.03, R * 1.75), (0.06, 0.05, 0.04), 'exp_skin', mx=H)                      # lump on the scalp
    m.capsule((-0.12, -0.11, R * 1.3), (0.12, -0.11, R * 1.3), 0.03, 0.03, 'exp_dark', mx=H)    # heavy brow
    for sx in (-1, 1):
        m.ball((sx * 0.075, -R * 0.74, R * 1.0), (0.058, 0.04, 0.06), 'mouth', mx=H)            # sockets
        m.ball((sx * 0.075, -R * 0.82, R * 1.0), (0.05, 0.034, 0.052), 'exp_eye', mx=H)         # big glowing eyes
        m.ball((sx * 0.07, -R * 0.93, R * 1.0), (0.016, 0.01, 0.022), 'pupil', mx=H)
        m.ball((sx * R * 0.98, 0.0, R * 0.95), (0.03, 0.05, 0.06), 'exp_skin', mx=H)           # ears
    m.ball((0, -R * 0.93, R * 0.7), (0.03, 0.03, 0.035), 'exp_skin', mx=H)                      # nose stub
    # the temple boil
    m.ball((0.15, -0.04, R * 1.3), (0.045, 0.045, 0.045), 'exp_dark', mx=H)
    m.ball((0.165, -0.05, R * 1.33), (0.032, 0.032, 0.032), 'exp_boil', mx=H)
    J = H @ trans(0, -0.03, R * 0.55) @ rotx(jaw)
    m.ball((0, -0.09, -0.04), (0.115, 0.095, 0.06), 'exp_skin', mx=J)
    m.ball((0, -0.12, 0.0), (0.09, 0.05, 0.03), 'mouth', mx=J)
    m.ball((0, -0.12, -0.005), (0.05, 0.03, 0.018), 'tongue', mx=J)
    for x in (-0.05, 0.0, 0.05):
        m.box(x - 0.011, x + 0.011, -0.18, -0.15, 0.0, 0.025, 'teeth', mx=J)
    m.capsule((0.02, -0.15, -0.05), (0.025, -0.16, -0.2), 0.014, 0.01, 'exp_drool', mx=J)      # slime drool
    m.ball((0.025, -0.16, -0.21), (0.02, 0.02, 0.03), 'exp_drool', mx=J)


def boil(m, n, r, k, mx, scale_=1.0, hot=0, bounce=0.0, dy=0.0):
    """One pustule: a dark green collar on the belly skin, a glowing dome and a paler hot core. hot 0..3 turns the dome from
    lime to near white and swells the core."""
    r = r * scale_
    m.ball(belly_pt(n, k, -0.15 * r, bounce, dy), (r * 1.3, r * 1.3, r * 1.3), 'exp_dark', mx=mx, seg=12, rings=8)
    m.ball(belly_pt(n, k, 0.45 * r, bounce, dy), (r, r, r), ('exp_boil', 'exp_boil', 'exp_boil_warm', 'exp_boil_blaze')[hot], mx=mx, seg=12, rings=8)
    c = 0.48 + 0.1 * hot
    m.ball(belly_pt(n, k, 1.1 * r, bounce, dy), (r * c, r * c, r * c), 'exp_boil_hot', mx=mx, seg=10, rings=6)


def torso(m, F, k=1.0, boils=1.0, hot=0, vein=0.0, t=0.0, bounce=0.0):
    """The belly (an ellipsoid of stretched, shiny skin), the boils on it, veins, a torn pale-blue gown clinging to the small chest."""
    S = F['spine']
    dy = -0.1 * (k - 1.0)                                  # swelling pushes the belly forward and a little up
    dz = bounce + 0.05 * (k - 1.0)
    m.ball((0, 0.02, 0.0), (0.3, 0.23, 0.17), 'pants', mx=S)                                      # shorts, mostly under the belly
    c, r = BELLY_C, BELLY_R
    m.ball((c[0], c[1] + dy, c[2] + dz), (r[0] * k, r[1] * k, r[2] * k), 'exp_belly', mx=S, seg=30, rings=18)
    m.ball((0, 0.08, 0.76), (0.33, 0.24, 0.22), 'exp_rag', mx=S)                                   # chest in a torn gown
    m.ball((0, 0.1, 0.82), (0.36, 0.2, 0.1), 'exp_skin', mx=S)                                      # fat shoulders and neck rolls
    # the gown's ragged hem hangs over the top of the belly
    for i in range(11):
        a = -1.25 + 2.5 * i / 10
        nn = (math.sin(a) * 0.8, -math.cos(a) * 0.8, 0.6)
        p0 = belly_pt(nn, k, 0.0, dz, dy)
        p1 = belly_pt(nn, k, 0.02, dz - 0.14 - 0.06 * (i % 3), dy)
        m.cyl(p0, (p1[0], p1[1], p1[2]), 0.05, 0.0, 'exp_rag', seg=5, mx=S)
    m.ball(belly_pt((0.0, -0.98, -0.1), k, 0.0, dz, dy), (0.045, 0.02, 0.045), 'exp_dark', mx=S)    # navel
    # veins over the belly: dark green at first, glowing cracks as it is about to burst
    vm = 'exp_boil_hot' if vein > 2.5 else 'exp_boil' if vein > 1.5 else 'exp_dark'
    vr = 0.012 + 0.01 * vein
    for pts in VEINS:
        m.tube([belly_pt(p, k, 0.006 + 0.004 * vein, dz, dy) for p in pts], vr, vm, seg=5, mx=S, cap=False)
    for i, (n, rad, ph) in enumerate(BOILS):
        pulse = 1.0 + 0.1 * math.sin(2 * PI * t + ph)
        boil(m, n, rad, k, S, boils * pulse, hot, dz, dy)


def neck(m, F):
    m.capsule(at(F['chest'], 0, 0, -0.04), at(F['head'], 0, 0, 0.05), 0.12, 0.1, 'exp_skin')


def stump(m, F):
    """Where the head was: torn skin, red meat, a spine end (unused by the walk, used by the torso gib)."""
    C = F['chest']
    m.capsule(at(C), at(C, 0, 0, 0.06), 0.1, 0.09, 'exp_skin')
    m.ball(at(C, 0, 0, 0.08), (0.09, 0.09, 0.03), 'meat')
    m.capsule(at(C, 0, 0, 0.06), at(C, 0, 0, 0.13), 0.025, 0.022, 'bone')


def arm(m, F, side, cut=False):
    """A stubby, thick arm in a torn gown sleeve, a small clawed hand and a pustule on the forearm."""
    sh, el, ha = F['sh_' + side], F['elbow_' + side], F['hand_' + side]
    if cut:
        m.cyl(at(sh), at(el), 0.125, 0.105, 'exp_rag', seg=14)
        m.ball(at(sh), (0.125, 0.125, 0.04), 'meat')
        m.capsule(at(sh, 0, 0, -0.02), at(sh, 0, 0, 0.08), 0.03, 0.026, 'bone')
        m.ball(at(sh, 0.05, -0.04, 0.02), (0.04, 0.04, 0.025), 'blood')
    else:
        m.ball(at(sh), (0.15, 0.15, 0.15), 'exp_rag')
        m.capsule(at(sh), at(el), 0.125, 0.105, 'exp_rag')
    m.ball(at(el), (0.1, 0.1, 0.1), 'exp_skin')
    m.capsule(at(el), at(ha), 0.095, 0.08, 'exp_skin')
    m.ball(at(ha, 0.06, -0.06, -0.1), (0.04, 0.04, 0.04), 'exp_dark')
    m.ball(at(ha, 0.07, -0.075, -0.1), (0.028, 0.028, 0.028), 'exp_boil')
    m.ball(at(ha, 0, 0, -0.05), (0.09, 0.07, 0.09), 'exp_skin')
    for i, a in enumerate((-0.5, 0.0, 0.5)):
        kf = ha @ rotz(a * 0.4) @ rotx(-0.5)
        m.capsule(at(kf, a * 0.09, -0.03, -0.08), at(kf, a * 0.12, -0.04, -0.18), 0.026, 0.02, 'exp_skin')
        m.capsule(at(kf, a * 0.12, -0.04, -0.18), at(kf, a * 0.13, -0.03, -0.215), 0.016, 0.008, 'claw')


def leg(m, F, side, cut=False):
    """A short thick leg in a torn shorts leg, a bare shin and a flat bare foot with fat toes."""
    hip, kn, an = F['hip_' + side], F['knee_' + side], F['ankle_' + side]
    if cut:
        m.cyl(at(hip), at(kn), 0.13, 0.105, 'pants', seg=14)
        m.ball(at(hip), (0.13, 0.13, 0.04), 'meat')
        m.capsule(at(hip, 0, 0, -0.02), at(hip, 0, 0, 0.08), 0.032, 0.028, 'bone')
        m.ball(at(hip, -0.05, -0.04, 0.02), (0.04, 0.04, 0.025), 'blood')
    else:
        m.capsule(at(hip), at(kn), 0.155, 0.125, 'pants')
    m.ball(at(kn), (0.12, 0.12, 0.12), 'exp_skin')
    m.capsule(at(kn), at(an), 0.12, 0.1, 'exp_skin')
    R = an.to_3x3().to_4x4()
    m.ball(at(an, 0, -0.07, -0.03), (0.095, 0.17, 0.055), 'exp_skin', rot=R)
    for x in (-0.06, 0.0, 0.06):
        m.ball(at(an, x, -0.21, -0.04), (0.034, 0.045, 0.034), 'exp_skin', rot=R)
        m.ball(at(an, x, -0.245, -0.04), (0.018, 0.02, 0.018), 'claw', rot=R)


def body(p, parts=('head', 'torso', 'arm_l', 'arm_r', 'leg_l', 'leg_r'), k=1.0, boils=1.0, hot=0, vein=0.0, t=0.0, bounce=0.0):
    p = planted(SK, p)
    F = SK.frames(p)
    m = Mesh('exploder')
    if 'torso' in parts:
        torso(m, F, k, boils, hot, vein, t, bounce)
        neck(m, F)
    if 'head' in parts:
        head(m, F, jaw=p.jaw or 0.5)
    for s in ('l', 'r'):
        if 'arm_' + s in parts:
            arm(m, F, s)
        if 'leg_' + s in parts:
            leg(m, F, s)
    return m


# ------------------------------------------------------------------------------------------------ poses

def waddle(t):
    """Fast waddle: short quick steps, the whole body rolling from side to side, arms flailing up, face turned up at the camera."""
    p = walk(t, stride=0.42, knee=0.6, arm=0.0, bob=0.05, lean=0.14, sway=0.05, roll=0.15)
    a = 2 * PI * t
    s = math.sin(a)
    p['sh_l'] = 2.05 + 0.3 * math.sin(a + 0.5)
    p['sh_r'] = 2.05 + 0.3 * math.sin(a + PI + 0.5)
    p['sh_out_l'] = 0.55
    p['sh_out_r'] = 0.55
    p['elbow_l'] = 0.5
    p['elbow_r'] = 0.5
    p['head_pitch'] = -0.8
    p['head_roll'] = 0.12 * s
    p['head_yaw'] = 0.1 * math.sin(a * 0.5)
    p['jaw'] = 0.5 + 0.2 * max(0.0, math.sin(a * 2))
    p['hip_out_l'] = 0.14
    p['hip_out_r'] = 0.14
    return p


def swell(i):
    """Swelling up (0..3): feet planted wide, arms flung out, head thrown back, trembling harder every frame."""
    sh = 0.014 * i * (1 if i % 2 else -1)
    p = Pose(sway=sh, bob=0.012 * i * (-1 if i % 2 else 1), lean=0.1 - 0.06 * i, knee_l=0.4, knee_r=0.4, hip_l=0.18, hip_r=0.18,
             hip_out_l=0.24, hip_out_r=0.24, sh_l=1.7 + 0.2 * i, sh_r=1.7 + 0.2 * i, sh_out_l=0.9 + 0.15 * i, sh_out_r=0.9 + 0.15 * i,
             elbow_l=0.35, elbow_r=0.35, head_pitch=-0.85 - 0.05 * i, jaw=0.8 + 0.08 * i, roll=0.03 * sh / 0.014 if i else 0.0)
    return p


ATTACK = [  # belly inflation, boil scale, hot colour, vein glow
    (1.06, 1.2, 0, 0.0),
    (1.17, 1.33, 1, 1.0),
    (1.29, 1.46, 2, 2.0),
    (1.42, 1.6, 3, 3.0),
]


def build(ctx):
    def bounce(t):
        return 0.025 * math.cos(2 * 2 * PI * t + 0.9)
    ctx.anim('exploder_walk', 8, lambda i: body(waddle(i / 8), k=1.0 + 0.025 * math.sin(2 * 2 * PI * i / 8 + 1.2), t=i / 8,
                                                bounce=bounce(i / 8)))
    ctx.anim('exploder_attack', 4, lambda i: body(swell(i), k=ATTACK[i][0], boils=ATTACK[i][1], hot=ATTACK[i][2], vein=ATTACK[i][3],
                                                  t=i / 4))
    hx = hy = hyy = 0.0
    for i in range(8):
        F = SK.frames(planted(SK, waddle(i / 8)))
        c = F['head'] @ trans(0, 0, HEAD_R * 0.95)
        hx += c.translation.x / 8
        hy += c.translation.z / 8
        hyy += c.translation.y / 8
    ctx.anchor('head', 'exploder', (hx, hyy, hy))
    ctx.value('size', 'exploder_head', round(HEAD_R * 2 * bl.UNITS_PER_M, 1))

    # gibs: built around the origin so the pivot is their middle
    F0 = SK.frames(Pose())
    g = Mesh('head')
    head(g, F0, jaw=0.7, mx=trans(0, 0, -HEAD_R * 0.95))
    g.ball((0, 0, -HEAD_R * 0.8), (0.09, 0.09, 0.035), 'meat')
    g.capsule((0, 0, -HEAD_R * 0.95), (0, 0, -HEAD_R * 0.5), 0.024, 0.022, 'bone')
    ctx.one('exploder_head', g)

    a = Mesh('arm')
    Fa = SK.frames(Pose(sh_l=0.0))
    arm(a, Fa, 'l', cut=True)
    a.transform(trans(*(-v for v in at(Fa['elbow_l']))))
    a.transform(roty(PI / 2))
    a.transform(rotz(-0.6))
    ctx.one('exploder_arm', a)

    lg = Mesh('leg')
    leg(lg, F0, 'r', cut=True)
    lg.transform(trans(*(-v for v in at(F0['knee_r']))))
    lg.transform(roty(-PI / 2))
    lg.transform(rotz(0.6))
    ctx.one('exploder_leg', lg)

    ctx.one('exploder_torso', burst_belly())

    bm = Mesh('boil')                         # a whole boil that came off: lime dome, hot core, ragged skin ring
    bm.ball((0, 0, 0), (0.17, 0.17, 0.15), 'exp_dark', seg=16, rings=10)
    bm.ball((0, -0.03, 0.03), (0.125, 0.125, 0.115), 'exp_boil', seg=16, rings=10)
    bm.ball((-0.02, -0.07, 0.07), (0.07, 0.06, 0.06), 'exp_boil_hot', seg=12, rings=8)
    bm.ball((0.06, -0.1, -0.02), (0.03, 0.03, 0.03), 'exp_boil', seg=10, rings=6)
    for k in range(7):
        ang = 2 * PI * k / 7
        bm.cyl((0.14 * math.cos(ang), 0.02, 0.12 * math.sin(ang)), (0.2 * math.cos(ang), 0.02, 0.17 * math.sin(ang)), 0.035, 0.0, 'exp_skin', seg=5)
    ctx.one('exploder_boil', bm)


def burst_belly():
    """The torn belly skin: an open bowl of stretched yellow skin, raw red inside with a glowing green sludge and guts, ragged teeth
    along the rim. Opening turned toward the camera."""
    m = Mesh('torso')
    R, tmax = 0.5, 1.95

    def prof(r, t0=0.0, n=10):
        return [(r * math.cos(t0 + (tmax - t0) * i / n), r * math.sin(t0 + (tmax - t0) * i / n)) for i in range(n + 1)]
    m.lathe(prof(R), 'exp_belly', seg=26, smooth=80.0, cap=False)
    m.lathe(prof(R * 0.93), 'meat', seg=26, smooth=80.0, cap=False)
    rim_r, rim_z = R * math.sin(tmax), R * math.cos(tmax)
    ring = [(rim_r * math.cos(2 * PI * j / 22), rim_r * math.sin(2 * PI * j / 22), rim_z) for j in range(23)]
    m.tube(ring, 0.035, 'guts', seg=6, cap=False)                     # the raw torn edge
    for j in range(13):                                               # torn flaps of skin around the rim
        ang = 2 * PI * j / 13 + 0.2
        c, s = math.cos(ang), math.sin(ang)
        ln = 0.13 + 0.07 * (j % 3)
        m.cyl((rim_r * c, rim_r * s, rim_z), (rim_r * 1.2 * c, rim_r * 1.2 * s, rim_z - ln), 0.07, 0.0, 'exp_belly', seg=5)
    # popped boils on the outside, just craters and torn collars
    for n in ((0.5, 0.3, 0.8), (-0.6, 0.2, 0.7), (0.0, 0.7, 0.6), (-0.3, -0.5, 0.75)):
        L = math.sqrt(sum(v * v for v in n))
        p = tuple(R * v / L for v in n)
        m.ball(p, (0.09, 0.09, 0.05), 'exp_dark', seg=10, rings=6)
        m.ball(tuple(v * 1.01 for v in p), (0.05, 0.05, 0.03), 'meat', seg=10, rings=6)
    # sludge and guts inside
    for (x, y, z, r) in ((0.0, 0.0, 0.3, 0.11), (0.14, 0.06, 0.26, 0.08), (-0.15, -0.05, 0.25, 0.09), (0.05, -0.15, 0.22, 0.06)):
        m.ball((x, y, z), (r, r, r * 0.7), 'exp_boil', seg=12, rings=8)
        m.ball((x, y, z + 0.02), (r * 0.5, r * 0.5, r * 0.4), 'exp_boil_hot', seg=10, rings=6)
    m.tube([(-0.25, 0.1, 0.2), (-0.1, 0.2, 0.18), (0.05, 0.12, 0.2), (0.2, 0.2, 0.15), (0.3, 0.05, 0.12), (0.25, -0.12, 0.1)],
           0.035, 'guts', seg=6)
    m.tube([(0.2, -0.2, 0.08), (0.05, -0.28, 0.1), (-0.12, -0.22, 0.12), (-0.28, -0.1, 0.1)], 0.028, 'guts', seg=6)
    m.transform(rotx(-2.0))
    m.transform(trans(0, 0, 0.04))
    return m
