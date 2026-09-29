"""Beach props: sandcastle, bucket, spade, shell-scallop, shell-spiral, shell-cockle, starfish (Blender, headless; see props.py).
Millimetres, origin at the middle of the base, front = -Y."""
import math
from math import pi, sin, cos, atan2, sqrt, exp, radians, acos
from mathutils import Vector, Matrix
import bmesh
import lib
import plib
from plib import add, srgb, mixc, scale_c, paint, fn_hash, lerp, smooth, assemble, toy_mat


# ============================================================================================ bucket

def bucket():
    mats = [toy_mat('toy-blue', 0x1265d6, rough=0.30, coat=0.6, coat_rough=0.10, sheen=0.0)]
    H = 128.0          # wall height (rim on top of it)
    r_foot, r_top = 48.5, 61.5
    wall_t = 2.6

    def wall_r(z):
        r = lerp(r_foot, r_top, (z - 8.0) / (H - 8.0))
        for zc in (46.0, 86.0):  # two moulded ribs round the bucket
            r += 1.9 * exp(-((z - zc) / 3.6) ** 2)
        return r
    zs = [8, 14, 22, 30, 37, 42, 45, 47.5, 50, 53, 58, 66, 74, 82, 85, 87.5, 90, 93, 98, 106, 114, 122, H]
    foot = lib.fillet_path([(2.6, 0.0), (2.6, 28.0), (0.0, 33.0), (0.0, 45.0), (10.0, wall_r(8.0))], [0, 0, 2.0, 3.6, 0], 4)
    outer = foot + [(z, wall_r(z)) for z in zs[1:]]
    rim = lib.fillet_path([(H, r_top), (H + 1.2, r_top + 3.6), (H + 13.0, r_top + 4.2), (H + 14.5, r_top + 1.6), (H + 14.5, r_top - wall_t - 1.0)],
                          [0, 3.0, 3.0, 2.0, 0], 4)
    inner = [(H + 10.0, r_top - wall_t)] + [(z, wall_r(z) - wall_t) for z in reversed(zs[1:])][1:] + [(7.0, wall_r(8.0) - wall_t - 1.0), (5.0, 40.0), (5.0, 0.0)]
    prof = outer[:-1] + rim + inner
    body = lib.lathe(prof, 44, (0, 0, 0), (0, 0, 1), 0, up=(1, 0, 0))
    # two little ears on the rim, and the handle: a strap swinging about the ears, leaning back
    zr = H + 7.0
    for sx in (1, -1):
        add(body, lib.cylinder((sx * 60.0, 0, zr), (sx * 72.0, 0, zr), 6.4, 6.4, 18, 0, bevel=1.4, seg=2))
    arc = []
    n = 26
    for k in range(n + 1):
        a = pi * k / n
        arc.append((-66.0 * cos(a), 0.0, zr + 66.0 * sin(a)))
    h = plib.tube_rect(arc, 9.5, 6.0, 0, bevel=1.7, up=(0, 1, 0))
    lib.xform(h, Matrix.Translation((0, 0, zr)) @ Matrix.Rotation(radians(-48), 4, 'X') @ Matrix.Translation((0, 0, -zr)))
    add(body, h)

    def col(co, n, mi):
        r = math.hypot(co.x, co.y)
        inward = (n.x * co.x + n.y * co.y) < -0.15 * max(r, 1.0) * max(1e-3, math.hypot(n.x, n.y))
        if inward and co.z < H + 4:  # inside the bucket: darker towards the bottom (ambient occlusion)
            k = 0.5 + 0.5 * smooth(co.z / 120.0)
            return (k, k, k)
        return (1.0, 1.0, 1.0)
    paint(body, col)
    return assemble('bucket', {'body': body}, mats)


# ============================================================================================ spade

