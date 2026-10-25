// Emberfall effects: cosmetic particles in G.fx (room px), screen shake and
// flash. Everything reacts to events (events.js); nothing here changes the
// outcome, so Math.random is fine. Others can call burst(G, x, y, opts).
//   Particle { k: kind, x, y, vx, vy, life, max, s (size), c (colour), g (gravity), drag, amb? }
//   kinds that glow (drawn after the darkness by lighting.js through drawFxGlow):
//     dot (mote/spark), ember (streak), ring (shockwave), hud (a shard flying to the counter)
//   kinds lit by the scene (drawn by drawFx in the world pass):
//     dust (soft puff), chunk (rock debris), drop (water), bubble, drip (falls until it hits something)
//   light: no picture, pushes a fading light into G.lights.
// Ambient particles per biome (dust, spores, motes, the Core's ember storm),
// drips from ceilings, lava bubbles and the wanderer's trails are spawned in updateFx.
import { W, H, TILE } from '../config.js';
import { on } from '../events.js';
import { rgba } from '../util.js';
import { solidAt, tileAtPx } from '../physics.js';
import { T } from '../world/tiles.js';
import { glow, glowSprite, additive, TAU } from './paint.js';
import { pal } from './biomes.js';
import { terrainInfo } from './terrain.js';
import { ABILITY_COLORS } from './paint.js';

const pending = [];
let curG = null;
const shakeS = { amp: 0, t: 0, life: 1 };
const flashS = { c: '#ffffff', a: 0 };
export const shakeAmount = () => (shakeS.t > 0 ? shakeS.amp * (shakeS.t / shakeS.life) : 0);
export const flashState = () => flashS;
export function shake(amp, t = 0.35) { if (amp >= shakeAmount()) { shakeS.amp = amp; shakeS.t = shakeS.life = t; } }
export function flash(c = '#ffffff', a = 0.4) { if (a >= flashS.a) { flashS.c = c; flashS.a = a; } }

const R = Math.random, rr = (a, b) => a + (b - a) * R();
function add(p) { pending.push(p); return p; }
const P = (k, x, y, o) => ({ k, x, y, vx: 0, vy: 0, life: 1, max: 1, s: 2, c: '#ffb347', g: 0, drag: 0, ...o });

// A spray of particles. opts: { n, kind, c (colour or list), speed, spread (rad), angle, life, size, g, drag, up, light }
export function burst(G, x, y, o = {}) {
  const n = o.n ?? 16, cols = Array.isArray(o.c) ? o.c : [o.c || '#ffb347'];
  for (let i = 0; i < n; i++) {
    const a = (o.angle ?? -Math.PI / 2) + (R() - 0.5) * (o.spread ?? TAU), sp = (o.speed ?? 220) * (0.3 + R() * 0.9);
    const life = (o.life ?? 0.7) * (0.6 + R() * 0.7);
    add(P(o.kind || 'ember', x + (R() - 0.5) * (o.r || 0), y + (R() - 0.5) * (o.r || 0), {
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, s: (o.size ?? 2) * (0.6 + R() * 0.8),
      c: cols[(R() * cols.length) | 0], g: o.g ?? 300, drag: o.drag ?? 1.5, rot: R() * TAU, vr: (R() - 0.5) * 12,
    }));
  }
  if (o.light) add(P('light', x, y, { life: o.light.t || 0.3, max: o.light.t || 0.3, s: o.light.r || 160, c: o.light.c || cols[0] }));
}
const ring = (x, y, c, r = 60, life = 0.4, w = 3) => add(P('ring', x, y, { c, s: r, life, max: life, w }));
const dust = (x, y, n = 6, c = '#a89080', sp = 60) => burst(null, x, y, { kind: 'dust', n, c, speed: sp, spread: Math.PI * 0.9, angle: -Math.PI / 2, life: 0.55, size: 7, g: -20, drag: 3 });
const chunks = (x, y, n, c) => burst(null, x, y, { kind: 'chunk', n, c, speed: 260, life: 1.1, size: 5, g: 1400, drag: 0.4, r: 24 });

