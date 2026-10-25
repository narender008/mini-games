// Skyforge audio: pure Web Audio, every sound synthesised (no files).
// createAudio(app) -> { update(realDt), unlock(), apply(settings), play(name, opts), debug() }
//
// The AudioContext is created on the first user gesture (pointer, key or touch
// anywhere), so a page that is never touched never makes one. ?mute never makes
// one at all. Volumes come from app.settings { master, music, sfx, ambience,
// mute } (0..1), polled every half second and on apply().
// Music moods (music.js): title, day, night, raid, storm, victory; crossfaded.
// Ambience (ambience.js) follows the camera and the world each frame.
// SFX (sfx.js) answer the sim bus (app.bus) and the app bus (app.ev 'ui:*').
import { createEngine } from './engine.js';
import { CFG } from '../config.js';
import { toScreen } from '../render/camera.js';

const DEF_VOL = { master: 0.8, music: 0.6, sfx: 0.8, ambience: 0.7 };
const SIM_SCENES = new Set(['colony', 'build', 'research', 'chart', 'fleet']);
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

export function createAudio(app) {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  const muteFlag = !!app.flags?.mute;
  let E = null, ctx = null;
  let volSig = '', pollT = 0, moodWant = null, moodT = 0, frameEvents = 0;
  let lastMajor = -1;
  const pendingNotify = [];

  const settingsNow = () => ({ ...DEF_VOL, ...(CFG.audio?.defaults || {}), ...pick(app.settings || {}, ['master', 'music', 'sfx', 'ambience', 'mute']) });
  function pick(o, ks) { const r = {}; for (const k of ks) if (o[k] != null) r[k] = o[k]; return r; }

  function duck() {
    const s = app.scene;
    return { music: s === 'paused' || s === 'settings' ? 0.55 : 1, amb: s === 'research' || s === 'chart' || s === 'fleet' || s === 'paused' || s === 'settings' ? 0.45 : 1 };
  }

  function apply(settings = app.settings) {
    if (!E) return;
    const s = { ...settingsNow(), ...pick(settings || {}, ['master', 'music', 'sfx', 'ambience', 'mute']) };
    E.setVolumes({ ...s, muted: !!s.mute }, 0.08, duck());
    volSig = JSON.stringify([s, app.scene]);
  }

  function unlock() {
    if (muteFlag || !AC) return false;
    try {
      if (!ctx) {
        ctx = new AC({ latencyHint: 'interactive' });
        E = createEngine(ctx);
        apply();
      }
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      return true;
    } catch (e) { console.error(e); return false; }
  }

  const gesture = () => { unlock(); if (ctx && ctx.state === 'running') for (const k of ['pointerdown', 'keydown', 'touchend']) removeEventListener(k, gesture, true); };
  if (typeof window !== 'undefined') {
    for (const k of ['pointerdown', 'keydown', 'touchend']) addEventListener(k, gesture, true);
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.visibilityState === 'hidden') ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
    });
  }

  const live = () => E && ctx.state === 'running';

  // ---- where is a sound? -> { pan, vol } from its world position --------------------
  function worldPos(p) {
    if (!p) return null;
    const G = app.G; if (!G) return null;
    const isl = (id) => G.islands.find((i) => i.id === id);
    const b = p.b || (p.building ? p.building : null);
    if (b && b.island != null) { const i = isl(b.island); if (i) return [i.ox + b.u + 0.5, i.oy + b.v + 0.5, i.alt]; }
    if (p.island != null && p.u != null) { const i = isl(p.island); if (i) return [i.ox + p.u + 0.5, i.oy + p.v + 0.5, i.alt]; }
    if (p.x != null && p.y != null) return [p.x, p.y, p.z || 0];
    for (const o of [p.p, p.s]) if (o && o.x != null) return [o.x, o.y, o.z || 0];
    if (p.l) { const a = isl(p.l.a), c = isl(p.l.b); if (a && c) return [(a.ox + a.w / 2 + c.ox + c.w / 2) / 2, (a.oy + a.h / 2 + c.oy + c.h / 2) / 2, (a.alt + c.alt) / 2]; }
    if (p.i && p.i.ox != null) return [p.i.ox + p.i.w / 2, p.i.oy + p.i.h / 2, p.i.alt];
    if (typeof p.island === 'string') { const i = isl(p.island); if (i) return [i.ox + i.w / 2, i.oy + i.h / 2, i.alt]; }
    return null;
  }
  function place(p) {
    const w = worldPos(p); const cam = app.cam;
    if (!w || !cam) return { pan: 0, vol: 1 };
    const [sx, sy] = toScreen(cam, w[0], w[1], w[2]);
    const hw = cam.w / 2, hh = cam.h / 2;
    const out = Math.max(0, Math.abs(sx - hw) - hw, Math.abs(sy - hh) - hh);   // px beyond the screen edge
    const zoomK = 0.6 + 0.4 * clamp((cam.zoom - cam.minZoom) / (cam.maxZoom - cam.minZoom));
    if (!Number.isFinite(sx + sy)) return { pan: 0, vol: 0.5 };
    return { pan: clamp((sx - hw) / hw, -1, 1) * 0.75, vol: clamp(1 - out / (cam.w * 0.9), 0.15, 1) * zoomK };
  }

  // ---- sound helpers ------------------------------------------------------------
  function play(name, opts = {}) { if (!live()) return false; return E.sfx.play(name, opts); }
  function at(name, payload, extra = {}) {
    if (!live()) return;
    if (++frameEvents > 40) return;   // a long catch-up step: stay quiet
    play(name, { ...place(payload), ...extra });
  }
  const major = (name, payload, extra) => { lastMajor = ctx ? ctx.currentTime : 0; at(name, payload, extra); };

  // ---- sim bus ------------------------------------------------------------------
  const B = app.bus;
  const SHOT = { harpoon: 'harpoon', grapple: 'harpoon', flak: 'flak', militia: 'cannon', bomb: 'whistle', cannon: 'cannon', lash: null, zap: 'zap', bolt: 'zap' };
  const BOOM = { flak: 'flak', hit: 'clank', shield: 'shieldHit' };
  const on = (ev, fn) => B?.on(ev, (p) => { try { if (live() && app.G && app.scene !== 'title') fn(p || {}); } catch (e) { console.error(e); } });
  on('build:placed', (p) => at('thunk', p));
  on('build:done', (p) => major('chime', p));
  on('build:upgraded', (p) => major('upgrade', p));
  on('build:demolished', (p) => at('demolish', p));
  on('build:damaged', (p) => at('damaged', p));
  on('fire:start', (p) => at('ignite', p));
  on('fire:out', (p) => at('hiss', p));
  on('res:gain', (p) => { const q = place(p); if (q.vol > 0.55) play('res', q); });
  on('trade:sale', (p) => major('coins', p));
  on('research:start', (p) => at('paper', null));
  on('research:done', () => major('fanfare', null));
  on('notify', (p) => { if (ctx) pendingNotify.push({ kind: p.kind || 'info', t: ctx.currentTime }); });
  on('pop:arrive', () => at('arrivePop', null));
  on('pop:leave', () => at('leave', null));
  on('link:placed', (p) => at('thunk', p));
  on('link:built', (p) => major('chime', p));
  on('link:broken', (p) => major('snap', p));
  on('ship:built', (p) => major('horn1', p));
  on('ship:depart', (p) => at('depart', p));
  on('ship:arrive', (p) => at('arrive', p));
  on('contract:new', () => at('paper', null));
  on('contract:done', () => { major('coins', null); at('good', null); });
  on('contract:failed', () => major('bad', null));
  on('expedition:depart', () => at('depart', null));
  on('expedition:result', () => major('smallFanfare', null));
  on('island:discovered', () => major('shimmer', null));
  on('island:claimed', () => major('fanfare', null));
  on('storm:start', () => major('stormSwell', null));
  on('lightning', (p) => {
    if (p.lash) return;                 // the Lightning lash has its own sound (defend)
    const cam = app.cam, d = p.x != null ? Math.hypot(p.x - cam.x, p.y - cam.y) : 30;
    const q = place(p);
    if (p.shield) play('shieldHit', q);
    else if (p.rod || p.target != null) play('zap', { ...q, vol: q.vol * (p.rod ? 1 : 0.7) });
    const dn = clamp(d / 70);
    play('thunder', { pan: q.pan, distance: dn, at: ctx.currentTime + Math.min(2.6, 0.04 + d * 0.035), force: false });
  });
  on('raid:warn', () => major('horn', null));
  on('raid:start', () => major('raidStart', null));
  on('raid:end', () => major('relief', null));
  on('pirate:hit', (p) => at('clank', p));
  on('pirate:down', (p) => major('down', p));
  on('shot', (p) => { const n = p.kind in SHOT ? SHOT[p.kind] : (p.from === 'pirate' ? 'cannon' : 'harpoon'); if (n) at(n, p, p.kind === 'militia' ? { vol: 0.6 } : {}); });
  on('boom', (p) => at(BOOM[p.kind] || 'boom', p, { size: p.size || 1 }));
  on('ship:lost', (p) => major('down', p));
  on('link:damaged', (p) => at('clank', p));
  on('militia:launch', (p) => at('depart', p.m || null));
  on('shield:down', () => at('close', null));
  on('defend', (p) => major({ volley: 'volley', lash: 'lash', shield: 'shieldUp', militia: 'militia' }[p.action] || 'click', null));
  on('goal:step', () => at('good', null));
  on('goal:done', () => major('chime', null));
  on('chapter', () => major('bigFanfare', null));
  on('achievement', () => { major('shimmer', null); at('chime', null); });
  on('event', () => major('paper', null));
  on('won', () => major('bigFanfare', null));
  on('tod', (p) => { if (p.phase === 'dawn') at('morning', null); else if (p.phase === 'dusk') at('evening', null); });

  // ---- app bus (UI) -------------------------------------------------------------
  const ui = (ev, name) => app.ev?.on(ev, () => { if (live()) play(name); });
  ui('ui:click', 'click'); ui('ui:open', 'open'); ui('ui:close', 'close'); ui('ui:denied', 'denied'); ui('ui:tick', 'tick');
  app.ev?.on('ui:placement', (p) => { if (live() && p?.pending) play('tick'); });
  app.ev?.on('select', (p) => { if (live() && p?.id != null) play('tick'); });
  let prevScene = app.scene;
  app.ev?.on('scene', ({ scene }) => {
    if (live()) {
      const panel = (s) => s === 'research' || s === 'chart' || s === 'fleet' || s === 'settings' || s === 'paused';
      if (panel(scene) && !panel(prevScene)) play('open'); else if (!panel(scene) && panel(prevScene)) play('close');
    }
    prevScene = scene;
    apply();
  });

  // ---- per frame ----------------------------------------------------------------
  function chooseMood() {
    const G = app.G, s = app.scene;
    if (!G || s === 'title' || s === 'profiles' || s === 'loading') return 'title';
    if (s === 'won') return 'victory';
    if (G.raid && G.raid.phase !== 'retreat') return 'raid';
    if (G.weather?.kind === 'storm' && (G.weather.power ?? 1) > 0.25) return 'storm';
    const tod = G.tod ?? 0.5;
    return tod < 0.215 || tod > 0.79 ? 'night' : 'day';
  }

  function ambienceParams() {
    const G = app.G, cam = app.cam;
    const zN = clamp((cam.zoom - cam.minZoom) / (cam.maxZoom - cam.minZoom));
    const p = { wind: 0.3, gust: 0, rain: 0, waterfall: 0, wfPan: 0, fire: 0, firePan: 0, shield: 0, prop: 0, propPan: 0, pirate: 0, piratePan: 0, birds: 0, crickets: 0, creak: 0, creakPan: 0 };
    if (!G || !SIM_SCENES.has(app.scene) && app.scene !== 'paused' && app.scene !== 'won') { p.wind = 0.35; p.birds = 0.5; return p; }
    const w = G.weather || { kind: 'clear', power: 0 }, pw = w.power ?? 0.6;
    p.wind = 0.22 + (1 - zN) * 0.45 + ({ breeze: 0.18, storm: 0.45 * pw, rain: 0.1, fog: -0.08 }[w.kind] || 0);
    p.gust = w.kind === 'storm' ? pw : w.kind === 'breeze' ? 0.3 : 0;
    p.rain = w.kind === 'rain' ? 0.5 + 0.5 * pw : w.kind === 'storm' ? 0.6 + 0.4 * pw : 0;
    const tod = G.tod ?? 0.5;
    const day = tod > 0.22 && tod < 0.78 ? 1 : 0;
    const dawn = tod > 0.23 && tod < 0.36 ? 1.4 : 1;
    const wet = w.kind === 'storm' ? 0 : w.kind === 'rain' ? 0.25 : 1;
    p.birds = day * dawn * wet * (0.45 + 0.55 * zN);
    p.crickets = (1 - day) * wet * (0.5 + 0.5 * zN) * (tod > 0.8 || tod < 0.2 ? 1 : 0.4);
    const sc = (x, y, z) => { if (!Number.isFinite(x + y + z)) return { k: 0, pan: 0 }; const [sx, sy] = toScreen(cam, x, y, z); const hw = cam.w / 2, hh = cam.h / 2; const d = Math.hypot((sx - hw) / hw, (sy - hh) / hh); return { k: clamp(1.25 - d * 0.6), pan: clamp((sx - hw) / hw, -1, 1) * 0.7 }; };
    const home = G.islands.find((i) => i.id === 'hearthrock');
    if (home) { const q = sc(home.ox + home.w * 0.45, home.oy, home.alt - 2); p.waterfall = q.k * (0.35 + 0.65 * zN); p.wfPan = q.pan; }
    // fire
    let f = 0, fp = 0;
    for (const b of G.buildings) if (b.fire > 0) { const i = G.islands.find((x) => x.id === b.island); if (!i) continue; const q = sc(i.ox + b.u, i.oy + b.v, i.alt); f += b.fire * q.k; fp += q.pan * b.fire * q.k; }
    p.fire = clamp(Math.sqrt(f) * 0.6); p.firePan = f ? fp / f : 0;
    if (G.defend?.shield?.on) { const i = G.islands.find((x) => x.id === G.defend.shield.island) || home; p.shield = i ? 0.4 + 0.6 * sc(i.ox + i.w / 2, i.oy + i.h / 2, i.alt).k : 0.6; }
    let s = 0, sp = 0;
    for (const o of G.ships || []) if (o.x != null && o.state !== 'docked') { const q = sc(o.x, o.y, o.z || 0); s += q.k; sp += q.pan * q.k; }
    p.prop = clamp(s * 0.5); p.propPan = s ? sp / s : 0;
    s = 0; sp = 0;
    for (const o of G.pirates || []) if (o.x != null && o.hp > 0) { const q = sc(o.x, o.y, o.z || 0); s += q.k * (o.kind === 'dreadnought' ? 2.5 : 1); sp += q.pan * q.k; }
    p.pirate = clamp(s * 0.45); p.piratePan = s ? sp / s : 0;
    let c = 0, cp = 0;
    for (const l of G.links || []) if (l.kind === 'cable' && l.state === 'built') { const q = sc(...(worldPos({ l }) || [0, 0, 0])); c += q.k; cp += q.pan * q.k; }
    p.creak = clamp(c * 0.6, 0, 1.5) * (0.4 + 0.6 * zN); p.creakPan = c ? cp / c : 0;
    return p;
  }

  let hammerT = 0;
  function construction(dt) {
    const G = app.G; if (!G || !SIM_SCENES.has(app.scene) || !G.speed) return;
    const sites = G.buildings.filter((b) => b.state === 'site');
    if (!sites.length) return;
    hammerT -= dt * Math.sqrt(G.speed);
    if (hammerT > 0) return;
    hammerT = 0.22 + Math.random() * 0.5 / Math.min(3, Math.sqrt(sites.length));
    const b = sites[(Math.random() * sites.length) | 0];
    const q = place({ b });
    if (q.vol > 0.3) play(Math.random() < 0.08 ? 'saw' : 'hammer', { ...q, vol: q.vol * 0.8 });
  }

  function update(realDt) {
    frameEvents = 0;
    if (!E) return;
    if (ctx.state !== 'running') return;
    const dt = Math.min(0.1, realDt || 0);
    pollT -= dt;
    if (pollT <= 0) { pollT = 0.5; const sig = JSON.stringify([settingsNow(), app.scene]); if (sig !== volSig) apply(); }
    // mood with a little hysteresis (urgent moods switch at once)
    const want = chooseMood();
    if (want !== moodWant) { moodWant = want; moodT = 0; }
    moodT += dt;
    const urgent = want === 'raid' || want === 'victory' || !E.music.mood;
    if (want !== E.music.mood && (urgent || moodT > 2.5)) E.music.setMood(want, { fade: want === 'title' && !E.music.mood ? 1.5 : 3.5 });
    E.music.schedule(0.6);
    E.amb.update(dt, ambienceParams());
    construction(dt);
    // notification blips, unless a bigger sound just covered the same moment
    while (pendingNotify.length) {
      const n = pendingNotify.shift();
      if (ctx.currentTime - lastMajor > 0.5 && n.t > lastMajor + 0.01) play({ info: 'info', good: 'good', warn: 'warn', bad: 'bad' }[n.kind] || 'info');
    }
  }

  function debug() {
    return {
      state: ctx ? ctx.state : 'none', muted: muteFlag, mood: E?.music.mood || null, sampleRate: ctx?.sampleRate,
      meter: E ? E.meter() : null, sfx: E ? E.sfx.names : [],
    };
  }

  const api = { update, unlock, apply, play, debug, get engine() { return E; }, get ctx() { return ctx; } };
  return api;
}
