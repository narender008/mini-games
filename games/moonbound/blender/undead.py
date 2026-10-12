"""Shared skeleton anatomy for the Gloamwall's bone legion (thrall, gravebow, warden).

Everything is built facing SOUTH (-Y) on z = 0 like the rest of the kit. A figure is posed by `rig.Skeleton` (torso, head, FK
limbs) plus two-bone IK for planted feet and for hands that hold weapons, then turned into rigid PIECES (skull, jaw, thorax with
ribs / sternum / thoracic spine / scapulae / clavicles, lumbar spine, pelvis, cervical spine, femur, tibia + fibula, foot, humerus,
radius + ulna, hand) each with a world matrix. Pieces are built once per style as prototypes in their own bone frame and copied
into every frame's mesh, so a frame costs a few thousand faces whatever the pose. A death animation can move the pieces
independently (see `collapse`), which is how the bones fall apart into a heap.

    fig = Undead('thrall')
    J = fig.solve(Pose(lean=0.3, ...), arms={'r': 'grip', 'l': 'wrist'})   # joints, frames, hands
    parts = fig.pieces(J)                                                  # [(name, proto key, Matrix)]
    fig.assemble(m, parts)                                                 # into a bl.Mesh

Pose keys beyond rig.Pose: jaw (mouth open, rad), curl_l / curl_r (finger curl 0..1.6), IK feet in ground coordinates
(x east, f = forward, z up): fl_x fl_f fl_z fl_yaw fl_pitch and fr_* (needs `ikf`: 1); IK hands in ROOT coordinates, wrist mode:
wl_x wl_f wl_z / wr_*, grip mode: gl_x gl_f gl_z gl_az gl_el gl_roll / gr_* (weapon axis: az = yaw toward the figure's left,
el = elevation). Elbow poles: eo_l eb_l ed_l (out, back, down biases).
"""
import math
import random
import zlib

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import bl
import mats
import rig
from bl import Mesh, trans, rotx, roty, rotz, scale, axis_matrix
from rig import Pose, Skeleton, frame_along, two_bone

PI = math.pi
import os
DBG = bool(os.environ.get('UDBG'))
HEAD_K = 1.0
LAT_LEG = Matrix.Diagonal((1.25, 1.25, 1.0, 1.0))      # limb bones are thickened sideways for readability at 72 px/m
LAT_ARM = Matrix.Diagonal((1.22, 1.22, 1.0, 1.0))
FOOT_K = Matrix.Diagonal((1.12, 1.1, 1.1, 1.0))
HAND_K = Matrix.Diagonal((1.12, 1.12, 1.12, 1.0))
MIRROR = Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))
I4 = Matrix.Identity(4)

# ------------------------------------------------------------------------------------------------ materials


def _define():
    d = mats.define
    # bone: three weathering styles (thrall grimy, gravebow paler and drier, warden dark under its plate)
    d('und_bone_t', base='#d0c5a9', base2='#7a6e58', pattern='noise', pscale=15, pamt=0.62, gloss=0.2, wear=0.55, bump=0.3,
      bscale=110, seed=71, bevel=0.003, dirt=0.25)
    d('und_bone_g', base='#ddd3bc', base2='#a29780', pattern='noise', pscale=15, pamt=0.55, gloss=0.2, wear=0.5, bump=0.28,
      bscale=110, seed=72, bevel=0.003, dirt=0.15)
    d('und_bone_w', base='#c2b79b', base2='#5c5242', pattern='noise', pscale=14, pamt=0.65, gloss=0.18, wear=0.5, bump=0.3,
      bscale=110, seed=73, bevel=0.003, dirt=0.3)
    d('und_bone_dark', base='#6c624f', base2='#2f2a23', pattern='noise', pscale=12, pamt=0.7, gloss=0.1, seed=75, bevel=0.003)
    d('und_tooth', base='#e6dec6', base2='#a69b80', pattern='noise', pscale=20, pamt=0.5, gloss=0.3, seed=77, bevel=0.002)
    d('und_void', base='#06060b', bevel=0.002)
    d('und_glow', base='#2fcab3', emit=0.75, bevel=0.004)        # the dim soul-light between the ribs
    d('und_glow_cyan', base='#58d6ee', emit=0.75, bevel=0.004)
    # metals: rust, blackened iron
    d('und_rust', base='#4a3629', base2='#8a5a36', pattern='noise', pscale=9, pamt=0.85, gloss=0.28, wear=0.55, bump=0.55,
      bscale=70, seed=81, bevel=0.004)
    d('und_rust_dark', base='#2b221d', base2='#5a3d2b', pattern='noise', pscale=8, pamt=0.8, gloss=0.22, wear=0.5, bump=0.5,
      bscale=70, seed=82, bevel=0.004)
    d('und_iron', base='#24262c', base2='#454a56', pattern='noise', pscale=9, pamt=0.6, gloss=0.5, wear=0.85, bump=0.2,
      bscale=80, seed=83, bevel=0.005)
    d('und_blade', base='#3b4048', base2='#8c5a36', pattern='noise', pscale=12, pamt=0.85, gloss=0.5, wear=0.9, bump=0.35,
      bscale=100, seed=84, bevel=0.003)
    # cloth
    d('und_navy', base='#222541', base2='#363c63', pattern='weave', pscale=3, pamt=0.65, seed=41, dirt=0.35)
    d('und_violet', base='#312d4a', base2='#4a4570', pattern='weave', pscale=3, pamt=0.65, seed=42, dirt=0.35)
    d('und_cloak', base='#2b2840', base2='#46425f', pattern='weave', pscale=3, pamt=0.7, seed=43, dirt=0.3)
    d('und_helm', base='#2b2a2e', base2='#6a4b3a', pattern='noise', pscale=8, pamt=0.85, gloss=0.35, wear=0.65, bump=0.5,
      bscale=60, seed=85, bevel=0.004)
    d('und_leather', base='#2e231d', base2='#4d3a2c', pattern='noise', pscale=9, pamt=0.6, gloss=0.2, wear=0.5, bump=0.3,
      bscale=60, seed=44)
    d('und_wood', base='#2a1d15', base2='#4a3624', pattern='grain', pscale=9, pamt=0.6, wear=0.4, dirt=0.2, gloss=0.25, seed=45)


_define()

STYLES = {
    'thrall': dict(bone='und_bone_t', dark='und_bone_dark', void='und_void', tooth='und_tooth', eye='soul_teal', glow='und_glow'),
    'gravebow': dict(bone='und_bone_g', dark='und_bone_dark', void='und_void', tooth='und_tooth', eye='soul', glow='und_glow_cyan'),
    'warden': dict(bone='und_bone_w', dark='und_bone_dark', void='und_void', tooth='und_tooth', eye='soul_teal', glow='und_glow'),
}

DIMS = dict(hip_h=0.965, hip_w=0.095, thigh=0.46, shin=0.44, foot=0.2, ankle_h=0.065, spine=0.20, chest_h=0.30, sh_w=0.19,
            upper=0.31, fore=0.27, hand=0.10, neck=0.12)


# ------------------------------------------------------------------------------------------------ small helpers

