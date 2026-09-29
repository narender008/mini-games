"""Build the Toy Tanks models in Blender and export them as GLB.

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python tanks.py -- \
      --only classic,chunky --raw /tmp/tank-raw --preview /tmp/tank-previews --views side,q3

(build.sh does the whole job, including the gltfpack compression.)

The look: chunky glossy toys like the reference picture. A big rounded turret that is clearly the dominant mass, a short thick
barrel with a chunky muzzle ring, a bold white star, deep black rubber tracks with big wheels, thick soft fenders, and big
bevels everywhere. Few, bold details (no rivets, hooks or antennas): it has to read at play size.

Node contract (names the game relies on): tank > hull > (turret > barrel > muzzle), wheel_L0.. / wheel_R0.., track_L, track_R.
Materials: paint (tinted by the game), rubber, hub, star, metal. Sizes are in millimetres here (1 unit = 1 mm) and exported in metres.
"""
import os
import sys
import math
from math import pi, sin, cos

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy
import lib
import parts
from lib import PAINT, RUBBER, HUB, STAR, METAL

# colours used only for the preview pictures (the game tints `paint` itself)
PREVIEW_COLORS = {'classic': 0x1fb3b0, 'chunky': 0xffc21f, 'mini': 0x7ccf2e, 'long': 0xff8a1f, 'twin': 0x8a4fd6, 'dome': 0x2f7fe0}


def add(dst, *srcs):
    for s in srcs:
        lib.merge(dst, s)
    return dst


# ----------------------------------------------------------------------------------------- assembly

def build_common(spec, hull_bm, turret_bm, turret_origin, barrel_bm, barrel_origin, muzzle_local, name, height_mm):
    """Assemble the node tree from finished parts (all in tank space, mm) and return everything the exporter and previews need."""
    mats = lib.make_materials()
    hull_w = 2 * max(abs(v.co.y) for v in hull_bm.verts)
    tank = lib.make_empty('tank', (0, 0, 0))
    wheels = spec['wheels']
    y_c = spec['track_y']

    hull = lib.make_obj('hull', hull_bm, mats, (0, 0, 0), tank, (0, 0, 0))
    turret = lib.make_obj('turret', turret_bm, mats, turret_origin, hull, (0, 0, 0))
    lib.translate(barrel_bm, *barrel_origin)  # the gun is built around its own origin
    barrel = lib.make_obj('barrel', barrel_bm, mats, barrel_origin, turret, turret_origin)
    mz = (barrel_origin[0] + muzzle_local[0], barrel_origin[1] + muzzle_local[1], barrel_origin[2] + muzzle_local[2])
    muzzle = lib.make_empty('muzzle', mz, barrel, barrel_origin)

    nodes = [tank, hull, turret, barrel, muzzle]
    for side in (1, -1):
        tag = 'L' if side > 0 else 'R'
        for wname, wbm, org, kind, r in parts.wheel_set(wheels, side, y_c, spec['wheel_w'], spec.get('wheel_segs', 28)):
            o = lib.make_obj(wname, wbm, mats, org, hull, (0, 0, 0))
            o['kind'] = kind
            o['radius'] = round(r * lib.MM, 6)
            nodes.append(o)
        tbm, coarse, total = parts.track(wheels, side, y_c, width=spec['track_w'], thick=spec['belt_t'], lug_h=spec['lug_h'],
                                         lug_len=spec['lug_len'], pitch=spec['pitch'])
        t = lib.make_obj(f'track_{tag}', tbm, mats, (0, side * y_c, 0), hull, (0, 0, 0))
        # centre line in the node's frame (x, y = tank x and up), metres; the game scrolls the tread along it
        t['path'] = [round(v * lib.MM, 6) for p in coarse for v in p]
        t['length'] = round(total * lib.MM, 6)
        nodes.append(t)

    road = [w for w in wheels if w[0] == 'road']
    tank['contacts'] = [round(max(w[1] for w in road) * lib.MM, 5), round(min(w[1] for w in road) * lib.MM, 5)]
    tank['model'] = name
    # size facts for the game, in metres: the tracks' length, the overall width, the height to the turret top (hatch), the muzzle
    edge = spec['belt_t'] + spec['lug_h']
    xmin = min(w[1] - w[3] for w in wheels) - edge
    xmax = max(w[1] + w[3] for w in wheels) + edge
    tank['dims'] = [round((xmax - xmin) * lib.MM, 5), round(hull_w * lib.MM, 5), round(height_mm * lib.MM, 5)]
    tank['muzzleHeight'] = round(mz[2] * lib.MM, 5)
    tank['muzzleX'] = round(mz[0] * lib.MM, 5)
    return dict(tank=tank, nodes=nodes, mats=mats)


