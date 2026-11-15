// Husk Colossus: a hunched stone golem about twice the keeper's height, built from weathered boulder
// plates over a molten core. High boulder shoulders crowd a low head with a heavy brow; a broad chest
// tapers to a rag-bound waist; long arms end in huge fists near the ground; short thick legs. Each
// plate is painted as chiselled stone: a lifted top face, side facets shaded by which way they face the
// moon, grain, pits, chips, hairline cracks, and an ink seam where it overlaps the plate behind. Amber
// cracks (magenta for the elite, which also grows crystal spikes on its shoulders) glow through the
// seams, warm the stone around them and radiate from the core socket; two eyes burn under the brow.
// Facing right; the near (right) arm is bigger and lighter, the far one darker.
//
// The golem is a rigged puppet: every stone (or group of stones, like a fist with its knuckles) is a
// Def painted once into a cached stamp per density, angle bucket and glow level, and each frame places
// the stamps on a skeleton whose bones keep their length (two-bone IK for arms and legs). That keeps
// the stones identical from frame to frame and the whole set cheap to paint. The emissive pass replays
// the same order, erasing the glow of anything a later stone covers, so a crack behind an arm never
// shines through it.
import type { Painter, SpriteSet } from '../sprite';
import {
  type Ctx, TAU, blobPath, css, figure, glow, layer, lin, makeCanvas, mix, polyline, rad, rng, roundPoly, scaleOf, softShadow, taper, noiseTexture,
} from '../paint';

const W = 92, H = 94, FY = 90;
type Pts = number[];
type V2 = [number, number];

/** The atlas paints the body and the emissive layer in separate passes, handing the unused one a 4x4 scratch. */
const live = (c: Ctx) => c.canvas.width > 8 || c.canvas.height > 8;

interface Hue { key: string; deep: number; mid: number; light: number; white: number }
const AMBER: Hue = { key: 'a', deep: 0xd9771f, mid: 0xffb347, light: 0xffe29a, white: 0xfff8e0 };
const MAGENTA: Hue = { key: 'm', deep: 0xa8287f, mid: 0xe04bb0, light: 0xff9be0, white: 0xffe3f6 };

// Stone ramp, deep shadow to moonlit edge (mid-tones sit around 0x55-0x90 so they survive the light map).
const STONE = [0x1b1d25, 0x2e313b, 0x454852, 0x5e616c, 0x7a7d88, 0x989ba5, 0xbcbec6];
const ramp = (t: number) => {
  const x = Math.max(0, Math.min(1, t)) * (STONE.length - 1);
  const i = Math.min(STONE.length - 2, Math.floor(x));
  return mix(STONE[i], STONE[i + 1], x - i);
};
// Light from the upper left, mostly from above (a 3/4 top-down view).
const LX = -0.55, LY = -0.75;
const LN = Math.hypot(LX, LY);
const INK = 0x0b0c13;

// ---- geometry -------------------------------------------------------------------------------------

function centroid(p: Pts): V2 {
  let x = 0, y = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) { x += p[i * 2]; y += p[i * 2 + 1]; }
  return [x / n, y / n];
}
function bbox(p: Pts): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
  }
  return [x0, y0, x1, y1];
}
const rot = (p: Pts, a: number): Pts => {
  if (!a) return p;
  const c = Math.cos(a), s = Math.sin(a);
  const out: Pts = [];
  for (let i = 0; i < p.length; i += 2) out.push(p[i] * c - p[i + 1] * s, p[i] * s + p[i + 1] * c);
  return out;
};

/** An irregular boulder outline: a squarish superellipse around (cx, cy), rotated by tilt, corners jittered. */
function boulder(cx: number, cy: number, rx: number, ry: number, seed: number, o: { n?: number; j?: number; tilt?: number; sq?: number } = {}): Pts {
  const r = rng(seed * 977 + 13);
  const n = o.n ?? 8, j = o.j ?? 0.08, e = o.sq ?? 0.6;
  const ph = Math.PI / n + (r() - 0.5) * 0.4;
  const out: Pts = [];
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * TAU + (r() - 0.5) * (TAU / n) * 0.3;
    const c = Math.cos(a), s = Math.sin(a);
    const k = 1 - j + r() * j * 2;
    out.push(Math.sign(c) * Math.pow(Math.abs(c), e) * rx * k, Math.sign(s) * Math.pow(Math.abs(s), e) * ry * k);
  }
  const t = rot(out, o.tilt ?? 0);
  for (let i = 0; i < t.length; i += 2) { t[i] += cx; t[i + 1] += cy; }
  return t;
}

/** A limb plate along +x from the pivot to L: width w0 at the pivot, w1 at L, bulging between, ends overlapping the joints. */
function segment(L: number, w0: number, w1: number, seed: number, over = 2): Pts {
  const r = rng(seed * 331 + 7);
  const wm = Math.max(w0, w1) * 1.07;
  const loc: V2[] = [
    [-over, -w0 * 0.3], [L * 0.12, -w0 / 2], [L * 0.52, -wm / 2], [L * 0.9, -w1 / 2], [L + over, -w1 * 0.28],
    [L + over, w1 * 0.28], [L * 0.9, w1 / 2], [L * 0.5, wm / 2], [L * 0.1, w0 / 2], [-over, w0 * 0.3],
  ];
  const out: Pts = [];
  for (const [u, v] of loc) out.push(u + (r() - 0.5) * 1.1, v + (r() - 0.5) * 0.9);
  return out;
}

/** Random-walk cracks from points on a plate's outline toward its middle, or radiating from a point. */
function crackLines(pts: Pts, seed: number, n: number, from?: V2, reach = 1): number[][] {
  const r = rng(seed * 113 + 5);
  const [cx, cy] = centroid(pts);
  const [x0, y0, x1, y1] = bbox(pts);
  const size = Math.min(x1 - x0, y1 - y0);
  const out: number[][] = [];
  const m = pts.length / 2;
  for (let k = 0; k < n; k++) {
    let x: number, y: number, a: number;
    if (from) {
      a = (k / n) * TAU + r() * 0.8;
      x = from[0] + Math.cos(a) * 4; y = from[1] + Math.sin(a) * 4;
    } else {
      const i = Math.floor(r() * m), t = 0.25 + r() * 0.5;
      const ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[((i + 1) % m) * 2], by = pts[((i + 1) % m) * 2 + 1];
      x = ax + (bx - ax) * t; y = ay + (by - ay) * t;
      a = Math.atan2(cy - y, cx - x) + (r() - 0.5) * 1.0;
      x -= Math.cos(a) * 1.2; y -= Math.sin(a) * 1.2;
    }
    const len = size * reach * (from ? 0.45 + r() * 0.3 : 0.4 + r() * 0.35);
    const line = [x, y];
    let d = 0;
    while (d < len) {
      const st = 1.3 + r() * 1.4;
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * st; y += Math.sin(a) * st; d += st;
      line.push(x, y);
      if (r() < 0.12 && d < len * 0.6) {
        const b = [x, y];
        let bx = x, by = y, ba = a + (r() < 0.5 ? 0.9 : -0.9);
        for (let s = 0; s < 2 + r() * 2; s++) { ba += (r() - 0.5) * 0.8; bx += Math.cos(ba) * 1.4; by += Math.sin(ba) * 1.4; b.push(bx, by); }
        out.push(b);
      }
    }
    out.push(line);
  }
  return out;
}