def image(key, rgba):
    """Register an RGBA float image (row 0 at the TOP) for `tex=` material specs. mats.image() sets the colour space AFTER writing
    the pixels, which makes Blender regenerate the (generated) image black; this one sets everything first and packs it."""
    rgba = np.asarray(rgba, np.float32)
    h, w = rgba.shape[:2]
    img = bpy.data.images.get('tex_' + key) or bpy.data.images.new('tex_' + key, w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'sRGB'
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).ravel())
    img.update()
    img.pack()
    mats._images[key] = img
    return img


def catmull(pts, n):
    """n points of a Catmull-Rom curve through pts."""
    P = [Vector(p) for p in pts]
    segs = len(P) - 1
    out = []
    for i in range(n):
        u = i / (n - 1) * segs
        k = min(int(u), segs - 1)
        t = u - k
        p0, p1, p2, p3 = P[max(k - 1, 0)], P[k], P[k + 1], P[min(k + 2, len(P) - 1)]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out


def lerp(a, b, t):
    return a + (b - a) * t


def tab(table, u):
    """Linear lookup of a list at u in 0..1."""
    x = min(max(u, 0.0), 1.0) * (len(table) - 1)
    i = min(int(x), len(table) - 2)
    return lerp(table[i], table[i + 1], x - i)


def shaft(m, a, b, ra, rb, rm, mat, ka=1.0, kb=1.0, seg=8, mx=None, n=7):
    """A long bone from a to b: flared ends (ra, rb), slim middle (rm), optional knobs (ball radius = r * k, 0 = none)."""
    a, b = Vector(a), Vector(b)
    d = (b - a).length
    if d < 1e-6:
        return
    prof = [(i / (n - 1) * d, rm + (ra - rm) * (1 - i / (n - 1)) ** 2.4 + (rb - rm) * (i / (n - 1)) ** 2.4) for i in range(n)]
    M = axis_matrix(a, b)
    if mx is not None:
        M = mx @ M
    m.lathe(prof, mat, M, seg, smooth=70, cap=not (ka or kb))
    if ka:
        m.ball(tuple(a), (ra * ka,) * 3, mat, mx=mx, seg=max(seg, 8), rings=5)
    if kb:
        m.ball(tuple(b), (rb * kb,) * 3, mat, mx=mx, seg=max(seg, 8), rings=5)


def sculpt_ball(c, radii, mat, void, dents, deform=None, seg=36, rings=24):
    """Ellipsoid with an optional deform(p) hook and soft steep dents [(centre, rx, rz, depth)] (eye sockets, nasal hole); the
    faces at the bottom of a dent get the `void` material."""
    c = Vector(c)
    t = Mesh('sculpt')
    t.ball(tuple(c), radii, mat, seg=seg, rings=rings)
    vi = t._mi(void) if void else None
    for v in t.bm.verts:
        p = v.co.copy()
        if deform:
            p = deform(p)
        n = Vector(((p.x - c.x) / radii[0] ** 2, (p.y - c.y) / radii[1] ** 2, (p.z - c.z) / radii[2] ** 2)).normalized()
        for q, rx, rz, depth in dents:
            if p.y > q.y + 0.04:
                continue
            dd = math.hypot((p.x - q.x) / rx, (p.z - q.z) / rz)
            if dd < 1.0:
                w = min((1.0 - dd) / 0.4, 1.0)
                p -= n * (depth * w * w * (3 - 2 * w))
        v.co = p
    if void:
        for f in t.bm.faces:
            cc = f.calc_center_median()
            for q, rx, rz, depth in dents:
                if cc.y < q.y + 0.04 and math.hypot((cc.x - q.x) / rx, (cc.z - q.z) / rz) < 0.8:
                    f.material_index = vi
    return t


# ------------------------------------------------------------------------------------------------ prototypes (bone frames)

def _exit(O, u, C, r):
    """Distance along the unit ray u from the point O to where it leaves the ellipsoid (centre C, radii r)."""
    qx, qy, qz = (O[0] - C[0]) / r[0], (O[1] - C[1]) / r[1], (O[2] - C[2]) / r[2]
    vx, vy, vz = u[0] / r[0], u[1] / r[1], u[2] / r[2]
    a = vx * vx + vy * vy + vz * vz
    b = qx * vx + qy * vy + qz * vz
    c = qx * qx + qy * qy + qz * qz - 1.0
    disc = b * b - a * c
    if disc <= 0:
        return 0.0
    return (-b + math.sqrt(disc)) / a


def _smax(vals, k=330.0):
    m = max(vals)
    return m + math.log(sum(math.exp(k * (v - m)) for v in vals)) / k


SK_O = (0.0, 0.004, 0.05)
SK_ELL = [((0.0, 0.016, 0.086), (0.071, 0.088, 0.068)),            # cranium
          ((0.0, -0.030, 0.056), (0.066, 0.046, 0.056)),           # frontal / face plane
          ((0.0, -0.050, 0.006), (0.050, 0.045, 0.045)),           # maxilla
          ((0.060, -0.050, 0.032), (0.016, 0.024, 0.018)),         # cheekbones
          ((-0.060, -0.050, 0.032), (0.016, 0.024, 0.018)),
          ((0.032, -0.064, 0.080), (0.032, 0.014, 0.010)),         # brow ridges
          ((-0.032, -0.064, 0.080), (0.032, 0.014, 0.010)),
          ((0.0, -0.074, 0.066), (0.011, 0.010, 0.015)),           # nasal bridge
          ((0.0, -0.058, -0.03), (0.03, 0.03, 0.022))]             # palate
SK_DENTS = [((0.033, -0.074, 0.053), 0.029, 0.026, 0.030, 0.006),      # eye sockets
            ((-0.033, -0.074, 0.053), 0.029, 0.026, 0.030, 0.006),
            ((0.0, -0.095, 0.022), 0.0135, 0.0195, 0.03, 0.0),         # nasal aperture
            ((0.071, -0.03, 0.07), 0.03, 0.03, 0.007, 0.0),            # temples
            ((-0.071, -0.03, 0.07), 0.03, 0.03, 0.007, 0.0)]


def skull_rho(u):
    d = [_exit(SK_O, u, c, r) for c, r in SK_ELL]
    rho = _smax(d)
    px, py, pz = SK_O[0] + u[0] * rho, SK_O[1] + u[1] * rho, SK_O[2] + u[2] * rho
    wv = 0.0
    for (qx, qy, qz), rx, rz, depth, rim in SK_DENTS:
        dd = math.sqrt(((px - qx) / rx) ** 2 + ((pz - qz) / rz) ** 2 + ((py - qy) / 0.017) ** 2)
        if dd < 1.0:
            w = min((1.0 - dd) / 0.85, 1.0)
            rho -= depth * w * w * (3 - 2 * w)
            if depth > 0.02:
                wv = max(wv, min(w * 1.6, 1.0))
        elif rim:
            rho += rim * math.exp(-((dd - 1.12) / 0.16) ** 2)
    return rho, wv


