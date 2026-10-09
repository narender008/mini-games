"""Generic gore for any creature (Lane C): meat chunks, bones, an eyeball, guts, a brain, skull shard, tooth, torn cloth, and the
frozen versions (ice chunks with meat inside, ice shards). Each is built around the origin (pivot = centre of mass) and tilted
so its best side faces the camera; the game spins and bounces them in 2D.

Frames (48 px/m): gib_meat_0..3, gib_bone_0..2, gib_eye, gib_guts_0..1, gib_brain, gib_skull_shard, gib_tooth, ice_chunk_0..3,
ice_shard_0..1, gib_cloth_0..1.
"""
import math
import random

import mats
from mathutils import Vector
from bl import Mesh, rotx, roty, rotz, trans, scale
from props import one, rock, shaded_rock, sheet_shard

PI = math.pi
# toward the camera in world space (0, -cos e, sin e) with e = 35 degrees: used to turn a gib's best face to the viewer
FACE = rotx(0.0)


def _materials():
    d = mats.define
    d('gb_fat', base='#f8dcc4', base2='#e9b9a0', pattern='noise', pscale=8, pamt=0.5, bevel=0.01, seed=101)
    d('gb_meat', base='#c9283a', base2='#8f1424', pattern='noise', pscale=6, pamt=0.7, bump=0.5, bevel=0.02, seed=102)
    d('gb_meat_lt', base='#ee5a68', base2='#c93a4c', pattern='noise', pscale=7, pamt=0.6, bump=0.4, bevel=0.02, seed=103)
    d('gb_gut', base='#ee7f94', base2='#c9506c', pattern='noise', pscale=9, pamt=0.5, bump=0.6, bevel=0.025, seed=104)
    d('gb_gut_hi', base='#ffc0cc', bevel=0.01)
    d('gb_brain', base='#f59ab0', base2='#dc6c8a', pattern='noise', pscale=14, pamt=0.7, bump=0.9, bscale=60, bevel=0.015, seed=105)
    d('gb_brain_hi', base='#ffc2d0', base2='#f59ab0', pattern='noise', pscale=10, pamt=0.5, bevel=0.015, seed=106)
    d('gb_brain_dark', base='#b8466a', bevel=0.01)
    d('gb_iris', base='#4fd0ff', bevel=0.004)
    d('gb_vein', base='#d02a3a', bevel=0.004)
    d('gb_nerve', base='#f0a0a8', base2='#d9707e', pattern='noise', pscale=8, pamt=0.5, bevel=0.01, seed=107)
    d('gb_ice', base='#8fdcff', emit=0.45, bevel=0.01)
    d('gb_ice_hi', base='#dcf6ff', emit=0.55, bevel=0.01)
    d('gb_ice_lo', base='#4fb0ec', emit=0.4, bevel=0.01)
    d('gb_bone_end', base='#f6ecd2', bevel=0.012)
    d('gb_shirt_a', base='#6f86a6', base2='#506580', pattern='noise', pscale=6, pamt=0.6, bump=0.3, bevel=0.01, seed=108)
    d('gb_shirt_b', base='#d4524a', base2='#a63a35', pattern='noise', pscale=6, pamt=0.6, bump=0.3, bevel=0.01, seed=109)
    d('gb_shirt_in', base='#4b5a72', bevel=0.01)
    d('gb_shirt_in_b', base='#6f2a28', bevel=0.01)


ICE3 = ('gb_ice_hi', 'gb_ice', 'gb_ice_lo')
_materials()


def tilt(m, back=0.9, spin=0.0):
    """Lay a gib so its +Z side faces the camera: spin it about its own Z by `spin`, then pitch it by `back` toward the viewer."""
    m.transform(rotz(spin))
    m.transform(rotx(back))


GIB_SCALE = 1.25     # gibs are drawn a little oversize so they read at a few pixels