/** Two-bone IK: the middle joint for a chain from a to b with bone lengths l1, l2, bent toward `prefer`. */
function ik(a: V2, b: V2, l1: number, l2: number, prefer: (p: V2) => number): V2 {
  let dx = b[0] - a[0], dy = b[1] - a[1];
  let d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  d = Math.max(Math.abs(l1 - l2) + 0.5, Math.min(l1 + l2 - 0.3, d));
  const ca = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const al = Math.acos(ca);
  const base = Math.atan2(dy, dx);
  const p1: V2 = [a[0] + Math.cos(base + al) * l1, a[1] + Math.sin(base + al) * l1];
  const p2: V2 = [a[0] + Math.cos(base - al) * l1, a[1] + Math.sin(base - al) * l1];
  return prefer(p1) >= prefer(p2) ? p1 : p2;
}

// ---- stone painting -------------------------------------------------------------------------------

interface Sub {
  pts: Pts; seed: number; tone?: number;
  /** Side facet width, corner rounding. */
  bev?: number; r?: number;
  cracks?: number; lines?: number[][];
  chips?: number; pits?: number;
}
interface Def {
  key: string;
  subs: Sub[];
  /** Extra painting after the stones, in local coordinates (the context is rotated to the bucket). */
  deco?: (c: Ctx, C: Hue, lv: number) => void;
  decoEmit?: (E: Ctx, C: Hue, lv: number) => void;
  /** Extra stamp margin for decoration that leaves the stones' outline. */
  pad?: number;
  /** Strength of the contact shadow cast on what lies behind (0 = none). */
  ao?: number;
}

function grainOver(f: Ctx, seed: number, x: number, y: number, w: number, h: number) {
  const r = rng(seed * 17 + 1);
  const pat = (tex: HTMLCanvasElement, units: number) => {
    const p = f.createPattern(tex, 'repeat')!;
    const k = units / tex.width;
    p.setTransform(new DOMMatrix([k, 0, 0, k, r() * 60, r() * 60]));
    return p;
  };
  f.globalCompositeOperation = 'overlay';
  f.globalAlpha = 0.28;
  f.fillStyle = pat(noiseTexture(128, 4, 77, 4, 1.1), 30);
  f.fillRect(x, y, w, h);
  f.globalAlpha = 0.2;
  f.fillStyle = pat(noiseTexture(128, 16, 41, 3, 1.4), 11);
  f.fillRect(x, y, w, h);
  f.globalCompositeOperation = 'source-over';
  f.globalAlpha = 1;
}

/** Stroke a crack into the lit body: heat on the stone around it, a dark groove, then the molten line. */
function crackBody(f: Ctx, line: number[], C: Hue, lv: number) {
  polyline(f, line, 2.6, css(C.deep, 0.13 + lv * 0.05));
  taper(f, line, 1.05, 0.3, css(0x120806));
  taper(f, line, 0.5, 0.12, css(lv > 0 ? C.light : C.mid));
  if (lv > 1) taper(f, line, 0.24, 0.06, css(C.white));
}
/** The same crack on the emissive layer: a soft halo, then the bright core. */
function crackEmit(E: Ctx, line: number[], C: Hue, lv: number) {
  taper(E, line, 3.6, 1.2, css(C.deep, 0.12 + lv * 0.05));
  taper(E, line, 1.6, 0.5, css(C.mid, 0.32 + lv * 0.12));
  taper(E, line, 0.7, 0.14, css(lv > 0 ? C.white : C.light, 0.95));
}

/** Paint one chiselled stone (see the header) at local coordinates rotated by qa. */
function paintStone(f: Ctx, s: Sub, qa: number, C: Hue, lv: number) {
  const pts = rot(s.pts, qa);
  const [cx, cy] = centroid(pts);
  const [x0, y0, x1, y1] = bbox(pts);
  const w = x1 - x0, h = y1 - y0, m = Math.min(w, h);
  const rr = s.r ?? m * 0.2;
  const tone = s.tone ?? 0;
  const bev = Math.min(s.bev ?? Math.max(1.3, m * 0.2), m * 0.32);
  const sc = 1 - bev / (m / 2);
  const lift = m * 0.07;
  const inner: Pts = [];
  for (let i = 0; i < pts.length; i += 2) inner.push(cx + (pts[i] - cx) * sc - lift * 0.45, cy + (pts[i + 1] - cy) * sc - lift);
  const n = pts.length / 2;
  // Details are generated in the stone's own frame so every angle bucket shows the same stone.
  const r = rng(s.seed * 7919 + 3);
  const [lx0, ly0, lx1, ly1] = bbox(s.pts);
  const lw = lx1 - lx0, lh = ly1 - ly0;
  const pits: Pts = [], pitR: number[] = [];
  for (let i = 0; i < (s.pits ?? Math.round((lw * lh) / 110)); i++) {
    pits.push(lx0 + lw * (0.2 + r() * 0.6), ly0 + lh * (0.2 + r() * 0.6)); pitR.push(0.22 + r() * 0.35);
  }
  const pitW = rot(pits, qa);
  const chips: number[] = [];
  for (let i = 0; i < (s.chips ?? Math.min(3, Math.round((lw + lh) / 16))); i++) {
    const k = Math.floor(r() * n), t = 0.2 + r() * 0.6;
    const ax = pts[k * 2], ay = pts[k * 2 + 1], bx = pts[((k + 1) % n) * 2], by = pts[((k + 1) % n) * 2 + 1];
    chips.push(ax + (bx - ax) * t, ay + (by - ay) * t, Math.atan2(cy - ay, cx - ax), 0.9 + r() * 1.3);
  }
  const hair: number[][] = [];
  for (let i = 0; i < Math.round((lw * lh) / 200); i++) {
    let x = lx0 + lw * (0.2 + r() * 0.6), y = ly0 + lh * (0.2 + r() * 0.6), a = r() * TAU;
    const l = [x, y];
    for (let k = 0; k < 2 + r() * 3; k++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * 1.4; y += Math.sin(a) * 1.4; l.push(x, y); }
    hair.push(rot(l, qa));
  }
  const lines = (s.lines ?? (s.cracks ? crackLines(s.pts, s.seed, s.cracks) : [])).map((l) => rot(l, qa));
  const path = () => roundPoly(f, pts, rr);

  path();
  f.fillStyle = css(ramp(0.36 + tone));
  f.fill();
  f.save();
  path();
  f.clip();
  // Side facets, each shaded by the way it faces.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[j * 2], by = pts[j * 2 + 1];
    let nx = by - ay, ny = -(bx - ax);
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    const k = (nx * LX + ny * LY) / LN;
    const col = ramp(0.38 + tone + k * 0.3);
    f.beginPath();
    f.moveTo(ax + (ax - cx) * 0.3, ay + (ay - cy) * 0.3);
    f.lineTo(bx + (bx - cx) * 0.3, by + (by - cy) * 0.3);
    f.lineTo(inner[j * 2], inner[j * 2 + 1]);
    f.lineTo(inner[i * 2], inner[i * 2 + 1]);
    f.closePath();
    f.fillStyle = css(col);
    f.fill();
    f.lineWidth = 0.15; f.strokeStyle = css(col); f.stroke();
  }
  // The top face, lit toward the upper left, with a crisp lit edge and a dark crease.
  const [ix0, iy0, ix1, iy1] = bbox(inner);
  const face = () => roundPoly(f, inner, rr * 0.75);
  face();
  f.fillStyle = lin(f, ix0, iy0, ix1, iy1, [[0, css(ramp(0.68 + tone))], [0.5, css(ramp(0.58 + tone))], [1, css(ramp(0.47 + tone))]]);
  f.fill();
  f.save();
  face();
  f.clip();
  f.translate(-0.4, -0.5);
  face();
  f.lineWidth = 0.8; f.strokeStyle = css(ramp(0.24 + tone), 0.6); f.stroke();
  f.translate(0.8, 1.0);
  face();
  f.lineWidth = 0.6; f.strokeStyle = css(ramp(0.9 + tone), 0.55); f.stroke();
  f.restore();
  grainOver(f, s.seed, x0 - 1, y0 - 1, w + 2, h + 2);
  // Pits: a dark hollow with a lit lower-right lip.
  for (let i = 0; i < pitR.length; i++) {
    const px = pitW[i * 2], py = pitW[i * 2 + 1], pr = pitR[i];
    f.beginPath(); f.ellipse(px + pr * 0.4, py + pr * 0.45, pr, pr * 0.8, 0, 0, TAU);
    f.fillStyle = css(ramp(0.85 + tone), 0.4); f.fill();
    f.beginPath(); f.ellipse(px, py, pr, pr * 0.8, 0, 0, TAU);
    f.fillStyle = css(ramp(0.14 + tone), 0.75); f.fill();
  }
  // Chips knocked out of the edge: a shadowed notch with a lit far wall.
  for (let i = 0; i < chips.length; i += 4) {
    const px = chips[i], py = chips[i + 1], a = chips[i + 2], z = chips[i + 3];
    const c = Math.cos(a), si = Math.sin(a);
    const P = (u: number, v: number): V2 => [px + c * u - si * v, py + si * u + c * v];
    const p1 = P(-0.6, -z), p2 = P(z * 1.1, -z * 0.2), p3 = P(0.2, z * 0.9);
    f.beginPath(); f.moveTo(p1[0], p1[1]); f.lineTo(p2[0], p2[1]); f.lineTo(p3[0], p3[1]); f.closePath();
    f.fillStyle = css(ramp(0.2 + tone)); f.fill();
    f.beginPath(); f.moveTo(p2[0], p2[1]); f.lineTo(p3[0], p3[1]);
    f.lineWidth = 0.3; f.strokeStyle = css(ramp(0.8 + tone), 0.7); f.stroke();
  }
  for (const l of hair) polyline(f, l, 0.26, css(ramp(0.12 + tone), 0.6));
  for (const l of lines) crackBody(f, l, C, lv);
  f.restore();
  // Ink seam all round, so stones read apart where they overlap.
  path();
  f.lineWidth = 0.6;
  f.strokeStyle = css(INK, 0.92);
  f.stroke();
}

