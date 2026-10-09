"""The spitter: a blue one-eyed blob, mostly head, with one huge glowing eye and a wide mouth dribbling glowing green acid.

Frames (default px/m, pivot = the ground under the body):
  spitter_walk_0..5      waddle cycle (head squashes and stretches, drool swings)
  spitter_attack_0..3    cheeks inflate (0), rears back (1), spits forward (2), recovers (3)
  spitter_eye, spitter_head (upper half, empty socket), spitter_leg, spitter_torso   gibs (pivot = centre of mass)
Anchors: mouth.spitter (the mouth on attack frame 2), head.spitter (the head's centre, averaged over the walk), size.spitter_head.
The creature faces -Y; the face is tilted up toward the camera. Spots are modelled (flat discs stuck on the skin), not a texture,
so they ride with the head instead of swimming.
"""
import math

from mathutils import Matrix, Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Skeleton, Pose, walk, planted, at

PI = math.pi

mats.define('spitter_skin', base='#3d8fe0', base2='#2f74c0', pattern='noise', pscale=4, pamt=0.5, bump=0.25, seed=41)
mats.define('spitter_lump', base='#63b0f2', base2='#4a98e0', pattern='noise', pscale=5, pamt=0.5, bump=0.3, seed=42)
mats.define('spitter_spot', base='#2757ad', bevel=0.006)
mats.define('spitter_belly', base='#a6d8ff', base2='#7fbdf5', pattern='noise', pscale=5, pamt=0.5, bump=0.2, seed=43)
mats.define('spitter_lip', base='#8fcbff', bevel=0.01)
mats.define('spitter_sclera', base='#f6f8ee', emit=0.3, bevel=0.005)
mats.define('spitter_iris', base='#ffe21f', emit=1.0, bevel=0.003)
mats.define('spitter_vein', base='#d6444f', bevel=0.004)
mats.define('spitter_acid', base='#7cff6b', emit=1.0, bevel=0.01)
mats.define('spitter_acid_deep', base='#46d63a', emit=0.7, bevel=0.01)
mats.define('spitter_nerve', base='#f08a96', base2='#c85a6c', pattern='noise', pscale=9, pamt=0.6, bump=0.5, seed=44)

SK = Skeleton(hip_h=0.34, hip_w=0.17, thigh=0.17, shin=0.17, spine=0.24, sh_w=0.34, upper=0.17, fore=0.16, neck=0.0, ankle_h=0.06)
HC = Vector((0.0, 0.0, 0.3))        # head centre in the head frame
HR0 = (0.5, 0.45, 0.48)            # head radii
EC = Vector((0.0, -0.265, 0.44))    # eye centre in the head frame
ER = (0.31, 0.21, 0.3)              # eyeball radii


def surf_frame(hr, x, z):
    """Frame on the front of the head ellipsoid at (x, z) in head coordinates: X right, Y up the skin, Z out of it."""
    q = max(1.0 - (x / hr[0]) ** 2 - ((z - HC.z) / hr[2]) ** 2, 0.02)
    y = HC.y - hr[1] * math.sqrt(q)
    n = Vector((x / hr[0] ** 2, (y - HC.y) / hr[1] ** 2, (z - HC.z) / hr[2] ** 2)).normalized()
    up = (Vector((0, 0, 1)) - n * n.z).normalized()
    r = up.cross(n)
    return Matrix(((r.x, up.x, n.x, x), (r.y, up.y, n.y, y), (r.z, up.z, n.z, z), (0, 0, 0, 1)))


