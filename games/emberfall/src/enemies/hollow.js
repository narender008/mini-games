// Hollow Caves enemies: crawler (ember crawler, patrols ledges), bat (hangs,
// wakes, swoops in arcs), spitter (wall or floor vent lobbing ember globs),
// beetle (armoured: front swings clank; hurt from behind, by bolts, pogo or
// fire; charges when it sees you and is dazed if it hits a wall).
import { TILE } from '../config.js';
import { emit } from '../events.js';
import { lineOfSight } from '../physics.js';
import { spawnShot } from '../combat.js';
import { setState, floorBelow, ceilAbove, nearestSurface, patrol, walk, fly, blockedAhead, pc, playerDist, lob } from './base.js';
import { glow, additive, flame, body, light, warn, rgba, TAU, linear } from './paint.js';

const onFloor = (e, G, cx, cy) => { const f = floorBelow(G, cx, cy, 20) ?? cy + TILE / 2; e.x = cx - e.w / 2; e.y = f - e.h; e.home = cx; };

// ---------------------------------------------------------------- crawler
const crawler = {
  w: 44, h: 22, hp: 2, contact: 1, shards: 2, color: '#ff6a1a',
  place: onFloor,
  update(e, G, dt) { patrol(G, e, dt, 62); },
  draw(g, e, G) {
    const x = e.x + e.w / 2 - 4 * e.face, y = e.y + e.h, s = 0.85, c = '#ff6a1a';
    g.save(); g.translate(x, y); g.scale(e.face * s, s);
    g.strokeStyle = body(e, '#140c0c'); g.lineWidth = 3;
    for (let i = 0; i < 3; i++) { const k = Math.sin(e.t * 14 + i * 2) * 3; g.beginPath(); g.moveTo(-10 + i * 10, -8); g.lineTo(-14 + i * 10 + k, -2); g.lineTo(-17 + i * 11 + k, 0); g.stroke(); }
    g.fillStyle = body(e, '#1e1214');
    g.beginPath(); g.ellipse(0, -12, 22, 12, 0, Math.PI, TAU); g.lineTo(22, -8); g.lineTo(-22, -8); g.fill();
    g.beginPath(); g.ellipse(22, -10, 8, 7, 0, 0, TAU); g.fill();
    additive(g, () => {
      g.strokeStyle = rgba(c, 0.95); g.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 7, -23 + Math.abs(i) * 2); g.lineTo(i * 8.5, -10); g.stroke(); }
      glow(g, 0, -16, 34, c, 0.5 + 0.1 * Math.sin(e.t * 5));
      glow(g, 25, -12, 8, '#ff2a1a', 1); g.fillStyle = '#ffd0a0'; g.fillRect(24, -13, 3, 2);
    });
    g.restore();
    light(G, x, y - 14, 110, c, 0.55);
  },
};

