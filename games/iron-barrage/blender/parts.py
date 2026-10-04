"""Shared tank parts: running gear (wheels, sprocket, track belt) and small fittings. Runs inside Blender.

Side view: X forward (right), Z up, the camera is on -Y, so the near side of a tank is at negative y.
Wheel parts are built around the Y axis, outward (toward the camera) = -Y.
"""
import math
from math import pi, sin, cos

from mathutils import Vector

from bl import Mesh, trans, rotx, roty, rotz, scale, at_xz, axis_matrix


class Theme:
    """Material keys for one tank, intact or burnt out."""

    def __init__(self, tank, wreck=False):
        self.tank = tank
        self.wreck = wreck
        if not wreck:
            self.hull = 'paint:%s:hull' % tank
            self.low = 'paint:%s:low' % tank
            self.turret = 'paint:%s:turret' % tank
            self.gunp = 'paint:%s:gun' % tank
            self.plain = 'paint:%s:plain' % tank
            self.steel = 'steel'
            self.dark = 'steel_dark'
            self.bright = 'steel_bright'
            self.gun = 'gun'
            self.rubber = 'rubber'
            self.track = 'track'
            self.optic = 'optic'
            self.cloth = 'canvas'
            self.wood = 'wood'
            self.cable = 'cable'
            self.strap = 'strap'
            self.can = 'olive'
            self.rope = 'rope'
            self.leather = 'leather'
        else:
            b = 'burnt:%s' % tank
            self.hull = self.low = self.turret = self.gunp = self.plain = b
            self.steel = self.dark = self.bright = self.gun = 'charred'
            self.rubber = 'charred_rubber'
            self.track = 'charred'
            self.optic = 'charred'
            self.cloth = 'charred_rubber'
            self.wood = 'charred_rubber'
            self.cable = 'charred'
            self.strap = 'charred_rubber'
            self.can = 'charred'
            self.rope = 'charred_rubber'
            self.leather = 'charred_rubber'


# ------------------------------------------------------------------------------------------------ small fittings

def bolt(m, x, z, y, r=0.017, h=0.012, mat='steel', seg=6, dirn=-1):
    """A bolt head on a surface at y facing the camera (dirn=-1) or the far side (+1)."""
    m.cyl((x, y, z), (x, y + dirn * h, z), r, r * 0.92, mat, seg=seg, smooth=0, bevel=0.0)


def bolts_xz(m, pts, y, r=0.017, mat='steel', h=0.012, dirn=-1):
    for x, z in pts:
        bolt(m, x, z, y, r, h, mat, dirn=dirn)


def bolts_line(m, p0, p1, n, y, r=0.017, mat='steel', h=0.012, dirn=-1):
    for i in range(n):
        u = i / (n - 1) if n > 1 else 0.5
        bolt(m, p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, y, r, h, mat, dirn=dirn)


def weld_bead(m, p0, p1, y, r=0.011, mat='steel', jitter=True):
    """Weld seam as a thin, slightly wavy tube lying on a side plate."""
    n = max(3, int(math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 0.06))
    pts = []
    for i in range(n + 1):
        u = i / n
        w = 0.0035 * sin(i * 2.3) if jitter else 0.0
        pts.append((p0[0] + (p1[0] - p0[0]) * u, y + w - r * 0.3, p0[1] + (p1[1] - p0[1]) * u + w))
    m.tube(pts, r, mat, seg=5, smooth=80)


def handle(m, x0, x1, z, y, mat='steel', r=0.014, off=0.055):
    """A grab handle: bar standing off a surface at y, toward the camera."""
    m.cyl((x0, y - off, z), (x1, y - off, z), r, r, mat, seg=8, smooth=60)
    m.cyl((x0, y, z), (x0, y - off, z), r, r, mat, seg=8, smooth=60)
    m.cyl((x1, y, z), (x1, y - off, z), r, r, mat, seg=8, smooth=60)


def hinge(m, x, z, y, h=0.12, mat='steel_dark'):
    """A barrel hinge (vertical knuckle with two leaves)."""
    m.cyl((x, y - 0.02, z - h / 2), (x, y - 0.02, z + h / 2), 0.016, 0.016, mat, seg=8, smooth=60)
    m.box(x - 0.045, x + 0.045, y - 0.012, y, z - h / 2, z + h / 2, mat, bevel=0.003)


