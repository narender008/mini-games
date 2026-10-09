"""Field pickups and thrown bombs (Lane C): XP crystals, coin, magnet, freeze, shield, bomb, heart, lightning, grenade, ice bomb.

Every icon stands upright in the XZ plane facing the camera and is rendered with elev=15 so it reads face-on. The pivot is the
centre of the icon. Glowing parts use `emit` below 0.5 (the game keeps a lit share of the colour, but ink lines at the facet
creases survive) or above 0.5 for the hot spots that must stay bright (a bomb's spark).

Frames (48 px/m): xp_small, xp_big, coin, pickup_magnet, pickup_freeze, pickup_shield, pickup_bomb, pickup_heart,
pickup_lightning, bomb_thrown, ice_bomb.
"""
import math

import bmesh
from mathutils import Vector

import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from props import one, rock

PI = math.pi
ELEV = 15.0


def _materials():
    d = mats.define
    d('pk_xp_hi', base='#a9e8ff', emit=0.45, bevel=0.006)
    d('pk_xp_mid', base='#3fb0ff', emit=0.45, bevel=0.006)
    d('pk_xp_lo', base='#1f72e0', emit=0.45, bevel=0.006)
    d('pk_gold', base='#ffc12a', base2='#fff0a0', pattern='noise', pscale=3, pamt=0.25, bevel=0.012)
    d('pk_gold_dark', base='#d98a10', bevel=0.008)
    d('pk_gold_hi', base='#fff1a6', bevel=0.008)
    d('pk_magnet_red', base='#e8302a', base2='#ff6a5a', pattern='noise', pscale=3, pamt=0.25, bevel=0.02)
    d('pk_steel', base='#d4dce8', base2='#a9b4c4', pattern='noise', pscale=4, pamt=0.4, bevel=0.012)
    d('pk_steel_dark', base='#6a7384', bevel=0.01)
    d('pk_ice', base='#9fe6ff', emit=0.45, bevel=0.008)
    d('pk_ice_hi', base='#e6fbff', emit=0.55, bevel=0.008)
    d('pk_ice_lo', base='#4fb4ee', emit=0.45, bevel=0.008)
    d('pk_shield_blue', base='#2f78e8', base2='#5aa4ff', pattern='fade', z0=-0.4, z1=0.4, pamt=0.7, bevel=0.015)
    d('pk_shield_hi', base='#8cc4ff', bevel=0.01)
    d('pk_white', base='#f6f8ff', bevel=0.008)
    d('pk_bomb_red', base='#e22a2a', base2='#a81414', pattern='fade', z0=-0.3, z1=0.3, pamt=0.6, bevel=0.03)
    d('pk_bomb_hi', base='#ff8f86', bevel=0.01)
    d('pk_iron', base='#2c2f3a', bevel=0.012)
    d('pk_fuse', base='#d9c08a', bevel=0.01)
    d('pk_spark', base='#ffd23a', emit=1.0, bevel=0.005)
    d('pk_spark_hot', base='#ff8a1c', emit=1.0, bevel=0.005)
    d('pk_heart', base='#ee2a4a', base2='#c01636', pattern='fade', z0=-0.4, z1=0.3, pamt=0.7, bevel=0.03)
    d('pk_heart_hi', base='#ffb0bd', bevel=0.01)
    d('pk_bolt', base='#ffc81a', base2='#ffa000', pattern='fade', z0=-0.5, z1=0.5, pamt=0.6, emit=0.4, bevel=0.015)
    d('pk_bolt_hi', base='#fff4a6', emit=0.5, bevel=0.01)
    d('pk_purple', base='#8a4fe0', base2='#5a2cb0', pattern='fade', z0=-0.3, z1=0.3, pamt=0.6, bevel=0.03)
    d('pk_purple_hi', base='#c9a4ff', bevel=0.01)
    d('pk_cap_cyan', base='#7ff2ff', emit=1.0, bevel=0.006)


_materials()


def pillow(m, pts_xz, y0, y1, mat, bevel=0.05, seg=3, mx=None, smooth=65.0):
    """A polygon in the XZ plane extruded along Y with rounded edges (puffy heart, bolt, shield)."""
    tb = bmesh.new()
    vs = [tb.verts.new((x, y0, z)) for x, z in pts_xz]
    f = tb.faces.new(vs)
    r = bmesh.ops.extrude_face_region(tb, geom=[f])
    nv = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(tb, vec=(0, y1 - y0, 0), verts=nv)
    m.commit(tb, mat, smooth, mx, bevel, seg)


