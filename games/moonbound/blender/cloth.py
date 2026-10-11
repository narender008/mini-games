"""Baked secondary motion: a small Verlet solver for hair locks, coat skirts, capes, banners, chains and wraith rags.

The solver runs in the character's own frame (built facing south, -Y). Root motion the game adds later (running, dashing) is
felt as wind: `air` is the velocity of the air relative to the character, so a character running forward at 7 m/s sees air at
(0, +7, 0) and its hair and coat stream back. Loops are simulated for a few cycles and the last cycle is kept, so a looping
animation's cloth also loops; one-shot animations start from a settled idle.

    cl = Cloth(gravity=9.8, drag=1.6)
    lock = cl.chain([(x, y, z), ...], pinned=1, stiff=1.0)       # indices; the first `pinned` points follow pins
    skirt = cl.grid(rows, pinned_row=True, stiff=0.9)            # 2D list of indices (rows of points around the waist)
    def drive(t):                                                 # where the pins are at time t, and the colliders
        return {i: pos, ...}, [(a, b, r), ...], air_velocity
    frames = cl.bake(drive, times, loops=3, settle=0.6)          # list of (N, 3) arrays, one per time
"""
import math

import numpy as np


class Cloth:
    def __init__(self, gravity=9.8, drag=1.4, damping=0.02, iterations=10):
        self.P = []            # initial positions
        self.inv = []          # inverse mass (0 = pinned)
        self.links = []        # (i, j, rest, stiffness)
        self.bend = []         # (i, j, rest, stiffness) longer-range links that resist folding
        self.gravity = gravity
        self.drag = drag
        self.damping = damping
        self.iterations = iterations
        self.radius = []       # collision radius per point

    # ---- building
    def point(self, p, pinned=False, r=0.02):
        self.P.append(tuple(p))
        self.inv.append(0.0 if pinned else 1.0)
        self.radius.append(r)
        return len(self.P) - 1

    def link(self, i, j, stiff=1.0, bend=False):
        a, b = np.array(self.P[i]), np.array(self.P[j])
        (self.bend if bend else self.links).append((i, j, float(np.linalg.norm(a - b)), stiff))

    def chain(self, pts, pinned=1, stiff=1.0, bend=0.4, r=0.02):
        """A strand through `pts`: the first `pinned` points are pins. Returns the point indices."""
        idx = [self.point(p, i < pinned, r) for i, p in enumerate(pts)]
        for a, b in zip(idx, idx[1:]):
            self.link(a, b, stiff)
        if bend > 0:
            for a, b in zip(idx, idx[2:]):
                self.link(a, b, bend, bend=True)
        return idx

    def grid(self, rows, pinned_row=True, stiff=1.0, shear=0.5, bend=0.3, closed=False, r=0.03):
        """A sheet from rows of points (rows[0] is the top, pinned when `pinned_row`). closed = the rows wrap around
        (a skirt). Returns the 2D list of indices [row][col]."""
        G = [[self.point(p, pinned_row and ri == 0, r) for p in row] for ri, row in enumerate(rows)]
        nr, nc = len(G), len(G[0])
        cols = nc if closed else nc - 1
        for i in range(nr):
            for j in range(cols):
                self.link(G[i][j], G[i][(j + 1) % nc], stiff)
        for i in range(nr - 1):
            for j in range(nc):
                self.link(G[i][j], G[i + 1][j], stiff)
            if shear > 0:
                for j in range(cols):
                    self.link(G[i][j], G[i + 1][(j + 1) % nc], shear)
                    self.link(G[i][(j + 1) % nc], G[i + 1][j], shear)
        if bend > 0:
            for i in range(nr - 2):
                for j in range(nc):
                    self.link(G[i][j], G[i + 2][j], bend, bend=True)
            for i in range(nr):
                for j in range(nc if closed else nc - 2):
                    self.link(G[i][j], G[i][(j + 2) % nc], bend, bend=True)
        return G

    # ---- solving
    def _arrays(self):
        L = np.array([(i, j) for i, j, _, _ in self.links + self.bend], np.int64).reshape(-1, 2)
        R = np.array([r for _, _, r, _ in self.links + self.bend], np.float64)
        K = np.array([k for _, _, _, k in self.links + self.bend], np.float64)
        return L, R, K

    def bake(self, drive, times, loops=3, settle=0.5, fps_sub=240.0, period=None):
        """Simulate and return the point positions at every time in `times` (seconds, ascending).
        drive(t) -> (pins {index: xyz}, colliders [(a, b, r)], air xyz). A looping animation passes `period` (its length):
        the simulation runs `loops` periods and the last one is returned. A one-shot animation runs `settle` seconds at
        times[0] first, then through the times once."""
        X = np.array(self.P, np.float64)
        inv = np.array(self.inv, np.float64)
        rad = np.array(self.radius, np.float64)
        L, R, K = self._arrays()
        g = np.array([0.0, 0.0, -self.gravity])
        dt = 1.0 / fps_sub
        prev = X.copy()

        def apply(t, X, prev):
            pins, cols, air = drive(t)
            for i, p in pins.items():
                X[i] = p
                prev[i] = p   # pins carry no inherited velocity of their own: they are moved, not simulated
            return cols, np.array(air, np.float64)

        def step(t, X, prev, last_pins):
            pins, cols, air = drive(t)
            air = np.array(air, np.float64)
            # move pins (keeping their motion so that neighbours inherit it through the links)
            for i, p in pins.items():
                prev[i] = X[i]
                X[i] = p
            free = inv > 0
            vel = (X - prev)
            acc = g + self.drag * (air - vel / dt)
            nxt = X + vel * (1.0 - self.damping) + acc * dt * dt
            prev[free] = X[free]
            X[free] = nxt[free]
            for _ in range(self.iterations):
                d = X[L[:, 1]] - X[L[:, 0]]
                ln = np.linalg.norm(d, axis=1)
                ln = np.maximum(ln, 1e-9)
                diff = (ln - R) / ln * K
                w0 = inv[L[:, 0]]
                w1 = inv[L[:, 1]]
                ws = np.maximum(w0 + w1, 1e-9)
                corr = d * diff[:, None]
                c0 = corr * (w0 / ws)[:, None]
                c1 = corr * (w1 / ws)[:, None]
                acc0 = np.zeros_like(X)
                cnt = np.zeros(len(X))
                np.add.at(acc0, L[:, 0], c0)
                np.add.at(acc0, L[:, 1], -c1)
                np.add.at(cnt, L[:, 0], 1)
                np.add.at(cnt, L[:, 1], 1)
                X += acc0 / np.maximum(cnt, 1)[:, None] * 1.6 * free[:, None]
                collide(X, cols, rad, free)
                # never through the floor
                X[:, 2] = np.maximum(X[:, 2], rad)
            return X, prev

        t0 = times[0]
        out = []
        if period:
            # run whole periods; sample the last one
            total = period * loops
            tt = 0.0
            apply(t0, X, prev)
            sample = [t0 + period * (loops - 1) + (t - t0) for t in times]
            k = 0
            while k < len(sample):
                X, prev = step(t0 + (tt % period), X, prev, None)
                tt += dt
                while k < len(sample) and t0 + tt >= sample[k] - 1e-9:
                    out.append(X.copy())
                    k += 1
                if tt > total + period:
                    break
        else:
            apply(t0, X, prev)
            tt = 0.0
            while tt < settle:
                X, prev = step(t0, X, prev, None)
                tt += dt
            t = t0
            k = 0
            while k < len(times):
                while k < len(times) and t >= times[k] - 1e-9:
                    out.append(X.copy())
                    k += 1
                if k >= len(times):
                    break
                X, prev = step(t, X, prev, None)
                t += dt
        return out


def collide(X, cols, rad, free):
    """Push points out of capsules (a, b, r)."""
    for a, b, r in cols:
        a = np.asarray(a, np.float64)
        b = np.asarray(b, np.float64)
        ab = b - a
        L2 = max(float(ab @ ab), 1e-12)
        t = np.clip(((X - a) @ ab) / L2, 0.0, 1.0)
        c = a + t[:, None] * ab
        d = X - c
        dist = np.linalg.norm(d, axis=1)
        lim = r + rad
        hit = (dist < lim) & free
        if not hit.any():
            continue
        n = d[hit] / np.maximum(dist[hit], 1e-9)[:, None]
        X[hit] = c[hit] + n * lim[hit][:, None]


def ring(center, rx, ry, z, n, phase=0.0):
    """n points on an ellipse around `center` (x, y) at height z, starting at the front (-Y) and going round to its left."""
    cx, cy = center
    return [(cx + rx * math.sin(phase + 2 * math.pi * i / n), cy - ry * math.cos(phase + 2 * math.pi * i / n), z) for i in range(n)]
