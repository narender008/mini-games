"""Running gear for the three tanks: track belt, road wheels, rollers, idler and sprocket, with the track-motion phase."""
import math
from math import pi, sin, cos

from bl import Mesh, trans, roty, rotx, at_xz
from parts import (Belt, build_track, road_wheel, idler_wheel, roller_wheel, sprocket_wheel, track_link, bolt)


def make_gear(g, T, phase, wreck=False, seed=0):
    """g: dict(p, th, n_rw, rw_x, zu, sprocket=(x, Nt), idler=(x, n), rollers=[x..], y_out, y_in, y_wheel, rw_w).
    Returns (Mesh, info). phase 0..3 = quarter link pitches the track has advanced (forward, clockwise)."""
    p, th = g['p'], g['th']
    n_rw = g.get('n_rw', 12)
    Rrw = n_rw * p / (2 * pi)
    zc = th + Rrw
    zu = g['zu']
    sx, Nt = g['sprocket']
    ix, n_id = g['idler']
    Rs = Nt * p / (2 * pi)
    Rid = n_id * p / (2 * pi)
    n_rl = g.get('n_rl', 4)
    Rr = n_rl * p / (2 * pi)
    circles = [(sx, zu - Rs, Rs)]
    for x in g['rollers']:
        circles.append((x, zu - (Rr + th / 2), Rr + th / 2))
    circles.append((ix, zu - (Rid + th / 2), Rid + th / 2))
    for x in reversed(g['rw_x']):
        circles.append((x, zc, Rrw + th / 2))
    belt = Belt(circles)
    yw = g['y_wheel']
    m = Mesh('gear')
    import random
    rnd = random.Random(seed)

    skip = sag = None
    extra_links = []
    if wreck:
        zs_top = zu
        x_lo, x_hi = g['rollers'][0] - 0.2, g['rollers'][-1] + 0.2

        def sag_fn(i, s, x, z):
            # slack upper run droops between the sprocket and the idler
            if z > zu - 0.12 and x_lo - 0.6 < x < ix + 0.1:
                u = (x - (sx + 0.3)) / ((ix - 0.1) - (sx + 0.3))
                u = max(0.0, min(1.0, u))
                dz = -g.get('sag', 0.16) * math.sin(pi * u) ** 1.5
                dang = -g.get('sag', 0.16) * 2.2 * pi * 0.5 * math.cos(pi * u) * math.sin(pi * u) ** 0.5 / ((ix - sx) + 1e-6) * 0.6
                return 0.0, dz, dang
            return 0.0, 0.0, 0.0

        br_x0, br_x1 = g.get('break', (1.35, 2.75))

        def skip_fn(i, s, x, z):
            return z < 0.35 and br_x0 < x < br_x1

        sag, skip = sag_fn, skip_fn
    tr, pitch, N = build_track(belt, p, phase, g['y_out'], g['y_in'], th, T.track, skip=skip, sag=sag)
    m.add(tr)
    if wreck:
        # loose links thrown out in front of the hull, lying and tilted
        link = track_link(pitch, g['y_out'], g['y_in'], th, T.track)
        from mathutils import Matrix
        for k, (x, dz, a) in enumerate(g.get('thrown', [(3.85, 0.0, 0.0), (4.07, 0.02, 0.12), (4.3, 0.0, -0.05), (4.5, 0.05, 0.4), (4.62, 0.15, 0.9)])):
            c, s_ = cos(a), sin(a)
            m.add(link, Matrix(((c, 0, -s_, x), (0, 1, 0, 0), (s_, 0, c, th / 2 + dz), (0, 0, 0, 1))))
    spin = 0.0
    # road wheels
    wheels = Mesh('wheels')
    base_rw = road_wheel(Rrw, n_rw, T.rubber, T.gear, T.dark)
    hub = Mesh('hub')
    for i, x in enumerate(g['rw_x']):
        if wreck and i in g.get('lost_wheels', ()):
            # bare axle stub and swing-arm boss
            m.cyl((x, yw + 0.12, zc), (x, yw - 0.16, zc), 0.045, 0.04, T.dark, seg=10)
            m.cyl((x, yw - 0.16, zc), (x, yw - 0.2, zc), 0.07, 0.07, T.steel, seg=8)
            continue
        ang = -phase * (p / 4) / Rrw if not wreck else rnd.uniform(0, 2 * pi)
        m.add(base_rw, trans(x, yw, zc) @ roty(-ang))
    # rollers
    base_rl = roller_wheel(Rr, n_rl, T.rubber, T.gear, T.dark)
    for i, x in enumerate(g['rollers']):
        if wreck and i in g.get('lost_rollers', ()):
            continue
        ang = -(phase * (p / 4) / Rr) if not wreck else rnd.uniform(0, 2 * pi)
        m.add(base_rl, trans(x, yw, zu - (Rr + th / 2)) @ roty(-ang))
    # idler
    ang = -(phase * (p / 4) / Rid) if not wreck else rnd.uniform(0, 2 * pi)
    m.add(idler_wheel(Rid, n_id, T.rubber, T.gear, T.dark), trans(ix, yw, zu - (Rid + th / 2)) @ roty(-ang))
    # sprocket, with its teeth sitting between the track pins
    s0, a0 = belt.arc_start[0]
    j0 = math.ceil(s0 / pitch) * pitch
    a_joint = a0 - (j0 - s0) / Rs
    ang = a_joint - phase * (2 * pi / Nt) / 4
    m.add(sprocket_wheel(Rs, Nt, pitch, ang, T.gear, T.dark, T.dark), trans(sx, yw, zu - Rs))
    # track tension: idler hub cap with its adjusting screw, rod and bracket
    zi = zu - (Rid + th / 2)
    yi = yw - 0.135
    m.cyl((ix, yi, zi), (ix, yi - 0.045, zi), 0.17, 0.15, T.dark, seg=20, smooth=30)
    for k_ in range(6):
        a_ = k_ * pi / 3
        bolt(m, ix + 0.115 * cos(a_), zi + 0.115 * sin(a_), yi - 0.045, 0.017, 0.014, T.steel)
    m.cyl((ix, yi - 0.045, zi), (ix, yi - 0.08, zi), 0.06, 0.055, T.steel, seg=6)
    m.cyl((ix - 0.08, yi - 0.03, zi), (ix - 0.62, yi - 0.03, zi - 0.03), 0.024, 0.024, T.steel, seg=8)
    m.box(ix - 0.72, ix - 0.56, yi - 0.07, yi + 0.01, zi - 0.08, zi + 0.03, T.dark, bevel=0.01)
    info = dict(Rrw=Rrw, zc=zc, Rs=Rs, Rid=Rid, Rr=Rr, pitch=pitch, N=N, belt=belt, circles=circles)
    return m, info
