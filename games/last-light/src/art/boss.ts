// The Choked Star, painted in vector at any density: a fallen star (white-gold core, four-point rays)
// caged by gnarled, thorned roots that grow out of a broken ring of weathered stone, with stone shards
// caught in its pull. Phase 2 (the *2 animations) cracks roots, stone and core with magenta corruption;
// the dying frames break the cage apart while the star rises free and bursts. Faces the viewer; the view
// never mirrors it.
//
// Draw order, back to front: ground and pit, back roots, far half of the ring, far shards, the star,
// front roots (side roots, the cradle under the core, the strangler across it), near half of the ring
// (with draped tendrils and leaves), near shards. Roots carry their own ink, rims and shading and are
// painted in batches (one fill per pass for every root of a group that does not overlap another), so a
// cage of a dozen roots stays cheap. The emissive layer holds the star (core, rays, halo), the pit's
// glow, runes, corruption and warm rims where roots face the core; front roots are blacked out of the
// star's light there so they read in front of it.
// Painting cost (46 frames at boot): ring and pit layers are painted once per density and stamped, frames
// that share a cage of roots stamp one painted cage (both phases share it; phase 2 lays its corruption on
// top), and a painter skips the atlas builder's tiny scratch context. All of these caches empty after
// boot. The thorn walls and root spikes (phase-2 hazards) are separate sets at the end of the file.
import { TAU, bez, css, glow, layer, lin, mix, noise2, rad, rng, scaleOf, type Ctx } from './paint';
import type { Painter, SpriteSet } from './sprite';

export const BOSS_W = 96;
export const BOSS_H = 100;
export const BOSS_FOOT = 86; // ground centre of the stone ring
/** Core centre relative to the feet, in world units (for lights and glows). */
export const BOSS_CORE = { x: 0, y: -42 };

const CX = 48, GY = BOSS_FOOT, KX = 48, KY = BOSS_FOOT + BOSS_CORE.y;

// ---- colours ----------------------------------------------------------------------------------------

const INK = 0x07060c;
// Wet dark bark, a little plum, lit from the upper left.
const BARK = { d: 0x221a22, s: 0x382e37, b: 0x4c414b, m: 0x67595a, l: 0x8a786e, h: 0xb19c88, bone: 0xd8ccb4, pale: 0xb39a7c };
const WET = 0xc3d0f2;
const STONE = { g: 0x111319, d: 0x2a303c, s: 0x3b4250, b: 0x515a6a, m: 0x667084, l: 0x808b9e, h: 0xaab3c4 };
const MOSS = { d: 0x183a33, b: 0x285c4b, l: 0x3f8165, h: 0x74b48a };
const LEAF = { d: 0x0d2226, b: 0x173f45, m: 0x215a5e, l: 0x307a78, h: 0x56a89c };
const STAR = { white: 0xfffef4, core: 0xfff3cf, warm: 0xffd98a, amber: 0xffb347, deep: 0xe07a1f, ember: 0x8a3412 };
const CORR = { d: 0x4a1040, m: 0x7a1f62, c: 0xe04bb0, l: 0xff9be0, w: 0xffe3f6 };
const LX = -0.6, LY = -0.8; // toward the moonlight

interface Pose {
  pulse: number; // -1..1 core breathing
  tight: number; // 0..1 roots constrict (windup)
  open: number; // 0..1 roots pulled apart (vent)
  flare: number; // 0..1 rays flare (cast)
  shard: number; // radians, orbit phase of the floating stones
  p2: boolean;
  hurt: boolean;
  thrash: number; // 0..1 roots writhe (phase transition)
  thrashPh: number;
  die: number; // 0 = alive, then 0..1 through the death
}

/** The atlas builder paints each frame twice, once per layer, handing a 4x4 scratch for the other. */
const live = (c: Ctx) => c.canvas.width > 8 || c.canvas.height > 8;
const NZ = noise2(911);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---- cached static layers -------------------------------------------------------------------------

const cache = new Map<string, HTMLCanvasElement>();
let clearing = false;
/** Every boot-time cache empties once the synchronous atlas painting is over. */
function soon() {
  if (clearing) return;
  clearing = true;
  setTimeout(() => { cache.clear(); cages.clear(); overlays.clear(); rootSets.clear(); clearing = false; }, 0);
}
/** Paint a region once per density and key, then stamp it. The cache empties once boot painting ends. */
function cached(g: Ctx, key: string, x: number, y: number, w: number, h: number, paint: (c: Ctx) => void) {
  const d = scaleOf(g);
  const k = `${key}@${d.toFixed(3)}`;
  let c = cache.get(k);
  if (!c) {
    const L = layer(w, h, d);
    L.g.translate(-x, -y);
    paint(L.g);
    c = L.c;
    cache.set(k, c);
    soon();
  }
  g.drawImage(c, x, y, c.width / d, c.height / d);
}

const cages = new Map<string, { key: string; c: HTMLCanvasElement; g: Ctx }>();
/**
 * Frames often share a cage of roots (only the star breathes inside it): paint it once per density and
 * key, then stamp it. `keep` holds every key (the two phases share cages); otherwise only the last one.
 */
function cage(g: Ctx, slot: string, key: string, paint: (c: Ctx) => void, keep = false) {
  const d = scaleOf(g), id = `${slot}@${d.toFixed(3)}${keep ? '|' + key : ''}`;
  let C = cages.get(id);
  if (!C) {
    const L = layer(BOSS_W, BOSS_H, d);
    C = { key: '', c: L.c, g: L.g };
    cages.set(id, C);
    soon();
  }
  if (C.key !== key) {
    C.g.save(); C.g.setTransform(1, 0, 0, 1, 0, 0); C.g.clearRect(0, 0, C.c.width, C.c.height); C.g.restore();
    paint(C.g);
    C.key = key;
  }
  g.drawImage(C.c, 0, 0, BOSS_W, BOSS_H);
}

// ---- strands: roots as centre lines with widths -----------------------------------------------------

interface Strand { n: number; x: number[]; y: number[]; tx: number[]; ty: number[]; nx: number[]; ny: number[]; w: number[]; bb: [number, number, number, number] }

function arcLen(p: number[]) {
  let l = 0;
  for (let i = 2; i < p.length; i += 2) l += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return l;
}
function resample(p: number[], n: number): number[] {
  const m = p.length / 2, L = [0];
  for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]));
  const tot = L[m - 1] || 1, out: number[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * tot;
    while (j < m - 2 && L[j + 1] < s) j++;
    const t = (s - L[j]) / (L[j + 1] - L[j] || 1);
    out.push(p[j * 2] + (p[j * 2 + 2] - p[j * 2]) * t, p[j * 2 + 1] + (p[j * 2 + 3] - p[j * 2 + 1]) * t);
  }
  return out;
}
/** Bend a smooth path into a gnarled one: smooth perpendicular wobble growing toward the tip. */
function gnarl(p: number[], seed: number, amp: number): number[] {
  const n = p.length / 2, out = p.slice();
  for (let i = 1; i < n; i++) {
    const a = i - 1, b = Math.min(n - 1, i + 1);
    const tx = p[b * 2] - p[a * 2], ty = p[b * 2 + 1] - p[a * 2 + 1], l = Math.hypot(tx, ty) || 1;
    const u = i / (n - 1);
    const k = (NZ(u * 5.5 + seed * 3.1, seed * 1.7) - 0.5) * 2 * amp * Math.min(1, u * 3);
    out[i * 2] += (-ty / l) * k; out[i * 2 + 1] += (tx / l) * k;
  }
  return out;
}
function mkStrand(p: number[], wAt: (t: number) => number): Strand {
  const n = p.length / 2;
  const s: Strand = { n, x: [], y: [], tx: [], ty: [], nx: [], ny: [], w: [], bb: [1e9, 1e9, -1e9, -1e9] };
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let dx = p[b * 2] - p[a * 2], dy = p[b * 2 + 1] - p[a * 2 + 1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = wAt(n > 1 ? i / (n - 1) : 0);
    s.x.push(p[i * 2]); s.y.push(p[i * 2 + 1]); s.tx.push(dx); s.ty.push(dy); s.nx.push(-dy); s.ny.push(dx); s.w.push(w);
    s.bb[0] = Math.min(s.bb[0], p[i * 2] - w); s.bb[1] = Math.min(s.bb[1], p[i * 2 + 1] - w);
    s.bb[2] = Math.max(s.bb[2], p[i * 2] + w); s.bb[3] = Math.max(s.bb[3], p[i * 2 + 1] + w);
  }
  s.bb[0] -= 4; s.bb[1] -= 4; s.bb[2] += 4; s.bb[3] += 4; // room for thorns
  return s;
}
/** A root: tapered with knots along it and a flare where it grips the ground. */
function rootStrand(pts: number[], w0: number, w1: number, seed: number, flare = 0.3): Strand {
  const P = resample(pts, Math.max(8, Math.round(arcLen(pts) / 2.5)));
  return mkStrand(P, (t) => {
    const base = w1 + (w0 - w1) * Math.pow(1 - t, 1.5);
    const knot = 1 + 0.22 * (NZ(t * 7 + seed * 1.37, seed * 2.1) - 0.5) * 2;
    return base * knot + (t < 0.1 ? ((0.1 - t) / 0.1) * w0 * flare : 0);
  });
}
/** Part of a strand, optionally rotated by `ang` about its first point and moved by (ox, oy). */
function piece(s: Strand, i0: number, i1: number, ang = 0, ox = 0, oy = 0): Strand {
  const px = s.x[i0], py = s.y[i0], c = Math.cos(ang), sn = Math.sin(ang);
  const p: number[] = [], w: number[] = [];
  for (let i = i0; i <= i1; i++) {
    const dx = s.x[i] - px, dy = s.y[i] - py;
    p.push(px + dx * c - dy * sn + ox, py + dx * sn + dy * c + oy);
    w.push(s.w[i]);
  }
  return mkStrand(p, (t) => w[Math.round(t * (w.length - 1))]);
}

function trace(g: Ctx | Path2D, xs: number[], ys: number[], move: boolean) {
  const m = xs.length;
  if (move) g.moveTo(xs[0], ys[0]); else g.lineTo(xs[0], ys[0]);
  for (let i = 1; i < m - 1; i++) g.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
  if (m > 1) g.lineTo(xs[m - 1], ys[m - 1]);
}
/** The strand's outline (grown by `grow` units) with round caps, as a new path. */
function strandPath(g: Ctx | Path2D, s: Strand, grow = 0, fresh = true) {
  const lx: number[] = [], ly: number[] = [], rx: number[] = [], ry: number[] = [];
  for (let i = 0; i < s.n; i++) {
    const h = Math.max(0.05, s.w[i] / 2 + grow);
    lx.push(s.x[i] + s.nx[i] * h); ly.push(s.y[i] + s.ny[i] * h);
    rx.push(s.x[i] - s.nx[i] * h); ry.push(s.y[i] - s.ny[i] * h);
  }
  if (fresh && g instanceof CanvasRenderingContext2D) g.beginPath();
  trace(g, lx, ly, true);
  const e = s.n - 1, he = Math.max(0.05, s.w[e] / 2 + grow), ae = Math.atan2(s.ny[e], s.nx[e]);
  g.arc(s.x[e], s.y[e], he, ae, ae + Math.PI, true);
  rx.reverse(); ry.reverse();
  trace(g, rx, ry, false);
  const hb = Math.max(0.05, s.w[0] / 2 + grow), ab = Math.atan2(-s.ny[0], -s.nx[0]);
  g.arc(s.x[0], s.y[0], hb, ab, ab + Math.PI, true);
  g.closePath();
}
/** A band inside the strand: centre shifted by (sx, sy) half-widths, half-width scaled by wk. */
function ribbonPath(g: Ctx | Path2D, s: Strand, sx: number, sy: number, wk: number) {
  const lx: number[] = [], ly: number[] = [], rx: number[] = [], ry: number[] = [];
  for (let i = 0; i < s.n; i++) {
    const h = s.w[i] / 2, cx = s.x[i] + sx * h, cy = s.y[i] + sy * h, hh = h * wk;
    lx.push(cx + s.nx[i] * hh); ly.push(cy + s.ny[i] * hh);
    rx.push(cx - s.nx[i] * hh); ry.push(cy - s.ny[i] * hh);
  }
  if (g instanceof CanvasRenderingContext2D) g.beginPath();
  trace(g, lx, ly, true);
  rx.reverse(); ry.reverse();
  trace(g, rx, ry, false);
  g.closePath();
}
/** Runs of consecutive indices where f(i) is a non-zero sign; returns [i0, i1, sign]. */
function runs(n: number, f: (i: number) => number, min = 2): [number, number, number][] {
  const out: [number, number, number][] = [];
  let st = -1, sg = 0;
  for (let i = 0; i <= n; i++) {
    const v = i < n ? f(i) : 0;
    if (v !== sg) {
      if (sg !== 0 && i - 1 - st >= min - 1) out.push([st, i - 1, sg]);
      st = i; sg = v;
    }
  }
  return out;
}

// ---- thorns ---------------------------------------------------------------------------------------

interface Thorn { b1x: number; b1y: number; c1x: number; c1y: number; px: number; py: number; c2x: number; c2y: number; b2x: number; b2y: number; mx: number; my: number; hot: boolean }

