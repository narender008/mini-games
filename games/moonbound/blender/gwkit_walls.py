"""Gloamwall kit: the ramparts. Battlements (north and side walls), the low south parapets, corner piers and bastions.

Tiling rules. Every wall tile ends at a whole metre boundary with the same profile at both ends: the crenellation has a period of
1 m (merlon 0.64, crenel 0.36), a tile starts and ends in the middle of a crenel, and every course of blocks ends exactly on the
tile boundary (minus half a joint), so two tiles side by side read as one wall with an ordinary vertical joint at the seam.
"""
import math
import random

from mathutils import Vector

import bl
from bl import Mesh, trans, rotx, roty, rotz, PI
import gwkit_mats
from gwkit_shapes import (rblock, poly_block, masonry, moss, moss_line, crack, rivet, drip, pick, STONES, crescent, star,
                          pointed_arch, arch_x_at)

MERLON = 0.64
CRENEL = 0.36
PERIOD = MERLON + CRENEL
T = 0.8                       # wall thickness
H_PARAPET = 1.3
H_MERLON = 2.0


def plaque(m, cx, cz, w, h, y, mat='gw_crescent_carve', rng=None, frame=True):
    """A carved tablet set into a front face at plane y (facing -Y): a stone frame around a UV-mapped carving."""
    rng = rng or random.Random(3)
    if frame:
        f = 0.045
        rblock(m, cx - w / 2 - f, cx + w / 2 + f, y - 0.03, y + 0.05, cz - h / 2 - f, cz + h / 2 + f, 'gw_cap', seed=3.1, bevel=0.012,
               cuts=1, chip=0.004)
    yy = y - 0.032
    m.grid_sheet(lambda u, v: (cx - w / 2 + w * u, yy, cz + h / 2 - h * v), 1, 1, mat, smooth=0.0)


def slit(m, sx, z0, z1, yf, hw=0.07, depth=0.5):
    """An arrow slit in a front face at plane yf: a dark recess in a four-stone frame."""
    m.box(sx - hw, sx + hw, yf + 0.04, yf + depth - 0.1, z0 + 0.06, z1 - 0.1, 'gw_void')
    rblock(m, sx - hw - 0.075, sx - hw, yf - 0.012, yf + depth, z0, z1, 'gw_cap', seed=7.2, bevel=0.012, cuts=1)
    rblock(m, sx + hw, sx + hw + 0.075, yf - 0.012, yf + depth, z0, z1, 'gw_cap', seed=7.9, bevel=0.012, cuts=1)
    rblock(m, sx - hw - 0.075, sx + hw + 0.075, yf - 0.02, yf + depth, z0 - 0.07, z0 + 0.06, 'gw_cap', seed=8.4, bevel=0.014, cuts=1)
    rblock(m, sx - hw - 0.075, sx + hw + 0.075, yf - 0.02, yf + depth, z1 - 0.1, z1, 'gw_cap', seed=8.9, bevel=0.014, cuts=1)


def merlon_top(m, x0, x1, ytop_front, y_back, z0, z1, mat='gw_cap', over=0.035, seed=0, broken=None):
    """The coping of a merlon or pier: a chunky slab overhanging its body a little, chamfered; `broken` = (sx, sz, depth) knocks a corner."""
    corner = None
    if broken:
        corner = (broken[0], -1, broken[1], broken[2])
    rblock(m, x0 - over, x1 + over, ytop_front - over, y_back + over, z0, z1, mat, seed=seed, bevel=0.022, bseg=2, cuts=2, chip=0.007,
           corner=corner)


