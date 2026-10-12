"""Gloamwall kit: things lying on the floor: rubble piles, old remains, funerary urns (whole and broken).

Everything stays on or above z = 0 (the floor is drawn by the game's shader; a sprite must never reach below its ground).
"""
import math
import random

from mathutils import Vector

import bl
from bl import Mesh, trans, rotx, roty, rotz, scale, PI
from gwkit_shapes import (rblock, poly_block, moss, moss_line, crack, pick, STONES, crescent, revolve, folds, smoothstep)
from gwkit_decor import circle_pts, prof


def min_z(part):
    return min((v.co.z for v in part.bm.verts), default=0.0)


def settle(m, part, x, y, rot=None, lift=0.0):
    """Rotate `part` by `rot` (a 4x4 about its own origin), drop it so its lowest point is at `lift`, and add it to m at (x, y)."""
    if rot is not None:
        part.transform(rot)
    z = min_z(part)
    part.transform(trans(0, 0, lift - z))
    m.add(part, trans(x, y, 0))
    part.free()


def rock_pts(rng, rx, ry, rz, n=12):
    pts = []
    for _ in range(n):
        v = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1)))
        v.normalize()
        k = rng.uniform(0.7, 1.0)
        pts.append((v.x * rx * k, v.y * ry * k, v.z * rz * k))
    return pts


def chunk(rng, size, mat=None, flat=0.6):
    """An angular lump of fallen stone (hull of random points), about `size` metres across."""
    p = Mesh('chunk')
    p.hull(rock_pts(rng, size * rng.uniform(0.7, 1.0), size * rng.uniform(0.6, 0.9), size * flat * rng.uniform(0.6, 1.0), 11), mat or rng.choice(STONES),
           bevel=size * 0.05, smooth=30)
    return p


def block_piece(rng, w, d, h, mat=None, seed=0):
    p = Mesh('blk')
    rblock(p, -w / 2, w / 2, -d / 2, d / 2, 0.0, h, mat or rng.choice(STONES), seed=seed, bevel=0.02, cuts=2, chip=0.012,
           corner=(rng.choice((-1, 1)), rng.choice((-1, 1)), 1, rng.uniform(0.05, 0.12)))
    return p


def voussoir(rng, size):
    """A wedge from a fallen arch."""
    p = Mesh('vous')
    w0, w1, d, h = size * 0.5, size * 0.72, size * 0.55, size * 0.85
    p.hull([(-w0 / 2, -d / 2, 0), (w0 / 2, -d / 2, 0), (-w1 / 2, -d / 2, h), (w1 / 2, -d / 2, h),
            (-w0 / 2, d / 2, 0), (w0 / 2, d / 2, 0), (-w1 / 2, d / 2, h), (w1 / 2, d / 2, h)], rng.choice(STONES), bevel=0.015, smooth=30)
    return p


def dust(m, cx, cy, rx, ry, z, rng, n=None):
    """Crushed stone and ash scattered in a rough ellipse: many small flat blobs with ragged edges instead of one hard-edged plate."""
    n = n or int(8 + 22 * rx * ry)
    for i in range(n):
        a = rng.uniform(0, 2 * PI)
        d = math.sqrt(rng.random())
        r = rng.uniform(0.035, 0.09) * (1.0 - 0.45 * d)
        m.ball((cx + math.cos(a) * rx * d, cy + math.sin(a) * ry * d, z), (r * rng.uniform(0.8, 1.4), r * rng.uniform(0.8, 1.2), 0.012 + 0.01 * rng.random()),
               'gw_dust', seg=7, rings=3)


