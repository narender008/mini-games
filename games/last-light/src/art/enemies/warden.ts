// Gloom Warden (support): a floating robed figure in deep violet with a pale bone mask, a glowing magenta
// halo ring behind its head and a cyan ward orb held between bony hands (the same cyan as its shield
// tethers). No legs: the robe narrows to a point and frays into wisps. While channelling (windup) it
// raises the orb overhead and everything flares brighter. Faces right (the view mirrors it).
//
// Each frame is a vector painter: the body is one figure() (ink outline, moonlight rim, lower-right
// shade); the halo, orb, eyes and glyphs are drawn solid on the body layer and again with halos on the
// emissive layer, where the body's silhouette masks the part of the halo behind the head.
import { makeCanvas, noisePattern, noiseTexture, css, glow, layer, lin, mix, rad, scaleOf, figure, taper, TAU, type Ctx } from '../paint';
import type { Painter, SpriteSet } from '../sprite';

const W = 42, H = 58, FOOT = 54;
const INK = 0x07060f;
const RIM = mix(0x8fa4dc, 0xc3d0f2, 0.3);
const MAG = { c: 0xe04bb0, l: 0xff9be0, w: 0xffe3f6, d: 0x7a1f62 };
const CYAN = { c: 0x62e6d6, l: 0xc4fff5, w: 0xeffffc, d: 0x1b6f6c };
const ROBE = { d: 0x1c1638, m: 0x44378a, l: 0x6656b4, h: 0x9284da };
const LINING = 0x0e0a1c;
const BONE = { d: 0x6e6555, m: 0xa89e86, l: 0xd6cdb5, h: 0xf4efe0 };
const TRIM = { d: 0x5a5480, m: 0x9a92c4, l: 0xd0caf0 };

type V = [number, number];
type Pts = number[];

const live = (c: Ctx) => c.canvas.width > 8 && c.canvas.height > 8;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---- geometry helpers -----------------------------------------------------------------------------

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

/** A smooth tube along pts with a width per control point, round at both ends. */
function tube(pts: Pts, ws: number[], seg = 5): Path2D {
  const { p, w } = resample(pts, ws, seg);
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

/** A closed smooth shape through pts. */
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

function softLine(f: Ctx, pts: Pts, w: number, color: number, a: number, blur: number) {
  f.save();
  f.strokeStyle = css(color);
  f.beginPath();
  f.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length - 2; i += 4) f.quadraticCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
  f.globalAlpha = a * 0.35;
  f.lineWidth = w + blur * 1.3;
  f.stroke();
  f.globalAlpha = a;
  f.lineWidth = w;
  f.stroke();
  f.restore();
}

function star(c: Ctx, x: number, y: number, rx: number, ry: number, w: number, color: string, rot = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(rx, 0); c.quadraticCurveTo(w, w, 0, ry); c.quadraticCurveTo(-w, w, -rx, 0);
  c.quadraticCurveTo(-w, -w, 0, -ry); c.quadraticCurveTo(w, -w, rx, 0);
  c.fill();
  c.restore();
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
  bob: number;   // float height offset
  raise: number; // 0 orb held at the chest .. 1 raised overhead
  sway: number;  // robe tail sway (+ trails back)
  lean: number;  // upper body forward
  glow: number;  // 0 calm, 1 channel, 2 peak
  ph: number;    // wisp / mote phase
}