def head(m, H, hr=HR0, open=0.0, puff=0.0, drool=0.0, jet=0.0, eye=True, half=False):
    """The head in frame H. open: mouth open 0..1, puff: cheeks blown up 0..1, drool: phase of the swinging drool,
    jet: a stream of acid leaving the mouth 0..1; eye=False leaves an empty bloody socket; half: only the part above the
    mouth (the head gib), open at the bottom."""
    rx, ry, rz = hr
    if half:
        cut = -0.2   # sine of the lowest latitude kept
        prof = [(math.sin(a), math.cos(a)) for a in [math.asin(cut) + (PI / 2 - math.asin(cut)) * i / 10 for i in range(11)]]
        m.lathe(prof, 'spitter_skin', mx=H @ trans(*HC) @ Matrix.Diagonal((rx, ry, rz, 1.0)), seg=26, smooth=80.0, cap=False)
    else:
        m.ball(HC, hr, 'spitter_skin', mx=H, seg=26, rings=14)
    # lumps: a bumpy skull
    for d, r in (((-0.55, 0.15, 0.82), 0.12), ((0.5, 0.2, 0.85), 0.13), ((0.0, 0.45, 0.9), 0.11), ((-0.25, 0.6, 0.76), 0.1),
                 ((0.82, -0.05, 0.56), 0.1), ((-0.86, -0.1, 0.5), 0.11), ((0.3, 0.7, 0.65), 0.09), ((-0.75, 0.4, 0.5), 0.1)):
        v = Vector(d).normalized()
        if half and v.z < 0.3:
            continue
        m.ball(HC + Vector((v.x * rx * 0.97, v.y * ry * 0.97, v.z * rz * 0.97)), r, 'spitter_lump', mx=H, seg=10, rings=6)
    # spots stuck on the skin
    for x, z, r in ((-0.36, 0.58, 0.07), (0.34, 0.63, 0.08), (-0.43, 0.3, 0.055), (0.41, 0.26, 0.06), (0.17, 0.74, 0.045),
                    (-0.2, 0.74, 0.05), (0.0, -0.03, 0.0)):
        if r > 0:
            m.ball((0, 0, 0.0), (r, r * 0.92, 0.02), 'spitter_spot', mx=H @ surf_frame(hr, x, z), seg=10, rings=5)
    # ---- the eye
    if eye:
        m.ball(EC, ER, 'spitter_sclera', mx=H, seg=22, rings=12)
        yi = EC.y - ER[1] * 0.97
        m.ball((0, yi - 0.01, EC.z - 0.01), (0.175, 0.05, 0.175), 'spitter_iris', mx=H, seg=16, rings=8)
        m.ball((0.005, yi - 0.04, EC.z - 0.015), (0.085, 0.032, 0.105), 'pupil', mx=H, seg=12, rings=7)
        m.ball((0.06, yi - 0.062, EC.z + 0.055), (0.036, 0.016, 0.04), 'eye_white', mx=H, seg=8, rings=5)
        # red veins creeping in from the rim
        for k in range(7):
            a = 2 * PI * k / 7 + 0.3
            pts = []
            for rr in (0.97, 0.78, 0.6, 0.5):
                vx, vz = math.cos(a + 0.12 * (1 - rr)) * ER[0] * rr, math.sin(a + 0.12 * (1 - rr)) * ER[2] * rr
                q = max(1 - (vx / ER[0]) ** 2 - (vz / ER[2]) ** 2, 0.0)
                pts.append(EC + Vector((vx, -ER[1] * math.sqrt(q) - 0.003, vz)))
            if math.sin(a) < 0.7:
                for p0, p1, w in zip(pts[:-1], pts[1:], (0.011, 0.009, 0.007)):
                    m.capsule(p0, p1, w, w * 0.8, 'spitter_vein', mx=H, seg=6, rings=2)
        # heavy lids: a bulging upper lid slanted a little with a lumpy brow over it, and a lower lid
        m.ball(EC + Vector((0.0, 0.0, 0.215)), (0.35, 0.25, 0.115), 'spitter_skin', mx=H @ roty(0.1), seg=18, rings=8)
        for bx, bz, br in ((-0.2, 0.3, 0.075), (0.0, 0.325, 0.085), (0.2, 0.3, 0.075)):
            m.ball(EC + Vector((bx, -0.09, bz)), (br * 1.2, br * 0.8, br * 0.85), 'spitter_lump', mx=H @ roty(0.1), seg=10, rings=6)
        m.ball(EC + Vector((0.0, 0.0, -0.25)), (0.32, 0.21, 0.075), 'spitter_skin', mx=H, seg=16, rings=7)
    else:
        m.ball(EC + Vector((0, -0.12, 0)), (0.27, 0.12, 0.27), 'meat', mx=H, seg=16, rings=8)
        m.ball(EC + Vector((0, -0.17, 0.02)), (0.17, 0.09, 0.17), 'blood', mx=H, seg=12, rings=7)
    if half:
        return
    # ---- the wide mouth: a smiling band of dark, ringed by pale lips, built from patches that each hug the skin
    zm = 0.05 - 0.02 * open
    nseg = 9
    for i in range(nseg):
        u = (i / (nseg - 1)) * 2 - 1
        x = u * (0.27 + 0.03 * puff)
        z = zm + 0.075 * u * u - 0.03 * open
        S = H @ surf_frame(hr, x, z)
        h = 0.05 + 0.1 * open
        ends = 1.0 - 0.35 * u * u
        m.ball((0, 0, 0.0), (0.062, (h + 0.03) * ends, 0.04), 'spitter_lip', mx=S, seg=10, rings=5)
        m.ball((0, 0, 0.016), (0.055, h * ends, 0.03), 'mouth', mx=S, seg=10, rings=5)
        if open > 0.3 and abs(u) < 0.8:
            m.ball((0, -h * ends * 0.35, 0.03), (0.05, h * ends * 0.5, 0.018), 'spitter_acid_deep', mx=S, seg=8, rings=4)
    # teeth along the top edge (a few big ones) and the bottom
    for u in (-0.55, -0.18, 0.18, 0.55):
        z = zm + 0.075 * u * u - 0.03 * open
        S = H @ surf_frame(hr, u * 0.27, z)
        hh = 0.05 + 0.1 * open
        m.box(-0.026, 0.026, hh * 0.45, hh * 1.0 + 0.012, 0.0, 0.05, 'teeth', mx=S, bevel=0.006)
    for u in (-0.36, 0.0, 0.36):
        z = zm + 0.075 * u * u - 0.03 * open
        S = H @ surf_frame(hr, u * 0.27, z)
        hh = 0.05 + 0.1 * open
        m.box(-0.022, 0.022, -hh * 1.0 - 0.012, -hh * 0.5, 0.0, 0.045, 'teeth', mx=S, bevel=0.005)
    # cheeks that blow up when it prepares to spit
    if puff > 0:
        for sx in (-1, 1):
            S = H @ surf_frame(hr, sx * 0.36, 0.06)
            m.ball((0, 0, 0.0), (0.1 + 0.1 * puff, 0.13 + 0.11 * puff, 0.06 + 0.1 * puff), 'spitter_lump', mx=S, seg=14, rings=8)
            S2 = H @ surf_frame(hr, sx * 0.4, 0.04)
            m.ball((0.0, 0.0, 0.03), (0.055 + 0.05 * puff, 0.07 + 0.06 * puff, 0.04), 'spitter_spot', mx=S2, seg=8, rings=5)
    # glowing acid drool from the lower lip: strands with fat drops
    zl = zm - 0.05 - 0.1 * open
    for k, (x, ln) in enumerate(((-0.17, 0.13), (0.03, 0.2), (0.19, 0.11))):
        sw = 0.012 * math.sin(drool + k * 2.1)
        S = H @ surf_frame(hr, x, zl + 0.04)
        ln = ln * (1 + 0.18 * math.sin(drool * 1.0 + k * 1.3)) + 0.05 * open
        top = Vector((0, -0.01, 0.0))
        bot = Vector((sw, 0.0, 0.0)) + Vector((0, -ln, 0.0))
        m.capsule(top, bot, 0.016, 0.011, 'spitter_acid', mx=S, seg=8, rings=3)
        m.ball(bot + Vector((0, -0.02, 0.0)), (0.032, 0.036, 0.032), 'spitter_acid', mx=S, seg=10, rings=6)
    if jet > 0:
        # a glob of acid spat from the mouth, forward (toward the camera) with drops trailing behind it
        S = H @ surf_frame(hr, 0.0, zm - 0.02)
        m.ball((0, 0, 0.1), (0.1 * jet, 0.07 * jet, 0.09 * jet), 'spitter_acid', mx=S, seg=12, rings=7)           # out of the mouth
        m.ball((0, 0.01, 0.3), (0.15 * jet, 0.15 * jet, 0.16 * jet), 'spitter_acid', mx=S, seg=14, rings=8)       # the glob
        m.ball((0.02, 0.0, 0.34), (0.05 * jet, 0.05 * jet, 0.05 * jet), 'eye_white', mx=S, seg=8, rings=5)          # shine
        for dx, dy, dz, r in ((-0.17, 0.05, 0.2, 0.045), (0.2, 0.0, 0.24, 0.04), (-0.08, -0.16, 0.34, 0.035), (0.12, 0.14, 0.4, 0.03)):
            m.ball((dx * jet, dy * jet, dz), (r * jet, r * jet, r * jet), 'spitter_acid', mx=S, seg=8, rings=5)


