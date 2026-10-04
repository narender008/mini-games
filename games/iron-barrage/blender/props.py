"""Battlefield props: common, farm, desert, winter, city and ridge pieces. Ground at z = 0, origin at the bottom centre; side view.
Every builder returns a Mesh. PROPS maps frame name -> (builder, ppm)."""
import math
import random
from math import pi, sin, cos, sqrt

from mathutils import Vector, Matrix

from bl import Mesh, trans, roty, rotx, rotz, at_xz, scale
from crew import blob, shred
from parts import bolt, weld_bead


def y_to(d):
    """Matrix taking local +Y to direction d (a beam built along Y)."""
    q = Vector((0, 1, 0)).rotation_difference(Vector(d).normalized())
    return q.to_matrix().to_4x4()


def x_to(d):
    q = Vector((1, 0, 0)).rotation_difference(Vector(d).normalized())
    return q.to_matrix().to_4x4()


def rot_about(px, pz, ang):
    """Rotate in the side view by ang (CCW positive) about the world point (px, pz); for hinged lids and bent panels."""
    return at_xz(px, pz, ang) @ trans(-px, 0, -pz)


def plank(m, p0, p1, w, t, mat, y=0.0, bevel=0.006):
    """A board between two points in the XZ plane (width w across the view, thickness t along y)."""
    dx, dz = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dz)
    a = math.atan2(dz, dx)
    m.box(0, L, y - t / 2, y + t / 2, -w / 2, w / 2, mat, at_xz(p0[0], p0[1], a), bevel=bevel)


# ================================================================================================ common

def sandbags():
    m = Mesh('prop_sandbags')
    rnd = random.Random(7)
    L, H = 0.54, 0.20
    courses = [(6, 0.0, 0.10), (5, 0.27, 0.285), (5, 0.0, 0.46), (3, 0.27, 0.62)]
    for ci, (n, off, zc) in enumerate(courses):
        x0 = -1.5 + (0.27 if off else 0.0) if n >= 5 else (-0.75 + (0.27 if off else 0.0))
        for k in range(n):
            x = x0 + k * L + L / 2 + rnd.uniform(-0.02, 0.03)
            z = zc + rnd.uniform(-0.012, 0.012) - (0.02 * ci if ci > 1 else 0.0)
            mat = 'sandbag' if rnd.random() < 0.6 else 'sandbag_dark'
            blob(m, (x, -0.10 + rnd.uniform(-0.03, 0.03), z), L, rnd.randrange(1000), mat, sc=(1.0, 0.54, 0.38), rough=0.16, subdiv=2, rot=rnd.uniform(-0.05, 0.05))
            blob(m, (x, 0.18 + rnd.uniform(-0.03, 0.03), z), L, rnd.randrange(1000), mat, sc=(1.0, 0.54, 0.38), rough=0.16, subdiv=2, rot=rnd.uniform(-0.05, 0.05))
            # tied corner at one end
            e = -1 if rnd.random() < 0.5 else 1
            blob(m, (x + e * L * 0.52, -0.10, z + 0.02), 0.07, rnd.randrange(1000), mat, sc=(1.0, 0.8, 0.8), rough=0.3, subdiv=1)
    # slumped bags and spilled sand at the foot, a split bag
    for k in range(6):
        x = rnd.uniform(-1.7, 1.7)
        blob(m, (x, -0.30 + rnd.uniform(-0.05, 0.05), 0.06), 0.42, rnd.randrange(1000), 'sandbag', sc=(1.0, 0.55, 0.26), rough=0.2, subdiv=2, rot=rnd.uniform(-0.3, 0.3))
    blob(m, (1.05, -0.25, 0.03), 0.9, 5, 'sandbag', sc=(1.0, 0.8, 0.18), rough=0.3, subdiv=2)
    blob(m, (-1.3, -0.28, 0.025), 0.7, 6, 'sandbag', sc=(1.0, 0.8, 0.16), rough=0.3, subdiv=2)
    return m


def drum(kind, seed, lying=False):
    """A 200 litre oil drum: rolled rim, two recessed rolling hoops, bung and vent caps in the top."""
    d = Mesh('drum')
    R, H = 0.29, 0.88
    prof = [(0.0, R * 0.9), (0.012, R * 0.97), (0.03, R + 0.014), (0.07, R + 0.014), (0.09, R), (H * 0.27, R),
            (H * 0.29, R - 0.016), (H * 0.33, R - 0.02), (H * 0.35, R - 0.016), (H * 0.37, R),
            (H * 0.61, R), (H * 0.63, R - 0.016), (H * 0.67, R - 0.02), (H * 0.69, R - 0.016), (H * 0.71, R),
            (H - 0.09, R), (H - 0.07, R + 0.014), (H - 0.03, R + 0.014), (H - 0.012, R * 0.97), (H, R * 0.9), (H, R * 0.8), (H - 0.025, R * 0.78), (H - 0.025, 0.0)]
    d.lathe(prof, kind, None, seg=32, smooth=35)
    d.cyl((0.12, 0.05, H - 0.025), (0.12, 0.05, H + 0.012), 0.036, 0.034, 'steel_rust', seg=10)
    d.cyl((-0.1, -0.1, H - 0.025), (-0.1, -0.1, H + 0.01), 0.022, 0.02, 'steel_weather', seg=8)
    d.warp(0.01, 3.2, seed)
    return d


def drums():
    m = Mesh('prop_drums')
    m.add(drum('drum_green', 1), trans(-0.66, -0.05, 0.0))
    m.add(drum('drum_rust', 2), trans(0.0, 0.12, 0.0))
    # a green drum leaning against the rust one, and a blue one rolled away on its side
    m.add(drum('drum_green', 4), at_xz(0.6, 0.0, 0.32, y=0.28))
    m.add(drum('drum_blue', 3), trans(1.3, -0.4, 0.29) @ roty(pi / 2) @ trans(0, 0, -0.44))
    return m


def crate(w, h, d, mat='crate_olive', seed=0):
    c = Mesh('crate')
    rnd = random.Random(seed)
    c.box(-w / 2, w / 2, -d / 2, d / 2, 0, h, mat, bevel=0.012)
    # edge battens and cross-battens on the near face
    for xx in (-w / 2 + 0.03, w / 2 - 0.03):
        c.box(xx - 0.03, xx + 0.03, -d / 2 - 0.016, -d / 2 + 0.002, 0.0, h, mat, bevel=0.004)
    for zz in (0.03, h - 0.03):
        c.box(-w / 2, w / 2, -d / 2 - 0.016, -d / 2 + 0.002, zz - 0.03, zz + 0.03, mat, bevel=0.004)
    # plank seams
    for k in range(1, 3):
        zz = h * k / 3
        c.box(-w / 2 + 0.06, w / 2 - 0.06, -d / 2 - 0.004, -d / 2 + 0.002, zz - 0.004, zz + 0.004, 'steel_dark')
    # nails
    for sx in (-1, 1):
        for zz in (0.055, h - 0.055):
            bolt(c, sx * (w / 2 - 0.03), zz, -d / 2 - 0.016, 0.009, 0.006, 'steel')
    # stencilled marking and a rope handle at the end
    for r in range(2):
        x = -w * 0.28
        while x < w * 0.25:
            ln = rnd.uniform(0.04, 0.09)
            c.box(x, x + ln, -d / 2 - 0.021, -d / 2 - 0.014, h * (0.58 - r * 0.15), h * (0.58 - r * 0.15) + 0.04, 'stencil')
            x += ln + rnd.uniform(0.03, 0.05)
    c.tube([(-0.1, -d / 2 - 0.02, h * 0.42), (-0.1, -d / 2 - 0.07, h * 0.38), (0.1, -d / 2 - 0.07, h * 0.38), (0.1, -d / 2 - 0.02, h * 0.42)], 0.011, 'rope', seg=6, cap=False)
    return c


def crates():
    m = Mesh('prop_crates')
    m.add(crate(0.82, 0.40, 0.42, 'crate_olive', 1), trans(-0.46, 0.0, 0.0))
    m.add(crate(0.82, 0.40, 0.42, 'crate_olive', 2), trans(0.42, 0.04, 0.0) @ roty(0.0))
    m.add(crate(0.78, 0.36, 0.40, 'crate_olive', 3), at_xz(-0.08, 0.40, -0.03) @ trans(0, 0.0, 0.0))
    m.add(crate(0.5, 0.26, 0.28, 'crate_olive', 4), trans(1.15, -0.08, 0.0) @ roty(0.0))
    # a loose lid propped against the stack, and a steel ammo box with a latch
    plank(m, (1.36, 0.0), (0.98, 0.42), 0.035, 0.42, 'crate_olive', y=-0.3)
    ab = Mesh('ammobox')
    ab.box(-0.22, 0.22, -0.1, 0.1, 0, 0.26, 'olive', bevel=0.012)
    ab.box(-0.23, 0.23, -0.108, 0.108, 0.17, 0.27, 'olive', bevel=0.01)
    ab.box(-0.04, 0.04, -0.118, -0.098, 0.12, 0.2, 'steel', bevel=0.004)
    ab.cyl((-0.1, -0.12, 0.2), (0.1, -0.12, 0.2), 0.01, 0.01, 'steel', seg=6)
    m.add(ab, trans(-1.05, -0.12, 0.0) @ roty(0.0))
    return m


