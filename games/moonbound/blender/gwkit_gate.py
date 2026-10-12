"""Gloamwall kit: the chamber gate (closed and open) and the entry stairs.

The gate is a 5 x 1.4 m section of the north wall, 4.6 m tall: a pointed arch doorway (2.8 m wide, 3.6 m high) in a deeply carved surround
of two stepped rings of voussoirs, a crescent keystone, a stepped cornice and two shallow steps. Coordinates: x east, y north (the face
the camera sees is toward -y), pivot at the middle of the footprint. The wall face plane is at y = -0.1, the wall is 0.8 deep.
"""
import math
import random

from mathutils import Vector

import bl
from bl import Mesh, trans, rotx, roty, rotz, PI
from gwkit_shapes import (rblock, poly_block, masonry, moss, moss_line, crack, rivet, pick, STONES, crescent, star, pointed_arch,
                          crack_top)

W = 5.0
HALF = 1.4                # half width of the doorway
Z_SPRING = 1.17           # where the arch springs
K = 2.0                   # equilateral pointed arch
R_IN = HALF * K
XC = -HALF + R_IN         # x of the centre of the LEFT arc (the right arc is mirrored)
H_DOOR = Z_SPRING + math.sqrt(R_IN ** 2 - XC ** 2)    # apex of the doorway (3.6)
Y_FACE = -0.1             # the wall face
Y_BACK = 0.7
T_A, T_B = 0.22, 0.16     # thickness of the inner and the outer ring of voussoirs
Z_SILL = 0.14
Z_TOP = 4.6


def arc_pt(R, th):
    """Point of the left arc of radius R about the left centre, at angle th (pi = the spring point)."""
    return (XC + R * math.cos(th), Z_SPRING + R * math.sin(th))


def apex_angle(R):
    return math.acos(max(-1.0, min(1.0, -XC / R)))


def x_at(R, z):
    """x (<= 0) of the left arc of radius R at height z >= spring."""
    dz = z - Z_SPRING
    if dz <= 0:
        return XC - R
    if dz >= R * math.sin(apex_angle(R)):
        return 0.0
    return XC - math.sqrt(R * R - dz * dz)


def apex_z(R):
    return Z_SPRING + R * math.sin(apex_angle(R))


def shrink(pts, d):
    cx = sum(p[0] for p in pts) / len(pts)
    cz = sum(p[1] for p in pts) / len(pts)
    out = []
    for x, z in pts:
        dx, dz = x - cx, z - cz
        L = math.hypot(dx, dz)
        k = max(0.0, (L - d)) / max(L, 1e-6)
        out.append((cx + dx * k, cz + dz * k))
    return out


def ring(m, t0, t1, y_front, y_back, n, rng, mats=None, mirror=True):
    """A ring of voussoirs between radii R_IN + t0 and R_IN + t1 on both sides of the arch, above the spring."""
    R0, R1 = R_IN + t0, R_IN + t1
    th0, th1 = apex_angle(R0), apex_angle(R1)
    for sgn in ((-1, 1) if mirror else (-1,)):
        for j in range(n):
            fa, fb = j / n, (j + 1) / n
            ia, ib = PI + (th0 - PI) * fa, PI + (th0 - PI) * fb
            oa, ob = PI + (th1 - PI) * fa, PI + (th1 - PI) * fb
            pts = [arc_pt(R0, ia), arc_pt(R0, ib), arc_pt(R1, ob), arc_pt(R1, oa)]
            if sgn > 0:
                pts = [(-x, z) for x, z in pts][::-1]
            pts = shrink(pts, 0.007)
            yf = y_front - rng.uniform(0.0, 0.015)
            poly_block(m, pts, yf, y_back, rng.choice(mats or STONES) if rng.random() > 0.08 else 'gw_stone_cr', bevel=0.016)


