"""Shared helpers for the Toy Tanks Blender scripts (run inside Blender, headless).

Everything is modelled in millimetres (1 unit = 1 mm) so the small bevels stay well clear of Blender's
float tolerances, and scaled by 0.001 when a mesh becomes an object. The tank faces +X, +Z is up, +Y is the
tank's left. Blender's glTF exporter turns that into +Y up with the tank still facing +X.

Parts are built as small bmeshes (one material each), bevelled, then merged into the mesh of a node.
"""
import math
import os
import sys
import bmesh
import bpy
from math import pi, sin, cos, radians
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

MM = 0.001
PAINT, RUBBER, HUB, STAR, METAL = 0, 1, 2, 3, 4
MAT_NAMES = ['paint', 'rubber', 'hub', 'star', 'metal']


# --------------------------------------------------------------------------------------- scene and materials

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    return sc


def make_materials():
    """Five solid materials with the exact names the game looks for. Paint is a white base that the game tints."""
    defs = {
        'paint': dict(color=(0.88, 0.88, 0.88), rough=0.30, coat=1.0, coat_rough=0.04, metal=0.0, sheen=0.4),
        'rubber': dict(color=(0.012, 0.012, 0.014), rough=0.78, coat=0.0, coat_rough=0.3, metal=0.0, sheen=0.3),
        'hub': dict(color=(0.085, 0.09, 0.10), rough=0.42, coat=0.25, coat_rough=0.2, metal=0.0, sheen=0.0),
        'star': dict(color=(0.93, 0.93, 0.90), rough=0.32, coat=0.6, coat_rough=0.05, metal=0.0, sheen=0.0),
        'metal': dict(color=(0.78, 0.79, 0.82), rough=0.28, coat=0.0, coat_rough=0.2, metal=1.0, sheen=0.0),
    }
    mats = []
    for name in MAT_NAMES:
        d = defs[name]
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*d['color'], 1.0)
        b.inputs['Roughness'].default_value = d['rough']
        b.inputs['Metallic'].default_value = d['metal']
        b.inputs['Coat Weight'].default_value = d['coat']
        b.inputs['Coat Roughness'].default_value = d['coat_rough']
        b.inputs['Sheen Weight'].default_value = d['sheen']
        m.diffuse_color = (*d['color'], 1.0)
        mats.append(m)
    return mats


# --------------------------------------------------------------------------------------- bmesh part builders

def bm_new():
    return bmesh.new()


def set_mat(bm, idx):
    for f in bm.faces:
        f.material_index = idx
    return bm


def xform(bm, m):
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


def translate(bm, x, y, z):
    return xform(bm, Matrix.Translation((x, y, z)))


def mirror_y(bm):
    """Flip the part to the other side of the tank (keeps faces pointing outwards)."""
    xform(bm, Matrix.Diagonal((1, -1, 1, 1)))
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return bm


def merge(dst, src, matrix=None):
    """Copy src into dst (optionally transformed). Keeps material, smooth flags and sharp edges."""
    vm = {}
    for v in src.verts:
        co = matrix @ v.co if matrix is not None else v.co.copy()
        vm[v] = dst.verts.new(co)
    flip = matrix is not None and matrix.determinant() < 0
    for f in src.faces:
        vs = [vm[v] for v in f.verts]
        if flip:
            vs.reverse()
        nf = dst.faces.new(vs)
        nf.material_index = f.material_index
        nf.smooth = f.smooth
    for e in src.edges:
        if not e.smooth:
            ee = dst.edges.get((vm[e.verts[0]], vm[e.verts[1]]))
            if ee:
                ee.smooth = False
    return dst


def bevel_bm(bm, width, seg=3, angle=30.0, profile=0.5):
    """Bevel every edge sharper than `angle` degrees (the Bevel modifier's Angle limit, applied)."""
    ang = radians(angle)
    edges = [e for e in bm.edges if e.is_boundary or (len(e.link_faces) == 2 and e.calc_face_angle(0.0) >= ang)]
    if not edges:
        return bm
    geom = list(edges)
    seen = set()
    for e in edges:
        for v in e.verts:
            if v not in seen:
                seen.add(v)
                geom.append(v)
    bm.faces.ensure_lookup_table()
    mat = bm.faces[0].material_index if len(bm.faces) else 0
    bmesh.ops.bevel(bm, geom=geom, offset=width, offset_type='OFFSET', profile=profile, segments=seg,
                    affect='EDGES', clamp_overlap=True, loop_slide=True)
    for f in bm.faces:  # the bevel's new faces would otherwise fall back to material 0 (paint)
        f.material_index = mat
    return bm


