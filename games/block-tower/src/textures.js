// Procedural surfaces for the toy blocks: solid wood, lacquered paint and
// printed letters. Wood is a *solid* texture worked out in the block's own
// space, like a real piece cut from a log: every block gets a log frame (a
// pith line running along its grain, a little off to one side and slightly
// tilted), and the growth rings are cylinders round that line. Long faces
// then show flowing grain and cathedral arches, the ends show ring arcs, and
// the grain carries on unbroken round every eased edge, which a per-face
// image cannot do. Rays, pores, fibres and dents come from cheap cell noise
// in the log's cylindrical coordinates and fade to their average as they
// shrink below a pixel, so nothing shimmers. The only image is the letter
// atlas: a signed distance field drawn once on a canvas, so the letters stay
// crisp at any size.
import * as THREE from 'three';

// Species, in sRGB as they look oiled. k: ring spacing (m), ring contrast,
// ray amount, pore amount. m: figure (mottle) amount, end-grain darkening,
// roughness, ray size. r: where in each ring the late wood starts, how much
// of the ring shows as a thin boundary line instead, pore size, and the
// strength of long colour streaks.
export const WOODS = {
  maple: {
    early: '#efd9ad', late: '#d8b27c', ray: '#d0a874', pore: '#b08b5c',
    k: [0.0022, 0.55, 0.3, 0.12], m: [0.07, 0.28, 0.5, 0.8], r: [0.7, 0.55, 0.8, 0.5],
  },
  beech: {
    early: '#e8bf98', late: '#d39e77', ray: '#a8674a', pore: '#b0825e',
    k: [0.0027, 0.5, 0.45, 0.1], m: [0.07, 0.3, 0.52, 1.0], r: [0.72, 0.45, 0.8, 0.45],
  },
  walnut: {
    early: '#6c4e3e', late: '#4f3629', ray: '#654838', pore: '#1f140e',
    k: [0.0032, 0.3, 0.1, 1.0], m: [0.15, 0.22, 0.46, 0.8], r: [0.35, 0.2, 1.3, 1.0],
  },
};
export const WOOD_TONES = ['maple', 'beech', 'walnut'];

// Toy lacquer: saturated, but real pigment, not screen colours.
export const PAINTS = {
  red: '#c3272a',
  orange: '#e06a1e',
  yellow: '#efb31c',
  green: '#2e9447',
  blue: '#2059ad',
  purple: '#6b3d98',
  pink: '#de6a92',
  teal: '#16939a',
};
export const PAINT_TONES = Object.keys(PAINTS);

// The letter set's extra shapes wear soft satin pastels.
export const PASTELS = {
  sky: '#92c0e2',
  mint: '#9ed4b2',
  butter: '#f0d27e',
  peach: '#f2ad8c',
  lilac: '#c2abdf',
  rose: '#eea8bb',
};
export const PASTEL_TONES = Object.keys(PASTELS);

// Printing inks for the letter faces.
export const INKS = {
  red: '#d22a33',
  blue: '#1d60c2',
  green: '#23924a',
  orange: '#ea7515',
  purple: '#7a45b0',
  teal: '#0d8f9a',
  pink: '#d8467e',
};
export const INK_TONES = Object.keys(INKS);

export const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');

// -------------------------------------------------------------- the atlas

const FONT = '"Arial Rounded MT Bold", "Nunito", "Varela Round", "Quicksand", "Helvetica Rounded", "Segoe UI Black", system-ui, sans-serif';