def hedgehog():
    """Czech hedgehog: three angle-iron beams, 2.1 m long, crossed at their middles and standing on three tips."""
    m = Mesh('prop_hedgehog')
    L = 2.1
    k = 0.577
    az0 = 0.45
    dirs = [Vector((0.816 * cos(az0 + i * 2 * pi / 3), 0.816 * sin(az0 + i * 2 * pi / 3), k)) for i in range(3)]
    zc = k * L / 2 + 0.07
    s = 0.075
    prof = [(-s, -s), (s, -s), (s, -s + 0.022), (-s + 0.022, -s + 0.022), (-s + 0.022, s), (-s, s)]
    for i, d in enumerate(dirs):
        mx = trans(0, 0, zc) @ y_to(d) @ roty(0.9 + 1.3 * i)
        m.prism(prof, -L / 2, L / 2, 'steel_weather_flat', mx, bevel=0.004)
    m.cyl((0, -0.1, zc), (0, 0.1, zc), 0.12, 0.12, 'steel_weather', seg=10, smooth=30)
    for dx, dz in ((0.07, 0.05), (-0.07, 0.05), (0.0, -0.09)):
        bolt(m, dx, zc + dz, -0.1, 0.018, 0.014, 'steel_dark')
    return m


def wire():
    m = Mesh('prop_wire')
    rnd = random.Random(3)
    posts = [(-1.45, 0.06), (0.0, -0.1), (1.45, 0.14)]
    for x, lean in posts:
        # star pickets: three blades
        mx = at_xz(x, 0.0, lean)
        for a in (0.0, 2 * pi / 3, 4 * pi / 3):
            m.box(-0.012, 0.012, 0.0, 0.05, 0.0, 1.18, 'steel_weather', mx @ rotz(a), bevel=0.002)
        m.cyl((0, 0, 1.18), (0, 0, 1.22), 0.03, 0.01, 'steel_weather', seg=6, mx=mx)
    # two taut strands with barbs, sagging between pickets
    for z0 in (0.86, 1.14):
        pts = []
        for i in range(61):
            u = i / 60
            x = -1.45 + u * 2.9
            sag = 0.035 * sin(u * pi * 2) + 0.03 * sin(u * pi)
            pts.append((x, 0.0, z0 - sag + rnd.uniform(-0.004, 0.004)))
        m.tube(pts, 0.0085, 'wire', seg=5, cap=False)
        for i in range(0, 60, 3):
            x, _, z = pts[i]
            a = rnd.uniform(0, pi)
            m.cyl((x - 0.035 * cos(a), -0.018, z - 0.035 * sin(a)), (x + 0.035 * cos(a), 0.018, z + 0.035 * sin(a)), 0.005, 0.005, 'wire', seg=3, smooth=0)
    # concertina coils lying along the ground (two side by side, one on top): helices seen from the side
    for (zc, r, y, ph) in ((0.24, 0.23, -0.18, 0.0), (0.24, 0.23, 0.18, 1.7), (0.55, 0.21, 0.0, 0.8)):
        pts = []
        turns = 24
        for i in range(turns * 14 + 1):
            t = i / 14
            a = 2 * pi * t + ph
            pts.append((-1.5 + 3.0 * t / turns + 0.05 * sin(t * 1.7), y + r * cos(a), zc + r * sin(a) * 0.95))
        m.tube(pts, 0.011, 'wire', seg=5, cap=False)
    return m


def _branch(m, p, d, length, r0, depth, rnd, mat, wiggle=0.35, up=0.18):
    n = 8
    pts = [Vector(p)]
    dd = Vector(d).normalized()
    radii = []
    for i in range(1, n + 1):
        dd = (dd + Vector((rnd.uniform(-wiggle, wiggle), rnd.uniform(-wiggle, wiggle) * 0.6, rnd.uniform(-wiggle, wiggle) * 0.4 + up * 0.15))).normalized()
        pts.append(pts[-1] + dd * (length / n))
    for i in range(n + 1):
        radii.append(max(0.008, r0 * (1.0 - 0.88 * i / n)))
    m.tube([tuple(q) for q in pts], radii, mat, seg=7, smooth=60)
    if depth > 0:
        k = 3 if depth == 3 else 2
        for j in range(k):
            f = rnd.uniform(0.3, 0.92)
            i = min(n - 1, int(f * n))
            q = pts[i]
            sdir = Vector((rnd.uniform(-1, 1), rnd.uniform(-0.8, 0.8), rnd.uniform(0.0, 1.0)))
            nd = (dd * 0.5 + sdir).normalized()
            _branch(m, tuple(q), nd, length * rnd.uniform(0.45, 0.7), radii[i] * 0.7, depth - 1, rnd, mat, wiggle, up)
    return pts


def deadtree():
    m = Mesh('prop_deadtree')
    rnd = random.Random(12)
    # trunk: flared base, charred, snapped and splintered at the top
    pts = []
    n = 14
    d = Vector((0.04, 0.0, 1.0))
    p = Vector((0, 0, -0.1))
    radii = []
    pts.append(tuple(p))
    for i in range(1, n + 1):
        d = (d + Vector((rnd.uniform(-0.07, 0.07), rnd.uniform(-0.05, 0.05), 0.0))).normalized()
        p = p + d * 0.5
        pts.append(tuple(p))
    for i in range(n + 1):
        u = i / n
        radii.append(0.30 * (1 - 0.55 * u) + 0.28 * max(0.0, 1 - u * 7) ** 2)
    m.tube(pts, radii, 'bark_burnt', seg=10, smooth=60)
    top = Vector(pts[-1])
    # splinters at the break
    for k in range(5):
        a = k * 2 * pi / 5
        base = top + Vector((0.05 * cos(a), 0.05 * sin(a), 0))
        m.cyl(tuple(base), tuple(base + Vector((0.03 * cos(a), 0.03 * sin(a), rnd.uniform(0.3, 0.8)))), 0.05, 0.004, 'bark_burnt', seg=5, smooth=0)
    # branches off the trunk
    for i in (5, 6, 8, 9, 10, 12):
        q = Vector(pts[i])
        a = rnd.uniform(0, 2 * pi)
        d = Vector((cos(a), sin(a) * 0.6, rnd.uniform(0.15, 0.7)))
        _branch(m, tuple(q), d, rnd.uniform(1.5, 2.6), 0.10, 2, rnd, 'bark_burnt')
    # a snapped limb hanging by its bark, charred stubs lower down
    q = Vector(pts[7])
    m.tube([tuple(q), tuple(q + Vector((0.5, -0.05, 0.15))), tuple(q + Vector((0.95, 0.0, -0.45))), tuple(q + Vector((1.1, 0.0, -1.3)))], [0.09, 0.08, 0.06, 0.02], 'bark_burnt', seg=7, smooth=60)
    for i in (2, 3):
        q = Vector(pts[i])
        m.cyl(tuple(q), tuple(q + Vector((-0.6, 0.1, 0.12))), 0.06, 0.03, 'bark_burnt', seg=6, smooth=40)
    # exposed roots and ash at the foot
    for k in range(5):
        a = k * 2 * pi / 5 + 0.4
        m.tube([(0.0, 0.0, 0.15), (0.35 * cos(a), 0.35 * sin(a), 0.1), (0.7 * cos(a), 0.7 * sin(a), 0.0)], [0.16, 0.09, 0.03], 'bark_burnt', seg=6, smooth=60, cap=False)
    return m


def stump():
    m = Mesh('prop_stump')
    rnd = random.Random(21)
    prof = [(-0.05, 0.62), (0.04, 0.48), (0.16, 0.40), (0.42, 0.36), (0.60, 0.35), (0.66, 0.30)]
    m.lathe(prof, 'bark_dry', None, seg=28, smooth=50, cap=False)
    m.warp(0.03, 2.2, 3)
    m.lathe([(0.66, 0.30), (0.66, 0.0)], 'wood_cut', None, seg=28, smooth=0, cap=False)
    # jagged splintered top
    for k in range(10):
        a = k * 2 * pi / 10 + rnd.uniform(-0.2, 0.2)
        r = rnd.uniform(0.1, 0.3)
        hh = rnd.uniform(0.1, 0.42)
        x, y = r * cos(a), r * sin(a)
        m.cyl((x, y, 0.62), (x + rnd.uniform(-0.04, 0.04), y, 0.62 + hh), 0.05, 0.005, 'wood_cut', seg=5, smooth=0)
    # roots
    for k in range(6):
        a = k * 2 * pi / 6 + 0.3
        m.tube([(0.25 * cos(a), 0.25 * sin(a), 0.22), (0.5 * cos(a), 0.5 * sin(a), 0.1), (0.85 * cos(a), 0.85 * sin(a), 0.0)], [0.13, 0.07, 0.02], 'bark_dry', seg=6, smooth=60, cap=False)
    # chips and a bite of white where the axe struck
    for k in range(6):
        blob(m, (rnd.uniform(-0.9, 0.9), rnd.uniform(-0.6, 0.1), 0.03), rnd.uniform(0.07, 0.14), rnd.randrange(999), 'wood_cut', sc=(1.0, 0.7, 0.4), rough=0.3, subdiv=1)
    return m


