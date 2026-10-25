// The Gravel Wyrm (Hollow Caves): a huge stone worm that swims through the
// rock. Attacks, each with a tell:
//   dive   the floor rumbles and cracks under you (0.9 s), it bursts up and arcs over; its head jams
//          in the floor for a moment (open to swings) before it sinks
//   lunge  a side wall cracks and spills dust (0.85 s), it shoots out low (jump) or high (stay down),
//          then lies dazed on the floor (its head is open to swings) and drags itself back
//   rain   it slams the ceiling from inside: shadows mark where gravel falls (0.8 s)
// Phase 2 (half hp): ember cracks, faster, ember globs spray where it breaks the floor, denser rain.
// Hit boxes are its visible segments; contact hurts except while it lies dazed.
import { TILE } from '../../config.js';
import { emit } from '../../events.js';
import { solidAt } from '../../physics.js';
import { spawnShot } from '../../combat.js';
import { pc } from '../base.js';
import { glow, additive, body, light, rgba, mixHex, TAU } from '../paint.js';
import { makeBoss, setSt, arena } from './common.js';

const N = 15, GAP = 25;
const rad = (i) => (i === 0 ? 34 : 30 - i * 1.15);

const def = {
  id: 'gravel-wyrm', name: 'The Gravel Wyrm', epithet: 'devourer of the deep stone', hp: 44, phases: [0.5], deathTime: 2.4,
  create(G, cx, cy) {
    const A = arena(G, cx, cy);
    const b = makeBoss(G, def, { x: cx - 34, y: A.floor + 40, w: 68, h: 68, A, hx: cx, hy: A.floor + 120, ang: -Math.PI / 2, trail: [], marks: [], dust: [], seq: 0, mode: 'trail' });
    for (let i = 0; i < N * GAP / 4; i++) b.trail.push([cx, A.floor + 120 + i * 4]);
    setSt(b, 'under'); b.wait = 1.6;
    return b;
  },
  update(b, G, dt) {
    const A = b.A, sp = b.phase > 1 ? 1.3 : 1, p = pc(G);
    b.wait -= dt;
    // falling-gravel markers
    for (const m of b.marks) { m.t -= dt; if (m.t <= 0 && !m.done) { m.done = true; spawnShot(G, { kind: 'gravel', x: m.x, y: A.ceil + 12, vy: 120, gravity: 1500, r: m.ember ? 11 : 9, life: 2, ember: m.ember, breakable: false }); } }
    b.marks = b.marks.filter((m) => !m.done || m.t > -0.2);
    const moveHead = (x, y) => {
      const ox = b.hx, oy = b.hy; b.hx = x; b.hy = y;
      if (Math.hypot(x - ox, y - oy) > 0.01) b.ang = Math.atan2(y - oy, x - ox);
      const last = b.trail[0];
      if (!last || Math.hypot(x - last[0], y - last[1]) >= 4) { b.trail.unshift([x, y]); if (b.trail.length > 200) b.trail.pop(); }
    };
    switch (b.st) {
      case 'under':
        b.mode = 'trail'; b.contact = 0;
        moveHead(b.hx, Math.min(A.floor + 160, b.hy + 300 * dt));
        if (b.wait <= 0) {
          const r = G.rng(), wallD = Math.min(p.x - A.x0, A.x1 - p.x);
          let pick = b.seq % 4 === 3 ? 'rain' : r < 0.55 ? 'dive' : 'lunge';
          if (pick === 'lunge' && wallD > 900) pick = 'dive';   // wide dens: only near a wall
          b.seq++;
          if (pick === 'dive') { b.sx = Math.max(A.x0 + 80, Math.min(A.x1 - 80, p.x)); b.dir = b.sx < A.cx ? 1 : -1; setSt(b, 'tell'); emit('boss-tell', { id: def.id, kind: 'dive' }); }
          else if (pick === 'lunge') { b.side = p.x - A.x0 < A.x1 - p.x ? 1 : -1; b.reach = Math.min(A.w * 0.68, Math.abs(p.x - (b.side > 0 ? A.x0 : A.x1)) + 320); b.high = G.rng() < 0.4; b.ly = b.high ? A.floor - 165 : A.floor - 48; setSt(b, 'ltell'); emit('boss-tell', { id: def.id, kind: 'lunge' }); }
          else { setSt(b, 'rtell'); emit('shake', { amp: 5, t: 0.6 }); emit('boss-tell', { id: def.id, kind: 'rain' }); }
        }
        break;
      case 'tell':   // rumble under the spot
        moveHead(b.sx, A.floor + 90);
        if (b.stT > 0.9 / sp) { setSt(b, 'dive'); emit('shake', { amp: 8, t: 0.3 }); emit('boss-roar', { id: def.id }); if (b.phase > 1) spray(G, b, b.sx, A.floor); }
        break;
      case 'dive': {
        b.contact = 1;
        const D = 1.7 / sp, k = Math.min(1, b.stT / D), span = Math.min(560, A.w * 0.55), Hh = Math.min(330, A.floor - A.ceil - 90);
        moveHead(b.sx + b.dir * span * k, A.floor + 90 - (Hh + 90) * Math.sin(Math.PI * k));
        if (k > 0.6 && b.hy >= A.floor - 26) { b.hy = A.floor - 26; setSt(b, 'stuck'); emit('shake', { amp: 7, t: 0.3 }); if (b.phase > 1) spray(G, b, b.hx, A.floor); }
        else if (k >= 1) setSt(b, 'sink');
        break;
      }
      case 'stuck':   // its head jams in the floor: the window to strike
        b.contact = 0;
        if (b.stT > (b.phase > 1 ? 1.0 : 1.3)) setSt(b, 'sink');
        break;
      case 'sink':   // the tail follows the head down
        moveHead(b.hx + Math.cos(b.ang) * 300 * dt, Math.min(A.floor + 200, b.hy + 380 * dt));
        if (b.stT > 0.9 / sp) { setSt(b, 'under'); b.wait = (b.phase > 1 ? 0.5 : 0.9); }
        break;
      case 'ltell':
        b.mode = 'line'; b.contact = 0; b.ax = b.side > 0 ? A.x0 - 90 : A.x1 + 90;
        b.hx = b.ax; b.hy = b.ly;
        if (b.stT > 0.85 / sp) { setSt(b, 'lunge'); emit('boss-roar', { id: def.id }); emit('shake', { amp: 8, t: 0.3 }); }
        break;
      case 'lunge': {
        b.contact = 1;
        const k = Math.min(1, b.stT / (0.6 / sp)), reach = b.reach;
        b.hx = b.ax + b.side * (reach + 90) * (1 - (1 - k) * (1 - k)); b.hy = b.ly; b.ang = b.side > 0 ? 0 : Math.PI;
        if (k >= 1) setSt(b, 'drop');
        break;
      }
      case 'drop':   // falls dazed to the floor
        b.hy = Math.min(A.floor - 30, b.hy + (200 + b.stT * 1600) * dt);
        if (b.hy >= A.floor - 30) { setSt(b, 'dazed'); emit('shake', { amp: 6, t: 0.2 }); }
        break;
      case 'dazed':
        b.contact = 0;
        if (b.stT > (b.phase > 1 ? 1.5 : 1.9)) setSt(b, 'retract');
        break;
      case 'retract': {
        b.contact = 1;
        const k = Math.min(1, b.stT / (0.9 / sp));
        b.hx += (b.ax - b.hx) * Math.min(1, k * k * 0.5 + dt * 3); b.hy += (b.ly - b.hy) * dt * 3;
        if (Math.abs(b.hx - b.ax) < 40 || k >= 1) { setSt(b, 'under'); b.mode = 'trail'; b.trail = []; b.hx = b.side > 0 ? A.x0 + 60 : A.x1 - 60; b.hy = A.floor + 160; for (let i = 0; i < 100; i++) b.trail.push([b.hx, b.hy + i * 4]); b.wait = b.phase > 1 ? 0.5 : 0.9; }
        break;
      }
      case 'rtell':
        moveHead(b.hx, A.floor + 160);
        if (b.stT > 0.5) {
          const n = b.phase > 1 ? 13 : 9;
          for (let i = 0; i < n; i++) {
            const lo = Math.max(A.x0 + 40, p.x - 640), hi = Math.min(A.x1 - 40, p.x + 640), x = i === 0 ? p.x : lo + G.rng() * (hi - lo);
            b.marks.push({ x, t: 0.8 + i * 0.12 + G.rng() * 0.2, T: 0.8 + i * 0.12, ember: b.phase > 1 && G.rng() < 0.4 });
          }
          setSt(b, 'rain');
        }
        break;
      case 'rain':
        if (b.stT > 2.2) { setSt(b, 'under'); b.wait = 0.4; }
        break;
    }
    // segments
    b.segs = segments(b, G);
    b.x = b.hx - 34; b.y = b.hy - 34;
    if (b.st === 'tell' || b.st === 'ltell' || b.st === 'rtell') for (let i = 0; i < 2; i++) b.dust.push({ x: b.st === 'ltell' ? b.ax + b.side * 90 : b.st === 'tell' ? b.sx + (G.rng() - 0.5) * 80 : p.x + (G.rng() - 0.5) * 1280, y: b.st === 'ltell' ? b.ly + (G.rng() - 0.5) * 80 : b.st === 'tell' ? A.floor : A.ceil, vx: (G.rng() - 0.5) * 120, vy: b.st === 'rtell' ? 60 : -150 - G.rng() * 200, t: 0.7 });
    for (const d of b.dust) { d.t -= dt; d.vy += 700 * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
    b.dust = b.dust.filter((d) => d.t > 0);
  },
  boxes(b) {
    const out = [];
    if (!b.segs) return out;
    for (let i = 0; i < b.segs.length; i++) {
      const s = b.segs[i]; if (!s.vis) continue;
      const r = rad(i) * 0.85; out.push({ x: s.x - r, y: s.y - r, w: r * 2, h: r * 2 });
      if (out.length >= 9) break;
    }
    return out;
  },
  weak(b) {
    const h = b.segs?.[0];
    if (h && h.vis) return { x: h.x - 30, y: h.y - 30, w: 60, h: 60 };
    return { x: b.A.cx - 30, y: b.A.floor - 60, w: 60, h: 60 };
  },
  onDeath(b) { b.st = 'dead'; b.marks = []; },
  death(b, G, dt) {
    // rears up and crumbles into the floor
    const k = Math.min(1, b.deathT / def.deathTime);
    if (b.mode === 'trail') { b.hy = Math.max(b.A.floor - 220, b.hy - 80 * dt); b.hx += Math.sin(b.deathT * 30) * 3; b.trail.unshift([b.hx, b.hy]); }
    else b.hy += Math.sin(b.deathT * 30) * 3;
    b.segs = segments(b, G); b.fall = k;
    if (Math.random() < 0.5) b.dust.push({ x: b.hx + (Math.random() - 0.5) * 60, y: b.hy, vx: (Math.random() - 0.5) * 300, vy: -200 * Math.random(), t: 0.8 });
    for (const d of b.dust) { d.t -= dt; d.vy += 700 * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
    b.dust = b.dust.filter((d) => d.t > 0);
  },
  draw(g, b, G) {
    const A = b.A, p2 = b.phase > 1, dead = !b.alive, k = dead ? b.fall || 0 : 0;
    // tells
    if (b.st === 'tell') { const k = Math.min(1, b.stT / (0.9 / (p2 ? 1.3 : 1))); tellFloor(g, b.sx, A.floor, k, b.t); light(G, b.sx, A.floor - 20, 160 + 120 * k, '#ff9a4a', 0.4 + 0.5 * k); }
    if (b.st === 'ltell') { const k = Math.min(1, b.stT / (0.85 / (p2 ? 1.3 : 1))); tellWall(g, b.ax + b.side * 90, b.ly, b.side, k, b.t); lane(g, b, k); light(G, b.ax + b.side * 110, b.ly, 160 + 120 * k, '#ff9a4a', 0.4 + 0.5 * k); }
    for (const m of b.marks) if (!m.done) {
      const q = 1 - Math.max(0, m.t) / m.T;
      g.fillStyle = rgba('#000000', 0.25 + 0.35 * q); g.beginPath(); g.ellipse(m.x, A.floor - 2, 10 + q * 16, 4 + q * 3, 0, 0, TAU); g.fill();
      additive(g, () => glow(g, m.x, A.floor - 4, 14 + q * 20, m.ember ? '#ff6a1a' : '#ffcf9a', 0.3 + q * 0.4));
      light(G, m.x, A.floor - 30, 70 + q * 50, m.ember ? '#ff6a1a' : '#ffcf9a', 0.3 + q * 0.4);
      g.fillStyle = rgba('#a89070', 0.7); for (let i = 0; i < 3; i++) g.fillRect(m.x - 6 + i * 6, A.ceil + ((b.t * 260 + i * 40) % Math.max(40, (A.floor - A.ceil) * q)), 2, 4);
    }
    // body, tail first
    const segs = b.segs || [];
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i]; if (!s.vis) continue;
      const r = rad(i) * (1 - k * 0.3);
      const jx = dead ? (Math.random() - 0.5) * 4 * k : 0;
      g.save(); g.translate(s.x + jx, s.y + k * k * 60); g.rotate(s.a);
      if (i === 0) head(g, b, r, p2); else plate(g, b, r, i, p2);
      g.restore();
    }
    // dust
    g.fillStyle = rgba('#8a7a68', 0.8);
    for (const d of b.dust) g.fillRect(d.x - 2, d.y - 2, 4 + (d.t * 4 | 0), 4);
    const h = segs[0];
    if (h && h.vis) light(G, h.x, h.y, 220, p2 ? '#ff6a1a' : '#ffb36a', 0.6);
    if ((b.st === 'dazed' || b.st === 'stuck') && h) additive(g, () => { for (let i = 0; i < 3; i++) { const a = b.t * 5 + i * 2.1; glow(g, h.x + Math.cos(a) * 34, h.y - 46 + Math.sin(a) * 8, 7, '#ffd27a', 0.9); } });
  },
};

