// Canal Town's landmarks and life: moored boats (painted rowing boats, open
// launches and long canal boats, bobbing at their lines), the church with
// its copper spire, a windmill turning over the roofs, the harbour lights
// and the floating boom across the harbour mouth, a café with a striped
// awning and bunting along the harbour front, and the town, fields and
// low hills beyond.
import * as THREE from 'three';
import { rng, clamp } from '../config.js';
import { makeNoise } from './common.js';
import { MOORED, CZ, MOUTH, BASIN, STREET, QUAY_TOP, COAST, SEA_Z, allWaterD, ringPoint, OUTER } from './canal-layout.js';
import { T, F, col, WHITE, Geo } from './canal-kit.js';
import { tube, quayLines, streetWidth, tree } from './canal-quays.js';

const noise = makeNoise(99);

// local -> world for a builder frame
const wp = (g, x, y, z) => [g.ox + x * g.rx - z * g.rz, g.oy + y, g.oz + x * g.rz + z * g.rx];

// ------------------------------------------------------------ boats

// A hull as a grid: stations along the length (bow at -L/2), each a U
// section from the keel up to the sheer. `outer` paints the outside,
// `inner` the inside.
function hull(g, L, B, D, fb, outerTile, outerC, innerTile, innerC, stern = 0.75) {
  const S = 14;
  const R = 7;
  const at = (i, j, side) => {
    const t = i / S; // 0 at the bow, 1 at the stern
    const u = j / R; // 0 at the keel, 1 at the sheer
    const bow = Math.sin((Math.min(1, t / 0.5) * Math.PI) / 2);
    const aft = t > 0.6 ? 1 - (1 - stern) * ((t - 0.6) / 0.4) ** 2 : 1;
    const hb = (B / 2) * Math.pow(bow, 0.8) * aft;
    const sheer = fb + 0.25 * (1 - t) ** 3;
    const keel = -D * (1 - 0.55 * Math.pow(Math.abs(2 * t - 1), 3));
    const y = keel + (sheer - keel) * Math.pow(u, 1.25);
    const x = side * hb * Math.pow(Math.sin((u * Math.PI) / 2), 0.55);
    return [x, y, -L / 2 + t * L];
  };
  for (const [tile, c, sgn] of [[outerTile, outerC, 1], [innerTile, innerC, -1]]) {
    for (const side of [1, -1]) {
      g.grow((S + 1) * (R + 1), S * R * 6);
      const base = g.n;
      for (let i = 0; i <= S; i++) {
        for (let j = 0; j <= R; j++) {
          const p = at(i, j, side);
          // the section's outward normal from its slope
          const a = at(i, Math.max(0, j - 1), 1);
          const b = at(i, Math.min(R, j + 1), 1);
          let nx = (b[1] - a[1]) * side;
          let ny = -(b[0] - a[0]);
          const l = Math.hypot(nx, ny) || 1;
          nx = (nx / l) * sgn;
          ny = (ny / l) * sgn;
          const inset = sgn < 0 ? 0.04 : 0;
          g.v(p[0] - side * inset, p[1] + inset * 0.5, p[2], nx, ny, 0, tile, c, p[2] / 2, p[1] / 2);
        }
      }
      for (let i = 0; i < S; i++) {
        for (let j = 0; j < R; j++) {
          const a = base + i * (R + 1) + j;
          const b = a + R + 1;
          if ((side > 0) === (sgn > 0)) {
            g.tri(a, a + 1, b);
            g.tri(a + 1, b + 1, b);
          } else {
            g.tri(a, b, a + 1);
            g.tri(a + 1, b, b + 1);
          }
        }
      }
    }
  }
  // the transom at the stern
  const tr = [];
  for (let j = 0; j <= R; j++) tr.push(at(S, j, 1));
  const pts = [...tr.map((p) => [p[0], p[1]]), ...tr.slice(1, -1).reverse().map((p) => [-p[0], p[1]])];
  g.poly(pts, [], L / 2, outerTile, outerC.map((v) => v * 0.9));
  return at;
}

// a strip along the hull on one side, facing outwards (or up for a rail top)
function sideQuad(g, side, p0, p1, p2, p3, tile, c) {
  if (side < 0) g.quad(p0, p1, p2, p3, tile, c);
  else g.quad(p1, p0, p3, p2, tile, c);
}

function rails(g, at, side, h, inset, tile, c) {
  for (let i = 0; i < 14; i++) {
    const p = at(i, 7, side);
    const q = at(i + 1, 7, side);
    sideQuad(g, side, [p[0], p[1], p[2]], [q[0], q[1], q[2]], [q[0], q[1] + h, q[2]], [p[0], p[1] + h, p[2]], tile, c);
    sideQuad(g, -side, [p[0], p[1] + h, p[2]], [q[0], q[1] + h, q[2]], [q[0] * inset, q[1] + h, q[2]], [p[0] * inset, p[1] + h, p[2]], tile, c);
  }
}

