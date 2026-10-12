"""Baked secondary motion for Maelis: hair locks, the split skirt's panels, bell sleeves, charms and weapon tassels (Verlet cloth
from cloth.py), plus the hat's lagging tip and brim (a few damped springs).

Everything is built once in local coordinates of the frame it hangs from (head, pelvis, forearm, weapon ...), placed in the pose
of the animation's first frame, pinned to the moving body while the animation plays and baked at 240 Hz.
"""
import math

import numpy as np
from mathutils import Matrix, Vector

from bl import rotx, roty, rotz, trans
from cloth import Cloth
from heroine_rig import D, HAT_Z, HAT_TILT, HEAD_C, weapon_frame
from rig import frame_along

PI = math.pi

# the staff head, in weapon-local coordinates (origin = the right fist, +Z up the shaft, +Y the way the head faces)
STAFF_HALF = 0.85
STAFF_O = (0.0, 0.0, 0.93)


def hat_frame(S):
    return S.hat


def fore_frame(S, s):
    sx = 1.0 if s == 'l' else -1.0
    elbow, wrist = getattr(S, 'elbow_' + s), getattr(S, 'wrist_' + s)
    up = S.chest.to_3x3() @ Vector((sx * 0.25, -0.6, 0.5))
    return frame_along(elbow, wrist, up)


FRAMES = {
    'head': lambda S: S.head,
    'pelvis': lambda S: S.pelvis,
    'spine': lambda S: S.spine,
    'hat': hat_frame,
    'fore_l': lambda S: fore_frame(S, 'l'),
    'fore_r': lambda S: fore_frame(S, 'r'),
    'wep_l': lambda S: weapon_frame(S, 'l'),
    'wep_r': lambda S: weapon_frame(S, 'r'),
}


class Sim:
    """A Cloth plus, for every point, the frame it was built in; pinned points follow their frame."""

    def __init__(self, **kw):
        self.cl = Cloth(**kw)
        self.place = []      # (frame, indices, local points)
        self.pins = {}       # frame -> ([indices], [local points])

    def _reg(self, frame, idx, pts, pinned):
        self.place.append((frame, list(idx), np.array(pts, np.float64)))
        if pinned:
            self.pins.setdefault(frame, ([], []))
            self.pins[frame][0].extend(idx[:pinned] if isinstance(pinned, int) else [idx[i] for i in pinned])
            self.pins[frame][1].extend(pts[:pinned] if isinstance(pinned, int) else [pts[i] for i in pinned])

    def chain(self, pts, frame, pinned=2, **kw):
        idx = self.cl.chain(pts, pinned=pinned, **kw)
        self._reg(frame, idx, pts, pinned)
        return idx

    def grid(self, rows, frame, pin_rows=(0,), **kw):
        G = self.cl.grid(rows, pinned_row=0 in pin_rows, **kw)
        flat = [i for row in G for i in row]
        pts = [p for row in rows for p in row]
        for r in pin_rows:
            for i in G[r]:
                self.cl.inv[i] = 0.0
        self.place.append((frame, flat, np.array(pts, np.float64)))
        self.pins.setdefault(frame, ([], []))
        for r in pin_rows:
            for j, i in enumerate(G[r]):
                self.pins[frame][0].append(i)
                self.pins[frame][1].append(rows[r][j])
        return G

    def init(self, S):
        """Move every point to where its frame puts it in pose S (the cloth starts the animation in its first pose)."""
        P = [list(p) for p in self.cl.P]
        for fr, idx, loc in self.place:
            M = FRAMES[fr](S)
            W = loc @ np.array(M.to_3x3()).T + np.array(M.translation)
            for i, w in zip(idx, W):
                P[i] = [float(w[0]), float(w[1]), float(w[2])]
        self.cl.P = [tuple(p) for p in P]
        self._pin_arr = {fr: (np.array(idx, int), np.array(loc, np.float64)) for fr, (idx, loc) in self.pins.items()}

    def pins_at(self, S):
        out = {}
        for fr, (idx, loc) in self._pin_arr.items():
            M = FRAMES[fr](S)
            W = loc @ np.array(M.to_3x3()).T + np.array(M.translation)
            for i, w in zip(idx, W):
                out[int(i)] = w
        return out


# ------------------------------------------------------------------------------------------------ hair

