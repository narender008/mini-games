"""Loot (Lane D): the four weapon pickups, the weapon crate, three power-surge icons and charred flamethrower gibs.

Weapons and surge icons are drawn like pickups.py: upright in the XZ plane facing the camera, elev=15, pivot = centre of the icon.
The weapon crate is drawn like a prop (default elev, pivot = base centre, it sits on the road). The char gibs are drawn like gibs.py.
Materials are keyed `lt_*`. Glow: `emit` below 0.5 on trim and icons (ink survives), above 0.5 only on hot spots (flames, eyes).

Frames (default px/m): weapon_blaster, weapon_scatter, weapon_rocket, weapon_flamer, crate_weapon, surge_overdrive, surge_triple,
surge_rage, gib_char_0..2.
Anchors: glow.crate_weapon (where a weapon floats above the open crate), pad.crate_weapon (the glowing pad in the open crate),
flame.weapon_flamer (the pilot flame). All are game-unit offsets from the frame pivot: [x right, y down].
"""
import math

import bl
import hero
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from gibs import tilt, centre, GIB_SCALE
from mathutils import Matrix, Vector
from pickups import pillow, shrink
from props import one, rock, clip_poly_x

PI = math.pi
ELEV = 15.0          # weapons and icons face the viewer
_A = {}              # anchor points collected while the meshes are built (so a frame filter skips them cleanly)


def _materials():
    d = mats.define
    # steel, rubber, brass: shared by the weapons
    d('lt_steel', base='#c9d1dd', base2='#98a3b4', pattern='noise', pscale=5, pamt=0.45, bevel=0.01, seed=201)
    d('lt_steel_dk', base='#4c5465', base2='#383f4e', pattern='noise', pscale=6, pamt=0.5, bevel=0.01, seed=202)
    d('lt_black', base='#1b1c22', bevel=0.008)
    d('lt_rubber', base='#2c2d35', base2='#3b3d48', pattern='noise', pscale=7, pamt=0.5, bevel=0.015, seed=203)
    d('lt_brass', base='#e3a82c', base2='#ffd978', pattern='noise', pscale=3, pamt=0.35, bevel=0.01, seed=204)
    d('lt_brass_dk', base='#a8741a', bevel=0.01)
    # scatter gun
    d('lt_orange', base='#ff8a1c', base2='#ff6a10', pattern='noise', pscale=3, pamt=0.3, bevel=0.015, seed=205)
    d('lt_orange_hi', base='#ffbb55', bevel=0.012)
    d('lt_orange_dk', base='#c45a0c', bevel=0.012)
    d('lt_shell', base='#e8302a', bevel=0.008)
    # rocket pod
    d('lt_olive', base='#728c30', base2='#5a7424', pattern='noise', pscale=3, pamt=0.35, bevel=0.015, seed=206)
    d('lt_olive_lt', base='#93b242', bevel=0.012)
    d('lt_olive_dk', base='#455a1a', bevel=0.012)
    d('lt_hazard_y', base='#ffcc1a', bevel=0.004)
    d('lt_hazard_k', base='#1d1d22', bevel=0.004)
    d('lt_rocket_body', base='#f0f1e6', base2='#c7cabb', pattern='noise', pscale=4, pamt=0.4, bevel=0.01, seed=207)
    d('lt_rocket_red', base='#ea281e', base2='#b81812', pattern='fade', z0=-0.3, z1=0.3, pamt=0.3, bevel=0.01)
    # flamethrower
    d('lt_tank_red', base='#e5301f', base2='#b01a10', pattern='noise', pscale=3, pamt=0.3, bevel=0.015, seed=208)
    d('lt_tank_hi', base='#ff7a5c', bevel=0.01)
    d('lt_hose', base='#25262d', bevel=0.012)
    d('lt_flame_o', base='#ff7a14', emit=1.0, bevel=0.01)
    d('lt_flame_y', base='#ffd23a', emit=1.0, bevel=0.01)
    d('lt_flame_b', base='#52c8ff', emit=1.0, bevel=0.01)
    # weapon crate
    d('lt_foam', base='#1d3438', base2='#2a4a50', pattern='noise', pscale=8, pamt=0.5, bump=0.3, bevel=0.01, seed=209)
    d('lt_cyan', base='#56f0ff', emit=0.4, bevel=0.005)
    d('lt_cyan_glow', base='#8af6ff', emit=0.48, bevel=0.005)
    d('lt_label', base='#efe9d2', bevel=0.005)
    # surge icons
    d('lt_gauge_o', base='#ff9a1a', base2='#ffb83a', pattern='fade', z0=-0.3, z1=0.3, pamt=0.7, emit=0.3, bevel=0.015)
    d('lt_gauge_hi', base='#ffe066', emit=0.35, bevel=0.008)
    d('lt_gauge_face', base='#ffe27a', bevel=0.01)
    d('lt_red_zone', base='#e8221a', emit=0.4, bevel=0.005)
    d('lt_tick', base='#4a2a12', bevel=0.004)
    d('lt_needle', base='#241a16', bevel=0.006)
    d('lt_wing_o', base='#ff7a14', base2='#ff9d2a', pattern='noise', pscale=3, pamt=0.4, emit=0.45, bevel=0.01, seed=210)
    d('lt_wing_y', base='#ffd23a', emit=0.48, bevel=0.01)
    d('lt_cy_dk', base='#0e86d6', emit=0.35, bevel=0.012)
    d('lt_cy', base='#2fd6ff', emit=0.42, bevel=0.012)
    d('lt_cy_hi', base='#c4f8ff', emit=0.48, bevel=0.012)
    d('lt_cy_orb', base='#f4feff', emit=0.8, bevel=0.01)
    d('lt_rage', base='#ee2a20', base2='#c01810', pattern='fade', z0=-0.25, z1=0.3, pamt=0.5, emit=0.3, bevel=0.025)
    d('lt_rage_hi', base='#ff7058', emit=0.3, bevel=0.012)
    d('lt_rage_dk', base='#8a0f10', bevel=0.012)
    d('lt_horn', base='#f4e6c0', base2='#cfb98a', pattern='fade', z0=0.1, z1=0.5, pamt=0.7, bevel=0.01)
    d('lt_eye', base='#ff8a1c', emit=1.0, bevel=0.005)
    d('lt_eye_core', base='#ffe35a', emit=1.0, bevel=0.005)
    d('lt_tooth', base='#f7efd8', bevel=0.006)
    d('lt_fire_o', base='#ff7a14', base2='#ff4a10', pattern='fade', z0=0.2, z1=0.6, pamt=0.6, emit=0.62, bevel=0.012)
    d('lt_fire_y', base='#ffd23a', emit=0.65, bevel=0.012)
    # charred gibs
    d('lt_char', base='#34211a', base2='#22150e', pattern='noise', pscale=9, pamt=0.7, bump=0.7, bevel=0.02, seed=211)
    d('lt_char_lt', base='#5e3e2a', base2='#432a1c', pattern='noise', pscale=8, pamt=0.6, bump=0.5, bevel=0.02, seed=212)
    d('lt_char_bone', base='#8a7a66', base2='#4a3e34', pattern='noise', pscale=8, pamt=0.7, bevel=0.012, seed=213)
    d('lt_ember', base='#ff8a1c', base2='#ffd23a', pattern='noise', pscale=14, pamt=0.6, emit=0.5, bevel=0.006, seed=214)