def lug(m, x, z, y, r=0.05, hole=0.022, thick=0.03, mat='steel'):
    """Lifting / towing eye: a thick disc on a side plate with a dark hole."""
    m.cyl((x, y, z), (x, y - thick, z), r, r, mat, seg=14, smooth=40, bevel=0.004)
    m.cyl((x, y - thick + 0.002, z), (x, y - thick - 0.002, z), hole, hole, 'steel_dark', seg=10, smooth=0)


def toolbox(m, x0, x1, z0, z1, y0, y1, mat, lat='steel'):
    """Stowage box with a lid line, hasps and hinges on its camera-facing side (y0 is the near face)."""
    m.box(x0, x1, y0, y1, z0, z1, mat, bevel=0.012)
    zl = z1 - (z1 - z0) * 0.28
    m.box(x0 - 0.004, x1 + 0.004, y0 - 0.006, y0 + 0.004, zl - 0.006, zl + 0.006, 'steel_dark', bevel=0.002)
    for xx in (x0 + (x1 - x0) * 0.22, x1 - (x1 - x0) * 0.22):
        m.box(xx - 0.025, xx + 0.025, y0 - 0.014, y0 + 0.002, zl - 0.05, zl + 0.015, lat, bevel=0.004)
        bolt(m, xx, zl - 0.035, y0 - 0.014, 0.008, 0.006, lat, 6)
    m.box(x0 + 0.01, x1 - 0.01, y0 - 0.012, y0 + 0.002, z1 - 0.012, z1 - 0.004, 'steel_dark')
    for xx in (x0 + 0.03, x1 - 0.03):
        hinge(m, xx, z1 - 0.07, y0 + 0.003, 0.09)
    handle(m, (x0 + x1) / 2 - 0.05, (x0 + x1) / 2 + 0.05, (z0 + zl) / 2, y0, lat, 0.007, 0.03)


def jerrycan(m, cx, cz, y, mat='olive', ang=0.0, w=0.34, h=0.46, d=0.16, strap=True, cap='steel_dark'):
    """A 20 litre jerrycan standing on its edge; flat side to the camera. Centre at (cx, y, cz), y = depth centre."""
    mx = at_xz(cx, cz, ang, y)
    # main body: slightly bulged slab with the three stamped ribs
    m.box(-w / 2, w / 2, -d / 2, d / 2, -h / 2, h / 2, mat, mx, bevel=0.012)
    # stamped X
    for sgn in (1, -1):
        m.prism([(-w / 2 + 0.05, sgn * (-h / 2 + 0.06)), (w / 2 - 0.05, sgn * (h / 2 - 0.06)),
                 (w / 2 - 0.07, sgn * (h / 2 - 0.06)), (-w / 2 + 0.03, sgn * (-h / 2 + 0.06))] if sgn > 0 else
                [(-w / 2 + 0.05, h / 2 - 0.06), (w / 2 - 0.05, -h / 2 + 0.06), (w / 2 - 0.07, -h / 2 + 0.06), (-w / 2 + 0.03, h / 2 - 0.06)],
                -d / 2 - 0.006, -d / 2 + 0.002, mat, mx)
    # pressed ribs round the face
    m.box(-w / 2 + 0.03, w / 2 - 0.03, -d / 2 - 0.007, -d / 2 + 0.002, h / 2 - 0.05, h / 2 - 0.035, mat, mx)
    m.box(-w / 2 + 0.03, w / 2 - 0.03, -d / 2 - 0.007, -d / 2 + 0.002, -h / 2 + 0.035, -h / 2 + 0.05, mat, mx)
    # neck, cap and handle
    m.box(w / 2 - 0.15, w / 2 - 0.03, -0.035, 0.035, h / 2, h / 2 + 0.05, mat, mx, bevel=0.005)
    m.cyl((w / 2 - 0.09, 0, h / 2 + 0.04), (w / 2 - 0.09, 0, h / 2 + 0.085), 0.034, 0.03, cap, mx=mx, seg=10)
    m.box(-w / 2 + 0.03, w / 2 - 0.2, -0.02, 0.02, h / 2, h / 2 + 0.1, mat, mx, bevel=0.004)
    m.box(-w / 2 + 0.06, w / 2 - 0.2, -0.026, 0.026, h / 2 + 0.06, h / 2 + 0.09, 'steel_dark', mx)
    if strap:
        for z in (-h * 0.22, h * 0.22):
            m.box(-w / 2 - 0.006, w / 2 + 0.006, -d / 2 - 0.012, d / 2 + 0.012, z - 0.014, z + 0.014, 'strap', mx)


