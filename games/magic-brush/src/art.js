// Painted scenery and interface pieces, ported from the concept renderer and
// made to scale: every function takes positions in CSS px and a size factor,
// so the same storybook look lays out on a phone or a big screen. These are
// only ever called while baking static layers or button sprites, never per
// frame (except the tiny butterflies, which are cheap vector shapes).
import {
  TAU, INK, KID, RAINBOW, GLITTER, ROUND, rng, N1, lerp, clamp, rgba, mix, shade, layer, el, bl, rrect, bbox, wob,
  spath, circ, ell, rr, vgrad, glow, softShadow, inkLine, inkFill, fatStroke, wash, star4, sparkle, starPts, zigzag,
} from './lib.js';

export const SCN_INK = '#5a4a6a';

// ---------------------------------------------------------------- scenery

export function sky(g, w, y1, o = {}) {
  g.fillStyle = vgrad(g, 0, y1, [[0, o.top || '#8fcbef'], [0.55, o.mid || '#bfe3f2'], [1, o.low || '#fbeccc']]);
  g.fillRect(0, 0, w, y1);
  const R = rng(o.seed || 21), n = Math.round(clamp((w * y1) / 24000, 12, 40)), k = o.k || 1;
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * y1 * 0.8, r = (80 + R() * 220) * k;
    const gr = g.createRadialGradient(x, y, 0, x, y, r), c = R() < 0.6 ? '#ffffff' : '#7fbde8';
    gr.addColorStop(0, rgba(c, 0.12)); gr.addColorStop(1, rgba(c, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
export function sunRays(g, x, y, r) {
  g.save(); g.strokeStyle = rgba('#ffc94a', 0.75); g.lineWidth = r * 0.17; g.lineCap = 'round';
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.12, r0 = r * 1.3, r1 = r * (i % 2 ? 1.65 : 1.85); g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); g.stroke(); }
  g.restore();
}
export function sunFace(g, x, y, r, o = {}) {
  const P = el(x, y, r, r);
  wash(g, P, '#ffd659', 4, { top: '#fff6c0', edge: 0.35, k: r / 52, wob: 4 * r / 52 }); inkLine(g, P, Math.max(2, r * 0.077), 3, { col: rgba('#c27a2a', 0.8) });
  g.fillStyle = INK;
  if (o.blink) { g.strokeStyle = INK; g.lineWidth = r * 0.07; g.lineCap = 'round'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(x + sx * r * 0.3, y - r * 0.08, r * 0.08, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); } }
  else { ell(g, x - r * 0.3, y - r * 0.05, r * 0.08, r * 0.12); g.fill(); ell(g, x + r * 0.3, y - r * 0.05, r * 0.08, r * 0.12); g.fill(); }
  g.strokeStyle = INK; g.lineWidth = Math.max(1.5, r * 0.067); g.lineCap = 'round'; g.beginPath(); g.arc(x, y + r * 0.12, r * 0.28, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  g.fillStyle = 'rgba(255,120,120,0.45)'; ell(g, x - r * 0.52, y + r * 0.2, r * 0.14, r * 0.09); g.fill(); ell(g, x + r * 0.52, y + r * 0.2, r * 0.14, r * 0.09); g.fill();
}
export function sun(g, x, y, r) { glow(g, x, y, r * 4, '#fff1b8', 0.55); sunRays(g, x, y, r); sunFace(g, x, y, r); }

export function cloudPts(x, y, s) {
  return bl(x - 90 * s, y + 20 * s, x - 100 * s, y - 10 * s, x - 60 * s, y - 34 * s, x - 20 * s, y - 60 * s, x + 30 * s, y - 50 * s, x + 60 * s, y - 30 * s, x + 100 * s, y - 20 * s, x + 104 * s, y + 18 * s);
}
export function cloud(g, x, y, s, seed = 1) {
  const P = cloudPts(x, y, s);
  wash(g, P, '#ffffff', seed, { fill: '#fffdf7', mottle: 0.6, edge: 0.18, bottom: '#c9dcf0', wob: 3 * s, k: s });
  inkLine(g, P, Math.max(1.5, 2.5 * s), seed, { col: rgba('#7a8fb8', 0.5), second: 0.3 });
}
// a cloud as its own little sprite (they drift)
export function cloudSprite(s, seed, dpr) {
  const w = 230 * s, h = 110 * s, c = layer(w * dpr, h * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr); cloud(g, w / 2, h * 0.62, s, seed);
  return { canvas: c, w, h };
}
export function hillPts(x0, x1, yBase, peaks, seed, bottom, steps = 60) {
  const P = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = lerp(x0, x1, t);
    let y = yBase; for (const [px, py, pw] of peaks) y -= py * Math.exp(-(((x - px) / pw) ** 2));
    y += (N1(i * 0.6 + seed) - 0.5) * 6; P.push([x, y]);
  }
  P.push([x1 + 40, yBase], [x1 + 40, bottom + 600], [x0 - 40, bottom + 600], [x0 - 40, yBase]);
  return P;
}
export function hillY(x, yBase, peaks) { let y = yBase; for (const [px, py, pw] of peaks) y -= py * Math.exp(-(((x - px) / pw) ** 2)); return y; }

