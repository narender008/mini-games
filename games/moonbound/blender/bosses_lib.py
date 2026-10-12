"""Shared modelling helpers for the two Gloamwall bosses (gaoler.py, seraph.py): materials, thorns and plates, ribbons, rings, and a
baked chain (a small verlet rope with ground friction, simulated in the WORLD frame so a dragged chain really drags).

Conventions are the kit's: Blender world, X east, Y north, Z up, models face south (-Y), standing on z = 0.
"""
import math

import numpy as np
from mathutils import Matrix, Vector

import mats
from bl import Mesh, rotx, roty, rotz, trans, scale, axis_matrix
from cloth import collide

PI = math.pi


# ------------------------------------------------------------------------------------------------ materials

def define_materials():
    d = mats.define
    # aged, blackened bone: warm grey-tan, stained dark in the hollows, rubbed pale on the edges
    d('bs_bone', base='#a39a86', base2='#3a342b', pattern='noise', pscale=6, pamt=0.8, gloss=0.14, wear=0.9, bump=0.4,
      bscale=45, bevel=0.01, seed=41, dirt=0.15)
    d('bs_bone_hi', base='#bdb299', base2='#6a6150', pattern='noise', pscale=8, pamt=0.65, gloss=0.16, wear=0.9, bump=0.35,
      bscale=50, bevel=0.01, seed=42)
    d('bs_bone_old', base='#7f7560', base2='#2e2922', pattern='cracks', pscale=9, pamt=0.75, gloss=0.1, wear=0.7, bump=0.35,
      bscale=40, bevel=0.01, seed=43, dirt=0.2)
    d('bs_bone_dark', base='#564e41', base2='#292520', pattern='noise', pscale=7, pamt=0.7, gloss=0.12, wear=0.5, bump=0.35,
      bscale=45, bevel=0.008, seed=44)
    d('bs_tooth', base='#c9bea0', base2='#8a7f66', pattern='noise', pscale=14, pamt=0.6, gloss=0.3, wear=0.6, bevel=0.004, seed=45)
    # deep violet sinew and flesh
    d('bs_sinew', base='#3c3445', base2='#1c1724', pattern='cracks', pscale=20, pamt=0.55, gloss=0.16, wear=0.6, bump=0.5,
      bscale=30, bevel=0.02, seed=46)
    d('bs_sinew_dark', base='#282230', base2='#0f0c16', pattern='cracks', pscale=22, pamt=0.55, gloss=0.12, bump=0.5, bscale=30,
      bevel=0.02, seed=47)
    d('bs_sinew_hi', base='#564a60', base2='#2b2434', pattern='cracks', pscale=18, pamt=0.55, gloss=0.2, wear=0.7, bump=0.5,
      bscale=30, bevel=0.02, seed=48)
    # iron, blackened and rusted
    d('bs_iron', base='#2b2a31', base2='#686373', pattern='noise', pscale=6, pamt=0.6, gloss=0.55, wear=0.95, bump=0.3,
      bscale=50, bevel=0.01, seed=51)
    d('bs_iron_dark', base='#18171c', base2='#3b3a45', pattern='noise', pscale=7, pamt=0.6, gloss=0.45, wear=0.8, bump=0.3,
      bscale=50, bevel=0.01, seed=52)
    d('bs_rust', base='#352720', base2='#8b5233', pattern='noise', pscale=5, pamt=0.85, gloss=0.22, wear=0.6, bump=0.55,
      bscale=40, bevel=0.012, seed=53)
    d('bs_silver', base='#8d98aa', base2='#d3dce8', pattern='noise', pscale=9, pamt=0.7, gloss=0.8, wear=0.9, bump=0.2,
      bscale=60, bevel=0.006, seed=54)
    d('bs_silver_faded', base='#5d6578', base2='#9aa4b6', pattern='noise', pscale=7, pamt=0.8, gloss=0.6, wear=0.7, bump=0.3,
      bscale=50, bevel=0.006, seed=55)
    # cloth
    d('bs_cloth_navy', base='#1c2140', base2='#3a3f6c', pattern='weave', pscale=3, pamt=0.75, dirt=0.3, seed=56)
    d('bs_cloth_violet', base='#2a2048', base2='#4a3d78', pattern='weave', pscale=3, pamt=0.75, seed=57)
    d('bs_cloth_dark', base='#100e1d', base2='#2a2447', pattern='weave', pscale=3, pamt=0.8, seed=58)
    d('bs_void', base='#06050c', base2='#13102a', pattern='noise', pscale=5, pamt=0.6, bevel=0.004, seed=59)
    # soul light: the only saturated colour. A dim glowing fill and a hot white-cyan core.
    d('bs_soul_dim', base='#117078', base2='#2bb5b2', pattern='noise', pscale=4, pamt=0.7, emit=0.7, bevel=0.004, seed=60)
    d('bs_soul_hot', base='#dcffff', emit=1.0, bevel=0.003)
    d('bs_wood', base='#2c2019', base2='#50382a', pattern='grain', pscale=9, pamt=0.7, gloss=0.18, wear=0.5, bump=0.4, bscale=45,
      bevel=0.012, seed=61)


