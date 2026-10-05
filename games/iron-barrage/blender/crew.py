"""Crew and gore: the tank commander, his helmet and boot, and wet flesh chunks. Faces +x, near side at -y."""
import math
import random
from math import pi, sin, cos, sqrt

import bmesh
from mathutils import Vector, noise as mnoise

from bl import Mesh, trans, roty, rotx, rotz, at_xz, scale


def blob(m, c, size, seed, mat, sc=(1.0, 0.8, 0.7), rough=0.35, subdiv=3, smooth=70.0, rot=0.0):
    """An irregular lump: a displaced icosphere (size = overall length in metres)."""
    rnd = random.Random(seed)
    tb = bmesh.new()
    bmesh.ops.create_icosphere(tb, subdivisions=subdiv, radius=0.5)
    off = Vector((rnd.uniform(-9, 9), rnd.uniform(-9, 9), rnd.uniform(-9, 9)))
    for v in tb.verts:
        p = v.co.copy()
        n = mnoise.fractal(p * 3.1 + off, 0.5, 2.0, 4)
        n2 = mnoise.noise(p * 7.0 + off * 1.7)
        v.co = p * (1.0 + rough * n + rough * 0.35 * n2)
        v.co.x *= sc[0]
        v.co.y *= sc[1]
        v.co.z *= sc[2]
    bmesh.ops.transform(tb, matrix=scale(size), verts=tb.verts[:])
    m.commit(tb, mat, smooth, trans(*c) @ roty(rot))


def shred(m, c, w, h, seed, mat='cloth', ang=0.0, curl=0.04):
    """A torn strip of cloth (open sheet), slightly wavy."""
    rnd = random.Random(seed)
    ph = rnd.uniform(0, 6)

    def fn(u, v):
        x = (u - 0.5) * w * (1.0 - 0.45 * abs(v - 0.5) * (0.6 + 0.4 * sin(u * 7 + ph)))
        z = (v - 0.5) * h * (1.0 - 0.3 * u)
        y = curl * sin(u * 6 + ph) * (0.5 + v) + 0.01 * sin(v * 9 + u * 4)
        return (x, y, z)
    m.grid_sheet(fn, 8, 5, mat, trans(*c) @ roty(ang), smooth=60.0)


