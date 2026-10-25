// The whole game flow as pure sim functions: title -> profiles -> hub -> run
// (chambers, waves, rewards, doors, shop, fountain, memory, miniboss, boss,
// region transitions) -> death or victory -> ending -> hub, plus meta
// progression and saves. The UI (makeApi) and the debug hook call the same
// functions. Never touches the DOM, canvas or audio (save.js touches storage).
//
// Entry points for main.js
//   boot(G, { search, debug, seed, params, store })  saves, settings, listeners, scene 'title'
//   applyUrl(G, params) -> Promise                   ?play ?scene=hub ?region ?chamber ?boss ?weapon ?seed ?profile
//   tick(G, dt)                                       every sim step, in every scene
//   makeApi(G)                                        the UI's api object (createUI(G, api))
// Flow verbs (also the debug hook's): toTitle, selectProfile(G, i), newGame(G, i), continueRun,
//   deleteProfile, toHub(G, from), startRun(G, opts), play(G, opts), enterChamber, choose(G, i|id),
//   reroll, door(G, i), buy(G, i), leaveShop, useFountain, talk(G, npc), advance, skip, answer,
//   pause, resume, quit, returnToHub, clear, kill, bossKill, boss(G, id), region(G, id), heal, damage,
//   checkpoint(G, reason), snapshot(G), reloadProfile(G).
//
// Determinism: only G.rng streams and generators seeded from the run seed. Every
// door's reward, the next chamber's layout and waves, each boon offer (and every
// reroll of it) and the shop stock come from the seed and the chamber's place in
// the run, so a reloaded checkpoint shows the same doors and offers.
//
// Checkpoints: door(G, i) writes one (the next chamber is the checkpoint). On
// pagehide / tab hidden / save.now(), a live snapshot is written: if the chamber
// is cleared it keeps everything (reward state, offer on screen, shop sold flags);
// mid-fight it restarts the chamber from its entry with hp = min(entry, now).
//
// Run state G.run (persistent fields, saved in the checkpoint; see PERSIST):
//   seed, weapon, keepsake, region, regionIndex, chamber (index in region 0..11), depth (chambers
//   entered this run, 0-based), kind, reward (this chamber's reward {kind, patron?, rarity?}),
//   plan { [region]: [kinds x12] }, shopDoors { [region]: [i, i] }, boons [{id,rarity,level}],
//   hp, maxHp, deathDefiance, rerolls, currency (Glint), path [{region, chamber, kind, reward}],
//   stats { kills, damageTaken, time, chambers, lumen, keys, shards, bosses: [ids] }, pacts, trueEnding,
//   memoryRegions [regions where a Memory Thread was found], flags {}.
// Transient chamber state G.run.ch: { wave, waveT, cleared, rewardDone, offerSeed, rerollN, shop,
//   fountain, memory, bossId, entryHp, deathT, done }.
//
// Events emitted on G.bus (besides those listed in the brief): 'scene' {from,to}, 'chamberEnter',
//   'chamberClear', 'doorOpen' {i}, 'regionEnter', 'save' {slot, seq, reason}, 'reward' {kind, ...},
//   'offer' {cards}, 'boon' {id}, 'pickup' {kind}, 'shopBuy' {item}, 'fountain' {healed}, 'memory' {id},
//   'runStart' {seed, weapon}, 'runEnd' {result}, 'waveStart' {wave}, 'ui' {station|prompt|toast},
//   'line' {speaker, lineId, text, mood}, 'ending' {kind}, 'meta' {} (meta changed in the hub).

import { rng as makeRng, hashSeed } from '../core/rng.js';
import * as Save from '../save/save.js';
import * as Chamber from './chamber.js';
import * as Hub from './hub.js';
import * as Enemies from './enemies/index.js';
import * as Bosses from './bosses/index.js';
import * as Boons from './boons.js';
import * as Story from './story.js';
import * as Combat from './combat.js';
import * as HeroSim from './hero.js';
import * as Regions from '../content/regions.js';
import * as EnemyData from '../content/enemies.js';
import * as BossData from '../content/bosses.js';
import * as BoonData from '../content/boons.js';
import * as PatronData from '../content/patrons.js';
import * as WeaponData from '../content/weapons.js';
import * as TapestryData from '../content/tapestry.js';
import * as KeepsakeData from '../content/keepsakes.js';
import * as PactData from '../content/pacts.js';
import * as MemoryData from '../content/memories.js';

export const REGION_IDS = ['glasswood', 'choir', 'forge', 'unwoven'];
export const BOSS_OF = { glasswood: 'veyl', choir: 'morrow', forge: 'aurum', unwoven: 'sable' };
const REGION_LEN = () => (Regions.RHYTHM && Regions.RHYTHM.length) || 12;
const PLAY_SCENES = new Set(['run', 'hub']);
const PERSIST = ['seed', 'weapon', 'keepsake', 'region', 'regionIndex', 'chamber', 'depth', 'kind', 'reward', 'plan', 'shopDoors',
  'boons', 'hp', 'maxHp', 'deathDefiance', 'rerolls', 'currency', 'path', 'stats', 'pacts', 'trueEnding', 'memoryRegions', 'flags', 'started', 'aspect', 'regionT', 'tempers', 'favourPatron', 'callPatron', 'rareRegion'];
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const PATRONS = () => (PatronData.PATRON_IDS && PatronData.PATRON_IDS.length ? PatronData.PATRON_IDS : ['solenne', 'maru', 'veyra', 'ossian', 'ilu', 'kestrel']);
const RARITY = ['common', 'rare', 'epic', 'mythic'];

// ------------------------------------------------------------------ small helpers
function safe(fn, ...args) {
  if (typeof fn !== 'function') return undefined;
  try { return fn(...args); } catch (e) { console.error('[loomwake run]', fn.name || 'call', e); return undefined; }
}
function emit(G, type, p) { if (G.bus) G.bus.emit(type, p); }
function story(G, type, data = {}) {
  const out = safe(Story.onEvent, G, type, data);
  return Array.isArray(out) ? out : [];
}
function setScene(G, to) {
  const from = G.scene;
  if (from === to) return;
  G.scene = to;
  G.paused = !PLAY_SCENES.has(to);
  emit(G, 'scene', { from, to });
}
function seedStreams(G, seed) {
  seed >>>= 0;
  G.seed = seed;
  G.rng = { run: makeRng(hashSeed(seed, 'run')), ai: makeRng(hashSeed(seed, 'ai')), combat: makeRng(hashSeed(seed, 'combat')) };
}
function rngStates(G) { return { run: G.rng.run.state >>> 0, ai: G.rng.ai.state >>> 0, combat: G.rng.combat.state >>> 0 }; }
function setRngStates(G, s) { if (!s) return; for (const k of ['run', 'ai', 'combat']) if (typeof s[k] === 'number') G.rng[k].state = s[k] >>> 0; }
// Run fn with G.rng.run temporarily replaced by a generator from `seed`
// (sibling code that draws from G.rng.run then gives reload-stable results).
function withRunRng(G, seed, fn) {
  const saved = G.rng.run;
  const r = makeRng(seed >>> 0);
  G.rng.run = r;
  try { return fn(r); } finally { G.rng.run = saved; }
}
const alive = (e) => e && !e.dead && !e.gone && e.team !== 'hero' && !e.ally;
function liveFoes(G) { let n = 0; for (const e of G.foes) if (alive(e)) n++; return n; }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function inc(obj, k, n = 1) { obj[k] = (obj[k] || 0) + n; return obj[k]; }
function regionName(id) { return (Regions.REGIONS && Regions.REGIONS[id] && Regions.REGIONS[id].name) || id; }
function patronName(id) { const p = PatronData.PATRONS && PatronData.PATRONS[id]; return p ? p.name : id; }
function weaponIds() {
  const W = WeaponData.WEAPONS || WeaponData.default;
  if (WeaponData.WEAPON_IDS) return WeaponData.WEAPON_IDS;
  return W ? Object.keys(W) : ['blade', 'spear', 'bow', 'gauntlets', 'chakram'];
}
function weaponDef(id) { const W = WeaponData.WEAPONS || {}; return W[id] || null; }

// ------------------------------------------------------------------ boot and profiles
export function boot(G, opts = {}) {
  const search = opts.search ?? (typeof location !== 'undefined' ? location.search : '');
  const store = opts.store || Save.pickStore(search);
  G.saves = Save.createSaves({ store, now: opts.now || (() => Date.now()) });
  G.bootSeed = (opts.seed ?? G.seed ?? 1) >>> 0;
  G.flow = { checkpoint, reloadProfile, snapshot };
  G.settings = G.saves.loadSettings();
  G.lastSave = null;
  G.lastRun = null;
  G.assist = { taken: 1 };
  G.prompt = null;
  if (store.kind === 'local') Save.requestPersist();
  if (!G._leaveHooked) { G._leaveHooked = true; Save.onLeave((why) => leaveCheckpoint(G, why)); }
  hookBus(G);
  const p = opts.profile ?? G.saves.lastProfile();
  loadProfile(G, p);
  setScene(G, 'title');
  story(G, 'boot');
  return G;
}

function hookBus(G) {
  if (G._runBus === G.bus) return;
  G._runBus = G.bus;
  const on = (t, f) => G.bus.on(t, (p) => { try { f(p || {}); } catch (e) { console.error('[loomwake run] on', t, e); } });
  on('heroDeath', () => { if (G.run && G.run.ch && !G.run.ch.deathT) G.run.ch.deathT = 1.7; });
  on('heroHurt', (p) => { G._lastHurt = { src: p.src || p.kind || null, t: G.t, dmg: p.dmg || 0 }; if (G.run) G.run.stats.damageTaken += p.dmg || 0; });
  on('kill', (p) => {
    const e = p.e || {};
    if (!G.run || e.team === 'hero') return;
    G.run.stats.kills++;
    if (G.meta) { G.meta.stats.kills = (G.meta.stats.kills || 0) + 1; inc(G.meta.codex.foes, e.kind || p.kind || 'foe'); }
  });
  on('bossDefeat', (p) => { if (G.run && G.run.ch) G.run.ch.bossDefeat = { ...p }; });
  on('bossPhase', (p) => story(G, 'bossPhase', p));
  on('bossChoice', (p) => { G.ui = G.ui || {}; G.ui.bossChoice = { ...p }; story(G, 'bossChoice', p); });
}

function loadProfile(G, p) {
  p = Math.max(0, Math.min(Save.PROFILES - 1, p | 0));
  const r = G.saves.load(p);
  G.profile = p;
  G.meta = r.meta || Save.freshMeta(Date.now());
  safe(Story.ensureStoryMeta, G);
  G.saveInfo = { readOnly: r.readOnly, message: r.message, recovered: r.recovered, empty: r.empty, migratedFrom: r.migratedFrom };
  G.checkpoint = r.run || null;
  G.lastSave = r.ok ? { seq: r.seq, slot: r.slot, at: r.at } : null;
  updateAssist(G);
  return r;
}
export function reloadProfile(G) {
  G.run = null; clearArena(G);
  loadProfile(G, G.profile);
  return G.meta;
}

function updateAssist(G) {
  const a = G.meta && G.meta.assist;
  G.assist = { taken: a && a.gentle ? Math.max(0.2, 1 - (0.2 + 0.02 * Math.min(30, a.level | 0))) : 1 };
}

// Write meta plus the current checkpoint (if any) to the profile.
function persist(G, run, reason) {
  if (!G.saves || !G.meta) return { ok: false };
  const w = G.saves.write(G.profile, G.meta, run === undefined ? currentCheckpoint(G) : run);
  if (w.ok) {
    G.lastSave = { seq: w.seq, slot: w.slot, at: w.at };
    G.saves.setLastProfile(G.profile);
    emit(G, 'save', { slot: w.slot, seq: w.seq, reason: reason || 'meta' });
  }
  return w;
}
function currentCheckpoint(G) {
  if (G.run && !G.run.over) return G.run.cp || null;
  if (!G.run && (G.scene === 'title' || G.scene === 'profiles' || G.scene === 'loading')) return G.checkpoint || null;
  return null;
}
export function saveMeta(G) { emit(G, 'meta', {}); return persist(G, undefined, 'meta'); }

export function toTitle(G) {
  if (G.run && !G.run.over && G.run.ch && G.run.ch.cleared) checkpoint(G, 'title');
  G.run = null; G.offer = null; G.dialogue = null; G.fountain = null; G.shop = null;
  clearArena(G);
  loadProfile(G, G.profile);
  setScene(G, 'title');
  return G.scene;
}
export function toProfiles(G) { setScene(G, 'profiles'); return G.scene; }