interface Stamp { c: HTMLCanvasElement; x0: number; y0: number; w: number; h: number }

/** Stamps cached for one sprite set (dropped with it once the atlas is painted). */
class Stamps {
  private m = new Map<string, Stamp | null>();
  constructor(private C: Hue) {}

  private bounds(def: Def, qa: number, pad: number) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of def.subs) {
      const [a, b, c, d] = bbox(rot(s.pts, qa));
      x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d);
    }
    const p = pad + (def.pad ?? 0);
    return [x0 - p, y0 - p, x1 + p, y1 + p];
  }
  private make(d: number, b: number[], paint: (c: Ctx) => void): Stamp {
    const x0 = Math.floor(b[0] * d) / d, y0 = Math.floor(b[1] * d) / d;
    const c = makeCanvas((b[2] - x0) * d, (b[3] - y0) * d);
    const g = c.getContext('2d')!;
    g.setTransform(d, 0, 0, d, -x0 * d, -y0 * d);
    g.lineJoin = 'round'; g.lineCap = 'round';
    paint(g);
    return { c, x0, y0, w: c.width / d, h: c.height / d };
  }
  // Stamps do not depend on the glow level: windups brighten through the emissive pass and the
  // per-frame core light instead, so every frame of the set shares them.
  body(def: Def, qa: number, d: number): Stamp {
    const k = `b|${def.key}|${qa.toFixed(3)}|${d}`;
    let s = this.m.get(k);
    if (!s) {
      s = this.make(d, this.bounds(def, qa, 1), (g) => {
        for (const sub of def.subs) paintStone(g, sub, qa, this.C, 1);
        if (def.deco) { g.save(); g.rotate(qa); def.deco(g, this.C, 1); g.restore(); }
      });
      this.m.set(k, s);
    }
    return s;
  }
  emit(def: Def, qa: number, d: number): Stamp | null {
    const lv = 1;
    const k = `e|${def.key}|${qa.toFixed(3)}|${d}`;
    if (this.m.has(k)) return this.m.get(k)!;
    const lines = def.subs.flatMap((s) => (s.lines ?? (s.cracks ? crackLines(s.pts, s.seed, s.cracks) : [])).map((l) => ({ l: rot(l, qa), s })));
    let st: Stamp | null = null;
    if (lines.length || def.decoEmit) {
      st = this.make(d, this.bounds(def, qa, 2), (g) => {
        for (const { l, s } of lines) {
          g.save();
          roundPoly(g, rot(s.pts, qa), 0.5);
          g.clip();
          crackEmit(g, l, this.C, lv);
          g.restore();
        }
        if (def.decoEmit) { g.save(); g.rotate(qa); def.decoEmit(g, this.C, lv); g.restore(); }
      });
    }
    this.m.set(k, st);
    return st;
  }
  shadow(def: Def, qa: number, d: number): Stamp {
    // Baked at the body's density: small stamps scaled up cost more to draw than they save to paint.
    const k = `s|${def.key}|${qa.toFixed(3)}|${d}`;
    let s = this.m.get(k);
    if (!s) {
      s = this.make(d, this.bounds(def, qa, 5), (g) => {
        softShadow(g, 2.4, css(0x05060c, 1), () => { g.beginPath(); for (const sub of def.subs) roundPoly(g, rot(sub.pts, qa), 1); });
      });
      this.m.set(k, s);
    }
    return s;
  }
}

const STEP = (30 * Math.PI) / 180;
const bucket = (a: number) => Math.round(a / STEP) * STEP;

/** Draw a stamp with its pivot at (x, y), turned by the residual angle res, snapped to the texel grid when unturned. */
function put(c: Ctx, st: Stamp, x: number, y: number, res: number, d: number, k = 1) {
  if (Math.abs(res) < 1e-4 && k === 1) {
    c.drawImage(st.c, Math.round((x + st.x0) * d) / d, Math.round((y + st.y0) * d) / d, st.w, st.h);
    return;
  }
  c.save();
  c.translate(x, y);
  c.rotate(res);
  if (k !== 1) c.scale(k, k);
  c.drawImage(st.c, st.x0, st.y0, st.w, st.h);
  c.restore();
}

// ---- decoration -----------------------------------------------------------------------------------