def torso(m, F, belly=True):
    P, S = F['pelvis'], F['spine']
    m.ball((0, 0, 0.02), (0.25, 0.21, 0.15), 'spitter_skin', mx=P, seg=16, rings=9)
    m.ball((0, -0.03, 0.18), (0.31, 0.25, 0.27), 'spitter_skin', mx=S, seg=18, rings=10)
    m.ball((0, -0.15, 0.14), (0.21, 0.14, 0.2), 'spitter_belly', mx=S, seg=16, rings=9)
    for sx, z in ((-0.1, 0.12), (0.12, 0.2), (0.0, 0.06)):
        m.ball((sx, -0.275, z), (0.035, 0.02, 0.035), 'spitter_spot', mx=S, seg=8, rings=5)


def arm(m, F, side):
    sh, el, ha = F['sh_' + side], F['elbow_' + side], F['hand_' + side]
    m.ball(at(sh), 0.1, 'spitter_skin', seg=12, rings=7)
    m.capsule(at(sh), at(el), 0.082, 0.07, 'spitter_skin')
    m.capsule(at(el), at(ha), 0.07, 0.06, 'spitter_skin')
    m.ball(at(ha, 0, 0, -0.03), (0.085, 0.065, 0.075), 'spitter_belly', seg=12, rings=7)
    for a in (-0.7, 0.0, 0.7):
        k = ha @ rotz(a * 0.5) @ rotx(-0.4)
        m.capsule(at(k, a * 0.08, -0.02, -0.07), at(k, a * 0.12, -0.03, -0.17), 0.027, 0.02, 'spitter_belly', seg=8, rings=2)
        m.capsule(at(k, a * 0.12, -0.03, -0.17), at(k, a * 0.13, -0.025, -0.215), 0.017, 0.006, 'horn', seg=6, rings=2)