function thornsOf(s: Strand, seed: number, gap: number, scale: number, from = 0.12, to = 0.96): Thorn[] {
  const r = rng(seed * 7717 + 3);
  const out: Thorn[] = [];
  let acc = gap * (0.3 + r() * 0.6), side = r() < 0.5 ? 1 : -1;
  for (let i = 1; i < s.n - 1; i++) {
    acc -= Math.hypot(s.x[i] - s.x[i - 1], s.y[i] - s.y[i - 1]);
    const t = i / (s.n - 1);
    if (acc > 0 || t < from || t > to) continue;
    acc = gap * (0.7 + r() * 0.6);
    side = r() < 0.75 ? -side : side;
    const h = s.w[i] / 2, nx = s.nx[i] * side, ny = s.ny[i] * side, tx = s.tx[i], ty = s.ty[i];
    const len = (1.2 + s.w[i] * 0.3) * (0.75 + r() * 0.55) * scale;
    const bw = (0.45 + s.w[i] * 0.08) * scale;
    const bx = s.x[i] + nx * (h - 0.3), by = s.y[i] + ny * (h - 0.3);
    const lean = 0.4 + r() * 0.35;
    const px = bx + nx * len + tx * len * lean, py = by + ny * len + ty * len * lean;
    out.push({
      b1x: bx - tx * bw, b1y: by - ty * bw,
      c1x: bx + nx * len * 0.55 + tx * len * 0.05, c1y: by + ny * len * 0.55 + ty * len * 0.05,
      px, py,
      c2x: bx + nx * len * 0.3 + tx * (bw * 0.8 + len * 0.3), c2y: by + ny * len * 0.3 + ty * (bw * 0.8 + len * 0.3),
      b2x: bx + tx * bw, b2y: by + ty * bw, mx: bx, my: by, hot: r() < 0.45,
    });
  }
  return out;
}
function thornPath(p: Path2D | Ctx, t: Thorn) {
  p.moveTo(t.b1x, t.b1y);
  p.quadraticCurveTo(t.c1x, t.c1y, t.px, t.py);
  p.quadraticCurveTo(t.c2x, t.c2y, t.b2x, t.b2y);
  p.closePath();
}
const q2 = (a: number, c: number, b: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
function thornTip(p: Path2D | Ctx, t: Thorn, k = 0.62) {
  p.moveTo(q2(t.b1x, t.c1x, t.px, k), q2(t.b1y, t.c1y, t.py, k));
  p.lineTo(t.px, t.py);
  p.lineTo(q2(t.px, t.c2x, t.b2x, 1 - k), q2(t.py, t.c2y, t.b2y, 1 - k));
  p.closePath();
}

// ---- painting a root ------------------------------------------------------------------------------
// Everything inside a root is a filled band along its centre line (fills are far cheaper than thin
// strokes on the CPU rasteriser) and stays inside the outline by construction, so nothing is clipped.

interface Rim { x: number; y: number; r: number; col: number; col2: number; e: number; /** how much the light tints the bark (1 = star) */ tint?: number }
interface Look {
  p2: boolean;
  die: number;
  moss: boolean;
  /** A light whose facing edges get a warm rim (the star, or a glowing crack below). */
  rim: Rim | null;
  /** Light bleeding through cracks in the bark as the cage breaks (dying). */
  burn: number;
  alpha: number;
}
interface Root {
  s: Strand; th: Thorn[]; seed: number; look: Look; veins: [number, number][]; buds: number[]; burns: number[];
  /** Strand points and thorns lying under a root painted later (the phase-2 overlay skips them). */
  hid?: Uint8Array; hidT?: Uint8Array;
}

/** Corruption fissures zigzag across the bark. */
const veinV = (seed: number) => (i: number) => 0.1 * Math.sin(i * 0.4 + seed) + (((i * 7 + seed) % 3) - 1) * 0.22;

function makeRoot(s: Strand, seed: number, look: Look, gap = 3.4, scale = 1, budGap = 10): Root {
  const th = thornsOf(s, seed, gap, scale);
  const veins: [number, number][] = [], buds: number[] = [];
  if (look.p2) {
    for (const [a, b] of runs(s.n - 1, (i) => (i >= R0(s) && NZ(i * 0.45 + seed * 0.7, seed * 3.3) > 0.52 ? 1 : 0), 3)) veins.push([a, b]);
    const r = rng(seed * 31 + 5);
    let acc = 3 + r() * 4;
    for (let i = Math.max(2, R0(s)); i < s.n - 3; i++) {
      acc -= Math.hypot(s.x[i] - s.x[i - 1], s.y[i] - s.y[i - 1]);
      if (acc > 0 || s.w[i] < 2.4) continue;
      acc = budGap + r() * budGap * 0.7;
      const v = (r() < 0.5 ? -1 : 1) * 0.42 * (s.w[i] / 2);
      buds.push(s.x[i] + s.nx[i] * v, s.y[i] + s.ny[i] * v, Math.min(1.5, 0.75 + s.w[i] * 0.09), i);
    }
  }
  const burns: number[] = [];
  if (look.burn > 0) {
    const r = rng(seed * 97 + 1);
    for (let i = Math.max(2, R0(s)); i < s.n - 2; i += 3 + Math.floor(r() * 3)) if (s.w[i] > 2) burns.push(i);
  }
  return { s, th, seed, look, veins, buds, burns };
}

/**
 * Add filled bands to path p along the strand: the centre at lateral offset v(i) half-widths, half-width
 * hw(i) units, broken into tapered dashes by the `dash` pattern (lengths in units, on/off alternating).
 */
function bands(p: Path2D, s: Strand, v: (i: number) => number, hw: (i: number) => number, i0 = 0, i1 = s.n - 1, dash: number[] | null = null, off = 0) {
  if (i1 - i0 < 1) return;
  const m = i1 - i0 + 1;
  const X = new Float64Array(m), Y = new Float64Array(m), W = new Float64Array(m), A = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    const i = i0 + j, h = (s.w[i] / 2) * v(i);
    X[j] = s.x[i] + s.nx[i] * h; Y[j] = s.y[i] + s.ny[i] * h; W[j] = hw(i);
    if (j) A[j] = A[j - 1] + Math.hypot(X[j] - X[j - 1], Y[j] - Y[j - 1]);
  }
  const NX = s.nx, NY = s.ny;
  // One closed band from arc length d0 to d1, its ends pinched when dashed.
  const ex: number[] = [], ey: number[] = [], en: number[] = [], em: number[] = [], ew: number[] = [];
  const emit = (d0: number, d1: number, j0: number) => {
    ex.length = ey.length = en.length = em.length = ew.length = 0;
    let j = j0;
    const push = (d: number) => {
      while (j < m - 2 && A[j + 1] < d) j++;
      const t = Math.max(0, Math.min(1, (d - A[j]) / (A[j + 1] - A[j] || 1))), u = 1 - t;
      ex.push(X[j] * u + X[j + 1] * t); ey.push(Y[j] * u + Y[j + 1] * t);
      en.push(NX[i0 + j] * u + NX[i0 + j + 1] * t); em.push(NY[i0 + j] * u + NY[i0 + j + 1] * t); ew.push(W[j] * u + W[j + 1] * t);
    };
    push(d0);
    for (let k = j + 1; k < m && A[k] < d1; k++) if (A[k] > d0) { ex.push(X[k]); ey.push(Y[k]); en.push(NX[i0 + k]); em.push(NY[i0 + k]); ew.push(W[k]); }
    push(d1);
    const k = ex.length;
    for (let q = 0; q < k; q++) {
      const w = dash ? ew[q] * Math.min(1, Math.min(q, k - 1 - q) / 1.2 + 0.25) : ew[q];
      if (q) p.lineTo(ex[q] + en[q] * w, ey[q] + em[q] * w); else p.moveTo(ex[q] + en[q] * w, ey[q] + em[q] * w);
    }
    for (let q = k - 1; q >= 0; q--) {
      const w = dash ? ew[q] * Math.min(1, Math.min(q, k - 1 - q) / 1.2 + 0.25) : ew[q];
      p.lineTo(ex[q] - en[q] * w, ey[q] - em[q] * w);
    }
    p.closePath();
    return j;
  };
  const tot = A[m - 1];
  if (!dash) { emit(0, tot, 0); return; }
  let total = 0;
  for (const x of dash) total += x;
  let d = -(off % total), k = 0, j = 0;
  while (d < tot) {
    const len = dash[k % dash.length];
    if (k % 2 === 0 && Math.min(tot, d + len) - Math.max(0, d) > 0.3) j = emit(Math.max(0, d), Math.min(tot, d + len), j);
    d += len; k++;
  }
}

/** Roots grow from behind the ring: their glows start a little way up. */
const R0 = (s: Strand) => Math.floor(s.n * 0.18);
function rimFacing(s: Strand, R: Rim, i: number) {
  const dx = R.x - s.x[i], dy = R.y - s.y[i], d = Math.hypot(dx, dy) || 1;
  if (d > R.r) return 0;
  const f = (s.nx[i] * dx + s.ny[i] * dy) / d;
  return f > 0.28 ? 1 : f < -0.28 ? -1 : 0;
}
/** The rim band toward the light: inset from the edge, thicker the closer the light. */
function rimBands(p: Path2D, s: Strand, Rm: Rim, k: number) {
  const fall = (i: number) => clamp01(1 - Math.hypot(Rm.x - s.x[i], Rm.y - s.y[i]) / Rm.r);
  for (const [a, b, sg] of runs(s.n, (i) => rimFacing(s, Rm, i))) {
    bands(p, s, (i) => sg * Math.max(0, 1 - (0.1 + 0.3 * fall(i) * k) / Math.max(0.2, s.w[i] / 2)), (i) => Math.min(s.w[i] * 0.22, 0.06 + 0.3 * fall(i) * k), Math.max(a, R0(s)), b);
  }
}
function burnPath(s: Strand, burns: number[], seed: number, wk: number): Path2D {
  const p = new Path2D(), r = rng(seed * 13 + 9);
  for (const i of burns) {
    const h = s.w[i] / 2;
    // A jagged split across the bark, widest in the middle.
    const pts: number[] = [];
    for (let k = 0; k <= 4; k++) {
      const v = 0.7 - (k / 4) * 1.4, j = (r() - 0.5) * 1.3;
      pts.push(s.x[i] + s.nx[i] * h * v + s.tx[i] * j, s.y[i] + s.ny[i] * h * v + s.ty[i] * j);
    }
    const wd = [0.05, 0.35, 0.5, 0.35, 0.05].map((x) => x * wk);
    p.moveTo(pts[0], pts[1]);
    for (let k = 1; k <= 4; k++) p.lineTo(pts[k * 2] + s.tx[i] * wd[k], pts[k * 2 + 1] + s.ty[i] * wd[k]);
    for (let k = 3; k >= 1; k--) p.lineTo(pts[k * 2] - s.tx[i] * wd[k], pts[k * 2 + 1] - s.ty[i] * wd[k]);
    p.closePath();
  }
  return p;
}
/** Thorn grown outward by k units (its ink). */
function thornInk(p: Path2D, t: Thorn, k: number) {
  const ux = t.b2x - t.b1x, uy = t.b2y - t.b1y, ul = Math.hypot(ux, uy) || 1, tx = ux / ul, ty = uy / ul;
  const dx = t.px - t.mx, dy = t.py - t.my, dl = Math.hypot(dx, dy) || 1;
  p.moveTo(t.b1x - tx * k, t.b1y - ty * k);
  p.quadraticCurveTo(t.c1x - tx * k, t.c1y - ty * k, t.px + (dx / dl) * k * 1.3, t.py + (dy / dl) * k * 1.3);
  p.quadraticCurveTo(t.c2x + tx * k, t.c2y + ty * k, t.b2x + tx * k, t.b2y + ty * k);
  p.closePath();
}

// Roots are painted in batches: every root of a group adds its bands to shared paths, one per pass and
// style, so a cage of a dozen roots costs a few dozen fills instead of a couple of hundred. Roots that
// overlap go to later groups so the one drawn later still lies on top.

