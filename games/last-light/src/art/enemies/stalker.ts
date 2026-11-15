// Hollow Stalker: a lanky, hunched shadow creature as tall as the keeper. Long digitigrade legs, long
// clawed arms that hang to the ground, a narrow eyeless-looking skull thrust forward with two cyan eyes,
// and a mane of glowing cyan tendrils streaming back from the head. The elite is plum-tinted with bone
// spines down its back, and everything that glows turns magenta. Faces right (the view mirrors it).
//
// Each frame is a vector painter: the body is one figure() (ink outline, moonlight rim, lower-right
// shade), with bones laid out by two-joint IK from a pose, and every limb a smooth tube shaded in soft
// bands from the upper left. Glowing parts (mane, eyes, spine nodes, veins) are drawn solid on the body
// layer and again with halos on the emissive layer; the body's silhouette masks the strands behind it.
import { makeCanvas, noisePattern, noiseTexture, bez, css, glow, layer, lin, mix, rad, scaleOf, shade, figure, taper, TAU, type Ctx } from '../paint';
import type { Painter, SpriteSet } from '../sprite';

const W = 60, H = 50, FOOT = 47;
const INK = 0x06070d;
const RIM = 0x8fa4dc;
const CLAW = 0xc9d3ea, CLAW_D = 0x6d7690;
const BONE = 0xd6cdb5, BONE_D = 0x8a8068;

interface Tone { d: number; m: number; l: number; h: number }
interface Glow { c: number; l: number; w: number; d: number }
const CYAN: Glow = { c: 0x62e6d6, l: 0xc4fff5, w: 0xeffffc, d: 0x1b6f6c };
const MAGENTA: Glow = { c: 0xe04bb0, l: 0xff9be0, w: 0xffe3f6, d: 0x7a1f62 };
const SKIN: Tone = { d: 0x0b0e1a, m: 0x1d2440, l: 0x313c62, h: 0x5a6a9e };
const SKIN_E: Tone = { d: 0x120a17, m: 0x2c1734, l: 0x4a2752, h: 0x84508e };

type V = [number, number];
type Pts = number[];

/** Skip the scratch context the atlas hands in for the layer a pass does not use. */
const live = (c: Ctx) => c.canvas.width > 8 && c.canvas.height > 8;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const far = (t: Tone, k: number): Tone => ({ d: shade(t.d, -k * 0.5), m: shade(t.m, -k), l: shade(t.l, -k), h: shade(t.h, -k * 1.1) });

// ---- geometry helpers -----------------------------------------------------------------------------

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

/** A smooth tube (limb, tendon, tendril) along pts with a width per control point, round at both ends. */
function tube(pts: Pts, ws: number[], seg = 5): Path2D {
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

const shift = (pts: Pts, dx: number, dy: number) => pts.map((v, i) => v + (i % 2 ? dy : dx));

function occlude(f: Ctx, path: Path2D, blur: number, ox: number, oy: number, a: number) {
  // Cheap soft contact shadow (no shadowBlur): an offset fill plus a feathering stroke, only over paint.
  f.save();
  f.globalCompositeOperation = 'source-atop';
  f.translate(ox, oy);
  f.fillStyle = `rgba(3,3,9,${(a * 0.5).toFixed(3)})`;
  f.fill(path);
  f.lineWidth = blur;
  f.strokeStyle = `rgba(3,3,9,${(a * 0.28).toFixed(3)})`;
  f.stroke(path);
  f.restore();
}

function soft(f: Ctx, path: Path2D, color: number, a: number, blur: number) {
  // A fill feathered by a wide translucent stroke (no shadowBlur: painting must stay fast).
  f.save();
  f.fillStyle = f.strokeStyle = css(color);
  f.globalAlpha = a * 0.35;
  f.lineWidth = blur * 1.3;
  f.stroke(path);
  f.globalAlpha = a;
  f.fill(path);
  f.restore();
}

/** A shaded limb: dark base, then mid, light and highlight bands shifted toward the moonlight. */
function limb(f: Ctx, pts: Pts, ws: number[], t: Tone, occ = 0.55, hi = 1) {
  // One gradient across the limb (lit edge toward the upper-left moon, dark edge away) and a thin
  // specular streak inside it: smooth form with no clip, cheap enough for every limb of every frame.
  const path = tube(pts, ws, 4);
  if (occ > 0) occlude(f, path, 1.4, 0.5, 0.75, occ);
  const n = pts.length / 2;
  const x0 = pts[0], y0 = pts[1], x1 = pts[(n - 1) * 2], y1 = pts[(n - 1) * 2 + 1];
  let dx = x1 - x0, dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  let nx = dy, ny = -dx;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const hw = Math.max(...ws) / 2;
  const mx = (x0 + x1) / 2 + (n > 2 ? (pts[Math.floor(n / 2) * 2] - (x0 + x1) / 2) * 0.5 : 0);
  const my = (y0 + y1) / 2 + (n > 2 ? (pts[Math.floor(n / 2) * 2 + 1] - (y0 + y1) / 2) * 0.5 : 0);
  f.fillStyle = lin(f, mx + nx * hw, my + ny * hw, mx - nx * hw, my - ny * hw, [
    [0, css(mix(t.l, t.h, 0.35 * hi))], [0.22, css(t.l)], [0.5, css(t.m)], [0.82, css(t.d)], [1, css(shade(t.d, -0.25))],
  ]);
  f.fill(path);
  if (hi > 0.8) {
    const k = Math.min(...ws);
    taper(f, shift(pts, nx * k * 0.28, ny * k * 0.28), k * 0.2, k * 0.12, css(t.h, 0.45 * hi));
  }
  return path;
}

/** A small part (finger, toe, palm): base and one lit band, no clip or contact shadow. */
function digit(f: Ctx, pts: Pts, ws: number[], t: Tone) {
  f.fillStyle = css(t.m);
  f.fill(tube(pts, ws, 3));
  f.fillStyle = css(t.l, 0.8);
  f.fill(tube(shift(pts, -0.18, -0.22), ws.map((v) => v * 0.45), 3));
}

/** A curved claw: a tapered hook from its root along angle a, curling by `curl`. */
function claw(f: Ctx, x: number, y: number, a: number, len: number, wid: number, curl: number, c: number, cd: number) {
  const pts: Pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, aa = a + curl * t * t;
    const px = i === 0 ? x : pts[pts.length - 2] + Math.cos(aa) * (len / 6);
    const py = i === 0 ? y : pts[pts.length - 1] + Math.sin(aa) * (len / 6);
    pts.push(px, py);
  }
  taper(f, pts, wid, 0.08, css(cd));
  taper(f, shift(pts, -0.12, -0.14).slice(0, 10), wid * 0.45, 0.1, css(c, 0.95));
}

