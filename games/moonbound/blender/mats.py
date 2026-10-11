"""Painted materials for the Moonbound sprites (Cycles node trees, built from Python).

Every material is one node tree that can show four things, chosen by a shared "MODE" value:
  0 albedo (linear colour), 1 camera-space normal (encoded n * 0.5 + 0.5), 2 emissive mask (R) and gloss (G),
  3 ambient occlusion (R small, G large, B crevice).
The tree ends in an Emission shader, so a render with no bounces returns whichever quantity is selected. The game lights the
sprites itself (moonlight, braziers, spell glow, rim light), so the albedo is unlit colour; its painterly variation comes from
the patterns below, and bl.combine adds occlusion, cavity darkening and edge light.

A material is named by a key and described by a spec (`define(key, **spec)`); `SPECS` holds the shared palette. Spec fields:
  base        colour (sRGB hex '#7bc043' or an sRGB tuple)
  base2       second colour, mixed in by `pattern`
  pattern     None | 'noise' (blotches) | 'spots' | 'stripes' (horizontal bands) | 'fade' (base at z0, base2 at z1, metres) |
              'weave' (cloth: fine crossed threads + soft folds) | 'grain' (wood along local z) | 'marble' (veins) |
              'cracks' (stone: dark crack lines) | 'vbands' (bands across UV v: hems, trims, wrapped grips)
  pscale      pattern scale (higher = smaller features), pamt mix strength 0..1, z0, z1 for 'fade'
  emit        0..1 glow mask (eyes, runes, lantern flames): the game makes these parts glow
  gloss       0..1 how shiny the game draws it under its lights (metal 0.7-1, wet bone 0.3, cloth 0.05)
  wear        0..1 lighter, rubbed convex edges (pointiness): old metal, worn stone
  dirt        0..1 darker toward the ground (z below 0.5 m)
  bevel       rounded-edge radius for the normal map (metres)
  bump        surface bump strength, bscale its scale
  seed        offsets the noise so two materials with the same pattern do not match
  tex         key of an image registered with `image(key, rgba)`, mapped by the mesh UVs: where its alpha is set the colour
              becomes the image colour (embroidery, runes, painted sigils); tex_gloss / tex_emit set gloss and glow there,
              tex_bump raises it in the normal map
"""
import bpy
import numpy as np

_cache = {}
_images = {}
_cur = None
SPECS = {}


