"""Gloamwall kit: materials (`gw_*`) and procedurally painted images (runes, banner embroidery) for the environment props.

Palette (DESIGN.md): blue-black weathered stone with wet highlights, moss and grime in the joints, rusted black iron, aged gold,
navy cloth with silver crescents, cold cyan soul fire as the only saturated glow. The game lights the sprites itself and the
moon's key light comes from behind and the left, so south faces are mostly in shadow: the albedo is kept mid-dark and cool
rather than near-black, so the unlit fronts still read.

Importing this module defines every material spec once (specs survive the per-module scene reset); `images()` must be called
inside a module's build(ctx) because the scene (and its images) is reset between modules.
"""
import math

import numpy as np

import mats

d = mats.define

# ---------------------------------------------------------------------------------------------- stone
# ashlar blocks: several close relatives so a wall is never one flat tone
STONES = ['gw_stone_a', 'gw_stone_b', 'gw_stone_c', 'gw_stone_d', 'gw_stone_e', 'gw_stone_f']
d('gw_stone_a', base='#4e576c', base2='#2e3446', pattern='noise', pscale=5, pamt=0.85, gloss=0.1, wear=0.6, dirt=0.5, bevel=0.016,
  bump=0.5, bscale=55, seed=41)
d('gw_stone_b', base='#59627a', base2='#353c52', pattern='noise', pscale=7, pamt=0.8, gloss=0.1, wear=0.6, dirt=0.5, bevel=0.016,
  bump=0.5, bscale=60, seed=42)
d('gw_stone_c', base='#3f475c', base2='#262b3a', pattern='noise', pscale=6, pamt=0.85, gloss=0.1, wear=0.5, dirt=0.5, bevel=0.016,
  bump=0.55, bscale=50, seed=43)
d('gw_stone_d', base='#646c80', base2='#40475c', pattern='noise', pscale=4.5, pamt=0.75, gloss=0.1, wear=0.65, dirt=0.45, bevel=0.016,
  bump=0.45, bscale=65, seed=44)
d('gw_stone_e', base='#495461', base2='#2d3843', pattern='noise', pscale=6, pamt=0.85, gloss=0.1, wear=0.5, dirt=0.5, bevel=0.016,
  bump=0.5, bscale=55, seed=45)          # greener, damp
d('gw_stone_f', base='#515468', base2='#33364a', pattern='noise', pscale=5.5, pamt=0.8, gloss=0.1, wear=0.55, dirt=0.5, bevel=0.016,
  bump=0.5, bscale=58, seed=46)          # violet-grey
d('gw_stone_cr', base='#464e62', base2='#1c202c', pattern='cracks', pscale=3.2, pamt=0.85, gloss=0.1, wear=0.5, dirt=0.5, bevel=0.016,
  bump=0.5, bscale=55, seed=47)           # cracked
d('gw_stone_dark', base='#343a4c', base2='#22262f', pattern='noise', pscale=5, pamt=0.7, gloss=0.1, wear=0.4, dirt=0.4, bevel=0.016,
  bump=0.4, bscale=55, seed=47)           # plinths, recesses, carving
d('gw_cap', base='#454e64', base2='#202636', pattern='cracks', pscale=5.5, pamt=0.75, gloss=0.1, wear=0.7, dirt=0.15, bevel=0.018,
  bump=0.4, bscale=60, seed=48)           # coping, capstones, weathered lighter tops
d('gw_core', base='#161a22', base2='#2a3a2a', pattern='noise', pscale=9, pamt=0.55, gloss=0.05, bevel=0.01, bump=0.5, bscale=70,
  seed=49)                                # the dark mortar behind the joints, with moss in it
d('gw_void', base='#0a0c12', gloss=0.0, bevel=0.004, seed=50)                       # slits, door recesses, dark passages
d('gw_crack', base='#10131a', gloss=0.0, bevel=0.003, seed=51)
d('gw_statue', base='#9096a4', base2='#656b7a', pattern='noise', pscale=6, pamt=0.7, gloss=0.1, wear=0.55, dirt=0.3, bevel=0.012,
  bump=0.35, bscale=70, seed=52)          # pale weathered statue stone