// All 36 glyphs in a 6 x 6 grid, as a signed distance field in one byte
// (0.5 on the outline, rising inside). `spread` is the distance in pixels
// that the byte range covers each way.
export function glyphAtlas({ cell = 128, spread = 10, anisotropy = 4 } = {}) {
  const grid = Math.ceil(Math.sqrt(GLYPHS.length));
  const size = cell * grid;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const px = Math.round(cell * 0.8);
  g.font = `900 ${px}px ${FONT}`;
  // one cap height for every glyph, so a row of blocks reads evenly
  const cap = g.measureText('H').actualBoundingBoxAscent || px * 0.72;
  const target = cell * 0.62;
  const scale = target / cap;
  GLYPHS.forEach((ch, i) => {
    const bar = ch === '6' || ch === '9';
    const cx = (i % grid) * cell + cell / 2;
    // 6 and 9 sit a little higher to make room for their bar
    const cy = Math.floor(i / grid) * cell + cell / 2 - (bar ? cell * 0.045 : 0);
    const m = g.measureText(ch);
    const w = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || px * 0.6);
    // wide glyphs (M, W) shrink to keep clear of the cell edge
    const s = Math.min(scale, (cell * 0.74) / Math.max(w, 1));
    g.save();
    g.translate(cx, cy + (cap * s) / 2);
    g.scale(s, s);
    // centre on the ink, not the advance box
    g.fillText(ch, ((m.actualBoundingBoxLeft || 0) - (m.actualBoundingBoxRight || 0)) / 2, 0);
    g.restore();
    // 6 and 9 get a bar underneath, as on real blocks, so they read upright
    if (bar) {
      const bw = cell * 0.3;
      const bh = cell * 0.055;
      const by = cy + (cap * s) / 2 + cell * 0.04;
      g.beginPath();
      g.roundRect(cx - bw / 2, by, bw, bh, bh / 2);
      g.fill();
    }
  });
  const rgba = g.getImageData(0, 0, size, size).data;
  const alpha = new Float32Array(size * size);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4] / 255;
  const sdf = distanceField(alpha, size, size, spread);
  // DataTexture rows run bottom-up; flip so v grows upwards in the atlas
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) data.set(sdf.subarray((size - 1 - y) * size, (size - y) * size), y * size);
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.NoColorSpace; // a distance, not a colour
  tex.needsUpdate = true;
  // atlas geometry for the shader: grid, distance range as a fraction of a cell
  tex.userData.grid = grid;
  tex.userData.range = (2 * spread) / cell;
  return tex;
}

// Signed distance field from an anti-aliased coverage image, packed into
// bytes. Edge pixels are seeded with their sub-pixel distance to the 0.5
// contour, then a squared Euclidean distance transform runs outside and
// inside the glyphs.
function distanceField(alpha, w, h, spread) {
  const n = w * h;
  const FAR = 1e20;
  const outer = new Float64Array(n);
  const inner = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const d = 0.5 - alpha[i]; // > 0 on the outside of the contour
    outer[i] = alpha[i] >= 0.999 ? 0 : alpha[i] <= 0.001 ? FAR : Math.max(d, 0) ** 2;
    inner[i] = alpha[i] <= 0.001 ? 0 : alpha[i] >= 0.999 ? FAR : Math.max(-d, 0) ** 2;
  }
  const len = Math.max(w, h);
  const f = new Float64Array(len);
  const v = new Int32Array(len);
  const z = new Float64Array(len + 1);
  for (const grid of [outer, inner]) {
    for (let x = 0; x < w; x++) envelope(grid, x, w, h, f, v, z);
    for (let y = 0; y < h; y++) envelope(grid, y * w, 1, w, f, v, z);
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const d = Math.sqrt(inner[i]) - Math.sqrt(outer[i]); // > 0 inside
    out[i] = Math.max(0, Math.min(255, Math.round(255 * (0.5 + d / (2 * spread)))));
  }
  return out;
}