def radial_mesh(m, O, fn, rings, seg, mat, void, mx=None):
    """A closed surface rho(u) round O on a UV sphere; faces where the second value of fn is > 0.45 get the `void` material."""
    grid = []
    for i in range(rings + 1):
        th = PI * i / rings
        row = []
        for j in range(seg if 0 < i < rings else 1):
            ph = 2 * PI * j / seg
            u = (math.sin(th) * math.cos(ph), -math.cos(th), math.sin(th) * math.sin(ph))     # pole = the face (-Y)
            rho, w = fn(u)
            row.append((Vector((O[0] + u[0] * rho, O[1] + u[1] * rho, O[2] + u[2] * rho)), w))
        grid.append(row)
    tbs = {mat: bmesh.new(), void: bmesh.new()}
    caches = {mat: {}, void: {}}

    def vert(key, i, j):
        j = j if 0 < i < rings else 0
        c = caches[key]
        if (i, j) not in c:
            c[(i, j)] = tbs[key].verts.new(grid[i][j][0])
        return c[(i, j)]

    for i in range(rings):
        for j in range(seg):
            j2 = (j + 1) % seg
            ids = [(i, j), (i, j2), (i + 1, j2), (i + 1, j)]
            ids = [(a_, b_ if 0 < a_ < rings else 0) for a_, b_ in ids]
            uniq = []
            for k in ids:
                if k not in uniq:
                    uniq.append(k)
            if len(uniq) < 3:
                continue
            w = sum(grid[a_][b_][1] for a_, b_ in uniq) / len(uniq)
            key = void if w > 0.5 else mat
            try:
                tbs[key].faces.new([vert(key, a_, b_) for a_, b_ in uniq])
            except ValueError:
                pass
    for key, tb in tbs.items():
        m.commit(tb, key, smooth=175.0, mx=mx)


def build_skull(st, lod):
    """The skull in the head frame (origin: the skull base, +Z up, -Y toward the face). Returns (skull Mesh, jaw Mesh, hinge)."""
    bone, dark, void, tooth, eye = st['bone'], st['dark'], st['void'], st['tooth'], st['eye']
    rings, seg = (56, 84) if lod < 2 else (96, 144)
    m = Mesh('skull')
    radial_mesh(m, SK_O, skull_rho, rings, seg, bone, void)
    # zygomatic arches
    for sx in (-1, 1):
        m.tube([(sx * x, y, z) for x, y, z in catmull([(0.060, -0.058, 0.030), (0.070, -0.040, 0.022), (0.074, -0.014, 0.026),
                                                        (0.068, 0.010, 0.038)], 6)], [0.011, 0.0085, 0.008, 0.0085, 0.009, 0.0095], bone, seg=6, flat=0.75)
    # upper teeth: a tight arc with a dark gum line
    ncount = 12 if lod < 2 else 14
    for k in range(ncount):
        th = -1.12 + 2.24 * k / (ncount - 1)
        rx_, ry_ = 0.036, 0.035
        x, y = rx_ * math.sin(th), -0.052 - ry_ * math.cos(th)
        ang = math.atan2(ry_ * math.sin(th), rx_ * math.cos(th))
        h = 0.022 if abs(th) < 0.5 else 0.017
        m.box(-0.0042, 0.0042, -0.0035, 0.0035, -h, 0.002, tooth, mx=trans(x, y, -0.034) @ rotz(ang), bevel=0.0016)
    # the jaw: one curved wall (the U of the body rising into the two rami), teeth on top
    H = Vector((0, 0.026, 0.030))
    j = Mesh('jaw')
    plan = catmull([(0.052, 0.026), (0.050, 0.004), (0.044, -0.028), (0.030, -0.060), (0.0, -0.080)], 14)
    plan = [(-p.x, p.y) for p in reversed(list(plan)[1:])] + [(p.x, p.y) for p in plan]
    # cumulative arc position 0..1 and the wall's top / bottom edge along it
    NU = len(plan) - 1

    def jaw_fn(u, v):
        i = min(int(round(u * NU)), NU)
        x, y = plan[i]
        ax = abs(x)
        rise = min(max((ax - 0.040) / 0.012, 0.0), 1.0)
        top = lerp(-0.060, 0.040, rise)
        bot = lerp(-0.094, -0.078, rise)
        # the ramus is a plate toward the back: shift its plan point slightly outward
        return (x * (1.0 + 0.04 * rise), y, lerp(bot, top, v))
    j.grid_sheet(jaw_fn, NU, 4, bone, smooth=50, thick=0.0075)
    for sx in (-1, 1):
        j.ball((sx * 0.054, 0.026, 0.036), (0.0125, 0.012, 0.011), bone, seg=8, rings=5)         # condyle
        j.ball((sx * 0.052, 0.004, 0.032), (0.009, 0.009, 0.011), bone, seg=6, rings=4)          # coronoid
    for k in range(ncount - 2):
        th = -1.02 + 2.04 * k / (ncount - 3)
        rx_, ry_ = 0.031, 0.030
        x, y = rx_ * math.sin(th), -0.052 - ry_ * math.cos(th)
        ang = math.atan2(ry_ * math.sin(th), rx_ * math.cos(th))
        j.box(-0.0038, 0.0038, -0.0032, 0.0032, -0.074, -0.054, tooth, mx=trans(x, y, 0.0) @ rotz(ang), bevel=0.0013)
    return m, j, H


def build_eyes(st, lod):
    """The soul-light points deep in the eye sockets (head frame)."""
    m = Mesh('eye')
    m.ball((0, 0, 0), (0.0072,) * 3, st['eye'], seg=8, rings=5)
    return m


def build_glow(st, lod):
    """The dim soul-light between the ribs (chest frame)."""
    m = Mesh('glow')
    m.ball((0, -0.03, 0.15), (0.032, 0.02, 0.055), st['glow'], seg=8, rings=5)
    for z, x in ((0.215, 0.0), (0.095, 0.015)):
        m.ball((x, -0.07, z), (0.016, 0.01, 0.012), st['glow'], seg=8, rings=5)
    return m


def build_cervical(st, lod):
    m = Mesh('cervical')
    bone = st['bone']
    pts = catmull([(0, 0.054, -0.012), (0, 0.047, 0.04), (0, 0.032, 0.108)], 8)
    for i, p in enumerate(pts[:-1]):
        q = pts[i + 1]
        r = 0.0125 - 0.0005 * i
        m.cyl(p, p + (q - p) * 0.78, r, r * 0.95, bone, seg=7)
        m.cone = None
        s0 = p + (q - p) * 0.4
        m.cyl(s0, s0 + Vector((0, 0.022, -0.006)), 0.0045, 0.0028, bone, seg=4)
    m.ball((0, 0.032, 0.104), (0.016, 0.014, 0.009), bone, seg=8, rings=5)
    return m


def build_lumbar(st, lod):
    """Five lumbar vertebrae in the spine frame, from the pelvis (z = 0.04) to the thorax (z = chest origin, 0.20)."""
    m = Mesh('lumbar')
    bone = st['bone']
    y = 0.05
    for i in range(5):
        z = 0.035 + i * 0.034
        m.cyl((0, y, z), (0, y, z + 0.027), 0.0225, 0.021, bone, seg=8, bevel=0.0)
        m.cyl((0, y + 0.012, z + 0.012), (0, y + 0.048, z - 0.002), 0.0075, 0.0045, bone, seg=5)
        m.ball((0, y + 0.047, z - 0.001), 0.0075, bone, seg=6, rings=4)
        m.cyl((-0.032, y + 0.004, z + 0.012), (0.032, y + 0.004, z + 0.012), 0.0055, 0.0055, bone, seg=4)
    return m