def battlement_front(m, x0, x1, rng, variant, yf=-T / 2, plaque_at=None, slit_at=None, merlon_z=(1.30, 1.50, 1.70, 1.90),
                     chipped=None, cracked_merlon=None, merlons=True):
    """The south (inner) face of a north-edge battlement of length x1 - x0, centred on x = 0: plinth, coursed parapet, cornice
    and merlons. Returns nothing; everything is added to m."""
    L = x1 - x0
    # --- plinth: the proud base course
    masonry(m, x0, x1, 0.0, 0.30, yf - 0.045, T + 0.045, rng, zs=[0.0, 0.30], wmin=0.5, wmax=1.0, proud=0.0, bevel=0.02,
            bdepth=(0.5, 0.85), mats=['gw_stone_dark', 'gw_stone_a', 'gw_stone_c'], chips=0.2)
    # --- parapet face, with an optional arrow slit
    zs = [0.30, 0.54, 0.80, 1.06, 1.14]
    zs = [0.30, 0.56, 0.82, 1.14]

    def spans(zlo, zhi):
        if slit_at is None:
            return [(x0, x0, x1, x1)]
        sx = slit_at
        hw = 0.07
        if zhi > 0.52 and zlo < 1.0:
            return [(x0, x0, sx - hw - 0.075, sx - hw - 0.075), (sx + hw + 0.075, sx + hw + 0.075, x1, x1)]
        return [(x0, x0, x1, x1)]
    masonry(m, x0, x1, 0.30, 1.14, yf, T, rng, zs=zs, spans=spans, wmin=0.4, wmax=0.85, bevel=0.016, bdepth=(0.35, 0.6))
    if slit_at is not None:
        slit(m, slit_at, 0.52, 1.1, yf)
    # --- corbels under the cornice (every half metre, so they tile: the tile boundary falls between two of them)
    n_c = int(round(L / 0.5))
    for k in range(n_c):
        cx = x0 + 0.25 + 0.5 * k
        for i, (hw, y_out, z0, z1) in enumerate(((0.11, 0.06, 1.09, 1.14), (0.095, 0.04, 1.04, 1.09), (0.08, 0.02, 0.99, 1.04))):
            rblock(m, cx - hw, cx + hw, yf - y_out, yf + 0.1, z0, z1, 'gw_cap', seed=k * 1.7 + i, bevel=0.01, cuts=1, chip=0.004)
    # --- cornice course (the ledge the merlons stand on; its top is the crenel floor)
    masonry(m, x0, x1, 1.14, H_PARAPET, yf - 0.06, T + 0.06, rng, zs=[1.14, H_PARAPET], wmin=0.5, wmax=1.0, proud=0.0, bevel=0.022,
            bdepth=(T + 0.06, T + 0.06), mats=['gw_cap', 'gw_stone_d', 'gw_cap'], chips=0.15, core=False)
    # --- merlons
    mer = []
    if not merlons:
        return mer
    x = x0 + (CRENEL / 2)
    while x + MERLON <= x1 + 1e-6:
        mer.append((x, x + MERLON))
        x += PERIOD
    for i, (a, b) in enumerate(mer):
        broken = None
        if chipped is not None and i == chipped:
            broken = (1, 1, 0.18)
        zl = list(merlon_z)
        masonry(m, a, b, H_PARAPET, zl[-1], yf, T, rng, zs=zl, wmin=0.28, wmax=0.66, bevel=0.016, bdepth=(0.4, 0.7), proud=0.006,
                chips=0.0 if broken else 0.1)
        merlon_top(m, a, b, yf, yf + T, zl[-1], H_MERLON, seed=i * 2.7 + a, broken=broken)
    return mer


def north(length, variant, seed):
    rng = random.Random(seed)
    m = Mesh('wall_n')
    x0, x1 = -length / 2, length / 2
    slit = None
    pl = None
    chipped = None
    if variant == 'b':
        slit = -0.02 if length > 1.5 else None
    if variant == 'c':
        chipped = 1 if length > 1.5 else 0
    battlement_front(m, x0, x1, rng, variant, slit_at=slit, chipped=chipped)
    yf = -T / 2
    if variant == 'a' and length > 1.5:
        plaque(m, 0.0, 0.72, 0.34, 0.34, yf, 'gw_roundel_gold', rng)
    # moss in the joints and along the ledges
    mr = random.Random(seed + 11)
    lim = 0.1
    moss_line(m, x0 + lim, x1 - lim, yf - 0.02, 0.32 + 0.0, mr, density=4.0, r=0.045, jitter_y=0.01)
    moss_line(m, x0 + lim, x1 - lim, yf - 0.06, 0.0, mr, density=3.0, r=0.05, jitter_y=0.01, mat='gw_moss_dark')
    moss_line(m, x0 + lim, x1 - lim, yf - 0.065, 1.30, mr, density=2.5, r=0.04, jitter_y=0.0)
    if variant == 'c':
        crack(m, [(-0.35, 1.1), (-0.30, 0.82), (-0.38, 0.62), (-0.33, 0.35)], yf - 0.005, 0.008, rng=rng)
        crack(m, [(0.5, 1.12), (0.57, 0.9), (0.5, 0.7)], yf - 0.005, 0.007, rng=rng)
    return m