def wheel_train(length, n_road, r_road, r_idler, r_sprocket, belt_t, lug_h, lift_i=1.4, lift_s=1.8):
    """Idler at the rear, evenly spaced road wheels, a slightly raised bigger sprocket at the front; the belt's outside ends up
    exactly `length` long. Warns when neighbouring wheels would overlap."""
    e = belt_t + lug_h
    xi = -length / 2 + e + r_idler
    xs = length / 2 - e - r_sprocket
    ws = [('idler', xi, r_idler + e + lift_i, r_idler)]
    for k in range(1, n_road + 1):
        ws.append(('road', xi + (xs - xi) * k / (n_road + 1), r_road + e, r_road))
    ws.append(('sprocket', xs, r_sprocket + e + lift_s, r_sprocket))
    for a, b in zip(ws, ws[1:]):
        d = math.hypot(b[1] - a[1], b[2] - a[2])
        if d < a[3] + b[3] + 0.3:
            print(f'WARNING: wheels overlap ({a[0]} {a[1]:.1f} / {b[0]} {b[1]:.1f}): {d:.1f} < {a[3] + b[3]:.1f}')
    return ws


def track_spec(y_c, track_w, belt_t, lug_h, lug_len, pitch, wheel_w):
    return dict(track_y=y_c, track_w=track_w, belt_t=belt_t, lug_h=lug_h, lug_len=lug_len, pitch=pitch, wheel_w=wheel_w)


# ----------------------------------------------------------------------------------------- hull

