// HUD and card icons, painted with Canvas 2D at high resolution and handed to the DOM as data URLs (each is
// painted once, on first use, and cached). Every icon is drawn in a 100 x 100 unit box with the paint kit:
// a soft halo of its colour, the symbol in gradients with an ink outline and rim light, then the parts made
// of light added on top (blooms, white-hot cores, sparkles). Backgrounds stay transparent: the HUD frames
// and the card medals are drawn by CSS (src/ui/style.css, src/ui/screens.css).
import { layer, makeCanvas, css, mix, shade, rng, lin, rad, figure, bez, taper, roundPoly, rrect, leafPath, TAU, type Ctx, type FigureOpts } from './paint';

// Texture sizes: the HUD icons at 4x their CSS size (portrait and ability slots 40 px, light counter 32 px);
// the card art at 320 px for medals of 5.2em (about 70 to 130 CSS px) and taken-upgrade picks of 2.2em,
// sharp on 2x screens and cheap enough to paint when the upgrade screen first opens.
const HUD_PX = 160;
const STAR_PX = 128;
const CARD_PX = 320;

const INK = 0x05060b, MOON_L = 0xc3d0f2, WHITE = 0xffffff;
const AMBER = 0xffb347, AMBER_L = 0xffe29a, AMBER_W = 0xfff8e0, AMBER_D = 0xd9771f, EMBER = 0xff7a2e;
const BRASS = 0xc99a45, BRASS_D = 0x7a5a26, BRASS_H = 0xffd98a;
const IRON = 0x34384a, IRON_D = 0x101119;

const cache = new Map<string, string>();
function paintIcon(key: string, px: number, draw: (g: Ctx) => void): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = layer(100, 100, px / 100);
  g.save();
  draw(g);
  g.restore();
  // Feather the last few units at the image's edges so glows never end in a hard square edge.
  g.globalCompositeOperation = 'destination-in';
  const F = 5 / 100;
  g.fillStyle = lin(g, 0, 0, 100, 0, [[0, css(0, 0)], [F, css(0)], [1 - F, css(0)], [1, css(0, 0)]]);
  g.fillRect(0, 0, 100, 100);
  g.fillStyle = lin(g, 0, 0, 0, 100, [[0, css(0, 0)], [F, css(0)], [1 - F, css(0)], [1, css(0, 0)]]);
  g.fillRect(0, 0, 100, 100);
  const u = c.toDataURL();
  cache.set(key, u);
  return u;
}

// ---- painting helpers ---------------------------------------------------------------------------------

type Pt = [number, number];
interface Tint { c: number; l: number; w: number; d: number; dd: number }
const tint = (c: number): Tint => ({ c, l: shade(c, 0.45), w: shade(c, 0.82), d: shade(c, -0.45), dd: shade(c, -0.78) });

function additive(g: Ctx, f: () => void) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  f();
  g.restore();
}

/** A soft disc of colour behind a symbol. */
function halo(g: Ctx, x: number, y: number, r: number, c: number, a: number) {
  g.fillStyle = rad(g, x, y, 0, r, [[0, css(c, a)], [0.35, css(c, a * 0.55)], [0.7, css(c, a * 0.14)], [1, css(c, 0)]]);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

/** An additive glow: a white-hot centre through the colour to nothing at r. */
function bloom(g: Ctx, x: number, y: number, r: number, c: number, a = 1) {
  if (r <= 0) return;
  additive(g, () => {
    g.fillStyle = rad(g, x, y, 0, r, [[0, css(shade(c, 0.6), a)], [0.12, css(shade(c, 0.25), a * 0.8)], [0.4, css(c, a * 0.26)], [1, css(c, 0)]]);
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  });
}

/** Thin light rays fanning out from (x, y). */
function rays(g: Ctx, x: number, y: number, n: number, r0: number, r1: number, c: number, a: number, seed: number, wid = 0.05, from = 0, span = TAU) {
  const r = rng(seed);
  additive(g, () => {
    for (let i = 0; i < n; i++) {
      const ang = from + ((i + r() * 0.7) / n) * span;
      const len = r0 + (r1 - r0) * r();
      const w = wid * (0.4 + r() * 1.2);
      g.fillStyle = rad(g, x, y, 0, len, [[0, css(c, a)], [0.45, css(c, a * 0.45)], [1, css(c, 0)]]);
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, len, ang - w, ang + w); g.closePath(); g.fill();
    }
  });
}

/** A four-pointed sparkle with concave sides. */
function sparkPath(g: Ctx, x: number, y: number, r: number, rot = 0, pinch = 0.14, rx = 1) {
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = rot + (i / 4) * TAU - Math.PI / 2, b = a + TAU / 8, n = a + TAU / 4;
    const k = i % 2 ? rx : 1, kn = i % 2 ? 1 : rx;
    if (i === 0) g.moveTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k);
    g.quadraticCurveTo(x + Math.cos(b) * r * pinch, y + Math.sin(b) * r * pinch, x + Math.cos(n) * r * kn, y + Math.sin(n) * r * kn);
  }
  g.closePath();
}
function sparkle(g: Ctx, x: number, y: number, r: number, c: number, a = 1, rot = 0) {
  bloom(g, x, y, r * 0.9, c, a * 0.75);
  additive(g, () => {
    g.fillStyle = css(shade(c, 0.35), a); sparkPath(g, x, y, r, rot); g.fill();
    g.fillStyle = css(WHITE, a); sparkPath(g, x, y, r * 0.55, rot, 0.2); g.fill();
  });
}

/** Floating motes scattered between radius r0 and r1 around (cx, cy). */
function motes(g: Ctx, seed: number, n: number, cx: number, cy: number, r0: number, r1: number, c: number, size = 1.4, a = 1, from = 0, span = TAU) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const ang = from + r() * span, d = r0 + (r1 - r0) * Math.sqrt(r());
    const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d, s = size * (0.5 + r());
    const k = a * (0.45 + r() * 0.55);
    bloom(g, x, y, s * 3.2, c, k * 0.8);
    additive(g, () => { g.fillStyle = css(shade(c, 0.75), k); g.beginPath(); g.arc(x, y, s * 0.55, 0, TAU); g.fill(); });
  }
}

/** Embers: short streaks drifting along a direction. */
function embers(g: Ctx, seed: number, n: number, x0: number, y0: number, x1: number, y1: number, c: number, dir: Pt = [0.3, -1], len = 3, a = 1) {
  const r = rng(seed);
  additive(g, () => {
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = x0 + (x1 - x0) * r(), y = y0 + (y1 - y0) * r(), l = len * (0.4 + r()), k = a * (0.4 + r() * 0.6);
      g.strokeStyle = lin(g, x, y, x + dir[0] * l, y + dir[1] * l, [[0, css(shade(c, 0.7), k)], [1, css(c, 0)]]);
      g.lineWidth = 0.7 + r() * 0.9;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + dir[0] * l, y + dir[1] * l); g.stroke();
      g.fillStyle = css(shade(c, 0.8), k);
      g.beginPath(); g.arc(x, y, g.lineWidth * 0.55, 0, TAU); g.fill();
    }
  });
}

/** A closed outline around a centre polyline with width wf(t) along it (t 0..1). */
function ribbonPath(g: Ctx, pts: number[], wf: (t: number) => number) {
  const n = pts.length / 2;
  const L: number[] = [], Rr: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let dx = pts[b * 2] - pts[a * 2], dy = pts[b * 2 + 1] - pts[a * 2 + 1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = Math.max(0, wf(i / (n - 1))) / 2;
    L.push(pts[i * 2] - dy * w, pts[i * 2 + 1] + dx * w);
    Rr.push(pts[i * 2] + dy * w, pts[i * 2 + 1] - dx * w);
  }
  g.beginPath();
  g.moveTo(L[0], L[1]);
  for (let i = 1; i < n; i++) g.lineTo(L[i * 2], L[i * 2 + 1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(Rr[i * 2], Rr[i * 2 + 1]);
  g.closePath();
}

/**
 * A soft glow: `draw` paints into a coarse layer (a few texels per icon) that is stretched back over the
 * icon with smoothing and added on, which blurs it softly for the cost of one small canvas.
 */
function softGlow(g: Ctx, draw: (h: Ctx) => void, a = 1, d = 0.45) {
  const L = layer(100, 100, d);
  draw(L.g);
  additive(g, () => {
    g.globalAlpha = a;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(L.c, 0, 0, 100, 100);
  });
}

/** A stroke made of light: a soft colour glow, the colour body, a pale band and a white-hot core. */
function lightRibbon(g: Ctx, pts: number[], wf: (t: number) => number, c: number, a = 1, glowK = 1, core = 0.45) {
  if (glowK > 0) softGlow(g, (h) => { h.fillStyle = css(c, 0.55); ribbonPath(h, pts, (t) => wf(t) * 1.8 + 2.2 * glowK); h.fill(); }, a * Math.min(1, glowK));
  additive(g, () => {
    g.fillStyle = css(c, 0.22 * a);
    ribbonPath(g, pts, (t) => wf(t) * 1.45 + 0.4); g.fill();
    g.fillStyle = css(shade(c, 0.15), 0.85 * a);
    ribbonPath(g, pts, wf); g.fill();
    g.fillStyle = css(shade(c, 0.8), a);
    ribbonPath(g, pts, (t) => wf(t) * core); g.fill();
  });
}

/** Points along an arc. */
function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 40, rot = 0): number[] {
  const out: number[] = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return out;
}

/** Jagged lightning points from (x0, y0) to (x1, y1). */
function boltPts(x0: number, y0: number, x1: number, y1: number, seed: number, segs = 7, jit = 5): number[] {
  const r = rng(seed);
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  const out = [x0, y0];
  for (let i = 1; i < segs; i++) {
    const t = i / segs, o = (r() - 0.5) * 2 * jit * Math.sin(Math.PI * t) ** 0.5;
    out.push(x0 + dx * t + nx * o, y0 + dy * t + ny * o);
  }
  out.push(x1, y1);
  return out;
}
function lightning(g: Ctx, pts: number[], w: number, c: number, a = 1) {
  const path = (h: Ctx) => { h.beginPath(); h.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) h.lineTo(pts[i], pts[i + 1]); };
  softGlow(g, (h) => { h.lineJoin = 'round'; h.strokeStyle = css(c, 0.6); h.lineWidth = w * 3 + 3; path(h); h.stroke(); }, a);
  additive(g, () => {
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = css(c, 0.35 * a); g.lineWidth = w * 2.2; path(g); g.stroke();
    g.lineJoin = 'miter';
    g.strokeStyle = css(shade(c, 0.4), a); g.lineWidth = w; path(g); g.stroke();
    g.strokeStyle = css(WHITE, a); g.lineWidth = w * 0.4; path(g); g.stroke();
  });
}

/**
 * Paint a solid symbol with ink outline, moonlight rim and shaded lower-right edges. `box` (x, y, w, h)
 * limits the offscreen layers to the part's bounds, which keeps small parts cheap.
 */
function solid(g: Ctx, draw: (f: Ctx) => void, o: FigureOpts = {}, box: [number, number, number, number] = [0, 0, 100, 100]) {
  // Snap the box to whole texels: figure() stretches its layers to w x h, and any stretch shows up as a seam
  // in the rim light.
  const d = Math.hypot(g.getTransform().a, g.getTransform().b) || 1;
  const x = Math.floor(box[0] * d) / d, y = Math.floor(box[1] * d) / d;
  const w = Math.ceil((box[0] + box[2] - x) * d) / d, h = Math.ceil((box[1] + box[3] - y) * d) / d;
  g.save();
  g.translate(x, y);
  figure(g, w, h, (f) => { f.save(); f.translate(-x, -y); draw(f); f.restore(); }, { ink: INK, inkW: 1.8, rim: MOON_L, rimW: 1.3, rimA: 0.55, shadeW: 2.2, shadeA: 0.35, ...o });
  g.restore();
}

