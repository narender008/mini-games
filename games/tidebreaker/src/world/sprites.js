// Cached soft sprites (glows, puffs) so painters can stamp them with drawImage
// instead of building a radial gradient on every call.
import { rgba } from '../util.js';

const glows = new Map(), puffs = new Map();
const S = 128; // sprite size; scaled on draw

function make(fill) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  fill(c.getContext('2d')); return c;
}
// Radial light: centre a=1, 0.35 at 35 %, clear at the edge (gfx.glow's profile).
export function glowSprite(col) {
  let c = glows.get(col);
  if (!c) {
    c = make((g) => {
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.35, rgba(col, 0.35)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    });
    glows.set(col, c);
  }
  return c;
}
// Soft round puff lit from the upper left (gfx.puff's profile).
export function puffSprite(col) {
  let c = puffs.get(col);
  if (!c) {
    c = make((g) => {
      const r = S / 2, gr = g.createRadialGradient(r - r * 0.2, r - r * 0.3, 0, r, r, r);
      gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.6, rgba(col, 0.6)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(r, r, r, 0, 7); g.fill();
    });
    puffs.set(col, c);
  }
  return c;
}
export function drawGlow(g, x, y, r, col, a = 1) {
  if (r <= 0 || a <= 0.003) return;
  const p = g.globalAlpha; g.globalAlpha = p * Math.min(1, a);
  g.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2); g.globalAlpha = p;
}
export function drawPuff(g, x, y, r, col, a = 1) {
  if (r <= 0 || a <= 0.003) return;
  const p = g.globalAlpha; g.globalAlpha = p * Math.min(1, a);
  g.drawImage(puffSprite(col), x - r, y - r, r * 2, r * 2); g.globalAlpha = p;
}
// Colours only ever come from a small fixed palette, but keep the caches bounded anyway.
export function trimSprites() { if (glows.size > 200) glows.clear(); if (puffs.size > 200) puffs.clear(); }
