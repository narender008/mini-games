// Gloom Sentinel: a tall hooded caster in magenta-plum robes, floating a little above the ground on a
// trail of mist. A pointed cowl hides the face except two magenta eyes; a capelet with brass trim and a
// glowing clasp; a long robe with a tattered hem, a dark front panel stitched with glowing runes; a
// brass-bound staff topped by a magenta crystal. Windup gathers light in the crystal and the free hand
// (a rune circle flares under it); the fire frame thrusts the staff forward with a flare at the crystal.
// Faces right (the view mirrors it).
//
// Each frame is a vector painter: the body is one figure() (ink outline, moonlight rim, lower-right
// shade); the crystal, eyes, runes, clasp and casting light are drawn after it, solid on the body layer
// and with halos on the emissive layer.
import { makeCanvas, noisePattern, noiseTexture, css, glow, layer, lin, mix, rad, scaleOf, shade, figure, taper, TAU, type Ctx } from '../paint';
import type { Painter, SpriteSet } from '../sprite';

const W = 44, H = 58, FOOT = 54;
const INK = 0x07050c;
const RIM = mix(0x8fa4dc, 0xff9be0, 0.28);
const MAG = { c: 0xe04bb0, l: 0xff9be0, w: 0xffe3f6, d: 0x7a1f62 };
const ROBE = { d: 0x2e0d30, m: 0x67225f, l: 0x95398a, h: 0xbf64ae };
const LINING = 0x170a1c;
const BRASS = { d: 0x6e4e20, m: 0xb48a3e, l: 0xe0b65e, h: 0xfff0b8 };
const WOOD = { d: 0x24160e, m: 0x46301e, l: 0x6e4c30 };
const HAND = { d: 0x120c18, m: 0x2c2238, l: 0x4a3c5c };

type V = [number, number];
type Pts = number[];

const live = (c: Ctx) => c.canvas.width > 8 && c.canvas.height > 8;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Shrink a glow's radius so it has faded out before it meets the frame edge (no hard cut-off). */
const edgeR = (x: number, y: number, r: number) => Math.min(r, (W - x) / 0.78, x / 0.78, y / 0.78, (H - y) / 0.78);

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

/** A four-pointed star burst (sparks, glints, the muzzle flare). */
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
  bob: number;   // whole body up/down
  lean: number;  // upper body forward (+) / back (-)
  hem: number;   // hem trailing back (motion)
  tilt: number;  // staff top swung forward
  cast: number;  // 0 calm .. 3 peak: crystal brightness
  hand: number;  // free hand raised forward 0..1
  flare: number; // muzzle flare at the crystal
  sway: number;  // idle cloth sway
}