def hair_layout():
    """Locks: dicts with the head-local root, outward normal, hang direction, length, point count, kind, width, layer."""
    rnd = np.random.RandomState(11)
    C = np.array([0.0, 0.012, HEAD_C + 0.012])
    rad = np.array([0.090, 0.099, 0.101])
    locks = []

    def root_of(phi, e):
        ph, el = math.radians(phi), e
        dirn = np.array([math.sin(ph) * math.cos(el), math.cos(ph) * math.cos(el), math.sin(el)])
        p = C + rad * dirn
        n = dirn / rad
        return p, n / np.linalg.norm(n)

    # back hair: rows from the crown to the nape; the higher the row, the further out its layer lies
    for e, n_l, span, ln, layer in ((0.30, 5, 62, 0.80, 2), (0.12, 7, 98, 0.76, 1), (-0.08, 8, 114, 0.70, 0), (-0.36, 4, 62, 0.55, 0)):
        for k in range(n_l):
            phi = -span + 2 * span * (k + 0.5 * rnd.rand()) / max(n_l - 1, 1)
            p, n = root_of(phi, e + 0.08 * (rnd.rand() - 0.5))
            hang = np.array([0.45 * math.sin(math.radians(phi)), 0.22, -1.0])
            locks.append(dict(root=p, n=n, hang=hang / np.linalg.norm(hang), length=ln * (0.9 + 0.2 * rnd.rand()), n_pts=12,
                              kind='back', width=0.075 + 0.03 * rnd.rand(), mat=int(rnd.randint(3)), layer=layer,
                              wave=0.014 + 0.012 * rnd.rand(), ph=6.28 * rnd.rand(), flat=0.4))
    # locks that fall forward over the shoulders
    for sx in (-1, 1):
        for phi, e, ln, layer in ((96, -0.04, 0.62, 0), (102, 0.10, 0.68, 1), (108, 0.24, 0.64, 2)):
            p, n = root_of(sx * phi, e)
            hang = np.array([sx * 0.15, -0.35, -1.0])
            locks.append(dict(root=p, n=n, hang=hang / np.linalg.norm(hang), length=ln * (0.92 + 0.16 * rnd.rand()), n_pts=12,
                              kind='front', width=0.058 + 0.015 * rnd.rand(), mat=int(rnd.randint(3)), layer=layer,
                              wave=0.012 + 0.01 * rnd.rand(), ph=6.28 * rnd.rand(), flat=0.4))
    # short strands framing the face under the brim
    for sx in (-1, 1):
        for phi, e in ((148, 0.2), (158, 0.28)):
            p, n = root_of(sx * phi, e)
            hang = np.array([sx * 0.25, -0.3, -1.0])
            locks.append(dict(root=p, n=n, hang=hang / np.linalg.norm(hang), length=0.17 + 0.04 * rnd.rand(), n_pts=5,
                              kind='fringe', width=0.03, mat=int(rnd.randint(3)), layer=0, wave=0.0, ph=0.0, flat=0.4))
    return locks


def build_hair(locks):
    sim = Sim(gravity=9.8, drag=4.0, damping=0.05, iterations=8)
    chains = []
    for L in locks:
        n = L['n_pts']
        seg = L['length'] / (n - 1)
        pts = [L['root'] + 0.0 * L['n']]
        p = L['root'] + L['n'] * 0.016
        pts.append(p)
        for k in range(2, n):
            w = min(1.0, (k - 1) / 3.0)
            d = L['n'] * (1 - w) + L['hang'] * w
            d = d / np.linalg.norm(d)
            p = p + d * seg
            q = p + np.array([L['wave'] * math.sin(6.28 * (k * seg) / 0.26 + L['ph']), 0.0, 0.0]) * min(1.0, (k - 1) / 4.0)
            pts.append(q)
        pts = [tuple(float(x) for x in q) for q in pts]
        chains.append(sim.chain(pts, 'head', pinned=2, stiff=1.0, bend=0.12, r=0.017 + 0.015 * L['layer']))
    return sim, chains


def hair_cols(S):
    h = S.head
    c = tuple((h @ Vector((0, 0.012, HEAD_C + 0.012))))
    cols = [(c, c, 0.099),
            (tuple(S.neck.translation), tuple(h.translation), 0.04)]
    for sx in (-0.035, 0.035):
        a = S.spine @ Vector((sx, 0.01, 0.05))
        b = S.chest @ Vector((sx, 0.0, 0.17))
        cols.append((tuple(a), tuple(b), 0.088))
    cols.append((tuple(S.sh_r), tuple(S.sh_l), 0.06))
    cols.append((tuple(S.sh_r), tuple(S.elbow_r), 0.055))
    cols.append((tuple(S.sh_l), tuple(S.elbow_l), 0.055))
    cols.append((tuple(S.elbow_r), tuple(S.fist_r), 0.045))
    cols.append((tuple(S.elbow_l), tuple(S.fist_l), 0.045))
    return cols