export function profiles(G) { return G.saves ? G.saves.profiles() : []; }

export function selectProfile(G, i) {
  loadProfile(G, i);
  G.saves.setLastProfile(G.profile);
  if (G.saveInfo.readOnly) { setScene(G, 'title'); emit(G, 'ui', { toast: G.saveInfo.message }); return { ok: false, readOnly: true, message: G.saveInfo.message }; }
  if (G.checkpoint) return continueRun(G);
  toHub(G, G.saveInfo.empty ? 'new' : 'continue');
  return { ok: true };
}

export function newGame(G, i, opts = {}) {
  const p = i === undefined || i === null ? G.profile : i;
  loadProfile(G, p);
  if (G.saveInfo.readOnly) return { ok: false, readOnly: true, message: G.saveInfo.message };
  if (opts.wipe || G.saveInfo.empty || G.saveInfo.recovered && !G.lastSave) {
    G.saves.wipe(p);
    G.meta = Save.freshMeta(Date.now());
    safe(Story.ensureStoryMeta, G);
    G.checkpoint = null;
    persist(G, null, 'new');
    toHub(G, 'new');
    return { ok: true, fresh: true };
  }
  G.saves.setLastProfile(p);
  if (G.checkpoint && !opts.hub) return continueRun(G);
  toHub(G, 'continue');
  return { ok: true };
}

export function deleteProfile(G, i) {
  G.saves.wipe(i | 0);
  if ((i | 0) === G.profile) { G.run = null; loadProfile(G, G.profile); }
  return { ok: true };
}

export function continueRun(G) {
  if (!G.meta) loadProfile(G, G.profile);
  const cp = G.checkpoint || (G.saves && G.saves.load(G.profile).run);
  if (!cp) { toHub(G, 'continue'); return { ok: true, hub: true }; }
  try {
    restoreRun(G, cp);
    return { ok: true, resumed: true };
  } catch (e) {
    console.error('[loomwake run] checkpoint could not be restored', e);
    G.checkpoint = null; G.run = null;
    toHub(G, 'continue');
    emit(G, 'ui', { toast: 'The checkpoint could not be restored; you are back in the Loomhall.' });
    return { ok: false, hub: true };
  }
}

// ------------------------------------------------------------------ arena helpers
function clearArena(G) {
  G.foes = []; G.boss = null; G.projectiles = []; G.telegraphs = []; G.zones = []; G.pickups = [];
  if (G.foeFx) G.foeFx = [];
  G.offer = null;
}
function heroReset(G, full, x, y) {
  const h = G.hero;
  if (!h) return;
  if (HeroSim.resetHero) { safe(HeroSim.resetHero, G, { x, y, full }); }
  else {
    Object.assign(h, { x, y, vx: 0, vy: 0, kx: 0, ky: 0, state: 'move', st: 0, dashing: false, snare: null, status: {}, inv: 0.4, stun: 0, dead: false });
    if (full) { h.hp = h.maxHp; h.call = 0; }
  }
  if (x !== undefined) { h.x = x; h.y = y; h.vx = h.vy = 0; h.kx = h.ky = 0; }
  h.dead = false;
}
function recomputeStats(G) {
  if (HeroSim.recomputeStats && G.hero) return safe(HeroSim.recomputeStats, G);
  if (Boons.recompute) return safe(Boons.recompute, G);
  if (Boons.applyStats) return safe(Boons.applyStats, G);
  if (Boons.heroStats) {
    const s = safe(Boons.heroStats, G);
    if (s && G.hero && s !== G.hero.stats) G.hero.stats = s;
    if (G.hero && G.hero.stats && G.hero.stats.maxHp) G.hero.maxHp = G.hero.stats.maxHp;
  }
}

// ------------------------------------------------------------------ hub
export function toHub(G, from = 'quit') {
  G.run = null; G.offer = null; G.dialogue = null; G.fountain = null; G.shop = null; G.ending = null; G.talkQueue = null;
  G.checkpoint = null;
  clearArena(G);
  let hub = safe(Hub.makeHub, G.meta, G);
  if (!hub) hub = fallbackHub();
  hub.kind = hub.kind || 'hub';
  G.chamber = hub;
  G.npcs = hub.npcs || G.npcs || [];
  const e = hub.entry || { x: 0, y: 200 };
  if (G.hero) {
    G.hero.weapon = G.meta.loadout.weapon || 'blade';
    recomputeStats(G);
    heroReset(G, true, e.x, e.y);
    if (from === 'death' && HeroSim.respawnHero) safe(HeroSim.respawnHero, G, e.x, e.y);
  }
  for (const k of keepsakeList()) if (k.unlock && k.unlock.flag && G.meta.flags[k.unlock.flag] && !G.meta.unlocks.keepsakes.includes(k.id)) G.meta.unlocks.keepsakes.push(k.id);
  setScene(G, 'hub');
  emit(G, 'chamberEnter', { chamber: hub });
  const said = story(G, 'hubEnter', { from });
  persist(G, null, 'hub');
  // hub conversations the story wants told (onboarding, reactions): portrait dialogue, one after another
  const talks = said.filter((e) => e && e.kind === 'talk' && e.lines && e.lines.length);
  if (talks.length) { G.talkQueue = talks.slice(1); openDialogue(G, talks[0], 'hub'); }
  return G.scene;
}
function fallbackHub() {
  const pts = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push([Math.cos(a) * 760, Math.sin(a) * 460]); }
  return { id: 'hub', kind: 'hub', region: 'hub', shape: pts, obstacles: [], hazards: [], props: [], features: [], lights: [], entry: { x: 0, y: 260 },
    doors: [], waves: [], spawnPoints: [], dreamdoor: { x: 0, y: -380, r: 90 }, npcs: [], stations: [] };
}
function dreamdoorOf(hub) {
  if (!hub) return null;
  if (hub.dreamdoor) return hub.dreamdoor;
  const s = (hub.stations || []).find((x) => x.id === 'dreamdoor' || x.kind === 'dreamdoor');
  if (s) return s;
  const d = (hub.doors || [])[0];
  return d || null;
}

// ------------------------------------------------------------------ run start
// opts: { seed, weapon, keepsake, region, chamber, boons: [ids | {id, rarity}], aspect, pacts }
export function startRun(G, opts = {}) {
  if (!G.meta) loadProfile(G, G.profile);
  // a Dreamdoor run's seed follows from the boot seed, the profile and how many runs it has begun
  const seed = (opts.seed ?? hashSeed(G.bootSeed ?? G.seed, G.profile, G.meta.createdAt || 0, G.meta.stats.started || 0)) >>> 0;
  seedStreams(G, seed);
  const weapon = opts.weapon || G.meta.loadout.weapon || 'blade';
  const keepsake = opts.keepsake !== undefined ? opts.keepsake : G.meta.loadout.keepsake || null;
  const ri = Math.max(0, REGION_IDS.indexOf(opts.region || 'glasswood'));
  const region = REGION_IDS[ri];
  const chamber = Math.max(0, Math.min(REGION_LEN() - 1, opts.chamber | 0));
  const pacts = clone(opts.pacts || G.meta.pacts || {});
  G.run = {
    seed, weapon, keepsake, aspect: opts.aspect || null, region, regionIndex: ri, chamber, depth: ri * REGION_LEN() + chamber, kind: 'entry',
    reward: null, plan: {}, shopDoors: {}, boons: [], hp: 100, maxHp: 100, deathDefiance: 0, rerolls: 0, currency: 0,
    path: [], stats: { kills: 0, damageTaken: 0, time: 0, chambers: 0, lumen: 0, keys: 0, shards: 0, bosses: [] },
    pacts, trueEnding: !!(safe(Story.canTrueEnding, G) || false), memoryRegions: [], flags: {}, started: Date.now(),
    ch: null, cp: null, over: false,
  };
  G.lastRun = null;
  G.meta.stats.started = (G.meta.stats.started || 0) + 1;
  inc(G.meta.stats.weaponRuns, weapon);
  for (let i = 0; i <= ri; i++) ensurePlan(G, REGION_IDS[i]);
  G.run.kind = G.run.plan[region][chamber];
  // hero for the run
  clearArena(G);
  G.offer = null; G.dialogue = null;
  if (G.hero) G.hero.weapon = weapon;
  recomputeStats(G);
  applyMetaToRun(G);
  heroReset(G, true, 0, 0);
  G.run.maxHp = G.hero ? G.hero.maxHp : 100;
  G.run.hp = G.hero ? G.hero.hp : 100;
  G.run.deathDefiance = G.hero ? G.hero.deathDefiance || 0 : 0;
  for (const b of opts.boons || []) {
    const id = typeof b === 'string' ? b : b.id;
    const rarity = typeof b === 'string' ? 'common' : b.rarity || 'common';
    giveBoon(G, id, rarity, { silent: true });
  }
  syncRunFromHero(G);
  G.run.reward = chamber === 0 && ri === 0 ? { kind: 'boon', patron: firstPatron(G) } : opts.reward || { kind: 'boon', patron: firstPatron(G) };
  emit(G, 'runStart', { seed, weapon, keepsake });
  story(G, 'runStart', { weapon, keepsake, seed });
  setScene(G, 'run');
  arrive(G, { fresh: true });
  return G.run;
}

// ?debug play(opts): from anywhere straight into a run.
export function play(G, opts = {}) {
  if (!G.meta) loadProfile(G, G.profile);
  if (opts.boss) return boss(G, opts.boss, opts);
  return startRun(G, opts);
}

function firstPatron(G) {
  const r = makeRng(hashSeed(G.run.seed, 'firstPatron'));
  return r.pick(PATRONS());
}

// Tapestry, keepsake and pact effects at run start. Stat effects are folded
// into G.hero.stats by the boons runtime (heroStats reads meta.tapestry and the
// keepsake); run.js applies the run-setup ones.
function applyMetaToRun(G) {
  const run = G.run, m = G.meta, h = G.hero;
  const T = TapestryData.tapestryMods ? safe(TapestryData.tapestryMods, m) || {} : {};
  run.tap = T;
  run.mods = pactMods(run.pacts);
  if (h) {
    const s = h.stats || {};
    // death defiance: the stats may already include the Tapestry's; never double it
    let dd = Math.max(h.deathDefiance || 0, s.deathDefiance || 0, T.deathDefiance || 0);
    if (run.mods.deathDefianceOff) dd = Math.max(0, dd - (T.deathDefiance || 0));
    h.deathDefiance = dd;
    if (T.callStart) h.call = Math.max(h.call || 0, T.callStart);
  }
  const hs = (h && h.stats) || {};
  run.rerolls = (hs.rerolls ?? T.rerolls ?? 0) | 0;
  run.currency = (hs.startGlint ?? T.startGlint ?? 0) | 0;
}
function pactMods(pacts) {
  const base = { foeHp: 1, foeDmg: 1, foeSpeed: 1, eliteChance: 0, bossArmor: 1, bossPhaseFast: 0, healMult: 1, offerCount: 0, deathDefianceOff: false, timeLimit: 0, hazardDmg: 1, extraWave: 0, fray: 0 };
  const m = PactData.pactMods ? { ...base, ...(safe(PactData.pactMods, pacts || {}) || {}) } : base;
  const fr = PactData.frayReward ? safe(PactData.frayReward, m.fray) : null;
  m.rewards = fr ? fr.lumenMult : 1 + m.fray * 0.1;
  m.bonusKeys = fr ? fr.keys : 0;
  return m;
}
function tapestryNodes() {
  const T = TapestryData.TAPESTRY;
  return Array.isArray(T) ? T : [];
}
function pactList() { return Array.isArray(PactData.PACTS) ? PactData.PACTS : []; }