def rack_tube(m, p0, p1, r=0.012, mat='steel_dark'):
    m.cyl(p0, p1, r, r, mat, seg=6, smooth=60)


# ------------------------------------------------------------------------------------------------ wheels (axis = Y)

def _ring(m, d0, d1, r0, r1, mat, seg=48, ch=0.008):
    """A closed ring (washer shaped) around the Y axis spanning outward depth d0..d1 and radius r0..r1."""
    prof = [(d0, r0), (d0, r1 - ch), (d0 + ch, r1), (d1 - ch, r1), (d1, r1 - ch), (d1, r0)]
    _lathe_loop(m, prof, mat, seg)


def _lathe_loop(m, prof, mat, seg, smooth=30.0):
    """Closed-profile lathe about the Y axis (depth d outward = -Y)."""
    import bmesh
    from math import radians
    tb = bmesh.new()
    rings = [[tb.verts.new((r * cos(2 * pi * j / seg), -d, r * sin(2 * pi * j / seg))) for j in range(seg)] for d, r in prof]
    n = len(rings)
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(seg):
            j2 = (j + 1) % seg
            try:
                tb.faces.new([a[j], a[j2], b[j2], b[j]])
            except ValueError:
                pass
    m.commit(tb, mat, smooth)


def _disc(m, d0, d1, r, mat, seg=32, ch=0.006):
    """A solid disc (hub cap) about the Y axis with chamfered edge."""
    m.lathe([(d0, 0.0), (d0, r), (d1 - ch, r), (d1, r - ch), (d1, 0.0)], mat, rotx(pi / 2), seg=seg, smooth=35.0)


def _spokes(m, n, d0, d1, r0, r1, half0, half1, mat, phase=0.0):
    for i in range(n):
        a = phase + 2 * pi * i / n
        pts = [(r0 * cos(a - half0), r0 * sin(a - half0)), (r1 * cos(a - half1), r1 * sin(a - half1)),
               (r1 * cos(a + half1), r1 * sin(a + half1)), (r0 * cos(a + half0), r0 * sin(a + half0))]
        # CCW order: reorder as polygon in (x, z)
        m.prism(pts, -d1, -d0, mat, bevel=0.0)


def road_wheel(R, n=12, mat_rubber='rubber', mat_steel='steel', mat_dark='steel_dark', w=0.12, twin=True):
    """Dual road wheel seen from outside. Origin at the axle, outer face towards -Y."""
    m = Mesh('wheel')
    seg = 56
    # twin wheel behind (inner)
    if twin:
        _lathe_loop(m, [(-0.165, 0.70 * R), (-0.165, 0.95 * R), (-0.153, R), (-0.047, R), (-0.035, 0.95 * R), (-0.035, 0.70 * R)], mat_rubber, seg)
        _ring(m, -0.165, -0.035, 0.52 * R, 0.72 * R, mat_steel, seg)
    # outer tyre
    _lathe_loop(m, [(0.0, 0.70 * R), (0.0, 0.945 * R), (0.013, R), (w - 0.015, R), (w, 0.945 * R), (w, 0.70 * R)], mat_rubber, seg, 35)
    # steel rim lip and flange
    _ring(m, 0.0, w + 0.012, 0.57 * R, 0.735 * R, mat_steel, seg)
    _ring(m, w - 0.004, w + 0.016, 0.66 * R, 0.76 * R, mat_steel, seg, 0.004)
    # web with 12 windows (spokes between hub and rim)
    _spokes(m, n, 0.06, w + 0.0, 0.22 * R, 0.62 * R, pi / n * 0.62, pi / n * 0.50, mat_steel)
    _ring(m, 0.05, w + 0.005, 0.20 * R, 0.30 * R, mat_steel, seg)
    _ring(m, 0.05, w + 0.005, 0.55 * R, 0.62 * R, mat_steel, seg)
    # hub cap, nuts
    m.lathe([(0.0, 0.0), (0.0, 0.26 * R), (w + 0.03, 0.26 * R), (w + 0.045, 0.2 * R), (w + 0.05, 0.0)], mat_dark, rotx(pi / 2), seg=32, smooth=35)
    for i in range(n):
        a = 2 * pi * i / n + pi / n
        x, z = 0.225 * R * cos(a), 0.225 * R * sin(a)
        m.cyl((x, -(w + 0.03), z), (x, -(w + 0.05), z), 0.0105, 0.0095, mat_steel, seg=6, smooth=0)
    m.cyl((0, -(w + 0.05), 0), (0, -(w + 0.075), 0), 0.04 * R / 0.36 * 0.8, 0.032 * R / 0.36 * 0.8, mat_steel, seg=6, smooth=0)
    return m


