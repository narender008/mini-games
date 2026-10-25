// Drowned Cloister enemies: eel (swims inside water tiles, coils back and
// lunges), knight (drowned knight: shield turns front swings, slow two-cut
// sword combo after a clear wind-up, shield drops while he recovers), wisp
// (ghost light, drifts through walls toward you, fades out and can't be hit
// or hurt you while faded), jelly (bobs in water, charges and pulses a ring).
import { TILE } from '../config.js';
import { emit } from '../events.js';
import { lineOfSight } from '../physics.js';
import { spawnShot, hitPlayerBox } from '../combat.js';
import { setState, floorBelow, patrol, walk, fly, pc, playerDist, isWaterAt } from './base.js';
import { glow, additive, body, light, warn, rgba, TAU } from './paint.js';

function sinkToWater(G, cx, cy) { for (let i = 0; i < 8; i++) if (isWaterAt(G, cx, cy + i * TILE)) return cy + i * TILE; return cy; }
// move a swimmer but keep its centre in water
function swim(G, e, dt) {
  const ox = e.x, oy = e.y; fly(G, e, dt);
  if (!isWaterAt(G, e.x + e.w / 2, oy + e.h / 2)) { e.x = ox; e.vx = -e.vx; e.wallTurn = true; }
  if (!isWaterAt(G, e.x + e.w / 2, e.y + e.h / 2)) { e.y = oy; e.vy = 0; }
}

// ---------------------------------------------------------------- eel
const eel = {
  w: 60, h: 22, hp: 3, contact: 1, shards: 3, color: '#3ad6d0',
  place(e, G, cx, cy) { const y = sinkToWater(G, cx, cy); e.x = cx - e.w / 2; e.y = y - e.h / 2; e.hy = y; e.cool = 1; },
  update(e, G, dt) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, p = G.player, pp = pc(G);
    const near = p && playerDist(G, e) < 290 && (p.swimming || isWaterAt(G, pp.x, p.y + p.h + 10) || isWaterAt(G, pp.x, pp.y)) && lineOfSight(G, cx, cy, pp.x, pp.y);
    e.cool -= dt;
    if (e.st === 'idle') {
      e.wallTurn = false;
      e.vx = e.face * 80; e.vy = (e.hy + Math.sin(e.t * 1.7) * 18 - cy) * 2; swim(G, e, dt);
      if (e.wallTurn) e.face = -e.face;
      if (near && e.cool <= 0) { e.face = pp.x > cx ? 1 : -1; setState(e, 'windup'); }
    } else if (e.st === 'windup') {
      e.vx = -e.face * 40; e.vy = 0; swim(G, e, dt);
      if (e.stT > 0.5) { const d = Math.hypot(pp.x - cx, pp.y - cy) || 1; e.lx = (pp.x - cx) / d * 560; e.ly = (pp.y - cy) / d * 560; setState(e, 'lunge'); emit('enemy-shoot', { kind: 'eel', x: cx, y: cy }); }
    } else if (e.st === 'lunge') {
      e.vx = e.lx; e.vy = e.ly; swim(G, e, dt);
      if (e.stT > 0.42) { e.cool = 1.3; setState(e, 'idle'); }
    }
  },
  draw(g, e, G) {
    const x = e.x + (e.face > 0 ? e.w - 8 : 8), y = e.y + e.h / 2, c = '#3ad6d0', wind = e.st === 'windup' ? e.stT / 0.5 : 0;
    const s = 0.42, sp = e.st === 'lunge' ? 14 : 6;
    g.save(); g.translate(x, y); g.scale(-e.face * s, s);
    const pt = (k) => [k * 230, Math.sin(k * 5.4 - e.t * sp) * 18 * k + Math.sin(e.t * sp) * 3];
    g.strokeStyle = body(e, '#0a1a22'); g.lineWidth = 22; g.lineCap = 'round';
    g.beginPath(); for (let i = 0; i <= 16; i++) { const [px, py] = pt(i / 16); g[i ? 'lineTo' : 'moveTo'](px, py); } g.stroke();
    additive(g, () => { for (let i = 1; i < 12; i++) { const [px, py] = pt(i / 11 * 0.95); glow(g, px, py - 6, 10, c, 0.8); g.fillStyle = '#e8ffff'; g.fillRect(px - 1.5, py - 7.5, 3, 3); } });
    g.fillStyle = body(e, '#0a1a22');
    g.beginPath(); g.moveTo(-20, -2); g.quadraticCurveTo(-10, -22, 14, -12); g.lineTo(14, 10); g.quadraticCurveTo(-10, 14, -30, 6); g.closePath(); g.fill();
    const jaw = e.st === 'lunge' ? 8 : wind * 5;
    g.fillStyle = '#e8f6f0'; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-26 + i * 6, 4 + jaw); g.lineTo(-24 + i * 6, -1 + jaw); g.lineTo(-22 + i * 6, 4 + jaw); g.fill(); }
    g.strokeStyle = '#0a1a22'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, -16); g.quadraticCurveTo(-20, -50, -46, -40); g.stroke();
    additive(g, () => { glow(g, -46, -40, 50 + wind * 40, c, 0.8); glow(g, -46, -40, 12, '#ffffff', 1); glow(g, -8, -6, 10 + wind * 10, '#ff3a6a', 1); });
    g.restore();
    light(G, x - e.face * 20, y - 16, 130 + wind * 60, c, 0.55);
  },
};

