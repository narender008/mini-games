// The lantern keeper, painted in code for three facings (down, up, side; left is the side mirrored) and
// every animation frame. Each frame is a painter (src/art/sprite.ts) plus where the lantern glass is, so
// the view can put the light source exactly on it.
//
// Look: a slim cloaked wanderer about four and a half heads tall. A deep hood in charcoal navy hides the
// face except two small ember eyes; a ragged shoulder mantle and a long cape with a wine lining and a worn
// bronze trim fall from the shoulders, drape over the arms in front, and stream back when running or
// dashing. Under it: a leather jerkin with a laced collar and a bandolier, belt and buckle, hip tassets
// and a cloth tabard, dark breeches and tall boots on legs posed by two-bone IK. A brass lantern hangs
// from the gloved hand on a short chain.
//
// The body is one figure() (ink outline, moonlight rim on the upper left, shade on the lower right),
// painted inside a box fitted to the pose because figure() costs grow with its area. A warm pass on top
// washes the cloth near the lantern and rims the edges that face it. The lantern is painted outside the
// figure with its own ink edge (before the body when it swings behind), and its glass, flame and the
// eyes are painted again into the emissive layer. The atlas paints the body and the emissive pass
// separately (handing the unused layer a 4x4 scratch), so each pass paints only its own layer.
import { bez, css, figure, glow, grain, layer, lin, mix, rad, scaleOf, shade, taper, TAU, type Ctx } from './paint';
import type { Painter } from './sprite';

export const KEEPER_W = 36;
export const KEEPER_H = 42;
export const KEEPER_FOOT_Y = 39; // feet baseline inside a frame
const CX = 18; // body centre line
const FY = KEEPER_FOOT_Y;
const TOP = 0.95; // the hood's frame when standing (its painted peak sits about 1.3 lower, see HS)
export type Dir = 'down' | 'up' | 'side';
export type KeeperAnim = 'idle' | 'run' | 'atk0' | 'atk1' | 'dash' | 'cast' | 'dead';
export const KEEPER_ANIMS: Record<KeeperAnim, number> = { idle: 4, run: 6, atk0: 1, atk1: 1, dash: 1, cast: 2, dead: 4 };

export interface KeeperFrame { paint: Painter; lx: number; ly: number } // lantern centre relative to the feet point

// ---- palette --------------------------------------------------------------------------------------

interface Tone { d: number; m: number; l: number; h: number }
const CLOAK: Tone = { d: 0x10141f, m: 0x212940, l: 0x36415f, h: 0x5b6a94 };
const HOOD: Tone = { d: 0x0f121d, m: 0x1e2438, l: 0x323b5a, h: 0x5a6894 };
const LINING: Tone = { d: 0x1a0b11, m: 0x34141e, l: 0x52202c, h: 0x7a3842 };
const JERKIN: Tone = { d: 0x15110e, m: 0x2a221b, l: 0x413428, h: 0x65513c };
const LEATHER: Tone = { d: 0x21150d, m: 0x45301c, l: 0x6a492b, h: 0x946f48 };
const STRAP: Tone = { d: 0x180f09, m: 0x382415, l: 0x5a3d25, h: 0x84603c };
const CLOTH: Tone = { d: 0x221b15, m: 0x433528, l: 0x625039, h: 0x86704e };
const SLEEVE: Tone = { d: 0x121219, m: 0x23232f, l: 0x363645, h: 0x56566c };
const BREECH: Tone = { d: 0x101016, m: 0x1f1e27, l: 0x32303d, h: 0x504c5f };
const BOOT: Tone = { d: 0x100b08, m: 0x261a12, l: 0x433022, h: 0x6e5038 };
const far = (t: Tone, k: number): Tone => ({ d: shade(t.d, -k * 0.5), m: shade(t.m, -k), l: shade(t.l, -k), h: shade(t.h, -k * 1.1) });

const K = {
  ink: 0x05060b, rim: 0xa4b8ea,
  brass: 0xc99a4a, brassD: 0x6a4b24, brassH: 0xffe9b0, brassM: 0x9c7436,
  trim: 0xa07a40, trimL: 0xd9b26a,
  face: 0x020306, faceRim: 0x121726, eye: 0xffc56a, eyeHot: 0xfff4d0,
  glass: 0xffcf6e, core: 0xfff8e4, amber: 0xffb347, amberD: 0xd9771f,
  sole: 0x0a0705, shirt: 0x141218,
};

/** The hood is painted scaled about its base so the head reads at about one to three and a half of the body. */
const HS = 0.88, HB = 10.5;
function inHood(g: Ctx, hx: number, by: number, draw: () => void) {
  g.save();
  g.translate(hx, by + HB); g.scale(HS, HS); g.translate(-hx, -(by + HB));
  draw();
  g.restore();
}
/** A point painted inside the hood (x, y in unscaled hood space) to where it lands in the frame. */
const hoodPt = (hx: number, by: number, x: number, y: number): [number, number] => [hx + (x - hx) * HS, by + HB + (y - by - HB) * HS];

// ---- geometry -------------------------------------------------------------------------------------

type V = [number, number];
type Pts = number[];
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const frac = (v: number) => v - Math.floor(v);
const hash = (k: number) => frac(Math.sin(k * 12.9898 + 4.1414) * 43758.5453);
/** The atlas paints the body and the emissive layer in separate passes, handing the unused one a 4x4 scratch. */
const live = (c: Ctx) => c.canvas.width > 8 || c.canvas.height > 8;
const shift = (pts: Pts, dx: number, dy: number) => pts.map((v, i) => v + (i % 2 ? dy : dx));

/** Two-bone IK: the joint between a and the (reach-clamped) end b; bend +1 / -1 picks the side. */
function ik(a: V, b: V, l1: number, l2: number, bend: number): { j: V; e: V } {
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const d0 = Math.hypot(dx, dy) || 1e-3;
  const d = clamp(d0, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  dx /= d0; dy /= d0;
  const e: V = [a[0] + dx * d, a[1] + dy * d];
  const ang = Math.atan2(dy, dx) + bend * Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  return { j: [a[0] + Math.cos(ang) * l1, a[1] + Math.sin(ang) * l1], e };
}

/** Catmull-Rom resample of an open polyline, carrying a width per control point. */
function resample(pts: Pts, ws: number[], seg: number): { p: Pts; w: number[] } {
  const n = pts.length / 2;
  const p: Pts = [], w: number[] = [];
  const at = (i: number, k: number) => pts[clamp(i, 0, n - 1) * 2 + k];
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t;
      for (let k = 0; k < 2; k++) {
        const a = at(i - 1, k), b = at(i, k), c = at(i + 1, k), d = at(i + 2, k);
        p.push(0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3));
      }
      w.push(lerp(ws[i], ws[i + 1], t));
    }
  }
  p.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
  w.push(ws[n - 1]);
  return { p, w };
}

/** A smooth tube (limb, strap) along pts with a width per control point, round at both ends. */
function tube(pts: Pts, ws: number[], seg = 4): Path2D {
  const { p, w } = pts.length > 4 ? resample(pts, ws, seg) : { p: pts, w: ws };
  const n = p.length / 2;
  const L: number[] = [], R: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let dx = p[b * 2] - p[a * 2], dy = p[b * 2 + 1] - p[a * 2 + 1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const h = Math.max(0.02, w[i] / 2);
    L.push(p[i * 2] - dy * h, p[i * 2 + 1] + dx * h);
    R.push(p[i * 2] + dy * h, p[i * 2 + 1] - dx * h);
  }
  const path = new Path2D();
  path.moveTo(L[0], L[1]);
  for (let i = 1; i < n; i++) path.lineTo(L[i * 2], L[i * 2 + 1]);
  const ex = p[(n - 1) * 2], ey = p[(n - 1) * 2 + 1];
  path.arc(ex, ey, Math.max(0.02, w[n - 1] / 2), Math.atan2(L[(n - 1) * 2 + 1] - ey, L[(n - 1) * 2] - ex), Math.atan2(R[(n - 1) * 2 + 1] - ey, R[(n - 1) * 2] - ex), true);
  for (let i = n - 1; i >= 0; i--) path.lineTo(R[i * 2], R[i * 2 + 1]);
  path.arc(p[0], p[1], Math.max(0.02, w[0] / 2), Math.atan2(R[1] - p[1], R[0] - p[0]), Math.atan2(L[1] - p[1], L[0] - p[0]), true);
  path.closePath();
  return path;
}

/** A closed smooth shape through pts (Catmull-Rom converted to cubic beziers). */
function blob(pts: Pts): Path2D {
  const n = pts.length / 2;
  const at = (i: number): V => { const k = ((i % n) + n) % n; return [pts[k * 2], pts[k * 2 + 1]]; };
  const path = new Path2D();
  path.moveTo(pts[0], pts[1]);
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    path.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  path.closePath();
  return path;
}

/** A straight-edged closed path. */
function poly(pts: Pts): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  return p;
}

/**
 * A ragged hem from s to e: tatters pushed out along n, scalloped notches between them. Appends to path
 * (which must already be at s) and returns the tatter tips (for folds that run down into them).
 */
function raggedHem(path: Path2D, s: V, e: V, n: V, count: number, depth: number, phase: number, seed: number): V[] {
  const tips: V[] = [];
  const on = (t: number): V => [lerp(s[0], e[0], t), lerp(s[1], e[1], t)];
  for (let k = 0; k < count; k++) {
    const h = hash(seed * 31 + k * 7);
    const tTip = (k + 0.5 + (h - 0.5) * 0.35) / count;
    const tN = (k + 1) / count;
    const dTip = depth * (0.55 + 0.65 * h + Math.sin(phase + k * 1.9 + seed) * 0.28);
    const dN = -depth * (0.1 + 0.3 * hash(seed * 17 + k * 3));
    const bt = on(tTip), bn = on(tN);
    const tip: V = [bt[0] + n[0] * dTip, bt[1] + n[1] * dTip];
    // Concave sides: each tatter narrows to a torn point.
    const c0 = on((k + 0.15) / count);
    path.quadraticCurveTo(c0[0] + n[0] * dTip * 0.35, c0[1] + n[1] * dTip * 0.35, tip[0], tip[1]);
    tips.push(tip);
    if (k < count - 1) {
      const c1 = on((k + 0.85) / count);
      path.quadraticCurveTo(c1[0] + n[0] * dTip * 0.25, c1[1] + n[1] * dTip * 0.25, bn[0] + n[0] * dN, bn[1] + n[1] * dN);
    } else path.quadraticCurveTo(lerp(tip[0], e[0], 0.5) - n[0] * 0.2, lerp(tip[1], e[1], 0.5) - n[1] * 0.2, e[0], e[1]);
  }
  return tips;
}

// ---- shading --------------------------------------------------------------------------------------

/** Fill a path with a tone lit from the upper left (the moon) across (x0,y0)-(x1,y1). */
function toneFill(g: Ctx, p: Path2D, t: Tone, x0: number, y0: number, x1: number, y1: number, hi = 1) {
  g.fillStyle = lin(g, x0, y0, x1, y1, [[0, css(mix(t.l, t.h, 0.55 * hi))], [0.22, css(t.l)], [0.58, css(t.m)], [1, css(t.d)]]);
  g.fill(p);
}

/** Cheap soft contact shadow under a part (offset fill plus a feathering stroke, only over paint). */
function occlude(g: Ctx, path: Path2D, ox: number, oy: number, a: number) {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.translate(ox, oy);
  g.fillStyle = `rgba(3,3,9,${(a * 0.5).toFixed(3)})`;
  g.fill(path);
  g.lineWidth = 1.1;
  g.strokeStyle = `rgba(3,3,9,${(a * 0.25).toFixed(3)})`;
  g.stroke(path);
  g.restore();
}