// ------------------------------------------------------------ events
on('jump', ({ x, y, double }) => {
  if (x == null) return;
  if (double) { ring(x, y, '#7ad8ff', 34, 0.3, 2); burst(null, x, y, { kind: 'dot', n: 10, c: ['#7ad8ff', '#ffffff'], speed: 120, spread: Math.PI, angle: Math.PI / 2, life: 0.4, g: 0, size: 1.6 }); }
  else dust(x, y, 5, undefined, 50);
});
on('land', ({ x, y, v = 0 }) => { if (x == null) return; dust(x, y, Math.min(14, 3 + v / 80), undefined, 40 + v * 0.08); if (v > 850) shake(3, 0.2); });
on('dash', ({ x, y, dir = 1 }) => {
  if (x == null) return;
  burst(null, x, y, { kind: 'ember', n: 14, c: ['#6ef2ff', '#c8ffff'], speed: 320, angle: dir > 0 ? Math.PI : 0, spread: 0.5, life: 0.35, g: 0, drag: 4, size: 1.6 });
  dust(x, y + 20, 4, '#8a9aa8', 50);
});
on('wall-jump', ({ x, y }) => { if (x != null) dust(x, y, 5, undefined, 60); });
on('swing', ({ x, y, dir = 1 }) => { if (x != null) burst(null, x, y, { kind: 'ember', n: 6, c: ['#ffd36a', '#ff8a2a'], speed: 200, angle: dir > 0 ? 0 : Math.PI, spread: 1.2, life: 0.3, g: 200, size: 1.6 }); });
on('bolt', ({ x, y }) => { if (x != null) burst(null, x, y, { n: 8, c: ['#ffb347', '#ff4a1c'], speed: 160, life: 0.35, light: { r: 120, t: 0.15 } }); });
on('hook', ({ x, y }) => { if (x != null) burst(null, x, y, { kind: 'dot', n: 10, c: ['#ffd36a', '#ffffff'], speed: 140, life: 0.35, g: 0, size: 1.6, light: { r: 120, t: 0.2, c: '#ffd36a' } }); });
on('hook-pull', ({ x, y }) => { if (x != null) ring(x, y, '#ffd36a', 40, 0.3, 2); });
on('fire-form', ({ on: lit }) => {
  const p = curG?.player; if (!p) return;
  const x = p.x + p.w / 2, y = p.y + p.h / 2;
  if (lit) { burst(null, x, y, { n: 30, c: ['#ffd27a', '#ff6a1a', '#ff4a1c'], speed: 260, life: 0.6, light: { r: 300, t: 0.4, c: '#ff8a2a' } }); ring(x, y, '#ff8a2a', 90, 0.45, 4); flash('#ff6a1a', 0.18); }
  else burst(null, x, y, { kind: 'dust', n: 8, c: '#3a3036', speed: 60, life: 0.8, size: 8, g: -40, drag: 2 });
});
on('splash', ({ x, y, size = 1 }) => {
  if (x == null) return;
  const c = curG ? pal(curG.room?.biome).waterHi : '#9ad8ff';
  burst(null, x, y, { kind: 'drop', n: Math.round(8 + size * 10), c: [c, '#ffffff'], speed: 160 + size * 120, angle: -Math.PI / 2, spread: 1.6, life: 0.7, g: 1200, drag: 0.5, size: 1.6 });
  ring(x, y, c, 30 + size * 20, 0.4, 1.5);
});
on('crumble', ({ x, y }) => { if (x != null) { chunks(x, y, 6, '#4a3a40'); dust(x, y, 6); } });
on('break', ({ x, y }) => {
  if (x == null) return;
  chunks(x, y, 16, '#3a2830');
  burst(null, x, y, { n: 24, c: ['#ffd27a', '#ff8a2a', '#ffffff'], speed: 380, life: 0.6, g: 500, r: 20, light: { r: 260, t: 0.35, c: '#ffb347' } });
  dust(x, y, 10, '#6a5a60', 90); shake(7, 0.35); flash('#ffb347', 0.15);
});
on('burn', ({ x, y }) => {
  if (x == null) return;
  burst(null, x, y, { n: 26, c: ['#ffd27a', '#ff6a1a', '#ff3a1a'], speed: 200, angle: -Math.PI / 2, spread: 1.6, life: 0.9, g: -200, r: 30, light: { r: 200, t: 0.5, c: '#ff6a1a' } });
  burst(null, x, y, { kind: 'dust', n: 8, c: '#2a1a1a', speed: 50, life: 1.2, size: 10, g: -60, drag: 1.5, r: 24 });
});
on('hit', ({ x, y, target }) => {
  if (x == null) return;
  burst(null, x, y, { n: 10, c: target === 'player' ? ['#ff5a4a', '#ffffff'] : ['#ffffff', '#ffd36a', '#ff8a2a'], speed: 300, life: 0.3, g: 400, drag: 3, size: 1.6, light: { r: 110, t: 0.12, c: '#ffd36a' } });
});
on('enemy-die', ({ x, y }) => {
  if (x == null) return;
  burst(null, x, y, { n: 26, c: ['#ffd27a', '#ff8a2a', '#ff4a1c'], speed: 260, life: 0.8, g: 200, r: 16, light: { r: 200, t: 0.3 } });
  burst(null, x, y, { kind: 'dust', n: 7, c: '#2a2030', speed: 60, life: 0.9, size: 9, g: -30, drag: 2, r: 20 });
  ring(x, y, '#ffb347', 50, 0.35, 2); shake(2, 0.15);
});
on('player-hit', ({ x, y }) => {
  const p = curG?.player; const px = x ?? (p ? p.x + p.w / 2 : 0), py = y ?? (p ? p.y + 20 : 0);
  burst(null, px, py, { n: 18, c: ['#ff4a3a', '#ffd0a0', '#ffffff'], speed: 280, life: 0.45, g: 300, size: 1.8 });
  shake(8, 0.3); flash('#ff2a1a', 0.22);
});
on('player-die', ({ x, y }) => {
  const p = curG?.player; const px = (x ?? p?.x ?? 0) + (p?.w ?? 24) / 2, py = (y ?? p?.y ?? 0) + (p?.h ?? 56) / 2;
  burst(null, px, py, { n: 60, c: ['#ffd27a', '#ff8a2a', '#ff4a1c', '#ffffff'], speed: 340, life: 1.4, g: -60, drag: 1.2, size: 2.2, light: { r: 320, t: 1, c: '#ff8a2a' } });
  ring(px, py, '#ffb347', 140, 0.7, 4); shake(10, 0.5); flash('#ff6a1a', 0.35);
});
on('pickup', ({ kind, id, x, y }) => {
  if (x == null) return;
  const c = kind === 'ability' ? ABILITY_COLORS[id] || '#ffd36a' : kind === 'vessel' ? '#ff8a2a' : kind === 'lore' ? '#ffe9b8' : '#5ae8ff';
  const big = kind === 'ability' || kind === 'vessel';
  burst(null, x, y, { kind: 'dot', n: big ? 50 : 14, c: [c, '#ffffff'], speed: big ? 320 : 160, life: big ? 1.2 : 0.6, g: -40, drag: 1.6, size: 2, light: { r: big ? 420 : 150, t: big ? 1 : 0.3, c } });
  if (big) { ring(x, y, c, 160, 0.8, 4); ring(x, y, '#ffffff', 90, 0.5, 2); flash(c, 0.3); shake(4, 0.3); }
});
on('shard', ({ n = 1, x, y }) => {
  if (x == null) return;
  for (let i = 0, m = Math.min(12, Math.max(1, n)); i < m; i++) {
    const a = R() * TAU, sp = 120 + R() * 160, life = 2.2;
    add(P('hud', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life, max: life, s: 3, c: '#5ae8ff', delay: i * 0.03 }));
  }
});
on('save', () => {
  const p = curG?.player; if (!p) return;
  const x = p.x + p.w / 2, y = p.y + p.h;
  burst(null, x, y - 20, { kind: 'dot', n: 40, c: ['#ffd27a', '#ff8a2a', '#ffffff'], speed: 120, angle: -Math.PI / 2, spread: 1.2, life: 1.6, g: -120, drag: 0.8, size: 1.8, r: 40, light: { r: 360, t: 0.9, c: '#ffb347' } });
  ring(x, y - 30, '#ffd27a', 120, 0.7, 3); flash('#ffb347', 0.18);
});
on('respawn', () => {
  const p = curG?.player; if (!p) return;
  burst(null, p.x + p.w / 2, p.y + p.h / 2, { kind: 'dot', n: 30, c: ['#ffd27a', '#ffffff'], speed: 200, life: 0.8, g: 0, size: 1.8, light: { r: 260, t: 0.6 } });
});
on('enemy-wake', ({ x, y }) => { if (x != null) { ring(x, y, '#ff5a4a', 26, 0.35, 1.5); burst(null, x, y, { kind: 'dot', n: 5, c: '#ff8a6a', speed: 70, life: 0.4, g: 0, size: 1.4 }); } });
on('enemy-shoot', ({ x, y }) => { if (x != null) burst(null, x, y, { kind: 'dot', n: 6, c: ['#ffd27a', '#ff6a1a'], speed: 90, life: 0.25, g: 0, size: 1.6, light: { r: 90, t: 0.15, c: '#ff8a2a' } }); });
on('shot-die', ({ x, y, side }) => { if (x != null) burst(null, x, y, { n: 7, c: side === 'player' ? ['#ffd27a', '#ffffff'] : ['#ff8a5a', '#ffd0a0'], speed: 150, life: 0.3, g: 200, size: 1.4 }); });
on('slam', ({ x, y }) => {
  if (x == null) return;
  dust(x, y, 14, '#6a5a60', 160); chunks(x, y - 6, 8, '#3a2830');
  ring(x, y, '#ffb347', 120, 0.45, 3);
});
on('bell', ({ x, y }) => { if (x != null) { ring(x, y, '#7affea', 220, 0.9, 4); ring(x, y, '#ffffff', 120, 0.6, 2); add(P('light', x, y, { life: 0.6, max: 0.6, s: 360, c: '#7affea' })); } });
on('boss-tell', () => {
  // a warning flare on the boss so the tell reads even at the screen edge
  const b = curG?.boss; if (!b || b.x == null) return;
  const x = b.x + (b.w || 0) / 2, y = b.y + (b.h || 0) / 2;
  ring(x, y, '#ff6a4a', 110, 0.5, 3); add(P('light', x, y, { life: 0.5, max: 0.5, s: 260, c: '#ff6a4a' }));
});
on('boss-attack', () => shake(3, 0.2));
on('boss-roar', () => shake(10, 0.8));
on('boss-phase', () => { shake(8, 0.5); flash('#ffffff', 0.25); });
on('boss-dead', () => { shake(14, 1.2); flash('#ffffff', 0.55); });
on('shake', ({ amp = 6, t = 0.35 }) => shake(amp, t));
on('flash', ({ color = '#ffffff', a = 0.4 }) => flash(color, a));
on('won', () => flash('#ffe9b8', 0.6));
on('room', () => { shakeS.t = 0; if (curG) curG.fx = []; pending.length = 0; });