def toy_hull(P):
    """Low body with thick, soft fenders over deep tracks and a chubby sloped nose. Built from side profiles cut by rounded plan
    outlines, then bevelled, so every corner is soft in both views."""
    hull = lib.bm_new()
    xr, xf = P['xr'], P['xf']
    fz0, fz1, dz = P['fz0'], P['fz1'], P['deck_top']
    yin, yout, dy = P['yin'], P['yout'], P['deck_y']
    # the dark tub you see between the wheels
    ty = P['tub_y']
    add(hull, lib.prism_xz([(xr + 16, 16), (xr + 8, fz0 + 2), (xf - 34, fz0 + 2), (xf - 18, 34), (xf - 22, 16)], -ty, ty, HUB, bevel=3.5, seg=3))
    # fenders: thick, rounded slabs; the profile's corners are filleted, the plan outline is rounded, and the edges bevelled
    ft = fz1 - fz0
    fpts = [(xr, fz0), (xf + 3, fz0), (xf + 4, fz1), (xr, fz1)]
    fprof = lib.fillet_path(fpts, [ft * 0.36, ft * 0.42, ft * 0.46, ft * 0.40], 8, closed=True)
    for side in (1, -1):
        if side > 0:
            ya, yb, rad = yin, yout, (5, 5, P['r_front'], P['r_rear'])
        else:
            ya, yb, rad = -yout, -yin, (P['r_rear'], P['r_front'], 5, 5)
        prof = lib.prism_xz(fprof, ya - 2, yb + 2)
        plan = lib.prism_xy(lib.rounded_rect(xr - 2, xf + 6, ya, yb, rad, 6), fz0 - 3, fz1 + 3)
        f = lib.intersect(prof, plan)
        lib.bevel_bm(f, P.get('fbevel', 6.0), 4, 28)
        add(hull, f)
    # the deck: flat behind, one long soft curve down the nose, and a deep chin so the front is solid paint
    xg, zg = P['gl_x0'], P['gl_z1']
    dpts = [(xr + 16, 30), (xr + 4, 36), (xr + 6, dz - 8), (xr + 16, dz), (xg, dz), (xf - 12, zg), (xf - 3, zg - 12), (xf - 4, 36), (xf - 16, 30)]
    dprof = lib.prism_xz(lib.fillet_path(dpts, [8, 8, 10, 14, 42, 16, 12, 8, 8], 8, closed=True), -dy - 2, dy + 2)
    dplan = lib.prism_xy(lib.rounded_rect(xr + 5, xf - 2, -dy, dy, (14, 14, P['r_deck'], P['r_deck']), 6), 26, dz + 4)
    deck = lib.intersect(dprof, dplan)
    lib.bevel_bm(deck, 6.5, 4, 26)
    add(hull, deck)
    # a big driver's hatch on the nose
    hx, hy = P.get('hatch_x', P['gl_x0'] + 18), P['deck_y'] * 0.45
    hz = lib.ray_z(deck, hx, hy)
    if hz is not None:
        hr = P.get('hatch_r', 10.0)
        hat = lib.lathe([(0, 0), (0, hr), (hr * 0.22, hr * 0.99), (hr * 0.52, hr * 0.78), (hr * 0.66, hr * 0.42), (hr * 0.70, 0)], 32, (hx, hy, hz - 1.5), (0, 0, 1), PAINT, up=(1, 0, 0))
        add(hull, hat)
        add(hull, lib.cylinder((hx, hy, hz - 1.5), (hx, hy, hz + 0.6), hr + 0.6, hr + 0.6, 32, RUBBER))
    return hull


# ----------------------------------------------------------------------------------------- turrets

def superellipse_plan(cx, a, b, e2, grow, n=72):
    pts = []
    for i in range(n):
        u = 2 * pi * i / n
        c, s = math.cos(u), math.sin(u)
        pts.append((cx + (a + grow) * math.copysign(abs(c) ** e2, c), (b + grow) * math.copysign(abs(s) ** e2, s)))
    return pts


def hatch_bun(hx, hy, top, hr, pivot_kw=None):
    """A big round hatch: a domed lid on a dark gasket, sitting on the roof at (hx, hy) where the roof is `top` high."""
    bm = lib.bm_new()
    add(bm, lib.lathe([(0, 0), (0, hr), (hr * 0.14, hr * 0.99), (hr * 0.40, hr * 0.82), (hr * 0.52, hr * 0.45), (hr * 0.56, 0)], 36, (hx, hy, top - 1.2), (0, 0, 1), PAINT, up=(1, 0, 0)))
    add(bm, lib.cylinder((hx, hy, top - 1.4), (hx, hy, top + 0.5), hr + 0.7, hr + 0.7, 36, RUBBER))
    return bm, top - 1.2 + hr * 0.56


def bun_turret(P):
    """A big bun: vertical wall at the foot, a full rounded roof. Returns (turret, body, origin, hatch top z). The barrel goes on later."""
    cx, z0, a, b, c, e1, e2 = P['cx'], P['z0'], P['a'], P['b'], P['c'], P['e1'], P['e2']
    body = lib.superbun(cx, 0, z0, a, b, c, e1, e2, 64, 22)
    turret = lib.bm_new()
    add(turret, body)
    # the dark seam where the turret sits on the hull
    add(turret, lib.prism_xy(superellipse_plan(cx, a, b, e2, 0.4), z0 - 1.4, z0 + 1.2, RUBBER, bevel=0.5, seg=1))
    hx, hy = cx - a * 0.28, b * 0.30
    hr = P.get('hatch_r', 12.5)
    hatch, hatch_top = hatch_bun(hx, hy, lib.ray_z(body, hx, hy), hr)
    add(turret, hatch)
    for side in (1, -1):
        add(turret, lib.make_star(body, (cx + a * 0.05, 0, z0 + c * P.get('star_z', 0.5)), (0, side, 0), R=P['star_r'], height=1.4, embed=0.4, subdiv=2, inner=0.46))
    return turret, body, (cx, 0.0, z0), hatch_top


