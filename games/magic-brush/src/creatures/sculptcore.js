// The meshing half of the sculpting kit (see sculpt.js), in plain
// JavaScript with no three.js, so it can run in a worker. It takes the
// prepared primitives and bones and returns typed arrays.
//
// Speed: the field is sampled on a coarse grid first; each coarse block
// near the surface gets its own short list of the primitives that can reach
// it, and only those blocks are sampled finely and meshed. Vertices, their
// normals (a tetrahedral gradient: four samples) and their looks all use
// their block's short list.

export const LOOK_SIZE = 7; // tint r g b, paint, fur, rough, pat
const BIG = 1e3;

function sdEllipsoid(px, py, pz, rx, ry, rz) {
  const ax = px / rx, ay = py / ry, az = pz / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx, by = ay / ry, bz = az / rz;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

function sdRoundCone(px, py, pz, p) {
  const bax = p.bx - p.ax, bay = p.by - p.ay, baz = p.bz - p.az;
  const l2 = p.l2;
  const rr = p.r1 - p.r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - p.ax, pay = py - p.ay, paz = pz - p.az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = (rr > 0 ? 1 : rr < 0 ? -1 : 0) * rr * rr * x2;
  if ((z > 0 ? 1 : z < 0 ? -1 : 0) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - p.r2;
  if ((y > 0 ? 1 : y < 0 ? -1 : 0) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - p.r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - p.r1;
}

function sdRoundBox(px, py, pz, hx, hy, hz, r) {
  const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r, qz = Math.abs(pz) - hz + r;
  const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

function sdTorus(px, py, pz, R, r) {
  const q = Math.sqrt(px * px + pz * pz) - R;
  return Math.sqrt(q * q + py * py) - r;
}

function prim(p, x, y, z) {
  if (p.type === 1) return sdRoundCone(x, y, z, p);
  let px = x - p.c[0], py = y - p.c[1], pz = z - p.c[2];
  const m = p.m;
  if (m) {
    const lx = m[0] * px + m[1] * py + m[2] * pz;
    const ly = m[3] * px + m[4] * py + m[5] * pz;
    const lz = m[6] * px + m[7] * py + m[8] * pz;
    px = lx; py = ly; pz = lz;
  }
  if (p.type === 0) return sdEllipsoid(px, py, pz, p.r[0], p.r[1], p.r[2]);
  if (p.type === 2) return sdRoundBox(px, py, pz, p.h[0], p.h[1], p.h[2], p.rr);
  return sdTorus(px, py, pz, p.R, p.r);
}

function lowerBound(p, x, y, z) {
  const dx = x - p.bc[0], dy = y - p.bc[1], dz = z - p.bc[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - p.br;
}

// the field over a list of primitives
function dist(list, x, y, z) {
  let d = BIG;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const lb = lowerBound(p, x, y, z);
    const k = p.k;
    if (p.sub) {
      if (lb >= -d + k) continue;
      const di = prim(p, x, y, z);
      const a = -d;
      if (k <= 0) d = -(a < di ? a : di);
      else {
        let h = 0.5 + (0.5 * (di - a)) / k;
        h = h < 0 ? 0 : h > 1 ? 1 : h;
        d = -(di + (a - di) * h - k * h * (1 - h));
      }
    } else {
      if (lb >= d + k) continue;
      const di = prim(p, x, y, z);
      if (k <= 0) d = d < di ? d : di;
      else {
        let h = 0.5 + (0.5 * (di - d)) / k;
        h = h < 0 ? 0 : h > 1 ? 1 : h;
        d = di + (d - di) * h - k * h * (1 - h);
      }
    }
  }
  return d;
}

// the field plus blended look and bone weights
function evalFull(list, x, y, z, look, weights) {
  let d = BIG;
  look.fill(0);
  weights.fill(0);
  let first = true;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const lb = lowerBound(p, x, y, z);
    const k = p.k;
    let h;
    if (p.sub) {
      if (lb >= -d + k) continue;
      const di = prim(p, x, y, z);
      const a = -d;
      if (k <= 0) h = a < di ? 1 : 0;
      else {
        h = 0.5 + (0.5 * (di - a)) / k;
        h = h < 0 ? 0 : h > 1 ? 1 : h;
      }
      d = -(di + (a - di) * h - (k > 0 ? k * h * (1 - h) : 0));
      for (let j = 0; j < LOOK_SIZE; j++) look[j] = look[j] * h + p.look[j] * (1 - h);
      if (p.bone >= 0) {
        for (let j = 0; j < weights.length; j++) weights[j] *= h;
        weights[p.bone] += 1 - h;
      }
    } else {
      if (lb >= d + k && !first) continue;
      const di = prim(p, x, y, z);
      if (first) {
        h = 0;
        d = di;
        first = false;
      } else {
        if (k <= 0) h = d < di ? 1 : 0;
        else {
          h = 0.5 + (0.5 * (di - d)) / k;
          h = h < 0 ? 0 : h > 1 ? 1 : h;
        }
        d = di + (d - di) * h - (k > 0 ? k * h * (1 - h) : 0);
      }
      for (let j = 0; j < LOOK_SIZE; j++) look[j] = look[j] * h + p.look[j] * (1 - h);
      for (let j = 0; j < weights.length; j++) weights[j] *= h;
      weights[p.bone >= 0 ? p.bone : 0] += 1 - h;
    }
  }
  return d;
}

// prims: prepared primitives (see Sculpt._prepare). nBones: bone count.
export function meshField(prims, nBones, { voxel = 0.005, smooth = 8 } = {}) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  let kMax = 0;
  for (const p of prims) {
    if (p.sub) continue;
    kMax = Math.max(kMax, p.k);
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], p.bc[a] - p.br);
      hi[a] = Math.max(hi[a], p.bc[a] + p.br);
    }
  }
  const pad = voxel * 3 + kMax * 0.5;
  for (let a = 0; a < 3; a++) {
    lo[a] -= pad;
    hi[a] += pad;
  }
  const C = 4;
  const n = [0, 1, 2].map((a) => Math.ceil((hi[a] - lo[a]) / voxel / C) * C + 1);
  const [nx, ny, nz] = n;
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const grid = new Float32Array(nx * ny * nz);
  const cn = n.map((v) => (v - 1) / C + 1);
  const bn = cn.map((v) => v - 1); // blocks per axis
  const coarse = new Float32Array(cn[0] * cn[1] * cn[2]);
  const cidx = (i, j, k) => i + cn[0] * (j + cn[1] * k);
  const step = C * voxel;
  for (let k = 0; k < cn[2]; k++)
    for (let j = 0; j < cn[1]; j++)
      for (let i = 0; i < cn[0]; i++) coarse[cidx(i, j, k)] = dist(prims, lo[0] + i * step, lo[1] + j * step, lo[2] + k * step);

  // per block: is it near the surface, and which primitives can reach it
  const blockR = step * 0.8660254; // half the block diagonal
  const lists = new Array(bn[0] * bn[1] * bn[2]).fill(null);
  const bidx = (i, j, k) => i + bn[0] * (j + bn[1] * k);
  const band = step * 1.9;
  const listCache = new Map();
  for (let bk = 0; bk < bn[2]; bk++)
    for (let bj = 0; bj < bn[1]; bj++)
      for (let bi = 0; bi < bn[0]; bi++) {
        let near = false;
        let sum = 0;
        for (let c = 0; c < 8; c++) {
          const v = coarse[cidx(bi + (c & 1), bj + ((c >> 1) & 1), bk + ((c >> 2) & 1))];
          sum += v;
          if (Math.abs(v) < band) near = true;
        }
        const fill = sum / 8;
        if (!near) {
          for (let k = 0; k <= C; k++)
            for (let j = 0; j <= C; j++)
              for (let i = 0; i <= C; i++) {
                const id = idx(bi * C + i, bj * C + j, bk * C + k);
                if (grid[id] === 0) grid[id] = fill;
              }
          continue;
        }
        const cx = lo[0] + (bi + 0.5) * step, cy = lo[1] + (bj + 0.5) * step, cz = lo[2] + (bk + 0.5) * step;
        const dc = dist(prims, cx, cy, cz);
        const reach = 2 * blockR + 2 * voxel;
        const list = [];
        let key = '';
        for (let q = 0; q < prims.length; q++) {
          const p = prims[q];
          const lb = lowerBound(p, cx, cy, cz);
          const ok = p.sub ? lb < Math.max(0, -dc) + reach + p.k : lb < dc + reach + p.k;
          if (ok) {
            list.push(p);
            key += q + ',';
          }
        }
        let L = listCache.get(key);
        if (!L) listCache.set(key, (L = list));
        lists[bidx(bi, bj, bk)] = L;
        for (let k = 0; k <= C; k++)
          for (let j = 0; j <= C; j++)
            for (let i = 0; i <= C; i++) {
              const gi = bi * C + i, gj = bj * C + j, gk = bk * C + k;
              grid[idx(gi, gj, gk)] = dist(L, lo[0] + gi * voxel, lo[1] + gj * voxel, lo[2] + gk * voxel);
            }
      }
  const listAt = (x, y, z) => {
    const bi = Math.min(bn[0] - 1, Math.max(0, Math.floor((x - lo[0]) / step)));
    const bj = Math.min(bn[1] - 1, Math.max(0, Math.floor((y - lo[1]) / step)));
    const bk = Math.min(bn[2] - 1, Math.max(0, Math.floor((z - lo[2]) / step)));
    return lists[bidx(bi, bj, bk)] || prims;
  };

  // surface nets
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const EA = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3];
  const EB = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = grid[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
          cv[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (let e = 0; e < 12; e++) {
          const a = EA[e], b = EB[e];
          const va = cv[a], vb = cv[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          cnt++;
        }
        cellVert[cid(i, j, k)] = pos.length / 3;
        pos.push(lo[0] + (i + sx / cnt) * voxel, lo[1] + (j + sy / cnt) * voxel, lo[2] + (k + sz / cnt) * voxel);
      }
  const tris = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, b, c, a, c, d);
    else tris.push(a, d, c, a, c, b);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const v0 = grid[idx(i, j, k)] < 0;
        if (v0 !== grid[idx(i + 1, j, k)] < 0)
          quad(cellVert[cid(i, j - 1, k - 1)], cellVert[cid(i, j, k - 1)], cellVert[cid(i, j, k)], cellVert[cid(i, j - 1, k)], v0);
        if (v0 !== grid[idx(i, j + 1, k)] < 0)
          quad(cellVert[cid(i - 1, j, k - 1)], cellVert[cid(i - 1, j, k)], cellVert[cid(i, j, k)], cellVert[cid(i, j, k - 1)], v0);
        if (v0 !== grid[idx(i, j, k + 1)] < 0)
          quad(cellVert[cid(i - 1, j - 1, k)], cellVert[cid(i, j - 1, k)], cellVert[cid(i, j, k)], cellVert[cid(i - 1, j, k)], v0);
      }

  // onto the surface; normals from a tetrahedral gradient
  const nv = pos.length / 3;
  const P = new Float32Array(pos);
  const N = new Float32Array(nv * 3);
  const e = voxel * 0.35;
  for (let v = 0; v < nv; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const L = listAt(x, y, z);
    let gx = 0, gy = 0, gz = 1;
    for (let it = 0; it < 2; it++) {
      const a = dist(L, x + e, y - e, z - e);
      const b = dist(L, x - e, y - e, z + e);
      const c = dist(L, x - e, y + e, z - e);
      const d4 = dist(L, x + e, y + e, z + e);
      gx = a - b - c + d4;
      gy = -a - b + c + d4;
      gz = -a + b - c + d4;
      const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      gx /= gl; gy /= gl; gz /= gl;
      if (it === 0) {
        let d = (a + b + c + d4) * 0.25;
        d = d > voxel ? voxel : d < -voxel ? -voxel : d;
        x -= gx * d; y -= gy * d; z -= gz * d;
      }
    }
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    N[v * 3] = gx; N[v * 3 + 1] = gy; N[v * 3 + 2] = gz;
  }

  const nb = Math.max(1, nBones);
  const W = new Float32Array(nv * nb);
  const tint = new Float32Array(nv * 3);
  const mix = new Float32Array(nv * 4);
  const look = new Float32Array(LOOK_SIZE);
  const w = new Float32Array(nb);
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    evalFull(listAt(x, y, z), x, y, z, look, w);
    tint[v * 3] = look[0];
    tint[v * 3 + 1] = look[1];
    tint[v * 3 + 2] = look[2];
    mix[v * 4] = look[3];
    mix[v * 4 + 1] = look[4];
    mix[v * 4 + 2] = look[5];
    mix[v * 4 + 3] = look[6];
    W.set(w, v * nb);
  }
  if (smooth > 0 && nb > 1) {
    const adj = adjacency(nv, tris);
    const tmp = new Float32Array(W.length);
    for (let r = 0; r < smooth; r++) {
      for (let v = 0; v < nv; v++) {
        const s = adj.start[v], en = adj.start[v + 1];
        const o = v * nb;
        for (let b = 0; b < nb; b++) {
          let acc = W[o + b];
          for (let q = s; q < en; q++) acc += W[adj.list[q] * nb + b];
          tmp[o + b] = acc / (1 + en - s);
        }
      }
      W.set(tmp);
    }
  }
  const skinIndex = new Uint16Array(nv * 4);
  const skinWeight = new Float32Array(nv * 4);
  topFour(W, nv, nb, skinIndex, skinWeight);
  const index = nv > 65535 ? new Uint32Array(tris) : new Uint16Array(tris);
  return { position: P, normal: N, skinIndex, skinWeight, tint, mix, index };
}