function rowBoat(g, m, r) {
  const { L, B } = m;
  const paint = col(m.colour);
  const at = hull(g, L, B, 0.42, 0.28, T.PLAIN, paint, T.PLANK, col('#c9a27e'), 0.55);
  // gunwale rails, thwarts and oars
  const wood = col('#8a6a4c');
  for (const side of [1, -1]) rails(g, at, side, 0.05, 0.9, T.PLANK, wood);
  for (const z of [-0.5, 0.45, 1.2]) g.box(-B * 0.42, B * 0.42, 0.02, 0.07, z - 0.14, z + 0.14, T.PLANK, col('#b08a66'));
  g.box(-0.03, 0.03, 0.09, 0.12, -1.4, 1.4, T.PLANK, col('#c8a57a'));
  g.box(0.18, 0.24, 0.09, 0.12, -1.3, 1.5, T.PLANK, col('#c8a57a'));
}

function sloep(g, m, r) {
  const { L, B } = m;
  const paint = col(m.colour);
  const at = hull(g, L, B, 0.55, 0.5, T.PLAIN, paint, T.PLANK, col('#b89470'), 0.8);
  const teak = col('#9a6a44');
  for (const side of [1, -1]) rails(g, at, side, 0.07, 0.88, T.PLANK, teak);
  // a floor, a U of cushioned benches round the stern and a little console
  g.box(-B * 0.36, B * 0.36, -0.18, -0.12, -L * 0.35, L * 0.42, T.PLANK, col('#c8a27a'), 'b');
  const cushion = col(pick(r, ['#f0e8d8', '#e8dcc0', '#3a4a6a', '#e0e4e8']));
  for (const side of [1, -1]) g.box(side > 0 ? B * 0.18 : -B * 0.42, side > 0 ? B * 0.42 : -B * 0.18, -0.12, 0.3, -L * 0.05, L * 0.4, T.PLAIN, cushion);
  g.box(-B * 0.42, B * 0.42, -0.12, 0.3, L * 0.3, L * 0.42, T.PLAIN, cushion);
  g.box(-0.3, 0.3, -0.12, 0.62, -L * 0.2, -L * 0.1, T.PLANK, teak);
  // a flag on the stern
  g.box(-0.02, 0.02, 0.4, 1.6, L * 0.44, L * 0.46, T.PLAIN, col('#f0ece4'));
  g.quad([0, 1.1, L * 0.46], [0, 1.1, L * 0.46 + 0.55], [0, 1.55, L * 0.46 + 0.55], [0, 1.55, L * 0.46], T.PLAIN, col('#c8202a'));
  g.quad([0, 1.1, L * 0.46 + 0.55], [0, 1.1, L * 0.46], [0, 1.55, L * 0.46], [0, 1.55, L * 0.46 + 0.55], T.PLAIN, col('#c8202a'));
}