# ------------------------------------------------------------------------------------------------ side walls (north-south)

def side(length, variant, seed):
    """A battlement running north-south (east and west edges). The camera sees only its top and the south faces of the merlons
    (and the south end of the tile): the same tile serves both sides."""
    rng = random.Random(seed)
    m = Mesh('wall_side')
    y0, y1 = -length / 2, length / 2
    xa, xb = -T / 2, T / 2
    # the long core and the top slabs
    m.box(xa, xb, y0, y1, 0.0, 1.14, 'gw_core')
    # the south end of the tile: plinth, parapet face and cornice as the north wall's front (width T)
    tmp = Mesh('end')
    battlement_front(tmp, xa, xb, rng, variant, yf=-T / 2, merlons=False)
    m.add(tmp, trans(0, y0 + T / 2, 0))
    tmp.free()
    # cornice slabs along the whole top (the crenel floors), laid across the width
    ys = [y0]
    while ys[-1] < y1 - 0.45:
        ys.append(min(y1, ys[-1] + rng.uniform(0.55, 0.95)))
    if ys[-1] < y1:
        ys[-1] = y1
    for i in range(len(ys) - 1):
        g = 0.015
        rblock(m, xa - 0.06, xb + 0.06, ys[i] + g + (0.06 if i == 0 else 0), ys[i + 1] - g, 1.14, H_PARAPET, rng.choice(['gw_cap', 'gw_cap', 'gw_stone_d']),
               seed=rng.random() * 40, bevel=0.022, bseg=2, cuts=3, chip=0.008)
    # merlons
    mer = []
    y = y0 + CRENEL / 2
    while y + MERLON <= y1 + 1e-6:
        mer.append((y, y + MERLON))
        y += PERIOD
    for i, (a, b) in enumerate(mer):
        broken = (1, 1, 0.16) if (variant == 'c' and i == 0) else None
        masonry(m, xa, xb, 1.30, 1.90, a, MERLON, rng, zs=[1.30, 1.60, 1.90], wmin=0.3, wmax=0.8, bevel=0.018, bdepth=(0.4, 0.6),
                proud=0.005, chips=0.0 if broken else 0.12, core_mat='gw_core')
        merlon_top_side(m, xa, xb, a, b, 1.90, H_MERLON, seed=i * 3.1 + seed, broken=broken)
    mr = random.Random(seed + 5)
    for (a, b) in mer:
        moss(m, mr.uniform(xa + 0.1, xb - 0.1), a - 0.04, 1.30, 0.06, mr)
    for yy in (y0 + 0.25, 0.0, y1 - 0.25):
        if y0 + 0.2 < yy < y1 - 0.1:
            moss(m, mr.uniform(-0.3, 0.3), yy, H_PARAPET, 0.07, mr, 'gw_moss_dark')
    return m


def merlon_top_side(m, xa, xb, ya, yb, z0, z1, seed=0, broken=None, over=0.035):
    corner = (broken[0], -1, broken[1], broken[2]) if broken else None
    rblock(m, xa - over, xb + over, ya - over, yb + over, z0, z1, 'gw_cap', seed=seed, bevel=0.022, bseg=2, cuts=3, chip=0.007,
           corner=corner, pillow=0.0)


# ------------------------------------------------------------------------------------------------ south walls (low parapets, seen from outside)

H_LOW = 0.70


