"""Cartoon materials for the Horde Buster sprites (Cycles node trees, built from Python).

Every material is one node tree that can show five things, chosen by a shared "MODE" value:
  0 albedo (linear colour), 1 camera-space normal (encoded n * 0.5 + 0.5), 2 emissive mask, 3 ambient occlusion
  (R small, G large, B crevice), 4 depth (distance from the camera, metres).
The tree ends in an Emission shader, so a render with no bounces returns whichever quantity is selected. The game lights the
sprites itself (toon bands, rim light, muzzle flashes and fireballs), so the albedo is flat, unlit colour.

A material is named by a key and described by a spec (`define(key, **spec)`); `SPECS` holds the shared palette. Spec fields:
  base        colour (sRGB hex '#7bc043' or a linear tuple)
  base2       second colour, mixed in by `pattern`
  pattern     None | 'noise' (blotches) | 'spots' (round spots) | 'stripes' (horizontal bands) | 'fade' (base at the bottom,
              base2 at the top, between z0 and z1)
  pscale      pattern scale (higher = smaller features), pamt mix strength 0..1, z0, z1 for 'fade'
  emit        0..1 glow mask (eyes, energy cells): the game makes these parts glow and keeps them bright in the dark
  bevel       rounded-edge radius for the normal map (metres)
  bump        surface bump strength (skin wrinkles, cloth), bscale its scale
  seed        offsets the noise so two materials with the same pattern do not match
"""
import bpy

_cache = {}
_cur = None
SPECS = {}


