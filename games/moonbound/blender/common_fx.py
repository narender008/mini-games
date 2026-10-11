"""Moonbound, the common set (SET common, 64 px/m): pickups seen in every region and the small flying/debris sprites.

  pk_silver            a small heap of old silver coins
  pk_heartroot         a heart-shaped red-violet root bulb with a soft inner glow (health)
  pk_moonshard         a cluster of pale crystal shards glowing cyan (upgrade resource)
  pk_blessing_socket   an ornate gold setting that holds a blessing orb (the orb itself is a shader); anchor orb = the orb centre
  fx_arrow             a black-fletched arrow, 0.8 m, lying along +x, pivot at its middle (the game rotates it in flight)
  fx_bone_shard_a..d   small bone splinters for debris particles, pivot at the centre
"""
import math
import random

from mathutils import Vector

import bl
import gwkit_mats
from bl import Mesh, trans, rotx, roty, rotz, scale, PI
from gwkit_shapes import sel, revolve, crescent, moss
from gwkit_decor import circle_pts, prof

SET = 'common'
PPM = 64
LOOK = dict(edge=0.30, cavity=0.45)


def coin(m, x, y, z, r, rot, mat, rng, thick=0.011):
    c = Mesh('coin')
    c.lathe([(0.0, r * 0.96), (thick * 0.2, r), (thick * 0.8, r), (thick, r * 0.94)], mat, seg=14, smooth=0.0, cap=True)
    c.lathe([(thick, r * 0.74), (thick + 0.002, r * 0.7), (thick + 0.002, 0.0)], mat, seg=12, smooth=0.0, cap=True)
    c.transform(rot)
    zmin = min(v.co.z for v in c.bm.verts)
    c.transform(trans(0, 0, -zmin))
    m.add(c, trans(x, y, z))
    c.free()


def silver(seed=1101):
    """pk_silver: a small heap of old silver coins, a few tarnished, one stamped with a crescent."""
    rng = random.Random(seed)
    m = Mesh('pk_silver')
    # the heap: coins stacked in a rough cone, each tilted at random
    placed = []
    n = 40
    for i in range(n):
        a = rng.uniform(0, 2 * PI)
        d = math.sqrt(rng.random()) * 0.19
        h = max(0.0, 0.15 * (1 - d / 0.21)) ** 1.0
        z = h * rng.uniform(0.7, 1.0) + 0.0
        rot = rotz(rng.uniform(0, 2 * PI)) @ rotx(rng.uniform(-0.55, 0.55)) @ roty(rng.uniform(-0.55, 0.55))
        mat = 'gw_silver' if rng.random() < 0.6 else 'gw_steel'
        coin(m, d * math.cos(a), d * math.sin(a) * 0.9, z, rng.uniform(0.05, 0.064), rot, mat, rng)
    # a few lying flat around the foot
    for i in range(7):
        a = rng.uniform(0, 2 * PI)
        d = rng.uniform(0.2, 0.3)
        coin(m, d * math.cos(a), d * math.sin(a) * 0.9, 0.0, 0.055, rotz(rng.uniform(0, 6)) @ rotx(rng.uniform(-0.12, 0.12)), 'gw_silver', rng)
    # one coin leaning on the top of the heap
    coin(m, 0.0, -0.02, 0.15, 0.058, rotx(0.35), 'gw_silver', rng)
    return m


