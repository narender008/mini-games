"""Hollow lane: the small props: candle clusters, the lantern post, baskets, barrel, crate, chest, glowing fungi."""
import math
import random

from mathutils import Vector

import hollow_geo as G
import hollow_items as I
from bl import Mesh, trans, rotx, roty, rotz
from hollow_geo import Lights, blob, candle, rock, torus, wbox, lathe_uv

PI = math.pi
TAU = 2 * PI


# ------------------------------------------------------------------------------------------------ candles

def candles_a():
    """Candles of every height on a rough stone slab, wax run over it."""
    m = Mesh('candles_a')
    L = Lights()
    rock(m, (0, 0, 0), (0.5, 0.36, 0.08), seed=21, flat_bottom=True, jag=0.2, npts=40)
    top = 0.075
    for i, (x, y, h, r) in enumerate(((-0.28, 0.02, 0.46, 0.044), (-0.06, 0.1, 0.2, 0.036), (0.14, -0.04, 0.6, 0.05), (0.32, 0.1, 0.3, 0.04),
                                      (-0.14, -0.13, 0.13, 0.034), (0.02, -0.16, 0.27, 0.038), (0.36, -0.12, 0.17, 0.032))):
        candle(m, x, y, top, h, r, seed=i + 3, drips=4, lights=L.pts)
    blob(m, (0.05, 0.0, top + 0.004), (0.34, 0.2, 0.012), 'hl_wax', seed=2.2, amp=0.03, freq=3.0)
    return m, L


def candles_b():
    """A wrought-iron candelabra: tripod foot, knopped stem, four curling arms, with a ring of candles at its foot."""
    m = Mesh('candles_b')
    L = Lights()
    # foot
    for k in range(3):
        a = TAU * k / 3 + 0.3
        pts, rr, _ = G.sample_path([(0.0, 0.0, 0.2), (math.cos(a) * 0.25, math.sin(a) * 0.25, 0.1), (math.cos(a) * 0.42, math.sin(a) * 0.42, 0.02)],
                                   [0.05, 0.04, 0.032], 0.03)
        m.tube(pts, rr, 'hl_iron', seg=8)
        m.ball((math.cos(a) * 0.43, math.sin(a) * 0.43, 0.04), (0.06, 0.06, 0.04), 'hl_iron', seg=10, rings=6)
    m.lathe([(0.0, 0.06), (0.03, 0.08), (0.2, 0.05), (0.5, 0.038), (0.52, 0.065), (0.56, 0.065), (0.58, 0.038), (0.95, 0.036), (0.97, 0.06), (1.01, 0.06),
             (1.03, 0.036), (1.2, 0.03), (1.22, 0.07), (1.26, 0.07), (1.28, 0.0)], 'hl_iron', None, 12, smooth=60.0)
    # four arms
    for k in range(4):
        a = TAU * k / 4 + 0.4
        d = Vector((math.cos(a), math.sin(a), 0))
        zb = 0.85 + 0.12 * (k % 2)
        pts, rr, _ = G.sample_path([(0, 0, zb), d * 0.2 + Vector((0, 0, zb - 0.08)), d * 0.42 + Vector((0, 0, zb + 0.02)), d * 0.5 + Vector((0, 0, zb + 0.18))],
                                   [0.045, 0.036, 0.03, 0.026], 0.03)
        m.tube(pts, rr, 'hl_iron', seg=8)
        e = pts[-1]
        m.lathe([(0, 0.0), (0.0, 0.05), (0.025, 0.07), (0.04, 0.06), (0.045, 0.0)], 'hl_iron', trans(e.x, e.y, e.z), 12, smooth=60.0)
        candle(m, e.x, e.y, e.z + 0.03, 0.2 + 0.07 * (k % 3), 0.034 + 0.004 * (k % 2), seed=30 + k, drips=3, lights=L.pts, pool=False)
    # top candle
    m.lathe([(1.26, 0.0), (1.26, 0.075), (1.285, 0.07), (1.3, 0.0)], 'hl_iron', None, 12, smooth=60.0)
    candle(m, 0.0, 0.0, 1.29, 0.3, 0.045, seed=40, drips=4, lights=L.pts, pool=False)
    # candles in a ring at the foot
    rng = random.Random(7)
    for k in range(5):
        a = TAU * k / 5 + 1.0
        candle(m, math.cos(a) * 0.55, math.sin(a) * 0.5, 0.0, rng.uniform(0.1, 0.34), rng.uniform(0.03, 0.045), seed=50 + k, drips=3, lights=L.pts)
    return m, L