/** A shaded limb: one gradient across it (lit toward the upper-left moon) and a thin lit streak. */
function limb(g: Ctx, pts: Pts, ws: number[], t: Tone, occ = 0.45, hi = 1): Path2D {
  const path = tube(pts, ws, 4);
  if (occ > 0) occlude(g, path, 0.35, 0.55, occ);
  const n = pts.length / 2;
  const x0 = pts[0], y0 = pts[1], x1 = pts[(n - 1) * 2], y1 = pts[(n - 1) * 2 + 1];
  let dx = x1 - x0, dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  let nx = dy, ny = -dx;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const hw = Math.max(...ws) / 2;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  g.fillStyle = lin(g, mx + nx * hw, my + ny * hw, mx - nx * hw, my - ny * hw, [
    [0, css(mix(t.l, t.h, 0.45 * hi))], [0.25, css(t.l)], [0.55, css(t.m)], [0.85, css(t.d)], [1, css(shade(t.d, -0.3))],
  ]);
  g.fill(path);
  if (hi > 0.5) {
    const k = Math.min(...ws);
    taper(g, shift(pts, nx * k * 0.27, ny * k * 0.27), k * 0.22, k * 0.12, css(t.h, 0.4 * hi));
  }
  return path;
}

/** A crease in cloth: a tapered dark groove and a thin lit ridge beside it on the moon side. */
function crease(g: Ctx, pts: Pts, w: number, t: Tone, dark = 0.6, lit = 0.32) {
  taper(g, pts, w, w * 0.12, css(t.d, dark));
  if (lit > 0) taper(g, shift(pts, -w * 0.62, -w * 0.4), w * 0.42, w * 0.06, css(t.h, lit));
}

function stroke(g: Ctx, pts: Pts, w: number, style: string) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.lineWidth = w; g.strokeStyle = style; g.stroke();
}

function stud(g: Ctx, x: number, y: number, r = 0.32) {
  g.beginPath(); g.arc(x, y, r, 0, TAU);
  g.fillStyle = rad(g, x - r * 0.35, y - r * 0.35, 0, r * 1.2, [[0, css(K.brassH)], [0.45, css(K.brass)], [1, css(K.brassD)]]);
  g.fill();
}

// ---- pose -----------------------------------------------------------------------------------------

type ArmPose = 'hang' | 'fore' | 'back' | 'forth' | 'tuck' | 'raise';
interface Pose {
  bob: number;     // body drop
  crouch: number;  // hips and body lowered, knees bent
  lean: number;    // side: shoulders and head forward of the hips
  /** Side: near and far foot (x from the centre line, lift). Front views: stance (nX) and the left and right foot lifts. */
  nX: number; nL: number; fX: number; fL: number;
  flow: number;    // cape streaming back 0..1
  wave: number;    // cape ripple phase
  billow: number;  // cape spread sideways (front views)
  arm: ArmPose;
  swing: number;   // lantern swing from hanging straight down (rad, + toward the facing / screen right)
  free: number;    // free arm swing -1..1
  glow: number;    // extra lantern brightness (cast)
  sway: number;    // tabard and hem sway
}

function pose(anim: KeeperAnim, f: number, dir: Dir): Pose {
  const side = dir === 'side';
  const base: Pose = { bob: 0, crouch: 0, lean: 0.4, nX: side ? 1.8 : 0, nL: 0, fX: side ? -1.4 : 0, fL: 0, flow: 0.06, wave: 0, billow: 0, arm: 'hang', swing: 0, free: 0, glow: 0, sway: 0 };
  switch (anim) {
    case 'idle': {
      const t = (f / 4) * TAU;
      return { ...base, bob: (1 - Math.cos(t)) * 0.28, wave: t, swing: Math.sin(t + 1) * 0.1, sway: Math.sin(t) * 0.35, billow: Math.sin(t) * 0.15 };
    }
    case 'run': {
      const t = (f / 6) * TAU, s = Math.sin(t), c = Math.cos(t);
      if (side) {
        return {
          ...base, bob: 0.95 * (1 - Math.abs(s)), lean: 1.8, nX: 0.6 + s * 5.2, nL: Math.max(0, c) * 3, fX: 0.6 - s * 5.2, fL: Math.max(0, -c) * 3,
          flow: 0.58 + Math.sin(t * 2) * 0.07, wave: t * 2, arm: 'fore', swing: -0.32 - c * 0.12, free: -s, sway: -0.9,
        };
      }
      return {
        ...base, bob: 0.9 * (1 - Math.abs(s)), nX: 0, nL: Math.max(0, s) * 3.4, fX: 0, fL: Math.max(0, -s) * 3.4,
        flow: 0.5, wave: t * 2, billow: 0.5 + Math.sin(t * 2) * 0.25, swing: s * 0.18, free: s, sway: s * 0.9,
      };
    }
    case 'atk0':
      return side
        ? { ...base, crouch: 0.9, lean: -0.7, nX: 3.6, fX: -3.8, flow: 0.3, wave: 1, arm: 'back', swing: -0.55, sway: 0.6 }
        : { ...base, crouch: 0.9, nX: 1.0, billow: 0.5, wave: 1, arm: 'back', swing: dir === 'down' ? 0.7 : -0.7, sway: 0.5 };
    case 'atk1':
      return side
        ? { ...base, crouch: 1.5, lean: 2.0, nX: 6.0, fX: -5.4, flow: 0.78, wave: 2, arm: 'forth', swing: 0.8, free: -1, sway: -1.2 }
        : { ...base, crouch: 1.3, nX: 1.7, billow: 1, wave: 2, arm: 'forth', swing: dir === 'down' ? -0.95 : 0.95, sway: -1 };
    case 'dash':
      return side
        ? { ...base, crouch: 1.7, lean: 3.4, nX: 4.6, nL: 1.8, fX: -6.6, fL: 0.7, flow: 1, wave: 3, arm: 'tuck', swing: -0.75, free: -0.8, sway: -1.6 }
        : { ...base, crouch: 1.1, nX: 0.5, nL: 1.6, billow: 1.5, flow: 1, wave: 3, arm: 'tuck', swing: dir === 'down' ? 0.25 : -0.25, sway: 1 };
    case 'cast':
      return { ...base, bob: f === 1 ? 0 : 0.6, lean: side ? -0.3 : 0, nX: side ? 2.6 : f * 0.7, fX: side ? -2.2 : 0, billow: 0.5 + f * 0.6, flow: 0.25 + f * 0.2, wave: 1 + f * 1.5, arm: 'raise', glow: f + 1, sway: 0.3 };
    case 'dead':
      return base;
  }
}

// ---- lantern --------------------------------------------------------------------------------------

const CHAIN = 1.4; // hand to the lantern's ring
const GLASS = 5.4; // ring to the centre of the glass

/** Where the lantern's glass centre sits for a hand point and a swing angle. */
const glassAt = (hx: number, hy: number, s: number): V => [hx + Math.sin(s) * (CHAIN + GLASS), hy + Math.cos(s) * (CHAIN + GLASS)];

/**
 * A brass lantern hanging from (hx, hy) on a short chain, swung by s: ring and finial, a domed cap, a
 * hexagonal cage of glowing panes (the side panes darker in perspective), rim bands and a footed base.
 * lit 0..1 (a dying lantern on the ground goes out).
 */
function lanternBody(g: Ctx, hx: number, hy: number, s: number, lit: number, chain = true) {
  const c = Math.cos(s), sn = Math.sin(s);
  // Local (u across, v down the hanging line) to frame.
  const ox = hx + sn * CHAIN, oy = hy + c * CHAIN;
  const P = (u: number, v: number): V => [ox + u * c + v * sn, oy - u * sn + v * c];
  const path = (pts: number[]) => { const out: Pts = []; for (let i = 0; i < pts.length; i += 2) out.push(...P(pts[i], pts[i + 1])); return poly(out); };
  g.save();
  if (chain) {
    // Chain: two links from the fist to the ring.
    g.lineCap = 'round';
    g.lineWidth = 0.5; g.strokeStyle = css(K.ink, 0.9);
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(ox, oy); g.stroke();
    g.lineWidth = 0.26; g.strokeStyle = css(K.brassM);
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(ox, oy); g.stroke();
    for (const t of [0.3, 0.75]) {
      const x = lerp(hx, ox, t), y = lerp(hy, oy, t);
      g.beginPath(); g.ellipse(x, y, 0.22, 0.38, -s, 0, TAU);
      g.lineWidth = 0.18; g.strokeStyle = css(K.brassH, 0.8); g.stroke();
    }
  }
  const ring = P(0, 0.5);
  const roof = path([-0.85, 1.25, 0.85, 1.25, 2.55, 2.75, -2.55, 2.75]);
  const bandT = path([-2.75, 2.65, 2.75, 2.65, 2.75, 3.3, -2.75, 3.3]);
  const cage = path([-2.35, 3.2, 2.35, 3.2, 2.35, 7.7, -2.35, 7.7]);
  const bandB = path([-2.75, 7.6, 2.75, 7.6, 2.75, 8.25, -2.75, 8.25]);
  const foot = path([-2.2, 8.15, 2.2, 8.15, 1.35, 9.15, -1.35, 9.15]);
  // Ink edge round the whole lantern.
  g.lineJoin = 'round';
  g.lineWidth = 0.75; g.strokeStyle = css(K.ink);
  for (const p of [roof, bandT, cage, bandB, foot]) g.stroke(p);
  g.beginPath(); g.arc(ring[0], ring[1], 0.62, 0, TAU); g.lineWidth = 0.65; g.stroke();
  g.beginPath(); g.arc(ring[0], ring[1], 0.62, 0, TAU); g.lineWidth = 0.28; g.strokeStyle = css(K.brass); g.stroke();
  // Glass: centre pane bright, side panes in perspective.
  const gc = P(0, 5.45);
  g.fillStyle = lit
    ? rad(g, gc[0] - 0.2, gc[1] + 0.2, 0.1, 3.3, [[0, css(K.core)], [0.3, css(0xffe8b0)], [0.7, css(K.glass)], [1, css(K.amberD)]])
    : lin(g, gc[0] - 2, gc[1] - 2, gc[0] + 2, gc[1] + 2, [[0, css(0x3a3428)], [1, css(0x15120e)]]);
  g.fill(cage);
  const paneL = path([-2.35, 3.25, -1.05, 3.25, -1.05, 7.65, -2.35, 7.65]);
  const paneR = path([1.05, 3.25, 2.35, 3.25, 2.35, 7.65, 1.05, 7.65]);
  g.fillStyle = css(lit ? K.amberD : 0x0a0907, lit ? 0.45 : 0.4); g.fill(paneL);
  g.fillStyle = css(lit ? 0x7a3a10 : 0x000000, lit ? 0.5 : 0.45); g.fill(paneR);
  if (lit) {
    // Flame.
    const f0 = P(0, 4.2), f1 = P(0.95, 5.6), f2 = P(0, 6.7), f3 = P(-0.95, 5.6);
    g.beginPath(); g.moveTo(f0[0], f0[1]);
    g.quadraticCurveTo(f1[0], f1[1], f2[0], f2[1]); g.quadraticCurveTo(f3[0], f3[1], f0[0], f0[1]);
    g.fillStyle = css(0xffffff, 0.95 * lit); g.fill();
  }
  // Cage bars.
  g.lineCap = 'butt';
  for (const [u, w, col] of [[-2.35, 0.5, K.brassD], [-1.05, 0.32, K.brassM], [1.05, 0.32, K.brassD], [2.35, 0.5, K.brassD]] as [number, number, number][]) {
    const a = P(u, 3.2), b = P(u, 7.7);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineWidth = w; g.strokeStyle = css(col); g.stroke();
  }
  { const a = P(-2.25, 3.3), b = P(-2.25, 7.5); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineWidth = 0.16; g.strokeStyle = css(K.brassH, 0.8); g.stroke(); }
  // Roof, bands and base: brass lit from the upper left.
  const metal = (p: Path2D, v0: number, v1: number) => {
    const a = P(-2.6, v0), b = P(2.6, v1);
    g.fillStyle = lin(g, a[0], a[1], b[0], b[1], [[0, css(K.brassH)], [0.3, css(K.brass)], [0.7, css(K.brassM)], [1, css(K.brassD)]]);
    g.fill(p);
  };
  metal(roof, 1.25, 2.75); metal(bandT, 2.65, 3.3); metal(bandB, 7.6, 8.25); metal(foot, 8.15, 9.15);
  // Finial knob, rivets and a glint on the roof.
  const kn = P(0, 1.2);
  g.beginPath(); g.arc(kn[0], kn[1], 0.48, 0, TAU);
  g.fillStyle = rad(g, kn[0] - 0.15, kn[1] - 0.15, 0, 0.6, [[0, css(K.brassH)], [1, css(K.brassD)]]); g.fill();
  for (const u of [-1.9, 0, 1.9]) { const r = P(u, 2.97); g.beginPath(); g.arc(r[0], r[1], 0.17, 0, TAU); g.fillStyle = css(K.brassH, 0.85); g.fill(); }
  const gl = P(-1.2, 2.0);
  g.beginPath(); g.ellipse(gl[0], gl[1], 0.5, 0.18, -0.6 - s, 0, TAU); g.fillStyle = css(0xffffff, 0.55); g.fill();
  g.restore();
}

