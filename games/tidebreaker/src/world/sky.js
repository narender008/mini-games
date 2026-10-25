// The sky: gradient, stars and aurora (cached per biome), the sun or crimson
// moon, lit cloud strips that tile horizontally, gulls. Ported from the concept
// renderer's sky(), stars(), sun(), clouds() and gulls().
import { W } from '../config.js';
import { rng, lerp, rgba } from '../util.js';
import { drawGlow } from './sprites.js';

export function canvasK(w, h, K) {
  const c = document.createElement('canvas'); c.width = Math.ceil(w * K); c.height = Math.ceil(h * K);
  const g = c.getContext('2d'); g.scale(K, K); return { c, g };
}

// Sky gradient + stars + aurora, W x (hz + 4).
export function buildSky(B, K) {
  const hz = B.hz, { c, g } = canvasK(W, hz + 6, K);
  const gr = g.createLinearGradient(0, 0, 0, hz);
  for (const [o, col] of B.sky) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, W, hz + 6);
  if (B.stars) {
    const [n, a, seed] = B.stars, r = rng(seed), lim = B.aurora ? hz : hz * 0.5;
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = Math.pow(r(), 1.6) * lim * 0.8, s = r();
      g.fillStyle = `rgba(255,255,255,${(0.3 + s * 0.7) * a * (1 - y / lim)})`;
      g.fillRect(x, y, s > 0.9 ? 2 : 1, s > 0.9 ? 2 : 1);
      if (s > 0.97) drawGlow(g, x + 1, y + 1, 8, '#cfe6ff', 0.5 * a);
    }
  }
  if (B.aurora) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      for (let x = -20; x <= W + 20; x += 10) { const y = 90 + k * 30 + Math.sin(x * 0.006 + k) * 40 + Math.sin(x * 0.017) * 10; x < -10 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.strokeStyle = rgba(k === 1 ? '#3affc8' : '#7a5aff', 0.16); g.lineWidth = 50 - k * 10; g.stroke();
      g.lineWidth = 6; g.strokeStyle = rgba('#a8fff0', 0.18); g.stroke();
    }
    g.restore();
  }
  return c;
}

// A strip of lit clouds that repeats every TW px.
export const CLOUD_TW = 1800;
export function buildClouds(o, K) {
  const { seed, n, y0, y1, sx = 1, sy = 0.45, size = 60, top, bot, stretch = 1, edge } = o;
  const TW = CLOUD_TW, ty = Math.max(0, y0 - size * 1.7), th = y1 + size * 0.9 - ty;
  const { c, g } = canvasK(TW, th, K);
  g.translate(0, -ty);
  const r = rng(seed);
  g.fillStyle = '#fff';
  const nn = Math.round(n * TW / (W + 300));
  for (let i = 0; i < nn; i++) {
    const cx = r() * TW, cy = lerp(y0, y1, r()), w = size * (0.6 + r() * 1.2) * stretch;
    const k = 5 + (r() * 7 | 0);
    for (let j = 0; j < k; j++) {
      const bx = cx + (r() - 0.5) * w * 2.4 * sx, by = cy - Math.abs(r() - 0.5) * w * 1.1 * sy, br = w * (0.35 + r() * 0.5);
      for (const ox of [-TW, 0, TW]) { g.beginPath(); g.ellipse(bx + ox, by, br * 1.4 * stretch, br * sy * 1.6, 0, 0, Math.PI * 2); g.fill(); }
    }
  }
  g.globalCompositeOperation = 'source-in';
  const gr = g.createLinearGradient(0, y0 - size, 0, y1 + size * 0.5);
  gr.addColorStop(0, top); gr.addColorStop(1, bot);
  g.fillStyle = gr; g.fillRect(0, ty, TW, th);
  if (edge) {
    g.globalCompositeOperation = 'source-atop';
    const e = g.createLinearGradient(0, y0, 0, y1 + size * 0.6);
    e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(0.7, rgba(edge, 0)); e.addColorStop(1, rgba(edge, 0.85));
    g.fillStyle = e; g.fillRect(0, ty, TW, th);
  }
  if (o.fadeTop) { // soften the top of a cloud bank so what is behind shows through
    g.globalCompositeOperation = 'destination-out';
    const f = g.createLinearGradient(0, y0 - size, 0, lerp(y0, y1, o.fadeTop));
    f.addColorStop(0, 'rgba(0,0,0,1)'); f.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = f; g.fillRect(0, ty, TW, th);
  }
  return { c, ty, th, TW, o };
}
// Draw a horizontally repeating strip at offset off (px scrolled).
export function drawStrip(g, s, off, alpha = 1) {
  if (alpha <= 0) return;
  const TW = s.TW, x0 = -(((off % TW) + TW) % TW);
  const pa = g.globalAlpha; g.globalAlpha = pa * alpha;
  for (let x = x0; x < W; x += TW) g.drawImage(s.c, x, s.ty, TW, s.th);
  g.globalAlpha = pa;
}

// Sun or moon: halo sprites and a lit disc.
export function drawSun(g, S, x, y, t) {
  const { r, core, halo } = S, a = S.a ?? 1;
  drawGlow(g, x, y, r * 7, halo, 0.55 * a);
  drawGlow(g, x, y, r * 2.4, halo, 0.8 * a);
  const gr = g.createRadialGradient(x, y - r * 0.3, 0, x, y, r);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, core); gr.addColorStop(1, rgba(core, 0.9));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  if (S.moon) { // faint maria
    g.fillStyle = 'rgba(160,40,70,0.16)';
    for (const [dx, dy, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.28], [-0.1, 0.4, 0.15], [0.35, -0.38, 0.12]]) { g.beginPath(); g.arc(x + dx * r, y + dy * r, rr * r, 0, 7); g.fill(); }
  }
}

export function drawGulls(g, Gl, t, scroll) {
  if (!Gl) return;
  g.strokeStyle = Gl.col; g.lineCap = 'round';
  const span = W + 240;
  for (const [gx, gy, s, f] of Gl.list) {
    const x = ((gx - scroll * 0.1 + t * (6 + f)) % span + span) % span - 120, y = gy + Math.sin(t * 0.7 + f) * 6;
    g.lineWidth = Math.max(1.2, s * 0.18);
    const w = Math.sin(t * 6 + f) * 0.5;
    g.beginPath(); g.moveTo(x - s, y - s * (0.2 + w)); g.quadraticCurveTo(x - s * 0.5, y - s * 0.6, x, y);
    g.quadraticCurveTo(x + s * 0.5, y - s * 0.6, x + s, y - s * (0.2 + w)); g.stroke();
  }
}
