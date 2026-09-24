// The three garden birds at their real sizes. Shapes are in millimetres in
// the bird's rest pose: standing, feet at the origin, facing +z, +x is the
// bird's left. The body and head are blended ellipsoids (see sculpt.js);
// the plumage is painted by a small GLSL function per species that reads
// the rest-pose position of each fragment (so the pattern stays on the
// feathers whatever the head and body do).
//
// Colours are sRGB hex. Feather colours for wings and tail are painted into
// an atlas by textures.js from the `feathers` palette.

// GLSL helpers shared by the paint functions. `p` is in millimetres.
export const PAINT_LIB = /* glsl */ `
float bHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bHash(i), bHash(i + vec3(1, 0, 0)), f.x), mix(bHash(i + vec3(0, 1, 0)), bHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bHash(i + vec3(0, 0, 1)), bHash(i + vec3(1, 0, 1)), f.x), mix(bHash(i + vec3(0, 1, 1)), bHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// soft region masks
float ellM(vec3 p, vec3 c, vec3 r, float soft) { return 1.0 - smoothstep(1.0 - soft, 1.0 + soft, length((p - c) / r)); }
float above(float v, float edge, float soft) { return smoothstep(edge - soft, edge + soft, v); }
// piecewise curve through 5 points sorted by x: returns y at x
float curve5(float x, vec2 a, vec2 b, vec2 c, vec2 d, vec2 e) {
  return a.y + (b.y - a.y) * smoothstep(a.x, b.x, x) + (c.y - b.y) * smoothstep(b.x, c.x, x)
       + (d.y - c.y) * smoothstep(c.x, d.x, x) + (e.y - d.y) * smoothstep(d.x, e.x, x);
}
`;