// ------------------------------------------------------------------ region plan
// Chamber kinds for a region, decided once per run per region from the seed.
function ensurePlan(G, region) {
  const run = G.run;
  if (run.plan[region]) return run.plan[region];
  const R = Regions.RHYTHM || {};
  const n = REGION_LEN();
  const r = makeRng(hashSeed(run.seed, 'plan', region));
  const plan = new Array(n).fill('combat');
  plan[0] = 'entry';
  plan[n - 1] = 'boss';
  const mb = R.miniboss || [5, 6];
  plan[r.int(mb[0], mb[1])] = 'miniboss';
  const fr = R.fountain || [8, 10];
  let fi = r.int(fr[0], Math.min(fr[1], n - 2));
  if (plan[fi] !== 'combat') fi = fr[1];
  const mem = R.memoryChance ?? 0.35;
  plan[fi] = r() < mem && Chamber.makeChamber && hasTemplates(region, 'memory') ? 'memory' : 'fountain';
  const el = R.elite || { from: 2, chance: 0.22 };
  for (let i = el.from; i < n - 1; i++) if (plan[i] === 'combat' && r() < el.chance) plan[i] = 'elite';
  run.plan[region] = plan;
  // a shop door is offered once in each half
  const sh = R.shop || [3, 9];
  const mid = Math.floor((sh[0] + sh[1]) / 2);
  const pickIn = (a, b) => { const c = []; for (let i = a; i <= b; i++) if (plan[i] === 'combat' || plan[i] === 'elite') c.push(i); return c.length ? r.pick(c) : -1; };
  run.shopDoors[region] = [pickIn(sh[0], mid), pickIn(mid + 1, sh[1])].filter((x) => x >= 0);
  return plan;
}
function hasTemplates(region, kind) {
  try { return Regions.templatesFor ? Regions.templatesFor(region, kind).length > 0 : true; } catch { return false; }
}

// ------------------------------------------------------------------ chambers
// Build the current chamber (G.run.region / chamber / kind) and put the hero in it.
// The chamber seed and door rewards draw from G.rng.run, whose state at this
// point is the checkpoint's, so a reload regenerates the same chamber.
function arrive(G, { fresh = false, resume = null } = {}) {
  const run = G.run;
  ensurePlan(G, run.region);
  run.kind = run.plan[run.region][run.chamber] || 'combat';
  // the checkpoint: everything needed to rebuild this moment
  if (!resume) run.cp = snapshotRun(G);
  const cseed = (G.rng.run() * 4294967296) >>> 0;
  const doorPlan = rollDoors(G);
  let chamber = null;
  const kind = run.kind;
  const opts = { rewards: doorPlan, doors: doorPlan.length };
  if (Enemies.buildWave) {
    const ew = Enemies.waveBudget;
    opts.buildWave = (r, c) => Enemies.buildWave(r, { ...c, kind, budget: ew ? ew(run.region, c.depth, c.wave, kind) : c.budget });
  }
  try { chamber = Chamber.makeChamber(run.region, run.chamber, kind, cseed, opts); }
  catch (e) {
    console.error('[loomwake run] makeChamber failed', run.region, run.chamber, kind, e);
    try { chamber = Chamber.makeChamber(run.region, run.chamber, 'combat', cseed, opts); } catch { chamber = fallbackChamber(run, kind); }
  }
  if (!chamber) chamber = fallbackChamber(run, kind);
  // Fraying pact: extra waves repeat the last one
  if (run.mods && run.mods.extraWave > 0 && ['combat', 'elite', 'entry'].includes(kind) && chamber.waves && chamber.waves.length) {
    for (let i = 0; i < run.mods.extraWave; i++) chamber.waves.push(chamber.waves[chamber.waves.length - 1].map((w) => ({ ...w })));
  }
  if (Chamber.setDoorRewards) Chamber.setDoorRewards(chamber, doorPlan);
  else chamber.doors.forEach((d, i) => { d.reward = doorPlan[i] ?? null; });
  for (const d of chamber.doors) d.open = false;
  clearArena(G);
  G.chamber = chamber;
  const offerSeed = hashSeed(run.seed, 'offer', run.depth);
  run.ch = { wave: -1, waveT: 0.9, cleared: false, rewardDone: false, rewardDropped: false, offerSeed, rerollN: 0, shop: null, fountain: null, memory: null,
    bossId: null, entryHp: G.hero ? G.hero.hp : run.hp, deathT: 0, enterT: 0, waves: chamber.waves ? chamber.waves.length : 0 };
  const e = safeEntry(chamber);
  if (G.hero) {
    G.hero.weapon = run.weapon;
    heroReset(G, false, e.x, e.y);
    if (HeroSim.placeHero) safe(HeroSim.placeHero, G, e.x, e.y);
  }
  run.stats.chambers++;
  safe(Boons.fireHook, G, 'onRoomStart', { chamber });
  if (!resume) {
    G.meta.stats.chambers = (G.meta.stats.chambers || 0) + 1;
    G.meta.stats.deepest = Math.max(G.meta.stats.deepest || 0, run.depth + 1);
  }
  if (run.chamber === 0 && !resume) {
    inc(G.meta.stats.regionsReached, run.region);
    const st = G.hero && G.hero.stats;
    if (st && st.regionHeal && run.depth > 0) safe(Combat.healHero, G, Math.round(G.hero.maxHp * st.regionHeal));
    run.flags.firstBoon = run.flags.firstBoon || {};
    emit(G, 'regionEnter', { region: run.region, index: run.regionIndex });
    story(G, 'regionEnter', { region: run.region, index: run.regionIndex });
  }
  emit(G, 'chamberEnter', { chamber });
  story(G, 'chamberEnter', { chamber, depth: run.depth, kind, region: run.region, index: run.chamber });
  // non-combat chambers are cleared on arrival
  if (kind === 'shop') { run.ch.shop = rollShop(G); G.shop = run.ch.shop; markCleared(G, true); }
  else if (kind === 'fountain') { run.ch.fountain = { used: false, healed: 0, npc: null, memory: null }; prepareFountain(G); markCleared(G, true); }
  else if (kind === 'memory') { run.ch.memory = { id: safe(Story.pickMemory, G) ?? pickMemoryFallback(G), done: false }; markCleared(G, true); }
  else if (kind === 'boss') { run.ch.bossId = BOSS_OF[run.region]; }
  if (G.scene !== 'run') setScene(G, 'run');
  if (fresh) persist(G, run.cp, 'start');
  return chamber;
}
export function enterChamber(G) { return arrive(G, {}); }

// The arrival point, nudged out of any hazard circle it lands in (a template whose
// entry ray ends in a pit would otherwise drop the hero in again and again).
function safeEntry(chamber) {
  const e = { ...(chamber.entry || { x: 0, y: 300 }) };
  const hz = (chamber.hazards || []).filter((z) => z.r > 0);
  for (let k = 0; k < 8; k++) {
    const z = hz.find((q) => Math.hypot(e.x - q.x, e.y - q.y) < q.r + 34);
    if (!z) break;
    // walk back toward the entry edge, then sideways if still inside
    const ex = (e.ex ?? e.x) - z.x, ey = (e.ey ?? e.y) - z.y, d = Math.hypot(ex, ey) || 1;
    const need = z.r + 40;
    e.x = Math.round(z.x + (ex / d) * need); e.y = Math.round(z.y + (ey / d) * need);
    if (chamber.shape && !pointIn(e.x, e.y, chamber.shape)) { e.x = Math.round(z.x + need * (k % 2 ? -1 : 1)); e.y = Math.round(z.y); }
  }
  if (e.x !== (chamber.entry || {}).x || e.y !== (chamber.entry || {}).y) chamber.entry = { ...chamber.entry, x: e.x, y: e.y, moved: true };
  return e;
}
function pointIn(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function fallbackChamber(run, kind) {
  const pts = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push([Math.cos(a) * 800, Math.sin(a) * 500]); }
  return { id: `${run.region}:${run.chamber}:fallback`, region: run.region, kind, index: run.chamber, seed: 0, shape: pts, obstacles: [], hazards: [], props: [], features: [], stations: [], lights: [],
    entry: { x: 0, y: 380 }, doors: [{ i: 0, x: 0, y: -440, angle: -Math.PI / 2, reward: null, open: false }], waves: kind === 'boss' ? [] : [[{ kind: 'hollow', x: 0, y: -100 }, { kind: 'hollow', x: 200, y: -60 }]], spawnPoints: [{ x: 0, y: -100 }] };
}

// Door rewards for the exits of the chamber being built, i.e. what the NEXT chamber gives.
function rollDoors(G) {
  const run = G.run, n = REGION_LEN();
  const r = G.rng.run;
  const last = run.chamber >= n - 1;
  if (last) {
    // after the boss: one door down to the next region (or none after Sable)
    if (run.regionIndex >= REGION_IDS.length - 1) return [];
    return [{ kind: 'boon', patron: r.pick(PATRONS()), region: REGION_IDS[run.regionIndex + 1] }];
  }
  const nextIdx = run.chamber + 1;
  const plan = run.plan[run.region];
  const nextKind = plan[nextIdx];
  if (nextKind === 'boss') return [{ kind: 'boss', boss: BOSS_OF[run.region] }];
  if (nextKind === 'fountain') return [{ kind: 'fountain' }];
  if (nextKind === 'memory') return [{ kind: 'memory' }];
  const doors = run.kind === 'entry' ? 2 : run.kind === 'miniboss' || run.kind === 'shop' || run.kind === 'fountain' ? 2 : r() < 0.45 ? 3 : 2;
  const out = [];
  const usedPatrons = new Set();
  const shopHere = (run.shopDoors[run.region] || []).includes(nextIdx) && nextKind !== 'miniboss';
  if (shopHere) out.push({ kind: 'shop' });
  const hpFrac = (run.hp || 1) / Math.max(1, run.maxHp || 100);
  const hasBoons = run.boons.length > 0;
  const pool = [
    { k: 'boon', w: 5 }, { k: 'knot', w: hasBoons ? 1.3 : 0 }, { k: 'heal', w: hpFrac < 0.6 ? 1.6 : 0.6 },
    { k: 'run', w: 1.3 }, { k: 'lumen', w: 1.4 }, { k: 'temper', w: (run.tempers || []).length < 2 && run.depth > 2 ? 0.7 : 0 }, { k: 'key', w: run.depth > 4 ? 0.45 : 0.1 }, { k: 'shard', w: 0.7 },
  ];
  let guard = 0;
  while (out.length < doors && guard++ < 30) {
    const k = r.weighted(pool, (x) => x.w).k;
    if (k !== 'boon' && out.some((o) => o.kind === k)) continue;
    if (k === 'boon') {
      const left = PATRONS().filter((p) => !usedPatrons.has(p));
      const patron = r.pick(left.length ? left : PATRONS());
      usedPatrons.add(patron);
      out.push({ kind: 'boon', patron });
    } else out.push({ kind: k });
  }
  // a miniboss chamber always pays out a boon of higher rarity
  if (nextKind === 'miniboss') for (const o of out) if (o.kind === 'boon') o.rarity = 'rare';
  if (nextKind === 'elite') for (const o of out) o.elite = true;
  return out;
}

// ------------------------------------------------------------------ waves and clearing
function startWave(G, w) {
  const run = G.run, ch = run.ch, chamber = G.chamber;
  ch.wave = w;
  const list = (chamber.waves || [])[w] || [];
  const mods = run.mods || {};
  const er = makeRng(hashSeed(run.seed, 'elite', run.depth, w));
  const sc = (EnemyData.REGION_SCALE && EnemyData.REGION_SCALE[run.region]) || { hp: 1 };
  for (const s of list) {
    const elite = !!s.elite || (mods.eliteChance > 0 && er() < mods.eliteChance);
    const o = { elite, miniboss: !!s.miniboss, region: run.region, delay: s.delay || 0 };
    if ((mods.foeHp || 1) !== 1) o.scale = sc.hp * mods.foeHp;
    const e = Enemies.spawn ? safe(Enemies.spawn, G, s.kind, s.x, s.y, o) : null;
    if (e) {
      if ((mods.foeDmg || 1) !== 1) e.dmg = Math.round(e.dmg * mods.foeDmg);
      if ((mods.foeSpeed || 1) !== 1 && e.speed) e.speed *= mods.foeSpeed;
      if (s.miniboss) e.miniboss = true;
    }
  }
  emit(G, 'waveStart', { wave: w, count: list.length });
  story(G, 'waveStart', { wave: w, region: run.region, kind: run.kind });
}
function startBossFight(G) {
  const run = G.run, ch = run.ch;
  const id = ch.bossId;
  ch.wave = 0;
  const at = G.chamber.bossAt || { x: 0, y: -240 };
  const fn = Bosses.startBoss || Bosses.spawnBoss;
  const mods = run.mods || {};
  safe(fn, G, id, { x: at.x, y: at.y, chamber: G.chamber, trueEnding: !!run.trueEnding, hpMul: mods.foeHp || 1, dmgMul: mods.foeDmg || 1, armorMul: mods.bossArmor || 1, phaseFast: mods.bossPhaseFast || 0 });
  inc(G.meta.stats.bossMeets, id);
  story(G, 'bossIntro', { id });
}

