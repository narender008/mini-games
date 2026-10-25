// Boon runtime: hooks, hero stats, offers, Knots, Tempers, patron Calls and the live
// power objects (sunspots, riptides, cyclones, waves, quakes, strikes) they create.
// Pure sim: never touches canvas, DOM or audio; visuals and sound listen to the bus.
//
// ---------------------------------------------------------------- API (all take G first)
//   heroStats(G) -> stats            recompute G.hero.stats from base + Tapestry + pacts + aspect + Tempers
//                                    + keepsake + boons (hero.js recomputeStats calls this)
//   fireHook(G, name, ctx)           run a hook on every owned effect source (see HOOK NAMES)
//   tickBoons(G, dt)                 once per gameplay tick (skipped in hit-stop): tick hooks + G.powers
//   applyCall(G) -> bool             the Call-slot boon's patron ultimate; false = no Call boon (engine bursts)
//   offerBoons(G, rng, opts) -> cards opts { patron, kind: 'boon'|'knot'|'temper', count, rarityBonus }
//                                    card { id, slot, patron, rarity, braid, legendary, level, replaces,
//                                    knot?, temper?, upgrade?, name, text }; also stored as G.offer
//   rerollOffer(G, rng) -> cards|null spends G.run.rerolls (a token) and draws the same kind of offer again
//   takeCard(G, card | index)        take an offer card (boon, braid, Knot, Temper, rarity upgrade); clears G.offer
//   takeBoon(G, id, rarity, opts)    give any effect source by id (boon, braid, temper, aspect, keepsake)
//   levelBoon(G, id, n = 1)          a Knot: raise an owned boon's level
//   dropBoon(G, id)
//   hasBoon(G, id), slotBoon(G, slot) -> rec, needsMet(G, def), braidsAvailable(G) -> ids,
//   ownedBraids(G) -> ids, boonList(G) -> [{ id, slot, patron, rarity, level }] (for state())
//   rarityRoll(G, rng, bonus = 0) -> 'common'|'rare'|'epic'|'mythic'
//   equippedAspect(G) -> aspect id,  tapestry(G) -> tapestryMods,  pacts(G) -> pactMods
//   K                                the toolkit boon hooks receive (exported for weapons and tests)
//
// ---------------------------------------------------------------- HOOK NAMES (who fires them)
//   beforeHit {target,dmg,kind,element,crit,kb,x,y,angle,src}  combat.damageFoe, mutable: this runtime applies
//            global/element/kind multipliers (NOT attackDmg/specialDmg: weapons apply those), backstab,
//            marks, crits (G.rng.combat) and boon bonuses, and may set ctx.cancel. Then afterCrit.
//   onHit (same ctx, after damage)  combat.damageFoe      onKill {e, kind, x, y}  combat.killFoe
//   beforeHurt {dmg, src, x, y, dodged} / onHurt  combat.hurtHero (dmgTaken, flat armour, dodge, blind-miss here)
//   onAttack {weapon, combo, x, y, angle}  weapons, at each active frame
//   onSpecial {x, y, angle}  weapons     onSnare / onSnareHit {target}  hero.js
//   onDash {x, y, dx, dy} / onDashEnd {x, y}  hero.js
//   onRoomStart {chamber} / onRoomClear {chamber}  run.js (room start refills the hero's Ward and clears powers)
//   onCall {patron}  this file, after a Call
//
// ---------------------------------------------------------------- state
//   G.run.boons    [{ id, rarity, level }]        G.run.tempers [{ id, rarity }]
//   G.run.aspect   aspect id (else meta.loadout.aspects[weapon], else the weapon's first aspect)
//   G.run.keepsake keepsake key (else meta.loadout.keepsake)    G.run.rerolls (tokens left)
//   G.run.callPatron  patron of the Call boon (hero.js puts it on the 'call' event)
//   G.powers       live power objects (render: src/render/powers.js). Not saved; cleared each chamber.
//   G.boonMem      per-source scratch (counters, cooldowns). Not saved; cleared each chamber.
//
// ---------------------------------------------------------------- bus events emitted
//   boon {id, rarity, level, patron, slot, replaces, braid, legendary, kind}   boonLevel {id, level}
//   offer {cards, kind, patron}    callFx {patron}
//   power {fx, ...}: fx = arc {x1,y1,x2,y2,color} | burst | flare | nova | splash | surge | discharge | quake |
//     strike | petrify | mark | cloak | gust | deflect | execute | drown | shadowstrike | quicken | heal |
//     stoneform | shatter | thorns | thimble | miss | sunpulse | wave | phantom | steam (each with x, y, r?, element?)
//   powerSpawn {p}   powerEnd {p}     (persistent G.powers objects)
import { BASE_STATS } from '../config.js';
import { DEFS, BOONS, RARITY, RARITIES, SLOTS, MAX_LEVEL, valuesOf, boonText } from '../content/boons.js';
import { BRAIDS } from '../content/braids.js';
import { WEAPONS, TEMPER_LIMIT } from '../content/weapons.js';
import { KEEPSAKES, keepsakeRank } from '../content/keepsakes.js';
import { PATRON_IDS } from '../content/patrons.js';
import { tapestryMods } from '../content/tapestry.js';
import { pactMods } from '../content/pacts.js';
import * as C from './combat.js';
import * as W from './world.js';
import * as H from './hero.js';

const TAU = Math.PI * 2;
const ELEMS = ['dawn', 'tide', 'storm', 'stone', 'shade', 'wind', 'gold'];
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const RANK_RARITY = ['common', 'rare', 'epic'];

// ---------------------------------------------------------------- effect sources
let cache = { key: '', list: [] };
function sourceKey(G) {
  const r = G.run;
  let k = (G.hero?.weapon || '') + '|' + equippedAspect(G) + '|' + keepsakeKey(G) + '|';
  if (r) {
    if (r.boons) for (const b of r.boons) k += b.id + ':' + b.rarity + ':' + (b.level || 1) + ',';
    k += '|';
    if (r.tempers) for (const t of r.tempers) k += (t.id || t) + ':' + (t.rarity || '') + ',';
  }
  return k;
}
function keepsakeKey(G) {
  const k = G.run ? G.run.keepsake : G.meta?.loadout?.keepsake;
  return k ? String(k).replace(/^keepsake\./, '') : '';
}
export function equippedAspect(G) {
  const w = G.hero?.weapon || G.run?.weapon || 'blade';
  const W0 = WEAPONS[w]; if (!W0) return '';
  const pick = G.run?.aspect || G.meta?.loadout?.aspects?.[w] || G.meta?.loadout?.aspect;
  if (pick && DEFS[pick] && DEFS[pick].weapon === w) return pick;
  return W0.aspects[0].id;
}
function sources(G) {
  const key = sourceKey(G);
  if (key === cache.key && cache.G === G) return cache.list;
  const list = [];
  const add = (id, rarity, level, rec) => { const def = DEFS[id]; if (def) list.push({ def, v: valuesOf(def, rarity, level), rec: rec || { id, rarity, level } }); };
  const asp = equippedAspect(G); if (asp) add(asp, 'common', 1);
  const kk = keepsakeKey(G);
  if (kk && KEEPSAKES[kk]) add(KEEPSAKES[kk].id, RANK_RARITY[keepsakeRank(G.meta, kk) - 1], 1);
  const r = G.run;
  if (r) {
    for (const t of r.tempers || []) { const id = t.id || t; add(id, t.rarity || 'common', 1, typeof t === 'object' ? t : null); }
    for (const b of r.boons || []) add(b.id, b.rarity || 'common', b.level || 1, b);
  }
  cache = { key, list, G };
  return list;
}
function invalidate() { cache.key = ''; }

