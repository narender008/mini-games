// The Hollow's look: warm candlelight in a cavern of roots, the chasms below
// glowing ember red and void blue, and a cobbled floor bound by roots.
import { srgbHex, look as makeLook } from '../../gl/look.js';

export const LOOK = makeLook({
  key: [-0.3, -0.5, 0.8],
  keyCol: [0.16, 0.15, 0.22], // little moonlight reaches down here
  ambTop: [0.062, 0.05, 0.056],
  ambBot: [0.035, 0.022, 0.022],
  rim: [0.9, 0.62, 0.42, 0.35],
  fog: [0.07, 0.045, 0.05, 1],
  sky: ['#120b0c', '#050304', '#2a1714', '#ff5a36', '#4a6aff', '#ffc27a'],
  glowA: [0.1, 0.95, 0.3, 0.09], // ember red, far below on the left
  glowB: [0.92, 0.95, 0.28, 0.06], // void blue on the right
  cliff: ['#4a3a30', '#2a1f1a', '#3a2a1e', '#0a0505'],
  inlay: [1.0, 0.7, 0.35, 0.03],
  shear: [0.18, 0.42],
  shadow: 0.45,
  exposure: 1.15,
  bloom: 1.0,
  bloomThreshold: 0.8,
  saturation: 1.08,
  contrast: 1.04,
  lift: [0.5, 0.25, 0.2],
  gain: [1.0, 0.96, 0.9],
  mist: [0.12, 0.08, 0.07, 0.1],
});

export const FLOOR = {
  colors: srgbHex([
    '#3e3631', // cobble A
    '#332c28', // cobble B
    '#4a4038', // cobble C
    '#0e0a08', // joint dirt
    '#2c3a1e', // moss
    '#c9a14a', // gold (rune inlays round the cauldron)
    '#2c1d14', // root bark
    '#7a5a3a', // root highlight
  ]),
  params: [
    [0.42, 0.0, 0.0, 0.0], // cobble size
    [0.45, 0.0, 0.5, 0.0], // moss, unused, roots
    [0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0],
  ],
  fn: 'floorHollow',
  src: /* glsl */ `
// irregular cobbles from the noise's cell channel: returns (cell value, joint)
vec2 cobble(vec2 w, float s) {
  vec2 p = w / s;
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash22(i + g) * 0.8 + 0.1;
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = hash12(i + g); }
      else if (d < d2) d2 = d;
    }
  }
  return vec2(id, (d2 - d1) * s);
}
void floorHollow(vec2 w, vec4 m, out vec3 col, out float h) {
  // organic, crumbling edges: the floor ends a little inside its cells, eaten by noise
  float edge = m.g * 8.0 - 2.0;
  float bite = 0.28 + 0.5 * fbm(w * 0.35) + 0.15 * n3(w * 1.7);
  if (edge < bite) { col = vec3(0.0); h = 0.0; return; }
  edge -= bite;
  float occ = m.a;
  vec2 cb = cobble(w, uP[0].x);
  float id = cb.x;
  float joint = 1.0 - smoothstep(0.015, 0.05, cb.y);
  vec3 base = mix(uC[0], uC[1], id);
  base = mix(base, uC[2], step(0.85, hash11(id * 91.0)) * 0.6);
  base *= 0.75 + 0.5 * fbm(w * 0.12 + id);
  h = 0.5 + (id - 0.5) * 0.12 + smoothstep(0.0, 0.08, cb.y) * 0.1;
  h = mix(0.25, h, smoothstep(0.0, 0.05, cb.y));
  vec3 c = mix(base, uC[3], joint * 0.85);
  // moss in the joints and in the damp corners
  float moss = smoothstep(0.5, 0.75, fbm(w * 0.2 + 3.0)) * (joint * 0.8 + 0.2) * uP[1].x;
  c = mix(c, uC[4] * (0.7 + 0.6 * n2(w * 2.0)), clamp(moss, 0.0, 1.0));
  // roots of the Elder Yew creeping across the floor: long winding bands
  float rootN = n1(w * vec2(0.05, 0.08) + 7.0);
  float bands = abs(fract(rootN * 6.0 + n2(w * 0.11) * 0.8) - 0.5);
  float root = (1.0 - smoothstep(0.02, 0.06, bands)) * smoothstep(0.35, 0.6, n3(w * 0.06 + 2.0)) * uP[1].z;
  float rootEdge = (1.0 - smoothstep(0.0, 0.04, bands)) * root;
  c = mix(c, mix(uC[6], uC[7], n2(w * vec2(2.5, 0.6))) * (0.8 + 0.4 * (0.06 - bands) * 10.0), root);
  h = mix(h, 0.62 + (0.05 - bands) * 2.0, root);
  // the crumbling rim
  float rim = 1.0 - smoothstep(0.0, 0.7, edge);
  c = mix(c, c * 0.55, rim);
  h -= rim * 0.15 * (0.5 + n3(w * 2.0));
  // engraved runes round the cauldron
  for (int i = 0; i < 32; i++) {
    if (i >= uDecals) break;
    vec4 d = uDecal[i];
    vec2 p = w - d.xy;
    float r = length(p) / d.z;
    if (r > 1.05) continue;
    float ring = 1.0 - smoothstep(0.0, 0.006, abs(r - 0.96));
    float ring2 = 1.0 - smoothstep(0.0, 0.005, abs(r - 0.84));
    float a = atan(p.y, p.x);
    float cell = floor(a / 6.2832 * 24.0);
    float fu = fract(a / 6.2832 * 24.0);
    float hh = hash11(cell + 3.0);
    float v = (r - 0.85) / 0.1;
    float glyph = step(0.0, v) * step(v, 1.0) * (step(abs(fu - 0.5), 0.035) * step(0.3, hh) + step(abs(v - 0.5), 0.06) * step(0.3, fu) * step(fu, 0.7) * step(hh, 0.6));
    float g = max(max(ring, ring2), glyph);
    c = mix(c, uC[5] * 0.55, g * 0.75);
    h -= g * 0.06;
  }
  c *= mix(1.0, 0.45, occ);
  col = c;
  h = clamp(h, 0.02, 1.0);
}
`,
};
