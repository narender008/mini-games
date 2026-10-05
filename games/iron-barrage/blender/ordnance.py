"""Ordnance sprites: shells, bombs, missile. Nose toward +x, origin at the centre of mass (about mid-length)."""
import math
from math import pi, sin, cos, sqrt

from bl import Mesh, trans, roty, rotx, rotz, at_xz, scale
from parts import bolt

TOX = roty(pi / 2)          # local +z (lathe axis) -> world +x


def ogive(R, L, n=7, x0=0.0, r_tip=0.0):
    """Tangent ogive profile from x0 (radius R) to x0+L (radius r_tip): list of (x, r)."""
    rho = (R * R + L * L) / (2 * R)
    pts = []
    for i in range(n + 1):
        t = i / n
        x = L * t
        r = sqrt(max(0.0, rho * rho - x * x)) - (rho - R)
        r = r * (1 - t) + r_tip * t
        pts.append((x0 + x, max(r, 0.0)))
    return pts


def body(m, prof, mat, seg=32, smooth=50, cap=True, mx=None):
    m.lathe(prof, mat, TOX if mx is None else mx, seg=seg, smooth=smooth, cap=cap)


def ring(m, x0, x1, r, mat, seg=32):
    """A thin band standing a little proud of a body of radius r."""
    m.lathe([(x0, r - 0.004), (x0, r + 0.004), (x1, r + 0.004), (x1, r - 0.004)], mat, TOX, seg=seg, smooth=40, cap=False)


def seam(m, x, r, mat='steel_dark', w=0.004):
    m.lathe([(x - w, r - 0.002), (x - w, r + 0.003), (x + w, r + 0.003), (x + w, r - 0.002)], mat, TOX, seg=32, smooth=40, cap=False)


def fin_set(m, n, pts, th, mat, a0=0.0, bevel=0.002):
    """n fins around the x axis. pts = fin outline in (x, z), z measured outward from the axis."""
    for k in range(n):
        m.prism(pts, -th / 2, th / 2, mat, rotx(a0 + 2 * pi * k / n), bevel=bevel)


def lug(m, x, r, mat='steel'):
    m.box(x - 0.025, x + 0.025, -0.012, 0.012, r - 0.01, r + 0.05, mat, bevel=0.004)
    m.cyl((x, -0.016, r + 0.03), (x, 0.016, r + 0.03), 0.012, 0.012, 'steel_dark', seg=8, smooth=0)


def shell(L=0.7, R=0.0775, heavy=False):
    m = Mesh('shell')
    x0 = -L / 2
    nose_len = 0.30 * L if not heavy else 0.27 * L
    tail = [(x0, 0.0), (x0, R * 0.80), (x0 + 0.02 * L, R * 0.84), (x0 + 0.10 * L, R * 0.95), (x0 + 0.18 * L, R)]
    body_end = L / 2 - nose_len
    prof = tail + [(body_end, R)] + ogive(R, nose_len, 8, body_end, R * 0.18)[1:] + [(L / 2 - 0.012, R * 0.18), (L / 2 - 0.012, 0.0)]
    body(m, prof, 'olive' if not heavy else 'bomb_green', 36)
    # driving band, a coloured band for the filling, and seam lines
    bx0 = x0 + 0.22 * L
    ring(m, bx0, bx0 + 0.07 * L, R, 'copper', 36)
    ring(m, bx0 + 0.09 * L, bx0 + 0.095 * L, R, 'steel_dark', 36)
    ring(m, body_end - 0.14 * L, body_end - 0.07 * L, R, 'yellow' if not heavy else 'red', 36)
    seam(m, body_end - 0.02 * L, R)
    seam(m, x0 + 0.46 * L, R)
    # nose fuze: steel cap with a brass ring
    fx = L / 2 - 0.12 * L
    m.lathe([(fx, 0.0), (fx, R * 0.35), (fx + 0.06 * L, R * 0.30), (L / 2, R * 0.16), (L / 2, 0.0)], 'steel_bright', TOX, seg=20, smooth=45)
    ring(m, fx + 0.005, fx + 0.025, R * 0.3, 'brass', 20)
    # base plate with a fuze seat
    m.cyl((x0 - 0.004, 0, 0), (x0 + 0.004, 0, 0), R * 0.5, R * 0.5, 'steel_dark', seg=16, smooth=0)
    return m


