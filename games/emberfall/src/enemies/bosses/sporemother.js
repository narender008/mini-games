// The Sporemother (Lumen Thicket): a giant glowing fungus matron rooted in
// the middle of the arena. Her heart, in her chest, opens after every attack
// (the only time she can be hurt: swings and bolts clank off the closed petals).
//   volley  she swells and glows (0.7 s), then lobs a fan of spores
//   summon  roots ripple at the arena's sides (0.8 s), two shamblers climb out (at most 3)
//   sweep   a tendril glows and the floor ripples along one side (0.8 s), then a tendril whips
//           along the floor to the wall: jump over its tip
// Phase 2 (half hp): sweeps go both ways, volleys also home in a little, and she releases
// floating pods that drift at you and burst in a spore cloud (pop them from a safe distance).
import { TILE } from '../../config.js';
import { emit } from '../../events.js';
import { spawnShot, hitPlayerBox } from '../../combat.js';
import { makeEnemy, setState, pc, lob, killEnemy } from '../base.js';
import thicket from '../thicket.js';
import { glow, additive, mushroom, body, light, warn, rgba, mixHex, TAU, linear } from '../paint.js';
import { makeBoss, setSt, arena } from './common.js';

const floatpod = {
  w: 26, h: 26, hp: 1, contact: 0, shards: 0, color: '#c8ff5a',
  update(e, G, dt) {
    const p = pc(G), cx = e.x + e.w / 2, cy = e.y + e.h / 2, d = Math.hypot(p.x - cx, p.y - cy) || 1;
    const sp = e.t < 0.8 ? 0 : 58;
    e.x += (p.x - cx) / d * sp * dt; e.y += ((p.y - cy) / d * sp + (e.t < 0.8 ? -70 : Math.sin(e.t * 2) * 20)) * dt;
    const P = G.player;
    if (e.t > 7 || (P && P.x < e.x + e.w && P.x + P.w > e.x && P.y < e.y + e.h && P.y + P.h > e.y)) killEnemy(G, e);
  },
  onDie(e, G) { spawnShot(G, { kind: 'cloud', x: e.x + e.w / 2, y: e.y + e.h / 2, r: 48, life: 1.5, arm: 0.45, pierce: true, ghost: true, dmg: 1, color: '#c8ff5a' }); },
  draw(g, e, G) {
    const x = e.x + e.w / 2, y = e.y + e.h / 2, s = 1 + Math.sin(e.t * 5) * 0.08 + Math.max(0, e.t - 5.5) * 0.15;
    additive(g, () => { glow(g, x, y, 30 * s, '#c8ff5a', 0.6); g.fillStyle = rgba(body(e, '#9aff4a'), 0.7); g.beginPath(); g.arc(x, y, 11 * s, 0, TAU); g.fill(); glow(g, x - 3, y - 3, 6, '#ffffff', 0.8); });
    g.strokeStyle = rgba('#e8ffb0', 0.6); g.lineWidth = 1; g.beginPath(); g.arc(x, y, 12 * s, 0, TAU); g.stroke();
    light(G, x, y, 80, '#c8ff5a', 0.45);
  },
};

// the heart opens after every second attack
const next = (b) => (b.n % 2 === 0 ? 'open' : 'pick');

