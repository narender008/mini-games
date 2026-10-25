// The Warp Bow: hold Attack to draw, release to loose. A tap looses a quick arrow; a full
// draw hits hard; releasing in the bright flash just after full draw is a Perfect shot
// that pierces. Out of a Dash, Attack snaps off an instant arrow. The Special looses a
// fanned Volley. Interface: see the header of blade.js.
//
// h.wpn (render reads it): { phase: 'draw'|'loose'|'volley'|'rec', draw (s held), charge 0..1, perfect (bool,
//   inside the Perfect window now), arrows: [{ x, y, vx, vy, life, max, dmg, pierce, perfect, charge, shard, hit:Set, trail:[] }],
//   lastShot: { charge, perfect, t } }
// Knobs from stats.w: draw (speed mult), fullDmg, pierce, split, volley (+arrows), ricochet, drawMove,
//   markShots, seekMarked, hymn.
// Bus: swing {weapon:'bow', combo: 0 quick | 1 full | 2 perfect | 3 snap, charge}, special {weapon:'bow'},
//   weaponFx {weapon:'bow', fx: 'nock'|'full'|'perfect'|'loose'|'volley'|'arrowHit'|'arrowWall'|'split'|'hymn', x, y, angle}
import { damageFoe, addStatus, fire, targetable } from '../combat.js';
import { endAction } from '../hero.js';
import { insideChamber } from '../world.js';
import { K } from '../boons.js';

export const BOW = {
  full: 0.55,          // s to full draw (before draw-speed bonuses)
  perfect: 0.14,       // s window after full draw
  minDmg: 13, fullDmg: 50, perfectMult: 1.45,
  minSpeed: 1150, maxSpeed: 1950, life: 0.6,
  rec: 0.15, snapDmg: 24, snapRec: 0.16,
  volley: { n: 5, spread: 0.95, dmg: 14, speed: 1500, life: 0.3, wind: 0.08, rec: 0.2, cooldown: 0.9 },
};
const W = (h) => (h.stats && h.stats.w) || {};

function arrow(G, h, ang, o) {
  const w = h.wpn;
  const a = { x: h.x + Math.cos(ang) * 26, y: h.y + Math.sin(ang) * 26, vx: Math.cos(ang) * o.speed, vy: Math.sin(ang) * o.speed, life: o.life, max: o.life, dmg: o.dmg, pierce: o.pierce || 0,
    perfect: !!o.perfect, charge: o.charge ?? 1, shard: !!o.shard, volley: !!o.volley, ric: o.ric ?? (W(h).ricochet || 0), hit: new Set(), kind: o.kind || 'attack', seek: o.seek || 0 };
  w.arrows.push(a);
  return a;
}

function loose(G, h, opts = {}) {
  const w = h.wpn, k = W(h);
  const T = BOW.full / (k.draw || 1);
  const c = opts.snap ? 0.6 : Math.min(1, w.draw / T);
  const perfect = !opts.snap && w.draw >= T && w.draw <= T + BOW.perfect;
  let dmg = opts.snap ? BOW.snapDmg : BOW.minDmg + (BOW.fullDmg - BOW.minDmg) * c;
  if (c >= 1) dmg *= k.fullDmg || 1;
  if (perfect) dmg *= BOW.perfectMult;
  dmg *= h.stats.attackDmg ?? 1;
  const pierce = perfect ? 2 + (k.pierce || 0) : c >= 1 ? 1 : 0;
  const ang = h.facing;
  arrow(G, h, ang, { speed: BOW.minSpeed + (BOW.maxSpeed - BOW.minSpeed) * c, life: BOW.life, dmg, pierce, perfect, charge: c });
  w.lastShot = { charge: c, perfect, t: G.t };
  const combo = opts.snap ? 3 : perfect ? 2 : c >= 1 ? 1 : 0;
  G.bus.emit('swing', { weapon: 'bow', combo, x: h.x, y: h.y, angle: ang, charge: c, heavy: perfect });
  G.bus.emit('weaponFx', { weapon: 'bow', fx: perfect ? 'perfect' : 'loose', x: h.x, y: h.y, angle: ang, charge: c });
  fire(G, 'onAttack', { weapon: 'bow', combo, x: h.x, y: h.y, angle: ang });
  w.phase = 'loose'; w.looseT = 0; w.draw = 0; w.charge = 0; w.perfect = false;
}

