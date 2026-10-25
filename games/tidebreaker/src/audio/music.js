// Tidebreaker score: a procedural sea shanty in D dorian, 6/8, that follows the
// game. One look-ahead scheduler (run from updateAudio every frame) places
// every note on the AudioContext clock ~0.2 s ahead, one eighth at a time, so
// timing never depends on frame or timer jitter.
//   calm   title, cards, between waves: harp arpeggios, squeezebox, a flute tune
//   combat the same tune driven: gallop bass, bodhran, stabs, fiddle, brass at
//          high intensity (enemies alive, a battered hull)
//   boss   a dark 8-bar theme (Dm Bb Gm A | Dm Eb Dm A): low brass, timpani,
//          staccato strings, choir; the serpent's lead is an eerie whistle,
//          the Leviathan's a brass line; later phases add drums and speed
//   stings victory fanfare and defeat lament (the score rests under them)
// Mode changes land on bar lines so the tune never breaks mid-phrase.
import { A, gain, filt, osc, noise, hitEnv, swell, mtof, clamp, rnd } from './core.js';
import { horn, timp, choirNote, bell } from './sfx.js';

const PC = { C: 0, 'C#': 1, D: 2, Eb: 3, E: 4, F: 5, G: 7, A: 9, Bb: 10, B: 11 };
const CHORD = {
  Dm: ['D', 'F', 'A'], C: ['C', 'E', 'G'], Am: ['A', 'C', 'E'], G: ['G', 'B', 'D'], F: ['F', 'A', 'C'],
  Bb: ['Bb', 'D', 'F'], Gm: ['G', 'Bb', 'D'], A: ['A', 'C#', 'E'], Eb: ['Eb', 'G', 'Bb'],
};
// chord tones placed at or above lo; bass root in 36..47
const voicing = (name, lo = 52) => CHORD[name].map((n) => { let m = PC[n]; while (m < lo) m += 12; return m; }).sort((a, b) => a - b);
const bassOf = (name) => 36 + PC[CHORD[name][0]];

const SONG = ['Dm', 'C', 'Dm', 'Am', 'Dm', 'G', 'C', 'Dm', 'F', 'C', 'Dm', 'Am', 'Dm', 'G', 'C', 'Dm'];
// melody: [semitones from D4, eighths] per bar (null = rest)
const TUNE = [
  [[7, 2], [7, 1], [12, 2], [7, 1]], [[5, 2], [2, 1], [-2, 2], [2, 1]], [[0, 2], [3, 1], [7, 2], [12, 1]], [[14, 3], [12, 2], [10, 1]],
  [[7, 2], [7, 1], [12, 2], [14, 1]], [[15, 2], [14, 1], [12, 2], [9, 1]], [[10, 2], [7, 1], [5, 2], [2, 1]], [[0, 5], [null, 1]],
  [[7, 2], [10, 1], [15, 3]], [[14, 2], [12, 1], [10, 2], [5, 1]], [[7, 2], [3, 1], [0, 2], [3, 1]], [[2, 2], [-2, 1], [-5, 3]],
  [[0, 2], [2, 1], [3, 2], [5, 1]], [[7, 2], [9, 1], [12, 2], [9, 1]], [[10, 2], [14, 1], [12, 2], [10, 1]], [[12, 3], [0, 3]],
];
const BOSS = ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Eb', 'Dm', 'A'];
const BOSS_TUNE = [ // semitones from D3
  [[0, 3], [3, 2], [2, 1]], [[-2, 2], [-4, 1], [-2, 3]], [[5, 3], [3, 2], [2, 1]], [[-1, 6]],
  [[0, 3], [3, 2], [7, 1]], [[8, 3], [7, 2], [5, 1]], [[3, 2], [2, 1], [0, 3]], [[-1, 3], [-5, 3]],
];
// tune events starting at each eighth of a bar: [[eighth, offset, length]]
const atEighth = (bar) => { const out = []; let j = 0; for (const [o, d] of bar) { if (o != null) out.push([j, o, d]); j += d; } return out; };
const TUNE_AT = TUNE.map(atEighth), BOSS_AT = BOSS_TUNE.map(atEighth);

export const M = { mode: 'calm', want: 'calm', next: 0, j: 0, bar: 0, intensity: 0, boss: null, phase: 1, rest: 0, notes: 0, level: 1 };