def idler_wheel(R, n=10, mat_rubber='rubber', mat_steel='steel', mat_dark='steel_dark', w=0.12):
    m = Mesh('idler')
    seg = 56
    _lathe_loop(m, [(-0.04, 0.78 * R), (-0.04, 0.96 * R), (-0.028, R), (w - 0.015, R), (w, 0.96 * R), (w, 0.78 * R)], mat_steel, seg, 35)
    _ring(m, 0.0, w + 0.01, 0.6 * R, 0.80 * R, mat_steel, seg)
    _spokes(m, n, 0.05, w, 0.2 * R, 0.66 * R, pi / n * 0.56, pi / n * 0.46, mat_steel)
    _ring(m, 0.04, w + 0.005, 0.18 * R, 0.30 * R, mat_steel, seg)
    m.lathe([(0.0, 0.0), (0.0, 0.26 * R), (w + 0.03, 0.26 * R), (w + 0.045, 0.2 * R), (w + 0.05, 0.0)], mat_dark, rotx(pi / 2), seg=32, smooth=35)
    for i in range(n):
        a = 2 * pi * i / n + pi / n
        x, z = 0.215 * R * cos(a), 0.215 * R * sin(a)
        m.cyl((x, -(w + 0.03), z), (x, -(w + 0.05), z), 0.011, 0.01, mat_steel, seg=6, smooth=0)
    m.cyl((0, -(w + 0.05), 0), (0, -(w + 0.08), 0), 0.04, 0.033, mat_steel, seg=6, smooth=0)
    return m


def roller_wheel(R, n=4, mat_rubber='rubber', mat_steel='steel', mat_dark='steel_dark', w=0.09):
    m = Mesh('roller')
    seg = 28
    _lathe_loop(m, [(0.0, 0.62 * R), (0.0, 0.94 * R), (0.01, R), (w - 0.01, R), (w, 0.94 * R), (w, 0.62 * R)], mat_rubber, seg, 35)
    _ring(m, 0.0, w + 0.008, 0.4 * R, 0.65 * R, mat_steel, seg, 0.005)
    _spokes(m, n, 0.03, w, 0.15 * R, 0.45 * R, pi / n * 0.42, pi / n * 0.4, mat_steel)
    m.lathe([(0.0, 0.0), (0.0, 0.34 * R), (w + 0.02, 0.34 * R), (w + 0.03, 0.26 * R), (w + 0.035, 0.0)], mat_dark, rotx(pi / 2), seg=18, smooth=35)
    for i in range(n):
        a = 2 * pi * i / n + pi / n
        x, z = 0.26 * R * cos(a), 0.26 * R * sin(a)
        m.cyl((x, -(w + 0.02), z), (x, -(w + 0.034), z), 0.007, 0.0065, mat_steel, seg=6, smooth=0)
    return m


