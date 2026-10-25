// Loomwake boons: 6 patrons x 12 (5 action slots, 5 passives, 2 legendaries).
// Also the shared value/text helpers and the DEFS registry that covers every effect
// source the runtime (src/sim/boons.js) understands: boons, braids, tempers, aspects
// and keepsakes. This file imports data only.
//
// A boon:
//   { id: '<patron>.<key>', patron, slot: 'attack'|'special'|'snare'|'dash'|'call'|'passive',
//     name, text ('{dmg}' or '{dmg%}' placeholders resolved from values), values,
//     needs?: [[ids...], ...] (every group needs one owned id), legendary?, tags?, hooks }
// values: an array [common, rare, epic, mythic] (v is then a number), or an object of
//   such arrays / constants / { r: [..], lvl } (v is then an object). Each Knot level past
//   1 adds `lvl` (default: the common-to-rare step) to every array value.
// hooks (all optional; v = resolved values, K = the runtime toolkit, b = { id, rarity, level }):
//   stats(s, v, G)                       modify G.hero.stats while owned
//   beforeHit(G, ctx, v, K, b)           ctx { target, dmg, kind, element, crit, kb, bonus,
//                                        mult, critChance, critMult, x, y, angle, boon }
//   onHit, onKill {e}, beforeHurt {dmg, src, dodged}, onHurt, onAttack, onSpecial, onSnare,
//   onSnareHit {target}, onDash {x,y,dx,dy}, onDashEnd {x,y}, onRoomStart, onRoomClear,
//   tick {dt}, call(G, v, K, b) (call-slot boons: the patron ultimate)
// ctx.kind 'boon' marks damage made by boons themselves (no slot effects re-trigger on it).

import { BRAIDS } from './braids.js';
import { WEAPONS } from './weapons.js';
import { KEEPSAKES } from './keepsakes.js';

export const RARITIES = ['common', 'rare', 'epic', 'mythic'];
export const RARITY = {
  common: { i: 0, name: 'Common', color: '#e8e2d0', glow: '#ffffff' },
  rare: { i: 1, name: 'Rare', color: '#6fb8ff', glow: '#5ec8ff' },
  epic: { i: 2, name: 'Epic', color: '#c28cff', glow: '#b48cff' },
  mythic: { i: 3, name: 'Mythic', color: '#ffb347', glow: '#ff9a3a' },
  braid: { i: 2, name: 'Braid', color: '#8ff5d0', glow: '#8ff5d0' },
  legendary: { i: 3, name: 'Legendary', color: '#ffe27a', glow: '#ffd27a' },
};
export const SLOTS = ['attack', 'special', 'snare', 'dash', 'call'];
export const SLOT_NAMES = { attack: 'Attack', special: 'Special', snare: 'Snare', dash: 'Dash', call: 'Call', passive: 'Passive' };
export const MAX_LEVEL = 9;

const r4 = (a, b, c, d) => [a, b, c, d];
const B = [];
const boon = (o) => { B.push(o); return o; };