def box(sx, sy, sz, center=(0, 0, 0), taper=(1.0, 1.0), taper_z=None, mat=PAINT, bevel=None, seg=3, angle=30.0, shift_top=(0, 0), narrow_front=1.0):
    """Box centred at `center`. `taper` scales the top face's x/y (sloped sides); `shift_top` slides the top in x/y;
    `narrow_front` scales the width at the front (+X) end relative to the rear (a wedge in plan view)."""
    bm = bm_new()
    res = bmesh.ops.create_cube(bm, size=1.0)
    for v in res['verts']:
        t = v.co.z + 0.5
        u = v.co.x + 0.5
        v.co.x = v.co.x * sx * (1 + (taper[0] - 1) * t) + shift_top[0] * t
        v.co.y = v.co.y * sy * (1 + (taper[1] - 1) * t) * (1 + (narrow_front - 1) * u) + shift_top[1] * t
        v.co.z = (v.co.z) * sz
    set_mat(bm, mat)
    if bevel:
        bevel_bm(bm, bevel, seg, angle)
    translate(bm, *center)
    return bm


def prism_xz(poly, y0, y1, mat=PAINT, bevel=None, seg=3, angle=30.0):
    """Side profile (x, z) points extruded across y0..y1."""
    bm = bm_new()
    a = [bm.verts.new((x, y0, z)) for x, z in poly]
    b = [bm.verts.new((x, y1, z)) for x, z in poly]
    n = len(poly)
    bm.faces.new(a)
    bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([a[i], a[j], b[j], b[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    set_mat(bm, mat)
    if bevel:
        bevel_bm(bm, bevel, seg, angle)
    return bm


def prism_xy(poly, z0, z1, mat=PAINT, bevel=None, seg=3, angle=30.0):
    """Plan outline (x, y) points extruded across z0..z1."""
    bm = bm_new()
    a = [bm.verts.new((x, y, z0)) for x, y in poly]
    b = [bm.verts.new((x, y, z1)) for x, y in poly]
    n = len(poly)
    bm.faces.new(a)
    bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([a[i], a[j], b[j], b[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    set_mat(bm, mat)
    if bevel:
        bevel_bm(bm, bevel, seg, angle)
    return bm


def fillet_path(pts, radii, n=4, closed=False):
    """Round the corners of a polyline. radii[i] is the fillet radius at point i (0 keeps it sharp)."""
    out = []
    m = len(pts)
    for i in range(m):
        p = Vector(pts[i])
        r = radii[i]
        if (not closed and (i == 0 or i == m - 1)) or r <= 1e-9:
            out.append(tuple(p))
            continue
        a = Vector(pts[(i - 1) % m])
        b = Vector(pts[(i + 1) % m])
        d1 = (a - p).normalized()
        d2 = (b - p).normalized()
        cosang = max(-1.0, min(1.0, d1.dot(d2)))
        ang = math.acos(cosang)
        if ang < 1e-3 or abs(ang - pi) < 1e-3:
            out.append(tuple(p))
            continue
        t = r / math.tan(ang / 2)
        t = min(t, (a - p).length * 0.49, (b - p).length * 0.49)
        rr = t * math.tan(ang / 2)
        p1 = p + d1 * t
        p2 = p + d2 * t
        bis = (d1 + d2).normalized()
        c = p + bis * (rr / math.sin(ang / 2))
        v1 = (p1 - c).normalized()
        v2 = (p2 - c).normalized()
        a1 = math.atan2(v1.y, v1.x)
        a2 = math.atan2(v2.y, v2.x)
        da = a2 - a1
        while da > pi:
            da -= 2 * pi
        while da < -pi:
            da += 2 * pi
        for k in range(n + 1):
            aa = a1 + da * k / n
            out.append((c.x + rr * cos(aa), c.y + rr * sin(aa)))
    return out


def lathe(profile, segs=32, origin=(0, 0, 0), axis=(1, 0, 0), mat=PAINT, closed=False, up=None):
    """Revolve a profile of (t, r) points (t along the axis, r from it) around an axis through `origin`.
    Points with r == 0 become single pole vertices, so a domed cap needs no extra cleanup."""
    ax = Vector(axis).normalized()
    ref = Vector(up) if up is not None else (Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((1, 0, 0)))
    u = ax.cross(ref).normalized()
    v = ax.cross(u).normalized()
    o = Vector(origin)
    bm = bm_new()
    rows = []
    for t, r in profile:
        if r < 1e-9:
            rows.append([bm.verts.new(o + ax * t)])
        else:
            rows.append([bm.verts.new(o + ax * t + (u * cos(2 * pi * k / segs) + v * sin(2 * pi * k / segs)) * r) for k in range(segs)])
    cnt = len(rows)
    last = cnt if closed else cnt - 1
    for i in range(last):
        ra, rb = rows[i], rows[(i + 1) % cnt]
        if len(ra) == 1 and len(rb) == 1:
            continue
        for k in range(segs):
            k2 = (k + 1) % segs
            if len(ra) == 1:
                bm.faces.new([ra[0], rb[k2], rb[k]])
            elif len(rb) == 1:
                bm.faces.new([ra[k], ra[k2], rb[0]])
            else:
                bm.faces.new([ra[k], ra[k2], rb[k2], rb[k]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    set_mat(bm, mat)
    return bm


def cylinder(p0, p1, r0, r1=None, segs=24, mat=PAINT, bevel=None, seg=2, angle=30.0, caps=True):
    """Cylinder or cone from p0 to p1 (flat caps, optionally bevelled)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    r1 = r0 if r1 is None else r1
    prof = [(0, 0), (0, r0), (L, r1), (L, 0)] if caps else [(0, r0), (L, r1)]
    bm = lathe(prof, segs, p0, d, mat)
    if bevel:
        bevel_bm(bm, bevel, seg, angle)
    return bm


def ellipsoid(rx, ry, rz, center=(0, 0, 0), segs=24, rings=12, mat=PAINT, lower_cut=None):
    """UV sphere scaled to an ellipsoid; lower_cut (in local z) slices off everything below (a dome)."""
    bm = bm_new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * rx, v.co.y * ry, v.co.z * rz))
    if lower_cut is not None:
        geom = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, lower_cut),
                                      plane_no=(0, 0, 1), clear_inner=True, clear_outer=False)
        cut_edges = [e for e in geom['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        bmesh.ops.contextual_create(bm, geom=cut_edges)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    set_mat(bm, mat)
    translate(bm, *center)
    return bm


def torus(R, r, center=(0, 0, 0), axis=(0, 0, 1), segs=32, minor=10, mat=METAL):
    prof = []
    for k in range(minor):
        a = 2 * pi * k / minor
        prof.append((r * sin(a), R + r * cos(a)))
    return lathe(prof, segs, center, axis, mat, closed=True)


def orient(bm, x_axis, y_axis, z_axis, origin=(0, 0, 0)):
    """Move a part built around the local origin so its local axes point along the given world axes."""
    xa, ya, za = Vector(x_axis).normalized(), Vector(y_axis).normalized(), Vector(z_axis).normalized()
    m = Matrix(((xa.x, ya.x, za.x, origin[0]), (xa.y, ya.y, za.y, origin[1]), (xa.z, ya.z, za.z, origin[2]), (0, 0, 0, 1)))
    xform(bm, m)
    return bm


def rot_y(bm, deg, pivot=(0, 0, 0)):
    """Rotate about the tank's Y axis (pitches things up when positive turns +X toward +Z)."""
    p = Vector(pivot)
    m = Matrix.Translation(p) @ Matrix.Rotation(-radians(deg), 4, 'Y') @ Matrix.Translation(-p)
    return xform(bm, m)


def bolt(pos, normal, r=1.1, h=0.9, mat=METAL, segs=10):
    """A small domed bolt head sitting on a surface at `pos` with outward `normal`."""
    n = Vector(normal).normalized()
    prof = [(0, 0), (0, r), (h * 0.35, r * 0.98), (h * 0.8, r * 0.7), (h, 0)]
    bm = lathe(prof, segs, pos, n, mat)
    return bm


# --------------------------------------------------------------------------------------- star on a surface

def star_shape(R, inner=0.47, tips_round=0.0):
    pts = []
    for k in range(10):
        a = pi / 2 + k * pi / 5
        rr = R if k % 2 == 0 else R * inner
        pts.append((rr * cos(a), rr * sin(a)))
    return pts


def make_star(target_bm, center, outward_hint, R=8.5, height=0.8, embed=0.25, up=(0, 0, 1), subdiv=0, mat=STAR, inner=0.47):
    """A slightly raised, bevelled five-point star lying on the surface of target_bm around `center`.
    Every vertex is snapped to the target so the star follows curved turrets too."""
    tree = BVHTree.FromBMesh(target_bm)
    c = Vector(center)
    hint = Vector(outward_hint).normalized()
    loc, nrm, _, _ = tree.ray_cast(c + hint * 400.0, -hint)  # shoot in from outside so the star lands on the wall, not the nearest face
    if loc is None:
        loc, nrm, _, _ = tree.find_nearest(c)
    nrm = Vector(nrm).normalized()
    z = nrm
    u = Vector(up) - z * Vector(up).dot(z)
    y = u.normalized()
    x = y.cross(z).normalized()
    pts = star_shape(R, inner)
    bm = bm_new()
    a = [bm.verts.new((px, py, 0.0)) for px, py in pts]
    b = [bm.verts.new((px, py, height)) for px, py in pts]
    bm.faces.new(a)
    bm.faces.new(b)
    for i in range(10):
        j = (i + 1) % 10
        bm.faces.new([a[i], a[j], b[j], b[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bevel_bm(bm, min(0.28, height * 0.34), 2, 20.0)
    if subdiv:
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=subdiv, use_grid_fill=False)
    for v in bm.verts:
        lx, ly, lz = v.co.x, v.co.y, v.co.z
        p = loc + x * lx + y * ly
        q, qn, _, _ = tree.find_nearest(p + z * 2.0)
        v.co = Vector(q) + Vector(qn).normalized() * (lz - embed)
    set_mat(bm, mat)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


# --------------------------------------------------------------------------------------- soft shapes

def superbun(cx, cy, z0, a, b, c, e1=0.6, e2=0.8, nu=56, nv=20, mat=PAINT, embed=0.6):
    """The upper half of a superellipsoid: a chubby bun with a fairly flat, softly rounded roof and a vertical wall at its foot.
    a, b, c are the half length, half width and height; e1 < 1 makes the roof fuller, e2 < 1 makes the plan more rounded-square."""
    def cw(w, m):
        return math.copysign(abs(math.cos(w)) ** m, math.cos(w))

    def sw(w, m):
        return math.copysign(abs(math.sin(w)) ** m, math.sin(w))

    bm = bm_new()
    rows = []
    for j in range(nv + 1):
        v = (pi / 2) * j / nv
        if j == nv:
            rows.append([bm.verts.new((cx, cy, z0 - embed + c * sw(v, e1)))])
            continue
        row = []
        for i in range(nu):
            u = 2 * pi * i / nu
            row.append(bm.verts.new((cx + a * cw(v, e1) * cw(u, e2), cy + b * cw(v, e1) * sw(u, e2), z0 - embed + c * sw(v, e1))))
        rows.append(row)
    for j in range(nv):
        ra, rb = rows[j], rows[j + 1]
        for i in range(nu):
            i2 = (i + 1) % nu
            if len(rb) == 1:
                bm.faces.new([ra[i], ra[i2], rb[0]])
            else:
                bm.faces.new([ra[i], ra[i2], rb[i2], rb[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    set_mat(bm, mat)
    return bm


def rounded_rect(x0, x1, y0, y1, radii, n=6):
    """Plan outline of a rectangle with each corner rounded: radii = (x0,y0), (x1,y0), (x1,y1), (x0,y1) corner radii."""
    pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    return fillet_path(pts, list(radii), n, closed=True)


def intersect(bm_a, bm_b):
    """Boolean intersection (exact solver) of two closed parts; returns a new bmesh. Used to give side-profile bodies rounded plan corners."""
    objs = []
    for bm in (bm_a, bm_b):
        me = bpy.data.meshes.new('tmp')
        bm.to_mesh(me)
        o = bpy.data.objects.new('tmp', me)
        bpy.context.scene.collection.objects.link(o)
        objs.append(o)
    mod = objs[0].modifiers.new('bool', 'BOOLEAN')
    mod.operation = 'INTERSECT'
    mod.solver = 'EXACT'
    mod.object = objs[1]
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(objs[0].evaluated_get(dg))
    out = bmesh.new()
    out.from_mesh(me)
    bpy.data.meshes.remove(me)
    for o in objs:
        m = o.data
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(m)
    bmesh.ops.recalc_face_normals(out, faces=out.faces)
    return out


def conform_x(part, target_bm, x_ref, embed=0.4):
    """Slide a part along X so that the plane x = x_ref lands on the surface of target_bm at each vertex's own (y, z): a gasket that
    hugs a curved turret face."""
    tree = BVHTree.FromBMesh(target_bm)
    for v in part.verts:
        loc, nrm, _, _ = tree.ray_cast(Vector((400.0, v.co.y, v.co.z)), Vector((-1, 0, 0)))
        if loc is not None:
            v.co.x = loc.x + (v.co.x - x_ref) - embed
    return part


def ray_z(target_bm, x, y):
    """z of the top surface of target_bm at (x, y), shooting down from above."""
    tree = BVHTree.FromBMesh(target_bm)
    loc, nrm, _, _ = tree.ray_cast(Vector((x, y, 600.0)), Vector((0, 0, -1)))
    return None if loc is None else loc.z


def ray_x(target_bm, y, z):
    """x of the front surface of target_bm at (y, z), shooting in from +X."""
    tree = BVHTree.FromBMesh(target_bm)
    loc, nrm, _, _ = tree.ray_cast(Vector((400.0, y, z)), Vector((-1, 0, 0)))
    return None if loc is None else loc.x


# --------------------------------------------------------------------------------------- tracks

def convex_hull_2d(points):
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def track_path(circles, offset, count=192, n=72):
    """Closed centre line around the wheels in the (x, z) plane: the convex hull of the wheel circles grown by
    `offset`, walked clockwise (top run towards +X) and resampled evenly by length. Returns (points, length)."""
    pts = []
    for x, z, r in circles:
        for k in range(n):
            a = 2 * pi * k / n
            pts.append((x + (r + offset) * cos(a), z + (r + offset) * sin(a)))
    hull = convex_hull_2d(pts)  # counter-clockwise
    hull.reverse()  # clockwise seen with x right, z up
    m = len(hull)
    seg = [math.hypot(hull[(i + 1) % m][0] - hull[i][0], hull[(i + 1) % m][1] - hull[i][1]) for i in range(m)]
    total = sum(seg)
    # start at the topmost point so lug numbering is stable
    start = max(range(m), key=lambda i: hull[i][1])
    hull = hull[start:] + hull[:start]
    seg = seg[start:] + seg[:start]
    out = []
    acc = 0.0
    j = 0
    for i in range(count):
        target = total * i / count
        while acc + seg[j] < target:
            acc += seg[j]
            j += 1
        f = (target - acc) / seg[j] if seg[j] > 0 else 0
        p0, p1 = hull[j], hull[(j + 1) % m]
        out.append((p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f))
    return out, total


def smooth_closed(points, iters=2):
    """Light Laplacian smoothing of a closed 2D path, so the polygonal hull has rounded corners."""
    p = [Vector(q) for q in points]
    n = len(p)
    for _ in range(iters):
        p = [(p[(i - 1) % n] + p[i] * 2 + p[(i + 1) % n]) / 4 for i in range(n)]
    return [(q.x, q.y) for q in p]


def frames(path):
    """Tangent and outward normal (x, z) for a clockwise closed path."""
    n = len(path)
    out = []
    for i in range(n):
        a = Vector(path[(i - 1) % n])
        b = Vector(path[(i + 1) % n])
        t = (b - a).normalized()
        out.append((t, Vector((-t.y, t.x))))
    return out


def belt(path, y_c, width, thick, chamfer=0.7, mat=RUBBER):
    """The rubber belt: a rounded rectangular section swept around the closed path."""
    w2, t2, c = width / 2, thick / 2, chamfer
    sect = [(-w2 + c, -t2), (w2 - c, -t2), (w2, -t2 + c), (w2, t2 - c), (w2 - c, t2), (-w2 + c, t2), (-w2, t2 - c), (-w2, -t2 + c)]
    fr = frames(path)
    bm = bm_new()
    rows = []
    for (px, pz), (t, nrm) in zip(path, fr):
        rows.append([bm.verts.new((px + nrm.x * off, y_c + lat, pz + nrm.y * off)) for lat, off in sect])
    n = len(rows)
    m = len(sect)
    for i in range(n):
        r0, r1 = rows[i], rows[(i + 1) % n]
        for k in range(m):
            k2 = (k + 1) % m
            bm.faces.new([r0[k], r1[k], r1[k2], r0[k2]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    set_mat(bm, mat)
    return bm


def lugs(path, y_c, count, lug_len, lug_w, lug_h, base_off, bevel=0.35, mat=RUBBER, chevron=0.0):
    """Moulded tread lugs on the outside of the belt, evenly spaced along the path."""
    n = len(path)
    fr = frames(path)
    lug = box(lug_len, lug_w, lug_h + 0.4, center=(0, 0, 0), mat=mat, bevel=bevel, seg=1, angle=30.0)
    bm = bm_new()
    for k in range(count):
        s = n * k / count
        i0 = int(s) % n
        f = s - int(s)
        p0, p1 = Vector(path[i0]), Vector(path[(i0 + 1) % n])
        p = p0 + (p1 - p0) * f
        t0, n0 = fr[i0]
        t1, n1 = fr[(i0 + 1) % n]
        t = (t0 * (1 - f) + t1 * f).normalized()
        nn = Vector((-t.y, t.x))
        centre = p + nn * (base_off + lug_h / 2 - 0.2)
        T3, N3 = Vector((t.x, 0, t.y)), Vector((nn.x, 0, nn.y))
        # columns: local X -> tangent, local Y -> world Y, local Z -> the belt's outward normal
        m = Matrix(((T3.x, 0, N3.x, centre.x), (0, 1, 0, y_c), (T3.z, 0, N3.z, centre.y), (0, 0, 0, 1)))
        merge(bm, lug, m)
    return bm


# --------------------------------------------------------------------------------------- objects and hierarchy

def finish_mesh(bm, sharp_angle=38.0, smooth=True):
    """Smooth shading with sharp edges kept where two faces meet at a real crease."""
    ang = radians(sharp_angle)
    for f in bm.faces:
        f.smooth = smooth
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < ang
        else:
            e.smooth = False
    return bm


def make_obj(name, bm, mats, origin_mm=(0, 0, 0), parent=None, parent_origin_mm=(0, 0, 0), weighted=True, sharp_angle=38.0):
    """Turn a bmesh (in tank space, mm) into an object whose origin is at origin_mm.
    `parent_origin_mm` is the parent's origin so the local offset is right (no node has any rotation)."""
    finish_mesh(bm, sharp_angle)
    bm.verts.ensure_lookup_table()
    o = Vector(origin_mm)
    for v in bm.verts:
        v.co = (v.co - o) * MM
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for m in mats:
        me.materials.append(m)
    obj.location = (Vector(origin_mm) - Vector(parent_origin_mm)) * MM
    if parent is not None:
        obj.parent = parent
    if weighted:
        mod = obj.modifiers.new('WeightedNormal', 'WEIGHTED_NORMAL')
        mod.mode = 'FACE_AREA'
        mod.weight = 50
        mod.thresh = 0.01
        mod.keep_sharp = True
    return obj


def make_empty(name, origin_mm=(0, 0, 0), parent=None, parent_origin_mm=(0, 0, 0), display='PLAIN_AXES', size=0.005):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = display
    e.empty_display_size = size
    bpy.context.scene.collection.objects.link(e)
    e.location = (Vector(origin_mm) - Vector(parent_origin_mm)) * MM
    if parent is not None:
        e.parent = parent
    return e


def count_tris(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in objs:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
        ev.to_mesh_clear()
    return n


# --------------------------------------------------------------------------------------- export and preview

def export_glb(path, root):
    """Export the hierarchy under `root` as an uncompressed GLB (+Y up), modifiers applied."""
    bpy.ops.object.select_all(action='DESELECT')
    stack = [root]
    while stack:
        o = stack.pop()
        o.select_set(True)
        stack.extend(o.children)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_extras=True, export_materials='EXPORT', export_image_format='NONE', export_cameras=False,
        export_lights=False, export_animations=False, export_normals=True, export_tangents=False,
        export_texcoords=False, export_vertex_color='NONE', export_attributes=False)


def set_paint_color(hex_rgb):
    r, g, b = [((hex_rgb >> s) & 255) / 255.0 for s in (16, 8, 0)]

    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    m = bpy.data.materials['paint']
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (lin(r), lin(g), lin(b), 1.0)


def setup_preview(res=(1000, 700), samples=96, cycles=True):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES' if cycles else 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    if cycles:
        sc.cycles.samples = samples
        sc.cycles.use_denoising = True
        sc.cycles.max_bounces = 8
        sc.cycles.glossy_bounces = 6
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            prefs.compute_device_type = 'METAL'
            prefs.get_devices()
            for dv in prefs.devices:
                dv.use = dv.type == 'METAL'
            sc.cycles.device = 'GPU'
        except Exception as e:  # falls back to the CPU
            print('preview: no Metal device', e)
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Punchy'
    sc.view_settings.exposure = -1.0
    # a bright sky, a warm sun and a soft grass-green floor, like the toy-shop photographs
    w = bpy.data.worlds.new('preview')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'MULTIPLE_SCATTERING'
    for k, val in (('sun_elevation', radians(38)), ('sun_rotation', radians(200)), ('sun_size', radians(3)), ('sun_intensity', 0.35),
                   ('air_density', 1.0), ('aerosol_density', 1.2)):
        if hasattr(sky, k):
            setattr(sky, k, val)
    nt.links.new(sky.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 0.55
    bpy.ops.mesh.primitive_plane_add(size=3.0, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = 'preview_floor'
    fm = bpy.data.materials.new('preview_floor')
    fm.use_nodes = True
    fb = fm.node_tree.nodes['Principled BSDF']
    fb.inputs['Base Color'].default_value = (0.30, 0.27, 0.20, 1)
    fb.inputs['Roughness'].default_value = 0.85
    floor.data.materials.append(fm)
    return sc


def render_view(path, cam_pos_mm, target_mm=(0, 0, 32), lens=85, dof=False):
    sc = bpy.context.scene
    cam = bpy.data.objects.get('preview_cam')
    if cam is None:
        cd = bpy.data.cameras.new('preview_cam')
        cam = bpy.data.objects.new('preview_cam', cd)
        sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = lens
    cam.data.sensor_width = 36
    cam.location = Vector(cam_pos_mm) * MM
    d = Vector(target_mm) * MM - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    if dof:
        cam.data.dof.use_dof = True
        cam.data.dof.focus_distance = d.length
        cam.data.dof.aperture_fstop = 4.0
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


PREVIEW_VIEWS = {
    # camera positions in tank space (mm); the game's camera looks at the tank's right side (-Y here)
    'side': ((30, -800, 175), (0, 0, 52)),
    'q3': ((570, -480, 310), (0, 0, 54)),
    'ref': ((520, -700, 210), (0, 0, 58)),  # like the reference pictures: low, three-quarter from the front
    'rear': ((-560, -450, 280), (0, 0, 54)),
    'top': ((10, -100, 900), (0, 0, 50)),
    'front': ((850, -120, 160), (0, 0, 58)),
}