/** The lantern's light in the emissive layer: a halo kept inside the frame, the hot glass and the flame. */
function lanternGlow(e: Ctx, hx: number, hy: number, s: number, lit: number, extra = 0) {
  if (!lit) return;
  const [gx, gy] = glassAt(hx, hy, s);
  const room = Math.min(gx, KEEPER_W - gx, gy, KEEPER_H - gy);
  glow(e, gx, gy, Math.max(4, Math.min(9.5 + extra * 2.2, room)), K.amber, (0.6 + extra * 0.1) * lit, 0.12);
  glow(e, gx, gy, 3.8, 0xfff0c8, 0.9 * lit, 0.3);
  const c = Math.cos(s), sn = Math.sin(s);
  const ox = hx + sn * CHAIN, oy = hy + c * CHAIN;
  const P = (u: number, v: number): V => [ox + u * c + v * sn, oy - u * sn + v * c];
  const pts: Pts = [];
  for (const [u, v] of [[-2.1, 3.4], [2.1, 3.4], [2.1, 7.5], [-2.1, 7.5]]) pts.push(...P(u, v));
  e.fillStyle = rad(e, gx, gy, 0.2, 3.2, [[0, css(0xffffff, lit)], [0.45, css(0xffe2a0, lit)], [1, css(K.amber, 0.7 * lit)]]);
  e.fill(poly(pts));
}

// ---- shared parts ---------------------------------------------------------------------------------

/** A gloved fist. */
function glove(g: Ctx, x: number, y: number, r = 1.1) {
  const p = new Path2D(); p.ellipse(x, y, r, r * 0.92, 0, 0, TAU);
  g.fillStyle = rad(g, x - r * 0.4, y - r * 0.4, 0.1, r * 1.3, [[0, css(LEATHER.l)], [0.5, css(STRAP.m)], [1, css(STRAP.d)]]);
  g.fill(p);
  g.lineWidth = 0.2; g.strokeStyle = css(STRAP.d, 0.9);
  g.beginPath(); g.moveTo(x - r * 0.5, y + r * 0.1); g.lineTo(x + r * 0.55, y + r * 0.15); g.stroke();
}

/** An arm from the shoulder s to the hand h (elbow by IK): padded sleeve, a leather bracer, a glove. */
function arm(g: Ctx, s: V, h: V, bend: number, dim = 0, l1 = 4.8, l2 = 4.6) {
  const { j: el, e: hd } = ik(s, h, l1, l2, bend);
  const sl = dim ? far(SLEEVE, dim) : SLEEVE, br = dim ? far(LEATHER, dim) : LEATHER;
  limb(g, [s[0], s[1], lerp(s[0], el[0], 0.5), lerp(s[1], el[1], 0.5), el[0], el[1]], [3.0, 2.7, 2.3], sl, dim ? 0 : 0.45);
  const fa: V = [lerp(el[0], hd[0], 0.45), lerp(el[1], hd[1], 0.45)];
  limb(g, [el[0], el[1], fa[0], fa[1], hd[0], hd[1]], [2.4, 2.6, 2.0], br, dim ? 0 : 0.4);
  // Bracer straps.
  const ux = hd[0] - el[0], uy = hd[1] - el[1], ul = Math.hypot(ux, uy) || 1, nx = -uy / ul, ny = ux / ul;
  for (const t of [0.42, 0.78]) {
    const x = lerp(el[0], hd[0], t), y = lerp(el[1], hd[1], t);
    g.lineWidth = 0.42; g.strokeStyle = css(STRAP.d, 0.9);
    g.beginPath(); g.moveTo(x - nx * 1.25, y - ny * 1.25); g.lineTo(x + nx * 1.25, y + ny * 1.25); g.stroke();
  }
  if (!dim) stud(g, lerp(el[0], hd[0], 0.6) - nx * 0.4, lerp(el[1], hd[1], 0.6) - ny * 0.4, 0.26);
  glove(g, hd[0], hd[1], dim ? 1.05 : 1.2);
  return { el, hd };
}

/** A tall boot seen from the side: x forward along `a` (radians), origin at the ankle. */
function bootSide(g: Ctx, ax: number, ay: number, a: number, t: Tone) {
  const c = Math.cos(a), s = Math.sin(a);
  const P = (u: number, v: number): number[] => [ax + u * c - v * s, ay + u * s + v * c];
  const p = blob([...P(-1.25, -0.7), ...P(0.9, -0.85), ...P(2.1, 0.25), ...P(3.15, 1.1), ...P(3.05, 2.0), ...P(0.6, 2.05), ...P(-1.35, 2.0), ...P(-1.55, 0.7)]);
  toneFill(g, p, t, ...(P(-1.5, -1) as V), ...(P(3, 2.2) as V));
  // Sole and heel.
  const so = poly([...P(-1.45, 1.6), ...P(3.15, 1.55), ...P(3.0, 2.08), ...P(-1.45, 2.08)]);
  g.fillStyle = css(K.sole); g.fill(so);
  // Toe cap glint and an instep strap.
  const gl = P(2.0, 0.55);
  g.beginPath(); g.ellipse(gl[0], gl[1], 0.7, 0.28, a + 0.5, 0, TAU); g.fillStyle = css(t.h, 0.45); g.fill();
  const s0 = P(0.3, -0.6), s1 = P(0.9, 1.4);
  g.lineWidth = 0.4; g.strokeStyle = css(STRAP.d); g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(s1[0], s1[1]); g.stroke();
}

/** A leg in profile: thigh and shin by IK (knee forward), a tall boot with a folded cuff. */
function legSide(g: Ctx, hip: V, ankle: V, footA: number, near: boolean) {
  const { j: knee, e: an } = ik(hip, ankle, 8.0, 7.9, -1);
  const tr = near ? BREECH : far(BREECH, 0.35), bt = near ? BOOT : far(BOOT, 0.35);
  limb(g, [hip[0], hip[1], lerp(hip[0], knee[0], 0.5) + 0.25, lerp(hip[1], knee[1], 0.5), knee[0], knee[1]], [3.4, 3.0, 2.4], tr, near ? 0.45 : 0);
  const shin = [knee[0], knee[1], lerp(knee[0], an[0], 0.5) - 0.2, lerp(knee[1], an[1], 0.5), an[0], an[1]];
  limb(g, shin, [2.4, 2.4, 1.9], tr, near ? 0.4 : 0);
  // Boot shaft from mid-shin, folded cuff, then the foot.
  const top: V = [lerp(knee[0], an[0], 0.34), lerp(knee[1], an[1], 0.34)];
  limb(g, [top[0], top[1], lerp(top[0], an[0], 0.5), lerp(top[1], an[1], 0.5), an[0], an[1]], [2.8, 2.5, 2.3], bt, near ? 0.35 : 0);
  bootSide(g, an[0], an[1], footA, bt);
  const ux = an[0] - knee[0], uy = an[1] - knee[1], ul = Math.hypot(ux, uy) || 1, nx = -uy / ul, ny = ux / ul;
  const cuff = tube([top[0] + nx * 1.5, top[1] + ny * 1.5, top[0] - nx * 1.5, top[1] - ny * 1.5], [1.2, 1.0], 1);
  g.fillStyle = lin(g, top[0] - 1.5, top[1] - 1, top[0] + 1.5, top[1] + 1, [[0, css(bt.h)], [0.4, css(bt.l)], [1, css(bt.m)]]);
  g.fill(cuff);
  // A small knee guard.
  const kg = new Path2D(); kg.ellipse(knee[0] + 0.3, knee[1] - 0.1, 1.05, 0.95, 0.3, 0, TAU);
  g.fillStyle = rad(g, knee[0] - 0.1, knee[1] - 0.4, 0.1, 1.3, [[0, css(near ? LEATHER.l : LEATHER.m)], [0.6, css(LEATHER.m)], [1, css(LEATHER.d)]]);
  g.fill(kg);
  return knee;
}

/** A leg seen from the front or back: thigh and shin (the knee rises with a lifted foot), a tall boot. */
function legFront(g: Ctx, hip: V, ankle: V, lift: number, toes: boolean, dim = 0) {
  const tr = dim ? far(BREECH, dim) : BREECH, bt = dim ? far(BOOT, dim) : BOOT;
  const out = hip[0] < CX ? -1 : 1;
  const knee: V = [lerp(hip[0], ankle[0], 0.5) + out * 0.15, lerp(hip[1], ankle[1], 0.48) - lift * 0.3];
  limb(g, [hip[0], hip[1], lerp(hip[0], knee[0], 0.5), lerp(hip[1], knee[1], 0.5), knee[0], knee[1]], [3.1, 2.8, 2.4], tr, 0.4);
  limb(g, [knee[0], knee[1], ankle[0], ankle[1]], [2.4, 1.9], tr, 0.3);
  // Boot: shaft up to below the knee, a folded cuff, the toe cap.
  const top = lerp(knee[1], ankle[1], 0.28);
  const x = ankle[0], fy = ankle[1] + 2.2;
  const shaft = blob([x - 1.35, top, x + 1.35, top, x + 1.4, ankle[1] + 0.4, x + 1.65, fy - 0.9, x + 1.45, fy, x - 1.45, fy, x - 1.65, fy - 0.9, x - 1.4, ankle[1] + 0.4]);
  toneFill(g, shaft, bt, x - 1.7, top, x + 1.7, fy);
  // A lit seam down the shaft.
  g.lineWidth = 0.3; g.strokeStyle = css(bt.h, 0.35);
  g.beginPath(); g.moveTo(x - 0.75, top + 1.2); g.lineTo(x - 0.8, ankle[1] + 0.2); g.stroke();
  if (toes) {
    const toe = new Path2D(); toe.ellipse(x, fy - 0.8, 1.75, 1.0, 0, 0, TAU);
    g.fillStyle = rad(g, x - 0.5, fy - 1.3, 0.1, 2, [[0, css(bt.l)], [0.6, css(bt.m)], [1, css(bt.d)]]);
    g.fill(toe);
    g.beginPath(); g.ellipse(x - 0.55, fy - 1.2, 0.55, 0.24, -0.2, 0, TAU); g.fillStyle = css(bt.h, 0.5); g.fill();
  }
  g.fillStyle = css(K.sole); g.fillRect(x - 1.65, fy - 0.4, 3.3, 0.4);
  const cuff = blob([x - 1.65, top - 0.35, x + 1.65, top - 0.35, x + 1.55, top + 0.9, x - 1.55, top + 0.9]);
  g.fillStyle = lin(g, x - 1.6, top, x + 1.6, top + 1, [[0, css(bt.h)], [0.35, css(bt.l)], [1, css(bt.d)]]);
  g.fill(cuff);
  // Strap and buckle across the ankle.
  g.fillStyle = css(STRAP.d); g.fillRect(x - 1.45, ankle[1] - 0.5, 2.9, 0.45);
  g.fillStyle = css(K.brassM); g.fillRect(x + (out < 0 ? -1.05 : 0.4), ankle[1] - 0.58, 0.65, 0.6);
}

