// Painterly Canvas 2D helpers shared by the enemies, the bosses and the shots
// (adapted from the concept renderer, prototype/render.js, to take the
// context g). Glows are cached radial sprites per colour, drawn scaled, so a
// frame full of glowing things costs drawImage calls, not gradients.
import { rgba, mixHex } from '../util.js';

export const TAU = Math.PI * 2;
const sprites = new Map();
function glowSprite(c) {
  let s = sprites.get(c);
  if (s) return s;
  s = document.createElement('canvas'); s.width = s.height = 128;
  const x = s.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, rgba(c, 1)); gr.addColorStop(0.3, rgba(c, 0.4)); gr.addColorStop(1, rgba(c, 0));
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  sprites.set(c, s);
  return s;
}
// A soft radial glow of radius r (use inside additive() for light).
export function glow(g, x, y, r, c, a = 1) {
  if (a <= 0 || r <= 0) return;
  if (lowQ && r > 140) { a *= 0.8; r = 140 + (r - 140) * 0.3; }   // big glows are fill-rate on phones
  const ga = g.globalAlpha; g.globalAlpha = ga * Math.min(1, a);
  g.drawImage(glowSprite(c), x - r, y - r, r * 2, r * 2);
  g.globalAlpha = ga;
}
export function additive(g, fn) { g.save(); g.globalCompositeOperation = 'lighter'; fn(); g.restore(); }

export function flamePath(g, x, y, s, lean = 0) {
  g.beginPath(); g.moveTo(x, y);
  g.bezierCurveTo(x - s * 0.7, y - s * 0.2, x - s * 0.5 + lean, y - s * 1.1, x + lean * 1.6, y - s * 1.9);
  g.bezierCurveTo(x + s * 0.2 + lean, y - s * 1.2, x + s * 0.75, y - s * 0.6, x + s * 0.5, y - s * 0.1);
  g.quadraticCurveTo(x + s * 0.2, y + s * 0.25, x, y); g.closePath();
}
export function flame(g, x, y, s, c, a = 1, lean = 0) {
  const gr = g.createLinearGradient(0, y, 0, y - s * 1.9);
  gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; flamePath(g, x, y, s, lean); g.fill();
}

// Gradients made once per key (shapes that use them are drawn in local coordinates).
const grads = new Map();
export function cached(g, key, make) {
  let gr = grads.get(key);
  if (!gr) { if (grads.size > 400) grads.clear(); gr = make(); grads.set(key, gr); }
  return gr;
}
export function linear(g, x0, y0, x1, y1, stops) {
  return cached(g, `L${x0},${y0},${x1},${y1}|${stops}`, () => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c)); return gr; });
}

// A glowing mushroom (stem from x, y up h; cap width capW).
export function mushroom(g, x, y, h, capW, { cap = '#ff3fb4', stem = '#e8d4ff', spots = '#ffffff', glowC = cap, lean = 0, seed = 1 } = {}) {
  const sw = Math.max(4, capW * 0.12), cw = Math.round(capW);
  g.save(); g.translate(x, y);
  const tx = lean, ty = -h;
  g.fillStyle = stem;
  g.beginPath(); g.moveTo(-sw * 1.3, 0); g.quadraticCurveTo(-sw + lean * 0.3, -h * 0.5, tx - sw * 0.8, ty); g.lineTo(tx + sw * 0.8, ty); g.quadraticCurveTo(sw + lean * 0.3, -h * 0.5, sw * 1.3, 0); g.closePath(); g.fill();
  g.translate(tx, ty);
  additive(g, () => glow(g, 0, 4, capW * 1.1, glowC, 0.45));
  g.fillStyle = mixHex(glowC, '#ffffff', 0.4);
  g.beginPath(); g.ellipse(0, 2, capW * 0.5, capW * 0.1, 0, 0, TAU); g.fill();
  g.fillStyle = cached(g, `M${cap}|${cw}`, () => {
    const cg = g.createRadialGradient(-cw * 0.15, -cw * 0.3, 2, 0, 0, cw * 0.7);
    cg.addColorStop(0, mixHex(cap, '#ffffff', 0.45)); cg.addColorStop(0.6, cap); cg.addColorStop(1, mixHex(cap, '#000000', 0.35));
    return cg;
  });
  g.beginPath(); g.moveTo(-capW * 0.55, 2);
  g.bezierCurveTo(-capW * 0.6, -capW * 0.45, capW * 0.6, -capW * 0.45, capW * 0.55, 2);
  g.quadraticCurveTo(0, -capW * 0.06, -capW * 0.55, 2); g.fill();
  g.fillStyle = rgba(spots, 0.85);
  for (let i = 0; i < 5; i++) {
    const a2 = -Math.PI * (0.15 + ((seed * 7 + i * 0.37) % 1) * 0.7);
    g.beginPath(); g.ellipse(Math.cos(a2) * capW * 0.33, Math.sin(a2) * capW * 0.24, 2 + capW * 0.03, 1.5 + capW * 0.02, 0, 0, TAU); g.fill();
  }
  g.restore();
}

// Body colour, washed toward white while the thing flashes from a hit.
// Bosses only tint (they are hit often and are big).
export function body(e, c) { return e.flash > 0 ? mixHex(c, e.boss ? '#ffe0c0' : '#ffffff', Math.min(1, e.flash / 0.12) * (e.boss ? 0.3 : 0.85)) : c; }
export function light(G, x, y, r, c, a = 1) { G.lights.push({ x, y, r, c, a }); }
// Wind-up warning: a pulsing ring, brighter as k (0..1) goes up; it lights itself (drawEnemies sets the G).
let curG = null, lowQ = false;
export function useG(G) { curG = G; lowQ = G.quality === 'low'; }
export function warn(g, x, y, r, c, k, t) {
  if (curG) curG.lights.push({ x, y, r: r * 3, c, a: 0.25 + 0.5 * Math.min(1, k) });
  additive(g, () => {
    glow(g, x, y, r * (1 + 0.15 * Math.sin(t * 30)), c, 0.25 + 0.6 * k);
    g.strokeStyle = rgba(c, 0.3 + 0.6 * k); g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, r * (1.3 - 0.6 * k), 0, TAU); g.stroke();
  });
}
export const low = (G) => G.quality === 'low';
export { rgba, mixHex };