function frame(o: Pose): Painter {
  const cx = 19.5 + o.lean, top = 4.5 + o.bob;
  const s = o.hem;
  const hot = clamp(o.cast / 3, 0, 1);
  // Staff: base near the ground, crystal above the head.
  const sb: V = [cx + 11.5 - o.tilt * 2, top + 50.5 - o.tilt * 0.6];
  const st: V = [cx + 11.5 + o.tilt * 5, top + 4.5 + o.tilt * 1.2 - o.cast * 0.4];
  const sAt = (t: number): V => [lerp(st[0], sb[0], t), lerp(st[1], sb[1], t)];
  const sAng = Math.atan2(st[1] - sb[1], st[0] - sb[0]);
  const grip = sAt(0.4);
  const cr: V = [st[0] + Math.cos(sAng) * 2.6, st[1] + Math.sin(sAng) * 2.6]; // crystal centre
  // Free hand when casting.
  const fh: V = [cx + 9 + o.hand * 3.5, top + 24 - o.hand * 6];

  const body = (f: Ctx) => {
    // Far sleeve hanging at the back (idle) — behind the robe.
    if (o.hand < 0.5) {
      const p = tube([cx - 5, top + 15, cx - 8.5 - s * 0.2, top + 21, cx - 8.8 - s * 0.4, top + 28.5], [4.6, 5.2, 6.4]);
      f.fillStyle = lin(f, cx - 11, top + 16, cx - 6, top + 28, [[0, css(ROBE.m)], [1, css(ROBE.d)]]);
      f.fill(p);
      // Cuff opening and a bony hand.
      const cuff = new Path2D(); cuff.ellipse(cx - 8.8 - s * 0.4, top + 29, 3, 1.1, -0.1, 0, TAU);
      f.fillStyle = css(LINING); f.fill(cuff);
      taper(f, [cx - 9 - s * 0.4, top + 29, cx - 9.2 - s * 0.4, top + 31], 1.5, 1.0, css(HAND.m));
    }
    drawRobe(f);
    drawMantle(f);
    drawHood(f);
    drawStaff(f);
    drawStaffArm(f);
    if (o.hand >= 0.5) drawCastArm(f);
  };

  const hemPts = (): Pts => {
    // Tattered hem from the front corner back to the rear corner: points and notches.
    const out: Pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = lerp(cx + 12.6, cx - 12.2, t) - s * (0.2 + t * 1.3) + Math.sin(o.sway + t * 5) * 0.4;
      const tip = i % 2 === 0;
      const y = top + 45.2 + (tip ? 2.2 + ((i * 7) % 3) * 0.5 : 0) - s * t * 0.9 - (i === 0 || i === n ? 0.8 : 0);
      out.push(x, y);
    }
    return out;
  };

  const robePath = () => {
    const h = hemPts();
    const p = new Path2D();
    p.moveTo(cx - 5.2, top + 14);
    p.lineTo(cx + 5.6, top + 14);
    p.bezierCurveTo(cx + 7.4, top + 20, cx + 7.6, top + 25, cx + 7.9, top + 28);
    p.bezierCurveTo(cx + 8.6 - s * 0.05, top + 34, cx + 11 - s * 0.15, top + 40, h[0], h[1]);
    for (let i = 2; i < h.length; i += 2) {
      const px = h[i - 2], py = h[i - 1], x = h[i], y = h[i + 1];
      p.quadraticCurveTo((px + x) / 2 + 0.3, Math.max(py, y) - 0.4, x, y);
    }
    p.bezierCurveTo(cx - 10.5 - s * 1.0, top + 39, cx - 8 - s * 0.5, top + 33, cx - 7.6 - s * 0.2, top + 28);
    p.bezierCurveTo(cx - 7.3, top + 25, cx - 7.0, top + 19, cx - 5.2, top + 14);
    p.closePath();
    return p;
  };

  const drawRobe = (f: Ctx) => {
    const path = robePath();
    f.fillStyle = lin(f, cx - 12, top + 14, cx + 12, top + 46, [[0, css(ROBE.l)], [0.35, css(ROBE.m)], [0.75, css(mix(ROBE.m, ROBE.d, 0.6))], [1, css(ROBE.d)]]);
    f.fill(path);
    f.save();
    f.clip(path);
    // Darker toward the hem.
    f.fillStyle = lin(f, 0, top + 30, 0, top + 49, [[0, css(ROBE.d, 0)], [1, css(ROBE.d, 0.75)]]);
    f.fillRect(cx - 16, top + 28, 32, 24);
    // Folds: valleys falling from the belt and the shoulders, spreading toward the hem.
    const h = hemPts();
    for (let i = 1; i < h.length / 2 - 1; i += 2) {
      const hx = h[i * 2], hy = h[i * 2 + 1];
      const x0 = lerp(cx - 6, cx + 6, i / (h.length / 2 - 1)) + 0.5;
      softLine(f, [x0, top + 26, lerp(x0, hx, 0.5) + 0.3, top + 37, hx, hy + 0.5], 1.1, ROBE.d, 0.7, 0.9);
      softLine(f, [x0 - 1.2, top + 27, lerp(x0, hx, 0.5) - 1.2, top + 37, hx - 1.5, hy + 1.5], 0.8, i < 5 ? ROBE.h : ROBE.l, i < 5 ? 0.45 : 0.3, 0.8);
    }
    // Upper robe folds under the mantle.
    for (const dx of [-4.5, -1.5, 5]) softLine(f, [cx + dx, top + 17, cx + dx * 1.15, top + 21, cx + dx * 1.2, top + 25], 0.7, ROBE.d, 0.5, 0.6);
    // Front panel: a dark lining opening from the belt to the hem, edged in brass.
    const pl = new Path2D();
    const bx0 = cx + 2.2, by = top + 27;
    const hx0 = cx + 3.2 - s * 0.7, hx1 = cx + 6.6 - s * 0.5, hy = top + 47.5 - s * 0.3;
    pl.moveTo(bx0 - 0.6, by); pl.lineTo(bx0 + 1.6, by);
    pl.quadraticCurveTo(cx + 5.5, top + 37, hx1, hy); pl.lineTo(hx0, hy);
    pl.quadraticCurveTo(cx + 2, top + 37, bx0 - 0.6, by); pl.closePath();
    f.fillStyle = lin(f, cx + 2, by, cx + 6, hy, [[0, css(LINING)], [1, css(shade(LINING, -0.4))]]);
    f.fill(pl);
    f.lineWidth = 0.5;
    f.strokeStyle = css(BRASS.d); f.stroke(pl);
    f.lineWidth = 0.22;
    f.strokeStyle = css(BRASS.l, 0.8);
    f.beginPath(); f.moveTo(bx0 - 0.75, by); f.quadraticCurveTo(cx + 1.85, top + 37, hx0 - 0.15, hy); f.stroke();
    // Hem trim: a dark band and a thin brass line following the tattered edge.
    f.lineWidth = 1.6;
    f.strokeStyle = css(ROBE.d, 0.9);
    f.beginPath(); f.moveTo(h[0], h[1]);
    for (let i = 2; i < h.length; i += 2) f.quadraticCurveTo((h[i - 2] + h[i]) / 2 + 0.3, Math.max(h[i - 1], h[i + 1]) - 0.4, h[i], h[i + 1]);
    f.stroke();
    f.restore();
    // Belt: a plum band with a brass buckle and hanging sash ends.
    const belt = new Path2D();
    belt.moveTo(cx - 7.6, top + 25.4); belt.quadraticCurveTo(cx, top + 26.6, cx + 8.0, top + 25.2);
    belt.lineTo(cx + 8.1, top + 27.6); belt.quadraticCurveTo(cx, top + 29.0, cx - 7.8, top + 27.8); belt.closePath();
    occlude(f, belt, 0.8, 0.2, 0.6, 0.5);
    f.fillStyle = lin(f, 0, top + 25, 0, top + 28.5, [[0, css(ROBE.l)], [0.5, css(ROBE.m)], [1, css(ROBE.d)]]);
    f.fill(belt);
    taper(f, [cx + 3.6, top + 27.5, cx + 4.4 - s * 0.2, top + 31, cx + 4.0 - s * 0.5, top + 35.5], 1.6, 1.2, css(ROBE.m));
    taper(f, [cx + 4.6, top + 27.5, cx + 5.8 - s * 0.2, top + 31.5, cx + 5.6 - s * 0.5, top + 34.2], 1.3, 1.0, css(ROBE.d));
    const bk = new Path2D(); bk.roundRect(cx + 2.2, top + 25.3, 2.8, 2.6, 0.5);
    f.fillStyle = lin(f, cx + 2.2, top + 25.3, cx + 5, top + 27.9, [[0, css(BRASS.l)], [0.5, css(BRASS.m)], [1, css(BRASS.d)]]);
    f.fill(bk);
    f.fillStyle = css(BRASS.d); f.fillRect(cx + 3.1, top + 26.1, 1.0, 1.0);
  };

  const drawMantle = (f: Ctx) => {
    const m = blob([
      cx - 8.4, top + 19.0, cx - 7.4, top + 14.4, cx - 4.2, top + 11.8, cx + 4.4, top + 11.8, cx + 7.8, top + 14.4, cx + 9.0, top + 18.6,
      cx + 7.0, top + 21.0, cx + 4.6, top + 19.4, cx + 1.6, top + 21.4, cx - 1.8, top + 19.6, cx - 4.8, top + 21.4, cx - 7.2, top + 20.0,
    ]);
    occlude(f, m, 1.6, 0.4, 1.0, 0.65);
    f.fillStyle = lin(f, cx - 9, top + 12, cx + 8, top + 21, [[0, css(ROBE.h)], [0.35, css(ROBE.l)], [0.75, css(ROBE.m)], [1, css(ROBE.d)]]);
    f.fill(m);
    f.save(); f.clip(m);
    for (const dx of [-5.5, -1.5, 3, 6.8]) softLine(f, [cx + dx * 0.6, top + 13.5, cx + dx * 0.85, top + 16.5, cx + dx, top + 20], 0.6, ROBE.d, 0.55, 0.5);
    // Brass trim along the lower edge.
    f.lineWidth = 1.0; f.strokeStyle = css(BRASS.d); f.stroke(m);
    f.lineWidth = 0.35; f.strokeStyle = css(BRASS.l, 0.85);
    f.save(); f.translate(-0.15, -0.2); f.stroke(m); f.restore();
    f.restore();
    // Clasp at the chest (its gem glows, drawn later).
    const cl = new Path2D(); cl.arc(cx + 3.2, top + 16.4, 1.55, 0, TAU);
    f.fillStyle = rad(f, cx + 2.7, top + 15.9, 0.2, 1.8, [[0, css(BRASS.h)], [0.4, css(BRASS.l)], [1, css(BRASS.d)]]);
    f.fill(cl);
  };

  const drawHood = (f: Ctx) => {
    const hp = blob([
      cx - 5.8, top + 13.2, cx - 6.4, top + 8.6, cx - 5.4, top + 4.0, cx - 3.6, top + 1.0, cx - 2.6, top - 0.6,
      cx - 0.4, top + 1.6, cx + 2.6, top + 3.6, cx + 5.2, top + 6.8, cx + 6.2, top + 10.6, cx + 5.6, top + 13.6, cx, top + 14.8,
    ]);
    occlude(f, hp, 1.4, 0.3, 1.0, 0.6);
    f.fillStyle = lin(f, cx - 6, top + 1, cx + 5, top + 14, [[0, css(ROBE.h)], [0.3, css(ROBE.l)], [0.7, css(ROBE.m)], [1, css(ROBE.d)]]);
    f.fill(hp);
    f.save(); f.clip(hp);
    // A fold from the peak down the back of the cowl.
    softLine(f, [cx - 2.4, top + 1.2, cx - 3.4, top + 6, cx - 2.6, top + 12.4], 0.8, ROBE.d, 0.55, 0.6);
    softLine(f, [cx - 3.4, top + 1.8, cx - 4.6, top + 6.5, cx - 4.2, top + 12], 0.6, ROBE.h, 0.5, 0.5);
    // The face opening: a deep shadow ringed by the cowl's turned edge.
    // A pointed opening under the cowl's brow, open toward the chin.
    const fo = blob([cx + 1.2, top + 4.6, cx + 3.4, top + 5.0, cx + 5.6, top + 8.4, cx + 5.7, top + 11.6, cx + 3.8, top + 13.8, cx + 1.0, top + 12.6, cx - 0.2, top + 8.8]);
    f.fillStyle = css(ROBE.l); f.fill(fo);
    const fi = blob([cx + 1.9, top + 5.4, cx + 3.5, top + 5.8, cx + 5.2, top + 8.8, cx + 5.4, top + 11.8, cx + 3.9, top + 13.6, cx + 1.6, top + 12.4, cx + 0.6, top + 9.0]);
    f.fillStyle = rad(f, cx + 3.6, top + 10, 0.3, 3.6, [[0, css(mix(INK, MAG.d, 0.35 + hot * 0.25))], [1, css(INK)]]);
    f.fill(fi);
    f.restore();
  };

  const drawStaff = (f: Ctx) => {
    const p = tube([sb[0], sb[1], ...sAt(0.5), st[0], st[1]], [1.2, 1.35, 1.45], 3);
    f.fillStyle = lin(f, sb[0] - 1, 0, sb[0] + 1, 0, [[0, css(WOOD.l)], [0.5, css(WOOD.m)], [1, css(WOOD.d)]]);
    f.fill(p);
    f.save(); f.clip(p);
    taper(f, [sb[0] - 0.35, sb[1], st[0] - 0.35, st[1]], 0.35, 0.35, css(WOOD.l, 0.8));
    f.restore();
    // Brass bands and a pointed ferrule.
    const band = (t: number, w: number) => {
      const [bx, by] = sAt(t);
      const b = tube([bx - Math.cos(sAng) * w * 0.5, by - Math.sin(sAng) * w * 0.5, bx + Math.cos(sAng) * w * 0.5, by + Math.sin(sAng) * w * 0.5], [1.9, 1.9], 2);
      f.fillStyle = lin(f, bx - 1, by, bx + 1, by, [[0, css(BRASS.h)], [0.45, css(BRASS.m)], [1, css(BRASS.d)]]);
      f.fill(b);
    };
    band(0.12, 0.9); band(0.62, 0.7); band(0.8, 0.6); band(0.97, 1.2);
    // Crown: a brass collar and three claws cradling the crystal.
    const col = tube([...sAt(-0.005), st[0] + Math.cos(sAng) * 0.9, st[1] + Math.sin(sAng) * 0.9], [2.2, 2.6], 2);
    f.fillStyle = lin(f, st[0] - 1.3, st[1], st[0] + 1.3, st[1], [[0, css(BRASS.h)], [0.4, css(BRASS.m)], [1, css(BRASS.d)]]);
    f.fill(col);
    for (const side of [-1, 1, 0]) {
      const nx = -Math.sin(sAng), ny = Math.cos(sAng);
      const bx = st[0] + Math.cos(sAng) * 0.8 + nx * side * 0.9, by = st[1] + Math.sin(sAng) * 0.8 + ny * side * 0.9;
      const pts: Pts = [bx, by,
        bx + Math.cos(sAng) * 1.8 + nx * side * 1.7, by + Math.sin(sAng) * 1.8 + ny * side * 1.7,
        bx + Math.cos(sAng) * 4.2 + nx * side * 1.3, by + Math.sin(sAng) * 4.2 + ny * side * 1.3,
        bx + Math.cos(sAng) * 5.4 + nx * side * 0.3, by + Math.sin(sAng) * 5.4 + ny * side * 0.3];
      if (side === 0) continue;
      taper(f, pts, 0.9, 0.25, css(side < 0 ? BRASS.l : BRASS.d));
    }
  };

  const drawStaffArm = (f: Ctx) => {
    // Wide bell sleeve from the shoulder to the grip; a dark gloved hand around the staff.
    const sh: V = [cx + 5.5, top + 15];
    const el: V = [cx + 9.6, top + 22.5 - o.tilt * 0.6];
    const cuff: V = [grip[0] - 1.2, grip[1] + 0.6];
    const p = tube([sh[0], sh[1], el[0], el[1], cuff[0], cuff[1]], [4.4, 4.6, 5.6], 5);
    occlude(f, p, 1.4, 0.4, 0.9, 0.55);
    f.fillStyle = lin(f, sh[0] - 2, sh[1], cuff[0] + 3, cuff[1] + 2, [[0, css(ROBE.l)], [0.45, css(ROBE.m)], [1, css(ROBE.d)]]);
    f.fill(p);
    f.save(); f.clip(p);
    softLine(f, [sh[0] + 0.6, sh[1] + 1.5, el[0] - 0.4, el[1], cuff[0] - 1.5, cuff[1] - 0.6], 0.6, ROBE.h, 0.55, 0.5);
    softLine(f, [sh[0] + 2.4, sh[1] + 1, el[0] + 1.6, el[1] + 0.6, cuff[0] + 1.2, cuff[1] + 0.8], 0.8, ROBE.d, 0.6, 0.6);
    // Cuff trim.
    const c2 = new Path2D(); c2.ellipse(cuff[0] + 0.3, cuff[1] + 0.2, 1.4, 3.0, 0.5, 0, TAU);
    f.fillStyle = css(BRASS.d); f.fill(c2);
    f.restore();
    // Fist on the staff.
    const fist = new Path2D(); fist.roundRect(grip[0] - 1.3, grip[1] - 1.2, 2.6, 2.4, 0.9);
    f.fillStyle = lin(f, grip[0] - 1.3, grip[1] - 1.2, grip[0] + 1.3, grip[1] + 1.2, [[0, css(HAND.l)], [0.5, css(HAND.m)], [1, css(HAND.d)]]);
    f.fill(fist);
    f.strokeStyle = css(HAND.d); f.lineWidth = 0.25;
    for (let i = 0; i < 3; i++) { f.beginPath(); f.moveTo(grip[0] + 0.1, grip[1] - 0.6 + i * 0.6); f.lineTo(grip[0] + 1.2, grip[1] - 0.5 + i * 0.6); f.stroke(); }
  };

  const drawCastArm = (f: Ctx) => {
    // The free arm raised forward across the body, palm open toward the target.
    const sh: V = [cx - 2.5, top + 15.5];
    const el: V = [lerp(sh[0], fh[0], 0.45) - 0.5, lerp(sh[1], fh[1], 0.45) + 4];
    const cuff: V = [fh[0] - 2.2, fh[1] + 0.8];
    const p = tube([sh[0], sh[1], el[0], el[1], cuff[0], cuff[1]], [4.2, 4.6, 5.4], 5);
    occlude(f, p, 1.6, 0.4, 1.0, 0.6);
    f.fillStyle = lin(f, sh[0], sh[1] - 2, cuff[0], cuff[1] + 3, [[0, css(ROBE.h)], [0.4, css(ROBE.l)], [1, css(ROBE.m)]]);
    f.fill(p);
    f.save(); f.clip(p);
    softLine(f, [sh[0] + 1, sh[1] + 2.4, el[0] + 0.5, el[1] + 1.6, cuff[0], cuff[1] + 1.8], 0.9, ROBE.d, 0.55, 0.6);
    f.restore();
    // Bony fingers splayed forward.
    for (let i = 0; i < 4; i++) {
      const a = -0.75 + i * 0.32;
      taper(f, [fh[0] - 1.2, fh[1], fh[0] + Math.cos(a) * 1.8, fh[1] + Math.sin(a) * 1.8, fh[0] + Math.cos(a + 0.25) * 3.2, fh[1] + Math.sin(a + 0.25) * 3.2], 0.85, 0.4, css(i === 0 ? HAND.l : HAND.m));
    }
  };

  // ---- emissive details -------------------------------------------------------------------------
  const crystal = (c: Ctx, emissive: boolean) => {
    const k = 1 + hot * 0.25;
    const len = 3.6 * k, wid = 1.5 * k;
    c.save();
    c.translate(cr[0], cr[1]);
    c.rotate(sAng + Math.PI / 2);
    if (emissive) {
      c.save(); c.rotate(-(sAng + Math.PI / 2));
      glow(c, 0, 0, edgeR(cr[0], cr[1], 7 + o.cast * 2.6 + o.flare * 4), MAG.c, 0.9);
      glow(c, 0, 0, 3 + o.cast, MAG.l, 0.6);
      c.restore();
    }
    // Facets: lit upper-left face, mid face, dark right face; a white-hot heart.
    const faces: [number, number[]][] = [
      [MAG.l, [0, -len, -wid, -0.4, 0, len * 0.55]],
      [MAG.c, [0, -len, wid, -0.4, 0, len * 0.55]],
      [mix(MAG.c, MAG.d, 0.5), [wid, -0.4, 0, len * 0.55, 0.2, -0.1]],
    ];
    for (const [col, p] of faces) {
      c.fillStyle = css(emissive ? mix(col, 0xffffff, 0.15) : col);
      c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[2], p[3]); c.lineTo(p[4], p[5]); c.closePath(); c.fill();
    }
    c.fillStyle = css(MAG.w, 0.9);
    c.beginPath(); c.moveTo(-0.15, -len * 0.7); c.lineTo(-wid * 0.45, -0.3); c.lineTo(0.1, len * 0.15); c.closePath(); c.fill();
    if (!emissive) { c.strokeStyle = css(MAG.d, 0.9); c.lineWidth = 0.18; c.beginPath(); c.moveTo(0, -len); c.lineTo(-wid, -0.4); c.lineTo(0, len * 0.55); c.lineTo(wid, -0.4); c.closePath(); c.stroke(); }
    c.restore();
    if (o.cast > 1.5) {
      // Motes orbiting the crystal.
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + o.cast * 0.7;
        const mx = cr[0] + Math.cos(a) * 5.2, my = cr[1] + Math.sin(a) * 3.6;
        if (emissive) glow(c, mx, my, 1.8, MAG.c, 0.8);
        star(c, mx, my, 0.9, 0.9, 0.18, css(MAG.w), a);
      }
    }
  };

  const eyes = (c: Ctx, emissive: boolean) => {
    const e1: V = [cx + 3.4, top + 9.0], e2: V = [cx + 5.4, top + 9.2];
    if (emissive) { glow(c, e1[0], e1[1], 3.3 + hot * 1.5, MAG.c, 0.95); glow(c, e2[0], e2[1], 2.5 + hot, MAG.c, 0.8); }
    const slit = (x: number, y: number, rx: number, ry: number, col: number) => {
      c.fillStyle = css(col);
      c.beginPath(); c.moveTo(x - rx, y + ry * 0.3); c.quadraticCurveTo(x, y - ry * 1.4, x + rx, y - ry * 0.2); c.quadraticCurveTo(x, y + ry, x - rx, y + ry * 0.3); c.fill();
    };
    slit(e1[0], e1[1], 0.85, 0.42, MAG.c); slit(e1[0] + 0.1, e1[1] - 0.05, 0.45, 0.22, MAG.w);
    slit(e2[0], e2[1], 0.55, 0.32, MAG.c); slit(e2[0], e2[1], 0.25, 0.15, MAG.l);
  };

  const runes = (c: Ctx, emissive: boolean) => {
    // Glyphs stitched down the front panel, the clasp gem, the cuff seam.
    const a = 0.75 + hot * 0.25;
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.6) / 4.6;
      const x = lerp(cx + 3.3, cx + 4.6 - s * 0.6, t), y = lerp(top + 29.5, top + 46, t);
      if (emissive) glow(c, x, y, 1.6 + hot, MAG.c, 0.6 * a);
      c.fillStyle = css(emissive ? MAG.l : MAG.c, a);
      c.save(); c.translate(x, y);
      c.beginPath();
      if (i % 2 === 0) { c.moveTo(0, -0.8); c.lineTo(0.45, 0); c.lineTo(0, 0.8); c.lineTo(-0.45, 0); c.closePath(); }
      else { c.rect(-0.45, -0.15, 0.9, 0.3); c.rect(-0.12, -0.7, 0.24, 1.4); }
      c.fill();
      c.restore();
    }
    // Clasp gem.
    if (emissive) glow(c, cx + 3.2, top + 16.4, 3 + hot * 2, MAG.c, 0.8);
    c.fillStyle = css(MAG.c); c.beginPath(); c.arc(cx + 3.2, top + 16.4, 0.85, 0, TAU); c.fill();
    c.fillStyle = css(MAG.w); c.beginPath(); c.arc(cx + 2.95, top + 16.15, 0.35, 0, TAU); c.fill();
  };

  const mist = (c: Ctx, emissive: boolean) => {
    // The robe floats on a trail of magenta mist.
    const y0 = top + 46;
    if (emissive) {
      c.save();
      c.translate(cx - s * 0.8, y0 + 4);
      c.scale(1, 0.32);
      glow(c, 0, 0, 13, MAG.c, 0.35 + hot * 0.15, 0.05);
      c.restore();
    }
    const L = [5.5, 3.6, 6.4, 4.2, 5.0, 3.0];
    for (let i = 0; i < 6; i++) {
      const x = cx - 9 + i * 3.6 - s * (0.6 + i * 0.12) + Math.sin(i * 2.3) * 0.6;
      const sw = Math.sin(o.sway + i * 1.7) * 1.3 - s * 1.0;
      const l = L[i] * (1 - s * 0.08);
      const pts = [x, y0, x + sw * 0.3 + 0.3, y0 + l * 0.35, x + sw * 0.8, y0 + l * 0.7, x + sw * 1.2 - 0.6, y0 + l];
      taper(c, pts, i % 2 ? 0.9 : 1.3, 0.1, lin(c, x, y0, x, y0 + l, [[0, css(emissive ? MAG.c : mix(ROBE.l, MAG.c, 0.4), emissive ? 0.45 : 0.6)], [0.6, css(MAG.c, emissive ? 0.25 : 0.25)], [1, css(MAG.d, 0)]]));
    }
  };

  const castLight = (c: Ctx, emissive: boolean) => {
    if (o.hand < 0.5) return;
    const p: V = [fh[0] + 2.4, fh[1] - 0.2];
    if (emissive) {
      glow(c, p[0], p[1], 4 + o.cast * 1.4, MAG.c, 0.9);
      glow(c, p[0], p[1], 2, MAG.w, 0.7);
    }
    c.fillStyle = css(MAG.l);
    c.beginPath(); c.arc(p[0], p[1], 0.8 + hot * 0.5, 0, TAU); c.fill();
    c.fillStyle = css(MAG.w);
    c.beginPath(); c.arc(p[0] - 0.2, p[1] - 0.2, 0.4 + hot * 0.25, 0, TAU); c.fill();
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + o.cast;
      star(c, p[0] + Math.cos(a) * 2.6, p[1] + Math.sin(a) * 2.2, 0.6, 0.6, 0.12, css(MAG.l), a);
    }
  };

  const runeCircle = (c: Ctx) => {
    // Windup: a rune circle kindles on the ground beneath (emissive only).
    if (o.cast < 1.5) return;
    const k = o.cast > 2.5 ? 1 : 0.65;
    c.save();
    c.translate(cx, FOOT - 0.5);
    c.scale(1, 0.3);
    c.strokeStyle = css(MAG.c, 0.65 * k);
    c.lineWidth = 0.9;
    c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.stroke();
    c.strokeStyle = css(MAG.l, 0.5 * k);
    c.lineWidth = 0.5;
    c.beginPath(); c.arc(0, 0, 11, 0, TAU); c.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      c.beginPath(); c.moveTo(Math.cos(a) * 11, Math.sin(a) * 11); c.lineTo(Math.cos(a) * 14, Math.sin(a) * 14); c.stroke();
      star(c, Math.cos(a + 0.39) * 12.5, Math.sin(a + 0.39) * 12.5, 0.9, 1.6, 0.2, css(MAG.l, 0.7 * k));
    }
    c.restore();
  };

  const muzzle = (c: Ctx, emissive: boolean) => {
    if (!o.flare) return;
    const [x, y] = cr;
    if (emissive) {
      glow(c, x, y, edgeR(x, y, 13), MAG.c, 0.95);
      glow(c, x + 1, y, 5, MAG.w, 0.85);
      c.save(); c.translate(x, y); c.strokeStyle = css(MAG.l, 0.8); c.lineWidth = 0.55;
      c.beginPath(); c.ellipse(0, 0, 4.6, 3.8, 0, 0, TAU); c.stroke();
      c.strokeStyle = css(MAG.c, 0.5); c.lineWidth = 0.35;
      c.beginPath(); c.ellipse(0, 0, 6.2, 5.4, 0, 0, TAU); c.stroke(); c.restore();
    }
    star(c, x + 1.2, y, Math.min(7, W - 0.6 - x - 1.2), 1.3, 0.5, css(emissive ? MAG.l : MAG.c));
    star(c, x, y, 2.6, 6.2, 0.4, css(emissive ? MAG.l : MAG.c));
    star(c, x + 0.8, y, 4.2, 0.8, 0.3, css(MAG.w), 0);
    star(c, x, y, 2.6, 2.6, 0.4, css(MAG.w), 0.78);
    for (let i = 0; i < 6; i++) {
      // Sparks thrown forward.
      const a = -0.9 + i * 0.36, d = 4.5 + (i % 3) * 1.1;
      const sx = Math.min(W - 1, x + Math.cos(a) * d), sy = y + Math.sin(a) * d;
      if (emissive) glow(c, sx, sy, 1.3, MAG.c, 0.7);
      star(c, sx, sy, 0.7, 0.35, 0.1, css(MAG.w), a);
    }
  };

  /** Generous bounds of everything inside the body figure (robe, hood, sleeves, staff and its crown). */
  const bodyBox = () => boxOf([
    ...hemPts(), cx - 13 - Math.max(0, s) * 1.4, top + 30, cx + 13, top + 30, cx - 8, top - 1.5, cx + 8, top - 1.5,
    ...sb, ...st, st[0] + Math.cos(sAng) * 6.5, st[1] + Math.sin(sAng) * 6.5, ...fh, fh[0] + 4, fh[1] - 2.5,
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
        mottle(f, 23, 0.3);
        // Magenta light from the crystal on the hood's front and the staff arm.
        f.save();
        f.globalCompositeOperation = 'source-atop';
        f.fillStyle = rad(f, cr[0], cr[1], 0, 14 + o.cast * 2, [[0, css(MAG.c, 0.38 + hot * 0.2)], [1, css(MAG.c, 0)]]);
        f.fillRect(0, 0, W, H);
        if (o.hand >= 0.5) {
          f.fillStyle = rad(f, fh[0] + 2, fh[1], 0, 8, [[0, css(MAG.c, 0.35)], [1, css(MAG.c, 0)]]);
          f.fillRect(0, 0, W, H);
        }
        f.restore();
      }),
    });
    cache = { c: L.c, d };
    return L.c;
  };

  return (g: Ctx, e: Ctx) => {
    if (live(g)) {
      mist(g, false);
      g.drawImage(bodyCanvas(scaleOf(g)), B.x, B.y, B.w, B.h);
      runes(g, false);
      eyes(g, false);
      crystal(g, false);
      castLight(g, false);
      muzzle(g, false);
    }
    if (live(e)) {
      runeCircle(e);
      mist(e, true);
      e.save();
      e.globalCompositeOperation = 'destination-out';
      e.drawImage(bodyCanvas(scaleOf(e), true), B.x, B.y, B.w, B.h);
      e.restore();
      runes(e, true);
      eyes(e, true);
      crystal(e, true);
      castLight(e, true);
      muzzle(e, true);
    }
    if (live(e)) cache = null; // the body pass keeps it for the emissive pass that follows
  };
}