export function farHills(g, w, h, base, k) {
  const pk1 = [[w * 0.16, 70 * k, w * 0.17], [w * 0.51, 40 * k, w * 0.19], [w * 0.84, 85 * k, w * 0.17]];
  const pk2 = [[w * 0.33, 60 * k, w * 0.17], [w * 0.68, 70 * k, w * 0.19], [w * 0.98, 40 * k, w * 0.13]];
  wash(g, hillPts(-60, w + 60, base + 10 * k, pk1, 3, h), '#a9d6c2', 31, { raw: true, top: '#e4f4ea', edge: 0.3, mottle: 0.5, k });
  wash(g, hillPts(-60, w + 60, base + 60 * k, pk2, 7, h), '#8ccf8e', 32, { raw: true, top: '#d6f0c4', edge: 0.35, mottle: 0.6, k });
  for (const [fx, s] of [[0.63, 0.5], [0.655, 0.42], [0.82, 0.55], [0.11, 0.48], [0.135, 0.38]]) {
    const x = fx * w, y = hillY(x, base + 60 * k, pk2) + 4 * k;
    tree(g, x, y, s * 0.6 * k, { far: true, seed: Math.round(x) });
  }
}
export function meadowGround(g, w, h, y, k, o = {}) {
  const peaks = o.peaks || [[w * 0.19, 90 * k, w * 0.22], [w * 0.88, 30 * k, w * 0.19]];
  const P = hillPts(-60, w + 60, y, peaks, 9, h);
  wash(g, P, o.col || '#7cc46c', 41, { raw: true, top: '#c8eb9a', bottom: '#4f9a5e', edge: 0.4, k });
  return peaks;
}
export function tree(g, x, y, s, o = {}) {
  const R = rng((o.seed || 1) * 7 + 3), ink = o.far ? 0 : Math.max(1.6, 3.2 * Math.min(1.2, s));
  const trunk = bl(x - 18 * s, y, x - 14 * s, y - 80 * s, x - 30 * s, y - 120 * s, x + 4 * s, y - 100 * s, x + 30 * s, y - 126 * s, x + 16 * s, y - 80 * s, x + 20 * s, y);
  wash(g, trunk, '#b07a4f', 5, { top: '#d9a77a', edge: 0.4, k: s, wob: 4 * s }); if (ink) inkLine(g, trunk, ink, 2, { col: SCN_INK });
  const blobs = [[0, -170, 95, 80], [-70, -140, 62, 52], [70, -138, 66, 54], [-30, -210, 60, 50], [40, -205, 62, 52], [0, -120, 70, 40]];
  const col = o.col || '#5cb86a', crown = [];
  for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU, rx = 128, ry = 100, q = 1 + 0.12 * Math.sin(a * 5 + (o.seed || 1)) + 0.05 * Math.sin(a * 11); crown.push([x + Math.cos(a) * rx * q * s, y + (-168 + Math.sin(a) * ry * q) * s]); }
  wash(g, crown, col, (o.seed || 1) + 2, { top: '#bde58a', bottom: '#2f7a4a', edge: 0.4, wob: 3 * s, k: s });
  if (ink) inkLine(g, crown, ink, (o.seed || 1) + 4, { col: SCN_INK });
  if (!o.far) {
    g.save(); g.clip(spath(crown));
    for (const [bx, by, rx, ry] of blobs) { g.strokeStyle = rgba('#2f7a4a', 0.35); g.lineWidth = 3 * s; g.beginPath(); g.ellipse(x + bx * s, y + by * s + 6 * s, rx * 0.8 * s, ry * 0.5 * s, 0, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); }
    g.restore();
    for (let i = 0; i < (o.fruit ?? 7); i++) {
      const a = R() * TAU, r = R() * 0.75, fx = x + Math.cos(a) * 100 * r * s, fy = y + (-170 + Math.sin(a) * 75 * r) * s;
      g.fillStyle = o.fruitCol || '#f0544f'; circ(g, fx, fy, 8 * s); g.fill(); g.strokeStyle = SCN_INK; g.lineWidth = 2 * s; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)'; circ(g, fx - 2.5 * s, fy - 2.5 * s, 2.4 * s); g.fill();
    }
  }
}
export function flower(g, x, y, s, col, o = {}) {
  if (o.stem !== false) { g.strokeStyle = '#4f9a5e'; g.lineWidth = 3 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y + 26 * s); g.quadraticCurveTo(x - 4 * s, y + 12 * s, x, y); g.stroke(); g.fillStyle = '#6cbf6a'; ell(g, x + 7 * s, y + 16 * s, 7 * s, 3 * s, -0.5); g.fill(); }
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + (o.rot || 0); g.fillStyle = col; ell(g, x + Math.cos(a) * 8 * s, y + Math.sin(a) * 8 * s, 7 * s, 5.5 * s, a); g.fill(); g.strokeStyle = rgba(shade(col, -0.45), 0.8); g.lineWidth = 1.4 * s; g.stroke(); }
  g.fillStyle = '#ffd23f'; circ(g, x, y, 5 * s); g.fill(); g.strokeStyle = '#b27a1a'; g.lineWidth = 1.4 * s; g.stroke();
}
export function tuft(g, x, y, s, col = '#4f9a5e') {
  g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = 3 * s;
  for (const [dx, h, b] of [[-8, 18, -6], [-2, 26, -2], [5, 22, 5], [10, 14, 8]]) { g.beginPath(); g.moveTo(x + dx * s, y); g.quadraticCurveTo(x + (dx + b * 0.3) * s, y - h * 0.6 * s, x + (dx + b) * s, y - h * s); g.stroke(); }
}
export function bush(g, x, y, s, col = '#5cb86a', seed = 1, flowers = '#ff86b8') {
  const P = bl(x - 70 * s, y, x - 76 * s, y - 34 * s, x - 40 * s, y - 64 * s, x, y - 74 * s, x + 44 * s, y - 62 * s, x + 76 * s, y - 30 * s, x + 70 * s, y);
  wash(g, P, col, seed, { top: '#bde58a', bottom: '#2f7a4a', edge: 0.4, k: s, wob: 4 * s }); inkLine(g, P, 3 * s, seed, { col: SCN_INK });
  const R = rng(seed); if (flowers) for (let i = 0; i < 5; i++) flower(g, x + (R() - 0.5) * 100 * s, y - (18 + R() * 40) * s, 0.55 * s, flowers, { stem: false, rot: R() });
}
export function pond(g, x, y, rx, ry, k = 1) {
  const rim = el(x, y, rx + 18 * k, ry + 12 * k, 0, 48);
  wash(g, rim, '#d9c9a0', 61, { edge: 0.3, mottle: 0.5, k, wob: 4 * k });
  const P = el(x, y, rx, ry, 0, 48);
  const path = wash(g, P, '#6cc0e0', 62, { top: '#2f86b8', bottom: '#bfeaf5', edge: 0.4, k, wob: 4 * k });
  g.save(); g.clip(path);
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3 * k; g.lineCap = 'round';
  const R = rng(4);
  for (let i = 0; i < 9; i++) { const yy = y - ry * 0.6 + R() * ry * 1.3, xx = x - rx * 0.7 + R() * rx * 1.4, w = (30 + R() * 70) * k; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + w, yy); g.stroke(); }
  g.restore();
  inkLine(g, P, 3 * k, 6, { col: rgba('#2f6a8a', 0.8) });
  return path;
}
export function lily(g, x, y, s, flowerCol) {
  g.save(); g.translate(x, y); g.scale(1, 0.45);
  g.fillStyle = '#5cb86a'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 26 * s, 0.25, TAU - 0.15); g.closePath(); g.fill(); g.strokeStyle = '#2f7a4a'; g.lineWidth = 3 * s; g.stroke();
  g.restore();
  if (flowerCol) flower(g, x + 4 * s, y - 6 * s, 0.6 * s, flowerCol, { stem: false });
}
export function reeds(g, x, y, s) {
  for (const [dx, h, b] of [[-10, 90, -10], [0, 120, 4], [12, 100, 14]]) {
    g.strokeStyle = '#4f9a5e'; g.lineWidth = 4 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + dx * s, y); g.quadraticCurveTo(x + dx * s, y - h * 0.5 * s, x + (dx + b) * s, y - h * s); g.stroke();
    g.fillStyle = '#9a6a44'; ell(g, x + (dx + b * 0.85) * s, y - h * 0.85 * s, 5 * s, 15 * s, b * 0.02); g.fill(); g.strokeStyle = SCN_INK; g.lineWidth = 1.5 * s; g.stroke();
  }
}
// a little butterfly; flap 0..1 squeezes the wings
export function bfly(g, x, y, s, c1, c2, ang = 0, flap = 1) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.lineWidth = Math.max(1, 2 * s);
  for (const sd of [-1, 1]) {
    g.save(); g.scale(0.25 + 0.75 * flap, 1);
    g.fillStyle = c1; ell(g, sd * 12 * s, -8 * s, 13 * s, 10 * s, sd * 0.5); g.fill(); g.strokeStyle = INK; g.stroke();
    g.fillStyle = c2; ell(g, sd * 10 * s, 8 * s, 9 * s, 7 * s, -sd * 0.4); g.fill(); g.stroke();
    g.restore();
  }
  g.fillStyle = INK; ell(g, 0, 0, 3 * s, 12 * s); g.fill();
  g.strokeStyle = INK; g.lineWidth = Math.max(1, 1.6 * s); g.beginPath(); g.moveTo(-1, -11 * s); g.quadraticCurveTo(-6 * s, -20 * s, -9 * s, -22 * s); g.moveTo(1, -11 * s); g.quadraticCurveTo(6 * s, -20 * s, 9 * s, -22 * s); g.stroke();
  g.restore();
}
export function mushroom(g, x, y, s) {
  const st = rrect(x - 8 * s, y - 24 * s, 16 * s, 24 * s, 6 * s); wash(g, st, '#fff3dc', 3, { edge: 0.3, k: s, wob: 2 * s }); inkLine(g, st, 2.4 * s, 2, { col: SCN_INK });
  const cap = bl(x - 28 * s, y - 20 * s, x - 22 * s, y - 44 * s, x, y - 52 * s, x + 22 * s, y - 44 * s, x + 28 * s, y - 20 * s);
  wash(g, cap, '#f0544f', 4, { top: '#ff9a8a', edge: 0.4, k: s, wob: 2 * s }); inkLine(g, cap, 2.6 * s, 5, { col: SCN_INK });
  g.fillStyle = '#fffaf0'; for (const [dx, dy, r] of [[-12, -34, 4.5], [6, -42, 4], [14, -28, 3.5]]) { circ(g, x + dx * s, y + dy * s, r * s); g.fill(); }
}
// flowers and tufts over a band of ground (painted back to front)
export function scatter(g, w, y0, y1, n, seed, avoid = [], k = 1) {
  const R = rng(seed), list = [];
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = lerp(y0, y1, R()), r = R();
    if (avoid.some(([ax, ay, rx, ry]) => ((x - ax) / rx) ** 2 + ((y - ay) / ry) ** 2 < 1)) continue;
    list.push([x, y, r]);
  }
  list.sort((a, b) => a[1] - b[1]);
  const cols = ['#ff86b8', '#ffffff', '#ffd23f', '#9b6ff0', '#f0544f', '#ff9a3d', '#8fd3ff'];
  for (const [x, y, r] of list) { const s = lerp(0.6, 1.25, (y - y0) / Math.max(1, y1 - y0)) * k; r < 0.45 ? tuft(g, x, y, s) : flower(g, x, y - 20 * s, s * 0.9, cols[Math.floor(r * 97) % cols.length], { rot: r * 6 }); }
}
// sky, far hills and the near meadow; returns the ground peaks
export function meadow(g, w, h, k, o = {}) {
  sky(g, w, o.skyTo ?? h * 0.67, Object.assign({ k }, o.sky || {}));
  if (o.sunX != null) sun(g, o.sunX, o.sunY, o.sunR || 52 * k);
  for (const [x, y, s, sd] of o.clouds || []) cloud(g, x, y, s, sd);
  farHills(g, w, h, o.far ?? h * 0.52, k);
  return meadowGround(g, w, h, o.ground ?? h * 0.62, k, o);
}

