// The Heddle Gauntlets: a rapid five-blow flurry (four jabs, alternating fists, then an
// uppercut); out of a Dash, Attack becomes a flying Dash-punch; the Special is the Loom
// Slam, a short leap that crashes down in a shockwave. Interface: see the header of blade.js.
//
// h.wpn (render reads it): { swing, idx, next, phase: 'wind'|'act'|'rec', hitDone, once, fist (0 left,
//   1 right), slam: { t, x0, y0, x1, y1, landed } | null, lucky (hit counter) }
// The hop sets h.z (height) during the slam; the hero painter can lift the sprite by it.
// Knobs from stats.w: dashPunch, lucky, fray, uppercutStun, cometReach, comet, slamR, slamPull.
// Bus: swing {weapon:'gauntlets', combo, fist, heavy, dash}, special {weapon:'gauntlets'},
//   weaponFx {weapon:'gauntlets', fx: 'punch'|'uppercut'|'comet'|'leap'|'slam'|'fray', x, y, angle}
import { hitFoes, damageFoe, knock, fire, targetable, emitShake } from '../combat.js';
import { endAction } from '../hero.js';
import { insideChamber } from '../world.js';

const JAB = { wind: 0.03, act: 0.05, rec: 0.085, reach: 80, arc: 0.72, dmg: 11, lunge: 140, kb: 90, hitstop: 0.022, shake: 0.06 };
export const FLURRY = [JAB, JAB, JAB, JAB,
  { wind: 0.08, act: 0.08, rec: 0.24, reach: 94, arc: 0.95, dmg: 30, lunge: 220, kb: 440, hitstop: 0.075, shake: 0.3, heavy: true, upper: true }];
export const DASH_PUNCH = { wind: 0.02, act: 0.14, rec: 0.2, reach: 118, w: 74, dmg: 36, lunge: 1100, kb: 540, hitstop: 0.07, shake: 0.3, dash: true, heavy: true };
export const SLAM = { wind: 0.1, air: 0.22, rec: 0.26, hop: 150, r: 128, dmg: 42, kb: 540, stun: 0.5, cooldown: 1.0, pullR: 270 };
const W = (h) => (h.stats && h.stats.w) || {};

function startSwing(G, h, data, idx, state) {
  const w = h.wpn;
  w.swing = data; w.idx = idx; w.hitDone = false; w.phase = 'wind'; w.once = new Set();
  w.fist = data.dash ? 1 : idx % 2;
  h.state = state; h.st = 0; h.cancel = false; h.combo = idx; h.accel = 18;
  G.bus.emit('swing', { weapon: 'gauntlets', combo: idx, fist: w.fist, x: h.x, y: h.y, angle: h.facing, heavy: !!data.heavy, dash: !!data.dash });
}

function strike(G, h, s, shape, extra = {}) {
  const w = h.wpn, k = W(h);
  // Pell's lucky knuckles: every Nth blow is a Critical hit
  let crit = false;
  if (k.lucky) { w.lucky = (w.lucky || 0) + 1; if (w.lucky >= k.lucky) { w.lucky = 0; crit = true; } }
  const hit = hitFoes(G, shape, Object.assign({ dmg: s.dmg * (h.stats.attackDmg ?? 1) * (extra.mult || 1), kb: s.kb, kind: 'attack', once: w.once, hitstop: s.hitstop, shake: s.shake, crit }, extra.hit || {}));
  if (k.fray) {
    for (const e of hit) {
      if (e.dead) continue;
      e.fray = (e.fray || 0) + 1;
      if (e.fray >= 8) {
        e.fray = 0;
        G.bus.emit('weaponFx', { weapon: 'gauntlets', fx: 'fray', x: e.x, y: e.y });
        damageFoe(G, e, k.fray, { kind: 'attack', kb: 200, stun: 0.4, hitstop: 0.05, shake: 0.2 });
      }
    }
  }
  return hit;
}

