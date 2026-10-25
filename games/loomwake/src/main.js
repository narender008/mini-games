// Loomwake: boot, fixed-step loop (120 Hz sim, rAF render), URL switches and
// the window.__lw debug hook.
//
// ---------------------------------------------------------------- boot order
// createGame -> renderer + input -> load sibling modules in parallel (each guarded: a missing or broken module
// never stops boot) -> boons.js into combat (setBoonRuntime) -> enemies/bosses updaters into world (setSystems)
// -> weapons from content/weapons.js registered -> painters into the renderer -> Run.boot(G, { search, debug,
// seed, params }) -> UI createUI(G, api) with api = Run.makeApi(G) + engine extras -> audio on first gesture ->
// Run.applyUrl(G, params). Without run.js, `?play` (and every boot) opens the motion-test arena with waves.
//
// ---------------------------------------------------------------- each sim tick (DT = 1/120 s)
// input.sample(G) -> bot.botTick(G) when auto is on -> G.t += DT -> stepWorld(G, DT) when G.scene is 'run' or
// 'hub' and !G.paused -> Run.tick(G, DT) (every scene). Each rAF: renderer.draw(G, dt), ui.update(G).
//
// ---------------------------------------------------------------- URL switches
// ?debug ?save=1 ?play ?seed=N ?region=glasswood|choir|forge|unwoven ?chamber=N ?weapon=blade|spear|bow|gauntlets|chakram
// ?boss=veyl|morrow|aurum|sable ?scene=hub|profiles ?profile=0..2 ?bench ?quality=high|low ?scale=0.5..1 ?touch ?mute ?cover
// ?arena (force the engine test arena even when run.js exists) ?freeze (start frozen, with ?debug)
//
// ---------------------------------------------------------------- window.__lw (with ?debug)
//   freeze(), thaw(), step(ms, { render = true } = {}) -> state()  (synchronous)
//   state() -> plain JSON (shape in debug-contract.md / test-needs.md section 1, plus pickups, hero.state)
//   content() -> { boons, braids, weapons, patrons, enemies, bosses:[{id}], regions:[{id, chambers, boss}], dialogue,
//                  memoryThreads, tapestry, configVersion }
//   input(o | null)    hold { move:{x,y}, aim:{x,y} world point, attack, special, snare, dash, call, interact, pause }
//   play(opts) -> Promise<state>   { seed, weapon, region, chamber, boons:[ids], keepsake }
//   hub(), menu(), choose(i|id), reroll(), door(i), talk(npcId), advance(), skip() (answers 0 if asked), answer(i), clear(), kill(), boss(id), bossKill(),
//   god(on), heal(), damage(n), give(boonId, rarity), spawn(kind, n, x, y), set(path, value), hash(),
//   auto(on), region(id), buy(i), fountain(), stress({ enemies, particles, lights }), frames() -> [{ dt, js }],
//   game (the live G), renderer, save (save.js saveApi(G): keys, now, read, export, import, version, migrations,
//   fixture, checksum, wipe), modules (the loaded sibling modules), quality(tier)
import { DT, CONFIG_VERSION } from './config.js';
import { createGame, hashState } from './state.js';
import { createInput } from './input/index.js';
import { createRenderer } from './render/renderer.js';
import { createQuality } from './render/quality.js';
import { stepWorld, setSystems, testChamber, spawnDummy, insideChamber } from './sim/world.js';
import { setBoonRuntime, killFoe, killHero, healHero, hurtHero, targetable } from './sim/combat.js';
import { registerWeapon, resetHero, recomputeStats, respawnHero, WEAPON_IDS } from './sim/hero.js';

const Q = new URLSearchParams(location.search);
const DEBUG = Q.has('debug');
const TOUCH = Q.has('touch') || matchMedia('(pointer: coarse)').matches;
const seed0 = Q.has('seed') ? parseInt(Q.get('seed'), 10) >>> 0 : (DEBUG ? 1 : (Date.now() >>> 0));

const canvas = document.getElementById('scene');
const G = createGame({ seed: seed0 });
G.debug = DEBUG;
G.touch = TOUCH;
window.__lwG = DEBUG ? G : undefined;
if (Q.has('cover')) document.body.classList.add('cover');
document.body.dataset.scene = 'loading';

const quality = createQuality({ pin: Q.get('quality'), scale: Q.has('scale') ? parseFloat(Q.get('scale')) : null, touch: TOUCH });
const renderer = createRenderer(G, canvas, { quality });
const input = createInput(G, canvas);
G.engine = { input, renderer, quality };