// ---------------------------------------------------------------- interface

export function blobCircle(x, y, r, seed = 1, amp = 0.035) { return wob(el(x, y, r, r, 0, 40), r * amp, seed, 0.6); }

export function bigButton(g, x, y, r, col, icon, o = {}) {
  if (o.glow) glow(g, x, y, r * 1.9, o.glowCol || '#fff1a0', 0.75);
  softShadow(g, x + r * 0.06, y + r * 0.92, r * 0.95, r * 0.22, 0.35);
  const P = blobCircle(x, y, r, o.seed || 3), path = spath(P);
  g.save(); g.clip(path);
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.1);
  gr.addColorStop(0, shade(col, 0.35)); gr.addColorStop(0.55, col); gr.addColorStop(1, shade(col, -0.25));
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  const R = rng((o.seed || 3) + 9); zigzag(g, bbox(P), 0.7, r * 0.22, r * 0.22, [shade(col, 0.15), shade(col, -0.08)], R, { alpha: 0.28, bristle: 0.12 });
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = r * 0.09; g.lineCap = 'round'; g.beginPath(); g.arc(x, y, r * 0.8, 1.1 * Math.PI, 1.45 * Math.PI); g.stroke();
  g.restore();
  inkLine(g, P, Math.max(3, r * 0.085), (o.seed || 3) + 1);
  if (icon) ICONS[icon](g, x, y + (o.iconDy || 0), r * (o.iconScale || 0.56), o);
}