const gauntlets = {
  id: 'gauntlets',
  name: 'Heddle Gauntlets',
  init(G, h) { h.wpn = { swing: null, idx: 0, next: 0, hitDone: false, phase: 'rec', once: null, fist: 0, slam: null, lucky: 0 }; },

  attack(G, h) {
    const w = h.wpn || (gauntlets.init(G, h), h.wpn);
    if ((h.state === 'attack' || h.state === 'dashAttack' || h.state === 'special') && !h.cancel) return false;
    const recentDash = h.state === 'dash' || G.t - (h.lastDashEnd ?? -9) < G.cfg.dash.strikeWindow;
    if (recentDash && h.state !== 'attack') { startSwing(G, h, DASH_PUNCH, 5, 'dashAttack'); return true; }
    let idx = 0;
    if (h.state === 'attack') idx = (w.idx + 1) % FLURRY.length;
    else if (h.comboWin > 0) idx = w.next ?? 0;
    startSwing(G, h, FLURRY[idx], idx, 'attack');
    return true;
  },

  special(G, h) {
    const w = h.wpn || (gauntlets.init(G, h), h.wpn);
    if (h.cd.special > 0) return false;
    if ((h.state === 'attack' || h.state === 'dashAttack') && !h.cancel) return false;
    const ad = G.input.aimDir; if (ad && (ad.x || ad.y)) h.facing = Math.atan2(ad.y, ad.x);
    const fx = Math.cos(h.facing), fy = Math.sin(h.facing);
    let x1 = h.x + fx * SLAM.hop, y1 = h.y + fy * SLAM.hop;
    if (G.chamber) for (let i = 0; i < 6 && !insideChamber(G.chamber, x1, y1, 30); i++) { x1 = (x1 + h.x) / 2; y1 = (y1 + h.y) / 2; }
    w.swing = SLAM; w.idx = 6; w.phase = 'wind'; w.slam = { x0: h.x, y0: h.y, x1, y1, landed: false, pulled: false };
    h.state = 'special'; h.st = 0; h.cancel = false; h.accel = 0;
    h.cd.special = SLAM.cooldown;
    G.bus.emit('special', { weapon: 'gauntlets', x: h.x, y: h.y, angle: h.facing });
    return true;
  },

  cancel(G, h) { const w = h.wpn; if (!w) return; w.hitDone = true; w.phase = 'rec'; if (w.slam) { w.slam = null; h.z = 0; } },

  update(G, h, dt) {
    const w = h.wpn;
    if (!w || !w.swing) { if (h.z && !(w && w.slam)) h.z = 0; return; }
    const I = G.input, sp = G.cfg.hero.speed * (h.stats.speed ?? 1), k = 1 / (h.stats.attackSpeed ?? 1), kw = W(h);
    if (h.state === 'attack' || h.state === 'dashAttack') {
      const s = w.swing;
      const comet = s.dash ? kw.cometReach || 0 : 0;
      const wind = s.wind * k, act = s.act * k * (1 + comet * 0.6), rec = s.rec * k;
      const ad = I.aimDir;
      if (h.st < wind && ad && (ad.x || ad.y)) h.facing = Math.atan2(ad.y, ad.x);
      const fx = Math.cos(h.facing), fy = Math.sin(h.facing);
      w.phase = h.st < wind ? 'wind' : h.st < wind + act ? 'act' : 'rec';
      if (w.phase === 'act') { h.tvx = fx * s.lunge; h.tvy = fy * s.lunge; h.accel = s.dash ? 0 : 18; }
      else { h.tvx = I.move.x * sp * G.cfg.hero.attackMove; h.tvy = I.move.y * sp * G.cfg.hero.attackMove; h.accel = s.dash && w.phase === 'rec' ? 12 : 18; }
      if (s.dash) {
        // the flying punch hits all along its path
        if (w.phase === 'act') {
          if (!w.hitDone) { w.hitDone = true; fire(G, 'onAttack', { weapon: 'gauntlets', combo: 5, x: h.x, y: h.y, angle: h.facing }); }
          const hit = strike(G, h, s, { type: 'line', x: h.x - fx * 20, y: h.y - fy * 20, x2: h.x + fx * s.reach, y2: h.y + fy * s.reach, w: s.w }, { mult: kw.dashPunch || 1, hit: { dx: fx, dy: fy, stun: 0.3 } });
          if (hit.length && kw.comet && !w.cometDone) {
            w.cometDone = true;
            const e = hit[0];
            G.bus.emit('weaponFx', { weapon: 'gauntlets', fx: 'comet', x: e.x, y: e.y });
            hitFoes(G, { type: 'circle', x: e.x, y: e.y, r: 105 }, { dmg: 20 * (h.stats.attackDmg ?? 1), kb: 380, kind: 'attack', once: w.once, hitstop: 0.05, shake: 0.3 });
          }
        }
      } else if (!w.hitDone && h.st >= wind + act * 0.4) {
        w.hitDone = true;
        fire(G, 'onAttack', { weapon: 'gauntlets', combo: w.idx, x: h.x, y: h.y, angle: h.facing });
        const extra = s.upper && kw.uppercutStun ? { hit: { stun: kw.uppercutStun } } : {};
        const hit = strike(G, h, s, { type: 'arc', x: h.x, y: h.y, r: s.reach, angle: h.facing, arc: s.arc }, extra);
        G.bus.emit('weaponFx', { weapon: 'gauntlets', fx: s.upper ? 'uppercut' : 'punch', x: h.x + fx * s.reach * 0.7, y: h.y + fy * s.reach * 0.7, angle: h.facing, fist: w.fist, hit: hit.length });
      }
      h.cancel = h.st >= wind + act * 0.85;
      if (h.st >= wind + act + rec) {
        const was = w.idx;
        endAction(h); w.swing = null; w.phase = 'rec'; w.cometDone = false;
        if (was < FLURRY.length - 1 && !s.dash) { h.comboWin = 0.22; w.next = was + 1; } else { h.comboWin = 0; w.next = 0; }
      }
    } else if (h.state === 'special' && w.swing === SLAM && w.slam) {
      const S = SLAM, sl = w.slam, wind = S.wind * k, air = S.air, rec = S.rec * k;
      const R = S.r * (kw.slamR || 1);
      if (h.st < wind) { w.phase = 'wind'; h.tvx = 0; h.tvy = 0; h.z = 0; }
      else if (h.st < wind + air) {
        w.phase = 'act';
        if (!sl.leapt) { sl.leapt = true; G.bus.emit('weaponFx', { weapon: 'gauntlets', fx: 'leap', x: h.x, y: h.y, angle: h.facing }); h.inv = Math.max(h.inv, air * 0.8); }
        if (kw.slamPull && !sl.pulled) {
          sl.pulled = true;
          for (const e of G.foes) if (targetable(e) && !e.boss && Math.hypot(e.x - sl.x1, e.y - sl.y1) < S.pullR) knock(G, e, sl.x1 - e.x, sl.y1 - e.y, Math.min(900, Math.hypot(e.x - sl.x1, e.y - sl.y1) * 3.2));
        }
        const u = (h.st - wind) / air;
        h.tvx = (sl.x1 - sl.x0) / air; h.tvy = (sl.y1 - sl.y0) / air;
        h.z = Math.sin(Math.PI * u) * 46;
      } else {
        w.phase = 'rec'; h.z = 0; h.tvx = 0; h.tvy = 0;
        if (!sl.landed) {
          sl.landed = true;
          fire(G, 'onSpecial', { x: h.x, y: h.y, angle: h.facing });
          G.bus.emit('weaponFx', { weapon: 'gauntlets', fx: 'slam', x: h.x, y: h.y, r: R });
          emitShake(G, 0.4, h.x, h.y);
          hitFoes(G, { type: 'circle', x: h.x, y: h.y, r: R }, { dmg: S.dmg * (h.stats.specialDmg ?? 1), kb: S.kb, kind: 'special', stun: S.stun, hitstop: 0.09, shake: 0.5, heavy: true });
        }
        h.cancel = h.st >= wind + air + rec * 0.4;
        if (h.st >= wind + air + rec) { endAction(h); w.swing = null; w.slam = null; w.phase = 'rec'; }
      }
    }
  },
};
export default gauntlets;
