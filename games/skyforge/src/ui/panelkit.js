// PANELS shared kit: paint helpers ported from the concept renderer, a small
// DOM builder, number/time formatting, and data adapters that read content and
// G (with mock data shaped per the build brief while a content file is still
// a stub). Cosmetic only: nothing here touches the simulation.
export const TAU = Math.PI * 2;
export const SERIF = "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, 'DejaVu Serif', serif";
export const SANS = "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', 'DejaVu Sans', Verdana, sans-serif";
export const BRASS = '#e0b25a', BRASS_D = '#8a5f22', INK = '#3b2a22', CREAM = '#fbf1da', NAVY = '#2c2a58', NAVY_D = '#17153a';
export const OUT = 'rgba(42,24,34,0.8)';

// ---------------------------------------------------------------- maths, colour
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function rng(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function makeNoise(seed) {
  const r = rng(seed), v = Array.from({ length: 512 }, r);
  return (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return v[i & 511] + (v[(i + 1) & 511] - v[i & 511]) * u; };
}
export function strSeed(s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgba(c, a) { if (c[0] !== '#') return c; const A = hex(c); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }
export function mix(a, b, t) { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); }
export const shade = (c, t) => (t > 0 ? mix(c, '#ffffff', t) : mix(c, '#1a1028', -t));

// ---------------------------------------------------------------- canvas helpers
export function layer(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
export const DPR = () => Math.min(2.5, Math.max(1, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1));
export function pathPts(g, pts, close = true) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); if (close) g.closePath(); }
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
export function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); }
export function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
export function glow(g, x, y, r, col, a = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.35, rgba(col, a * 0.35)); gr.addColorStop(1, rgba(col, 0));
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
export function vgrad(g, y0, y1, stops) { const gr = g.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; }
export function hgrad(g, x0, x1, stops) { const gr = g.createLinearGradient(x0, 0, x1, 0); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; }
export function face(g, pts, fill, stroke = true) { pathPts(g, pts); g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = OUT; g.lineWidth = 1.3; g.lineJoin = 'round'; g.stroke(); } }
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

// ---------------------------------------------------------------- clouds (cel-shaded puffs)
export const ENV = { lx: -0.6, ly: -0.8, night: 0 };
export function puff(g, x, y, r, lit, dark) {
  const gr = g.createRadialGradient(x + ENV.lx * r * 0.45, y + ENV.ly * r * 0.55, r * 0.05, x, y, r);
  gr.addColorStop(0, lit); gr.addColorStop(0.55, mix(lit, dark, 0.35)); gr.addColorStop(1, dark);
  g.fillStyle = gr; circ(g, x, y, r); g.fill();
}
export function puffGroup(g, puffs, lit, dark, o = {}) {
  if (!puffs.length) return;
  const mid = o.mid || mix(lit, dark, 0.45), lx = ENV.lx, ly = ENV.ly;
  const ys = puffs.map((p) => p[1]), y0 = Math.min(...ys) - 80, y1 = Math.max(...ys) + 60;
  g.fillStyle = vgrad(g, y0, y1, [[0, mix(dark, mid, 0.4)], [1, dark]]);
  g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); } g.fill();
  g.fillStyle = vgrad(g, y0, y1, [[0, mix(mid, lit, 0.35)], [1, mid]]);
  g.beginPath(); for (const [x, y, r] of puffs) { const R = r * 0.86; g.moveTo(x + lx * r * 0.1 + R, y + ly * r * 0.16); g.arc(x + lx * r * 0.1, y + ly * r * 0.16, R, 0, TAU); } g.fill();
  g.fillStyle = lit;
  g.beginPath(); for (const [x, y, r] of puffs) { const R = r * 0.58; g.moveTo(x + lx * r * 0.28 + R, y + ly * r * 0.42); g.arc(x + lx * r * 0.28, y + ly * r * 0.42, R, 0, TAU); } g.fill();
}
export function cloud(g, x, y, w, s, lit, dark, seed = 1, alpha = 1) {
  const R = rng(seed); g.save(); g.globalAlpha = alpha;
  const n = Math.max(4, Math.round(w / (34 * s))), pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), hump = Math.sin(t * Math.PI);
    const r = s * (16 + 30 * hump * (0.6 + R() * 0.6));
    pts.push([x - w / 2 + t * w, y - r * 0.45 - hump * s * 22 * R(), r]);
    if (hump > 0.5 && R() < 0.6) pts.push([x - w / 2 + t * w + (R() - 0.5) * 20 * s, y - r * 1.1, r * 0.6]);
  }
  puffGroup(g, pts, lit, dark);
  g.restore();
}
export function wisp(g, x, y, w, h, col, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, w);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
  g.save(); g.translate(x, y); g.scale(1, h / w); g.translate(-x, -y); g.fillStyle = gr; circ(g, x, y, w); g.fill(); g.restore();
}
export function smoke(g, x, y, s, col = '#e8e2dc', n = 7, seed = 1, drift = 1) {
  const R = rng(seed);
  for (let i = n - 1; i >= 0; i--) {
    const t = i / n, X = x + drift * t * t * 70 * s + (R() - 0.5) * 6 * s, Y = y - t * 90 * s, r = (6 + t * 18) * s, a = 0.75 * (1 - t) + 0.08;
    const gr = g.createRadialGradient(X + ENV.lx * r * 0.3, Y - r * 0.3, 0, X, Y, r);
    gr.addColorStop(0, rgba(shade(col, 0.15), a)); gr.addColorStop(0.6, rgba(col, a * 0.8)); gr.addColorStop(1, rgba(shade(col, -0.2), 0));
    g.fillStyle = gr; circ(g, X, Y, r); g.fill();
  }
}

