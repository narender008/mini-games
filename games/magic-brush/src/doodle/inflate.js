// Doodle friends, part 1: from a free drawing to a soft, puffy body.
//
// Pure functions with no three.js and no DOM, so the same code runs in the
// meshing worker (mesh-worker.js) and, where workers fail, on the page.
//
//   cleanMask(bits, W, H)          -> { inside, stats } or { empty: true }
//   buildDoodle(bits, W, H, opts)  -> everything a DoodleFriend is built from
//
// The mask is the painted texels of the canvas at W x H (row 0 is the bottom
// of the canvas, v = 0, as the GPU reads it back). Cleaning drops specks,
// melts strokes that nearly touch into one shape, joins blobs that are far
// apart with chunky bridges (so two blobs make one peanut-shaped friend, never
// two broken halves), fills enclosed holes (a drawn ring becomes a disc),
// fattens shapes too thin to be a body (a line becomes a plump noodle) and
// rounds the silhouette.
//
// Inflation: f solves the Poisson equation lap(f) = -4 inside the silhouette
// with f = 0 on its edge (coarse to fine, by over-relaxation). For a disc of
// radius R that is R^2 - r^2, whose square root is a hemisphere; for any other
// shape the square root is just as round across its local width, so a star's
// arms are round fingers and a blob is a pillow. The surface is the zero set of
//   G(x, y, z) = z^2 - s^2 f(x, y)
// which is smooth everywhere, including the rim where front and back meet with
// a vertical tangent (an inflated sticker or a plush), meshed by surface nets
// and smoothed (Taubin, so it does not shrink). Units inside are canvas grid
// pixels; the result is in the friend's rest space (metres, feet on y = 0,
// facing +z), scaled so every doodle is about the same armful.
//
// Features are placed from the same fields: two big googly eyes in the upper
// part (the highest place wide enough for both; on a shape too thin for them
// they sit on its edge, poking out), a smile and rosy cheeks under them, and
// little legs with round feet under the bottom edge (more pairs for a long,
// low caterpillar shape). The skeleton and skin weights let it squash,
// stretch, lean, wave its side lobes and step.

const SPECK = 24; // px: smaller painted islands are ignored
const MIN_AREA = 150; // px: less than this altogether is "almost nothing"
const INFLATE = 0.64; // how puffy: 1 = a disc becomes a full sphere

// ------------------------------------------------------------ small tools

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// exact euclidean distance transform (Felzenszwalb): distance from each pixel
// to the nearest pixel where feat is 1
export function edt(feat, W, H) {
  const INF = 1e20;
  const n = Math.max(W, H);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const g = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = feat[i] ? 0 : INF;
  const dt1 = (len) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = g[y * W + x];
    dt1(H);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x];
    dt1(W);
    for (let x = 0; x < W; x++) g[y * W + x] = d[x];
  }
  const out = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = Math.sqrt(g[i]);
  return out;
}

// 8-connected components: label per pixel (0 = none) and each one's pixels
function label(m, W, H) {
  const lab = new Int32Array(W * H);
  const comps = [];
  const stack = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!m[i] || lab[i]) continue;
    const id = comps.length + 1;
    const px = [];
    let sp = 0;
    stack[sp++] = i;
    lab[i] = id;
    while (sp) {
      const p = stack[--sp];
      px.push(p);
      const x = p % W;
      const y = (p - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const q = yy * W + xx;
          if (m[q] && !lab[q]) {
            lab[q] = id;
            stack[sp++] = q;
          }
        }
    }
    comps.push({ id, px });
  }
  return { lab, comps };
}

function dilate(m, W, H, r) {
  const d = edt(m, W, H);
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = d[i] <= r ? 1 : 0;
  return out;
}

function erode(m, W, H, r) {
  const bg = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) bg[i] = m[i] ? 0 : 1;
  const d = edt(bg, W, H);
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = m[i] && d[i] > r ? 1 : 0;
  return out;
}

// clear a frame round the edge, so every shape is closed
function frame(m, W, H, b = 3) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (x < b || y < b || x >= W - b || y >= H - b) m[y * W + x] = 0;
}