def jambs(m, rng):
    """Quoin-pattern stones on both sides of the doorway from the sill up to the spring."""
    zs = [Z_SILL, 0.5, 0.78, 1.06, Z_SPRING]
    zs = [Z_SILL, 0.46, 0.76, 1.04, Z_SPRING + 0.0]
    y_a, y_b = Y_FACE - T_A - 0.1, Y_FACE - T_B * 0.5 - 0.02
    for sgn in (-1, 1):
        for i in range(len(zs) - 1):
            z0, z1 = zs[i] + 0.008, zs[i + 1] - 0.008
            xa0 = HALF
            if i % 2 == 0:       # one long stone through both rings
                a, b = HALF, HALF + T_A + T_B
                x0, x1 = (-b, -a) if sgn < 0 else (a, b)
                rblock(m, x0 + 0.008, x1 - 0.008, y_a, Y_BACK, z0, z1, pick(rng), seed=rng.random() * 30, bevel=0.018, cuts=3, pillow=0.008,
                       chip=0.006)
            else:                # a short one in ring A, a long header in ring B
                a, b, c = HALF, HALF + T_A, HALF + T_A + T_B
                xa, xb = (-b, -a) if sgn < 0 else (a, b)
                xc0, xc1 = (-c, -b) if sgn < 0 else (b, c)
                rblock(m, xa + 0.008, xb - 0.008, y_a, Y_BACK, z0, z1, pick(rng), seed=rng.random() * 30, bevel=0.018, cuts=3, pillow=0.008,
                       chip=0.006)
                rblock(m, xc0 + 0.008, xc1 - 0.008, y_b, Y_BACK, z0, z1, pick(rng), seed=rng.random() * 30, bevel=0.018, cuts=3, pillow=0.008,
                       chip=0.006)


def wall_face(m, rng, zlo_wall=0.34):
    """The coursed wall face around the doorway rings, cut to the outer arch by chords."""
    R_out = R_IN + T_A + T_B
    ap = apex_z(R_out)
    zs = [zlo_wall, 0.72, 1.08, 1.46, 1.84, 2.2, 2.58, 2.96, 3.34, 3.7, ap + 0.01, 4.2]

    def left_x(z):
        return x_at(R_out, z)

    def spans(zlo, zhi):
        if zlo >= ap - 1e-6:
            return [(-W / 2, -W / 2, W / 2, W / 2)]
        a0, a1 = left_x(zlo), left_x(zhi)
        return [(-W / 2, -W / 2, a0, a1), (-a0, -a1, W / 2, W / 2)]
    masonry(m, -W / 2, W / 2, zlo_wall, 4.2, Y_FACE, Y_BACK - Y_FACE, rng, zs=zs, spans=spans, wmin=0.55, wmax=1.15, bevel=0.022,
            bdepth=(0.4, 0.7), proud=0.012, core=False)
    # a dark core behind (visible in the joints), left and right of the doorway
    m.box(-W / 2, -HALF - T_A - T_B, Y_FACE + 0.04, Y_BACK, 0.0, 4.25, 'gw_core')
    m.box(HALF + T_A + T_B, W / 2, Y_FACE + 0.04, Y_BACK, 0.0, 4.25, 'gw_core')
    # above the doorway: the core between the arch and the cornice (the arch rings cover its lower edge)
    arc = [arc_pt(R_IN, PI + (apex_angle(R_IN) - PI) * i / 12) for i in range(13)]
    notch = arc + [(-x, z) for x, z in arc[::-1]][1:]
    poly = [(-W / 2, Z_SPRING), (-HALF, Z_SPRING)] + notch + [(HALF, Z_SPRING), (W / 2, Z_SPRING), (W / 2, 4.25), (-W / 2, 4.25)]
    m.prism(poly, Y_FACE + 0.04, Y_BACK, 'gw_core', smooth=0.0)


