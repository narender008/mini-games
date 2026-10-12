"""Geometry helpers for Maelis: lofts, Catmull-Rom sheets, crescents, hats. Pure construction, no animation."""
import math

import bmesh
import numpy as np
from mathutils import Matrix, Vector

from bl import Mesh, trans, rotx, roty, rotz

PI = math.pi


# ------------------------------------------------------------------------------------------------ lofts

def ring_pts(M, z, rx, ryf, ryb, n=20, cx=0.0, cy=0.0):
    """n points round an ellipse in the frame M at height z, starting at the front (-Y) and going round to her left (+X).
    ryf / ryb: the front and back half-depths (a bust, a straight back)."""
    out = []
    for i in range(n):
        a = 2 * PI * i / n
        sn, cs = math.sin(a), math.cos(a)
        out.append(M @ Vector((cx + rx * sn, cy - (ryf if cs > 0 else ryb) * cs, z)))
    return out


def loft(m, rings, mat, smooth=55.0, closed=True, caps=(False, False), mx=None, uvscale=(1.0, 1.0)):
    """Quads between consecutive rings (lists of Vectors of equal length). UV: u round, v along."""
    tb = bmesh.new()
    uvl = tb.loops.layers.uv.verify()
    n = len(rings[0])
    R = [[tb.verts.new(p) for p in ring] for ring in rings]
    nr = len(R)
    seg = n if closed else n - 1
    for i in range(nr - 1):
        for j in range(seg):
            j2 = (j + 1) % n
            try:
                f = tb.faces.new([R[i][j], R[i][j2], R[i + 1][j2], R[i + 1][j]])
            except ValueError:
                continue
            uv = [(j / seg, i / (nr - 1)), ((j + 1) / seg, i / (nr - 1)), ((j + 1) / seg, (i + 1) / (nr - 1)), (j / seg, (i + 1) / (nr - 1))]
            for l, u in zip(f.loops, uv):
                l[uvl].uv = (u[0] * uvscale[0], u[1] * uvscale[1])
    for flag, ring in zip(caps, (R[0], R[-1])):
        if flag:
            try:
                f = tb.faces.new(ring)
                for l in f.loops:
                    l[uvl].uv = (0.5, 0.5)
            except ValueError:
                pass
    m.commit(tb, mat, smooth, mx)


def circle_pts(M, r, n=24, rz=None, z=0.0, phase=0.0):
    """A horizontal circle (or ellipse rz) in frame M, as a closed polyline (first point repeated)."""
    rz = r if rz is None else rz
    pts = [M @ Vector((r * math.cos(phase + 2 * PI * i / n), rz * math.sin(phase + 2 * PI * i / n), z)) for i in range(n + 1)]
    return pts


# ------------------------------------------------------------------------------------------------ Catmull-Rom surfaces

def _cr_w(t):
    """Uniform Catmull-Rom weights of the four neighbours for t in [0, 1)."""
    t2, t3 = t * t, t * t * t
    return (0.5 * (-t3 + 2 * t2 - t), 0.5 * (3 * t3 - 5 * t2 + 2), 0.5 * (-3 * t3 + 4 * t2 + t), 0.5 * (t3 - t2))


def cr_eval(X, vf, uf, periodic=False):
    """Evaluate a coarse grid X (R, C, 3) at fractional row vf and column uf (arrays of equal shape) with Catmull-Rom."""
    R, C = X.shape[:2]
    vf = np.clip(np.asarray(vf, np.float64), 0, R - 1 - 1e-9)
    uf = np.asarray(uf, np.float64)
    if periodic:
        uf = np.mod(uf, C)
    else:
        uf = np.clip(uf, 0, C - 1 - 1e-9)
    i0 = np.floor(vf).astype(int)
    j0 = np.floor(uf).astype(int)
    tv, tu = vf - i0, uf - j0
    wv = _cr_w(tv)
    wu = _cr_w(tu)
    out = np.zeros(vf.shape + (3,))
    for a in range(4):
        ii = np.clip(i0 + a - 1, 0, R - 1)
        for b in range(4):
            jj = (j0 + b - 1) % C if periodic else np.clip(j0 + b - 1, 0, C - 1)
            out += (wv[a] * wu[b])[..., None] * X[ii, jj]
    return out