function barge(g, m, r) {
  const { L, B } = m;
  const paint = col(m.colour);
  const at = hull(g, L, B, 0.8, 0.75, T.PLAIN, paint, T.PLAIN, col('#5a5650'), 0.85);
  // a painted band under the rail and a deck
  const band = col(pick(r, ['#c8a02a', '#b8302a', '#e8e0cc', '#2f6a4a']));
  for (const side of [1, -1]) {
    for (let i = 0; i < 14; i++) {
      const p = at(i, 7, side);
      const q = at(i + 1, 7, side);
      const o = side * 0.01;
      sideQuad(g, side, [p[0] + o, p[1] - 0.18, p[2]], [q[0] + o, q[1] - 0.18, q[2]], [q[0] + o, q[1] + 0.06, q[2]], [p[0] + o, p[1] + 0.06, p[2]], T.PLAIN, band);
    }
  }
  g.box(-B * 0.46, B * 0.46, 0.62, 0.7, -L * 0.44, L * 0.47, T.PLANK, col('#a88c6a'), 'b');
  // the long cabin with little windows, and a wheelhouse aft
  const cab = col(pick(r, ['#efe8d8', '#d8c8a8', '#2f4a3a', '#6a2a24']));
  const x0 = -B * 0.36;
  const x1 = B * 0.36;
  const z0 = -L * 0.3;
  const z1 = L * 0.18;
  g.box(x0, x1, 0.7, 1.75, z0, z1, T.PLANK, cab, 'b');
  g.box(x0 - 0.08, x1 + 0.08, 1.75, 1.85, z0 - 0.08, z1 + 0.08, T.PLANK, col('#8a6a4c'), 'b');
  for (let z = z0 + 0.8; z < z1 - 0.6; z += 1.6) {
    g.quad([x1 + 0.01, 1.05, z + 0.45], [x1 + 0.01, 1.05, z - 0.45], [x1 + 0.01, 1.55, z - 0.45], [x1 + 0.01, 1.55, z + 0.45], T.WIN_B, WHITE, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    g.quad([x0 - 0.01, 1.05, z - 0.45], [x0 - 0.01, 1.05, z + 0.45], [x0 - 0.01, 1.55, z + 0.45], [x0 - 0.01, 1.55, z - 0.45], T.WIN_B, WHITE, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  const wz0 = L * 0.26;
  const wz1 = L * 0.4;
  g.box(-B * 0.3, B * 0.3, 0.7, 2.3, wz0, wz1, T.PLANK, cab, 'b');
  g.box(-B * 0.34, B * 0.34, 2.3, 2.4, wz0 - 0.1, wz1 + 0.1, T.PLANK, col('#8a6a4c'), 'b');
  for (const x of [-B * 0.3 - 0.01]) g.quad([x, 1.5, wz0 + 0.1], [x, 1.5, wz1 - 0.1], [x, 2.1, wz1 - 0.1], [x, 2.1, wz0 + 0.1], T.WIN_B, WHITE, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  g.quad([B * 0.3 + 0.01, 1.5, wz1 - 0.1], [B * 0.3 + 0.01, 1.5, wz0 + 0.1], [B * 0.3 + 0.01, 2.1, wz0 + 0.1], [B * 0.3 + 0.01, 2.1, wz1 - 0.1], T.WIN_B, WHITE, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  g.panel(-B * 0.25, B * 0.25, 1.5, 2.1, wz0 - 0.01, T.WIN_B, WHITE);
  return { roofY: 1.85, z0, z1, x0, x1 };
}

const pick = (r, list) => list[Math.floor(r() * list.length)];

// pot plants on a boat's cabin roof (flower cards)
function roofPlants(g, cards, info, r) {
  for (let z = info.z0 + 0.6; z < info.z1 - 0.4; z += 1.4 + r() * 1.2) {
    const x = (r() - 0.5) * (info.x1 - info.x0) * 0.6;
    g.box(x - 0.2, x + 0.2, info.roofY, info.roofY + 0.28, z - 0.2, z + 0.2, T.PLAIN, col('#b5603a'), 'b');
    const c = wp(g, x, info.roofY + 0.5, z);
    const a = r() * Math.PI;
    cards.card(r() < 0.5 ? F.GERANIUM : F.IVY, c[0], c[1], c[2], Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35, 0, 0.3, 0, [0, 0.8, 0.6]);
  }
}

export function buildBoats(sectors) {
  const lines = [];
  MOORED.forEach((m, i) => {
    const r = rng(m.seed * 17 + 5 + i);
    const g = sectors.boats(m.x, m.z);
    g.bobV = [m.x, m.z, i * 1.37, 1];
    g.frame(m.x, 0.04, m.z, -m.fz, m.fx);
    if (m.kind === 'row') rowBoat(g, m, r);
    else if (m.kind === 'sloep') sloep(g, m, r);
    else {
      const info = barge(g, m, r);
      // plants ride along without bobbing (a few centimetres, nobody minds)
      const c = sectors.flowers(m.x, m.z);
      roofPlants(g, c, info, r);
    }
    // fenders against the quay
    const side = allWaterD(m.x + -m.fz * (m.B / 2 + 0.8), m.z + m.fx * (m.B / 2 + 0.8)) > allWaterD(m.x - -m.fz * (m.B / 2 + 0.8), m.z - m.fx * (m.B / 2 + 0.8)) ? 1 : -1;
    for (const z of [-m.L * 0.25, m.L * 0.2]) g.box(side * (m.B / 2 + 0.02) - 0.1, side * (m.B / 2 + 0.02) + 0.1, 0.0, 0.45, z - 0.1, z + 0.1, T.PLAIN, col(pick(r, ['#f2f2ee', '#2c4a70', '#d8402a'])));
    g.identity();
    lines.push({ m, side });
  });
  // mooring lines from bow and stern up to the quay (static)
  for (const { m, side } of lines) {
    const g = sectors.det(m.x, m.z);
    g.identity();
    const rx = -m.fz * side;
    const rz = m.fx * side;
    for (const s of [-1, 1]) {
      const ax = m.x + m.fx * s * m.L * 0.42 + rx * m.B * 0.3;
      const az = m.z + m.fz * s * m.L * 0.42 + rz * m.B * 0.3;
      const bx = ax + rx * 1.6 + m.fx * s * 1.4;
      const bz = az + rz * 1.6 + m.fz * s * 1.4;
      const y0 = m.kind === 'barge' ? 0.85 : 0.35;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      tube(g, [ax, y0, az], [mx, (y0 + QUAY_TOP) / 2 - 0.15, mz], 0.025, 0.025, 4, T.PLAIN, col('#cbb994'));
      tube(g, [mx, (y0 + QUAY_TOP) / 2 - 0.15, mz], [bx, QUAY_TOP + 0.3, bz], 0.025, 0.025, 4, T.PLAIN, col('#cbb994'));
    }
  }
}

// the floating boom across the harbour mouth: bobbing floats on a rope
export function buildBoom(sectors) {
  const z = BASIN.z1 + 0.6;
  const g = sectors.boats((MOUTH.x0 + MOUTH.x1) / 2, z);
  let k = 0;
  for (let x = MOUTH.x0 + 3; x <= MOUTH.x1 - 3; x += 1.5) {
    g.bobV = [x, z, k * 0.9, 1];
    g.identity();
    const c = col(k % 2 ? '#f4f2ea' : '#f08a1a');
    g.lathe(x, z, [[0.001, -0.25], [0.25, -0.2], [0.3, 0.05], [0.25, 0.28], [0.001, 0.32]], 8, T.PLAIN, c);
    k++;
  }
  g.bobV = [0, 0, 0, 0];
  tube(g, [MOUTH.x0 + 1, 0.12, z], [MOUTH.x1 - 1, 0.12, z], 0.03, 0.03, 4, T.PLAIN, col('#e8dcc0'));
}

// ------------------------------------------------------------ landmarks

function church(g, d, cards, x, z) {
  const brick = WHITE;
  const sand = col('#e4d8c0');
  // the tower (west end), square, brick with sandstone corners
  const tw = 8.5;
  const th = 31;
  g.frame(x, STREET, z, 1, 0);
  g.box(-tw / 2, tw / 2, -0.4, th, -tw / 2, tw / 2, T.BRICK, brick, 'b');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * tw / 2 - 0.35, sx * tw / 2 + 0.35, -0.4, th, sz * tw / 2 - 0.35, sz * tw / 2 + 0.35, T.SAND, sand, 'b');
  // belfry openings and clocks on all four sides
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const cx = Math.sin(a);
    const cz = Math.cos(a);
    g.frame(x + cx * (tw / 2 + 0.01), STREET, z + cz * (tw / 2 + 0.01), cz, -cx);
    g.panel(-1.4, -0.3, 23.5, 28.5, 0, T.WIN_B, col('#4a4a44'));
    g.panel(0.3, 1.4, 23.5, 28.5, 0, T.WIN_B, col('#4a4a44'));
    g.panel(-0.7, 0.7, 4, 9, 0, T.WIN_A, WHITE);
    g.panel(-1.2, 1.2, 0, 3.4, 0, T.DOOR_B, col('#3a2a20'));
    g.box(-1.5, 1.5, 17, 20, 0, 0.12, T.SAND, sand, 'k');
    const cp = wp(g, 0, 18.5, 0.14);
    const save = [g.ox, g.oy, g.oz, g.rx, g.rz];
    g.identity();
    // clock face: a white disc with gold hands
    const n = 16;
    const base = g.n;
    g.grow(n + 1, n * 3);
    const nx = cx;
    const nz = cz;
    g.v(cp[0], cp[1], cp[2], nx, 0, nz, T.PLAIN, col('#f4f0e6'));
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const lx = Math.cos(t) * 1.2;
      const ly = Math.sin(t) * 1.2;
      g.v(cp[0] + lx * cz, cp[1] + ly, cp[2] - lx * cx, nx, 0, nz, T.PLAIN, col('#f4f0e6'));
    }
    for (let i = 0; i < n; i++) g.tri(base, base + 1 + i, base + 1 + ((i + 1) % n));
    g.frame(save[0], save[1], save[2], save[3], save[4]);
    g.box(-0.06, 0.06, 18.4, 19.4, 0.13, 0.17, T.PLAIN, col('#c8a24a'));
    g.box(-0.06, 0.8, 18.44, 18.56, 0.13, 0.17, T.PLAIN, col('#c8a24a'));
  }
  g.frame(x, STREET, z, 1, 0);
  // cornice and a balustrade at the top of the tower
  g.box(-tw / 2 - 0.5, tw / 2 + 0.5, th, th + 0.5, -tw / 2 - 0.5, tw / 2 + 0.5, T.SAND, sand);
  // octagonal lantern, copper cupola and spire (lathes round the tower's axis)
  g.identity();
  const y = STREET + th + 0.5;
  g.lathe(x, z, [[3.3, y], [3.3, y + 6.5], [3.6, y + 6.6], [3.6, y + 7.2]], 8, T.SAND, sand, 0, 4);
  // dark arched openings on the lantern
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * Math.PI * 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    g.frame(x + cx * 3.1, y, z + cz * 3.1, -cz, cx);
    g.panel(-0.7, 0.7, 1.2, 5, 0, T.WIN_B, col('#3a3a36'));
    g.identity();
  }
  const yc = y + 7.2;
  g.lathe(x, z, [[3.4, yc], [3.3, yc + 1.2], [2.6, yc + 2.8], [1.2, yc + 4.2], [0.9, yc + 4.6], [0.9, yc + 5.4], [1.4, yc + 5.6], [0.5, yc + 7.5], [0.28, yc + 12], [0.12, yc + 19], [0.03, yc + 22]], 8, T.COPPER, WHITE, 0, 4);
  // a gilded ball and a weathercock
  g.lathe(x, z, [[0.001, yc + 21.6], [0.32, yc + 21.9], [0.001, yc + 22.3]], 8, T.PLAIN, col('#d8b050'));
  g.frame(x, yc + 22.3, z, 1, 0);
  g.box(-0.03, 0.03, 0, 1.2, -0.03, 0.03, T.PLAIN, col('#d8b050'));
  g.box(-0.6, 0.6, 0.8, 1.2, -0.02, 0.02, T.PLAIN, col('#d8b050'));
  // the nave east of the tower: brick walls, tall windows, a steep slate roof
  const nl = 34;
  const nw = 14;
  const nh = 14;
  g.frame(x + tw / 2, STREET, z, 1, 0);
  g.box(0, nl, -0.4, nh, -nw / 2, nw / 2, T.BRICK, brick, 'bl');
  const roofC = col('#6e747a');
  g.quad([0, nh, nw / 2 + 0.4], [nl + 0.4, nh, nw / 2 + 0.4], [nl + 0.4, nh + 9, 0], [0, nh + 9, 0], T.ROOF, roofC);
  g.quad([nl + 0.4, nh, -nw / 2 - 0.4], [0, nh, -nw / 2 - 0.4], [0, nh + 9, 0], [nl + 0.4, nh + 9, 0], T.ROOF, roofC);
  g.tri3([nl, nh, nw / 2], [nl, nh, -nw / 2], [nl, nh + 9, 0], T.BRICK, brick);
  for (let k = 0; k < 5; k++) {
    const wx = 4 + k * 6.5;
    g.panel(wx - 1, wx + 1, 4, 11.5, nw / 2 + 0.01, T.WIN_A, col('#d8d0c0'));
    g.quad([wx + 1, 4, -nw / 2 - 0.01], [wx - 1, 4, -nw / 2 - 0.01], [wx - 1, 11.5, -nw / 2 - 0.01], [wx + 1, 11.5, -nw / 2 - 0.01], T.WIN_A, col('#d8d0c0'), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    // buttresses
    for (const s of [1, -1]) g.box(wx + 2.3, wx + 3.2, -0.4, 9, s > 0 ? nw / 2 : -nw / 2 - 1, s > 0 ? nw / 2 + 1 : -nw / 2, T.BRICK, brick, 'b');
  }
  g.identity();
  // lime trees round the church square
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.3;
    const tx = x + 14 + Math.cos(a) * 30;
    const tz = z + Math.sin(a) * 22;
    tree(g, cards, tx, STREET, tz, 900 + k, 1.05);
  }
  g.identity();
}

function windmill(g, x, z) {
  const tar = col('#4a4640');
  const white = col('#f0ede6');
  g.identity();
  const y = STREET;
  // a brick base, then the tapering octagonal body
  g.lathe(x, z, [[6.2, y - 0.3], [6.2, y + 5], [5.9, y + 5.2]], 8, T.BRICK, WHITE, 0, 6);
  g.lathe(x, z, [[5.2, y + 5.2], [4.1, y + 15], [3.8, y + 17]], 8, T.PLANK, tar, 0, 5);
  // the stage (a gallery round the mill) with a rail
  g.lathe(x, z, [[5.2, y + 5], [7.6, y + 5], [7.6, y + 5.25], [5.2, y + 5.25]], 12, T.PLANK, col('#6a5642'));
  g.lathe(x, z, [[7.5, y + 5.25], [7.5, y + 6.3], [7.4, y + 6.3], [7.4, y + 5.25]], 12, T.PLANK, col('#e8e4dc'));
  // windows and a door
  for (const a of [0.3, 2.1, 4.0]) {
    g.frame(x + Math.cos(a) * 4.7, y, z + Math.sin(a) * 4.7, -Math.sin(a), Math.cos(a));
    g.panel(-0.45, 0.45, 9, 10.3, 0.05, T.WIN_B, white);
    g.identity();
  }
  // the cap: a boat-shaped roof
  g.lathe(x, z, [[4.2, y + 17], [4.3, y + 17.6], [3.2, y + 19.6], [1.6, y + 20.8], [0.001, y + 21.2]], 10, T.PLANK, col('#3a342e'));
  const hubY = y + 18.6;
  return { x, y: hubY, z };
}

// the four sails of the mill: a separate mesh that turns in update()
function millSails(K) {
  const g = new Geo();
  const wood = col('#e8e4dc');
  const cloth = col('#e9e2d2');
  g.identity();
  g.lathe(0, 0, [[0.001, -0.6], [0.5, -0.5], [0.5, 0.4], [0.001, 0.5]], 8, T.PLANK, col('#5a4632'));
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // along the sail: (c, s) in the x-y plane; the sail faces +z (the wind)
    const P = (u, v, w = 0) => [c * u - s * v, s * u + c * v, w];
    // the stock
    tube(g, P(0.4, 0), P(12, 0), 0.16, 0.1, 5, T.PLANK, wood);
    // the lattice and its cloth
    const u0 = 2.4;
    const u1 = 11.6;
    for (let u = u0; u <= u1 + 0.01; u += 1.15) tube(g, P(u, -0.1, 0.12), P(u, 2.1, 0.12), 0.035, 0.035, 4, T.PLANK, wood);
    for (const v of [0.7, 1.4, 2.1]) tube(g, P(u0, v, 0.12), P(u1, v, 0.12), 0.03, 0.03, 4, T.PLANK, wood);
    g.quad(P(u0, 0.1, 0.06), P(u1, 0.1, 0.06), P(u1, 2.05, 0.06), P(u0, 2.05, 0.06), T.PLAIN, cloth);
    g.quad(P(u1, 0.1, 0.05), P(u0, 0.1, 0.05), P(u0, 2.05, 0.05), P(u1, 2.05, 0.05), T.PLAIN, cloth.map((v) => v * 0.8));
  }
  const m = new THREE.Mesh(g.geometry(), K.town);
  m.castShadow = true;
  m.receiveShadow = true;
  m.name = 'mill sails';
  return m;
}

