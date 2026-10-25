// Skyforge Tycoon: boot, the fixed-step loop, scenes, URL switches and the
// window.__sf debug hook (binding contract: /mnt/project-files/skyforge/debug-contract.md).
//
// app is the glue every part receives:
//   app.G        the live game (null on the title), app.act the action API,
//   app.cam      the camera (render/camera.js), app.scene the current scene,
//   app.mode     { build: null | { type } , select: null | buildingId, link: null | { kind, a } },
//   app.ev       an app-level bus: 'scene' {scene}, 'game' {G}, 'select' {id}, 'mode' {mode}, 'saved' {...}
//   app.flags    URL switches, app.settings (persisted by the saver)
//   app.newGame(opts), app.continueGame(profile), app.toTitle(), app.setScene(s), app.save(reason)
// Sim time: fixed DT steps; the loop feeds real time x speed (1x, 2x, 3x).
import { createBus } from './core/events.js';
import { createGame, snapshot, restore } from './state.js';
import { initSim, hydrateSim, advance, tick, MODULES } from './sim/index.js';
import { makeActions } from './sim/actions.js';
import { DT, DAY, VERSION, CFG } from './config.js';
import { createCamera, toScreen as camToScreen } from './render/camera.js';
import { createRenderer } from './render/scene.js';
import { createUI } from './ui/index.js';
import { createInput } from './input/index.js';
import { createAudio } from './audio/index.js';
import { createSaver } from './save/save.js';
import { applyPreset } from './presets.js';
import { createBot } from './bot.js';
import * as C from './content/index.js';

const Q = new URLSearchParams(location.search);
const flags = {
  debug: Q.has('debug'), save: Q.get('save') === '1', play: Q.has('play'), cover: Q.has('cover'),
  touch: Q.has('touch'), mute: Q.has('mute'), raid: Q.has('raid'),
  seed: Q.has('seed') ? (parseInt(Q.get('seed'), 10) >>> 0) : null,
  difficulty: Q.get('difficulty'), preset: Q.get('preset'), scene: Q.get('scene'),
  time: Q.get('time'), weather: Q.get('weather'), quality: Q.get('quality'),
  speed: Q.has('speed') ? +Q.get('speed') : null, profile: Q.has('profile') ? +Q.get('profile') : null,
};
const canvas = document.getElementById('scene');
const root = document.getElementById('ui');
if (flags.cover) document.body.classList.add('cover');
if (flags.touch) document.body.classList.add('touch');

const app = {
  G: null, scene: 'loading', cam: createCamera(), flags, ev: createBus(), bus: createBus(),
  mode: { build: null, select: null, link: null }, settings: {}, profile: 0, frozen: false,
  frameLog: [], content: C,
};
app.act = makeActions(() => app.G);
window.__sfApp = app;

// ---- scenes and games -------------------------------------------------------
app.setScene = (s) => {
  if (app.scene === s) return;
  app.scene = s;
  if (app.G) app.G.scene = s;
  document.body.dataset.scene = s;
  app.ev.emit('scene', { scene: s });
};

function adopt(G) {
  G.bus = app.bus;
  app.G = G;
  app.mode = { build: null, select: null, link: null };
  app.ev.emit('game', { G });
}

app.newGame = ({ seed = flags.seed ?? ((Date.now() ^ (Math.random() * 1e9)) >>> 0), profile = app.profile, difficulty = flags.difficulty || 'standard', preset = null, name } = {}) => {
  app.profile = profile;
  const G = createGame({ seed, difficulty, name, bus: app.bus });
  adopt(G);
  initSim(G);
  if (preset && preset !== 'fresh') applyPreset(G, preset, app);
  app.setScene('colony');
  app.ev.emit('newgame', { G });
  app.save('new');
  return G;
};

app.continueGame = (profile = app.profile) => {
  const data = app.saver.load(profile);
  if (!data) return false;
  app.profile = profile;
  const G = restore(data, app.bus);
  adopt(G);
  hydrateSim(G);
  app.setScene('colony');
  app.ev.emit('loaded', { G, away: data.awaySeconds || 0, summary: data.awaySummary || null });
  return true;
};