def sprocket_wheel(R, Nt, p, phase, mat_steel='steel', mat_dark='steel_dark', mat_tooth='steel_dark'):
    """Drive sprocket, outer toothed rim only. R = pitch radius; the teeth sit at angle `phase` + k*2pi/Nt."""
    m = Mesh('sprocket')
    seg = 64
    # outer toothed rim ring and the plate behind
    _ring(m, 0.0, 0.07, 0.72 * R, 0.90 * R, mat_steel, seg)
    _ring(m, -0.14, -0.07, 0.72 * R, 0.90 * R, mat_steel, seg)
    _ring(m, 0.07, 0.10, 0.60 * R, 0.80 * R, mat_steel, seg, 0.004)
    # web plate with big lightening holes (Nt/2 round-ish windows via spokes)
    _spokes(m, Nt, 0.02, 0.075, 0.24 * R, 0.76 * R, pi / Nt * 0.55, pi / Nt * 0.42, mat_steel)
    _ring(m, 0.0, 0.10, 0.20 * R, 0.30 * R, mat_steel, seg)
    m.lathe([(0.0, 0.0), (0.0, 0.26 * R), (0.115, 0.26 * R), (0.135, 0.19 * R), (0.14, 0.0)], mat_dark, rotx(pi / 2), seg=32, smooth=35)
    for i in range(Nt):
        a = 2 * pi * i / Nt + pi / Nt
        x, z = 0.215 * R * cos(a), 0.215 * R * sin(a)
        m.cyl((x, -0.11, z), (x, -0.13, z), 0.012, 0.011, mat_steel, seg=6, smooth=0)
    # teeth: trapezoids standing out of the rim
    for i in range(Nt):
        a = phase + 2 * pi * i / Nt
        r0, r1 = 0.88 * R, 1.075 * R
        h0, h1 = 0.30 * p / R, 0.15 * p / R           # half angles in radians
        pts = [(r0 * cos(a - h0), r0 * sin(a - h0)), (r1 * cos(a - h1), r1 * sin(a - h1)),
               (r1 * cos(a + h1), r1 * sin(a + h1)), (r0 * cos(a + h0), r0 * sin(a + h0))]
        m.prism(pts, -0.095, 0.0, mat_tooth, bevel=0.004)
        m.prism(pts, 0.07, 0.15, mat_tooth, bevel=0.004)
    return m


# ------------------------------------------------------------------------------------------------ track belt

class Belt:
    """Closed belt around circles (clockwise order, travel direction clockwise). Circle radii are of the belt centreline."""

    def __init__(self, circles):
        self.circles = circles
        n = len(circles)
        tang = []
        for i in range(n):
            ci, cj = circles[i], circles[(i + 1) % n]
            dx, dz = cj[0] - ci[0], cj[1] - ci[1]
            D = math.hypot(dx, dz)
            ux, uz = dx / D, dz / D
            c = (ci[2] - cj[2]) / D
            s = math.sqrt(max(0.0, 1 - c * c))
            # normal = u*cos + perp(u)*sin, perp = left perpendicular (-uz, ux)
            nx = ux * c + (-uz) * s
            nz = uz * c + ux * s
            tang.append((nx, nz))
        segs = []
        s0 = 0.0
        self.arc_start = {}
        for i in range(n):
            cx, cz, r = circles[i]
            n_in = tang[(i - 1) % n]
            n_out = tang[i]
            a_in = math.atan2(n_in[1], n_in[0])
            a_out = math.atan2(n_out[1], n_out[0])
            da = (a_in - a_out) % (2 * pi)           # clockwise = decreasing angle
            if da > 2 * pi - 1e-5:
                da = 0.0
            L = da * r
            self.arc_start[i] = (s0, a_in)
            segs.append(('arc', s0, L, cx, cz, r, a_in))
            s0 += L
            # straight to next circle
            cj = circles[(i + 1) % n]
            p0 = (cx + r * n_out[0], cz + r * n_out[1])
            p1 = (cj[0] + cj[2] * n_out[0], cj[1] + cj[2] * n_out[1])
            Ls = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            segs.append(('line', s0, Ls, p0, p1, n_out))
            s0 += Ls
        self.segs = segs
        self.length = s0

    def at(self, s):
        """Return (x, z, nx, nz): position on the centreline and outward normal."""
        s = s % self.length
        for sg in self.segs:
            if s <= sg[1] + sg[2] or sg is self.segs[-1]:
                u = s - sg[1]
                if sg[0] == 'arc':
                    _, s0, L, cx, cz, r, a0 = sg
                    a = a0 - u / r
                    return cx + r * cos(a), cz + r * sin(a), cos(a), sin(a)
                _, s0, L, p0, p1, nn = sg
                f = u / L if L > 0 else 0
                return p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, nn[0], nn[1]
        return 0, 0, 0, 1

    def joint_angle(self, i):
        """Angle on circle i of the first joint (s = k * pitch) is computed by the caller from arc_start."""
        return self.arc_start[i]