function lighthouse(g, x, z, main) {
  g.identity();
  const y = STREET;
  const white = col('#f2f0ea');
  const band = main ? col('#c8302a') : col('#2f7a3a');
  const h = main ? 12 : 6.5;
  const r0 = main ? 2.3 : 1.2;
  g.lathe(x, z, [[r0 + 1.3, y - 0.3], [r0 + 1.3, y + 0.9], [r0 + 1.1, y + 1.1]], 16, T.STONE, col('#d0c8b8'));
  g.lathe(x, z, [[r0, y + 1.1], [r0 * 0.78, y + h * 0.55]], 16, T.PLAIN, white);
  g.lathe(x, z, [[r0 * 0.78, y + h * 0.55], [r0 * 0.7, y + h * 0.8]], 16, T.PLAIN, band);
  g.lathe(x, z, [[r0 * 0.7, y + h * 0.8], [r0 * 0.66, y + h]], 16, T.PLAIN, white);
  // gallery, lantern and cap
  g.lathe(x, z, [[r0 * 0.66, y + h], [r0 * 0.66 + 0.6, y + h], [r0 * 0.66 + 0.6, y + h + 0.2], [0.001, y + h + 0.2]], 16, T.PLAIN, col('#3a3a36'));
  g.lathe(x, z, [[r0 * 0.66 + 0.55, y + h + 0.2], [r0 * 0.66 + 0.55, y + h + 1.1]], 16, T.PLAIN, col('#2a2a28'));
  const lr = main ? 1.1 : 0.6;
  g.lathe(x, z, [[lr, y + h + 0.2], [lr, y + h + 1.9]], 12, T.GLOW, main ? col('#6a4a22') : col('#2a5a2a'));
  g.lathe(x, z, [[lr + 0.15, y + h + 1.9], [lr * 0.4, y + h + 2.6], [0.05, y + h + 3.1]], 12, T.PLAIN, band);
  // a door and two little windows up the tower
  g.frame(x, y, z + r0 * 0.99, 1, 0);
  if (main) {
    g.panel(-0.5, 0.5, 1.1, 3.2, 0.02, T.DOOR_A, col('#2c4a70'));
    g.panel(-0.3, 0.3, 5.5, 6.6, -0.18, T.WIN_B, WHITE);
  }
  g.identity();
}

