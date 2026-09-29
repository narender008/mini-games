"""Forest props: rope-bridge, log, mushroom (Blender, headless; see props.py)."""
import math
from math import pi, sin, cos, atan2, sqrt, exp, radians
from mathutils import Vector, Matrix
import bmesh
from mathutils.bvhtree import BVHTree
import lib
import plib
from plib import add, srgb, mixc, scale_c, paint, fn_hash, lerp, smooth, assemble


def mushroom_one(R, H, stem_r, stem_h, bend=0.0, seed=0, spots=13):
    """One red toadstool built upright at the origin: a glossy cap (0) with white spots (3), a cream stem (1) and gills (2)."""
    CAP, STEM, GILL, SPOT = 0, 1, 2, 3
    bm = lib.bm_new()
    # stem: a soft bulb at the foot, slimming up, flaring under the cap
    sp = [(0.0, 0.0), (0.0, stem_r * 1.15), (stem_h * 0.10, stem_r * 1.28), (stem_h * 0.35, stem_r * 1.0), (stem_h * 0.75, stem_r * 0.86), (stem_h + 1.5, stem_r * 1.05)]
    prof = lib.fillet_path(sp, [0, 2.2, 3.0, 4.0, 4.0, 0], 4)
    st = lib.lathe(prof, 28, (0, 0, 0), (0, 0, 1), STEM, up=(1, 0, 0))
    add(bm, st)
    # the cap: a fat dome with a rolled lip, its underside a shallow dish of gills
    z0 = stem_h - 1.0
    n = 16
    dome = [(H * cos((pi / 2) * k / n), R * sin((pi / 2) * k / n)) for k in range(n + 1)]  # pole (H, 0) down to the rim (0, R)
    cap = lib.lathe(dome + [(-1.8, R * 0.99), (-2.6, R * 0.9)], 32, (0, 0, z0), (0, 0, 1), CAP, up=(1, 0, 0))
    add(bm, cap)
    gill_prof = [(-2.6, R * 0.86), (-1.6, R * 0.55), (0.6, stem_r * 1.4), (1.6, stem_r * 1.1)]
    gills = lib.lathe(gill_prof, 40, (0, 0, z0), (0, 0, 1), GILL, up=(1, 0, 0))
    add(bm, gills)
    # a frilly ring on the stem
    ring = lib.lathe([(stem_h * 0.82, stem_r * 0.9), (stem_h * 0.80, stem_r * 1.5), (stem_h * 0.72, stem_r * 1.85), (stem_h * 0.68, stem_r * 1.3), (stem_h * 0.72, stem_r * 0.9)], 28, (0, 0, 0), (0, 0, 1), GILL, up=(1, 0, 0))
    add(bm, ring)
    if spots:
        rnd = [fn_hash(seed, i, 3.1) for i in range(40)]
        spec = [(0, 0, 5.0), (30, 20, 3.9), (32, 140, 3.4), (30, 260, 4.0), (55, 60, 4.2), (56, 120, 3.0), (54, 185, 4.4), (57, 250, 3.3), (55, 315, 4.0), (72, 10, 3.0), (73, 95, 2.4), (72, 205, 2.8), (74, 300, 2.6)]
        for i, (col, lon, rr) in enumerate(spec[:spots]):
            rr = rr * (R / 21.0)
            lon += (rnd[i] - 0.5) * 20
            col += (rnd[i + 13] - 0.5) * 8
            # a point on the dome: pole at (0, 0, H)
            c = radians(col)
            d = radians(lon)
            px = R * sin(c) * cos(d)
            py = R * sin(c) * sin(d)
            pz = H * cos(c)
            nrm = Vector((H * sin(c) * cos(d), H * sin(c) * sin(d), R * cos(c))).normalized()
            if col == 0:
                nrm = Vector((0, 0, 1))
            s = lib.ellipsoid(rr, rr, rr * 0.30, (0, 0, 0), 12, 6, SPOT)
            xa = nrm.cross(Vector((0, 0, 1)))
            if xa.length < 1e-3:
                xa = Vector((1, 0, 0))
            xa.normalize()
            ya = nrm.cross(xa).normalized()
            lib.orient(s, xa, ya, nrm, (px, py, z0 + pz - rr * 0.12))
            add(bm, s)
    if bend:  # the stem leans and the cap follows it
        dx = bend * stem_h * 0.3
        for v in bm.verts:
            v.co.x += dx * min(1.0, max(0.0, v.co.z / stem_h)) ** 2
    return bm