// ---------------------------------------------------------------- knight
const knight = {
  w: 34, h: 74, hp: 6, contact: 1, shards: 6, color: '#3ad6d0', heavy: true,
  place(e, G, cx, cy) { const f = floorBelow(G, cx, cy, 20) ?? cy + TILE / 2; e.x = cx - e.w / 2; e.y = f - e.h; e.home = cx; },
  guard(e, G, dmg, info) {
    if (info.src !== 'swing' || info.dir === 'down' || e.st === 'recover') return dmg;
    const side = Math.sign((info.fromX ?? 0) - (e.x + e.w / 2)) || 1;
    if (side === e.face) return false;
    return dmg;
  },
  update(e, G, dt) {
    const p = pc(G), cx = e.x + e.w / 2, dx = p.x - cx, seen = Math.abs(dx) < 430 && Math.abs(p.y - (e.y + e.h / 2)) < 120;
    if (e.st === 'idle') {
      if (seen) { e.face = dx > 0 ? 1 : -1; if (Math.abs(dx) < 95) setState(e, 'windup'); else walk(G, e, dt, e.face * 72); }
      else patrol(G, e, dt, 30);
      return;
    }
    walk(G, e, dt, 0);
    const T = { windup: 0.75, slash: 0.2, windup2: 0.45, slash2: 0.2, recover: 1.0 }[e.st];
    if (e.st === 'slash' || e.st === 'slash2') {
      if (e.stT < 0.12) hitPlayerBox(G, e.face > 0 ? cx : cx - 96, e.y - 4, 96, e.h * 0.8, 1, cx, { kind: 'knight' });
      if (e.stT < dt * 1.5) { emit('swing', { x: cx + e.face * 40, y: e.y + 30, dir: e.face > 0 ? 'right' : 'left', enemy: true }); walk(G, e, dt, e.face * 600); }
    }
    if (e.stT > T) setState(e, { windup: 'slash', slash: 'windup2', windup2: 'slash2', slash2: 'recover', recover: 'idle' }[e.st]);
  },
  draw(g, e, G) {
    const x = e.x + e.w / 2, y = e.y + e.h, f = e.face, c = '#3ad6d0', s = 0.86, st = e.st;
    const wind = st === 'windup' ? e.stT / 0.75 : st === 'windup2' ? e.stT / 0.45 : 0;
    g.save(); g.translate(x, y); g.scale(f * s, s);
    g.fillStyle = body(e, '#121a20');
    g.beginPath(); g.moveTo(-14, 0); g.lineTo(-18, -40); g.lineTo(-24, -52); g.lineTo(-10, -60); g.lineTo(10, -60); g.lineTo(24, -52); g.lineTo(18, -40); g.lineTo(14, 0); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-9, -60); g.lineTo(-10, -78); g.quadraticCurveTo(0, -88, 10, -78); g.lineTo(9, -60); g.fill();
    g.fillStyle = '#2a3a3e'; for (let i = 0; i < 4; i++) g.fillRect(-14 + i * 2, -40 + i * 9, 28 - i * 4, 2);
    g.strokeStyle = '#1f4a3a'; g.lineWidth = 2;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-14 + i * 6, -56); g.quadraticCurveTo(-18 + i * 6 + Math.sin(e.t * 2 + i) * 2, -40, -12 + i * 7, -26 - i * 3); g.stroke(); }
    // sword arm: raised behind on wind-up, swept forward on a cut
    const ang = st === 'windup' || st === 'windup2' ? -2.4 - wind * 0.4 : st === 'slash' || st === 'slash2' ? 0.9 : st === 'recover' ? 1.3 : -0.6;
    g.save(); g.translate(-6, -54); g.rotate(ang);
    g.fillStyle = body(e, '#121a20'); g.fillRect(-3, 0, 6, 20);
    g.fillStyle = body(e, '#4a5a5e'); g.fillRect(-2.5, 20, 5, 58); g.fillRect(-9, 18, 18, 4);
    if (wind > 0 || st === 'slash' || st === 'slash2') additive(g, () => { g.fillStyle = rgba(c, 0.6 + wind * 0.4); g.fillRect(-1.5, 22, 3, 56); glow(g, 0, 70, 20 + wind * 20, c, 0.5 + wind * 0.5); });
    g.restore();
    if (st === 'slash' || st === 'slash2') additive(g, () => { g.strokeStyle = rgba('#bafff8', 0.8 * (1 - e.stT / 0.2)); g.lineWidth = 10; g.beginPath(); g.arc(0, -48, 80, -1.4, 0.9); g.stroke(); });
    // shield: held forward, lowered while recovering
    const sy = st === 'recover' ? -14 : -50;
    g.save(); g.translate(18, sy); if (st === 'recover') g.rotate(0.5);
    g.fillStyle = body(e, '#1e2c32'); g.beginPath(); g.moveTo(-6, 0); g.lineTo(10, 0); g.lineTo(12, 26); g.quadraticCurveTo(2, 42, -6, 40); g.closePath(); g.fill();
    g.strokeStyle = '#4a6a6a'; g.lineWidth = 2; g.stroke();
    additive(g, () => { g.strokeStyle = rgba(c, 0.8); g.lineWidth = 1.5; g.beginPath(); g.moveTo(3, 6); g.lineTo(3, 30); g.moveTo(-2, 14); g.lineTo(8, 14); g.stroke(); if (e.clank > 0) glow(g, 4, 16, 34, '#ffffff', e.clank * 3); });
    g.restore();
    additive(g, () => { g.fillStyle = c; g.fillRect(-6, -74, 12, 3); glow(g, 0, -72, 22 + wind * 14, c, 0.9); });
    g.restore();
    if (wind > 0) warn(g, x - f * 20, e.y - 10, 26, '#bafff8', wind, e.t);
    light(G, x, e.y + 8, 110, c, 0.5);
  },
};

