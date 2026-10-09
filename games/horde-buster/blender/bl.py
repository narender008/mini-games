"""Horde Buster sprite pipeline: geometry, scene and render helpers (run inside headless Blender).

World: X right, Z up, characters stand on the XY plane at the origin. Enemies face -Y (toward the camera), the hero faces +Y.
The orthographic camera looks along +Y tilted DOWN by ELEV degrees, so we see the horde from above and in front, like the game's
camera behind the hero. One Blender metre is 54 game units; atlas frames are 56 px per metre unless a frame says otherwise.

A model is built as one or more `Mesh` objects (bmesh + material keys), turned into Blender objects and rendered five times with a
different MODE in every material (albedo, camera-space normal, emissive mask, ambient occlusion, depth). `combine` turns the five
renders into one straight-alpha albedo frame with cartoon ink lines (inner creases and depth steps, plus a bold outer outline) and one
normal frame whose alpha is the emissive mask. Everything is deterministic (fixed seeds, `mathutils.noise.noise` only).
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
# scratch EXRs: one folder per Blender process, so several art lanes can render at the same time
TMP = os.path.join(os.environ.get('HB_TMP') or os.path.join(os.environ.get('TMPDIR', '/tmp'), 'horde-buster-tmp'), str(os.getpid()))
ELEV = 35.0          # camera tilt below the horizon, degrees
UNITS_PER_M = 54.0   # game units per Blender metre
PPM = 56             # default atlas pixels per metre (about 1.04 px per game unit)


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


# ------------------------------------------------------------------------------------------------ mesh builder

class Mesh:
    """A bmesh plus the list of material keys its faces use. Every primitive is built in a temporary bmesh, then merged."""

    def __init__(self, name='part'):
        self.name = name
        self.bm = bmesh.new()
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
        tb.verts.index_update()
        vm = [None] * len(tb.verts)
        for v in tb.verts:
            vm[v.index] = bm.verts.new(mx @ v.co if mx is not None else v.co)
        flip = mx is not None and mx.determinant() < 0
        for f in tb.faces:
            vs = [vm[v.index] for v in f.verts]
            if flip:
                vs.reverse()
            try:
                nf = bm.faces.new(vs)
            except ValueError:
                continue
            nf.material_index = mi
            nf.smooth = f.smooth
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
        vm = [None] * len(ob.verts)
        for v in ob.verts:
            vm[v.index] = bm.verts.new(mx @ v.co if mx is not None else v.co)
        flip = mx is not None and mx.determinant() < 0
        remap = {}
        for i, key in enumerate(other.mats):
            remap[i] = self._mi(key)
        for f in ob.faces:
            vs = [vm[v.index] for v in f.verts]
            if flip:
                vs.reverse()
            try:
                nf = bm.faces.new(vs)
            except ValueError:
                continue
            nf.material_index = remap.get(f.material_index, 0)
            nf.smooth = f.smooth
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
        """Displace every vertex by smooth noise (bends and dents burnt-out metal)."""
        from mathutils import noise as mn
        off = Vector((seed * 3.7, seed * 1.9, seed * 5.1))
        oy, oz = Vector((17.3, 4.1, 9.7)), Vector((-6.2, 23.9, 11.3))
        for v in self.bm.verts:
            # three scalar noise lookups: mathutils' noise_vector is not repeatable between runs, noise() is
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

    def prism_n(self, pts_xz, y0, y1, mat, mx=None, smooth=0.0, bevel=0.0):
        """Like prism, but each polygon vertex also carries its own y-offset: pts are (x, z)."""
        self.prism(pts_xz, y0, y1, mat, mx, smooth, bevel)

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

    def slab(self, pts_xz, y0, y1, mat, cuts=(), mx=None, smooth=0.0, bevel=0.0):
        """Convex prism from a convex CCW side polygon, optionally cut by extra planes (plan chamfers etc)."""
        planes = poly_planes(pts_xz) + [((0, 1, 0), y1), ((0, -1, 0), -y0)] + list(cuts)
        self.convex(planes, mat, mx, smooth, bevel)

    def box(self, x0, x1, y0, y1, z0, z1, mat, mx=None, bevel=0.0, smooth=0.0):
        tb = bmesh.new()
        bmesh.ops.create_cube(tb, size=1.0)
        bmesh.ops.scale(tb, vec=(x1 - x0, y1 - y0, z1 - z0), verts=tb.verts[:])
        bmesh.ops.translate(tb, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=tb.verts[:])
        self.commit(tb, mat, smooth, mx, bevel)

    def lathe(self, profile, mat, mx=None, seg=24, smooth=40.0, phase=0.0, cap=True, bevel=0.0):
        """Solid of revolution about local +Z. profile = [(z, radius), ...] along the axis."""
        tb = bmesh.new()
        rings = []
        for z, r in profile:
            if r < 1e-6:
                rings.append([tb.verts.new((0, 0, z))])
            else:
                rings.append([tb.verts.new((r * math.cos(phase + 2 * PI * j / seg),
                                            r * math.sin(phase + 2 * PI * j / seg), z)) for j in range(seg)])
        for i in range(len(rings) - 1):
            a, b = rings[i], rings[i + 1]
            for j in range(seg):
                j2 = (j + 1) % seg
                if len(a) == 1 and len(b) == 1:
                    continue
                if len(a) == 1:
                    vs = [a[0], b[j2], b[j]]
                elif len(b) == 1:
                    vs = [a[j], a[j2], b[0]]
                else:
                    vs = [a[j], a[j2], b[j2], b[j]]
                try:
                    tb.faces.new(vs)
                except ValueError:
                    pass
        if cap:
            for ring in (rings[0], rings[-1]):
                if len(ring) > 2:
                    try:
                        tb.faces.new(ring)
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

    def tube(self, pts, r, mat, seg=8, smooth=60.0, mx=None, cap=True):
        """Constant-radius tube along a 3D polyline (parallel-transport frames)."""
        P = [Vector(p) for p in pts]
        tb = bmesh.new()
        rings = []
        t0 = (P[1] - P[0]).normalized()
        up = Vector((0, 1, 0)) if abs(t0.y) < 0.9 else Vector((1, 0, 0))
        u = t0.cross(up).normalized()
        for i, p in enumerate(P):
            if i == 0:
                t = (P[1] - P[0]).normalized()
            elif i == len(P) - 1:
                t = (P[-1] - P[-2]).normalized()
            else:
                t = ((P[i + 1] - P[i]).normalized() + (P[i] - P[i - 1]).normalized()).normalized()
            u = (u - t * u.dot(t)).normalized()
            v = t.cross(u)
            rr = r[i] if isinstance(r, (list, tuple)) else r
            rings.append([tb.verts.new(p + (u * math.cos(2 * PI * j / seg) + v * math.sin(2 * PI * j / seg)) * rr)
                          for j in range(seg)])
        for i in range(len(rings) - 1):
            for j in range(seg):
                j2 = (j + 1) % seg
                try:
                    tb.faces.new([rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]])
                except ValueError:
                    pass
        if cap:
            for ring in (rings[0], rings[-1]):
                try:
                    tb.faces.new(ring)
                except ValueError:
                    pass
        self.commit(tb, mat, smooth, mx)

    def grid_sheet(self, fn, nu, nv, mat, mx=None, smooth=50.0, thick=0.0):
        """Parametric sheet: fn(u, v) -> (x, y, z) for u, v in 0..1. With thick > 0 it gets a backing surface (solid-ish)."""
        tb = bmesh.new()
        vs = [[tb.verts.new(fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
        for i in range(nu):
            for j in range(nv):
                try:
                    tb.faces.new([vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]])
                except ValueError:
                    pass
        self.commit(tb, mat, smooth, mx)

    def to_obj(self, name=None, collection=None):
        me = bpy.data.meshes.new((name or self.name) + '_mesh')
        bm = self.bm
        bm.normal_update()
        bm.to_mesh(me)
        for key in self.mats:
            me.materials.append(mats.get(key))
        ob = bpy.data.objects.new(name or self.name, me)
        (collection or bpy.context.scene.collection).objects.link(ob)
        return ob

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
    """Screen right, screen up and the view direction (toward the scene) for a camera tilted down by `elev` degrees."""
    e = math.radians(ELEV if elev is None else elev)
    right = Vector((1.0, 0.0, 0.0))
    up = Vector((0.0, math.sin(e), math.cos(e)))
    view = Vector((0.0, math.cos(e), -math.sin(e)))
    return right, up, view


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
    cam.clip_end = 400.0
    cam.sensor_fit = 'AUTO'
    co = bpy.data.objects.new('cam', cam)
    sc.collection.objects.link(co)
    sc.camera = co
    mats.reset()
    return sc


def clear_objects():
    for ob in list(bpy.data.objects):
        if ob.type == 'MESH':
            me = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            if me.users == 0:
                bpy.data.meshes.remove(me)


def screen_bounds(objs, elev=None):
    """Bounds (x0, x1, y0, y1) of the objects on screen, in metres from the world origin (y up)."""
    right, up, _ = cam_basis(elev)
    R = np.array([right, up], dtype=np.float64).T
    xs0, xs1, ys0, ys1 = 1e9, -1e9, 1e9, -1e9
    for ob in objs:
        me = ob.data
        n = len(me.vertices)
        if n == 0:
            continue
        a = np.empty(n * 3, np.float32)
        me.vertices.foreach_get('co', a)
        a = a.reshape(n, 3).astype(np.float64)
        mw = np.array(ob.matrix_world, dtype=np.float64)
        a = a @ mw[:3, :3].T + mw[:3, 3]
        s = a @ R
        xs0, xs1 = min(xs0, float(s[:, 0].min())), max(xs1, float(s[:, 0].max()))
        ys0, ys1 = min(ys0, float(s[:, 1].min())), max(ys1, float(s[:, 1].max()))
    return xs0, xs1, ys0, ys1


def frame_rect(bounds, ppm, pivot=(0.0, 0.0), pad=4):
    """Pixel rectangle (left, right, bottom, top) relative to the pivot's screen point, y up."""
    x0, x1, y0, y1 = bounds
    px, py = pivot
    return (math.floor((x0 - px) * ppm) - pad, math.ceil((x1 - px) * ppm) + pad,
            math.floor((y0 - py) * ppm) - pad, math.ceil((y1 - py) * ppm) + pad)