# ------------------------------------------------------------------------------------------------ garments

SKIRT_Z = [0.165 - 0.1007 * k for k in range(8)]
SKIRT_RX = [0.112, 0.15, 0.178, 0.198, 0.214, 0.226, 0.236, 0.244]
SKIRT_RY = [0.088, 0.112, 0.13, 0.145, 0.157, 0.167, 0.175, 0.182]
# panel centres (degrees from the front toward her left), half spans, flare, hem teeth, hem depth, material
PANELS = [(0, 17, 0.86, 3, 0.10, 'front'), (53, 23, 1.0, 4, 0.14, 'panel'), (118, 27, 1.08, 4, 0.16, 'panel'),
          (180, 30, 1.12, 5, 0.12, 'back'), (242, 27, 1.08, 4, 0.16, 'panel'), (307, 23, 1.0, 4, 0.14, 'panel')]
SLEEVE_ROWS = [(0.0, 0.046), (0.05, 0.051), (0.11, 0.066), (0.18, 0.084), (0.25, 0.104)]
SLEEVE_COLS = 10
HAT_CHARMS = (-0.09, 0.0, 0.1)


def rim_point(u, r=0.34, ry=0.96, z=-0.028):
    a = u * 2 * PI
    return (math.sin(a) * r, -math.cos(a) * r * ry, z)


def build_garment(wp):
    sim = Sim(gravity=9.8, drag=1.7, damping=0.03, iterations=9)
    skirts = []
    for (cen, hs, flare, teeth, depth, kind) in PANELS:
        rows = []
        for k in range(8):
            rx = SKIRT_RX[0] + (SKIRT_RX[k] - SKIRT_RX[0]) * flare
            ry = SKIRT_RY[0] + (SKIRT_RY[k] - SKIRT_RY[0]) * flare
            row = []
            for j in range(5):
                th = math.radians(cen + (j / 4.0 - 0.5) * 2 * hs)
                row.append((rx * math.sin(th), -ry * math.cos(th), SKIRT_Z[k]))
            rows.append(row)
        G = sim.grid(rows, 'pelvis', pin_rows=(0, 1), stiff=0.9, shear=0.45, bend=0.16, r=0.028)
        skirts.append(G)
    # a teal under-skirt that shows through the splits
    UZ = [0.165, 0.065, -0.06, -0.19, -0.32]
    URX = [0.106, 0.138, 0.154, 0.165, 0.172]
    URY = [0.083, 0.104, 0.115, 0.122, 0.127]
    urows = [[(URX[k] * math.sin(2 * PI * j / 12), -URY[k] * math.cos(2 * PI * j / 12), UZ[k]) for j in range(12)] for k in range(5)]
    under = sim.grid(urows, 'pelvis', pin_rows=(0, 1), stiff=0.9, shear=0.5, bend=0.25, closed=True, r=0.026)
    sleeves = {}
    for s in ('l', 'r'):
        rows = []
        for d, r in SLEEVE_ROWS:
            rows.append([(r * math.cos(2 * PI * j / SLEEVE_COLS), r * math.sin(2 * PI * j / SLEEVE_COLS), -d) for j in range(SLEEVE_COLS)])
        sleeves[s] = sim.grid(rows, 'fore_' + s, pin_rows=(0, 1), stiff=0.9, shear=0.5, bend=0.22, closed=True, r=0.028)
    charms = []
    for u in HAT_CHARMS:
        p0 = rim_point(u)
        pts = [(p0[0], p0[1], p0[2] - 0.026 * k) for k in range(3)]
        charms.append(sim.chain(pts, 'hat', pinned=1, stiff=1.0, bend=0.0, r=0.006))
    belt = sim.chain([(0.055, -0.108, 0.15 - 0.03 * k) for k in range(3)], 'spine', pinned=1, stiff=1.0, bend=0.0, r=0.006)
    wchains = []
    if wp == 'staff':
        for sx in (-1, 1):
            pts = [(sx * 0.07, 0.0, 0.905 - 0.038 * k) for k in range(4)]
            wchains.append(sim.chain(pts, 'wep_r', pinned=1, stiff=1.0, bend=0.0, r=0.006))
    else:
        for s in ('l', 'r'):
            pts = [(0.0, 0.0, -0.14 - 0.034 * k) for k in range(3)]
            wchains.append(sim.chain(pts, 'wep_' + s, pinned=1, stiff=1.0, bend=0.0, r=0.006))
    return sim, dict(skirts=skirts, under=under, sleeves=sleeves, charms=charms, belt=belt, wchains=wchains)