def sabot():
    m = Mesh('sabot')
    L = 0.8
    r = 0.016
    # long rod with a pointed tip
    body(m, [(-0.40, 0.0), (-0.40, r * 0.9), (-0.37, r), (0.30, r), (0.40, r * 0.55), (0.43, 0.0)][:-1] + [(0.40, 0.0)], 'steel_dark', 14)
    ring(m, 0.0, 0.002, r, 'steel_bright', 14)
    # discarding-sabot sleeve in three petals (stepped shape)
    body(m, [(-0.24, 0.0), (-0.24, 0.035), (-0.20, 0.052), (-0.04, 0.052), (0.02, 0.040), (0.10, 0.026), (0.12, 0.0)], 'steel_bright', 24, smooth=30)
    body(m, [(-0.27, 0.0), (-0.27, 0.04), (-0.24, 0.04), (-0.24, 0.0)], 'copper', 24, smooth=30)
    for a in (0.0, 2 * pi / 3, 4 * pi / 3):
        m.box(-0.22, 0.10, -0.002, 0.002, 0.0, 0.054, 'steel_dark', rotx(a + pi / 3))
    # six fins at the tail
    fin_set(m, 6, [(-0.40, 0.0), (-0.40, 0.075), (-0.355, 0.075), (-0.25, 0.015), (-0.25, 0.0)], 0.004, 'steel', a0=pi / 6, bevel=0.0008)
    return m


def cluster():
    m = Mesh('cluster')
    R = 0.105
    prof = [(-0.50, 0.0), (-0.50, R * 0.8), (-0.46, R), (0.28, R)] + ogive(R, 0.20, 5, 0.28, R * 0.55)[1:] + [(0.50, R * 0.55), (0.50, 0.0)]
    body(m, prof, 'bomb_green', 36)
    m.cyl((0.50, 0, 0), (0.54, 0, 0), R * 0.55, R * 0.35, 'steel_dark', seg=20, smooth=45)
    m.cyl((0.54, 0, 0), (0.57, 0, 0), R * 0.30, R * 0.25, 'steel_bright', seg=16, smooth=45)
    # seam lines: rings and a longitudinal seam on the near side and the top
    for x in (-0.30, -0.05, 0.12, 0.28):
        seam(m, x, R, 'steel_dark', 0.005)
    ring(m, 0.12, 0.2, R, 'yellow', 36)
    for a in (-pi / 2, 0.0, -pi / 4):
        m.box(-0.46, 0.28, -0.004, 0.004, R - 0.003, R + 0.004, 'steel_dark', rotx(a))
    # tail shroud with four fins and a lug
    m.lathe([(-0.52, R * 0.55), (-0.50, R * 0.8), (-0.50, R * 0.6)], 'bomb_green', TOX, seg=28, smooth=40, cap=False)
    fin_set(m, 4, [(-0.60 + 0.0, R * 0.5), (-0.60, R * 1.35), (-0.5, R * 1.35), (-0.44, R)], 0.012, 'steel_dark', a0=pi / 4)
    lug(m, -0.12, R)
    lug(m, 0.18, R)
    return m


def bomblet():
    m = Mesh('bomblet')
    R = 0.032
    prof = [(-0.12, 0.0), (-0.12, R * 0.7), (-0.10, R)] + [(0.0, R)] + ogive(R, 0.07, 5, 0.0, R * 0.2)[1:] + [(0.07, 0.0)]
    body(m, prof, 'bomb_green', 20)
    ring(m, -0.03, 0.0, R, 'yellow', 20)
    # tail boom with four fins
    m.cyl((-0.12, 0, 0), (-0.17, 0, 0), R * 0.4, R * 0.3, 'steel_dark', seg=10)
    fin_set(m, 4, [(-0.185, 0.0), (-0.185, R * 1.2), (-0.12, R * 1.4), (-0.11, R * 0.3)], 0.003, 'steel_bright', a0=pi / 4, bevel=0.0005)
    m.sphere((0.065, 0, 0), 0.01, 'steel_bright', seg=8)
    return m