// ---------------------------------------------------------------- stats
export function tapestry(G) { return tapestryMods(G.meta); }
export function pacts(G) { return pactMods(G.meta?.pacts); }

function baseStats(G) {
  const s = Object.assign({}, BASE_STATS);
  // hero.js multiplies cfg.hero.speed by stats.speed; if the config has no base speed, keep the absolute one
  s.speed = G.cfg?.hero?.speed ? 1 : BASE_STATS.speed;
  // damage-side stats (the engine's BASE_STATS covers movement and survival only)
  for (const [k, v] of Object.entries({ dmg: 1, attackDmg: 1, specialDmg: 1, snareDmg: 1, callDmg: 1, critChance: 0.03, critMult: 2, knock: 1, dmgTaken: 1, armour: 0, lifesteal: 0 })) if (s[k] === undefined) s[k] = v;
  Object.assign(s, {
    dashDmg: 1, boonDmg: 1, thornsDmg: 1, dashCd: 1, kbMult: 1, callCost: 1, slamMult: 1, maxArmor: 0, healMult: 1,
    burnMult: 1, blindPlus: 0, chainBonus: 0, chainGrow: 0, backstab: 0, dodge: 0,
    elem: Object.fromEntries(ELEMS.map((e) => [e, 1])), flags: {}, w: {},
    glintMult: 1, lumenMult: 1, rarityBonus: 0, offerCount: 3, shopDiscount: 0, regionHeal: 0, dreamDefy: 0,
    favour: 0, firstBoonRare: false, rerolls: 0, healAfter: 0,
  });
  return s;
}

export function heroStats(G) {
  const s = baseStats(G);
  const t = tapestry(G), p = pacts(G);
  s.maxHp += t.maxHp; s.dmg *= 1 + t.dmg; s.speed *= 1 + t.speed; s.maxArmor += t.ward;
  s.deathDefiance += p.deathDefianceOff ? 0 : t.deathDefiance;
  s.rerolls += t.rerolls; s.lumenMult *= t.lumenMult; s.rarityBonus += t.rarityBonus; s.offerCount += t.offerExtra;
  s.healAfter += t.healAfter; s.knotBonus = t.knotBonus; s.startGlint = t.startGlint; s.callStart = t.callStart;
  s.healMult *= p.healMult; s.offerCount += p.offerCount;
  for (const src of sources(G)) {
    const fn = src.def.hooks && src.def.hooks.stats;
    if (fn) safe(src.def.id, () => fn(s, src.v, G));
  }
  s.maxHp = Math.max(10, Math.round(s.maxHp));
  s.dashCharges = Math.max(1, Math.round(s.dashCharges));
  s.offerCount = Math.max(1, Math.min(4, Math.round(s.offerCount)));
  s.dodge = Math.min(0.6, s.dodge);
  s.dmgTaken = Math.max(0.2, s.dmgTaken);
  s.callCost = Math.max(0.25, Math.min(1, s.callCost));
  const h = G.hero;
  if (h) {
    const prev = h.stats && h.stats._maxHp;
    if (prev && s.maxHp > prev && h.hp > 0) h.hp += s.maxHp - prev;   // gaining max health heals by the gain
    s._maxHp = s.maxHp;
    h.stats = s;
    h.maxHp = s.maxHp;
    if (h.hp > h.maxHp) h.hp = h.maxHp;
    if ((h.armor || 0) > s.maxArmor) h.armor = s.maxArmor;
  }
  return s;
}
function refreshStats(G) {
  invalidate();
  if (typeof H.recomputeStats === 'function' && G.hero) H.recomputeStats(G); else heroStats(G);
}
const stats = (G) => (G.hero && G.hero.stats && G.hero.stats.elem ? G.hero.stats : heroStats(G));

// ---------------------------------------------------------------- hooks
const errs = new Set();
function safe(id, fn) {
  try { return fn(); } catch (err) {
    if (!errs.has(id)) { errs.add(id); console.error('[boons] hook error in', id, err); }
  }
}
let depth = 0;
function run(G, name, ctx) {
  for (const src of sources(G)) {
    const fn = src.def.hooks && src.def.hooks[name];
    if (fn) safe(src.def.id + '.' + name, () => fn(G, ctx, src.v, K, src.rec));
  }
}

export function fireHook(G, name, ctx = {}) {
  if (!G || !G.hero) return ctx;
  if (depth > 4) return ctx;
  depth++;
  try {
    if (name === 'beforeHit') beforeHit(G, ctx);
    else if (name === 'onHit') onHitPrelude(G, ctx), run(G, 'onHit', ctx);
    else if (name === 'beforeHurt') beforeHurt(G, ctx);
    else if (name === 'onRoomStart') roomStart(G, ctx);
    else if (name === 'onRoomClear') roomClear(G, ctx);
    else if (name === 'tick') run(G, 'tick', ctx);
    else run(G, name, ctx);
  } finally { depth--; }
  return ctx;
}

