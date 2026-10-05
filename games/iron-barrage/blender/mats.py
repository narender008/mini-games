"""Procedural materials for the Iron Barrage sprites (Cycles node trees, built from Python).

Every material is one node tree that can show four things, chosen by a shared "MODE" value:
  0 albedo (linear colour), 1 camera-space normal (encoded), 2 paint mask, 3 ambient occlusion (R small, G large).
The tree ends in an Emission shader, so a render with no bounces just returns whichever quantity is selected.
Paint is a NEUTRAL grey with a 3-tone camo; chips, mud, dust and rust change both the colour and the paint mask.
"""
import bpy

_cache = {}
_cur = None


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
    """A scalar (float) socket with operators."""
    def __init__(self, sock):
        self.sock = sock

    def __add__(self, o): return _math('ADD', self, o)
    def __radd__(self, o): return _math('ADD', o, self)
    def __sub__(self, o): return _math('SUBTRACT', self, o)
    def __rsub__(self, o): return _math('SUBTRACT', o, self)
    def __mul__(self, o): return _math('MULTIPLY', self, o)
    def __rmul__(self, o): return _math('MULTIPLY', o, self)
    def __truediv__(self, o): return _math('DIVIDE', self, o)
    def __pow__(self, o): return _math('POWER', self, o)
    def __neg__(self): return _math('MULTIPLY', self, -1.0)


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


def _math(op, a, b=None, c=None, clamp=False):
    n = _new('ShaderNodeMath', operation=op, use_clamp=clamp)
    _feed(n.inputs[0], a)
    if b is not None:
        _feed(n.inputs[1], b)
    if c is not None:
        _feed(n.inputs[2], c)
    return V(n.outputs[0])


def vmin(a, b): return _math('MINIMUM', a, b)
def vmax(a, b): return _math('MAXIMUM', a, b)
def clamp01(a): return _math('ADD', a, 0.0, clamp=True)
def absv(a): return _math('ABSOLUTE', a)
def gt(a, b): return _math('GREATER_THAN', a, b)


def mapr(x, a, b, lo=0.0, hi=1.0, smooth=True):
    """Map range with clamping; smoothstep by default."""
    n = _new('ShaderNodeMapRange', data_type='FLOAT', interpolation_type='SMOOTHSTEP' if smooth else 'LINEAR', clamp=True)
    _feed(n.inputs[0], x)
    _feed(n.inputs[1], a)
    _feed(n.inputs[2], b)
    _feed(n.inputs[3], lo)
    _feed(n.inputs[4], hi)
    return V(n.outputs[0])


def pos():
    return C(_new('ShaderNodeNewGeometry').outputs['Position'])


def gnormal():
    return C(_new('ShaderNodeNewGeometry').outputs['Normal'])


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


def noise(vec, scale=5.0, detail=2.0, rough=0.5, dist=0.0):
    n = _new('ShaderNodeTexNoise', noise_dimensions='3D')
    _feed(n.inputs['Vector'], vec)
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    n.inputs['Distortion'].default_value = dist
    return V(n.outputs['Factor'])


def voro_edge(vec, scale=5.0, rnd=1.0):
    n = _new('ShaderNodeTexVoronoi', voronoi_dimensions='3D', feature='DISTANCE_TO_EDGE')
    _feed(n.inputs['Vector'], vec)
    n.inputs['Scale'].default_value = scale
    n.inputs['Randomness'].default_value = rnd
    return V(n.outputs['Distance'])


def voro_f1(vec, scale=5.0, rnd=1.0):
    n = _new('ShaderNodeTexVoronoi', voronoi_dimensions='3D', feature='F1')
    _feed(n.inputs['Vector'], vec)
    n.inputs['Scale'].default_value = scale
    n.inputs['Randomness'].default_value = rnd
    return V(n.outputs['Distance'])


def ramp(fac, stops, const=False):
    """Colour ramp; stops = [(pos, (r,g,b)), ...]."""
    n = _new('ShaderNodeValToRGB')
    cr = n.color_ramp
    cr.interpolation = 'CONSTANT' if const else 'LINEAR'
    while len(cr.elements) > len(stops):
        cr.elements.remove(cr.elements[-1])
    while len(cr.elements) < len(stops):
        cr.elements.new(0.5)
    for e, (p, c) in zip(cr.elements, stops):
        e.position = p
        e.color = tuple(c) + (1.0,)
    _feed(n.inputs[0], fac)
    return C(n.outputs[0])


def mixc(fac, a, b):
    """Colour mix: result = a*(1-fac) + b*fac."""
    n = _new('ShaderNodeMix', data_type='RGBA', blend_type='MIX', clamp_factor=True)
    _feed(n.inputs[0], fac)
    ins = [i for i in n.inputs if i.type == 'RGBA']
    _feed(ins[0], a)
    _feed(ins[1], b)
    return C([o for o in n.outputs if o.type == 'RGBA'][0])


def mulc(a, b):
    """Colour times colour / scalar."""
    n = _new('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', clamp_factor=True)
    n.inputs[0].default_value = 1.0
    ins = [i for i in n.inputs if i.type == 'RGBA']
    _feed(ins[0], a)
    if isinstance(b, V):
        b = comb(b, b, b)
    elif isinstance(b, (int, float)):
        b = (b, b, b)
    _feed(ins[1], b)
    return C([o for o in n.outputs if o.type == 'RGBA'][0])


def dot(a, b):
    n = _new('ShaderNodeVectorMath', operation='DOT_PRODUCT')
    _feed(n.inputs[0], a)
    _feed(n.inputs[1], b)
    return V(n.outputs['Value'])


# ------------------------------------------------------------------------------------------------ the surface

DEFAULTS = dict(
    base=(0.2, 0.2, 0.2), base2=None, vary=0.0, vscale=(6, 6, 6), vdetail=3,
    camo=None, camo_scale=0.75, camo_seed=0.0,
    paint=0.0, chip=0.0, chip_col=(0.05, 0.032, 0.026), chip_steel=(0.30, 0.28, 0.26),
    rust=0.0, oil=0.0, dust=0.0, dust_col=(0.34, 0.30, 0.24), mud=0.0, mud_h=(0.05, 0.9), mud_col=(0.07, 0.057, 0.044),
    soot=0.0, burn=0.0, paint_left=0.0, grime=0.0, grime_h=(0.0, 1.6),
    bump=0.0, bscale=90.0, wave=0.0, bevel=0.012, edge_light=0.0, fine=0.06,
    seed=0.0, ao_s=0.05, ao_l=0.5, grain=None, split=None, brick=None, mortar=(0.30, 0.28, 0.25),
)


