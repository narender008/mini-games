// Shared helpers for the environment painters (render/env/*).
// Everything heavy is painted once per chamber into CPU-backed canvases
// (willReadFrequently: true; GPU-backed offscreens flushed extremely slowly in the motion test).

import { rng, hashSeed } from '../../core/rng.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  c.getContext('2d', { willReadFrequently: true });
  return c;
}
export function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
export function mix(a, b, t) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(lerp((x >> s) & 255, (y >> s) & 255, t));
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
}
export const shade = (hex, k) => (k < 0 ? mix(hex, '#000000', -k) : mix(hex, '#ffffff', k));
export { rng, hashSeed };

// ---------------------------------------------------------------- glow sprites
const glowCache = new Map();
export function glow(color, soft = 0) {
  const key = color + soft;
  let c = glowCache.get(key);
  if (c) return c;
  c = mk(128, 128);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (soft) { gr.addColorStop(0, hexA(color, 0.6)); gr.addColorStop(0.5, hexA(color, 0.22)); gr.addColorStop(1, hexA(color, 0)); }
  else { gr.addColorStop(0, hexA(color, 1)); gr.addColorStop(0.18, hexA(color, 0.55)); gr.addColorStop(0.5, hexA(color, 0.14)); gr.addColorStop(1, hexA(color, 0)); }
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowCache.set(key, c);
  return c;
}
export function drawGlow(ctx, x, y, r, color, a = 1, sy = 1) {
  if (a <= 0.01) return;
  const pa = ctx.globalAlpha;
  ctx.globalAlpha = pa * a;
  ctx.drawImage(glow(color), x - r, y - r * sy, r * 2, r * 2 * sy);
  ctx.globalAlpha = pa;
}
// soft dark blob (ambient occlusion, contact shadows)
let shadowSprite = null;
export function drawShadow(ctx, x, y, rx, ry, a = 0.5) {
  if (!shadowSprite) {
    shadowSprite = mk(128, 128);
    const g = shadowSprite.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  const pa = ctx.globalAlpha;
  ctx.globalAlpha = pa * a;
  ctx.drawImage(shadowSprite, x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = pa;
}

// ---------------------------------------------------------------- polygons
export function polyPath(g, pts, dx = 0, dy = 0, k = 1, cx = 0, cy = 0) {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = cx + (pts[i][0] - cx) * k + dx, y = cy + (pts[i][1] - cy) * k + dy;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath();
}
// Smooth closed path through points (quadratic midpoints): organic outlines.
export function smoothPath(g, pts, dx = 0, dy = 0) {
  const n = pts.length;
  g.beginPath();
  const m = (i) => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2 + dx, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2 + dy];
  const s = m(n - 1);
  g.moveTo(s[0], s[1]);
  for (let i = 0; i < n; i++) { const e = m(i); g.quadraticCurveTo(pts[i][0] + dx, pts[i][1] + dy, e[0], e[1]); }
  g.closePath();
}
// offset polygon along vertex normals (d > 0 grows outward); fine for gentle shapes
export function offsetPoly(pts, d) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n], c = pts[i], q = pts[(i + 1) % n];
    let ax = c[0] - p[0], ay = c[1] - p[1], bx = q[0] - c[0], by = q[1] - c[1];
    const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
    const nx = ay / la + by / lb, ny = -ax / la - bx / lb;
    const l = Math.hypot(nx, ny) || 1;
    // miter, clamped
    const cos = (ay / la * by / lb + ax / la * bx / lb);
    const m = Math.min(2.2, 1 / Math.sqrt(Math.max(0.2, (1 + cos) / 2)));
    out.push([c[0] + (nx / l) * d * m, c[1] + (ny / l) * d * m]);
  }
  return out;
}
export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i++) { const x = pts[i][0], y = pts[i][1]; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
// edge samples with outward normals
export function edgeSamples(pts, step) {
  const out = [];
  let carry = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const l = Math.hypot(x2 - x1, y2 - y1);
    if (l < 1e-6) continue;
    const nx = (y2 - y1) / l, ny = -(x2 - x1) / l;
    let s = step - carry;
    while (s <= l) { out.push({ x: x1 + ((x2 - x1) * s) / l, y: y1 + ((y2 - y1) * s) / l, nx, ny, tx: (x2 - x1) / l, ty: (y2 - y1) / l }); s += step; }
    carry = l - (s - step);
  }
  return out;
}
export function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i], pj = poly[j], xi = pi[0], yi = pi[1], xj = pj[0], yj = pj[1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------- noise
export function noise2(seed) {
  const h = (i, j) => { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + seed; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const sm = (t) => t * t * (3 - 2 * t);
  const f = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
  };
  f.fbm = (x, y, o = 3) => { let s = 0, a = 0.5, k = 1, n = 0; for (let i = 0; i < o; i++) { s += f(x * k, y * k) * a; n += a; a *= 0.5; k *= 2.03; } return s / n; };
  return f;
}

// ---------------------------------------------------------------- canvases for a chamber
// A world-space canvas covering the chamber plus pads; g is already transformed to world units.
export function worldCanvas(b, pad, q) {
  const x0 = Math.floor(b.x0 - pad.l), y0 = Math.floor(b.y0 - pad.t), x1 = Math.ceil(b.x1 + pad.r), y1 = Math.ceil(b.y1 + pad.b);
  const w = x1 - x0, h = y1 - y0;
  const c = mk(w * q, h * q), g = c.getContext('2d', { willReadFrequently: true });
  g.setTransform(q, 0, 0, q, -x0 * q, -y0 * q);
  return { c, g, x0, y0, w, h, q };
}

// painterly texture: many short translucent strokes, batched per colour
export function strokes(g, r, area, n, colors, opts = {}) {
  const { len = [8, 26], width = [1, 3], alpha = [0.05, 0.16], angle = null, clipPoly = null } = opts;
  const per = Math.ceil(n / colors.length);
  g.lineCap = 'round';
  for (const col of colors) {
    for (let pass = 0; pass < 2; pass++) {
      g.strokeStyle = col; g.globalAlpha = r.range(alpha[0], alpha[1]); g.lineWidth = r.range(width[0], width[1]);
      g.beginPath();
      for (let i = 0; i < per / 2; i++) {
        const x = r.range(area.x0, area.x1), y = r.range(area.y0, area.y1);
        if (clipPoly && !inPoly(x, y, clipPoly)) continue;
        const a = angle == null ? r() * TAU : angle + r.range(-0.4, 0.4), l = r.range(len[0], len[1]);
        const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l * 0.6;
        g.moveTo(x, y); g.quadraticCurveTo((x + ex) / 2 + r.range(-4, 4), (y + ey) / 2 + r.range(-3, 3), ex, ey);
      }
      g.stroke();
    }
  }
  g.globalAlpha = 1;
}

// Soft inner shading along the outline: walls and edges feel heavy, the middle open.
export function innerShade(g, shape, color, width, alpha, steps = 6) {
  g.save(); polyPath(g, shape); g.clip();
  g.strokeStyle = color; g.lineJoin = 'round';
  for (let i = steps; i > 0; i--) { g.globalAlpha = alpha / steps; g.lineWidth = (width * 2 * i) / steps; polyPath(g, shape); g.stroke(); }
  g.restore(); g.globalAlpha = 1;
}

// Stacked cliff body under an island: the floor's underside falls into the void.
export function cliff(g, shape, depth, top, bottom, step = 6, shrink = 0.0005) {
  const b = bbox(shape), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  for (let d = depth; d > 0; d -= step) {
    const t = d / depth;
    polyPath(g, shape, 0, d, 1 - d * shrink, cx, cy);
    g.fillStyle = mix(top, bottom, t);
    g.fill();
  }
}

// a sprite cache shared across chambers (props repeat; keep variants limited)
const spriteCache = new Map();
export function sprite(key, build) {
  let s = spriteCache.get(key);
  if (!s) { s = build(); spriteCache.set(key, s); if (spriteCache.size > 400) spriteCache.delete(spriteCache.keys().next().value); }
  return s;
}
// A prop entry for the renderer: image anchored at its foot point (ax, ay) in sprite px, sprite scale `k` px per world unit.
export function propOf(img, x, y, sortY = y, extra = {}) {
  const k = img.k || 1;
  return { x, y, sortY, img, ox: img.ax / k, oy: img.ay / k, w: img.width / k, h: img.height / k, ...extra };
}

// ---------------------------------------------------------------- screen-space background helpers
// back layers are cached per screen size bucket
// (keeps the last 2 sizes: the frame governor steps the resolution between a few fixed scales, and a
// rebuild costs 50-200 ms on software raster, so stepping back to a size it has seen is free)
export function screenCache(build) {
  const keep = new Map();
  return (w, h) => {
    const k = Math.round(w / 64) + 'x' + Math.round(h / 64);
    let c = keep.get(k);
    if (c) { keep.delete(k); keep.set(k, c); return c; }
    c = build(Math.ceil(w * 1.35), Math.ceil(h * 1.35));
    keep.set(k, c); if (keep.size > 3) keep.delete(keep.keys().next().value);
    return c;
  };
}
// draw a parallax layer: layer canvas is 1.35x screen; offset by camera * factor, wrapped horizontally
export function parallax(ctx, layer, cam, f, fy = f) {
  const W = cam.w, H = cam.h;
  const lw = layer.width, lh = layer.height;
  let ox = -((cam.x * f * cam.scale) % lw), oy = -(lh - H) / 2 - cam.y * fy * cam.scale;
  oy = clamp(oy, H - lh, 0);
  if (ox > 0) ox -= lw;
  ctx.drawImage(layer, ox, oy);
  if (ox + lw < W) ctx.drawImage(layer, ox + lw, oy);
}
export function starfield(g, r, W, H, n, cols = ['#ffffff']) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = r.pick(cols); g.globalAlpha = r() * 0.8;
    const s = r() < 0.94 ? 1 : 2;
    g.fillRect(r() * W, r() * H, s, s);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < n / 60; i++) {
    const x = r() * W, y = r() * H, s = r.range(2, 5);
    g.drawImage(glow(r.pick(cols)), x - s * 4, y - s * 4, s * 8, s * 8);
    g.fillStyle = '#fff'; g.fillRect(x - 0.5, y - s, 1, s * 2); g.fillRect(x - s, y - 0.5, s * 2, 1);
  }
}
export function nebula(g, r, W, H, n, cols, rr = [200, 520], a = 0.5) {
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H, R = r.range(rr[0], rr[1]) * (W / 1800);
    const cg = g.createRadialGradient(x, y, 0, x, y, R);
    const col = r.pick(cols);
    cg.addColorStop(0, hexA(col, a)); cg.addColorStop(1, hexA(col, 0));
    g.fillStyle = cg; g.fillRect(x - R, y - R, R * 2, R * 2);
  }
}
// aurora ribbon canvas: vertical curtains along a wavy line
export function aurora(W, H, col, seed, y0 = 0.25, amp = 0.06, hgt = 0.22) {
  const c = mk(W, H), g = c.getContext('2d');
  const r = rng(seed);
  g.globalCompositeOperation = 'lighter';
  const n = 90, ph = r() * 6, f1 = r.range(1.5, 3), f2 = r.range(4, 7);
  for (let i = 0; i < n; i++) {
    const x = (i / n) * W, u = i / n;
    const y = H * (y0 + Math.sin(u * f1 * Math.PI + ph) * amp + Math.sin(u * f2 * Math.PI + ph * 2) * amp * 0.35);
    const h = H * hgt * (0.6 + 0.4 * Math.sin(u * 9 + ph));
    const lg = g.createLinearGradient(0, y - h, 0, y + h * 0.15);
    const a = 0.05 + 0.05 * Math.sin(u * 13 + ph) ** 2;
    lg.addColorStop(0, hexA(col, 0)); lg.addColorStop(0.75, hexA(col, a)); lg.addColorStop(0.9, hexA(col, a * 1.8)); lg.addColorStop(1, hexA(col, 0));
    g.fillStyle = lg; g.fillRect(x, y - h, W / n + 1.5, h * 1.15);
  }
  return c;
}
// lightning bolt points (jagged, with a branch)
export function boltPath(r, x0, y0, x1, y1, n = 12, jag = 40) {
  const pts = [[x0, y0]];
  for (let i = 1; i < n; i++) { const t = i / n; pts.push([lerp(x0, x1, t) + r.range(-jag, jag), lerp(y0, y1, t) + r.range(-jag * 0.2, jag * 0.2)]); }
  pts.push([x1, y1]);
  return pts;
}

