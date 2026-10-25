// Loomwake audio: public API.
//
//   initAudio()                 create/resume the AudioContext (call from a user gesture; safe to repeat)
//   attachAudio(bus, G)         subscribe to the game's bus; drives sfx, voices, music and ambience
//   sfx(name, opts)             play a sound: opts { x, y (world, for pan), vol, pitch, delay, dur, ... }
//   music.set(track, { intensity, phase, fade })   choose a track (null = silence)
//   music.intensity(i), music.phase(p), music.stop(fade), music.track(), music.auto(on)
//   voice(speaker, text, opts)  dialogue blips; returns { dur }
//   stopVoice()
//   setVolumes({ master, music, sfx, voice })  0..1 each
//   mute(on)                    master mute
//   audioState()                debug snapshot { running, track, intensity, phase, room, voices, level, ... }
//
// Every entry point is a no-op until initAudio() has run (and when Web Audio
// is missing), so the game never has to guard calls. The music director in
// this file picks tracks from G.scene, the region, and bosses, and raises the
// combat stems while foes are alive; a manual music.set() holds until the
// game state changes.
import { createEngine, setRoom, applyVolumes, muffleMusic, duckMusic, clamp } from './core.js';
import { playSfx, SFX, SFX_ALIASES, patronKey } from './sfx.js';
import { createMusic, TRACK_IDS } from './music.js';
import { REGION_ROOT } from './tracks.js';
import { speak, stopVoice as stopV, VOICE_IDS } from './voice.js';
import { createAmbience } from './ambience.js';
import { bakeStep } from './bank.js';

const S = {
  E: null, M: null, amb: null, bus: null, G: null, timer: null, failed: false,
  vol: { master: 0.85, music: 0.7, sfx: 0.9, voice: 0.85 }, muted: false,
  pending: null, auto: true, lastWant: '', want: null,
  boss: { id: null, phase: 1, active: false, done: false }, enterT: 0, holdUntil: 0, warned: false, armor: new WeakMap(),
  lastDash: -9, lastBeat: 0, brokeAt: new WeakSet(), sawWindup: false, ending: null, dom: false, foes: 0, clearT: -9, offs: [], gestures: false, muffle: 20000, scene: null,
};
const LOOK = 0.3, LOOK_HIDDEN = 1.6;

try { if (typeof location !== 'undefined' && /[?&]mute\b/.test(location.search)) S.muted = true; } catch (e) {}

// ---------------------------------------------------------------- init
export function initAudio() {
  if (S.failed) return false;
  if (S.E) {
    const c = S.E.ctx;
    if (c.state === 'suspended' && !(typeof document !== 'undefined' && document.hidden)) c.resume().catch(() => {});
    return true;
  }
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) { S.failed = true; return false; }
  try {
    const ctx = new AC({ latencyHint: 'interactive' });
    S.E = createEngine(ctx, { room: 'hub' });
    S.E.vol = S.vol; S.E.muted = S.muted; S.E.G = S.G;
    applyVolumes(S.E);
    S.M = createMusic(S.E);
    S.amb = createAmbience(S.E);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    S.timer = setInterval(tick, 50);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    if (S.pending) { const [id, o] = S.pending; S.pending = null; S.M.set(id, o); }
    S.lastWant = '';
    tick();
  } catch (e) {
    console.warn('Loomwake: no sound', e);
    S.E = null; S.failed = true; return false;
  }
  return true;
}

function onVis() {
  if (!S.E) return;
  // keep scheduling far enough ahead to survive background timer throttling;
  // suspend entirely when hidden (saves battery; the game pauses too)
  if (document.hidden) S.E.ctx.suspend().catch(() => {});
  else S.E.ctx.resume().catch(() => {});
}

function tick() {
  const E = S.E; if (!E) return;
  const now = E.now();
  const look = typeof document !== 'undefined' && document.hidden ? LOOK_HIDDEN : LOOK;
  if (S.G) direct(now);
  if (S.muted) { bakeStep(E, 2); return; } // nothing to hear: skip scheduling (the scheduler skips ahead on unmute)
  S.M.tick(now + look);
  S.amb.tick(now);
  bakeStep(E, 4);
}

// ---------------------------------------------------------------- api
const W = () => (S.G && S.G.hero) || null;
function spatial(o) {
  if (!o || o.x == null || o.pan != null) return o || {};
  const h = W(); if (!h) return o;
  const dx = o.x - h.x, dy = (o.y ?? h.y) - h.y;
  const d = Math.hypot(dx, dy);
  return { ...o, pan: clamp(dx / 650, -0.8, 0.8), vol: (o.vol ?? 1) * clamp(1.15 - d / 1800, 0.45, 1) };
}
export function sfx(name, opts = {}) {
  if (!S.E || S.muted && !S.E.offline) return 0;
  return playSfx(S.E, name, spatial(opts));
}
export function voice(speaker, text, opts = {}) {
  if (!S.E || S.muted) return { dur: 0 };
  try { return speak(S.E, speaker, text, opts); } catch (e) { return { dur: 0 }; }
}
export function stopVoice() { if (S.E) stopV(S.E); }

export const music = {
  set(track, o = {}) {
    if (!S.E) { S.pending = [track, o]; return; }
    S.M.set(track, o);
  },
  intensity(i) { if (S.M) S.M.intensityTo(i); },
  phase(p) { if (S.M) S.M.phaseTo(p); },
  stop(fade = 1) { if (S.M) S.M.stopAll(fade); },
  track() { return S.M ? S.M.track() : (S.pending ? S.pending[0] : null); },
  auto(on = true) { S.auto = !!on; S.lastWant = ''; },
  tracks: () => TRACK_IDS(),
};