RIB_A = [0.068, 0.092, 0.108, 0.119, 0.125, 0.126, 0.121, 0.112, 0.100, 0.088]
RIB_B = [0.048, 0.064, 0.078, 0.088, 0.094, 0.096, 0.094, 0.088, 0.080, 0.070]


def build_thorax(st, lod):
    """Ribcage, sternum, thoracic spine, clavicles and scapulae in the chest frame (z = 0 at the bottom of the thorax, 0.30 at the
    base of the neck, spine at y = +0.065 behind, sternum in front)."""
    m = Mesh('thorax')
    bone, dark, glow = st['bone'], st['dark'], st['glow']
    n = 8 if lod < 2 else 10
    ysp = 0.065
    # --- thoracic spine
    nv = 12
    for i in range(nv):
        z = 0.012 + i * 0.0245
        r = 0.0185 - 0.0006 * i
        m.cyl((0, ysp, z), (0, ysp, z + 0.021), r, r * 0.96, bone, seg=7)
        m.cyl((0, ysp + 0.010, z + 0.011), (0, ysp + 0.040, z - 0.010), 0.0065, 0.0038, bone, seg=5)
        m.ball((0, ysp + 0.040, z - 0.010), 0.0062, bone, seg=6, rings=4)
    # --- ribs and costal cartilage
    ends = []
    for i in range(n):
        u = i / (n - 1)
        a, b = tab(RIB_A, u), tab(RIB_B, u)
        cy = ysp - b
        zb = 0.272 - 0.238 * u
        drop = 0.032 + 0.078 * u
        floating = u > 0.78
        phe = (0.62 if floating else 0.91) * PI
        ph0 = 0.06 * PI
        for sx in (-1, 1):
            pts, rr = [], []
            K = 9
            for k in range(K):
                s = k / (K - 1)
                ph = ph0 + (phe - ph0) * s
                x = sx * a * math.sin(ph)
                y = cy + b * math.cos(ph)
                z = zb - drop * s ** 1.25 + 0.006 * math.sin(PI * s)
                pts.append((x, y, z))
                rr.append(0.0108 - 0.0026 * s if not floating else 0.0102 - 0.005 * s)
            m.tube(pts, rr, bone, seg=5, smooth=60, flat=0.6, up=(0, 0, 1))
            m.ball(pts[0], (0.0105, 0.0105, 0.0105), bone, seg=6, rings=4)
            if not floating:
                ends.append((sx, pts[-1]))
    # sternum: manubrium to xiphoid
    s0, s1 = Vector((0, -0.040, 0.272)), Vector((0, -0.114, 0.078))
    m.tube([s0, (s0 + s1) / 2, s1], [0.017, 0.015, 0.011], bone, seg=6, flat=0.38, up=(1, 0, 0))
    m.cyl(s1, s1 + Vector((0, -0.006, -0.03)), 0.0075, 0.002, bone, seg=5)
    for sx, p in ends:
        zs = p[2] + 0.012
        t = (zs - s1.z) / (s0.z - s1.z)
        ys = lerp(s1.y, s0.y, min(max(t, 0), 1))
        m.tube([p, ((p[0] + sx * 0.015) / 2, (p[1] + ys) / 2 - 0.004, (p[2] + zs) / 2), (sx * 0.014, ys, zs)], 0.0062, dark, seg=5)
    # --- clavicles and scapulae
    for sx in (-1, 1):
        cl = catmull([(0.012, -0.044, 0.268), (0.06, -0.052, 0.282), (0.12, -0.03, 0.283), (0.186, -0.004, 0.272)], 7)
        m.tube([(sx * p.x, p.y, p.z) for p in cl], [0.0088, 0.0078, 0.0068, 0.0066, 0.0068, 0.0078, 0.0095], bone, seg=6)
        sc = [(0.040, 0.064, 0.272), (0.064, 0.060, 0.150), (0.168, 0.026, 0.262)]
        pts = [(sx * x, y, z) for x, y, z in sc] + [(sx * (x + 0.004), y + 0.012, z) for x, y, z in sc]
        m.hull(pts, bone, bevel=0.004)
        m.tube([(sx * 0.052, 0.078, 0.246), (sx * 0.11, 0.058, 0.266), (sx * 0.172, 0.026, 0.277)], [0.0085, 0.0075, 0.0095], bone, seg=6)
        m.ball((sx * 0.186, 0.0, 0.273), (0.016, 0.014, 0.012), bone, seg=8, rings=5)
    return m


def build_pelvis(st, lod):
    """Pelvis in the pelvis frame (origin between the hip joints, z up, back = +y)."""
    m = Mesh('pelvis')
    bone, dark = st['bone'], st['dark']
    for sx in (-1, 1):
        # iliac wing: a curved fan from the hip socket up to the crest, a closed shell
        def wing(u, v, sx=sx):
            # u: 0 = at the hip, 1 = the crest; v: 0 = front, 1 = back
            half = 0.026 + 0.05 * u
            y = 0.014 + (v - 0.5) * 2 * half
            x = sx * (0.098 + 0.072 * u - 0.016 * (2 * v - 1) ** 2 * u)
            z = 0.0 + 0.128 * u + 0.012 * (1 - (2 * v - 1) ** 2) * u
            return (x, y, z)
        m.grid_sheet(wing, 5, 6, bone, smooth=60, thick=0.0085)
        # pubis and ischium
        m.tube([(sx * x, y, z) for x, y, z in catmull([(0.088, -0.016, -0.006), (0.058, -0.052, -0.02), (0.024, -0.07, -0.036)], 5)], 0.0125, bone, seg=6, flat=0.8)
        m.tube([(sx * 0.098, 0.022, -0.012), (sx * 0.088, 0.04, -0.05), (sx * 0.082, 0.046, -0.082)], 0.0135, bone, seg=6)
        m.ball((sx * 0.082, 0.046, -0.084), 0.0185, bone, seg=8, rings=5)
        m.ball((sx * 0.096, 0.004, 0.0), (0.024, 0.03, 0.026), bone, seg=8, rings=5)      # the socket
    m.ball((0, -0.07, -0.04), (0.02, 0.014, 0.016), bone, seg=8, rings=5)                    # pubic symphysis
    m.hull([(sx * x, y, z) for sx in (-1, 1) for x, y, z in [(0.052, 0.058, 0.108), (0.052, 0.09, 0.1), (0.034, 0.096, 0.02),
                                                           (0.024, 0.07, 0.01)]] + [(0, 0.1, -0.055), (0, 0.074, -0.045)], bone, bevel=0.004)
    return m


def build_femur(st, lod, L):
    m = Mesh('femur')
    bone = st['bone']
    shaft(m, (0, 0, 0), (0, 0, -L), 0.026, 0.029, 0.0185, bone, ka=0.0, kb=0.0, seg=8)
    m.ball((0, 0, 0), 0.031, bone, seg=10, rings=6)                                   # femoral head
    m.tube([(0, 0, -0.012), (0.024, 0, -0.03), (0.042, 0.005, -0.042)], 0.0165, bone, seg=6)  # neck to the trochanter
    m.ball((0.043, 0.005, -0.046), (0.02, 0.019, 0.024), bone, seg=8, rings=5)
    for sx in (-1, 1):
        m.ball((sx * 0.0165, 0.0, -L), (0.0215, 0.025, 0.024), bone, seg=8, rings=5)     # condyles
    return m