/** Moss clumps along the top edges of a stone, with a few strands hanging down its sides. */
function moss(c: Ctx, pts: Pts, seed: number, amount = 1) {
  const r = rng(seed * 59 + 11);
  const [cx, cy] = centroid(pts);
  const n = pts.length / 2;
  const clumps: [number, number, number, number][] = [];
  const strands: number[][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[j * 2], by = pts[j * 2 + 1];
    let nx = by - ay, ny = -(bx - ax);
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    if (ny > -0.4) continue; // only the top-facing edges
    const len = Math.hypot(bx - ax, by - ay);
    const k = Math.max(1, Math.round((len / 2.4) * amount));
    for (let s = 0; s < k; s++) {
      const t = (s + 0.5) / k + (r() - 0.5) * 0.2;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      clumps.push([x - nx * 0.9 + (r() - 0.5), y - ny * 0.9 + (r() - 0.5) * 0.6, 1.1 + r() * 1.2, r()]);
      if (r() < 0.25 * amount) {
        const l = 2.5 + r() * 3.5;
        const st = [x, y + 0.6];
        let sx = x, sy = y + 0.6, a = Math.PI / 2 + (r() - 0.5) * 0.5;
        for (let q = 1; q <= 4; q++) { a += (r() - 0.5) * 0.4; sx += Math.cos(a) * l / 4; sy += Math.sin(a) * l / 4; st.push(sx, sy); }
        strands.push(st);
      }
    }
  }
  for (const s of strands) taper(c, s, 1.0, 0.25, css(0x163a2f));
  for (const [x, y, s] of clumps) {
    blobPath(c, x + 0.2, y + 0.6, s * 1.1, s * 0.8, rng(Math.round(x * 31 + y * 7)), 7, 0.25);
    c.fillStyle = css(0x10261f); c.fill();
  }
  for (const [x, y, s] of clumps) {
    blobPath(c, x - 0.2, y, s, s * 0.72, rng(Math.round(x * 13 + y * 29)), 7, 0.25);
    c.fillStyle = lin(c, x - s, y - s, x + s * 0.5, y + s, [[0, css(0x55916f)], [0.5, css(0x2f6a52)], [1, css(0x1b4537)]]);
    c.fill();
  }
  for (const [x, y, s, q] of clumps) {
    for (let i = 0; i < 3; i++) {
      const a = q * 9 + i * 2.1;
      c.beginPath();
      c.ellipse(x - s * 0.3 + Math.cos(a) * s * 0.45, y - s * 0.28 + Math.sin(a) * s * 0.28, 0.36, 0.26, a, 0, TAU);
      c.fillStyle = css(i ? 0x6fae86 : 0x9ad6a6, 0.9);
      c.fill();
    }
  }
  for (const s of strands) taper(c, s, 0.42, 0.12, css(0x3f7a5e, 0.85));
}

type Spike = [number, number, number, number, number]; // base x, y, angle, length, width
/** Spike bases along the top of a shoulder stone. */
function spikesOn(pts: Pts, seed: number, n: number, side: number): Spike[] {
  const r = rng(seed);
  const [cx] = centroid(pts);
  const [x0, y0, x1] = bbox(pts);
  const out: Spike[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + 3 + (x1 - x0 - 6) * t;
    const y = y0 + 2.6 + Math.pow((x - cx) / ((x1 - x0) / 2), 2) * 5;
    const a = -Math.PI / 2 + (t - 0.5) * 1.2 + side * 0.2 + (r() - 0.5) * 0.25;
    out.push([x, y, a, 6 + r() * 4 + (i === Math.floor(n / 2) ? 4 : 0), 2.8 + r() * 1.2]);
  }
  return out;
}
function shardPts(x: number, y: number, a: number, l: number, w: number) {
  const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
  return {
    L: [x + vx * w * 0.5, y + vy * w * 0.5] as V2, T: [x + ux * l, y + uy * l] as V2, R: [x - vx * w * 0.5, y - vy * w * 0.5] as V2,
    M: [x + ux * l * 0.38 + vx * w * 0.06, y + uy * l * 0.38 + vy * w * 0.06] as V2,
  };
}
/** Elite crystal spikes: faceted magenta shards with an inked base. */
function crystalBody(c: Ctx, spikes: Spike[], C: Hue) {
  for (const [x, y, a, l, w] of spikes) {
    const s = shardPts(x, y, a, l, w);
    c.beginPath(); c.moveTo(s.L[0], s.L[1]); c.lineTo(s.T[0], s.T[1]); c.lineTo(s.R[0], s.R[1]); c.closePath();
    c.lineWidth = 0.8; c.strokeStyle = css(0x12061a); c.stroke();
    c.fillStyle = css(mix(C.deep, 0x2a0a26, 0.3)); c.fill();
    c.beginPath(); c.moveTo(s.L[0], s.L[1]); c.lineTo(s.T[0], s.T[1]); c.lineTo(s.M[0], s.M[1]); c.closePath();
    c.fillStyle = lin(c, s.L[0], s.L[1], s.T[0], s.T[1], [[0, css(C.mid)], [1, css(C.white)]]); c.fill();
    c.beginPath(); c.moveTo(s.M[0], s.M[1]); c.lineTo(s.T[0], s.T[1]); c.lineTo(s.R[0], s.R[1]); c.closePath();
    c.fillStyle = lin(c, s.R[0], s.R[1], s.T[0], s.T[1], [[0, css(C.deep)], [1, css(C.light)]]); c.fill();
    polyline(c, [s.M[0], s.M[1], s.T[0], s.T[1]], 0.28, css(C.white, 0.9));
    // Socket where the shard breaks out of the stone.
    c.beginPath(); c.ellipse(x, y + 0.3, w * 0.62, w * 0.3, a + Math.PI / 2, 0, TAU);
    c.fillStyle = css(0x12061a, 0.8); c.fill();
  }
}
function crystalEmit(E: Ctx, spikes: Spike[], C: Hue, lv: number) {
  for (const [x, y, a, l, w] of spikes) {
    const s = shardPts(x, y, a, l, w);
    glow(E, (x + s.T[0]) / 2, (y + s.T[1]) / 2, l * 0.8 + lv, C.mid, 0.5 + lv * 0.12);
    E.beginPath(); E.moveTo(s.L[0], s.L[1]); E.lineTo(s.T[0], s.T[1]); E.lineTo(s.R[0], s.R[1]); E.closePath();
    E.fillStyle = css(C.light, 0.75); E.fill();
    polyline(E, [s.M[0], s.M[1], s.T[0], s.T[1]], 0.5, css(C.white));
  }
}

// ---- the colossus's stones ------------------------------------------------------------------------

const UPPER = 20, FORE = 21, THIGH = 11, SHIN = 11.5;

interface Rig { defs: Record<string, Def>; core: V2 }

