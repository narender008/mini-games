// The Spindle Spear: long reach, two thrusts and a sweeping spin; the Special throws it
// (piercing everything in its path), and a second press (or an attack press while it is
// out) calls it home through every foe between. Interface: see the header of blade.js.
//
// h.wpn (render reads it): { swing, idx, next, phase: 'wind'|'act'|'rec', hitDone, once,
//   held (spear in hand), spears: [{ state: 'fly'|'stuck'|'return', x, y, vx, vy, d, angle, t, once }],
//   spinHits, throwT (0..1 throw wind-up) }
// Knobs from stats.w (Aspects/Tempers in content/weapons.js): reach, throwDmg, recallDmg, recallSpeed,
//   recallPull, thorns, anchor, twin, spinR, spinDmg, spinTwice, spinBurn.
// Bus: swing {weapon:'spear', combo, thrust, spin}, special {weapon:'spear'},
//   weaponFx {weapon:'spear', fx: 'throw'|'stick'|'recall'|'catch'|'thorns', x, y}
import { hitFoes, damageFoe, addStatus, knock, fire, targetable } from '../combat.js';
import { endAction } from '../hero.js';
import { insideChamber } from '../world.js';
import { K } from '../boons.js';

export const THRUSTS = [
  { wind: 0.07, act: 0.09, rec: 0.19, reach: 168, w: 46, dmg: 24, lunge: 240, kb: 230, hitstop: 0.04, shake: 0.14, thrust: true },
  { wind: 0.06, act: 0.09, rec: 0.19, reach: 176, w: 46, dmg: 26, lunge: 260, kb: 250, hitstop: 0.045, shake: 0.16, thrust: true },
  { wind: 0.12, act: 0.22, rec: 0.28, reach: 128, dmg: 34, lunge: 70, kb: 480, hitstop: 0.08, shake: 0.32, spin: true, heavy: true },
];
export const DASH_THRUST = { wind: 0.03, act: 0.12, rec: 0.22, reach: 212, w: 58, dmg: 34, lunge: 960, kb: 420, hitstop: 0.06, shake: 0.24, thrust: true, dash: true };
export const THROW = { wind: 0.12, rec: 0.16, speed: 1500, range: 560, dmg: 38, recallSpeed: 1900, recallDmg: 30, cooldown: 0.3, r: 26 };

const W = (h) => (h.stats && h.stats.w) || {};

function startSwing(G, h, data, idx, state) {
  const w = h.wpn;
  w.swing = data; w.idx = idx; w.hitDone = false; w.phase = 'wind'; w.once = new Set(); w.spinHits = 0;
  h.state = state; h.st = 0; h.cancel = false; h.combo = idx; h.accel = 16;
  G.bus.emit('swing', { weapon: 'spear', combo: idx, x: h.x, y: h.y, angle: h.facing, heavy: !!data.heavy, thrust: !!data.thrust, spin: !!data.spin });
}

function launch(G, h) {
  const w = h.wpn, k = W(h);
  const ang = h.facing;
  const twin = k.twin || 0;
  const angles = twin ? [ang - 0.14, ang + 0.14] : [ang];
  w.spears = angles.map((a) => ({ state: 'fly', x: h.x + Math.cos(a) * 30, y: h.y + Math.sin(a) * 30, vx: Math.cos(a) * THROW.speed, vy: Math.sin(a) * THROW.speed, angle: a, d: 0, t: 0, once: new Set(), mult: twin || 1 }));
  w.held = false;
  fire(G, 'onSpecial', { x: h.x, y: h.y, angle: ang });
  G.bus.emit('weaponFx', { weapon: 'spear', fx: 'throw', x: h.x, y: h.y, angle: ang });
}

function recall(G, h) {
  const w = h.wpn;
  let any = false;
  for (const s of w.spears) if (s.state !== 'return') { s.state = 'return'; s.once = new Set(); s.t = 0; any = true; }
  if (any) G.bus.emit('weaponFx', { weapon: 'spear', fx: 'recall', x: h.x, y: h.y });
  return any;
}

function land(G, h, s) {
  const k = W(h);
  s.state = 'stuck'; s.vx = s.vy = 0; s.t = 0;
  G.bus.emit('weaponFx', { weapon: 'spear', fx: 'stick', x: s.x, y: s.y, angle: s.angle });
  if (k.thorns) {
    G.bus.emit('weaponFx', { weapon: 'spear', fx: 'thorns', x: s.x, y: s.y });
    hitFoes(G, { type: 'circle', x: s.x, y: s.y, r: 115 }, { dmg: k.thorns * s.mult, kb: 260, kind: 'special', element: 'dawn', stun: 0.3, hitstop: 0.03, shake: 0.2 });
  }
  if (k.anchor) for (const e of G.foes) if (targetable(e) && Math.hypot(e.x - s.x, e.y - s.y) < 125 + e.r) addStatus(G, e, 'bound', k.anchor, 1);
}