def build_tibia(st, lod, L):
    m = Mesh('tibia')
    bone = st['bone']
    m.ball((0, 0, -0.008), (0.036, 0.026, 0.013), bone, seg=10, rings=5)                  # plateau
    shaft(m, (0, 0.002, -0.012), (0, 0, -L), 0.0225, 0.0185, 0.0148, bone, ka=0.0, kb=0.0, seg=7)
    m.ball((0, -0.028, -0.05), (0.013, 0.012, 0.015), bone, seg=6, rings=4)             # tibial tuberosity
    m.ball((-0.011, 0.0, -L), (0.0165, 0.0175, 0.02), bone, seg=8, rings=5)              # medial malleolus
    shaft(m, (0.036, 0.007, -0.045), (0.032, 0.007, -L + 0.012), 0.0112, 0.0138, 0.0082, bone, ka=1.1, kb=1.0, seg=6)
    m.ball((0.032, 0.009, -L + 0.004), (0.0135, 0.0155, 0.019), bone, seg=6, rings=4)   # lateral malleolus
    return m


def build_foot(st, lod):
    """Left foot in the ankle frame: the ground is at z = -ankle_h = -0.065, toes toward -Y."""
    m = Mesh('foot')
    bone = st['bone']
    m.ball((0, 0.0, -0.014), (0.025, 0.026, 0.02), bone, seg=8, rings=5)
    m.ball((0, 0.048, -0.036), (0.019, 0.034, 0.025), bone, seg=8, rings=5)             # heel
    m.ball((0, -0.03, -0.04), (0.031, 0.04, 0.019), bone, seg=8, rings=5)               # tarsals
    for i, x0 in enumerate((-0.026, -0.0135, 0.0, 0.0135, 0.026)):
        r = 0.0125 if i == 0 else 0.0092
        a = Vector((x0 * 0.45, -0.055, -0.043))
        b = Vector((x0 * 1.15, -0.125, -0.050))
        c = Vector((x0 * 1.3, -0.160 - (0.006 if i < 2 else 0.0) + (0.01 if i == 4 else 0.0), -0.053))
        d = Vector((x0 * 1.4, -0.186 - (0.006 if i < 2 else 0.0) + (0.012 if i == 4 else 0.0), -0.0555))
        m.cyl(a, b, r * 0.9, r, bone, seg=6)
        m.ball(tuple(b), r * 1.1, bone, seg=6, rings=3)
        m.cyl(b, c, r * 0.88, r * 0.78, bone, seg=5)
        m.cyl(c, d, r * 0.75, r * 0.55, bone, seg=5)
    return m


def build_humerus(st, lod, L):
    m = Mesh('humerus')
    bone = st['bone']
    shaft(m, (0, 0, 0), (0, 0, -L), 0.0235, 0.021, 0.0155, bone, ka=0.0, kb=1.12, seg=8)
    m.ball((0, 0, 0), 0.03, bone, seg=10, rings=6)
    m.ball((0.014, 0, -0.034), (0.017, 0.015, 0.021), bone, seg=6, rings=4)             # tubercle
    return m


def build_forearm(st, lod, L):
    """Radius and ulna side by side (ulna toward +Y, the elbow's pole)."""
    m = Mesh('forearm')
    bone = st['bone']
    shaft(m, (0, 0.0085, 0), (0, 0.007, -L), 0.0155, 0.0105, 0.0098, bone, ka=0.0, kb=1.0, seg=7)         # ulna
    shaft(m, (0, -0.0085, -0.01), (0, -0.007, -L), 0.0105, 0.0138, 0.009, bone, ka=0.0, kb=1.1, seg=7)    # radius
    m.ball((0, 0.014, 0.0), (0.0195, 0.0215, 0.02), bone, seg=8, rings=5)                                 # olecranon
    return m


def build_hand(st, lod, curl):
    """Left hand in the wrist frame: fingers along -Z, thumb toward -Y, palm faces -X; fingers curl toward the palm."""
    m = Mesh('hand')
    bone = st['bone']
    K = 1.22
    m.ball((0, 0, -0.024), (0.023, 0.031, 0.019), bone, seg=8, rings=5)
    ys = (-0.024 * K, -0.008 * K, 0.008 * K, 0.022 * K)
    P1 = (0.042 * K, 0.047 * K, 0.044 * K, 0.036 * K)
    P2 = (0.026 * K, 0.030 * K, 0.028 * K, 0.022 * K)
    P3 = (0.020 * K, 0.022 * K, 0.020 * K, 0.017 * K)
    for i, y in enumerate(ys):
        k = Vector((0, y, -0.1))
        m.cyl((0, y * 0.45, -0.028), k, 0.0078, 0.0072, bone, seg=5)
        a = k
        ang = 0.0
        for L, f, r in ((P1[i], 0.62, 0.0072), (P2[i], 1.0, 0.0064), (P3[i], 0.75, 0.0056)):
            ang += curl * f * (0.88 + 0.06 * i if i != 3 else 1.0)
            b = a + Vector((-math.sin(ang), 0.0, -math.cos(ang))) * L
            m.cyl(a, b, r, r * 0.92, bone, seg=5)
            m.ball(tuple(a), r * 1.2, bone, seg=5, rings=3)
            a = b
    # thumb
    t0 = Vector((0, -0.02, -0.03))
    t1 = Vector((-0.005 - 0.014 * min(curl, 1.0), -0.048, -0.07))
    m.cyl(t0, t1, 0.0092, 0.0085, bone, seg=5)
    m.ball(tuple(t1), 0.0102, bone, seg=5, rings=3)
    d1 = Vector((-0.5 * min(curl, 1.2) * 0.9, -0.55, -0.7 + 0.3 * min(curl, 1.2))).normalized()
    t2 = t1 + d1 * 0.037
    m.cyl(t1, t2, 0.0085, 0.0075, bone, seg=5)
    t3 = t2 + Vector((-0.35 * min(curl, 1.2), -0.5, -0.7)).normalized() * 0.03
    m.cyl(t2, t3, 0.0075, 0.006, bone, seg=5)
    m.ball((0, 0, 0), 0.0165, bone, seg=8, rings=5)                                     # wrist
    return m


_PROTO = {}