def srgb(c):
    """'#rrggbb' or an sRGB tuple -> linear tuple; linear tuples (marked by a leading 'L') pass through."""
    if isinstance(c, str):
        c = c.lstrip('#')
        c = tuple(int(c[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    elif len(c) == 4 and c[0] == 'L':
        return tuple(c[1:])
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def define(key, **spec):
    """Add or replace a material spec. Call before the first `get(key)` in a run."""
    SPECS[key] = spec
    _cache.pop(key, None)


def reset():
    _cache.clear()


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


def clamp01(a):
    return _math('ADD', a, 0.0, clamp=True)


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


def voro_f1(vec, scale=5.0):
    n = _new('ShaderNodeTexVoronoi', voronoi_dimensions='3D', feature='F1')
    _feed(n.inputs['Vector'], vec)
    n.inputs['Scale'].default_value = scale
    return V(n.outputs['Distance'])


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

DEFAULTS = dict(base='#808080', base2=None, pattern=None, pscale=6.0, pamt=1.0, z0=0.0, z1=1.0, emit=0.0,
                bevel=0.015, bump=0.0, bscale=40.0, seed=0.0, shade=0.0)


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
    P = C(_new('ShaderNodeNewGeometry').outputs['Position'])
    seed = s['seed']
    Pn = mapping(P, loc=(seed * 1.7, seed * 0.9, seed * 2.3))
    X, Y, Z = xyz(P)
    base = srgb(s['base'])
    col = mixc(0.0, base, base)
    if s['base2'] is not None and s['pattern']:
        b2 = srgb(s['base2'])
        pat = s['pattern']
        if pat == 'noise':
            f = mapr(noise(Pn, s['pscale'], 3.0, 0.55), 0.45, 0.6)
        elif pat == 'spots':
            f = 1.0 - mapr(voro_f1(Pn, s['pscale']), 0.18, 0.3)
        elif pat == 'stripes':
            sn = _new('ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z')
            _feed(sn.inputs['Vector'], Pn)
            sn.inputs['Scale'].default_value = s['pscale']
            sn.inputs['Distortion'].default_value = 1.5
            f = mapr(V(sn.outputs['Fac']), 0.45, 0.55)
        else:  # fade
            f = mapr(Z, s['z0'], s['z1'])
        col = mixc(f * s['pamt'], col, b2)
    # a faint large-scale mottling so flat colours do not look plastic
    mott = noise(mapping(Pn, sc=(3, 3, 3)), 1.0, 2.0, 0.5) * 0.16 + 0.92
    col = mulc(col, mott)
    if s['shade']:
        # darker toward the feet (dirt), a cheap painted gradient
        col = mulc(col, mapr(Z, 0.0, 0.6) * s['shade'] + (1.0 - s['shade']))

    # ---- normal: bevelled edges and an optional bump
    nrm = None
    if s['bump'] > 0:
        h = noise(mapping(Pn, sc=(s['bscale'],) * 3), 1.0, 2.0, 0.5)
        bn = _new('ShaderNodeBump')
        _feed(bn.inputs['Strength'], s['bump'])
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
    cam = _new('ShaderNodeCameraData')
    d = V(cam.outputs['View Z Depth'])
    dep = comb(d, d, d)
    em = _const(s['emit'])
    emc = comb(em, em, em)

    # ---- outputs by mode
    mode = _new('ShaderNodeValue')
    mode.name = 'MODE'
    mode.label = 'MODE'
    mv = V(mode.outputs[0])
    gt = lambda t: _math('GREATER_THAN', mv, t)
    sel = mixc(gt(0.5), col, enc)
    sel = mixc(gt(1.5), sel, emc)
    sel = mixc(gt(2.5), sel, aoc)
    sel = mixc(gt(3.5), sel, dep)
    es = _new('ShaderNodeEmission')
    _cur.links.new(sel.sock, es.inputs['Color'])
    out = _new('ShaderNodeOutputMaterial')
    _cur.links.new(es.outputs[0], out.inputs['Surface'])


# ------------------------------------------------------------------------------------------------ shared palette

def _palette():
    d = define
    # gore, shared by every creature
    d('flesh', base='#c2414b', base2='#ff8a8a', pattern='noise', pscale=9, pamt=0.6, bump=0.4, seed=3)
    d('meat', base='#9e1b2a', base2='#e0566a', pattern='noise', pscale=7, pamt=0.8, bump=0.6, seed=5)
    d('blood', base='#a5101e', base2='#e3263a', pattern='noise', pscale=6, pamt=0.5, bevel=0.01, seed=6)
    d('bone', base='#efe4c8', base2='#c9b98f', pattern='noise', pscale=8, pamt=0.5, seed=7)
    d('guts', base='#d7697a', base2='#9e2d45', pattern='noise', pscale=10, pamt=0.7, bump=0.8, seed=8)
    d('teeth', base='#f4ecd4', bevel=0.004)
    d('eye_white', base='#f2f0e6', bevel=0.005)
    d('pupil', base='#141018', bevel=0.003)
    d('eye_glow_yellow', base='#ffe14a', emit=1.0, bevel=0.003)
    d('eye_glow_red', base='#ff3b2a', emit=1.0, bevel=0.003)
    d('mouth', base='#3a0a12', bevel=0.004)
    d('tongue', base='#d4546a', bevel=0.004)
    # hero
    d('armour_blue', base='#2f6fd6', base2='#5aa0ff', pattern='fade', z0=0.6, z1=1.6, pamt=0.6, bevel=0.02)
    d('armour_dark', base='#1d2a4a', bevel=0.015)
    d('suit', base='#2b3448', base2='#3b4762', pattern='noise', pscale=12, pamt=0.4, bump=0.2)
    d('energy', base='#7fd4ff', emit=1.0, bevel=0.006)
    d('gun_white', base='#e7eef7', bevel=0.012)
    d('gun_metal', base='#58616f', bevel=0.01)
    d('hair_brown', base='#5a3a22', base2='#7b5232', pattern='noise', pscale=14, pamt=0.6, bump=0.6)
    d('skin_human', base='#e2a57d', bevel=0.01)
    d('boot', base='#262a33', bevel=0.012)
    # zombies
    d('skin_zombie', base='#7fb546', base2='#5d8d34', pattern='noise', pscale=5, pamt=0.7, bump=0.3, seed=1)
    d('skin_zombie_pale', base='#9fc28a', base2='#7a9e66', pattern='noise', pscale=5, pamt=0.7, bump=0.3, seed=2)
    d('shirt_torn', base='#6b7f99', base2='#4d5c70', pattern='noise', pscale=6, pamt=0.7, bump=0.2, seed=11)
    d('shirt_red', base='#a8423d', base2='#7c2f2b', pattern='noise', pscale=6, pamt=0.7, bump=0.2, seed=12)
    d('pants', base='#3e4a63', base2='#2d364a', pattern='noise', pscale=6, pamt=0.6, bump=0.2, seed=13)
    d('pants_brown', base='#6a5236', base2='#4e3c27', pattern='noise', pscale=6, pamt=0.6, bump=0.2, seed=14)
    d('shoe', base='#3b2c22', bevel=0.012)
    # demons and critters
    d('skin_brute', base='#d8382e', base2='#9b1f1c', pattern='noise', pscale=4, pamt=0.7, bump=0.4, seed=21)
    d('horn', base='#f0e2c0', base2='#8a7552', pattern='fade', z0=0.0, z1=0.3, pamt=1.0, bevel=0.01)
    d('claw', base='#2a2224', bevel=0.004)
    d('skin_spider', base='#7a3fb8', base2='#4d2378', pattern='noise', pscale=6, pamt=0.7, bump=0.3, seed=31)
    d('spider_mark', base='#d06cff', emit=0.0)
    d('skin_spitter', base='#3d8fe0', base2='#2a62a8', pattern='spots', pscale=7, pamt=0.7, bump=0.3, seed=41)
    d('belly_spitter', base='#8cc8ff')
    d('acid', base='#7cff6b', emit=1.0)
    # props
    d('barrel_red', base='#d12a22', base2='#8f1712', pattern='stripes', pscale=3, pamt=0.25, bevel=0.02)
    d('barrel_band', base='#3a3a40', bevel=0.01)
    d('hazard_yellow', base='#ffcc1a')
    d('gold', base='#ffc23d', base2='#ffe58a', pattern='fade', z0=0.0, z1=0.6, pamt=0.7, bevel=0.012)
    d('wood', base='#8a5a2b', base2='#6b4320', pattern='stripes', pscale=6, pamt=0.6)
    d('crystal_blue', base='#4fb8ff', base2='#b8e6ff', pattern='fade', z0=0.0, z1=0.25, emit=0.6, bevel=0.004)


_palette()