def centre(m, k=GIB_SCALE):
    vs = [v.co for v in m.bm.verts]
    c = sum(vs, Vector()) / len(vs)
    m.transform(trans(-c.x, -c.y, -c.z))
    m.transform(scale(k))


def cut_disc(m, c, nrm, r, fat='gb_fat', meat='gb_meat_lt', bone=True):
    """A flat, freshly cut face: a fat ring, a red heart and a bone dot, lying in the plane with normal `nrm` at c."""
    n = Vector(nrm).normalized()
    q = Vector((0, 0, 1)).rotation_difference(n).to_matrix().to_4x4()
    M = trans(*c) @ q
    m.lathe([(0.0, 0.0), (0.0, r)], fat, mx=M, seg=14, smooth=0.0, cap=False)
    m.lathe([(0.012, 0.0), (0.012, r * 0.78)], meat, mx=M, seg=14, smooth=0.0, cap=False)
    if bone:
        m.lathe([(0.02, 0.0), (0.02, r * 0.28)], 'gb_bone_end', mx=M, seg=10, smooth=0.0, cap=False)


# ------------------------------------------------------------------------------------------------ meat

def meat_chunk(kind):
    m = Mesh('meat')
    r = random.Random(20 + kind)
    if kind == 0:                         # a limb stump: lumpy meat with a cut face and a bone end
        m.ball((0, 0, 0), (0.22, 0.17, 0.15), 'gb_meat', seg=14, rings=8)
        m.ball((-0.1, 0.05, 0.08), (0.14, 0.12, 0.1), 'gb_meat_lt', seg=12, rings=7)
        m.ball((0.12, -0.04, -0.07), (0.12, 0.1, 0.09), 'gb_meat', seg=12, rings=7)
        m.ball((0.02, 0.08, -0.1), (0.1, 0.08, 0.07), 'gb_meat_lt', seg=12, rings=7)
        cut_disc(m, (0.18, -0.02, 0.0), (1, 0, 0), 0.15)
        m.capsule((0.2, -0.02, 0.0), (0.33, -0.02, 0.02), 0.035, 0.03, 'gb_bone_end')
        m.ball((0.34, -0.02, 0.025), (0.05, 0.05, 0.05), 'gb_bone_end')
        tilt(m, 0.6, 0.35)
    elif kind == 1:                       # a ragged steak with a white fat edge and marbling streaks
        rock(m, (0, 0, 0), (0.26, 0.19, 0.07), 'gb_meat', seed=23, n=11, bevel=0.012, jitter=0.18)
        m.capsule((-0.2, 0.17, 0.02), (0.22, 0.15, 0.02), 0.035, 0.03, 'gb_fat', seg=8, rings=3)
        for (x0, y0, x1, y1) in ((-0.15, -0.08, 0.05, -0.02), (0.02, 0.05, 0.17, -0.06), (-0.1, 0.06, 0.0, 0.1)):
            m.capsule((x0, y0, 0.065), (x1, y1, 0.065), 0.012, 0.01, 'gb_fat', seg=6, rings=2)
        m.ball((-0.08, -0.06, 0.07), (0.1, 0.05, 0.015), 'gb_meat_lt', seg=8, rings=4, rot=rotz(0.4))
        tilt(m, 0.95, -0.4)
    elif kind == 2:                       # three meatballs hanging together by a string of gristle
        for (x, y, z, rr, mt) in ((-0.13, 0.03, 0.0, 0.13, 'gb_meat'), (0.1, -0.04, 0.05, 0.115, 'gb_meat_lt'), (0.0, 0.1, -0.07, 0.09, 'gb_meat')):
            m.ball((x, y, z), (rr, rr * 0.95, rr * 0.9), mt, seg=12, rings=7)
            m.ball((x - rr * 0.35, y - rr * 0.7, z + rr * 0.35), (rr * 0.28, rr * 0.08, rr * 0.18), 'gb_meat_lt', seg=8, rings=5)
        m.tube([(-0.05, 0.0, 0.0), (0.0, 0.0, 0.03), (0.04, -0.02, 0.04)], 0.02, 'gb_fat', seg=6)
        m.ball((0.05, -0.11, 0.05), (0.04, 0.03, 0.03), 'gb_fat', seg=8, rings=5)
        tilt(m, 0.7, 0.8)
    else:                                 # a ragged flat splat of flesh
        for (x, y, rx, ry, mt) in ((0.0, 0.0, 0.2, 0.15, 'gb_meat'), (0.13, 0.05, 0.12, 0.09, 'gb_meat'), (-0.12, -0.06, 0.11, 0.1, 'gb_meat'),
                                   (0.02, 0.1, 0.1, 0.07, 'gb_meat')):
            m.ball((x, y, 0.0), (rx, ry, 0.045), mt, seg=12, rings=6)
        m.ball((0.0, -0.01, 0.045), (0.12, 0.08, 0.03), 'gb_meat_lt', seg=10, rings=5)
        for (x, y) in ((0.12, 0.05), (-0.11, -0.06), (0.02, 0.1)):
            m.ball((x, y, 0.04), (0.04, 0.03, 0.02), 'gb_fat', seg=8, rings=4)
        m.ball((-0.04, -0.03, 0.07), (0.04, 0.025, 0.012), 'gb_vein', seg=6, rings=3)
        tilt(m, 0.9, 1.9)
    centre(m)
    return m