def mushroom():
    mats = [
        plib.make_mat('cap', 0xd8261c, rough=0.26, coat=0.9, coat_rough=0.06, sheen=0.0),
        plib.make_mat('stem', 0xf1e6cf, rough=0.62, coat=0.0, sheen=0.5, sheen_rough=0.6),
        plib.make_mat('gills', 0xe6d3ae, rough=0.7),
        plib.make_mat('spot', 0xfbf7ec, rough=0.5, coat=0.4, coat_rough=0.15),
    ]
    body = lib.bm_new()
    big = mushroom_one(21.5, 17.0, 6.4, 22.0, bend=0.35, seed=1)
    add(body, big)
    small = mushroom_one(11.0, 9.0, 3.4, 12.0, bend=-0.4, seed=2, spots=7)
    m = Matrix.Translation((33.0, -9.0, -0.5)) @ Matrix.Rotation(radians(12), 4, 'X') @ Matrix.Rotation(radians(-8), 4, 'Y')
    lib.xform(small, m)
    add(body, small)
    third = mushroom_one(8.0, 6.5, 2.6, 8.0, bend=0.2, seed=3, spots=5)
    lib.xform(third, Matrix.Translation((-24.0, 6.0, -0.5)) @ Matrix.Rotation(radians(-16), 4, 'Y'))
    add(body, third)

    def col(co, n, mi):
        if mi == 0:  # the cap: brighter on top, a shade deeper towards the lip
            k = 0.72 + 0.28 * smooth(n.z * 1.3)
            return (k, k * 0.92, k * 0.92)
        if mi == 1:  # the stem: a little earthy at the foot
            t = smooth(1.0 - co.z / 9.0)
            return mixc((1, 1, 1), (0.62, 0.55, 0.42), t)
        return (1.0, 1.0, 1.0)
    paint(body, col)
    return assemble('mushroom', {'body': body}, mats)





# ============================================================================================ rope bridge