# ------------------------------------------------------------------------------------------------ small geometry helpers

def V(*a):
    return Vector(a[0] if len(a) == 1 else a)


def bez(p0, p1, bend, n=5):
    """n points on a quadratic curve from p0 to p1 bulging by `bend` (a vector added to the middle control point)."""
    p0, p1, b = Vector(p0), Vector(p1), Vector(bend)
    c = (p0 + p1) * 0.5 + b * 2.0   # the curve passes b past the middle
    out = []
    for i in range(n):
        t = i / (n - 1)
        out.append(p0 * (1 - t) ** 2 + c * (2 * (1 - t) * t) + p1 * (t * t))
    return out


def spike(m, a, b, r, mat, bend=(0, 0, 0), seg=6, n=5, mx=None, tip=0.004, pw=0.9, flat=1.0, up=None, smooth=70.0):
    """A tapered, curved thorn from a (base, radius r) to b (point). seg 4-5 with flat < 1 and smooth 0 makes a faceted blade."""
    pts = bez(a, b, bend, n)
    rad = [max(tip, r * (1.0 - i / (n - 1)) ** pw) for i in range(n)]
    m.tube(pts, rad, mat, seg=seg, smooth=smooth, mx=mx, flat=flat, up=up)


def blade(m, a, b, r, mat, bend=(0, 0, 0), up=None, flat=0.45, n=5, mx=None):
    """A faceted bone blade: four-sided, flattened, curved (claws, bone spurs)."""
    spike(m, a, b, r, mat, bend=bend, seg=4, n=n, mx=mx, flat=flat, up=up, smooth=0.0, pw=0.8)


def tendons(m, FR, L, radius, n, mat, r=0.03, twist=0.6, phase=0.0, x0=0.0, y0=0.0, steps=6, lift=1.02):
    """Cords of sinew wrapped along a limb section (frame FR, length L down -Z, radius(t))."""
    for k in range(n):
        a0 = phase + 2 * PI * k / n
        pts = []
        for i in range(steps + 1):
            t = 0.04 + 0.92 * i / steps
            a = a0 + twist * t
            rr = radius(t) * lift
            pts.append((x0 + rr * math.cos(a), y0 + rr * math.sin(a), -t * L))
        m.tube(pts, r, mat, seg=5, smooth=70.0, mx=FR)


def torus(m, center, normal, R, r, mat, seg=6, n=16, mx=None, start=0.0, arc=2 * PI):
    """A ring (or an arc of one) of tube radius r and ring radius R round `normal`."""
    c = Vector(center)
    nrm = Vector(normal).normalized()
    u = nrm.orthogonal().normalized()
    v = nrm.cross(u)
    pts = [c + (u * math.cos(start + arc * j / n) + v * math.sin(start + arc * j / n)) * R for j in range(n + 1)]
    m.tube(pts, r, mat, seg=seg, cap=(arc < 2 * PI - 1e-6), mx=mx)