def gate_body(m, rng, seed):
    # --- steps and plinth
    rblock(m, -1.95, 1.95, -0.7, -0.5, 0.0, 0.07, 'gw_slab', seed=seed + 1, bevel=0.02, cuts=3, chip=0.008)
    rblock(m, -1.8, 1.8, -0.52, -0.3, 0.0, 0.14, 'gw_slab', seed=seed + 2, bevel=0.02, cuts=3, chip=0.008)
    # plinth course of the wall on both sides
    for sgn in (-1, 1):
        a, b = (-W / 2, -HALF - T_A - T_B - 0.05) if sgn < 0 else (HALF + T_A + T_B + 0.05, W / 2)
        masonry(m, a, b, 0.0, 0.34, Y_FACE - 0.07, Y_BACK - Y_FACE + 0.07, rng, zs=[0.0, 0.34], wmin=0.5, wmax=1.0, proud=0.0, bevel=0.025,
                bdepth=(0.5, 0.9), mats=['gw_stone_dark', 'gw_stone_a', 'gw_stone_c'], chips=0.2, core=False)
    wall_face(m, rng)
    # --- the two rings of voussoirs and the jamb stones
    ring(m, 0.0, T_A, Y_FACE - T_A - 0.1, Y_BACK, 8, rng)
    ring(m, T_A, T_A + T_B, Y_FACE - T_B * 0.5 - 0.02, Y_BACK, 9, rng)
    jambs(m, rng)
    # gold inlay line around the inner ring
    for sgn in (-1, 1):
        R = R_IN + T_A * 0.5
        th1 = apex_angle(R)
        pts = []
        for i in range(0, 17):
            x, z = arc_pt(R, PI + (th1 - PI) * i / 16)
            pts.append((x * sgn, Y_FACE - T_A - 0.1 - 0.004, z))
        m.tube(pts, 0.008, 'gw_gold', seg=4, cap=False, smooth=0.0)
    # keystone tablet with a crescent
    zk = apex_z(R_IN + T_A + T_B)
    rblock(m, -0.27, 0.27, Y_FACE - T_A - 0.2, Y_BACK, zk - 0.38, zk + 0.16, 'gw_cap', seed=seed + 5, bevel=0.03, bseg=2, cuts=3, chip=0.006,
           pillow=0.01)
    crescent(m, 0.0, zk - 0.11, 0.17, Y_FACE - T_A - 0.2 - 0.02, Y_FACE - T_A - 0.2 + 0.005, 'gw_gold', tilt=0.0 + PI / 2 * 0 + 0.55,
             thick=0.5, off=0.36, bevel=0.004)
    # --- the cornice and a crenellated top (merlons 0.64 wide with 0.36 crenels, as on the walls)
    xs = [-W / 2]
    while xs[-1] < W / 2 - 0.5:
        xs.append(min(W / 2, xs[-1] + rng.uniform(0.9, 1.4)))
    xs[-1] = W / 2
    for i in range(len(xs) - 1):
        g = 0.012
        rblock(m, xs[i] + g, xs[i + 1] - g, Y_FACE - 0.12, Y_BACK + 0.02, 4.2, 4.34, rng.choice(['gw_stone_d', 'gw_cap']), seed=rng.random() * 40,
               bevel=0.024, bseg=2, cuts=3, chip=0.008)
    mx0 = -W / 2 + 0.18
    k = 0
    while mx0 + 0.64 <= W / 2 + 1e-6:
        masonry(m, mx0, mx0 + 0.64, 4.34, 4.53, Y_FACE, 0.3, rng, zs=[4.34, 4.53], wmin=0.3, wmax=0.7, bevel=0.016, bdepth=(0.3, 0.4),
                core_mat='gw_core', cuts=2, pillow=0.008)
        m.box(mx0, mx0 + 0.64, Y_FACE + 0.04, Y_BACK, 4.34, 4.53, 'gw_core')
        rblock(m, mx0 - 0.03, mx0 + 0.67, Y_FACE - 0.03, Y_BACK + 0.03, 4.53, Z_TOP, 'gw_cap', seed=k * 2.9 + 1, bevel=0.022, bseg=2, cuts=3,
               chip=0.008, corner=(rng.choice((-1, 1)), -1, 1, 0.1) if rng.random() < 0.3 else None)
        mx0 += 1.0
        k += 1
    # corbels under the cornice
    for k in range(10):
        cx = -2.25 + 0.5 * k
        if abs(cx) < 0.0:
            continue
        for i, (hw, y_out, z0, z1) in enumerate(((0.11, 0.12, 4.12, 4.2), (0.095, 0.08, 4.04, 4.12))):
            rblock(m, cx - hw, cx + hw, Y_FACE - y_out, Y_FACE + 0.1, z0, z1, 'gw_cap', seed=k * 1.1 + i, bevel=0.01, cuts=1, chip=0.004)
    # moss and cracks
    mr = random.Random(seed + 9)
    moss_line(m, -W / 2 + 0.1, -1.95, Y_FACE - 0.1, 0.34, mr, density=4, r=0.05)
    moss_line(m, 1.95, W / 2 - 0.1, Y_FACE - 0.1, 0.34, mr, density=4, r=0.05)
    moss_line(m, -W / 2 + 0.1, W / 2 - 0.1, Y_FACE - 0.12, 0.0, mr, density=3, r=0.05, mat='gw_moss_dark')
    moss_line(m, -1.9, 1.9, -0.6, 0.07, mr, density=3, r=0.05)
    moss_line(m, -W / 2 + 0.1, W / 2 - 0.1, Y_FACE - 0.12, 4.34, mr, density=3, r=0.05)
    for (x, z) in ((-2.0, 3.0), (2.1, 2.2)):
        crack(m, [(x, z + 0.5), (x + 0.04, z), (x - 0.03, z - 0.5), (x + 0.02, z - 0.9)], Y_FACE - 0.02, 0.008, rng=mr)


