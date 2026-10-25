// The Shuttle Blade: Iri's curved sword of woven light. Reference weapon.
//
// ---------------------------------------------------------------- weapon module contract
// A weapon is src/sim/weapons/<id>.js with a default export (named exports work too):
//   {
//     id: 'blade',
//     init(G, h)              equip / new run: reset h.wpn (the weapon's scratch object, saved nowhere)
//     update(G, h, dt)        every gameplay tick while the hero lives (any state). While h.state is
//                             'attack' | 'special' | 'dashAttack' the weapon owns the hero: set h.tvx/h.tvy (target
//                             velocity, px/s) and optionally h.accel (lerp rate, 0 = instant); set h.cancel = true
//                             when the next press may chain; call endAction(h) when the action is over.
//     attack(G, h) -> bool    an attack press is buffered and the hero is free, mid-dash, or in a cancel window.
//                             Start the next swing (set h.state, h.st = 0) and return true, or false to keep it buffered.
//                             h.state === 'dash' or G.t - h.lastDashEnd < cfg.dash.strikeWindow means a dash-strike.
//     special(G, h) -> bool   same for the special (check h.cd.special yourself)
//     cancel?(G, h)           a dash / call / snare interrupted the action: drop pending hits
//     onSnare?(G, h, foe)     the golden thread lodged in a foe
//   }
// Deal damage with hitFoes(G, shape, hit) or shoot(G, { team: 'hero', ... }) from combat.js. Scale by
// h.stats.attackDmg / specialDmg if present (boons.js beforeHit also applies multipliers by kind), and timings by
// h.stats.attackSpeed. Emit 'swing' {weapon, combo, x, y, angle} on each swing start and 'special' {weapon, x, y, angle};
// fire boon hooks 'onAttack' {weapon, combo, x, y, angle} at the active frame and 'onSpecial' {x, y, angle}.
// The renderer reads h.wpn freely (swing index, phase), so keep visual state there: blade exposes
// h.wpn = { swing (data below), idx, hitDone, phase: 'wind'|'act'|'rec' }.
// ----------------------------------------------------------------
import { hitFoes, fire } from '../combat.js';
import { endAction } from '../hero.js';

// Angles are offsets from the facing, in radians. arc = HALF angle of the hit cone.
export const SWINGS = [
  { wind: 0.05, act: 0.08, rec: 0.17, from: -1.25, to: 1.15, reach: 104, arc: 1.25, dmg: 22, lunge: 220, kb: 280, hitstop: 0.045, shake: 0.16 },
  { wind: 0.05, act: 0.08, rec: 0.17, from: 1.2, to: -1.2, reach: 104, arc: 1.25, dmg: 22, lunge: 220, kb: 280, hitstop: 0.045, shake: 0.16 },
  { wind: 0.11, act: 0.12, rec: 0.3, from: -2.6, to: 2.6, reach: 132, arc: 2.7, dmg: 44, lunge: 380, kb: 540, hitstop: 0.09, shake: 0.36, heavy: true },
];
export const DASH_STRIKE = { wind: 0.03, act: 0.1, rec: 0.2, from: -0.35, to: 0.35, reach: 150, arc: 0.45, dmg: 32, lunge: 900, kb: 420, hitstop: 0.06, shake: 0.24, thrust: true };
export const SPIN = { wind: 0.1, act: 0.26, rec: 0.24, reach: 140, dmg: 26, kb: 420, hits: [0.08, 0.2], cooldown: 0.75, hitstop: 0.07, shake: 0.32 };

function startSwing(G, h, data, idx, state) {
  const w = h.wpn;
  w.swing = data; w.idx = idx; w.hitDone = false; w.phase = 'wind'; w.once = new Set();
  h.state = state; h.st = 0; h.cancel = false; h.combo = idx;
  h.accel = 16;
  G.bus.emit('swing', { weapon: 'blade', combo: idx, x: h.x, y: h.y, angle: h.facing, heavy: !!data.heavy, thrust: !!data.thrust });
}

