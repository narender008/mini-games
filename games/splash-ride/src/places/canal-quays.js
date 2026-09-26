// Canal Town's quays: the waterline traced out of the plan (marching
// squares over the water's distance field, smoothed and resampled every
// metre), then built as dressed-stone quay walls with a coping, green and
// wet at the waterline, cobbled quay streets behind, iron bollards, green
// lamp posts and lime trees; towards the sea a rubble slope and a parapet
// along the breakwater.
import * as THREE from 'three';
import { rng, clamp } from '../config.js';
import { rockGeometry, instances, makeNoise } from './common.js';
import { allWaterD, waterD, seaD, nearBridge, CZ, BASIN, COAST, QUAY_TOP, MOORED } from './canal-layout.js';
import { T, L, col, WHITE } from './canal-kit.js';

const noise = makeNoise(88);

// ------------------------------------------------------------ the waterline

const GRID = { x0: -420, x1: 420, z0: -300, z1: 330, c: 1.25 };

function march() {
  const { x0, z0, c } = GRID;
  const W = Math.round((GRID.x1 - x0) / c) + 1;
  const H = Math.round((GRID.z1 - z0) / c) + 1;
  const f = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) f[j * W + i] = allWaterD(x0 + i * c, z0 + j * c);
  const pts = new Map();
  const at = (id) => {
    let p = pts.get(id);
    if (p) return p;
    const k = id >> 1;
    const i = k % W;
    const j = (k - i) / W;
    const a = f[k];
    const b = id & 1 ? f[k + W] : f[k + 1];
    const t = a / (a - b);
    p = id & 1 ? [x0 + i * c, z0 + (j + t) * c] : [x0 + (i + t) * c, z0 + j * c];
    pts.set(id, p);
    return p;
  };
  const segs = [];
  const adj = new Map();
  const add = (e1, e2) => {
    const s = segs.length;
    segs.push([e1, e2]);
    for (const e of [e1, e2]) {
      const l = adj.get(e);
      if (l) l.push(s);
      else adj.set(e, [s]);
    }
  };
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const k = j * W + i;
      const a = f[k] < 0;
      const b = f[k + 1] < 0;
      const cc = f[k + W + 1] < 0;
      const d = f[k + W] < 0;
      const code = a | (b << 1) | (cc << 2) | (d << 3);
      if (code === 0 || code === 15) continue;
      const e0 = k * 2;
      const e1 = (k + 1) * 2 + 1;
      const e2 = (k + W) * 2;
      const e3 = k * 2 + 1;
      const mid = (f[k] + f[k + 1] + f[k + W] + f[k + W + 1]) / 4 < 0;
      switch (code) {
        case 1: case 14: add(e3, e0); break;
        case 2: case 13: add(e0, e1); break;
        case 3: case 12: add(e3, e1); break;
        case 4: case 11: add(e1, e2); break;
        case 6: case 9: add(e0, e2); break;
        case 7: case 8: add(e3, e2); break;
        case 5:
          if (mid) { add(e0, e1); add(e2, e3); } else { add(e3, e0); add(e1, e2); }
          break;
        case 10:
          if (mid) { add(e3, e0); add(e1, e2); } else { add(e0, e1); add(e2, e3); }
          break;
      }
    }
  }
  // walk the segments into chains
  const used = new Uint8Array(segs.length);
  const chains = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const ids = [segs[s0][0], segs[s0][1]];
    // extend forwards, then backwards
    for (let dir = 0; dir < 2; dir++) {
      for (;;) {
        const end = ids[ids.length - 1];
        const next = (adj.get(end) || []).find((s) => !used[s]);
        if (next === undefined) break;
        used[next] = 1;
        const [a, b] = segs[next];
        ids.push(a === end ? b : a);
      }
      ids.reverse();
    }
    const closed = ids.length > 3 && ids[0] === ids[ids.length - 1];
    if (closed) ids.pop();
    if (ids.length < 6) continue;
    chains.push({ pts: ids.map(at), closed });
  }
  return chains;
}

function grad(x, z) {
  const e = 0.3;
  const gx = allWaterD(x + e, z) - allWaterD(x - e, z);
  const gz = allWaterD(x, z + e) - allWaterD(x, z - e);
  const l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l, l / (2 * e)];
}