def build(key):
    """Material for a key like 'paint:warden:hull' or 'rubber'."""
    spec = dict(DEFAULTS)
    spec.update(spec_for(key))
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    global _cur
    _cur = m.node_tree
    _cur.nodes.clear()
    surface(spec)
    _cur = None
    return m


def surface(s):
    P = pos()
    X, Y, Z = xyz(P)
    seed = s['seed']
    Pn = mapping(P, loc=(seed, seed * 0.7, seed * 1.3))
    Ng = gnormal()
    # ---- brick pattern (colour and a recessed-mortar height)
    brick_col = brick_fac = None
    if s['brick']:
        bt = _new('ShaderNodeTexBrick', offset=0.5, offset_frequency=2, squash=1.0, squash_frequency=2)
        _feed(bt.inputs['Vector'], comb(X + Y * 0.7, Z, 0.0))
        _feed(bt.inputs['Color1'], s['base'])
        _feed(bt.inputs['Color2'], s['base2'])
        _feed(bt.inputs['Mortar'], s['mortar'])
        bt.inputs['Scale'].default_value = s['brick']
        bt.inputs['Mortar Size'].default_value = 0.035
        bt.inputs['Mortar Smooth'].default_value = 0.12
        bt.inputs['Bias'].default_value = 0.0
        bt.inputs['Brick Width'].default_value = 0.5
        bt.inputs['Row Height'].default_value = 0.18
        brick_col = C(bt.outputs['Color'])
        brick_fac = V(bt.outputs['Fac'])
    # ---- bump height: fine pitting plus a larger rolled-plate wobble
    nrm = None
    if s['wave'] > 0:
        # rolled-plate waviness: soft dents a few centimetres across
        hw = noise(mapping(Pn, sc=(7.0, 7.0, 7.0)), 1.0, 3.0, 0.55) * 0.7 + noise(mapping(Pn, sc=(2.6, 2.6, 2.6)), 1.0, 2.0, 0.5) * 0.3
        wn = _new('ShaderNodeBump')
        _feed(wn.inputs['Strength'], s['wave'])
        _feed(wn.inputs['Distance'], 0.02)
        _feed(wn.inputs['Height'], hw)
        nrm = C(wn.outputs['Normal'])
    if s['bump'] > 0:
        h = noise(mapping(Pn, sc=(s['bscale'],) * 3), 1.0, 2.0, 0.5) * 0.6 + noise(mapping(Pn, sc=(s['bscale'] * 0.2,) * 3), 1.0, 3.0, 0.5) * 0.4
        if brick_fac is not None:
            h = h * 0.4 + brick_fac * 0.9
        bn = _new('ShaderNodeBump')
        _feed(bn.inputs['Strength'], s['bump'])
        _feed(bn.inputs['Distance'], 0.003)
        _feed(bn.inputs['Height'], h)
        if nrm is not None:
            _cur.links.new(nrm.sock, bn.inputs['Normal'])
        nrm = C(bn.outputs['Normal'])
    bv = _new('ShaderNodeBevel', samples=8)
    _feed(bv.inputs['Radius'], s['bevel'])
    if nrm is not None:
        _cur.links.new(nrm.sock, bv.inputs['Normal'])
    Nb = C(bv.outputs['Normal'])
    nbx, nby, nbz = xyz(Nb)
    # edge strength: how far the bevelled normal leaves the surface normal
    edge = clamp01((1.0 - dot(Nb, Ng)) * 3.0)

    # ---- base colour
    if brick_col is not None:
        col = brick_col
    elif s['camo']:
        t_l, t_m, t_d = s['camo']
        cv = comb(X, Z, Y * 0.4)
        cv = mapping(cv, loc=(seed * 3.1, seed * 1.7, seed * 2.3))
        n1 = noise(mapping(cv, sc=(s['camo_scale'],) * 3), 1.0, 4.0, 0.55, 0.5)
        n2 = noise(mapping(cv, sc=(s['camo_scale'] * 3.1,) * 3), 1.0, 2.0, 0.5)
        t = n1 + (n2 - 0.5) * 0.3
        col = ramp(t, [(0.0, (t_l,) * 3), (0.47, (t_m,) * 3), (0.545, (t_d,) * 3)], const=True)
    else:
        col = C(None)
        b = tuple(s['base'])
        if s['split']:
            z0, w, amp = s['split']
            wn = noise(mapping(Pn, sc=(0.55, 0.55, 0.55)), 1.0, 3.0, 0.5)
            fac = mapr(Z + (wn - 0.5) * amp, z0 - w, z0 + w)
            vn = noise(mapping(Pn, sc=(5.0, 5.0, 5.0)), 1.0, 3.0, 0.55)
            col = mixc(fac, b, s['base2'])
            col = mulc(col, vn * 0.3 + 0.85)
        elif s['base2'] is not None and s['vary'] > 0:
            vs = s['vscale']
            vn = noise(mapping(Pn, sc=vs), 1.0, s['vdetail'], 0.55, 0.0)
            vn2 = noise(mapping(Pn, sc=tuple(v * 4.3 for v in vs)), 1.0, 2.0, 0.5)
            fac = clamp01((vn * 0.65 + vn2 * 0.35 - 0.5) * 2.4 * s['vary'] + 0.5)
            col = mixc(fac, b, s['base2'])
        else:
            col = mixc(0.0, b, b)
    # large-scale fade and fine mottling
    fade = noise(mapping(Pn, sc=(0.9, 0.9, 0.9)), 1.0, 2.0, 0.5) * (0.2 if s['camo'] else 0.28) + (0.9 if s['camo'] else 0.86)
    mott = noise(mapping(Pn, sc=(38, 38, 38)), 1.0, 3.0, 0.6) * s['fine'] * 2.0 + (1.0 - s['fine'])
    col = mulc(col, fade * mott)
    pmask = _const(s['paint'])

    # ---- general grime: darker toward the ground, streaky
    if s['grime'] > 0:
        gh0, gh1 = s['grime_h']
        low = 1.0 - mapr(Z, gh0, gh1)
        gn = noise(mapping(Pn, sc=(6, 6, 2.0)), 1.0, 4.0, 0.6, 0.2)
        gk = clamp01(low * (0.55 + gn * 0.9)) * s['grime']
        col = mulc(col, 1.0 - gk * 0.55)
        pmask = pmask * (1.0 - gk * 0.25)
    # ---- streaks of oil and rust (vertical)
    if s['oil'] > 0 or s['rust'] > 0:
        st = noise(mapping(Pn, sc=(10, 10, 1.5)), 1.0, 3.0, 0.62, 0.15)
        st2 = noise(mapping(Pn, sc=(17, 17, 2.4), loc=(4, 4, 4)), 1.0, 2.0, 0.55)
        if s['oil'] > 0:
            o = mapr(st, 0.52, 0.72) * s['oil']
            col = mixc(o * 0.8, col, (0.016, 0.013, 0.011))
        if s['rust'] > 0:
            r = mapr(st2 * 0.7 + edge * 0.6, 0.55, 0.95) * s['rust']
            col = mixc(r * 0.85, col, (0.25, 0.10, 0.045))
            pmask = pmask * (1.0 - r * 0.5)
    # ---- paint chips on edges
    if s['chip'] > 0:
        cn = noise(mapping(Pn, sc=(60, 60, 60)), 1.0, 2.0, 0.6)
        cn2 = noise(mapping(Pn, sc=(9, 9, 9), loc=(7, 7, 7)), 1.0, 2.0, 0.5)
        chip = mapr(edge * 1.1 + cn * 0.55 + cn2 * 0.35, 1.0 - 0.55 * s['chip'], 1.12 - 0.5 * s['chip'], 0.0, 1.0) * mapr(cn, 0.35, 0.55)
        ccol = mixc(mapr(cn2 + edge, 0.9, 1.5), s['chip_col'], s['chip_steel'])
        col = mixc(chip, col, ccol)
        pmask = pmask * (1.0 - chip)
    # ---- dust on upward faces
    if s['dust'] > 0:
        up = mapr(nbz, 0.15, 0.85)
        dn = noise(mapping(Pn, sc=(14, 14, 14)), 1.0, 3.0, 0.55)
        d = clamp01(up * (0.35 + dn * 0.9) * s['dust'] + mapr(dn, 0.62, 0.9) * 0.12 * s['dust'])
        col = mixc(d * 0.8, col, s['dust_col'])
        pmask = pmask * (1.0 - d * 0.55)
    # ---- dried mud splashed up the lower parts
    if s['mud'] > 0:
        h0, h1 = s['mud_h']
        hf = 1.0 - mapr(Z, h0, h1)
        mn = noise(mapping(Pn, sc=(11, 11, 11)), 1.0, 5.0, 0.62, 0.3)
        mn2 = noise(mapping(Pn, sc=(46, 46, 46)), 1.0, 2.0, 0.5)
        m = mapr(hf * 1.15 + (mn - 0.5) * 0.95 + edge * 0.15, 0.5, 0.66) * s['mud']
        mcol = mixc(mapr(mn2, 0.35, 0.7), s['mud_col'], (s['mud_col'][0] * 1.8, s['mud_col'][1] * 1.75, s['mud_col'][2] * 1.6))
        col = mixc(m, col, mcol)
        pmask = pmask * (1.0 - m)
    # ---- fire damage
    if s['burn'] > 0:
        bn = noise(mapping(Pn, sc=(5, 5, 5)), 1.0, 5.0, 0.6, 0.4)
        bn2 = noise(mapping(Pn, sc=(28, 28, 28)), 1.0, 3.0, 0.55)
        black = ramp(bn2, [(0.0, (0.010, 0.009, 0.008)), (0.45, (0.030, 0.026, 0.022)), (0.8, (0.060, 0.050, 0.042)), (1.0, (0.10, 0.092, 0.082))])
        rustb = ramp(bn, [(0.0, (0.11, 0.045, 0.02)), (0.6, (0.22, 0.095, 0.04)), (1.0, (0.30, 0.13, 0.05))])
        rf = mapr(bn * 0.75 + edge * 0.5 + bn2 * 0.15, 0.48, 0.82)
        burnt = mixc(rf * 0.85, black, rustb)
        if s['paint_left'] > 0:
            left = mapr(bn + (noise(mapping(Pn, sc=(2.5,) * 3), 1.0, 2.0, 0.5) - 0.5) * 0.8, 0.62 - 0.4 * s['paint_left'], 0.7 - 0.4 * s['paint_left'])
        else:
            left = _const(0.0)
        scorched = mulc(col, 0.22)
        res = mixc(left, burnt, scorched)
        col = mixc(s['burn'], col, res)
        pmask = pmask * (1.0 - s['burn'] + s['burn'] * left * s['paint_left'])
    if s['soot'] > 0:
        sn = noise(mapping(Pn, sc=(4, 4, 4)), 1.0, 4.0, 0.6, 0.3)
        sm = mapr(sn + (1.0 - mapr(Z, 0.0, 3.0)) * 0.0, 0.35, 0.8) * s['soot']
        col = mixc(sm * 0.85, col, (0.01, 0.009, 0.008))
        pmask = pmask * (1.0 - sm)
    if s['edge_light'] > 0:
        col = mixc(edge * s['edge_light'], col, (0.42, 0.40, 0.38))

    # ---- AO inputs
    ao1 = _new('ShaderNodeAmbientOcclusion', samples=2, inside=False, only_local=False)
    _feed(ao1.inputs['Distance'], s['ao_s'])
    _cur.links.new(Nb.sock, ao1.inputs['Normal'])
    ao2 = _new('ShaderNodeAmbientOcclusion', samples=2, inside=False, only_local=False)
    _feed(ao2.inputs['Distance'], s['ao_l'])
    _cur.links.new(Nb.sock, ao2.inputs['Normal'])

    ao3 = _new('ShaderNodeAmbientOcclusion', samples=2, inside=False, only_local=False)
    _feed(ao3.inputs['Distance'], 0.022)
    _cur.links.new(Nb.sock, ao3.inputs['Normal'])

    # ---- outputs by mode
    mode = _new('ShaderNodeValue')
    mode.name = 'MODE'
    mode.label = 'MODE'
    mv = V(mode.outputs[0])
    enc = comb(nbx * 0.5 + 0.5, nbz * 0.5 + 0.5, nby * -0.5 + 0.5)
    mk = comb(pmask, pmask, pmask)
    aoc = comb(V(ao1.outputs['AO']), V(ao2.outputs['AO']), V(ao3.outputs['AO']))
    sel = mixc(gt(mv, 0.5), col, enc)
    sel = mixc(gt(mv, 1.5), sel, mk)
    sel = mixc(gt(mv, 2.5), sel, aoc)
    em = _new('ShaderNodeEmission')
    _cur.links.new(sel.sock, em.inputs['Color'])
    out = _new('ShaderNodeOutputMaterial')
    _cur.links.new(em.outputs[0], out.inputs['Surface'])