// ---------------------------------------------------------------- floating island (side view, for vignettes and portraits)
export function crystal(g, x, y, len, rot, cols) {
  g.save(); g.translate(x, y); g.rotate(rot);
  const w = len * 0.28;
  pathPts(g, [[-w, 0], [-w * 0.8, len * 0.7], [0, len * 1.15], [w * 0.8, len * 0.7], [w, 0], [0, -len * 0.15]]);
  g.fillStyle = vgrad(g, -len * 0.2, len * 1.1, [[0, cols[2]], [0.5, cols[1]], [1, cols[0]]]); g.fill();
  g.strokeStyle = rgba('#15304e', 0.7); g.lineWidth = 1.2; g.stroke();
  g.beginPath(); g.moveTo(-w * 0.8, len * 0.7); g.lineTo(0, len * 0.55); g.lineTo(w * 0.8, len * 0.7); g.moveTo(0, len * 0.55); g.lineTo(0, -len * 0.1);
  g.strokeStyle = rgba(cols[0], 0.7); g.lineWidth = 1; g.stroke();
  g.fillStyle = rgba('#ffffff', 0.55); pathPts(g, [[-w * 0.7, len * 0.1], [-w * 0.45, len * 0.6], [-w * 0.15, len * 0.5], [-w * 0.35, len * 0.05]]); g.fill();
  g.restore();
}
// o: x, y (top centre), rx, ry, depth, seed, grass[lit,dark], rock[lit,mid,dark], dirt[lit,dark], crystals, crystalCol, roots, spikes
export function island(g, o) {
  const R = rng(o.seed), n = makeNoise(o.seed * 13 + 7), n2 = makeNoise(o.seed * 7 + 3);
  const grass = o.grass || ['#a6d36a', '#5f9a48'], rock = o.rock || ['#d9a77c', '#9a6a62', '#4c3550'], dirt = o.dirt || ['#b27b4f', '#6b4234'];
  const N = 96, top = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, k = 1 + 0.16 * (n(a * 1.6 + 2) - 0.5) + 0.06 * (n2(a * 6) - 0.5);
    top.push([o.x + Math.cos(a) * o.rx * k, o.y + Math.sin(a) * o.ry * k]);
  }
  const lip = o.lip ?? o.ry * 0.3;
  const front = top.slice(0, N / 2 + 1);
  const rimY = (x) => { let best = front[0]; for (const p of front) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p; return best[1]; };
  const spikes = []; for (let i = 0; i < (o.spikes ?? 3); i++) spikes.push([R() * 1.6 - 0.8, 0.06 + R() * 0.12, (0.15 + R() * 0.35) * o.depth]);
  const bottom = [], M = 70;
  for (let j = 0; j <= M; j++) {
    const t = -1 + (2 * j) / M, X = o.x + t * o.rx * 0.985;
    let D = o.depth * Math.pow(Math.max(0, 1 - t * t), 1.25) * (0.72 + 0.5 * n(t * 2.4 + 4));
    for (const [st, sw, sh] of spikes) D += sh * Math.exp(-(((t - st) / sw) ** 2)) * (1 - t * t);
    D += (n2(t * 30 + 1) - 0.5) * o.depth * 0.1 * (1 - t * t);
    bottom.push([X, rimY(X) + lip + D * 0.98]);
  }
  const und = front.map((p) => [p[0], p[1] + lip]).concat(bottom);
  let tip = bottom[0]; for (const p of bottom) if (p[1] > tip[1]) tip = p;
  g.save();
  pathPts(g, und); g.fillStyle = vgrad(g, o.y, tip[1], [[0, rock[0]], [0.35, rock[1]], [1, rock[2]]]); g.fill();
  g.clip();
  g.fillStyle = hgrad(g, o.x - o.rx, o.x + o.rx, [[0, rgba('#fff3dc', 0.2)], [0.45, 'rgba(0,0,0,0)'], [1, rgba('#160a26', 0.4)]]);
  g.fillRect(o.x - o.rx - 10, o.y, o.rx * 2 + 20, tip[1] - o.y + 10);
  for (let k = 0; k < 40; k++) {
    const t = R() * 2 - 1, x = o.x + t * o.rx * 0.95, y0 = rimY(x) + lip + R() * o.depth * 0.6;
    const w = o.rx * (0.04 + R() * 0.1), h = o.depth * (0.15 + R() * 0.45), lit = t < 0 ? R() < 0.7 : R() < 0.25;
    g.fillStyle = lit ? rgba(rock[0], 0.12 + R() * 0.2) : rgba('#1b0f2a', 0.05 + R() * 0.1);
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x + w, y0 + h * 0.1); g.lineTo(x + w * 0.6, y0 + h); g.lineTo(x - w * 0.1, y0 + h * 0.6); g.fill();
  }
  for (let s = 0; s < 4; s++) {
    const off = lip + 5 + s * (o.depth * 0.1) + R() * 4;
    g.beginPath();
    for (let j = 0; j <= 40; j++) { const t = -1 + (2 * j) / 40, X = o.x + t * o.rx; const Y = rimY(X) + off + (n2(t * 8 + s * 3) - 0.5) * 6; j ? g.lineTo(X, Y) : g.moveTo(X, Y); }
    g.strokeStyle = rgba('#1c0f26', 0.2); g.lineWidth = 1.8; g.stroke();
  }
  g.fillStyle = vgrad(g, o.y + o.ry * 0.5, o.y + o.ry + lip + 24, [[0, 'rgba(20,8,30,0)'], [0.7, 'rgba(20,8,30,0.35)'], [1, 'rgba(20,8,30,0)']]);
  g.fillRect(o.x - o.rx - 10, o.y, o.rx * 2 + 20, o.ry + lip + 30);
  g.restore();
  if (o.crystals !== false) {
    const cs = o.cs || 1, cols = o.crystalCol || ['#c9fbff', '#5fd3e8', '#2c6fa8'];
    glow(g, tip[0], tip[1] - 8 * cs, 70 * cs, cols[1], 0.5);
    const list = [];
    for (let k = 0; k < 7; k++) list.push([tip[0] + (R() - 0.5) * 46 * cs, tip[1] - 22 * cs - R() * 26 * cs, (8 + R() * 16) * cs, (R() - 0.5) * 1.1]);
    list.sort((a, b) => b[2] - a[2]);
    for (const [x, y, len, rot] of list) crystal(g, x, y, len, rot, cols);
  }
  for (let k = 0; k < (o.roots ?? 8); k++) {
    const t = R() * 1.8 - 0.9, x = o.x + t * o.rx, y = rimY(x) + lip * 0.8, len = 10 + R() * 34 * (1 - t * t);
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 4, y + len * 0.4, x - 4, y + len * 0.7, x + (R() - 0.5) * 8, y + len);
    g.strokeStyle = R() < 0.5 ? '#4f6b3a' : '#5a3b2e'; g.lineWidth = 1 + R() * 1.2; g.stroke();
  }
  const band = front.concat(front.slice().reverse().map((p) => [p[0], p[1] + lip]));
  pathPts(g, band); g.fillStyle = vgrad(g, o.y + o.ry * 0.3, o.y + o.ry + lip, [[0, dirt[0]], [1, dirt[1]]]); g.fill();
  smooth(g, top);
  const gg = g.createLinearGradient(o.x - o.rx * 0.6, o.y - o.ry, o.x + o.rx * 0.5, o.y + o.ry);
  gg.addColorStop(0, shade(grass[0], 0.12)); gg.addColorStop(0.55, grass[0]); gg.addColorStop(1, grass[1]);
  g.fillStyle = gg; g.fill();
  g.save(); smooth(g, top); g.clip();
  for (let k = 0; k < 30; k++) {
    const a = R() * TAU, d = Math.sqrt(R()), X = o.x + Math.cos(a) * o.rx * d, Y = o.y + Math.sin(a) * o.ry * d;
    g.fillStyle = R() < 0.5 ? rgba(grass[1], 0.25) : rgba(shade(grass[0], 0.25), 0.22);
    ell(g, X, Y, 10 + R() * 30, 4 + R() * 9, 0); g.fill();
  }
  g.lineWidth = 6; g.strokeStyle = rgba(grass[1], 0.35); smooth(g, top); g.stroke();
  g.restore();
  smooth(g, top); g.strokeStyle = rgba('#2a1822', 0.35); g.lineWidth = 1; g.stroke();
  for (let k = 0; k < o.rx / 6; k++) {
    const p = front[Math.floor(R() * front.length)];
    g.fillStyle = R() < 0.5 ? grass[1] : shade(grass[1], -0.15);
    g.beginPath(); g.moveTo(p[0] - 4, p[1] - 1); g.lineTo(p[0] + (R() - 0.5) * 3, p[1] + 3 + R() * 7); g.lineTo(p[0] + 4, p[1] - 1); g.fill();
  }
  return { x: o.x, y: o.y, rx: o.rx, ry: o.ry, tip, at: (u, v) => [o.x + u * o.rx, o.y + v * o.ry] };
}