// ---------------------------------------------------------------- wisp
const wisp = {
  w: 28, h: 28, hp: 2, contact: 1, shards: 2, color: '#7af0ff',
  place(e, G, cx, cy) { e.x = cx - e.w / 2; e.y = cy - e.h / 2; },
  update(e, G, dt) {
    const ph = (e.t + e.seed * 4) % 4.2;
    e.alpha = ph < 2.4 ? 1 : ph < 2.8 ? 1 - (ph - 2.4) / 0.4 : ph < 3.7 ? 0 : (ph - 3.7) / 0.5;
    e.untouchable = e.harmless = e.alpha < 0.45;
    const p = pc(G), cx = e.x + e.w / 2, cy = e.y + e.h / 2, d = Math.hypot(p.x - cx, p.y - cy) || 1;
    const sp = d < 640 ? 66 : 0;
    e.x += ((p.x - cx) / d * sp + e.kvx) * dt; e.y += ((p.y - cy) / d * sp + Math.sin(e.t * 2.2) * 24) * dt;   // through walls
    e.kvx *= Math.pow(0.002, dt);
  },
  draw(g, e, G) {
    const a = e.alpha ?? 1, x = e.x + e.w / 2, y = e.y + e.h / 2, c = '#7af0ff';
    if (a <= 0.02) { additive(g, () => glow(g, x, y, 14, c, 0.15)); return; }
    g.save(); g.globalAlpha = a;
    additive(g, () => {
      glow(g, x, y, 56, c, 0.5);
      for (let i = 0; i < 5; i++) { const k = i / 5; glow(g, x - Math.sin(e.t * 3 + i) * 6, y + 10 + k * 26, 14 - k * 9, '#3ad6d0', 0.6 * (1 - k)); }
      const f = body(e, '#c8fbff');
      g.fillStyle = f; g.beginPath(); g.moveTo(x, y - 18); g.bezierCurveTo(x + 14, y - 4, x + 12, y + 12, x, y + 14); g.bezierCurveTo(x - 12, y + 12, x - 14, y - 4, x, y - 18); g.fill();
      glow(g, x, y, 18, '#ffffff', 0.7);
    });
    g.fillStyle = '#0a2a30'; g.beginPath(); g.ellipse(x - 4, y, 2, 3.5, 0, 0, TAU); g.ellipse(x + 4, y, 2, 3.5, 0, 0, TAU); g.fill();
    g.restore();
    light(G, x, y, 140, c, 0.5 * a);
  },
};

