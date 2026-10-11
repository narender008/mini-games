// The Gloamwall's look: moonlight, fog, grade, and the flagstone floor shader.
// Colours are linear RGB unless named `srgb`.
import { srgbHex, look as makeLook } from '../../gl/look.js';

export const LOOK = makeLook({
  // toward the moon: up, from the north-west, behind the scene
  key: [-0.36, -0.55, 0.75],
  keyCol: [0.27, 0.3, 0.4],
  ambTop: [0.045, 0.05, 0.068],
  ambBot: [0.022, 0.02, 0.03],
  rim: [0.5, 0.62, 0.9, 0.45],
  fog: [0.045, 0.055, 0.09, 1],
  sky: ['#0b1022', '#03050c', '#1b2440', '#2b4fa0', '#4a2a6a', '#9fc4ff'],
  glowA: [0.15, 0.1, 0.32, 0.07], // a cold glow far below, lower left
  glowB: [0.85, 0.18, 0.28, 0.05], // a violet glow, lower right
  cliff: ['#3a3f52', '#232736', '#2c2a22', '#070912'],
  inlay: [1.0, 0.72, 0.32, 0.05],
  shear: [0.32, 0.5],
  shadow: 0.42,
  exposure: 1.05,
  bloom: 1.0,
  bloomThreshold: 0.85,
  saturation: 0.86,
  contrast: 1.05,
  lift: [0.22, 0.25, 0.34],
  gain: [1.0, 0.98, 0.95],
  mist: [0.06, 0.075, 0.12, 0.12],
});