// ---------------------------------------------------------------- Solenne, Dawn
const BURNERS = ['solenne.attack', 'solenne.snare', 'solenne.call', 'solenne.halo', 'solenne.dash'];
const BLINDERS = ['solenne.special', 'solenne.dash', 'solenne.call', 'solenne.halo'];
boon({
  id: 'solenne.attack', patron: 'solenne', slot: 'attack', name: 'Dawnstrike',
  text: 'Your Attack deals {dmg%} more damage and sets foes Burning for {burn} damage per second.',
  values: { dmg: r4(0.2, 0.3, 0.4, 0.5), burn: r4(6, 9, 12, 15) }, tags: ['burn'],
  hooks: {
    beforeHit(G, c, v) { if (c.kind === 'attack') { c.bonus += v.dmg; c.element = c.element || 'dawn'; } },
    onHit(G, c, v, K) { if (c.kind === 'attack') K.burn(G, c.target, v.burn); },
  },
});
boon({
  id: 'solenne.special', patron: 'solenne', slot: 'special', name: 'Daybreak Edge',
  text: 'Your Special deals {dmg%} more damage and Blinds foes for {t}s. Blinded foes miss half their blows.',
  values: { dmg: r4(0.35, 0.5, 0.65, 0.8), t: r4(2, 2.5, 3, 3.5) }, tags: ['blind'],
  hooks: {
    beforeHit(G, c, v) { if (c.kind === 'special') c.bonus += v.dmg; },
    onHit(G, c, v, K) { if (c.kind === 'special') K.blind(G, c.target, v.t); },
  },
});
boon({
  id: 'solenne.snare', patron: 'solenne', slot: 'snare', name: 'Sunthread',
  text: 'Where your Snare lodges, a Sunspot kindles for {t}s, Burning foes inside for {dps} per second.',
  values: { dps: r4(10, 14, 18, 22), t: 4 }, tags: ['burn', 'sunspot'],
  hooks: { onSnareHit(G, c, v, K) { K.sunspot(G, c.target.x, c.target.y, { dps: v.dps, life: v.t, r: 78 }); } },
});
boon({
  id: 'solenne.dash', patron: 'solenne', slot: 'dash', name: 'Morning Step',
  text: 'Your Dash ends in a flare of dawn: {dmg} damage to foes nearby, Blinding them for 2s.',
  values: { dmg: r4(12, 18, 24, 30) }, tags: ['blind', 'burn'],
  hooks: {
    onDashEnd(G, c, v, K) {
      K.fx(G, 'flare', { x: c.x, y: c.y, r: 120, element: 'dawn' });
      for (const e of K.area(G, c.x, c.y, 120, v.dmg, { element: 'dawn', kb: 160 })) K.blind(G, e, 2);
    },
  },
});
boon({
  id: 'solenne.call', patron: 'solenne', slot: 'call', name: 'Dawnbreak',
  text: 'Call: a radiant nova bursts from you for {dmg} damage, Blinding every foe and scattering {n} Sunspots.',
  values: { dmg: r4(80, 110, 140, 170), n: { r: r4(3, 4, 5, 6), lvl: 0 } }, tags: ['burn', 'blind', 'sunspot'],
  hooks: {
    call(G, v, K) {
      const h = G.hero;
      K.ring(G, h.x, h.y, { r0: 30, r1: 300, life: 0.45, dmg: v.dmg, element: 'dawn', kb: 650, stun: 0.8, kind: 'call', status: ['blind', 3] });
      K.fx(G, 'nova', { x: h.x, y: h.y, r: 520, element: 'dawn' });
      for (const e of K.foes(G)) K.blind(G, e, 4);
      const rng = K.rng(G);
      for (let i = 0; i < v.n; i++) {
        const a = (i / v.n) * Math.PI * 2 + rng() * 0.6, d = 110 + rng() * 170;
        K.sunspot(G, h.x + Math.cos(a) * d, h.y + Math.sin(a) * d * 0.75, { dps: v.dmg * 0.16, life: 6, r: 84, delay: 0.25 + i * 0.07 });
      }
    },
  },
});
boon({
  id: 'solenne.kindled', patron: 'solenne', slot: 'passive', name: 'Kindled Wounds',
  text: 'Burning foes take {v%} more damage from everything.', values: r4(0.15, 0.2, 0.25, 0.3), needs: [BURNERS],
  hooks: { beforeHit(G, c, v, K) { if (K.has(c.target, 'burn')) c.bonus += v; } },
});
boon({
  id: 'solenne.flare', patron: 'solenne', slot: 'passive', name: 'Solar Flare',
  text: 'Burning foes burst into sunlight when slain, dealing {v} damage around them.', values: r4(20, 30, 40, 50), needs: [BURNERS],
  hooks: {
    onKill(G, c, v, K) {
      if (!K.has(c.e, 'burn')) return;
      K.fx(G, 'burst', { x: c.e.x, y: c.e.y, r: 130, element: 'dawn' });
      for (const e of K.area(G, c.e.x, c.e.y, 130, v, { element: 'dawn', kb: 260 })) K.burn(G, e, v * 0.25);
    },
  },
});
boon({
  id: 'solenne.halo', patron: 'solenne', slot: 'passive', name: 'Glare',
  text: 'Foes that strike you, and any near them, are Blinded and Burn for {v} damage per second.', values: r4(8, 12, 16, 20),
  hooks: {
    onHurt(G, c, v, K, b) {
      if (!c.src || !K.cd(G, b, 'glare', 0.4)) return;
      K.fx(G, 'flare', { x: c.src.x, y: c.src.y, r: 110, element: 'dawn' });
      for (const e of K.foesNear(G, c.src.x, c.src.y, 110)) { K.blind(G, e, 3); K.burn(G, e, v); }
    },
  },
});
boon({
  id: 'solenne.sunwell', patron: 'solenne', slot: 'passive', name: 'Sunwell',
  text: 'All healing restores {heal%} more, and clearing a chamber restores {hp} health.',
  values: { heal: r4(0.1, 0.15, 0.2, 0.25), hp: r4(3, 5, 7, 9) },
  hooks: { stats(s, v) { s.healMult += v.heal; }, onRoomClear(G, c, v, K) { K.heal(G, v.hp); } },
});
boon({
  id: 'solenne.searing', patron: 'solenne', slot: 'passive', name: 'Searing Light',
  text: 'Your Burn deals {v%} more damage, and your Blinds last 1s longer.', values: r4(0.25, 0.4, 0.55, 0.7), needs: [BURNERS],
  hooks: { stats(s, v) { s.burnMult += v; s.blindPlus += 1; } },
});
boon({
  id: 'solenne.noonday', patron: 'solenne', slot: 'passive', legendary: true, name: 'Noonday Sun',
  text: 'Your Sunspots spread wider and flare every 1.5s for {v} damage to every foe inside.',
  values: { r: [30, 30, 30, 30], lvl: 6 }, needs: [['solenne.snare', 'solenne.call']],
  hooks: { stats(s, v) { s.flags.noonday = v; } },
});
boon({
  id: 'solenne.zenith', patron: 'solenne', slot: 'passive', legendary: true, name: 'Zenith',
  text: 'Every 6th Attack hit calls down a pillar of dawn on the foe for {v} damage.',
  values: { r: [65, 65, 65, 65], lvl: 12 }, needs: [['solenne.attack']],
  hooks: {
    onHit(G, c, v, K, b) {
      if (c.kind !== 'attack') return;
      const m = K.mem(G, b); m.n = (m.n || 0) + 1;
      if (m.n >= 6) { m.n = 0; K.strike(G, c.target.x, c.target.y, { dmg: v, element: 'dawn', r: 95, delay: 0.32, style: 'pillar', status: ['burn', 3, v * 0.15] }); }
    },
  },
});

