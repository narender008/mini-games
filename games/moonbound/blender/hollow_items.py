"""Hollow lane: small things that furnish the props: books, bottles, jars, skulls, scrolls, herbs, mushrooms, baskets, lanterns.
All builders add to a Mesh `m` at the given position (Blender coords, front = -Y)."""
import math
import random

from mathutils import Vector

import hollow_geo as G
from bl import Mesh, trans, rotx, roty, rotz
from hollow_geo import blob, torus, uvscale, lathe_uv

PI = math.pi
TAU = 2 * PI
BOOK_MATS = ['hl_book_red', 'hl_book_green', 'hl_book_blue', 'hl_book_brown', 'hl_book_plum', 'hl_book_black', 'hl_book_brown', 'hl_book_red']


# ------------------------------------------------------------------------------------------------ books

def book(m, x, y, z, w, h, d, mat, rng, tilt=0.0, bands=True):
    """A book standing on its tail: spine facing -Y at (x .. x+w, y), extending back d, standing on z, leaning by `tilt` (radians,
    about its base) toward +x."""
    mx = trans(x, y, z) @ roty(-tilt)
    t = 0.0045
    m.box(0, w, 0, t, 0, h, mat, mx=mx, bevel=0.0018)                       # spine board
    m.box(0, t, 0, d, 0, h, mat, mx=mx, bevel=0.0015)                        # side boards
    m.box(w - t, w, 0, d, 0, h, mat, mx=mx, bevel=0.0015)
    m.box(t, w - t, t, d + 0.002, 0.004, h - 0.004, 'hl_paper', mx=mx, bevel=0.0012)   # the page block
    if bands:
        for fz in (rng.uniform(0.12, 0.2), rng.uniform(0.78, 0.86)):
            m.box(0, w, -0.0014, t, h * fz, h * fz + 0.007, 'hl_gold', mx=mx, bevel=0.001)
        if rng.random() < 0.7:
            lw = w * 0.72
            m.box((w - lw) / 2, (w + lw) / 2, -0.0012, t, h * 0.42, h * 0.42 + rng.uniform(0.03, 0.06), 'hl_paper' if rng.random() < 0.5 else 'hl_gold',
                  mx=mx, bevel=0.0008)


def books_row(m, x0, x1, y, z, d, hmax, rng, leaning=True, hmin=0.7, wmin=0.03, wmax=0.06):
    """Fill x0..x1 with standing books; returns the x where the row ended (a leaning end book may follow)."""
    x = x0
    while x < x1 - 0.03:
        w = rng.uniform(wmin, wmax)
        if x + w > x1:
            break
        h = hmax * rng.uniform(hmin, 1.0)
        mat = rng.choice(BOOK_MATS)
        book(m, x, y, z, w, h, d * rng.uniform(0.82, 1.0), mat, rng)
        x += w + rng.uniform(0.0, 0.004)
        if rng.random() < 0.05:
            x += rng.uniform(0.04, 0.1)
    return x


def book_flat(m, x, y, z, w, d, t, mat, rng, rot=0.0):
    """A book lying flat (cover up), its centre at (x, y), top at z + t."""
    mx = trans(x, y, z) @ rotz(rot)
    m.box(-w / 2, w / 2, -d / 2, d / 2, 0.0, 0.004, mat, mx=mx, bevel=0.002)
    m.box(-w / 2, w / 2, -d / 2, d / 2, t - 0.004, t, mat, mx=mx, bevel=0.002)
    m.box(-w / 2, -w / 2 + 0.006, -d / 2, d / 2, 0.0, t, mat, mx=mx, bevel=0.002)
    m.box(-w / 2 + 0.006, w / 2 - 0.002, -d / 2 + 0.004, d / 2 - 0.004, 0.004, t - 0.004, 'hl_paper', mx=mx, bevel=0.001)
    m.box(-w / 2 + 0.01, -w / 2 + 0.03, -d / 2 + 0.012, d / 2 - 0.012, t, t + 0.0015, 'hl_gold', mx=mx)
    m.box(-w * 0.18, w * 0.3, -d * 0.2, d * 0.2, t, t + 0.0012, 'hl_gold', mx=mx)


# ------------------------------------------------------------------------------------------------ bottles and jars

