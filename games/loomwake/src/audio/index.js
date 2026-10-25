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
  lastDash: -9, lastBeat: 0, foes: 0, clearT: -9, offs: [], gestures: false, muffle: 20000, scene: null,
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
const isBoss = (G, e) => !!e && (e === G.boss || e.boss || !!bossKey(e.kind) && (e.tier === 'boss' || e === G.boss || e.isBoss));

function tellFor(G, tg) {
  const owner = ownerOf(G, tg.owner);
  const k = String((owner && owner.kind) || tg.ownerKind || '').toLowerCase();
  const dur = clamp(tg.max ?? tg.t ?? 0.5, 0.2, 2.2);
  const at = { x: tg.x, y: tg.y };
  if (tg.sfx === false) return;
  if (typeof tg.sfx === 'string') sfx(tg.sfx, { ...at, dur });
  else if (owner && isBoss(G, owner) || bossKey(k)) {
    const b = bossKey(k) || S.boss.id;
    sfx('tell_boss', { ...at, dur, vel: 0.8 });
    // the signature sound lands with the attack
    const sig = tg.hitSfx || bossSig(b, tg);
    if (sig) sfx(sig, { ...at, delay: dur });
  } else {
    let name = 'tell';
    if (/hollow|thornling/.test(k)) name = 'tell_claw';
    else if (/knight|warden/.test(k)) name = 'tell_heavy';
    else if (/needle|caster/.test(k)) name = 'tell_cast';
    else if (/snarl|wolf/.test(k)) name = 'tell_leap';
    else if (/hulk|brute|bellows/.test(k)) name = tg.kind === 'line' ? 'tell_charge' : 'tell_slam';
    else if (/chorist|choir/.test(k)) name = 'tell_song';
    sfx(name, { ...at, dur });
    if (tg.hitSfx) sfx(tg.hitSfx, { ...at, delay: dur });
    else if (/knight|hulk|brute/.test(k) && (tg.kind === 'line' || tg.kind === 'circle')) sfx('slam', { ...at, delay: dur, vel: /hulk|brute/.test(k) ? 1 : 0.75 });
  }
}
function bossSig(b, tg) {
  const k = tg.kind;
  if (b === 'veyl') return k === 'line' ? 'veyl_thorns' : k === 'circle' ? 'veyl_shatter' : k === 'ring' ? 'veyl_ring' : 'veyl_claw';
  if (b === 'morrow') return k === 'ring' ? 'morrow_ring' : k === 'circle' ? 'morrow_flood' : 'morrow_lantern';
  if (b === 'aurum') return k === 'circle' ? 'aurum_hammer' : k === 'line' ? 'aurum_anvil' : 'aurum_hiss';
  if (b === 'sable') return k === 'line' || k === 'cone' ? 'sable_lunge' : 'sable_thread';
  return 'slam';
}

const BOSS_ROOT = { veyl: 33, morrow: 36, aurum: 29, sable: 35 };
const ui = (p) => {
  const n = typeof p === 'string' ? p : p && (p.sfx || p.type || p.kind || p.action || p.name);
  if (!n) return;
  const map = { buy: 'purchase', purchase: 'purchase', reroll: 'reroll', select: 'ui_confirm', equip: 'ui_confirm', upgrade: 'ui_upgrade', deny: 'ui_error', locked: 'ui_error' };
  const name = map[n] || (SFX['ui_' + n] ? 'ui_' + n : SFX[n] ? n : null);
  if (name) sfx(name, p && typeof p === 'object' ? p : {});
};