// stateless drifting particles: position from time, no per-frame state. Returns one shared scratch array
// [x, y, fa, fb] (read it at once: the next call overwrites it)
const DRIFT = [0, 0, 0, 0];
export function drift(i, t, seed, W, H, vx, vy) {
  const a = Math.sin(i * 127.1 + seed) * 43758.5453, b = Math.sin(i * 311.7 + seed * 1.7) * 24634.6345;
  const fa = a - Math.floor(a), fb = b - Math.floor(b);
  let x = (fa * W + vx * t) % W, y = (fb * H + vy * t) % H;
  if (x < 0) x += W; if (y < 0) y += H;
  DRIFT[0] = x; DRIFT[1] = y; DRIFT[2] = fa; DRIFT[3] = fb;
  return DRIFT;
}
// visible world rect from the current ctx transform
export function viewRect(ctx, pad = 0) {
  const m = ctx.getTransform(), cw = ctx.canvas.width, ch = ctx.canvas.height;
  const s = Math.hypot(m.a, m.b) || 1;
  const x0 = -m.e / s, y0 = -m.f / s;
  return { x0: x0 - pad, y0: y0 - pad, x1: x0 + cw / s + pad, y1: y0 + ch / s + pad, s };
}

// paint profiling: markStart() then mark('label'); marks() returns [[label, ms]]
let _pt = 0, _pl = [];
export function markStart() { _pt = performance.now(); _pl = []; }
export function mark(label) { const n = performance.now(); _pl.push([label, Math.round((n - _pt) * 10) / 10]); _pt = n; }
export function marks() { return _pl.slice(); }