_materials()


# ------------------------------------------------------------------------------------------------ helpers

def place(m, tilt_deg=20.0, yaw=0.0, roll=0.0, track=(), elev=ELEV):
    """Turn a weapon built along +X (up +Z, camera side -Y): roll about its barrel, yaw it toward the viewer, tilt the muzzle up on
    screen, then centre it on the screen pivot. Returns the tracked points after the move."""
    M = roty(-math.radians(tilt_deg)) @ rotz(-math.radians(yaw)) @ rotx(math.radians(roll))
    m.transform(M)
    d = recentre(m, elev)
    return [M @ Vector(p) + d for p in track]


def recentre(m, elev=ELEV):
    """Move a mesh in the XZ plane so the middle of its screen bounds sits on the pivot. Returns the shift."""
    r, u, _ = bl.cam_basis(elev)
    xs = [v.co.dot(r) for v in m.bm.verts]
    ys = [v.co.dot(u) for v in m.bm.verts]
    d = Vector((-(min(xs) + max(xs)) / 2, 0.0, -(min(ys) + max(ys)) / 2 / math.cos(math.radians(elev))))
    m.transform(trans(*d))
    return d


def fit(m, k, elev=ELEV):
    """Scale an icon about the origin by k, then centre it."""
    m.transform(scale(k))
    recentre(m, elev)


def ring_y(m, c, r_in, r_out, z_front, z_back, mat, seg=24):
    """A flat ring about the axis through c along Y; z_front/z_back are depths toward the camera (positive = toward -Y)."""
    m.lathe([(z_front, r_in), (z_front, r_out), (z_back, r_out), (z_back, r_in)], mat, mx=trans(*c) @ rotx(PI / 2),
            seg=seg, smooth=40.0, cap=False)


def disc_y(m, c, r, z_front, z_back, mat, seg=24):
    """A solid disc about the axis through c along Y."""
    m.lathe([(z_back, 0.0), (z_back, r), (z_front, r), (z_front, 0.0)], mat, mx=trans(*c) @ rotx(PI / 2), seg=seg, smooth=40.0, cap=False)


def hazard(m, x0, x1, z0, z1, y, depth=0.014, n_w=0.06, slant=0.8, mx=None, ya='lt_hazard_y', kb='lt_hazard_k'):
    """A yellow plate whose front face is at y (toward -Y), with black diagonal stripes across it."""
    m.box(x0, x1, y, y + depth, z0, z1, ya, mx=mx, bevel=0.004)
    sl = slant * (z1 - z0)
    xs = x0 - sl
    while xs < x1:
        poly = clip_poly_x([(xs, z0), (xs + n_w, z0), (xs + n_w + sl, z1), (xs + sl, z1)], x0, x1)
        if len(poly) >= 3:
            m.prism(poly, y - 0.005, y + 0.004, kb, mx=mx)
        xs += 2 * n_w


def flame_tongue(L, w, curl=0.3, n=10):
    """Outline [(x, z)] of a flame lick along +X, blunt at the base and curling up (toward +Z) at the tip."""
    top, bot = [], []
    for i in range(n + 1):
        t = i / n
        cx, cz = L * t, curl * L * t * t
        tx, tz = L, 2 * curl * L * t
        ln = math.hypot(tx, tz)
        nx, nz = -tz / ln, tx / ln
        hw = w * (1.0 - t) ** 0.8
        top.append((cx + nx * hw, cz + nz * hw))
        bot.append((cx - nx * hw, cz - nz * hw))
    return top + bot[-2::-1]


def rot2(pts, ang, o=(0.0, 0.0)):
    c, s = math.cos(ang), math.sin(ang)
    return [(o[0] + x * c - z * s, o[1] + x * s + z * c) for x, z in pts]