def sheet(m, X, nu, nv, mat, periodic=False, hem=None, off=0.0, away=None, uvmap=None, smooth=60.0, mx=None, v0=0.0, v1=1.0):
    """A smooth cloth sheet from a coarse grid of points X (R rows down, C columns across) as a (R, C, 3) array: nu x nv quads.
    periodic = the columns wrap (a sleeve). hem(u) -> factor (<= 1) scaling how far down the sheet reaches at u (tattered hems).
    off: offset the surface along its normal by off metres (the normal turned away from the point `away` when given: a lining
    sits on the inside, off < 0 with away = the garment's centre line point). UV (u, 1 - v): v runs down the garment."""
    R, C = X.shape[:2]
    cols = C if periodic else C - 1
    us = np.linspace(0, 1, nu + 1)
    vs = np.linspace(v0, v1, nv + 1)
    U, V = np.meshgrid(us, vs, indexing='ij')
    hf = np.ones_like(U) if hem is None else np.array([hem(u) for u in us])[:, None] * np.ones_like(U)
    Vr = V * hf
    P = cr_eval(X, Vr * (R - 1), U * cols, periodic)
    if off != 0.0:
        dv = np.gradient(P, axis=1)
        du = np.gradient(P, axis=0)
        nrm = np.cross(du, dv)
        ln = np.linalg.norm(nrm, axis=-1, keepdims=True)
        nrm = nrm / np.maximum(ln, 1e-9)
        if away is not None:
            if isinstance(away, str):          # 'rows': away from the centre of each ring of a closed garment
                a = P.mean(axis=0, keepdims=True)
            else:
                a = np.asarray(away, np.float64)
            flip = np.sign(np.sum(nrm * (P - a), axis=-1, keepdims=True))
            flip[flip == 0] = 1.0
            nrm = nrm * flip
        P = P + nrm * off
    uvf = uvmap or (lambda u, v: (u, 1.0 - v))
    tb = bmesh.new()
    uvl = tb.loops.layers.uv.verify()
    verts = [[tb.verts.new(tuple(P[i, j])) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            try:
                f = tb.faces.new([verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1]])
            except ValueError:
                continue
            for l, uv in zip(f.loops, (uvf(us[i], vs[j]), uvf(us[i + 1], vs[j]), uvf(us[i + 1], vs[j + 1]), uvf(us[i], vs[j + 1]))):
                l[uvl].uv = uv
    m.commit(tb, mat, smooth, mx)
    return P


def rag_hem(teeth, depth, phase=0.0, seed=0):
    """A tattered hem: a triangle wave of `teeth` points across the panel, `depth` the fraction of the length cut away at the
    deepest notch, and a per-tooth variation so that no two points match."""
    rnd = np.random.RandomState(seed)
    amp = 0.55 + 0.45 * rnd.rand(max(teeth, 1))

    def f(u):
        x = u * teeth + phase
        k = int(math.floor(x))
        t = x - k
        w = abs(t * 2 - 1)                      # 1 at the notches, 0 at the tips
        return 1.0 - depth * w * amp[k % len(amp)]
    return f


# ------------------------------------------------------------------------------------------------ crescents and tubes

def crescent_pts(R, r2, s, n=22):
    """Outline (x, z) of a crescent with its horns up: the disc of radius R minus the disc of radius r2 centred s above it."""
    zs = (R * R - r2 * r2 + s * s) / (2 * s)
    xs = math.sqrt(max(R * R - zs * zs, 0.0))
    a0 = math.atan2(zs, xs)
    # the outer circle from the right horn clockwise round the bottom to the left horn
    outer = [(R * math.cos(a), R * math.sin(a)) for a in np.linspace(a0, PI - a0 - 2 * PI, n + 1)]
    # the inner circle from the left horn counter-clockwise through its bottom back to the right horn
    ia_l = math.atan2(zs - s, -xs)
    ia_r = math.atan2(zs - s, xs)
    if ia_r < ia_l:
        ia_r += 2 * PI
    inner = [(r2 * math.cos(a), s + r2 * math.sin(a)) for a in np.linspace(ia_l, ia_r, n + 1)]
    return outer + inner[1:-1]


def crescent_prism(m, R, r2, s, thick, mat, mx=None, bevel=0.0, n=22):
    """A crescent in the XZ plane (horns up, centred on the origin's disc), `thick` deep along Y centred on y = 0."""
    pts = crescent_pts(R, r2, s, n)
    m.prism(pts, -thick / 2, thick / 2, mat, mx=mx, smooth=30.0, bevel=bevel)


def blade(m, p0, length, psi, width, thick, mat, n=26, mx=None, root_w=0.38):
    """A crescent blade lofted along an arc. Local frame: origin p0, +Z the grip axis, +Y the way it curls, +X across the flat.
    The centre line starts along +Z and turns toward +Y through the angle psi (radians) over `length` metres. `width` is the
    widest point of the crescent, `thick` the thickness along X at the spine; the section has a ridge and a bevelled edge."""
    Rr = length / psi
    X = Vector((1.0, 0.0, 0.0))
    p0 = Vector(p0)
    # section: (offset across the blade as a fraction of the local width, outward positive; half thickness)
    sec = [(0.42, 0.0), (0.30, 0.72), (0.05, 1.0), (-0.25, 0.8), (-0.52, 0.34), (-0.60, 0.0),
           (-0.52, -0.34), (-0.25, -0.8), (0.05, -1.0), (0.30, -0.72)]
    rings = []
    for k in range(n + 1):
        t = k / n
        a = psi * t
        c = Vector((0.0, Rr * (1 - math.cos(a)), Rr * math.sin(a)))
        out = Vector((0.0, -math.cos(a), math.sin(a)))       # away from the centre of the curl (towards the back edge)
        tp = t ** 0.85
        w = width * (root_w * (1 - t) ** 3 + math.sin(PI * tp) ** 0.85 * (1 - 0.55 * t)) + 0.0025
        th = thick * (0.35 + 0.65 * (1 - t) ** 0.5)
        ring = []
        for off, h in sec:
            ring.append(p0 + X * (h * th) + c + out * (off * w))
        rings.append(ring)
    loft(m, rings, mat, smooth=35.0, closed=True, caps=(True, True), mx=mx)
    return rings


def hat_surface(tip=(0.0, 0.0, 0.0), droop=None, wave=0.0, h=0.50, r_in=0.104, r_out=0.335, edge_z=-0.04, tip_back=0.13,
                tip_bend=2.2, brim_ry=0.96, lift_front=0.0):
    """The hat as one parametric surface fn(u, s) -> Vector: u in 0..1 round (0 = the front, -Y, going to her left), s in 0..1
    from the brim's rim in to the crown base (0..0.5) and up the crown to the tip (0.5..1). Local frame: z up from the brim
    plane. `tip` = a lagging offset of the crown's tip (x, y, z); `droop` = 12 extra droop values round the rim (metres, +
    = lower); `wave` the brim's waviness (metres); `lift_front` how much the front of the brim turns up."""
    droop = droop if droop is not None else [0.0] * 12

    def dz(a):
        x = a / (2 * PI) * 12
        k = int(math.floor(x)) % 12
        t = x - math.floor(x)
        return droop[k] * (1 - t) + droop[(k + 1) % 12] * t

    def fn(u, s):
        a = u * 2 * PI
        x_dir, y_dir = math.sin(a), -math.cos(a)
        if s <= 0.5:
            q = 1.0 - s / 0.5      # 1 at the rim, 0 at the crown base
            r = r_in + (r_out - r_in) * q
            z = edge_z * q ** 2.2 + wave * (0.65 * math.sin(3 * a + 0.6) + 0.35 * math.sin(5 * a + 1.9)) * q ** 2 - dz(a) * q ** 2
            z += lift_front * q ** 1.6 * max(0.0, -y_dir)
            z += 0.011 * max(0.0, 1.0 - q / 0.1) ** 2          # a fillet where the brim meets the crown
            return Vector((x_dir * r, y_dir * r * brim_ry, z))
        t = (s - 0.5) / 0.5
        rr = r_in * (1 - t) ** 1.18
        zc = h * t - 0.03 * t ** 3 + 0.011 * max(0.0, 1.0 - t / 0.1) ** 2 * 0
        yc = tip_back * t ** tip_bend
        w = t ** 2.4
        return Vector((x_dir * rr + tip[0] * w, y_dir * rr + yc + tip[1] * w, zc + tip[2] * w))
    return fn