# ------------------------------------------------------------------------------------------------ bones

def bone_part(m, a, b, r, knob):
    m.capsule(a, b, r, r, 'bone', seg=10, rings=3)
    for p, sgn in ((a, -1), (b, 1)):
        v = (Vector(b) - Vector(a)).normalized()
        for off in (-0.55, 0.55):
            perp = v.cross(Vector((0, 1, 0))).normalized()
            q = Vector(p) + v * (sgn * knob * 0.25) + perp * (off * knob * 0.75)
            m.ball(tuple(q), (knob, knob, knob), 'bone', seg=10, rings=6)


def bone_gib(kind):
    m = Mesh('bone')
    if kind == 0:                         # femur, one end snapped off and bloody
        bone_part(m, (-0.3, 0, 0), (0.3, 0, 0), 0.045, 0.062)
        m.ball((0.34, 0, 0), (0.045, 0.05, 0.05), 'gb_meat', seg=10, rings=6)
        m.ball((-0.33, 0.0, 0.02), (0.03, 0.03, 0.03), 'gb_meat_lt', seg=8, rings=5)
        m.transform(rotx(-0.0) @ rotz(0.55))
        tilt(m, 0.5, 0.0)
    elif kind == 1:                       # a piece of rib cage: a bit of spine and a fan of curved ribs
        for k in range(4):
            z = k * 0.14
            m.ball((0, 0, z), (0.07, 0.06, 0.06), 'bone', seg=10, rings=6)
            rib = [(0.04 + 0.34 * math.sin(t) * (1.0 - 0.08 * k), -0.28 * (1 - math.cos(t)) * 0.9, z + 0.02 * t) for t in [PI * 0.62 * i / 10 for i in range(11)]]
            m.tube(rib, 0.035 - 0.003 * k, 'bone', seg=7)
            m.ball(rib[-1], (0.04, 0.04, 0.04), 'gb_bone_end', seg=8, rings=5)
        m.ball((0.0, 0.0, -0.08), (0.06, 0.055, 0.05), 'gb_meat', seg=8, rings=5)
        m.ball((0.0, 0.0, 0.5), (0.06, 0.055, 0.05), 'gb_meat', seg=8, rings=5)
        centre(m)
        tilt(m, 1.2, 0.0)
    else:                                 # jawbone with teeth
        # a U that opens toward +Y: t in pi..2pi is the bottom curve
        U = [(0.2 * math.cos(PI + PI * i / 12), 0.17 * math.sin(PI + PI * i / 12), 0.0) for i in range(13)]
        m.tube(U, 0.045, 'bone', seg=8)
        for sx in (-1, 1):
            m.capsule((sx * 0.2, 0.0, 0.0), (sx * 0.22, 0.12, 0.17), 0.04, 0.035, 'bone', seg=8, rings=3)
            m.ball((sx * 0.22, 0.12, 0.2), (0.045, 0.045, 0.045), 'gb_bone_end', seg=8, rings=5)
        for i in range(2, 11):
            t = PI + PI * i / 12
            c = (0.2 * math.cos(t) * 0.82, 0.17 * math.sin(t) * 0.82, 0.04)
            m.box(c[0] - 0.02, c[0] + 0.02, c[1] - 0.02, c[1] + 0.02, 0.0, 0.07, 'teeth', bevel=0.005)
        centre(m)
        tilt(m, 0.9, 0.5)
    return m