// resample at even spacing, smooth, pull back onto the waterline
function refine(chain, step = 1) {
  const src = chain.pts;
  const n = src.length;
  const out = [];
  let carry = 0;
  const segCount = chain.closed ? n : n - 1;
  out.push(src[0]);
  for (let i = 0; i < segCount; i++) {
    const a = src[i];
    const b = src[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - carry;
    while (t <= len) {
      out.push([a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len]);
      t += step;
    }
    carry = len - (t - step);
  }
  if (chain.closed && out.length > 2) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < step * 0.5) out.pop();
  }
  let pts = out;
  for (let pass = 0; pass < 3; pass++) {
    const m = pts.length;
    pts = pts.map((p, i) => {
      if (!chain.closed && (i === 0 || i === m - 1)) return p;
      const a = pts[(i - 1 + m) % m];
      const b = pts[(i + 1) % m];
      return [p[0] * 0.5 + (a[0] + b[0]) * 0.25, p[1] * 0.5 + (a[1] + b[1]) * 0.25];
    });
  }
  const res = pts.map(([x, z]) => {
    for (let k = 0; k < 2; k++) {
      const f = allWaterD(x, z);
      const [gx, gz, gl] = grad(x, z);
      x -= (f / gl) * gx;
      z -= (f / gl) * gz;
    }
    const [nx, nz] = grad(x, z);
    return { x, z, nx, nz };
  });
  // orient so that, seen from the water, the chain runs left to right
  let s = 0;
  for (let i = 0; i < res.length - 1; i++) {
    const dx = res[i + 1].x - res[i].x;
    const dz = res[i + 1].z - res[i].z;
    s += dx * -res[i].nz + dz * res[i].nx;
  }
  if (s < 0) res.reverse();
  let acc = 0;
  res.forEach((p, i) => {
    if (i) acc += Math.hypot(p.x - res[i - 1].x, p.z - res[i - 1].z);
    p.s = acc;
    // which water lies in front: the canals and basin, or the open sea
    const wx = p.x - p.nx * 3;
    const wz = p.z - p.nz * 3;
    p.sea = wz > 230 && seaD(wx, wz) < waterD(wx, wz);
  });
  return { pts: res, closed: chain.closed };
}

let LINES = null;

// The waterline as smooth chains of points { x, z, nx, nz (towards land), s, sea }
export function quayLines() {
  if (!LINES) LINES = march().map((c) => refine(c, 2)).filter((c) => c.pts.length > 8);
  return LINES;
}

// How wide the quay street is in front of the houses here.
export function streetWidth(p) {
  if (p.z > 247) return 9.5; // the breakwater top
  if (Math.abs(p.z - CZ) < 6 && p.nz < -0.8) return 12; // the harbour front
  if (p.z > CZ + 5 && Math.abs(Math.abs(p.x) - BASIN.x1) < 6) return 9; // the basin's side quays
  return 7.5;
}

// ------------------------------------------------------------ building

const STONE_COLS = [col('#e6e0d6'), col('#d8d2c8'), col('#ece6dc')];
const ALGAE = col('#3b4a2a');
const WET = col('#6e6c62');
const DRY = [0.97, 0.95, 0.9];

// a tapered tube between two world points (identity frame)
export function tube(geo, p0, p1, r0, r1, seg, tile, c) {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const dz = p1[2] - p0[2];
  const len = Math.hypot(dx, dy, dz);
  const ax = [dx / len, dy / len, dz / len];
  // a perpendicular pair round the axis
  const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let ux = [ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]];
  const l = Math.hypot(ux[0], ux[1], ux[2]);
  ux = ux.map((v) => v / l);
  const uz = [ax[1] * ux[2] - ax[2] * ux[1], ax[2] * ux[0] - ax[0] * ux[2], ax[0] * ux[1] - ax[1] * ux[0]];
  geo.grow((seg + 1) * 2, seg * 6);
  const base = geo.n;
  for (const [p, r, v] of [[p0, r0, 0], [p1, r1, len]]) {
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const cx = Math.cos(t);
      const sx = Math.sin(t);
      const nx = ux[0] * cx + uz[0] * sx;
      const ny = ux[1] * cx + uz[1] * sx;
      const nz = ux[2] * cx + uz[2] * sx;
      geo.v(p[0] + nx * r, p[1] + ny * r, p[2] + nz * r, nx, ny, nz, tile, c, i / seg, v / 1.5);
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = base + i;
    const b = base + seg + 1 + i;
    geo.tri(a, a + 1, b);
    geo.tri(a + 1, b + 1, b);
  }
}