function fillHoles(m, W, H) {
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) {
    stack.push(x, (H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || m[p]) continue;
    seen[p] = 1;
    const x = p % W;
    const y = (p - x) / W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
  for (let i = 0; i < W * H; i++) if (!m[i] && !seen[i]) m[i] = 1;
}

function blur(src, W, H, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 2.5));
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp((-i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += k[i + r] * src[y * W + clamp(x + i, 0, W - 1)];
      tmp[y * W + x] = a;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += k[i + r] * tmp[clamp(y + i, 0, H - 1) * W + x];
      out[y * W + x] = a;
    }
  return out;
}

function bbox(m, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0, sx = 0, sy = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m[y * W + x]) continue;
      n++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return { x0, y0, x1, y1, n, cx: n ? sx / n : W / 2, cy: n ? sy / n : H / 2 };
}

// a filled round-ended line from a to b (px), radius r
function capsule(m, W, H, ax, ay, bx, by, r) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = Math.max(1e-6, dx * dx + dy * dy);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
      const ex = ax + dx * t - x;
      const ey = ay + dy * t - y;
      if (ex * ex + ey * ey <= r * r) m[y * W + x] = 1;
    }
}

// ------------------------------------------------------------ cleaning

// bits: Uint8Array W*H, 1 = painted. Returns the cleaned silhouette (a soft
// mask, 0..1, inside where > 0.5) or { empty } when there is almost nothing.
export function cleanMask(bits, W, H) {
  let m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = bits[i] ? 1 : 0;
  frame(m, W, H, 2);
  // specks
  let { comps } = label(m, W, H);
  let painted = 0;
  for (const c of comps) {
    if (c.px.length < SPECK) for (const p of c.px) m[p] = 0;
    else painted += c.px.length;
  }
  if (painted < MIN_AREA) return { empty: true, painted };
  // strokes that nearly touch melt together (a closing: grow, then shrink back)
  m = erode(dilate(m, W, H, 4.5), W, H, 4.5);
  frame(m, W, H, 3);
  fillHoles(m, W, H);
  // blobs far apart: joined into one friend by chunky bridges along a spanning tree
  ({ comps } = label(m, W, H));
  comps = comps.filter((c) => c.px.length >= SPECK);
  if (comps.length > 1) {
    comps.sort((a, b) => b.px.length - a.px.length);
    comps = comps.slice(0, 8);
    const bg = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) bg[i] = m[i] ? 0 : 1;
    const din = edt(bg, W, H);
    const info = comps.map((c) => {
      let maxD = 0;
      const edge = [];
      for (const p of c.px) {
        maxD = Math.max(maxD, din[p]);
        if (din[p] <= 1.5) edge.push(p);
      }
      // (a sample of the edge is plenty to find where two blobs come closest)
      const step = Math.max(1, Math.floor(edge.length / 160));
      const pts = [];
      for (let i = 0; i < edge.length; i += step) pts.push([edge[i] % W, Math.floor(edge[i] / W)]);
      return { maxD, pts };
    });
    const inTree = [0];
    const left = new Set(comps.map((_, i) => i).slice(1));
    while (left.size) {
      let best = null;
      for (const a of inTree)
        for (const b of left) {
          for (const pa of info[a].pts)
            for (const pb of info[b].pts) {
              const d = (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2;
              if (!best || d < best.d) best = { d, a, b, pa, pb };
            }
        }
      if (!best) break;
      const r = clamp(0.55 * Math.min(info[best.a].maxD, info[best.b].maxD), 4, 14);
      capsule(m, W, H, best.pa[0], best.pa[1], best.pb[0], best.pb[1], r);
      inTree.push(best.b);
      left.delete(best.b);
    }
    // round off where the bridges meet the blobs
    m = erode(dilate(m, W, H, 3.5), W, H, 3.5);
    frame(m, W, H, 3);
    fillHoles(m, W, H);
  }
  let box = bbox(m, W, H);
  const ext = Math.max(box.x1 - box.x0, box.y1 - box.y0) + 1;
  // too thin to be a body: fatten it (a line becomes a plump noodle)
  {
    const bg = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) bg[i] = m[i] ? 0 : 1;
    const din = edt(bg, W, H);
    let maxD = 0;
    for (let i = 0; i < W * H; i++) if (m[i]) maxD = Math.max(maxD, din[i]);
    const want = Math.max(6, 0.075 * ext);
    if (maxD < want) {
      m = dilate(m, W, H, want - maxD);
      frame(m, W, H, 3);
    }
  }
  box = bbox(m, W, H);
  const ext2 = Math.max(box.x1 - box.x0, box.y1 - box.y0) + 1;
  // a rounder silhouette
  const soft = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) soft[i] = m[i];
  const sm = blur(soft, W, H, clamp(0.014 * ext2, 1.2, 3.5));
  const inside = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) inside[i] = sm[i] > 0.5 ? 1 : 0;
  frame(inside, W, H, 2);
  // (the blur may cut a hair-thin neck: keep the biggest piece)
  ({ comps } = label(inside, W, H));
  if (comps.length > 1) {
    comps.sort((a, b) => b.px.length - a.px.length);
    for (const c of comps.slice(1)) for (const p of c.px) inside[p] = 0;
  }
  fillHoles(inside, W, H);
  const b = bbox(inside, W, H);
  if (b.n < MIN_AREA * 0.5) return { empty: true, painted };
  return { empty: false, inside, soft: sm, painted, box: b };
}