def tire(m, x, z, R, w, y, burnt=True, seed=0, rot=0.0):
    """A wheel with its axis along Y, centred at (x, y, z), tyre plus a rusted rim and hub cap."""
    from parts import _lathe_loop
    t = Mesh('tire')
    _lathe_loop(t, [(-w / 2, 0.64 * R), (-w / 2, 0.92 * R), (-0.38 * w, R), (0.38 * w, R), (w / 2, 0.92 * R), (w / 2, 0.64 * R)], 'charred_rubber' if burnt else 'rubber', 36)
    _lathe_loop(t, [(-0.36 * w, 0.62 * R), (-0.36 * w, 0.66 * R), (0.36 * w, 0.66 * R), (0.36 * w, 0.62 * R)], 'steel_weather', 36)
    _lathe_loop(t, [(0.45 * w, 0.04 * R), (0.45 * w, 0.62 * R), (0.36 * w, 0.64 * R), (0.36 * w, 0.04 * R)], 'steel_weather', 28)
    _lathe_loop(t, [(0.5 * w, 0.02), (0.5 * w, 0.2 * R), (0.43 * w, 0.22 * R), (0.43 * w, 0.02)], 'steel_dark', 16)
    for k in range(5):
        a = k * 2 * pi / 5
        bolt(t, 0.38 * R * cos(a), 0.38 * R * sin(a), -0.46 * w, 0.025 * R, 0.02, 'steel_dark')
    m.add(t, trans(x, y, z) @ roty(rot))


def fender(m, cx, cz, R, y0, y1, mat, x_front=0.0, x_back=0.0, gap=0.1, th=0.05):
    """A curved mudguard over a wheel (a thin arch prism along Y); x_front / x_back add a flat run beyond the arch."""
    out, inn = R + gap + th, R + gap
    arc = [pi * i / 14 for i in range(15)]
    pts_o = [(cx - out * cos(t), cz + out * sin(t)) for t in arc]
    pts_i = [(cx - inn * cos(t), cz + inn * sin(t)) for t in reversed(arc)]
    m.prism(pts_o + pts_i, y0, y1, mat, bevel=0.008)
    if x_front:
        m.box(cx + inn, cx + out + x_front, y0, y1, cz - 0.01, cz + th * 0.9, mat, bevel=0.008)
    if x_back:
        m.box(cx - out - x_back, cx - inn, y0, y1, cz - 0.01, cz + th * 0.9, mat, bevel=0.008)


def truck_wreck():
    """Burnt-out 2.5 t military truck, ~6.5 m: bare chassis, cab shell with open windows, bed ribs, one wheel missing."""
    m = Mesh('prop_truck_wreck')
    G = 'wreck_green'
    rnd = random.Random(9)
    R = 0.52
    # chassis rails and cross-members, fuel tank, rear axle housing
    m.box(-3.1, 3.15, -0.55, 0.55, 0.66, 0.82, 'charred', bevel=0.01)
    m.box(-3.1, 3.15, -0.62, -0.5, 0.58, 0.86, 'charred', bevel=0.01)
    m.cyl((-0.55, -0.62, 0.62), (0.35, -0.62, 0.62), 0.22, 0.22, 'steel_weather', seg=16, smooth=40)
    m.cyl((-1.9, -0.9, R), (-1.9, 0.9, R), 0.07, 0.07, 'steel_weather', seg=8)
    # cab: lower body, firewall, roof frame; the window openings show the far side
    m.slab([(0.9, 0.82), (2.15, 0.82), (2.15, 1.55), (0.9, 1.55)], -1.0, 1.0, G, bevel=0.015)
    m.slab([(2.1, 0.82), (3.12, 0.84), (3.2, 1.08), (3.1, 1.36), (2.1, 1.46)], -0.95, 0.95, G, bevel=0.02)         # hood
    for (x0, x1) in ((2.0, 2.15), (0.9, 1.05)):
        m.box(x0, x1, -1.0, -0.86, 1.55, 2.3, G, bevel=0.01)
        m.box(x0, x1, 0.86, 1.0, 1.55, 2.3, G, bevel=0.01)
    m.slab([(0.88, 2.28), (2.18, 2.3), (2.2, 2.2), (0.86, 2.18)], -1.0, 1.0, G, bevel=0.01)                      # roof, sagging
    m.box(1.1, 2.0, 0.84, 0.99, 1.55, 2.28, 'charred_rubber', bevel=0.01)                                                 # dark interior (far door)
    m.box(1.3, 1.9, -0.6, 0.6, 0.96, 1.15, 'charred_rubber', bevel=0.03)                                           # seat base
    m.box(1.18, 1.3, -0.6, 0.6, 1.0, 1.75, 'charred_rubber', bevel=0.03)                                          # seat back
    # door seams, handle, step
    for xx in (1.05, 2.05):
        m.box(xx - 0.008, xx + 0.008, -1.012, -0.99, 0.84, 1.55, 'steel_dark')
    m.box(1.0, 2.05, -1.012, -0.99, 1.52, 1.55, 'steel_dark')
    m.box(1.7, 1.86, -1.045, -0.99, 1.22, 1.3, 'steel_dark', bevel=0.008)
    m.box(1.1, 1.95, -1.1, -0.95, 0.62, 0.7, 'steel_weather', bevel=0.01)
    m.cyl((0.95, -1.12, 1.0), (0.95, -1.12, 2.55), 0.05, 0.04, 'steel_weather', seg=10, smooth=50)               # exhaust stack
    m.tube([(2.15, -1.04, 1.7), (2.32, -1.28, 1.74), (2.36, -1.3, 1.45)], 0.015, 'steel_dark', seg=6)             # mirror arm
    m.box(2.3, 2.42, -1.34, -1.26, 1.3, 1.6, 'steel_dark', bevel=0.01)
    # grille, headlamp sockets and a bent bumper
    m.box(3.18, 3.24, -0.85, 0.85, 0.86, 1.26, 'charred', bevel=0.01)
    for zz in (0.92, 1.03, 1.14):
        m.box(3.2, 3.26, -0.8, 0.8, zz, zz + 0.04, 'steel_dark')
    m.cyl((3.2, -0.86, 1.18), (3.28, -0.86, 1.18), 0.1, 0.09, 'steel_dark', seg=14, smooth=40)
    m.box(3.17, 3.34, -1.0, 1.0, 0.5, 0.7, 'steel_weather', at_xz(0, 0, 0.05), bevel=0.02)
    # cargo bed: floor, burnt side boards with gaps, a charred headboard, two surviving tilt bows
    m.box(-3.1, 0.85, -1.05, 1.05, 0.82, 0.9, 'charred', bevel=0.01)
    for i in range(10):
        x0 = -3.08 + i * 0.4
        if rnd.random() < 0.3:
            continue
        top = rnd.uniform(1.2, 1.6)
        m.box(x0 + 0.01, x0 + 0.37, -1.07, -1.03, 0.9, top, 'wood_dark', bevel=0.006)
    m.box(-3.14, -3.08, -1.07, 1.07, 0.82, 1.5, 'wood_dark', bevel=0.01)
    m.box(0.68, 0.78, -1.07, 1.07, 0.9, 1.6, 'charred', bevel=0.01)
    for x, top in ((-2.4, 2.45), (-0.95, 2.1)):
        m.tube([(x, -1.04, 0.92), (x, -1.02, 1.7), (x + 0.04, -0.6, top)], 0.026, 'steel_weather', seg=6, cap=False)
        m.tube([(x, 1.04, 0.92), (x, 1.02, 1.7), (x + 0.04, 0.6, top)], 0.026, 'steel_weather', seg=6, cap=False)
    # wheels: burnt tyres, mudguard over the front one; the rear wheel is gone and its hub dug into the ground
    tire(m, 2.4, R, R, 0.3, -1.04, True, 1)
    tire(m, -1.35, R, R, 0.3, -1.04, True, 2)
    fender(m, 2.4, R, R, -1.2, -0.88, G, gap=0.08)
    m.cyl((-2.45, -0.55, 0.5), (-2.45, -1.12, 0.5), 0.08, 0.07, 'steel_weather', seg=10)
    m.cyl((-2.45, -1.12, 0.5), (-2.45, -1.17, 0.5), 0.16, 0.16, 'steel_weather', seg=14)
    m.cyl((-2.45, -0.3, 0.5), (-2.45, -0.55, 0.5), 0.12, 0.12, 'steel_weather', seg=10)
    # rags of tarp hanging off the rear and a spilled box
    for k in range(3):
        shred(m, (-3.2, -0.5 + k * 0.5, 1.15), 0.5, 0.4, 20 + k, 'tarp_grey', ang=rnd.uniform(-0.3, 0.3), curl=0.05)
    m.warp(0.012, 1.3, 11)
    m.transform(at_xz(0, 0, -0.01))
    return m