const lw = (u, w) => w * clamp(u / 30, 0.45, 1.6);
export const ICONS = {
  play(g, x, y, u) { const P = bl(x - u * 0.55, y - u * 0.8, x - u * 0.55, y - u * 0.8, x + u * 0.85, y, x + u * 0.85, y, x - u * 0.55, y + u * 0.8, x - u * 0.55, y + u * 0.8); inkFill(g, spath(P), '#fffaf0', lw(u, 6)); },
  home(g, x, y, u) {
    const body = new Path2D(); body.moveTo(x - u * 0.62, y - u * 0.05); body.lineTo(x - u * 0.62, y + u * 0.7); body.lineTo(x + u * 0.62, y + u * 0.7); body.lineTo(x + u * 0.62, y - u * 0.05); body.closePath();
    inkFill(g, body, '#fffaf0', lw(u, 5));
    const door = new Path2D(); door.moveTo(x - u * 0.18, y + u * 0.7); door.lineTo(x - u * 0.18, y + u * 0.3); door.arc(x, y + u * 0.3, u * 0.18, Math.PI, 0); door.lineTo(x + u * 0.18, y + u * 0.7); inkFill(g, door, '#ffb347', lw(u, 3.5));
    const roof = new Path2D(); roof.moveTo(x - u * 0.9, y + u * 0.05); roof.lineTo(x, y - u * 0.78); roof.lineTo(x + u * 0.9, y + u * 0.05); roof.closePath(); inkFill(g, roof, '#f0544f', lw(u, 5));
  },
  undo(g, x, y, u) {
    const p = new Path2D(); p.moveTo(x + u * 0.5, y + u * 0.62); p.bezierCurveTo(x + u * 1.0, y - u * 0.05, x + u * 0.55, y - u * 0.5, x - u * 0.12, y - u * 0.32);
    fatStroke(g, p, '#fffaf0', u * 0.3);
    const a = new Path2D(); a.moveTo(x - u * 0.78, y - u * 0.3); a.lineTo(x - u * 0.12, y - u * 0.8); a.lineTo(x - u * 0.06, y + u * 0.12); a.closePath(); inkFill(g, a, '#fffaf0', lw(u, 5));
  },
  wand(g, x, y, u) {
    const s = new Path2D(); s.moveTo(x - u * 0.7, y + u * 0.75); s.lineTo(x + u * 0.12, y - u * 0.08); fatStroke(g, s, '#6a4fb3', u * 0.2);
    const t = new Path2D(); t.moveTo(x - u * 0.7, y + u * 0.75); t.lineTo(x - u * 0.52, y + u * 0.57); g.save(); g.strokeStyle = '#fffaf0'; g.lineWidth = u * 0.2; g.lineCap = 'round'; g.stroke(t); g.restore();
    glow(g, x + u * 0.3, y - u * 0.3, u * 1.1, '#fff3a0', 0.9);
    inkFill(g, spath(starPts(x + u * 0.3, y - u * 0.3, u * 0.62, 0.15, 0.5)), '#ffd23f', lw(u, 5));
    g.fillStyle = 'rgba(255,255,255,0.75)'; ell(g, x + u * 0.16, y - u * 0.45, u * 0.12, u * 0.07, -0.6); g.fill();
    star4(g, x - u * 0.55, y - u * 0.45, u * 0.22, '#fffdf2'); star4(g, x + u * 0.75, y + u * 0.35, u * 0.18, '#fffdf2');
  },
  brush(g, x, y, u, o = {}) { brushTool(g, x - u * 0.55, y + u * 0.6, -0.8, u * 1.75, o.paint || '#ff86b8', { w: u * 0.34 }); },
  bubbles(g, x, y, u) {
    for (const [dx, dy, r] of [[-0.3, 0.2, 0.48], [0.38, -0.3, 0.36], [0.42, 0.45, 0.22]]) {
      const cx = x + dx * u, cy = y + dy * u, R = r * u, gr = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.6, 'rgba(190,235,255,0.85)'); gr.addColorStop(1, 'rgba(200,170,255,0.95)');
      g.fillStyle = gr; circ(g, cx, cy, R); g.fill(); g.strokeStyle = INK; g.lineWidth = lw(u, 4); g.stroke();
      g.fillStyle = '#fff'; ell(g, cx - R * 0.35, cy - R * 0.38, R * 0.22, R * 0.13, -0.7); g.fill();
    }
  },
  ball(g, x, y, u, o = {}) {
    const r = u * 0.78; g.save(); circ(g, x, y, r); g.clip();
    const cols = ['#f0544f', '#fffaf0', '#4b8ef0', '#fffaf0', '#ffd23f', '#fffaf0'], sp = o.spin || 0;
    for (let i = 0; i < 6; i++) { g.fillStyle = cols[i]; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r * 1.2, (i / 6) * TAU - 0.3 + sp, ((i + 1) / 6) * TAU - 0.3 + sp); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(70,30,110,0.18)'; circ(g, x + r * 0.35, y + r * 0.35, r * 0.95); g.fill();
    g.restore(); g.fillStyle = '#fffaf0'; circ(g, x, y, r * 0.2); g.fill();
    circ(g, x, y, r); g.strokeStyle = INK; g.lineWidth = lw(u, 5); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.7)'; ell(g, x - r * 0.4, y - r * 0.45, r * 0.22, r * 0.12, -0.7); g.fill();
  },
  snack(g, x, y, u) {
    const P = bl(x, y - u * 0.45, x + u * 0.55, y - u * 0.7, x + u * 0.8, y, x + u * 0.45, y + u * 0.75, x, y + u * 0.6, x - u * 0.45, y + u * 0.75, x - u * 0.8, y, x - u * 0.55, y - u * 0.7);
    const p = spath(P); g.save(); g.clip(p); g.fillStyle = '#f0544f'; g.fillRect(x - u, y - u, 2 * u, 2 * u); g.fillStyle = 'rgba(70,30,110,0.2)'; circ(g, x + u * 0.4, y + u * 0.45, u * 0.8); g.fill(); g.restore();
    g.lineWidth = lw(u, 5); g.strokeStyle = INK; g.stroke(p);
    g.fillStyle = 'rgba(255,255,255,0.75)'; ell(g, x - u * 0.38, y - u * 0.2, u * 0.12, u * 0.22, 0.3); g.fill();
    const st = new Path2D(); st.moveTo(x, y - u * 0.45); st.quadraticCurveTo(x + u * 0.05, y - u * 0.8, x + u * 0.18, y - u * 0.95); fatStroke(g, st, '#8a5a36', u * 0.1);
    const leaf = bl(x + u * 0.1, y - u * 0.7, x + u * 0.4, y - u * 1.0, x + u * 0.72, y - u * 0.82, x + u * 0.42, y - u * 0.62); inkFill(g, spath(leaf), '#5cc28a', lw(u, 4));
  },
  pet(g, x, y, u) {
    const P = bl(x - u * 0.5, y + u * 0.8, x - u * 0.58, y + u * 0.1, x - u * 0.95, y - u * 0.25, x - u * 0.8, y - u * 0.42, x - u * 0.42, y - u * 0.15,
      x - u * 0.45, y - u * 0.8, x - u * 0.3, y - u * 0.88, x - u * 0.2, y - u * 0.3, x - u * 0.12, y - u * 0.98, x + u * 0.04, y - u * 0.98, x + u * 0.08, y - u * 0.3,
      x + u * 0.22, y - u * 0.9, x + u * 0.38, y - u * 0.86, x + u * 0.34, y - u * 0.22, x + u * 0.55, y - u * 0.62, x + u * 0.7, y - u * 0.55, x + u * 0.55, y + u * 0.2, x + u * 0.4, y + u * 0.8);
    inkFill(g, spath(P), '#ffe0c2', lw(u, 5));
    g.fillStyle = 'rgba(255,120,140,0.4)'; ell(g, x - u * 0.05, y + u * 0.3, u * 0.25, u * 0.15); g.fill();
    const hx = x + u * 0.62, hy = y - u * 0.82, hs = u * 0.32, h = new Path2D();
    h.moveTo(hx, hy + hs * 0.9); h.bezierCurveTo(hx - hs * 1.5, hy, hx - hs * 0.7, hy - hs * 1.1, hx, hy - hs * 0.35); h.bezierCurveTo(hx + hs * 0.7, hy - hs * 1.1, hx + hs * 1.5, hy, hx, hy + hs * 0.9);
    inkFill(g, h, '#ff6f9a', lw(u, 4));
  },
  book(g, x, y, u) {
    const c = rrect(x - u * 0.62, y - u * 0.78, u * 1.24, u * 1.5, u * 0.14); inkFill(g, spath(c), '#ff86b8', lw(u, 5));
    const pg = new Path2D(); pg.rect(x - u * 0.55, y + u * 0.5, u * 1.12, u * 0.16);
    g.save(); g.fillStyle = '#fffaf0'; g.fill(pg); g.restore();
    const sp = new Path2D(); sp.moveTo(x - u * 0.42, y - u * 0.78); sp.lineTo(x - u * 0.42, y + u * 0.56); g.save(); g.strokeStyle = INK; g.lineWidth = lw(u, 3.5); g.stroke(sp); g.restore();
    inkFill(g, spath(starPts(x + u * 0.1, y - u * 0.12, u * 0.36, 0, 0.5)), '#ffd23f', lw(u, 3.5));
  },
  arrowL(g, x, y, u) { const p = new Path2D(); p.moveTo(x + u * 0.35, y - u * 0.6); p.lineTo(x - u * 0.35, y); p.lineTo(x + u * 0.35, y + u * 0.6); fatStroke(g, p, '#fffaf0', u * 0.34); },
  arrowR(g, x, y, u) { const p = new Path2D(); p.moveTo(x - u * 0.35, y - u * 0.6); p.lineTo(x + u * 0.35, y); p.lineTo(x - u * 0.35, y + u * 0.6); fatStroke(g, p, '#fffaf0', u * 0.34); },
  soundOn(g, x, y, u) {
    const sp = new Path2D(); sp.moveTo(x - u * 0.75, y - u * 0.25); sp.lineTo(x - u * 0.4, y - u * 0.25); sp.lineTo(x + u * 0.05, y - u * 0.65); sp.lineTo(x + u * 0.05, y + u * 0.65); sp.lineTo(x - u * 0.4, y + u * 0.25); sp.lineTo(x - u * 0.75, y + u * 0.25); sp.closePath();
    inkFill(g, sp, '#fffaf0', lw(u, 5));
    for (const [r, a] of [[0.4, 1], [0.72, 0.9]]) { const p = new Path2D(); p.arc(x + u * 0.1, y, u * r, -0.8, 0.8); fatStroke(g, p, '#fffaf0', u * 0.12); }
  },
  soundOff(g, x, y, u) {
    const sp = new Path2D(); sp.moveTo(x - u * 0.75, y - u * 0.25); sp.lineTo(x - u * 0.4, y - u * 0.25); sp.lineTo(x + u * 0.05, y - u * 0.65); sp.lineTo(x + u * 0.05, y + u * 0.65); sp.lineTo(x - u * 0.4, y + u * 0.25); sp.lineTo(x - u * 0.75, y + u * 0.25); sp.closePath();
    inkFill(g, sp, '#fffaf0', lw(u, 5));
    const p = new Path2D(); p.moveTo(x + u * 0.3, y - u * 0.3); p.lineTo(x + u * 0.85, y + u * 0.3); p.moveTo(x + u * 0.85, y - u * 0.3); p.lineTo(x + u * 0.3, y + u * 0.3); fatStroke(g, p, '#fffaf0', u * 0.14);
  },
  games(g, x, y, u) {
    // four little tiles: "all the games"
    for (const [dx, dy, c] of [[-0.42, -0.42, '#ff86b8'], [0.42, -0.42, '#ffd23f'], [-0.42, 0.42, '#5cc28a'], [0.42, 0.42, '#8fd3ff']]) {
      const p = new Path2D(); p.roundRect(x + dx * u - u * 0.34, y + dy * u - u * 0.34, u * 0.68, u * 0.68, u * 0.16); inkFill(g, p, c, lw(u, 4));
    }
  },
};