// One line of the transform: the lower envelope of the parabolas rooted at
// each sample (Felzenszwalb and Huttenlocher, "Distance Transforms of
// Sampled Functions", 2012). Works in place on grid[offset + i * stride].
function envelope(grid, offset, stride, n, f, v, z) {
  for (let i = 0; i < n; i++) f[i] = grid[offset + i * stride];
  // where the parabola from sample q overtakes the one from sample p
  const meet = (q, p) => (f[q] + q * q - f[p] - p * p) / (2 * (q - p));
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = meet(q, v[k]);
    while (s <= z[k]) s = meet(q, v[--k]);
    v[++k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  for (let q = 0, j = 0; q < n; q++) {
    while (z[j + 1] < q) j++;
    const d = q - v[j];
    grid[offset + q * stride] = d * d + f[v[j]];
  }
}

// -------------------------------------------------------------- GLSL

// Hashes (after Dave Hoskins' "hash without sine") and value noise.
const NOISE = /* glsl */ `
float btH11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float btH21(vec2 p) { vec3 q = fract(p.xyx * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float btH31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 btH33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float btNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(btH31(i), btH31(i + vec3(1, 0, 0)), f.x), mix(btH31(i + vec3(0, 1, 0)), btH31(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(btH31(i + vec3(0, 0, 1)), btH31(i + vec3(1, 0, 1)), f.x), mix(btH31(i + vec3(0, 1, 1)), btH31(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float btNoise1(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(btH11(i), btH11(i + 1.0), f * f * (3.0 - 2.0 * f));
}
// 1 while a feature is several pixels across, 0 once it is below one
float btSharp(float perPixel, float size) { return 1.0 - smoothstep(0.35, 1.0, perPixel / size); }
`;

// Mikkelsen's bump mapping with unnormalised screen derivatives, so heights
// are in metres at any resolution.
const BUMP = /* glsl */ `
vec3 btBump(vec3 surfPos, vec3 surfNorm, float height, float faceDir) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec2 dh = vec2(dFdx(height), dFdy(height));
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

const BLOCK_VERTEX_DECL = /* glsl */ `
attribute float aEdge;
varying vec3 vBtPos;
varying vec3 vBtN;
varying float vBtEdge;
`;

const BLOCK_VERTEX_BODY = /* glsl */ `
vBtPos = position;
vBtN = objectNormal;
vBtEdge = aEdge;
`;

// Per-block uniforms; see BlockFactory.uniforms() in blocks.js.
const DECL = /* glsl */ `
uniform vec4 uBlk;      // mode (0 wood, 1 paint, 2 letters), seed, brightness, warmth
uniform mat3 uLogRot;   // block space -> log space (pith along +z at the origin)
uniform vec3 uLogOff;
uniform vec3 uAxis;     // the grain direction in block space
uniform float uLogR0;   // the block's distance from the pith
uniform vec3 uWoodA;    // earlywood
uniform vec3 uWoodB;    // latewood
uniform vec3 uWoodRay;
uniform vec3 uWoodPore;
uniform vec4 uWoodK;    // ring spacing, ring contrast, rays, pores
uniform vec4 uWoodM;    // figure, end-grain darkening, roughness, ray size
uniform vec4 uWoodR;    // late-wood start, boundary line, pore size, streaks
uniform vec3 uPaint;
uniform vec4 uPaintK;   // chips, brush marks, roughness, edge thinning
uniform float uGlyph[6];
uniform vec3 uInk[6];
uniform sampler2D uAtlas;
uniform vec4 uAtlasK;   // grid, distance range (cells), glyph half-size on the face, unused
varying vec3 vBtPos;
varying vec3 vBtN;
varying float vBtEdge;
`;

const SURFACES = /* glsl */ `
float btRingH = 0.0;
// ---------------------------------------------------------------- wood
// Rays: thin plates in the radial-longitudinal plane. They show as fine
// dashes on flat-sawn faces, as flecks on quarter-sawn faces and as short
// radial lines on the end grain. Cells in (tangential arc, axial).
float btRays(vec3 q, float r, float s, float seed, float size, out float sharp) {
  vec2 g = vec2(s / (0.0012 * size), q.z / (0.0034 * size));
  vec2 ci = floor(g);
  vec2 cf = g - ci - 0.5;
  // a ray runs radially for a few millimetres, then another takes over
  float seg = floor(r / (0.0014 * size) + btH21(ci + seed));
  vec3 h = btH33(vec3(ci, seg + seed * 7.0));
  vec2 c = (h.xy - 0.5) * vec2(0.5, 0.25);
  float w = mix(0.035, 0.09, h.z);
  float ht = mix(0.14, 0.38, fract(h.x * 7.3 + h.y));
  vec2 d = (cf - c) / vec2(w, ht);
  // spindle: pointed at the top and bottom
  d.x /= max(1.0 - 0.55 * d.y * d.y, 0.2);
  float e = length(d);
  vec2 fw = fwidth(g);
  float aa = fw.x / w * 0.7 + 0.08;
  float m = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, e)) * step(0.38, h.y) * step(0.45, fract(h.z * 17.3 + seg * 0.61));
  sharp = btSharp(fw.x, 0.12);
  return mix(0.02, m, sharp);
}