def shrink(pts, k, c=(0.0, 0.0)):
    return [(c[0] + (x - c[0]) * k, c[1] + (z - c[1]) * k) for x, z in pts]


def crystal(m, h, r, mx=None, mats3=('pk_xp_hi', 'pk_xp_mid', 'pk_xp_lo')):
    """An upright hexagonal gem: a pointed top, a short faceted waist and a pointed foot, in three baked tones."""
    hi, mid, lo = mats3
    m.lathe([(h * 0.2, r), (h * 0.5, 0.0)], hi, mx=mx, seg=6, smooth=0.0, cap=False, phase=0.3)
    m.lathe([(-h * 0.2, r), (h * 0.2, r)], mid, mx=mx, seg=6, smooth=0.0, cap=False, phase=0.3)
    m.lathe([(-h * 0.5, 0.0), (-h * 0.2, r)], lo, mx=mx, seg=6, smooth=0.0, cap=False, phase=0.3)


def xp_small():
    m = Mesh('xp_small')
    crystal(m, 0.62, 0.17)
    return m


def xp_big():
    m = Mesh('xp_big')
    crystal(m, 0.95, 0.27)
    crystal(m, 0.5, 0.13, mx=trans(-0.27, 0.0, -0.22) @ roty(-0.45))
    crystal(m, 0.42, 0.11, mx=trans(0.27, 0.02, -0.25) @ roty(0.5))
    return m


def coin():
    m = Mesh('coin')
    r = 0.27
    flat = rotx(PI / 2)
    m.lathe([(-0.04, 0.0), (-0.04, r * 0.94), (-0.028, r), (0.028, r), (0.04, r * 0.94), (0.04, 0.0)], 'pk_gold_dark', mx=flat, seg=28, smooth=45.0, cap=False)
    m.lathe([(0.036, r * 0.9), (0.052, r * 0.86), (0.052, r * 0.74), (0.036, r * 0.72)], 'pk_gold', mx=flat, seg=28, smooth=40.0, cap=False)
    m.lathe([(0.036, 0.0), (0.036, r * 0.72)], 'pk_gold', mx=flat, seg=28, smooth=0.0, cap=False)
    star = [((0.15 if k % 2 == 0 else 0.07) * math.sin(PI * k / 5), (0.15 if k % 2 == 0 else 0.07) * math.cos(PI * k / 5)) for k in range(10)]
    m.prism(star, -0.07, -0.04, 'pk_gold_hi', bevel=0.006)
    m.transform(rotz(0.5))
    return m


def magnet():
    m = Mesh('magnet')
    R, leg = 0.3, 0.42
    arc = [(-R, 0.0, leg)]
    arc += [(-R * math.cos(PI * k / 16), 0.0, -R * math.sin(PI * k / 16)) for k in range(17)]
    arc += [(R, 0.0, leg)]
    m.tube(arc, 0.135, 'pk_magnet_red', seg=12, smooth=70.0, cap=True)
    for sx in (-1, 1):                                              # silver pole tips with a dark band
        x = sx * R
        m.cyl((x, 0, leg - 0.3), (x, 0, leg + 0.04), 0.145, 0.145, 'pk_steel', seg=12, bevel=0.012)
        m.cyl((x, 0, leg - 0.32), (x, 0, leg - 0.28), 0.15, 0.15, 'pk_steel_dark', seg=12)
        m.cyl((x, 0, leg + 0.04), (x, 0, leg + 0.06), 0.1, 0.1, 'pk_steel_dark', seg=12)
    # a glossy highlight along the outer curve
    hl = [(-R * 1.14 * math.cos(PI * k / 16 + 0.15), -0.1, -R * 1.14 * math.sin(PI * k / 16 + 0.15) + 0.01) for k in range(2, 8)]
    m.tube(hl, 0.02, 'pk_heart_hi', seg=6)
    m.transform(rotz(-0.35))
    return m


