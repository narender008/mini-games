// RENDERER's painting kit: colour maths, seeded noise and the primitive
// painters ported from the approved concept (concept/prototype/lib.js and
// world.js). Pure Canvas 2D, no state except ENV (the light the painters use).
export const TAU = Math.PI * 2;
export const SERIF = "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, 'DejaVu Serif', serif";
export const SANS = "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', 'DejaVu Sans', Verdana, sans-serif";
export const OUT = 'rgba(42,24,34,0.8)';
export const BRASS = '#e0b25a', BRASS_D = '#8a5f22', INK = '#3b2a22', CREAM = '#fbf1da';
export const ODX = 0.55, ODY = -0.36; // oblique depth direction on screen (up-right)

// scene-wide light used by the painters (screen-space direction toward the light)
export const ENV = { lx: -0.6, ly: -0.8, night: 0 };

export function rng(seed) {
  let a = seed | 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
export function makeNoise(seed) {
  const r = rng(seed), v = Array.from({ length: 512 }, r);
  return (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return v[i & 511] + (v[(i + 1) & 511] - v[i & 511]) * u; };
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const HEX = new Map();
export function hex(c) {
  let v = HEX.get(c); if (v) return v;
  const n = parseInt(c.slice(1), 16); v = [n >> 16 & 255, n >> 8 & 255, n & 255]; HEX.set(c, v); return v;
}
export function rgba(c, a) { const A = hex(c); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }
export function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return '#' + [0, 1, 2].map((i) => Math.round(lerp(A[i], B[i], clamp(t, 0, 1))).toString(16).padStart(2, '0')).join('');
}
export const shade = (c, t) => (t > 0 ? mix(c, '#ffffff', t) : mix(c, '#1a1028', -t));

export function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
}

export function pathPts(g, pts, close = true) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
}
export function smooth(g, pts, close = true) {
  const n = pts.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  g.beginPath();
  if (close) {
    const s = m(pts[n - 1], pts[0]); g.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) { const p = pts[i], q = m(p, pts[(i + 1) % n]); g.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
    g.closePath();
  } else {
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) { const q = m(pts[i], pts[i + 1]); g.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]); }
    g.lineTo(pts[n - 1][0], pts[n - 1][1]);
  }
}
export function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, Math.abs(rx)), Math.max(0.1, Math.abs(ry)), rot, 0, TAU); }
export function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
// Soft glows are cached radial images per colour, drawn scaled with
// globalAlpha (the stops are linear in alpha, so this matches a gradient fill
// and costs far less on CPU-rasterised canvases than a fresh gradient).
const glowImgs = new Map();
function glowImg(col, soft) {
  const key = col + (soft ? '|s' : '');
  let c = glowImgs.get(key);
  if (c) return c;
  c = layer(96, 96); const cg = c.getContext('2d'), gr = cg.createRadialGradient(48, 48, 0, 48, 48, 48);
  if (soft) { gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(1, rgba(col, 0)); }
  else { gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.35, rgba(col, 0.35)); gr.addColorStop(1, rgba(col, 0)); }
  cg.fillStyle = gr; cg.fillRect(0, 0, 96, 96);
  if (glowImgs.size > 200) glowImgs.clear();
  glowImgs.set(key, c); return c;
}
export function glow(g, x, y, r, col, a = 1) {
  if (r <= 0 || a <= 0.003) return;
  const op = g.globalCompositeOperation, ga = g.globalAlpha;
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = ga * Math.min(1, a);
  g.drawImage(glowImg(col, false), x - r, y - r, r * 2, r * 2);
  g.globalCompositeOperation = op; g.globalAlpha = ga;
}
// soft glow without changing the blend mode (caller sets it)
export function softDot(g, x, y, r, col, a = 1) {
  if (r <= 0 || a <= 0.003) return;
  const ga = g.globalAlpha; g.globalAlpha = ga * Math.min(1, a);
  g.drawImage(glowImg(col, true), x - r, y - r, r * 2, r * 2);
  g.globalAlpha = ga;
}
export function vgrad(g, y0, y1, stops) { const gr = g.createLinearGradient(0, y0, 0, y1); for (const [o, c] of stops) gr.addColorStop(clamp(o, 0, 1), c); return gr; }
export function hgrad(g, x0, x1, stops) { const gr = g.createLinearGradient(x0, 0, x1, 0); for (const [o, c] of stops) gr.addColorStop(clamp(o, 0, 1), c); return gr; }