def spade():
    mats = [toy_mat('toy-red', 0xdc1f16, rough=0.30, coat=0.6, coat_rough=0.10, sheen=0.0)]
    BL = 104.0  # blade length

    def half_w(z):
        if z < 34.0:
            t = (34.0 - z) / 34.0
            return 41.0 * (1.0 - t ** 2.6) ** (1 / 2.6)
        if z < 64.0:
            return 41.0
        return lerp(41.0, 9.5, smooth((z - 64.0) / (BL - 64.0)))

    def depth(z):
        return 8.5 * (1.0 - smooth((z - 46.0) / 56.0))

    def surf(u, v):
        z = v * BL
        uu = 2 * u - 1
        x = uu * half_w(z)
        lip = 3.0 * smooth((abs(uu) - 0.80) / 0.2) * (1.0 - smooth((z - 60.0) / 30.0))          # the rim of the dish rises towards the camera
        lip += 3.0 * smooth((0.16 - v) / 0.16) * (1.0 - abs(uu) ** 3)
        return Vector((x, depth(z) * (1 - uu ** 2) - lip, z))
    blade = plib.solid_from_grid(surf, 24, 32, 3.4, 0)
    lib.bevel_bm(blade, 0.6, 1, 60.0)
    body = lib.bm_new()
    add(body, blade)
    # the socket: a wedge that grows out of the blade into the shaft, then the shaft and the D handle
    add(body, lib.box(28, 9, 62, (0, -1.0, 88.0), taper=(0.55, 1.4), mat=0, bevel=3.0, seg=2))
    add(body, lib.box(15, 13, 118, (0, -2.5, 148.0), mat=0, bevel=3.4, seg=3))
    outer = plib.rounded_outline(0, 226.0, 64, 58, 23, 6)
    inner = plib.rounded_outline(0, 226.0, 34, 24, 9, 6)
    add(body, plib.frame_xz(outer, inner, -8.0, 4.0, 0, bevel=2.6))
    lib.translate(body, 0, 0, 0)
    paint(body, lambda co, n, mi: (1.0, 1.0, 1.0))
    return assemble('spade', {'body': body}, mats)


# ============================================================================================ shells

SHELL_MAT = dict(rough=0.36, coat=0.8, coat_rough=0.14, sheen=0.25, sheen_rough=0.4)


def shell_mat():
    return plib.make_mat('shell', 0xf4e2d2, **SHELL_MAT)


def shell_scallop():
    R = 25.0
    N = 13
    TH = 62.0   # half the opening angle of the fan, degrees

    def fn(u, v):
        th = radians(-TH + 2 * TH * u)
        rip = cos(2 * pi * N * u)
        rr = R * v * (1.0 - 0.022 * (1.0 - rip) * smooth(v * 2.0)) * (1.0 - 0.10 * (2 * u - 1) ** 2)
        z = 10.5 * (1.0 - v ** 1.6) ** 0.8 * (1.0 - 0.38 * (2 * u - 1) ** 2)
        z += 0.6 * rip * smooth(v * 3.0) * (0.3 + 0.7 * v) + 0.25 * cos(2 * pi * 9 * v) * v
        return Vector((rr * sin(th), rr * cos(th), z))
    bm = plib.solid_from_grid(fn, 104, 16, 1.5, 0)

    def col(co, n, mi):
        r = math.hypot(co.x, co.y) / R
        th = atan2(co.x, co.y)
        band = 0.5 + 0.5 * sin(2 * pi * (r * 3.0) + 0.6)
        rib = 0.5 + 0.5 * cos(2 * pi * N * (th + radians(TH)) / radians(2 * TH) * 0.5)
        c = mixc((0.99, 0.90, 0.78), (0.90, 0.48, 0.44), 0.9 * band * (0.35 + 0.65 * rib) + 0.15 * r)
        return (c[0], c[1], c[2])
    paint(bm, col)
    # it stands on its hinge, leaning back against the sand, the domed side to the camera
    lib.xform(bm, Matrix.Rotation(radians(-8), 4, 'Z') @ Matrix.Rotation(radians(56), 4, 'X'))
    plib.sink_to_ground(bm, 0.6)
    return assemble('shell-scallop', {'body': bm}, [shell_mat()], sharp=75.0)


def shell_cockle():
    Rx, Ry = 18.0, 15.5
    N = 15

    def top(u, v):
        ph = 2 * pi * u
        rho = 1.0 + 0.028 * cos(ph * N) * smooth(v * 2.0) + 0.07 * max(0.0, sin(ph)) ** 5
        x = Rx * rho * v * cos(ph)
        y = Ry * rho * v * sin(ph) + 3.0 * (1.0 - v) ** 1.5
        z = 12.0 * (1.0 - v ** 2.0) ** 0.6 * (1.0 + 0.06 * sin(ph))
        z += 0.55 * cos(ph * N) * smooth(v * 3.0) * (0.4 + 0.6 * v) + 0.25 * cos(2 * pi * 8 * v) * v
        return Vector((x, y, z))

    def bot(u, v):
        p = top(u, v)
        return Vector((p.x * 0.985, p.y * 0.985, p.z - 1.2 - 0.3 * v))
    bm = plib.polar_solid(top, bot, 90, 16, 0)

    def col(co, n, mi):
        r = math.hypot(co.x / Rx, co.y / Ry)
        ph = atan2(co.y, co.x)
        band = 0.5 + 0.5 * sin(2 * pi * r * 3.6 + 1.4)
        streak = 0.5 + 0.5 * cos(ph * 7 + 1.0)
        c = mixc((0.99, 0.89, 0.77), (0.84, 0.50, 0.42), 0.25 + 0.65 * band * streak)
        c = mixc(c, (0.98, 0.95, 0.90), max(0.0, 0.5 - r) * 1.3)
        return (c[0], c[1], c[2])
    paint(bm, col)
    lib.xform(bm, Matrix.Rotation(radians(-10), 4, 'X') @ Matrix.Rotation(radians(20), 4, 'Z'))
    plib.sink_to_ground(bm, 0.5)
    return assemble('shell-cockle', {'body': bm}, [shell_mat()], sharp=75.0)