function adjacency(nv, tris) {
  const count = new Int32Array(nv + 1);
  for (let i = 0; i < tris.length; i += 3) {
    count[tris[i]] += 2;
    count[tris[i + 1]] += 2;
    count[tris[i + 2]] += 2;
  }
  const start = new Int32Array(nv + 1);
  for (let v = 0; v < nv; v++) start[v + 1] = start[v] + count[v];
  const fillAt = start.slice();
  const list = new Int32Array(start[nv]);
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i], b = tris[i + 1], c = tris[i + 2];
    list[fillAt[a]++] = b; list[fillAt[a]++] = c;
    list[fillAt[b]++] = a; list[fillAt[b]++] = c;
    list[fillAt[c]++] = a; list[fillAt[c]++] = b;
  }
  return { start, list };
}

function topFour(W, nv, nb, skinIndex, skinWeight) {
  const best = [0, 0, 0, 0];
  const bw = [0, 0, 0, 0];
  for (let v = 0; v < nv; v++) {
    bw.fill(-1);
    best.fill(0);
    for (let b = 0; b < nb; b++) {
      const x = W[v * nb + b];
      if (x <= bw[3]) continue;
      let s = 3;
      while (s > 0 && x > bw[s - 1]) {
        bw[s] = bw[s - 1];
        best[s] = best[s - 1];
        s--;
      }
      bw[s] = x;
      best[s] = b;
    }
    let sum = 0;
    for (let s = 0; s < 4; s++) {
      if (bw[s] < 0.02) bw[s] = 0;
      sum += bw[s];
    }
    for (let s = 0; s < 4; s++) {
      skinIndex[v * 4 + s] = best[s];
      skinWeight[v * 4 + s] = sum > 0 ? bw[s] / sum : s === 0 ? 1 : 0;
    }
  }
}