def proto(style, lod, key, dims):
    """Cached prototype Mesh for a piece."""
    k = (style, lod, key, dims['thigh'], dims['shin'], dims['upper'], dims['fore'])
    if k in _PROTO:
        return _PROTO[k]
    st = STYLES[style]
    if key in ('skull', 'jaw'):
        sk, jw, H = build_skull(st, lod)
        _PROTO[(style, lod, 'skull') + k[3:]] = sk
        _PROTO[(style, lod, 'jaw') + k[3:]] = jw
        _PROTO[(style, lod, 'hinge') + k[3:]] = H
        return _PROTO[k]
    if key == 'hinge':
        proto(style, lod, 'skull', dims)
        return _PROTO[k]
    if key == 'eye':
        mm = build_eyes(st, lod)
    elif key == 'glow':
        mm = build_glow(st, lod)
    elif key == 'cervical':
        mm = build_cervical(st, lod)
    elif key == 'lumbar':
        mm = build_lumbar(st, lod)
    elif key == 'thorax':
        mm = build_thorax(st, lod)
    elif key == 'pelvis':
        mm = build_pelvis(st, lod)
    elif key == 'femur':
        mm = build_femur(st, lod, dims['thigh'])
    elif key == 'tibia':
        mm = build_tibia(st, lod, dims['shin'])
    elif key == 'foot':
        mm = build_foot(st, lod)
    elif key == 'humerus':
        mm = build_humerus(st, lod, dims['upper'])
    elif key == 'forearm':
        mm = build_forearm(st, lod, dims['fore'])
    elif key.startswith('hand'):
        mm = build_hand(st, lod, int(key[4:]) / 10.0)
    else:
        raise KeyError(key)
    _PROTO[k] = mm
    return mm


# ------------------------------------------------------------------------------------------------ the figure

def _rot_from_axes(x, y, z, origin):
    M = Matrix((x, y, z)).transposed().to_4x4()
    M.translation = origin
    return M


def hand_frame_free(zax, back, roll=0.0):
    """Rotation (3x3 columns x, y, z) of a hand whose +Z points up the forearm (zax), thumb forward: back = the figure's back
    direction. Returns (x, y, z)."""
    z = Vector(zax).normalized()
    y = Vector(back) - z * Vector(back).dot(z)
    if y.length < 1e-5:
        y = z.orthogonal()
    y.normalize()
    x = y.cross(z)
    if roll:
        R = Matrix.Rotation(roll, 3, z)
        x, y = R @ x, R @ y
    return x, y, z


class Undead:
    def __init__(self, style='thrall', dims=None, lod=1, s=1.0):
        d = dict(DIMS)
        if dims:
            d.update(dims)
        self.base = dict(d)
        self.s = s
        self.d = {k: v * s for k, v in d.items()}
        self.style = style
        self.lod = lod
        self.sk = Skeleton(**self.d)
        self.st = STYLES[style]

    # ---- solving
    def _auto_bob(self, P):
        d = self.d
        want = d['hip_h'] + P.get('bob', 0.0)
        ct, st_ = math.cos(P.turn + P.hip_twist), math.sin(P.turn + P.hip_twist)
        reach = 0.985 * (d['thigh'] + d['shin'])
        best = want
        for side, sx in (('l', 1.0), ('r', -1.0)):
            ax, af, az = P.get('f%s_x' % side, 0.0), P.get('f%s_f' % side, 0.0), P.get('f%s_z' % side, d['ankle_h'])
            hx = P.sway + sx * d['hip_w'] * ct
            hy = -P.fwd + sx * d['hip_w'] * st_
            dxy2 = (ax - hx) ** 2 + (-af - hy) ** 2
            best = min(best, az + math.sqrt(max(reach * reach - dxy2, 0.04)))
        return best - d['hip_h']

    def solve(self, P, arms=None):
        arms = arms or {}
        d = self.d
        P = Pose(P)
        if P.get('ikf'):
            P['bob'] = self._auto_bob(P)
        F = self.sk.frames(P)
        J = dict(F=F, P=P)
        root = F['root']
        turn = rotz(P.turn)
        fwd = (turn @ Vector((0, -1, 0)))
        back = -fwd
        J['fwd'] = fwd
        # ---- legs
        for side, sx in (('l', 1.0), ('r', -1.0)):
            hip = F['hip_' + side].translation.copy()
            if P.get('ikf'):
                A = Vector((P.get('f%s_x' % side, 0.0), -P.get('f%s_f' % side, 0.0), P.get('f%s_z' % side, d['ankle_h'])))
                pole = turn @ Vector((sx * 0.25, -1.0, 0.0))
                K, A = two_bone(hip, A, d['thigh'], d['shin'], pole)
                yaw = P.get('f%s_yaw' % side, 0.0)
                ff = trans(*A) @ rotz(P.turn + sx * yaw) @ rotx(-P.get('f%s_pitch' % side, 0.0))
            else:
                K = F['knee_' + side].translation.copy()
                A = F['ankle_' + side].translation.copy()
                ff = F['ankle_' + side]
                pole = fwd
            J['hip_' + side], J['knee_' + side], J['ankle_' + side] = hip, K, A
            J['kneedir_' + side] = pole
            J['foot_' + side] = ff
        # ---- arms
        for side, sx in (('l', 1.0), ('r', -1.0)):
            S = F['sh_' + side].translation.copy()
            mode = arms.get(side, 'fk')
            pole = turn @ Vector((sx * P.get('eo_' + side, 0.6), P.get('eb_' + side, 0.2), -P.get('ed_' + side, 0.7)))
            if mode == 'fk':
                E = F['elbow_' + side].translation.copy()
                W = F['wrist_' + side].translation.copy()
                R3 = F['wrist_' + side].to_3x3()
                hx, hy, hz = R3.col[0].copy(), R3.col[1].copy(), R3.col[2].copy()
                hz = (E - W).normalized()
                G = None
            else:
                gp = 'g' + side if mode == 'grip' else 'w' + side
                T = root @ Vector((P.get(gp + '_x', 0.0), -P.get(gp + '_f', 0.0), P.get(gp + '_z', 1.0)))
                if mode == 'wrist':
                    E, W = two_bone(S, T, d['upper'], d['fore'], pole)
                    hx, hy, hz = hand_frame_free((E - W), back, P.get('wr_' + side, 0.0))
                    G = None
                else:
                    az, el = P.get(gp + '_az', 0.0), P.get(gp + '_el', 0.0)
                    B = turn @ Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
                    yh = -B
                    T0 = T.copy()
                    Wt = T0.copy()
                    for _ in range(3):
                        E, W = two_bone(S, Wt, d['upper'], d['fore'], pole)
                        zh = (E - W) - yh * (E - W).dot(yh)
                        if zh.length < 1e-4:
                            zh = Vector((0, 0, 1)) - yh * yh.z
                        zh.normalize()
                        xh = yh.cross(zh)
                        pal = -xh if sx > 0 else xh
                        G = W - zh * 0.055 + pal * 0.02
                        Wt = Wt + (T0 - G)
                    hx, hy, hz = xh, yh, zh
                    # edge direction: orthogonalise "down" (or forward) against B
                    e0 = Vector((0, 0, -1))
                    e0 = e0 - B * e0.dot(B)
                    if e0.length < 0.2:
                        e0 = fwd - B * fwd.dot(B)
                    e0.normalize()
                    ro = P.get(gp + '_roll', 0.0)
                    if ro:
                        e0 = Matrix.Rotation(ro, 3, B) @ e0
                    J['wpn_' + side] = _rot_from_axes(e0, B.cross(e0), B, G)
                    J['B_' + side] = B
            J['sh_' + side] = S
            J['elbow_' + side] = E
            J['wrist_' + side] = W
            J['elbowdir_' + side] = pole
            J['grip_' + side] = G
            hm = _rot_from_axes(hx, hy, hz, W)
            J['hand_' + side] = hm
        J['head'] = F['head']
        return J

    # ---- pieces
    def pieces(self, J, hide=()):
        """[(name, proto key, Matrix)] for every bone piece of the pose."""
        P, F = J['P'], J['F']
        s = scale(self.s)
        out = []
        out.append(('pelvis', 'pelvis', F['pelvis'] @ s))
        out.append(('lumbar', 'lumbar', F['spine'] @ s))
        out.append(('thorax', 'thorax', F['chest'] @ s))
        out.append(('cervical', 'cervical', F['neck'] @ s))
        soul = P.get('soul', 1.0)
        if soul > 0.02:
            out.append(('glow', 'glow', F['chest'] @ scale(self.s * soul)))
            for sx, nm in ((1, 'eye_l'), (-1, 'eye_r')):
                out.append((nm, 'eye', F['head'] @ scale(self.s * HEAD_K) @ trans(sx * 0.034, -0.048, 0.056) @ scale(0.35 + 0.65 * soul)))
        sh = scale(self.s * HEAD_K)
        out.append(('skull', 'skull', F['head'] @ sh))
        H = proto(self.style, self.lod, 'hinge', self.base)
        jaw = P.get('jaw', 0.0)
        out.append(('jaw', 'jaw', F['head'] @ sh @ trans(*H) @ rotx(jaw) @ trans(-H.x, -H.y, -H.z)))
        for side, sx in (('l', 1.0), ('r', -1.0)):
            mir = I4 if sx > 0 else MIRROR
            kd = J['kneedir_' + side]
            out.append(('femur_' + side, 'femur', frame_along(J['hip_' + side], J['knee_' + side], kd) @ s @ mir @ LAT_LEG))
            out.append(('tibia_' + side, 'tibia', frame_along(J['knee_' + side], J['ankle_' + side], kd) @ s @ mir @ LAT_LEG))
            out.append(('foot_' + side, 'foot', J['foot_' + side] @ s @ mir @ FOOT_K))
            ed = -J['elbowdir_' + side]
            out.append(('humerus_' + side, 'humerus', frame_along(J['sh_' + side], J['elbow_' + side], ed) @ s @ LAT_ARM))
            out.append(('forearm_' + side, 'forearm', frame_along(J['elbow_' + side], J['wrist_' + side], ed) @ s @ LAT_ARM))
            curl = round(P.get('curl_' + side, 0.25) * 5) / 5.0
            out.append(('hand_' + side, 'hand%d' % int(round(curl * 10)), J['hand_' + side] @ s @ mir @ HAND_K))
        return [p for p in out if p[0] not in hide]

    def assemble(self, m, parts):
        """Copy the pieces into Mesh m. A key found in `self.extra` (a dict of prop prototypes) wins over the bone prototypes."""
        extra = getattr(self, 'extra', {})
        for name, key, mx in parts:
            m.add(extra[key] if key in extra else proto(self.style, self.lod, key, self.base), mx)
        return m

    def head_point(self, J, x=0.0, y=0.0, z=0.0):
        return (J['F']['head'] @ Vector((x * self.s, y * self.s, z * self.s)))