def union_rect(a, b):
    return (min(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), max(a[3], b[3]))


# ------------------------------------------------------------------------------------------------ rendering

SAMPLES = {0: 8, 1: 12, 2: 4, 3: 24, 4: 4}   # per mode: albedo, normal, emissive, occlusion, depth (at the supersampled size)
SS = 2
MODES = ('alb', 'nrm', 'emi', 'ao', 'dep')


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


def render_frame(objs, ppm=PPM, rect=None, pad=4, elev=None, pivot=(0.0, 0.0), tag='f', ink=None):
    """Render the objects (every other mesh hidden). pivot = screen point (metres) of the frame pivot; the default is the world
    origin. Returns dict(albedo=HxWx4 uint8 straight, normal=HxWx4 uint8 (alpha = emissive), w, h, px, py, ppm)."""
    sc = bpy.context.scene
    ss = SS
    if rect is None:
        rect = frame_rect(screen_bounds(objs, elev), ppm, pivot, pad)
    left, right, bottom, top = rect
    w, h = right - left, top - bottom
    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            hide = ob not in objs
            ob.hide_render = hide
            ob.hide_viewport = hide
    r, u, v = cam_basis(elev)
    cx = pivot[0] + (left + right) / (2.0 * ppm)
    cy = pivot[1] + (top + bottom) / (2.0 * ppm)
    cam = sc.camera
    cam.location = r * cx + u * cy - v * 60.0
    e = math.radians(ELEV if elev is None else elev)
    cam.rotation_euler = (PI / 2 - e, 0.0, 0.0)
    cam.data.ortho_scale = max(w, h) / ppm
    sc.render.resolution_x = w * ss
    sc.render.resolution_y = h * ss
    os.makedirs(TMP, exist_ok=True)
    out = {}
    for mode, nm in enumerate(MODES):
        mats.set_mode(mode)
        sc.cycles.samples = SAMPLES[mode]
        path = os.path.join(TMP, '%s_%s.exr' % (tag, nm))
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        out[nm] = load_exr(path)
        os.remove(path)
    return combine(out, w, h, left, top, ppm, ink or {})


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


