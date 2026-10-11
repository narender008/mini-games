// The ten tracks, in unlock order. Each is plain data: the world it is drawn
// in, how the stuntman is launched (car, ramp or cannon), the ground as a
// polyline (metres, y up, x rising), where the ride or launcher stands, the
// props (see sim/props.js; a prop without y sits on the ground, or on the
// height `on` if given, and `up` lifts it by that much, e.g. to stack), water or lava, and the score target for a
// three-run set that unlocks the next track. Stars: one at the target, two at
// 1.6 times it, three at 2.5 times.

// --- little helpers for laying props out
const stack = (t, x, n, o = {}) => Array.from({ length: n }, (_, i) => ({ t, x, up: (o.up || 0) + i * (o.h || dims[t]), ...o }));
const row = (t, x, n, gap, o = {}) => Array.from({ length: n }, (_, i) => ({ t, x: x + i * gap, ...o }));
// a pyramid of drums or crates: `rows` on the bottom, one fewer each row up; `v` a variant or a function of (row, i)
function pyramid(t, x, rows, v, o = {}, gap = 0.04) {
  const w = dims[t] === dims.drum ? 0.58 : 0.9;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const n = rows - r;
    for (let i = 0; i < n; i++) out.push({ t, x: x + (i - (n - 1) / 2) * (w + gap), up: r * (dims[t] + 0.005), v: typeof v === 'function' ? v(r, i) : v, ...o });
  }
  return out;
}
const dims = { drum: 0.88, crate: 0.9, tyres: 0.32, haybale: 0.9, junkcar: 1.3, container: 2.6, iceblock: 1, acunit: 0.9 };
const mix = (list) => (r, i) => list[(r * 3 + i) % list.length];

// Rounds the ground's corners (not cliff edges) with arcs of up to `r`
// metres, so a ride rolls over a slope change instead of tripping on it.
function round(points, r = 4) {
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const [cx, cy] = points[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay);
    const l2 = Math.hypot(cx - bx, cy - by);
    const cliff = bx - ax < 0.1 || cx - bx < 0.1;
    const turn = Math.abs(Math.atan2(cy - by, cx - bx) - Math.atan2(by - ay, bx - ax));
    if (cliff || turn < 0.02) {
      out.push(points[i]);
      continue;
    }
    // ease in from d before the corner to d after it (a quadratic curve through the corner's control point)
    const d = Math.min(r, l1 * 0.45, l2 * 0.45);
    const p0 = [bx - ((bx - ax) / l1) * d, by - ((by - ay) / l1) * d];
    const p2 = [bx + ((cx - bx) / l2) * d, by + ((cy - by) / l2) * d];
    const n = Math.max(3, Math.ceil(turn * 10));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * bx + t * t * p2[0], u * u * p0[1] + 2 * u * t * by + t * t * p2[1]]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