// ---------------------------------------------------------------- Maru, Tide
const SLOWERS = ['maru.attack', 'maru.snare', 'maru.dash', 'maru.call', 'maru.special'];
boon({
  id: 'maru.attack', patron: 'maru', slot: 'attack', name: 'Tidal Strike',
  text: 'Your Attack deals {dmg%} more damage and splashes {splash} damage around the foe, Soaking and Slowing.',
  values: { dmg: r4(0.15, 0.22, 0.3, 0.38), splash: r4(8, 12, 16, 20) }, tags: ['slow', 'splash'],
  hooks: {
    beforeHit(G, c, v) { if (c.kind === 'attack') { c.bonus += v.dmg; c.element = c.element || 'tide'; } },
    onHit(G, c, v, K, b) {
      if (c.kind !== 'attack') return;
      K.soak(G, c.target, 3); K.slow(G, c.target, 0.25, 1.2);
      if (!K.cd(G, b, 'splash' + c.target.id, 0.12)) return;
      K.fx(G, 'splash', { x: c.target.x, y: c.target.y, r: 80, element: 'tide' });
      for (const e of K.area(G, c.target.x, c.target.y, 85, v.splash, { element: 'tide', kb: 140, exclude: c.target })) { K.soak(G, e, 3); K.slow(G, e, 0.25, 1.2); }
    },
  },
});
boon({
  id: 'maru.special', patron: 'maru', slot: 'special', name: 'Breaker',
  text: 'Your Special sends a breaking wave rolling ahead: {dmg} damage, a great knockback, and a Soak.',
  values: { dmg: r4(30, 42, 54, 66) }, tags: ['slow', 'knock'],
  hooks: { onSpecial(G, c, v, K) { K.wave(G, c.x, c.y, c.angle, { dmg: v.dmg, w: 130, speed: 950, range: 460, kb: 760 }); } },
});
boon({
  id: 'maru.snare', patron: 'maru', slot: 'snare', name: 'Riptide Line',
  text: 'Your Snare drags a current behind it: foes within reach are pulled in and Slowed by {v%} for 2s.',
  values: r4(0.3, 0.4, 0.5, 0.6), tags: ['slow'],
  hooks: { onSnareHit(G, c, v, K) { K.vortex(G, c.target.x, c.target.y, { r: 170, life: 1.6, pull: 260, slow: v, dps: 6 }); } },
});
boon({
  id: 'maru.dash', patron: 'maru', slot: 'dash', name: 'Undertow Step',
  text: 'Your Dash leaves a riptide that Slows foes by {slow%} and deals {dps} damage per second.',
  values: { slow: r4(0.35, 0.45, 0.55, 0.65), dps: r4(8, 11, 14, 17) }, tags: ['slow'],
  hooks: {
    onDash(G, c, v, K) {
      const s = K.stats(G), d = (G.cfg?.dash?.dist ?? 200) * (s.dashDist || 1);
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        K.riptide(G, c.x + c.dx * d * t, c.y + c.dy * d * t, { slow: v.slow, dps: v.dps, life: 1.8 + t * 0.3, r: 54, delay: t * 0.12 });
      }
    },
  },
});
boon({
  id: 'maru.call', patron: 'maru', slot: 'call', name: 'High Tide',
  text: 'Call: a great wave rolls out from you for {dmg} damage, hurling every foe back and Soaking them.',
  values: { dmg: r4(90, 120, 150, 180) }, tags: ['slow', 'knock'],
  hooks: {
    call(G, v, K) {
      const h = G.hero;
      K.ring(G, h.x, h.y, { r0: 40, r1: 560, life: 0.8, dmg: v.dmg, element: 'tide', kb: 980, kind: 'call', status: ['soak', 4], slow: [0.5, 2.5], style: 'tide' });
      K.fx(G, 'nova', { x: h.x, y: h.y, r: 560, element: 'tide' });
    },
  },
});
boon({
  id: 'maru.deep', patron: 'maru', slot: 'passive', name: 'Deep Current',
  text: 'Slowed foes take {v%} more damage.', values: r4(0.15, 0.2, 0.25, 0.3), needs: [SLOWERS],
  hooks: { beforeHit(G, c, v, K) { if (K.has(c.target, 'slow')) c.bonus += v; } },
});
boon({
  id: 'maru.breakwater', patron: 'maru', slot: 'passive', name: 'Breakwater',
  text: 'Your knockback is {kb%} stronger, and foes slammed into walls take {slam%} more damage.',
  values: { kb: r4(0.25, 0.35, 0.45, 0.55), slam: r4(0.5, 0.75, 1, 1.25) },
  hooks: { stats(s, v) { s.kbMult += v.kb; s.knock += v.kb; s.slamMult += v.slam; } },
});
boon({
  id: 'maru.ebb', patron: 'maru', slot: 'passive', name: 'Ebb and Flow',
  text: 'When you are struck, a wave bursts from you: {v} damage, pushing every foe nearby away.', values: r4(20, 30, 40, 50),
  hooks: {
    onHurt(G, c, v, K, b) {
      if (!(c.dmg > 0) || !K.cd(G, b, 'ebb', 0.8)) return;
      K.ring(G, G.hero.x, G.hero.y, { r0: 20, r1: 200, life: 0.35, dmg: v, element: 'tide', kb: 720, status: ['soak', 3], style: 'tide' });
    },
  },
});
boon({
  id: 'maru.mercy', patron: 'maru', slot: 'passive', name: 'Mercy of the Sea',
  text: 'While below 35% health, you take {v%} less damage.', values: r4(0.2, 0.26, 0.32, 0.38),
  hooks: { beforeHurt(G, c, v) { const h = G.hero; if (h.hp < h.maxHp * 0.35) c.dmg *= 1 - v; } },
});
boon({
  id: 'maru.spring', patron: 'maru', slot: 'passive', name: 'Spring Tide',
  text: 'Your Call gauge fills {v%} faster.', values: r4(0.15, 0.22, 0.3, 0.38),
  hooks: { stats(s, v) { s.callGain += v; } },
});
boon({
  id: 'maru.maelstrom', patron: 'maru', slot: 'passive', legendary: true, name: 'Maelstrom',
  text: 'Your riptides and currents become whirlpools: they drag foes to their heart and deal {v%} more damage.',
  values: { r: [1, 1, 1, 1], lvl: 0.25 }, needs: [['maru.dash', 'maru.snare']],
  hooks: { stats(s, v) { s.flags.maelstrom = 1 + v; } },
});
boon({
  id: 'maru.drown', patron: 'maru', slot: 'passive', legendary: true, name: 'Drowning Depths',
  text: 'Foes below {v%} health that you knock back are drowned outright. Bosses take 60 damage instead.',
  values: { r: [0.15, 0.15, 0.15, 0.15], lvl: 0.02 }, needs: [['maru.special', 'maru.attack', 'maru.breakwater', 'maru.call']],
  hooks: {
    onHit(G, c, v, K, b) {
      const e = c.target;
      if (!(c.kb > 0) || !K.alive(e) || e.hp > e.maxHp * v) return;
      if (K.isBoss(G, e)) { if (K.cd(G, b, 'drownBoss', 1.5)) K.dmg(G, e, 60, { element: 'tide', fx: 'drown' }); return; }
      K.fx(G, 'drown', { x: e.x, y: e.y, element: 'tide' });
      K.dmg(G, e, e.hp + (e.armor || 0) + 1, { element: 'tide', raw: true });
    },
  },
});