def rubble(seed, R, H, n_blocks, n_chunks, n_gravel, drum=False, vous=0):
    """A pile of fallen masonry about R metres across and up to H high."""
    rng = random.Random(seed)
    m = Mesh('rubble')
    # dust and crushed stone under the pile
    dust(m, 0.0, 0.0, R * 0.62, R * 0.5, 0.0, rng)

    def spot(rr=1.0):
        a = rng.uniform(0, 2 * PI)
        d = math.sqrt(rng.random()) * R * 0.5 * rr
        return d * math.cos(a), d * math.sin(a) * 0.85, d / (R * 0.5)

    placed = []
    # big pieces first, towards the middle
    for i in range(n_blocks):
        x, y, f = spot(0.7)
        w, d, h = rng.uniform(0.28, 0.5) * R / 0.9, rng.uniform(0.22, 0.35) * R / 0.9, rng.uniform(0.14, 0.22) * R / 0.9
        p = block_piece(rng, min(w, 0.6), min(d, 0.4), min(h, 0.26), seed=seed + i)
        rot = rotz(rng.uniform(0, 2 * PI)) @ rotx(rng.uniform(-0.45, 0.45)) @ roty(rng.uniform(-0.45, 0.45))
        settle(m, p, x, y, rot, lift=max(0.0, (1 - f) * H * 0.35 * rng.uniform(0.3, 1.0)))
    for i in range(vous):
        x, y, f = spot(0.8)
        p = voussoir(rng, rng.uniform(0.3, 0.42))
        rot = rotz(rng.uniform(0, 2 * PI)) @ rotx(rng.uniform(-0.8, 0.8)) @ roty(rng.uniform(-0.8, 0.8))
        settle(m, p, x, y, rot, lift=max(0.0, (1 - f) * H * 0.3))
    if drum:
        p = Mesh('drum')
        p.lathe([(0.0, 0.2), (0.02, 0.22), (0.38, 0.22), (0.4, 0.2)], 'gw_stone_b', seg=18, smooth=50.0, cap=True)
        for k in range(8):
            a = 2 * PI * k / 8
            p.cyl((0.22 * math.cos(a), 0.22 * math.sin(a), 0.0), (0.22 * math.cos(a), 0.22 * math.sin(a), 0.4), 0.04, 0.04, 'gw_stone_b', seg=6, smooth=60.0)
        p.warp(0.008, 5.0, seed)
        settle(m, p, R * 0.12, R * 0.05, rotz(0.4) @ roty(PI / 2 - 0.15) @ rotx(0.1), lift=0.04)
    for i in range(n_chunks):
        x, y, f = spot(1.0)
        s = rng.uniform(0.1, 0.26) * (R / 0.9) ** 0.7
        p = chunk(rng, s)
        rot = rotz(rng.uniform(0, 2 * PI)) @ rotx(rng.uniform(-0.5, 0.5)) @ roty(rng.uniform(-0.5, 0.5))
        settle(m, p, x, y, rot, lift=max(0.0, (1 - f) * H * 0.3 * rng.uniform(0.2, 1.0)))
    for i in range(n_gravel):
        a = rng.uniform(0, 2 * PI)
        d = math.sqrt(rng.random()) * R * 0.62
        p = chunk(rng, rng.uniform(0.03, 0.08), flat=0.7)
        settle(m, p, d * math.cos(a), d * math.sin(a) * 0.85, rotz(rng.uniform(0, 2 * PI)) @ rotx(rng.uniform(-0.6, 0.6)), lift=0.0)
    mr = random.Random(seed + 9)
    for i in range(max(1, int(R * 2))):
        a = mr.uniform(0, 2 * PI)
        d = mr.uniform(0.0, R * 0.35)
        moss(m, d * math.cos(a), d * math.sin(a) * 0.8, H * mr.uniform(0.25, 0.7), 0.06 * (R / 0.9) ** 0.5, mr, mr.choice(['gw_moss', 'gw_moss_dark']), n=2)
    return m


def rubble_a(seed=301):
    return rubble(seed, 0.55, 0.14, 1, 3, 8)


def rubble_b(seed=311):
    return rubble(seed, 0.85, 0.22, 2, 5, 12)


def rubble_c(seed=321):
    return rubble(seed, 1.2, 0.3, 2, 7, 16, vous=1)


def rubble_d(seed=331):
    return rubble(seed, 1.6, 0.42, 3, 10, 22, drum=True, vous=2)


# ------------------------------------------------------------------------------------------------ bones

def long_bone(m, a, b, r=0.016, mat='gw_bone', knob=1.7, rng=None):
    """A long bone between points a and b: a shaft with two knobbed ends."""
    rng = rng or random.Random(1)
    m.cyl(a, b, r * 0.8, r * 0.8, mat, seg=7, smooth=60.0, cap=True)
    for p, o in ((a, b), (b, a)):
        d = (Vector(p) - Vector(o)).normalized()
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        side.normalize()
        for sgn in (-1, 1):
            c = Vector(p) + side * sgn * r * 0.8 + d * r * 0.4
            m.ball((c.x, c.y, c.z), (r * knob * 0.62,) * 3, mat, seg=7, rings=5)


