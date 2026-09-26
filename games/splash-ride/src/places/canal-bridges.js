// Canal Town's bridges. Every boat, sailboat mast and chase camera must pass
// underneath, so each one springs from tall abutments standing on the quays
// (nothing stands in the water) and keeps at least CLEAR metres of headroom
// from wall to wall; people climb up to them by long flights of steps.
//   stone:  a sandstone-ringed brick arch with parapets, lamps and pots of
//           geraniums, and broad steps down to the streets on both sides
//   wood:   a white-painted timber bowstring footbridge on trestles, with
//           flower boxes on its rails and open wooden stairs
//   houses: a row of little houses on a stone arch (like the Ponte Vecchio),
//           on piers with a passage through for the quay street
import { rng } from '../config.js';
import { BRIDGES, bridgeFrame, STREET } from './canal-layout.js';
import { T, F, col, WHITE } from './canal-kit.js';
import { house, houseOptions } from './canal-houses.js';
import { tube } from './canal-quays.js';

export const CLEAR = 7.0; // metres of headroom over the whole channel (less 2 m each side)

// local (bridge frame) -> world, for things built with world coordinates
const wp = (g, x, y, z) => [g.ox + x * g.rx - z * g.rz, g.oy + y, g.oz + x * g.rz + z * g.rx];
const wd = (g, x, y, z) => [x * g.rx - z * g.rz, y, x * g.rz + z * g.rx];

// a segmental arch from x = -L/2 to L/2, springing at `spring`, rising `rise`
function archCurve(L, spring, rise) {
  const R = (L * L / 4 + rise * rise) / (2 * rise);
  return (x) => spring + Math.sqrt(Math.max(0, R * R - x * x)) - (R - rise);
}

// the stone arch itself: underside, voussoir rings and spandrels on both
// faces, and the abutments standing on the quays
function stoneArch(g, L, W, under, deck, A, o) {
  const N = 20;
  const hw = W / 2;
  const ring = 0.8;
  for (let i = 0; i < N; i++) {
    const x0 = -L / 2 + (L * i) / N;
    const x1 = -L / 2 + (L * (i + 1)) / N;
    const u0 = under(x0);
    const u1 = under(x1);
    g.quad([x0, u0, -hw], [x1, u1, -hw], [x1, u1, hw], [x0, u0, hw], T.SAND, o.under);
    for (const side of [1, -1]) {
      const z = side * hw;
      const a = side > 0 ? [x0, x1] : [x1, x0];
      const ua = side > 0 ? [u0, u1] : [u1, u0];
      g.quad([a[0], ua[0], z], [a[1], ua[1], z], [a[1], ua[1] + ring, z], [a[0], ua[0] + ring, z], T.SAND, o.ring);
      g.quad([a[0], ua[0] + ring, z], [a[1], ua[1] + ring, z], [a[1], deck(a[1]), z], [a[0], deck(a[0]), z], o.spandrelT, o.spandrel);
    }
  }
  // abutments: from below the water up to the deck, on the quays
  for (const s of [-1, 1]) {
    const xa = s * (L / 2 - 0.08);
    const xb = s * (L / 2 + A);
    const top = deck(s * L / 2);
    const [x0, x1] = s > 0 ? [xa, xb] : [xb, xa];
    g.box(x0, x1, -3.4, top, -hw - 0.35, hw + 0.35, T.STONE, o.pier, 'bt');
    // a string course where the arch springs
    g.box(x0 - (s > 0 ? 0.12 : 0), x1 + (s < 0 ? 0.12 : 0), under(s * L / 2) - 0.25, under(s * L / 2), -hw - 0.47, hw + 0.47, T.SAND, o.ring, 'b');
  }
}