# ------------------------------------------------------------------------------------------------ weapons

def blaster():
    """The hero's white-and-blue energy blaster, reused from hero.gun but squatter and thicker so it reads as a pickup."""
    m = Mesh('blaster')
    G = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1))) @ scale(1.4, 1.55, 0.8)
    hero.gun(m, G)
    place(m, 20.0, yaw=0.0, roll=30.0)
    return m


def scatter():
    """A chunky pump shotgun: orange stock, steel receiver and barrel, a big drum underneath, a flared muzzle."""
    m = Mesh('scatter')
    O, OH, OD = 'lt_orange', 'lt_orange_hi', 'lt_orange_dk'
    S, SD, K = 'lt_steel', 'lt_steel_dk', 'lt_black'
    m.prism([(-0.53, -0.1), (-0.53, 0.2), (-0.26, 0.155), (-0.26, -0.02)], -0.075, 0.075, O, bevel=0.025)    # stock
    m.box(-0.57, -0.51, -0.082, 0.082, -0.13, 0.23, 'lt_rubber', bevel=0.02)                                   # butt pad
    m.box(-0.46, -0.3, -0.081, -0.07, 0.07, 0.145, OH, bevel=0.01)                                              # light panel on the stock
    m.box(-0.27, 0.13, -0.095, 0.095, -0.07, 0.17, S, bevel=0.028)                                              # receiver
    m.box(-0.17, -0.02, -0.1, -0.085, 0.05, 0.11, K, bevel=0.005)                                               # ejection port
    m.box(-0.25, 0.12, -0.09, 0.09, 0.15, 0.185, SD, bevel=0.012)                                               # top rail
    m.cyl((0.1, 0, 0.065), (0.5, 0, 0.065), 0.066, 0.066, mat=S, seg=16)                                        # barrel
    m.cyl((0.1, 0, -0.04), (0.46, 0, -0.04), 0.046, 0.046, mat=SD, seg=14)                                      # magazine tube
    m.capsule((0.18, 0, -0.045), (0.34, 0, -0.045), 0.088, 0.088, mat=O, seg=16)                                # pump grip
    for x in (0.2, 0.255, 0.31):
        m.cyl((x, 0, -0.045), (x + 0.02, 0, -0.045), 0.094, 0.094, mat=OD, seg=16)
    m.cyl((0.47, 0, 0.065), (0.63, 0, 0.065), 0.07, 0.13, mat=SD, seg=16)                                       # flared muzzle
    m.cyl((0.628, 0, 0.065), (0.636, 0, 0.065), 0.105, 0.105, mat=K, seg=16)
    m.cyl((0.53, 0, 0.065), (0.545, 0, 0.065), 0.078, 0.078, mat=OD, seg=16)
    m.sphere((0.58, 0, 0.2), 0.028, 'lt_shell', seg=8)                                                          # front sight bead
    # the drum
    dc = (-0.06, 0.0, -0.215)
    m.cyl((dc[0], -0.105, dc[2]), (dc[0], 0.105, dc[2]), 0.178, 0.178, mat=O, seg=28)
    ring_y(m, dc, 0.15, 0.19, 0.13, 0.075, SD, seg=28)
    disc_y(m, dc, 0.075, 0.125, 0.1, S, seg=18)
    disc_y(m, dc, 0.03, 0.14, 0.12, K, seg=10)
    for k in range(6):
        a = k * PI / 3 + 0.3
        disc_y(m, (dc[0] + 0.113 * math.cos(a), dc[1], dc[2] + 0.113 * math.sin(a)), 0.03, 0.12, 0.1, 'lt_brass', seg=10)
    # pistol grip and trigger
    m.box(-0.05, 0.05, -0.075, 0.075, -0.3, 0.0, 'lt_rubber', mx=trans(-0.255, 0, -0.04) @ roty(0.3), bevel=0.02)
    m.tube([(-0.2, 0, -0.07), (-0.19, 0, -0.14), (-0.155, 0, -0.16), (-0.13, 0, -0.1)], 0.02, SD, seg=6)
    # two shells in a stock holder
    for k, x in enumerate((-0.43, -0.37)):
        m.cyl((x, -0.1, 0.105), (x, -0.16, 0.105), 0.032, 0.032, mat='lt_shell', seg=10)
        m.cyl((x, -0.095, 0.105), (x, -0.11, 0.105), 0.034, 0.034, mat='lt_brass', seg=10)
    place(m, 20.0, yaw=0.0, roll=0.0)
    return m