// ------------------------------------------------------------ instruments
const bus = () => A.music;
function pluck(at, midi, vel = 0.5, tau = 0.35) {
  const g = gain(null, 0, bus()), f = filt('lowpass', 3000, 1.2, g), hz = mtof(midi);
  f.frequency.setValueAtTime(Math.min(9000, hz * 9), at); f.frequency.setTargetAtTime(hz * 2.2, at, 0.12);
  osc('triangle', hz, at, at + tau * 5, f);
  osc('sawtooth', hz, at, at + tau * 5, gain(null, 0.22, f));
  hitEnv(g.gain, at, 0.3 * vel, 0.003, tau);
  M.notes++;
}
function bass(at, midi, len, vel = 0.6, bright = 500) {
  const g = gain(null, 0, bus()), f = filt('lowpass', bright, 1.5, g), hz = mtof(midi);
  osc('triangle', hz, at, at + len + 0.3, f);
  osc('sawtooth', hz, at, at + len + 0.3, gain(null, 0.35, f));
  f.frequency.setValueAtTime(bright * 1.8, at); f.frequency.setTargetAtTime(bright, at, 0.06);
  swell(g.gain, at, 0.45 * vel, 0.006, len * 0.55, 0.07);
  M.notes++;
}
function pad(at, midis, len, vel = 0.3) {
  // squeezebox: reedy detuned squares and saws with a gentle bellows tremolo
  const g = gain(null, 0, bus()), f = filt('lowpass', 1300, 0.8, g);
  const trem = gain(null, 1, f);
  osc('sine', 5.2, at, at + len + 0.3, gain(null, 0.12, trem.gain));
  for (const m of midis) {
    const hz = mtof(m);
    osc('square', hz, at, at + len + 0.3, gain(null, 0.5, trem)).detune.value = -6;
    osc('sawtooth', hz, at, at + len + 0.3, gain(null, 0.5, trem)).detune.value = 7;
  }
  swell(g.gain, at, 0.07 * vel / Math.sqrt(midis.length / 3), 0.08, Math.max(0.05, len - 0.12), 0.08);
  M.notes++;
}
function lead(at, midi, len, vel = 0.5, kind = 'flute') {
  const g = gain(null, 0, bus()), hz = mtof(midi);
  const rev = gain(null, kind === 'whistle' ? 0.5 : 0.25, A.revIn); g.connect(rev);
  let tone;
  if (kind === 'fiddle') {
    const lp = filt('lowpass', 3200, 0.9, g), hp = filt('highpass', 260, 0.7, lp);
    tone = osc('sawtooth', hz, at, at + len + 0.3, hp);
    const t2 = osc('sawtooth', hz, at, at + len + 0.3, gain(null, 0.5, hp)); t2.detune.value = 8;
    osc('sine', 5.6, at, at + len + 0.3, gain(null, 14, t2.detune));
  } else {
    tone = osc('sine', hz, at, at + len + 0.3, g);
    if (kind === 'flute') osc('triangle', hz * 2, at, at + len + 0.3, gain(null, 0.12, g));
    const bn = gain(null, 0, g); // breath
    noise('white', at, at + Math.min(0.25, len), filt('bandpass', hz * 2, 2, bn));
    hitEnv(bn.gain, at, kind === 'whistle' ? 0.02 : 0.08, 0.01, 0.05);
  }
  // vibrato fades in on longer notes
  const vd = gain(null, 0, tone.detune);
  osc('sine', kind === 'whistle' ? 4.4 : 5.4, at, at + len + 0.3, vd);
  vd.gain.setValueAtTime(0, at); vd.gain.linearRampToValueAtTime(kind === 'whistle' ? 30 : 14, at + Math.max(0.15, len * 0.7));
  const a = (kind === 'fiddle' ? 0.12 : kind === 'whistle' ? 0.16 : 0.22) * vel;
  swell(g.gain, at, a, kind === 'fiddle' ? 0.025 : 0.04, Math.max(0.02, len * 0.82 - 0.04), 0.05);
  M.notes++;
}
function bodhran(at, vel = 0.6, low = false) {
  const g = gain(null, 0, bus()), o = osc('sine', low ? 95 : 140, at, at + 0.4, g);
  o.frequency.setValueAtTime(low ? 110 : 165, at); o.frequency.exponentialRampToValueAtTime(low ? 55 : 85, at + 0.12);
  hitEnv(g.gain, at, 0.55 * vel, 0.002, low ? 0.12 : 0.06);
  const ng = gain(null, 0, bus());
  noise('pink', at, at + 0.12, filt('lowpass', 1100, 0.8, ng));
  hitEnv(ng.gain, at, 0.3 * vel, 0.001, 0.025);
  M.notes++;
}
function shaker(at, vel = 0.3) {
  const g = gain(null, 0, bus());
  noise('white', at, at + 0.08, filt('highpass', 6500, 0.7, g));
  hitEnv(g.gain, at, 0.18 * vel, 0.004, 0.02);
}
function strings(at, midi, len, vel = 0.5) {
  const g = gain(null, 0, bus()), f = filt('lowpass', 900, 1, g), hz = mtof(midi);
  osc('sawtooth', hz, at, at + len + 0.2, f).detune.value = -5;
  osc('sawtooth', hz, at, at + len + 0.2, f).detune.value = 5;
  swell(g.gain, at, 0.09 * vel, 0.012, len * 0.45, 0.05);
  M.notes++;
}
const out = () => ({ out: A.music });