// Tileable grain: dark and light mottling for stone, metal, cloth (built once per kind).
const grainCache = new Map();
export function grain(kind = 'stone', size = 256) {
  let c = grainCache.get(kind + size);
  if (c) return c;
  c = mk(size, size);
  const g = c.getContext('2d', { willReadFrequently: true });
  const img = g.createImageData(size, size), d = img.data;
  const seed = kind.length * 977 + 13;
  // tileable value noise: lattice wraps at `per`
  const hsh = (i, j, per) => { i = ((i % per) + per) % per; j = ((j % per) + per) % per; let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + seed; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const sm = (t) => t * t * (3 - 2 * t);
  const vn = (x, y, per) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); const a = hsh(xi, yi, per), b = hsh(xi + 1, yi, per), cc = hsh(xi, yi + 1, per), dd = hsh(xi + 1, yi + 1, per); return (a + (b - a) * xf) * (1 - yf) + (cc + (dd - cc) * xf) * yf; };
  const oct = kind === 'soft' ? [[4, 0.5], [8, 0.35], [16, 0.15]] : kind === 'cloth' ? [[64, 0.2], [16, 0.5], [4, 0.3]] : kind === 'metal' ? [[32, 0.45], [8, 0.3], [2, 0.25]] : [[16, 0.5], [8, 0.3], [4, 0.2]];
  const strength = kind === 'metal' ? 0.5 : kind === 'cloth' ? 0.35 : kind === 'soft' ? 0.7 : 0.42;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let n = 0;
    for (let o = 0; o < oct.length; o++) n += vn((x / size) * oct[o][0], (y / size) * oct[o][0], oct[o][0]) * oct[o][1];
    if (kind === 'cloth') n = n * 0.6 + 0.4 * (((x >> 1) + (y >> 1)) % 2 ? 0.62 : 0.38);
    const i = (y * size + x) * 4, v = (n - 0.5) * 2;
    const a = Math.min(1, Math.abs(v) * strength * 1.6);
    const col = v < 0 ? 0 : 255;
    d[i] = col; d[i + 1] = col; d[i + 2] = col; d[i + 3] = Math.round(a * (v < 0 ? 255 : 150));
  }
  g.putImageData(img, 0, 0);
  grainCache.set(kind + size, c);
  return c;
}
export function fillGrain(g, kind, alpha = 1, scale = 1) {
  const pat = g.createPattern(grain(kind), 'repeat');
  if (scale !== 1 && pat.setTransform) pat.setTransform(new DOMMatrix().scale(scale));
  g.globalAlpha = alpha; g.fillStyle = pat; g.fill(); g.globalAlpha = 1;
}
// continuous lit lip along an outline: back edges catch light, front edges drop into shadow
export function lip(g, shape, lit, dark, width = 3) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  polyPath(g, shape); g.strokeStyle = hexA(lit, 0.22); g.lineWidth = width; g.stroke();
  const back = new Path2D(), front = new Path2D();
  for (let i = 0; i < shape.length; i++) {
    const [x1, y1] = shape[i], [x2, y2] = shape[(i + 1) % shape.length];
    const l = Math.hypot(x2 - x1, y2 - y1) || 1, ny = -(x2 - x1) / l;
    if (ny < -0.2) { back.moveTo(x1, y1); back.lineTo(x2, y2); }
    else if (ny > 0.15) { front.moveTo(x1, y1 + 3); front.lineTo(x2, y2 + 3); }
  }
  g.strokeStyle = hexA(lit, 0.55); g.lineWidth = width * 0.8; g.stroke(back);
  g.strokeStyle = hexA(dark, 0.6); g.lineWidth = width * 1.6; g.stroke(front);
}

