"""Gloamwall kit: shared geometry helpers (weathered blocks, coursed masonry, moss, cracks, arches, carved crescents, robed figures).

All of it builds into a `bl.Mesh`; coordinates are Blender metres, X east, Y north, Z up. A wall front (the face the camera sees)
is the -Y face. Nothing here is random without a seed: pieces are rebuilt identically every run.
"""
import math
import os
import random

import bmesh
from mathutils import Matrix, Vector
from mathutils import noise as mn

import bl
from bl import Mesh, trans, rotx, roty, rotz, scale, PI
import gwkit_mats

STONES = gwkit_mats.STONES


def sel(name):
    """Dev filter: GWSEL=prefix,prefix limits a build to the pieces whose name starts with one of them."""
    s = os.environ.get('GWSEL')
    if not s:
        return True
    return any(name.startswith(p) for p in s.split(','))


def pick(rng, mats=None, cracked=0.05, dark=0.05):
    r = rng.random()
    if r < cracked:
        return 'gw_stone_cr'
    if r < cracked + dark:
        return 'gw_stone_dark'
    return rng.choice(mats or STONES)


# ------------------------------------------------------------------------------------------------ blocks

def rblock(m, x0, x1, y0, y1, z0, z1, mat, seed=0, bevel=0.016, chip=0.009, cuts=2, mx=None, smooth=50.0, freq=6.0, bseg=1,
           corner=None, pillow=0.0, front=-1):
    """A weathered, slightly irregular stone block: a subdivided box with noise dents, bevelled edges and (optionally) a chipped
    corner. corner = (sx, sy, sz, depth): which corner (signs) to knock off and how far."""
    tb = bmesh.new()
    bmesh.ops.create_cube(tb, size=1.0)
    bmesh.ops.scale(tb, vec=(x1 - x0, y1 - y0, z1 - z0), verts=tb.verts[:])
    bmesh.ops.translate(tb, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=tb.verts[:])
    if cuts:
        bmesh.ops.subdivide_edges(tb, edges=tb.edges[:], cuts=cuts, use_grid_fill=True)
    cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
    if corner:
        sx, sy, sz, dep = corner
        tgt = Vector((cx + sx * (x1 - x0) / 2, cy + sy * (y1 - y0) / 2, cz + sz * (z1 - z0) / 2))
        for v in tb.verts:
            dv = v.co - tgt
            if abs(dv.x) < 0.02 and abs(dv.y) < 0.02 and abs(dv.z) < 0.02:
                v.co -= Vector((sx, sy, sz)) * dep
            elif dv.length < dep * 1.6:
                v.co -= Vector((sx, sy, sz)) * dep * 0.5 * (1.0 - dv.length / (dep * 1.6))
    if pillow:
        # rusticated, slightly domed front face (the face at y0 for front = -1, at y1 for +1)
        yf = y0 if front < 0 else y1
        hw, hh = max((x1 - x0) / 2, 1e-4), max((z1 - z0) / 2, 1e-4)
        for v in tb.verts:
            if abs(v.co.y - yf) < 1e-5:
                u, w = (v.co.x - cx) / hw, (v.co.z - cz) / hh
                v.co.y += front * pillow * max(0.0, 1 - u * u) * max(0.0, 1 - w * w)
    if chip:
        off = Vector((seed * 3.7 + 0.31, seed * 1.9 + 0.17, seed * 5.1 + 0.53))
        oy, oz = Vector((17.3, 4.1, 9.7)), Vector((-6.2, 23.9, 11.3))
        for v in tb.verts:
            p = v.co * freq + off
            v.co += Vector((mn.noise(p), mn.noise(p + oy), mn.noise(p + oz))) * chip
    m.commit(tb, mat, smooth, mx, bevel, bseg)


def poly_block(m, pts_xz, y0, y1, mat, bevel=0.014, smooth=50.0, mx=None):
    """A prism from a convex polygon in the XZ plane (blocks cut to an arch, wedges, gable stones)."""
    m.prism(pts_xz, y0, y1, mat, mx=mx, smooth=smooth, bevel=bevel)


def split_widths(rng, a, b, wmin, wmax, avoid=(), tries=14):
    """Split [a, b] into block widths in about [wmin, wmax]; picks the split whose joints keep furthest from `avoid` positions."""
    span = b - a
    n = max(1, int(round(span / ((wmin + wmax) / 2))))
    if span / n > wmax * 1.15 and n < 12:
        n += 1
    best, bs = None, -1.0
    for _ in range(tries):
        r = [rng.uniform(0.72, 1.28) for _ in range(n)]
        s = sum(r)
        xs = [a]
        for k in range(n):
            xs.append(xs[-1] + span * r[k] / s)
        xs[-1] = b
        sc = min([abs(x - o) for x in xs[1:-1] for o in avoid] or [9.0])
        if sc > bs:
            best, bs = xs, sc
        if sc > 0.16:
            break
    return best


