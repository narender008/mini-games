"""Debris: wheel, sprocket, hatch, torn armour plates, track run, jerrycan, toolbox, machine gun."""
import math
import random
from math import pi, sin, cos, sqrt

import numpy as np
import bmesh
from mathutils import Vector

from bl import Mesh, trans, roty, rotx, rotz, at_xz, scale
from parts import (Theme, road_wheel, sprocket_wheel, track_link, jerrycan, toolbox, mg_gun, bolt, bolts_xz, handle, hinge, weld_bead, lug)

TD = Theme('debris')


def wheel():
    m = Mesh('debris_wheel')
    R = 12 * 0.19 / (2 * pi)
    w = road_wheel(R, 12, 'rubber', 'steel', 'steel_dark', twin=False)
    m.add(w, trans(0, 0.0, 0.0))
    return m


def sprocket():
    m = Mesh('debris_sprocket')
    R = 13 * 0.19 / (2 * pi)
    m.add(sprocket_wheel(R, 13, 0.19, 0.0, 'steel', 'steel_dark', 'steel_dark'))
    return m


def hatch():
    """A round hatch lid seen from above-ish: thick disc, hinge ears, a lifting handle, a periscope hole and a seal ring. Lies like a coin
    standing on edge in the side view, so draw the face toward the camera."""
    m = Mesh('debris_hatch')
    rot = rotx(pi / 2)       # the lid's axis along -y: the face is turned to the camera
    R = 0.36
    mat = 'paint:debris:plain'
    m.lathe([(0.0, 0.0), (0.0, R), (0.04, R), (0.06, R - 0.03), (0.06, 0.0)], mat, rot, seg=40, smooth=35)
    m.lathe([(0.06, R - 0.05), (0.075, R - 0.05), (0.075, R - 0.12), (0.06, R - 0.12)], 'steel_dark', rot, seg=40, smooth=35, cap=False)
    # rubber seal on the back, periscope opening and the handle
    m.lathe([(0.0, R - 0.02), (-0.015, R - 0.03), (-0.015, R - 0.07), (0.0, R - 0.07)], 'rubber_new', rot, seg=40, smooth=35, cap=False)
    m.lathe([(0.06, 0.0), (0.06, 0.10), (0.085, 0.10), (0.085, 0.0)], 'steel_dark', rot, seg=24, smooth=35, cap=False)
    # handle across the face
    m.cyl((-0.15, -0.09, 0.0), (0.15, -0.09, 0.0), 0.017, 0.017, 'steel', seg=10, smooth=60)
    m.cyl((-0.15, -0.065, 0.0), (-0.15, -0.09, 0.0), 0.017, 0.017, 'steel', seg=10, smooth=60)
    m.cyl((0.15, -0.065, 0.0), (0.15, -0.09, 0.0), 0.017, 0.017, 'steel', seg=10, smooth=60)
    # periscope blocks and hinge ears
    for ang in (0.9, 2.3, 3.7, 5.1):
        x, z = 0.24 * cos(ang), 0.24 * sin(ang)
        m.box(x - 0.05, x + 0.05, -0.085, -0.055, z - 0.035, z + 0.035, 'steel_dark', bevel=0.006)
    for sgn in (-1, 1):
        m.box(sgn * 0.16 - 0.05, sgn * 0.16 + 0.05, -0.055, 0.0, R - 0.04, R + 0.06, 'steel', bevel=0.01)
        m.cyl((sgn * 0.16, -0.06, R + 0.045), (sgn * 0.16, 0.0, R + 0.045), 0.026, 0.026, 'steel_dark', seg=10, smooth=30)
    for i in range(10):
        a = i * 2 * pi / 10
        x, z = (R - 0.045) * cos(a), (R - 0.045) * sin(a)
        bolt(m, x, z, -0.0, 0.014, 0.012, 'steel', dirn=-1)
    return m


def _plate_grid(seed, W, H, cell=0.022, ragged=0.35):
    """Return (xs, zs, keep) for a torn plate outline: a grid whose boundary is eroded by noise."""
    rnd = np.random.RandomState(seed)
    nx, nz = int(W / cell), int(H / cell)
    x = (np.arange(nx + 1) - nx / 2) * cell
    z = (np.arange(nz + 1) - nz / 2) * cell
    X, Z = np.meshgrid(x, z, indexing='ij')
    # base outline: rounded irregular polygon
    ang = np.arctan2(Z / (H / 2), X / (W / 2))
    rad = np.sqrt((X / (W / 2)) ** 2 + (Z / (H / 2)) ** 2)
    k = rnd.uniform(0, 6, 4)
    edge = 1.0 + 0.0 * ang
    for f in range(2, 7):
        edge += rnd.uniform(-1, 1) * ragged / f * np.sin(f * ang + rnd.uniform(0, 6))
    # a squarish plate: use superellipse
    se = (np.abs(X / (W / 2)) ** 6 + np.abs(Z / (H / 2)) ** 6) ** (1 / 6)
    # tear bites
    keep_v = se < edge * 0.98
    for b in range(3):
        a = rnd.uniform(0, 2 * pi)
        cx, cz = cos(a) * W * 0.5, sin(a) * H * 0.5
        rr = rnd.uniform(0.08, 0.2) * min(W, H)
        keep_v &= (np.hypot(X - cx, Z - cz) > rr * (0.8 + 0.4 * rnd.rand()))
    return X, Z, keep_v