// steps from the bridge end (x = xs, height top) down to the street, going
// outwards (direction s), width W, with side walls
function stairs(g, xs, s, top, W, stepTile, stepC, wallTile, wallC, solidSides = true) {
  const rise = 0.165;
  const run = 0.33;
  const n = Math.ceil((top - STREET) / rise);
  const hw = W / 2;
  const steps = [];
  for (let k = 0; k < n; k++) {
    const y = top - (k + 1) * (top - STREET) / n;
    const xa = xs + s * k * run;
    const xb = xs + s * (k + 1) * run;
    steps.push([xa, xb, y]);
    const [x0, x1] = s > 0 ? [xa, xb] : [xb, xa];
    // tread
    g.quad([x0, y, hw], [x1, y, hw], [x1, y, -hw], [x0, y, -hw], stepTile, stepC);
    // riser (facing outwards, down the stairs)
    const yPrev = top - k * (top - STREET) / n;
    const xr = xa;
    if (s > 0) g.quad([xr, y, hw], [xr, y, -hw], [xr, yPrev, -hw], [xr, yPrev, hw], stepTile, stepC.map((v) => v * 0.85));
    else g.quad([xr, y, -hw], [xr, y, hw], [xr, yPrev, hw], [xr, yPrev, -hw], stepTile, stepC.map((v) => v * 0.85));
  }
  if (solidSides) {
    // the stepped side walls of the flight
    const end = xs + s * n * run;
    const outline = [[xs, STREET - 0.2], [end, STREET - 0.2]];
    for (let k = n - 1; k >= 0; k--) {
      const [xa, xb, y] = steps[k];
      outline.push([xb, y], [xa, y]);
    }
    outline.push([xs, top]);
    const pts = s > 0 ? outline : outline.map(([x, y]) => [x, y]).reverse();
    g.poly(pts, [], hw, wallTile, wallC);
    g.poly(pts, [], -hw, wallTile, wallC, true);
  }
  return xs + s * n * run;
}

// a parapet wall along a line y(x) from xa to xb on the side z (outer face at z)
function parapet(g, xa, xb, yAt, z, side, h, t, tile, c, capC, N = 12) {
  for (let i = 0; i < N; i++) {
    const x0 = xa + ((xb - xa) * i) / N;
    const x1 = xa + ((xb - xa) * (i + 1)) / N;
    const y0 = yAt(x0);
    const y1 = yAt(x1);
    const zo = z;
    const zi = z - side * t;
    const [a, b] = side > 0 ? [x0, x1] : [x1, x0];
    const [ya, yb] = side > 0 ? [y0, y1] : [y1, y0];
    // outer face, inner face, coping
    g.quad([a, ya - 0.3, zo], [b, yb - 0.3, zo], [b, yb + h, zo], [a, ya + h, zo], tile, c);
    g.quad([b, yb, zi], [a, ya, zi], [a, ya + h, zi], [b, yb + h, zi], tile, c.map((v) => v * 0.9));
    const zo2 = zo + side * 0.06;
    const zi2 = zi - side * 0.06;
    g.quad([a, ya + h, zo2], [b, yb + h, zo2], [b, yb + h + 0.12, zo2], [a, ya + h + 0.12, zo2], T.SAND, capC);
    g.quad([a, ya + h + 0.12, zo2], [b, yb + h + 0.12, zo2], [b, yb + h + 0.12, zi2], [a, ya + h + 0.12, zi2], T.SAND, capC);
  }
}

function lampPost(d, x, y, z) {
  const green = col('#1f3129');
  const [wx, , wz] = wp(d, x, 0, z);
  const oy = d.oy;
  const save = [d.ox, d.oz, d.rx, d.rz];
  d.identity();
  d.lathe(wx, wz, [[0.13, oy + y], [0.1, oy + y + 0.3], [0.06, oy + y + 0.5], [0.05, oy + y + 2.6], [0.08, oy + y + 2.7]], 8, T.PLAIN, green);
  d.frame(wx, oy + y, wz, 1, 0);
  d.box(-0.17, 0.17, 2.7, 3.15, -0.17, 0.17, T.PLAIN, col('#3a3a30'), 'b');
  d.identity();
  d.lathe(wx, wz, [[0.21, oy + y + 3.15], [0.04, oy + y + 3.4], [0.001, oy + y + 3.5]], 8, T.PLAIN, green);
  d.frame(save[0], oy, save[1], save[2], save[3]);
}