def _const(x):
    """A constant scalar as a socket (so it can take part in node maths)."""
    n = _new('ShaderNodeValue')
    n.outputs[0].default_value = float(x)
    return V(n.outputs[0])


# ------------------------------------------------------------------------------------------------ the material list

# camo tones (linear): light / mid / dark greys. sRGB ~ 182 / 158 / 122
TONES = (0.300, 0.232, 0.178)
PAINTS = {
    'warden': dict(camo=TONES, camo_scale=1.15, camo_seed=1.0, seed=1.3),
    'bulwark': dict(camo=(0.305, 0.236, 0.18), camo_scale=0.95, camo_seed=2.0, seed=4.1),
    'lynx': dict(camo=(0.31, 0.24, 0.185), camo_scale=1.5, camo_seed=3.0, seed=7.7),
    'debris': dict(camo=TONES, camo_scale=1.6, camo_seed=5.0, seed=2.2),
}


def spec_for(key):
    parts = key.split(':')
    kind = parts[0]
    if kind == 'paint':
        var = parts[1] if len(parts) > 1 else 'warden'
        part = parts[2] if len(parts) > 2 else 'hull'
        d = dict(PAINTS[var])
        d.update(paint=1.0, chip=0.6, oil=0.6, rust=0.45, dust=0.4, bump=0.12, wave=0.35, bevel=0.012, fine=0.07, grime=0.55)
        if part == 'hull':
            d.update(mud=1.0, mud_h=(0.35, 1.45), dust=0.6, grime=0.95, grime_h=(0.1, 1.5))
        elif part == 'low':
            d.update(mud=1.0, mud_h=(0.28, 1.15), dust=0.65, grime=1.0, grime_h=(0.2, 1.6))
        elif part == 'turret':
            d.update(mud=0.0, dust=0.85, chip=0.5, grime=0.3, grime_h=(0.0, 1.2))
        elif part == 'gun':
            # gun tubes, sleeves and mantlets: plain paint, no camo, slight wear
            d.update(camo=None, base=(0.215, 0.215, 0.215), base2=(0.165, 0.165, 0.165), vary=0.6, vscale=(2.5, 28, 28), mud=0.0, dust=0.45, chip=0.35, grime=0.2, grime_h=(0.0, 3.5))
        elif part == 'cast':
            # cast armour: unpainted-looking dark grey, coarse casting texture, edges worn bright
            d.update(camo=None, base=(0.19, 0.19, 0.19), base2=(0.15, 0.15, 0.15), vary=0.8, vscale=(7, 7, 7), mud=0.0, dust=0.5, chip=0.5, grime=0.3, grime_h=(0.0, 3.0),
                     bump=0.55, bscale=26.0, wave=0.9, edge_light=0.35, rust=0.12, oil=0.25)
        elif part == 'plain':
            d.update(mud=0.0)
        return d
    if kind == 'burnt':
        var = parts[1] if len(parts) > 1 else 'warden'
        d = dict(PAINTS[var])
        d.update(paint=1.0, burn=0.97, paint_left=0.05, bump=0.18, chip=0.8, rust=0.7, mud=0.55, mud_h=(0.2, 1.0), dust=0.35, bevel=0.012, oil=0.4, edge_light=0.15, soot=0.35)
        return d
    return SPECS[kind]


