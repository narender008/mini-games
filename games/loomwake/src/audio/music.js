// Adaptive music: a lookahead scheduler that plays the procedural tracks in
// tracks.js. Each track writes into four stems (base, motion, drive, peak);
// the intensity (0..1) fades the stems in and out, so the music rises when
// foes are alive and settles when the chamber is clear. Notes for a silent
// stem are not scheduled at all, so quiet music is also cheap music.
//
// The same scheduler renders offline: tick(horizon) schedules every step that
// starts before `horizon`, so a test can call tick(8) on an OfflineAudioContext
// engine and render eight seconds of exactly what the game would play.
import { TRACKS } from './tracks.js';
import { setRoom } from './core.js';
import { LEVELS } from './levels.js';
import { rng, hashSeed } from '../core/rng.js';

const LAYERS = ['base', 'motion', 'drive', 'peak'];
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
export function layerLevels(T, i) {
  if (T.levels) return T.levels(i);
  return { base: 1, motion: smooth(0.12, 0.38, i), drive: smooth(0.42, 0.66, i), peak: smooth(0.74, 0.92, i) };
}

export function createMusic(E) {
  const M = { E, insts: [], id: null, intensity: 0.5, phase: 1 };

  function start(id, o) {
    const T = TRACKS[id];
    if (!T) return null;
    const c = E.ctx, now = E.now();
    const gain = c.createGain(); gain.gain.value = 0;
    gain.connect(E.music);
    const wet = c.createGain(); wet.gain.value = T.wet ?? 0.3; gain.connect(wet); wet.connect(E.musicWet);
    const fadeIn = o.fadeIn ?? T.fadeIn ?? 1.2;
    const level = (T.gain ?? 1) * (E.raw ? 1 : (LEVELS.music[id] ?? 1));
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(level, now + Math.max(0.05, fadeIn));
    const L = {}, lv = layerLevels(T, M.intensity);
    for (const k of LAYERS) { L[k] = c.createGain(); L[k].gain.value = lv[k] * (T.mix?.[k] ?? 1); L[k].connect(gain); }
    const inst = {
      id, T, gain, wet, L, target: lv, level, s: 0, next: now + 0.06, dieAt: Infinity, st: {},
      r: rng(hashSeed('music', id, o.seed ?? (E.offline ? 1 : (Date.now() & 0xffff)))),
    };
    if (T.setup) T.setup(inst);
    if (T.room && o.room !== false) setRoom(E, T.room, E.offline ? 0 : 2);
    return inst;
  }

  function fadeOut(inst, fade) {
    const now = E.now();
    const g = inst.gain.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + Math.max(0.05, fade));
    inst.dieAt = now + fade + 0.05;
  }

  // music.set(track | null, { intensity, phase, fade, fadeIn })
  M.set = (id, o = {}) => {
    if (o.intensity != null) M.intensity = Math.min(1, Math.max(0, o.intensity));
    if (o.phase != null) M.phase = o.phase;
    if (id === undefined) id = M.id;
    const cur = M.insts.find((x) => x.id === id && x.dieAt === Infinity);
    if (id === M.id && cur) { M.retarget(); return; }
    for (const x of M.insts) if (x.dieAt === Infinity) fadeOut(x, o.fade ?? x.T.fadeOut ?? 1.8);
    M.id = id;
    if (!id) return;
    // revive a track that is still fading out
    const dying = M.insts.find((x) => x.id === id && x.dieAt !== Infinity && x.dieAt > E.now() + 0.2);
    if (dying) {
      const now = E.now(), g = dying.gain.gain;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(dying.level, now + 0.8);
      dying.dieAt = Infinity; M.retarget(); return;
    }
    const inst = start(id, o);
    if (inst) M.insts.push(inst);
  };
  M.intensityTo = (i) => { M.intensity = Math.min(1, Math.max(0, i)); M.retarget(); };
  M.phaseTo = (p) => { M.phase = p; };
  M.retarget = () => {
    const now = E.now();
    for (const x of M.insts) {
      if (x.dieAt !== Infinity) continue;
      const lv = layerLevels(x.T, M.intensity);
      for (const k of LAYERS) {
        const v = lv[k] * (x.T.mix?.[k] ?? 1), p = x.L[k].gain;
        const up = v > x.target[k];
        p.cancelScheduledValues(now); p.setValueAtTime(p.value, now);
        p.setTargetAtTime(v, now, up ? 0.5 : 1.4);
      }
      x.target = lv;
    }
  };

  // Schedule every step that starts before `horizon` (seconds on E's clock).
  M.tick = (horizon) => {
    const now = E.now();
    for (let i = M.insts.length - 1; i >= 0; i--) {
      const x = M.insts[i];
      if (now > x.dieAt) { try { x.gain.disconnect(); } catch (e) {} M.insts.splice(i, 1); continue; }
      // after a stall (background tab) skip ahead instead of flooding notes
      if (!E.offline && x.next < now - 0.25) { const T = x.T; const sd = 60 / bpmOf(T, M) / 4; const k = Math.ceil((now - x.next) / sd); x.s += k; x.next += k * sd; }
      let guard = 0;
      while (x.next < horizon && x.next < x.dieAt && guard++ < 256) {
        const T = x.T, sd = 60 / bpmOf(T, M) / 4, spb = T.spb || 16;
        const m = {
          E, t: x.next, s: x.s, bar: Math.floor(x.s / spb), pos: x.s % spb, sd, bd: sd * spb, spb,
          L: x.L, i: M.intensity, phase: M.phase, r: x.r, st: x.st,
          on: (k) => (x.target[k] || 0) > 0.02 || x.L[k].gain.value > 0.02,
        };
        try { T.step(m); } catch (e) { if (!M.warned) { M.warned = true; console.warn('Loomwake music:', x.id, e); } }
        x.s++; x.next += sd;
      }
    }
  };
  M.stopAll = (fade = 0.5) => { for (const x of M.insts) if (x.dieAt === Infinity) fadeOut(x, fade); M.id = null; };
  M.track = () => M.id;
  return M;
}

function bpmOf(T, M) { return typeof T.bpm === 'function' ? T.bpm(M.phase, M.intensity) : T.bpm; }

export const TRACK_IDS = () => Object.keys(TRACKS);