export function text(g, s, x, y, o = {}) {
  g.save();
  g.font = `${o.weight || 'normal'} ${o.size || 16}px ${o.font || SANS}`;
  g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'alphabetic';
  if (o.spacing && 'letterSpacing' in g) g.letterSpacing = o.spacing + 'px';
  if (o.shadow) { g.shadowColor = o.shadow; g.shadowBlur = o.blur ?? 6; g.shadowOffsetY = o.sy ?? 2; }
  if (o.stroke) { g.lineJoin = 'round'; g.strokeStyle = o.stroke; g.lineWidth = o.sw || 4; g.strokeText(s, x, y); g.shadowColor = 'transparent'; }
  g.fillStyle = o.color || '#fff'; g.fillText(s, x, y);
  g.restore();
}

// ---------- clouds ----------
// cel-shaded puff group: dark silhouette, mid body shifted toward the light, lit caps
export function puffGroup(g, puffs, lit, dark, o = {}) {
  if (!puffs.length) return;
  const mid = o.mid || mix(lit, dark, 0.45), lx = o.lx ?? ENV.lx, ly = o.ly ?? ENV.ly;
  let y0 = Infinity, y1 = -Infinity; for (const p of puffs) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  y0 -= 80; y1 += 60;
  g.fillStyle = vgrad(g, y0, y1, [[0, mix(dark, mid, 0.4)], [1, dark]]);
  g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); } g.fill();
  g.fillStyle = vgrad(g, y0, y1, [[0, mix(mid, lit, 0.35)], [1, mid]]);
  g.beginPath(); for (const [x, y, r] of puffs) { const R = r * 0.86, cx = x + lx * r * 0.1, cy = y + ly * r * 0.16; g.moveTo(cx + R, cy); g.arc(cx, cy, R, 0, TAU); } g.fill();
  g.fillStyle = lit;
  g.beginPath(); for (const [x, y, r] of puffs) { const R = r * 0.58, cx = x + lx * r * 0.28, cy = y + ly * r * 0.42; g.moveTo(cx + R, cy); g.arc(cx, cy, R, 0, TAU); } g.fill();
  if (o.rim) {
    g.strokeStyle = rgba(o.rim, o.rimA ?? 0.5); g.lineWidth = 2; g.beginPath();
    for (const [x, y, r] of puffs) { const cx = x + lx * r * 0.28, cy = y + ly * r * 0.42; g.moveTo(cx + Math.cos(-2.4) * r * 0.58, cy + Math.sin(-2.4) * r * 0.58); g.arc(cx, cy, r * 0.58, -2.4, -0.8); }
    g.stroke();
  }
}
// band of cumulus across [x0, x1] at y; wrap = period for seamless horizontal tiling
export function cloudBank(g, o) {
  const R = rng(o.seed || 1), n = makeNoise((o.seed || 1) + 9);
  const x0 = o.x0 ?? -150, x1 = o.x1, rmin = o.rmin, rmax = o.rmax, wrap = o.wrap || 0;
  g.save(); if (o.alpha != null) g.globalAlpha = o.alpha;
  for (let row = 0; row < 2; row++) {
    const puffs = []; let x = x0;
    while (x < x1) {
      const r = lerp(rmin, rmax, R()) * (row ? 1 : 0.75);
      const nx = wrap ? (Math.sin(x / wrap * TAU) + 1) * 3 + Math.cos(x / wrap * TAU) * 2.3 : x * 0.004;
      const y = o.y + (n(nx * (wrap ? 1.6 : 1) + row * 7) - 0.5) * (o.amp || 60) - (row ? 0 : r * 0.7) + R() * r * 0.2;
      const add = (px, py, pr) => { puffs.push([px, py, pr]); if (wrap) { puffs.push([px - wrap, py, pr]); puffs.push([px + wrap, py, pr]); } };
      add(x, y, r);
      if (R() < 0.7) add(x + r * (R() - 0.3) * 0.8, y - r * (0.5 + R() * 0.3), r * (0.45 + R() * 0.2));
      add(x, y + r * 0.9, r * 1.1); add(x, o.y + rmax * 2.2, r * 1.6);
      if (!o.short) add(x, o.y + rmax * 3.6, r * 2);
      x += r * (0.8 + R() * 0.55);
    }
    puffGroup(g, puffs, o.lit, o.dark, { rim: o.rim, lx: o.lx, ly: o.ly });
  }
  g.restore();
}
// a drifting cloud made of puffs with a flat-ish bottom; returns its puffs
export function cloudPuffs(x, y, w, s, seed = 1) {
  const R = rng(seed);
  const n = Math.max(4, Math.round(w / (34 * s))), pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), hump = Math.sin(t * Math.PI);
    const r = s * (16 + 30 * hump * (0.6 + R() * 0.6));
    pts.push([x - w / 2 + t * w, y - r * 0.45 - hump * s * 22 * R(), r]);
    if (hump > 0.5 && R() < 0.6) pts.push([x - w / 2 + t * w + (R() - 0.5) * 20 * s, y - r * 1.1, r * 0.6]);
  }
  return pts;
}
export function cloud(g, x, y, w, s, lit, dark, seed = 1, alpha = 1, o = {}) {
  g.save(); g.globalAlpha = alpha; puffGroup(g, cloudPuffs(x, y, w, s, seed), lit, dark, o); g.restore();
}
export function wisp(g, x, y, w, h, col, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, w);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
  g.save(); g.translate(x, y); g.scale(1, h / w); g.translate(-x, -y); g.fillStyle = gr; circ(g, x, y, w); g.fill(); g.restore();
}