def srgb(c):
    """'#rrggbb' or an sRGB tuple -> linear tuple."""
    if isinstance(c, str):
        c = c.lstrip('#')
        c = tuple(int(c[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def define(key, **spec):
    """Add or replace a material spec. Call before the first `get(key)` in a run."""
    SPECS[key] = spec
    _cache.pop(key, None)


def image(key, rgba):
    """Register an RGBA float image (H x W x 4, 0..1, sRGB colour, row 0 at the TOP) for `tex=` specs."""
    rgba = np.asarray(rgba, np.float32)
    h, w = rgba.shape[:2]
    img = bpy.data.images.get('tex_' + key) or bpy.data.images.new('tex_' + key, w, h, alpha=True, float_buffer=False)
    if img.size[0] != w or img.size[1] != h:
        img.scale(w, h)
    # colour space and alpha mode first: in Blender 5.2 changing them regenerates a generated image's buffer
    img.colorspace_settings.name = 'sRGB'
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).ravel())
    img.update()
    _images[key] = img
    return img


def reset():
    _cache.clear()
    _images.clear()


def get(key):
    if key not in _cache:
        _cache[key] = build(key)
    return _cache[key]


def set_mode(mode):
    for m in bpy.data.materials:
        if m.node_tree and 'MODE' in m.node_tree.nodes:
            m.node_tree.nodes['MODE'].outputs[0].default_value = float(mode)


# ------------------------------------------------------------------------------------------------ node DSL

class V:
    """A scalar socket with operators."""
    def __init__(self, sock):
        self.sock = sock

    def __add__(self, o): return _math('ADD', self, o)
    def __radd__(self, o): return _math('ADD', o, self)
    def __sub__(self, o): return _math('SUBTRACT', self, o)
    def __rsub__(self, o): return _math('SUBTRACT', o, self)
    def __mul__(self, o): return _math('MULTIPLY', self, o)
    def __rmul__(self, o): return _math('MULTIPLY', o, self)


class C:
    """A colour / vector socket."""
    def __init__(self, sock):
        self.sock = sock


def _new(typ, **props):
    n = _cur.nodes.new(typ)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def _feed(sock, val):
    if isinstance(val, (V, C)):
        _cur.links.new(val.sock, sock)
    elif isinstance(val, (tuple, list)):
        sock.default_value = tuple(val) + ((1.0,) if len(val) == 3 and len(sock.default_value) == 4 else ())
    elif val is not None:
        sock.default_value = float(val)


def _math(op, a, b=None, clamp=False):
    n = _new('ShaderNodeMath', operation=op, use_clamp=clamp)
    _feed(n.inputs[0], a)
    if b is not None:
        _feed(n.inputs[1], b)
    return V(n.outputs[0])


def mapr(x, a, b):
    n = _new('ShaderNodeMapRange', data_type='FLOAT', interpolation_type='SMOOTHSTEP', clamp=True)
    _feed(n.inputs[0], x)
    _feed(n.inputs[1], a)
    _feed(n.inputs[2], b)
    _feed(n.inputs[3], 0.0)
    _feed(n.inputs[4], 1.0)
    return V(n.outputs[0])


def xyz(vec):
    n = _new('ShaderNodeSeparateXYZ')
    _feed(n.inputs[0], vec)
    return V(n.outputs[0]), V(n.outputs[1]), V(n.outputs[2])


def comb(x, y, z):
    n = _new('ShaderNodeCombineXYZ')
    _feed(n.inputs[0], x)
    _feed(n.inputs[1], y)
    _feed(n.inputs[2], z)
    return C(n.outputs[0])


def mapping(vec, sc=(1, 1, 1), loc=(0, 0, 0)):
    n = _new('ShaderNodeMapping', vector_type='POINT')
    _feed(n.inputs[0], vec)
    n.inputs['Location'].default_value = loc
    n.inputs['Scale'].default_value = sc
    return C(n.outputs[0])


def noise(vec, scale=5.0, detail=2.0, rough=0.5):
    n = _new('ShaderNodeTexNoise', noise_dimensions='3D')
    _feed(n.inputs['Vector'], vec)
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    return V(n.outputs['Factor'])


def voro(vec, scale=5.0, feature='F1', out='Distance'):
    n = _new('ShaderNodeTexVoronoi', voronoi_dimensions='3D', feature=feature)
    _feed(n.inputs['Vector'], vec)
    n.inputs['Scale'].default_value = scale
    return V(n.outputs[out])


def wave(vec, scale, direction='Z', distortion=1.5, kind='BANDS', detail=2.0):
    n = _new('ShaderNodeTexWave', wave_type=kind, bands_direction=direction)
    _feed(n.inputs['Vector'], vec)
    n.inputs['Scale'].default_value = scale
    n.inputs['Distortion'].default_value = distortion
    n.inputs['Detail'].default_value = detail
    return V(n.outputs['Fac'])


def mixc(fac, a, b):
    n = _new('ShaderNodeMix', data_type='RGBA', blend_type='MIX', clamp_factor=True)
    _feed(n.inputs[0], fac)
    ins = [i for i in n.inputs if i.type == 'RGBA']
    _feed(ins[0], a)
    _feed(ins[1], b)
    return C([o for o in n.outputs if o.type == 'RGBA'][0])


def mulc(a, f):
    n = _new('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', clamp_factor=True)
    n.inputs[0].default_value = 1.0
    ins = [i for i in n.inputs if i.type == 'RGBA']
    _feed(ins[0], a)
    _feed(ins[1], comb(f, f, f) if isinstance(f, V) else (f, f, f))
    return C([o for o in n.outputs if o.type == 'RGBA'][0])


def _const(x):
    n = _new('ShaderNodeValue')
    n.outputs[0].default_value = float(x)
    return V(n.outputs[0])


# ------------------------------------------------------------------------------------------------ the surface

DEFAULTS = dict(base='#808080', base2=None, pattern=None, pscale=6.0, pamt=1.0, z0=0.0, z1=1.0, emit=0.0, gloss=0.05,
                wear=0.0, dirt=0.0, bevel=0.012, bump=0.0, bscale=40.0, seed=0.0, tex=None, tex_gloss=None, tex_emit=0.0,
                tex_bump=0.0)


def build(key):
    spec = dict(DEFAULTS)
    if key not in SPECS:
        raise KeyError('no material spec for %r (mats.define it)' % key)
    spec.update(SPECS[key])
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    global _cur
    _cur = m.node_tree
    _cur.nodes.clear()
    surface(spec)
    _cur = None
    return m


def surface(s):
    geo = _new('ShaderNodeNewGeometry')
    P = C(geo.outputs['Position'])
    seed = s['seed']
    Pn = mapping(P, loc=(seed * 1.7, seed * 0.9, seed * 2.3))
    X, Y, Z = xyz(P)
    UVn = _new('ShaderNodeUVMap')
    UV = C(UVn.outputs['UV'])
    base = srgb(s['base'])
    col = mixc(0.0, base, base)
    ht = None  # extra height for the bump (pattern relief)
    pat = s['pattern']
    if pat:
        b2 = srgb(s['base2'] or s['base'])
        if pat == 'noise':
            f = mapr(noise(Pn, s['pscale'], 3.0, 0.55), 0.42, 0.62)
        elif pat == 'spots':
            f = 1.0 - mapr(voro(Pn, s['pscale']), 0.18, 0.3)
        elif pat == 'stripes':
            f = mapr(wave(Pn, s['pscale']), 0.45, 0.55)
        elif pat == 'fade':
            f = mapr(Z, s['z0'], s['z1'])
        elif pat == 'weave':
            # cloth: soft fold shading (large noise) plus fine thread texture
            folds = noise(mapping(Pn, sc=(1.0, 1.0, 2.6)), s['pscale'], 2.0, 0.5)
            threads = wave(mapping(Pn, sc=(1, 1, 1)), s['pscale'] * 30.0, 'X', 0.4) * 0.5 + \
                wave(mapping(Pn, sc=(1, 1, 1)), s['pscale'] * 30.0, 'Z', 0.4) * 0.5
            f = mapr(folds, 0.35, 0.7) * 0.8 + threads * 0.2
            ht = threads
        elif pat == 'grain':
            f = mapr(wave(mapping(Pn, sc=(1.0, 1.0, 0.15)), s['pscale'], 'X', 4.0, 'RINGS'), 0.3, 0.7)
            ht = f
        elif pat == 'marble':
            vein = wave(Pn, s['pscale'], 'X', 9.0, 'BANDS', 4.0)
            f = 1.0 - mapr(_math('ABSOLUTE', vein - 0.5), 0.0, 0.08)
        elif pat == 'cracks':
            cr = voro(Pn, s['pscale'], 'DISTANCE_TO_EDGE')
            f = 1.0 - mapr(cr, 0.0, 0.035)
            mott = noise(Pn, s['pscale'] * 0.6, 3.0, 0.6)
            col = mixc(mapr(mott, 0.4, 0.7) * 0.6, col, mulc(col, 0.72))
            ht = mapr(cr, 0.0, 0.05)
        else:  # vbands: bands along the UV v coordinate (hems, trims, wrapped grips)
            _, v, _ = xyz(UV)
            f = mapr(_math('SINE', v * (s['pscale'] * 6.2832)), -0.2, 0.2)
        col = mixc(f * s['pamt'], col, b2)
    # a faint large-scale mottling so flat colours never look plastic
    mott = noise(mapping(Pn, sc=(3, 3, 3)), 1.0, 2.0, 0.5) * 0.18 + 0.91
    col = mulc(col, mott)
    if s['dirt']:
        col = mulc(col, mapr(Z, 0.0, 0.5) * s['dirt'] + (1.0 - s['dirt']))
    gloss = _const(s['gloss'])
    emit = _const(s['emit'])
    if s['wear']:
        pt = V(geo.outputs['Pointiness'])
        wv = mapr(pt, 0.52, 0.6) * s['wear']
        col = mixc(wv, col, mulc(col, 1.6))
        gloss = gloss + wv * 0.2
    if s['tex']:
        img = _images[s['tex']]
        tn = _new('ShaderNodeTexImage', interpolation='Linear', extension='REPEAT')
        tn.image = img
        _feed(tn.inputs['Vector'], UV)
        ta = V(tn.outputs['Alpha'])
        col = mixc(ta, col, C(tn.outputs['Color']))
        if s['tex_gloss'] is not None:
            gloss = gloss * (1.0 - ta) + ta * s['tex_gloss']
        if s['tex_emit']:
            emit = emit + ta * s['tex_emit']
        if s['tex_bump']:
            ht = ta if ht is None else ht + ta * 2.0

    # ---- normal: bevelled edges, a surface bump, pattern relief
    nrm = None
    if s['bump'] > 0 or (ht is not None and (s['tex_bump'] or pat in ('weave', 'grain', 'cracks'))):
        h = noise(mapping(Pn, sc=(s['bscale'],) * 3), 1.0, 2.0, 0.5) if s['bump'] > 0 else _const(0.5)
        if ht is not None:
            h = h + ht * (0.6 + s['tex_bump'])
        bn = _new('ShaderNodeBump')
        _feed(bn.inputs['Strength'], max(s['bump'], 0.35))
        _feed(bn.inputs['Distance'], 0.004)
        _feed(bn.inputs['Height'], h)
        nrm = C(bn.outputs['Normal'])
    bv = _new('ShaderNodeBevel', samples=6)
    _feed(bv.inputs['Radius'], s['bevel'])
    if nrm is not None:
        _cur.links.new(nrm.sock, bv.inputs['Normal'])
    Nb = C(bv.outputs['Normal'])
    vt = _new('ShaderNodeVectorTransform', vector_type='NORMAL', convert_from='WORLD', convert_to='CAMERA')
    _cur.links.new(Nb.sock, vt.inputs['Vector'])
    cx, cy, cz = xyz(C(vt.outputs['Vector']))
    # Blender's camera space looks down -Z: a normal facing the camera has -z there, so flip z to make +z "toward the viewer"
    enc = comb(cx * 0.5 + 0.5, cy * 0.5 + 0.5, cz * -0.5 + 0.5)

    # ---- AO inputs
    aos = []
    for dist in (0.04, 0.35, 0.015):
        a = _new('ShaderNodeAmbientOcclusion', samples=2, inside=False, only_local=False)
        _feed(a.inputs['Distance'], dist)
        _cur.links.new(Nb.sock, a.inputs['Normal'])
        aos.append(V(a.outputs['AO']))
    aoc = comb(*aos)
    emg = comb(emit, gloss, 0.0)

    # ---- outputs by mode
    mode = _new('ShaderNodeValue')
    mode.name = 'MODE'
    mode.label = 'MODE'
    mv = V(mode.outputs[0])
    gt = lambda t: _math('GREATER_THAN', mv, t)
    sel = mixc(gt(0.5), col, enc)
    sel = mixc(gt(1.5), sel, emg)
    sel = mixc(gt(2.5), sel, aoc)
    es = _new('ShaderNodeEmission')
    _cur.links.new(sel.sock, es.inputs['Color'])
    out = _new('ShaderNodeOutputMaterial')
    _cur.links.new(es.outputs[0], out.inputs['Surface'])


# ------------------------------------------------------------------------------------------------ shared palette
# The game's palette (DESIGN.md "Palette"): navy, teal, bone, aged gold and cold silver, with soul-light teal and moon cyan as the
# only saturated glows. Region-specific materials are defined in their own modules.

def _palette():
    d = define
    # glows
    d('soul', base='#7ff3ff', emit=1.0, bevel=0.004)            # soul light: eyes, wisps, runes
    d('soul_teal', base='#3fe0c5', emit=1.0, bevel=0.004)
    d('moonfire', base='#b9e6ff', emit=1.0, bevel=0.004)        # the heroine's moon magic
    d('ember', base='#ffb35a', emit=1.0, bevel=0.004)           # candle and brazier flame
    d('violet_glow', base='#b98cff', emit=1.0, bevel=0.004)
    # metals
    d('gold', base='#b98a3a', base2='#e8c27a', pattern='noise', pscale=9, pamt=0.6, gloss=0.85, wear=0.8, bevel=0.006)
    d('gold_dark', base='#7a5a26', base2='#a8823e', pattern='noise', pscale=9, pamt=0.5, gloss=0.7, wear=0.6, bevel=0.006)
    d('silver', base='#b8c2cc', base2='#e6edf2', pattern='noise', pscale=12, pamt=0.5, gloss=0.95, wear=0.6, bevel=0.004)
    d('steel_dark', base='#3a4250', base2='#566070', pattern='noise', pscale=10, pamt=0.5, gloss=0.6, wear=0.7, bevel=0.008)
    d('iron', base='#2c2f35', base2='#4a4f58', pattern='noise', pscale=8, pamt=0.6, gloss=0.45, wear=0.8, bevel=0.008)
    d('rust_iron', base='#3a2c26', base2='#6b4a36', pattern='noise', pscale=7, pamt=0.7, gloss=0.25, wear=0.5, bevel=0.008)
    # bone and the dead
    d('bone', base='#d6ccb4', base2='#9c917a', pattern='noise', pscale=11, pamt=0.55, gloss=0.18, wear=0.5, seed=7, bevel=0.008)
    d('bone_old', base='#b3a78c', base2='#6f6656', pattern='cracks', pscale=14, pamt=0.7, gloss=0.12, wear=0.4, seed=9, dirt=0.4)
    d('bone_dark', base='#6a6052', base2='#3c362e', pattern='noise', pscale=10, pamt=0.6, gloss=0.1, seed=11)
    d('ghost', base='#7fb8d6', base2='#c4ecff', pattern='noise', pscale=5, pamt=0.7, emit=0.35, gloss=0.2, seed=13)
    d('shroud', base='#2a2d48', base2='#3d4470', pattern='weave', pscale=3, pamt=0.6, seed=15, dirt=0.3)
    d('shroud_rag', base='#1f1c2e', base2='#36324e', pattern='weave', pscale=3, pamt=0.7, seed=16, dirt=0.4)
    # cloth and leather
    d('leather', base='#3a2a22', base2='#5a4232', pattern='noise', pscale=9, pamt=0.6, gloss=0.2, wear=0.5, bump=0.3, bscale=60)
    d('leather_dark', base='#211a18', base2='#3a2e28', pattern='noise', pscale=9, pamt=0.6, gloss=0.25, wear=0.5, bump=0.3)
    d('rope', base='#6b5a42', base2='#8f7a58', pattern='stripes', pscale=40, pamt=0.6, bump=0.4)
    # stone and wood (props)
    d('stone', base='#4a4d57', base2='#30323a', pattern='cracks', pscale=5, pamt=0.7, wear=0.5, dirt=0.3, bevel=0.02, seed=21)
    d('stone_dark', base='#2e3038', base2='#1d1e24', pattern='cracks', pscale=5, pamt=0.7, wear=0.4, dirt=0.3, bevel=0.02, seed=22)
    d('stone_pale', base='#7d7f86', base2='#55575f', pattern='cracks', pscale=5, pamt=0.6, wear=0.6, dirt=0.25, bevel=0.02, seed=23)
    d('marble', base='#c9c6c0', base2='#8f8c88', pattern='marble', pscale=3, pamt=0.6, gloss=0.35, wear=0.4, bevel=0.015)
    d('moss', base='#2f3a26', base2='#4c5a33', pattern='noise', pscale=14, pamt=0.7, bump=0.6, bscale=80)
    d('wood', base='#4a3424', base2='#6b4c32', pattern='grain', pscale=9, pamt=0.6, wear=0.5, dirt=0.3)
    d('wood_dark', base='#2a1e16', base2='#45311f', pattern='grain', pscale=9, pamt=0.6, wear=0.4, dirt=0.3)
    d('candle', base='#e8dcc0', base2='#c8b48c', pattern='fade', z0=0.0, z1=0.2, pamt=0.6, gloss=0.3, bevel=0.003)
    d('char', base='#141214', bevel=0.004)


_palette()