def bottle(m, x, y, z, kind, glass, rng, s=1.0, cork=True):
    """A potion bottle. kind: round (flask), tall (vial), squat (jug), fat (bulb). `glass` is the liquid's hl_glass_* material."""
    if kind == 'round':
        prof = [(0.0, 0.026), (0.006, 0.05), (0.03, 0.068), (0.065, 0.07), (0.1, 0.056), (0.125, 0.03), (0.15, 0.021)]
        neck = [(0.15, 0.021), (0.19, 0.02)]
    elif kind == 'tall':
        prof = [(0.0, 0.03), (0.005, 0.04), (0.02, 0.043), (0.14, 0.043), (0.165, 0.03), (0.185, 0.02)]
        neck = [(0.185, 0.02), (0.23, 0.019)]
    elif kind == 'squat':
        prof = [(0.0, 0.04), (0.006, 0.06), (0.03, 0.065), (0.07, 0.06), (0.09, 0.03), (0.1, 0.022)]
        neck = [(0.1, 0.022), (0.125, 0.021)]
    else:  # fat bulb
        prof = [(0.0, 0.03), (0.008, 0.06), (0.04, 0.085), (0.08, 0.08), (0.11, 0.05), (0.13, 0.025), (0.145, 0.02)]
        neck = [(0.145, 0.02), (0.2, 0.019)]
    prof = [(a * s, b * s) for a, b in prof]
    neck = [(a * s, b * s) for a, b in neck]
    m.lathe([(p[0], p[1]) for p in prof], glass, trans(x, y, z), 14, smooth=70.0)
    m.lathe(neck, 'hl_glass_empty', trans(x, y, z), 10, smooth=70.0)
    top = neck[-1][0]
    if cork:
        m.cyl((x, y, z + top - 0.012 * s), (x, y, z + top + 0.016 * s), 0.019 * s, 0.022 * s, 'hl_cork', seg=8)
    return top


def jar(m, x, y, z, r, h, rng, lid='cloth', glass='hl_glass_empty'):
    prof = [(0.0, r * 0.8), (0.006, r), (0.2 * h, r * 1.02), (0.8 * h, r * 1.02), (0.94 * h, r * 0.8), (h, r * 0.75)]
    m.lathe(prof, glass, trans(x, y, z), 14, smooth=70.0)
    if lid == 'cloth':
        m.ball((x, y, z + h + 0.004), (r * 0.95, r * 0.95, r * 0.28), 'hl_cloth_cream', seg=12, rings=6)
        torus(m, r * 0.8, 0.005, 'hl_rope', trans(x, y, z + h - 0.006), seg=14, rseg=5)
    else:
        m.cyl((x, y, z + h - 0.005), (x, y, z + h + 0.018), r * 0.8, r * 0.85, 'hl_cork', seg=10)


def mortar(m, x, y, z, r=0.085):
    prof = [(0.0, r * 0.6), (0.01, r * 0.75), (0.05, r * 1.0), (0.085, r * 1.05), (0.09, r * 0.92), (0.07, r * 0.8), (0.03, r * 0.55), (0.022, 0.0)]
    m.lathe(prof, 'hl_stone_pale', trans(x, y, z), 20, smooth=60.0)
    # pestle leaning in the bowl
    a = Vector((x + r * 0.3, y - r * 0.05, z + 0.04))
    b = Vector((x + r * 1.5, y - r * 0.3, z + 0.24))
    m.cyl(a, b, 0.016, 0.02, 'hl_wood', seg=10)
    m.ball(b, (0.028, 0.028, 0.028), 'hl_wood', seg=10, rings=6)


def skull(m, x, y, z, s=1.0, rot=0.0):
    mx = trans(x, y, z) @ rotz(rot)
    m.ball((0, 0, 0.075 * s), (0.062 * s, 0.07 * s, 0.062 * s), 'hl_bone', mx=mx, seg=14, rings=9)
    m.box(-0.04 * s, 0.04 * s, -0.062 * s, 0.01 * s, 0.02 * s, 0.05 * s, 'hl_bone', mx=mx, bevel=0.008)
    m.ball((0, -0.045 * s, 0.045 * s), (0.036 * s, 0.03 * s, 0.022 * s), 'hl_bone', mx=mx, seg=10, rings=6)
    for sx in (-1, 1):
        m.ball((sx * 0.024 * s, -0.056 * s, 0.083 * s), (0.016 * s, 0.01 * s, 0.017 * s), 'hl_char', mx=mx, seg=8, rings=5)
    for k in range(6):
        m.box((-0.03 + k * 0.012) * s, (-0.02 + k * 0.012) * s, -0.063 * s, -0.056 * s, 0.018 * s, 0.032 * s, 'hl_bone', mx=mx)


