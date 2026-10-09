"""The spider: a fat purple cartoon spider, about 0.75 m across its legs, scuttling toward the camera.

Frames (default px/m, pivot = the ground under the body):
  spider_walk_0..5      scuttle cycle (tripod gait on the back six legs, the front pair feels the air in front of the face)
  spider_leg, spider_body, spider_head   gibs (pivot = centre of mass; body = the burst abdomen)
Anchors: head.spider (the cephalothorax centre, averaged over the cycle, game units from the pivot), size.spider_head.
The spider faces -Y; its glowing red eyes and cream fangs sit on the front of the head, tilted up toward the camera, and the
abdomen's glowing mark is turned toward the camera (up the screen from the head) so it reads at 46 px.
"""
import math

from mathutils import Matrix, Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale

PI = math.pi
SCALE = 0.8          # modelled at 1 m across the legs for good proportions, drawn at about 0.8 m (the brief asks for roughly 0.7)

mats.define('spider_abd', base='#8d4bd2', base2='#5f2f9c', pattern='spots', pscale=9, pamt=0.55, bump=0.25, seed=33)
mats.define('spider_head', base='#6d37a8', base2='#4a2478', pattern='noise', pscale=7, pamt=0.7, bump=0.25, seed=34)
mats.define('spider_leg', base='#6a35a3', base2='#9b5ade', pattern='stripes', pscale=9, pamt=0.55, bump=0.15, seed=35)
mats.define('spider_joint', base='#b47af2', bevel=0.01)
mats.define('spider_glow', base='#ff3ff0', emit=1.0, bevel=0.006)
mats.define('spider_goo', base='#ff5cf2', base2='#c21fd0', pattern='noise', pscale=8, pamt=0.6, emit=0.55, bevel=0.01, seed=36)
mats.define('spider_fang', base='#fff7e0', base2='#c8b890', pattern='fade', z0=-0.02, z1=0.04, pamt=0.8, bevel=0.004)
mats.define('spider_tip', base='#2a1a3a', bevel=0.004)

BODY_Z = 0.3                        # height of the head centre above the ground
HEAD_C = (0.0, -0.1, 0.0)           # head centre, relative to the body origin
HEAD_R = (0.17, 0.16, 0.125)
ROOTS = [(-0.06, 0.0), (-0.03, 0.0), (0.0, 0.0), (0.04, 0.0)]     # leg attachment (y, z) on the head, front to back
L1, L2 = 0.24, 0.32

# per leg pair, front to back: angle (rad) from the sideways axis toward the front, reach of the foot from the root, gait phase
PAIRS = [
    dict(ang=0.8, reach=0.34, ph=0.0),
    dict(ang=0.28, reach=0.36, ph=0.5),
    dict(ang=-0.3, reach=0.36, ph=0.0),
    dict(ang=-0.85, reach=0.38, ph=0.5),
]
STRIDE = 0.08
LIFT = 0.12


def ik(root, foot, side):
    """Two-bone leg: the knee rises above the root-foot line (and outward), like a spider's. Returns (knee, foot)."""
    root, foot = Vector(root), Vector(foot)
    d = foot - root
    dist = min(d.length, L1 + L2 - 1e-4)
    dn = d.normalized()
    a = (dist * dist + L1 * L1 - L2 * L2) / (2 * dist)
    h = math.sqrt(max(L1 * L1 - a * a, 1e-6))
    pole = Vector((side * 0.6, 0.0, 1.0))
    pole = (pole - dn * pole.dot(dn)).normalized()
    return root + dn * a + pole * h, root + dn * dist


def foot_targets(t):
    """Foot positions (x, y, z) of the eight legs at cycle phase t, keyed (pair, side)."""
    out = {}
    a = 2 * PI * t
    for k, pr in enumerate(PAIRS):
        for side in (-1, 1):
            ph = pr['ph'] if side > 0 else (pr['ph'] + 0.5) % 1.0
            u = (t + ph) % 1.0
            ry, rz = ROOTS[k]
            ca, sa = math.cos(pr['ang']), math.sin(pr['ang'])
            fx = side * 0.11 + side * ca * pr['reach']
            fy = HEAD_C[1] + ry - sa * pr['reach']
            if k == 0:
                # the front legs are held up and out, circling like feelers (opposite sides half a cycle apart)
                w = a + (0.0 if side > 0 else PI)
                out[(k, side)] = (fx + side * 0.03 * math.sin(w), fy - 0.03 + 0.05 * math.cos(w), 0.26 + 0.08 * math.sin(w))
                continue
            if u < 0.5:                       # stance: the foot slides back under the body
                s = -1.0 + 4.0 * u
                lift = 0.0
            else:                             # swing: up and forward
                s = 1.0 - 4.0 * (u - 0.5)
                lift = math.sin(PI * (u - 0.5) * 2.0)
            out[(k, side)] = (fx, fy + STRIDE * s, 0.035 + LIFT * lift)
    return out


