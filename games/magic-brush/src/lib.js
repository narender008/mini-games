// Shared drawing kit, ported from the approved concept renderer: seeded random,
// smooth noise, blobby point shapes, hand-inked lines, watercolour washes,
// paper grain, sparkles and paint drops. Everything is plain Canvas 2D and
// works in CSS pixels or friend units alike (callers set the transform).
// Nothing here reads pixels back or uses ctx.filter, so it is safe to call
// while baking layers on any browser.

export const TAU = Math.PI * 2;
export const INK = '#3a2a4a';
export const INK_SOFT = '#5b4a6e';
export const PAPER = '#fbf4e4';
export const CREAM = '#fff8ea';
export const ROUND = "'Comic Sans MS', 'Chalkboard SE', 'Chalkboard', 'Trebuchet MS', 'DejaVu Sans', system-ui, sans-serif";
export const KID = { red: '#f0544f', orange: '#ff9a3d', yellow: '#ffd23f', green: '#5cc28a', teal: '#3cc0c0', blue: '#4b8ef0', purple: '#9b6ff0', pink: '#ff86b8', brown: '#b07a4f', white: '#fffaf0' };
export const RAINBOW = ['#f0544f', '#ff9a3d', '#ffd23f', '#5cc28a', '#4b8ef0', '#9b6ff0'];
export const GLITTER = '#d4c4ff';

export function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeNoise(seed) {
  const r = rng(seed);
  const v = Array.from({ length: 512 }, r);
  return (x) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return v[i & 511] + (v[(i + 1) & 511] - v[i & 511]) * u;
  };
}
export function makeNoise2(seed) {
  const r = rng(seed), P = new Float32Array(256 * 256);
  for (let i = 0; i < P.length; i++) P[i] = r();
  const at = (x, y) => P[(y & 255) * 256 + (x & 255)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
export const N1 = makeNoise(11);
export const N2 = makeNoise2(7);

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeIn = (t) => Math.pow(clamp(t, 0, 1), 3);
export const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const backOut = (t) => { t = clamp(t, 0, 1); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const elastic = (t) => (t >= 1 ? 1 : t <= 0 ? 0 : 1 - Math.pow(2, -9 * t) * Math.cos(t * 9.5));

const HEX = new Map();
export function hex(c) {
  let v = HEX.get(c);
  if (!v) { const n = parseInt(c.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; HEX.set(c, v); }
  return v;
}
export function toHex(r, g, b) { return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
export function rgba(c, a) { const A = hex(c); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }
export function mix(a, b, t) { const A = hex(a), B = hex(b); return toHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
export const shade = (c, t) => (t > 0 ? mix(c, '#fffaf0', t) : mix(c, '#2a1840', -t));
export function toHsl(c) {
  const [r, g, b] = hex(c).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
export function fromHsl(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return toHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

export function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// ---------- point shapes ----------
export function el(cx, cy, rx, ry, rot = 0, n = 34) {
  const c = Math.cos(rot), s = Math.sin(rot), out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push([cx + x * c - y * s, cy + x * s + y * c]); }
  return out;
}
export function bl(...f) { const p = []; for (let i = 0; i < f.length; i += 2) p.push([f[i], f[i + 1]]); return densify(p); }
export function densify(p) {
  const n = p.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], out = [];
  for (let i = 0; i < n; i++) {
    const a = m(p[(i - 1 + n) % n], p[i]), c = p[i], b = m(p[i], p[(i + 1) % n]);
    for (let k = 0; k < 6; k++) { const t = k / 6, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
  }
  return out;
}
export function rrect(x, y, w, h, r) { return bl(x + r, y, x + w - r, y, x + w, y, x + w, y + r, x + w, y + h - r, x + w, y + h, x + w - r, y + h, x + r, y + h, x, y + h, x, y + h - r, x, y + r, x, y); }
export function centroid(P) { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / P.length, y / P.length]; }
export function bbox(P) {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const [x, y] of P) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return { x: a, y: b, w: c - a, h: d - b, cx: (a + c) / 2, cy: (b + d) / 2 };
}
export function wob(P, amp, seed = 0, freq = 0.35) {
  const [cx, cy] = centroid(P), n = P.length;
  return P.map(([x, y], i) => {
    const q = P[(i + 1) % n], o = P[(i - 1 + n) % n];
    let nx = q[1] - o[1], ny = -(q[0] - o[0]);
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if (nx * (x - cx) + ny * (y - cy) < 0) { nx = -nx; ny = -ny; }
    const d = (N1(i * freq + seed * 13.7) - 0.5) * 2 * amp;
    return [x + nx * d, y + ny * d];
  });
}
export function offsetPts(P, d) {
  const [cx, cy] = centroid(P), n = P.length;
  return P.map(([x, y], i) => {
    const q = P[(i + 1) % n], o = P[(i - 1 + n) % n];
    let nx = q[1] - o[1], ny = -(q[0] - o[0]);
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if (nx * (x - cx) + ny * (y - cy) < 0) { nx = -nx; ny = -ny; }
    return [x + nx * d, y + ny * d];
  });
}
export function spath(P, close = true) {
  const p = new Path2D(), n = P.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (n < 2) return p;
  if (close) {
    const s = m(P[n - 1], P[0]); p.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) { const q = m(P[i], P[(i + 1) % n]); p.quadraticCurveTo(P[i][0], P[i][1], q[0], q[1]); }
    p.closePath();
  } else {
    p.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i < n - 1; i++) { const q = m(P[i], P[i + 1]); p.quadraticCurveTo(P[i][0], P[i][1], q[0], q[1]); }
    p.lineTo(P[n - 1][0], P[n - 1][1]);
  }
  return p;
}
export function xform(P, x, y, s, flip = 1, rot = 0) {
  const c = Math.cos(rot), sn = Math.sin(rot);
  return P.map(([px, py]) => { const X = px * s * flip, Y = py * s; return [x + X * c - Y * sn, y + X * sn + Y * c]; });
}
export function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
export function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.01, Math.abs(rx)), Math.max(0.01, Math.abs(ry)), rot, 0, TAU); }
export function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function vgrad(g, y0, y1, stops) { const gr = g.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; }
export function glow(g, x, y, r, col, a = 1, op = 'lighter') {
  if (r <= 0) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.4, rgba(col, a * 0.4)); gr.addColorStop(1, rgba(col, 0));
  g.save(); g.globalCompositeOperation = op; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