const KIND_STAT = { snare: 'snareDmg', call: 'callDmg', dash: 'dashDmg', boon: 'boonDmg', thorns: 'thornsDmg' };
function beforeHit(G, c) {
  const s = stats(G), e = c.target;
  if (!e) return;
  const isBoon = c.kind === 'boon' || c.boon;
  c.bonus = c.bonus || 0; c.mult = c.mult || 1;
  c.critChance = isBoon && !c.canCrit ? 0 : (c.critChance ?? s.critChance ?? 0);
  c.critMult = s.critMult ?? 2;
  c.armorBefore = e.armor || 0;
  c.crit = !!c.crit;
  let k = s.dmg ?? 1;
  const ks = KIND_STAT[c.kind]; if (ks) k *= s[ks] ?? 1;
  if (c.element && s.elem && s.elem[c.element]) k *= s.elem[c.element];
  if ((c.kind === 'attack' || c.kind === 'special' || c.kind === 'dash') && s.backstab > 0 && K.behind(G, e)) { c.bonus += s.backstab; c.backstab = true; }
  run(G, 'beforeHit', c);
  if (c.cancel) return;
  if (!isBoon || c.canCrit) {
    if (K.active(G, 'eclipse')) c.crit = true;
    if (!isBoon && K.has(e, 'mark') && c.kind !== 'snare') { c.crit = true; K.clear(e, 'mark'); }
    if (!c.crit && c.critChance > 0 && G.rng.combat() < c.critChance) c.crit = true;
  }
  run(G, 'afterCrit', c);
  if (c.execute) return;
  if (c.crit) c.mult *= c.critMult;
  let d = c.dmg * k * (1 + c.bonus) * c.mult;
  if (c.armorMult > 1 && e.armor > 0) d += Math.min(e.armor, d) * (c.armorMult - 1);
  c.dmg = Math.max(0, d);
}

function onHitPrelude(G, c) {
  const s = stats(G), e = c.target;
  if (!e) return;
  if (c.element === 'storm' && s.flags.jolt && !c.noJolt && !e.dead) C.addStatus(G, e, 'jolt', 4, 1);
  if (s.lifesteal > 0 && c.kind !== 'boon' && c.dmg > 0) C.healHero?.(G, c.dmg * s.lifesteal);
  if (c.crit && c.kind !== 'boon') K.fx(G, 'crit', { x: e.x, y: e.y, element: c.element || 'shade' });
}

function beforeHurt(G, c) {
  const s = stats(G);
  c.dmg = Math.max(0, c.dmg * (s.dmgTaken ?? 1) - (s.armour || 0));
  const r = G.rng.combat;
  if (c.src && K.has(c.src, 'blind') && r() < 0.5) { c.dmg = 0; c.dodged = true; K.fx(G, 'miss', { x: G.hero.x, y: G.hero.y, element: 'dawn' }); return; }
  if (s.dodge > 0 && r() < s.dodge) { c.dmg = 0; c.dodged = true; K.fx(G, 'miss', { x: G.hero.x, y: G.hero.y, element: 'shade' }); return; }
  run(G, 'beforeHurt', c);
}

function roomStart(G, c) {
  G.powers = [];
  G.boonMem = {};
  const s = heroStats(G), h = G.hero;
  if (h) h.armor = Math.max(h.armor || 0, s.maxArmor || 0);
  run(G, 'onRoomStart', c);
}
function roomClear(G, c) {
  const s = stats(G);
  if (s.healAfter > 0) K.heal(G, s.healAfter);
  run(G, 'onRoomClear', c);
}

// ---------------------------------------------------------------- the Call
export function applyCall(G) {
  const rec = slotBoon(G, 'call');
  if (!rec) return false;
  const def = DEFS[rec.id];
  if (!def || !def.hooks || !def.hooks.call) return false;
  const v = valuesOf(def, rec.rarity, rec.level || 1);
  safe(def.id + '.call', () => def.hooks.call(G, v, K, rec));
  G.bus.emit('callFx', { patron: def.patron, id: def.id, x: G.hero.x, y: G.hero.y });
  fireHook(G, 'onCall', { patron: def.patron });
  return true;
}

// ---------------------------------------------------------------- owned boons
const runBoons = (G) => (G.run && G.run.boons) || [];
export const hasBoon = (G, id) => runBoons(G).some((b) => b.id === id) || (G.run?.tempers || []).some((t) => (t.id || t) === id);
export function slotBoon(G, slot) { for (const b of runBoons(G)) { const d = DEFS[b.id]; if (d && d.slot === slot) return b; } return null; }
export function needsMet(G, def) {
  if (typeof def === 'string') def = DEFS[def];
  if (!def || !def.needs) return true;
  return def.needs.every((group) => group.some((id) => hasBoon(G, id)));
}
export const ownedBraids = (G) => runBoons(G).filter((b) => DEFS[b.id]?.braid).map((b) => b.id);
export function braidsAvailable(G) { return BRAIDS.filter((b) => !hasBoon(G, b.id) && needsMet(G, b)).map((b) => b.id); }
export function boonList(G) {
  return runBoons(G).map((b) => { const d = DEFS[b.id] || {}; return { id: b.id, slot: d.slot || 'passive', patron: d.patron || (d.patrons ? d.patrons.join('+') : null), rarity: b.rarity, level: b.level || 1, braid: !!d.braid }; });
}

export function takeBoon(G, id, rarity = 'common', opts = {}) {
  const def = DEFS[id];
  if (!def) return false;
  if (def.kind === 'keepsake' || def.kind === 'aspect') {
    if (G.run) { if (def.kind === 'keepsake') G.run.keepsake = def.key; else G.run.aspect = id; }
    else if (G.meta) { G.meta.loadout = G.meta.loadout || {}; if (def.kind === 'keepsake') G.meta.loadout.keepsake = def.key; else (G.meta.loadout.aspects = G.meta.loadout.aspects || {})[def.weapon] = id; }
    refreshStats(G); G.bus.emit('boon', { id, rarity, kind: def.kind });
    return true;
  }
  if (!G.run) return false;
  const r = G.run;
  if (!RARITY[rarity]) rarity = 'common';
  if (def.legendary) rarity = 'legendary';
  if (def.braid && !opts.keepRarity) rarity = 'braid';
  if (def.kind === 'temper') {
    r.tempers = r.tempers || [];
    if (!r.tempers.some((t) => (t.id || t) === id)) r.tempers.push({ id, rarity });
    refreshStats(G);
    G.bus.emit('boon', { id, rarity, kind: 'temper', weapon: def.weapon });
    return true;
  }
  r.boons = r.boons || [];
  let replaces = null;
  const have = r.boons.find((b) => b.id === id);
  if (have) {
    if (RARITY[rarity].i > RARITY[have.rarity]?.i) have.rarity = rarity;
    if (opts.level) have.level = Math.max(have.level || 1, opts.level);
  } else {
    if (def.slot && def.slot !== 'passive') {
      const old = slotBoon(G, def.slot);
      if (old) { replaces = old.id; r.boons.splice(r.boons.indexOf(old), 1); }
    }
    r.boons.push({ id, rarity, level: opts.level || 1 });
    if (def.slot === 'call') r.callPatron = def.patron;
    if (def.patron && !r.favourPatron) r.favourPatron = def.patron;
  }
  if (G.meta && G.meta.codex) { const cb = G.meta.codex.boons || (G.meta.codex.boons = {}); cb[id] = (cb[id] || 0) + 1; }
  refreshStats(G);
  G.bus.emit('boon', { id, rarity, level: (have || r.boons[r.boons.length - 1]).level, patron: def.patron || null, patrons: def.patrons || null, slot: def.slot, replaces, braid: !!def.braid, legendary: !!def.legendary, kind: def.kind });
  return true;
}
export function dropBoon(G, id) {
  const r = G.run; if (!r) return false;
  const i = (r.boons || []).findIndex((b) => b.id === id);
  if (i >= 0) r.boons.splice(i, 1);
  const j = (r.tempers || []).findIndex((t) => (t.id || t) === id);
  if (j >= 0) r.tempers.splice(j, 1);
  refreshStats(G);
  return i >= 0 || j >= 0;
}
export function levelBoon(G, id, n = 1) {
  const b = runBoons(G).find((x) => x.id === id);
  if (!b) return false;
  b.level = Math.min(MAX_LEVEL, (b.level || 1) + n);
  refreshStats(G);
  G.bus.emit('boonLevel', { id, level: b.level });
  return true;
}