def south(length, variant, seed):
    """The low parapet on the south edge, seen from outside: two courses on a base, a moulded coping that overhangs front and back."""
    rng = random.Random(seed)
    m = Mesh('wall_s')
    x0, x1 = -length / 2, length / 2
    yf = -T / 2
    zs = [0.0, 0.26, 0.50, 0.58]
    zs = [0.0, 0.25, 0.46]
    panels = variant == 'b'
    masonry(m, x0, x1, 0.0, 0.58, yf, T, rng, zs=[0.0, 0.30, 0.58], wmin=0.4, wmax=0.9, bevel=0.02, bdepth=(0.4, 0.7), proud=0.01,
            mats=STONES + ['gw_stone_dark'])
    # coping: long chamfered slabs overhanging the face
    xs = [x0]
    while xs[-1] < x1 - 0.5:
        xs.append(min(x1, xs[-1] + rng.uniform(0.7, 1.1)))
    xs[-1] = x1
    for i in range(len(xs) - 1):
        g = 0.014
        rblock(m, xs[i] + g, xs[i + 1] - g, yf - 0.06, yf + T + 0.04, 0.58, H_LOW + 0.0, rng.choice(['gw_cap', 'gw_cap', 'gw_stone_d']),
               seed=rng.random() * 40, bevel=0.024, bseg=2, cuts=3, chip=0.008)
    mr = random.Random(seed + 3)
    moss_line(m, x0 + 0.1, x1 - 0.1, yf - 0.03, 0.30, mr, density=3.5, r=0.045, jitter_y=0.0)
    moss_line(m, x0 + 0.1, x1 - 0.1, yf - 0.06, 0.0, mr, density=3.0, r=0.05, jitter_y=0.01, mat='gw_moss_dark')
    moss_line(m, x0 + 0.1, x1 - 0.1, 0.0, H_LOW, mr, density=2.0, r=0.06, jitter_y=0.3, flat=0.45)
    if variant == 'a' and length > 1.5:
        plaque(m, 0.0, 0.29, 0.3, 0.3, yf, 'gw_roundel_gold', rng)
    if panels and length > 1.5:
        # two framed panels with a carved crescent each (the faces of the courses stay coursed behind them)
        for k, px in enumerate((-0.5, 0.5)):
            pw, z0, z1, fw = 0.5, 0.08, 0.52, 0.04
            m.box(px - pw / 2, px + pw / 2, yf - 0.012, yf + 0.02, z0, z1, 'gw_stone_dark')
            for (a, b, c, d) in ((px - pw / 2 - fw, px - pw / 2, z0 - fw, z1 + fw), (px + pw / 2, px + pw / 2 + fw, z0 - fw, z1 + fw),
                                 (px - pw / 2 - fw, px + pw / 2 + fw, z0 - fw, z0), (px - pw / 2 - fw, px + pw / 2 + fw, z1, z1 + fw)):
                rblock(m, a, b, yf - 0.035, yf + 0.03, c, d, 'gw_cap', seed=rng.random() * 40, bevel=0.01, bseg=1, cuts=1, chip=0.003)
            crescent(m, px, 0.30, 0.1, yf - 0.03, yf - 0.006, 'gw_stone_d', tilt=0.4 + 0.5 * k, bevel=0.004)
    return m


# ------------------------------------------------------------------------------------------------ corner pier and bastion

