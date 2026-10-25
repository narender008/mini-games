// Lumen Thicket enemies: moth (luminous, flutters round its home, dives at
// you), shambler (mushroom walker; dies in a spore cloud that stings for a
// moment), sporepod (rooted on a floor or ceiling, puffs slow homing spores),
// thornvine (hangs from the ceiling, lashes down when you pass beneath).
import { TILE } from '../config.js';
import { emit } from '../events.js';
import { lineOfSight } from '../physics.js';
import { spawnShot } from '../combat.js';
import { setState, floorBelow, ceilAbove, patrol, walk, fly, pc, playerDist } from './base.js';
import { glow, additive, mushroom, body, light, warn, rgba, mixHex, TAU, cached } from './paint.js';

const MOTH_C = ['#ff5ad8', '#5af0d0', '#b07aff'];
const CAP_C = ['#ff3fb4', '#3ff0c8', '#ffd23f'];

// ---------------------------------------------------------------- moth
const moth = {
  w: 34, h: 30, hp: 2, contact: 1, shards: 2, color: '#ff5ad8',
  place(e, G, cx, cy) { e.x = cx - e.w / 2; e.y = cy - e.h / 2; e.hx = cx; e.hy = cy; e.c = MOTH_C[(e.seed * 3) | 0]; e.cool = 1; },
  update(e, G, dt) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, p = pc(G);
    const seek = (tx, ty, sp) => { const d = Math.hypot(tx - cx, ty - cy) || 1, v = Math.min(sp, d * 5); e.vx = (tx - cx) / d * v; e.vy = (ty - cy) / d * v; fly(G, e, dt); };
    if (e.st === 'idle') {
      const a = e.t * 1.3 + e.seed * 9;
      seek(e.hx + Math.cos(a) * 60, e.hy + Math.sin(a * 2) * 26, 140);
      e.cool -= dt;
      if (e.cool <= 0 && playerDist(G, e) < 330 && lineOfSight(G, cx, cy, p.x, p.y)) setState(e, 'windup');
    } else if (e.st === 'windup') {
      e.vx *= 0.85; e.vy = -20; fly(G, e, dt);
      if (e.stT > 0.55) { const d = Math.hypot(p.x - cx, p.y - cy) || 1; e.dvx = (p.x - cx) / d * 440; e.dvy = (p.y - cy) / d * 440; setState(e, 'dive'); }
    } else if (e.st === 'dive') {
      e.vx = e.dvx; e.vy = e.dvy; fly(G, e, dt);
      if (e.stT > 0.75 || e.hitWall || e.hitCeil || e.onGround) setState(e, 'back');
    } else if (e.st === 'back') {
      seek(e.hx, e.hy, 170);
      if (Math.hypot(e.hx - cx, e.hy - cy) < 20 || e.stT > 2.5) { e.cool = 1.2; setState(e, 'idle'); }
    }
  },
  draw(g, e, G) {
    const x = e.x + e.w / 2, y = e.y + e.h / 2, c = e.c, wind = e.st === 'windup' ? e.stT / 0.55 : 0;
    const flap = e.st === 'dive' ? 0.35 : 0.55 + 0.45 * Math.sin(e.t * (14 + wind * 20));
    g.save(); g.translate(x, y); g.scale(0.8, 0.8);
    additive(g, () => glow(g, 0, 0, 60 + wind * 30, c, 0.45 + wind * 0.4));
    for (const d of [-1, 1]) {
      g.save(); g.scale(flap, 1);
      const fc = body(e, c);
      g.fillStyle = cached(g, `moth${d}${fc}`, () => {
        const gr = g.createRadialGradient(d * 18, -6, 2, d * 18, -4, 26);
        gr.addColorStop(0, mixHex(fc, '#ffffff', 0.6)); gr.addColorStop(0.5, fc); gr.addColorStop(1, mixHex(fc, '#000000', 0.6));
        return gr;
      });
      g.beginPath(); g.moveTo(0, -2); g.bezierCurveTo(d * 16, -30, d * 40, -22, d * 34, -2); g.bezierCurveTo(d * 30, 8, d * 14, 6, 0, 2); g.fill();
      g.beginPath(); g.moveTo(0, 2); g.bezierCurveTo(d * 18, 6, d * 26, 22, d * 12, 24); g.bezierCurveTo(d * 4, 22, 0, 12, 0, 2); g.fill();
      additive(g, () => { g.fillStyle = rgba('#ffffff', 0.85); g.beginPath(); g.arc(d * 20, -10, 3.5, 0, TAU); g.fill(); glow(g, d * 20, -10, 10, '#ffffff', 0.6); });
      g.restore();
    }
    g.fillStyle = '#1a0f22'; g.beginPath(); g.ellipse(0, 4, 4, 14, 0, 0, TAU); g.fill();
    g.strokeStyle = '#1a0f22'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-1, -9); g.quadraticCurveTo(-6, -20, -12, -22); g.moveTo(1, -9); g.quadraticCurveTo(6, -20, 12, -22); g.stroke();
    if (wind) warn(g, 0, 0, 30, c, wind, e.t);
    g.restore();
    light(G, x, y, 150, c, 0.55 + wind * 0.3);
  },
};