app.toTitle = () => { app.save('quit'); app.G = null; app.ev.emit('game', { G: null }); app.setScene('title'); };
app.save = (reason = 'auto') => (app.G && app.saver ? app.saver.save(app.G, app.profile, reason) : { ok: false });

// ---- the loop -----------------------------------------------------------------
const SIM_SCENES = new Set(['colony', 'build', 'research', 'chart', 'fleet']);
let last = performance.now(), autosaveT = 0;
function frame(now) {
  const realDt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
  const t0 = performance.now();
  const G = app.G;
  if (G && !app.frozen && SIM_SCENES.has(app.scene) && !G.event && G.speed > 0) {
    advance(G, Math.min(0.25, realDt) * G.speed);
  }
  if (G && !app.frozen && SIM_SCENES.has(app.scene)) {
    autosaveT += realDt * 1000;
    if (autosaveT >= CFG.save.autosaveMs) { autosaveT = 0; app.save('auto'); }
  }
  try { app.input?.update(realDt); } catch (e) { console.error(e); }
  try { app.renderer?.draw(realDt); } catch (e) { console.error(e); }
  try { app.ui?.update(realDt); } catch (e) { console.error(e); }
  try { app.audio?.update(realDt); } catch (e) { console.error(e); }
  app.bot?.update(realDt);
  const js = performance.now() - t0;
  app.frameLog.push({ dt: realDt * 1000, js });
  if (app.frameLog.length > 600) app.frameLog.shift();
  requestAnimationFrame(frame);
}

function onHide() { if (app.G) app.save('hide'); }
addEventListener('pagehide', onHide);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onHide(); });

// big events save right away
for (const ev of ['island:claimed', 'research:done', 'chapter', 'won']) app.bus.on(ev, () => setTimeout(() => app.save(ev), 0));

// ---- debug hook -------------------------------------------------------------
function state() {
  const G = app.G;
  const base = { scene: app.scene, time: G ? G.t : 0, profile: app.profile, seed: G ? G.seed : null };
  if (!G) return base;
  const home = G.tmp.netOf ? G.tmp.netOf.hearthrock : 'hearthrock';
  const pool = G.pools[home] || { res: {}, cap: {} };
  const res = { ...pool.res, coin: G.colony.coin ?? G.pools.colony?.res?.coin ?? 0, insight: G.colony.insight ?? G.pools.colony?.res?.insight ?? 0 };
  const sky = G.buildings.find((b) => b.type === 'skyforge');
  return {
    ...base, day: G.day, tod: G.tod, speed: G.speed, difficulty: G.difficulty, chapter: G.goals.chapter,
    colony: { name: G.colony.name, pop: G.colony.pop, popCap: G.colony.popCap, workers: G.colony.workers, idle: G.colony.idle, happiness: G.colony.happiness, housing: G.colony.housing },
    res, cap: { ...pool.cap }, rates: { ...(G.tmp.rates?.[home] || {}) },
    pools: Object.fromEntries(Object.entries(G.pools).map(([k, p]) => [k, { res: { ...p.res }, cap: { ...p.cap } }])),
    islands: G.islands.map((i) => ({ id: i.id, name: i.name, owned: i.owned, discovered: i.discovered, scouted: i.scouted, x: i.ox, y: i.oy, size: [i.w, i.h], biome: i.biome, buildings: G.buildings.filter((b) => b.island === i.id).length })),
    buildings: G.buildings.map((b) => ({ id: b.id, type: b.type, island: b.island, x: b.u, y: b.v, level: b.level, state: b.state, workers: b.workers, staffed: b.workers >= (b.want || 0), working: b.state === 'built' && !b.stall, stall: b.stall, damaged: b.hp < b.maxHp, onFire: b.fire > 0, progress: b.progress, eff: b.eff })),
    links: G.links.map((l) => ({ id: l.id, kind: l.kind, a: l.a, b: l.b, state: l.state })),
    research: { current: G.research.current, progress: G.tmp.researchProgress ?? G.research.progress, done: [...G.research.done], available: MODULES.research.available(G) },
    goals: { chapter: G.goals.chapter, current: G.tmp.goalSteps || [], done: [...G.goals.done] },
    goal: { id: 'skyforge', stage: sky ? (sky.level || 0) : 0, progress: G.tmp.skyforgeProgress ?? 0, done: G.goals.won },
    threat: {
      raid: G.raid ? { active: G.raid.phase !== 'warn', eta: G.raid.phase === 'warn' ? G.raid.eta : 0, strength: G.raid.strength, ships: G.pirates.length } : null,
      storm: G.weather.kind === 'storm' ? { active: true, eta: 0, power: G.weather.power } : (G.tmp.nextStorm ? { active: false, eta: G.tmp.nextStorm.eta, power: G.tmp.nextStorm.power } : null),
    },
    fleet: G.ships.map((s) => ({ id: s.id, kind: s.kind, island: s.island ?? null, mission: s.state, hp: s.hp })),
    expeditions: G.expeditions.map((e) => ({ id: e.id, target: e.target, kind: e.kind, eta: e.eta, result: e.result ?? null })),
    trade: G.routes.map((r) => ({ id: r.id, from: r.from, to: r.to, ship: r.ship, cargo: r.cargo || null, eta: r.eta ?? null })),
    contracts: G.contracts.map((c) => ({ id: c.id, port: c.port, res: c.res, n: c.n, delivered: c.delivered, due: c.due, reward: c.reward, accepted: !!c.accepted })),
    event: G.event ? { id: G.event.id, text: G.event.text, options: G.event.options.map((o) => o.label) } : null,
    lastSave: app.saver?.last || null, saveKey: app.saver?.keyFor?.(app.profile) || null,
  };
}

