// Tidebreaker: painted sea creatures, ported from the concept renderer: scaled
// bodies (body), the Mistcoil Serpent's frilled head, tentacles and the Drowned
// Leviathan's head with its maw, eyes, horns and bioluminescent spots. Every
// painter takes the context g first and a time t so it breathes, blinks and
// pulses. Glows use cached sprites (drawImage) instead of a gradient per call.
import { bez, layer } from './gfx.js';
import { lerp, rgba, rng } from './util.js';

// ------------------------------------------------------------ palettes
export const SERPENT = { base: '#16b39a', dark: '#0a5a63', hi: '#7fffd8', belly: '#ffd95a', fin: '#ff4f9a', scale: '#064a4a', horn: '#fff1d0', eye: '#d8ff3a', maw: '#ff5a7a', spots: '#9affff' };
export const LEV_TENTACLE = { base: '#3a1f6a', dark: '#120a2a', hi: '#8a4ad0', rim: '#ff6ab8', sucker: '#ff9ad8', glow: '#3affe0' };
export const GHOST_TENTACLE = { base: '#2a1850', dark: '#0c0620', hi: '#6a3aa8', rim: '#ff4a8a', sucker: '#d07ab8', glow: '#3affe0' };
export const KRAKEN = { base: '#b0409a', dark: '#4a0f4a', hi: '#ff8ad8', rim: '#ffd0f0', sucker: '#ffe2f4', glow: '#ff9af0' };

// ------------------------------------------------------------ cached glows
const sprites = new Map();
function sprite(col) {
  let c = sprites.get(col);
  if (c) return c;
  c = layer(64, 64);
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.35, rgba(col, 0.35)); gr.addColorStop(1, rgba(col, 0));
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  sprites.set(col, c);
  return c;
}
// Same falloff as gfx.glow, about ten times cheaper.
export function softGlow(g, x, y, r, col, a = 1) {
  if (r <= 0 || a <= 0) return;
  const prev = g.globalAlpha;
  g.globalAlpha = prev * Math.min(1, a);
  g.drawImage(sprite(col), x - r, y - r, r * 2, r * 2);
  g.globalAlpha = prev;
}
// Additive glow.
export function addGlow(g, x, y, r, col, a = 1) {
  const op = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter';
  softGlow(g, x, y, r, col, a); g.globalCompositeOperation = op;
}