export const TRACKS = [
  {
    id: 'wall',
    name: 'The Wall',
    sub: 'Test Track',
    world: 'testtrack',
    kind: 'car',
    target: 200000,
    ground: round([[-80, 0], [150, 0], [156, 2], [160, 6]]),
    start: { x: -32 },
    props: [
      { t: 'cone', x: -12 },
      { t: 'cone', x: -8 },
      { t: 'wall', x: 0.7, w: 1.4, h: 1.15, v: 'concrete' },
      ...pyramid('drum', 8, 4, mix(['coolant', 'waste', 'lube', 'coolant', 'lube', 'waste', 'water'])),
      ...stack('crate', 14.5, 3),
      ...stack('crate', 15.45, 2),
      { t: 'glass', x: 19.5, h: 2.6 },
      ...row('drum', 23, 3, 0.62, { v: 'waste' }),
      { t: 'drum', x: 24.24, up: 0.885, v: 'lube' },
      ...stack('tyres', 28.5, 6),
      { t: 'pole', x: 33, v: 'lamp' },
      { t: 'target', x: 37 },
      { t: 'haybale', x: 42 },
      { t: 'haybale', x: 43.35 },
      { t: 'haybale', x: 42.7, up: 0.9 },
      ...stack('crate', 48, 2, { v: 'tnt' }),
      ...pyramid('drum', 54, 3, mix(['lube', 'coolant', 'waste'])),
      { t: 'glass', x: 60, h: 2.6 },
      { t: 'wall', x: 75, w: 1.6, h: 3, v: 'concrete' },
    ],
  },
  {
    id: 'quarry',
    name: 'Quarry Drop',
    sub: 'Gravel Pit',
    world: 'quarry',
    kind: 'ramp',
    target: 135000,
    ground: round([[-50, 24], [-36, 24], [-14, 11], [-4, 8.3], [1.5, 9.5], [1.52, -12], [40, -12], [48, -10], [56, -12], [120, -12], [126, 6]]),
    start: { x: -40 },
    lip: 1.5,
    props: [
      { t: 'cone', x: -44 },
      { t: 'trampoline', x: 22 },
      ...stack('crate', 30, 3),
      ...stack('crate', 30.95, 2),
      { t: 'pole', x: 37, v: 'sign' },
      ...pyramid('drum', 46, 3, mix(['lube', 'waste', 'coolant'])),
      { t: 'lavarock', x: 52, v: 'rock', w: 2.6, h: 1.5 },
      { t: 'spikes', x: 59, w: 3 },
      { t: 'haybale', x: 66 },
      { t: 'haybale', x: 67.4 },
      { t: 'trampoline', x: 74 },
      ...stack('crate', 82, 4),
      { t: 'junkcar', x: 92 },
      ...pyramid('drum', 101, 3, 'lube'),
      { t: 'lavarock', x: 110, v: 'rock', w: 3, h: 2 },
    ],
  },
  {
    id: 'bigtop',
    name: 'Big Top',
    sub: 'Circus',
    world: 'circus',
    kind: 'cannon',
    target: 115000,
    ground: round([[-40, 0], [120, 0]]),
    start: { x: 0, angle: 32, power: 0.75 },
    aim: [8, 75],
    props: [
      { t: 'hoop', x: 11, y: 6.2 },
      { t: 'trampoline', x: 17 },
      { t: 'hoop', x: 23, y: 9 },
      { t: 'trampoline', x: 28 },
      { t: 'bumper', x: 34, y: 6.5 },
      { t: 'bumper', x: 41, y: 9.5 },
      { t: 'bumper', x: 47, y: 5 },
      ...pyramid('crate', 55, 3, 'wood'),
      { t: 'target', x: 63 },
      ...pyramid('drum', 70, 3, mix(['lube', 'water', 'coolant'])),
      { t: 'haybale', x: 77 },
      { t: 'haybale', x: 78.4 },
      { t: 'haybale', x: 77.7, up: 0.9 },
      { t: 'trampoline', x: 86 },
      { t: 'bumper', x: 92, y: 7 },
      { t: 'wall', x: 104, w: 1.2, h: 6, v: 'brick' },
    ],
  },
  {
    id: 'highway',
    name: 'Rush Hour',
    sub: 'Overpass',
    world: 'highway',
    kind: 'car',
    target: 170000,
    ground: round([[-70, 0], [3, 0], [3.02, -9], [140, -9], [146, 0]]),
    start: { x: -36 },
    props: [
      { t: 'ramp', x: -2.5, w: 3.2, h: 1.1, v: 'wood' },
      { t: 'truck', x: 4, vx: 11, range: [-16, 140] },
      { t: 'sedan', x: 26, vx: 11, range: [-16, 140], v: 'taxi' },
      { t: 'bus', x: 50, vx: 11, range: [-16, 140] },
      { t: 'sedan', x: 76, vx: 11, range: [-16, 140], v: 'police' },
      { t: 'sedan', x: 98, vx: 11, range: [-16, 140] },
      { t: 'truck', x: 122, vx: 11, range: [-16, 140] },
      { t: 'sedan', x: 20, vx: -14, range: [-16, 140], far: true },
      { t: 'truck', x: 64, vx: -14, range: [-16, 140], far: true },
      { t: 'sedan', x: 110, vx: -14, range: [-16, 140], far: true, v: 'taxi' },
      { t: 'billboard', x: 66, up: 3 },
      { t: 'pole', x: 45, v: 'lamp' },
      { t: 'pole', x: 85, v: 'lamp' },
      ...row('cone', 100, 4, 1.2),
      { t: 'wall', x: 112, w: 2, h: 0.85, v: 'jersey' },
      ...pyramid('drum', 118, 3, mix(['lube', 'coolant', 'waste'])),
      ...stack('crate', 126, 3),
    ],
  },
  {
    id: 'site',
    name: 'Hard Hat Zone',
    sub: 'Building Site',
    world: 'construction',
    kind: 'cannon',
    target: 145000,
    ground: round([[-40, 0], [58, 0], [58.02, -4], [72, -4], [72.02, 0], [130, 0]]),
    start: { x: 0, angle: 28, power: 0.75 },
    aim: [8, 70],
    props: [
      { t: 'plankdeck', x: 15, y: 4, w: 6 },
      { t: 'plankdeck', x: 16, y: 8.2, w: 6, v: 'girder' },
      { t: 'glass', x: 13, up: 0 },
      { t: 'glass', x: 15, y: 5.3, h: 2.4 },
      ...stack('crate', 17, 2, { on: 4.07 }),
      { t: 'drum', x: 18.2, y: 8.75, v: 'lube' },
      { t: 'wreckingball', x: 30, y: 7, len: 9, swing: 7 },
      { t: 'beam', x: 40, y: 6, w: 6 },
      ...stack('crate', 40, 2, { on: 6.175 }),
      ...pyramid('drum', 48, 3, mix(['lube', 'coolant', 'waste'])),
      { t: 'spikes', x: 62, y: -3.72, w: 4 },
      { t: 'spikes', x: 67, y: -3.72, w: 4 },
      { t: 'glass', x: 78, h: 3 },
      { t: 'container', x: 86, v: 'orange' },
      { t: 'acunit', x: 86, up: 2.6 },
      ...row('cone', 94, 3, 1.1),
      { t: 'haybale', x: 102 },
      { t: 'haybale', x: 103.4 },
      { t: 'wall', x: 118, w: 1.4, h: 4, v: 'brick' },
    ],
  },
  {
    id: 'skijump',
    name: 'Ski Jump',
    sub: 'Alpine Slope',
    world: 'snow',
    kind: 'ramp',
    target: 95000,
    ground: round([[-90, 46], [-76, 46], [-22, 14], [-7, 7.4], [1.5, 9.2], [1.52, 4], [40, -14], [70, -20], [130, -22], [136, -8]]),
    start: { x: -80 },
    lip: 1.5,
    props: [
      { t: 'pole', x: 12, v: 'pine', h: 6 },
      { t: 'pole', x: 19, v: 'pine', h: 7 },
      { t: 'pole', x: 27, v: 'pine', h: 6 },
      { t: 'snowman', x: 33 },
      ...stack('crate', 36, 2, { v: 'tnt' }),
      { t: 'pole', x: 38, v: 'pine', h: 7 },
      { t: 'snowman', x: 46 },
      ...stack('drum', 49, 2, { v: 'lube' }),
      ...stack('iceblock', 54, 2),
      { t: 'iceblock', x: 55.05 },
      { t: 'spikes', x: 58, w: 3 },
      { t: 'snowman', x: 61 },
      { t: 'trampoline', x: 68 },
      ...stack('crate', 72, 2, { v: 'tnt' }),
      { t: 'pole', x: 76, v: 'pine', h: 7 },
      ...pyramid('drum', 84, 3, mix(['lube', 'water', 'lube'])),
      { t: 'haybale', x: 92 },
      { t: 'haybale', x: 93.4 },
      { t: 'snowman', x: 100 },
      ...stack('crate', 108, 3, { v: 'ice' }),
      { t: 'pole', x: 116, v: 'pine', h: 8 },
    ],
  },
  {
    id: 'rooftops',
    name: 'Rooftop Run',
    sub: 'Downtown',
    world: 'city',
    kind: 'ramp',
    target: 215000,
    ground: round([[-70, 34], [-46, 34], [-12, 30], [0, 30], [0.02, 0], [12, 0], [12.02, 26], [32, 26], [32.02, 0], [40, 0], [40.02, 20], [70, 20], [70.02, 0], [150, 0], [156, 8]]),
    start: { x: -50 },
    lip: 0,
    props: [
      { t: 'ramp', x: -1.4, w: 2.6, h: 1, v: 'steel' },
      { t: 'acunit', x: 15 },
      { t: 'acunit', x: 15, up: 0.9 },
      { t: 'glass', x: 19, h: 2.2, v: 'window' },
      ...stack('drum', 21, 2, { v: 'lube' }),
      { t: 'acunit', x: 23.5 },
      { t: 'watertower', x: 28, up: 2, h: 3 },
      { t: 'glass', x: 43, h: 2.2, v: 'window' },
      { t: 'billboard', x: 48, up: 1, v: 'neon' },
      ...stack('crate', 52, 2, { v: 'tnt' }),
      ...stack('crate', 55, 3),
      ...pyramid('drum', 60, 3, mix(['lube', 'coolant', 'lube'])),
      { t: 'pole', x: 66, v: 'sign', h: 3 },
      { t: 'sedan', x: 80, vx: 9, range: [72, 150] },
      { t: 'bus', x: 110, vx: 9, range: [72, 150] },
      { t: 'pole', x: 90, v: 'lamp' },
      { t: 'pole', x: 125, v: 'lamp' },
      ...row('cone', 98, 3, 1.1),
      ...stack('crate', 138, 2),
    ],
  },
  {
    id: 'scrap',
    name: 'Scrap Heap',
    sub: 'Junkyard',
    world: 'junkyard',
    kind: 'cannon',
    target: 270000,
    ground: round([[-40, 0], [50, 0], [54, 2], [60, 2], [64, 0], [135, 0]]),
    start: { x: 0, angle: 30, power: 0.75 },
    aim: [8, 70],
    props: [
      { t: 'junkcar', x: 13, body: 'static' },
      { t: 'junkcar', x: 13.6, up: 1.3, a: 0.08, body: 'static' },
      { t: 'junkcar', x: 13.2, up: 2.6 },
      ...stack('tyres', 21, 7),
      ...pyramid('drum', 29, 4, mix(['lube', 'lube', 'waste', 'coolant'])),
      { t: 'spikes', x: 36, w: 3.5 },
      { t: 'junkcar', x: 43 },
      ...stack('crate', 57, 3),
      { t: 'wreckingball', x: 70, y: 6, len: 8, swing: -6 },
      { t: 'container', x: 80, v: 'blue', body: 'static' },
      { t: 'container', x: 80.6, up: 2.6, v: 'green', body: 'static' },
      ...stack('tyres', 89, 5),
      ...pyramid('drum', 96, 3, 'lube'),
      { t: 'junkcar', x: 106 },
      { t: 'wall', x: 122, w: 1.4, h: 4, v: 'brick' },
    ],
  },
  {
    id: 'harbour',
    name: 'Harbour Smash',
    sub: 'Docks',
    world: 'harbour',
    kind: 'car',
    target: 210000,
    ground: round([[-70, 2], [32, 2], [32.02, -8], [150, -8], [156, 4]]),
    water: { x0: 32, x1: 150, y: 0 },
    start: { x: -34 },
    props: [
      ...stack('crate', -10, 2),
      ...stack('crate', 0, 3),
      ...pyramid('drum', 8, 3, mix(['coolant', 'waste', 'lube'])),
      { t: 'forklift', x: 18, vx: 3, range: [12, 27] },
      { t: 'wall', x: 30, w: 1.2, h: 1, v: 'jersey' },
      { t: 'platform', x: 52, y: -0.1, w: 16, h: 1.2, v: 'steel' },
      { t: 'container', x: 47, on: 0.5, v: 'red', body: 'static' },
      { t: 'container', x: 55, on: 0.5, v: 'green', body: 'static' },
      { t: 'container', x: 55.4, on: 3.1, v: 'blue' },
      ...stack('crate', 59.5, 2, { on: 0.5 }),
      { t: 'pole', x: 72, y: -1, h: 14, v: 'lamp' },
      { t: 'platform', x: 92, y: -0.1, w: 12, h: 1.2, v: 'steel' },
      ...pyramid('drum', 92, 3, mix(['lube', 'coolant', 'lube']), { on: 0.5 }),
      { t: 'container', x: 112, y: 0.3, v: 'orange' },
    ],
  },
  {
    id: 'volcano',
    name: 'Danger Island',
    sub: 'Volcano',
    world: 'volcano',
    kind: 'cannon',
    target: 400000,
    ground: round([[-40, 2], [8, 2], [12, 0], [24, 0], [24.5, -3], [39.5, -3], [40, 0], [62, 0], [66, 3], [72, 3], [76, 0], [86, 0], [86.5, -3], [104.5, -3], [105, 0], [140, 0], [146, 10]]),
    lava: [{ x0: 24, x1: 40, y: -0.5 }, { x0: 86, x1: 105, y: -0.5 }],
    start: { x: 0, angle: 30, power: 0.8 },
    aim: [8, 70],
    props: [
      { t: 'pole', x: 7, v: 'torch', w: 0.16, h: 2.2 },
      { t: 'lavarock', x: 17 },
      { t: 'pole', x: 21, v: 'torch', w: 0.16, h: 2.2 },
      ...stack('crate', 45, 2, { v: 'tnt' }),
      ...pyramid('drum', 50, 3, mix(['lube', 'lube', 'coolant'])),
      { t: 'log', x: 56, y: 4, len: 7, swing: 6 },
      { t: 'spikes', x: 60, w: 3 },
      { t: 'trampoline', x: 69 },
      { t: 'lavarock', x: 80, w: 2.6, h: 1.6 },
      { t: 'pole', x: 84, v: 'torch', w: 0.16, h: 2.2 },
      { t: 'log', x: 95, y: 5, len: 8, swing: -7 },
      ...stack('crate', 110, 3, { v: 'tnt' }),
      ...pyramid('drum', 116, 3, 'lube'),
      { t: 'lavarock', x: 125, w: 3, h: 2 },
      { t: 'spikes', x: 131, w: 3 },
    ],
  },
];

export const STAR_STEPS = [1, 1.6, 2.5];

export function starsFor(track, total) {
  let s = 0;
  for (const k of STAR_STEPS) if (total >= track.target * k) s++;
  return s;
}
