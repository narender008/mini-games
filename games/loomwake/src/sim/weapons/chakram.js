// The Bobbin Chakram: two bladed bobbins on one thread. Attack throws a bobbin that leaps
// from foe to foe, then flies home (cutting on the way back); out of a Dash, Attack throws
// every bobbin in hand at once. The Special calls them into a whirling ring around Iri.
// Interface: see the header of blade.js.
//
// h.wpn (render reads it): { discs: [{ state: 'held'|'out'|'hover'|'return'|'orbit', x, y, vx, vy, spin, leaps, d,
//   t, hit:Set, bonus, trail:[] }], throwT, spinT (s of Bobbin Spin left), swing, phase }
// Knobs from stats.w: count, bounces, discDmg, range, spinT, spinR, catchBonus, hover, tether.
// Bus: swing {weapon:'chakram', combo, n}, special {weapon:'chakram'},
//   weaponFx {weapon:'chakram', fx: 'throw'|'ricochet'|'return'|'catch'|'hover'|'spin'|'tether', x, y, angle}
import { damageFoe, fire, targetable } from '../combat.js';
import { endAction } from '../hero.js';
import { insideChamber } from '../world.js';

export const DISC = { speed: 1300, range: 460, dmg: 18, returnSpeed: 1500, returnDmg: 11, r: 22, leaps: 2, leapRange: 300, wind: 0.05, rec: 0.13 };
export const SPIN = { t: 1.4, r: 96, dmg: 10, every: 0.15, cooldown: 2.0, w: 9 };
const W = (h) => (h.stats && h.stats.w) || {};

function ensure(G, h) {
  const w = h.wpn || (h.wpn = {});
  const n = W(h).count || 2;
  if (!w.discs) w.discs = [];
  while (w.discs.length < n) w.discs.push({ state: 'held', x: h.x, y: h.y, vx: 0, vy: 0, spin: 0, leaps: 0, d: 0, t: 0, hit: new Set(), bonus: 0, i: w.discs.length });
  while (w.discs.length > n) { const i = w.discs.findIndex((d) => d.state === 'held'); if (i < 0) break; w.discs.splice(i, 1); }
  return w;
}

function throwDisc(G, h, d, ang) {
  const k = W(h), rng = k.range || 1;
  d.state = 'out'; d.x = h.x + Math.cos(ang) * 24; d.y = h.y + Math.sin(ang) * 24;
  d.vx = Math.cos(ang) * DISC.speed * rng; d.vy = Math.sin(ang) * DISC.speed * rng;
  d.leaps = DISC.leaps + (k.bounces || 0); d.d = 0; d.t = 0; d.hit = new Set(); d.hoverT = 0;
  d.bonus = h.wpn.catchBonus || 0; h.wpn.catchBonus = 0;
}

function hitDisc(G, h, d, e, dmg, kind = 'attack') {
  d.hit.add(e.id);
  return damageFoe(G, e, dmg * (W(h).discDmg || 1) * (1 + (d.bonus || 0)) * (h.stats[kind === 'special' ? 'specialDmg' : 'attackDmg'] ?? 1),
    { kind, kb: kind === 'special' ? 160 : 230, dx: d.vx || e.x - h.x, dy: d.vy || e.y - h.y, stun: 0.18, hitstop: 0.03, shake: 0.1 });
}

function startReturn(G, h, d) {
  d.state = 'return'; d.hit = new Set(); d.t = 0;
  G.bus.emit('weaponFx', { weapon: 'chakram', fx: 'return', x: d.x, y: d.y });
}