# ------------------------------------------------------------------------------------------------ doors

def door_planks(m, sgn, rng, y0, y1, openness=0.0, mat='gw_door', z_top_cap=None):
    """One leaf of the doors (sgn = -1 left, +1 right): vertical planks cut to the arch, in the plane y0..y1."""
    inner_R = R_IN
    n = 7
    wpl = HALF / n
    for i in range(n):
        xa, xb = i * wpl, (i + 1) * wpl     # distance from the centre line (the meeting stile) outward
        # arch height at the plank's two edges (the leaf stays 0.02 inside the doorway)
        def ztop(d):
            d = min(d, HALF - 0.03)
            return Z_SPRING + math.sqrt(max(inner_R ** 2 - (XC - (-d)) ** 2, 0.0)) - 0.03 if d > 0 else H_DOOR - 0.03
        zt_a, zt_b = ztop(xa), ztop(xb)
        if z_top_cap is not None:
            zt_a, zt_b = min(zt_a, z_top_cap), min(zt_b, z_top_cap)
        x0, x1 = (-xb, -xa) if sgn < 0 else (xa, xb)
        pts = [(x0 + 0.006, Z_SILL), (x1 - 0.006, Z_SILL), (x1 - 0.006, zt_b if sgn < 0 else zt_b), (x0 + 0.006, zt_a)]
        if sgn < 0:
            pts = [(x0 + 0.006, Z_SILL), (x1 - 0.006, Z_SILL), (x1 - 0.006, zt_a), (x0 + 0.006, zt_b)]
        else:
            pts = [(x0 + 0.006, Z_SILL), (x1 - 0.006, Z_SILL), (x1 - 0.006, zt_b), (x0 + 0.006, zt_a)]
        poly_block(m, pts, y0 + rng.uniform(-0.01, 0.01), y1, mat, bevel=0.01)