# ------------------------------------------------------------------------------------------------ eye, guts, brain, shard, tooth

def eyeball():
    m = Mesh('eye')
    R = 0.13
    m.ball((0, 0, 0), (R, R, R), 'eye_white', seg=18, rings=10)
    f = Vector((0.0, -0.82, 0.57))       # toward the camera
    f.normalize()
    iris_c = f * R * 0.92
    nrm = f
    q = Vector((0, 0, 1)).rotation_difference(nrm).to_matrix().to_4x4()
    M = trans(*iris_c) @ q
    m.lathe([(0.0, 0.0), (0.0, R * 0.52)], 'gb_iris', mx=M, seg=16, smooth=0.0, cap=False)
    m.lathe([(0.01, 0.0), (0.01, R * 0.26)], 'pupil', mx=M, seg=12, smooth=0.0, cap=False)
    m.ball(tuple(iris_c + Vector((-0.02, -0.02, 0.03))), (0.018, 0.012, 0.018), 'eye_white', seg=6, rings=4)
    for a in (0.5, 1.7, 3.0, 4.2):          # red veins on the white
        pts = []
        for i in range(6):
            t = i / 5
            ang = a + 0.3 * math.sin(t * 5)
            v = Vector((math.cos(ang) * math.sin(0.5 + t * 0.8), math.sin(ang) * math.sin(0.5 + t * 0.8), -math.cos(0.5 + t * 0.8)))
            pts.append(tuple(v * R * 1.0))
        m.tube(pts, 0.006, 'gb_vein', seg=4)
    nerve = [(0.0, 0.1, 0.0), (0.04, 0.2, 0.0), (-0.02, 0.3, 0.04), (0.06, 0.4, 0.02)]
    m.tube(nerve, [0.04, 0.032, 0.03, 0.024], 'gb_nerve', seg=8)
    m.ball((0.06, 0.41, 0.02), (0.035, 0.03, 0.03), 'gb_meat', seg=8, rings=5)
    centre(m)
    return m


