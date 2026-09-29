"""Garden props: watering-can, fence, flowerpot (Blender, headless; see props.py).
Millimetres, origin at the middle of the base, front = -Y."""
import math
from math import pi, sin, cos, atan2, sqrt, exp, radians
from mathutils import Vector, Matrix
import bmesh
import lib
import plib
from plib import add, srgb, mixc, scale_c, paint, fn_hash, lerp, smooth, assemble, toy_mat


# ============================================================================================ watering can

def watering_can():
    ZINC, DARK = 0, 1
    mats = [plib.make_mat('zinc', 0xc4cbd0, rough=0.40, metal=1.0), plib.make_mat('dark', 0x0e1012, rough=0.7)]
    H = 128.0

    def wall_r(z):
        r = lerp(62.0, 55.0, (z - 6.0) / (H - 6.0 - 10.0))
        r += 2.4 * exp(-((z - 12.0) / 2.8) ** 2) + 2.4 * exp(-((z - 108.0) / 2.8) ** 2)   # the rolled seams
        return r
    zs = [6, 9, 12, 15, 20, 30, 45, 60, 75, 90, 100, 105, 108, 111, 116]
    prof = lib.fillet_path([(0.0, 0.0), (0.0, 52.0), (4.0, 61.5)], [0, 4.0, 0], 4)[:-1]
    prof += [(z, wall_r(z)) for z in zs]
    prof += lib.fillet_path([(116.0, wall_r(116.0)), (126.0, 53.0), (133.0, 42.0), (141.0, 37.5), (143.5, 36.0), (143.5, 32.0), (139.0, 31.0)], [0, 5.0, 6.0, 2.0, 1.4, 0.8, 0], 4)[1:]
    prof += [(139.0, 0.0)]
    body = lib.lathe(prof, 44, (0, 0, 0), (0, 0, 1), ZINC, up=(1, 0, 0))
    # the spout: leaves the body low at the front left, climbs left and up, ends in a rose (a flared cap with holes)
    ang = radians(41.0)
    a = Vector((-cos(ang), 0.0, sin(ang)))
    p0 = Vector((-36.0, 0.0, 26.0))
    L = 168.0
    p1 = p0 + a * L
    add(body, lib.cylinder(p0, p1, 14.0, 7.6, 24, ZINC))
    add(body, lib.torus(11.0, 3.0, p0 + a * 22.0, tuple(a), 24, 8, ZINC))         # a collar where it leaves the can
    r0 = 8.4
    add(body, lib.lathe([(0.0, r0), (5.0, r0 + 1.0), (21.0, 23.5), (25.0, 25.5), (29.0, 25.0), (30.0, 21.0), (30.0, 0.0)], 32, p1 - a * 4.0, tuple(a), ZINC, up=(0, 1, 0)))
    xa = Vector((0, 1, 0))
    ya = a.cross(xa).normalized()
    top = p1 - a * 4.0 + a * 30.4
    holes = [(0.0, 0.0)] + [(8.0 * cos(2 * pi * k / 6), 8.0 * sin(2 * pi * k / 6)) for k in range(6)] + [(16.5 * cos(2 * pi * (k + 0.5) / 10), 16.5 * sin(2 * pi * (k + 0.5) / 10)) for k in range(10)]
    for hx, hy in holes:
        d = lib.cylinder((0, 0, -0.6), (0, 0, 0.5), 2.2, 2.2, 10, DARK)
        lib.orient(d, xa, ya, a, top + xa * hx + ya * hy)
        add(body, d)
    # a brace from the spout to the neck
    add(body, lib.cylinder(p0 + a * 92.0, Vector((-30.0, 0.0, 128.0)), 2.6, 2.6, 8, ZINC))
    # the two handles: a big loop at the back and an arch over the top
    n = 22
    loop = [(50.0 + 66.0 * cos(radians(90.0 - 180.0 * k / n)), 0.0, 71.0 + 47.0 * sin(radians(90.0 - 180.0 * k / n))) for k in range(n + 1)]
    add(body, plib.tube_rect(loop, 22.0, 6.5, ZINC, bevel=1.8, up=(0, 1, 0)))
    arch = [(-10.0 + 50.0 * cos(radians(180.0 - 180.0 * k / n)), 0.0, 124.0 + 72.0 * sin(radians(180.0 - 180.0 * k / n))) for k in range(n + 1)]
    add(body, plib.tube_rect(arch, 20.0, 6.0, ZINC, bevel=1.8, up=(0, 1, 0)))
    lib.translate(body, 0, 0, 0)

    def col(co, n, mi):
        if mi == DARK:
            return (1.0, 1.0, 1.0)
        if co.z > 138.0 and math.hypot(co.x, co.y) < 33.0 and n.z > 0.7:
            return (0.03, 0.03, 0.03)              # down the filler neck
        k = 0.80 + 0.20 * (0.5 + 0.5 * plib.noise.noise(Vector((co.x, co.y, co.z)) / 14.0))
        if co.z < 14.0:
            k *= 0.82                              # dirt at the foot
        return (k * 0.97, k, k * 1.02)
    paint(body, col)
    return assemble('watering-can', {'body': body}, mats)