// ---- front and back -------------------------------------------------------------------------------

interface Hand { hx: number; hy: number; s: number; behind: boolean }
interface Rig {
  by: number;          // hood peak
  lantern: Hand;
  eyes: { x: number; y: number; r: number; a: number }[];
}

/** The lantern hand for a pose (down/up: sgn is the lantern side on screen, +1 right). */
function handFront(ps: Pose, by: number, sgn: number): Hand {
  switch (ps.arm) {
    case 'back': return { hx: CX + sgn * 9.0, hy: by + 9.4, s: ps.swing, behind: true };
    case 'forth': return { hx: CX - sgn * 7.0, hy: by + 18.0, s: ps.swing, behind: sgn < 0 };
    case 'tuck': return { hx: CX + sgn * 7.6, hy: by + 15.8, s: ps.swing, behind: false };
    case 'raise': return { hx: CX + sgn * (ps.glow > 1 ? 7.4 : 6.9), hy: ps.glow > 1 ? Math.max(1.6, by - 0.6) : by + 1.4, s: sgn * 0.08, behind: false };
    default: return { hx: CX + sgn * 8.4, hy: by + 17.2, s: ps.swing, behind: false };
  }
}

/** The back of the cape: behind the body in the down view (its lining between the legs), over it in the up view. */
function capeBack(g: Ctx, ps: Pose, by: number, back: boolean) {
  const bl = ps.billow, sw = ps.sway;
  const sy = by + 10.2;
  const hemY = (back ? by + 29.0 : by + 30.8) - bl * 1.0 - ps.flow * 0.8 + ps.crouch * 0.4;
  const wTop = back ? 6.6 : 6.0, wHem = (back ? 7.9 : 7.4) + bl * 1.5;
  const L: V = [CX - wHem - sw * 0.4, hemY - 0.6], R: V = [CX + wHem - sw * 0.4, hemY - 0.2];
  const p = new Path2D();
  p.moveTo(CX - wTop + 1.6, sy - 0.8);
  p.bezierCurveTo(CX - wTop - 1.1, sy - 0.1, L[0] + 0.4 - bl * 0.6, lerp(sy, hemY, 0.45), L[0], L[1]);
  const tips = raggedHem(p, L, R, [0, 1], back ? 7 : 6, (back ? 1.9 : 1.6) + bl * 0.4, ps.wave, back ? 3 : 5);
  p.bezierCurveTo(R[0] - 0.4 + bl * 0.6, lerp(sy, hemY, 0.45), CX + wTop + 1.1, sy - 0.1, CX + wTop - 1.6, sy - 0.8);
  p.closePath();
  occlude(g, p, 0.4, 0.6, 0.4);
  if (back) toneFill(g, p, CLOAK, CX - wHem, sy - 2, CX + wHem * 0.8, hemY + 3);
  else {
    // From the front we see the cape's inside: wine lining in deep shadow, the outer cloth at the edges.
    g.fillStyle = lin(g, CX - wHem, 0, CX + wHem, 0, [[0, css(CLOAK.m)], [0.2, css(LINING.d)], [0.5, css(LINING.m)], [0.8, css(LINING.d)], [1, css(CLOAK.d)]]);
    g.fill(p);
  }
  g.save();
  g.clip(p);
  g.fillStyle = lin(g, 0, sy + 6, 0, hemY + 2, [[0, css(CLOAK.d, 0)], [1, css(CLOAK.d, back ? 0.5 : 0.35)]]);
  g.fillRect(CX - wHem - 3, sy - 2, wHem * 2 + 6, hemY - sy + 6);
  // Long folds from the shoulders into the tatters.
  tips.forEach((t, i) => {
    if (!back && (i === 0 || i === tips.length - 1)) return;
    const u = (i + 0.5) / tips.length;
    const x0 = lerp(CX - wTop + 1, CX + wTop - 1, u);
    crease(g, bez(x0, sy + 3, lerp(x0, t[0], 0.4), sy + 9, t[0] + (t[0] - CX) * 0.05, hemY - 6, t[0], t[1] - 0.4, 8), back ? 1.1 : 0.8, back ? CLOAK : LINING, 0.55, back ? 0.3 : 0.2);
  });
  if (back) {
    // Centre seam, swaying with the stride.
    crease(g, bez(CX - 0.4, sy + 2, CX - 0.6, sy + 9, CX - 0.2 - sw * 0.3, hemY - 6, CX - 0.4 - sw * 0.6, hemY + 0.8, 8), 1.2, CLOAK, 0.6, 0.38);
  }
  g.lineWidth = 0.7; g.strokeStyle = css(K.trim, 0.45); g.stroke(p);
  g.restore();
}

/** Down view: the cape's front panels over the shoulders and arms, open in the middle. */
function capePanels(g: Ctx, ps: Pose, by: number, which: -1 | 1) {
  const bl = ps.billow, sw = ps.sway;
  const s = which;
  const hemP = by + 28.0 + ps.crouch * 0.3 - bl * 0.7 - ps.flow * 1.2;
  const outerTop: V = [CX + s * 6.0, by + 11.4];
  const outerHem: V = [CX + s * (7.4 + bl * 1.2) - sw * 0.35, hemP - 0.2];
  const innerHem: V = [CX + s * 3.0 - sw * 0.25, hemP + 0.9];
  const innerTop: V = [CX + s * 1.9, by + 11.2];
  const p = new Path2D();
  p.moveTo(innerTop[0], innerTop[1]);
  p.lineTo(outerTop[0], outerTop[1]);
  p.bezierCurveTo(CX + s * (7.0 + bl * 0.4), by + 15, outerHem[0] + s * 0.2, hemP - 7, outerHem[0], outerHem[1]);
  const tips = raggedHem(p, outerHem, innerHem, [0, 1], 3, 1.5 + bl * 0.3, ps.wave + s, s > 0 ? 41 : 43);
  p.bezierCurveTo(CX + s * 3.3 - sw * 0.2, hemP - 5, CX + s * 2.4, by + 17, innerTop[0], innerTop[1]);
  p.closePath();
  occlude(g, p, 0.35, 0.6, 0.5);
  toneFill(g, p, CLOAK, CX + (s < 0 ? -7.5 : 1.5), by + 11, CX + (s < 0 ? -1.5 : 7.5), hemP + 2, s < 0 ? 1 : 0.6);
  g.save();
  g.clip(p);
  g.fillStyle = lin(g, 0, by + 16, 0, hemP + 2, [[0, css(CLOAK.d, 0)], [1, css(CLOAK.d, 0.5)]]);
  g.fillRect(CX - 10, by + 10, 20, hemP - by - 6);
  tips.forEach((t, i) => {
    const x0 = lerp(outerTop[0], innerTop[0], 0.2 + i * 0.3);
    crease(g, bez(x0, by + 13, lerp(x0, t[0], 0.3), by + 18, t[0], hemP - 5, t[0], t[1] - 0.5, 7), 0.9, CLOAK, 0.55, s < 0 ? 0.32 : 0.16);
  });
  // The lining turned back along the inner edge, then the trim.
  g.lineWidth = 1.5; g.strokeStyle = css(LINING.m);
  g.beginPath(); g.moveTo(innerHem[0], innerHem[1]); g.bezierCurveTo(CX + s * 3.3 - sw * 0.2, hemP - 5, CX + s * 2.4, by + 17, innerTop[0], innerTop[1]); g.stroke();
  g.lineWidth = 0.7; g.strokeStyle = css(K.trim, 0.55); g.stroke(p);
  g.restore();
}

function torsoFront(g: Ctx, by: number) {
  const sy = by + 10.4, wy = by + 18.4;
  const t = blob([CX - 3.9, sy + 0.4, CX - 1.8, sy - 0.4, CX + 1.8, sy - 0.4, CX + 3.9, sy + 0.4, CX + 3.5, sy + 4.5, CX + 3.0, wy, CX + 3.2, wy + 1.6, CX - 3.2, wy + 1.6, CX - 3.0, wy, CX - 3.5, sy + 4.5]);
  occlude(g, t, 0.3, 0.6, 0.45);
  toneFill(g, t, JERKIN, CX - 4, sy, CX + 3.5, wy + 2);
  g.save();
  g.clip(t);
  g.fillStyle = lin(g, 0, sy, 0, sy + 4.5, [[0, css(0x000000, 0.55)], [1, css(0x000000, 0)]]);
  g.fillRect(CX - 5, sy - 1, 10, 6);
  // Laced collar over a dark shirt.
  const v = poly([CX - 1.1, sy - 0.5, CX + 1.1, sy - 0.5, CX + 0.2, sy + 4.6, CX - 0.2, sy + 4.6]);
  g.fillStyle = css(K.shirt); g.fill(v);
  g.lineWidth = 0.22; g.strokeStyle = css(LEATHER.h, 0.85);
  for (let i = 0; i < 3; i++) { const y = sy + 1.1 + i * 1.2, w = 0.9 - i * 0.24; g.beginPath(); g.moveTo(CX - w, y); g.lineTo(CX + w, y + 0.45); g.stroke(); }
  // Quilted panels with stitching.
  for (const x of [-1.9, 1.9]) {
    g.lineWidth = 0.3; g.strokeStyle = css(JERKIN.d, 0.8);
    g.beginPath(); g.moveTo(CX + x, sy + 4.8); g.lineTo(CX + x * 1.05, wy); g.stroke();
    g.lineWidth = 0.13; g.strokeStyle = css(JERKIN.h, 0.55); g.setLineDash([0.35, 0.4]);
    g.beginPath(); g.moveTo(CX + x - 0.3, sy + 4.9); g.lineTo(CX + x * 1.05 - 0.3, wy); g.stroke();
    g.setLineDash([]);
  }
  for (const y of [sy + 5.6, sy + 6.9]) { g.lineWidth = 0.25; g.strokeStyle = css(JERKIN.d, 0.6); g.beginPath(); g.moveTo(CX - 1.8, y); g.lineTo(CX + 1.8, y); g.stroke(); }
  g.restore();
  // Belt with a brass buckle.
  const belt = blob([CX - 3.5, wy - 0.15, CX + 3.5, wy - 0.15, CX + 3.55, wy + 1.35, CX - 3.55, wy + 1.35]);
  toneFill(g, belt, STRAP, CX - 3.5, wy - 0.4, CX + 3.5, wy + 1.6);
  g.fillStyle = css(STRAP.h, 0.5); g.fillRect(CX - 3.2, wy, 6.4, 0.22);
  const bk = blob([CX - 0.95, wy - 0.45, CX + 0.95, wy - 0.45, CX + 0.95, wy + 1.65, CX - 0.95, wy + 1.65]);
  g.fillStyle = lin(g, CX - 1, wy - 0.4, CX + 1, wy + 1.6, [[0, css(K.brassH)], [0.4, css(K.brass)], [1, css(K.brassD)]]);
  g.fill(bk);
  g.fillStyle = css(STRAP.d); g.fillRect(CX - 0.45, wy + 0.1, 0.9, 0.9);
  // Bandolier from the free shoulder to the lantern hip, with studs.
  limb(g, [CX - 3.6, sy + 0.4, CX - 0.4, sy + 4.4, CX + 3.0, wy - 0.3], [1.15, 1.15, 1.1], STRAP, 0.4);
  stud(g, CX - 2.2, sy + 2.4); stud(g, CX + 1.4, sy + 6.0);
}