def candles_c():
    """A cairn of three flat stones and an old book, candles on top and wax down every side."""
    m = Mesh('candles_c')
    L = Lights()
    rock(m, (0, 0, 0), (0.42, 0.34, 0.1), seed=61, jag=0.2, npts=40)
    rock(m, (0.05, 0.02, 0.17), (0.3, 0.26, 0.09), seed=62, jag=0.2, npts=40)
    I.book_flat(m, -0.02, 0.0, 0.34, 0.34, 0.25, 0.07, 'hl_book_brown', random.Random(3), rot=0.25)
    rock(m, (-0.5, -0.15, 0), (0.2, 0.16, 0.08), seed=63, jag=0.2, npts=30)
    z = 0.41
    for i, (x, y, h, r) in enumerate(((-0.1, 0.0, 0.38, 0.045), (0.08, 0.06, 0.22, 0.04), (0.1, -0.06, 0.5, 0.048), (-0.02, 0.08, 0.14, 0.032))):
        candle(m, x, y, z, h, r, seed=70 + i, drips=5, lights=L.pts)
    for i, (x, y, h, r) in enumerate(((-0.52, -0.15, 0.2, 0.035), (-0.45, -0.1, 0.1, 0.03))):
        candle(m, x, y, 0.15, h, r, seed=80 + i, drips=3, lights=L.pts)
    return m, L


# ------------------------------------------------------------------------------------------------ lantern post

def lantern_post():
    m = Mesh('lantern_post')
    L = Lights()
    rng = random.Random(5)
    rock(m, (0, 0, 0), (0.34, 0.3, 0.12), seed=91, jag=0.2, npts=40)
    rock(m, (-0.3, 0.1, 0), (0.15, 0.12, 0.1), seed=92, jag=0.2, npts=24)
    G.wbox(m, -0.08, 0.08, -0.08, 0.08, 0.08, 2.25, 'hl_wood_old', grain='z', tile=0.7, bevel=0.015)
    for z in (0.3, 1.2):
        G.wbox(m, -0.1, 0.1, -0.1, 0.1, z, z + 0.05, 'hl_wood_dark', grain='x', bevel=0.012)
    # carved cap and the arm with its brace
    G.wbox(m, -0.12, 0.12, -0.12, 0.12, 2.25, 2.33, 'hl_wood_dark', grain='x', bevel=0.015)
    m.cyl((0, 0, 2.33), (0, 0, 2.43), 0.05, 0.0, 'hl_wood_dark', seg=8)
    G.wbox(m, 0.05, 0.95, -0.045, 0.045, 2.05, 2.15, 'hl_wood_old', grain='x', tile=0.7, bevel=0.012)
    m.cyl((0.08, 0, 1.65), (0.62, 0, 2.08), 0.035, 0.035, 'hl_wood_old', seg=8)
    m.cyl((0.9, 0, 2.15), (0.9, 0, 2.22), 0.03, 0.025, 'hl_iron', seg=8)
    # chain and lantern
    for k in range(7):
        z = 2.04 - k * 0.05
        torus(m, 0.018, 0.004, 'hl_iron', trans(0.9, 0, z) @ (rotx(PI / 2) if k % 2 else roty(PI / 2) @ rotx(PI / 2)), seg=8, rseg=4)
    I.lantern(m, 0.9, 0, 1.15, s=1.05)
    # moss on the plinth and a little fern of rootlets at the foot
    for _ in range(5):
        blob(m, (rng.uniform(-0.25, 0.25), rng.uniform(-0.2, 0.2), 0.1), (0.1, 0.08, 0.04), 'hl_moss', seed=rng.random() * 9, amp=0.03, freq=4.0)
    L.add((0.9, 0.0, 1.4))
    return m, L


# ------------------------------------------------------------------------------------------------ baskets and crates