def heartroot(seed=1111):
    """pk_heartroot: a heart-shaped red-violet root bulb with soft inner glow, root tendrils and glowing veins."""
    rng = random.Random(seed)
    m = Mesh('pk_heartroot')
    S = 1.0
    zc = 0.22
    # two lobes and a tapering lower body
    lobes = Mesh('lobes')
    lobes.ball((-0.092, 0.0, zc + 0.07), (0.125, 0.11, 0.115), 'gw_heart', seg=18, rings=12)
    lobes.ball((0.092, 0.0, zc + 0.07), (0.125, 0.11, 0.115), 'gw_heart', seg=18, rings=12)
    lobes.hull([(-0.19, -0.05, zc + 0.03), (0.19, -0.05, zc + 0.03), (-0.19, 0.05, zc + 0.03), (0.19, 0.05, zc + 0.03), (0.0, -0.045, zc - 0.17),
                (0.0, 0.045, zc - 0.17), (-0.12, 0.0, zc - 0.08), (0.12, 0.0, zc - 0.08), (-0.1, -0.08, zc + 0.12), (0.1, -0.08, zc + 0.12)],
               'gw_heart', bevel=0.03, smooth=60)
    lobes.warp(0.012, 8.0, seed)
    m.add(lobes)
    lobes.free()
    # veins: glowing lines curving over the front
    for k in range(5):
        a0 = -0.6 + 0.3 * k
        pts = []
        for i in range(9):
            t = i / 8
            x = a0 * (1 - 0.7 * t) * 0.16 + 0.0
            z = zc + 0.17 - 0.33 * t
            y = -0.1 + 0.05 * t * t
            pts.append((x * (1.0 + 0.6 * math.sin(t * 3 + k)) if False else (a0 * 0.18 * (1 - 0.8 * t)), y - 0.01, z))
        m.tube(pts, [0.006 * (1 - 0.5 * t / 8) for t in range(9)], 'gw_heart_vein', seg=4, cap=True)
    # the aorta tubes at the top, root tendrils and little sprouts
    for sg in (-1, 1):
        m.tube([(sg * 0.07, 0.0, zc + 0.16), (sg * 0.09, 0.0, zc + 0.26), (sg * 0.05, 0.02, zc + 0.34), (sg * 0.1, 0.03, zc + 0.4)], [0.035, 0.03, 0.025, 0.012], 'gw_root',
               seg=7, cap=True)
    for k in range(7):
        a = 2 * PI * k / 7 + rng.uniform(-0.3, 0.3)
        pts = [(0.0, 0.0, zc - 0.14)]
        for i in range(1, 6):
            t = i / 5
            pts.append((0.28 * t * math.cos(a) + 0.05 * math.sin(6 * t + k), 0.22 * t * math.sin(a) + 0.04 * math.cos(5 * t + k), max(0.012, zc - 0.14 - 0.2 * t ** 0.7 + 0.04 * math.sin(7 * t + k))))
        m.tube(pts, [0.03 * (1 - 0.8 * i / 5) + 0.004 for i in range(6)], 'gw_root', seg=6, cap=True)
    for sg in (-1, 1):
        m.ball((sg * 0.12, 0.03, zc + 0.43), (0.04, 0.008, 0.07), 'gw_ivy', seg=8, rings=5, rot=roty(sg * 0.4))
    m.transform(scale(1.18, 1.18, 1.18))
    return m


def moonshard(seed=1121):
    """pk_moonshard: a cluster of pale crystal shards glowing cyan, rising from a chip of dark stone."""
    rng = random.Random(seed)
    m = Mesh('pk_moonshard')
    m.hull([(rng.uniform(-0.17, 0.17), rng.uniform(-0.13, 0.13), rng.uniform(0, 0.05)) for _ in range(9)] + [(sx * 0.16, sy * 0.12, 0.0) for sx in (-1, 1) for sy in (-1, 1)],
           'gw_stone_dark', bevel=0.012, smooth=30)
    shards = [(0.0, 0.0, 0.52, 0.06, 0.0, 0.0), (-0.09, 0.03, 0.36, 0.05, -0.35, 0.3), (0.1, 0.02, 0.4, 0.05, 0.3, -0.25), (-0.04, -0.08, 0.28, 0.045, 0.25, 0.4),
              (0.06, -0.07, 0.24, 0.04, -0.3, -0.5), (-0.15, -0.03, 0.2, 0.035, -0.7, 0.2), (0.16, -0.04, 0.22, 0.035, 0.7, -0.1), (0.0, 0.08, 0.3, 0.04, 0.0, 0.5)]
    for i, (x, y, h, r, tx, ty) in enumerate(shards):
        s = Mesh('shard')
        pts = []
        # a hexagonal prism with a faceted point
        for k in range(6):
            a = 2 * PI * k / 6
            pts.append((r * math.cos(a), r * math.sin(a), 0.0))
            pts.append((r * 0.92 * math.cos(a), r * 0.92 * math.sin(a), h * 0.78))
        pts.append((r * 0.15, r * 0.1, h))
        s.hull(pts, 'gw_crystal', bevel=0.004, smooth=0.0)
        # a bright core
        core = [(0.0, 0.0, 0.02)] + [(r * 0.4 * math.cos(2 * PI * k / 5), r * 0.4 * math.sin(2 * PI * k / 5), h * 0.7) for k in range(5)] + [(r * 0.1, 0.0, h * 0.92)]
        s.hull(core, 'gw_crystal_core', bevel=0.002, smooth=0.0)
        s.transform(roty(tx) @ rotx(ty))
        zmin = min(v.co.z for v in s.bm.verts)
        m.add(s, trans(x, y, -zmin + 0.01))
        s.free()
    # tiny loose splinters on the ground
    for i in range(6):
        a = rng.uniform(0, 2 * PI)
        d = rng.uniform(0.15, 0.26)
        sp = Mesh('sp')
        sp.hull([(0, 0, 0), (0.02, 0.0, 0.0), (0.0, 0.015, 0.0), (0.005, 0.005, 0.07)], 'gw_crystal', bevel=0.002, smooth=0.0)
        sp.transform(rotz(rng.uniform(0, 6)) @ roty(rng.uniform(1.0, 1.4)))
        zmin = min(v.co.z for v in sp.bm.verts)
        m.add(sp, trans(d * math.cos(a), d * math.sin(a), -zmin))
        sp.free()
    return m