def course_heights(rng, z0, z1, hmin=0.22, hmax=0.31):
    span = z1 - z0
    n = max(1, int(round(span / ((hmin + hmax) / 2))))
    hs = [rng.uniform(0.8, 1.2) for _ in range(n)]
    s = sum(hs)
    zs = [z0]
    for h in hs:
        zs.append(zs[-1] + span * h / s)
    zs[-1] = z1
    return zs


def masonry(m, x0, x1, z0, z1, yf, depth, rng, spans=None, zs=None, wmin=0.38, wmax=0.8, gap=0.03, bevel=0.02, mats=None,
            core=True, core_mat='gw_core', proud=0.012, hmin=0.22, hmax=0.31, bdepth=(0.3, 0.55), seed=0, chips=0.12,
            cracked=0.05, dark=0.05, facing=-1, pillow=0.012, cuts=3):
    """Fill the vertical face x0..x1, z0..z1 (front plane y = yf, wall depth `depth` going away from the camera for facing = -1)
    with courses of weathered ashlar over a dark core. spans(zlo, zhi) -> [(aL_lo, aL_hi, aR_lo, aR_hi), ...] restricts a course to
    the given x intervals; a boundary that slopes between its lo and hi value cuts the end block to the line (arch extrados).
    Returns the list of course z levels."""
    zs = zs or course_heights(rng, z0, z1, hmin, hmax)
    if core:
        ya, yb = (yf + 0.04, yf + depth) if facing < 0 else (yf - depth, yf - 0.04)
        m.box(x0, x1, ya, yb, z0, z1, core_mat)
    prev = []
    for ci in range(len(zs) - 1):
        zlo, zhi = zs[ci], zs[ci + 1]
        sp = spans(zlo, zhi) if spans else [(x0, x0, x1, x1)]
        joints = []
        for (aL0, aL1, aR0, aR1) in sp:
            a, b = max(aL0, aL1), min(aR0, aR1)   # the widest x range clear for the whole course
            if b - a < 0.05:
                continue
            xs = split_widths(rng, a, b, wmin, wmax, prev)
            for k in range(len(xs) - 1):
                xa, xb = xs[k], xs[k + 1]
                dep = rng.uniform(*bdepth)
                dep = min(dep, depth)
                pr = rng.uniform(0.0, proud)
                if facing < 0:
                    ya, yb = yf - pr, yf - pr + dep
                else:
                    ya, yb = yf + pr - dep, yf + pr
                mat = pick(rng, mats, cracked, dark)
                g2 = gap / 2
                sl = sloped_end(aL0, aL1, a) if k == 0 else None
                sr = sloped_end(aR0, aR1, b) if k == len(xs) - 2 else None
                if sl is None and sr is None:
                    corner = None
                    if rng.random() < chips:
                        corner = (rng.choice((-1, 1)), -1 if facing < 0 else 1, rng.choice((-1, 1)), rng.uniform(0.04, 0.09))
                    rblock(m, xa + g2, xb - g2, ya, yb, zlo + g2, zhi - g2, mat, seed=rng.random() * 50, bevel=bevel,
                           corner=corner, mx=None, pillow=pillow * rng.uniform(0.5, 1.4), front=facing, cuts=cuts)
                else:
                    # cut end block: polygon in XZ with the arch chord at its end(s)
                    # chord x at zlo / zhi for the left and right ends
                    lxl, lxh = (aL0, aL1) if (k == 0) else (xa, xa)
                    rxl, rxh = (aR0, aR1) if (k == len(xs) - 2) else (xb, xb)
                    lxl, lxh = lxl + g2, lxh + g2
                    rxl, rxh = rxl - g2, rxh - g2
                    pts = [(lxl, zlo + g2), (rxl, zlo + g2), (rxh, zhi - g2), (lxh, zhi - g2)]
                    if rxl - lxl > 0.03 and rxh - lxh > 0.03:
                        poly_block(m, pts, ya, yb, mat, bevel=bevel * 0.9)
                if k < len(xs) - 2:
                    joints.append(xb)
        prev = joints
    return zs


def sloped_end(lo, hi, base):
    return None if abs(lo - hi) < 1e-6 else (lo, hi)


# ------------------------------------------------------------------------------------------------ surface dressing

