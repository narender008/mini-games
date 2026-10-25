// Ember Core enemies: magma (slug that leaves a burning trail; Fire Form
// walks through the trail), imp (cinder imp hovering out of reach, lobbing
// fireballs), golem (obsidian golem: slow, raises its fists and slams, sending
// shockwaves along the floor you jump over), salamander (crawls along floors,
// walls and ceilings, spits a stream of fire at you).
import { TILE } from '../config.js';
import { emit } from '../events.js';
import { lineOfSight, solidAt } from '../physics.js';
import { spawnShot } from '../combat.js';
import { setState, floorBelow, nearestSurface, patrol, walk, fly, pc, playerDist, lob } from './base.js';
import { glow, additive, flame, body, light, warn, rgba, TAU, linear } from './paint.js';

const onFloor = (e, G, cx, cy) => { const f = floorBelow(G, cx, cy, 20) ?? cy + TILE / 2; e.x = cx - e.w / 2; e.y = f - e.h; e.home = cx; };

// ---------------------------------------------------------------- magma
const magma = {
  w: 48, h: 22, hp: 4, contact: 1, shards: 3, color: '#ff6a1a',
  place: onFloor,
  update(e, G, dt) {
    patrol(G, e, dt, 42);
    e.trail = (e.trail || 0) - dt;
    if (e.onGround && e.trail <= 0) {
      e.trail = 0.28;
      spawnShot(G, { kind: 'flame', x: e.x + e.w / 2 - e.face * 18, y: e.y + e.h - 8, w: 24, h: 16, life: 2.2, pierce: true, ghost: true, fire: true, dmg: 1 });
    }
  },
  draw(g, e, G) {
    const x = e.x + e.w / 2, y = e.y + e.h, f = e.face, sq = Math.sin(e.t * 6) * 0.06;
    g.save(); g.translate(x, y); g.scale(f * (1 + sq), 1 - sq);
    additive(g, () => glow(g, 0, -4, 40, '#ff4a1a', 0.6));
    g.fillStyle = linear(g, 0, -26, 0, 0, [body(e, '#2a0e0a'), body(e, '#3a120a'), '#ff6a1a']);
    g.beginPath(); g.moveTo(-28, 0); g.bezierCurveTo(-30, -14, -10, -24, 8, -22); g.bezierCurveTo(22, -20, 30, -10, 28, 0); g.closePath(); g.fill();
    g.fillStyle = body(e, '#1a0806');
    for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(-16 + i * 10, -14 - (i % 2) * 3, 6, 4, 0.3, 0, TAU); g.fill(); }
    g.strokeStyle = body(e, '#2a0e0a'); g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(18, -18); g.lineTo(24, -30); g.moveTo(22, -16); g.lineTo(30, -26); g.stroke();
    additive(g, () => {
      g.strokeStyle = rgba('#ffb347', 0.85); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-20, -6); g.lineTo(-14, -12); g.lineTo(-6, -8); g.moveTo(0, -18); g.lineTo(6, -10); g.lineTo(14, -14); g.stroke();
      glow(g, 24, -30, 6, '#ffd27a', 1); glow(g, 30, -26, 6, '#ffd27a', 1);
      flame(g, -6, -20, 6 + Math.sin(e.t * 9) * 2, '#ff8a2a', 0.8);
    });
    g.restore();
    light(G, x, y - 8, 120, '#ff6a1a', 0.6);
  },
};