def helmet(sc=1.0, goggles=True, headset=True):
    """Padded tank-crew helmet with headset ear cups and goggles pushed up on the forehead. Origin = head centre
    (the shell rim is at z = -0.1 r). Faces +x, near side -y."""
    m = Mesh('helmet')
    r = 0.105 * sc
    kx = 1.16                                     # shell is longer front to back than wide

    def rho(z):
        t = z / (1.05 * r)
        return 1.02 * r * sqrt(max(0.0, 1.0 - t * t))
    zs = [-0.10 * r, 0.0, 0.2 * r, 0.4 * r, 0.6 * r, 0.8 * r, 0.93 * r, 1.0 * r, 1.045 * r]
    m.lathe([(z, rho(z)) for z in zs] + [(1.05 * r, 0.0)], 'cloth_dark', mx=scale(kx, 1.0, 1.0), seg=26, smooth=70, cap=False)
    # padded crown: three arched ribs front to back
    for y0 in (-0.5 * r, 0.0, 0.5 * r):
        k = sqrt(max(0.01, 1.0 - (y0 / (1.02 * r)) ** 2))
        ax, az = kx * 1.02 * r * k + 0.004, 1.05 * r * k + 0.004
        pts = [(ax * sin(a), y0, az * cos(a) - 0.0) for a in [-1.35 + 2.7 * i / 14 for i in range(15)]]
        m.tube(pts, 0.018 * r, 'cloth', seg=6, smooth=70, cap=False)
    # brow band and a strap under the brim
    m.lathe([(-0.1 * r, rho(-0.1 * r) + 0.002), (-0.1 * r, rho(0.0) + 0.012), (0.12 * r, rho(0.12 * r) + 0.012), (0.12 * r, rho(0.12 * r) + 0.002)],
            'cloth', mx=scale(kx, 1.0, 1.0), seg=26, smooth=60, cap=False)
    # brim at the front and a neck guard at the back
    m.slab([(0.9 * r, 0.22 * r), (1.55 * r, 0.14 * r), (1.62 * r, 0.26 * r), (0.95 * r, 0.42 * r)], -0.92 * r, 0.92 * r, 'cloth_dark', bevel=0.004)
    m.slab([(-1.12 * r, -0.50 * r), (-0.78 * r, -0.50 * r), (-0.92 * r, 0.30 * r), (-1.24 * r, 0.28 * r)], -0.86 * r, 0.86 * r, 'cloth_dark', bevel=0.004)
    if headset:
        for yy in (-1, 1):
            m.cyl((0.06 * r, yy * 0.96 * r, 0.1 * r), (0.06 * r, yy * 1.5 * r, 0.1 * r), 0.60 * r, 0.54 * r, 'steel_dark', seg=18, smooth=40, bevel=0.003)
            m.cyl((0.06 * r, yy * 1.5 * r, 0.1 * r), (0.06 * r, yy * 1.64 * r, 0.1 * r), 0.44 * r, 0.42 * r, 'rubber_new', seg=18, smooth=40)
        m.tube([(0.1 * r, -1.55 * r, -0.2 * r), (0.5 * r, -1.55 * r, -0.62 * r), (0.95 * r, -1.2 * r, -0.85 * r), (1.15 * r, -0.7 * r, -0.85 * r)],
               0.05 * r, 'steel_dark', seg=6)
        m.sphere((1.2 * r, -0.62 * r, -0.85 * r), 0.17 * r, 'rubber_new', seg=8)
    if goggles:
        # goggles pushed up on the forehead: frame, two lenses, strap round the shell
        zb = 0.50 * r
        m.lathe([(zb - 0.12 * r, rho(zb - 0.12 * r) + 0.003), (zb - 0.12 * r, rho(zb) + 0.014), (zb + 0.14 * r, rho(zb + 0.14 * r) + 0.014), (zb + 0.14 * r, rho(zb + 0.14 * r) + 0.003)],
                'strap', mx=scale(kx, 1.0, 1.0), seg=26, smooth=60, cap=False)
        tilt = at_xz(0, 0, 0.55)
        for yy in (-0.5, 0.5):
            base = Vector((kx * rho(zb) * 0.99, yy * r, zb))
            m.cyl(tuple(base), tuple(base + Vector((0.26 * r * cos(0.5), 0.0, 0.26 * r * sin(0.5)))), 0.36 * r, 0.33 * r, 'goggle', seg=16, smooth=40)
            e = base + Vector((0.26 * r * cos(0.5), 0.0, 0.26 * r * sin(0.5)))
            m.cyl(tuple(e), tuple(e + Vector((0.025 * r * cos(0.5), 0.0, 0.025 * r * sin(0.5)))), 0.29 * r, 0.29 * r, 'glass', seg=16, smooth=0)
        m.box(kx * rho(zb) - 0.05 * r, kx * rho(zb) + 0.2 * r, -0.2 * r, 0.2 * r, zb - 0.1 * r, zb + 0.2 * r, 'rubber_new', bevel=0.004)
    return m