// A street lime: a clear, slightly leaning trunk that forks at about three
// metres into three or four limbs, each bending up and throwing out side
// branches; the crown is clumps of leaf-spray cards at the branch ends (so
// its outline is lumpy and the sky shows through near the edge), dark,
// dense cards in its heart so it never looks hollow, and normals bent out
// from the crown's middle so it shades like one soft volume. The cards
// sway more the higher they are. `lod` < 1 (medium and low quality) builds
// fewer, larger cards and fewer twigs.
const TAU = Math.PI * 2;
const add = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];
const dirOf = (tilt, a) => [Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a)];

export function tree(geo, cards, x, y, z, seed, scale = 1, lod = 1) {
  const r = rng(seed);
  const s = scale * (0.92 + r() * 0.28);
  const bark = col('#aaa498', 0.95 + r() * 0.1);
  // the trunk, flared at the foot
  const hf = (2.9 + r() * 0.8) * s;
  const lx = (r() - 0.5) * 0.4 * s;
  const lz = (r() - 0.5) * 0.4 * s;
  const foot = [x + lx * 0.1, y + 0.6, z + lz * 0.1];
  const F = [x + lx, y + hf, z + lz];
  tube(geo, [x, y - 0.25, z], foot, 0.44 * s, 0.3 * s, 8, T.BARK, bark);
  tube(geo, foot, F, 0.3 * s, 0.22 * s, 8, T.BARK, bark);
  const C = [F[0], y + hf + 4.7 * s, F[2]]; // the middle of the crown
  const RX = 4.7 * s;
  const RY = 4.9 * s;
  const clumps = [];
  const nl = 3 + (r() < 0.55 ? 1 : 0);
  const a0 = r() * TAU;
  for (let i = 0; i < nl; i++) {
    const a = a0 + (i / nl) * TAU + (r() - 0.5) * 0.7;
    const tilt = 0.42 + r() * 0.32;
    const len = (5.4 + r() * 1.6) * s;
    const M = add(F, dirOf(tilt, a), len * 0.5);
    const Tp = add(M, dirOf(tilt * 0.55, a + (r() - 0.5) * 0.5), len * 0.5);
    tube(geo, F, M, 0.17 * s, 0.11 * s, 6, T.BARK, bark);
    tube(geo, M, Tp, 0.11 * s, 0.04 * s, 5, T.BARK, bark);
    clumps.push({ p: Tp, r: (1.8 + r() * 0.4) * s });
    // side branches off the limb, reaching out and a little up
    for (const side of lod < 1 ? [i % 2 ? -1 : 1] : [-1, 1]) {
      const from = add(F, dirOf(tilt, a), len * (0.35 + r() * 0.25));
      const end = add(from, dirOf(tilt + 0.35 + r() * 0.35, a + side * (0.6 + r() * 0.5)), (2.6 + r() * 1.2) * s);
      tube(geo, from, end, 0.075 * s, 0.025 * s, 4, T.BARK, bark);
      clumps.push({ p: end, r: (1.6 + r() * 0.35) * s });
    }
  }
  // a leader up the middle
  const top = [F[0] + (r() - 0.5) * 0.8, F[1] + 6.8 * s, F[2] + (r() - 0.5) * 0.8];
  tube(geo, F, top, 0.16 * s, 0.05 * s, 5, T.BARK, bark);
  clumps.push({ p: top, r: 2 * s });
  // and leafy twigs filling out the rest of the crown's outside
  for (let i = 0; i < (lod < 1 ? 4 : 6); i++) {
    const a = r() * TAU;
    const e = 0.2 + r() * 0.75;
    clumps.push({ p: [C[0] + Math.cos(a) * Math.sin(Math.acos(e - 0.3)) * RX, C[1] + (e - 0.3) * RY, C[2] + Math.sin(a) * Math.sin(Math.acos(e - 0.3)) * RX], r: (1.5 + r() * 0.4) * s });
  }
  // keep every clump inside an upright oval crown
  for (const c of clumps) {
    const dx = (c.p[0] - C[0]) / RX;
    const dy = (c.p[1] - C[1]) / RY;
    const dz = (c.p[2] - C[2]) / RX;
    const e = Math.hypot(dx, dy, dz);
    if (e > 0.74) {
      const k = 0.74 / e;
      c.p = [C[0] + dx * k * RX, C[1] + dy * k * RY, C[2] + dz * k * RX];
    }
  }
  const tint = [0.9 + r() * 0.16, 0.95 + r() * 0.1, 0.78 + r() * 0.2];
  const bentN = (vx, vy, vz) => {
    const dx = (vx - C[0]) / RX;
    const dy = (vy - C[1]) / RY + 0.35;
    const dz = (vz - C[2]) / RX;
    const l = Math.hypot(dx, dy, dz) || 1;
    return [dx / l, dy / l, dz / l];
  };
  const phase = x * 0.23 + z * 0.31;
  cards.sway = { base: F[1] - 0.5, height: top[1] + 2 - F[1], phase };
  const card = (cell, p, size, out, k) => {
    // face mostly outwards and upwards, never all alike
    let fx = out[0] * 0.7 + (r() - 0.5) * 1.1;
    let fy = out[1] * 0.7 + 0.35 + (r() - 0.5) * 1.1;
    let fz = out[2] * 0.7 + (r() - 0.5) * 1.1;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl;
    fy /= fl;
    fz /= fl;
    // two axes across the facing direction, turned by a random roll
    let ax = -fz;
    let az = fx;
    let al = Math.hypot(ax, az);
    if (al < 0.2) {
      ax = 1;
      az = 0;
      al = 1;
    }
    ax /= al;
    az /= al;
    // (up the card, the way the sprays grow)
    const bx0 = -fy * az;
    const by0 = fx * az - fz * ax;
    const bz0 = fy * ax;
    const roll = (r() - 0.5) * 1.2;
    const c = Math.cos(roll);
    const sn = Math.sin(roll);
    const A = [(ax * c + bx0 * sn) * size, by0 * sn * size, (az * c + bz0 * sn) * size];
    const B = [(bx0 * c - ax * sn) * size, by0 * c * size, (bz0 * c - az * sn) * size];
    // lighter towards the sunny top, a little darker underneath
    const h = clamp((p[1] - (C[1] - RY)) / (2 * RY), 0, 1);
    const shade = k * (0.72 + 0.28 * h) * (0.94 + r() * 0.12);
    cards.sway.phase = phase + r() * 0.8;
    cards.card(cell, p[0], p[1], p[2], A[0], A[1], A[2], B[0], B[1], B[2], bentN, [tint[0] * shade, tint[1] * shade, tint[2] * shade], 0.01);
  };
  // the dark, dense heart of the crown
  for (let i = 0; i < 9; i++) {
    const p = [C[0] + (r() - 0.5) * RX * 0.7, C[1] - RY * 0.05 + (r() - 0.5) * RY * 0.7, C[2] + (r() - 0.5) * RX * 0.7];
    card(L.INNER, p, (1.5 + r() * 0.4) * s, [(p[0] - C[0]) / RX, 0, (p[2] - C[2]) / RX], 0.85);
  }
  // clumps of leafy sprays round every branch end
  for (const cl of clumps) {
    const ox = cl.p[0] - C[0];
    const oy = cl.p[1] - C[1];
    const oz = cl.p[2] - C[2];
    const ol = Math.hypot(ox, oy, oz) || 1;
    const out = [ox / ol, oy / ol, oz / ol];
    const n = Math.round(10 * lod * (cl.r / (1.5 * s)) ** 2);
    for (let i = 0; i < n; i++) {
      let px;
      let py;
      let pz;
      do {
        px = r() * 2 - 1;
        py = r() * 2 - 1;
        pz = r() * 2 - 1;
      } while (px * px + py * py + pz * pz > 1);
      const p = [cl.p[0] + (px * 0.8 + out[0] * 0.25) * cl.r, cl.p[1] + (py * 0.65 + out[1] * 0.2) * cl.r, cl.p[2] + (pz * 0.8 + out[2] * 0.25) * cl.r];
      const edge = px * out[0] + py * out[1] + pz * out[2] > 0.45;
      const cell = edge && r() < 0.6 ? L.EDGE : r() < 0.55 ? L.SPRAY : L.SPRAY2;
      card(cell, p, (0.7 + r() * 0.3) * s * lod ** -0.35, out, 1);
    }
  }
  cards.sway = null;
}