// ---------------------------------------------------------------- bat
const bat = {
  w: 30, h: 22, hp: 1, contact: 1, shards: 1, color: '#ff3a3a',
  place(e, G, cx, cy) { const c = ceilAbove(G, cx, cy, 12) ?? cy - TILE / 2; e.x = cx - e.w / 2; e.y = c; setState(e, 'hang'); },
  init(e) { e.ax = 0; },
  update(e, G, dt) {
    const p = pc(G), cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    if (e.st === 'hang') {
      if (Math.abs(p.x - cx) < 230 && p.y > cy && p.y - cy < 600 && lineOfSight(G, cx, cy + 14, p.x, p.y)) { setState(e, 'wake'); emit('enemy-wake', { kind: 'bat', x: cx, y: cy }); }
      return;
    }
    if (e.st === 'wake') { e.vx = 0; e.vy = 140; fly(G, e, dt); if (e.stT > 0.4) setState(e, 'hover'); return; }
    if (e.st === 'hover') {   // circle up to a perch above the player
      e.side = e.side || (G.rng() < 0.5 ? -1 : 1);
      const tx = p.x - e.side * 150, ty = p.y - 150;
      e.vx += ((tx - cx) * 4 - e.vx) * Math.min(1, dt * 3); e.vy += ((ty - cy) * 4 - e.vy) * Math.min(1, dt * 3);
      e.vx = Math.max(-260, Math.min(260, e.vx)); e.vy = Math.max(-260, Math.min(260, e.vy)) + Math.sin(e.t * 9) * 30;
      fly(G, e, dt);
      e.face = p.x > cx ? 1 : -1;
      if (e.stT > 1.1 + e.seed * 0.6) setState(e, 'windup');
      return;
    }
    if (e.st === 'windup') { e.vx *= 0.9; e.vy = -30; fly(G, e, dt); if (e.stT > 0.35) { setState(e, 'swoop'); e.sw = { x0: cx, y0: cy, px: p.x, py: p.y + 10, x2: p.x + (p.x - cx), y2: cy }; } return; }
    if (e.st === 'swoop') {   // quadratic arc through where the player was
      const T = 0.85, k = Math.min(1, (e.stT + dt) / T), s = e.sw;
      const ctrlX = 2 * s.px - (s.x0 + s.x2) / 2, ctrlY = 2 * s.py - (s.y0 + s.y2) / 2;
      const nx = (1 - k) ** 2 * s.x0 + 2 * (1 - k) * k * ctrlX + k * k * s.x2, ny = (1 - k) ** 2 * s.y0 + 2 * (1 - k) * k * ctrlY + k * k * s.y2;
      e.vx = (nx - cx) / dt; e.vy = (ny - cy) / dt; fly(G, e, dt);
      e.face = e.vx > 0 ? 1 : -1;
      if (k >= 1 || e.hitWall || e.onGround) { e.side = -e.side; setState(e, 'hover'); }
    }
  },
  draw(g, e, G) {
    const x = e.x + e.w / 2, y = e.y + 4, hang = e.st === 'hang';
    g.save(); g.translate(x, y);
    const c = body(e, '#0d0a14');
    if (hang) {   // folded, upside down
      g.fillStyle = c; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-10, 6, -6, 18); g.quadraticCurveTo(0, 24, 6, 18); g.quadraticCurveTo(10, 6, 0, 0); g.fill();
      g.fillRect(-1, -4, 2, 5);
      additive(g, () => { g.fillStyle = '#ff3a3a'; g.fillRect(-3, 13, 2, 2); g.fillRect(1, 13, 2, 2); glow(g, 0, 14, 7, '#ff2a2a', 0.5 + 0.3 * Math.sin(e.t * 2)); });
    } else {
      const w = Math.sin(e.t * (e.st === 'swoop' ? 30 : 20)) * 9, s = 1.1;
      g.scale(s, s);
      g.fillStyle = c;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-12, -6 + w, -26, -2 + w); g.quadraticCurveTo(-20, 2, -18, 6); g.quadraticCurveTo(-12, 2, -8, 6); g.quadraticCurveTo(-5, 3, 0, 6);
      g.quadraticCurveTo(5, 3, 8, 6); g.quadraticCurveTo(12, 2, 18, 6); g.quadraticCurveTo(20, 2, 26, -2 + w); g.quadraticCurveTo(12, -6 + w, 0, 0); g.fill();
      g.beginPath(); g.ellipse(0, 2, 5, 6, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-4, -2); g.lineTo(-5, -8); g.lineTo(-1, -3); g.moveTo(4, -2); g.lineTo(5, -8); g.lineTo(1, -3); g.fill();
      const hot = e.st === 'windup' ? 1 : 0.8;
      additive(g, () => { g.fillStyle = '#ff3a3a'; g.fillRect(-3, 0, 2, 2); g.fillRect(1, 0, 2, 2); glow(g, 0, 1, 9 + hot * 6, '#ff2a2a', hot); });
      if (e.st === 'windup') warn(g, 0, 2, 22, '#ff3a3a', e.stT / 0.35, e.t);
    }
    g.restore();
    light(G, x, y + 6, 50, '#ff2a2a', 0.35);
  },
};