INK = dict(outline=2.2, depth=0.06, crease=0.45, inner=0.8, outer_dark=0.16, line_dark=0.28)


def combine(r, w, h, left, top, ppm, ink):
    """Five supersampled renders -> one frame. Ink: an outer outline `outline` px wide (final pixels) in a very dark shade of the
    colour beside it, plus inner lines where depth steps by more than `depth` metres or the normal bends by more than `crease`."""
    k = dict(INK)
    k.update(ink)
    ss = SS
    A = r['alb'][..., 3]
    known = A > 1e-4
    inv = np.where(known, 1.0 / np.maximum(A, 1e-4), 0.0)[..., None]
    alb = np.clip(r['alb'][..., :3] * inv, 0, 1)
    nrm = r['nrm'][..., :3] * inv * 2.0 - 1.0
    nrm /= np.maximum(np.linalg.norm(nrm, axis=-1, keepdims=True), 1e-6)
    emi = np.clip(r['emi'][..., 0] * inv[..., 0], 0, 1)
    ao = np.clip(r['ao'][..., :3] * inv, 0, 1)
    dep = r['dep'][..., 0] * inv[..., 0]
    solid = A > 0.5
    # inner ink: depth steps (one part in front of another) and sharp creases, judged between solid neighbours only
    line = np.zeros(A.shape, np.float32)
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        s2 = _shift(solid, dy, dx) & solid
        dd = np.abs(_shift(dep, dy, dx) - dep)
        nd = 1.0 - np.sum(_shift(nrm, dy, dx) * nrm, axis=-1)
        hit = s2 & ((dd > k['depth']) | (nd > k['crease']))
        line = np.maximum(line, hit.astype(np.float32))
        line = np.maximum(line, _shift(hit, -dy, -dx).astype(np.float32))
    if k['inner'] > 0:
        line = _dilate(line, max(0.5, ss * 0.35)) * k['inner']
    else:
        line[:] = 0
    occ = np.clip(ao[..., 0:1] ** 0.8 * ao[..., 1:2] ** 0.7 * ao[..., 2:3] ** 1.2, 0, 1)
    col = alb * (1.0 - 0.32 * (1.0 - occ))
    col = col * (1.0 - line[..., None] * (1.0 - k['line_dark']))
    # glowing parts keep their colour under the ink
    col = np.where(emi[..., None] > 0.5, alb, col)
    # outer outline: alpha grown by `outline` final pixels, coloured by the nearest solid colour, darkened
    R = k['outline'] * ss
    A_out = np.clip(_dilate(A, R), 0, 1) if R > 0 else A.copy()
    near = col * A[..., None]
    wsum = A.copy()
    grow = near.copy()
    gw = wsum.copy()
    for _ in range(int(math.ceil(R)) + 1):
        grow = np.maximum(grow, np.max([_shift(grow, 1, 0), _shift(grow, -1, 0), _shift(grow, 0, 1), _shift(grow, 0, -1)], axis=0))
        gw = np.maximum(gw, np.max([_shift(gw, 1, 0), _shift(gw, -1, 0), _shift(gw, 0, 1), _shift(gw, 0, -1)], axis=0))
    edge_col = (grow / np.maximum(gw[..., None], 1e-4)) * k['outer_dark']
    # composite: the sprite over its outline
    a_s = A[..., None]
    a_o = A_out[..., None]
    out_a = a_s + a_o * (1 - a_s)
    pm = col * a_s + edge_col * a_o * (1 - a_s)
    n_flat = np.zeros_like(nrm)
    n_flat[..., 2] = 1.0
    npm = nrm * a_s + n_flat * a_o * (1 - a_s)
    epm = emi[..., None] * a_s
    # down to the final size (premultiplied box filter)
    out_a = box_down(out_a, ss)
    pm = box_down(pm, ss)
    npm = box_down(npm, ss)
    epm = box_down(epm, ss)
    inv2 = np.where(out_a > 1e-4, 1.0 / np.maximum(out_a, 1e-4), 0.0)
    col = np.clip(pm * inv2, 0, 1)
    n = npm * inv2
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    e = np.clip(epm[..., 0] * inv2[..., 0], 0, 1)
    a8 = np.clip(np.round(out_a[..., 0] * 255), 0, 255)
    vis = (a8 > 0)[..., None]
    alb8 = np.where(vis, np.clip(np.round(lin2srgb(col) * 255), 0, 255), 0)
    ne8 = np.where(vis, np.clip(np.round((n * 0.5 + 0.5) * 255), 0, 255), np.array([128, 128, 255]))
    e8 = np.where(vis[..., 0], np.clip(np.round(e * 255), 0, 255), 0)
    albedo = np.concatenate([alb8, a8[..., None]], axis=-1).astype(np.uint8)
    normal = np.concatenate([ne8, e8[..., None]], axis=-1).astype(np.uint8)
    return dict(albedo=albedo, normal=normal, w=w, h=h, px=-left, py=top, ppm=ppm)


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
