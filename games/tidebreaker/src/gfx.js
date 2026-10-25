// Shared Canvas 2D painting helpers, ported from the concept renderer. Every
// helper takes the 2D context `g` first, so it works on the main canvas and on
// cached offscreen layers alike.
import { W, H, SERIF, SANS } from './config.js';
import { rgba } from './util.js';

export function layer(w = W, h = H) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
// Rounded rectangle path.
export function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// Soft radial light.
export function glow(g, x, y, r, c, a = 1) {
  if (r <= 0 || a <= 0) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.35, rgba(c, a * 0.35)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}
// Text with optional stroke, shadow and letter spacing.
// opt: { weight, font ('serif'|'sans'|css), align, base, spacing, shadow, blur, oy, stroke, sw }
export function text(g, s, x, y, size, col, opt = {}) {
  g.save();
  const font = opt.font === 'sans' ? SANS : opt.font === 'serif' || !opt.font ? SERIF : opt.font;
  g.font = `${opt.weight || 'bold'} ${size}px ${font}`;
  g.textAlign = opt.align || 'left'; g.textBaseline = opt.base || 'alphabetic';
  if (opt.spacing && 'letterSpacing' in g) g.letterSpacing = opt.spacing + 'px';
  if (opt.shadow) { g.shadowColor = opt.shadow; g.shadowBlur = opt.blur ?? 8; g.shadowOffsetY = opt.oy ?? 2; }
  if (opt.stroke) { g.lineWidth = opt.sw || 4; g.strokeStyle = opt.stroke; g.lineJoin = 'round'; g.strokeText(s, x, y); g.shadowColor = 'transparent'; }
  g.fillStyle = col; g.fillText(s, x, y); g.restore();
}
// A soft round puff (smoke, cloud, spray).
export function puff(g, x, y, r, col, a) {
  if (r <= 0) return;
  const gr = g.createRadialGradient(x - r * 0.2, y - r * 0.3, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.6, rgba(col, a * 0.6)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}
// Cubic Bezier sampled into n+1 points.
export function bez(p0, p1, p2, p3, n) {
  const o = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    o.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return o;
}
// Point (lx, ly) in a ship's local frame (half-length s, facing dir) to screen.
export function local(x, y, ang, s, dir, lx, ly) {
  const c = Math.cos(ang), sn = Math.sin(ang), X = lx * s * dir, Y = ly * s;
  return [x + X * c - Y * sn, y + X * sn + Y * c];
}
