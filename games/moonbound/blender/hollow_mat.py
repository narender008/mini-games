"""Hollow lane: materials. The kit's `mats.surface` shades from WORLD position, and the sheet renderer moves every frame to
its place on the sheet (which also changes its world height), so z-based patterns (dirt, fade) come out different on every
frame. These materials shade from OBJECT coordinates (they stay put on the model, in every direction), take painted numpy
textures (hollow_tex) by UV or triplanar, and add a moss blanket on up-facing surfaces, soft alpha for ghosts and a rim colour.

The output stage is the kit's (bevelled normal, three AO radii, MODE selector), so `mats.set_mode` drives them like any other.
Call `install()` at the start of every module's build(): it registers the images and puts the materials in the kit's cache.

Spec fields (all optional):
  base base2 pattern pscale pamt seed      as in mats (object-space patterns: noise, spots, stripes, fade)
  tex tint texmix uv=(su, sv)              a hollow_tex image by UV (colour; its alpha is an emit mask), x tint colour
  tri tscale                               the same, projected triplanar in object space, one tile every tscale metres
  tex_bump bump_dist bump bscale           relief from the texture height / from noise (metres)
  tex_gloss tex_emit                       gloss from the texture's gloss channel / emit from its alpha
  emit gloss wear dirt dirt_h bevel
  moss moss_col moss_col2 moss_thr moss_noise moss_scale   a mossy cover on surfaces that face up (moss 0..1)
  alpha alpha_rim fade_v=(a0, a1)          soft transparency: alpha facing the camera / at grazing angles / along UV v
  rim_col rim_pow                          colour mixed in at grazing angles (ghost glow)
  glow_v=(e0, e1)                          emit along UV v
"""
import bpy
import numpy as np

import mats
import hollow_tex
from mats import C, V, _const, _feed, _math, _new, comb, mapping, mapr, mixc, noise, srgb, voro, wave, xyz

SPECS = {}
_imgs = {}
DEFAULTS = dict(base='#808080', base2=None, pattern=None, pscale=6.0, pamt=1.0, seed=0.0, emit=0.0, gloss=0.05, wear=0.0,
                dirt=0.0, dirt_h=0.5, bevel=0.012, bump=0.0, bscale=40.0, bump_dist=0.006, tex=None, tint=None, texmix=1.0,
                uv=(1.0, 1.0), tri=None, tscale=1.0, tex_bump=0.0, tex_gloss=0.0, tex_emit=0.0, moss=0.0,
                moss_col='#2f4a24', moss_col2='#789a3a', moss_thr=0.4, moss_noise=0.5, moss_scale=5.0, alpha=1.0,
                alpha_rim=None, fade_v=None, rim_col=None, rim_pow=2.0, glow_v=None, tex_dark=None)


def define(key, **spec):
    SPECS[key] = spec


# ------------------------------------------------------------------------------------------------ images

def register(name):
    """Register the hollow_tex image `name` (and its data image: R height, G gloss) with Blender; once per scene."""
    if name in _imgs and _imgs[name][0].name in bpy.data.images:
        return
    d = hollow_tex.get(name)
    h, w = d['rgb'].shape[:2]
    em = d['emit'] if d['emit'] is not None else np.zeros((h, w), np.float32)
    # alpha stays 1: Cycles premultiplies 8-bit images, so anything stored under alpha 0 would turn black. The emit mask rides in
    # the data image's blue channel.
    rgba = np.concatenate([d['rgb'], np.ones((h, w, 1), np.float32)], -1).astype(np.float32)
    img = bpy.data.images.new('hl_' + name, w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'sRGB'     # settings first: changing them afterwards regenerates a generated image (black)
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).ravel())
    data = np.stack([d['h'], d['gloss'], em, np.ones_like(d['h'])], -1).astype(np.float32)
    im2 = bpy.data.images.new('hl_' + name + '_d', w, h, alpha=True, float_buffer=False)
    im2.colorspace_settings.name = 'Non-Color'
    im2.alpha_mode = 'STRAIGHT'
    im2.pixels.foreach_set(np.ascontiguousarray(data[::-1]).ravel())
    img.update()
    im2.update()
    _imgs[name] = (img, im2)
    import os
    if os.environ.get('HL_DEBUG'):
        px = list(img.pixels[2000:2012])
        print('DEBUG image', name, img.size[:], img.colorspace_settings.name, img.alpha_mode, [round(v, 3) for v in px], 'src rgb', d['rgb'][0, 500:503].tolist(), flush=True)