// ------------------------------------------------------------ tubes
// Left and right edges of a tube along pts; rad(u) is the radius at u in 0..1.
export function tubeSides(pts, rad) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const r = rad(i / (pts.length - 1)); L.push([pts[i][0] - ty * r, pts[i][1] + tx * r]); R.push([pts[i][0] + ty * r, pts[i][1] - tx * r]);
  }
  return { L, R };
}
export function polyFill(g, A, B, fill) {
  g.beginPath(); A.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  for (let i = B.length - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
  g.closePath(); g.fillStyle = fill; g.fill();
}
// Distance test against a sampled tube: returns true when (x, y) is within the
// tube's radius (plus r) of any sample.
export function tubeHit(pts, rad, x, y, r = 0) {
  const n = pts.length - 1;
  for (let i = 0; i <= n; i++) {
    const R = rad(i / n) + r, dx = x - pts[i][0], dy = y - pts[i][1];
    if (dx * dx + dy * dy < R * R) return true;
  }
  return false;
}

// A scaled sea creature body: back on side `back` (L or R), belly on the other.
// Fins ripple and the glowing spots pulse with t.
export function paintBody(g, pts, rad, c, back = 'L', spikes = true, t = 0, lo = false) {
  const s = tubeSides(pts, rad), Bk = s[back], Bl = s[back === 'L' ? 'R' : 'L'], n = pts.length - 1;
  if (spikes) {
    g.fillStyle = c.fin;
    for (let i = 2; i < n - 1; i += 2) {
      const p = Bk[i], q = pts[i], dx = p[0] - q[0], dy = p[1] - q[1], d = Math.hypot(dx, dy) || 1;
      const h = rad(i / n) * (0.9 + 0.18 * Math.sin(t * 3.2 - i * 0.7));
      const m = Bk[Math.min(n, i + 2)];
      g.beginPath(); g.moveTo(p[0] - dx * 0.1, p[1] - dy * 0.1);
      g.lineTo(p[0] + dx / d * h - (m[0] - p[0]) * 0.6, p[1] + dy / d * h - (m[1] - p[1]) * 0.6);
      g.lineTo(m[0] - dx * 0.1, m[1] - dy * 0.1); g.fill();
    }
  }
  polyFill(g, Bk, Bl, c.base);
  const mid = pts.map((p, i) => [lerp(p[0], Bl[i][0], 0.55), lerp(p[1], Bl[i][1], 0.55)]);
  polyFill(g, mid, Bl, c.belly);
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.2;
  g.beginPath();
  for (let i = 1; i <= n; i++) { g.moveTo(mid[i][0], mid[i][1]); g.lineTo(Bl[i][0], Bl[i][1]); }
  g.stroke();
  const hi = pts.map((p, i) => [lerp(p[0], Bk[i][0], 0.7), lerp(p[1], Bk[i][1], 0.7)]);
  g.strokeStyle = rgba(c.hi, 0.6); g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); hi.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
  if (!lo) {
    g.strokeStyle = rgba(c.scale, 0.45); g.lineWidth = 1.4; g.beginPath();
    for (let i = 1; i < n; i++) for (let k = 0; k < 3; k++) {
      const u = 0.15 + k * 0.22, x = lerp(pts[i][0], Bk[i][0], u), y = lerp(pts[i][1], Bk[i][1], u), r = rad(i / n) * 0.16;
      g.moveTo(x + Math.cos(0.2) * r, y + Math.sin(0.2) * r); g.arc(x, y, r, 0.2, Math.PI - 0.2);
    }
    g.stroke();
  }
  if (c.spots) {
    for (let i = 2; i < n; i += 3) {
      const x = lerp(pts[i][0], Bk[i][0], 0.35), y = lerp(pts[i][1], Bk[i][1], 0.35);
      addGlow(g, x, y, rad(i / n) * 0.5, c.spots, 0.45 + 0.3 * Math.sin(t * 2.4 + i));
    }
  }
  return s;
}

// Blink: 0 open .. 1 shut, a quick blink every few seconds.
export function blink(t, seed = 0) {
  const p = (t * 0.31 + seed * 0.37) % 1;
  return p < 0.035 ? Math.sin(p / 0.035 * Math.PI) : 0;
}