def snowflake():
    m = Mesh('freeze')
    m.cyl((0, 0.06, 0), (0, -0.06, 0), 0.17, 0.17, 'pk_ice_hi', seg=6, bevel=0.012)
    for k in range(6):
        a = PI / 6 + k * PI / 3
        ux, uz = math.cos(a), math.sin(a)

        def pt(t, off=0.0):
            return (ux * t - uz * off, 0.0, uz * t + ux * off)
        m.cyl(pt(0.12), pt(0.52), 0.06, 0.05, 'pk_ice', seg=6)
        m.cyl(pt(0.5), pt(0.62), 0.05, 0.0, 'pk_ice_hi', seg=6)
        for t, ln, rr in ((0.27, 0.2, 0.04), (0.42, 0.14, 0.035)):
            for sg in (-1, 1):
                b = (pt(t)[0] + (ux * math.cos(sg * 0.9) - uz * math.sin(sg * 0.9)) * ln, 0.0, pt(t)[2] + (uz * math.cos(sg * 0.9) + ux * math.sin(sg * 0.9)) * ln)
                m.cyl(pt(t), b, rr, rr * 0.5, 'pk_ice_lo', seg=6)
                m.sphere(b, rr * 0.9, 'pk_ice_hi', seg=6)
    m.cyl((0, -0.055, 0), (0, -0.075, 0), 0.1, 0.07, 'pk_white', seg=6)
    return m


SHIELD = [(-0.42, 0.42), (-0.42, 0.0), (-0.34, -0.2), (-0.18, -0.38), (0.0, -0.52), (0.18, -0.38), (0.34, -0.2), (0.42, 0.0), (0.42, 0.42),
          (0.2, 0.48), (0.0, 0.42), (-0.2, 0.48)]


def shield():
    m = Mesh('shield')
    pillow(m, SHIELD, -0.07, 0.07, 'pk_steel', bevel=0.03, seg=2)
    face = shrink(SHIELD, 0.8, (0, 0.0))
    pillow(m, face, -0.1, 0.0, 'pk_shield_blue', bevel=0.03, seg=2)
    # lighter left half and a white star
    pillow(m, [(-0.336, 0.336), (-0.336, 0.0), (-0.27, -0.16), (-0.14, -0.3), (0.0, -0.42), (0.0, 0.34), (-0.16, 0.38)], -0.103, -0.05, 'pk_shield_hi', bevel=0.01, seg=1)
    star = [((0.2 if k % 2 == 0 else 0.09) * math.sin(PI * k / 5), 0.0 + (0.2 if k % 2 == 0 else 0.09) * math.cos(PI * k / 5)) for k in range(10)]
    m.prism(star, -0.135, -0.1, 'pk_white', mx=trans(0, 0, 0.04), bevel=0.012)
    for sx in (-1, 1):                                              # rivets on the rim
        m.sphere((sx * 0.37, -0.075, 0.38), 0.03, 'pk_steel_dark', seg=6)
    return m


def bomb(spark=True, body='pk_bomb_red', hi='pk_bomb_hi', r=0.34, neck_r=0.12):
    m = Mesh('bomb')
    m.ball((0, 0, 0), (r, r, r), body, seg=24, rings=14)
    m.ball((-r * 0.42, -r * 0.78, r * 0.38), (r * 0.2, r * 0.05, r * 0.13), hi, seg=12, rings=8, rot=roty(0.5))   # glossy highlight
    # neck and cap
    m.cyl((0, 0, r * 0.82), (0, 0, r * 1.18), neck_r, neck_r * 0.92, 'pk_iron', seg=14, bevel=0.01)
    m.cyl((0, 0, r * 1.12), (0, 0, r * 1.26), neck_r * 1.15, neck_r * 1.15, 'pk_steel_dark', seg=14, bevel=0.01)
    if spark:
        fuse = [(0, 0, r * 1.24), (0.04, 0, r * 1.5), (0.16, 0, r * 1.68), (0.32, 0, r * 1.72)]
        m.tube(fuse, 0.028, 'pk_fuse', seg=6)
        c = Vector((0.36, 0.0, r * 1.74))
        for k in range(8):
            a = 2 * PI * k / 8
            ln = 0.16 if k % 2 == 0 else 0.1
            m.cyl(tuple(c), (c.x + math.cos(a) * ln, c.y, c.z + math.sin(a) * ln), 0.035, 0.0, 'pk_spark', seg=5)
        m.ball(tuple(c), (0.08, 0.08, 0.08), 'pk_spark_hot', seg=10, rings=6)
    return m


def heart():
    m = Mesh('heart')
    pts = []
    for k in range(40):
        t = 2 * PI * k / 40
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 34.0, (y + 2.5) / 34.0))
    pts.reverse()
    pillow(m, pts, -0.13, 0.13, 'pk_heart', bevel=0.09, seg=4, smooth=70.0)
    m.ball((-0.2, -0.14, 0.2), (0.11, 0.02, 0.065), 'pk_heart_hi', seg=12, rings=6, rot=roty(-0.6))
    m.ball((-0.33, -0.1, 0.07), (0.03, 0.015, 0.03), 'pk_heart_hi', seg=8, rings=5)
    return m