def plate(m, c, size, mat, mx=None, rot=None, bevel=0.012, taper=0.7, warp=0.0, seed=0.0):
    """A chunky tapered armour or bone plate centred at c: size = (width x, thickness y, height z); the top is `taper` as wide
    as the bottom. Edges are bevelled so it catches the edge light."""
    w, t, h = size
    x0, x1 = w * 0.5, w * 0.5 * taper
    pts = [(-x0, -t / 2, -h / 2), (x0, -t / 2, -h / 2), (x0, t / 2, -h / 2), (-x0, t / 2, -h / 2),
           (-x1, -t * 0.4, h / 2), (x1, -t * 0.4, h / 2), (x1, t * 0.4, h / 2), (-x1, t * 0.4, h / 2)]
    M = trans(*c) @ (rot if rot is not None else Matrix.Identity(4))
    if mx is not None:
        M = mx @ M
    if warp > 0:
        sub = Mesh('plate')
        sub.hull(pts, mat, bevel=bevel)
        sub.warp(warp, 9.0, seed)
        m.add(sub, M)
        sub.free()
    else:
        m.hull(pts, mat, mx=M, bevel=bevel)


def knobbed_bone(m, a, b, r, mat, knob=1.5, mx=None, seg=8):
    """A long bone: a shaft with fat rounded ends."""
    a, b = Vector(a), Vector(b)
    m.capsule(a, b, r, r * 0.85, mat, mx=mx, seg=seg, rings=3)
    rr = r * knob
    m.ball(a, (rr, rr, rr * 1.1), mat, mx=mx, seg=max(8, seg), rings=5)
    m.ball(b, (rr * 0.9, rr * 0.9, rr), mat, mx=mx, seg=max(8, seg), rings=5)


def ribbon(m, pts, widths, mat, up=(0, 0, 1), thick=0.006, nu=2, smooth=50.0, mx=None, uv_len=1.0):
    """A flat strip along the polyline pts with a width per point (rags, strips of cloth, plumes). The strip lies across
    cross(tangent, up). Width 0 at an end makes a point."""
    P = [Vector(p) for p in pts]
    n = len(P)
    up = Vector(up)
    across = []
    for i in range(n):
        if i == 0:
            t = P[1] - P[0]
        elif i == n - 1:
            t = P[-1] - P[-2]
        else:
            t = P[i + 1] - P[i - 1]
        t = t.normalized() if t.length > 1e-9 else Vector((0, 0, -1))
        a = t.cross(up)
        if a.length < 1e-4:
            a = t.cross(Vector((1, 0, 0)))
            if a.length < 1e-4:
                a = t.cross(Vector((0, 1, 0)))
        across.append(a.normalized())
    # make the across vectors continuous (no flips)
    for i in range(1, n):
        if across[i].dot(across[i - 1]) < 0:
            across[i] = -across[i]

    def fn(u, v):
        j = min(int(round(v * (n - 1))), n - 1)
        return P[j] + across[j] * ((u - 0.5) * 2.0 * widths[j])

    m.grid_sheet(fn, nu, n - 1, mat, smooth=smooth, thick=thick, mx=mx,
                 uv=(lambda a, b: (a, b * uv_len)))


def limb_lathe(m, FR, L, prof, mat, sx=1.0, sy=1.0, x0=0.0, y0=0.0, seg=14, cap0=True, cap1=True):
    """A muscled limb section along the local -Z of frame FR, length L: prof = [(t, radius)] along 0..1, rounded at both ends,
    cross-section squashed by (sx, sy) and offset by (x0, y0) in the frame."""
    r0, r1 = prof[0][1], prof[-1][1]
    pr = []
    if cap0:
        for k in range(4):
            a = PI / 2 * k / 3
            pr.append((-r0 * math.cos(a), r0 * math.sin(a)))
    for t, r in prof:
        pr.append((t * L, r))
    if cap1:
        for k in range(1, 4):
            a = PI / 2 * k / 3
            pr.append((L + r1 * math.sin(a), r1 * math.cos(a)))
    M = FR @ trans(x0, y0, 0) @ rotx(PI) @ Matrix.Diagonal((sx, sy, 1.0, 1.0))
    m.lathe(pr, mat, M, seg=seg, smooth=80.0, cap=False)