function content() {
  return {
    configVersion: VERSION, dayLength: DAY, dt: DT,
    resources: C.RESOURCES.map((r) => r.id), resourceInfo: C.RESOURCES,
    buildings: C.BUILDINGS, links: C.LINKS, research: C.RESEARCH, branches: C.BRANCHES,
    islands: C.ISLANDS, ports: C.PORTS, ships: C.SHIPS, goals: C.CHAPTERS, goal: { id: 'skyforge', needs: 'five stages then the Dreadnought' },
    raids: C.PIRATES, storms: C.WEATHER, defend: C.DEFENDS, events: C.EVENTS, achievements: C.ACHIEVEMENTS,
  };
}

function hashState() {
  const s = JSON.stringify(snapshot(app.G));
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

function installHook() {
  const A = app.act;
  const G = () => app.G;
  const hook = {
    get game() { return app.G; }, app,
    freeze() { app.frozen = true; return state(); },
    thaw() { app.frozen = false; last = performance.now(); return state(); },
    step(ms, { render = true } = {}) {
      const g = G(); if (!g) return state();
      const n = Math.round(ms / 1000 / DT);
      for (let i = 0; i < n; i++) { tick(g); if (app.bot?.on && i % 30 === 29) app.bot.update(0); }
      if (render) { try { app.renderer?.draw(0); app.ui?.update(0); } catch (e) { console.error(e); } }
      return state();
    },
    state, content, hash: hashState,
    play(opts = {}) { app.newGame({ profile: 0, ...opts }); return Promise.resolve(state()); },
    menu() { if (app.G) app.toTitle(); else app.setScene('title'); return state(); },
    build: A.build, canBuild: A.canBuild, spots: A.spots, upgrade: A.upgrade, demolish: A.demolish, repair: A.repair, toggle: A.toggle, staff: A.staff,
    link: A.link, canLink: A.canLink, linkSpots: A.linkSpots,
    research: A.research, cancelResearch: A.cancelResearch, expedition: A.expedition, claim: A.claim, drift: A.drift,
    ship: A.ship, route: A.route, editRoute: A.editRoute, deleteRoute: A.deleteRoute, contract: A.contract, sell: A.sell,
    speed: A.speed, choose: A.choose, defend: A.defend,
    give(res, n) {
      const g = G(); if (!g) return { ok: false };
      const obj = typeof res === 'object' ? res : { [res]: n };
      for (const [k, v] of Object.entries(obj)) MODULES.economy.give?.(g, k, v);
      return { ok: true };
    },
    raid(strength = 1) { return MODULES.raids.startRaid?.(G(), strength) || { ok: false, error: 'raids not built yet' }; },
    storm(power = 0.8) { return MODULES.weather.startStorm?.(G(), power) || { ok: false, error: 'weather not built yet' }; },
    weather(kind, power = 0.7) { return MODULES.weather.setWeather?.(G(), kind, power) || { ok: false }; },
    unlock(id = 'all') { return MODULES.research.unlock?.(G(), id) || { ok: false }; },
    claimAll() { return MODULES.chart.claimAll?.(G()) || { ok: false }; },
    win() { return MODULES.goals.win?.(G()) || { ok: false }; },
    time(tod) { const g = G(); if (g) g.tod = ((tod % 1) + 1) % 1; return state(); },
    stress(o = {}) { return applyPreset(G(), 'stress', app, o); },
    frames() { return app.frameLog.slice(); },
    auto(on = true) { app.bot = on ? (app.bot || createBot(app)) : null; if (app.bot) app.bot.on = !!on; return { ok: true }; },
    toScreen(island, u, v) {
      const g = G(); const i = g && g.islands.find((x) => x.id === island); if (!i) return null;
      const [x, y] = camToScreen(app.cam, i.ox + u + 0.5, i.oy + v + 0.5, i.alt);
      return { x, y };
    },
    camera() { return { x: app.cam.x, y: app.cam.y, zoom: app.cam.zoom }; },
    view(target, zoom) {
      const g = G();
      if (typeof target === 'string' && g) { const i = g.islands.find((x) => x.id === target); if (i) { app.cam.x = i.ox + i.w / 2; app.cam.y = i.oy + i.h / 2; app.cam.z = i.alt; } }
      else if (target) { app.cam.x = target.x; app.cam.y = target.y; }
      if (zoom) app.cam.zoom = zoom;
      app.cam.tx = app.cam.ty = app.cam.tzoom = null;
      return hook.camera();
    },
    open(screen) { if (screen === 'build') { app.ev.emit('ui:build', {}); app.setScene('colony'); } else app.setScene(screen); return state(); },
    select(id) { app.mode.select = id; app.ev.emit('select', { id }); return { ok: true }; },
  };
  if (app.saver?.debug) Object.defineProperty(hook, 'save', { get: () => app.saver.debug() });
  window.__sf = hook;
}

// ---- boot -----------------------------------------------------------------------
function boot() {
  app.saver = createSaver(app);
  app.settings = app.saver.settings?.get?.() || {};
  app.renderer = createRenderer(canvas, app);
  app.ui = createUI(root, app);
  app.input = createInput(canvas, app);
  app.audio = createAudio(app);
  if (flags.debug) installHook();
  document.getElementById('loader')?.remove();
  if (flags.play || flags.preset) {
    app.newGame({ profile: flags.profile ?? 0, preset: flags.preset });
    const G = app.G;
    if (flags.time) G.tod = { dawn: 0.25, day: 0.42, noon: 0.5, dusk: 0.74, night: 0.92 }[flags.time] ?? (+flags.time || G.tod);
    if (flags.weather) MODULES.weather.setWeather?.(G, flags.weather, 0.85);
    if (flags.raid) MODULES.raids.startRaid?.(G, 1, { now: true });
    if (flags.speed != null) G.speed = flags.speed;
    if (flags.scene && flags.scene !== 'colony' && flags.scene !== 'title') app.setScene(flags.scene);
  } else {
    app.setScene('title');
  }
  requestAnimationFrame((t) => { last = t; frame(t); });
}

try { boot(); } catch (e) {
  console.error(e);
  const l = document.getElementById('loader'); if (l) l.textContent = 'Skyforge Tycoon could not start: ' + e.message;
}
