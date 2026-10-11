"""Materials and embroidery images for Maelis (every key starts with hr_)."""
import math

import bpy
import numpy as np

import mats

d = mats.define

# felt hat and navy coat cloth: fibrous, painterly, a little lighter where the folds catch the moon
d('hr_felt', base='#161c38', base2='#2a3562', pattern='noise', pscale=9, pamt=0.6, bump=0.35, bscale=90, gloss=0.08, seed=41,
  bevel=0.006)
d('hr_felt_dk', base='#121830', base2='#1f2848', pattern='noise', pscale=9, pamt=0.5, bump=0.3, bscale=90, seed=42, bevel=0.006)
d('hr_coat', base='#1c2444', base2='#33417a', pattern='weave', pscale=3, pamt=0.7, gloss=0.07, seed=43, dirt=0.18, bevel=0.008)
d('hr_coat_dk', base='#141a33', base2='#232c52', pattern='weave', pscale=3, pamt=0.6, gloss=0.05, seed=44, bevel=0.008)
d('hr_teal', base='#1f4a50', base2='#33727a', pattern='weave', pscale=3, pamt=0.7, gloss=0.08, seed=45, bevel=0.006)
# panels carry their embroidery as UV images (registered in images())
d('hr_panel', base='#1c2444', base2='#33417a', pattern='weave', pscale=3, pamt=0.7, gloss=0.07, seed=46, tex='hr_panel',
  tex_gloss=0.75, tex_bump=0.6, bevel=0.006)
d('hr_panel_back', base='#1c2444', base2='#33417a', pattern='weave', pscale=3, pamt=0.7, gloss=0.07, seed=47, tex='hr_back',
  tex_gloss=0.75, tex_bump=0.7, bevel=0.006)
d('hr_panel_front', base='#1c2444', base2='#33417a', pattern='weave', pscale=3, pamt=0.7, gloss=0.07, seed=48, tex='hr_front',
  tex_gloss=0.75, tex_bump=0.7, bevel=0.006)
d('hr_lining', base='#1f4a50', base2='#33727a', pattern='weave', pscale=3, pamt=0.7, gloss=0.08, seed=49, tex='hr_liner',
  tex_gloss=0.7, tex_bump=0.4, bevel=0.006)
d('hr_sleeve', base='#1c2444', base2='#33417a', pattern='weave', pscale=3, pamt=0.7, gloss=0.07, seed=50, tex='hr_sleeve',
  tex_gloss=0.75, tex_bump=0.6, bevel=0.006)
# metals
d('hr_gold', base='#bd9540', base2='#efca78', pattern='noise', pscale=10, pamt=0.6, gloss=0.88, wear=0.85, bevel=0.004, seed=51)
d('hr_gold_dk', base='#7c5c28', base2='#b08a3c', pattern='noise', pscale=9, pamt=0.5, gloss=0.7, wear=0.6, bevel=0.004, seed=52)
d('hr_blade', base='#a9b6c3', base2='#eef5fa', pattern='noise', pscale=14, pamt=0.55, gloss=1.0, wear=0.85, bevel=0.0025, seed=53)
d('hr_blade_ed', base='#d6e2ec', base2='#ffffff', pattern='noise', pscale=14, pamt=0.4, gloss=1.0, wear=0.9, bevel=0.0015, seed=54)
d('hr_silver', base='#b8c2cc', base2='#e8eef3', pattern='noise', pscale=12, pamt=0.5, gloss=0.95, wear=0.6, bevel=0.003, seed=55)
d('hr_gem', base='#2fd0c0', base2='#8ff5e6', pattern='noise', pscale=20, pamt=0.5, emit=0.3, gloss=0.9, bevel=0.003, seed=56)
# skin, hair
d('hr_skin', base='#e9d6cc', base2='#d0aa9e', pattern='noise', pscale=5, pamt=0.3, gloss=0.16, seed=57, bevel=0.006)
d('hr_lip', base='#b87a80', base2='#9c5f68', pattern='noise', pscale=8, pamt=0.3, gloss=0.3, seed=58, bevel=0.003)
d('hr_eye', base='#eef0f2', gloss=0.6, bevel=0.002)
d('hr_iris', base='#8fd0e0', base2='#4a8aa8', pattern='noise', pscale=30, pamt=0.7, gloss=0.7, bevel=0.002)
d('hr_brow', base='#7a8294', bevel=0.002)
d('hr_lash', base='#2a2e3a', bevel=0.002)
d('hr_hair_a', tex='hr_hairlines', tex_gloss=0.55, tex_bump=0.25, base='#d6e0f0', base2='#8a9cc0', pattern='noise', pscale=28, pamt=0.5, gloss=0.35, bump=0.2, bscale=120, seed=60,
  bevel=0.003)
d('hr_hair_b', tex='hr_hairlines', tex_gloss=0.55, tex_bump=0.25, base='#c9d5e8', base2='#8294b8', pattern='noise', pscale=34, pamt=0.55, gloss=0.35, bump=0.2, bscale=120, seed=61,
  bevel=0.003)