// a real-looking paintbrush: wooden handle, tin ferrule, wet bristles (tip at tx, ty)
export function brushTool(g, tx, ty, ang, len, paint, o = {}) {
  const w = o.w || len * 0.12;
  g.save(); g.translate(tx, ty); g.rotate(ang);
  if (o.shadow) { g.save(); g.translate(o.shadow, o.shadow * 1.4); g.globalAlpha = 0.18; g.fillStyle = '#3a2050'; rr(g, 0, -w * 0.5, len, w, w * 0.5); g.fill(); g.restore(); }
  const b = new Path2D(); b.moveTo(0, 0); b.bezierCurveTo(len * 0.05, -w * 0.75, len * 0.16, -w * 0.72, len * 0.25, -w * 0.5); b.lineTo(len * 0.25, w * 0.5); b.bezierCurveTo(len * 0.16, w * 0.72, len * 0.05, w * 0.7, 0, 0); b.closePath();
  g.fillStyle = '#e8d2a8'; g.fill(b);
  g.save(); g.clip(b);
  if (paint === 'rainbow') RAINBOW.forEach((c, i) => { g.fillStyle = c; g.fillRect(-5, -w + (i * w * 2) / 6, len * 0.17, (w * 2) / 6 + 1); });
  else {
    const pc = paint === 'glitter' ? GLITTER : paint;
    g.fillStyle = pc; g.beginPath(); g.moveTo(-5, -w); g.lineTo(len * 0.15, -w); g.quadraticCurveTo(len * 0.19, 0, len * 0.13, w); g.lineTo(-5, w); g.fill();
    if (paint === 'glitter') { const R = rng(4); for (let i = 0; i < 8; i++) star4(g, R() * len * 0.14, (R() - 0.5) * w * 1.4, w * 0.18, '#ffffff'); }
  }
  g.strokeStyle = 'rgba(80,50,30,0.35)'; g.lineWidth = Math.max(0.8, w * 0.03); for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(len * 0.02, i * w * 0.08); g.lineTo(len * 0.25, i * w * 0.14); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.45)'; ell(g, len * 0.09, -w * 0.25, len * 0.04, w * 0.1, 0.1); g.fill();
  g.restore();
  g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = Math.max(2, w * 0.12); g.stroke(b);
  const fx = len * 0.24, fw = len * 0.14;
  g.fillStyle = vgrad(g, -w * 0.55, w * 0.55, [[0, '#f4f6fb'], [0.45, '#b9c0d0'], [1, '#7c8396']]); rr(g, fx, -w * 0.55, fw, w * 1.1, w * 0.15); g.fill(); g.stroke();
  g.strokeStyle = rgba(INK, 0.5); g.lineWidth = Math.max(1, w * 0.06); for (const k of [0.35, 0.65]) { g.beginPath(); g.moveTo(fx + fw * k, -w * 0.5); g.lineTo(fx + fw * k, w * 0.5); g.stroke(); }
  const hx = fx + fw, hl = len - hx, h = new Path2D();
  h.moveTo(hx, -w * 0.45); h.bezierCurveTo(hx + hl * 0.4, -w * 0.62, hx + hl * 0.8, -w * 0.5, hx + hl, -w * 0.42); h.arc(hx + hl, 0, w * 0.42, -Math.PI / 2, Math.PI / 2); h.bezierCurveTo(hx + hl * 0.8, w * 0.5, hx + hl * 0.4, w * 0.62, hx, w * 0.45); h.closePath();
  g.save(); g.clip(h); g.fillStyle = o.handle || '#f0544f'; g.fillRect(hx, -w, hl + w, w * 2); g.fillStyle = '#ffd23f'; g.fillRect(hx + hl * 0.82, -w, hl, w * 2);
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(hx, -w * 0.4, hl + w, w * 0.18); g.fillStyle = 'rgba(70,30,90,0.22)'; g.fillRect(hx, w * 0.12, hl + w, w); g.restore();
  g.strokeStyle = INK; g.lineWidth = Math.max(2, w * 0.12); g.stroke(h);
  g.restore();
}

