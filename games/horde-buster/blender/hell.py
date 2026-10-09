"""Chapter 3 props, the hellscape (Settings lane): black basalt, obsidian, rusty iron, bone and glowing lava.

Everything stands on the XY plane with its base centre at the world origin (the pivot) and faces -Y (toward the camera). Same
conventions and helpers as props.py (56 px/m, flat unlit colours, emit only on the glowing parts: lava cracks, coals, eyes, the gate's
portal); materials are keyed `hl_*` below so the look can be re-tuned in one place.

Frames: lava_rock_0..2, obsidian_spike_0..1, demon_statue, bone_pile_0..1, cage, brazier, chain_post, skull_totem,
pillar_broken_0..1, ribcage, hell_gate, hell_wall, meat_hook_rack.

Numbers for the game (see build): `radius` of the props that stand in play (game units), a `flame` anchor on the brazier (where the lead
draws fire) and `glow` anchors on what casts light (brazier, gate portal, the idol's orb, lava rocks, the ribcage's hollow).
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale, axis_matrix
from props import one

PI = math.pi


# ------------------------------------------------------------------------------------------------ materials

def _materials():
    d = mats.define
    # basalt: black-violet charcoal in three baked tones (lit, mid, shadow side), plus a plain noisy one for flat parts
    d('hl_basalt', base='#3a3443', base2='#27222f', pattern='noise', pscale=5, pamt=0.7, bevel=0.03, bump=0.5, bscale=30, seed=101)
    d('hl_basalt_hi', base='#4f4860', base2='#3c3549', pattern='noise', pscale=5, pamt=0.6, bevel=0.03, bump=0.4, bscale=30, seed=102)
    d('hl_basalt_mid', base='#322c3c', base2='#272230', pattern='noise', pscale=5, pamt=0.6, bevel=0.03, bump=0.4, bscale=30, seed=103)
    d('hl_basalt_lo', base='#1c1823', base2='#14111a', pattern='noise', pscale=5, pamt=0.6, bevel=0.03, bump=0.4, bscale=30, seed=104)
    d('hl_slate', base='#2e2837', base2='#201c28', pattern='stripes', pscale=7, pamt=0.35, bevel=0.025, bump=0.3, seed=105)
    # obsidian: glassy violet-black crystal, three tones
    d('hl_obs_hi', base='#44306a', base2='#33234f', pattern='noise', pscale=4, pamt=0.5, bevel=0.01, seed=106)
    d('hl_obs_mid', base='#231638', base2='#1a0f2b', pattern='noise', pscale=4, pamt=0.5, bevel=0.01, seed=107)
    d('hl_obs_lo', base='#0f0819', base2='#0a0511', pattern='noise', pscale=4, pamt=0.5, bevel=0.01, seed=108)
    # lava: orange with hot yellow flecks; the hot one is for cores and the portal
    d('hl_lava', base='#ff6a14', base2='#ffb52e', pattern='noise', pscale=9, pamt=0.7, emit=1.0, bevel=0.01, seed=110)
    d('hl_lava_hot', base='#ffd45a', base2='#fff0a8', pattern='noise', pscale=9, pamt=0.6, emit=1.0, bevel=0.01, seed=111)
    d('hl_lava_deep', base='#e03a08', base2='#ff6a14', pattern='noise', pscale=7, pamt=0.7, emit=1.0, bevel=0.01, seed=112)
    d('hl_coal', base='#3a1a14', base2='#6a2a18', pattern='noise', pscale=12, pamt=0.7, bump=0.5, bevel=0.01, seed=113)
    # bone
    d('hl_bone', base='#efe3c4', base2='#c3b38a', pattern='noise', pscale=8, pamt=0.5, bevel=0.015, seed=114)
    d('hl_bone_lo', base='#b9a679', base2='#8f7f58', pattern='noise', pscale=8, pamt=0.5, bevel=0.015, seed=115)
    d('hl_horn', base='#dccca4', base2='#a8946a', pattern='noise', pscale=7, pamt=0.7, bevel=0.012, seed=116)
    d('hl_socket', base='#1a0d10', bevel=0.004)
    d('hl_eye', base='#ff5a1a', base2='#ffc43a', pattern='noise', pscale=14, pamt=0.5, emit=1.0, bevel=0.004, seed=117)
    # iron
    d('hl_iron', base='#4e4449', base2='#302a2e', pattern='noise', pscale=7, pamt=0.6, bevel=0.015, bump=0.25, seed=118)
    d('hl_iron_dark', base='#241f24', bevel=0.012)
    d('hl_rust', base='#a2552e', base2='#6a3320', pattern='noise', pscale=9, pamt=0.7, bevel=0.012, bump=0.5, seed=119)
    d('hl_brass', base='#c9993a', base2='#8a6422', pattern='noise', pscale=8, pamt=0.5, bevel=0.012, seed=120)
    # meat, wood, cloth
    d('hl_meat', base='#8e2433', base2='#c04858', pattern='noise', pscale=7, pamt=0.8, bump=0.6, bevel=0.02, seed=121)
    d('hl_fat', base='#e8b7a0', base2='#c98a80', pattern='noise', pscale=8, pamt=0.6, bevel=0.02, seed=122)
    d('hl_wood', base='#5a4030', base2='#3a281e', pattern='stripes', pscale=7, pamt=0.5, bevel=0.015, bump=0.3, seed=123)
    d('hl_cloth', base='#7a2030', base2='#4e121e', pattern='noise', pscale=6, pamt=0.7, bump=0.3, bevel=0.01, seed=124)


_materials()

BASALT3 = ('hl_basalt_hi', 'hl_basalt_mid', 'hl_basalt_lo')
OBS3 = ('hl_obs_hi', 'hl_obs_mid', 'hl_obs_lo')
U = bl.UNITS_PER_M


# ------------------------------------------------------------------------------------------------ helpers

def hull_data(pts):
    """Convex hull of 3D points -> ([(vertex tuples, normal), ...], [(a, b) edge endpoint tuples])."""
    tb = bmesh.new()
    vs = [tb.verts.new(p) for p in pts]
    bmesh.ops.convex_hull(tb, input=vs, use_existing_faces=False)
    for g in tb.verts[:]:
        if not g.link_faces:
            tb.verts.remove(g)
    bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
    polys = [([tuple(v.co) for v in f.verts], f.normal.copy()) for f in tb.faces]
    edges = [(tuple(e.verts[0].co), tuple(e.verts[1].co)) for e in tb.edges]
    tb.free()
    return polys, edges


def tone_hull(m, pts, mats3, mx=None, bevel=0.02, light=(-0.4, -0.6, 0.7)):
    """A faceted solid from the hull of `pts`; every facet takes one of three baked tones by how it faces the light.
    Returns the facets [(vertices, normal), ...] (for painting cracks on)."""
    polys, edges = hull_data(pts)
    L = Vector(light).normalized()
    groups = ([], [], [])
    for poly, n in polys:
        d = n.dot(L)
        groups[0 if d > 0.35 else (1 if d > -0.2 else 2)].append(poly)
    for g, mt in zip(groups, mats3):
        if not g:
            continue
        t2 = bmesh.new()
        for poly in g:
            try:
                t2.faces.new([t2.verts.new(p) for p in poly])
            except ValueError:
                pass
        bmesh.ops.remove_doubles(t2, verts=t2.verts[:], dist=1e-6)
        m.commit(t2, mt, 0.0, mx, bevel)
    return polys


def blob_pts(c, radii, seed, n=14, jitter=0.2):
    """Random points on a jittered ellipsoid (the raw material of a boulder)."""
    r = random.Random(seed)
    pts = []
    while len(pts) < n:
        v = Vector((r.gauss(0, 1), r.gauss(0, 1), r.gauss(0, 1)))
        if v.length < 0.2:
            continue
        v.normalize()
        v *= 1 + r.uniform(-jitter, jitter)
        pts.append((c[0] + v.x * radii[0], c[1] + v.y * radii[1], c[2] + v.z * radii[2]))
    return pts


def _orient(pts, n):
    """Order polygon points so its Newell normal agrees with n."""
    P = [Vector(p) for p in pts]
    nn = Vector()
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        nn += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
    return pts if nn.dot(n) >= 0 else list(reversed(pts))


def crack_strip(m, pts, n, w0, w1, mat, off=0.01, mx=None):
    """A flat jagged ribbon along the polyline `pts`, lying in the plane with normal n, pushed `off` out of the surface."""
    n = Vector(n).normalized()
    P = [Vector(p) for p in pts]
    left, right = [], []
    for i, p in enumerate(P):
        a = P[max(0, i - 1)]
        b = P[min(len(P) - 1, i + 1)]
        t = (b - a)
        if t.length < 1e-6:
            continue
        perp = n.cross(t.normalized()).normalized()
        w = (w0 + (w1 - w0) * i / max(1, len(P) - 1)) * 0.5
        left.append(tuple(p + perp * w + n * off))
        right.append(tuple(p - perp * w + n * off))
    if len(left) < 2:
        return
    m.poly(_orient(left + list(reversed(right)), n), mat, mx=mx)


def crack(m, a, b, n, w=0.05, rnd=None, k=4, amp=0.12, fork=True, mx=None, off=0.01):
    """A glowing crack from a to b on a surface with normal n: a dark underlay, then a jagged ribbon of lava, forking once."""
    rnd = rnd or random.Random(1)
    A, B = Vector(a), Vector(b)
    n = Vector(n).normalized()
    d = B - A
    L = d.length
    perp = n.cross(d.normalized()).normalized()
    pts = []
    for i in range(k + 1):
        t = i / k
        j = 0.0 if i in (0, k) else rnd.uniform(-1, 1) * amp * L
        pts.append(tuple(A + d * t + perp * j))
    crack_strip(m, pts, n, w * 2.4, w * 1.2, 'hl_coal', off * 0.5, mx)
    crack_strip(m, pts, n, w, w * 0.35, 'hl_lava', off, mx)
    if fork and k >= 3:
        i = rnd.randrange(1, k - 1)
        p0 = Vector(pts[i])
        side = rnd.choice((-1, 1))
        e = p0 + d.normalized() * L * 0.28 + perp * side * L * 0.22
        mid = (p0 + e) / 2 + perp * rnd.uniform(-0.04, 0.04) * L
        sub = [tuple(p0), tuple(mid), tuple(e)]
        crack_strip(m, sub, n, w * 1.9, w * 0.8, 'hl_coal', off * 0.5, mx)
        crack_strip(m, sub, n, w * 0.8, w * 0.25, 'hl_lava', off, mx)


def face_cracks(m, polys, seed, count=3, w=0.055, mx=None, min_y=-0.05):
    """Cracks painted on the biggest camera-facing facets of a hull (see tone_hull / hull_data)."""
    rnd = random.Random(seed)
    cand = []
    for poly, n in polys:
        if n.y > min_y or n.z < -0.2:
            continue
        P = [Vector(p) for p in poly]
        c = sum(P, Vector()) / len(P)
        area = sum(((P[i] - c).cross(P[(i + 1) % len(P)] - c)).length for i in range(len(P))) / 2
        cand.append((area, P, n, c))
    cand.sort(key=lambda t: -t[0])
    cand = cand[:max(count + 2, count * 2)]
    rnd.shuffle(cand)
    for area, P, n, c in cand[:count]:
        i, j = rnd.sample(range(len(P)), 2)
        e0 = (P[i] + P[(i + 1) % len(P)]) / 2
        e1 = (P[j] + P[(j + 1) % len(P)]) / 2
        a = e0 * 0.95 + c * 0.05
        b = e1 * 0.8 + c * 0.2
        crack(m, tuple(a), tuple(b), n, w=w, rnd=rnd, k=4, amp=0.1, mx=mx)



def flat(m, pts_xy, z0, z1, mat, mx=None):
    """A horizontal slab from a 2D outline [(x, y), ...] between heights z0 and z1 (lava puddles, ground patches)."""
    m.prism([(x, -y) for x, y in pts_xy], 0.0, z1 - z0, mat, mx=(mx if mx is not None else Matrix.Identity(4)) @ trans(0, 0, z0) @ rotx(PI / 2))


def ragged(cx, cy, rx, ry, seed, n=14, jag=0.25, rot=0.0):
    """A ragged oval outline (puddles, scorch marks), counter-clockwise."""
    r = random.Random(seed)
    pts = []
    for i in range(n):
        a = 2 * PI * i / n
        k = 1 + r.uniform(-jag, jag) * (1 if i % 2 else 0.5)
        x, y = math.cos(a) * rx * k, math.sin(a) * ry * k
        pts.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
    return pts


def puddle(m, cx, cy, rx, ry, seed, z=0.0, rot=0.0):
    """A little lava pool: deep orange rim, bright orange middle, hot core."""
    flat(m, ragged(cx, cy, rx, ry, seed, rot=rot), z, z + 0.03, 'hl_lava_deep')
    flat(m, ragged(cx, cy, rx * 0.72, ry * 0.7, seed + 1, rot=rot), z, z + 0.05, 'hl_lava')
    flat(m, ragged(cx, cy, rx * 0.4, ry * 0.38, seed + 2, n=10, rot=rot), z, z + 0.07, 'hl_lava_hot')


def cone(m, a, b, r, mat, seg=6, mx=None, cap=True):
    """A faceted spike from base a (radius r) to tip b."""
    m.cyl(a, b, r, 0.0, mat, seg=seg, smooth=0.0, cap=cap, mx=mx)


def spike_row(m, x0, x1, y, z, n, h, r, mat='hl_iron', lean=0.0):
    """A row of iron spikes along X (wall tops, gate teeth)."""
    for i in range(n):
        x = x0 + (x1 - x0) * (i + 0.5) / n
        cone(m, (x, y, z), (x + lean, y, z + h), r, mat, seg=5)


def chain(m, pts, link=0.11, r=0.028, mat='hl_iron', seg=8):
    """A chain along a dense polyline: elongated links, turned a quarter every other one."""
    P = [Vector(p) for p in pts]
    seglen = [(P[i + 1] - P[i]).length for i in range(len(P) - 1)]
    total = sum(seglen)
    n = max(2, int(total / (link * 0.8)))
    for k in range(n + 1):
        d = total * k / n
        i = 0
        while i < len(seglen) - 1 and d > seglen[i]:
            d -= seglen[i]
            i += 1
        t = (P[i + 1] - P[i])
        L = t.length or 1.0
        pos = P[i] + t * min(1.0, d / L)
        rot = axis_matrix((0, 0, 0), tuple(t.normalized()))
        rad = (r * 1.7, r * 0.8, link * 0.62) if k % 2 else (r * 0.8, r * 1.7, link * 0.62)
        m.ball(tuple(pos), rad, mat, seg=seg, rings=5, rot=rot)


def catenary(a, b, sag, n=14):
    """Points from a to b hanging with a sag (metres) in the middle."""
    a, b = Vector(a), Vector(b)
    pts = []
    for i in range(n + 1):
        t = i / n
        p = a + (b - a) * t
        p.z -= sag * 4 * t * (1 - t)
        pts.append(tuple(p))
    return pts


def arc_pts(c, R, a0, a1, u, v, n=10):
    """Points on a circle arc about c in the plane spanned by the unit vectors u and v."""
    c, u, v = Vector(c), Vector(u), Vector(v)
    return [tuple(c + (u * math.cos(a0 + (a1 - a0) * i / n) + v * math.sin(a0 + (a1 - a0) * i / n)) * R) for i in range(n + 1)]


# ------------------------------------------------------------------------------------------------ bones and skulls

def skull(m, c, r=0.22, tilt=0.5, yaw=0.0, glow=False, horns=0.0, mat='hl_bone', roll=0.0):
    """A cartoon skull whose face looks along local -Y, tipped back by `tilt` so it faces up at the camera. `horns` > 0 adds a pair of
    curved horns of that length; `glow` makes the sockets burn."""
    s = Mesh('skull')
    b = min(0.05, r * 0.25)
    s.ball((0, 0.1 * r, 0.1 * r), (r, r, 0.95 * r), mat, seg=14, rings=8)
    s.box(-0.62 * r, 0.62 * r, -0.95 * r, -0.15 * r, -0.78 * r, 0.05 * r, mat, bevel=b)
    s.box(-0.5 * r, 0.5 * r, -0.9 * r, -0.1 * r, -1.02 * r, -0.64 * r, mat, bevel=b)
    for i in range(6):
        x = (-0.4 + 0.16 * i) * r
        s.box(x - 0.055 * r, x + 0.055 * r, -0.97 * r, -0.9 * r, -0.74 * r, -0.5 * r, 'teeth')
    eye = 'hl_eye' if glow else 'hl_socket'
    for sx in (-1, 1):
        s.ball((sx * 0.36 * r, -0.93 * r, 0.0), (0.27 * r, 0.1 * r, 0.3 * r), eye, seg=10, rings=6)
    s.ball((0, -0.97 * r, -0.3 * r), (0.09 * r, 0.06 * r, 0.14 * r), 'hl_socket', seg=8, rings=5)
    if horns > 0:
        for sx in (-1, 1):
            pts = [(sx * 0.8 * r, 0.1 * r, 0.5 * r), (sx * 1.25 * r, 0.0, 0.9 * r + horns * 0.3), (sx * (1.45 * r + horns * 0.15), 0.0, 1.0 * r + horns * 0.7),
                   (sx * (1.15 * r + horns * 0.2), 0.0, 1.0 * r + horns)]
            s.tube(pts, [r * 0.34, r * 0.26, r * 0.17, r * 0.03], 'hl_horn', seg=7, smooth=60.0)
    m.add(s, trans(*c) @ rotz(yaw) @ rotx(-tilt) @ roty(roll))
    s.free()


def bone(m, a, b, r=0.045, mat='hl_bone'):
    """A long bone (femur): a rounded shaft with a pair of knobs at each end."""
    A, B = Vector(a), Vector(b)
    d = (B - A).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 0.1:
        side = d.cross(Vector((1, 0, 0)))
    side.normalize()
    m.capsule(a, b, r, r * 0.9, mat, seg=8, rings=3)
    for e, k in ((A, 1.0), (B, 0.9)):
        for sgn in (-1, 1):
            m.ball(tuple(e + side * sgn * r * 0.85), r * 1.25 * k, mat, seg=8, rings=5)


def vertebrae(m, pts, r=0.06, mat='hl_bone'):
    for i, p in enumerate(pts):
        m.ball(p, (r * 1.2, r, r * 0.8), mat, seg=8, rings=5)
        m.box(p[0] - r * 0.25, p[0] + r * 0.25, p[1] + r * 0.4, p[1] + r * 1.4, p[2] - r * 0.3, p[2] + r * 0.5, mat)


def pebbles(m, rnd, n, cx, cy, rx, ry, size=0.12, mats3=BASALT3, z=0.0, seed=0):
    for i in range(n):
        a = rnd.uniform(0, 2 * PI)
        d = rnd.uniform(0.6, 1.0)
        x, y = cx + math.cos(a) * rx * d, cy + math.sin(a) * ry * d
        s = size * rnd.uniform(0.5, 1.1)
        tone_hull(m, blob_pts((x, y, z + s * 0.5), (s * 1.2, s, s * 0.7), seed * 31 + i, n=9, jitter=0.2), mats3, bevel=0.01)


# ------------------------------------------------------------------------------------------------ lava rocks and obsidian

def lava_rock(kind):
    m = Mesh('lava_rock')
    r = random.Random(500 + kind)
    if kind == 0:
        # a tall boulder split by glowing cracks, two chunks fallen beside it
        c = (0.0, 0.0, 0.95)
        f = tone_hull(m, blob_pts(c, (1.05, 0.9, 1.0), 11, n=18, jitter=0.16), BASALT3, bevel=0.03)
        face_cracks(m, f, 21, count=4, w=0.075)
        for i, (x, y, rr) in enumerate(((1.25, -0.35, 0.34), (-1.2, -0.2, 0.28))):
            f2 = tone_hull(m, blob_pts((x, y, rr * 0.8), (rr * 1.2, rr, rr * 0.85), 30 + i, n=12, jitter=0.2), BASALT3, bevel=0.02)
            face_cracks(m, f2, 40 + i, count=1, w=0.05)
        puddle(m, 0.1, -1.0, 0.55, 0.22, 7)
    elif kind == 1:
        # three boulders leaning round a lava pool
        puddle(m, 0.0, 0.0, 1.15, 0.8, 3)
        for i, (x, y, rx, ry, rz) in enumerate(((-0.85, -0.2, 0.7, 0.62, 0.7), (0.9, -0.1, 0.62, 0.58, 0.62), (0.05, 0.62, 0.72, 0.6, 0.8))):
            c = (x, y, rz * 0.95)
            f = tone_hull(m, blob_pts(c, (rx, ry, rz), 50 + i, n=14, jitter=0.18), BASALT3, bevel=0.03)
            face_cracks(m, f, 60 + i, count=2, w=0.06)
    else:
        # a squat slab with a big glowing seam
        c = (0.0, 0.0, 0.5)
        f = tone_hull(m, blob_pts(c, (1.35, 0.95, 0.55), 71, n=16, jitter=0.14), BASALT3, bevel=0.03)
        face_cracks(m, f, 81, count=5, w=0.08)
        puddle(m, -0.2, -1.05, 0.9, 0.22, 9)
        pebbles(m, r, 4, 0.0, 0.0, 1.5, 1.1, 0.14, seed=3)
    return m


def spike_pts(base, h, rad, lean, seed, sides=6):
    r = random.Random(seed)
    bx, by = base
    pts = []
    for k in range(sides):
        a = 2 * PI * k / sides + r.uniform(-0.15, 0.15)
        j = 1 + r.uniform(-0.15, 0.15)
        pts.append((bx + math.cos(a) * rad * j, by + math.sin(a) * rad * j, 0.0))
    for k in range(sides):
        a = 2 * PI * (k + 0.5) / sides
        pts.append((bx + lean[0] * h * 0.4 + math.cos(a) * rad * 0.62, by + lean[1] * h * 0.4 + math.sin(a) * rad * 0.62, h * 0.5))
    pts.append((bx + lean[0] * h, by + lean[1] * h, h))
    return pts


def obsidian_spike(kind):
    m = Mesh('obsidian')
    if kind == 0:
        items = [((0.0, 0.0), 3.4, 0.55, (0.05, 0.03)), ((-0.75, -0.3), 2.1, 0.4, (-0.22, -0.04)), ((0.7, -0.35), 2.5, 0.42, (0.18, -0.06)),
                 ((0.15, -0.8), 1.3, 0.3, (0.05, -0.2)), ((-0.35, 0.55), 1.8, 0.34, (-0.1, 0.12))]
    else:
        items = [((0.0, 0.0), 4.2, 0.6, (0.12, 0.0)), ((0.85, -0.4), 1.9, 0.38, (0.3, -0.1)), ((-0.8, -0.5), 1.4, 0.32, (-0.3, -0.1)),
                 ((0.35, 0.55), 1.2, 0.28, (0.0, 0.25))]
    for i, (b, h, rad, lean) in enumerate(items):
        tone_hull(m, spike_pts(b, h, rad, lean, 90 + i + 10 * kind), OBS3, bevel=0.012)
    # a seam of lava between the crystals, and scorched rubble at the foot
    puddle(m, 0.0, -0.45, 0.8 if kind == 0 else 0.55, 0.28, 5 + kind, rot=0.1)
    for i, (x, y, s) in enumerate(((-1.0, -0.7, 0.2), (1.1, -0.65, 0.22), (0.5, -1.1, 0.16))):
        tone_hull(m, blob_pts((x, y, s * 0.6), (s * 1.2, s, s * 0.75), 120 + i + 5 * kind, n=10, jitter=0.2), BASALT3, bevel=0.01)
    return m


# ------------------------------------------------------------------------------------------------ the demon idol

def demon_statue():
    m = Mesh('demon_statue')
    # stepped basalt plinth with a glowing rune on its face
    m.box(-1.25, 1.25, -1.05, 1.05, 0.0, 0.42, 'hl_slate', bevel=0.05)
    m.box(-0.95, 0.95, -0.8, 0.8, 0.42, 0.85, 'hl_basalt', bevel=0.05)
    rune = [(0.0, -0.84, 0.74), (0.2, -0.84, 0.64), (0.0, -0.84, 0.46), (-0.2, -0.84, 0.64)]
    m.poly(rune, 'hl_lava')
    m.poly([(0.0, -0.845, 0.66), (0.08, -0.845, 0.62), (0.0, -0.845, 0.54), (-0.08, -0.845, 0.62)], 'hl_lava_hot')
    for sx in (-1, 1):
        puddle(m, sx * 1.55, -0.45, 0.4, 0.22, 14 + sx)
    # legs, feet and claws
    for sx in (-1, 1):
        m.capsule((sx * 0.42, 0.05, 0.9), (sx * 0.48, -0.15, 2.0), 0.3, 0.26, 'hl_basalt_mid', seg=12)
        m.ball((sx * 0.5, -0.38, 0.98), (0.36, 0.48, 0.16), 'hl_basalt', seg=12, rings=6)
        for k in (-1, 0, 1):
            cone(m, (sx * 0.5 + k * 0.17, -0.7, 1.0), (sx * 0.5 + k * 0.2, -1.0, 0.9), 0.07, 'hl_bone', seg=5)
    # torso, belly, loin
    m.ball((0, 0.0, 2.55), (0.95, 0.66, 1.0), 'hl_basalt', seg=16, rings=10)
    m.ball((0, -0.12, 1.95), (0.72, 0.55, 0.55), 'hl_basalt_mid', seg=14, rings=8)
    m.box(-0.62, 0.62, -0.5, 0.5, 1.7, 1.95, 'hl_iron', bevel=0.05)
    m.poly([(-0.2, -0.505, 1.9), (0.2, -0.505, 1.9), (0.0, -0.505, 1.55)], 'hl_rust')
    # glowing chest crack, as if lava burns under the stone
    m.tube([(-0.1, -0.62, 3.1), (0.12, -0.7, 2.85), (-0.05, -0.72, 2.6), (0.16, -0.68, 2.35), (0.0, -0.62, 2.15)], 0.045, 'hl_lava', seg=6)
    for p in ((0.12, -0.7, 2.85), (-0.05, -0.72, 2.6)):
        m.ball(p, 0.07, 'hl_lava_hot', seg=8, rings=5)
    # shoulders with spikes, arms bent up to hold a lava orb
    for sx in (-1, 1):
        m.ball((sx * 1.05, 0.0, 3.05), (0.5, 0.45, 0.45), 'hl_basalt_hi', seg=14, rings=8)
        for k in range(3):
            a = -0.5 + k * 0.5
            cone(m, (sx * (1.05 + math.sin(a) * 0.3), 0.05, 3.3), (sx * (1.2 + math.sin(a) * 0.5), 0.05, 3.9 - abs(a) * 0.4), 0.1, 'hl_bone', seg=5)
        m.capsule((sx * 1.05, 0.0, 3.0), (sx * 1.3, -0.5, 2.35), 0.27, 0.23, 'hl_basalt_mid', seg=12)
        m.capsule((sx * 1.3, -0.5, 2.35), (sx * 0.42, -0.95, 2.75), 0.22, 0.2, 'hl_basalt', seg=12)
        m.ball((sx * 0.4, -0.97, 2.75), (0.2, 0.2, 0.2), 'hl_basalt_hi', seg=10, rings=6)
        for k in (-1, 0, 1):
            cone(m, (sx * 0.4 + k * 0.1, -1.12, 2.7), (sx * 0.4 + k * 0.1 + sx * 0.05, -1.35, 2.62 + k * 0.06), 0.045, 'hl_bone', seg=5)
    m.ball((0, -1.0, 2.82), 0.42, 'hl_lava', seg=16, rings=10)
    m.ball((0, -1.07, 2.86), 0.24, 'hl_lava_hot', seg=12, rings=8)
    # head: tipped up toward the camera, glowing eyes, a fanged grin, great curved horns
    h = Mesh('head')
    h.ball((0, 0.0, 0.0), (0.52, 0.5, 0.52), 'hl_basalt_hi', seg=16, rings=10)
    h.box(-0.38, 0.38, -0.62, -0.1, -0.55, -0.05, 'hl_basalt_hi', bevel=0.05)
    h.box(-0.36, 0.36, -0.58, -0.12, -0.62, -0.46, 'hl_basalt', bevel=0.03)
    h.box(-0.3, 0.3, -0.63, -0.55, -0.5, -0.38, 'hl_socket')
    for i in range(5):
        x = -0.24 + 0.12 * i
        cone(h, (x, -0.62, -0.38), (x, -0.64, -0.55 - (0.06 if i in (0, 4) else 0.0)), 0.04, 'teeth', seg=4)
    for sx in (-1, 1):
        h.ball((sx * 0.24, -0.5, 0.12), (0.13, 0.07, 0.07), 'hl_eye', seg=10, rings=6, rot=rotz(sx * -0.0) @ roty(sx * -0.45))
        h.box(min(sx * 0.08, sx * 0.44), max(sx * 0.08, sx * 0.44), -0.58, -0.42, 0.2, 0.3, 'hl_basalt_lo', bevel=0.03)
        pts = [(sx * 0.42, 0.0, 0.25), (sx * 0.85, -0.05, 0.5), (sx * 1.05, -0.05, 1.0), (sx * 0.7, -0.05, 1.5)]
        h.tube(pts, [0.17, 0.14, 0.1, 0.03], 'hl_horn', seg=8, smooth=60.0)
        h.ball((sx * 0.5, -0.1, -0.2), (0.12, 0.12, 0.2), 'hl_basalt', seg=8, rings=5)
    m.add(h, trans(0, -0.18, 3.85) @ rotx(-0.5))
    h.free()
    # folded wings behind the shoulders, angular and big (they make the silhouette)
    for sx in (-1, 1):
        wing = Mesh('wing')
        pts = [(0.0, 0.0), (0.5, 0.35), (1.5, 0.75), (2.0, 1.55), (1.9, 2.5), (1.45, 1.95), (1.35, 2.85), (0.9, 2.1), (0.55, 2.55), (0.25, 1.4)]
        wing.prism(pts, -0.07, 0.07, 'hl_basalt_mid', bevel=0.02)
        wing.cyl((0.0, 0.0, 0.0), (1.9, 0.0, 2.45), 0.07, 0.05, 'hl_bone', seg=6)
        wing.cyl((0.0, 0.0, 0.0), (1.35, 0.0, 2.8), 0.06, 0.04, 'hl_bone', seg=6)
        wing.cyl((0.0, 0.0, 0.0), (0.55, 0.0, 2.5), 0.05, 0.03, 'hl_bone', seg=6)
        m.add(wing, trans(sx * 0.55, 0.62, 2.85) @ rotz(sx * -0.0) @ roty(sx * 0.0) @ (scale(sx, 1, 1)) @ rotz(0.0) @ rotx(0.1))
        wing.free()
    return m


# ------------------------------------------------------------------------------------------------ bones, cage, brazier

def bone_pile(kind):
    m = Mesh('bone_pile')
    r = random.Random(600 + kind)
    if kind == 0:
        # a flat scatter: long bones criss-crossed, two skulls, a few ribs
        for i in range(11):
            a = r.uniform(0, PI)
            L = r.uniform(0.6, 1.0)
            cx, cy = r.uniform(-0.8, 0.8), r.uniform(-0.4, 0.45)
            z = 0.1 + 0.07 * (i % 3)
            bone(m, (cx - math.cos(a) * L / 2, cy - math.sin(a) * L / 2, z), (cx + math.cos(a) * L / 2, cy + math.sin(a) * L / 2, z + 0.06), 0.05)
        skull(m, (-0.5, -0.4, 0.34), 0.31, tilt=0.6, yaw=0.5)
        skull(m, (0.65, 0.05, 0.3), 0.25, tilt=0.5, yaw=-0.7)
        for i in range(3):
            c = (0.0 + 0.3 * i, 0.4, 0.12)
            m.tube(arc_pts(c, 0.38, 0.0, PI * 0.85, (1, 0, 0), (0, 0, 1), 8), [0.06, 0.055, 0.04] + [0.035] * 6, 'hl_bone', seg=6, mx=rotz(0.35 - 0.2 * i))
        vertebrae(m, [(-0.9 + 0.15 * i, 0.5 + 0.03 * i, 0.08) for i in range(6)], 0.07)
    else:
        # a mound with a big horned skull on top
        m.ball((0, 0.0, 0.25), (0.95, 0.75, 0.4), 'hl_basalt_lo', seg=14, rings=8)
        for i in range(10):
            a = r.uniform(0, 2 * PI)
            d = r.uniform(0.2, 0.75)
            cx, cy = math.cos(a) * d, math.sin(a) * d * 0.7
            aa = r.uniform(0, PI)
            L = r.uniform(0.5, 0.85)
            z = 0.35 + 0.35 * (1 - d)
            bone(m, (cx - math.cos(aa) * L / 2, cy - math.sin(aa) * L / 2, z), (cx + math.cos(aa) * L / 2, cy + math.sin(aa) * L / 2, z + 0.1), 0.05)
        skull(m, (0.0, -0.15, 0.95), 0.36, tilt=0.55, yaw=0.0, horns=0.45, glow=True)
        skull(m, (-0.7, -0.35, 0.3), 0.2, tilt=0.5, yaw=0.6)
        skull(m, (0.65, -0.4, 0.28), 0.18, tilt=0.5, yaw=-0.5)
    return m


def cage():
    m = Mesh('cage')
    R = 0.9
    H = 2.15
    m.lathe([(0.0, 0.0), (0.0, R + 0.1), (0.14, R + 0.1)], 'hl_iron_dark', seg=14, smooth=0.0, cap=False)   # floor plate
    m.lathe([(0.141, R + 0.1), (0.141, 0.0)], 'hl_iron', seg=14, smooth=0.0, cap=False)
    # the poor soul inside: pelvis, spine, ribs, skull tipped up, arms reaching for the bars
    sk = Mesh('skeleton')
    sk.ball((0, 0.1, 0.38), (0.26, 0.18, 0.15), 'hl_bone', seg=10, rings=6)
    sk.capsule((0, 0.1, 0.45), (0, 0.05, 1.15), 0.05, 0.05, 'hl_bone', seg=8)
    for i in range(4):
        z = 0.62 + i * 0.14
        w = 0.3 - abs(i - 1.2) * 0.04
        sk.tube(arc_pts((0, 0.05, z), w, 0.15, PI - 0.15, (1, 0, 0), (0, -1, 0), 8), 0.026, 'hl_bone', seg=5)
    skull(sk, (0.0, -0.05, 1.5), 0.24, tilt=0.55, yaw=0.15)
    bone(sk, (0.28, 0.05, 1.12), (0.56, -0.35, 1.5), 0.04)
    bone(sk, (-0.28, 0.05, 1.12), (-0.5, -0.38, 0.85), 0.04)
    bone(sk, (0.1, -0.1, 0.38), (0.45, -0.55, 0.14), 0.05)
    bone(sk, (-0.1, -0.1, 0.38), (-0.5, -0.45, 0.14), 0.05)
    m.add(sk, trans(0, 0.05, 0.12))
    sk.free()
    bars = 12
    for i in range(bars):
        a = 2 * PI * i / bars + 0.1
        x, y = math.cos(a) * R, math.sin(a) * R
        m.cyl((x, y, 0.14), (x, y, H), 0.04, 0.04, 'hl_iron', seg=6, smooth=40.0)
        # dome bars lean in to a ring on the top
        m.cyl((x, y, H), (x * 0.18, y * 0.18, H + 0.45), 0.04, 0.035, 'hl_iron', seg=6, smooth=40.0)
    for z in (0.3, 1.0, 1.7, H):
        m.lathe([(z - 0.04, R + 0.045), (z + 0.04, R + 0.045), (z + 0.04, R - 0.02), (z - 0.04, R - 0.02)], 'hl_rust' if z == 1.0 else 'hl_iron_dark', seg=24, smooth=40.0, cap=False)
    m.lathe([(H + 0.4, 0.17), (H + 0.5, 0.17), (H + 0.5, 0.0)], 'hl_iron_dark', seg=10, smooth=40.0, cap=False)
    # hanging ring and a short chain
    ring = [tuple(p) for p in arc_pts((0, 0, H + 0.75), 0.22, 0, 2 * PI, (1, 0, 0), (0, 0, 1), 12)]
    m.tube(ring, 0.04, 'hl_iron_dark', seg=6)
    m.cyl((0, 0, H + 0.45), (0, 0, H + 0.58), 0.07, 0.06, 'hl_iron_dark', seg=8)
    # lock and door frame on the front bars
    m.box(-0.14, 0.14, -R - 0.16, -R - 0.04, 0.95, 1.15, 'hl_brass', bevel=0.02)
    m.ball((0.0, -R - 0.17, 1.05), 0.04, 'hl_socket', seg=6, rings=4)
    # bones and a skull on the ground by the door
    bone(m, (0.55, -1.15, 0.08), (1.0, -1.35, 0.1), 0.04)
    skull(m, (-0.85, -1.1, 0.2), 0.17, tilt=0.5, yaw=0.6)
    return m


def brazier():
    m = Mesh('brazier')
    for k in range(3):
        a = 2 * PI * k / 3 + PI / 2
        x, y = math.cos(a) * 0.5, math.sin(a) * 0.5
        m.cyl((x * 1.25, y * 1.25, 0.0), (x * 0.5, y * 0.5, 0.95), 0.07, 0.05, 'hl_iron', seg=6)
        m.ball((x * 1.25, y * 1.25, 0.05), (0.1, 0.1, 0.06), 'hl_iron_dark', seg=8, rings=4)
    m.tube(arc_pts((0, 0, 0.5), 0.78, 0, 2 * PI, (1, 0, 0), (0, 1, 0), 14), 0.03, 'hl_iron_dark', seg=5)
    # the bowl, a wide iron cup with a studded rim
    m.lathe([(0.82, 0.0), (0.85, 0.28), (0.95, 0.5), (1.15, 0.64), (1.3, 0.7), (1.32, 0.62)], 'hl_iron', seg=18, smooth=50.0, cap=False)
    m.lathe([(1.26, 0.7), (1.34, 0.74), (1.38, 0.68), (1.3, 0.62)], 'hl_rust', seg=18, smooth=40.0, cap=False)
    for k in range(6):
        a = 2 * PI * k / 6
        cone(m, (math.cos(a) * 0.68, math.sin(a) * 0.68, 1.3), (math.cos(a) * 0.76, math.sin(a) * 0.76, 1.62), 0.06, 'hl_iron_dark', seg=5)
    # coals heaped over the rim, glowing
    m.lathe([(1.24, 0.6), (1.4, 0.5), (1.58, 0.28), (1.64, 0.0)], 'hl_lava_deep', seg=14, smooth=40.0, cap=False)
    rnd = random.Random(8)
    for k in range(7):
        a = rnd.uniform(0, 2 * PI)
        d = rnd.uniform(0.15, 0.5)
        tone_hull(m, blob_pts((math.cos(a) * d, math.sin(a) * d, 1.55 - d * 0.4), (0.15, 0.14, 0.11), 200 + k, n=8, jitter=0.2), ('hl_lava', 'hl_lava_deep', 'hl_coal'), bevel=0.0)
    for k in range(3):
        a = 0.8 + 2.1 * k
        m.ball((math.cos(a) * 0.3, math.sin(a) * 0.3, 1.66), 0.07, 'hl_lava_hot', seg=6, rings=4)
    return m


def chain_post():
    m = Mesh('chain_post')
    r = random.Random(9)
    m.box(-0.6, 0.6, -0.6, 0.6, 0.0, 0.35, 'hl_slate', bevel=0.05)
    m.box(-0.3, 0.3, -0.3, 0.3, 0.35, 3.1, 'hl_basalt_hi', bevel=0.04)
    for z in (0.8, 2.2):
        m.box(-0.36, 0.36, -0.36, 0.36, z, z + 0.18, 'hl_iron', bevel=0.025)
        for k in (-1, 0, 1):
            m.ball((k * 0.2, -0.37, z + 0.09), 0.04, 'hl_brass', seg=6, rings=4)
    cone(m, (0, 0, 3.1), (0, 0, 4.0), 0.3, 'hl_iron_dark', seg=4)
    crack(m, (0.12, -0.3, 3.0), (0.05, -0.3, 2.3), (0, -1, 0), w=0.06, rnd=r, k=3, amp=0.06, fork=False)
    crack(m, (-0.1, -0.3, 1.9), (-0.06, -0.3, 0.9), (0, -1, 0), w=0.06, rnd=r, k=4, amp=0.06)
    m.tube(arc_pts((0, -0.4, 2.75), 0.2, 0, 2 * PI, (1, 0, 0), (0, 0, 1), 12), 0.045, 'hl_iron_dark', seg=6)
    # two chains: one sags away to a shackle, one is flung out and lies in a loop on the ground
    chain(m, catenary((0.15, -0.42, 2.7), (1.7, -0.7, 0.12), 0.6), 0.12, 0.032)
    chain(m, [(0.0, -0.44, 2.6), (-0.4, -0.6, 1.7), (-0.8, -0.8, 0.8), (-1.05, -1.05, 0.1), (-1.45, -1.1, 0.08), (-1.75, -0.85, 0.08), (-1.65, -0.55, 0.08), (-1.4, -0.5, 0.08)], 0.12, 0.032)
    for p in ((1.75, -0.72, 0.12), (-1.35, -0.5, 0.1)):
        m.tube(arc_pts(p, 0.19, 0.3, 2 * PI - 0.3, (1, 0, 0), (0, -1, 0), 10), 0.045, 'hl_iron_dark', seg=6)
        m.box(p[0] - 0.06, p[0] + 0.06, p[1] - 0.06, p[1] + 0.06, 0.06, 0.2, 'hl_rust')
    skull(m, (0.95, 0.5, 0.15), 0.18, tilt=0.5, yaw=-0.5)
    pebbles(m, r, 4, 0.0, 0.0, 1.3, 0.9, 0.11, seed=7)
    return m


def skull_totem():
    m = Mesh('skull_totem')
    r = random.Random(12)
    m.ball((0, 0, 0.18), (1.0, 0.8, 0.3), 'hl_basalt_lo', seg=12, rings=7)
    pebbles(m, r, 6, 0.0, 0.0, 1.0, 0.7, 0.14, seed=11)
    # charred pole
    m.cyl((0, 0, 0.1), (0, 0, 4.1), 0.14, 0.11, 'hl_wood', seg=8, smooth=40.0)
    # stacked skulls up the pole, each turned a different way
    for i, (z, s, yaw) in enumerate(((0.85, 0.27, 0.0), (1.55, 0.25, 0.5), (2.2, 0.23, -0.4))):
        skull(m, (0.0, -0.19 * s / 0.25, z), s, tilt=0.45, yaw=yaw)
    # a crossbar with two long bones and rags
    m.box(-1.0, 1.0, -0.08, 0.08, 2.75, 2.88, 'hl_wood', bevel=0.02)
    for sx in (-1, 1):
        bone(m, (sx * 1.0, 0.0, 2.8), (sx * 1.3, 0.0, 2.55), 0.045)
        for k in range(2):
            x = sx * (0.35 + 0.45 * k)
            m.prism([(x - 0.12, 2.75), (x + 0.12, 2.75), (x + 0.07, 2.1 - k * 0.2), (x, 1.95 - k * 0.3), (x - 0.08, 2.2)], -0.03, 0.03, 'hl_cloth', mx=rotz(0.0))
    # crowning horned skull with burning eyes
    skull(m, (0.0, -0.26, 3.85), 0.4, tilt=0.5, glow=True, horns=0.6)
    cone(m, (0, 0, 4.0), (0, 0, 4.35), 0.08, 'hl_iron_dark', seg=5)
    m.cyl((0, 0, 3.35), (0, 0, 3.45), 0.19, 0.19, 'hl_iron', seg=8)
    return m


# ------------------------------------------------------------------------------------------------ pillars, ribs, gate

def pillar_broken(kind):
    m = Mesh('pillar')
    r = random.Random(700 + kind)
    if kind == 0:
        # a fluted column snapped off in jagged teeth, its fallen drum lying beside it, a glowing crack down the shaft
        m.box(-0.85, 0.85, -0.85, 0.85, 0.0, 0.4, 'hl_slate', bevel=0.05)
        m.box(-0.7, 0.7, -0.7, 0.7, 0.4, 0.6, 'hl_basalt', bevel=0.04)
        m.lathe([(0.6, 0.56), (0.9, 0.5), (3.0, 0.48), (3.05, 0.5)], 'hl_basalt_mid', seg=10, smooth=0.0, cap=False)
        for k in range(10):
            a = 2 * PI * k / 10
            m.cyl((math.cos(a) * 0.5, math.sin(a) * 0.5, 0.65), (math.cos(a) * 0.5, math.sin(a) * 0.5, 2.9), 0.05, 0.05, 'hl_basalt_lo', seg=4, smooth=0.0)
        for k in range(6):
            a = 2 * PI * k / 6 + 0.3
            h = 3.0 + r.uniform(0.0, 0.6) * (1 if k % 2 else 0.4)
            cone(m, (math.cos(a) * 0.33, math.sin(a) * 0.33, 2.95), (math.cos(a) * 0.12, math.sin(a) * 0.12, h), 0.2, 'hl_basalt_hi', seg=4)
        crack(m, (0.05, -0.5, 2.8), (-0.02, -0.5, 1.2), (0, -1, 0), w=0.08, rnd=r, k=5, amp=0.08)
        # fallen drum
        da, db = Vector((-2.6, -0.1, 0.5)), Vector((-1.35, -1.15, 0.5))
        m.cyl(tuple(da), tuple(db), 0.5, 0.5, 'hl_basalt_mid', seg=10, smooth=0.0)
        dd = (db - da).normalized()
        m.lathe([(0.012, 0.0), (0.012, 0.5)], 'hl_basalt_hi', seg=10, smooth=0.0, cap=False, mx=axis_matrix(tuple(db), tuple(db + dd)))
        m.lathe([(0.03, 0.0), (0.03, 0.3)], 'hl_basalt_lo', seg=10, smooth=0.0, cap=False, mx=axis_matrix(tuple(db), tuple(db + dd)))
        m.lathe([(0.04, 0.0), (0.04, 0.1)], 'hl_lava', seg=8, smooth=0.0, cap=False, mx=axis_matrix(tuple(db), tuple(db + dd)))
        pebbles(m, r, 5, 0.0, 0.0, 1.8, 1.0, 0.17, seed=17)
        puddle(m, 0.2, -1.35, 0.5, 0.18, 21)
    else:
        # a leaning square pillar, carved with a snarling face, top sheared off at a slant
        piv = Mesh('lean')
        piv.box(-0.8, 0.8, -0.8, 0.8, 0.0, 0.35, 'hl_slate', bevel=0.05)
        piv.box(-0.55, 0.55, -0.55, 0.55, 0.35, 2.3, 'hl_basalt', bevel=0.04)
        for z in (0.9, 1.9):
            piv.box(-0.6, 0.6, -0.6, 0.6, z, z + 0.12, 'hl_iron', bevel=0.02)
        top = [(-0.55, 2.3), (0.55, 2.3), (0.55, 2.9), (0.1, 2.55), (-0.3, 3.05), (-0.55, 2.7)]
        piv.prism(top, -0.55, 0.55, 'hl_basalt_hi', bevel=0.03)
        # the face: burning eye slits, a fanged mouth
        for sx in (-1, 1):
            piv.poly([(sx * 0.12, -0.565, 1.5), (sx * 0.4, -0.565, 1.62), (sx * 0.38, -0.565, 1.52), (sx * 0.14, -0.565, 1.42)], 'hl_eye')
        piv.box(-0.34, 0.34, -0.575, -0.55, 0.95, 1.2, 'hl_socket')
        for i in range(4):
            x = -0.27 + 0.18 * i
            cone(piv, (x, -0.58, 1.2), (x, -0.6, 1.0), 0.05, 'teeth', seg=4)
        crack(piv, (0.4, -0.55, 2.25), (0.3, -0.55, 0.45), (0, -1, 0), w=0.07, rnd=r, k=5, amp=0.08)
        m.add(piv, rotx(0.0) @ roty(0.0) @ rotz(0.0) @ trans(0, 0, 0) @ roty(-0.09))
        piv.free()
        puddle(m, 0.0, -1.0, 0.8, 0.25, 31)
        chain(m, [(0.62, -0.1, 1.2), (0.9, -0.5, 0.7), (1.35, -0.8, 0.12), (1.7, -0.7, 0.08)], 0.11, 0.028)
        pebbles(m, r, 7, 0.0, 0.0, 1.5, 1.0, 0.16, seed=29)
        tone_hull(m, blob_pts((-1.25, -0.5, 0.35), (0.55, 0.45, 0.35), 311, n=12, jitter=0.18), BASALT3, bevel=0.02)
    return m


def ribcage():
    m = Mesh('ribcage')
    L = 4.0
    n = 6
    # the spine runs along the ground, each rib springs from it, swings out, up and back over
    for i in range(14):
        y = -L / 2 + L * i / 13
        s = 0.17 - 0.05 * abs(i - 6.5) / 6.5
        m.ball((0, y, 0.2), (s * 1.3, s * 0.9, s), 'hl_bone_lo', seg=10, rings=6)
        m.box(-0.04, 0.04, y - 0.02, y + 0.02, 0.2, 0.45, 'hl_bone_lo')
    for i in range(n):
        y = -L / 2 + 0.5 + (L - 1.0) * i / (n - 1)
        size = 1.0 - 0.13 * abs(i - 2.5) / 2.5
        for sx in (-1, 1):
            pts = []
            steps = 14
            for k in range(steps + 1):
                t = k / steps
                a = PI * 0.08 + t * PI * 0.92
                x = sx * (0.18 + 1.75 * size * math.sin(a * 0.98) * (1.0 - 0.15 * t))
                z = 0.25 + 3.0 * size * (1 - math.cos(a)) / 2.0 * 0.9 + 0.3 * t * size
                pts.append((x, y - 0.12 * math.sin(a), z))
            # taper from a thick root to a thin tip
            rad = [0.14 - 0.1 * (k / steps) ** 0.8 for k in range(steps + 1)]
            m.tube(pts, rad, 'hl_bone', seg=7, smooth=60.0)
            m.ball(pts[0], 0.16, 'hl_bone', seg=8, rings=5)
            m.ball(pts[-1], 0.05, 'hl_bone', seg=6, rings=4)
    # scraps of dried flesh and lava glowing in the hollow
    puddle(m, 0.0, 0.0, 0.7, 1.4, 41, rot=PI / 2)
    skull(m, (0.0, -2.55, 0.62), 0.6, tilt=0.55, yaw=0.0, glow=True, horns=0.9)
    return m


def hell_gate():
    m = Mesh('hell_gate')
    TX = 2.75       # tower centre x
    # ---- the glowing portal and the molten floor between the towers
    portal = [(-1.65, 0.0), (-1.65, 3.4), (-1.2, 4.1), (0.0, 4.5), (1.2, 4.1), (1.65, 3.4), (1.65, 0.0)]
    m.prism(portal, 1.0, 1.1, 'hl_lava_deep')
    inner = [(-1.35, 0.0), (-1.35, 3.2), (-0.95, 3.8), (0.0, 4.15), (0.95, 3.8), (1.35, 3.2), (1.35, 0.0)]
    m.prism(inner, 0.95, 1.05, 'hl_lava')
    core = [(-0.55, 0.0), (-0.55, 1.9), (-0.3, 2.5), (0.0, 2.7), (0.3, 2.5), (0.55, 1.9), (0.55, 0.0)]
    m.prism(core, 0.9, 1.0, 'hl_lava_hot')
    flat(m, [(-1.65, 1.0), (-1.65, -0.5), (-1.2, -1.0), (0.0, -1.1), (1.2, -1.0), (1.65, -0.5), (1.65, 1.0)], 0.0, 0.04, 'hl_lava_deep')
    puddle(m, 0.0, -0.05, 1.4, 0.7, 61)
    # ---- the two towers
    for sx in (-1, 1):
        tw = Mesh('tower')
        tw.box(-1.15, 1.15, -1.0, 1.0, 0.0, 0.75, 'hl_slate', bevel=0.06)
        tw.box(-0.9, 0.9, -0.8, 0.8, 0.75, 5.6, 'hl_basalt', bevel=0.05)
        for z in (1.5, 3.0, 4.5):
            tw.box(-0.98, 0.98, -0.88, 0.88, z, z + 0.2, 'hl_iron', bevel=0.03)
            for k in (-1, 0, 1):
                tw.ball((k * 0.5, -0.9, z + 0.1), 0.05, 'hl_brass', seg=6, rings=4)
        tw.box(-1.2, 1.2, -1.05, 1.05, 5.6, 6.0, 'hl_slate', bevel=0.06)
        cone(tw, (0, 0, 6.0), (0, 0, 8.2), 0.7, 'hl_obs_hi', seg=4)
        for cx, cy in ((-1.0, -0.9), (1.0, -0.9), (-1.0, 0.9), (1.0, 0.9)):
            cone(tw, (cx, cy, 6.0), (cx, cy, 6.9), 0.2, 'hl_iron_dark', seg=4)
        # a carved demon face, burning
        tw.ball((0, -0.78, 3.65), (0.55, 0.15, 0.62), 'hl_basalt_hi', seg=14, rings=8)
        for ex in (-1, 1):
            tw.poly([(ex * 0.14, -0.94, 3.9), (ex * 0.42, -0.94, 4.02), (ex * 0.4, -0.94, 3.9), (ex * 0.16, -0.94, 3.78)], 'hl_eye')
        tw.box(-0.3, 0.3, -0.945, -0.9, 3.25, 3.55, 'hl_socket')
        for k in range(4):
            x = -0.22 + 0.147 * k
            cone(tw, (x, -0.95, 3.55), (x, -0.97, 3.36), 0.045, 'teeth', seg=4)
        # lava seams down the stone
        crack(tw, (sx * 0.55, -0.8, 5.4), (sx * 0.5, -0.8, 4.3), (0, -1, 0), w=0.07, rnd=random.Random(5 + sx), k=4, amp=0.07)
        crack(tw, (-sx * 0.55, -0.8, 2.9), (-sx * 0.5, -0.8, 1.6), (0, -1, 0), w=0.07, rnd=random.Random(8 + sx), k=4, amp=0.07)
        m.add(tw, trans(sx * TX, 0.0, 0.0))
        tw.free()
    # ---- the lintel: a thick beam, a row of teeth hanging down, a horned skull keystone
    m.box(-TX, TX, -0.8, 0.8, 4.6, 5.55, 'hl_basalt', bevel=0.05)
    m.box(-TX + 0.9, TX - 0.9, -0.9, 0.9, 5.55, 5.85, 'hl_slate', bevel=0.05)
    m.box(-1.8, 1.8, -0.88, -0.78, 4.6, 4.85, 'hl_iron', bevel=0.02)
    spike_row(m, -1.62, 1.62, -0.45, 4.62, 8, -0.95, 0.13, 'hl_iron')
    skull(m, (0.0, -0.95, 5.0), 0.62, tilt=0.45, glow=True, horns=1.5, mat='hl_bone')
    cone(m, (-1.5, -0.1, 5.85), (-1.5, -0.1, 6.5), 0.22, 'hl_obs_lo', seg=4)
    cone(m, (1.5, -0.1, 5.85), (1.5, -0.1, 6.5), 0.22, 'hl_obs_lo', seg=4)
    # ---- the spiked walls running out from each tower
    for sx in (-1, 1):
        x0, x1 = sx * (TX + 1.1), sx * (TX + 2.7)
        a, b = min(x0, x1), max(x0, x1)
        m.box(a, b, -0.4, 0.4, 0.0, 1.5, 'hl_basalt', bevel=0.05)
        m.box(a - 0.02, b + 0.02, -0.45, 0.45, 1.5, 1.7, 'hl_slate', bevel=0.04)
        spike_row(m, a + 0.1, b - 0.1, -0.2, 1.7, 5, 0.75, 0.1, 'hl_iron')
        skull(m, (sx * (TX + 1.7), -0.45, 1.05), 0.2, tilt=0.5, yaw=sx * 0.2)
        crack(m, (sx * (TX + 2.2), -0.4, 1.45), (sx * (TX + 2.15), -0.4, 0.4), (0, -1, 0), w=0.06, rnd=random.Random(3 + sx), k=4, amp=0.07)
    return m


def hell_wall():
    m = Mesh('hell_wall')
    m.box(-1.6, 1.6, -0.4, 0.4, 0.0, 1.45, 'hl_basalt', bevel=0.05)
    m.box(-1.64, 1.64, -0.45, 0.45, 1.45, 1.65, 'hl_slate', bevel=0.04)
    for z in (0.55,):
        m.box(-1.64, 1.64, -0.43, 0.43, z, z + 0.13, 'hl_iron', bevel=0.02)
    spike_row(m, -1.5, 1.5, -0.2, 1.65, 7, 0.8, 0.1, 'hl_iron')
    skull(m, (-0.55, -0.45, 1.0), 0.2, tilt=0.5, yaw=0.15)
    crack(m, (0.7, -0.4, 1.4), (0.74, -0.4, 0.1), (0, -1, 0), w=0.07, rnd=random.Random(2), k=5, amp=0.07)
    crack(m, (-1.1, -0.4, 1.35), (-1.12, -0.4, 0.45), (0, -1, 0), w=0.055, rnd=random.Random(3), k=4, amp=0.07, fork=False)
    # a crumbled corner
    tone_hull(m, blob_pts((1.8, -0.2, 0.3), (0.5, 0.4, 0.3), 401, n=12, jitter=0.2), BASALT3, bevel=0.02)
    return m


def meat_hook_rack():
    m = Mesh('meat_hook_rack')
    W = 1.9
    for sx in (-1, 1):
        m.box(sx * W - 0.14, sx * W + 0.14, -0.14, 0.14, 0.0, 3.1, 'hl_wood', bevel=0.03)
        m.box(sx * W - 0.3, sx * W + 0.3, -0.3, 0.3, 0.0, 0.25, 'hl_slate', bevel=0.04)
        m.cyl((sx * W, 0.0, 2.2), (sx * (W - 0.75), 0.0, 3.0), 0.07, 0.07, 'hl_wood', seg=6)           # brace
        cone(m, (sx * W, 0.0, 3.1), (sx * W, 0.0, 3.55), 0.14, 'hl_iron_dark', seg=4)
    m.box(-W - 0.2, W + 0.2, -0.1, 0.1, 2.85, 3.05, 'hl_iron', bevel=0.02)
    # hooks on chains, each with something heavy on it
    hooks = [(-1.2, 1.0, 'carcass'), (-0.35, 1.5, 'ribs'), (0.5, 0.9, 'meat'), (1.25, 1.7, 'empty')]
    for x, drop, what in hooks:
        zt = 2.85 - drop
        chain(m, [(x, 0.0, 2.85), (x, 0.0, zt + 0.2)], 0.1, 0.025)
        hook = [tuple(p) for p in arc_pts((x, 0.0, zt - 0.1), 0.17, PI * 0.5, PI * 2.1, (1, 0, 0), (0, 0, 1), 10)]
        m.tube([(x, 0.0, zt + 0.2)] + hook, 0.035, 'hl_iron_dark', seg=6)
        if what == 'carcass':
            m.ball((x, 0.0, zt - 0.55), (0.34, 0.26, 0.6), 'hl_meat', seg=12, rings=8)
            m.ball((x + 0.05, -0.12, zt - 0.4), (0.2, 0.12, 0.3), 'hl_fat', seg=10, rings=6)
            bone(m, (x - 0.1, -0.1, zt - 0.95), (x - 0.12, -0.1, zt - 1.25), 0.04)
            m.ball((x, -0.1, zt - 1.0), 0.1, 'hl_meat', seg=8, rings=5)
        elif what == 'ribs':
            for k in range(4):
                z = zt - 0.25 - 0.17 * k
                m.tube(arc_pts((x, 0.0, z), 0.3 - 0.03 * abs(k - 1), 0.1, PI - 0.1, (1, 0, 0), (0, -1, 0), 8), 0.032, 'hl_bone', seg=5)
            m.capsule((x, 0.04, zt - 0.2), (x, 0.04, zt - 0.95), 0.04, 0.04, 'hl_bone', seg=6)
        elif what == 'meat':
            m.ball((x, 0.0, zt - 0.38), (0.32, 0.26, 0.38), 'hl_meat', seg=12, rings=8)
            m.ball((x - 0.1, -0.12, zt - 0.3), (0.16, 0.12, 0.2), 'hl_fat', seg=10, rings=6)
        else:
            pass
    skull(m, (0.0, -0.2, 3.2), 0.28, tilt=0.5, glow=True)
    # a dark pool and splinters of bone at the foot
    flat(m, ragged(0.2, -0.55, 1.1, 0.4, 51), 0.0, 0.02, 'hl_coal')
    rnd = random.Random(52)
    for i in range(4):
        a = rnd.uniform(0, PI)
        cx, cy = rnd.uniform(-1.3, 1.3), rnd.uniform(-1.0, -0.4)
        bone(m, (cx - math.cos(a) * 0.25, cy - math.sin(a) * 0.1, 0.07), (cx + math.cos(a) * 0.25, cy + math.sin(a) * 0.1, 0.09), 0.04)
    return m


# ------------------------------------------------------------------------------------------------ frames

def build(ctx):
    for i in range(3):
        one(ctx, 'lava_rock_%d' % i, lambda i=i: lava_rock(i))
    for i in range(2):
        one(ctx, 'obsidian_spike_%d' % i, lambda i=i: obsidian_spike(i))
    one(ctx, 'demon_statue', demon_statue)
    for i in range(2):
        one(ctx, 'bone_pile_%d' % i, lambda i=i: bone_pile(i))
    one(ctx, 'cage', cage)
    one(ctx, 'brazier', brazier)
    one(ctx, 'chain_post', chain_post)
    one(ctx, 'skull_totem', skull_totem)
    for i in range(2):
        one(ctx, 'pillar_broken_%d' % i, lambda i=i: pillar_broken(i))
    one(ctx, 'ribcage', ribcage)
    one(ctx, 'hell_gate', hell_gate)
    one(ctx, 'hell_wall', hell_wall)
    one(ctx, 'meat_hook_rack', meat_hook_rack)
    # footprints (game units) of what stands in play, and where light and fire come from (screen offsets from the pivot)
    for name, r in (('lava_rock_0', 1.2), ('lava_rock_1', 1.5), ('lava_rock_2', 1.4), ('ribcage', 1.9), ('demon_statue', 1.2), ('cage', 1.0),
                    ('pillar_broken_0', 0.8), ('pillar_broken_1', 0.7), ('brazier', 0.7), ('skull_totem', 0.8), ('obsidian_spike_0', 1.0),
                    ('obsidian_spike_1', 0.9), ('chain_post', 0.5)):
        ctx.value('radius', name, round(r * U, 1))
    ctx.anchor('flame', 'brazier', (0.0, 0.0, 1.62))
    ctx.anchor('glow', 'brazier', (0.0, 0.0, 1.5))
    ctx.anchor('glow', 'hell_gate', (0.0, 1.0, 2.2))
    ctx.anchor('glow', 'demon_statue', (0.0, -1.0, 2.82))
    ctx.anchor('glow', 'lava_rock_0', (0.0, 0.0, 0.6))
    ctx.anchor('glow', 'lava_rock_1', (0.0, 0.0, 0.3))
    ctx.anchor('glow', 'lava_rock_2', (0.0, 0.0, 0.5))
    ctx.anchor('glow', 'ribcage', (0.0, 0.0, 0.3))
