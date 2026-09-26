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
import { T, F, col, WHITE } from './canal-kit.js';

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

// a lime tree: a clear trunk, a few limbs and a loose, lobed crown of leaf
// cards (normals bent outwards from the crown so it shades like a volume)
export function tree(geo, cards, x, y, z, seed, scale = 1) {
  const r = rng(seed);
  const s = scale * (0.95 + r() * 0.3);
  const bark = col('#d8d4c8');
  const h0 = 4.2 * s;
  tube(geo, [x, y - 0.2, z], [x + (r() - 0.5) * 0.3, y + h0, z + (r() - 0.5) * 0.3], 0.26 * s, 0.19 * s, 7, T.BARK, bark);
  const cy = y + h0 + 4.4 * s;
  const R = 4.3 * s;
  // the crown: a few overlapping lobes round the middle
  const lobes = [];
  const nl = 4 + Math.floor(r() * 2);
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * Math.PI * 2 + r() * 0.6;
    const d = R * (0.35 + r() * 0.2);
    lobes.push({ x: x + Math.cos(a) * d, y: cy + (r() - 0.35) * R * 0.5, z: z + Math.sin(a) * d, r: R * (0.55 + r() * 0.2) });
  }
  lobes.push({ x, y: cy + R * 0.35, z, r: R * 0.6 });
  for (const l of lobes) {
    tube(geo, [x, y + h0 - 0.3, z], [l.x * 0.7 + x * 0.3, l.y - l.r * 0.3, l.z * 0.7 + z * 0.3], 0.15 * s, 0.05 * s, 5, T.BARK, bark);
  }
  const tint = [0.92 + r() * 0.14, 0.96 + r() * 0.1, 0.8 + r() * 0.16];
  const bentN = (vx, vy, vz) => {
    const dx = (vx - x) / R;
    const dy = (vy - cy) / R + 0.4;
    const dz = (vz - z) / R;
    const l = Math.hypot(dx, dy, dz) || 1;
    return [dx / l, dy / l, dz / l];
  };
  for (const l of lobes) {
    const n = Math.round(24 * (l.r / (R * 0.6)) ** 2);
    for (let i = 0; i < n; i++) {
      let px;
      let py;
      let pz;
      do {
        px = r() * 2 - 1;
        py = r() * 2 - 1;
        pz = r() * 2 - 1;
      } while (px * px + py * py + pz * pz > 1);
      const k = 0.45 + 0.55 * Math.sqrt(px * px + py * py + pz * pz);
      const cx = l.x + px * l.r * k;
      const cyy = l.y + py * l.r * k * 0.8;
      const cz = l.z + pz * l.r * k;
      const size = (0.95 + r() * 0.45) * s;
      const yaw = r() * Math.PI * 2;
      const pitch = (r() - 0.5) * 1.8;
      const ax = [Math.cos(yaw) * size, (r() - 0.5) * 0.4 * size, Math.sin(yaw) * size];
      const bx = [-Math.sin(yaw) * Math.sin(pitch) * size, Math.cos(pitch) * size, Math.cos(yaw) * Math.sin(pitch) * size];
      // lighter towards the sunny top, darker inside and underneath
      const shade = 0.7 + 0.4 * clamp((cyy - (cy - R)) / (2 * R), 0, 1);
      cards.card(F.LEAVES, cx, cyy, cz, ax[0], ax[1], ax[2], bx[0], bx[1], bx[2], bentN, [tint[0] * shade, tint[1] * shade, tint[2] * shade]);
    }
  }
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
          tree(geo, sectors.cards(x, z), x, 1.41, z, Math.round(a.s * 13 + i));
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