// ---------------------------------------------------------------- imp
const imp = {
  w: 30, h: 34, hp: 3, contact: 1, shards: 3, color: '#ff8a2a',
  place(e, G, cx, cy) { e.x = cx - e.w / 2; e.y = cy - e.h / 2; e.cool = 1.5 + e.seed; e.side = e.seed < 0.5 ? -1 : 1; },
  update(e, G, dt) {
    const p = pc(G), cx = e.x + e.w / 2, cy = e.y + e.h / 2, d = playerDist(G, e);
    e.face = p.x > cx ? 1 : -1;
    if (d > 720) { e.vx *= 0.9; e.vy = Math.sin(e.t * 3) * 30; fly(G, e, dt); return; }
    const tx = p.x - e.side * 210, ty = p.y - 170 + Math.sin(e.t * 2.5) * 20;
    e.vx += ((tx - cx) * 3 - e.vx) * Math.min(1, dt * 2.5); e.vy += ((ty - cy) * 3 - e.vy) * Math.min(1, dt * 2.5);
    e.vx = Math.max(-220, Math.min(220, e.vx)); e.vy = Math.max(-220, Math.min(220, e.vy));
    fly(G, e, dt);
    if (e.hitWall) e.side = -e.side;
    e.cool -= dt;
    if (e.st === 'idle' && e.cool <= 0 && lineOfSight(G, cx, cy, p.x, p.y)) setState(e, 'windup');
    else if (e.st === 'windup' && e.stT > 0.55) {
      const hx = cx + e.face * 10, hy = cy - 18, v = lob(hx, hy, p.x, p.y + 12, 700, 420);
      spawnShot(G, { kind: 'fireball', x: hx, y: hy, vx: v.vx, vy: v.vy, gravity: 700, r: 9, life: 3, breakable: true });
      emit('enemy-shoot', { kind: 'imp', x: hx, y: hy });
      e.cool = 2.2 + G.rng() * 0.8; setState(e, 'idle');
      if (G.rng() < 0.4) e.side = -e.side;
    }
  },
  draw(g, e, G) {
    const x = e.x + e.w / 2, y = e.y + e.h / 2, f = e.face, wind = e.st === 'windup' ? e.stT / 0.55 : 0, fl = Math.sin(e.t * 16) * 8;
    g.save(); g.translate(x, y); g.scale(f, 1);
    g.fillStyle = body(e, '#1a0a0a');
    for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * 4, -6); g.quadraticCurveTo(d * 18, -22 + fl, d * 30, -14 + fl); g.lineTo(d * 22, -6 + fl * 0.5); g.lineTo(d * 16, -2); g.closePath(); g.fill(); }
    g.beginPath(); g.ellipse(0, 2, 9, 12, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(2, -12, 8, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(-3, -18); g.lineTo(-8, -28); g.lineTo(0, -19); g.moveTo(5, -18); g.lineTo(10, -28); g.lineTo(8, -16); g.fill();
    g.strokeStyle = body(e, '#1a0a0a'); g.lineWidth = 2.5; g.beginPath(); g.moveTo(-4, 12); g.quadraticCurveTo(-14, 20 + fl * 0.3, -10, 26); g.stroke();
    g.beginPath(); g.moveTo(6, -2); g.lineTo(12, -14); g.stroke();
    additive(g, () => {
      g.strokeStyle = rgba('#ff6a1a', 0.8); g.lineWidth = 1.2; g.beginPath(); g.moveTo(-4, -4); g.lineTo(2, 4); g.lineTo(-2, 10); g.stroke();
      glow(g, 4, -13, 6, '#fff2a8', 1); g.fillStyle = '#ffffff'; g.fillRect(2, -14, 5, 2);
      glow(g, 0, 0, 30, '#ff6a1a', 0.4);
      if (wind > 0) { glow(g, 12, -20, 8 + wind * 14, '#ff8a2a', 0.9); glow(g, 12, -20, 4 + wind * 5, '#ffffff', 1); }
    });
    g.restore();
    light(G, x, y, 110 + wind * 60, '#ff6a1a', 0.5);
  },
};