# ================================================================================================ farm

def haybale():
    m = Mesh('prop_haybale')
    R, W = 0.78, 1.2
    mx = trans(0, 0, R) @ rotx(pi / 2)
    m.lathe([(-W / 2, 0.0), (-W / 2, R * 0.93), (-W / 2 + 0.03, R), (W / 2 - 0.03, R), (W / 2, R * 0.93), (W / 2, 0.0)], 'straw', mx, seg=48, smooth=45)
    yn = -W / 2 - 0.004
    # near end face: a compressed spiral of straw (raised ridge) and a few rope turns on the rim
    pts = []
    turns = 11
    for i in range(turns * 40 + 1):
        t = i / 40
        a = 2 * pi * t
        r = R * 0.965 * (t / turns) ** 0.95 + 0.02
        pts.append((r * cos(a), yn - 0.004, R + r * sin(a)))
    m.tube(pts, 0.017, 'straw', seg=5, smooth=70, cap=False)
    pts = []
    for i in range(turns * 40 + 1):
        t = i / 40
        a = 2 * pi * t + 0.7
        r = R * 0.965 * (t / turns) ** 0.95 + 0.02
        pts.append((r * cos(a), yn - 0.004, R + r * sin(a)))
    m.tube(pts[::2], 0.009, 'straw', seg=4, smooth=70, cap=False)
    # twine bands round the bale, seen at the top and bottom rim
    for k in range(3):
        y = -W * 0.3 + k * W * 0.3
        m.lathe([(y - 0.008, R - 0.01), (y - 0.008, R + 0.014), (y + 0.008, R + 0.014), (y + 0.008, R - 0.01)], 'rope', mx, seg=48, smooth=40, cap=False)
    m.warp(0.014, 3.0, 5)
    # loose straw round the foot and stalks sticking out of the rim
    rnd = random.Random(2)
    for k in range(40):
        x0 = rnd.uniform(-1.0, 1.0)
        z0 = rnd.uniform(0.0, 0.08)
        m.cyl((x0, -0.62, z0), (x0 + rnd.uniform(-0.3, 0.3), -0.66, z0 + rnd.uniform(0.0, 0.12)), 0.007, 0.004, 'straw', seg=4, smooth=0)
    for k in range(34):
        a = rnd.uniform(0.15, pi - 0.15)
        r0 = R * 0.99
        m.cyl((r0 * cos(a), -0.62, R + r0 * sin(a)), (r0 * cos(a) * 1.1, -0.64, R + r0 * sin(a) * 1.1), 0.007, 0.003, 'straw', seg=4, smooth=0)
    return m


def fence():
    m = Mesh('prop_fence')
    rnd = random.Random(15)
    # posts, some leaning, one snapped
    posts = [(-1.9, 1.15, 0.03), (-0.95, 1.1, -0.05), (0.0, 0.55, 0.15), (0.95, 1.15, 0.09), (1.95, 1.05, 0.22)]
    for x, h, lean in posts:
        mx = at_xz(x, 0.0, -lean)
        m.box(-0.07, 0.07, -0.07, 0.07, 0, h, 'wood_grey', mx, bevel=0.01)
    # snapped post: jagged splinters, and the fallen top lying on the ground
    m.prism([(-0.07, 0.55), (0.07, 0.55), (0.05, 0.72), (0.0, 0.66), (-0.04, 0.78)], -0.07, 0.07, 'wood_cut', at_xz(0.0, 0.0, -0.15), bevel=0.004)
    plank(m, (0.45, 0.07), (1.2, 0.2), 0.14, 0.14, 'wood_grey', y=-0.2)
    # rails: broken, hanging
    plank(m, (-2.0, 0.92), (-0.1, 0.95), 0.12, 0.05, 'wood_grey', y=-0.1)
    plank(m, (-2.0, 0.55), (-0.95, 0.58), 0.12, 0.05, 'wood_grey', y=-0.1)
    plank(m, (-0.95, 0.52), (0.1, 0.12), 0.12, 0.05, 'wood_grey', y=-0.1)          # hanging
    plank(m, (0.95, 0.95), (2.0, 1.02), 0.12, 0.05, 'wood_grey', y=-0.1)
    plank(m, (0.95, 0.55), (1.95, 0.4), 0.12, 0.05, 'wood_grey', y=-0.1)
    plank(m, (1.35, 0.0), (2.3, 0.16), 0.12, 0.05, 'wood_grey', y=-0.3)               # fallen rail on the ground
    # pickets
    for k, x in enumerate((-1.7, -1.5, -1.3, -1.1, 1.15, 1.35, 1.55, 1.75)):
        h = rnd.uniform(0.75, 0.95)
        base = 0.1 if k < 4 else 0.15
        mx = at_xz(x, base, rnd.uniform(-0.08, 0.08))
        m.prism([(-0.045, 0), (0.045, 0), (0.045, h), (0.0, h + 0.05), (-0.045, h)], -0.015, 0.015, 'wood_grey', mx, bevel=0.003)
    # nails
    for x, h, lean in posts:
        for zz in (0.55, 0.92):
            bolt(m, x, zz, -0.075, 0.009, 0.01, 'steel_rust')
    return m


def cart_wheel(R, broken=False, seed=0):
    """A spoked cart wheel, axis along Y: iron tyre, felloe, 12 spokes, hub. `broken` drops three spokes and chips the rim."""
    from parts import _lathe_loop
    w = Mesh('wheel')
    _lathe_loop(w, [(-0.05, R * 0.94), (-0.05, R), (0.05, R), (0.05, R * 0.94)], 'steel_weather', 40)
    _lathe_loop(w, [(-0.042, R * 0.8), (-0.042, R * 0.94), (0.042, R * 0.94), (0.042, R * 0.8)], 'wood_dark', 40)
    for k in range(12):
        a = k * 2 * pi / 12
        if broken and k in (2, 3, 4):
            continue
        w.cyl((R * 0.14 * cos(a), 0.0, R * 0.14 * sin(a)), (R * 0.83 * cos(a), 0.0, R * 0.83 * sin(a)), 0.028, 0.021, 'wood_grey', seg=6, smooth=0)
    w.cyl((0, -0.1, 0), (0, 0.1, 0), 0.08, 0.075, 'wood_dark', seg=12)
    w.cyl((0, -0.1, 0), (0, -0.12, 0), 0.045, 0.045, 'steel_weather', seg=8, smooth=0)
    w.cyl((0, -0.09, 0), (0, -0.095, 0), 0.1, 0.1, 'steel_weather', seg=12, smooth=0)
    return w


def cart():
    m = Mesh('prop_cart')
    rnd = random.Random(17)
    # cart bed tipped on its broken axle: front down, tail up
    bed = Mesh('bed')
    bed.box(-1.2, 1.2, -0.55, 0.55, 0.0, 0.07, 'wood_grey', bevel=0.008)
    for yy in (-0.57, 0.57):
        bed.box(-1.2, 1.2, yy - 0.025, yy + 0.025, 0.07, 0.55, 'wood_grey', bevel=0.008)
    bed.box(1.2, 1.25, -0.55, 0.55, 0.0, 0.5, 'wood_grey', bevel=0.008)
    for k in range(6):
        x = -1.1 + k * 0.44
        bed.box(x, x + 0.02, -0.585, -0.55, 0.07, 0.55, 'wood_dark')
    for xx in (-1.15, 1.15):
        bed.box(xx - 0.05, xx + 0.05, -0.59, -0.55, 0.0, 0.57, 'steel_weather', bevel=0.004)
    m.add(bed, at_xz(-0.1, 0.75, 0.22))
    # shafts lying on the ground
    m.tube([(0.9, -0.3, 0.95), (1.8, -0.35, 0.5), (2.6, -0.4, 0.14)], [0.045, 0.04, 0.035], 'wood_grey', seg=8, smooth=60)
    m.tube([(0.9, 0.3, 0.95), (1.8, 0.4, 0.45), (2.5, 0.5, 0.1)], [0.045, 0.04, 0.035], 'wood_grey', seg=8, smooth=60)
    # the intact wheel still on the axle, and the other one lying on the ground half buried
    m.add(cart_wheel(0.5), trans(-0.65, -0.62, 0.5))
    m.cyl((-0.65, -0.1, 0.5), (-0.65, -0.75, 0.5), 0.04, 0.04, 'steel_weather', seg=8)
    m.add(cart_wheel(0.5, True), trans(1.25, -0.45, 0.26) @ rotx(1.12))
    plank(m, (-1.9, 0.0), (-1.0, 0.06), 0.04, 0.16, 'wood_grey', y=-0.45)
    # hay spilling out of the bed
    for k in range(26):
        x0 = rnd.uniform(-1.0, 0.8)
        m.cyl((x0, -0.5, 0.9), (x0 + rnd.uniform(-0.4, 0.4), -0.55, 0.95 + rnd.uniform(-0.5, 0.2)), 0.008, 0.004, 'straw', seg=4, smooth=0)
    return m