def shell_spiral():
    """A turret shell: a cone whose surface winds a raised thread round and round, with a flared last whorl and a rosy mouth."""
    LEN, TURNS = 34.0, 6.5
    nu, nv = 40, 78

    def rad(v, th):
        base = 0.4 + 8.2 * v ** 0.9
        phase = th - 2 * pi * TURNS * v
        thread = (0.5 + 0.5 * cos(phase)) ** 2.4
        flare = 1.0 + 0.30 * smooth((v - 0.80) / 0.20) ** 1.5
        return base * (1.0 + 0.19 * thread) * flare

    def fn(u, v):
        th = 2 * pi * u
        r = rad(v, th)
        return Vector((r * cos(th), r * sin(th), LEN * (1.0 - v)))       # the tip up, the mouth down at z = 0
    bm = plib.grid(fn, nu, nv, wrap_u=True)
    # the mouth: a slightly dished disc closing the wide end
    ring = [v for v in bm.verts if abs(v.co.z) < 1e-6]
    ring.sort(key=lambda q: atan2(q.co.y, q.co.x))
    tip = [v for v in bm.verts if abs(v.co.z - LEN) < 1e-6]
    plib.cap_rings(bm, ring, (0.0, 0.0, 0.0), 4, 0.0, 0)
    rm = max(math.hypot(v.co.x, v.co.y) for v in bm.verts if abs(v.co.z) < 1e-6)
    for v in bm.verts:                    # the mouth is a cup, not a flat plate
        if abs(v.co.z) < 1e-6:
            v.co.z += 5.5 * (1.0 - (math.hypot(v.co.x, v.co.y) / rm) ** 2) ** 0.8

    def col(co, n, mi):
        r = math.hypot(co.x, co.y)
        th = atan2(co.y, co.x)
        v = 1.0 - co.z / LEN
        phase = th - 2 * pi * TURNS * v
        thread = (0.5 + 0.5 * cos(phase)) ** 2.4
        c = mixc((0.99, 0.89, 0.76), (0.78, 0.44, 0.34), 0.7 * (1.0 - thread) * (0.55 + 0.45 * sin(9.0 * v * 6.28 * 0.3)) + 0.3 * thread)
        c = mixc(c, (0.98, 0.90, 0.84), smooth((0.25 - v) / 0.25) * 0.8)            # a pale tip
        if co.z < 6.0 and n.z > 0.15 and r < 12.0:                                    # inside the mouth, rosier and darker in the depths
            c = mixc((0.96, 0.60, 0.52), (0.62, 0.30, 0.26), smooth(1.0 - r / 10.0))
        return (c[0], c[1], c[2])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    paint(bm, col)
    # lie it on its side, tip to the left and towards the back, the mouth towards the camera and to the right
    lib.xform(bm, Matrix.Rotation(radians(-24), 4, 'Z') @ Matrix.Rotation(radians(-82), 4, 'Y') @ Matrix.Rotation(radians(22), 4, 'Z'))
    plib.sink_to_ground(bm, 0.8)
    return assemble('shell-spiral', {'body': bm}, [shell_mat()], sharp=75.0)


# ============================================================================================ starfish

