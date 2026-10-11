// Moonbound audio: small helpers the themes share (themes.js): chord sequences with voice leading,
// playing a written melody line through an instrument, counting how long a chord lasts.
import { chordOf, voiceLead, voicingPcs, noteNum } from './theory.js';

export const N = noteNum;

// does a new chord start at bar i? (a chord written twice in a row is one chord)
export const isStart = (list, i) => i === 0 || list[i] !== list[i - 1];

// how many bars the chord at i lasts (to the end of the list)
export function runLen(list, i) {
  let n = 1;
  while (i + n < list.length && list[i + n] === list[i]) n++;
  return n;
}

// Voicings for a list of chord symbols, led smoothly from each to the next (and round the loop):
// returns one sorted MIDI array per entry. pcs(chord) picks the pitch classes (default: n voices).
export function leadSeq(list, lo, hi, n, pcs = (c) => voicingPcs(c, n)) {
  const out = new Array(list.length);
  let prev = null;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < list.length; i++) {
      let v;
      if (i > 0 && list[i] === list[i - 1]) v = out[i - 1] || prev;
      else v = voiceLead(prev, pcs(chordOf(list[i])), lo, hi, n);
      prev = v;
      if (pass === 1) out[i] = v;
    }
  }
  return out;
}

// play a written line (theory.js line()) through an instrument on a layer. unit = seconds per
// line unit. o: { vel, shift (semitones), opts (instrument options), hum (ms), legato }
export function playLine(S, layer, inst, ln, t0, unit, o = {}) {
  for (const e of ln) {
    const t = t0 + e.b * unit + S.h(o.hum ?? 10);
    const vel = (o.vel ?? 0.8) * e.v * (0.92 + S.rnd() * 0.16);
    const m = e.m + (o.shift || 0);
    const dur = e.d * unit * (o.legato ?? 0.95);
    if (inst === 'bell') S.bell(layer, t, m, vel, o.opts);
    else if (inst === 'box') S.box(layer, t, m, vel, o.opts);
    else if (inst === 'harp') S.harp(layer, t, m, vel, o.opts);
    else if (inst === 'brass') S.brass(layer, t, m, dur, { g: 0.2 * vel, ...(o.opts || {}) });
    else if (inst === 'bowed') S.bowed(layer, t, m, dur, { g: 0.2 * vel, ...(o.opts || {}) });
    else if (inst === 'choir') S.choir(layer, t, (o.opts && o.opts.vowel) || 'ah', m, dur, { g: 0.12 * vel, ...(o.opts || {}) });
  }
}

// the unique [vowel, midi] pairs a choir part needs (so the bank can build the pads ahead)
export function choirSet(vowel, voicings) {
  const set = new Map();
  for (const v of voicings) for (const m of v) set.set(`${vowel}:${m}`, [vowel, m]);
  return [...set.values()];
}
