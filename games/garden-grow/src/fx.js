// Little things that fly: sparkles, hearts, stars, petals, water drops,
// confetti, music notes, dandelion fluff, dust puffs, rings and fireworks.
// Sizes are in art units (scaled by the screen like everything else).
import { TAU, sparkle, glow } from './draw.js';
import * as Art from './art.js';

const MAX = 900;
export function createFx() { return { list: [], ps: 1 }; }
const R = Math.random;
function add(fx, p) { if (fx.list.length >= MAX) fx.list.shift(); fx.list.push({ t: 0, delay: 0, rot: 0, vr: 0, g: 0, drag: 0, a: 1, ...p }); }
const COLS = ['#ff3d4f', '#ffd21f', '#4bd458', '#3fa9ff', '#a55bff', '#ff5fa8', '#ff8a1f'];

export function sparkles(fx, x, y, n, spread = 60, col) {
  const ps = fx.ps;
  for (let i = 0; i < n; i++) { const a = R() * TAU, v = (40 + R() * 120) * ps; add(fx, { k: 'spark', x: x + Math.cos(a) * spread * 0.3 * ps, y: y + Math.sin(a) * spread * 0.3 * ps, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30 * ps, drag: 2.5, life: 0.6 + R() * 0.5, s: 8 + R() * 12, col: col || (i % 3 ? '#ffffff' : '#fff38a') }); }
}
export function hearts(fx, x, y, n = 5) {
  const ps = fx.ps;
  for (let i = 0; i < n; i++) add(fx, { k: 'heart', x: x + (R() - 0.5) * 50 * ps, y, vx: (R() - 0.5) * 60 * ps, vy: -(70 + R() * 80) * ps, drag: 0.6, life: 1.2 + R() * 0.6, s: 0.5 + R() * 0.45, rot: (R() - 0.5) * 0.6, delay: i * 0.06 });
}
export function stars(fx, x, y, n = 6, speed = 1) {
  const ps = fx.ps;
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (R() - 0.5) * 2.6, v = (150 + R() * 200) * ps * speed; add(fx, { k: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 420 * ps, drag: 0.8, life: 1 + R() * 0.5, s: 0.45 + R() * 0.4, rot: R() * TAU, vr: (R() - 0.5) * 8 }); }
}
export function petals(fx, x, y, col, n = 10, speed = 1) {
  const ps = fx.ps;
  for (let i = 0; i < n; i++) { const a = R() * TAU, v = (120 + R() * 180) * ps * speed; add(fx, { k: 'petal', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60 * ps, g: 260 * ps, drag: 1.6, life: 1.3 + R() * 0.6, s: 0.55 + R() * 0.4, rot: R() * TAU, vr: (R() - 0.5) * 10, col }); }
}
export function ring(fx, x, y, r, col = '#ffffff', delay = 0) { add(fx, { k: 'ring', x, y, life: 0.6, s: r, col, delay }); }
export function dust(fx, x, y, n = 7, delay = 0) {
  const ps = fx.ps;
  for (let i = 0; i < n; i++) { const a = Math.PI + (i / (n - 1)) * Math.PI, v = (60 + R() * 80) * ps; add(fx, { k: 'dust', x, y, vx: Math.cos(a) * v * 1.4, vy: Math.sin(a) * v * 0.6, drag: 3, life: 0.6 + R() * 0.3, s: (12 + R() * 10) * ps, delay }); }
}
export function seedDrop(fx, x, y, delay = 0, from = 160) { add(fx, { k: 'seed', x, y: y - from * fx.ps, y1: y, vy: 0, g: 1800 * fx.ps, life: 2, s: 0.9, delay, rot: (R() - 0.5) * 0.8, vr: (R() - 0.5) * 6 }); }
export function drops(fx, x, y, n, groundY, spread = 20) {
  const ps = fx.ps;
  for (let i = 0; i < n; i++) add(fx, { k: 'drop', x: x + (R() - 0.5) * spread * ps, y, vx: (R() - 0.3) * 40 * ps, vy: (40 + R() * 60) * ps, g: 900 * ps, life: 1.5, s: 0.45 + R() * 0.3, ground: groundY - R() * 20 * ps });
}
export function rainDrop(fx, x, y, groundY) { add(fx, { k: 'drop', x, y, vx: -20 * fx.ps, vy: 520 * fx.ps, g: 300 * fx.ps, life: 2.5, s: 0.32 + R() * 0.18, ground: groundY }); }
export function notes(fx, x, y, n = 2, col) {
  const ps = fx.ps;
  for (let i = 0; i < n; i++) add(fx, { k: 'note', x: x + (R() - 0.5) * 30 * ps, y, vx: (R() - 0.5) * 50 * ps, vy: -(60 + R() * 40) * ps, life: 1.4, s: 0.55 + R() * 0.3, col: col || COLS[(R() * COLS.length) | 0], delay: i * 0.15, sway: R() * TAU });
}
export function fluff(fx, x, y, n = 10) {
  const ps = fx.ps;
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (R() - 0.5) * 2.4, v = (60 + R() * 100) * ps; add(fx, { k: 'fluff', x: x + Math.cos(a) * 20 * ps, y: y + Math.sin(a) * 20 * ps, vx: Math.cos(a) * v + 30 * ps, vy: Math.sin(a) * v, drag: 0.9, g: -14 * ps, life: 3 + R() * 1.5, s: 0.6 + R() * 0.5, sway: R() * TAU, rot: (R() - 0.5) * 0.4 }); }
}
export function confetti(fx, W, H, n) {
  const ps = fx.ps;
  for (let i = 0; i < n; i++) add(fx, { k: R() < 0.2 ? 'star' : R() < 0.3 ? 'heart' : 'confetti', x: R() * W, y: -20 - R() * H * 0.5, vx: (R() - 0.5) * 80 * ps, vy: (80 + R() * 120) * ps, g: 60 * ps, drag: 0.2, life: 6, s: 0.35 + R() * 0.35, rot: R() * TAU, vr: (R() - 0.5) * 9, col: COLS[i % COLS.length], sway: R() * TAU, ground: H + 40 });
}
export function firework(fx, x, y) {
  const ps = fx.ps, col = COLS[(R() * COLS.length) | 0], col2 = COLS[(R() * COLS.length) | 0];
  add(fx, { k: 'flash', x, y, life: 0.35, s: 90 * ps, col });
  for (let i = 0; i < 26; i++) { const a = i / 26 * TAU, v = (180 + R() * 120) * ps; add(fx, { k: 'spark2', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 120 * ps, drag: 1.6, life: 1.1 + R() * 0.4, s: 7 + R() * 5, col: i % 2 ? col : col2 }); }
  for (let i = 0; i < 6; i++) { const a = R() * TAU, v = (100 + R() * 100) * ps; add(fx, { k: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 200 * ps, drag: 1, life: 1.3, s: 0.4, rot: R() * TAU, vr: 4 }); }
}
export function pop(fx, x, y, r) {
  const ps = fx.ps;
  add(fx, { k: 'ring', x, y, life: 0.35, s: r, col: '#ffffff' });
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; add(fx, { k: 'spark', x: x + Math.cos(a) * r * 0.7, y: y + Math.sin(a) * r * 0.7, vx: Math.cos(a) * 120 * ps, vy: Math.sin(a) * 120 * ps, drag: 4, life: 0.35, s: 7, col: '#ffffff' }); }
}