export function softShadow(g, x, y, rx, ry, a = 0.22) {
  if (rx <= 0) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, rx);
  gr.addColorStop(0, `rgba(60,40,80,${a})`); gr.addColorStop(0.6, `rgba(60,40,80,${a * 0.6})`); gr.addColorStop(1, 'rgba(60,40,80,0)');
  g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y); g.fillStyle = gr; g.fillRect(x - rx, y - rx, rx * 2, rx * 2); g.restore();
}

// ---------- ink ----------
export function inkLine(g, P, w, seed = 0, o = {}) {
  const col = o.col || INK, amp = o.amp ?? w * 0.35;
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = col;
  g.lineWidth = w; g.stroke(spath(wob(P, amp, seed + 1, 0.3), !o.open));
  g.globalAlpha = o.second ?? 0.55; g.lineWidth = w * 0.55; g.stroke(spath(wob(P, amp * 1.4, seed + 5.3, 0.45), !o.open));
  g.restore();
}
export function inkStroke(g, pts, w, col = INK) { g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = col; g.lineWidth = w; g.stroke(spath(pts, false)); g.restore(); }
export function dotLine(g, P, w, gap, col = INK) {
  g.save(); g.lineCap = 'round'; g.setLineDash([0.01, gap]); g.lineWidth = w; g.strokeStyle = col; g.stroke(spath(P)); g.restore();
}
export function inkFill(g, path, fill, w = 5) { g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = w; g.strokeStyle = INK; g.fillStyle = fill; g.fill(path); g.stroke(path); g.restore(); }
export function fatStroke(g, path, col, w) { g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = w + 9; g.stroke(path); g.strokeStyle = col; g.lineWidth = w; g.stroke(path); g.restore(); }