export function setVolumes(v = {}) {
  for (const k of ['master', 'music', 'sfx', 'voice']) if (v[k] != null && isFinite(v[k])) S.vol[k] = clamp(+v[k], 0, 1);
  if (S.E) { S.E.vol = S.vol; applyVolumes(S.E); }
  return { ...S.vol };
}
export function getVolumes() { return { ...S.vol }; }
export function mute(on = true) {
  S.muted = !!on;
  if (S.E) { S.E.muted = S.muted; applyVolumes(S.E); }
  return S.muted;
}
export function audioState() {
  const E = S.E;
  let level = 0;
  if (E && E.analyser) { const a = new Float32Array(E.analyser.fftSize); E.analyser.getFloatTimeDomainData(a); let s = 0; for (const x of a) s += x * x; level = Math.sqrt(s / a.length); }
  return {
    running: !!E && E.ctx.state === 'running', state: E ? E.ctx.state : 'none', failed: S.failed, muted: S.muted,
    track: music.track(), intensity: S.M ? S.M.intensity : null, phase: S.M ? S.M.phase : null, room: E ? E.room : null,
    ambience: S.amb ? S.amb.id : null, voices: E ? E.live.filter((v) => v.end > E.now()).length : 0,
    stats: E ? { ...E.stats } : null, level, boss: { ...S.boss }, volumes: { ...S.vol },
  };
}
export const sfxNames = () => Object.keys(SFX);
export const voiceIds = () => VOICE_IDS();
export { SFX_ALIASES };

// ---------------------------------------------------------------- director
const OVERLAY = new Set(['paused', 'settings', 'codex', 'dialogue', 'boons', 'shop', 'fountain', 'loading']);
const BOSSES = ['veyl', 'morrow', 'aurum', 'sable'];
const bossKey = (id) => { const s = String(id ?? '').toLowerCase(); return BOSSES.find((b) => s.includes(b)) || null; };
const regionOf = (G) => {
  const r = (G.chamber && G.chamber.region) || (G.run && G.run.region) || 'glasswood';
  return ['glasswood', 'choir', 'forge', 'unwoven'].includes(r) ? r : (String(r).includes('choir') ? 'choir' : String(r).includes('forge') ? 'forge' : String(r).includes('unwov') ? 'unwoven' : 'glasswood');
};
function liveFoes(G) {
  let n = 0, elite = false;
  for (const f of G.foes || []) if (f && !f.dead && f.team !== 'hero' && (f.hp == null || f.hp > 0)) { n++; if (f.elite || f.tier === 'elite' || /hulk|brute/.test(f.kind || '')) elite = true; }
  return { n, elite };
}
function trueEnding(G) {
  if (S.ending) return S.ending === 'true';
  if (G.ending && G.ending.kind) return G.ending.kind === 'true';
  const m = G.meta || {}, s = m.story || m.flags || {};
  return !!(m.trueEnding || s.trueEnding || s.true_ending || (G.ui && G.ui.ending === 'true') || (G.run && G.run.ending === 'true'));
}

function desire(G, now) {
  // hold the silence after a boss falls so the defeat sting can ring
  if (S.holdUntil && now < S.holdUntil) return null;
  const sc = G.scene;
  if (sc === 'loading') return null;
  if (sc === 'title' || sc === 'profiles') return { track: 'title', i: 0.5 };
  if (sc === 'ending') return { track: trueEnding(G) ? 'ending_true' : 'ending', i: 0.5 };
  if (sc === 'dead') return { track: null };
  if (OVERLAY.has(sc) && !G.run && S.want) return null; // keep whatever is playing
  if (!G.run || sc === 'hub') return { track: 'hub', i: 0.5 };
  if (sc === 'victory') return { track: regionOf(G), i: 0.15 };
  const region = regionOf(G);
  const kind = G.chamber && G.chamber.kind;
  // boss fallback: a live boss without an intro event still gets its theme
  if (!S.boss.active && !S.boss.done && G.boss && !G.boss.dead && now - S.enterT > 2.5) {
    const k = bossKey(G.boss.kind || G.boss.id); if (k) { S.boss.id = k; S.boss.active = true; }
  }
  if (S.boss.intro && !S.boss.active && !S.boss.done) {
    if (now - S.boss.intro > 7) S.boss.active = !!S.boss.id; // no bossFight event: start anyway
    else return { track: null }; // the title card and the intro line, in a hush
  }
  if (S.boss.active && S.boss.id) {
    const ph = (G.boss && G.boss.phase) || S.boss.phase || 1;
    return { track: 'boss_' + S.boss.id, i: ph >= 2 ? 1 : 0.8, phase: ph };
  }
  if (kind === 'memory') return { track: 'memory', i: 0.5 };
  if (kind === 'boss' && !S.boss.done) return { track: region, i: 0.08 }; // the hush before the title card
  if (kind === 'shop' || kind === 'fountain' || kind === 'hub') return { track: region, i: 0.08 };
  const { n, elite } = liveFoes(G);
  if (n > 0) return { track: region, i: clamp(0.6 + n * 0.045 + (elite ? 0.25 : 0), 0, 1) };
  return { track: region, i: now - S.clearT < 1.5 ? 0.55 : 0.2 };
}