// ---------------------------------------------------------------- Veyra, Storm
const CHAINERS = ['veyra.attack', 'veyra.snare', 'veyra.special', 'veyra.call', 'veyra.ward', 'veyra.dash'];
boon({
  id: 'veyra.attack', patron: 'veyra', slot: 'attack', name: 'Forked Strike',
  text: 'Your Attack hits arc lightning to {n} more foes for {dmg} damage each.',
  values: { n: { r: r4(2, 2, 3, 4), lvl: 0 }, dmg: r4(10, 14, 18, 22) }, tags: ['chain'],
  hooks: { onHit(G, c, v, K) { if (c.kind === 'attack') K.chain(G, c.target, v.n, v.dmg); } },
});
boon({
  id: 'veyra.special', patron: 'veyra', slot: 'special', name: 'Thunderclap',
  text: 'Your Special calls a bolt down on each foe it hits, dealing {v} damage around it.', values: r4(24, 34, 44, 54), tags: ['chain'],
  hooks: {
    onHit(G, c, v, K, b) {
      if (c.kind !== 'special' || !K.cd(G, b, 'clap' + c.target.id, 0.35)) return;
      K.strike(G, c.target.x, c.target.y, { dmg: v, element: 'storm', r: 85, delay: 0.1 });
    },
  },
});
boon({
  id: 'veyra.snare', patron: 'veyra', slot: 'snare', name: 'Lightning Rod',
  text: 'A snared foe becomes a lightning rod for {t}s, arcing {dmg} damage to up to 3 foes near it twice a second.',
  values: { dmg: r4(8, 11, 14, 17), t: 3.5 }, tags: ['chain'],
  hooks: { onSnareHit(G, c, v, K) { K.power(G, 'rod', { target: c.target.id, x: c.target.x, y: c.target.y, life: v.t, dmg: v.dmg, every: 0.5, r: 240 }); } },
});
boon({
  id: 'veyra.dash', patron: 'veyra', slot: 'dash', name: 'Static Step',
  text: 'Your Dash leaves a crackling seam: foes along it are struck for {v} damage and Jolted.', values: r4(15, 22, 29, 36), tags: ['chain'],
  hooks: {
    onDash(G, c, v, K, b) { const m = K.mem(G, b); m.x = c.x; m.y = c.y; },
    onDashEnd(G, c, v, K, b) {
      const m = K.mem(G, b); if (m.x === undefined) return;
      K.power(G, 'seam', { x: m.x, y: m.y, x2: c.x, y2: c.y, life: 0.45 });
      for (const e of K.line(G, m.x, m.y, c.x, c.y, 50, v, { element: 'storm', kb: 90 })) K.jolt(G, e);
      m.x = undefined;
    },
  },
});
boon({
  id: 'veyra.call', patron: 'veyra', slot: 'call', name: 'Tempest',
  text: 'Call: for {t}s, lightning strikes the foes around you four times a second, {dmg} damage each.',
  values: { t: { r: r4(4, 4.5, 5, 5.5), lvl: 0.25 }, dmg: r4(22, 28, 34, 40) }, tags: ['chain'],
  hooks: { call(G, v, K) { K.power(G, 'tempest', { follow: true, x: G.hero.x, y: G.hero.y, life: v.t, dmg: v.dmg, every: 0.25, r: 520 }); K.fx(G, 'nova', { x: G.hero.x, y: G.hero.y, r: 380, element: 'storm' }); } },
});
boon({
  id: 'veyra.overcharge', patron: 'veyra', slot: 'passive', name: 'Overcharge',
  text: 'Your chain lightning leaps to {v} more foes.', values: { r: r4(1, 1, 2, 2), lvl: 0 }, needs: [CHAINERS],
  hooks: { stats(s, v) { s.chainBonus += v; } },
});
boon({
  id: 'veyra.jolt', patron: 'veyra', slot: 'passive', name: 'Static Build-up',
  text: 'Your lightning Jolts foes. The next blow on a Jolted foe discharges {v} more damage.', values: r4(14, 20, 26, 32), needs: [CHAINERS],
  hooks: {
    stats(s) { s.flags.jolt = true; },
    onHit(G, c, v, K) {
      const e = c.target;
      if (c.element === 'storm' || !K.has(e, 'jolt') || !K.alive(e)) return;
      K.clear(e, 'jolt'); K.fx(G, 'discharge', { x: e.x, y: e.y, element: 'storm' });
      K.dmg(G, e, v, { element: 'storm', kb: 60, noJolt: true });
    },
  },
});
boon({
  id: 'veyra.conduct', patron: 'veyra', slot: 'passive', name: 'Conductive Weft',
  text: 'Chain lightning grows {v%} stronger with every leap.', values: r4(0.1, 0.14, 0.18, 0.22), needs: [CHAINERS],
  hooks: { stats(s, v) { s.chainGrow += v; } },
});
boon({
  id: 'veyra.ward', patron: 'veyra', slot: 'passive', name: 'Arc Ward',
  text: 'When struck, lightning lashes your attacker and 2 foes near it for {v} damage.', values: r4(25, 35, 45, 55),
  hooks: { onHurt(G, c, v, K, b) { if (c.src && K.alive(c.src) && K.cd(G, b, 'arcward', 0.3)) { K.arc(G, G.hero, c.src); K.dmg(G, c.src, v, { element: 'storm' }); K.chain(G, c.src, 2, v); } } },
});
boon({
  id: 'veyra.eye', patron: 'veyra', slot: 'passive', name: 'Eye of the Storm',
  text: 'All your lightning deals {v%} more damage.', values: r4(0.15, 0.22, 0.3, 0.38),
  hooks: { stats(s, v) { s.elem.storm += v; } },
});
boon({
  id: 'veyra.supercell', patron: 'veyra', slot: 'passive', legendary: true, name: 'Supercell',
  text: 'Your chain lightning never fades, leaps {v} more times, and may strike the same foe again.',
  values: { r: [2, 2, 2, 2], lvl: 0.34 }, needs: [['veyra.attack', 'veyra.snare']],
  hooks: { stats(s, v) { s.flags.supercell = true; s.chainBonus += Math.floor(v); } },
});
boon({
  id: 'veyra.wrath', patron: 'veyra', slot: 'passive', legendary: true, name: "Heaven's Wrath",
  text: 'Every 3s, a great bolt strikes the strongest foe in the chamber for {v} damage.',
  values: { r: [70, 70, 70, 70], lvl: 14 }, needs: [['veyra.special', 'veyra.call']],
  hooks: {
    tick(G, c, v, K, b) {
      const m = K.mem(G, b); m.t = (m.t || 0) + c.dt;
      if (m.t < 3) return;
      let best = null; for (const e of K.foes(G)) if (!best || e.maxHp > best.maxHp || (e.maxHp === best.maxHp && e.hp > best.hp)) best = e;
      if (best) { m.t = 0; K.strike(G, best.x, best.y, { dmg: v, element: 'storm', r: 110, delay: 0.38, style: 'great' }); }
    },
  },
});