// ---------------------------------------------------------------- offers
export function rarityRoll(G, rng, bonus = 0) {
  const s = G.hero && G.hero.stats && G.hero.stats.elem ? G.hero.stats : null;
  const b = bonus + (s ? s.rarityBonus || 0 : 0);
  const pM = 0.02 + b * 0.15, pE = 0.09 + b * 0.4, pR = 0.27 + b;
  const x = (rng || G.rng.run)();
  return x < pM ? 'mythic' : x < pM + pE ? 'epic' : x < pM + pE + pR ? 'rare' : 'common';
}
const up = (r) => RARITIES[Math.min(3, RARITIES.indexOf(r) + 1)] || r;
function card(G, def, rarity, extra = {}) {
  const old = def.slot && def.slot !== 'passive' ? slotBoon(G, def.slot) : null;
  const level = extra.level || 1;
  return Object.assign({ id: def.id, slot: def.slot || 'passive', patron: def.patron || (def.patrons ? def.patrons[0] : null), patrons: def.patrons || null,
    rarity, braid: !!def.braid, legendary: !!def.legendary, level, replaces: old && old.id !== def.id ? old.id : null,
    name: def.name, text: boonText(def, rarity, level) }, extra);
}

export function offerBoons(G, rng, opts = {}) {
  rng = rng || G.rng.run;
  const kind = opts.kind || 'boon';
  const s = G.hero && G.hero.stats && G.hero.stats.elem ? G.hero.stats : heroStats(G);
  const count = Math.max(1, Math.min(4, opts.count || s.offerCount || 3));
  let cards = [];
  if (kind === 'knot') cards = knotOffer(G, rng, count, s);
  else if (kind === 'temper') cards = temperOffer(G, rng, count, opts);
  else cards = boonOffer(G, rng, count, opts, s);
  G.offer = cards;
  G.offerOpts = Object.assign({}, opts, { kind });
  G.bus.emit('offer', { cards, kind, patron: opts.patron || null });
  return cards;
}

function boonOffer(G, rng, count, opts, s) {
  const patron = opts.patron && PATRON_IDS.includes(opts.patron) ? opts.patron : null;
  const ownsFrom = (p) => runBoons(G).some((b) => DEFS[b.id]?.patron === p);
  const pool = [];
  for (const b of BOONS) {
    if (patron && b.patron !== patron) continue;
    if (hasBoon(G, b.id) || !needsMet(G, b)) continue;
    let w = 1;
    if (b.slot !== 'passive' && !slotBoon(G, b.slot)) w = 2.2;            // empty slots first
    if (b.slot === 'passive' && b.needs) w = 1.6;                          // tier-two passives you qualify for
    if (b.legendary) w = 0.45;
    if (!patron && !ownsFrom(b.patron) && runBoons(G).length > 5) w *= 0.6;
    pool.push({ def: b, w });
  }
  const braids = BRAIDS.filter((b) => (!patron || b.patrons.includes(patron)) && !hasBoon(G, b.id) && needsMet(G, b));
  const out = [];
  const usedSlots = new Set();
  // a Braid you qualify for shows up 45% of the time
  if (braids.length && rng() < 0.45) { const b = braids[Math.floor(rng() * braids.length)]; out.push(card(G, DEFS[b.id], 'braid')); }
  while (out.length < count && pool.length) {
    let tot = 0; for (const p of pool) tot += p.w;
    let x = rng() * tot, pick = pool.length - 1;
    for (let i = 0; i < pool.length; i++) { x -= pool[i].w; if (x <= 0) { pick = i; break; } }
    const { def } = pool.splice(pick, 1)[0];
    if (def.slot !== 'passive') { if (usedSlots.has(def.slot)) continue; usedSlots.add(def.slot); }
    let rarity = def.legendary ? 'legendary' : rarityRoll(G, rng, opts.rarityBonus || 0);
    if (!def.legendary) {
      const fav = s.favour > 0 && G.run && G.run.favourPatron === def.patron;
      if (fav) { if (rarity === 'common') rarity = 'rare'; if (rarity === 'rare' && rng() < s.favour) rarity = 'epic'; }
      const region = G.chamber ? G.chamber.region : null;
      if (s.firstBoonRare && G.run && G.run.rareRegion !== region) { if (rarity === 'common') rarity = 'rare'; }
    }
    out.push(card(G, def, rarity));
  }
  if (s.firstBoonRare && G.run && G.chamber) G.run.rareRegion = G.chamber.region;
  // nothing left from this patron: offer rarity upgrades of what you own from them
  if (out.length < count) {
    const owned = runBoons(G).filter((b) => (!patron || DEFS[b.id]?.patron === patron) && RARITY[b.rarity] && RARITY[b.rarity].i < 3 && !DEFS[b.id]?.braid && !DEFS[b.id]?.legendary);
    for (const b of owned) { if (out.length >= count) break; if (out.some((c) => c.id === b.id)) continue; out.push(card(G, DEFS[b.id], up(b.rarity), { upgrade: true, level: b.level || 1 })); }
  }
  return out;
}

function knotOffer(G, rng, count, s) {
  const owned = runBoons(G).filter((b) => (b.level || 1) < MAX_LEVEL).slice();
  const out = [];
  while (out.length < count && owned.length) {
    const b = owned.splice(Math.floor(rng() * owned.length), 1)[0];
    const n = s.knotBonus > 0 && rng() < s.knotBonus ? 2 : 1;
    const level = Math.min(MAX_LEVEL, (b.level || 1) + n);
    out.push(card(G, DEFS[b.id], b.rarity, { knot: true, level, from: b.level || 1, levels: n }));
  }
  return out;
}

