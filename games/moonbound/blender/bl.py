"""Moonbound sprite pipeline: geometry, scene and render helpers (run inside headless Blender).

World (Blender): X east (screen right), Y north (away from the camera), Z up, metres. A model stands on z = 0 at the origin and is
built FACING SOUTH (-Y, toward the camera). The orthographic camera looks north and down at ELEV degrees below the horizon, which
is the game's camera. The game's ground plane is (x, y) in metres with y pointing SOUTH, so game (x, y, z) = Blender (x, -y, z).

Directions. A facing angle `a` is measured in the game's ground plane, atan2(dy, dx) with y south: 0 = east, pi/2 = south (toward
the camera), pi = west, 3pi/2 = north. `facing(a)` is the Blender rotation that turns a model built facing south to face `a`.
A sprite set with N directions holds direction d at angle d * 2pi / N. With `mirror`, only the directions with cos(a) >= 0 (east
half, north and south included) are rendered; the game draws each western direction as its eastern mirror, flipped in x.

A model is built as `Mesh` objects (bmesh + material keys + optional UVs), turned into Blender mesh datablocks and rendered in
SHEETS: many frames (every pose of an animation, in every direction) are laid out side by side, with gaps wide enough that they
cannot shade each other, and rendered together four times with a different MODE in every material: albedo, camera-space normal,
emissive + gloss, ambient occlusion. `combine` turns the four renders of each cell into one straight-alpha albedo frame (AO,
cavity and edge light baked in, a thin dark rim) and one normal frame: RG = normal x, y; B = gloss; A = emissive.
Everything is deterministic (fixed seeds, `mathutils.noise.noise` only).
"""
import math
import os
import struct
import zlib

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import mats

PI = math.pi
TMP = os.path.join(os.environ.get('MB_TMP') or os.path.join(os.environ.get('TMPDIR', '/tmp'), 'moonbound-tmp'), str(os.getpid()))
ELEV = 50.0      # camera tilt below the horizon, degrees (the game's camera: src/config.js ELEV)
PPM = 72         # default atlas pixels per metre
SS = 2           # supersampling of every render
SHEET_MAX = 2048  # largest sheet side, in supersampled pixels
IDENT4 = Matrix.Identity(4)


# ------------------------------------------------------------------------------------------------ small maths

def rotx(a):
    return Matrix.Rotation(a, 4, 'X')


def roty(a):
    return Matrix.Rotation(a, 4, 'Y')


def rotz(a):
    return Matrix.Rotation(a, 4, 'Z')