function hitArrow(G, h, a, e) {
  const k = W(h);
  a.hit.add(e.id);
  damageFoe(G, e, a.dmg, { kind: a.kind, kb: a.perfect ? 380 : 140 + a.charge * 160, dx: a.vx, dy: a.vy, stun: a.perfect ? 0.35 : 0.12, hitstop: a.perfect ? 0.06 : 0.025, shake: a.perfect ? 0.24 : 0.08 });
  G.bus.emit('weaponFx', { weapon: 'bow', fx: 'arrowHit', x: e.x, y: e.y, angle: Math.atan2(a.vy, a.vx), perfect: a.perfect });
  if (k.markShots && !e.dead) addStatus(G, e, 'mothlit', 4, 1);
  if (a.perfect && k.hymn) { G.bus.emit('weaponFx', { weapon: 'bow', fx: 'hymn', x: e.x, y: e.y }); K.ring(G, e.x, e.y, { r0: 10, r1: 150, life: 0.35, dmg: k.hymn, element: 'gold', kb: 260, kind: 'attack', style: 'hymn' }); }
  if (k.split && a.charge >= 1 && !a.shard) {
    const base = Math.atan2(a.vy, a.vx), sp = Math.hypot(a.vx, a.vy) * 0.8;
    for (const d of [-0.55, 0, 0.55]) { const s = arrow(G, h, base + d, { speed: sp, life: 0.28, dmg: a.dmg * k.split, shard: true, ric: 0 }); s.x = e.x; s.y = e.y; s.hit.add(e.id); }
    G.bus.emit('weaponFx', { weapon: 'bow', fx: 'split', x: e.x, y: e.y });
  }
  if (a.pierce > 0) { a.pierce--; return; }
  if (a.ric > 0) {
    let best = null, bd = 320;
    for (const f of G.foes) { if (!targetable(f) || a.hit.has(f.id)) continue; const d = Math.hypot(f.x - e.x, f.y - e.y); if (d < bd) { bd = d; best = f; } }
    if (best) { a.ric--; const sp = Math.hypot(a.vx, a.vy), d = bd || 1; a.vx = ((best.x - e.x) / d) * sp; a.vy = ((best.y - e.y) / d) * sp; a.x = e.x; a.y = e.y; a.life = Math.max(a.life, 0.35); return; }
  }
  a.dead = true;
}

function updateArrows(G, h, dt) {
  const w = h.wpn;
  if (!w.arrows.length) return;
  for (const a of w.arrows) {
    if (a.dead) continue;
    a.life -= dt;
    if (a.life <= 0) { a.dead = true; continue; }
    if (a.seek) {
      let best = null, bd = 420;
      for (const f of G.foes) { if (!targetable(f) || a.hit.has(f.id) || !(f.status && f.status.mothlit)) continue; const d = Math.hypot(f.x - a.x, f.y - a.y); if (d < bd) { bd = d; best = f; } }
      if (best) {
        const ang = Math.atan2(a.vy, a.vx), want = Math.atan2(best.y - a.y, best.x - a.x);
        let da = want - ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        const na = ang + Math.max(-9 * dt, Math.min(9 * dt, da)), sp = Math.hypot(a.vx, a.vy);
        a.vx = Math.cos(na) * sp; a.vy = Math.sin(na) * sp;
      }
    }
    const steps = 3;
    for (let i = 0; i < steps && !a.dead; i++) {
      a.x += (a.vx * dt) / steps; a.y += (a.vy * dt) / steps;
      if (G.chamber && !insideChamber(G.chamber, a.x, a.y, 0)) { a.dead = true; G.bus.emit('weaponFx', { weapon: 'bow', fx: 'arrowWall', x: a.x, y: a.y }); break; }
      const ob = G.chamber && G.chamber.obstacles;
      if (ob) for (const o of ob) if (!o.low && Math.hypot(a.x - o.x, a.y - o.y) < o.r) { a.dead = true; G.bus.emit('weaponFx', { weapon: 'bow', fx: 'arrowWall', x: a.x, y: a.y }); break; }
      if (a.dead) break;
      for (const e of G.foes) {
        if (!targetable(e) || a.hit.has(e.id)) continue;
        if (Math.hypot(e.x - a.x, e.y - a.y) > e.r + 8) continue;
        if (a.volley && a.seek && e.status && e.status.mothlit) { a.dmg *= 1 + a.seek; a.seek = 0; }
        hitArrow(G, h, a, e);
        if (a.dead) break;
      }
    }
  }
  w.arrows = w.arrows.filter((a) => !a.dead);
}

