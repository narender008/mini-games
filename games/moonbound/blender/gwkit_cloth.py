"""Gloamwall kit: cloth pieces baked with cloth.py: the wall banner (8 frames @ 8 fps loop) and, in gwkit_pedlar.py, the pedlar's rags."""
import math
import random

import numpy as np
from mathutils import Vector

import bl
from bl import Mesh, trans, rotx, roty, rotz, scale, PI
from cloth import Cloth
from gwkit_shapes import rblock, moss
from gwkit_decor import circle_pts

BAR_Z = 3.2
BAR_Y = -0.05
WIDTH = 0.72
LENGTH = 2.0
NR, NC = 16, 9


def hem_len(u, rng_vals):
    """Relative length of the banner at the cross position u (0..1): a swallowtail with a ragged edge."""
    base = 1.0 - 0.17 * (1.0 - abs(2 * u - 1))
    return base - rng_vals[min(int(u * (len(rng_vals) - 1) + 0.5), len(rng_vals) - 1)]


class Banner:
    def __init__(self, seed=701):
        self.rng = random.Random(seed)
        self.rag = [self.rng.uniform(0.0, 0.035) for _ in range(19)]
        self.cl = Cloth(gravity=9.8, drag=1.7, damping=0.025, iterations=12)
        rows = []
        for i in range(NR):
            z = BAR_Z - 0.03 - LENGTH * i / (NR - 1)
            rows.append([(-WIDTH / 2 + WIDTH * j / (NC - 1), BAR_Y - 0.012, z) for j in range(NC)])
        self.G = self.cl.grid(rows, pinned_row=True, stiff=0.95, shear=0.5, bend=0.35, r=0.02)
        self.top = [rows[0][j] for j in range(NC)]
        self.T = 1.0

    def drive(self, t):
        pins = {self.G[0][j]: self.top[j] for j in range(NC)}
        cols = [((x, 0.17, 1.0), (x, 0.17, BAR_Z + 0.1), 0.115) for x in (-0.3, -0.1, 0.1, 0.3)]
        w = 2 * PI * t / self.T
        air = (1.0 + 1.9 * math.sin(w), -(0.7 + 1.2 * math.sin(w + 0.9)), 0.0)
        return pins, cols, air

    def bake(self, n=8):
        times = [i / float(n) for i in range(n)]
        return self.cl.bake(self.drive, times, loops=4, period=self.T)

    def surface(self, X):
        P = [[Vector(X[self.G[i][j]]) for j in range(NC)] for i in range(NR)]

        def at(u, v):
            fu, fv = u * (NC - 1), v * (NR - 1)
            j, i = min(int(fu), NC - 2), min(int(fv), NR - 2)
            a, b = fu - j, fv - i
            return (P[i][j] * (1 - a) * (1 - b) + P[i][j + 1] * a * (1 - b) + P[i + 1][j] * (1 - a) * b + P[i + 1][j + 1] * a * b)
        return at

    def mesh(self, X):
        m = Mesh('banner')
        at = self.surface(X)
        rag = self.rag
        ell = lambda u: hem_len(u, rag)
        m.grid_sheet(lambda u, v: tuple(at(u, v * ell(u))), 18, 26, 'gw_banner_cloth', smooth=55.0, thick=0.008,
                     uv=lambda u, v: (u, 1.0 - v * ell(u)))
        # gold cord along the hem and little tassels
        edge = [tuple(at(u, ell(u))) for u in [k / 24.0 for k in range(25)]]
        m.tube(edge, 0.011, 'gw_gold', seg=5, cap=True)
        for k in range(0, 25):
            u = k / 24.0
            p = Vector(at(u, ell(u)))
            q = p + Vector((0.0, -0.01, -0.075 - 0.01 * ((k * 5) % 3)))
            m.cyl(tuple(p), tuple(q), 0.009, 0.003, 'gw_gold', seg=5, smooth=0.0)
        # the rolled top edge round the bar
        top = [tuple(Vector(X[self.G[0][j]]) + Vector((0, -0.01, 0.0))) for j in range(NC)]
        m.tube([(-WIDTH / 2, BAR_Y, BAR_Z), (WIDTH / 2, BAR_Y, BAR_Z)], 0.034, 'gw_navy_dark', seg=8, cap=True)
        return m


def bracket(m):
    """The iron bar and wall brackets the banner hangs from (static)."""
    m.tube([(-0.5, BAR_Y, BAR_Z + 0.025), (0.5, BAR_Y, BAR_Z + 0.025)], 0.016, 'gw_iron', seg=7, cap=True)
    for sg in (-1, 1):
        # a spear-tip finial at each end
        x = sg * 0.5
        m.hull([(x, BAR_Y - 0.02, BAR_Z + 0.025), (x, BAR_Y + 0.02, BAR_Z + 0.025), (x, BAR_Y, BAR_Z + 0.05), (x, BAR_Y, BAR_Z + 0.0),
                (x + sg * 0.1, BAR_Y, BAR_Z + 0.025)], 'gw_iron', bevel=0.003, smooth=30)
        # arms back to the wall plate
        arm = [(sg * 0.4, BAR_Y, BAR_Z + 0.025), (sg * 0.4, BAR_Y + 0.1, BAR_Z + 0.07), (sg * 0.4, 0.16, BAR_Z + 0.07)]
        m.tube(arm, 0.014, 'gw_iron', seg=6, cap=True)
        m.box(sg * 0.4 - 0.045, sg * 0.4 + 0.045, 0.14, 0.17, BAR_Z - 0.06, BAR_Z + 0.15, 'gw_iron', bevel=0.008)
        for dz in (-0.03, 0.12):
            m.ball((sg * 0.4, 0.135, BAR_Z + dz), (0.014, 0.01, 0.014), 'gw_steel', seg=6, rings=4)
    return m


def banner_frames(n=8):
    b = Banner()
    sims = b.bake(n)
    frames = []
    for i in range(n):
        m = b.mesh(sims[i])
        bracket(m)
        frames.append(m)
    return frames