def commander(sc=1.0):
    """Tank commander, waist up, standing in the hatch. Origin at the waist, centre of the body; faces +x, near side -y."""
    m = Mesh('commander')
    s = sc
    b = Mesh('body')
    # belt and torso: padded olive coverall
    b.lathe([(-0.02 * s, 0.150 * s), (-0.02 * s, 0.185 * s), (0.04 * s, 0.19 * s), (0.08 * s, 0.185 * s), (0.08 * s, 0.15 * s)], 'strap', mx=scale(0.9, 1.35, 1.0), seg=22, smooth=40, cap=True)
    b.sphere((0.0, 0.0, 0.27 * s), 0.30 * s, 'cloth', seg=24, sc=(0.52 * s, 0.76 * s, 0.98 * s), smooth=70)
    # chest rig: pouches, cross straps, a map pocket
    b.box(0.095 * s, 0.17 * s, -0.17 * s, 0.17 * s, 0.17 * s, 0.35 * s, 'cloth_dark', bevel=0.012)
    for yy in (-0.095, 0.0, 0.095):
        b.box(0.17 * s, 0.205 * s, yy * s - 0.04 * s, yy * s + 0.04 * s, 0.20 * s, 0.27 * s, 'cloth_dark', bevel=0.01)
        b.box(0.197 * s, 0.21 * s, yy * s - 0.03 * s, yy * s + 0.03 * s, 0.255 * s, 0.267 * s, 'strap', bevel=0.003)
    b.box(0.14 * s, 0.18 * s, -0.14 * s, 0.14 * s, 0.34 * s, 0.36 * s, 'strap')
    b.tube([Vector((0.0, -0.17 * s, 0.07 * s)), Vector((0.1 * s, -0.17 * s, 0.30 * s)), Vector((0.12 * s, -0.12 * s, 0.50 * s))], 0.022 * s, 'strap', seg=6, smooth=60)
    # binoculars on the chest
    for yy in (-0.045, 0.045):
        b.cyl((0.18 * s, yy * s, 0.12 * s), (0.22 * s, yy * s, 0.285 * s), 0.036 * s, 0.040 * s, 'steel_dark', seg=10)
        b.cyl((0.22 * s, yy * s, 0.285 * s), (0.223 * s, yy * s, 0.292 * s), 0.028 * s, 0.028 * s, 'optic', seg=10, smooth=0)
    # shoulders, neck, collar
    for yy in (-0.215, 0.215):
        b.sphere((0.0, yy * s, 0.495 * s), 0.08 * s, 'cloth', seg=14, sc=(1.0, 1.0, 0.8))
    b.cyl((0.01 * s, 0.0, 0.52 * s), (0.03 * s, 0.0, 0.62 * s), 0.054 * s, 0.05 * s, 'skin', seg=14)
    b.cyl((0.0, 0.0, 0.50 * s), (0.02 * s, 0.0, 0.57 * s), 0.09 * s, 0.075 * s, 'cloth_dark', seg=18, smooth=40)
    # head: ellipsoid, nose, chin, near ear and a hint of the face
    hx, hz = 0.05 * s, 0.685 * s
    b.sphere((hx, 0.0, hz), 0.095 * s, 'skin', seg=20, sc=(1.08, 0.92, 1.12), smooth=80)
    b.sphere((hx + 0.098 * s, 0.0, hz - 0.012 * s), 0.025 * s, 'skin', seg=10, sc=(1.1, 0.8, 1.2))
    b.sphere((hx + 0.075 * s, 0.0, hz - 0.082 * s), 0.042 * s, 'skin', seg=10, sc=(1.0, 1.0, 0.8))
    b.box(hx + 0.074 * s, hx + 0.112 * s, -0.045 * s, 0.045 * s, hz + 0.018 * s, hz + 0.030 * s, 'cloth_dark', bevel=0.002)      # brow in shadow
    b.sphere((hx + 0.06 * s, -0.090 * s, hz - 0.01 * s), 0.025 * s, 'skin', seg=8, sc=(0.8, 0.5, 1.2))
    b.add(helmet(0.92 * s), trans(hx - 0.004 * s, 0.0, hz + 0.045 * s))
    m.add(b, at_xz(0, 0, -0.06))
    # near arm: upper arm from the shoulder, elbow on the hatch rim, forearm forward, glove
    sh = Vector((0.0, -0.215 * s, 0.50 * s))
    el = Vector((0.08 * s, -0.275 * s, 0.215 * s))
    hd = Vector((0.31 * s, -0.20 * s, 0.14 * s))
    m.tube([sh, (sh + el) * 0.5 + Vector((0.0, -0.02 * s, 0.0)), el], [0.064 * s, 0.059 * s, 0.054 * s], 'cloth', seg=14, smooth=70)
    m.sphere(tuple(el), 0.058 * s, 'cloth', seg=12, smooth=80)
    m.tube([el, (el + hd) * 0.5, hd], [0.054 * s, 0.049 * s, 0.042 * s], 'cloth', seg=14, smooth=70)
    m.cyl(tuple(hd - Vector((0.012 * s, 0, 0))), tuple(hd + Vector((0.012 * s, 0, 0))), 0.048 * s, 0.048 * s, 'strap', seg=14)
    m.sphere(tuple(hd + Vector((0.04 * s, 0.0, -0.008 * s))), 0.048 * s, 'leather', seg=12, sc=(1.4, 0.85, 0.8), smooth=70)
    return m