d('gw_statue_dark', base='#575d6c', base2='#383c4a', pattern='noise', pscale=6, pamt=0.7, gloss=0.1, wear=0.4, dirt=0.3, bevel=0.01,
  bump=0.3, bscale=70, seed=53)           # deep folds, hood shadow
d('gw_plinth', base='#4c5468', base2='#333a4b', pattern='noise', pscale=5, pamt=0.7, gloss=0.1, wear=0.55, dirt=0.5, bevel=0.016,
  bump=0.45, bscale=55, seed=54)
d('gw_marble', base='#aab0bc', base2='#6c7280', pattern='marble', pscale=2.6, pamt=0.55, gloss=0.4, wear=0.5, dirt=0.25, bevel=0.012,
  bump=0.2, bscale=70, seed=55)           # fountain basin and pedestal: paler, polished
d('gw_slab', base='#3a4154', base2='#262b38', pattern='noise', pscale=5, pamt=0.6, gloss=0.1, wear=0.5, dirt=0.3, bevel=0.012,
  bump=0.35, bscale=60, seed=56)

# ---------------------------------------------------------------------------------------------- living things, grime
d('gw_moss', base='#2b3b2d', base2='#566f3d', pattern='noise', pscale=16, pamt=0.8, gloss=0.06, bevel=0.02, bump=0.9, bscale=110,
  seed=60)
d('gw_moss_dark', base='#1f2b24', base2='#34493a', pattern='noise', pscale=12, pamt=0.7, gloss=0.04, bevel=0.02, bump=0.8, bscale=90,
  seed=61)
d('gw_ivy', base='#27402f', base2='#4e7a45', pattern='noise', pscale=20, pamt=0.7, gloss=0.2, bevel=0.01, bump=0.3, bscale=80, seed=62)
d('gw_deep', base='#171b26', base2='#242a38', pattern='noise', pscale=6, pamt=0.6, gloss=0.03, wear=0.4, bevel=0.01, seed=64)   # the far end of the open gate
d('gw_dust', base='#2e323d', base2='#474c59', pattern='noise', pscale=14, pamt=0.7, gloss=0.02, bevel=0.03, bump=0.8, bscale=90,
  seed=63)
d('gw_root', base='#2c2420', base2='#473529', pattern='noise', pscale=9, pamt=0.6, gloss=0.08, wear=0.4, bevel=0.01, bump=0.5, seed=64)

# ---------------------------------------------------------------------------------------------- metals
d('gw_iron', base='#262930', base2='#3d414c', pattern='noise', pscale=9, pamt=0.7, gloss=0.5, wear=0.85, bevel=0.008, bump=0.3,
  bscale=70, seed=70)                      # black iron with worn bright edges
d('gw_iron_old', base='#2a2a2e', base2='#4a3a30', pattern='noise', pscale=7, pamt=0.75, gloss=0.28, wear=0.6, bevel=0.008, bump=0.5,
  bscale=60, seed=71)                      # rust-streaked
d('gw_rust', base='#5a3a28', base2='#2a2220', pattern='noise', pscale=10, pamt=0.6, gloss=0.12, wear=0.3, bevel=0.006, bump=0.6,
  bscale=80, seed=72)
d('gw_spike', base='#3c4454', base2='#6e788c', pattern='noise', pscale=10, pamt=0.5, gloss=0.7, wear=0.9, bevel=0.005, seed=72)
d('gw_steel', base='#586070', base2='#8e98a8', pattern='noise', pscale=11, pamt=0.5, gloss=0.8, wear=0.8, bevel=0.005, seed=73)
d('gw_gold', base='#8a6a30', base2='#d2aa58', pattern='noise', pscale=10, pamt=0.6, gloss=0.8, wear=0.85, bevel=0.005, bump=0.2,
  seed=74)                                 # aged gold inlay