// ---------- small props ----------
export function crystal(g, x, y, len, rot, cols) {
  g.save(); g.translate(x, y); g.rotate(rot);
  const w = len * 0.28;
  const pts = [[-w, 0], [-w * 0.8, len * 0.7], [0, len * 1.15], [w * 0.8, len * 0.7], [w, 0], [0, -len * 0.15]];
  pathPts(g, pts); g.fillStyle = vgrad(g, -len * 0.2, len * 1.1, [[0, cols[2]], [0.5, cols[1]], [1, cols[0]]]); g.fill();
  g.strokeStyle = rgba('#15304e', 0.7); g.lineWidth = Math.max(0.8, len * 0.05); g.lineJoin = 'round'; g.stroke();
  g.beginPath(); g.moveTo(-w * 0.8, len * 0.7); g.lineTo(0, len * 0.55); g.lineTo(w * 0.8, len * 0.7); g.moveTo(0, len * 0.55); g.lineTo(0, -len * 0.1);
  g.strokeStyle = rgba(cols[0], 0.7); g.lineWidth = 1; g.stroke();
  g.fillStyle = rgba('#ffffff', 0.55); pathPts(g, [[-w * 0.7, len * 0.1], [-w * 0.45, len * 0.6], [-w * 0.15, len * 0.5], [-w * 0.35, len * 0.05]]); g.fill();
  g.restore();
}
// an upright crystal (growing up from the ground)
export function crystalUp(g, x, y, len, rot, cols) {
  g.save(); g.translate(x, y); g.rotate(Math.PI + rot); crystal(g, 0, 0, len, 0, cols); g.restore();
}
export function puff(g, x, y, r, lit, dark) {
  const gr = g.createRadialGradient(x + ENV.lx * r * 0.45, y + ENV.ly * r * 0.55, r * 0.05, x, y, r);
  gr.addColorStop(0, lit); gr.addColorStop(0.55, mix(lit, dark, 0.35)); gr.addColorStop(1, dark);
  g.fillStyle = gr; circ(g, x, y, r); g.fill();
}
export function tree(g, x, y, s, o = {}) {
  const R = rng(o.seed || Math.floor(x * 7 + y * 13)), kind = o.kind || 'round';
  const pal = o.pal || ['#9ed36a', '#4f8f45', '#2c5a3c'], c = o.c || ((v) => v);
  g.fillStyle = rgba('#1d2a1a', 0.25); ell(g, x + 6 * s, y, 16 * s, 5 * s); g.fill();
  g.fillStyle = c('#6b4a35'); g.fillRect(x - 2.2 * s, y - 14 * s, 4.4 * s, 14 * s);
  if (kind === 'pine') {
    for (let i = 0; i < 4; i++) {
      const yy = y - 10 * s - i * 11 * s, w = (17 - i * 3.5) * s;
      g.fillStyle = c(pal[1]); g.beginPath(); g.moveTo(x - w, yy); g.lineTo(x, yy - 20 * s); g.lineTo(x + w, yy); g.closePath(); g.fill();
      g.fillStyle = c(pal[0]); g.beginPath(); g.moveTo(x - w, yy); g.lineTo(x, yy - 20 * s); g.lineTo(x - w * 0.1, yy - 1); g.closePath(); g.fill();
      g.strokeStyle = rgba('#1c2a20', 0.5); g.lineWidth = 1; g.beginPath(); g.moveTo(x - w, yy); g.lineTo(x, yy - 20 * s); g.lineTo(x + w, yy); g.stroke();
    }
    return;
  }
  const blobs = [[0, -30, 16], [-11, -22, 12], [11, -21, 12], [-4, -42, 12], [7, -37, 10]];
  g.fillStyle = c(o.outline || '#24402c');
  g.beginPath(); for (const [bx, by, br] of blobs) { g.moveTo(x + bx * s + (br + 2) * s, y + by * s); g.arc(x + bx * s, y + by * s, (br + 2) * s, 0, TAU); } g.fill();
  for (const [bx, by, br] of blobs) { g.fillStyle = c(pal[2]); circ(g, x + bx * s, y + by * s, (br + 1) * s); g.fill(); }
  for (const [bx, by, br] of blobs) {
    const X = x + bx * s, Y = y + by * s, r = br * s;
    const gr = g.createRadialGradient(X - r * 0.4, Y - r * 0.5, r * 0.1, X, Y, r);
    gr.addColorStop(0, c(shade(pal[0], 0.15))); gr.addColorStop(0.6, c(pal[1])); gr.addColorStop(1, c(pal[2]));
    g.fillStyle = gr; circ(g, X, Y, r); g.fill();
  }
  if (o.fruit) for (let i = 0; i < 5; i++) { g.fillStyle = c(o.fruit); circ(g, x + (R() - 0.5) * 30 * s, y - (22 + R() * 22) * s, 2 * s); g.fill(); }
}
export function bush(g, x, y, s, pal = ['#9ed36a', '#4f8f45'], flower) {
  for (let i = 0; i < 3; i++) { const X = x + (i - 1) * 7 * s, Y = y - 5 * s - (i === 1 ? 3 * s : 0); puff(g, X, Y, 7 * s, pal[0], pal[1]); }
  if (flower) for (let i = 0; i < 4; i++) { g.fillStyle = flower; circ(g, x + (i - 1.5) * 6 * s, y - 8 * s - (i % 2) * 4 * s, 1.8 * s); g.fill(); }
}
export function rockLump(g, x, y, s, cols = ['#d8cbbb', '#9c8a83', '#5f4c58'], o = {}) {
  const R = rng(o.seed || 1), j = () => (R() - 0.5) * 4;
  const pts = [[-20, 0], [-18 + j(), -12 + j()], [-6 + j(), -22 + j()], [8 + j(), -20 + j()], [19 + j(), -9 + j()], [21, 0]].map(([a, b]) => [x + a * s, y + b * s]);
  pathPts(g, pts); g.fillStyle = vgrad(g, y - 22 * s, y, [[0, cols[0]], [1, cols[1]]]); g.fill();
  g.fillStyle = cols[2]; pathPts(g, [[pts[3][0] - 6 * s, pts[3][1]], pts[3], pts[4], pts[5], [x + 4 * s, y]]); g.globalAlpha = 0.45; g.fill(); g.globalAlpha = 1;
  if (o.flecks) { for (let i = 0; i < (o.nf || 5); i++) { const X = x + (R() - 0.6) * 26 * s, Y = y - (3 + R() * 14) * s; g.fillStyle = o.flecks; pathPts(g, [[X, Y], [X + 4 * s, Y - 2.5 * s], [X + 5.5 * s, Y + 1.5 * s], [X + 1.5 * s, Y + 3 * s]]); g.fill(); } }
  pathPts(g, pts); g.strokeStyle = OUT; g.lineWidth = 1.3; g.lineJoin = 'round'; g.stroke();
}