def boot(sc=1.0):
    """A combat boot lying on its side, toe to +x, torn off above the ankle. Origin near the centre."""
    m = Mesh('boot')
    s = sc
    m.slab([(-0.14 * s, -0.05 * s), (0.15 * s, -0.05 * s), (0.17 * s, -0.035 * s), (0.17 * s, -0.01 * s), (0.15 * s, 0.0), (-0.14 * s, 0.0)],
           -0.05 * s, 0.05 * s, 'rubber_new', bevel=0.006)
    m.box(-0.14 * s, -0.07 * s, -0.052 * s, 0.052 * s, 0.0, 0.032 * s, 'rubber_new', bevel=0.005)
    for i in range(7):
        x = -0.12 * s + i * 0.04 * s
        m.box(x, x + 0.018 * s, -0.052 * s, 0.052 * s, -0.062 * s, -0.05 * s, 'rubber_new')
    m.sphere((0.08 * s, 0.0, 0.035 * s), 0.07 * s, 'leather', seg=14, sc=(1.4, 0.9, 0.62), smooth=70)
    m.sphere((-0.02 * s, 0.0, 0.05 * s), 0.07 * s, 'leather', seg=14, sc=(1.5, 0.95, 0.9), smooth=70)
    shaft = Mesh('shaft')
    shaft.lathe([(0.0, 0.064 * s), (0.08 * s, 0.064 * s), (0.17 * s, 0.058 * s), (0.20 * s, 0.054 * s)], 'leather', seg=14, smooth=60, cap=False)
    m.add(shaft, trans(-0.075 * s, 0.0, 0.03 * s) @ roty(-0.15))
    m.cyl((-0.1 * s, 0.0, 0.17 * s), (-0.125 * s, 0.0, 0.225 * s), 0.074 * s, 0.066 * s, 'cloth', seg=14, smooth=70, cap=False)
    for i in range(5):
        z = 0.055 * s + i * 0.027 * s
        x = 0.02 * s - i * 0.017 * s
        m.cyl((x, -0.062 * s, z), (x, 0.062 * s, z), 0.006 * s, 0.006 * s, 'strap', seg=5, smooth=0)
    m.sphere((-0.12 * s, 0.0, 0.225 * s), 0.058 * s, 'flesh', seg=12, sc=(0.8, 1.0, 0.7))
    m.cyl((-0.12 * s, 0.0, 0.225 * s), (-0.132 * s, 0.0, 0.265 * s), 0.018 * s, 0.014 * s, 'bone', seg=8)
    blob(m, (-0.115 * s, 0.01 * s, 0.215 * s), 0.07 * s, 21, 'flesh', sc=(0.9, 0.9, 0.7), rough=0.4, subdiv=2)
    shred(m, (-0.11 * s, -0.06 * s, 0.2 * s), 0.12 * s, 0.10 * s, 5, 'cloth', ang=0.5)
    return m


CHUNKS = [
    # (seed, size, scale, rough, cloth shreds)
    (3, 0.34, (1.0, 0.75, 0.6), 0.42, 2),
    (8, 0.26, (1.0, 0.8, 0.72), 0.36, 0),
    (14, 0.19, (0.9, 0.8, 0.8), 0.40, 1),
    (21, 0.13, (1.0, 0.7, 0.7), 0.33, 0),
]


def chunk(i):
    seed, size, sc, rough, shreds = CHUNKS[i]
    m = Mesh('chunk')
    blob(m, (0, 0, 0), size, seed, 'flesh', sc=sc, rough=rough, subdiv=3)
    rnd = random.Random(seed + 100)
    for k in range(3):
        a = rnd.uniform(0, 2 * pi)
        blob(m, (cos(a) * size * 0.25, rnd.uniform(-0.04, 0.04) * size - 0.02, sin(a) * size * 0.18), size * rnd.uniform(0.35, 0.5), seed + k + 1,
             'flesh_pale' if k == 1 else 'flesh', sc=(1, 0.8, 0.7), rough=0.35, subdiv=2)
    if i == 0:
        m.cyl((size * 0.25, -0.05, size * 0.1), (size * 0.5, -0.06, size * 0.2), 0.012, 0.009, 'bone', seg=7)
    for k in range(shreds):
        shred(m, (rnd.uniform(-0.3, 0.3) * size, -size * 0.28, rnd.uniform(-0.2, 0.3) * size), size * 0.75, size * 0.45, seed + 30 + k, 'cloth', ang=rnd.uniform(-0.8, 0.8))
    return m