def iron_door_work(m, rng, y0, rune=True):
    """Straps, studs, hinges, ring handles and the sealing rune on the closed doors."""
    yf = y0 - 0.025
    for sgn in (-1, 1):
        for z in (0.45, 1.1, 1.75, 2.4, 2.95):
            # the straps follow the arch: shorter near the top
            reach = HALF - 0.04
            top_h = Z_SPRING + math.sqrt(max(R_IN ** 2 - (XC - reach) ** 2, 0.0))
            if z > 2.7:
                reach = max(0.5, abs(x_at(R_IN, z - 0.1)) - 0.06)
            x0, x1 = (-reach, -0.05) if sgn < 0 else (0.05, reach)
            m.box(x0, x1, yf - 0.012, yf + 0.03, z - 0.06, z + 0.06, 'gw_iron', bevel=0.008)
            # fleur-de-lis style pointed end at the hinge side
            ex = -reach if sgn < 0 else reach
            m.hull([(ex, yf - 0.01, z - 0.09), (ex, yf - 0.01, z + 0.09), (ex + sgn * 0.14, yf - 0.01, z)] +
                   [(ex, yf + 0.03, z - 0.09), (ex, yf + 0.03, z + 0.09), (ex + sgn * 0.14, yf + 0.03, z)], 'gw_iron', bevel=0.006)
            n = int(abs(x1 - x0) / 0.2)
            for i in range(n + 1):
                x = x0 + (x1 - x0) * i / max(n, 1)
                rivet(m, x, yf - 0.012, z, 0.022, 'gw_iron_old' if rng.random() < 0.3 else 'gw_steel')
    # meeting stile
    m.box(-0.045, 0.045, yf - 0.02, yf + 0.03, Z_SILL, H_DOOR - 0.12, 'gw_iron', bevel=0.01)
    # ring handles
    for sgn in (-1, 1):
        cx, cz = sgn * 0.42, 1.3
        pts = [(cx + 0.17 * math.cos(2 * PI * i / 18), yf - 0.06, cz + 0.17 * math.sin(2 * PI * i / 18)) for i in range(19)]
        m.tube(pts, 0.018, 'gw_bronze', seg=6, cap=False)
        m.ball((cx, yf - 0.03, cz + 0.2), (0.05, 0.03, 0.05), 'gw_bronze_hi', seg=8, rings=5)
    if rune:
        cz = 1.85
        R = 0.55
        m.grid_sheet(lambda u, v: (-R + 2 * R * u, yf - 0.03, cz + R - 2 * R * v), 1, 1, 'gw_rune_door', smooth=0.0)
        pts = [(R * 1.03 * math.cos(2 * PI * i / 40), yf - 0.03, cz + R * 1.03 * math.sin(2 * PI * i / 40)) for i in range(41)]
        m.tube(pts, 0.022, 'gw_iron', seg=6, cap=False)
    # hinges on the outer edges
    for sgn in (-1, 1):
        for z in (0.45, 1.75, 2.95):
            m.box(sgn * (HALF - 0.1) - 0.05, sgn * (HALF - 0.1) + 0.05, yf - 0.03, yf + 0.03, z - 0.09, z + 0.09, 'gw_iron_old', bevel=0.008)


def gate_closed(seed=151):
    rng = random.Random(seed)
    m = Mesh('gate_closed')
    gate_body(m, rng, seed)
    y_door = Y_FACE + 0.3
    m.box(-HALF - 0.02, HALF + 0.02, y_door, Y_BACK - 0.1, 0.0, 0.1, 'gw_stone_dark')
    for sgn in (-1, 1):
        door_planks(m, sgn, rng, y_door, y_door + 0.14)
    iron_door_work(m, rng, y_door)
    # a dark passage behind (never seen) and a sill stone
    rblock(m, -HALF - 0.1, HALF + 0.1, Y_FACE - 0.36, Y_FACE + 0.34, 0.0, Z_SILL, 'gw_stone_dark', seed=seed + 3, bevel=0.014, cuts=3, chip=0.006)
    return m