def leg(m, F, side, cut=False):
    hip, kn, an = F['hip_' + side], F['knee_' + side], F['ankle_' + side]
    if cut:   # a gib: the thigh ends in a flat tear
        m.cyl(at(hip), at(kn), 0.115, 0.1, 'spitter_skin', seg=14)
    else:
        m.capsule(at(hip), at(kn), 0.115, 0.1, 'spitter_skin')
    m.capsule(at(kn), at(an), 0.095, 0.08, 'spitter_skin')
    R = an.to_3x3().to_4x4()
    m.ball(at(an, 0, -0.07, -0.04), (0.115, 0.17, 0.075), 'spitter_lump', rot=R, seg=14, rings=8)
    for sx in (-1, 0, 1):                                     # three round toes
        m.ball(at(an, sx * 0.06, -0.2, -0.05), (0.04, 0.045, 0.04), 'spitter_belly', rot=R, seg=8, rings=5)


def body(p, parts=('head', 'torso', 'arm_l', 'arm_r', 'leg_l', 'leg_r')):
    p = planted(SK, p)
    F = SK.frames(p)
    m = Mesh('spitter')
    if 'torso' in parts:
        torso(m, F)
    sq = 1.0 + 0.05 * (p.sq or 0.0)
    hr = (HR0[0] / math.sqrt(sq) * (1.0 + 0.1 * p.puff), HR0[1] / math.sqrt(sq), HR0[2] * sq)
    if 'head' in parts:
        head(m, F['head'], hr, open=p.open, puff=p.puff, drool=p.drool, jet=p.jet)
    for s in ('l', 'r'):
        if 'arm_' + s in parts:
            arm(m, F, s)
        if 'leg_' + s in parts:
            leg(m, F, s)
    return m