def rib(m, c, rad, a0, a1, tilt, mat='gw_bone', r=0.011, n=10):
    """One rib: an arc of radius rad about c in a plane tilted about the x axis."""
    pts = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / (n - 1)
        x, z = rad * math.cos(a), rad * math.sin(a) * 0.8
        y = z * math.sin(tilt)
        zz = z * math.cos(tilt)
        pts.append((c[0] + x * 0.45, c[1] + x * 0.0 + y + 0.0, c[2] + abs(zz) * 0.5 + 0.03))
    m.tube(pts, [r * (1.0 - 0.4 * i / (n - 1)) for i in range(n)], mat, seg=5, cap=True)


def skull(seed=0, s=1.0, jaw=True):
    """A small skull (about 0.2 m), facing -Y, resting on its base."""
    p = Mesh('skull')
    bone, dark = 'gw_bone', 'gw_void'
    p.ball((0, 0.01, 0.12), (0.082, 0.098, 0.088), bone, seg=14, rings=9)                 # cranium
    p.ball((0, -0.045, 0.075), (0.062, 0.05, 0.05), bone, seg=12, rings=7)               # face
    for sg in (-1, 1):
        p.ball((sg * 0.034, -0.082, 0.098), (0.026, 0.02, 0.028), dark, seg=10, rings=6)  # eye sockets
        p.ball((sg * 0.06, -0.055, 0.08), (0.016, 0.02, 0.025), bone, seg=8, rings=5)     # cheekbones
    p.ball((0, -0.092, 0.07), (0.011, 0.012, 0.02), dark, seg=8, rings=5)                # nose
    if jaw:
        p.hull([(-0.046, -0.07, 0.03), (0.046, -0.07, 0.03), (-0.05, 0.0, 0.035), (0.05, 0.0, 0.035), (-0.032, -0.085, 0.005),
                (0.032, -0.085, 0.005), (-0.044, 0.0, 0.0), (0.044, 0.0, 0.0)], bone, bevel=0.006, smooth=40)
        for i in range(8):
            x = -0.035 + 0.01 * i
            p.box(x - 0.004, x + 0.004, -0.088, -0.081, 0.032, 0.046, 'gw_bone')
    p.warp(0.002, 20.0, seed)
    p.transform(bl.scale(s, s, s))
    return p


def vertebra(m, c, r=0.02, mat='gw_bone_old'):
    m.ball(c, (r, r * 0.9, r * 0.6), mat, seg=8, rings=5)
    m.cyl((c[0], c[1] + 0.012, c[2]), (c[0], c[1] + r * 1.7, c[2] + 0.004), 0.006, 0.004, mat, seg=5)


def bones_a(seed=401):
    """A skull and a collapsed rib cage with part of the spine."""
    rng = random.Random(seed)
    m = Mesh('bones_a')
    # the spine running back
    for i in range(9):
        vertebra(m, (0.2 + 0.04 * i, 0.06 + 0.012 * math.sin(i * 0.8), 0.022), 0.022 - 0.0008 * i)
    # ribs fanning out from the spine
    for i in range(6):
        x = 0.24 + 0.05 * i
        for sg in (-1, 1):
            pts = []
            for j in range(9):
                t = j / 8
                pts.append((x + 0.0 * t - 0.01 * i * t, 0.06 + sg * (0.04 + 0.2 * math.sin(t * 1.6)) * (1 - 0.18 * i / 6),
                            0.012 + 0.07 * math.sin(t * PI * 0.9) * (0.9 - 0.08 * i)))
            m.tube(pts, [0.012 * (1 - 0.5 * j / 8) for j in range(9)], 'gw_bone', seg=5, cap=True)
    # the skull, turned on its side to the west
    sk = skull(seed)
    settle(m, sk, -0.18, -0.02, rotz(0.5) @ rotx(0.05) @ roty(0.35), lift=0.0)
    # a loose arm bone and a few fragments
    long_bone(m, (-0.05, 0.28, 0.02), (0.22, 0.4, 0.02), 0.017, rng=rng)
    long_bone(m, (0.3, -0.2, 0.018), (0.5, -0.16, 0.018), 0.012, rng=rng)
    for i in range(6):
        p = chunk(rng, rng.uniform(0.03, 0.06), 'gw_bone_old', flat=0.6)
        settle(m, p, rng.uniform(-0.3, 0.6), rng.uniform(-0.3, 0.4), rotz(rng.uniform(0, 6)), lift=0.0)
    dust(m, 0.1, 0.1, 0.383, 0.297, 0.0, rng)
    return m