d('gw_gold_dim', base='#6a5226', base2='#a8823e', pattern='noise', pscale=9, pamt=0.6, gloss=0.65, wear=0.6, bevel=0.005, seed=75)
d('gw_bronze', base='#6d4c2c', base2='#3f6e5c', pattern='noise', pscale=8, pamt=0.55, gloss=0.55, wear=0.7, bevel=0.006, bump=0.3,
  bscale=70, seed=76)                      # bronze with verdigris
d('gw_bronze_hi', base='#9a7440', base2='#6d4c2c', pattern='noise', pscale=9, pamt=0.5, gloss=0.7, wear=0.8, bevel=0.006, seed=77)
d('gw_silver', base='#aab4c2', base2='#e2e9f0', pattern='noise', pscale=12, pamt=0.5, gloss=0.9, wear=0.6, bevel=0.004, seed=78)
d('gw_wood', base='#3f2d22', base2='#5e432f', pattern='grain', pscale=9, pamt=0.6, gloss=0.1, wear=0.5, dirt=0.2, bevel=0.012,
  seed=79)
d('gw_wood_dark', base='#241a15', base2='#3b2b20', pattern='grain', pscale=9, pamt=0.6, gloss=0.1, wear=0.4, dirt=0.2, bevel=0.012,
  seed=80)
d('gw_door', base='#4a3a2e', base2='#2e241c', pattern='grain', pscale=11, pamt=0.6, gloss=0.1, wear=0.5, dirt=0.15, bevel=0.01,
  bump=0.4, bscale=40, seed=81)            # heavy gate planks

# ---------------------------------------------------------------------------------------------- cloth
d('gw_navy', base='#26315c', base2='#364580', pattern='weave', pscale=3, pamt=0.65, gloss=0.04, bevel=0.01, seed=85)
d('gw_navy_dark', base='#1a2142', base2='#2a3566', pattern='weave', pscale=3, pamt=0.6, gloss=0.04, bevel=0.01, seed=86)
d('gw_violet', base='#3a2a5c', base2='#563e84', pattern='weave', pscale=3, pamt=0.65, gloss=0.05, bevel=0.01, dirt=0.15, seed=87)
d('gw_violet_dark', base='#241a3c', base2='#3a2a60', pattern='weave', pscale=3, pamt=0.6, gloss=0.04, bevel=0.01, dirt=0.2, seed=88)
d('gw_rag', base='#554f68', base2='#7a7192', pattern='weave', pscale=3, pamt=0.7, gloss=0.03, bevel=0.01, dirt=0.15, seed=89)   # grey-violet
d('gw_ghost', base='#8b90ad', base2='#b4b8d2', pattern='noise', pscale=8, pamt=0.5, emit=0.12, gloss=0.1, bevel=0.005, seed=91)   # pale spirit skin
d('gw_rag_light', base='#756e92', base2='#9890b4', pattern='weave', pscale=3, pamt=0.6, gloss=0.03, bevel=0.01, dirt=0.1, seed=92)
d('gw_rag_dark', base='#3a3548', base2='#58506c', pattern='weave', pscale=3, pamt=0.7, gloss=0.03, bevel=0.01, dirt=0.2, seed=90)
d('gw_leather', base='#3a2c26', base2='#5e4638', pattern='noise', pscale=9, pamt=0.6, gloss=0.2, wear=0.5, bevel=0.01, bump=0.35,
  bscale=60, seed=91)
d('gw_parchment', base='#a89c80', base2='#7a6e56', pattern='noise', pscale=8, pamt=0.6, gloss=0.05, bevel=0.006, seed=92)

# ---------------------------------------------------------------------------------------------- bone
d('gw_bone', base='#c8bea4', base2='#8a806a', pattern='noise', pscale=11, pamt=0.6, gloss=0.18, wear=0.5, dirt=0.35, bevel=0.007,
  bump=0.3, bscale=80, seed=95)
d('gw_bone_old', base='#a89c82', base2='#5e5646', pattern='noise', pscale=9, pamt=0.7, gloss=0.12, wear=0.4, dirt=0.5, bevel=0.007,
  bump=0.35, bscale=80, seed=96)