def track_link(p, y_out, y_in, th=0.085, mat='track', horn=True, near_only=False, cleat=True):
    """One track link in its local frame: x along the track, z outward from the wheels, centreline at z=0."""
    m = Mesh('link')
    hz = th / 2
    gap = 0.012
    L = p - gap
    yc = (y_out + y_in) / 2
    # body plate (inner part) and rubber-like block top
    m.box(-L / 2, L / 2, y_in, y_out, -hz, hz * 0.30, mat, bevel=0.006)
    # end connectors (the lugs with pins) on the camera side
    m.box(-L / 2, L / 2, y_out - 0.014, y_out + 0.004, -hz * 0.9, hz * 0.55, mat, bevel=0.004)
    # cleats (grousers) standing on the outer face
    if cleat:
        m.box(-L * 0.40, -L * 0.10, y_in + 0.03, y_out - 0.02, hz * 0.30, hz, mat, bevel=0.004)
        m.box(L * 0.10, L * 0.40, y_in + 0.03, y_out - 0.02, hz * 0.30, hz, mat, bevel=0.004)
    # pin ends at both joints
    for sx in (-1, 1):
        m.cyl((sx * p / 2, y_out + 0.004, 0), (sx * p / 2, y_out - 0.026, 0), 0.0165, 0.0165, 'steel_dark' if mat != 'charred' else mat, seg=8, smooth=0)
        m.cyl((sx * p / 2, y_out - 0.026, 0), (sx * p / 2, y_out - 0.034, 0), 0.0105, 0.0095, mat, seg=6, smooth=0)
    if horn:
        m.prism([(-L * 0.32, -hz), (L * 0.32, -hz), (L * 0.16, -hz - 0.075), (-L * 0.16, -hz - 0.075)], yc - 0.045, yc - 0.012, mat, bevel=0.004)
        m.prism([(-L * 0.32, -hz), (L * 0.32, -hz), (L * 0.16, -hz - 0.075), (-L * 0.16, -hz - 0.075)], yc + 0.012, yc + 0.045, mat, bevel=0.004)
    return m


def build_track(belt, p, phase, y_out, y_in, th, mat='track', skip=None, sag=None, extra=None):
    """All links of the belt. phase = 0..3 (quarter pitches). skip(s) -> True drops that link, sag(i, s, x, z) -> (dx, dz, dang)."""
    N = int(round(belt.length / p))
    pitch = belt.length / N
    link = track_link(pitch, y_out, y_in, th, mat)
    m = Mesh('track')
    for i in range(N):
        s = (i + phase / 4.0) * pitch
        x, z, nx, nz = belt.at(s)
        dang = 0.0
        if sag:
            dx, dz, dang = sag(i, s, x, z)
            x += dx
            z += dz
        if skip and skip(i, s, x, z):
            continue
        # basis: X = t, Z = n; t = (nz, -nx)
        tx, tz = nz, -nx
        ca, sa = cos(dang), sin(dang)
        tx, tz, nx, nz = tx * ca - nx * sa, tz * ca - nz * sa, nx * ca + tx * sa, nz * ca + tz * sa
        from mathutils import Matrix
        mx = Matrix(((tx, 0, nx, x), (0, 1, 0, 0), (tz, 0, nz, z), (0, 0, 0, 1)))
        m.add(link, mx)
    return m, pitch, N


# ------------------------------------------------------------------------------------------------ more fittings

def shovel(m, x0, x1, z, y, T, blade_first=True, tilt=0.0):
    """Entrenching shovel / spade clamped along a surface: handle from x0 to x1, blade at x0, camera side at y."""
    mx = at_xz(0, 0, tilt)
    m.cyl((x0 + 0.28, y, z), (x1, y, z), 0.016, 0.016, T.wood, seg=8, mx=mx)
    m.prism([(x0, z - 0.095), (x0 + 0.28, z - 0.07), (x0 + 0.34, z), (x0 + 0.28, z + 0.07), (x0, z + 0.095)], y - 0.012, y + 0.004, T.dark, mx, bevel=0.003)
    m.box(x0 + 0.26, x0 + 0.36, y - 0.02, y + 0.02, z - 0.02, z + 0.02, T.dark)
    # clamps
    for cx in (x0 + 0.5, x1 - 0.25):
        m.box(cx - 0.025, cx + 0.025, y - 0.03, y + 0.03, z - 0.04, z + 0.04, T.steel, bevel=0.005)
        m.box(cx - 0.012, cx + 0.012, y - 0.04, y - 0.02, z - 0.045, z + 0.045, T.dark)