def bones_b(seed=411):
    """A broken round shield and a snapped spear."""
    rng = random.Random(seed)
    m = Mesh('bones_b')
    # the shield, lying slightly tilted, with a crack across and a missing wedge
    sh = Mesh('shield')
    sh.lathe([(0.0, 0.0), (0.02, 0.33), (0.045, 0.35), (0.055, 0.32), (0.07, 0.04), (0.095, 0.0)], 'gw_wood', seg=28, smooth=40.0, cap=False)
    # iron rim and boss
    sh.tube(circle_pts((0, 0, 0.03), 0.345, 0.345, 32, 'xy'), 0.018, 'gw_iron_old', seg=6, cap=False)
    sh.lathe([(0.075, 0.0), (0.09, 0.06), (0.12, 0.09), (0.14, 0.04), (0.14, 0.0)], 'gw_iron', seg=14, smooth=50.0, cap=False)
    # planks: grooves
    for k in range(-3, 4):
        x = k * 0.1
        sh.box(x - 0.004, x + 0.004, -0.3, 0.3, 0.05, 0.06, 'gw_wood_dark') if abs(x) < 0.3 else None
    # iron straps across
    sh.box(-0.34, 0.34, -0.03, 0.03, 0.035, 0.065, 'gw_iron_old', bevel=0.004)
    # break: remove the wedge by clamping vertices beyond a jagged line
    for v in sh.bm.verts:
        if v.co.x > 0.12 and v.co.y > 0.12 + 0.4 * (v.co.x - 0.12) * 0.0 - 0.0:
            v.co.z = max(0.0, v.co.z * 0.2)
    sh.warp(0.006, 5.0, seed)
    settle(m, sh, -0.1, 0.05, rotz(0.4) @ rotx(0.1) @ roty(-0.12), lift=0.0)
    # a split-off piece of the shield
    piece = Mesh('piece')
    piece.hull([(0, 0, 0), (0.25, 0.02, 0), (0.22, 0.2, 0), (0.0, 0.14, 0), (0, 0, 0.035), (0.25, 0.02, 0.025), (0.22, 0.2, 0.03), (0.0, 0.14, 0.04)],
               'gw_wood', bevel=0.006, smooth=30)
    piece.tube([(0.0, 0.0, 0.03), (0.25, 0.02, 0.025)], 0.012, 'gw_iron_old', seg=5, cap=True)
    settle(m, piece, 0.3, -0.25, rotz(0.9), lift=0.0)
    # the spear, snapped in two
    a = (-0.55, -0.15, 0.022)
    b = (0.15, -0.35, 0.022)
    m.cyl(a, b, 0.014, 0.014, 'gw_wood', seg=7, smooth=60.0)
    m.cyl((0.2, -0.36, 0.022), (0.5, -0.46, 0.022), 0.014, 0.012, 'gw_wood', seg=7, smooth=60.0)
    hd = Mesh('head')
    hd.hull([(0, 0, 0), (0.17, 0, 0.0), (0.08, 0.04, 0.012), (0.08, -0.04, 0.012), (0.08, 0.0, 0.03), (0.0, 0, 0.012)], 'gw_steel', bevel=0.004, smooth=30)
    hd.cyl((-0.06, 0, 0.012), (0.0, 0, 0.012), 0.018, 0.015, 'gw_iron_old', seg=6)
    settle(m, hd, 0.5, -0.46, rotz(0.3), lift=0.0)
    dust(m, 0.0, 0.0, 0.468, 0.340, 0.0, rng)
    return m