def box_turret(P):
    """A big soft box of a turret (chunky). Returns (turret, body, origin, hatch top z)."""
    z0, th, cx, L, W = P['z0'], P['th'], P['cx'], P['length'], P['width']
    tx, ty = P['taper']
    body = lib.box(L, W, th, (cx, 0, z0 + th / 2 - 0.6), taper=(tx, ty), shift_top=(P['shift'], 0), narrow_front=P['narrow'], bevel=P['bevel'], seg=6, angle=25)
    turret = lib.bm_new()
    add(turret, body)
    inset = P['bevel'] * 0.5  # the box's rounded foot is inset by about this much
    add(turret, lib.prism_xy(lib.rounded_rect(cx - L / 2 + inset, cx + L / 2 - inset, -W / 2 + inset, W / 2 - inset, (P['bevel'] * 0.7,) * 4, 6), z0 - 1.4, z0 + 1.2, RUBBER, bevel=0.5, seg=1))
    hx, hy = cx - L * 0.2, W * 0.16
    hatch, hatch_top = hatch_bun(hx, hy, z0 + th - 0.6, P.get('hatch_r', 12.5))
    add(turret, hatch)
    for side in (1, -1):
        add(turret, lib.make_star(body, (cx - 4, 0, z0 + th * 0.5), (0, side, 0), R=P['star_r'], height=1.4, embed=0.4, subdiv=1, inner=0.46))
    return turret, body, (cx, 0.0, z0), hatch_top


def round_turret(cx, z0, R, H, star_r, hatch_r=11.0):
    """A big round drum with a domed shoulder (mini). Returns (turret, body, origin, hatch top z)."""
    poly = [(0, 0), (0, R), (H * 0.40, R), (H, R * 0.58), (H, 0)]
    prof = lib.fillet_path(poly, [0, 2.4, H * 0.36, H * 0.38, 0], 7)
    body = lib.lathe(prof, 56, (cx, 0, z0 - 0.6), (0, 0, 1), PAINT, up=(1, 0, 0))
    turret = lib.bm_new()
    add(turret, body)
    add(turret, lib.cylinder((cx, 0, z0 - 1.6), (cx, 0, z0 + 1.8), R + 0.7, R + 0.7, 56, RUBBER, bevel=0.6, seg=1))
    hx, hy = cx - R * 0.30, R * 0.24
    hatch, hatch_top = hatch_bun(hx, hy, lib.ray_z(body, hx, hy), hatch_r)
    add(turret, hatch)
    for side in (1, -1):
        add(turret, lib.make_star(body, (cx + 1, 0, z0 + H * 0.36), (0, side, 0), R=star_r, height=1.4, embed=0.4, subdiv=2, inner=0.46))
    return turret, body, (cx, 0.0, z0), hatch_top