const def = {
  id: 'sporemother', name: 'The Sporemother', epithet: 'mother of the glowing dark', hp: 54, phases: [0.5], deathTime: 2.6,
  create(G, cx, cy) {
    const A = arena(G, cx, cy);
    const b = makeBoss(G, def, { x: cx - 110, y: A.floor - 280, w: 220, h: 280, A, cx, floor: A.floor, open: 0, tend: [], n: 0 });
    setSt(b, 'intro');
    return b;
  },
  guard(b) { return b.open > 0.6 ? undefined : false; },
  boxes(b) { return [def.weak(b)]; },
  weak(b) { return { x: b.cx - 30, y: b.floor - 118, w: 60, h: 72 }; },
  update(b, G, dt) {
    const A = b.A, p2 = b.phase > 1, P = pc(G);
    const wantOpen = b.st === 'open';
    b.open = Math.max(0, Math.min(1, b.open + (wantOpen ? 4 : -5) * dt));
    // tendrils whip along the floor
    for (const t of b.tend) {
      t.t += dt;
      if (t.st === 'tell' && t.t > 0.8) { t.st = 'whip'; t.t = 0; emit('boss-attack', { id: def.id, kind: 'sweep' }); }
      if (t.st === 'whip') {
        const k = Math.min(1, t.t / 0.55);
        t.tip = t.x0 + (t.x1 - t.x0) * (1 - (1 - k) ** 2);
        hitPlayerBox(G, Math.min(t.tip, t.tip - t.dir * 70), b.floor - 34, 70, 34, 1, t.tip, { kind: 'tendril' });
        if (k >= 1) { t.st = 'back'; t.t = 0; }
      } else if (t.st === 'back') { t.tip += (t.x0 - t.tip) * Math.min(1, dt * 5); if (t.t > 0.6) t.dead = true; }
    }
    b.tend = b.tend.filter((t) => !t.dead);
    switch (b.st) {
      case 'intro': if (b.stT > 1.4) setSt(b, 'pick'); break;
      case 'pick': {
        const live = G.enemies.filter((e) => e.alive && e.kind === 'shambler').length;
        const opts = ['volley', 'sweep', 'volley', 'sweep'];
        if (live < 2) opts.push('summon');
        if (p2) opts.push('pods', 'pods');
        let a = opts[(G.rng() * opts.length) | 0];
        if (a === b.last && G.rng() < 0.7) a = opts[(G.rng() * opts.length) | 0];
        b.last = a; b.n++;
        if (a === 'sweep') {
          const sides = p2 ? [-1, 1] : [P.x < b.cx ? -1 : 1];
          for (const d of sides) b.tend.push({ dir: d, x0: b.cx + d * 90, x1: d < 0 ? Math.max(A.x0 + 10, b.cx - 700) : Math.min(A.x1 - 10, b.cx + 700), tip: b.cx + d * 90, st: 'tell', t: 0 });
          setSt(b, 'sweep');
        } else setSt(b, a);
        emit('boss-tell', { id: def.id, kind: a });
        break;
      }
      case 'volley':
        if (b.stT > 0.7) {
          const n = p2 ? 8 : 6;
          for (let i = 0; i < n; i++) {
            const a = -Math.PI * (0.15 + 0.7 * i / (n - 1)), s = 380 + G.rng() * 140;
            spawnShot(G, { kind: 'spore', x: b.cx, y: b.floor - 230, vx: Math.cos(a) * s, vy: Math.sin(a) * s, gravity: 520, r: 9, life: 4, breakable: true, homing: p2 ? 0.5 : 0, color: i % 2 ? '#ff7ae0' : '#c8ff5a' });
          }
          const v = lob(b.cx, b.floor - 230, P.x, P.y, 520, 460);
          spawnShot(G, { kind: 'spore', x: b.cx, y: b.floor - 230, vx: v.vx, vy: v.vy, gravity: 520, r: 10, life: 4, breakable: true, color: '#ffffff' });
          emit('boss-attack', { id: def.id, kind: 'volley' });
          setSt(b, next(b));
        }
        break;
      case 'summon':
        if (b.stT > 0.8) {
          for (const x of [Math.max(A.x0 + 110, b.cx - 520), Math.min(A.x1 - 110, b.cx + 520)]) {
            const e = makeEnemy(G, 'shambler', thicket.shambler, x - 19, b.floor - 58, {});
            thicket.shambler.place(e, G, x, b.floor - 20); G.enemies.push(e);
          }
          emit('boss-attack', { id: def.id, kind: 'summon' });
          setSt(b, next(b));
        }
        break;
      case 'sweep': if (b.stT > 1.5) setSt(b, next(b)); break;
      case 'pods':
        if (b.stT > 0.6) {
          for (let i = 0; i < 3; i++) {
            const e = makeEnemy(G, 'floatpod', floatpod, b.cx - 13 + (i - 1) * 70, b.floor - 260 - (i % 2) * 30, {});
            G.enemies.push(e);
          }
          emit('boss-attack', { id: def.id, kind: 'pods' });
          setSt(b, next(b));
        }
        break;
      case 'open': if (b.stT > (p2 ? 1.3 : 1.6)) setSt(b, 'pick'); break;
    }
  },
  onDeath(b, G) { b.tend = []; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; spawnShot(G, { kind: 'pollen', side: 'fx', dmg: 0, x: b.cx, y: b.floor - 120, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200 - 100, gravity: 200, r: 6, life: 1.6, ghost: true }); } },
  death() {},
  draw(g, b, G) {
    const x = b.cx, y = b.floor, t = b.t, p2 = b.phase > 1;
    const dk = b.alive ? 0 : Math.min(1, b.deathT / def.deathTime);
    const tellK = b.st === 'volley' ? b.stT / 0.7 : b.st === 'summon' ? b.stT / 0.8 : b.st === 'pods' ? b.stT / 0.6 : 0;
    const breath = Math.sin(t * 1.6) * 0.03 + tellK * 0.08, sway = Math.sin(t * 0.9) * 6 * (1 - dk);
    const capC = p2 ? '#ff3fb4' : '#e05aff', glowC = p2 ? '#ff7ae0' : '#c87aff';
    // roots
    g.strokeStyle = '#1a0f22'; g.lineWidth = 8; g.lineCap = 'round';
    for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(x + i * 14, y - 30); g.quadraticCurveTo(x + i * 40, y - 10, x + i * 58 + Math.sin(t + i) * 3, y + 2); g.stroke(); }
    // tendril tells and whips
    for (const td of b.tend) {
      if (td.st === 'tell') {
        const k = td.t / 0.8;
        additive(g, () => { for (let i = 0; i < 8; i++) { const xx = td.x0 + (td.x1 - td.x0) * (i / 8); glow(g, xx, y - 4 - Math.abs(Math.sin(t * 14 + i)) * 6 * k, 16 + k * 14, glowC, 0.15 + k * 0.4); } });
      }
      g.strokeStyle = body(b, '#2a1438'); g.lineWidth = 14;
      g.beginPath(); g.moveTo(td.x0, y - 40);
      const n = 10; for (let i = 1; i <= n; i++) { const xx = td.x0 + (td.tip - td.x0) * i / n; g.lineTo(xx, y - 14 - Math.sin(i * 1.3 + t * 20) * (td.st === 'whip' ? 8 : 3) * (i / n)); }
      g.stroke();
      additive(g, () => { glow(g, td.tip, y - 16, 34, glowC, 0.8); g.fillStyle = '#ffffff'; g.fillRect(td.tip - 3, y - 19, 6, 6); });
    }
    g.save(); g.translate(x, y); g.scale(1 + breath, 1 - breath * 0.5);
    if (dk) { g.rotate(Math.sin(b.deathT * 20) * 0.02 * (1 - dk)); g.translate(0, dk * 30); g.scale(1, 1 - dk * 0.25); }
    // gown of folded gills
    g.fillStyle = linear(g, 0, -240, 0, 0, [body(b, '#3a1a4a'), body(b, '#160a1e')]);
    g.beginPath(); g.moveTo(-110, 0); g.bezierCurveTo(-96, -90, -56, -170, -34 + sway * 0.3, -220); g.lineTo(34 + sway * 0.3, -220); g.bezierCurveTo(56, -170, 96, -90, 110, 0); g.closePath(); g.fill();
    g.strokeStyle = rgba(glowC, 0.35); g.lineWidth = 2;
    for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(i * 6 + sway * 0.3, -210); g.quadraticCurveTo(i * 16, -110, i * 24, -4); g.stroke(); }
    // arms of tendrils
    g.strokeStyle = body(b, '#24102e'); g.lineWidth = 10;
    for (const d of [-1, 1]) { const lift = tellK * 40; g.beginPath(); g.moveTo(d * 40, -180); g.bezierCurveTo(d * 110, -170 - lift, d * 130, -110, d * 120 + Math.sin(t * 2 + d) * 8, -60 + lift * 0.3); g.stroke(); }
    // heart: petals part when open
    const o = b.open, hy = -82;
    additive(g, () => { glow(g, 0, hy, 60 + o * 50, '#c8ff5a', 0.2 + o * 0.7); glow(g, 0, hy, 18 + o * 14, '#ffffff', 0.25 + o * 0.75); });
    g.fillStyle = body(b, '#4a1e5a');
    for (const d of [-1, 1]) { g.beginPath(); g.moveTo(0, hy - 40); g.bezierCurveTo(d * (30 + o * 36), hy - 34, d * (32 + o * 36), hy + 30, 0, hy + 40); g.bezierCurveTo(d * (6 + o * 30), hy + 10, d * (6 + o * 30), hy - 10, 0, hy - 40); g.fill(); }
    if (o > 0.3) additive(g, () => { g.fillStyle = rgba('#e8ffb0', o); g.beginPath(); g.ellipse(0, hy, 12 * o + 4, 20 * o + 4, 0, 0, TAU); g.fill(); });
    if (b.clank > 0) additive(g, () => glow(g, 0, hy, 50, '#ffffff', b.clank * 2));
    // face, under the brim
    g.fillStyle = body(b, '#1e0e26'); g.beginPath(); g.ellipse(sway * 0.3, -200, 28, 30, 0, 0, TAU); g.fill();
    additive(g, () => {
      const ec = dk ? '#664466' : '#d6ff5a';
      glow(g, -11 + sway * 0.3, -202, 16, ec, 1 - dk); glow(g, 11 + sway * 0.3, -202, 16, ec, 1 - dk);
      g.fillStyle = rgba('#f6ffc8', 1 - dk); g.fillRect(-15 + sway * 0.3, -204, 8, 3); g.fillRect(7 + sway * 0.3, -204, 8, 3);
    });
    g.restore();
    // the cap crown, drooping on death
    mushroom(g, x + sway, y - 250 * (1 - breath * 0.5) + dk * 60, 10, 300 * (1 + breath), { cap: body(b, capC), glowC, stem: '#1e0e26', seed: 0.37, lean: dk * 40 });
    mushroom(g, x - 120 + sway * 0.6, y - 228 + dk * 40, 30, 80, { cap: body(b, '#3ff0c8'), glowC: '#3ff0c8', stem: '#1e0e26', seed: 0.7, lean: -10 });
    mushroom(g, x + 128 + sway * 0.6, y - 224 + dk * 40, 34, 90, { cap: body(b, '#ffd23f'), glowC: '#ffd23f', stem: '#1e0e26', seed: 0.2, lean: 12 });
    if (tellK > 0) warn(g, x, y - 250, 120, b.st === 'pods' ? '#c8ff5a' : glowC, tellK, t);
    // drifting spores
    additive(g, () => { for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 140 + (i % 4) * 30; glow(g, x + Math.cos(a + t * 0.2) * r, y - 220 + Math.sin(a * 1.7 + t * 0.4) * 80 - ((t * 20 + i * 30) % 120), 6, i % 2 ? glowC : '#c8ff5a', 0.6 * (1 - dk)); } });
    light(G, x, y - 250, 420, glowC, 0.7 * (1 - dk * 0.7));
    light(G, x, y - 82, 160 + b.open * 120, '#c8ff5a', 0.4 + b.open * 0.4);
  },
};

export default def;