BOLT = [(0.06, 0.56), (-0.32, -0.04), (-0.06, -0.04), (-0.2, -0.58), (0.34, 0.12), (0.08, 0.12), (0.3, 0.56)]


def lightning():
    m = Mesh('lightning')
    pillow(m, BOLT, -0.07, 0.07, 'pk_bolt', bevel=0.035, seg=2, smooth=50.0)
    pillow(m, shrink(BOLT, 0.55, (0.02, 0.0)), -0.095, -0.05, 'pk_bolt_hi', bevel=0.015, seg=1, smooth=50.0)
    return m


def grenade():
    """The hero's thrown bomb: a small red grenade with a ribbed iron band and a glowing orange cap."""
    m = Mesh('grenade')
    r = 0.2
    m.ball((0, 0, 0), (r, r, r * 1.05), 'pk_bomb_red', seg=20, rings=12)
    m.ball((-r * 0.4, -r * 0.8, r * 0.4), (r * 0.2, r * 0.05, r * 0.12), 'pk_bomb_hi', seg=10, rings=6, rot=roty(0.5))
    m.lathe([(-0.06, r * 1.0), (-0.03, r * 1.04), (0.03, r * 1.04), (0.06, r * 1.0)], 'pk_iron', seg=20, smooth=40.0, cap=False)
    m.cyl((0, 0, r * 0.85), (0, 0, r * 1.2), 0.085, 0.075, 'pk_iron', seg=12, bevel=0.008)
    m.cyl((0, 0, r * 1.15), (0, 0, r * 1.38), 0.062, 0.05, 'pk_spark_hot', seg=10, bevel=0.006)
    m.ball((0, 0, r * 1.42), (0.055, 0.055, 0.04), 'pk_spark', seg=8, rings=5)
    ring = [(0.1 + 0.07 * math.cos(2 * PI * k / 12), 0.0, r * 1.2 + 0.07 * math.sin(2 * PI * k / 12)) for k in range(13)]
    m.tube(ring, 0.014, 'pk_steel', seg=6)
    return m


def ice_bomb():
    m = Mesh('ice_bomb')
    r = 0.2
    m.ball((0, 0, 0), (r, r, r * 1.05), 'pk_purple', seg=20, rings=12)
    m.ball((-r * 0.4, -r * 0.8, r * 0.4), (r * 0.2, r * 0.05, r * 0.12), 'pk_purple_hi', seg=10, rings=6, rot=roty(0.5))
    for dx, dy, dz in ((-0.95, -0.3, 0.15), (0.95, -0.3, 0.15), (-0.7, -0.4, -0.7), (0.7, -0.4, -0.7), (0.0, -0.5, -1.0), (-0.45, -0.85, 0.35), (0.45, -0.85, 0.35)):
        d = Vector((dx, dy, dz)).normalized()
        m.cyl(tuple(d * r * 0.7), tuple(d * r * 1.75), 0.07, 0.0, 'pk_ice_hi', seg=5)
    m.cyl((0, 0, r * 0.85), (0, 0, r * 1.2), 0.085, 0.075, 'pk_steel_dark', seg=12, bevel=0.008)
    m.cyl((0, 0, r * 1.15), (0, 0, r * 1.38), 0.062, 0.05, 'pk_cap_cyan', seg=10, bevel=0.006)
    m.ball((0, 0, r * 1.42), (0.055, 0.055, 0.04), 'pk_ice_hi', seg=8, rings=5)
    return m


def build(ctx):
    kw = dict(elev=ELEV)
    one(ctx, 'xp_small', xp_small, **kw)
    one(ctx, 'xp_big', xp_big, **kw)
    one(ctx, 'coin', coin, **kw)
    one(ctx, 'pickup_magnet', magnet, **kw)
    one(ctx, 'pickup_freeze', snowflake, **kw)
    one(ctx, 'pickup_shield', shield, **kw)
    one(ctx, 'pickup_bomb', bomb, **kw)
    one(ctx, 'pickup_heart', heart, **kw)
    one(ctx, 'pickup_lightning', lightning, **kw)
    one(ctx, 'bomb_thrown', grenade, **kw)
    one(ctx, 'ice_bomb', ice_bomb, **kw)
    ctx.anchor('spark', 'pickup_bomb', (0.36, 0.0, 0.34 * 1.74), elev=ELEV)
    ctx.anchor('cap', 'bomb_thrown', (0.0, 0.0, 0.2 * 1.4), elev=ELEV)
    ctx.anchor('cap', 'ice_bomb', (0.0, 0.0, 0.2 * 1.4), elev=ELEV)