def rocket():
    """A shoulder rocket pod: an olive box with four tubes, red-nosed rockets poking out, a yellow-black hazard band."""
    m = Mesh('rocket')
    X0, X1, W, H = -0.46, 0.36, 0.46, 0.42
    m.box(X0, X1, -W / 2, W / 2, -H / 2, H / 2, 'lt_olive', bevel=0.035)
    m.box(X0 + 0.04, X1 - 0.04, -W / 2 + 0.05, W / 2 - 0.05, H / 2 - 0.004, H / 2 + 0.014, 'lt_olive_lt', bevel=0.01)      # lighter top plate
    m.box(X0 + 0.04, X1 - 0.04, -W / 2 + 0.05, W / 2 - 0.05, -H / 2 - 0.014, -H / 2 + 0.004, 'lt_olive_lt', bevel=0.01)
    for x in (-0.33, 0.28):                                                                  # steel bands round the box
        m.box(x - 0.025, x + 0.025, -W / 2 - 0.016, W / 2 + 0.016, -H / 2 - 0.016, H / 2 + 0.016, 'lt_steel_dk', bevel=0.01)
    hazard(m, 0.04, 0.22, -H / 2 + 0.03, H / 2 - 0.03, -W / 2 - 0.016)                      # hazard band on the side
    # front: a dark plate with four tube mouths, a rocket in each
    m.box(X1, X1 + 0.03, -W / 2 + 0.01, W / 2 - 0.01, -H / 2 + 0.01, H / 2 - 0.01, 'lt_olive_dk', bevel=0.012)
    for iy, y in enumerate((-0.108, 0.108)):
        for iz, z in enumerate((-0.1, 0.1)):
            m.cyl((X1 + 0.02, y, z), (X1 + 0.05, y, z), 0.098, 0.098, mat='lt_steel_dk', seg=18)
            m.cyl((X1 + 0.045, y, z), (X1 + 0.055, y, z), 0.082, 0.082, mat='lt_black', seg=18)
            ext = 0.0 if (iy + iz) % 2 == 0 else 0.07                                         # staggered, so they overlap nicely
            x0 = X1 + 0.05
            m.cyl((x0, y, z), (x0 + 0.1 + ext, y, z), 0.076, 0.076, mat='lt_rocket_body', seg=14)
            m.cyl((x0 + 0.04 + ext, y, z), (x0 + 0.075 + ext, y, z), 0.08, 0.08, mat='lt_rocket_red', seg=14)
            nx = x0 + 0.1 + ext
            m.lathe([(0.0, 0.076), (0.08, 0.07), (0.16, 0.044), (0.22, 0.0)], 'lt_rocket_red', mx=trans(nx, y, z) @ roty(PI / 2), seg=14, smooth=60.0, cap=False)
    # shoulder pad at the back, grips and a sight
    m.box(X0 - 0.07, X0 + 0.01, -W / 2 - 0.02, W / 2 + 0.02, -H / 2 - 0.02, H / 2 + 0.06, 'lt_rubber', bevel=0.03)
    m.box(-0.06, 0.06, -0.06, 0.06, -0.3, -0.1, 'lt_rubber', mx=trans(-0.08, 0, 0) @ roty(0.25), bevel=0.02)
    m.box(-0.04, 0.04, -0.055, 0.055, -0.27, -0.1, 'lt_rubber', mx=trans(0.2, 0, 0) @ roty(-0.1), bevel=0.02)
    m.box(-0.1, 0.1, -0.03, 0.03, H / 2, H / 2 + 0.09, 'lt_steel_dk', mx=trans(0.1, 0, 0), bevel=0.012)
    m.cyl((0.0, -0.0, H / 2 + 0.07), (0.2, -0.0, H / 2 + 0.07), 0.04, 0.04, mat='lt_steel', seg=10)
    place(m, 20.0, yaw=38.0, roll=0.0)
    return m


def flamer():
    """A flamethrower: twin red fuel tanks, a black hose, a brass wand with a nozzle and a small blue-orange pilot flame."""
    m = Mesh('flamer')
    SD, K = 'lt_steel_dk', 'lt_black'
    # twin tanks, stacked: a cylinder with domed ends, a yellow band, a steel strap and a brass valve
    for z in (-0.1, 0.115):
        m.cyl((-0.31, 0, z), (-0.11, 0, z), 0.1, 0.1, mat='lt_tank_red', seg=20)
        m.ball((-0.31, 0, z), (0.055, 0.1, 0.1), 'lt_tank_red', seg=20, rings=8)
        m.ball((-0.11, 0, z), (0.055, 0.1, 0.1), 'lt_tank_red', seg=20, rings=8)
        m.ball((-0.2, -0.085, z + 0.045), (0.075, 0.03, 0.022), 'lt_tank_hi', seg=10, rings=6)
        m.cyl((-0.275, 0, z), (-0.245, 0, z), 0.106, 0.106, mat='lt_hazard_y', seg=20)
        m.cyl((-0.18, 0, z), (-0.15, 0, z), 0.106, 0.106, mat=SD, seg=20)
        m.cyl((-0.22, 0, z + 0.09), (-0.22, 0, z + 0.125), 0.03, 0.03, mat='lt_brass', seg=10)               # filler cap
        m.cyl((-0.07, 0, z), (0.0, 0, z), 0.04, 0.04, mat='lt_brass', seg=12)                               # valve
    m.box(-0.11, -0.085, -0.095, 0.095, -0.2, 0.22, SD, bevel=0.01)                                           # strap joining the tanks
    # wand body, grip and trigger
    m.box(0.0, 0.2, -0.07, 0.07, -0.045, 0.105, K, bevel=0.025)
    m.box(0.02, 0.17, -0.075, -0.06, -0.01, 0.07, SD, bevel=0.008)
    m.box(-0.04, 0.04, -0.06, 0.06, -0.26, 0.0, 'lt_brass_dk', mx=trans(0.07, 0, -0.03) @ roty(0.2), bevel=0.02)
    m.tube([(0.11, 0, -0.04), (0.14, 0, -0.1), (0.17, 0, -0.1), (0.18, 0, -0.045)], 0.017, SD, seg=6)
    # hose from the lower tank round under the grip into the wand
    m.tube([(0.0, -0.04, -0.1), (0.04, -0.075, -0.17), (0.11, -0.08, -0.29), (0.2, -0.08, -0.27), (0.26, -0.07, -0.16), (0.26, -0.05, -0.05)],
           0.03, 'lt_hose', seg=8)
    # barrel: brass tube with steel heat shields, a pilot-light tube and a flared nozzle
    m.cyl((0.18, 0, 0.03), (0.44, 0, 0.03), 0.056, 0.056, mat='lt_brass', seg=14)
    for x in (0.25, 0.31, 0.37):
        m.cyl((x, 0, 0.03), (x + 0.03, 0, 0.03), 0.075, 0.075, mat='lt_steel', seg=14)
    m.cyl((0.2, 0, -0.05), (0.5, 0, -0.05), 0.022, 0.022, mat=SD, seg=8)
    m.cyl((0.42, 0, 0.03), (0.52, 0, 0.03), 0.065, 0.1, mat='lt_brass', seg=16)
    m.cyl((0.518, 0, 0.03), (0.525, 0, 0.03), 0.075, 0.075, mat=K, seg=14)
    # the pilot flame: three flat flames fanned from the nozzle, each an orange body with a yellow heart, and a blue core at the base
    for (ang, L, w, curl, dy) in ((34, 0.17, 0.06, 0.12, 0.012), (-24, 0.15, 0.056, -0.08, 0.012), (6, 0.26, 0.085, 0.05, 0.0)):
        o = rot2(flame_tongue(L, w, curl=curl), math.radians(ang), (0.53, 0.03))
        pillow(m, o, dy - 0.035, dy + 0.035, 'lt_flame_o', bevel=0.02, seg=2)
        h = rot2(flame_tongue(L * 0.68, w * 0.56, curl=curl), math.radians(ang), (0.53, 0.03))
        pillow(m, h, dy - 0.065, dy - 0.03, 'lt_flame_y', bevel=0.012, seg=1)
    pillow(m, rot2(flame_tongue(0.09, 0.04, curl=0.05), math.radians(6), (0.53, 0.03)), -0.095, -0.06, 'lt_flame_b', bevel=0.012, seg=1)
    pts = place(m, 20.0, yaw=0.0, roll=0.0, track=[(0.62, 0.0, 0.08)])
    _A['flame'] = pts[0]
    return m