def garment_cols(S, wp):
    cols = []
    hl, hr = S.hip_l, S.hip_r
    cols.append((tuple(hl), tuple(hr), 0.105))
    cols.append((tuple(S.hip_l), tuple(S.knee_l), 0.078))
    cols.append((tuple(S.hip_r), tuple(S.knee_r), 0.078))
    cols.append((tuple(S.knee_l), tuple(S.ankle_l), 0.058))
    cols.append((tuple(S.knee_r), tuple(S.ankle_r), 0.058))
    for sx in (-0.04, 0.04):
        a = S.pelvis @ Vector((sx, 0.0, 0.05))
        b = S.spine @ Vector((sx, 0.0, 0.17))
        cols.append((tuple(a), tuple(b), 0.082))
    cols.append((tuple(S.sh_l), tuple(S.elbow_l), 0.048))
    cols.append((tuple(S.sh_r), tuple(S.elbow_r), 0.048))
    cols.append((tuple(S.elbow_l), tuple(S.wrist_l), 0.042))
    cols.append((tuple(S.elbow_r), tuple(S.wrist_r), 0.042))
    return cols


def bake(sim, S0, cache, cols_fn, times, period, air, loops=3, settle=0.5):
    sim.init(S0)

    def drive(t):
        S = cache.at(t)
        return sim.pins_at(S), cols_fn(S), (air(t) if callable(air) else air)

    return sim.cl.bake(drive, times, loops=loops, settle=settle, period=period)


# ------------------------------------------------------------------------------------------------ the hat's springs

def hat_dyn(cache, times, period, air, loops=3, settle=0.4, rate=240.0):
    """The crown's tip and the brim's rim as damped followers of their rest points. Returns, per time, (tip offset in the hat
    frame (3,), droop of 12 rim points (12,))."""
    tip_l = np.array([0.0, 0.07, 0.40])
    rim_l = np.array([[math.sin(2 * PI * k / 12) * 0.33, -math.cos(2 * PI * k / 12) * 0.33 * 0.96, -0.02] for k in range(12)])
    loc = np.vstack([tip_l[None, :], rim_l])                       # (13, 3)
    f = np.array([5.0] + [7.5] * 12)
    zeta = np.array([0.22] + [0.3] * 12)
    k = (2 * PI * f) ** 2
    c = 2 * zeta * np.sqrt(k)
    dt = 1.0 / rate

    def anchors(t):
        S = cache.at(t)
        M = hat_frame(S)
        R = np.array(M.to_3x3())
        return loc @ R.T + np.array(M.translation), R

    t0 = times[0]
    a, _ = anchors(t0)
    q = a.copy()
    v = np.zeros_like(q)
    out = []

    def step(t, q, v):
        a, R = anchors(t)
        acc = k[:, None] * (a - q) - c[:, None] * v
        v = v + acc * dt
        q = q + v * dt
        return q, v, a, R

    def sample(q, a, R):
        d = (q - a) @ R                                           # into the hat frame (R is local -> world)
        tip = np.clip(d[0], -0.1, 0.1) * 0.8 + np.array([0.0, 0.0035 * air[1], 0.0])
        droop = np.clip(-d[1:, 2] * 1.1, -0.03, 0.03)
        return tip, droop

    if period:
        total = period * loops
        tt = 0.0
        sample_t = [t0 + period * (loops - 1) + (t - t0) for t in times]
        kx = 0
        while kx < len(sample_t) and tt < total + period:
            q, v, a, R = step(t0 + (tt % period), q, v)
            tt += dt
            while kx < len(sample_t) and t0 + tt >= sample_t[kx] - 1e-9:
                out.append(sample(q, a, R))
                kx += 1
    else:
        tt = 0.0
        while tt < settle:
            q, v, a, R = step(t0, q, v)
            tt += dt
        t = t0
        kx = 0
        while kx < len(times):
            while kx < len(times) and t >= times[kx] - 1e-9:
                out.append(sample(q, a, R))
                kx += 1
            if kx >= len(times):
                break
            q, v, a, R = step(t, q, v)
            t += dt
    return out