/** Every stone of the golem, in local coordinates around its pivot. */
function makeDefs(elite: boolean): Rig {
  const sd = elite ? 500 : 0; // the elite's stones fall a little differently
  const defs: Record<string, Def> = {};
  const limb = (key: string, L: number, w0: number, w1: number, seed: number, tone: number, cracks: number, over = 2, band = 0) => {
    const subs: Sub[] = [{ pts: segment(L, w0, w1, seed + sd, over), seed: seed + sd, tone, cracks }];
    // A band of stone round the far end (a wrist or ankle cuff), slightly proud of the main stone.
    if (band) subs.push({ pts: segment(L * 0.32, w1 * 1.02, w1 * 1.06, seed + sd + 3, 1).map((v, i) => (i % 2 ? v : v + L * 0.68)), seed: seed + sd + 3, tone: tone + 0.04, bev: 1.6, chips: 1 });
    defs[key] = { key, subs, ao: 0.5 };
  };
  const knob = (key: string, rx: number, ry: number, seed: number, tone: number) => {
    defs[key] = { key, subs: [{ pts: boulder(0, 0, rx, ry, seed + sd, { n: 7 }), seed: seed + sd, tone, chips: 1 }], ao: 0.45 };
  };
  // Fists: knuckles toward +x (away from the wrist), the thumb on the body side.
  const fist = (key: string, s: number, seed: number, tone: number, thumbSide: number) => {
    const subs: Sub[] = [{ pts: boulder(0, 0, 9.5 * s, 10 * s, seed + sd, { sq: 0.62, n: 8 }), seed: seed + sd, tone, cracks: 1, bev: 3 }];
    subs.push({ pts: boulder(1.5 * s, thumbSide * 8.6 * s, 4 * s, 3.2 * s, seed + sd + 9, { n: 6, sq: 0.7, tilt: 0.3 * thumbSide }), seed: seed + sd + 9, tone: tone - 0.04, chips: 1, bev: 1.1 });
    for (let i = 0; i < 4; i++) {
      const v = (i - 1.5) * 4.3 * s;
      subs.push({ pts: boulder(7.6 * s - Math.abs(i - 1.5) * 0.8, v, 3.3 * s, 2.6 * s, seed + sd + i + 1, { n: 6, sq: 0.68 }), seed: seed + sd + i + 1, tone: tone + 0.03, chips: 0, bev: 1, pits: 0 });
    }
    defs[key] = { key, subs, ao: 0.5 };
  };
  const foot = (key: string, seed: number, tone: number) => {
    const subs: Sub[] = [{ pts: [-9, -5, 4, -6, 9.5, -2, 9.5, 3.8, -8.5, 4.3, -10.5, -0.5], seed: seed + sd, tone, bev: 2, chips: 2 }];
    for (let i = 0; i < 3; i++) {
      subs.push({ pts: boulder(7.5 + i * 3, 1.8 + i * 0.4, 2.6, 2.7, seed + sd + 5 + i, { n: 6, sq: 0.75 }), seed: seed + sd + 5 + i, tone: tone + 0.05, chips: 0, bev: 0.9, pits: 0 });
    }
    defs[key] = { key, subs, ao: 0.4 };
  };

  limb('farUpper', UPPER, 12, 11, 10, -0.13, 1);
  knob('farElbow', 5.6, 5.2, 11, -0.18);
  limb('farFore', FORE, 12, 15.5, 12, -0.11, 1, 1.5, 1);
  fist('farFist', 1.0, 13, -0.12, -1);
  limb('nearUpper', UPPER, 13.5, 12.5, 20, 0.03, 1);
  knob('nearElbow', 6, 5.6, 21, -0.02);
  limb('nearFore', FORE, 13.5, 17, 22, 0.05, 1, 1.5, 1);
  fist('nearFist', 1.12, 23, 0.04, 1);
  for (const [side, tone, s0] of [['far', -0.12, 40], ['near', 0, 50]] as const) {
    limb(`${side}Thigh`, THIGH, 17.5, 15, s0, tone, side === 'near' ? 1 : 0);
    limb(`${side}Shin`, SHIN, 14.5, 16, s0 + 1, tone + 0.02, 0, 1.5);
    knob(`${side}Knee`, 5.2, 4.4, s0 + 2, tone + 0.05);
    foot(`${side}Foot`, s0 + 3, tone + 0.02);
  }
  defs.pelvis = { key: 'pelvis', subs: [{ pts: boulder(0, 0, 15, 7.5, 60 + sd, { n: 8, sq: 0.55 }), seed: 60 + sd, tone: -0.06 }], ao: 0.5 };
  defs.belly = {
    key: 'belly', ao: 0.55,
    subs: [
      { pts: boulder(1, 6, 13.5, 7.5, 61 + sd, { n: 8, sq: 0.6 }), seed: 61 + sd, tone: -0.03, cracks: 1 },
      { pts: boulder(-6, -1, 9, 7, 62 + sd, { n: 7, sq: 0.6 }), seed: 62 + sd, tone: -0.05 },
    ],
  };
  // Chest: broad and slab-like, the core socket left of its middle with cracks radiating from it.
  const chest: Pts = [-23, 1, -8, -3.5, 12, -3.5, 25, 1.5, 25.5, 13, 17, 25, 2, 28.5, -13, 25.5, -22.5, 14];
  const core: V2 = [-1, 13];
  defs.chest = {
    key: 'chest', ao: 0.55,
    subs: [{ pts: chest, seed: 70 + sd, tone: 0.02, bev: 4.2, lines: [...crackLines(chest, 70 + sd, 4, core, 1.1), ...crackLines(chest, 71 + sd, 1)] }],
    deco: (c, C, lv) => coreBody(c, core[0], core[1], C, lv),
    decoEmit: (E, C, lv) => coreEmit(E, core[0], core[1], C, lv),
    pad: 8,
  };
  // Shoulders: high domed boulders that make the hunch, moss on top, crystals for the elite.
  const farP = boulder(0, 0, 13, 10.5, 80 + sd, { n: 9, sq: 0.72 });
  const nearP = boulder(0, 0, 14.5, 12, 83 + sd, { n: 9, sq: 0.72 });
  const farS = spikesOn(farP, 82, 3, -1), nearS = spikesOn(nearP, 85, 4, 1);
  defs.farPauldron = {
    key: 'farPauldron', ao: 0.6, pad: elite ? 14 : 4,
    subs: [{ pts: farP, seed: 80 + sd, tone: -0.05, cracks: 1, bev: 3.6 }],
    deco: (c, C) => { moss(c, farP, 81, 1); if (elite) crystalBody(c, farS, C); },
    decoEmit: elite ? (E, C, lv) => crystalEmit(E, farS, C, lv) : undefined,
  };
  defs.nearPauldron = {
    key: 'nearPauldron', ao: 0.65, pad: elite ? 15 : 4,
    subs: [{ pts: nearP, seed: 83 + sd, tone: 0.06, cracks: 2, bev: 4 }],
    deco: (c, C) => { moss(c, nearP, 84, 1.1); if (elite) crystalBody(c, nearS, C); },
    decoEmit: elite ? (E, C, lv) => crystalEmit(E, nearS, C, lv) : undefined,
  };
  defs.head = headDef(90 + sd);
  return { defs, core };
}

/** The core: a socket ring of dark stone in the chest with a molten heart. */
function coreBody(c: Ctx, x: number, y: number, C: Hue, lv: number) {
  const R = 4.4;
  c.beginPath(); c.arc(x + 0.4, y + 0.6, R + 2.3, 0, TAU);
  c.fillStyle = css(0x05060c, 0.45); c.fill();
  c.beginPath(); c.arc(x, y, R + 1.9, 0, TAU);
  c.fillStyle = css(INK); c.fill();
  c.beginPath(); c.arc(x, y, R + 1.4, 0, TAU);
  c.fillStyle = lin(c, x - R, y - R, x + R, y + R, [[0, css(ramp(0.78))], [0.5, css(ramp(0.42))], [1, css(ramp(0.14))]]);
  c.fill();
  c.beginPath(); c.arc(x, y, R, 0, TAU);
  c.fillStyle = css(0x120806); c.fill();
  const r0 = R - 0.6;
  c.beginPath(); c.arc(x, y, r0, 0, TAU);
  c.fillStyle = rad(c, x - 0.5, y - 0.5, 0, r0, [[0, css(C.white)], [0.22, css(lv ? C.white : C.light)], [0.6, css(C.mid)], [1, css(C.deep)]]);
  c.fill();
  // Molten veins swirling in the heart, and a hot specular.
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.4;
    c.beginPath(); c.arc(x, y, r0 * (0.55 + i * 0.12), a, a + 1.4);
    c.lineWidth = 0.35; c.strokeStyle = css(C.deep, 0.6); c.stroke();
  }
  c.beginPath(); c.ellipse(x - 1.2, y - 1.3, 1.1, 0.65, -0.6, 0, TAU);
  c.fillStyle = css(0xffffff, 0.85); c.fill();
}
function coreEmit(E: Ctx, x: number, y: number, C: Hue, lv: number) {
  glow(E, x, y, 11 + lv * 3.5, C.mid, 0.55 + lv * 0.12, 0.12);
  glow(E, x, y, 5 + lv, C.mid, 0.7, 0.3);
  E.beginPath(); E.arc(x, y, 3.2, 0, TAU);
  E.fillStyle = rad(E, x, y, 0, 3.2, [[0, css(C.white)], [0.5, css(C.light)], [1, css(C.mid, 0.6)]]); E.fill();
}