# ================================================================================================ desert

def rocks_desert():
    m = Mesh('prop_rocks_desert')
    rnd = random.Random(33)
    spec = [(-1.5, 0.0, 1.7, (1.0, 0.8, 0.6)), (0.1, 0.1, 2.6, (1.0, 0.75, 0.85)), (1.65, -0.1, 1.4, (1.0, 0.8, 0.6)), (-0.4, -0.55, 1.1, (1.0, 0.8, 0.5)), (2.4, 0.2, 0.8, (1.0, 0.8, 0.55)), (-2.5, 0.0, 0.9, (1.0, 0.8, 0.5))]
    for x, y, s, sc in spec:
        blob(m, (x, y, s * sc[2] * 0.4), s, rnd.randrange(999), 'sandstone', sc=sc, rough=0.2, subdiv=5, smooth=70)
    for k in range(14):
        blob(m, (rnd.uniform(-2.8, 3.0), rnd.uniform(-0.9, -0.3), 0.06), rnd.uniform(0.12, 0.34), rnd.randrange(999), 'sandstone', sc=(1.0, 0.8, 0.6), rough=0.3, subdiv=3, smooth=60)
    return m


def wheel_round(m, x, z, R, w, y, burnt=True, seed=0):
    tire(m, x, z, R, w, y, burnt, seed)


def jeep_wreck():
    """Burnt light 4x4, ~4.5 m: tub, folded windscreen, roll bar, seat frames, three wheels and a spare."""
    m = Mesh('prop_jeep_wreck')
    G = 'wreck_sand'
    # tub, hood, wings, folded screen
    m.slab([(-2.0, 0.55), (1.15, 0.5), (1.2, 0.98), (-2.0, 1.02)], -0.85, 0.85, G, bevel=0.02)
    m.slab([(1.15, 0.58), (2.25, 0.6), (2.32, 0.82), (2.22, 1.0), (1.15, 1.0)], -0.78, 0.78, G, bevel=0.025)
    m.slab([(1.2, 1.0), (1.26, 1.0), (1.26, 1.4), (1.2, 1.4)], -0.8, 0.8, G, mx=rot_about(1.23, 1.0, -1.42), bevel=0.01)
    m.slab([(1.16, 1.0), (1.26, 1.0), (1.26, 1.06), (1.16, 1.06)], -0.82, 0.82, 'steel_dark')
    # wings over the front wheel, rear arches
    fender(m, 1.55, 0.38, 0.38, -0.98, -0.72, G, gap=0.07, th=0.04)
    fender(m, -1.3, 0.38, 0.38, -0.98, -0.72, G, gap=0.07, th=0.04)
    # roll bar and seat frames (thin in this view)
    m.tube([(-0.4, -0.7, 1.0), (-0.46, -0.7, 1.6), (-0.46, 0.7, 1.6), (-0.4, 0.7, 1.0)], 0.032, 'steel_weather', seg=8, cap=False)
    m.tube([(-1.35, -0.5, 1.0), (-1.4, -0.5, 1.4), (-1.4, 0.5, 1.4), (-1.35, 0.5, 1.0)], 0.026, 'steel_weather', seg=8, cap=False)
    m.box(-0.1, 0.5, -0.65, -0.1, 1.0, 1.1, 'charred_rubber', bevel=0.02)
    m.box(0.35, 0.5, -0.65, -0.1, 1.05, 1.45, 'charred_rubber', bevel=0.02)
    m.box(-1.6, -0.95, -0.7, 0.7, 1.0, 1.08, 'charred_rubber', bevel=0.02)
    # louvred grille, headlamps, bumper, rear panel, jerrycan bracket
    m.box(2.3, 2.34, -0.5, 0.5, 0.68, 0.98, 'charred', bevel=0.006)
    for zz in (0.75, 0.83, 0.91):
        m.box(2.33, 2.37, -0.44, 0.44, zz, zz + 0.03, 'steel_dark')
    for yy in (-0.66, 0.66):
        m.cyl((2.28, yy, 0.92), (2.36, yy, 0.92), 0.1, 0.09, 'steel_dark', seg=14, smooth=30)
    m.box(2.28, 2.44, -0.85, 0.85, 0.42, 0.54, 'steel_weather', at_xz(0, 0, -0.04), bevel=0.012)
    m.box(-2.05, -2.0, -0.85, 0.85, 0.55, 1.02, 'charred', bevel=0.006)
    m.box(-2.16, -2.0, -0.4, 0.4, 0.5, 0.6, 'steel_weather', bevel=0.01)
    m.box(-0.2, 0.9, -0.87, -0.82, 0.6, 0.92, 'charred', bevel=0.01)             # door shell remains
    # spare on the back, three wheels (the rear one is off its hub)
    tire(m, -2.2, 0.9, 0.36, 0.26, -0.15, True, 5)
    tire(m, 1.55, 0.38, 0.38, 0.25, -0.88, True, 6)
    tire(m, -1.3, 0.38, 0.38, 0.25, -0.88, True, 7)
    m.warp(0.015, 1.5, 4)
    m.transform(at_xz(0, 0, 0.02))
    return m


# ================================================================================================ winter

def _tiers(m, z0, z1, R0, R1, n, rnd, mat_needle='pine', broken=False, droop=0.35):
    """Snow-laden boughs: n umbrella-shaped tiers from the bottom up, green needle fingers drooping at the rim."""
    for i in range(n):
        t = i / (n - 1)
        z = z0 + (z1 - z0) * t ** 1.05
        R = R0 + (R1 - R0) * t
        rise = 0.55 + 0.35 * (1 - t)
        dr = droop * (0.6 + 0.8 * (1 - t))
        ph = rnd.uniform(0, 6)
        ln = rnd.randrange(5, 9)

        def fn(u, v, R=R, z=z, rise=rise, dr=dr, ph=ph, ln=ln):
            a = 2 * pi * u
            lobe = 0.74 + 0.26 * abs(sin(a * ln / 2 + ph))
            r = R * v * lobe
            zz = z + rise * (1 - v) ** 0.9 - dr * v ** 2.2 + 0.05 * sin(a * 7 + ph) * v
            return (r * cos(a), r * sin(a) * 0.9, zz)
        m.grid_sheet(fn, 40, 6, mat_needle, smooth=60.0)
        # drooping branch tips: green needle clusters with a clump of snow on top
        for k in range(ln * 3):
            a = (k + rnd.uniform(-0.2, 0.2)) * 2 * pi / (ln * 3)
            rr = R * rnd.uniform(0.78, 1.0) * (0.74 + 0.26 * abs(sin(a * ln / 2 + ph)))
            x, y = rr * cos(a), rr * sin(a) * 0.9
            zz = z - dr * 0.95
            sz = (0.22 + 0.1 * R) * rnd.uniform(0.8, 1.2)
            blob(m, (x, y, zz - 0.04), sz, rnd.randrange(999), 'pine', sc=(0.7, 0.8, 1.3), rough=0.25, subdiv=1, smooth=60)
            if rnd.random() < 0.6:
                blob(m, (x * 0.93, y * 0.93, zz + 0.12), sz * 1.5, rnd.randrange(999), 'snow', sc=(1.0, 0.8, 0.4), rough=0.25, subdiv=2)


def pine():
    m = Mesh('prop_pine')
    rnd = random.Random(41)
    # trunk, then tiers of snow-laden boughs
    m.tube([(0, 0, -0.1), (0.02, 0, 3.0), (0.0, 0, 7.5), (0.0, 0, 10.2)], [0.34, 0.2, 0.1, 0.012], 'bark', seg=10, smooth=60)
    for k in range(4):
        a = k * 2 * pi / 4 + 0.5
        m.tube([(0.05 * cos(a), 0.05 * sin(a), 0.25), (0.5 * cos(a), 0.5 * sin(a), 0.1), (0.95 * cos(a), 0.95 * sin(a), 0.0)], [0.18, 0.08, 0.03], 'bark', seg=6, smooth=60, cap=False)
    _tiers(m, 1.7, 9.2, 2.15, 0.28, 9, rnd)
    return m