let speckTex: HTMLCanvasElement | null = null;
/** Soft mottled grain over the current clip (one small random texture, scaled up smoothly). */
function speckle(f: Ctx, a: number, scale: number, ox = 0, oy = 0) {
  if (!speckTex) {
    speckTex = makeCanvas(64, 64);
    const x = speckTex.getContext('2d')!, img = x.createImageData(64, 64), r = rng(9);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 128 + (r() - 0.5) * 230;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }
  const p = f.createPattern(speckTex, 'repeat')!;
  p.setTransform(new DOMMatrix([scale / 64, 0, 0, scale / 64, ox, oy]));
  f.save();
  f.globalCompositeOperation = 'overlay';
  f.globalAlpha = a;
  f.fillStyle = p;
  f.fillRect(-10, -10, 120, 120);
  f.restore();
}

/** Lit metal across a part from x0 to x1 (light from the left). */
function metal(g: Ctx, x0: number, y0: number, x1: number, y1: number, c: number, hi = 0.45): CanvasGradient {
  return lin(g, x0, y0, x1, y1, [[0, css(shade(c, hi * 0.6))], [0.22, css(shade(c, hi))], [0.45, css(c)], [0.7, css(shade(c, -0.35))], [1, css(shade(c, -0.6))]]);
}

function heartPath(g: Ctx, cx: number, cy: number, s: number) {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.95);
  g.bezierCurveTo(cx - s * 0.3, cy + s * 0.62, cx - s * 1.05, cy + s * 0.18, cx - s * 1.02, cy - s * 0.32);
  g.bezierCurveTo(cx - s * 0.98, cy - s * 0.92, cx - s * 0.22, cy - s * 1.02, cx, cy - s * 0.48);
  g.bezierCurveTo(cx + s * 0.22, cy - s * 1.02, cx + s * 0.98, cy - s * 0.92, cx + s * 1.02, cy - s * 0.32);
  g.bezierCurveTo(cx + s * 1.05, cy + s * 0.18, cx + s * 0.3, cy + s * 0.62, cx, cy + s * 0.95);
  g.closePath();
}

/** A flame tongue standing on (x, y): width w, height h, tip leaning by lean x h. */
function flamePath(g: Ctx, x: number, y: number, w: number, h: number, lean = 0) {
  const tx = x + lean * h, ty = y - h;
  g.beginPath();
  g.moveTo(tx, ty);
  g.bezierCurveTo(x + lean * h * 0.35 + w * 0.12, y - h * 0.62, x + w * 0.56, y - h * 0.5, x + w * 0.5, y - h * 0.2);
  g.bezierCurveTo(x + w * 0.46, y - h * 0.02, x + w * 0.24, y + h * 0.04, x, y + h * 0.04);
  g.bezierCurveTo(x - w * 0.24, y + h * 0.04, x - w * 0.46, y - h * 0.02, x - w * 0.5, y - h * 0.2);
  g.bezierCurveTo(x - w * 0.56, y - h * 0.46, x + lean * h * 0.5 - w * 0.18, y - h * 0.66, tx, ty);
  g.closePath();
}
/** A layered flame: dark outer tongue, colour, bright inner tongue, white-hot core. */
function flame(g: Ctx, x: number, y: number, w: number, h: number, lean: number, t: Tint, a = 1) {
  additive(g, () => {
    g.fillStyle = lin(g, x, y - h * 1.1, x, y, [[0, css(t.c, 0)], [1, css(t.c, 0.16 * a)]]);
    flamePath(g, x, y + w * 0.06, w * 1.3, h * 1.08, lean); g.fill();
    g.fillStyle = lin(g, x, y - h, x, y, [[0, css(t.d, 0)], [0.35, css(mix(t.d, 0xff3a1a, 0.3), 0.6 * a)], [1, css(t.c, 0.9 * a)]]);
    flamePath(g, x, y, w, h, lean); g.fill();
    g.fillStyle = lin(g, x, y - h * 0.8, x, y, [[0, css(t.c, 0)], [0.4, css(t.c, 0.85 * a)], [1, css(t.l, a)]]);
    flamePath(g, x + w * 0.02, y, w * 0.68, h * 0.8, lean * 1.1); g.fill();
    g.fillStyle = lin(g, x, y - h * 0.5, x, y, [[0, css(t.l, 0)], [0.45, css(t.w, a)], [1, css(WHITE, a)]]);
    flamePath(g, x + w * 0.03, y, w * 0.38, h * 0.52, lean * 1.2); g.fill();
  });
}

// ---- shared bodies -----------------------------------------------------------------------------------

/**
 * A hanging lantern, centre-line x = cx, ring top at y = top, about 84 x s units tall. Its glass is lit by
 * the light tint; `cracked` breaks the panes with light spilling through the cracks.
 */
function lantern(g: Ctx, cx: number, top: number, s: number, t: Tint, cracked = false, glowA = 0.55) {
  const X = (x: number) => cx + x * s, Y = (y: number) => top + y * s;
  rays(g, X(0), Y(50), 18, 30 * s, 50 * s, t.l, 0.3, 21, 0.045);
  halo(g, X(0), Y(50), 48 * s, t.c, glowA);
  solid(g, (f) => {
    f.translate(cx, top); f.scale(s, s);
    // Ring and finial.
    f.lineWidth = 2.6; f.strokeStyle = metal(f, -6, 0, 6, 12, IRON, 0.6);
    f.beginPath(); f.arc(0, 6.5, 4.8, 0, TAU); f.stroke();
    f.fillStyle = metal(f, -3, 10, 3, 16, BRASS); f.beginPath(); f.arc(0, 13.2, 2.9, 0, TAU); f.fill();
    // Roof.
    roundPoly(f, [-5, 15, 5, 15, 16.5, 25.5, 19, 29, -19, 29, -16.5, 25.5], 1.2);
    f.fillStyle = metal(f, -19, 15, 19, 29, IRON, 0.55); f.fill();
    f.strokeStyle = css(BRASS_H, 0.75); f.lineWidth = 0.9;
    f.beginPath(); f.moveTo(-4.5, 15.6); f.lineTo(-16, 25.6); f.stroke();
    f.strokeStyle = css(BRASS_D, 0.9); f.lineWidth = 0.7;
    f.beginPath(); f.moveTo(0, 15.6); f.lineTo(0, 28.5); f.moveTo(-9, 21); f.lineTo(-11.5, 28.5); f.moveTo(9, 21); f.lineTo(11.5, 28.5); f.stroke();
    // Bands, frame and base.
    const band = (y: number, h: number, w: number) => { rrect(f, -w, y, w * 2, h, 1.4); f.fillStyle = metal(f, -w, y, w, y + h, BRASS); f.fill(); };
    band(28.8, 4.8, 21);
    f.fillStyle = metal(f, -18.5, 0, 18.5, 0, IRON, 0.5); f.fillRect(-18.5, 33.4, 37, 32);
    // Glass panes (arched centre pane, narrow side panes seen at an angle).
    const glass = rad(f, 0, 50, 1, 24, [[0, css(WHITE)], [0.18, css(t.w)], [0.45, css(t.l)], [0.78, css(t.c)], [1, css(t.d)]]);
    f.fillStyle = glass;
    f.beginPath(); f.moveTo(-8.2, 63.4); f.lineTo(-8.2, 42.5); f.quadraticCurveTo(-8.2, 35.6, 0, 35.4); f.quadraticCurveTo(8.2, 35.6, 8.2, 42.5); f.lineTo(8.2, 63.4); f.closePath(); f.fill();
    f.fillStyle = rad(f, 0, 50, 4, 26, [[0, css(t.l)], [0.5, css(t.c)], [1, css(t.d)]]);
    rrect(f, -16, 37, 5.6, 26.4, 2.4); f.fill();
    rrect(f, 10.4, 37, 5.6, 26.4, 2.4); f.fill();
    // Mullions.
    f.fillStyle = css(IRON_D, 0.85);
    f.fillRect(-10.4, 35, 1.6, 29); f.fillRect(8.8, 35, 1.6, 29);
    f.fillRect(-16, 49.4, 5.6, 1.3); f.fillRect(10.4, 49.4, 5.6, 1.3);
    band(64.6, 4.8, 21);
    roundPoly(f, [-16, 69.2, 16, 69.2, 12, 76.8, -12, 76.8], 1.2);
    f.fillStyle = metal(f, -16, 69, 16, 77, IRON, 0.55); f.fill();
    rrect(f, -14.5, 76.4, 29, 4.4, 1.4); f.fillStyle = metal(f, -14.5, 76, 14.5, 81, BRASS); f.fill();
    // Rivets.
    f.fillStyle = css(BRASS_H);
    for (const x of [-17, -6, 6, 17]) { f.beginPath(); f.arc(x, 31.2, 0.85, 0, TAU); f.arc(x, 67, 0.85, 0, TAU); f.fill(); }
    // Warm light spilling onto the frame around the glass.
    f.globalCompositeOperation = 'source-atop';
    f.fillStyle = rad(f, 0, 50, 6, 30, [[0, css(t.l, 0.5)], [0.6, css(t.c, 0.22)], [1, css(t.c, 0)]]);
    f.fillRect(-25, 14, 50, 70);
  }, { inkW: 1.8 / s, rimW: 1.1, rimA: 0.5 }, [cx - 26 * s, top, 52 * s, 86 * s]);
  // The light itself.
  bloom(g, X(0), Y(50), 24 * s, t.c, 0.9);
  additive(g, () => {
    g.fillStyle = css(WHITE, 0.95);
    g.beginPath(); g.moveTo(X(0), Y(41)); g.lineTo(X(4.6), Y(49.5)); g.lineTo(X(0), Y(58)); g.lineTo(X(-4.6), Y(49.5)); g.closePath(); g.fill();
  });
  sparkle(g, X(0), Y(49.5), 9 * s, t.l, 0.9);
  if (cracked) {
    const r = rng(77);
    const cr = (pts: number[]) => lightning(g, pts.map((v, i) => (i % 2 ? Y(v) : X(v))), 0.7 * s, t.l, 0.95);
    cr([-7, 38, -3, 44, -6, 49, -1, 55, -4, 62]);
    cr([-3, 44, 3, 41, 7, 37]);
    cr([-1, 55, 5, 58, 7.5, 63]);
    cr([12, 40, 14, 47, 12.6, 54]);
    // Shards flying off to the right.
    for (let i = 0; i < 5; i++) {
      const x = X(22 + r() * 14), y = Y(36 + r() * 26), sz = (1.6 + r() * 2.2) * s, a = r() * TAU;
      bloom(g, x, y, sz * 3, t.c, 0.7);
      additive(g, () => {
        g.fillStyle = lin(g, x - sz, y - sz, x + sz, y + sz, [[0, css(WHITE, 0.95)], [1, css(t.c, 0.8)]]);
        g.beginPath();
        g.moveTo(x + Math.cos(a) * sz * 1.4, y + Math.sin(a) * sz * 1.4);
        g.lineTo(x + Math.cos(a + 2.3) * sz, y + Math.sin(a + 2.3) * sz);
        g.lineTo(x + Math.cos(a + 3.9) * sz * 0.8, y + Math.sin(a + 3.9) * sz * 0.8);
        g.closePath(); g.fill();
      });
    }
  }
}