// ------------------------------------------------------------ inflation

// lap(f) = -4 inside (in px units), 0 outside; coarse to fine
function poisson(inside, W, H) {
  let f;
  let iters = 260;
  if (W > 36 || H > 36) {
    const W2 = Math.ceil(W / 2);
    const H2 = Math.ceil(H / 2);
    const in2 = new Uint8Array(W2 * H2);
    for (let y = 0; y < H2; y++)
      for (let x = 0; x < W2; x++) {
        let c = 0;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const xx = Math.min(W - 1, 2 * x + dx);
            const yy = Math.min(H - 1, 2 * y + dy);
            c += inside[yy * W + xx];
          }
        in2[y * W2 + x] = c >= 3 ? 1 : 0;
      }
    const f2 = poisson(in2, W2, H2);
    f = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!inside[y * W + x]) continue;
        const gx = clamp((x - 0.5) / 2, 0, W2 - 1);
        const gy = clamp((y - 0.5) / 2, 0, H2 - 1);
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const x1 = Math.min(W2 - 1, x0 + 1);
        const y1 = Math.min(H2 - 1, y0 + 1);
        const tx = gx - x0;
        const ty = gy - y0;
        const v = (f2[y0 * W2 + x0] * (1 - tx) + f2[y0 * W2 + x1] * tx) * (1 - ty) + (f2[y1 * W2 + x0] * (1 - tx) + f2[y1 * W2 + x1] * tx) * ty;
        f[y * W + x] = v * 4;
      }
    iters = 70;
  } else f = new Float32Array(W * H);
  const w = 1.86;
  for (let it = 0; it < iters; it++) {
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!inside[i]) continue;
        const g = (f[i - 1] + f[i + 1] + f[i - W] + f[i + W] + 4) * 0.25;
        f[i] += w * (g - f[i]);
      }
  }
  return f;
}

// ------------------------------------------------------------ surface nets

// The zero set of G = z^2 - s^2 F(x, y) over a box of cells of size c (px).
// F is sampled at the grid's (x, y) points by fn(x, y). Returns positions
// (px, z in px), triangle indices.
function surfaceNets(Fgrid, nx, ny, x0, y0, c, s2, nz, z0) {
  const N = nx * ny * nz;
  const G = new Float32Array(N);
  for (let k = 0; k < nz; k++) {
    const z = z0 + k * c;
    const zz = z * z;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) G[(k * ny + j) * nx + i] = zz - s2 * Fgrid[j * nx + i];
  }
  const vid = new Int32Array(N).fill(-1);
  const pos = [];
  const E = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const cv = new Float32Array(8);
  const co = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let q = 0; q < 8; q++) {
          const v = G[((k + co[q][2]) * ny + j + co[q][1]) * nx + i + co[q][0]];
          cv[q] = v;
          if (v < 0) mask |= 1 << q;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of E) {
          const va = cv[a];
          const vb = cv[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += co[a][0] + (co[b][0] - co[a][0]) * t;
          sy += co[a][1] + (co[b][1] - co[a][1]) * t;
          sz += co[a][2] + (co[b][2] - co[a][2]) * t;
          n++;
        }
        vid[(k * ny + j) * nx + i] = pos.length / 3;
        pos.push(x0 + (i + sx / n) * c, y0 + (j + sy / n) * c, z0 + (k + sz / n) * c);
      }
  const idx = [];
  const at = (i, j, k) => vid[(k * ny + j) * nx + i];
  const quad = (a, b, cc, d, flip) => {
    if (a < 0 || b < 0 || cc < 0 || d < 0) return;
    if (flip) idx.push(a, cc, b, a, d, cc);
    else idx.push(a, b, cc, a, cc, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const g0 = G[(k * ny + j) * nx + i] < 0;
        // edge along x to (i+1, j, k)
        if (g0 !== G[(k * ny + j) * nx + i + 1] < 0) quad(at(i, j - 1, k - 1), at(i, j, k - 1), at(i, j, k), at(i, j - 1, k), !g0);
        // along y
        if (g0 !== G[(k * ny + j + 1) * nx + i] < 0) quad(at(i - 1, j, k - 1), at(i - 1, j, k), at(i, j, k), at(i, j, k - 1), !g0);
        // along z
        if (g0 !== G[((k + 1) * ny + j) * nx + i] < 0) quad(at(i - 1, j - 1, k), at(i, j - 1, k), at(i, j, k), at(i - 1, j, k), !g0);
      }
  return { pos: new Float32Array(pos), idx };
}