function temperOffer(G, rng, count, opts) {
  const w = WEAPONS[opts.weapon || G.hero?.weapon || 'blade'] || WEAPONS.blade;
  const have = new Set((G.run?.tempers || []).map((t) => t.id || t));
  const pool = w.tempers.filter((t) => !have.has(t.id));
  const out = [];
  while (out.length < count && pool.length) {
    const t = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    out.push(card(G, DEFS[t.id], rarityRoll(G, rng, 0.1), { temper: true, slot: 'temper', weapon: w.id }));
  }
  return out;
}
export const temperRoom = (G) => ((G.run?.tempers || []).length < TEMPER_LIMIT);

export function rerollOffer(G, rng) {
  if (!G.run || !(G.run.rerolls > 0) || !G.offer) return null;
  G.run.rerolls--;
  const opts = G.offerOpts || {};
  return offerBoons(G, rng || G.rng.run, opts);
}

export function takeCard(G, c) {
  if (typeof c === 'number') c = G.offer && G.offer[c];
  if (typeof c === 'string') c = (G.offer || []).find((x) => x.id === c) || { id: c, rarity: 'common' };
  if (!c) return false;
  let ok;
  if (c.knot) ok = levelBoon(G, c.id, c.levels || Math.max(1, c.level - (c.from || 1)));
  else if (c.upgrade) { const b = runBoons(G).find((x) => x.id === c.id); if (b) { b.rarity = c.rarity; refreshStats(G); G.bus.emit('boon', { id: c.id, rarity: c.rarity, level: b.level, patron: DEFS[c.id]?.patron, slot: c.slot, upgrade: true }); ok = true; } }
  else ok = takeBoon(G, c.id, c.rarity, { level: c.level > 1 ? c.level : undefined });
  G.offer = null;
  return ok;
}