// ------------------------------------------------------------- the score
const eighth = () => M.mode === 'calm' ? 0.27 : M.mode === 'combat' ? 0.205 - M.intensity * 0.02 : M.phase >= 3 ? 0.2 : 0.225;

function play(at) {
  const j = M.j, E = eighth();
  if (M.mode === 'silent') return;
  if (M.mode === 'boss') return playBoss(at, j, E);
  const name = SONG[M.bar % 16], ch = voicing(name), b = bassOf(name), I = M.intensity;
  const tune = TUNE_AT[M.bar % 16].filter((n) => n[0] === j);
  if (M.mode === 'calm') {
    if (j === 0) { bass(at, b, E * 2.4, 0.55, 380); pad(at, voicing(name, 55), E * 6, 0.6); }
    if (j === 3) bass(at, b + 7, E * 2.4, 0.4, 380);
    if (j === 1 || j === 4) pluck(at, ch[1], 0.45);
    if (j === 2 || j === 5) pluck(at, j === 2 ? ch[2] : ch[0] + 12, 0.38);
    // the tune rests on every other pass through the A part, so the harp can breathe
    const cycle = Math.floor(M.step / 96);
    if (!(cycle % 2 === 1 && M.bar % 16 < 8)) for (const [, o, d] of tune) lead(at, 74 + o - 12, d * E, 0.7, 'flute');
    return;
  }
  // combat
  if (j === 0) bass(at, b, E * 0.8, 0.8, 600);
  if (j === 2) bass(at, b, E * 0.6, 0.55, 600);
  if (j === 3) bass(at, b + 7, E * 0.8, 0.7, 600);
  if (j === 5) bass(at, b + 12, E * 0.6, 0.5, 600);
  const drum = [1, 0.25, 0.5, 0.8, 0.25, 0.55][j] * (0.55 + 0.45 * I);
  bodhran(at, drum, j === 0 || j === 3);
  if (I > 0.55) shaker(at, j % 3 === 0 ? 0.6 : 0.35);
  if (j === 1 || j === 2 || j === 4 || j === 5) pad(at, ch, E * 0.55, 0.9);
  if (I > 0.75 && j === 0 && M.bar % 4 === 0) { horn(out(), at, b + 12, E * 5, 0.1); horn(out(), at, b + 19, E * 5, 0.07); }
  for (const [, o, d] of tune) lead(at, 74 + o, d * E, 0.75, I > 0.4 ? 'fiddle' : 'flute');
}

function playBoss(at, j, E) {
  const name = BOSS[M.bar % 8], b = bassOf(name), ch = voicing(name, 50), ph = M.phase;
  if (j === 0) {
    horn(out(), at, b - 12 < 26 ? b : b - 12, E * 6, 0.16);
    horn(out(), at, b, E * 6, 0.1);
    for (const m of ch) choirNote(out(), at, m + (ph >= 3 ? 12 : 0), E * 6, 0.035);
  }
  if (j === 0 || j === 3) timp(out(), at, b + (j === 3 ? 7 : 0), j === 0 ? 0.6 : 0.4);
  if ((M.bar % 4 === 3) && j >= 3) { timp(out(), at + E / 2, b, 0.3); }
  const ost = [0, 0, 12, 0, 7, 12][j];
  strings(at, b + 12 + ost, E * 0.7, 0.8 + (ph - 1) * 0.15);
  if (ph >= 2) bodhran(at, [1, 0.3, 0.5, 0.9, 0.3, 0.6][j], j === 0 || j === 3);
  if (ph >= 3) shaker(at, 0.4);
  const tune = BOSS_AT[M.bar % 8].filter((n) => n[0] === j);
  for (const [, o, d] of tune) {
    if (M.boss === 'serpent') lead(at, 74 + o, d * E, 0.8, 'whistle');
    else { horn(out(), at, 50 + o, d * E * 0.95, 0.13); if (ph >= 2) horn(out(), at, 62 + o, d * E * 0.95, 0.06); }
  }
}