def trans(x, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def scale(sx, sy=None, sz=None):
    sy = sx if sy is None else sy
    sz = sx if sz is None else sz
    return Matrix.Diagonal((sx, sy, sz, 1.0))


def axis_matrix(a, b):
    """Matrix taking the local +Z axis to the direction a->b, origin at a."""
    a = Vector(a)
    d = Vector(b) - a
    if d.length < 1e-9:
        return trans(*a)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return trans(*a) @ q.to_matrix().to_4x4()


def facing(a):
    """Rotation turning a model built facing south (-Y) to face game angle a (0 east, pi/2 south, pi west, 3pi/2 north)."""
    return rotz(PI / 2 - a)


def directions(n, mirror=True):
    """[(index, angle)] of the directions a set renders: all n, or with mirror only the eastern half (cos >= 0)."""
    out = []
    for d in range(n):
        a = d * 2 * PI / n
        if not mirror or math.cos(a) > -1e-6:
            out.append((d, a))
    return out


# ------------------------------------------------------------------------------------------------ mesh builder

class Mesh:
    """A bmesh plus the list of material keys its faces use. Every primitive is built in a temporary bmesh, then merged.
    Primitives that have a natural parameterisation (sheets, lathes, tubes) also write UVs, which `mats` image textures use."""

    def __init__(self, name='part'):
        self.name = name
        self.bm = bmesh.new()
        self.uvl = self.bm.loops.layers.uv.verify()
        self.mats = []

    # -- plumbing
    def _mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def commit(self, tb, mat, smooth=0.0, mx=None, bevel=0.0, bevel_seg=1):
        """Merge the temporary bmesh `tb`. smooth = angle in degrees below which edges are smooth (0 = flat shaded)."""
        if len(tb.faces) == 0:
            tb.free()
            return
        bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
        if bevel > 0:
            ed = [e for e in tb.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > 0.35]
            if ed:
                try:
                    bmesh.ops.bevel(tb, geom=ed, offset=bevel, offset_type='OFFSET', segments=bevel_seg,
                                    profile=0.5, affect='EDGES', clamp_overlap=True)
                    bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
                except Exception:
                    pass
        if smooth > 0:
            lim = math.radians(smooth)
            for f in tb.faces:
                f.smooth = True
            for e in tb.edges:
                if len(e.link_faces) == 2:
                    if e.calc_face_angle(0.0) >= lim:
                        e.smooth = False
                else:
                    e.smooth = False
        mi = self._mi(mat)
        bm = self.bm
        tuv = tb.loops.layers.uv.active
        tb.verts.index_update()
        vm = [None] * len(tb.verts)
        for v in tb.verts:
            vm[v.index] = bm.verts.new(mx @ v.co if mx is not None else v.co)
        flip = mx is not None and mx.determinant() < 0
        for f in tb.faces:
            vs = [vm[v.index] for v in f.verts]
            uvs = [tuple(l[tuv].uv) for l in f.loops] if tuv is not None else None
            if flip:
                vs.reverse()
                if uvs:
                    uvs.reverse()
            try:
                nf = bm.faces.new(vs)
            except ValueError:
                continue
            nf.material_index = mi
            nf.smooth = f.smooth
            if uvs:
                for l, uv in zip(nf.loops, uvs):
                    l[self.uvl].uv = uv
        if smooth > 0:
            for e in tb.edges:
                if not e.smooth and len(e.link_faces) == 2:
                    ee = bm.edges.get((vm[e.verts[0].index], vm[e.verts[1].index]))
                    if ee:
                        ee.smooth = False
        tb.free()

    def add(self, other, mx=None):
        """Copy another Mesh into this one (optionally transformed)."""
        ob = other.bm
        ob.verts.index_update()
        bm = self.bm
        ouv = other.uvl
        vm = [None] * len(ob.verts)
        for v in ob.verts:
            vm[v.index] = bm.verts.new(mx @ v.co if mx is not None else v.co)
        flip = mx is not None and mx.determinant() < 0
        remap = {}
        for i, key in enumerate(other.mats):
            remap[i] = self._mi(key)
        for f in ob.faces:
            vs = [vm[v.index] for v in f.verts]
            uvs = [tuple(l[ouv].uv) for l in f.loops]
            if flip:
                vs.reverse()
                uvs.reverse()
            try:
                nf = bm.faces.new(vs)
            except ValueError:
                continue
            nf.material_index = remap.get(f.material_index, 0)
            nf.smooth = f.smooth
            for l, uv in zip(nf.loops, uvs):
                l[self.uvl].uv = uv
        for e in ob.edges:
            if not e.smooth and len(e.link_faces) == 2:
                ee = bm.edges.get((vm[e.verts[0].index], vm[e.verts[1].index]))
                if ee:
                    ee.smooth = False

    def transform(self, mx):
        bmesh.ops.transform(self.bm, matrix=mx, verts=self.bm.verts[:])
        if mx.determinant() < 0:
            bmesh.ops.reverse_faces(self.bm, faces=self.bm.faces[:])

    def warp(self, amp, freq, seed=0.0):
        """Displace every vertex by smooth noise (dents, gnarls, weathering)."""
        from mathutils import noise as mn
        off = Vector((seed * 3.7, seed * 1.9, seed * 5.1))
        oy, oz = Vector((17.3, 4.1, 9.7)), Vector((-6.2, 23.9, 11.3))
        for v in self.bm.verts:
            # three scalar lookups: mathutils' noise_vector is not repeatable between runs, noise() is
            p = v.co * freq + off
            v.co += Vector((mn.noise(p), mn.noise(p + oy), mn.noise(p + oz))) * amp

    def copy(self):
        m = Mesh(self.name)
        m.add(self)
        return m

    # -- primitives
    def poly(self, pts, mat, mx=None, smooth=0.0):
        """A flat n-gon from 3D points."""
        tb = bmesh.new()
        vs = [tb.verts.new(p) for p in pts]
        tb.faces.new(vs)
        self.commit(tb, mat, smooth, mx)

    def prism(self, pts_xz, y0, y1, mat, mx=None, smooth=0.0, bevel=0.0):
        """Polygon in the XZ plane extruded along Y from y0 to y1 (may be concave)."""
        tb = bmesh.new()
        vs = [tb.verts.new((x, y0, z)) for x, z in pts_xz]
        f = tb.faces.new(vs)
        r = bmesh.ops.extrude_face_region(tb, geom=[f])
        nv = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(tb, vec=(0, y1 - y0, 0), verts=nv)
        self.commit(tb, mat, smooth, mx, bevel)

    def prism_xy(self, pts_xy, z0, z1, mat, mx=None, smooth=0.0, bevel=0.0):
        """Polygon in the XY plane (a floor plan) extruded up from z0 to z1 (may be concave)."""
        tb = bmesh.new()
        vs = [tb.verts.new((x, y, z0)) for x, y in pts_xy]
        f = tb.faces.new(vs)
        r = bmesh.ops.extrude_face_region(tb, geom=[f])
        nv = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(tb, vec=(0, 0, z1 - z0), verts=nv)
        self.commit(tb, mat, smooth, mx, bevel)

    def convex(self, planes, mat, mx=None, smooth=0.0, bevel=0.0):
        """Convex solid from half-spaces n.p <= d, planes = [((nx,ny,nz), d), ...]."""
        pts = convex_points(planes)
        if len(pts) < 4:
            return
        tb = bmesh.new()
        vs = [tb.verts.new(p) for p in pts]
        bmesh.ops.convex_hull(tb, input=vs, use_existing_faces=False)
        for g in tb.verts[:]:
            if not g.link_faces:
                tb.verts.remove(g)
        bmesh.ops.dissolve_limit(tb, angle_limit=math.radians(0.6), verts=tb.verts[:], edges=tb.edges[:])
        self.commit(tb, mat, smooth, mx, bevel)

    def hull(self, pts, mat, mx=None, smooth=0.0, bevel=0.0):
        """Convex hull of 3D points (rocks, shards, rubble)."""
        tb = bmesh.new()
        vs = [tb.verts.new(p) for p in pts]
        bmesh.ops.convex_hull(tb, input=vs, use_existing_faces=False)
        for g in tb.verts[:]:
            if not g.link_faces:
                tb.verts.remove(g)
        self.commit(tb, mat, smooth, mx, bevel)

    def slab(self, pts_xz, y0, y1, mat, cuts=(), mx=None, smooth=0.0, bevel=0.0):
        """Convex prism from a convex CCW side polygon, optionally cut by extra planes (plan chamfers etc)."""
        planes = poly_planes(pts_xz) + [((0, 1, 0), y1), ((0, -1, 0), -y0)] + list(cuts)
        self.convex(planes, mat, mx, smooth, bevel)

    def box(self, x0, x1, y0, y1, z0, z1, mat, mx=None, bevel=0.0, smooth=0.0):
        tb = bmesh.new()
        bmesh.ops.create_cube(tb, size=1.0)
        bmesh.ops.scale(tb, vec=(x1 - x0, y1 - y0, z1 - z0), verts=tb.verts[:])
        bmesh.ops.translate(tb, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=tb.verts[:])
        # box UVs: each face spans its own 0..1 (stone blocks, planks)
        uvl = tb.loops.layers.uv.verify()
        for f in tb.faces:
            for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                l[uvl].uv = uv
        self.commit(tb, mat, smooth, mx, bevel)

    def lathe(self, profile, mat, mx=None, seg=24, smooth=40.0, phase=0.0, cap=True, bevel=0.0, arc=2 * PI):
        """Solid of revolution about local +Z. profile = [(z, radius), ...] along the axis. UV: u around, v along the profile.
        With arc < 2pi only that part of the turn is made (an open shell)."""
        tb = bmesh.new()
        uvl = tb.loops.layers.uv.verify()
        full = arc >= 2 * PI - 1e-6
        nseg = seg if full else seg + 1
        rings = []
        for z, r in profile:
            if r < 1e-6:
                rings.append([tb.verts.new((0, 0, z))])
            else:
                rings.append([tb.verts.new((r * math.cos(phase + arc * j / seg),
                                            r * math.sin(phase + arc * j / seg), z)) for j in range(nseg)])
        npf = max(1, len(profile) - 1)
        for i in range(len(rings) - 1):
            a, b = rings[i], rings[i + 1]
            for j in range(seg):
                j2 = (j + 1) % nseg if full else j + 1
                if len(a) == 1 and len(b) == 1:
                    continue
                if len(a) == 1:
                    vs = [a[0], b[j2], b[j]]
                    uv = [((j + 0.5) / seg, i / npf), ((j + 1) / seg, (i + 1) / npf), (j / seg, (i + 1) / npf)]
                elif len(b) == 1:
                    vs = [a[j], a[j2], b[0]]
                    uv = [(j / seg, i / npf), ((j + 1) / seg, i / npf), ((j + 0.5) / seg, (i + 1) / npf)]
                else:
                    vs = [a[j], a[j2], b[j2], b[j]]
                    uv = [(j / seg, i / npf), ((j + 1) / seg, i / npf), ((j + 1) / seg, (i + 1) / npf), (j / seg, (i + 1) / npf)]
                try:
                    f = tb.faces.new(vs)
                except ValueError:
                    continue
                for l, u in zip(f.loops, uv):
                    l[uvl].uv = u
        if cap and full:
            for ring in (rings[0], rings[-1]):
                if len(ring) > 2:
                    try:
                        f = tb.faces.new(ring)
                        for l in f.loops:
                            l[uvl].uv = (0.5, 0.5)
                    except ValueError:
                        pass
        self.commit(tb, mat, smooth, mx, bevel)

    def cyl(self, a, b, r0, r1=None, mat='steel', seg=16, smooth=40.0, cap=True, bevel=0.0, mx=None):
        """Cylinder or cone between the 3D points a and b."""
        r1 = r0 if r1 is None else r1
        d = (Vector(b) - Vector(a)).length
        m = axis_matrix(a, b)
        if mx is not None:
            m = mx @ m
        self.lathe([(0, r0), (d, r1)], mat, m, seg, smooth, cap=cap, bevel=bevel)

    def sphere(self, c, r, mat, seg=14, sc=(1, 1, 1), smooth=80.0, mx=None):
        prof = [(-r * math.cos(PI * i / 8), r * math.sin(PI * i / 8)) for i in range(9)]
        m = trans(*c) @ Matrix.Diagonal((sc[0], sc[1], sc[2], 1.0))
        if mx is not None:
            m = mx @ m
        self.lathe(prof, mat, m, seg, smooth, cap=False)

    def tube(self, pts, r, mat, seg=8, smooth=60.0, mx=None, cap=True, flat=1.0, up=None):
        """Tube along a 3D polyline (parallel-transport frames). r: one radius or one per point. flat < 1 squashes the section
        (ribbons, flat hair locks) across the `up` direction. UV: u around, v along."""
        P = [Vector(p) for p in pts]
        tb = bmesh.new()
        uvl = tb.loops.layers.uv.verify()
        rings = []
        t0 = (P[1] - P[0]).normalized()
        if up is not None:
            u = Vector(up)
            u = (u - t0 * u.dot(t0))
            u = u.normalized() if u.length > 1e-6 else t0.orthogonal().normalized()
        else:
            ref = Vector((0, 1, 0)) if abs(t0.y) < 0.9 else Vector((1, 0, 0))
            u = t0.cross(ref).normalized()
        n = len(P)
        for i, p in enumerate(P):
            if i == 0:
                t = (P[1] - P[0]).normalized()
            elif i == n - 1:
                t = (P[-1] - P[-2]).normalized()
            else:
                t = ((P[i + 1] - P[i]).normalized() + (P[i] - P[i - 1]).normalized()).normalized()
            u = (u - t * u.dot(t)).normalized()
            v = t.cross(u)
            rr = r[i] if isinstance(r, (list, tuple)) else r
            rings.append([tb.verts.new(p + (u * math.cos(2 * PI * j / seg) + v * math.sin(2 * PI * j / seg) * flat) * rr)
                          for j in range(seg)])
        for i in range(n - 1):
            for j in range(seg):
                j2 = (j + 1) % seg
                try:
                    f = tb.faces.new([rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]])
                except ValueError:
                    continue
                for l, uv in zip(f.loops, ((j / seg, i / (n - 1)), ((j + 1) / seg, i / (n - 1)),
                                           ((j + 1) / seg, (i + 1) / (n - 1)), (j / seg, (i + 1) / (n - 1)))):
                    l[uvl].uv = uv
        if cap:
            for ring in (rings[0], rings[-1]):
                try:
                    f = tb.faces.new(ring)
                    for l in f.loops:
                        l[uvl].uv = (0.5, 0.5)
                except ValueError:
                    pass
        self.commit(tb, mat, smooth, mx)

    def grid_sheet(self, fn, nu, nv, mat, mx=None, smooth=50.0, thick=0.0, uv=None):
        """Parametric sheet: fn(u, v) -> (x, y, z) for u, v in 0..1. With thick > 0 a second surface is offset along the
        normal and the edges are closed (cloth with a lining). uv(u, v) -> (s, t) remaps the UVs (default (u, v))."""
        tb = bmesh.new()
        uvl = tb.loops.layers.uv.verify()
        P = [[Vector(fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
        layers = [P]
        if thick > 0:
            Q = []
            for i in range(nu + 1):
                row = []
                for j in range(nv + 1):
                    du = P[min(i + 1, nu)][j] - P[max(i - 1, 0)][j]
                    dv = P[i][min(j + 1, nv)] - P[i][max(j - 1, 0)]
                    nn = du.cross(dv)
                    nn = nn.normalized() if nn.length > 1e-9 else Vector((0, 0, 1))
                    row.append(P[i][j] - nn * thick)
                Q.append(row)
            layers.append(Q)
        grids = []
        for L in layers:
            grids.append([[tb.verts.new(L[i][j]) for j in range(nv + 1)] for i in range(nu + 1)])
        uvf = uv or (lambda a, b: (a, b))
        for k, vs in enumerate(grids):
            for i in range(nu):
                for j in range(nv):
                    quad = [vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]]
                    uvq = [uvf(i / nu, j / nv), uvf((i + 1) / nu, j / nv), uvf((i + 1) / nu, (j + 1) / nv), uvf(i / nu, (j + 1) / nv)]
                    if k == 1:
                        quad.reverse()
                        uvq.reverse()
                    try:
                        f = tb.faces.new(quad)
                    except ValueError:
                        continue
                    for l, u in zip(f.loops, uvq):
                        l[uvl].uv = u
        if thick > 0:
            A, B = grids
            border = ([(i, 0) for i in range(nu)] + [(nu, j) for j in range(nv)] +
                      [(i, nv) for i in range(nu, 0, -1)] + [(0, j) for j in range(nv, 0, -1)])
            for k in range(len(border)):
                i0, j0 = border[k]
                i1, j1 = border[(k + 1) % len(border)]
                try:
                    f = tb.faces.new([A[i0][j0], A[i1][j1], B[i1][j1], B[i0][j0]])
                    for l in f.loops:
                        l[uvl].uv = uvf(i0 / nu, j0 / nv)
                except ValueError:
                    pass
        self.commit(tb, mat, smooth, mx)

    def to_mesh(self, name=None):
        """A Blender mesh datablock (no object) with this Mesh's faces and materials."""
        me = bpy.data.meshes.new((name or self.name) + '_mesh')
        bm = self.bm
        bm.normal_update()
        bm.to_mesh(me)
        for key in self.mats:
            me.materials.append(mats.get(key))
        return me

    def free(self):
        self.bm.free()


# ------------------------------------------------------------------------------------------------ convex helpers

def poly_planes(pts):
    """Outward half-space planes of a convex CCW polygon in the XZ plane (extruded along Y)."""
    out = []
    n = len(pts)
    for i in range(n):
        x0, z0 = pts[i]
        x1, z1 = pts[(i + 1) % n]
        dx, dz = x1 - x0, z1 - z0
        L = math.hypot(dx, dz)
        nx, nz = dz / L, -dx / L          # outward for CCW (x right, z up)
        out.append(((nx, 0.0, nz), nx * x0 + nz * z0))
    return out


def convex_points(planes):
    N = np.array([p[0] for p in planes], dtype=np.float64)
    D = np.array([p[1] for p in planes], dtype=np.float64)
    n = len(planes)
    pts = []
    for i in range(n):
        for j in range(i + 1, n):
            for k in range(j + 1, n):
                A = np.array([N[i], N[j], N[k]])
                if abs(np.linalg.det(A)) < 1e-9:
                    continue
                p = np.linalg.solve(A, np.array([D[i], D[j], D[k]]))
                if np.all(N @ p <= D + 1e-7):
                    pts.append(p)
    out = []
    for p in pts:
        if not any(np.linalg.norm(p - q) < 1e-6 for q in out):
            out.append(p)
    return [tuple(map(float, p)) for p in out]


def _ball_profile(r, rings):
    return [(-r * math.cos(PI * i / rings), r * math.sin(PI * i / rings)) for i in range(rings + 1)]


def ball(m, c, radii, mat, mx=None, seg=20, rings=12, rot=None):
    """Smooth ellipsoid centred at c with radii (rx, ry, rz); `rot` an optional 4x4 rotation applied before moving to c."""
    rx, ry, rz = radii if isinstance(radii, (tuple, list)) else (radii, radii, radii)
    M = trans(*c) @ (rot if rot is not None else Matrix.Identity(4)) @ Matrix.Diagonal((rx, ry, rz, 1.0))
    if mx is not None:
        M = mx @ M
    m.lathe(_ball_profile(1.0, rings), mat, M, seg, smooth=80.0, cap=False)


def capsule(m, a, b, r0, r1=None, mat='skin', mx=None, seg=14, rings=4):
    """A limb: a cone between a and b with round caps of radius r0 at a and r1 at b."""
    r1 = r0 if r1 is None else r1
    a, b = Vector(a), Vector(b)
    d = (b - a).length
    prof = []
    for i in range(rings + 1):  # cap at a, from the pole to the equator
        t = PI / 2 * i / rings
        prof.append((-r0 * math.cos(t), r0 * math.sin(t)))
    for i in range(rings + 1):  # cap at b, from the equator to the pole
        t = PI / 2 * i / rings
        prof.append((d + r1 * math.sin(t), r1 * math.cos(t)))
    M = axis_matrix(a, b)
    if mx is not None:
        M = mx @ M
    m.lathe(prof, mat, M, seg, smooth=80.0, cap=False)


Mesh.ball = ball
Mesh.capsule = capsule


# ------------------------------------------------------------------------------------------------ scene

def cam_basis(elev=None):
    """Screen right, screen up and the view direction (into the scene) for the camera tilted down by `elev` degrees."""
    e = math.radians(ELEV if elev is None else elev)
    right = Vector((1.0, 0.0, 0.0))
    up = Vector((0.0, math.sin(e), math.cos(e)))
    view = Vector((0.0, math.cos(e), -math.sin(e)))
    return right, up, view


def screen_of(p, elev=None):
    """Screen position (metres, x right, y UP) of a world point, relative to the world origin's screen point."""
    r, u, _ = cam_basis(elev)
    p = Vector(p)
    return p.dot(r), p.dot(u)


def reset_scene(threads=4):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    cy.device = 'CPU'
    cy.use_denoising = False
    cy.use_adaptive_sampling = False
    cy.max_bounces = 0
    cy.diffuse_bounces = cy.glossy_bounces = cy.transmission_bounces = cy.transparent_max_bounces = 0
    cy.pixel_filter_type = 'BOX'
    cy.filter_width = 1.0
    cy.samples = 8
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = threads
    sc.render.film_transparent = True
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'Raw'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    ims = sc.render.image_settings
    ims.file_format = 'OPEN_EXR'
    ims.color_mode = 'RGBA'
    ims.color_depth = '32'
    ims.exr_codec = 'ZIP'
    w = bpy.data.worlds.new('w')
    w.color = (0, 0, 0)
    sc.world = w
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam.clip_start = 0.1
    cam.clip_end = 600.0
    cam.sensor_fit = 'AUTO'
    co = bpy.data.objects.new('cam', cam)
    sc.collection.objects.link(co)
    sc.camera = co
    mats.reset()
    return sc


def clear_objects():
    for ob in list(bpy.data.objects):
        if ob.type == 'MESH':
            bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)


def _verts(me):
    n = len(me.vertices)
    a = np.empty(n * 3, np.float32)
    me.vertices.foreach_get('co', a)
    return a.reshape(n, 3).astype(np.float64)


def bounds_of(parts, elev=None):
    """Screen bounds (x0, x1, y0, y1), metres from the world origin's screen point, y up, of [(mesh datablock, Matrix)]."""
    right, up, _ = cam_basis(elev)
    R = np.array([right, up], dtype=np.float64).T
    xs0, xs1, ys0, ys1 = 1e9, -1e9, 1e9, -1e9
    for me, mx in parts:
        if len(me.vertices) == 0:
            continue
        a = _verts(me)
        M = np.array(mx, dtype=np.float64)
        a = a @ M[:3, :3].T + M[:3, 3]
        s = a @ R
        xs0, xs1 = min(xs0, float(s[:, 0].min())), max(xs1, float(s[:, 0].max()))
        ys0, ys1 = min(ys0, float(s[:, 1].min())), max(ys1, float(s[:, 1].max()))
    if xs0 > xs1:
        return (-0.05, 0.05, -0.05, 0.05)
    return xs0, xs1, ys0, ys1


# ------------------------------------------------------------------------------------------------ rendering

SAMPLES = {0: 8, 1: 12, 2: 4, 3: 24}   # per mode: albedo, normal, emissive+gloss, occlusion (at the supersampled size)
MODES = ('alb', 'nrm', 'emg', 'ao')


def load_exr(path):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)[::-1].copy()