export function sentinelSprites(): SpriteSet {
  const b: Pose = { bob: 0, lean: 0, hem: 0, tilt: 0, cast: 0, hand: 0, flare: 0, sway: 0 };
  const idle: Painter[] = [], run: Painter[] = [];
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * TAU;
    idle.push(frame({ ...b, bob: Math.sin(t) * 0.8, hem: Math.sin(t + 1) * 0.5, sway: t, cast: 0.3 + Math.max(0, Math.sin(t)) * 0.3 }));
  }
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * TAU;
    run.push(frame({ ...b, bob: Math.sin(t) * 0.7 - 0.3, lean: 1.2, tilt: 0.45, hem: 2.4 + Math.sin(t) * 0.6, sway: t * 1.3 }));
  }
  return {
    w: W, h: H, footY: FOOT,
    anims: {
      idle, run,
      windup: [
        frame({ ...b, tilt: 0.3, cast: 2, hand: 0.6, hem: -0.6, sway: 0.5 }),
        frame({ ...b, tilt: 0.45, cast: 3, hand: 1, hem: -1.2, bob: -0.8, sway: 1.3 }),
      ],
      fire: [frame({ ...b, bob: 0.6, tilt: 1.25, cast: 1.5, hem: 2.6, lean: -1.6, flare: 1, sway: 2.2 })],
    },
  };
}