// a striped café awning along a facade line, tables and parasols in front
function cafe(g, d, x0, x1, zf) {
  // the awning: striped strips sloping out from the facades over the cobbles
  const top = STREET + 4.0;
  const low = STREET + 3.0;
  const out = 3.0;
  const w = 0.45;
  let k = 0;
  g.identity();
  for (let x = x0; x < x1 - 0.01; x += w) {
    const c = col(k++ % 2 ? '#f2eee4' : '#c8302a');
    const xb = Math.min(x + w, x1);
    g.quad([x, low, zf + out], [xb, low, zf + out], [xb, top, zf + 0.05], [x, top, zf + 0.05], T.PLAIN, c);
    g.quad([xb, low, zf + out], [x, low, zf + out], [x, top, zf + 0.05], [xb, top, zf + 0.05], T.PLAIN, c.map((v) => v * 0.7));
    // the scalloped valance
    g.quad([x, low - 0.3, zf + out], [xb, low - 0.3, zf + out], [xb, low, zf + out], [x, low, zf + out], T.PLAIN, c);
    g.quad([xb, low - 0.3, zf + out], [x, low - 0.3, zf + out], [x, low, zf + out], [xb, low, zf + out], T.PLAIN, c);
  }
  // round tables with chairs, under parasols
  const r = rng(12);
  for (let x = x0 + 2; x < x1 - 1; x += 3.2) {
    const tz = zf + 4.8 + (r() - 0.5) * 0.8;
    d.identity();
    d.lathe(x, tz, [[0.3, STREET], [0.05, STREET + 0.05], [0.04, STREET + 0.72], [0.4, STREET + 0.74], [0.4, STREET + 0.78], [0.001, STREET + 0.78]], 10, T.PLAIN, col('#3a3a36'));
    for (const s of [-1, 1]) {
      d.frame(x + s * 0.7, STREET, tz, 1, 0);
      d.box(-0.22, 0.22, 0.44, 0.48, -0.22, 0.22, T.PLANK, col('#8a5a3a'));
      d.box(s > 0 ? 0.18 : -0.22, s > 0 ? 0.22 : -0.18, 0.48, 0.95, -0.2, 0.2, T.PLANK, col('#8a5a3a'));
      for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) d.box(lx - 0.02, lx + 0.02, 0, 0.44, lz - 0.02, lz + 0.02, T.PLAIN, col('#2a2a28'));
    }
    d.identity();
    if (r() < 0.6) {
      const pc = col(pick(r, ['#f2eee4', '#c8302a', '#2c4a70', '#e8d8a8']));
      g.lathe(x, tz, [[0.03, STREET + 0.78], [0.03, STREET + 2.3]], 5, T.PLAIN, col('#e8e4dc'));
      g.lathe(x, tz, [[0.001, STREET + 2.9], [1.5, STREET + 2.25], [1.5, STREET + 2.18], [0.001, STREET + 2.5]], 10, T.PLAIN, pc);
    }
  }
}