def scroll(m, x, y, z, length=0.32, r=0.024, rot=0.0, mat='hl_paper', tie='hl_cloth_rust'):
    mx = trans(x, y, z + r) @ rotz(rot) @ roty(PI / 2)
    m.cyl((0, 0, -length / 2), (0, 0, length / 2), r, r, mat, seg=12, mx=mx)
    for e in (-1, 1):
        m.cyl((0, 0, e * length / 2), (0, 0, e * (length / 2 + 0.012)), r * 0.8, r * 0.8, 'hl_wood_dark', seg=10, mx=mx)
        m.ball((0, 0, e * (length / 2 + 0.014)), (r * 0.9, r * 0.9, 0.01), 'hl_wood_dark', seg=10, rings=5, mx=mx)
    m.cyl((0, 0, -0.02), (0, 0, 0.02), r * 1.12, r * 1.12, tie, seg=12, mx=mx)


def herb_bundle(m, x, y, z, length=0.3, n=8, rng=None, mat='hl_herb_dry', lie=None):
    """A tied bunch of herbs hanging from (x, y, z) (or lying along `lie` direction)."""
    rng = rng or random.Random(1)
    for i in range(n):
        a = TAU * i / n + rng.uniform(-0.3, 0.3)
        sp = rng.uniform(0.01, 0.05)
        top = Vector((x + math.cos(a) * 0.006, y + math.sin(a) * 0.006, z))
        bot = Vector((x + math.cos(a) * sp * 1.6, y + math.sin(a) * sp * 1.6, z - length * rng.uniform(0.85, 1.0)))
        if lie is not None:
            d = Vector(lie).normalized()
            side = Vector((-d.y, d.x, 0))
            top = Vector((x, y, z)) + side * math.cos(a) * 0.01 + Vector((0, 0, math.sin(a) * 0.01))
            bot = top + d * length * rng.uniform(0.85, 1.0) + side * math.cos(a) * 0.03 + Vector((0, 0, math.sin(a) * 0.015))
        m.cyl(top, bot, 0.0035, 0.002, 'hl_wood_old', seg=5)
        for k in range(4):
            t = 0.35 + 0.17 * k
            c = top.lerp(bot, t)
            blob(m, c, (0.014, 0.011, 0.02), mat, seed=rng.random() * 9, amp=0.004, freq=20, seg=7, rings=4)
        blob(m, bot, (0.016, 0.012, 0.022), mat, seed=rng.random() * 9, amp=0.004, freq=20, seg=7, rings=4)
    c = Vector((x, y, z))
    if lie is None:
        m.cyl((x, y, z - 0.012), (x, y, z + 0.012), 0.017, 0.015, 'hl_rope', seg=8)
    else:
        d = Vector(lie).normalized()
        m.cyl(c + d * 0.03 - d * 0.012, c + d * 0.03 + d * 0.012, 0.018, 0.018, 'hl_rope', seg=8)


# ------------------------------------------------------------------------------------------------ fungi

def mushroom(m, x, y, z, h, r, cap, stem='hl_fungus_stem', tilt=(0.0, 0.0), seed=0, gills=True):
    """A toadstool: curved stem and a domed cap, standing on z at (x, y), leaning by tilt (dx, dy at the top)."""
    top = Vector((x + tilt[0], y + tilt[1], z + h))
    mid = Vector((x + tilt[0] * 0.35, y + tilt[1] * 0.35, z + h * 0.5))
    base = Vector((x, y, z))
    pts, rads, _ = G.sample_path([base, mid, top], [r * 0.34, r * 0.24, r * 0.2], 0.03)
    m.tube(pts, rads, stem, seg=8, smooth=70.0)
    hc = r * 0.62
    prof = [(-hc * 0.35, r * 0.1), (-hc * 0.26, r * 0.55), (-hc * 0.08, r * 0.92), (0.0, r)]
    for i in range(1, 8):
        t = i / 7 * (PI / 2)
        prof.append((hc * math.sin(t), r * math.cos(t) * (0.98 + 0.02 * math.sin(i * 3.0 + seed))))
    sub = Mesh('cap')
    sub.lathe(prof, cap, None, 16, smooth=70.0, cap=False)
    sub.warp(r * 0.04, 6.0 / max(r, 0.05), seed)
    tilt_mx = trans(top.x, top.y, top.z - hc * 0.2) @ rotx(-tilt[1] * 1.5) @ roty(tilt[0] * 1.5)
    m.add(sub, tilt_mx)
    sub.free()
    if gills:
        m.ball((top.x, top.y, top.z - hc * 0.3), (r * 0.9, r * 0.9, hc * 0.12), stem, seg=14, rings=4)


