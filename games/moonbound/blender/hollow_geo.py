"""Hollow lane: geometry helpers on top of bl.Mesh (splines, gnarled bark tubes, rootlets, blobs, rocks, boxes with metric UVs,
tori, discs with planar UVs, candles). All pieces are built around the origin, front = -Y, standing on z = 0."""
import math
import random

import bmesh
from mathutils import Matrix, Vector
from mathutils import noise as mn

import bl
from bl import Mesh, PI, axis_matrix, rotx, roty, rotz, trans

TAU = 2 * PI


# ------------------------------------------------------------------------------------------------ splines

def catmull(pts, n=8):
    P = [Vector(p) for p in pts]
    if len(P) == 2:
        return [P[0].lerp(P[1], k / n) for k in range(n + 1)]
    Q = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((p1 * 2) + (p2 - p0) * t + (p0 * 2 - p1 * 5 + p2 * 4 - p3) * t * t + (p1 * 3 - p0 - p2 * 3 + p3) * t ** 3))
    out.append(P[-1])
    return out


def sample_path(ctrl, radii, step=0.05):
    """Smooth path through ctrl with the radius interpolated (also a spline), resampled every `step` metres:
    (points, radii, arclengths)."""
    dense = catmull(ctrl, 14)
    if isinstance(radii, (int, float)):
        radii = [radii] * len(ctrl)
    rr = [max(0.001, v[0]) for v in catmull([(r, 0, 0) for r in radii], 14)]
    L = [0.0]
    for i in range(1, len(dense)):
        L.append(L[-1] + (dense[i] - dense[i - 1]).length)
    total = L[-1]
    n = max(2, int(round(total / step)))
    pts, rads, ss = [], [], []
    j = 0
    for k in range(n + 1):
        s = total * k / n
        while j < len(L) - 2 and L[j + 1] < s:
            j += 1
        t = (s - L[j]) / max(L[j + 1] - L[j], 1e-9)
        pts.append(dense[j].lerp(dense[j + 1], t))
        rads.append(rr[j] + (rr[j + 1] - rr[j]) * t)
        ss.append(s)
    return pts, rads, ss


def path_at(pts, rads, f):
    """Position, unit tangent and radius at fraction f (0..1) of a sampled path."""
    f = min(max(f, 0.0), 1.0)
    x = f * (len(pts) - 1)
    i = min(int(x), len(pts) - 2)
    t = x - i
    p = pts[i].lerp(pts[i + 1], t)
    tg = (pts[i + 1] - pts[i]).normalized()
    return p, tg, rads[i] + (rads[i + 1] - rads[i]) * t


# ------------------------------------------------------------------------------------------------ bark tubes