export const SPECIES = {
  robin: {
    id: 'robin',
    posture: 40, // degrees the body leans back when standing; flight levels it
    body: [
      { c: [0, 48, -6], r: [21.5, 26, 33], pitch: 40 },
      { c: [0, 52, 10], r: [20, 23.5, 20], pitch: 30 },
      { c: [0, 37, -28], r: [11.5, 10.5, 15], pitch: 30 },
      { c: [0, 70, 13], r: [13.5, 12, 11.5], pitch: 20 }, // upper breast / neck
      { c: [0, 76, 20], r: [9.5, 8, 8], pitch: 0 }, // throat
    ],
    head: [
      { c: [0, 85, 20], r: [12, 12, 13], pitch: -4 },
      { c: [0, 83.5, 28], r: [7.6, 7.8, 7.8], pitch: 0 },
    ],
    blend: { body: 10, head: 5, neck: 12, cover: 5 },
    bodyCenter: [0, 50, -4],
    headCenter: [0, 84, 20],
    headAxis: [0, -0.05, 1],
    hip: [0, 42, -4],
    neck: [0, 74, 13],
    eye: { dir: [0.74, 0.2, 0.64], r: 2.4, embed: 0.5, iris: '#120a06', ring: '#2c2119' },
    beak: { dir: [0, -0.16, 1], embed: 3.2, len: 13, w: 4.4, h: 4.3, pitch: -6, curve: 0.5, hook: 0.3, base: '#231d18', tip: '#14110e', mouth: '#d8a060', lowerBase: '#4a3a2e' },
    tail: { base: [0, 38, -30], pitch: -22, len: 57, width: 10.5, fork: 0.0, closedFan: 1.0, openFan: 6.5 },
    wing: {
      shoulder: [12, 62, 6],
      chart: { origin: [75, 6], angle: -36, hump: 9 }, // folded wing: top front [y, z], slope, bow
      margin: 2.5, // how far below the back line the wing's top edge tucks in
      primary: 60, // longest primary, mm
      secondary: 44,
      tertial: 36,
      depth: 1, // how far the folded wing reaches down the flank (scale)
      projection: 1, // primaries beyond the tertials (scale)
    },
    legs: { foot: [7.5, 0, 5], ankle: [7, 21.5, -4], r: [0.85, 1.05], toe: 12.5, hallux: 9.5, color: '#735244', scale: '#5f4236', claw: '#2b2320' },
    size: 1,
    palette: {
      BROWN: '#766548',
      CROWN: '#6f5f44',
      ORANGE: '#d4602c',
      ORANGE2: '#df7338',
      GREY: '#8f979a',
      WHITE: '#ebe6dc',
      BUFF: '#ab9a7c',
      VENT: '#ded3c0',
    },
    paint: /* glsl */ `
vec3 plumage(vec3 p) {
  float ax = abs(p.x);
  float n1 = bNoise(p * 0.22) - 0.5;
  float n2 = bNoise(p * 0.7 + 11.0) - 0.5;
  // upperparts: olive brown, a little darker on the crown
  vec3 col = mix(BROWN, CROWN, above(p.y, 80.0, 6.0));
  // underparts below the flank line: buff flanks, white belly, pale vent
  float under = 1.0 - above(p.y - p.z * 0.6 - ax * 0.22, 47.0 + n1 * 4.0, 5.0);
  col = mix(col, BUFF, under * 0.9);
  float belly = ellM(p, vec3(0.0, 24.0, 8.0), vec3(17.0, 16.0, 22.0), 0.35 + n1 * 0.2);
  col = mix(col, WHITE, belly);
  col = mix(col, VENT, ellM(p, vec3(0.0, 30.0, -22.0), vec3(10.0, 9.0, 12.0), 0.4) * under);
  // the red breast: everything in front of a curve through the forehead,
  // just over and behind the eye, down the neck and round the breast
  float zb = curve5(p.y, vec2(34.0, 30.0), vec2(46.0, 13.0), vec2(66.0, 12.0), vec2(84.0, 19.0), vec2(92.0, 30.5));
  zb += n1 * 1.5 + n2 * 0.8;
  float front = above(p.z, zb, 0.9);
  // rounded lower edge on the breast (higher at the sides)
  float low = above(p.y, 37.0 + ax * ax * 0.035 + n1 * 2.0, 1.4);
  float orange = front * low;
  vec3 red = mix(ORANGE2, ORANGE, above(p.y, 52.0, 10.0));
  // a blue-grey border from the forehead over the eye and down the neck
  float band = above(p.z, zb - 3.4, 1.2) * (1.0 - front) * above(p.y, 50.0, 8.0) * low * (1.0 - 0.6 * above(p.y, 92.0, 3.0));
  col = mix(col, GREY, band * 0.7);
  col = mix(col, red, orange);
  return col;
}
`,
    feathers: {
      primary: { base: '#6f5f47', inner: '#63543f', fringe: '#96835f', fringeW: 0.5, shaft: '#54463a' },
      secondary: { base: '#77664b', inner: '#685943', fringe: '#9a8762', fringeW: 0.6, shaft: '#56483a' },
      tertial: { base: '#7a6a4e', inner: '#6e5f47', fringe: '#9e8b66', fringeW: 0.7, shaft: '#58493a' },
      gcov: { base: '#7c6b4f', inner: '#736449', fringe: '#9a8864', fringeW: 0.7, shaft: '#5c4e3e' },
      pcov: { base: '#6f5f47', inner: '#665640', fringe: '#877557', fringeW: 0.5, shaft: '#54463a' },
      alula: { base: '#665640', inner: '#5e5040', fringe: '#79684e', fringeW: 0.4, shaft: '#54463a' },
      patch: { base: '#7c6b4d', fringe: '#857354', rows: 2 },
      rectrix: { base: '#6b5536', inner: '#624d31', fringe: '#806a48', fringeW: 0.5, shaft: '#4c3d2b' },
      outerRect: { base: '#675234', inner: '#5e4a30', fringe: '#806a48', fringeW: 0.6, shaft: '#4c3d2b' },
    },
    behaviour: { ground: 0.75, peck: 1, sing: 0.9, tailFlick: 1, wingFlick: 0.8, bob: 1, hop: 0.07, soil: 0.85 },
  },

  'blue-tit': {
    id: 'blue-tit',
    posture: 30,
    body: [
      { c: [0, 40, -4], r: [18.5, 22, 28], pitch: 30 },
      { c: [0, 42, 8], r: [16.5, 20.5, 17], pitch: 25 },
      { c: [0, 33, -23], r: [10, 9.5, 13], pitch: 25 },
      { c: [0, 58, 12], r: [12, 11, 10], pitch: 15 },
    ],
    head: [
      { c: [0, 70, 17], r: [11.6, 11.6, 12], pitch: 0 },
      { c: [0, 68.5, 23], r: [7.3, 7.5, 7], pitch: 0 },
    ],
    blend: { body: 9, head: 5, neck: 12, cover: 5 },
    bodyCenter: [0, 41, -3],
    headCenter: [0, 69, 17],
    headAxis: [0, -0.02, 1],
    hip: [0, 34, -3],
    neck: [0, 60, 11],
    eye: { dir: [0.78, 0.14, 0.6], r: 1.95, embed: 0.5, iris: '#0d0a0c', ring: '#15161f' },
    beak: { dir: [0, -0.1, 1], embed: 2.6, len: 8.2, w: 4.2, h: 4.4, pitch: -4, curve: 0.3, hook: 0.2, base: '#26282c', tip: '#15161a', mouth: '#c89060', lowerBase: '#3a3d44' },
    tail: { base: [0, 33, -21], pitch: -18, len: 52, width: 9.5, fork: -0.04, closedFan: 1.2, openFan: 6 },
    wing: {
      shoulder: [10, 56, 4],
      chart: { origin: [61, 5], angle: -32, hump: 8 },
      margin: 2.5,
      primary: 55,
      secondary: 40,
      tertial: 32,
      depth: 0.95,
      projection: 0.8,
    },
    legs: { foot: [7, 0, 4], ankle: [6.5, 17.5, -3], r: [0.8, 0.95], toe: 11, hallux: 9, color: '#5d6a82', scale: '#4e5a70', claw: '#262a30' },
    size: 1,
    palette: {
      CAP: '#2a78cc',
      WHITE: '#f3f2ec',
      STRIPE: '#1a2340',
      BIB: '#141828',
      BACK: '#8c9853',
      RUMP: '#98a26a',
      YELLOW: '#efd54a',
      YELLOW2: '#e6cb48',
      STREAK: '#6f7050',
      NAPE: '#dfe7ea',
    },
    paint: /* glsl */ `
vec3 plumage(vec3 p) {
  float ax = abs(p.x);
  float n1 = bNoise(p * 0.25) - 0.5;
  float n2 = bNoise(p * 0.8 + 5.0) - 0.5;
  vec3 h = p - vec3(0.0, 69.0, 17.0); // head centre; the eye is at (8.3, 1.5, 6.6)
  // body: yellow-green back, sulphur yellow underparts, a faint belly streak
  vec3 col = mix(BACK, RUMP, 1.0 - above(p.z, -12.0, 6.0));
  float under = 1.0 - above(p.y - p.z * 0.5 - ax * 0.25, 42.0 + n1 * 4.0, 5.0);
  col = mix(col, mix(YELLOW2, YELLOW, above(p.y, 36.0, 8.0)), under);
  col = mix(col, STREAK, (1.0 - smoothstep(1.5, 4.0 + n2 * 2.0, ax)) * under * above(p.z, 2.0, 4.0) * (1.0 - above(p.y, 46.0, 4.0)) * 0.5);
  // the eye line: from the beak base through the eye, back to the nape
  float yl = h.z > 6.6 ? 1.5 - 0.62 * (h.z - 6.6) : 1.5 + 0.07 * (6.6 - h.z);
  float dy = h.y - yl + n2 * 0.4;
  // white cheek oval under the eye line, ringed by the dark collar
  float dc = length(vec2((h.y + 3.9) / 5.2, (h.z - 3.2) / 7.0)) + n2 * 0.04;
  float inHead = 1.0 - smoothstep(12.5, 14.5, length(h));
  // the cheek and collar carry on over the side of the neck (the body mesh)
  float side = 1.0 - smoothstep(14.5, 16.5, length(h.yz));
  float headArea = max((1.0 - smoothstep(1.34, 1.46, dc)) * side, above(dy, -1.2, 0.4) * inHead);
  col = mix(col, WHITE, headArea);
  // dark collar round the cheek, joining the eye stripe at the nape
  float collar = smoothstep(0.98, 1.06, dc) * (1.0 - smoothstep(1.34, 1.46, dc)) * (1.0 - above(dy, -0.8, 0.4)) * side;
  // dark stripe through the eye (from the lores back to the nape)
  float stripe = (1.0 - smoothstep(0.85, 1.35, abs(dy))) * above(ax, 2.2, 0.8) * (1.0 - above(h.z, 11.5, 0.8)) * inHead;
  // blue cap on the crown, edged with a white line; a white band on the forehead
  float capEdge = 2.5 + 1.2 * smoothstep(6.0, 10.5, h.z);
  float cap = above(dy, capEdge, 0.45) * above(h.z + 0.25 * h.y, -9.0, 0.7) * inHead;
  // behind the cap the dark band runs across the nape
  float nape = above(-h.z - 0.3 * h.y, 8.5, 0.9) * above(dy, -1.2, 0.6) * (1.0 - cap) * inHead;
  col = mix(col, STRIPE, max(max(collar, stripe), nape));
  col = mix(col, CAP, cap);
  // a pale spot in the middle of the nape
  col = mix(col, NAPE, ellM(h, vec3(0.0, 4.0, -11.0), vec3(3.0, 2.6, 3.0), 0.5) * 0.8);
  // black bib under the beak
  float bib = ellM(h, vec3(0.0, -9.0, 7.0), vec3(4.5, 5.5, 5.5), 0.35 + n2 * 0.3);
  col = mix(col, BIB, bib);
  return col;
}
`,
    feathers: {
      primary: { base: '#3d4652', inner: '#2e343c', fringe: '#6f9ccc', fringeW: 0.45, outerEdge: '#5e92cc', shaft: '#23272c' },
      secondary: { base: '#50789f', inner: '#3a4452', fringe: '#6b92b8', fringeW: 0.45, outerEdge: '#4d80b4', shaft: '#2a3038' },
      tertial: { base: '#56667a', inner: '#4a5566', fringe: '#dfe6ea', fringeW: 0.35, tip: { color: '#f4f4ef', len: 0.12 }, shaft: '#333a44' },
      gcov: { base: '#4a7fb8', inner: '#3f6a9c', fringe: '#6090c4', fringeW: 0.4, tip: { color: '#f2f2ec', len: 0.24 }, shaft: '#2a4a70' },
      pcov: { base: '#3f70a8', inner: '#345c8a', fringe: '#5586bc', fringeW: 0.4, shaft: '#223a5a' },
      alula: { base: '#2f3844', inner: '#2a313a', fringe: '#4a78a8', fringeW: 0.4, shaft: '#20252c' },
      patch: { base: '#4a86c4', fringe: '#6096cc', rows: 3 },
      rectrix: { base: '#4d6a8a', inner: '#3b4758', fringe: '#627f9e', fringeW: 0.45, shaft: '#2a3342' },
      outerRect: { base: '#526276', inner: '#3e4a58', fringe: '#d6dce0', fringeW: 0.9, shaft: '#2a3342' },
    },
    behaviour: { ground: 0.35, peck: 0.6, sing: 0.8, tailFlick: 0.5, wingFlick: 0.6, bob: 0.4, hop: 0.05, soil: 0.2 },
  },

  goldfinch: {
    id: 'goldfinch',
    posture: 32,
    body: [
      { c: [0, 39, -6], r: [17, 20.5, 29], pitch: 32 },
      { c: [0, 41, 7], r: [15.2, 19, 16.5], pitch: 25 },
      { c: [0, 31, -26], r: [9, 8.5, 13], pitch: 25 },
      { c: [0, 56, 10], r: [11, 10.5, 10], pitch: 18 },
    ],
    head: [
      { c: [0, 67, 15], r: [10.6, 10.8, 11.8], pitch: -2 },
      { c: [0, 65.5, 22], r: [6.6, 6.6, 7.2], pitch: -6 },
    ],
    blend: { body: 9, head: 6, neck: 11, cover: 5 },
    bodyCenter: [0, 40, -5],
    headCenter: [0, 66, 15],
    headAxis: [0, -0.06, 1],
    hip: [0, 33, -5],
    neck: [0, 57, 9],
    eye: { dir: [0.76, 0.2, 0.62], r: 1.85, embed: 0.5, iris: '#140c08', ring: '#1b1512' },
    beak: { dir: [0, -0.12, 1], embed: 3.2, len: 13, w: 5.2, h: 5.6, pitch: -4, curve: 0.2, hook: 0, base: '#eccab4', tip: '#77655c', mouth: '#c89080', lowerBase: '#efd2c0' },
    tail: { base: [0, 31, -25], pitch: -20, len: 50, width: 8.5, fork: 0.16, closedFan: 1.4, openFan: 6.5 },
    wing: {
      shoulder: [9, 55, 2],
      chart: { origin: [60, 3], angle: -30, hump: 8 },
      margin: 2.5,
      primary: 62,
      secondary: 40,
      tertial: 32,
      depth: 0.9,
      projection: 1.25,
    },
    legs: { foot: [6.5, 0, 3], ankle: [6, 16.5, -3.5], r: [0.75, 0.9], toe: 10.5, hallux: 8.5, color: '#b99088', scale: '#a57e76', claw: '#403430' },
    size: 1,
    palette: {
      RED: '#c5231d',
      BLACK: '#17130f',
      WHITE: '#f1eee6',
      BUFF: '#a8845e',
      BREAST: '#c4a888',
      BELLY: '#efebe1',
      RUMP: '#e8e0cf',
    },
    paint: /* glsl */ `
vec3 plumage(vec3 p) {
  float ax = abs(p.x);
  float n1 = bNoise(p * 0.24) - 0.5;
  float n2 = bNoise(p * 0.8 + 3.0) - 0.5;
  vec3 h = p - vec3(0.0, 66.0, 15.0); // head centre; the eye is at (7.9, 2.1, 6.8)
  // warm buff back and breast sides, white belly and rump
  vec3 col = BUFF;
  float under = 1.0 - above(p.y - p.z * 0.5 - ax * 0.25, 41.0 + n1 * 4.0, 5.0);
  col = mix(col, BREAST, under);
  col = mix(col, BELLY, ellM(p, vec3(0.0, 24.0, 2.0), vec3(12.0 + n1 * 3.0, 15.0, 22.0), 0.4) * (1.0 - above(p.y, 44.0, 6.0) * 0.7));
  col = mix(col, RUMP, ellM(p, vec3(0.0, 40.0, -24.0), vec3(8.0, 8.0, 7.0), 0.5) * 0.9);
  // the head: white cheeks and throat, carried on over the side of the neck
  float inHead = 1.0 - smoothstep(12.0, 14.0, length(h * vec3(1.0, 1.0, 0.9)));
  float side = 1.0 - smoothstep(14.5, 16.5, length(h.yz));
  float bar = -3.6 - 0.18 * h.y + n2 * 0.6;
  col = mix(col, WHITE, side * above(h.z, bar - 0.6, 0.7) * above(h.y, -11.0 + n1 * 2.0 + ax * 0.12, 1.2));
  // red face: in front of a line bowing back to just behind the eye
  float zr = 4.4 + 0.05 * (h.y - 1.5) * (h.y - 1.5) + n2 * 0.5;
  float red = above(h.z, zr, 0.45) * above(h.y, -8.0, 0.8) * side;
  // black crown, and a black bar down behind the white cheek
  float crown = above(h.y, 3.8 + n2 * 0.5, 0.5) * inHead;
  float back = (1.0 - above(h.z, bar, 0.6)) * above(h.y, -7.0 + n1 * 1.5, 1.0) * side * (1.0 - above(-h.z, 11.5, 1.5));
  col = mix(col, BLACK, max(crown, back) * (1.0 - red));
  col = mix(col, RED, red);
  // a thin black ring round the base of the beak
  float ring = 1.0 - smoothstep(0.85, 1.15, length((h - vec3(0.0, -1.4, 13.2)) / vec3(3.9, 3.4, 2.0)));
  col = mix(col, BLACK, ring * 0.9);
  return col;
}
`,
    feathers: {
      primary: { base: '#15120f', inner: '#110e0c', fringe: '#2a2520', fringeW: 0.3, band: { color: '#f2c318', b0: 0.08, b1: 0.34, web: 'outer' }, tip: { color: '#f1eee6', len: 0.07, web: 'inner' }, shaft: '#0e0c0a' },
      secondary: { base: '#17130f', inner: '#120f0c', fringe: '#2a2520', fringeW: 0.3, band: { color: '#f0c01a', b0: 0.08, b1: 0.42, web: 'both' }, tip: { color: '#f1eee6', len: 0.1 }, shaft: '#0e0c0a' },
      tertial: { base: '#1a1511', inner: '#15110e', fringe: '#2c2621', fringeW: 0.4, tip: { color: '#f1eee6', len: 0.16 }, shaft: '#100d0b' },
      gcov: { base: '#1c1712', inner: '#18130f', fringe: '#2c2621', fringeW: 0.4, band: { color: '#eebe1c', b0: 0.45, b1: 1.0, web: 'both' }, shaft: '#100d0b' },
      pcov: { base: '#15120f', inner: '#120f0c', fringe: '#2a2520', fringeW: 0.3, shaft: '#0e0c0a' },
      alula: { base: '#15120f', inner: '#120f0c', fringe: '#2a2520', fringeW: 0.3, shaft: '#0e0c0a' },
      patch: { base: '#1b1612', fringe: '#2c2621', rows: 3 },
      rectrix: { base: '#17130f', inner: '#14110e', fringe: '#2a2520', fringeW: 0.35, tip: { color: '#f1eee6', len: 0.08, web: 'inner' }, shaft: '#0e0c0a' },
      outerRect: { base: '#17130f', inner: '#14110e', fringe: '#2a2520', fringeW: 0.35, spot: { color: '#f1eee6', b0: 0.55, b1: 0.85, web: 'inner' }, shaft: '#0e0c0a' },
    },
    behaviour: { ground: 0.3, peck: 0.7, sing: 1, tailFlick: 0.4, wingFlick: 0.5, bob: 0.5, hop: 0.05, soil: 0.1 },
  },
};

export const KINDS = Object.keys(SPECIES);