def waddle(t):
    """A rolling waddle: short legs, body rocking side to side, head squashing with every step, drool swinging."""
    p = walk(t, stride=0.6, knee=0.55, arm=0.25, bob=0.05, lean=0.05, roll=0.12)
    a = 2 * PI * t
    p['sh_l'] = 0.4 - 0.25 * math.sin(a)
    p['sh_r'] = 0.4 + 0.25 * math.sin(a)
    p['sh_out_l'] = 0.55
    p['sh_out_r'] = 0.55
    p['elbow_l'] = 0.4
    p['elbow_r'] = 0.4
    p['head_pitch'] = -0.62
    p['head_roll'] = -0.1 * math.sin(a)
    p['head_yaw'] = 0.06 * math.sin(a)
    p['sq'] = math.cos(2 * a)
    p['drool'] = a
    p['open'] = 0.0
    return p


def attack(i):
    """Inflate the cheeks (0), rear back (1), spit (2), recover (3)."""
    base = walk(0.0, stride=0.2, knee=0.45, arm=0.0, bob=0.0, lean=0.0, roll=0.0)
    base['knee_l'] = base['knee_r'] = (0.1, 0.5, 0.2, 0.2)[i]
    base['hip_l'] = base['hip_r'] = (0.0, 0.15, -0.1, 0.0)[i]
    base['lean'] = (0.0, -0.32, 0.32, 0.08)[i]
    base['head_pitch'] = (-0.62, -0.5, -0.92, -0.65)[i]
    base['puff'] = (0.6, 1.0, 0.25, 0.0)[i]
    base['open'] = (0.0, 0.12, 1.0, 0.35)[i]
    base['jet'] = (0.0, 0.0, 1.0, 0.0)[i]
    base['sq'] = (0.0, 0.0, -0.6, 0.3)[i]
    base['drool'] = i * 1.3
    base['sh_l'] = base['sh_r'] = (0.3, -0.1, 1.1, 0.5)[i]
    base['sh_out_l'] = base['sh_out_r'] = (0.8, 1.3, 0.6, 0.8)[i]
    base['elbow_l'] = base['elbow_r'] = (0.4, 0.2, 0.6, 0.4)[i]
    base['bob'] = (0.0, -0.03, 0.0, 0.0)[i]
    return base


def head_point(p, local):
    """World point of a head-frame position for pose p."""
    F = SK.frames(planted(SK, p))
    return (F['head'] @ Vector(local)).to_tuple()