def napalm():
    m = Mesh('napalm')
    R = 0.155
    prof = [(-0.5, 0.0), (-0.5, R * 0.35), (-0.46, R * 0.7), (-0.40, R * 0.93), (-0.32, R)] + [(0.15, R)] + ogive(R, 0.33, 8, 0.15, R * 0.28)[1:] + [(0.5, R * 0.28), (0.5, 0.0)]
    body(m, prof, 'white', 40)
    # ribs, rear band and red marking, lugs on top, tail fins
    for x in (-0.28, -0.12, 0.04, 0.2):
        seam(m, x, R, 'steel_dark', 0.007)
    ring(m, 0.2, 0.33, R * 0.99, 'red', 40)
    ring(m, -0.38, -0.31, R, 'olive', 40)
    for x in (-0.12, 0.14):
        lug(m, x, R, 'steel')
    m.cyl((0.5, 0, 0), (0.53, 0, 0), R * 0.27, R * 0.22, 'steel_dark', seg=14, smooth=40)
    m.cyl((-0.5, 0, 0), (-0.545, 0, 0), R * 0.2, R * 0.13, 'steel_dark', seg=12, smooth=40)
    fin_set(m, 4, [(-0.49, R * 0.2), (-0.56, R * 1.15), (-0.40, R * 1.15), (-0.34, R * 0.9)], 0.012, 'steel_bright', a0=pi / 4)
    # filler cap with a hinge on the body
    return m


def missile():
    m = Mesh('missile')
    R = 0.065
    prof = [(-0.70, 0.0), (-0.70, R * 0.6), (-0.66, R * 0.95), (-0.62, R)] + [(0.30, R)] + ogive(R, 0.40, 9, 0.30, R * 0.12)[1:] + [(0.7, 0.0)]
    body(m, prof, 'jet_a', 32)
    # radome, bands, seams, seeker window
    body(m, [(0.50, 0.0)] + ogive(R, 0.40, 9, 0.30, R * 0.12)[1:][3:] + [(0.7, 0.0)], 'jet_dark', 32, smooth=50)
    ring(m, 0.36, 0.40, R, 'yellow', 32)
    ring(m, 0.30, 0.325, R, 'olive_light', 32)
    ring(m, -0.30, -0.27, R, 'red', 32)
    for x in (-0.5, -0.1, 0.18):
        seam(m, x, R, 'steel_dark', 0.0025)
    # mid fins (large delta wings) and tail control fins
    fin_set(m, 4, [(-0.05, 0.0), (0.0, 0.215), (0.14, 0.215), (0.30, 0.0)], 0.012, 'jet_b', a0=pi / 4 + pi / 4 * 0 + 0.0, bevel=0.002)
    fin_set(m, 4, [(-0.70, 0.0), (-0.70, 0.12), (-0.60, 0.12), (-0.50, 0.0)], 0.01, 'jet_b', a0=pi / 4 + pi / 2 * 0.0, bevel=0.0015)
    # rocket nozzle, hanging lug, wire raceway along the top
    m.lathe([(-0.74, R * 0.52), (-0.70, R * 0.42), (-0.70, 0.0), (-0.74, 0.0)], 'steel_dark', TOX, seg=20, smooth=40, cap=False)
    m.lathe([(-0.745, R * 0.5), (-0.745, R * 0.47), (-0.70, R * 0.40), (-0.70, R * 0.43)], 'jet_dark', TOX, seg=20, smooth=40, cap=False)
    m.box(-0.40, 0.2, -0.01, 0.01, R, R + 0.012, 'steel_dark', bevel=0.003)
    for x in (-0.1, 0.12):
        m.box(x - 0.02, x + 0.02, -0.01, 0.01, R, R + 0.03, 'steel', bevel=0.003)
    return m


def buster():
    m = Mesh('buster')
    R = 0.17
    prof = [(-1.10, 0.0), (-1.10, R * 0.55), (-1.0, R * 0.95), (-0.9, R)] + [(0.52, R)] + ogive(R, 0.58, 10, 0.52, R * 0.30)[1:] + [(1.10, 0.0)]
    body(m, prof, 'dark_bomb', 44)
    # hardened steel nose and a collar
    body(m, [(0.72, 0.0)] + [(x, r) for x, r in ogive(R, 0.58, 10, 0.52, R * 0.30)[3:]] + [(1.10, 0.0)], 'steel_bright', 44, smooth=50)
    for x in (-0.55, -0.2, 0.2, 0.52):
        seam(m, x, R, 'steel_dark', 0.007)
    ring(m, -0.12, 0.02, R, 'yellow', 44)
    # bolted ring at the tail, four box fins on a conical tail
    body(m, [(-0.92, R * 0.9), (-1.12, R * 0.62), (-1.12, 0.0), (-0.92, 0.0)], 'dark_bomb', 40, smooth=30)
    fin_set(m, 4, [(-1.28, R * 0.5), (-1.28, R * 2.0), (-1.0, R * 2.0), (-0.78, R)], 0.032, 'dark_bomb', a0=pi / 4, bevel=0.005)
    m.lathe([(-1.30, R * 2.02), (-1.30, R * 1.9), (-1.0, R * 1.9), (-1.0, R * 2.02)], 'steel_dark', TOX, seg=40, smooth=30, cap=False)
    # suspension lugs, a stencil plate and rivets
    lug(m, -0.25, R)
    lug(m, 0.25, R)
    return m


