// Tidebreaker sound: everything synthesised with Web Audio at run time, no
// files. This module wires the event bus (events.js) to the effects in
// audio/sfx.js, follows the game every frame for the ambience
// (audio/ambience.js) and the score (audio/music.js), and owns mute.
//   initAudio()       on a user gesture: create or resume the AudioContext
//   setMuted(m)       silence everything at once (main.js saves the choice)
//   updateAudio(G,dt) every frame: biome beds, fire loop, falling-shell
//                     whistles, incoming whooshes, hover ticks, the music
//   audioDebug()      counters for tests (also window.__tbAudio with ?debug)
// Safe without Web Audio: nothing here throws if the context is missing,
// suspended or blocked; sounds are simply not made.
import { on } from './events.js';
import { DEBUG } from './config.js';
import { A, boot, resume, prune, clamp, meter, MUSIC_LEVEL } from './audio/core.js';
import * as fx from './audio/sfx.js';
import { M, follow, schedule, startMusic, sting } from './audio/music.js';
import { setBiome, setBurn, update as updateAmb, heardThunder, ambStats } from './audio/ambience.js';

let G0 = null, biome = null, hoverId = null, hoverT = 0, combatHold = 0, burnT = 0, sceneWas = null;
const seen = new WeakSet(), passed = new WeakSet(), whistles = new Map(); // shot -> whistle handle
const recent = new Map();
// true when `key` has not played within `win` seconds (for sounds two events can ask for)
function fresh(key, win = 0.3) {
  const t = performance.now() / 1000;
  if (t - (recent.get(key) ?? -9) < win) return false;
  recent.set(key, t); return true;
}
const aimX = () => G0?.input?.aim?.x;

// ------------------------------------------------------------- events
const ABILITY = {
  chain: (x) => fx.chainShot(x, aimX()),
  fire: (x, n) => fx.barrels(x, n),
  barrel: (x, n) => fx.barrels(x, n),
  lightning: (x) => fx.charge(x),
  kraken: () => {}, // the 'kraken' event (tentacles summoned) plays the slam
};
function ability(id, x, n) {
  const f = ABILITY[id];
  if (f && fresh('ab:' + (id === 'barrel' ? 'fire' : id))) f(x ?? G0?.player?.x ?? 300, n);
}

on('fire', (d) => {
  const kind = String(d.kind || ''), x = d.x ?? (d.side === 'enemy' ? 1000 : G0?.player?.x ?? 300);
  if (d.side === 'enemy') {
    if (/mortar|lob|bomb/.test(kind)) fx.mortarThump(x);
    else if (/spit|venom|ink|acid|slime/.test(kind)) fx.spit(x);
    else if (/bolt|zap|lightning/.test(kind)) fx.zap(x, G0?.player?.x ?? 300);
    else if (/wave|slam|tail|surge/.test(kind)) fx.splash(x, 2);
    else fx.enemyCannon(x, d.n || 1, /fort|heavy|galleon|boss|leviathan/.test(kind));
    return;
  }
  if (ABILITY[kind]) return ability(kind, x, d.n);
  fx.broadside(x, d.n || 3, aimX());
});
on('ability', (d) => ability(d.id));
on('hit', (d) => {
  const tg = d.target;
  if (tg && (tg === G0?.player || tg.side === 'player')) return; // player-hit says it louder
  const kind = String(d.kind || '');
  if (/burn|dot|debug|splash/.test(kind)) return; // the fire loop covers burning; splash damage rides on its blast
  if (/lightning|zap|arc/.test(kind)) { if (d.crit) fx.hitWood(d.x, { crit: true, dmg: d.dmg }); return; }
  if (/kraken|crush|tentacle/.test(kind)) { if (fresh('crush', 0.9)) { if ((d.dmg || 0) > 40) fx.kraken(d.x, { rise: 0.02 }); else fx.squelch(d.x); } return; }
  fx.hitWood(d.x, { crit: !!d.crit || !!d.weak, weak: !!d.weak, dmg: d.dmg });
});
on('player-hit', (d) => fx.hitWood(d.x ?? G0?.player?.x ?? 300, { player: true, dmg: d.dmg }));
on('splash', (d) => fx.splash(d.x, d.size ?? 1));
on('explode', (d) => fx.explode(d.x, d.size ?? 1));
on('sink', (d) => { if (!d.boss || fresh('bossSink', 3)) fx.sink(d.x, !!d.boss || d.kind === 'player'); });
on('kraken', (d) => { fresh('crush', 0.9); fx.kraken(d.x ?? 900); });
on('wave', (d) => { if ((d.wave || 0) > 1) fx.waveHorn(); });
on('lightning', (d) => fx.zap(d.x0, d.x1 ?? d.x0));
on('thunder', (d) => { fx.thunder(d.near ?? 0.5); if (A.ctx) heardThunder(A.ctx.currentTime); });
on('coin', (d) => fx.coins(d.x, d.n || 1));
on('boss-spawn', (d) => fx.bossSpawn(d.kind));
on('boss-phase', (d) => fx.bossPhase(d.kind, d.phase || 2));
on('boss-roar', (d) => { if (fresh('roar', d.small ? 0.8 : 1)) fx.roar(d.kind, 1000, d.small ? { len: 1.1, gain: 0.6 } : d.beam ? { len: 3 } : {}); });
on('boss-dead', (d) => { fresh('bossSink', 3); fx.bossDead(d.kind); });
on('leg', () => fx.legBanner());
on('cleared', () => fx.cleared());
on('cards', () => fx.cardsOpen());
on('card-pick', (d) => fx.cardPick(d.rarity));
on('reroll', () => fx.reroll());
on('won', () => sting('won'));
on('lost', () => sting('lost'));
on('ui', (d) => {
  const a = d.action;
  if (a === 'pick' || a === 'reroll' || a === 'fire' || a === 'ability' || a === 'skip') return;
  fx.click(a === 'menu' || a === 'resume' ? 'back' : a);
});
on('hover', () => { hoverT = performance.now(); fx.hover(); });

