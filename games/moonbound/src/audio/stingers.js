// Moonbound audio: the stingers, short musical gestures that play over the score (a room cleared, a
// blessing, a boss waking). They are written against the tonic of whatever theme is playing, so they
// are always in key: R is the tonic as a MIDI note (57..68), and the intervals are the intervals of a
// minor key (a fifth, an octave, a ninth), with a major third for the rare lift (the ending).
// They are built live from the same instruments as the score, on the stinger bus.
//
//   fn(E, R): E has the context, the kit, the bank and E.out (the stinger bus); every instrument takes
//   (kit, E.out, time, ...) and times are seconds from now (E.t0 + ...).
//   needs(R): the choir pads (vowel, midi) it plays, so audio.js can have them built ahead.
import { bell, harp, brass, choirNote, drum } from './instruments.js';

const b = (E, at, m, vel, o) => bell(E.k, E.out, E.t0 + at, m, vel, o);
const h = (E, at, m, vel) => harp(E.k, E.bank, E.out, E.t0 + at, m, vel);
const br = (E, at, m, dur, g) => brass(E.k, E.out, E.t0 + at, m, dur, { g, lp0: 320, lp: 2400, lp1: 1300 });
const ch = (E, at, vowel, m, dur, o) => choirNote(E.k, E.bank, E.out, E.t0 + at, vowel, m, dur, o);
const dr = (E, at, name, vel) => drum(E.k, E.bank, E.out, E.t0 + at, name, vel);