def leg(m, root, foot, side, r=1.0):
    """One jointed leg from a root to a foot point (world)."""
    knee, foot = ik(root, foot, side)
    m.ball(root, 0.056 * r, 'spider_joint', seg=10, rings=6)
    m.capsule(root, knee, 0.044 * r, 0.037 * r, 'spider_leg', seg=10, rings=3)
    m.ball(knee, 0.05 * r, 'spider_joint', seg=10, rings=6)
    m.capsule(knee, foot, 0.035 * r, 0.015 * r, 'spider_leg', seg=10, rings=3)
    m.ball(foot, 0.021 * r, 'spider_tip', seg=8, rings=5)


def head(m, H):
    """Cephalothorax in frame H: a lumpy purple head, a cluster of glowing red eyes, a mouth and curved cream fangs."""
    m.ball((0, 0, 0), HEAD_R, 'spider_head', mx=H, seg=18, rings=10)
    m.ball((0, -0.04, 0.09), (0.11, 0.09, 0.05), 'spider_abd', mx=H, seg=12, rings=6)             # raised brow
    # eyes: two big ones in front, a ring of smaller ones around them
    for sx in (-1, 1):
        m.ball((sx * 0.07, -0.128, 0.058), (0.062, 0.03, 0.058), 'spider_tip', mx=H, seg=12, rings=8)     # socket
        m.ball((sx * 0.07, -0.142, 0.06), (0.052, 0.026, 0.05), 'eye_glow_red', mx=H, seg=12, rings=8)
        m.ball((sx * 0.07, -0.166, 0.064), (0.017, 0.012, 0.024), 'pupil', mx=H, seg=8, rings=5)
        m.ball((sx * 0.138, -0.07, 0.065), (0.03, 0.026, 0.03), 'eye_glow_red', mx=H, seg=10, rings=6)
        m.ball((sx * 0.043, -0.108, 0.135), (0.032, 0.026, 0.03), 'eye_glow_red', mx=H, seg=10, rings=6)
        m.ball((sx * 0.1, -0.1, 0.118), (0.024, 0.02, 0.024), 'eye_glow_red', mx=H, seg=10, rings=6)
    # mouth and fangs
    m.ball((0, -0.12, -0.04), (0.09, 0.045, 0.05), 'mouth', mx=H, seg=12, rings=6)
    for sx in (-1, 1):
        m.ball((sx * 0.052, -0.115, -0.03), (0.043, 0.043, 0.048), 'spider_head', mx=H, seg=10, rings=6)   # chelicera base
        m.tube([(sx * 0.054, -0.13, -0.045), (sx * 0.062, -0.17, -0.1), (sx * 0.042, -0.2, -0.17)],
               [0.034, 0.027, 0.006], 'spider_fang', seg=8, mx=H, cap=True)
        m.capsule((sx * 0.112, -0.1, -0.03), (sx * 0.122, -0.15, -0.068), 0.024, 0.02, 'spider_head', mx=H, seg=8, rings=3)  # palp
        m.ball((sx * 0.122, -0.153, -0.07), 0.021, 'spider_joint', mx=H, seg=8, rings=5)


ABD_R = (0.2, 0.24, 0.19)


def abdomen(m, A, view_dir=None):
    """Fat round abdomen in frame A. The glowing hourglass mark is set where the camera sees the abdomen above the head."""
    rx, ry, rz = ABD_R
    m.ball((0, 0, 0), ABD_R, 'spider_abd', mx=A, seg=22, rings=12)
    # the spot the camera sees, tipped 22 degrees up the screen from the pole that faces it
    r, u, v = bl.cam_basis()
    psi = math.radians(24)
    d = (-v) * math.cos(psi) + u * math.sin(psi)
    Ainv = A.to_3x3().inverted()
    dl = Ainv @ d
    ul = Ainv @ u
    s = 1.0 / math.sqrt((dl.x / rx) ** 2 + (dl.y / ry) ** 2 + (dl.z / rz) ** 2)
    p = dl * s
    n = Vector((p.x / rx ** 2, p.y / ry ** 2, p.z / rz ** 2)).normalized()
    y = (ul - n * ul.dot(n)).normalized()
    x = y.cross(n)
    M = Matrix(((x.x, y.x, n.x, p.x), (x.y, y.y, n.y, p.y), (x.z, y.z, n.z, p.z), (0, 0, 0, 1)))
    MA = A @ M
    for yy, w, l in ((-0.082, 0.052, 0.045), (-0.012, 0.022, 0.032), (0.062, 0.078, 0.062)):   # two lobes and a waist
        m.ball((0, yy, -0.012), (w, l, 0.032), 'spider_glow', mx=MA, seg=14, rings=7)
    # pale spots around it
    for sx in (-1, 1):
        for yy, xx in ((0.0, 0.135), (0.1, 0.12), (-0.1, 0.11)):
            q = M @ Vector((sx * xx, yy, -0.04))
            m.ball(q, (0.026, 0.026, 0.02), 'spider_joint', mx=A, seg=8, rings=5)


