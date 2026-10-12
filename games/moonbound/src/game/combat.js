// Damage, statuses and the weight of a hit. Every hit on a foe goes through
// hitFoe(), every hit on Maelis through hurtHero(): blessings, critical hits,
// statuses, ward (armour), knockback, hit-stop, shake, numbers, sound.
//
// Statuses on foes:
//   chill     stacks to 5, each slows 8%; at 5 the foe freezes solid for freezeTime (bosses are only slowed hard)
//   dawnmark  a mark that bursts into sunfire after 1.1 s, hurting the foe and those near it
//   umbra     stacks to umbraMax; each stack deals umbraDamage every 0.5 s for 4 s
//   daze      a short stun (Sunflare)
import { clamp, rng } from '../config.js';
import { FEEL } from './feel.js';
import { BURST, GROUND, GLOW } from '../fx/fx.js';

export const COL = {
  moon: [0.72, 0.92, 1.25, 1],
  white: [1.3, 1.35, 1.45, 1],
  frost: [0.62, 0.91, 1.25, 1],
  dawn: [1.4, 0.95, 0.42, 1],
  umbra: [0.62, 0.38, 1.25, 1],
  comet: [1.4, 0.55, 0.38, 1],
  soul: [0.45, 1.25, 1.3, 1],
  danger: [1.0, 0.55, 0.18, 1],
  dangerEdge: [1.0, 0.33, 0.12, 1],
  heal: [0.5, 1.4, 0.8, 1],
  gold: [1.2, 0.9, 0.35, 1],
};
const NUM = {
  hit: [1.25, 1.25, 1.25],
  crit: [1.5, 1.15, 0.35],
  cast: [0.6, 1.2, 1.5],
  curse: [0.85, 0.55, 1.5],
  dawn: [1.5, 1.05, 0.45],
  ward: [0.7, 0.75, 0.85],
  hurt: [1.5, 0.35, 0.3],
  heal: [0.55, 1.5, 0.7],
};

export function makeStatus() {
  return { chill: 0, chillT: 0, frozen: 0, dawn: 0, umbra: 0, umbraT: 0, umbraTick: 0, daze: 0, umbraDmg: 3 };
}

// speed multiplier from chill/freeze
export function slowOf(e) {
  const s = e.status;
  if (s.frozen > 0) return e.boss ? 0.45 : 0;
  if (s.daze > 0 && !e.boss) return 0;
  return 1 - s.chill * 0.08;
}
export function disabled(e) {
  return (!e.boss && (e.status.frozen > 0 || e.status.daze > 0)) || false;
}

export function inflict(world, e, kind, mods) {
  if (!e.alive) return;
  const s = e.status;
  if (kind === 'chill') {
    if (s.frozen > 0) return;
    s.chill = Math.min(5, s.chill + 1);
    s.chillT = mods.chillTime;
    if (s.chill >= 5) {
      s.chill = 0;
      s.frozen = mods.freezeTime * (e.boss ? 0.5 : 1);
      world.fx.burst(BURST.shatter, e.x, e.y, e.h * 0.5, COL.frost, 12, 0.6);
      world.audio.play('rune_burst', { x: e.x, y: e.y, gain: 0.35, rate: 1.6 });
      e.onFrozen?.(world);
    }
  } else if (kind === 'dawnmark') {
    if (s.dawn <= 0) s.dawn = 1.1;
  } else if (kind === 'umbra') {
    s.umbra = Math.min(mods.umbraMax, s.umbra + 1);
    s.umbraT = 4;
    s.umbraDmg = mods.umbraDamage;
  } else if (kind === 'daze') {
    s.daze = Math.max(s.daze, 0.5);
  }
}

// per sim step for each foe; returns nothing
export function tickStatus(world, e, dt) {
  const s = e.status;
  if (s.chillT > 0 && (s.chillT -= dt) <= 0) s.chill = 0;
  if (s.frozen > 0) s.frozen -= dt;
  if (s.daze > 0) s.daze -= dt;
  if (s.dawn > 0 && (s.dawn -= dt) <= 0) {
    s.dawn = 0;
    dawnBurst(world, e.x, e.y, e.h);
  }
  if (s.umbra > 0) {
    s.umbraT -= dt;
    s.umbraTick -= dt;
    if (s.umbraTick <= 0) {
      s.umbraTick = 0.5;
      hitFoe(world, e, s.umbra * s.umbraDmg, { slot: 'status', status: 'umbra', noStatus: true, quiet: true });
    }
    if (s.umbraT <= 0) s.umbra = 0;
  }
}