def build(ctx):
    n = 6
    ctx.anim('spitter_walk', n, lambda i: body(waddle(i / n)))
    ctx.anim('spitter_attack', 4, lambda i: body(attack(i)))
    # anchors: the mouth (centre of the opening, a hair out of the skin) on the spit frame, the head centre over the walk
    hr = (HR0[0], HR0[1], HR0[2])
    p2 = attack(2)
    Sm = surf_frame(hr, 0.0, 0.05 - 0.02 - 0.02)
    mouth_local = (Sm @ Vector((0, 0, 0.05))).to_tuple()
    ctx.anchor('mouth', 'spitter', head_point(p2, mouth_local))
    hx = hy = hz = 0.0
    for i in range(n):
        c = head_point(waddle(i / n), HC)
        hx += c[0] / n
        hy += c[1] / n
        hz += c[2] / n
    ctx.anchor('head', 'spitter', (hx, hy, hz))
    ctx.value('size', 'spitter_head', round(HR0[0] * 2 * bl.UNITS_PER_M, 1))

    # ---- gibs
    # the eyeball with its optic nerve trailing behind
    g = Mesh('eye')
    E = trans(0, 0.0, 0.0) @ trans(-EC.x, -EC.y, -EC.z)
    g.ball(EC, ER, 'spitter_sclera', mx=E, seg=22, rings=12)
    yi = EC.y - ER[1] * 0.97
    g.ball((0, yi - 0.01, EC.z - 0.01), (0.175, 0.05, 0.175), 'spitter_iris', mx=E, seg=16, rings=8)
    g.ball((0.005, yi - 0.04, EC.z - 0.015), (0.085, 0.032, 0.105), 'pupil', mx=E, seg=12, rings=7)
    g.ball((0.06, yi - 0.062, EC.z + 0.055), (0.036, 0.016, 0.04), 'eye_white', mx=E, seg=8, rings=5)
    for k in range(8):
        a = 2 * PI * k / 8 + 0.3
        pts = []
        for rr in (0.97, 0.78, 0.6, 0.5):
            vx, vz = math.cos(a + 0.12 * (1 - rr)) * ER[0] * rr, math.sin(a + 0.12 * (1 - rr)) * ER[2] * rr
            q = max(1 - (vx / ER[0]) ** 2 - (vz / ER[2]) ** 2, 0.0)
            pts.append(EC + Vector((vx, -ER[1] * math.sqrt(q) - 0.003, vz)))
        for p0, p1, w in zip(pts[:-1], pts[1:], (0.011, 0.009, 0.007)):
            g.capsule(p0, p1, w, w * 0.8, 'spitter_vein', mx=E, seg=6, rings=2)
    nerve = [EC + Vector((0.0, 0.17, -0.02)), EC + Vector((0.08, 0.36, 0.0)), EC + Vector((-0.05, 0.55, 0.06)), EC + Vector((0.04, 0.72, 0.02))]
    g.tube([E @ v for v in nerve], [0.06, 0.05, 0.045, 0.04], 'spitter_nerve', seg=8, cap=False)
    g.ball(E @ (EC + Vector((0.04, 0.75, 0.02))), (0.06, 0.05, 0.06), 'meat', seg=8, rings=5)
    g.transform(rotx(0.25) @ trans(0, 0.1, 0.0))
    ctx.one('spitter_eye', g)

    # the upper half of the head, cut across, with the empty socket staring out; tipped back so the cut face shows too
    F0 = SK.frames(Pose())
    h = Mesh('head')
    head(h, trans(0, 0, 0), HR0, eye=False, half=True)
    zc = HC.z + HR0[2] * -0.2
    rc = 0.47 * math.sqrt(1 - 0.04)
    h.ball((0, 0.0, zc + 0.005), (rc * 0.99, rc * 0.92, 0.04), 'meat', seg=20, rings=6)
    h.ball((0.0, -0.04, zc + 0.03), (rc * 0.62, rc * 0.55, 0.035), 'guts', seg=14, rings=6)
    h.ball((0.18, 0.12, zc + 0.04), (0.1, 0.09, 0.04), 'blood', seg=10, rings=5)
    h.ball((-0.2, -0.1, zc + 0.05), (0.07, 0.07, 0.04), 'blood', seg=10, rings=5)
    h.capsule((-0.14, 0.12, zc + 0.02), (-0.04, 0.2, zc + 0.14), 0.03, 0.022, 'bone', seg=8, rings=3)
    h.transform(trans(0, 0, -0.55))
    h.transform(rotx(-1.4))
    ctx.one('spitter_head', h)

    lg = Mesh('leg')
    leg(lg, F0, 'r', cut=True)
    lg.ball(at(F0['hip_r']), (0.1, 0.1, 0.045), 'meat', seg=10, rings=5)
    lg.capsule(at(F0['hip_r']), at(F0['hip_r'], 0, 0, 0.07), 0.03, 0.03, 'bone', seg=8, rings=3)
    lg.transform(trans(-at(F0['knee_r'])[0], -at(F0['knee_r'])[1], -at(F0['knee_r'])[2]))
    lg.transform(rotx(0.5) @ roty(-PI / 2) @ rotz(0.3))
    ctx.one('spitter_leg', lg)

    tr = Mesh('torso')
    torso(tr, F0)
    for sx in (-1, 1):                                        # torn shoulders and hips
        tr.ball(at(F0['sh_l' if sx < 0 else 'sh_r']), (0.08, 0.08, 0.08), 'meat', seg=8, rings=5)
        tr.ball(at(F0['hip_l' if sx < 0 else 'hip_r']), (0.1, 0.1, 0.06), 'meat', seg=8, rings=5)
    tr.ball((0, -0.08, 0.5), (0.2, 0.17, 0.08), 'meat', seg=12, rings=6)
    tr.ball((0, -0.12, 0.54), (0.12, 0.1, 0.05), 'guts', seg=10, rings=5)
    tr.transform(trans(0, 0, -0.45))
    tr.transform(rotx(-0.45))
    ctx.one('spitter_torso', tr)