// ---------------------------------------------------------------- sibling modules (each optional)
const MODS = {};
const load = async (name, path) => {
  try { MODS[name] = await import(path); } catch (err) { MODS[name] = null; if (DEBUG) console.warn('[loomwake] module unavailable:', path, err && err.message); }
  return MODS[name];
};
const fnOf = (m, ...names) => { if (!m) return null; for (const n of names) if (typeof m[n] === 'function') return m[n]; return null; };

let ui = null, frozen = DEBUG && Q.has('freeze'), auto = false, arena = null;
const frameLog = [];

async function boot() {
  await Promise.all([
    load('boons', './sim/boons.js'), load('enemies', './sim/enemies/index.js'), load('bosses', './sim/bosses/index.js'),
    load('env', './render/env/index.js'), load('enemyArt', './render/actors/enemies/index.js'), load('bossArt', './render/actors/bosses/index.js'),
    load('weaponsData', './content/weapons.js'),
  ]);
  setBoonRuntime(MODS.boons);
  setSystems({ updateFoes: fnOf(MODS.enemies, 'updateFoes'), updateBosses: fnOf(MODS.bosses, 'updateBosses') });
  // weapons beyond the blade
  const ids = (MODS.weaponsData?.WEAPON_IDS || []).filter((id) => id !== 'blade');
  await Promise.all(ids.map(async (id) => { const m = await load('weapon_' + id, `./sim/weapons/${id}.js`); if (m) registerWeapon(m.default || m); }));
  // painters; npcs / weapons art are optional extras. Boon visuals ride on the weapons art module
  // (same owner): optional exports drawPowers(ctx, G, P, 'ground'|'air') and powerLights(G, push).
  await Promise.all([load('npcs', './render/actors/npcs.js'), load('weaponArt', './render/actors/weapons.js')]);
  renderer.setModules({ env: MODS.env, enemies: MODS.enemyArt, bosses: MODS.bossArt, npcs: MODS.npcs, powers: MODS.weaponArt, weapons: MODS.weaponArt });
  // flow
  const useArena = Q.has('arena') || !(await load('run', './sim/run.js'));
  await Promise.all([load('bot', './sim/bot.js'), load('save', './save/save.js'), load('story', './sim/story.js')]);
  const Run = useArena ? null : MODS.run;
  if (Q.has('weapon')) G.hero.weapon = Q.get('weapon');
  if (Run) {
    try { await Run.boot(G, { search: location.search, debug: DEBUG, seed: seed0, params: Q }); } catch (err) { console.error('[loomwake] run boot failed', err); }
  }
  // UI
  const api = Object.assign({}, Run && fnOf(Run, 'makeApi') ? Run.makeApi(G) : {}, {
    getBindings: () => input.getBindings(), setBindings: (b) => input.setBindings(b), resetBindings: () => input.resetBindings(),
    quality: (tier) => { if (tier) quality.set(tier); renderer.resize(); return quality.tier; },
  });
  G.api = api;
  const uiMod = await load('ui', './ui/index.js');
  const createUI = fnOf(uiMod, 'createUI', 'default');
  if (createUI) { try { ui = createUI(G, api); } catch (err) { console.error('[loomwake] UI failed to start', err); } }
  // audio on first gesture
  const audioMod = await load('audio', './audio/index.js');
  if (audioMod && !Q.has('mute')) {
    const attach = fnOf(audioMod, 'attachAudio');
    if (attach) { try { attach(G.bus, G); } catch (err) { console.error('[loomwake] audio attach failed', err); } }
    const start = () => { const init = fnOf(audioMod, 'initAudio'); if (init) { try { init(G); } catch (err) { console.error(err); } } removeEventListener('pointerdown', start); removeEventListener('keydown', start); };
    addEventListener('pointerdown', start); addEventListener('keydown', start);
  }
  if (DEBUG) { await buildContent(); installHook(Run); }
  if (Run) {
    const apply = fnOf(Run, 'applyUrl');
    if (apply) { try { await apply(G, Q); } catch (err) { console.error('[loomwake] applyUrl failed', err); } }
    if (G.scene === 'loading') G.scene = 'title';
  } else await startArena();
  // ?bench: straight into a run (no clicks), god mode so the stress chamber lasts, then the plan's maxima
  if (Q.has('bench')) {
    if (Run && G.scene !== 'run') { const play = fnOf(Run, 'play'); if (play) { try { await play(G, { seed: G.seed, region: Q.get('region') || undefined, chamber: Q.has('chamber') ? +Q.get('chamber') : 1 }); } catch (err) { console.error('[loomwake] bench start failed', err); } } }
    G.god = true; G.dialogue = null; if (G.scene === 'dialogue') G.scene = 'run';
    stress({ enemies: 40, particles: 5000, lights: 32 });
  }
  document.getElementById('loader')?.remove();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- engine test arena (no run.js, or ?arena)
async function startArena() {
  arena = { wave: 0, waveT: 0.8 };
  let ch = null;
  const C = await load('chamberGen', './sim/chamber.js');
  if (C && C.makeChamber && !Q.has('island')) { try { ch = C.makeChamber(Q.get('region') || 'glasswood', 1, 'combat', G.seed || 1); ch.doors = []; ch.waves = []; } catch (err) { console.error('[loomwake] makeChamber', err); ch = null; } }
  G.chamber = ch || testChamber(5);
  G.scene = 'run';
  const e = G.chamber.entry || { x: 0, y: 120 };
  resetHero(G, { x: e.x, y: e.y, full: true });
  G.bus.emit('chamberEnter', { chamber: G.chamber });
}
function spawnFoe(kind, x, y, opts = {}) {
  const sp = fnOf(MODS.enemies, 'spawn');
  const KINDS = MODS.enemies?.KINDS;
  if (sp && (!kind || !KINDS || KINDS[kind])) { try { const e = sp(G, kind || 'hollow', x, y, opts); if (e) return e; } catch (err) { console.error('[loomwake] spawn failed', err); } }
  return spawnDummy(G, x, y, opts);
}
function arenaTick(dt) {
  if (!arena) return;
  const h = G.hero;
  if (h.dead && h.st > 1.8) { const e = G.chamber.entry || { x: 0, y: 120 }; resetHero(G, { x: e.x, y: e.y, full: true }); respawnHero(G, e.x, e.y); return; }
  if (G.foes.some((e) => !e.dead) || Q.has('calm')) return;
  arena.waveT -= dt;
  if (arena.waveT > 0) return;
  arena.wave++; arena.waveT = 1.6;
  const n = Math.min(3 + arena.wave * 2, 12);
  const kinds = MODS.enemies?.KINDS ? Object.keys(MODS.enemies.KINDS).filter((k) => !MODS.enemies.KINDS[k].boss) : ['hollow'];
  const pool = kinds.filter((k) => ['hollow', 'threadKnight', 'needlecaster', 'snarl'].includes(k));
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0;
    for (let k = 0; k < 30; k++) { const a = G.rng.run() * Math.PI * 2, d = 250 + G.rng.run() * 550; x = h.x + Math.cos(a) * d; y = h.y + Math.sin(a) * d * 0.7; if (insideChamber(G.chamber, x, y, 60)) break; }
    const kind = pool.length ? pool[(i + arena.wave) % pool.length] : 'hollow';
    spawnFoe(kind, x, y, { elite: arena.wave >= 3 && i === 0, wave: arena.wave });
  }
  G.bus.emit('waveStart', { wave: arena.wave });
}