def pickaxe(m, x0, z, y, T, length=0.9):
    m.cyl((x0, y, z), (x0 + length, y, z), 0.016, 0.014, T.wood, seg=8)
    m.prism([(x0 + length - 0.02, z - 0.025), (x0 + length - 0.02, z + 0.025), (x0 + length + 0.02, z + 0.03), (x0 + length + 0.17, z + 0.0), (x0 + length + 0.02, z - 0.03)], y - 0.02, y + 0.02, T.dark, bevel=0.003)
    for cx in (x0 + 0.2, x0 + length - 0.3):
        m.box(cx - 0.02, cx + 0.02, y - 0.03, y + 0.03, z - 0.035, z + 0.035, T.steel, bevel=0.005)


def periscope(m, x, z, y, w=0.15, h=0.09, d=0.08, T=None, face=-1):
    """A vision block: dark body, glass slot facing the camera."""
    m.box(x - w / 2, x + w / 2, y - d / 2, y + d / 2, z, z + h, T.dark if T else 'steel_dark', bevel=0.008)
    fy = y + face * d / 2
    m.box(x - w * 0.38, x + w * 0.38, fy - 0.006 if face < 0 else fy - 0.002, fy + 0.002 if face < 0 else fy + 0.006, z + h * 0.18, z + h * 0.78, 'optic')
    m.box(x - w / 2 - 0.01, x + w / 2 + 0.01, y - d / 2 - 0.01, y + d / 2 + 0.01, z + h - 0.012, z + h + 0.01, T.steel if T else 'steel', bevel=0.004)


def smoke_bank(m, x, z, y, T, n=4, ang=0.8, ln=0.26, r=0.04, face=-1):
    """Smoke grenade dischargers: a bracket and n tubes pointing forward and up."""
    m.box(x - 0.08, x + 0.08 + (n - 1) * 0.0, y + face * 0.0 - 0.07 if face < 0 else y, y + (0.0 if face < 0 else 0.07), z - 0.05, z + 0.05 + (n - 1) * 0.0, T.dark, bevel=0.006)
    dx, dz = cos(ang), sin(ang)
    for i in range(n):
        yy = y + face * (0.03 + i * 0.1)
        bx, bz = x - 0.05 + i * 0.0, z
        m.cyl((bx, yy, bz), (bx + dx * ln, yy, bz + dz * ln), r, r, T.dark, seg=10, smooth=50)
        m.cyl((bx + dx * ln, yy, bz + dz * ln), (bx + dx * (ln + 0.012), yy, bz + dz * (ln + 0.012)), r * 0.7, r * 0.7, 'optic', seg=10, smooth=0)


def mg_gun(T, sc=1.0, pintle=True):
    """A roof machine gun on a pintle mount, muzzle toward +x. Origin at the mount base."""
    m = Mesh('mg')
    m.cyl((0, 0, 0), (0, 0, 0.12 * sc), 0.035 * sc, 0.03 * sc, T.dark, seg=10)
    m.box(-0.05 * sc, 0.05 * sc, -0.07 * sc, 0.07 * sc, 0.1 * sc, 0.15 * sc, T.dark, bevel=0.006)
    # receiver
    m.box(-0.30 * sc, 0.12 * sc, -0.045 * sc, 0.045 * sc, 0.13 * sc, 0.235 * sc, T.dark, bevel=0.012)
    m.box(-0.34 * sc, -0.28 * sc, -0.05 * sc, 0.05 * sc, 0.14 * sc, 0.23 * sc, T.steel, bevel=0.008)
    # barrel, jacket with cooling holes, flash hider
    m.cyl((0.12 * sc, 0, 0.19 * sc), (0.78 * sc, 0, 0.19 * sc), 0.032 * sc, 0.032 * sc, T.gun, seg=10, mx=None)
    m.cyl((0.78 * sc, 0, 0.19 * sc), (0.9 * sc, 0, 0.19 * sc), 0.04 * sc, 0.038 * sc, T.dark, seg=10)
    m.cyl((0.12 * sc, 0, 0.19 * sc), (0.9 * sc, 0, 0.19 * sc), 0.014 * sc, 0.014 * sc, T.gun, seg=6)
    # feed tray with belt box
    m.box(-0.12 * sc, 0.04 * sc, -0.06 * sc, 0.06 * sc, 0.235 * sc, 0.275 * sc, T.dark, bevel=0.006)
    m.box(-0.16 * sc, -0.04 * sc, -0.09 * sc, 0.0, 0.03 * sc, 0.15 * sc, T.steel, bevel=0.008)
    # sight and grip
    m.box(0.0, 0.08 * sc, -0.015 * sc, 0.015 * sc, 0.235 * sc, 0.275 * sc, T.dark)
    m.cyl((-0.33 * sc, 0, 0.17 * sc), (-0.36 * sc, 0, 0.08 * sc), 0.012 * sc, 0.012 * sc, T.dark, seg=6)
    return m