function skirtFront(g: Ctx, ps: Pose, by: number) {
  const wy = by + 19.6, sw = ps.sway;
  // Two small leather tassets over the hips and a cloth tabard between them.
  for (const s of [-1, 1]) {
    const x0 = CX + s * 0.8, x1 = CX + s * 3.4;
    const p = blob([x0, wy, x1, wy - 0.1, x1 + s * 0.4 + sw * 0.2, wy + 3.4, x0 + s * 0.2 + sw * 0.3, wy + 3.8]);
    occlude(g, p, 0.3, 0.6, 0.45);
    toneFill(g, p, LEATHER, Math.min(x0, x1), wy, Math.max(x0, x1), wy + 3.8);
    g.lineWidth = 0.28; g.strokeStyle = css(LEATHER.d, 0.85);
    g.beginPath(); g.moveTo(lerp(x0, x1, 0.1), wy + 1.8); g.lineTo(lerp(x0, x1, 0.95) + s * 0.2, wy + 1.7); g.stroke();
  }
  const tp = new Path2D();
  tp.moveTo(CX - 1.3, wy - 0.2);
  tp.lineTo(CX + 1.3, wy - 0.2);
  tp.quadraticCurveTo(CX + 1.5 + sw * 0.4, wy + 4, CX + 1.3 + sw, wy + 7.0);
  raggedHem(tp, [CX + 1.3 + sw, wy + 7.0], [CX - 1.3 + sw, wy + 7.0], [0, 1], 2, 0.7, ps.wave, 9);
  tp.quadraticCurveTo(CX - 1.5 + sw * 0.4, wy + 4, CX - 1.3, wy - 0.2);
  occlude(g, tp, 0.3, 0.5, 0.5);
  toneFill(g, tp, CLOTH, CX - 1.6, wy, CX + 1.6, wy + 8);
  g.save(); g.clip(tp);
  g.fillStyle = lin(g, 0, wy, 0, wy + 8, [[0, css(0x000000, 0.4)], [0.3, css(0x000000, 0)], [1, css(0x000000, 0.25)]]);
  g.fillRect(CX - 3, wy - 1, 6, 9);
  // An embroidered sun sigil in faded thread.
  const sx = CX + sw * 0.3, sy = wy + 3.0;
  g.lineWidth = 0.2; g.strokeStyle = css(K.trimL, 0.6);
  g.beginPath(); g.arc(sx, sy, 0.6, 0, TAU); g.stroke();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; g.beginPath(); g.moveTo(sx + Math.cos(a) * 0.85, sy + Math.sin(a) * 0.85); g.lineTo(sx + Math.cos(a) * 1.25, sy + Math.sin(a) * 1.25); g.stroke(); }
  g.restore();
}

function mantleFront(g: Ctx, ps: Pose, by: number, back: boolean) {
  // The cape's top layer over the shoulders: two lapels meeting at a clasp (down), one piece (up).
  const sy = by + 9.0, bl = ps.billow * 0.3;
  const wo = back ? 7.6 : 7.0;
  const p = new Path2D();
  p.moveTo(CX - 3.4, sy);
  p.bezierCurveTo(CX - 5.8, sy + 0.1, CX - wo - bl, sy + 1.2, CX - wo - 0.2 - bl, sy + 4.4);
  if (back) {
    raggedHem(p, [CX - wo - 0.2 - bl, sy + 4.4], [CX + wo + 0.2 + bl, sy + 4.4], [0, 1], 6, 0.9, ps.wave + 1, 11);
  } else {
    raggedHem(p, [CX - wo - 0.2 - bl, sy + 4.4], [CX - 0.4, sy + 2.6], [-0.3, 1], 3, 0.8, ps.wave + 1, 11);
    p.lineTo(CX + 0.4, sy + 2.6);
    raggedHem(p, [CX + 0.4, sy + 2.6], [CX + wo + 0.2 + bl, sy + 4.4], [0.3, 1], 3, 0.8, ps.wave + 2, 12);
  }
  p.bezierCurveTo(CX + wo + bl, sy + 1.2, CX + 5.8, sy + 0.1, CX + 3.4, sy);
  p.closePath();
  occlude(g, p, 0.3, 0.7, 0.55);
  g.fillStyle = rad(g, CX - 3, sy - 1, 0.5, 11, [[0, css(CLOAK.h)], [0.3, css(CLOAK.l)], [0.7, css(CLOAK.m)], [1, css(CLOAK.d)]]);
  g.fill(p);
  g.save(); g.clip(p);
  g.fillStyle = lin(g, 0, sy + 1.5, 0, sy + 6, [[0, css(CLOAK.d, 0)], [1, css(CLOAK.d, 0.5)]]);
  g.fillRect(CX - 9, sy - 1, 18, 8);
  for (const x of [-5.4, -2.6, 2.6, 5.4]) crease(g, [CX + x * 0.75, sy + 1.2, CX + x, sy + 5], 0.7, CLOAK, 0.5, x < 0 ? 0.3 : 0.15);
  g.lineWidth = 0.7; g.strokeStyle = css(K.trim, 0.55); g.stroke(p);
  g.restore();
  if (!back) {
    // Brass clasp at the throat.
    stud(g, CX, sy + 2.3, 0.62);
    g.beginPath(); g.arc(CX, sy + 2.3, 0.28, 0, TAU); g.fillStyle = css(K.brassD); g.fill();
  }
}

function hoodFront(g: Ctx, by: number, tilt: number, bow = 0) {
  inHood(g, CX + tilt, by, () => hoodFrontAt(g, by, tilt, bow));
}
function hoodFrontAt(g: Ctx, by: number, tilt: number, bow: number) {
  const hx = CX + tilt;
  const p = new Path2D();
  p.moveTo(hx - 4.4, by + 9.8);
  p.bezierCurveTo(hx - 5.5, by + 6.6, hx - 4.6, by + 2.0, hx - 0.6, by);
  p.bezierCurveTo(hx + 3.4, by + 1.0, hx + 5.4, by + 5.2, hx + 4.5, by + 9.8);
  p.quadraticCurveTo(hx, by + 11.2, hx - 4.4, by + 9.8);
  p.closePath();
  occlude(g, p, 0.3, 0.7, 0.55);
  g.fillStyle = rad(g, hx - 2.2, by + 1.8, 0.4, 10, [[0, css(HOOD.h)], [0.28, css(HOOD.l)], [0.62, css(HOOD.m)], [1, css(HOOD.d)]]);
  g.fill(p);
  // Face opening: the rolled lip of the hood, then the deep shadow inside.
  const fy = by + bow * 0.8;
  const lip = new Path2D();
  lip.moveTo(hx, fy + 2.4);
  lip.bezierCurveTo(hx + 3.2, fy + 2.4, hx + 3.8, fy + 5.6, hx + 3.1, fy + 8.6);
  lip.quadraticCurveTo(hx, fy + 10.2, hx - 3.1, fy + 8.6);
  lip.bezierCurveTo(hx - 3.8, fy + 5.6, hx - 3.2, fy + 2.4, hx, fy + 2.4);
  g.save(); g.clip(p);
  g.fillStyle = lin(g, hx - 3, fy + 2, hx + 3, fy + 9, [[0, css(HOOD.h)], [0.4, css(HOOD.l)], [1, css(HOOD.d)]]);
  g.fill(lip);
  const face = new Path2D();
  face.moveTo(hx, fy + 3.3 + bow * 0.6);
  face.bezierCurveTo(hx + 2.5, fy + 3.3 + bow * 0.6, hx + 3.0, fy + 5.8, hx + 2.5, fy + 8.1);
  face.quadraticCurveTo(hx, fy + 9.3, hx - 2.5, fy + 8.1);
  face.bezierCurveTo(hx - 3.0, fy + 5.8, hx - 2.5, fy + 3.3 + bow * 0.6, hx, fy + 3.3 + bow * 0.6);
  g.fillStyle = rad(g, hx, fy + 6.4, 0.3, 4.2, [[0, css(K.face)], [0.65, css(0x06070e)], [1, css(K.faceRim)]]);
  g.fill(face);
  // The faintest suggestion of a cheek and jaw in the dark.
  g.fillStyle = rad(g, hx - 0.9, fy + 7.6, 0, 1.8, [[0, css(0x2a2c3a, 0.5)], [1, css(0x2a2c3a, 0)]]);
  g.fillRect(hx - 3, fy + 5.5, 4.5, 4);
  g.lineWidth = 0.32; g.strokeStyle = css(K.trim, 0.7); g.stroke(lip);
  crease(g, bez(hx - 0.6, by + 0.3, hx - 2.2, by + 1.2, hx - 3.4, by + 2.6, hx - 4.0, by + 5, 6), 0.55, HOOD, 0.5, 0.35);
  crease(g, bez(hx + 1.6, by + 0.8, hx + 3, by + 2, hx + 3.8, by + 3.4, hx + 4.4, by + 6, 6), 0.5, HOOD, 0.45, 0.1);
  g.restore();
}

/** The hood from behind: a round cowl whose point hangs down the back over the mantle. */
function hoodBack(g: Ctx, ps: Pose, by: number) {
  inHood(g, CX, by, () => hoodBackAt(g, ps, by));
}
function hoodBackAt(g: Ctx, ps: Pose, by: number) {
  const hx = CX, sw = ps.sway * 0.3;
  const p = new Path2D();
  p.moveTo(hx - 4.9, by + 9.6);
  p.bezierCurveTo(hx - 5.9, by + 6.0, hx - 5.0, by + 1.2, hx - 0.4, by + 0.6);
  p.bezierCurveTo(hx + 4.3, by + 1.0, hx + 5.9, by + 5.8, hx + 4.9, by + 9.6);
  p.quadraticCurveTo(hx + 2.6, by + 11.0, hx + 0.5 + sw, by + 15.4);
  p.quadraticCurveTo(hx - 2.9, by + 11.0, hx - 4.9, by + 9.6);
  p.closePath();
  occlude(g, p, 0.3, 0.8, 0.7);
  g.fillStyle = rad(g, hx - 2.4, by + 2.4, 0.4, 12, [[0, css(HOOD.h)], [0.24, css(HOOD.l)], [0.55, css(HOOD.m)], [1, css(HOOD.d)]]);
  g.fill(p);
  g.save(); g.clip(p);
  // The back of the head under the cloth, then the fabric gathering at the nape into the point.
  g.fillStyle = lin(g, 0, by + 6.5, 0, by + 10.5, [[0, css(HOOD.d, 0)], [1, css(HOOD.d, 0.55)]]);
  g.fillRect(hx - 7, by + 6, 14, 10);
  crease(g, bez(hx - 4.4, by + 7.4, hx - 2, by + 9.4, hx + 2, by + 9.4, hx + 4.4, by + 7.2, 8), 0.8, HOOD, 0.55, 0.35);
  crease(g, bez(hx - 0.4, by + 1.0, hx - 0.9, by + 4, hx - 0.5, by + 7, hx - 0.4, by + 8.6, 8), 0.8, HOOD, 0.5, 0.4);
  crease(g, bez(hx - 1.6, by + 10.0, hx - 0.8, by + 11.6, hx + 0.1, by + 13, hx + 0.4 + sw, by + 14.8, 6), 0.7, HOOD, 0.55, 0.3);
  crease(g, bez(hx + 3.4, by + 2.6, hx + 4.2, by + 4.6, hx + 4.0, by + 6.4, hx + 3.4, by + 7.6, 6), 0.7, HOOD, 0.45, 0.1);
  g.lineWidth = 0.6; g.strokeStyle = css(K.trim, 0.45); g.stroke(p);
  g.restore();
}