def basket_a():
    """A wicker basket heaped with mushrooms, a few of them glowing."""
    m = Mesh('basket_a')
    L = Lights()
    rng = random.Random(8)
    I.basket(m, 0, 0, 0, 0.27, 0.36, 0.3, rng, handle=True)
    caps = ['hl_mush_brown', 'hl_mush_brown', 'hl_mush_pale', 'hl_mush_red', 'hl_mush_pale', 'hl_fungus_teal']
    for k in range(16):
        a = rng.uniform(0, TAU)
        d = rng.uniform(0.0, 0.26)
        x, y = math.cos(a) * d, math.sin(a) * d
        h = 0.11 + 0.1 * (1 - d / 0.3) + rng.uniform(0, 0.04)
        r = rng.uniform(0.05, 0.085)
        I.mushroom(m, x, y, 0.24, h * 1.25, r * 1.15, rng.choice(caps), 'hl_mush_pale', tilt=(rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05)), seed=k, gills=False)
    return m, L


def basket_b():
    """A basket of herbs and lavender, with a bundle of dried sprigs beside it."""
    m = Mesh('basket_b')
    rng = random.Random(9)
    I.basket(m, 0, 0, 0, 0.26, 0.34, 0.26, rng, handle=True)
    for k in range(26):
        a = rng.uniform(0, TAU)
        d = rng.uniform(0.0, 0.26)
        base = Vector((math.cos(a) * d * 0.5, math.sin(a) * d * 0.5, 0.2))
        tip = Vector((math.cos(a) * d * 1.1, math.sin(a) * d * 1.1, 0.2 + rng.uniform(0.18, 0.36)))
        m.cyl(base, tip, 0.004, 0.0025, 'hl_herb', seg=5)
        n = rng.randint(2, 4)
        for j in range(n):
            c = base.lerp(tip, 0.45 + 0.15 * j)
            blob(m, c, (0.025, 0.018, 0.034), 'hl_herb', seed=rng.random() * 9, amp=0.006, freq=18, seg=7, rings=4)
        if k % 3 == 0:
            for j in range(4):
                c = tip + Vector((0, 0, -0.01 * j))
                blob(m, c + Vector((rng.uniform(-0.01, 0.01), rng.uniform(-0.01, 0.01), 0)), (0.012, 0.012, 0.02), 'hl_flower', seed=rng.random() * 9, amp=0.003,
                     freq=20, seg=6, rings=4)
    I.herb_bundle(m, 0.52, -0.1, 0.0, length=0.36, n=9, rng=rng, lie=(0.3, 0.2, 0.0))
    # a few berries on the floor
    for k in range(4):
        m.ball((0.45 + rng.uniform(-0.1, 0.1), 0.2 + rng.uniform(-0.1, 0.1), 0.014), (0.016, 0.016, 0.016), 'hl_berry', seg=8, rings=5)
    return m


def barrel():
    m = Mesh('barrel')
    r0, h = 0.36, 0.95
    prof = []
    N = 12
    for i in range(N + 1):
        t = i / N
        prof.append((t * h, r0 * (0.82 + 0.3 * math.sin(PI * t) ** 0.8)))
    lathe_uv(m, prof, 'hl_wood', su=2, sv=1.0, seg=32, smooth=40.0)
    # head with chime
    G.disc(m, r0 * 0.83, h + 0.001, 'hl_wood', seg=32)
    torus(m, r0 * 0.84, 0.02, 'hl_wood_dark', trans(0, 0, h - 0.01), seg=32, rseg=6)
    for t in (0.08, 0.3, 0.7, 0.92):
        z = t * h
        R = r0 * (0.82 + 0.3 * math.sin(PI * t) ** 0.8)
        torus(m, R + 0.006, 0.022, 'hl_iron', trans(0, 0, z), seg=32, rseg=6)
    m.cyl((0.0, 0.0, h), (0.0, 0.0, h + 0.012), 0.04, 0.04, 'hl_cork', seg=10)
    # a stave-wide stain and a ladle hooked on the rim
    m.cyl((0.28, -0.18, h - 0.02), (0.18, -0.12, h + 0.0), 0.014, 0.014, 'hl_wood_dark', seg=6)
    return m