def rope_bridge():
    """A toy rope bridge along x: 1 m between the post pairs at x = -500 and +500. Nodes: deck (planks, ropes), posts_L, posts_R (each with
    its own origin at the post pair, so the game can move them apart and scale the deck to fit a gorge of another width)."""
    WOOD, ROPE = 0, 1
    mats = [plib.make_mat('wood', 0x8a6a48, rough=0.85, spec=0.3), plib.make_mat('rope', 0xc9b48a, rough=0.95, spec=0.2)]
    HALF = 470.0
    Z_END, SAG = 74.0, 36.0

    def zd(x):
        return Z_END - SAG * (1.0 - (x / HALF) ** 2)
    deck = lib.bm_new()
    n = 37
    step = (2 * HALF - 22.0) / (n - 1)
    xs = [-HALF + 11.0 + step * i for i in range(n)]
    for i, x in enumerate(xs):
        p = lib.box(22.0, 132.0, 9.0, (0, 0, 0), mat=WOOD, bevel=1.5, seg=1, angle=35.0)
        plib.uv_wood(p, 200.0, grain=1, seed=100 + i, slot=(i * 5 + 2) % 9)
        slope = 2.0 * SAG * x / HALF ** 2
        j = fn_hash(i, 3.0) - 0.5
        lib.xform(p, Matrix.Translation((x, j * 2.4, zd(x) + (fn_hash(i, 8.0) - 0.5) * 1.2)) @ Matrix.Rotation(-math.atan(slope), 4, 'Y')
                  @ Matrix.Rotation((fn_hash(i, 5.0) - 0.5) * radians(2.2), 4, 'X') @ Matrix.Rotation(j * radians(1.6), 4, 'Z'))
        plib.merge(deck, p)
    # ropes: two under the deck, two hand-rails, and a tie every fourth plank
    def rope_along(y, dz, x0, x1, r, sides=8, seg=14.0):
        m = max(2, int((x1 - x0) / seg))
        path = [(x0 + (x1 - x0) * k / m, y, zd(x0 + (x1 - x0) * k / m) + dz) for k in range(m + 1)]
        return plib.tube(path, r, sides, ROPE, caps=True, rope_uv=(3, 1.0))
    for sy in (-1, 1):
        plib.merge(deck, rope_along(sy * 56.0, -8.0, -486.0, 486.0, 4.8, 10))
        plib.merge(deck, rope_along(sy * 82.0, 96.0, -486.0, 486.0, 4.8, 10))
        for i in range(2, n, 4):
            x = xs[i]
            a = (x, sy * 62.0, zd(x) + 4.0)
            b = (x, sy * 82.0, zd(x) + 94.0)
            mid = (x, sy * 72.0 + 1.5 * sy, zd(x) + 50.0)
            plib.merge(deck, plib.tube([a, mid, b], 2.6, 7, ROPE, caps=True, rope_uv=(3, 1.0)))
            plib.merge(deck, lib.ellipsoid(4.6, 4.6, 4.0, (x, sy * 82.0, zd(x) + 95.0), 8, 5, ROPE))

    def posts(sx):
        g = lib.bm_new()
        for k, y in enumerate((-82.0, 82.0)):
            post = lib.box(28.0, 28.0, 252.0, (sx * 500.0, y, 126.0), mat=WOOD, bevel=3.4, seg=2, angle=30.0)
            plib.uv_wood(post, 350.0, grain=2, seed=200 + k + (3 if sx > 0 else 0))
            plib.merge(g, post)
            br = plib.tube_rect([(sx * 506.0, y, 154.0), (sx * 578.0, y, 8.0)], 20.0, 18.0, WOOD, bevel=2.2, up=(0, 1, 0))
            plib.uv_wood(br, 350.0, grain=2, seed=210 + k + (3 if sx > 0 else 0))
            plib.merge(g, br)
        for zc, hh, seed in ((224.0, 24.0, 230), (50.0, 20.0, 231)):
            cb = lib.box(26.0, 196.0, hh, (sx * 500.0, 0, zc), mat=WOOD, bevel=2.6, seg=2, angle=30.0)
            plib.uv_wood(cb, 350.0, grain=1, seed=seed + (5 if sx > 0 else 0))
            plib.merge(g, cb)
        return g
    pl, pr = posts(-1), posts(1)

    def col(co, n, mi):
        if mi == ROPE:
            k = 0.82 + 0.18 * (0.5 + 0.5 * plib.noise.noise(Vector((co.x, co.y, co.z)) / 18.0))
            return (k, k * 0.98, k * 0.94)
        tone = 0.68 + 0.3 * fn_hash(round(co.x / 24.0), round(co.y / 40.0), 4.0)
        k = tone * (0.78 + 0.22 * smooth(co.z / 90.0))
        c = mixc((1.0, 1.0, 1.0), (0.78, 0.92, 0.62), (1.0 - smooth(co.z / 70.0)) * 0.6) if abs(co.x) > 480 else (1.0, 1.0, 1.0)
        return (k * c[0], k * c[1], k * c[2])
    for g in (deck, pl, pr):
        paint(g, col)
    return assemble('rope-bridge', {'deck': deck, 'posts_L': pl, 'posts_R': pr}, mats, uv=('deck', 'posts_L', 'posts_R'),
                    origins={'posts_L': (-500.0, 0, 0), 'posts_R': (500.0, 0, 0)})


# ============================================================================================ log