function direct(now) {
  const G = S.G;
  // music
  if (S.auto) {
    const d = desire(G, now);
    if (d) {
      const key = d.track + '|' + (d.phase || 1);
      if (key !== S.lastWant) {
        S.lastWant = key; S.want = d.track;
        S.M.set(d.track, { intensity: d.i, phase: d.phase || 1, fade: d.track && d.track.startsWith('boss_') ? 0.8 : 2.2 });
      } else if (d.i != null && Math.abs(d.i - S.M.intensity) > 0.04) S.M.intensityTo(d.i);
    }
  }
  // muffle the music under menus; a little under dialogue; a heartbeat at low health
  const sc = G.scene;
  let f = 20000;
  if (sc === 'paused' || sc === 'settings' || sc === 'codex') f = 750;
  else if (sc === 'dialogue' || sc === 'boons' || sc === 'shop') f = 4200;
  const h = G.hero;
  const low = h && G.run && sc === 'run' && h.maxHp > 0 && h.hp > 0 && h.hp / h.maxHp < 0.3;
  if (low && f > 2600) f = 2600;
  if (f !== S.muffle) { S.muffle = f; muffleMusic(S.E, f, f < 2000 ? 0.12 : 0.4); }
  if (low && now - S.lastBeat > 0.95) { S.lastBeat = now; playSfx(S.E, 'heartbeat', { vel: 0.6 + 0.4 * (1 - h.hp / (h.maxHp * 0.3)) }); }
  // ambience follows the place
  const amb = !G.run || sc === 'hub' ? (sc === 'title' || sc === 'profiles' ? 'title' : 'hub') : regionOf(G);
  if (sc !== 'ending') S.amb.set(amb); else S.amb.set(null);
}

// ---------------------------------------------------------------- events
// Event map. The sim's own vocabulary (see the headers of sim/run.js,
// sim/combat.js, sim/enemies/brain.js, sim/bosses/common.js) plus the brief's.
function materialOf(e) {
  const k = String(e.kind || e.art || '').toLowerCase();
  if (/veyl|glass|thorn|crystal/.test(k)) return 'glass';
  if (/aurum|gold/.test(k)) return 'gold';
  if (/hulk|loom|brute|bellows/.test(k)) return (e.armor > 0 ? 'armor' : 'wood');
  if (/stone|statue|golem/.test(k)) return 'stone';
  if (e.armor > 0 || /knight|warden|thrall|sable/.test(k)) return 'armor';
  return 'thread';
}
const ownerOf = (G, o) => (o && typeof o === 'object' ? o : (G.foes || []).find((f) => f.id === o) || null);
const isBoss = (G, e) => !!e && (e === G.boss || !!e.boss || e.tier === 'boss' || e.isBoss === true);
const at = (p, e) => ({ x: p.x ?? (e && e.x), y: p.y ?? (e && e.y) });

// enemy wind-ups by attack id (sim/enemies: foeWindup {e, atk}, wind-up length e.stDur)
const TELL = {
  clawLunge: 'tell_claw', twinRake: 'tell_claw', spoolSlash: 'tell_claw', bite: 'tell_leap',
  overheadSlam: 'tell_heavy', doubleSlam: 'tell_heavy', shardSlam: 'tell_heavy', backSweep: 'tell_heavy',
  censerSwing: 'tell_heavy', censerSlam: 'tell_heavy', censerSpin: 'tell_heavy', hammerSwing: 'tell_heavy',
  needleFan: 'tell_cast', needleStorm: 'tell_cast', snareThread: 'tell_cast', twinThread: 'tell_cast',
  songRing: 'tell_song', canon: 'tell_song', leap: 'tell_leap', doubleLeap: 'tell_leap',
  hammerLob: 'tell', tripleLob: 'tell', groundSlam: 'tell_slam', quake: 'tell_slam', charge: 'tell_charge',
  fireBreath: null, fireSweep: null, // the inhale is the tell (foeInhale)
  echoDash: 'tell', echoChain: 'tell', echoCombo: 'tell',
};
const SLAMS = new Set(['overheadSlam', 'doubleSlam', 'shardSlam', 'censerSlam', 'groundSlam', 'quake']);
function tellByKind(k, tgKind) {
  if (/hollow|thornling/.test(k)) return 'tell_claw';
  if (/knight|warden/.test(k)) return 'tell_heavy';
  if (/needle|caster|unspool/.test(k)) return 'tell_cast';
  if (/snarl|wolf/.test(k)) return 'tell_leap';
  if (/hulk|brute|bellows/.test(k)) return tgKind === 'line' ? 'tell_charge' : 'tell_slam';
  if (/chorist|choir/.test(k)) return 'tell_song';
  return 'tell';
}

// boss moves (bossMove {id, move, pose: wind|act|rec}) -> the sound on 'act'
const BOSS_ACT = {
  veyl: { volley: 'veyl_volley', claw: 'veyl_claw', burrow: 'veyl_ring', ring: 'veyl_ring', verdict: 'veyl_thorns', summon: 'veyl_summon' },
  morrow: { ring: 'morrow_ring', sweep: 'morrow_lantern', notes: 'song_ring', summon: 'morrow_summon', sink: 'morrow_flood', choir: 'morrow_choir', flood: 'morrow_flood', requiem: 'morrow_choir' },
  aurum: { sweep: 'aurum_sweep', anvil: 'hammer_throw', breath: 'aurum_breath', heat: 'aurum_heat', pour: 'aurum_hiss' },
  sable: { lunge: 'sable_lunge', snare: 'sable_snare', riposte: 'sable_lunge', echoes: 'sable_echo', dash: 'sable_dash', mirror: 'sable_thread', storm: 'sable_thread' },
};
// where something lands (bossImpact {id, item})
const BOSS_IMPACT = { glass: 'veyl_shatter', lanes: 'veyl_thorns', emerge: 'veyl_thorns', anvil: 'aurum_anvil', hammer: 'aurum_hammer', sweep: 'slam', note: 'morrow_ring', ring: 'morrow_ring', riposte: 'hit_armor' };
// set pieces (bossSetPiece {id, name})
const BOSS_SET = {
  veyl: { thornEdge: 'veyl_ring', verdict: 'veyl_thorns' },
  morrow: { choir: 'morrow_choir', requiem: 'morrow_choir', chorus: 'morrow_summon', flood: 'morrow_flood' },
  aurum: { stoke: 'aurum_heat', pour: 'aurum_hiss', heat: 'aurum_heat' },
  sable: { unmask: 'sable_unmask', unravel: 'sable_thread', storm: 'sable_thread' },
};
const BOSS_ROOT = { veyl: 33, morrow: 36, aurum: 29, sable: 35 };