def starfish():
    R = 26.0
    a0 = radians(90.0)

    def arm_of(ph):
        return (1.0 + cos(5.0 * (ph - a0))) / 2.0

    def outline(ph):
        return R * (0.22 + 0.78 * arm_of(ph) ** 3.0)

    def arm_delta(ph):
        d = (ph - a0) % (2 * pi / 5)
        return min(d, 2 * pi / 5 - d)                  # angle to the nearest arm's axis, 0 .. 36 degrees

    def top(u, v):
        ph = 2 * pi * u
        r = outline(ph) * v
        x, y = r * cos(ph), r * sin(ph)
        delta = arm_delta(ph)
        q = (r / R - 0.22) / 0.78
        dmax = pi / 5 if q <= 0 else acos(2 * min(1.0, q) ** (1 / 3.0) - 1.0) / 5.0
        t = min(1.0, delta / max(dmax, 1e-4))          # how far across the arm this point is (0 on the ridge, 1 at the edge)
        Hc = 8.6 * (1.0 - min(1.0, r / R) ** 1.7)      # the ridge is highest at the heart and sinks towards the tip
        z = 0.8 + Hc * (1.0 - t ** 2.0) ** 0.55 + 1.5 * (r / R) ** 3 * (1.0 - t)   # the tips curl up a little
        d = delta * r                                   # distance from the ridge line (mm)
        for rr in (6.5, 10.5, 14.5, 18.5, 22.5):
            if abs(r - rr) < 4.0:
                z += 0.9 * exp(-(((r - rr) / 1.5) ** 2 + (d / 1.4) ** 2))
        return Vector((x, y, z))

    def bot(u, v):
        p = top(u, v)
        return Vector((p.x, p.y, 0.0 if v < 0.98 else 0.3))
    bm = plib.polar_solid(top, bot, 80, 18, 0)

    def col(co, n, mi):
        r = math.hypot(co.x, co.y)
        ph = atan2(co.y, co.x)
        d = abs(sin(2.5 * (ph - a0))) * r
        c = mixc((0.95, 0.46, 0.16), (1.0, 0.68, 0.30), smooth(1.0 - d / 3.0) * 0.6)  # a pale line down every arm
        for rr in (6.5, 10.5, 14.5, 18.5, 22.5):
            if abs(r - rr) < 2.8:
                c = mixc(c, (1.0, 0.85, 0.55), exp(-(((r - rr) / 1.4) ** 2 + (d / 1.6) ** 2)))
        c = mixc(c, (0.78, 0.30, 0.13), smooth(1.0 - r / 12.0) * 0.5)  # a deeper heart
        return (c[0], c[1], c[2])
    paint(bm, col)
    plib.sink_to_ground(bm, 0.3)
    return assemble('starfish', {'body': bm}, [plib.make_mat('starfish', 0xf07a2c, rough=0.6, coat=0.15, coat_rough=0.3, sheen=0.0)], sharp=85.0)


# ============================================================================================ sandcastle

def sand_tower(cx, cy, r0, r1, h, z0=8.0, merlons=7, rot=0.0):
    """A bucket-moulded tower: slightly tapered, a flared foot, the line where the bucket was lifted, a well in the top and merlons."""
    bm = lib.bm_new()
    zt = z0 + h

    def rad(z):
        t = (z - z0) / h
        r = lerp(r0, r1, t)
        r += 8.0 * exp(-((z - z0) / 7.0) ** 2)
        r -= 1.6 * exp(-(((z - (z0 + h * 0.6)) / 2.4) ** 2))
        return r
    nz = max(8, int(h / 8.0))
    zs = [z0 + h * k / nz for k in range(nz + 1)]
    prof = [(z0 - 6.0, 0.0), (z0 - 6.0, r0 + 12.0)] + [(z, rad(z)) for z in zs] + \
           [(zt + 1.2, r1 - 2.0), (zt + 1.7, r1 - 4.5), (zt + 1.7, r1 - 13.0), (zt - 7.0, r1 - 14.0), (zt - 7.0, 0.0)]
    segs = max(26, int(2 * pi * r0 / 6.8))
    add(bm, lib.lathe(prof, segs, (0, 0, 0), (0, 0, 1), 0, up=(1, 0, 0)))
    rm = r1 - 7.0
    mw = 2 * pi * rm / (2 * merlons) * 0.95
    for k in range(merlons):
        a = 2 * pi * k / merlons + rot
        m = lib.box(11.0, mw, 15.0, (rm, 0, zt + 1.5 + 5.0), mat=0, bevel=2.4, seg=1)
        lib.xform(m, Matrix.Rotation(a, 4, 'Z'))
        add(bm, m)
    lib.translate(bm, cx, cy, 0)
    return bm