// a rainbow ribbon of paint along a curve: six bands, dry-brush at the start
export function rainbowTrail(g, pts, width, o = {}) {
  const P = [], n = pts.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  P.push(pts[0]);
  for (let i = 1; i < n - 1; i++) { const a = i === 1 ? pts[0] : m(pts[i - 1], pts[i]), c = pts[i], b = i === n - 2 ? pts[n - 1] : m(pts[i], pts[i + 1]); for (let k = 1; k <= 12; k++) { const t = k / 12, u = 1 - t; P.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } }
  const N = P.length, cols = o.cols || RAINBOW, bw = width / cols.length, R = rng(o.seed || 3);
  const nrm = P.map((p, i) => { const q = P[Math.min(N - 1, i + 1)], r = P[Math.max(0, i - 1)]; let nx = -(q[1] - r[1]), ny = q[0] - r[0]; const l = Math.hypot(nx, ny) || 1; return [nx / l, ny / l]; });
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.save(); g.globalAlpha = 0.12; g.strokeStyle = '#3a2050'; g.lineWidth = width; g.translate(width * 0.07, width * 0.11); g.stroke(spath(P, false)); g.restore();
  cols.forEach((c, k) => {
    const off = (k - (cols.length - 1) / 2) * bw;
    const Q = P.map((p, i) => { const taper = Math.min(1, i / (N * 0.25)) ** 0.6; return [p[0] + nrm[i][0] * off * (0.35 + 0.65 * taper), p[1] + nrm[i][1] * off * (0.35 + 0.65 * taper)]; });
    for (let s = 0; s < 12; s++) {
      const i0 = Math.floor((s / 12) * (N - 1)), i1 = Math.floor(((s + 1) / 12) * (N - 1)) + 1;
      g.globalAlpha = Math.min(1, 0.25 + s / 7); g.strokeStyle = c; g.lineWidth = bw + 2;
      g.stroke(spath(Q.slice(i0, i1 + 1), false));
    }
    g.globalAlpha = 0.35; g.strokeStyle = shade(c, 0.35); g.lineWidth = 1.5; g.stroke(spath(Q.map(([x, y], i) => [x + nrm[i][0] * bw * 0.2, y + nrm[i][1] * bw * 0.2]), false));
  });
  g.globalAlpha = 0.5; g.strokeStyle = o.bg || '#fffaf0'; g.lineWidth = 1.6;
  for (let k = 0; k < 9; k++) { const off = (R() - 0.5) * width * 0.9, i1 = Math.floor(N * (0.08 + R() * 0.25)); g.stroke(spath(P.slice(0, i1).map(([x, y], i) => [x + nrm[i][0] * off, y + nrm[i][1] * off]), false)); }
  g.restore();
}