// ---------- building kit (oblique: depth goes up-right) ----------
export function face(g, pts, fill, stroke = true) { pathPts(g, pts); g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = OUT; g.lineWidth = 1.3; g.lineJoin = 'round'; g.stroke(); } }
export function box(g, x, y, w, h, d, col) {
  const ox = d * ODX, oy = d * ODY;
  face(g, [[x + w, y], [x + w + ox, y + oy], [x + w + ox, y - h + oy], [x + w, y - h]], shade(col, -0.32));
  face(g, [[x, y - h], [x + w, y - h], [x + w + ox, y - h + oy], [x + ox, y - h + oy]], shade(col, 0.18));
  face(g, [[x, y], [x + w, y], [x + w, y - h], [x, y - h]], col);
  return { ox, oy };
}
export function gable(g, x, y, w, d, rh, col, o = 4) {
  const ox = d * ODX, oy = d * ODY, A = [x - o, y], B = [x + w + o, y], P = [x + w / 2, y - rh];
  face(g, [A, P, [P[0] + ox, P[1] + oy], [A[0] + ox, A[1] + oy]], shade(col, 0.12));
  face(g, [P, B, [B[0] + ox, B[1] + oy], [P[0] + ox, P[1] + oy]], shade(col, -0.3));
  return P;
}
export function gableFront(g, x, y, w, rh, wall) { face(g, [[x, y], [x + w, y], [x + w / 2, y - rh + 3]], shade(wall, -0.05)); }
export function win(g, x, y, w, h, lit = 0) {
  g.fillStyle = OUT; g.fillRect(x - 1, y - 1, w + 2, h + 2);
  if (lit > 0.2) { g.fillStyle = mix('#5a6a8c', '#ffd27a', lit); g.fillRect(x, y, w, h); }
  else { g.fillStyle = vgrad(g, y, y + h, [[0, '#9cc8e8'], [1, '#3e5a86']]); g.fillRect(x, y, w, h); g.fillStyle = rgba('#ffffff', 0.5); g.fillRect(x + 1, y + 1, w * 0.35, h * 0.4); }
  g.fillStyle = OUT; g.fillRect(x + w / 2 - 0.5, y, 1, h); g.fillRect(x, y + h / 2 - 0.5, w, 1);
}
export function door(g, x, y, w, h, col = '#6b4230') { g.fillStyle = col; rr(g, x, y - h, w, h, w * 0.45); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.2; g.stroke(); }
export function shadowBlob(g, x, y, w, h = w * 0.3) { g.fillStyle = 'rgba(20,30,15,0.22)'; ell(g, x, y, w, h); g.fill(); }
export function catenary(x1, y1, x2, y2, sag, n = 24) {
  const pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push([lerp(x1, x2, t), lerp(y1, y2, t) + sag * 4 * t * (1 - t)]); } return pts;
}
export function settler(g, x, y, s = 1, col = '#3f6fb0', carry, step = 0) {
  g.fillStyle = 'rgba(20,30,15,0.25)'; ell(g, x, y, 5 * s, 1.8 * s); g.fill();
  const a = Math.sin(step) * 1.4 * s;
  g.fillStyle = '#3a2a2a'; g.fillRect(x - 2.5 * s, y - 5 * s, 2 * s, 5 * s + Math.min(0, a)); g.fillRect(x + 0.5 * s, y - 5 * s, 2 * s, 5 * s - Math.max(0, a));
  g.fillStyle = col; rr(g, x - 3.5 * s, y - 13 * s, 7 * s, 9 * s, 2.5 * s); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.9; g.stroke();
  g.fillStyle = '#f1c9a0'; circ(g, x, y - 16 * s, 3 * s); g.fill(); g.stroke();
  g.fillStyle = '#6b4230'; g.beginPath(); g.arc(x, y - 17 * s, 3.2 * s, Math.PI, 0); g.fill();
  if (carry) { g.fillStyle = carry; g.fillRect(x + 2 * s, y - 15 * s, 6 * s, 5 * s); g.strokeRect(x + 2 * s, y - 15 * s, 6 * s, 5 * s); }
}
export function birdsAt(g, list, s, col) {
  g.strokeStyle = col; g.lineWidth = 1.4 * s; g.lineCap = 'round'; g.beginPath();
  for (const [X, Y, w, flap] of list) {
    const k = 0.4 + 0.5 * flap;
    g.moveTo(X - w, Y - w * k); g.quadraticCurveTo(X - w * 0.3, Y - w * (0.2 + flap * 0.6), X, Y); g.quadraticCurveTo(X + w * 0.3, Y - w * (0.2 + flap * 0.6), X + w, Y - w * k);
  }
  g.stroke();
}

