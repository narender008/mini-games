"""Shared turret and hull detailing for the three tanks: bolted appliqué plates, sloped side panels, sight humps, grab rails,
spare track links, side bins, whip aerials, cast mantlets, tow shackles. Everything faces +x; the camera sees the near (-y) side."""
import math
from math import pi, sin, cos, hypot

from mathutils import Vector

from bl import Mesh, trans, roty, rotx, rotz, at_xz
from parts import bolt, weld_bead, toolbox


def perimeter_bolts(m, pts, y, r, mat, step=0.26, inset=0.055):
    """Bolt heads round the inside of a convex polygon (x, z) on the plane y."""
    cx = sum(p[0] for p in pts) / len(pts)
    cz = sum(p[1] for p in pts) / len(pts)
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        L = hypot(b[0] - a[0], b[1] - a[1])
        n = max(1, int(L / step))
        for k in range(n):
            u = (k + 0.5) / n
            x, z = a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u
            dx, dz = cx - x, cz - z
            d = hypot(dx, dz) or 1.0
            bolt(m, x + dx / d * inset, z + dz / d * inset, y, r, 0.012, mat)


def plate_poly(m, T, pts, ys, th=0.03, bolts=True, bolt_r=0.017, step=0.26, mat=None, mx=None):
    """A convex appliqué plate standing proud of the side at y = ys, with bevelled edges and a bolt row."""
    sub = Mesh('plate')
    sub.prism(pts, ys - th, ys + 0.004, mat or T.turret, bevel=0.008)
    if bolts:
        perimeter_bolts(sub, pts, ys - th, bolt_r, T.steel, step)
    m.add(sub, mx)


def slope_frame(HY, zs, a):
    """Matrix to a frame lying on the near-side chamfer that starts at height zs and leans inward by angle a: local x along the
    turret, local z up the slope, local -y out of the surface."""
    return trans(0, -HY, zs) @ rotx(-a)


def chamfer_cuts(HY, zs, a):
    """Body cut planes for the near and far upper side chamfer (n.p <= d)."""
    n = (0.0, -cos(a), sin(a))
    d = HY * cos(a) + zs * sin(a)
    return [(n, d), ((0.0, cos(a), sin(a)), d)]


def grab_rail(m, T, x0, x1, z, y, h=0.1, n=3, r=0.013):
    """A tubular grab rail along x, h above the surface point (z), on stanchions."""
    m.cyl((x0, y, z + h), (x1, y, z + h), r, r, T.steel, seg=8, smooth=50)
    for i in range(n):
        x = x0 + (x1 - x0) * i / (n - 1)
        m.cyl((x, y, z), (x, y, z + h), r * 0.9, r * 0.9, T.steel, seg=6, smooth=40)
    for x in (x0, x1):
        m.sphere((x, y, z + h), r * 1.3, T.steel, seg=8)


def spare_links(m, T, x, z, y, n=5, w=0.34, th=0.065, depth=0.15):
    """A stack of spare track links hung against the near side, strapped."""
    for i in range(n):
        zz = z + i * (th + 0.012)
        m.box(x, x + w, y - depth, y, zz, zz + th, T.track, bevel=0.006)
        for sx in (x + 0.02, x + w - 0.02):
            m.cyl((sx, y - depth - 0.002, zz + th / 2), (sx, y - depth - 0.02, zz + th / 2), 0.017, 0.017, T.dark, seg=8, smooth=0)
        for k in range(3):
            xx = x + w * (0.22 + k * 0.28)
            m.box(xx, xx + 0.05, y - depth - 0.012, y - depth, zz + 0.012, zz + th - 0.012, T.track, bevel=0.003)
    top = z + n * (th + 0.012)
    for sx in (x + 0.07, x + w - 0.1):
        m.box(sx, sx + 0.035, y - depth - 0.026, y - depth + 0.004, z - 0.02, top + 0.02, T.strap, bevel=0.004)
        m.box(sx - 0.005, sx + 0.04, y - depth - 0.034, y - depth - 0.02, z + 0.3 * (top - z), z + 0.3 * (top - z) + 0.04, T.steel, bevel=0.004)