d('gw_bone_dark', base='#5c5446', base2='#34302a', pattern='noise', pscale=9, pamt=0.6, gloss=0.1, bevel=0.006, seed=97)

# ---------------------------------------------------------------------------------------------- glows and glass
d('gw_soul', base='#7ff3ff', emit=1.0, bevel=0.004, seed=100)
d('gw_soul_white', base='#dcfbff', emit=1.0, bevel=0.004, seed=101)
d('gw_soul_core', base='#bff6ff', base2='#7fe6f4', pattern='noise', pscale=14, pamt=0.7, emit=1.0, bevel=0.004, seed=102)
d('gw_water', base='#9fe8f6', base2='#cdf6ff', pattern='noise', pscale=10, pamt=0.7, emit=0.6, gloss=0.6, bevel=0.01, seed=103)
d('gw_water_dim', base='#6fc4d8', base2='#9fe8f6', pattern='noise', pscale=8, pamt=0.7, emit=0.45, gloss=0.6, bevel=0.01, seed=104)
d('gw_ember', base='#ffb35a', base2='#ffe0a0', pattern='noise', pscale=14, pamt=0.7, emit=1.0, bevel=0.004, seed=105)   # candle flame
d('gw_crystal', base='#9fe0ee', base2='#d8f8ff', pattern='noise', pscale=9, pamt=0.7, emit=0.62, gloss=0.8, bevel=0.004, seed=106)
d('gw_crystal_core', base='#d8fbff', emit=1.0, bevel=0.003, seed=107)
d('gw_glass', base='#4a8a94', base2='#8fd0d6', pattern='noise', pscale=8, pamt=0.6, emit=0.32, gloss=0.85, bevel=0.004, seed=108)
d('gw_glass_violet', base='#6a4a9a', base2='#b08cf0', pattern='noise', pscale=8, pamt=0.6, emit=0.35, gloss=0.85, bevel=0.004, seed=109)
d('gw_glass_amber', base='#a8742a', base2='#ffc060', pattern='noise', pscale=8, pamt=0.6, emit=0.42, gloss=0.85, bevel=0.004, seed=110)
d('gw_window', base='#ffb35a', base2='#ffd890', pattern='noise', pscale=6, pamt=0.6, emit=0.9, bevel=0.01, seed=111)   # far lit windows
d('gw_candle', base='#e8dcc0', base2='#bfae88', pattern='fade', z0=0.0, z1=0.25, pamt=0.6, gloss=0.3, bevel=0.003, seed=112)
d('gw_heart', base='#7a2a52', base2='#b8446e', pattern='noise', pscale=9, pamt=0.7, emit=0.5, gloss=0.35, bevel=0.01, bump=0.5,
  bscale=60, seed=113)
d('gw_heart_vein', base='#d85a86', emit=0.8, bevel=0.005, seed=114)

# ---------------------------------------------------------------------------------------------- far backdrop (24 ppm: broad strokes)
d('gw_far_stone', base='#222940', base2='#181d2e', pattern='noise', pscale=1.2, pamt=0.5, gloss=0.1, wear=0.5, bevel=0.1, bump=0.4,
  bscale=14, seed=120)
d('gw_far_stone_hi', base='#2e3856', base2='#222a42', pattern='noise', pscale=1.5, pamt=0.45, gloss=0.12, wear=0.6, bevel=0.1, bump=0.4,
  bscale=12, seed=121)
d('gw_far_rock', base='#1e2232', base2='#131622', pattern='noise', pscale=0.5, pamt=0.5, gloss=0.08, bevel=0.15, bump=0.6, bscale=7,
  seed=122)
d('gw_far_rock_hi', base='#283046', base2='#1c2132', pattern='noise', pscale=0.7, pamt=0.45, gloss=0.1, bevel=0.15, bump=0.5, bscale=8,
  seed=123)