type Style = (g: Ctx) => string | CanvasGradient;
interface Pass { o: number; seq: number; alpha: number; style: Style; op: GlobalCompositeOperation | null; p: Path2D }
class Batch {
  private m = new Map<string, Pass>();
  private seq = 0;
  /** The path of pass `o` (lower first) for one style; `key` names the style. */
  at(o: number, key: string, alpha: number, style: Style | string, op: GlobalCompositeOperation | null = null): Path2D {
    const k = `${o}|${key}|${alpha}`;
    let P = this.m.get(k);
    if (!P) {
      const st = typeof style === 'string' ? () => style : style;
      P = { o, seq: this.seq++, alpha, style: st, op, p: new Path2D() };
      this.m.set(k, P);
    }
    return P.p;
  }
  paint(g: Ctx) {
    const list = [...this.m.values()].sort((a, b) => a.o - b.o || a.seq - b.seq);
    for (const P of list) {
      g.globalAlpha = P.alpha;
      if (P.op) g.globalCompositeOperation = P.op;
      g.fillStyle = P.style(g);
      g.fill(P.p);
      if (P.op) g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = 1;
  }
}

/** How far a root's thorns reach past its bark. */
function reach(R: Root) {
  let m = 0.6;
  for (const t of R.th) m = Math.max(m, Math.hypot(t.px - t.mx, t.py - t.my) + 0.6);
  return m;
}
/** Whether two roots (with their thorns and ink) could touch. */
function touch(A: Root, B: Root, ra: number, rb: number) {
  const a = A.s, b = B.s;
  if (a.bb[2] < b.bb[0] || b.bb[2] < a.bb[0] || a.bb[3] < b.bb[1] || b.bb[3] < a.bb[1]) return false;
  for (let i = 0; i < a.n; i++) {
    const xa = a.x[i], ya = a.y[i], wa = a.w[i] / 2 + ra;
    for (let j = 0; j < b.n; j++) {
      const r = wa + b.w[j] / 2 + rb, dx = b.x[j] - xa, dy = b.y[j] - ya;
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}
/** Split roots (in draw order) into groups none of whose members touch, keeping overlaps in order. */
function groups(roots: Root[]): Root[][] {
  const gi: number[] = [], rr = roots.map(reach), out: Root[][] = [];
  roots.forEach((R, a) => {
    let k = 0;
    for (let b = 0; b < a; b++) if (gi[b] >= k && touch(roots[b], R, rr[b], rr[a])) k = gi[b] + 1;
    gi.push(k);
    (out[k] ??= []).push(R);
  });
  return out.filter(Boolean);
}
type Parts = 'all' | 'base' | 'p2';
/**
 * Paint roots in draw order, a group at a time. 'base' leaves out the phase-2 corruption so both phases
 * can share one painted cage; 'p2' is that corruption alone, laid over it afterwards (marks that a later
 * root covers are left out, so the overlay never shows through).
 */
function paintRoots(g: Ctx, roots: Root[], parts: Parts = 'all') {
  if (parts === 'p2') { overlayBatch(roots).paint(g); return; }
  for (const list of groups(roots)) {
    const B = new Batch();
    for (const R of list) rootInto(B, R, parts);
    B.paint(g);
  }
}
const overlays = new Map<Root[], Batch>();
function overlayBatch(roots: Root[]): Batch {
  let B = overlays.get(roots);
  if (B) return B;
  const gs = groups(roots), gi = new Map<Root, number>();
  gs.forEach((l, k) => l.forEach((R) => gi.set(R, k)));
  for (const R of roots) {
    const a = R.s, hid = new Uint8Array(a.n), hidT = new Uint8Array(R.th.length);
    for (const Q of roots) {
      if (gi.get(Q)! <= gi.get(R)!) continue;
      const b = Q.s;
      if (a.bb[2] < b.bb[0] || b.bb[2] < a.bb[0] || a.bb[3] < b.bb[1] || b.bb[3] < a.bb[1]) continue;
      const inside = (x: number, y: number) => {
        for (let j = 0; j < b.n; j++) { const r = b.w[j] / 2 + 0.9, dx = b.x[j] - x, dy = b.y[j] - y; if (dx * dx + dy * dy < r * r) return true; }
        return false;
      };
      for (let i = 0; i < a.n; i++) if (!hid[i] && inside(a.x[i], a.y[i])) hid[i] = 1;
      R.th.forEach((t, k) => { if (!hidT[k] && inside(t.px, t.py)) hidT[k] = 1; });
    }
    R.hid = hid; R.hidT = hidT;
  }
  B = new Batch();
  for (const R of roots) rootInto(B, R, 'p2');
  overlays.set(roots, B);
  return B;
}

function rootInto(B: Batch, R: Root, parts: Parts = 'all') {
  const { s, th, seed, look: L } = R;
  const [x0, y0, x1, y1] = s.bb;
  const al = L.alpha;
  if (parts === 'p2') { corruptInto(B, R); return; }
  // Ink round the root and its thorns, then the thorns, then the bark over their bases.
  const ink = B.at(0, 'ink', al, css(INK));
  if (th.length) {
    const tp = B.at(1, 'thorn', al, css(BARK.m)), tips = B.at(2, 'tip', al, css(BARK.bone));
    for (const t of th) { thornInk(ink, t, 0.55); thornPath(tp, t); thornTip(tips, t); }
  }
  strandPath(ink, s, 0.62, false);
  // Bark: warm where it faces the star, cooler and darker away from it.
  const Rm = L.rim;
  const body = Rm
    ? B.at(3, `rim${Rm.x},${Rm.y},${Rm.r},${Rm.col},${Rm.col2},${Rm.tint}`, al, (g) => {
      const tk = Rm.tint ?? 1, warm = mix(BARK.l, Rm.col, 0.32 * tk), w2 = mix(BARK.m, Rm.col2, 0.2 * tk);
      return rad(g, Rm.x, Rm.y, 0, Rm.r * 1.15, [[0, css(warm)], [0.3, css(w2)], [0.62, css(BARK.b)], [1, css(BARK.s)]]);
    })
    : B.at(3, `lin${x0},${y0},${x1},${y1}`, al, (g) => lin(g, x0, y0, x1, y1, [[0, css(BARK.m)], [0.5, css(BARK.b)], [1, css(BARK.s)]]));
  strandPath(body, s, 0, false);
  // Cylinder shading: shadow band lower right, lit band upper left.
  ribbonPath(B.at(4, 'rd', al, css(BARK.d, 0.7)), s, 0.27, 0.36, 0.52);
  ribbonPath(B.at(5, 'rl', al, css(BARK.l, 0.55)), s, -0.23, -0.3, 0.5);
  // Twisted bark fibres (dark dashed grooves) and growth-ring notches.
  let thin = s.n - 1;
  for (let i = 0; i < s.n; i++) if (s.w[i] < 2.1) { thin = i; break; }
  if (thin > 2 && L.die < 0.3) {
    const rn = B.at(6, 'groove', al, css(BARK.d, 0.82)), r = rng(seed * 5 + 1);
    for (let k = 0; k < 2; k++) {
      const b = -0.42 + k * 0.62, ph = seed + k * 2.1;
      bands(rn, s, (i) => b + 0.2 * Math.sin(i * 0.33 + ph), (i) => Math.min(0.22, s.w[i] * 0.045), 0, thin, [4.4, 1.1, 2.2, 0.9, 6.5, 1.4], seed * 1.7 + k * 3);
    }
    let acc = 2 + r() * 2;
    for (let i = 2; i < thin; i++) {
      acc -= Math.hypot(s.x[i] - s.x[i - 1], s.y[i] - s.y[i - 1]);
      if (acc > 0) continue;
      acc = 3.6 + r() * 2.5;
      const h = (s.w[i] / 2) * 0.82, tx = s.tx[i], ty = s.ty[i], nx = s.nx[i], ny = s.ny[i], cx = s.x[i], cy = s.y[i];
      rn.moveTo(cx + nx * h + tx * 0.5, cy + ny * h + ty * 0.5);
      rn.quadraticCurveTo(cx - tx * 0.55, cy - ty * 0.55, cx - nx * h + tx * 0.5, cy - ny * h + ty * 0.5);
      rn.quadraticCurveTo(cx - tx * 0.05, cy - ty * 0.05, cx + nx * h + tx * 0.5, cy + ny * h + ty * 0.5);
    }
  }
  // Wet moonlit streaks along whichever edge faces the moon.
  if (s.w[0] > 2.5 && L.die < 0.5) {
    const sp = B.at(7, 'wet', al, css(WET, 0.5));
    for (const [a, b, sg] of runs(s.n, (i) => { const f = s.nx[i] * LX + s.ny[i] * LY; return f > 0.4 ? 1 : f < -0.4 ? -1 : 0; })) {
      bands(sp, s, (i) => sg * Math.max(0, Math.min(0.74, 1 - 0.4 / Math.max(0.2, s.w[i] / 2))), (i) => Math.min(0.24, s.w[i] * 0.07), a, b);
    }
  }
  // Moss on the upper side near the base.
  if (L.moss && L.die < 0.3) {
    const mb = B.at(8, 'moss', al, css(MOSS.b)), ml = B.at(9, 'mossL', al, css(MOSS.l, 0.9));
    const r = rng(seed * 3 + 2);
    const end = Math.floor(s.n * 0.32);
    for (let i = 1; i < end; i++) {
      const sg = s.ny[i] < 0 ? 1 : -1, h = s.w[i] / 2;
      const rr = Math.min(h * 0.45, (0.7 + r() * 0.9) * (1 - (i / end) * 0.5));
      const x = s.x[i] + s.nx[i] * sg * h * 0.55, y = s.y[i] + s.ny[i] * sg * h * 0.55;
      mb.moveTo(x + rr, y); mb.ellipse(x, y, rr, rr * 0.8, 0, 0, TAU);
      ml.moveTo(x - rr * 0.2 + rr * 0.45, y - rr * 0.3); ml.ellipse(x - rr * 0.2, y - rr * 0.3, rr * 0.45, rr * 0.35, 0, 0, TAU);
    }
  }
  // The hot rim where the bark faces the light.
  if (Rm) {
    const c = css(mix(Rm.col, 0xffffff, 0.2), 0.9);
    rimBands(B.at(10, 'rim' + c, al, c), s, Rm, 1);
  }
  if (parts === 'all') corruptInto(B, R);
  if (L.die > 0) strandPath(B.at(15, 'dark', al, css(0x07070e, Math.min(0.55, L.die * 0.6))), s, 0, false);
  if (L.burn > 0 && R.burns.length) {
    B.at(16, 'burn', al, css(STAR.ember, 0.95)).addPath(burnPath(s, R.burns, seed, 1.6));
    B.at(17, 'burnL', al, css(STAR.warm, L.burn)).addPath(burnPath(s, R.burns, seed, 0.7));
  }
}

/**
 * Phase 2 on a root: a plum stain round each fissure, the dark split and its hot core; swollen buds and
 * corrupted thorn tips share the fissures' fills. Marks under a later root (R.hid) are left out.
 */
function corruptInto(B: Batch, R: Root) {
  const { s, th, seed, look: L } = R;
  if (!R.veins.length) return;
  const al = L.alpha, hid = R.hid, hidT = R.hidT;
  const v = veinV(seed);
  const st = B.at(11, 'stain', al, css(CORR.d, 0.45)), a = B.at(12, 'split', al, css(0x1a0816));
  const m = B.at(13, 'bud', al, css(CORR.c)), b = B.at(14, 'core', al, css(CORR.l));
  for (const [i0, i1] of R.veins) {
    for (const [j0, j1] of hid ? runs(i1 + 1, (i) => (i >= i0 && !hid[i] ? 1 : 0), 2) : [[i0, i1]]) {
      bands(st, s, () => 0, (i) => s.w[i] * 0.36, j0, j1, [6, 2], seed);
      bands(a, s, v, (i) => Math.min(0.42, s.w[i] * 0.11), j0, j1);
      bands(b, s, v, (i) => Math.min(0.2, s.w[i] * 0.05), j0, j1);
    }
  }
  const bd = R.buds;
  for (let i = 0; i < bd.length; i += 4) {
    if (hid && hid[bd[i + 3]]) continue;
    const x = bd[i], y = bd[i + 1], r = bd[i + 2];
    a.moveTo(x + r + 0.35, y); a.arc(x, y, r + 0.35, 0, TAU);
    m.moveTo(x + r, y); m.arc(x, y, r, 0, TAU);
    b.moveTo(x - r * 0.15 + r * 0.5, y - r * 0.2); b.arc(x - r * 0.15, y - r * 0.2, r * 0.5, 0, TAU);
  }
  th.forEach((t, k) => { if (t.hot && !(hidT && hidT[k])) thornTip(b, t, 0.55); });
}

/**
 * The roots' share of the emissive layer: warm rim near the light, corruption, light through cracks.
 * Roots inside `occ` (a circle) are first cut out of the light already there (the star's, behind them).
 */
function glowInto(B: Batch, R: Root, occ: [number, number, number] | null) {
  const { s, th, look: L } = R;
  const al = L.alpha;
  const [bx0, by0, bx1, by1] = s.bb;
  if (occ && bx1 > occ[0] - occ[2] && bx0 < occ[0] + occ[2] && by1 > occ[1] - occ[2] && by0 < occ[1] + occ[2]) {
    // Black over the light is the same as cutting it away once the layer is added (premultiplied), and
    // lets a cached cage of glows carry its own cut-out.
    const p = B.at(0, 'cut', al, 'rgba(0,0,0,0.94)');
    strandPath(p, s, 0.5, false);
    for (const t of th) thornPath(p, t);
  }
  if (L.rim && L.rim.e > 0) {
    const c = css(L.rim.col, L.rim.e);
    rimBands(B.at(1, 'rim' + c, al, c), s, { ...L.rim, r: L.rim.r * 0.7 }, 1.1);
  }
  if (R.veins.length) {
    const v = veinV(R.seed), a = B.at(2, 'vein', al, css(CORR.c, 0.4)), b = B.at(3, 'veinL', al, css(CORR.l, 0.9));
    for (const [i0, i1] of R.veins) { bands(a, s, v, () => 0.6, i0, i1); bands(b, s, v, () => 0.18, i0, i1); }
  }
  if (L.p2) {
    const halo = B.at(4, 'halo', al, css(CORR.c, 0.3)), hot = B.at(5, 'hot', al, css(CORR.l, 0.95)), bd = R.buds;
    for (let i = 0; i < bd.length; i += 4) {
      halo.moveTo(bd[i] + bd[i + 2] * 2.2, bd[i + 1]); halo.arc(bd[i], bd[i + 1], bd[i + 2] * 2.2, 0, TAU);
      hot.moveTo(bd[i] + bd[i + 2], bd[i + 1]); hot.arc(bd[i], bd[i + 1], bd[i + 2], 0, TAU);
    }
    for (const t of th) if (t.hot) { thornTip(hot, t, 0.5); halo.moveTo(t.px + 0.9, t.py); halo.arc(t.px, t.py, 0.9, 0, TAU); }
  }
  if (L.burn > 0 && R.burns.length) {
    B.at(6, 'burn', al, css(STAR.amber, 0.7 * L.burn)).addPath(burnPath(R.s, R.burns, R.seed, 2.4));
    B.at(7, 'burnL', al, css(STAR.white, L.burn)).addPath(burnPath(R.s, R.burns, R.seed, 0.8));
  }
}
/** The emissive share of a list of roots (glows simply add up, so one batch does). */
function glowRoots(e: Ctx, roots: Root[], occ: [number, number, number] | null) {
  const B = new Batch();
  for (const R of roots) glowInto(B, R, occ);
  B.paint(e);
}

// ---- stone texture -------------------------------------------------------------------------------

let speckC: HTMLCanvasElement | null = null;
/** A tileable stone texture: blotchy light and dark speckle with alpha only, laid over a fill as a pattern. */
function speckTex(): HTMLCanvasElement {
  if (speckC) return speckC;
  const S = 96, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!, img = g.createImageData(S, S);
  const n1 = noise2(5150, 6), n2 = noise2(5151, 24), r = rng(5152);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = n1((x / S) * 6, (y / S) * 6) * 0.55 + n2((x / S) * 24, (y / S) * 24) * 0.3 + r() * 0.15 - 0.5;
    const i = (y * S + x) * 4, a = Math.min(255, Math.abs(v) * 520);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 0 ? 200 : 6;
    img.data[i + 3] = v > 0 ? a * 0.55 : a;
  }
  g.putImageData(img, 0, 0);
  return (speckC = c);
}
function speck(g: Ctx, units = 18): CanvasPattern {
  const t = speckTex(), p = g.createPattern(t, 'repeat')!;
  const k = units / t.width;
  p.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
  return p;
}

// ---- the stone ring ------------------------------------------------------------------------------

const RIN = { x: 27.5, y: 9.2 }, ROUT = { x: 40.5, y: 13.2 };
const SEGS = 12, MISSING = [2, 8];

interface Block {
  k: number; mid: number; near: boolean; lit: number;
  outer: number[]; inner: number[]; obase: number[]; ibase: number[];
  crack: number[]; corrupt: number[]; rune: number; face: [number, number];
}
const rev = (a: number[]) => { const o: number[] = []; for (let i = a.length - 2; i >= 0; i -= 2) o.push(a[i], a[i + 1]); return o; };
const RUNES: number[][] = [
  // A diamond eye with a bar through it.
  [0, -1.8, 1.2, 0, 1.2, 0, 0, 1.8, 0, 1.8, -1.2, 0, -1.2, 0, 0, -1.8, -1.6, 0, 1.6, 0],
  // A stave with chevrons rising and falling.
  [0, -1.8, 0, 1.8, -1, -0.6, 0, -1.6, 0, -1.6, 1, -0.6, -1, 0.6, 0, 1.6, 0, 1.6, 1, 0.6],
  // A triangle pierced from below.
  [0, -1.7, 1.3, 1.1, 1.3, 1.1, -1.3, 1.1, -1.3, 1.1, 0, -1.7, 0, -0.5, 0, 1.9],
  // A stave broken by a small diamond.
  [0, -1.9, 0, -0.8, 0, 0.8, 0, 1.9, 0, -0.8, 0.8, 0, 0.8, 0, 0, 0.8, 0, 0.8, -0.8, 0, -0.8, 0, 0, -0.8],
];

function blockGeo(k: number, die: number): Block {
  const a0 = (k / SEGS) * TAU + 0.05, a1 = ((k + 1) / SEGS) * TAU - 0.05, mid = (a0 + a1) / 2;
  const r = rng(k * 7919 + 13);
  let drop = k === 5 ? 2 : k === 10 ? 1 : 0;
  if (die > 0.55) drop += Math.min(5, ((die - 0.55) / 0.45) * (2 + (k % 3)));
  const H = 7.4 + r() * 1.8 - drop;
  const chipEnd = r() < 0.5, chip = 0.5 + r() * 1.3, tilt = k === 10 ? 2.2 : 0;
  const P = (a: number, rx: number, ry: number, dy: number, j = 0) => [CX + Math.cos(a) * (rx + j), GY + Math.sin(a) * (ry + j * 0.33) - dy];
  const outer: number[] = [], inner: number[] = [], obase: number[] = [], ibase: number[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = a0 + (a1 - a0) * t;
    const h = H - Math.pow(chipEnd ? 1 - t : t, 3) * chip + (t - 0.5) * tilt;
    outer.push(...P(a, ROUT.x, ROUT.y, h, (r() - 0.5) * 0.7));
    inner.push(...P(a, RIN.x, RIN.y, h + (r() - 0.5) * 0.3, (r() - 0.5) * 0.5));
    obase.push(...P(a, ROUT.x, ROUT.y, -0.8));
    ibase.push(...P(a, RIN.x, RIN.y, -1.6));
  }
  const near = Math.sin(mid) > 0;
  // A weathering crack and, for phase 2, a corruption crack: zigzags down the visible face.
  const zig = (u: number, len: number) => {
    const top = near ? outer : inner, bot = near ? obase : ibase;
    const i = Math.round(u * steps) * 2;
    const pts = [top[i], top[i + 1] + 0.2];
    const bx = bot[i], by = bot[i + 1];
    for (let s = 1; s <= 4; s++) pts.push(top[i] + (bx - top[i]) * (s / 4) + (r() - 0.5) * 1.6, top[i + 1] + (by - top[i + 1]) * (s / 4) * len);
    return pts;
  };
  const crack = zig(0.2 + r() * 0.6, 0.7 + r() * 0.3);
  const corrupt = r() < 0.75 ? zig(0.15 + r() * 0.7, 0.95) : [];
  const fi = steps;
  const face: [number, number] = near ? [(outer[fi] + obase[fi]) / 2, (outer[fi + 1] + obase[fi + 1]) / 2] : [(inner[fi] + ibase[fi]) / 2, (inner[fi + 1] + ibase[fi + 1]) / 2];
  return { k, mid, near, lit: 0.5 - 0.5 * Math.cos(mid), outer, inner, obase, ibase, crack, corrupt, rune: k % 2 ? (k >> 1) % RUNES.length : -1, face };
}

function poly(g: Ctx | Path2D, p: number[]) {
  if (g instanceof CanvasRenderingContext2D) g.beginPath();
  g.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  g.closePath();
}
const bboxOf = (p: number[]) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  return [x0, y0, x1, y1];
};
function silhouette(b: Block) {
  const n = b.outer.length;
  return b.near
    ? [...b.inner, b.outer[n - 2], b.outer[n - 1], ...rev(b.obase), b.outer[0], b.outer[1]]
    : [...b.outer, b.inner[n - 2], b.inner[n - 1], ...rev(b.ibase), b.inner[0], b.inner[1]];
}
function runePath(b: Block, s = 1): Path2D {
  const p = new Path2D(), R = RUNES[b.rune], [fx, fy] = b.face;
  for (let i = 0; i < R.length; i += 4) { p.moveTo(fx + R[i] * s, fy + R[i + 1] * s * 0.85); p.lineTo(fx + R[i + 2] * s, fy + R[i + 3] * s * 0.85); }
  return p;
}
function zigPath(pts: number[]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  // A side branch off the middle.
  if (pts.length >= 8) { p.moveTo(pts[4], pts[5]); p.lineTo(pts[4] + 1.6, pts[5] + 1.2); }
  return p;
}

function blockBody(g: Ctx, b: Block, p2: boolean, warmK: number) {
  const r = rng(b.k * 131 + 7);
  const sil = silhouette(b);
  const top = [...b.outer, ...rev(b.inner)];
  const face = b.near ? [...b.outer, ...rev(b.obase)] : [...b.inner, ...rev(b.ibase)];
  poly(g, sil);
  g.lineWidth = 1.25; g.strokeStyle = css(INK); g.stroke();
  g.fillStyle = css(STONE.d); g.fill();
  // The visible side: the outer face in front (moonlit from the left), the inner face behind (lit by the star).
  poly(g, face);
  const [, fy0, , fy1] = bboxOf(face);
  if (b.near) {
    g.fillStyle = lin(g, 0, fy0, 0, fy1, [[0, css(mix(STONE.s, STONE.m, b.lit * 0.6))], [0.5, css(mix(STONE.d, STONE.b, b.lit * 0.5))], [1, css(mix(STONE.d, STONE.g, 0.4))]]);
  } else {
    const w = warmK * (0.45 + 0.55 * (1 - Math.abs(Math.cos(b.mid))));
    g.fillStyle = lin(g, 0, fy0, 0, fy1, [[0, css(mix(STONE.b, 0xf0a860, 0.5 * w))], [0.6, css(mix(STONE.s, 0xc06a30, 0.42 * w))], [1, css(mix(STONE.d, 0x6a2c18, 0.45 * w))]]);
  }
  g.fill();
  // The top: cool and moonlit at the outer edge, warm where it faces the star.
  poly(g, top);
  const om = Math.floor(b.outer.length / 4) * 2;
  g.fillStyle = lin(g, b.outer[om], b.outer[om + 1], b.inner[om], b.inner[om + 1], [
    [0, css(mix(STONE.b, STONE.l, b.lit * 0.55))], [0.55, css(mix(STONE.s, STONE.m, 0.6))], [1, css(mix(STONE.m, STAR.warm, 0.42 * warmK))],
  ]);
  g.fill();

  // Stone texture over both faces (no clip: the faces are the fills).
  poly(g, sil); g.globalAlpha = 0.42; g.fillStyle = speck(g); g.fill(); g.globalAlpha = 1;
  // Masonry: a course line and staggered joints on the face.
  const fl = new Path2D(), fh = new Path2D();
  const top2 = b.near ? b.outer : b.inner, bot2 = b.near ? b.obase : b.ibase;
  for (let i = 0; i < top2.length; i += 2) {
    const x = top2[i] + (bot2[i] - top2[i]) * 0.5, y = top2[i + 1] + (bot2[i + 1] - top2[i + 1]) * 0.5;
    if (i === 0) { fl.moveTo(x, y); fh.moveTo(x, y + 0.45); } else { fl.lineTo(x, y); fh.lineTo(x, y + 0.45); }
  }
  const j1 = 2 + 2 * Math.floor(r() * 3), j2 = j1 + 4;
  for (const [j, a, c] of [[j1, 0, 0.5], [Math.min(j2, top2.length - 4), 0.5, 1]] as const) {
    fl.moveTo(top2[j] + (bot2[j] - top2[j]) * a, top2[j + 1] + (bot2[j + 1] - top2[j + 1]) * a);
    fl.lineTo(top2[j] + (bot2[j] - top2[j]) * c, top2[j + 1] + (bot2[j + 1] - top2[j + 1]) * c);
  }
  g.lineWidth = 0.42; g.strokeStyle = css(STONE.g, 0.8); g.stroke(fl);
  g.lineWidth = 0.25; g.strokeStyle = css(STONE.l, 0.35); g.stroke(fh);
  // Weathering crack.
  const cp = zigPath(b.crack);
  g.lineWidth = 0.38; g.strokeStyle = css(STONE.g, 0.85); g.stroke(cp);
  // Speckles and pits.
  const sp = new Path2D(), sl = new Path2D();
  for (let i = 0; i < 14; i++) {
    const j = 2 * Math.floor(r() * (top2.length / 2)), v = r(), onTop = i % 2 === 0;
    const ax = onTop ? b.outer[j] : top2[j], ay = onTop ? b.outer[j + 1] : top2[j + 1], bx2 = onTop ? b.inner[j] : bot2[j], by2 = onTop ? b.inner[j + 1] : bot2[j + 1];
    const x = ax + (bx2 - ax) * (0.15 + v * 0.7), y = ay + (by2 - ay) * (0.15 + v * 0.7), rr = 0.18 + r() * 0.35;
    sp.moveTo(x + rr, y); sp.arc(x, y, rr, 0, TAU);
    sl.moveTo(x + rr * 0.8, y + rr); sl.arc(x + rr * 0.3, y + rr * 0.6, rr * 0.6, 0, TAU);
  }
  g.fillStyle = css(STONE.l, 0.45); g.fill(sl);
  g.fillStyle = css(STONE.g, 0.55); g.fill(sp);
  // Moss on the top along the outer edge, dripping over the front.
  const mb = new Path2D(), ml = new Path2D(), drip = new Path2D();
  const nm = 2 + Math.floor(r() * 3);
  for (let m = 0; m < nm; m++) {
    const i = 2 * Math.floor(r() * (b.outer.length / 2));
    const u = 0.15 + r() * 0.35;
    const x = b.outer[i] + (b.inner[i] - b.outer[i]) * u, y = b.outer[i + 1] + (b.inner[i + 1] - b.outer[i + 1]) * u;
    const rx = 1.2 + r() * 1.8, ry = rx * 0.45;
    mb.moveTo(x + rx, y); mb.ellipse(x, y, rx, ry, 0, 0, TAU);
    ml.moveTo(x + rx * 0.55, y - ry * 0.3); ml.ellipse(x - rx * 0.1, y - ry * 0.3, rx * 0.6, ry * 0.5, 0, 0, TAU);
    if (b.near && r() < 0.8) {
      const dx = b.outer[i] + (r() - 0.5), dy = b.outer[i + 1];
      const L = 1.5 + r() * 2.8;
      drip.moveTo(dx - 0.6, dy - 0.3); drip.quadraticCurveTo(dx - 0.2, dy + L * 0.6, dx, dy + L);
      drip.quadraticCurveTo(dx + 0.3, dy + L * 0.5, dx + 0.7, dy - 0.3); drip.closePath();
    }
  }
  g.fillStyle = css(MOSS.b); g.fill(mb); g.fill(drip);
  g.fillStyle = css(MOSS.l); g.fill(ml);
  // A chipped corner on the top's outer edge, its broken face catching the moon.
  {
    const n = b.outer.length, i = r() < 0.5 ? 2 : n - 4;
    const x = b.outer[i], y = b.outer[i + 1], ix = b.inner[i], iy = b.inner[i + 1];
    const cx = x + (ix - x) * 0.45, cy = y + (iy - y) * 0.45, ex = b.outer[i + (i === 2 ? 2 : -2)], ey = b.outer[i + (i === 2 ? 3 : -1)];
    g.beginPath(); g.moveTo(x, y - 0.1); g.lineTo(cx, cy + 0.35); g.lineTo((x + ex) / 2, (y + ey) / 2 + 1.2); g.closePath();
    g.fillStyle = css(STONE.d); g.fill();
    g.beginPath(); g.moveTo(x, y); g.lineTo(cx, cy + 0.35);
    g.lineWidth = 0.3; g.strokeStyle = css(STONE.h, 0.6); g.stroke();
  }
  if (p2 && b.corrupt.length) {
    const zp = zigPath(b.corrupt);
    g.lineWidth = 1.0; g.strokeStyle = css(CORR.d); g.stroke(zp);
    g.lineWidth = 0.5; g.strokeStyle = css(CORR.c); g.stroke(zp);
    g.lineWidth = 0.2; g.strokeStyle = css(CORR.w, 0.9); g.stroke(zp);
  }
  // Edges: a moonlit lip where the top meets the front, a warm one where it faces the star.
  g.beginPath(); g.moveTo(b.outer[0], b.outer[1]);
  for (let i = 2; i < b.outer.length; i += 2) g.lineTo(b.outer[i], b.outer[i + 1]);
  g.lineWidth = 0.4; g.strokeStyle = css(b.near ? STONE.h : STONE.l, b.near ? 0.45 + b.lit * 0.4 : 0.5); g.stroke();
  g.beginPath(); g.moveTo(b.inner[0], b.inner[1]);
  for (let i = 2; i < b.inner.length; i += 2) g.lineTo(b.inner[i], b.inner[i + 1]);
  g.lineWidth = 0.5; g.strokeStyle = css(STAR.warm, (b.near ? 0.35 : 0.75) * warmK); g.stroke();
  // Carved rune.
  if (b.rune >= 0) {
    const rp = runePath(b);
    g.lineWidth = 0.75; g.strokeStyle = css(STONE.g); g.stroke(rp);
    g.lineWidth = 0.35; g.strokeStyle = css(p2 ? CORR.l : STAR.amber, warmK > 0.3 ? 1 : 0.4); g.stroke(rp);
  }
}

function blockGlow(e: Ctx, b: Block, p2: boolean, warmK: number) {
  if (!b.near && warmK > 0) {
    poly(e, [...b.inner, ...rev(b.ibase)]);
    const [, y0, , y1] = bboxOf(b.ibase.concat(b.inner));
    e.fillStyle = lin(e, 0, y0, 0, y1, [[0, css(STAR.amber, 0.22 * warmK * (1 - Math.abs(Math.cos(b.mid)) * 0.6))], [1, css(STAR.deep, 0)]]);
    e.fill();
  }
  if (b.rune >= 0 && warmK > 0.3) {
    const rp = runePath(b);
    const c = p2 ? CORR.c : STAR.amber;
    e.lineWidth = 1.3; e.strokeStyle = css(c, 0.45); e.stroke(rp);
    e.lineWidth = 0.45; e.strokeStyle = css(p2 ? CORR.w : STAR.warm, 0.95); e.stroke(rp);
    glow(e, b.face[0], b.face[1], 4, c, 0.4);
  }
  if (p2 && b.corrupt.length) {
    const zp = zigPath(b.corrupt);
    e.lineWidth = 1.6; e.strokeStyle = css(CORR.c, 0.5); e.stroke(zp);
    e.lineWidth = 0.45; e.strokeStyle = css(CORR.l, 0.95); e.stroke(zp);
  }
}

/** Rocks where blocks are missing. */
function rubble(g: Ctx, half: 'far' | 'near') {
  for (const k of MISSING) {
    const a = ((k + 0.5) / SEGS) * TAU;
    if ((half === 'near') !== (Math.sin(a) > 0)) continue;
    const x = CX + Math.cos(a) * 34, y = GY + Math.sin(a) * 11.2;
    const r = rng(k * 17 + 3);
    for (const [ox, oy, s] of [[-3.5, 0.5, 2.6], [2.5, 1.2, 2.1], [0, -0.6, 1.5], [4.6, -0.4, 1.2]]) rock(g, null, x + ox, y + oy, s, r, false, null);
  }
}

function ringBody(g: Ctx, half: 'far' | 'near', p2: boolean, die: number) {
  const warmK = die > 0.8 ? 0.4 : 1;
  const bl: Block[] = [];
  for (let k = 0; k < SEGS; k++) {
    if (MISSING.includes(k)) continue;
    const b = blockGeo(k, die);
    if (b.near === (half === 'near')) bl.push(b);
  }
  bl.sort((a, b) => Math.sin(a.mid) - Math.sin(b.mid));
  if (half === 'far') rubble(g, half);
  for (const b of bl) blockBody(g, b, p2, warmK);
  if (half === 'near') { rubble(g, half); paintRoots(g, tendrils(p2, die)); tufts(g); }
}
function ringGlow(e: Ctx, half: 'far' | 'near', p2: boolean, die: number) {
  const warmK = die > 0.8 ? 0.4 : 1;
  if (half === 'near' && p2) glowRoots(e, tendrils(p2, die), null);
  for (let k = 0; k < SEGS; k++) {
    if (MISSING.includes(k)) continue;
    const b = blockGeo(k, die);
    if (b.near === (half === 'near')) blockGlow(e, b, p2, warmK);
  }
}

/** Thin roots draped over the near blocks, from the top face down the front. */
function tendrils(p2: boolean, die: number): Root[] {
  const out: Root[] = [];
  const P = (a: number, rx: number, ry: number, h: number) => [CX + Math.cos(a) * rx, GY + Math.sin(a) * ry - h];
  [[0.74, 1, 7.6], [1.98, 2, 6.2], [2.42, 3, 8.4], [0.24, 4, 5.4]].forEach(([a, seed, len]) => {
    const H = 8 - (die > 0.55 ? ((die - 0.55) / 0.45) * 3 : 0);
    const s0 = P(a, RIN.x + 4, RIN.y + 1.4, H + 0.2), s1 = P(a + 0.04, ROUT.x - 1, ROUT.y - 0.4, H + 0.6);
    const s2 = P(a + 0.06, ROUT.x + 0.5, ROUT.y + 0.2, H - 2.5), s3 = P(a + 0.12, ROUT.x + 0.3, ROUT.y + 0.1, H - len);
    const pts = gnarl(bez(s0[0], s0[1], s1[0], s1[1], s2[0], s2[1], s3[0], s3[1], 14), seed + 40, 0.6);
    const s = rootStrand(pts, 1.8, 0.3, seed + 40, 0.1);
    out.push(makeRoot(s, seed + 40, { p2, die, moss: false, rim: null, burn: 0, alpha: 1 }, 2.2, 0.65));
  });
  return out;
}

/** Teal leaf tufts at the foot of the ring. */
function tufts(g: Ctx) {
  const r = rng(4242);
  for (const [x, y, n] of [[13, 92, 5], [70, 96, 6], [88, 88, 4], [44, 99, 4]]) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.4 + (r() - 0.5) * 0.3;
      const len = 2.6 + r() * 2.2, wd = 0.75 + r() * 0.35;
      const c = Math.cos(a), s = Math.sin(a);
      const lp = new Path2D();
      lp.moveTo(x, y);
      lp.quadraticCurveTo(x + c * len * 0.5 - s * wd * 1.6, y + s * len * 0.5 + c * wd * 1.6, x + c * len, y + s * len);
      lp.quadraticCurveTo(x + c * len * 0.5 + s * wd * 1.6, y + s * len * 0.5 - c * wd * 1.6, x, y);
      g.lineWidth = 0.9; g.strokeStyle = css(INK); g.stroke(lp);
      g.fillStyle = lin(g, x, y, x + c * len, y + s * len, [[0, css(LEAF.b)], [1, css(c < 0 ? LEAF.h : LEAF.l)]]);
      g.fill(lp);
    }
  }
}

