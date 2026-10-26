// Short-lived effects: juice drops and splash blobs, flashes, stars and
// hearts, the juice that flies into the jar, confetti and fireworks. Stains
// are painted once into a layer that fades slowly (see main.js).
import { ctx, TAU, rng, rgba, blob, sparkle, glow, additive, sticker } from './draw.js';
import { FRUIT, drop } from './fruits.js';

export function createFx() { return { drops: [], blobs: [], flashes: [], stickers: [], jarDrops: [], confetti: [], sparks: [], ripples: [], landed: [] }; }

const R = rng(12345), rnd = (a, b) => a + R() * (b - a);

export function burst(fx, x, y, r, kind, dir, big = false, land = [Infinity, Infinity]) {
  const f = FRUIT[kind];
  for (let i = 0; i < (big ? 26 : 18); i++) {
    const a = dir + (R() - 0.5) * 2.4 + (i % 2 ? Math.PI : 0), sp = rnd(r * 2.5, r * 7);
    fx.drops.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - r * 2, r: rnd(r * 0.05, r * 0.13), col: R() < 0.25 ? f.juice2 : f.juice, life: rnd(0.9, 1.6), t: 0, landY: rnd(land[0], land[1]) });
  }
  fx.blobs.push({ x, y, s: r * 0.9, col: f.juice, col2: f.juice2, t: 0, life: 0.35, seed: Math.floor(R() * 1000) });
  fx.flashes.push({ x, y, s: r, t: 0, life: 0.22 });
}
export function stars(fx, x, y, n, r, hearts = 0.4) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (R() - 0.5) * 2.4, sp = rnd(r * 2, r * 4.5);
    fx.stickers.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: rnd(-0.5, 0.5), spin: rnd(-3, 3), r: rnd(r * 0.18, r * 0.32), kind: R() < hearts ? 'heart' : 'star', t: 0, life: rnd(0.9, 1.4) });
  }
}
export function toJar(fx, x, y, jx, jy, kind, delay, r) {
  const f = FRUIT[kind];
  for (let i = 0; i < 6; i++) fx.jarDrops.push({ x0: x + rnd(-r, r) * 0.4, y0: y + rnd(-r, r) * 0.4, x1: jx + rnd(-r, r) * 0.25, y1: jy, t: -i * 0.05, dur: delay - 0.05 * (6 - i) * 0.5, col: i % 2 ? f.juice2 : f.juice, r: rnd(r * 0.07, r * 0.12) });
}
export function ripple(fx, x, y, r) { fx.ripples.push({ x, y, r, t: 0, life: 0.45 }); }
export function confettiRain(fx, w, h, n, u) {
  const cols = ['#ff4f6d', '#ffd23a', '#3fb8ff', '#5fd84a', '#ff8ac0', '#b06aff', '#ff9f1c'];
  for (let i = 0; i < n; i++) fx.confetti.push({ x: R() * w, y: -R() * h * 0.8 - 20, vx: rnd(-30, 30) * u, vy: rnd(90, 190) * u, rot: R() * TAU, spin: rnd(-6, 6), s: rnd(8, 16) * u, col: cols[i % cols.length], k: R(), ph: R() * TAU, t: 0, life: 6 + R() * 2 });
}
export function firework(fx, x, y, u) {
  const cols = ['#ff5c9a', '#3fb8ff', '#ffd23a', '#5fd84a', '#b06aff'], c = cols[Math.floor(R() * cols.length)];
  for (let i = 0; i < 22; i++) { const a = i / 22 * TAU, sp = rnd(160, 240) * u; fx.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, col: c, t: 0, life: rnd(0.8, 1.2), r: rnd(5, 8) * u }); }
  fx.flashes.push({ x, y, s: 70 * u, t: 0, life: 0.3, col: c });
}