// ---------------------------------------------------------------- loop
function tick() {
  input.sample(G);
  if (auto && MODS.bot && G.scene !== 'loading') { try { MODS.bot.botTick(G); } catch (err) { console.error('[loomwake] bot', err); auto = false; } }
  G.t += DT; G.frame++;
  if ((G.scene === 'run' || G.scene === 'hub') && !G.paused) stepWorld(G, DT);
  const runTick = fnOf(arena ? null : MODS.run, 'tick');
  if (runTick) runTick(G, DT); else arenaTick(DT);
  if (document.body.dataset.scene !== G.scene) document.body.dataset.scene = G.scene;
}

let last = performance.now(), acc = 0, errors = 0;
function frame(now) {
  const t0 = performance.now();
  const dtMs = now - last; last = now;
  const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
  try {
    if (!frozen) {
      acc += dt * (G.slow ?? 1);
      let n = 0;
      while (acc >= DT && n < 12) { tick(); acc -= DT; n++; }
      if (n >= 12) acc = 0;
    }
    renderer.draw(G, frozen ? 0 : dt);
    if (ui && ui.update) ui.update(G);
  } catch (err) {
    if (errors++ < 5) console.error('[loomwake] frame error', err);
  }
  const js = performance.now() - t0;
  frameLog.push({ dt: Math.round(dtMs * 100) / 100, js: Math.round(js * 100) / 100 });
  if (frameLog.length > 600) frameLog.splice(0, frameLog.length - 600);
  if (!frozen && quality.frame(dtMs)) renderer.resize();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- debug hook
function stress({ enemies = 40, particles = 5000, lights = 32 } = {}) {
  const h = G.hero;
  for (let i = 0; i < enemies; i++) { const a = (i / enemies) * Math.PI * 2, d = 200 + (i % 5) * 90; const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.6; spawnFoe(null, x, y); }
  const fx = renderer.fx;
  for (let i = 0; i < particles; i++) fx.part({ x: h.x + (Math.random() - 0.5) * 1600, y: h.y + (Math.random() - 0.5) * 900, z: Math.random() * 60, vz: 20, g: 0, life: 6 + Math.random() * 4, size: 2, color: '#8ff3ff', type: i % 3 ? 'spark' : 'ember', drag: 0 });
  for (let i = 0; i < lights; i++) fx.flash(h.x + (Math.random() - 0.5) * 1600, h.y + (Math.random() - 0.5) * 900, 160, '#ffd27a', 8, 0.8);
  return { foes: G.foes.length, particles: fx.count };
}

function stateOf(Run) {
  const h = G.hero, r = G.run, m = G.meta, ch = G.chamber;
  const boonMeta = (b) => { const info = Run && Run.boonInfo ? Run.boonInfo(b.id) : null; return { id: b.id, slot: info?.slot ?? b.slot ?? null, patron: info?.patron ?? b.patron ?? null, rarity: b.rarity, level: b.level ?? 1 }; };
  const story = fnOf(MODS.story, 'storySummary', 'storyState', 'debugState');
  let st = null;
  try { st = story ? story(G) : null; } catch (err) { st = null; }
  if (!st && m) st = { runs: m.stats?.runs ?? 0, wins: m.stats?.wins ?? 0, deaths: m.stats?.deaths ?? 0, seen: Object.keys(m.seen || {}), flags: m.flags || {}, memoryThreads: m.memories || [], reveals: m.reveals || [], ending: m.ending ?? null };
  const b = G.boss && !G.boss.gone ? G.boss : null;
  const s = {
    scene: G.scene, time: Math.round(G.t * 1000) / 1000, runTime: r?.stats?.time ?? 0, profile: G.profile | 0,
    seed: r?.seed ?? G.seed, rngHash: ((G.rng.run.state ^ Math.imul(G.rng.ai.state, 31) ^ Math.imul(G.rng.combat.state, 131)) >>> 0),
    region: r?.region ?? ch?.region ?? null, regionIndex: r?.regionIndex ?? (ch?.region ? ['glasswood', 'choir', 'forge', 'unwoven'].indexOf(ch.region) : null),
    chamber: r?.chamber ?? null, chamberId: ch?.id ?? null, chamberKind: ch?.kind ?? null,
    cleared: !!(r?.ch?.cleared ?? ch?.cleared ?? (arena ? !G.foes.some((e) => !e.dead) : false)),
    doors: (ch?.doors || []).map((d) => ({ i: d.i, reward: d.reward, x: d.x, y: d.y, open: !!d.open })),
    hero: h ? { x: h.x, y: h.y, vx: h.vx, vy: h.vy, r: h.r, hp: h.hp, maxHp: h.maxHp, facing: h.facing, state: h.state, dashing: !!h.dashing, invuln: h.inv > 0, dashCharges: h.dashCharges, call: Math.round(h.call * 1000) / 1000, deathDefiance: h.deathDefiance, armor: h.armor || 0, dead: !!h.dead } : null,
    weapon: r?.weapon ?? h?.weapon ?? 'blade',
    boons: (r?.boons || []).map(boonMeta),
    braids: (() => { try { return MODS.boons?.ownedBraids ? MODS.boons.ownedBraids(G).map((x) => (typeof x === 'string' ? x : x.id)) : []; } catch { return []; } })(),
    currency: { run: r?.currency ?? 0, lumen: m?.currency?.lumen ?? 0, keys: m?.currency?.keys ?? 0, shards: m?.currency?.shards ?? 0 },
    enemies: G.foes.filter((e) => !e.dead && !e.gone).map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp, armor: e.armor, elite: !!e.elite, attacking: !!(e.attacking || e.hasToken), boss: !!e.boss, spawning: !!e.spawning })),
    telegraphs: G.telegraphs.filter((t) => !t.done).map((t) => ({ kind: t.kind, x: t.x, y: t.y, r: t.r, x2: t.x2, y2: t.y2, w: t.w, angle: t.angle, arc: t.arc, t: t.t, live: !!t.live })),
    projectiles: G.projectiles.map((p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, r: p.r, hostile: p.team !== 'hero' })),
    pickups: G.pickups.map((p) => ({ kind: p.kind, x: p.x, y: p.y })),
    boss: b ? { id: b.kind, hp: b.hp, maxHp: b.maxHp, phase: b.phase ?? 1, armor: b.armor } : null,
    offer: G.offer ? G.offer.map((o) => ({ id: o.id, slot: o.slot, patron: o.patron, rarity: o.rarity, braid: !!o.braid })) : null,
    dialogue: G.dialogue ? { speaker: G.dialogue.speaker, lineId: G.dialogue.lineId, choices: G.dialogue.choices && G.dialogue.choices.length ? G.dialogue.choices.map((c, i) => ({ i, id: c.id ?? i, text: c.text ?? String(c) })) : null } : null,
    story: st,
    saveKey: G.saves?.key ? G.saves.key(G.profile) : `loomwake.p${G.profile | 0}`,
    lastSave: G.lastSave ?? null,
  };
  const extra = fnOf(Run, 'debugState');
  if (extra) { try { Object.assign(s, extra(G)); } catch (err) { /* ignore */ } }
  return JSON.parse(JSON.stringify(s));
}