SPECS = {
    # dark gunmetal / bare steel
    'steel': dict(base=(0.085, 0.087, 0.092), base2=(0.17, 0.16, 0.15), vary=0.9, vscale=(14, 14, 14), bump=0.1, edge_light=0.9, rust=0.25, oil=0.45, dust=0.25, bevel=0.008, fine=0.12),
    'steel_dark': dict(base=(0.045, 0.046, 0.05), base2=(0.09, 0.085, 0.08), vary=0.8, vscale=(10, 10, 10), bump=0.08, edge_light=0.8, rust=0.15, oil=0.5, dust=0.2, bevel=0.008),
    'steel_bright': dict(base=(0.30, 0.30, 0.31), base2=(0.15, 0.15, 0.16), vary=0.6, vscale=(22, 2, 22), bump=0.06, edge_light=0.3, rust=0.15, oil=0.3, dust=0.15, bevel=0.006),
    'gun': dict(base=(0.055, 0.056, 0.06), base2=(0.12, 0.11, 0.105), vary=0.7, vscale=(2.2, 30, 30), bump=0.08, edge_light=0.5, rust=0.3, oil=0.9, dust=0.3, bevel=0.006, fine=0.1),
    'steel_gear': dict(base=(0.11, 0.112, 0.117), base2=(0.20, 0.19, 0.18), vary=0.9, vscale=(14, 14, 14), bump=0.1, edge_light=0.8, rust=0.3, oil=0.5, dust=0.7, mud=0.9, mud_h=(0.05, 0.85), bevel=0.008, fine=0.12),
    # track steel: dark brown steel with rust and mud
    'track': dict(base=(0.06, 0.05, 0.045), base2=(0.16, 0.10, 0.065), vary=0.9, vscale=(12, 12, 12), bump=0.15, edge_light=1.0, rust=0.7, oil=0.3, dust=0.5, mud=0.95, mud_h=(0.1, 0.8), bevel=0.006, fine=0.12),
    'rubber': dict(base=(0.018, 0.018, 0.02), base2=(0.04, 0.038, 0.036), vary=0.7, vscale=(30, 30, 30), bump=0.18, bscale=140.0, dust=0.65, dust_col=(0.20, 0.17, 0.13), mud=0.9, mud_h=(0.05, 0.6), bevel=0.008, fine=0.15),
    'rubber_new': dict(base=(0.02, 0.02, 0.022), bump=0.1, dust=0.3, dust_col=(0.2, 0.17, 0.13), bevel=0.006),
    'optic': dict(base=(0.006, 0.014, 0.016), base2=(0.07, 0.12, 0.12), vary=0.9, vscale=(2, 2, 2), bump=0.0, bevel=0.004, dust=0.25, dust_col=(0.2, 0.18, 0.15), edge_light=0.0, ao_s=0.03),
    'glass': dict(base=(0.02, 0.035, 0.04), base2=(0.12, 0.17, 0.18), vary=0.8, vscale=(2, 2, 2), bevel=0.004, dust=0.3, dust_col=(0.2, 0.18, 0.15)),
    'cloth': dict(base=(0.085, 0.092, 0.040), base2=(0.04, 0.045, 0.02), vary=1.0, vscale=(9, 9, 9), vdetail=4, bump=0.35, bscale=160.0, dust=0.25, dust_col=(0.18, 0.16, 0.11), oil=0.3, bevel=0.01, fine=0.12, ao_s=0.04),
    'cloth_dark': dict(base=(0.03, 0.035, 0.018), base2=(0.015, 0.018, 0.01), vary=1.0, vscale=(11, 11, 11), vdetail=4, bump=0.3, bscale=150.0, dust=0.2, bevel=0.01, fine=0.1),
    'strap': dict(base=(0.05, 0.048, 0.035), base2=(0.025, 0.025, 0.02), vary=0.8, vscale=(30, 30, 30), bump=0.2, bscale=190.0, dust=0.4, dust_col=(0.2, 0.17, 0.12), bevel=0.006),
    'skin': dict(base=(0.30, 0.17, 0.11), base2=(0.20, 0.10, 0.07), vary=0.7, vscale=(12, 12, 12), bump=0.12, bscale=240.0, dust=0.15, dust_col=(0.25, 0.2, 0.15), bevel=0.01, fine=0.05),
    'goggle': dict(base=(0.02, 0.02, 0.022), base2=(0.12, 0.2, 0.22), vary=0.7, vscale=(3, 3, 3), bevel=0.004),
    'leather': dict(base=(0.045, 0.028, 0.018), base2=(0.09, 0.06, 0.04), vary=0.9, vscale=(18, 18, 18), bump=0.3, bscale=170.0, dust=0.35, dust_col=(0.22, 0.17, 0.12), mud=0.6, mud_h=(0.0, 0.14), bevel=0.01),
    'flesh': dict(base=(0.095, 0.004, 0.005), base2=(0.30, 0.018, 0.016), vary=1.0, vscale=(22, 22, 22), vdetail=4, bump=0.6, bscale=70.0, bevel=0.015, fine=0.15, ao_s=0.04, ao_l=0.3, edge_light=0.0),
    'flesh_pale': dict(base=(0.34, 0.12, 0.09), base2=(0.55, 0.30, 0.22), vary=1.0, vscale=(26, 26, 26), vdetail=3, bump=0.4, bscale=90.0, bevel=0.01, fine=0.1),
    'bone': dict(base=(0.62, 0.55, 0.42), base2=(0.35, 0.22, 0.14), vary=0.6, vscale=(20, 20, 20), bump=0.2, bevel=0.01),
    'brass': dict(base=(0.34, 0.18, 0.055), base2=(0.17, 0.09, 0.035), vary=0.8, vscale=(16, 16, 16), bump=0.08, edge_light=0.5, oil=0.2, dust=0.2, bevel=0.005),
    'copper': dict(base=(0.40, 0.17, 0.06), base2=(0.22, 0.10, 0.04), vary=0.8, vscale=(10, 10, 10), bump=0.08, edge_light=0.4, bevel=0.005, dust=0.2),
    'wood': dict(base=(0.17, 0.09, 0.045), base2=(0.08, 0.04, 0.02), vary=1.0, vscale=(2, 30, 30), vdetail=4, bump=0.3, bscale=50.0, dust=0.3, dust_col=(0.22, 0.17, 0.12), bevel=0.01, oil=0.2),
    'cable': dict(base=(0.055, 0.055, 0.058), base2=(0.14, 0.13, 0.12), vary=0.8, vscale=(60, 60, 60), bump=0.5, bscale=300.0, dust=0.5, dust_col=(0.2, 0.17, 0.12), mud=0.7, mud_h=(0.9, 1.4), rust=0.3, bevel=0.004),
    'rope': dict(base=(0.12, 0.105, 0.065), base2=(0.05, 0.045, 0.03), vary=1.0, vscale=(70, 70, 70), bump=0.5, bscale=260.0, dust=0.4, bevel=0.004),
    'canvas': dict(base=(0.11, 0.115, 0.05), base2=(0.05, 0.055, 0.025), vary=1.0, vscale=(6, 6, 6), vdetail=4, bump=0.25, bscale=120.0, dust=0.5, dust_col=(0.2, 0.18, 0.13), oil=0.2, bevel=0.01, ao_s=0.06),
    'olive': dict(base=(0.062, 0.07, 0.030), base2=(0.03, 0.035, 0.015), vary=0.8, vscale=(8, 8, 8), bump=0.1, edge_light=0.35, chip=0.5, chip_col=(0.18, 0.08, 0.04), chip_steel=(0.30, 0.28, 0.26), rust=0.2, oil=0.3, dust=0.2, bevel=0.007, fine=0.1),
    'olive_light': dict(base=(0.13, 0.14, 0.06), base2=(0.07, 0.08, 0.035), vary=0.8, vscale=(8, 8, 8), bump=0.1, edge_light=0.35, chip=0.4, rust=0.15, oil=0.25, dust=0.2, bevel=0.007),
    'yellow': dict(base=(0.60, 0.42, 0.04), base2=(0.35, 0.24, 0.03), vary=0.6, vscale=(8, 8, 8), bump=0.08, chip=0.3, oil=0.2, dust=0.2, bevel=0.007),
    'dark_bomb': dict(base=(0.026, 0.028, 0.030), base2=(0.06, 0.06, 0.06), vary=0.7, vscale=(8, 8, 8), bump=0.1, edge_light=0.5, chip=0.4, rust=0.2, oil=0.5, dust=0.15, bevel=0.007),
    'bomb_green': dict(base=(0.055, 0.062, 0.038), base2=(0.03, 0.035, 0.02), vary=0.8, vscale=(8, 8, 8), bump=0.1, edge_light=0.4, chip=0.5, rust=0.3, oil=0.4, dust=0.2, bevel=0.007),
    'white': dict(base=(0.55, 0.55, 0.53), base2=(0.3, 0.29, 0.27), vary=0.6, vscale=(10, 10, 10), bump=0.05, chip=0.3, oil=0.4, dust=0.3, bevel=0.006),
    'red': dict(base=(0.40, 0.025, 0.02), base2=(0.2, 0.012, 0.01), vary=0.6, vscale=(9, 9, 9), bump=0.08, chip=0.4, oil=0.3, dust=0.25, bevel=0.006),
    'charred': dict(base=(0.018, 0.016, 0.015), base2=(0.07, 0.04, 0.025), vary=1.0, vscale=(7, 7, 7), vdetail=4, bump=0.3, edge_light=0.35, rust=0.22, soot=0.5, bevel=0.01, dust=0.3, mud=0.5, mud_h=(0.1, 0.8)),
    'charred_rubber': dict(base=(0.008, 0.008, 0.009), base2=(0.025, 0.022, 0.02), vary=0.9, vscale=(18, 18, 18), bump=0.3, dust=0.5, dust_col=(0.12, 0.1, 0.08), soot=0.3, bevel=0.01),
    # jet two-tone greys
    'jet_a': dict(base=(0.19, 0.205, 0.215), base2=(0.12, 0.13, 0.14), vary=0.8, vscale=(4, 4, 4), bump=0.05, edge_light=0.4, chip=0.5, oil=0.7, dust=0.2, bevel=0.01, fine=0.06),
    'jet_two': dict(base=(0.20, 0.215, 0.225), base2=(0.075, 0.082, 0.09), split=(0.22, 0.05, 1.1), bump=0.05, edge_light=0.4, chip=0.5, oil=0.7, dust=0.2, bevel=0.01, fine=0.06),
    'jet_b': dict(base=(0.085, 0.092, 0.10), base2=(0.05, 0.055, 0.06), vary=0.8, vscale=(4, 4, 4), bump=0.05, edge_light=0.4, chip=0.5, oil=0.7, dust=0.2, bevel=0.01, fine=0.06),
    'jet_dark': dict(base=(0.03, 0.032, 0.036), base2=(0.07, 0.065, 0.06), vary=0.8, vscale=(5, 5, 5), bump=0.05, oil=0.9, soot=0.3, bevel=0.01),
    'jet_canopy': dict(base=(0.02, 0.05, 0.055), base2=(0.15, 0.22, 0.22), vary=0.8, vscale=(1.2, 1.2, 1.2), bevel=0.005),
    'jet_metal': dict(base=(0.16, 0.16, 0.17), base2=(0.08, 0.08, 0.08), vary=0.8, vscale=(10, 10, 10), bump=0.05, edge_light=0.5, soot=0.4, bevel=0.008),
    'chute': dict(base=(0.10, 0.115, 0.05), base2=(0.05, 0.06, 0.03), vary=0.9, vscale=(5, 5, 5), vdetail=4, bump=0.2, bscale=100.0, dust=0.35, dust_col=(0.2, 0.18, 0.13), oil=0.3, bevel=0.008, ao_s=0.08, ao_l=0.9),

    # ---------------------------------------------------------------- battlefield props
    'sandbag': dict(base=(0.34, 0.27, 0.16), base2=(0.19, 0.145, 0.085), vary=1.0, vscale=(16, 16, 16), vdetail=4, bump=0.6, bscale=110.0, wave=0.5, dust=0.5, dust_col=(0.36, 0.30, 0.22), mud=0.7, mud_h=(0.0, 0.5), grime=0.5, grime_h=(0.0, 0.9), bevel=0.012, fine=0.1, ao_s=0.04),
    'sandbag_dark': dict(base=(0.22, 0.19, 0.12), base2=(0.12, 0.10, 0.06), vary=1.0, vscale=(16, 16, 16), vdetail=4, bump=0.6, bscale=110.0, wave=0.5, dust=0.45, dust_col=(0.3, 0.26, 0.2), mud=0.8, mud_h=(0.0, 0.5), grime=0.5, grime_h=(0.0, 0.9), bevel=0.012, fine=0.1, ao_s=0.04),
    'wood_grey': dict(base=(0.19, 0.16, 0.125), base2=(0.07, 0.055, 0.042), vary=1.0, vscale=(1.6, 28, 28), vdetail=5, bump=0.5, bscale=60.0, wave=0.3, dust=0.5, dust_col=(0.26, 0.23, 0.19), grime=0.5, grime_h=(0.0, 2.0), oil=0.3, bevel=0.01, fine=0.1),
    'wood_dark': dict(base=(0.09, 0.065, 0.04), base2=(0.035, 0.026, 0.018), vary=1.0, vscale=(1.6, 28, 28), vdetail=5, bump=0.5, bscale=60.0, wave=0.3, dust=0.4, dust_col=(0.22, 0.19, 0.15), grime=0.6, grime_h=(0.0, 2.0), oil=0.4, bevel=0.01, fine=0.1),
    'wood_cut': dict(base=(0.45, 0.30, 0.16), base2=(0.30, 0.19, 0.09), vary=1.0, vscale=(14, 14, 14), vdetail=3, bump=0.3, bscale=60.0, dust=0.3, dust_col=(0.3, 0.26, 0.2), bevel=0.008),
    'wood_ring': dict(base=(0.30, 0.19, 0.09), base2=(0.21, 0.125, 0.055), vary=1.0, vscale=(10, 10, 10), vdetail=3, bump=0.3, bscale=60.0, dust=0.2, dust_col=(0.3, 0.26, 0.2), bevel=0.006),
    'bark_burnt': dict(base=(0.014, 0.012, 0.011), base2=(0.07, 0.04, 0.025), vary=1.0, vscale=(26, 26, 3.5), vdetail=5, bump=0.8, bscale=50.0, soot=0.25, dust=0.15, dust_col=(0.18, 0.15, 0.12), bevel=0.02, ao_s=0.08, fine=0.15),
    'bark': dict(base=(0.055, 0.04, 0.03), base2=(0.14, 0.11, 0.085), vary=1.0, vscale=(22, 22, 3.0), vdetail=5, bump=0.8, bscale=45.0, dust=0.9, dust_col=(0.74, 0.77, 0.80), grime=0.3, grime_h=(0.0, 4.0), bevel=0.02, ao_s=0.08, fine=0.12),
    'drum_green': dict(base=(0.045, 0.075, 0.035), base2=(0.025, 0.04, 0.02), vary=0.8, vscale=(8, 8, 8), bump=0.2, wave=0.7, edge_light=0.6, chip=0.8, chip_col=(0.14, 0.05, 0.02), rust=0.8, oil=0.7, dust=0.45, grime=0.8, grime_h=(0.0, 1.0), bevel=0.01, fine=0.1),
    'drum_blue': dict(base=(0.025, 0.055, 0.13), base2=(0.015, 0.03, 0.08), vary=0.8, vscale=(8, 8, 8), bump=0.2, wave=0.7, edge_light=0.6, chip=0.8, chip_col=(0.14, 0.05, 0.02), rust=0.8, oil=0.7, dust=0.45, grime=0.8, grime_h=(0.0, 1.0), bevel=0.01, fine=0.1),
    'drum_rust': dict(base=(0.17, 0.065, 0.028), base2=(0.08, 0.03, 0.014), vary=1.0, vscale=(6, 6, 6), vdetail=4, bump=0.3, wave=0.7, edge_light=0.5, chip=0.5, rust=1.0, oil=0.6, dust=0.5, grime=0.7, grime_h=(0.0, 1.0), bevel=0.01, fine=0.12),
    'crate_olive': dict(base=(0.062, 0.072, 0.034), base2=(0.034, 0.04, 0.019), vary=0.9, vscale=(2.2, 22, 22), vdetail=4, bump=0.35, bscale=60.0, wave=0.2, edge_light=0.5, chip=0.8, chip_col=(0.15, 0.10, 0.06), chip_steel=(0.2, 0.15, 0.1), rust=0.1, oil=0.4, dust=0.5, dust_col=(0.3, 0.27, 0.2), grime=0.7, grime_h=(0.0, 1.2), bevel=0.012, fine=0.1),
    'stencil': dict(base=(0.5, 0.5, 0.45), base2=(0.3, 0.3, 0.27), vary=0.6, vscale=(20, 20, 20), chip=0.7, dust=0.4, bevel=0.003),
    'steel_rust': dict(base=(0.062, 0.05, 0.043), base2=(0.17, 0.078, 0.036), vary=1.0, vscale=(9, 9, 9), vdetail=4, bump=0.35, bscale=70.0, edge_light=0.45, rust=0.5, oil=0.35, dust=0.45, dust_col=(0.25, 0.2, 0.15), mud=0.6, mud_h=(0.0, 0.5), grime=0.5, grime_h=(0.0, 1.6), bevel=0.007, fine=0.12),
    'steel_weather': dict(base=(0.05, 0.048, 0.046), base2=(0.115, 0.07, 0.045), vary=1.0, vscale=(7, 7, 7), vdetail=4, bump=0.3, bscale=70.0, edge_light=0.6, rust=0.6, oil=0.3, dust=0.4, dust_col=(0.22, 0.18, 0.14), mud=0.5, mud_h=(0.0, 0.4), grime=0.5, grime_h=(0.0, 1.4), bevel=0.007, fine=0.12),
    'steel_weather_flat': dict(base=(0.05, 0.048, 0.046), base2=(0.115, 0.07, 0.045), vary=1.0, vscale=(7, 7, 7), vdetail=4, bump=0.3, bscale=70.0, edge_light=0.6, rust=0.6, oil=0.3, dust=0.4, dust_col=(0.22, 0.18, 0.14), mud=0.5, mud_h=(0.0, 0.4), grime=0.5, grime_h=(0.0, 1.4), bevel=0.0, fine=0.12),
    'bark_dry': dict(base=(0.05, 0.038, 0.028), base2=(0.15, 0.115, 0.085), vary=1.0, vscale=(22, 22, 3.0), vdetail=5, bump=0.8, bscale=45.0, dust=0.3, dust_col=(0.2, 0.17, 0.13), grime=0.4, grime_h=(0.0, 1.0), bevel=0.02, ao_s=0.08, fine=0.12),
    'wire': dict(base=(0.10, 0.085, 0.075), base2=(0.20, 0.10, 0.05), vary=1.0, vscale=(40, 40, 40), bump=0.1, rust=0.7, dust=0.4, bevel=0.003, edge_light=0.2),
    'straw': dict(base=(0.48, 0.36, 0.14), base2=(0.22, 0.15, 0.055), vary=1.0, vscale=(34, 34, 34), vdetail=5, bump=0.7, bscale=90.0, wave=0.5, dust=0.4, dust_col=(0.4, 0.33, 0.2), grime=0.6, grime_h=(0.0, 1.2), bevel=0.015, fine=0.2, ao_s=0.05),
    'sandstone': dict(base=(0.42, 0.27, 0.15), base2=(0.22, 0.12, 0.06), vary=1.0, vscale=(1.4, 1.4, 9.0), vdetail=5, bump=0.8, bscale=40.0, wave=0.7, dust=0.7, dust_col=(0.5, 0.38, 0.24), grime=0.4, grime_h=(0.0, 2.5), chip=0.0, bevel=0.025, fine=0.15, ao_s=0.1, ao_l=0.8),
    'basalt': dict(base=(0.022, 0.024, 0.028), base2=(0.075, 0.075, 0.08), vary=1.0, vscale=(7, 7, 1.4), vdetail=5, bump=0.8, bscale=35.0, wave=0.6, dust=0.25, dust_col=(0.12, 0.12, 0.12), grime=0.3, grime_h=(0.0, 5.0), bevel=0.02, fine=0.15, ao_s=0.1, ao_l=0.8),
    'brick': dict(base=(0.30, 0.085, 0.05), base2=(0.17, 0.045, 0.028), brick=2.3, mortar=(0.30, 0.28, 0.25), bump=0.5, bscale=45.0, dust=0.4, dust_col=(0.28, 0.25, 0.2), grime=0.7, grime_h=(0.0, 6.0), soot=0.35, rust=0.1, bevel=0.01, fine=0.12, ao_s=0.04),
    'brick_big': dict(base=(0.30, 0.085, 0.05), base2=(0.17, 0.045, 0.028), brick=1.7, mortar=(0.30, 0.28, 0.25), bump=0.5, bscale=45.0, dust=0.4, dust_col=(0.28, 0.25, 0.2), grime=0.7, grime_h=(0.0, 8.0), soot=0.4, bevel=0.012, fine=0.12, ao_s=0.06),
    'concrete': dict(base=(0.33, 0.32, 0.30), base2=(0.17, 0.165, 0.155), vary=1.0, vscale=(3.5, 3.5, 3.5), vdetail=5, bump=0.5, bscale=50.0, wave=0.6, dust=0.5, dust_col=(0.35, 0.33, 0.28), grime=0.6, grime_h=(0.0, 3.0), soot=0.2, rust=0.1, bevel=0.015, fine=0.14, ao_s=0.06),
    'plaster': dict(base=(0.42, 0.38, 0.30), base2=(0.25, 0.22, 0.17), vary=1.0, vscale=(2.5, 2.5, 2.5), vdetail=5, bump=0.35, bscale=40.0, wave=0.5, dust=0.4, grime=0.8, grime_h=(0.0, 8.0), soot=0.45, bevel=0.012, fine=0.12),
    'pine': dict(base=(0.014, 0.04, 0.02), base2=(0.006, 0.018, 0.01), vary=1.0, vscale=(14, 14, 14), vdetail=5, bump=0.9, bscale=60.0, wave=0.6, dust=0.55, dust_col=(0.78, 0.81, 0.85), bevel=0.02, ao_s=0.15, ao_l=0.9, fine=0.15),
    'snow': dict(base=(0.72, 0.75, 0.80), base2=(0.45, 0.50, 0.58), vary=1.0, vscale=(5, 5, 5), vdetail=4, bump=0.5, bscale=30.0, wave=0.6, bevel=0.02, ao_s=0.1, ao_l=0.7, fine=0.08),
    'wreck_green': dict(base=(0.017, 0.019, 0.013), base2=(0.075, 0.05, 0.03), vary=1.0, vscale=(5, 5, 5), vdetail=5, bump=0.4, wave=0.7, edge_light=0.4, rust=0.35, soot=0.75, chip=0.0, dust=0.4, mud=0.7, mud_h=(0.0, 0.8), grime=0.6, grime_h=(0.0, 3.0), bevel=0.012, fine=0.14),
    'wreck_sand': dict(base=(0.03, 0.026, 0.021), base2=(0.17, 0.115, 0.065), vary=1.0, vscale=(3.5, 3.5, 3.5), vdetail=5, bump=0.4, wave=0.7, edge_light=0.4, rust=0.4, soot=1.0, dust=0.5, dust_col=(0.4, 0.31, 0.2), mud=0.5, mud_h=(0.0, 0.7), grime=0.5, grime_h=(0.0, 3.0), bevel=0.012, fine=0.14),
    'wreck_blue': dict(base=(0.015, 0.017, 0.023), base2=(0.04, 0.07, 0.14), vary=1.0, vscale=(4, 4, 4), vdetail=5, bump=0.4, wave=0.7, edge_light=0.4, rust=0.4, soot=0.7, dust=0.35, mud=0.5, mud_h=(0.0, 0.6), grime=0.5, grime_h=(0.0, 2.0), bevel=0.012, fine=0.14),
    'lamp_paint': dict(base=(0.035, 0.045, 0.042), base2=(0.07, 0.08, 0.075), vary=0.8, vscale=(3, 3, 3), bump=0.2, wave=0.4, edge_light=0.6, chip=0.9, chip_col=(0.14, 0.06, 0.03), rust=0.7, oil=0.6, dust=0.3, grime=0.6, grime_h=(0.0, 4.0), bevel=0.008, fine=0.1),
    'mast_red': dict(base=(0.34, 0.03, 0.02), base2=(0.2, 0.02, 0.012), vary=0.7, vscale=(6, 6, 6), bump=0.2, chip=0.9, chip_col=(0.14, 0.06, 0.03), rust=0.8, oil=0.4, dust=0.3, grime=0.5, grime_h=(0.0, 9.0), bevel=0.006, edge_light=0.4),
    'mast_white': dict(base=(0.5, 0.5, 0.48), base2=(0.3, 0.29, 0.27), vary=0.7, vscale=(6, 6, 6), bump=0.2, chip=0.9, chip_col=(0.14, 0.06, 0.03), rust=0.8, oil=0.5, dust=0.35, grime=0.6, grime_h=(0.0, 9.0), bevel=0.006, edge_light=0.3),
    'tarp_grey': dict(base=(0.12, 0.12, 0.11), base2=(0.05, 0.05, 0.045), vary=1.0, vscale=(6, 6, 6), vdetail=4, bump=0.3, bscale=100.0, dust=0.5, grime=0.7, grime_h=(0.0, 2.0), soot=0.3, bevel=0.01),
}