def crate():
    m = Mesh('crate')
    rng = random.Random(10)
    W, D, H = 0.86, 0.62, 0.56
    t = 0.03
    # corner posts and bottom frame
    for sx in (-1, 1):
        for sy in (-1, 1):
            wbox(m, sx * (W / 2 - 0.03) - 0.03, sx * (W / 2 - 0.03) + 0.03, sy * (D / 2 - 0.03) - 0.03, sy * (D / 2 - 0.03) + 0.03, 0.0, H, 'hl_wood_dark', grain='z',
                 bevel=0.006)
    # slatted sides
    for k in range(3):
        z0 = 0.04 + k * 0.17
        z1 = z0 + 0.15
        wbox(m, -W / 2, W / 2, -D / 2 - 0.0, -D / 2 + t, z0, z1, 'hl_wood', grain='x', tile=1.0, bevel=0.004)
        wbox(m, -W / 2, W / 2, D / 2 - t, D / 2, z0, z1, 'hl_wood', grain='x', tile=1.0, bevel=0.004)
        wbox(m, -W / 2, -W / 2 + t, -D / 2, D / 2, z0, z1, 'hl_wood', grain='y', tile=1.0, bevel=0.004)
        wbox(m, W / 2 - t, W / 2, -D / 2, D / 2, z0, z1, 'hl_wood', grain='y', tile=1.0, bevel=0.004)
    wbox(m, -W / 2, W / 2, -D / 2, D / 2, 0.0, 0.04, 'hl_wood_dark', grain='x', bevel=0.004)
    # straw and bottles inside, a loose lid board across the top
    blob(m, (0, 0, H - 0.06), (W * 0.42, D * 0.4, 0.12), 'hl_straw', seed=3.3, amp=0.04, freq=3.0, seg=16, rings=7)
    for k, (x, y, gl) in enumerate(((-0.22, 0.05, 'hl_glass_amber'), (0.0, -0.05, 'hl_glass_teal'), (0.2, 0.08, 'hl_glass_violet'))):
        I.bottle(m, x, y, H - 0.1, 'tall' if k != 1 else 'round', gl, rng, s=0.9)
    wbox(m, -0.5, 0.2, -0.2, -0.02, H + 0.0, H + 0.03, 'hl_wood', grain='x', bevel=0.004, mx=trans(0.1, 0.0, 0.0) @ rotz(0.35))
    # rope handles
    for sx in (-1, 1):
        torus(m, 0.07, 0.012, 'hl_rope', trans(sx * (W / 2 + 0.008), 0, H - 0.1) @ roty(PI / 2), seg=16, rseg=5, arc=PI)
    return m


def chest():
    m = Mesh('chest')
    W, D, H = 1.1, 0.62, 0.5
    # feet and body
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box(sx * (W / 2 - 0.06) - 0.05, sx * (W / 2 - 0.06) + 0.05, sy * (D / 2 - 0.06) - 0.05, sy * (D / 2 - 0.06) + 0.05, 0.0, 0.08, 'hl_iron', bevel=0.008)
    wbox(m, -W / 2, W / 2, -D / 2, D / 2, 0.07, H, 'hl_wood_old', grain='x', tile=1.0, bevel=0.012)
    # the domed lid: planks laid round an ellipse (grain along X)
    n = 9
    for i in range(n):
        a0, a1 = PI * i / n, PI * (i + 1) / n
        am = (a0 + a1) / 2
        ya, za = (D / 2) * math.cos(a0), 0.22 * math.sin(a0)
        yb, zb = (D / 2) * math.cos(a1), 0.22 * math.sin(a1)
        ym, zm = (D / 2 + 0.0) * math.cos(am), 0.22 * math.sin(am)
        ln = math.hypot(yb - ya, zb - za)
        tang = math.atan2(zb - za, yb - ya)
        mx = trans(0, ym, H + zm) @ rotx(tang)
        wbox(m, -W / 2 - 0.01, W / 2 + 0.01, -ln / 2 - 0.004, ln / 2 + 0.004, -0.02, 0.02, 'hl_wood_old', grain='x', tile=1.0, bevel=0.006, mx=mx)
    for sx in (-1, 1):   # end caps of the lid
        pts = [(sx * (W / 2 + 0.01), 0.0, H)]
        for i in range(n + 1):
            a = PI * i / n
            pts.append((sx * (W / 2 + 0.01), (D / 2) * math.cos(a), H + 0.22 * math.sin(a)))
        m.poly(pts, 'hl_wood_old')
    # iron bands round body and lid
    for x in (-0.38, 0.0, 0.38):
        m.box(x - 0.035, x + 0.035, -D / 2 - 0.012, D / 2 + 0.012, 0.07, H + 0.002, 'hl_iron', bevel=0.006)
        pp = [((D / 2 + 0.016) * math.cos(PI * i / n), (0.22 + 0.016) * math.sin(PI * i / n)) for i in range(n + 1)]
        pp = [(D / 2 + 0.016, 0.0)] + pp[1:-1] + [(-(D / 2 + 0.016), 0.0)]
        m.prism(pp, 0.0, 0.07, 'hl_iron', mx=trans(x + 0.035, 0, H) @ rotz(PI / 2), smooth=40.0, bevel=0.005)
        for z in (0.17, 0.4):
            m.ball((x, -D / 2 - 0.016, z), (0.014, 0.01, 0.014), 'hl_iron', seg=8, rings=5)
    # lock plate and crescent keyhole
    m.box(-0.08, 0.08, -D / 2 - 0.02, -D / 2 + 0.005, 0.3, 0.5, 'hl_brass', bevel=0.008)
    m.ball((0, -D / 2 - 0.022, 0.4), (0.014, 0.006, 0.02), 'hl_wick', seg=8, rings=5)
    return m