// The Mistcoil Serpent's head, facing left. s = size in px, tilt in radians
// (more = snout down), open = jaw angle. o: { hurt 0..1, glare 0..1 }.
export function paintSerpentHead(g, x, y, s, tilt, c, open = 0.45, t = 0, o = {}) {
  g.save(); g.translate(x, y); g.scale(-s, s); g.rotate(tilt);
  // frill, rippling
  g.fillStyle = c.fin;
  for (let i = 0; i < 5; i++) {
    const w = 0.06 * Math.sin(t * 4 + i * 0.9);
    g.beginPath(); g.moveTo(-0.2, -0.15 + i * 0.05);
    g.quadraticCurveTo(-0.9, -0.9 + i * 0.25 + w, -1.25 + i * 0.05 + w, -0.55 + i * 0.3);
    g.quadraticCurveTo(-0.7, -0.2 + i * 0.1, -0.15, 0.05 + i * 0.04); g.fill();
  }
  // lower jaw
  g.save(); g.translate(-0.05, 0.18); g.rotate(open);
  g.fillStyle = c.belly; g.beginPath(); g.moveTo(-0.15, -0.08); g.quadraticCurveTo(0.5, 0.12, 1.15, 0.02); g.quadraticCurveTo(0.6, -0.05, -0.15, -0.12); g.fill();
  g.fillStyle = '#fff6e0';
  for (let i = 0; i < 6; i++) { const tx = 0.25 + i * 0.14; g.beginPath(); g.moveTo(tx, -0.04); g.lineTo(tx + 0.04, -0.17); g.lineTo(tx + 0.08, -0.03); g.fill(); }
  g.restore();
  addGlow(g, 0.45, 0.3, 0.45 + open * 0.3, c.maw, 0.5 + open * 0.5);
  // skull and snout
  const gr = g.createLinearGradient(0, -0.45, 0, 0.25); gr.addColorStop(0, c.hi); gr.addColorStop(0.4, c.base); gr.addColorStop(1, c.dark);
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(-0.3, 0.2); g.quadraticCurveTo(-0.35, -0.4, 0.15, -0.42); g.quadraticCurveTo(0.6, -0.42, 0.95, -0.2);
  g.quadraticCurveTo(1.32, -0.1, 1.3, 0.05); g.quadraticCurveTo(0.9, 0.18, 0.2, 0.2); g.closePath(); g.fill();
  if (o.hurt) { g.fillStyle = rgba('#ffffff', 0.5 * o.hurt); g.fill(); }
  g.fillStyle = '#fff6e0';
  for (let i = 0; i < 7; i++) { const tx = 0.28 + i * 0.14; g.beginPath(); g.moveTo(tx, 0.12); g.lineTo(tx + 0.04, 0.3); g.lineTo(tx + 0.08, 0.13); g.fill(); }
  // horns and nostril
  g.fillStyle = c.horn;
  g.beginPath(); g.moveTo(0.05, -0.38); g.quadraticCurveTo(-0.3, -0.85, -0.75, -0.95); g.quadraticCurveTo(-0.35, -0.65, -0.15, -0.3); g.fill();
  g.beginPath(); g.moveTo(0.3, -0.4); g.quadraticCurveTo(0.1, -0.7, -0.2, -0.82); g.quadraticCurveTo(0.05, -0.55, 0.12, -0.36); g.fill();
  g.fillStyle = c.dark; g.beginPath(); g.ellipse(1.18, -0.06, 0.05, 0.025, 0.3, 0, 7); g.fill();
  // eye, blinking
  const b = blink(t, 1), ry = 0.065 * (1 - b * 0.9);
  addGlow(g, 0.48, -0.2, 0.42 * (1 + (o.glare || 0) * 0.6), c.eye, 0.9);
  g.fillStyle = '#fffbe0'; g.beginPath(); g.ellipse(0.48, -0.2, 0.11, ry, -0.2, 0, 7); g.fill();
  g.fillStyle = c.eye; g.beginPath(); g.ellipse(0.48, -0.2, 0.09, ry * 0.85, -0.2, 0, 7); g.fill();
  g.fillStyle = '#10140a'; g.beginPath(); g.ellipse(0.5, -0.2, 0.018, Math.max(0.005, ry * 0.77), 0, 0, 7); g.fill();
  g.strokeStyle = c.dark; g.lineWidth = 0.04; g.beginPath(); g.moveTo(0.3, -0.31); g.quadraticCurveTo(0.5, -0.36, 0.66, -0.27); g.stroke();
  g.restore();
}
// Where the serpent head's mouth and eye are on screen (same transform as above).
export function serpentHeadPoint(x, y, s, tilt, lx, ly) {
  const c = Math.cos(tilt), sn = Math.sin(tilt), X = lx * c - ly * sn, Y = lx * sn + ly * c;
  return [x - X * s, y + Y * s];
}