def bones_c(seed=421):
    """A dented helm lying on its side with a few bones near it."""
    rng = random.Random(seed)
    m = Mesh('bones_c')
    h = Mesh('helm')
    # a kettle-style helm: dome, a brim, a face slit
    prof_h = [(0.0, 0.15), (0.03, 0.17), (0.12, 0.185), (0.2, 0.17), (0.27, 0.12), (0.3, 0.06), (0.31, 0.0)]
    h.lathe(prof_h, 'gw_iron_old', seg=24, smooth=50.0, cap=False, mx=rotx(0.0))
    h.tube(circle_pts((0, 0, 0.0), 0.15, 0.15, 24, 'xy'), 0.014, 'gw_steel', seg=6, cap=False)
    h.box(-0.1, 0.1, -0.2, -0.17, 0.12, 0.15, 'gw_void', bevel=0.004)
    h.cyl((0, 0, 0.3), (0, 0, 0.38), 0.012, 0.0, 'gw_iron', seg=6)
    h.warp(0.012, 6.0, seed)
    # a dent
    for v in h.bm.verts:
        d = (v.co - Vector((0.1, -0.1, 0.2))).length
        if d < 0.1:
            v.co += (Vector((0.1, -0.1, 0.2)) - v.co).normalized() * (0.1 - d) * 0.25
    settle(m, h, -0.05, 0.0, rotz(-0.35) @ rotx(-PI / 2 + 0.22), lift=0.0)
    long_bone(m, (0.3, -0.1, 0.018), (0.58, -0.2, 0.018), 0.014, rng=rng)
    long_bone(m, (0.25, 0.15, 0.015), (0.42, 0.3, 0.015), 0.011, rng=rng)
    for i in range(5):
        vertebra(m, (0.3 + 0.045 * i, 0.3 - 0.01 * i, 0.016), 0.017)
    dust(m, 0.1, 0.0, 0.340, 0.255, 0.0, rng)
    return m


def bones_d(seed=431):
    """A heap of bones: long bones criss-crossed, ribs, vertebrae and a small skull."""
    rng = random.Random(seed)
    m = Mesh('bones_d')
    dust(m, 0, 0, 0.425, 0.323, 0.0, rng)
    for i in range(10):
        a = rng.uniform(0, PI)
        L = rng.uniform(0.28, 0.46)
        cx, cy = rng.uniform(-0.18, 0.18), rng.uniform(-0.12, 0.12)
        z = 0.02 + 0.018 * (i % 4)
        dz = rng.uniform(-0.01, 0.025)
        long_bone(m, (cx - math.cos(a) * L / 2, cy - math.sin(a) * L / 2 * 0.8, z), (cx + math.cos(a) * L / 2, cy + math.sin(a) * L / 2 * 0.8, z + dz),
                  rng.uniform(0.012, 0.018), rng=rng)
    for i in range(7):
        x, y = rng.uniform(-0.25, 0.25), rng.uniform(-0.2, 0.2)
        ang = rng.uniform(0, 2 * PI)
        pts = []
        for j in range(8):
            t = j / 7
            pts.append((x + math.cos(ang + t * 1.6) * 0.12 * 0.8, y + math.sin(ang + t * 1.6) * 0.12 * 0.8, 0.02 + 0.05 * math.sin(t * PI * 0.8) + 0.02 * (i % 3)))
        m.tube(pts, [0.011 * (1 - 0.5 * j / 7) for j in range(8)], 'gw_bone', seg=5, cap=True)
    for i in range(10):
        vertebra(m, (rng.uniform(-0.3, 0.3), rng.uniform(-0.2, 0.2), 0.03 + 0.02 * rng.random()), 0.017)
    sk = skull(seed, 0.9)
    settle(m, sk, 0.14, -0.1, rotz(-0.4) @ roty(-0.5) @ rotx(0.3), lift=0.045)
    for i in range(8):
        p = chunk(rng, rng.uniform(0.025, 0.05), 'gw_bone_old', flat=0.6)
        settle(m, p, rng.uniform(-0.4, 0.4), rng.uniform(-0.3, 0.3), rotz(rng.uniform(0, 6)), lift=0.0)
    return m


# ------------------------------------------------------------------------------------------------ urns

def urn_body(m, pts, mat='gw_statue_dark', seg=26, flutes=0, seed=0):
    f = prof(pts)
    zs = [p[0] for p in pts]
    # extra rings between the profile points for smoothness
    zz = []
    for (z0, _), (z1, _) in zip(pts, pts[1:]):
        for k in range(3):
            zz.append(z0 + (z1 - z0) * k / 3)
    zz.append(pts[-1][0])
    revolve(m, [(z, (lambda zq: (lambda th: f(zq) * (1 + flutes * math.sin(10 * th))))(z)) for z in zz], mat, seg=seg, closed_top=False, closed_bottom=True)