def _img_node(img, vec):
    n = _new('ShaderNodeTexImage', interpolation='Linear', extension='REPEAT')
    n.image = img
    _feed(n.inputs['Vector'], vec)
    return n


def _sep(sock):
    n = _new('ShaderNodeSeparateColor')
    mats._cur.links.new(sock, n.inputs[0])
    return V(n.outputs[0]), V(n.outputs[1]), V(n.outputs[2])


def _mulrgb(a, rgb):
    n = _new('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', clamp_factor=True)
    n.inputs[0].default_value = 1.0
    ins = [i for i in n.inputs if i.type == 'RGBA']
    _feed(ins[0], a)
    ins[1].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    return C([o for o in n.outputs if o.type == 'RGBA'][0])


def _scale_c(a, f):
    """Colour a times scalar f (a V or a number)."""
    n = _new('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', clamp_factor=False)
    n.inputs[0].default_value = 1.0
    ins = [i for i in n.inputs if i.type == 'RGBA']
    _feed(ins[0], a)
    _feed(ins[1], comb(f, f, f) if isinstance(f, V) else (f, f, f, 1.0))
    return C([o for o in n.outputs if o.type == 'RGBA'][0])


def _addc(a, b):
    n = _new('ShaderNodeMix', data_type='RGBA', blend_type='ADD', clamp_factor=False)
    n.inputs[0].default_value = 1.0
    ins = [i for i in n.inputs if i.type == 'RGBA']
    _feed(ins[0], a)
    _feed(ins[1], b)
    return C([o for o in n.outputs if o.type == 'RGBA'][0])


def _div(a, b):
    return _math('DIVIDE', a, b)


# ------------------------------------------------------------------------------------------------ the surface