// ---------------------------------------------------------------- the toolkit (K)
const alive = (e) => (C.targetable ? C.targetable(e) : e && !e.dead && e.hp > 0);
function foes(G) { const out = []; for (const e of G.foes) if (alive(e)) out.push(e); return out; }
function foesNear(G, x, y, r) { const out = []; for (const e of G.foes) if (alive(e) && Math.hypot(e.x - x, e.y - y) <= r + (e.r || 0)) out.push(e); return out; }
function nearest(G, x, y, r, exclude) {
  let best = null, bd = r;
  for (const e of G.foes) { if (!alive(e) || (exclude && exclude.has(e))) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
  return best;
}
const isBoss = (G, e) => !!(e && (e.boss || e === G.boss));
const has = (e, n) => !!(e && e.status && e.status[n] && e.status[n].t > 0);

function boonDmg(G, e, dmg, o = {}) {
  if (!alive(e)) return 0;
  const h = G.hero;
  const sx = o.x ?? h.x, sy = o.y ?? h.y;
  let dx = e.x - sx, dy = e.y - sy; if (!dx && !dy) { dx = Math.cos(h.facing || 0); dy = Math.sin(h.facing || 0); }
  const ctx = { target: e, dmg, kind: o.kind || 'boon', element: o.element || null, crit: false, kb: o.kb || 0, x: e.x, y: e.y,
    angle: Math.atan2(dy, dx), src: 'boon', boon: (o.kind || 'boon') === 'boon', canCrit: !!o.canCrit, surge: !!o.surge, noJolt: !!o.noJolt, stun: o.stun };
  if (!o.raw) fireHook(G, 'beforeHit', ctx);
  if (ctx.cancel) return 0;
  const dealt = C.damageFoe ? C.damageFoe(G, e, ctx.dmg, { kind: ctx.kind, element: ctx.element, crit: ctx.crit, kb: ctx.kb, dx, dy, stun: ctx.stun, noHooks: true, src: 'boon', quiet: !!o.quiet })
    : ((e.hp -= ctx.dmg), ctx.dmg);
  if (dealt >= 0 && !o.raw) fireHook(G, 'onHit', ctx);
  if (o.status && !e.dead) C.addStatus(G, e, o.status[0], o.status[1], o.status[2] ?? 1);
  if (o.slow && !e.dead) K.slow(G, e, o.slow[0], o.slow[1]);
  return dealt;
}
function area(G, x, y, r, dmg, o = {}) {
  const hit = [];
  for (const e of foesNear(G, x, y, r)) {
    if (o.exclude && (o.exclude === e || (o.exclude.has && o.exclude.has(e.id)))) continue;
    if (o.once) { if (o.once.has(e.id)) continue; o.once.add(e.id); }
    if (dmg > 0) boonDmg(G, e, dmg, Object.assign({}, o, { x, y }));
    else if (o.kb && C.knock && !isBoss(G, e)) C.knock(G, e, e.x - x, e.y - y, o.kb * (stats(G).kbMult || 1));
    hit.push(e);
  }
  return hit;
}
function line(G, x1, y1, x2, y2, w, dmg, o = {}) {
  const hit = [];
  const shape = { type: 'line', x: x1, y: y1, x2, y2, w };
  for (const e of foes(G)) {
    if (!C.inShape(shape, e.x, e.y, e.r || 0)) continue;
    if (o.once) { if (o.once.has(e.id)) continue; o.once.add(e.id); }
    boonDmg(G, e, dmg, Object.assign({}, o, { x: x1, y: y1 }));
    hit.push(e);
  }
  return hit;
}
function arc(G, a, b, color) {
  G.bus.emit('power', { fx: 'arc', x1: a.x, y1: a.y - (a.z || 0) - 26, x2: b.x, y2: b.y - (b.z || 0) - 26, color: color || '#a6f6ff', seed: (G.t * 977 + a.id * 13 + b.id) % 1e6 });
}
function chain(G, from, n, dmg, o = {}) {
  const s = stats(G);
  let leaps = n + (s.chainBonus || 0);
  const supercell = !!s.flags.supercell;
  const range = o.range || 300;
  const done = new Set([from]);
  let cur = from, d = dmg, boosted = false, hits = 0;
  const color = o.color || (o.black ? '#c9a6ff' : '#a6f6ff');
  for (let i = 0; i < leaps; i++) {
    if (s.flags.sunstorm && !boosted && has(cur, 'burn')) { leaps++; boosted = true; }
    let best = null, bd = range;
    for (const e of G.foes) {
      if (!alive(e) || e === cur || (!supercell && done.has(e))) continue;
      const dd = Math.hypot(e.x - cur.x, e.y - cur.y);
      if (dd < bd) { bd = dd; best = e; }
    }
    if (!best) break;
    arc(G, cur, best, color);
    d = dmg * (1 + (s.chainGrow || 0) * i);
    boonDmg(G, best, d, { element: 'storm', kb: 110, x: cur.x, y: cur.y });
    done.add(best); cur = best; hits++;
  }
  if (hits) G.bus.emit('power', { fx: 'zap', x: from.x, y: from.y, n: hits });
  return hits;
}
function newPower(G, kind, o) {
  const p = Object.assign({ id: G.nextId++, x: 0, y: 0, t: 0, life: 1, r: 60, delay: 0, acc: 0, seed: Math.floor(G.rng.combat() * 1e6) }, o);
  if (o && o.kind && !o.hitKind) p.hitKind = o.kind;   // o.kind is the damage kind ('call', 'boon'); p.kind is the power kind
  p.kind = kind;
  (G.powers || (G.powers = [])).push(p);
  G.bus.emit('powerSpawn', { p });
  return p;
}
function quake(G, x, y, o = {}) {
  const s = stats(G), r = o.r || 120;
  newPower(G, 'ring', { x, y, r0: 12, r1: r, life: 0.26, dmg: o.dmg || 20, element: 'stone', kb: o.kb ?? 300, stun: o.stun ?? 0.45, kind: o.kind || 'boon', style: 'quake', once: new Set() });
  G.bus.emit('power', { fx: 'quake', x, y, r, element: 'stone' });
  if (s.flags.molten) newPower(G, 'molten', { x, y, r: r * 0.8, life: 3.2, dps: s.flags.molten });
  if (s.flags.mudslide) newPower(G, 'mud', { x, y, r: r * 0.75, life: 3, root: s.flags.mudslide, seen: new Set() });
  if (s.flags.lodestone) { const t = nearest(G, x, y, r + 120); if (t) { arc(G, { x, y, z: -26, id: 0 }, t); boonDmg(G, t, s.flags.lodestone, { element: 'storm' }); chain(G, t, 2, s.flags.lodestone); } }
  if (s.flags.sandstorm) cyclone(G, x, y, G.rng.combat() * TAU, { dmg: s.flags.sandstorm, life: 2, speed: 90, r: 70, sand: true });
}
function cyclone(G, x, y, angle, o = {}) {
  const s = stats(G);
  const hur = s.flags.hurricane || 0;
  return newPower(G, 'cyclone', Object.assign({ x, y, angle, speed: 220, life: 2, r: 56, dmg: 6, every: 0.25, hitT: {} }, o, {
    life: (o.life || 2) * (hur ? hur : 1), r0: o.r || 56,
    monsoon: s.flags.monsoon || 0, solar: s.flags.solarwind || 0, thunder: s.flags.thunderhead || 0, hurricane: hur, ax: 0 }));
}

export const K = {
  alive, foes, foesNear, nearest, isBoss, has,
  clear(e, n) { if (e && e.status) delete e.status[n]; },
  stats, rng: (G) => G.rng.combat,
  fx(G, name, o = {}) { G.bus.emit('power', Object.assign({ fx: name }, o)); },
  mem(G, b) { const M = G.boonMem || (G.boonMem = {}); const k = b ? b.id : '_'; return M[k] || (M[k] = {}); },
  cd(G, b, key, t) { const m = K.mem(G, b); const k = 'cd_' + key; if ((m[k] ?? -1e9) > G.t) return false; m[k] = G.t + t; return true; },
  behind(G, e) { const h = G.hero; if (!e || e.facing == null) return false; const a = Math.atan2(h.y - e.y, h.x - e.x); return Math.abs(wrap(a - e.facing)) > 1.95; },
  active(G, kind) { const P = G.powers; if (!P) return false; for (const p of P) if (p.kind === kind && !p.dead) return true; return false; },
  status(G, e, name, t, power = 1) { if (e && !e.dead) C.addStatus(G, e, name, t, power); },
  burn(G, e, dps, t = 3) { if (!e || e.dead || !(dps > 0)) return; C.addStatus(G, e, 'burn', t, dps * (stats(G).burnMult || 1)); },
  blind(G, e, t) { if (!e || e.dead) return; C.addStatus(G, e, 'blind', t * (isBoss(G, e) ? 0.5 : 1) + (stats(G).blindPlus || 0), 1); },
  slow(G, e, power, t) { if (!e || e.dead) return; C.addStatus(G, e, 'slow', t, Math.min(0.8, power)); if (stats(G).flags.blackwater) C.addStatus(G, e, 'mark', Math.max(t, 2), 1); },
  soak(G, e, t = 3) { if (e && !e.dead) C.addStatus(G, e, 'soak', t, 1); },
  jolt(G, e, t = 4) { if (e && !e.dead) C.addStatus(G, e, 'jolt', t, 1); },
  cloak(G, t) { const h = G.hero; if (!h) return; if ((h.cloak || 0) < t) h.cloak = t; G.bus.emit('power', { fx: 'cloak', x: h.x, y: h.y, t }); },
  heal(G, n, o = {}) { const h = G.hero; if (!h || h.dead) return 0; const got = C.healHero ? C.healHero(G, n) : 0; if (got > 0) G.bus.emit('power', { fx: 'heal', x: o.x ?? h.x, y: o.y ?? h.y, n: got }); return got; },
  dmg: boonDmg, area, line, chain, arc,
  power: newPower,
  quake,
  cyclone,
  ring(G, x, y, o) { return newPower(G, 'ring', Object.assign({ x, y, r0: 20, r1: 200, life: 0.4, dmg: 20, kb: 400, once: new Set(), style: o.element || 'dawn' }, o)); },
  wave(G, x, y, angle, o) { G.bus.emit('power', { fx: 'wave', x, y, angle }); return newPower(G, 'wave', Object.assign({ x, y, x0: x, y0: y, angle, speed: 900, range: 420, w: 120, dmg: 30, kb: 700, once: new Set(), life: 2 }, o)); },
  sunspot(G, x, y, o = {}) { const s = stats(G); const nd = s.flags.noonday; return newPower(G, 'sunspot', Object.assign({ x, y, r: 76, life: 4, dps: 10, every: 0.5, pulse: nd || 0, pulseT: 0 }, o, { r: (o.r || 76) * (nd ? 1.35 : 1) })); },
  riptide(G, x, y, o = {}) { const s = stats(G); return newPower(G, 'riptide', Object.assign({ x, y, r: 54, life: 1.8, slow: 0.4, dps: 8, every: 0.25, mael: s.flags.maelstrom || 0, surge: !!s.flags.stormsurge }, o)); },
  vortex(G, x, y, o = {}) { const s = stats(G); return newPower(G, 'vortex', Object.assign({ x, y, r: 160, life: 1.5, pull: 240, slow: 0.4, dps: 6, every: 0.1, mael: s.flags.maelstrom || 0 }, o)); },
  strike(G, x, y, o = {}) { return newPower(G, 'strike', Object.assign({ x, y, r: 85, dmg: 30, element: 'storm', wait: o.delay ?? 0.15, life: 0.35, struck: false, style: 'bolt' }, o, { delay: 0 })); },
  rift(G, x, y, angle, o = {}) { return newPower(G, 'rift', Object.assign({ x, y, angle, len: 340, n: 7, dmg: 40, life: 0.9, every: 0.055, done: 0, once: new Set() }, o)); },
};

// ---------------------------------------------------------------- powers update
const inside = (G, x, y) => (W.insideChamber && G.chamber ? W.insideChamber(G.chamber, x, y, 0) : true);
const UPD = {
  sunspot(G, p, dt) {
    p.acc += dt;
    if (p.acc >= p.every) { p.acc -= p.every; for (const e of foesNear(G, p.x, p.y, p.r)) K.burn(G, e, p.dps, 1.2); }
    if (p.pulse) {
      p.pulseT += dt;
      if (p.pulseT >= 1.5) { p.pulseT = 0; K.fx(G, 'sunpulse', { x: p.x, y: p.y, r: p.r, element: 'dawn' }); area(G, p.x, p.y, p.r, p.pulse, { element: 'dawn', kb: 60 }); }
    }
  },
  riptide(G, p, dt) {
    p.acc += dt;
    if (p.acc < p.every) return;
    p.acc -= p.every;
    const near = foesNear(G, p.x, p.y, p.r * (p.mael ? 1.6 : 1));
    for (const e of near) {
      K.slow(G, e, p.slow, 0.5); K.soak(G, e, 2);
      if (p.mael && !isBoss(G, e)) C.knock(G, e, p.x - e.x, p.y - e.y, 90);
      boonDmg(G, e, p.dps * p.every * (p.mael || 1), { element: 'tide', quiet: true, x: p.x, y: p.y });
    }
    if (p.surge && near.length && (p.zapT = (p.zapT || 0) + 1) % 4 === 0) { const e = near[0]; arc(G, { x: p.x, y: p.y, z: -6, id: 0 }, e); boonDmg(G, e, 6, { element: 'storm' }); }
  },
  vortex(G, p, dt) {
    p.acc += dt;
    if (p.acc < p.every) return;
    p.acc -= p.every;
    const pull = p.pull * (p.mael ? 1.6 : 1);
    for (const e of foesNear(G, p.x, p.y, p.r)) {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d > 18 && !isBoss(G, e)) C.knock(G, e, p.x - e.x, p.y - e.y, pull * 0.35);
      K.slow(G, e, p.slow, 2); K.soak(G, e, 2);
      if ((p.tickN = (p.tickN || 0) + 1) % 3 === 0) boonDmg(G, e, p.dps * 0.3 * (p.mael || 1), { element: 'tide', quiet: true, x: p.x, y: p.y });
    }
  },
  wave(G, p, dt) {
    const prev = p.dist || 0;
    p.dist = Math.min(p.range, prev + p.speed * dt);
    const cx = Math.cos(p.angle), cy = Math.sin(p.angle);
    p.x = p.x0 + cx * p.dist; p.y = p.y0 + cy * p.dist;
    const nx = -cy, ny = cx, hw = p.w / 2;
    for (const e of line(G, p.x + nx * hw, p.y + ny * hw, p.x - nx * hw, p.y - ny * hw, 70, p.dmg, { element: 'tide', kb: 0, once: p.once, x: p.x0, y: p.y0 })) {
      if (!isBoss(G, e) && C.knock) C.knock(G, e, cx, cy, p.kb * (stats(G).kbMult || 1));
      K.soak(G, e, 3); K.slow(G, e, 0.3, 1.5);
    }
    if (p.dist >= p.range || !inside(G, p.x, p.y)) {
      if (stats(G).flags.mudslide) newPower(G, 'mud', { x: p.x, y: p.y, r: 90, life: 3, root: stats(G).flags.mudslide, seen: new Set() });
      p.t = p.life;
    }
  },
  ring(G, p) {
    const k = Math.min(1, p.t / p.life), e3 = 1 - Math.pow(1 - k, 3);
    p.r = p.r0 + (p.r1 - p.r0) * e3;
    for (const e of foesNear(G, p.x, p.y, p.r)) {
      if (p.once.has(e.id)) continue;
      p.once.add(e.id);
      boonDmg(G, e, p.dmg, { element: p.element, kb: p.kb, stun: p.stun, kind: p.hitKind || 'boon', x: p.x, y: p.y, status: p.status, slow: p.slow });
    }
  },
  strike(G, p, dt) {
    if (!p.struck) {
      p.wait -= dt; p.t = 0;
      if (p.wait > 0) return;
      p.struck = true;
      K.fx(G, 'strike', { x: p.x, y: p.y, r: p.r, element: p.element, style: p.style });
      for (const e of area(G, p.x, p.y, p.r, p.dmg, { element: p.element, kb: 200, stun: 0.2, status: p.status })) if (p.element === 'storm') K.jolt(G, e);
    }
  },
  rod(G, p, dt) {
    const t = G.foes.find((e) => e.id === p.target);
    if (!t || t.dead) { p.t = p.life; return; }
    p.x = t.x; p.y = t.y;
    p.acc += dt;
    if (p.acc < p.every) return;
    p.acc -= p.every;
    let n = 0;
    for (const e of foesNear(G, t.x, t.y, p.r)) { if (e === t) continue; arc(G, t, e); boonDmg(G, e, p.dmg, { element: 'storm', kb: 60, x: t.x, y: t.y }); if (++n >= 3) break; }
    if (!n) G.bus.emit('power', { fx: 'crackle', x: t.x, y: t.y });
  },
  tempest(G, p, dt) {
    const h = G.hero; p.x = h.x; p.y = h.y;
    p.acc += dt;
    if (p.acc < p.every) return;
    p.acc -= p.every;
    const near = foesNear(G, h.x, h.y, p.r), rng = G.rng.combat;
    if (near.length) { const e = near[Math.floor(rng() * near.length)]; K.strike(G, e.x + (rng() - 0.5) * 20, e.y + (rng() - 0.5) * 20, { dmg: p.dmg, r: 80, delay: 0.1 }); }
    else { const a = rng() * TAU, d = 120 + rng() * 260; K.strike(G, h.x + Math.cos(a) * d, h.y + Math.sin(a) * d * 0.7, { dmg: p.dmg, r: 80, delay: 0.1 }); }
  },
  bastion(G, p, dt) {
    const h = G.hero; p.x = h.x; p.y = h.y;
    h.inv = Math.max(h.inv || 0, 0.05);
    p.acc += dt;
    if (p.acc < p.every) return;
    p.acc -= p.every;
    quake(G, h.x, h.y, { r: 150, dmg: p.dmg * 0.25, kind: 'call' });
  },
  eclipse(G, p, dt) {
    const h = G.hero; p.x = h.x; p.y = h.y;
    p.acc += dt;
    if (p.acc < 0.25) return;
    p.acc = 0;
    for (const e of foes(G)) K.slow(G, e, 0.4, 0.4);
  },
  cyclone(G, p, dt) {
    const h = G.hero;
    if (p.orbit) {
      p.orbit.a += p.orbit.w * dt;
      p.x = h.x + Math.cos(p.orbit.a) * p.orbit.rad; p.y = h.y + Math.sin(p.orbit.a) * p.orbit.rad * 0.75;
    } else {
      const sp = p.speed * (1 - 0.35 * (p.t / p.life));
      const nx = p.x + Math.cos(p.angle) * sp * dt, ny = p.y + Math.sin(p.angle) * sp * dt;
      if (inside(G, nx, ny)) { p.x = nx; p.y = ny; } else p.angle += Math.PI * 0.6 + G.rng.combat() * 0.8;
    }
    if (p.hurricane) p.r = p.r0 * (1 + 0.6 * (p.t / p.life));
    p.acc += dt;
    if (p.thunder) {
      p.zap = (p.zap || 0) + dt;
      if (p.zap >= 0.4) { p.zap = 0; const e = nearest(G, p.x, p.y, 240); if (e) { arc(G, { x: p.x, y: p.y, z: 30, id: p.id }, e); boonDmg(G, e, p.thunder, { element: 'storm', kb: 80, x: p.x, y: p.y }); } }
    }
    if (p.acc < p.every) return;
    p.acc -= p.every;
    const pullR = p.r * (p.hurricane || p.monsoon ? 1.9 : 1.3);
    for (const e of foesNear(G, p.x, p.y, pullR)) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (!isBoss(G, e) && d > 14) C.knock(G, e, p.x - e.x, p.y - e.y, (p.hurricane || p.monsoon ? 170 : 90));
      if (d > p.r + (e.r || 0)) continue;
      boonDmg(G, e, p.dmg, { element: p.solar ? 'dawn' : p.monsoon ? 'tide' : 'wind', kb: 0, x: p.x, y: p.y, quiet: false });
      if (p.solar) K.burn(G, e, p.solar);
      if (p.monsoon) { K.soak(G, e, 3); K.slow(G, e, 0.35, 1); }
      if (p.sand) K.blind(G, e, 2);
    }
  },
  updraft(G, p) { const t = G.foes.find((e) => e.id === p.target); if (!t || t.dead) { p.t = p.life; return; } p.x = t.x; p.y = t.y; },
  steam(G, p, dt) { p.acc += dt; if (p.acc >= 0.5) { p.acc = 0; for (const e of foesNear(G, p.x, p.y, p.r)) K.blind(G, e, 1); } },
  mud(G, p) {
    for (const e of foesNear(G, p.x, p.y, p.r)) {
      K.slow(G, e, 0.5, 0.5);
      if (p.seen.has(e.id)) continue;
      p.seen.add(e.id);
      if (!isBoss(G, e)) C.addStatus(G, e, 'bound', p.root, 1);
    }
  },
  molten(G, p, dt) { p.acc += dt; if (p.acc >= 0.5) { p.acc = 0; for (const e of foesNear(G, p.x, p.y, p.r)) K.burn(G, e, p.dps, 1.2); } },
  phantom() {},
  seam() {},
  rift(G, p, dt) {
    p.acc += dt;
    while (p.done < p.n && p.acc >= p.every * p.done) {
      const d = 50 + (p.len - 50) * (p.done / Math.max(1, p.n - 1));
      const x = p.x + Math.cos(p.angle) * d, y = p.y + Math.sin(p.angle) * d;
      p.done++;
      if (!inside(G, x, y)) { p.done = p.n; break; }
      (p.spikes || (p.spikes = [])).push({ x, y, t: p.t });
      area(G, x, y, 58, p.dmg, { element: 'stone', kb: 260, stun: 0.6, once: p.once, x: p.x, y: p.y });
      G.bus.emit('power', { fx: 'spike', x, y, element: 'stone' });
      if (p.done === p.n) quakeExtras(G, x, y);
    }
  },
};
function quakeExtras(G, x, y) {
  const s = stats(G);
  if (s.flags.molten) newPower(G, 'molten', { x, y, r: 90, life: 3.2, dps: s.flags.molten });
  if (s.flags.mudslide) newPower(G, 'mud', { x, y, r: 90, life: 3, root: s.flags.mudslide, seen: new Set() });
  if (s.flags.sandstorm) cyclone(G, x, y, G.rng.combat() * TAU, { dmg: s.flags.sandstorm, life: 2, speed: 90, r: 70, sand: true });
}
const END = {
  bastion(G, p) {
    const h = G.hero;
    K.fx(G, 'shatter', { x: h.x, y: h.y, r: 270, element: 'stone' });
    quake(G, h.x, h.y, { r: 270, dmg: p.dmg, kb: 700, stun: 1, kind: 'call' });
  },
  cyclone(G, p) {
    if (p.solar) K.sunspot(G, p.x, p.y, { dps: p.solar, life: 3, r: 70 });
    if (p.monsoon) K.ring(G, p.x, p.y, { r0: 10, r1: 150, life: 0.3, dmg: p.monsoon, element: 'tide', kb: 520, style: 'tide', status: ['soak', 3] });
  },
  phantom(G, p) {
    K.fx(G, 'phantom', { x: p.x, y: p.y, r: p.r, element: 'shade' });
    for (const e of foesNear(G, p.x, p.y, p.r)) boonDmg(G, e, p.dmg, { element: 'shade', kb: 180, canCrit: true, x: p.x, y: p.y });
  },
};

export function tickBoons(G, dt) {
  if (!G.hero) return;
  if (G.run) fireHook(G, 'tick', { dt });
  const P = G.powers;
  if (!P || !P.length) return;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (p.dead) continue;
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.t += dt;
    const f = UPD[p.kind];
    if (f) safe('power.' + p.kind, () => f(G, p, dt));
    if (p.t >= p.life) { p.dead = true; const e = END[p.kind]; if (e) safe('powerEnd.' + p.kind, () => e(G, p)); G.bus.emit('powerEnd', { p }); }
  }
  let j = 0;
  for (let i = 0; i < P.length; i++) if (!P[i].dead) P[j++] = P[i];
  P.length = j;
}

// Convenience for the debug hook / tests: every id the runtime knows, by kind.
export function allIds() {
  return {
    boons: BOONS.map((b) => b.id), braids: BRAIDS.map((b) => b.id),
    tempers: Object.values(WEAPONS).flatMap((w) => w.tempers.map((t) => t.id)),
    aspects: Object.values(WEAPONS).flatMap((w) => w.aspects.map((a) => a.id)),
    keepsakes: Object.values(KEEPSAKES).map((k) => k.id), slots: SLOTS,
  };
}