def urn_a(seed=501):
    """gw_urn_a: a stone amphora-urn with bronze bands, handles, a domed bronze lid and a gold crescent."""
    rng = random.Random(seed)
    m = Mesh('urn_a')
    body = [(0.0, 0.15), (0.03, 0.17), (0.12, 0.24), (0.3, 0.285), (0.45, 0.24), (0.55, 0.15), (0.6, 0.115), (0.64, 0.12)]
    b = Mesh('body')
    urn_body(b, body, 'gw_statue_dark', flutes=0.012, seed=seed)
    b.warp(0.004, 6.0, seed)
    m.add(b)
    b.free()
    # bronze bands and the lid
    for z, r in ((0.3, 0.292), (0.12, 0.248), (0.56, 0.148)):
        m.lathe([(z - 0.022, r * 0.99), (z - 0.012, r + 0.012), (z + 0.012, r + 0.012), (z + 0.022, r * 0.99)], 'gw_bronze', seg=26, smooth=50.0, cap=False)
    m.lathe([(0.63, 0.13), (0.64, 0.145), (0.66, 0.125), (0.7, 0.09), (0.74, 0.045), (0.76, 0.0)], 'gw_bronze_hi', seg=22, smooth=50.0, cap=True)
    m.ball((0, 0, 0.775), (0.028, 0.028, 0.03), 'gw_bronze', seg=10, rings=6)
    # handles
    for sg in (-1, 1):
        pts = [(sg * 0.125, 0, 0.58), (sg * 0.2, 0, 0.58), (sg * 0.3, 0, 0.5), (sg * 0.33, 0, 0.4), (sg * 0.29, 0, 0.32)]
        m.tube(pts, 0.022, 'gw_bronze', seg=7, cap=True)
    # a gold crescent inlay on the front
    crescent(m, 0.0, 0.3, 0.075, -0.292, -0.274, 'gw_gold', thick=0.5, off=0.34, tilt=0.4, bevel=0.003)
    mr = random.Random(seed + 1)
    moss_line(m, -0.15, 0.15, -0.16, 0.04, mr, density=3, r=0.03, mat='gw_moss_dark')
    return m


def urn_b(seed=511):
    """gw_urn_b: a squat jar bound with four bronze straps, a bronze lid with a ring handle, a carved crescent band."""
    rng = random.Random(seed)
    m = Mesh('urn_b')
    body = [(0.0, 0.2), (0.03, 0.23), (0.12, 0.31), (0.26, 0.34), (0.38, 0.29), (0.46, 0.2), (0.5, 0.17), (0.52, 0.17)]
    b = Mesh('body')
    urn_body(b, body, 'gw_stone_b', seg=26, seed=seed)
    b.warp(0.005, 5.0, seed)
    m.add(b)
    b.free()
    # straps: four bronze bands down the body
    for k in range(4):
        a = PI / 4 + PI / 2 * k
        pts = []
        f = prof(body)
        for i in range(11):
            z = 0.04 + 0.46 * i / 10
            r = f(z) + 0.012
            pts.append((r * math.cos(a), r * math.sin(a), z))
        m.tube(pts, 0.016, 'gw_bronze', seg=6, cap=True, flat=0.5)
    m.lathe([(0.1, 0.305), (0.12, 0.32), (0.14, 0.32), (0.16, 0.31)], 'gw_bronze', seg=26, smooth=50.0, cap=False)
    m.lathe([(0.49, 0.185), (0.51, 0.2), (0.545, 0.19), (0.6, 0.15), (0.64, 0.09), (0.66, 0.0)], 'gw_bronze_hi', seg=22, smooth=50.0, cap=True)
    m.tube(circle_pts((0, 0, 0.71), 0.05, 0.05, 14, 'yz')[:15], 0.012, 'gw_bronze', seg=6, cap=False) if False else None
    ring = [(0.0, 0.05 * math.cos(2 * PI * i / 16), 0.7 + 0.05 * math.sin(2 * PI * i / 16)) for i in range(17)]
    m.tube(ring, 0.012, 'gw_bronze', seg=6, cap=False)
    # a carved band of crescents round the belly (front only)
    for k in range(-1, 2):
        x = k * 0.17
        r = 0.335
        crescent(m, x, 0.26, 0.05, -(r - abs(x) * 0.18) - 0.0, -(r - abs(x) * 0.18) + 0.012, 'gw_stone_d', thick=0.5, off=0.34, tilt=PI / 2 * 0 + 0.3, bevel=0.002)
    mr = random.Random(seed + 1)
    moss_line(m, -0.2, 0.2, -0.2, 0.04, mr, density=3, r=0.03, mat='gw_moss_dark')
    return m


