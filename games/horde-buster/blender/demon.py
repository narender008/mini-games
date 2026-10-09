"""The Gilded Summoner: the chapter 2 boss. A golden, glowing, regal demon (about 6.5 m, floating about 1.2 m above the ground): no
legs, a tattered wine-red robe with a gold hem over a smoke trail, gold skin with glowing white-gold runes, ram horns and a spiked
crown in front of a gold sunburst, a broad jewelled collar, FOUR arms, a belt hung with gold chains and coins, and a tall staff topped
with a glowing orb. Emissive: runes, eyes, crown spikes and gems, the orb, the palms.

Frames (default px/m, never an explicit ppm; pivot = the ground under its centre):
  demon_float_0..5     hover bob, robe and smoke sway, orb pulsing
  demon_cast_0..3      staff raised, orb flaring (0 starts the lift, 1 rising, 2 the peak, 3 recover)
  demon_summon_0..3    all four arms spread wide, palms glowing (0 opening, 1 wide, 2 widest and brightest, 3 settling)
  demon_head (crowned, with horns), demon_horn, demon_arm, demon_torso, demon_robe, demon_staff    gibs (pivot = centre of mass)
Anchors: orb.demon (staff orb on cast frame 2), head.demon (float average), size.demon_head, core.demon (middle of the chest), orb.demon_c0 /
_c1 / _c3 / _float / _summon (the staff orb on the other poses), palmL.demon / palmR.demon (the upper palms on summon frame 2) and
palmL2.demon / palmR2.demon (the lower palms) for glows.
"""
import math
from types import SimpleNamespace

from mathutils import Matrix, Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Skeleton, Pose, at

PI = math.pi
SCALE = 1.12         # the model is built at about 6.5 m, then scaled so it fills the sky like the Ogre does

# ------------------------------------------------------------------------------------------------ materials

mats.define('dm_skin', base='#ea9a22', base2='#c47412', pattern='noise', pscale=3.0, pamt=0.55, bump=0.25, bscale=24, seed=71)
mats.define('dm_skin_hi', base='#ffbd3a', base2='#ec9a28', pattern='noise', pscale=4.0, pamt=0.6, bump=0.25, bscale=24, seed=72)
mats.define('dm_skin_dk', base='#a35a0e', base2='#7a3f0a', pattern='noise', pscale=4.0, pamt=0.6, bump=0.2, bscale=24, seed=73)
mats.define('dm_gold', base='#ffe573', base2='#ffc832', pattern='noise', pscale=5.0, pamt=0.5, bevel=0.025, seed=74)
mats.define('dm_gold_dk', base='#c28c20', base2='#8f5e10', pattern='noise', pscale=5.0, pamt=0.5, bevel=0.02, seed=75)
mats.define('dm_robe', base='#6b1a3b', base2='#3e0e29', pattern='noise', pscale=3.0, pamt=0.7, bump=0.5, bscale=18, seed=76)
mats.define('dm_robe_hi', base='#8c2a52', base2='#5e1634', pattern='noise', pscale=4.0, pamt=0.7, bump=0.5, bscale=18, seed=77)
mats.define('dm_smoke', base='#2e2350', base2='#6b2548', pattern='fade', z0=0.5, z1=2.0, pamt=1.0, bump=0.3, bscale=20, seed=78)
mats.define('dm_ember', base='#ffc23a', emit=1.0, bevel=0.01)
mats.define('dm_horn', base='#f6e6b8', base2='#c9a45f', pattern='fade', z0=0.4, z1=1.3, pamt=0.7, bevel=0.015, seed=79)
mats.define('dm_horn_dk', base='#a8813a', bevel=0.012)
mats.define('dm_rune', base='#fff6cc', emit=1.0, bevel=0.01)
mats.define('dm_glow', base='#fff0a0', base2='#ffc43a', pattern='noise', pscale=3.0, pamt=0.6, emit=1.0, bevel=0.02, seed=80)
mats.define('dm_eye', base='#fffbe8', emit=1.0, bevel=0.004)
mats.define('dm_crown', base='#ffe36a', emit=0.6, bevel=0.02)
mats.define('dm_gem', base='#ff8a1c', base2='#ffc034', pattern='noise', pscale=4.0, pamt=0.5, emit=1.0, bevel=0.01, seed=81)
mats.define('dm_ruby', base='#d3162c', base2='#8f0c1d', pattern='noise', pscale=4.0, pamt=0.5, bevel=0.015, seed=82)
mats.define('dm_dark', base='#2b1208', bevel=0.004)
mats.define('dm_tooth', base='#fff3d0', bevel=0.006)
mats.define('dm_nail', base='#3d230c', bevel=0.006)
mats.define('dm_core', base='#ffbb2e', base2='#ff7a14', pattern='noise', pscale=4.0, pamt=0.6, emit=0.8, bevel=0.02, seed=83)
mats.define('dm_bone', base='#f4e6c4', base2='#d2bd8e', pattern='noise', pscale=8.0, pamt=0.5, seed=84)

# ------------------------------------------------------------------------------------------------ skeletons and shapes

# the upper arms hang from the shoulder line (spine top); the lower pair sits a little lower and closer, from a second rig on the same spine
SK = Skeleton(hip_h=3.0, hip_w=0.3, spine=1.2, sh_w=1.2, upper=1.25, fore=1.2, neck=0.3)
SK2 = Skeleton(hip_h=3.0, hip_w=0.3, spine=0.55, sh_w=0.86, upper=1.05, fore=1.0, neck=0.3)

HC = Vector((0.0, 0.02, 0.62))        # skull centre in the head frame (z up from the neck top, the face looks to -Y)
HR = (0.66, 0.6, 0.66)
HS = 1.15                             # the head is drawn this much bigger than modelled, so it holds its own against the shoulders
HEAD_D = 1.32 * HS * SCALE            # skull width, metres

# torso ellipsoids in the spine frame: (centre, radii)
BELLY = (Vector((0.0, -0.04, 0.3)), (0.64, 0.48, 0.46))
CHEST = (Vector((0.0, -0.06, 0.8)), (1.0, 0.6, 0.56))
PECL = (Vector((-0.44, -0.32, 0.86)), (0.46, 0.32, 0.3))
PECR = (Vector((0.44, -0.32, 0.86)), (0.46, 0.32, 0.3))
FRONT = (BELLY, CHEST, PECL, PECR)
YOKE = (Vector((0.0, 0.0, 1.15)), (0.95, 0.5, 0.3))       # shoulders and trapezius: the collar lies on this too

# the robe, in the pelvis frame (z = 0 at the belt): flares from the waist to a ragged hem
Z_HEM = -1.3
Z_TOP = 0.05


def ell(m, e, mat, mx, seg=24, rings=14):
    m.ball(e[0], e[1], mat, mx=mx, seg=seg, rings=rings)