def guts(kind):
    m = Mesh('guts')
    r = random.Random(50 + kind)
    if kind == 0:                         # a loose, tangled loop of intestine with a torn tail
        pts = []
        for i in range(70):
            t = i / 69
            a = t * 2 * PI * 1.75
            rr = 0.27 * (1 - 0.25 * t)
            pts.append((math.sin(a) * rr * 1.2 - 0.12 * t, math.sin(2 * a + 0.6) * rr * 0.6 + 0.0, 0.085 + 0.06 * math.sin(a * 1.7)))
        m.tube(pts, [0.075 - 0.02 * (i / 69) for i in range(70)], 'gb_gut', seg=10, smooth=70.0)
        hl = [(p[0], p[1] - 0.035, p[2] + 0.04) for p in pts[4:64]]
        m.tube(hl, 0.012, 'gb_gut_hi', seg=4)
        m.ball(pts[0], (0.075, 0.075, 0.065), 'gb_meat', seg=8, rings=5)
        m.ball(pts[-1], (0.05, 0.05, 0.045), 'gb_meat', seg=8, rings=5)
        tilt(m, 0.5, 0.2)
    else:                                 # a long string winding off a lumpy sac
        pts = []
        for i in range(48):
            t = i / 47
            pts.append((-0.33 + t * 0.62, 0.12 * math.sin(t * 2 * PI * 1.5) + 0.0, 0.07 + 0.06 * math.sin(t * 9) + 0.0))
        m.tube(pts, [0.055 - 0.02 * (i / 47) for i in range(48)], 'gb_gut', seg=10, smooth=70.0)
        m.ball((-0.34, 0.0, 0.1), (0.15, 0.13, 0.11), 'gb_gut', seg=14, rings=8)
        m.ball((-0.3, -0.06, 0.2), (0.06, 0.03, 0.04), 'gb_gut_hi', seg=8, rings=5, rot=rotz(-0.5))
        for (x, y, z, rr) in ((-0.43, 0.08, 0.06, 0.07), (-0.27, 0.12, 0.05, 0.065)):
            m.ball((x, y, z), (rr, rr, rr * 0.9), 'gb_gut', seg=10, rings=6)
        m.ball((0.29, 0.1, 0.07), (0.05, 0.05, 0.04), 'gb_meat', seg=8, rings=5)
        tilt(m, 0.5, -0.3)
    centre(m)
    return m


def brain():
    m = Mesh('brain')
    for sx in (-1, 1):                    # two hemispheres, each a squat ellipsoid with folds on top
        c = (sx * 0.075, 0.0, 0.0)
        m.ball(c, (0.14, 0.2, 0.13), 'gb_brain', seg=16, rings=10)
    r = random.Random(3)
    k = 0
    while k < 30:                         # gyri: small raised lobes scattered over the visible hull
        sx = 1 if k % 2 else -1
        a, e = r.uniform(0, 2 * PI), r.uniform(0.1, 1.45)
        d = Vector((math.cos(a) * math.cos(e) * 0.14, math.sin(a) * math.cos(e) * 0.2, math.sin(e) * 0.13))
        if abs(d.x) < 0.03:
            continue
        c = Vector((sx * 0.075, 0, 0)) + d * 0.99
        if (c.x > 0) != (sx > 0):
            continue
        rr = r.uniform(0.04, 0.06)
        m.ball(tuple(c), (rr, rr * 1.2, rr * 0.8), 'gb_brain_hi' if k % 3 else 'gb_brain', seg=8, rings=5, rot=rotz(r.uniform(0, PI)))
        k += 1
    m.box(-0.012, 0.012, -0.19, 0.19, 0.04, 0.13, 'gb_brain_dark', bevel=0.004)         # the fissure between the halves
    m.ball((0.0, 0.2, -0.04), (0.07, 0.06, 0.05), 'gb_brain', seg=10, rings=6)          # cerebellum
    m.capsule((0.0, 0.17, -0.07), (0.0, 0.22, -0.16), 0.03, 0.025, 'gb_nerve', seg=8, rings=3)
    m.ball((0.0, 0.2, -0.17), (0.03, 0.03, 0.025), 'gb_meat', seg=8, rings=5)
    centre(m)
    tilt(m, 0.8, 0.5)
    return m


def skull_shard():
    m = sheet_shard(14, 0.3, 0.27, 5.0, 'bone', 'gb_meat_lt')
    m.transform(rotx(-0.6) @ rotz(-0.4))
    centre(m, 1.5)
    return m


def tooth():
    m = Mesh('tooth')
    rock(m, (0, 0, 0.07), (0.1, 0.085, 0.085), 'teeth', seed=4, n=10, bevel=0.015, jitter=0.12)
    for sx in (-1, 1):
        m.cyl((sx * 0.045, 0, 0.0), (sx * 0.035, 0, -0.14), 0.04, 0.012, 'gb_bone_end', seg=7)
    m.ball((0.0, -0.01, -0.12), (0.045, 0.04, 0.035), 'gb_meat', seg=8, rings=5)
    m.ball((-0.04, -0.09, 0.1), (0.03, 0.01, 0.04), 'eye_white', seg=6, rings=4)
    tilt(m, 0.5, 0.7)
    centre(m, 1.7)
    return m