function installHook(Run) {
  const call = (name, ...args) => { const f = fnOf(Run, name); return f ? f(G, ...args) : undefined; };
  const st = () => stateOf(Run);
  const lw = {
    get game() { return G; }, renderer, modules: MODS, input: (o) => { input.override(o); return st(); },
    freeze: () => { frozen = true; return true; }, thaw: () => { frozen = false; last = performance.now(); acc = 0; return true; },
    step: (ms = DT * 1000, { render = true } = {}) => {
      const n = Math.max(1, Math.round(ms / 1000 / DT));
      for (let i = 0; i < n; i++) tick();
      if (render) { renderer.draw(G, n * DT); if (ui && ui.update) ui.update(G); }
      return st();
    },
    state: st,
    content: () => contentOf(),
    play: async (opts = {}) => {
      const f = fnOf(Run, 'play');
      if (f) await f(G, opts);
      else { if (opts.weapon) G.hero.weapon = opts.weapon; if (opts.seed != null) { G.seed = opts.seed; } G.foes.length = 0; await startArena(); }
      return st();
    },
    hub: () => { call('hub'); return st(); }, menu: () => { call('menu'); return st(); },
    choose: (i) => call('choose', i), reroll: () => call('reroll'), door: (i) => call('door', i), talk: (id) => call('talk', id),
    advance: () => call('advance'),
    // skip(): ends the conversation; a pending question is answered with choice 0
    skip: () => { let r = call('skip'); if (G.dialogue && G.dialogue.choices && G.dialogue.choices.length) r = call('answer', 0); return r; },
    answer: (i = 0) => call('answer', i), buy: (i) => call('buy', i), fountain: () => call('fountain'),
    region: (id, o) => call('region', id, o), boss: (id, o) => (Run ? call('boss', id, o) : (fnOf(MODS.bosses, 'startBoss') ? MODS.bosses.startBoss(G, id) : null)),
    clear: () => { if (Run && Run.clear) return call('clear'); for (const e of G.foes.slice()) if (!e.dead) killFoe(G, e, { kind: 'debug' }); return st(); },
    kill: () => { if (Run && Run.kill) return call('kill'); killHero(G); return st(); },
    bossKill: () => call('bossKill'),
    god: (on = true) => { G.god = !!on; return G.god; },
    heal: () => { if (G.hero) { G.hero.dead = false; healHero(G, G.hero.maxHp); } return st().hero; },
    damage: (n = 10) => hurtHero(G, n, { force: true, ignoreInv: true, kind: 'debug' }),
    give: (id, rarity = 'common') => { const f = fnOf(MODS.boons, 'takeBoon'); if (!f) return { ok: false, error: 'no boons.js' }; const r = f(G, id, rarity); recomputeStats(G); return r ?? { ok: true }; },
    spawn: (kind = 'hollow', n = 1, x, y) => { const h = G.hero, out = []; for (let i = 0; i < n; i++) { const a = (i / Math.max(1, n)) * Math.PI * 2; out.push(spawnFoe(kind, x ?? h.x + Math.cos(a) * 260, y ?? h.y + Math.sin(a) * 180)); } return out.map((e) => e && e.id); },
    set: (path, value) => { const ks = String(path).split('.'); let o = G.cfg; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] ?? (o[ks[i]] = {}); o[ks[ks.length - 1]] = value; return value; },
    hash: () => hashState(G),
    auto: (on = true) => { auto = !!on; if (!on && G.input) input.override(null); if (on && MODS.bot?.botReset) MODS.bot.botReset(G); return auto; },
    stress, frames: () => frameLog.slice(),
    quality: (tier) => { if (tier) quality.set(tier); renderer.resize(); return { tier: quality.tier, scale: quality.scale }; },
    weapons: () => WEAPON_IDS.slice(),
  };
  const sapi = fnOf(MODS.save, 'saveApi');
  if (sapi) { try { lw.save = sapi(G); } catch (err) { console.error('[loomwake] saveApi', err); } }
  window.__lw = lw;
}