# ------------------------------------------------------------------------------------------------ fungi

def mushrooms_a():
    """A cluster of glowing teal toadstools on a mossy mound."""
    m = Mesh('mushrooms_a')
    L = Lights()
    rng = random.Random(14)
    blob(m, (0, 0, 0.02), (0.5, 0.4, 0.1), 'hl_moss', seed=4.4, amp=0.05, freq=3.0, seg=16, rings=7)
    for _ in range(5):
        rock(m, (rng.uniform(-0.4, 0.4), rng.uniform(-0.3, 0.3), 0), (0.08, 0.07, 0.05), seed=rng.random() * 90, seg=10, rings=6, flat_bottom=True)
    I.mushroom_cluster(m, 0, 0, 0.05, rng, 8, 0.2, 0.75, ['hl_fungus_teal'], spread=0.34, rscale=0.42)
    I.mushroom_cluster(m, 0.1, 0.05, 0.05, rng, 6, 0.1, 0.25, ['hl_fungus_teal'], spread=0.45, rscale=0.5)
    L.add((0.0, 0.0, 0.45))
    return m, L


def mushrooms_b():
    """Violet bracket fungi stepping up a rotten log, with small toadstools at its foot."""
    m = Mesh('mushrooms_b')
    L = Lights()
    rng = random.Random(15)
    pts, rr, _ = G.sample_path([(-0.55, 0.0, 0.1), (-0.15, 0.04, 0.17), (0.3, -0.02, 0.2), (0.6, 0.0, 0.1)], [0.14, 0.17, 0.17, 0.13], 0.05)
    m.tube(pts, rr, 'hl_bark_dark', seg=14, smooth=60.0)
    for sx in (-1, 1):
        m.ball((sx * 0.6, 0.0, 0.1), (0.13, 0.13, 0.12), 'hl_bark_dark', seg=12, rings=7)
    for _ in range(4):
        blob(m, (rng.uniform(-0.5, 0.5), rng.uniform(-0.05, 0.05), 0.28), (0.1, 0.07, 0.04), 'hl_moss', seed=rng.random() * 9, amp=0.03, freq=4.0)
    # brackets: shelves jutting from the log's front, smaller as they climb
    for k in range(6):
        x = -0.42 + k * 0.17 + rng.uniform(-0.03, 0.03)
        z = 0.12 + rng.uniform(0.0, 0.14)
        sc = 1.0 - 0.07 * k + rng.uniform(-0.08, 0.08)
        for tier in range(2):
            r = 0.14 * sc * (1 - 0.3 * tier)
            m.ball((x, -0.17 - 0.05 * tier, z + tier * 0.13), (r, r * 0.8, r * 0.2), 'hl_fungus_violet', rot=rotx(-0.35), seg=14, rings=6)
            m.ball((x, -0.17 - 0.05 * tier, z + tier * 0.13 - 0.01), (r * 0.95, r * 0.75, r * 0.12), 'hl_fungus_stem', rot=rotx(-0.35), seg=14, rings=4)
    I.mushroom_cluster(m, 0.35, -0.3, 0.0, rng, 6, 0.12, 0.45, ['hl_fungus_violet'], spread=0.3, rscale=0.45)
    I.mushroom_cluster(m, -0.4, -0.25, 0.0, rng, 4, 0.1, 0.25, ['hl_fungus_violet'], spread=0.2, rscale=0.5)
    L.add((0.0, -0.1, 0.4))
    return m, L