function frame(o: Pose): Painter {
  const cx = 20.5 + o.lean, top = 12 + o.bob;
  const s = o.sway;
  const r = o.raise;
  const hot = clamp(o.glow / 2, 0, 1);
  const head: V = [cx + 0.3, top + 3.6];
  const ring: V = [cx - 1.0, top + 3.2];
  const ringR = 8.2 + r * 2.4 + o.glow * 0.4;
  const orb: V = [lerp(cx + 5.2, cx + 4.6, r), lerp(top + 19.5, top - 3.4, r)];
  const orbR = 2.7 + o.glow * 0.45;

  // ---- body (one figure) -----------------------------------------------------------------------
  const body = (f: Ctx) => {
    drawRobe(f);
    drawCollar(f);
    drawSleeve(f, false);
    drawHead(f);
    drawSleeve(f, true);
    // The robe's point dissolves into the wisps (outline and all).
    f.save();
    f.globalCompositeOperation = 'destination-out';
    const ty = top + 33.5;
    f.fillStyle = lin(f, 0, ty, 0, ty + 7, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
    f.fillRect(0, ty, W, H - ty);
    f.restore();
  };

  const robePath = () => {
    // Broad at the shoulders and sleeves, narrowing to a point that trails back with the sway.
    return blob([
      cx - 7.6, top + 10.4, cx - 9.0, top + 15.5, cx - 8.4, top + 22, cx - 6.4 - s * 0.3, top + 28.5, cx - 3.6 - s * 0.9, top + 34,
      cx - 1.6 - s * 1.8, top + 38.5, cx - 0.2 - s * 2.2, top + 40.6,
      cx + 1.4 - s * 1.5, top + 37.4, cx + 3.6 - s * 0.8, top + 32.5, cx + 6.0 - s * 0.3, top + 26.5, cx + 7.8, top + 19.5, cx + 7.8, top + 13.4, cx + 6.4, top + 10.2,
      cx, top + 8.8,
    ]);
  };

  const wisps = (): { pts: Pts; w: number }[] => {
    const out: { pts: Pts; w: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const x0 = cx - 2.8 + t * 5.2 - s * (1.2 + t * 0.4), y0 = top + 33 + Math.sin(t * Math.PI) * 3.4;
      const len = 7 + ((i * 5) % 3) * 2.2 + (i === 2 ? 2 : 0);
      const pts: Pts = [x0, y0];
      let a = Math.PI / 2 + 0.25 + s * 0.22 - t * 0.3;
      let x = x0, y = y0;
      for (let k = 0; k < 6; k++) {
        a += Math.sin(o.ph + i * 1.9 + k * 0.9) * 0.28;
        x += Math.cos(a) * len / 6; y += Math.sin(a) * len / 6;
        pts.push(x, Math.min(y, FOOT + 2));
      }
      out.push({ pts, w: i === 2 ? 2.6 : 1.9 });
    }
    return out;
  };

  const drawWisps = (c: Ctx, emissive: boolean) => {
    // Ghostly wisps the robe frays into, fading to nothing; a faint magenta edge glows on them.
    for (const wv of wisps()) {
      const n = wv.pts.length;
      const st = emissive
        ? [[0, css(MAG.c, 0.0)], [0.25, css(MAG.c, 0.35 + hot * 0.2)], [1, css(MAG.d, 0)]] as [number, string][]
        : [[0, css(ROBE.m, 0.95)], [0.45, css(ROBE.d, 0.75)], [1, css(ROBE.d, 0)]] as [number, string][];
      taper(c, wv.pts, emissive ? wv.w * 0.45 : wv.w, 0.1, lin(c, wv.pts[0], wv.pts[1], wv.pts[n - 2], wv.pts[n - 1], st));
    }
  };

  const drawRobe = (f: Ctx) => {
    const path = robePath();
    f.fillStyle = lin(f, cx - 9, top + 10, cx + 8, top + 36, [[0, css(ROBE.l)], [0.35, css(ROBE.m)], [0.75, css(mix(ROBE.m, ROBE.d, 0.6))], [1, css(ROBE.d)]]);
    f.fill(path);
    f.save();
    f.clip(path);
    f.fillStyle = lin(f, 0, top + 24, 0, top + 40, [[0, css(ROBE.d, 0)], [1, css(ROBE.d, 0.8)]]);
    f.fillRect(cx - 12, top + 22, 24, 22);
    // Folds converging toward the tail.
    for (let i = 0; i < 5; i++) {
      const x0 = cx - 7 + i * 3.4;
      const tx = cx - 0.6 - s * 2 + (i - 2) * 0.6;
      softLine(f, [x0, top + 13, lerp(x0, tx, 0.45) + 0.4, top + 24, tx, top + 38], i === 1 ? 0.9 : 0.7, ROBE.d, 0.6, 0.7);
      if (i < 3) softLine(f, [x0 - 1.1, top + 14, lerp(x0, tx, 0.45) - 0.9, top + 24, tx - 0.8, top + 36], 0.6, ROBE.h, 0.35, 0.6);
    }
    // Front panel: a dark stole edged in pale trim, its glyphs glow (drawn later).
    const pl = new Path2D();
    pl.moveTo(cx + 1.4, top + 11.5); pl.lineTo(cx + 4.4, top + 11.5);
    pl.quadraticCurveTo(cx + 4.4 - s * 0.3, top + 24, cx + 2.2 - s * 1.2, top + 35.5);
    pl.lineTo(cx + 0.6 - s * 1.3, top + 34.5);
    pl.quadraticCurveTo(cx + 1.2 - s * 0.2, top + 22, cx + 1.4, top + 11.5);
    pl.closePath();
    f.fillStyle = lin(f, 0, top + 11, 0, top + 36, [[0, css(LINING)], [1, css(mix(LINING, ROBE.d, 0.4))]]);
    f.fill(pl);
    f.lineWidth = 0.4; f.strokeStyle = css(TRIM.d); f.stroke(pl);
    f.save(); f.translate(-0.12, -0.12); f.lineWidth = 0.18; f.strokeStyle = css(TRIM.l, 0.8); f.stroke(pl); f.restore();
    f.restore();
  };

  const drawCollar = (f: Ctx) => {
    // Stiff pointed collar wings rising behind the hood on both sides.
    for (const sg of [-1, 1]) {
      const bx = cx + sg * 4.6, by = top + 9.5;
      const wing = blob([bx - sg * 1.6, by + 1.2, bx + sg * 1.4, by - 0.4, bx + sg * 3.4, by - 4.2, bx + sg * 3.0, by - 8.6, bx + sg * 1.6, by - 5.0, bx - sg * 0.6, by - 2.4]);
      occlude(f, wing, 1.0, 0.3, 0.6, 0.4);
      f.fillStyle = lin(f, bx - 2, by - 8, bx + 2, by + 1, sg < 0 ? [[0, css(ROBE.h)], [0.5, css(ROBE.l)], [1, css(ROBE.m)]] : [[0, css(ROBE.l)], [0.5, css(ROBE.m)], [1, css(ROBE.d)]]);
      f.fill(wing);
      f.lineWidth = 0.5; f.strokeStyle = css(TRIM.d); f.stroke(wing);
      f.save(); f.translate(-0.1, -0.12); f.lineWidth = 0.18; f.strokeStyle = css(TRIM.l, 0.75); f.stroke(wing); f.restore();
    }
    // A high stiff collar and a short mantle over the shoulders, edged in pale trim.
    const m = blob([
      cx - 8.8, top + 14.2, cx - 7.6, top + 9.6, cx - 4.2, top + 7.8, cx + 4.6, top + 8.0, cx + 8.0, top + 9.8, cx + 8.9, top + 14.0,
      cx + 6.6, top + 15.6, cx + 3.4, top + 14.4, cx + 0.4, top + 16.0, cx - 2.8, top + 14.6, cx - 6.0, top + 16.0,
    ]);
    occlude(f, m, 1.4, 0.3, 1.0, 0.6);
    f.fillStyle = lin(f, cx - 8, top + 8, cx + 8, top + 16, [[0, css(ROBE.h)], [0.35, css(ROBE.l)], [0.8, css(ROBE.m)], [1, css(ROBE.d)]]);
    f.fill(m);
    f.save(); f.clip(m);
    for (const dx of [-5, -1.5, 2.5, 6]) softLine(f, [cx + dx * 0.7, top + 9, cx + dx * 0.9, top + 12, cx + dx, top + 15.5], 0.55, ROBE.d, 0.5, 0.4);
    f.lineWidth = 0.9; f.strokeStyle = css(TRIM.d); f.stroke(m);
    f.save(); f.translate(-0.15, -0.2); f.lineWidth = 0.3; f.strokeStyle = css(TRIM.l, 0.85); f.stroke(m); f.restore();
    f.restore();
    // Bone studs along the mantle's edge.
    for (const [x, y] of [[cx - 6.0, top + 15.2], [cx - 2.8, top + 14.0], [cx + 3.4, top + 13.8], [cx + 6.6, top + 15.0]] as V[]) {
      const b = new Path2D(); b.arc(x, y, 0.6, 0, TAU);
      f.fillStyle = rad(f, x - 0.2, y - 0.2, 0, 0.8, [[0, css(BONE.h)], [0.6, css(BONE.l)], [1, css(BONE.d)]]);
      f.fill(b);
    }
  };

  const drawHead = (f: Ctx) => {
    const [hx, hy] = head;
    // Hood: a deep cowl with a soft peak falling back.
    const hood = blob([
      hx - 5.6, hy + 5.6, hx - 6.2, hy + 0.8, hx - 5.2, hy - 3.6, hx - 3.4, hy - 6.0, hx - 1.6, hy - 7.4, hx + 0.6, hy - 6.4,
      hx + 3.6, hy - 5.0, hx + 5.6, hy - 1.8, hx + 6.2, hy + 2.6, hx + 5.0, hy + 6.2, hx, hy + 7.0,
    ]);
    occlude(f, hood, 1.4, 0.3, 0.8, 0.55);
    f.fillStyle = lin(f, hx - 6, hy - 7, hx + 5, hy + 6, [[0, css(ROBE.h)], [0.3, css(ROBE.l)], [0.75, css(ROBE.m)], [1, css(ROBE.d)]]);
    f.fill(hood);
    f.save(); f.clip(hood);
    softLine(f, [hx - 1.8, hy - 6.6, hx - 3.4, hy - 1.5, hx - 3.0, hy + 5.6], 0.8, ROBE.d, 0.55, 0.6);
    softLine(f, [hx - 3.0, hy - 6.0, hx - 4.8, hy - 1.0, hx - 4.6, hy + 4.6], 0.5, ROBE.h, 0.5, 0.5);
    // The hood's dark opening, ringed by its turned edge.
    const op = new Path2D(); op.ellipse(hx + 2.0, hy + 0.9, 3.9, 5.2, -0.08, 0, TAU);
    f.fillStyle = css(ROBE.l); f.fill(op);
    const oi = new Path2D(); oi.ellipse(hx + 2.5, hy + 1.1, 3.4, 4.7, -0.08, 0, TAU);
    f.fillStyle = css(LINING); f.fill(oi);
    f.restore();
    // The bone mask: a long angular face plate narrowing to a pointed chin, turned toward its facing.
    const mx = hx + 2.9, my = hy + 1.0;
    const mask = blob([
      mx - 2.3, my - 3.0, mx + 0.3, my - 4.4, mx + 2.8, my - 3.0, mx + 2.9, my - 0.4, mx + 2.1, my + 2.4, mx + 0.7, my + 5.0,
      mx - 0.6, my + 3.0, mx - 2.2, my + 0.6,
    ]);
    occlude(f, mask, 1.0, 0.3, 0.5, 0.6);
    f.fillStyle = lin(f, mx - 2.6, my - 4, mx + 2.8, my + 4.4, [[0, css(BONE.h)], [0.3, css(BONE.l)], [0.7, css(BONE.m)], [1, css(BONE.d)]]);
    f.fill(mask);
    f.save(); f.clip(mask);
    // Shadowed right half (the plate turns away from the moonlight), a central ridge, carved lines.
    const half = new Path2D(); half.moveTo(mx + 0.6, my - 5); half.quadraticCurveTo(mx + 1.0, my, mx + 0.8, my + 5.5); half.lineTo(mx + 4, my + 5.5); half.lineTo(mx + 4, my - 5); half.closePath();
    soft(f, half, BONE.d, 0.45, 0.6);
    softLine(f, [mx + 0.35, my - 4.2, mx + 0.75, my, mx + 0.65, my + 4.6], 0.35, BONE.h, 0.75, 0.15);
    // Slanted eye holes (inner corners low: a scowl).
    const hole = (x0: number, y0: number, x1: number, y1: number, d: number) => {
      const p = new Path2D();
      p.moveTo(x0, y0); p.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - d, x1, y1); p.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + d * 0.6, x0, y0); p.closePath();
      f.fillStyle = css(0x0c0814); f.fill(p);
    };
    hole(mx - 2.0, my - 1.6, mx + 0.1, my - 0.5, 0.9);
    hole(mx + 1.3, my - 0.5, mx + 2.7, my - 1.4, 0.7);
    // Mouth: a row of narrow vertical slits.
    f.strokeStyle = css(0x0c0814, 0.9); f.lineWidth = 0.28;
    for (let i = 0; i < 4; i++) {
      const x = mx - 0.6 + i * 0.75, y = my + 2.2 + Math.abs(i - 1.5) * -0.15;
      f.beginPath(); f.moveTo(x, y); f.lineTo(x + 0.05, y + 1.1 - Math.abs(i - 1.5) * 0.25); f.stroke();
    }
    // A crack from the brow.
    f.strokeStyle = css(BONE.d); f.lineWidth = 0.2;
    f.beginPath(); f.moveTo(mx - 1.2, my - 3.6); f.lineTo(mx - 1.4, my - 2.6); f.lineTo(mx - 0.9, my - 2.0); f.stroke();
    // Magenta war marks running down from the eyes.
    f.strokeStyle = css(MAG.d, 0.9); f.lineWidth = 0.32;
    f.beginPath(); f.moveTo(mx - 0.9, my - 0.4); f.lineTo(mx - 1.1, my + 2.0); f.stroke();
    f.beginPath(); f.moveTo(mx + 2.0, my - 0.6); f.lineTo(mx + 1.9, my + 1.4); f.stroke();
    f.restore();
  };

  const drawSleeve = (f: Ctx, near: boolean) => {
    // Wide sleeves: forward to the orb at the chest, or raised high when channelling.
    const sg = near ? 1 : -1;
    const sh: V = [cx + sg * 5.6 + (near ? 0 : 1.2), top + 11.5];
    const hand: V = [orb[0] + sg * (orbR * 0.75 + 0.4), orb[1] + orbR * 0.7 + 0.9];
    const el: V = [
      lerp(near ? cx + 9.0 : cx - 5.4, near ? cx + 10.8 : cx - 6.6, r),
      lerp(top + 20.5, near ? top + 4.8 : top + 1.6, r),
    ];
    const cuff: V = [lerp(el[0], hand[0], 0.6), lerp(el[1], hand[1], 0.6)];
    const ws = r > 0.5 ? [4.2, 4.0, 4.4] : [4.6, 5.0, 5.8];
    const p = tube([sh[0], sh[1], el[0], el[1], cuff[0], cuff[1]], ws, 5);
    if (near) occlude(f, p, 1.5, 0.4, 0.9, 0.6);
    const base = near ? ROBE : { d: mix(ROBE.d, INK, 0.3), m: mix(ROBE.m, ROBE.d, 0.5), l: ROBE.m, h: ROBE.l };
    // Bony forearm and hand reaching out of the cuff.
    const fa = tube([cuff[0], cuff[1], hand[0], hand[1]], [1.5, 1.1], 3);
    f.fillStyle = lin(f, cuff[0], cuff[1] - 1, hand[0], hand[1] + 1, [[0, css(near ? BONE.m : BONE.d)], [1, css(near ? BONE.l : BONE.m)]]);
    f.fill(fa);
    // Long fingers curling up around the orb's side.
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 - sg * (0.35 + i * 0.32);
      const k1 = 1.5, k2 = 1.4;
      const j: V = [hand[0] + Math.cos(a + sg * 0.5) * k1, hand[1] + Math.sin(a + sg * 0.5) * k1];
      const tip: V = [j[0] + Math.cos(a - sg * 0.3) * k2, j[1] + Math.sin(a - sg * 0.3) * k2];
      taper(f, [hand[0], hand[1], j[0], j[1], tip[0], tip[1]], 0.62, 0.3, css(near ? (i === 0 ? BONE.h : BONE.l) : BONE.m));
    }
    f.fillStyle = lin(f, sh[0] - 3, sh[1] - 2, cuff[0] + 2, cuff[1] + 3, [[0, css(base.l)], [0.45, css(base.m)], [1, css(base.d)]]);
    f.fill(p);
    f.save(); f.clip(p);
    softLine(f, [sh[0] - sg * 0.6, sh[1] + 1.0, el[0] - sg * 0.6, el[1] - 0.6, cuff[0] - 0.4, cuff[1] - 1.2], 0.7, base.h, near ? 0.55 : 0.35, 0.5);
    softLine(f, [sh[0] + sg * 1.6, sh[1] + 1.8, el[0] + sg * 1.2, el[1] + 0.8, cuff[0] + 0.6, cuff[1] + 1.2], 0.9, base.d, 0.6, 0.6);
    // Cuff: a dark opening ringed in pale trim.
    const ca = Math.atan2(hand[1] - el[1], hand[0] - el[0]);
    const co = new Path2D(); co.ellipse(cuff[0], cuff[1], 1.2, ws[2] * 0.5, ca, 0, TAU);
    f.fillStyle = css(TRIM.d); f.fill(co);
    const ci = new Path2D(); ci.ellipse(cuff[0] + Math.cos(ca) * 0.3, cuff[1] + Math.sin(ca) * 0.3, 0.8, ws[2] * 0.42, ca, 0, TAU);
    f.fillStyle = css(LINING); f.fill(ci);
    f.restore();
  };

  // ---- emissive parts --------------------------------------------------------------------------
  const halo = (c: Ctx, emissive: boolean) => {
    // A thin ring with points like a dark sun, tipped slightly toward the viewer.
    const [x, y] = ring;
    const k = 0.75 + hot * 0.25;
    c.save();
    c.translate(x, y);
    c.scale(0.86, 1);
    if (emissive) {
      c.strokeStyle = css(MAG.c, 0.22 * k);
      c.lineWidth = 3.2 + hot * 1.5;
      c.beginPath(); c.arc(0, 0, ringR, 0, TAU); c.stroke();
    }
    c.strokeStyle = css(MAG.c, k);
    c.lineWidth = 0.9 + hot * 0.3;
    c.beginPath(); c.arc(0, 0, ringR, 0, TAU); c.stroke();
    c.strokeStyle = css(emissive ? MAG.l : MAG.l, 0.8 * k);
    c.lineWidth = 0.35;
    c.beginPath(); c.arc(0, 0, ringR - 1.3, 0, TAU); c.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.13;
      const l = i % 3 === 0 ? 2.6 + hot : 1.3;
      c.save(); c.rotate(a);
      c.fillStyle = css(i % 3 === 0 ? MAG.l : MAG.c, k);
      c.beginPath(); c.moveTo(ringR - 0.2, -0.45); c.lineTo(ringR + l, 0); c.lineTo(ringR - 0.2, 0.45); c.closePath(); c.fill();
      c.restore();
    }
    c.restore();
    if (emissive) glow(c, x, y, ringR + 5, MAG.c, 0.18 + hot * 0.2, 0.55);
  };

  const eyes = (c: Ctx, emissive: boolean) => {
    const mx = head[0] + 2.9, my = head[1] + 1.0;
    const e1: V = [mx - 0.75, my - 0.95], e2: V = [mx + 2.0, my - 0.9];
    if (emissive) { glow(c, e1[0], e1[1], 2.8 + hot * 1.6, MAG.c, 0.95); glow(c, e2[0], e2[1], 2.2 + hot, MAG.c, 0.8); }
    c.fillStyle = css(MAG.c); c.beginPath(); c.ellipse(e1[0], e1[1], 0.55, 0.32, -0.3, 0, TAU); c.fill();
    c.fillStyle = css(MAG.w); c.beginPath(); c.ellipse(e1[0] + 0.05, e1[1] - 0.03, 0.26, 0.16, -0.3, 0, TAU); c.fill();
    c.fillStyle = css(MAG.c); c.beginPath(); c.ellipse(e2[0], e2[1], 0.4, 0.26, 0.3, 0, TAU); c.fill();
    c.fillStyle = css(MAG.l); c.beginPath(); c.ellipse(e2[0], e2[1], 0.18, 0.12, 0.3, 0, TAU); c.fill();
  };

  const glyphs = (c: Ctx, emissive: boolean) => {
    const a = 0.7 + hot * 0.3;
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.7) / 4.4;
      const x = lerp(cx + 2.9, cx + 1.4 - s * 1.2, t), y = lerp(top + 13.5, top + 33.5, t);
      if (emissive) glow(c, x, y, 1.5 + hot, MAG.c, 0.55 * a);
      c.save(); c.translate(x, y);
      c.fillStyle = css(emissive ? MAG.l : MAG.c, a);
      c.beginPath();
      if (i % 2 === 0) { c.arc(0, 0, 0.5, 0, TAU); c.moveTo(0.18, 0); c.arc(0, 0, 0.18, 0, TAU, true); }
      else { c.moveTo(0, -0.75); c.lineTo(0.42, 0); c.lineTo(0, 0.75); c.lineTo(-0.42, 0); c.closePath(); }
      c.fill('evenodd');
      c.restore();
    }
  };

  const orbDraw = (c: Ctx, emissive: boolean) => {
    const [x, y] = orb;
    const R = orbR;
    if (emissive) {
      glow(c, x, y, R * 3.6 + o.glow * 2.5, CYAN.c, 0.85);
      glow(c, x, y, R * 1.6, CYAN.l, 0.7);
    }
    // Sphere: deep cyan rim, bright core, a swirl of light inside, a specular glint.
    c.fillStyle = rad(c, x - R * 0.3, y - R * 0.35, 0, R, [[0, css(CYAN.w)], [0.35, css(CYAN.l)], [0.75, css(CYAN.c)], [1, css(mix(CYAN.c, CYAN.d, 0.6))]]);
    c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill();
    c.save();
    c.beginPath(); c.arc(x, y, R * 0.92, 0, TAU); c.clip();
    c.strokeStyle = css(CYAN.w, 0.8); c.lineWidth = 0.28;
    for (let i = 0; i < 2; i++) {
      const a0 = o.ph * 0.8 + i * Math.PI;
      c.beginPath(); c.ellipse(x, y, R * 0.75, R * 0.32, a0, 0.2, Math.PI - 0.4); c.stroke();
    }
    c.restore();
    c.fillStyle = css(0xffffff, 0.9);
    c.beginPath(); c.ellipse(x - R * 0.38, y - R * 0.42, R * 0.26, R * 0.16, -0.6, 0, TAU); c.fill();
    // A broken ward ring of rune dashes circling the orb.
    c.save();
    c.translate(x, y); c.rotate(-0.3 + o.ph * 0.2);
    c.strokeStyle = css(CYAN.l, emissive ? 0.7 : 0.55); c.lineWidth = 0.3;
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU + o.ph * 0.5;
      c.beginPath(); c.ellipse(0, 0, R * 1.65, R * 0.6, 0, a0, a0 + 0.62); c.stroke();
    }
    c.restore();
    // Motes drawn in toward the orb (stronger when channelling).
    const n = 4 + Math.round(o.glow * 2);
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + o.ph;
      const d = R * (2.0 + ((i * 3) % 4) * 0.45 + o.glow * 0.4);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.8;
      if (emissive) glow(c, px, py, 1.4, CYAN.c, 0.7);
      star(c, px, py, 0.7, 0.7, 0.12, css(CYAN.l), a);
    }
    if (o.glow > 0) {
      // Channel: streaks of ward light rising out of the orb.
      for (let i = 0; i < 3 + o.glow; i++) {
        const a = -Math.PI / 2 + (i - (2 + o.glow) / 2) * 0.62;
        const l = R * (1.15 + o.glow * 0.2 + (i % 2) * 0.3);
        const pts = [x + Math.cos(a) * R * 1.1, y + Math.sin(a) * R * 1.1, x + Math.cos(a + 0.15) * l * 0.7, y + Math.sin(a + 0.15) * l * 0.7, x + Math.cos(a) * l, y + Math.sin(a) * l];
        taper(c, pts, 0.6, 0.05, css(CYAN.l, emissive ? 0.8 : 0.6));
      }
    }
  };

  const tailGlow = (c: Ctx, emissive: boolean) => {
    // Faint magenta embers drifting off the wisps.
    for (let i = 0; i < 4; i++) {
      const x = cx - 3 + i * 2.2 - s * 1.8 + Math.sin(o.ph + i * 2.1) * 1.2;
      const y = top + 39 + ((i * 7) % 5) * 1.3 + Math.cos(o.ph + i) * 0.8;
      if (y > FOOT + 1) continue;
      if (emissive) glow(c, x, y, 1.4, MAG.c, 0.55);
      c.fillStyle = css(MAG.l, 0.85);
      c.beginPath(); c.arc(x, y, 0.28, 0, TAU); c.fill();
    }
  };

  /** Generous bounds of everything inside the body figure (robe, collar wings, hood, sleeves, hands). */
  const bodyBox = () => boxOf([
    cx - 10, top + 9, cx + 9.5, top + 9, cx - 9.5, top + 22, cx + 9, top + 22, cx - 1 - s * 2.4, top + 41,
    head[0] - 7, head[1] - 8.5, head[0] + 7.5, head[1] + 7.5, cx - 9, top, cx + 9, top,
    lerp(cx + 9, cx + 10.8, r) + 3, lerp(top + 20.5, top + 4.8, r), lerp(cx - 5.4, cx - 6.6, r) - 3, lerp(top + 20.5, top + 1.6, r),
    orb[0] - orbR - 4, orb[1] - orbR - 3, orb[0] + orbR + 4, orb[1] + orbR + 4,
  ], 3);
  let cache: { c: HTMLCanvasElement; d: number } | null = null;
  const B = bodyBox();
  /** The body figure at density d (or, as a mask for the emissive pass, at whatever density is cached). */
  const bodyCanvas = (d: number, mask = false) => {
    if (cache && (mask || cache.d === d)) return cache.c;
    const L = layer(B.w, B.h, d);
    figure(L.g, B.w, B.h, inBox(B, body), {
      ink: INK, inkW: 0.6, rim: RIM, rimW: 0.5, rimA: 0.7, shadeW: 1.0, shadeA: 0.4,
      post: inBox(B, (f) => {
        mottle(f, 37, 0.3);
        // Cyan ward light on the hands, sleeves and mask; magenta from the halo on the hood's back.
        f.save();
        f.globalCompositeOperation = 'source-atop';
        f.fillStyle = rad(f, orb[0], orb[1], 0, 10 + o.glow * 2, [[0, css(CYAN.c, 0.42 + hot * 0.2)], [1, css(CYAN.c, 0)]]);
        f.fillRect(0, 0, W, H);
        f.fillStyle = rad(f, ring[0] - 4, ring[1] - 2, 0, 9, [[0, css(MAG.c, 0.22 + hot * 0.15)], [1, css(MAG.c, 0)]]);
        f.fillRect(0, 0, W, H);
        f.restore();
      }),
    });
    cache = { c: L.c, d };
    return L.c;
  };

  return (g: Ctx, e: Ctx) => {
    if (live(g)) {
      drawWisps(g, false);
      halo(g, false);
      g.drawImage(bodyCanvas(scaleOf(g)), B.x, B.y, B.w, B.h);
      glyphs(g, false);
      eyes(g, false);
      tailGlow(g, false);
      orbDraw(g, false);
    }
    if (live(e)) {
      drawWisps(e, true);
      halo(e, true);
      e.save();
      e.globalCompositeOperation = 'destination-out';
      e.drawImage(bodyCanvas(scaleOf(e), true), B.x, B.y, B.w, B.h);
      e.restore();
      glyphs(e, true);
      eyes(e, true);
      tailGlow(e, true);
      orbDraw(e, true);
    }
    if (live(e)) cache = null; // the body pass keeps it for the emissive pass that follows
  };
}

export function wardenSprites(): SpriteSet {
  const b: Pose = { bob: 0, raise: 0, sway: 0, lean: 0, glow: 0, ph: 0 };
  const idle: Painter[] = [], run: Painter[] = [];
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * TAU;
    idle.push(frame({ ...b, bob: -Math.cos(t) * 0.9, sway: Math.sin(t) * 0.9, ph: t }));
  }
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * TAU;
    run.push(frame({ ...b, bob: -Math.cos(t * 2) * 0.5, sway: 2.6 + Math.sin(t) * 0.7, lean: 1.0, ph: t * 1.5 }));
  }
  return {
    w: W, h: H, footY: FOOT,
    anims: {
      idle, run,
      windup: [
        frame({ ...b, bob: 0.2, raise: 0.9, glow: 1, sway: -0.5, ph: 0.6 }),
        frame({ ...b, bob: -0.6, raise: 1, glow: 2, sway: -1.0, ph: 1.8 }),
      ],
    },
  };
}