/** The keeper sprinting to the right as one silhouette (box 100 x 100): `near` fills the body and near limbs, `far` the far limbs and cloak. */
function runner(f: Ctx, near: string | CanvasGradient, far: string | CanvasGradient) {
  // Cloak streaming back from the shoulders.
  f.fillStyle = far;
  f.beginPath();
  f.moveTo(64, 30);
  f.bezierCurveTo(54, 26, 40, 25, 25, 29.5);
  f.quadraticCurveTo(32, 31.5, 37, 34);
  f.quadraticCurveTo(30, 38, 22, 40.5);
  f.bezierCurveTo(34, 41, 46, 43.5, 53, 48.5);
  f.closePath(); f.fill();
  // Far arm swung back, far leg stretched behind.
  taper(f, [60, 36, 50, 41.5], 5.4, 4.4, far);
  taper(f, [50, 41.5, 42, 35.5], 4.4, 3.6, far);
  taper(f, [47, 54, 37, 63], 8.4, 6.4, far);
  taper(f, [37, 63, 24.5, 68.5], 6.2, 4.2, far);
  taper(f, [24.5, 68.5, 18, 72.5], 4.2, 3.4, far);
  // Torso, leaning into the run.
  f.fillStyle = near;
  f.beginPath();
  f.moveTo(58, 30.5);
  f.bezierCurveTo(64, 28.5, 70, 31, 68.5, 37.5);
  f.bezierCurveTo(66, 45, 59, 52, 54.5, 57);
  f.bezierCurveTo(51, 60, 45, 59, 44.5, 54.5);
  f.bezierCurveTo(45, 46, 51, 34, 58, 30.5);
  f.closePath(); f.fill();
  // Near leg driving forward: thigh up, shin down, foot.
  taper(f, [50, 53, 63, 58.5], 9.6, 7, near);
  taper(f, [63, 58.5, 61, 72.5], 6.8, 4.6, near);
  taper(f, [61, 72.5, 68.5, 75], 4.6, 3.6, near);
  // Near arm punching forward.
  taper(f, [64, 36, 73, 44], 6, 4.8, near);
  taper(f, [73, 44, 81.5, 38.5], 4.8, 4, near);
  f.fillStyle = near;
  f.beginPath(); f.arc(82, 38, 2.6, 0, TAU); f.fill();
  // Neck and hooded head, the hood's point trailing back.
  taper(f, [65.5, 31, 69, 25], 6, 6, near);
  f.fillStyle = near;
  f.beginPath(); f.ellipse(70.5, 24.5, 7, 6.6, -0.35, 0, TAU); f.fill();
  taper(f, [68, 20.5, 61, 19.5, 54.5, 22.5], 7.5, 1.2, near);
}

/** A hooded keeper's head and shoulders, ember eyes in the dark of the hood (box 100 x 100). */
function keeperBust(g: Ctx) {
  const hood = (f: Ctx) => {
    f.beginPath();
    f.moveTo(50, 4);
    f.bezierCurveTo(57, 4, 64, 8, 70, 14);
    f.bezierCurveTo(77, 22, 80, 31, 80, 42);
    f.bezierCurveTo(81, 56, 78, 68, 71, 78);
    f.bezierCurveTo(63, 85, 37, 85, 29, 78);
    f.bezierCurveTo(22, 68, 19, 56, 20, 42);
    f.bezierCurveTo(20, 30, 24, 21, 31, 14);
    f.bezierCurveTo(37, 8, 44, 4, 50, 4);
    f.closePath();
  };
  const face = (f: Ctx) => {
    f.beginPath();
    f.moveTo(50, 24);
    f.bezierCurveTo(60.5, 25, 66.5, 36, 66, 48);
    f.bezierCurveTo(65.5, 60, 58.5, 70, 50, 72);
    f.bezierCurveTo(41.5, 70, 34.5, 60, 34, 48);
    f.bezierCurveTo(33.5, 36, 39.5, 25, 50, 24);
    f.closePath();
  };
  const fold = (f: Ctx, pts: number[], w: number) => {
    // A crease: a dark groove with a lit lip on its upper-left side.
    f.beginPath(); f.moveTo(pts[0], pts[1]); f.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
    f.strokeStyle = css(0x070912, 0.42); f.lineWidth = w * 1.3; f.stroke();
    f.strokeStyle = css(0x070912, 0.35); f.lineWidth = w * 0.5; f.stroke();
    f.beginPath(); f.moveTo(pts[0] - w * 0.7, pts[1] - w * 0.2); f.quadraticCurveTo(pts[2] - w * 0.7, pts[3] - w * 0.3, pts[4] - w * 0.7, pts[5] - w * 0.2);
    f.strokeStyle = css(0x6a77ad, 0.22); f.lineWidth = w * 0.5; f.stroke();
  };
  solid(g, (f) => {
    f.lineCap = 'round';
    // Cloak over the shoulders.
    const cloak = () => {
      f.beginPath();
      f.moveTo(0, 104); f.bezierCurveTo(4, 87, 16, 76, 33, 71); f.lineTo(67, 71); f.bezierCurveTo(84, 76, 96, 87, 100, 104); f.closePath();
    };
    cloak();
    f.fillStyle = lin(f, 8, 70, 92, 104, [[0, css(0x363e64)], [0.3, css(0x222842)], [0.7, css(0x15192c)], [1, css(0x0b0d18)]]);
    f.fill();
    f.save(); cloak(); f.clip();
    fold(f, [22, 77, 20, 92, 14, 104], 2.4);
    fold(f, [33, 74, 33, 90, 28, 104], 1.8);
    fold(f, [70, 75, 72, 90, 78, 104], 2.2);
    fold(f, [81, 80, 86, 92, 90, 104], 2.4);
    speckle(f, 0.18, 7);
    f.restore();
    // Hood.
    hood(f);
    f.fillStyle = lin(f, 24, 8, 78, 82, [[0, css(0x434c78)], [0.25, css(0x2d3456)], [0.6, css(0x1d2239)], [1, css(0x0d1022)]]);
    f.fill();
    f.save(); hood(f); f.clip();
    // Soft volume: the crown catches the moonlight, the cheeks of the hood fall into shade.
    f.fillStyle = rad(f, 40, 16, 1, 30, [[0, css(0x6a77ad, 0.35)], [1, css(0x6a77ad, 0)]]);
    f.fillRect(0, 0, 100, 100);
    fold(f, [43, 8, 29, 26, 24, 52], 2.6);
    fold(f, [57, 8, 70, 25, 75, 50], 2.4);
    fold(f, [50, 6, 48, 14, 47, 21], 1.6);
    fold(f, [27, 56, 30, 68, 36, 77], 1.8);
    fold(f, [73, 56, 70, 68, 64, 77], 1.8);
    speckle(f, 0.16, 7, 3, 1);
    speckle(f, 0.14, 26, 11, 5);
    f.restore();
    // The deep opening of the hood.
    face(f);
    f.fillStyle = rad(f, 50, 58, 2, 28, [[0, css(0x161826)], [0.55, css(0x07080f)], [1, css(0x020306)]]);
    f.fill();
    f.save(); face(f); f.clip();
    f.fillStyle = lin(f, 0, 24, 0, 46, [[0, css(0x000000, 0.85)], [1, css(0x000000, 0)]]);
    f.fillRect(30, 23, 40, 24);
    // Warm lantern light from below on the cheeks and the bridge of the nose.
    f.fillStyle = rad(f, 52, 66, 1, 16, [[0, css(0x7a4628, 0.8)], [0.6, css(0x3a2216, 0.35)], [1, css(0x1a0f0a, 0)]]);
    f.fillRect(30, 44, 40, 30);
    f.fillStyle = css(0x8a5232, 0.45);
    f.beginPath(); f.moveTo(50, 50); f.lineTo(52, 58); f.lineTo(49, 58.6); f.closePath(); f.fill();
    f.restore();
    // Hood lip, lit along the top left.
    face(f);
    f.lineWidth = 3.6;
    f.strokeStyle = lin(f, 36, 28, 62, 70, [[0, css(0x5f6ca2)], [0.4, css(0x353e6a)], [1, css(0x13162c)]]);
    f.stroke();
    // A scarf wrapped over the mouth.
    f.beginPath();
    f.moveTo(34.5, 58); f.quadraticCurveTo(50, 65, 65.5, 58); f.lineTo(68, 71); f.quadraticCurveTo(50, 82, 32, 71); f.closePath();
    f.fillStyle = lin(f, 36, 58, 62, 80, [[0, css(0x2b3150)], [0.5, css(0x1a1e33)], [1, css(0x0b0d18)]]);
    f.fill();
    f.strokeStyle = css(0x06070d, 0.75); f.lineWidth = 1.3;
    f.beginPath(); f.moveTo(38, 64); f.quadraticCurveTo(50, 70, 62, 64); f.moveTo(40, 70.5); f.quadraticCurveTo(50, 75.5, 61, 70.5); f.stroke();
    f.strokeStyle = css(0x4d5786, 0.6); f.lineWidth = 0.8;
    f.beginPath(); f.moveTo(37, 60.4); f.quadraticCurveTo(50, 66.6, 63, 60.4); f.moveTo(39, 66.6); f.quadraticCurveTo(50, 72.2, 61, 66.6); f.stroke();
    // Brass clasp with an amber stone.
    f.fillStyle = metal(f, 45, 83, 55, 93, BRASS);
    f.beginPath(); f.arc(50, 88, 5, 0, TAU); f.fill();
    f.fillStyle = css(BRASS_D); f.beginPath(); f.arc(50, 88, 3.1, 0, TAU); f.fill();
    f.fillStyle = rad(f, 49.2, 87.2, 0.2, 3, [[0, css(AMBER_W)], [0.5, css(AMBER)], [1, css(AMBER_D)]]);
    f.beginPath(); f.arc(50, 88, 2.5, 0, TAU); f.fill();
  }, {
    inkW: 1.6, rimW: 1.6, rimA: 0.6,
    post: (f) => {
      // Warm lantern light from the lower right.
      f.save(); f.globalCompositeOperation = 'source-atop';
      f.fillStyle = lin(f, 100, 100, 60, 60, [[0, css(AMBER, 0.3)], [1, css(AMBER, 0)]]);
      f.fillRect(0, 0, 100, 104);
      f.restore();
    },
  });
  // Ember eyes.
  const eyeAt = (x: number, y: number, rot: number) => {
    bloom(g, x, y, 10, EMBER, 0.85);
    additive(g, () => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = css(0xffd27a); g.beginPath(); g.ellipse(0, 0, 3.6, 1.5, 0, 0, TAU); g.fill();
      g.fillStyle = css(WHITE, 0.95); g.beginPath(); g.ellipse(0.3, 0, 1.7, 0.75, 0, 0, TAU); g.fill();
      g.restore();
    });
  };
  eyeAt(43.2, 49.5, 0.2);
  eyeAt(56.8, 49.5, -0.2);
  additive(g, () => {
    g.fillStyle = lin(g, 30, 50, 70, 50, [[0, css(EMBER, 0)], [0.5, css(EMBER, 0.3)], [1, css(EMBER, 0)]]);
    g.fillRect(30, 49, 40, 1.1);
  });
}

// ---- HUD ----------------------------------------------------------------------------------------------