export function dawnBurst(world, x, y, h = 1.5) {
  const m = world.hero.mods;
  const R = m.dawnRadius;
  world.fx.burst(BURST.motes, x, y, h * 0.5, COL.dawn, 20, R * 0.7);
  world.fx.burst(BURST.sparks, x, y, h * 0.5, COL.dawn, 14, 0.8);
  world.fx.glow(GLOW.star, x, y, h * 0.55, 1.6, COL.dawn, 0.3, { grow: 0.6 });
  world.fx.ground(GROUND.shock, x, y, R, R, COL.dawn, 0.35);
  world.fx.light(x, y, 1.2, R * 2.5, [3, 2, 0.8], 0.3);
  world.audio.play('rune_burst', { x, y, gain: 0.5, rate: 1.3 });
  for (const f of world.enemies) {
    if (!f.alive) continue;
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < R + f.r) hitFoe(world, f, m.dawnDamage, { slot: 'status', status: 'dawn', noStatus: true, kx: f.x - x, ky: f.y - y, knock: 2 });
  }
}

// src: {slot: attack|special|cast|dash|status|trap|other, heavy, knock, kx, ky, noStatus, status, quiet, soft, color, finisher}
// quiet: no flash, sound, sparks, hit-stop or flinch (damage over time); soft: a soft flash and no hit-stop (rapid ticks)
export function hitFoe(world, e, base, src) {
  // nothing lands on a foe still rising or out of reach (a flinch mid-rise would skip rise() and leave it untargetable for good)
  if (!e.alive || !e.targetable || e.invulnerable) return 0;
  const hero = world.hero;
  const m = hero.mods;
  const slot = src.slot || 'other';
  let dmg = base;
  if (slot in m.dmg) dmg *= m.dmg[slot];
  if (slot !== 'trap') dmg *= m.dmg.all;
  if (e.status.chill > 0 || e.status.frozen > 0) dmg *= 1 + m.vsChill;
  if (e.hp >= e.maxHp && !e.ward) dmg *= 1 + m.vsFull;
  if (hero.afterDashT > 0 && slot !== 'status') dmg *= 1 + m.afterDash;
  if (e.status.frozen > 0 && !e.boss) dmg *= 1.15;
  // critical hits
  let crit = false;
  if (slot !== 'status' && slot !== 'trap') {
    const chance = m.crit + (e.status.umbra > 0 ? m.critVsUmbra : 0);
    if (chance > 0 && rng.next() < chance) {
      crit = true;
      dmg *= m.critMul;
    }
  }
  dmg = Math.max(1, Math.round(dmg * (e.dmgTaken || 1)));
  // ward (armour) first
  let toWard = 0;
  if (e.ward > 0) {
    toWard = Math.min(e.ward, dmg);
    e.ward -= toWard;
    dmg -= toWard;
    if (e.ward <= 0) {
      e.ward = 0;
      world.fx.burst(BURST.sparks, e.x, e.y, e.h * 0.6, [1.2, 1.1, 0.9, 1], 20, 1.2);
      world.fx.burst(BURST.dust, e.x, e.y, 0.2, [0.6, 0.6, 0.65, 0.9], 12, 1);
      world.audio.play('hit_armor', { x: e.x, y: e.y, gain: 1, rate: 0.7 });
      world.fx.number(e.x, e.y, e.h + 0.4, '!', NUM.crit, 0.7);
      e.onWardBroken?.(world);
    }
  }
  const fullBefore = e.hp >= e.maxHp;
  e.hp -= dmg;
  void fullBefore;
  e.lastHit = world.time;
  e.flash = Math.max(e.flash, src.quiet || src.soft ? 0.35 : 1);
  // numbers
  if (world.settings.numbers) {
    const col = crit ? NUM.crit : src.status === 'umbra' ? NUM.curse : src.status === 'dawn' ? NUM.dawn : slot === 'cast' ? NUM.cast : toWard && !dmg ? NUM.ward : NUM.hit;
    const size = (crit ? 0.62 : 0.42) + Math.min(0.35, (dmg + toWard) / 200);
    world.fx.number(e.x, e.y, e.h + 0.25, dmg + toWard, col, size);
  }
  // feel
  if (!src.quiet) {
    const heavy = src.heavy || crit;
    if (!src.soft) world.hitstop(e.boss ? FEEL.hitstop.boss : heavy ? FEEL.hitstop.heavy : FEEL.hitstop.light);
    world.fx.shake(heavy ? FEEL.shake.heavy : FEEL.shake.light);
    const hx = e.x;
    const hy = e.y;
    const hz = e.h * 0.55;
    world.fx.burst(BURST.sparks, hx, hy, hz, src.color || COL.moon, crit ? 18 : src.soft ? 4 : 10, crit ? 1.2 : 0.8);
    if (!src.soft) world.fx.glow(GLOW.star, hx, hy, hz, crit ? 1.4 : 0.9, src.color || COL.white, 0.12);
    if (!src.soft) world.fx.light(hx, hy, hz, 3.5, [1.6, 2, 2.4], 0.12);
    if (crit) world.audio.play('crit', { x: hx, y: hy });
    world.audio.play(toWard ? 'hit_armor' : e.hitSound || 'hit_bone', { x: hx, y: hy, gain: heavy ? 1.1 : 0.85 });
    if (world.input) world.input.rumble(heavy ? 0.5 : 0.25, heavy ? 0.6 : 0.35, heavy ? 120 : 60);
  }
  // knockback and flinch
  if (src.knock && !e.boss && e.ward <= 0) {
    const l = Math.hypot(src.kx || 0, src.ky || 0) || 1;
    const k = src.knock / (e.mass || 1);
    e.vx += ((src.kx || 0) / l) * k;
    e.vy += ((src.ky || 0) / l) * k;
  }
  if (!src.quiet && e.ward <= 0) e.flinch?.(world, src);
  // statuses
  if (!src.noStatus && m.inflict[slot]) for (const k of m.inflict[slot]) inflict(world, e, k, m);
  // Corvane: every third attack hit calls a star
  if (slot === 'attack' && m.starOnAttack) {
    hero.attackHits = (hero.attackHits || 0) + 1;
    if (hero.attackHits % 3 === 0) world.strike('star', e.x, e.y, m.starOnAttack, 0.35, 1.1);
  }
  if (e.hp <= 0) kill(world, e, src);
  return dmg + toWard;
}