// ---------------------------------------------------------------- Ossian, Stone
const QUAKERS = ['ossian.dash', 'ossian.special', 'ossian.call', 'ossian.rebuke', 'ossian.avalanche'];
boon({
  id: 'ossian.attack', patron: 'ossian', slot: 'attack', name: 'Boulder Fist',
  text: 'Your Attack deals {dmg%} more damage, double that against Armour, and staggers harder.',
  values: { dmg: r4(0.25, 0.35, 0.45, 0.55) }, tags: ['armour'],
  hooks: { beforeHit(G, c, v) { if (c.kind === 'attack') { c.bonus += (c.target.armor > 0 ? 2 : 1) * v.dmg; c.kb *= 1.2; c.stun = Math.max(c.stun || 0, 0.25); } } },
});
boon({
  id: 'ossian.special', patron: 'ossian', slot: 'special', name: 'Landslide',
  text: 'Your Special raises a rift of stone spikes ahead of you: {v} damage, and a Stun.', values: r4(35, 48, 61, 74), tags: ['quake'],
  hooks: { onSpecial(G, c, v, K) { K.rift(G, c.x, c.y, c.angle, { dmg: v, len: 340, n: 7 }); } },
});
boon({
  id: 'ossian.snare', patron: 'ossian', slot: 'snare', name: 'Stone Anchor',
  text: 'Snared foes are Petrified for {t}s and take {v%} more damage while turned to stone.',
  values: { t: r4(1.2, 1.5, 1.8, 2.1), v: 0.3 },
  hooks: {
    onSnareHit(G, c, v, K) { K.status(G, c.target, 'stun', v.t, 1); K.status(G, c.target, 'petrify', v.t, 1); K.fx(G, 'petrify', { x: c.target.x, y: c.target.y, id: c.target.id, t: v.t }); },
    beforeHit(G, c, v, K) { if (K.has(c.target, 'petrify')) c.bonus += v.v; },
  },
});
boon({
  id: 'ossian.dash', patron: 'ossian', slot: 'dash', name: 'Quake Step',
  text: 'Where your Dash lands, the ground cracks: {v} damage around you and a brief Stun.', values: r4(16, 24, 32, 40), tags: ['quake'],
  hooks: { onDashEnd(G, c, v, K) { K.quake(G, c.x, c.y, { r: 125, dmg: v }); } },
});
boon({
  id: 'ossian.call', patron: 'ossian', slot: 'call', name: 'Bastion',
  text: 'Call: become living stone for {t}s. Nothing can hurt you; quakes erupt around you, then you shatter outward for {dmg} damage.',
  values: { t: { r: r4(2.5, 3, 3.5, 4), lvl: 0.2 }, dmg: r4(80, 110, 140, 170) }, tags: ['quake', 'armour'],
  hooks: { call(G, v, K) { G.hero.inv = Math.max(G.hero.inv || 0, v.t); K.power(G, 'bastion', { follow: true, x: G.hero.x, y: G.hero.y, life: v.t, dmg: v.dmg, every: 0.5 }); K.fx(G, 'stoneform', { x: G.hero.x, y: G.hero.y, t: v.t }); } },
});
boon({
  id: 'ossian.granite', patron: 'ossian', slot: 'passive', name: 'Granite Skin',
  text: 'Gain a stone Ward of {v} that soaks up damage before your health. It mends at the start of every chamber.', values: r4(20, 30, 40, 50),
  hooks: { stats(s, v) { s.maxArmor += v; } },
});
boon({
  id: 'ossian.rebuke', patron: 'ossian', slot: 'passive', name: 'Rebuke',
  text: 'When your Ward takes a blow, the ground quakes around you for {v} damage.', values: r4(20, 30, 40, 50), needs: [['ossian.granite']],
  hooks: { beforeHurt(G, c, v, K, b) { if (G.hero.armor > 0 && c.dmg > 0 && K.cd(G, b, 'rebuke', 0.5)) K.quake(G, G.hero.x, G.hero.y, { r: 150, dmg: v }); } },
});
boon({
  id: 'ossian.bedrock', patron: 'ossian', slot: 'passive', name: 'Bedrock',
  text: 'You take {v%} less damage.', values: r4(0.08, 0.11, 0.14, 0.17),
  hooks: { stats(s, v) { s.dmgTaken *= 1 - v; } },
});
boon({
  id: 'ossian.stoneheart', patron: 'ossian', slot: 'passive', name: 'Stoneheart',
  text: 'Gain {v} max health.', values: r4(20, 30, 40, 50),
  hooks: { stats(s, v) { s.maxHp += v; } },
});
boon({
  id: 'ossian.avalanche', patron: 'ossian', slot: 'passive', name: 'Avalanche',
  text: 'You deal {v%} more damage to Armoured foes, and breaking Armour sends out a quake.', values: r4(0.3, 0.45, 0.6, 0.75),
  hooks: {
    beforeHit(G, c, v) { if (c.target.armor > 0) c.bonus += v; },
    onHit(G, c, v, K) { if (c.armorBefore > 0 && !(c.target.armor > 0)) K.quake(G, c.target.x, c.target.y, { r: 170, dmg: 40 }); },
  },
});
boon({
  id: 'ossian.mountain', patron: 'ossian', slot: 'passive', legendary: true, name: "Mountain's Patience",
  text: 'Stand still for a moment and your Ward mends {v} each second.', values: { r: [10, 10, 10, 10], lvl: 2 }, needs: [['ossian.granite']],
  hooks: {
    tick(G, c, v, K, b) {
      const h = G.hero, m = K.mem(G, b);
      const still = Math.hypot(h.vx || 0, h.vy || 0) < 25;
      m.s = still ? (m.s || 0) + c.dt : 0;
      const max = K.stats(G).maxArmor || 0;
      if (m.s > 0.8 && (h.armor || 0) < max) { h.armor = Math.min(max, (h.armor || 0) + v * c.dt); m.glow = 1; } else m.glow = 0;
    },
  },
});
boon({
  id: 'ossian.fortress', patron: 'ossian', slot: 'passive', legendary: true, name: 'Living Fortress',
  text: 'While your Ward holds, your blows deal {v%} more damage and Stun.', values: { r: [0.3, 0.3, 0.3, 0.3], lvl: 0.05 }, needs: [['ossian.granite']],
  hooks: { beforeHit(G, c, v) { if ((G.hero.armor || 0) > 0 && c.kind !== 'boon') { c.bonus += v; c.stun = Math.max(c.stun || 0, 0.3); } } },
});