// ---------------------------------------------------------------- shambler
const shambler = {
  w: 38, h: 58, hp: 3, contact: 1, shards: 3, color: '#d6ff5a',
  place(e, G, cx, cy) { const f = floorBelow(G, cx, cy, 20) ?? cy + TILE / 2; e.x = cx - e.w / 2; e.y = f - e.h; e.home = cx; e.cap = CAP_C[(e.seed * 3) | 0]; },
  update(e, G, dt) {
    const p = pc(G), cx = e.x + e.w / 2;
    const chase = Math.abs(p.x - cx) < 360 && Math.abs(p.y - (e.y + e.h / 2)) < 100;
    if (chase && Math.abs(p.x - cx) > 8) { const want = p.x > cx ? 1 : -1; if (want !== e.face) e.face = want; }
    e.chase = chase;
    patrol(G, e, dt, chase ? 78 : 34);
  },
  onDie(e, G) { spawnShot(G, { kind: 'cloud', x: e.x + e.w / 2, y: e.y + e.h * 0.4, r: 56, life: 1.8, arm: 0.35, pierce: true, ghost: true, dmg: 1, color: mixHex(e.cap, '#d6ff5a', 0.5) }); },
  draw(g, e, G) {
    const x = e.x + e.w / 2, y = e.y + e.h, s = 0.78, f = e.face, bob = Math.abs(Math.sin(e.t * (e.chase ? 9 : 5))) * 3;
    g.save(); g.translate(x, y - bob * 0.3); g.scale(f * s, s);
    g.fillStyle = body(e, '#20142a');
    g.beginPath(); g.moveTo(-16, 0); g.quadraticCurveTo(-20, -30, -10, -50); g.lineTo(12, -50); g.quadraticCurveTo(22, -30, 16, 0); g.closePath(); g.fill();
    g.strokeStyle = body(e, '#20142a'); g.lineWidth = 6; g.lineCap = 'round';
    const sw = Math.sin(e.t * 6) * 6;
    g.beginPath(); g.moveTo(10, -38); g.quadraticCurveTo(30, -30 + sw, 34, -12 + sw); g.moveTo(-10, -38); g.quadraticCurveTo(-24, -26 - sw, -22, -10 - sw); g.stroke();
    g.restore();
    mushroom(g, x + f * 2, y - 44 * s - bob, 6, 74 * s, { cap: body(e, e.cap), glowC: e.cap, stem: '#20142a', seed: e.seed });
    additive(g, () => { glow(g, x + f * 6 * s, y - 34 * s, 10, '#d6ff5a', 0.9); g.fillStyle = '#f6ffc8'; g.fillRect(x + f * 2 * s - 2, y - 36 * s, 3, 3); g.fillRect(x + f * 10 * s - 2, y - 36 * s, 3, 3); });
    light(G, x, y - 50, 130, e.cap, 0.5);
  },
};

// ---------------------------------------------------------------- sporepod
const sporepod = {
  w: 40, h: 38, hp: 2, contact: 1, shards: 2, color: '#c8ff5a', heavy: true,
  place(e, G, cx, cy) {
    const f = floorBelow(G, cx, cy, 2), c = f == null ? ceilAbove(G, cx, cy, 3) : null;
    e.hang = f == null && c != null;
    e.x = cx - e.w / 2; e.y = e.hang ? c : (f ?? floorBelow(G, cx, cy, 20) ?? cy + TILE / 2) - e.h;
    e.cool = 1.2 + e.seed * 1.5;
  },
  update(e, G, dt) {
    const cx = e.x + e.w / 2, my = e.hang ? e.y + e.h - 6 : e.y + 6, p = pc(G);
    if (e.st === 'idle') {
      e.cool -= dt;
      if (e.cool <= 0 && playerDist(G, e) < 470 && lineOfSight(G, cx, my, p.x, p.y)) setState(e, 'swell');
    } else if (e.st === 'swell' && e.stT > 0.7) {
      for (let i = -1; i <= 1; i++) {
        const a = (e.hang ? Math.PI / 2 : -Math.PI / 2) + i * 0.55;
        spawnShot(G, { kind: 'spore', x: cx, y: my, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, r: 7, life: 3.6, homing: 1.5, breakable: true, color: '#c8ff5a' });
      }
      emit('enemy-shoot', { kind: 'sporepod', x: cx, y: my });
      e.cool = 3 + G.rng(); setState(e, 'idle');
    }
  },
  draw(g, e, G) {
    const x = e.x + e.w / 2, k = e.st === 'swell' ? e.stT / 0.7 : 0, sw = 1 + k * 0.25 + Math.sin(e.t * 2.4) * 0.04;
    g.save(); g.translate(x, e.hang ? e.y : e.y + e.h); if (e.hang) g.scale(1, -1);
    g.strokeStyle = body(e, '#1a2a14'); g.lineWidth = 3;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 5, 0); g.quadraticCurveTo(i * 12, -6, i * 16, 2); g.stroke(); }
    g.scale(sw, 2 - sw);
    const fk = e.flash > 0 ? 1 : 0;
    g.fillStyle = cached(g, 'pod' + fk, () => {
      const gr = g.createRadialGradient(-6, -26, 2, 0, -18, 24);
      gr.addColorStop(0, fk ? '#f0f8e0' : '#7a9a3a'); gr.addColorStop(0.6, fk ? '#d8e8c8' : '#2e4420'); gr.addColorStop(1, fk ? '#c0c8b8' : '#121a0c');
      return gr;
    });
    g.beginPath(); g.moveTo(-8, 0); g.bezierCurveTo(-26, -6, -24, -36, 0, -36); g.bezierCurveTo(24, -36, 26, -6, 8, 0); g.closePath(); g.fill();
    additive(g, () => {
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.4, r = 12; glow(g, Math.cos(a) * r, -18 + Math.sin(a) * r * 0.8, 5 + k * 4, '#c8ff5a', 0.6 + k * 0.4); }
      glow(g, 0, -36, 8 + k * 16, '#e8ff9a', 0.5 + k * 0.5);
    });
    g.restore();
    light(G, x, e.y + e.h / 2, 110 + k * 50, '#c8ff5a', 0.45 + k * 0.3);
  },
};

