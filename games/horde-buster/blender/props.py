"""Props and side scenery for the city road (Lane C): barrels and chests, wrecked vehicles, street furniture, trees, rubble, buildings.

Everything stands on the XY plane with its base centre at the world origin (the pivot), faces -Y (toward the camera) and is built
from `Mesh` primitives. Materials are keyed `pr_*` (defined below) so a later chapter can restyle by swapping a few colours.
Shared helpers (`rock`, `facets`, `wrap_decal`, `one` ...) live at the top because pickups.py and gibs.py import them.

Frames (48 px/m, pivot = base centre): barrel, barrel_lid, barrel_shard_0..2, fire_barrel, chest_closed, chest_open, car_0..2,
police_car, bus, barrier, sawhorse, cone, tree_0..2, bush_0..1, lamp_post, hydrant, dumpster, bench, bus_stop, tyre, rubble_0..2,
sandbags, crate, trash_bags, fence, building_0..3.
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale

PI = math.pi


# ------------------------------------------------------------------------------------------------ materials

def _materials():
    d = mats.define
    # metals and paint
    d('pr_steel', base='#b9c2cf', base2='#8d98a8', pattern='noise', pscale=6, pamt=0.5, bevel=0.012, bump=0.15, seed=51)
    d('pr_steel_dark', base='#4b5362', base2='#363c49', pattern='noise', pscale=7, pamt=0.5, bevel=0.012, seed=52)
    d('pr_iron', base='#2f333d', bevel=0.012)
    d('pr_rust', base='#a8532d', base2='#6e3a22', pattern='noise', pscale=9, pamt=0.7, bump=0.5, seed=53)
    d('pr_flame_black', base='#241a1a', bevel=0.004)
    d('pr_flame_orange', base='#ff7a1c', emit=0.0, bevel=0.004)
    d('pr_barrel_lid', base='#b92019', base2='#8f1712', pattern='noise', pscale=5, pamt=0.5, bevel=0.012, seed=54)
    d('pr_drum_blue', base='#3b6ea8', base2='#264b78', pattern='noise', pscale=4, pamt=0.6, bevel=0.015, bump=0.2, seed=55)
    d('pr_coal', base='#ff8a1c', base2='#ffd23a', pattern='noise', pscale=14, pamt=0.7, emit=1.0, seed=56)
    d('pr_char', base='#2a2623', base2='#4a3f38', pattern='noise', pscale=8, pamt=0.7, bump=0.5, seed=57)
    # chest
    d('pr_chest_wood', base='#a8602a', base2='#7a421c', pattern='stripes', pscale=7, pamt=0.55, bevel=0.015, bump=0.2, seed=58)
    d('pr_chest_gold', base='#ffc93a', base2='#fff0a0', pattern='fade', z0=0.0, z1=0.9, pamt=0.5, bevel=0.012)
    d('pr_gold_glow', base='#ffc828', base2='#fff0a0', pattern='noise', pscale=16, pamt=0.7, emit=1.0, bevel=0.01, seed=59)
    d('pr_velvet', base='#b3243a', base2='#7d1426', pattern='noise', pscale=9, pamt=0.6, bump=0.3, seed=60)
    d('pr_gem_green', base='#3cff9c', emit=0.9, bevel=0.004)
    d('pr_gem_pink', base='#ff5fb8', emit=0.9, bevel=0.004)
    d('pr_gem_blue', base='#5fa8ff', emit=0.9, bevel=0.004)
    # vehicles
    d('pr_car_blue', base='#2f84ee', base2='#2062c4', pattern='noise', pscale=2.2, pamt=0.35, bevel=0.03, bump=0.15, shade=0.3, seed=61)
    d('pr_car_red', base='#ec3a2e', base2='#bb2218', pattern='noise', pscale=2.2, pamt=0.35, bevel=0.03, bump=0.15, shade=0.3, seed=62)
    d('pr_car_char', base='#35323a', base2='#4f3a33', pattern='noise', pscale=2.5, pamt=0.55, bevel=0.03, bump=0.3, seed=63)
    d('pr_car_scorch', base='#232126', base2='#3b2f2e', pattern='noise', pscale=2.5, pamt=0.55, bevel=0.03, bump=0.25, seed=64)
    d('pr_underbody', base='#454d5e', base2='#2e3441', pattern='noise', pscale=3, pamt=0.5, bevel=0.03, bump=0.2, seed=69)
    d('pr_glass', base='#9bdcf6', base2='#6fb4dc', pattern='fade', z0=0.5, z1=1.5, pamt=0.8, bevel=0.01)
    d('pr_glass_dark', base='#1b3552', bevel=0.01)
    d('pr_glass_hole', base='#101c2a', bevel=0.004)
    d('pr_interior', base='#2c3447', bevel=0.01)
    d('pr_seat', base='#69759a', base2='#4a5473', pattern='noise', pscale=8, pamt=0.5, bump=0.3, bevel=0.03, seed=66)
    d('pr_engine', base='#35415a', base2='#222b3d', pattern='noise', pscale=8, pamt=0.5, bevel=0.02, seed=67)
    d('pr_crack', base='#eef8ff', bevel=0.003)
    d('pr_tyre', base='#202127', base2='#32343c', pattern='noise', pscale=8, pamt=0.5, bevel=0.02, seed=65)
    d('pr_rim', base='#cdd5df', bevel=0.01)
    d('pr_headlight', base='#fff0b0', emit=1.0, bevel=0.005)
    d('pr_headlight_off', base='#cfd6dc', bevel=0.005)
    d('pr_taillight', base='#ff2a2a', emit=0.7, bevel=0.005)
    d('pr_bus_yellow', base='#ffc81c', base2='#eaa812', pattern='noise', pscale=2.0, pamt=0.3, bevel=0.03, bump=0.12, shade=0.25, seed=66)
    d('pr_bus_dark', base='#d79a0e', bevel=0.012)
    d('pr_bus_stripe', base='#1c1d22', bevel=0.012)
    d('pr_police_white', base='#f2f4f8', base2='#c8ced8', pattern='noise', pscale=3.5, pamt=0.4, bevel=0.03, seed=67)
    d('pr_police_black', base='#262932', base2='#171920', pattern='noise', pscale=3.5, pamt=0.4, bevel=0.03, seed=68)
    d('pr_light_red', base='#ff3a3a', emit=1.0, bevel=0.01)
    d('pr_light_blue', base='#3a86ff', emit=1.0, bevel=0.01)
    d('pr_light_amber', base='#ffb01a', emit=1.0, bevel=0.01)
    # street furniture
    d('pr_concrete', base='#c3beb4', base2='#928d83', pattern='noise', pscale=5, pamt=0.55, bevel=0.02, bump=0.35, seed=71)
    d('pr_concrete_hi', base='#d3cec3', base2='#b5b0a5', pattern='noise', pscale=5, pamt=0.4, bevel=0.02, bump=0.3, seed=74)
    d('pr_concrete_lo', base='#8b867d', base2='#6a665e', pattern='noise', pscale=5, pamt=0.4, bevel=0.02, bump=0.3, seed=75)
    d('pr_concrete_red', base='#e3392c', base2='#b02317', pattern='noise', pscale=6, pamt=0.45, bevel=0.02, bump=0.3, seed=72)
    d('pr_concrete_white', base='#f3efe6', base2='#c9c3b6', pattern='noise', pscale=6, pamt=0.5, bevel=0.02, bump=0.3, seed=73)
    d('pr_orange', base='#ff7418', base2='#e0550e', pattern='noise', pscale=6, pamt=0.4, bevel=0.015, seed=74)
    d('pr_white', base='#f6f6f2', bevel=0.012)
    d('pr_hydrant', base='#e5281d', base2='#b01a12', pattern='noise', pscale=5, pamt=0.45, bevel=0.02, seed=75)
    d('pr_lamp_pole', base='#3e5068', base2='#2a374a', pattern='noise', pscale=5, pamt=0.4, bevel=0.015, seed=76)
    d('pr_lamp_glass', base='#fff4b8', emit=1.0, bevel=0.01)
    d('pr_dumpster', base='#2f9e5a', base2='#1f7340', pattern='noise', pscale=3.0, pamt=0.55, bevel=0.02, bump=0.3, seed=77)
    d('pr_plastic_black', base='#2a2d36', base2='#3a3e4a', pattern='noise', pscale=6, pamt=0.5, bevel=0.02, seed=78)
    d('pr_bench_wood', base='#b8793a', base2='#8b5726', pattern='stripes', pscale=14, pamt=0.5, bevel=0.012, seed=79)
    d('pr_crate_wood', base='#d49a55', base2='#a8723a', pattern='stripes', pscale=10, pamt=0.5, bevel=0.012, bump=0.2, seed=80)
    d('pr_crate_wood2', base='#c28a48', base2='#9a6630', pattern='stripes', pscale=10, pamt=0.5, bevel=0.012, bump=0.2, seed=89)
    d('pr_crate_dark', base='#8a5a2c', base2='#6a4220', pattern='noise', pscale=8, pamt=0.5, bevel=0.012, seed=81)
    d('pr_sand', base='#dcc17c', base2='#b79a52', pattern='noise', pscale=7, pamt=0.6, bevel=0.03, bump=0.6, bscale=60, seed=82)
    d('pr_sand_lo', base='#c4a55c', base2='#a28640', pattern='noise', pscale=7, pamt=0.6, bevel=0.03, bump=0.6, bscale=60, seed=84)
    d('pr_sand_seam', base='#8a6e34', bevel=0.004)
    d('pr_trash_black', base='#343846', base2='#222530', pattern='noise', pscale=5, pamt=0.5, bevel=0.03, seed=83)
    d('pr_trash_green', base='#3c8b52', base2='#2a6a3b', pattern='noise', pscale=5, pamt=0.5, bevel=0.03, seed=84)
    d('pr_trash_white', base='#dfe3ea', base2='#b8bfca', pattern='noise', pscale=5, pamt=0.5, bevel=0.03, seed=85)
    d('pr_picket', base='#e9dfc9', base2='#b9ab8c', pattern='noise', pscale=6, pamt=0.55, bevel=0.01, bump=0.3, seed=86)
    d('pr_picket_dark', base='#7a5430', base2='#58391e', pattern='noise', pscale=6, pamt=0.55, bevel=0.01, bump=0.3, seed=87)
    d('pr_brick_chunk', base='#b9482f', base2='#8a3220', pattern='noise', pscale=8, pamt=0.5, bevel=0.015, bump=0.3, seed=88)
    d('pr_rebar', base='#b4562c', bevel=0.006)
    d('pr_trunk', base='#865229', base2='#5d3718', pattern='noise', pscale=9, pamt=0.6, bevel=0.02, bump=0.5, seed=90)
    d('pr_pot', base='#c8683a', bevel=0.015)
    d('pr_dirt', base='#6a4a30', base2='#4a3320', pattern='noise', pscale=8, pamt=0.5, seed=91)
    d('pr_ad_panel', base='#bfeaff', emit=0.8, bevel=0.01)
    d('pr_ad_panel2', base='#ffd0e8', emit=0.8, bevel=0.01)
    d('pr_sign_blue', base='#2a6fd8', bevel=0.01)


_materials()


def define_leaf(key, base, top, z0, z1, seed=0):
    """Foliage that brightens toward the crown (a painted sunlit top): z0..z1 are world heights in metres."""
    mats.define(key, base=base, base2=top, pattern='fade', z0=z0, z1=z1, pamt=0.9, bevel=0.05, bump=0.45, bscale=22, seed=seed)


# ------------------------------------------------------------------------------------------------ shared helpers

def one(ctx, name, fn, **kw):
    """Build and render a frame only when it is wanted (the frame filter skips the Python work as well)."""
    if ctx.want(name):
        ctx.one(name, fn(), **kw)


def rock(m, c, radii, mat, seed=0, n=10, mx=None, bevel=0.01, jitter=0.25):
    """A chunky faceted lump: the convex hull of jittered points on an ellipsoid (rubble, stones, meat)."""
    r = random.Random(seed)
    tb = bmesh.new()
    vs = []
    while len(vs) < n:
        v = Vector((r.gauss(0, 1), r.gauss(0, 1), r.gauss(0, 1)))
        if v.length < 0.2:
            continue
        v.normalize()
        v *= 1 + r.uniform(-jitter, jitter)
        vs.append(tb.verts.new((c[0] + v.x * radii[0], c[1] + v.y * radii[1], c[2] + v.z * radii[2])))
    bmesh.ops.convex_hull(tb, input=vs, use_existing_faces=False)
    for g in tb.verts[:]:
        if not g.link_faces:
            tb.verts.remove(g)
    m.commit(tb, mat, 0.0, mx, bevel)


def shaded_rock(m, c, radii, mats3, seed=0, n=10, mx=None, bevel=0.0, jitter=0.25, light=(-0.4, -0.6, 0.7)):
    """Like `rock`, but each facet takes one of three baked tones (light, mid, dark) by how it faces the light: crystals and ice."""
    r = random.Random(seed)
    tb = bmesh.new()
    vs = []
    while len(vs) < n:
        v = Vector((r.gauss(0, 1), r.gauss(0, 1), r.gauss(0, 1)))
        if v.length < 0.2:
            continue
        v.normalize()
        v *= 1 + r.uniform(-jitter, jitter)
        vs.append(tb.verts.new((c[0] + v.x * radii[0], c[1] + v.y * radii[1], c[2] + v.z * radii[2])))
    bmesh.ops.convex_hull(tb, input=vs, use_existing_faces=False)
    for g in tb.verts[:]:
        if not g.link_faces:
            tb.verts.remove(g)
    bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
    L = Vector(light).normalized()
    groups = ([], [], [])
    for f in tb.faces:
        d = f.normal.dot(L)
        groups[0 if d > 0.35 else (1 if d > -0.2 else 2)].append([tuple(v.co) for v in f.verts])
    tb.free()
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


def planes_yz(pts):
    """Outward half-space planes of a convex CCW polygon in the (y, z) plane (y right, z up), extruded along X."""
    out = []
    n = len(pts)
    for i in range(n):
        y0, z0 = pts[i]
        y1, z1 = pts[(i + 1) % n]
        dy, dz = y1 - y0, z1 - z0
        L = math.hypot(dy, dz)
        ny, nz = dz / L, -dy / L
        out.append(((0.0, ny, nz), ny * y0 + nz * z0))
    return out


def wrap_decal(m, outline, R, mat, ang=0.0, lift=0.004, mx=None, cuts=3):
    """A flat outline [(s, z), ...] (metres along the surface, height) wrapped onto a cylinder of radius R about local +Z,
    centred on the angle `ang` (0 faces -Y, the camera). Used for labels and symbols painted on drums."""
    tb = bmesh.new()
    vs = [tb.verts.new((s, 0.0, z)) for s, z in outline]
    f = tb.faces.new(vs)
    bmesh.ops.triangulate(tb, faces=[f])
    bmesh.ops.subdivide_edges(tb, edges=tb.edges[:], cuts=cuts, use_grid_fill=True)
    for v in tb.verts:
        a = ang + v.co.x / R
        v.co = Vector(((R + lift) * math.sin(a), -(R + lift) * math.cos(a), v.co.z))
    m.commit(tb, mat, 40.0, mx)


def clip_poly_x(pts, x0, x1):
    """Sutherland-Hodgman clip of a 2D polygon [(x, z), ...] to x0 <= x <= x1."""
    def clip(poly, inside, cut):
        out = []
        for i, p in enumerate(poly):
            q = poly[(i + 1) % len(poly)]
            pi, qi = inside(p), inside(q)
            if pi:
                out.append(p)
            if pi != qi:
                out.append(cut(p, q))
        return out
    poly = clip(pts, lambda p: p[0] >= x0, lambda p, q: (x0, p[1] + (q[1] - p[1]) * (x0 - p[0]) / (q[0] - p[0])))
    if poly:
        poly = clip(poly, lambda p: p[0] <= x1, lambda p, q: (x1, p[1] + (q[1] - p[1]) * (x1 - p[0]) / (q[0] - p[0])))
    return poly


def stripe_board(m, x0, x1, z0, z1, y0, y1, n, mat_a, mat_b, slant=0.35, mx=None, bevel=0.006):
    """A flat board (x0..x1, z0..z1, thickness y0..y1) in mat_b with n diagonal stripes of mat_a across its front (-Y) face."""
    m.box(x0, x1, y0, y1, z0, z1, mat_b, mx=mx, bevel=bevel)
    w = (x1 - x0) / n
    h = z1 - z0
    sl = slant * h
    for i in range(n):
        xs = x0 - sl + i * 2 * w + w * 0.5
        poly = clip_poly_x([(xs, z0), (xs + w, z0), (xs + w + sl, z1), (xs + sl, z1)], x0, x1)
        if len(poly) >= 3:
            m.prism(poly, y0 - 0.004, y0 + 0.002 + (y1 - y0) * 0.1, mat_a, mx=mx)


def panel(m, pts, mat, inset=0.88, push=0.012, mx=None, around=None):
    """A flat polygon shrunk about its centroid and pushed out along its normal (a window pane on a car body, a label).
    `around` is a point inside the solid: the normal is flipped to face away from it."""
    P = [Vector(p) for p in pts]
    c = sum(P, Vector()) / len(P)
    n = Vector()
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
    n.normalize()
    if around is not None and n.dot(c - Vector(around)) < 0:
        n = -n
    q = [c + (p - c) * inset + n * push for p in P]
    m.poly([tuple(p) for p in q], mat, mx=mx)
    return n


def subdivide(m, cuts=2):
    """Grid-subdivide every face of a mesh so a later `warp` can dent it (crumpled bonnets and roofs)."""
    bmesh.ops.subdivide_edges(m.bm, edges=m.bm.edges[:], cuts=cuts, use_grid_fill=True)


def jag(a, b, n, amp, seed=0):
    """Jagged points from a to b (2D), used for torn metal and broken edges."""
    r = random.Random(seed)
    pts = []
    for i in range(n + 1):
        t = i / n
        p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        if 0 < i < n:
            k = amp * r.uniform(0.4, 1.0) * (1 if i % 2 else -1)
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy) or 1.0
            p = (p[0] - dy / L * k, p[1] + dx / L * k)
        pts.append(p)
    return pts


# ------------------------------------------------------------------------------------------------ barrels and drums

BR = 0.42      # explosive barrel radius
BH = 1.05      # and height


def barrel_body(m, R=BR, H=BH, mat_body='barrel_red', band=True):
    m.lathe([(0.02, 0.0), (0.02, R * 0.88), (0.05, R * 0.96), (0.1, R), (H - 0.1, R), (H - 0.05, R * 0.96), (H - 0.02, R * 0.88)],
            mat_body, seg=28, smooth=60.0, cap=False)
    for z in (0.26, 0.78):                                      # rolled hoops
        m.lathe([(z - 0.045, R), (z - 0.02, R * 1.045), (z + 0.02, R * 1.045), (z + 0.045, R)], mat_body, seg=28, smooth=50.0, cap=False)
    # bottom and top rims
    m.lathe([(0.0, R * 0.9), (0.0, R * 1.02), (0.07, R * 1.02), (0.07, R * 0.97)], 'barrel_band', seg=28, smooth=40.0, cap=False)
    m.lathe([(H - 0.1, R * 0.98), (H - 0.03, R * 1.04), (H + 0.03, R * 1.04), (H + 0.03, R * 0.86), (H - 0.02, R * 0.86)],
            'barrel_band', seg=28, smooth=40.0, cap=False)
    m.lathe([(H - 0.025, 0.0), (H - 0.025, R * 0.87)], mat_body, seg=28, smooth=0.0, cap=False)   # lid
    m.lathe([(H - 0.02, R * 0.74), (H + 0.012, R * 0.7), (H + 0.012, R * 0.2), (H - 0.02, R * 0.2)], 'pr_barrel_lid', seg=24, smooth=30.0, cap=False)
    m.lathe([(H + 0.012, 0.0), (H + 0.012, R * 0.2)], 'pr_barrel_lid', seg=24, smooth=0.0, cap=False)
    for ang, rr in ((0.9, 0.5), (-2.4, 0.52)):                  # two bungs
        cx, cy = math.cos(ang) * R * rr, math.sin(ang) * R * rr
        m.lathe([(H + 0.005, 0.07), (H + 0.045, 0.06), (H + 0.045, 0.0)], 'pr_steel_dark', mx=trans(cx, cy, 0), seg=14, smooth=30.0, cap=False)
        m.lathe([(H + 0.045, 0.035), (H + 0.07, 0.03), (H + 0.07, 0.0)], 'pr_steel', mx=trans(cx, cy, 0), seg=10, smooth=30.0, cap=False)
    if band:
        m.lathe([(0.4, R * 1.004), (0.68, R * 1.004)], 'hazard_yellow', seg=28, smooth=40.0, cap=False)
        m.lathe([(0.395, R * 1.006), (0.405, R * 1.006)], 'barrel_band', seg=28, smooth=40.0, cap=False)
        m.lathe([(0.675, R * 1.006), (0.685, R * 1.006)], 'barrel_band', seg=28, smooth=40.0, cap=False)


FLAME = [(0.0, 1.0), (0.2, 0.74), (0.34, 0.55), (0.4, 0.3), (0.3, 0.07), (0.0, 0.0), (-0.3, 0.07), (-0.4, 0.3), (-0.3, 0.52),
         (-0.19, 0.4), (-0.17, 0.62), (-0.08, 0.8)]
FLAME_IN = [(0.0, 0.5), (0.12, 0.32), (0.14, 0.15), (0.0, 0.06), (-0.14, 0.15), (-0.12, 0.32)]


def flame_decal(m, R, z0, h, ang=0.0, mx=None, outer='pr_flame_black', inner='pr_flame_orange', lift=0.006):
    wrap_decal(m, [(s * h, z0 + z * h) for s, z in FLAME], R, outer, ang, lift, mx)
    wrap_decal(m, [(s * h, z0 + z * h) for s, z in FLAME_IN], R, inner, ang, lift + 0.004, mx)


def barrel():
    m = Mesh('barrel')
    barrel_body(m)
    flame_decal(m, BR * 1.004, 0.41, 0.26)
    # a dent and a scuffed patch keep the drum from looking brand new
    return m


def barrel_lid():
    m = Mesh('lid')
    R = 0.4
    m.lathe([(-0.03, 0.0), (-0.03, R * 0.95), (0.0, R), (0.03, R * 0.98), (0.05, R * 0.9), (0.012, R * 0.86)], 'pr_barrel_lid', seg=26, smooth=40.0, cap=False)
    m.lathe([(0.05, R * 0.9), (0.012, R * 0.86), (0.012, 0.0)], 'pr_barrel_lid', seg=26, smooth=0.0, cap=False)
    m.lathe([(-0.02, R * 1.0), (0.02, R * 1.05), (0.07, R * 1.05), (0.07, R * 0.92), (0.03, R * 0.9)], 'barrel_band', seg=26, smooth=40.0, cap=False)
    m.lathe([(0.012, R * 0.3), (0.045, R * 0.26), (0.045, 0.0)], 'pr_steel_dark', mx=trans(0.13, 0.08, 0.0), seg=12, smooth=30.0, cap=False)
    m.lathe([(0.045, 0.05), (0.07, 0.04), (0.07, 0.0)], 'pr_steel', mx=trans(0.13, 0.08, 0.0), seg=10, smooth=30.0, cap=False)
    # a bent-in dent and a torn bite out of the rim
    m.warp(0.025, 6.0, 3.0)
    m.transform(rotx(0.62) @ rotz(0.4))
    return m


def sheet_shard(seed, w, h, bend, mat_out, mat_in, y_band=None):
    """A curved sheet of torn drum metal: jagged outline, outer paint, steel inside."""
    r = random.Random(seed)
    m = Mesh('shard')
    nu, nv = 9, 9
    # jagged boundary: the half-width and top/bottom edges vary with random zigzags
    left = [r.uniform(-0.14, 0.1) for _ in range(nv + 1)]
    right = [r.uniform(-0.1, 0.14) for _ in range(nv + 1)]
    bot = [r.uniform(0.0, 0.18) for _ in range(nu + 1)]
    top = [r.uniform(-0.18, 0.0) for _ in range(nu + 1)]

    def surf(u, v, off):
        i, j = int(round(u * nu)), int(round(v * nv))
        x0 = -w / 2 * (1 + left[j] * 2)
        x1 = w / 2 * (1 + right[j] * 2)
        z0 = bot[i] * h
        z1 = h * (1 + top[i])
        x = x0 + (x1 - x0) * u
        z = z0 + (z1 - z0) * v
        ang = x * bend
        R = 1.0 / bend
        return ((R + off) * math.sin(ang), -(R + off) * math.cos(ang) + R, z - h / 2)

    m.grid_sheet(lambda u, v: surf(u, v, 0.0), nu, nv, mat_out, smooth=70.0)
    m.grid_sheet(lambda u, v: surf(u, v, -0.018), nu, nv, mat_in, smooth=70.0)
    if y_band is not None:
        m.grid_sheet(lambda u, v: surf(u, y_band[0] + (y_band[1] - y_band[0]) * v, 0.004), nu, nv, 'hazard_yellow', smooth=70.0)
    return m


def barrel_shard(i):
    p = [(0.66, 0.55, 3.2, (0.35, 0.65)), (0.48, 0.66, 2.6, None), (0.4, 0.42, 3.6, None)][i]
    m = sheet_shard(10 + i, p[0], p[1], p[2], 'barrel_red', 'pr_steel', p[3])
    m.transform(rotx(0.5 + 0.2 * i) @ rotz(0.5 * (i - 1)))
    return m


def fire_barrel():
    """An old blue oil drum with a rusty rim, holes punched in the sides and glowing coals in the open top (the lead adds the flames)."""
    m = Mesh('fire_barrel')
    R, H = 0.38, 0.95
    m.lathe([(0.02, 0.0), (0.02, R * 0.9), (0.05, R * 0.97), (0.1, R), (H - 0.1, R), (H - 0.05, R * 0.97), (H - 0.02, R * 0.93)],
            'pr_drum_blue', seg=26, smooth=60.0, cap=False)
    for z in (0.3, 0.62):
        m.lathe([(z - 0.04, R), (z - 0.018, R * 1.045), (z + 0.018, R * 1.045), (z + 0.04, R)], 'pr_drum_blue', seg=26, smooth=50.0, cap=False)
    m.lathe([(0.0, R * 0.92), (0.0, R * 1.02), (0.07, R * 1.02), (0.07, R * 0.98)], 'pr_rust', seg=26, smooth=40.0, cap=False)
    m.lathe([(H - 0.08, R * 0.98), (H - 0.02, R * 1.05), (H + 0.03, R * 1.05), (H + 0.03, R * 0.9)], 'pr_rust', seg=26, smooth=40.0, cap=False)
    # inside: char, then coals piled a little over the rim
    m.lathe([(H - 0.2, 0.0), (H - 0.2, R * 0.9), (H + 0.03, R * 0.9)], 'pr_char', seg=26, smooth=0.0, cap=False)
    m.lathe([(H - 0.02, R * 0.8), (H + 0.08, R * 0.62), (H + 0.15, R * 0.3), (H + 0.17, 0.0)], 'pr_coal', seg=18, smooth=40.0, cap=False)
    for k, (a, rr, s) in enumerate(((0.3, 0.45, 0.1), (2.2, 0.5, 0.09), (4.0, 0.4, 0.11), (5.3, 0.55, 0.08))):
        rock(m, (math.cos(a) * R * rr, math.sin(a) * R * rr, H + 0.12), (s, s, s * 0.8), 'pr_coal', seed=k, n=7, bevel=0.01)
    # punched air holes (dark with a hot rim) and rust streaks
    for a, z in ((-0.5, 0.45), (0.5, 0.45), (0.0, 0.2)):
        wrap_decal(m, [(math.cos(t) * 0.07, z + math.sin(t) * 0.05) for t in [i * PI / 4 for i in range(8)]], R, 'pr_char', a, 0.004)
        wrap_decal(m, [(math.cos(t) * 0.045, z + math.sin(t) * 0.03) for t in [i * PI / 4 for i in range(8)]], R, 'pr_coal', a, 0.008)
    for a, w in ((0.8, 0.1), (-0.9, 0.08)):
        wrap_decal(m, [(-w, 0.75), (w, 0.75), (w * 0.6, 0.38), (-w * 0.6, 0.38)], R, 'pr_rust', a, 0.004)
    return m


# ------------------------------------------------------------------------------------------------ chests

def chest_lid(m, width, depth, mx):
    """Half-cylinder lid in its own frame: hinge at the origin along X, closing toward -Y. mx places it."""
    r = depth / 2
    w2 = width / 2

    def surf(rr):
        return lambda u, v: ((u - 0.5) * width, -r + rr * math.cos(PI * v), rr * math.sin(PI * v))

    m.grid_sheet(surf(r), 14, 16, 'pr_chest_wood', mx=mx, smooth=75.0)
    m.grid_sheet(surf(r - 0.03), 6, 16, 'pr_velvet', mx=mx, smooth=75.0)
    for sx in (-1, 1):                                          # wooden end caps
        m.poly([(sx * w2, -r + r * math.cos(PI * k / 12), r * math.sin(PI * k / 12)) for k in range(13)], 'pr_chest_wood', mx=mx)
    for x in (-0.36, 0.0, 0.36):                                # gold straps over the lid
        m.grid_sheet(lambda u, v, x=x: (x + (u - 0.5) * 0.1, -r + (r + 0.02) * math.cos(PI * v), (r + 0.02) * math.sin(PI * v)),
                     2, 14, 'pr_chest_gold', mx=mx, smooth=75.0)


def chest(opened):
    m = Mesh('chest')
    W, D, H = 1.1, 0.7, 0.5
    m.box(-W / 2, W / 2, -D / 2, D / 2, 0.04, H, 'pr_chest_wood', bevel=0.02)
    m.box(-W / 2 - 0.02, W / 2 + 0.02, -D / 2 - 0.02, D / 2 + 0.02, 0.0, 0.1, 'pr_chest_gold', bevel=0.015)   # base plinth
    for x in (-0.36, 0.0, 0.36):                                # straps down the body
        m.box(x - 0.05, x + 0.05, -D / 2 - 0.018, D / 2 + 0.018, 0.0, H, 'pr_chest_gold', bevel=0.012)
    m.box(-W / 2 - 0.03, -W / 2 + 0.07, -D / 2 - 0.03, D / 2 + 0.03, 0.0, H + 0.01, 'pr_chest_gold', bevel=0.015)   # end frames
    m.box(W / 2 - 0.07, W / 2 + 0.03, -D / 2 - 0.03, D / 2 + 0.03, 0.0, H + 0.01, 'pr_chest_gold', bevel=0.015)
    for x in (-0.46, -0.22, 0.22, 0.46):                        # front rivets
        for z in (0.17, 0.4):
            m.sphere((x, -D / 2 - 0.022, z), 0.024, 'pr_steel', seg=8)
    if not opened:
        chest_lid(m, W, D, trans(0, D / 2, H))
        m.box(-W / 2 - 0.02, W / 2 + 0.02, -D / 2 - 0.02, D / 2 + 0.02, H - 0.025, H + 0.03, 'pr_chest_gold', bevel=0.012)   # seam band
        m.box(-0.11, 0.11, -D / 2 - 0.05, -D / 2, 0.3, 0.6, 'pr_chest_gold', bevel=0.02)                                      # lock plate
        m.ball((0, -D / 2 - 0.055, 0.47), (0.04, 0.012, 0.04), 'pr_flame_black')
        m.box(-0.012, 0.012, -D / 2 - 0.058, -D / 2 - 0.04, 0.37, 0.46, 'pr_flame_black')
    else:
        # open: gold rim, glowing heap with coins and gems, the lid thrown back showing its red velvet lining
        for (x0, x1, y0, y1) in ((-W / 2, W / 2, -D / 2, -D / 2 + 0.07), (-W / 2, W / 2, D / 2 - 0.07, D / 2),
                                 (-W / 2, -W / 2 + 0.07, -D / 2, D / 2), (W / 2 - 0.07, W / 2, -D / 2, D / 2)):
            m.box(x0, x1, y0, y1, H - 0.02, H + 0.05, 'pr_chest_gold', bevel=0.012)
        m.box(-W / 2 + 0.07, W / 2 - 0.07, -D / 2 + 0.07, D / 2 - 0.07, H - 0.02, H + 0.03, 'pr_gold_glow')
        m.ball((0, 0.0, H + 0.04), (0.44, 0.24, 0.16), 'pr_gold_glow', seg=16, rings=8)
        r = random.Random(4)
        for k in range(16):
            x = r.uniform(-0.44, 0.44)
            y = r.uniform(-0.2, 0.2)
            z = H + 0.04 + 0.16 * math.sqrt(max(0.0, 1 - (x / 0.44) ** 2 - (y / 0.24) ** 2)) + 0.012
            m.lathe([(0, 0.07), (0.03, 0.07)], 'pr_chest_gold', mx=trans(x, y, z) @ rotx(r.uniform(0.2, 1.3)) @ rotz(r.uniform(0, PI)),
                    seg=12, smooth=30.0, cap=True)
        for k, (x, y, mt) in enumerate(((-0.25, -0.1, 'pr_gem_pink'), (0.22, -0.12, 'pr_gem_green'), (0.02, 0.05, 'pr_gem_blue'),
                                        (0.36, 0.08, 'pr_gem_pink'))):
            z = H + 0.04 + 0.16 * math.sqrt(max(0.0, 1 - (x / 0.44) ** 2 - (y / 0.24) ** 2)) + 0.03
            rock(m, (x, y, z), (0.05, 0.05, 0.06), mt, seed=20 + k, n=8, bevel=0.004)
        chest_lid(m, W, D, trans(0, D / 2, H) @ rotx(-1.95))
    return m


# ------------------------------------------------------------------------------------------------ small road furniture

def cone():
    m = Mesh('cone')
    m.box(-0.26, 0.26, -0.26, 0.26, 0.0, 0.05, 'pr_orange', bevel=0.02)

    def rad(z):
        return 0.19 - 0.15 * (z - 0.05) / 0.65
    m.lathe([(0.05, 0.0), (0.05, rad(0.05)), (0.7, 0.04), (0.72, 0.0)], 'pr_orange', seg=18, smooth=50.0, cap=False)
    for z0, z1 in ((0.2, 0.31), (0.37, 0.46)):
        m.lathe([(z0, rad(z0) + 0.006), (z1, rad(z1) + 0.006)], 'pr_white', seg=18, smooth=40.0, cap=False)
    return m


def hydrant():
    m = Mesh('hydrant')
    m.lathe([(0.0, 0.0), (0.0, 0.26), (0.06, 0.26), (0.08, 0.2), (0.14, 0.2), (0.17, 0.18), (0.5, 0.18), (0.54, 0.205), (0.6, 0.205),
             (0.63, 0.18), (0.64, 0.17), (0.66, 0.15), (0.74, 0.12), (0.8, 0.07), (0.82, 0.0)], 'pr_hydrant', seg=20, smooth=45.0, cap=False)
    m.lathe([(0.13, 0.22), (0.15, 0.24), (0.19, 0.24), (0.2, 0.2)], 'pr_steel_dark', seg=20, smooth=45.0, cap=False)
    m.cyl((0, 0, 0.8), (0, 0, 0.88), 0.05, 0.04, 'pr_steel', seg=5)      # pentagon nut
    for sx in (-1, 1):                                          # side nozzles with caps
        m.cyl((sx * 0.14, 0, 0.42), (sx * 0.31, 0, 0.42), 0.085, 0.085, 'pr_hydrant', seg=14)
        m.cyl((sx * 0.3, 0, 0.42), (sx * 0.355, 0, 0.42), 0.105, 0.105, 'pr_steel', seg=14, bevel=0.01)
        m.cyl((sx * 0.355, 0, 0.42), (sx * 0.375, 0, 0.42), 0.04, 0.04, 'pr_steel_dark', seg=8)
    m.cyl((0, -0.14, 0.38), (0, -0.28, 0.38), 0.1, 0.1, 'pr_hydrant', seg=16)
    m.cyl((0, -0.27, 0.38), (0, -0.33, 0.38), 0.125, 0.125, 'pr_steel', seg=16, bevel=0.012)
    m.cyl((0, -0.33, 0.38), (0, -0.35, 0.38), 0.055, 0.05, 'pr_steel_dark', seg=8)
    return m


def sit(m, mx=None):
    """Drop a mesh so its lowest point rests on z = 0."""
    zmin = min(v.co.z for v in m.bm.verts)
    m.transform(trans(0, 0, -zmin))


def tyre():
    m = Mesh('tyre')
    R, r = 0.3, 0.12
    ring = [(R * math.cos(2 * PI * k / 24), 0.0, R * math.sin(2 * PI * k / 24)) for k in range(25)]
    m.tube(ring, r, 'pr_tyre', seg=12, smooth=70.0, cap=False)
    for k in range(12):                                         # tread blocks
        a = 2 * PI * k / 12
        m.box(-0.045, 0.045, -0.035, 0.035, -0.028, 0.028, 'pr_iron', mx=trans((R + r * 0.97) * math.cos(a), 0, (R + r * 0.97) * math.sin(a)) @ roty(-a), bevel=0.01)
    m.cyl((0, 0.07, 0), (0, -0.07, 0), R * 0.62, R * 0.62, 'pr_rim', seg=20, bevel=0.01)
    m.cyl((0, -0.07, 0), (0, -0.1, 0), 0.07, 0.06, 'pr_steel_dark', seg=14)
    for k in range(5):
        a = 2 * PI * k / 5 + 0.3
        m.cyl((0.12 * math.cos(a), -0.07, 0.12 * math.sin(a)), (0.12 * math.cos(a), -0.095, 0.12 * math.sin(a)), 0.016, 0.016, 'pr_steel_dark', seg=6)
    m.transform(rotz(0.45) @ rotx(-1.1))                        # lying tilted, hub toward the sky
    sit(m)
    return m


def sawhorse():
    m = Mesh('sawhorse')
    L = 2.1
    lean = 0.26
    for sx in (-1, 1):                                          # two A-frames
        x = sx * (L / 2 - 0.2)
        for sy in (-1, 1):
            m.box(x - 0.035, x + 0.035, -0.04, 0.04, 0.0, 1.12, 'pr_white', bevel=0.008, mx=trans(0, sy * 0.28, 0) @ rotx(sy * lean))
        m.box(x - 0.04, x + 0.04, -0.12, 0.12, 1.05, 1.13, 'pr_white', bevel=0.01)
        m.box(x - 0.03, x + 0.03, -0.3, 0.3, 0.12, 0.17, 'pr_white', bevel=0.008)
        m.cyl((x, 0, 1.13), (x, 0, 1.2), 0.07, 0.07, 'pr_orange', seg=12)
        m.cyl((x, 0, 1.2), (x, 0, 1.3), 0.085, 0.085, 'pr_light_amber', seg=12, bevel=0.01)
        m.sphere((x, 0, 1.3), 0.085, 'pr_light_amber', seg=12, sc=(1, 1, 0.55))
    for z, k in ((0.5, 0), (0.86, 1)):                           # striped boards on the front legs
        yleg = -0.28 + math.tan(lean) * z
        stripe_board(m, -L / 2, L / 2, -0.11, 0.11, -0.09, -0.045, 10, 'pr_orange' if k == 0 else 'pr_concrete_red', 'pr_white',
                     slant=0.55, mx=trans(0, yleg, z) @ rotx(-lean))
    return m


def barrier():
    """Red and white concrete jersey barrier, 2.6 m long across the road."""
    m = Mesh('barrier')
    L, H = 2.6, 0.95
    prof = [(-0.36, 0.0), (0.36, 0.0), (0.36, 0.16), (0.22, 0.56), (0.15, H), (-0.15, H), (-0.22, 0.56), (-0.36, 0.16)]
    base = planes_yz(prof)
    k = 0.6                       # stripes lean: x shifts k per metre of height
    sw = 0.3
    n = int((L + k * H) / sw) + 1
    for i in range(n):
        u0 = -L / 2 - k * H + i * sw
        planes = base + [((1, 0, -k), u0 + sw), ((-1, 0, k), -u0), ((1, 0, 0), L / 2), ((-1, 0, 0), L / 2)]
        m.convex(planes, 'pr_concrete_red' if i % 2 == 0 else 'pr_concrete_white', bevel=0.012)
    for sx in (-1, 1):                                          # steel lifting pins
        m.box(sx * (L / 2 - 0.2) - 0.05, sx * (L / 2 - 0.2) + 0.05, -0.05, 0.05, H - 0.02, H + 0.03, 'pr_steel_dark', bevel=0.01)
    return m


def crate():
    m = Mesh('crate')
    s = 0.46
    m.box(-s, s, -s, s, 0.0, 2 * s, 'pr_crate_wood', bevel=0.02)
    for k in range(5):                                          # planks on the lid
        y0 = -s + k * (2 * s) / 5
        m.box(-s - 0.01, s + 0.01, y0 + 0.008, y0 + 2 * s / 5 - 0.008, 2 * s - 0.01, 2 * s + 0.025, 'pr_crate_wood' if k % 2 else 'pr_crate_wood2', bevel=0.008)
    for z0, z1 in ((0.0, 0.11), (2 * s - 0.11, 2 * s)):         # top and bottom frames
        m.box(-s - 0.025, s + 0.025, -s - 0.025, s + 0.025, z0, z1, 'pr_crate_dark', bevel=0.012)
    for sx in (-1, 1):                                          # corner posts, front and side
        m.box(sx * s - 0.075, sx * s + 0.075, -s - 0.025, -s + 0.02, 0.0, 2 * s, 'pr_crate_dark', bevel=0.012)
        m.box(sx * s - 0.02, sx * s + 0.025, -s - 0.075, -s + 0.075, 0.0, 2 * s, 'pr_crate_dark', bevel=0.012)
    ln = math.hypot(2 * s - 0.2, 2 * s - 0.2)
    for sg in (-1, 1):                                          # X brace on the front
        m.box(-0.065, 0.065, -0.03, 0.03, -ln / 2, ln / 2, 'pr_crate_dark', mx=trans(0, -s - 0.012, s) @ roty(sg * PI / 4), bevel=0.01)
    for sx in (-1, 1):
        for z in (0.15, 2 * s - 0.15):
            m.sphere((sx * (s - 0.075), -s - 0.03, z), 0.016, 'pr_steel_dark', seg=6)
    m.transform(rotz(0.22))
    return m


# ------------------------------------------------------------------------------------------------ vehicles

def wheel(m, x, y, z=0.36, r=0.36, w=0.26, tyre='pr_tyre', rim='pr_rim', mx=None, arch=True, edge=0.92, bare=False):
    """A wheel on the side of a body at y (the sign picks the outer face): tyre, bright hub, lug nuts, dark arch behind it."""
    sd = 1.0 if y > 0 else -1.0
    if arch:
        m.cyl((x, sd * edge, z), (x, sd * (edge + 0.03), z), r * 1.22, r * 1.22, 'pr_iron', seg=18, mx=mx)
    if not bare:
        m.cyl((x, y - sd * w / 2, z), (x, y + sd * w / 2, z), r, r, tyre, seg=18, bevel=0.035, mx=mx)
    m.cyl((x, y + sd * (w / 2 - 0.01), z), (x, y + sd * (w / 2 + 0.035), z), r * 0.64, r * 0.6, rim, seg=14, mx=mx)
    m.cyl((x, y + sd * (w / 2 + 0.03), z), (x, y + sd * (w / 2 + 0.06), z), r * 0.2, r * 0.17, 'pr_steel_dark', seg=8, mx=mx)
    for k in range(5):
        a = 2 * PI * k / 5
        m.sphere((x + math.cos(a) * r * 0.38, y + sd * (w / 2 + 0.045), z + math.sin(a) * r * 0.38), 0.022, 'pr_steel_dark', seg=6, mx=mx)


SEDAN = dict(
    body=[(-2.25, 0.3), (2.25, 0.3), (2.28, 0.62), (2.15, 0.84), (0.95, 0.93), (-1.4, 0.95), (-2.1, 0.9), (-2.28, 0.62)],
    cab=[(-1.3, 0.92), (-0.95, 1.45), (0.5, 1.45), (0.98, 0.92)],
    front=2.25, rear=-2.25, wheels=(-1.4, 1.4), win=((-1.05, -0.12), (-0.02, 0.85)), seams=(-0.07, 0.9, -1.15), handles=(-0.3, 0.55))
HATCH = dict(
    body=[(-1.85, 0.3), (1.85, 0.3), (1.9, 0.62), (1.78, 0.82), (0.8, 0.92), (-1.55, 0.96), (-1.92, 0.8), (-1.95, 0.55)],
    cab=[(-1.6, 0.94), (-1.5, 1.5), (0.3, 1.5), (0.8, 0.92)],
    front=1.85, rear=-1.95, wheels=(-1.15, 1.2), win=((-1.35, -0.3), (-0.2, 0.62)), seams=(-0.25, 0.7, -1.45), handles=(-0.5, 0.3))


def vehicle(m, sh, body='pr_car_blue', roof=None, glass='pr_glass', lights=True, open_side=0, trim='pr_steel', door_mat=None):
    """A chunky car in local space: nose toward +X, left side +Y, wheels on z = 0. open_side = -1/+1 takes that side's doors off
    (the interior shows). Returns the windscreen plane (point, outward normal, up-slope vector) for crack decals."""
    roof = roof or body
    BODY, CAB = sh['body'], sh['cab']
    around = (0, 0, 0.8)
    xf, xr = sh['front'], sh['rear']
    cab_front = max(p[0] for p in CAB)
    cab_rear = min(p[0] for p in CAB)
    if open_side == 0:
        m.prism(BODY, -0.92, 0.92, body, bevel=0.07)
    else:
        sd = open_side
        for pa, pb in ((cab_front - 0.02, xf + 0.1), (xr - 0.1, cab_rear + 0.02)):     # nose and tail blocks
            m.prism(clip_poly_x(BODY, pa, pb), -0.92, 0.92, body, bevel=0.05)
        m.box(cab_rear, cab_front, -0.9, 0.9, 0.3, 0.46, 'pr_interior')                        # floor
        m.box(cab_rear, cab_front, -sd * 0.92, -sd * 0.78, 0.3, 0.96, body, bevel=0.03)        # the far side stays closed
        m.box(cab_rear, cab_front, sd * 0.78, sd * 0.92, 0.3, 0.5, body, bevel=0.03)          # sill on the open side
        for x0, x1 in ((cab_front - 0.14, cab_front), (cab_rear, cab_rear + 0.14)):             # hinge pillars
            m.box(x0, x1, sd * 0.7, sd * 0.92, 0.3, 0.96, body, bevel=0.02)
        # seats, steering wheel and dash showing in the gap
        m.box(-0.62, -0.5, sd * 0.1, sd * 0.78, 0.45, 1.2, 'pr_seat', bevel=0.04)
        m.box(-0.62, 0.1, sd * 0.1, sd * 0.78, 0.45, 0.62, 'pr_seat', bevel=0.04)
        m.box(-1.2, -1.0, sd * 0.1, sd * 0.78, 0.45, 1.05, 'pr_seat', bevel=0.04)
        m.box(cab_front - 0.5, cab_front, -0.8, 0.8, 0.5, 1.0, 'pr_engine', bevel=0.04)
        ring = [(0.32 + 0.02 * math.cos(2 * PI * k / 14), sd * 0.4 + 0.2 * math.cos(2 * PI * k / 14), 0.95 + 0.2 * math.sin(2 * PI * k / 14)) for k in range(15)]
        m.tube(ring, 0.022, 'pr_iron', seg=6)
    m.prism(CAB, -0.8, 0.8, roof, bevel=0.05)
    for sy in (-1, 1):
        for xa, xb in sh['win']:
            poly = clip_poly_x(CAB, xa, xb)
            if len(poly) >= 3:
                panel(m, [(px, sy * 0.8, pz) for px, pz in poly], glass, inset=0.82, push=0.014, around=around)
    a0, a1 = CAB[0], CAB[1]
    b0, b1 = CAB[3], CAB[2]
    ws = [(b0[0], -0.8, b0[1]), (b1[0], -0.8, b1[1]), (b1[0], 0.8, b1[1]), (b0[0], 0.8, b0[1])]
    rg = [(a0[0], -0.8, a0[1]), (a1[0], -0.8, a1[1]), (a1[0], 0.8, a1[1]), (a0[0], 0.8, a0[1])]
    panel(m, ws, glass, inset=0.86, push=0.016, around=around)
    panel(m, rg, glass, inset=0.86, push=0.016, around=around)
    for sy in (-1, 1):
        if sy == open_side:
            continue
        if door_mat:
            m.box(sh['seams'][2] + 0.02, sh['seams'][1] + 0.08, sy * 0.915, sy * 0.95, 0.34, 0.93, door_mat, bevel=0.02)
        for x in sh['seams']:
            m.box(x - 0.008, x + 0.008, sy * 0.915 - 0.004, sy * 0.935, 0.36, 0.95, 'pr_iron')
        for x in sh['handles']:
            m.box(x - 0.1, x + 0.1, sy * 0.93 - 0.01, sy * 0.95, 0.82, 0.86, trim, bevel=0.008)
        m.box(xr + 0.05, xf - 0.05, sy * 0.915, sy * 0.935, 0.3, 0.4, 'pr_iron')            # sill shadow strip
    # nose: grille, bumper, lights; tail
    m.box(xf - 0.05, xf + 0.09, -0.9, 0.9, 0.3, 0.5, trim, bevel=0.03)
    m.box(xf - 0.01, xf + 0.06, -0.38, 0.38, 0.5, 0.74, 'pr_iron', bevel=0.012)
    for k in range(4):
        m.box(xf + 0.05, xf + 0.07, -0.34, 0.34, 0.54 + k * 0.05, 0.57 + k * 0.05, 'pr_steel_dark')
    for sy in (-1, 1):
        m.box(xf - 0.07, xf + 0.05, sy * 0.52, sy * 0.88, 0.58, 0.8, 'pr_headlight' if lights else 'pr_headlight_off', bevel=0.02)
        m.box(xr - 0.05, xr + 0.05, sy * 0.5, sy * 0.88, 0.6, 0.8, 'pr_taillight', bevel=0.02)
        mirror_x = cab_front - 0.12
        m.box(mirror_x, mirror_x + 0.14, sy * 0.82, sy * 1.0, 1.0, 1.12, body, bevel=0.02)
    m.box(xr - 0.09, xr + 0.05, -0.9, 0.9, 0.3, 0.48, trim, bevel=0.03)
    for x in sh['wheels']:
        for sy in (-1, 1):
            wheel(m, x, sy * 0.84)
    ex, ez = ws[1][0], ws[1][2]
    d = Vector((b1[0] - b0[0], 0, b1[1] - b0[1])).normalized()
    nrm = Vector((d.z, 0, -d.x))
    return (Vector(((b0[0] + b1[0]) / 2, 0, (b0[1] + b1[1]) / 2)), nrm, d)


def crack_windscreen(m, wsp, off_y=0.0, along=0.5, n=7, seed=3, scale=1.0):
    """Spider-web cracks and a dark hole on the windscreen plane: wsp = (centre, normal, up-slope) from `vehicle`."""
    r = random.Random(seed)
    cen, nn, vv = wsp
    ux = Vector((0.0, 1.0, 0.0))
    o = cen + ux * off_y + vv * (along - 0.5) * 0.6 + nn * 0.02
    hole = []
    for k in range(9):
        a = 2 * PI * k / 9
        rr = 0.13 * scale * (0.6 + 0.6 * ((k * 7) % 3) / 2)
        hole.append(tuple(o + ux * math.cos(a) * rr + vv * math.sin(a) * rr * 0.8))
    m.poly(hole, 'pr_glass_hole')
    for k in range(n):
        a = 2 * PI * k / n + r.uniform(-0.2, 0.2)
        L = r.uniform(0.35, 0.6) * scale
        pts = [o + ux * math.cos(a) * 0.1 + vv * math.sin(a) * 0.1,
               o + ux * math.cos(a) * L * 0.5 + vv * math.sin(a) * L * 0.45 + nn * 0.004,
               o + ux * math.cos(a + 0.2) * L + vv * math.sin(a + 0.2) * L * 0.9 + nn * 0.004]
        for p, q in zip(pts[:-1], pts[1:]):
            m.cyl(tuple(p), tuple(q), 0.014, 0.012, 'pr_crack', seg=4)
    for ring in (0.22 * scale, 0.36 * scale):
        pts = [o + ux * math.cos(2 * PI * k / 10) * ring * (0.9 + 0.2 * ((k * 5) % 3) / 2) + vv * math.sin(2 * PI * k / 10) * ring * 0.8 + nn * 0.004
               for k in range(11)]
        for p, q in zip(pts[:-1], pts[1:]):
            if r.random() < 0.55:
                m.cyl(tuple(p), tuple(q), 0.011, 0.011, 'pr_crack', seg=4)


def popped_hood(m, sh, mat, side_x0=0.98, angle=0.24, seed=5):
    """Engine bay open and a dented bonnet flipped up on its rear hinge."""
    xf = sh['front']
    m.box(side_x0, xf - 0.05, -0.78, 0.78, 0.5, 0.88, 'pr_glass_hole')
    m.box(side_x0 + 0.4, xf - 0.25, -0.4, 0.4, 0.8, 1.05, 'pr_engine', bevel=0.05)
    m.box(side_x0 + 0.2, side_x0 + 0.5, -0.6, -0.15, 0.8, 0.95, 'pr_steel_dark', bevel=0.04)
    hood = Mesh('hood')
    hood.box(0.0, xf - side_x0 - 0.05, -0.9, 0.9, 0.0, 0.07, mat, bevel=0.03)
    subdivide(hood, 4)
    hood.warp(0.06, 2.4, seed)
    m.add(hood, trans(side_x0 - 0.03, 0, 0.9) @ roty(-angle))


def dented(m, mat, x0, x1, y0, y1, z0, z1, amp=0.05, seed=0, cuts=3):
    """A box-shaped panel with dents (grid-subdivided and warped)."""
    p = Mesh('dent')
    p.box(x0, x1, y0, y1, z0, z1, mat, bevel=0.02)
    subdivide(p, cuts)
    p.warp(amp, 2.0, seed)
    m.add(p)


def pillar(m, x0, z0, x1, z1, y, mat, t=0.04):
    """A thin post from (x0, y, z0) to (x1, y, z1) in the XZ plane."""
    d = Vector((x1 - x0, 0, z1 - z0))
    ang = math.atan2(d.x, d.z)
    m.box(-t, t, -t, t, 0.0, d.length, mat, mx=trans(x0, y, z0) @ roty(ang), bevel=0.01)


def burnt_car(m):
    """A gutted, blackened sedan: no glass, no bonnet, rims on the ground, a few embers still glowing inside."""
    sh = SEDAN
    ch, sc = 'pr_car_char', 'pr_car_scorch'
    m.box(-2.2, 2.2, -0.88, 0.88, 0.2, 0.36, 'pr_iron')
    # tail block with a sagging boot lid, nose with an exposed engine
    m.prism(clip_poly_x(sh['body'], -2.4, -1.3), -0.92, 0.92, ch, bevel=0.05)
    dented(m, sc, -2.1, -1.4, -0.82, 0.82, 0.93, 0.99, amp=0.05, seed=2)
    for sy in (-1, 1):
        m.box(0.95, 2.25, sy * 0.52, sy * 0.92, 0.3, 0.88, ch, bevel=0.05)          # front wings
    m.box(1.0, 2.2, -0.55, 0.55, 0.3, 0.6, 'pr_iron')
    m.box(1.2, 2.0, -0.4, 0.4, 0.55, 0.9, 'pr_rust', bevel=0.05)                   # engine block
    m.box(1.35, 1.8, -0.3, 0.3, 0.88, 1.0, 'pr_engine', bevel=0.04)
    m.box(2.2, 2.34, -0.9, 0.9, 0.3, 0.5, 'pr_steel_dark', bevel=0.03)
    m.box(2.22, 2.3, -0.38, 0.38, 0.5, 0.74, 'pr_iron', bevel=0.012)
    for sy in (-1, 1):
        m.box(2.2, 2.3, sy * 0.52, sy * 0.88, 0.58, 0.8, 'pr_char', bevel=0.02)
        m.box(-2.3, -2.2, sy * 0.5, sy * 0.88, 0.6, 0.8, 'pr_char', bevel=0.02)
    m.box(-2.34, -2.2, -0.9, 0.9, 0.3, 0.48, 'pr_steel_dark', bevel=0.03)
    # door panels and posts
    for sy in (-1, 1):
        m.box(-1.3, 0.98, sy * 0.8, sy * 0.92, 0.3, 0.93, ch, bevel=0.03)
        m.box(-1.3, 0.98, sy * 0.78, sy * 0.92, 0.9, 0.96, sc, bevel=0.02)
        pillar(m, 0.98, 0.92, 0.5, 1.45, sy * 0.78, ch, 0.045)
        pillar(m, -1.3, 0.92, -0.95, 1.45, sy * 0.78, ch, 0.045)
        pillar(m, -0.07, 0.92, -0.07, 1.45, sy * 0.78, ch, 0.04)
    roof = Mesh('roof')
    roof.box(-0.97, 0.52, -0.82, 0.82, 1.42, 1.5, sc, bevel=0.03)
    subdivide(roof, 3)
    roof.warp(0.045, 2.0, 7.0)
    m.add(roof, trans(0, 0, 0) @ rotx(0.03))
    # interior: floor, seats, steering wheel, glowing embers
    m.box(-1.3, 0.98, -0.78, 0.78, 0.3, 0.5, 'pr_char')
    for x0, x1 in ((-0.62, 0.1), (-1.2, -1.0)):
        m.box(x0, x1, -0.7, -0.1, 0.45, 0.62, sc, bevel=0.04)
        m.box(x0, x1, 0.1, 0.7, 0.45, 0.62, sc, bevel=0.04)
    for x0 in (-0.62, -1.2):
        m.box(x0, x0 + 0.12, -0.7, -0.1, 0.45, 1.15, sc, bevel=0.04)
        m.box(x0, x0 + 0.12, 0.1, 0.7, 0.45, 1.1, sc, bevel=0.04)
    m.box(0.5, 0.98, -0.78, 0.78, 0.5, 0.98, 'pr_char', bevel=0.04)
    ring = [(0.32, 0.4 + 0.2 * math.cos(2 * PI * k / 14), 0.95 + 0.2 * math.sin(2 * PI * k / 14)) for k in range(15)]
    m.tube(ring, 0.025, 'pr_iron', seg=6)
    r = random.Random(9)
    for x, y, z in ((-0.35, -0.4, 0.66), (-0.3, 0.4, 0.66), (-1.1, -0.3, 0.66), (0.7, 0.2, 1.0), (1.6, 0.0, 1.03), (1.5, -0.2, 0.93), (-1.0, 0.45, 0.66)):
        rock(m, (x, y, z), (0.17, 0.14, 0.07), 'pr_coal', seed=int(x * 10 + y * 7) + 20, n=7, bevel=0.005)
    # rims with a rag of melted tyre
    for x in sh['wheels']:
        for sy in (-1, 1):
            wheel(m, x, sy * 0.84, z=0.28, r=0.28, rim='pr_rust', bare=True, tyre='pr_char')
            ring = [(x + 0.29 * math.cos(2 * PI * k / 14), sy * 0.84, 0.28 + 0.29 * math.sin(2 * PI * k / 14)) for k in range(15)]
            m.tube(ring[:9], 0.05, 'pr_char', seg=6)
    # peeling paint: rust and scorch streaks on the sides
    for sy in (-1, 1):
        for z, w, x in ((0.55, 0.7, -0.5), (0.7, 0.45, 0.3)):
            m.box(x, x + w, sy * 0.925, sy * 0.935, z, z + 0.14, 'pr_rust')
    return m


def police_car(m):
    sh = SEDAN
    wsp = vehicle(m, sh, 'pr_police_black', roof='pr_police_white', glass='pr_glass_dark', door_mat='pr_police_white')
    for sy in (-1, 1):
        m.box(-1.2, 0.95, sy * 0.935, sy * 0.955, 0.42, 0.5, 'pr_sign_blue')           # blue stripe
        star = [(0.0 + 0.16 * (1 if k % 2 == 0 else 0.45) * math.sin(PI * k / 5), 0.0, 0.0 + 0.16 * (1 if k % 2 == 0 else 0.45) * math.cos(PI * k / 5))
                for k in range(10)]
        m.poly([(-0.18 + p[0], sy * 0.96, 0.7 + p[2]) for p in star], 'pr_chest_gold')
    # light bar on the roof
    m.box(-0.2, 0.2, -0.62, 0.62, 1.44, 1.55, 'pr_police_black', bevel=0.03)
    m.box(-0.15, 0.15, -0.58, -0.04, 1.54, 1.7, 'pr_light_red', bevel=0.05)
    m.box(-0.15, 0.15, 0.04, 0.58, 1.54, 1.7, 'pr_light_blue', bevel=0.05)
    m.box(-0.17, 0.17, -0.06, 0.06, 1.54, 1.66, 'pr_white', bevel=0.03)
    # push bar
    for y in (-0.6, -0.3, 0.0, 0.3, 0.6):
        m.box(2.34, 2.4, y - 0.025, y + 0.025, 0.35, 0.78, 'pr_iron', bevel=0.008)
    m.box(2.34, 2.42, -0.64, 0.64, 0.72, 0.8, 'pr_iron', bevel=0.01)
    m.box(2.34, 2.42, -0.64, 0.64, 0.34, 0.4, 'pr_iron', bevel=0.01)
    return m


def car_wreck(kind):
    m = Mesh('car')
    if kind == 0:
        # blue sedan: passenger door ripped off (lying in front), bonnet popped, windscreen smashed, a headlight out
        wsp = vehicle(m, SEDAN, 'pr_car_blue', lights=False, open_side=-1)
        crack_windscreen(m, wsp, off_y=-0.15)
        popped_hood(m, SEDAN, 'pr_car_blue')
        for z, w in ((0.58, 1.7), (0.7, 1.1)):                                           # scrapes along the near side
            m.box(-0.9, -0.9 + w, -0.943, -0.93, z, z + 0.035, 'pr_steel')
        door = Mesh('door')
        door.box(-0.5, 0.5, -0.05, 0.05, 0.0, 0.85, 'pr_car_blue', bevel=0.03)
        door.box(-0.4, 0.4, -0.06, 0.06, 0.55, 0.85, 'pr_glass', bevel=0.01)
        door.box(0.25, 0.42, -0.07, 0.06, 0.4, 0.46, 'pr_steel', bevel=0.01)
        m.add(door, trans(0.4, -1.65, 0.05) @ rotz(0.5) @ rotx(1.38))
        m.transform(rotz(-PI / 2 + 0.5))
    elif kind == 1:
        # red hatchback lying on its roof, wheels in the air, underside showing
        vehicle(m, HATCH, 'pr_car_red')
        m.box(-1.8, 1.7, -0.86, 0.86, 0.12, 0.3, 'pr_underbody', bevel=0.04)              # floor pan
        for x in (-1.2, -0.3, 0.55, 1.35):                                                # cross members
            m.box(x - 0.06, x + 0.06, -0.84, 0.84, 0.06, 0.14, 'pr_iron', bevel=0.015)
        for y in (-0.82, 0.82):                                                           # side rails
            m.box(-1.8, 1.7, y - 0.05, y + 0.05, 0.06, 0.2, 'pr_iron', bevel=0.015)
        m.cyl((-1.9, 0.38, 0.12), (0.3, 0.38, 0.12), 0.05, 0.05, 'pr_steel', seg=8)       # exhaust
        m.ball((-1.5, 0.38, 0.12), (0.3, 0.14, 0.12), 'pr_steel')
        m.box(0.7, 1.55, -0.45, 0.45, 0.04, 0.34, 'pr_engine', bevel=0.05)                # engine and gearbox
        m.cyl((0.7, -0.15, 0.2), (-0.9, -0.15, 0.2), 0.07, 0.07, 'pr_steel_dark', seg=8)  # drive shaft
        m.box(-0.5, 0.35, -0.6, -0.05, 0.04, 0.3, 'pr_rust', bevel=0.04)                  # fuel tank
        for x in HATCH['wheels']:
            m.cyl((x, -0.9, 0.34), (x, 0.9, 0.34), 0.05, 0.05, 'pr_iron', seg=8)           # axles
        # a crumpled roof and one smashed window
        m.transform(trans(0, 0, -0.8))
        m.transform(rotx(2.1))
        m.transform(rotz(-PI / 2 - 0.35))
        sit(m)
    elif kind == 2:
        burnt_car(m)
        m.transform(rotz(-PI / 2 - 0.4))        # nose toward the camera, left side showing
    elif kind == 3:
        police_car(m)
        m.transform(rotz(-PI / 2 - 0.55))
    return m


def bus_build():
    """A wrecked yellow school bus, 10 m long: right-hand door side toward the camera, front-right wheel torn off, windows
    smashed, scraped flank, scorched bonnet. Local space: nose +X, left +Y."""
    m = Mesh('bus')
    X0, X1, W = -5.3, 3.0, 1.2
    around = (-1.0, 0, 1.8)
    m.box(X0, X1, -W, W, 0.55, 3.0, 'pr_bus_yellow', bevel=0.14)
    m.box(X0 + 0.1, X1 - 0.1, -W + 0.15, W - 0.15, 2.95, 3.08, 'pr_bus_yellow', bevel=0.05)          # roof crown
    for x in (-3.4, -1.6):                                                                          # roof hatches
        m.box(x - 0.35, x + 0.35, -0.3, 0.3, 3.05, 3.16, 'pr_steel', bevel=0.03)
    for x in (-4.6, -2.5, -0.6, 1.2, 2.6):                                                          # roof ribs
        m.box(x - 0.04, x + 0.04, -W + 0.1, W - 0.1, 3.075, 3.1, 'pr_bus_dark')
    for sy in (-1, 1):
        m.box(X0 + 0.2, X1 - 0.2, sy * 0.62 - 0.03, sy * 0.62 + 0.03, 3.075, 3.1, 'pr_bus_dark')
    # bonnet and nose
    m.box(X1 - 0.05, 5.0, -0.95, 0.95, 0.62, 1.72, 'pr_bus_yellow', bevel=0.12)
    for sy in (-1, 1):
        m.box(X1 - 0.1, 4.6, sy * 0.8, sy * 1.1, 0.75, 1.1, 'pr_bus_yellow', bevel=0.06)           # fenders
    m.box(4.95, 5.07, -0.55, 0.55, 0.8, 1.45, 'pr_iron', bevel=0.02)                               # grille
    for k in range(5):
        m.box(5.06, 5.09, -0.5, 0.5, 0.88 + k * 0.12, 0.93 + k * 0.12, 'pr_steel_dark')
    for sy in (-1, 1):
        m.cyl((4.93, sy * 0.72, 1.12), (5.1, sy * 0.72, 1.12), 0.14, 0.14, 'pr_headlight_off', seg=14, bevel=0.01)
    m.box(4.95, 5.2, -1.15, 1.15, 0.42, 0.72, 'pr_iron', bevel=0.05, mx=trans(4.95, 0.6, 0) @ rotz(0.12) @ trans(-4.95, -0.6, 0))      # bent bumper
    m.box(X0 - 0.15, X0 + 0.05, -W - 0.05, W + 0.05, 0.4, 0.7, 'pr_iron', bevel=0.05)               # rear bumper
    # windscreen and destination sign
    for sy in (-1, 1):
        panel(m, [(X1, sy * 0.05, 1.85), (X1, sy * 1.1, 1.85), (X1, sy * 1.1, 2.82), (X1, sy * 0.05, 2.82)], 'pr_glass_dark', inset=0.9, push=0.02, around=around)
    m.poly([(X1 + 0.03, -0.55 + 0.5 * math.cos(2 * PI * k / 11) * (0.55 + 0.45 * (k % 2)), 2.35 + 0.42 * math.sin(2 * PI * k / 11) * (0.55 + 0.45 * (k % 2)))
            for k in range(11)], 'pr_glass_hole')
    for k in range(7):                                                                              # shattered right windscreen
        a = 2 * PI * k / 7 + 0.4
        m.cyl((X1 + 0.035, -0.55, 2.35), (X1 + 0.035, -0.55 + 0.52 * math.cos(a), 2.35 + 0.44 * math.sin(a)), 0.014, 0.01, 'pr_crack', seg=4)
    m.box(X1 - 0.02, X1 + 0.06, -0.7, 0.7, 2.87, 2.99, 'pr_iron', bevel=0.02)
    m.box(X1 - 0.02, X1 + 0.07, -0.55, 0.55, 2.9, 2.96, 'pr_light_amber')
    # safety lights on the roof corners
    for sy in (-1, 1):
        m.cyl((2.75, sy * 1.0, 3.0), (2.75, sy * 1.0, 3.14), 0.09, 0.08, 'pr_light_red', seg=10)
        m.cyl((2.75, sy * 0.78, 3.0), (2.75, sy * 0.78, 3.14), 0.09, 0.08, 'pr_light_amber', seg=10)
    # flanks: black rub rails, rows of windows, door
    for sy in (-1, 1):
        for z0, z1 in ((1.52, 1.62), (0.98, 1.06), (2.72, 2.8)):
            m.box(X0 + 0.1, X1 + 0.02, sy * W - 0.01, sy * (W + 0.025), z0, z1, 'pr_bus_stripe')
        for i in range(8):
            x = -4.75 + i * 1.0
            if sy < 0 and x > 1.5:
                continue
            panel(m, [(x - 0.42, sy * W, 1.88), (x + 0.42, sy * W, 1.88), (x + 0.42, sy * W, 2.65), (x - 0.42, sy * W, 2.65)], 'pr_glass_dark', inset=0.95, push=0.022, around=around)
            m.box(x - 0.46, x - 0.4, sy * W - 0.01, sy * (W + 0.05), 1.82, 2.7, 'pr_bus_yellow', bevel=0.01)
        if sy < 0:
            for x0, x1 in ((1.7, 2.3), (2.35, 2.95)):                                               # folding door glass
                panel(m, [(x0, -W, 0.82), (x1, -W, 0.82), (x1, -W, 2.7), (x0, -W, 2.7)], 'pr_glass_dark', inset=0.92, push=0.022, around=around)
            m.box(2.28, 2.36, -W - 0.01, -W - 0.05, 0.75, 2.75, 'pr_bus_stripe', bevel=0.01)
            m.box(1.6, 3.0, -W - 0.01, -W - 0.12, 0.78, 0.82, 'pr_steel', bevel=0.01)                  # door step
    # wheels: rears big, front-left on, front-right torn off (axle stub and a sagging corner)
    for x, r in ((-3.2, 0.5), (3.9, 0.46)):
        for sy in (-1, 1):
            if x > 0 and sy < 0:
                continue
            wheel(m, x, sy * (W - 0.12), z=r, r=r, w=0.34, edge=W - 0.005)
    m.cyl((3.9, -0.7, 0.46), (3.9, -1.05, 0.46), 0.07, 0.09, 'pr_iron', seg=8)                      # torn-off axle stub
    # damage: scorch on the bonnet, scrapes along the near flank, a crumpled roof patch, smashed windows
    m.poly([(3.5, -0.5, 1.735), (4.6, -0.2, 1.735), (4.7, 0.4, 1.735), (4.0, 0.5, 1.735), (3.4, 0.1, 1.735)], 'pr_char')
    for z, w, x in ((1.3, 3.2, -4.0), (1.15, 2.0, -1.5), (2.4, 1.5, -2.5), (0.82, 2.4, -3.4)):
        m.box(x, x + w, -W - 0.012, -W - 0.02, z, z + 0.04, 'pr_steel')
    dent = Mesh('dent')
    dent.box(-3.9, -1.0, -0.9, 0.9, 3.0, 3.06, 'pr_bus_yellow', bevel=0.02)
    subdivide(dent, 4)
    dent.warp(0.07, 1.1, 2.0)
    m.add(dent, trans(0, 0, 0.05))
    for x in (-3.75, -1.75, 0.25):
        sy = -1
        c = (x, sy * W, 2.27)
        m.poly([(c[0] + 0.3 * math.cos(2 * PI * k / 9) * (0.6 + 0.4 * (k % 2)), c[1] - 0.026, c[2] + 0.26 * math.sin(2 * PI * k / 9) * (0.6 + 0.4 * (k % 2)))
                for k in range(9)], 'pr_glass_hole')
        for k in range(6):
            a = 2 * PI * k / 6 + x
            m.cyl((c[0], c[1] - 0.03, c[2]), (c[0] + 0.4 * math.cos(a), c[1] - 0.03, c[2] + 0.34 * math.sin(a)), 0.012, 0.01, 'pr_crack', seg=4)
    # lean: the missing wheel drops the front-right corner
    return m


# ------------------------------------------------------------------------------------------------ trees and bushes

define_leaf('pr_leaf_0', '#278f3a', '#8fd646', 2.2, 6.2, seed=95)
define_leaf('pr_leaf_1', '#43ab38', '#c2e24c', 1.8, 5.0, seed=96)
define_leaf('pr_leaf_2', '#1b7d4d', '#74d45c', 1.2, 6.2, seed=97)
define_leaf('pr_leaf_bush', '#2f9d3a', '#8fdc48', 0.2, 1.5, seed=98)
define_leaf('pr_leaf_bush2', '#3aa84a', '#a8e257', 0.2, 1.4, seed=99)
mats.define('pr_apple', base='#e0301f', bevel=0.02)
mats.define('pr_flower_pink', base='#ff7ab8', bevel=0.01)
mats.define('pr_flower_white', base='#fffaf0', bevel=0.01)
mats.define('pr_flower_yellow', base='#ffd21a', bevel=0.01)


def trunk(m, h, r0, r1, mat='pr_trunk', seg=10):
    m.lathe([(0.0, r0 * 1.9), (0.1, r0 * 1.45), (0.35, r0), (h, r1)], mat, seg=seg, smooth=60.0, cap=True)


def blobs(m, items, mat, seg=20, rings=11):
    for cx, cy, cz, r in items:
        m.ball((cx, cy, cz), (r, r * 0.95, r * 0.92), mat, seg=seg, rings=rings)


def tree(kind):
    m = Mesh('tree')
    if kind == 0:         # big round oak
        trunk(m, 3.2, 0.3, 0.22)
        m.capsule((0, 0, 2.4), (-0.8, -0.1, 3.4), 0.13, 0.09, 'pr_trunk')
        m.capsule((0, 0, 2.5), (0.85, 0.0, 3.5), 0.13, 0.09, 'pr_trunk')
        blobs(m, [(0, 0.1, 4.0, 1.75), (-1.35, -0.2, 3.3, 1.3), (1.4, -0.1, 3.5, 1.35), (0.15, -0.95, 3.1, 1.15),
                  (-0.7, 0.75, 4.6, 1.25), (0.95, 0.6, 4.7, 1.15), (0.0, -0.1, 5.1, 1.05), (-1.9, 0.2, 4.3, 0.8), (1.95, 0.1, 4.4, 0.85)], 'pr_leaf_0')
    elif kind == 1:       # squat apple tree, lime leaves and red apples
        trunk(m, 2.4, 0.28, 0.2)
        m.capsule((0, 0, 1.9), (-0.9, 0, 2.7), 0.12, 0.08, 'pr_trunk')
        m.capsule((0, 0, 1.9), (0.9, 0, 2.8), 0.12, 0.08, 'pr_trunk')
        bl_ = [(0, 0, 3.3, 1.65), (-1.5, 0.0, 2.8, 1.15), (1.5, 0.1, 2.9, 1.25), (0.3, -0.95, 2.6, 1.0), (-0.5, 0.8, 3.9, 1.1), (0.85, 0.5, 4.0, 1.0)]
        blobs(m, bl_, 'pr_leaf_1')
        r = random.Random(11)
        k = 0
        while k < 16:
            cx, cy, cz, rr = bl_[r.randrange(len(bl_))]
            a, e = r.uniform(PI * 1.05, PI * 1.95), r.uniform(-0.2, 1.1)         # on the camera-facing half
            d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e) * 0.95, math.sin(e)))
            if d.y > -0.1:
                continue
            m.ball((cx + d.x * rr * 0.97, cy + d.y * rr * 0.97, cz + d.z * rr * 0.92), 0.13, 'pr_apple', seg=8, rings=6)
            k += 1
    else:                 # tall pine: stacked cones
        trunk(m, 1.8, 0.24, 0.2)
        for ti, (z0, z1, rr) in enumerate(((0.9, 3.0, 1.75), (1.9, 4.1, 1.5), (2.9, 5.1, 1.2), (3.9, 6.2, 0.85))):
            m.lathe([(z0 - 0.15, rr * 0.8), (z0, rr * 0.9), (z1, 0.04)], 'pr_leaf_2', seg=14, smooth=45.0, cap=True)
            nb = 8 - ti
            for k in range(nb):                                   # drooping boughs around the rim of each tier
                a = 2 * PI * (k + 0.5 * (ti % 2)) / nb
                m.ball((math.cos(a) * rr * 0.82, math.sin(a) * rr * 0.82, z0 + 0.08), (rr * 0.3, rr * 0.3, rr * 0.2), 'pr_leaf_2', seg=10, rings=6)
    return m


def bush(kind):
    m = Mesh('bush')
    if kind == 0:
        blobs(m, [(0, 0, 0.62, 0.72), (-0.78, 0.05, 0.48, 0.55), (0.8, -0.05, 0.5, 0.58), (0.2, -0.45, 0.4, 0.45), (-0.3, 0.4, 0.9, 0.5)], 'pr_leaf_bush', seg=16, rings=9)
    else:
        items = [(0, 0, 0.6, 0.7), (-0.8, 0.0, 0.5, 0.5), (0.78, -0.05, 0.52, 0.55), (0.1, -0.45, 0.42, 0.42), (-0.25, 0.4, 0.85, 0.5), (0.5, 0.3, 0.9, 0.45)]
        blobs(m, items, 'pr_leaf_bush2', seg=16, rings=9)
        r = random.Random(7)
        k = 0
        while k < 26:
            cx, cy, cz, rr = items[r.randrange(len(items))]
            a, e = r.uniform(PI * 1.0, PI * 2.0), r.uniform(-0.1, 1.2)
            d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
            if d.y > 0.0:
                continue
            c = (cx + d.x * rr * 0.97, cy + d.y * rr * 0.97, cz + d.z * rr * 0.92)
            m.ball(c, 0.09, 'pr_flower_pink' if k % 3 else 'pr_flower_white', seg=8, rings=5)
            m.ball((c[0], c[1] - 0.06, c[2]), 0.035, 'pr_flower_yellow', seg=6, rings=4)
            k += 1
    return m


# ------------------------------------------------------------------------------------------------ street furniture

def lamp_post():
    m = Mesh('lamp')
    m.lathe([(0.0, 0.0), (0.0, 0.26), (0.1, 0.26), (0.25, 0.15), (0.55, 0.12), (0.6, 0.0)], 'pr_lamp_pole', seg=10, smooth=40.0, cap=False)
    m.lathe([(0.55, 0.13), (0.62, 0.15), (0.7, 0.13), (0.72, 0.09)], 'pr_steel_dark', seg=10, smooth=40.0, cap=False)
    m.cyl((0, 0, 0.6), (0, 0, 4.7), 0.1, 0.065, 'pr_lamp_pole', seg=10)
    m.cyl((0, 0, 3.0), (0, 0, 3.12), 0.115, 0.115, 'pr_steel_dark', seg=10)
    arm = [(0, 0, 4.65), (0.05, 0, 5.05), (0.3, 0, 5.3), (0.75, 0, 5.4), (1.25, 0, 5.25)]
    m.tube(arm, 0.055, 'pr_lamp_pole', seg=8)
    m.cyl((1.25, 0, 5.28), (1.25, 0, 5.2), 0.09, 0.09, 'pr_steel_dark', seg=10)
    # lantern: cap, glowing glass, base plate
    m.lathe([(5.52, 0.0), (5.52, 0.1), (5.42, 0.36), (5.34, 0.38)], 'pr_lamp_pole', mx=trans(1.25, 0, 0), seg=12, smooth=40.0, cap=False)
    m.lathe([(5.0, 0.2), (5.34, 0.35), (5.34, 0.0)], 'pr_lamp_glass', mx=trans(1.25, 0, 0), seg=12, smooth=30.0, cap=False)
    m.lathe([(5.0, 0.0), (5.0, 0.2), (5.04, 0.26)], 'pr_steel_dark', mx=trans(1.25, 0, 0), seg=12, smooth=30.0, cap=False)
    m.ball((1.25, 0, 5.16), (0.25, 0.25, 0.22), 'pr_lamp_glass', seg=12, rings=8)
    m.lathe([(5.34, 0.4), (5.38, 0.36), (5.4, 0.0)], 'pr_steel_dark', mx=trans(1.25, 0, 0), seg=12, smooth=30.0, cap=False)
    return m


def bench():
    m = Mesh('bench')
    W = 1.9
    for k in range(4):                                       # seat slats
        y = -0.3 + k * 0.2
        m.box(-W / 2, W / 2, y - 0.08, y + 0.08, 0.46, 0.52, 'pr_bench_wood', bevel=0.012)
    for k in range(3):                                       # back slats, leaning back
        z = 0.72 + k * 0.2
        m.box(-W / 2, W / 2, 0.32 - 0.03 - (z - 0.55) * 0.12, 0.32 + 0.03 - (z - 0.55) * 0.12, z - 0.08, z + 0.08, 'pr_bench_wood', bevel=0.012)
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.12)
        m.box(x - 0.04, x + 0.04, -0.34, 0.34, 0.0, 0.07, 'pr_iron', bevel=0.01)                   # foot
        m.box(x - 0.04, x + 0.04, -0.3, -0.22, 0.0, 0.5, 'pr_iron', bevel=0.01)                     # front leg
        m.box(x - 0.04, x + 0.04, 0.22, 0.34, 0.0, 1.05, 'pr_iron', bevel=0.01, mx=trans(0, 0.3, 0) @ rotx(0.12) @ trans(0, -0.3, 0))
        m.box(x - 0.045, x + 0.045, -0.3, 0.3, 0.64, 0.7, 'pr_iron', bevel=0.012)                   # arm rest
    m.box(-W / 2 + 0.05, W / 2 - 0.05, -0.12, -0.04, 0.2, 0.26, 'pr_iron')
    return m


def dumpster():
    m = Mesh('dumpster')
    W, D = 2.2, 1.1
    m.box(-W / 2, W / 2, -D / 2, D / 2, 0.3, 1.1, 'pr_dumpster', bevel=0.04)
    m.box(-W / 2 - 0.04, W / 2 + 0.04, -D / 2 - 0.04, D / 2 + 0.04, 1.05, 1.14, 'pr_dumpster', bevel=0.02)  # rim
    for x in (-0.7, 0.0, 0.7):                               # ribs on the front
        m.box(x - 0.05, x + 0.05, -D / 2 - 0.05, -D / 2, 0.38, 1.05, 'pr_dumpster', bevel=0.02)
    for sx in (-1, 1):
        m.box(sx * (W / 2) - 0.02, sx * (W / 2) + 0.02 * sx, -0.4, 0.4, 0.3, 0.45, 'pr_iron')      # fork pockets
        for sy in (-1, 1):
            m.cyl((sx * (W / 2 - 0.2) - 0.05, sy * (D / 2 - 0.15), 0.12), (sx * (W / 2 - 0.2) + 0.05, sy * (D / 2 - 0.15), 0.12), 0.12, 0.12, 'pr_iron', seg=10)
    m.box(-W / 2 + 0.04, W / 2 - 0.04, -D / 2 + 0.04, D / 2 - 0.04, 1.0, 1.1, 'pr_char')               # dark mouth
    # trash heaped inside
    for k, (x, y, c) in enumerate(((-0.6, 0.0, 'pr_trash_black'), (0.0, 0.1, 'pr_trash_white'), (0.55, -0.05, 'pr_trash_green'), (-0.1, -0.1, 'pr_trash_black'))):
        m.ball((x, y, 1.17), (0.4, 0.34, 0.26), c, seg=12, rings=7)
    # lids: left closed, right propped open on its hinge
    lid = Mesh('lid')
    lid.box(0, 1.16, -D - 0.06, 0.0, 0.0, 0.07, 'pr_plastic_black', bevel=0.025)
    m.add(lid, trans(-W / 2 - 0.03, D / 2 + 0.03, 1.14))
    lid2 = Mesh('lid2')
    lid2.box(0, 1.16, -D - 0.06, 0.0, 0.0, 0.07, 'pr_plastic_black', bevel=0.025)
    m.add(lid2, trans(0.03, D / 2 + 0.03, 1.14) @ rotx(-1.0))
    # rust, a dent and a sticker on the front
    m.box(-0.95, -0.45, -D / 2 - 0.054, -D / 2 - 0.045, 0.5, 0.8, 'pr_rust')
    m.box(0.35, 0.8, -D / 2 - 0.054, -D / 2 - 0.045, 0.45, 0.56, 'pr_rust')
    wrap_decal  # noqa
    m.poly([(0.0 + 0.25 * math.cos(PI * k / 5 + 0.3) * (1 if k % 2 == 0 else 0.45), -D / 2 - 0.07, 0.75 + 0.25 * math.sin(PI * k / 5 + 0.3) * (1 if k % 2 == 0 else 0.45)) for k in range(10)], 'pr_flower_yellow')
    # a bag fallen on the ground beside it
    m.ball((W / 2 + 0.45, -0.3, 0.3), (0.4, 0.34, 0.3), 'pr_trash_black', seg=12, rings=7)
    m.ball((W / 2 + 0.45, -0.3, 0.62), (0.1, 0.1, 0.1), 'pr_trash_black', seg=8, rings=5)
    return m


def bus_stop():
    m = Mesh('bus_stop')
    W, D, H = 3.2, 1.2, 2.6
    for sx in (-1, 1):                                                        # posts and back panels
        m.box(sx * W / 2 - 0.05, sx * W / 2 + 0.05, D / 2 - 0.05, D / 2 + 0.05, 0.0, H, 'pr_lamp_pole', bevel=0.012)
        m.box(sx * W / 2 - 0.05, sx * W / 2 + 0.05, -D / 2 - 0.05, -D / 2 + 0.05, 0.0, H, 'pr_lamp_pole', bevel=0.012)
    m.box(-W / 2, W / 2, D / 2 - 0.05, D / 2 + 0.05, 0.1, 0.18, 'pr_lamp_pole')
    for x0, x1, mt in ((-W / 2 + 0.05, -0.55, 'pr_glass'), (-0.5, 0.5, 'pr_ad_panel'), (0.55, W / 2 - 0.05, 'pr_glass')):
        m.box(x0, x1, D / 2 - 0.03, D / 2 + 0.03, 0.2, H - 0.1, 'pr_lamp_pole', bevel=0.01)
        m.box(x0 + 0.05, x1 - 0.05, D / 2 - 0.08, D / 2 - 0.0, 0.3, H - 0.2, mt, bevel=0.01)
    # ad panel picture: a sun and hills, glowing
    m.ball((0.15, D / 2 - 0.09, 1.9), (0.22, 0.015, 0.22), 'pr_light_amber', seg=12, rings=6)
    m.poly([(-0.42, D / 2 - 0.09, 0.4), (-0.1, D / 2 - 0.09, 1.1), (0.15, D / 2 - 0.09, 0.4)], 'pr_trash_green')
    m.poly([(-0.05, D / 2 - 0.09, 0.4), (0.3, D / 2 - 0.09, 1.2), (0.45, D / 2 - 0.09, 0.4)], 'pr_leaf_bush')
    # side panel (left)
    m.box(-W / 2 - 0.02, -W / 2 + 0.02, -D / 2 + 0.05, D / 2 - 0.05, 0.3, H - 0.2, 'pr_glass', bevel=0.01)
    # roof: slightly sloped slab with a front lip
    roof = Mesh('roof')
    roof.box(-W / 2 - 0.25, W / 2 + 0.25, -0.1, D + 0.2, 0.0, 0.12, 'pr_sign_blue', bevel=0.03)
    m.add(roof, trans(0, -D / 2 - 0.2, H) @ rotx(-0.07))
    m.box(-W / 2 - 0.25, W / 2 + 0.25, -D / 2 - 0.32, -D / 2 - 0.24, H - 0.05, H + 0.2, 'pr_sign_blue', bevel=0.02)
    # bench inside
    for k in range(2):
        m.box(-0.8, 0.8, D / 2 - 0.45 + k * 0.17, D / 2 - 0.3 + k * 0.17, 0.5, 0.55, 'pr_bench_wood', bevel=0.01)
    for sx in (-1, 1):
        m.box(sx * 0.75 - 0.03, sx * 0.75 + 0.03, D / 2 - 0.5, D / 2 - 0.1, 0.0, 0.5, 'pr_iron')
    # sign pole at the right: round blue sign with a bus
    x = W / 2 + 0.55
    m.cyl((x, 0, 0), (x, 0, 3.0), 0.045, 0.045, 'pr_steel', seg=8)
    m.cyl((x, -0.03, 3.05), (x, 0.02, 3.05), 0.42, 0.42, 'pr_steel', seg=20)
    m.cyl((x, -0.04, 3.05), (x, 0.0, 3.05), 0.37, 0.37, 'pr_sign_blue', seg=20)
    m.box(x - 0.2, x + 0.2, -0.065, -0.04, 3.0, 3.22, 'pr_white', bevel=0.01)
    m.box(x - 0.17, x + 0.17, -0.075, -0.06, 3.1, 3.18, 'pr_sign_blue')
    for dx in (-0.1, 0.1):
        m.cyl((x + dx, -0.065, 2.98), (x + dx, -0.075, 2.98), 0.05, 0.05, 'pr_iron', seg=8)
    return m


def rubble(kind):
    m = Mesh('rubble')
    r = random.Random(30 + kind)
    C3 = ('pr_concrete_hi', 'pr_concrete', 'pr_concrete_lo')
    if kind == 0:         # a heap of broken concrete blocks with rebar and a red brick or two
        spots = [(-0.6, 0.15, 0.3, 0.42), (0.1, 0.25, 0.32, 0.46), (0.7, 0.1, 0.28, 0.4), (-0.25, -0.35, 0.26, 0.34), (0.45, -0.3, 0.25, 0.32),
                 (-0.2, 0.15, 0.7, 0.4), (0.35, 0.05, 0.72, 0.36), (0.05, -0.05, 1.05, 0.28)]
        for i, (x, y, z, sz) in enumerate(spots):
            shaded_rock(m, (x, y, z), (sz * 1.15, sz, sz * 0.85), C3, seed=40 + i, n=14, jitter=0.18, bevel=0.03)
        for (x, y, a) in ((-0.2, 0.1, 0.5), (0.35, 0.15, -0.6), (0.0, 0.0, 0.1)):
            m.cyl((x, y, 1.0), (x + math.sin(a) * 0.55, y + 0.1, 1.0 + math.cos(a) * 0.65), 0.03, 0.03, 'pr_rebar', seg=6)
        m.box(-0.12, 0.12, -0.06, 0.06, 0.0, 0.11, 'pr_brick_chunk', mx=trans(-0.9, -0.3, 0.06) @ rotz(0.6), bevel=0.01)
        m.box(-0.12, 0.12, -0.06, 0.06, 0.0, 0.11, 'pr_brick_chunk', mx=trans(0.95, -0.35, 0.06) @ rotz(-0.4) @ rotx(0.2), bevel=0.01)
    elif kind == 1:       # a crumbling brick wall stub with a heap of loose bricks
        for row in range(7):
            z = row * 0.16
            n = 6 - (row // 3)
            for i in range(n):
                x = -0.5 + i * 0.3 + (0.15 if row % 2 else 0.0) - (0.15 * (row // 3))
                if row >= 5 and i % 2:
                    continue
                m.box(x - 0.14, x + 0.14, -0.1, 0.1, z, z + 0.15, 'pr_brick_chunk' if (row + i) % 3 else 'pr_brick_dark', bevel=0.012)
        for i in range(22):
            a = r.uniform(0, 2 * PI)
            d = r.uniform(0.3, 1.2)
            x, y = math.cos(a) * d * 1.15, math.sin(a) * d * 0.55 - 0.45
            m.box(-0.14, 0.14, -0.07, 0.07, 0.0, 0.13, 'pr_brick_chunk' if i % 3 else 'pr_brick_dark',
                  mx=trans(x, y, 0.08 + (0.12 if d < 0.6 else 0.0)) @ rotz(r.uniform(0, PI)) @ rotx(r.uniform(-0.35, 0.35)), bevel=0.012)
        shaded_rock(m, (0.75, 0.2, 0.2), (0.3, 0.25, 0.2), C3, seed=77, n=10, jitter=0.2)
    else:                 # a broken slab propped on blocks, torn rebar mesh sticking out of its edge
        shaded_rock(m, (-0.95, -0.3, 0.26), (0.34, 0.3, 0.26), C3, seed=51, n=12, jitter=0.18, bevel=0.03)
        shaded_rock(m, (0.95, -0.2, 0.22), (0.3, 0.28, 0.22), C3, seed=52, n=12, jitter=0.18, bevel=0.03)
        slab = Mesh('slab')
        slab.box(-1.1, 1.1, -0.55, 0.55, -0.1, 0.1, 'pr_concrete', bevel=0.03)
        slab.box(-1.1, -0.3, -0.56, -0.2, 0.1, 0.11, 'pr_concrete_lo', bevel=0.02)
        for x in (-0.8, -0.4, 0.0, 0.4, 0.8):
            slab.cyl((x, -0.5, 0.0), (x + 0.05, -0.95, 0.12 + 0.1 * (x > 0)), 0.03, 0.03, 'pr_rebar', seg=6)
        m.add(slab, trans(0.0, 0.1, 0.62) @ rotx(0.5) @ rotz(0.3))
        for i in range(8):
            shaded_rock(m, (r.uniform(-1.1, 1.1), r.uniform(-0.9, -0.4), 0.14), (0.2, 0.16, 0.13), C3, seed=60 + i, n=9, jitter=0.2)
    return m


def sandbags():
    m = Mesh('sandbags')
    r = random.Random(5)
    rows = [(0.2, [-1.2, -0.4, 0.4, 1.2]), (0.5, [-0.8, 0.0, 0.8]), (0.8, [-0.4, 0.4]), (1.08, [0.0])]
    for ri, (z, xs) in enumerate(rows):
        for ci, x in enumerate(xs):
            jx, jr = r.uniform(-0.05, 0.05), r.uniform(-0.1, 0.1)
            mat = 'pr_sand' if (ri + ci) % 2 == 0 else 'pr_sand_lo'
            m.ball((x + jx, 0, z), (0.46, 0.3, 0.2), mat, seg=14, rings=8, rot=rotz(jr))
            m.box(-0.05, 0.05, -0.2, 0.2, -0.04, 0.04, 'pr_sand_lo', mx=trans(x + jx + 0.44, 0, z - 0.03) @ rotz(jr), bevel=0.01)   # tied end
            m.tube([(x + jx - 0.3, -0.27, z + 0.02), (x + jx, -0.29, z + 0.05), (x + jx + 0.3, -0.27, z + 0.02)], 0.012, 'pr_sand_seam', seg=4)
    return m


def trash_bags():
    m = Mesh('trash')
    bags = [(-0.45, 0.0, 0.0, 0.42, 'pr_trash_black'), (0.35, 0.15, 0.0, 0.4, 'pr_trash_green'), (0.0, -0.45, 0.0, 0.36, 'pr_trash_white'),
            (-0.1, 0.1, 0.55, 0.34, 'pr_trash_black'), (0.62, -0.35, 0.0, 0.28, 'pr_trash_black')]
    for x, y, z0, r, c in bags:
        m.ball((x, y, z0 + r * 0.82), (r, r * 0.95, r * 0.85), c, seg=14, rings=8)
        m.cyl((x, y, z0 + r * 1.5), (x, y, z0 + r * 1.78), r * 0.18, r * 0.28, c, seg=8, smooth=60.0)     # gathered neck
        m.ball((x, y, z0 + r * 1.82), (r * 0.2, r * 0.2, r * 0.16), c, seg=8, rings=5)
    # a few strays: a can and a bone
    m.cyl((-0.85, -0.3, 0.0), (-0.85, -0.3, 0.16), 0.06, 0.06, 'pr_steel', seg=10, mx=rotx(0.0))
    return m


def fence():
    m = Mesh('fence')
    L = 2.6
    for x in (-L / 2 + 0.06, 0.0, L / 2 - 0.06):
        m.box(x - 0.07, x + 0.07, -0.07, 0.07, 0.0, 1.25, 'pr_picket_dark', bevel=0.012)
        m.prism([(-0.1, 1.22), (0.1, 1.22), (0.0, 1.36)], -0.1, 0.1, 'pr_picket_dark', mx=trans(x, 0, 0))
    for z in (0.35, 0.85):
        m.box(-L / 2, L / 2, 0.07, 0.15, z - 0.06, z + 0.06, 'pr_picket_dark', bevel=0.01)
    n = 12
    for i in range(n):
        x = -L / 2 + 0.11 + i * (L - 0.22) / (n - 1)
        h = 1.0
        if i == 5:
            continue
        mx = trans(x, -0.0, 0.0)
        if i == 7:                                # a broken board hanging by one nail
            m.prism([(-0.07, 0.0), (0.07, 0.0), (0.07, 0.55), (0.02, 0.7), (-0.03, 0.5), (-0.07, 0.62)], -0.025, 0.025, 'pr_picket', mx=mx @ rotz(0.0), bevel=0.006)
            continue
        m.prism([(-0.075, 0.0), (0.075, 0.0), (0.075, h), (0.0, h + 0.1), (-0.075, h)], -0.025, 0.025, 'pr_picket', mx=mx @ rotz(0.0), bevel=0.006)
    return m


# ------------------------------------------------------------------------------------------------ buildings
# Roadside buildings face the camera: the front wall is the plane y = 0 (the pivot is the middle of its foot) and the block runs
# back to y = depth. Windows, shopfronts, signs and rooftop gear are boxes in a handful of colours so a chapter can restyle them.

def _building_materials():
    d = mats.define
    d('pr_brick', base='#bd5238', base2='#8f3b2b', pattern='stripes', pscale=26, pamt=0.3, bevel=0.01, bump=0.25, seed=111)
    d('pr_brick_dark', base='#8d3b2b', base2='#6a2a1f', pattern='noise', pscale=8, pamt=0.5, bevel=0.01, seed=112)
    d('pr_plaster_cream', base='#f6e4b4', base2='#dcc58d', pattern='noise', pscale=3, pamt=0.35, bevel=0.01, bump=0.15, seed=113)
    d('pr_plaster_teal', base='#5cc3c9', base2='#3fa0aa', pattern='noise', pscale=3, pamt=0.35, bevel=0.01, bump=0.15, seed=114)
    d('pr_plaster_grey', base='#a9b8cc', base2='#8496ae', pattern='noise', pscale=3, pamt=0.35, bevel=0.01, bump=0.15, seed=115)
    d('pr_stone', base='#cfc6b6', base2='#a79e8e', pattern='noise', pscale=5, pamt=0.5, bevel=0.015, bump=0.3, seed=116)
    d('pr_trim', base='#fff7e8', bevel=0.012)
    d('pr_trim_dark', base='#343846', bevel=0.012)
    d('pr_roof_tar', base='#5e6370', base2='#444955', pattern='noise', pscale=4, pamt=0.5, bevel=0.01, bump=0.3, seed=117)
    d('pr_win_dark', base='#2b4b6c', base2='#4a7fa8', pattern='noise', pscale=2, pamt=0.45, bevel=0.005, seed=118)
    d('pr_win_lit', base='#ffd46a', base2='#ffefa6', pattern='noise', pscale=3, pamt=0.4, emit=0.9, bevel=0.005, seed=119)
    d('pr_win_blue', base='#7fd6ff', emit=0.8, bevel=0.005)
    d('pr_curtain_pink', base='#ff8fb8', emit=0.6, bevel=0.01)
    d('pr_curtain_blue', base='#86b4ff', emit=0.6, bevel=0.01)
    d('pr_awn_red', base='#e63946', bevel=0.012)
    d('pr_awn_white', base='#fbf3e6', bevel=0.012)
    d('pr_awn_green', base='#2fa84f', bevel=0.012)
    d('pr_sign_dark', base='#262a35', bevel=0.012)
    d('pr_neon_pink', base='#ff4fa8', emit=1.0, bevel=0.01)
    d('pr_neon_cyan', base='#4ff0ff', emit=1.0, bevel=0.01)
    d('pr_neon_yellow', base='#ffe23a', emit=1.0, bevel=0.01)
    d('pr_neon_white', base='#fffbe8', emit=1.0, bevel=0.01)
    d('pr_door_wood', base='#8a5230', base2='#6a3c20', pattern='stripes', pscale=10, pamt=0.4, bevel=0.012, seed=120)
    d('pr_tank_wood', base='#a8733b', base2='#7f5226', pattern='noise', pscale=6, pamt=0.5, bevel=0.015, seed=121)
    d('pr_roof_rust', base='#8b4b2c', base2='#6a3a22', pattern='noise', pscale=8, pamt=0.5, bevel=0.015, seed=122)
    d('pr_shop_warm', base='#ffe0a0', base2='#ffc878', pattern='noise', pscale=2, pamt=0.5, emit=0.75, bevel=0.005, seed=123)


_building_materials()

# 3 x 5 pixel font for neon signs, one row per string, '1' = lit
FONT = {
    'A': ('010', '101', '111', '101', '101'), 'B': ('110', '101', '110', '101', '110'), 'C': ('011', '100', '100', '100', '011'),
    'D': ('110', '101', '101', '101', '110'), 'E': ('111', '100', '110', '100', '111'), 'F': ('111', '100', '110', '100', '100'),
    'G': ('011', '100', '101', '101', '011'), 'H': ('101', '101', '111', '101', '101'), 'I': ('111', '010', '010', '010', '111'),
    'K': ('101', '101', '110', '101', '101'), 'L': ('100', '100', '100', '100', '111'), 'M': ('101', '111', '111', '101', '101'),
    'N': ('110', '101', '101', '101', '101'), 'O': ('010', '101', '101', '101', '010'), 'P': ('110', '101', '110', '100', '100'),
    'R': ('110', '101', '110', '101', '101'), 'S': ('011', '100', '010', '001', '110'), 'T': ('111', '010', '010', '010', '010'),
    'U': ('101', '101', '101', '101', '111'), 'Z': ('111', '001', '010', '100', '111'), '2': ('110', '001', '010', '100', '111'),
    '4': ('101', '101', '111', '001', '001'), ' ': ('000', '000', '000', '000', '000'), '+': ('000', '010', '111', '010', '000'),
}


def text(m, s, cx, cz, y, cell, mat, depth=0.1, gap=1):
    """Pixel lettering on a front face: s centred at (cx, cz), letters facing -Y standing off the wall at y."""
    n = len(s)
    total = n * 3 + (n - 1) * gap
    x0 = cx - total * cell / 2
    for ci, ch in enumerate(s):
        g = FONT.get(ch, FONT[' '])
        for r, row in enumerate(g):
            c = 0
            while c < 3:
                if row[c] == '1':
                    e = c
                    while e + 1 < 3 and row[e + 1] == '1':
                        e += 1
                    xa = x0 + (ci * (3 + gap) + c) * cell
                    xb = x0 + (ci * (3 + gap) + e + 1) * cell
                    za = cz + (2 - r) * cell - cell * 0.5
                    m.box(xa, xb, y - depth, y, za, za + cell, mat, bevel=cell * 0.08)
                    c = e + 1
                else:
                    c += 1


def window(m, x, z, w, h, lit=0, curtain=None, y=0.0, frame='pr_trim', sill=True, shutters=None, planter=False, rng=None):
    """A framed window centred at x with its bottom at z: glass (dark, lit, or lit behind a curtain), frame bars, sill, lintel."""
    glass = 'pr_win_lit' if lit else 'pr_win_dark'
    m.box(x - w / 2, x + w / 2, y - 0.05, y + 0.01, z, z + h, glass)
    if lit and curtain:
        m.box(x - w / 2, x - w * 0.12, y - 0.07, y - 0.03, z, z + h * 0.92, curtain, bevel=0.01)
        m.box(x + w * 0.12, x + w / 2, y - 0.07, y - 0.03, z, z + h * 0.92, curtain, bevel=0.01)
    t = 0.08
    for xa, xb, za, zb in ((x - w / 2 - t, x + w / 2 + t, z - t, z), (x - w / 2 - t, x + w / 2 + t, z + h, z + h + t),
                           (x - w / 2 - t, x - w / 2, z, z + h), (x + w / 2, x + w / 2 + t, z, z + h)):
        m.box(xa, xb, y - 0.12, y, za, zb, frame, bevel=0.012)
    m.box(x - 0.025, x + 0.025, y - 0.1, y - 0.02, z, z + h, frame)
    m.box(x - w / 2, x + w / 2, y - 0.1, y - 0.02, z + h * 0.58, z + h * 0.58 + 0.05, frame)
    if sill:
        m.box(x - w / 2 - 0.16, x + w / 2 + 0.16, y - 0.3, y, z - 0.17, z - 0.07, 'pr_stone', bevel=0.02)
        m.box(x - w / 2 - 0.14, x + w / 2 + 0.14, y - 0.18, y, z + h + 0.07, z + h + 0.19, 'pr_stone', bevel=0.02)
    if shutters:
        for sx in (-1, 1):
            m.box(x + sx * (w / 2 + 0.1 + 0.2) - 0.2, x + sx * (w / 2 + 0.1 + 0.2) + 0.2, y - 0.1, y, z - 0.05, z + h + 0.05, shutters, bevel=0.015)
            for k in range(4):
                zz = z + 0.18 + k * (h - 0.3) / 3
                m.box(x + sx * (w / 2 + 0.3) - 0.17, x + sx * (w / 2 + 0.3) + 0.17, y - 0.13, y - 0.1, zz, zz + 0.03, 'pr_trim_dark')
    if planter:
        m.box(x - w / 2 - 0.05, x + w / 2 + 0.05, y - 0.46, y - 0.06, z - 0.5, z - 0.17, 'pr_door_wood', bevel=0.02)
        rr = rng or random.Random(1)
        for k in range(7):
            px = x - w / 2 + (k + 0.5) * w / 7
            m.ball((px, y - 0.28, z - 0.12 + rr.uniform(0, 0.08)), (0.09, 0.09, 0.09), 'pr_leaf_bush', seg=8, rings=5)
            m.ball((px + rr.uniform(-0.03, 0.03), y - 0.33, z + 0.0 + rr.uniform(0, 0.1)), (0.06, 0.06, 0.06), rr.choice(['pr_flower_pink', 'pr_flower_yellow', 'pr_flower_white']), seg=6, rings=4)


def awning(m, x0, x1, ztop, mat_a, mat_b, depth=1.1, drop=0.55, stripe=0.38, y=0.0):
    """A sloping striped awning over a shopfront: top edge at the wall (ztop), front edge `drop` lower, alternating stripes."""
    prof = [(y, ztop), (y - depth, ztop - drop), (y - depth, ztop - drop - 0.28), (y, ztop - 0.12)]
    base = planes_yz(prof)
    n = int(math.ceil((x1 - x0) / stripe))
    for i in range(n):
        xa, xb = x0 + i * stripe, min(x1, x0 + (i + 1) * stripe)
        m.convex(base + [((1, 0, 0), xb), ((-1, 0, 0), -xa)], mat_a if i % 2 == 0 else mat_b, bevel=0.01)
    m.box(x0, x1, y - depth - 0.03, y - depth + 0.0, ztop - drop - 0.3, ztop - drop - 0.26, 'pr_trim_dark')


def door(m, x, w=1.1, h=2.3, y=0.0, mat='pr_door_wood', glass=True):
    m.box(x - w / 2 - 0.1, x + w / 2 + 0.1, y - 0.14, y, 0.0, h + 0.1, 'pr_trim', bevel=0.015)
    m.box(x - w / 2, x + w / 2, y - 0.18, y - 0.06, 0.0, h, mat, bevel=0.015)
    if glass:
        m.box(x - w * 0.34, x + w * 0.34, y - 0.2, y - 0.17, h * 0.45, h * 0.88, 'pr_win_dark')
    m.sphere((x + w * 0.36, y - 0.22, h * 0.45), 0.04, 'pr_chest_gold', seg=8)
    m.box(x - w / 2 - 0.25, x + w / 2 + 0.25, y - 0.65, y, 0.0, 0.12, 'pr_stone', bevel=0.02)                     # doorstep


def ac_unit(m, x, y, z, w=1.1, d=0.8, h=0.7):
    m.box(x - w / 2, x + w / 2, y - d / 2, y + d / 2, z, z + h, 'pr_steel', bevel=0.03)
    m.cyl((x, y, z + h), (x, y, z + h + 0.03), 0.3, 0.3, 'pr_iron', seg=14)
    m.box(x - w / 2 + 0.06, x + w / 2 - 0.06, y - d / 2 - 0.02, y - d / 2 + 0.0, z + 0.1, z + h - 0.12, 'pr_steel_dark')
    for k in range(4):
        zz = z + 0.16 + k * 0.1
        m.box(x - w / 2 + 0.08, x + w / 2 - 0.08, y - d / 2 - 0.04, y - d / 2 - 0.01, zz, zz + 0.03, 'pr_steel')


def skylight(m, x, y, z, w=1.6, d=1.1):
    m.box(x - w / 2, x + w / 2, y - d / 2, y + d / 2, z, z + 0.3, 'pr_trim', bevel=0.03)
    m.box(x - w / 2 + 0.12, x + w / 2 - 0.12, y - d / 2 + 0.1, y + d / 2 - 0.1, z + 0.3, z + 0.34, 'pr_win_blue')
    m.box(x - 0.03, x + 0.03, y - d / 2 + 0.1, y + d / 2 - 0.1, z + 0.34, z + 0.38, 'pr_trim')


def water_tank(m, x, y, z, r=0.95, h=1.5):
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box(x + sx * r * 0.7 - 0.06, x + sx * r * 0.7 + 0.06, y + sy * r * 0.7 - 0.06, y + sy * r * 0.7 + 0.06, z, z + 0.9, 'pr_iron')
    m.box(x - r * 0.95, x + r * 0.95, y - r * 0.95, y + r * 0.95, z + 0.85, z + 0.95, 'pr_iron')
    m.lathe([(0.0, r), (h, r)], 'pr_tank_wood', mx=trans(x, y, z + 0.95), seg=16, smooth=30.0, cap=True)
    for zz in (0.25, 0.75, 1.25):
        m.lathe([(zz - 0.04, r * 1.015), (zz + 0.04, r * 1.015)], 'pr_iron', mx=trans(x, y, z + 0.95), seg=16, smooth=30.0, cap=False)
    m.lathe([(h, r * 1.08), (h + 0.55, 0.0)], 'pr_roof_rust', mx=trans(x, y, z + 0.95), seg=16, smooth=30.0, cap=True)


def parapet(m, W, D, z, h=0.55, t=0.28, mat='pr_stone', over=0.1):
    m.box(-W / 2 - over, W / 2 + over, -over, t, z, z + h, mat, bevel=0.02)
    m.box(-W / 2 - over, W / 2 + over, D - t, D + over, z, z + h, mat, bevel=0.02)
    for sx in (-1, 1):
        xa, xb = (-W / 2 - over, -W / 2 - over + t) if sx < 0 else (W / 2 + over - t, W / 2 + over)
        m.box(xa, xb, -over, D + over, z, z + h, mat, bevel=0.02)
    m.box(-W / 2 - over - 0.05, W / 2 + over + 0.05, -over - 0.06, t * 0.4, z + h - 0.06, z + h + 0.06, 'pr_trim', bevel=0.02)       # coping on the front


def shell(m, W, D, H, wall, plinth=0.45, cornice=0.3):
    m.box(-W / 2, W / 2, 0.0, D, 0.0, H, wall, bevel=0.03)
    m.box(-W / 2 - 0.06, W / 2 + 0.06, -0.06, D, 0.0, plinth, 'pr_stone', bevel=0.03)
    m.box(-W / 2 - 0.15, W / 2 + 0.15, -0.2, D, H - cornice, H, 'pr_trim', bevel=0.03)
    m.box(-W / 2 + 0.05, W / 2 - 0.05, 0.25, D - 0.25, H - 0.02, H + 0.04, 'pr_roof_tar')


def storefront(m, x0, x1, z0, z1, y=0.0, glass='pr_shop_warm', frame='pr_trim_dark', rng=None):
    """A big shop window: glowing interior, a few shelves of goods, thick frame and a low stall riser."""
    m.box(x0, x1, y - 0.05, y + 0.01, z0, z1, glass)
    rr = rng or random.Random(2)
    n = int((x1 - x0) / 0.45)
    for k in range(n):
        gx = x0 + 0.25 + k * (x1 - x0 - 0.5) / max(1, n - 1)
        hh = rr.uniform(0.25, 0.55)
        m.box(gx - 0.14, gx + 0.14, y - 0.12, y - 0.04, z0 + 0.0, z0 + hh, rr.choice(['pr_awn_red', 'pr_awn_green', 'pr_sign_blue', 'pr_flower_yellow', 'pr_flower_pink']), bevel=0.02)
    t = 0.1
    for xa, xb, za, zb in ((x0 - t, x1 + t, z0 - 0.25, z0), (x0 - t, x1 + t, z1, z1 + t), (x0 - t, x0, z0, z1), (x1, x1 + t, z0, z1)):
        m.box(xa, xb, y - 0.14, y, za, zb, frame, bevel=0.015)
    for xm in (x0 + (x1 - x0) / 3, x0 + 2 * (x1 - x0) / 3):
        m.box(xm - 0.04, xm + 0.04, y - 0.12, y - 0.02, z0, z1, frame)


def building(kind):
    m = Mesh('building')
    r = random.Random(200 + kind)
    if kind == 0:
        # two-storey brick shop row: bakery on the left, cafe on the right
        W, D, H = 10.6, 3.6, 6.6
        shell(m, W, D, H, 'pr_brick')
        storefront(m, -4.9, -1.4, 0.6, 2.9, rng=r)
        awning(m, -5.1, -1.2, 3.35, 'pr_awn_red', 'pr_awn_white')
        door(m, 0.5, 1.2, 2.35)
        storefront(m, 1.9, 4.9, 0.6, 2.9, rng=r)
        awning(m, 1.7, 5.1, 3.35, 'pr_awn_green', 'pr_awn_white')
        m.box(-5.0, -1.3, -0.1, 0.0, 3.5, 4.1, 'pr_sign_dark', bevel=0.02)                  # sign boards
        m.box(1.8, 5.0, -0.1, 0.0, 3.5, 4.1, 'pr_sign_dark', bevel=0.02)
        text(m, 'SHOP', -3.15, 3.8, -0.1, 0.12, 'pr_neon_yellow')
        text(m, 'CAFE', 3.4, 3.8, -0.1, 0.12, 'pr_neon_cyan')
        xs = (-4.0, -1.35, 1.35, 4.0)
        for i, x in enumerate(xs):
            window(m, x, 4.6, 1.3, 1.6, lit=1 if i in (0, 2, 3) else 0, curtain='pr_curtain_pink' if i == 2 else None, shutters='pr_awn_green' if i in (0, 3) else None,
                   planter=i in (1, 2), rng=r)
        ac_unit(m, -3.2, 2.3, H + 0.05)
        ac_unit(m, 1.9, 2.4, H + 0.05, 1.3, 0.9, 0.85)
        skylight(m, -0.9, 2.1, H + 0.05)
        parapet(m, W, D, H)
        m.box(3.4, 4.4, 2.2, 3.2, H, H + 1.7, 'pr_brick_dark', bevel=0.03)                  # chimney
        m.box(3.3, 4.5, 2.1, 3.3, H + 1.7, H + 1.85, 'pr_stone', bevel=0.02)
        m.cyl((-0.6, 2.6, H), (-0.6, 2.6, H + 0.9), 0.14, 0.14, 'pr_steel', seg=10)
        m.cyl((-0.6, 2.6, H + 0.9), (-0.6, 2.6, H + 1.0), 0.24, 0.24, 'pr_steel', seg=10)
        m.cyl((W / 2 - 0.35, 0.1, 0.4), (W / 2 - 0.35, 0.1, H - 0.4), 0.09, 0.09, 'pr_steel', seg=8)   # drainpipe
    elif kind == 1:
        # three-storey cream apartment block with balconies and a rooftop water tank
        W, D, H = 9.4, 3.8, 9.0
        shell(m, W, D, H, 'pr_plaster_cream')
        door(m, 0.0, 1.5, 2.5)
        m.box(-1.5, 1.5, -1.1, 0.0, 2.85, 3.0, 'pr_awn_red', bevel=0.02)
        m.box(-1.5, 1.5, -1.12, -1.05, 2.55, 3.0, 'pr_awn_red', bevel=0.015)
        for x in (-3.4, 3.4):
            storefront(m, x - 1.1, x + 1.1, 0.8, 2.5, rng=r)
        for fl, (z0, lits) in enumerate(((4.1, (1, 0, 1, 1, 0)), (6.7, (0, 1, 1, 0, 1)))):
            for i, x in enumerate((-3.6, -1.8, 0.0, 1.8, 3.6)):
                if i == 2:
                    # a balcony door and railing in the middle
                    m.box(x - 0.6, x + 0.6, -0.07, 0.01, z0, z0 + 1.9, 'pr_win_lit' if lits[i] else 'pr_win_dark')
                    for xa, xb, za, zb in ((x - 0.68, x + 0.68, z0 - 0.08, z0), (x - 0.68, x + 0.68, z0 + 1.9, z0 + 1.98), (x - 0.68, x - 0.6, z0, z0 + 1.9), (x + 0.6, x + 0.68, z0, z0 + 1.9)):
                        m.box(xa, xb, -0.12, 0.0, za, zb, 'pr_trim', bevel=0.012)
                    dep = 0.2 if fl == 0 else 1.0                      # the lower one is a flush Juliet rail, the upper a real balcony
                    m.box(x - 1.15, x + 1.15, -dep, 0.0, z0 - 0.3, z0 - 0.1, 'pr_stone', bevel=0.02)
                    for k in range(9):
                        bx = x - 1.05 + k * 0.26
                        m.box(bx - 0.02, bx + 0.02, -dep + 0.02, -dep + 0.06, z0 - 0.1, z0 + 0.7, 'pr_trim_dark')
                    m.box(x - 1.15, x + 1.15, -dep - 0.02, -dep + 0.08, z0 + 0.66, z0 + 0.74, 'pr_trim_dark', bevel=0.01)
                    for sx in (-1, 1):
                        m.box(x + sx * 1.1 - 0.02, x + sx * 1.1 + 0.02, -dep - 0.02, 0.0, z0 - 0.1, z0 + 0.7, 'pr_trim_dark')
                    if fl == 1:
                        m.ball((x - 0.7, -0.6, z0 + 0.08), (0.2, 0.2, 0.12), 'pr_pot')
                        m.ball((x - 0.7, -0.6, z0 + 0.3), (0.22, 0.22, 0.2), 'pr_leaf_bush')
                else:
                    window(m, x, z0 + 0.2, 1.1, 1.5, lit=lits[i], curtain=('pr_curtain_blue' if (i + fl) % 2 else 'pr_curtain_pink') if lits[i] else None,
                           shutters='pr_door_wood', rng=r)
        for x in (-3.4, 3.4):
            ac_unit(m, x, -0.35, 2.9, 0.9, 0.6, 0.6)
        ac_unit(m, -1.0, 1.8, H + 0.05)
        skylight(m, -2.6, 2.4, H + 0.05, 1.3, 1.0)
        water_tank(m, 2.6, 2.4, H + 0.05)
        m.cyl((-3.4, 3.0, H), (-3.4, 3.0, H + 2.4), 0.04, 0.03, 'pr_steel', seg=6)                               # antenna
        for k in range(3):
            m.box(-3.7, -3.1, 2.95, 3.05, H + 0.9 + k * 0.5, H + 0.95 + k * 0.5, 'pr_steel')
        parapet(m, W, D, H)
    elif kind == 2:
        # blue-green corner diner with a big neon sign on the roof
        W, D, H = 9.2, 3.6, 6.0
        shell(m, W, D, H, 'pr_plaster_teal')
        storefront(m, -4.2, -0.9, 0.5, 2.8, rng=r)
        storefront(m, 0.2, 2.9, 0.5, 2.8, rng=r)
        door(m, 3.8, 1.1, 2.3)
        awning(m, -4.5, 3.2 + 1.2, 3.4, 'pr_awn_white', 'pr_awn_green', stripe=0.45)
        for i, x in enumerate((-3.4, -1.1, 1.1, 3.4)):
            window(m, x, 3.9, 1.2, 1.4, lit=(1, 0, 1, 1)[i], curtain='pr_curtain_pink' if i == 0 else None, planter=i == 3, rng=r)
        for x in (-2.2, 2.2):
            ac_unit(m, x, -0.3, 3.45, 0.8, 0.55, 0.55)
        # roof sign: a dark board on posts, neon text and a border
        sz = H + 0.2
        for sx in (-1, 1):
            m.box(sx * 3.4 - 0.1, sx * 3.4 + 0.1, 0.4, 0.6, H, sz + 0.9, 'pr_steel_dark', bevel=0.01)
        m.box(-4.2, 4.2, 0.35, 0.65, sz + 0.7, sz + 2.6, 'pr_sign_dark', bevel=0.04)
        for xa, xb, za, zb in ((-4.05, 4.05, sz + 0.78, sz + 0.86), (-4.05, 4.05, sz + 2.44, sz + 2.52), (-4.05, -3.97, sz + 0.78, sz + 2.52), (3.97, 4.05, sz + 0.78, sz + 2.52)):
            m.box(xa, xb, 0.25, 0.35, za, zb, 'pr_neon_cyan')
        text(m, 'DINER', 0.0, sz + 1.65, 0.27, 0.19, 'pr_neon_pink', depth=0.14)
        ac_unit(m, -3.0, 2.8, H + 0.05, 1.3, 0.9, 0.8)
        ac_unit(m, 3.2, 2.9, H + 0.05)
        m.cyl((1.0, 3.0, H), (1.0, 3.0, H + 0.8), 0.3, 0.3, 'pr_steel', seg=12)
        m.lathe([(H + 0.8, 0.34), (H + 1.0, 0.0)], 'pr_steel_dark', mx=trans(1.0, 3.0, 0), seg=12, smooth=30.0, cap=False)
        parapet(m, W, D, H)
    else:
        # grey-blue four-storey hotel tower with a lit window grid and a rooftop antenna mast
        W, D, H = 8.4, 3.4, 8.8
        shell(m, W, D, H, 'pr_plaster_grey')
        door(m, 0.0, 2.0, 2.5, glass=True)
        m.box(-2.2, 2.2, -1.6, 0.0, 3.0, 3.18, 'pr_awn_red', bevel=0.03)
        m.box(-2.2, 2.2, -1.62, -1.5, 2.55, 3.0, 'pr_awn_red', bevel=0.02)
        for x in (-3.0, 3.0):
            storefront(m, x - 1.0, x + 1.0, 0.8, 2.6, rng=r)
        for fl in range(3):
            z0 = 3.55 + fl * 1.6
            for i, x in enumerate((-3.2, -1.6, 0.0, 1.6, 3.2)):
                lit = 1 if r.random() < 0.55 else 0
                window(m, x, z0, 0.95, 1.2, lit=lit, curtain=('pr_curtain_pink' if r.random() < 0.5 else 'pr_curtain_blue') if lit and r.random() < 0.5 else None, sill=True)
        text(m, 'HOTEL', 0.0, 2.78, -1.62, 0.085, 'pr_neon_white', depth=0.06)
        ac_unit(m, -2.4, 2.4, H + 0.05, 1.3, 0.9, 0.8)
        ac_unit(m, 1.0, 2.0, H + 0.05)
        m.box(2.4, 3.6, 2.2, 3.4, H, H + 0.9, 'pr_stone', bevel=0.03)                                     # lift motor room
        m.box(2.3, 3.7, 2.1, 3.5, H + 0.9, H + 1.0, 'pr_trim', bevel=0.02)
        m.cyl((-3.0, 3.0, H), (-3.0, 3.0, H + 2.3), 0.07, 0.04, 'pr_steel', seg=6)                         # antenna mast
        m.sphere((-3.0, 3.0, H + 2.4), 0.12, 'pr_light_red', seg=8)
        for k in range(4):
            m.box(-3.4, -2.6, 2.94, 3.06, H + 0.8 + k * 0.5, H + 0.84 + k * 0.5, 'pr_steel')
        parapet(m, W, D, H)
    return m


# ------------------------------------------------------------------------------------------------ frames (batch 1)

def build(ctx):
    one(ctx, 'barrel', barrel)
    one(ctx, 'barrel_lid', barrel_lid)
    for i in range(3):
        one(ctx, 'barrel_shard_%d' % i, lambda i=i: barrel_shard(i))
    one(ctx, 'fire_barrel', fire_barrel)
    one(ctx, 'chest_closed', lambda: chest(False))
    one(ctx, 'chest_open', lambda: chest(True))
    one(ctx, 'cone', cone)
    one(ctx, 'hydrant', hydrant)
    one(ctx, 'tyre', tyre)
    one(ctx, 'sawhorse', sawhorse)
    one(ctx, 'barrier', barrier)
    one(ctx, 'crate', crate)
    for i in range(3):
        one(ctx, 'car_%d' % i, lambda i=i: car_wreck(i))
    one(ctx, 'police_car', lambda: car_wreck(3))
    one(ctx, 'bus', lambda: bus_wreck())
    for i in range(3):
        one(ctx, 'tree_%d' % i, lambda i=i: tree(i))
    for i in range(2):
        one(ctx, 'bush_%d' % i, lambda i=i: bush(i))
    one(ctx, 'lamp_post', lamp_post)
    one(ctx, 'bench', bench)
    one(ctx, 'dumpster', dumpster)
    one(ctx, 'bus_stop', bus_stop)
    for i in range(3):
        one(ctx, 'rubble_%d' % i, lambda i=i: rubble(i))
    one(ctx, 'sandbags', sandbags)
    one(ctx, 'trash_bags', trash_bags)
    one(ctx, 'fence', fence)
    for i in range(4):
        one(ctx, 'building_%d' % i, lambda i=i: building(i))
    # numbers the game needs: footprints (game units) for blocking props, and glow / flame points (screen offsets from the pivot)
    u = bl.UNITS_PER_M
    for name, r in (('barrel', BR), ('fire_barrel', 0.38), ('crate', 0.62), ('hydrant', 0.28), ('cone', 0.22), ('lamp_post', 0.18),
                    ('trash_bags', 0.7), ('tyre', 0.4), ('sandbags', 1.2), ('barrier', 1.3), ('bench', 0.95), ('dumpster', 1.1)):
        ctx.value('radius', name, round(r * u, 1))
    ctx.value('halfwidth', 'barrier', round(1.3 * u, 1))
    ctx.value('halfwidth', 'sandbags', round(1.2 * u, 1))
    ctx.anchor('flame', 'fire_barrel', (0.0, 0.0, 1.1))
    ctx.anchor('glow', 'lamp_post', (1.25, 0.0, 5.16))
    ctx.anchor('glow', 'chest_open', (0.0, 0.0, 0.62))


def bus_wreck():
    m = bus_build()
    # the missing wheel lets the nose sag and lean toward the near side
    m.transform(trans(0, 0, 0.0))
    m.transform(rotx(-0.07) @ roty(-0.035))
    m.transform(rotz(-PI / 2 + 0.3))
    sit(m)
    return m