def moss(m, x, y, z, r, rng, mat='gw_moss', n=4, flat=0.55):
    """A clump of moss: overlapping flattened lumps (a cap sitting on a surface at z)."""
    for _ in range(n):
        ox, oy = rng.uniform(-r, r) * 0.8, rng.uniform(-r, r) * 0.5
        rr = r * rng.uniform(0.35, 0.7)
        m.ball((x + ox, y + oy, z + rr * flat * 0.3), (rr, rr * 0.8, rr * flat), mat, seg=8, rings=5)


def moss_line(m, x0, x1, y, z, rng, density=5.0, r=0.05, mat='gw_moss', jitter_y=0.0, flat=0.5):
    """Moss lumps along a joint or ledge from x0 to x1."""
    n = max(1, int((x1 - x0) * density))
    for _ in range(n):
        x = rng.uniform(x0, x1)
        moss(m, x, y + rng.uniform(-jitter_y, jitter_y), z, r * rng.uniform(0.6, 1.3), rng, mat, n=rng.randint(2, 3), flat=flat)


def crack(m, pts, y, w=0.007, mat='gw_crack', rng=None, jag=0.015):
    """A crack on a front face: pts = [(x, z), ...] joined by a slightly jagged thin tube lying at depth y."""
    rng = rng or random.Random(1)
    path = []
    for (x0, z0), (x1, z1) in zip(pts[:-1], pts[1:]):
        steps = max(1, int(math.hypot(x1 - x0, z1 - z0) / 0.08))
        for s in range(steps):
            t = s / steps
            path.append((x0 + (x1 - x0) * t + rng.uniform(-jag, jag), y, z0 + (z1 - z0) * t + rng.uniform(-jag, jag)))
    path.append((pts[-1][0], y, pts[-1][1]))
    if len(path) < 2:
        return
    rs = [w * (0.4 + 0.9 * max(0.0, math.sin(PI * i / (len(path) - 1))) ** 0.6) for i in range(len(path))]
    m.tube(path, rs, mat, seg=4, cap=False, smooth=0.0)


def rivet(m, x, y, z, r=0.018, mat='gw_iron', facing=-1):
    m.ball((x, y, z), (r, r * 0.6, r), mat, seg=6, rings=4)


def drip(m, x, y, z_top, length, w, mat, rng, nseg=5):
    """A grime/rust streak running down a face: a tapering ribbon of a darker material just proud of the surface."""
    pts = [(x + rng.uniform(-0.004, 0.004), y, z_top - length * i / nseg) for i in range(nseg + 1)]
    rs = [w * (1.0 - 0.8 * (i / nseg) ** 1.4) for i in range(nseg + 1)]
    m.tube(pts, rs, mat, seg=4, cap=False, smooth=0.0, flat=0.3)


# ------------------------------------------------------------------------------------------------ profiles

def pointed_arch(half, z_spring, rise_radius_k=2.0, n=14):
    """Points along the LEFT half of a pointed (equilateral for k = 2) arch with half-width `half`, from the spring point to the
    apex. Returns [(x, z)], the apex at x = 0. The right half mirrors it."""
    R = half * rise_radius_k
    xc = -half + R
    th0 = PI
    ca = (0 - xc) / R
    th1 = math.acos(max(-1.0, min(1.0, ca)))   # angle at the apex
    pts = []
    for i in range(n + 1):
        t = th0 + (th1 - th0) * i / n
        pts.append((xc + R * math.cos(t), z_spring + R * math.sin(t)))
    return pts


def arch_x_at(z, half, z_spring, k=2.0):
    """x (negative, left side) of the pointed arch's left boundary at height z (z >= z_spring)."""
    R = half * k
    xc = -half + R
    dz = z - z_spring
    if dz < 0:
        return -half
    if dz > R * math.sqrt(1 - ((0 - xc) / R) ** 2):
        return 0.0
    return xc - math.sqrt(max(R * R - dz * dz, 0.0))


# ------------------------------------------------------------------------------------------------ carved shapes