# ------------------------------------------------------------------------------------------------ props and cloth helpers

def dir_of(turn, az, el):
    """Unit vector for an azimuth (toward the figure's left) and elevation, in a figure that has turned by `turn`."""
    return rotz(turn) @ Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))


def shield_matrix(J, side='l', along=0.5, offset=0.08, prefix='sn'):
    """World matrix of a shield strapped to the forearm. Built facing -Y in the XZ plane, upright (+Z up). The face normal comes
    from the pose keys `<prefix>_az` / `<prefix>_el` (orthogonalised against the forearm), the centre sits `offset` in front of the
    forearm at `along` of its length."""
    P = J['P']
    E, W = J['elbow_' + side], J['wrist_' + side]
    a = (W - E).normalized()
    n = dir_of(P.turn, P.get(prefix + '_az', 0.0), P.get(prefix + '_el', 0.0))
    n = n - a * n.dot(a)
    if n.length < 1e-4:
        n = J['fwd'] - a * J['fwd'].dot(a)
    n.normalize()
    up = Vector((0, 0, 1))
    z = up - n * up.dot(n)
    if z.length < 1e-4:
        z = J['fwd']
    z.normalize()
    y = -n
    x = y.cross(z)
    c = E + (W - E) * along + n * offset
    return _rot_from_axes(x, y, z, c)


def cloth_mesh(m, G, X, mat, thick=0.006, smooth=55.0, uv=None):
    """A baked cloth sheet into Mesh m. G[row][col] = particle indices, X = (N, 3) positions of one frame."""
    nr, nc = len(G), len(G[0])
    Pm = [[Vector(X[G[i][j]]) for j in range(nc)] for i in range(nr)]
    m.grid_sheet(lambda u, v: Pm[min(int(round(v * (nr - 1))), nr - 1)][min(int(round(u * (nc - 1))), nc - 1)],
                 nc - 1, nr - 1, mat, smooth=smooth, thick=thick, uv=uv)