// Pores: vessels, fine tubes along the grain. Cells in (tangential, radial),
// broken into streaks a few millimetres long.
float btPores(vec3 q, float r, float s, float ringF, float seed, float size) {
  vec2 g = vec2(s, r) / 0.00034;
  vec2 ci = floor(g);
  vec2 cf = g - ci - 0.5;
  float z = q.z / 0.0055 + btH21(ci + seed * 3.0) * 7.0;
  float zi = floor(z);
  float zf = z - zi;
  vec3 h = btH33(vec3(ci + 17.0, zi + seed));
  // bigger pores in the early wood of each ring (walnut is semi-ring-porous)
  float rad = size * mix(0.16, 0.3, h.z) * mix(1.3, 0.6, smoothstep(0.1, 0.7, ringF));
  rad *= smoothstep(0.0, 0.25, zf) * smoothstep(1.0, 0.7, zf); // tapered ends
  vec2 c = (h.xy - 0.5) * 0.3;
  float e = length(cf - c) / max(rad, 1e-3);
  vec2 fw = fwidth(g);
  float aa = max(fw.x, fw.y) / max(rad, 0.05) * 0.7 + 0.1;
  float m = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, e)) * step(0.3, fract(h.x * 13.1));
  return mix(0.08, m, btSharp(max(fw.x, fw.y), 0.5));
}