function updateDiscs(G, h, dt) {
  const w = h.wpn, k = W(h);
  const rng = k.range || 1;
  let out = 0;
  for (const d of w.discs) {
    d.t += dt; d.spin += dt * 30;
    if (d.state === 'held') { d.x = h.x; d.y = h.y; continue; }
    out++;
    if (d.state === 'out') {
      const steps = 3;
      for (let i = 0; i < steps && d.state === 'out'; i++) {
        const nx = d.x + (d.vx * dt) / steps, ny = d.y + (d.vy * dt) / steps;
        d.d += Math.hypot(nx - d.x, ny - d.y);
        if ((G.chamber && !insideChamber(G.chamber, nx, ny, 4)) || d.d > DISC.range * rng) {
          if (k.hover) { d.state = 'hover'; d.hoverT = k.hover; d.acc = 0; d.hit = new Set(); G.bus.emit('weaponFx', { weapon: 'chakram', fx: 'hover', x: d.x, y: d.y }); }
          else startReturn(G, h, d);
          break;
        }
        d.x = nx; d.y = ny;
        for (const e of G.foes) {
          if (!targetable(e) || d.hit.has(e.id) || Math.hypot(e.x - d.x, e.y - d.y) > e.r + DISC.r) continue;
          hitDisc(G, h, d, e, DISC.dmg);
          // leap to the next foe
          if (d.leaps > 0) {
            let best = null, bd = DISC.leapRange;
            for (const f of G.foes) { if (!targetable(f) || d.hit.has(f.id)) continue; const dd = Math.hypot(f.x - d.x, f.y - d.y); if (dd < bd) { bd = dd; best = f; } }
            if (best) {
              d.leaps--; d.d = Math.max(0, d.d - 160);
              const sp = Math.hypot(d.vx, d.vy), l = bd || 1;
              d.vx = ((best.x - d.x) / l) * sp; d.vy = ((best.y - d.y) / l) * sp;
              G.bus.emit('weaponFx', { weapon: 'chakram', fx: 'ricochet', x: d.x, y: d.y, angle: Math.atan2(d.vy, d.vx) });
              break;
            }
          }
          startReturn(G, h, d);
          break;
        }
      }
    } else if (d.state === 'hover') {
      d.hoverT -= dt; d.acc = (d.acc || 0) + dt;
      if (d.acc >= 0.15) { d.acc = 0; for (const e of G.foes) if (targetable(e) && Math.hypot(e.x - d.x, e.y - d.y) < e.r + DISC.r + 14) { d.hit.delete(e.id); hitDisc(G, h, d, e, 6); } }
      if (d.hoverT <= 0) startReturn(G, h, d);
    } else if (d.state === 'return') {
      const dx = h.x - d.x, dy = h.y - d.y, dd = Math.hypot(dx, dy) || 1;
      const sp = DISC.returnSpeed * rng * (1 + Math.min(1, d.t));
      d.vx = (dx / dd) * sp; d.vy = (dy / dd) * sp;
      if (dd < 30) {
        d.state = 'held'; d.x = h.x; d.y = h.y; out--;
        if (k.catchBonus) w.catchBonus = k.catchBonus;
        G.bus.emit('weaponFx', { weapon: 'chakram', fx: 'catch', x: h.x, y: h.y });
        continue;
      }
      d.x += d.vx * dt; d.y += d.vy * dt;
      for (const e of G.foes) {
        if (!targetable(e) || d.hit.has(e.id) || Math.hypot(e.x - d.x, e.y - d.y) > e.r + DISC.r) continue;
        hitDisc(G, h, d, e, DISC.returnDmg);
      }
    } else if (d.state === 'orbit') {
      const R = SPIN.r * (k.spinR || 1);
      const a = w.spinA + (d.i / w.discs.length) * Math.PI * 2;
      const tx = h.x + Math.cos(a) * R, ty = h.y + Math.sin(a) * R * 0.78;
      d.x += (tx - d.x) * Math.min(1, dt * 22); d.y += (ty - d.y) * Math.min(1, dt * 22);
      d.vx = -Math.sin(a) * 600; d.vy = Math.cos(a) * 600;
    }
  }
  // Bobbin Spin
  if (w.spinT > 0) {
    w.spinT -= dt; w.spinA = (w.spinA || 0) + dt * SPIN.w; w.spinAcc = (w.spinAcc || 0) + dt;
    if (w.spinAcc >= SPIN.every) {
      w.spinAcc = 0;
      for (const d of w.discs) if (d.state === 'orbit') for (const e of G.foes) if (targetable(e) && Math.hypot(e.x - d.x, e.y - d.y) < e.r + DISC.r + 6) { d.hit.delete(e.id); hitDisc(G, h, d, e, SPIN.dmg, 'special'); }
    }
    if (w.spinT <= 0) for (const d of w.discs) if (d.state === 'orbit') { d.state = 'held'; G.bus.emit('weaponFx', { weapon: 'chakram', fx: 'catch', x: h.x, y: h.y }); }
  }
  // the Weaver's thread between flying bobbins
  if (k.tether) {
    const fly = w.discs.filter((d) => d.state === 'out' || d.state === 'hover' || d.state === 'return');
    w.tetherOn = fly.length >= 2;
    if (w.tetherOn) {
      w.tetherAcc = (w.tetherAcc || 0) + dt;
      if (w.tetherAcc >= 0.2) {
        w.tetherAcc = 0;
        for (let i = 0; i + 1 < fly.length; i++) {
          const a = fly[i], b = fly[i + 1];
          for (const e of G.foes) {
            if (!targetable(e)) continue;
            if (segPoint(e.x, e.y, a.x, a.y, b.x, b.y) > e.r + 6) continue;
            damageFoe(G, e, k.tether, { kind: 'attack', kb: 0, quiet: false });
          }
        }
      }
    }
  } else w.tetherOn = false;
}
function segPoint(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

const chakram = {
  id: 'chakram',
  name: 'Bobbin Chakram',
  init(G, h) { h.wpn = { discs: [], throwT: 0, spinT: 0, spinA: 0, swing: null, phase: 'rec', catchBonus: 0 }; ensure(G, h); },

  attack(G, h) {
    const w = ensure(G, h);
    if ((h.state === 'attack' || h.state === 'dashAttack' || h.state === 'special') && !h.cancel) return false;
    const held = w.discs.filter((d) => d.state === 'held');
    if (!held.length) return false;
    const ad = G.input.aimDir; if (ad && (ad.x || ad.y)) h.facing = Math.atan2(ad.y, ad.x);
    const recentDash = h.state === 'dash' || G.t - (h.lastDashEnd ?? -9) < G.cfg.dash.strikeWindow;
    const list = recentDash ? held : [held[0]];
    h.state = recentDash ? 'dashAttack' : 'attack'; h.st = 0; h.cancel = false; h.accel = 16;
    w.swing = 'throw'; w.phase = 'wind'; w.pending = list; w.thrown = false;
    G.bus.emit('swing', { weapon: 'chakram', combo: recentDash ? 3 : 0, n: list.length, x: h.x, y: h.y, angle: h.facing });
    return true;
  },

  special(G, h) {
    const w = ensure(G, h);
    if (h.cd.special > 0) return false;
    if ((h.state === 'attack' || h.state === 'dashAttack') && !h.cancel) return false;
    const k = W(h);
    w.spinT = SPIN.t * (k.spinT || 1); w.spinAcc = 0; w.spinA = h.facing;
    for (const d of w.discs) { d.state = 'orbit'; d.hit = new Set(); }
    h.cd.special = SPIN.cooldown;
    h.state = 'special'; h.st = 0; h.cancel = false; h.accel = 14; w.swing = 'spin'; w.phase = 'act';
    G.bus.emit('special', { weapon: 'chakram', x: h.x, y: h.y, angle: h.facing });
    G.bus.emit('weaponFx', { weapon: 'chakram', fx: 'spin', x: h.x, y: h.y });
    fire(G, 'onSpecial', { x: h.x, y: h.y, angle: h.facing });
    return true;
  },

  cancel(G, h) { const w = h.wpn; if (!w) return; if (w.swing === 'throw' && !w.thrown) w.pending = null; w.phase = 'rec'; },

  update(G, h, dt) {
    const w = ensure(G, h);
    updateDiscs(G, h, dt);
    const I = G.input, sp = G.cfg.hero.speed * (h.stats.speed ?? 1), k = 1 / (h.stats.attackSpeed ?? 1);
    if ((h.state === 'attack' || h.state === 'dashAttack') && w.swing === 'throw') {
      const wind = DISC.wind * k, rec = DISC.rec * k;
      w.phase = h.st < wind ? 'wind' : 'rec';
      w.throwT = Math.min(1, h.st / (wind + rec));
      h.tvx = I.move.x * sp * (h.state === 'dashAttack' ? 0.8 : 0.45); h.tvy = I.move.y * sp * (h.state === 'dashAttack' ? 0.8 : 0.45);
      if (!w.thrown && h.st >= wind) {
        w.thrown = true;
        const list = (w.pending || []).filter((d) => d.state === 'held');
        list.forEach((d, i) => throwDisc(G, h, d, h.facing + (list.length > 1 ? (i / (list.length - 1) - 0.5) * 0.5 : 0)));
        if (list.length) {
          fire(G, 'onAttack', { weapon: 'chakram', combo: h.state === 'dashAttack' ? 3 : 0, x: h.x, y: h.y, angle: h.facing });
          G.bus.emit('weaponFx', { weapon: 'chakram', fx: 'throw', x: h.x, y: h.y, angle: h.facing, n: list.length });
        }
      }
      h.cancel = w.thrown;
      if (h.st >= wind + rec) { endAction(h); w.swing = null; w.phase = 'rec'; }
    } else if (h.state === 'special' && w.swing === 'spin') {
      h.tvx = I.move.x * sp * 0.8; h.tvy = I.move.y * sp * 0.8;
      h.cancel = h.st > 0.1;
      if (h.st >= 0.16) { endAction(h); w.swing = null; w.phase = 'rec'; }
    }
  },
};
export default chakram;