def roller():
    """A spiked drum bomb seen from the side: a drum with its axis along the view direction."""
    m = Mesh('roller')
    R = 0.33
    mx = rotx(pi / 2)
    # drum: a lathe about the Y axis; width 0.5, end discs bevelled
    m.lathe([(-0.25, 0.0), (-0.25, R - 0.03), (-0.22, R), (0.22, R), (0.25, R - 0.03), (0.25, 0.0)], 'dark_bomb', mx, seg=48, smooth=40)
    # raised bands and the end plate with spokes and a hub
    m.lathe([(-0.25, 0.0), (-0.25, R * 0.9), (-0.275, R * 0.86), (-0.28, R * 0.55), (-0.30, R * 0.45), (-0.30, 0.0)], 'steel_dark', mx, seg=48, smooth=35)
    m.lathe([(-0.30, 0.0), (-0.30, R * 0.16), (-0.33, R * 0.14), (-0.33, 0.0)], 'steel', mx, seg=18, smooth=35)
    for i in range(12):
        a = i * 2 * pi / 12
        x, z = R * 0.66 * cos(a), R * 0.66 * sin(a)
        m.cyl((x, -0.28, z), (x, -0.30, z), 0.015, 0.014, 'steel_bright', seg=6, smooth=0)
    m.lathe([(-0.12, R * 0.0), (-0.12, R + 0.005), (-0.07, R + 0.005), (-0.07, 0.0)], 'yellow', mx, seg=48, smooth=30, cap=False)
    # spikes around the rim: three rows
    for row, yy in enumerate((-0.15, 0.0, 0.15)):
        n = 14
        for i in range(n):
            a = (i + 0.5 * (row % 2)) * 2 * pi / n
            c, s = cos(a), sin(a)
            base = (R * c, yy, R * s)
            tip = ((R + 0.13) * c, yy, (R + 0.13) * s)
            m.cyl(base, tip, 0.032, 0.004, 'steel_bright', seg=8, smooth=40)
            m.cyl((R * c * 0.98, yy, R * s * 0.98), (R * c * 1.02, yy, R * s * 1.02), 0.045, 0.045, 'steel_dark', seg=8, smooth=0)
    return m


def nuke():
    m = Mesh('nuke')
    # fat ellipsoid body with a short nose and tail cone; total length 1.6 m
    a, R = 0.62, 0.33
    cx = 0.12
    pts = []
    n = 24
    for i in range(n + 1):
        t = -pi / 2 + pi * i / n
        pts.append((cx + a * sin(t), R * cos(t)))
    prof = [(-0.5, 0.0), (-0.5, 0.08), (-0.42, 0.17), (cx - a * 0.9, R * 0.80)]
    body(m, [(x, r) for x, r in pts if x > cx - a * 0.85][:-1] + [(0.78, 0.06), (0.8, 0.0)], 'dark_bomb', 56, smooth=50, cap=False)
    # tail cone
    body(m, [(-0.50, 0.0), (-0.50, 0.12), (-0.58, 0.20), (cx - a * 0.85, R * 0.75)], 'dark_bomb', 40, smooth=40)
    # yellow band around the middle, seams and bolt rings
    for x0, x1, mat in ((0.0, 0.14, 'yellow'),):
        m.lathe([(x0, sqrt(max(0, 1 - ((x0 - cx) / a) ** 2)) * R - 0.0 + 0.004), (x0, sqrt(max(0, 1 - ((x0 - cx) / a) ** 2)) * R + 0.01),
                 (x1, sqrt(max(0, 1 - ((x1 - cx) / a) ** 2)) * R + 0.01), (x1, sqrt(max(0, 1 - ((x1 - cx) / a) ** 2)) * R + 0.004)], 'yellow', TOX, seg=56, smooth=40, cap=False)
    for x in (-0.28, 0.40):
        r = sqrt(max(0, 1 - ((x - cx) / a) ** 2)) * R
        seam(m, x, r, 'steel_dark', 0.006)
    # four-fin box tail assembly with an outer ring
    fin_set(m, 4, [(-0.80, 0.18), (-0.80, 0.44), (-0.42, 0.44), (-0.36, 0.28)], 0.03, 'dark_bomb', a0=pi / 4, bevel=0.004)
    m.lathe([(-0.80, 0.40), (-0.80, 0.46), (-0.44, 0.46), (-0.44, 0.40)], 'dark_bomb', TOX, seg=48, smooth=30, cap=False)
    # nose probes and lug
    lug(m, -0.05, R * 0.98)
    m.cyl((0.78, 0, 0), (0.84, 0, 0), 0.018, 0.01, 'steel_bright', seg=8, smooth=40)
    return m


