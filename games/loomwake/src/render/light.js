// Lighting: a reduced-resolution darkness layer with a soft hole cut for
// every light (destination-out), composited over the world, then additive
// coloured glow from cached radial sprites. Lights are collected fresh each
// frame with push(x, y, r, color, i).
//
// Exports:
//   glowSprite(color) -> canvas         cached 128 px radial gradient (additive glows everywhere)
//   drawGlow(ctx, x, y, r, color, a)    additive-friendly glow helper (caller sets composite op)
//   createLight() -> L
//     L.begin(cap)        start a frame (cap = max lights, the strongest win)
//     L.push(x, y, r, color, i, g = 1)   g scales the coloured haze (0 = hole only; a light carried by a sprite keeps it low)
//     L.render(ctx, cam, view, dark, res, extra?)   dark = { color, a }; view = { W, H, scale } (canvas px, px per world unit);
//                         extra(lctx, viewRect) adds world-space glow into the layer (one composite pass in all)
//     L.count
import { hexA } from '../core/math.js';

function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); c.getContext('2d', { willReadFrequently: true }); return c; }

const glowCache = new Map();
export function normHex(c) {
  if (typeof c !== 'string' || c[0] !== '#') return '#ffffff';
  if (c.length === 4) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  return c.length >= 7 ? c.slice(0, 7) : '#ffffff';
}
export function glowSprite(color) {
  color = normHex(color);
  let c = glowCache.get(color);
  if (c) return c;
  c = mk(128, 128);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, hexA(color, 1)); gr.addColorStop(0.18, hexA(color, 0.55)); gr.addColorStop(0.5, hexA(color, 0.14)); gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowCache.set(color, c);
  return c;
}
export function drawGlow(ctx, x, y, r, color, a = 1) {
  if (a <= 0.01 || r <= 0) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(glowSprite(normHex(color)), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}
const hole = (() => { const c = mk(128, 128); const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c; })();

export function createLight() {
  let layer = null, lctx = null;
  const list = [];
  let n = 0, cap = 32;
  const L = { count: 0, res: 0.5, cheap: false };
  L.begin = (c) => { n = 0; cap = c; };
  L.push = (x, y, r, color, i, g = 1) => {
    if (!(i > 0.01) || !(r > 1)) return;
    let o = list[n];
    if (!o) o = list[n] = { x: 0, y: 0, r: 0, color: '#ffffff', i: 0, g: 1 };
    o.x = x; o.y = y; o.r = r; o.color = color; o.i = i; o.g = g;
    n++;
  };
  L.render = (ctx, cam, view, dark, res, extra) => {
    if (res && res !== L.res) { L.res = res; layer = null; }
    const W = Math.ceil(view.W * L.res), H = Math.ceil(view.H * L.res);
    if (!layer || layer.width !== W || layer.height !== H) { layer = mk(W, H); lctx = layer.getContext('2d'); }
    // keep the strongest lights when over budget
    let use = n;
    if (n > cap) { const arr = list.slice(0, n).sort((a, b) => b.i * b.r - a.i * a.r); for (let k = 0; k < n; k++) list[k] = arr[k]; use = cap + Math.min(n - cap, 24); }
    L.count = use;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over'; lctx.globalAlpha = 1;
    lctx.clearRect(0, 0, W, H);
    lctx.fillStyle = hexA(dark?.color || '#04051a', dark?.a ?? 0.8); lctx.fillRect(0, 0, W, H);
    const ls = view.scale * L.res;
    lctx.setTransform(ls, 0, 0, ls, W / 2 - (cam.x + cam.sx) * ls, H / 2 - (cam.y + cam.sy) * ls);
    // cull lights that cannot touch the screen
    const vx0 = cam.x + cam.sx - view.W / 2 / view.scale, vy0 = cam.y + cam.sy - view.H / 2 / view.scale, vx1 = vx0 + view.W / view.scale, vy1 = vy0 + view.H / view.scale;
    const vis = (o) => o.x + o.r > vx0 && o.x - o.r < vx1 && o.y + o.r > vy0 && o.y - o.r < vy1;
    lctx.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < use; k++) { const o = list[k]; if (!vis(o)) continue; lctx.globalAlpha = Math.min(1, o.i); lctx.drawImage(hole, o.x - o.r, o.y - o.r * 0.8, o.r * 2, o.r * 1.6); }
    lctx.globalAlpha = 1; lctx.globalCompositeOperation = 'source-over';
    // coloured light is added into the darkness layer itself (lighter adds colour and coverage), so the whole
    // lighting costs ONE full-screen upscale blit: scene * (1 - a) + dark + glow. On a hole the glow reads as a
    // coloured haze rather than a pure add, which is how the painted look wants it anyway. `extra(lctx)` lets the
    // renderer add world-space glow (the floor glow's pulse) in the same pass.
    lctx.globalCompositeOperation = 'lighter';
    const gr = L.cheap ? 0.7 : 0.8, gi = L.cheap ? 0.3 : 0.26;
    for (let k = 0; k < Math.min(use, cap); k++) { const o = list[k]; if (!vis(o)) continue; if (o.g > 0) drawGlow(lctx, o.x, o.y, o.r * gr, o.color, o.i * gi * o.g); }
    if (extra) extra(lctx, { x0: vx0, y0: vy0, x1: vx1, y1: vy1 });
    lctx.globalCompositeOperation = 'source-over'; lctx.globalAlpha = 1;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(layer, 0, 0, view.W, view.H); ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  };
  return L;
}