function segments(b, G) {
  const out = [];
  if (b.mode === 'line') {   // a straight body from the wall to the head, sagging when dazed
    const sag = b.st === 'dazed' || b.st === 'drop' || b.st === 'retract' ? 1 : 0;
    for (let i = 0; i < N; i++) {
      const d = i * GAP, L = Math.abs(b.hx - b.ax) || 1, k = Math.min(1, d / L);
      const x = b.hx - b.side * d, y = b.hy + (b.ly - b.hy) * k * sag + Math.sin(i * 0.9 + b.t * 6) * 3;
      out.push({ x, y, a: b.side > 0 ? 0 : Math.PI, vis: k < 1 && !solidAt(G, x, y) });
    }
    return out;
  }
  let acc = 0, j = 0;
  const tr = b.trail;
  for (let i = 0; i < N; i++) {
    const want = i * GAP;
    while (j < tr.length - 1 && acc + Math.hypot(tr[j + 1][0] - tr[j][0], tr[j + 1][1] - tr[j][1]) < want) { acc += Math.hypot(tr[j + 1][0] - tr[j][0], tr[j + 1][1] - tr[j][1]); j++; }
    const p = tr[Math.min(j, tr.length - 1)] || [b.hx, b.hy], q = tr[Math.min(j + 1, tr.length - 1)] || p;
    const x = p[0], y = p[1];
    out.push({ x, y, a: Math.atan2(p[1] - q[1], p[0] - q[0]) || b.ang, vis: y < b.A.floor + 4 - (i === 0 ? 0 : 10) });
  }
  return out;
}