export function kill(world, e, src) {
  if (!e.alive) return;
  e.alive = false;
  e.hp = 0;
  const m = world.hero.mods;
  const frozen = e.status.frozen > 0;
  if (frozen && m.shatter) {
    world.fx.burst(BURST.shatter, e.x, e.y, e.h * 0.5, COL.frost, 24, 1.4);
    world.audio.play('shatter_bone', { x: e.x, y: e.y, rate: 1.4 });
    for (const f of world.enemies) {
      if (f === e || !f.alive) continue;
      if (Math.hypot(f.x - e.x, f.y - e.y) < 2.6 + f.r) hitFoe(world, f, m.shatter, { slot: 'status', noStatus: true, kx: f.x - e.x, ky: f.y - e.y, knock: 4, quiet: true });
    }
  }
  if (e.status.umbra > 0 && m.harvest) world.spawnPickup('soul', e.x, e.y, m.harvest);
  world.hitstop(e.boss ? 0.25 : FEEL.hitstop.kill);
  world.fx.shake(e.boss ? 0.8 : 0.2);
  e.die(world, src);
  world.onFoeKilled(e);
}

// Maelis is hit. src: {x, y (where from), knock, by (a name for the death screen)}
export function hurtHero(world, amount, src = {}) {
  const h = world.hero;
  if (!h.alive || h.invulnerable() || world.god || world.run?.over) return false;
  const m = h.mods;
  if (h.wardUp) {
    h.wardUp = false;
    h.wardT = m.ward;
    h.iframes = 0.5;
    world.fx.burst(BURST.motes, h.x, h.y, 1, COL.dawn, 20, 1.2);
    world.fx.ground(GROUND.shock, h.x, h.y, 2, 2, COL.dawn, 0.35);
    world.audio.play('rune_burst', { x: h.x, y: h.y, rate: 1.5, gain: 0.6 });
    return false;
  }
  let dmg = amount * m.dmgTaken * (1 - world.assistResist());
  dmg = Math.max(1, Math.round(dmg));
  h.hp -= dmg;
  h.iframes = FEEL.hero.hurtIframes;
  h.lastHurtBy = src.by || h.lastHurtBy;
  world.fx.number(h.x, h.y, 2.1, dmg, NUM.hurt, 0.55);
  world.fx.flashScreen([1, 0.15, 0.1], 0.22, 5);
  world.fx.shake(FEEL.shake.hurt);
  world.fx.chroma = 0.012;
  world.hitstop(FEEL.hitstop.hurt);
  world.audio.play('hurt', { x: h.x, y: h.y });
  world.input?.rumble(0.8, 0.9, 180);
  world.fx.burst(BURST.sparks, h.x, h.y, 1, [1.3, 0.4, 0.3, 1], 12, 1);
  if (src.x !== undefined) h.knockFrom(src.x, src.y, src.knock ?? FEEL.hero.hurtKnock);
  h.flinch();
  if (m.hurtNova === 'frost') {
    world.fx.ground(GROUND.shock, h.x, h.y, 3, 3, COL.frost, 0.4);
    world.fx.burst(BURST.shatter, h.x, h.y, 0.8, COL.frost, 18, 1);
    for (const f of world.enemies) if (f.alive && Math.hypot(f.x - h.x, f.y - h.y) < 3 + f.r) inflict(world, f, 'chill', m), inflict(world, f, 'chill', m);
  }
  if (h.hp <= 0) {
    h.hp = 0;
    if (world.run && world.run.lastLight > 0) {
      world.run.lastLight--;
      h.hp = Math.round(h.maxHp * 0.4);
      h.iframes = 2;
      world.fx.flashScreen([0.7, 0.9, 1.2], 0.8, 2);
      world.fx.burst(BURST.motes, h.x, h.y, 1, COL.moon, 24, 2);
      world.fx.ground(GROUND.rune, h.x, h.y, 3, 3, COL.moon, 1.2, { p0: 1 });
      world.audio.stinger('blessing');
      world.toast('Last Light', 'The moon will not let you fall. Not yet.');
      for (const f of world.enemies) if (f.alive && Math.hypot(f.x - h.x, f.y - h.y) < 4) hitFoe(world, f, 1, { slot: 'other', knock: 9, kx: f.x - h.x, ky: f.y - h.y, quiet: true, noStatus: true });
    } else world.heroDied();
  }
  return true;
}