function contentOf() { return contentCache || { configVersion: CONFIG_VERSION, pending: true }; }
let contentCache = null;
async function buildContent() {
  const get = async (p) => { try { return await import(p); } catch { return null; } };
  const [boons, braids, weapons, patrons, enemies, bosses, regions, tapestry, memories] = await Promise.all(['./content/boons.js', './content/braids.js', './content/weapons.js', './content/patrons.js', './content/enemies.js', './content/bosses.js', './content/regions.js', './content/tapestry.js', './content/memories.js'].map(get));
  const asArr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.entries(v).map(([id, o]) => ({ id, ...(o && typeof o === 'object' ? o : {}) })) : []);
  const strip = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined && typeof o[k] !== 'function') r[k] = o[k]; return r; };
  const regionIds = regions?.REGION_ORDER || ['glasswood', 'choir', 'forge', 'unwoven'];
  const BOSS_OF = { glasswood: 'veyl', choir: 'morrow', forge: 'aurum', unwoven: 'sable' };
  const R = regions?.REGIONS || {};
  let dialogue = [];
  try {
    const D = await get('./content/dialogue/index.js');
    if (D && Array.isArray(D.DIALOGUE)) dialogue = D.DIALOGUE.map((l) => strip(l, ['id', 'speaker', 'when', 'priority', 'once', 'kind']));
  } catch { /* none yet */ }
  if (!dialogue.length) try {
    const story = MODS.story || await get('./sim/story.js');
    const lines = story && (typeof story.allLines === 'function' ? story.allLines() : story.LINES);
    if (lines) dialogue = asArr(lines).map((l) => strip(l, ['id', 'speaker', 'when', 'priority', 'once']));
  } catch { /* none yet */ }
  contentCache = {
    configVersion: CONFIG_VERSION,
    boons: asArr(boons?.BOONS).filter((b) => !b.braid).map((b) => strip(b, ['id', 'slot', 'patron', 'name', 'rarities', 'needs', 'legendary'])),
    braids: asArr(braids?.BRAIDS).map((b) => strip(b, ['id', 'needs', 'patrons', 'name', 'slot'])),
    weapons: asArr(weapons?.WEAPONS).map((w) => strip(w, ['id', 'name', 'aspects'])),
    patrons: asArr(patrons?.PATRONS).map((p) => strip(p, ['id', 'name', 'element', 'color'])),
    enemies: asArr(enemies?.KINDS).map((e) => strip(e, ['id', 'name', 'tier', 'regions', 'hp', 'armor'])),
    bosses: (bosses?.BOSS_IDS || ['veyl', 'morrow', 'aurum', 'sable']).map((id) => ({ id, ...strip((bosses?.BOSSES || {})[id] || {}, ['name', 'title', 'region']) })),
    regions: regionIds.map((id) => { const r = R[id] || {}; const n = (regions?.RHYTHM && regions.RHYTHM.length) || r.chambers || 12; return { id, name: r.name, chambers: n, boss: BOSS_OF[id], templates: regions?.templatesFor ? (regions.templatesFor(id) || []).length : undefined }; }),
    dialogue,
    memoryThreads: (memories?.MEMORY_IDS || asArr(memories?.MEMORIES).map((m) => m.id)),
    tapestry: asArr(tapestry?.TAPESTRY).map((t) => strip(t, ['id', 'name', 'ranks', 'cost'])),
  };
  return contentCache;
}

boot().catch((err) => console.error('[loomwake] boot failed', err));