# ------------------------------------------------------------------------------------------------ the weapon crate

def crate_weapon():
    """An olive military crate with hazard stripes, steel corner caps and a glowing cyan trim; the lid is propped open."""
    m = Mesh('crate_weapon')
    W, D, H = 0.9, 0.42, 0.38
    w2, d2, t = W / 2, D / 2, 0.045
    OL, OD = 'lt_olive', 'lt_olive_dk'
    m.box(-w2, w2, -d2, d2, 0.0, 0.07, OD, bevel=0.015)
    m.box(-w2, w2, -d2, -d2 + t, 0.0, H, OL, bevel=0.015)                                  # front
    m.box(-w2, w2, d2 - t, d2, 0.0, H, OL, bevel=0.015)                                    # back
    m.box(-w2, -w2 + t, -d2, d2, 0.0, H, OL, bevel=0.015)                                  # left
    m.box(w2 - t, w2, -d2, d2, 0.0, H, OL, bevel=0.015)                                    # right
    m.box(-w2 + t, w2 - t, -d2 + t, d2 - t, 0.07, 0.25, 'lt_foam')                         # foam inside
    m.box(-0.31, 0.31, -0.11, 0.1, 0.25, 0.262, 'lt_cyan_glow')                            # glowing pad in the foam
    for sx in (-1, 1):                                                                     # a socket outline in the foam
        m.box(sx * 0.33 - 0.015, sx * 0.33 + 0.015, -0.13, 0.12, 0.25, 0.26, 'lt_black')
    # front panel: ribs, hazard band, cyan trim, label and latches
    fy = -d2 - 0.004
    for z in (0.17, 0.335):
        m.box(-w2 + 0.1, w2 - 0.1, fy - 0.01, fy + 0.006, z, z + 0.03, OD, bevel=0.006)
    hazard(m, -w2 + 0.11, w2 - 0.11, 0.05, 0.135, fy - 0.014, n_w=0.055)
    m.box(-w2 + 0.1, w2 - 0.1, fy - 0.012, fy + 0.006, 0.198, 0.232, 'lt_cyan', bevel=0.004)     # the glowing trim line
    m.box(-0.1, 0.1, fy - 0.014, fy + 0.006, 0.255, 0.33, 'lt_label', bevel=0.006)
    for z in (0.275, 0.3):
        m.box(-0.075, 0.075, fy - 0.02, fy - 0.01, z, z + 0.012, 'lt_hazard_k')
    for sx in (-1, 1):
        m.box(sx * 0.27 - 0.04, sx * 0.27 + 0.04, fy - 0.026, fy + 0.006, 0.27, 0.39, 'lt_steel', bevel=0.012)
        m.box(sx * 0.27 - 0.022, sx * 0.27 + 0.022, fy - 0.034, fy - 0.02, 0.3, 0.355, 'lt_steel_dk', bevel=0.008)
    # corner posts and caps
    for sx in (-1, 1):
        for sy in (-1, 1):
            xa, xb = sorted((sx * (w2 - 0.085), sx * (w2 + 0.014)))
            ya, yb = sorted((sy * (d2 - 0.085), sy * (d2 + 0.014)))
            m.box(xa, xb, ya, yb, 0.0, 0.11, 'lt_steel', bevel=0.012)
            m.box(xa, xb, ya, yb, H - 0.09, H + 0.014, 'lt_steel', bevel=0.012)
            xa2, xb2 = sorted((sx * (w2 - 0.05), sx * (w2 + 0.008)))
            ya2, yb2 = sorted((sy * (d2 - 0.05), sy * (d2 + 0.008)))
            m.box(xa2, xb2, ya2, yb2, 0.1, H - 0.08, 'lt_steel_dk', bevel=0.008)
    # lid, hinged along the back top edge and propped back
    ang = -1.95
    L = trans(0, d2, H) @ rotx(ang)
    m.box(-w2, w2, -D, 0, 0.0, 0.07, OL, mx=L, bevel=0.015)
    for (x0, x1, y0, y1) in ((-w2, w2, -D, -D + 0.06), (-w2, w2, -0.06, 0), (-w2, -w2 + 0.06, -D, 0), (w2 - 0.06, w2, -D, 0)):
        m.box(x0, x1, y0, y1, -0.03, 0.0, OD, mx=L, bevel=0.008)
    m.box(-w2 + 0.06, w2 - 0.06, -D + 0.06, -0.06, -0.026, 0.0, 'lt_foam', mx=L)
    m.box(-0.3, 0.3, -D + 0.1, -D + 0.14, -0.036, -0.02, 'lt_cyan', mx=L, bevel=0.004)         # cyan line on the lid lining
    m.box(-0.3, 0.3, -0.14, -0.1, -0.036, -0.02, 'lt_cyan', mx=L, bevel=0.004)
    hazard(m, -w2 + 0.1, w2 - 0.1, D - 0.28, D - 0.17, -0.045, n_w=0.055, mx=L @ rotx(PI / 2))
    for sx in (-1, 1):                                                                      # prop arms
        a = Vector((sx * (w2 - 0.075), d2 - 0.07, H - 0.01))
        b = L @ Vector((sx * (w2 - 0.075), -D * 0.72, -0.02))
        m.cyl(tuple(a), tuple(b), 0.018, 0.018, mat='lt_steel', seg=8)
        m.sphere(tuple(a), 0.03, 'lt_steel_dk', seg=8)
    # hinges
    for sx in (-1, 1):
        m.box(sx * 0.3 - 0.05, sx * 0.3 + 0.05, d2 - 0.01, d2 + 0.03, H - 0.05, H + 0.045, 'lt_steel', bevel=0.008)
    _A['glow'] = (0.0, 0.0, 1.1)
    _A['pad'] = (0.0, 0.0, 0.27)
    return m