def body(t):
    """The whole spider at cycle phase t as one Mesh."""
    m = Mesh('spider')
    a = 2 * PI * t
    bob = 0.012 * math.sin(a * 2)
    B = trans(0.012 * math.sin(a), 0.0, BODY_Z + bob) @ rotz(0.07 * math.sin(a)) @ rotx(0.06 - 0.03 * math.sin(a * 2))
    H = B @ trans(*HEAD_C)
    head(m, H)
    # waist, and the abdomen behind, raised a little
    A = B @ trans(0, 0.26, 0.04) @ rotx(-0.2)
    m.ball((0, 0.1, 0.02), (0.075, 0.1, 0.075), 'spider_head', mx=B, seg=10, rings=6)
    abdomen(m, A)
    feet = foot_targets(t)
    for k in range(4):
        for side in (-1, 1):
            ry, rz = ROOTS[k]
            root = (H @ Vector((side * 0.115, ry, rz))).to_tuple()
            leg(m, root, feet[(k, side)], side)
    m.transform(scale(SCALE))
    return m


def head_centre(t):
    a = 2 * PI * t
    B = trans(0.012 * math.sin(a), 0.0, BODY_Z + 0.012 * math.sin(a * 2)) @ rotz(0.07 * math.sin(a))
    return ((B @ Vector(HEAD_C)) * SCALE).to_tuple()


def build(ctx):
    n = 6
    ink = dict(outline=1.2, inner=0.7)
    ctx.anim('spider_walk', n, lambda i: body(i / n), ink=ink)
    hx = hy = hz = 0.0
    for i in range(n):
        c = head_centre(i / n)
        hx += c[0] / n
        hy += c[1] / n
        hz += c[2] / n
    ctx.anchor('head', 'spider', (hx, hy, hz))
    ctx.value('size', 'spider_head', round(HEAD_R[0] * 2 * SCALE * bl.UNITS_PER_M, 1))

    # ---- gibs, built around the origin so the pivot is their middle
    g = Mesh('head')
    head(g, trans(0, 0.06, 0.0))
    g.ball((0, 0.1, -0.03), (0.1, 0.05, 0.07), 'meat', seg=12, rings=6)           # torn rear
    g.ball((0.03, 0.115, 0.0), (0.045, 0.025, 0.045), 'spider_goo', seg=8, rings=5)
    g.transform(scale(SCALE))
    ctx.one('spider_head', g, ink=ink)

    # a lone leg lying with its knee up
    lg = Mesh('leg')
    root, knee, foot = Vector((0.0, 0.0, 0.09)), Vector((0.1, 0.0, 0.22)), Vector((0.38, 0.0, 0.04))
    lg.ball(root, 0.056, 'spider_joint', seg=10, rings=6)
    lg.capsule(root, knee, 0.044, 0.037, 'spider_leg', seg=10, rings=3)
    lg.ball(knee, 0.05, 'spider_joint', seg=10, rings=6)
    lg.capsule(knee, foot, 0.035, 0.015, 'spider_leg', seg=10, rings=3)
    lg.ball(foot, 0.021, 'spider_tip', seg=8, rings=5)
    lg.ball(root + Vector((-0.04, 0, 0)), (0.04, 0.055, 0.055), 'meat', seg=8, rings=5)
    lg.transform(trans(-0.18, 0, -0.12) @ rotz(0.5))
    lg.transform(scale(SCALE))
    ctx.one('spider_leg', lg, ink=ink)

    # the burst abdomen: a cracked shell with glowing goo and pink guts spilling out
    b = Mesh('body')
    b.ball((0, 0, 0), (0.21, 0.25, 0.19), 'spider_abd', seg=22, rings=12)
    b.ball((0, -0.02, 0.1), (0.15, 0.17, 0.1), 'spider_goo', seg=16, rings=8)        # gaping hole full of goo
    b.ball((0.02, 0.0, 0.15), (0.1, 0.11, 0.06), 'guts', seg=12, rings=7)
    b.ball((-0.07, 0.04, 0.17), (0.045, 0.045, 0.04), 'meat', seg=8, rings=5)
    b.ball((0.08, -0.07, 0.16), (0.035, 0.035, 0.035), 'spider_glow', seg=8, rings=5)
    for k in range(7):                                                              # ragged rim of the hole
        ang = 2 * PI * k / 7
        b.ball((0.14 * math.cos(ang), -0.02 + 0.16 * math.sin(ang), 0.115 + 0.01 * (k % 2)), (0.04, 0.045, 0.035),
               'spider_abd', seg=8, rings=5)
    b.transform(trans(0, 0, 0.2) @ rotx(-0.5))
    b.transform(scale(SCALE))
    ctx.one('spider_body', b, ink=ink)
