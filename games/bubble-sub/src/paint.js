// Bubble Sub: painted pieces shared by the sprites and backdrops.
import { ctx, u, W, H, TAU, rng, lerp, clamp, rgba, mix, rr, glow, blob, starPath, heartPath, sticker, sparkle } from './draw.js';

export function gloss(g, cx, cy, r, base, opt = {}) {
  const light = opt.light || mix(base, '#ffffff', 0.55), dark = opt.dark || mix(base, '#000000', 0.45), line = opt.line || mix(base, '#071a40', 0.62);
  g.save();
  if (opt.outline !== false) { g.lineJoin = 'round'; g.lineWidth = (opt.lw || 0.09) * r; g.strokeStyle = line; g.stroke(); }
  const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.25);
  gr.addColorStop(0, light); gr.addColorStop(0.45, base); gr.addColorStop(1, dark);
  g.fillStyle = gr; g.fill();
  g.clip();
  // bounce light from the bright water below
  const bl = g.createRadialGradient(cx + r * 0.2, cy + r * 1.1, r * 0.1, cx, cy + r * 0.9, r * 0.9);
  bl.addColorStop(0, rgba(opt.bounce || '#7ff0ff', 0.55)); bl.addColorStop(1, 'rgba(120,240,255,0)');
  g.globalCompositeOperation = 'lighter'; g.fillStyle = bl; g.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  g.globalCompositeOperation = 'source-over';
  if (opt.spec !== false) {
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(cx - r * 0.38, cy - r * 0.5, r * 0.3, r * 0.13, -0.55, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(cx - r * 0.02, cy - r * 0.68, r * 0.06, 0, TAU); g.fill();
  }
  g.restore();
}

export function bubble(x, y, r, a = 1) {
  const g = ctx; g.save(); g.globalAlpha = a;
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.7, 'rgba(180,250,255,0.08)'); gr.addColorStop(0.92, 'rgba(220,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0.7)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(1, r * 0.06); g.stroke();
  // rainbow film on the rim
  g.globalCompositeOperation = 'lighter'; g.lineWidth = r * 0.08;
  g.strokeStyle = 'rgba(255,140,220,0.35)'; g.beginPath(); g.arc(x, y, r * 0.9, 0.2, 1.3); g.stroke();
  g.strokeStyle = 'rgba(140,255,200,0.3)'; g.beginPath(); g.arc(x, y, r * 0.9, 1.4, 2.3); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.42, r * 0.22, r * 0.12, -0.7, 0, TAU); g.fill();
  g.beginPath(); g.arc(x + r * 0.42, y + r * 0.38, r * 0.07, 0, TAU); g.fill();
  g.restore();
}

export function shadow(x, y, rx, ry, a = 0.3) {
  const g = ctx; g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(4,30,70,${a})`); gr.addColorStop(1, 'rgba(4,30,70,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
}

export function caustics(seed, x0, y0, w, h, a = 0.35, cell = 46) {
  const R = rng(seed), g = ctx; g.save(); g.globalCompositeOperation = 'lighter';
  g.strokeStyle = `rgba(220,255,255,${a})`; g.lineWidth = 2.6 * u; g.lineCap = 'round'; g.filter = `blur(${2.6 * u}px)`;
  const c = cell * u;
  for (let y = y0; y < y0 + h; y += c * 0.8) for (let x = x0 - c; x < x0 + w + c; x += c) {
    const cx = x + (R() - 0.5) * c * 0.6 + ((y / c) % 2) * c * 0.5, cy = y + (R() - 0.5) * c * 0.4;
    blob(g, cx, cy, c * (0.32 + R() * 0.18), (R() * 1e6) | 0, 3, 0.35, 0.55);
    g.stroke();
  }
  g.restore();
}