// ---------------------------------------------------------------- Ilu, Shade
const CRITTERS = ['ilu.attack', 'ilu.special', 'ilu.snare', 'ilu.dash', 'ilu.call', 'ilu.backbiter'];
boon({
  id: 'ilu.attack', patron: 'ilu', slot: 'attack', name: 'Nightblade',
  text: 'Your Attack has a {v%} chance to land a Critical hit.', values: r4(0.12, 0.16, 0.2, 0.24), tags: ['crit'],
  hooks: { beforeHit(G, c, v) { if (c.kind === 'attack') c.critChance += v; } },
});
boon({
  id: 'ilu.special', patron: 'ilu', slot: 'special', name: 'Shadow Fang',
  text: 'Your Special deals {dmg%} more damage with {crit%} Critical chance; struck from behind, it always Crits.',
  values: { dmg: r4(0.2, 0.3, 0.4, 0.5), crit: 0.15 }, tags: ['crit'],
  hooks: { beforeHit(G, c, v, K) { if (c.kind === 'special') { c.bonus += v.dmg; c.critChance += v.crit; if (K.behind(G, c.target)) c.crit = true; } } },
});
boon({
  id: 'ilu.snare', patron: 'ilu', slot: 'snare', name: 'Umbral Mark',
  text: 'Snared foes are Marked for 4s: your next blow on a Marked foe is a Critical hit with {v%} more damage.', values: r4(0.3, 0.45, 0.6, 0.75), tags: ['crit'],
  hooks: {
    onSnareHit(G, c, v, K) { K.status(G, c.target, 'mark', 4, 1); K.fx(G, 'mark', { x: c.target.x, y: c.target.y, id: c.target.id }); },
    beforeHit(G, c, v, K) { if (c.kind !== 'boon' && c.kind !== 'snare' && K.has(c.target, 'mark')) { c.crit = true; c.bonus += v; K.clear(c.target, 'mark'); } },
  },
});
boon({
  id: 'ilu.dash', patron: 'ilu', slot: 'dash', name: 'Veil Step',
  text: 'After you Dash, you are Cloaked for {v}s: foes lose sight of you, and your first blow from the Cloak is a Critical hit.',
  values: r4(0.8, 1, 1.2, 1.4), tags: ['crit', 'cloak'],
  hooks: {
    onDashEnd(G, c, v, K, b) { K.cloak(G, v); K.mem(G, b).ready = true; },
    beforeHit(G, c, v, K, b) { const m = K.mem(G, b); if (m.ready && c.kind !== 'boon' && (G.hero.cloak || 0) > 0) { c.crit = true; m.ready = false; G.hero.cloak = 0; } },
  },
});
boon({
  id: 'ilu.call', patron: 'ilu', slot: 'call', name: 'Eclipse',
  text: 'Call: night falls for {v}s. Every blow you land is a Critical hit, foes are Slowed, and you are Cloaked.',
  values: { r: r4(3, 3.5, 4, 4.5), lvl: 0.25 }, tags: ['crit', 'cloak'],
  hooks: { call(G, v, K) { K.power(G, 'eclipse', { follow: true, x: G.hero.x, y: G.hero.y, life: v }); K.cloak(G, v); K.fx(G, 'nova', { x: G.hero.x, y: G.hero.y, r: 600, element: 'shade' }); } },
});
boon({
  id: 'ilu.cruel', patron: 'ilu', slot: 'passive', name: 'Cruel Edge',
  text: 'Your Critical hits deal {v%} more damage.', values: r4(0.3, 0.45, 0.6, 0.75), needs: [CRITTERS],
  hooks: { stats(s, v) { s.critMult += v; } },
});
boon({
  id: 'ilu.backbiter', patron: 'ilu', slot: 'passive', name: 'Backbiter',
  text: 'Blows from behind deal {v%} more damage.', values: r4(0.3, 0.45, 0.6, 0.75),
  hooks: { stats(s, v) { s.backstab += v; } },
});
boon({
  id: 'ilu.fade', patron: 'ilu', slot: 'passive', name: 'Fade',
  text: 'Slaying a foe Cloaks you for {v}s.', values: r4(0.6, 0.8, 1, 1.2),
  hooks: { onKill(G, c, v, K) { K.cloak(G, v); } },
});
boon({
  id: 'ilu.thin', patron: 'ilu', slot: 'passive', name: 'Thin as Shadow',
  text: 'You have a {v%} chance to slip any blow untouched.', values: r4(0.08, 0.11, 0.14, 0.17),
  hooks: { stats(s, v) { s.dodge += v; } },
});
boon({
  id: 'ilu.hunger', patron: 'ilu', slot: 'passive', name: 'Hungry Dark',
  text: 'Critical hits restore {v} health (at most once a second).', values: r4(2, 3, 4, 5), needs: [CRITTERS],
  hooks: { onHit(G, c, v, K, b) { if (c.crit && c.kind !== 'boon' && K.cd(G, b, 'hunger', 1)) K.heal(G, v, { x: c.target.x, y: c.target.y }); } },
});
boon({
  id: 'ilu.deathblow', patron: 'ilu', slot: 'passive', legendary: true, name: 'Deathblow',
  text: 'Critical hits against foes below {v%} health slay them outright. Bosses take 50% more instead.',
  values: { r: [0.25, 0.25, 0.25, 0.25], lvl: 0.02 }, needs: [CRITTERS, ['ilu.cruel', 'ilu.backbiter', 'ilu.hunger']],
  hooks: {
    // afterCrit runs once the runtime has rolled the Critical hit (see sim/boons.js).
    afterCrit(G, c, v, K) {
      const e = c.target;
      if (!c.crit || e.hp > e.maxHp * v) return;
      if (K.isBoss(G, e)) { c.mult *= 1.5; return; }
      c.execute = true; c.dmg = e.hp + (e.armor || 0) + 1; c.mult = 1; c.bonus = 0;
      K.fx(G, 'execute', { x: e.x, y: e.y, element: 'shade' });
    },
  },
});
boon({
  id: 'ilu.twin', patron: 'ilu', slot: 'passive', legendary: true, name: 'Twin Shadow',
  text: 'A shadow of you mirrors every Attack hit for {v%} of its damage.', values: { r: [0.4, 0.4, 0.4, 0.4], lvl: 0.06 },
  needs: [['ilu.attack', 'ilu.dash']],
  hooks: {
    stats(s) { s.flags.twin = true; },
    onHit(G, c, v, K) {
      if (c.kind !== 'attack' || !K.alive(c.target)) return;
      K.fx(G, 'shadowstrike', { x: c.target.x, y: c.target.y, angle: c.angle });
      K.dmg(G, c.target, c.dmg * v, { element: 'shade', canCrit: true });
    },
  },
});