void btWood(vec3 p, vec3 n, float edge, out vec3 alb, out float rough, out float h, out float late, out float endF, out vec3 q) {
  float seed = uBlk.y;
  q = uLogRot * p + uLogOff;
  // the rings wander: mostly along the grain (which draws the arches on
  // flat-sawn faces), barely across it (end-grain rings stay smooth arcs)
  vec3 nq = vec3(q.xy * 14.0, q.z * 6.0) + seed * 13.1;
  float w1 = btNoise(nq) - 0.5;
  float w2 = btNoise(vec3(q.xy * 34.0, q.z * 19.0) + seed * 5.3) - 0.5;
  float r = length(q.xy) + w1 * 0.006 + w2 * 0.0013;
  float ph = r / uWoodK.x;
  // no two years grow the same width
  ph += 1.3 * (btNoise1(ph * 0.21 + seed * 5.0) - 0.5);
  float ring = floor(ph);
  float f = ph - ring;
  float fwR = fwidth(ph);
  float ringSharp = btSharp(fwR, 0.9);
  // late wood darkens towards the end of the ring and stops sharply where
  // the next year starts; diffuse-porous woods show mostly that thin line
  float ramp = smoothstep(uWoodR.x, 0.975, f) * (1.0 - smoothstep(0.975, 1.0, f));
  float line = smoothstep(0.9, 0.975, f) * (1.0 - smoothstep(0.975, 1.0, f));
  float yearTone = btH11(ring * 1.37 + seed * 31.0) - 0.5;
  // some years draw a bold line, others barely show
  float lt = mix(ramp, line, uWoodR.y) * (0.45 + 1.1 * btH11(ring * 3.17 + seed * 7.0));
  float ltMean = mix(0.5 * (0.975 - uWoodR.x), 0.05, uWoodR.y);
  late = mix(ltMean, lt, ringSharp);
  // raised grain: the hard late wood stands a few microns proud. A smooth
  // wave, not the sharp colour line, so the bump never aliases
  btRingH = (0.5 - 0.5 * cos(6.2831853 * (f - 0.15))) * btSharp(fwR, 0.45);
  float s = atan(q.y, q.x) * uLogR0;

  // broad figure, and long colour streaks that run with the grain
  float mott = btNoise(vec3(q.xy * 60.0, q.z * 7.0) + seed * 3.3) - 0.5;
  float streak = btNoise(vec3(q.xy * 240.0, q.z * 4.0) + seed * 1.7) - 0.5;
  float band = btNoise(vec3(q.xy * 90.0, q.z * 2.5) + seed * 8.1) - 0.5;
  vec3 c = mix(uWoodA, uWoodB, clamp(late * uWoodK.y, 0.0, 1.0));
  c *= 1.0 + uWoodM.x * (mott * 1.2 + streak * 0.5) + band * 0.12 * uWoodR.w + yearTone * 0.05 * uWoodK.y;
  // a hint of hue drift with the figure: warmer where darker
  c *= vec3(1.0 - 0.03 * mott, 1.0, 1.0 + 0.05 * mott);

  float hh = btRingH * 0.000008;
  float roughV = uWoodM.z;

#if BT_DETAIL > 0
  // fibres: fine streaks you only see up close
  vec3 fq = vec3(s * 2300.0, r * 2300.0, q.z * 70.0);
  float fib = btNoise(fq + seed) - 0.5;
  float fibS = btSharp(length(fwidth(fq.xy)), 1.2);
  c *= 1.0 + fib * 0.1 * fibS;
  hh += fib * 0.000006 * fibS;

  float raySharp;
  float ray = btRays(q, r, s, seed, uWoodM.w, raySharp) * uWoodK.z;
  c = mix(c, uWoodRay, clamp(ray, 0.0, 1.0) * 0.6);
  hh += ray * 0.000006 * raySharp;
  roughV -= ray * 0.06;
#endif
#if BT_DETAIL > 1
  float pore = btPores(q, r, s, f, seed, uWoodR.z) * uWoodK.w;
  c = mix(c, uWoodPore, clamp(pore, 0.0, 1.0) * 0.8);
  hh -= pore * 0.00003;
  roughV += pore * 0.15;
#endif

  // end grain drinks more oil: darker, rougher, less sheen
  endF = smoothstep(0.55, 0.95, abs(dot(n, uAxis)));
  c *= 1.0 - uWoodM.y * endF;
  roughV = mix(roughV, 0.72, endF);

  // handled edges: a little darker and polished
  float wear = edge * smoothstep(0.3, 0.7, btNoise(p * 420.0 + seed * 9.0));
  c *= 1.0 - 0.14 * wear;
  roughV -= 0.1 * wear;

  // tiny dents from a life of being dropped, more of them on the edges
  vec3 dq = p / 0.007 + seed * 17.0;
  vec3 di = floor(dq);
  vec3 dh = btH33(di);
  float dr = mix(0.06, 0.16, dh.z);
  vec3 dc = (dh - 0.5) * (1.0 - 2.0 * dr);
  float dd = length(dq - di - 0.5 - dc) / dr;
  float dent = dd < 1.0 ? (1.0 - dd * dd) * (1.0 - dd * dd) : 0.0;
  dent *= step(0.93 - 0.3 * edge, btH31(di + 3.1));
  hh -= dent * 0.00004;

  // per-block tint: brightness and warmth
  c *= uBlk.z * vec3(1.0 + uBlk.w, 1.0, 1.0 - uBlk.w);
  alb = c;
  rough = roughV;
  h = hh;
}