// ---------------------------------------------------------------- cheap screen layers
// Software rasterisers pay for every pixel blitted, transparent or not, so:
//  - backgrounds are pre-composited into ONE opaque canvas per screen size and drawn with
//    one clamped drawImage (bitmapOf swaps in an ImageBitmap when it is ready: faster blits);
//  - sparse overlays (silhouettes, light shafts) are cut into tiles and only non-empty tiles drawn.
const bitmaps = new WeakMap();
export function bitmapOf(c) {
  const b = bitmaps.get(c);
  if (b) return b === 'pending' ? c : b;
  if (typeof createImageBitmap === 'function') {
    bitmaps.set(c, 'pending');
    createImageBitmap(c).then((bm) => bitmaps.set(c, bm), () => bitmaps.delete(c));
  }
  return c;
}
export function compose(W, H, layers) {
  const c = mk(W, H), g = c.getContext('2d');
  for (const L of layers) {
    if (!L) continue;
    const [img, op = 'source-over', a = 1] = Array.isArray(L) ? L : [L];
    g.globalCompositeOperation = op; g.globalAlpha = a;
    if (Array.isArray(img)) for (const im of img) g.drawImage(im, 0, 0, W, H); else g.drawImage(img, 0, 0, W, H);
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return c;
}
export function drawLayer(ctx, layer, cam, f = 0.04, fy = f * 0.7) {
  const W = cam.w, H = cam.h, lw = layer.width, lh = layer.height;
  const ox = clamp(-(lw - W) / 2 - cam.x * f * cam.scale, W - lw, 0);
  const oy = clamp(-(lh - H) / 2 - cam.y * fy * cam.scale, H - lh, 0);
  ctx.drawImage(bitmapOf(layer), Math.round(ox), Math.round(oy));
}
export function sparse(c, T = 128) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, c.width, c.height).data, tiles = [];
  for (let ty = 0; ty < c.height; ty += T) for (let tx = 0; tx < c.width; tx += T) {
    const tw = Math.min(T, c.width - tx), th = Math.min(T, c.height - ty);
    let any = false;
    for (let y = ty; y < ty + th && !any; y += 3) for (let x = tx; x < tx + tw; x += 3) if (d[(y * c.width + x) * 4 + 3] > 4) { any = true; break; }
    if (!any) continue;
    const t = mk(tw, th); t.getContext('2d').drawImage(c, tx, ty, tw, th, 0, 0, tw, th);
    tiles.push({ c: t, x: tx, y: ty });
  }
  return { w: c.width, h: c.height, tiles };
}
export function drawSparse(ctx, sp, ox, oy) {
  for (const t of sp.tiles) ctx.drawImage(bitmapOf(t.c), Math.round(ox + t.x), Math.round(oy + t.y));
}