# ============================================================================================ fence

def fence():
    mats = [plib.make_mat('wood', 0x8a6a48, rough=0.85, spec=0.3)]
    body = lib.bm_new()
    PITCH, N, W, TH, H = 100.0, 10, 88.0, 18.0, 900.0
    for i in range(N):
        cx = -450.0 + PITCH * i
        h = H - 10.0 * fn_hash(i, 2.0) - (0.0 if i in (2, 6) else 6.0)
        tip = (0, 1, 0, 2, 0, 1, 0, 0, 2, 1)[i]
        if tip == 1:      # a pointed picket
            poly = [(-W / 2, 0), (W / 2, 0), (W / 2, h - 30.0), (0, h), (-W / 2, h - 30.0)]
        elif tip == 2:    # a rounded-off picket
            poly = [(-W / 2, 0), (W / 2, 0), (W / 2, h - 14.0), (W / 2 - 8.0, h - 3.0), (0, h), (-W / 2 + 8.0, h - 3.0), (-W / 2, h - 14.0)]
        else:             # flat, cut square
            poly = [(-W / 2, 0), (W / 2, 0), (W / 2, h - 4.0), (W / 2 - 4.0, h), (-W / 2 + 4.0, h), (-W / 2, h - 4.0)]
        p = lib.prism_xz(poly, -TH / 2, TH / 2, 0, bevel=2.4, seg=2, angle=25.0)
        plib.uv_wood(p, 1000.0, grain=2, seed=i * 3 + 1, slot=(i * 4 + 1) % 9)
        tilt = (fn_hash(i, 5.0) - 0.5) * radians(1.6)
        lean = (fn_hash(i, 9.0) - 0.5) * radians(1.4)
        lib.xform(p, Matrix.Translation((cx, (fn_hash(i, 4.0) - 0.5) * 3.0, -6.0)) @ Matrix.Rotation(tilt, 4, 'Y') @ Matrix.Rotation(lean, 4, 'X'))
        plib.merge(body, p)
    for k, zc in enumerate((180.0, 640.0)):
        r = lib.box(1000.0, 26.0, 46.0, (0, TH / 2 + 13.0, zc), mat=0, bevel=1.6, seg=2, angle=40.0)
        plib.uv_wood(r, 1000.0, grain=0, seed=40 + k, slot=(3 + 4 * k) % 9)
        plib.merge(body, r)

    def col(co, n, mi):
        tone = 0.72 + 0.26 * fn_hash(math.floor((co.x + 500.0) / PITCH), 7.0)   # every board a slightly different weathering
        k = tone * (0.72 + 0.28 * smooth(co.z / 260.0))
        c = mixc((1.0, 1.0, 1.0), (0.80, 0.94, 0.66), (1.0 - smooth(co.z / 120.0)) * 0.55)  # a green damp at the foot
        return (k * c[0] * 0.9, k * c[1] * 0.92, k * c[2] * 0.97)   # a little cooler and greyer than the photograph
    paint(body, col)
    return assemble('fence', {'body': body}, mats, uv=('body',))


# ============================================================================================ flowerpot