def corner(seed=131):
    """gw_corner: a squat corner pier, 1.2 x 1.2 m, 2.2 m tall: stepped plinth, coursed shaft with a carved niche, a string course,
    a capstone and a little pyramid with a finial."""
    rng = random.Random(seed)
    m = Mesh('corner')
    # plinth
    m.box(-0.6, 0.6, -0.6, 0.6, 0.0, 0.3, 'gw_core')
    masonry(m, -0.6, 0.6, 0.0, 0.30, -0.6, 1.2, rng, zs=[0.0, 0.30], wmin=0.4, wmax=0.8, proud=0.0, bevel=0.022,
            mats=['gw_stone_dark', 'gw_stone_a', 'gw_stone_c'], core=False, bdepth=(0.6, 1.2))
    rblock(m, -0.56, 0.56, -0.56, 0.56, 0.30, 0.42, 'gw_stone_b', seed=1.3, bevel=0.04, bseg=2, cuts=3, chip=0.008)
    # shaft: niche in the middle of the south face
    zs = [0.42, 0.68, 0.96, 1.24, 1.52, 1.82]
    hw = 0.16

    def spans(zlo, zhi):
        if zhi > 0.7 and zlo < 1.45:
            return [(-0.5, -0.5, -hw - 0.07, -hw - 0.07), (hw + 0.07, hw + 0.07, 0.5, 0.5)]
        return [(-0.5, -0.5, 0.5, 0.5)]
    masonry(m, -0.5, 0.5, 0.42, 1.82, -0.5, 1.0, rng, zs=zs, spans=spans, wmin=0.3, wmax=0.6, bevel=0.02, bdepth=(0.4, 0.6))
    # niche: dark recess, frame, a carved crescent inside
    m.box(-hw, hw, -0.5 + 0.05, -0.5 + 0.2, 0.72, 1.40, 'gw_void')
    rblock(m, -hw - 0.07, -hw, -0.515, -0.2, 0.68, 1.45, 'gw_cap', seed=2.1, bevel=0.012, cuts=1)
    rblock(m, hw, hw + 0.07, -0.515, -0.2, 0.68, 1.45, 'gw_cap', seed=2.7, bevel=0.012, cuts=1)
    rblock(m, -hw - 0.07, hw + 0.07, -0.52, -0.2, 0.62, 0.72, 'gw_cap', seed=3.1, bevel=0.014, cuts=1)
    rblock(m, -hw - 0.07, hw + 0.07, -0.52, -0.2, 1.40, 1.50, 'gw_cap', seed=3.7, bevel=0.014, cuts=1)
    crescent(m, 0.0, 1.06, 0.1, -0.5 + 0.12, -0.5 + 0.16, 'gw_stone_d', tilt=PI / 2 * 0.0 + 0.5, bevel=0.004)
    # string course, capstone, pyramid and finial
    rblock(m, -0.58, 0.58, -0.58, 0.58, 1.82, 1.95, 'gw_stone_d', seed=4.2, bevel=0.03, bseg=2, cuts=3, chip=0.008)
    rblock(m, -0.64, 0.64, -0.64, 0.64, 1.95, 2.06, 'gw_cap', seed=4.9, bevel=0.03, bseg=2, cuts=3, chip=0.01, corner=(1, -1, 1, 0.12))
    h = 0.42
    m.hull([(sx * h, sy * h, 2.06) for sx in (-1, 1) for sy in (-1, 1)] + [(sx * 0.14, sy * 0.14, 2.17) for sx in (-1, 1) for sy in (-1, 1)],
           'gw_cap', bevel=0.012, smooth=40)
    m.ball((0, 0, 2.185), (0.065, 0.065, 0.065), 'gw_stone_d', seed=0) if False else m.ball((0, 0, 2.19), (0.06, 0.06, 0.06), 'gw_cap')
    mr = random.Random(seed + 1)
    moss_line(m, -0.5, 0.5, -0.56, 0.42, mr, density=4, r=0.045)
    moss_line(m, -0.55, 0.55, -0.62, 0.0, mr, density=3, r=0.05, mat='gw_moss_dark')
    moss(m, -0.4, -0.55, 2.06, 0.08, mr)
    moss(m, 0.3, -0.5, 2.06, 0.06, mr)
    crack(m, [(0.32, 1.75), (0.36, 1.45), (0.3, 1.2), (0.34, 0.95)], -0.51, 0.007, rng=mr)
    return m