def front_y(x, z, ells=FRONT):
    """Y of the front surface of the torso at (x, z) in the spine frame (None if outside every ellipsoid)."""
    best = None
    for c, r in ells:
        q = 1.0 - ((x - c.x) / r[0]) ** 2 - ((z - c.z) / r[2]) ** 2
        if q > 0:
            y = c.y - r[1] * math.sqrt(q)
            best = y if best is None else min(best, y)
    return best


def band(m, mx, e, z0, z1, mat, grow=1.06, steps=6, seg=28):
    """A band wrapped round an ellipsoid between two heights (belts): follows the surface."""
    c, r = e
    prof = []
    for i in range(steps + 1):
        z = z0 + (z1 - z0) * i / steps
        q = max(1.0 - ((z - c.z) / r[2]) ** 2, 0.01)
        prof.append((z, math.sqrt(q) * grow))
    m.lathe(prof, mat, mx @ trans(c.x, c.y, 0.0) @ Matrix.Diagonal((r[0], r[1], 1.0, 1.0)), seg=seg, smooth=60.0, cap=False)


def robe_r(z):
    zn = min(max((z - Z_HEM) / (Z_TOP - Z_HEM), 0.0), 1.0)
    return 0.78 + 0.82 * (1.0 - zn) ** 1.5


def robe_front(x, z):
    """Y of the robe's front surface in the pelvis frame."""
    r = robe_r(z)
    return -0.8 * math.sqrt(max(r * r - x * x, 0.01)) - 0.03


def tri(x):
    """A triangle wave 0..1 with period 1."""
    x = x - math.floor(x)
    return 1.0 - abs(2.0 * x - 1.0)


# ------------------------------------------------------------------------------------------------ the robe and smoke

def skirt(m, P, sway=0.0, t=0.0, nu=96, nv=8):
    """The tattered robe: a flared sheet from the belt to a hem of ragged tongues, folds rippling, swaying with `sway`."""
    ph = 2 * PI * t

    def hem_z(u):
        # ragged tongues of different lengths all round
        k = math.floor(u * 15.0)
        long_ = 0.55 + 0.45 * math.sin(k * 2.7 + 1.0)
        return Z_HEM + 0.12 + 0.5 * long_ * tri(u * 15.0) ** 0.8

    def pt(u, v, grow=1.0):
        zh = hem_z(u)
        z = zh + (Z_TOP - zh) * v
        zn = (z - Z_HEM) / (Z_TOP - Z_HEM)
        a = PI / 2 + 2 * PI * u
        r = robe_r(z) * grow * (1.0 + 0.045 * math.sin(7 * a + ph + 3.0 * zn) * (1.0 - 0.5 * zn))
        x = r * math.cos(a) + sway * (1.0 - zn) ** 1.4 + 0.05 * math.sin(ph + 5 * zn)
        y = r * math.sin(a) * 0.8 - 0.1 * (1.0 - zn) * math.sin(ph + 1.0)
        return (x, y, z)

    m.grid_sheet(lambda u, v: pt(u, v), nu, nv, 'dm_robe', mx=P, smooth=70.0)
    # gold trim along the ragged edge
    m.grid_sheet(lambda u, v: pt(u, v * 0.13, 1.012), nu, 2, 'dm_gold', mx=P, smooth=70.0)
    # a darker underlayer so the gaps between tongues are not see-through
    m.grid_sheet(lambda u, v: pt(u, 0.2 + v * 0.8, 0.94), nu, 3, 'dm_robe_hi', mx=P, smooth=70.0)
    # glowing runes on a few tongues
    for k in (3, 5, 7, 9, 11):
        u = (k + 0.5) / 15.0
        x, y, z = pt(u, 0.3, 1.02)
        m.ball((x, y, z), (0.07, 0.04, 0.1), 'dm_rune', mx=P, seg=8, rings=5)


def smoke(m, P, sway=0.0, t=0.0):
    """A long tail of smoke under the hem: a tapering tube curling at the tip, side puffs near the top, embers drifting in it."""
    ph = 2 * PI * t
    n = 12
    pts, rs = [], []
    for k in range(n + 1):
        f = k / float(n)
        pts.append((sway * (1.0 - f * 0.3) + 0.55 * f * math.sin(ph + 2.5 * f + 1.0) + 0.55 * f * f, 0.05 + 0.1 * f * math.cos(ph + 2.0 * f),
                    Z_HEM + 0.5 - f * 2.0))
        rs.append(0.8 * (1.0 - f) ** 0.9 + 0.03)
    m.tube(pts, rs, 'dm_smoke', seg=14, smooth=70.0, mx=P)
    for k, (f, side, r) in enumerate(((0.12, -1, 0.36), (0.2, 1, 0.3), (0.34, -1, 0.22), (0.45, 1, 0.16))):
        p = pts[int(f * n)]
        m.ball((p[0] + side * (0.42 - 0.3 * f) + 0.06 * math.sin(ph + k), p[1] - 0.05, p[2]), (r, r * 0.9, r * 0.85), 'dm_smoke', mx=P, seg=12, rings=7)
    for k in range(8):
        f = (k * 0.13 + t * 0.9) % 1.0
        a = k * 2.3 + ph * 0.5
        z = Z_HEM + 0.3 - f * 1.9
        rr = 0.55 * (1.0 - f) + 0.15
        m.ball((rr * math.cos(a) + sway * 0.7, rr * math.sin(a) * 0.6 - 0.35, z), 0.05 + 0.035 * (1 - f), 'dm_ember', mx=P, seg=6, rings=4)


def chains_and_coins(m, P, sway=0.0, t=0.0):
    """Gold chains in swags across the front of the robe, and coins hanging from the belt."""
    ph = 2 * PI * t
    # two swags
    for x0, x1, sag in ((-0.66, -0.02, 0.42), (0.02, 0.66, 0.42)):
        n = 11
        for k in range(n + 1):
            s = k / n
            x = x0 + (x1 - x0) * s
            z = -0.1 - sag * 4.0 * s * (1.0 - s)
            y = robe_front(x, z) - 0.06
            m.ball((x, y, z), 0.05, 'dm_gold', mx=P, seg=6, rings=4)
    for x in (-0.66, 0.0, 0.66):
        z = -0.08 - 0.0
        m.ball((x, robe_front(x, z) - 0.07, z), (0.1, 0.07, 0.1), 'dm_ruby', mx=P, seg=8, rings=5)
    # hanging strands, each ending in a coin
    for x, ln in ((-0.5, 0.78), (-0.26, 0.55), (0.26, 0.55), (0.5, 0.78), (0.0, 0.95)):
        sw = 0.04 * math.sin(ph + x * 6.0)
        top = -0.12
        nb = int(ln / 0.1)
        for k in range(nb):
            z = top - 0.1 * k
            m.ball((x + sw * k / nb, robe_front(x, z) - 0.06, z), 0.032, 'dm_gold', mx=P, seg=6, rings=4)
        zc = top - 0.1 * nb - 0.14
        cx = x + sw
        cy = robe_front(cx, zc) - 0.1
        M = P @ trans(cx, cy, zc) @ rotx(0.93) @ rotz(0.25 * math.sin(ph + x * 9.0))
        m.cyl((0, 0, 0), (0, 0, 0.05), 0.17, 0.17, 'dm_gold', seg=16, mx=M, bevel=0.01)
        m.cyl((0, 0, 0.045), (0, 0, 0.075), 0.115, 0.115, 'dm_gold_dk', seg=14, mx=M)
        m.cyl((0, 0, 0.07), (0, 0, 0.09), 0.05, 0.05, 'dm_gold', seg=8, mx=M)