function markCleared(G, quiet = false) {
  const run = G.run, ch = run.ch;
  if (ch.cleared) return;
  ch.cleared = true;
  safe(Boons.fireHook, G, 'onRoomClear', { chamber: G.chamber });
  if (!quiet) {
    emit(G, 'chamberClear', { chamber: G.chamber });
    story(G, 'chamberClear', { kind: run.kind, region: run.region });
    // a little Glint for every cleared fight
    const glint = Math.round((6 + run.regionIndex * 3 + run.chamber * 0.5) * glintMult(G));
    run.currency += glint;
    if (run.keepsake) { const key = String(run.keepsake).replace(/^keepsake\./, ''); inc(G.meta.keepsakeXp, key); }
    const ha = run.tap && run.tap.healAfter;
    if (ha) safe(Combat.healHero, G, ha);
  }
  if (run.kind === 'boss' || ['shop', 'fountain', 'memory'].includes(run.kind)) {
    // these chambers carry no door reward of their own (boss drops its own)
    if (run.kind !== 'boss') { ch.rewardDone = true; openDoors(G); }
    return;
  }
  dropReward(G);
}

function dropReward(G) {
  const run = G.run, ch = run.ch;
  const rw = run.reward;
  if (!rw || ch.rewardDropped) { ch.rewardDone = true; openDoors(G); return; }
  ch.rewardDropped = true;
  const h = G.hero || { x: 0, y: 0 };
  const c = rewardSpot(G);
  G.pickups.push({ id: G.nextId++, kind: rewardPickupKind(rw.kind), x: c.x, y: c.y, z: 0, r: 30, t: 0, reward: clone(rw), main: true });
  void h;
}
function rewardSpot(G) {
  // centre of the arena nudged toward the hero, clear of obstacles
  const h = G.hero || { x: 0, y: 0 };
  let x = h.x * 0.35, y = h.y * 0.35;
  for (const o of (G.chamber && G.chamber.obstacles) || []) {
    const d = Math.hypot(x - o.x, y - o.y);
    if (d < o.r + 50) { const k = (o.r + 60) / Math.max(1, d); x = o.x + (x - o.x) * k; y = o.y + (y - o.y) * k; }
  }
  return { x: Math.round(x), y: Math.round(y) };
}
function rewardPickupKind(k) { return { temper: 'temper', boon: 'boon', knot: 'knot', heal: 'heal', run: 'run', lumen: 'lumen', key: 'key', shard: 'shard', memory: 'memory', boss: 'boss' }[k] || k; }

function openDoors(G) {
  if (!G.chamber) return;
  for (const d of G.chamber.doors || []) if (!d.open) { d.open = true; emit(G, 'doorOpen', { i: d.i }); }
}

// ------------------------------------------------------------------ rewards
function collect(G, p) {
  const run = G.run;
  p.taken = true;
  G.pickups = G.pickups.filter((x) => x !== p);
  emit(G, 'pickup', { kind: p.kind, x: p.x, y: p.y });
  const rw = p.reward || { kind: p.kind };
  applyReward(G, rw, p);
  if (p.main && !G.offer) { run.ch.rewardDone = true; openDoors(G); }
}

function applyReward(G, rw, p = null) {
  const run = G.run, m = G.meta, h = G.hero;
  const mul = run.mods ? run.mods.rewards : 1;
  const r = makeRng(hashSeed(run.seed, 'reward', run.depth, rw.kind));
  switch (rw.kind) {
    case 'boon': openOffer(G, { kind: 'boon', patron: rw.patron, rarity: rw.rarity, back: 'run', main: !!(p && p.main) }); break;
    case 'knot': openOffer(G, { kind: 'knot', back: 'run', main: !!(p && p.main) }); break;
    case 'temper': openOffer(G, { kind: 'temper', back: 'run', main: !!(p && p.main) }); break;
    case 'heal': { const n = Math.round((h ? h.maxHp : 100) * 0.3); safe(Combat.healHero, G, n); emit(G, 'reward', { kind: 'heal', n }); break; }
    case 'run': { const n = Math.round(r.int(40, 65) * (1 + run.regionIndex * 0.25) * glintMult(G)); run.currency += n; emit(G, 'reward', { kind: 'run', n }); break; }
    case 'lumen': { const n = Math.round(r.int(14, 24) * (1 + run.regionIndex * 0.3) * mul); bank(G, 'lumen', n); emit(G, 'reward', { kind: 'lumen', n }); break; }
    case 'key': { bank(G, 'keys', 1); emit(G, 'reward', { kind: 'key', n: 1 }); break; }
    case 'shard': { const n = r.int(1, 2); bank(G, 'shards', n); emit(G, 'reward', { kind: 'shard', n }); break; }
    case 'boss': {
      const n = Math.round((40 + run.regionIndex * 25) * mul);
      bank(G, 'lumen', n); bank(G, 'keys', 1); bank(G, 'shards', 2);
      safe(Combat.healHero, G, Math.round((h ? h.maxHp : 100) * 0.25));
      emit(G, 'reward', { kind: 'boss', lumen: n, keys: 1, shards: 2 });
      break;
    }
    case 'memory': playMemoryThread(G, rw.id); break;
    case 'gilt': run.currency += rw.n | 0; break;
    default: break;
  }
  void m;
}

function glintMult(G) { const s = G.hero && G.hero.stats; return (s && s.glintMult) || 1; }

// Banking: meta currencies found in a run are kept even on death.
function bank(G, cur, n) {
  if (cur === 'lumen' && G.run && G.run.tap && G.run.tap.lumenMult) n = Math.round(n * G.run.tap.lumenMult);
  G.meta.currency[cur] = (G.meta.currency[cur] || 0) + n;
  if (G.run) G.run.stats[cur] = (G.run.stats[cur] || 0) + n;
}

// ------------------------------------------------------------------ boon offers
function rarityRoll(r, depth, min) {
  const x = r();
  const d = Math.min(1, depth / 40);
  let k = x < 0.04 + d * 0.06 ? 2 : x < 0.22 + d * 0.15 ? 1 : 0;
  if (depth > 30 && r() < 0.02) k = 3;
  if (min) k = Math.max(k, RARITY.indexOf(min));
  return RARITY[k];
}
function buildOffer(G, spec, n) {
  const run = G.run;
  const seed = hashSeed(run.ch ? run.ch.offerSeed : run.seed, spec.kind, spec.patron || '-', n, spec.shopItem || '');
  return withRunRng(G, seed, (r) => {
    let cards = null;
    const keepOffer = G.offer;
    if (Boons.offerBoons) cards = safe(Boons.offerBoons, G, r, { patron: spec.patron || null, kind: spec.kind || 'boon', rarityBonus: spec.rarity === 'rare' ? 0.35 : spec.rarity === 'epic' ? 0.7 : 0 });
    G.offer = keepOffer;
    if (!Array.isArray(cards)) cards = spec.kind === 'knot' ? fallbackKnot(G, r) : fallbackOffer(G, spec.patron, r, spec.rarity);
    return cards.map((c) => (typeof c === 'string' ? { id: c, rarity: 'common' } : { ...c }));
  });
}
function fallbackKnot(G, r) {
  const owned = G.run.boons.slice();
  r.shuffle(owned);
  return owned.slice(0, 3).map((b) => ({ id: b.id, slot: boonSlot(b.id), patron: boonPatron(b.id), rarity: b.rarity, level: (b.level || 1) + 1, from: b.level || 1, levels: 1, knot: true, braid: false }));
}
function fallbackOffer(G, patron, r, min) {
  const all = boonList().filter((b) => (!patron || b.patron === patron) && !b.needs);
  const owned = new Set(G.run.boons.map((b) => b.id));
  const left = all.filter((b) => !owned.has(b.id));
  const pool = (left.length ? left : all).slice();
  r.shuffle(pool);
  return pool.slice(0, 3).map((b) => ({ id: b.id, slot: b.slot, patron: b.patron, rarity: rarityRoll(r, G.run.depth, min), braid: false }));
}
function boonList() {
  const B = BoonData.BOONS;
  return Array.isArray(B) ? B : B && typeof B === 'object' ? Object.values(B) : [];
}
function boonDef(id) {
  const D = BoonData.DEFS;
  if (D && D[id]) return D[id];
  return boonList().find((b) => b.id === id) || null;
}
export const boonInfo = (id) => boonDef(id);
const boonSlot = (id) => { const b = boonDef(id); return b ? b.slot : null; };
const boonPatron = (id) => { const b = boonDef(id); return b ? b.patron : null; };

function openOffer(G, spec) {
  const run = G.run;
  const st = G.hero && G.hero.stats;
  if (spec.kind === 'boon' && st && st.firstBoonRare) {
    run.flags.firstBoon = run.flags.firstBoon || {};
    if (!run.flags.firstBoon[run.region]) { run.flags.firstBoon[run.region] = true; spec = { ...spec, rarity: spec.rarity === 'epic' ? 'epic' : 'rare' }; }
  }
  const cards = buildOffer(G, spec, run.ch.rerollN);
  if (!cards.length) {
    // nothing to offer (e.g. a knot with no boons): give Glint instead
    run.currency += 40;
    emit(G, 'reward', { kind: 'run', n: 40 });
    if (spec.main) { run.ch.rewardDone = true; openDoors(G); }
    if (spec.back && spec.back !== G.scene) setScene(G, spec.back);
    return null;
  }
  G.offer = cards;
  G.offer.spec = spec;
  run.ch.offerSpec = clone(spec);
  emit(G, 'offer', { cards, patron: spec.patron, kind: spec.kind });
  setScene(G, 'boons');
  return cards;
}

export function choose(G, which) {
  if (!G.offer || !G.offer.length) return { ok: false, error: 'no offer' };
  let card = null;
  if (typeof which === 'number') card = G.offer[which];
  else card = G.offer.find((c) => c.id === which);
  if (!card) return { ok: false, error: 'no such card' };
  const spec = G.offer.spec || (G.run && G.run.ch && G.run.ch.offerSpec) || { kind: 'boon', back: 'run' };
  if (Boons.takeCard) {
    safe(Boons.takeCard, G, card);
    if (!card.knot && !card.upgrade) afterBoon(G, card.id, card.rarity || 'common', { counted: true });
  } else if (spec.kind === 'knot' || card.knot) {
    const b = G.run.boons.find((x) => x.id === card.id);
    if (b) { b.level = (b.level || 1) + 1; recomputeStats(G); }
    emit(G, 'boon', { id: card.id, level: b ? b.level : 1, knot: true });
  } else {
    giveBoon(G, card.id, card.rarity || 'common', { card });
  }
  G.offer = null;
  if (G.run && G.run.ch) { G.run.ch.offerSpec = null; G.run.ch.rerollN = 0; }
  if (spec.main && G.run) { G.run.ch.rewardDone = true; openDoors(G); }
  setScene(G, spec.back || 'run');
  return { ok: true, id: card.id };
}

export function reroll(G) {
  if (!G.offer || !G.run) return { ok: false, error: 'no offer' };
  if ((G.run.rerolls | 0) <= 0) return { ok: false, error: 'no rerolls' };
  G.run.rerolls--;
  const spec = G.offer.spec;
  G.run.ch.rerollN++;
  const cards = buildOffer(G, spec, G.run.ch.rerollN);
  G.offer = cards; G.offer.spec = spec;
  emit(G, 'offer', { cards, patron: spec.patron, kind: spec.kind, reroll: true });
  return { ok: true };
}

function giveBoon(G, id, rarity = 'common', opts = {}) {
  const run = G.run;
  if (!run) return;
  let done = false;
  if (Boons.takeBoon) {
    safe(Boons.takeBoon, G, id, rarity, opts.card && opts.card.level > 1 ? { level: opts.card.level } : {});
    done = true;
  }
  if (!done) {
    const def = boonDef(id);
    const slot = def ? def.slot : null;
    if (slot && slot !== 'passive') run.boons = run.boons.filter((b) => boonSlot(b.id) !== slot || b.id === id);
    const have = run.boons.find((b) => b.id === id);
    if (have) have.rarity = rarity; else run.boons.push({ id, rarity, level: 1 });
    recomputeStats(G);
  }
  afterBoon(G, id, rarity, { ...opts, counted: !!Boons.takeBoon, emitted: !!Boons.takeBoon });
}
// Stats and story for a boon just taken (the boons runtime emits 'boon' itself).
function afterBoon(G, id, rarity, opts = {}) {
  const def = boonDef(id) || {};
  const braid = !!def.braid;
  if (G.meta) {
    const ps = def.patron ? [def.patron] : def.patrons || [];
    for (const p of ps) inc(G.meta.stats.patronPicks, p);
    if (!opts.counted) inc(G.meta.codex.boons, id);
    if (braid && !G.meta.stats.braids.includes(id)) G.meta.stats.braids.push(id);
  }
  if (!opts.silent) {
    if (!opts.emitted && !Boons.takeCard) emit(G, 'boon', { id, rarity, patron: def.patron || null, braid });
    story(G, 'boon', { id, patron: def.patron || (def.patrons ? def.patrons[0] : null), patrons: def.patrons || null, braid, rarity });
  }
}