def tower(seed=141):
    """gw_tower: a 2.4 x 2.4 m bastion, 3.6 m tall: sloped plinth, coursed shaft with an arrow slit, a corbel table, an overhanging
    course and a crenellated top with all four parapets."""
    rng = random.Random(seed)
    m = Mesh('tower')
    # plinth and batter
    m.box(-1.2, 1.2, -1.2, 1.2, 0.0, 0.5, 'gw_core')
    masonry(m, -1.2, 1.2, 0.0, 0.5, -1.2, 2.4, rng, zs=[0.0, 0.26, 0.5], wmin=0.5, wmax=1.0, proud=0.0, bevel=0.025,
            mats=['gw_stone_dark', 'gw_stone_a', 'gw_stone_c', 'gw_stone_b'], core=False, bdepth=(0.6, 1.2), chips=0.2)
    m.hull([(sx * 1.2, sy * 1.2, 0.5) for sx in (-1, 1) for sy in (-1, 1)] + [(sx * 1.1, sy * 1.1, 0.78) for sx in (-1, 1) for sy in (-1, 1)],
           'gw_stone_dark', bevel=0.01, smooth=40)
    # batter: a sloped course (hull) from 2.4 wide at z = 0.5 to 2.2 at z = 0.75, in blocks
    for i in range(4):
        a, b = -1.2 + i * 0.6, -1.2 + (i + 1) * 0.6
        g = 0.012
        pts = [(a + g + (0.1 if i == 0 else 0), -1.2, 0.5), (b - g - (0.1 if i == 3 else 0), -1.2, 0.5),
               (b - g - (0.1 if i == 3 else 0), -1.1, 0.78), (a + g + (0.1 if i == 0 else 0), -1.1, 0.78)]
        pts += [(x, y + 1.2 * 0 + 0.4, z) for x, y, z in pts]
        m.hull(pts, rng.choice(STONES), bevel=0.016, smooth=40)
    # shaft
    zs = [0.78, 1.04, 1.32, 1.60, 1.88, 2.16, 2.44, 2.62]

    def spans(zlo, zhi):
        if zhi > 1.4 and zlo < 2.3:
            return [(-1.1, -1.1, -0.15, -0.15), (0.15, 0.15, 1.1, 1.1)]
        return [(-1.1, -1.1, 1.1, 1.1)]
    m.box(-1.1, 1.1, -1.1, 1.1, 0.78, 2.62, 'gw_core')
    masonry(m, -1.1, 1.1, 0.78, 2.62, -1.1, 2.2, rng, zs=zs, spans=spans, wmin=0.4, wmax=0.85, bevel=0.02, bdepth=(0.4, 0.7), core=False)
    slit(m, 0.0, 1.5, 2.34, -1.1, hw=0.07, depth=0.5)
    # corbel table and the overhanging course
    for k in range(9):
        cx = -1.0 + 0.25 * k
        for i, (hw, y_out, z0, z1) in enumerate(((0.12, 0.10, 2.62, 2.70), (0.1, 0.06, 2.70, 2.78), (0.08, 0.02, 2.78, 2.86))):
            pass
        for i, (hw, y_out, z0, z1) in enumerate(((0.11, 0.10, 2.78, 2.86), (0.095, 0.07, 2.70, 2.78), (0.08, 0.04, 2.62, 2.70))):
            rblock(m, cx - hw, cx + hw, -1.1 - y_out, -1.0, z0, z1, 'gw_cap', seed=k * 1.3 + i, bevel=0.01, cuts=1, chip=0.004)
    over = 1.3
    rblock(m, -over, over, -over, over, 2.86, 3.06, 'gw_stone_d', seed=9.1, bevel=0.03, bseg=2, cuts=3, chip=0.008)
    # parapet band and merlons (pattern 0.6 / 0.3 so three merlons span a side)
    zb0, zb1, zm1, zt = 3.06, 3.28, 3.52, 3.62
    ring = [(-1.3, 1.3, -1.3, -0.82), (-1.3, 1.3, 0.82, 1.3), (-1.3, -0.82, -0.82, 0.82), (0.82, 1.3, -0.82, 0.82)]
    # floor
    rblock(m, -0.84, 0.84, -0.84, 0.84, 3.0, 3.1, 'gw_slab', seed=1.9, bevel=0.01, cuts=3)
    for (x0, x1, y0, y1) in ring:
        rblock(m, x0, x1, y0, y1, zb0, zb1, 'gw_stone_d', seed=x0 + y0, bevel=0.025, bseg=2, cuts=3, chip=0.006)
    mer = [(-1.3, -0.7, -1.3, -0.82), (-0.3, 0.3, -1.3, -0.82), (0.7, 1.3, -1.3, -0.82),
           (-1.3, -0.7, 0.82, 1.3), (-0.3, 0.3, 0.82, 1.3), (0.7, 1.3, 0.82, 1.3),
           (-1.3, -0.82, -0.3, 0.3), (0.82, 1.3, -0.3, 0.3)]
    for i, (x0, x1, y0, y1) in enumerate(mer):
        # coursed south face of each merlon (the camera sees it above the crenel floor), then a cap
        masonry(m, x0 + 0.02, x1 - 0.02, zb1, zm1, y0, y1 - y0, rng, zs=[zb1, zm1], wmin=0.25, wmax=0.65, bevel=0.016, bdepth=(0.3, 0.45),
                core_mat='gw_core', cuts=2, pillow=0.008)
        rblock(m, x0 - 0.03, x1 + 0.03, y0 - 0.03, y1 + 0.03, zm1, zt, 'gw_cap', seed=i * 2.3, bevel=0.02, bseg=2, cuts=2, chip=0.006,
               corner=(1, -1, 1, 0.1) if i == 4 else None)
    mr = random.Random(seed + 2)
    moss_line(m, -1.1, 1.1, -1.24, 0.5, mr, density=3.5, r=0.05)
    moss_line(m, -1.2, 1.2, -1.28, 0.0, mr, density=3, r=0.06, mat='gw_moss_dark')
    moss_line(m, -1.0, 1.0, -1.26, 0.78, mr, density=3, r=0.05)
    for (x, y) in ((-0.7, -1.0), (0.6, 0.95), (-0.5, 0.9)):
        moss(m, x, y, 3.1, 0.12, mr)
    crack(m, [(-0.8, 2.5), (-0.74, 2.0), (-0.82, 1.5), (-0.76, 1.0)], -1.11, 0.009, rng=mr)
    crack(m, [(0.7, 2.4), (0.78, 1.9), (0.7, 1.3)], -1.11, 0.008, rng=mr)
    return m