// ---------------------------------------------------------------- paint
// Lacquer over wood: faint brush marks along the grain (across it on the end
// faces), the grain telegraphing through, paint thinning on the edge crest
// and a few small chips showing the wood beneath.
void btPaintCoat(vec3 p, vec3 q, float edge, float late, float endF, inout vec3 alb, inout float rough, inout float h,
                 out float coat, out float coatRough, out float follow) {
  float seed = uBlk.y;
  vec3 wood = alb;
  vec3 sq = endF > 0.5 ? vec3(q.y * 1300.0, q.z * 1300.0, q.x * 45.0) : vec3(q.x * 1300.0, q.y * 1300.0, q.z * 45.0);
  float stroke = btNoise(sq + seed * 5.0) * 0.65 + btNoise(sq * vec3(2.3, 2.3, 1.9) + 3.1) * 0.35 - 0.5;
  float strokeS = btSharp(length(fwidth(sq.xy)), 1.0);
  float broad = btNoise(p * 90.0 + seed * 2.0) - 0.5;
  // orange peel: the lacquer never dries perfectly flat
  vec3 pq = p * 1400.0 + seed * 4.0;
  float peel = btNoise(pq) - 0.5;
  float peelS = btSharp(length(fwidth(pq)), 1.0);
  vec3 c = uPaint * (1.0 + 0.05 * broad + 0.03 * stroke * strokeS - 0.035 * late);
  // paint runs a touch thinner over the crest of each edge
  c *= 1.0 - 0.06 * edge * uPaintK.w;

  // chips: a few knocks, each a ragged spot a millimetre or two across.
  // Spots are scattered through space in 6 mm cells; only those that land
  // on an edge (or, rarely, a corner) break the paint, so they stay sparse.
  vec3 cq = p / 0.006 + seed * 11.0;
  vec3 ci = floor(cq);
  vec3 ch = btH33(ci + 7.7);
  float cr = mix(0.1, 0.24, ch.z);
  vec3 cc = (ch - 0.5) * (1.0 - 2.0 * cr);
  float ragged = (btNoise(p * 2600.0 + seed) - 0.5) * 0.55 + (btNoise(p * 900.0 + seed * 2.0) - 0.5) * 0.35;
  float cd = length(cq - ci - 0.5 - cc) / cr + ragged;
  float live = step(1.0 - 0.4 * uPaintK.x, btH31(ci + 1.3)) * smoothstep(0.35, 0.75, edge);
  float fwc = fwidth(cd);
  float chip = (1.0 - smoothstep(1.0 - fwc, 1.0 + fwc, cd)) * live;
  // the broken paint edge catches a little light
  float lip = (1.0 - smoothstep(1.12 - fwc, 1.12 + fwc, cd)) * live - chip;

  // bared wood soon greys a little with handling
  alb = mix(c, wood * 0.92, chip);
  alb = mix(alb, c * 1.12, lip * 0.6);
  rough = mix(uPaintK.z + stroke * 0.05 * strokeS, 0.72, chip);
  // the paint follows the raised grain beneath it, and adds brush marks,
  // orange peel and a gentle waviness of its own
  float relief = btRingH * 0.000004 + stroke * 0.000006 * uPaintK.y * strokeS + peel * 0.000005 * peelS + broad * 0.00002;
  h = mix(relief, h, chip) - chip * 0.00006;
  coat = 1.0 - chip;
  coatRough = stroke * 0.03 * strokeS;
  follow = 0.7;
}