def bomb():
    m = Mesh('bomb')
    R = 0.127
    prof = [(-1.0, 0.0), (-1.0, R * 0.55), (-0.92, R * 0.58), (-0.55, R * 0.80), (-0.25, R)] + [(0.30, R)] + ogive(R, 0.70, 10, 0.30, R * 0.14)[1:] + [(1.0, 0.0)]
    body(m, prof, 'bomb_green', 40)
    ring(m, 0.38, 0.50, R * 0.99, 'yellow', 40)
    ring(m, -0.18, -0.08, R, 'yellow', 40)
    for x in (-0.55, 0.05, 0.7):
        seam(m, x, R if x > -0.3 else R * 0.82, 'steel_dark', 0.005)
    # nose and tail fuzes
    m.lathe([(0.92, 0.0), (0.92, R * 0.20), (0.97, R * 0.17), (1.0, R * 0.12), (1.0, 0.0)], 'steel_bright', TOX, seg=16, smooth=40)
    # conical tail with four fins and a shroud ring
    body(m, [(-1.0, R * 0.5), (-0.92, R * 0.6), (-0.9, R * 0.8)], 'bomb_green', 36, cap=False)
    fin_set(m, 4, [(-1.22, R * 0.5), (-1.22, R * 2.05), (-0.98, R * 2.05), (-0.62, R * 0.85)], 0.016, 'bomb_green', a0=pi / 4, bevel=0.003)
    m.lathe([(-1.22, R * 1.95), (-1.22, R * 2.1), (-0.98, R * 2.1), (-0.98, R * 1.95)], 'bomb_green', TOX, seg=44, smooth=30, cap=False)
    for x in (-0.15, 0.20):
        lug(m, x, R)
    m.cyl((-1.0, 0, 0), (-1.06, 0, 0), R * 0.4, R * 0.32, 'steel_dark', seg=14, smooth=40)
    return m


def flare():
    m = Mesh('flare')
    R = 0.045
    body(m, [(-0.20, 0.0), (-0.20, R * 0.85), (-0.185, R), (0.14, R), (0.17, R * 0.9), (0.2, R * 0.7), (0.2, 0.0)], 'red', 24)
    ring(m, -0.06, 0.02, R, 'white', 24)
    ring(m, 0.10, 0.12, R, 'steel_dark', 24)
    m.cyl((0.2, 0, 0), (0.23, 0, 0), R * 0.6, R * 0.5, 'steel_dark', seg=14, smooth=40)
    m.cyl((0.23, 0, 0), (0.24, 0, 0), R * 0.3, R * 0.3, 'steel_bright', seg=10, smooth=0)
    fin_set(m, 4, [(-0.20, R * 0.5), (-0.26, R * 1.8), (-0.19, R * 1.8), (-0.15, R)], 0.004, 'steel_dark', a0=pi / 4, bevel=0.001)
    m.tube([(0.22, 0.0, R * 0.2), (0.25, 0.0, R * 1.2), (0.285, 0.0, R * 1.0), (0.27, 0.0, R * 0.5)], 0.004, 'steel_bright', seg=5, cap=False)
    return m


ORDNANCE = {
    'shell': lambda: shell(0.7, 0.0775, False),
    'shell_heavy': lambda: shell(1.0, 0.095, True),
    'sabot': sabot, 'cluster': cluster, 'bomblet': bomblet, 'napalm': napalm, 'missile': missile,
    'buster': buster, 'roller': roller, 'nuke': nuke, 'bomb': bomb, 'flare': flare,
}