// ---------------------------------------------------------------- spitter
const NORM = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };   // the way the surface faces
const spitter = {
  w: 36, h: 36, hp: 3, contact: 1, shards: 3, color: '#ff8a2a', heavy: true,
  place(e, G, cx, cy) {
    const s = nearestSurface(G, cx, cy); e.n = s.n; e.ang = NORM[s.n];
    e.x = s.x + Math.cos(e.ang) * e.h / 2 - e.w / 2; e.y = s.y + Math.sin(e.ang) * e.h / 2 - e.h / 2;
    e.cool = 1 + e.seed;
  },
  update(e, G, dt) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, mx = cx + Math.cos(e.ang) * 14, my = cy + Math.sin(e.ang) * 14, p = pc(G);
    if (e.st === 'idle') {
      e.cool -= dt;
      if (e.cool <= 0 && playerDist(G, e) < 560 && lineOfSight(G, mx, my, p.x, p.y)) setState(e, 'windup');
    } else if (e.st === 'windup' && e.stT > 0.65) {
      const v = lob(mx, my, p.x, p.y + 10, 900, 380);
      // wall vents can't spit into their own wall
      if (e.n === 'right') v.vx = Math.max(60, v.vx); if (e.n === 'left') v.vx = Math.min(-60, v.vx); if (e.n === 'down') v.vy = Math.max(40, v.vy);
      spawnShot(G, { kind: 'glob', x: mx, y: my, vx: v.vx, vy: v.vy, gravity: 900, r: 8, life: 3, breakable: true });
      emit('enemy-shoot', { kind: 'spitter', x: mx, y: my });
      e.cool = 2.2 + G.rng() * 0.6; setState(e, 'idle');
    }
  },
  draw(g, e, G) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, k = e.st === 'windup' ? e.stT / 0.65 : 0, sw = 1 + k * 0.18 + Math.sin(e.t * 3) * 0.03;
    g.save(); g.translate(cx - Math.cos(e.ang) * 6, cy - Math.sin(e.ang) * 6); g.rotate(e.ang + Math.PI / 2); g.scale(sw * 1.35, (2 - sw) * 1.35);
    g.fillStyle = body(e, '#22161a');
    g.beginPath(); g.moveTo(-20, 18); g.quadraticCurveTo(-22, -4, -9, -14); g.lineTo(-5, -20); g.lineTo(5, -20); g.lineTo(9, -14); g.quadraticCurveTo(22, -4, 20, 18); g.closePath(); g.fill();
    g.fillStyle = body(e, '#3a2a24');
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(-10 + i * 10, 6 - (i % 2) * 6, 5, 3, 0.4, 0, TAU); g.fill(); }
    additive(g, () => {
      g.strokeStyle = rgba('#ff6a1a', 0.7 + k * 0.3); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-12, 14); g.lineTo(-6, 2); g.lineTo(-8, -8); g.moveTo(11, 15); g.lineTo(6, 4); g.lineTo(7, -10); g.stroke();
      glow(g, 0, -18, 14 + k * 18, '#ff8a2a', 0.7 + k * 0.3); glow(g, 0, -18, 5 + k * 5, '#ffffff', 0.6 + k * 0.4);
      if (k > 0) flame(g, 0, -18, 6 + k * 10, '#ffb347', k);
    });
    g.restore();
    light(G, cx + Math.cos(e.ang) * 16, cy + Math.sin(e.ang) * 16, 90 + k * 60, '#ff8a2a', 0.5 + k * 0.3);
  },
};

