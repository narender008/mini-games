// Islands (ECONOMY). Definitions plus the deterministic cell generator.
//
// ISLANDS entry: { id, name, kind 'home'|'islet'|'far'|'roost', biome, ox, oy (world
//   tiles of cell (0, 0)), alt (tiles), w, h, seed, claimCost {coin, settlers?, goods},
//   needs (research id to claim), desc, resources [cell kinds it offers],
//   blob { cx, cy, rx, ry, wob } (outline: ellipse in cell units with a wobble),
//   features [{ c, u, v, r, ry?, wob? } | { c, path:[[u,v],...] } | { c, rect:[u,v,w,h] }],
//   townhall [u, v] (hearthrock), start [{ type, u, v }] (pre-built at founding) }
//
// Cells: row-major string, index = v * w + u, v = 0 is the FRONT row (nearest
// the viewer, world y = oy). Chars: ' ' void, g grass, f fertile, t forest,
// s stone outcrop, o ore, c coal, k crystal, h heat vent, r rock (unbuildable),
// w pond / stream, x ruin (the Skyforge site, exactly 3x3).
// genCells(def) is pure: the same def always gives the same island, whatever
// the game seed, so the colony always looks like concept 3.
import { rng, hashSeed } from '../core/rng.js';

export const ISLANDS = [
  // ---- the home cluster (colony view) -----------------------------------------
  { id: 'hearthrock', name: 'Hearthrock', kind: 'home', biome: 'meadow', ox: 0, oy: 0, alt: 0, w: 26, h: 21, seed: 7,
    claimCost: {}, needs: null, resources: ['t', 's', 'f', 'w'],
    desc: 'Your first island: broad meadows, a pine wood, a stone outcrop and the spring that spills over the rim.',
    blob: { cx: 13, cy: 10.4, rx: 12.0, ry: 9.6, wob: 0.07 },
    townhall: [12, 9],
    start: [{ type: 'cottage', u: 8, v: 11 }],
    features: [
      { c: 't', u: 5.0, v: 14.5, r: 3.4, wob: 0.3 }, { c: 't', u: 9.0, v: 17.3, r: 2.2, wob: 0.3 }, { c: 't', u: 2.6, v: 10.8, r: 1.6 },
      { c: 't', u: 21.6, v: 5.0, r: 1.5 },
      { c: 's', u: 19.4, v: 14.8, r: 2.1, wob: 0.25 }, { c: 'r', u: 21.4, v: 16.0, r: 0.8 },
      { c: 'f', u: 13.5, v: 3.6, r: 4.4, ry: 2.2, wob: 0.15 },
      { c: 'w', u: 6.4, v: 6.6, r: 1.25 }, { c: 'w', path: [[6, 6], [5, 5], [5, 4], [5, 3]] },
      { c: 'r', u: 23.2, v: 11.0, r: 0.7 }, { c: 'r', u: 16.5, v: 18.6, r: 0.7 },
    ] },
  { id: 'millbrook', name: 'Millbrook', kind: 'islet', biome: 'meadow', ox: -19, oy: 10, alt: 2.5, w: 16, h: 13, seed: 31,
    claimCost: { coin: 120, settlers: 2 }, needs: null, resources: ['f', 'w', 't'],
    desc: 'A gentle islet of deep black soil: the colony\'s breadbasket. A short bridge reaches it from Hearthrock.',
    blob: { cx: 8, cy: 6.5, rx: 7.6, ry: 6.1, wob: 0.08 },
    features: [
      { c: 'f', u: 6.5, v: 5.5, r: 5.6, ry: 4.4, wob: 0.15 }, { c: 'f', u: 11.5, v: 8, r: 2.6 },
      { c: 'w', u: 12.3, v: 4.2, r: 1.0 },
      { c: 't', u: 2.0, v: 8.6, r: 1.5 }, { c: 't', u: 13.6, v: 9.6, r: 1.1 },
    ] },
  { id: 'pinecrest', name: 'Pinecrest', kind: 'islet', biome: 'pine', ox: 1, oy: 28, alt: 4, w: 13, h: 11, seed: 44,
    claimCost: { coin: 220, planks: 30, settlers: 2 }, needs: null, resources: ['t', 's'],
    desc: 'A high wooded crag north of Hearthrock with a clear view of the sky: the place for an observatory. Too far for a bridge; reach it by cable car.',
    blob: { cx: 6.5, cy: 5.5, rx: 6.1, ry: 5.0, wob: 0.09 },
    features: [
      { c: 't', u: 2.6, v: 6.2, r: 2.6, wob: 0.3 }, { c: 't', u: 10.4, v: 7.0, r: 1.9, wob: 0.3 }, { c: 't', u: 9.5, v: 2.5, r: 1.3 },
      { c: 's', u: 4.2, v: 2.2, r: 1.4 }, { c: 'r', u: 7.2, v: 8.8, r: 0.7 },
    ] },
  { id: 'orespur', name: 'Orespur', kind: 'islet', biome: 'rocky', ox: -12, oy: -11, alt: -2, w: 16, h: 13, seed: 52,
    claimCost: { coin: 180, planks: 20, settlers: 2 }, needs: null, resources: ['o', 'c', 's', 't'],
    desc: 'A craggy spur rich in iron ore along its western cliff, with a coal seam and good stone. The colony\'s mine.',
    blob: { cx: 8, cy: 6.5, rx: 7.6, ry: 6.1, wob: 0.1 },
    features: [
      { c: 'o', u: 2.6, v: 6.5, r: 2.2, ry: 3.0, wob: 0.25 }, { c: 'o', u: 5.6, v: 9.6, r: 1.4 },
      { c: 'c', u: 11.6, v: 3.4, r: 1.8, wob: 0.25 },
      { c: 's', u: 9.2, v: 8.6, r: 1.6 }, { c: 'r', u: 6.0, v: 3.0, r: 0.8 }, { c: 'r', u: 13.6, v: 6.8, r: 0.6 },
      { c: 't', u: 12.8, v: 9.6, r: 1.3 }, { c: 't', u: 2.4, v: 2.5, r: 1.0 },
    ] },
  { id: 'kilnshelf', name: 'Kilnshelf', kind: 'islet', biome: 'volcanic', ox: 26, oy: -8, alt: -1.5, w: 18, h: 13, seed: 63,
    claimCost: { coin: 300, planks: 40, stone: 40, settlers: 3 }, needs: null, resources: ['h', 'k', 's', 'c'],
    desc: 'A warm shelf east of Hearthrock where heat vents breathe through the turf (smelt without coal) and skystone crystals break the surface. The forge isle.',
    blob: { cx: 9, cy: 6.5, rx: 8.6, ry: 6.1, wob: 0.08 },
    features: [
      { c: 'h', u: 4.5, v: 7.6, r: 1.3 }, { c: 'h', u: 8.0, v: 4.2, r: 1.3 }, { c: 'h', u: 3.6, v: 3.6, r: 1.0 },
      { c: 'k', u: 14.0, v: 7.5, r: 1.6, wob: 0.3 }, { c: 'k', u: 12.0, v: 2.6, r: 1.2 },
      { c: 's', u: 9.6, v: 10.0, r: 1.4 }, { c: 'c', u: 15.2, v: 4.0, r: 1.0 },
      { c: 'r', u: 6.6, v: 10.6, r: 0.6 }, { c: 't', u: 16.0, v: 9.0, r: 0.9 },
    ] },

  // ---- far islands (sky chart) -------------------------------------------------
  { id: 'emberrock', name: 'Emberrock', kind: 'far', biome: 'volcanic', ox: 92, oy: -46, alt: -3, w: 20, h: 15, seed: 81,
    claimCost: { coin: 600, planks: 80, iron: 60, settlers: 6 }, needs: null, resources: ['o', 'c', 'h', 's'],
    desc: 'A smouldering island far to the south-east: thick ore and coal seams over a field of heat vents.',
    blob: { cx: 10, cy: 7.5, rx: 9.6, ry: 7.0, wob: 0.1 },
    features: [
      { c: 'h', u: 9.6, v: 7.4, r: 2.0 }, { c: 'h', u: 15.0, v: 4.0, r: 1.3 },
      { c: 'o', u: 4.2, v: 8.6, r: 2.4, wob: 0.25 }, { c: 'o', u: 13.4, v: 11.0, r: 1.6 },
      { c: 'c', u: 5.2, v: 3.6, r: 1.9, wob: 0.25 }, { c: 'c', u: 16.0, v: 9.0, r: 1.2 },
      { c: 's', u: 10.4, v: 2.2, r: 1.3 }, { c: 'r', u: 8.2, v: 12.0, r: 0.9 },
    ] },
  { id: 'glimmerreach', name: 'Glimmerreach', kind: 'far', biome: 'crystal', ox: 34, oy: 118, alt: 6, w: 20, h: 16, seed: 91,
    claimCost: { coin: 1000, planks: 120, iron: 100, settlers: 8 }, needs: 'stormtaming', resources: ['k', 'x', 's'],
    desc: 'Beyond the Tempest Wall: a shard of crystal and old stone where the ruined Skyforge waits to be lit again.',
    blob: { cx: 10, cy: 8, rx: 9.5, ry: 7.4, wob: 0.09 },
    features: [
      { c: 'k', u: 3.8, v: 9.4, r: 2.0, wob: 0.3 }, { c: 'k', u: 16.0, v: 6.8, r: 1.8, wob: 0.3 }, { c: 'k', u: 12.6, v: 13.0, r: 1.2 },
      { c: 's', u: 5.4, v: 3.4, r: 1.4 }, { c: 'r', u: 14.4, v: 2.6, r: 0.8 },
      { c: 'g', rect: [7, 6, 7, 6] },
      { c: 'x', rect: [9, 7, 3, 3] },
    ] },
  { id: 'corsairroost', name: 'Corsair Roost', kind: 'roost', biome: 'pirate', ox: -112, oy: 74, alt: 4, w: 16, h: 13, seed: 101,
    claimCost: { coin: 0 }, needs: 'militia', resources: ['s', 'r', 'c'],
    desc: 'The Crimson Gale\'s hideout, a fang of black rock bristling with gun platforms. Taken only by a militia assault.',
    blob: { cx: 8, cy: 6.5, rx: 7.6, ry: 6.0, wob: 0.14 },
    features: [
      { c: 'r', u: 3.0, v: 7.6, r: 1.6 }, { c: 'r', u: 12.6, v: 4.0, r: 1.3 }, { c: 'r', u: 8.0, v: 10.4, r: 1.0 },
      { c: 's', u: 6.0, v: 3.6, r: 1.6 }, { c: 'c', u: 11.0, v: 9.0, r: 1.3 },
    ] },
  { id: 'mossback', name: 'Mossback', kind: 'far', biome: 'meadow', ox: -78, oy: -48, alt: 1, w: 18, h: 14, seed: 111,
    claimCost: { coin: 400, planks: 60, settlers: 4 }, needs: null, resources: ['f', 't', 'w'],
    desc: 'A slow old island wrapped in moss and orchards, drifting west of the colony. Rich farmland and timber.',
    blob: { cx: 9, cy: 7, rx: 8.6, ry: 6.5, wob: 0.08 },
    features: [
      { c: 'f', u: 7.0, v: 5.4, r: 4.0, ry: 3.0, wob: 0.15 }, { c: 't', u: 14.0, v: 8.6, r: 2.4, wob: 0.3 }, { c: 't', u: 3.0, v: 9.6, r: 1.8 },
      { c: 'w', u: 11.2, v: 3.4, r: 1.2 },
    ] },
  { id: 'whistlespire', name: 'Whistlespire', kind: 'far', biome: 'rocky', ox: 120, oy: 52, alt: 8, w: 16, h: 14, seed: 121,
    claimCost: { coin: 500, planks: 60, iron: 30, settlers: 4 }, needs: null, resources: ['s', 'o', 'k'],
    desc: 'A wind-carved needle that sings in a breeze. Stone, a little ore and a vein of skystone.',
    blob: { cx: 8, cy: 7, rx: 7.4, ry: 6.4, wob: 0.12 },
    features: [
      { c: 's', u: 4.4, v: 4.6, r: 2.0, wob: 0.25 }, { c: 'o', u: 11.2, v: 9.2, r: 1.6 }, { c: 'k', u: 10.6, v: 3.2, r: 1.3 },
      { c: 'r', u: 6.8, v: 10.2, r: 1.2 }, { c: 'r', u: 13.0, v: 6.0, r: 0.7 },
    ] },
  { id: 'sunkenbell', name: 'Sunkenbell', kind: 'far', biome: 'meadow', ox: -20, oy: -96, alt: -4, w: 17, h: 14, seed: 131,
    claimCost: { coin: 500, planks: 50, stone: 40, settlers: 4 }, needs: null, resources: ['w', 'f', 'c', 't'],
    desc: 'A low, lake-hollowed island far to the south; an old bell tower stands in its flooded middle. Fertile banks and a coal seam.',
    blob: { cx: 8.5, cy: 7, rx: 8.0, ry: 6.4, wob: 0.09 },
    features: [
      { c: 'w', u: 8.4, v: 7.2, r: 2.4 }, { c: 'f', u: 3.6, v: 5.0, r: 2.6, wob: 0.15 }, { c: 'f', u: 13.4, v: 9.0, r: 2.2 },
      { c: 'c', u: 12.8, v: 3.6, r: 1.5 }, { c: 't', u: 4.0, v: 10.8, r: 1.5 },
    ] },
];