/** Down and up views: the whole figure, back to front. */
function drawFront(g: Ctx, ps: Pose, dir: 'down' | 'up', rig: Rig) {
  const back = dir === 'up';
  const by = rig.by;
  const sgn = back ? -1 : 1; // the lantern side on screen
  const hipY = by + 20.4;
  const legs = () => {
    // Left and right leg (screen). nL lifts the screen-left foot, fL the right.
    for (const [s, li] of [[-1, ps.nL], [1, ps.fL]] as const) {
      legFront(g, [CX + s * 1.7, hipY], [CX + s * (2.0 + ps.nX), FY - 2.2 - li], li, !back);
    }
  };
  const lh = rig.lantern;
  const shY = by + 11.6;
  if (back) {
    legs();
    arm(g, [CX + sgn * 3.2, shY + 1.4], [lh.hx, lh.hy], 1);
    capeBack(g, ps, by, true);
    mantleFront(g, ps, by, true);
    hoodBack(g, ps, by);
    return;
  }
  capeBack(g, ps, by, false);
  legs();
  torsoFront(g, by);
  skirtFront(g, ps, by);
  const lanternArm = () => arm(g, [CX + sgn * 4.0, shY], [lh.hx, lh.hy], -1);
  const high = lh.hy < shY + 1;
  capePanels(g, ps, by, -1);
  if (ps.arm === 'forth') {
    // The lantern swung across the body: the arm crosses in front of the cape and chest.
    capePanels(g, ps, by, 1);
    mantleFront(g, ps, by, false);
    hoodFront(g, by, -0.3);
    lanternArm();
  } else {
    if (high) capePanels(g, ps, by, 1);
    lanternArm();
    if (!high) capePanels(g, ps, by, 1);
    mantleFront(g, ps, by, false);
    hoodFront(g, by, ps.arm === 'back' ? 0.3 : 0);
  }
  // The free hand holds the cape's edge at the waist.
  const fx = CX - 2.9 - ps.free * 0.3, fy = by + 18.4 - ps.free * 0.6;
  limb(g, [fx - 1.4, fy - 0.9, fx, fy], [1.9, 1.8], LEATHER, 0.4);
  glove(g, fx, fy, 1.15);
}

// ---- side ---------------------------------------------------------------------------------------

function handSide(ps: Pose, sh: V, by: number): Hand {
  switch (ps.arm) {
    case 'fore': return { hx: sh[0] + 7.6, hy: by + 13.6, s: ps.swing, behind: false };
    case 'back': return { hx: sh[0] - 8.6, hy: by + 11.4, s: ps.swing, behind: true };
    case 'forth': return { hx: sh[0] + 6.8, hy: by + 12.6, s: ps.swing, behind: false };
    case 'tuck': return { hx: sh[0] + 6.8, hy: by + 13.4, s: ps.swing, behind: false };
    case 'raise': return { hx: sh[0] + (ps.glow > 1 ? 5.6 : 5.0), hy: ps.glow > 1 ? Math.max(1.6, by - 0.4) : by + 1.6, s: 0.05, behind: false };
    default: return { hx: sh[0] + 4.6, hy: by + 17.6, s: ps.swing, behind: false };
  }
}

/** Where the side cape's trailing tip is (also bounds the figure). */
const capeTip = (ps: Pose): V => [CX - 7.2 - ps.flow * 9.6, 33.4 - ps.flow * 8.6 + Math.sin(ps.wave) * ps.flow * 1.4];

function capeSide(g: Ctx, ps: Pose, by: number, sh: V) {
  const fl = ps.flow, w = ps.wave;
  const N0: V = [sh[0] + 0.6, by + 9.6];
  const B: V = [sh[0] - 3.4, by + 10.8];
  const Hf: V = [CX + 1.2 - fl * 3.2, 34.8 - fl * 2.6 + ps.crouch * 0.3];
  const Hb = capeTip(ps);
  const p = new Path2D();
  p.moveTo(N0[0], N0[1]);
  p.bezierCurveTo(B[0] - 1.2, B[1] - 0.6, B[0] - 2.4 - fl * 3, lerp(B[1], Hb[1], 0.45) - fl * 2 + Math.sin(w + 1) * fl * 0.8, Hb[0] + 0.4, Hb[1] - 0.6);
  // Hem from the trailing tip to the front edge, tatters pointing away from the cape.
  let dx = Hf[0] - Hb[0], dy = Hf[1] - Hb[1];
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  let n: V = [-dy, dx];
  if (n[1] < 0) n = [dy, -dx];
  p.lineTo(Hb[0], Hb[1]);
  const tips = raggedHem(p, Hb, Hf, n, 6, 1.9 + fl * 0.4, w, 7);
  p.bezierCurveTo(Hf[0] + 1.4, lerp(Hf[1], N0[1], 0.4), sh[0] + 2.6, by + 14, sh[0] + 2.2, by + 10.4);
  p.closePath();
  toneFill(g, p, CLOAK, Hb[0], N0[1] - 2, Hf[0] + 2, Hf[1] + 2);
  g.save();
  g.clip(p);
  g.fillStyle = lin(g, N0[0], N0[1], lerp(Hb[0], Hf[0], 0.5), Math.max(Hb[1], Hf[1]), [[0, css(CLOAK.d, 0)], [1, css(CLOAK.d, 0.5)]]);
  g.fillRect(0, 0, KEEPER_W, KEEPER_H);
  if (fl > 0.15) {
    // The lining shows along the hem where the cape lifts and turns.
    const inner: Pts = [], outer: Pts = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(Hb[0], Hf[0], t), y = lerp(Hb[1], Hf[1], t);
      const k = (1.2 + fl * 2.6) * (0.6 + 0.4 * Math.sin(w + t * 5)) * (1 - t * 0.55);
      outer.push(x + n[0] * 3, y + n[1] * 3);
      inner.push(x - n[0] * k, y - n[1] * k);
    }
    const lp: Pts = [...inner];
    for (let i = outer.length - 2; i >= 0; i -= 2) lp.push(outer[i], outer[i + 1]);
    g.fillStyle = lin(g, Hb[0], Hb[1], Hf[0], Hf[1], [[0, css(LINING.l)], [0.5, css(LINING.m)], [1, css(LINING.d)]]);
    g.fill(poly(lp));
    stroke(g, inner, 0.4, css(K.trim, 0.45));
  }
  // Folds running from the shoulders into the tatters.
  tips.forEach((t, i) => {
    if (i === tips.length - 1) return;
    const u = 0.15 + (i / tips.length) * 0.8;
    const x0 = lerp(B[0], N0[0], u), y0 = lerp(B[1], N0[1], u) + 1.2;
    const bow = Math.sin(w + i * 1.3) * fl * 1.4;
    crease(g, bez(x0, y0, lerp(x0, t[0], 0.35) - fl * 1.5, lerp(y0, t[1], 0.35) + bow, lerp(x0, t[0], 0.7) + bow * 0.5, lerp(y0, t[1], 0.7) - bow, t[0] - n[0] * 0.6, t[1] - n[1] * 0.6, 8), 1.0, CLOAK, 0.55, 0.32);
  });
  // Trim along the trailing edge.
  g.lineWidth = 0.8; g.strokeStyle = css(K.trim, 0.45); g.stroke(p);
  g.restore();
}

function torsoSide(g: Ctx, by: number, sh: V, hip: V) {
  const t = blob([
    sh[0] - 2.7, by + 10.6, sh[0] + 1.4, by + 10.1, sh[0] + 3.0, by + 12.2, sh[0] + 2.8 + (hip[0] - sh[0]) * 0.3, by + 15.2,
    hip[0] + 2.4, by + 18.6, hip[0] + 2.5, by + 20.8, hip[0] - 2.4, by + 20.8, hip[0] - 2.7, by + 17.2, sh[0] - 3.1 + (hip[0] - sh[0]) * 0.35, by + 13.6,
  ]);
  occlude(g, t, 0.3, 0.6, 0.45);
  toneFill(g, t, JERKIN, sh[0] - 3, by + 10, hip[0] + 3, by + 21);
  g.save(); g.clip(t);
  g.fillStyle = lin(g, 0, by + 10, 0, by + 14, [[0, css(0x000000, 0.5)], [1, css(0x000000, 0)]]);
  g.fillRect(0, by + 9, KEEPER_W, 6);
  g.lineWidth = 0.3; g.strokeStyle = css(JERKIN.d, 0.85);
  g.beginPath(); g.moveTo(sh[0] + 0.4, by + 11.5); g.quadraticCurveTo(lerp(sh[0], hip[0], 0.5) + 0.6, by + 15, hip[0] + 0.6, by + 18.6); g.stroke();
  g.restore();
  // Bandolier across the chest.
  limb(g, [sh[0] - 1.2, by + 10.6, lerp(sh[0], hip[0], 0.5) + 0.8, by + 14.6, hip[0] + 2.3, by + 18.4], [1.15, 1.15, 1.1], STRAP, 0.4);
  stud(g, lerp(sh[0], hip[0], 0.5) + 0.8, by + 14.6, 0.3);
  // Belt and buckle.
  const belt = blob([hip[0] - 2.6, by + 18.5, hip[0] + 2.6, by + 18.3, hip[0] + 2.65, by + 19.8, hip[0] - 2.65, by + 20.0]);
  toneFill(g, belt, STRAP, hip[0] - 2.6, by + 18.2, hip[0] + 2.6, by + 20);
  const bk = blob([hip[0] + 1.5, by + 18.0, hip[0] + 2.7, by + 18.0, hip[0] + 2.7, by + 20.1, hip[0] + 1.5, by + 20.1]);
  g.fillStyle = lin(g, hip[0] + 1.5, by + 18, hip[0] + 2.7, by + 20, [[0, css(K.brassH)], [0.4, css(K.brass)], [1, css(K.brassD)]]);
  g.fill(bk);
  // Pouch at the back hip.
  const pp = blob([hip[0] - 3.4, by + 19.4, hip[0] - 1.6, by + 19.3, hip[0] - 1.5, by + 21.8, hip[0] - 3.2, by + 21.9]);
  occlude(g, pp, 0.3, 0.5, 0.5);
  toneFill(g, pp, STRAP, hip[0] - 3.4, by + 19.2, hip[0] - 1.5, by + 21.9);
  toneFill(g, blob([hip[0] - 3.5, by + 19.2, hip[0] - 1.5, by + 19.1, hip[0] - 1.6, by + 20.3, hip[0] - 3.4, by + 20.4]), LEATHER, hip[0] - 3.4, by + 19.1, hip[0] - 1.5, by + 20.4, 0.6);
  stud(g, hip[0] - 2.5, by + 20.1, 0.22);
}

function skirtSide(g: Ctx, ps: Pose, by: number, hip: V) {
  const wy = by + 19.9, fl = ps.flow, sw = ps.sway;
  // Tasset over the near hip.
  const ts = blob([hip[0] - 1.6, wy, hip[0] + 1.3, wy - 0.1, hip[0] + 1.5 + sw * 0.2, wy + 3.0, hip[0] - 1.2 + sw * 0.5, wy + 3.3]);
  occlude(g, ts, 0.3, 0.6, 0.5);
  toneFill(g, ts, LEATHER, hip[0] - 2, wy, hip[0] + 2, wy + 3.3, 0.6);
  g.lineWidth = 0.28; g.strokeStyle = css(LEATHER.d, 0.85);
  g.beginPath(); g.moveTo(hip[0] - 1.4, wy + 1.6); g.lineTo(hip[0] + 1.4 + sw * 0.15, wy + 1.5); g.stroke();
  // Tabard flap at the front, swept back by speed.
  const x0 = hip[0] + 0.9, x1 = hip[0] + 2.7;
  const bx = sw * 1.2 - fl * 1.4, byy = -fl * 1.2;
  const tp = new Path2D();
  tp.moveTo(x0, wy - 0.2); tp.lineTo(x1, wy - 0.2);
  tp.quadraticCurveTo(x1 + 0.2 + bx * 0.3, wy + 3.0, x1 + bx, wy + 5.4 + byy);
  raggedHem(tp, [x1 + bx, wy + 5.4 + byy], [x0 + bx * 1.1, wy + 5.2 + byy * 1.3], [0.2, 1], 2, 0.5, ps.wave, 4);
  tp.quadraticCurveTo(x0 + bx * 0.3, wy + 2.8, x0, wy - 0.2);
  occlude(g, tp, 0.3, 0.5, 0.5);
  toneFill(g, tp, far(CLOTH, 0.25), x0, wy, x1, wy + 6, 0.5);
}