def bark_tube(m, ctrl, radii, mat='hl_bark', seg=26, step=0.05, seed=0.0, lump=0.12, lump_freq=1.0, ridge=0.02, floor=0.0,
              ends=(True, True), tile=1.4, flat=1.0, twist=0.0, knots=(), vscale=1.0, uturns=1):
    """A gnarled root: a tube along a spline with lumps, bark fissures (ridge: metres deep), knots = [(fraction, width m, amount)]
    bulges, flat < 1 squashing it vertically, twist spiralling the fissures. Everything is clamped to z >= floor. UV u around
    (0..1), v = distance / tile. ends: True rounds that end off, False caps it flat (buried in something). Returns the sampled
    (points, radii)."""
    pts, rads, ss = sample_path(ctrl, radii, step)
    total = ss[-1]
    n0 = len(pts)
    T = []
    for i in range(n0):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n0 - 1)]
        T.append((b - a).normalized())
    # round the ends with a few extra rings
    ring_c, ring_r, ring_s, ring_t = [], [], [], []
    caps = 4
    if ends[0]:
        for k in range(caps, 0, -1):
            ang = k / caps * (PI / 2)
            ring_c.append(pts[0] - T[0] * rads[0] * math.sin(ang))
            ring_r.append(max(rads[0] * math.cos(ang), rads[0] * 0.05))
            ring_s.append(ss[0] - rads[0] * math.sin(ang))
            ring_t.append(T[0])
    for i in range(n0):
        ring_c.append(pts[i])
        ring_r.append(rads[i])
        ring_s.append(ss[i])
        ring_t.append(T[i])
    if ends[1]:
        for k in range(1, caps + 1):
            ang = k / caps * (PI / 2)
            ring_c.append(pts[-1] + T[-1] * rads[-1] * math.sin(ang))
            ring_r.append(max(rads[-1] * math.cos(ang), rads[-1] * 0.05))
            ring_s.append(ss[-1] + rads[-1] * math.sin(ang))
            ring_t.append(T[-1])
    n = len(ring_c)
    t0 = ring_t[0]
    ref = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
    U = t0.cross(ref).normalized()
    tb = bmesh.new()
    uvl = tb.loops.layers.uv.verify()
    rings = []
    for i in range(n):
        Ti = ring_t[i]
        U = (U - Ti * U.dot(Ti)).normalized()
        Vv = U.cross(Ti)
        s = ring_s[i]
        r = ring_r[i]
        fk = 0.0
        for (fr, wd, amt) in knots:
            fk += amt * math.exp(-(((s - fr * total) / wd) ** 2))
        kr = 0.9 + 3.0 * r
        row = []
        for j in range(seg):
            th = TAU * j / seg
            c, sn = math.cos(th), math.sin(th)
            ph = th + twist * s
            rn = mn.noise(Vector((math.cos(ph) * kr + seed * 3.1, math.sin(ph) * kr + seed * 1.7, s * 0.8 + seed)))
            ln = mn.noise(Vector((c * 0.9 + seed * 2.3, sn * 0.9 - seed, s * lump_freq + seed * 0.7)))
            rad = r * (1.0 + lump * ln + fk) + ridge * (min(1.0, abs(rn) * 3.2) - 1.0)
            p = ring_c[i] + (U * c + Vv * sn * flat) * max(rad, 0.004)
            if p.z < floor:
                p.z = floor
            row.append(tb.verts.new(p))
        rings.append(row)
    for i in range(n - 1):
        for j in range(seg):
            j2 = (j + 1) % seg
            try:
                f = tb.faces.new([rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]])
            except ValueError:
                continue
            v0, v1 = ring_s[i] / tile * vscale, ring_s[i + 1] / tile * vscale
            for l, uv in zip(f.loops, ((j / seg * uturns, v0), ((j + 1) / seg * uturns, v0), ((j + 1) / seg * uturns, v1), (j / seg * uturns, v1))):
                l[uvl].uv = uv
    for ring in (rings[0], rings[-1]):
        try:
            f = tb.faces.new(ring)
            for l in f.loops:
                l[uvl].uv = (0.5, 0.5)
        except ValueError:
            pass
    m.commit(tb, mat, 75.0)
    return pts, rads