// ---------------------------------------------------------------- props for vignettes
export function tree(g, x, y, s, o = {}) {
  const pal = o.pal || ['#9ed36a', '#4f8f45', '#2c5a3c'];
  g.fillStyle = rgba('#1d2a1a', 0.25); ell(g, x + 6 * s, y, 16 * s, 5 * s); g.fill();
  g.fillStyle = '#6b4a35'; g.fillRect(x - 2.2 * s, y - 14 * s, 4.4 * s, 14 * s);
  if (o.kind === 'pine') {
    const pp = o.pal || ['#7cc06a', '#3b7a4c', '#24503a'];
    for (let i = 0; i < 4; i++) {
      const yy = y - 10 * s - i * 11 * s, w = (17 - i * 3.5) * s;
      g.fillStyle = pp[1]; g.beginPath(); g.moveTo(x - w, yy); g.lineTo(x, yy - 20 * s); g.lineTo(x + w, yy); g.closePath(); g.fill();
      g.fillStyle = pp[0]; g.beginPath(); g.moveTo(x - w, yy); g.lineTo(x, yy - 20 * s); g.lineTo(x - w * 0.1, yy - 1); g.closePath(); g.fill();
      g.strokeStyle = rgba('#1c2a20', 0.5); g.lineWidth = 1; g.beginPath(); g.moveTo(x - w, yy); g.lineTo(x, yy - 20 * s); g.lineTo(x + w, yy); g.stroke();
    }
    return;
  }
  const blobs = [[0, -30, 16], [-11, -22, 12], [11, -21, 12], [-4, -42, 12], [7, -37, 10]];
  for (const [bx, by, br] of blobs) { g.fillStyle = pal[2]; circ(g, x + bx * s, y + by * s, (br + 1.5) * s); g.fill(); }
  for (const [bx, by, br] of blobs) {
    const X = x + bx * s, Y = y + by * s, r = br * s;
    const gr = g.createRadialGradient(X - r * 0.4, Y - r * 0.5, r * 0.1, X, Y, r);
    gr.addColorStop(0, shade(pal[0], 0.15)); gr.addColorStop(0.6, pal[1]); gr.addColorStop(1, pal[2]);
    g.fillStyle = gr; circ(g, X, Y, r); g.fill();
  }
}
const DXo = 0.55, DYo = -0.36;
export function box(g, x, y, w, h, d, col) {
  const ox = d * DXo, oy = d * DYo;
  face(g, [[x + w, y], [x + w + ox, y + oy], [x + w + ox, y - h + oy], [x + w, y - h]], shade(col, -0.32));
  face(g, [[x, y - h], [x + w, y - h], [x + w + ox, y - h + oy], [x + ox, y - h + oy]], shade(col, 0.18));
  face(g, [[x, y], [x + w, y], [x + w, y - h], [x, y - h]], col);
}
function gable(g, x, y, w, d, rh, col, o = 4) {
  const ox = d * DXo, oy = d * DYo, A = [x - o, y], B = [x + w + o, y], P = [x + w / 2, y - rh];
  face(g, [A, P, [P[0] + ox, P[1] + oy], [A[0] + ox, A[1] + oy]], shade(col, 0.12));
  face(g, [P, B, [B[0] + ox, B[1] + oy], [P[0] + ox, P[1] + oy]], shade(col, -0.3));
}
export function winPane(g, x, y, w, h, lit = 0) {
  g.fillStyle = OUT; g.fillRect(x - 1, y - 1, w + 2, h + 2);
  if (lit > 0.2) { g.fillStyle = mix('#5a6a8c', '#ffd27a', lit); g.fillRect(x, y, w, h); }
  else { g.fillStyle = vgrad(g, y, y + h, [[0, '#9cc8e8'], [1, '#3e5a86']]); g.fillRect(x, y, w, h); }
  g.fillStyle = OUT; g.fillRect(x + w / 2 - 0.5, y, 1, h);
}
export function cottage(g, x, y, s = 1, o = {}) {
  const w = 34 * s, h = 22 * s, d = 26 * s, wall = o.wall || '#f1e2c2', roof = o.roof || '#c4553b';
  g.fillStyle = 'rgba(20,30,15,0.22)'; ell(g, x + w * 0.7, y - 2, w * 0.9, w * 0.27); g.fill();
  box(g, x, y, w, h, d, wall);
  gable(g, x, y - h, w, d, 18 * s, roof);
  face(g, [[x, y - h], [x + w, y - h], [x + w / 2, y - h - 18 * s + 3]], shade(wall, -0.05));
  g.fillStyle = '#6b4230'; rr(g, x + w * 0.38, y - h * 0.62, w * 0.24, h * 0.62, w * 0.1); g.fill();
  winPane(g, x + w * 0.08, y - h * 0.75, w * 0.2, h * 0.32, o.lit || 0);
  winPane(g, x + w * 0.7, y - h * 0.75, w * 0.2, h * 0.32, o.lit || 0);
}
export function windmill(g, x, y, s = 1, ang = 0.4) {
  const w0 = 26 * s, w1 = 16 * s, h = 70 * s;
  face(g, [[x - w0 / 2, y], [x + w0 / 2, y], [x + w1 / 2, y - h], [x - w1 / 2, y - h]], '#efe6d4');
  g.fillStyle = rgba('#3a2034', 0.22); pathPts(g, [[x + 2 * s, y], [x + w0 / 2, y], [x + w1 / 2, y - h], [x + 2 * s, y - h]]); g.fill();
  face(g, [[x - w1 / 2 - 4 * s, y - h], [x + w1 / 2 + 4 * s, y - h], [x, y - h - 18 * s]], '#5d6fa6');
  const hx = x, hy = y - h + 2 * s;
  for (let i = 0; i < 4; i++) {
    g.save(); g.translate(hx, hy); g.rotate(ang + (i * Math.PI) / 2);
    g.fillStyle = rgba('#fbf3e2', 0.92); g.fillRect(3 * s, -6 * s, 46 * s, 12 * s);
    g.strokeStyle = OUT; g.lineWidth = 1.1; g.strokeRect(3 * s, -6 * s, 46 * s, 12 * s);
    g.fillStyle = '#7a5038'; g.fillRect(0, -1.5 * s, 50 * s, 3 * s);
    g.restore();
  }
  g.fillStyle = '#6b4230'; circ(g, hx, hy, 4 * s); g.fill();
}
export function miniAirship(g, x, y, s = 1, o = {}) {
  const env = o.env || ['#f3e7cc', '#b98d6b'];
  g.save(); g.translate(x, y); g.scale((o.dir || 1) * s, s);
  g.strokeStyle = rgba('#3a2a2a', 0.8); g.lineWidth = 1.2;
  for (const rx of [-40, -14, 14, 40]) { g.beginPath(); g.moveTo(rx, 22); g.lineTo(rx * 0.55, 52); g.stroke(); }
  face(g, [[-86, -4], [-118, -30], [-112, -2]], shade(env[1], -0.1));
  face(g, [[-86, 6], [-116, 30], [-108, 8]], shade(env[1], -0.25));
  ell(g, 0, 0, 96, 34);
  const eg = g.createLinearGradient(0, -34, 0, 34); eg.addColorStop(0, shade(env[0], 0.25)); eg.addColorStop(0.45, env[0]); eg.addColorStop(1, env[1]);
  g.fillStyle = eg; g.fill();
  g.save(); ell(g, 0, 0, 96, 34); g.clip();
  for (let i = -3; i <= 3; i++) { g.strokeStyle = rgba(shade(env[1], -0.4), 0.35); g.lineWidth = 1.2; g.beginPath(); g.ellipse(i * 24, 0, 10 + Math.abs(i) * 2, 36, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); }
  if (o.band) { g.fillStyle = o.band; g.fillRect(-100, -6, 200, 10); }
  g.fillStyle = rgba('#ffffff', 0.3); ell(g, -20, -20, 50, 7, -0.05); g.fill();
  g.restore();
  ell(g, 0, 0, 96, 34); g.strokeStyle = OUT; g.lineWidth = 1.5; g.stroke();
  const hull = o.hull || '#9a6a42';
  face(g, [[-52, 50], [52, 50], [44, 66], [30, 72], [-36, 72], [-50, 62]], hull);
  g.fillStyle = shade(hull, 0.25); g.fillRect(-52, 47, 104, 4);
  box(g, -24, 50, 34, 14, 10, '#e8d6b0');
  if (o.cargo) { for (let i = 0; i < 3; i++) box(g, 16 + (i % 2) * 12, 50 - Math.floor(i / 2) * 11, 11, 10, 6, o.cargo); }
  if (o.cannons) for (const cx of [-34, 26]) { g.fillStyle = '#2a2a30'; g.fillRect(cx, 60, 10, 5); circ(g, cx + 11, 62.5, 3); g.fill(); }
  g.fillStyle = '#5a4a48'; g.fillRect(-64, 54, 14, 4);
  g.fillStyle = rgba('#d8d2c8', 0.5); ell(g, -66, 56, 4, 16); g.fill();
  if (o.flag) { g.strokeStyle = '#3a2a2a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(44, 50); g.lineTo(44, 26); g.stroke(); face(g, [[44, 26], [62, 30], [44, 36]], o.flag); }
  g.restore();
}

// ---------------------------------------------------------------- parchment texture (a CSS background, painted once)
let parchURL = null;
export function parchmentURL() {
  if (parchURL) return parchURL;
  if (typeof document === 'undefined') return '';
  const S = 384, c = layer(S, S), g = c.getContext('2d'), R = rng(77);
  g.fillStyle = '#f6e7c4'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = R() * S, y = R() * S, r = 0.4 + R() * 2.4;
    g.fillStyle = rgba(R() < 0.55 ? '#b48a50' : '#ffffff', 0.04 + R() * 0.07);
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { if (Math.abs(x + dx - S / 2) > S / 2 + 3 || Math.abs(y + dy - S / 2) > S / 2 + 3) continue; circ(g, x + dx, y + dy, r); g.fill(); }
  }
  for (let i = 0; i < 40; i++) {
    const x = R() * S, y = R() * S;
    g.strokeStyle = rgba('#a07a48', 0.05 + R() * 0.05); g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 60, y + (R() - 0.5) * 8); g.stroke();
  }
  parchURL = c.toDataURL('image/png');
  return parchURL;
}