// ---------- airships (fallback painter; ART's ships.js replaces it) ----------
export function airship(g, x, y, s = 1, o = {}) {
  const env = o.env || ['#f3e7cc', '#b98d6b'], dir = o.dir || 1, night = o.night ?? ENV.night;
  g.save(); g.translate(x, y); g.scale(dir * s, s);
  g.strokeStyle = rgba('#3a2a2a', 0.8); g.lineWidth = 1.2;
  for (const rx of [-40, -14, 14, 40]) { g.beginPath(); g.moveTo(rx, 22); g.lineTo(rx * 0.55, 52); g.stroke(); }
  face(g, [[-86, -4], [-118, -30], [-112, -2]], o.fin || shade(env[1], -0.1));
  face(g, [[-86, 6], [-116, 30], [-108, 8]], o.fin || shade(env[1], -0.25));
  ell(g, 0, 0, 96, 34);
  const eg = g.createLinearGradient(0, -34, 0, 34); eg.addColorStop(0, shade(env[0], 0.25)); eg.addColorStop(0.45, env[0]); eg.addColorStop(1, env[1]);
  g.fillStyle = eg; g.fill();
  g.save(); ell(g, 0, 0, 96, 34); g.clip();
  for (let i = -3; i <= 3; i++) { g.strokeStyle = rgba(shade(env[1], -0.4), 0.35); g.lineWidth = 1.2; g.beginPath(); g.ellipse(i * 24, 0, 10 + Math.abs(i) * 2, 36, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); }
  if (o.band) { g.fillStyle = o.band; g.fillRect(-100, -6, 200, 10); g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(-100, 2, 200, 2); }
  if (o.patches) { const R = rng(7); for (let i = 0; i < 5; i++) { const px = (R() - 0.5) * 140, py = (R() - 0.5) * 40; g.fillStyle = R() < 0.5 ? '#3a2a30' : '#7a3a2a'; g.fillRect(px, py, 14, 10); g.strokeStyle = rgba('#e0c090', 0.6); g.setLineDash([2, 2]); g.strokeRect(px, py, 14, 10); g.setLineDash([]); } }
  g.fillStyle = rgba('#ffffff', 0.3); ell(g, -20, -20, 50, 7, -0.05); g.fill();
  g.restore();
  ell(g, 0, 0, 96, 34); g.strokeStyle = OUT; g.lineWidth = 1.5; g.stroke();
  if (o.emblem) o.emblem(g);
  const hull = o.hull || '#9a6a42';
  face(g, [[-52, 50], [52, 50], [44, 66], [30, 72], [-36, 72], [-50, 62]], hull);
  g.strokeStyle = rgba('#3a2010', 0.5); g.lineWidth = 1; g.beginPath(); g.moveTo(-50, 58); g.lineTo(48, 58); g.moveTo(-42, 66); g.lineTo(40, 66); g.stroke();
  g.fillStyle = shade(hull, 0.25); g.fillRect(-52, 47, 104, 4);
  box(g, -24, 50, 34, 14, 10, o.cabin || '#e8d6b0');
  win(g, -20, 39, 6, 6, o.lamp ?? night); win(g, -8, 39, 6, 6, o.lamp ?? night);
  face(g, [[-27, 36], [13, 36], [18, 32], [-22, 32]], o.roof || '#5d6fa6');
  if (o.cargo) { const pos = [[0, 0], [12, 0], [5, -11]]; for (const [a, b] of pos) box(g, 18 + a * 0.8, 50 + b * 0.8, 9, 8, 6, o.cargo); }
  if (o.cannons) for (const cx of [-34, 26]) { g.fillStyle = '#2a2a30'; g.fillRect(cx, 60, 10, 5); circ(g, cx + 11, 62.5, 3); g.fill(); }
  g.fillStyle = '#5a4a48'; g.fillRect(-64, 54, 14, 4);
  const pa = o.prop ?? 0; g.fillStyle = rgba('#d8d2c8', 0.5); ell(g, -66, 56, 4, 16 * Math.abs(Math.cos(pa)) + 3); g.fill(); g.strokeStyle = rgba('#3a2a2a', 0.6); g.lineWidth = 1; g.stroke();
  if (o.flag) { g.strokeStyle = '#3a2a2a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(44, 50); g.lineTo(44, 26); g.stroke(); face(g, [[44, 26], [62, 30 + Math.sin(pa * 0.3) * 2], [44, 36]], o.flag); }
  g.restore();
}
export function pirateEmblem(g) {
  g.fillStyle = '#efe6d4'; circ(g, 20, -4, 11); g.fill(); g.fillRect(14, 4, 12, 7);
  g.fillStyle = '#2a1a22'; circ(g, 16, -4, 3); circ(g, 24, -4, 3); g.fill();
  g.strokeStyle = '#efe6d4'; g.lineWidth = 4; g.beginPath(); g.moveTo(2, -18); g.lineTo(38, 14); g.moveTo(38, -18); g.lineTo(2, 14); g.stroke();
}
export const PIRATE_LOOK = { env: ['#6a2a30', '#2a1018'], band: '#161216', hull: '#3a2a26', cabin: '#5a4a40', roof: '#2a1a1a', flag: '#161216', fin: '#2a1a1e', patches: true, cannons: true, emblem: pirateEmblem, lamp: 0.9 };

// A full-screen vignette from a small cached image (smooth radial gradients upscale
// cleanly), so the frame never fills a big radial gradient. key -> canvas.
const vigCache = new Map();
export function vignetteImage(col, a, inner = 0.38, outer = 0.75, aspect = 16 / 9) {
  const w = 192, h = Math.max(32, Math.round(w / Math.max(0.3, Math.min(3, aspect)) / 8) * 8);
  const key = col + a.toFixed(2) + inner + outer + w + 'x' + h;
  let c = vigCache.get(key);
  if (c) return c;
  if (vigCache.size > 24) vigCache.clear();
  c = layer(w, h); const g = c.getContext('2d');
  const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * inner, w / 2, h / 2, Math.max(w, h) * outer);
  gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(1, rgba(col, a)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  vigCache.set(key, c); return c;
}