const bow = {
  id: 'bow',
  name: 'Warp Bow',
  init(G, h) { h.wpn = { phase: 'rec', draw: 0, charge: 0, perfect: false, arrows: [], lastShot: null, swing: null }; },

  attack(G, h) {
    const w = h.wpn || (bow.init(G, h), h.wpn);
    if ((h.state === 'attack' || h.state === 'dashAttack' || h.state === 'special') && !h.cancel) return false;
    const recentDash = h.state === 'dash' || G.t - (h.lastDashEnd ?? -9) < G.cfg.dash.strikeWindow;
    if (recentDash) {
      h.state = 'dashAttack'; h.st = 0; h.cancel = false; w.swing = 'snap';
      const ad = G.input.aimDir; if (ad && (ad.x || ad.y)) h.facing = Math.atan2(ad.y, ad.x);
      loose(G, h, { snap: true });
      return true;
    }
    h.state = 'attack'; h.st = 0; h.cancel = false; h.accel = 14;
    w.swing = 'draw'; w.phase = 'draw'; w.draw = 0; w.charge = 0; w.perfect = false; w.fullSent = false;
    // a tap: the button is already up by the time the buffered press is used
    w.tap = !G.input.attack;
    G.bus.emit('weaponFx', { weapon: 'bow', fx: 'nock', x: h.x, y: h.y, angle: h.facing });
    return true;
  },

  special(G, h) {
    const w = h.wpn || (bow.init(G, h), h.wpn);
    if (h.cd.special > 0) return false;
    if ((h.state === 'attack' || h.state === 'dashAttack') && !h.cancel && w.phase !== 'draw') return false;
    h.state = 'special'; h.st = 0; h.cancel = false; h.accel = 14;
    w.swing = 'volley'; w.phase = 'volley'; w.volleyDone = false; w.draw = 0; w.charge = 0;
    h.cd.special = BOW.volley.cooldown;
    G.bus.emit('special', { weapon: 'bow', x: h.x, y: h.y, angle: h.facing });
    return true;
  },

  cancel(G, h) { const w = h.wpn; if (!w) return; w.phase = 'rec'; w.draw = 0; w.charge = 0; w.perfect = false; w.swing = null; },

  update(G, h, dt) {
    const w = h.wpn; if (!w) return;
    updateArrows(G, h, dt);
    const I = G.input, k = W(h), sp = G.cfg.hero.speed * (h.stats.speed ?? 1), ks = 1 / (h.stats.attackSpeed ?? 1);
    const ad = I.aimDir;
    if (h.state === 'attack' && w.swing === 'draw') {
      if (w.phase === 'draw') {
        if (ad && (ad.x || ad.y)) h.facing = Math.atan2(ad.y, ad.x);
        w.draw += dt * (h.stats.attackSpeed ?? 1);
        const T = BOW.full / (k.draw || 1);
        w.charge = Math.min(1, w.draw / T);
        w.perfect = w.draw >= T && w.draw <= T + BOW.perfect;
        if (w.charge >= 1 && !w.fullSent) { w.fullSent = true; G.bus.emit('weaponFx', { weapon: 'bow', fx: 'full', x: h.x, y: h.y, angle: h.facing }); }
        const mv = 0.35 + (k.drawMove || 0) * 0.65;
        h.tvx = I.move.x * sp * mv; h.tvy = I.move.y * sp * mv;
        if (w.tap ? w.draw >= 0.06 : !I.attack) loose(G, h);
      } else {
        h.tvx = I.move.x * sp * 0.5; h.tvy = I.move.y * sp * 0.5;
        w.looseT += dt;
        h.cancel = w.looseT > BOW.rec * ks * 0.4;
        if (w.looseT >= BOW.rec * ks) { endAction(h); w.swing = null; w.phase = 'rec'; }
      }
    } else if (h.state === 'dashAttack' && w.swing === 'snap') {
      h.tvx = h.vx * 0.85; h.tvy = h.vy * 0.85; h.accel = 10;
      h.cancel = h.st > BOW.snapRec * 0.5;
      if (h.st >= BOW.snapRec * ks) { endAction(h); w.swing = null; w.phase = 'rec'; }
    } else if (h.state === 'special' && w.swing === 'volley') {
      const V = BOW.volley;
      if (h.st < V.wind && ad && (ad.x || ad.y)) h.facing = Math.atan2(ad.y, ad.x);
      h.tvx = I.move.x * sp * 0.3; h.tvy = I.move.y * sp * 0.3;
      if (!w.volleyDone && h.st >= V.wind * ks) {
        w.volleyDone = true;
        const n = V.n + (k.volley || 0), spread = V.spread * (1 + (k.volley || 0) * 0.08);
        fire(G, 'onSpecial', { x: h.x, y: h.y, angle: h.facing });
        for (let i = 0; i < n; i++) {
          const a = h.facing + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
          arrow(G, h, a, { speed: V.speed, life: V.life, dmg: V.dmg * (h.stats.specialDmg ?? 1), kind: 'special', volley: true, seek: k.seekMarked || 0, ric: 0 });
        }
        G.bus.emit('weaponFx', { weapon: 'bow', fx: 'volley', x: h.x, y: h.y, angle: h.facing, n });
      }
      h.cancel = w.volleyDone;
      if (h.st >= (V.wind + V.rec) * ks) { endAction(h); w.swing = null; w.phase = 'rec'; }
    }
  },
};
export default bow;