// Taubin smoothing (shrink-free) over the mesh's edges
function taubin(pos, idx, rounds = 4) {
  const n = pos.length / 3;
  const nb = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    nb[a].add(b).add(c);
    nb[b].add(a).add(c);
    nb[c].add(a).add(b);
  }
  const lists = nb.map((s) => [...s]);
  const tmp = new Float32Array(pos.length);
  const step = (lam) => {
    for (let i = 0; i < n; i++) {
      const L = lists[i];
      if (!L.length) {
        tmp[i * 3] = pos[i * 3];
        tmp[i * 3 + 1] = pos[i * 3 + 1];
        tmp[i * 3 + 2] = pos[i * 3 + 2];
        continue;
      }
      let sx = 0, sy = 0, sz = 0;
      for (const j of L) {
        sx += pos[j * 3];
        sy += pos[j * 3 + 1];
        sz += pos[j * 3 + 2];
      }
      const k = 1 / L.length;
      tmp[i * 3] = pos[i * 3] + lam * (sx * k - pos[i * 3]);
      tmp[i * 3 + 1] = pos[i * 3 + 1] + lam * (sy * k - pos[i * 3 + 1]);
      tmp[i * 3 + 2] = pos[i * 3 + 2] + lam * (sz * k - pos[i * 3 + 2]);
    }
    pos.set(tmp);
  };
  for (let r = 0; r < rounds; r++) {
    step(0.55);
    step(-0.58);
  }
}

function vertexNormals(pos, idx) {
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const p of [a, b, c]) {
      nor[p] += nx;
      nor[p + 1] += ny;
      nor[p + 2] += nz;
    }
  }
  for (let i = 0; i < nor.length; i += 3) {
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1;
    nor[i] /= l;
    nor[i + 1] /= l;
    nor[i + 2] /= l;
  }
  return nor;
}

// ------------------------------------------------------------ the doodle