// a terracotta pot of geraniums standing on a coping at local (x, y, z)
function pot(d, cards, x, y, z, r) {
  const [wx, , wz] = wp(d, x, 0, z);
  const oy = d.oy;
  const save = [d.ox, d.oz, d.rx, d.rz];
  d.identity();
  d.lathe(wx, wz, [[0.16, oy + y], [0.24, oy + y + 0.36], [0.27, oy + y + 0.4], [0.25, oy + y + 0.44]], 10, T.PLAIN, col('#b5603a'));
  d.frame(save[0], oy, save[1], save[2], save[3]);
  const c = [wx, oy + y + 0.62, wz];
  for (let k = 0; k < 2; k++) {
    const a = r() * Math.PI + (k * Math.PI) / 2;
    cards.card(F.GERANIUM, c[0], c[1], c[2], Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36, 0, 0.28, 0, [0, 0.7, 0.7]);
  }
}

// ------------------------------------------------------------ the three kinds

function buildStone(g, d, cards, fr, b) {
  const r = rng(b.seed || 1);
  const L = fr.span;
  const W = b.width;
  const hw = W / 2;
  const A = 4.5;
  const under = archCurve(L, 7.2, 1.9);
  const deck = (x) => 9.3 + 0.4 * Math.max(0, 1 - (2 * x / L) ** 2);
  const o = {
    under: col('#b9ad98'),
    ring: col('#e2d6bf'),
    spandrel: b.seed ? col('#d9c6b0') : WHITE,
    spandrelT: b.seed ? T.SAND : T.BRICK,
    pier: col('#d8d0c2'),
  };
  stoneArch(g, L, W, under, deck, A, o);
  // the road deck over the arch and abutments
  const xe = L / 2 + A;
  const yEnd = deck(L / 2);
  const deckAt = (x) => (Math.abs(x) <= L / 2 ? deck(x) : yEnd);
  const N = 16;
  for (let i = 0; i < N; i++) {
    const x0 = -xe + (2 * xe * i) / N;
    const x1 = -xe + (2 * xe * (i + 1)) / N;
    g.quad([x0, deckAt(x0), hw], [x1, deckAt(x1), hw], [x1, deckAt(x1), -hw], [x0, deckAt(x0), -hw], T.COBBLE, col('#e4ded4'));
  }
  const capC = col('#ece4d4');
  for (const side of [1, -1]) parapet(g, -xe, xe, deckAt, side * hw, side, 1.05, 0.38, o.spandrelT === T.BRICK ? T.BRICK : T.SAND, o.spandrel, capC, N);
  // steps down each side, flanked by parapets
  for (const s of [-1, 1]) {
    const x0 = s * xe;
    const end = stairs(g, x0, s, yEnd, W, T.SAND, col('#d6cfc2'), T.STONE, o.pier);
    const slope = (x) => yEnd + ((x - x0) / (end - x0)) * (STREET - yEnd);
    const [xa, xb] = s > 0 ? [x0, end] : [end, x0];
    for (const side of [1, -1]) parapet(g, xa, xb, slope, side * hw, side, 1.0, 0.36, T.STONE, o.pier, capC, 6);
    // lamps where the bridge meets its steps
    for (const side of [1, -1]) lampPost(d, x0, yEnd + 1.17, side * (hw - 0.19));
  }
  // pots of geraniums along the parapet over the water
  for (let x = -L / 2 + 2; x <= L / 2 - 1.5; x += 4.2) {
    for (const side of [1, -1]) pot(d, cards, x + (side > 0 ? 0 : 2.1), deckAt(x) + 1.17, side * (hw - 0.19), r);
  }
}