export const STINGERS = {
  // the run begins: a low toll, a choir rising on a fifth, bells climbing, a rush of air to a soft crash
  run_start: {
    duck: [0.55, 2.4],
    needs: (R) => [['ah', R - 12], ['ah', R - 5], ['ah', R]],
    fn(E, R) {
      b(E, 0, R - 12, 0.75, { kind: 'toll', ts: 0.9 });
      dr(E, 0, 'don', 0.6);
      ch(E, 0.05, 'ah', R - 12, 2.2, { g: 0.11, a: 1.1, r: 1.6 });
      ch(E, 0.12, 'ah', R - 5, 2.2, { g: 0.1, a: 1.2, r: 1.6 });
      ch(E, 0.2, 'ah', R, 2.2, { g: 0.09, a: 1.3, r: 1.6 });
      b(E, 0.5, R + 12, 0.5, { kind: 'hand' });
      b(E, 0.85, R + 19, 0.5, { kind: 'hand' });
      b(E, 1.2, R + 24, 0.55, { kind: 'hand' });
      dr(E, 0.1, 'riser', 0.3);
      b(E, 2.3, R + 24, 0.45, { kind: 'glass' });
      dr(E, 2.4, 'crash', 0.22);
    },
  },

  // a room is cleared: a breath out, bells settling on the fifth and the ninth
  room_clear: {
    duck: [0.7, 1.4],
    needs: (R) => [['ah', R], ['ah', R + 7]],
    fn(E, R) {
      dr(E, 0, 'don_s', 0.4);
      b(E, 0.02, R + 12, 0.5, { kind: 'hand', ts: 0.9 });
      b(E, 0.2, R + 19, 0.45, { kind: 'hand', ts: 0.9 });
      b(E, 0.4, R + 24, 0.4, { kind: 'hand', ts: 0.9 });
      b(E, 0.7, R + 26, 0.3, { kind: 'glass' });
      ch(E, 0.05, 'ah', R, 1.5, { g: 0.06, a: 0.5, r: 1.4 });
      ch(E, 0.1, 'ah', R + 7, 1.5, { g: 0.055, a: 0.6, r: 1.4 });
    },
  },

  // a reward: a harp running up the minor pentatonic and a glass bell above it
  reward: {
    duck: [0.7, 1.2],
    needs: () => [],
    fn(E, R) {
      [0, 3, 7, 10, 12, 15, 19].forEach((iv, i) => h(E, i * 0.075, R + 12 + iv, 0.75 + i * 0.04));
      b(E, 0.55, R + 31, 0.6, { kind: 'glass', ts: 1.2 });
      b(E, 0.7, R + 24, 0.5, { kind: 'glass', ts: 1.2 });
      for (let i = 0; i < 4; i++) b(E, 0.6 + i * 0.12, R + 36 - [0, 2, 5, 7][i], 0.15, { kind: 'glass', ts: 0.6 });
    },
  },

  // a blessing: a choir on open fifths and an octave, a bell, a glitter of glass
  blessing: {
    duck: [0.55, 2.4],
    needs: (R) => [['ah', R - 12], ['ah', R - 5], ['ah', R], ['oh', R + 7]],
    fn(E, R) {
      ch(E, 0, 'ah', R - 12, 2.4, { g: 0.1, a: 1.0, r: 1.8 });
      ch(E, 0.05, 'ah', R - 5, 2.4, { g: 0.1, a: 1.1, r: 1.8 });
      ch(E, 0.1, 'ah', R, 2.4, { g: 0.1, a: 1.2, r: 1.8 });
      ch(E, 0.3, 'oh', R + 7, 2.0, { g: 0.07, a: 1.2, r: 1.8 });
      b(E, 0.1, R + 12, 0.55, { kind: 'church', ts: 0.9 });
      b(E, 0.9, R + 24, 0.4, { kind: 'glass', ts: 1.2 });
      for (let i = 0; i < 6; i++) b(E, 0.5 + i * 0.22, R + 31 + (i % 3) * 5 - (i > 2 ? 12 : 0), 0.13, { kind: 'glass', ts: 0.8 });
    },
  },

  // a boss wakes: a sub boom, iron brass on the root and fifth, a choir stab, the drums crescendo
  boss_intro: {
    duck: [0.35, 3.4],
    needs: (R) => [['ah', R - 12], ['ah', R - 5]],
    fn(E, R) {
      dr(E, 0, 'boom', 0.7);
      dr(E, 0, 'crash', 0.35);
      b(E, 0, R - 12, 0.65, { kind: 'toll' });
      br(E, 0, R - 24 + 12, 1.4, 0.2);
      br(E, 0.02, R - 17 + 12, 1.4, 0.17);
      br(E, 0.04, R - 12 + 12, 1.4, 0.15);
      ch(E, 0.05, 'ah', R - 12, 2.8, { g: 0.12, a: 0.2, r: 2.2 });
      ch(E, 0.1, 'ah', R - 5, 2.8, { g: 0.1, a: 0.2, r: 2.2 });
      [0.55, 1.0, 1.4, 1.7, 1.9].forEach((at, i) => dr(E, at, i < 3 ? 'don' : 'don_m', 0.65 + i * 0.08));
    },
  },

  // the fight turns: a rush upward into a dissonant stab and two hard strikes
  boss_phase: {
    duck: [0.4, 2.7],
    needs: (R) => [['ah', R], ['ah', R + 1]],
    fn(E, R) {
      dr(E, 0, 'riser', 0.55);
      br(E, 1.9, R - 12, 1.0, 0.2);
      br(E, 1.92, R - 11, 1.0, 0.15); // the flat ninth against the root
      br(E, 1.94, R - 6, 1.0, 0.15); // the tritone
      ch(E, 1.85, 'ah', R, 1.4, { g: 0.1, a: 0.1, r: 1.4 });
      ch(E, 1.9, 'ah', R + 1, 1.4, { g: 0.07, a: 0.1, r: 1.4 });
      dr(E, 1.9, 'boom', 0.5);
      dr(E, 1.9, 'don', 0.75);
      dr(E, 2.1, 'don', 0.65);
      dr(E, 1.95, 'crash', 0.4);
    },
  },

  // the boss falls: one enormous hit, a silence, then the choir lifts to the major
  boss_defeat: {
    duck: [0.15, 6],
    needs: (R) => [['ah', R - 12], ['ah', R - 5], ['ah', R], ['ah', R + 4]],
    fn(E, R) {
      dr(E, 0, 'boom', 0.75);
      dr(E, 0, 'crash', 0.4);
      dr(E, 0, 'don', 0.8);
      b(E, 0, R - 12, 0.7, { kind: 'toll' });
      ch(E, 1.6, 'ah', R - 12, 3.6, { g: 0.11, a: 1.4, r: 2.4 });
      ch(E, 1.7, 'ah', R - 5, 3.6, { g: 0.1, a: 1.5, r: 2.4 });
      ch(E, 1.8, 'ah', R, 3.6, { g: 0.1, a: 1.6, r: 2.4 });
      ch(E, 2.0, 'ah', R + 4, 3.4, { g: 0.08, a: 1.6, r: 2.4 });
      b(E, 1.9, R + 12, 0.5, { kind: 'hand' });
      b(E, 2.4, R + 16, 0.5, { kind: 'hand' });
      b(E, 2.9, R + 19, 0.5, { kind: 'hand' });
      b(E, 3.4, R + 24, 0.55, { kind: 'glass', ts: 1.4 });
    },
  },

  // the heroine falls: two low tolls, a boom, and the choir sinking away
  death: {
    duck: [0.25, 4.2],
    needs: (R) => [['oh', R + 7], ['oh', R + 5], ['oh', R + 3]],
    fn(E, R) {
      dr(E, 0.05, 'boom', 0.5);
      b(E, 0, R - 12, 0.7, { kind: 'toll' });
      b(E, 1.7, R - 17, 0.55, { kind: 'toll' });
      ch(E, 0.3, 'oh', R + 7, 2.2, { g: 0.1, a: 0.9, r: 2.2 });
      ch(E, 1.3, 'oh', R + 5, 2.0, { g: 0.09, a: 0.9, r: 2.2 });
      ch(E, 2.3, 'oh', R + 3, 2.0, { g: 0.08, a: 0.9, r: 2.4 });
    },
  },

  // the end of the road: bells climbing a major arpeggio, a harp, a brass swell and a full choir in the major
  ending: {
    duck: [0.3, 8],
    needs: (R) => [['ah', R - 12], ['ah', R - 5], ['ah', R], ['ah', R + 4], ['oh', R + 7]],
    fn(E, R) {
      [0, 4, 7, 12, 16].forEach((iv, i) => b(E, i * 0.5, R + 12 + iv, 0.55, { kind: 'hand', ts: 1.2 }));
      [0, 4, 7, 12, 16, 19, 24].forEach((iv, i) => h(E, 0.3 + i * 0.12, R + 12 + iv, 0.45));
      br(E, 1.8, R - 12, 4.2, 0.17);
      br(E, 1.85, R - 5, 4.2, 0.14);
      ch(E, 1.6, 'ah', R - 12, 5.2, { g: 0.12, a: 1.6, r: 3 });
      ch(E, 1.7, 'ah', R - 5, 5.2, { g: 0.11, a: 1.7, r: 3 });
      ch(E, 1.8, 'ah', R, 5.2, { g: 0.11, a: 1.8, r: 3 });
      ch(E, 2.0, 'ah', R + 4, 5.0, { g: 0.09, a: 1.8, r: 3 });
      ch(E, 2.2, 'oh', R + 7, 4.6, { g: 0.07, a: 1.8, r: 3 });
      dr(E, 3.7, 'crash', 0.35);
      dr(E, 3.7, 'don', 0.8);
      b(E, 3.8, R + 24, 0.6, { kind: 'church', ts: 1.2 });
      b(E, 4.2, R + 28, 0.4, { kind: 'glass', ts: 1.5 });
    },
  },
};