// opts: { canvasW, canvasH (metres), tris (target triangles for the body),
// lod (also a coarse body), size (bounding radius in rest space) }
export function buildDoodle(bits, W, H, opts = {}) {
  const CW = opts.canvasW ?? 0.64;
  const CH = opts.canvasH ?? 0.48;
  const clean = cleanMask(bits, W, H);
  if (clean.empty) return { empty: true, painted: clean.painted };
  const { inside, box } = clean;
  const bg = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) bg[i] = inside[i] ? 0 : 1;
  const D = edt(bg, W, H); // inside: distance to the edge (px)
  const Dout = edt(inside, W, H); // outside: distance to the shape
  const f = poisson(inside, W, H);
  // past the edge, f carries on falling at the edge's own slope, so the surface
  // meets its edge cleanly (G is smooth across it)
  let slope = 0;
  let sn = 0;
  let fmax = 0;
  let maxD = 0;
  for (let i = 0; i < W * H; i++) {
    if (!inside[i]) continue;
    if (D[i] <= 1.01) {
      slope += f[i];
      sn++;
    }
    fmax = Math.max(fmax, f[i]);
    maxD = Math.max(maxD, D[i]);
  }
  slope = Math.max(0.5, sn ? slope / sn : 1);
  const F = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) F[i] = inside[i] ? f[i] : -slope * Dout[i];
  const s = INFLATE;
  const s2 = s * s;
  const hAt = (x, y) => s * Math.sqrt(Math.max(0, sample(F, W, H, x, y)));

  // ---- measurements
  const sw = box.x1 - box.x0 + 1;
  const shh = box.y1 - box.y0 + 1;
  const area = box.n;
  // perimeter, for roundness
  let perim = 0;
  for (let i = 0; i < W * H; i++) if (inside[i] && D[i] <= 1.01) perim++;
  const round = clamp((4 * Math.PI * area) / Math.max(1, perim * perim) / 0.7, 0, 1);
  const stats = { area, width: sw, height: shh, aspect: sw / shh, round, maxD, thin: maxD / Math.max(sw, shh) };

  // ---- features (px space; z in px)
  const feat = placeFeatures({ inside, D, W, H, box, hAt, maxD, area, stats });

  // ---- rest space: x about the feet's middle, y up from the soles, metres scaled to size
  const px = CW / W;
  const ox = feat.rootX; // px
  const oy = feat.groundY; // px
  // bounding radius in px of everything (body and feet)
  const ext = Math.max(sw, box.y1 - oy + 1);
  const Rpx = 0.5 * Math.hypot(sw, box.y1 - oy + 1);
  const size = opts.size ?? 0.15;
  const S = size / (Rpx * px); // rest metres per canvas metre
  const k = px * S; // rest metres per px
  const toRest = (x, y, z) => [(x - ox) * k, (y - oy) * k, z * k];

  // ---- body meshes
  const tris = opts.tris ?? 30000;
  const mk = (target) => {
    // cell size so that each face has about target/4 quads
    let c = clamp(Math.sqrt(area / (target / 9.5)), 0.55, 6);
    const pad = 2;
    let nx, ny, nz, z0;
    const zmax = s * Math.sqrt(fmax) + c * 2;
    for (;;) {
      nx = Math.ceil(sw / c) + 2 * pad + 1;
      ny = Math.ceil(shh / c) + 2 * pad + 1;
      nz = Math.ceil((2 * zmax) / c) + 3;
      if (nx * ny * nz < 5e6) break;
      c *= 1.15;
    }
    z0 = -((nz - 1) / 2) * c;
    const gx0 = box.x0 - pad * c;
    const gy0 = box.y0 - pad * c;
    const Fg = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) Fg[j * nx + i] = sample(F, W, H, gx0 + i * c, gy0 + j * c);
    const net = surfaceNets(Fg, nx, ny, gx0, gy0, c, s2, nz, z0);
    taubin(net.pos, net.idx, 4);
    return { ...net, cell: c };
  };
  const lod0 = mk(tris);
  const lod1 = opts.lod === false ? null : mk(tris / 3.2);

  // ---- skeleton (px space, then rest)
  const bones = feat.bones; // [{ name, parent, pos: [x, y, z] px }]
  const boneIndex = {};
  bones.forEach((b, i) => (boneIndex[b.name] = i));
  const restBones = bones.map((b) => ({ name: b.name, parent: b.parent, pos: toRest(...b.pos) }));
  const weights = (x, y) => bodyWeights(x, y, feat, boneIndex);

  const pack = (net) => {
    if (!net) return null;
    const n = net.pos.length / 3;
    const p = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const swt = new Float32Array(n * 4);
    const tint = new Float32Array(n * 3);
    const mix = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = net.pos[i * 3], y = net.pos[i * 3 + 1], z = net.pos[i * 3 + 2];
      const r = toRest(x, y, z);
      p.set(r, i * 3);
      const w = weights(x, y);
      for (let q = 0; q < 4; q++) {
        si[i * 4 + q] = w[q] ? w[q][0] : 0;
        swt[i * 4 + q] = w[q] ? w[q][1] : 0;
      }
      // the painting shows bright on the front, a little softer on the back
      const h = Math.max(1e-3, hAt(x, y));
      const front = smoothstep(-0.35, 0.35, z / Math.max(h, net.cell));
      tint[i * 3] = 1.0;
      tint[i * 3 + 1] = 0.96;
      tint[i * 3 + 2] = 0.9;
      mix[i * 4] = 0.8 + 0.2 * front;
      mix[i * 4 + 1] = 0;
      mix[i * 4 + 2] = 0.62 - 0.08 * front;
      mix[i * 4 + 3] = 0;
    }
    const index = n > 65535 ? new Uint32Array(net.idx) : new Uint16Array(net.idx);
    // normals in rest space (the scale is uniform, so the px-space normals hold)
    const nor = vertexNormals(p, index);
    return { position: p, normal: nor, index, skinIndex: si, skinWeight: swt, tint, mix, tris: index.length / 3 };
  };

  const fRest = (v) => (Array.isArray(v) ? toRest(...v) : v);
  return {
    empty: false,
    stats,
    scale: S,
    // where the rest origin lies on the canvas, in canvas metres from its centre
    origin: [((ox + 0.5) / W - 0.5) * CW, ((oy + 0.5) / H - 0.5) * CH],
    k,
    bones: restBones,
    body: pack(lod0),
    coarse: pack(lod1),
    eyes: feat.eyes.map((e) => ({ c: toRest(...e.c), r: e.r * k, out: e.out })),
    mouth: feat.mouth ? { pts: feat.mouth.pts.map((p) => fRest(p)), r: feat.mouth.r * k, c: toRest(...feat.mouth.c), w: feat.mouth.w * k } : null,
    cheeks: feat.cheeks.map((c) => ({ c: toRest(...c.c), r: c.r * k })),
    legs: feat.legs.map((l) => ({ top: toRest(...l.top), foot: toRest(...l.foot), r: l.r * k, bone: l.bone })),
    sides: feat.sides,
    heightRest: (box.y1 - oy) * k,
    widthRest: sw * k,
    ext: ext * k,
    silhouette: { inside, W, H },
  };
}