function buildWood(g, d, cards, fr, b) {
  const r = rng(5);
  const L = fr.span;
  const W = b.width;
  const hw = W / 2;
  const white = col('#eeece6');
  const shade = col('#d8d6d0');
  const under = (x) => 7.35 + 0.3 * (1 - (2 * x / L) ** 2);
  const deckY = (x) => under(x) + 0.5;
  const E = 2.6; // the trestle towers on the quays
  const xe = L / 2 + E;
  const deckAt = (x) => (Math.abs(x) <= L / 2 ? deckY(x) : deckY(L / 2));
  // deck: planks on top, beams underneath
  const N = 14;
  for (let i = 0; i < N; i++) {
    const x0 = -xe + (2 * xe * i) / N;
    const x1 = -xe + (2 * xe * (i + 1)) / N;
    const y0 = deckAt(x0);
    const y1 = deckAt(x1);
    g.quad([x0, y0, hw], [x1, y1, hw], [x1, y1, -hw], [x0, y0, -hw], T.PLANK, col('#c9b89c'));
    g.quad([x0, y0 - 0.5, -hw], [x1, y1 - 0.5, -hw], [x1, y1 - 0.5, hw], [x0, y0 - 0.5, hw], T.PLANK, shade);
    for (const side of [1, -1]) {
      const z = side * hw;
      const [a, bb] = side > 0 ? [x0, x1] : [x1, x0];
      const [ya, yb] = side > 0 ? [y0, y1] : [y1, y0];
      g.quad([a, ya - 0.5, z], [bb, yb - 0.5, z], [bb, yb + 0.05, z], [a, ya + 0.05, z], T.PLANK, white);
    }
  }
  // the bowstring arches, hangers, handrails and balusters (in world space)
  const save = [g.ox, g.oy, g.oz, g.rx, g.rz];
  const W3 = (x, y, z) => wp({ ox: save[0], oy: save[1], oz: save[2], rx: save[3], rz: save[4] }, x, y, z);
  const topY = (x) => deckY(x) + 1.15 + 2.1 * Math.max(0, 1 - (2 * x / L) ** 2);
  g.identity();
  for (const side of [1, -1]) {
    const z = side * (hw - 0.08);
    const M = 16;
    for (let i = 0; i < M; i++) {
      const x0 = -L / 2 + (L * i) / M;
      const x1 = -L / 2 + (L * (i + 1)) / M;
      tube(g, W3(x0, topY(x0), z), W3(x1, topY(x1), z), 0.11, 0.11, 6, T.PLAIN, white);
      tube(g, W3(x0, deckY(x0) + 1.0, z), W3(x1, deckY(x1) + 1.0, z), 0.05, 0.05, 5, T.PLAIN, white);
      // hangers from the arch to the deck, and a diagonal in each panel
      tube(g, W3(x1, deckY(x1), z), W3(x1, topY(x1), z), 0.06, 0.06, 5, T.PLAIN, white);
      tube(g, W3(x0, deckY(x0) + 0.05, z), W3(x1, Math.min(topY(x1), deckY(x1) + 1.0), z), 0.035, 0.035, 4, T.PLAIN, shade);
    }
    // the arch springs from the tops of the trestles
    for (const s of [-1, 1]) tube(g, W3(s * L / 2, deckY(L / 2) - 0.4, z), W3(s * L / 2, topY(s * L / 2) + 0.1, z), 0.14, 0.12, 6, T.PLAIN, white);
  }
  // lateral braces over the deck near the ends
  for (const x of [-L * 0.3, 0, L * 0.3]) tube(g, W3(x, topY(x), -hw + 0.08), W3(x, topY(x), hw - 0.08), 0.06, 0.06, 5, T.PLAIN, white);
  // trestle towers on the quays
  for (const s of [-1, 1]) {
    for (const xo of [L / 2 + 0.35, L / 2 + E - 0.2]) {
      for (const side of [1, -1]) {
        const z = side * (hw - 0.1);
        tube(g, W3(s * xo, STREET - 0.1, z), W3(s * xo, deckY(L / 2) - 0.45, z), 0.13, 0.12, 6, T.PLAIN, white);
      }
    }
    // cross bracing on the tower faces
    for (const side of [1, -1]) {
      const z = side * (hw - 0.1);
      const ya = STREET + 0.3;
      const yb = deckY(L / 2) - 0.6;
      const ym = (ya + yb) / 2;
      tube(g, W3(s * (L / 2 + 0.35), ya, z), W3(s * (L / 2 + E - 0.2), ym, z), 0.05, 0.05, 4, T.PLAIN, shade);
      tube(g, W3(s * (L / 2 + E - 0.2), ym, z), W3(s * (L / 2 + 0.35), yb, z), 0.05, 0.05, 4, T.PLAIN, shade);
    }
  }
  g.frame(save[0], save[1], save[2], save[3], save[4]);
  // open wooden stairs down each side
  for (const s of [-1, 1]) {
    const x0 = s * xe;
    const top = deckY(L / 2);
    const end = stairs(g, x0, s, top, W - 0.4, T.PLANK, col('#c9b89c'), T.PLANK, white, false);
    g.identity();
    for (const side of [1, -1]) {
      const z = side * (hw - 0.15);
      // stringers and a handrail
      tube(g, W3(x0, top - 0.3, z), W3(end, STREET - 0.1, z), 0.1, 0.1, 5, T.PLAIN, white);
      tube(g, W3(x0, top + 1.0, z), W3(end, STREET + 1.0, z), 0.045, 0.045, 5, T.PLAIN, white);
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        const x = x0 + (end - x0) * t;
        const y = top + (STREET - top) * t;
        tube(g, W3(x, y - 0.3, z), W3(x, y + 1.0, z), 0.04, 0.04, 4, T.PLAIN, white);
        if (k === 2) tube(g, W3(x, STREET - 0.1, z), W3(x, y - 0.3, z), 0.09, 0.09, 5, T.PLAIN, white);
      }
    }
    g.frame(save[0], save[1], save[2], save[3], save[4]);
  }
  // flower boxes hanging on the handrails
  for (const x of [-L * 0.34, -L * 0.1, L * 0.14, L * 0.36]) {
    for (const side of [1, -1]) {
      const z = side * (hw + 0.12);
      d.box(x - 0.6, x + 0.6, deckY(x) + 0.55, deckY(x) + 0.8, z - 0.14, z + 0.14, T.PLANK, col('#2f4a34'), '');
      const c = wp(d, x, deckY(x) + 0.95, z);
      const a = wd(d, 0.7, 0, 0);
      cards.card(r() < 0.5 ? F.PETUNIA : F.GERANIUM, c[0], c[1], c[2], a[0], a[1], a[2], 0, 0.28, 0, [0, 0.7, 0.7]);
      const c2 = wp(d, x, deckY(x) + 0.45, z + side * 0.16);
      cards.card(F.PETUNIA, c2[0], c2[1], c2[2], a[0], a[1], a[2], 0, 0.3, 0, [0, 0.5, 0.85]);
    }
  }
}