def plate(i):
    """A bent, torn armour plate: painted face, charred edge. Frame about 0.6-0.9 m."""
    sizes = [(0.82, 0.55), (0.62, 0.62), (0.9, 0.42)]
    W, H = sizes[i]
    seed = 40 + i * 7
    X, Z, keep = _plate_grid(seed, W, H)
    nx, nz = X.shape
    rnd = np.random.RandomState(seed + 1)
    # bend: a fold line across the plate, a curl at one end and random ripples
    fold = rnd.uniform(-0.15, 0.15) * W
    ang = rnd.uniform(0.5, 1.0) * (1 if i != 1 else -1)
    d = np.maximum(0.0, X - fold)
    Y = np.zeros_like(X)
    Zb = Z.copy()
    Xb = X.copy()
    # rotate the part beyond the fold about a vertical line through the fold (towards the viewer)
    Xb = np.where(X > fold, fold + d * np.cos(ang), X)
    Y = np.where(X > fold, -d * np.sin(ang), 0.0)
    # curl along z
    curl = rnd.uniform(-0.25, 0.25)
    Y += curl * (Z / (H / 2)) ** 2 * 0.3
    # ripples and a dent
    Y += 0.012 * np.sin(Z * 21 + X * 9 + seed) + 0.01 * np.sin(Z * 7 - X * 13)
    cx, cz = rnd.uniform(-0.2, 0.2), rnd.uniform(-0.1, 0.1)
    Y += -0.05 * np.exp(-((X - cx) ** 2 + (Z - cz) ** 2) / 0.015)
    # twist the whole plate a little
    tw = rnd.uniform(-0.25, 0.25)
    Zb = Z + Xb * tw * 0.3
    T = 0.03
    pm = 'paint:debris:plain'
    m = Mesh('plate')
    tb_front = bmesh.new()
    tb_back = bmesh.new()
    tb_edge = bmesh.new()
    vf = {}
    vb = {}

    def getv(tb, store, i_, j_, dy):
        key = (i_, j_)
        if key not in store:
            store[key] = tb.verts.new((Xb[i_, j_], Y[i_, j_] + dy, Zb[i_, j_]))
        return store[key]
    cells = {}
    for ii in range(nx - 1):
        for jj in range(nz - 1):
            if keep[ii, jj] and keep[ii + 1, jj] and keep[ii, jj + 1] and keep[ii + 1, jj + 1]:
                cells[(ii, jj)] = True
    for (ii, jj) in cells:
        a, b, c, d_ = (ii, jj), (ii + 1, jj), (ii + 1, jj + 1), (ii, jj + 1)
        try:
            tb_front.faces.new([getv(tb_front, vf, *q, 0.0) for q in (a, b, c, d_)])
            tb_back.faces.new([getv(tb_back, vb, *q, T) for q in (d_, c, b, a)])
        except ValueError:
            pass
        # boundary walls
        for (p0, p1, nb) in (((ii, jj), (ii + 1, jj), (ii, jj - 1)), ((ii + 1, jj), (ii + 1, jj + 1), (ii + 1, jj)),
                             ((ii + 1, jj + 1), (ii, jj + 1), (ii, jj + 1)), ((ii, jj + 1), (ii, jj), (ii - 1, jj))):
            if nb not in cells:
                try:
                    tb_edge.faces.new([tb_edge.verts.new((Xb[p0[0], p0[1]], Y[p0[0], p0[1]], Zb[p0[0], p0[1]])),
                                       tb_edge.verts.new((Xb[p1[0], p1[1]], Y[p1[0], p1[1]], Zb[p1[0], p1[1]])),
                                       tb_edge.verts.new((Xb[p1[0], p1[1]], Y[p1[0], p1[1]] + T, Zb[p1[0], p1[1]])),
                                       tb_edge.verts.new((Xb[p0[0], p0[1]], Y[p0[0], p0[1]] + T, Zb[p0[0], p0[1]]))])
                except ValueError:
                    pass
    m.commit(tb_front, pm, 50.0)
    m.commit(tb_back, 'charred', 50.0)
    m.commit(tb_edge, 'steel_bright' if i != 1 else 'charred', 0.0)
    # a few surviving bolts and a weld seam on the painted face
    rb = random.Random(seed)
    for k in range(6):
        ii = rb.randrange(2, nx - 3)
        jj = rb.randrange(2, nz - 3)
        if all(c in cells for c in ((ii, jj), (ii - 1, jj), (ii, jj - 1), (ii - 1, jj - 1))):
            bolt(m, Xb[ii, jj], Zb[ii, jj], Y[ii, jj], 0.016, 0.012, 'steel')
    return m


def track_run():
    m = Mesh('debris_track')
    p = 0.19
    link = track_link(p, -0.29, 0.29, 0.085, 'track')
    # five links lying along a gentle curve, one flipped up at the end
    pos = [(-0.40, -0.01), (-0.2, -0.03), (0.0, -0.035), (0.2, -0.025), (0.40, 0.0)]
    ang = [0.03, 0.06, 0.0, -0.08, -0.25]
    # lay the links so that their width (y) is the depth: rotate about x so the plan view shows the side face
    for (x, z), a in zip(pos, ang):
        m.add(link, trans(x, 0.0, z) @ roty(-a) @ rotz(0.0))
    return m


def jerrycan_frame():
    m = Mesh('debris_jerrycan')
    jerrycan(m, 0, 0, 0, 'paint:debris:plain', 0.0, 0.34, 0.46, 0.16, True)
    return m


def toolbox_frame():
    m = Mesh('debris_toolbox')
    toolbox(m, -0.28, 0.28, -0.14, 0.14, -0.12, 0.12, 'olive', 'steel')
    return m


def mg_frame():
    m = Mesh('debris_mg')
    m.add(mg_gun(TD, 1.0), trans(-0.35, 0, -0.1))
    return m