// a paint pot: glass jar, paint inside, a heaped dollop and a drip (x, y = jar centre)
export function paintPot(g, x, y, col, s = 1) {
  const Y = y;
  softShadow(g, x, y + 48 * s, 52 * s, 10 * s, 0.32);
  const jar = rrect(x - 44 * s, Y - 34 * s, 88 * s, 80 * s, 26 * s), jp = spath(jar);
  const rainbow = col === 'rainbow', glitter = col === 'glitter', base = rainbow ? '#ffd23f' : glitter ? '#c9b6ff' : col;
  g.save(); g.clip(jp);
  g.fillStyle = 'rgba(235,245,255,0.95)'; g.fillRect(x - 50 * s, Y - 40 * s, 100 * s, 90 * s);
  if (rainbow) RAINBOW.forEach((c, i) => { g.fillStyle = c; g.fillRect(x - 50 * s + (i * 100 * s) / 6, Y - 22 * s, (100 * s) / 6 + 1, 80 * s); });
  else { g.fillStyle = vgrad(g, Y - 22 * s, Y + 46 * s, [[0, shade(base, 0.1)], [1, shade(base, -0.18)]]); g.fillRect(x - 50 * s, Y - 22 * s, 100 * s, 80 * s); }
  if (glitter) { const R = rng(9); for (let i = 0; i < 40; i++) { const px = x + (R() - 0.5) * 84 * s, py = Y - 20 * s + R() * 64 * s; if (R() < 0.25) star4(g, px, py, (3 + R() * 4) * s, '#ffffff'); else { g.fillStyle = R() < 0.5 ? '#ffffff' : '#ffe27a'; circ(g, px, py, 1.6 * s); g.fill(); } } }
  g.fillStyle = 'rgba(255,255,255,0.55)'; rr(g, x - 34 * s, Y - 26 * s, 12 * s, 60 * s, 6 * s); g.fill();
  g.fillStyle = 'rgba(70,30,110,0.14)'; g.fillRect(x + 22 * s, Y - 40 * s, 30 * s, 90 * s);
  g.restore();
  const lw5 = Math.max(2.2, 5 * s);
  g.save(); g.lineWidth = lw5; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke(jp); g.restore();
  g.fillStyle = '#e8eef8'; rr(g, x - 48 * s, Y - 44 * s, 96 * s, 18 * s, 9 * s); g.fill(); g.lineWidth = lw5; g.strokeStyle = INK; g.stroke();
  const D = bl(x - 40 * s, Y - 38 * s, x - 36 * s, Y - 58 * s, x - 10 * s, Y - 72 * s, x + 6 * s, Y - 84 * s, x + 14 * s, Y - 66 * s, x + 38 * s, Y - 58 * s, x + 42 * s, Y - 38 * s, x + 30 * s, Y - 30 * s, x + 26 * s, Y - 6 * s, x + 16 * s, Y - 6 * s, x + 14 * s, Y - 30 * s, x - 20 * s, Y - 30 * s);
  const dp = spath(D);
  g.save(); g.clip(dp);
  if (rainbow) RAINBOW.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(x, Y - 10 * s, (80 - i * 12) * s, 0, TAU); g.fill(); });
  else { g.fillStyle = base; g.fillRect(x - 50 * s, Y - 90 * s, 100 * s, 90 * s); }
  if (glitter) { const R = rng(3); for (let i = 0; i < 26; i++) { const px = x + (R() - 0.5) * 80 * s, py = Y - 80 * s + R() * 60 * s; star4(g, px, py, (2 + R() * 4) * s, R() < 0.5 ? '#ffffff' : '#fff4b0'); } }
  g.fillStyle = 'rgba(70,30,110,0.16)'; ell(g, x + 14 * s, Y - 36 * s, 40 * s, 14 * s); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)'; ell(g, x - 14 * s, Y - 60 * s, 12 * s, 6 * s, -0.4); g.fill();
  g.restore();
  g.save(); g.lineWidth = lw5; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke(dp); g.restore();
}

