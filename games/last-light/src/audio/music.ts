// Generative music. Everything is in D: dorian for the world, aeolian with a leading tone for combat,
// a darker phrygian / diminished colour for the boss and a D major (picardy) resolution for victory.
//
// A MoodPlayer walks a 16th-note grid. MusicSystem.tick() is called every ~25 ms and asks the current
// player to schedule every step that falls inside a short lookahead window, on the audio clock, so note
// timing never depends on timer jitter. Each note is its own short-lived Group (see dsp.ts) that frees
// itself, so the music can loop for hours without growing. Pads and drones are long notes, re-struck
// with every chord, overlapping, rather than oscillators that run forever.
//
// Moods crossfade: the old player stops scheduling and fades its output out over 1.5 s while the new
// one fades in. Combat intensity fades layer gains (drums, ostinato, hats) and also thins or fills the
// patterns, so the change is both smooth and audible. The zone tints timbre (filter, bells, drone).

import type { MusicMood, Zone } from './types';
import { Group, mtof } from './dsp';

interface Chord { b: number; pad: number[] }

interface Colour {
  cut: number; padType: OscillatorType; bell: 'celesta' | 'wood' | 'glass' | 'metal' | 'choked';
  drone: number[]; wet: number; bellRate: number;
}

const ZONES: Record<Zone, Colour> = {
  sanctum: { cut: 1500, padType: 'triangle', bell: 'celesta', drone: [0, 7], wet: 0.45, bellRate: 1 },
  causeway: { cut: 1250, padType: 'triangle', bell: 'wood', drone: [0, 7, 12], wet: 0.35, bellRate: 1.1 },
  aqueduct: { cut: 1000, padType: 'sine', bell: 'glass', drone: [0, 12, 19], wet: 0.65, bellRate: 0.9 },
  foundry: { cut: 1100, padType: 'sawtooth', bell: 'metal', drone: [0, 7, -12], wet: 0.4, bellRate: 0.8 },
  heart: { cut: 850, padType: 'sawtooth', bell: 'choked', drone: [0, 6, -12], wet: 0.5, bellRate: 0.7 },
};

const C = (b: number, ...pad: number[]): Chord => ({ b, pad });

// Progressions (MIDI notes). Bass in the low octave, pad voiced around middle C.
const EXPLORE = [C(38, 57, 60, 64, 65), C(43, 55, 59, 62, 69), C(41, 57, 60, 64, 67), C(36, 55, 60, 62, 64)]; // Dm9 G(add9) Fmaj9 Cadd9
const TITLE = [C(38, 57, 62, 64, 65), C(41, 57, 60, 64, 69), C(36, 55, 62, 64, 67), C(43, 55, 59, 62, 66)];
const COMBAT = [C(38, 57, 60, 62, 65), C(34, 58, 62, 65, 69), C(36, 55, 60, 64, 67), C(33, 57, 61, 64, 67)]; // Dm7 Bbmaj7 C A7
const BOSS = [C(38, 57, 62, 65, 69), C(39, 58, 63, 67, 70), C(38, 56, 62, 65, 68), C(37, 56, 61, 64, 67)];   // Dm Eb Ddim C#dim7
const VICTORY_IN = [C(34, 58, 62, 65, 69), C(36, 55, 60, 64, 67), C(38, 57, 62, 66, 69)];                     // Bbmaj7 C D
const VICTORY = [C(38, 57, 62, 66, 69), C(43, 59, 62, 67, 71), C(35, 59, 62, 66, 69), C(45, 57, 61, 64, 69)];   // D G Bm A
const DORIAN = [62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81];

interface Song { bpm: number; bpc: number; chords: Chord[]; intro?: Chord[]; fadeIn: number; gain: number }
const SONGS: Record<Exclude<MusicMood, 'none'>, Song> = {
  title: { bpm: 68, bpc: 2, chords: TITLE, fadeIn: 2.5, gain: 0.9 },
  explore: { bpm: 72, bpc: 2, chords: EXPLORE, fadeIn: 1.5, gain: 0.8 },
  combat: { bpm: 80, bpc: 2, chords: COMBAT, fadeIn: 1.5, gain: 0.85 },
  boss: { bpm: 84, bpc: 1, chords: BOSS, fadeIn: 1.2, gain: 0.9 },
  victory: { bpm: 66, bpc: 2, chords: VICTORY, intro: VICTORY_IN, fadeIn: 1.0, gain: 0.9 },
  defeat: { bpm: 58, bpc: 4, chords: [C(38, 57, 62, 65)], fadeIn: 1.0, gain: 0.85 },
};

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