export function step(fx, dt, events) {
  const L = fx.list;
  for (const p of L) {
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.t += dt;
    if (p.k === 'seed') {
      p.vy += p.g * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.y >= p.y1) { p.t = p.life; events.push({ type: 'seedLand', x: p.x, y: p.y1 }); }
      continue;
    }
    if (p.vx != null) {
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.sway != null) p.x += Math.sin(p.t * 3 + p.sway) * 30 * fx.ps * dt;
    }
    p.rot += p.vr * dt;
    if (p.k === 'drop' && p.y >= p.ground) { p.t = p.life; events.push({ type: 'splashDot', x: p.x, y: p.ground }); }
  }
  fx.list = L.filter(p => p.t < p.life);
}

export function draw(g, fx) {
  const ps = fx.ps;
  for (const p of fx.list) {
    if (p.delay > 0) continue;
    const k = p.t / p.life, fade = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    switch (p.k) {
      case 'spark': sparkle(p.x, p.y, p.s * ps * (1 - k * 0.6), fade, p.col, g); break;
      case 'spark2': g.globalAlpha = fade; g.drawImage(Art.glossDot(p.col).c, p.x - p.s * ps, p.y - p.s * ps, p.s * 2 * ps, p.s * 2 * ps); g.globalAlpha = 1; break;
      case 'flash': glow(p.x, p.y, p.s * (0.6 + k), p.col, 1 - k, g); glow(p.x, p.y, p.s * 0.5, '#ffffff', 1 - k, g); break;
      case 'heart': Art.blit(g, Art.heart(), p.x, p.y, p.s * Math.min(1, p.t * 6), p.rot + Math.sin(p.t * 5) * 0.2, 1, 1, fade); break;
      case 'star': Art.blit(g, Art.star(), p.x, p.y, p.s, p.rot, 1, 1, fade); break;
      case 'petal': Art.blit(g, Art.petal(p.col), p.x, p.y, p.s, p.rot, 1, Math.cos(p.t * 7), fade); break;
      case 'confetti': g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.cos(p.t * 6 + p.sway)); g.fillStyle = p.col; g.fillRect(-9 * ps, -4 * ps, 18 * ps, 8 * ps); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-7 * ps, -3 * ps, 10 * ps, 2 * ps); g.restore(); break;
      case 'note': Art.blit(g, Art.note(p.col), p.x + Math.sin(p.t * 4 + p.sway) * 10 * ps, p.y, p.s * Math.min(1, p.t * 5), Math.sin(p.t * 4) * 0.3, 1, 1, fade); break;
      case 'fluff': Art.blit(g, Art.fluff(), p.x, p.y, p.s, p.rot + Math.sin(p.t * 2 + p.sway) * 0.3, 1, 1, fade); break;
      case 'drop': Art.blit(g, Art.drop(), p.x, p.y, p.s, Math.atan2(-p.vx, p.vy) * 0.6); break;
      case 'seed': Art.blit(g, Art.seed(), p.x, p.y, p.s, p.rot); break;
      case 'dust': g.globalAlpha = (1 - k) * 0.7; g.fillStyle = '#d8a878'; g.beginPath(); g.arc(p.x, p.y, p.s * (0.6 + k * 0.6), 0, TAU); g.fill(); g.globalAlpha = 1; break;
      case 'ring': g.save(); g.globalAlpha = 1 - k; g.strokeStyle = p.col; g.lineWidth = 7 * ps * (1 - k) + 1; g.beginPath(); g.arc(p.x, p.y, p.s * (0.4 + k * 0.9), 0, TAU); g.stroke(); g.restore(); break;
    }
  }
}