// ---------------------------------------------------------------- DOM
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k.startsWith('--')) el.style.setProperty(k, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of kids.flat(3)) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}
export function setText(el, s) { s = String(s); if (el && el.__t !== s) { el.__t = s; el.textContent = s; } }
export function sizeCanvas(c, w, h) {
  const d = DPR();
  const W = Math.max(1, Math.round(w * d)), H = Math.max(1, Math.round(h * d));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  c.style.width = w + 'px'; c.style.height = h + 'px';
  const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return g;
}

// ---------------------------------------------------------------- formatting
export function fmt(n) {
  if (n == null || !isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 100000) return Math.round(n / 1000) + 'k';
  return Math.round(n).toLocaleString('en-US');
}
export function clock(sec) { sec = Math.max(0, Math.ceil(sec || 0)); const m = Math.floor(sec / 60), s = sec % 60; return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; }
export function dur(sec) {
  sec = Math.max(0, sec || 0);
  if (sec < 90) return `${Math.max(1, Math.round(sec))} s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return m ? `${h} h ${m} min` : `${h} h`;
}
export const cap = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());
export const humanize = (id) => cap(String(id).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' '));

// ---------------------------------------------------------------- content adapters (mock fallback while a content file is a stub)
const MOCK_RES = [
  ['wood', 'Wood'], ['planks', 'Planks'], ['stone', 'Stone'], ['grain', 'Grain'], ['flour', 'Flour'], ['bread', 'Bread'], ['ore', 'Iron ore'], ['coal', 'Coal'],
  ['iron', 'Iron'], ['parts', 'Brass parts'], ['skystone', 'Skystone'], ['aether', 'Aether'], ['coin', 'Coin'], ['insight', 'Insight'],
].map(([id, name]) => ({ id, name }));
const MB = { industry: 'industry', aero: 'aeronautics', arcana: 'arcana', defence: 'defence' };
const MOCK_BRANCHES = [
  { id: 'industry', name: 'Industry' }, { id: 'aeronautics', name: 'Aeronautics' }, { id: 'arcana', name: 'Skystone Arcana' }, { id: 'defence', name: 'Defence' },
];
const R_ = (id, branch, tier, name, cost, time, needs, unlocks, desc) => ({ id, branch, tier, name, cost, time, needs, unlocks, desc });
const MOCK_RESEARCH = [
  R_('bellows', MB.industry, 1, 'Bellows Forge', { insight: 40 }, 60, [], ['smelter', 'Smelters work 15% faster'], 'Leather bellows and a hotter hearth. Ore and coal become iron, the first step to everything made of brass.'),
  R_('turbines', MB.industry, 2, 'Steam Turbines', { insight: 120, iron: 20 }, 120, ['bellows'], ['cable', 'sawmill', 'Sawmills and mills +20%'], 'Boilers that spin a shaft. Cable car winches, steam saws and the first engines that never tire.'),
  R_('assembly', MB.industry, 3, 'Assembly Line', { insight: 220, iron: 40, planks: 40 }, 180, ['turbines'], ['workshop', 'Workshops make parts 25% faster'], 'Jigs, belts and a foreman with a whistle. Parts roll out of the workshop by the crate.'),
  R_('automatons', MB.industry, 4, 'Brass Automatons', { insight: 400, parts: 40 }, 240, ['assembly'], ['Every industry building needs one fewer worker'], 'Clockwork helpers that carry, sort and stoke. Your settlers finally get an afternoon off.'),
  R_('foundry', MB.industry, 5, 'Sky Foundry', { insight: 700, parts: 80, skystone: 20 }, 360, ['automatons', 'levitation'], ['skyforge', 'Iron output +30%'], 'A foundry fed by skystone heat. It can cast the great ribs of the Skyforge itself.'),
  R_('skiffs', MB.aero, 1, 'Hot-air Skiffs', { insight: 40, planks: 20 }, 60, [], ['mooring', 'skiff'], 'Patchwork balloons and wicker baskets. Enough to reach the islets and bring settlers home.'),
  R_('cargoholds', MB.aero, 2, 'Cargo Holds', { insight: 110, planks: 40 }, 120, ['skiffs'], ['freighter', 'Ships carry 50% more'], 'Deep hulls and a winch. One trip now carries what three did before.'),
  R_('propellers', MB.aero, 3, 'Propeller Pitch', { insight: 200, parts: 20 }, 180, ['cargoholds', 'turbines'], ['shipyard', 'Airships fly 30% faster'], 'Variable-pitch brass propellers bite the wind. Routes shrink and expeditions return sooner.'),
  R_('charters', MB.aero, 4, 'Trade Charters', { insight: 320, coin: 300 }, 240, ['propellers'], ['market', 'Contracts pay 20% more'], 'Signed and sealed with the ports of the expanse. Better prices, bigger contracts, firmer friends.'),
  R_('galleons', MB.aero, 5, 'Cloud Galleons', { insight: 600, parts: 80, aether: 10 }, 360, ['charters', 'levitation'], ['galleon'], 'Aether-lifted galleons with four holds and a brass figurehead. Kings of every trade wind.'),
  R_('crystallore', MB.arcana, 1, 'Crystal Lore', { insight: 60 }, 90, [], ['drill', 'academy'], 'The scholars study the blue crystals under every island. They hum when you hold them.'),
  R_('levitation', MB.arcana, 2, 'Levitation Engines', { insight: 400, skystone: 120, iron: 60 }, 240, ['crystallore', 'propellers'], ['Move islands across the chart', 'refinery', 'Shorter trade routes: +15% income'], 'Bolt skystone engines to the bedrock and your islands can drift. Pull the mine island closer to the forge and every cable car runs faster.'),
  R_('drift', MB.arcana, 3, 'Island Drift', { insight: 450, skystone: 60 }, 240, ['levitation'], ['Drift owned islands on the chart'], 'Steer whole islands on the sky currents. Bring far islets alongside the home rock.'),
  R_('stormtaming', MB.arcana, 4, 'Storm Taming', { insight: 600, aether: 20 }, 300, ['drift', 'rods'], ['Pass the Tempest Wall', 'Lightning charges rods'], 'Lightning caught in brass coils. The Tempest Wall parts for ships with tamed storms aboard.'),
  R_('beacon', MB.arcana, 5, 'Aether Beacon', { insight: 900, aether: 60 }, 420, ['stormtaming'], ['Skyforge stage 5', 'Calls the Dreadnought'], 'A pillar of aether light that wakes the old Skyforge. The Crimson Gale will see it too.'),
  R_('harpoons', MB.defence, 1, 'Harpoon Battery', { insight: 50, iron: 10 }, 60, [], ['harpoon', 'volley'], 'Spring-loaded harpoon guns on swivel mounts. Enough to drive off a corsair skiff.'),
  R_('rods', MB.defence, 2, 'Lightning Rods', { insight: 120, iron: 20 }, 120, ['harpoons'], ['rod', 'lash'], 'Copper spires that drink the storm before it finds your roofs.'),
  R_('shields', MB.defence, 3, 'Storm Shields', { insight: 260, skystone: 20, parts: 20 }, 180, ['rods'], ['shieldgen', 'shield'], 'A dome of humming skystone light over one island. Rain, bombs and lightning slide off it.'),
  R_('militia', MB.defence, 4, 'Militia Airships', { insight: 380, parts: 40 }, 240, ['shields', 'propellers'], ['militia', 'Attack Corsair Roost'], 'Volunteer crews in armed skiffs. They escort expeditions and can storm the pirate roost.'),
  R_('bastion', MB.defence, 5, 'Skyguard Bastion', { insight: 650, parts: 80, stone: 200 }, 360, ['militia'], ['bastion'], 'Heavy flak towers on stone footings. Even the Dreadnought will think twice.'),
];
const I_ = (id, name, kind, biome, ox, oy, w, h, claimCost, needs, desc, resources) => ({ id, name, kind, biome, ox, oy, alt: 0, w, h, claimCost, needs, desc, resources });
const MOCK_ISLANDS = [
  I_('hearthrock', 'Hearthrock', 'home', 'meadow', -12, -9, 24, 18, {}, null, 'Your home rock: a broad meadow with a waterfall and the old townhall.', { wood: 2, stone: 2, grain: 2 }),
  I_('millbrook', 'Millbrook', 'islet', 'meadow', -38, 14, 11, 9, { coin: 120, wood: 40 }, null, 'A fertile islet with a brook. Wheat grows waist-high here.', { grain: 3, wood: 1 }),
  I_('pinecrest', 'Pinecrest', 'islet', 'pine', 18, 16, 10, 9, { coin: 120, stone: 30 }, null, 'Tall pines and a high ledge where an observatory could see for leagues.', { wood: 3, stone: 1 }),
  I_('orespur', 'Orespur', 'islet', 'rocky', -34, -28, 11, 10, { coin: 200, wood: 60 }, null, 'Iron-streaked crags and a stone outcrop. The mine island.', { ore: 3, stone: 2 }),
  I_('kilnshelf', 'Kilnshelf', 'islet', 'volcanic', 18, -28, 12, 10, { coin: 260, planks: 40 }, null, 'Warm vents and blue crystals. Smelters here need no coal.', { vent: 2, skystone: 1 }),
  I_('emberrock', 'Emberrock', 'far', 'volcanic', 92, -52, 18, 14, { coin: 400, iron: 60, settlers: 12 }, null, 'A smouldering rock rich in iron and coal. Its heat vents could run three smelters without a single log of fuel.', { ore: 3, coal: 2, vent: 2 }),
  I_('glimmerreach', 'Glimmerreach', 'far', 'crystal', 66, 92, 16, 12, { coin: 800, aether: 20, settlers: 20 }, 'stormtaming', 'Crystal spires around the ruin of the Skyforge. Only tamed storms open the way.', { skystone: 3, ruin: 1 }),
  I_('corsairroost', 'Corsair Roost', 'roost', 'pirate', 104, -118, 14, 12, { coin: 600 }, 'militia', 'The Crimson Gale\'s hideout. Take it with militia ships and the raids stop for good.', { coin: 2, parts: 1 }),
  I_('mossback', 'Mossback', 'far', 'pine', -104, 78, 13, 10, { coin: 300, planks: 60 }, null, 'A mossy whale-backed island under drifting fog.', { wood: 3, grain: 1 }),
  I_('whistlespire', 'Whistlespire', 'far', 'rocky', 150, 34, 12, 10, { coin: 350, iron: 40 }, null, 'A needle of rock that whistles in the wind. Stone and coal seams.', { stone: 3, coal: 2 }),
  I_('sunkenbell', 'Sunkenbell', 'far', 'meadow', 150, -84, 13, 11, { coin: 350, bread: 40 }, null, 'A tilted island with a bell tower half sunk in the turf.', { grain: 2, ore: 1 }),
];
const MOCK_PORTS = [
  { id: 'porthalcyon', name: 'Port Halcyon', x: -150, y: 120, buys: ['iron', 'parts'], sells: ['planks', 'stone'], desc: 'The great harbour city of the west. It pays well for iron and brass.' },
  { id: 'verdantdrift', name: 'Verdant Drift', x: -170, y: 0, buys: ['planks'], sells: ['grain', 'bread'], desc: 'Terraced farm-islands that trade bread for timber.' },
  { id: 'brassreach', name: 'Brass Reach', x: 6, y: -170, buys: ['skystone', 'aether'], sells: ['coal', 'parts'], desc: 'Foundry town of brass towers. Buys skystone and aether, sells coal and parts.' },
];
const MOCK_SHIPS = [
  { id: 'skiff', name: 'Hot-air Skiff', cost: { planks: 40, coin: 60 }, cargo: 20, speed: 1, needs: null, desc: 'A small patched balloon. Scouts and light cargo.' },
  { id: 'freighter', name: 'Cargo Freighter', cost: { planks: 80, iron: 20, coin: 150 }, cargo: 60, speed: 0.8, needs: 'cargoholds', desc: 'A deep-hulled trader for the long routes.' },
  { id: 'militia', name: 'Militia Gunship', cost: { parts: 30, iron: 40, coin: 250 }, cargo: 10, speed: 1.2, needs: 'militia', desc: 'Harpoon guns and a brave crew. Escorts expeditions.' },
  { id: 'galleon', name: 'Cloud Galleon', cost: { parts: 60, aether: 10, coin: 600 }, cargo: 160, speed: 1, needs: 'galleons', desc: 'Four holds and a brass figurehead.' },
];
const MOCK_ACH = [
  ['firstlanding', 'First Landing', 'Finish chapter 1.'], ['breadwinner', 'Breadwinner', 'Bake 500 loaves.'], ['ironwill', 'Iron Will', 'Smelt 1,000 iron.'], ['bridgebuilder', 'Bridge Builder', 'Join four islands.'],
  ['tradewinds', 'Trade Winds', 'Run three trade routes at once.'], ['stormrider', 'Storm Rider', 'Weather a storm without a fire.'], ['flakmaster', 'Flak Master', 'Down 25 pirate ships.'], ['scholar', 'Scholar', 'Finish 10 research topics.'],
  ['cartographer', 'Cartographer', 'Scout every island.'], ['metropolis', 'Metropolis', 'Reach 250 settlers.'], ['tycoon', 'Tycoon', 'Hold 50,000 coin.'], ['skyforged', 'Skyforged', 'Light the Skyforge.'],
].map(([id, name, desc]) => ({ id, name, desc }));

export const MOCK = { RESOURCES: MOCK_RES, BRANCHES: MOCK_BRANCHES, RESEARCH: MOCK_RESEARCH, ISLANDS: MOCK_ISLANDS, PORTS: MOCK_PORTS, SHIPS: MOCK_SHIPS, ACHIEVEMENTS: MOCK_ACH };
const pick = (a, b) => (Array.isArray(a) && a.length ? a : b);
export function content(app) {
  const C = (app && app.content) || {};
  return {
    resources: pick(C.RESOURCES, MOCK_RES), branches: pick(C.BRANCHES, MOCK_BRANCHES), research: pick(C.RESEARCH, MOCK_RESEARCH),
    islands: pick(C.ISLANDS, MOCK_ISLANDS), ports: pick(C.PORTS, MOCK_PORTS), ships: pick(C.SHIPS, MOCK_SHIPS),
    achievements: pick(C.ACHIEVEMENTS, MOCK_ACH), buildings: C.BUILDINGS || [], links: C.LINKS || [], defends: C.DEFENDS || [],
    mock: { research: !(C.RESEARCH && C.RESEARCH.length), islands: !(C.ISLANDS && C.ISLANDS.length), ports: !(C.PORTS && C.PORTS.length), ships: !(C.SHIPS && C.SHIPS.length) },
  };
}
const DEF_NAMES = { volley: 'Volley', lash: 'Lightning lash', shield: 'Raise shield', militia: 'Militia ship' };
// A readable name for any id (resource, building, ship, ability, research, island, port).
export function nameOf(app, id) {
  if (id == null) return '';
  const C = content(app);
  for (const list of [C.resources, C.buildings, C.ships, C.research, C.islands, C.ports, C.links, C.defends]) {
    const e = list.find((x) => x.id === id); if (e && e.name) return e.name;
  }
  return DEF_NAMES[id] || humanize(id);
}
export function resName(app, id) { const r = content(app).resources.find((x) => x.id === id); return r ? r.name : humanize(id); }

// stock the player can spend: coin/insight colony-wide, the rest in the home network pool
export function stock(G, res) {
  if (!G) return 0;
  if (res === 'coin' || res === 'insight') return G.colony?.[res] ?? G.pools?.colony?.res?.[res] ?? 0;
  if (res === 'settlers' || res === 'pop') return G.colony?.idle ?? G.colony?.pop ?? 0;
  const home = G.tmp?.netOf?.hearthrock || 'hearthrock';
  const pool = G.pools?.[home];
  if (pool && pool.res && pool.res[res] != null) return pool.res[res];
  let s = 0; for (const k in G.pools || {}) if (k !== 'colony') s += G.pools[k].res?.[res] || 0; return s;
}
export const canAfford = (G, cost) => Object.entries(cost || {}).every(([k, v]) => stock(G, k) >= v);

// a toast through the UI if it listens, else the sim bus notify channel the UI reads anyway
export function say(app, text, kind = 'info', icon) {
  try { app.ev?.emit('ui:toast', { text, kind, icon }); } catch (e) { /* noop */ }
}

// ---------------------------------------------------------------- panel scaffold
// makePanel(app, { name, scene, title, build(el), update(dt), teardown() }) -> { el, open(), close(), update(dt), isOpen() }
// A scene-bound panel opens itself when app.scene becomes `scene` and closes when it changes, so UI only
// has to mount `el`. Contents (and every #btn-* id inside) exist only while the panel is open, so ids stay unique.
// Close (#btn-close, Esc): a scene panel goes back to the colony; a free panel (stats) just closes and emits ui:panel-closed.
export function makePanel(app, spec) {
  const el = h('section', { class: `sfp sfp-${spec.name}`, 'data-panel': spec.name, role: 'dialog', 'aria-label': spec.title || spec.name, hidden: true });
  let open = false, t = 0, hosted = false;
  const P = {
    el,
    isOpen: () => open,
    open() {
      if (open) return P;
      open = true; el.hidden = false; el.replaceChildren(); el.classList.remove('in');
      if (!el.style.getPropertyValue('--parch-tex')) el.style.setProperty('--parch-tex', `url(${parchmentURL()})`);
      spec.build(el, P);
      // UI owns the one shared #btn-close and Esc (app.ui.back); standalone (dev harness) the panel brings its own
      hosted = !!app.ui;
      if (!hosted) el.appendChild(h('button', { id: 'btn-close', class: 'sfp-close', type: 'button', title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => P.dismiss() }, h('span', { 'aria-hidden': 'true' })));
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
      if (!hosted) addEventListener('keydown', onKey, true);
      addEventListener('resize', onResize);
      return P;
    },
    close() {
      if (!open) return P;
      open = false; el.hidden = true; el.classList.remove('in');
      removeEventListener('keydown', onKey, true); removeEventListener('resize', onResize);
      spec.teardown?.(P); el.replaceChildren();
      return P;
    },
    dismiss() {
      if (spec.scene && app.scene === spec.scene) app.setScene(app.G ? 'colony' : 'title');
      P.close();
      app.ev?.emit('ui:panel-closed', { panel: spec.name });
    },
    update(dt = 0) { if (!open) return; t += dt; try { spec.update?.(dt, P); } catch (e) { console.error(e); } },
  };
  function onKey(e) { if (e.key === 'Escape' && open) { e.stopImmediatePropagation(); e.preventDefault(); P.dismiss(); } }
  function onResize() { if (open) spec.resize?.(P); }
  if (spec.scene && app.ev) {
    app.ev.on('scene', ({ scene }) => { if (scene === spec.scene) P.open(); else P.close(); });
    if (app.scene === spec.scene) queueMicrotask(() => P.open());
  }
  return P;
}
// a navy chip with an icon and a value (cost chips, claim chips)
export function chipEl(iconEl, value, o = {}) {
  return h('span', { class: 'sfp-chip' + (o.short ? ' short' : '') + (o.cls ? ' ' + o.cls : ''), title: o.title || null }, iconEl, h('b', null, value));
}