/** The head: a domed cranium, a chunky jaw, a shadowed face recess with two slit eyes, and a heavy scowling brow. */
function headDef(seed: number): Def {
  const cran = boulder(0, -2.5, 9.6, 8.6, seed, { n: 9, sq: 0.7, tilt: 0.06 });
  const jaw: Pts = [-5.5, 4.2, 9.5, 3.8, 11, 7.4, 8, 10.6, -2.5, 11, -6.5, 8];
  const brow: Pts = [-8.6, -1.6, 0, -1.5, 3.8, -0.4, 7.5, -2.4, 12.8, -3, 13.3, 0.2, 8, 1.2, 3.8, 2.4, -0.5, 1, -8, 1.4];
  const eyes: [number, number, number, number, number][] = [
    [7.4, 2.5, 2.3, 0.72, -0.26], // near eye, larger
    [1, 2.6, 1.7, 0.6, 0.28],
  ];
  const mouth = [-1.2, 7.6, 1.6, 8.3, 3.6, 7.7, 6, 8.4, 8.8, 7.8];
  return {
    key: 'head', ao: 0.6,
    subs: [
      { pts: cran, seed, tone: 0.05, cracks: 1, bev: 3.2 },
      { pts: jaw, seed: seed + 1, tone: -0.06, bev: 2, chips: 2 },
    ],
    pad: 2,
    deco(c, C, lv) {
      // Face recess between brow and jaw, with the eyes in it.
      roundPoly(c, [-6, 0.4, 12, -0.4, 11.6, 5, 4, 5.4, -5.4, 5], 1.6);
      c.fillStyle = lin(c, 0, 0, 0, 5.4, [[0, css(0x050509)], [1, css(0x16161e)]]); c.fill();
      for (const [x, y, w, h, a] of eyes) {
        c.beginPath(); c.ellipse(x, y, w + 0.5, h + 0.45, a, 0, TAU);
        c.fillStyle = css(C.deep, 0.8); c.fill();
        c.beginPath(); c.ellipse(x, y, w, h, a, 0, TAU);
        c.fillStyle = css(C.light); c.fill();
        c.beginPath(); c.ellipse(x + 0.2, y, w * 0.55, h * 0.45, a, 0, TAU);
        c.fillStyle = css(C.white); c.fill();
      }
      // A jagged mouth seam in the jaw.
      polyline(c, mouth, 0.75, css(0x0a0606));
      polyline(c, mouth, 0.22, css(lv ? C.mid : C.deep, 0.85));
      // The brow ledge over everything, casting its shadow on the eyes.
      roundPoly(c, brow.map((v, i) => v + (i % 2 ? 1.3 : 0.3)), 1);
      c.fillStyle = css(0x05060c, 0.6); c.fill();
      paintStone(c, { pts: brow, seed: seed + 2, tone: 0.16, bev: 1.3, chips: 1, pits: 1, r: 0.8 }, 0, C, lv);
    },
    decoEmit(E, C, lv) {
      for (const [x, y, w, h, a] of eyes) {
        glow(E, x, y, 4.2 + lv * 1.2, C.mid, 0.9, 0.25);
        E.beginPath(); E.ellipse(x, y, w, h, a, 0, TAU);
        E.fillStyle = css(C.white); E.fill();
      }
      polyline(E, mouth, 0.6, css(C.mid, 0.3 + lv * 0.2));
    },
  };
}

// ---- posing ---------------------------------------------------------------------------------------

interface Pose {
  /** Walk phase: +1 near foot forward, -1 far foot forward, 0 passing. */
  step: number;
  /** Which foot is lifted while passing (-1 far, +1 near, 0 none). */
  lift: number;
  bob: number;
  breathe: number;
  raise: number;
  slam: number;
  glow: number;
  elite: boolean;
}

/** A stone placed at its pivot, turned by a and scaled by k (raised arms lean back, away from the camera). */
interface Placed { def: Def; x: number; y: number; a: number; k: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp2 = (a: V2, b: V2, t: number): V2 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const ang = (a: V2, b: V2) => Math.atan2(b[1] - a[1], b[0] - a[0]);

function pose(o: Pose, rig: Rig) {
  const D = rig.defs;
  const list: Placed[] = [];
  const at = (key: string, p: V2, a = 0, k = 1) => list.push({ def: D[key], x: p[0], y: p[1], a, k });
  const ak = 1 - 0.2 * Math.min(1, o.raise / 0.7); // arm foreshortening
  const cx = 44 + o.slam * 4 - o.raise * 1.5;
  const T = 25 + o.bob + o.slam * 9 - o.raise * 1.5 - o.breathe * 0.6; // top of the chest
  const hipY = 63 + o.bob * 0.6 + o.slam * 2;

  // Arms: shoulder fixed on the torso, fist placed by the pose, elbow solved, bowing outward.
  const arm = (sg: number) => {
    const near = sg > 0;
    const swing = -o.step * sg * 3;
    const S: V2 = [cx + sg * (24 - 4 * o.raise) + (near ? 3 : 0), T + 8 - o.raise * 3];
    let F: V2 = [cx + sg * 29 + (near ? 2 : 0) + swing, T + 49 - Math.abs(swing) * 0.3 - o.breathe * 0.4];
    // Windup: the fists swing up wide of the shoulders, then come together over the head.
    const apart: V2 = [cx + sg * 21 + 3, 14.5], clasp: V2 = [cx + sg * 4.5 + 4, 11.5];
    F = o.raise <= 0.7 ? lerp2(F, apart, o.raise / 0.7) : lerp2(apart, clasp, (o.raise - 0.7) / 0.3);
    F = lerp2(F, near ? [cx + 31, FY - 10] : [cx - 23, FY - 10], o.slam);
    const E = ik(S, F, UPPER * ak, FORE * ak, (p) => sg * (p[0] - cx) + (o.raise ? 0 : -p[1] * 0.05));
    return { S, E, F };
  };
  const far = arm(-1), near = arm(1);
  const armParts = (A: { S: V2; E: V2; F: V2 }, side: 'far' | 'near', fist: boolean) => {
    at(`${side}Upper`, A.S, ang(A.S, A.E), ak);
    at(`${side}Elbow`, A.E, 0, ak);
    at(`${side}Fore`, A.E, ang(A.E, A.F), ak);
    if (fist) at(`${side}Fist`, A.F, ang(A.E, A.F), ak);
  };
  // Legs: hip fixed, foot placed by the stride, knee solved forward.
  const bones: number[][] = []; // leg chains (hip, knee, ankle), for the backing that fills the joints
  const leg = (sg: number) => {
    const isNear = sg > 0;
    const side = isNear ? 'near' : 'far';
    const stride = (isNear ? o.step : -o.step) * 5;
    const lift = o.lift === sg ? 4 : 0;
    const Hp: V2 = [cx + (isNear ? 8 : -9) - o.slam * 3, hipY];
    const Fx = Hp[0] + (isNear ? 3 : -3) + stride + o.slam * (isNear ? 4 : -2);
    const A: V2 = [Fx, FY - 6 - lift];
    const K = ik(Hp, A, THIGH, SHIN, (p) => p[0]);
    at(`${side}Thigh`, Hp, ang(Hp, K));
    at(`${side}Shin`, K, ang(K, A));
    at(`${side}Knee`, [K[0] + 1.5, K[1] + 0.5]);
    at(`${side}Foot`, [A[0], A[1] + 1.5]);
    bones.push([...Hp, ...K, ...A]);
  };

  armParts(far, 'far', o.raise < 0.5);
  leg(-1);
  leg(1);
  at('pelvis', [cx, hipY - 3]);
  const ragAt = list.length;
  at('belly', [cx, T + 25]);
  at('chest', [cx, T], o.slam * 0.06 - o.raise * 0.04);
  const pa = o.raise * 3;
  at('farPauldron', [cx - 23 + o.raise * 3, T + 1 - pa], -0.12 - o.raise * 0.25);
  at('nearUpper', near.S, ang(near.S, near.E), ak);
  at('nearPauldron', [cx + 27 - o.raise * 3, T - pa], 0.1 + o.raise * 0.25);
  at('head', [cx + 6 + o.slam * 2, T + 1 + o.slam * 3 + o.raise * 2], o.slam * 0.12);
  at('nearElbow', near.E, 0, ak);
  at('nearFore', near.E, ang(near.E, near.F), ak);
  if (o.raise >= 0.5) at('farFist', far.F, ang(far.E, far.F), ak);
  at('nearFist', near.F, ang(near.E, near.F), ak);
  const core: V2 = [cx + rig.core[0], T + rig.core[1]];
  // Body bounds: each stone's outline turned to its angle, plus room for moss, crystals and the ink.
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const p of list) {
    const m = 2 + (p.def.pad ?? 0);
    for (const s of p.def.subs) {
      const [a, b, c, d] = bbox(rot(s.pts, p.a).map((v) => v * p.k));
      x0 = Math.min(x0, p.x + a - m); y0 = Math.min(y0, p.y + b - m); x1 = Math.max(x1, p.x + c + m); y1 = Math.max(y1, p.y + d + m);
    }
  }
  const box = [Math.max(0, x0), Math.max(0, y0), Math.min(W, x1), Math.min(H, y1)];
  // Joints and torso core, filled dark behind every stone so no seam between stones shows daylight.
  for (const A of [far, near]) bones.push([cx, T + 12, ...A.S, ...A.E, ...A.F]);
  const torso: Pts = [cx - 15, T + 7, cx + 15, T + 7, cx + 11, hipY + 1, cx - 11, hipY + 1];
  return { list, rag: [cx, hipY - 6] as V2, ragAt, core, far, near, box, bones, torso };
}

