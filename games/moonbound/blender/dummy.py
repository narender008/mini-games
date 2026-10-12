"""The Hollow's training dummy: a sackcloth figure lashed to a crossed post, with a tattered rag that flaps when it is struck.

Frames (set hollow, 72 px/m, pivot = the ground under the post):
  dummy_idle_d<d>_0        standing still, 8 directions (mirrored)
  dummy_hit_d<d>_0..5      struck from the front: rocks back on its post and settles, the rag flapping (baked cloth)
"""
import math

from mathutils import Vector

import bl
import mats
from bl import Mesh, trans, rotx, roty, rotz
from cloth import Cloth

SET = 'hollow'
PI = math.pi

mats.define('sackcloth', base='#8a7458', base2='#5f4e3a', pattern='weave', pscale=4, pamt=0.7, dirt=0.3, seed=31)
mats.define('rag', base='#2c3256', base2='#46507e', pattern='weave', pscale=3, pamt=0.6, seed=33)
mats.define('target_paint', base='#9c3a2e', base2='#c9b48a', pattern='noise', pscale=8, pamt=0.3)


def body(m, tilt):
    """Post, crossbar, stuffed body and head; `tilt` rocks the whole figure back about its foot (radians)."""
    T = rotx(tilt)
    m.cyl((0, 0, 0), (0, 0, 1.75), 0.07, 0.06, 'wood_dark', seg=10, mx=T)
    m.box(-0.6, 0.6, -0.05, 0.05, 1.28, 1.38, 'wood', mx=T, bevel=0.012)
    m.ball((0, 0, 1.05), (0.3, 0.22, 0.36), 'sackcloth', mx=T)
    m.ball((0, 0, 1.62), (0.17, 0.16, 0.19), 'sackcloth', mx=T)
    for sx in (-1, 1):
        m.capsule((sx * 0.25, 0, 1.33), (sx * 0.62, 0.0, 1.3), 0.08, 0.07, 'sackcloth', mx=T)
    # a painted target on the chest and rope lashings
    m.cyl((0, -0.2, 1.1), (0, -0.235, 1.1), 0.16, 0.16, 'target_paint', seg=18, mx=T)
    for z in (0.78, 1.33, 1.5):
        m.cyl((0, 0, z - 0.02), (0, 0, z + 0.02), 0.3 if z < 1 else 0.12, None, 'rope', seg=14, mx=T)


def rag_points(tilt):
    """Pins along the crossbar where the rag hangs."""
    T = rotx(tilt)
    return [tuple(T @ Vector((x, -0.06, 1.3))) for x in (-0.45, -0.3, -0.15)]


def build(ctx):
    # the rag: a little sheet hanging from the crossbar, 3 pins x 5 rows
    def tilt_at(t):
        # struck at t = 0: snaps back then rings out
        return -0.32 * math.exp(-t * 5.0) * math.sin(t * 16.0 + 0.4) if t > 0 else 0.0

    cl = Cloth(drag=1.2)
    rows = [[(p[0], p[1], p[2] - r * 0.11) for p in rag_points(0.0)] for r in range(6)]
    G = cl.grid(rows, pinned_row=True, stiff=0.9)

    def drive(t):
        tl = tilt_at(t)
        pins = {G[0][j]: p for j, p in enumerate(rag_points(tl))}
        cols = [(tuple(rotx(tl) @ Vector((0, 0, 0.8))), tuple(rotx(tl) @ Vector((0, 0, 1.3))), 0.3)]
        return pins, cols, (0.0, 0.0, 0.0)

    times = [i / 12.0 for i in range(6)]
    sims = cl.bake(drive, times, settle=0.8)

    def rag_mesh(X):
        m = Mesh('rag')
        nr, nc = len(G), len(G[0])
        P = [[Vector(X[G[i][j]]) for j in range(nc)] for i in range(nr)]
        m.grid_sheet(lambda u, v: P[min(int(round(v * (nr - 1))), nr - 1)][min(int(round(u * (nc - 1))), nc - 1)],
                     nc - 1, nr - 1, 'rag', smooth=60, thick=0.008)
        return m

    def frame(i, idle=False):
        m = Mesh('dummy')
        t = -1.0 if idle else times[i]
        body(m, tilt_at(t) if not idle else 0.0)
        return [m, rag_mesh(sims[0] if idle else sims[i])]

    ctx.anim('dummy_idle', 1, lambda i: frame(0, True), dirs=8, fps=1)
    ctx.anim('dummy_hit', 6, frame, dirs=8, fps=12, loop=False)