// ---------------------------------------------------------------- golem
const golem = {
  w: 64, h: 92, hp: 8, contact: 2, shards: 8, color: '#ff8a2a', heavy: true,
  place(e, G, cx, cy) { onFloor(e, G, cx, cy); e.cool = 1; },
  update(e, G, dt) {
    const p = pc(G), cx = e.x + e.w / 2, dx = p.x - cx, seen = Math.abs(dx) < 560 && Math.abs(p.y - (e.y + e.h / 2)) < 200;
    e.cool -= dt;
    if (e.st === 'idle') {
      if (seen) { e.face = dx > 0 ? 1 : -1; if (Math.abs(dx) < 250 && e.cool <= 0) setState(e, 'windup'); else walk(G, e, dt, Math.abs(dx) > 90 ? e.face * 48 : 0); }
      else patrol(G, e, dt, 26);
    } else {
      walk(G, e, dt, 0);
      if (e.st === 'windup' && e.stT > 0.95) {
        setState(e, 'slam');
        const fy = e.y + e.h - 16;
        for (const d of [-1, 1]) spawnShot(G, { kind: 'wave', x: cx + d * 44, y: fy, w: 34, h: 30, vx: d * 330, life: 1.7, pierce: true, floor: true, dmg: 1 });
        emit('shake', { amp: 10, t: 0.35 }); emit('slam', { x: cx, y: e.y + e.h, kind: 'golem' });
      } else if (e.st === 'slam' && e.stT > 1.2) { e.cool = 1.4; setState(e, 'idle'); }
    }
  },
  draw(g, e, G) {
    const x = e.x + e.w / 2, y = e.y + e.h, f = e.face, st = e.st;
    const wind = st === 'windup' ? e.stT / 0.95 : 0, slam = st === 'slam' ? Math.max(0, 1 - e.stT / 0.4) : 0;
    const step = st === 'idle' ? Math.sin(e.t * 4) : 0, hot = 0.35 + wind * 0.65 + slam;
    g.save(); g.translate(x, y); g.scale(f, 1);
    const B = body(e, '#140a0c'), B2 = body(e, '#241418');
    g.fillStyle = B;
    g.fillRect(-24, -30 + Math.max(0, step) * 3, 18, 30); g.fillRect(6, -30 + Math.max(0, -step) * 3, 18, 30);
    g.fillStyle = B2;
    g.beginPath(); g.moveTo(-30, -28); g.lineTo(-36, -78); g.lineTo(-18, -96); g.lineTo(20, -96); g.lineTo(36, -78); g.lineTo(30, -28); g.closePath(); g.fill();
    g.fillStyle = B; g.beginPath(); g.moveTo(-6, -96); g.lineTo(-8, -112); g.lineTo(12, -114); g.lineTo(16, -96); g.fill();
    // arms: hang, rise on the wind-up, drive down on the slam
    const arm = st === 'windup' ? -2.6 * Math.min(1, wind * 1.4) : st === 'slam' ? -0.2 + slam * 0.2 : -0.15 + step * 0.08;
    for (const d of [-1, 1]) {
      g.save(); g.translate(d * 34, -84); g.rotate(arm * (d > 0 ? 1 : 0.9));
      g.fillStyle = d > 0 ? B2 : B; g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.lineTo(13, 46); g.lineTo(-11, 48); g.closePath(); g.fill();
      g.beginPath(); g.arc(1, 56, 15, 0, TAU); g.fill();
      additive(g, () => { glow(g, 1, 56, 18 + hot * 20, '#ff6a1a', 0.3 + hot * 0.4); });
      g.restore();
    }
    additive(g, () => {
      g.strokeStyle = rgba('#ff8a2a', 0.5 + hot * 0.5); g.lineWidth = 1.5 + hot;
      g.beginPath(); g.moveTo(-20, -86); g.lineTo(-10, -70); g.lineTo(-16, -52); g.lineTo(-4, -36); g.moveTo(14, -90); g.lineTo(6, -72); g.lineTo(18, -58); g.moveTo(-2, -64); g.lineTo(8, -48); g.stroke();
      glow(g, 0, -64, 30 + hot * 30, '#ff6a1a', 0.35 + hot * 0.4);
      glow(g, 6, -104, 6, '#fff2a8', 1); g.fillStyle = '#ffffff'; g.fillRect(2, -106, 10, 3);
    });
    g.restore();
    if (wind > 0) { warn(g, x, y - 4, 60, '#ff8a2a', wind, e.t); g.fillStyle = rgba('#ff8a2a', 0.25 * wind); g.fillRect(x - 260, y - 3, 520, 3); }
    light(G, x, y - 60, 150 + hot * 80, '#ff6a1a', 0.4 + hot * 0.3);
  },
};