// One tentacle along a cubic Bezier: r0 base radius, c colours { base, dark, hi, rim, sucker, glow }.
// suck scales the suckers (0 hides them); the glow spots pulse with t.
export function paintTentacle(g, p0, p1, p2, p3, r0, c, seed, suck = 1, t = 0) {
  const pts = bez(p0, p1, p2, p3, 40), rad = (u) => r0 * Math.pow(1 - u, 0.9) + 1.5;
  const s = tubeSides(pts, rad);
  const gr = g.createLinearGradient(p0[0], p0[1], p3[0], p3[1]); gr.addColorStop(0, c.dark); gr.addColorStop(0.6, c.base); gr.addColorStop(1, c.hi);
  polyFill(g, s.L, s.R, gr);
  g.strokeStyle = rgba(c.rim, 0.7); g.lineWidth = 2.5; g.lineJoin = 'round';
  g.beginPath(); s.L.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
  if (suck > 0) {
    for (let i = 2; i < pts.length - 3; i += 2) {
      const u = i / (pts.length - 1), x = lerp(pts[i][0], s.R[i][0], 0.6), y = lerp(pts[i][1], s.R[i][1], 0.6), r = rad(u) * 0.28 * suck;
      g.fillStyle = c.sucker; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.fillStyle = rgba(c.dark, 0.7); g.beginPath(); g.arc(x, y, r * 0.45, 0, 7); g.fill();
    }
  }
  if (c.glow) {
    const op = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter';
    g.fillStyle = '#e8ffff';
    for (let i = 3; i < pts.length - 2; i += 4) {
      const x = lerp(pts[i][0], s.L[i][0], 0.4), y = lerp(pts[i][1], s.L[i][1], 0.4);
      softGlow(g, x, y, rad(i / 40) * 0.6, c.glow, 0.55 + 0.3 * Math.sin(t * 3 + i * 0.8 + seed));
      g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill();
    }
    g.globalCompositeOperation = op;
  }
  return pts;
}
export const tentacleRad = (r0) => (u) => r0 * Math.pow(1 - u, 0.9) + 1.5;