// the fill meter cloud (static) and one star (live)
export function meterCloud(g, cx, cy, r) {
  const n = 5, gap = r * 2.5, x0 = cx - ((n - 1) * gap) / 2;
  const cl = bl(x0 - r * 1.7, cy + r * 0.9, x0 - r * 1.9, cy - r * 0.6, x0 + gap * 1, cy - r * 1.6, x0 + gap * 3, cy - r * 1.6, x0 + gap * 4 + r * 1.9, cy - r * 0.6, x0 + gap * 4 + r * 1.7, cy + r * 0.9, cx, cy + r * 1.6);
  softShadow(g, cx, cy + r * 1.5, gap * 3, r * 0.5, 0.2);
  wash(g, cl, '#fffaf0', 4, { fill: '#fffaf0', edge: 0.15, mottle: 0.3, wob: 3 * r / 30, k: r / 30 }); inkLine(g, cl, Math.max(2, r * 0.13), 2, { col: rgba(INK, 0.7) });
}
export function meterStar(g, x, y, r, f, rot) {
  const P = starPts(x, y, r * (f >= 1 ? 1.08 : 1), rot, 0.5), p = spath(P);
  g.fillStyle = '#efe6f4'; g.fill(p);
  if (f > 0) {
    g.save(); g.clip(p); g.fillStyle = vgrad(g, y - r, y + r, [[0, '#ffe680'], [1, '#ffb52e']]); g.fillRect(x - r, y + r - 2 * r * f, 2 * r, 2 * r * f);
    g.fillStyle = 'rgba(255,255,255,0.6)'; ell(g, x - r * 0.25, y - r * 0.25, r * 0.22, r * 0.12, -0.6); g.fill(); g.restore();
  }
  g.save(); g.lineJoin = 'round'; g.lineWidth = Math.max(2, r * 0.16); g.strokeStyle = f > 0 ? INK : rgba(INK, 0.45); if (!f) g.setLineDash([r * 0.1, r * 0.25]); g.stroke(p); g.restore();
}

// the logo: fat painted letters, each its own sprite so they can bob
export function logoLetters(text, size, dpr) {
  const cols = ['#f0544f', '#ff9a3d', '#ffd23f', '#5cc28a', '#4b8ef0', null, '#9b6ff0', '#ff86b8', '#3cc0c0', '#ff9a3d', '#f0544f'];
  const font = `900 ${size}px ${ROUND}`;
  const mc = layer(4, 4).getContext('2d'); mc.font = font;
  const out = [];
  [...text].forEach((c, i) => {
    const w = mc.measureText(c).width;
    if (c === ' ') { out.push({ c, w, canvas: null }); return; }
    const S = Math.ceil(size * 1.6), L = layer(S * dpr, S * dpr), g = L.getContext('2d');
    g.scale(dpr, dpr); g.translate(S / 2, S / 2); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.save(); g.globalAlpha = 0.25; g.fillStyle = '#3a2050'; g.lineWidth = size * 0.2; g.strokeStyle = '#3a2050'; g.strokeText(c, size * 0.035, size * 0.07); g.fillText(c, size * 0.035, size * 0.07); g.restore();
    g.lineWidth = size * 0.2; g.strokeStyle = INK; g.strokeText(c, 0, 0);
    g.lineWidth = size * 0.1; g.strokeStyle = '#fffaf0'; g.strokeText(c, 0, 0);
    const col = cols[i % cols.length] || '#9b6ff0';
    const F = layer(S * dpr, S * dpr), fg = F.getContext('2d');
    fg.scale(dpr, dpr); fg.translate(S / 2, S / 2); fg.font = font; fg.textAlign = 'center'; fg.textBaseline = 'middle'; fg.fillStyle = col; fg.fillText(c, 0, 0);
    fg.globalCompositeOperation = 'source-atop';
    const R = rng(i * 7 + 1); zigzag(fg, { x: -S / 2, y: -S / 2, w: S, h: S, cx: 0, cy: 0 }, 0.9 + R() * 0.6, size * 0.08, size * 0.09, [shade(col, 0.25), shade(col, -0.1), col], R, { alpha: 0.5, bristle: 0.15 });
    const gr = fg.createLinearGradient(0, -size * 0.5, 0, size * 0.45);
    gr.addColorStop(0, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(70,30,110,0)'); gr.addColorStop(1, 'rgba(70,30,110,0.28)');
    fg.fillStyle = gr; fg.fillRect(-S / 2, -S / 2, S, S);
    g.drawImage(F, -S / 2, -S / 2, S, S);
    out.push({ c, w, canvas: L, S });
  });
  return out;
}

// a storybook cloth border around the whole screen
export function coverFrame(g, w, h, t) {
  g.save(); g.beginPath(); g.rect(0, 0, w, h); g.roundRect(t, t, w - 2 * t, h - 2 * t, t * 1.4); g.fillStyle = '#4a6fc0'; g.fill('evenodd');
  g.strokeStyle = rgba('#ffffff', 0.55); g.lineWidth = Math.max(1.5, t * 0.13); g.setLineDash([t * 0.45, t * 0.4]); g.beginPath(); g.roundRect(t / 2, t / 2, w - t, h - t, t); g.stroke(); g.setLineDash([]);
  g.beginPath(); g.roundRect(t, t, w - 2 * t, h - 2 * t, t * 1.4); g.strokeStyle = INK; g.lineWidth = Math.max(2, t * 0.22); g.stroke();
  g.restore();
}

export { KID, RAINBOW, sparkle, star4 };