def antenna_base(m, x, y, z, T, h=0.22):
    m.cyl((x, y, z), (x, y, z + 0.06), 0.07, 0.065, T.dark, seg=12)
    m.cyl((x, y, z + 0.06), (x, y, z + h), 0.022, 0.012, T.steel, seg=8)
    m.cyl((x, y, z + 0.015), (x, y, z + 0.045), 0.085, 0.085, T.steel, seg=12)


def mudflap(m, x, z_top, y0, y1, h, T, sway=0.0):
    """A rubber mud flap hanging from z_top."""
    mx = at_xz(x, z_top, sway)
    m.box(-0.015, 0.015, y0, y1, -h, 0.0, T.rubber, mx, bevel=0.005)
    m.box(-0.03, 0.03, y0 - 0.006, y1 + 0.006, -0.03, 0.0, T.steel, mx)


def rolled_tarp(m, x0, x1, z, y, r, T):
    """A rolled tarpaulin lying across the Y axis would show as a circle; along X as a long cylinder."""
    m.cyl((x0, y, z), (x1, y, z), r, r, T.cloth, seg=14, smooth=60)
    for u in (0.12, 0.5, 0.88):
        xx = x0 + (x1 - x0) * u
        m.cyl((xx, y, z), (xx + 0.04, y, z), r * 1.07, r * 1.07, T.strap, seg=14, smooth=60)


def wire_basket(m, x0, x1, z0, z1, y_near, y_far, T, step=0.11):
    """Open stowage basket: a frame with a mesh of thin bars, camera side at y_near."""
    r = 0.011
    for yy in (y_near, y_far):
        for xx in [x0 + (x1 - x0) * i / max(1, round((x1 - x0) / step)) for i in range(max(1, round((x1 - x0) / step)) + 1)]:
            m.cyl((xx, yy, z0), (xx, yy, z1), r * 0.8, r * 0.8, T.dark, seg=5, smooth=0)
        for zz in [z0 + (z1 - z0) * i / max(1, round((z1 - z0) / step)) for i in range(max(1, round((z1 - z0) / step)) + 1)]:
            m.cyl((x0, yy, zz), (x1, yy, zz), r * 0.8, r * 0.8, T.dark, seg=5, smooth=0)
    for xx, zz in ((x0, z0), (x1, z0), (x0, z1), (x1, z1)):
        m.cyl((xx, y_near, zz), (xx, y_far, zz), r * 1.2, r * 1.2, T.steel, seg=6, smooth=0)
    m.cyl((x0, y_near, z0), (x1, y_near, z0), r * 1.6, r * 1.6, T.steel, seg=6)
    m.cyl((x0, y_near, z1), (x1, y_near, z1), r * 1.6, r * 1.6, T.steel, seg=6)
    m.cyl((x0, y_near, z0), (x0, y_near, z1), r * 1.6, r * 1.6, T.steel, seg=6)
    m.cyl((x1, y_near, z0), (x1, y_near, z1), r * 1.6, r * 1.6, T.steel, seg=6)


def exhaust_grille(m, x0, x1, z0, z1, y, T, n=7):
    m.box(x0, x1, y - 0.03, y, z0, z1, T.dark, bevel=0.006)
    for i in range(n):
        zz = z0 + (z1 - z0) * (i + 0.5) / n
        m.box(x0 + 0.02, x1 - 0.02, y - 0.05, y - 0.02, zz - 0.008, zz + 0.014, T.steel, bevel=0.003)