d('hr_hair_c', tex='hr_hairlines', tex_gloss=0.55, tex_bump=0.25, base='#e3ebf6', base2='#a4b4d0', pattern='noise', pscale=24, pamt=0.45, gloss=0.4, bump=0.2, bscale=120, seed=62,
  bevel=0.003)
# legs and boots, belt, gloves
d('hr_legging', base='#2a2c36', base2='#42454f', pattern='weave', pscale=7, pamt=0.5, gloss=0.12, seed=63, bevel=0.006)
d('hr_boot', base='#141826', base2='#2c3448', pattern='noise', pscale=9, pamt=0.6, gloss=0.5, wear=0.7, bump=0.3, bscale=70,
  seed=64, bevel=0.006)
d('hr_sole', base='#0e0f14', base2='#1c1e26', pattern='noise', pscale=12, pamt=0.4, gloss=0.2, bevel=0.004, seed=65)
d('hr_belt', base='#26191a', base2='#4a3430', pattern='noise', pscale=10, pamt=0.6, gloss=0.35, wear=0.6, bump=0.3, bscale=70,
  seed=66, bevel=0.004)
d('hr_glove', base='#1a1b24', base2='#34363f', pattern='noise', pscale=10, pamt=0.55, gloss=0.3, wear=0.5, bump=0.3, bscale=70,
  seed=67, bevel=0.004)
# weapons
d('hr_grip', base='#1b2240', base2='#3a4678', pattern='vbands', pscale=2.6, pamt=0.9, gloss=0.3, bump=0.35, bscale=80, seed=68,
  bevel=0.003)
d('hr_staffwood', base='#231918', base2='#3a2a27', pattern='grain', pscale=5, pamt=0.35, wear=0.45, gloss=0.35, seed=69, bevel=0.004)
d('hr_hair_cap', tex='hr_hairlines', tex_gloss=0.5, tex_bump=0.2, base='#b9c6dc', base2='#7587aa', pattern='noise', pscale=22, pamt=0.6, gloss=0.3, seed=63, bevel=0.003)
d('hr_chain', base='#9a7a34', base2='#d9b468', pattern='noise', pscale=10, pamt=0.6, gloss=0.85, wear=0.5, bevel=0.002, seed=70)
d('hr_cord', base='#1b2240', base2='#3a4678', pattern='noise', pscale=10, pamt=0.5, gloss=0.1, seed=71, bevel=0.002)


# ------------------------------------------------------------------------------------------------ embroidery images

GOLD = np.array([0.80, 0.63, 0.29])
GOLD_HI = np.array([0.93, 0.78, 0.42])


def reg_image(key, rgba):
    """mats.image, but with the colour space and alpha mode set BEFORE the pixels and the image packed afterwards: a generated
    image whose colour space changes after its pixels were set is regenerated (opaque black) by Blender. Registers the image in
    mats' table so that `tex=` specs find it."""
    rgba = np.asarray(rgba, np.float32)
    h, w = rgba.shape[:2]
    name = 'tex_' + key
    old = bpy.data.images.get(name)
    if old is not None:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name, w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'sRGB'
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).ravel())
    img.update()
    img.pack()
    mats._images[key] = img
    return img


def _canvas(w, h):
    return np.zeros((h, w, 4), np.float32)


def _paint(img, mask, col=GOLD):
    """Lay `col` over the image where mask (0..1) is set."""
    a = np.clip(mask, 0, 1)[..., None]
    img[..., :3] = img[..., :3] * (1 - a) + np.asarray(col, np.float32) * a
    img[..., 3:4] = np.maximum(img[..., 3:4], a)


def _soft(sd, px):
    """Coverage from a signed distance (negative inside) with a ramp of `px` pixels."""
    return np.clip(0.5 - sd / px, 0, 1)


def _crescent(X, Y, cx, cy, r, shift, inner=0.82):
    """Signed distance of a crescent (horns up): a disc of radius r minus a disc shifted up by `shift`."""
    d1 = np.hypot(X - cx, Y - cy) - r
    d2 = r * inner - np.hypot(X - cx, Y - cy + shift)
    return np.maximum(d1, d2)


def _star4(X, Y, cx, cy, r):
    """Signed distance (approximate) of a four-pointed star of radius r: an astroid |x|^p + |y|^p = r^p."""
    dx, dy = np.abs(X - cx), np.abs(Y - cy)
    p = 0.6
    return ((dx ** p + dy ** p) ** (1.0 / p) - r) * 0.5


def _line(X, Y, x0, y0, x1, y1, w):
    """Signed distance of a segment of half-width w."""
    px, py = X - x0, Y - y0
    dx, dy = x1 - x0, y1 - y0
    t = np.clip((px * dx + py * dy) / max(dx * dx + dy * dy, 1e-9), 0, 1)
    return np.hypot(px - t * dx, py - t * dy) - w