function plate(g, b, r, i, p2) {
  const base = mixHex('#4a3e36', '#2a221e', i / N);
  g.fillStyle = body(b, base);
  g.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, rr = r * (0.9 + ((i * 7 + k * 3) % 5) * 0.03); g[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill();
  g.fillStyle = body(b, '#6a5a4c'); g.beginPath(); g.ellipse(-r * 0.1, -r * 0.35, r * 0.7, r * 0.35, 0, Math.PI, TAU); g.fill();
  g.strokeStyle = '#1a1412'; g.lineWidth = 2; g.beginPath(); g.moveTo(-r * 0.2, -r); g.lineTo(r * 0.1, r); g.stroke();
  if (p2) additive(g, () => { g.strokeStyle = rgba('#ff7a2a', 0.85); g.lineWidth = 2; g.beginPath(); g.moveTo(-r * 0.6, -r * 0.2); g.lineTo(-r * 0.1, r * 0.1); g.lineTo(r * 0.4, -r * 0.3); g.stroke(); glow(g, 0, 0, r * 1.1, '#ff4a1a', 0.25); });
}
function head(g, b, r, p2) {
  const open = b.st === 'dive' || b.st === 'lunge' ? 0.5 : b.st === 'dazed' || b.st === 'stuck' ? 0.15 : 0.25;
  g.fillStyle = body(b, '#2a221e');
  // mandibles
  for (const d of [-1, 1]) { g.beginPath(); g.moveTo(r * 0.5, d * r * 0.4); g.quadraticCurveTo(r * 1.5, d * r * (0.5 + open), r * 1.6, d * r * (0.1 + open * 0.5)); g.lineTo(r * 1.1, d * r * 0.2); g.closePath(); g.fill(); }
  g.fillStyle = body(b, '#4e4238');
  g.beginPath(); g.moveTo(-r, -r * 0.8); g.lineTo(r * 0.3, -r * 1.05); g.lineTo(r * 1.15, -r * 0.4); g.lineTo(r * 1.15, r * 0.4); g.lineTo(r * 0.3, r * 1.05); g.lineTo(-r, r * 0.8); g.closePath(); g.fill();
  g.fillStyle = body(b, '#6e5e50'); g.beginPath(); g.moveTo(-r * 0.8, -r * 0.7); g.lineTo(r * 0.3, -r * 0.95); g.lineTo(r, -r * 0.35); g.lineTo(-r * 0.2, -r * 0.3); g.closePath(); g.fill();
  g.fillStyle = '#120c0a'; g.beginPath(); g.ellipse(r * 1.05, 0, r * 0.2, r * 0.32 * (0.5 + open), 0, 0, TAU); g.fill();
  additive(g, () => {
    const ec = p2 ? '#ff6a1a' : '#ffc14a';
    glow(g, r * 0.55, -r * 0.45, 14, ec, 1); glow(g, r * 0.55, r * 0.45, 14, ec, 1);
    g.fillStyle = '#fff2c0'; g.fillRect(r * 0.5, -r * 0.5, 6, 3); g.fillRect(r * 0.5, r * 0.4, 6, 3);
    if (p2) { g.strokeStyle = rgba('#ff8a2a', 0.9); g.lineWidth = 2; g.beginPath(); g.moveTo(-r * 0.7, 0); g.lineTo(-r * 0.1, -r * 0.2); g.lineTo(r * 0.3, r * 0.1); g.stroke(); }
    if (b.clank > 0) glow(g, 0, 0, r * 2, '#ffffff', b.clank * 2);
  });
}
function tellFloor(g, x, y, k, t) {
  k = Math.min(1, k);
  additive(g, () => {
    glow(g, x, y, 60 + k * 50, '#ff9a4a', 0.2 + k * 0.5);
    g.strokeStyle = rgba('#ffb36a', 0.4 + k * 0.6); g.lineWidth = 2;
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI + (i + 0.5) / 6 * Math.PI, L = 20 + k * 50; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L * 1.3 + Math.sin(t * 40 + i) * 2, y + Math.sin(a) * L * 0.25); } g.stroke();
  });
  g.fillStyle = '#3a2e28';
  for (let i = 0; i < 5; i++) { const h = Math.abs(Math.sin(t * 22 + i * 1.7)) * 10 * k; g.fillRect(x - 40 + i * 18, y - 6 - h, 7, 6); }
}
function tellWall(g, x, y, side, k, t) {
  k = Math.min(1, k);
  additive(g, () => {
    glow(g, x, y, 70 + k * 50, '#ff9a4a', 0.2 + k * 0.5);
    g.strokeStyle = rgba('#ffb36a', 0.4 + k * 0.6); g.lineWidth = 2;
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (i + 0.5) / 6 * Math.PI * side * -1, L = 20 + k * 45; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L * 0.4, y + Math.sin(a) * L + Math.sin(t * 40 + i) * 2); } g.stroke();
  });
}
// the lunge's path: a band at its height across the arena, brightening as it comes
function lane(g, b, k) {
  const x0 = b.ax + b.side * 90, L = b.reach + 40, y = b.ly;
  if (!Number.isFinite(x0) || !Number.isFinite(L) || !Number.isFinite(y)) return;
  additive(g, () => {
    const gr = g.createLinearGradient(x0, 0, x0 + b.side * L, 0);
    gr.addColorStop(0, rgba('#ff8a3a', 0.12 + 0.3 * k)); gr.addColorStop(1, rgba('#ff8a3a', 0));
    g.fillStyle = gr; g.fillRect(Math.min(x0, x0 + b.side * L), y - 30, L, 60);
    g.fillStyle = rgba('#ffd27a', 0.25 + 0.5 * k);
    for (let i = 0; i < 6; i++) { const u = ((b.t * 1.6 + i / 6) % 1); g.fillRect(x0 + b.side * u * L - 6, y - 1, 12, 2); }
    glow(g, x0 + b.side * 20, y, 70 + 50 * k, '#ff9a4a', 0.3 + 0.6 * k);
  });
}
function spray(G, b, x, y) {
  for (let i = 0; i < 3; i++) spawnShot(G, { kind: 'shard', ember: true, x, y: y - 20, vx: (i - 1) * 180 + (G.rng() - 0.5) * 60, vy: -520 - G.rng() * 120, gravity: 1300, r: 9, life: 2.5 });
}

export default def;