// ---------------------------------------------------------------- beetle
const beetle = {
  w: 56, h: 32, hp: 3, contact: 1, shards: 4, color: '#ffb347', heavy: true,
  place: onFloor,
  guard(e, G, dmg, info) {   // the shell turns front swings unless it is dazed
    if (info.src !== 'swing' || info.dir === 'down' || e.st === 'stun') return dmg;
    const side = Math.sign((info.fromX ?? 0) - (e.x + e.w / 2)) || 1;
    if (side === e.face) return false;
    return dmg;
  },
  update(e, G, dt) {
    const p = pc(G), cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    if (e.st === 'idle') {
      patrol(G, e, dt, 46);
      const dx = p.x - cx;
      if (Math.abs(dx) < 400 && Math.abs(p.y - cy) < 70 && Math.sign(dx) === e.face && lineOfSight(G, cx, cy - 6, p.x, p.y)) { setState(e, 'windup'); emit('enemy-wake', { kind: 'beetle', x: cx, y: cy }); }
    } else if (e.st === 'windup') {
      walk(G, e, dt, 0);
      if (e.stT > 0.6) setState(e, 'charge');
    } else if (e.st === 'charge') {
      if (blockedAhead(G, e, e.face) && !e.hitWall) { setState(e, 'skid'); return; }
      walk(G, e, dt, e.face * 400);
      if (e.hitWall) { setState(e, 'stun'); emit('shake', { amp: 6, t: 0.25 }); emit('hit', { x: cx + e.face * 30, y: cy, dmg: 0, target: 'wall' }); }
      else if (e.stT > 1.5) setState(e, 'skid');
    } else if (e.st === 'skid') {
      walk(G, e, dt, e.face * 400 * Math.max(0, 1 - e.stT / 0.35));
      if (e.stT > 0.5) { e.face = p.x > cx ? 1 : -1; setState(e, 'idle'); }
    } else if (e.st === 'stun') {
      walk(G, e, dt, 0);
      if (e.stT > 1.3) { e.face = -e.face; setState(e, 'idle'); }
    }
  },
  draw(g, e, G) {
    const x = e.x + e.w / 2, y = e.y + e.h, f = e.face, st = e.st;
    const hot = st === 'charge' ? 1 : st === 'windup' ? e.stT / 0.6 : 0.3;
    const shake = st === 'windup' ? Math.sin(e.t * 60) * 1.5 : st === 'stun' ? Math.sin(e.t * 25) * 2 : 0;
    g.save(); g.translate(x + shake, y); g.scale(f, 1);
    // legs
    g.strokeStyle = body(e, '#140c0c'); g.lineWidth = 3;
    const sp = st === 'charge' ? 30 : st === 'stun' ? 0 : 10;
    for (let i = 0; i < 3; i++) { const k = Math.sin(e.t * sp + i * 2.1) * 4; g.beginPath(); g.moveTo(-14 + i * 12, -10); g.lineTo(-18 + i * 12 + k, -3); g.lineTo(-20 + i * 13 + k, 0); g.stroke(); }
    // head and horn
    g.fillStyle = body(e, '#1a1012');
    g.beginPath(); g.ellipse(24, -12, 10, 8, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(28, -18); g.quadraticCurveTo(42, -26, 44, -40); g.quadraticCurveTo(38, -26, 32, -12); g.fill();
    // shell
    g.fillStyle = linear(g, 0, -36, 0, -6, [body(e, '#4a3a3a'), body(e, '#2a1c1e'), body(e, '#120a0c')]);
    g.beginPath(); g.moveTo(-30, -8); g.bezierCurveTo(-32, -34, 20, -42, 28, -12); g.lineTo(26, -6); g.closePath(); g.fill();
    g.strokeStyle = rgba('#8a7a70', 0.6); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-22, -26); g.quadraticCurveTo(0, -36, 18, -26); g.stroke();
    additive(g, () => {
      g.strokeStyle = rgba('#ff8a2a', 0.5 + hot * 0.5); g.lineWidth = 2;
      g.beginPath(); g.moveTo(-2, -36); g.quadraticCurveTo(0, -20, -2, -8); g.moveTo(-18, -28); g.lineTo(-22, -10); g.moveTo(14, -30); g.lineTo(18, -12); g.stroke();
      glow(g, 0, -20, 30 + hot * 20, '#ff6a1a', 0.25 + hot * 0.4);
      glow(g, 30, -14, 6, '#ffd27a', 0.9); g.fillStyle = '#fff2c0'; g.fillRect(29, -15, 3, 2);
      if (st === 'stun') for (let i = 0; i < 3; i++) { const a = e.t * 5 + i * 2.1; glow(g, 20 + Math.cos(a) * 14, -46 + Math.sin(a) * 4, 5, '#ffd27a', 0.9); }
      if (e.clank > 0) glow(g, 36, -20, 30, '#ffffff', e.clank * 3);
    });
    g.restore();
    if (st === 'windup') { g.fillStyle = rgba('#d8c8b8', 0.4); for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x - f * (30 + i * 8), y - 4 - ((e.stT * 60 + i * 9) % 18), 3 + i, 0, TAU); g.fill(); } }
    light(G, x, y - 22, 90 + hot * 60, '#ff6a1a', 0.35 + hot * 0.3);
  },
};

export default { crawler, bat, spitter, beetle };