export function iconLantern(): string {
  return paintIcon('lantern', HUD_PX, (g) => lantern(g, 50, 1.5, 1.14, tint(AMBER), false, 0.75));
}

export function iconDash(): string {
  return paintIcon('dash', HUD_PX, (g) => {
    halo(g, 42, 50, 54, AMBER, 0.62);
    rays(g, 46, 50, 18, 28, 54, AMBER_L, 0.28, 4, 0.045, Math.PI * 0.5, Math.PI * 1.0);
    bloom(g, 50, 48, 40, AMBER, 0.5);
    // A comet of light sweeping up under the runner.
    lightRibbon(g, bez(0, 82, 20, 76, 40, 66, 64, 46, 40), (s) => 15 * s ** 1.3 * Math.min(1, (1 - s) * 3.5), AMBER, 0.9, 1.2, 0.4);
    // Speed streaks behind it.
    const r = rng(9);
    for (let i = 0; i < 11; i++) {
      const y = 22 + i * 5.2 + (r() - 0.5) * 2.4, x0 = r() * 16, x1 = 40 + r() * 14 + (i > 1 && i < 9 ? 8 : 0);
      const w = 1.8 + r() * 2.8;
      lightRibbon(g, bez(x0, y + 7, x0 + 15, y + 5, x1 - 15, y + 1.5, x1, y, 24), (s) => w * s ** 1.4 * Math.min(1, (1 - s) * 6), AMBER, 0.75 + r() * 0.25, 0.8);
    }
    solid(g, (f) => {
      f.translate(52, 50); f.scale(1.12, 1.12); f.translate(-52, -50);
      runner(f, lin(f, 40, 20, 80, 75, [[0, css(0x3a2c22)], [0.5, css(0x1c1418)], [1, css(0x0c090c)]]), css(0x141016));
    }, { rim: AMBER_L, rimW: 2.4, rimA: 0.95, inkW: 1.6, shadeW: 2, shadeA: 0.3 });
    embers(g, 3, 14, 4, 18, 50, 86, AMBER_L, [-1, -0.15], 6);
    motes(g, 7, 5, 30, 50, 10, 30, AMBER_L, 1, 0.9);
  });
}

export function iconSlash(): string {
  return paintIcon('slash', HUD_PX, (g) => {
    halo(g, 52, 50, 52, AMBER, 0.48);
    const main = bez(12, 90, 40, 72, 62, 40, 90, 10, 48);
    const outer = bez(12, 90, 54, 90, 86, 58, 90, 10, 48);
    const inner = bez(12, 90, 16, 52, 44, 16, 90, 10, 48);
    // The swept wake between the two edges.
    g.beginPath();
    for (let i = 0; i < outer.length; i += 2) g.lineTo(outer[i], outer[i + 1]);
    for (let i = inner.length - 2; i >= 0; i -= 2) g.lineTo(inner[i], inner[i + 1]);
    g.closePath();
    g.fillStyle = lin(g, 20, 80, 85, 15, [[0, css(AMBER_D, 0.05)], [0.55, css(AMBER, 0.3)], [1, css(AMBER_L, 0.5)]]);
    g.fill();
    lightRibbon(g, inner, (s) => 3 * Math.sin(Math.PI * s) ** 0.7, AMBER, 0.7, 0.8);
    lightRibbon(g, outer, (s) => 5 * Math.sin(Math.PI * s) ** 0.7 * (0.4 + 0.6 * s), AMBER, 0.85, 1);
    lightRibbon(g, main, (s) => 13 * Math.sin(Math.PI * s) ** 0.85 * (0.3 + 0.7 * s), AMBER, 1, 1.4, 0.5);
    embers(g, 17, 12, 52, 6, 96, 50, AMBER_L, [0.8, -0.6], 5);
    motes(g, 4, 6, 64, 36, 20, 36, AMBER, 1.1, 0.9);
    sparkle(g, 87, 13, 12, AMBER_L, 1, 0.3);
  });
}

export function iconBolt(): string {
  return paintIcon('bolt', HUD_PX, (g) => {
    halo(g, 60, 42, 52, AMBER, 0.48);
    // Spiralling light wrapped around the shaft.
    const shaft = bez(6, 94, 28, 72, 46, 54, 70, 30, 40);
    const k = Math.SQRT1_2;
    for (const ph of [0, Math.PI]) {
      const sp: number[] = [];
      for (let i = 0; i < shaft.length / 2; i++) {
        const s = i / (shaft.length / 2 - 1), o = Math.sin(s * 9 + ph) * (1.5 + 6.5 * s);
        sp.push(shaft[i * 2] + k * o, shaft[i * 2 + 1] + k * o);
      }
      lightRibbon(g, sp, (s) => 2.2 * s * Math.min(1, (1 - s) * 5), AMBER, 0.6, 0.8);
    }
    lightRibbon(g, shaft, (s) => 1.4 + 10 * s ** 1.3, AMBER, 1, 1.4, 0.5);
    // The spearhead: a slender leaf blade with a lit and a shaded facet.
    const tip: Pt = [93, 7], base: Pt = [67, 33];
    const along = (u: number, v: number): Pt => [base[0] + (tip[0] - base[0]) * u + k * v, base[1] + (tip[1] - base[1]) * u + k * v];
    solid(g, (f) => {
      const l1 = along(0.3, -6), l2 = along(0.66, -2.6), r1 = along(0.3, 6), r2 = along(0.66, 2.6);
      f.fillStyle = lin(f, l1[0], l1[1], tip[0], tip[1], [[0, css(AMBER_L)], [1, css(WHITE)]]);
      f.beginPath(); f.moveTo(base[0], base[1]); f.lineTo(l1[0], l1[1]); f.quadraticCurveTo(l2[0], l2[1], tip[0], tip[1]); f.lineTo(base[0], base[1]); f.closePath(); f.fill();
      f.fillStyle = lin(f, r1[0], r1[1], tip[0], tip[1], [[0, css(AMBER_D)], [0.6, css(AMBER)], [1, css(AMBER_L)]]);
      f.beginPath(); f.moveTo(base[0], base[1]); f.lineTo(r1[0], r1[1]); f.quadraticCurveTo(r2[0], r2[1], tip[0], tip[1]); f.lineTo(base[0], base[1]); f.closePath(); f.fill();
      // Brass collar.
      f.fillStyle = metal(f, 60, 34, 70, 44, BRASS);
      f.beginPath(); f.ellipse(base[0] - 1.5, base[1] + 1.5, 6, 3, -Math.PI / 4, 0, TAU); f.fill();
      f.fillStyle = css(BRASS_H); f.beginPath(); f.arc(base[0] - 3.4, base[1] - 0.4, 1, 0, TAU); f.fill();
    }, { rim: WHITE, rimW: 0.9, rimA: 0.6, inkW: 1.4, shadeW: 0 }, [50, 0, 50, 50]);
    additive(g, () => {
      g.strokeStyle = css(WHITE, 0.9); g.lineWidth = 0.9;
      const a = along(0.12, 0);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(tip[0], tip[1]); g.stroke();
    });
    bloom(g, 76, 24, 22, AMBER, 0.55);
    embers(g, 23, 14, 14, 44, 70, 94, AMBER_L, [-0.7, 0.7], 5);
    sparkle(g, 92, 8, 11, AMBER_L, 1, 0.2);
  });
}

export function iconStar(): string {
  return paintIcon('star', STAR_PX, (g) => {
    halo(g, 50, 50, 50, AMBER, 0.5);
    rays(g, 50, 50, 20, 24, 50, AMBER_L, 0.3, 11, 0.035);
    // An eight-pointed star cut into lit and shaded facets.
    solid(g, (f) => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU - Math.PI / 2, r = i % 2 ? 22 : 47;
        const tip: Pt = [50 + Math.cos(a) * r, 50 + Math.sin(a) * r];
        for (const side of [-1, 1]) {
          const b = a + side * (TAU / 16), ri = i % 2 ? 6.5 : 8.5;
          const notch: Pt = [50 + Math.cos(b) * ri, 50 + Math.sin(b) * ri];
          // Facets turned towards the upper left are lit.
          const lit = Math.cos(a + side * 0.9 + Math.PI * 0.75) > -0.1;
          f.fillStyle = lin(f, 50, 50, tip[0], tip[1], lit
            ? [[0, css(AMBER_W)], [0.45, css(AMBER_L)], [1, css(0xffd27a)]]
            : [[0, css(AMBER)], [0.5, css(0xf09a35)], [1, css(0xb8601a)]]);
          f.beginPath(); f.moveTo(50, 50); f.lineTo(tip[0], tip[1]); f.lineTo(notch[0], notch[1]); f.closePath(); f.fill();
        }
      }
    }, { rim: undefined, inkW: 2.4, shadeW: 0 });
    bloom(g, 50, 50, 22, AMBER, 0.6);
    sparkle(g, 50, 50, 11, AMBER_W, 0.9, Math.PI / 4);
  });
}

export function iconPortrait(): string {
  return paintIcon('portrait', HUD_PX, (g) => {
    // Clip to the inside of the HUD's diamond frame: its centre sits at (50, 55) in this box (the 40 px image is
    // placed at 12, 10 in the 64 px .portrait box, see src/ui/style.css).
    g.save();
    g.beginPath(); g.moveTo(50, 55 - 75); g.lineTo(50 + 75, 55); g.lineTo(50, 55 + 75); g.lineTo(50 - 75, 55); g.closePath();
    g.clip();
    halo(g, 50, 50, 50, AMBER, 0.12);
    keeperBust(g);
    g.restore();
  });
}

// ---- upgrade cards ------------------------------------------------------------------------------------

/** Category tints; match --c-offense, --c-defense, --c-mobility and --c-light in src/ui/screens.css. */
const CAT: Record<'offense' | 'defense' | 'mobility' | 'light', number> = {
  offense: 0xffb347, defense: 0xff7a66, mobility: 0x62e6d6, light: 0xe98ad9,
};

/** Card art: a distinct painted symbol per upgrade, lit in its category's colour. */
export function iconUpgrade(id: string, cat: 'offense' | 'defense' | 'mobility' | 'light'): string {
  return paintIcon(`up_${id}_${cat}`, CARD_PX, (g) => {
    const t = tint(CAT[cat]);
    halo(g, 50, 50, 50, t.c, 0.28);
    // Each symbol is drawn about the centre at its own scale, so it fills the round medal.
    const k = GLYPH_SCALE[id] ?? 1;
    g.translate(50, 50); g.scale(k, k); g.translate(-50, -50);
    (GLYPHS[id] ?? GLYPHS.kindled)(g, t);
  });
}

const GLYPH_SCALE: Record<string, number> = {
  kindled: 1.06, quickened: 1.1, brand: 1.12, arc: 1.06, shardbloom: 1.12, piercing: 1.02, glass: 1.1, reaper: 1.08,
  heartwood: 1.12, wisp: 1.1, emberheart: 1.1, mending: 1.12, aegis: 1.06, phase: 1.08, trail: 1.06, fleet: 1.03,
  afterglow: 1.08, flare: 1.06, hoard: 1.08,
};