// ---------------------------------------------------------------- salamander
const ANG = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
const salamander = {
  w: 50, h: 22, hp: 4, contact: 1, shards: 4, color: '#ffb347',
  place(e, G, cx, cy) {
    const s = nearestSurface(G, cx, cy); e.n = s.n; e.ang = ANG[s.n];
    if (s.n === 'left' || s.n === 'right') { e.w = 22; e.h = 50; }
    e.cx = s.x + Math.cos(e.ang) * 11; e.cy = s.y + Math.sin(e.ang) * 11;
    e.x = e.cx - e.w / 2; e.y = e.cy - e.h / 2; e.cool = 1 + e.seed;
  },
  update(e, G, dt) {
    const tx = Math.cos(e.ang + Math.PI / 2), ty = Math.sin(e.ang + Math.PI / 2), nx = Math.cos(e.ang), ny = Math.sin(e.ang);
    const p = pc(G);
    if (e.st === 'idle') {
      const ax = e.cx + tx * e.face * 30, ay = e.cy + ty * e.face * 30;
      if (solidAt(G, ax, ay) || !solidAt(G, ax - nx * 20, ay - ny * 20)) e.face = -e.face;
      else { e.cx += tx * e.face * 55 * dt; e.cy += ty * e.face * 55 * dt; }
      e.cool -= dt;
      if (e.cool <= 0 && playerDist(G, e) < 430 && lineOfSight(G, e.cx + nx * 10, e.cy + ny * 10, p.x, p.y)) setState(e, 'windup');
    } else if (e.st === 'windup') { if (e.stT > 0.5) { setState(e, 'spit'); e.sp = 0; } }
    else if (e.st === 'spit') {
      e.sp -= dt;
      if (e.sp <= 0) {
        e.sp = 0.08;
        const mx = e.cx + tx * e.face * 24 + nx * 6, my = e.cy + ty * e.face * 24 + ny * 6;
        const a = Math.atan2(p.y - my, p.x - mx) + Math.sin(e.stT * 20) * 0.08;
        spawnShot(G, { kind: 'stream', x: mx, y: my, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 6, life: 0.95 });
      }
      if (e.stT > 0.8) { e.cool = 2.4 + G.rng(); setState(e, 'idle'); }
    }
    e.x = e.cx - e.w / 2; e.y = e.cy - e.h / 2;
  },
  draw(g, e, G) {
    const k = e.st === 'windup' ? e.stT / 0.5 : e.st === 'spit' ? 1 : 0, f = e.face, wig = e.st === 'idle' ? Math.sin(e.t * 12) : 0;
    g.save(); g.translate(e.cx, e.cy); g.rotate(e.ang + Math.PI / 2); g.scale(f, 1);
    g.strokeStyle = body(e, '#1a0a08'); g.lineWidth = 3;
    for (const lx of [-12, 10]) for (const d of [-1, 1]) { g.beginPath(); g.moveTo(lx, 4); g.lineTo(lx + d * 6 + wig * 3 * d, 10); g.lineTo(lx + d * 9 + wig * 3 * d, 11); g.stroke(); }
    g.fillStyle = body(e, '#2a100a');
    g.beginPath(); g.moveTo(-18, 2); g.quadraticCurveTo(-34, 4 + wig * 4, -44, -2 - wig * 3); g.quadraticCurveTo(-30, -6, -16, -6); g.closePath(); g.fill();
    g.beginPath(); g.ellipse(-2, -1, 18, 7, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(20, -2, 9, 6, 0.1, 0, TAU); g.fill();
    additive(g, () => {
      for (let i = 0; i < 5; i++) glow(g, -26 + i * 9, -6, 5, '#ffb347', 0.8);
      glow(g, 23, -5, 4, '#fff2a8', 1);
      glow(g, 16, 2, 6 + k * 12, '#ff6a1a', 0.5 + k * 0.5);
      if (k > 0) flame(g, 28, 0, 4 + k * 6, '#ffb347', k, 6);
    });
    g.restore();
    if (e.st === 'windup') warn(g, e.cx + Math.cos(e.ang + Math.PI / 2) * f * 22, e.cy + Math.sin(e.ang + Math.PI / 2) * f * 22, 18, '#ffb347', k, e.t);
    light(G, e.cx, e.cy, 100 + k * 50, '#ff8a2a', 0.5);
  },
};

export default { magma, imp, golem, salamander };