def pine_broken():
    """A pine whose top was snapped off by a shell: ragged splinters on the trunk, the green top lying in the snow beside it."""
    m = Mesh('prop_pine_broken')
    rnd = random.Random(44)
    m.tube([(0, 0, -0.1), (0.03, 0, 2.2), (0.08, 0, 4.4)], [0.34, 0.24, 0.17], 'bark', seg=10, smooth=60)
    for k in range(4):
        a = k * 2 * pi / 4 + 0.2
        m.tube([(0.05 * cos(a), 0.05 * sin(a), 0.25), (0.5 * cos(a), 0.5 * sin(a), 0.1), (0.95 * cos(a), 0.95 * sin(a), 0.0)], [0.18, 0.08, 0.03], 'bark', seg=6, smooth=60, cap=False)
    _tiers(m, 1.5, 4.2, 2.2, 1.55, 4, rnd, droop=0.4)
    for k in range(7):
        a = k * 2 * pi / 7
        base = Vector((0.08 + 0.08 * cos(a), 0.08 * sin(a), 4.4))
        m.cyl(tuple(base), tuple(base + Vector((0.05 * cos(a), 0.0, rnd.uniform(0.3, 0.9)))), 0.05, 0.004, 'wood_cut', seg=5, smooth=0)
    # the snapped top lies on the ground to the right, its boughs half sunk in snow
    top = Mesh('top')
    top.tube([(0, 0, 0), (0.0, 0, 1.6), (0.0, 0, 3.2), (0.0, 0, 4.6)], [0.17, 0.12, 0.06, 0.01], 'bark', seg=8, smooth=60)
    _tiers(top, 0.1, 4.2, 1.5, 0.22, 5, rnd, droop=0.3)
    top.transform(scale(0.8))
    m.add(top, trans(2.7, 0.4, 0.55) @ roty(pi / 2 - 0.1))
    for k in range(10):
        blob(m, (rnd.uniform(-1.8, 6.0), rnd.uniform(-0.8, -0.2), 0.1), rnd.uniform(0.5, 1.1), rnd.randrange(999), 'snow', sc=(1.0, 0.8, 0.28), rough=0.25, subdiv=2)
    return m


def log_piece(L, rr, seed):
    """A log along Y with bark body and a ringed cut end facing the camera (-Y)."""
    s = Mesh('log')
    s.lathe([(0.0, rr * 0.97), (0.012, rr), (L - 0.02, rr), (L, rr * 0.97)], 'bark', None, seg=18, smooth=40, cap=False)
    s.transform(rotx(-pi / 2))      # axis now toward -Y
    rnd = random.Random(seed)
    s.cyl((0, 0.0, 0), (0, -0.012, 0), rr * 0.95, rr * 0.95, 'wood_cut', seg=18, smooth=0)
    for q in range(1, 5):
        rq = rr * 0.95 * q / 5
        s.cyl((0, -0.012, 0), (0, -0.0135, 0), rq, rq, 'wood_ring' if q % 2 else 'wood_cut', seg=18, smooth=0)
    ca = rnd.uniform(0, pi)
    s.box(0.0, rr * 0.9, -0.016, -0.0125, -0.007, 0.007, 'wood_dark', roty(ca))
    return s


def log_piece(L, rr, seed):
    """A log along Y with a bark body and a ringed cut end facing the camera (-Y)."""
    s = Mesh('log')
    s.lathe([(0.0, rr * 0.97), (0.012, rr), (L - 0.02, rr), (L, rr * 0.97)], 'bark', None, seg=18, smooth=40, cap=False)
    s.transform(rotx(-pi / 2))      # local +z becomes +Y: the log runs from y = 0 away from the camera
    return s


def log_end(m, x, z, y, rr, seed):
    """Growth-ring end of a log at (x, y, z): concentric discs, biggest first, with a split."""
    rnd = random.Random(seed)
    m.cyl((x, y, z), (x, y - 0.012, z), rr * 0.97, rr * 0.97, 'wood_cut', seg=18, smooth=0)
    for i, q in enumerate((4, 3, 2, 1)):
        rq = rr * 0.97 * q / 5
        y0 = y - 0.012 - i * 0.0012
        m.cyl((x, y0, z), (x, y0 - 0.0012, z), rq, rq, 'wood_dark' if q % 2 else 'wood_cut', seg=18, smooth=0)
    ca = rnd.uniform(0, pi)
    m.box(0.0, rr * 0.9, y - 0.016, y - 0.0135, -0.004, 0.004, 'wood_dark', trans(x, 0, z) @ roty(ca))


def logs():
    m = Mesh('prop_logs')
    rnd = random.Random(52)
    rows = [(5, 0.2), (4, 0.58), (3, 0.94), (2, 1.3)]
    tops = []
    for ri, (n, zc) in enumerate(rows):
        x0 = -(n - 1) * 0.4 / 2
        for k in range(n):
            x = x0 + k * 0.4 + rnd.uniform(-0.02, 0.02)
            rr = 0.2 * rnd.uniform(0.9, 1.1)
            L = rnd.uniform(1.5, 1.9)
            z = zc + rnd.uniform(-0.01, 0.01)
            yfront = -0.9 + rnd.uniform(-0.1, 0.1)
            m.add(log_piece(L, rr, ri * 10 + k), trans(x, yfront, z))
            log_end(m, x, z, yfront, rr, ri * 10 + k)
            tops.append((x, z + rr, ri))
    # a log across the top, a loose one on the ground in front
    m.add(log_piece(1.8, 0.17, 91), at_xz(0.1, 1.64, 0.05, y=-0.9))
    log_end(m, 0.1, 1.64, -0.9, 0.17, 91)
    m.cyl((1.1, -0.2, 0.14), (2.4, -0.15, 0.14), 0.14, 0.13, 'bark', seg=14, smooth=40)
    # snow rides on the topmost logs of each course and drifts at the foot
    for (x, z, ri) in tops:
        if ri >= 2 or rnd.random() < 0.5:
            blob(m, (x, -0.3, z + 0.02), rnd.uniform(0.3, 0.5), rnd.randrange(999), 'snow', sc=(1.0, 0.8, 0.4), rough=0.2, subdiv=2)
    blob(m, (0.1, -0.3, 1.8), 1.0, 3, 'snow', sc=(1.0, 0.6, 0.22), rough=0.2, subdiv=3)
    for k in range(7):
        blob(m, (rnd.uniform(-1.6, 2.5), rnd.uniform(-0.8, -0.3), 0.05), rnd.uniform(0.4, 0.9), rnd.randrange(999), 'snow', sc=(1.0, 0.8, 0.2), rough=0.2, subdiv=2)
    return m


# ================================================================================================ city

def ragged(cx, cz, w, h, rnd, n=11):
    """A ragged outline (clinging plaster) around (cx, cz)."""
    pts = []
    for i in range(n):
        a = 2 * pi * i / n
        r = rnd.uniform(0.6, 1.0)
        pts.append((cx + 0.5 * w * r * cos(a), cz + 0.5 * h * r * sin(a)))
    return pts


def wall_ruin():
    m = Mesh('prop_wall_ruin')
    rnd = random.Random(61)
    t = 0.5
    Y0, Y1 = -t / 2, t / 2
    B = 'brick_big'
    # left pier (jagged top), right pier (taller), sill below the window and a ragged arch remnant above it
    m.prism([(-2.6, 0), (-0.58, 0), (-0.58, 4.3), (-0.82, 4.7), (-1.15, 4.35), (-1.45, 5.35), (-1.95, 5.0), (-2.25, 5.85), (-2.6, 5.1)], Y0, Y1, B, bevel=0.01)
    m.prism([(0.58, 0), (2.6, 0), (2.6, 6.1), (2.15, 5.55), (1.75, 6.3), (1.35, 5.1), (0.95, 4.85), (0.58, 4.2)], Y0, Y1, B, bevel=0.01)
    m.prism([(-0.58, 0), (0.58, 0), (0.58, 1.65), (0.25, 1.95), (-0.1, 1.72), (-0.58, 1.9)], Y0, Y1, B, bevel=0.01)
    m.prism([(-0.58, 3.6), (-0.3, 3.9), (0.1, 4.2), (0.4, 4.1), (0.58, 3.75), (0.58, 4.2), (0.2, 4.7), (-0.2, 4.45), (-0.58, 4.3)], Y0, Y1, B, bevel=0.01)
    # plaster scabs clinging to the near face, a few thin ones
    for (cx, cz, w, h) in ((-2.0, 0.9, 0.9, 1.2), (-1.5, 3.4, 0.7, 1.4), (-2.2, 4.4, 0.5, 0.8), (1.5, 1.1, 1.0, 1.5), (1.9, 4.0, 0.8, 1.6), (1.2, 3.0, 0.5, 0.9), (-0.2, 0.7, 0.5, 0.6)):
        m.prism(ragged(cx, cz, w, h, rnd), Y0 - 0.02, Y0 + 0.003, 'plaster', bevel=0.004)
    # window frame remains and sill
    m.box(-0.6, 0.6, Y0 - 0.12, Y0 + 0.12, 1.88, 1.96, 'wood_dark', bevel=0.01)
    m.box(-0.62, -0.5, Y0 - 0.04, Y0 + 0.04, 1.96, 3.6, 'wood_dark', bevel=0.008)
    plank(m, (0.45, 3.5), (0.58, 2.0), 0.1, 0.05, 'wood_dark', y=Y0 + 0.02)
    # rebar and bent pipes sticking out of the broken tops
    for (x, z, a) in ((-2.0, 5.6, 0.2), (-1.3, 5.2, -0.3), (1.9, 6.0, 0.15), (1.5, 5.4, -0.4), (0.0, 4.2, 0.1), (-0.3, 3.8, 0.0)):
        m.tube([(x, 0.0, z), (x + 0.12 * sin(a), 0.0, z + 0.4), (x + 0.3 * sin(a) + rnd.uniform(-0.1, 0.1), 0.05, z + 0.85)], 0.012, 'steel_weather', seg=5, cap=False)
    # fallen bricks and rubble at both sides and in the window
    for k in range(34):
        x = rnd.uniform(-3.2, 3.2)
        zz = max(0.0, 0.5 * (1 - abs(x) / 3.4)) * rnd.random()
        bw = rnd.uniform(0.1, 0.24)
        m.box(-bw / 2, bw / 2, -0.07, 0.07, 0, 0.08, B, trans(x, rnd.uniform(-0.6, 0.35), zz) @ roty(rnd.uniform(-0.6, 0.6)), bevel=0.01)
    for k in range(10):
        blob(m, (rnd.uniform(-3.0, 3.0), rnd.uniform(-0.7, 0.3), 0.12), rnd.uniform(0.25, 0.6), rnd.randrange(999), 'concrete', sc=(1.0, 0.8, 0.6), rough=0.4, subdiv=2, smooth=40)
    return m