# ------------------------------------------------------------------------------------------------ power-surge icons

def overdrive():
    """An orange-yellow speedometer with the needle pinned in the red, flanked by flame wings."""
    m = Mesh('overdrive')
    R = 0.235
    cy = 0.0
    face = trans(0, 0, cy) @ rotx(PI / 2)
    # flame wings behind the dial: three feathers a side, each an orange lick with a yellow heart
    for sx in (-1, 1):
        for (ang, ln, w, dy) in ((-4, 0.32, 0.09, 0.07), (24, 0.33, 0.088, 0.045), (52, 0.28, 0.076, 0.02)):
            a = math.radians(ang)
            base = (sx * R * 0.5, cy)

            def tongue(L, ww):
                o = flame_tongue(L, ww, curl=0.42)
                if sx < 0:
                    return rot2([(-x, z) for x, z in o], -a, base)
                return rot2(o, a, base)
            pillow(m, tongue(ln, w), dy - 0.05, dy + 0.03, 'lt_wing_o', bevel=0.022, seg=2)
            pillow(m, tongue(ln * 0.68, w * 0.52), dy - 0.075, dy - 0.03, 'lt_wing_y', bevel=0.012, seg=1)
    # the dial: bezel ring, face, ticks, red zone, needle
    m.lathe([(0.04, R * 0.8), (0.1, R * 0.82), (0.1, R * 0.97), (0.08, R), (-0.05, R)], 'lt_gauge_o', mx=face, seg=32, smooth=50.0, cap=False)
    m.lathe([(0.1, R * 0.82), (0.1, R * 0.9)], 'lt_gauge_hi', mx=face, seg=32, smooth=0.0, cap=False)
    m.lathe([(0.045, 0.0), (0.045, R * 0.8)], 'lt_gauge_face', mx=face, seg=32, smooth=0.0, cap=False)
    a0, a1 = math.radians(225), math.radians(-45)

    def pol(r, a):
        return (r * math.cos(a), cy + r * math.sin(a))
    red0, red1 = math.radians(62), a1
    arc_o = [pol(R * 0.78, red0 + (red1 - red0) * i / 10) for i in range(11)]
    arc_i = [pol(R * 0.4, red0 + (red1 - red0) * i / 10) for i in reversed(range(11))]
    m.prism(arc_o + arc_i, -0.085, -0.04, 'lt_red_zone', bevel=0.006)
    for k in range(5):                                                                     # five chunky ticks
        a = a0 + (a1 - a0) * k / 4
        p0, p1 = pol(R * 0.6, a), pol(R * 0.77, a)
        tx, tz = -math.sin(a) * 0.02, math.cos(a) * 0.02
        m.prism([(p0[0] - tx, p0[1] - tz), (p1[0] - tx, p1[1] - tz), (p1[0] + tx, p1[1] + tz), (p0[0] + tx, p0[1] + tz)], -0.095, -0.04, 'lt_tick')
    na = math.radians(-34)                                                                 # needle pinned in the red
    needle = [(-0.16 * R, -0.05), (0.0, -0.08), (0.9 * R, 0.0), (0.0, 0.08), (-0.16 * R, 0.05)]
    m.prism(rot2(needle, na, (0.0, cy)), -0.115, -0.075, 'lt_needle', bevel=0.01)
    m.ball((0.0, -0.1, cy), (0.055, 0.045, 0.055), 'lt_steel_dk', seg=14, rings=8)
    m.ball((-0.014, -0.14, cy + 0.014), (0.022, 0.012, 0.022), 'lt_steel', seg=8, rings=5)
    fit(m, 0.9)
    return m