/** Dark stone behind the joints and torso: the gaps between placed stones read as deep seams, not holes. */
function backing(f: Ctx, bones: number[][], torso: Pts) {
  const col = css(STONE[0]);
  f.save();
  f.lineCap = 'round'; f.lineJoin = 'round';
  bones.forEach((b, i) => polyline(f, b, i < 2 ? 8 : 6, col));
  f.beginPath();
  for (let i = 0; i < torso.length; i += 2) f.lineTo(torso[i], torso[i + 1]);
  f.closePath();
  f.fillStyle = col; f.fill();
  f.restore();
}

/** A tattered rag bound round the waist, with a flap hanging at the front (painted per frame: it sways). */
function rag(f: Ctx, cx: number, y: number, o: Pose) {
  const sway = o.step * 1.2 + o.slam * 2;
  const band: Pts = [cx - 15, y - 1, cx - 2, y - 2.5, cx + 15, y - 1.5, cx + 16, y + 3, cx + 2, y + 4.5, cx - 15, y + 3.5];
  const flap: Pts = [cx + 1, y + 2, cx + 9, y + 2, cx + 10 + sway, y + 11, cx + 8 + sway, y + 9.5, cx + 7 + sway, y + 12.5, cx + 5 + sway, y + 10.5, cx + 3.5 + sway, y + 13, cx + 2 + sway, y + 9.5];
  const cloth = (pts: Pts, x0: number, y0: number, x1: number, y1: number) => {
    roundPoly(f, pts, 0.6);
    f.fillStyle = lin(f, x0, y0, x1, y1, [[0, css(0x7a6252)], [0.5, css(0x54443b)], [1, css(0x2e2522)]]);
    f.fill();
    f.lineWidth = 0.5; f.strokeStyle = css(INK, 0.9); f.stroke();
  };
  f.save();
  f.globalCompositeOperation = 'source-atop';
  f.translate(0.5, 1.6);
  roundPoly(f, band, 1);
  f.fillStyle = css(0x05060c, 0.4); f.fill();
  f.restore();
  cloth(band, cx - 15, y - 2, cx + 10, y + 5);
  for (let i = 0; i < 5; i++) {
    const x = cx - 12 + i * 6;
    polyline(f, [x, y - 1.5, x + 1.5, y + 1, x + 2.5, y + 3.5], 0.45, css(0x1e1817, 0.8));
    polyline(f, [x + 0.7, y - 1.5, x + 2.1, y + 0.8], 0.3, css(0x9a8270, 0.6));
  }
  cloth(flap, cx + 1, y + 2, cx + 10, y + 12);
  polyline(f, [cx + 5, y + 3, cx + 5.5 + sway * 0.6, y + 10], 0.35, css(0x1e1817, 0.8));
  f.beginPath(); f.ellipse(cx + 5, y + 1.6, 2, 1.5, 0.3, 0, TAU);
  f.fillStyle = lin(f, cx + 3, y, cx + 7, y + 3, [[0, css(0x8a7060)], [1, css(0x3a2e29)]]);
  f.fill(); f.lineWidth = 0.45; f.strokeStyle = css(INK); f.stroke();
}