/** Painterly mottling: coarse noise overlaid on the finished body only (used in figure's post pass). */
function mottle(f: Ctx, seed: number, a: number, scale = 26) {
  const d = scaleOf(f), cw = f.canvas.width, ch = f.canvas.height;
  const t = makeCanvas(cw, ch), tg = t.getContext('2d')!;
  tg.setTransform(d, 0, 0, d, 0, 0);
  tg.fillStyle = noisePattern(tg, noiseTexture(128, 4, seed, 4, 1.3), scale);
  tg.fillRect(0, 0, cw / d, ch / d);
  tg.setTransform(1, 0, 0, 1, 0, 0);
  tg.globalCompositeOperation = 'destination-in';
  tg.drawImage(f.canvas, 0, 0);
  f.save();
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalCompositeOperation = 'overlay';
  f.globalAlpha = a;
  f.drawImage(t, 0, 0);
  f.restore();
}

interface Box { x: number; y: number; w: number; h: number }
/** Whole-unit bounding box of points (flat x,y list), padded and clamped to the frame. */
function boxOf(pts: number[], pad: number): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
  }
  x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad));
  x1 = Math.min(W, Math.ceil(x1 + pad)); y1 = Math.min(H, Math.ceil(y1 + pad));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
/** Run a frame-space painter inside a layer that covers only box b (figure() costs scale with area). */
const inBox = (b: Box, fn: (f: Ctx) => void) => (f: Ctx) => { f.save(); f.translate(-b.x, -b.y); fn(f); f.restore(); };

// ---- pose -----------------------------------------------------------------------------------------

interface Pose {
  hip: V; sh: V;
  arch: number;           // hump of the back
  pitch: number;          // head pitch (rad, + = nose down)
  neck: number;           // neck length
  jaw: number;            // 0 shut .. 1 wide open
  footN: V; footF: V;     // balls of the feet
  metaN: number; metaF: number; // metatarsal angle (rad): -1.9 planted upright, -2.4 trailing
  toeN: number; toeF: number;   // toe angle (0 flat forward, + down)
  handN: V; handF: V;     // wrist targets
  fingN: number; fingF: number; // finger direction
  spread: number;         // finger splay 0..1
  mane: number;           // wave phase
  flare: number;          // mane raised and fanned (threat display)
  droop: number;          // mane falling limp
  stream: number;         // mane streaming straight back (speed)
  glow: number;           // 0 calm, 1 windup, 2 peak
  dim: number;            // 0..1 dimmer (recover)
  elite: boolean;
}

interface Strand { pts: Pts; w0: number; w1: number; front: boolean; a: number }

function pose(p: Partial<Pose> & { elite: boolean }): Pose {
  return {
    hip: [23, 29], sh: [35.5, 20], arch: 0, pitch: 0.28, neck: 6, jaw: 0,
    footN: [27.5, 46.6], footF: [20, 46.3], metaN: -1.92, metaF: -1.98, toeN: 0.08, toeF: 0.06,
    handN: [44.5, 39], handF: [40.5, 38], fingN: 1.05, fingF: 1.15, spread: 0.6,
    mane: 0, flare: 0, droop: 0, stream: 0, glow: 0, dim: 0, ...p,
  };
}

// ---- the frame ------------------------------------------------------------------------------------