def box_down(a, s):
    h, w, c = a.shape
    return a.reshape(h // s, s, w // s, s, c).mean(axis=(1, 3))


def lin2srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


class Cell:
    """One frame to render: `parts` = [(mesh datablock, Matrix)], the pivot's screen point (metres) and the frame name."""

    def __init__(self, name, parts, pivot=(0.0, 0.0), pad=3, ppm=PPM, look=None, elev=None):
        self.name = name
        self.parts = parts
        self.pivot = pivot
        self.pad = pad
        self.ppm = ppm
        self.look = look or {}
        self.elev = elev
        x0, x1, y0, y1 = bounds_of(parts, elev)
        px, py = pivot
        # pixel rect relative to the pivot (y up), final pixels
        self.rect = (math.floor((x0 - px) * ppm) - pad, math.ceil((x1 - px) * ppm) + pad,
                     math.floor((y0 - py) * ppm) - pad, math.ceil((y1 - py) * ppm) + pad)
        self.w = self.rect[1] - self.rect[0]
        self.h = self.rect[3] - self.rect[2]


def _shelves(cells, gap, max_w):
    """Shelf-pack cells (tallest first) into sheets no wider than max_w and no taller than SHEET_MAX // SS.
    Returns [(sheet_w, sheet_h, [(cell, x, y)])], x, y = the cell's top-left in final pixels."""
    maxh = SHEET_MAX // SS
    order = sorted(cells, key=lambda c: (-c.h, -c.w, c.name))
    sheets = []
    cur, x, y, row_h, used_w = [], gap, gap, 0, 0
    for c in order:
        if c.w + 2 * gap > max_w or c.h + 2 * gap > maxh:
            raise SystemExit('frame %s (%dx%d px) is too big for a sheet' % (c.name, c.w, c.h))
        if x + c.w + gap > max_w:
            x = gap
            y += row_h + gap
            row_h = 0
        if y + c.h + gap > maxh:
            sheets.append((used_w, y, cur))
            cur, x, y, row_h, used_w = [], gap, gap, 0, 0
        cur.append((c, x, y))
        x += c.w + gap
        used_w = max(used_w, x)
        row_h = max(row_h, c.h)
    if cur:
        sheets.append((used_w, y + row_h + gap, cur))
    return sheets


def render_cells(cells, elev=None, log=None):
    """Render Cells, many per sheet. Returns {name: frame dict} (see `combine`)."""
    if not cells:
        return {}
    sc = bpy.context.scene
    ppm = cells[0].ppm
    elev = cells[0].elev if elev is None else elev
    assert all(c.ppm == ppm and c.elev == cells[0].elev for c in cells), 'one ppm and elevation per render_cells call'
    gap = max(16, int(math.ceil(0.55 * ppm)))      # 0.55 m between frames: wider than any AO reach
    out = {}
    for sw, sh, placed in _shelves(cells, gap, SHEET_MAX // SS):
        sw += sw % 2
        sh += sh % 2
        # objects: every cell's parts, moved so the cell's pivot lands at its place on the sheet
        r, u, v = cam_basis(elev)
        objs = []
        for c, x, y in placed:
            # the pivot's final-pixel position on the sheet (from the top-left, y down)
            pxs = x - c.rect[0]
            pys = y + c.rect[3]
            X = (pxs - sw / 2) / ppm - c.pivot[0]
            Y = (sh / 2 - pys) / ppm - c.pivot[1]
            off = trans(*(r * X + u * Y))
            for k, (me, mx) in enumerate(c.parts):
                ob = bpy.data.objects.new('%s_%d' % (c.name, k), me)
                sc.collection.objects.link(ob)
                ob.matrix_world = off @ mx
                objs.append(ob)
        cam = sc.camera
        cam.location = -v * 120.0
        e = math.radians(ELEV if elev is None else elev)
        cam.rotation_euler = (PI / 2 - e, 0.0, 0.0)
        cam.data.ortho_scale = max(sw, sh) / ppm
        sc.render.resolution_x = sw * SS
        sc.render.resolution_y = sh * SS
        os.makedirs(TMP, exist_ok=True)
        passes = {}
        for mode, nm in enumerate(MODES):
            mats.set_mode(mode)
            sc.cycles.samples = SAMPLES[mode]
            path = os.path.join(TMP, 'sheet_%s.exr' % nm)
            sc.render.filepath = path
            bpy.ops.render.render(write_still=True)
            passes[nm] = load_exr(path)
            os.remove(path)
        for ob in objs:
            bpy.data.objects.remove(ob, do_unlink=True)
        for c, x, y in placed:
            sl = (slice(y * SS, (y + c.h) * SS), slice(x * SS, (x + c.w) * SS))
            fr = combine({k: p[sl] for k, p in passes.items()}, c)
            out[c.name] = fr
        if log:
            log('sheet %dx%d, %d frames' % (sw, sh, len(placed)))
    return out


def _shift(a, dy, dx):
    """Shift an array by whole pixels, filling with edge zeros (no wrap)."""
    out = np.zeros_like(a)
    H, W = a.shape[:2]
    ys0, ys1 = max(0, dy), min(H, H + dy)
    xs0, xs1 = max(0, dx), min(W, W + dx)
    out[ys0:ys1, xs0:xs1] = a[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
    return out


def _dilate(a, r):
    """Max filter with a round footprint of radius r pixels."""
    out = a.copy()
    ri = int(math.ceil(r))
    for dy in range(-ri, ri + 1):
        for dx in range(-ri, ri + 1):
            if (dx or dy) and dx * dx + dy * dy <= r * r + 0.25:
                out = np.maximum(out, _shift(a, dy, dx))
    return out


# How a frame is finished. ao: how much the occlusion darkens; cavity / edge: darkening in creases and lightening on convex
# edges (from the normal map's curvature), which gives the painted look; rim: width (final px) of the thin dark edge round
# the silhouette and how dark it is (fraction of the colour beside it).
LOOK = dict(ao=0.42, cavity=0.35, edge=0.22, curv_scale=2.2, rim=1.0, rim_dark=0.38)


def combine(r, cell):
    """Four supersampled renders of one cell -> dict(albedo=HxWx4 uint8 straight sRGB, normal=HxWx4 uint8 (RG normal xy,
    B gloss, A emissive), w, h, px, py, ppm). px, py = the pivot in pixels from the frame's top-left, y down."""
    k = dict(LOOK)
    k.update(cell.look)
    ss = SS
    A = r['alb'][..., 3]
    known = A > 1e-4
    inv = np.where(known, 1.0 / np.maximum(A, 1e-4), 0.0)[..., None]
    alb = np.clip(r['alb'][..., :3] * inv, 0, 1)
    nrm = r['nrm'][..., :3] * inv * 2.0 - 1.0
    nrm /= np.maximum(np.linalg.norm(nrm, axis=-1, keepdims=True), 1e-6)
    emi = np.clip(r['emg'][..., 0] * inv[..., 0], 0, 1)
    glo = np.clip(r['emg'][..., 1] * inv[..., 0], 0, 1)
    ao = np.clip(r['ao'][..., :3] * inv, 0, 1)
    solid = A > 0.5
    # curvature: divergence of the screen-space normal (x right, y up; image rows run down)
    nx, ny = nrm[..., 0], nrm[..., 1]
    s_l, s_r = _shift(solid, 0, 1), _shift(solid, 0, -1)
    s_u, s_d = _shift(solid, 1, 0), _shift(solid, -1, 0)
    dnx = np.where(s_l & s_r & solid, (_shift(nx, 0, -1) - _shift(nx, 0, 1)) * 0.5, 0.0)
    dny = np.where(s_u & s_d & solid, (_shift(ny, 1, 0) - _shift(ny, -1, 0)) * 0.5, 0.0)
    curv = (dnx + dny) * ss * k['curv_scale']
    occ = np.clip(ao[..., 0:1] ** 0.8 * ao[..., 1:2] ** 0.7 * ao[..., 2:3] ** 1.2, 0, 1)
    col = alb * (1.0 - k['ao'] * (1.0 - occ))
    col = col * (1.0 + k['edge'] * np.clip(curv, 0, 1)[..., None]) * (1.0 - k['cavity'] * np.clip(-curv, 0, 1)[..., None])
    col = np.where(emi[..., None] > 0.5, alb, np.clip(col, 0, 1))
    # thin dark rim: alpha grown by `rim` final pixels, coloured by the nearest solid colour, darkened
    R = k['rim'] * ss
    if R > 0:
        A_out = np.clip(_dilate(A, R), 0, 1)
        grow = col * A[..., None]
        gw = A.copy()
        for _ in range(int(math.ceil(R)) + 1):
            grow = np.maximum(grow, np.max([_shift(grow, 1, 0), _shift(grow, -1, 0), _shift(grow, 0, 1), _shift(grow, 0, -1)], axis=0))
            gw = np.maximum(gw, np.max([_shift(gw, 1, 0), _shift(gw, -1, 0), _shift(gw, 0, 1), _shift(gw, 0, -1)], axis=0))
        edge_col = (grow / np.maximum(gw[..., None], 1e-4)) * k['rim_dark']
    else:
        A_out = A.copy()
        edge_col = col
    a_s = A[..., None]
    a_o = A_out[..., None]
    out_a = a_s + a_o * (1 - a_s)
    pm = col * a_s + edge_col * a_o * (1 - a_s)
    n_flat = np.zeros_like(nrm)
    n_flat[..., 2] = 1.0
    npm = nrm * a_s + n_flat * a_o * (1 - a_s)
    epm = emi[..., None] * a_s
    gpm = glo[..., None] * a_s
    out_a = box_down(out_a, ss)
    pm = box_down(pm, ss)
    npm = box_down(npm, ss)
    epm = box_down(epm, ss)
    gpm = box_down(gpm, ss)
    inv2 = np.where(out_a > 1e-4, 1.0 / np.maximum(out_a, 1e-4), 0.0)
    col = np.clip(pm * inv2, 0, 1)
    n = npm * inv2
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    e = np.clip(epm[..., 0] * inv2[..., 0], 0, 1)
    g = np.clip(gpm[..., 0] * inv2[..., 0], 0, 1)
    a8 = np.clip(np.round(out_a[..., 0] * 255), 0, 255)
    vis = (a8 > 0)[..., None]
    alb8 = np.where(vis, np.clip(np.round(lin2srgb(col) * 255), 0, 255), 0)
    nx8 = np.clip(np.round((n[..., 0] * 0.5 + 0.5) * 255), 0, 255)
    ny8 = np.clip(np.round((n[..., 1] * 0.5 + 0.5) * 255), 0, 255)
    v0 = vis[..., 0]
    nx8 = np.where(v0, nx8, 128)
    ny8 = np.where(v0, ny8, 128)
    g8 = np.where(v0, np.clip(np.round(g * 255), 0, 255), 0)
    e8 = np.where(v0, np.clip(np.round(e * 255), 0, 255), 0)
    albedo = np.concatenate([alb8, a8[..., None]], axis=-1).astype(np.uint8)
    normal = np.stack([nx8, ny8, g8, e8], axis=-1).astype(np.uint8)
    # pivot in pixels from the top-left (y down)
    return trim(dict(albedo=albedo, normal=normal, w=cell.w, h=cell.h, px=-cell.rect[0], py=cell.rect[3], ppm=cell.ppm), cell.pad)


def trim(fr, pad):
    """Cut a frame down to its visible pixels plus `pad`, keeping the pivot."""
    a = fr['albedo'][..., 3]
    ys, xs = np.nonzero(a)
    if len(xs) == 0:
        y0, y1, x0, x1 = 0, 2, 0, 2
    else:
        y0, y1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + 1 + pad)
        x0, x1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + 1 + pad)
    return dict(albedo=fr['albedo'][y0:y1, x0:x1], normal=fr['normal'][y0:y1, x0:x1], w=int(x1 - x0), h=int(y1 - y0),
                px=int(fr['px'] - x0), py=int(fr['py'] - y0), ppm=fr['ppm'])


# ------------------------------------------------------------------------------------------------ files

def write_png(path, arr):
    arr = np.ascontiguousarray(arr, dtype=np.uint8)
    h, w, c = arr.shape
    ct = {3: 2, 4: 6}[c]
    raw = np.zeros((h, w * c + 1), np.uint8)
    raw[:, 1:] = arr.reshape(h, w * c)

    def chunk(t, d):
        x = struct.pack('>I', len(d)) + t + d
        return x + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, ct, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(raw.tobytes(), 6)))
        f.write(chunk(b'IEND', b''))


def read_png(path):
    """RGBA uint8 array through Blender's image loader (no colour transform)."""
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = 'Non-Color'
    img.alpha_mode = 'STRAIGHT'
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return np.clip(np.round(a.reshape(h, w, 4)[::-1] * 255), 0, 255).astype(np.uint8)


def save_frame(fr, name, outdir):
    """Write a frame's two images and its metadata."""
    import json
    os.makedirs(outdir, exist_ok=True)
    write_png(os.path.join(outdir, name + '.a.png'), fr['albedo'])
    write_png(os.path.join(outdir, name + '.n.png'), fr['normal'])
    meta = {k: fr[k] for k in ('w', 'h', 'px', 'py', 'ppm')}
    with open(os.path.join(outdir, name + '.json'), 'w') as f:
        json.dump(meta, f)