def blessing_socket(seed=1131):
    """pk_blessing_socket: an ornate aged-gold setting with four curling claws that cradle a blessing orb; the orb itself is a shader
    drawn at anchors.orb. Base radius 0.3."""
    rng = random.Random(seed)
    m = Mesh('pk_blessing_socket')
    # stepped round base with a beaded rim
    m.lathe([(0.0, 0.0), (0.0, 0.3), (0.025, 0.31), (0.05, 0.28), (0.07, 0.25), (0.1, 0.2), (0.13, 0.12), (0.15, 0.09)], 'gw_gold', seg=36, smooth=50.0, cap=True)
    m.lathe([(0.11, 0.0), (0.11, 0.18), (0.125, 0.19)], 'gw_stone_dark', seg=36, smooth=40.0, cap=False)
    for k in range(24):
        a = 2 * PI * k / 24
        m.ball((0.29 * math.cos(a), 0.29 * math.sin(a), 0.035), (0.017, 0.017, 0.017), 'gw_gold_dim', seg=6, rings=4)
    m.tube(circle_pts((0, 0, 0.1), 0.2, 0.2, 36, 'xy'), 0.012, 'gw_gold_dim', seg=5, cap=False)
    # a shallow cup in the middle for the orb to float over, and four prongs curling inward round it
    m.lathe([(0.15, 0.05), (0.17, 0.065), (0.2, 0.06), (0.24, 0.085)], 'gw_gold', seg=20, smooth=50.0, cap=True)
    def bez(t, p0, p1, p2, p3):
        u = 1 - t
        return tuple(u ** 3 * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t ** 3 * p3[i] for i in range(2))
    for k in range(4):
        a = 2 * PI * k / 4 + PI / 4
        pts = []
        rad = []
        for i in range(14):
            t = i / 13
            rr, zz = bez(t, (0.285, 0.09), (0.31, 0.36), (0.2, 0.44), (0.085, 0.6))
            pts.append((rr * math.cos(a), rr * math.sin(a), zz))
            rad.append(0.028 - 0.019 * t)
        m.tube(pts, rad, 'gw_gold', seg=6, cap=True)
        m.ball(pts[-1], (0.022, 0.022, 0.022), 'gw_gold', seg=8, rings=5)
        # a scroll curling outward from each prong's foot
        sp = []
        for i in range(8):
            t = i / 7
            rr = 0.28 + 0.1 * t
            aa = a + 0.5 * t * (1 if k % 2 else -1)
            sp.append((rr * math.cos(aa), rr * math.sin(aa), 0.09 + 0.05 * math.sin(t * PI)))
        m.tube(sp, 0.01, 'gw_gold_dim', seg=5, cap=True)
        m.ball((sp[-1][0], sp[-1][1], sp[-1][2]), (0.016, 0.016, 0.016), 'gw_gold', seg=6, rings=4)
    # a thin ring of engraved crescents under the claws
    for k in range(8):
        a = 2 * PI * k / 8
        rr = 0.255
        cres = Mesh('c')
        crescent(cres, 0, 0, 0.032, -0.004, 0.004, 'gw_gold_dim', thick=0.5, off=0.34, bevel=0.001)
        m.add(cres, trans(rr * math.cos(a), rr * math.sin(a), 0.115) @ rotz(a) @ rotx(PI / 2) @ rotz(PI / 2))
        cres.free()
    return m