def lamp():
    m = Mesh('prop_lamp')
    # base plinth, tapered pole, a kinked arm bent over by a blast, a smashed lantern
    m.lathe([(0.0, 0.3), (0.12, 0.3), (0.2, 0.2), (0.7, 0.16), (0.74, 0.14)], 'lamp_paint', None, seg=14, smooth=40, cap=True)
    m.box(-0.1, 0.1, -0.2, -0.17, 0.2, 0.62, 'steel_dark', bevel=0.01)           # access hatch
    m.tube([(0.0, 0.0, 0.7), (0.02, 0.0, 2.0), (0.06, 0.0, 3.4), (0.35, 0.0, 4.0), (0.85, 0.0, 4.35), (1.5, 0.0, 4.25)], [0.085, 0.075, 0.06, 0.05, 0.045, 0.04], 'lamp_paint', seg=12, smooth=60)
    m.cyl((0.0, 0.0, 0.7), (0.0, 0.0, 0.76), 0.12, 0.12, 'lamp_paint', seg=12)
    # decorative collar and a bent crossbar for banners
    m.cyl((0.0, 0.0, 2.55), (0.0, 0.0, 2.68), 0.11, 0.1, 'lamp_paint', seg=12, smooth=40)
    m.tube([(0.0, 0.0, 2.9), (0.4, 0.0, 3.0), (0.85, 0.0, 2.7)], 0.02, 'lamp_paint', seg=6, cap=False)
    # lantern hanging from the arm end: housing, cracked glass, bracket
    lx, lz = 1.55, 4.15
    m.cyl((lx, 0.0, lz), (lx + 0.12, 0.0, lz - 0.3), 0.14, 0.2, 'lamp_paint', seg=14, smooth=40, bevel=0.0)
    m.cyl((lx + 0.12, 0.0, lz - 0.3), (lx + 0.14, 0.0, lz - 0.36), 0.17, 0.12, 'glass', seg=14, smooth=40)
    for k in range(5):
        a = k * 2 * pi / 5
    # dangling cable
    m.tube([(1.4, 0.0, 4.2), (1.45, 0.05, 3.6), (1.3, 0.1, 2.9), (1.55, 0.12, 2.3)], 0.01, 'rubber', seg=5, cap=False)
    # fallen sign plate and glass shards at the foot
    return m


def car_wreck():
    """Burnt civilian sedan, ~4.3 m: shell with open windows, buckled hood and boot lid, burnt tyres."""
    m = Mesh('prop_car_wreck')
    G = 'wreck_blue'
    rnd = random.Random(23)
    m.slab([(-2.15, 0.36), (2.1, 0.36), (2.16, 0.55), (2.0, 0.78), (0.95, 0.9), (-1.55, 0.92), (-2.1, 0.8), (-2.16, 0.55)], -0.85, 0.85, G, bevel=0.03)
    m.slab([(1.0, 0.9), (2.0, 0.8), (2.0, 0.88), (1.0, 0.97)], -0.8, 0.8, G, mx=rot_about(1.0, 0.93, 0.2), bevel=0.012)      # hood buckled up
    m.slab([(-2.1, 0.92), (-1.5, 0.94), (-1.5, 1.0), (-2.1, 0.98)], -0.8, 0.8, G, mx=rot_about(-1.5, 0.95, -0.16), bevel=0.01)    # boot lid
    # cabin: dark burnt interior seen through the open windows, then pillars, roof and the near-side seat
    m.box(-1.3, 0.55, 0.62, 0.84, 0.9, 1.4, 'charred_rubber', bevel=0.01)
    m.box(-0.35, 0.3, -0.7, 0.7, 0.9, 1.04, 'charred_rubber', bevel=0.03)
    m.box(0.1, 0.3, -0.7, 0.7, 0.95, 1.28, 'charred_rubber', bevel=0.03)
    m.box(-1.25, -0.8, -0.7, 0.7, 0.92, 1.05, 'charred_rubber', bevel=0.03)
    m.box(-1.28, -1.1, -0.7, 0.7, 0.98, 1.3, 'charred_rubber', bevel=0.03)
    for (p0, p1) in (((0.62, 0.9), (0.22, 1.4)), ((-0.4, 0.9), (-0.4, 1.4)), ((-1.2, 0.9), (-1.38, 1.38))):
        ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
        ln = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        m.box(0, ln, -0.88, -0.74, -0.045, 0.045, G, at_xz(p0[0], p0[1], ang), bevel=0.008)
        m.box(0, ln, 0.74, 0.88, -0.045, 0.045, G, at_xz(p0[0], p0[1], ang), bevel=0.008)
    m.slab([(-1.42, 1.34), (0.26, 1.38), (0.28, 1.46), (-1.42, 1.42)], -0.86, 0.86, G, bevel=0.012)                      # roof
    # sill, wheel arches (dark), tyres
    m.box(-1.0, 1.0, -0.86, -0.8, 0.34, 0.42, 'steel_dark', bevel=0.008)
    for x in (-1.3, 1.3):
        m.cyl((x, -0.84, 0.36), (x, -0.86, 0.36), 0.4, 0.4, 'steel_dark', seg=24, smooth=0)
    tire(m, 1.3, 0.31, 0.31, 0.2, -0.82, True, 1)
    tire(m, -1.3, 0.31, 0.31, 0.2, -0.82, True, 2)
    # bumpers, headlamp holes, exhaust tail pipe, door handle
    m.box(2.12, 2.26, -0.85, 0.85, 0.36, 0.52, 'steel_weather', bevel=0.02)
    m.box(-2.3, -2.1, -0.85, 0.85, 0.36, 0.52, 'steel_weather', rot_about(-2.2, 0.4, 0.05), bevel=0.02)
    for yy in (-0.58, 0.58):
        m.cyl((2.15, yy, 0.68), (2.22, yy, 0.68), 0.09, 0.08, 'steel_dark', seg=12, smooth=30)
    m.cyl((-2.2, -0.45, 0.3), (-2.45, -0.45, 0.24), 0.04, 0.035, 'steel_weather', seg=8)
    m.box(1.4, 2.0, -0.855, -0.82, 0.5, 0.66, 'steel_dark')
    m.warp(0.014, 1.6, 6)
    m.transform(at_xz(0, 0, 0.02))
    return m


def rubble():
    m = Mesh('prop_rubble')
    rnd = random.Random(71)

    def height(x):
        return 1.15 * max(0.0, 1 - (abs(x) / 2.0) ** 1.4)
    for k in range(60):
        x = rnd.gauss(0, 0.9)
        x = max(-2.0, min(2.0, x))
        z = height(x) * rnd.random() ** 0.6 + 0.05
        y = rnd.uniform(-0.5, 0.35)
        s = rnd.uniform(0.1, 0.34) * (1.2 - 0.4 * abs(x) / 2.0)
        mat = rnd.choice(['brick_big', 'concrete', 'concrete', 'plaster'])
        a, b, c = rnd.uniform(-0.8, 0.8), rnd.uniform(-0.4, 0.4), rnd.uniform(-0.5, 0.5)
        mx = trans(x, y, z) @ rotx(b) @ roty(a) @ rotz(c)
        m.box(-s * rnd.uniform(0.8, 1.6), s * rnd.uniform(0.8, 1.6), -s * 0.6, s * 0.6, -s * rnd.uniform(0.3, 0.6), s * rnd.uniform(0.3, 0.6), mat, mx, bevel=0.012)
    for k in range(14):
        x = rnd.uniform(-1.5, 1.5)
        blob(m, (x, rnd.uniform(-0.6, 0.2), height(x) * 0.5 + 0.12), rnd.uniform(0.3, 0.6), rnd.randrange(999), 'concrete', sc=(1.0, 0.8, 0.55), rough=0.4, subdiv=2, smooth=40)
    # a slab fragment slanting out of the heap with rebar
    m.box(-0.5, 0.5, -0.12, 0.12, -0.08, 0.08, 'concrete', at_xz(0.35, 0.95, 0.5), bevel=0.015)
    for k in range(5):
        x = 0.25 + k * 0.1
        m.tube([(x + 0.2, 0.0, 1.0 + k * 0.04), (x + 0.5, 0.0, 1.45 + k * 0.03), (x + 0.58 + rnd.uniform(-0.05, 0.1), rnd.uniform(-0.05, 0.05), 1.75 + k * 0.02)], 0.012, 'steel_rust', seg=5, cap=False)
    # bricks scattered around the foot
    for k in range(26):
        x = rnd.uniform(-2.6, 2.6)
        m.box(-0.11, 0.11, -0.055, 0.055, 0, 0.07, 'brick_big', trans(x, rnd.uniform(-0.8, 0.1), 0.0) @ roty(rnd.uniform(-0.5, 0.5)), bevel=0.01)
    # a bent pipe and a broken door frame piece
    m.tube([(-1.5, -0.2, 0.3), (-1.0, -0.2, 0.55), (-0.4, -0.25, 0.4)], 0.04, 'steel_rust', seg=8)
    plank(m, (0.9, 0.5), (1.9, 0.18), 0.12, 0.06, 'wood_dark', y=-0.3)
    return m