# ------------------------------------------------------------------------------------------------ ice

def ice_chunk(kind):
    m = Mesh('ice')
    if kind == 0:                         # a faceted block, a lump of meat showing through the front
        shaded_rock(m, (0, 0, 0), (0.22, 0.18, 0.2), ICE3, seed=31, n=11, jitter=0.2)
        m.ball((0.02, -0.14, 0.02), (0.1, 0.06, 0.09), 'gb_meat', seg=10, rings=6)
        m.ball((0.0, -0.17, 0.04), (0.045, 0.02, 0.04), 'gb_meat_lt', seg=8, rings=5)
        shaded_rock(m, (-0.12, -0.1, 0.14), (0.07, 0.05, 0.05), ICE3, seed=32, n=7)
        tilt(m, 0.5, 0.4)
    elif kind == 1:                       # a tall shard with a bone sticking out of the top
        shaded_rock(m, (0, 0, 0), (0.1, 0.09, 0.28), ICE3, seed=33, n=9, jitter=0.15)
        m.capsule((0.0, -0.05, 0.1), (0.04, -0.06, 0.4), 0.03, 0.025, 'gb_bone_end', seg=8, rings=3)
        m.ball((0.045, -0.06, 0.42), (0.04, 0.04, 0.04), 'gb_bone_end', seg=8, rings=5)
        m.ball((0.0, -0.085, 0.0), (0.05, 0.03, 0.08), 'gb_meat', seg=8, rings=5)
        tilt(m, 0.7, 0.9)
    elif kind == 2:                       # a flat slab, a frozen steak in the middle
        shaded_rock(m, (0, 0, 0), (0.3, 0.22, 0.09), ICE3, seed=35, n=11, jitter=0.15)
        m.ball((0.0, -0.01, 0.08), (0.17, 0.12, 0.04), 'gb_meat', seg=10, rings=6)
        m.ball((-0.04, -0.03, 0.115), (0.05, 0.03, 0.012), 'gb_fat', seg=8, rings=4)
        shaded_rock(m, (0.18, 0.08, 0.1), (0.06, 0.05, 0.05), ICE3, seed=36, n=7)
        tilt(m, 0.95, -0.5)
    else:                                 # a cluster of crystals around a bit of meat
        shaded_rock(m, (0, 0, 0), (0.15, 0.13, 0.14), ICE3, seed=37, n=10, jitter=0.2)
        m.ball((0.0, -0.1, 0.0), (0.07, 0.05, 0.07), 'gb_meat', seg=8, rings=5)
        for k, (x, y, z, h) in enumerate(((-0.17, 0.0, 0.06, 0.24), (0.17, 0.02, 0.0, 0.2), (0.05, 0.1, 0.1, 0.26))):
            m.cyl((x, y, z - h * 0.4), (x + 0.02 * (1 if x > 0 else -1), y, z + h * 0.6), 0.06, 0.0, 'gb_ice_hi' if k % 2 else 'gb_ice_lo', seg=5)
        tilt(m, 0.6, 1.4)
    centre(m)
    return m


def shard_bar(m, ln, rr, mx):
    """A four-sided sliver in two tones: the lit half and the shaded half."""
    m.lathe([(-ln * 0.4, 0.0), (-ln * 0.05, rr)], 'gb_ice_lo', mx=mx, seg=4, smooth=0.0, cap=False, phase=0.5)
    m.lathe([(-ln * 0.05, rr), (ln * 0.6, 0.0)], 'gb_ice_hi', mx=mx, seg=4, smooth=0.0, cap=False, phase=0.5)