def braid(m, ctrl, radii, n=3, turns=0.45, off=0.5, srad=0.6, core=True, seed=0.0, mat='hl_bark', step=0.05, lump=0.2, ridge=0.024,
          floor=0.0, flat=1.0, ends=(True, True), knots=(), uturns=1, seg=22, tile=None):
    """A root made of n strands wound round each other (and a core strand): the gnarled, cabled look of a great root.
    Returns the main (points, radii) path for dressing."""
    pts, rads, ss = sample_path(ctrl, radii, step=0.1)
    n0 = len(pts)
    t0 = (pts[1] - pts[0]).normalized()
    ref = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
    U = t0.cross(ref).normalized()
    frames = []
    for i in range(n0):
        Ti = (pts[min(i + 1, n0 - 1)] - pts[max(i - 1, 0)]).normalized()
        U = (U - Ti * U.dot(Ti)).normalized()
        frames.append((U.copy(), U.cross(Ti)))
    stride = 3
    idx = list(range(0, n0, stride))
    if idx[-1] != n0 - 1:
        idx.append(n0 - 1)
    for k in range(n):
        ph0 = TAU * k / n + seed
        sc, sr = [], []
        for i in idx:
            ph = ph0 + TAU * turns * ss[i]
            U, Vv = frames[i]
            o = (U * math.cos(ph) + Vv * math.sin(ph) * flat) * rads[i] * off
            sc.append(pts[i] + o)
            sr.append(rads[i] * srad)
        bark_tube(m, sc, sr, mat, seg=seg, step=step, seed=seed + k * 1.9, lump=lump, ridge=ridge, floor=floor, ends=ends,
                  tile=tile or max(0.5, 3.3 * rads[len(rads) // 2] * srad), flat=flat, twist=1.0 * (1 if k % 2 else -1), knots=knots,
                  uturns=uturns)
    if core:
        sc = [pts[i] for i in idx]
        bark_tube(m, sc, [rads[i] * srad * 0.95 for i in idx], mat, seg=seg, step=step, seed=seed + 9.1, lump=lump, ridge=ridge, floor=floor,
                  ends=ends, tile=tile or max(0.5, 3.3 * rads[len(rads) // 2] * srad), flat=flat, knots=knots, uturns=uturns)
    return pts, rads


def rootlet(m, p, length, r, rng, dx=0.0, dy=0.0, mat='hl_rootfine', floor=0.01, sway=0.09):
    """A thin hanging rootlet from p."""
    p = Vector(p)
    n = 6
    pts, rr = [], []
    ph = rng.random() * 6.28
    for k in range(n):
        t = k / (n - 1)
        q = Vector((p.x + dx * t + math.sin(ph + t * 3.2) * sway * t, p.y + dy * t + math.cos(ph + t * 2.4) * sway * t * 0.6,
                    p.z - length * t))
        q.z = max(q.z, floor)
        pts.append(q)
        rr.append(r * (1.0 - 0.8 * t))
    if (pts[-1] - pts[-2]).length < 1e-4:
        pts[-1] = pts[-2] + Vector((0.01, 0, 0))
    m.tube(pts, rr, mat, seg=5, smooth=80.0, cap=True)


def blob(m, c, radii, mat, seed=0.0, amp=0.04, freq=6.0, seg=10, rings=6, mx=None):
    """A lumpy ellipsoid (moss pad, mushroom bulb, loaf of wax, rubble)."""
    sub = Mesh('blob')
    sub.ball((0, 0, 0), radii, mat, seg=seg, rings=rings)
    sub.warp(amp, freq, seed)
    M = trans(*c)
    if mx is not None:
        M = mx @ M
    m.add(sub, M)
    sub.free()


def moss_pads(m, pts, rads, rng, count, size=(0.08, 0.2), mat='hl_moss', seed=0.0, lift=0.0):
    """Moss pads sitting on the upper side of a sampled path."""
    for _ in range(count):
        f = rng.random()
        p, tg, r = path_at(pts, rads, f)
        sz = rng.uniform(*size)
        # the top of the tube is where z is highest: for a ground root, straight above the axis
        c = Vector((p.x + rng.uniform(-0.3, 0.3) * r, p.y + rng.uniform(-0.3, 0.3) * r, p.z + r * rng.uniform(0.55, 0.9) + lift))
        blob(m, c, (sz, sz * rng.uniform(0.7, 1.2), sz * 0.45), mat, seed=rng.random() * 40, amp=sz * 0.35, freq=9.0 / sz * 0.25)


# ------------------------------------------------------------------------------------------------ rocks

def rock(m, c, radii, mat='hl_rock', seed=0, npts=0, bevel=0.0, flat_bottom=True, jag=0.34, smooth=0.0, yaw=0.0, seg=34, rings=20,
         style='hull', steps=5.0):
    """A cave rock sitting on z = c.z with a flat base, scaled to `radii`.
    blob: a noise-pushed sphere; terrace: the same with its radius pulled onto steps (stacked, slabby, hewn);
    hull: a convex hull of jittered points with hard facets."""
    rx, ry, rz = radii
    sub = Mesh('rock')
    if style == 'hull':
        rng = random.Random(seed)
        pts = []
        for i in range(npts or 80):
            u = rng.uniform(-1, 1)
            a = rng.uniform(0, TAU)
            s_ = math.sqrt(1 - u * u)
            k = 1.0 + rng.uniform(-jag, jag * 0.5)
            q = Vector((s_ * math.cos(a) * rx * k, s_ * math.sin(a) * ry * k, u * rz * k))
            q.z = max(q.z, -rz * 0.3)
            pts.append(q)
        sub.hull(pts, mat, smooth=smooth or 38.0, bevel=bevel or 0.035)
    else:
        sub.ball((0, 0, 0), (1, 1, 1), mat, seg=seg, rings=rings)
        off = Vector((seed * 7.13 + 3.1, seed * 3.7 - 1.3, seed * 1.9 + 5.2))
        for v in sub.bm.verts:
            u = v.co.normalized()
            n1 = mn.noise(u * 1.15 + off)
            n2 = mn.noise(u * 2.4 + off * 1.7)
            n3 = mn.noise(u * 5.5 + off * 0.6)
            crev = 1.0 - min(1.0, abs(mn.noise(u * 3.0 + off * 2.3)) * 5.0)
            k = 1.0 + jag * (0.8 * n1 + 0.35 * n2) + 0.05 * n3 - 0.12 * crev
            if style == 'terrace':
                kq = round(k * steps) / steps
                k = k * 0.35 + kq * 0.65
            z = u.z + (0.06 * math.sin(u.z * 9.0 + seed) if style == 'blob' else 0.0)
            v.co = Vector((u.x * rx * k, u.y * ry * k, z * rz * k))
            if flat_bottom and v.co.z < -rz * 0.3:
                v.co.z = -rz * 0.3
    z0 = min(v.co.z for v in sub.bm.verts)
    M = trans(c[0], c[1], c[2] - z0) @ rotz(yaw)
    m.add(sub, M)
    sub.free()


def stalagmite(m, c, h, r, mat='hl_rock', seed=0, seg=14, lean=(0.0, 0.0), rings=14, flare=0.9):
    """A tapering spire with a bumpy flank, a rounded tip and a flared foot."""
    rng = random.Random(seed)
    prof = []
    for i in range(rings + 1):
        t = i / rings
        rad = r * (1.0 - t) ** 0.85 * (1.0 + flare * math.exp(-t * (9 + 6 * (0.9 - flare)))) * (1 + 0.12 * math.sin(t * 17 + seed))
        prof.append((t * h, max(rad, 0.0)))
    sub = Mesh('stalag')
    sub.lathe(prof, mat, None, seg, smooth=70.0)
    sub.warp(r * 0.18, 2.2 / max(r, 0.2), seed * 1.7)
    # lean: shear x, y with height
    for v in sub.bm.verts:
        t = v.co.z / h
        v.co.x += lean[0] * t * t
        v.co.y += lean[1] * t * t
    m.add(sub, trans(*c))
    sub.free()


# ------------------------------------------------------------------------------------------------ boxes, discs, tori

def uvscale(m, su, sv, ou=0.0, ov=0.0):
    for f in m.bm.faces:
        for l in f.loops:
            uv = l[m.uvl].uv
            l[m.uvl].uv = (uv[0] * su + ou, uv[1] * sv + ov)


def wbox(m, x0, x1, y0, y1, z0, z1, mat, grain='z', tile=1.0, bevel=0.008, mx=None, off=None, smooth=0.0):
    """A box whose faces carry metric UVs (metres / tile), the texture's V running along the `grain` axis ('x', 'y' or 'z')."""
    tb = bmesh.new()
    bmesh.ops.create_cube(tb, size=1.0)
    bmesh.ops.scale(tb, vec=(x1 - x0, y1 - y0, z1 - z0), verts=tb.verts[:])
    bmesh.ops.translate(tb, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=tb.verts[:])
    uvl = tb.loops.layers.uv.verify()
    gi = 'xyz'.index(grain)
    if off is None:
        h = (x0 * 12.9898 + y0 * 78.233 + z0 * 37.719)
        off = ((math.sin(h) * 43758.5453) % 1.0, (math.sin(h * 1.7) * 24634.6345) % 1.0)
    for f in tb.faces:
        nrm = f.normal
        a = max(range(3), key=lambda k: abs(nrm[k]))
        others = [k for k in range(3) if k != a]
        if a == gi:
            ui, vi = others[0], others[1]
        else:
            vi = gi
            ui = [k for k in others if k != gi][0]
        for l in f.loops:
            co = l.vert.co
            l[uvl].uv = (co[ui] / tile + off[0], co[vi] / tile + off[1])
    m.commit(tb, mat, smooth, mx, bevel)


def torus(m, R, r, mat, mx=None, seg=32, rseg=8, arc=TAU):
    """A ring tube around local Z (major radius R, minor r), or an arc of it (open ends capped)."""
    tb = bmesh.new()
    uvl = tb.loops.layers.uv.verify()
    full = arc >= TAU - 1e-6
    nu = seg if full else seg + 1
    V = [[tb.verts.new(((R + r * math.cos(TAU * j / rseg)) * math.cos(arc * i / seg),
                        (R + r * math.cos(TAU * j / rseg)) * math.sin(arc * i / seg), r * math.sin(TAU * j / rseg)))
          for j in range(rseg)] for i in range(nu)]
    for i in range(seg if full else seg):
        i2 = (i + 1) % nu if full else i + 1
        for j in range(rseg):
            j2 = (j + 1) % rseg
            try:
                f = tb.faces.new([V[i][j], V[i2][j], V[i2][j2], V[i][j2]])
            except ValueError:
                continue
            for l, uv in zip(f.loops, ((i / seg, j / rseg), ((i + 1) / seg, j / rseg), ((i + 1) / seg, (j + 1) / rseg), (i / seg, (j + 1) / rseg))):
                l[uvl].uv = uv
    if not full:
        for ring in (V[0], V[-1][::-1]):
            try:
                f = tb.faces.new(ring)
            except ValueError:
                pass
    m.commit(tb, mat, 70.0, mx)


def disc(m, R, z, mat, mx=None, seg=48, ru=1.0, up=True):
    """A flat disc at height z with planar UVs (u = 0.5 + x / 2R, v = 0.5 + y / 2R: north is up the texture), facing up or down."""
    tb = bmesh.new()
    uvl = tb.loops.layers.uv.verify()
    vs = [tb.verts.new((R * math.cos(TAU * i / seg), R * math.sin(TAU * i / seg), z)) for i in range(seg)]
    f = tb.faces.new(vs if up else vs[::-1])
    for l in f.loops:
        co = l.vert.co
        l[uvl].uv = (0.5 + co.x / (2 * R) * ru, 0.5 + co.y / (2 * R) * ru)
    m.commit(tb, mat, 0.0, mx)


def vdisc(m, R, y, zc, mat, mx=None, seg=64, ru=1.0):
    """A flat disc standing in the XZ plane at depth y, centred at height zc, facing -Y (the camera), UV u = 0.5 + x/2R, v = 0.5 + (z - zc)/2R."""
    tb = bmesh.new()
    uvl = tb.loops.layers.uv.verify()
    vs = [tb.verts.new((R * math.cos(TAU * i / seg), y, zc + R * math.sin(TAU * i / seg))) for i in range(seg)]
    f = tb.faces.new(vs[::-1])
    for l in f.loops:
        co = l.vert.co
        l[uvl].uv = (0.5 + co.x / (2 * R) * ru, 0.5 + (co.z - zc) / (2 * R) * ru)
    m.commit(tb, mat, 0.0, mx)


def lathe_uv(m, prof, mat, su=1, sv=1, mx=None, seg=24, smooth=40.0, cap=True, bevel=0.0, ou=0.0, ov=0.0):
    sub = Mesh('l')
    sub.lathe(prof, mat, None, seg, smooth, cap=cap, bevel=bevel)
    uvscale(sub, su, sv, ou, ov)
    m.add(sub, mx)
    sub.free()


def D(a, b):
    return (Vector(b) - Vector(a)).length


# ------------------------------------------------------------------------------------------------ candles

def candle(m, x, y, z0, h, r, seed=0, mat='hl_wax', drips=4, pool=True, lights=None):
    """A thick, dripping candle standing on z0 at (x, y). Appends the flame point (Blender coords) to `lights`."""
    rng = random.Random(seed)
    prof = [(0.0, r * 1.14), (0.012, r * 1.07)]
    k = 6
    for i in range(k + 1):
        t = i / k
        prof.append((0.03 + t * (h - 0.05), r * (1.0 + 0.05 * math.sin(t * 9 + seed) + 0.03 * (1 - t))))
    prof += [(h - 0.004, r * 1.0), (h, r * 0.93), (h - 0.008, r * 0.75), (h - 0.016, r * 0.4), (h - 0.018, 0.0)]
    sub = Mesh('candle')
    sub.lathe(prof, mat, None, 16, smooth=60.0)
    sub.warp(r * 0.05, 14.0, seed)
    m.add(sub, trans(x, y, z0))
    sub.free()
    a0 = rng.random() * TAU
    for d in range(drips):
        a = a0 + d * TAU / drips + rng.uniform(-0.5, 0.5)
        ln = rng.uniform(0.2, 0.7) * h
        rd = r * rng.uniform(0.14, 0.22)
        rr = r * 0.97
        p0 = Vector((x + rr * math.cos(a), y + rr * math.sin(a), z0 + h - 0.006))
        pts = [p0 + Vector((math.cos(a) * 0.0, math.sin(a) * 0.0, -ln * t)) + Vector((math.cos(a), math.sin(a), 0)) * (r * 0.06 * math.sin(t * 3.0))
               for t in (0.0, 0.3, 0.65, 0.92, 1.0)]
        m.tube(pts, [rd * 0.4, rd, rd * 0.95, rd * 1.5, rd * 0.8], mat, seg=6, smooth=80.0)
    if pool:
        blob(m, (x, y, z0 + 0.004), (r * rng.uniform(1.6, 2.1), r * rng.uniform(1.6, 2.1), 0.012), mat, seed=seed, amp=r * 0.25, freq=4.0)
    m.cyl((x, y, z0 + h - 0.014), (x, y, z0 + h + 0.026), 0.0032, 0.0022, 'hl_wick', seg=6)
    if lights is not None:
        lights.append((x, y, z0 + h + 0.05))


class Lights:
    """Collects light points (Blender coords) for ctx.anchor / ctx.value."""

    def __init__(self, main=None):
        self.pts = []
        self.main = main        # index of the point that is the 'light' anchor (default: the centroid at the highest point)

    def add(self, p):
        self.pts.append((float(p[0]), float(p[1]), float(p[2])))

    def record(self, ctx, name):
        if not self.pts:
            return
        ctx.value('lights', name, [[round(x, 3), round(-y, 3), round(z, 3)] for x, y, z in self.pts])
        # the single brightest point (highest) doubles as the piece's 'light' anchor
        if self.main is not None:
            ctx.anchor('light', name, self.pts[self.main])
            return
        cx = sum(p[0] for p in self.pts) / len(self.pts)
        cy = sum(p[1] for p in self.pts) / len(self.pts)
        cz = max(p[2] for p in self.pts)
        ctx.anchor('light', name, (cx, cy, cz))