// ---------------------------------------------------------------- thornvine
const thornvine = {
  w: 26, h: 46, hp: 2, contact: 1, shards: 2, color: '#e05aff', heavy: true,
  place(e, G, cx, cy) {
    const c = ceilAbove(G, cx, cy, 12) ?? cy - TILE / 2;
    e.x = cx - e.w / 2; e.y = c; e.top = c;
    const f = floorBelow(G, cx, c + 2, 20) ?? c + 360;
    e.maxLen = Math.max(80, Math.min(540, f - c - 4));   // reaches the floor below (up to 13 tiles) e.len = e.h = 46;
  },
  update(e, G, dt) {
    const p = G.player, cx = e.x + e.w / 2;
    e.y = e.top;
    if (e.st === 'idle') {
      e.len = 46;
      if (p && Math.abs(p.x + p.w / 2 - cx) < 70 && p.y + p.h > e.top && p.y < e.top + e.maxLen) setState(e, 'rustle');
    } else if (e.st === 'rustle') { if (e.stT > 0.45) setState(e, 'lash'); }
    else if (e.st === 'lash') { e.len = Math.min(e.maxLen, e.len + 1700 * dt); if (e.len >= e.maxLen) { setState(e, 'hold'); emit('shake', { amp: 2, t: 0.1 }); } }
    else if (e.st === 'hold') { if (e.stT > 0.6) setState(e, 'retract'); }
    else if (e.st === 'retract') { e.len = Math.max(46, e.len - 420 * dt); if (e.len <= 46 && e.stT > 0.9) setState(e, 'idle'); }
    e.h = e.len;
  },
  draw(g, e, G) {
    const x = e.x + e.w / 2, y0 = e.top, L = e.len, rus = e.st === 'rustle' ? Math.sin(e.t * 50) * 4 : 0;
    const pt = (k) => [x + Math.sin(k * 9 + e.t * 2) * 5 * k + rus * k, y0 + k * L];
    g.strokeStyle = body(e, '#1c1024'); g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); for (let i = 0; i <= 12; i++) { const [px, py] = pt(i / 12); g[i ? 'lineTo' : 'moveTo'](px, py); } g.stroke();
    g.strokeStyle = body(e, '#3a2050'); g.lineWidth = 3; g.stroke();
    g.fillStyle = body(e, '#2a1438');
    for (let i = 1; i < 12; i++) { const [px, py] = pt(i / 12), d = i % 2 ? 1 : -1; g.beginPath(); g.moveTo(px + d * 3, py - 4); g.lineTo(px + d * 12, py - 8); g.lineTo(px + d * 3, py + 2); g.fill(); }
    const hot = e.st === 'rustle' ? e.stT / 0.45 : e.st === 'lash' || e.st === 'hold' ? 1 : 0.2;
    const [tx, ty] = pt(1);
    additive(g, () => {
      for (let i = 2; i < 12; i += 3) { const [px, py] = pt(i / 12); glow(g, px, py, 9, '#e05aff', 0.6); }
      glow(g, tx, ty, 16 + hot * 18, '#ff7ae0', 0.6 + hot * 0.4); g.fillStyle = '#ffffff'; g.fillRect(tx - 2, ty - 2, 4, 4);
    });
    if (e.st === 'rustle') { g.fillStyle = rgba('#b07aff', 0.6); for (let i = 0; i < 5; i++) g.fillRect(x - 20 + i * 10, y0 + ((e.stT * 200 + i * 23) % 60), 2, 4); }
    light(G, tx, ty, 90 + hot * 40, '#e05aff', 0.45);
  },
};

export default { moth, shambler, sporepod, thornvine };