// ---- ground and pit -------------------------------------------------------------------------------

function pitCracks(): number[][] {
  const r = rng(77), out: number[][] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + r() * 0.4;
    const pts: number[] = [];
    let rr = 3 + r() * 3;
    for (let k = 0; k < 5; k++) {
      const aa = a + (r() - 0.5) * 0.35;
      pts.push(CX + Math.cos(aa) * rr, GY - 2.2 + Math.sin(aa) * rr * 0.34);
      rr += 4.5 + r() * 2.5;
    }
    out.push(pts);
  }
  return out;
}
const PIT_CRACKS = pitCracks();

function baseBody(g: Ctx, p2: boolean, k: number) {
  // Soft dark footprint round the ring.
  g.save(); g.translate(CX, GY + 1); g.scale(1, 0.36);
  g.fillStyle = rad(g, 0, 0, 0, 46, [[0.72, 'rgba(5,5,11,0.85)'], [1, 'rgba(5,5,11,0)']]);
  g.fillRect(-46, -46, 92, 92);
  g.restore();
  // The pit floor, scorched and lit from the star above.
  g.save(); g.translate(CX, GY - 2.2); g.scale(1, 0.345);
  g.beginPath(); g.arc(0, 0, 30, 0, TAU);
  const c0 = mix(0x2a1a1e, 0xf2b062, k), c1 = mix(0x1e1418, 0xb8622c, k), c2 = mix(0x161016, 0x5a2a1c, k);
  g.fillStyle = rad(g, 0, 0, 0, 30, [[0, css(c0)], [0.28, css(c1)], [0.58, css(c2)], [0.82, css(0x1c141a)], [1, css(0x0e0c12)]]);
  g.fill();
  g.restore();
  // Plates of scorched rock between glowing cracks.
  const r = rng(91);
  const pb = new Path2D(), pl = new Path2D();
  for (let i = 0; i < 16; i++) {
    const a = r() * TAU, d = 8 + r() * 18;
    const x = CX + Math.cos(a) * d, y = GY - 2.2 + Math.sin(a) * d * 0.34, s = 0.6 + r() * 1.1;
    pb.moveTo(x + s, y); pb.ellipse(x, y, s, s * 0.6, 0, 0, TAU);
    pl.moveTo(x + s * 0.5, y - s * 0.2); pl.ellipse(x - s * 0.15, y - s * 0.2, s * 0.55, s * 0.3, 0, 0, TAU);
  }
  g.fillStyle = css(0x120e14, 0.9); g.fill(pb);
  g.fillStyle = css(mix(STONE.s, 0xb06a3a, k * 0.6), 0.9); g.fill(pl);
  const cr = new Path2D(), hot = new Path2D(), mag = new Path2D();
  PIT_CRACKS.forEach((pts, i) => {
    const p = p2 && i % 2 ? mag : cr;
    p.moveTo(pts[0], pts[1]);
    for (let j = 2; j < pts.length; j += 2) p.lineTo(pts[j], pts[j + 1]);
    hot.moveTo(pts[0], pts[1]); hot.lineTo(pts[2], pts[3]); hot.lineTo(pts[4], pts[5]);
  });
  g.lineWidth = 1.1; g.strokeStyle = css(0x0b090e); g.stroke(cr); g.stroke(mag);
  g.lineWidth = 0.55; g.strokeStyle = css(mix(0x3a1810, STAR.deep, k)); g.stroke(cr);
  g.strokeStyle = css(CORR.c); g.stroke(mag);
  g.lineWidth = 0.25; g.strokeStyle = css(STAR.warm, k); g.stroke(hot);
}
function baseGlow(e: Ctx, p2: boolean, k: number) {
  e.save(); e.translate(CX, GY - 2.2); e.scale(1, 0.345);
  glow(e, 0, 0, 30, STAR.amber, 0.55 * k, 0.15);
  e.restore();
  const cr = new Path2D(), mag = new Path2D();
  PIT_CRACKS.forEach((pts, i) => {
    const p = p2 && i % 2 ? mag : cr;
    p.moveTo(pts[0], pts[1]);
    for (let j = 2; j < pts.length - 2; j += 2) p.lineTo(pts[j], pts[j + 1]);
  });
  e.lineWidth = 1.2; e.strokeStyle = css(STAR.deep, 0.6 * k); e.stroke(cr);
  e.lineWidth = 0.4; e.strokeStyle = css(STAR.warm, 0.9 * k); e.stroke(cr);
  e.lineWidth = 1.2; e.strokeStyle = css(CORR.c, 0.6); e.stroke(mag);
  e.lineWidth = 0.4; e.strokeStyle = css(CORR.l, 0.9); e.stroke(mag);
}