def urn_broken(seed=521):
    """gw_urn_broken: the base of a smashed urn with a jagged rim, curved shards, bronze fragments and ash."""
    rng = random.Random(seed)
    m = Mesh('urn_broken')
    body = [(0.0, 0.15), (0.03, 0.17), (0.12, 0.24), (0.26, 0.27)]
    b = Mesh('body')
    urn_body(b, body, 'gw_statue_dark', flutes=0.012, seed=seed)
    # a jagged rim
    for v in b.bm.verts:
        th = math.atan2(v.co.y, v.co.x)
        lim = 0.14 + 0.1 * (0.5 + 0.5 * math.sin(3 * th + 1.0)) + 0.04 * math.sin(7 * th)
        if v.co.z > lim:
            v.co.z = lim
    b.warp(0.004, 6.0, seed)
    m.add(b)
    b.free()
    m.ball((0, 0, 0.13), (0.2, 0.2, 0.02), 'gw_dust', seg=12, rings=4)     # ash inside
    # shards: patches of the urn's wall
    f = prof([(0.0, 0.15), (0.03, 0.17), (0.12, 0.24), (0.3, 0.285), (0.45, 0.24)])
    for i in range(7):
        sh = Mesh('shard')
        th0 = rng.uniform(0, 2 * PI)
        dth = rng.uniform(0.5, 0.9)
        z0 = rng.uniform(0.15, 0.35)
        h = rng.uniform(0.1, 0.2)
        mat = 'gw_statue_dark'

        def fn(u, v):
            th = th0 + dth * u
            z = z0 + h * v * (0.7 + 0.3 * math.sin(3 * u + i))
            r = f(z)
            return (r * math.cos(th), r * math.sin(th), z)
        sh.grid_sheet(fn, 5, 4, mat, smooth=50.0, thick=0.011)
        # centre it and lay it on the floor
        cen = Vector((0, 0, 0))
        n = 0
        for v in sh.bm.verts:
            cen += v.co
            n += 1
        cen /= max(n, 1)
        sh.transform(trans(-cen.x, -cen.y, -cen.z))
        d = rng.uniform(0.2, 0.55)
        a = rng.uniform(0, 2 * PI)
        settle(m, sh, d * math.cos(a), d * math.sin(a), rotz(rng.uniform(0, 6)) @ rotx(rng.uniform(1.0, 1.8)) @ roty(rng.uniform(-0.4, 0.4)), lift=0.0)
    # bronze fragments: a bit of the lid and a handle ring, a gold crescent piece
    p = Mesh('lid')
    p.lathe([(0.0, 0.13), (0.015, 0.145), (0.035, 0.12), (0.075, 0.07), (0.1, 0.0)], 'gw_bronze_hi', seg=18, smooth=50.0, cap=True, arc=PI * 1.2)
    settle(m, p, 0.32, -0.3, rotz(0.6) @ rotx(PI * 0.85), lift=0.0)
    p = Mesh('handle')
    p.tube([(0, 0, 0), (0.07, 0, 0.06), (0.14, 0, 0.06), (0.2, 0, 0.0)], 0.02, 'gw_bronze', seg=7, cap=True)
    settle(m, p, -0.4, 0.2, rotz(0.8), lift=0.0)
    p = Mesh('moon')
    crescent(p, 0, 0, 0.07, -0.008, 0.008, 'gw_gold', thick=0.5, off=0.34, bevel=0.002)
    settle(m, p, -0.15, -0.4, rotx(PI / 2) @ rotz(0.3), lift=0.0)
    for i in range(12):
        c = chunk(rng, rng.uniform(0.02, 0.05), 'gw_statue_dark', flat=0.5)
        a = rng.uniform(0, 2 * PI)
        d = rng.uniform(0.2, 0.55)
        settle(m, c, d * math.cos(a), d * math.sin(a), rotz(rng.uniform(0, 6)), lift=0.0)
    dust(m, 0.0, -0.1, 0.425, 0.340, 0.0, rng)
    return m