def gate_open(seed=151):
    rng = random.Random(seed)
    m = Mesh('gate_open')
    gate_body(m, rng, seed)
    # the passage: a dark floor, a dark back wall in the shape of the doorway
    m.box(-HALF, HALF, Y_FACE + 0.2, Y_BACK - 0.05, 0.0, Z_SILL - 0.01, 'gw_void')
    pts = [arc_pt(R_IN, PI + (apex_angle(R_IN) - PI) * i / 12) for i in range(13)]
    pts = [(-HALF, 0.0)] + pts + [(-x, z) for x, z in pts[::-1]] + [(HALF, 0.0)]
    m.prism([(x, z) for x, z in pts], Y_BACK - 0.12, Y_BACK - 0.08, 'gw_void', smooth=0.0)
    # the far end of the passage: a back wall of very dark coursed stone, so the opening is a deep space and not a flat black hole
    xm = lambda z: HALF if z <= Z_SPRING else abs(x_at(R_IN, z))
    masonry(m, -HALF, HALF, Z_SILL, 3.55, Y_BACK - 0.3, 0.04, rng, spans=lambda lo, hi: [(-min(xm(lo), xm(hi)), -min(xm(lo), xm(hi)), min(xm(lo), xm(hi)), min(xm(lo), xm(hi)))],
            zs=[Z_SILL, 0.62, 1.1, 1.6, 2.1, 2.6, 3.1, 3.55], wmin=0.45, wmax=0.8, bevel=0.012, mats=['gw_deep'], core=False, proud=0.0, bdepth=(0.04, 0.07),
            cracked=0.0, dark=0.0)
    rblock(m, -HALF - 0.1, HALF + 0.1, Y_FACE - 0.36, Y_FACE + 0.34, 0.0, Z_SILL, 'gw_stone_dark', seed=seed + 3, bevel=0.014, cuts=3, chip=0.006)
    # the doors, swung inward and standing nearly along the reveal on each side (cut low so they do not rise above the wall)
    a = PI * 0.5 - 0.38
    for sgn in (-1, 1):
        hinge = (sgn * (HALF - 0.12), Y_FACE + 0.3)
        sub = Mesh('leaf')
        door_planks_open(sub, rng)
        mx = trans(hinge[0], hinge[1], 0) @ rotz(a)
        if sgn > 0:
            mx = trans(hinge[0], hinge[1], 0) @ rotz(-a) @ bl.scale(-1, 1, 1)
        m.add(sub, mx)
        sub.free()
    return m


def door_planks_open(m, rng):
    """A leaf lying along +x from its hinge (x from 0 to 1.3), 2.6 m tall, planks standing, with straps."""
    n = 7
    wpl = (HALF - 0.1) / n
    for i in range(n):
        x0, x1 = i * wpl, (i + 1) * wpl
        poly_block(m, [(x0 + 0.006, Z_SILL), (x1 - 0.006, Z_SILL), (x1 - 0.006, 2.7), (x0 + 0.006, 2.7)], 0.0, 0.14, 'gw_door', bevel=0.01)
    for z in (0.45, 1.1, 1.75, 2.4):
        m.box(0.02, HALF - 0.12, -0.03, 0.0, z - 0.06, z + 0.06, 'gw_iron', bevel=0.008)


# ------------------------------------------------------------------------------------------------ stairs