def dome_turret(cx, z0, R, H, star_r):
    """A bubble dome on a slim ring. Returns (turret, body, origin, top z)."""
    pts = [(2.0 + H * math.sin(a), R * math.cos(a)) for a in [k * (math.pi / 2) / 16 for k in range(17)]]
    pts[-1] = (pts[-1][0], 0.0)
    body = lib.lathe([(0, 0), (0, R)] + pts, 64, (cx, 0, z0), (0, 0, 1), PAINT, up=(1, 0, 0))
    turret = lib.bm_new()
    add(turret, body)
    add(turret, lib.cylinder((cx, 0, z0 - 1.0), (cx, 0, z0 + 3.4), R + 2.2, R + 2.2, 64, PAINT, bevel=1.8, seg=3))
    add(turret, lib.cylinder((cx, 0, z0 - 1.6), (cx, 0, z0 + 0.9), R + 2.6, R + 2.6, 64, RUBBER, bevel=0.6, seg=1))
    top = z0 + 2.0 + H
    add(turret, lib.bolt((cx, 0, top - 0.6), (0, 0, 1), 4.0, 2.8, PAINT, 16))
    for side in (1, -1):
        add(turret, lib.make_star(body, (cx + 1, 0, z0 + 2.0 + H * 0.42), (0, side, 0), R=star_r, height=1.4, embed=0.4, subdiv=2, inner=0.46))
    return turret, body, (cx, 0.0, z0), top + 1.8


def gun(turret, body, zb, barrel_kw, collar, ring=None, extra=None, x_off=2.0):
    """Ball mount on the turret face and the barrel node's mesh (built around the trunnion). Returns (barrel bmesh, origin, length)."""
    xb = lib.ray_x(body, 0, zb) - x_off
    kw = dict(length=72.0, r=7.5, base_len=16.0, base_r=9.8, muzzle_len=10.0, muzzle_r=9.2)
    kw.update(barrel_kw)
    bbm, L = parts.barrel(kw['length'], kw['r'], kw['base_len'], kw['base_r'], kw['muzzle_len'], kw['muzzle_r'], twin=kw.get('twin', 0.0), bulge=kw.get('bulge'))
    if collar:
        add(bbm, lib.ellipsoid(*collar, (0, 0, 0), 32, 16, PAINT))
    if ring:
        # the dark gasket around the ball mount, bent to follow the curved turret face
        gasket = lib.torus(ring, ring * 0.15, (xb + x_off, 0, zb), (1, 0, 0), 40, 10, RUBBER)
        lib.conform_x(gasket, body, xb + x_off, 0.5)
        add(turret, gasket)
    if extra:
        add(bbm, extra)
    return bbm, (xb, 0.0, zb), L


# ----------------------------------------------------------------------------------------- the six tanks

def classic():
    bt, lh = 3.8, 2.4
    s = track_spec(57.0, 26.0, bt, lh, 3.6, 9.0, 22.0)
    s['wheels'] = wheel_train(190, 4, 13.4, 13.0, 14.5, bt, lh)
    P = dict(xr=-98, xf=100.0, yin=40.0, yout=71.5, fz0=45.0, fz1=60.0, deck_top=67.0, deck_y=48.0, tub_y=41.0, gl_x0=40, gl_z1=56.0,
             r_front=30, r_rear=22, r_deck=28, fbevel=6.5)
    T = dict(cx=-24.0, z0=66.0, a=58.0, b=52.0, c=44.0, e1=0.74, e2=0.85, star_r=13.6, hatch_r=12.5)
    hull = toy_hull(P)
    turret, body, t_origin, top = bun_turret(T)
    bbm, b_origin, L = gun(turret, body, T['z0'] + T['c'] * 0.52, dict(length=64.0, r=8.6, base_len=15.0, base_r=11.0, muzzle_len=10.0, muzzle_r=10.6),
                           (10.0, 14.0, 14.0), ring=15.0)
    return build_common(s, hull, turret, t_origin, bbm, b_origin, (L, 0, 0), 'classic', top)