def side_bin(m, T, x0, x1, z0, z1, y, d=0.26, mat=None):
    """A stowage bin on the near side: lid seam, hinges, two latches, a handle."""
    mat = mat or T.turret
    m.box(x0, x1, y - d, y, z0, z1, mat, bevel=0.012)
    zl = z0 + (z1 - z0) * 0.72
    m.box(x0 + 0.005, x1 - 0.005, y - d - 0.014, y - d + 0.002, zl - 0.006, zl + 0.006, T.dark)
    m.box(x0, x1, y - d - 0.01, y - d, zl, z1, mat, bevel=0.008)
    for xx in (x0 + (x1 - x0) * 0.25, x0 + (x1 - x0) * 0.75):
        m.box(xx - 0.025, xx + 0.025, y - d - 0.03, y - d - 0.01, zl - 0.045, zl + 0.03, T.steel, bevel=0.006)
        m.cyl((xx, y - d - 0.032, zl - 0.01), (xx, y - d - 0.045, zl - 0.01), 0.011, 0.011, T.dark, seg=6, smooth=0)
    for xx in (x0 + 0.06, x1 - 0.06):
        m.box(xx - 0.02, xx + 0.02, y - d - 0.02, y - d, zl + 0.03, zl + 0.07, T.dark, bevel=0.004)
    xm = (x0 + x1) / 2
    m.tube([(xm - 0.07, y - d - 0.01, z0 + (zl - z0) * 0.5), (xm - 0.07, y - d - 0.05, z0 + (zl - z0) * 0.5), (xm + 0.07, y - d - 0.05, z0 + (zl - z0) * 0.5), (xm + 0.07, y - d - 0.01, z0 + (zl - z0) * 0.5)],
           0.009, T.steel, seg=6, cap=False)
    perimeter_bolts(m, [(x0, z0), (x1, z0), (x1, zl), (x0, zl)], y - d - 0.0, 0.013, T.steel, 0.2, 0.04)


def sight_hump(m, T, x0, x1, z0, zh, y0, y1, wide=True, optic_side=True):
    """An armoured sight housing on the roof: sloped front and back, a recessed window on the front face and a sight cover."""
    m.prism([(x0, z0 - 0.02), (x1, z0 - 0.02), (x1 + 0.0, zh - 0.07), (x1 - 0.10, zh), (x0 + 0.16, zh), (x0, zh - 0.12)], y0, y1, T.turret, bevel=0.016)
    m.box(x1 - 0.015, x1 + 0.02, y0 + 0.05, y1 - 0.05, zh - 0.20, zh - 0.10, 'optic', bevel=0.004)
    m.box(x1 - 0.02, x1 + 0.03, y0 + 0.03, y1 - 0.03, zh - 0.215, zh - 0.19, T.dark, bevel=0.004)
    m.box(x1 - 0.02, x1 + 0.03, y0 + 0.03, y1 - 0.03, zh - 0.105, zh - 0.08, T.dark, bevel=0.004)
    yc = (y0 + y1) / 2
    m.box(x0 + 0.2, x0 + 0.5, yc - 0.1, yc + 0.1, zh, zh + 0.05, T.dark, bevel=0.01)       # roof sight cover
    if optic_side:
        m.box(x0 + 0.3, x0 + 0.46, y0 - 0.012, y0 + 0.004, z0 + 0.04, z0 + 0.16, T.dark, bevel=0.004)


def whip_aerial(m, T, x, y, z, h=2.0, lean=-0.12, bend=0.10):
    """A spring-based whip aerial, tapering and bent back by the wind (on a wreck: snapped short and drooping)."""
    if T.wreck:
        h, lean, bend = h * 0.34, 0.25, 0.55
    m.cyl((x, y, z), (x, y, z + 0.1), 0.045, 0.04, T.dark, seg=12)
    m.cyl((x, y, z + 0.1), (x, y, z + 0.14), 0.055, 0.05, T.steel, seg=12)
    pts, rad = [], []
    for i in range(13):
        u = i / 12
        pts.append((x + lean * h * u * u + bend * u ** 3, y, z + 0.14 + h * u))
        rad.append(0.017 * (1 - u) + 0.004 * u)
    m.tube(pts, rad, T.dark, seg=6, smooth=60)
    m.sphere(pts[-1], 0.012, T.steel, seg=6)
    # coiled spring at the base
    sp = []
    for i in range(36):
        a = i * 0.9
        sp.append((x + 0.026 * cos(a), y + 0.026 * sin(a), z + 0.14 + 0.2 * i / 35))
    m.tube(sp, 0.005, T.steel, seg=4, cap=False)