const UI_MAP = { buy: 'purchase', purchase: 'purchase', reroll: 'reroll', select: 'ui_confirm', equip: 'ui_confirm', upgrade: 'ui_upgrade', deny: 'ui_error', locked: 'ui_error' };
const ui = (p) => {
  if (p && p.toast) return sfx('ui_tick', { vol: 1.5 });
  if (p && p.station) return sfx('ui_hover', { vol: 1.5 });
  if (p && p.prompt) return;
  const n = typeof p === 'string' ? p : p && (p.sfx || p.type || p.kind || p.action || p.name);
  if (!n) return;
  const name = UI_MAP[n] || (SFX['ui_' + n] ? 'ui_' + n : SFX[n] ? n : null);
  if (name) sfx(name, p && typeof p === 'object' ? p : {});
};

// DOM interface sounds by delegation: any button or [data-sfx] in the page.
// data-sfx="none" silences an element; data-sfx="<name>" picks the click sound.
function domSounds() {
  if (typeof document === 'undefined' || S.dom) return;
  S.dom = true;
  const target = (ev) => ev.target && ev.target.closest && ev.target.closest('button, [role="button"], [data-sfx], [data-boon], [data-shop], [data-profile], a, input[type="range"], input[type="checkbox"], select');
  let lastHover = null;
  document.addEventListener('pointerover', (ev) => {
    const el = target(ev); if (!el || el === lastHover) return; lastHover = el;
    if (el.dataset.sfx === 'none' || el.disabled) return;
    sfx('ui_hover');
  }, true);
  document.addEventListener('click', (ev) => {
    const el = target(ev); if (!el || el.dataset.sfx === 'none') return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return sfx('ui_error');
    if (el.dataset.sfx) return sfx(el.dataset.sfx);
    if (el.matches('[data-boon]')) return sfx('ui_confirm');
    if (el.matches('[data-shop]')) return; // shopBuy plays the purchase
    if (el.matches('input[type="range"]')) return;
    if (/back|close|resume|leave|cancel/i.test(el.id || '')) return sfx('ui_back');
    sfx('ui_click');
  }, true);
  document.addEventListener('input', (ev) => { const el = ev.target; if (el && el.type === 'range' && el.dataset.sfx !== 'none') sfx('ui_slider', { value: (+el.value - +(el.min || 0)) / ((+(el.max || 1) - +(el.min || 0)) || 1) }); }, true);
  document.addEventListener('focusin', (ev) => { const el = target(ev); if (el && el !== lastHover && el.dataset.sfx !== 'none') { lastHover = el; sfx('ui_hover'); } }, true);
}

function applySettings(G) {
  const v = G && G.settings && G.settings.volume;
  if (v && typeof v === 'object') setVolumes(v);
  const m = G && G.settings && (G.settings.mute ?? (G.settings.audio && G.settings.audio.mute));
  if (m != null) mute(!!m);
}

