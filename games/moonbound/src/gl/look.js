// An area's look: the moon, ambient, rim, fog, the void's sky, cliff colours,
// shadow direction and the grade. Hex colours are sRGB; everything the
// shaders get is linear.
export function srgb(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function hexToLinear(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => srgb(parseInt(h.slice(i, i + 2), 16) / 255));
}

// a list of hex colours -> one Float32Array of linear rgb triples (for uniform3fv)
export function srgbHex(list) {
  const out = new Float32Array(list.length * 3);
  list.forEach((h, i) => out.set(hexToLinear(h), i * 3));
  return out;
}

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function look(o) {
  return {
    key: norm(o.key),
    keyCol: o.keyCol,
    ambTop: o.ambTop,
    ambBot: o.ambBot,
    rim: o.rim,
    fog: o.fog,
    sky: srgbHex(o.sky),
    glowA: new Float32Array(o.glowA),
    glowB: new Float32Array(o.glowB),
    cliff: srgbHex(o.cliff),
    inlay: new Float32Array(o.inlay || [0, 0, 0, 0]),
    shear: o.shear || [0.3, 0.45],
    shadow: o.shadow ?? 0.4,
    exposure: o.exposure ?? 1,
    bloom: o.bloom ?? 1,
    bloomThreshold: o.bloomThreshold ?? 0.9,
    saturation: o.saturation ?? 1,
    contrast: o.contrast ?? 1,
    lift: new Float32Array(o.lift || [0, 0, 0]),
    gain: new Float32Array(o.gain || [1, 1, 1]),
    mist: new Float32Array(o.mist || [0, 0, 0, 0]),
  };
}

// blend two looks (area transitions, the eclipse): returns a new look
export function mixLook(a, b, t) {
  const m = (x, y) => (Array.isArray(x) || x instanceof Float32Array ? Array.from(x, (v, i) => v + (y[i] - v) * t) : x + (y - x) * t);
  const out = {};
  for (const k of Object.keys(a)) out[k] = m(a[k], b[k]);
  for (const k of ['sky', 'glowA', 'glowB', 'cliff', 'inlay', 'lift', 'gain', 'mist']) out[k] = new Float32Array(out[k]);
  out.key = norm(out.key);
  return out;
}