type Glyph = (g: Ctx, t: Tint) => void;
const GLYPHS: Record<string, Glyph> = {
  // Kindled Edge: a sword whose blade burns.
  kindled: (g, t) => {
    const ang = Math.PI / 4, cx = 46, cy = 56;
    const along = (d: number, side = 0): Pt => [cx + Math.sin(ang) * d - Math.cos(ang) * side, cy - Math.cos(ang) * d - Math.sin(ang) * side];
    // Flames streaming up off the blade (behind it).
    for (let i = 0; i < 7; i++) {
      const [x, y] = along(-4 + i * 8, -3);
      flame(g, x, y, 15 - i * 1.3, 30 - i * 2.4, -0.3, t, 0.6);
    }
    solid(g, (f) => {
      f.translate(cx, cy); f.rotate(ang);
      // Blade: a lit and a shaded bevel either side of the ridge.
      f.fillStyle = lin(f, -6, -50, 0, 12, [[0, css(t.w)], [0.4, css(t.l)], [1, css(t.c)]]);
      f.beginPath(); f.moveTo(0, -58); f.lineTo(-6.4, -44); f.lineTo(-6.6, 12); f.lineTo(0, 12); f.closePath(); f.fill();
      f.fillStyle = lin(f, 0, -50, 0, 12, [[0, css(t.c)], [0.45, css(mix(t.c, t.d, 0.5))], [1, css(t.dd)]]);
      f.beginPath(); f.moveTo(0, -58); f.lineTo(6.4, -44); f.lineTo(6.6, 12); f.lineTo(0, 12); f.closePath(); f.fill();
      f.fillStyle = css(t.d, 0.55);
      f.beginPath(); f.moveTo(0, -46); f.lineTo(1.4, -40); f.lineTo(1.4, 8); f.lineTo(0, 10); f.closePath(); f.fill();
      // Guard, grip and pommel.
      roundPoly(f, [-19, 11, -6, 12.5, 6, 12.5, 19, 11, 16, 18, -16, 18], 2);
      f.fillStyle = metal(f, -19, 11, 19, 18, BRASS); f.fill();
      f.fillStyle = rad(f, 0, 15, 0.3, 3.4, [[0, css(t.w)], [0.6, css(t.c)], [1, css(t.d)]]);
      f.beginPath(); f.arc(0, 15, 3, 0, TAU); f.fill();
      f.fillStyle = lin(f, -3.4, 0, 3.4, 0, [[0, css(0x6a4830)], [1, css(0x1e140e)]]);
      f.fillRect(-3.2, 18, 6.4, 16);
      f.strokeStyle = css(0x0d0907, 0.85); f.lineWidth = 1;
      for (let y = 20; y < 34; y += 3.2) { f.beginPath(); f.moveTo(-3.2, y); f.lineTo(3.2, y + 1.5); f.stroke(); }
      f.fillStyle = metal(f, -5, 34, 5, 44, BRASS); f.beginPath(); f.arc(0, 38.5, 5, 0, TAU); f.fill();
      f.fillStyle = css(BRASS_H); f.beginPath(); f.arc(-1.4, 37, 1.4, 0, TAU); f.fill();
    }, { rim: t.w, rimA: 0.6, inkW: 2 });
    // The edge glows white-hot.
    additive(g, () => {
      const [ax, ay] = along(6, -5.6), [bx, by] = along(44, -5.4), [tx, ty] = along(58);
      g.strokeStyle = lin(g, ax, ay, tx, ty, [[0, css(t.c, 0.2)], [0.6, css(WHITE, 0.85)], [1, css(WHITE, 1)]]);
      g.lineWidth = 1.8; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(tx, ty); g.stroke();
    });
    // Flames licking over the front of the blade.
    for (let i = 0; i < 5; i++) {
      const [x, y] = along(4 + i * 9.5, -7.5);
      flame(g, x, y, 8 - i * 0.8, 17 - i * 1.9, -0.45, t, 0.75);
    }
    embers(g, 31, 16, 10, 6, 66, 56, t.l, [-0.4, -1], 5);
    const [tx, ty] = along(58);
    sparkle(g, tx, ty, 12, t.l, 1, 0.2);
  },

  // Quickened Rite: three swift strikes inside a ritual ring.
  quickened: (g, t) => {
    additive(g, () => {
      g.strokeStyle = css(t.c, 0.35); g.lineWidth = 1.2;
      g.beginPath(); g.arc(50, 50, 41, 0, TAU); g.stroke();
      g.strokeStyle = css(t.c, 0.22); g.lineWidth = 0.7;
      g.beginPath(); g.arc(50, 50, 37, 0, TAU); g.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        g.fillStyle = css(t.l, i % 3 ? 0.35 : 0.7);
        g.beginPath(); g.arc(50 + Math.cos(a) * 39, 50 + Math.sin(a) * 39, i % 3 ? 0.8 : 1.6, 0, TAU); g.fill();
      }
    });
    const ux = 0.72, uy = -0.69, px = 0.69, py = 0.72;
    for (let i = -1; i <= 1; i++) {
      const o = i * 15, sx = 50 - ux * 40 + px * o, sy = 52 - uy * 40 + py * o, ex = 50 + ux * 38 + px * o, ey = 52 + uy * 38 + py * o;
      const pts = bez(sx, sy, sx + ux * 22 - px * 12, sy + uy * 22 - py * 12, ex - ux * 22 - px * 12, ey - uy * 22 - py * 12, ex, ey, 40);
      const k = i === -1 ? 1 : i === 0 ? 0.85 : 0.7;
      lightRibbon(g, pts, (s) => 8 * k * Math.sin(Math.PI * s) ** 0.75 * (0.35 + 0.65 * s), t.c, 0.6 + 0.4 * k, 0.55, 0.45);
      sparkle(g, ex, ey, 6 * k + 2, t.l, k);
    }
    embers(g, 5, 10, 20, 20, 80, 80, t.l, [0.7, -0.7], 4);
  },

  // Ember Brand: a fierce flame over a glowing brand mark.
  brand: (g, t) => {
    const r = rng(41);
    additive(g, () => {
      g.save(); g.translate(50, 82); g.scale(1, 0.32);
      g.fillStyle = rad(g, 0, 0, 2, 34, [[0, css(t.w, 0.9)], [0.35, css(t.c, 0.55)], [1, css(t.c, 0)]]);
      g.beginPath(); g.arc(0, 0, 34, 0, TAU); g.fill();
      g.strokeStyle = css(t.l, 0.8); g.lineWidth = 1.6;
      g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2;
        g.beginPath(); g.moveTo(Math.cos(a) * 22, Math.sin(a) * 22); g.lineTo(Math.cos(a) * 27, Math.sin(a) * 27); g.stroke();
      }
      g.restore();
    });
    flame(g, 34, 82, 22, 40, -0.12, t, 0.75);
    flame(g, 66, 82, 22, 44, 0.14, t, 0.75);
    flame(g, 50, 84, 40, 76, 0.04, t, 1);
    flame(g, 46, 84, 20, 46, -0.1, t, 0.9);
    bloom(g, 50, 66, 24, t.c, 0.7);
    embers(g, 9, 16, 22, 10, 78, 70, t.l, [r() * 0.3, -1], 5);
    motes(g, 12, 6, 50, 40, 24, 40, t.l, 1.2, 0.9);
  },

  // Arc Thread: lightning leaping between foes.
  arc: (g, t) => {
    const nodes: Pt[] = [[18, 26], [52, 54], [84, 28], [72, 86]];
    const links: [number, number, number][] = [[0, 1, 3], [1, 2, 5], [1, 3, 8]];
    bloom(g, 52, 54, 34, t.c, 0.5);
    for (const [a, b, s] of links) {
      const p = boltPts(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1], s, 7, 7);
      lightning(g, p, 2.4, t.c, 1);
      const br = boltPts(p[6], p[7], p[6] + (p[6] - p[4]) * 0.6 + 6, p[7] + (p[7] - p[5]) * 0.6 - 8, s + 50, 4, 3);
      lightning(g, br, 1.1, t.c, 0.75);
    }
    for (const [i, [x, y]] of nodes.entries()) {
      const rr = i === 1 ? 8.5 : 6;
      bloom(g, x, y, rr * 3.2, t.c, 0.9);
      solid(g, (f) => {
        f.fillStyle = rad(f, x - rr * 0.35, y - rr * 0.35, 0.5, rr, [[0, css(WHITE)], [0.35, css(t.w)], [0.7, css(t.l)], [1, css(t.c)]]);
        f.beginPath(); f.arc(x, y, rr, 0, TAU); f.fill();
        f.strokeStyle = css(t.d, 0.6); f.lineWidth = 0.8;
        f.beginPath(); f.arc(x, y, rr * 0.62, 0.3, 2.4); f.stroke();
      }, { rim: undefined, shadeW: 1.6, shadeA: 0.35, inkW: 1.4 }, [x - rr - 3, y - rr - 3, rr * 2 + 6, rr * 2 + 6]);
      sparkle(g, x, y, rr * 1.5, t.l, 0.85, i * 0.4);
    }
  },

  // Shardbloom: crystal shards bursting from a slain foe.
  shardbloom: (g, t) => {
    const cx = 50, cy = 52, n = 7;
    rays(g, cx, cy, 14, 30, 50, t.c, 0.3, 61, 0.05);
    solid(g, (f) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU - Math.PI / 2 + 0.2, len = i % 2 ? 31 : 42, w = i % 2 ? 5.5 : 7;
        const c = Math.cos(a), s = Math.sin(a), qx = -s, qy = c;
        const b0: Pt = [cx + c * 9, cy + s * 9], m: Pt = [cx + c * (len * 0.45), cy + s * (len * 0.45)], tip: Pt = [cx + c * len, cy + s * len];
        const lft: Pt = [m[0] + qx * w, m[1] + qy * w], rgt: Pt = [m[0] - qx * w, m[1] - qy * w];
        const litLeft = qx * -0.7 + qy * -0.7 > 0;
        const sideFill = (lit: boolean) => lin(f, b0[0], b0[1], tip[0], tip[1], lit
          ? [[0, css(WHITE)], [0.4, css(t.w)], [1, css(t.l)]]
          : [[0, css(t.l)], [0.5, css(t.c)], [1, css(t.d)]]);
        f.fillStyle = sideFill(litLeft);
        f.beginPath(); f.moveTo(b0[0], b0[1]); f.lineTo(lft[0], lft[1]); f.lineTo(tip[0], tip[1]); f.closePath(); f.fill();
        f.fillStyle = sideFill(!litLeft);
        f.beginPath(); f.moveTo(b0[0], b0[1]); f.lineTo(rgt[0], rgt[1]); f.lineTo(tip[0], tip[1]); f.closePath(); f.fill();
      }
    }, { rim: t.w, rimA: 0.4, shadeW: 1.5 }, [5, 6, 90, 90]);
    bloom(g, cx, cy, 26, t.c, 1);
    sparkle(g, cx, cy, 15, t.w, 1);
    motes(g, 3, 8, cx, cy, 30, 46, t.l, 1.3, 0.9);
  },

  // Piercing Dawn: a lance of dawn light driven through two rings.
  piercing: (g, t) => {
    rays(g, 50, 98, 18, 40, 70, t.c, 0.4, 5, 0.06, Math.PI, Math.PI);
    additive(g, () => {
      g.fillStyle = rad(g, 50, 100, 4, 36, [[0, css(t.w, 0.95)], [0.35, css(t.c, 0.55)], [1, css(t.c, 0)]]);
      g.beginPath(); g.arc(50, 100, 36, Math.PI, TAU); g.fill();
    });
    const rings: [number, number, number][] = [[33, 67, 15], [58, 42, 18]];
    const ringArc = (front: boolean) => {
      for (const [x, y, r] of rings) {
        g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
        lightRibbon(g, arcPts(0, 0, r * 0.5, r, front ? -Math.PI / 2 : Math.PI / 2, front ? Math.PI / 2 : Math.PI * 1.5, 30), () => 2.8, t.c, front ? 1 : 0.55, 0.8, 0.45);
        g.restore();
      }
    };
    ringArc(false);
    lightRibbon(g, bez(6, 94, 28, 72, 50, 50, 72, 28, 30), (s) => 1.4 + 8 * s, t.c, 1, 1.4, 0.5);
    ringArc(true);
    for (const [x, y] of rings) { bloom(g, x, y, 10, t.c, 0.8); }
    const k = Math.SQRT1_2, tip: Pt = [93, 7], base: Pt = [69, 31];
    const along = (u: number, v: number): Pt => [base[0] + (tip[0] - base[0]) * u + k * v, base[1] + (tip[1] - base[1]) * u + k * v];
    solid(g, (f) => {
      const l = along(0.2, -7), r = along(0.2, 7);
      f.fillStyle = lin(f, l[0], l[1], tip[0], tip[1], [[0, css(t.l)], [1, css(WHITE)]]);
      f.beginPath(); f.moveTo(tip[0], tip[1]); f.lineTo(l[0], l[1]); f.lineTo(base[0], base[1]); f.closePath(); f.fill();
      f.fillStyle = lin(f, r[0], r[1], tip[0], tip[1], [[0, css(t.d)], [1, css(t.c)]]);
      f.beginPath(); f.moveTo(tip[0], tip[1]); f.lineTo(r[0], r[1]); f.lineTo(base[0], base[1]); f.closePath(); f.fill();
    }, { rim: WHITE, rimA: 0.5, inkW: 1.4, shadeW: 0 }, [55, 0, 45, 45]);
    sparkle(g, 92, 8, 12, t.l, 1, 0.3);
    embers(g, 15, 12, 30, 30, 92, 72, t.l, [0.7, -0.7], 5);
  },

  // Glass Lantern: a cracked lantern bleeding light.
  glass: (g, t) => lantern(g, 46, 9, 0.98, t, true),

  // Dusk Reaper: a scythe before a dusk moon.
  reaper: (g, t) => {
    // The moon.
    additive(g, () => {
      g.save();
      g.beginPath(); g.arc(56, 44, 30, 0, TAU); g.arc(66, 36, 26, 0, TAU, true); g.clip('evenodd');
      g.fillStyle = rad(g, 46, 54, 4, 34, [[0, css(t.w, 0.85)], [0.5, css(t.c, 0.6)], [1, css(t.d, 0.25)]]);
      g.fillRect(0, 0, 100, 100);
      g.restore();
    });
    bloom(g, 40, 58, 30, t.c, 0.4);
    solid(g, (f) => {
      // Snath.
      taper(f, [28, 94, 42, 58, 60, 18], 5, 4, lin(f, 30, 0, 50, 0, [[0, css(0x6b4a30)], [1, css(0x2a1a10)]]));
      f.fillStyle = metal(f, 34, 70, 44, 76, BRASS); f.beginPath(); f.ellipse(38.8, 72, 4.2, 2.4, -1.15, 0, TAU); f.fill();
      taper(f, [38, 66, 30, 62], 3.4, 3, css(0x3a281a));
      // Blade.
      f.beginPath();
      f.moveTo(62, 14);
      f.bezierCurveTo(48, 6, 26, 8, 8, 30);
      f.bezierCurveTo(28, 18, 46, 18, 58, 26);
      f.closePath();
      f.fillStyle = lin(f, 30, 8, 36, 26, [[0, css(0xe3e8f4)], [0.4, css(0x8a93ab)], [1, css(0x2a2f40)]]);
      f.fill();
      f.strokeStyle = css(0x1a1d28, 0.8); f.lineWidth = 0.8;
      f.beginPath(); f.moveTo(58, 17); f.bezierCurveTo(46, 12, 30, 13, 16, 24); f.stroke();
      f.fillStyle = metal(f, 56, 12, 66, 26, IRON); f.beginPath(); f.ellipse(60, 19, 4.6, 6, 0.5, 0, TAU); f.fill();
    }, { rim: MOON_L, rimA: 0.65 });
    // The edge glows.
    lightRibbon(g, bez(57, 25.5, 46, 18, 28, 18, 9, 29.5, 30), (s) => 1.8 * Math.sin(Math.PI * (0.15 + s * 0.85)) ** 0.5, t.c, 1, 4, 0.5);
    sparkle(g, 10, 29, 9, t.l, 0.95, 0.3);
    embers(g, 44, 8, 20, 40, 80, 90, t.l, [-0.5, -1], 4, 0.7);
  },

  // Heartwood: a heart of living wood with a sapling and glowing grain.
  heartwood: (g, t) => {
    bloom(g, 50, 58, 36, t.c, 0.45);
    solid(g, (f) => {
      heartPath(f, 50, 58, 34);
      f.fillStyle = lin(f, 20, 30, 80, 90, [[0, css(0x9a6a44)], [0.4, css(0x6a4428)], [1, css(0x2c1b10)]]);
      f.fill();
      f.save(); heartPath(f, 50, 58, 34); f.clip();
      // Growth rings.
      for (let i = 1; i < 6; i++) {
        heartPath(f, 49 + i * 0.4, 61 - i * 0.2, 34 - i * 5.6);
        f.strokeStyle = css(0x2a180c, 0.5); f.lineWidth = 1.3; f.stroke();
        heartPath(f, 48.4 + i * 0.4, 60.4 - i * 0.2, 34 - i * 5.6);
        f.strokeStyle = css(0xc08a5c, 0.28); f.lineWidth = 0.6; f.stroke();
      }
      speckle(f, 0.35, 6);
      speckle(f, 0.25, 30, 7, 3);
      // Bark rim.
      heartPath(f, 50, 58, 34); f.strokeStyle = css(0x24150b); f.lineWidth = 4.5; f.stroke();
      heartPath(f, 49.4, 57.3, 34); f.strokeStyle = css(0x8a5e3a, 0.5); f.lineWidth = 1.2; f.stroke();
      f.restore();
      // Sapling.
      taper(f, [50, 40, 51, 30, 56, 18], 3, 1.6, css(0x3f6b3e));
      leafPath(f, 55, 21, -0.5, 18, 5.5, 0.4);
      f.fillStyle = lin(f, 56, 12, 70, 22, [[0, css(0x7ccf9a)], [1, css(0x2a7a5a)]]); f.fill();
      leafPath(f, 52, 28, Math.PI + 0.55, 14, 4.4, -0.4);
      f.fillStyle = lin(f, 40, 20, 52, 30, [[0, css(0x6cbf8c)], [1, css(0x226048)]]); f.fill();
    }, { rim: MOON_L, rimA: 0.5 }, [10, 6, 80, 92]);
    // Glowing veins in the grain.
    const vein = (pts: number[], w: number) => lightning(g, pts, w, t.c, 0.85);
    vein([50, 82, 49, 72, 52, 64, 48, 56, 51, 47], 1.5);
    vein([52, 64, 60, 60, 68, 50, 74, 44], 1.1);
    vein([48, 56, 40, 52, 32, 44, 26, 42], 1.1);
    bloom(g, 50, 62, 14, t.c, 0.9);
    sparkle(g, 50, 62, 8, t.w, 0.9);
    motes(g, 8, 6, 50, 56, 36, 46, t.l, 1.1, 0.8);
  },

  // Lantern Wisp: a spirit circling the keeper on a ring of light.
  wisp: (g, t) => {
    const cx = 50, cy = 60, rx = 42, ry = 15, rot = -0.28;
    lightRibbon(g, arcPts(cx, cy, rx, ry, Math.PI, TAU, 50, rot), () => 1.6, t.c, 0.45, 0.8, 0.4);
    g.save(); g.translate(25, 18); g.scale(0.5, 0.5);
    keeperBust(g);
    g.restore();
    lightRibbon(g, arcPts(cx, cy, rx, ry, 0, Math.PI, 50, rot), () => 1.9, t.c, 0.7, 0.8, 0.4);
    // The wisp and its tail.
    const ta = 0.95, tail = arcPts(cx, cy, rx, ry, ta - 2.1, ta, 40, rot);
    lightRibbon(g, tail, (s) => 13 * s ** 1.6, t.c, 0.95, 1.2, 0.45);
    const wx = tail[tail.length - 2], wy = tail[tail.length - 1];
    bloom(g, wx, wy, 28, t.c, 1);
    solid(g, (f) => {
      f.fillStyle = rad(f, wx - 2.5, wy - 2.5, 0.5, 10, [[0, css(WHITE)], [0.4, css(t.w)], [0.8, css(t.l)], [1, css(t.c)]]);
      f.beginPath(); f.arc(wx, wy, 9.5, 0, TAU); f.fill();
      f.fillStyle = css(t.dd, 0.9);
      f.beginPath(); f.ellipse(wx - 2.8, wy - 0.4, 1.2, 2.1, 0, 0, TAU); f.ellipse(wx + 2.8, wy - 0.4, 1.2, 2.1, 0, 0, TAU); f.fill();
    }, { rim: undefined, inkW: 1.2, shadeW: 1.5, shadeA: 0.25 }, [wx - 14, wy - 14, 28, 28]);
    sparkle(g, wx + 6, wy - 7, 7, t.w, 0.9);
    motes(g, 19, 7, cx, cy, 30, 46, t.l, 1, 0.8);
  },

  // Ember Heart: a burning crystal heart that rekindles.
  emberheart: (g, t) => {
    const cx = 50, cy = 60, s = 31;
    flame(g, 34, 42, 18, 34, -0.15, t, 0.8);
    flame(g, 66, 42, 18, 34, 0.15, t, 0.8);
    flame(g, 50, 40, 22, 40, 0, t, 0.75);
    bloom(g, cx, cy, 40, t.c, 0.55);
    solid(g, (f) => {
      heartPath(f, cx, cy, s);
      f.fillStyle = rad(f, cx - 6, cy - 6, 1, s * 1.2, [[0, css(t.w)], [0.3, css(t.l)], [0.65, css(t.c)], [1, css(t.dd)]]);
      f.fill();
      f.save(); heartPath(f, cx, cy, s); f.clip();
      // Facets: lines from the core to points on the rim, each facet a shade lighter or darker.
      const core: Pt = [cx - 2, cy - 2];
      const rim: Pt[] = [[cx, cy - s * 0.48], [cx - s * 0.6, cy - s * 0.95], [cx - s * 1.05, cy - s * 0.35], [cx - s * 0.7, cy + s * 0.35], [cx, cy + s * 0.95], [cx + s * 0.7, cy + s * 0.35], [cx + s * 1.05, cy - s * 0.35], [cx + s * 0.6, cy - s * 0.95]];
      for (let i = 0; i < rim.length; i++) {
        const a = rim[i], b = rim[(i + 1) % rim.length];
        const lit = (a[0] + b[0]) / 2 < cx + 2 && (a[1] + b[1]) / 2 < cy + 8;
        f.fillStyle = css(lit ? WHITE : 0x000000, lit ? 0.14 + (i % 2) * 0.08 : 0.16 + (i % 2) * 0.12);
        f.beginPath(); f.moveTo(core[0], core[1]); f.lineTo(a[0], a[1]); f.lineTo(b[0], b[1]); f.closePath(); f.fill();
        f.strokeStyle = css(t.w, 0.5); f.lineWidth = 0.7;
        f.beginPath(); f.moveTo(core[0], core[1]); f.lineTo(a[0], a[1]); f.stroke();
      }
      f.restore();
    }, { rim: t.w, rimA: 0.55 }, [12, 20, 76, 76]);
    lightning(g, [cx - 12, cy + 12, cx - 4, cy + 4, cx - 6, cy - 4, cx + 2, cy - 12], 1.2, t.l, 0.9);
    bloom(g, cx - 2, cy - 2, 18, t.c, 0.9);
    sparkle(g, cx - 2, cy - 2, 12, t.w, 1);
    embers(g, 71, 16, 18, 8, 82, 50, t.l, [0, -1], 5);
  },

  // Mending Motes: motes of light spiralling into a healing cross.
  mending: (g, t) => {
    const cx = 50, cy = 50;
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * TAU + 0.5, pts: number[] = [];
      for (let i = 0; i <= 30; i++) {
        const s = i / 30, a = a0 + s * 2.2, r = 46 - s * 26;
        pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      lightRibbon(g, pts, (s) => 3.2 * s ** 0.8 * Math.min(1, (1 - s) * 4) + 0.2, t.c, 0.7, 3, 0.4);
      const hx = pts[0], hy = pts[1];
      bloom(g, hx, hy, 9, t.c, 0.9);
      additive(g, () => { g.fillStyle = css(t.w); g.beginPath(); g.arc(hx, hy, 2.2, 0, TAU); g.fill(); });
    }
    bloom(g, cx, cy, 30, t.c, 0.7);
    const cross = (f: Ctx, k: number) => roundPoly(f, [cx - 8 * k, cy - 26 * k, cx + 8 * k, cy - 26 * k, cx + 8 * k, cy - 8 * k, cx + 26 * k, cy - 8 * k, cx + 26 * k, cy + 8 * k, cx + 8 * k, cy + 8 * k, cx + 8 * k, cy + 26 * k, cx - 8 * k, cy + 26 * k, cx - 8 * k, cy + 8 * k, cx - 26 * k, cy + 8 * k, cx - 26 * k, cy - 8 * k, cx - 8 * k, cy - 8 * k], 3 * k);
    solid(g, (f) => {
      cross(f, 1);
      f.fillStyle = rad(f, cx - 6, cy - 6, 1, 34, [[0, css(WHITE)], [0.3, css(t.w)], [0.65, css(t.l)], [1, css(t.c)]]);
      f.fill();
      cross(f, 0.66);
      f.strokeStyle = css(WHITE, 0.55); f.lineWidth = 1; f.stroke();
    }, { rim: WHITE, rimA: 0.45, shadeW: 2.8, shadeA: 0.4 }, [18, 18, 64, 64]);
    sparkle(g, cx, cy, 14, t.w, 0.9, Math.PI / 4);
  },

  // Radiant Aegis: a shield with a sun boss inside a ward ring.
  aegis: (g, t) => {
    const shield = (f: Ctx, k: number, ox = 0, oy = 0) => {
      const X = (x: number) => 50 + (x - 50) * k + ox, Y = (y: number) => 52 + (y - 52) * k + oy;
      f.beginPath();
      f.moveTo(X(50), Y(13));
      f.quadraticCurveTo(X(66), Y(20), X(80), Y(17));
      f.bezierCurveTo(X(81), Y(48), X(74), Y(72), X(50), Y(91));
      f.bezierCurveTo(X(26), Y(72), X(19), Y(48), X(20), Y(17));
      f.quadraticCurveTo(X(34), Y(20), X(50), Y(13));
      f.closePath();
    };
    // The ward: broken arcs of light around the shield.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.2;
      lightRibbon(g, arcPts(50, 52, 45, 45, a, a + 0.8, 16), (s) => 2.6 * Math.sin(Math.PI * s) ** 0.4, t.c, 0.75, 1, 0.4);
    }
    solid(g, (f) => {
      shield(f, 1);
      f.fillStyle = metal(f, 20, 13, 80, 91, 0x8d95ad, 0.5); f.fill();
      shield(f, 0.84, 0, -1);
      f.fillStyle = rad(f, 46, 44, 2, 44, [[0, css(mix(t.d, 0x1b2138, 0.4))], [0.6, css(0x1b2138)], [1, css(0x0b0e1a)]]);
      f.fill();
      f.save(); shield(f, 0.84, 0, -1); f.clip(); speckle(f, 0.3, 6); speckle(f, 0.25, 28, 5, 9); f.restore();
      shield(f, 0.84, 0, -1);
      f.strokeStyle = metal(f, 24, 20, 76, 84, BRASS); f.lineWidth = 1.6; f.stroke();
      f.fillStyle = css(BRASS_H);
      for (const [x, y] of [[26, 22], [74, 22], [24, 46], [76, 46], [36, 74], [64, 74]]) { f.beginPath(); f.arc(x, y, 1.3, 0, TAU); f.fill(); }
    }, { rim: MOON_L, rimA: 0.6 }, [14, 8, 72, 88]);
    // Sun emblem.
    const sx = 50, sy = 48;
    rays(g, sx, sy, 16, 14, 26, t.l, 0.5, 8, 0.07);
    solid(g, (f) => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU - Math.PI / 2, r = i % 2 ? 15 : 21;
        f.beginPath();
        f.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
        f.lineTo(sx + Math.cos(a + 0.3) * 9, sy + Math.sin(a + 0.3) * 9);
        f.lineTo(sx + Math.cos(a - 0.3) * 9, sy + Math.sin(a - 0.3) * 9);
        f.closePath();
        f.fillStyle = lin(f, sx, sy, sx + Math.cos(a) * r, sy + Math.sin(a) * r, [[0, css(t.w)], [1, css(t.c)]]);
        f.fill();
      }
      f.fillStyle = rad(f, sx - 2, sy - 2, 0.5, 9, [[0, css(WHITE)], [0.5, css(t.w)], [1, css(t.l)]]);
      f.beginPath(); f.arc(sx, sy, 8.5, 0, TAU); f.fill();
    }, { rim: undefined, inkW: 1.3, shadeW: 1.2, shadeA: 0.25 }, [sx - 25, sy - 25, 50, 50]);
    bloom(g, sx, sy, 16, t.c, 0.8);
    sparkle(g, 30, 22, 7, t.w, 0.8);
  },

  // Phase Step: the keeper dashing out of two afterimages.
  phase: (g, t) => {
    for (let i = 0; i < 9; i++) {
      const y = 26 + i * 6, x0 = (i % 3) * 5, x1 = 30 + ((i * 7) % 11);
      lightRibbon(g, bez(x0, y, x0 + 10, y, x1 - 10, y - 1, x1, y - 1.5, 16), (s) => 2.4 * s * Math.min(1, (1 - s) * 5), t.c, 0.6, 0.7);
    }
    // Afterimages: the silhouette in flat light, fading towards the back.
    const d = g.getTransform().a;
    const ghost = layer(100, 100, d);
    runner(ghost.g, css(WHITE), css(WHITE));
    ghost.g.globalCompositeOperation = 'source-in';
    ghost.g.fillStyle = lin(ghost.g, 15, 0, 85, 0, [[0, css(t.c, 0)], [0.5, css(t.c, 0.7)], [1, css(t.l)]]);
    ghost.g.fillRect(0, 0, 100, 100);
    additive(g, () => {
      g.globalAlpha = 0.35; g.drawImage(ghost.c, -24, 0, 100, 100);
      g.globalAlpha = 0.6; g.drawImage(ghost.c, -12, 0, 100, 100);
    });
    solid(g, (f) => runner(f, lin(f, 40, 20, 80, 75, [[0, css(0x24404a)], [0.5, css(0x12222a)], [1, css(0x081218)]]), css(0x0c1a20)),
      { rim: t.l, rimW: 2, rimA: 0.9, inkW: 1.5 });
    bloom(g, 72, 24, 10, t.c, 0.7);
    additive(g, () => { g.fillStyle = css(t.w); g.beginPath(); g.ellipse(74, 24.5, 1.6, 1.1, 0, 0, TAU); g.fill(); });
    // Two dash charges.
    for (const x of [40, 54]) {
      bloom(g, x, 89, 11, t.c, 0.8);
      solid(g, (f) => {
        f.fillStyle = lin(f, x - 4, 84, x + 4, 94, [[0, css(WHITE)], [0.35, css(t.w)], [0.7, css(t.c)], [1, css(t.d)]]);
        f.beginPath(); f.moveTo(x, 82.5); f.lineTo(x + 5, 89); f.lineTo(x, 95.5); f.lineTo(x - 5, 89); f.closePath(); f.fill();
      }, { rim: undefined, inkW: 1.2, shadeW: 1.2, shadeA: 0.25 }, [x - 8, 79, 16, 20]);
    }
  },

  // Cinder Trail: a dash that leaves a burning path.
  trail: (g, t) => {
    const path = bez(6, 84, 30, 84, 60, 70, 92, 34, 40);
    lightRibbon(g, path, (s) => 2 + 9 * s ** 1.2 * Math.min(1, (1 - s) * 8), t.c, 0.9, 5, 0.45);
    const fire = tint(EMBER);
    for (let i = 0; i < 6; i++) {
      const s = 0.12 + i * 0.13, k = Math.round(s * 40) * 2;
      const x = path[k], y = path[k + 1];
      flame(g, x, y + 1, 7 + i * 1.6, 12 + i * 4.2, -0.15, fire, 0.85);
    }
    embers(g, 4, 18, 14, 20, 84, 76, fire.l, [-0.2, -1], 5);
    sparkle(g, 91, 35, 10, t.l, 1, 0.3);
  },

  // Fleetfoot: a winged boot.
  fleet: (g, t) => {
    for (let i = 0; i < 4; i++) {
      const y = 52 + i * 8;
      lightRibbon(g, bez(2 + i * 4, y, 12, y, 22, y, 32, y, 12), (s) => 2.4 * s * Math.min(1, (1 - s) * 5), t.c, 0.7, 0.8);
    }
    // Wing.
    bloom(g, 30, 30, 34, t.c, 0.6);
    solid(g, (f) => {
      for (let i = 5; i >= 0; i--) {
        const a = Math.PI + 0.42 + i * 0.25, len = 40 - i * 4;
        leafPath(f, 46, 42, a, len, 4.4, 0.55);
        f.fillStyle = lin(f, 46, 42, 46 + Math.cos(a) * len, 42 + Math.sin(a) * len, [[0, css(t.d)], [0.35, css(t.c)], [0.8, css(t.w)], [1, css(WHITE)]]);
        f.fill();
        f.strokeStyle = css(t.d, 0.55); f.lineWidth = 0.7;
        f.beginPath(); f.moveTo(46, 42); f.lineTo(46 + Math.cos(a) * len * 0.85, 42 + Math.sin(a) * len * 0.85); f.stroke();
      }
    }, { rim: undefined, inkW: 1.4, shadeW: 1.4, shadeA: 0.25 }, [0, 0, 56, 56]);
    // Boot.
    const boot = (f: Ctx) => {
      f.beginPath();
      f.moveTo(42, 30); f.lineTo(62, 30);
      f.bezierCurveTo(62, 46, 63, 56, 68, 62);
      f.bezierCurveTo(78, 66, 88, 68, 89, 76);
      f.lineTo(89, 81); f.lineTo(36, 81);
      f.bezierCurveTo(35, 70, 41, 60, 41, 48);
      f.closePath();
    };
    solid(g, (f) => {
      boot(f);
      f.fillStyle = lin(f, 36, 30, 80, 82, [[0, css(0x8a6040)], [0.35, css(0x5a3c28)], [1, css(0x22160e)]]);
      f.fill();
      f.save(); boot(f); f.clip();
      speckle(f, 0.3, 6); speckle(f, 0.2, 26, 3, 7);
      // Toe cap and heel.
      f.fillStyle = css(0x2a1b12); f.beginPath(); f.moveTo(36, 78); f.lineTo(36, 70); f.lineTo(44, 70); f.lineTo(46, 78); f.closePath(); f.fill();
      f.fillStyle = lin(f, 70, 62, 84, 78, [[0, css(0xa87a52, 0.5)], [1, css(0xa87a52, 0)]]);
      f.beginPath(); f.ellipse(78, 70, 9, 5, 0.3, 0, TAU); f.fill();
      f.restore();
      f.fillStyle = css(0x140d09); f.fillRect(35, 78, 54.5, 4.5);
      // Folded cuff with a brass band.
      rrect(f, 39.5, 26, 25, 9, 2.5);
      f.fillStyle = lin(f, 40, 26, 64, 35, [[0, css(0x9a7050)], [1, css(0x3a281a)]]); f.fill();
      f.fillStyle = metal(f, 41, 0, 63, 0, BRASS); f.fillRect(41, 34, 22, 2.4);
      // Laces and seam.
      f.strokeStyle = css(0x0e0a07, 0.85); f.lineWidth = 1.1;
      for (let i = 0; i < 4; i++) { f.beginPath(); f.moveTo(58 + i * 1.2, 40 + i * 5.5); f.lineTo(64 + i * 1.4, 43 + i * 5.5); f.stroke(); }
      f.strokeStyle = css(0xc08a5c, 0.4); f.lineWidth = 0.8;
      f.beginPath(); f.moveTo(44, 38); f.bezierCurveTo(44, 52, 40, 62, 39, 72); f.stroke();
    }, { rim: t.l, rimA: 0.6 }, [30, 20, 64, 68]);
    sparkle(g, 22, 20, 8, t.w, 0.9);
    motes(g, 5, 6, 28, 38, 4, 22, t.l, 1, 0.8);
  },

  // Afterglow: an hourglass of light wrapped in a dash that slows time.
  afterglow: (g, t) => {
    const cx = 50;
    lightRibbon(g, arcPts(cx, 52, 42, 22, Math.PI * 0.95, Math.PI * 2.05, 40, -0.45), (s) => 6 * Math.sin(Math.PI * s) ** 0.8 * (0.3 + 0.7 * s), t.c, 0.55, 4);
    const bulbs = (f: Ctx) => {
      f.beginPath();
      f.moveTo(cx - 17, 21);
      f.bezierCurveTo(cx - 17, 38, cx - 3, 44, cx - 2.5, 51);
      f.bezierCurveTo(cx - 3, 58, cx - 17, 64, cx - 17, 81);
      f.lineTo(cx + 17, 81);
      f.bezierCurveTo(cx + 17, 64, cx + 3, 58, cx + 2.5, 51);
      f.bezierCurveTo(cx + 3, 44, cx + 17, 38, cx + 17, 21);
      f.closePath();
    };
    solid(g, (f) => {
      // Glass.
      bulbs(f);
      f.fillStyle = css(mix(t.dd, 0x101626, 0.5), 0.85); f.fill();
      f.save(); bulbs(f); f.clip();
      // Sand: the remains in the top bulb, the stream, the heap below.
      f.fillStyle = lin(f, 0, 34, 0, 50, [[0, css(t.l)], [1, css(t.c)]]);
      f.beginPath(); f.moveTo(cx - 13, 36); f.quadraticCurveTo(cx, 40, cx + 13, 36); f.lineTo(cx, 52); f.closePath(); f.fill();
      f.fillStyle = lin(f, 0, 66, 0, 82, [[0, css(t.w)], [0.4, css(t.l)], [1, css(t.c)]]);
      f.beginPath(); f.moveTo(cx - 17, 82); f.quadraticCurveTo(cx - 6, 68, cx, 66); f.quadraticCurveTo(cx + 6, 68, cx + 17, 82); f.closePath(); f.fill();
      f.fillStyle = css(t.w); f.fillRect(cx - 0.7, 50, 1.4, 17);
      // Highlights on the glass.
      f.strokeStyle = css(WHITE, 0.55); f.lineWidth = 1.6;
      f.beginPath(); f.moveTo(cx - 12, 25); f.quadraticCurveTo(cx - 12, 36, cx - 6, 42); f.stroke();
      f.beginPath(); f.moveTo(cx - 12, 77); f.quadraticCurveTo(cx - 12, 66, cx - 7, 60); f.stroke();
      f.restore();
      // Frame.
      const cap = (y: number) => { rrect(f, cx - 22, y, 44, 6, 2); f.fillStyle = metal(f, cx - 22, y, cx + 22, y + 6, BRASS); f.fill(); };
      cap(15); cap(81);
      for (const x of [cx - 20, cx + 20]) {
        f.fillStyle = metal(f, x - 1.6, 0, x + 1.6, 0, BRASS_D, 0.7);
        f.fillRect(x - 1.5, 20, 3, 62);
        f.fillStyle = metal(f, x - 2.5, 0, x + 2.5, 0, BRASS);
        f.beginPath(); f.ellipse(x, 51, 2.4, 4, 0, 0, TAU); f.fill();
      }
    }, { rim: MOON_L, rimA: 0.55 }, [22, 10, 56, 82]);
    bloom(g, cx, 70, 22, t.c, 0.8);
    bloom(g, cx, 42, 12, t.c, 0.6);
    lightRibbon(g, arcPts(cx, 52, 42, 22, Math.PI * 0.05, Math.PI * 0.95, 40, -0.45), (s) => 6.5 * Math.sin(Math.PI * s) ** 0.8 * (0.3 + 0.7 * s), t.c, 1, 5);
    const end = arcPts(cx, 52, 42, 22, Math.PI * 0.95, Math.PI * 0.95, 1, -0.45);
    sparkle(g, end[0], end[1], 9, t.w, 1);
    motes(g, 33, 8, cx, 52, 30, 46, t.l, 1, 0.8);
  },

  // Solar Flare: a blazing sun throwing out long flares.
  flare: (g, t) => {
    const cx = 50, cy = 50, r = rng(17);
    rays(g, cx, cy, 24, 30, 50, t.l, 0.4, 3, 0.045);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + r() * 0.2, len = 28 + r() * 18, bend = (r() - 0.5) * 0.5;
      const pts: number[] = [];
      for (let j = 0; j <= 20; j++) {
        const s = j / 20, aa = a + bend * s * s + Math.sin(s * 6 + i) * 0.04, d = 14 + s * len;
        pts.push(cx + Math.cos(aa) * d, cy + Math.sin(aa) * d);
      }
      lightRibbon(g, pts, (s) => 7 * (1 - s) ** 1.2 * Math.min(1, s * 6 + 0.4), t.c, 0.9, 4);
    }
    bloom(g, cx, cy, 40, t.c, 0.9);
    solid(g, (f) => {
      f.fillStyle = rad(f, cx - 5, cy - 5, 1, 21, [[0, css(WHITE)], [0.3, css(mix(t.w, AMBER_W, 0.5))], [0.7, css(mix(t.l, AMBER_L, 0.35))], [1, css(t.c)]]);
      f.beginPath(); f.arc(cx, cy, 19, 0, TAU); f.fill();
      f.strokeStyle = css(t.d, 0.5); f.lineWidth = 2.2;
      f.beginPath(); f.arc(cx, cy, 18, 0.2, 2.2); f.stroke();
    }, { rim: undefined, inkW: 1.2, shadeW: 2.2, shadeA: 0.3 }, [26, 26, 48, 48]);
    sparkle(g, cx, cy, 22, AMBER_W, 0.9, Math.PI / 4);
    motes(g, 9, 10, cx, cy, 34, 48, t.l, 1.1, 0.9);
  },

  // Hoarded Light: motes drawn into a glass reliquary.
  hoard: (g, t) => {
    const cx = 52;
    for (let k = 0; k < 5; k++) {
      const a0 = -Math.PI / 2 + (k - 2) * 0.62, pts: number[] = [];
      for (let i = 0; i <= 24; i++) {
        const s = i / 24, a = a0 + (k - 2) * 0.25 * s, d = 46 - s * 30;
        pts.push(cx + Math.cos(a) * d * 1.05, 34 + Math.sin(a) * d * 0.6 + s * 4);
      }
      lightRibbon(g, pts, (s) => 2.4 * Math.min(1, (1 - s) * 3) * (0.3 + 0.7 * (1 - s)), t.c, 0.6, 2);
      bloom(g, pts[0], pts[1], 7, t.c, 0.9);
      additive(g, () => { g.fillStyle = css(t.w); g.beginPath(); g.arc(pts[0], pts[1], 1.8, 0, TAU); g.fill(); });
    }
    const jar = (f: Ctx) => {
      f.beginPath();
      f.moveTo(cx - 9, 33); f.lineTo(cx + 9, 33);
      f.bezierCurveTo(cx + 9, 38, cx + 24, 42, cx + 24, 60);
      f.bezierCurveTo(cx + 24, 76, cx + 16, 84, cx, 84);
      f.bezierCurveTo(cx - 16, 84, cx - 24, 76, cx - 24, 60);
      f.bezierCurveTo(cx - 24, 42, cx - 9, 38, cx - 9, 33);
      f.closePath();
    };
    bloom(g, cx, 62, 34, t.c, 0.6);
    solid(g, (f) => {
      jar(f);
      f.fillStyle = rad(f, cx, 64, 2, 26, [[0, css(t.l)], [0.5, css(mix(t.c, 0x1b2138, 0.35))], [1, css(mix(t.dd, 0x101626, 0.4))]]);
      f.fill();
      f.save(); jar(f); f.clip();
      const r = rng(4);
      for (let i = 0; i < 16; i++) {
        const x = cx + (r() - 0.5) * 36, y = 52 + r() * 30, s = 1.2 + r() * 2.4;
        f.fillStyle = rad(f, x, y, 0, s * 2, [[0, css(WHITE)], [0.3, css(t.w)], [1, css(t.c, 0)]]);
        f.beginPath(); f.arc(x, y, s * 2, 0, TAU); f.fill();
      }
      f.strokeStyle = css(WHITE, 0.55); f.lineWidth = 2;
      f.beginPath(); f.moveTo(cx - 17, 50); f.quadraticCurveTo(cx - 20, 64, cx - 13, 76); f.stroke();
      f.restore();
      // Lid and band.
      rrect(f, cx - 12, 27, 24, 7, 2); f.fillStyle = metal(f, cx - 12, 27, cx + 12, 34, BRASS); f.fill();
      f.fillStyle = metal(f, cx - 4, 20, cx + 4, 27, BRASS); f.beginPath(); f.arc(cx, 24.5, 3.6, 0, TAU); f.fill();
      f.strokeStyle = metal(f, cx - 24, 0, cx + 24, 0, BRASS); f.lineWidth = 2.2;
      f.beginPath(); f.ellipse(cx, 60, 23.6, 4, 0, 0.1, Math.PI - 0.1); f.stroke();
    }, { rim: MOON_L, rimA: 0.55 }, [22, 16, 60, 72]);
    bloom(g, cx, 66, 18, t.c, 0.9);
    sparkle(g, cx + 6, 62, 10, t.w, 1);
  },
};