// Stings: scheduled at once, the score rests under them.
export function sting(kind) {
  if (!A.ctx || A.muted) return;
  const t = A.ctx.currentTime + 0.08, o = out();
  if (kind === 'won') {
    const line = [[69, 0.2], [74, 0.2], [78, 0.2], [76, 0.2], [74, 0.2], [76, 0.2], [78, 0.6], [81, 1.8]];
    let at = t;
    for (const [m, d] of line) { horn(o, at, m, d * 0.92, 0.12); at += d; }
    const chords = [[0, 0.8, [50, 54, 57]], [0.8, 0.4, [43, 50, 55, 59]], [1.2, 0.6, [45, 52, 57, 61]], [1.8, 2.2, [38, 50, 54, 57, 62]]];
    for (const [s, d, ms] of chords) for (const m of ms) horn(o, t + s, m, d, 0.06);
    for (const s of [0, 0.8, 1.2, 1.8]) timp(o, t + s, 38, 0.5);
    for (let i = 0; i < 8; i++) timp(o, t + 1.45 + i * 0.045, 45, 0.15 + i * 0.03);
    bell(o, t + 1.8, 86, 0.08, 0.8); bell(o, t + 1.8, 93, 0.05, 0.8);
    M.rest = t + 4.6;
  } else {
    const line = [[57, 0.6], [55, 0.6], [53, 0.6], [52, 0.6], [50, 2.4]];
    let at = t;
    for (const [m, d] of line) { horn(o, at, m - 12, d * 0.95, 0.12); at += d; }
    for (const m of [50, 53, 57]) choirNote(o, t + 0.2, m, 4.2, 0.04);
    for (const s of [0, 1.2, 2.4]) bell(o, t + s, 50, 0.12, 1.4);
    M.rest = t + 5.2;
  }
  M.mode = 'silent';
}

// What the game wants to hear now (called every frame).
export function follow(G, dt, combatHold) {
  const s = G.scene === 'paused' ? (G.resumeScene || 'play') : G.scene;
  let want = 'calm', I = 0;
  const alive = G.enemies ? G.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0) : 0;
  if (s === 'play') {
    const bk = G.boss && (G.boss.hp ?? 1) > 0 ? G.boss.kind : null;
    const p = G.player, hull = p && p.maxHp ? clamp(p.hp / p.maxHp, 0, 1) : 1;
    if (bk === 'serpent' || bk === 'leviathan') { want = 'boss'; M.boss = bk; M.phase = G.boss.phase || 1; }
    else if (alive > 0 || combatHold > 0 || bk) want = 'combat';
    I = clamp(alive / 5, 0, 1) * 0.7 + (1 - hull) * 0.35 + (bk ? 0.35 : 0);
  }
  M.want = want;
  const target = clamp(I, 0, 1);
  M.intensity += (target - M.intensity) * Math.min(1, dt * 0.6);
}

export function schedule() {
  const c = A.ctx;
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;
  if (M.next < t - 0.25) M.next = t + 0.06; // the tab slept: pick up again, don't burst
  while (M.next < t + 0.2) {
    if (M.j === 0) {
      if (M.mode === 'silent' && M.next >= M.rest) M.mode = M.want;
      else if (M.mode !== 'silent' && M.mode !== M.want) {
        if (M.want === 'boss' || M.mode === 'boss') M.bar = 0;
        M.mode = M.want;
      }
    }
    if (!A.muted) play(M.next);
    M.next += eighth();
    M.step = (M.step || 0) + 1;
    if (++M.j >= 6) { M.j = 0; M.bar++; }
  }
}

export function startMusic() { if (A.ctx) M.next = A.ctx.currentTime + 0.15; }