def surface(s):
    tc = _new('ShaderNodeTexCoord')
    P = C(tc.outputs['Object'])
    Nobj = C(tc.outputs['Normal'])
    UV = C(tc.outputs['UV'])
    geo = _new('ShaderNodeNewGeometry')
    seed = s['seed']
    Pn = mapping(P, loc=(seed * 1.7, seed * 0.9, seed * 2.3))
    X, Y, Z = xyz(P)
    nx, ny, nz = xyz(Nobj)
    base = srgb(s['base'])
    col = mixc(0.0, base, base)
    pat = s['pattern']
    if pat:
        b2 = srgb(s['base2'] or s['base'])
        if pat == 'noise':
            f = mapr(noise(Pn, s['pscale'], 3.0, 0.55), 0.42, 0.62)
        elif pat == 'spots':
            f = 1.0 - mapr(voro(Pn, s['pscale']), 0.18, 0.3)
        elif pat == 'stripes':
            f = mapr(wave(Pn, s['pscale']), 0.45, 0.55)
        elif pat == 'rings':       # growth rings round the local Z axis
            f = mapr(wave(mapping(Pn, sc=(1.0, 1.0, 0.1)), s['pscale'], 'X', 4.0, 'RINGS'), 0.3, 0.7)
        else:                      # 'fade': base at z0 .. base2 at z1 (object metres)
            f = mapr(Z, s.get('z0', 0.0), s.get('z1', 1.0))
        col = mixc(f * s['pamt'], col, b2)
    ht = None
    gloss = _const(s['gloss'])
    emit = _const(s['emit'])
    # ---- painted textures
    if s['tex']:
        img, dimg = _imgs[s['tex']]
        sc = s['uv']
        uvm = mapping(UV, sc=(sc[0], sc[1], 1.0))
        tn = _img_node(img, uvm)
        tcol = C(tn.outputs['Color'])
        if s['tint']:
            tcol = _mulrgb(tcol, _lin(s['tint']))
        col = mixc(s['texmix'], col, tcol)
        dn = _img_node(dimg, uvm)
        hh, gg, ee = _sep(dn.outputs['Color'])
        ht = hh
        if s['tex_gloss']:
            gloss = gloss + gg * s['tex_gloss']
        if s['tex_emit']:
            emit = emit + ee * s['tex_emit']
    elif s['tri']:
        img, dimg = _imgs[s['tri']]
        k = 1.0 / s['tscale']
        Pm = mapping(P, sc=(k, k, k), loc=(seed * 0.37, seed * 0.23, seed * 0.51))
        px, py, pz = xyz(Pm)
        ax = _math('POWER', _math('ABSOLUTE', nx), 4.0)
        ay = _math('POWER', _math('ABSOLUTE', ny), 4.0)
        az = _math('POWER', _math('ABSOLUTE', nz), 4.0)
        tot = ax + ay + az + 1e-6
        wx, wy, wz = _div(ax, tot), _div(ay, tot), _div(az, tot)
        cols, hs, gs = [], [], []
        for vec in (comb(py, pz, 0.0), comb(px, pz, 0.0), comb(px, py, 0.0)):
            tn = _img_node(img, vec)
            dn = _img_node(dimg, vec)
            hh, gg, _ = _sep(dn.outputs['Color'])
            cols.append(C(tn.outputs['Color']))
            hs.append(hh)
            gs.append(gg)
        tcol = _addc(_addc(_scale_c(cols[0], wx), _scale_c(cols[1], wy)), _scale_c(cols[2], wz))
        if s['tint']:
            tcol = _mulrgb(tcol, _lin(s['tint']))
        col = mixc(s['texmix'], col, tcol)
        ht = hs[0] * wx + hs[1] * wy + hs[2] * wz
        if s['tex_gloss']:
            gloss = gloss + (gs[0] * wx + gs[1] * wy + gs[2] * wz) * s['tex_gloss']
    # ---- moss on up-facing surfaces
    if s['moss'] > 0:
        mn_ = noise(Pn, s['moss_scale'], 3.0, 0.6)
        up = nz + (mn_ - 0.5) * (s['moss_noise'] * 2.0)
        mm = mapr(up, s['moss_thr'], s['moss_thr'] + 0.28) * s['moss']
        mcol = mixc(mapr(noise(Pn, 26.0, 3.0, 0.6), 0.35, 0.65), srgb(s['moss_col']), srgb(s['moss_col2']))
        col = mixc(mm, col, mcol)
        mh = noise(mapping(Pn, sc=(3.0, 3.0, 3.0)), 30.0, 3.0, 0.6)
        ht = (mh * mm * 1.6) if ht is None else ht * (1.0 - mm * 0.8) + mh * mm * 1.6
        gloss = gloss * (1.0 - mm * 0.9)
    # ---- dirt toward the ground, rubbed edges
    if s['dirt']:
        col = _scale_c(col, mapr(Z, 0.0, s['dirt_h']) * s['dirt'] + (1.0 - s['dirt']))
    if s['wear']:
        pt = V(geo.outputs['Pointiness'])
        wv = mapr(pt, 0.52, 0.6) * s['wear']
        col = mixc(wv, col, _scale_c(col, 1.6))
        gloss = gloss + wv * 0.2
    # ---- ghostly rim colour and soft alpha
    lw = None
    if s['rim_col'] or s['alpha_rim'] is not None:
        lw = _new('ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.5
        graze = V(lw.outputs['Facing'])      # 0 facing the camera .. 1 at grazing angles
    if s['rim_col']:
        edge = mapr(graze, 0.25, 0.95)
        col = mixc(_math('POWER', edge, s['rim_pow']), col, srgb(s['rim_col']))
    if s['glow_v']:
        _, v, _ = xyz(UV)
        emit = emit + (mapr(v, 0.0, 1.0) * (s['glow_v'][1] - s['glow_v'][0]) + s['glow_v'][0])
    # ---- normal: bevelled edges, a surface bump, texture relief
    nrm = None
    if s['bump'] > 0 or (ht is not None and s['tex_bump'] > 0) or (ht is not None and s['moss'] > 0):
        h = noise(mapping(Pn, sc=(s['bscale'],) * 3), 1.0, 2.0, 0.5) if s['bump'] > 0 else _const(0.5)
        if ht is not None:
            h = h + ht * max(s['tex_bump'], 0.6 if s['moss'] > 0 else 0.0)
        bn = _new('ShaderNodeBump')
        _feed(bn.inputs['Strength'], 1.0)
        _feed(bn.inputs['Distance'], s['bump_dist'] * (1.0 if s['bump'] <= 0 else max(s['bump'], 0.3)))
        _feed(bn.inputs['Height'], h)
        nrm = C(bn.outputs['Normal'])
    bv = _new('ShaderNodeBevel', samples=6)
    _feed(bv.inputs['Radius'], s['bevel'])
    if nrm is not None:
        mats._cur.links.new(nrm.sock, bv.inputs['Normal'])
    Nb = C(bv.outputs['Normal'])
    vt = _new('ShaderNodeVectorTransform', vector_type='NORMAL', convert_from='WORLD', convert_to='CAMERA')
    mats._cur.links.new(Nb.sock, vt.inputs['Vector'])
    cx, cy, cz = xyz(C(vt.outputs['Vector']))
    enc = comb(cx * 0.5 + 0.5, cy * 0.5 + 0.5, cz * -0.5 + 0.5)
    aos = []
    for dist in (0.04, 0.35, 0.015):
        a = _new('ShaderNodeAmbientOcclusion', samples=2, inside=False, only_local=False)
        _feed(a.inputs['Distance'], dist)
        mats._cur.links.new(Nb.sock, a.inputs['Normal'])
        aos.append(V(a.outputs['AO']))
    aoc = comb(*aos)
    emg = comb(emit, gloss, 0.0)
    mode = _new('ShaderNodeValue')
    mode.name = 'MODE'
    mode.label = 'MODE'
    mv = V(mode.outputs[0])
    gt = lambda t: _math('GREATER_THAN', mv, t)
    sel = mixc(gt(0.5), col, enc)
    sel = mixc(gt(1.5), sel, emg)
    sel = mixc(gt(2.5), sel, aoc)
    es = _new('ShaderNodeEmission')
    mats._cur.links.new(sel.sock, es.inputs['Color'])
    out = _new('ShaderNodeOutputMaterial')
    surf = es.outputs[0]
    if s['alpha'] < 1.0 or s['alpha_rim'] is not None or s['fade_v']:
        a = _const(s['alpha'])
        if s['alpha_rim'] is not None:
            a = mapr(graze, 0.2, 1.0) * (s['alpha_rim'] - s['alpha']) + s['alpha']
        if s['fade_v']:
            _, v, _ = xyz(UV)
            a = a * (mapr(v, 0.0, 1.0) * (s['fade_v'][1] - s['fade_v'][0]) + s['fade_v'][0])
        mx_ = _new('ShaderNodeMixShader')
        tr = _new('ShaderNodeBsdfTransparent')
        _feed(mx_.inputs[0], a)
        mats._cur.links.new(tr.outputs[0], mx_.inputs[1])
        mats._cur.links.new(es.outputs[0], mx_.inputs[2])
        surf = mx_.outputs[0]
    mats._cur.links.new(surf, out.inputs['Surface'])


def _lin(c):
    return tuple(c)       # tints are plain linear multipliers


def build(key):
    spec = dict(DEFAULTS)
    spec.update(SPECS[key])
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    mats._cur = m.node_tree
    mats._cur.nodes.clear()
    surface(spec)
    mats._cur = None
    return m


def install():
    """Register the images and put every hollow material into the kit's cache (call at the start of each build())."""
    need = set()
    for sp in SPECS.values():
        for k in ('tex', 'tri'):
            if sp.get(k):
                need.add(sp[k])
    _imgs.clear()
    for n in sorted(need):
        register(n)
    for key in SPECS:
        mats._cache[key] = build(key)


# ------------------------------------------------------------------------------------------------ the palette
d = define

# roots, bark, moss, rock
d('hl_bark', tex='bark', tex_bump=1.0, bump_dist=0.02, tex_gloss=0.4, gloss=0.03, moss=0.55, moss_thr=0.58, moss_noise=0.8,
  dirt=0.45, dirt_h=0.45, wear=0.15, bevel=0.01)
d('hl_bark_dark', tex='bark', tint=(0.66, 0.6, 0.62), tex_bump=1.0, bump_dist=0.02, tex_gloss=0.3, gloss=0.03, moss=0.35,
  moss_thr=0.5, dirt=0.5, dirt_h=0.5, bevel=0.01, seed=3)
d('hl_rootfine', base='#5c4228', base2='#2b1d14', pattern='noise', pscale=16, pamt=0.7, bump=0.6, bscale=70, gloss=0.04,
  bevel=0.004, dirt=0.2)
d('hl_moss', base='#233a1a', base2='#587a2c', pattern='noise', pscale=34, pamt=0.85, bump=1.0, bscale=130, bump_dist=0.012,
  gloss=0.02, bevel=0.004, seed=5)
d('hl_moss_dry', base='#3c4526', base2='#78853a', pattern='noise', pscale=30, pamt=0.8, bump=1.0, bscale=120, bump_dist=0.012,
  gloss=0.02, bevel=0.004, seed=6)
d('hl_rock', tri='rock', tscale=2.2, tex_bump=0.8, bump_dist=0.014, tex_gloss=0.6, gloss=0.05, moss=0.6, moss_thr=0.66,
  moss_noise=0.7, dirt=0.4, dirt_h=0.6, wear=0.3, bevel=0.014)
d('hl_rock_pale', tri='rock', tscale=2.2, tint=(1.3, 1.25, 1.2), tex_bump=0.8, bump_dist=0.014, tex_gloss=0.6, gloss=0.08, moss=0.15,
  moss_thr=0.75, dirt=0.3, dirt_h=0.5, wear=0.3, bevel=0.014, seed=2)
d('hl_stone_pale', tri='rock', tscale=1.6, tint=(1.7, 1.65, 1.6), tex_bump=0.8, bump_dist=0.01, tex_gloss=0.6, gloss=0.08, moss=0.12,
  moss_thr=0.8, dirt=0.3, dirt_h=0.5, wear=0.5, bevel=0.016, seed=4)
d('hl_stone', tri='blocks', tscale=2.0, tex_bump=1.0, bump_dist=0.02, tex_gloss=0.3, gloss=0.06, dirt=0.3, wear=0.4,
  bevel=0.012, moss=0.3, moss_thr=0.6)
d('hl_hearthstone', tri='blocks', tscale=1.6, tint=(1.35, 1.05, 0.9), tex_bump=1.0, bump_dist=0.02, tex_gloss=0.3, gloss=0.06, dirt=0.2, wear=0.4, moss=0.05)
d('hl_stone_top', tex='runes', tex_bump=0.8, bump_dist=0.015, tex_emit=0.4, gloss=0.08, tex_gloss=0.4, wear=0.3, bevel=0.012,
  moss=0.15, moss_thr=0.7)
d('hl_slate', tri='slate', tscale=1.5, tex_bump=0.5, gloss=0.1, dirt=0.3, wear=0.4, bevel=0.01)
d('hl_void', base='#06040a', gloss=0.02, bevel=0.01)
d('hl_passage', tri='slate', tscale=1.5, tint=(0.4, 0.38, 0.42), tex_bump=0.5, gloss=0.05, bevel=0.01)
d('hl_door', tex='sigil', tex_bump=0.8, bump_dist=0.012, tex_emit=0.38, gloss=0.08, tex_gloss=0.3, wear=0.3, bevel=0.01)
d('hl_door_dormant', tex='sigil', tex_bump=0.8, bump_dist=0.012, tex_emit=0.1, gloss=0.08, tex_gloss=0.3, wear=0.3, bevel=0.01)
# wood and metal
d('hl_wood', tex='plank', tint=(1.0, 0.94, 0.9), tex_bump=1.0, bump_dist=0.006, tex_gloss=0.5, gloss=0.08, wear=0.5,
  dirt=0.3, bevel=0.008)
d('hl_wood_dark', tex='plank', tint=(0.5, 0.45, 0.45), tex_bump=1.0, bump_dist=0.006, tex_gloss=0.5, gloss=0.08, wear=0.4,
  dirt=0.3, bevel=0.008, seed=2)
d('hl_wood_old', tex='plank', tint=(0.78, 0.76, 0.76), tex_bump=1.0, bump_dist=0.006, tex_gloss=0.4, gloss=0.06, wear=0.5,
  dirt=0.35, bevel=0.008, seed=4)
d('hl_iron', tex='hammered', uv=(2.0, 2.0), tex_bump=1.0, bump_dist=0.004, tex_gloss=0.6, gloss=0.3, wear=0.9, bevel=0.006)
d('hl_brass', base='#85652a', base2='#d6ae5c', pattern='noise', pscale=14, pamt=0.6, gloss=0.8, wear=0.9, bevel=0.005, seed=8)
d('hl_gold', base='#b98a3a', base2='#ecc87c', pattern='noise', pscale=12, pamt=0.6, gloss=0.85, wear=0.9, bevel=0.005, seed=9)
d('hl_silver', base='#b8c2cc', base2='#eef3f7', pattern='noise', pscale=14, pamt=0.5, gloss=0.95, wear=0.7, bevel=0.004, seed=10)
d('hl_steel', base='#7c8590', base2='#c4ccd4', pattern='noise', pscale=16, pamt=0.5, gloss=0.8, wear=0.7, bevel=0.004, seed=11)
# leather and cloth
d('hl_leather', tex='leather', tint=(1.0, 0.95, 0.9), tex_bump=1.0, bump_dist=0.004, tex_gloss=0.8, gloss=0.1, wear=0.4, bevel=0.01)
d('hl_leather_dark', tex='leather', tint=(0.55, 0.5, 0.5), tex_bump=1.0, bump_dist=0.004, tex_gloss=0.8, gloss=0.1, wear=0.4,
  bevel=0.008, seed=2)
d('hl_book_red', tex='leather_n', tint=(1.1, 0.12, 0.1), tex_bump=0.7, bump_dist=0.003, tex_gloss=0.8, gloss=0.1, wear=0.7, bevel=0.004, seed=1)
d('hl_book_green', tex='leather_n', tint=(0.1, 0.62, 0.22), tex_bump=0.7, bump_dist=0.003, tex_gloss=0.8, gloss=0.1, wear=0.7, bevel=0.004, seed=2)
d('hl_book_blue', tex='leather_n', tint=(0.08, 0.22, 0.95), tex_bump=0.7, bump_dist=0.003, tex_gloss=0.8, gloss=0.1, wear=0.7, bevel=0.004, seed=3)
d('hl_book_brown', tex='leather_n', tint=(0.62, 0.34, 0.16), tex_bump=0.7, bump_dist=0.003, tex_gloss=0.8, gloss=0.1, wear=0.7, bevel=0.004, seed=4)
d('hl_book_plum', tex='leather_n', tint=(0.55, 0.1, 0.62), tex_bump=0.7, bump_dist=0.003, tex_gloss=0.8, gloss=0.1, wear=0.7, bevel=0.004, seed=5)
d('hl_book_black', tex='leather_n', tint=(0.16, 0.15, 0.2), tex_bump=0.7, bump_dist=0.003, tex_gloss=0.8, gloss=0.12, wear=0.7, bevel=0.004, seed=6)
d('hl_curtain', tex='curtain', tex_bump=0.3, bump_dist=0.004, tex_gloss=0.5, gloss=0.05, bevel=0.01)
d('hl_quilt', tex='quilt', tex_bump=1.0, bump_dist=0.012, gloss=0.03, bevel=0.01)
d('hl_cloth_cream', tex='weave', tint=(0.95, 0.88, 0.72), tex_bump=0.5, bump_dist=0.003, gloss=0.03, bevel=0.01)
d('hl_cloth_teal', tex='weave', tint=(0.25, 0.55, 0.55), tex_bump=0.5, bump_dist=0.003, gloss=0.03, bevel=0.01, seed=2)
d('hl_cloth_plum', tex='weave', tint=(0.5, 0.25, 0.42), tex_bump=0.5, bump_dist=0.003, gloss=0.03, bevel=0.01, seed=3)
d('hl_cloth_ochre', tex='weave', tint=(0.85, 0.6, 0.25), tex_bump=0.5, bump_dist=0.003, gloss=0.03, bevel=0.01, seed=4)
d('hl_cloth_rust', tex='weave', tint=(0.7, 0.3, 0.22), tex_bump=0.5, bump_dist=0.003, gloss=0.03, bevel=0.01, seed=5)
d('hl_rug', tex='rug', tex_bump=0.8, bump_dist=0.006, gloss=0.03, bevel=0.01)
d('hl_rope', base='#7a6240', base2='#4a3a24', pattern='stripes', pscale=60, pamt=0.7, bump=0.8, bscale=90, gloss=0.03, bevel=0.003)
d('hl_straw', base='#b08e4a', base2='#6a5028', pattern='noise', pscale=24, pamt=0.7, bump=0.8, bscale=100, gloss=0.05, bevel=0.003)
d('hl_wicker', tex='wicker', tex_bump=1.0, bump_dist=0.008, gloss=0.06, dirt=0.3, bevel=0.006)
# wax, paper, glass
d('hl_wax', base='#e9ddc0', base2='#b99c62', pattern='noise', pscale=9, pamt=0.45, gloss=0.4, bevel=0.003, seed=12)
d('hl_wax_red', base='#8a2a28', base2='#4a1414', pattern='noise', pscale=9, pamt=0.5, gloss=0.4, bevel=0.003, seed=13)
d('hl_wick', base='#12100f', bevel=0.002)
d('hl_paper', base='#d2c6a4', base2='#9c916e', pattern='noise', pscale=10, pamt=0.5, gloss=0.03, bevel=0.003, seed=14)
d('hl_pages', tex='pages', tex_emit=1.0, tex_bump=0.5, bump_dist=0.002, gloss=0.03, bevel=0.003)
d('hl_brew', tex='brew', emit=1.0, tex_emit=1.0, gloss=0.7, bevel=0.002)
d('hl_ember', tex='embers', tex_emit=1.0, tex_bump=0.8, bump_dist=0.01, gloss=0.1, bevel=0.003)
d('hl_char', base='#150f0d', base2='#3a2820', pattern='noise', pscale=22, pamt=0.6, bump=0.6, bscale=80, gloss=0.1, bevel=0.003)
for nm, b1, b2, em in (('teal', '#1cb8a6', '#68f0dc', 0.8), ('violet', '#7a44d8', '#c8a0ff', 0.8), ('amber', '#d68420', '#ffd070', 0.75),
                       ('green', '#48a838', '#b0ff72', 0.75), ('red', '#b02848', '#ff7a98', 0.6)):
    d('hl_glass_' + nm, base=b1, base2=b2, pattern='noise', pscale=18, pamt=0.55, emit=em, gloss=0.9, bevel=0.003)
d('hl_glass_empty', base='#32423e', base2='#6a8a86', pattern='noise', pscale=14, pamt=0.5, emit=0.04, gloss=0.95, bevel=0.003)
d('hl_bone', base='#d2c8ae', base2='#8c8068', pattern='noise', pscale=12, pamt=0.55, gloss=0.18, wear=0.5, bevel=0.006, seed=27)
d('hl_grip', base='#1c2340', base2='#0c1020', pattern='stripes', pscale=110, pamt=0.8, bump=0.6, bscale=120, gloss=0.2, bevel=0.003, seed=28)
d('hl_cork', base='#8a6a42', base2='#5a4228', pattern='noise', pscale=30, pamt=0.6, bump=0.6, bscale=100, gloss=0.05, bevel=0.003)
d('hl_lantern_glass', base='#ff9a3a', base2='#ffd890', pattern='noise', pscale=8, pamt=0.6, emit=0.85, gloss=0.6, bevel=0.003)
d('hl_flame_core', base='#fff0c0', emit=1.0, bevel=0.002)
# fungi, herbs, mushrooms
d('hl_fungus_teal', base='#14a690', base2='#b8fff0', pattern='spots', pscale=22, pamt=0.55, emit=0.3, gloss=0.4, bevel=0.003, seed=15)
d('hl_fungus_violet', base='#6a3cc0', base2='#dcc0ff', pattern='spots', pscale=22, pamt=0.55, emit=0.3, gloss=0.4, bevel=0.003, seed=16)
d('hl_fungus_stem', base='#c4d6cc', base2='#74968c', pattern='noise', pscale=20, pamt=0.6, emit=0.22, gloss=0.2, bevel=0.003, seed=17)
d('hl_mush_brown', base='#6a4830', base2='#a47c52', pattern='noise', pscale=14, pamt=0.6, gloss=0.25, bevel=0.003, seed=18)
d('hl_mush_red', base='#a83626', base2='#e8dcc0', pattern='spots', pscale=40, pamt=0.9, gloss=0.3, bevel=0.003, seed=19)
d('hl_mush_pale', base='#c6baa0', base2='#8e8268', pattern='noise', pscale=14, pamt=0.5, gloss=0.2, bevel=0.003, seed=20)
d('hl_herb', base='#38582a', base2='#7ca43e', pattern='noise', pscale=22, pamt=0.7, bump=0.5, bscale=90, gloss=0.08, bevel=0.003, seed=21)
d('hl_herb_dry', base='#6a6a34', base2='#a69a52', pattern='noise', pscale=22, pamt=0.7, bump=0.5, bscale=90, gloss=0.04, bevel=0.003, seed=22)
d('hl_flower', base='#8656c8', base2='#cdaaff', pattern='noise', pscale=24, pamt=0.7, gloss=0.1, bevel=0.003, seed=23)
d('hl_berry', base='#8a2038', base2='#d8506a', pattern='noise', pscale=24, pamt=0.6, gloss=0.5, bevel=0.003, seed=24)
# the ghost family (the kit's 'ghost' colours, a brighter rim; solid alpha, wispy edges come from thin tapering geometry)
d('hl_ghost', base='#3f8fbe', base2='#9adcf0', pattern='noise', pscale=5, pamt=0.85, emit=0.2, gloss=0.2,
  rim_col='#c4f6ff', rim_pow=2.0, bevel=0.01, seed=13)
d('hl_ghost_inner', base='#8ccfe6', base2='#d4f6ff', pattern='noise', pscale=5, pamt=0.7, emit=0.3, gloss=0.1, rim_col='#e8ffff', rim_pow=2.0, bevel=0.01, seed=15)
d('hl_ghost_eye', base='#c8fff4', emit=1.0, bevel=0.002)
d('hl_ghost_dark', base='#0c2036', emit=0.0, gloss=0.5, bevel=0.002)
d('hl_wisp', base='#6f9ee8', base2='#c8e0ff', pattern='noise', pscale=4, pamt=0.8, emit=0.24, gloss=0.15,
  rim_col='#f0f8ff', rim_pow=2.2, bevel=0.012, seed=25)
d('hl_wisp_eye', base='#0b1224', emit=0.0, gloss=0.7, bevel=0.002)