function mantleSide(g: Ctx, ps: Pose, by: number, sh: V) {
  const fl = ps.flow;
  const p = new Path2D();
  p.moveTo(sh[0] + 2.4, by + 9.2);
  p.bezierCurveTo(sh[0] + 3.8, by + 10.4, sh[0] + 4.0, by + 12.4, sh[0] + 3.4, by + 14.0);
  raggedHem(p, [sh[0] + 3.4, by + 14.0], [sh[0] - 4.6 - fl * 1.6, by + 13.4 - fl * 1.4], [-0.15, 1], 4, 0.9, ps.wave + 2, 13);
  p.bezierCurveTo(sh[0] - 5.0 - fl * 1.2, by + 11.6, sh[0] - 4.0, by + 9.6, sh[0] - 2.4, by + 9.0);
  p.closePath();
  occlude(g, p, 0.3, 0.7, 0.55);
  g.fillStyle = rad(g, sh[0] - 1.6, by + 9.2, 0.4, 7.5, [[0, css(CLOAK.h)], [0.3, css(CLOAK.l)], [0.7, css(CLOAK.m)], [1, css(CLOAK.d)]]);
  g.fill(p);
  g.save(); g.clip(p);
  g.fillStyle = lin(g, 0, by + 10.5, 0, by + 14.5, [[0, css(CLOAK.d, 0)], [1, css(CLOAK.d, 0.5)]]);
  g.fillRect(0, by + 8, KEEPER_W, 8);
  for (const x of [-3, 0, 2.4]) crease(g, [sh[0] + x * 0.8, by + 10.2, sh[0] + x - fl * 0.8, by + 13.8], 0.7, CLOAK, 0.5, 0.25);
  g.lineWidth = 0.7; g.strokeStyle = css(K.trim, 0.55); g.stroke(p);
  g.restore();
}

function hoodSide(g: Ctx, ps: Pose, hx: number, by: number) {
  inHood(g, hx, by, () => hoodSideAt(g, ps, hx, by));
}
function hoodSideAt(g: Ctx, ps: Pose, hx: number, by: number) {
  const tip = ps.flow;
  const p = new Path2D();
  p.moveTo(hx + 3.6, by + 9.8);
  p.bezierCurveTo(hx + 5.0, by + 6.6, hx + 4.8, by + 1.8, hx + 1.0, by + 0.3);
  p.bezierCurveTo(hx - 1.4, by - 0.5, hx - 3.6, by + 0.2, hx - 5.4 - tip * 1.2, by + 1.2 + tip * 0.5);
  p.quadraticCurveTo(hx - 4.5, by + 3.2, hx - 4.8, by + 5.6);
  p.bezierCurveTo(hx - 5.2, by + 8.2, hx - 3.6, by + 10.4, hx - 1.0, by + 10.5);
  p.lineTo(hx + 1.8, by + 10.6);
  p.closePath();
  occlude(g, p, 0.3, 0.7, 0.55);
  g.fillStyle = rad(g, hx - 1.8, by + 1.6, 0.4, 10, [[0, css(HOOD.h)], [0.28, css(HOOD.l)], [0.62, css(HOOD.m)], [1, css(HOOD.d)]]);
  g.fill(p);
  g.save(); g.clip(p);
  crease(g, bez(hx - 0.2, by + 0.8, hx - 2.4, by + 2.6, hx - 3, by + 6, hx - 2.2, by + 10.2, 8), 0.8, HOOD, 0.55, 0.35);
  crease(g, bez(hx - 3.6, by + 1.4, hx - 4, by + 3.6, hx - 4, by + 6.5, hx - 3.4, by + 9.6, 6), 0.6, HOOD, 0.4, 0.25);
  // Face opening on the leading side: rolled lip, deep shadow, trim.
  const lip = new Path2D();
  lip.moveTo(hx + 1.0, by + 2.5);
  lip.bezierCurveTo(hx + 3.8, by + 2.2, hx + 4.9, by + 5.2, hx + 4.5, by + 8.6);
  lip.quadraticCurveTo(hx + 3.2, by + 9.9, hx + 1.4, by + 9.2);
  lip.bezierCurveTo(hx + 0.2, by + 7.2, hx + 0.1, by + 4.2, hx + 1.0, by + 2.5);
  g.fillStyle = lin(g, hx, by + 2.5, hx + 4, by + 9, [[0, css(HOOD.h)], [0.45, css(HOOD.l)], [1, css(HOOD.d)]]);
  g.fill(lip);
  const face = new Path2D();
  face.moveTo(hx + 1.7, by + 3.3);
  face.bezierCurveTo(hx + 3.9, by + 3.1, hx + 4.6, by + 5.6, hx + 4.4, by + 8.2);
  face.quadraticCurveTo(hx + 3.2, by + 9.0, hx + 2.0, by + 8.5);
  face.bezierCurveTo(hx + 1.1, by + 6.8, hx + 1.0, by + 4.6, hx + 1.7, by + 3.3);
  g.fillStyle = rad(g, hx + 3.4, by + 6, 0.3, 3.6, [[0, css(K.face)], [0.65, css(0x06070e)], [1, css(K.faceRim)]]);
  g.fill(face);
  g.lineWidth = 0.32; g.strokeStyle = css(K.trim, 0.7); g.stroke(lip);
  g.restore();
}

/** Side view, facing right: the whole figure, back to front. */
function drawSide(g: Ctx, ps: Pose, rig: Rig) {
  const by = rig.by, L = ps.lean;
  const sh: V = [CX + L * 0.85, by + 11.2];
  const hip: V = [CX - 0.3 + L * 0.15, by + 20.6];
  const hx = CX + L + 0.3;
  const lh = rig.lantern;
  // Far arm swinging behind the body.
  const fr = ps.free;
  arm(g, [sh[0] - 0.8, sh[1] + 0.4], [sh[0] + fr * 3.6 + 0.4, by + 19.2 - Math.abs(fr) * 1.6], fr > 0 ? 1 : -1, 0.35);
  capeSide(g, ps, by, sh);
  if (lh.behind) arm(g, [sh[0] - 0.2, sh[1] + 0.6], [lh.hx, lh.hy], -1);
  const footAngle = (lift: number, x: number) => (lift > 0.3 ? (x < 0 ? 0.55 : -0.12) : 0);
  legSide(g, [hip[0] - 0.6, hip[1]], [CX + ps.fX, FY - 2.05 - ps.fL], footAngle(ps.fL, ps.fX), false);
  torsoSide(g, by, sh, hip);
  legSide(g, [hip[0] + 0.4, hip[1] + 0.2], [CX + ps.nX, FY - 2.05 - ps.nL], footAngle(ps.nL, ps.nX), true);
  skirtSide(g, ps, by, hip);
  if (!lh.behind) arm(g, [sh[0] + 0.3, sh[1] + 0.6], [lh.hx, lh.hy], lh.hx > sh[0] ? 1 : -1);
  mantleSide(g, ps, by, sh);
  hoodSide(g, ps, hx, by);
}

// ---- dead ---------------------------------------------------------------------------------------

/** The fall, in four frames: kneel on one knee, slump, collapse, still. Returns the eyes and lantern. */
function deadRig(f: number): Rig {
  const by = TOP + [7.4, 11.6, 26.5, 29.5][f];
  // Eyes inside the bowed hood (the hood is drawn at by + lift with a tilt and a bow, see drawDead).
  const bowed = (lift: number, tilt: number, bow: number, a: number) => [-1.05, 1.05].map((dx) => {
    const q = hoodPt(CX + tilt, by + lift, CX + tilt + dx, by + lift + bow * 0.8 + 6.4 + bow * 0.3);
    return { x: q[0], y: q[1], r: 0.44 * HS, a };
  });
  const eyes = f === 0 ? bowed(0.4, -0.3, 1, 0.8) : f === 1 ? bowed(1.0, -0.6, 2, 0.5) : f === 2 ? [{ x: CX - 10.2, y: FY - 3.4, r: 0.38, a: 0.3 }] : [];
  const lan: Hand = f < 2 ? { hx: CX + 8.6, hy: FY - 9.15 - CHAIN, s: 0, behind: false }
    : { hx: CX + 11.4, hy: FY - 9.15 - CHAIN, s: 0, behind: false };
  return { by, lantern: lan, eyes };
}

function drawDead(g: Ctx, f: number, rig: Rig) {
  const by = rig.by;
  if (f < 2) {
    const ps: Pose = { bob: 0, crouch: 0, lean: 0, nX: 0, nL: 0, fX: 0, fL: 0, flow: 0, wave: f, billow: 1.6 + f * 0.8, arm: 'hang', swing: 0, free: 0, glow: 0, sway: 0 };
    // Cape pooled on the ground around the kneeling figure.
    const p = new Path2D();
    const w = 10.5 + f * 1.2;
    p.moveTo(CX - 5, by + 10);
    p.bezierCurveTo(CX - 8, by + 12, CX - w, FY - 6, CX - w - 0.6, FY - 0.6);
    raggedHem(p, [CX - w - 0.6, FY - 0.6], [CX + w - 1, FY - 0.6], [0, 1], 8, 0.9, f, 21);
    p.bezierCurveTo(CX + w - 2, FY - 6, CX + 8, by + 12, CX + 5, by + 10);
    p.closePath();
    toneFill(g, p, CLOAK, CX - w, by + 8, CX + w, FY);
    g.save(); g.clip(p);
    g.fillStyle = lin(g, 0, by + 12, 0, FY, [[0, css(CLOAK.d, 0)], [1, css(CLOAK.d, 0.6)]]);
    g.fillRect(0, 0, KEEPER_W, KEEPER_H);
    for (const x of [-7, -3.5, 3, 6.5]) crease(g, bez(CX + x * 0.5, by + 12, CX + x * 0.7, by + 18, CX + x * 1.1, FY - 6, CX + x * 1.35, FY - 1, 6), 1.0, CLOAK, 0.55, 0.3);
    g.lineWidth = 0.7; g.strokeStyle = css(K.trim, 0.45); g.stroke(p);
    g.restore();
    const hipY = by + 20.4;
    if (f === 0) {
      // Right knee up, left knee on the ground.
      legFront(g, [CX + 1.8, hipY], [CX + 3.4, FY - 2.2], 3.2, true);
      legFront(g, [CX - 1.8, hipY], [CX - 2.8, FY - 3.4], 0, false, 0.2);
    } else {
      for (const s of [-1, 1]) {
        const kn = blob([CX + s * 0.6, hipY - 0.6, CX + s * 4.0, hipY, CX + s * 4.4, FY - 1.0, CX + s * 1.2, FY - 0.6]);
        toneFill(g, kn, BREECH, CX - 4, hipY, CX + 4, FY);
      }
    }
    torsoFront(g, by);
    skirtFront(g, ps, by);
    capePanels(g, ps, by, -1);
    capePanels(g, ps, by, 1);
    const shY = by + 11.6;
    arm(g, [CX + 4.0, shY], [rig.lantern.hx, rig.lantern.hy + (f === 0 ? 0 : 1.6)], -1);
    mantleFront(g, ps, by, false);
    hoodFront(g, by + (f ? 1.0 : 0.4), f ? -0.6 : -0.3, 1 + f);
    if (f === 0) glove(g, CX - 2.6, by + 20.6, 1.15);
    return;
  }
  // Fallen on the side, curled toward the lantern: the cape spilled on the ground behind, the body a
  // mound under it (shoulder, hip, bent knees), boots at the right, the hood resting at the left.
  const flat = f === 3 ? 1 : 0;
  const spill = new Path2D();
  spill.moveTo(CX + 8.4, FY - 1.6);
  spill.bezierCurveTo(CX + 9.4, FY - 5, CX + 6, FY - 9.6 - flat, CX + 1, FY - 10.2 - flat);
  raggedHem(spill, [CX + 1, FY - 10.2 - flat], [CX - 9.6, FY - 7.8 - flat * 0.6], [0.2, -1], 4, 0.6, f * 2, 33);
  spill.bezierCurveTo(CX - 13.5, FY - 6.4, CX - 14.4, FY - 2, CX - 13.4, FY - 0.6);
  spill.lineTo(CX + 8.4, FY - 1.6);
  spill.closePath();
  occlude(g, spill, 0.3, 0.6, 0.5);
  toneFill(g, spill, far(CLOAK, 0.15), CX - 12, FY - 10.5, CX + 8, FY);
  g.save(); g.clip(spill);
  for (const x of [-9, -4, 1.5, 6]) crease(g, bez(CX + x * 0.6, FY - 3, CX + x * 0.8, FY - 5, CX + x * 1.05, FY - 7, CX + x * 1.15, FY - 9.5, 5), 0.8, CLOAK, 0.5, 0.25);
  // A turned-up corner shows the wine lining.
  const corner = blob([CX - 10.4, FY - 7.6, CX - 7.6, FY - 8.4, CX - 6.8, FY - 6.6, CX - 9.6, FY - 5.8]);
  g.fillStyle = lin(g, CX - 10, FY - 8.4, CX - 7, FY - 5.8, [[0, css(LINING.l)], [1, css(LINING.d)]]);
  g.fill(corner);
  g.lineWidth = 0.7; g.strokeStyle = css(K.trim, 0.45); g.stroke(spill);
  g.restore();
  // Boots.
  bootSide(g, CX + 5.2, FY - 3.0 + flat * 0.4, -0.15 + flat * 0.1, BOOT);
  bootSide(g, CX + 3.8, FY - 1.9, 0.12, far(BOOT, 0.3));
  // The body under the cape.
  const k = 1 - flat * 0.25;
  const mound = blob([
    CX - 9.6, FY - 0.6, CX - 9.2, FY - 5.0 * k, CX - 6.4, FY - 7.6 * k, CX - 2.8, FY - 6.4 * k, CX + 1.0, FY - 8.0 * k,
    CX + 4.2, FY - 6.4 * k, CX + 5.6, FY - 3.6 * k, CX + 4.8, FY - 0.6, CX - 1, FY + 0.2,
  ]);
  occlude(g, mound, 0.3, 0.6, 0.5);
  toneFill(g, mound, CLOAK, CX - 9, FY - 8.5, CX + 8, FY);
  g.save(); g.clip(mound);
  g.fillStyle = lin(g, 0, FY - 8, 0, FY, [[0, css(CLOAK.d, 0)], [1, css(CLOAK.d, 0.6)]]);
  g.fillRect(0, 0, KEEPER_W, KEEPER_H);
  for (const [x0, x1] of [[-6, -7.4], [-2.8, -2.4], [1.0, 2.0], [3.8, 4.8]]) crease(g, bez(CX + x0, FY - 7 * k, CX + x0 + 0.3, FY - 5, CX + x1 - 0.3, FY - 3, CX + x1, FY - 0.6, 6), 0.9, CLOAK, 0.55, 0.3);
  g.lineWidth = 0.7; g.strokeStyle = css(K.trim, 0.45); g.stroke(mound);
  g.restore();
  // An arm reaching along the ground toward the lantern.
  arm(g, [CX - 3.6, FY - 4.8 * k], [CX + 6.6 - flat * 1.4, FY - 1.3], -1);
  // The hood resting on the ground, the face turned to us.
  const hx = CX - 10.4, hy = FY - 4.6 + flat * 0.6;
  const hp = blob([hx - 3.6, hy + 3.8, hx - 4.2, hy + 0.2, hx - 1.4, hy - 3.0, hx + 2.6, hy - 2.8, hx + 4.4, hy + 0.6, hx + 3.4, hy + 3.9]);
  occlude(g, hp, 0.3, 0.6, 0.5);
  g.fillStyle = rad(g, hx - 1.5, hy - 1.8, 0.3, 7, [[0, css(HOOD.h)], [0.3, css(HOOD.l)], [0.7, css(HOOD.m)], [1, css(HOOD.d)]]);
  g.fill(hp);
  const fc = blob([hx - 2.3, hy + 2.8, hx - 1.9, hy - 0.2, hx + 1.0, hy - 0.8, hx + 2.2, hy + 1.6, hx + 1.0, hy + 3.4]);
  g.fillStyle = rad(g, hx - 0.2, hy + 1.4, 0.2, 3, [[0, css(K.face)], [1, css(K.faceRim)]]);
  g.fill(fc);
  g.lineWidth = 0.3; g.strokeStyle = css(K.trim, 0.6); g.stroke(fc);
}