function buildHousesBridge(g, d, cards, fr, b, plain) {
  const r = rng(77);
  const L = fr.span;
  const W = b.width;
  const hw = W / 2;
  const P = 5.5; // the piers on the quays
  const under = archCurve(L, 7.25, 1.6);
  const floor = 9.2;
  const deck = () => floor;
  stoneArch(g, L, W, under, deck, P, { under: col('#b4a892'), ring: col('#e0d3ba'), spandrel: col('#d6c3a8'), spandrelT: T.SAND, pier: col('#d2c8b8') });
  // passages through the piers for the quay streets
  for (const s of [-1, 1]) {
    const xm = s * (L / 2 + P / 2 + 0.2);
    for (const side of [1, -1]) {
      const z = side * (hw + 0.36);
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const t = (k / 8) * Math.PI;
        pts.push([xm + Math.cos(t) * 1.5 * side, STREET + 2.6 + Math.sin(t) * 1.5]);
      }
      pts.push([xm - 1.5 * side, STREET], [xm + 1.5 * side, STREET]);
      g.poly(side > 0 ? pts.reverse() : pts, [], z, T.PLAIN, col('#1c1a18'), side < 0);
    }
  }
  // the row of little houses along the top, their fronts up and down the canal
  const xe = L / 2 + P;
  const n = 5;
  const w = (2 * xe) / n;
  const reg = 'burano';
  let prev = null;
  for (let i = 0; i < n; i++) {
    const x0 = -xe + i * w;
    const o = houseOptions(reg, r, prev);
    prev = o;
    o.floors = 1 + (i % 2);
    o.ground = 3.1;
    o.shop = false;
    o.doorAt = 'none';
    o.boxes = 0.8;
    o.plain = plain;
    if (o.style === 'eave' || o.style === 'flat' || o.style === 'cornice') o.style = r() < 0.5 ? 'eave' : 'flat';
    const save = [g.ox, g.oy, g.oz, g.rx, g.rz];
    // the front facing +z (overhanging a little), and the back facing -z
    for (const side of [1, -1]) {
      const lx = side > 0 ? x0 : x0 + w;
      const [ox, , oz] = wp({ ox: save[0], oy: 0, oz: save[2], rx: save[3], rz: save[4] }, lx, 0, side * (hw + 0.5));
      const rx = side * save[3];
      const rz = side * save[4];
      g.frame(ox, floor, oz, rx, rz);
      d.frame(ox, floor, oz, rx, rz);
      house(g, d, cards, w, hw + 0.5, o);
      // timber brackets under the overhang
      for (let k = 0; k < 3; k++) {
        const bx = w * (k + 0.5) / 3;
        g.box(bx - 0.08, bx + 0.08, -0.9, -0.3, -0.6, -0.05, T.PLANK, col('#5a4632'), 'k');
      }
      g.frame(save[0], save[1], save[2], save[3], save[4]);
      d.frame(save[0], save[1], save[2], save[3], save[4]);
    }
  }
}