def stairs(seed=161):
    """gw_stairs_s: 3 m wide stairs going down to the south into the fog. The top step is at z = 0 along the footprint's north edge
    (y = +1.2); six treads of 0.4 m, 0.25 m apart in height, between two cheek walls with sloped copings and newel posts."""
    rng = random.Random(seed)
    m = Mesh('stairs')
    n = 6
    tread, riser = 0.40, 0.25
    y_top = 1.2
    sw = 2.4                      # width between the cheeks
    for i in range(n):
        yb, yt = y_top - (i + 1) * tread, y_top - i * tread    # the tread spans yb..yt
        zt = -riser * i
        # a step: a slab from the tread top down to the next tread's top level (a stone block per tread, in two or three pieces)
        xs = [-sw / 2]
        while xs[-1] < sw / 2 - 0.5:
            xs.append(min(sw / 2, xs[-1] + rng.uniform(0.7, 1.3)))
        xs[-1] = sw / 2
        for j in range(len(xs) - 1):
            g = 0.012
            rblock(m, xs[j] + g, xs[j + 1] - g, yb + 0.005, yt - 0.0, zt - riser * 1.6, zt, rng.choice(['gw_slab', 'gw_stone_b', 'gw_stone_d']),
                   seed=rng.random() * 30, bevel=0.022, bseg=2, cuts=3, chip=0.008, pillow=0.0,
                   corner=(rng.choice((-1, 1)), -1, 1, 0.1) if rng.random() < 0.12 else None)
    # the cheek walls
    for sgn in (-1, 1):
        x0, x1 = (-sw / 2 - 0.3, -sw / 2) if sgn < 0 else (sw / 2, sw / 2 + 0.3)
        # stepped masonry: one block column per tread, rising 0.55 above the tread
        for i in range(n):
            yb, yt = y_top - (i + 1) * tread, y_top - i * tread
            zt = -riser * i
            rblock(m, x0 + 0.01, x1 - 0.01, yb + 0.006, yt - 0.006, zt - riser * 1.7, zt + 0.5, rng.choice(['gw_stone_a', 'gw_stone_c', 'gw_stone_b']),
                   seed=rng.random() * 30, bevel=0.02, cuts=3, chip=0.008, pillow=0.0)
        # a sloped coping on top
        for i in range(n):
            yb, yt = y_top - (i + 1) * tread, y_top - i * tread
            zt = -riser * i
            rblock(m, x0 - 0.03, x1 + 0.03, yb + 0.004, yt - 0.004, zt + 0.5, zt + 0.6, 'gw_cap', seed=i * 3.3 + sgn, bevel=0.02, bseg=2, cuts=2,
                   chip=0.006)
        # newel posts at the top end and the bottom end
        for (yy, zb, h) in ((y_top - 0.2, 0.0, 1.0), (y_top - n * tread + 0.2, -riser * (n - 1), 0.85)):
            cx = (x0 + x1) / 2
            rblock(m, cx - 0.2, cx + 0.2, yy - 0.2, yy + 0.2, zb - 0.1, zb + h, 'gw_stone_d', seed=yy + sgn, bevel=0.025, bseg=2, cuts=3, chip=0.008)
            rblock(m, cx - 0.25, cx + 0.25, yy - 0.25, yy + 0.25, zb + h, zb + h + 0.1, 'gw_cap', seed=yy * 2 + sgn, bevel=0.025, bseg=2, cuts=2,
                   chip=0.006)
            m.hull([(cx + a * 0.22, yy + b * 0.22, zb + h + 0.1) for a in (-1, 1) for b in (-1, 1)] +
                   [(cx + a * 0.07, yy + b * 0.07, zb + h + 0.25) for a in (-1, 1) for b in (-1, 1)], 'gw_cap', bevel=0.01, smooth=40)
    mr = random.Random(seed + 4)
    for i in range(n):
        yt = y_top - i * tread
        zt = -riser * i
        moss_line(m, -sw / 2 + 0.1, sw / 2 - 0.1, yt - 0.02, zt, mr, density=1.6, r=0.05, jitter_y=0.1, flat=0.5)
    crack_top(m, [(-0.5, 0.7), (-0.35, 0.35), (-0.55, 0.1)], -riser * 0.2 + 0.0, 0.007, rng=mr)
    return m