def crescent_poly(cx, cz, r, thick=0.45, off=0.3, n=20, tilt=0.0):
    """Outline (XZ) of a crescent: outer circle radius r minus an inner circle offset along +x by off*r. Opening faces +x
    (before `tilt`). Returns a list of (x, z) points around the outline."""
    r2 = r * (1.0 - thick * 0.5)
    c2x = off * r
    # the circle intersection
    d = c2x
    a = (r * r - r2 * r2 + d * d) / (2 * d)
    h = math.sqrt(max(r * r - a * a, 0.0))
    ang_o = math.atan2(h, a)          # outer arc covers (ang_o .. 2pi - ang_o) going the long way round the -x side
    pts = []
    for i in range(n + 1):
        t = ang_o + (2 * PI - 2 * ang_o) * i / n
        pts.append((r * math.cos(t), r * math.sin(t)))
    ang_i = math.atan2(h, a - d)
    for i in range(n + 1):
        t = (2 * PI - ang_i) - (2 * PI - 2 * ang_i) * i / n
        pts.append((c2x + r2 * math.cos(t), r2 * math.sin(t)))
    # drop the duplicate-ish end points
    c, s = math.cos(tilt), math.sin(tilt)
    return [(cx + x * c - z * s, cz + x * s + z * c) for x, z in pts]


def crescent(m, cx, cz, r, y0, y1, mat, thick=0.45, off=0.3, tilt=0.0, bevel=0.0, mx=None, smooth=40.0):
    """A solid crescent moon (a prism along Y). The tips point to +x for tilt 0, to +z for tilt = +pi/2."""
    pts = crescent_poly(cx, cz, r, thick, off, 18, tilt)
    # a crescent is concave: prism() takes concave polygons
    m.prism(pts, y0, y1, mat, mx=mx, smooth=smooth, bevel=bevel)


def star(m, cx, cz, r, y0, y1, mat, n=4, inner=0.38, mx=None):
    pts = []
    for i in range(n * 2):
        a = PI / 2 + PI * i / n
        rr = r if i % 2 == 0 else r * inner
        pts.append((cx + rr * math.cos(a), cz + rr * math.sin(a)))
    m.prism(pts, y0, y1, mat, mx=mx, smooth=0.0)


# ------------------------------------------------------------------------------------------------ revolve with variation

def revolve(m, rings, mat, seg=24, closed_top=True, closed_bottom=True, mx=None, smooth=60.0, uv_v=True):
    """A welded solid of revolution about +Z from rings = [(z, r_fn)], r_fn(theta) -> radius at that angle (so folds, flutes and
    dents are possible). A ring with r_fn None or radius < 1e-6 is a pole."""
    tb = bmesh.new()
    uvl = tb.loops.layers.uv.verify()
    R = []
    for z, fn in rings:
        row = []
        for j in range(seg):
            th = 2 * PI * j / seg
            r = fn(th) if callable(fn) else fn
            row.append(tb.verts.new((r * math.cos(th), r * math.sin(th), z)))
        R.append(row)
    n = len(R)
    for i in range(n - 1):
        for j in range(seg):
            j2 = (j + 1) % seg
            try:
                f = tb.faces.new([R[i][j], R[i][j2], R[i + 1][j2], R[i + 1][j]])
            except ValueError:
                continue
            for l, uv in zip(f.loops, ((j / seg, i / (n - 1)), ((j + 1) / seg, i / (n - 1)), ((j + 1) / seg, (i + 1) / (n - 1)),
                                       (j / seg, (i + 1) / (n - 1)))):
                l[uvl].uv = uv
    for ring, on in ((R[0], closed_bottom), (R[-1], closed_top)):
        if on:
            try:
                f = tb.faces.new(ring)
                for l in f.loops:
                    l[uvl].uv = (0.5, 0.5)
            except ValueError:
                pass
    m.commit(tb, mat, smooth, mx)


def folds(n, amp, phase=0.0, sharp=1.0):
    """r multiplier function for `revolve`: n vertical folds of relative amplitude amp."""
    def f(th):
        s = math.sin(n * th + phase)
        return 1.0 + amp * (math.copysign(abs(s) ** sharp, s))
    return f


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def crack_top(m, pts, z, w=0.007, mat='gw_crack', rng=None, jag=0.012):
    """A crack across a top face: pts = [(x, y), ...] at height z (a thin jagged tube half sunk into the surface)."""
    rng = rng or random.Random(1)
    path = []
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        steps = max(1, int(math.hypot(x1 - x0, y1 - y0) / 0.08))
        for s in range(steps):
            t = s / steps
            path.append((x0 + (x1 - x0) * t + rng.uniform(-jag, jag), y0 + (y1 - y0) * t + rng.uniform(-jag, jag), z))
    path.append((pts[-1][0], pts[-1][1], z))
    if len(path) < 2:
        return
    rs = [w * (0.4 + 0.9 * max(0.0, math.sin(PI * i / (len(path) - 1))) ** 0.6) for i in range(len(path))]
    m.tube(path, rs, mat, seg=4, cap=False, smooth=0.0, flat=0.4, up=(0, 0, 1))