# ------------------------------------------------------------------------------------------------ the broken south wall

def south_gap(seed=125):
    """gw_wall_s_gap (2 m): both ends stand as stumps with broken tops, the middle is gone down to rubble and the base course, and
    blocks lie scattered in front."""
    rng = random.Random(seed)
    m = Mesh('wall_s_gap')
    yf = -T / 2
    x0, x1 = -1.0, 1.0
    # base course through the whole tile (partly broken in the middle)
    masonry(m, x0, x1, 0.0, 0.30, yf, T, rng, zs=[0.0, 0.30], wmin=0.4, wmax=0.8, bevel=0.02, bdepth=(0.4, 0.7), proud=0.01, core=False)
    # stumps at both ends, up to the coping, ragged on their inner side
    for sgn in (-1, 1):
        a, b = (x0, x0 + 0.42) if sgn < 0 else (x1 - 0.42, x1)
        masonry(m, a, b, 0.30, 0.58, yf, T, rng, zs=[0.30, 0.58], wmin=0.2, wmax=0.45, bevel=0.02, bdepth=(0.4, 0.7), proud=0.01, core=False)
        m.box(a, b, yf + 0.04, yf + T, 0.0, 0.58, 'gw_core')
        # coping with the inner corner broken off
        top = rblock(m, a + (0.0 if sgn < 0 else 0.0), b, yf - 0.06, yf + T + 0.04, 0.58, H_LOW, 'gw_cap', seed=seed + sgn, bevel=0.024, bseg=2,
                     cuts=3, chip=0.008, corner=(-sgn, -1, 1, 0.2))
    # the middle: a ragged second course that stops part way, tilted fallen blocks, rubble
    for (a, b, h) in ((-0.55, -0.15, 0.50), (0.2, 0.52, 0.42)):
        rblock(m, a, b, yf + 0.02, yf + 0.5, 0.30, h, rng.choice(STONES), seed=a * 9, bevel=0.02, cuts=2, chip=0.014,
               corner=(rng.choice((-1, 1)), -1, 1, 0.12))
    for i, (cx, cy, r, tilt) in enumerate(((-0.25, -0.68, 0.34, 0.2), (0.35, -0.8, 0.28, -0.35), (0.0, -0.5, 0.2, 0.6))):
        w, d, hh = 0.5 * r / 0.3 * rng.uniform(0.8, 1.1), 0.36, 0.2
        mx = trans(cx, cy, 0.0) @ rotz(tilt) @ roty(rng.uniform(-0.18, 0.18))
        rblock(m, -w / 2, w / 2, -d / 2, d / 2, 0.0, hh, rng.choice(STONES), seed=i * 4.4, bevel=0.022, cuts=2, chip=0.014, mx=mx,
               corner=(1, -1, 1, 0.08))
    for i in range(14):
        cx, cy = rng.uniform(-0.8, 0.8), rng.uniform(-0.75, 0.05)
        r = rng.uniform(0.03, 0.09)
        pts = [(cx + rng.uniform(-r, r), cy + rng.uniform(-r, r), rng.uniform(0.0, r * 1.4)) for _ in range(8)] + \
              [(cx + sx * r, cy + sy * r, 0.0) for sx in (-1, 1) for sy in (-1, 1)]
        m.hull(pts, rng.choice(STONES), bevel=0.01, smooth=30)
    mr = random.Random(seed + 4)
    moss_line(m, x0 + 0.1, x1 - 0.1, yf - 0.03, 0.30, mr, density=3, r=0.045)
    moss_line(m, x0 + 0.1, x1 - 0.1, yf - 0.05, 0.0, mr, density=3, r=0.05, mat='gw_moss_dark')
    return m