// a green cast-iron lamp post with a lantern
function lamp(geo, x, y, z) {
  const green = col('#1f3129');
  geo.identity();
  geo.lathe(x, z, [[0.2, y], [0.2, y + 0.35], [0.12, y + 0.5], [0.075, y + 0.9], [0.06, y + 3.6], [0.09, y + 3.75]], 8, T.PLAIN, green);
  // the lantern: a glass box with a little roof
  geo.frame(x, y, z, 1, 0);
  const glassC = col('#3a3a30');
  geo.box(-0.2, 0.2, 3.75, 4.3, -0.2, 0.2, T.PLAIN, glassC, 'b');
  geo.box(-0.24, 0.24, 4.3, 4.36, -0.24, 0.24, T.PLAIN, green);
  geo.identity();
  geo.lathe(x, z, [[0.24, y + 4.36], [0.05, y + 4.62], [0.03, y + 4.75], [0.001, y + 4.8]], 8, T.PLAIN, green);
}

function bollard(geo, x, y, z) {
  const black = col('#262622');
  geo.lathe(x, z, [[0.14, y], [0.12, y + 0.35], [0.1, y + 0.42], [0.15, y + 0.48], [0.1, y + 0.58], [0.001, y + 0.6]], 8, T.PLAIN, black);
}