// ---- floating shards ------------------------------------------------------------------------------

/** Add a polyline of constant width w as a filled polygon (cheaper than a thin stroke). */
function thinLine(p: Path2D | Ctx, pts: number[], w: number) {
  const n = pts.length / 2, L: number[] = [], Rr: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dx = pts[b * 2] - pts[a * 2], dy = pts[b * 2 + 1] - pts[a * 2 + 1], l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * w / 2, ny = (dx / l) * w / 2;
    L.push(pts[i * 2] + nx, pts[i * 2 + 1] + ny); Rr.push(pts[i * 2] - nx, pts[i * 2 + 1] - ny);
  }
  p.moveTo(L[0], L[1]);
  for (let i = 1; i < n; i++) p.lineTo(L[i * 2], L[i * 2 + 1]);
  for (let i = n - 1; i >= 0; i--) p.lineTo(Rr[i * 2], Rr[i * 2 + 1]);
  p.closePath();
}

/** An angular stone chunk with a lit top facet, an ink edge and (optionally) a glowing seam. */
function rock(g: Ctx | null, e: Ctx | null, x: number, y: number, s: number, r: () => number, p2: boolean, seam: number | null, rimTo?: [number, number]) {
  const n = 6, pts: number[] = [], ink: number[] = [], ph = r() * TAU;
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * TAU, k = 0.72 + r() * 0.45;
    pts.push(x + Math.cos(a) * s * k, y + Math.sin(a) * s * k * 0.82);
    ink.push(x + Math.cos(a) * (s * k + 0.55), y + Math.sin(a) * (s * k * 0.82 + 0.55));
  }
  // The upper facet: the vertices above the centre plus the centre pushed up.
  const fac: number[] = [];
  for (let i = 0; i < n; i++) if (pts[i * 2 + 1] < y + s * 0.15) fac.push(pts[i * 2], pts[i * 2 + 1]);
  const seamA = r() * TAU, jx = (r() - 0.5) * s * 0.3;
  const seamPts = [x + Math.cos(seamA) * s * 0.7, y + Math.sin(seamA) * s * 0.55, x + jx, y, x - Math.cos(seamA) * s * 0.5, y - Math.sin(seamA) * s * 0.4];
  if (g) {
    poly(g, ink); g.fillStyle = css(INK); g.fill();
    // Lit warm on the side that faces the star, cool and dark away from it.
    let lx = x - s, ly = y - s, warm = 0;
    if (rimTo) { const dx = rimTo[0] - x, dy = rimTo[1] - y, d = Math.hypot(dx, dy) || 1; lx = x + (dx / d) * s; ly = y + (dy / d) * s; warm = clamp01(1.25 - d / 40); }
    poly(g, pts);
    g.fillStyle = lin(g, lx, ly, 2 * x - lx, 2 * y - ly, [[0, css(mix(STONE.l, STAR.warm, warm * 0.55))], [0.5, css(STONE.b)], [1, css(STONE.d)]]);
    g.fill();
    if (fac.length >= 4) {
      fac.push(x + s * 0.1, y + s * 0.05);
      poly(g, fac); g.fillStyle = css(mix(STONE.l, STONE.h, 0.4), 0.7); g.fill();
    }
    if (seam !== null) {
      const sp = new Path2D(), sc = new Path2D();
      thinLine(sp, seamPts, 0.7); thinLine(sc, seamPts, 0.32);
      g.fillStyle = css(INK); g.fill(sp);
      g.fillStyle = css(seam); g.fill(sc);
    }
  }
  if (e && seam !== null) {
    const sc = new Path2D();
    thinLine(sc, seamPts, 0.8);
    e.fillStyle = css(seam, 0.9); e.fill(sc);
    glow(e, x, y, s * 1.6, p2 ? CORR.c : STAR.amber, 0.45);
  }
}