// Floor palette (uC[0..7]) and numbers (uP[0..3]) for the bake.
export const FLOOR = {
  colors: srgbHex([
    '#3c3d42', // stone A (slate)
    '#2f3035', // stone B
    '#4a4a4e', // stone C (paler)
    '#0c0d10', // joint grime
    '#26301f', // moss
    '#b48a3e', // gold inlay
    '#121620', // puddle
    '#3a3c46', // kerb
  ]),
  params: [
    [1.9, 1.45, 0.0, 0.0], // course cell size x, y (each cell splits into one to three stones); unused
    [0.35, 0.12, 0.6, 0.0], // moss amount, puddle amount, crack amount, unused
    [0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0],
  ],
  fn: 'floorGloam',
  src: /* glsl */ `
// irregular ashlar flagstones: courses of big cells, each split once or twice at random into smaller stones,
// the joints wobbled a little. Returns (local uv, stone id, distance to the joint in metres)
vec4 flag(vec2 w, vec2 cs) {
  w += (vec2(n1(w * 0.21), n2(w * 0.23)) - 0.5) * 0.07;
  float row = floor(w.y / cs.y);
  vec2 p = vec2(w.x + hash11(row * 1.37) * cs.x, w.y);
  vec2 cell = floor(p / cs);
  vec2 f = p / cs - cell;
  float id = cell.x + cell.y * 131.0;
  vec2 sz = cs;
  float h1 = hash11(id * 0.71);
  if (h1 > 0.42) {
    float t = 0.34 + 0.32 * hash11(id * 1.3);
    if (h1 > 0.58) {
      if (f.x < t) { f.x /= t; sz.x *= t; id += 0.11; } else { f.x = (f.x - t) / (1.0 - t); sz.x *= 1.0 - t; id += 0.23; }
    } else {
      if (f.y < t) { f.y /= t; sz.y *= t; id += 0.37; } else { f.y = (f.y - t) / (1.0 - t); sz.y *= 1.0 - t; id += 0.41; }
    }
    float h2 = hash11(id * 2.17);
    if (h2 > 0.62 && max(sz.x, sz.y) > 1.1) {
      float t2 = 0.38 + 0.24 * hash11(id * 3.1);
      if (sz.x > sz.y) {
        if (f.x < t2) { f.x /= t2; sz.x *= t2; id += 0.053; } else { f.x = (f.x - t2) / (1.0 - t2); sz.x *= 1.0 - t2; id += 0.067; }
      } else {
        if (f.y < t2) { f.y /= t2; sz.y *= t2; id += 0.071; } else { f.y = (f.y - t2) / (1.0 - t2); sz.y *= 1.0 - t2; id += 0.089; }
      }
    }
  }
  float dj = min(min(f.x, 1.0 - f.x) * sz.x, min(f.y, 1.0 - f.y) * sz.y);
  return vec4(f, id, dj);
}
// engraved rune circle with gold inlay: returns (groove depth 0..1, gold 0..1)
vec2 runeCircle(vec2 p, float r, float kind) {
  float d = length(p) / r;
  if (d > 1.05) return vec2(0.0);
  float a = atan(p.y, p.x);
  float g = 0.0, gold = 0.0;
  float ring1 = 1.0 - smoothstep(0.0, 0.012, abs(d - 0.98));
  float ring2 = 1.0 - smoothstep(0.0, 0.01, abs(d - 0.86));
  float ring3 = 1.0 - smoothstep(0.0, 0.008, abs(d - 0.5));
  // glyph band between the outer rings
  float u = a / 6.2832 * 36.0;
  float cell = floor(u);
  float fu = fract(u);
  float v = (d - 0.87) / 0.1;
  float h = hash11(cell + kind * 7.0);
  float glyph = step(0.0, v) * step(v, 1.0) * (step(abs(fu - 0.5), 0.07) * step(0.25, h) + step(abs(v - 0.5), 0.08) * step(0.2, fu) * step(fu, 0.8) * step(h, 0.6));
  // sun rays between the middle rings, a crescent at the heart
  float rays = step(0.52, d) * step(d, 0.84) * (1.0 - smoothstep(0.0, 0.05, abs(fract(a / 6.2832 * 12.0) - 0.5) * (1.0 - d) * 4.0));
  vec2 q = p / r;
  float cres = (1.0 - smoothstep(0.3, 0.315, length(q))) * smoothstep(0.235, 0.25, length(q - vec2(0.11, -0.07)));
  g = max(max(ring1, ring2), max(ring3, glyph));
  g = max(g, rays * 0.6);
  gold = max(max(ring1, ring2) * 0.9, max(glyph, cres));
  g = max(g, cres);
  return vec2(g, gold);
}
void floorGloam(vec2 w, vec4 m, out vec3 col, out float h) {
  float solid = step(0.5, m.r);
  if (solid < 0.5) { col = vec3(0.0); h = 0.0; return; }
  float edge = m.g * 8.0 - 2.0;   // metres to the nearest void (negative outside)
  float occ = m.a;                 // occlusion from walls and props
  float zone = floor(m.b * 255.0 + 0.5);
  vec2 size = uP[0].xy;
  vec4 F = flag(w, size);
  float sid = F.z;
  float hs = hash11(sid * 0.37 + 0.1);
  float hs2 = hash11(sid * 1.91 + 3.3);
  // per-stone colour, mottled
  vec3 base = mix(uC[0], uC[1], hs);
  base = mix(base, uC[2], step(0.82, hs2) * 0.7);
  float mott = fbm(w * 0.09 + hs * 3.0);
  base *= 0.7 + 0.55 * mott;
  // worn stones are paler in their middles, where boots have polished them
  base *= 1.0 + 0.12 * smoothstep(0.05, 0.3, F.w) * hs2;
  base *= 0.92 + 0.16 * n3(w * 0.8);
  // relief: each stone slightly tilted and domed, bevelled into the joint
  float bevel = smoothstep(0.0, 0.06, F.w);
  float tilt = (F.x - 0.5) * (hs - 0.5) * 0.1 + (F.y - 0.5) * (hs2 - 0.5) * 0.1;
  h = 0.5 + tilt + hs * 0.05;
  h = mix(0.24, h, bevel);
  // joints: grime and moss
  float joint = 1.0 - smoothstep(0.008, 0.04, F.w);
  vec3 c = mix(base, uC[3], joint * 0.78);
  float mossN = fbm(w * 0.18 + 11.0);
  float moss = smoothstep(0.55, 0.75, mossN) * (1.0 - smoothstep(0.02, 0.12, F.w)) * uP[1].x;
  moss += smoothstep(0.7, 0.85, mossN) * smoothstep(0.5, 0.0, edge - 0.6) * 0.5 * uP[1].x;
  c = mix(c, uC[4] * (0.7 + 0.6 * n2(w * 1.3)), clamp(moss, 0.0, 1.0));
  // cracks across stones
  float cr = abs(n1(w * 0.33 + hs) - 0.5);
  float crack = (1.0 - smoothstep(0.004, 0.018, cr)) * step(0.45, hs2) * uP[1].z;
  c = mix(c, uC[3], crack * 0.85);
  h -= crack * 0.2;
  // chipped corners
  float chip = step(0.86, n3(w * 1.7 + hs)) * (1.0 - smoothstep(0.02, 0.1, F.w));
  h -= chip * 0.12;
  c *= 1.0 - chip * 0.25;
  // kerb: a course of big stones along the platform's rim, raised a little, with a worn lip
  if (edge < 0.62) {
    vec2 kw = w * vec2(1.0, 1.0);
    float kx = fract((w.x + w.y) / 1.3 + hash11(floor(edge * 2.0)) * 0.5);
    float kj = min(kx, 1.0 - kx) * 1.3;
    float kb = smoothstep(0.0, 0.05, kj) * smoothstep(0.0, 0.05, 0.62 - edge);
    c = uC[7] * (0.75 + 0.5 * fbm(kw * 0.2 + 5.0)) * mix(0.35, 1.0, kb);
    h = mix(0.3, 0.62, kb) - smoothstep(0.12, 0.0, edge) * 0.25;
  }
  // puddles in the hollows
  float pud = smoothstep(0.62, 0.7, fbm(w * 0.07 + 31.0)) * uP[1].y * step(0.62, edge);
  c = mix(c, uC[6] * (0.8 + 0.4 * n2(w * 3.0)), pud * 0.85);
  h = mix(h, 0.18, pud);
  // zone 1: polished dais stones (darker, smoother); zone 2: trap plates are drawn by sprites, keep it dark
  if (zone == 1.0) { c = mix(c, uC[2] * 0.8, 0.5); h = mix(h, 0.55, 0.5); }
  if (zone == 2.0) { c *= 0.45; h = 0.2; }
  // engraved rune circles and decals
  for (int i = 0; i < 32; i++) {
    if (i >= uDecals) break;
    vec4 d = uDecal[i];
    vec2 p = w - d.xy;
    if (d.w < 1.5) {
      vec2 rc = runeCircle(p, d.z, float(i));
      c = mix(c, uC[3], rc.x * 0.55);
      // the gold is worn: patchy, dull, mostly lost in the grooves
      float wear = smoothstep(0.25, 0.7, fbm(w * 0.6 + float(i)));
      c = mix(c, uC[5] * (0.45 + 0.35 * n2(w * 2.0)), rc.y * 0.6 * wear);
      h -= rc.x * 0.12;
    } else if (d.w < 2.5) {
      // a burst of cracks (something heavy fell here)
      float r = length(p) / d.z;
      float rays = abs(fract(atan(p.y, p.x) / 6.2832 * 9.0 + n1(p * 0.2) * 0.6) - 0.5);
      float k = (1.0 - smoothstep(0.0, 0.05, rays * r)) * (1.0 - smoothstep(0.3, 1.0, r));
      c = mix(c, uC[3], k * 0.8);
      h -= k * 0.25;
    } else if (d.w < 3.5) {
      // moss patch
      float r = length(p) / d.z + (fbm(w * 0.5) - 0.5) * 0.6;
      c = mix(c, uC[4] * (0.8 + 0.5 * n2(w * 2.0)), (1.0 - smoothstep(0.6, 1.0, r)) * 0.8);
    } else {
      // standing water
      float r = length(p) / d.z + (fbm(w * 0.4 + 9.0) - 0.5) * 0.5;
      float k = 1.0 - smoothstep(0.75, 1.0, r);
      c = mix(c, uC[6], k * 0.9);
      h = mix(h, 0.16, k);
    }
  }
  // occlusion near walls and props
  c *= mix(1.0, 0.42, occ);
  // grime gathers toward the rim
  c *= mix(0.75, 1.0, smoothstep(0.0, 1.6, edge));
  col = c;
  h = clamp(h, 0.02, 1.0);
}
`,
};