def sand_wall(x0, x1, y0, y1, h, gate_c, gate_w, gate_h):
    """The curtain wall: a dense block with the gate arch cut through it, merlons along the top."""
    L, T = x1 - x0, y1 - y0
    wall = plib.grid_box(L, T, h + 8.0, 8.5, ((x0 + x1) / 2, (y0 + y1) / 2, (h - 8.0) / 2), 0)
    zc = gate_h - gate_w / 2
    cut = lib.box(gate_w, T + 12.0, zc + 10.0, (gate_c, (y0 + y1) / 2, (zc - 10.0) / 2 - 4.0), mat=0)
    cyl = lib.cylinder((gate_c, y0 - 6.0, zc), (gate_c, y1 + 6.0, zc), gate_w / 2, gate_w / 2, 28, 0)
    hole = plib.boolean(cut, cyl, 'UNION')
    wall = plib.boolean(wall, hole, 'DIFFERENCE')
    lib.bevel_bm(wall, 2.6, 2, 35.0)
    ym = (y0 + y1) / 2
    n = int((L - 16.0) // 30.0)
    xs = x0 + (L - (n - 1) * 30.0) / 2
    for k in range(n):
        m = lib.box(17.0, T - 6.0, 13.0, (xs + 30.0 * k, ym, h + 5.0), mat=0, bevel=2.4, seg=1)
        add(wall, m)
    return wall


def sandcastle():
    mats = [plib.make_mat('sand-wet', 0xa8763f, rough=0.95, spec=0.2),
            plib.make_mat('flag', 0xe3261d, rough=0.5, coat=0.25, coat_rough=0.2),
            plib.make_mat('pole', 0xe9d7b0, rough=0.5, coat=0.2, coat_rough=0.2)]
    body = lib.bm_new()
    # the mound the castle stands on: a low, rough heap that runs out into the beach
    mound = lib.lathe([(-4.0, 0.0), (-4.0, 152.0), (1.0, 145.0), (7.0, 126.0), (11.0, 92.0), (13.0, 56.0), (14.0, 0.0)], 64, (0, 0, 0), (0, 0, 1), 0, up=(1, 0, 0))
    lib.xform(mound, Matrix.Diagonal((1.0, 0.72, 1.0, 1.0)))
    plib.subdiv_to(mound, 11.0)
    lib.translate(mound, -4.0, 6.0, 0)
    add(body, mound)
    keep = sand_tower(-32.0, 30.0, 55.0, 46.0, 178.0, merlons=7, rot=0.3)
    add(body, keep)
    add(body, sand_tower(94.0, -28.0, 42.0, 35.0, 118.0, merlons=6, rot=0.1))
    add(body, sand_tower(-116.0, -40.0, 31.0, 26.0, 84.0, merlons=5, rot=0.6))
    add(body, sand_wall(-104.0, 76.0, -72.0, -50.0, 58.0, -12.0, 44.0, 46.0))
    plib.displace(body, 2.6, 40.0, seed=3, octaves=2)
    plib.displace(body, 1.2, 13.0, seed=7, octaves=3)
    plib.displace(body, 0.9, 8.0, seed=11, octaves=2, stretch=(1.0, 1.0, 0.18))       # vertical drips and slumps
    plib.uv_box(body, 2000.0, off=(0.13, 0.41))

    def col(co, n, mi):
        # wet at the foot, drier towards the tops, a little patchy, dark where the gate goes through the wall
        k = 0.66 + 0.34 * smooth(co.z / 90.0)
        k *= 0.93 + 0.07 * plib.noise.noise(Vector((co.x, co.y, co.z)) / 11.0)
        if co.z < 14 and n.z > 0.5:
            k *= 0.88
        if -72.0 < co.y < -50.0 and -34.0 < co.x < 10.0 and co.z < 47.0 and abs(n.y) < 0.6 and n.z < 0.6:
            k *= 0.55
        return (k, k, k)
    paint(body, col)
    # the flag on the tallest tower: a stick, a knob and a wavy red pennant
    flag = lib.bm_new()
    fx, fy = -32.0 + 6.0, 30.0
    ztop = 8.0 + 178.0 + 4.0
    add(flag, lib.cylinder((fx, fy, ztop - 8.0), (fx, fy, 272.0), 2.2, 1.9, 12, 2))
    add(flag, lib.ellipsoid(3.4, 3.4, 3.4, (fx, fy, 275.0), 12, 8, 2))

    def pen(u, v):
        hh = 11.5 * (1.0 - u ** 1.2)
        zc = 262.0 - 4.0 * u
        return Vector((fx + 2.0 + 50.0 * u, fy + 3.2 * sin(2 * pi * 1.1 * u + 0.6) * min(1.0, u * 3.0), zc + (v - 0.5) * 2 * hh))
    pn = plib.solid_from_grid(pen, 14, 5, 1.3, 1)
    add(flag, pn)
    paint(flag, lambda co, n, mi: (1.0, 1.0, 1.0))
    return assemble('sandcastle', {'body': body, 'flag': flag}, mats, uv=('body',), sharp=55.0)


BUILDERS = {'sandcastle': sandcastle, 'bucket': bucket, 'spade': spade, 'shell-scallop': shell_scallop, 'shell-cockle': shell_cockle, 'shell-spiral': shell_spiral, 'starfish': starfish}