def ring_pts(c, rx, ry, z, n, a0=0.0, a1=2 * PI):
    """n+1 points on an ellipse at height z; angle 0 is the front (-Y), increasing toward +X."""
    cx, cy = c
    return [(cx + rx * math.sin(a0 + (a1 - a0) * i / n), cy - ry * math.cos(a0 + (a1 - a0) * i / n), z) for i in range(n + 1)]


def lerp(a, b, t):
    return a + (b - a) * t


# ------------------------------------------------------------------------------------------------ baked chain

class Chain:
    """A heavy chain: points a link pitch apart, first point pinned to the wrist ring. Simulated in the WORLD frame while the
    body travels at `speed` along -Y (the walking direction), with gravity, link constraints, a ground that holds friction and
    a heavy last point. bake() returns, for every requested time, the points in the BODY frame.
    """

    def __init__(self, n_links, pitch, r=0.03, end_inv=0.25, iterations=26):
        self.n = n_links + 1
        self.pitch = pitch
        self.r = r
        self.end_inv = end_inv
        self.iterations = iterations

    def bake(self, pin_fn, times, speed=0.0, period=None, loops=3, settle=1.0, cols_fn=None, mu=0.55, damping=0.004,
             start_dir=(0.0, 1.0, 0.0), sub=240.0):
        """pin_fn(t) -> wrist ring position in the body frame; cols_fn(t) -> [(a, b, r)] body-frame capsules (legs) the
        chain must not enter. Looping: `period` runs `loops` periods and returns the last; otherwise settle, then play."""
        n = self.n
        dt = 1.0 / sub
        t0 = times[0]
        pin0 = np.array(pin_fn(t0), np.float64)
        X = np.zeros((n, 3))
        sd = np.array(start_dir, np.float64)
        X[0] = pin0
        n_drop = int((pin0[2] - self.r) / self.pitch)
        # hang down to the ground, then coil up there in a loose spiral (a pile of chain, not a straight line)
        rad = 0.22
        cx, cy = pin0[0] + sd[0] * rad, pin0[1] + sd[1] * rad
        theta = math.atan2(-sd[1], -sd[0])
        for i in range(1, n):
            if i <= n_drop:
                X[i] = pin0 + np.array([0, 0, -i * self.pitch])
                continue
            theta += self.pitch / max(rad, 0.12)
            rad += 0.03
            X[i] = np.array([cx + rad * math.cos(theta), cy + rad * math.sin(theta), self.r])
        X[:, 2] = np.maximum(X[:, 2], self.r)
        prev = X.copy()
        inv = np.ones(n)
        inv[0] = 0.0
        inv[-1] = self.end_inv
        g = np.array([0.0, 0.0, -9.8])
        rad = np.full(n, self.r)
        free = inv > 0
        state = dict(T=0.0)
        out = []

        def step(tl, speed_now):
            nonlocal X, prev
            state['T'] += dt
            drift = np.array([0.0, -speed_now * state['T'], 0.0])
            pin = np.array(pin_fn(tl), np.float64) + drift
            prev[0] = X[0]
            X[0] = pin
            vel = X - prev
            on = X[:, 2] <= self.r + 0.006
            vel[on, 0] *= (1.0 - mu)
            vel[on, 1] *= (1.0 - mu)
            vel[:, :] *= (1.0 - damping)
            nxt = X + vel + g * dt * dt
            prev = X.copy()
            X = np.where(free[:, None], nxt, X)
            cols = cols_fn(tl) if cols_fn else None
            if cols:
                cols = [(np.array(a) + drift, np.array(b) + drift, r) for a, b, r in cols]
            for _ in range(self.iterations):
                d = X[1:] - X[:-1]
                ln = np.maximum(np.linalg.norm(d, axis=1), 1e-9)
                diff = (ln - self.pitch) / ln
                w0, w1 = inv[:-1], inv[1:]
                ws = np.maximum(w0 + w1, 1e-9)
                corr = d * diff[:, None]
                acc = np.zeros_like(X)
                np.add.at(acc, np.arange(n - 1), corr * (w0 / ws)[:, None])
                np.add.at(acc, np.arange(1, n), -corr * (w1 / ws)[:, None])
                cnt = np.zeros(n)
                cnt[:-1] += 1
                cnt[1:] += 1
                X += acc / np.maximum(cnt, 1)[:, None] * 1.5 * free[:, None]
                if cols:
                    collide(X, cols, rad, free)
                X[:, 2] = np.maximum(X[:, 2], self.r)
            X[0] = pin
            return drift

        if period:
            T = 0.0
            # run in whole periods, ramping nothing: the body moves at `speed` from the start
            total = period * loops
            k = 0
            sample = [t0 + period * (loops - 1) + (t - t0) for t in times]
            tt = 0.0
            while k < len(sample):
                drift = step(t0 + (tt % period), speed)
                tt += dt
                while k < len(sample) and t0 + tt >= sample[k] - 1e-9:
                    out.append(X - drift)
                    k += 1
                if tt > total + period:
                    break
        else:
            tt = 0.0
            while tt < settle:
                step(t0, 0.0)
                tt += dt
            state['T'] = 0.0
            t = t0
            k = 0
            while k < len(times):
                drift = step(t, 0.0)
                while k < len(times) and t >= times[k] - 1e-9:
                    out.append(X - drift)
                    k += 1
                t += dt
        return out