// ---- assembly -------------------------------------------------------------------------------------

function eyesOn(c: Ctx, eyes: Rig['eyes'], hot: number, emissive: boolean) {
  for (const ey of eyes) {
    if (emissive) {
      glow(c, ey.x, ey.y, 2.0 + hot * 0.6, K.amber, 0.75 * ey.a, 0.25);
      c.beginPath(); c.ellipse(ey.x, ey.y, ey.r, ey.r * 0.66, 0, 0, TAU);
      c.fillStyle = css(K.eyeHot, ey.a); c.fill();
    } else {
      c.beginPath(); c.ellipse(ey.x, ey.y, ey.r * 1.25, ey.r * 0.85, 0, 0, TAU);
      c.fillStyle = css(K.amberD, 0.45 * ey.a); c.fill();
      c.beginPath(); c.ellipse(ey.x, ey.y, ey.r, ey.r * 0.66, 0, 0, TAU);
      c.fillStyle = css(hot > 0 ? K.eyeHot : K.eye, ey.a); c.fill();
    }
  }
}

interface Box { x: number; y: number; w: number; h: number }
/** Whole-unit box around [x0, x1] x [y0, y1], clamped to the frame. */
function boxOf(x0: number, y0: number, x1: number, y1: number): Box {
  const a = Math.max(0, Math.floor(x0)), b = Math.max(0, Math.floor(y0));
  const c = Math.min(KEEPER_W, Math.ceil(x1)), d = Math.min(KEEPER_H, Math.ceil(y1));
  return { x: a, y: b, w: Math.max(1, c - a), h: Math.max(1, d - b) };
}

/**
 * Warm light from the lantern on the finished body (a layer B.w x B.h placed at B): a wash over the cloth
 * near it, then a warm rim on the edges that face it (the silhouette minus itself shifted away from the
 * lantern), fading with distance.
 */
function warmth(f: Ctx, B: Box, lx: number, ly: number, k: number, cx: number, cy: number) {
  const x = lx - B.x, y = ly - B.y;
  f.save();
  f.globalCompositeOperation = 'source-atop';
  f.fillStyle = rad(f, x, y, 0.5, 12 + k * 3, [[0, css(0xffb060, 0.12 + k * 0.05)], [0.45, css(0xff9a40, 0.06)], [1, css(0xff8a30, 0)]]);
  f.fillRect(0, 0, B.w, B.h);
  f.restore();
  const L = layer(B.w, B.h, scaleOf(f));
  L.g.drawImage(f.canvas, 0, 0, B.w, B.h);
  L.g.globalCompositeOperation = 'source-in';
  L.g.fillStyle = rad(L.g, x, y, 0, 12 + k * 3, [[0, css(0xffd890)], [0.45, css(0xffa850, 0.6)], [1, css(0xff8a30, 0)]]);
  L.g.fillRect(0, 0, B.w, B.h);
  L.g.globalCompositeOperation = 'destination-out';
  let ux = lx - cx, uy = ly - cy;
  const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  L.g.drawImage(f.canvas, -ux * 0.45, -uy * 0.45, B.w, B.h);
  f.save();
  f.globalCompositeOperation = 'source-atop';
  f.globalAlpha = 0.6;
  f.drawImage(L.c, 0, 0, B.w, B.h);
  f.restore();
}

export function drawKeeper(dir: Dir, anim: KeeperAnim, f: number): KeeperFrame {
  const ps = pose(anim, f, dir);
  const by = TOP + ps.bob + ps.crouch;
  let rig: Rig;
  let box: Box;
  if (anim === 'dead') {
    rig = deadRig(f);
    box = f < 2 ? boxOf(CX - 14, rig.by - 1.5, CX + 13, FY + 1.5) : boxOf(1, FY - 14, 34, FY + 1.5);
  } else if (dir === 'side') {
    const sh: V = [CX + ps.lean * 0.85, by + 11.2];
    const hx = CX + ps.lean + 0.3;
    const lh = handSide(ps, sh, by);
    const e0 = hoodPt(hx, by, hx + 2.85, by + 5.75), e1 = hoodPt(hx, by, hx + 4.05, by + 5.55);
    rig = { by, lantern: lh, eyes: [{ x: e0[0], y: e0[1], r: 0.5 * HS, a: 1 }, { x: e1[0], y: e1[1], r: 0.32 * HS, a: 0.7 }] };
    const tip = capeTip(ps);
    box = boxOf(Math.min(tip[0] - 3, lh.hx - 3, CX + ps.fX - 3, CX - 9), Math.min(by - 1.5, lh.hy - 3), Math.max(hx + 7, lh.hx + 3, CX + ps.nX + 5.5, CX + ps.fX + 5.5), FY + 1.5);
  } else {
    const sgn = dir === 'up' ? -1 : 1;
    const tilt = ps.arm === 'back' ? 0.3 : ps.arm === 'forth' ? -0.3 : 0;
    const lh = handFront(ps, by, sgn);
    const eye = (dx: number) => { const q = hoodPt(CX + tilt, by, CX + tilt + dx, by + 6.2); return { x: q[0], y: q[1], r: 0.5 * HS, a: 1 }; };
    rig = { by, lantern: lh, eyes: dir === 'up' ? [] : [eye(-1.1), eye(1.1)] };
    const wd = 11 + ps.billow * 1.8;
    box = boxOf(Math.min(CX - wd, lh.hx - 3), Math.min(by - 1.5, lh.hy - 3), Math.max(CX + wd, lh.hx + 3), FY + 1.5);
  }
  const lh = rig.lantern;
  const lit = anim === 'dead' ? (f === 3 ? 0 : 0.75 - f * 0.2) : 1;
  const [gx, gy] = glassAt(lh.hx, lh.hy, lh.s);
  // Centre of the body, for the direction of the lantern's rim light.
  const bcx = CX, bcy = anim === 'dead' ? FY - 6 : by + 16;
  const B = box;
  const paint: Painter = (g, e) => {
    if (live(g)) {
      // figure() draws its rim and shade bands through these same contexts: leave the transform as found.
      const body = (b: Ctx) => {
        b.save();
        b.translate(-B.x, -B.y);
        if (anim === 'dead') drawDead(b, f, rig);
        else if (dir === 'side') drawSide(b, ps, rig);
        else drawFront(b, ps, dir, rig);
        b.restore();
      };
      const post = (b: Ctx) => {
        b.save();
        b.globalCompositeOperation = 'source-atop';
        grain(b, 0, 0, B.w, B.h, { fine: 0.05, coarse: 0.07, seed: 23, fineScale: 9, coarseScale: 26 });
        b.restore();
        if (lit) warmth(b, B, gx, gy, ps.glow, bcx, bcy);
      };
      if (lh.behind) lanternBody(g, lh.hx, lh.hy, lh.s, lit);
      g.save();
      g.translate(B.x, B.y);
      figure(g, B.w, B.h, body, { ink: K.ink, inkW: 0.55, rim: K.rim, rimW: 0.5, rimA: 0.72, shadeW: 0.9, shadeA: 0.3, post });
      g.restore();
      eyesOn(g, rig.eyes, ps.glow, false);
      if (!lh.behind) lanternBody(g, lh.hx, lh.hy, lh.s, lit, anim !== 'dead' || f < 2);
      if (ps.glow) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + ps.glow;
          const r = 5 + ps.glow * 1.5;
          g.beginPath(); g.arc(gx + Math.cos(a) * r, gy + Math.sin(a) * r, 0.45, 0, TAU); g.fillStyle = css(0xfff1c8); g.fill();
        }
      }
    }
    if (live(e)) {
      lanternGlow(e, lh.hx, lh.hy, lh.s, lit, ps.glow);
      eyesOn(e, rig.eyes, ps.glow, true);
      if (ps.glow) {
        // The sunburst gathering: sparks of light around the raised lantern.
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + ps.glow;
          const r = 5 + ps.glow * 1.5;
          glow(e, gx + Math.cos(a) * r, gy + Math.sin(a) * r, 1.6, 0xffe2a0, 0.9, 0.4);
        }
      }
    }
  };
  return { paint, lx: gx - CX, ly: gy - FY };
}