// ------------------------------------------------------------------ doors
export function door(G, i = 0) {
  const run = G.run;
  if (!run || run.over || G.scene !== 'run') return { ok: false, error: 'not in a run' };
  const d = G.chamber && (G.chamber.doors || [])[i];
  if (!d) return { ok: false, error: 'no such door' };
  if (!run.ch.cleared) return { ok: false, error: 'chamber not cleared' };
  if (!run.ch.rewardDone) {
    const main = G.pickups.find((p) => p.main);
    if (main) collect(G, main);
    if (G.offer) return { ok: false, error: 'offer open' };
    run.ch.rewardDone = true; openDoors(G);
  }
  // story pickups left behind (memory threads) are taken on the way out
  for (const p of G.pickups.slice()) if (p.kind === 'memory') collect(G, p);
  if (G.scene !== 'run') return { ok: false, error: 'busy' };
  run.path.push({ region: run.region, chamber: run.chamber, kind: run.kind, reward: run.reward ? run.reward.kind : null, door: i });
  syncRunFromHero(G);
  run.reward = clone(d.reward) || null;
  const n = REGION_LEN();
  if (run.chamber >= n - 1) {
    // region transition
    if (run.regionIndex >= REGION_IDS.length - 1) return { ok: false, error: 'end of the dream' };
    run.regionIndex++;
    run.region = REGION_IDS[run.regionIndex];
    run.chamber = 0;
    ensurePlan(G, run.region);
  } else {
    run.chamber++;
  }
  run.depth++;
  if (run.reward && run.reward.kind === 'shop') run.plan[run.region][run.chamber] = 'shop';
  run.kind = run.plan[run.region][run.chamber];
  arrive(G, {});
  const w = persist(G, run.cp, 'door');
  return { ok: true, saved: !!w.ok, chamber: run.chamber, region: run.region };
}

// ------------------------------------------------------------------ shop
function rollShop(G) {
  const run = G.run;
  const r = makeRng(hashSeed(run.seed, 'shop', run.depth));
  const scale = 1 + run.regionIndex * 0.15;
  const items = [];
  const pats = r.shuffle(PATRONS().slice());
  items.push({ kind: 'boon', patron: pats[0], cost: Math.round(120 * scale) });
  items.push({ kind: 'boon', patron: pats[1], cost: Math.round(135 * scale) });
  items.push({ kind: 'heal', cost: Math.round(55 * scale) });
  if (run.boons.length) items.push({ kind: 'knot', cost: Math.round(110 * scale) });
  const extra = r.weighted([{ k: 'defy', w: run.flags.boughtDefy ? 0 : 0.8 }, { k: 'reroll', w: 1 }, { k: 'lumen', w: 1 }, { k: 'shard', w: 0.6 }], (x) => x.w).k;
  items.push({ kind: extra, cost: Math.round({ defy: 170, reroll: 60, lumen: 45, shard: 70 }[extra] * scale) });
  return items.map((it, i) => ({ id: `${it.kind}${it.patron ? ':' + it.patron : ''}`, i, ...it, ...shopText(it), sold: false }));
}
function shopText(it) {
  switch (it.kind) {
    case 'boon': return { name: `Blessing of ${patronName(it.patron)}`, text: `Choose one of three boons from ${patronName(it.patron)}.` };
    case 'heal': return { name: 'Mended Thread', text: 'Restore 40% of your health.' };
    case 'knot': return { name: 'Golden Knot', text: 'Raise one boon you carry by a level.' };
    case 'defy': return { name: 'Spare Spool', text: 'One extra Death Defiance for this run.' };
    case 'reroll': return { name: 'Loose End', text: 'One reroll of a boon offer.' };
    case 'lumen': return { name: 'Lantern Oil', text: 'Thirty Lumen, kept even if you fall.' };
    case 'shard': return { name: 'Dream Shard', text: 'A Dream Shard, kept even if you fall.' };
    default: return { name: it.kind, text: '' };
  }
}
export function openShop(G) {
  if (!G.run || !G.run.ch || !G.run.ch.shop) return { ok: false };
  G.shop = G.run.ch.shop;
  setScene(G, 'shop');
  story(G, 'shopOpen', { region: G.run.region });
  return { ok: true };
}
export function buy(G, i) {
  const run = G.run;
  const shop = run && run.ch && run.ch.shop;
  if (!shop) return { ok: false, error: 'no shop' };
  const it = typeof i === 'number' ? shop[i] : shop.find((x) => x.id === i);
  if (!it || it.sold) return { ok: false, error: 'not for sale' };
  if (run.currency < it.cost) return { ok: false, error: 'not enough Glint' };
  run.currency -= it.cost;
  it.sold = true;
  emit(G, 'shopBuy', { item: it.id, kind: it.kind, cost: it.cost });
  story(G, 'shopBuy', { item: it.id, kind: it.kind });
  const h = G.hero;
  switch (it.kind) {
    case 'boon': openOffer(G, { kind: 'boon', patron: it.patron, back: 'shop', shopItem: it.id }); break;
    case 'knot': openOffer(G, { kind: 'knot', back: 'shop', shopItem: it.id }); break;
    case 'heal': safe(Combat.healHero, G, Math.round((h ? h.maxHp : 100) * 0.4)); break;
    case 'defy': if (h) h.deathDefiance = (h.deathDefiance || 0) + 1; run.flags.boughtDefy = true; break;
    case 'reroll': run.rerolls++; break;
    case 'lumen': bank(G, 'lumen', 30); break;
    case 'shard': bank(G, 'shards', 1); break;
    default: break;
  }
  return { ok: true, item: it.id };
}
export function leaveShop(G) {
  if (G.scene === 'boons') return { ok: false, error: 'offer open' };
  if (G.scene === 'shop') setScene(G, 'run');
  return { ok: true };
}

// ------------------------------------------------------------------ fountain and memories
function prepareFountain(G) {
  const run = G.run, f = run.ch.fountain;
  const id = run.memoryRegions.includes(run.region) ? null : safe(Story.pickMemory, G) ?? pickMemoryFallback(G);
  f.memory = id || null;
}
function pickMemoryFallback(G) {
  const list = MemoryData.MEMORIES || MemoryData.MEMORY_THREADS || MemoryData.default;
  const arr = Array.isArray(list) ? list : list && typeof list === 'object' ? Object.values(list) : [];
  const have = new Set(G.meta.memories || []);
  const left = arr.filter((m) => !have.has(m.id));
  if (!left.length) return null;
  const r = makeRng(hashSeed(G.run.seed, 'memory', G.run.region));
  return r.pick(left).id;
}
export function useFountain(G) {
  const run = G.run;
  const f = run && run.ch && run.ch.fountain;
  if (!f) return { ok: false, error: 'no fountain' };
  if (f.used) { if (G.scene === 'run') setScene(G, 'fountain'); return { ok: true, used: true }; }
  f.used = true;
  const h = G.hero;
  const before = h ? h.hp : 0;
  safe(Combat.healHero, G, Math.round((h ? h.maxHp : 100) * 0.4));
  f.healed = h ? h.hp - before : 0;
  const barks = story(G, 'fountain', { region: run.region });
  const conv = barks.find((b) => b && b.lines && b.lines.length) || null;
  f.npc = conv ? conv.speaker || (conv.lines[0] && conv.lines[0].speaker) : null;
  f.lines = conv ? conv : null;
  G.fountain = f;
  emit(G, 'fountain', { healed: f.healed, npc: f.npc, memory: f.memory });
  setScene(G, 'fountain');
  return { ok: true, healed: f.healed, npc: f.npc };
}
// Leave the fountain panel: the wanderer's conversation, then a Memory Thread, then back.
function leaveFountain(G) {
  const f = G.run && G.run.ch && G.run.ch.fountain;
  setScene(G, 'run');
  if (!f) return;
  if (f.lines && !f.talked) { f.talked = true; openDialogue(G, f.lines, 'run'); return; }
  if (f.memory && !f.memoryDone) { f.memoryDone = true; playMemoryThread(G, f.memory); }
}
function playMemoryThread(G, id) {
  if (!id) return;
  if (G.run && !G.run.memoryRegions.includes(G.run.region)) G.run.memoryRegions.push(G.run.region);
  if (!G.meta.memories.includes(id)) G.meta.memories.push(id);
  emit(G, 'memory', { id });
  story(G, 'memory', { id });
  const m = memoryDef(id);
  const panels = m && (m.panels || m.lines || m.text);
  const lines = Array.isArray(panels) ? panels.map((p) => (typeof p === 'string' ? { speaker: 'narrator', text: p } : { speaker: p.speaker || 'narrator', text: p.text || p.caption || '', mood: p.mood, art: p.art })) : [];
  if (lines.length) openDialogue(G, { id: `memory.${id}`, speaker: 'narrator', lines, kind: 'memory', memory: id }, G.scene === 'hub' ? 'hub' : 'run');
}
function memoryDef(id) {
  const list = MemoryData.MEMORIES || MemoryData.MEMORY_THREADS || MemoryData.default;
  if (Array.isArray(list)) return list.find((m) => m.id === id) || null;
  return (list && list[id]) || null;
}
export function rememberHere(G) {
  const m = G.run && G.run.ch && G.run.ch.memory;
  if (!m || m.done) return { ok: false };
  m.done = true;
  if (m.id) playMemoryThread(G, m.id);
  else openDialogue(G, { id: 'memory.empty', speaker: 'narrator', lines: [{ speaker: 'narrator', text: 'The loom is still. Every thread here has already been remembered.' }] }, 'run');
  return { ok: true, id: m.id };
}

// ------------------------------------------------------------------ dialogue
// entry: { id, speaker, lines: [{ speaker, text, mood }], choices? }
export function openDialogue(G, entry, back) {
  if (!entry || !entry.lines || !entry.lines.length) return null;
  const queue = entry.lines.map((l) => (typeof l === 'string' ? { speaker: entry.speaker, text: l } : { speaker: l.speaker || entry.speaker, text: l.text, mood: l.mood, art: l.art }));
  const first = queue.shift();
  G.dialogue = { speaker: first.speaker, lineId: entry.id, text: first.text, mood: first.mood || 'neutral', art: first.art, queue, entry: entry.id, kind: entry.kind || 'talk',
    choices: queue.length ? null : entry.choices || null, back: back || (G.scene === 'dialogue' ? (G.dialogue && G.dialogue.back) || 'hub' : G.scene), memory: entry.memory || null, index: 0, total: entry.lines.length };
  emit(G, 'line', { speaker: first.speaker, lineId: entry.id, text: first.text, mood: first.mood });
  setScene(G, 'dialogue');
  return G.dialogue;
}
export function advance(G) {
  if (G.scene === 'fountain') { leaveFountain(G); return { ok: true }; }
  if (G.scene === 'ending') return returnToHub(G);
  const d = G.dialogue;
  if (!d) return { ok: false };
  if (d.queue.length) {
    const l = d.queue.shift();
    Object.assign(d, { speaker: l.speaker, text: l.text, mood: l.mood || 'neutral', art: l.art, index: d.index + 1 });
    emit(G, 'line', { speaker: l.speaker, lineId: d.lineId, text: l.text, mood: l.mood });
    return { ok: true };
  }
  if (d.choices && d.choices.length) return { ok: false, needsAnswer: true };
  return skip(G);
}
export function skip(G) {
  if (G.scene === 'fountain') { leaveFountain(G); return { ok: true }; }
  if (G.scene === 'ending') return returnToHub(G);
  const d = G.dialogue;
  if (!d) return { ok: false };
  G.dialogue = null;
  setScene(G, PLAY_SCENES.has(d.back) || ['shop', 'fountain', 'victory'].includes(d.back) ? d.back : (G.run ? 'run' : 'hub'));
  emit(G, 'dialogueEnd', { id: d.lineId });
  if (G.scene === 'hub' && G.talkQueue && G.talkQueue.length) { openDialogue(G, G.talkQueue.shift(), 'hub'); return { ok: true }; }
  // chained: fountain conversation then its memory
  if (G.run && G.run.ch && G.run.ch.fountain && G.run.ch.fountain.talked && G.run.ch.fountain.memory && !G.run.ch.fountain.memoryDone && G.scene === 'run') {
    G.run.ch.fountain.memoryDone = true; playMemoryThread(G, G.run.ch.fountain.memory);
  }
  return { ok: true };
}
export function answer(G, i) {
  const d = G.dialogue;
  if (!d || !d.choices) return { ok: false };
  const c = d.choices[i];
  if (!c) return { ok: false };
  if (Story.answer) safe(Story.answer, G, d.entry, i, c);
  if (c.choice && Story.chooseEnding) safe(Story.chooseEnding, G, c.choice);
  if (c.choice && Bosses.resolveBossChoice) safe(Bosses.resolveBossChoice, G, c.choice);
  G.dialogue = null;
  setScene(G, d.back || 'run');
  if (c.next) openDialogue(G, c.next, d.back);
  return { ok: true };
}