// a soft edge without ctx.filter: a few widening strokes at falling alpha
export function softEdge(g, path, col, a, w) {
  g.save(); g.lineJoin = 'round'; g.strokeStyle = col;
  for (let i = 0; i < 3; i++) { g.globalAlpha = a * (0.42 - i * 0.12); g.lineWidth = w * (0.5 + i * 0.45); g.stroke(path); }
  g.restore();
}

// ---------- watercolour ----------
export function wash(g, P, col, seed = 1, o = {}) {
  const path = spath(o.raw ? P : wob(P, o.wob ?? 4, seed, 0.12));
  const b = bbox(P), R = rng(seed * 977 + 3), k0 = o.k || 1;
  g.save();
  g.fillStyle = o.fill || col; g.globalAlpha = o.alpha ?? 1; g.fill(path); g.globalAlpha = 1;
  g.clip(path);
  const k = o.mottle ?? 1, n = Math.min(110, 8 + (b.w * b.h) / (5000 * k0 * k0));
  for (let i = 0; i < n * k; i++) {
    const x = b.x + R() * b.w, y = b.y + R() * b.h, r = (20 + R() * Math.max(30, Math.min(b.w, b.h) * 0.35 / k0)) * k0;
    const gr = g.createRadialGradient(x, y, 0, x, y, r), c2 = R() < 0.5 ? shade(col, 0.25) : shade(col, -0.18);
    gr.addColorStop(0, rgba(c2, 0.1 * k)); gr.addColorStop(1, rgba(c2, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (o.top) { g.fillStyle = vgrad(g, b.y, b.y + b.h, [[0, rgba(o.top, 0.5)], [0.5, rgba(o.top, 0)]]); g.fillRect(b.x, b.y, b.w, b.h); }
  if (o.bottom) { g.fillStyle = vgrad(g, b.y, b.y + b.h, [[0.45, rgba(o.bottom, 0)], [1, rgba(o.bottom, 0.45)]]); g.fillRect(b.x, b.y, b.w, b.h); }
  softEdge(g, path, shade(col, -0.35), o.edge ?? 0.45, (o.edgeW ?? 7) * k0 * 1.4);
  g.restore();
  g.save(); g.strokeStyle = rgba(shade(col, -0.3), (o.edge ?? 0.45) * 0.8); g.lineWidth = 1.4 * k0; g.stroke(path); g.restore();
  return path;
}

// ---------- paper ----------
let PAPER_TILE = null;
export function paperTile() {
  if (PAPER_TILE) return PAPER_TILE;
  const S = 256, L = layer(S, S), g = L.getContext('2d'), id = g.createImageData(S, S), d = id.data, R = rng(5);
  // tileable: sample noise on a torus-ish wrap by blending edges
  const f = (x, y) => {
    const lo = N2(x / 40, y / 40) * 0.6 + N2(x / 17, y / 17) * 0.4, fib = N2(x / 3.2, y / 9) * 0.5 + N2(x / 7, y / 2.5) * 0.5;
    return (lo - 0.5) * 0.07 + (fib - 0.5) * 0.08;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wx = x / S, wy = y / S;
    const v0 = f(x, y) * (1 - wx) * (1 - wy) + f(x - S, y) * wx * (1 - wy) + f(x, y - S) * (1 - wx) * wy + f(x - S, y - S) * wx * wy;
    const v = 0.95 + v0 + (R() - 0.5) * 0.05;
    const i = (y * S + x) * 4, c = clamp(v, 0, 1) * 255;
    d[i] = Math.min(255, c + 6); d[i + 1] = c + 2; d[i + 2] = Math.max(0, c - 6); d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  PAPER_TILE = L;
  return L;
}
// paper grain over whatever is painted (multiply keeps white as paper); scale = device px per css px
export function paperOver(g, x, y, w, h, a = 1, scale = 1) {
  const pat = g.createPattern(paperTile(), 'repeat');
  if (scale !== 1 && pat.setTransform) pat.setTransform(new DOMMatrix().scale(scale, scale));
  g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = a; g.fillStyle = pat; g.fillRect(x, y, w, h); g.restore();
}

// ---------- sparkle & paint drops ----------
export function star4(g, x, y, r, col = '#fff6c8', a = 1) {
  g.save(); g.globalAlpha *= a; g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 8; i++) { const ang = (i / 8) * TAU - Math.PI / 2, rr2 = i % 2 ? r * 0.22 : r; g.lineTo(x + Math.cos(ang) * rr2, y + Math.sin(ang) * rr2); }
  g.closePath(); g.fill(); g.restore();
}
export function sparkle(g, x, y, r, col = '#fff3b0') { glow(g, x, y, r * 2.2, col, 0.55); star4(g, x, y, r, '#fffdf2'); }
export function starPts(x, y, r, rot = 0, inner = 0.52) { const o = []; for (let i = 0; i < 10; i++) { const a = rot - Math.PI / 2 + (i / 10) * TAU, q = i % 2 ? r * inner : r; o.push([x + Math.cos(a) * q, y + Math.sin(a) * q]); } return o; }
export function dropPath(r) {
  const p = new Path2D(); p.moveTo(0, -r * 1.9); p.bezierCurveTo(r * 0.5, -r * 0.9, r, -r * 0.4, r, r * 0.15); p.arc(0, r * 0.15, r, 0, Math.PI); p.bezierCurveTo(-r, -r * 0.4, -r * 0.5, -r * 0.9, 0, -r * 1.9); p.closePath();
  return p;
}
export function drop(g, x, y, r, col, ang = 0) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const p = dropPath(r);
  g.fillStyle = col; g.fill(p); g.strokeStyle = shade(col, -0.45); g.lineWidth = Math.max(1.5, r * 0.16); g.stroke(p);
  g.fillStyle = 'rgba(255,255,255,0.7)'; ell(g, -r * 0.35, -r * 0.05, r * 0.2, r * 0.32, 0.3); g.fill();
  g.restore();
}
export function splat(g, x, y, r, col, seed = 1) {
  const R = rng(seed), P = [];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, q = r * (i % 2 ? 0.7 + R() * 0.2 : 0.95 + R() * 0.35); P.push([x + Math.cos(a) * q, y + Math.sin(a) * q]); }
  g.fillStyle = col; g.fill(spath(P));
  for (let i = 0; i < 5; i++) { const a = R() * TAU, q = r * (1.3 + R() * 0.6); circ(g, x + Math.cos(a) * q, y + Math.sin(a) * q, r * (0.08 + R() * 0.14)); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.35)'; ell(g, x - r * 0.3, y - r * 0.3, r * 0.25, r * 0.15, -0.6); g.fill();
}
export function heartPath(x, y, s) {
  const h = new Path2D(); h.moveTo(x, y + s * 0.9);
  h.bezierCurveTo(x - s * 1.5, y, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
  h.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.5, y, x, y + s * 0.9);
  return h;
}

// back-and-forth brush strokes across a box, at an angle (a child's colouring)
export function zigzag(g, b, ang, step, w, cols, R, o = {}) {
  const c = Math.cos(ang), s = Math.sin(ang), L = Math.hypot(b.w, b.h) / 2 + w;
  const cx = b.cx, cy = b.cy, rows = Math.ceil((2 * L) / step);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i <= rows; i++) {
    const t = -L + i * step + (R() - 0.5) * step * 0.4;
    const x0 = cx - c * L - s * t, y0 = cy - s * L + c * t, x1 = cx + c * L - s * t, y1 = cy + s * L + c * t;
    const bend = (R() - 0.5) * step * 1.4;
    g.strokeStyle = cols[i % cols.length]; g.globalAlpha = o.alpha ?? 0.5; g.lineWidth = w * (0.8 + R() * 0.4);
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 - s * bend, (y0 + y1) / 2 + c * bend, x1, y1); g.stroke();
    if (o.bristle) {
      g.lineWidth = Math.max(1, w * 0.08); g.globalAlpha = o.bristle;
      for (let k = -2; k <= 2; k++) {
        const off = k * w * 0.18; g.strokeStyle = k % 2 ? 'rgba(255,255,255,0.8)' : cols[0];
        g.beginPath(); g.moveTo(x0 - s * off, y0 + c * off); g.quadraticCurveTo((x0 + x1) / 2 - s * (bend + off), (y0 + y1) / 2 + c * (bend + off), x1 - s * off, y1 + c * off); g.stroke();
      }
    }
  }
  g.globalAlpha = 1;
}