def ice_shard(kind):
    m = Mesh('shard')
    if kind == 0:                         # a single long sliver
        shard_bar(m, 0.62, 0.085, rotx(PI / 2) @ rotz(0.0))
        tilt(m, 0.0, 0.7)
    else:                                 # three slivers fanned out
        for a, ln, rr in ((-0.6, 0.42, 0.07), (0.1, 0.5, 0.085), (0.75, 0.36, 0.065)):
            shard_bar(m, ln, rr, rotx(PI / 2) @ rotz(a))
        tilt(m, 0.0, 0.3)
    centre(m, 1.4)
    return m


# ------------------------------------------------------------------------------------------------ cloth

def cloth(kind):
    r = random.Random(70 + kind)
    m = Mesh('cloth')
    outer, inner = ('gb_shirt_a', 'gb_shirt_in') if kind == 0 else ('gb_shirt_b', 'gb_shirt_in_b')
    nu, nv = 10, 8
    w, h = (0.46, 0.34) if kind == 0 else (0.38, 0.4)
    left = [r.uniform(-0.12, 0.08) for _ in range(nv + 1)]
    right = [r.uniform(-0.08, 0.12) for _ in range(nv + 1)]
    bot = [r.uniform(0.0, 0.25) for _ in range(nu + 1)]
    top = [r.uniform(-0.25, 0.0) for _ in range(nu + 1)]
    ph = r.uniform(0, PI)

    def surf(u, v, off):
        i, j = int(round(u * nu)), int(round(v * nv))
        x0 = -w / 2 * (1 + left[j] * 2)
        x1 = w / 2 * (1 + right[j] * 2)
        z0 = bot[i] * h
        z1 = h * (1 + top[i])
        x = x0 + (x1 - x0) * u
        z = z0 + (z1 - z0) * v
        # crumpled, hanging cloth: ripples across x and a sag in the middle
        y = 0.05 * math.sin(x * 14 + ph) + 0.035 * math.sin(z * 17 + ph * 2) + off
        return (x, y, z - h / 2 - 0.1 * (1 - (2 * u - 1) ** 2))

    m.grid_sheet(lambda u, v: surf(u, v, 0.0), nu, nv, outer, smooth=70.0)
    m.grid_sheet(lambda u, v: surf(u, v, 0.012), nu, nv, inner, smooth=70.0)
    # a seam line and a frayed hem of loose threads
    seam = [(-w * 0.45, -0.0, -h * 0.05), (0.0, 0.02, 0.0), (w * 0.45, 0.0, h * 0.05)]
    m.tube([(p[0], p[1] - 0.02, p[2]) for p in seam], 0.008, 'gb_shirt_in' if kind == 0 else 'gb_shirt_in_b', seg=4)
    if kind == 1:                         # a flapped pocket
        m.box(-0.08, 0.1, -0.06, -0.035, -0.02, 0.1, 'gb_shirt_in_b', bevel=0.004)
    else:                                 # a torn collar band
        m.box(-0.1, 0.1, -0.05, -0.03, h * 0.28, h * 0.4, 'gb_shirt_in', bevel=0.004)
    m.transform(rotx(-1.0) @ rotz(0.3 + kind * 1.2))
    centre(m)
    return m


def build(ctx):
    for i in range(4):
        one(ctx, 'gib_meat_%d' % i, lambda i=i: meat_chunk(i))
    for i in range(3):
        one(ctx, 'gib_bone_%d' % i, lambda i=i: bone_gib(i))
    one(ctx, 'gib_eye', eyeball)
    for i in range(2):
        one(ctx, 'gib_guts_%d' % i, lambda i=i: guts(i))
    one(ctx, 'gib_brain', brain)
    one(ctx, 'gib_skull_shard', skull_shard)
    one(ctx, 'gib_tooth', tooth)
    for i in range(4):
        one(ctx, 'ice_chunk_%d' % i, lambda i=i: ice_chunk(i))
    for i in range(2):
        one(ctx, 'ice_shard_%d' % i, lambda i=i: ice_shard(i))
    for i in range(2):
        one(ctx, 'gib_cloth_%d' % i, lambda i=i: cloth(i))