def arrow(seed=1141):
    """fx_arrow: 0.8 m, lying along +x with its middle at the origin: a pale ash shaft, a barbed iron head at +x, black fletching and a nock."""
    rng = random.Random(seed)
    m = Mesh('fx_arrow')
    z = 0.04
    m.cyl((-0.4, 0, z), (0.33, 0, z), 0.0105, 0.0105, 'gw_wood', seg=6, smooth=60.0)
    # head: a leaf-shaped blade with barbs
    m.hull([(0.33, -0.016, z), (0.33, 0.016, z), (0.33, 0, z - 0.016), (0.33, 0, z + 0.016), (0.4, 0, z)], 'gw_steel', bevel=0.002, smooth=30)
    m.hull([(0.31, 0, z), (0.34, -0.026, z), (0.34, 0.026, z), (0.36, 0, z)], 'gw_steel', bevel=0.001, smooth=0)
    # fletching: three vanes of black feather, swept, one pointing up and two down-left/right
    for k in range(3):
        a = PI / 2 + 2 * PI * k / 3
        ca, sa = math.cos(a), math.sin(a)
        pts = []
        for (x, rr) in ((-0.4, 0.012), (-0.4, 0.052), (-0.31, 0.052), (-0.26, 0.012)):
            for t in (-0.0022, 0.0022):
                pts.append((x, ca * rr - sa * t, z + sa * rr + ca * t))
        m.hull(pts, 'gw_fletch', bevel=0.0012, smooth=0)
    m.ball((-0.405, 0, z), (0.012, 0.014, 0.014), 'gw_iron', seg=6, rings=4)
    m.cyl((-0.33, 0, z), (-0.3, 0, z), 0.014, 0.014, 'gw_iron', seg=6)
    return m


def bone_shard(seed, size):
    rng = random.Random(seed)
    m = Mesh('shard')
    L = size
    r = size * 0.14
    pts = []
    for i in range(7):
        t = i / 6
        w = r * (0.7 + 0.5 * math.sin(t * PI * 0.8 + 0.4) + rng.uniform(-0.1, 0.12))
        for k in range(4):
            a = 2 * PI * k / 4 + rng.uniform(-0.25, 0.25)
            pts.append((-L / 2 + L * t, w * math.cos(a), w * 0.8 * math.sin(a)))
    pts.append((-L / 2 - L * 0.12, 0, 0))
    pts.append((L / 2 + L * 0.25 * rng.random(), r * 0.2, 0))
    m.hull(pts, 'fx_bone', bevel=size * 0.015, smooth=0)
    # a darker marrow end
    m.hull([(-L / 2 - L * 0.1, r * 0.4 * math.cos(2 * PI * k / 5), r * 0.4 * math.sin(2 * PI * k / 5)) for k in range(5)] + [(-L / 2 + L * 0.05, 0, 0)], 'gw_bone_dark',
           bevel=size * 0.004, smooth=0)
    m.transform(rotx(rng.uniform(0, 1.0)) @ rotz(rng.uniform(-0.3, 0.3)))
    return m


gwkit_mats.d('fx_bone', base='#ece3cc', base2='#b8ad92', pattern='noise', pscale=14, pamt=0.4, gloss=0.2, bevel=0.004, seed=141)
gwkit_mats.d('gw_fletch', base='#14151a', base2='#2a2d38', pattern='stripes', pscale=30, pamt=0.5, gloss=0.15, bevel=0.003, seed=140)


def build(ctx):
    gwkit_mats.images()
    items = [('pk_silver', silver, [0.6, 0.5]), ('pk_heartroot', heartroot, [0.6, 0.5]), ('pk_moonshard', moonshard, [0.6, 0.5]),
             ('pk_blessing_socket', blessing_socket, [0.7, 0.7]), ('fx_arrow', arrow, [0.8, 0.1])]
    for nm, fn, fp in items:
        if not sel(nm):
            continue
        ctx.one(nm, fn(), ppm=PPM, look=LOOK)
        ctx.value('footprint', nm, fp)
    if sel('pk_heartroot'):
        ctx.anchor('light', 'pk_heartroot', (0, -0.05, 0.2))
    if sel('pk_moonshard'):
        ctx.anchor('light', 'pk_moonshard', (0, 0, 0.3))
    if sel('pk_blessing_socket'):
        ctx.anchor('orb', 'pk_blessing_socket', (0, 0, 0.42))
    for i, nm in enumerate(('fx_bone_shard_a', 'fx_bone_shard_b', 'fx_bone_shard_c', 'fx_bone_shard_d')):
        if sel(nm):
            ctx.one(nm, bone_shard(1200 + i * 7, (0.14, 0.18, 0.11, 0.2)[i]), ppm=PPM, look=LOOK)