d('gw_far_root', base='#33292e', base2='#4a3e44', pattern='noise', pscale=1.0, pamt=0.6, gloss=0.05, bevel=0.05, seed=124)
d('gw_far_moss', base='#18241f', base2='#26372e', pattern='noise', pscale=0.8, pamt=0.45, gloss=0.05, bevel=0.1, seed=125)
d('gw_far_dark', base='#0f121c', gloss=0.0, bevel=0.01, seed=127)    # windows and openings on far ruins, not quite black
d('gw_far_roof', base='#1e2840', base2='#2a3858', pattern='noise', pscale=1.4, pamt=0.45, gloss=0.2, bevel=0.1, seed=126)


# ---------------------------------------------------------------------------------------------- images
def _smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def rune_image(n=160):
    """A sealing rune: a double ring, a crescent in the middle and radial glyph ticks. RGBA, alpha = glow mask, row 0 at top."""
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32)
    x = (xs + 0.5) / n * 2 - 1
    y = (ys + 0.5) / n * 2 - 1
    r = np.hypot(x, y)
    th = np.arctan2(y, x)
    a = np.zeros((n, n), np.float32)

    def ring(r0, w):
        return 1.0 - _smooth(np.abs(r - r0), w * 0.5, w * 0.5 + 0.02)
    a = np.maximum(a, ring(0.93, 0.045))
    a = np.maximum(a, ring(0.78, 0.03))
    a = np.maximum(a, ring(0.30, 0.04) * 0.0)
    # radial ticks between the rings (12 of them) and little crescents on the outer band
    tick = (np.abs(((th * 12 / (2 * math.pi)) % 1.0) - 0.5) > 0.44) & (r > 0.8) & (r < 0.91)
    a = np.maximum(a, tick.astype(np.float32) * 0.9)
    for k in range(6):
        ang = k * math.pi / 3 + math.pi / 6
        cx, cy = math.cos(ang) * 0.52, math.sin(ang) * 0.52
        rr = np.hypot(x - cx, y - cy)
        a = np.maximum(a, (1.0 - _smooth(np.abs(rr - 0.1), 0.02, 0.045)) * (np.hypot(x - cx * 1.0 - math.cos(ang) * 0.05, y - cy - math.sin(ang) * 0.05) > 0.085))
    # central crescent
    c1 = np.hypot(x, y) < 0.34
    c2 = np.hypot(x - 0.13, y + 0.05) < 0.3
    cres = (c1 & ~c2).astype(np.float32)
    a = np.maximum(a, cres)
    # a thin six-pointed star behind
    for k in range(3):
        ang = k * math.pi / 3
        dist = np.abs(-math.sin(ang) * x + math.cos(ang) * y)
        a = np.maximum(a, (1.0 - _smooth(dist, 0.012, 0.03)) * ((r > 0.38) & (r < 0.76)).astype(np.float32) * 0.8)
    a = np.clip(a, 0, 1)
    img = np.zeros((n, n, 4), np.float32)
    img[..., 0] = 0.5
    img[..., 1] = 0.95
    img[..., 2] = 1.0
    img[..., 3] = a
    return img


def crescent_image(n=128, ring=False, color=(0.55, 0.95, 1.0)):
    """A carved crescent moon (alpha = relief) for obelisks and roundels."""
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32)
    x = (xs + 0.5) / n * 2 - 1
    y = (ys + 0.5) / n * 2 - 1
    c1 = np.hypot(x, y)
    c2 = np.hypot(x - 0.28, y + 0.08)
    a = _smooth(0.62 - c1, 0.0, 0.04) * (1.0 - _smooth(0.55 - c2, 0.0, 0.04))
    if ring:
        r = np.hypot(x, y)
        a = np.maximum(a, 1.0 - _smooth(np.abs(r - 0.88), 0.03, 0.06))
    img = np.zeros((n, n, 4), np.float32)
    img[..., 0], img[..., 1], img[..., 2] = color
    img[..., 3] = np.clip(a, 0, 1)
    return img