interface Shard { x: number; y: number; s: number; seed: number; front: boolean }
function shardList(o: Pose, kx: number, ky: number): Shard[] {
  const out: Shard[] = [];
  const fall = o.die > 0 ? clamp01(o.die * 1.25) : 0;
  for (let i = 0; i < 6; i++) {
    const small = i >= 4;
    const a = o.shard * (small ? 1.6 : 1) + i * (Math.PI / 2) + (i % 2) * 0.4 + (small ? 0.8 + i : 0);
    const rx = (small ? 24 : 30 + (i % 2) * 6) + o.open * 6, ry = (small ? 7 : 9 + (i % 2) * 3);
    let x = kx + Math.cos(a) * rx, y = ky + 4 + Math.sin(a) * ry - (i === 2 ? 6 : 0) - (small ? 8 : 0);
    // When the star dies its pull fails and the stones drop.
    y += (GY - 4 + Math.sin(a) * 9 - y) * fall * fall;
    x += (x - kx) * fall * 0.25;
    out.push({ x, y, s: small ? 1.1 : i % 2 ? 2.2 : 3.1, seed: 300 + i * 7, front: Math.sin(a) > 0 });
  }
  return out;
}
function drawShards(g: Ctx | null, e: Ctx | null, list: Shard[], front: boolean, o: Pose, kx: number, ky: number) {
  for (const sh of list) {
    if (sh.front !== front) continue;
    const seam = sh.s < 1.5 ? null : o.p2 && sh.seed % 2 ? CORR.l : STAR.warm;
    rock(g, e, sh.x, sh.y, sh.s, rng(sh.seed), o.p2, o.die > 0.7 ? null : seam, [kx, ky]);
  }
}

// ---- the star -------------------------------------------------------------------------------------

interface StarP { kx: number; ky: number; rc: number; L: number; fade: number; tilt: number; shatter: number; flare: number }
function starParams(o: Pose, kx: number, ky: number): StarP {
  const dieGrow = o.die > 0 ? Math.min(1, o.die / 0.7) : 0;
  const shatter = o.die > 0.72 ? (o.die - 0.72) / 0.28 : 0;
  let rc = 10.2 + o.pulse * 1 + o.open * 2.5 + o.flare * 1.5 + dieGrow * 5 - (o.hurt ? 2.2 : 0);
  if (shatter > 0) rc *= 1 - shatter * 0.8;
  const L = (o.hurt ? 14 : 19) + o.pulse * 2.5 + o.flare * 9 + o.open * 4 + dieGrow * 8;
  return { kx, ky, rc, L, fade: shatter > 0 ? 1 - shatter : 1, tilt: o.die > 0 ? o.die * 0.6 : 0, shatter, flare: o.flare };
}
/** A four-point sparkle: tips at `ang` + i * 90deg with lengths lens[i], sides pinched to width w. */
function sparkle(g: Ctx, x: number, y: number, ang: number, lens: number[], w: number) {
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = ang + (i * Math.PI) / 2, b = a + Math.PI / 2;
    if (i === 0) g.moveTo(x + Math.cos(a) * lens[0], y + Math.sin(a) * lens[0]);
    const nl = lens[(i + 1) % 4];
    g.quadraticCurveTo(x + Math.cos(a + Math.PI / 4) * w, y + Math.sin(a + Math.PI / 4) * w, x + Math.cos(b) * nl, y + Math.sin(b) * nl);
  }
  g.closePath();
}
/** Corruption cracks across the core (polylines in units of the core radius). */
const CORE_CRACKS = [
  [-0.85, -0.15, -0.45, 0.05, -0.2, 0.3, 0.05, 0.42, 0.15, 0.85],
  [-0.2, 0.3, -0.35, 0.7],
  [0.3, -0.85, 0.42, -0.5, 0.62, -0.3, 0.85, -0.32],
];
const coreCrackPts = (S: StarP) => CORE_CRACKS.map((c) => c.map((v, i) => (i % 2 ? S.ky : S.kx) + v * S.rc));
/** Eight thin needles of light between the main rays. */
function needles(g: Ctx, S: StarP, k: number, w: number) {
  const { kx, ky, rc, L, fade, tilt } = S;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = tilt + Math.PI / 8 + (i * Math.PI) / 4, c = Math.cos(a), sn = Math.sin(a);
    const l = L * fade * k * (i % 2 ? 0.62 : 0.85), r0 = rc * 0.7;
    g.moveTo(kx + c * r0 - sn * w, ky + sn * r0 + c * w);
    g.lineTo(kx + c * l, ky + sn * l);
    g.lineTo(kx + c * r0 + sn * w, ky + sn * r0 - c * w);
    g.closePath();
  }
}
const RAY_LENS = (S: StarP) => [S.L * S.fade * 0.95, S.L * S.fade * 1.15, S.L * S.fade * 0.95, S.L * S.fade * 1.2];

function starBody(g: Ctx, o: Pose, S: StarP) {
  const { kx, ky, rc, L, fade, tilt } = S;
  if (fade > 0.15) {
    sparkle(g, kx, ky, tilt, RAY_LENS(S), 2.4);
    g.fillStyle = rad(g, kx, ky, 0, L * 1.2, [[0, css(STAR.white)], [0.22, css(STAR.core)], [0.45, css(STAR.warm)], [0.75, css(STAR.amber, 0.9)], [1, css(STAR.deep, 0.2)]]);
    g.fill();
    sparkle(g, kx, ky, tilt + Math.PI / 4, [L * 0.5 * fade, L * 0.5 * fade, L * 0.5 * fade, L * 0.5 * fade], 1.6);
    g.fillStyle = rad(g, kx, ky, 0, L * 0.5, [[0, css(STAR.core)], [0.5, css(STAR.amber)], [1, css(o.p2 ? CORR.c : STAR.deep, 0.3)]]);
    g.fill();
    needles(g, S, 0.62, 0.45);
    g.fillStyle = rad(g, kx, ky, rc * 0.6, L * 0.62, [[0, css(STAR.warm)], [0.6, css(STAR.amber, 0.7)], [1, css(STAR.amber, 0)]]);
    g.fill();
  }
  // The core.
  g.beginPath(); g.arc(kx, ky, rc + 0.55, 0, TAU); g.fillStyle = css(STAR.deep); g.fill();
  g.beginPath(); g.arc(kx, ky, rc, 0, TAU);
  g.fillStyle = rad(g, kx, ky, 0, rc, [[0, css(STAR.white)], [0.4, css(STAR.white)], [0.62, css(STAR.core)], [0.8, css(STAR.warm)], [0.93, css(STAR.amber)], [1, css(STAR.deep)]], kx - rc * 0.18, ky - rc * 0.22);
  g.fill();
  // A thin corona ring.
  g.beginPath(); g.arc(kx, ky, rc + 1.7, 0, TAU); g.arc(kx, ky, rc + 1.35, 0, TAU, true);
  g.fillStyle = css(STAR.warm, 0.6 * fade); g.fill();
  if (o.p2 && S.shatter === 0) {
    const a = new Path2D(), b = new Path2D();
    for (const c of coreCrackPts(S)) { thinLine(a, c, 0.95); thinLine(b, c, 0.45); }
    g.fillStyle = css(CORR.m); g.fill(a);
    g.fillStyle = css(CORR.c); g.fill(b);
  }
  // Hot glint in the centre.
  if (S.shatter < 0.6) { sparkle(g, kx, ky, tilt, [rc * 0.75, rc * 0.75, rc * 0.75, rc * 0.75], 0.45); g.fillStyle = css(0xffffff); g.fill(); }
  // Vent: molten light drips out of the opened cage.
  if (o.open > 0) {
    const dp = new Path2D(), dd = new Path2D(), y0 = ky + rc * 0.75;
    for (let i = 0; i < 5; i++) {
      const x = kx - 6 + i * 3, l = 3 + ((i * 7) % 5) + o.open * 3;
      dp.moveTo(x - 0.8, y0); dp.quadraticCurveTo(x - 0.5, y0 + l * 0.7, x, y0 + l); dp.quadraticCurveTo(x + 0.5, y0 + l * 0.7, x + 0.8, y0); dp.closePath();
      dd.moveTo(x + 0.55, y0 + l + 1.6); dd.arc(x, y0 + l + 1.6, 0.55, 0, TAU);
    }
    g.fillStyle = lin(g, 0, y0, 0, y0 + 10, [[0, css(STAR.core)], [0.5, css(STAR.warm)], [1, css(STAR.amber)]]); g.fill(dp);
    g.fillStyle = css(STAR.amber); g.fill(dd);
  }
  if (S.shatter > 0) shatterShards(g, S, false);
}
function shatterShards(g: Ctx, S: StarP, emissive: boolean) {
  const { kx, ky, shatter } = S;
  for (let i = 0; i < 12; i++) {
    const a = i * 0.53 + 0.2, d = 6 + shatter * (18 + (i % 3) * 9);
    const x = kx + Math.cos(a) * d, y = ky + Math.sin(a) * d * 0.85;
    sparkle(g, x, y, a, [3 + (i % 3), 0.7, 1.6, 0.7], 0.25);
    g.fillStyle = css(i % 2 ? STAR.warm : STAR.white, emissive ? 0.95 : 1); g.fill();
    if (emissive) glow(g, x, y, 3, STAR.amber, 0.5);
  }
}

function starGlow(e: Ctx, o: Pose, S: StarP) {
  const { kx, ky, rc, L, fade, tilt } = S;
  glow(e, kx, ky, rc * 2.5 + S.flare * 7, STAR.amber, 0.8 * Math.max(0.25, fade), 0.12);
  glow(e, kx, ky, rc * 1.6, STAR.warm, 0.95, 0.3);
  if (fade > 0.15) {
    sparkle(e, kx, ky, tilt, RAY_LENS(S).map((l) => l * 1.05), 4.5);
    e.fillStyle = rad(e, kx, ky, 0, L * 1.25, [[0, css(STAR.warm, 0.6)], [0.5, css(STAR.amber, 0.25)], [1, css(STAR.amber, 0)]]);
    e.fill();
    sparkle(e, kx, ky, tilt, RAY_LENS(S), 2.2);
    e.fillStyle = rad(e, kx, ky, 0, L * 1.2, [[0, css(STAR.white)], [0.3, css(STAR.core)], [0.6, css(STAR.warm, 0.85)], [1, css(STAR.amber, 0)]]);
    e.fill();
    sparkle(e, kx, ky, tilt + Math.PI / 4, [L * 0.5 * fade, L * 0.5 * fade, L * 0.5 * fade, L * 0.5 * fade], 1.5);
    e.fillStyle = rad(e, kx, ky, 0, L * 0.5, [[0, css(STAR.white)], [0.5, css(STAR.warm, 0.7)], [1, css(STAR.amber, 0)]]);
    e.fill();
    needles(e, S, 0.62, 0.55);
    e.fillStyle = rad(e, kx, ky, rc * 0.6, L * 0.62, [[0, css(STAR.white, 0.9)], [0.5, css(STAR.warm, 0.6)], [1, css(STAR.amber, 0)]]);
    e.fill();
  }
  e.beginPath(); e.arc(kx, ky, rc, 0, TAU);
  e.fillStyle = rad(e, kx, ky, 0, rc, [[0, css(0xffffff)], [0.5, css(STAR.white)], [0.78, css(STAR.core, 0.9)], [1, css(STAR.amber, 0.55)]], kx - rc * 0.15, ky - rc * 0.2);
  e.fill();
  if (o.p2 && S.shatter === 0) {
    // Dark splits across the light (black is no light once added), magenta inside them.
    const a = new Path2D(), b = new Path2D();
    for (const c of coreCrackPts(S)) { thinLine(a, c, 1.1); thinLine(b, c, 0.4); }
    e.fillStyle = 'rgba(0,0,0,0.8)'; e.fill(a);
    e.fillStyle = css(CORR.c, 0.75); e.fill(a);
    e.fillStyle = css(CORR.l); e.fill(b);
    glow(e, kx, ky, rc * 2.9, CORR.c, 0.16, 0.5);
  }
  if (o.open > 0) {
    const dp = new Path2D(), y0 = ky + rc * 0.75;
    for (let i = 0; i < 5; i++) {
      const x = kx - 6 + i * 3, l = 3 + ((i * 7) % 5) + o.open * 3;
      thinLine(dp, [x, y0, x, y0 + l], 1.2);
      dp.moveTo(x + 0.9, y0 + l + 1.6); dp.arc(x, y0 + l + 1.6, 0.9, 0, TAU);
    }
    e.fillStyle = css(STAR.warm, 0.85); e.fill(dp);
    glow(e, kx, y0 + 8, 9, STAR.amber, 0.5, 0.3);
  }
  if (S.shatter > 0) shatterShards(e, S, true);
}