def chain_links(m, P, r, mat, pitch=None, up=(0, 0, 1)):
    """Link meshes along a baked chain (points P, body frame): link i joins P[i] and P[i+1], alternate links turned a quarter."""
    P = [Vector(p) for p in P]
    L = (pitch or (P[1] - P[0]).length) * 1.42
    W = L * 0.62
    for i in range(len(P) - 1):
        a, b = P[i], P[i + 1]
        d = b - a
        if d.length < 1e-6:
            continue
        d = d.normalized()
        e1 = d.cross(Vector(up))
        if e1.length < 0.2:
            e1 = d.cross(Vector((1, 0, 0)))
        e1.normalize()
        e2 = d.cross(e1).normalized()
        e = e1 if i % 2 == 0 else e2
        c = (a + b) * 0.5
        n = 10
        pts = [c + d * (math.cos(2 * PI * j / n) * L * 0.5) + e * (math.sin(2 * PI * j / n) * W * 0.5) for j in range(n + 1)]
        m.tube(pts, r, mat, seg=5, cap=False, smooth=60.0)


# ------------------------------------------------------------------------------------------------ frames

def frame_pts(p0, p1, hint):
    """A frame at p0 whose local -Z runs toward p1 and whose local -Y leans toward `hint`."""
    from rig import frame_along
    return frame_along(p0, p1, hint)


def basis(zdir, ydir, origin=None):
    """A 4x4 matrix whose local +Z is zdir and whose local +Y is ydir (made perpendicular), at `origin`."""
    z = Vector(zdir).normalized()
    y = Vector(ydir)
    y = y - z * y.dot(z)
    if y.length < 1e-6:
        y = z.orthogonal()
    y.normalize()
    x = y.cross(z)
    M = Matrix((x, y, z)).transposed().to_4x4()
    if origin is not None:
        M.translation = Vector(origin)
    return M


def safe_flush(ctx, margin=1.0e6):
    """Work around a kit limit: Ctx._queue flushes (and frees the frame's mesh datablocks) as soon as the pending area passes
    FLUSH_AREA, which can happen between two directions of one frame when frames are big. Flush BEFORE building a frame whenever
    the next one could cross the line."""
    import bl
    flush_area = 1.6 * (bl.SHEET_MAX // bl.SS) ** 2
    area = sum(c.w * c.h for items in ctx.pending.values() for c, _ in items)
    if area > flush_area - margin:
        ctx.flush()