// ------------------------------------------------------------ update
export function updateFx(G, dt) {
  curG = G;
  if (!G.fx) G.fx = [];
  const fx = G.fx, max = G.quality === 'low' ? 260 : 800;
  while (pending.length) { const p = pending.shift(); if (fx.length < max) fx.push(p); }
  if (shakeS.t > 0) shakeS.t = Math.max(0, shakeS.t - dt);
  if (flashS.a > 0) flashS.a = Math.max(0, flashS.a - dt * 2.2);
  const r = G.room;
  if (!r || (G.scene !== 'play' && G.scene !== 'dead' && G.scene !== 'won')) return;
  ambient(G, dt, fx, max);
  const cx = G.cam.x, cy = G.cam.y;
  let j = 0;
  for (let i = 0; i < fx.length; i++) {
    const p = fx[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    if (p.delay > 0) { p.delay -= dt; fx[j++] = p; continue; }
    if (p.k === 'hud') {
      // burst out, then home in on the shard counter (top-left of the HUD)
      const age = p.max - p.life;
      if (age > 0.35) {
        const tx = cx + 36, ty = cy + 94, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        if (d < 18) { p.life = 0; continue; }
        const sp = 300 + age * 1400;
        p.vx += (dx / d * sp - p.vx) * Math.min(1, dt * 8); p.vy += (dy / d * sp - p.vy) * Math.min(1, dt * 8);
      } else { p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; }
    } else {
      p.vy += p.g * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.rot != null) p.rot += (p.vr || 0) * dt;
    if (p.k === 'drip' || p.k === 'drop' || p.k === 'chunk') {
      const c = tileAtPx(G, p.x, p.y);
      if (c === T.SOLID || c === T.CRUMBLE || c === T.WATER || c === T.LAVA || c === T.ONEWAY && p.vy > 0 && (p.y % TILE) < 8) {
        if (p.k === 'drip') { burst(null, p.x, p.y - 2, { kind: 'drop', n: 4, c: p.c, speed: 90, angle: -Math.PI / 2, spread: 1.8, life: 0.35, g: 900, size: 1.2 }); continue; }
        if (p.k === 'chunk') { if (p.vy > 0) { p.y -= p.vy * dt; p.vy *= -0.3; p.vx *= 0.6; if (Math.abs(p.vy) < 40) { p.vy = 0; p.g = 0; p.vx = 0; } } }
        else continue;
      }
    }
    if (p.amb && (p.x < cx - 200 || p.x > cx + W + 200 || p.y < cy - 200 || p.y > cy + H + 200)) continue;
    fx[j++] = p;
  }
  fx.length = j;
}

// Ambient particles around the view, by biome, and the wanderer's trails.
function ambient(G, dt, fx, max) {
  const r = G.room, b = r.biome, c = G.cam, low = G.quality === 'low';
  let n = 0; for (const p of fx) if (p.amb) n++;
  const target = ({ hollow: 34, thicket: 80, cloister: 44, core: 130 }[b] || 30) * (low ? 0.4 : 1);
  for (let i = 0; i < 4 && n < target && fx.length < max; i++, n++) {
    const x = c.x - 60 + R() * (W + 120), y = c.y - 60 + R() * (H + 120);
    if (solidAt(G, x, y)) continue;
    let p;
    if (b === 'core') p = P('ember', x, y, { vx: rr(-40, 60), vy: rr(-160, -60), life: rr(2, 5), c: R() < 0.5 ? '#ffb347' : '#ff4a1c', s: rr(1, 2.6) });
    else if (b === 'thicket') p = P('dot', x, y, { vx: rr(-10, 10), vy: rr(-22, -6), life: rr(3, 7), c: R() < 0.6 ? '#9affea' : '#ff8ae0', s: rr(0.8, 1.8), wob: R() * 6 });
    else if (b === 'cloister') p = P('dot', x, y, { vx: rr(-8, 8), vy: rr(-12, 6), life: rr(3, 7), c: '#e0fff4', s: rr(0.6, 1.4), wob: R() * 6 });
    else p = P('dot', x, y, { vx: rr(-12, 12), vy: rr(-8, 8), life: rr(3, 7), c: R() < 0.7 ? '#c8d8ff' : '#ffb57a', s: rr(0.6, 1.3), wob: R() * 6 });
    p.max = p.life; p.amb = true; p.fade = true;
    fx.push(p);
  }
  const ti = terrainInfo();
  if (ti.room !== r) return;
  // drips from ceilings
  if ((b === 'hollow' || b === 'cloister') && R() < dt * 2.5 && ti.ceils.length) {
    const q = ti.ceils[(R() * ti.ceils.length) | 0];
    if (q.x > c.x && q.x < c.x + W && q.y > c.y && q.y < c.y + H) fx.push(P('drip', q.x, q.y + 2, { life: 3, max: 3, g: 1100, c: pal(b).waterHi, s: 1.4 }));
  }
  // lava bubbles and sparks
  for (const s of ti.lavaSurf) {
    if (s.x > c.x + W || s.x + s.w < c.x || s.y < c.y || s.y > c.y + H + 20) continue;
    if (R() < dt * s.w / 90) {
      const x = s.x + R() * s.w;
      fx.push(P('dot', x, s.y, { vx: rr(-20, 20), vy: rr(-140, -60), g: 260, life: 0.7, max: 0.7, c: '#ffd27a', s: rr(1.4, 2.6) }));
      if (R() < 0.3) fx.push(P('ring', x, s.y + 2, { c: '#ffd27a', s: 10, life: 0.4, max: 0.4, w: 1.5, flat: true }));
    }
  }
  // the wanderer
  const p = G.player; if (!p || G.scene !== 'play') return;
  const fx0 = p.x + p.w / 2, fy = p.y + p.h;
  if (p.onGround && Math.abs(p.vx || 0) > 200 && R() < dt * 9) fx.push(P('dust', fx0 - Math.sign(p.vx) * 8, fy - 2, { vx: -p.vx * 0.1, vy: -20, life: 0.4, max: 0.4, c: '#a89080', s: 5, g: -20, drag: 2 }));
  if (p.state === 'wall' && R() < dt * 14) fx.push(P('dust', p.onWall > 0 ? p.x + p.w : p.x, fy - 10, { vx: -(p.onWall || 0) * 20, vy: -30, life: 0.4, max: 0.4, c: '#9cff6a', s: 4, g: 0, drag: 2 }));
  if (p.swimming && R() < dt * 4) fx.push(P('bubble', fx0 + (p.facing || 1) * 6, p.y + 14, { vy: -50, vx: rr(-10, 10), life: 1.6, max: 1.6, c: '#c8ffff', s: rr(1.5, 3.5), wob: R() * 6, g: -20 }));
  if (p.form === 'fire' && R() < dt * 40) fx.push(P('ember', fx0 + rr(-12, 12), p.y + rr(10, 50), { vx: rr(-30, 30) - (p.vx || 0) * 0.2, vy: rr(-200, -80), life: 0.5, max: 0.5, c: R() < 0.5 ? '#ffd27a' : '#ff4a1c', s: rr(1.2, 2.4), g: -100 }));
}

// ------------------------------------------------------------ drawing
// World pass (before the darkness): things lit by the scene.
export function drawFx(g, G) {
  curG = G;
  const fx = G.fx; if (!fx || !fx.length) return;
  for (const p of fx) {
    if (p.delay > 0) continue;
    const t = p.life / p.max;
    switch (p.k) {
      case 'dust': {
        const s = p.s * (1 + (1 - t) * 1.6);
        g.globalAlpha = 0.35 * t; g.drawImage(glowSprite(p.c), p.x - s, p.y - s, s * 2, s * 2); break;
      }
      case 'chunk': {
        g.globalAlpha = Math.min(1, t * 3); g.fillStyle = p.c;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.beginPath(); g.moveTo(-p.s, -p.s * 0.6); g.lineTo(p.s * 0.8, -p.s); g.lineTo(p.s, p.s * 0.5); g.lineTo(-p.s * 0.4, p.s); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,200,150,0.25)'; g.fillRect(-p.s * 0.6, -p.s * 0.7, p.s, 1.5); g.restore(); break;
      }
      case 'drop': case 'drip': {
        g.globalAlpha = 0.8 * Math.min(1, t * 3); g.strokeStyle = p.c; g.lineWidth = p.s; g.lineCap = 'round';
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.02, p.y - Math.max(3, p.vy * 0.02)); g.stroke(); break;
      }
      case 'bubble': {
        g.globalAlpha = 0.6 * Math.min(1, t * 2); g.strokeStyle = p.c; g.lineWidth = 1;
        g.beginPath(); g.arc(p.x + Math.sin(p.life * 6 + p.wob) * 2, p.y, p.s, 0, TAU); g.stroke(); break;
      }
      case 'light': G.lights.push({ x: p.x, y: p.y, r: p.s * (0.6 + 0.4 * t), c: p.c, a: 0.35 * t }); break;
    }
  }
  g.globalAlpha = 1;
}