function frame(o: Pose): Painter {
  const el = o.elite;
  const GL = el ? MAGENTA : CYAN;
  const skin = el ? SKIN_E : SKIN;
  const skinF = far(skin, 0.42);
  const [hx, hy] = o.hip, [sx, sy] = o.sh;

  // Head placement: the neck carries the skull forward and a little up from the shoulders.
  const nA = Math.atan2(sy - hy, sx - hx) * 0.35 - 0.05 + o.pitch * 0.4;
  const hdX = sx + Math.cos(nA) * o.neck + 1, hdY = sy + Math.sin(nA) * o.neck - 1.6;
  const ca = Math.cos(o.pitch), sa = Math.sin(o.pitch);
  /** Head-local (u forward, v down) to world. */
  const hp = (u: number, v: number): V => [hdX + u * ca - v * sa, hdY + u * sa + v * ca];
  const hpts = (l: number[]) => { const out: Pts = []; for (let i = 0; i < l.length; i += 2) out.push(...hp(l[i], l[i + 1])); return out; };

  // Legs and arms by IK.
  const legBones = (foot: V, meta: number, dx: number) => {
    const hip: V = [hx + dx, hy + 0.5];
    const hock: V = [foot[0] + Math.cos(meta) * 6.2, foot[1] + Math.sin(meta) * 6.2];
    const { j: knee, e: hk } = ik(hip, hock, 9.2, 8.6, -1);
    return { hip, knee, hock: hk, ball: foot };
  };
  const legN = legBones(o.footN, o.metaN, 0.8), legF = legBones(o.footF, o.metaF, -1.2);
  const armBones = (hand: V, dx: number, dy: number) => {
    const s: V = [sx + dx, sy + dy];
    const { j: elbow, e: wrist } = ik(s, hand, 9.6, 10.2, 1);
    return { s, elbow, wrist };
  };
  const armN = armBones(o.handN, 0.4, 1.2), armF = armBones(o.handF, -1.6, 0.6);

  // Mane strands, streaming back from the crown.
  const lock = (i: number, n: number, lenK: number, ph: number): Pts => {
    const t = i / (n - 1);
    const root = hp(lerp(3.4, -2.8, t), lerp(-5.1, -2.0, t * t));
    let x = root[0], y = root[1];
    let a = Math.PI + 0.72 - t * 0.8 + o.flare * (0.6 - t * 0.3) - o.droop * 0.95 - o.stream * (0.45 - t * 0.5) + o.pitch * 0.5;
    const len = (14 + ((i * 7) % 5) * 2.2 + (i % 2 ? 3 : 0)) * lenK * (1 + o.flare * 0.15 - o.droop * 0.2 + o.stream * 0.12);
    const steps = 14, st = len / steps;
    const pts: Pts = [x, y];
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      a += Math.sin(o.mane + ph + i * 1.9 + k * 0.55) * (0.11 + f * 0.1) * (1 - o.stream * 0.6);
      // Gravity bends each strand toward hanging straight down (never past it).
      a += (Math.PI / 2 - a) * (0.022 + o.droop * 0.1) * (1 - o.flare * 0.6) * (1 - o.stream * 0.7) * (f + 0.3) * 2;
      x += Math.cos(a) * st; y += Math.sin(a) * st;
      pts.push(x, Math.min(y, FOOT - 1.5));
    }
    return pts;
  };
  const strands: Strand[] = [];
  const N = 13;
  for (let i = 0; i < N; i++) {
    strands.push({ pts: lock(i, N, 1, 0), w0: 1.15 - (i / N) * 0.3 + (i % 3 === 0 ? 0.25 : 0), w1: 0.1, front: i % 2 === 1, a: i % 3 === 1 ? 0.55 : i % 3 === 2 ? 0.8 : 1 });
  }
  // Dark locks of shadow hair under the glowing strands (part of the body silhouette).
  const darkLocks: Pts[] = [];
  for (let i = 0; i < 5; i++) darkLocks.push(lock(i * 1.5 + 0.4, 7.4, 0.72, 2.3));

  const hot = o.glow > 0 ? (o.glow > 1 ? 1 : 0.6) : 0;
  const strandStyle = (c: Ctx, s: Strand, k: number) => {
    const n = s.pts.length;
    return lin(c, s.pts[0], s.pts[1], s.pts[n - 2], s.pts[n - 1], [
      [0, css(mix(GL.c, GL.l, 0.45 + hot * 0.4), k * s.a)],
      [0.18, css(mix(GL.c, GL.l, 0.2 + hot * 0.4), k * s.a)],
      [0.6, css(GL.c, k * s.a * 0.85)],
      [1, css(GL.d, 0)],
    ]);
  };
  const drawStrand = (c: Ctx, s: Strand, k: number) => taper(c, s.pts, s.w0, s.w1, strandStyle(c, s, k));
  /** Emissive strand: a wide faint halo under the bright core (cheaper than shadowBlur). */
  const glowStrand = (c: Ctx, s: Strand, k: number) => {
    taper(c, s.pts, s.w0 * 3.8 + hot, s.w1 * 3, strandStyle(c, s, k * 0.3));
    taper(c, s.pts, s.w0 * 2.0, s.w1 * 1.5, strandStyle(c, s, k * 0.45));
    drawStrand(c, s, k);
  };

  // Spine nodes (glowing vertebrae) along the back, and veins down the forearms.
  const spinePt = (t: number): V => {
    const dx = sx - hx, dy = sy - hy, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, Dx = uy, Dy = -ux;
    const s = 3.4 + Math.sin(t * Math.PI) * (2.2 + o.arch);
    return [hx + ux * l * t + Dx * s, hy + uy * l * t + Dy * s];
  };

  // ---- body (one figure) -----------------------------------------------------------------------
  const body = (f: Ctx) => {
    // Far leg and arm, in shade.
    drawLeg(f, legF, skinF, o.toeF, false);
    drawArm(f, armF, skinF, o.fingF, o.spread * 0.8, false);
    drawTorso(f);
    drawLeg(f, legN, skin, o.toeN, true);
    drawHead(f);
    drawArm(f, armN, skin, o.fingN, o.spread, true);
  };

  const drawLeg = (f: Ctx, L: ReturnType<typeof legBones>, t: Tone, toe: number, near: boolean) => {
    const { hip, knee, hock, ball } = L;
    const occ = near ? 0.6 : 0;
    // Toes: three long clawed digits fanning forward along the ground.
    for (let i = 2; i >= 0; i--) {
      const a = toe + (i - 1) * 0.28 - (near ? 0 : 0.1);
      const len = 3.2 - Math.abs(i - 1) * 0.5;
      const tx = ball[0] + Math.cos(a) * len, ty = ball[1] + Math.sin(a) * len * 0.5;
      digit(f, [ball[0], ball[1], tx, ty], [1.3, 0.8], i === 1 ? t : far(t, 0.25));
      claw(f, tx - 0.2, ty - 0.2, a + 0.3, 1.8, 0.75, 1.0, near ? CLAW : CLAW_D, near ? CLAW_D : shade(CLAW_D, -0.4));
    }
    // Metatarsal, shin (lean, with a calf), thigh (heavy hamstring).
    limb(f, [hock[0], hock[1], lerp(hock[0], ball[0], 0.5), lerp(hock[1], ball[1], 0.5), ball[0], ball[1]], [2.1, 1.6, 1.35], t, occ);
    const sm: V = [lerp(knee[0], hock[0], 0.4) - 0.5, lerp(knee[1], hock[1], 0.4)];
    limb(f, [knee[0], knee[1], sm[0], sm[1], hock[0], hock[1]], [2.7, 2.8, 1.7], t, occ);
    // Hock spur.
    claw(f, hock[0] - 0.3, hock[1] - 0.2, Math.atan2(hock[1] - knee[1], hock[0] - knee[0]) + 0.5, 1.8, 0.9, 0.6, t.l, t.d);
    const tm: V = [lerp(hip[0], knee[0], 0.45) - 1.1, lerp(hip[1], knee[1], 0.45) + 0.6];
    limb(f, [hip[0], hip[1], tm[0], tm[1], knee[0], knee[1]], [4.5, 4.3, 2.6], t, occ);
    // Kneecap knob and a sinew line down the shin.
    const kc = new Path2D(); kc.ellipse(knee[0] + 0.3, knee[1] - 0.2, 1.5, 1.3, 0, 0, TAU);
    soft(f, kc, t.l, 0.7, 0.4);
    f.save(); f.globalAlpha = 0.55; f.strokeStyle = css(t.d); f.lineWidth = 0.35;
    f.beginPath(); f.moveTo(knee[0] + 0.6, knee[1] + 0.8); f.quadraticCurveTo(sm[0] + 0.9, sm[1], hock[0] + 0.5, hock[1] - 0.6); f.stroke();
    f.restore();
  };

  const drawArm = (f: Ctx, A: ReturnType<typeof armBones>, t: Tone, fing: number, spread: number, near: boolean) => {
    const { s, elbow, wrist } = A;
    const occ = near ? 0.65 : 0;
    // Upper arm (stringy bicep), forearm (wiry, heavier near the elbow).
    const um: V = [lerp(s[0], elbow[0], 0.5) + 0.3, lerp(s[1], elbow[1], 0.5)];
    limb(f, [s[0], s[1], um[0], um[1], elbow[0], elbow[1]], [4.4, 3.3, 2.3], t, occ);
    const fm: V = [lerp(elbow[0], wrist[0], 0.35), lerp(elbow[1], wrist[1], 0.35)];
    limb(f, [elbow[0], elbow[1], fm[0], fm[1], wrist[0], wrist[1]], [2.5, 2.6, 1.5], t, occ);
    // Elite: a bone spur off the back of the elbow, along the forearm's line.
    if (el) {
      const ea = Math.atan2(elbow[1] - wrist[1], elbow[0] - wrist[0]);
      claw(f, elbow[0], elbow[1], ea - 0.35, 2.8, 1.2, -0.4, BONE, BONE_D);
    }
    // Hand: a narrow palm and three long hooked fingers plus a thumb.
    const pa = fing;
    const palm: V = [wrist[0] + Math.cos(pa) * 1.8, wrist[1] + Math.sin(pa) * 1.8];
    digit(f, [wrist[0], wrist[1], palm[0], palm[1]], [1.7, 1.9], t);
    for (let i = 3; i >= 0; i--) {
      const thumb = i === 3;
      const a = thumb ? pa - 0.9 - spread * 0.3 : pa + (i - 1) * (0.22 + spread * 0.25);
      const l1 = thumb ? 1.6 : 2.5 - Math.abs(i - 1) * 0.3, l2 = thumb ? 0 : 2.1;
      const j: V = [palm[0] + Math.cos(a) * l1, palm[1] + Math.sin(a) * l1];
      const b = a + 0.35;
      const tip: V = l2 ? [j[0] + Math.cos(b) * l2, j[1] + Math.sin(b) * l2] : j;
      digit(f, l2 ? [palm[0], palm[1], j[0], j[1], tip[0], tip[1]] : [palm[0], palm[1], j[0], j[1]], l2 ? [0.95, 0.75, 0.6] : [0.9, 0.6], i === 1 ? t : far(t, 0.2));
      claw(f, tip[0], tip[1], b + 0.15, thumb ? 1.4 : 2.3, 0.62, 0.9, near ? CLAW : CLAW_D, near ? CLAW_D : shade(CLAW_D, -0.4));
    }
  };

  const drawTorso = (f: Ctx) => {
    const dx = sx - hx, dy = sy - hy, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, Dx = uy, Dy = -ux;
    const pt = (t: number, s: number): number[] => [hx + ux * l * t + Dx * s, hy + uy * l * t + Dy * s];
    const ar = o.arch;
    const outline = [
      ...pt(-0.16, 0.6), ...pt(0.08, 3.4 + ar * 0.5), ...pt(0.42, 5.4 + ar), ...pt(0.78, 4.6 + ar * 0.6), ...pt(1.06, 2.6),
      ...pt(1.14, -1.2), ...pt(1.0, -4.0), ...pt(0.76, -4.9), ...pt(0.5, -3.4), ...pt(0.28, -2.3), ...pt(0.06, -3.0), ...pt(-0.12, -1.6),
    ];
    const path = blob(outline);
    occlude(f, path, 1.6, 0.6, 0.8, 0.55);
    const [ax, ay] = pt(0.5, 6.2), [bx, by] = pt(0.5, -5.2);
    f.fillStyle = lin(f, ax, ay, bx, by, [[0, css(skin.l)], [0.35, css(skin.m)], [0.8, css(skin.d)], [1, css(shade(skin.d, -0.3))]]);
    f.fill(path);
    f.save();
    f.clip(path);
    // Dorsal light along the spine.
    const sp: Pts = [];
    for (let i = 0; i <= 8; i++) { const t = -0.1 + i * 0.145; sp.push(...pt(t, 3.0 + Math.sin(clamp(t, 0, 1) * Math.PI) * (2.0 + ar))); }
    soft(f, tube(sp, [1.2, 2.0, 2.4, 2.4, 2.2, 2.0, 1.8, 1.4, 1.0]), skin.h, 0.45, 1.0);
    // Ribcage: curved ridges with dark grooves between them.
    for (let i = 0; i < 5; i++) {
      const t = 0.5 + i * 0.12;
      const [r0x, r0y] = pt(t + 0.03, 3.2 + ar * 0.5), [r1x, r1y] = pt(t - 0.05, -0.5), [r2x, r2y] = pt(t - 0.02, -3.6);
      f.lineWidth = 0.9; f.strokeStyle = css(skin.d, 0.75);
      f.beginPath(); f.moveTo(r0x + 0.3, r0y + 0.5); f.quadraticCurveTo(r1x + 0.4, r1y + 0.6, r2x + 0.3, r2y + 0.5); f.stroke();
      f.lineWidth = 0.55; f.strokeStyle = css(skin.l, 0.8);
      f.beginPath(); f.moveTo(r0x, r0y); f.quadraticCurveTo(r1x, r1y, r2x, r2y); f.stroke();
    }
    // Hollow belly and hip bone.
    const bel = new Path2D(); const [bx2, by2] = pt(0.25, -1.6); bel.ellipse(bx2, by2, 3.6, 2.2, Math.atan2(uy, ux), 0, TAU);
    soft(f, bel, skin.d, 0.6, 1.2);
    const hb = new Path2D(); const [px, py] = pt(0.02, 0.4); hb.ellipse(px, py, 2.6, 2.0, 0.4, 0, TAU);
    soft(f, hb, skin.l, 0.55, 0.8);
    f.restore();
    // Short back-swept spurs along the spine.
    if (!el) for (let i = 0; i < 6; i++) {
      const t = 0.1 + i * 0.15;
      const [vx, vy] = spinePt(t);
      claw(f, vx, vy + 0.5, Math.atan2(Dy, Dx) - 0.75, 1.4 + Math.sin(t * Math.PI) * 0.9, 1.1, -0.3, skin.l, skin.d);
    }
    // Elite: curved bone spines erupting from the back.
    if (el) {
      for (let i = 0; i < 5; i++) {
        const t = 0.1 + i * 0.19;
        const [bx3, by3] = spinePt(t);
        const a = Math.atan2(Dy, Dx) - 0.55 - i * 0.05;
        const len = 3.2 + Math.sin(t * Math.PI) * 3.2;
        claw(f, bx3, by3 + 0.4, a, len, 1.7, -0.5, BONE, BONE_D);
      }
    }
  };

  /** Dark locks of shadow hair under the glowing strands, drawn over the body with their own ink edge. */
  const drawLocks = (c: Ctx) => {
    darkLocks.forEach((pts, i) => {
      const path = tube(pts.slice(0, 22), [2.4, 2.0, 1.6, 1.2, 0.9, 0.6, 0.35, 0.3, 0.25, 0.2, 0.15], 3);
      c.lineWidth = 1.1;
      c.strokeStyle = css(INK);
      c.stroke(path);
      c.fillStyle = lin(c, pts[0], pts[1], pts[20], pts[21], [[0, css(skin.l)], [0.5, css(i % 2 ? skin.m : skin.d)], [1, css(skin.d)]]);
      c.fill(path);
      taper(c, shift(pts.slice(0, 14), -0.25, -0.3), 0.5, 0.15, css(el ? mix(RIM, GL.l, 0.25) : RIM, 0.55));
    });
  };

  const drawHead = (f: Ctx) => {
    // Neck: a sinewy column from the shoulders into the base of the skull.
    const n0: V = [sx + 0.4, sy - 1.4], n2 = hp(-0.6, 0.6);
    const n1: V = [lerp(n0[0], n2[0], 0.5) + 0.3, lerp(n0[1], n2[1], 0.5) - 0.6];
    limb(f, [n0[0], n0[1], n1[0], n1[1], n2[0], n2[1]], [5.2, 3.6, 3.4], skin, 0.5);
    // Lower jaw, hinged under the skull, opening downward.
    const ja = o.jaw * 0.55;
    const hinge = hp(1.6, 1.4);
    const jp = (u: number, v: number): V => {
      const cu = Math.cos(ja), su = Math.sin(ja);
      const du = u - 1.6, dv = v - 1.4;
      return hp(1.6 + du * cu - dv * su, 1.4 + du * su + dv * cu);
    };
    const jawPts: Pts = [...jp(0.6, 0.6), ...jp(5.5, 1.3), ...jp(10.4, 1.7), ...jp(10.6, 2.4), ...jp(6.0, 3.2), ...jp(1.4, 3.0)];
    if (o.jaw > 0.05) {
      // Mouth interior with a cold glow, and teeth.
      const m = blob([...hp(1.8, 1.5), ...hp(11.6, 1.2), ...jp(10.6, 2.0), ...jp(4.0, 2.2)]);
      f.fillStyle = css(mix(INK, GL.d, 0.5)); f.fill(m);
      f.save(); f.clip(m);
      f.fillStyle = rad(f, ...hp(6, 1.8), 0, 5, [[0, css(GL.c, 0.9)], [1, css(GL.d, 0)]]); f.fillRect(hdX - 8, hdY - 8, 26, 22);
      f.restore();
      for (let i = 0; i < 5; i++) {
        const u = 4.2 + i * 1.5;
        const [a1, b1] = hp(u, 1.4), [a2, b2] = hp(u + 0.7, 1.4), [a3, b3] = hp(u + 0.3, 2.6 + o.jaw * 0.6);
        f.fillStyle = css(BONE); f.beginPath(); f.moveTo(a1, b1); f.lineTo(a2, b2); f.lineTo(a3, b3); f.closePath(); f.fill();
        const [c1, d1] = jp(u + 0.2, 1.9), [c2, d2] = jp(u + 0.9, 1.9), [c3, d3] = jp(u + 0.5, 0.9);
        f.fillStyle = css(BONE_D); f.beginPath(); f.moveTo(c1, d1); f.lineTo(c2, d2); f.lineTo(c3, d3); f.closePath(); f.fill();
      }
    }
    const jaw = blob(jawPts);
    occlude(f, jaw, 1, 0.3, 0.5, 0.4);
    f.fillStyle = lin(f, ...hinge, ...jp(9, 3), [[0, css(skin.m)], [1, css(skin.d)]]);
    f.fill(jaw);
    if (o.jaw <= 0.05) {
      // Mouth shut: fangs overlap the lip line.
      for (const [u, l] of [[10.4, 1.3], [8.6, 1.0], [6.9, 0.8]] as [number, number][]) {
        const [a1, b1] = hp(u - 0.35, 1.2), [a2, b2] = hp(u + 0.35, 1.2), [a3, b3] = hp(u + 0.1, 1.2 + l);
        f.fillStyle = css(BONE_D); f.beginPath(); f.moveTo(a1, b1); f.lineTo(a2, b2); f.lineTo(a3, b3); f.closePath(); f.fill();
        f.fillStyle = css(BONE, 0.8); f.beginPath(); f.moveTo(a1, b1); f.lineTo(a1 + (a2 - a1) * 0.45, b1 + (b2 - b1) * 0.45); f.lineTo(a3, b3); f.closePath(); f.fill();
      }
    }
    // Skull: high crested cranium, long tapering muzzle.
    const skull = blob(hpts([
      -3.0, -1.2, -2.6, -3.8, -0.6, -5.4, 2.6, -5.6, 5.6, -4.4, 8.2, -2.7, 10.6, -1.3, 12.6, 0.1, 12.3, 1.1,
      9.6, 1.5, 6.0, 1.8, 3.0, 2.5, 0.0, 2.2, -2.0, 1.0,
    ]));
    occlude(f, skull, 1.4, 0.5, 0.7, 0.5);
    const [gx0, gy0] = hp(1, -5.5), [gx1, gy1] = hp(5, 2.5);
    f.fillStyle = lin(f, gx0, gy0, gx1, gy1, [[0, css(skin.h)], [0.3, css(skin.l)], [0.65, css(skin.m)], [1, css(skin.d)]]);
    f.fill(skull);
    f.save();
    f.clip(skull);
    // Brow ridge shadow over a deep eye socket, cheekbone light, cranial grooves.
    const sock = new Path2D(); const [ex, ey] = hp(7.3, -1.2); sock.ellipse(ex, ey, 2.3, 1.35, o.pitch + 0.25, 0, TAU);
    soft(f, sock, INK, 0.85, 0.9);
    const cheek = tube(hpts([3.0, 0.4, 6.0, 0.2, 9.5, 0.4]), [0.9, 1.1, 0.5]);
    soft(f, cheek, skin.l, 0.6, 0.5);
    f.lineWidth = 0.4;
    for (const [v0, v1] of [[-4.6, -3.0], [-3.6, -1.8]]) {
      f.strokeStyle = css(skin.d, 0.7);
      f.beginPath(); f.moveTo(...hp(-1.8, v0 + 1.4)); f.quadraticCurveTo(...hp(2.6, v0 - 0.2), ...hp(7.2, v1)); f.stroke();
    }
    const gloss = new Path2D(); const [qx, qy] = hp(1.6, -4.3); gloss.ellipse(qx, qy, 2.6, 0.9, o.pitch - 0.15, 0, TAU);
    soft(f, gloss, shade(skin.h, 0.25), 0.55, 0.6);
    f.restore();
    if (el) {
      // Bone crown: two back-swept horns over the crest.
      for (const [u, v, a, l] of [[0.6, -5.2, -2.55, 4.6], [3.2, -5.4, -2.2, 3.4]]) {
        const [bx, by] = hp(u, v);
        claw(f, bx, by, a + o.pitch, l, 1.3, 0.6, BONE, BONE_D);
      }
    }
  };

  // ---- painter ---------------------------------------------------------------------------------
  /** Generous bounds of everything inside the body figure (bones, claws, skull, dark locks, spines). */
  const bodyBox = () => {
    const pts: number[] = [];
    for (const L of [legN, legF]) pts.push(...L.hip, ...L.knee, ...L.hock, ...L.ball, L.ball[0] + 5.5, L.ball[1]);
    for (const [A, fa] of [[armN, o.fingN], [armF, o.fingF]] as [typeof armN, number][]) {
      pts.push(...A.s, ...A.elbow, ...A.wrist);
      for (let i = -1; i <= 1; i++) pts.push(A.wrist[0] + Math.cos(fa + i * 0.9) * 7.5, A.wrist[1] + Math.sin(fa + i * 0.9) * 7.5);
    }
    pts.push(...hp(-3.5, -6), ...hp(13, -6), ...hp(13, 4 + o.jaw * 3), ...hp(-3.5, 3));
    if (el) pts.push(...hp(-5, -9));
    for (let t = -0.2; t <= 1.21; t += 0.2) { const [x, y] = spinePt(t); pts.push(x, y, x - (el ? 7 : 3), y - (el ? 7 : 3)); }
    pts.push(hx - 4, hy + 3, sx + 2, sy + 5.5);
    return boxOf(pts, 3);
  };
  let cache: { c: HTMLCanvasElement; d: number } | null = null;
  const B = bodyBox();
  /** The body figure at density d (or, as a mask for the emissive pass, at whatever density is cached). */
  const bodyCanvas = (d: number, mask = false) => {
    if (cache && (mask || cache.d === d)) return cache.c;
    const L = layer(B.w, B.h, d);
    figure(L.g, B.w, B.h, inBox(B, body), {
      ink: INK, inkW: 0.6, rim: el ? mix(RIM, GL.l, 0.25) : RIM, rimW: 0.5, rimA: 0.68, shadeW: 0.9, shadeA: 0.4,
      post: inBox(B, (f) => {
        mottle(f, 11, 0.45);
        // Cold light from the mane spilling onto the shoulders and skull.
        f.save();
        f.globalCompositeOperation = 'source-atop';
        const [mx, my] = hp(-2, -3);
        f.fillStyle = rad(f, mx, my, 0, 13, [[0, css(GL.c, (0.3 + hot * 0.15) * (1 - o.dim * 0.5))], [1, css(GL.c, 0)]]);
        f.fillRect(0, 0, W, H);
        f.restore();
      }),
    });
    cache = { c: L.c, d };
    return L.c;
  };

  const spineNodes = (c: Ctx, emissive: boolean) => {
    const k = (1 - o.dim * 0.6);
    for (let i = 0; i < 5; i++) {
      const [vx, vy] = spinePt(0.2 + i * 0.15);
      if (emissive) glow(c, vx, vy - 0.2, 2.2 + hot, GL.c, 0.55 * k);
      c.fillStyle = css(emissive ? GL.l : mix(GL.c, GL.l, hot), k);
      c.beginPath(); c.ellipse(vx, vy - 0.2, 0.45, 0.35, 0, 0, TAU); c.fill();
    }
  };
  const veins = (c: Ctx, emissive: boolean) => {
    // A thin seam of light down the back of the near forearm and up the neck.
    const { elbow, wrist } = armN;
    const k = (0.85 + hot * 0.15) * (1 - o.dim * 0.6);
    c.save();
    const mx = lerp(elbow[0], wrist[0], 0.45), my = lerp(elbow[1], wrist[1], 0.45);
    const nx = (wrist[1] - elbow[1]), ny = -(wrist[0] - elbow[0]), nl = Math.hypot(nx, ny) || 1;
    const vein = bez(elbow[0] + nx / nl * 0.7, elbow[1] + ny / nl * 0.7, mx + nx / nl * 1.1, my + ny / nl * 1.1, mx + nx / nl * 0.4, my + ny / nl * 0.4, wrist[0] + nx / nl * 0.2, wrist[1] + ny / nl * 0.2, 10);
    if (emissive) taper(c, vein, 1.4, 0.3, lin(c, vein[0], vein[1], vein[20], vein[21], [[0, css(GL.c, 0)], [0.25, css(GL.c, 0.3 * k)], [1, css(GL.c, 0)]]));
    taper(c, vein, 0.42, 0.08, lin(c, vein[0], vein[1], vein[20], vein[21], [[0, css(GL.c, 0)], [0.25, css(emissive ? GL.c : GL.l, k)], [1, css(GL.c, 0)]]));
    c.restore();
  };
  const eyes = (c: Ctx, emissive: boolean) => {
    const k = 1 - o.dim * 0.45;
    const [ex, ey] = hp(7.6, -1.25), [fx, fy] = hp(10.0, -1.05);
    if (emissive) {
      glow(c, ex, ey, 5.2 + hot * 2.5, GL.c, k);
      glow(c, fx, fy, 3.0 + hot * 1.5, GL.c, 0.7 * k);
    }
    const almond = (x: number, y: number, rx: number, ry: number, col: number, a: number) => {
      c.save(); c.translate(x, y); c.rotate(o.pitch + 0.22);
      c.fillStyle = css(col, a);
      c.beginPath(); c.moveTo(-rx, 0); c.quadraticCurveTo(0, -ry * 2, rx, 0); c.quadraticCurveTo(0, ry * 1.4, -rx, 0); c.fill();
      c.restore();
    };
    almond(ex, ey, 1.45, 0.62, GL.c, k);
    almond(ex + 0.15, ey - 0.05, 0.85, 0.36, GL.w, k);
    almond(fx, fy, 0.75, 0.35, GL.c, 0.85 * k);
    almond(fx, fy, 0.38, 0.18, GL.l, k);
  };

  return (g: Ctx, e: Ctx) => {
    const back = strands.filter((s) => !s.front), front = strands.filter((s) => s.front);
    const k = 1 - o.dim * 0.4;
    if (live(g)) {
      // Back strands behind the body, the body, then the strands and lights in front.
      for (const s of back) drawStrand(g, s, 0.9 * k);
      g.drawImage(bodyCanvas(scaleOf(g)), B.x, B.y, B.w, B.h);
      drawLocks(g);
      spineNodes(g, false);
      veins(g, false);
      for (const s of front) drawStrand(g, s, k);
      eyes(g, false);
    }
    if (live(e)) {
      for (const s of back) glowStrand(e, s, 0.95 * k);
      // The body hides what passes behind it.
      e.save();
      e.globalCompositeOperation = 'destination-out';
      e.drawImage(bodyCanvas(scaleOf(e), true), B.x, B.y, B.w, B.h);
      e.restore();
      // Halo around the head and mane roots.
      const [mx, my] = hp(-1, -3.5);
      glow(e, mx, my, 9 + hot * 4, GL.c, (0.32 + hot * 0.2) * k);
      spineNodes(e, true);
      veins(e, true);
      for (const s of front) glowStrand(e, s, k);
      eyes(e, true);
      if (o.jaw > 0.3) glow(e, ...hp(8, 1.8), 3 + hot * 2, GL.c, 0.5);
      if (hot) {
        // Windup: the claws catch the light.
        const { wrist } = armN;
        glow(e, wrist[0] + Math.cos(o.fingN) * 4, wrist[1] + Math.sin(o.fingN) * 4, 3.5 + hot * 2, GL.c, 0.3 + hot * 0.25);
      }
    }
    if (live(e)) cache = null; // the body pass keeps it for the emissive pass that follows
  };
}