// strings of little flags between the lamps along the harbour front
function bunting(g, lamps) {
  const cols = ['#d8302a', '#f2c230', '#2c6ab0', '#f2eee4', '#3a9a4a', '#e87a2a'].map((h) => col(h));
  const front = lamps.filter((l) => Math.abs(l.z - (CZ - 1)) < 1.5).sort((a, b) => a.x - b.x);
  g.identity();
  let k = 0;
  for (let i = 0; i < front.length - 1; i++) {
    const a = front[i];
    const b = front[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len > 30) continue;
    const n = Math.floor(len / 0.55);
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = STREET + 4.3 - Math.sin(t * Math.PI) * 0.9;
      const dx = ((b.x - a.x) / len) * 0.17;
      const dz = ((b.z - a.z) / len) * 0.17;
      const c = cols[k++ % cols.length];
      g.tri3([x - dx, y, z - dz], [x + dx, y, z + dz], [x, y - 0.32, z], T.PLAIN, c);
      g.tri3([x + dx, y, z + dz], [x - dx, y, z - dz], [x, y - 0.32, z], T.PLAIN, c);
    }
    const m = 12;
    for (let j = 0; j < m; j++) {
      const t0 = j / m;
      const t1 = (j + 1) / m;
      const p = (t) => [a.x + (b.x - a.x) * t, STREET + 4.3 - Math.sin(t * Math.PI) * 0.9, a.z + (b.z - a.z) * t];
      tube(g, p(t0), p(t1), 0.012, 0.012, 3, T.PLAIN, col('#e8e4dc'));
    }
  }
}