export function talk(G, npcId) {
  let entry = null;
  if (Story.hubTalk) entry = safe(Story.hubTalk, G, npcId);
  if (!entry) { const b = story(G, 'talk', { npc: npcId }); entry = b.find((x) => x && x.lines && x.lines.length) || null; }
  if (!entry) entry = { id: `${npcId}.idle`, speaker: npcId, lines: [{ speaker: npcId, text: '...' }] };
  if (G.meta) inc(G.meta.affinity, npcId, 0);
  return openDialogue(G, entry, G.run ? 'run' : 'hub') ? { ok: true, id: entry.id } : { ok: false };
}

// ------------------------------------------------------------------ pause / quit
export function pause(G) {
  if (!PLAY_SCENES.has(G.scene)) return { ok: false };
  G.pausedFrom = G.scene;
  setScene(G, 'paused');
  return { ok: true };
}
export function resume(G) {
  if (G.scene !== 'paused' && G.scene !== 'settings' && G.scene !== 'codex') return { ok: false };
  setScene(G, G.pausedFrom || (G.run ? 'run' : 'hub'));
  return { ok: true };
}
export function openSettings(G) { if (G.scene !== 'settings') { G.settingsFrom = G.scene; setScene(G, 'settings'); } return { ok: true }; }
export function closeSettings(G) { if (G.scene === 'settings') setScene(G, G.settingsFrom || 'title'); return { ok: true }; }
export function openCodex(G) { if (G.scene !== 'codex') { G.codexFrom = G.scene; setScene(G, 'codex'); } return { ok: true }; }
export function closeCodex(G) { if (G.scene === 'codex') setScene(G, G.codexFrom || 'title'); return { ok: true }; }

// Abandon the run (pause menu): back to the hub, keeping banked currencies.
export function quit(G) {
  if (!G.run || G.run.over) { if (G.scene === 'paused' || G.scene === 'hub') return toTitle(G); return { ok: false }; }
  G.meta.stats.quits = (G.meta.stats.quits || 0) + 1;
  G.lastRun = summary(G, 'quit');
  G.meta.stats.lastRun = { result: 'quit', region: G.run.region, chamber: G.run.chamber, depth: G.run.depth, killer: null, boss: null, weapon: G.run.weapon, time: Math.round(G.run.stats.time) };
  G.run.over = true;
  emit(G, 'runEnd', { result: 'quit' });
  toHub(G, 'quit');
  return { ok: true };
}

// ------------------------------------------------------------------ death and victory
function heroDied(G) {
  const run = G.run;
  if (!run || run.over) return;
  run.over = true;
  const m = G.meta, st = m.stats;
  const bossId = run.kind === 'boss' ? run.ch.bossId || BOSS_OF[run.region] : G.boss && !G.boss.dead ? G.boss.bossId || G.boss.kind : null;
  const killer = bossId || (G._lastHurt && G._lastHurt.src) || 'unknown';
  st.runs++; st.deaths++; st.streak = 0;
  inc(st.deathsBy, killer);
  if (bossId) inc(st.bossLosses, bossId);
  st.lastRun = { result: 'death', region: run.region, chamber: run.chamber, depth: run.depth, killer, boss: bossId, weapon: run.weapon, time: Math.round(run.stats.time) };
  if (m.assist.gentle) m.assist.level = Math.min(30, (m.assist.level | 0) + 1);
  updateAssist(G);
  // a small consolation of Lumen by depth
  const consolation = Math.round(run.depth * 1.5);
  if (consolation) bank(G, 'lumen', consolation);
  G.lastRun = summary(G, 'death', { killer, boss: bossId });
  emit(G, 'runEnd', { result: 'death', killer });
  story(G, 'death', { killer, region: run.region, boss: bossId, chamber: run.chamber, depth: run.depth });
  G.offer = null; G.dialogue = null;
  setScene(G, 'dead');
  persist(G, null, 'death');
}

function summary(G, result, extra = {}) {
  const run = G.run;
  return {
    result, cause: extra.killer || null, killer: extra.killer || null, boss: extra.boss || null,
    region: run.region, regionName: regionName(run.region), chamber: run.chamber, depth: run.depth,
    time: Math.round(run.stats.time), kills: run.stats.kills, boons: run.boons.map((b) => ({ ...b })), weapon: run.weapon,
    lumenEarned: run.stats.lumen || 0, keysEarned: run.stats.keys || 0, shardsEarned: run.stats.shards || 0,
    damageTaken: Math.round(run.stats.damageTaken), ending: extra.ending || null,
  };
}

function bossBeaten(G, info) {
  const run = G.run;
  if (!run || run.over) return;
  const id = info.id || run.ch.bossId;
  const st = G.meta.stats;
  const first = !(st.bossWins[id] > 0);
  inc(st.bossWins, id);
  if (!run.stats.bosses.includes(id)) run.stats.bosses.push(id);
  story(G, 'bossDefeat', { id, first, ending: info.ending, choice: info.choice });
  if (id === 'sable' || run.regionIndex >= REGION_IDS.length - 1) { victory(G, info); return; }
  // the boss's reward, then the way down
  const c = rewardSpot(G);
  G.pickups.push({ id: G.nextId++, kind: 'boss', x: c.x, y: c.y, z: 0, r: 34, t: 0, reward: { kind: 'boss', boss: id }, main: true });
  run.ch.rewardDropped = true;
  markCleared(G);
}

function victory(G, info = {}) {
  const run = G.run;
  run.over = true;
  const m = G.meta, st = m.stats;
  let ending = info.ending || safe(Story.endingState, G) || 'first';
  if (ending !== 'true') ending = 'first';
  st.runs++; st.wins++; st.clears++; st.streak = (st.streak || 0) + 1;
  const time = Math.round(run.stats.time);
  st.fastest = st.fastest ? Math.min(st.fastest, time) : time;
  st.lastRun = { result: 'victory', region: run.region, chamber: run.chamber, depth: run.depth, killer: null, boss: 'sable', weapon: run.weapon, time };
  if (ending === 'true' || m.ending !== 'true') m.ending = ending === 'true' ? 'true' : m.ending || 'first';
  m.unlocks.pacts = true;
  bank(G, 'lumen', 100); bank(G, 'keys', 2);
  G.lastRun = summary(G, 'victory', { ending });
  G.ending = { kind: ending, choice: info.choice || null };
  emit(G, 'runEnd', { result: 'victory', ending });
  story(G, 'victory', { ending, choice: info.choice || null });
  G.offer = null;
  setScene(G, 'victory');
  persist(G, null, 'victory');
}

export function returnToHub(G) {
  if (G.scene === 'victory') {
    G.ending = G.ending || { kind: G.meta.ending || 'first' };
    const seq = safe(Story.endingSequence, G);
    G.ending.sequence = Array.isArray(seq) ? seq : [G.ending.kind];
    const lines = safe(Story.endingLines, G, G.ending.kind);
    G.ending.lines = Array.isArray(lines) ? lines : null;
    emit(G, 'ending', { kind: G.ending.kind });
    setScene(G, 'ending');
    return { ok: true, scene: 'ending' };
  }
  const from = G.scene === 'ending' ? 'victory' : G.scene === 'dead' ? 'death' : 'quit';
  if (G.run && !G.run.over && from === 'quit') return quit(G);
  toHub(G, from);
  return { ok: true, scene: 'hub' };
}

// ------------------------------------------------------------------ checkpoints
// The persistent part of G.run, with hero hp and the RNG states.
export function snapshotRun(G) {
  const run = G.run;
  if (!run) return null;
  syncRunFromHero(G);
  const s = { v: Save.VERSION };
  for (const k of PERSIST) if (run[k] !== undefined) s[k] = clone(run[k]);
  s.rng = rngStates(G);
  return s;
}
function syncRunFromHero(G) {
  const run = G.run, h = G.hero;
  if (!run || !h) return;
  run.hp = Math.max(1, Math.round(h.hp));
  run.maxHp = h.maxHp;
  run.deathDefiance = h.deathDefiance || 0;
}
export function snapshot(G) { return { meta: G.meta, run: currentCheckpoint(G) ? liveRun(G) : null }; }

// A snapshot of right now for pagehide / save.now(): see the header.
function liveRun(G) {
  const run = G.run;
  if (!run || run.over || !run.cp) return G.run ? null : G.checkpoint || null;
  const ch = run.ch || {};
  const busy = !ch.cleared;
  if (busy) {
    const cp = clone(run.cp);
    const hp = G.hero ? Math.round(G.hero.hp) : cp.hp;
    cp.hp = Math.max(1, Math.min(cp.hp, hp));
    cp.stats = clone(run.stats);
    return cp;
  }
  const live = snapshotRun(G);
  live.entry = clone(run.cp);
  live.resume = {
    cleared: true, rewardDone: !!ch.rewardDone, rewardDropped: !!ch.rewardDropped, rerollN: ch.rerollN | 0,
    offer: G.offer ? { cards: clone(G.offer), spec: clone(G.offer.spec) } : null,
    pickups: G.pickups.filter((p) => p.main || p.reward).map((p) => ({ kind: p.kind, x: p.x, y: p.y, r: p.r, reward: clone(p.reward), main: !!p.main })),
    shop: clone(ch.shop), fountain: clone(ch.fountain), memory: clone(ch.memory), bossId: ch.bossId || null,
    scene: G.scene === 'boons' || G.scene === 'shop' ? G.scene : 'run', hero: G.hero ? { x: Math.round(G.hero.x), y: Math.round(G.hero.y) } : null,
  };
  return live;
}

export function checkpoint(G, reason = 'manual') {
  if (!G.saves) return { ok: false };
  if (G.run && !G.run.over) {
    const live = liveRun(G);
    return persist(G, live, reason);
  }
  return persist(G, undefined, reason);
}
function leaveCheckpoint(G, why) {
  if (!G.meta || !G.saves) return;
  if (G.run && !G.run.over) checkpoint(G, why);
  else if (G.scene !== 'title' && G.scene !== 'loading') persist(G, undefined, why);
}