/** Shared bits every instrument needs. */
export interface MusicCore {
  ctx: BaseAudioContext; noise: AudioBuffer; rev: AudioNode; zone: Zone; intensity: number;
}

// Instruments: each schedules one note as its own Group --------------------------------------------

function pad(m: MusicCore, dest: AudioNode, t: number, notes: number[], dur: number, dark = 0): void {
  const col = ZONES[m.zone];
  const g = new Group(m.ctx, t, dest, m.noise, m.rev, col.wet);
  const lp = g.filter('lowpass', col.cut * (1 - dark * 0.4), 0.6);
  g.lfo(lp.frequency, 0.07 + Math.random() * 0.05, col.cut * 0.25, 0, dur + 3);
  const each = 0.05 / Math.sqrt(notes.length);
  const a = Math.min(2.2, dur * 0.4);
  for (const n of notes) {
    const f = mtof(n);
    g.tone({ type: col.padType, f, detune: -7, a, hold: dur - a, d: 2.6, peak: each, dest: lp });
    g.tone({ type: col.padType, f, detune: 6, a: a * 1.2, hold: dur - a * 1.2, d: 2.6, peak: each * 0.8, dest: lp });
  }
}

function drone(m: MusicCore, dest: AudioNode, t: number, bass: number, dur: number): void {
  const col = ZONES[m.zone];
  const g = new Group(m.ctx, t, dest, m.noise, m.rev, 0.2);
  const lp = g.filter('lowpass', 320, 0.8);
  for (const iv of col.drone) {
    const n = bass + iv;
    g.tone({ type: iv === 0 ? 'sine' : 'triangle', f: mtof(n), a: 1.5, hold: dur - 1.5, d: 2.2, peak: iv === 0 ? 0.09 : 0.035, dest: lp });
  }
}

function harp(m: MusicCore, dest: AudioNode, t: number, n: number, vel: number): void {
  const g = new Group(m.ctx, t, dest, m.noise, m.rev, ZONES[m.zone].wet + 0.1);
  const f = mtof(n);
  g.fm({ f, ratio: 1, index: 1.6, index2: 0, a: 0.002, d: 1.8, peak: 0.07 * vel });
  g.tone({ type: 'triangle', f: f * 2, a: 0.002, d: 0.4, peak: 0.015 * vel });
}

function bellNote(m: MusicCore, dest: AudioNode, t: number, n: number, vel: number): void {
  const col = ZONES[m.zone];
  const g = new Group(m.ctx, t, dest, m.noise, m.rev, col.wet + 0.15);
  const f = mtof(n);
  switch (col.bell) {
    case 'celesta':
      g.tone({ f, d: 1.4, peak: 0.06 * vel });
      g.tone({ f: f * 4, d: 0.25, peak: 0.012 * vel });
      g.tone({ f: f * 2, d: 0.6, peak: 0.015 * vel });
      break;
    case 'wood': // soft marimba
      g.tone({ f, d: 0.6, peak: 0.08 * vel });
      g.tone({ f: f * 3.93, d: 0.08, peak: 0.02 * vel });
      break;
    case 'glass':
      g.fm({ f, ratio: 3.5, index: 0.9, index2: 0, d: 2.0, peak: 0.05 * vel });
      break;
    case 'metal':
      g.fm({ f, ratio: 2.41, index: 1.8, index2: 0.1, d: 1.6, peak: 0.045 * vel });
      break;
    case 'choked': // detuned bell with a sour partner: magenta corruption
      g.fm({ f, ratio: 1.41, index: 1.5, index2: 0.1, d: 1.4, peak: 0.04 * vel });
      g.tone({ f: f * 1.06, d: 0.9, peak: 0.012 * vel });
      break;
  }
}