// ------------------------------------------------------------ the Drowned Leviathan
// Painted in the concept's frame (head centre x 860, crown y 150, jaw at 590)
// and moved with a translate. The still parts are cached once.
const LX = 860, LTOP = 150, LBASE = 590, CK = 1.5;      // cache scale
const CX0 = 520, CY0 = 40, CW = 700, CH = 580;          // cached region in concept px
const headPath = () => {
  const p = new Path2D(); p.moveTo(560, LBASE); p.bezierCurveTo(560, 260, 680, LTOP, LX, LTOP); p.bezierCurveTo(1040, LTOP, 1170, 260, 1170, LBASE); p.closePath(); return p;
};
const mawPath = (open = 0) => {
  const p = new Path2D(); p.moveTo(680, 580); p.quadraticCurveTo(700, 360 - open * 20, LX, 340 - open * 30); p.quadraticCurveTo(1020, 360 - open * 20, 1040, 580); p.closePath(); return p;
};
let levCache = null, levHead = null, levSpots = null, probe = null;
function levStatic() {
  if (levCache) return levCache;
  levHead = headPath();
  const c = layer(CW * CK, CH * CK), g = c.getContext('2d');
  g.scale(CK, CK); g.translate(-CX0, -CY0);
  // back horns behind the skull's crown
  const gr = g.createRadialGradient(LX, 260, 40, LX, 330, 420); gr.addColorStop(0, '#4a2a8a'); gr.addColorStop(0.6, '#24124f'); gr.addColorStop(1, '#0c0626');
  g.fillStyle = gr; g.fill(levHead);
  g.save(); g.clip(levHead);
  g.lineWidth = 18; g.strokeStyle = 'rgba(255,90,140,0.35)'; g.stroke(levHead);
  g.lineWidth = 7; g.strokeStyle = 'rgba(255,150,200,0.25)'; g.stroke(levHead);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6;
  for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(600 + k * 20, 560); g.quadraticCurveTo(640 + k * 30, 260 - k * 10, LX, 180 + k * 22); g.quadraticCurveTo(1080 - k * 30, 260 - k * 10, 1120 - k * 20, 560); g.stroke(); }
  // barnacle crust and scars
  const r = rng(23);
  g.fillStyle = 'rgba(160,120,220,0.18)';
  for (let i = 0; i < 70; i++) { const a = r() * Math.PI, d = 0.5 + r() * 0.5, x = LX + Math.cos(a) * 310 * d, y = 560 - Math.sin(a) * 400 * d; g.beginPath(); g.arc(x, y, 1.5 + r() * 3.5, 0, 7); g.fill(); }
  g.restore();
  // maw
  const maw = mawPath();
  const mg = g.createRadialGradient(LX, 470, 10, LX, 440, 220); mg.addColorStop(0, '#fff0a0'); mg.addColorStop(0.25, '#ff8a2a'); mg.addColorStop(0.6, '#c21a5a'); mg.addColorStop(1, '#2a0420');
  g.fillStyle = mg; g.fill(maw);
  g.lineWidth = 5; g.strokeStyle = 'rgba(20,4,30,0.6)'; g.stroke(maw);
  g.fillStyle = '#fff4e8';
  for (let i = 0; i < 15; i++) { const u = i / 14, x = lerp(700, 1020, u), y = 352 + Math.pow((u - 0.5) * 2, 2) * 110 - 8, h = 34 + Math.sin(u * Math.PI) * 36; g.beginPath(); g.moveTo(x - 11, y); g.lineTo(x, y + h); g.lineTo(x + 11, y); g.fill(); }
  for (let i = 0; i < 9; i++) { const x = 735 + i * 32, h = 34 + (i % 2) * 20; g.beginPath(); g.moveTo(x - 10, 570); g.lineTo(x, 555 - h); g.lineTo(x + 10, 570); g.fill(); }
  // tooth shading
  g.fillStyle = 'rgba(255,120,80,0.25)';
  for (let i = 0; i < 15; i++) { const u = i / 14, x = lerp(700, 1020, u), y = 352 + Math.pow((u - 0.5) * 2, 2) * 110 - 8, h = 34 + Math.sin(u * Math.PI) * 36; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + h); g.lineTo(x + 11, y); g.fill(); }
  // horns
  for (const [hx, d] of [[760, -1], [960, 1]]) {
    const hp = bez([hx, 215], [hx + d * 10, 130], [hx + d * 80, 70], [hx + d * 170, 80], 24), hs = tubeSides(hp, (u) => 26 * (1 - u) + 1);
    const hg = g.createLinearGradient(hx, 215, hx + d * 170, 80); hg.addColorStop(0, '#4a2a7a'); hg.addColorStop(0.5, '#b89ae0'); hg.addColorStop(1, '#fff0ff');
    polyFill(g, hs.L, hs.R, hg);
    g.strokeStyle = 'rgba(30,10,60,0.5)'; g.lineWidth = 2;
    for (let k = 3; k < 18; k += 3) { g.beginPath(); g.moveTo(...hs.L[k]); g.lineTo(...hs.R[k]); g.stroke(); }
  }
  // the bioluminescent spots (positions only; they pulse live)
  const rs = rng(17); levSpots = [];
  for (let i = 0; i < 46; i++) {
    const a = rs() * Math.PI, d = 0.55 + rs() * 0.4, x = LX + Math.cos(a) * 300 * d, y = 330 - Math.sin(a) * 180 * d, sz = 6 + rs() * 12, dot = 1.5 + rs() * 1.5;
    if (Math.abs(x - LX) < 170 && y > 300) continue;
    levSpots.push([x, y, sz, dot]);
  }
  levCache = c;
  return c;
}
export const LEV = { x: LX, top: LTOP, eyeL: [700, 285], eyeR: [1020, 285], maw: [LX, 450], base: LBASE };
// True when (x, y) is on the head drawn at (cx, top).
export function leviathanHit(cx, top, x, y) {
  levStatic();
  if (!probe) probe = layer(2, 2).getContext('2d');
  return probe.isPointInPath(levHead, x - (cx - LX), y - (top - LTOP));
}
function levEye(g, ex, ey, flip, open, glowA, t, weak, seed) {
  g.save(); g.translate(ex, ey); g.scale(flip, 1); g.rotate(0.35);
  const o = Math.max(0.04, open * (1 - blink(t, seed) * 0.95));
  addGlow(g, 0, 0, 110 * (0.6 + 0.4 * open) * (1 + weak * 0.3), '#3affe0', glowA);
  g.fillStyle = '#d8fff8'; g.beginPath(); g.ellipse(0, 0, 46, 18 * o, 0, 0, 7); g.fill();
  g.fillStyle = '#20e0c8'; g.beginPath(); g.ellipse(0, 0, 40, 15 * o, 0, 0, 7); g.fill();
  g.fillStyle = '#05121a'; g.beginPath(); g.ellipse(6 + Math.sin(t * 0.7 + seed) * 6, 0, 6, 14 * o, 0, 0, 7); g.fill();
  if (weak) {
    g.fillStyle = rgba('#ffffff', 0.5 * weak); g.beginPath(); g.ellipse(-12, -4 * o, 10, 4 * o, 0, 0, 7); g.fill();
    g.strokeStyle = rgba('#aaffff', weak * (0.4 + 0.3 * Math.sin(t * 6))); g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(0, 0, 58 + Math.sin(t * 6) * 4, 28 + Math.sin(t * 6) * 3, 0, 0, 7); g.stroke();
  }
  // brow, lowered when the eye is shut
  g.fillStyle = '#0c0626';
  g.beginPath(); g.moveTo(-60, -30 + (1 - o) * 16); g.quadraticCurveTo(0, -40 + (1 - o) * 26, 60, -6 + (1 - o) * 8); g.lineTo(60, -24); g.quadraticCurveTo(0, -60, -60, -44); g.fill();
  if (o < 0.9) { g.strokeStyle = '#2a1458'; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, 46, 18 * o + 1, 0, Math.PI, 0, true); g.stroke(); }
  g.restore();
}
// o: { x, top, t, eyes: [left, right] open 0..1, weak 0..1 (left eye lit as the weak spot),
//      maw 0..1 glow, charge 0..1 (beam wind-up), rage 0..1, hurt 0..1, lo (low quality) }
export function paintLeviathan(g, o) {
  const c = levStatic(), t = o.t || 0;
  const dx = o.x - LX, dy = o.top - LTOP;
  const br = 1 + 0.012 * Math.sin(t * 1.1);
  g.save();
  g.translate(dx, dy);
  g.translate(LX, LBASE); g.scale(1, br); g.translate(-LX, -LBASE);
  g.drawImage(c, CX0, CY0, CW, CH);
  const op = g.globalCompositeOperation;
  // maw glow
  const mawA = 0.35 + (o.maw || 0) * 0.35 + (o.charge || 0) * 0.5;
  g.save(); g.clip(mawPath());
  if (o.rage) { g.fillStyle = rgba('#ff2050', 0.25 * o.rage); g.fillRect(660, 320, 400, 270); }
  g.restore();
  addGlow(g, LX, 470, 260, o.rage ? '#ff4a2a' : '#ff6a2a', mawA);
  if (o.charge) { addGlow(g, LX, 440, 60 + o.charge * 140, '#fff0c0', o.charge); addGlow(g, LX, 440, 30 + o.charge * 50, '#ffffff', o.charge); }
  // rage tint and hurt flash over the skull
  if (o.rage || o.hurt) {
    g.save(); g.clip(levHead);
    if (o.rage) { g.fillStyle = rgba('#ff1a4a', 0.12 * o.rage * (0.8 + 0.2 * Math.sin(t * 5))); g.fillRect(540, 140, 650, 460); }
    if (o.hurt) { g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba('#ffffff', 0.18 * o.hurt); g.fillRect(540, 140, 650, 460); }
    g.restore();
  }
  // bioluminescent spots
  if (!o.lo) {
    g.save(); g.clip(levHead); g.globalCompositeOperation = 'lighter'; g.fillStyle = '#e0fff8';
    for (let i = 0; i < levSpots.length; i++) {
      const [x, y, sz, dot] = levSpots[i], p = 0.5 + 0.4 * Math.sin(t * 1.8 + i * 1.7);
      softGlow(g, x, y, sz, '#3affe0', p);
      g.beginPath(); g.arc(x, y, dot, 0, 7); g.fill();
    }
    g.restore();
  }
  const eyes = o.eyes || [0.4, 0.4];
  levEye(g, 700, 285, 1, eyes[0], 0.55 + 0.3 * eyes[0] + (o.weak || 0) * 0.25 * (1 + Math.sin(t * 5)), t, o.weak || 0, 0);
  levEye(g, 1020, 285, -1, eyes[1], 0.55 + 0.3 * eyes[1], t + 0.2, 0, 2);
  addGlow(g, LX, 120, 50, '#3affe0', 0.45 + 0.2 * Math.sin(t * 2));
  g.globalCompositeOperation = op;
  g.restore();
}