function colossusFrame(o: Pose, rig: Rig, stamps: Stamps): Painter {
  const C = o.elite ? MAGENTA : AMBER;
  const lv = o.glow;
  return (g, e) => {
    const P = pose(o, rig);
    if (live(g)) {
      const d = scaleOf(g);
      // The figure's offscreen layers only need to cover the body, not the whole frame.
      const [bx0, by0, bx1, by1] = P.box;
      const ox = Math.floor(bx0 * d) / d, oy = Math.floor(by0 * d) / d;
      if (o.slam) slamUnder(g, P, C);
      g.save();
      g.translate(ox, oy);
      figure(g, bx1 - ox, by1 - oy, (f) => {
        // figure() draws its rim and shade bands through this same context: leave its transform as found.
        f.save();
        f.translate(-ox, -oy);
        backing(f, P.bones, P.torso);
        P.list.forEach((p, i) => {
          if (i === P.ragAt) rag(f, P.rag[0], P.rag[1], o);
          const qa = bucket(p.a);
          if (p.def.ao) {
            f.save();
            f.globalCompositeOperation = 'source-atop';
            f.globalAlpha = p.def.ao;
            put(f, stamps.shadow(p.def, qa, d), p.x + 0.9, p.y + 1.6, p.a - qa, d, p.k);
            f.restore();
          }
          put(f, stamps.body(p.def, qa, d), p.x, p.y, p.a - qa, d, p.k);
        });
        // Whole-body light: the core warms the stone around it; the legs darken toward the ground.
        f.save();
        f.globalCompositeOperation = 'source-atop';
        f.fillStyle = rad(f, P.core[0], P.core[1], 0, 26 + lv * 5, [[0, css(C.mid, 0.26 + lv * 0.08)], [0.45, css(C.deep, 0.12 + lv * 0.04)], [1, css(C.deep, 0)]]);
        f.fillRect(0, 0, W, H);
        f.fillStyle = lin(f, 0, FY - 30, 0, FY + 1, [[0, 'rgba(6,7,14,0)'], [1, 'rgba(6,7,14,0.4)']]);
        f.fillRect(0, FY - 30, W, 31);
        f.restore();
        f.restore();
      }, { ink: 0x07080f, inkW: 0.65, rim: 0xb8c6ee, rimW: 0.85, rimA: 0.6, shadeW: 1.4, shadeA: 0.28 });
      g.restore();
      if (o.slam) slamOver(g, P);
    }
    if (live(e)) {
      const de = scaleOf(e);
      const E = layer(W, H, de);
      if (o.slam) slamEmitUnder(E.g, P, C);
      for (const p of P.list) {
        const qa = bucket(p.a);
        // Erase the glow of whatever this stone covers.
        E.g.save();
        E.g.globalCompositeOperation = 'destination-out';
        E.g.translate(p.x, p.y);
        E.g.rotate(p.a);
        E.g.scale(p.k, p.k);
        E.g.beginPath();
        for (const s of p.def.subs) roundPoly(E.g, s.pts, 1);
        E.g.fillStyle = '#000';
        E.g.fill();
        E.g.restore();
        const st = stamps.emit(p.def, qa, de);
        if (st) {
          // Hotter windups: the same glow laid on more strongly.
          E.g.globalCompositeOperation = 'lighter';
          E.g.globalAlpha = lv ? 1 : 0.72;
          put(E.g, st, p.x, p.y, p.a - qa, de, p.k);
          if (lv > 1) { E.g.globalAlpha = 0.5; put(E.g, st, p.x, p.y, p.a - qa, de, p.k); }
          E.g.globalAlpha = 1;
          E.g.globalCompositeOperation = 'source-over';
        }
      }
      if (o.slam) slamEmitOver(E.g, P, C);
      e.drawImage(E.c, 0, 0, W, H);
    }
  };
}

/** Slam impact points: just ahead of each fist's knuckles, on the floor. */
const impacts = (P: ReturnType<typeof pose>): V2[] => [P.far, P.near].map((A) => [A.F[0] + (A === P.near ? 2 : -2), FY - 1.5]);

/** Glowing fissures splitting the floor round each fist (radiating, flattened by the view). */
function fissures(seed: number, at: V2): number[][] {
  const r = rng(seed);
  const out: number[][] = [];
  for (let i = 0; i < 5; i++) {
    // Mostly sideways along the floor (the bottom of the frame is the floor line).
    let a = (i % 2 ? 0 : Math.PI) + (r() - 0.5) * 1.2 - 0.25, x = at[0] + Math.cos(a) * 4, y = at[1] + Math.sin(a) * 1;
    const l = [x, y];
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      a += (r() - 0.5) * 1.1;
      x += Math.cos(a) * (2.5 + r() * 1.5); y = Math.min(FY + 2, y + Math.sin(a) * 1.1);
      l.push(x, y);
      if (k === 1 && r() < 0.5) out.push([x, y, x + Math.cos(a + 0.9) * 2.5, Math.min(FY + 2, y + Math.sin(a + 0.9) * 1.2)]);
    }
    out.push(l);
  }
  return out;
}

/** Slam, under the body: the cracked floor. */
function slamUnder(g: Ctx, P: ReturnType<typeof pose>, C: Hue) {
  impacts(P).forEach((at, j) => {
    // A scorched dent under the fist, then the fissures.
    g.fillStyle = rad(g, at[0], at[1], 0, 9, [[0, 'rgba(8,6,8,0.55)'], [1, 'rgba(8,6,8,0)']]);
    g.save(); g.translate(at[0], at[1]); g.scale(1, 0.35); g.fillRect(-9, -9, 18, 18); g.restore();
    for (const l of fissures(40 + j, at)) {
      taper(g, l, 1.5, 0.35, css(0x0a0606, 0.95));
      taper(g, l, 0.6, 0.12, css(C.light));
    }
  });
}
/** Slam, over the body: dust bursting out from under the fists and stone chips thrown up. */
function slamOver(g: Ctx, P: ReturnType<typeof pose>) {
  const r = rng(99);
  for (const [x, y] of impacts(P)) {
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i / 4) * Math.PI, d = 8 + r() * 5;
      const px = x + Math.cos(a) * d * 1.1, py = y - 1 + Math.sin(a) * d * 0.3;
      g.fillStyle = rad(g, px, py, 0, 3.5 + r() * 2.5, [[0, 'rgba(120,128,150,0.32)'], [1, 'rgba(120,128,150,0)']]);
      g.fillRect(px - 7, py - 7, 14, 14);
    }
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * (0.12 + r() * 0.76), d = 11 + r() * 8;
      const px = x + Math.cos(a) * d, py = y - 6 + Math.sin(a) * d * 0.75;
      const s = 0.7 + r() * 1.0;
      const pts = boulder(px, py, s, s * 0.8, 300 + i, { n: 5, j: 0.25 });
      roundPoly(g, pts, 0.2);
      g.lineWidth = 0.6; g.strokeStyle = css(INK); g.stroke();
      g.fillStyle = css(ramp(0.3)); g.fill();
      roundPoly(g, pts.map((v, k) => v - (k % 2 ? 0.3 : 0.25)), 0.2);
      g.fillStyle = css(ramp(0.62)); g.fill();
    }
  }
}
function slamEmitUnder(E: Ctx, P: ReturnType<typeof pose>, C: Hue) {
  impacts(P).forEach((at, j) => {
    glow(E, at[0], at[1], 16, C.mid, 0.55, 0.1);
    for (const l of fissures(40 + j, at)) {
      taper(E, l, 3, 0.9, css(C.mid, 0.4));
      taper(E, l, 0.9, 0.18, css(C.white));
    }
  });
}
function slamEmitOver(E: Ctx, P: ReturnType<typeof pose>, C: Hue) {
  const r = rng(77);
  for (const [x, y] of impacts(P)) {
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * (0.08 + r() * 0.84), d0 = 7 + r() * 4, d1 = d0 + 3 + r() * 5;
      taper(E, [x + Math.cos(a) * d1, y - 4 + Math.sin(a) * d1 * 0.8, x + Math.cos(a) * d0, y - 4 + Math.sin(a) * d0 * 0.8], 0.7, 0.15, css(i % 3 ? C.light : C.white));
    }
  }
}

export function colossusSprites(elite = false): SpriteSet {
  const rig = makeDefs(elite);
  const stamps = new Stamps(elite ? MAGENTA : AMBER);
  const b: Pose = { step: 0, lift: 0, bob: 0, breathe: 0, raise: 0, slam: 0, glow: 0, elite };
  const F = (p: Partial<Pose>) => colossusFrame({ ...b, ...p }, rig, stamps);
  return {
    w: W, h: H, footY: FY,
    anims: {
      idle: [F({}), F({ breathe: 1, bob: 0.4 })],
      run: [F({ step: 1, bob: 1 }), F({ step: 0, lift: -1 }), F({ step: -1, bob: 1 }), F({ step: 0, lift: 1 })],
      windup: [F({ raise: 0.7, glow: 1 }), F({ raise: 1, glow: 2 })],
      slam: [F({ slam: 1, glow: 2 })],
    },
  };
}