function drum(m: MusicCore, dest: AudioNode, t: number, vel: number, low = 1): void {
  const g = new Group(m.ctx, t, dest, m.noise, m.rev, 0.18);
  g.tone({ f: 115 / low, f2: 44 / low, glide: 0.12, a: 0.002, d: 0.35 * low, peak: 0.42 * vel });
  g.noiseBurst({ a: 0.001, d: 0.07, peak: 0.12 * vel, type: 'lowpass', f: 700 });
  g.noiseBurst({ a: 0.001, d: 0.02, peak: 0.05 * vel, type: 'bandpass', f: 2500, q: 2 });
}

function hat(m: MusicCore, dest: AudioNode, t: number, vel: number): void {
  const g = new Group(m.ctx, t, dest, m.noise, null, 0);
  g.noiseBurst({ a: 0.001, d: 0.03, peak: 0.05 * vel, type: 'highpass', f: 7000 });
}

function pluck(m: MusicCore, dest: AudioNode, t: number, n: number, vel: number, len = 0.16): void {
  const g = new Group(m.ctx, t, dest, m.noise, m.rev, 0.12);
  const lp = g.filter('lowpass', 1400, 5);
  lp.frequency.setValueAtTime(1400, t);
  lp.frequency.exponentialRampToValueAtTime(260, t + len);
  g.tone({ type: 'sawtooth', f: mtof(n), a: 0.003, d: len, peak: 0.07 * vel, dest: lp });
}

function brass(m: MusicCore, dest: AudioNode, t: number, notes: number[], dur: number): void {
  const g = new Group(m.ctx, t, dest, m.noise, m.rev, 0.35);
  const lp = g.filter('lowpass', 300, 1.2);
  lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.6);
  lp.frequency.linearRampToValueAtTime(400, t + dur + 0.8);
  for (const n of notes) {
    g.fm({ type: 'sawtooth', f: mtof(n), ratio: 1, index: 0.2, index2: 1.6, a: dur * 0.55, hold: dur * 0.35, d: 0.9, peak: 0.06, dest: lp });
  }
}

// The player ---------------------------------------------------------------------------------------

type Layer = 'drums' | 'ost' | 'hats' | 'pulse';

export class MoodPlayer {
  readonly out: GainNode;
  private layers: Record<Layer, GainNode>;
  private step = 0;
  next: number;
  private readonly dt: number;
  private readonly song: Song;
  private queue = new Map<number, () => void>();
  private ended = false;
  deadAt = Infinity;