export function attachAudio(bus, G) {
  if (S.bus) for (const off of S.offs) try { off(); } catch (e) {}
  S.offs = []; S.bus = bus; S.G = G;
  if (S.E) S.E.G = G;
  const on = (type, fn) => { if (bus && bus.on) S.offs.push(bus.on(type, (p) => { try { fn(p || {}); } catch (e) { if (!S.warned) { S.warned = true; console.warn('Loomwake audio event', type, e); } } })); };
  const now = () => (S.E ? S.E.now() : 0);

  // gestures unlock audio (main.js should also call initAudio from its own handlers)
  if (!S.gestures && typeof window !== 'undefined') {
    S.gestures = true;
    const unlock = () => { initAudio(); if (S.E && S.E.ctx.state === 'running') for (const ev of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(ev, unlock, true); };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, true);
    window.addEventListener('gamepadconnected', () => initAudio());
  }

  // ---- combat
  on('hit', (p) => {
    const e = p.target; if (!e || e === G.hero || e.team === 'hero') return;
    const pos = { x: p.x ?? e.x, y: p.y ?? e.y };
    const vel = clamp(0.55 + (p.dmg || 0) / 60, 0.5, 1.3);
    const mat = materialOf(e);
    if (p.kind === 'snare') sfx('snare_hit', pos);
    sfx('hit_' + mat, { ...pos, vel });
    if (p.crit) sfx('crit', pos);
    const el = patronKey(p.element) || (p.element === 'fire' || p.element === 'molten' ? 'fire' : null);
    if (el && p.kind !== 'call') sfx('proc_' + el, { ...pos, vel: 0.7 });
    // armour break: armour went from >0 to 0 on this hit
    const prev = S.armor.get(e);
    if (prev > 0 && !(e.armor > 0)) sfx('armor_break', { ...pos, material: mat === 'glass' ? 'glass' : 'armor' });
    S.armor.set(e, e.armor || 0);
  });
  on('armorBreak', (p) => { const e = p.e || p.target; if (e) S.armor.set(e, 0); sfx('armor_break', { x: p.x ?? e?.x, y: p.y ?? e?.y, material: e && materialOf(e) === 'glass' ? 'glass' : 'armor' }); });
  on('stagger', (p) => sfx('stagger', { x: p.x ?? p.e?.x, y: p.y ?? p.e?.y }));
  on('kill', (p) => {
    const e = p.e || p.target; if (!e || isBoss(G, e)) return;
    const pos = { x: e.x, y: e.y };
    const k = String(e.kind || '').toLowerCase();
    if (e.elite || e.tier === 'elite' || /hulk|brute/.test(k)) sfx('unravel_elite', pos); else sfx('unravel', pos);
    if (/thornling/.test(k)) sfx('thorn_burst', pos);
    if (/glass/.test(k)) sfx('veyl_shatter', { ...pos, vel: 0.6 });
  });
  on('heroHurt', (p) => sfx('hero_hurt', { vel: clamp(0.7 + (p.dmg || 0) / 40, 0.7, 1.3) }));
  on('heroDeath', () => { sfx('death_sting'); if (S.M) S.M.stopAll(0.6); S.lastWant = 'dead'; });
  on('deathDefy', () => sfx('death_defy'));
  on('heal', (p) => sfx('heal', { vel: p.small ? 0.6 : 1 }));
  on('swing', (p) => {
    const w = String(p.weapon || 'blade').toLowerCase(), c = p.combo | 0;
    if (w.includes('spear')) sfx(c >= 2 ? 'swing3' : 'spear', { pitch: c >= 2 ? 0.85 : 1 });
    else if (w.includes('bow')) sfx(p.charge ? 'bow' : 'bow', { vel: 0.7 + 0.3 * (p.charge ?? 1) });
    else if (w.includes('gaunt') || w.includes('fist')) sfx(c >= 3 ? 'swing3' : 'punch', { pitch: 1 + (c % 3) * 0.06 });
    else if (w.includes('chakram') || w.includes('bobbin')) sfx('chakram');
    else sfx(c >= 2 ? 'swing3' : c === 1 ? 'swing2' : 'swing1');
  });
  on('charge', () => sfx('bow_draw'));
  on('special', () => sfx('special'));
  on('snare', () => sfx('snare_throw'));
  on('snareHit', (p) => sfx('snare_hit', { x: p.x, y: p.y }));
  on('snareRecall', () => sfx('snare_recall'));
  on('recall', () => sfx('snare_recall'));
  on('bind', (p) => sfx('bind', { x: p.x ?? p.e?.x, y: p.y ?? p.e?.y }));
  on('catch', () => sfx('chakram_catch'));
  on('dash', () => { const t = now(); sfx('dash', { chained: t - S.lastDash < 0.45 }); S.lastDash = t; });
  on('call', (p) => sfx('call_' + (patronKey(p.patron) || 'dawn')));
  on('callReady', () => sfx('call_ready'));
  on('chain', (p) => sfx('chain', { x: p.x, y: p.y }));
  on('shield', () => sfx('shield'));
  on('cloak', () => sfx('cloak'));
  on('telegraph', (p) => { const tg = p.tg || p; if (tg) tellFor(G, tg); });
  on('spawn', (p) => {
    const e = p.e; if (!e || isBoss(G, e) || e.team === 'hero') return;
    const pos = { x: e.x, y: e.y }, k = String(e.kind || '').toLowerCase();
    sfx('spawn', pos);
    const r = Math.random();
    if (/hollow|thornling/.test(k) && r < 0.35) sfx('rasp', { ...pos, delay: 0.6 });
    else if (/knight|warden/.test(k) && r < 0.5) sfx('clank', { ...pos, delay: 0.6 });
    else if (/snarl/.test(k) && r < 0.5) sfx('growl', { ...pos, delay: 0.6 });
  });
  on('projectile', (p) => {
    const q = p.p || p; if (!q) return;
    const k = String(q.kind || '').toLowerCase(), pos = { x: q.x, y: q.y };
    if (q.team === 'hero') { if (/arrow|bolt/.test(k)) sfx('arrow', pos); return; }
    if (/needle/.test(k)) sfx('needle', pos);
    else if (/anvil/.test(k)) sfx('aurum_anvil', pos);
    else if (/hammer/.test(k)) sfx('hammer_throw', pos);
    else if (/glass|shard|thorn/.test(k)) sfx('needle', { ...pos, pitch: 1.25, vel: 0.8 });
    else if (/song|ring|wave/.test(k)) sfx('song_ring', pos);
    else if (/fire|flame/.test(k)) sfx('fire_breath', pos);
    else if (/orb|bolt|wisp/.test(k)) sfx('orb', pos);
    else sfx('projectile', pos);
  });
  on('explode', (p) => sfx('explode', { x: p.x, y: p.y, element: patronKey(p.element) || p.element, vel: clamp(0.6 + (p.r || 80) / 300, 0.6, 1.2) }));
  on('slam', (p) => sfx('slam', { x: p.x, y: p.y }));
  on('shockwave', (p) => sfx('shockwave', { x: p.x, y: p.y }));
  on('leap', (p) => sfx('leap', { x: p.x, y: p.y }));
  on('teleport', (p) => sfx('teleport', { x: p.x, y: p.y }));
  on('pull', (p) => sfx('pull', { x: p.x, y: p.y }));
  on('bossAttack', (p) => { const b = bossKey(p.id) || S.boss.id; const n = b && p.attack ? `${b}_${p.attack}` : null; if (n && SFX[n]) sfx(n, { x: p.x, y: p.y, delay: p.delay }); });
  on('sfx', (p) => { if (p.name) sfx(p.name, p); });

  // ---- powers and rewards
  on('boon', (p) => sfx('boon_take', { patron: p.patron || p.id }));
  on('offer', (p) => {
    const list = (p && (p.offer || p.cards)) || G.offer || [];
    sfx('offer');
    list.forEach((c, i) => sfx('card', { rarity: c && c.rarity, delay: 0.12 + i * 0.12 }));
  });
  on('reroll', () => sfx('reroll'));
  on('purchase', () => sfx('purchase'));
  on('pickup', (p) => { const k = String(p.kind || ''); sfx(SFX['pickup_' + k] ? 'pickup_' + k : 'pickup'); });
  on('fountain', () => sfx('fountain'));
  on('memory', () => sfx('pickup_memory'));
  on('upgrade', () => sfx('ui_upgrade'));

  // ---- rooms and flow
  on('chamberEnter', (p) => {
    const ch = p.chamber || G.chamber;
    S.boss = { id: null, phase: 1, active: false, done: false };
    S.enterT = now(); S.clearT = -9; S.holdUntil = 0;
    sfx('door_enter');
    if (S.E && ch && ch.region) setRoom(S.E, ch.region, 1.5);
  });
  on('wave', () => sfx('wave_start'));
  on('chamberClear', () => {
    S.clearT = now();
    const r = REGION_ROOT[regionOf(G)] ?? 62;
    if (!S.boss.done) sfx('chamber_clear', { root: r + 12 });
  });
  on('doorOpen', () => sfx('door_open'));
  on('doorLocked', () => sfx('door_locked'));
  on('regionEnter', (p) => { if (S.E && p.region) setRoom(S.E, p.region, 2); S.lastWant = ''; });
  on('bossIntro', (p) => {
    const b = bossKey(p.id) || bossKey(G.boss && G.boss.kind);
    S.boss = { id: b, phase: 1, active: !!b, done: false };
    sfx('boss_intro', { root: BOSS_ROOT[b] ?? 33 });
    if (b === 'morrow') sfx('morrow_choir', { delay: 0.4 });
    if (b === 'veyl') sfx('veyl_ring', { delay: 0.3, vel: 0.7 });
    if (b === 'sable') sfx('sable_thread', { delay: 0.5 });
    if (b === 'aurum') sfx('aurum_hammer', { delay: 0.25, vel: 0.8 });
  });
  on('bossPhase', (p) => {
    const b = bossKey(p.id) || S.boss.id;
    S.boss.phase = p.phase || 2; if (b) { S.boss.id = b; S.boss.active = true; }
    sfx('boss_phase', { root: BOSS_ROOT[b] ?? 33 });
    if (b === 'sable') sfx('sable_unmask');
    if (b === 'aurum') sfx('aurum_heat', { delay: 0.4 });
    if (b === 'veyl') sfx('veyl_summon', { delay: 0.5 });
    if (b === 'morrow') sfx('morrow_flood', { delay: 0.5 });
    if (S.M) S.M.phaseTo(S.boss.phase);
  });
  on('bossDefeat', (p) => {
    const b = bossKey(p.id) || S.boss.id;
    S.boss.active = false; S.boss.done = true;
    sfx('boss_defeat', { root: (REGION_ROOT[regionOf(G)] ?? 62) + 12 });
    if (S.M) S.M.stopAll(1.2);
    S.lastWant = 'defeat'; S.holdUntil = now() + 4;
  });
  on('victory', () => sfx('victory', { root: (REGION_ROOT[regionOf(G)] ?? 62) + 12 }));
  on('save', () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') { if (G.scene === 'run' || G.scene === 'hub') sfx('save', { vol: 0.8 }); } });
  on('line', (p) => { if (p.text) voice(p.speaker, p.text, { rate: p.rate }); });
  on('dialogue', (p) => { if (p && p.open === false) stopVoice(); else sfx('dialogue_open'); });
  on('advance', () => sfx('dialogue_next'));
  on('ui', ui);
  on('scene', (p) => {
    const to = p.to, from = p.from;
    if (to === 'paused' || to === 'settings' || to === 'codex') sfx('ui_open');
    else if (from === 'paused' || from === 'settings' || from === 'codex') sfx('ui_close');
    if (to === 'victory') sfx('victory', { root: (REGION_ROOT[regionOf(G)] ?? 62) + 12 });
    if (from === 'dialogue') stopVoice();
    if (to === 'hub' || to === 'title' || to === 'dead' || to === 'ending' || to === 'profiles') S.holdUntil = 0;
    S.lastWant = '';
  });
  return { detach() { for (const off of S.offs) try { off(); } catch (e) {} S.offs = []; } };
}

export default { initAudio, attachAudio, sfx, music, voice, stopVoice, setVolumes, getVolumes, mute, audioState, sfxNames, voiceIds };