export function healHero(world, amount, quiet = false) {
  const h = world.hero;
  const before = h.hp;
  h.hp = clamp(h.hp + amount, 0, h.maxHp);
  const got = Math.round(h.hp - before);
  if (got > 0 && !quiet) {
    world.fx.number(h.x, h.y, 2.1, '+' + got, NUM.heal, 0.5);
    world.fx.burst(BURST.motes, h.x, h.y, 0.9, COL.heal, 14, 1);
  }
  return got;
}

// is (px, py) inside an attack shape centred on (x, y) facing `angle`?
// shape: arc (range, half = half-angle), circle (range), line (range, width), ring (range, inner)
export function inShape(sh, x, y, angle, px, py, pr = 0) {
  const dx = px - x;
  const dy = py - y;
  const d = Math.hypot(dx, dy);
  if (sh.shape === 'circle') return d <= sh.range + pr;
  if (sh.shape === 'ring') return d <= sh.range + pr && d >= sh.inner - pr;
  if (sh.shape === 'arc') {
    if (d > sh.range + pr) return false;
    if (d < pr + 0.4) return true;
    let a = Math.atan2(dy, dx) - angle;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    return Math.abs(a) <= sh.half + Math.asin(Math.min(1, pr / Math.max(d, 1e-3)));
  }
  if (sh.shape === 'line') {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const along = dx * c + dy * s;
    const across = -dx * s + dy * c;
    return along >= -pr && along <= sh.range + pr && Math.abs(across) <= sh.width / 2 + pr;
  }
  return false;
}