# ================================================================================================ ridge

def rock_spire():
    """Dark basalt: a cluster of tapering, fractured columns with scree at the foot."""
    m = Mesh('prop_rock_spire')
    rnd = random.Random(81)
    cols = [(-1.3, 0.3, 3.0, 0.5), (-0.7, -0.2, 4.1, 0.55), (0.0, 0.1, 5.1, 0.55), (0.62, -0.1, 3.8, 0.5), (1.25, 0.2, 2.7, 0.48), (-0.2, -0.65, 2.2, 0.46),
            (0.5, 0.55, 3.3, 0.5), (1.8, 0.0, 1.5, 0.42), (-1.85, 0.1, 1.4, 0.4)]
    for (x, y, h, r) in cols:
        nside = rnd.choice((5, 6, 6, 7))
        a0 = rnd.uniform(0, pi / 3)
        taper = rnd.uniform(0.025, 0.06)
        planes = []
        for k in range(nside):
            a = a0 + k * 2 * pi / nside + rnd.uniform(-0.12, 0.12)
            rr = r * rnd.uniform(0.82, 1.15)
            n = Vector((cos(a), sin(a), taper)).normalized()
            planes.append(((n.x, n.y, n.z), rr * (n.x * cos(a) + n.y * sin(a))))
        # a broken, faceted top and a deep base
        for q in range(3):
            ta = rnd.uniform(0, 2 * pi)
            tilt = rnd.uniform(0.2, 0.7)
            n = (sin(tilt) * cos(ta), sin(tilt) * sin(ta), cos(tilt))
            planes.append((n, h * cos(tilt) * (rnd.uniform(0.86, 0.97) if q else 1.0)))
        planes.append(((0, 0, -1.0), 0.4))
        lean = rnd.uniform(-0.1, 0.1)
        m.convex(planes, 'basalt', trans(x, y, 0.0) @ at_xz(0, 0, lean), bevel=0.025)
    # broken fragments leaning against the columns, a scree skirt
    blob(m, (0.0, 0.5, 0.5), 2.6, 4, 'basalt', sc=(1.0, 0.8, 0.28), rough=0.4, subdiv=3, smooth=40)
    for k in range(24):
        blob(m, (rnd.uniform(-2.5, 2.7), rnd.uniform(-1.0, 0.3), 0.14), rnd.uniform(0.2, 0.6), rnd.randrange(999), 'basalt', sc=(1.0, 0.8, 0.7), rough=0.4, subdiv=2, smooth=35)
    return m


def _lattice(m, base, axis, length, r, bands, u_dir=None):
    """Triangular lattice section from `base` along `axis`: three legs, rings and zig-zag braces, painted in alternating bands."""
    a = Vector(axis).normalized()
    u = (Vector((0, 1, 0)) if abs(a.y) < 0.9 else Vector((1, 0, 0)))
    u = (u - a * u.dot(a)).normalized()
    v = a.cross(u)
    b = Vector(base)
    legs = [u * cos(t) * r + v * sin(t) * r for t in (pi / 2, pi / 2 + 2 * pi / 3, pi / 2 + 4 * pi / 3)]
    n = max(2, int(length / 0.7))
    step = length / n
    for i in range(n):
        mat = 'mast_red' if (i // 1) % 2 == 0 else 'mast_white'
        p0, p1 = b + a * (i * step), b + a * ((i + 1) * step)
        for k, L in enumerate(legs):
            m.cyl(tuple(p0 + L), tuple(p1 + L), 0.036, 0.036, mat, seg=6, smooth=0)
        # horizontal ring
        for k in range(3):
            m.cyl(tuple(p1 + legs[k]), tuple(p1 + legs[(k + 1) % 3]), 0.018, 0.018, 'mast_white', seg=4, smooth=0)
        # diagonals
        for k in range(3):
            k2 = (k + 1) % 3
            if i % 2 == 0:
                m.cyl(tuple(p0 + legs[k]), tuple(p1 + legs[k2]), 0.016, 0.016, 'steel_rust', seg=4, smooth=0)
            else:
                m.cyl(tuple(p0 + legs[k2]), tuple(p1 + legs[k]), 0.016, 0.016, 'steel_rust', seg=4, smooth=0)
    return b + a * length


def mast():
    m = Mesh('prop_mast')
    rnd = random.Random(91)
    # concrete plinth with anchor bolts and a cable box
    m.box(-0.7, 0.7, -0.7, 0.7, 0.0, 0.3, 'concrete', bevel=0.03)
    for dx in (-0.55, 0.55):
        bolt(m, dx, 0.34, -0.7, 0.03, 0.02, 'steel_rust')
    m.box(0.85, 1.35, -0.3, 0.2, 0.0, 0.7, 'lamp_paint', bevel=0.02)
    # lower section stands, the middle section is bent over and the top hangs
    p1 = _lattice(m, (0, 0, 0.3), (0.0, 0.0, 1.0), 3.7, 0.36, 5)
    p2 = _lattice(m, tuple(p1), (0.42, 0.1, 0.91), 2.7, 0.33, 4)
    p3 = _lattice(m, tuple(p2), (0.92, 0.05, 0.38), 2.0, 0.3, 3)
    # torn joints with twisted leg ends
    for p in (p1, p2):
        for k in range(3):
            a = k * 2 * pi / 3 + 0.5
            m.cyl(tuple(p), tuple(p + Vector((0.3 * cos(a), 0.3 * sin(a), 0.25))), 0.03, 0.01, 'steel_rust', seg=5, smooth=0)
    # antenna elements and a dish on the end of the broken top
    for k in range(4):
        m.cyl(tuple(p3), tuple(p3 + Vector((0.7 + 0.15 * k, 0.0, 0.1 - 0.3 * k + 0.4))), 0.012, 0.008, 'steel_bright', seg=4, smooth=0)
    m.lathe([(0.0, 0.0), (0.18, 0.45), (0.2, 0.46), (0.0, 0.02)], 'mast_white', trans(*p3) @ at_xz(0, 0, -0.9) @ roty(pi / 2), seg=16, smooth=40, cap=False)
    # guy wires: some still taut, some snapped and hanging
    anchors = [(-3.8, 0.0), (4.2, 0.0)]
    hi = Vector((0, 0, 3.3))
    for ax, ay in anchors:
        m.tube([(0, 0, 3.3), (ax * 0.5, 0.0, 3.3 - (3.3 * 0.5) + 0.02), (ax, 0.0, 0.05)], 0.012, 'wire', seg=4, cap=False)
    m.tube([(0.0, 0.0, 3.3), (1.0, 0.1, 2.4), (1.5, 0.15, 0.9), (1.2, 0.2, 0.1)], 0.012, 'wire', seg=4, cap=False)
    m.tube([(p2[0], 0.0, p2[2]), (p2[0] + 0.8, 0.1, p2[2] - 2.2), (p2[0] + 1.5, 0.1, p2[2] - 3.2)], 0.012, 'wire', seg=4, cap=False)
    for ax, ay in anchors:
        m.box(ax - 0.12, ax + 0.12, -0.12, 0.12, 0.0, 0.18, 'concrete', bevel=0.02)
    m.warp(0.012, 1.2, 5)
    return m


PROPS = {
    'prop_sandbags': (sandbags, 48), 'prop_drums': (drums, 48), 'prop_crates': (crates, 48), 'prop_hedgehog': (hedgehog, 48),
    'prop_wire': (wire, 48), 'prop_deadtree': (deadtree, 24), 'prop_stump': (stump, 48), 'prop_truck_wreck': (truck_wreck, 48),
    'prop_haybale': (haybale, 48), 'prop_fence': (fence, 48), 'prop_cart': (cart, 48),
    'prop_rocks_desert': (rocks_desert, 48), 'prop_jeep_wreck': (jeep_wreck, 48),
    'prop_pine': (pine, 24), 'prop_pine_broken': (pine_broken, 24), 'prop_logs': (logs, 48),
    'prop_wall_ruin': (wall_ruin, 24), 'prop_lamp': (lamp, 48), 'prop_car_wreck': (car_wreck, 48), 'prop_rubble': (rubble, 48),
    'prop_rock_spire': (rock_spire, 48), 'prop_mast': (mast, 24),
}