// ---------------------------------------------------------------- hand-laid slabs
// Rows of uneven height, slabs of uneven width, each corner nudged: no two seams line up,
// and the dark ground shows through the uneven gaps like grout. Returns [{ pts, cx, cy, w, h, row }].
export function slabs(b, r, { rowH = [70, 110], colW = [90, 200], jitter = 6, inset = 2.5, pad = 0 } = {}) {
  const out = [];
  let row = 0;
  for (let y = b.y0 - rowH[1] - pad; y < b.y1 + rowH[1] + pad; row++) {
    const h = r.range(rowH[0], rowH[1]);
    for (let x = b.x0 - pad - r() * colW[1]; x < b.x1 + colW[1] + pad;) {
      const w = r.range(colW[0], colW[1]), j = () => r.range(-jitter, jitter);
      out.push({ pts: [[x + inset + j(), y + inset + j()], [x + w - inset + j(), y + inset + j()], [x + w - inset + j(), y + h - inset + j()], [x + inset + j(), y + h - inset + j()]], cx: x + w / 2, cy: y + h / 2, w, h, row });
      x += w;
    }
    y += h;
  }
  return out;
}
// Paint one slab: base colour, soft light from the upper left, a lit top-left edge and a dark lower-right edge.
export function paintSlab(g, pts, base, o = {}) {
  const [a, b2, c, d] = pts, cx = (a[0] + c[0]) / 2, cy = (a[1] + c[1]) / 2, w = Math.abs(b2[0] - a[0]), h = Math.abs(d[1] - a[1]);
  polyPath(g, pts); g.fillStyle = base; g.fill();
  const lg = g.createLinearGradient(cx - w * 0.5, cy - h * 0.5, cx + w * 0.5, cy + h * 0.5);
  lg.addColorStop(0, o.hi || 'rgba(255,240,220,0.14)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, o.lo || 'rgba(0,0,10,0.32)');
  g.fillStyle = lg; g.fill();
  g.lineWidth = o.edge || 1.6; g.lineCap = 'round';
  g.strokeStyle = o.edgeHi || 'rgba(255,240,220,0.22)'; g.beginPath(); g.moveTo(d[0], d[1]); g.lineTo(a[0], a[1]); g.lineTo(b2[0], b2[1]); g.stroke();
  g.strokeStyle = o.edgeLo || 'rgba(0,0,0,0.5)'; g.beginPath(); g.moveTo(b2[0], b2[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.stroke();
}

// A second, animated parallax layer: a sparse overlay (sparse()) that moves with its own camera
// factor and sways slowly with time, clamped so its edges never show.
export function drawDrift(ctx, sp, cam, f, t, { sway = 0, period = 60, op = 'source-over', alpha = 1 } = {}) {
  const W = cam.w, H = cam.h, mx = (sp.w - W) / 2, my = (sp.h - H) / 2;
  const ox = clamp(-mx - cam.x * f * cam.scale + Math.sin((t * TAU) / period) * sway, -2 * mx, 0);
  const oy = clamp(-my - cam.y * f * 0.7 * cam.scale, -2 * my, 0);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha;
  drawSparse(ctx, sp, ox, oy);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