export function stalkerSprites(elite = false): SpriteSet {
  const idle: Painter[] = [];
  for (let i = 0; i < 4; i++) {
    const b = Math.sin((i / 4) * TAU) * 0.6; // breathing
    idle.push(frame(pose({
      elite, hip: [23, 27.4 + b * 0.4], sh: [35.5, 18.6 + b], arch: b * 0.4, pitch: 0.28 + b * 0.05,
      handN: [43.2, 37.6 + b * 0.3], handF: [39.6, 37.2 + b * 0.3], mane: i * 1.55,
    })));
  }
  const run: Painter[] = [];
  for (let i = 0; i < 6; i++) {
    const ph = (i / 6) * TAU;
    const bob = Math.abs(Math.sin(ph)) * -1.2 + 0.6;
    const foot = (p: number, back: number): [V, number, number] => {
      const lift = Math.max(0, Math.sin(p)) * 4.2;
      const x = 25 + Math.cos(p) * 7.5 - back;
      return [[x, 46.6 - lift], -1.92 - Math.max(0, Math.sin(p)) * 0.55 + Math.cos(p) * 0.15, 0.08 + Math.max(0, Math.sin(p)) * 0.7];
    };
    const [fN, mN, tN] = foot(ph, 0), [fF, mF, tF] = foot(ph + Math.PI, 1.5);
    const sw = Math.cos(ph + Math.PI);
    run.push(frame(pose({
      elite, hip: [24, 27 + bob], sh: [37.5, 20.2 + bob * 0.7], arch: 0.4, pitch: 0.18, neck: 6.5,
      footN: fN, footF: fF, metaN: mN, metaF: mF, toeN: tN, toeF: tF,
      handN: [44 + sw * 5, 37 - Math.max(0, sw) * 2.5], handF: [41 - sw * 5, 36.5 - Math.max(0, -sw) * 2.5],
      fingN: 0.9 + sw * 0.35, fingF: 0.9 - sw * 0.35, spread: 0.3,
      mane: i * 1.1, stream: 0.55,
    })));
  }
  return {
    w: W, h: H, footY: FOOT,
    anims: {
      idle, run,
      windup: [
        frame(pose({
          elite, hip: [22, 31.5], sh: [33, 23.5], arch: 1.4, pitch: -0.05, neck: 5.4, jaw: 0.45,
          footN: [29.5, 46.6], footF: [16.5, 46.3], metaN: -1.75, metaF: -2.05,
          handN: [44.5, 8.5], handF: [49, 30.5], fingN: -1.0, fingF: 0.3, spread: 1,
          mane: 0.4, flare: 0.8, glow: 1,
        })),
        frame(pose({
          elite, hip: [21.5, 32.5], sh: [32, 24.5], arch: 1.8, pitch: -0.12, neck: 5.2, jaw: 0.75,
          footN: [30, 46.6], footF: [15.5, 46.3], metaN: -1.7, metaF: -2.05,
          handN: [43.5, 6.0], handF: [50, 29.5], fingN: -1.2, fingF: 0.2, spread: 1,
          mane: 1.3, flare: 1.1, glow: 2,
        })),
      ],
      lunge: [frame(pose({
        elite, hip: [19, 31], sh: [33.5, 26], arch: -0.6, pitch: 0.02, neck: 7, jaw: 0.9,
        footN: [27, 46.6], footF: [6.5, 46.0], metaN: -1.85, metaF: -2.75, toeN: 0.1, toeF: 0.5,
        handN: [55.5, 35], handF: [53, 14.5], fingN: 0.3, fingF: -0.35, spread: 1,
        mane: 2, stream: 1.1, glow: 1,
      }))],
      recover: [frame(pose({
        elite, hip: [22, 31], sh: [33.5, 25.5], arch: 1.2, pitch: 0.5, neck: 5, jaw: 0.2,
        footN: [27, 46.6], footF: [18.5, 46.3], metaN: -1.8, metaF: -1.9,
        handN: [39.5, 43.5], handF: [36, 43], fingN: 0.6, fingF: 0.9, spread: 0.8,
        mane: 3, droop: 1, dim: 1,
      }))],
    },
  };
}