def chunky():
    bt, lh = 3.8, 2.4
    s = track_spec(61.0, 27.0, bt, lh, 3.8, 9.5, 23.0)
    s['wheels'] = wheel_train(192, 4, 13.8, 13.4, 15.0, bt, lh)
    P = dict(xr=-99, xf=101.0, yin=42.0, yout=76.0, fz0=46.0, fz1=57.0, deck_top=64.0, deck_y=50.0, tub_y=42.0, gl_x0=48, gl_z1=54.0,
             r_front=30, r_rear=22, r_deck=26, fbevel=5.8, hatch_r=11.0)
    T = dict(z0=63.0, th=50.0, cx=-20.0, length=112, width=124, taper=(0.94, 0.92), shift=-2.0, narrow=0.94, bevel=12.0, star_r=14.6, hatch_r=13.5)
    hull = toy_hull(P)
    turret, body, t_origin, top = box_turret(T)
    bbm, b_origin, L = gun(turret, body, T['z0'] + T['th'] * 0.52, dict(length=50.0, r=10.4, base_len=12.0, base_r=12.6, muzzle_len=9.0, muzzle_r=12.4),
                           (9.5, 15.0, 15.0), ring=18.0)
    return build_common(s, hull, turret, t_origin, bbm, b_origin, (L, 0, 0), 'chunky', top)


def mini():
    bt, lh = 3.4, 2.1
    s = track_spec(48.0, 22.0, bt, lh, 3.2, 8.0, 18.5)
    s['wheels'] = wheel_train(160, 4, 11.3, 11.0, 12.5, bt, lh)
    P = dict(xr=-83, xf=85.0, yin=34.0, yout=60.5, fz0=38.0, fz1=51.0, deck_top=57.0, deck_y=39.0, tub_y=34.0, gl_x0=34, gl_z1=48.0,
             r_front=24, r_rear=18, r_deck=24, fbevel=5.6, hatch_r=8.5)
    hull = toy_hull(P)
    z0, R, H = 56.5, 43.0, 40.0
    turret, body, t_origin, top = round_turret(-6.0, z0, R, H, 11.5, 10.0)
    bbm, b_origin, L = gun(turret, body, z0 + 16.0, dict(length=36.0, r=7.6, base_len=10.0, base_r=9.8, muzzle_len=8.0, muzzle_r=9.2), (7.5, 11.5, 11.5), None, x_off=2.5)
    return build_common(s, hull, turret, t_origin, bbm, b_origin, (L, 0, 0), 'mini', top)


def long_tank():
    bt, lh = 3.6, 2.2
    s = track_spec(55.0, 25.0, bt, lh, 3.5, 9.6, 21.0)
    s['wheel_segs'] = 24
    s['wheels'] = wheel_train(200, 5, 12.4, 12.0, 13.5, bt, lh)
    P = dict(xr=-103, xf=105.0, yin=38.0, yout=68.5, fz0=42.0, fz1=56.0, deck_top=62.0, deck_y=46.0, tub_y=39.0, gl_x0=40, gl_z1=52.0,
             r_front=28, r_rear=20, r_deck=26, fbevel=5.4, hatch_r=9.5)
    T = dict(cx=-26.0, z0=61.0, a=52.0, b=47.0, c=42.0, e1=0.78, e2=0.9, star_r=12.4, hatch_r=11.0)
    hull = toy_hull(P)
    turret, body, t_origin, top = bun_turret(T)
    bbm, b_origin, L = gun(turret, body, T['z0'] + T['c'] * 0.52,
                           dict(length=100.0, r=7.6, base_len=20.0, base_r=10.0, muzzle_len=13.0, muzzle_r=9.6, bulge=(52.0, 74.0, 9.0)), (9.0, 12.5, 12.5), ring=13.4)
    return build_common(s, hull, turret, t_origin, bbm, b_origin, (L, 0, 0), 'long', top)