// ---------------------------------------------------------------- Kestrel, Wind
const CYCLONERS = ['kestrel.attack', 'kestrel.special', 'kestrel.call', 'kestrel.windborne'];
boon({
  id: 'kestrel.attack', patron: 'kestrel', slot: 'attack', name: 'Gale Strike',
  text: 'Your Attack is {v%} faster, and every 4th hit looses a small cyclone at the foe.', values: r4(0.1, 0.14, 0.18, 0.22), tags: ['cyclone', 'speed'],
  hooks: {
    stats(s, v) { s.attackSpeed += v; },
    onHit(G, c, v, K, b) {
      if (c.kind !== 'attack') return;
      const m = K.mem(G, b); m.n = (m.n || 0) + 1;
      if (m.n >= 4) { m.n = 0; const h = G.hero, a = Math.atan2(c.target.y - h.y, c.target.x - h.x); K.cyclone(G, h.x + Math.cos(a) * 40, h.y + Math.sin(a) * 40, a, { dmg: 7, life: 1.3, speed: 340, r: 44 }); }
    },
  },
});
boon({
  id: 'kestrel.special', patron: 'kestrel', slot: 'special', name: 'Cyclone Cast',
  text: 'Your Special looses a cyclone that drifts ahead, catching foes for {v} damage four times a second.', values: r4(6, 8, 10, 12), tags: ['cyclone'],
  hooks: { onSpecial(G, c, v, K) { K.cyclone(G, c.x + Math.cos(c.angle) * 50, c.y + Math.sin(c.angle) * 50, c.angle, { dmg: v, life: 2.4, speed: 230, r: 62 }); } },
});
boon({
  id: 'kestrel.snare', patron: 'kestrel', slot: 'snare', name: 'Updraft',
  text: 'Snared foes are swept up into the air for {t}s, helpless, taking {v%} more damage.',
  values: { t: r4(1.1, 1.3, 1.5, 1.7), v: r4(0.25, 0.32, 0.4, 0.48) },
  hooks: {
    onSnareHit(G, c, v, K) {
      const e = c.target; if (K.isBoss(G, e)) { K.status(G, e, 'lift', v.t * 0.5, 1); return; }
      K.status(G, e, 'stun', v.t, 1); K.status(G, e, 'lift', v.t, 1);
      K.power(G, 'updraft', { target: e.id, x: e.x, y: e.y, life: v.t });
    },
    beforeHit(G, c, v, K) { if (K.has(c.target, 'lift')) c.bonus += v.v; },
  },
});
boon({
  id: 'kestrel.dash', patron: 'kestrel', slot: 'dash', name: 'Second Wind',
  text: 'Gain {n} more Dash charge, and each Dash gusts nearby foes away.', values: { n: { r: r4(1, 1, 1, 2), lvl: 0 }, kb: r4(380, 430, 480, 530) }, tags: ['speed'],
  hooks: {
    stats(s, v) { s.dashCharges += v.n; },
    onDash(G, c, v, K) { K.fx(G, 'gust', { x: c.x, y: c.y, r: 100, angle: Math.atan2(c.dy, c.dx) }); K.area(G, c.x, c.y, 100, 0, { element: 'wind', kb: v.kb }); },
  },
});
boon({
  id: 'kestrel.call', patron: 'kestrel', slot: 'call', name: 'Squall',
  text: 'Call: {n} cyclones whirl around you for 6s, shredding foes they touch for {dmg} damage.',
  values: { n: { r: r4(3, 4, 4, 5), lvl: 0 }, dmg: r4(10, 13, 16, 19) }, tags: ['cyclone'],
  hooks: {
    call(G, v, K) {
      for (let i = 0; i < v.n; i++) K.cyclone(G, G.hero.x, G.hero.y, 0, { dmg: v.dmg, life: 6, r: 50, orbit: { a: (i / v.n) * Math.PI * 2, rad: 130, w: 3.4 } });
      K.fx(G, 'nova', { x: G.hero.x, y: G.hero.y, r: 320, element: 'wind' });
    },
  },
});
boon({
  id: 'kestrel.tailwind', patron: 'kestrel', slot: 'passive', name: 'Tailwind',
  text: 'You move {v%} faster.', values: r4(0.08, 0.11, 0.14, 0.17),
  hooks: { stats(s, v) { s.speed *= 1 + v; } },
});
boon({
  id: 'kestrel.slipstream', patron: 'kestrel', slot: 'passive', name: 'Slipstream',
  text: 'Your Dash recharges {v%} faster.', values: r4(0.15, 0.22, 0.3, 0.38),
  hooks: { stats(s, v) { s.dashCd *= 1 - v; } },
});
boon({
  id: 'kestrel.quicken', patron: 'kestrel', slot: 'passive', name: 'Quickening',
  text: 'After a Dash, your next Attack or Special hit deals {v%} more damage.', values: r4(0.3, 0.45, 0.6, 0.75),
  hooks: {
    onDash(G, c, v, K, b) { K.mem(G, b).q = 1.2; },
    tick(G, c, v, K, b) { const m = K.mem(G, b); if (m.q > 0) m.q -= c.dt; },
    beforeHit(G, c, v, K, b) { const m = K.mem(G, b); if (m.q > 0 && (c.kind === 'attack' || c.kind === 'special')) { c.bonus += v; m.q = 0; K.fx(G, 'quicken', { x: c.target.x, y: c.target.y }); } },
  },
});
boon({
  id: 'kestrel.farflight', patron: 'kestrel', slot: 'passive', name: 'Far Flight',
  text: 'Your Dash carries you {v%} farther.', values: r4(0.15, 0.2, 0.25, 0.3),
  hooks: { stats(s, v) { s.dashDist += v; } },
});
boon({
  id: 'kestrel.gustward', patron: 'kestrel', slot: 'passive', name: 'Gust Ward',
  text: 'Every {v}s, a gust around you scatters the foes\' projectiles.', values: { r: r4(3, 2.5, 2, 1.5), lvl: -0.1 },
  hooks: {
    tick(G, c, v, K, b) {
      const m = K.mem(G, b); m.t = (m.t || 0) + c.dt;
      if (m.t < Math.max(0.8, v)) return;
      const h = G.hero, near = (G.projectiles || []).filter((p) => p.team !== 'hero' && !p.dead && Math.hypot(p.x - h.x, p.y - h.y) < 190);
      if (!near.length) return;
      m.t = 0; K.fx(G, 'gust', { x: h.x, y: h.y, r: 190 });
      for (const p of near) { p.dead = true; p.life = 0; K.fx(G, 'deflect', { x: p.x, y: p.y }); }
    },
  },
});
boon({
  id: 'kestrel.hurricane', patron: 'kestrel', slot: 'passive', legendary: true, name: 'Hurricane',
  text: 'Your cyclones swell as they live, drag foes into their eye and last {v%} longer.', values: { r: [0.5, 0.5, 0.5, 0.5], lvl: 0.1 },
  needs: [CYCLONERS.slice(0, 3)],
  hooks: { stats(s, v) { s.flags.hurricane = 1 + v; } },
});
boon({
  id: 'kestrel.windborne', patron: 'kestrel', slot: 'passive', legendary: true, name: 'Windborne',
  text: 'While moving, you have a {v%} chance to ride the wind past any blow; each time, a cyclone bursts out behind you.',
  values: { r: [0.2, 0.2, 0.2, 0.2], lvl: 0.02 }, needs: [['kestrel.tailwind', 'kestrel.dash', 'kestrel.farflight']],
  hooks: {
    beforeHurt(G, c, v, K) {
      const h = G.hero;
      if (c.dmg > 0 && Math.hypot(h.vx || 0, h.vy || 0) > 80 && K.rng(G)() < v) {
        c.dmg = 0; c.dodged = true;
        K.cyclone(G, h.x, h.y, (h.facing || 0) + Math.PI, { dmg: 9, life: 1.8, speed: 160, r: 54 });
      }
    },
  },
});