const blade = {
  id: 'blade',
  name: 'Shuttle Blade',
  init(G, h) { h.wpn = { swing: null, idx: 0, next: 0, hitDone: false, phase: 'rec', once: null }; },

  attack(G, h) {
    const w = h.wpn || (h.wpn = {});
    if ((h.state === 'attack' || h.state === 'dashAttack' || h.state === 'special') && !h.cancel) return false;
    const recentDash = h.state === 'dash' || G.t - (h.lastDashEnd ?? -9) < G.cfg.dash.strikeWindow;
    if (recentDash && h.state !== 'attack') { startSwing(G, h, DASH_STRIKE, 3, 'dashAttack'); return true; }
    let idx = 0;
    if (h.state === 'attack') idx = (w.idx + 1) % 3;
    else if (h.comboWin > 0) idx = w.next ?? 0;
    startSwing(G, h, SWINGS[idx], idx, 'attack');
    return true;
  },

  special(G, h) {
    if (h.cd.special > 0) return false;
    if ((h.state === 'attack' || h.state === 'dashAttack') && !h.cancel) return false;
    const w = h.wpn;
    w.swing = SPIN; w.idx = 4; w.hitN = 0; w.phase = 'wind'; w.once = null;
    h.state = 'special'; h.st = 0; h.cancel = false; h.accel = 10;
    h.cd.special = SPIN.cooldown;
    G.bus.emit('special', { weapon: 'blade', x: h.x, y: h.y, angle: h.facing });
    return true;
  },

  cancel(G, h) { const w = h.wpn; if (w) { w.hitDone = true; w.phase = 'rec'; } },

  update(G, h, dt) {
    const w = h.wpn;
    if (!w || !w.swing) return;
    const I = G.input, sp = G.cfg.hero.speed * (h.stats.speed ?? 1), k = 1 / (h.stats.attackSpeed ?? 1);
    if (h.state === 'attack' || h.state === 'dashAttack') {
      const s = w.swing, wind = s.wind * k, act = s.act * k, rec = s.rec * k;
      const ad = I.aimDir;
      if (h.st < wind && ad && (ad.x || ad.y)) h.facing = Math.atan2(ad.y, ad.x);
      const fx = Math.cos(h.facing), fy = Math.sin(h.facing);
      w.phase = h.st < wind ? 'wind' : h.st < wind + act ? 'act' : 'rec';
      if (w.phase === 'act') { h.tvx = fx * s.lunge; h.tvy = fy * s.lunge; h.accel = s.thrust ? 0 : 16; }
      else { h.tvx = I.move.x * sp * G.cfg.hero.attackMove; h.tvy = I.move.y * sp * G.cfg.hero.attackMove; h.accel = s.thrust && w.phase === 'rec' ? 12 : 16; }
      if (!w.hitDone && h.st >= wind + act * 0.35) {
        w.hitDone = true;
        const kind = 'attack';
        const shape = s.thrust
          ? { type: 'line', x: h.x, y: h.y, x2: h.x + fx * s.reach, y2: h.y + fy * s.reach, w: 70 }
          : { type: 'arc', x: h.x, y: h.y, r: s.reach, angle: h.facing, arc: s.arc };
        fire(G, 'onAttack', { weapon: 'blade', combo: w.idx, x: h.x, y: h.y, angle: h.facing });
        hitFoes(G, shape, { dmg: s.dmg * (h.stats.attackDmg ?? 1), kb: s.kb, kind, element: null, once: w.once, hitstop: s.hitstop, shake: s.shake, dx: s.thrust ? fx : undefined, dy: s.thrust ? fy : undefined, heavy: !!s.heavy });
      }
      h.cancel = h.st >= wind + act * 0.9;
      if (h.st >= wind + act + rec) {
        const was = w.idx;
        endAction(h);
        w.swing = null; w.phase = 'rec';
        if (was < 2) { h.comboWin = 0.25; w.next = was + 1; } else { h.comboWin = 0; w.next = 0; }
      }
    } else if (h.state === 'special') {
      const s = SPIN, wind = s.wind * k, act = s.act * k, rec = s.rec * k;
      w.phase = h.st < wind ? 'wind' : h.st < wind + act ? 'act' : 'rec';
      h.tvx = I.move.x * sp * 0.45; h.tvy = I.move.y * sp * 0.45;
      while (w.hitN < s.hits.length && h.st >= wind + s.hits[w.hitN] * k) {
        const last = w.hitN === s.hits.length - 1;
        if (w.hitN === 0) fire(G, 'onSpecial', { x: h.x, y: h.y, angle: h.facing });
        hitFoes(G, { type: 'circle', x: h.x, y: h.y, r: s.reach }, { dmg: s.dmg * (h.stats.specialDmg ?? 1), kb: last ? s.kb : 120, kind: 'special', stun: last ? 0.35 : 0.15, hitstop: last ? s.hitstop : 0.03, shake: last ? s.shake : 0.12 });
        w.hitN++;
      }
      h.cancel = h.st >= wind + act;
      if (h.st >= wind + act + rec) { endAction(h); w.swing = null; w.phase = 'rec'; }
    }
  },
};
export default blade;