export function attachAudio(bus, G) {
  if (S.bus) for (const off of S.offs) try { off(); } catch (e) {}
  S.offs = []; S.bus = bus; S.G = G;
  if (S.E) S.E.G = G;
  applySettings(G);
  const on = (type, fn) => { if (bus && bus.on) S.offs.push(bus.on(type, (p) => { try { fn(p || {}); } catch (e) { if (!S.warned) { S.warned = true; console.warn('Loomwake audio event', type, e); } } })); };
  const now = () => (S.E ? S.E.now() : 0);

  // gestures unlock audio (main.js also calls initAudio from its own handlers)
  if (!S.gestures && typeof window !== 'undefined') {
    S.gestures = true;
    const unlock = () => { initAudio(); if (S.E && S.E.ctx.state === 'running') for (const ev of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(ev, unlock, true); };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, true);
    window.addEventListener('gamepadconnected', () => initAudio());
  }
  domSounds();

  // ---- Iri
  on('swing', (p) => {
    const w = String(p.weapon || 'blade').toLowerCase(), c = p.combo | 0;
    if (w.includes('spear')) sfx(p.spin || p.heavy || c >= 2 ? 'swing3' : 'spear', { pitch: p.spin ? 0.8 : p.heavy ? 0.9 : 1 });
    else if (w.includes('bow')) sfx('bow', { vel: 0.7 + 0.3 * Math.min(1, p.charge ?? 1) });
    else if (w.includes('gaunt') || w.includes('fist')) sfx(p.heavy || c >= 3 ? 'swing3' : 'punch', { pitch: (p.fist ? 1.06 : 1) * (1 + (c % 3) * 0.04) });
    else if (w.includes('chakram') || w.includes('bobbin')) sfx('chakram', { pitch: c === 3 ? 1.15 : 1 });
    else sfx(p.heavy || c >= 2 ? 'swing3' : c === 1 ? 'swing2' : 'swing1', { pitch: p.thrust ? 1.1 : 1 });
  });
  on('weaponFx', (p) => {
    const w = String(p.weapon || ''), f = p.fx, pos = at(p);
    const M = {
      spear: { throw: 'spear_throw', recall: ['snare_recall', { pitch: 0.8 }], stick: 'spear_stick', thorns: 'thorn_burst', catch: ['chakram_catch', { pitch: 0.7 }] },
      bow: { perfect: 'bow_perfect', nock: 'bow_draw', full: 'charge_full', volley: ['bow', { pitch: 1.1 }], split: ['bow_perfect', { vel: 0.6 }], arrowWall: 'arrow_wall', hymn: 'hymn' },
      chakram: { return: 'chakram_return', hover: ['chakram', { vel: 0.5 }], ricochet: 'chakram_ricochet', catch: 'chakram_catch', spin: 'chakram_spin' },
      gauntlets: { fray: 'proc_shade', comet: 'comet', uppercut: 'uppercut', leap: 'leap', slam: 'slam' },
    }[w];
    const m = M && M[f];
    if (!m) return;
    if (Array.isArray(m)) sfx(m[0], { ...pos, ...m[1] }); else sfx(m, pos);
  });
  on('special', () => sfx('special'));
  on('snare', () => sfx('snare_throw'));
  on('snareHit', (p) => { if (p.boss) sfx('sable_snare'); else sfx('snare_hit', at(p)); });
  on('snareBind', (p) => sfx('bind', at(p)));
  on('snareRecall', (p) => sfx('snare_recall', { pitch: p.heavy ? 0.85 : 1 }));
  on('snareBack', () => sfx('snare_recall', { vel: 0.6, pitch: 1.2 }));
  on('dash', () => { const t = now(); sfx('dash', { chained: t - S.lastDash < 0.45 }); S.lastDash = t; });
  on('dodge', () => sfx('dodge'));
  on('wardHit', () => sfx('ward'));
  on('call', (p) => sfx('call_' + (patronKey(p.patron) || 'dawn')));
  on('callReady', () => sfx('call_ready'));
  on('heroHurt', (p) => sfx('hero_hurt', { vel: clamp(0.7 + (p.dmg || 0) / 40, 0.7, 1.3) }));
  on('hazard', (p) => { const k = String(p.kind || ''); sfx(/molten|fire/.test(k) ? 'sizzle' : /thorn|spike/.test(k) ? 'thorn_burst' : /water|flood/.test(k) ? 'proc_tide' : 'hit_stone', at(p)); });
  on('heroDeath', () => { sfx('death_sting'); if (S.M) S.M.stopAll(0.6); S.lastWant = 'dead'; });
  on('deathDefiance', () => sfx('death_defy'));
  on('deathDefy', () => sfx('death_defy'));
  on('heal', (p) => sfx('heal', { vel: (p.n ?? 20) < 10 ? 0.6 : 1 }));
  on('respawn', () => sfx('respawn'));
  on('fall', (p) => { if (p.who === 'hero') sfx('fall'); else sfx('fall', { ...at(p, p.e), vel: 0.6, pitch: 1.2 }); });
  on('slam', (p) => sfx('wall_slam', at(p, p.e)));
  on('shield', () => sfx('shield'));
  on('cloak', () => sfx('cloak'));

  // ---- boons and powers
  on('power', (p) => {
    const pos = at(p);
    const m = { arc: 'chain', zap: 'chain', crackle: 'proc_storm', quake: ['call_stone', { vel: 0.45 }], spike: 'proc_stone', cloak: 'cloak', heal: ['heal', { vel: 0.6 }], wave: ['proc_tide', { vel: 1.3 }] }[p.fx];
    if (!m) return;
    if (Array.isArray(m)) sfx(m[0], { ...pos, ...m[1] }); else sfx(m, pos);
  });
  on('powerSpawn', (p) => {
    const k = p.p && p.p.kind, pos = at(p.p || {});
    const m = { cyclone: 'call_wind', vortex: 'proc_shade', rift: 'cloak', riptide: 'proc_tide', sunspot: 'proc_dawn', molten: 'sizzle', mud: 'proc_stone', strike: 'proc_storm', ring: 'proc_dawn', wave: 'proc_tide' }[k];
    if (m) sfx(m, { ...pos, vel: k === 'cyclone' ? 0.45 : 0.8 });
  });
  on('boon', (p) => {
    if (p.kind === 'temper') return sfx('ui_upgrade');
    if (p.knot || p.upgrade) return sfx('pickup_knot');
    sfx('boon_take', { patron: p.patron || (p.patrons && p.patrons[0]) || p.id });
    if (p.braid || p.legendary) sfx('card', { rarity: 'mythic', delay: 0.25, vel: 0.7 });
  });
  on('boonLevel', () => sfx('pickup_knot'));
  on('offer', (p) => {
    const list = (p && (p.cards || p.offer)) || G.offer || [];
    sfx(p.reroll ? 'reroll' : 'offer');
    list.forEach((c, i) => sfx('card', { rarity: c && (c.braid ? 'mythic' : c.rarity), delay: 0.12 + i * 0.12 }));
  });
  on('reroll', () => sfx('reroll'));
  on('shopBuy', () => sfx('purchase'));
  on('purchase', () => sfx('purchase'));
  on('pickup', (p) => { const k = String(p.kind || ''); sfx(SFX['pickup_' + k] ? 'pickup_' + k : 'pickup', at(p)); });
  on('fountain', () => sfx('fountain'));
  on('memory', () => sfx('pickup_memory'));
  on('upgrade', () => sfx('ui_upgrade'));

  // ---- the Unravelled
  on('hit', (p) => {
    const e = p.target; if (!e || e === G.hero || e.team === 'hero') return;
    if (p.quiet && !p.crit) return; // damage-over-time ticks
    const pos = at(p, e);
    const vel = clamp(0.55 + (p.dmg || 0) / 60, 0.5, 1.3);
    const mat = materialOf(e);
    sfx('hit_' + mat, { ...pos, vel });
    if (p.crit) sfx('crit', pos);
    const el = patronKey(p.element) || (p.element === 'fire' || p.element === 'molten' ? 'fire' : null);
    if (el && p.kind !== 'call') sfx('proc_' + el, { ...pos, vel: 0.7 });
    // armour break, if the sim did not send armorBreak for it
    const prev = S.armor.get(e);
    if (prev > 0 && !(e.armor > 0) && !S.brokeAt.has(e)) sfx('armor_break', { ...pos, material: mat === 'glass' ? 'glass' : 'armor' });
    S.armor.set(e, e.armor || 0);
  });
  on('armorBreak', (p) => { const e = p.e || p.target; if (e) { S.armor.set(e, 0); S.brokeAt.add(e); } sfx('armor_break', { ...at(p, e), material: e && materialOf(e) === 'glass' ? 'glass' : 'armor' }); });
  on('stagger', (p) => sfx('stagger', at(p, p.e)));
  on('status', (p) => { if (p.name === 'bound') sfx('bind', at(p, p.e)); else if (p.name === 'blind') sfx('proc_dawn', { ...at(p, p.e), vel: 0.6 }); });
  on('kill', (p) => {
    const e = p.e || p.target; if (!e || p.boss || isBoss(G, e)) return;
    const pos = at(p, e), k = String(e.kind || '').toLowerCase();
    if (p.elite || e.elite || /hulk|brute/.test(k)) sfx('unravel_elite', pos); else sfx('unravel', { ...pos, vel: p.noReward ? 0.6 : 1 });
    if (/thornling/.test(k)) sfx('thorn_burst', pos);
    if (/glass/.test(k)) sfx('veyl_shatter', { ...pos, vel: 0.6 });
  });
  on('spawn', (p) => { const e = p.e; if (!e || isBoss(G, e) || e.team === 'hero') return; sfx('spawn', at(p, e)); });
  on('foeRise', (p) => {
    const e = p.e; if (!e) return;
    const pos = at(p, e), k = String(e.kind || '').toLowerCase(), r = Math.random();
    if (/hollow|thornling/.test(k) && r < 0.4) sfx('rasp', pos);
    else if (/knight|warden|thrall/.test(k) && r < 0.6) sfx('clank', pos);
    else if (/snarl/.test(k) && r < 0.6) sfx('growl', pos);
    else if (/hulk|brute/.test(k)) sfx('roar', { ...pos, vel: 0.6 });
  });
  on('foeWindup', (p) => {
    const e = p.e; if (!e) return;
    S.sawWindup = true;
    const pos = at(p, e), k = String(e.kind || '').toLowerCase();
    const name = p.atk in TELL ? TELL[p.atk] : tellByKind(k);
    if (name) sfx(name, { ...pos, dur: e.stDur || 0.5, vel: e.elite ? 1.15 : 1 });
  });
  on('telegraph', (p) => {
    const tg = p.tg || p; if (!tg || tg.live) return;
    const pos = { x: tg.x, y: tg.y }, dur = clamp(tg.max ?? tg.t ?? 0.5, 0.2, 2.2);
    if (tg.sfx === false) return;
    if (typeof tg.sfx === 'string') return sfx(tg.sfx, { ...pos, dur });
    if (tg.boss || bossKey(tg.owner) || isBoss(G, ownerOf(G, tg.owner))) return sfx('tell_boss', { ...pos, dur, vel: 0.8 });
    if (S.sawWindup) return; // foes: foeWindup already played the tell
    const o = ownerOf(G, tg.owner);
    sfx(tellByKind(String((o && o.kind) || '').toLowerCase(), tg.kind), { ...pos, dur });
  });
  on('foeSwing', (p) => {
    const e = p.e; if (!e) return;
    const pos = at(p, e), a = p.atk || '';
    if (a === 'echoCombo') return sfx(['swing1', 'swing2', 'swing3'][(p.combo | 0) % 3], { ...pos, pitch: 0.78, vel: 0.8 });
    if (/claw|rake|spool/i.test(a)) return sfx('claw', pos);
    if (a === 'bite') { sfx('claw', { ...pos, pitch: 0.8 }); return sfx('growl', { ...pos, vel: 0.6 }); }
    if (/censer/i.test(a)) return sfx('censer', pos);
    sfx('foe_swing', { ...pos, pitch: /hammer/i.test(a) ? 0.8 : 1 });
  });
  on('foeImpact', (p) => {
    const pos = at(p), k = String(p.kind || '').toLowerCase(), pw = p.power ?? 1;
    if (k === 'thorns') return sfx('thorn_burst', pos);
    if (k === 'hammer') { sfx('slam', { ...pos, vel: 0.7 }); return sfx('hit_gold', { ...pos, vel: 0.7 }); }
    sfx('slam', { ...pos, vel: clamp(0.5 + pw * 0.5, 0.5, 1.2) });
    if (pw >= 1 || /hulk|brute|knight/.test(k)) sfx('shockwave', { ...pos, vel: 0.7 });
  });
  on('foeHum', (p) => sfx('clank', at(p, p.e)));
  on('foeCast', (p) => { const a = p.atk || ''; if (/thread/i.test(a)) sfx('pull', at(p, p.e)); else sfx('needle', at(p, p.e)); });
  on('foeSing', (p) => sfx('song_ring', at(p, p.e)));
  on('foeLeap', (p) => sfx('leap', at(p, p.e)));
  on('foeThrow', (p) => sfx('hammer_throw', at(p, p.e)));
  on('foeInhale', (p) => sfx('inhale', { ...at(p, p.e), dur: (p.e && p.e.stDur) || 0.6 }));
  on('foeBreath', (p) => sfx('fire_breath', at(p, p.e)));
  on('foeRoar', (p) => sfx('roar', at(p, p.e)));
  on('foeEnrage', (p) => sfx('roar', { ...at(p, p.e), pitch: 0.9 }));
  on('foeDash', (p) => sfx('foe_dash', at(p, p.e)));
  on('foeBlink', (p) => sfx('teleport', at(p, p.e)));
  on('foeSnare', (p) => sfx('pull', at(p, p.e)));
  on('foeSnareBreak', (p) => sfx('snap', at(p, p.e)));
  on('projectile', (p) => {
    const q = p.p || p; if (!q) return;
    const k = String(q.kind || q.style || '').toLowerCase(), pos = { x: q.x, y: q.y };
    if (q.team === 'hero') { if (/arrow|bolt/.test(k)) sfx('arrow', pos); return; }
    if (/needle/.test(k)) sfx('needle', pos);
    else if (/anvil/.test(k)) sfx('hammer_throw', { ...pos, pitch: 0.7 });
    else if (/hammer/.test(k)) sfx('hammer_throw', pos);
    else if (/glass|shard|thorn/.test(k)) sfx('needle', { ...pos, pitch: 1.25, vel: 0.8 });
    else if (/song|ring|wave|note/.test(k)) sfx('song_ring', pos);
    else if (/fire|flame|ember/.test(k)) sfx('fire_breath', { ...pos, vel: 0.5 });
    else if (/orb|bolt|wisp/.test(k)) sfx('orb', pos);
    else sfx('projectile', pos);
  });
  on('projectileBounce', (p) => sfx('chakram_ricochet', { x: p.p && p.p.x, y: p.p && p.p.y, vel: 0.6 }));
  on('zone', (p) => { const z = p.z || {}; const k = String(z.kind || ''); if (k.startsWith('boss:')) return; if (/molten|fire|burn/.test(k)) sfx('sizzle', at(z)); });
  on('explode', (p) => {
    if (p.call) return; // the call has its own sound
    const el = String(p.element || '');
    if (el.startsWith('boss:')) return sfx('explode', { ...at(p), vel: 1.2, element: el.includes('veyl') ? 'glass' : el.includes('aurum') ? 'fire' : el.includes('morrow') ? 'tide' : 'void' });
    sfx('explode', { ...at(p), element: patronKey(el) || el, vel: clamp(0.6 + (p.r || 80) / 300, 0.6, 1.2) });
  });
  on('shockwave', (p) => sfx('shockwave', at(p)));
  on('leap', (p) => sfx('leap', at(p)));
  on('teleport', (p) => sfx('teleport', at(p)));
  on('pull', (p) => sfx('pull', at(p)));
  on('chain', (p) => sfx('chain', at(p)));

  // ---- bosses
  on('bossIntro', (p) => {
    const b = bossKey(p.id) || bossKey(G.boss && G.boss.kind);
    S.boss = { id: b, phase: 1, active: false, done: false, intro: now() };
    sfx('boss_intro', { root: BOSS_ROOT[b] ?? 33 });
    if (b === 'morrow') sfx('morrow_choir', { delay: 0.4, vel: 0.7 });
    if (b === 'veyl') sfx('veyl_ring', { delay: 0.3, vel: 0.7 });
    if (b === 'sable') sfx('sable_thread', { delay: 0.5, vel: 0.8 });
    if (b === 'aurum') sfx('aurum_hammer', { delay: 0.25, vel: 0.8 });
    if (p.line) voice(b || p.id, p.line, { delay: 1.2 });
    S.lastWant = '';
  });
  on('bossFight', (p) => { const b = bossKey(p.id) || S.boss.id; S.boss.id = b; S.boss.active = !!b; S.lastWant = ''; });
  on('bossMove', (p) => {
    const b = bossKey(p.id); if (!b) return;
    if (p.pose === 'act') { const n = BOSS_ACT[b] && BOSS_ACT[b][p.move]; if (n) sfx(n, at(p)); }
    else if (p.pose === 'wind' && b === 'aurum') sfx('aurum_step', at(p));
  });
  on('bossImpact', (p) => { const n = BOSS_IMPACT[p.item]; if (n) sfx(n, { ...at(p), vel: clamp(0.6 + (p.r || 100) / 400, 0.6, 1.1) }); });
  on('bossSlash', (p) => sfx('sable_lunge', { ...at(p), vel: 0.7 }));
  on('bossSetPiece', (p) => {
    const b = bossKey(p.id);
    if (p.name === 'braid') return sfx('braid');
    if (p.name === 'death') return;
    const n = b && BOSS_SET[b] && BOSS_SET[b][p.name]; if (n) sfx(n);
  });
  on('bossSummon', (p) => { const b = bossKey(p.id); sfx(b === 'veyl' ? 'veyl_summon' : b === 'morrow' ? 'morrow_summon' : b === 'sable' ? 'sable_echo' : 'spawn'); });
  on('bossStagger', (p) => sfx('stagger', at(p, p.e)));
  on('bossArmor', () => sfx('shield', { pitch: 0.7 }));
  on('bossSnap', (p) => sfx('snap', at(p)));
  on('bossMirror', (p) => sfx('call_' + (patronKey(p.patron) || 'shade'), { vel: 0.55, pitch: 0.8 }));
  on('bossBark', (p) => { if (p.text) voice(p.speaker || p.id, p.text); });
  on('bossPhase', (p) => {
    const b = bossKey(p.id) || S.boss.id;
    S.boss.phase = p.phase || 2; if (b) { S.boss.id = b; S.boss.active = true; }
    sfx('boss_phase', { root: BOSS_ROOT[b] ?? 33 });
    if (b === 'veyl') sfx('veyl_summon', { delay: 0.5 });
    if (S.M) S.M.phaseTo(S.boss.phase);
    S.lastWant = '';
  });
  on('bossDying', (p) => {
    const b = bossKey(p.id) || S.boss.id;
    if (S.M) S.M.stopAll(2.5);
    S.boss.active = false; S.boss.done = true; S.holdUntil = now() + 9; S.lastWant = 'dying';
    sfx('unravel_elite', { vel: 1.2 });
    if (p.line) voice(b || p.id, p.line, { delay: 0.6 });
  });
  on('bossDefeat', () => {
    S.boss.active = false; S.boss.done = true;
    sfx('boss_defeat', { root: (REGION_ROOT[regionOf(G)] ?? 62) + 12 });
    if (S.M) S.M.stopAll(1.2);
    S.lastWant = 'defeat'; S.holdUntil = now() + 4;
  });
  on('bossChoice', () => { if (S.M) S.M.stopAll(2); S.holdUntil = now() + 60; sfx('pickup_memory'); });
  on('bossAttack', (p) => { const b = bossKey(p.id) || S.boss.id; const n = b && p.attack ? `${b}_${p.attack}` : null; if (n && SFX[n]) sfx(n, { ...at(p), delay: p.delay }); });
  on('sfx', (p) => { if (p.name) sfx(p.name, p); });

  // ---- rooms, flow, saves, story
  on('runStart', () => sfx('run_start'));
  on('chamberEnter', (p) => {
    const ch = p.chamber || G.chamber;
    S.boss = { id: null, phase: 1, active: false, done: false };
    S.enterT = now(); S.clearT = -9; S.holdUntil = 0; S.brokeAt = new WeakSet();
    if (ch && ch.kind !== 'hub') sfx('door_enter');
    if (S.E && ch && ch.region) setRoom(S.E, ch.region, 1.5);
  });
  on('waveStart', (p) => { if ((p.wave | 0) > 0) sfx('wave_start'); });
  on('wave', () => sfx('wave_start'));
  on('chamberClear', (p) => {
    S.clearT = now();
    const ch = p.chamber || G.chamber;
    const r = REGION_ROOT[regionOf(G)] ?? 62;
    if (!S.boss.done && !(ch && ch.kind === 'boss')) sfx('chamber_clear', { root: r + 12 });
  });
  on('doorOpen', () => sfx('door_open'));
  on('doorLocked', () => sfx('door_locked'));
  on('regionEnter', (p) => { if (S.E && p.region) setRoom(S.E, p.region, 2); S.lastWant = ''; });
  on('reward', (p) => { if (p.kind === 'boss') sfx('pickup_shard', { delay: 0.3 }); });
  on('runEnd', (p) => { if (p.result === 'victory') sfx('victory', { root: (REGION_ROOT[regionOf(G)] ?? 62) + 12 }); });
  on('victory', () => sfx('victory', { root: (REGION_ROOT[regionOf(G)] ?? 62) + 12 }));
  on('ending', (p) => { S.ending = p.kind || null; S.holdUntil = 0; S.lastWant = ''; });
  on('save', (p) => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (p.reason && !/door|checkpoint|chamber|room/i.test(p.reason)) return; // only the door checkpoint chimes
    if (G.scene === 'run' || G.scene === 'hub') sfx('save', { vol: 0.8 });
  });
  on('line', (p) => { if (p.text) voice(p.speaker, p.text, { mood: p.mood }); });
  on('dialogueEnd', () => stopVoice());
  on('dialogue', (p) => { if (p && p.open === false) stopVoice(); else sfx('dialogue_open'); });
  on('advance', () => sfx('dialogue_next'));
  on('settings', (p) => { if (String(p.key || '').startsWith('volume') || /mute/.test(p.key || '')) applySettings(G); });
  on('ui', ui);
  on('scene', (p) => {
    const to = p.to, from = p.from;
    if (to === 'paused' || to === 'settings' || to === 'codex') sfx('ui_open');
    else if (from === 'paused' || from === 'settings' || from === 'codex') sfx('ui_close');
    if (to === 'dialogue' && from !== 'dialogue') sfx('dialogue_open');
    if (to === 'victory') sfx('victory', { root: (REGION_ROOT[regionOf(G)] ?? 62) + 12 });
    if (from === 'dialogue' && to !== 'dialogue') stopVoice();
    if (to === 'hub' || to === 'title' || to === 'dead' || to === 'ending' || to === 'profiles') S.holdUntil = 0;
    S.lastWant = '';
  });
  return { detach() { for (const off of S.offs) try { off(); } catch (e) {} S.offs = []; } };
}

export default { initAudio, attachAudio, sfx, music, voice, stopVoice, setVolumes, getVolumes, mute, audioState, sfxNames, voiceIds };