def triple():
    """Three cyan energy arrows fanned upward from one glowing point."""
    m = Mesh('triple')
    org = Vector((0.0, -0.3))

    def arrow(L, hw, hh, hl, notch):
        return [(0.0, -hw * 1.15), (L - hl, -hw), (L - hl, -hh), (L, 0.0), (L - hl, hh), (L - hl, hw), (0.0, hw * 1.15), (notch, 0.0)]

    for (lean, L, dy, sc, s0) in ((-34, 0.58, 0.0, 0.92, 0.1), (34, 0.58, 0.0, 0.92, 0.1), (0, 0.76, -0.07, 1.0, 0.04)):
        ang = PI / 2 - math.radians(lean)                      # positive lean = toward screen right
        o = org + Vector((math.cos(ang), math.sin(ang))) * s0
        base = arrow(L, 0.07 * sc, 0.17 * sc, 0.22, 0.09)
        cl = L * 0.52
        for k, (mat, f, off, th) in enumerate((('lt_cy_dk', 1.0, 0.0, 0.07), ('lt_cy', 0.72, -0.03, 0.07), ('lt_cy_hi', 0.36, -0.06, 0.06))):
            pts = rot2([(cl + (x - cl) * f, z * f) for x, z in base], ang, (o.x, o.y))
            pillow(m, pts, dy + off - th, dy + off, mat, bevel=0.02 if k < 2 else 0.012, seg=2)
    m.ball((org.x, -0.02, org.y), (0.11, 0.075, 0.11), 'lt_cy_orb', seg=16, rings=10)
    m.lathe([(0.0, 0.1), (0.0, 0.15), (-0.05, 0.15), (-0.05, 0.1)], 'lt_cy_dk', mx=trans(org.x, 0.05, org.y) @ rotx(PI / 2), seg=20, smooth=40.0, cap=False)
    fit(m, 0.84)
    return m


def rage():
    """A glowing red horned skull with fiery eyes and a flame crown."""
    m = Mesh('rage')
    # flame crown behind the dome
    for (x, ln, w, a, f) in ((-0.2, 0.3, 0.07, 108, 0), (-0.1, 0.4, 0.085, 98, 1), (0.0, 0.48, 0.095, 90, 0), (0.1, 0.4, 0.085, 82, 1), (0.2, 0.3, 0.07, 72, 0)):
        pts = rot2(flame_tongue(ln, w, curl=0.14 if x < 0 else (-0.14 if x > 0 else 0.0)), math.radians(a), (x, 0.12))
        pillow(m, pts, 0.0 + 0.01 * f, 0.1 + 0.01 * f, 'lt_fire_o', bevel=0.025, seg=2)
        inner = flame_tongue(ln * 0.6, w * 0.5, curl=0.0)
        pillow(m, rot2(inner, math.radians(a), (x, 0.14)), -0.04 + 0.01 * f, 0.0 + 0.01 * f, 'lt_fire_y', bevel=0.012, seg=1)
    # horns
    for sx in (-1, 1):
        path = [(sx * 0.17, 0.02, 0.1), (sx * 0.29, 0.02, 0.15), (sx * 0.4, 0.02, 0.27), (sx * 0.4, 0.02, 0.42), (sx * 0.33, 0.02, 0.52)]
        m.tube(path, [0.075, 0.068, 0.055, 0.037, 0.008], 'lt_horn', seg=10)
        m.cyl((sx * 0.16, 0.02, 0.095), (sx * 0.22, 0.02, 0.12), 0.085, 0.085, mat='lt_rage_dk', seg=12)
    # skull: dome, cheeks and jaw
    m.ball((0.0, 0.0, 0.05), (0.265, 0.21, 0.23), 'lt_rage', seg=24, rings=14)
    m.ball((-0.1, -0.15, 0.17), (0.09, 0.05, 0.05), 'lt_rage_hi', seg=10, rings=6, rot=roty(0.5))
    m.ball((0.0, -0.01, -0.17), (0.19, 0.16, 0.11), 'lt_rage', seg=20, rings=10)
    m.ball((0.0, -0.1, -0.2), (0.15, 0.07, 0.07), 'lt_black', seg=14, rings=8)                      # mouth
    for k in range(6):
        x = -0.1 + k * 0.04
        m.box(x - 0.017, x + 0.017, -0.185, -0.17, -0.235, -0.15, 'lt_tooth', bevel=0.006)
    # eyes: dark angry sockets with burning eyes
    for sx in (-1, 1):
        m.ball((sx * 0.105, -0.17, 0.065), (0.1, 0.05, 0.072), 'lt_black', seg=16, rings=10, rot=roty(-sx * 0.5))
        m.ball((sx * 0.105, -0.205, 0.062), (0.074, 0.03, 0.05), 'lt_eye', seg=14, rings=8, rot=roty(-sx * 0.5))
        m.ball((sx * 0.1, -0.225, 0.062), (0.036, 0.02, 0.028), 'lt_eye_core', seg=10, rings=6, rot=roty(-sx * 0.5))
    m.prism([(-0.035, -0.04), (0.035, -0.04), (0.0, 0.03)], -0.222, -0.19, 'lt_black', mx=trans(0, 0, -0.065), bevel=0.006)   # nose
    fit(m, 0.8)
    return m