export const ISLAND_BY_ID = Object.fromEntries(ISLANDS.map((i) => [i.id, i]));
export const HOME = 'hearthrock';
export const HOME_CLUSTER = ['hearthrock', 'millbrook', 'pinecrest', 'orespur', 'kilnshelf'];

// periodic 1D value noise on the angle, built from a few seeded sinusoids
function angNoise(r) {
  const waves = [];
  for (let k = 2; k <= 6; k++) waves.push([k, r() * Math.PI * 2, (r() * 0.6 + 0.4) / k]);
  return (a) => { let s = 0; for (const [k, p, amp] of waves) s += Math.sin(a * k + p) * amp; return s; };
}

// Generate the cells string for an island definition.
export function genCells(def) {
  const { w, h } = def;
  const r = rng(hashSeed('island', def.id, def.seed));
  const cells = new Array(w * h).fill(' ');
  const b = def.blob || { cx: w / 2, cy: h / 2, rx: w / 2 - 0.5, ry: h / 2 - 0.5, wob: 0.08 };
  const n = angNoise(r);
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
    const dx = (u + 0.5 - b.cx) / b.rx, dy = (v + 0.5 - b.cy) / b.ry;
    const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d < 1 + b.wob * n(a) * 1.6) cells[v * w + u] = 'g';
  }
  keepLargest(cells, w, h);
  const land = (u, v) => u >= 0 && v >= 0 && u < w && v < h && cells[v * w + u] !== ' ';
  const set = (u, v, c) => { if (land(u, v)) cells[v * w + u] = c; };
  // reserve the townhall plot and the start buildings as grass
  const keep = new Set();
  const reserve = (u0, v0, sw, sd) => { for (let v = v0 - 1; v < v0 + sd + 1; v++) for (let u = u0 - 1; u < u0 + sw + 1; u++) keep.add(v * w + u); };
  if (def.townhall) reserve(def.townhall[0], def.townhall[1], 3, 3);
  for (const s of def.start || []) reserve(s.u, s.v, 2, 2);
  for (const f of def.features || []) {
    if (f.rect) {
      const [u0, v0, rw, rh] = f.rect;
      for (let v = v0; v < v0 + rh; v++) for (let u = u0; u < u0 + rw; u++) set(u, v, f.c);
    } else if (f.path) {
      for (const [u, v] of f.path) if (!keep.has(v * w + u)) set(u, v, f.c);
    } else {
      const fr = rng(hashSeed('feat', def.id, f.u, f.v, f.c));
      const fn = angNoise(fr), rx = f.r, ry = f.ry ?? f.r, wob = f.wob ?? 0.18;
      const R = Math.ceil(Math.max(rx, ry) * (1 + wob) + 1);
      for (let v = Math.floor(f.v - R); v <= f.v + R; v++) for (let u = Math.floor(f.u - R); u <= f.u + R; u++) {
        if (!land(u, v) || keep.has(v * w + u)) continue;
        const dx = (u + 0.5 - f.u) / rx, dy = (v + 0.5 - f.v) / ry;
        const d = Math.hypot(dx, dy);
        // single-cell features (r < 1) always take their centre cell
        if (d < 1 + wob * fn(Math.atan2(dy, dx)) * 1.5 || (rx < 1 && Math.floor(f.u) === u && Math.floor(f.v) === v)) set(u, v, f.c);
      }
    }
  }
  return cells.join('');
}

function keepLargest(cells, w, h) {
  const seen = new Uint8Array(w * h); let best = null;
  for (let i = 0; i < w * h; i++) {
    if (cells[i] === ' ' || seen[i]) continue;
    const comp = [], q = [i]; seen[i] = 1;
    while (q.length) {
      const j = q.pop(); comp.push(j);
      const u = j % w, v = (j / w) | 0;
      for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const uu = u + du, vv = v + dv, k = vv * w + uu;
        if (uu >= 0 && vv >= 0 && uu < w && vv < h && !seen[k] && cells[k] !== ' ') { seen[k] = 1; q.push(k); }
      }
    }
    if (!best || comp.length > best.length) best = comp;
  }
  const keep = new Set(best || []);
  for (let i = 0; i < w * h; i++) if (!keep.has(i)) cells[i] = ' ';
}

// Waterfalls: stream/pond cells on the rim whose front (v - 1) or side neighbour is open sky.
export function findFalls(def, cells) {
  const { w, h } = def, out = [];
  const at = (u, v) => (u < 0 || v < 0 || u >= w || v >= h ? ' ' : cells[v * w + u]);
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
    if (at(u, v) !== 'w') continue;
    if (at(u, v - 1) === ' ') out.push([u, v]);
  }
  return out;
}