// ------------------------------------------------------------- the API
export function initAudio() {
  const first = !A.ctx;
  if (!boot()) return;
  resume();
  if (first) {
    applyMute(true);
    biome = null; // updateAudio sets the bed
    startMusic();
  }
}

export function setMuted(m) {
  A.muted = !!m;
  applyMute(false);
}

function applyMute(instant) {
  if (!A.master || !A.ctx) return;
  const p = A.master.gain, t = A.ctx.currentTime;
  p.cancelScheduledValues(t);
  if (A.muted || instant) p.setValueAtTime(A.muted ? 0 : 1, t);
  else { p.setValueAtTime(0, t); p.linearRampToValueAtTime(1, t + 0.08); }
  if (A.muted) for (const h of whistles.values()) killWhistle(h);
}

export function updateAudio(G, dt) {
  G0 = G;
  if (!A.ctx || A.ctx.state === 'closed') return;
  try { tick(G, dt); } catch (e) { if (!tick.warned) { tick.warned = true; console.warn('Tidebreaker audio', e); } }
}

function tick(G, dt) {
  prune();
  const b = G.world?.biome || 'sunset';
  if (b !== biome) { biome = b; setBiome(b); }
  updateAmb(G, dt);

  const alive = (G.enemies || []).filter((e) => e.alive);
  combatHold = alive.length ? 4 : Math.max(0, combatHold - dt);
  if (G.scene !== 'play') combatHold = 0;

  // fire loop, a few times a second
  burnT -= dt;
  if (burnT <= 0) {
    burnT = 0.1;
    let n = 0, sx = 0;
    for (const e of alive) if (e.burn > 0) { n++; sx += e.cx ?? e.x; }
    const p = G.player;
    if (p && p.alive && p.burn > 0) { n++; sx += p.x; }
    setBurn(G.scene === 'play' ? Math.min(1, n / 3) : 0, n ? sx / n : null);
  }

  // shots: whistles for falling shells, a whoosh for balls passing the player
  const live = new Set();
  const px = G.player?.x ?? 300;
  for (const s of G.shots || []) {
    live.add(s);
    if (s.side !== 'enemy') continue;
    if (!seen.has(s)) {
      seen.add(s);
      if (/mortar|lob|bomb/.test(String(s.kind || ''))) { const h = fx.whistle(s.x); if (h) whistles.set(s, h); }
    }
    if (!passed.has(s) && Math.abs(s.x - px) < 230 && (s.vx ?? -1) < 0 && !whistles.has(s)) {
      passed.add(s);
      fx.whoosh(s.x, s.x - 400, { gain: 0.09, dur: 0.4, f1: 2600 });
    }
  }
  for (const [s, h] of whistles) {
    if (!live.has(s) || h.dead) { killWhistle(h); whistles.delete(s); continue; }
    const vy = s.vy ?? 0, k = clamp(vy / 650, 0, 1), t = A.ctx.currentTime;
    h.o.frequency.setTargetAtTime(vy < 0 ? 2500 : 2500 - k * 1750, t, 0.06);
    h.g.gain.setTargetAtTime(0.025 + k * 0.08, t, 0.08);
  }

  // hover ticks for the overlay buttons (if nothing emits 'hover')
  const hv = G.ui?.hover ?? null;
  if (hv !== hoverId) { hoverId = hv; if (hv && performance.now() - hoverT > 200) fx.hover(); }

  // the music: louder under menus, pulled down while paused
  if (G.scene !== sceneWas && A.music) {
    sceneWas = G.scene;
    A.music.gain.setTargetAtTime(G.scene === 'paused' ? MUSIC_LEVEL * 0.35 : MUSIC_LEVEL, A.ctx.currentTime, 0.25);
  }
  follow(G, dt, combatHold);
  schedule();
}

function killWhistle(h) {
  if (!h || h.dead) return;
  h.dead = true;
  const t = A.ctx.currentTime;
  try { h.g.gain.cancelScheduledValues(t); h.g.gain.setTargetAtTime(0, t, 0.02); h.o.stop(t + 0.15); h.vib.stop(t + 0.15); } catch { /* already stopped */ }
}

// Sleep with the tab: no sound and no CPU while hidden.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const c = A.ctx;
    if (!c) return;
    if (document.hidden) { if (c.state === 'running') c.suspend().catch(() => {}); }
    else resume();
  });
}

export function audioDebug() {
  const c = A.ctx;
  return {
    state: c ? c.state : 'none', muted: A.muted, sampleRate: c?.sampleRate ?? 0, time: c ? +c.currentTime.toFixed(3) : 0,
    voices: A.stats.voices, peakVoices: A.stats.peak, made: A.stats.made, dropped: A.stats.dropped, nodes: A.stats.nodes,
    music: { mode: M.mode, want: M.want, bar: M.bar, intensity: +M.intensity.toFixed(2), notes: M.notes },
    whistles: whistles.size, ...ambStats(),
    ...(A.meterIn ? { levelIn: meter(A.meterIn), levelOut: meter(A.meterOut) } : {}),
  };
}
if (DEBUG && typeof window !== 'undefined') window.__tbAudio = audioDebug;