function updateSpears(G, h, dt) {
  const w = h.wpn, k = W(h);
  if (!w.spears || !w.spears.length) return;
  const tdm = (k.throwDmg || 1);
  for (const s of w.spears) {
    s.t += dt;
    if (s.state === 'fly') {
      const steps = 3;
      for (let i = 0; i < steps && s.state === 'fly'; i++) {
        const nx = s.x + (s.vx * dt) / steps, ny = s.y + (s.vy * dt) / steps;
        s.d += Math.hypot(nx - s.x, ny - s.y);
        if ((G.chamber && !insideChamber(G.chamber, nx, ny, 6)) || s.d > THROW.range || hitsObstacle(G, nx, ny)) { land(G, h, s); break; }
        s.x = nx; s.y = ny;
        for (const e of G.foes) {
          if (!targetable(e) || s.once.has(e.id) || Math.hypot(e.x - s.x, e.y - s.y) > e.r + THROW.r) continue;
          s.once.add(e.id);
          damageFoe(G, e, THROW.dmg * tdm * s.mult * (h.stats.specialDmg ?? 1), { kind: 'special', kb: 320, dx: s.vx, dy: s.vy, stun: 0.25, hitstop: 0.04, shake: 0.18 });
          if (!e.dead) addStatus(G, e, 'barb', 4, 1);
        }
      }
    } else if (s.state === 'return') {
      const sp = THROW.recallSpeed * (k.recallSpeed || 1);
      const dx = h.x - s.x, dy = h.y - s.y, d = Math.hypot(dx, dy) || 1;
      s.angle = Math.atan2(-dy, -dx);
      if (d < 34) { s.state = 'caught'; continue; }
      const step = Math.min(d, sp * dt);
      const px = s.x, py = s.y;
      s.x += (dx / d) * step; s.y += (dy / d) * step;
      for (const e of G.foes) {
        if (!targetable(e) || s.once.has(e.id)) continue;
        if (segPoint(e.x, e.y, px, py, s.x, s.y) > e.r + THROW.r) continue;
        s.once.add(e.id);
        damageFoe(G, e, THROW.recallDmg * tdm * (k.recallDmg || 1) * s.mult * (h.stats.specialDmg ?? 1), { kind: 'special', kb: k.recallPull ? 0 : 200, dx: dx, dy: dy, stun: 0.2, hitstop: 0.035, shake: 0.14 });
        if (k.recallPull && !e.dead && !e.boss) knock(G, e, h.x - e.x, h.y - e.y, Math.min(900, d * 3));
      }
    }
  }
  if (w.spears.every((s) => s.state === 'caught')) {
    w.spears = []; w.held = true; h.cd.special = Math.max(h.cd.special, THROW.cooldown);
    G.bus.emit('weaponFx', { weapon: 'spear', fx: 'catch', x: h.x, y: h.y });
  }
}
function hitsObstacle(G, x, y) {
  const ob = G.chamber && G.chamber.obstacles; if (!ob) return false;
  for (const o of ob) if (!o.low && Math.hypot(x - o.x, y - o.y) < o.r) return true;
  return false;
}
function segPoint(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

const spear = {
  id: 'spear',
  name: 'Spindle Spear',
  init(G, h) { h.wpn = { swing: null, idx: 0, next: 0, hitDone: false, phase: 'rec', once: null, held: true, spears: [], throwT: 0, spinHits: 0 }; },

  attack(G, h) {
    const w = h.wpn || (spear.init(G, h), h.wpn);
    if (!w.held) { if (w.spears.some((s) => s.state !== 'return')) recall(G, h); return true; }
    if ((h.state === 'attack' || h.state === 'dashAttack' || h.state === 'special') && !h.cancel) return false;
    const recentDash = h.state === 'dash' || G.t - (h.lastDashEnd ?? -9) < G.cfg.dash.strikeWindow;
    if (recentDash && h.state !== 'attack') { startSwing(G, h, DASH_THRUST, 3, 'dashAttack'); return true; }
    let idx = 0;
    if (h.state === 'attack') idx = (w.idx + 1) % 3;
    else if (h.comboWin > 0) idx = w.next ?? 0;
    startSwing(G, h, THRUSTS[idx], idx, 'attack');
    return true;
  },

  special(G, h) {
    const w = h.wpn || (spear.init(G, h), h.wpn);
    if (!w.held) return recall(G, h) || true;
    if (h.cd.special > 0) return false;
    if ((h.state === 'attack' || h.state === 'dashAttack') && !h.cancel) return false;
    w.swing = THROW; w.idx = 5; w.phase = 'wind'; w.thrown = false;
    h.state = 'special'; h.st = 0; h.cancel = false; h.accel = 14;
    G.bus.emit('special', { weapon: 'spear', x: h.x, y: h.y, angle: h.facing });
    return true;
  },

  cancel(G, h) { const w = h.wpn; if (!w) return; w.hitDone = true; w.phase = 'rec'; if (h.state === 'special' && !w.thrown && w.held) { /* wind-up dropped: keep the spear */ } },

  update(G, h, dt) {
    const w = h.wpn; if (!w) return;
    updateSpears(G, h, dt);
    if (!w.swing) return;
    const I = G.input, sp = G.cfg.hero.speed * (h.stats.speed ?? 1), k = 1 / (h.stats.attackSpeed ?? 1), kw = W(h);
    if (h.state === 'attack' || h.state === 'dashAttack') {
      const s = w.swing, wind = s.wind * k, act = s.act * k, rec = s.rec * k;
      const ad = I.aimDir;
      if (h.st < wind && ad && (ad.x || ad.y)) h.facing = Math.atan2(ad.y, ad.x);
      const fx = Math.cos(h.facing), fy = Math.sin(h.facing);
      w.phase = h.st < wind ? 'wind' : h.st < wind + act ? 'act' : 'rec';
      if (w.phase === 'act') { h.tvx = fx * s.lunge; h.tvy = fy * s.lunge; h.accel = s.dash ? 0 : 16; }
      else { h.tvx = I.move.x * sp * G.cfg.hero.attackMove; h.tvy = I.move.y * sp * G.cfg.hero.attackMove; h.accel = s.dash && w.phase === 'rec' ? 12 : 16; }
      const dmgK = h.stats.attackDmg ?? 1;
      if (s.spin) {
        const R = s.reach * (kw.spinR || 1), n = kw.spinTwice ? 2 : 1;
        const at = n === 2 ? [0.3, 0.85] : [0.45];
        while (w.spinHits < n && h.st >= wind + act * at[w.spinHits]) {
          if (w.spinHits === 0) fire(G, 'onAttack', { weapon: 'spear', combo: 2, x: h.x, y: h.y, angle: h.facing });
          hitFoes(G, { type: 'circle', x: h.x, y: h.y, r: R }, { dmg: s.dmg * dmgK * (kw.spinDmg || 1) * (n === 2 ? 0.7 : 1), kb: s.kb, kind: 'attack', once: n === 2 ? undefined : w.once, hitstop: s.hitstop, shake: s.shake, heavy: true });
          if (kw.spinBurn && w.spinHits === 0) K.power(G, 'molten', { x: h.x, y: h.y, r: R * 0.9, life: 2.4, dps: kw.spinBurn, ring: true });
          w.spinHits++;
        }
      } else if (!w.hitDone && h.st >= wind + act * 0.35) {
        w.hitDone = true;
        const reach = s.reach * (kw.reach || 1);
        fire(G, 'onAttack', { weapon: 'spear', combo: w.idx, x: h.x, y: h.y, angle: h.facing });
        hitFoes(G, { type: 'line', x: h.x - fx * 10, y: h.y - fy * 10, x2: h.x + fx * reach, y2: h.y + fy * reach, w: s.w }, { dmg: s.dmg * dmgK, kb: s.kb, kind: 'attack', once: w.once, hitstop: s.hitstop, shake: s.shake, dx: fx, dy: fy });
      }
      h.cancel = h.st >= wind + act * 0.9;
      if (h.st >= wind + act + rec) {
        const was = w.idx;
        endAction(h); w.swing = null; w.phase = 'rec';
        if (was < 2) { h.comboWin = 0.28; w.next = was + 1; } else { h.comboWin = 0; w.next = 0; }
      }
    } else if (h.state === 'special' && w.swing === THROW) {
      const wind = THROW.wind * k, rec = THROW.rec * k;
      const ad = I.aimDir;
      if (h.st < wind && ad && (ad.x || ad.y)) h.facing = Math.atan2(ad.y, ad.x);
      w.phase = h.st < wind ? 'wind' : 'rec';
      w.throwT = Math.min(1, h.st / wind);
      h.tvx = I.move.x * sp * 0.3; h.tvy = I.move.y * sp * 0.3;
      if (!w.thrown && h.st >= wind) { w.thrown = true; launch(G, h); }
      h.cancel = w.thrown;
      if (h.st >= wind + rec) { endAction(h); w.swing = null; w.phase = 'rec'; }
    }
  },
};
export default spear;