// bilinear sample of a W x H field at px coordinates (pixel centres on integers)
function sample(F, W, H, x, y) {
  const gx = clamp(x, 0, W - 1);
  const gy = clamp(y, 0, H - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(W - 1, x0 + 1);
  const y1 = Math.min(H - 1, y0 + 1);
  const tx = gx - x0;
  const ty = gy - y0;
  return (F[y0 * W + x0] * (1 - tx) + F[y0 * W + x1] * tx) * (1 - ty) + (F[y1 * W + x0] * (1 - tx) + F[y1 * W + x1] * tx) * ty;
}

// ------------------------------------------------------------ features

function placeFeatures({ inside, D, W, H, box, hAt, maxD, area }) {
  const sw = box.x1 - box.x0 + 1;
  const sh = box.y1 - box.y0 + 1;
  const at = (x, y) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0;
    return D[yi * W + xi] * (inside[yi * W + xi] ? 1 : 0);
  };
  // the middle of the upper half, which eyes like to be near
  let ux = 0, un = 0;
  const ymid = box.y0 + sh * 0.5;
  for (let y = Math.floor(ymid); y <= box.y1; y++)
    for (let x = box.x0; x <= box.x1; x++)
      if (inside[y * W + x]) {
        ux += x;
        un++;
      }
  const cxTop = un ? ux / un : box.cx;

  // ---- eyes: the highest place wide enough for two, as big as fits
  const rBig = clamp(0.25 * Math.sqrt(area / Math.PI), 4, 0.5 * maxD + 6);
  let eyes = null;
  const sep = 1.18;
  for (let r = rBig; r >= rBig * 0.6 && !eyes; r *= 0.9) {
    let best = null;
    const step = Math.max(1, Math.floor(r / 4));
    for (let y = box.y1; y >= box.y0; y -= step)
      for (let x = box.x0; x <= box.x1; x += step) {
        if (at(x - sep * r, y) < 1.05 * r || at(x + sep * r, y) < 1.05 * r) continue;
        // high up, near the middle of the top; a little to the right breaks a tie
        // (the come-alive sweeps from the right, so a long friend wakes head first)
        const score = (y - box.y0) / sh - 0.6 * Math.abs(x - cxTop) / sw + 0.08 * (x - box.x0) / sw;
        if (!best || score > best.score) best = { x, y, score };
      }
    if (best) eyes = { x: best.x, y: best.y, r, out: false };
  }
  if (!eyes) {
    // too thin for them: perched on the edge, poking out (a snail's, a noodle's)
    let best = null;
    for (let y = box.y0; y <= box.y1; y++)
      for (let x = box.x0; x <= box.x1; x++) {
        const d = at(x, y);
        if (d <= 0) continue;
        const score = (y - box.y0) / sh + 1.2 * (d / maxD) + 0.25 * (x - box.x0) / sw;
        if (!best || score > best.score) best = { x, y, score, d };
      }
    const r = clamp(Math.max(best.d * 1.05, rBig * 0.72), 4, rBig);
    eyes = { x: best.x, y: best.y + r * 0.35, r, out: true };
  }
  const er = eyes.r;
  const eyeList = [-1, 1].map((side) => {
    const x = eyes.x + side * sep * er;
    const y = eyes.y;
    const h = hAt(x, y);
    // sunk a little into the body; an eye on the edge sits on the rim
    const z = eyes.out ? Math.max(h, er * 0.55) - er * 0.15 : h - er * 0.3;
    return { c: [x, y, z], r: er, out: eyes.out, side };
  });

  // ---- a smile and rosy cheeks
  let mouth = null;
  const cheeks = [];
  {
    const mw = er * 0.95;
    const my = eyes.y - er * 1.45;
    const mx = eyes.x;
    if (at(mx, my) > er * 0.35 && at(mx - mw, my) > 1 && at(mx + mw, my) > 1) {
      const pts = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const u = (i / (n - 1)) * 2 - 1;
        const x = mx + u * mw;
        const y = my + 0.42 * mw * u * u;
        pts.push([x, y, hAt(x, y) + er * 0.02]);
      }
      mouth = { pts, r: er * 0.11, c: [mx, my, hAt(mx, my)], w: mw };
      for (const side of [-1, 1]) {
        const cx = mx + side * er * 1.75;
        const cy = my + er * 0.35;
        if (at(cx, cy) > er * 0.45) cheeks.push({ c: [cx, cy, hAt(cx, cy) - er * 0.05], r: er * 0.42 });
      }
    } else {
      // a little smile tucked between the eyes
      const y = eyes.y - er * 1.1;
      if (at(mx, y) > 0.5) {
        const w = er * 0.6;
        const pts = [];
        for (let i = 0; i < 7; i++) {
          const u = (i / 6) * 2 - 1;
          const x = mx + u * w;
          const yy = y + 0.42 * w * u * u;
          pts.push([x, yy, Math.max(hAt(x, yy), er * 0.3) + er * 0.02]);
        }
        mouth = { pts, r: er * 0.1, c: [mx, y, hAt(mx, y)], w };
      }
    }
  }

  // ---- legs and feet under the bottom edge
  // the lowest painted point of each column
  const bottom = new Float32Array(W).fill(-1);
  for (let x = box.x0; x <= box.x1; x++)
    for (let y = box.y0; y <= box.y1; y++)
      if (inside[y * W + x]) {
        bottom[x] = y;
        break;
      }
  const low = box.y0;
  const wide = sw / sh > 2.1 && maxD < sh * 0.45;
  const legLen = clamp(wide ? 0.4 * sh : 0.13 * sh, 5, 0.25 * Math.max(sw, sh));
  const legR = clamp(0.045 * Math.sqrt(area), 2.2, legLen * 0.55);
  const groundY = low - legLen;
  // columns that reach down near the ground carry the feet
  const tol = Math.max(legLen * 0.9, sh * 0.06);
  const standing = [];
  for (let x = box.x0; x <= box.x1; x++) if (bottom[x] >= 0 && bottom[x] <= low + tol) standing.push(x);
  const sx0 = standing[0];
  const sx1 = standing[standing.length - 1];
  let nLegs = 2;
  if (wide) nLegs = clamp(Math.round(sw / (sh * 0.9)), 2, 6);
  const feetX = [];
  const span = sx1 - sx0;
  if (span < legR * 5) {
    // one narrow bottom (a ball): feet either side of it
    const mid = (sx0 + sx1) / 2;
    const spread = clamp(sw * 0.2, legR * 2.4, sw * 0.32);
    feetX.push(mid - spread, mid + spread);
  } else {
    for (let i = 0; i < nLegs; i++) {
      const u = nLegs === 1 ? 0.5 : 0.18 + (0.64 * i) / (nLegs - 1);
      let x = sx0 + span * u;
      // snap to a standing column
      let bestX = x;
      let bd = Infinity;
      for (const c of standing) if (Math.abs(c - x) < bd) {
        bd = Math.abs(c - x);
        bestX = c;
      }
      feetX.push(bestX);
    }
  }
  const legs = feetX.map((x, i) => {
    const xi = clamp(Math.round(x), box.x0, box.x1);
    let yb = bottom[xi];
    if (yb < 0) yb = low;
    // the leg starts a little way up inside the body
    const top = [x, yb + legR * 1.4, 0];
    const foot = [x, groundY + legR * 0.85, legR * 0.9];
    return { top, foot, r: legR, bone: 'leg' + i };
  });
  const rootX = feetX.reduce((a, b) => a + b, 0) / feetX.length;

  // ---- side lobes (arms, a star's points, a noodle's ends)
  const halfW = sw / 2;
  const cx = (box.x0 + box.x1) / 2;
  const sides = {};
  for (const [name, sgn] of [['sideL', 1], ['sideR', -1]]) {
    let sy = 0, n = 0;
    for (let y = box.y0; y <= box.y1; y++)
      for (let x = box.x0; x <= box.x1; x++) {
        if (!inside[y * W + x]) continue;
        const u = ((x - cx) / halfW) * sgn;
        if (u > 0.55) {
          sy += y;
          n++;
        }
      }
    sides[name] = { y: n ? sy / n : box.cy };
  }

  // ---- bones
  const hipsY = low + sh * 0.18;
  const chestY = low + sh * 0.5;
  const headY = Math.max(chestY + sh * 0.12, Math.min(eyes.y, box.y1 - er * 0.5));
  const bones = [
    { name: 'root', parent: null, pos: [rootX, groundY, 0] },
    { name: 'hips', parent: 'root', pos: [rootX, hipsY, 0] },
    { name: 'chest', parent: 'hips', pos: [cx, chestY, 0] },
    { name: 'head', parent: 'chest', pos: [eyes.x, headY, 0] },
    { name: 'sideL', parent: 'chest', pos: [cx + halfW * 0.38, sides.sideL.y, 0] },
    { name: 'sideR', parent: 'chest', pos: [cx - halfW * 0.38, sides.sideR.y, 0] },
  ];
  for (const e of eyeList) {
    const n = e.side > 0 ? 'L' : 'R';
    bones.push({ name: 'eye' + n, parent: 'head', pos: e.c.slice() });
    bones.push({ name: 'pupil' + n, parent: 'eye' + n, pos: e.c.slice() });
  }
  if (mouth) {
    bones.push({ name: 'mouth', parent: 'head', pos: mouth.c.slice() });
    bones.push({ name: 'gape', parent: 'mouth', pos: mouth.c.slice() });
  }
  legs.forEach((l) => bones.push({ name: l.bone, parent: 'root', pos: l.top.slice() }));

  return {
    eyes: eyeList,
    mouth,
    cheeks,
    legs,
    rootX,
    groundY,
    bones,
    sides: { cx, halfW, low, sh, eyesOut: eyes.out },
    box,
  };
}

// a body vertex's bones: hips, chest and head up its height, the side lobes out
// to its edges; up to four [bone, weight] pairs
function bodyWeights(x, y, feat, I) {
  const { cx, halfW, low, sh } = feat.sides;
  const v = (y - low) / sh;
  let wh = 1 - smoothstep(0.08, 0.5, v);
  let wt = smoothstep(0.52, 0.92, v);
  let wc = Math.max(0, 1 - wh - wt);
  const u = (x - cx) / halfW;
  const side = smoothstep(0.42, 0.95, Math.abs(u)) * 0.95;
  const keep = 1 - side;
  wh *= keep;
  wc *= keep;
  wt *= keep;
  const out = [
    [I.hips, wh],
    [I.chest, wc],
    [I.head, wt],
    [u > 0 ? I.sideL : I.sideR, side],
  ];
  const sum = out.reduce((s, w) => s + w[1], 0) || 1;
  for (const w of out) w[1] /= sum;
  return out;
}

// ------------------------------------------------------------ keeping

// a W x H bit mask as base64 and back (records keep the drawing's mask)
export function packBits(bits) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function unpackBits(b64, n) {
  const s = atob(b64);
  const bits = new Uint8Array(n);
  for (let i = 0; i < n; i++) bits[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return bits;
}