export const BOONS = B;

// ---------------------------------------------------------------- registry and helpers
// Every effect source by id: boons, braids, tempers, aspects, keepsakes.
export const DEFS = {};
for (const b of BOONS) DEFS[b.id] = Object.assign({ kind: 'boon' }, b);
for (const b of BRAIDS) DEFS[b.id] = Object.assign({ kind: 'braid', slot: 'passive', braid: true }, b);
for (const w of Object.values(WEAPONS)) {
  for (const a of w.aspects || []) DEFS[a.id] = Object.assign({ kind: 'aspect', weapon: w.id }, a);
  for (const t of w.tempers || []) DEFS[t.id] = Object.assign({ kind: 'temper', weapon: w.id }, t);
}
for (const k of Object.values(KEEPSAKES)) DEFS[k.id] = Object.assign({ kind: 'keepsake' }, k);
export const BOON_BY_ID = DEFS;

const RI = (rarity) => (RARITY[rarity] ? RARITY[rarity].i : 0);
function one(spec, ri, level) {
  if (Array.isArray(spec)) {
    const base = spec[Math.min(ri, spec.length - 1)];
    const step = spec.length > 1 ? spec[1] - spec[0] : spec[0] * 0.25;
    return base + Math.max(0, level - 1) * (step || spec[0] * 0.25);
  }
  if (spec && typeof spec === 'object' && 'r' in spec) {
    const base = spec.r[Math.min(ri, spec.r.length - 1)];
    const step = spec.lvl ?? (spec.r.length > 1 ? spec.r[1] - spec.r[0] : 0);
    return base + Math.max(0, level - 1) * step;
  }
  return spec;
}
// Values of a def at a rarity and Knot level: a number or an object.
export function valuesOf(def, rarity = 'common', level = 1) {
  if (typeof def === 'string') def = DEFS[def];
  if (!def || def.values === undefined) return 0;
  const ri = RI(rarity);
  const vs = def.values;
  if (typeof vs === 'function') return vs(rarity, level);
  if (Array.isArray(vs) || (vs && typeof vs === 'object' && 'r' in vs)) return one(vs, ri, level);
  if (typeof vs === 'number') return vs;
  const out = {};
  for (const k in vs) out[k] = one(vs[k], ri, level);
  return out;
}
function fmt(n, pct) {
  if (typeof n !== 'number' || !isFinite(n)) return String(n);
  if (pct) return Math.round(n * 100) + '%';
  return Math.abs(n - Math.round(n)) < 1e-6 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}
// Resolve '{key}' and '{key%}' in a text against values (v as a number answers {v}).
export function fillText(text, v) {
  return String(text || '').replace(/\{(\w+)(%?)\}/g, (m, k, pct) => {
    const n = typeof v === 'number' ? (k === 'v' ? v : undefined) : v && (v[k] ?? (k === 'v' ? v.v : undefined));
    return n === undefined ? m : fmt(n, !!pct);
  });
}
// The text of any effect source at a rarity and level, numbers filled in.
export function boonText(id, rarity = 'common', level = 1) {
  const d = typeof id === 'string' ? DEFS[id] : id;
  if (!d) return '';
  return fillText(d.text, valuesOf(d, rarity, level));
}
// Value change from one level/rarity to the next, as a short string ("18 -> 24").
export function boonDelta(id, fromR, fromL, toR, toL) {
  const d = DEFS[id]; if (!d) return '';
  const a = valuesOf(d, fromR, fromL), b = valuesOf(d, toR, toL);
  const pct = /\{(\w+)%\}/.exec(d.text || '');
  if (typeof a === 'number') return `${fmt(a, pct && pct[1] === 'v')} → ${fmt(b, pct && pct[1] === 'v')}`;
  const keys = Object.keys(a).filter((k) => a[k] !== b[k] && typeof a[k] === 'number');
  return keys.map((k) => { const p = new RegExp('\\{' + k + '%\\}').test(d.text); return `${fmt(a[k], p)} → ${fmt(b[k], p)}`; }).join(', ');
}
export const boonsOf = (patron) => BOONS.filter((b) => b.patron === patron);