// Advance everything; returns drops that hit the ground this step so main
// can paint stains where they land.
export function stepFx(fx, dt, g) {
  const age = list => list.filter(p => (p.t += dt) < p.life);
  for (const p of fx.drops) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += g * 1.6 * dt; if (p.vy > 0 && p.y > p.landY && p.t > 0.15) { fx.landed.push(p); p.t = p.life; } }
  fx.drops = age(fx.drops); fx.blobs = age(fx.blobs); fx.flashes = age(fx.flashes); fx.ripples = age(fx.ripples);
  for (const p of fx.stickers) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 1.5 * dt; p.vy = p.vy * (1 - 1.5 * dt) + 60 * dt; p.rot += p.spin * dt; }
  fx.stickers = age(fx.stickers);
  for (const p of fx.jarDrops) p.t += dt;
  fx.jarDrops = fx.jarDrops.filter(p => p.t < p.dur);
  for (const p of fx.confetti) { p.x += (p.vx + Math.sin(p.t * 3 + p.ph) * 40) * dt; p.y += p.vy * dt; p.rot += p.spin * dt; }
  fx.confetti = age(fx.confetti);
  for (const p of fx.sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 1.8 * dt; p.vy = p.vy * (1 - 1.8 * dt) + 120 * dt; }
  fx.sparks = age(fx.sparks);
  const l = fx.landed; fx.landed = []; return l;
}

export function drawFxBack(fx) {
  const g = ctx;
  for (const b of fx.blobs) {
    const k = b.t / b.life, s = b.s * (0.6 + k * 0.7);
    g.save(); g.globalAlpha = 1 - k * k;
    blob(g, b.x, b.y, s * 0.55, b.seed, 6, 0.32); g.fillStyle = b.col; g.fill();
    blob(g, b.x - s * 0.08, b.y - s * 0.08, s * 0.32, b.seed + 1, 5, 0.3); g.fillStyle = b.col2; g.fill();
    g.restore();
  }
}
export function drawFxFront(fx) {
  const g = ctx;
  for (const p of fx.drops) { const a = Math.atan2(p.vy, p.vx), sp = Math.hypot(p.vx, p.vy); g.globalAlpha = Math.min(1, (p.life - p.t) * 4); drop(g, p.x, p.y, a, p.r + sp * 0.025, p.r, p.col); }
  g.globalAlpha = 1;
  for (const p of fx.jarDrops) {
    if (p.t < 0) continue; const k = p.t / p.dur, mx = (p.x0 + p.x1) / 2, my = Math.min(p.y0, p.y1) - Math.abs(p.x1 - p.x0) * 0.35;
    const x = (1 - k) * (1 - k) * p.x0 + 2 * (1 - k) * k * mx + k * k * p.x1, y = (1 - k) * (1 - k) * p.y0 + 2 * (1 - k) * k * my + k * k * p.y1;
    g.fillStyle = p.col; g.beginPath(); g.arc(x, y, p.r, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x - p.r * 0.3, y - p.r * 0.3, p.r * 0.3, 0, TAU); g.fill();
  }
  for (const r of fx.ripples) { const k = r.t / r.life; g.save(); g.globalAlpha = 1 - k; g.lineWidth = r.r * 0.12 * (1 - k); g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(r.x, r.y, r.r * (0.3 + k), 0, TAU); g.stroke(); g.restore(); }
  for (const p of fx.stickers) { const k = p.t / p.life, pop = Math.min(1, p.t * 8); g.save(); g.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3; sticker(p.kind, p.x, p.y, p.r * pop, p.rot); g.restore(); }
  additive(() => {
    for (const f of fx.flashes) { const k = f.t / f.life; glow(f.x, f.y, f.s * (0.6 + k * 0.6), f.col || '#ffffff', 0.45 * (1 - k)); }
    for (const p of fx.sparks) { const k = p.t / p.life; g.globalAlpha = 1 - k; g.fillStyle = p.col; g.beginPath(); g.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, TAU); g.fill(); }
    g.globalAlpha = 1;
  });
  for (const f of fx.flashes) { const k = f.t / f.life; if (k < 0.7 && !f.col) sparkle(f.x, f.y, f.s * 0.4 * (1 - k), 1 - k); }
  for (const p of fx.confetti) {
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.col; g.globalAlpha = Math.min(1, (p.life - p.t) * 2);
    if (p.k < 0.55) { g.scale(1, Math.abs(Math.cos(p.t * 4 + p.ph)) * 0.7 + 0.3); g.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66); }
    else if (p.k < 0.8) { g.beginPath(); g.arc(0, 0, p.s * 0.4, 0, TAU); g.fill(); }
    else { g.strokeStyle = p.col; g.lineWidth = p.s * 0.28; g.lineCap = 'round'; g.beginPath(); g.moveTo(-p.s, 0); g.bezierCurveTo(-p.s * 0.5, -p.s, 0, p.s, p.s * 0.5, 0); g.stroke(); }
    g.restore();
  }
}