  constructor(private m: MusicCore, readonly mood: Exclude<MusicMood, 'none'>, dest: AudioNode, start: number) {
    this.song = SONGS[mood];
    this.dt = 60 / this.song.bpm / 4;
    this.next = start;
    const ctx = m.ctx;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, start);
    this.out.gain.linearRampToValueAtTime(this.song.gain, start + this.song.fadeIn);
    this.out.connect(dest);
    const mk = (): GainNode => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.out); return g; };
    this.layers = { drums: mk(), ost: mk(), hats: mk(), pulse: mk() };
    this.setIntensity(m.intensity, start);
  }

  setIntensity(x: number, now: number): void {
    const targets: Record<Layer, number> =
      this.mood === 'combat' ? { drums: 0.7 + 0.3 * x, ost: smooth(0.15, 0.5, x), hats: smooth(0.45, 0.8, x), pulse: 0 }
        : this.mood === 'boss' ? { drums: 0.85 + 0.15 * x, ost: 0.6 + 0.4 * x, hats: 0.4 + 0.6 * smooth(0.3, 0.8, x), pulse: 0 }
          : this.mood === 'explore' ? { drums: 0, ost: 0, hats: 0, pulse: 0.7 * smooth(0.15, 0.6, x) }
            : { drums: 0, ost: 0, hats: 0, pulse: 0 };
    for (const k of Object.keys(targets) as Layer[]) this.layers[k].gain.setTargetAtTime(targets[k], now, 0.6);
  }

  /** Schedule every step that starts before `until`. */
  schedule(until: number, now: number): void {
    if (this.ended) return;
    // Fell far behind (a stalled main thread): skip ahead rather than firing a burst of stale notes.
    if (this.next < now - 0.2) {
      const skip = Math.ceil((now - this.next) / this.dt);
      this.step += skip; this.next += skip * this.dt;
      this.queue.clear();
    }
    while (this.next < until && !this.ended) {
      this.play(this.step, this.next);
      this.step++;
      this.next += this.dt;
    }
  }

  retire(now: number, fade: number): void {
    this.ended = true;
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    this.queue.clear();
    this.deadAt = now + fade + 0.2;
  }

  dispose(): void {
    this.out.disconnect();
  }

  private chordAt(bar: number): Chord {
    const { bpc, chords, intro } = this.song;
    const i = Math.floor(bar / bpc);
    if (intro && i < intro.length) return intro[i]!;
    const k = intro ? i - intro.length : i;
    return chords[k % chords.length]!;
  }

  private later(step: number, fn: () => void): void { this.queue.set(step, fn); }

  private play(s: number, t: number): void {
    const m = this.m;
    const q = this.queue.get(s);
    if (q) { this.queue.delete(s); q(); }
    const bar = Math.floor(s / 16), pos = s % 16;
    const { bpc } = this.song;
    const chord = this.chordAt(bar);
    const chordStart = pos === 0 && bar % bpc === 0;
    const chordDur = bpc * 16 * this.dt;
    const x = m.intensity;
    const out = this.out, L = this.layers;
    const col = ZONES[m.zone];

    switch (this.mood) {
      case 'title': {
        if (chordStart) { pad(m, out, t, chord.pad, chordDur + 0.5); drone(m, out, t, chord.b, chordDur + 0.5); }
        if (pos === 0 && bar % 4 === 0) this.motif(s, chord, 6, 'harp', 0);
        if (pos === 0 && bar % 4 === 2 && Math.random() < 0.6) this.motif(s, chord, 3, 'bell', 12);
        break;
      }
      case 'explore': {
        if (chordStart) { pad(m, out, t, chord.pad, chordDur + 0.5); drone(m, out, t, chord.b, chordDur + 0.5); }
        if (pos === 0 && Math.random() < 0.3 * col.bellRate) this.motif(s, chord, 2 + Math.floor(Math.random() * 3), 'bell', 12);
        if (pos === 8 && bar % 2 === 1 && Math.random() < 0.25) harp(m, out, t, chord.b + 24 + pick([0, 7, 12]), 0.6);
        if (x > 0.12 && (pos === 0 || pos === 3)) drum(m, L.pulse, t, pos === 0 ? 0.5 : 0.3, 1.3); // heartbeat
        break;
      }
      case 'combat': {
        if (chordStart) { pad(m, out, t, chord.pad, chordDur + 0.3, 0.4); drone(m, out, t, chord.b, chordDur + 0.3); }
        // drums: density follows intensity
        const hits: Record<number, number> = { 0: 1, 8: 0.7 };
        if (x > 0.3) { hits[6] = 0.45; hits[14] = 0.5; }
        if (x > 0.6) { hits[3] = 0.35; hits[10] = 0.4; hits[11] = 0.3; if (bar % 2 === 1) hits[15] = 0.35; }
        const h = hits[pos];
        if (h) drum(m, L.drums, t, h * (0.85 + Math.random() * 0.15));
        // muted ostinato: 8ths, 16ths when hot
        const ostRoot = chord.b + 12;
        const pattern = [0, 7, 12, 7, 0, 7, 10, 7];
        if (pos % 2 === 0 && x > 0.12) pluck(m, L.ost, t, ostRoot + pattern[pos / 2]!, pos % 4 === 0 ? 1 : 0.7);
        else if (pos % 2 === 1 && x > 0.7) pluck(m, L.ost, t, ostRoot + 12, 0.4, 0.1);
        if (pos % 4 === 2 && x > 0.4) hat(m, L.hats, t, 0.8);
        else if (pos % 2 === 1 && x > 0.75) hat(m, L.hats, t, 0.4);
        if (pos === 0 && bar % 2 === 0 && Math.random() < 0.3) this.motif(s, chord, 2, 'bell', 12);
        break;
      }
      case 'boss': {
        if (chordStart) {
          pad(m, out, t, chord.pad, chordDur + 0.3, 0.6);
          drone(m, out, t, chord.b - 12, chordDur + 0.3);
          if (bar % 2 === 0) brass(m, out, t, [chord.b, chord.b + 7, chord.b + 12], chordDur * 2 - 0.4);
        }
        const hits: Record<number, number> = { 0: 1, 4: 0.6, 8: 0.85, 12: 0.6, 10: 0.4 };
        if (x > 0.5) { hits[3] = 0.4; hits[7] = 0.35; hits[14] = 0.5; }
        if (bar % 4 === 3) { hits[13] = 0.5; hits[14] = 0.6; hits[15] = 0.7; } // fill
        const h = hits[pos];
        if (h) drum(m, L.drums, t, h, pos === 0 ? 1.4 : 1.15);
        const ost = [0, 0, 12, 0, 1, 0, 12, 0, 0, 0, 12, 0, 1, 0, 13, 12];
        pluck(m, L.ost, t, chord.b + 12 + ost[pos]!, pos % 4 === 0 ? 1 : 0.6, 0.12);
        if (pos % 2 === 1 || x > 0.6) hat(m, L.hats, t, pos % 4 === 2 ? 0.9 : 0.5);
        break;
      }
      case 'victory': {
        if (chordStart) {
          pad(m, out, t, chord.pad, chordDur + 0.8);
          drone(m, out, t, chord.b, chordDur + 0.8);
          chord.pad.forEach((n, i) => harp(m, out, t + i * this.dt * 0.7, n + 12, 0.8));
        }
        if (pos === 8 && bar >= 6 && Math.random() < 0.35) this.motif(s, chord, 3, 'bell', 12);
        break;
      }
      case 'defeat': {
        if (s === 0) { pad(m, out, t, chord.pad, 9, 0.5); drone(m, out, t, chord.b, 10); }
        const fall: Record<number, number> = { 4: 69, 8: 67, 12: 65, 16: 64, 22: 62 };
        const n = fall[s];
        if (n !== undefined) harp(m, out, t, n, s === 22 ? 1 : 0.8);
        if (s === 22) harp(m, out, t + 0.02, 50, 0.6);
        if (s >= 40) this.ended = true; // then silence
        break;
      }
    }
  }

  /** Queue a short phrase on 8th notes, starting at step s, drawn from chord tones and the mode. */
  private motif(s: number, chord: Chord, notes: number, voice: 'harp' | 'bell', up: number): void {
    const tones = chord.pad.map((n) => n + up);
    let cur = pick(tones);
    let at = s + (voice === 'bell' ? 2 * Math.floor(Math.random() * 3) : 0);
    for (let i = 0; i < notes; i++) {
      const n = cur, vel = i === 0 ? 0.9 : 0.6 + Math.random() * 0.3;
      this.later(at, () => {
        const t = this.next;
        if (voice === 'harp') harp(this.m, this.out, t, n, vel);
        else bellNote(this.m, this.out, t, n, vel);
      });
      at += pick([2, 2, 4, voice === 'harp' ? 3 : 6]);
      // walk by step along the dorian scale, sometimes leap to a chord tone
      if (Math.random() < 0.35) cur = pick(tones);
      else {
        const idx = DORIAN.indexOf(((cur - up - 62) % 12 + 12) % 12 + 62);
        const nb = DORIAN[Math.max(0, Math.min(DORIAN.length - 1, (idx < 0 ? 4 : idx) + pick([-1, 1, 1, 2])))]!;
        cur = nb + up + Math.floor((cur - up - 62) / 12) * 12;
      }
    }
  }
}

export class MusicSystem {
  private current: MoodPlayer | null = null;
  private retiring: MoodPlayer[] = [];
  mood: MusicMood = 'none';

  constructor(private core: MusicCore, private dest: AudioNode) {}

  setMood(mood: MusicMood, now: number): void {
    if (mood === this.mood) return;
    this.mood = mood;
    if (this.current) { this.current.retire(now, 1.5); this.retiring.push(this.current); this.current = null; }
    if (mood !== 'none') this.current = new MoodPlayer(this.core, mood, this.dest, now + 0.06);
  }

  setIntensity(x: number, now: number): void {
    this.core.intensity = x;
    this.current?.setIntensity(x, now);
  }

  tick(now: number, lookahead: number): void {
    this.current?.schedule(now + lookahead, now);
    for (let i = this.retiring.length - 1; i >= 0; i--) {
      const p = this.retiring[i]!;
      if (now > p.deadAt) { p.dispose(); this.retiring.splice(i, 1); }
    }
  }

  players(): number { return (this.current ? 1 : 0) + this.retiring.length; }
}
