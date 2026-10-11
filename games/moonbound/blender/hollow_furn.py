"""Hollow lane: furniture: lectern with the codex, bookshelf, potion shelf, worktable, canopy bed, armchair, rug and hearth."""
import math
import random

from mathutils import Vector

import hollow_geo as G
import hollow_items as I
from bl import Mesh, trans, rotx, roty, rotz
from hollow_geo import Lights, blob, candle, rock, torus, wbox, lathe_uv

PI = math.pi
TAU = 2 * PI


def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------------------------------------ lectern

def open_book(m, mx, w=0.6, d=0.4, cover='hl_book_plum', glow=True):
    """An open grimoire lying flat in the frame mx (origin = the middle of its spine on the surface, z up)."""
    hw, hd = w / 2, d / 2
    m.box(-hw - 0.02, hw + 0.02, -hd - 0.02, hd + 0.02, 0.0, 0.014, cover, mx=mx, bevel=0.004)
    m.box(-hw, hw, -hd, hd, 0.014, 0.034, 'hl_paper', mx=mx, bevel=0.002)

    def top(u, v):
        x = -hw + w * u
        y = -hd + d * v
        ax = abs(x) / hw
        z = 0.034 + 0.026 * smooth(ax * 1.1) ** 0.8 - 0.004 * ax ** 2 + 0.0015 * math.sin(v * 9 + u * 3)
        return (x, y, z)

    m.grid_sheet(top, 28, 6, 'hl_pages', mx=mx, smooth=50.0, thick=0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * (hw + 0.005), sy * (hd + 0.005)
            m.box(cx - 0.03, cx + 0.03, cy - 0.03, cy + 0.03, 0.0, 0.017, 'hl_gold', mx=mx, bevel=0.003)
    # the ribbon marker
    m.tube([Vector((0.0, hd - 0.02, 0.05)), Vector((0.02, hd - 0.1, 0.06)), Vector((0.03, hd + 0.01, 0.045))], [0.007, 0.007, 0.006], 'hl_cloth_rust', seg=5, flat=0.4, mx=mx)


def lectern():
    m = Mesh('lectern')
    L = Lights()
    rng = random.Random(101)
    # octagonal plinth and a knopped column
    m.lathe([(0.0, 0.42), (0.05, 0.42), (0.08, 0.36), (0.15, 0.27), (0.2, 0.2), (0.2, 0.0)], 'hl_wood_dark', None, 8, smooth=20.0)
    lathe_uv(m, [(0.2, 0.2), (0.26, 0.14), (0.35, 0.115), (0.45, 0.13), (0.5, 0.17), (0.55, 0.13), (0.7, 0.1), (0.85, 0.11), (0.95, 0.17), (1.0, 0.2), (1.02, 0.0)],
             'hl_wood', su=2, sv=1.0, seg=14, smooth=45.0)
    # roots winding up the column
    for k in range(3):
        ph = k * TAU / 3 + 0.4
        ctrl = []
        for i in range(8):
            t = i / 7
            a = ph + TAU * 1.25 * t
            r = 0.17 - 0.05 * t + 0.03 * (1 - t) ** 2
            ctrl.append((r * math.cos(a), r * math.sin(a), 0.05 + 0.95 * t))
        G.bark_tube(m, ctrl, [0.07, 0.045, 0.035, 0.03, 0.03, 0.028, 0.025, 0.02], seed=110.0 + k, lump=0.2, ridge=0.006, tile=0.3, seg=10, ends=(False, True),
                    mat='hl_bark_dark')
    # the desk, tilted toward the reader
    th = 0.42
    desk = trans(0, 0, 1.12) @ rotx(th)
    wbox(m, -0.46, 0.46, -0.3, 0.3, -0.03, 0.025, 'hl_wood', grain='x', tile=1.0, bevel=0.01, mx=desk)
    wbox(m, -0.46, 0.46, -0.325, -0.28, 0.0, 0.055, 'hl_wood_dark', grain='x', bevel=0.008, mx=desk)      # the book ledge
    wbox(m, -0.46, 0.46, 0.28, 0.32, 0.0, 0.05, 'hl_wood_dark', grain='x', bevel=0.008, mx=desk)
    wbox(m, -0.28, 0.28, -0.14, 0.14, 0.97, 1.1, 'hl_wood_dark', grain='x', bevel=0.012)
    open_book(m, desk @ trans(0, 0, 0.025), 0.6, 0.4)
    # candle on a little bracket at the upper right
    wbox(m, 0.3, 0.52, 0.08, 0.28, 1.2, 1.235, 'hl_wood_dark', grain='x', bevel=0.008)
    m.cyl((0.4, 0.1, 1.1), (0.46, 0.14, 1.2), 0.012, 0.012, 'hl_iron', seg=6)
    candle(m, 0.42, 0.18, 1.235, 0.26, 0.04, seed=120, drips=5, lights=L.pts)
    L.add((0.0, -0.05, 1.3))
    return m, L


# ------------------------------------------------------------------------------------------------ shelves

def _frame(m, W, D, H, levels, t=0.06, crown=True):
    wbox(m, -W / 2, -W / 2 + t, -D / 2, D / 2, 0.0, H, 'hl_wood_old', grain='z', tile=0.8, bevel=0.01)
    wbox(m, W / 2 - t, W / 2, -D / 2, D / 2, 0.0, H, 'hl_wood_old', grain='z', tile=0.8, bevel=0.01)
    wbox(m, -W / 2 + t, W / 2 - t, D / 2 - 0.03, D / 2, 0.0, H - 0.05, 'hl_wood_dark', grain='z', tile=0.8, bevel=0.004)
    wbox(m, -W / 2 - 0.02, W / 2 + 0.02, -D / 2 - 0.02, D / 2 + 0.01, 0.0, 0.1, 'hl_wood_dark', grain='x', tile=1.0, bevel=0.01)       # plinth
    for z in levels:
        wbox(m, -W / 2 + t, W / 2 - t, -D / 2 + 0.02, D / 2 - 0.03, z, z + 0.035, 'hl_wood', grain='x', tile=1.0, bevel=0.005)
    if crown:
        wbox(m, -W / 2 - 0.05, W / 2 + 0.05, -D / 2 - 0.05, D / 2 + 0.03, H - 0.09, H, 'hl_wood', grain='x', tile=1.0, bevel=0.012)
        wbox(m, -W / 2 - 0.02, W / 2 + 0.02, -D / 2 - 0.02, D / 2 + 0.0, H - 0.14, H - 0.09, 'hl_wood_dark', grain='x', tile=1.0, bevel=0.01)
        for sx in (-1, 1):
            m.ball((sx * (W / 2 - 0.02), -D / 2 + 0.02, H + 0.04), (0.045, 0.045, 0.06), 'hl_wood_dark', seg=10, rings=6)


def bookshelf():
    m = Mesh('bookshelf')
    L = Lights()
    rng = random.Random(102)
    W, D, H = 1.6, 0.5, 2.3
    t = 0.06
    levels = [0.1, 0.55, 1.0, 1.45, 1.9]
    _frame(m, W, D, H, levels, t)
    x0, x1 = -W / 2 + t + 0.02, W / 2 - t - 0.02
    yf = -D / 2 + 0.06
    bd = 0.3
    for r, z in enumerate(levels):
        zt = z + 0.035
        if r == 0:
            I.books_row(m, x0, x1, yf, zt, bd, 0.4, rng, hmin=0.75, wmin=0.04, wmax=0.075)
        elif r == 1:
            e = I.books_row(m, x0, x0 + 0.95, yf, zt, bd, 0.36, rng)
            I.book(m, e + 0.02, yf, zt, 0.045, 0.34, bd, 'hl_book_red', rng, tilt=0.28)
            I.skull(m, x1 - 0.2, yf + 0.14, zt, 1.0, rot=0.3)
            candle(m, x1 - 0.42, yf + 0.14, zt, 0.2, 0.034, seed=130, drips=4, lights=L.pts)
        elif r == 2:
            for k in range(3):
                I.scroll(m, x0 + 0.2 + 0.0, yf + 0.1 + k * 0.0, zt + k * 0.05, 0.4, 0.026, rot=0.0 + k * 0.02)
            for k in range(2):
                I.scroll(m, x0 + 0.2, yf + 0.08, zt + 0.055 + k * 0.0, 0.38, 0.024, rot=0.05)
            I.books_row(m, x0 + 0.5, x0 + 0.95, yf, zt, bd, 0.34, rng)
            I.jar(m, x1 - 0.5, yf + 0.16, zt, 0.07, 0.15, rng)
            I.jar(m, x1 - 0.3, yf + 0.13, zt, 0.06, 0.2, rng, glass='hl_glass_amber', lid='cork')
            I.jar(m, x1 - 0.1, yf + 0.16, zt, 0.065, 0.13, rng)
        elif r == 3:
            I.books_row(m, x0, x0 + 0.55, yf, zt, bd, 0.36, rng)
            for k in range(3):
                I.book_flat(m, 0.1, yf + 0.15, zt + k * 0.06, 0.34 - 0.02 * k, 0.24, 0.06, rng.choice(I.BOOK_MATS), rng, rot=rng.uniform(-0.3, 0.3))
            candle(m, 0.1, yf + 0.15, zt + 0.18, 0.25, 0.038, seed=140, drips=4, lights=L.pts)
            I.books_row(m, 0.45, x1, yf, zt, bd, 0.34, rng)
        else:
            I.books_row(m, x0, x0 + 0.7, yf, zt, bd, 0.3, rng)
            I.herb_bundle(m, x1 - 0.5, yf + 0.0, zt + 0.3, 0.25, 8, rng)
            I.books_row(m, x0 + 0.85, x1, yf, zt, bd, 0.32, rng)
    return m, L


def shelf_potions():
    m = Mesh('shelf_potions')
    L = Lights()
    rng = random.Random(103)
    W, D, H = 1.3, 0.42, 2.0
    t = 0.06
    levels = [0.1, 0.5, 0.9, 1.3]
    _frame(m, W, D, H, levels, t)
    glass = ['hl_glass_teal', 'hl_glass_violet', 'hl_glass_amber', 'hl_glass_green', 'hl_glass_red', 'hl_glass_empty', 'hl_glass_teal', 'hl_glass_violet']
    kinds = ['round', 'tall', 'squat', 'fat', 'tall', 'round']
    x0, x1 = -W / 2 + t + 0.04, W / 2 - t - 0.04
    for r, z in enumerate(levels + [1.7]):
        zt = z + 0.035 if r < 4 else 1.7
        if r == 4:
            # the top compartment: a row of squat jars and herbs hanging
            continue
        # back row (taller), then front row
        for row, (yy, sc) in enumerate(((0.06, 1.1), (-0.1, 0.9))):
            x = x0 + rng.uniform(0.0, 0.05)
            while x < x1 - 0.06:
                k = rng.choice(kinds)
                g = rng.choice(glass)
                sc_ = sc * rng.uniform(0.85, 1.05)
                rr = {'round': 0.07, 'tall': 0.045, 'squat': 0.065, 'fat': 0.085}[k] * sc_
                I.bottle(m, x + rr, yy, zt, k, g, rng, s=sc_)
                x += rr * 2 + rng.uniform(0.0, 0.03)
    # top compartment: dried herbs and a candle on the crown
    for k in range(5):
        I.herb_bundle(m, -0.45 + k * 0.22, -D / 2 + 0.08, 1.88, 0.3 + rng.uniform(-0.05, 0.05), 8, rng)
    candle(m, 0.42, -0.02, 2.0, 0.22, 0.036, seed=150, drips=4, lights=L.pts)
    I.skull(m, -0.35, -0.05, 2.0, 0.9, rot=-0.4)
    return m, L


# ------------------------------------------------------------------------------------------------ table

def table():
    m = Mesh('table')
    L = Lights()
    rng = random.Random(104)
    W, D, H = 1.9, 0.95, 0.9
    wbox(m, -W / 2, W / 2, -D / 2, D / 2, H - 0.075, H, 'hl_wood', grain='x', tile=1.0, bevel=0.012)
    wbox(m, -W / 2 + 0.06, W / 2 - 0.06, -D / 2 + 0.05, D / 2 - 0.05, H - 0.15, H - 0.075, 'hl_wood_dark', grain='x', bevel=0.008)
    for sx in (-1, 1):
        for sy in (-1, 1):
            wbox(m, sx * (W / 2 - 0.1) - 0.045, sx * (W / 2 - 0.1) + 0.045, sy * (D / 2 - 0.1) - 0.045, sy * (D / 2 - 0.1) + 0.045, 0.0, H - 0.075,
                 'hl_wood_old', grain='z', tile=0.7, bevel=0.01)
    for sy in (-1, 1):
        wbox(m, -W / 2 + 0.12, W / 2 - 0.12, sy * (D / 2 - 0.1) - 0.02, sy * (D / 2 - 0.1) + 0.02, 0.2, 0.26, 'hl_wood_dark', grain='x', bevel=0.006)
    for sx in (-1, 1):
        wbox(m, sx * (W / 2 - 0.1) - 0.02, sx * (W / 2 - 0.1) + 0.02, -D / 2 + 0.12, D / 2 - 0.12, 0.2, 0.26, 'hl_wood_dark', grain='y', bevel=0.006)
    zt = H
    # a runner of plum cloth with a gold hem hanging over both long edges
    def runner(u, v):
        y = (v - 0.5) * (D + 0.5)
        x = -0.28 + 0.56 * u + 0.012 * math.sin(v * 17 + u * 2)
        if abs(y) <= D / 2:
            z = zt + 0.006
        else:
            e = abs(y) - D / 2
            y = math.copysign(D / 2 + 0.02 * math.sin(min(e * 6, 1.6)) , y)
            z = zt - e * 1.1 + 0.006
        return (x - 0.5, y, z)
    m.grid_sheet(runner, 6, 28, 'hl_curtain', smooth=50.0, thick=0.006, uv=lambda a, b: (a, 1.0 - abs(b - 0.5) * 2.0))
    # things on the table
    I.mortar(m, -0.7, -0.15, zt)
    open_book(m, trans(0.0, 0.05, zt) @ rotz(0.2), 0.5, 0.34, cover='hl_book_green')
    for k in range(3):
        I.book_flat(m, 0.55, -0.1, zt + k * 0.05, 0.3 - 0.02 * k, 0.22, 0.05, rng.choice(I.BOOK_MATS), rng, rot=rng.uniform(-0.4, 0.4))
    I.jar(m, 0.55, 0.28, zt, 0.07, 0.16, rng)
    I.jar(m, 0.72, 0.2, zt, 0.06, 0.13, rng, glass='hl_glass_amber', lid='cork')
    I.bottle(m, 0.34, 0.3, zt, 'round', 'hl_glass_teal', rng)
    I.bottle(m, 0.22, 0.33, zt, 'tall', 'hl_glass_violet', rng)
    I.herb_bundle(m, -0.75, 0.2, zt + 0.015, 0.34, 9, rng, lie=(0.9, -0.3, 0.0))
    I.herb_bundle(m, -0.5, 0.3, zt + 0.015, 0.3, 8, rng, lie=(0.5, 0.8, 0.0))
    I.scroll(m, -0.15, -0.3, zt, 0.32, 0.022, rot=0.5)
    candle(m, -0.2, 0.3, zt, 0.38, 0.042, seed=160, drips=5, lights=L.pts)
    candle(m, 0.85, -0.25, zt, 0.14, 0.034, seed=161, drips=3, lights=L.pts)
    candle(m, -0.48, -0.32, zt, 0.22, 0.036, seed=162, drips=4, lights=L.pts)
    return m, L


# ------------------------------------------------------------------------------------------------ bed

def _curtain(m, x, y, z_top, z_bot, w, depth_dir, mat='hl_curtain', fold=0.06, cinch=0.5, seed=0.0, along='x'):
    """A hanging curtain gathered into a swag: u across its width, v from the rail down; tied back low."""
    H = z_top - z_bot

    def fn(u, v):
        wv = w * (1 - 0.55 * math.exp(-(((v - 0.55) / 0.1) ** 2))) * (1.0 + 0.25 * max(0.0, v - 0.7))
        cx = (u - 0.5) * wv
        f = fold * math.sin(u * PI * 4.0 + seed + v * 1.3) * (0.4 + 0.6 * v)
        z = z_top - H * v
        if along == 'x':
            return (x + cx, y + depth_dir * (f + 0.08 * v ** 2), z)
        return (x + depth_dir * (f + 0.08 * v ** 2), y + cx, z)

    m.grid_sheet(fn, 20, 14, mat, smooth=60.0, thick=0.008, uv=lambda a, b: (a, 1.0 - b))


def bed():
    m = Mesh('bed')
    L = Lights()
    rng = random.Random(105)
    W, D = 2.1, 1.35
    # platform with a panelled front
    wbox(m, -W / 2, W / 2, -D / 2, D / 2, 0.08, 0.34, 'hl_wood_dark', grain='x', tile=1.0, bevel=0.015)
    wbox(m, -W / 2 - 0.03, W / 2 + 0.03, -D / 2 - 0.03, D / 2 + 0.03, 0.0, 0.1, 'hl_wood', grain='x', tile=1.0, bevel=0.012)
    for k in range(4):
        wbox(m, -W / 2 + 0.1 + k * 0.5, -W / 2 + 0.5 + k * 0.5, -D / 2 - 0.02, -D / 2 + 0.01, 0.14, 0.3, 'hl_wood', grain='x', bevel=0.008)
    # posts, headboard, footboard
    px = W / 2 + 0.02
    py = D / 2 + 0.02
    for sx in (-1, 1):
        for sy in (-1, 1):
            wbox(m, sx * px - 0.05, sx * px + 0.05, sy * py - 0.05, sy * py + 0.05, 0.0, 1.6, 'hl_wood', grain='z', tile=0.6, bevel=0.012)
            m.ball((sx * px, sy * py, 1.66), (0.065, 0.065, 0.08), 'hl_wood_dark', seg=10, rings=6)
    wbox(m, -W / 2 - 0.1, -W / 2 - 0.02, -D / 2, D / 2, 0.2, 1.15, 'hl_wood', grain='y', tile=1.0, bevel=0.015)
    wbox(m, W / 2 + 0.02, W / 2 + 0.1, -D / 2, D / 2, 0.2, 0.6, 'hl_wood', grain='y', tile=1.0, bevel=0.015)
    # a gold crescent on the foot board
    sub = Mesh('cres')
    sub.grid_sheet(lambda u, v: (0.0, (0.12 + (v - 0.5) * 0.06 * math.sin(PI * u) ** 0.7) * math.cos(0.8 + (TAU - 1.6) * u),
                                 (0.12 + (v - 0.5) * 0.06 * math.sin(PI * u) ** 0.7) * math.sin(0.8 + (TAU - 1.6) * u)), 20, 3, 'hl_gold', smooth=50.0, thick=0.008)
    m.add(sub, trans(W / 2 + 0.115, 0, 0.42))
    sub.free()
    # mattress, sheet and a heaped quilt
    wbox(m, -W / 2 + 0.04, W / 2 - 0.04, -D / 2 + 0.04, D / 2 - 0.04, 0.34, 0.5, 'hl_cloth_cream', grain='x', bevel=0.05)

    def quilt(u, v):
        x = -0.35 + 1.38 * u
        y = (v - 0.5) * 1.62
        ay = abs(y)
        heap = 0.12 * math.sin(PI * min(u * 1.1, 1.0)) * (1 - smooth((ay - 0.2) / 0.5)) + 0.03 * math.sin(u * 7 + v * 4)
        z = 0.52 + heap
        if ay > D / 2 - 0.05:
            e = ay - (D / 2 - 0.05)
            z -= e * 1.8
            y = math.copysign((D / 2 - 0.05) + e * 0.6, y)
        z += 0.012 * math.sin(v * 21) * math.sin(u * 5)
        return (x, y, max(z, 0.2))

    m.grid_sheet(quilt, 24, 28, 'hl_quilt', smooth=70.0, thick=0.05, uv=lambda a, b: (a * 0.9, b * 1.1))
    # a folded throw at the foot
    m.box(0.72, 0.98, -D / 2 + 0.02, D / 2 - 0.02, 0.55, 0.62, 'hl_cloth_rust', bevel=0.03)
    # pillows
    for (x, y, rot, mat, sx_, sy_) in ((-0.78, -0.38, 0.1, 'hl_cloth_teal', 0.2, 0.3), (-0.8, 0.0, -0.05, 'hl_cloth_cream', 0.22, 0.32),
                                       (-0.74, 0.4, 0.15, 'hl_cloth_ochre', 0.2, 0.28)):
        sub = Mesh('pillow')
        sub.ball((0, 0, 0), (sx_, sy_, 0.085), mat, seg=18, rings=10)
        for v in sub.bm.verts:
            v.co.z *= 1.0 - 0.28 * (abs(v.co.x) / sx_ * abs(v.co.y) / sy_)
        sub.warp(0.012, 6.0, rng.random() * 9)
        m.add(sub, trans(x, y, 0.56) @ rotz(rot) @ roty(-0.12))
        sub.free()
    # canopy: rails, valance and curtains
    for sy in (-1, 1):
        wbox(m, -px, px, sy * py - 0.03, sy * py + 0.03, 1.52, 1.6, 'hl_wood_dark', grain='x', bevel=0.008)
    for sx in (-1, 1):
        wbox(m, sx * px - 0.03, sx * px + 0.03, -py, py, 1.52, 1.6, 'hl_wood_dark', grain='y', bevel=0.008)

    # the valance across the front
    def val(u, v):
        x = -px + 2 * px * u
        scallop = 0.06 * abs(math.sin(u * PI * 7))
        return (x, -py - 0.02 - 0.02 * v, 1.52 - 0.22 * v + scallop * v * (-1.0))
    m.grid_sheet(val, 28, 4, 'hl_curtain', smooth=50.0, thick=0.008, uv=lambda a, b: (a * 3.0, 0.15 + 0.2 * (1 - b)))
    _curtain(m, -px + 0.2, -py - 0.1, 1.5, 0.04, 0.46, -1.0, seed=0.0)
    _curtain(m, px - 0.2, -py - 0.1, 1.5, 0.04, 0.46, -1.0, seed=2.0)
    # tie-backs
    for sx in (-1, 1):
        torus(m, 0.1, 0.012, 'hl_gold', trans(sx * (px - 0.2), -py - 0.14, 0.88) @ rotx(PI / 2), seg=16, rseg=5)
    L.add((0.0, -0.9, 1.0))
    return m, L


# ------------------------------------------------------------------------------------------------ armchair

def armchair():
    m = Mesh('armchair')
    rng = random.Random(106)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.lathe([(0.0, 0.035), (0.04, 0.055), (0.09, 0.04), (0.14, 0.05)], 'hl_wood_dark', trans(sx * 0.38, sy * 0.36, 0.0), 8, smooth=50.0)
    m.box(-0.45, 0.45, -0.42, 0.42, 0.12, 0.3, 'hl_leather_dark', bevel=0.05)
    m.ball((0, -0.02, 0.4), (0.37, 0.37, 0.13), 'hl_leather', seg=22, rings=11)
    # the back: a squashed dome, tufted
    m.ball((0, 0.36, 0.72), (0.5, 0.15, 0.56), 'hl_leather', seg=24, rings=13, rot=rotx(-0.12))
    m.capsule((-0.36, 0.36, 0.34), (0.36, 0.36, 0.34), 0.17, 0.17, 'hl_leather_dark')
    for ix in range(-2, 3):
        for iz in range(3):
            x = ix * 0.14 + (0.07 if iz % 2 else 0.0)
            z = 0.62 + iz * 0.18
            if abs(x) < 0.32:
                m.ball((x, 0.215, z), (0.015, 0.012, 0.015), 'hl_brass', seg=8, rings=5)
    # rolled arms
    for sx in (-1, 1):
        m.capsule((sx * 0.5, -0.3, 0.52), (sx * 0.5, 0.34, 0.52), 0.12, 0.12, 'hl_leather')
        m.ball((sx * 0.5, -0.32, 0.52), (0.14, 0.14, 0.14), 'hl_leather', seg=14, rings=8)
        m.box(sx * 0.5 - 0.1, sx * 0.5 + 0.1, -0.3, 0.3, 0.3, 0.42, 'hl_leather_dark', bevel=0.03)
    # a throw over the right arm and a cushion
    cu = Mesh('cushion')
    cu.ball((0, 0, 0), (0.18, 0.17, 0.065), 'hl_cloth_teal', seg=14, rings=8)
    cu.warp(0.01, 6.0, 3.0)
    m.add(cu, trans(-0.12, 0.1, 0.55) @ rotz(0.5) @ rotx(-0.5))
    cu.free()
    drape = Mesh('throw')

    def fn(u, v):
        ang = PI * u            # over the arm: from the inside, over the top, to the outside
        r = 0.135
        return (0.5 + (-math.cos(ang)) * r * 1.3 - 0.0, -0.1 + 0.55 * v + 0.012 * math.sin(u * 8 + v * 5), 0.52 + math.sin(ang) * r + 0.0 - 0.28 * smooth(u * 1.7 - 0.7) * (u > 0.5))
    drape.grid_sheet(fn, 14, 8, 'hl_cloth_ochre', smooth=60.0, thick=0.012, uv=lambda a, b: (a, b))
    m.add(drape)
    drape.free()
    return m


# ------------------------------------------------------------------------------------------------ rug

def rug():
    m = Mesh('rug')
    R = 1.3
    lathe_uv(m, [(0.0, R), (0.026, R), (0.03, R * 0.995), (0.03, 0.0)], 'hl_cloth_rust', seg=64, smooth=40.0)
    G.disc(m, R * 0.995, 0.0315, 'hl_rug', seg=64)
    rng = random.Random(107)
    for k in range(96):
        a = TAU * k / 96
        L = 0.1 + rng.uniform(-0.015, 0.02)
        a2 = a + rng.uniform(-0.03, 0.03)
        m.cyl((R * math.cos(a), R * math.sin(a), 0.014), (math.cos(a2) * (R + L), math.sin(a2) * (R + L), 0.004), 0.007, 0.004, 'hl_cloth_cream', seg=4)
    return m


# ------------------------------------------------------------------------------------------------ hearth

def hearth():
    m = Mesh('hearth')
    L = Lights(main=2)
    rng = random.Random(108)
    m.box(-1.0, 1.0, -0.6, 0.38, 0.0, 0.1, 'hl_hearthstone', bevel=0.03)
    for sx in (-1, 1):
        m.box(min(sx * 0.46, sx * 0.88), max(sx * 0.46, sx * 0.88), -0.32, 0.38, 0.1, 1.16, 'hl_hearthstone', bevel=0.03)
    m.box(-0.92, 0.92, -0.34, 0.38, 1.16, 1.4, 'hl_hearthstone', bevel=0.03)
    m.box(-1.02, 1.02, -0.44, 0.38, 1.4, 1.5, 'hl_hearthstone', bevel=0.03)
    m.box(-0.72, 0.72, -0.14, 0.38, 1.5, 2.7, 'hl_hearthstone', bevel=0.03)
    # the firebox: sooty back and sides
    m.box(-0.47, 0.47, 0.3, 0.38, 0.1, 1.16, 'hl_void')
    for sx in (-1, 1):
        m.box(sx * 0.47 - 0.01, sx * 0.47 + 0.01, -0.3, 0.38, 0.1, 1.16, 'hl_void')
    m.box(-0.47, 0.47, -0.3, 0.38, 1.14, 1.16, 'hl_void')
    # logs and the ember bed
    m.box(-0.4, 0.4, -0.2, 0.25, 0.1, 0.19, 'hl_ember', bevel=0.02)
    for (x0, y0, x1, y1, z, r) in ((-0.38, 0.1, 0.36, 0.0, 0.22, 0.07), (-0.34, -0.1, 0.38, 0.12, 0.25, 0.065), (-0.3, 0.02, 0.3, 0.18, 0.31, 0.06)):
        m.cyl((x0, y0, z), (x1, y1, z + 0.02), r, r * 0.9, 'hl_char', seg=10)
        m.ball((x1, y1, z + 0.02), (r * 0.9, r * 0.9, r * 0.9), 'hl_ember', seg=8, rings=5)
        m.ball((x0, y0, z), (r, r, r), 'hl_ember', seg=8, rings=5)
    for k in range(6):
        m.ball((rng.uniform(-0.3, 0.3), rng.uniform(-0.15, 0.15), 0.2 + rng.uniform(0, 0.1)), (0.03, 0.03, 0.02), 'hl_ember', seg=6, rings=4)
    # the mantel: candles, a skull, a couple of old books
    candle(m, -0.75, -0.1, 1.5, 0.22, 0.036, seed=170, drips=4, lights=L.pts)
    candle(m, 0.62, -0.05, 1.5, 0.3, 0.04, seed=171, drips=4, lights=L.pts)
    I.skull(m, 0.3, -0.12, 1.5, 0.85, rot=-0.3)
    I.book_flat(m, -0.4, -0.05, 1.5, 0.3, 0.22, 0.06, 'hl_book_blue', rng, rot=0.2)
    I.book_flat(m, -0.4, -0.05, 1.56, 0.26, 0.19, 0.05, 'hl_book_red', rng, rot=-0.15)
    L.add((0.0, -0.05, 0.38))
    return m, L