def images():
    """Register the embroidery images (call inside build: the scene is reset per module). Sizes are physical: the panel image
    is 0.25 m x 0.7 m, the sleeve 0.34 m x 0.30 m."""
    W, H = 200, 560           # panel image: 0.25 m wide, 0.7 m tall -> 1.25 mm / px
    sx = 0.25 / W
    sy = 0.70 / H
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    X, Y = xs * sx, ys * sy   # metres, y down from the waist

    def trim(img, hem=0.0, edge=True):
        # hem band (thick + thin line) and side edging
        d_hem = 0.70 - Y                                   # distance up from the hem
        band = _soft(np.abs(d_hem - 0.011) - 0.0105, 0.0016)
        thin = _soft(np.abs(d_hem - 0.032) - 0.0024, 0.0014)
        _paint(img, band)
        _paint(img, thin, GOLD * 0.9)
        if edge:
            side = np.minimum(X, 0.25 - X)
            _paint(img, _soft(np.abs(side - 0.004) - 0.0028, 0.0014))

    # ---- plain panel
    p = _canvas(W, H)
    trim(p)
    # a fine vertical embroidered line and a few little stars up the middle
    _paint(p, _soft(np.abs(X - 0.125) - 0.0016, 0.0012) * (Y > 0.08) * (Y < 0.56) * 0.8, GOLD * 0.85)
    for yy in (0.22, 0.34, 0.46):
        _paint(p, _soft(_star4(X, Y, 0.125, yy, 0.013), 0.0016), GOLD_HI)
    reg_image('hr_panel', p)

    # ---- back panel: the big gold crescent with a star, flourish lines and the trim
    b = _canvas(W, H)
    trim(b)
    cx, cy = 0.125, 0.40
    cres = _crescent(X, Y, cx, cy, 0.072, 0.02, 0.8)
    _paint(b, _soft(cres, 0.0016), GOLD)
    ring = np.abs(np.hypot(X - cx, Y - cy) - 0.088) - 0.0013
    _paint(b, _soft(ring, 0.0014) * ((Y - cy) > -0.01), GOLD * 0.95)
    _paint(b, _soft(_star4(X, Y, cx + 0.0, cy - 0.015, 0.018), 0.0016), GOLD_HI)
    for (x0, y0, x1, y1) in ((0.125, 0.05, 0.125, 0.29), (0.125, 0.51, 0.125, 0.62)):
        _paint(b, _soft(_line(X, Y, x0, y0, x1, y1, 0.0014), 0.0013), GOLD * 0.9)
    for yy in (0.14, 0.2, 0.56, 0.62):
        _paint(b, _soft(_star4(X, Y, 0.125, yy, 0.01), 0.0014), GOLD_HI)
    reg_image('hr_back', b)

    # ---- front panel: a smaller crescent near the hem
    f = _canvas(W, H)
    trim(f)
    cx, cy = 0.125, 0.50
    cres = _crescent(X, Y, cx, cy, 0.05, 0.014, 0.8)
    _paint(f, _soft(cres, 0.0016), GOLD)
    _paint(f, _soft(_line(X, Y, 0.125, 0.06, 0.125, 0.43, 0.0013), 0.0012), GOLD * 0.9)
    for yy in (0.16, 0.26, 0.36):
        _paint(f, _soft(_star4(X, Y, 0.125, yy, 0.01), 0.0014), GOLD_HI)
    reg_image('hr_front', f)

    # ---- teal lining: a thin gold line at the hem and sides only
    l = _canvas(W, H)
    d_hem = 0.70 - Y
    _paint(l, _soft(np.abs(d_hem - 0.012) - 0.0012, 0.0012), GOLD * 0.9)
    side = np.minimum(X, 0.25 - X)
    _paint(l, _soft(np.abs(side - 0.003) - 0.0016, 0.0012), GOLD * 0.9)
    reg_image('hr_liner', l)

    # ---- strands for the hair: fine dark and bright lines along the lock (u round the lock, v along it)
    rnd = np.random.RandomState(5)
    hw_, hh_ = 128, 8
    hairimg = _canvas(hw_, hh_)
    for _ in range(22):
        u = rnd.randint(hw_)
        w = int(rnd.choice([1, 1, 2]))
        a = 0.35 + 0.35 * rnd.rand()
        col = np.array([0.46, 0.52, 0.64]) if rnd.rand() < 0.75 else np.array([1.0, 1.0, 1.0])
        for x in range(u, u + w):
            hairimg[:, x % hw_, :3] = col
            hairimg[:, x % hw_, 3] = a
    reg_image('hr_hairlines', hairimg)

    # ---- bell sleeve: hem band
    SW, SH = 200, 180
    ys2, xs2 = np.mgrid[0:SH, 0:SW].astype(np.float32)
    X2, Y2 = xs2 * (0.34 / SW), ys2 * (0.30 / SH)
    s = _canvas(SW, SH)
    d2 = 0.30 - Y2
    _paint(s, _soft(np.abs(d2 - 0.010) - 0.0095, 0.0016))
    _paint(s, _soft(np.abs(d2 - 0.029) - 0.0022, 0.0014), GOLD * 0.9)
    for i in range(4):
        _paint(s, _soft(_star4(X2, Y2, 0.34 * (i + 0.5) / 4, 0.19, 0.011), 0.0014), GOLD_HI)
    reg_image('hr_sleeve', s)