// ------------------------------------------------------------ all of them

export function buildBridges(sectors, quality = { tier: 'high' }) {
  for (const b of BRIDGES) {
    const fr = bridgeFrame(b);
    const g = sectors.geo(fr.x, fr.z);
    const d = sectors.det(fr.x, fr.z);
    const cards = sectors.flowers(fr.x, fr.z);
    g.frame(fr.x, 0, fr.z, fr.ax, fr.az);
    d.frame(fr.x, 0, fr.z, fr.ax, fr.az);
    if (b.kind === 'stone') buildStone(g, d, cards, fr, b);
    else if (b.kind === 'wood') buildWood(g, d, cards, fr, b);
    else buildHousesBridge(g, d, cards, fr, b, quality.tier !== 'high');
    g.identity();
    d.identity();
  }
}

// The lowest headroom under each bridge across its channel (less 2 m at
// each side), for checking the rule above.
export function bridgeClearance() {
  return BRIDGES.map((b) => {
    const fr = bridgeFrame(b);
    const L = fr.span;
    const under = b.kind === 'stone' ? archCurve(L, 7.2, 1.9) : b.kind === 'houses' ? archCurve(L, 7.25, 1.6) : (x) => 7.35 + 0.3 * (1 - (2 * x / L) ** 2);
    let min = Infinity;
    for (let x = -L / 2 + 2; x <= L / 2 - 2; x += 0.25) min = Math.min(min, under(x));
    return { id: b.id, span: +L.toFixed(1), clear: +min.toFixed(2) };
  });
}

export { WHITE };