def flowerpot():
    CLAY, SOIL = 0, 1
    mats = [plib.make_mat('terracotta', 0xcf6634, rough=0.72, spec=0.35), plib.make_mat('soil', 0x40281a, rough=1.0, spec=0.1)]
    body = lib.bm_new()
    # the saucer
    sp = lib.fillet_path([(0.0, 0.0), (0.0, 60.0), (2.0, 74.0), (10.0, 80.0), (12.0, 80.0), (12.0, 76.5), (6.5, 72.0), (6.5, 0.0)], [0, 0, 4.0, 5.0, 1.0, 1.0, 3.0, 0], 4)
    add(body, lib.lathe(sp, 56, (0, 0, 0), (0, 0, 1), CLAY, up=(1, 0, 0)))

    def wall(z):
        r = lerp(45.0, 65.0, (z - 8.0) / 110.0)
        return r + 0.55 * sin(z / 5.2)              # faint throwing rings
    zs = [8 + 5.5 * k for k in range(21)]
    zs = [z for z in zs if z <= 116.0]
    prof = [(8.0, 0.0), (8.0, 40.0), (10.0, wall(10.0))]
    prof = lib.fillet_path(prof + [(z, wall(z)) for z in zs[1:]] + [(118.0, wall(118.0) - 0.5)], [0, 0, 2.5] + [0] * (len(zs) - 1) + [0], 4)
    rim = lib.fillet_path([(118.0, 64.0), (119.5, 70.5), (121.0, 72.5), (147.0, 74.8), (150.0, 73.5), (150.0, 66.5), (146.0, 65.5)], [0, 1.6, 2.0, 2.0, 2.4, 1.0, 0], 4)
    inner = [(138.0, 65.5), (138.0, 0.0)]
    body_prof = prof[:-1] + rim + inner
    add(body, lib.lathe(body_prof, 56, (0, 0, 0), (0, 0, 1), CLAY, up=(1, 0, 0)))
    lib.finish_mesh(body)
    plib.displace(body, 0.6, 22.0, seed=4, octaves=2)
    # the soil, a rough mound with a few pebbles
    soil = plib.grid(lambda u, v: Vector((v * 65.5 * cos(2 * pi * u), v * 65.5 * sin(2 * pi * u), 137.5 + 3.5 * (1 - v * v))), 48, 10, wrap_u=True, mat=SOIL)
    plib.displace(soil, 1.6, 9.0, seed=8, octaves=3)
    plib.uv_box(soil, 600.0, off=(0.31, 0.07))
    for k in range(5):
        a = 2 * pi * fn_hash(k, 1.0)
        r = 14.0 + 38.0 * fn_hash(k, 2.0)
        add(soil, lib.ellipsoid(4.0 + 3.0 * fn_hash(k, 3.0), 3.5 + 2.0 * fn_hash(k, 4.0), 2.6, (r * cos(a), r * sin(a), 140.0), 10, 6, SOIL))
    paint(soil, lambda co, n, mi: (lambda k: (k, k, k))(0.62 + 0.38 * (0.5 + 0.5 * plib.noise.noise(Vector((co.x, co.y, co.z)) / 6.0))))

    def col(co, n, mi):
        r = math.hypot(co.x, co.y)
        wet = 1.0 - smooth((co.z - 6.0) / 60.0)             # damp and darker towards the saucer
        k = 0.72 + 0.28 * smooth((co.z - 6.0) / 90.0)
        k *= 0.94 + 0.06 * plib.noise.noise(Vector((co.x, co.y, co.z)) / 10.0)
        c = mixc((1.0, 1.0, 1.0), (0.80, 0.90, 0.62), wet * 0.55 * (0.5 + 0.5 * plib.noise.noise(Vector((co.x * 0.2, co.y * 0.2, 4.0)) / 3.0)))
        if co.z > 118.0:                                     # a pale, chalky band under the rim
            c = mixc(c, (0.98, 0.92, 0.86), 0.5)
        return (k * c[0], k * c[1], k * c[2])
    paint(body, col)
    return assemble('flowerpot', {'body': body, 'soil': soil}, mats, uv=('soil',), sharp=60.0)


BUILDERS = {'watering-can': watering_can, 'fence': fence, 'flowerpot': flowerpot}