// After the darkness (lighting.js, camera transform set): everything that glows.
export function drawFxGlow(g, G) {
  const fx = G.fx; if (!fx || !fx.length) return;
  additive(g, () => {
    g.lineCap = 'round';
    for (const p of fx) {
      if (p.delay > 0) continue;
      const t = p.life / p.max, a = p.fade ? Math.min(1, t * 3, (1 - t) * 4) : Math.min(1, t * 2.5);
      switch (p.k) {
        case 'dot': {
          const x = p.wob != null ? p.x + Math.sin(p.life * 1.7 + p.wob) * 6 : p.x;
          glow(g, x, p.y, p.s * 4.5, p.c, 0.6 * a);
          g.globalAlpha = 0.85 * a; g.fillStyle = '#ffffff'; g.fillRect(x - p.s * 0.45, p.y - p.s * 0.45, p.s * 0.9, p.s * 0.9); g.globalAlpha = 1; break;
        }
        case 'ember': {
          const sp = Math.hypot(p.vx, p.vy) || 1, len = Math.min(14, 3 + sp * 0.03);
          g.globalAlpha = 0.85 * a; g.strokeStyle = p.c; g.lineWidth = p.s;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx / sp * len, p.y - p.vy / sp * len); g.stroke(); g.globalAlpha = 1;
          glow(g, p.x, p.y, p.s * 4, p.c, 0.35 * a); break;
        }
        case 'ring': {
          const rad = p.s * (1 - t * t) + 2;
          g.globalAlpha = 0.8 * t; g.strokeStyle = p.c; g.lineWidth = (p.w || 2) * t + 0.5;
          g.beginPath(); if (p.flat) g.ellipse(p.x, p.y, rad, rad * 0.3, 0, 0, TAU); else g.arc(p.x, p.y, rad, 0, TAU); g.stroke(); g.globalAlpha = 1; break;
        }
        case 'hud': {
          glow(g, p.x, p.y, 12, p.c, 0.8);
          g.fillStyle = '#c8ffff'; g.beginPath(); g.moveTo(p.x, p.y - 4); g.lineTo(p.x + 2.6, p.y); g.lineTo(p.x, p.y + 4); g.lineTo(p.x - 2.6, p.y); g.closePath(); g.fill(); break;
        }
      }
    }
  });
}