def cast_mantlet(m, T, cx, hx, hy, hz, r_gun=0.15):
    """A cast gun mantlet: an ellipsoid shell around the gun root with a raised front ring, weld flash seam and a coaxial MG port.
    Origin of the gun frame = trunnion; the mantlet is centred at x = cx."""
    to_x = roty(pi / 2)
    m.sphere((cx, 0, 0), 1.0, T.cast, seg=40, sc=(hx, hy, hz), smooth=70)
    # casting seam along the equator and a raised ring where the gun leaves the shell
    m.lathe([(cx + hx * 0.55, 0.0), (cx + hx * 0.55, hz * 0.82), (cx + hx * 0.8, hz * 0.62), (cx + hx * 0.98, r_gun * 1.25), (cx + hx * 1.0, r_gun * 1.15), (cx + hx * 1.0, 0.0)],
            T.cast, to_x, seg=36, smooth=55)
    m.lathe([(cx + hx * 0.96, r_gun * 1.1), (cx + hx * 0.96, r_gun * 1.38), (cx + hx * 1.02, r_gun * 1.36), (cx + hx * 1.02, r_gun * 1.1)], T.dark, to_x, seg=32, smooth=30, cap=False)
    # coaxial MG port with a muzzle and armoured collar, on the near side of the face
    yz = -hy * 0.92
    m.cyl((cx + hx * 0.35, yz, -hz * 0.28), (cx + hx * 0.7, yz - 0.03, -hz * 0.3), 0.055, 0.05, T.cast, seg=14, smooth=45)
    m.cyl((cx + hx * 0.7, yz - 0.03, -hz * 0.3), (cx + hx * 0.78, yz - 0.045, -hz * 0.3), 0.035, 0.03, T.dark, seg=10, smooth=0)
    # sight aperture cover on the near cheek and bolt heads on the shell face
    m.box(cx - 0.02, cx + hx * 0.55, yz - 0.012, yz + 0.01, hz * 0.18, hz * 0.45, T.dark, bevel=0.01)
    for (fx, fz) in ((-0.35, 0.62), (0.0, 0.7), (0.4, 0.62), (-0.35, -0.62), (0.0, -0.7), (0.4, -0.62)):
        xb, zb = cx + hx * fx, hz * fz
        k = 1.0 - fx * fx - fz * fz
        if k > 0.05:
            bolt(m, xb, zb, -hy * math.sqrt(k) + 0.004, 0.017, 0.012, T.steel)
    # lifting eye on top of the shell
    m.tube([(cx - hx * 0.1, -0.05, hz * 0.97), (cx - hx * 0.1, -0.05, hz * 0.97 + 0.07), (cx + hx * 0.1, -0.05, hz * 0.97 + 0.07), (cx + hx * 0.1, -0.05, hz * 0.97)], 0.014, T.steel, seg=6, cap=False)


def tow_shackle(m, T, x, y, z, ang=0.0):
    """A D-shackle with pin hanging from a lug on a vertical plate, side view."""
    mx = at_xz(x, z, ang, y=y)
    m.tube([(0.0, 0.0, 0.0), (0.05, 0.0, -0.06), (0.05, 0.0, -0.16), (0.0, 0.0, -0.22), (-0.05, 0.0, -0.16), (-0.05, 0.0, -0.06), (0.0, 0.0, 0.0)], 0.014, T.steel, seg=6, mx=mx, cap=False)
    m.cyl((0.0, -0.02, 0.0), (0.0, 0.02, 0.0), 0.02, 0.02, T.dark, seg=8, mx=mx)


def smoke_launcher(m, T, x, z, y, n=4, spacing=0.085, ang=1.0, ln=0.25, r=0.034):
    """A bank of smoke-grenade tubes in a row along x, angled up and forward, on a bracket block (the near side shows every tube)."""
    m.box(x - 0.07, x + (n - 1) * spacing + 0.09, y - 0.07, y, z - 0.07, z + 0.045, T.dark, bevel=0.008)
    for i in range(n):
        bx = x + i * spacing
        base = (bx, y - 0.07 - r, z)
        tip = (bx + cos(ang) * ln, y - 0.07 - r, z + sin(ang) * ln)
        m.cyl(base, tip, r, r, T.dark, seg=10, smooth=50)
        m.cyl(tip, (tip[0] + cos(ang) * 0.012, tip[1], tip[2] + sin(ang) * 0.012), r * 0.72, r * 0.72, 'optic', seg=10, smooth=0)
        m.cyl(base, (base[0] + cos(ang) * 0.04, base[1], base[2] + sin(ang) * 0.04), r * 1.12, r * 1.12, T.steel, seg=10, smooth=40)


def soot_smear(m, T, x, y, z, w, h, seed=0):
    """Soot staining on a near-side surface: a few flat dark lumps (skipped on wrecks, which are already burnt)."""
    from crew import blob
    if T.wreck:
        return
    import random
    rnd = random.Random(seed)
    for i in range(5):
        blob(m, (x + rnd.uniform(-0.4, 0.4) * w, y, z + rnd.uniform(-0.3, 0.3) * h), w * rnd.uniform(0.35, 0.6), seed * 7 + i, 'charred_rubber',
             sc=(1.0, 0.05, h / w * 0.8), rough=0.5, subdiv=2, smooth=50)


def hull_dressing(m, T, nose, rear, soot_at, soot_size=(0.7, 0.3)):
    """Tow shackles on the near nose and rear tow eyes, soot over the rear exhaust."""
    tow_shackle(m, T, nose[0] + 0.02, nose[1], nose[2], 0.12)
    tow_shackle(m, T, rear[0] - 0.02, rear[1], rear[2], -0.1)
    soot_smear(m, T, soot_at[0], soot_at[1], soot_at[2], soot_size[0], soot_size[1], 3)