# ------------------------------------------------------------------------------------------------ the torso

def rune_path(m, S, pts, r=0.032):
    """A glowing line along the front of the torso through (x, z) points of the spine frame."""
    prev = None
    for (x, z) in pts:
        y = front_y(x, z)
        if y is None:
            prev = None
            continue
        p = Vector((x, y - 0.015, z))
        if prev is not None:
            m.capsule(prev, p, r, r, 'dm_rune', mx=S, seg=6, rings=2)
        prev = p


def dense(pts, step=0.07):
    """Subdivide a polyline so it follows a curved surface."""
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        for k in range(1, n + 1):
            out.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    return out


def circle_pts(cx, cz, r, a0=0.0, a1=2 * PI, n=18):
    return [(cx + r * math.cos(a0 + (a1 - a0) * k / n), cz + r * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]


def pauldron(m, M):
    """A big gold pauldron in frame M (local +Z is up out of the shoulder), with spikes and a gem."""
    m.ball((0, 0, 0.0), (0.72, 0.66, 0.38), 'dm_gold', mx=M, seg=22, rings=12)
    m.ball((0, 0, -0.14), (0.8, 0.74, 0.11), 'dm_gold_dk', mx=M, seg=22, rings=6)
    m.ball((0, 0, 0.18), (0.5, 0.46, 0.3), 'dm_gold', mx=M, seg=18, rings=10)
    m.ball((0, -0.05, 0.38), 0.17, 'dm_gem', mx=M, seg=10, rings=6)
    for (dx, dy, tx, ty, ln, r, z) in ((0.0, 0.1, 0.0, 0.1, 0.85, 0.14, 0.3), (0.5, 0.0, 0.75, 0.0, 0.6, 0.12, 0.12),
                                       (-0.5, 0.0, -0.75, 0.0, 0.6, 0.12, 0.12)):
        base = Vector((dx, dy, z))
        d = Vector((math.sin(tx), -math.sin(ty), math.cos(tx) * math.cos(ty))).normalized()
        m.cyl(base, base + d * ln, r, 0.0, 'dm_crown', seg=8, mx=M)


def collar(m, S):
    """A broad jewelled collar over the upper chest (like a pharaoh's): hanging arcs of gold with gem pendants."""
    ells = FRONT + (YOKE,)
    for row in range(4):
        w = 0.8 + 0.06 * row
        drop = 0.3 + 0.12 * row
        pts = []
        for k in range(17):
            x = -w + 2 * w * k / 16.0
            z = 1.3 - drop * (1.0 - (x / w) ** 2) ** 0.85
            y = front_y(x, z, ells)
            if y is not None:
                pts.append((x, y - 0.045, z))
        if len(pts) > 2:
            m.tube(pts, 0.062 if row % 2 == 0 else 0.05, 'dm_gold' if row % 2 == 0 else 'dm_gold_dk', seg=8, smooth=60.0, mx=S, cap=False)
            if row == 3:
                for k in range(1, len(pts) - 1, 2):
                    x, y, z = pts[k]
                    m.cyl((x, y, z), (x, y - 0.02, z - 0.16), 0.05, 0.0, 'dm_gem', seg=6, mx=S)
    y = front_y(0.0, 1.3 - 0.66, ells)
    if y is not None:
        m.ball((0, y - 0.08, 1.3 - 0.7), (0.13, 0.07, 0.16), 'dm_ruby', mx=S, seg=10, rings=6)


def torso(m, F, cut=False, runes=True, pauldrons=True, extras=True, robe_sway=0.0, t=0.0):
    S, P, C = F['spine'], F['pelvis'], F['chest']
    ell(m, BELLY, 'dm_skin', S)
    ell(m, CHEST, 'dm_skin', S)
    ell(m, PECL, 'dm_skin_hi', S, seg=18, rings=10)
    ell(m, PECR, 'dm_skin_hi', S, seg=18, rings=10)
    m.ball((0, 0.12, 1.15), (0.9, 0.46, 0.3), 'dm_skin', mx=S, seg=18, rings=8)             # shoulders and trapezius
    m.ball((0, 0.3, 0.75), (0.92, 0.5, 0.6), 'dm_skin_dk', mx=S, seg=18, rings=10)           # the back
    # belt: a wide gold band with rim strips and a big sun buckle
    band(m, S, BELLY, 0.0, 0.3, 'dm_gold_dk', grow=1.07)
    band(m, S, BELLY, 0.05, 0.25, 'dm_gold', grow=1.1)
    yb = front_y(0, 0.15, (BELLY,)) - 0.1
    m.ball((0, yb + 0.03, 0.15), (0.3, 0.08, 0.27), 'dm_gold_dk', mx=S, seg=16, rings=8)
    m.ball((0, yb - 0.02, 0.15), (0.22, 0.08, 0.2), 'dm_gold', mx=S, seg=16, rings=8)
    m.ball((0, yb - 0.1, 0.15), (0.1, 0.06, 0.1), 'dm_ruby', mx=S, seg=10, rings=6)
    for k in range(8):                                                                        # rays round the buckle
        a = 2 * PI * k / 8.0 + 0.2
        m.cyl((0.2 * math.cos(a), yb - 0.06, 0.15 + 0.2 * math.sin(a)), (0.33 * math.cos(a), yb - 0.07, 0.15 + 0.33 * math.sin(a)),
              0.045, 0.0, 'dm_crown', seg=6, mx=S)
    if runes:
        rune_path(m, S, dense([(0.0, 0.58), (0.0, 1.14)]))
        for z in (0.7, 0.84, 0.98):
            rune_path(m, S, dense([(-0.12, z + 0.07), (0.0, z), (0.12, z + 0.07)]))
        for sx in (-1, 1):
            rune_path(m, S, dense(circle_pts(sx * 0.46, 0.88, 0.27, 0.0, 2 * PI, 14), 0.06))
            rune_path(m, S, dense([(sx * 0.46, 0.88), (sx * 0.62, 0.78)]))
        rune_path(m, S, dense([(0.0, 0.33), (0.17, 0.45), (0.0, 0.57), (-0.17, 0.45), (0.0, 0.33)]))
    collar(m, S)
    # shoulder rings: the lower arms leave the torso here
    for sx in (-1, 1):
        m.ball(at(F['sh_l' if sx < 0 else 'sh_r']), 0.46, 'dm_skin', seg=16, rings=9)
        if pauldrons:
            pauldron(m, C @ trans(sx * 1.28, 0.0, 0.12) @ roty(sx * 0.55) @ rotx(0.05))
    # neck
    if cut:
        m.cyl(at(C), at(F['head'], 0, 0, 0.25), 0.36, 0.3, 'dm_skin', seg=14)
    else:
        m.capsule(at(C), at(F['head'], 0, 0, 0.25), 0.36, 0.3, 'dm_skin', seg=14, rings=5)
    if extras:
        skirt(m, P, robe_sway, t)
        chains_and_coins(m, P, robe_sway * 0.5, t)


# ------------------------------------------------------------------------------------------------ the arms

def hand(m, H, side, k=1.0, open_=0.5, glow=0.0, fist=False):
    """A big clawed hand in frame H (fingers along local -Z, the palm faces -Y). `glow` adds a glowing rune circle on the palm."""
    sx = -1.0 if side == 'l' else 1.0
    curl = (1.0 - open_) * 1.1
    m.ball((0, 0, -0.14 * k), (0.2 * k, 0.15 * k, 0.2 * k), 'dm_skin_hi', mx=H, seg=12, rings=7)
    for i, x in enumerate((-0.12, -0.04, 0.04, 0.12)):
        p = Vector((x * k, -0.03 * k, -0.28 * k))
        a = 0.0
        for j, (ln, r) in enumerate(((0.17, 0.05), (0.13, 0.044), (0.1, 0.038))):
            a += curl * (0.45 + 0.25 * j)
            d = Vector((0.0, -math.sin(a), -math.cos(a)))
            q = p + d * ln * k
            m.capsule(p, q, r * k, r * 0.9 * k, 'dm_skin', mx=H, seg=6, rings=2)
            p = q
        m.cyl(p, p + d * 0.12 * k, 0.035 * k, 0.0, 'dm_nail', seg=6, mx=H)
    # thumb
    tp = Vector((-sx * 0.17 * k, -0.04 * k, -0.12 * k))
    td = Vector((-sx * 0.55, -0.45 - 0.4 * curl, -0.7)).normalized()
    m.capsule(tp, tp + td * 0.2 * k, 0.055 * k, 0.045 * k, 'dm_skin', mx=H, seg=6, rings=2)
    m.cyl(tp + td * 0.2 * k, tp + td * 0.32 * k, 0.035 * k, 0.0, 'dm_nail', seg=6, mx=H)
    if glow > 0:
        g = glow
        M = H @ trans(0, -0.2 * k, -0.15 * k) @ rotx(-PI / 2)       # a disc facing -Y
        m.cyl((0, 0, 0), (0, 0, 0.04), 0.3 * k * (0.6 + 0.7 * g), 0.3 * k * (0.6 + 0.7 * g), 'dm_glow', seg=16, mx=M)
        R = 0.5 * k * (0.7 + 0.6 * g)
        pts = [(R * math.cos(2 * PI * j / 20), R * math.sin(2 * PI * j / 20), 0.02) for j in range(21)]
        m.tube(pts, 0.025 * k, 'dm_rune', seg=6, mx=M, cap=False)
        for j in range(6):
            a = 2 * PI * j / 6.0 + 0.3
            m.cyl((0.1 * math.cos(a), 0.1 * math.sin(a), 0.03), (R * math.cos(a), R * math.sin(a), 0.03), 0.02 * k, 0.02 * k, 'dm_rune', seg=5, mx=M)


def arm(m, F, side, k=1.0, cut=False, open_=0.5, glow=0.0, fist=False, shoulder=True):
    sh, el, ha = F['sh_' + side], F['elbow_' + side], F['hand_' + side]
    if cut:       # a gib: the upper arm ends in a flat tear
        m.cyl(at(sh), at(el), 0.34 * k, 0.29 * k, 'dm_skin', seg=14)
    else:
        if shoulder:
            m.ball(at(sh), 0.4 * k, 'dm_skin', seg=14, rings=8)
        m.capsule(at(sh), at(el), 0.34 * k, 0.29 * k, 'dm_skin', seg=14, rings=5)
    m.ball(at(el), 0.3 * k, 'dm_skin', seg=12, rings=7)
    m.capsule(at(el), at(ha), 0.29 * k, 0.23 * k, 'dm_skin', seg=14, rings=5)
    # a gold armband above the elbow and a rune bracer on the forearm, with a spike off the elbow
    m.cyl(at(sh, 0, 0, -0.55 * k), at(sh, 0, 0, -0.8 * k), 0.37 * k, 0.35 * k, 'dm_gold', seg=14, bevel=0.01)
    m.cyl(at(el, 0, 0, -0.35 * k), at(el, 0, 0, -0.95 * k), 0.31 * k, 0.27 * k, 'dm_gold_dk', seg=14)
    m.cyl(at(el, 0, 0, -0.38 * k), at(el, 0, 0, -0.46 * k), 0.325 * k, 0.325 * k, 'dm_gold', seg=14)
    m.cyl(at(el, 0, 0, -0.86 * k), at(el, 0, 0, -0.94 * k), 0.29 * k, 0.29 * k, 'dm_gold', seg=14)
    for j in range(3):
        m.ball(at(el, 0, -0.29 * k, -0.5 * k - 0.12 * k * j), (0.035 * k, 0.03, 0.05 * k), 'dm_rune', seg=6, rings=4)
    m.cyl(at(el, 0, 0.25 * k, 0.05), at(el, 0, 0.62 * k, 0.28 * k), 0.12 * k, 0.0, 'dm_gold', seg=8)
    hand(m, ha, side, k, open_, glow, fist)


# ------------------------------------------------------------------------------------------------ the head

def horn_path(sx, n=20):
    """A ram horn in the head frame, curling out, up, round and forward in front of the cheek. -> (points, radii, tangents)."""
    x0, y0, z0 = 0.5, 0.12, 0.9
    R0 = 0.62
    turns = 1.75 * PI
    cxp = x0 + R0
    pts, rs = [], []
    for kk in range(n + 1):
        f = kk / n
        th = turns * f
        R = R0 * (1.0 - 0.55 * f)
        a = PI - th
        pts.append(Vector((sx * (cxp + R * math.cos(a)), y0 - 0.55 * f, z0 + R * math.sin(a))))
        rs.append(0.21 * (1.0 - f) ** 0.85 + 0.02)
    return pts, rs


def horn(m, H, sx):
    pts, rs = horn_path(sx)
    m.tube([p.to_tuple() for p in pts], rs, 'dm_horn', seg=10, smooth=70.0, mx=H)
    for kk in range(2, len(pts) - 2, 2):
        t = (pts[kk + 1] - pts[kk - 1]).normalized() * 0.03
        m.cyl((pts[kk] - t).to_tuple(), (pts[kk] + t).to_tuple(), rs[kk] * 1.14, rs[kk] * 1.14, 'dm_horn_dk', seg=10, mx=H)
    m.ball((sx * 0.5, 0.12, 0.9), (0.27, 0.27, 0.22), 'dm_gold', mx=H, seg=12, rings=7)       # gold sleeve at the root


def crown(m, H):
    """A spiked gold crown with glowing tips and a big gem on the brow."""
    zc = 1.06
    m.lathe([(zc, 0.62), (zc + 0.06, 0.66), (zc + 0.3, 0.6)], 'dm_gold', mx=H, seg=24, smooth=60.0, cap=False)
    m.lathe([(zc - 0.04, 0.63), (zc + 0.07, 0.67)], 'dm_gold_dk', mx=H, seg=24, smooth=60.0, cap=False)
    n = 9
    for j in range(n):
        a = PI * 0.5 + 2 * PI * (j + 0.5) / n
        c, s = math.cos(a), math.sin(a)
        front = max(0.0, -s)
        ln = 0.42 + 0.3 * front
        base = Vector((0.6 * c, 0.6 * s * 0.92, zc + 0.26))
        tip = base + Vector((c * 0.04, s * 0.04, ln))
        m.cyl(base, tip, 0.1, 0.0, 'dm_crown', seg=7, mx=H)
        m.ball(tip.to_tuple(), 0.045, 'dm_rune', mx=H, seg=6, rings=4)
    m.ball((0, -0.64, zc + 0.14), (0.1, 0.06, 0.13), 'dm_gem', mx=H, seg=10, rings=6)
    for sx in (-1, 1):
        m.ball((sx * 0.26, -0.58, zc + 0.12), (0.055, 0.04, 0.06), 'dm_gem', mx=H, seg=8, rings=5)


def head(m, H, jaw=0.25, with_head=True, with_jaw=True, with_crown=True, with_horns=True, goatee=1.0):
    """Skull, heavy brow, big glowing eyes, wide fanged grin, goatee, pointed ears, crown, ram horns."""
    H = H @ scale(HS)
    if with_head:
        m.ball(HC, HR, 'dm_skin', mx=H, seg=26, rings=14)
        for sx in (-1, 1):
            # brow ridges slanting down toward the nose, sockets, big glowing eyes with slit pupils
            m.ball((sx * 0.29, -0.5, 0.88), (0.35, 0.17, 0.13), 'dm_skin_hi', mx=H, rot=roty(-sx * 0.42), seg=16, rings=8)
            m.ball((sx * 0.27, -0.52, 0.72), (0.18, 0.1, 0.14), 'dm_dark', mx=H, seg=14, rings=8)
            m.ball((sx * 0.27, -0.57, 0.72), (0.15, 0.07, 0.085), 'dm_eye', mx=H, rot=roty(-sx * 0.5), seg=14, rings=8)
            m.ball((sx * 0.255, -0.63, 0.72), (0.022, 0.02, 0.07), 'dm_dark', mx=H, rot=roty(-sx * 0.5), seg=8, rings=6)
            m.ball((sx * 0.44, -0.36, 0.46), (0.2, 0.18, 0.18), 'dm_skin_hi', mx=H, seg=14, rings=8)          # cheekbones
            m.cyl((sx * 0.6, 0.06, 0.62), (sx * 1.1, 0.2, 0.98), 0.14, 0.0, 'dm_skin', seg=8, mx=H)             # pointed ears
            m.cyl((sx * 0.63, 0.05, 0.64), (sx * 1.0, 0.18, 0.92), 0.075, 0.0, 'dm_skin_hi', seg=8, mx=H)
            m.ball((sx * 1.0, 0.16, 0.8), 0.045, 'dm_gold', mx=H, seg=6, rings=4)                                # ear ring
        m.ball((0, -0.62, 0.55), (0.075, 0.07, 0.17), 'dm_skin_hi', mx=H, seg=10, rings=6)                      # a thin nose ridge
        for sx in (-1, 1):
            m.ball((sx * 0.05, -0.69, 0.43), (0.025, 0.03, 0.04), 'dm_dark', mx=H, seg=6, rings=4)
        m.ball((0, -0.42, 0.3), (0.44, 0.24, 0.14), 'dm_skin', mx=H, seg=16, rings=8)                          # upper lip
        for i, x in enumerate((-0.27, -0.14, 0.0, 0.14, 0.27)):
            m.box(x - 0.045, x + 0.045, -0.65, -0.57, 0.14, 0.25 - 0.02 * (i % 2), 'dm_tooth', mx=H, bevel=0.012)
        for sx in (-1, 1):                                                                                      # long upper fangs
            m.cyl((sx * 0.2, -0.6, 0.22), (sx * 0.2, -0.68, -0.08), 0.06, 0.0, 'dm_tooth', seg=6, mx=H)
        m.ball((0, -0.64, 0.99), (0.07, 0.03, 0.1), 'dm_rune', mx=H, rot=rotz(PI / 4), seg=4, rings=3)        # a rune on the brow
        if with_crown:
            crown(m, H)
        if with_horns:
            for sx in (-1, 1):
                horn(m, H, sx)
    if with_jaw:
        J = H @ trans(0.0, -0.1, 0.3) @ rotx(jaw)
        m.ball((0, -0.36, -0.14), (0.5, 0.38, 0.23), 'dm_skin', mx=J, seg=18, rings=10)
        m.ball((0, -0.56, -0.14), (0.3, 0.2, 0.17), 'dm_skin_hi', mx=J, seg=14, rings=8)
        m.ball((0, -0.4, 0.03), (0.4, 0.3, 0.07), 'dm_dark', mx=J, seg=14, rings=6)
        m.ball((0, -0.34, 0.06), (0.26, 0.2, 0.05), 'dm_ruby', mx=J, seg=12, rings=6)
        for i, x in enumerate((-0.2, -0.07, 0.07, 0.2)):
            m.box(x - 0.04, x + 0.04, -0.66, -0.58, 0.0, 0.11 - 0.02 * (i % 2), 'dm_tooth', mx=J, bevel=0.012)
        for sx in (-1, 1):
            m.cyl((sx * 0.3, -0.58, -0.05), (sx * 0.32, -0.7, 0.3), 0.07, 0.0, 'dm_tooth', seg=6, mx=J)
        # a long braided goatee with gold rings
        m.cyl((0, -0.6, -0.2), (0, -0.62, -0.2 - 0.8 * goatee), 0.17, 0.02, 'dm_gold', seg=10, mx=J)
        for z in (-0.35, -0.55, -0.75)[:max(1, int(3 * goatee))]:
            m.cyl((0, -0.6, z), (0, -0.6, z - 0.06), 0.15 * (1 + (z + 0.2) * 0.9), 0.15 * (1 + (z + 0.2) * 0.9), 'dm_gold_dk', seg=10, mx=J)


# ------------------------------------------------------------------------------------------------ the staff

def screen_dirs():
    r, u, v = bl.cam_basis()
    return Vector(r), Vector(u), Vector(v)


def staff_geom(grip, grip_h, tilt, L):
    up = Vector((tilt[0], tilt[1], 1.0)).normalized()
    base = Vector(grip) - up * grip_h
    top = base + up * L
    return base, top, up


def staff(m, grip, grip_h=1.8, tilt=(0.0, 0.0), L=4.6, orb=0.5, flare=0.0, t=0.0, broken=False):
    """The staff: a gold pole through `grip` (a world point), prongs round a glowing orb at the top, rays and rings when flaring."""
    base, top, up = staff_geom(grip, grip_h, tilt, L)
    ph = 2 * PI * t
    m.cyl(base, top, 0.1, 0.085, 'dm_gold_dk', seg=10)
    for s in (0.7, 1.5, 2.3, 3.1, 3.9, 4.5):
        if s < L - 0.3:
            m.cyl(base + up * s, base + up * (s + 0.12), 0.135, 0.135, 'dm_gold', seg=10)
    m.cyl(base - up * 0.55, base + up * 0.05, 0.0, 0.11, 'dm_gold', seg=8)
    right = Vector((1, 0, 0))
    side = up.cross(right).normalized()
    side2 = up.cross(side).normalized()
    m.ball(top, (0.19, 0.19, 0.12), 'dm_gold', seg=10, rings=6)
    hc = 0.25 + orb                                   # orb centre above the pole top
    c = top + up * hc
    for kk in range(4):
        a = kk * PI / 2 + PI / 4
        rad = side2 * math.cos(a) + side * math.sin(a)
        R = orb * 1.0 + 0.08
        ps = [top + up * 0.05 + rad * 0.12, top + up * (hc * 0.5) + rad * (R * 0.8), c + rad * R, c + up * orb * 0.7 + rad * (R * 0.75),
              c + up * orb * 1.25 + rad * 0.14]
        m.tube([p.to_tuple() for p in ps], [0.065, 0.055, 0.05, 0.04, 0.02], 'dm_gold', seg=8)
    if not broken:
        m.ball(c.to_tuple(), orb, 'dm_glow', seg=20, rings=12)
        m.ball((c + up * orb * 1.3).to_tuple(), 0.07, 'dm_rune', seg=6, rings=4)
    r_, u_, v_ = screen_dirs()
    if flare > 0.25:
        n = 12
        for kk in range(n):
            a = 2 * PI * kk / n + 0.2 + ph * 0.08
            d = r_ * math.cos(a) + u_ * math.sin(a)
            ln = (0.35 + 0.9 * flare) * (1.0 if kk % 2 == 0 else 0.55)
            m.cyl((c + d * orb * 0.85).to_tuple(), (c + d * (orb + ln)).to_tuple(), 0.09 + 0.06 * flare, 0.0, 'dm_rune', seg=6)
    if flare > 0.45:
        R = orb * 1.45 + 0.3 * flare
        ring = [c + (r_ * math.cos(2 * PI * j / 28) + u_ * math.sin(2 * PI * j / 28)) * R for j in range(29)]
        m.tube([p.to_tuple() for p in ring], 0.035 + 0.025 * flare, 'dm_glow', seg=6, cap=False)
    # floating motes of light round the orb
    for kk in range(5):
        a = kk * 2.4 + ph + 0.6
        rr = orb * 1.7 + 0.25 * math.sin(kk * 2.0)
        d = r_ * math.cos(a) + u_ * math.sin(a) * 0.9
        m.ball((c + d * rr).to_tuple(), 0.05 + 0.03 * ((kk * 7) % 3) / 3.0, 'dm_ember', seg=6, rings=4)
    return c


def sunburst(m, c, spread=1.0):
    """A gold sunburst behind the head, in the screen plane: a dark wine disc with a gold rim and a fan of spikes."""
    r_, u_, v_ = screen_dirs()
    c = Vector(c) + v_ * 0.9
    m.cyl(c, c + v_ * 0.14, 1.12, 1.12, 'dm_robe', seg=28, bevel=0.015)
    ring = [c - v_ * 0.05 + (r_ * math.cos(2 * PI * j / 40) + u_ * math.sin(2 * PI * j / 40)) * 1.14 for j in range(41)]
    m.tube([p.to_tuple() for p in ring], 0.075, 'dm_gold', seg=8, cap=False)
    n = 9
    for kk in range(n):
        a = math.radians(14 + 152 * kk / (n - 1))
        d = r_ * math.cos(a) + u_ * math.sin(a)
        ln = (2.15 if kk % 2 == 0 else 1.65) * spread
        m.cyl((c + d * 1.0).to_tuple(), (c + d * ln).to_tuple(), 0.17, 0.0, 'dm_gold', seg=8)
        m.ball((c + d * (ln - 0.12)).to_tuple(), 0.05, 'dm_rune', seg=6, rings=4)


# ------------------------------------------------------------------------------------------------ poses

def make(**kw):
    """Build the two rigs' poses and joint frames for one animation frame; extras ride along on the namespace."""
    d = dict(bob=0.0, sway=0.0, lean=0.0, roll=0.0, twist=0.0, hp=-0.62, hy=0.0, hr=0.0, jaw=0.25,
             ur=(0.3, 0.72, 0.9), ul=(0.95, 0.9, 1.0), lr=(0.95, 0.12, 1.45), ll=(0.95, 0.12, 1.45),
             robe=0.0, t=0.0, glow=0.0, glow_lo=0.0, orb=0.5, flare=0.1, grip=1.8, tilt=(0.0, 0.0), L=4.6, open_up=0.5, open_lo=0.4,
             sun=1.0)
    d.update(kw)
    base = dict(bob=d['bob'], sway=d['sway'], lean=d['lean'], roll=d['roll'], twist=d['twist'])
    p = Pose(base)
    p.update(head_pitch=d['hp'], head_yaw=d['hy'], head_roll=d['hr'], jaw=d['jaw'])
    for side, ar in (('r', d['ur']), ('l', d['ul'])):
        p['sh_' + side], p['sh_out_' + side], p['elbow_' + side] = ar
    q = Pose(base)
    for side, ar in (('r', d['lr']), ('l', d['ll'])):
        q['sh_' + side], q['sh_out_' + side], q['elbow_' + side] = ar
    o = SimpleNamespace(**d)
    o.p, o.q = p, q
    o.F, o.F2 = SK.frames(p), SK2.frames(q)
    return o


def float_pose(i, n=6):
    t = i / float(n)
    a = 2 * PI * t
    s = math.sin
    return make(t=t, bob=0.16 * s(a), sway=0.04 * s(a + 1.0), roll=0.025 * s(a + 0.5), robe=0.18 * s(a - 0.9),
                hp=-0.62 + 0.04 * s(a + 1.2), jaw=0.22 + 0.05 * s(2 * a), twist=0.03 * s(a),
                ur=(0.3 + 0.05 * s(a), 0.72 + 0.05 * s(a + 0.5), 0.9), ul=(0.95 + 0.08 * s(a + 1.0), 0.9, 1.0),
                lr=(0.95 + 0.05 * s(a + 2.0), 0.12, 1.45), ll=(0.95 + 0.05 * s(a + 3.0), 0.12, 1.45),
                orb=0.5 + 0.04 * s(2 * a), flare=0.0, glow=0.0)


def cast_pose(i):
    s = math.sin
    lean = (-0.1, -0.16, 0.12, 0.0)[i]
    sh = (0.9, 1.6, 2.1, 1.3)[i]
    out = (0.6, 0.55, 0.45, 0.55)[i]
    el = (1.1, 0.7, 0.3, 0.8)[i]
    orb = (0.5, 0.7, 0.95, 0.65)[i]
    flare = (0.15, 0.55, 1.0, 0.45)[i]
    t = i / 4.0
    return make(t=t, bob=(0.05, 0.14, 0.26, 0.12)[i], lean=lean, robe=(0.1, -0.1, 0.2, 0.05)[i], hp=(-0.62, -0.5, -0.8, -0.62)[i],
                jaw=(0.3, 0.45, 0.7, 0.4)[i], ur=(sh, out, el), ul=((1.0, 1.5, 1.9, 1.3)[i], (0.9, 0.9, 0.8, 0.9)[i], (0.9, 0.7, 0.5, 0.8)[i]),
                lr=(0.9, 0.4 + 0.1 * i, 1.2), ll=(0.9, 0.4 + 0.1 * i, 1.2), orb=orb, flare=flare, grip=1.5, tilt=(0.1, -0.12 * (i == 2)),
                glow=0.0 if i == 0 else (0.0, 0.5, 1.0, 0.5)[i], open_up=0.9, L=4.6)


def summon_pose(i):
    spread = (0.3, 0.8, 1.0, 0.7)[i]
    glow = (0.3, 0.85, 1.0, 0.6)[i]
    return make(t=i / 4.0, bob=(0.0, 0.1, 0.22, 0.1)[i], lean=(-0.05, -0.12, -0.18, -0.08)[i], robe=(0.0, 0.1, -0.1, 0.05)[i],
                hp=-0.58, jaw=(0.35, 0.5, 0.65, 0.4)[i],
                ur=(0.5, 0.55 + 0.8 * spread, 0.9 - 0.6 * spread), ul=(0.5, 0.55 + 0.8 * spread, 0.9 - 0.6 * spread),
                lr=(0.65, 0.3 + 0.75 * spread, 1.2 - 0.7 * spread), ll=(0.65, 0.3 + 0.75 * spread, 1.2 - 0.7 * spread),
                orb=0.5 + 0.1 * glow, flare=0.0, glow=glow, glow_lo=glow * 0.8, grip=1.8, tilt=(0.12 * spread, 0.0),
                open_up=1.0, open_lo=1.0)


# ------------------------------------------------------------------------------------------------ the whole body

def body(o, parts=('sun', 'torso', 'head', 'arms', 'staff')):
    F, F2 = o.F, o.F2
    m = Mesh('demon')
    if 'sun' in parts:
        sunburst(m, at(F['head'], 0, 0, 0.65 * HS), o.sun)
    P = F['pelvis']
    smoke(m, P, o.robe * 0.5, o.t)
    torso(m, F, robe_sway=o.robe, t=o.t)
    head(m, F['head'], jaw=o.jaw)
    # upper arms: the right one (screen right) holds the staff
    hr = at(F['hand_r'], 0, 0, -0.16)
    arm(m, F, 'l', 1.0, open_=o.open_up, glow=o.glow)
    arm(m, F, 'r', 1.0, open_=0.0)
    # lower arms (their shoulders sit in the flank of the torso)
    for side in ('l', 'r'):
        m.ball(at(F2['sh_' + side]), 0.4, 'dm_skin', seg=14, rings=8)
    arm(m, F2, 'l', 0.85, open_=o.open_lo, glow=o.glow_lo, shoulder=False)
    arm(m, F2, 'r', 0.85, open_=o.open_lo, glow=o.glow_lo, shoulder=False)
    c = staff(m, hr, o.grip, o.tilt, o.L, o.orb, o.flare, o.t)
    m.transform(scale(SCALE))
    return m, c


# ------------------------------------------------------------------------------------------------ build

def build(ctx):
    ink = dict(outline=2.4)
    ctx.anim('demon_float', 6, lambda i: body(float_pose(i))[0], ink=ink)
    ctx.anim('demon_cast', 4, lambda i: body(cast_pose(i))[0], ink=ink)
    ctx.anim('demon_summon', 4, lambda i: body(summon_pose(i))[0], ink=ink)

    # ---- anchors
    # the staff orb on each pose that needs it (cast frame 2 is `orb.demon`; the others are named for the behaviour's glows)
    for nm, o in (('demon_c0', cast_pose(0)), ('demon_c1', cast_pose(1)), ('demon', cast_pose(2)), ('demon_c3', cast_pose(3)),
                  ('demon_float', float_pose(0)), ('demon_summon', summon_pose(2))):
        bm, c = body(o)
        bm.free()
        ctx.anchor('orb', nm, (c * SCALE).to_tuple())
    # the middle of the chest, where the nova gathers
    o = float_pose(0)
    ctx.anchor('core', 'demon', ((o.F['spine'] @ Vector((0, -0.3, 0.7))) * SCALE).to_tuple())
    hx = hy = hz = 0.0
    for i in range(6):
        o = float_pose(i)
        v = (o.F['head'] @ (HC * HS)) * SCALE
        hx, hy, hz = hx + v.x / 6, hy + v.y / 6, hz + v.z / 6
    ctx.anchor('head', 'demon', (hx, hy, hz))
    ctx.value('size', 'demon_head', round(HEAD_D * bl.UNITS_PER_M, 1))
    o = summon_pose(2)
    for kind, F, side in (('palmL', o.F, 'l'), ('palmR', o.F, 'r'), ('palmL2', o.F2, 'l'), ('palmR2', o.F2, 'r')):
        ctx.anchor(kind, 'demon', ((F['hand_' + side] @ Vector((0, -0.25, -0.15))) * SCALE).to_tuple())

    # ---- gibs, built around the origin
    def molten(m, mx, r, depth=0.1):
        """A torn end: glowing molten flesh with a stub of bone."""
        m.ball((0, 0, 0), (r, r, depth * 1.3), 'dm_core', mx=mx, seg=14, rings=6)
        m.ball((0, 0, depth * 0.4), (r * 0.55, r * 0.55, depth), 'dm_ember', mx=mx, seg=10, rings=5)
        m.capsule((0.0, 0.0, 0.0), (0.0, 0.0, 0.3), r * 0.25, r * 0.2, 'dm_bone', mx=mx, seg=8, rings=3)

    F0 = SK.frames(Pose())
    h = Mesh('head')
    head(h, trans(0, 0, 0), goatee=0.4)
    h.ball((0, -0.1, -0.4), (0.5, 0.42, 0.24), 'dm_core', seg=14, rings=6)
    h.ball((0, -0.14, -0.48), (0.3, 0.24, 0.16), 'dm_ember', seg=10, rings=5)
    h.capsule((0.08, -0.1, -0.4), (0.14, -0.2, -0.75), 0.08, 0.06, 'dm_bone', seg=8, rings=3)
    h.transform(trans(-HC.x * HS, -HC.y * HS, -HC.z * HS))
    h.transform(rotx(-0.45))
    h.transform(scale(SCALE))
    ctx.one('demon_head', h, ink=ink)

    hn = Mesh('horn')
    pts, rs = horn_path(1)
    hn.tube([p.to_tuple() for p in pts], rs, 'dm_horn', seg=10, smooth=70.0)
    for kk in range(2, len(pts) - 2, 2):
        t_ = (pts[kk + 1] - pts[kk - 1]).normalized() * 0.03
        hn.cyl((pts[kk] - t_).to_tuple(), (pts[kk] + t_).to_tuple(), rs[kk] * 1.14, rs[kk] * 1.14, 'dm_horn_dk', seg=10)
    hn.ball((0.5, 0.12, 0.9), (0.27, 0.27, 0.22), 'dm_gold', seg=12, rings=7)
    cen = sum(pts, Vector()) / len(pts)
    hn.transform(trans(-cen.x, -cen.y, -cen.z))
    hn.transform(rotx(0.35))
    hn.transform(scale(SCALE * 1.1))
    ctx.one('demon_horn', hn, ink=ink)

    a = Mesh('arm')
    Fa = SK.frames(Pose(sh_l=0.8, elbow_l=0.9, sh_out_l=0.4))
    arm(a, Fa, 'l', 1.0, cut=True, open_=0.7)
    molten(a, Fa['sh_l'], 0.38)
    mid = (Vector(at(Fa['sh_l'])) + Vector(at(Fa['hand_l']))) / 2
    a.transform(trans(-mid.x, -mid.y, -mid.z))
    a.transform(rotx(0.55))
    a.transform(scale(SCALE))
    ctx.one('demon_arm', a, ink=ink)

    tr = Mesh('torso')
    torso(tr, F0, cut=True, pauldrons=True, extras=False)
    ex = Mesh('robe_bit')
    skirt(ex, F0['pelvis'], 0.0, 0.0)
    tr.add(ex)
    ex.free()
    tr.ball(at(F0['head'], 0, 0, 0.25), (0.4, 0.4, 0.1), 'dm_core', seg=12, rings=6)
    tr.ball(at(F0['head'], 0, 0, 0.29), (0.22, 0.22, 0.09), 'dm_ember', seg=10, rings=5)
    tr.capsule(at(F0['head'], 0, 0, 0.2), at(F0['head'], 0, 0, 0.5), 0.08, 0.06, 'dm_bone', seg=8, rings=3)
    for sx in (-1, 1):
        tr.ball(at(F0['sh_l' if sx < 0 else 'sh_r']), (0.46, 0.46, 0.2), 'dm_core', seg=12, rings=6)
    tr.transform(trans(0, 0, -3.8))
    tr.transform(rotx(-0.3))
    tr.transform(scale(SCALE))
    ctx.one('demon_torso', tr, ink=ink)

    rb = Mesh('robe')
    zs = (Z_TOP - Z_HEM)

    def piece(u, v):
        uu = 0.36 + 0.28 * u
        zh = Z_HEM + 0.12 + 0.5 * (0.55 + 0.4 * math.sin(math.floor(uu * 15.0) * 2.7 + 1.0)) * tri(uu * 15.0) ** 0.8
        ztop = Z_TOP - 0.5 * zs * (0.6 + 0.4 * math.sin(u * 17.0)) * (0.5 + 0.5 * tri(u * 5.0))     # torn upper edge
        z = zh + (ztop - zh) * v
        zn = (z - Z_HEM) / zs
        a = PI / 2 + 2 * PI * uu
        r = robe_r(z) * (1.0 + 0.05 * math.sin(7 * a + 3.0 * zn))
        return (r * math.cos(a), r * math.sin(a) * 0.8, z)

    rb.grid_sheet(lambda u, v: piece(u, v), 28, 8, 'dm_robe', smooth=70.0)
    rb.grid_sheet(lambda u, v: tuple(c_ * (1.012 if k_ < 2 else 1.0) for k_, c_ in enumerate(piece(u, v * 0.14))), 28, 2, 'dm_gold', smooth=70.0)
    for u in (0.2, 0.5, 0.8):
        x, y, z = piece(u, 0.35)
        rb.ball((x, y - 0.03, z), (0.07, 0.04, 0.1), 'dm_rune', seg=8, rings=5)
    cen = Vector((0, 0, 0))
    allp = [Vector(piece(u / 6.0, v / 4.0)) for u in range(7) for v in range(5)]
    cen = sum(allp, Vector()) / len(allp)
    rb.transform(trans(-cen.x, -cen.y, -cen.z))
    rb.transform(rotx(-0.8) @ rotz(0.5))
    rb.transform(scale(SCALE * 1.2))
    ctx.one('demon_robe', rb, ink=ink)

    st = Mesh('staff')
    Lb = 3.4
    staff(st, (0, 0, 0), 2.4, (0.0, 0.0), Lb, 0.5, 0.3, 0.0, broken=False)
    st.ball((0, 0, -2.4 + 0.02), (0.14, 0.14, 0.1), 'dm_core', seg=8, rings=5)
    st.transform(trans(0, 0, -(Lb / 2 - 2.4) - 1.2))
    st.transform(rotx(-0.5) @ rotz(0.9))
    st.transform(scale(SCALE))
    ctx.one('demon_staff', st, ink=ink)