def twin():
    bt, lh = 3.8, 2.4
    s = track_spec(59.5, 26.0, bt, lh, 3.6, 9.0, 22.0)
    s['wheels'] = wheel_train(190, 4, 13.4, 13.0, 14.5, bt, lh)
    P = dict(xr=-98, xf=100.0, yin=42.0, yout=74.0, fz0=45.0, fz1=56.0, deck_top=62.0, deck_y=48.0, tub_y=43.0, gl_x0=44, gl_z1=52.0,
             r_front=30, r_rear=22, r_deck=26, fbevel=6.0)
    T = dict(cx=-22.0, z0=61.0, a=54.0, b=64.0, c=44.0, e1=0.75, e2=0.85, star_r=12.6, hatch_r=12.0)
    hull = toy_hull(P)
    turret, body, t_origin, top = bun_turret(T)
    shield = lib.box(22, 66, 29, (9.0, 0, 0), bevel=9.5, seg=5, taper=(0.92, 0.96))
    bbm, b_origin, L = gun(turret, body, T['z0'] + T['c'] * 0.5, dict(length=50.0, r=8.0, base_len=14.0, base_r=9.6, muzzle_len=8.5, muzzle_r=9.6, twin=21.0),
                           None, ring=None, extra=shield, x_off=3.0)
    return build_common(s, hull, turret, t_origin, bbm, b_origin, (L, 0, 0), 'twin', top)


def dome():
    bt, lh = 3.8, 2.4
    s = track_spec(58.0, 26.0, bt, lh, 3.6, 9.0, 22.0)
    s['wheels'] = wheel_train(190, 4, 13.4, 13.0, 14.5, bt, lh)
    hull = lib.bm_new()
    add(hull, lib.box(150, 90, 32, (-2, 0, 30), mat=HUB, bevel=3.5, seg=3))
    add(hull, lib.box(198, 146, 24, (0, 0, 51.0), bevel=11.5, seg=8, angle=25))
    add(hull, lib.box(152, 106, 18, (-4, 0, 65.0), taper=(0.94, 0.94), bevel=8.5, seg=6, angle=25))
    z0, R, H = 71.0, 56.0, 44.0
    turret, body, t_origin, top = dome_turret(-8.0, z0, R, H, 12.0)
    zb = z0 + 2.0 + H * 0.28
    bbm, b_origin, L = gun(turret, body, zb, dict(length=70.0, r=7.4, base_len=15.0, base_r=9.6, muzzle_len=9.5, muzzle_r=9.0), (8.5, 12.4, 12.4), ring=None, x_off=3.0)
    return build_common(s, hull, turret, t_origin, bbm, b_origin, (L, 0, 0), 'dome', top)


BUILDERS = {'classic': classic, 'chunky': chunky, 'mini': mini, 'long': long_tank, 'twin': twin, 'dome': dome}


# ----------------------------------------------------------------------------------------- main

def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = {'only': ','.join(BUILDERS), 'raw': None, 'preview': None, 'views': 'side,q3', 'samples': '64', 'res': '900x620'}
    i = 0
    while i < len(argv):
        if argv[i].startswith('--'):
            opts[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            i += 1
    for name in opts['only'].split(','):
        lib.reset_scene()
        res = BUILDERS[name]()
        tank = res['tank']
        tris = lib.count_tris(res['nodes'])
        print(f'TANK {name}: {len(res["nodes"])} nodes, {tris} triangles, dims(l,w,h)={list(tank["dims"])} muzzle=({tank["muzzleX"]}, {tank["muzzleHeight"]}) contacts={list(tank["contacts"])}')
        if opts['raw']:
            os.makedirs(opts['raw'], exist_ok=True)
            lib.export_glb(os.path.join(opts['raw'], f'tank-{name}.glb'), tank)
        if opts['preview']:
            os.makedirs(opts['preview'], exist_ok=True)
            lib.set_paint_color(PREVIEW_COLORS[name])
            w, h = [int(v) for v in opts['res'].split('x')]
            lib.setup_preview((w, h), int(opts['samples']))
            for v in opts['views'].split(','):
                pos, tgt = lib.PREVIEW_VIEWS[v]
                lib.render_view(os.path.join(opts['preview'], f'{name}-{v}.png'), pos, tgt)


if __name__ == '__main__':
    main()
