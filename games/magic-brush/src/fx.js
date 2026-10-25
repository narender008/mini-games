// Particles: sparkles, paint drops, splats, hearts, notes, sleepy moons and
// soap bubbles. Each look is drawn once into a small sprite (per colour and
// size bucket) and then only blitted with a transform, so a burst of a
// hundred drops costs a hundred drawImage calls and nothing else.
import { TAU, INK, layer, glow, star4, drop, splat, heartPath, inkFill, circ, ell, rgba, shade, spath, el, wob } from './lib.js';

let DPR = 1;
const SPR = new Map();
export function setFxDpr(d) { if (d !== DPR) { DPR = d; SPR.clear(); } }

function sprite(key, size, draw) {
  let s = SPR.get(key);
  if (!s) {
    const px = Math.ceil(size * DPR), c = layer(px, px), g = c.getContext('2d');
    g.scale(DPR, DPR); g.translate(size / 2, size / 2); draw(g, size);
    s = { c, size }; SPR.set(key, s);
  }
  return s;
}
const S_SPARK = 64;
const sparkSprite = (col = '#fff3b0') => sprite('spark' + col, S_SPARK, (g, s) => { glow(g, 0, 0, s * 0.48, col, 0.6); star4(g, 0, 0, s * 0.22, '#fffdf2'); });
const dropSprite = (col) => sprite('drop' + col, 48, (g) => drop(g, 0, 6, 9, col, 0));
const splatSprite = (col, v) => sprite('splat' + col + v, 56, (g) => splat(g, 0, 0, 11, col, v * 7 + 3));
const heartSprite = (col) => sprite('heart' + col, 56, (g) => { inkFill(g, heartPath(0, 2, 15), col, 3.5); g.fillStyle = 'rgba(255,255,255,0.7)'; ell(g, -7, -5, 4, 2.6, -0.6); g.fill(); });
const noteSprite = (col) => sprite('note' + col, 48, (g) => {
  g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = 2.5;
  ell(g, -5, 9, 7, 5.5, -0.4); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(1, 8); g.lineTo(1, -14); g.quadraticCurveTo(9, -10, 11, -2); g.stroke();
});
const moonSprite = () => sprite('moon', 60, (g) => {
  const P = wob(el(0, 0, 24, 22), 2, 3); g.fillStyle = '#fffaf0'; g.fill(spath(P)); g.strokeStyle = rgba(INK, 0.5); g.lineWidth = 2.5; g.stroke(spath(P));
  g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(0, 0, 12, 0.6, 0.6 + Math.PI * 1.4); g.arc(6, -4, 10, 0.6 + Math.PI * 1.4, 0.6, true); g.fill();
});
export const bubbleSprite = () => sprite('bubble', 80, (g, s) => {
  const r = s * 0.42, gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.7, 'rgba(200,235,255,0.28)'); gr.addColorStop(1, 'rgba(210,170,255,0.6)');
  g.fillStyle = gr; circ(g, 0, 0, r); g.fill(); g.strokeStyle = rgba('#7a8fb8', 0.75); g.lineWidth = 2.5; g.stroke();
  g.fillStyle = '#fff'; ell(g, -r * 0.35, -r * 0.4, r * 0.22, r * 0.12, -0.7); g.fill();
});
const ringSprite = (col) => sprite('ring' + col, 64, (g) => { g.strokeStyle = col; g.lineWidth = 4; circ(g, 0, 0, 26); g.stroke(); });
const puffSprite = (col) => sprite('puff' + col, 64, (g) => { const gr = g.createRadialGradient(0, 0, 2, 0, 0, 28); gr.addColorStop(0, rgba(col, 0.9)); gr.addColorStop(0.6, rgba(col, 0.5)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; circ(g, 0, 0, 28); g.fill(); star4(g, 4, -4, 7, '#fffdf2'); });

export const PAINT_COLS = ['#f0544f', '#ff9a3d', '#ffd23f', '#5cc28a', '#4b8ef0', '#9b6ff0', '#ff86b8'];

export class Fx {
  constructor() { this.list = []; }
  clear() { this.list.length = 0; }
  add(p) {
    if (this.list.length > 420) this.list.shift();
    this.list.push(Object.assign({ age: 0, life: 1, vx: 0, vy: 0, grav: 0, drag: 0, rot: 0, vr: 0, size: 20, alpha: 1, grow: 0, layer: 0 }, p));
  }
  sparkle(x, y, size = 22, o = {}) { this.add(Object.assign({ type: 'spark', x, y, size, life: 0.7 + Math.random() * 0.5, vr: (Math.random() - 0.5) * 3 }, o)); }
  burstSparkles(x, y, n, spread, o = {}) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = spread * (0.3 + Math.random()); this.sparkle(x, y, (o.size || 22) * (0.6 + Math.random() * 0.8), Object.assign({ vx: Math.cos(a) * v, vy: Math.sin(a) * v - spread * 0.2, drag: 2.2 }, o)); }
  }
  confetti(x, y, n, spread, cols = PAINT_COLS, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * (o.arc ?? 2.6), v = spread * (0.45 + Math.random() * 0.8), col = cols[i % cols.length];
      this.add({ type: Math.random() < 0.65 ? 'drop' : 'splat', v: i % 3, col, x, y, vx: Math.cos(a) * v * (o.wide || 1), vy: Math.sin(a) * v, grav: spread * 1.6, drag: 0.6, life: 1.3 + Math.random() * 0.9, size: (o.size || 24) * (0.6 + Math.random() * 0.7), rot: a + Math.PI / 2, vr: (Math.random() - 0.5) * 6, fadeAt: 0.7 });
    }
  }
  hearts(x, y, n = 3, size = 26, col = '#ff6f9a') { for (let i = 0; i < n; i++) this.add({ type: 'heart', col: i % 2 ? '#ff86b8' : col, x: x + (Math.random() - 0.5) * size, y, vx: (Math.random() - 0.5) * size * 1.5, vy: -size * (2.2 + Math.random()), drag: 1.2, life: 1.2 + Math.random() * 0.4, size: size * (0.7 + Math.random() * 0.5), wobble: Math.random() * TAU }); }
  notes(x, y, n = 2, size = 22) { for (let i = 0; i < n; i++) this.add({ type: 'note', col: PAINT_COLS[(Math.random() * 7) | 0], x, y, vx: (Math.random() - 0.3) * size * 2, vy: -size * 2.5, drag: 1, life: 1.1, size, wobble: Math.random() * TAU }); }
  moon(x, y, size = 30) { this.add({ type: 'moon', x, y, vx: size * 0.4, vy: -size * 0.9, life: 2.4, size, grow: 0.4, wobble: Math.random() * TAU }); }
  ring(x, y, size, col = '#ff86b8') { this.add({ type: 'ring', col, x, y, size, grow: 2.6, life: 0.5 }); }
  puff(x, y, vx, vy, col, size = 30) { this.add({ type: 'puff', col, x, y, vx, vy, drag: 1.6, life: 0.8 + Math.random() * 0.3, size, grow: 1.2, vr: (Math.random() - 0.5) * 4 }); }
  splash(x, y, n, size, col = '#a6e4ff') { for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = size * (2.5 + Math.random() * 3); this.add({ type: 'drop', col, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav: size * 14, life: 0.8 + Math.random() * 0.4, size: size * (0.5 + Math.random() * 0.6), rot: a + Math.PI / 2, align: true }); } }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) { L.splice(i, 1); continue; }
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.align) p.rot = Math.atan2(p.vy, p.vx) + Math.PI / 2;
    }
  }
  draw(g, layerId = 0) {
    for (const p of this.list) {
      if ((p.layer || 0) !== layerId) continue;
      const t = p.age / p.life;
      let a = p.alpha;
      if (p.fadeAt != null) a *= t > p.fadeAt ? 1 - (t - p.fadeAt) / (1 - p.fadeAt) : 1;
      else a *= t < 0.15 ? t / 0.15 : t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      if (a <= 0.01) continue;
      let s, size = p.size * (1 + p.grow * t);
      switch (p.type) {
        case 'spark': s = sparkSprite(p.col); size *= 1 + 0.25 * Math.sin(p.age * 14); break;
        case 'drop': s = dropSprite(p.col); break;
        case 'splat': s = splatSprite(p.col, p.v || 0); break;
        case 'heart': s = heartSprite(p.col); break;
        case 'note': s = noteSprite(p.col); break;
        case 'moon': s = moonSprite(); break;
        case 'ring': s = ringSprite(p.col); break;
        case 'puff': s = puffSprite(p.col); break;
        case 'bubble': s = bubbleSprite(); break;
        default: continue;
      }
      const wx = p.wobble != null ? Math.sin(p.age * 5 + p.wobble) * p.size * 0.3 : 0;
      g.save(); g.globalAlpha = a; g.translate(p.x + wx, p.y); if (p.rot) g.rotate(p.rot);
      g.drawImage(s.c, -size / 2, -size / 2, size, size);
      g.restore();
    }
  }
}
export { sparkSprite, heartSprite, moonSprite };