// Rebuild a run from a checkpoint (Continue). A live snapshot (cp.resume) is
// rebuilt from its entry checkpoint first, then the live state is laid over it.
function restoreRun(G, cp) {
  const live = cp.resume && cp.entry ? clone(cp) : null;
  const s = clone(live ? cp.entry : cp);
  seedStreams(G, s.seed >>> 0);
  G.run = { ch: null, cp: null, over: false };
  loadRunFields(G, s);
  const run = G.run;
  for (let i = 0; i <= run.regionIndex; i++) ensurePlan(G, REGION_IDS[i]);
  clearArena(G);
  heroForRun(G, s);
  setRngStates(G, s.rng);
  run.cp = clone(s);
  setScene(G, 'run');
  arrive(G, { resume: true });
  if (G.hero) G.hero.hp = Math.max(1, Math.min(G.hero.maxHp, s.hp ?? G.hero.maxHp));
  if (live) applyResume(G, live);
  G.checkpoint = null;
  emit(G, 'runResume', { region: run.region, chamber: run.chamber });
  story(G, 'runResume', { region: run.region, chamber: run.chamber });
}
function loadRunFields(G, s) {
  const run = G.run;
  for (const k of PERSIST) if (s[k] !== undefined) run[k] = clone(s[k]);
  run.plan = run.plan || {};
  run.shopDoors = run.shopDoors || {};
  run.path = run.path || []; run.flags = run.flags || {}; run.memoryRegions = run.memoryRegions || []; run.pacts = run.pacts || {};
  run.stats = { kills: 0, damageTaken: 0, time: 0, chambers: 0, lumen: 0, keys: 0, shards: 0, bosses: [], ...(run.stats || {}) };
  run.boons = (run.boons || []).map((b) => ({ id: b.id, rarity: b.rarity || 'common', level: b.level || 1 }));
  run.region = REGION_IDS.includes(run.region) ? run.region : 'glasswood';
  run.regionIndex = REGION_IDS.indexOf(run.region);
  run.chamber = Math.max(0, Math.min(REGION_LEN() - 1, run.chamber | 0));
  run.depth = run.depth ?? run.regionIndex * REGION_LEN() + run.chamber;
  run.rerolls = run.rerolls | 0; run.currency = run.currency | 0;
  run.mods = pactMods(run.pacts);
}
// Rebuild the hero for the restored run: weapon, meta effects, then boons, hp.
function heroForRun(G, s) {
  const run = G.run;
  if (G.hero) G.hero.weapon = run.weapon || 'blade';
  const boons = run.boons, rerolls = run.rerolls, currency = run.currency;
  run.boons = [];
  recomputeStats(G);
  applyMetaToRun(G);
  heroReset(G, true, 0, 0);
  run.boons = boons; run.rerolls = rerolls; run.currency = currency;
  if (Boons.restoreBoons) safe(Boons.restoreBoons, G, boons);
  recomputeStats(G);
  if (G.hero) {
    G.hero.hp = Math.max(1, Math.min(G.hero.maxHp, s.hp ?? G.hero.maxHp));
    if (s.deathDefiance !== undefined) G.hero.deathDefiance = s.deathDefiance;
  }
}
function applyResume(G, s) {
  const run = G.run, ch = run.ch, R = s.resume;
  // the live run fields (boons taken, Glint, hp ...) over the entry state
  const entryCp = run.cp;
  loadRunFields(G, s);
  run.cp = entryCp;
  recomputeStats(G);
  if (Boons.restoreBoons) safe(Boons.restoreBoons, G, run.boons);
  if (G.hero) {
    G.hero.hp = Math.max(1, Math.min(G.hero.maxHp, s.hp ?? G.hero.hp));
    if (s.deathDefiance !== undefined) G.hero.deathDefiance = s.deathDefiance;
  }
  setRngStates(G, s.rng);
  ch.cleared = true; ch.wave = 99;
  ch.rewardDone = R.rewardDone; ch.rewardDropped = R.rewardDropped; ch.rerollN = R.rerollN | 0;
  if (R.shop) { ch.shop = R.shop; G.shop = ch.shop; ch.shopShown = true; }
  if (R.fountain) ch.fountain = R.fountain;
  if (R.memory) ch.memory = R.memory;
  if (R.bossId) ch.bossId = R.bossId;
  G.foes = []; G.boss = null; G.telegraphs = []; G.projectiles = []; G.zones = [];
  G.pickups = (R.pickups || []).map((p) => ({ id: G.nextId++, z: 0, t: 0, ...p }));
  if (R.hero && G.hero) { G.hero.x = R.hero.x; G.hero.y = R.hero.y; if (HeroSim.placeHero) safe(HeroSim.placeHero, G, R.hero.x, R.hero.y); }
  if (ch.rewardDone) openDoors(G);
  if (R.offer && R.offer.cards && R.offer.cards.length) {
    G.offer = R.offer.cards; G.offer.spec = R.offer.spec || { kind: 'boon', back: 'run' };
    ch.offerSpec = clone(G.offer.spec);
    setScene(G, 'boons');
  } else if (R.scene === 'shop' && ch.shop) setScene(G, 'shop');
}

// ------------------------------------------------------------------ per-step tick
export function tick(G, dt) {
  if (G.meta && G.scene !== 'title' && G.scene !== 'loading' && G.scene !== 'profiles') G.meta.playTime = (G.meta.playTime || 0) + dt;
  if (G.input && G.input.pauseP && PLAY_SCENES.has(G.scene) && !(G.hero && G.hero.dead)) { pause(G); return; }
  if (G.scene === 'hub') return hubTick(G, dt);
  const run = G.run;
  if (!run || !run.ch) return;
  const ch = run.ch;
  if (run.over) return;
  if (ch.deathT > 0) {
    ch.deathT -= dt;
    if (ch.deathT <= 0) heroDied(G);
    return;
  }
  if (G.scene !== 'run') return;
  if (G.hero && G.hero.dead && !ch.deathT) { ch.deathT = 1.7; return; }
  const live = G.hitstop > 0 ? 0 : dt;
  run.stats.time += dt;
  run.regionT = (run.chamber === 0 && ch.enterT === 0 ? 0 : run.regionT || 0) + live;
  if (run.mods && run.mods.timeLimit && run.regionT > run.mods.timeLimit && !ch.cleared) {
    ch.darkT = (ch.darkT || 0) + live;
    if (ch.darkT > 3) { ch.darkT = 0; safe(Combat.hurtHero, G, 5, { kind: 'dark', ignoreInv: true }); }
  }
  ch.enterT += live;
  // boss defeat (deferred from the bus)
  if (ch.bossDefeat) { const info = ch.bossDefeat; ch.bossDefeat = null; bossBeaten(G, info); if (run.over) return; }
  // waves
  if (!ch.cleared) {
    if (run.kind === 'boss') {
      if (ch.wave < 0) { ch.waveT -= live; if (ch.waveT <= 0) startBossFight(G); }
    } else {
      const waves = (G.chamber.waves || []).length;
      const n = liveFoes(G);
      if (ch.wave < waves - 1) {
        // next wave when the current one is nearly gone (or the first after a breath)
        const threshold = ch.wave < 0 ? 0 : run.kind === 'miniboss' ? 0 : 1;
        if (n <= threshold) { ch.waveT -= live; if (ch.waveT <= 0) { startWave(G, ch.wave + 1); ch.waveT = 0.7; } }
        else ch.waveT = Math.max(ch.waveT, 0.5);
      } else if (n === 0) {
        ch.clearT = (ch.clearT || 0) + live;
        if (ch.clearT > 0.35) markCleared(G);
      }
    }
  }
  // pickups: magnet, then collect on touch
  const h = G.hero;
  if (h && !h.dead) {
    for (const p of G.pickups.slice()) {
      p.t = (p.t || 0) + live;
      const d = dist(p, h);
      if (p.t > 1.1 && d < 420) {
        const sp = Math.min(d, (260 + p.t * 260) * live);
        if (d > 1) { p.x += ((h.x - p.x) / d) * sp; p.y += ((h.y - p.y) / d) * sp; }
      }
      if (d < (p.r || 28) + (h.r || 20) && p.t > 0.35 && G.scene === 'run') collect(G, p);
      if (G.scene !== 'run') return;
    }
  }
  // stations and doors
  G.prompt = null;
  if (h && !h.dead && ch.cleared) {
    for (const s of G.chamber.stations || []) {
      if (dist(s, h) < (s.r || 110)) {
        G.prompt = { kind: 'station', id: s.id, text: s.prompt || s.id, x: s.x, y: s.y };
        if (G.input && G.input.interactP) {
          if (s.id === 'shop') openShop(G);
          else if (s.id === 'fountain') useFountain(G);
          else if (s.id === 'memory') rememberHere(G);
        }
        break;
      }
    }
    if (ch.rewardDone && G.scene === 'run') {
      for (const d of G.chamber.doors || []) {
        if (!d.open) continue;
        if (Math.hypot(d.x - h.x, d.y - h.y) < 54 + (h.r || 20)) { door(G, d.i); return; }
      }
    }
  }
  // a shop opens itself on arrival once
  if (run.kind === 'shop' && ch.shop && !ch.shopShown && ch.enterT > 0.8) { ch.shopShown = true; openShop(G); }
}

function hubTick(G, dt) {
  const h = G.hero, hub = G.chamber;
  G.prompt = null;
  if (h && h.dead) {
    G._hubDeadT = (G._hubDeadT || 0) + dt;
    if (G._hubDeadT > 1.6) { G._hubDeadT = 0; const e = hub.entry || { x: 0, y: 200 }; heroReset(G, true, e.x, e.y); if (HeroSim.respawnHero) safe(HeroSim.respawnHero, G, e.x, e.y); }
    return;
  }
  if (!h || !hub) return;
  const dd = dreamdoorOf(hub);
  const near = [];
  if (dd) near.push({ kind: 'dreamdoor', id: 'dreamdoor', x: dd.x, y: dd.y, r: dd.r || 100, text: 'Enter the Dreamdoor' });
  for (const n of hub.npcs || G.npcs || []) near.push({ kind: 'npc', id: n.id, x: n.x, y: n.y, r: n.talkR || n.r || 90, text: `Talk to ${n.name || n.id}` });
  for (const s of hub.stations || []) if (s.id !== 'dreamdoor') near.push({ kind: 'station', id: s.id, x: s.x, y: s.y, r: s.r || 90, text: s.prompt || s.name || s.id, station: s });
  let best = null, bd = 1e9;
  for (const o of near) { const d = Math.hypot(o.x - h.x, o.y - h.y); if (d < o.r + (h.r || 20) + 30 && d < bd) { bd = d; best = o; } }
  if (!best) return;
  G.prompt = { kind: best.kind, id: best.id, text: best.text, x: best.x, y: best.y };
  if (!G.input || !G.input.interactP) return;
  if (best.kind === 'dreamdoor') startRun(G, {});
  else if (best.kind === 'npc') talk(G, best.id);
  else { G.ui = G.ui || {}; G.ui.station = best.id; emit(G, 'ui', { station: best.id }); }
}

// ------------------------------------------------------------------ debug verbs
export function clear(G) {
  if (!G.run || !G.run.ch) return { ok: false };
  const ch = G.run.ch;
  if (G.run.kind === 'boss') { return bossKill(G); }
  // spawn every remaining wave so all deaths go through the normal path
  const waves = (G.chamber.waves || []).length;
  while (ch.wave < waves - 1) startWave(G, ch.wave + 1);
  for (const e of G.foes.slice()) if (alive(e)) { e.spawning = false; if (Combat.killFoe) safe(Combat.killFoe, G, e, { kind: 'debug' }); else { e.dead = true; e.hp = 0; } }
  markCleared(G);
  return { ok: true };
}
export function kill(G) {
  if (Combat.killHero) Combat.killHero(G); else if (G.hero) { G.hero.dead = true; G.hero.hp = 0; emit(G, 'heroDeath', {}); }
  if (G.run && G.run.ch) G.run.ch.deathT = Math.min(G.run.ch.deathT || 1.7, 1.7);
  return { ok: true };
}
// Finish the current boss (phase) through the normal defeat path.
export function bossKill(G) {
  if (!G.run || !G.run.ch) return { ok: false };
  if (G.run.kind === 'boss' && G.run.ch.wave < 0) startBossFight(G);
  const b = G.boss;
  if (!b) return { ok: false, error: 'no boss' };
  if (Bosses.killBoss) safe(Bosses.killBoss, G);
  else if (Combat.damageFoe) { b.armor = 0; safe(Combat.damageFoe, G, b, b.hp + 9999, { kind: 'debug', pierce: true }); }
  return { ok: true };
}
// Jump to a boss fight with a sensible build for that depth.
export function boss(G, id = 'veyl', opts = {}) {
  const region = Object.keys(BOSS_OF).find((k) => BOSS_OF[k] === id) || 'glasswood';
  return region_(G, region, { ...opts, chamber: REGION_LEN() - 1 });
}
export function region(G, id = 'glasswood', opts = {}) { return region_(G, id, { ...opts, chamber: opts.chamber ?? 0 }); }
function region_(G, id, opts) {
  const ri = Math.max(0, REGION_IDS.indexOf(id));
  const seed = opts.seed ?? 1234 + ri;
  const boons = opts.boons || sensibleBuild(G, seed, ri);
  const r = startRun(G, { ...opts, seed, region: id, chamber: opts.chamber, boons });
  // a few fights' worth of Glint and health growth deeper in
  if (G.run && ri > 0) { G.run.currency += 80 * ri; }
  return r;
}
function sensibleBuild(G, seed, ri) {
  if (ri <= 0) return [];
  const r = makeRng(hashSeed(seed, 'build'));
  const list = boonList().filter((b) => !b.needs);
  const bySlot = {};
  for (const b of list) (bySlot[b.slot] || (bySlot[b.slot] = [])).push(b);
  const out = [];
  const slots = ['attack', 'dash', 'special', 'call', 'snare'];
  for (let i = 0; i < Math.min(slots.length, 1 + ri * 2); i++) { const l = bySlot[slots[i]]; if (l && l.length) out.push({ id: r.pick(l).id, rarity: ri >= 2 ? 'rare' : 'common' }); }
  const pas = bySlot.passive || [];
  for (let i = 0; i < ri && pas.length; i++) out.push({ id: r.pick(pas).id, rarity: 'common' });
  return out;
}
export function fountain(G) {
  if (G.run && G.run.ch && G.run.ch.fountain) return useFountain(G);
  return { ok: false, error: 'no fountain here' };
}
export function heal(G) { if (G.hero) { G.hero.hp = G.hero.maxHp; } return { ok: true }; }
export function damage(G, n = 10) { return { ok: true, dealt: safe(Combat.hurtHero, G, n, { force: true, ignoreInv: true }) }; }