def mushroom_cluster(m, cx, cy, z, rng, n, hmin, hmax, cap_mats, spread=0.3, rscale=0.5, stem='hl_fungus_stem'):
    items = []
    for i in range(n):
        a = rng.uniform(0, TAU)
        d = rng.uniform(0.0, spread)
        h = rng.uniform(hmin, hmax)
        items.append((cy + math.sin(a) * d, cx + math.cos(a) * d, h))
    items.sort()
    for yy, xx, h in items:
        r = h * rscale * rng.uniform(0.7, 1.15)
        mushroom(m, xx, yy, z, h, max(r, 0.035), rng.choice(cap_mats), stem, tilt=(rng.uniform(-0.08, 0.08) * h * 2, rng.uniform(-0.06, 0.06) * h * 2),
                 seed=rng.random() * 10)


# ------------------------------------------------------------------------------------------------ baskets

def basket(m, x, y, z, r0, r1, h, rng, handle=True):
    prof = [(0.0, r0 * 0.9), (0.012, r0), (h * 0.5, (r0 + r1) / 2 * 1.0), (h - 0.015, r1), (h, r1 * 1.03), (h - 0.012, r1 * 0.95)]
    lathe_uv(m, prof, 'hl_wicker', su=3, sv=1.2, mx=trans(x, y, z), seg=30, smooth=60.0)
    torus(m, r1 * 0.995, 0.014, 'hl_wicker', trans(x, y, z + h), seg=30, rseg=6)
    if handle:
        torus(m, r1 * 0.98, 0.012, 'hl_wicker', trans(x, y, z + h) @ rotx(PI / 2), seg=24, rseg=6, arc=PI)


# ------------------------------------------------------------------------------------------------ lantern

def lantern(m, x, y, z, s=1.0):
    """A hexagonal iron lantern with amber glass, hanging with its top ring at z + 0.52 s (the chain is the caller's)."""
    mx = trans(x, y, z)
    r = 0.12 * s
    m.lathe([(0.0, r * 0.95), (0.02 * s, r * 1.05), (0.04 * s, r * 0.9), (0.04 * s, 0.0)], 'hl_iron', mx, 6, smooth=20.0)
    m.lathe([(0.04 * s, r * 0.85), (0.38 * s, r * 0.85)], 'hl_lantern_glass', mx, 6, smooth=20.0, cap=False)
    m.lathe([(0.3 * s, r * 0.7), (0.38 * s, r * 0.74)], 'hl_flame_core', mx, 6, smooth=20.0, cap=False)
    m.cyl((x, y, z + 0.06 * s), (x, y, z + 0.36 * s), 0.05 * s, 0.045 * s, 'hl_flame_core', seg=8)
    for k in range(6):
        a = TAU * k / 6
        px, py = r * 0.9 * math.cos(a), r * 0.9 * math.sin(a)
        m.cyl((x + px, y + py, z + 0.02 * s), (x + px, y + py, z + 0.4 * s), 0.01 * s, 0.01 * s, 'hl_iron', seg=6)
    m.lathe([(0.38 * s, r * 1.0), (0.42 * s, r * 1.0), (0.5 * s, r * 0.35), (0.52 * s, 0.0)], 'hl_iron', mx, 6, smooth=20.0)
    torus(m, 0.035 * s, 0.006 * s, 'hl_iron', trans(x, y, z + 0.54 * s) @ rotx(PI / 2), seg=12, rseg=5)