# ------------------------------------------------------------------------------------------------ charred gibs

def crack(m, c, radii, az, el, length, w=0.025):
    """A glowing ember crack lying on an ellipsoid (centre c, radii) at azimuth/elevation (radians), running across the slope."""
    d = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    p = Vector(c) + Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2])) * 1.0
    t = Vector((-math.sin(az), math.cos(az), 0.0)) * length / 2
    m.capsule(tuple(p - t), tuple(p + t), w, w * 0.8, mat='lt_ember', seg=6, rings=2)


def char_gib(kind):
    m = Mesh('char')
    C, CL = 'lt_char', 'lt_char_lt'
    if kind == 0:                         # a burnt drumstick: a lumpy knob of crust with a blackened bone
        m.ball((0, 0, 0), (0.22, 0.17, 0.16), C, seg=14, rings=8)
        m.ball((-0.1, 0.05, 0.08), (0.14, 0.12, 0.1), CL, seg=12, rings=7)
        m.ball((0.12, -0.04, -0.07), (0.12, 0.1, 0.09), C, seg=12, rings=7)
        m.capsule((0.2, -0.02, 0.0), (0.4, -0.02, 0.03), 0.045, 0.038, mat='lt_char_bone')
        for sy in (-1, 1):
            m.ball((0.42, -0.02 + sy * 0.035, 0.035), (0.052, 0.052, 0.052), 'lt_char_bone', seg=8, rings=5)
        for az, el, ln in ((0.4, 0.95, 0.16), (3.3, 1.2, 0.13), (5.0, 0.75, 0.1)):
            crack(m, (0, 0, 0), (0.22, 0.17, 0.16), az, el, ln)
        crack(m, (-0.1, 0.05, 0.08), (0.14, 0.12, 0.1), 2.4, 1.1, 0.1)
        m.ball((0.2, -0.02, 0.0), (0.03, 0.12, 0.12), 'lt_ember', seg=10, rings=6)               # glowing cut end
        tilt(m, 0.6, 0.35)
    elif kind == 1:                       # a curled, cracked steak: flat slab, black edge, ember lines across the top
        rock(m, (0, 0, 0), (0.27, 0.2, 0.075), C, seed=41, n=11, bevel=0.012, jitter=0.18)
        m.capsule((-0.22, 0.17, 0.03), (0.23, 0.15, 0.035), 0.045, 0.04, mat=CL, seg=8, rings=3)
        m.capsule((-0.24, -0.1, 0.02), (-0.1, -0.2, 0.03), 0.04, 0.035, mat=CL, seg=8, rings=3)
        pts = [(-0.2, -0.04), (-0.08, 0.04), (0.02, -0.03), (0.12, 0.06), (0.22, 0.0)]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            m.capsule((x0, y0, 0.07), (x1, y1, 0.07), 0.02, 0.02, mat='lt_ember', seg=6, rings=2)
        m.capsule((0.0, 0.0, 0.07), (0.05, -0.12, 0.07), 0.017, 0.017, mat='lt_ember', seg=6, rings=2)
        m.ball((-0.06, -0.08, 0.075), (0.07, 0.05, 0.015), CL, seg=8, rings=4, rot=rotz(0.4))
        tilt(m, 0.95, -0.4)
    else:                                 # three burnt nuggets with embers glowing between them
        specs = ((-0.13, 0.03, 0.0, 0.14, C), (0.11, -0.04, 0.05, 0.125, CL), (0.0, 0.11, -0.06, 0.1, C))
        m.ball((0.0, 0.03, -0.02), (0.1, 0.09, 0.06), 'lt_ember', seg=10, rings=6)
        for (x, y, z, rr, mt) in specs:
            m.ball((x, y, z), (rr, rr * 0.95, rr * 0.9), mt, seg=12, rings=7)
        for (x, y, z, rr, mt), az in zip(specs, (3.9, 5.6, 1.4)):
            crack(m, (x, y, z), (rr, rr * 0.95, rr * 0.9), az, 1.0, rr * 1.1)
            crack(m, (x, y, z), (rr, rr * 0.95, rr * 0.9), az + 2.2, 1.2, rr * 0.9, w=0.022)
        m.cyl((0.05, -0.1, 0.05), (0.07, -0.2, 0.09), 0.03, 0.022, mat='lt_char_bone', seg=6)
        tilt(m, 0.7, 0.8)
    centre(m, GIB_SCALE * 0.62)
    return m


# ------------------------------------------------------------------------------------------------ frames

def build(ctx):
    kw = dict(elev=ELEV)
    one(ctx, 'weapon_blaster', blaster, **kw)
    one(ctx, 'weapon_scatter', scatter, **kw)
    one(ctx, 'weapon_rocket', rocket, **kw)
    one(ctx, 'weapon_flamer', flamer, **kw)
    one(ctx, 'crate_weapon', crate_weapon)
    one(ctx, 'surge_overdrive', overdrive, **kw)
    one(ctx, 'surge_triple', triple, **kw)
    one(ctx, 'surge_rage', rage, **kw)
    for i in range(3):
        one(ctx, 'gib_char_%d' % i, lambda i=i: char_gib(i))
    if 'flame' in _A:
        ctx.anchor('flame', 'weapon_flamer', tuple(_A['flame']), elev=ELEV)
    if 'glow' in _A:
        ctx.anchor('glow', 'crate_weapon', _A['glow'])
        ctx.anchor('pad', 'crate_weapon', _A['pad'])