// Build the quay walls, cobbles, bollards, lamps and trees into the sectors.
// Returns the rubble rocks as their own mesh, and spots used (for houses to
// keep clear of).
export function buildQuays(sectors, quality) {
  const low = quality.tier === 'low';
  const lod = quality.tier === 'high' ? 1 : low ? 0.45 : 0.47;
  const r = rng(7);
  const lines = quayLines();
  const rubble = [];
  const lampSpots = [];
  const treeSpots = [];
  for (const line of lines) {
    const P = line.pts;
    const n = P.length;
    const segs = line.closed ? n : n - 1;
    let nextBollard = 5;
    let nextLamp = 12;
    let nextTree = 6;
    for (let i = 0; i < segs; i++) {
      const a = P[i];
      const b = P[(i + 1) % n];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 4) continue;
      const geo = sectors.geo(a.x, a.z);
      geo.identity();
      if (a.sea || b.sea) {
        // rubble down to the sea (every other metre)
        if (i % (low ? 3 : 2) === 0) {
          for (let k = 0; k < 2; k++) {
            const d = -1 + r() * 7;
            const x = a.x + a.nx * d + (r() - 0.5) * 1.5;
            const z = a.z + a.nz * d + (r() - 0.5) * 1.5;
            const s = 0.7 + r() * 0.9;
            rubble.push({ x, y: Math.max(-2.5, -1.4 + d * 0.42) - s * 0.2, z, s, sy: 0.6 + r() * 0.4, ry: r() * 6 });
          }
        }
        // a parapet along the breakwater's sea side
        if (a.z > 255 && Math.abs(a.x) < COAST - 12) {
          const o = 7.6;
          const ax = a.x + a.nx * o;
          const az = a.z + a.nz * o;
          const bx = b.x + b.nx * o;
          const bz = b.z + b.nz * o;
          const t = 0.6;
          const c = STONE_COLS[i % 3];
          const top = 1.35 + 1.1;
          geo.quad([ax, 1.3, az], [bx, 1.3, bz], [bx, top, bz], [ax, top, az], T.STONE, c);
          geo.quad([bx + b.nx * t, 1.3, bz + b.nz * t], [ax + a.nx * t, 1.3, az + a.nz * t], [ax + a.nx * t, top, az + a.nz * t], [bx + b.nx * t, top, bz + b.nz * t], T.STONE, c);
          geo.quad([ax, top, az], [bx, top, bz], [bx + b.nx * t, top, bz + b.nz * t], [ax + a.nx * t, top, az + a.nz * t], T.SAND, col('#cfc8ba'));
        }
        continue;
      }
      // the wall face, darkened by water and algae towards the bottom
      const stain = (p) => 0.86 + 0.14 * noise.noise(p.s * 0.35, 3.1) + (noise.noise(p.s * 1.7, 9.2) > 0.55 ? -0.12 : 0);
      const rows = [-3.4, -0.3, 0.22, 0.75, 1.33];
      const shade = (y, k) => {
        if (y < -0.1) return ALGAE.map((v) => v * 0.8);
        if (y < 0.5) return ALGAE.map((v, j) => v * 1.05 * k + [0.02, 0.04, 0.0][j]);
        if (y < 1) return WET.map((v) => v * k * 1.05);
        return DRY.map((v) => v * k);
      };
      const ka = stain(a);
      const kb = stain(b);
      for (let j = 0; j < rows.length - 1; j++) {
        const y0 = rows[j];
        const y1 = rows[j + 1];
        geo.quad([a.x, y0, a.z], [b.x, y0, b.z], [b.x, y1, b.z], [a.x, y1, a.z], T.STONE, [shade(y0, ka), shade(y0, kb), shade(y1, kb), shade(y1, ka)], [
          [a.s / 2.4, y0 / 2.4], [b.s / 2.4, y0 / 2.4], [b.s / 2.4, y1 / 2.4], [a.s / 2.4, y1 / 2.4],
        ]);
      }
      // the coping stone, overhanging a few centimetres
      const ov = 0.06;
      const cw = 0.5;
      const cc = col('#d9d3c7', 0.97 + 0.06 * noise.noise(a.s * 0.4, 1));
      const A0 = [a.x - a.nx * ov, a.z - a.nz * ov];
      const B0 = [b.x - b.nx * ov, b.z - b.nz * ov];
      geo.quad([A0[0], 1.33, A0[1]], [B0[0], 1.33, B0[1]], [B0[0], QUAY_TOP, B0[1]], [A0[0], QUAY_TOP, A0[1]], T.SAND, cc, [
        [a.s / 3, 0], [b.s / 3, 0], [b.s / 3, 0.04], [a.s / 3, 0.04],
      ]);
      geo.quad([a.x, 1.33, a.z], [b.x, 1.33, b.z], [B0[0], 1.33, B0[1]], [A0[0], 1.33, A0[1]], T.SAND, cc.map((v) => v * 0.6));
      geo.quad([A0[0], QUAY_TOP, A0[1]], [B0[0], QUAY_TOP, B0[1]], [b.x + b.nx * cw, QUAY_TOP, b.z + b.nz * cw], [a.x + a.nx * cw, QUAY_TOP, a.z + a.nz * cw], T.SAND, cc);
      // the cobbled street back to the houses
      const sw = streetWidth(a);
      const ea = [a.x + a.nx * sw, a.z + a.nz * sw];
      const eb = [b.x + b.nx * sw, b.z + b.nz * sw];
      const dir = (b.x - a.x) * (eb[0] - ea[0]) + (b.z - a.z) * (eb[1] - ea[1]);
      if (dir > 0 && allWaterD(ea[0], ea[1]) > sw * 0.7) {
        const pc = [0.92 + r() * 0.06, 0.9 + r() * 0.06, 0.86 + r() * 0.06];
        geo.quad([a.x + a.nx * cw, 1.41, a.z + a.nz * cw], [b.x + b.nx * cw, 1.41, b.z + b.nz * cw], [eb[0], 1.41, eb[1]], [ea[0], 1.41, ea[1]], T.COBBLE, pc);
        // a kerb step down from the coping onto the cobbles
        geo.quad([b.x + b.nx * cw, 1.41, b.z + b.nz * cw], [a.x + a.nx * cw, 1.41, a.z + a.nz * cw], [a.x + a.nx * cw, QUAY_TOP, a.z + a.nz * cw], [b.x + b.nx * cw, QUAY_TOP, b.z + b.nz * cw], T.SAND, cc.map((v) => v * 0.8));
      }
      // street furniture
      const bridge = nearBridge(a.x, a.z, 3);
      if (a.s > nextBollard) {
        nextBollard = a.s + 10 + r() * 5;
        if (!bridge) bollard(sectors.det(a.x, a.z).identity(), a.x + a.nx * 0.3, QUAY_TOP, a.z + a.nz * 0.3);
      }
      if (a.s > nextLamp && sw >= 7 && !bridge) {
        nextLamp = a.s + (sw > 9 ? 22 : 28) + r() * 4;
        const x = a.x + a.nx * 1.0;
        const z = a.z + a.nz * 1.0;
        lampSpots.push({ x, z });
        lamp(sectors.det(x, z), x, 1.41, z);
        sectors.det(x, z).identity();
      }
      const ringCanal = a.z < CZ - 4 && !(Math.abs(a.x) < 20 && a.z < CZ - 100 && a.z > CZ - 240);
      if (a.s > nextTree && !bridge && ringCanal) {
        nextTree = a.s + 11 + r() * 5;
        const x = a.x + a.nx * 3.3;
        const z = a.z + a.nz * 3.3;
        if (!lampSpots.some((l) => Math.hypot(l.x - x, l.z - z) < 4) && (!low || r() < 0.6)) {
          treeSpots.push({ x, z });
          tree(geo, sectors.cards(x, z), x, 1.41, z, Math.round(a.s * 13 + i), 1, lod);
          geo.identity();
        }
      }
    }
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d877c, roughness: 0.85 });
  const rocks = instances(rockGeometry(21, 1), rockMat, rubble, { shadow: false });
  rocks.name = 'rubble';
  return { rocks, lampSpots, treeSpots };
}

export { clamp, WHITE, MOORED };