def log():
    BARK, CUT, MOSS = 0, 1, 2
    mats = [plib.make_mat('bark', 0x5a4030, rough=0.95, spec=0.2), plib.make_mat('cut', 0xe6c48c, rough=0.8, spec=0.3),
            plib.make_mat('moss', 0x5b8a25, rough=1.0, spec=0.1)]
    L, R0 = 400.0, 55.0
    zc = R0 * 0.94 - 7.0
    n = 42
    path = [(-L / 2 + L * k / n, 7.0 * sin(2 * pi * 0.8 * k / n + 0.4), zc + 3.0 * sin(5.5 * k / n)) for k in range(n + 1)]

    def rad(s, th):
        furrow = 1.0 + 0.05 * cos(9 * th + 2.2 * sin(s * 7.0)) + 0.028 * cos(16 * th - 15.0 * s)
        knot = 1.0 + 0.07 * exp(-((s - 0.32) / 0.045) ** 2) * max(0.0, cos(th - 1.1))
        return R0 * (1.0 + 0.06 * (s - 0.5)) * furrow * knot * (1.0 + 0.05 * cos(2 * th))
    bm = plib.tube(path, rad, sides=28, mat=BARK, caps='rings', cap_mat=CUT, cap_rings_n=7)
    bark_only = lib.bm_new()
    plib.uv_cyl(bm, 550.0, axis=0, center=(0.0, zc), off=(0.2, 0.55))
    tree = BVHTree.FromBMesh(bm)
    # a broken-off branch stub on the front, sawn flat at the end
    def hit(x, y0, z, d):
        loc, nrm, _, _ = tree.ray_cast(Vector((x, y0, z)), Vector(d))
        return loc, nrm
    loc, nrm = hit(-70.0, -300.0, zc + 12.0, (0, 1, 0))
    dvec = Vector((0.0, -1.0, 0.72)).normalized()
    st = lib.cylinder(loc - dvec * 12.0, loc + dvec * 44.0, 14.0, 10.6, 18, BARK)
    plib.uv_cyl(st, 550.0, axis=2, off=(0.6, 0.1))
    plib.merge(bm, st)
    endc = lib.cylinder(loc + dvec * 43.6, loc + dvec * 44.6, 10.0, 10.0, 18, CUT)
    plib.merge(bm, endc)
    # moss cushions on the top and down the sunny side
    spots = [(-160.0, 4.0, 30.0, 26.0, 14.0), (-112.0, -6.0, 30.0, 22.0, 12.0), (-60.0, 10.0, 34.0, 26.0, 15.0), (-8.0, -8.0, 30.0, 24.0, 13.0),
             (44.0, 8.0, 36.0, 27.0, 15.0), (100.0, -4.0, 32.0, 25.0, 13.0), (150.0, 8.0, 30.0, 24.0, 12.0),
             (-30.0, -46.0, 26.0, 16.0, 10.0), (70.0, -44.0, 22.0, 14.0, 9.0), (-120.0, -44.0, 20.0, 14.0, 9.0)]
    for i, (x, y, rx, ry, rz) in enumerate(spots):
        top = ray_top = None
        loc2, nrm2, _, _ = tree.ray_cast(Vector((x, y, 400.0)), Vector((0, 0, -1)))
        if loc2 is None:
            continue
        cushion = lib.ellipsoid(rx, ry, rz, (0, 0, 0), 18, 9, MOSS)
        nn = nrm2.normalized()
        xa = Vector((1, 0, 0)) - nn * nn.x
        xa = xa.normalized()
        ya = nn.cross(xa).normalized()
        lib.orient(cushion, xa, ya, nn, loc2 - nn * rz * 0.16)
        plib.subdiv_to(cushion, 8.0)
        plib.displace(cushion, 1.7, 7.5, seed=20 + i, octaves=2)
        plib.uv_box(cushion, 300.0, off=(0.05 * i, 0.11 * i))
        plib.merge(bm, cushion)

    def col(co, n, mi):
        if mi == CUT:
            rr = math.hypot(co.y - path[len(path) // 2][1], co.z - zc) / R0
            if rr > 1.06:
                return (0.9, 0.85, 0.75)
            ring = 0.82 + 0.18 * sin(rr * 46.0 + 0.8 * plib.noise.noise(Vector((co.y, co.z, 1.0)) / 8.0))
            k = ring * (0.55 if rr > 0.9 else 1.0) * (0.9 + 0.1 * (1.0 - rr))
            return (k, k * 0.93, k * 0.85)
        if mi == MOSS:
            k = 0.55 + 0.30 * smooth((co.z - 40.0) / 50.0)
            k *= 0.9 + 0.1 * plib.noise.noise(Vector((co.x, co.y, co.z)) / 5.0)
            return (k * 0.9, k, k * 0.85)
        k = 0.5 + 0.5 * smooth(0.55 + 0.6 * n.z)
        k *= 0.88 + 0.12 * plib.noise.noise(Vector((co.x, co.y, co.z)) / 12.0)
        c = mixc((1.0, 1.0, 1.0), (0.66, 0.85, 0.5), (1.0 - smooth(co.z / 34.0)) * 0.6)   # green damp where it meets the ground
        k *= 0.82                                # keep the orange plates of the bark photograph calm
        return (k * c[0] * 0.78, k * c[1] * 0.92, k * c[2] * 1.0)
    paint(bm, col)
    return assemble('log', {'body': bm}, mats, uv=('body',), sharp=60.0)


BUILDERS = {'rope-bridge': rope_bridge, 'log': log, 'mushroom': mushroom}