// ---------------------------------------------------------------- jelly
const jelly = {
  w: 34, h: 38, hp: 2, contact: 1, shards: 2, color: '#b07aff',
  place(e, G, cx, cy) { const y = sinkToWater(G, cx, cy); e.x = cx - e.w / 2; e.y = y - e.h / 2; e.hy = y; e.cool = 1.5 + e.seed; },
  update(e, G, dt) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    e.vx = Math.sin(e.t * 0.7 + e.seed * 6) * 20; e.vy = (e.hy + Math.sin(e.t * 1.6) * 34 - cy) * 2.5; swim(G, e, dt);
    e.cool -= dt;
    if (e.st === 'idle') { if (e.cool <= 0 && playerDist(G, e) < 280) setState(e, 'charge'); }
    else if (e.st === 'charge' && e.stT > 0.75) {
      spawnShot(G, { kind: 'ring', x: cx, y: cy, r: 18, grow: 230, life: 0.5, pierce: true, ghost: true, dmg: 1, color: '#b9a0ff' });
      emit('enemy-shoot', { kind: 'jelly', x: cx, y: cy }); e.cool = 3 + G.rng(); setState(e, 'idle');
    }
  },
  draw(g, e, G) {
    const x = e.x + e.w / 2, y = e.y + 12, c = '#b07aff', k = e.st === 'charge' ? e.stT / 0.75 : 0, pulse = 1 + Math.sin(e.t * 4) * 0.08;
    g.strokeStyle = rgba('#c8b0ff', 0.6); g.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(x - 10 + i * 5, y + 4); for (let j = 1; j <= 5; j++) g.lineTo(x - 10 + i * 5 + Math.sin(e.t * 3 + i + j) * 3, y + 4 + j * 6); g.stroke(); }
    additive(g, () => {
      glow(g, x, y, 46 + k * 30, c, 0.45 + k * 0.4);
      g.fillStyle = rgba(body(e, '#8a5aff'), 0.55);
      g.beginPath(); g.ellipse(x, y, 17 * pulse, 14 / pulse, 0, Math.PI, TAU); g.quadraticCurveTo(x, y + 6, x - 17 * pulse, y); g.fill();
      g.strokeStyle = rgba('#e0d0ff', 0.9); g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, 17 * pulse, 14 / pulse, 0, Math.PI, TAU); g.stroke();
      glow(g, x, y - 5, 8, '#ffffff', 0.8);
      if (k > 0) { g.strokeStyle = rgba('#ffffff', k); g.lineWidth = 1.5; g.beginPath(); for (let i = 0; i < 6; i++) { const a = i + e.t * 40, r = 18 + k * 10; g.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); g.lineTo(x + Math.cos(a + 0.4) * r, y + Math.sin(a + 0.4) * r); } g.stroke(); }
    });
    light(G, x, y, 110 + k * 60, c, 0.5 + k * 0.3);
  },
};

export default { eel, knight, wisp, jelly };