// ---- a frame --------------------------------------------------------------------------------------

interface Geo { kx: number; ky: number; back: Root[]; front: Root[]; shards: Shard[]; star: StarP; cage: string }

const cageTight = (o: Pose) => (o.tight > 0.5 ? (o.tight < 0.8 ? 0.68 : 0.94) : o.tight);
/** What the painted cage depends on (phase 2 only adds the corruption overlay). */
const cageKey = (o: Pose) => [cageTight(o), o.open, o.thrash, o.thrashPh, o.die].join('|');
const rootSets = new Map<string, { back: Root[]; front: Root[] }>();

function buildGeo(o: Pose): Geo {
  const bob = o.pulse * 0.7 - (o.flare > 0 ? 1 : 0) - o.die * 7;
  const kx = KX, ky = KY + bob;
  const key = cageKey(o);
  let set = rootSets.get(key + '|' + o.p2);
  if (!set) { set = buildRoots(o); rootSets.set(key + '|' + o.p2, set); soon(); }
  return { kx, ky, back: set.back, front: set.front, shards: shardList(o, kx, ky), star: starParams(o, kx, ky), cage: key };
}

/** The cage of roots for a pose (it ignores the star's breathing and flares). */
function buildRoots(o: Pose): { back: Root[]; front: Root[] } {
  const kx = KX;
  // The windup's tightening comes in two steps, so its frames share painted cages.
  const ry = KY - o.die * 7;
  const tight = cageTight(o);
  const wr = (i: number, amp: number) => (o.thrash > 0 ? Math.sin(o.thrashPh + i * 1.9) * amp * o.thrash : 0);
  const keep = o.die > 0 ? Math.max(0.6, 1 - o.die * 0.45) : 1;
  const droop = Math.max(o.open, o.die * 0.8);
  const rim: Rim = { x: kx, y: ry, r: 27 + (o.die > 0 ? 8 : 0), col: STAR.warm, col2: STAR.deep, e: 0.4 };
  const look = (moss = true): Look => ({
    p2: o.p2, die: o.die, moss, rim, alpha: 1,
    burn: o.die > 0.1 && o.die < 0.9 ? Math.min(1, o.die * 2.2) : 0,
  });
  const fall = clamp01((o.die - 0.25) / 0.75);
  /** Add a root; while dying, the tip past `keep` snaps off and falls away. */
  const add = (list: Root[], pts: number[], w0: number, w1: number, seed: number, lk: Look, gap = 3.4, scale = 1, cut = keep) => {
    const s = rootStrand(pts, w0, w1, seed);
    if (cut >= 0.999) { list.push(makeRoot(s, seed, lk, gap, scale)); return; }
    const m = Math.max(3, Math.round((s.n - 1) * cut));
    if (o.die > 0.25 && m < s.n - 3) {
      const side = s.x[s.n - 1] < kx ? -1 : 1;
      const frag = piece(s, m, s.n - 1, side * (0.3 + fall * 0.9), side * (1 + fall * 7), 2 + fall * 20);
      list.push(makeRoot(frag, seed + 50, { ...lk, moss: false, alpha: 1 - fall * 0.55 }, gap, scale));
    }
    list.push(makeRoot(piece(s, 0, m), seed, lk, gap, scale));
  };
  // A root grows from the ring at angle a, bulges outward, and its tip curls over the core toward
  // (tx, ty) relative to the core. Opening (vent, death) throws the tips outward and down.
  const rootPath = (a: number, tx: number, ty: number, bulge: number, i: number) => {
    const bx = CX + Math.cos(a) * 33, by = (Math.sin(a) > 0 ? GY - 1.5 : GY - 5) + Math.sin(a) * 11;
    const side = tx >= 0 ? 1 : -1;
    const ox = side * droop * 18, oy = droop * 14;
    const tX = kx + tx * (1 - tight * 0.35) + ox + wr(i, 3), tY = ry + ty + tight * 5 + oy + wr(i + 1, 3);
    const c1x = bx + (bx < kx ? -1 : 1) * bulge + wr(i + 2, 4), c1y = by - 20;
    const c2x = tX + side * (16 + droop * 6 - tight * 5) + wr(i + 3, 5), c2y = tY - 10 - tight * 2;
    return gnarl(bez(bx, by, c1x, c1y, c2x, c2y, tX, tY, 24), i + 1, 1.8);
  };
  /** A thin offshoot from 40% along a root, curling away from the core. */
  const branch = (list: Root[], pts: number[], u: number, seed: number, len: number, lk: Look) => {
    const i = Math.floor((pts.length / 2 - 1) * u);
    const px = pts[i * 2], py = pts[i * 2 + 1], side = px < kx ? -1 : 1;
    const ex = px + side * (len * 0.5 + droop * 4), ey = py - len * 0.75 + droop * 6;
    const p = gnarl(bez(px, py, px + side * len * 0.45, py - len * 0.1, ex + side * len * 0.3, ey + len * 0.15, ex, ey, 12), seed, 0.8);
    // A small curl at the tip.
    p.push(ex - side * 0.6, ey - 1.6, ex - side * 1.9, ey - 1.4);
    add(list, p, 2.6, 0.35, seed, { ...lk, moss: false }, 2.6, 0.75, o.die > 0 ? 0.7 : 1);
  };
  const back: Root[] = [], front: Root[] = [];
  const b1 = rootPath(-1.45, -8, -27, 6, 2), b0 = rootPath(-2.55, 7, -25, 9, 1), b2 = rootPath(-0.55, 15, -21, 8, 3);
  add(back, b1, 6.5, 0.6, 4, look());
  branch(back, b0, 0.42, 21, 7, look());
  add(back, b0, 8, 0.7, 1, look());
  branch(back, b2, 0.45, 23, 7, look());
  add(back, b2, 7.5, 0.7, 7, look());

  const f0 = rootPath(2.62, -6, -15, 10, 5), f1 = rootPath(0.5, 9, -13, 10, 6);
  branch(front, f0, 0.4, 25, 8, look());
  add(front, f0, 9, 0.75, 2, look(), 3.4, 1.1);
  branch(front, f1, 0.42, 27, 7.5, look());
  add(front, f1, 9, 0.75, 9, look(), 3.4, 1.1);
  {
    // The cradle: a stem from the front of the ring that splits into two claws cupping the core.
    const cy0 = ry + 15 + droop * 10;
    const stem = gnarl(bez(CX - 11, GY + 8, CX - 19, GY - 4, kx - 9, cy0 + 9, kx, cy0, 16), 11, 1.4);
    const sp = 1 + droop * 0.9;
    add(front, gnarl(bez(kx, cy0, kx - 6 * sp, cy0 + 1, kx - 12 * sp, ry + 9 + droop * 6, kx - 13 * sp, ry + 1 + droop * 8, 14), 12, 0.8), 4.4, 0.55, 6, look(false), 2.8, 0.9);
    add(front, gnarl(bez(kx, cy0, kx + 6 * sp, cy0, kx + 12 * sp, ry + 8 + droop * 6, kx + 12 * sp, ry + droop * 8, 14), 13, 0.8), 4.4, 0.55, 8, look(false), 2.8, 0.9);
    add(front, stem, 7, 3.6, 3, look(), 3.6, 1, 1);
  }
  if (droop < 0.5) {
    // A thin root strangling the core.
    const sl = tight * 3;
    add(front, gnarl(bez(CX - 33, GY - 2, kx - 22, ry + 10 - sl, kx + 4, ry + 7 - sl, kx + 17, ry - 9 + sl, 22), 14, 1), 3.4, 0.5, 5, look(false), 2.6, 0.8);
  }
  return { back, front };
}

function paintBoss(g: Ctx | null, e: Ctx | null, o: Pose, G: Geo, sharedG: boolean, sharedE: boolean) {
  const gk = (o.open > 0 ? 1.15 : 1) * (o.die > 0.85 ? 0.3 : 1);
  // The ring sinks in two steps while the star dies (so the dying frames share ring layers too).
  const rd = o.die > 0.55 ? (o.die < 0.8 ? 0.7 : 0.95) : 0;
  const ring = (c: Ctx, half: 'far' | 'near', emissive: boolean) => {
    const paint = (x: Ctx) => (emissive ? ringGlow(x, half, o.p2, rd) : ringBody(x, half, o.p2, rd));
    cached(c, `ring${emissive ? 'E' : ''}|${half}|${o.p2 ? 2 : 1}|${rd}`, 0, 56, BOSS_W, 44, paint);
  };
  if (g) {
    cached(g, `base|${o.p2 ? 2 : 1}|${gk.toFixed(2)}`, 0, 66, BOSS_W, 34, (c) => baseBody(c, o.p2, Math.min(1, gk)));
    // Shared cages are painted without the corruption, which goes on top, so both phases share them.
    const roots = (slot: string, list: Root[]) => {
      if (!sharedG) { paintRoots(g, list); return; }
      cage(g, slot, G.cage, (c) => paintRoots(c, list, 'base'), true);
      if (o.p2) paintRoots(g, list, 'p2');
    };
    roots('back', G.back);
    ring(g, 'far', false);
    drawShards(g, null, G.shards, false, o, G.kx, G.ky);
    starBody(g, o, G.star);
    roots('front', G.front);
    ring(g, 'near', false);
    drawShards(g, null, G.shards, true, o, G.kx, G.ky);
  }
  if (e) {
    cached(e, `baseE|${o.p2 ? 2 : 1}|${gk.toFixed(2)}`, 0, 66, BOSS_W, 34, (c) => baseGlow(c, o.p2, gk));
    const glows = (list: Root[], occ: [number, number, number] | null) => (c: Ctx) => glowRoots(c, list, occ);
    const occ: [number, number, number] = [KX, KY - o.die * 7, 40];
    const ek = G.cage + '|' + o.p2;
    if (sharedE) cage(e, 'backE', ek, glows(G.back, null)); else glows(G.back, null)(e);
    ring(e, 'far', true);
    drawShards(null, e, G.shards, false, o, G.kx, G.ky);
    starGlow(e, o, G.star);
    if (sharedE) cage(e, 'frontE', ek, glows(G.front, occ)); else glows(G.front, occ)(e);
    ring(e, 'near', true);
    drawShards(null, e, G.shards, true, o, G.kx, G.ky);
  }
}

/** A frame's painter; `uses` counts the frames that share each cage (a lone cage is painted in place). */
function frame(o: Pose, uses: Map<string, number>): Painter {
  let geo: Geo | null = null;
  const kg = cageKey(o), ke = kg + '|' + o.p2;
  for (const k of ['g' + kg, 'e' + ke]) uses.set(k, (uses.get(k) ?? 0) + 1);
  return (g, e) => {
    const G = live(g) ? g : null, E = live(e) ? e : null;
    if (!G && !E) return;
    geo ??= buildGeo(o);
    paintBoss(G, E, o, geo, (uses.get('g' + kg) ?? 0) > 1, (uses.get('e' + ke) ?? 0) > 1);
  };
}

const pose = (o: Partial<Pose>): Pose => ({ pulse: 0, tight: 0, open: 0, flare: 0, shard: 0, p2: false, hurt: false, thrash: 0, thrashPh: 0, die: 0, ...o });

export function bossSprites(): SpriteSet {
  const anims: Record<string, Painter[]> = {};
  const uses = new Map<string, number>();
  const F = (o: Partial<Pose>) => frame(pose(o), uses);
  for (const p2 of [false, true]) {
    const s = p2 ? '2' : '';
    anims['idle' + s] = [0, 1, 2, 3, 4, 5].map((i) => F({ pulse: Math.sin((i / 6) * Math.PI * 2), shard: (i / 6) * Math.PI * 2 * 0.5, p2 }));
    anims['windup' + s] = [0, 1, 2, 3].map((i) => F({ pulse: 0.6 + (i % 2) * 0.4, tight: 0.6 + i * 0.13, flare: 0.25 * (i % 2), shard: i * 0.3, p2 }));
    anims['cast' + s] = [0, 1].map((i) => F({ pulse: 1, tight: 0.3, flare: 1 - i * 0.3, shard: i * 0.4, p2 }));
    // (hurt straight after cast: they share a cage, painted once)
    anims['hurt' + s] = [F({ pulse: -1, hurt: true, tight: 0.3, p2 })];
    anims['vent' + s] = [0, 1, 2, 3].map((i) => F({ pulse: Math.sin((i / 4) * Math.PI * 2), open: 1, shard: i * 0.5, p2 }));
  }
  anims.roar = [0, 1, 2, 3].map((i) => F({ pulse: 1, flare: 0.6 + (i % 2) * 0.4, thrash: 1, thrashPh: i * 1.6, p2: i >= 2, shard: i * 0.7 }));
  anims.dying = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => F({ die: ((i + 1) / 8) * 0.999, pulse: (i % 2) * 0.8, flare: i < 5 ? 0.5 : 0, p2: true, thrash: i < 5 ? 0.6 : 0, thrashPh: i * 2.1 }));
  return { w: BOSS_W, h: BOSS_H, footY: BOSS_FOOT, anims };
}

// ---- arena pieces ---------------------------------------------------------------------------------