// ------------------------------------------------------------ far away

// The land round the town: a wide ring of ground (roofs of the rest of the
// town, then fields, trees and low hills) with the sea opening to the south.
function farLand(quality) {
  const low = quality.tier === 'low';
  const segA = low ? 120 : 200;
  // rings start just inside the terrain's edge (tucked under it) and spread out
  const offs = [-12, 25, 70, 140, 240, 380, 560, 800, 1100, 1500, 2000, 2700, 3700, 5200];
  const inner = (a) => Math.min(400 / Math.max(1e-3, Math.abs(Math.cos(a))), 300 / Math.max(1e-3, Math.abs(Math.sin(a))));
  const pos = [];
  const colr = [];
  const idx = [];
  const town = new THREE.Color('#7d756a');
  const field = new THREE.Color('#6a7a3c');
  const field2 = new THREE.Color('#8a8a48');
  const wood = new THREE.Color('#2f4424');
  const c = new THREE.Color();
  const seaA = (x, z) => {
    // the sea: south of the breakwater between the two coasts, opening out
    if (z < SEA_Z - 30) return false;
    const spread = COAST + Math.max(0, z - 330) * 0.9;
    return Math.abs(x) < spread;
  };
  const H = (x, z, r) => {
    const n = noise.fbm(x * 0.0012 + 3, z * 0.0012, 4);
    return 1.2 + Math.max(0, r - 1000) * 0.016 * (0.6 + n) + Math.max(0, r - 2400) * 0.03 * (0.5 + n);
  };
  for (let i = 0; i <= segA; i++) {
    const a = (i / segA) * Math.PI * 2;
    const rin = inner(a);
    for (let j = 0; j < offs.length; j++) {
      const r = rin + offs[j] * (j > 1 ? 1 + 0.05 * noise.noise(a * 5, j) : 1);
      let x = Math.cos(a) * r;
      let z = Math.sin(a) * r;
      // inside the terrain box: tuck under it
      const inside = Math.abs(x) < 399 && z > -309 && z < 299;
      let y = H(x, z, r);
      if (seaA(x, z)) y = -18;
      if (inside) y = Math.min(y, 1.0);
      pos.push(x, y, z);
      const n = noise.fbm(x * 0.004, z * 0.004, 3);
      if (r - rin < 400) c.copy(town).lerp(field, smooth01((r - rin - 150) / 250));
      else c.copy(field).lerp(field2, clamp(n + 0.5, 0, 1)).lerp(wood, clamp(noise.noise(x * 0.003 + 7, z * 0.003) * 1.5, 0, 0.8));
      if (y < 0) c.set('#3a4a50');
      colr.push(c.r, c.g, c.b);
    }
  }
  const R = offs.length;
  for (let i = 0; i < segA; i++) {
    for (let j = 0; j < R - 1; j++) {
      const a = i * R + j;
      const b = a + R;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = false;
  m.name = 'far land';
  return { mesh: m, seaA, H };
}

const smooth01 = (t) => {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};

// the rest of the town beyond the terrain: simple houses and trees, instanced
function farTown(quality, seaA) {
  const r = rng(404);
  const low = quality.tier === 'low';
  const houses = [];
  const trees = [];
  const nH = low ? 350 : quality.tier === 'medium' ? 600 : 900;
  let tries = 0;
  while (houses.length < nH && tries++ < 20000) {
    const a = r() * Math.PI * 2;
    const rr = 440 + Math.pow(r(), 1.6) * 520;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    if ((Math.abs(x) < 405 && z > -315 && z < 305) || seaA(x, z) || seaA(x, z - 40)) continue;
    const ang = Math.round(a / (Math.PI / 2)) * (Math.PI / 2) + (r() - 0.5) * 0.2;
    houses.push({ x, y: 1.2, z, ry: ang, sx: 5 + r() * 4, sy: 10 + r() * 6, sz: 9 + r() * 3 });
  }
  tries = 0;
  while (trees.length < (low ? 200 : quality.tier === 'medium' ? 350 : 500) && tries++ < 20000) {
    const a = r() * Math.PI * 2;
    const rr = 450 + Math.pow(r(), 1.2) * 1400;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    if ((Math.abs(x) < 405 && z > -315 && z < 305) || seaA(x, z) || seaA(x, z - 40)) continue;
    trees.push({ x, y: 1.2, z, s: 5 + r() * 4, sy: 1 + r() * 0.5 });
  }
  // a house: box walls with a pitched roof, unit size (scaled per instance)
  const wall = new THREE.BoxGeometry(1, 1, 1);
  wall.translate(0, 0.5, 0);
  const roof = new THREE.BufferGeometry();
  const rp = [
    -0.55, 1, -0.52, 0, 1.55, -0.52, 0, 1.55, 0.52, -0.55, 1, -0.52, 0, 1.55, 0.52, -0.55, 1, 0.52,
    0.55, 1, 0.52, 0, 1.55, 0.52, 0, 1.55, -0.52, 0.55, 1, 0.52, 0, 1.55, -0.52, 0.55, 1, -0.52,
    -0.5, 1, 0.5, 0, 1.55, 0.5, 0.5, 1, 0.5, 0.5, 1, -0.5, 0, 1.55, -0.5, -0.5, 1, -0.5,
  ];
  roof.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  const pos = [];
  const cols = [];
  for (const [g, c] of [[wall, [0.85, 0.8, 0.72]], [roof, [0.62, 0.3, 0.2]]]) {
    const gi = g.index ? g.toNonIndexed() : g;
    const p = gi.attributes.position;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      cols.push(...c);
    }
  }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  hg.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(hg, mat, houses.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pal = ['#efe6d4', '#e0b060', '#c86a4a', '#d8d0c4', '#8fb0c8', '#e8c8a8', '#b8c8a8'].map((h) => new THREE.Color(h));
  const cc = new THREE.Color();
  houses.forEach((h, i) => {
    e.set(0, h.ry, 0);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(h.x, h.y, h.z), q, new THREE.Vector3(h.sx, h.sy, h.sz));
    mesh.setMatrixAt(i, m4);
    cc.copy(pal[i % pal.length]).multiplyScalar(0.85 + r() * 0.2);
    mesh.setColorAt(i, cc);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = 'far town';
  const tg = new THREE.IcosahedronGeometry(1, 0);
  tg.translate(0, 1.4, 0);
  const tmat = new THREE.MeshStandardMaterial({ color: 0x3a5228, roughness: 0.95 });
  const tm = new THREE.InstancedMesh(tg, tmat, trees.length);
  trees.forEach((t, i) => {
    m4.compose(new THREE.Vector3(t.x, t.y, t.z), q.identity(), new THREE.Vector3(t.s, t.s * t.sy, t.s));
    tm.setMatrixAt(i, m4);
  });
  tm.instanceMatrix.needsUpdate = true;
  tm.computeBoundingSphere();
  tm.name = 'far trees';
  return [mesh, tm];
}

// ------------------------------------------------------------ all of it

export const CHURCH = { x: -34, z: -24 };
export const MILL = (() => ringPoint(OUTER.r + 70, -0.95))();
export const CAFE = { x0: 8, x1: 44 };

// is (x, z) somewhere kept free of houses? (the café needs none, but the
// church square and the windmill do)
export function keepClear(x, z) {
  return Math.hypot(x - MILL.x, z - MILL.z) < 16;
}

export function buildProps(sectors, K, quality, lamps) {
  const extra = [];
  buildBoats(sectors);
  buildBoom(sectors);
  church(sectors.geo(CHURCH.x, CHURCH.z), sectors.det(CHURCH.x, CHURCH.z), sectors.cards(CHURCH.x, CHURCH.z), CHURCH.x, CHURCH.z);
  const hub = windmill(sectors.geo(MILL.x, MILL.z), MILL.x, MILL.z);
  const sails = millSails(K);
  // face the sails south-east, towards the canals
  const face = Math.atan2(-MILL.x, CZ - MILL.z);
  const pivot = new THREE.Group();
  pivot.position.set(hub.x + Math.sin(face) * 4.6, hub.y, hub.z + Math.cos(face) * 4.6);
  pivot.rotation.y = face;
  pivot.rotation.x = -0.12;
  pivot.add(sails);
  extra.push(pivot);
  lighthouse(sectors.geo(MOUTH.x0 - 7, BASIN.z1 + 7), MOUTH.x0 - 7, BASIN.z1 + 7, true);
  lighthouse(sectors.geo(MOUTH.x1 + 6, BASIN.z1 + 6), MOUTH.x1 + 6, BASIN.z1 + 6, false);
  const zf = CZ - streetWidth({ x: 0, z: CZ, nz: -1 });
  cafe(sectors.geo((CAFE.x0 + CAFE.x1) / 2, zf), sectors.det((CAFE.x0 + CAFE.x1) / 2, zf), CAFE.x0, CAFE.x1, zf);
  bunting(sectors.det(0, CZ), lamps);
  for (const s of sectors.map.values()) s.geo.identity();
  for (const s of sectors.detail.values()) s.geo.identity();
  const far = farLand(quality);
  extra.push(far.mesh, ...farTown(quality, far.seaA));
  return {
    extra,
    update(dt, t) {
      sails.rotation.z = -t * 0.35;
    },
  };
}

export { quayLines, allWaterD };