// ------------------------------------------------------------------ hub stations (meta)
export function buyTapestry(G, id) {
  const m = G.meta;
  const n = tapestryNodes().find((x) => x.id === id);
  if (!n) return { ok: false, error: 'unknown' };
  const cost = TapestryData.tapestryCost ? TapestryData.tapestryCost(m, id) : null;
  if (!cost) return { ok: false, error: 'maxed' };
  if ((m.currency.lumen | 0) < (cost.lumen | 0)) return { ok: false, error: 'not enough Lumen' };
  if ((m.currency.keys | 0) < (cost.keys | 0)) return { ok: false, error: 'not enough Silk Keys' };
  m.currency.lumen -= cost.lumen | 0;
  m.currency.keys -= cost.keys | 0;
  if (cost.keys) { m.tapestryOpen = m.tapestryOpen || []; if (!m.tapestryOpen.includes(id)) m.tapestryOpen.push(id); }
  m.tapestry[id] = (m.tapestry[id] | 0) + 1;
  story(G, 'tapestry', { id, rank: m.tapestry[id] });
  if (G.hero && G.scene === 'hub') { recomputeStats(G); heroReset(G, true, G.hero.x, G.hero.y); }
  saveMeta(G);
  return { ok: true, rank: m.tapestry[id] };
}
export function unlockWeapon(G, id) {
  if (G.meta.unlocks.weapons.includes(id)) return { ok: true, already: true };
  const w = weaponDef(id);
  const cost = (w && (w.unlock?.keys ?? w.keys ?? w.cost)) ?? 1;
  if ((G.meta.currency.keys | 0) < cost) return { ok: false, error: 'not enough Silk Keys' };
  G.meta.currency.keys -= cost;
  G.meta.unlocks.weapons.push(id);
  story(G, 'unlock', { weapon: id });
  saveMeta(G);
  return { ok: true };
}
export function unlockAspect(G, id) {
  const m = G.meta;
  let asp = null;
  for (const w of Object.values(WeaponData.WEAPONS || {})) for (const a of w.aspects || []) if (a.id === id) asp = a;
  if (!asp) return { ok: false, error: 'unknown' };
  const cost = (asp.cost && asp.cost.keys) | 0;
  if (!cost || m.unlocks.aspects.includes(id)) return { ok: true, already: true };
  if (asp.secret && !(m.flags[asp.secret] || m.reveals.includes(asp.secret))) return { ok: false, error: 'locked' };
  if ((m.currency.keys | 0) < cost) return { ok: false, error: 'not enough Silk Keys' };
  m.currency.keys -= cost;
  m.unlocks.aspects.push(id);
  saveMeta(G);
  return { ok: true };
}
export function equipWeapon(G, id, aspect) {
  if (!G.meta.unlocks.weapons.includes(id)) return { ok: false, error: 'locked' };
  G.meta.loadout.weapon = id;
  if (aspect !== undefined) { G.meta.loadout.aspect = aspect; G.meta.loadout.aspects = G.meta.loadout.aspects || {}; G.meta.loadout.aspects[id] = aspect; }
  if (G.hero && G.scene === 'hub') { G.hero.weapon = id; recomputeStats(G); heroReset(G, true, G.hero.x, G.hero.y); }
  story(G, 'equip', { weapon: id });
  saveMeta(G);
  return { ok: true };
}
export function equipKeepsake(G, id) {
  if (id && !G.meta.unlocks.keepsakes.includes(id)) return { ok: false, error: 'locked' };
  G.meta.loadout.keepsake = id || null;
  saveMeta(G);
  return { ok: true };
}
export function setPact(G, id, rank) {
  if (!G.meta.unlocks.pacts) return { ok: false, error: 'locked' };
  const p = pactList().find((x) => x.id === id);
  const max = p ? p.max ?? p.ranks ?? 3 : 3;
  const r = Math.max(0, Math.min(max, rank | 0));
  if (r) G.meta.pacts[id] = r; else delete G.meta.pacts[id];
  saveMeta(G);
  return { ok: true, rank: r };
}
// Pell's stall in the Loomhall: keepsakes and decor for Dream Shards.
export function buyHubShop(G, id) {
  const ks = keepsakeList().find((k) => k.id === id);
  const cost = ks ? ks.cost ?? ks.shards ?? 3 : 3;
  if (!ks) return { ok: false, error: 'unknown' };
  if (G.meta.unlocks.keepsakes.includes(id)) return { ok: false, error: 'owned' };
  if ((G.meta.currency.shards | 0) < cost) return { ok: false, error: 'not enough Dream Shards' };
  G.meta.currency.shards -= cost;
  G.meta.unlocks.keepsakes.push(id);
  saveMeta(G);
  return { ok: true };
}
function keepsakeList() {
  const K = KeepsakeData.KEEPSAKES || {};
  return Object.entries(K).map(([key, k]) => ({ key, ...k, id: k.id || key }));
}
export function gift(G, npcId) {
  if ((G.meta.currency.shards | 0) < 1) return { ok: false, error: 'no Dream Shards' };
  G.meta.currency.shards -= 1;
  const n = inc(G.meta.gifts, npcId);
  inc(G.meta.affinity, npcId, 1);
  // a keepsake from that character at their first gift
  const ks = keepsakeList().find((k) => k.unlock && k.unlock.gift === npcId && !G.meta.unlocks.keepsakes.includes(k.id));
  if (ks && n >= (ks.unlock.gifts || 1)) { G.meta.unlocks.keepsakes.push(ks.id); emit(G, 'ui', { toast: `${ks.name} added to your keepsakes.` }); }
  const b = story(G, 'gift', { npc: npcId, count: n });
  const entry = b.find((x) => x && x.lines && x.lines.length);
  if (entry) openDialogue(G, entry, 'hub');
  saveMeta(G);
  return { ok: true, count: n, keepsake: ks ? ks.id : null };
}
export function playMemory(G, id) {
  if (!G.meta.memories.includes(id)) return { ok: false, error: 'not found yet' };
  const m = memoryDef(id);
  const panels = m && (m.panels || m.lines || m.text);
  const lines = Array.isArray(panels) ? panels.map((p) => (typeof p === 'string' ? { speaker: 'narrator', text: p } : { speaker: p.speaker || 'narrator', text: p.text || p.caption || '', art: p.art })) : [];
  if (!lines.length) return { ok: false };
  openDialogue(G, { id: `memory.${id}`, speaker: 'narrator', lines, kind: 'memory', memory: id }, G.scene === 'codex' ? 'codex' : 'hub');
  return { ok: true };
}
// The true ending's choice at the end of the Sable fight ('braid' | 'cut').
export function resolveChoice(G, choice = 'braid') {
  if (G.ui) G.ui.bossChoice = null;
  safe(Story.chooseEnding, G, choice);
  if (Bosses.resolveBossChoice) safe(Bosses.resolveBossChoice, G, choice);
  return { ok: true, choice };
}
export function setGentle(G, on) { G.meta.assist.gentle = !!on; updateAssist(G); saveMeta(G); return { ok: true, taken: G.assist.taken }; }

// ------------------------------------------------------------------ settings
export function getSettings(G) { return G.settings; }
export function setSetting(G, key, value) {
  const parts = String(key).split('.');
  let o = G.settings;
  for (let i = 0; i < parts.length - 1; i++) { if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = value;
  if (G.saves) G.saves.saveSettings(G.settings);
  emit(G, 'settings', { key, value });
  return { ok: true };
}

// ------------------------------------------------------------------ URL switches
// params: URLSearchParams or a plain object. Returns a Promise of the scene.
export function applyUrl(G, params) {
  const q = params instanceof URLSearchParams ? params : new URLSearchParams(params || '');
  const has = (k) => q.has(k);
  try {
    if (has('profile')) loadProfile(G, parseInt(q.get('profile'), 10) || 0);
    const seed = has('seed') ? parseInt(q.get('seed'), 10) >>> 0 : undefined;
    const weapon = q.get('weapon') || undefined;
    if (has('boss')) { boss(G, q.get('boss'), { seed, weapon }); }
    else if (has('play') || has('region') || has('chamber')) {
      const regionId = q.get('region') || 'glasswood';
      region_(G, regionId, { seed: seed ?? 1, weapon, chamber: has('chamber') ? parseInt(q.get('chamber'), 10) || 0 : 0 });
    } else if (q.get('scene') === 'hub') { selectHub(G); }
    else if (q.get('scene') === 'profiles') toProfiles(G);
  } catch (e) { console.error('[loomwake run] applyUrl', e); }
  return Promise.resolve(G.scene);
}
function selectHub(G) { if (!G.meta) loadProfile(G, G.profile); toHub(G, G.saveInfo && G.saveInfo.empty ? 'new' : 'continue'); }
export function hub(G) { if (G.run && !G.run.over) { G.run.over = true; } toHub(G, 'quit'); return G.scene; }
export function menu(G) { return toTitle(G); }

// ------------------------------------------------------------------ the UI api
export function makeApi(G) {
  return {
    profiles: () => profiles(G),
    selectProfile: (i) => selectProfile(G, i),
    newGame: (i, o) => newGame(G, i, o),
    continueRun: () => {
      if (G.scene === 'title' && !G.checkpoint) return selectProfile(G, G.profile);
      return continueRun(G);
    },
    deleteProfile: (i) => deleteProfile(G, i),
    toTitle: () => toTitle(G),
    toProfiles: () => toProfiles(G),
    choose: (i) => choose(G, i),
    reroll: () => reroll(G),
    door: (i) => door(G, i),
    buy: (i) => buy(G, i),
    leaveShop: () => leaveShop(G),
    openShop: () => openShop(G),
    useFountain: () => useFountain(G),
    leaveFountain: () => advance(G),
    remember: () => rememberHere(G),
    talk: (id) => talk(G, id),
    advance: () => advance(G),
    skip: () => skip(G),
    answer: (i) => answer(G, i),
    pause: () => pause(G),
    resume: () => resume(G),
    quit: () => quit(G),
    returnToHub: () => returnToHub(G),
    startRun: (o) => startRun(G, o || {}),
    newRun: (o) => startRun(G, o || {}),
    interact: () => { if (G.input) G.input.interactP = true; return { ok: true }; },
    buyTapestry: (id) => buyTapestry(G, id),
    equipWeapon: (id, a) => equipWeapon(G, id, a),
    unlockWeapon: (id) => unlockWeapon(G, id),
    unlockAspect: (id) => unlockAspect(G, id),
    equipKeepsake: (id) => equipKeepsake(G, id),
    setPact: (id, r) => setPact(G, id, r),
    buyShop: (id) => buyHubShop(G, id),
    gift: (id) => gift(G, id),
    playMemory: (id) => playMemory(G, id),
    setGentle: (on) => setGentle(G, on),
    settings: () => getSettings(G),
    setSetting: (k, v) => setSetting(G, k, v),
    openSettings: () => openSettings(G),
    closeSettings: () => closeSettings(G),
    openCodex: () => openCodex(G),
    closeCodex: () => closeCodex(G),
    exportSave: () => (G.saves ? G.saves.exportProfile(G.profile, G.meta, currentCheckpoint(G) ? liveRun(G) : null) : ''),
    importSave: (str) => {
      if (!G.saves) return { ok: false, error: 'no saves' };
      const r = G.saves.importProfile(G.profile, str);
      if (r.ok) { reloadProfile(G); if (G.scene !== 'title' && G.scene !== 'settings') toHub(G, 'continue'); }
      return { ok: r.ok, error: r.error };
    },
    rebind: (action, key) => {
      const b = G.settings.bindings || (G.settings.bindings = {});
      b[action] = [].concat(key);
      if (G.saves) G.saves.saveSettings(G.settings);
      emit(G, 'settings', { key: 'bindings', action });
      return { ok: true };
    },
    saveNow: () => checkpoint(G, 'manual'),
    bossChoice: (c) => resolveChoice(G, c),
  };
}