/** Heaved, broken flagstones round a hole in the floor (for the thorn walls and root spikes). */
function heave(g: Ctx, cx: number, gy: number, rx: number, ry: number, seed: number, lift: number, part: 'back' | 'front' | 'all' = 'all', mask = false) {
  const r = rng(seed);
  const n = 8;
  const slabs: { top: number[]; face: number[] | null; edge: number[]; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU + r() * 0.25, a1 = a0 + TAU / n - 0.22 - r() * 0.2;
    const am = (a0 + a1) / 2, sn = Math.sin(am);
    const h = lift * (0.55 + r() * 0.7) * (sn > 0 ? 0.8 : 1.1);
    const k0 = 0.82 + r() * 0.08, k1 = 1.18 + r() * 0.1;
    const p = (a: number, k: number, up: number) => [cx + Math.cos(a) * rx * k, gy + Math.sin(a) * ry * k - up];
    // A broken flagstone tipped up out of the crack: outer edge on the floor, inner edge lifted.
    const top = [...p(a0, k1, 0), ...p(am, k1 + 0.04, 0), ...p(a1, k1, 0), ...p(a1, k0, h), ...p(am, k0 - 0.06, h * 1.1), ...p(a0, k0, h)];
    const edge = top.slice(6);
    // Behind the crack the lifted edge shows its broken thickness.
    const face = sn < 0.2 ? [...edge, ...p(a0, k0, h - 1.4), ...p(am, k0 - 0.06, h * 1.1 - 1.5), ...p(a1, k0, h - 1.4)] : null;
    slabs.push({ top, face, edge, y: sn });
  }
  slabs.sort((a, b) => a.y - b.y);
  const ink = new Path2D(), tops = new Path2D(), faces = new Path2D(), lit = new Path2D(), cracks = new Path2D();
  let any = false;
  for (const S of slabs) {
    if ((part === 'back' && S.y > 0.05) || (part === 'front' && S.y <= 0.05)) continue;
    any = true;
    poly(ink, S.top); if (S.face) poly(ink, S.face);
    poly(tops, S.top);
    if (S.face) poly(faces, S.face);
    thinLine(lit, S.edge, 0.32);
    const t = S.top;
    thinLine(cracks, [(t[0] + t[2]) / 2, (t[1] + t[3]) / 2, (t[0] + t[8]) / 2 + (r() - 0.5), (t[1] + t[9]) / 2, t[8] + (r() - 0.5) * 0.6, t[9] + 0.3], 0.22);
  }
  if (!any) return;
  // (In the emissive layer: black, hiding the glow behind the slabs.)
  if (mask) { g.fillStyle = 'rgba(0,0,0,0.92)'; g.fill(tops); g.fill(faces); return; }
  g.lineWidth = 1.3; g.strokeStyle = css(INK); g.stroke(ink);
  g.fillStyle = css(STONE.d); g.fill(faces);
  g.fillStyle = lin(g, cx, gy - ry * 1.3, cx, gy + ry * 1.3, [[0, css(STONE.m)], [0.5, css(STONE.b)], [1, css(STONE.s)]]);
  g.fill(tops);
  g.save(); g.globalAlpha = 0.4; g.fillStyle = speck(g, 10); g.fill(tops); g.restore();
  g.fillStyle = css(STONE.h, 0.75); g.fill(lit);
  g.fillStyle = css(STONE.g, 0.85); g.fill(cracks);
}
/** A dark hole with glowing cracks radiating from it. */
function holeCracks(cx: number, gy: number, rx: number, ry: number, seed: number, n: number): Path2D {
  const r = rng(seed), p = new Path2D();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.5;
    let rr = 0.3;
    p.moveTo(cx + Math.cos(a) * rx * rr, gy + Math.sin(a) * ry * rr);
    for (let k = 0; k < 3; k++) {
      rr += 0.24 + r() * 0.16;
      const aa = a + (r() - 0.5) * 0.4;
      p.lineTo(cx + Math.cos(aa) * rx * rr, gy + Math.sin(aa) * ry * rr);
    }
  }
  return p;
}
function hole(g: Ctx | null, e: Ctx | null, cx: number, gy: number, rx: number, ry: number, hot: number, hotL: number, k: number, seed: number) {
  const cp = holeCracks(cx, gy, rx, ry, seed, 7);
  if (g) {
    g.save(); g.translate(cx, gy); g.scale(1, ry / rx);
    g.beginPath(); g.arc(0, 0, rx, 0, TAU);
    g.fillStyle = rad(g, 0, 0, 0, rx, [[0, css(mix(0x140c14, hot, 0.55 * k))], [0.45, css(mix(0x0c090f, hot, 0.2 * k))], [0.8, css(0x0a080d)], [1, css(0x0a080d, 0)]]);
    g.fill();
    g.restore();
    g.lineWidth = 1.0; g.strokeStyle = css(0x0a080d); g.stroke(cp);
    g.lineWidth = 0.5; g.strokeStyle = css(hot); g.stroke(cp);
    g.lineWidth = 0.2; g.strokeStyle = css(hotL, 0.9); g.stroke(cp);
  }
  if (e) {
    e.save(); e.translate(cx, gy); e.scale(1, ry / rx);
    glow(e, 0, 0, rx * 0.9, hot, 0.6 * k, 0.2);
    e.restore();
    e.lineWidth = 1.4; e.strokeStyle = css(hot, 0.55 * k); e.stroke(cp);
    e.lineWidth = 0.45; e.strokeStyle = css(hotL, 0.9 * k); e.stroke(cp);
  }
}

/**
 * A bramble of thorned roots that bursts out of the floor in phase 2 and blocks movement: hooked
 * uprights and two roots arching out of the crack and diving back into the floor. Walls stand on
 * neighbouring tiles, so these overlap into one hedge.
 */
function wallFrame(v: number): Painter {
  let geo: { roots: Root[]; ends: number[] } | null = null;
  const gy = 38, cx = 20;
  // Lit from the corrupted crack below: the glow only reaches the lower bark.
  const rim: Rim = { x: cx, y: gy + 1, r: 17, col: CORR.c, col2: CORR.m, e: 0.55, tint: 0.45 };
  const build = () => {
    const roots: Root[] = [], ends: number[] = [];
    const m = (x: number) => (v ? 2 * cx - x : x);
    const lk: Look = { p2: true, die: 0, moss: false, rim, burn: 0, alpha: 1 };
    const upright = (bx: number, tx: number, top: number, w0: number, seed: number) => {
      bx = m(bx); tx = m(tx);
      const dir = tx >= bx ? 1 : -1;
      const p = bez(bx, gy + 1, bx - dir * 2, gy - 12, tx - dir * 6, top + 10, tx, top, 16);
      p.push(tx + dir * 1.2, top - 1.8, tx + dir * 3, top - 1.6, tx + dir * 3.9, top + 0.4);
      roots.push(makeRoot(rootStrand(gnarl(p, seed + v * 3, 0.9), w0, 0.6, seed, 0.18), seed, lk, 2.3, 1.35, 30));
    };
    const arch = (x0: number, y0: number, px: number, py: number, x1: number, y1: number, w0: number, seed: number) => {
      x0 = m(x0); px = m(px); x1 = m(x1);
      const p = bez(x0, y0 + 1, x0 + (px - x0) * 0.2, py - 6, px + (x1 - px) * 0.6, py - 4, x1, y1 + 1.5, 22);
      roots.push(makeRoot(rootStrand(gnarl(p, seed + v * 5, 1.1), w0, 3, seed, 0.2), seed, lk, 2.4, 1.3, 30));
      ends.push(x1, y1);
    };
    upright(15, 10, 7 + v, 5, 5);
    upright(26, 31, 9 - v, 5, 7);
    arch(5, gy - 0.5, 16, 10, 31, gy - 2.5, 6, 9);
    upright(20, 21, 2 + v, 6.5, 3);
    arch(36, gy + 0.5, 24, 14, 8, gy + 1.2, 6.5, 1);
    upright(18, 9, 22, 4.4, 11);
    return { roots, ends };
  };
  return (g, e) => {
    const G = live(g) ? g : null, E = live(e) ? e : null;
    if (!G && !E) return;
    geo ??= build();
    const { roots, ends } = geo;
    if (G) {
      G.save(); G.translate(cx, gy + 1); G.scale(1, 0.34);
      G.fillStyle = rad(G, 0, 0, 0, 20, [[0.55, 'rgba(5,5,11,0.8)'], [1, 'rgba(5,5,11,0)']]); G.fillRect(-20, -20, 40, 40);
      G.restore();
      hole(G, null, cx, gy, 11, 3.8, CORR.c, CORR.l, 1, 61 + v);
      for (let i = 0; i < ends.length; i += 2) hole(G, null, ends[i], ends[i + 1] + 0.5, 3.4, 1.3, CORR.m, CORR.c, 0.6, 71 + i);
      heave(G, cx, gy, 11, 3.8, 63 + v, 2.4, 'back');
      paintRoots(G, roots);
      heave(G, cx, gy, 11, 3.8, 63 + v, 2.4, 'front');
      for (let i = 0; i < ends.length; i += 2) heave(G, ends[i], ends[i + 1] + 0.5, 3.6, 1.4, 75 + i, 1, 'front');
    }
    if (E) {
      hole(null, E, cx, gy, 11, 3.8, CORR.c, CORR.l, 1, 61 + v);
      glowRoots(E, roots, null);
      heave(E, cx, gy, 11, 3.8, 63 + v, 2.4, 'front', true);
    }
  };
}
export function bossWallSprites(): SpriteSet {
  return { w: 40, h: 44, footY: 38, anims: { idle: [wallFrame(0), wallFrame(1)] } };
}

/** Root spikes erupting from the ground (the 'root' hazard): rise, full, and withdraw. */
function thornFrame(k: number, idx: number, p2: boolean): Painter {
  const gy = 32, cx = 22;
  const hot = p2 ? CORR.c : STAR.deep, hotL = p2 ? CORR.l : STAR.warm, hotW = p2 ? CORR.w : STAR.white;
  interface Spike { R: Root; tip: Strand; mx: number; my: number; tx: number; ty: number }
  let spikes: Spike[] | null = null;
  const build = () => {
    // [base x, base y offset, height, lean, base width]: a ring of spikes round the crack, the tallest
    // in the middle; sorted back to front.
    const specs: [number, number, number, number, number][] = [
      [13, -2.6, 13, -5, 3.6], [31, -2.4, 14, 5, 3.6], [22, -3.4, 17, 1.5, 3.8],
      [7, 0.4, 10, -7, 3.4], [37, 0.6, 9, 7, 3.2],
      [17, 0.6, 24, -3, 5], [27, 1, 21, 4, 4.6],
      [11, 3, 12, -4, 3.6], [33, 3.2, 13, 5, 3.6], [22, 3.6, 15, 0.5, 4],
    ];
    const out: Spike[] = [];
    const rim: Rim = { x: cx, y: gy + 1, r: 18, col: hot, col2: hot, e: 0.6, tint: 0.5 };
    specs.forEach(([x, oy, h, lean, wd], i) => {
      const hh = h * k;
      if (hh < 1.5) return;
      const by = gy + oy, tx = x + lean * k, ty = by - hh;
      const bend = (i % 2 ? 1 : -1) * 0.8;
      const p = bez(x, by + 1.2, x + bend, by - hh * 0.35, tx - lean * 0.25 - bend * 0.5, ty + hh * 0.3, tx, ty, 12);
      const s = rootStrand(p, wd * Math.min(1, 0.55 + k * 0.5), 0.14, 70 + i, 0.2);
      const R = makeRoot(s, 70 + i, { p2, die: 0, moss: false, rim, burn: 0, alpha: 1 }, hh > 11 ? 3 : 99, 0.8, 99);
      const m = Math.floor(s.n * 0.55);
      out.push({ R, tip: piece(s, m, s.n - 1), mx: s.x[m], my: s.y[m], tx, ty });
    });
    return out;
  };
  return (g, e) => {
    const G = live(g) ? g : null, E = live(e) ? e : null;
    if (!G && !E) return;
    spikes ??= build();
    const glowK = idx === 3 ? 1.15 : idx === 4 ? 0.7 : 1;
    const lift = 0.8 + k * 1.8;
    if (G) {
      G.save(); G.translate(cx, gy + 1); G.scale(1, 0.33);
      G.fillStyle = rad(G, 0, 0, 0, 22, [[0.55, 'rgba(5,5,11,0.85)'], [1, 'rgba(5,5,11,0)']]); G.fillRect(-22, -22, 44, 44);
      G.restore();
      hole(G, null, cx, gy, 15, 5, hot, hotL, glowK, 81 + (p2 ? 1 : 0));
      heave(G, cx, gy, 16, 5.4, 83, lift, 'back');
      for (const S of spikes) {
        paintRoots(G, [S.R]);
        // The burning tip.
        strandPath(G, S.tip, 0, true);
        G.fillStyle = lin(G, S.mx, S.my, S.tx, S.ty, [[0, css(hot, 0)], [0.4, css(hot, 0.85)], [0.78, css(hotL)], [1, css(hotW)]]);
        G.fill();
      }
      heave(G, cx, gy, 16, 5.4, 83, lift, 'front');
      if (idx === 0) {
        // Clods thrown up as the spikes break the floor.
        const r = rng(91);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + r(), x = cx + Math.cos(a) * (10 + r() * 8), y = gy - 3 - r() * 7 + Math.sin(a) * 3;
          rock(G, null, x, y, 0.7 + r() * 0.8, r, false, null);
        }
      }
    }
    if (E) {
      hole(null, E, cx, gy, 15, 5, hot, hotL, glowK, 81 + (p2 ? 1 : 0));
      glowRoots(E, spikes.map((S) => S.R), null);
      for (const S of spikes) {
        strandPath(E, S.tip, 0.15, true);
        E.fillStyle = lin(E, S.mx, S.my, S.tx, S.ty, [[0, css(hot, 0)], [0.5, css(hot, 0.7 * glowK)], [1, css(hotW, glowK)]]);
        E.fill();
        glow(E, S.tx, S.ty, 2.8, hot, 0.8 * glowK);
      }
      heave(E, cx, gy, 16, 5.4, 83, lift, 'front', true);
    }
  };
}
export function bossThornSprites(): SpriteSet {
  const ks = [0.35, 0.75, 1, 1, 0.6];
  return {
    w: 44, h: 40, footY: 32,
    anims: { rise: ks.map((k, i) => thornFrame(k, i, false)), rise2: ks.map((k, i) => thornFrame(k, i, true)) },
  };
}