def anim(ctx, prefix, n, fn, dirs=8, mirror=True, ppm=bl.PPM, set=None, pivot=(0.0, 0.0), pad=3, look=None, fps=12, loop=True):
    """ctx.anim that never flushes in the middle of a frame. render.Ctx.anim queues one Cell per direction and _queue may flush
    (which frees the frame's mesh datablocks) before the remaining directions of the same frame have made their Cells, which
    crashes with 'StructRNA of type Mesh has been removed'. Here the frame's Cells are all pending before any flush."""
    s = set or ctx.set
    dl = bl.directions(dirs, mirror) if dirs > 1 else [(0, PI / 2)]
    names = [['%s_d%d_%d' % (prefix, d, i) if dirs > 1 else '%s_%d' % (prefix, i) for i in range(n)] for d, _ in dl]
    ctx._meta(s)['anims'][prefix] = dict(n=n, dirs=dirs, mirror=bool(mirror), fps=fps, loop=bool(loop))
    if not any(ctx.want(nm) for row in names for nm in row):
        return
    flush_area = 1.6 * (bl.SHEET_MAX // bl.SS) ** 2
    for i in range(n):
        if not any(ctx.want(row[i]) for row in names):
            continue
        mes = ctx._datablocks(fn(i), '%s_%d' % (prefix, i))
        for (d, a), row in zip(dl, names):
            if ctx.want(row[i]):
                R = bl.facing(a)
                cell = bl.Cell(row[i], [(me, R) for me in mes], pivot=pivot, pad=pad, ppm=ppm, look=look)
                ctx.pending.setdefault(cell.ppm, []).append((cell, s))
        if sum(c.w * c.h for c, _ in ctx.pending.get(ppm, [])) > flush_area:
            ctx.flush()



def turn_feet(P, turn):
    """Rotate the ground-fixed foot targets (fl_x, fl_f, fr_x, fr_f) of a pose by the figure's turn (portraits face a little to one side)."""
    ct, st = math.cos(turn), math.sin(turn)
    for side in 'lr':
        x, f = P.get('f%s_x' % side, 0.0), P.get('f%s_f' % side, 0.0)
        xw, yw = x * ct - (-f) * st, x * st + (-f) * ct
        P['f%s_x' % side], P['f%s_f' % side] = xw, -yw
    P['turn'] = turn
    return P


# ------------------------------------------------------------------------------------------------ capsule colliders for cloth

def body_colliders(fig, J, torso=True, legs=True, arms=True, head=True):
    """Capsules (a, b, r) approximating the body, for cloth."""
    F = J['F']
    s = fig.s
    cols = []
    if torso:
        pel = F['pelvis'].translation
        ch = F['chest']
        a = F['pelvis'] @ Vector((0, 0.0, 0.02 * s))
        b = ch @ Vector((0, 0.0, 0.0))
        c = ch @ Vector((0, 0.0, 0.30 * s))
        cols.append((tuple(a), tuple(b), 0.13 * s))
        cols.append((tuple(b), tuple(c), 0.15 * s))
    if head:
        cols.append((tuple(F['head'] @ Vector((0, 0, 0.06 * s))), tuple(F['head'] @ Vector((0, 0, 0.14 * s))), 0.1 * s))
    if legs:
        for side in 'lr':
            cols.append((tuple(J['hip_' + side]), tuple(J['knee_' + side]), 0.065 * s))
            cols.append((tuple(J['knee_' + side]), tuple(J['ankle_' + side]), 0.05 * s))
    if arms:
        for side in 'lr':
            cols.append((tuple(J['sh_' + side]), tuple(J['elbow_' + side]), 0.05 * s))
            cols.append((tuple(J['elbow_' + side]), tuple(J['wrist_' + side]), 0.045 * s))
    return cols


# ------------------------------------------------------------------------------------------------ collapse (bones into a heap)

def bone_info(fig):
    """Per piece: (centre in its own frame, kind, axis or normal, rest height). kind 'long' lays the axis flat, 'flat' lays the
    normal vertical."""
    b = fig.base
    s = fig.s
    I = {
        'femur': ((0, 0, -b['thigh'] / 2), 'long', (0, 0, -1), 0.03),
        'tibia': ((0, 0, -b['shin'] / 2), 'long', (0, 0, -1), 0.03),
        'humerus': ((0, 0, -b['upper'] / 2), 'long', (0, 0, -1), 0.028),
        'forearm': ((0, 0, -b['fore'] / 2), 'long', (0, 0, -1), 0.024),
        'foot': ((0, -0.06, -0.04), 'long', (0, -1, 0), 0.03),
        'thorax': ((0, -0.01, 0.15), 'long', (0, 0, 1), 0.11),
        'pelvis': ((0, 0.0, 0.02), 'long', (1, 0, 0), 0.07),
        'lumbar': ((0, 0.05, 0.11), 'long', (0, 0, 1), 0.03),
        'cervical': ((0, 0.04, 0.05), 'long', (0, 0, 1), 0.02),
        'skull': ((0, -0.01, 0.07), 'long', (0, -1, 0), 0.085),
        'jaw': ((0, -0.04, -0.05), 'long', (1, 0, 0), 0.035),
    }
    out = {}
    for k, (c, kind, ax, rr) in I.items():
        out[k] = (Vector(c) * s, kind, Vector(ax), rr * s)
    for k in ('hand0', 'hand2', 'hand4', 'hand6', 'hand8', 'hand10', 'hand12'):
        out[k] = (Vector((0, 0, -0.07)) * s, 'long', Vector((0, 0, -1)), 0.022 * s)
    return out


def collapse(parts, t, info, extra_info=None, seed=1, centre=(0.0, 0.0), spread=0.5, g=15.0, drop=(), tmax=0.5, shrink=0.6, hop=0.0):
    """Move rigid pieces from their posed matrices into a low heap on the ground. t = seconds since the pieces were let go. Each
    piece is a point mass at its centre falling under gravity (staggered release), tumbling to a random flat orientation, bouncing
    once and lying still. Pieces named in `drop` are removed. Deterministic for a seed. Returns a new parts list."""
    info = dict(info)
    if extra_info:
        info.update(extra_info)
    out = []
    for name, key, M in parts:
        if name in drop:
            continue
        if key not in info:
            out.append((name, key, M))
            continue
        c, kind, ax, rr = info[key]
        rnd = random.Random((zlib.crc32(('%s/%s' % (seed, name)).encode()) & 0xffffff) + 7)   # not hash(): str hashes change per process
        R0 = M.to_3x3().normalized() if M.determinant() > 0 else (M @ MIRROR).to_3x3().normalized()
        mir = M.determinant() < 0
        sc = M.to_scale()
        p0 = M @ c if not mir else (M @ c)
        # target orientation
        yaw = rnd.uniform(0, 2 * PI)
        roll = rnd.uniform(0, 2 * PI)
        if kind == 'long':
            Ral = ax.rotation_difference(Vector((1, 0, 0))).to_matrix()
            Rt = Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(roll, 3, 'X') @ Ral
        else:
            Ral = ax.rotation_difference(Vector((0, 0, 1 if rnd.random() < 0.7 else -1))).to_matrix()
            Rt = Matrix.Rotation(yaw, 3, 'Z') @ Ral
        # where it comes to rest
        off = rnd.uniform(0.02, 0.28)
        ang = rnd.uniform(0, 2 * PI)
        xy = Vector((p0.x - centre[0], p0.y - centre[1])) * shrink + Vector((off * math.cos(ang), off * math.sin(ang)))
        if xy.length > spread:
            xy *= spread / xy.length
        zr = rr * (1.0 + rnd.uniform(0.0, 0.5)) + 0.01
        zr += rnd.uniform(0.0, 0.05) * max(0.0, 1.0 - xy.length / spread)
        delay = rnd.uniform(0.0, 0.1)
        tf = math.sqrt(2.0 * max(p0.z - zr, 0.02) / g)
        tl = delay + tf
        tt = t - delay
        if tt <= 0:
            pos = p0.copy()
            k = 0.0
        else:
            k = min(tt / tf, 1.0)
            xyk = Vector((p0.x, p0.y)).lerp(Vector((centre[0] + xy.x, centre[1] + xy.y)), 1 - (1 - k) ** 2)
            z = p0.z - 0.5 * g * tt * tt if k < 1.0 else zr
            z = max(z, zr)
            if k >= 1.0:
                vb = max(0.28 * g * tf, math.sqrt(2.0 * g * hop * rnd.uniform(0.2, 1.0)) if hop > 0 else 0.0)
                tb = t - tl
                z = zr + max(0.0, vb * tb - 0.5 * g * tb * tb)
            pos = Vector((xyk.x, xyk.y, z))
        q0 = R0.to_quaternion()
        q1 = Rt.to_quaternion()
        w = smooth(min(max((t - delay) / max(tf * 0.9, 1e-3), 0.0), 1.0))
        R = q0.slerp(q1, w).to_matrix()
        Rm = R @ Matrix.Diagonal((abs(sc.x), abs(sc.y), abs(sc.z)))
        if mir:
            Rm = Rm @ Matrix.Diagonal((-1.0, 1.0, 1.0))
        origin = pos - (R @ Vector((c.x * abs(sc.x), c.y * abs(sc.y), c.z * abs(sc.z)))) if False else pos - (Rm @ c)
        N = Rm.to_4x4()
        N.translation = origin
        out.append((name, key, N))
    return out


def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)