// ---------------------------------------------------------------- letters
// Each face of a letter cube: a printed glyph and a thin rounded frame,
// pressed a fraction of a millimetre into the wood.
void btLetters(vec3 p, vec3 n, float late, inout vec3 alb, inout float rough, inout float h, inout float coat) {
  vec3 an = abs(n);
  vec2 fuv;
  int fi;
  if (an.x >= an.y && an.x >= an.z) {
    fi = n.x > 0.0 ? 0 : 1;
    fuv = vec2(n.x > 0.0 ? -p.z : p.z, p.y);
  } else if (an.y >= an.z) {
    fi = n.y > 0.0 ? 2 : 3;
    fuv = vec2(p.x, n.y > 0.0 ? -p.z : p.z);
  } else {
    fi = n.z > 0.0 ? 4 : 5;
    fuv = vec2(n.z > 0.0 ? p.x : -p.x, p.y);
  }
  fuv /= 0.04;
  float flatF = smoothstep(0.97, 0.995, max(an.x, max(an.y, an.z)));
  // frame: a rounded square a few millimetres in from the edge
  vec2 b = abs(fuv) - vec2(0.405 - 0.07);
  float sq = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - 0.07;
  float aaF = fwidth(sq) * 0.8;
  float lw = 0.014;
  float frame = 1.0 - smoothstep(lw - aaF, lw + aaF, abs(sq));
  float frameSoft = 1.0 - smoothstep(lw - 0.008, lw + 0.008, abs(sq));
  // glyph
  float gi = uGlyph[fi];
  float grid = uAtlasK.x;
  vec2 cell = vec2(mod(gi, grid), grid - 1.0 - floor(gi / grid));
  vec2 guv = fuv / (2.0 * uAtlasK.z) + 0.5;
  float inCell = step(0.0, guv.x) * step(guv.x, 1.0) * step(0.0, guv.y) * step(guv.y, 1.0);
  vec2 auv = (cell + clamp(guv, 0.002, 0.998)) / grid;
  float sd = (texture2D(uAtlas, auv).r - 0.5) * uAtlasK.y * 2.0 * uAtlasK.z; // face units, > 0 inside
  float aaG = fwidth(sd) * 0.8;
  float glyph = smoothstep(-aaG, aaG, sd) * inCell;
  float glyphSoft = smoothstep(-0.008, 0.008, sd) * inCell;
  float ink = max(frame, glyph) * flatF;
  float press = max(frameSoft, glyphSoft) * flatF;
  vec3 col = uInk[fi];
  // printed ink is thin: the wood's grain still shades it a little
  col *= 1.0 - 0.14 * late + 0.05 * (btNoise(p * 800.0) - 0.5);
  alb = mix(alb, col, ink * 0.96);
  rough = mix(rough, 0.4, ink);
  h -= press * 0.0001;
  coat = mix(coat, 1.0, ink);
}
`;

// The fragment code that replaces the map lookup: works out albedo,
// roughness, a bump height and the clearcoat for this fragment.
const MAIN = /* glsl */ `
vec3 btN = normalize(vBtN);
vec3 btAlb;
float btRough;
float btH;
float btLate;
float btEnd;
vec3 btQ;
float btCoat = 1.0;
float btCoatRough = 0.0;
float btFollow = 0.0;
btWood(vBtPos, btN, vBtEdge, btAlb, btRough, btH, btLate, btEnd, btQ);
btCoat = 1.0 - 0.6 * btEnd;
if (uBlk.x > 0.5 && uBlk.x < 1.5) {
  btPaintCoat(vBtPos, btQ, vBtEdge, btLate, btEnd, btAlb, btRough, btH, btCoat, btCoatRough, btFollow);
} else if (uBlk.x > 1.5) {
  btLetters(vBtPos, btN, btLate, btAlb, btRough, btH, btCoat);
}
diffuseColor.rgb = btAlb;
`;

// Patches a MeshPhysicalMaterial into a block material. `uniforms` are the
// block's own (see blocks.js); every block shares one compiled program.
export function patchBlockMaterial(material, uniforms, detail = 2) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${BLOCK_VERTEX_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${BLOCK_VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#define BT_DETAIL ${detail}\n${NOISE}\n${BUMP}\n${DECL}\n${SURFACES}`)
      .replace('#include <map_fragment>', MAIN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(btRough, 0.05, 1.0);')
      .replace('#include <normal_fragment_maps>', 'normal = btBump(-vViewPosition, normal, btH, faceDirection);')
      .replace(
        '#include <clearcoat_normal_fragment_maps>',
        '#ifdef USE_CLEARCOAT\nclearcoatNormal = normalize(mix(nonPerturbedNormal, normal, btFollow));\n#endif',
      )
      .replace(
        '#include <lights_physical_fragment>',
        '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= btCoat;\nmaterial.clearcoatRoughness = clamp(material.clearcoatRoughness + btCoatRough, 0.0525, 1.0);\n#endif',
      );
  };
  material.customProgramCacheKey = () => `bt-block-${detail}`;
  return material;
}

// Ghost outline for challenge slots: a soft see-through fill that glows
// towards the silhouette and along the eased edges, and breathes slowly.
export function ghostShader() {
  return {
    uniforms: {
      uColor: { value: new THREE.Color('#fff1cf') },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
attribute float aEdge;
varying vec3 vN;
varying vec3 vV;
varying float vEdge;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vEdge = aEdge;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying float vEdge;
void main() {
  float nv = abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(1.0 - nv, 2.2);
  float breathe = 0.85 + 0.15 * sin(uTime * 2.4);
  float a = (0.1 + 0.55 * rim + 0.45 * vEdge) * breathe * uOpacity;
  gl_FragColor = vec4(uColor * (0.6 + 0.8 * rim + 0.6 * vEdge), clamp(a, 0.0, 0.9));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  };
}