def banner_image(w=112, h=300):
    """The banner: navy field, gold border and fringe bar, a silver crescent with a star. alpha 0 = plain cloth shows through."""
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    x = (xs + 0.5) / w
    y = (ys + 0.5) / h
    img = np.zeros((h, w, 4), np.float32)
    # gold border and hem band
    bw = 0.055
    border = ((x < bw) | (x > 1 - bw) | (y < 0.018) | (y > 0.964)) & ~(y > 0.985)
    img[border] = (0.66, 0.51, 0.24, 1.0)
    inner = (np.abs(x - 0.5) < 0.5 - bw - 0.035) & (y > 0.04) & (y < 0.944)
    edge = ((np.abs(x - 0.5) < 0.5 - bw - 0.022) & (y > 0.028) & (y < 0.956)) & ~inner
    img[edge] = (0.52, 0.40, 0.2, 0.8)
    # crescent (silver) at about 38% height
    cx, cy = 0.5, 0.36
    ar = h / w
    px = (x - cx)
    py = (y - cy) * ar
    c1 = np.hypot(px, py)
    c2 = np.hypot(px - 0.17, py + 0.05)
    cres = _smooth(0.34 - c1, 0.0, 0.025) * (1.0 - _smooth(0.29 - c2, 0.0, 0.025))
    img[..., :3] = np.where(cres[..., None] > 0.02, np.array([0.86, 0.9, 0.96]), img[..., :3])
    img[..., 3] = np.maximum(img[..., 3], cres)
    # small star under the crescent and three dots
    sx, sy = 0.5, 0.64
    qx, qy = x - sx, (y - sy) * ar
    star = np.maximum(1.0 - _smooth(np.minimum(np.abs(qx), np.abs(qy)) * 8 + np.hypot(qx, qy) * 3.0, 0.2, 0.34), 0.0)
    img[..., :3] = np.where(star[..., None] > 0.05, np.array([0.86, 0.9, 0.96]), img[..., :3])
    img[..., 3] = np.maximum(img[..., 3], star)
    # thin gold lines around
    return img


def register(key, rgba):
    """mats.image(), then write the pixels again (a guard from before mats.image set the colour space ahead of the pixels: in
    Blender 5.2 changing it regenerates a generated image's buffer)."""
    img = mats.image(key, rgba)
    rgba = np.asarray(rgba, np.float32)
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).ravel())
    img.update()
    return img


def images():
    """Register the images the gw_ materials with a `tex` use. Call inside build(ctx)."""
    register('gw_rune', rune_image())
    register('gw_crescent', crescent_image())
    register('gw_roundel', crescent_image(ring=True, color=(0.78, 0.6, 0.26)))
    register('gw_banner', banner_image())


# the textured materials (need images() first)
d('gw_rune_door', base='#3a2e24', base2='#241c16', pattern='grain', pscale=11, pamt=0.6, gloss=0.12, bevel=0.01, tex='gw_rune',
  tex_emit=1.0, tex_gloss=0.3, seed=130)
d('gw_rune_stone', base='#2c3142', base2='#232734', pattern='noise', pscale=6, pamt=0.5, gloss=0.2, bevel=0.01, tex='gw_rune',
  tex_emit=1.0, tex_gloss=0.3, seed=131)
d('gw_crescent_glow', base='#343a4c', base2='#232834', pattern='noise', pscale=6, pamt=0.5, gloss=0.2, bevel=0.01,
  tex='gw_crescent', tex_emit=1.0, tex_gloss=0.3, seed=132)
d('gw_crescent_carve', base='#4a5266', base2='#343a4c', pattern='noise', pscale=5, pamt=0.7, gloss=0.2, wear=0.55, bevel=0.01,
  tex='gw_crescent', tex_bump=0.8, seed=133)
d('gw_roundel_gold', base='#444b5f', base2='#2e3446', pattern='noise', pscale=5, pamt=0.7, gloss=0.25, wear=0.55, bevel=0.01,
  tex='gw_roundel', tex_gloss=0.8, tex_bump=0.8, seed=134)
d('gw_banner_cloth', base='#26315c', base2='#364580', pattern='weave', pscale=3, pamt=0.65, gloss=0.04, bevel=0.01, tex='gw_banner',
  tex_gloss=0.6, tex_bump=0.7, seed=135)
