// Marble Run's sound. Everything is synthesised with Web Audio: there are no
// audio files and no voices.
//
// The star is the rolling. A glass marble is far too small and stiff to ring
// audibly itself (its first mode is ultrasonic), so what we hear is the track
// it rolls on, driven by the roughness of the contact. That roughness is a
// fixed pattern in space, so the faster the marble goes the higher and
// denser the noise it makes: each rolling voice plays a "surface profile"
// (a smooth rumble and a crackle of tiny bumps) at a playback rate
// proportional to speed, then through the fixed resonances of what it is
// rolling on (a hollow wooden trough, a plastic shell, the column of air in
// a tube, a ringing glass rail). A spiral funnel adds the circling: a pulse
// once per orbit that speeds up towards the hole, and a whirr that rises.
// Up to six voices follow the loudest marbles and crossfade on every change
// of surface, so nothing zips or clicks.
//
// Joins, landings and marble-on-marble clacks are modelled physically: a
// short contact-force pulse drives a bank of damped modes for each surface
// (a soft wooden "tok", a light plastic "tick", a bright glass "tink"),
// rendered once into small buffers, then played by a voice pool with a
// budget and voice stealing so a burst of marbles never turns into noise.
// Bells are additive, with each family's real partials: brass hand bells
// (the tuned twelfth and a shimmer of split modes), pure glass bells,
// little carillon bells (with the bell's minor third) and tubular planet
// chimes, all tuned to the level's key.
//
// Music is a gentle generative loop per level on small pre-rendered
// instruments, with a fresh variation of the tune on each pass.
//
// All of it runs on any BaseAudioContext, so _dev/audio.html can render and
// measure every sound offline without playing anything aloud.
import { load, save } from './config.js';

// ------------------------------------------------------------ levels

const MASTER = 0.8;
const MUSIC = 0.11; // the music bus, before each level's own level
const TONES = 0.3; // tuned effects (bells, dings, flourishes)
const HIT = 0.5; // one full-strength impact voice
const ROLL = 0.17; // one rolling voice at full speed on wood
const BELL = 0.7; // one full-strength bell, inside the tones bus
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
// The impact budget: a burst, then a steady rate, and a cap per animation
// frame. Joins and paddle ticks have a bucket of their own so a run full of
// marbles ticking over joins cannot starve the landings and clacks.
const MAX_HITS = COARSE ? 12 : 18;
const PER_FRAME = 5;
const BUCKETS = { hit: [12, 60], tick: [6, 30] }; // [burst, per second]
const MAX_ROLL = COARSE ? 4 : 6; // rolling voices
const MAX_CHAINS = MAX_ROLL * 2 + 2; // including those fading out
const MAX_BELLS = 9;
const FULL = 1.6; // m/s: a rolling voice at its reference loudness
const R_MARBLE = 0.0095;

// ------------------------------------------------------------ music theory

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const unit = (v) => clamp(Number(v) || 0, 0, 1);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const PENTA = [0, 2, 4, 7, 9];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
// the i-th note up the major pentatonic scale from `base` (a midi note)
const penta = (base, i) => base + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5];
// the triad on scale degree d (0 = I), in semitones above the tonic
const triad = (d) => [0, 2, 4].map((k) => MAJOR[(d + k) % 7] + (d + k >= 7 ? 12 : 0));
// the six bells of a level: do mi sol (a row of three rings a major chord),
// then la, the octave and the tenth
const BELL_STEPS = [0, 4, 7, 9, 12, 16];

// ------------------------------------------------------------ the four levels

// Acoustics (a generated impulse response: reverb time, how the highs die
// away, early reflections as [seconds, gain]) and how much of the effects
// and the music is sent into it; the bell family and its lowest pitch; the
// lift mechanism; what a paddle wheel and a spinner are made of; and the
// instrument for a puzzle's flourish.
const LEVELS = {
  // a sunny playroom: a medium room with a wooden floor, lively and bright
  sunny: {
    ir: { rt: 0.5, top: 7500, bottom: 2200, predelay: 0.003, early: [[0.006, 0.55], [0.0105, -0.45], [0.015, 0.38], [0.022, -0.3], [0.028, 0.26], [0.036, -0.2], [0.045, 0.15]] },
    sfxSend: 0.26,
    musicSend: 0.32,
    bell: 'handbell',
    bellBase: 74, // D5
    lift: 'screw',
    tick: 'paddle',
    spin: 'paddle',
    flourish: 'marimba',
  },
  // a quiet room at night, the run glowing: spacious and a little shimmering
  crystal: {
    ir: { rt: 1.2, top: 8500, bottom: 2600, predelay: 0.012, early: [[0.011, 0.5], [0.019, -0.4], [0.027, 0.33], [0.038, -0.28], [0.052, 0.22], [0.067, -0.16]] },
    sfxSend: 0.28,
    musicSend: 0.45,
    bell: 'glassbell',
    bellBase: 81, // A5
    lift: 'hum',
    tick: 'glass',
    spin: 'star',
    flourish: 'celesta',
  },
  // a candlelit desk in a book-lined study: warm, soft highs
  storybook: {
    ir: { rt: 0.6, top: 4200, bottom: 1300, predelay: 0.004, early: [[0.005, 0.4], [0.009, -0.32], [0.014, 0.25], [0.02, -0.18], [0.03, 0.12]] },
    sfxSend: 0.24,
    musicSend: 0.34,
    bell: 'carillon',
    bellBase: 77, // F5
    lift: 'babble',
    tick: 'wood',
    spin: 'pinwheel',
    flourish: 'musicbox',
  },
  // an observatory dome: long and spacious
  cosmic: {
    ir: { rt: 2.0, top: 6500, bottom: 1600, predelay: 0.02, early: [[0.021, 0.45], [0.037, -0.35], [0.055, 0.3], [0.078, -0.25], [0.1, 0.2], [0.13, -0.14]] },
    sfxSend: 0.22,
    musicSend: 0.5,
    bell: 'chime',
    bellBase: 79, // G5
    lift: 'ratchet',
    tick: 'gear',
    spin: 'star',
    flourish: 'celesta',
  },
};

// ------------------------------------------------------------ music styles

// Melody rhythms, one bar each, as [step, length] in eighth notes.
const R4 = [
  [[0, 2], [2, 2], [4, 4]],
  [[0, 3], [3, 1], [4, 4]],
  [[0, 2], [2, 1], [3, 1], [4, 4]],
  [[0, 2], [2, 2], [4, 2], [6, 2]],
  [[0, 4], [4, 2], [6, 2]],
  [[0, 1], [1, 1], [2, 2], [4, 4]],
  [[0, 2], [4, 2], [6, 2]],
];
const R4_SPARSE = [
  [[0, 4], [4, 4]],
  [[0, 2], [2, 2], [4, 4]],
  [[0, 6], [6, 2]],
  [[0, 3], [3, 1], [4, 4]],
  [[2, 2], [4, 4]],
];
const R4_SLOW = [
  [[0, 8]],
  [[0, 4], [4, 4]],
  [[4, 4]],
  [[0, 6], [6, 2]],
];
const R3 = [
  [[0, 4], [4, 2]],
  [[0, 2], [2, 2], [4, 2]],
  [[0, 3], [3, 1], [4, 2]],
  [[0, 2], [2, 4]],
  [[0, 6]],
];
// melodic steps along the pentatonic scale: mostly small, sometimes a leap
const STEPS = [-2, -1, -1, 0, 1, 1, 2];

// Per level: tempo and metre, the key (tonic as a midi note), two chord
// progressions (scale degrees, one chord per bar) and the instruments.
// Accompaniment patterns are [step, chord tone (0 root, 1 third, 2 fifth),
// octave, velocity]. `pad` holds a soft chord through each bar; `bells`
// drops an occasional bell note in; `night` adds far-off crickets.
const STYLES = {
  // marimba and kalimba, D major
  sunny: {
    bpm: 88,
    beats: 4,
    tonic: 62,
    level: 0.95,
    prog: [0, 5, 3, 4, 0, 5, 3, 4], // I vi IV V
    alt: [0, 3, 0, 4, 5, 3, 1, 4], // I IV I V vi IV ii V
    lead: 'marimba',
    leadBase: 74,
    leadVel: 0.46,
    rhythms: R4,
    end: [[0, 2], [2, 2], [4, 4]],
    comp: 'kalimba',
    compBase: 62,
    compPat: [[0, 0, 0, 0.22], [2, 2, 0, 0.15], [4, 1, 1, 0.17], [6, 2, 0, 0.14]],
    bass: 'bass',
    bassBase: 50,
    bassPat: [[0, 0, 0, 0.4], [4, 2, -1, 0.24]],
  },
  // celesta over a glass-harmonica pad, with glass bells now and then; A major
  crystal: {
    bpm: 64,
    beats: 4,
    tonic: 57,
    level: 0.9,
    prog: [0, 3, 5, 4, 0, 3, 1, 4],
    alt: [0, 5, 3, 4, 3, 0, 1, 4],
    lead: 'celesta',
    leadBase: 81,
    leadVel: 0.4,
    rhythms: R4_SPARSE,
    end: [[0, 4], [4, 4]],
    comp: null,
    pad: 'glass',
    padBase: 64,
    padVel: 0.075,
    bells: { inst: 'glassbell', base: 81, gap: [7, 14], vel: 0.14 },
  },
  // a music-box waltz over a harp, crickets far off; F major
  storybook: {
    bpm: 72,
    beats: 3,
    tonic: 53,
    level: 0.9,
    prog: [0, 3, 0, 4, 0, 3, 4, 0],
    alt: [0, 5, 3, 4, 0, 3, 4, 0],
    lead: 'musicbox',
    leadBase: 77,
    leadVel: 0.4,
    rhythms: R3,
    end: [[0, 6]],
    comp: 'harp',
    compBase: 53,
    compPat: [[0, 0, 0, 0.3], [2, 1, 1, 0.15], [4, 2, 1, 0.13]],
    night: true,
  },
  // a warm space pad, slow chimes and a soft celesta arpeggio; G major
  cosmic: {
    bpm: 56,
    beats: 4,
    tonic: 55,
    level: 0.9,
    prog: [0, 5, 3, 4, 0, 3, 5, 4],
    alt: [0, 3, 1, 4, 5, 3, 0, 4],
    lead: 'chime',
    leadBase: 67,
    leadVel: 0.26,
    rhythms: R4_SLOW,
    end: [[0, 8]],
    comp: 'celesta',
    compBase: 67,
    compPat: [[0, 0, 0, 0.12], [1, 2, 0, 0.07], [2, 1, 1, 0.09], [3, 2, 0, 0.06], [4, 0, 1, 0.1], [5, 2, 0, 0.06], [6, 1, 1, 0.08], [7, 2, 0, 0.05]],
    pad: 'space',
    padBase: 55,
    padVel: 0.07,
  },
};
for (const s of Object.values(STYLES)) {
  s.spb = s.beats * 2; // eighth-note steps per bar
  s.stepLen = 60 / s.bpm / 2;
}

// ------------------------------------------------------------ impact models

// Contact time and the dry click of a gentle, a firm and a hard hit: a
// shorter contact puts more energy into the high modes, so harder hits come
// out brighter. A 5.5 g glass sphere meets these surfaces for a tenth of a
// millisecond or so; softer wood holds it a little longer.
const SURFACES = ['wood', 'paint', 'plastic', 'acrylic', 'glass', 'ceramic', 'stone', 'rock', 'brass'];
const VARIANTS = 3;
// Per surface: the struck part's modes as [ratio, amplitude, Q] of f0, a
// low "body" (what the part sits on, its hollow, its air) as [Hz, amp, Q],
// contact times and clicks for the three hardnesses, and the voice level.
const HIT_MODELS = {
  // A beech trough: thin walls ring as a few close, well-damped modes around
  // 1-3 kHz (the "tok"); the open channel gives a low, soft hollow.
  wood: { f0: 1150, modes: [[1, 1, 34], [1.42, 0.8, 34], [1.97, 0.55, 36], [2.6, 0.35, 38], [3.3, 0.18, 40]], body: [[330, 0.4, 5]], tc: [0.32e-3, 0.2e-3, 0.12e-3], click: [0.08, 0.18, 0.35], len: 0.16, hp: 140, gain: 1 },
  // lacquer is harder: a shade higher, less damped, a faint glassy partial
  paint: { f0: 1220, modes: [[1, 1, 44], [1.42, 0.8, 44], [1.97, 0.55, 46], [2.6, 0.35, 48], [2.95, 0.12, 110]], body: [[350, 0.35, 5]], tc: [0.27e-3, 0.17e-3, 0.1e-3], click: [0.1, 0.22, 0.4], len: 0.17, hp: 150, gain: 0.95 },
  // moulded plastic is lossy, so the tick is short; light and hollow
  plastic: { f0: 1750, modes: [[1, 1, 20], [1.55, 0.75, 22], [2.3, 0.5, 24], [3.05, 0.28, 26]], body: [[640, 0.5, 6]], tc: [0.22e-3, 0.14e-3, 0.09e-3], click: [0.1, 0.2, 0.35], len: 0.1, hp: 220, gain: 0.8 },
  // an acrylic tube: stiffer, it rings a little, with the tube's air behind
  acrylic: { f0: 2300, modes: [[1, 1, 60], [1.48, 0.6, 64], [2.25, 0.4, 70], [2.9, 0.2, 70]], body: [[780, 0.35, 12], [1560, 0.15, 14]], tc: [0.15e-3, 0.1e-3, 0.065e-3], click: [0.1, 0.2, 0.35], len: 0.2, hp: 280, gain: 0.75 },
  // glass on glass: a clear "tink" that rings for a moment (glass hardly
  // damps itself; the mounts do)
  glass: { f0: 2750, modes: [[1, 1, 650], [1.64, 0.45, 650], [2.23, 0.3, 650]], body: [[1180, 0.12, 30]], tc: [0.09e-3, 0.06e-3, 0.04e-3], click: [0.06, 0.12, 0.22], len: 0.55, hp: 400, gain: 0.5 },
  // glazed ceramic: hard and smooth, a crisp click over a dense body
  ceramic: { f0: 2100, modes: [[1, 1, 110], [1.53, 0.55, 120], [2.18, 0.35, 120], [2.84, 0.15, 130]], body: [[270, 0.35, 3]], tc: [0.1e-3, 0.07e-3, 0.045e-3], click: [0.18, 0.3, 0.45], len: 0.2, hp: 140, gain: 0.7 },
  // polished stone is rigid: a crisp click, a glassy tick and a dull mass
  stone: { f0: 2500, modes: [[1, 0.4, 26], [1.44, 0.25, 30], [1.92, 0.08, 34]], body: [[210, 0.15, 3]], tc: [0.1e-3, 0.075e-3, 0.05e-3], click: [0.35, 0.45, 0.55], len: 0.12, hp: 90, gain: 0.8 },
  // porous asteroid rock: rough contact, dull and short
  rock: { f0: 1500, modes: [[1, 0.45, 7], [1.8, 0.32, 9], [2.7, 0.18, 10]], body: [[190, 0.2, 2.5], [620, 0.3, 4]], tc: [0.3e-3, 0.2e-3, 0.13e-3], click: [0.25, 0.35, 0.45], rough: 0.5, len: 0.1, hp: 90, gain: 0.85 },
  // a brass rail: a small, clear metallic ting
  brass: { f0: 2450, modes: [[1, 1, 420], [1.59, 0.55, 450], [2.14, 0.4, 480], [2.73, 0.2, 500]], body: [[900, 0.1, 20]], tc: [0.1e-3, 0.065e-3, 0.045e-3], click: [0.08, 0.15, 0.28], len: 0.45, hp: 300, gain: 0.45 },
};

function hitSpec(surface, hard) {
  const S = HIT_MODELS[surface];
  const f0 = S.f0 * rnd(0.94, 1.06);
  const modes = S.modes.map(([r, a, q]) => [f0 * r * rnd(0.97, 1.03), a * rnd(0.7, 1.2), q * rnd(0.85, 1.15)]);
  for (const [f, a, q] of S.body) modes.push([f * rnd(0.92, 1.08), a, q]);
  return { modes, tc: S.tc[hard] * rnd(0.9, 1.1), click: S.click[hard], rough: S.rough ?? 0.15, len: S.len, hp: S.hp };
}

// Two glass marbles meeting: a contact of some 30 microseconds, a crisp
// click from two small hard bodies stopping dead, and the brief bright ring
// of the pair around 3-6 kHz. Well under 50 ms.
const CLACK = () => ({ modes: [[rnd(3000, 3500), 1, 30], [rnd(4600, 5100), 0.5, 34], [rnd(6000, 6500), 0.22, 36]], tc: 0.035e-3, click: 0.7, len: 0.05, hp: 900 });

// A small hardwood piece of a run (for the build sounds): a 4 cm cube tocks
// near 1.9 kHz; longer pieces are lower. A low, heavily damped body mode
// stands for the base it is set on.
const CHUNKY = [[1, 1], [1.19, 0.85], [1.47, 0.75], [1.73, 0.6], [2.06, 0.45], [2.41, 0.3]];
const PIECES = [0.03, 0.05, 0.1];
const CONTACT = [0.45e-3, 0.25e-3, 0.11e-3];
function pieceSpec(size, hard) {
  const f0 = 1900 * (0.04 / size) ** 0.6 * rnd(0.95, 1.05);
  const modes = CHUNKY.map(([r, a]) => [f0 * r * rnd(0.97, 1.03), a * rnd(0.6, 1.25), 50 * rnd(0.8, 1.2)]);
  modes.push([f0 * rnd(0.27, 0.33), 0.4, 6]);
  return { modes, tc: CONTACT[hard], click: [0.1, 0.25, 0.5][hard], rough: 0.2, len: 0.16 + 0.1 * (size > 0.06 ? 1 : 0), hp: 180 };
}

// A brass pawl dropping over a brass ratchet tooth; a rubbery soft bump.
const GEAR = () => ({ modes: [[rnd(2600, 2800), 1, 90], [rnd(3900, 4100), 0.4, 110], [rnd(5200, 5500), 0.12, 120], [rnd(1300, 1450), 0.4, 20]], tc: 0.12e-3, click: 0.22, len: 0.12, hp: 400 });
const RUBBER = () => ({ modes: [[rnd(180, 220), 0.45, 2.2], [rnd(380, 440), 0.8, 3], [rnd(800, 950), 0.45, 4], [rnd(1400, 1600), 0.15, 5]], tc: 2.5e-3, len: 0.15, hp: 80 });

// ------------------------------------------------------------ rolling

// Per surface: how much of the smooth rumble and of the crackle it makes,
// their playback-rate factors (a rougher surface has bigger, sparser bumps:
// a lower grit rate), a high-pass, three peaking resonances [Hz, Q, dB]
// (the ring of the material, its hollow body, a second mode), the top of
// the low-pass at full speed, the level, and the once-per-turn pulse of the
// marble's own tiny flat spots.
const ROLL_SURF = {
  // a warm, hollow wooden rumble with a fine grain
  wood: { smooth: 1, grit: 0.35, sr: 1, gr: 1, hp: 90, pk: [[1700, 5, 3], [330, 2.5, 6], [880, 3.5, 5]], lp: 3200, level: 1, rot: 0.12 },
  // lacquered: the same wood, a little brighter and smoother
  paint: { smooth: 1, grit: 0.28, sr: 1.1, gr: 1.15, hp: 110, pk: [[2100, 7, 4], [360, 2.5, 5], [1000, 4, 5]], lp: 4200, level: 0.95, rot: 0.12 },
  // a thin plastic shell: hollow and light
  plastic: { smooth: 1, grit: 0.18, sr: 1.2, gr: 1.1, hp: 170, pk: [[2600, 8, 3], [620, 4.5, 8], [1350, 6, 6]], lp: 4500, level: 0.85, rot: 0.14 },
  // clear acrylic: hard, hollow, a little ring
  acrylic: { smooth: 1, grit: 0.12, sr: 1.25, gr: 1.3, hp: 220, pk: [[3300, 14, 4], [950, 6, 7], [1900, 8, 6]], lp: 5500, level: 0.8, rot: 0.1 },
  // glass on glass: smooth and higher, the rail singing faintly
  glass: { smooth: 1, grit: 0.06, sr: 1.5, gr: 1.6, hp: 350, pk: [[2600, 40, 10], [1300, 4, 3], [4100, 45, 8]], lp: 6500, level: 0.7, rot: 0.08 },
  // glazed ceramic: hard and smooth
  ceramic: { smooth: 1, grit: 0.1, sr: 1.4, gr: 1.5, hp: 250, pk: [[1900, 12, 6], [700, 3, 3], [3100, 16, 5]], lp: 5500, level: 0.8, rot: 0.08 },
  // polished stone: a fine grit over a dull, massive body
  stone: { smooth: 0.7, grit: 0.55, sr: 1.3, gr: 2.2, hp: 200, pk: [[2400, 4, 3], [1100, 3, 2], [4200, 6, 2]], lp: 5500, level: 0.8, rot: 0.1 },
  // asteroid rock: coarse, gritty
  rock: { smooth: 0.7, grit: 0.6, sr: 0.8, gr: 0.45, hp: 110, pk: [[2800, 4, 2], [450, 2, 3], [1400, 3, 3]], lp: 3800, level: 0.95, rot: 0.2 },
  // brass: smooth contact, a metallic ring
  brass: { smooth: 1, grit: 0.08, sr: 1.5, gr: 1.6, hp: 400, pk: [[2300, 60, 11], [3700, 70, 9], [5200, 80, 6]], lp: 6500, level: 0.6, rot: 0.08 },
};
// Inside a tube the column of air (a 20-odd cm tube open at both ends
// resonates near 780 Hz and its harmonics) replaces the open body: a
// hollow, resonant rumble, a touch louder and airier.
const ROLL_CFG = {};
for (const [k, c] of Object.entries(ROLL_SURF)) {
  ROLL_CFG[k] = c;
  ROLL_CFG[k + '|tube'] = { ...c, hp: Math.max(c.hp, 180), pk: [c.pk[0], [780, 7, 10], [1560, 8, 7]], lp: c.lp * 1.15, level: c.level * 1.1 };
}
const rollKey = (surface, tube) => (ROLL_SURF[surface] ? surface : 'wood') + (tube ? '|tube' : '');

// ------------------------------------------------------------ lifts

// The lift mechanisms are seamless loops, rendered on first use: level at
// full run, and playback rate at rest and how much it rises with `amount`
// (the loops with a pitch of their own keep their rate).
const LIFTS = {
  screw: { level: 0.075, rate: [0.8, 0.3], pan: 0.35 }, // sunny: the Archimedes screw
  hum: { level: 0.055, rate: null, pan: 0.3 }, // crystal: the glass elevator
  babble: { level: 0.085, rate: null, pan: -0.3 }, // storybook: the waterfall
  ratchet: { level: 0.14, rate: [0.8, 0.3], pan: 0.35 }, // cosmic: the hand-crank gear wheel
};

// ------------------------------------------------------------ instruments

// Additive instruments: partials [ratio, amplitude, decay seconds], the
// attack, and a mallet or striker "thump" [amplitude, low-pass, decay].
const INST = {
  // a rosewood bar over a tuned tube: the fundamental rings, the partial near
  // four times it gives the wooden tock and dies fast; a soft yarn mallet
  marimba: (f) => ({ partials: [[1, 1, clamp(0.5 * (500 / f) ** 0.5, 0.18, 0.9)], [3.93, 0.18, 0.06], [9.2, 0.045, 0.02]], attack: 0.0015, thump: [0.12, 1400, 0.006], len: 1.3 }),
  // a thumb piano tine: a long round fundamental and a short metallic overtone
  kalimba: (f) => ({ partials: [[1, 1, clamp(0.75 * (400 / f) ** 0.3, 0.3, 1.1)], [5.9, 0.1, 0.05], [2.01, 0.03, 0.25]], attack: 0.002, thump: [0.1, 700, 0.01], len: 1.7 }),
  // a music-box comb: two nearly unison tines beat gently, and a steel
  // cantilever's second mode sits at 6.27 times the first
  musicbox: () => ({ partials: [[1, 1, 0.9], [1.0028, 0.4, 0.8], [6.27, 0.09, 0.06]], attack: 0.001, thump: [0.05, 4000, 0.002], len: 2.0 }),
  // steel plates over wooden resonators and a felt hammer: nearly pure,
  // with the plate's own inharmonic partials fading fast
  celesta: (f) => ({ partials: [[1, 1, clamp(0.9 * (700 / f) ** 0.5, 0.35, 1.4)], [2.756, 0.07, 0.1], [5.404, 0.025, 0.035]], attack: 0.0015, thump: [0.05, 2500, 0.002], len: 2.4 }),
  // a small soft chime for sparkles
  bell: () => ({ partials: [[1, 1, 0.45], [2.76, 0.22, 0.09], [5.4, 0.05, 0.03]], attack: 0.001, len: 1.2 }),
  // a round, soft bass
  bass: () => ({ partials: [[1, 1, 0.55], [2, 0.35, 0.3], [3, 0.08, 0.12]], attack: 0.01, thump: [0.06, 300, 0.01], len: 1.3 }),

  // The four bell families.
  // A brass hand bell: the (2,0) mode is the note, the (3,0) mode is tuned to
  // the twelfth (3:1), then inharmonic modes near 4.1, 5.4 and 8.4. A cast
  // bell is never perfectly round, so each mode splits into a close pair
  // that beats slowly: the shimmer. The marble is a tiny, hard striker.
  handbell: (f) => {
    const T = clamp(1.25 * (600 / f) ** 0.5, 0.6, 2.0);
    return { partials: [[1, 1, T], [1.0019, 0.45, T * 0.9], [3.0, 0.4, T * 0.45], [3.006, 0.2, T * 0.4], [4.07, 0.06, T * 0.2], [5.43, 0.15, T * 0.18], [8.36, 0.05, T * 0.08]], attack: 0.0008, thump: [0.08, 5000, 0.0012], len: 4 };
  },
  // A glass bell: very little loss, almost pure, the (3,0) and (4,0) modes of
  // a glass shell near 2.6 and 4.6 soft and quick, a slow beat for life.
  glassbell: (f) => {
    const T = clamp(1.4 * (880 / f) ** 0.4, 0.8, 2.2);
    return { partials: [[1, 1, T], [1.0011, 0.35, T], [2.61, 0.13, T * 0.35], [4.62, 0.04, T * 0.12]], attack: 0.0015, thump: [0.04, 7000, 0.0008], len: 4.5 };
  },
  // A small carillon bell: hum an octave below, prime, the minor-third
  // tierce, quint, nominal an octave up, then the upper partials. The hum
  // and tierce ring longest, which is the warm, slightly wistful bell sound.
  carillon: (f) => {
    const T = clamp(1.2 * (700 / f) ** 0.5, 0.6, 1.8);
    return {
      partials: [[0.5, 0.55, T * 1.6], [0.5008, 0.2, T * 1.5], [1, 0.7, T * 1.1], [1.1892, 0.36, T * 0.9], [1.5, 0.16, T * 0.5], [2, 0.7, T * 0.6], [2.52, 0.2, T * 0.3], [2.67, 0.12, T * 0.25], [3.0, 0.16, T * 0.2], [4.0, 0.07, T * 0.1]],
      attack: 0.001,
      thump: [0.1, 3000, 0.002],
      len: 4.5,
    };
  },
  // A tubular chime: a free bar's bending modes at 1 : 2.76 : 5.40 : 8.93,
  // the first ringing longest, with a slow beat from a slightly oval tube.
  chime: (f) => {
    const T = clamp(1.8 * (800 / f) ** 0.4, 1.0, 2.6);
    return { partials: [[1, 1, T], [1.0009, 0.4, T * 0.95], [2.756, 0.4, T * 0.5], [5.404, 0.18, T * 0.2], [8.933, 0.05, T * 0.08]], attack: 0.001, thump: [0.06, 5000, 0.001], len: 5 };
  },
};

// Sample rates for rendered notes: enough for each instrument's content
// (nothing is kept above 7 kHz, the harp is low-passed, the bass is low).
const NOTE_RATE = { bass: 12000, harp: 22050 };
const NOTE_CACHE = 80;

// ------------------------------------------------------------ the engine

export class Audio {
  constructor() {
    this.ctx = null;
    this._muted = load('muted', false) === true;
    this.hidden = false;
    this.offline = false;
    this.dry = false;
    this.level = 'sunny';
    this.lv = LEVELS.sunny;
    this.tonic = STYLES.sunny.tonic;
    this.wantMusic = false; // music asked for before sound was unlocked
    this.voices = []; // impact voices
    this.bells = []; // ringing bells
    this.chains = []; // rolling voices, owned or free
    this.rolling = new Map(); // marble id -> chain
    this.rollAt = 0;
    this.liftV = null;
    this.liftAmt = 0;
    this.buckets = Object.fromEntries(Object.entries(BUCKETS).map(([k, [burst]]) => [k, { tokens: burst, at: 0 }]));
    this.frameAt = -1;
    this.inFrame = 0;
    this.last = {}; // rate limits per sound
    this.stats = { hits: 0, dropped: 0, stolen: 0, bells: 0, chains: 0 };
  }

  get muted() {
    return this._muted;
  }

  // Optional, and needs no AudioContext: render the impact bank and noise
  // now (say, during the loading screen) rather than on the first tap.
  prepare() {
    bank();
    return this;
  }

  // Must run inside a user gesture the first time.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended' && !this.hidden && !this.offline) this.ctx.resume().catch(() => {});
  }

  // Build on a context made elsewhere, e.g. an OfflineAudioContext, to render
  // and measure sounds without playing them. `reverb: false` leaves the room
  // out so a sound can be measured dry.
  attach(ctx, { reverb = true } = {}) {
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.dry = !reverb;
    this.build();
    return this;
  }

  build() {
    const ctx = this.ctx;
    // master: mute, no rumble, a gentle glue compressor, a soft top, and a
    // soft clipper that only ever touches peaks near full scale
    this.master = gainNode(ctx, this._muted ? 0 : MASTER);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    const safety = ctx.createWaveShaper();
    safety.curve = softClip();
    this.master.connect(filter(ctx, 'highpass', 35, -3)).connect(comp).connect(filter(ctx, 'lowpass', 10500, -3)).connect(safety).connect(ctx.destination);

    // Everything but the music meets on `bus`, which feeds the room. The
    // continuous voices (rolling, the lift) plug into it directly; one-shots
    // go through a group that hush() can fade and replace in one move.
    this.bus = gainNode(ctx, 1);
    this.bus.connect(this.master);
    this.verbIn = gainNode(ctx, 1);
    this.sfxSend = gainNode(ctx, 0);
    this.bus.connect(this.sfxSend).connect(this.verbIn);
    this.musicSend = gainNode(ctx, 0);
    this.musicSend.connect(this.verbIn);
    this.verbs = {};
    this.group();

    // the impacts, textures and noise (rendered once per page, see prepare())
    const b = bank();
    const wrap = (x) => (x instanceof Float32Array ? mono(ctx, x, BANK_RATE) : Array.isArray(x) ? x.map(wrap) : Object.fromEntries(Object.entries(x).map(([k, v]) => [k, wrap(v)])));
    this.noise = wrap(b.noise.white);
    this.pink = wrap(b.noise.pink);
    this.smoothTex = wrap(b.smooth);
    this.gritTex = wrap(b.grit);
    this.hits = wrap(b.hits);
    this.clacks = wrap(b.clacks);
    this.pieces = wrap(b.pieces);
    this.gear = wrap(b.gear);
    this.rubber = wrap(b.rubber);
    this.lifts = {};
    this.waves = {
      // a glass harmonica: a rubbed glass bowl, nearly a sine
      glass: periodicWave(ctx, [1, 0.12, 0.03]),
      // a warm pad: a softened sawtooth
      space: periodicWave(ctx, Array.from({ length: 12 }, (_, i) => Math.exp(-(i + 1) / 3) / (i + 1))),
    };

    // tonal notes are rendered on first use (see note())
    this.notes = new Map();

    this.music = new Music(this);
    this.applyLevel(this.level, true);
    if (this.wantMusic) this.music.start(this.level);
    if (!this.offline) this.house = setInterval(() => this.housekeep(), 500);
  }

  // a fresh group for one-shots, with the tuned effects inside it
  group() {
    this.sfx = gainNode(this.ctx, 1);
    this.sfx.connect(this.bus);
    this.tones = gainNode(this.ctx, TONES);
    this.tones.connect(this.sfx);
  }

  setMuted(m) {
    this._muted = !!m;
    save('muted', this._muted);
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this._muted ? 0 : MASTER, this.ctx.currentTime, 0.03);
    if (this._muted) {
      this.releaseRolls();
      this.fadeLift();
    }
  }

  toggleMute() {
    this.setMuted(!this._muted);
    return this._muted;
  }

  pageHidden(hidden) {
    this.hidden = !!hidden;
    if (!this.ctx || this.offline) return;
    if (this.hidden) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  }

  ready() {
    return !!this.ctx && !this._muted && (this.offline || this.ctx.state === 'running');
  }

  // true when `name` last played less than `gap` seconds ago
  limit(name, gap) {
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -1) < gap) return true;
    this.last[name] = now;
    return false;
  }

  // ------------------------------------------------------------ levels and music

  setLevel(id) {
    if (!LEVELS[id]) id = 'sunny';
    const changed = id !== this.level;
    this.level = id;
    this.lv = LEVELS[id];
    this.tonic = STYLES[id].tonic;
    if (!this.ctx) return;
    if (changed) {
      this.applyLevel(id);
      // a different mechanism: the old one winds down, the new one starts
      // on the next lift() call
      this.fadeLift(true);
    }
    if (this.music.running) this.music.start(id);
  }

  startMusic(id) {
    if (id) this.setLevel(id);
    this.wantMusic = true;
    if (this.music) this.music.start(this.level);
  }

  stopMusic() {
    this.wantMusic = false;
    if (this.music) this.music.stop();
  }

  // Crossfade to a level's reverb. Idle rooms are unplugged after the fade
  // so their convolvers cost nothing.
  applyLevel(id, instant = false) {
    const ctx = this.ctx;
    const r = LEVELS[id];
    const t = ctx.currentTime;
    const tc = instant ? 0.002 : 0.35;
    let v = this.verbs[id];
    if (!v) {
      const conv = ctx.createConvolver();
      conv.normalize = false;
      conv.buffer = renderIR(ctx, r.ir);
      const g = gainNode(ctx, 0);
      conv.connect(g).connect(this.master);
      v = this.verbs[id] = { conv, g, linked: false, unlink: 0 };
    }
    clearTimeout(v.unlink);
    if (!v.linked) {
      this.verbIn.connect(v.conv);
      v.linked = true;
    }
    v.g.gain.setTargetAtTime(1, t, tc);
    for (const [k, o] of Object.entries(this.verbs)) {
      if (k === id) continue;
      o.g.gain.setTargetAtTime(0, t, tc);
      if (o.linked && !this.offline) {
        clearTimeout(o.unlink);
        o.unlink = setTimeout(() => {
          if (this.level === k || !o.linked) return;
          this.verbIn.disconnect(o.conv);
          o.linked = false;
        }, 3000);
      }
    }
    this.sfxSend.gain.setTargetAtTime(this.dry ? 0 : r.sfxSend, t, tc);
    this.musicSend.gain.setTargetAtTime(this.dry ? 0 : r.musicSend, t, tc);
  }

  // Fade everything briefly, for going back to the menu: the rolling and the
  // lift stop, ringing bells and one-shots fade out (a fresh group takes the
  // next sounds), and the music dips.
  hush() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.releaseRolls(0.05);
    this.liftAmt = 0;
    this.fadeLift();
    const old = this.sfx;
    old.gain.cancelScheduledValues(now);
    old.gain.setTargetAtTime(0, now, 0.06);
    this.group();
    this.voices = [];
    this.bells = [];
    if (!this.offline) setTimeout(() => old.disconnect(), 700);
    if (this.music.running) this.music.duck(0.3, 1.0);
  }

  // Tidy-up, twice a second: stop voices nobody uses any more.
  housekeep() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // roll() has stopped being called (a paused game): let go of the marbles
    if (this.rolling.size && now - this.rollAt > 0.4) this.releaseRolls();
    for (const ch of this.chains.slice()) {
      if (ch.owner == null && now - ch.freeAt > 4) this.dropChain(ch, now);
    }
    const v = this.liftV;
    if (v && this.liftAmt < 0.01 && now - v.idleAt > 3) this.stopLift(v, now);
  }

  // ------------------------------------------------------------ building blocks

  panner(pan = 0, dest = this.sfx) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(Number(pan) || 0, -0.9, 0.9);
    p.connect(dest);
    return p;
  }

  // a looping buffer source, started somewhere random in its loop
  loopSrc(buffer, t = this.ctx.currentTime) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.start(t, Math.random() * (buffer.duration - 0.2));
    return s;
  }

  // A pre-rendered instrument note, cached per instrument and pitch. Notes
  // are rendered at a rate that suits their content, and the cache forgets
  // the least recently used ones, so a level change does not keep every
  // instrument in memory. Returns the voice's source and gain.
  note(inst, m, t, vel, pan = 0, dest = this.tones, cutoff = 0) {
    const ctx = this.ctx;
    m = Math.round(m);
    const key = inst + m;
    let buf = this.notes.get(key);
    if (buf) this.notes.delete(key);
    else {
      const sr = NOTE_RATE[inst] || 24000;
      buf = mono(ctx, renderNote(sr, inst, m), sr);
      if (this.notes.size >= NOTE_CACHE) this.notes.delete(this.notes.keys().next().value);
    }
    this.notes.set(key, buf);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = gainNode(ctx, vel);
    const out = pan ? this.panner(pan, dest) : dest;
    if (cutoff) s.connect(filter(ctx, 'lowpass', cutoff, -3)).connect(g).connect(out);
    else s.connect(g).connect(out);
    const at = Math.max(t, ctx.currentTime);
    s.start(at);
    return { src: s, g, t: at, end: at + buf.duration };
  }

  // A soft sustained pad note on live oscillators (two, slightly detuned,
  // for a slow chorus), swelling in and fading out.
  pad(kind, m, t, dur, vel, dest) {
    const ctx = this.ctx;
    const glass = kind === 'glass';
    const rise = glass ? 0.5 : 1.2;
    const fall = glass ? 1.2 : 2.0;
    const g = gainNode(ctx, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(vel, t, rise / 3);
    g.gain.setTargetAtTime(0, t + dur, fall / 4);
    g.connect(dest);
    const f = mtof(m);
    for (const c of glass ? [-3, 3] : [-7, 6]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(this.waves[kind]);
      o.frequency.value = f;
      o.detune.value = c;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + fall * 1.6);
    }
  }

  // filtered noise with a one-shot envelope; `f1` sweeps the filter
  burst({ t, buffer = this.pink, type = 'bandpass', f = 1000, f1 = 0, q = 1, peak = 0.1, attack = 0.005, decay = 0.08, dest = this.sfx }) {
    const ctx = this.ctx;
    const fl = filter(ctx, type, f, q);
    fl.frequency.setValueAtTime(f, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    const g = gainNode(ctx, 0);
    const end = env(g.gain, t, peak, attack, decay);
    const s = this.loopSrc(buffer, t);
    s.connect(fl).connect(g).connect(dest);
    s.stop(end + 0.02);
  }

  // moving air: pink noise through a band that rises then eases back, and a
  // pan that travels
  air({ t, dur = 0.8, f0 = 400, f1 = 1600, q = 1.2, peak = 0.06, pan0 = 0, pan1 = 0, top = 3500 }) {
    const ctx = this.ctx;
    const bp = filter(ctx, 'bandpass', f0, q);
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.55);
    bp.frequency.exponentialRampToValueAtTime(f1 * 0.7, t + dur);
    const g = gainNode(ctx, 0);
    const end = env(g.gain, t, peak, dur * 0.45, dur * 0.55);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(clamp(pan0, -0.9, 0.9), t);
    p.pan.linearRampToValueAtTime(clamp(pan1, -0.9, 0.9), end);
    p.connect(this.sfx);
    const s = this.loopSrc(this.pink, t);
    s.connect(bp).connect(filter(ctx, 'lowpass', top, -3)).connect(g).connect(p);
    s.stop(end + 0.02);
  }

  // ------------------------------------------------------------ impacts

  // The budget. Faint hits are the first to go when a frame or their bucket
  // is full; when every voice is busy the quietest one (as it sounds now) is
  // faded out fast, unless the new hit is quieter still. Ticks (joins,
  // paddles) never steal.
  admit(now, s, level, kind = 'hit') {
    const [burst, rate] = BUCKETS[kind];
    const b = this.buckets[kind];
    b.tokens = Math.min(burst, b.tokens + (now - b.at) * rate);
    b.at = now;
    if (now - this.frameAt > 0.008) {
      this.frameAt = now;
      this.inFrame = 0;
    }
    const strong = kind === 'hit' && s > 0.55;
    if (!strong && (b.tokens < 1 || this.inFrame >= PER_FRAME)) return false;
    if (this.inFrame >= PER_FRAME * 2) return false;
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length >= MAX_HITS) {
      if (kind !== 'hit') return false;
      let q = null;
      let ql = Infinity;
      for (const v of this.voices) {
        const l = v.level * Math.exp(-Math.max(0, now - v.t) / 0.05);
        if (l < ql) {
          ql = l;
          q = v;
        }
      }
      if (ql > level) return false;
      this.release(q, now);
      this.stats.stolen++;
    }
    b.tokens = Math.max(0, b.tokens - 1);
    this.inFrame++;
    return true;
  }

  release(v, now) {
    for (const g of v.gains) {
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0, now, 0.006);
    }
    for (const s of v.srcs) {
      try {
        s.stop(now + 0.05);
      } catch {
        /* already stopped */
      }
    }
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  // One voice: each layer [buffer, gain, rate] through a brightness
  // low-pass, a level and a pan. Every layer gets its own chain on purpose:
  // in Chrome a short-lived node fed by two sources costs several times more
  // than two separate chains.
  voice(t, layers, level, cutoff, pan, track) {
    const ctx = this.ctx;
    const srcs = [];
    const gains = [];
    let life = 0;
    for (const [buf, gain, rate] of layers) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = rate;
      const g = gainNode(ctx, level * gain);
      s.connect(filter(ctx, 'lowpass', Math.min(cutoff, 9000), -3)).connect(g).connect(this.panner(pan * 0.85));
      s.start(t);
      srcs.push(s);
      gains.push(g);
      life = Math.max(life, buf.duration / rate);
    }
    if (track) this.voices.push({ srcs, gains, t, end: t + life, level });
  }

  // a hit's start time: real hits land between animation frames, so each
  // frame's batch is spread over a few milliseconds, off the 60 Hz grid
  hitTime(now) {
    return now + 0.003 + Math.max(0, this.inFrame - 1) * 0.0025 + Math.random() * 0.008;
  }

  // A marble crosses the join between two pieces: a small, soft tick of the
  // surface it rolls onto.
  join(strength = 0.3, surface = 'wood', pan = 0) {
    if (!this.ready()) return;
    const s = unit(strength);
    if (s < 0.02) return;
    const surf = HIT_MODELS[surface] ? surface : 'wood';
    const now = this.ctx.currentTime;
    const level = HIT * 0.3 * (0.15 + 0.85 * s ** 1.2) * HIT_MODELS[surf].gain * rnd(0.85, 1.1);
    if (!this.admit(now, s * 0.5, level, 'tick')) {
      this.stats.dropped++;
      return;
    }
    const t = this.hitTime(now);
    this.voice(t, [[pick(this.hits[surf][s < 0.6 ? 0 : 1]), 1, rnd(1.02, 1.12)]], level, 1300 * 2 ** (s * 1.8), pan, true);
    this.stats.hits++;
  }

  // A marble lands or bounces on a surface.
  impact(strength = 0.5, surface = 'wood', pan = 0) {
    if (!this.ready()) return;
    const s = unit(strength);
    if (s < 0.01) return;
    const surf = HIT_MODELS[surface] ? surface : 'wood';
    const now = this.ctx.currentTime;
    // many voices at once each give way a little, so a burst swells rather
    // than piling up into a wall of sound
    const crowd = 1 / Math.sqrt(1 + 0.4 * this.voices.length);
    const level = HIT * (0.08 + 0.92 * s ** 1.3) * HIT_MODELS[surf].gain * rnd(0.85, 1.1) * crowd;
    if (!this.admit(now, s, level)) {
      this.stats.dropped++;
      return;
    }
    const hard = s < 0.3 ? 0 : s < 0.65 ? 1 : 2;
    const t = this.hitTime(now);
    this.voice(t, [[pick(this.hits[surf][hard]), 1, rnd(0.97, 1.03)]], level, 1500 * 2 ** (s * 2.2), pan, true);
    this.stats.hits++;
  }

  // Marble meets marble: a bright glass click.
  clack(strength = 0.5, pan = 0) {
    if (!this.ready()) return;
    const s = unit(strength);
    if (s < 0.01) return;
    const now = this.ctx.currentTime;
    const crowd = 1 / Math.sqrt(1 + 0.4 * this.voices.length);
    const level = HIT * 0.55 * (0.08 + 0.92 * s ** 1.2) * rnd(0.85, 1.1) * crowd;
    if (!this.admit(now, s, level)) {
      this.stats.dropped++;
      return;
    }
    this.voice(this.hitTime(now), [[pick(this.clacks), 1, rnd(0.94, 1.06)]], level, 2600 * 2 ** (s * 1.4), pan, true);
    this.stats.hits++;
  }

  // ------------------------------------------------------------ bells

  // A tuned bell of the level's family. A bell struck again while it still
  // rings gives way to the new strike (its energy is mostly the new one),
  // so a stream of marbles over one bell never builds up.
  bell(index = 0, strength = 0.7, pan = 0) {
    if (!this.ready()) return;
    const i = clamp(Math.round(Number(index) || 0), 0, 5);
    const s = unit(strength);
    if (s < 0.01) return;
    const now = this.ctx.currentTime;
    this.bells = this.bells.filter((b) => b.end > now && !b.gone);
    const prev = this.bells.find((b) => b.i === i);
    if (prev) {
      if (now - prev.t < 0.06) return; // the same strike, reported twice
      this.silence(prev, now, 0.04);
    }
    if (this.bells.length >= MAX_BELLS) this.silence(this.bells[0], now, 0.08);
    const lv = this.lv;
    const vel = BELL * (0.12 + 0.88 * s ** 1.3);
    // a harder strike reaches the high partials
    const cutoff = 2200 * 2 ** (s * 1.8);
    const v = this.note(lv.bell, lv.bellBase + BELL_STEPS[i], now + 0.004, vel, pan, this.tones, cutoff);
    this.bells.push({ ...v, i });
    this.stats.bells++;
  }

  silence(b, now, tc) {
    b.gone = true;
    b.g.gain.cancelScheduledValues(now);
    b.g.gain.setTargetAtTime(0, now, tc);
    try {
      b.src.stop(now + tc * 8);
    } catch {
      /* already stopped */
    }
  }

  // ------------------------------------------------------------ rolling

  // Called every frame with every marble rolling on a surface. The loudest
  // (a marble that already has a voice counts a little louder, so voices do
  // not flap between two marbles) get a voice each; a change of surface
  // crossfades to a voice tuned to the new one.
  roll(list) {
    if (!this.ctx) return;
    if (!this.ready() || !Array.isArray(list) || !list.length) {
      if (this.rolling.size) this.releaseRolls();
      return;
    }
    const now = this.ctx.currentTime;
    this.rollAt = now;
    const cands = [];
    for (const m of list) {
      if (!m) continue;
      const sp = Math.max(0, Number(m.speed) || 0);
      if (sp < 0.04) continue;
      const key = rollKey(m.surface, m.tube);
      const cfg = ROLL_CFG[key];
      const bowl = unit(m.bowl);
      const g = m.gain == null ? 1 : unit(m.gain);
      const loud = rollCurve(sp, bowl) * cfg.level * g;
      if (loud < 0.003) continue;
      const has = this.rolling.has(m.id);
      cands.push({ id: m.id, key, cfg, sp, bowl, g, pan: Number(m.pan) || 0, loud, score: loud * (has ? 1.6 : 1) });
    }
    cands.sort((a, b) => b.score - a.score);
    const keep = cands.slice(0, MAX_ROLL);
    const ids = new Set(keep.map((c) => c.id));
    for (const [id, ch] of this.rolling) {
      if (ids.has(id)) continue;
      this.freeChain(ch, now);
      this.rolling.delete(id);
    }
    // each of many voices gives way a little
    const crowd = 1 / Math.sqrt(1 + 0.4 * Math.max(0, keep.length - 1));
    for (const c of keep) {
      let ch = this.rolling.get(c.id);
      if (!ch || ch.key !== c.key) {
        const next = this.acquireChain(c.key, now);
        if (!next) continue;
        if (ch) this.freeChain(ch, now);
        ch = next;
        ch.owner = c.id;
        this.rolling.set(c.id, ch);
      }
      this.driveChain(ch, c, crowd, now);
    }
  }

  releaseRolls(tc = 0.045) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const ch of this.rolling.values()) this.freeChain(ch, now, tc);
    this.rolling.clear();
  }

  // A voice for a surface: a free one already tuned to it (even one still
  // fading, which just swells back), else a silent free one retuned, else a
  // new one, else the one freed longest ago.
  acquireChain(key, now) {
    let same = null;
    let silent = null;
    let oldest = null;
    for (const ch of this.chains) {
      if (ch.owner != null) continue;
      if (ch.key === key && (!same || ch.freeAt > same.freeAt)) same = ch;
      if (now - ch.freeAt > 0.25 && (!silent || ch.freeAt < silent.freeAt)) silent = ch;
      if (!oldest || ch.freeAt < oldest.freeAt) oldest = ch;
    }
    if (same) return same;
    if (silent) {
      this.tuneChain(silent, key, now);
      return silent;
    }
    if (this.chains.length < MAX_CHAINS) {
      const ch = this.makeChain(key, now);
      this.chains.push(ch);
      this.stats.chains++;
      return ch;
    }
    if (oldest) {
      this.tuneChain(oldest, key, now);
      return oldest;
    }
    return null;
  }

  // One rolling voice:
  //   smooth rumble --+
  //   crackle --------+-> high-pass -> ring -> body -> second mode ->
  //   funnel whirr -> low-pass -> turn and orbit pulses -> level -> pan
  makeChain(key, now) {
    const ctx = this.ctx;
    const smooth = this.loopSrc(this.smoothTex);
    const grit = this.loopSrc(this.gritTex);
    const gS = gainNode(ctx, 0);
    const gG = gainNode(ctx, 0);
    const hp = filter(ctx, 'highpass', 100, 0.7);
    const pk = [0, 1, 2].map(() => filter(ctx, 'peaking', 1000, 1));
    const pkB = filter(ctx, 'peaking', 480, 2.5);
    pkB.gain.value = 0;
    const lp = filter(ctx, 'lowpass', 2000, -3);
    const am = gainNode(ctx, 1);
    const rot = ctx.createOscillator();
    rot.type = 'triangle';
    const rotD = gainNode(ctx, 0);
    const orb = ctx.createOscillator();
    const orbD = gainNode(ctx, 0);
    const out = gainNode(ctx, 0);
    const pan = ctx.createStereoPanner();
    smooth.connect(gS).connect(hp);
    grit.connect(gG).connect(hp);
    hp.connect(pk[0]).connect(pk[1]).connect(pk[2]).connect(pkB).connect(lp).connect(am).connect(out).connect(pan).connect(this.bus);
    rot.connect(rotD).connect(am.gain);
    orb.connect(orbD).connect(am.gain);
    rot.start();
    orb.start();
    const ch = { key: null, smooth, grit, gS, gG, hp, pk, pkB, lp, am, rot, rotD, orb, orbD, out, pan, owner: null, freeAt: now, fresh: true };
    this.tuneChain(ch, key, now);
    return ch;
  }

  // set a (silent) voice's surface at once
  tuneChain(ch, key, now) {
    const c = ROLL_CFG[key];
    ch.key = key;
    ch.fresh = true;
    setNow(ch.gS.gain, c.smooth, now);
    setNow(ch.gG.gain, c.grit, now);
    setNow(ch.hp.frequency, c.hp, now);
    c.pk.forEach(([f, q, db], i) => {
      setNow(ch.pk[i].frequency, f, now);
      setNow(ch.pk[i].Q, q, now);
      setNow(ch.pk[i].gain, db, now);
    });
  }

  driveChain(ch, c, crowd, now) {
    const cfg = c.cfg;
    const x = Math.min(1, c.sp / FULL);
    // a voice that was silent jumps straight to its marble's state; one
    // already sounding glides
    const set = ch.fresh ? (p, v) => setNow(p, v, now) : (p, v, tc = 0.05) => p.setTargetAtTime(v, now, tc);
    ch.fresh = false;
    // In a funnel the marble also spins faster on the spot, and the rumble
    // climbs with the whirr.
    const r = c.sp * (1 + 0.35 * c.bowl);
    set(ch.smooth.playbackRate, clamp(r * cfg.sr, 0.03, 3.5));
    set(ch.grit.playbackRate, clamp(r * cfg.gr, 0.03, 3.5));
    set(ch.lp.frequency, cfg.lp * (0.45 + 0.55 * x) * (1 + 0.3 * c.bowl));
    // once a turn the marble's tiny flat spots meet the track; once an orbit
    // the funnel's seam and the marble's changing distance pulse the sound
    const dr = cfg.rot;
    const dob = c.bowl > 0 ? 0.32 * Math.sqrt(c.bowl) : 0;
    set(ch.rot.frequency, c.sp / (2 * Math.PI * R_MARBLE), 0.08);
    set(ch.orb.frequency, 0.8 * 14 ** c.bowl, 0.08);
    set(ch.rotD.gain, dr * 0.5);
    set(ch.orbD.gain, dob * 0.5);
    set(ch.am.gain, 1 - 0.5 * (dr + dob));
    set(ch.pkB.frequency, 480 * 3.3 ** c.bowl, 0.08);
    set(ch.pkB.gain, 10 * c.bowl ** 0.6, 0.08);
    set(ch.pan.pan, clamp(c.pan, -0.85, 0.85));
    // the level, with a dead man's handle: if updates stop, so does the sound
    const g = ch.out.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(ROLL * cfg.level * rollCurve(c.sp, c.bowl) * c.g * crowd, now, 0.03);
    g.setTargetAtTime(0, now + 0.3, 0.08);
  }

  freeChain(ch, now, tc = 0.045) {
    ch.owner = null;
    ch.freeAt = now;
    ch.out.gain.cancelScheduledValues(now);
    ch.out.gain.setTargetAtTime(0, now, tc);
  }

  dropChain(ch, now) {
    for (const n of [ch.smooth, ch.grit, ch.rot, ch.orb]) {
      try {
        n.stop(now + 0.05);
      } catch {
        /* already stopped */
      }
    }
    this.chains.splice(this.chains.indexOf(ch), 1);
  }

  // ------------------------------------------------------------ tubes, wheels, spinners, lifts

  // A marble enters a tube: a short breath of air, hollow with the tube's
  // own resonance.
  whoosh(speed = 1, pan = 0) {
    if (!this.ready() || this.limit('whoosh', 0.04)) return;
    const s = unit(Number(speed) / 2);
    const t = this.ctx.currentTime + 0.005;
    this.air({ t, dur: 0.32 - 0.1 * s, f0: 520, f1: 1500 + 900 * s, q: 2.2, peak: 0.15 + 0.3 * s, pan0: pan - 0.1, pan1: pan + 0.1, top: 4000 });
    this.burst({ t, f: rnd(740, 820), q: 7, peak: 0.15 * s + 0.04, attack: 0.03, decay: 0.2, dest: this.panner(pan) });
  }

  // One paddle or tooth of a turning wheel going by.
  wheel(speed = 1, pan = 0) {
    if (!this.ready()) return;
    const s = unit(Number(speed) / 1.2);
    const now = this.ctx.currentTime;
    const kind = this.lv.tick;
    const level = HIT * (kind === 'gear' ? 0.16 : 0.22) * (0.25 + 0.75 * s) * rnd(0.85, 1.1);
    if (!this.admit(now, s * 0.5, level, 'tick')) return;
    const layer =
      kind === 'gear' ? [pick(this.gear), 1, rnd(0.97, 1.03)] :
      kind === 'glass' ? [pick(this.hits.glass[0]), 0.6, rnd(0.97, 1.03)] :
      kind === 'paddle' ? [pick(this.hits.wood[s < 0.5 ? 0 : 1]), 1, rnd(1.3, 1.4)] :
      [pick(this.pieces[0][0]), 1, rnd(0.95, 1.05)];
    this.voice(this.hitTime(now), [layer], level, 2200 * 2 ** s, pan, true);
  }

  // A spinner kicked by a marble: the tap on a blade, then the blades
  // fluttering past, slowing as friction takes over. The starburst's gold
  // rods add a few soft twinkles as they turn.
  spinner(speed = 1, pan = 0) {
    if (!this.ready() || this.limit('spinner', 0.12)) return;
    const ctx = this.ctx;
    const s = clamp(Number(speed) / 1.5, 0.1, 1);
    const kind = this.lv.spin;
    const t = ctx.currentTime + 0.005;
    const dur = 1.1 + 1.3 * s;
    // the kick
    const tap = kind === 'star' ? [pick(this.hits.brass[0]), 0.5, rnd(1.1, 1.2)] : [pick(this.hits.wood[0]), 1, rnd(1.2, 1.35)];
    this.voice(t, [tap], HIT * 0.2 * (0.4 + 0.6 * s), 3000, pan, false);
    // blade-pass flutter: noise through a band, chopped by the blades as
    // they pass (six to a turn), the rate falling as the spin dies
    const f = kind === 'pinwheel' ? 1000 : kind === 'star' ? 1700 : 1300;
    const bp = filter(ctx, 'bandpass', f, 1.2);
    const chop = gainNode(ctx, 0.55);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const rate0 = 6 * (1.5 + 3.5 * s);
    o.frequency.setValueAtTime(rate0, t);
    o.frequency.exponentialRampToValueAtTime(rate0 * 0.12, t + dur);
    const depth = gainNode(ctx, 0.45);
    o.connect(depth).connect(chop.gain);
    const g = gainNode(ctx, 0);
    const end = env(g.gain, t, 0.12 + 0.16 * s, 0.02, dur);
    const src = this.loopSrc(this.pink, t);
    src.connect(bp).connect(chop).connect(g).connect(this.panner(pan));
    o.start(t);
    o.stop(end + 0.02);
    src.stop(end + 0.02);
    if (kind === 'star') {
      const b = this.tonic + 36;
      let at = t + 0.08;
      for (let k = 0; k < 2 + Math.round(3 * s); k++) {
        this.note('bell', penta(b, Math.floor(rnd(0, 6))), at, rnd(0.05, 0.08) * (1 - k * 0.12), pan + rnd(-0.2, 0.2));
        at += rnd(0.1, 0.16) * (1 + k * 0.35);
      }
    }
  }

  // The lift mechanism, 0..1 (0 stops it). It keeps running at the last
  // amount until told otherwise.
  lift(amount = 0) {
    this.liftAmt = unit(amount);
    if (!this.ctx) return;
    if (!this.ready()) {
      this.fadeLift();
      return;
    }
    const now = this.ctx.currentTime;
    const a = this.liftAmt;
    let v = this.liftV;
    if (!v || v.kind !== this.lv.lift) {
      if (a < 0.01) return;
      if (v) this.stopLift(v, now);
      v = this.liftV = this.makeLift(this.lv.lift);
    }
    const L = LIFTS[v.kind];
    v.g.gain.setTargetAtTime(L.level * a ** 0.8, now, 0.15);
    if (L.rate) v.src.playbackRate.setTargetAtTime(L.rate[0] + L.rate[1] * a, now, 0.25);
    if (a >= 0.01) v.idleAt = Infinity;
    else if (v.idleAt === Infinity) v.idleAt = now;
  }

  makeLift(kind) {
    const ctx = this.ctx;
    let buf = this.lifts[kind + this.tonic];
    if (!buf) buf = this.lifts[kind + this.tonic] = mono(ctx, liftLoop(kind, this.tonic), LIFT_RATE);
    const src = this.loopSrc(buf);
    const L = LIFTS[kind];
    if (L.rate) src.playbackRate.value = L.rate[0];
    const g = gainNode(ctx, 0);
    src.connect(g).connect(this.panner(L.pan, this.bus));
    return { kind, src, g, idleAt: Infinity };
  }

  fadeLift(stop = false) {
    const v = this.liftV;
    if (!v || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (stop) this.stopLift(v, now);
    else {
      v.g.gain.setTargetAtTime(0, now, 0.1);
      if (v.idleAt === Infinity) v.idleAt = now;
    }
  }

  stopLift(v, now) {
    v.g.gain.cancelScheduledValues(now);
    v.g.gain.setTargetAtTime(0, now, 0.12);
    try {
      v.src.stop(now + 1);
    } catch {
      /* already stopped */
    }
    if (this.liftV === v) this.liftV = null;
  }

  // ------------------------------------------------------------ the marbles' journey

  // A marble released into the run: a small round "plip" as it drops in,
  // then the soft tock of it settling on the track.
  drop() {
    if (!this.ready() || this.limit('drop', 0.05)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const k = rnd(0.95, 1.06);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(680 * k, t);
    o.frequency.exponentialRampToValueAtTime(1250 * k, t + 0.06);
    const g = gainNode(ctx, 0);
    const end = env(g.gain, t, 0.07, 0.006, 0.07);
    o.connect(g).connect(this.panner(0));
    o.start(t);
    o.stop(end + 0.01);
    this.voice(t + 0.014, [[pick(this.hits.wood[0]), 1, rnd(1.1, 1.25)]], HIT * 0.12, 2400, 0, false);
  }

  // A marble scooped from the wooden bowl: the others shift and clink
  // together, and the bowl knocks softly.
  pickup() {
    if (!this.ready() || this.limit('pickup', 0.06)) return;
    const t = this.ctx.currentTime + 0.005;
    const n = 2 + Math.floor(rnd(0, 2.4));
    let at = t;
    for (let k = 0; k < n; k++) {
      this.voice(at, [[pick(this.clacks), 1, rnd(0.9, 1.15)]], HIT * rnd(0.2, 0.32) * (1 - k * 0.18), rnd(4200, 6500), rnd(-0.2, 0.2), false);
      at += rnd(0.025, 0.07);
    }
    this.voice(t + 0.01, [[pick(this.pieces[2][0]), 1, rnd(0.7, 0.8)]], HIT * 0.07, 1400, 0, false);
  }

  // A marble fades away and magically returns to the bowl: a quick climb of
  // soft chimes and a breath of shimmer.
  sparkle() {
    if (!this.ready() || this.limit('sparkle', 0.08)) return;
    const t = this.ctx.currentTime + 0.01;
    const b = this.tonic + 24;
    const start = Math.floor(rnd(0, 3));
    const pan = rnd(-0.3, 0.3);
    for (let k = 0; k < 4; k++) this.note('bell', penta(b, start + k), t + k * 0.055, 0.1 - k * 0.012, pan + k * 0.08);
    this.air({ t, dur: 0.5, f0: 2600, f1: 5200, q: 1.2, peak: 0.012, pan0: pan, pan1: pan + 0.3, top: 7000 });
  }

  // A marble drops into a puzzle's goal cup: a little ding.
  goal() {
    if (!this.ready() || this.limit('goal', 0.08)) return;
    const t = this.ctx.currentTime + 0.01;
    this.note('celesta', this.tonic + 24, t, 0.28);
    this.note('bell', this.tonic + 31, t + 0.05, 0.06);
  }

  // A puzzle solved (1..3 stars): a quick run up the chord on the level's
  // instrument, then (2+) a rolled chord over a soft bass, and (3) a
  // sprinkle of chimes.
  success(stars = 1) {
    if (!this.ready()) return;
    const n = clamp(Math.round(Number(stars) || 1), 1, 3);
    const inst = this.lv.flourish;
    const t = this.ctx.currentTime + 0.03;
    const b = this.tonic + 12;
    const run = n === 1 ? [0, 4, 7, 12] : n === 2 ? [0, 4, 7, 12, 16] : [0, 4, 7, 12, 16, 19, 24];
    const step = 0.085;
    run.forEach((iv, k) => this.note(inst, b + iv, t + k * step, 0.26 + k * 0.012, -0.3 + (0.6 * k) / run.length));
    const top = t + run.length * step;
    if (n >= 2) {
      for (const [iv, d] of [[12, 0], [16, 0.03], [19, 0.06]]) this.note(inst, b + iv, top + d, 0.16);
      this.note('bass', this.tonic - 12, top, 0.3);
    }
    if (n === 3) {
      for (let k = 0; k < 5; k++) this.note('bell', penta(b + 24, Math.floor(rnd(0, 7))), top + 0.12 + k * rnd(0.07, 0.11), rnd(0.07, 0.11), rnd(-0.5, 0.5));
    }
    this.music.duck(0.4, 1.2 + 0.4 * n);
  }

  // ------------------------------------------------------------ UI and building

  // a button: a tiny wooden tick
  click() {
    if (!this.ready()) return;
    this.voice(this.ctx.currentTime + 0.003, [[pick(this.pieces[0][0]), 1, rnd(1.2, 1.3)]], HIT * 0.2, 3200, 0, false);
  }

  // choosing something: two soft marimba notes up a fourth
  select() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.005;
    const b = this.tonic + 12;
    this.note('marimba', penta(b, 3), t, 0.14);
    this.note('marimba', penta(b, 5), t + 0.07, 0.16);
  }

  // A piece set down on the base: a firm wooden tock, and a lighter tap a
  // moment later as it settles onto its pegs.
  place() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.004;
    this.voice(t, [[pick(this.pieces[1][1]), 1, rnd(0.95, 1.05)]], HIT * 0.42, 5000, 0, false);
    this.voice(t + rnd(0.028, 0.04), [[pick(this.pieces[1][0]), 1, rnd(1.0, 1.1)]], HIT * 0.12, 3000, 0, false);
  }

  // A piece lifted off: a light tock and a small breath of air.
  remove() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.004;
    this.voice(t, [[pick(this.pieces[0][0]), 1, rnd(0.95, 1.05)]], HIT * 0.26, 3500, 0, false);
    this.air({ t: t + 0.01, dur: 0.22, f0: 700, f1: 1800, q: 1.4, peak: 0.035 });
  }

  // A piece turned a quarter: two quick detent clicks.
  rotate() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.004;
    this.voice(t, [[pick(this.pieces[0][1]), 1, rnd(1.15, 1.2)]], HIT * 0.2, 4500, 0, false);
    this.voice(t + 0.05, [[pick(this.pieces[0][1]), 1, rnd(1.15, 1.2)]], HIT * 0.16, 4500, 0, false);
  }

  // A piece raised or lowered a step: two clicks, the second a little
  // higher (up) or lower (down).
  raise() {
    this.steps(1.12);
  }

  lower() {
    this.steps(0.9);
  }

  steps(k) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.004;
    this.voice(t, [[pick(this.pieces[0][0]), 1, 1.05]], HIT * 0.18, 4000, 0, false);
    this.voice(t + 0.065, [[pick(this.pieces[0][0]), 1, 1.05 * k]], HIT * 0.2, 4000, 0, false);
  }

  // Undo: a soft swish back and a tock.
  undo() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.004;
    this.air({ t, dur: 0.24, f0: 1700, f1: 800, q: 1.3, peak: 0.035 });
    this.voice(t + 0.12, [[pick(this.pieces[1][0]), 1, rnd(1.0, 1.08)]], HIT * 0.22, 3500, 0, false);
  }

  // A piece snapping into place on the grid: a small, crisp click.
  snap() {
    if (!this.ready() || this.limit('snap', 0.03)) return;
    this.voice(this.ctx.currentTime + 0.003, [[pick(this.pieces[0][2]), 1, rnd(1.25, 1.35)]], HIT * 0.16, 6000, 0, false);
  }

  // Cannot place here: two soft, muffled taps at the same pitch, like a
  // finger tapping the table. Gentle and neutral, never a buzzer.
  nope() {
    if (!this.ready() || this.limit('nope', 0.25)) return;
    const t = this.ctx.currentTime + 0.004;
    this.voice(t, [[pick(this.rubber), 1, 1.6]], HIT * 0.28, 1400, 0, false);
    this.voice(t + 0.13, [[pick(this.rubber), 1, 1.6]], HIT * 0.2, 1300, 0, false);
  }

  // ------------------------------------------------------------ night ambience

  // Far-off crickets: a short trill or two of quick, soft pulses. They
  // belong to the storybook music, very quietly.
  crickets(t, dest) {
    const ctx = this.ctx;
    const p = this.panner(rnd(-0.8, 0.8), dest);
    const f = rnd(4300, 4800);
    const pulses = 3 + Math.floor(rnd(0, 2));
    const trills = 1 + Math.floor(rnd(0, 2.5));
    for (let c = 0; c < trills; c++) {
      for (let k = 0; k < pulses; k++) {
        const at = Math.max(t + c * 0.42 + k * 0.045, ctx.currentTime);
        const o = ctx.createOscillator();
        o.frequency.value = f * rnd(0.995, 1.005);
        const g = gainNode(ctx, 0);
        g.gain.setValueCurveAtTime(hannCurve(0.05 * (1 - 0.1 * k)), at, 0.024);
        o.connect(g).connect(p);
        o.start(at);
        o.stop(at + 0.03);
      }
    }
  }
}

// ------------------------------------------------------------ music

// A step sequencer that composes each eight-bar pass as it goes: the
// level's accompaniment and pad under a pentatonic tune built from a
// two-bar motif.
class Music {
  constructor(audio) {
    this.a = audio;
    const ctx = (this.ctx = audio.ctx);
    this.fade = gainNode(ctx, 0);
    this.duckG = gainNode(ctx, 1);
    this.fade.connect(this.duckG);
    this.duckG.connect(audio.master);
    this.duckG.connect(audio.musicSend);
    this.buses = [-0.35, 0, 0.35].map((p) => audio.panner(p, this.fade));
    this.running = false;
    this.timer = 0;
    this.pending = null;
    this.level = null;
  }

  start(level) {
    const t = this.ctx.currentTime;
    if (this.running) {
      if (level !== (this.pending || this.level)) {
        // let this tune fade, then begin the new level's from a fresh bar
        this.fade.gain.cancelScheduledValues(t);
        this.fade.gain.setTargetAtTime(0, t, 0.25);
        this.pending = level;
        this.switchAt = t + 1.1;
      }
      return;
    }
    this.running = true;
    this.pending = null;
    this.begin(level, t + 0.15);
    if (!this.a.offline) this.timer = setInterval(() => this.pump(), 60);
    this.pump();
  }

  begin(level, t) {
    this.level = level;
    this.style = STYLES[level] || STYLES.sunny;
    this.step = 0;
    this.next = t;
    this.planLoop = -1;
    this.motif = null;
    this.nightAt = t + rnd(2, 5);
    this.bellAt = t + rnd(3, 6);
    const g = this.fade.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(MUSIC * this.style.level, t, 0.6);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    this.pending = null;
    const t = this.ctx.currentTime;
    this.fade.gain.cancelScheduledValues(t);
    this.fade.gain.setTargetAtTime(0, t, 0.3);
  }

  // dip the music under a flourish, then bring it back
  duck(amount = 0.5, time = 1.5) {
    const g = this.duckG.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(amount, t, 0.08);
    g.setTargetAtTime(1, t + time, 0.5);
  }

  // Schedule every step that starts before `horizon` (default: a little
  // ahead of now). The offline test calls it once for the whole render.
  pump(horizon) {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    const until = horizon ?? now + 0.3;
    if (this.next < now - 0.05) {
      // the timer fell behind (a long frame, a throttled tab): skip ahead
      // rather than cram the missed notes in at once
      const k = Math.ceil((now - this.next) / this.style.stepLen);
      this.step += k;
      this.next += k * this.style.stepLen;
    }
    while (this.next < until) {
      if (this.pending && this.next >= this.switchAt) {
        const r = this.pending;
        this.pending = null;
        this.begin(r, this.next);
      }
      this.play(this.step, this.next);
      this.step++;
      this.next += this.style.stepLen;
    }
  }

  play(step, t) {
    const st = this.style;
    const a = this.a;
    const loopLen = st.spb * 8;
    const li = Math.floor(step / loopLen);
    if (li !== this.planLoop) {
      this.plan = this.compose(li);
      this.planLoop = li;
    }
    // keep time while muted, but spare the work
    if (a.muted) return;
    const k = step % loopLen;
    const evs = this.plan.steps[k];
    if (evs) for (const [inst, m, vel, bus, jit] of evs) a.note(inst, m, t + jit, vel, 0, this.buses[bus]);
    if (st.pad && k % st.spb === 0) {
      // the bar's chord, folded into one octave above padBase so the voices
      // move by small steps; the warm pad adds the root an octave down
      const ch = triad(this.plan.chords[k / st.spb]);
      const notes = ch.map((x) => st.padBase + ((((st.tonic + x - st.padBase) % 12) + 12) % 12));
      if (st.pad === 'space') notes.push(st.padBase - 12 + ((((st.tonic + ch[0] - st.padBase) % 12) + 12) % 12));
      const dur = st.stepLen * st.spb * 1.02;
      notes.forEach((m, i) => a.pad(st.pad, m, t, dur, st.padVel * (i === 3 ? 0.5 : 1), this.buses[i % 3]));
    }
    if (st.night && t >= this.nightAt) {
      a.crickets(t, this.fade);
      this.nightAt = t + rnd(3, 8);
    }
    if (st.bells && t >= this.bellAt) {
      const b = st.bells;
      a.note(b.inst, penta(b.base, Math.floor(rnd(0, 6))), t, b.vel * rnd(0.8, 1.1), 0, this.buses[Math.floor(rnd(0, 3))]);
      this.bellAt = t + rnd(b.gap[0], b.gap[1]);
    }
  }

  // One eight-bar pass. The tune is a two-bar motif, answered, contrasted
  // and brought home (A A' B A''); the motif is kept or reshaped from the
  // last pass, so it is familiar without repeating exactly. Every fourth
  // pass the tune rests for half the loop: that space is what stops a loop
  // from nagging.
  compose(loop) {
    const st = this.style;
    const spb = st.spb;
    const steps = [];
    const add = (step, ev) => (steps[step] || (steps[step] = [])).push(ev);
    const prog = loop % 2 && st.alt ? st.alt : st.prog;
    prog.forEach((deg, bar) => {
      const ch = triad(deg);
      if (st.comp) for (const [s, tone, oct, vel] of st.compPat) add(bar * spb + s, [st.comp, st.compBase + ch[tone] + 12 * oct, vel * rnd(0.85, 1.1), 0, rnd(0, 0.012)]);
      if (st.bass) for (const [s, tone, oct, vel] of st.bassPat) add(bar * spb + s, [st.bass, st.bassBase + ch[tone] + 12 * oct, vel * rnd(0.9, 1.05), 1, 0]);
    });
    if (!this.motif || Math.random() < 0.6) this.motif = motif(st, this.motif);
    const rest = loop % 4 === 3;
    let idx = pick([2, 4, 5]);
    for (let bar = 0; bar < 8; bar++) {
      const phrase = bar >> 1;
      const half = bar & 1;
      const pcs = triad(prog[bar]).map((x) => x % 12);
      const last = bar === 7;
      const fresh = phrase === 2;
      const rhythm = last ? st.end : fresh ? pick(st.rhythms) : this.motif.rhythm[half];
      rhythm.forEach(([s], k) => {
        let step = fresh ? pick(STEPS) : this.motif.steps[half][k % this.motif.steps[half].length];
        if (phrase === 1 && half === 1 && k === 0) step += 1; // the answer reaches a little higher
        if (idx + step > 8 || idx + step < 1) step = -step;
        idx = clamp(idx + step, 0, 9);
        // strong beats and the last note sit on a chord tone
        if (s === 0 || (st.beats === 4 && s === 4) || (last && k === rhythm.length - 1)) idx = chordTone(idx, pcs);
        if (rest && bar < 4) return;
        add(bar * spb + s, [st.lead, penta(st.leadBase, idx), st.leadVel * (s === 0 ? 1 : 0.82) * rnd(0.88, 1.08), 1, rnd(0, 0.006)]);
      });
    }
    return { steps, chords: prog };
  }
}

function motif(st, prev) {
  if (prev && Math.random() < 0.5) {
    // reshape one bar of the old motif
    const m = { rhythm: prev.rhythm.slice(), steps: prev.steps.map((s) => s.slice()) };
    const h = Math.random() < 0.5 ? 0 : 1;
    m.rhythm[h] = pick(st.rhythms);
    m.steps[h] = m.rhythm[h].map(() => pick(STEPS));
    return m;
  }
  const rhythm = [pick(st.rhythms), pick(st.rhythms)];
  return { rhythm, steps: rhythm.map((r) => r.map(() => pick(STEPS))) };
}

// the nearest pentatonic index whose note belongs to the chord
function chordTone(idx, pcs) {
  for (const d of [0, -1, 1, -2, 2]) {
    const j = idx + d;
    if (j >= 0 && j <= 9 && pcs.includes(PENTA[j % 5])) return j;
  }
  return idx;
}

// the loudness of a rolling voice: nothing below a crawl, then rising a
// little faster than speed; louder as a marble spins down a funnel
function rollCurve(sp, bowl) {
  const fadeIn = clamp((sp - 0.04) / 0.1, 0, 1);
  return clamp(sp / FULL, 0, 1.5) ** 1.3 * fadeIn * fadeIn * (1 + 0.2 * bowl);
}

// ------------------------------------------------------------ Web Audio helpers

function filter(ctx, type, freq, q) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function gainNode(ctx, v) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function mono(ctx, data, sr = ctx.sampleRate) {
  const b = ctx.createBuffer(1, data.length, sr);
  b.getChannelData(0).set(data);
  return b;
}

// jump a parameter to a value now, dropping anything scheduled
function setNow(param, v, now) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(v, now);
}

function periodicWave(ctx, amps) {
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  amps.forEach((a, i) => (imag[i + 1] = a));
  return ctx.createPeriodicWave(real, imag);
}

// A one-shot envelope from exactly 0 back to exactly 0: a raised-cosine
// rise, then an exponential fall whose last stretch tapers to nothing, so
// nothing clicks. Returns the end time.
function env(param, t, peak, attack, decay) {
  attack = Math.max(0.002, attack);
  const total = attack + decay;
  const n = clamp(Math.ceil(total * 1500), 32, 2048);
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * total;
    let v;
    if (s < attack) v = 0.5 - 0.5 * Math.cos((Math.PI * s) / attack);
    else {
      const u = (s - attack) / decay;
      v = Math.exp(-4 * u) * (u > 0.7 ? 0.5 + 0.5 * Math.cos((Math.PI * (u - 0.7)) / 0.3) : 1);
    }
    c[i] = v * peak;
  }
  c[n - 1] = 0;
  param.setValueCurveAtTime(c, t, total);
  return t + total;
}

function hannCurve(peak, n = 64) {
  return Float32Array.from({ length: n }, (_, i) => peak * Math.sin((Math.PI * i) / (n - 1)) ** 2);
}

// linear to 0.7, then eased towards 0.98: only the rarest peaks feel it
function softClip() {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28));
  }
  return c;
}

// ------------------------------------------------------------ the bank

// The impacts, rolling textures and noise, rendered once per page at a
// fixed rate (the browser resamples if the context runs at another), so it
// can be made before any AudioContext exists.
const BANK_RATE = 48000;
let BANK = null;
function bank() {
  if (BANK) return BANK;
  const sr = BANK_RATE;
  const variants = (spec, n = VARIANTS) => Array.from({ length: n }, () => renderImpact(sr, spec()));
  BANK = {
    noise: { white: noiseData('white', sr), pink: noiseData('pink', sr) },
    smooth: smoothData(sr),
    grit: gritData(sr),
    hits: Object.fromEntries(SURFACES.map((s) => [s, [0, 1, 2].map((h) => variants(() => hitSpec(s, h)))])),
    clacks: variants(CLACK, 6),
    pieces: PIECES.map((size) => [0, 1, 2].map((h) => variants(() => pieceSpec(size, h)))),
    gear: variants(GEAR),
    rubber: variants(RUBBER),
  };
  return BANK;
}

// ------------------------------------------------------------ offline DSP
// Plain JS that fills buffers once (or once per note).

function fadeTail(d, frac) {
  const n = d.length;
  const m = Math.max(1, Math.floor(n * frac));
  for (let i = 0; i < m; i++) d[n - m + i] *= 0.5 + 0.5 * Math.cos((Math.PI * (i + 1)) / m);
}

function normalise(d, peak = 1) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
  return d;
}

function normaliseRms(d, rms) {
  let e = 0;
  for (let i = 0; i < d.length; i++) e += d[i] * d[i];
  const k = rms / Math.sqrt(e / d.length || 1);
  for (let i = 0; i < d.length; i++) d[i] *= k;
  return d;
}

function onePoleLP(d, sr, fc) {
  const a = Math.exp((-2 * Math.PI * fc) / sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    y = (1 - a) * d[i] + a * y;
    d[i] = y;
  }
}

function onePoleHP(d, sr, fc) {
  const a = Math.exp((-2 * Math.PI * fc) / sr);
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    y1 = a * (y1 + x - x1);
    x1 = x;
    d[i] = y1;
  }
}

// An RBJ band-pass (constant peak gain) run in place.
function bandPass(d, sr, f, q) {
  const w = (2 * Math.PI * f) / sr;
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  const b0 = al / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    d[i] = y;
  }
}

// Run filters over a loop as if it repeated forever: process two copies
// back to back and keep the second, whose start has the first's end as its
// past. The result loops without a seam.
function periodic(d, process) {
  const n = d.length;
  const x = new Float32Array(n * 2);
  x.set(d);
  x.set(d, n);
  process(x);
  return x.slice(n);
}

// add `ev` into the loop `d` at sample `at`, wrapping round the end
function addWrapped(d, ev, at, gain = 1) {
  const n = d.length;
  for (let i = 0; i < ev.length; i++) d[(at + i) % n] += ev[i] * gain;
}

// Two seconds of noise: white, or pink (Paul Kellet's filter).
function noiseData(kind, sr) {
  const n = sr * 2;
  const d = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else d[i] = w * 0.5;
  }
  // no DC, and a loop seam that does not click
  let m = 0;
  for (let i = 0; i < n; i++) m += d[i];
  m /= n;
  for (let i = 0; i < n; i++) d[i] -= m;
  const x = 256;
  for (let i = 0; i < x; i++) {
    const k = i / x;
    d[i] = d[i] * k + d[n - x + i] * (1 - k);
  }
  return d.slice(0, n - x);
}

// The rolling textures are surface profiles as heard at 1 m/s; a voice
// plays them faster or slower with the marble's speed.
// The smooth part: the gentle waviness of any surface, a soft rumble with
// most of its energy below 2 kHz at 1 m/s.
function smoothData(sr) {
  const n = sr * 2;
  const w = Float32Array.from({ length: n }, () => Math.random() * 2 - 1);
  const d = periodic(w, (x) => {
    onePoleLP(x, sr, 900);
    onePoleLP(x, sr, 2200);
    onePoleHP(x, sr, 60);
  });
  return normaliseRms(d, 0.25);
}

// The grit: tiny bumps, pores and grain lines, met one by one. Poisson in
// time (900 a second at 1 m/s), mostly minute with now and then a bigger
// one, each a short smooth pulse; band-limited so a fast marble does not
// alias.
function gritData(sr) {
  const n = sr * 2;
  const d = new Float32Array(n);
  let t = 0;
  for (;;) {
    t += -Math.log(1 - Math.random()) / 900;
    const i = Math.floor(t * sr);
    if (i >= n) break;
    const a = Math.random() ** 3 * (Math.random() < 0.5 ? -1 : 1);
    d[i] += a;
    d[(i + 1) % n] += a * 0.5;
  }
  const out = periodic(d, (x) => {
    onePoleLP(x, sr, 4500);
    onePoleLP(x, sr, 4500);
    onePoleHP(x, sr, 150);
  });
  normaliseRms(out, 0.25);
  // the rare big bump is eased, so a coarse surface crackles, never snaps
  for (let i = 0; i < n; i++) out[i] = 0.9 * Math.tanh(out[i] / 0.9);
  return out;
}

// An impact, modelled physically. The contact force is a half-sine pulse of
// length `tc`, slightly roughened as real surfaces are; each mode [freq,
// amplitude, Q] is a two-pole resonator (a damped sine) driven by that
// force, so a longer, softer contact reaches the high modes less. What
// radiates is the surface's velocity, not its displacement, which also keeps
// a soft, slow push from turning into sub-bass. `click` adds the rate of
// change of the force, softened, which is what a small rigid body radiates
// as it is stopped: the dry "t" at the front of a tock. Starts and ends at
// zero. With `raw` it is neither trimmed nor normalised (for mixing into
// loops).
function renderImpact(sr, { modes, tc, click = 0, rough = 0.15, len, hp = 0 }, raw = false) {
  const n = Math.ceil(len * sr);
  const out = new Float32Array(n);
  const nf = Math.max(2, Math.round(tc * sr));
  const force = new Float32Array(nf);
  let area = 0;
  for (let i = 0; i < nf; i++) {
    force[i] = Math.sin((Math.PI * (i + 0.5)) / nf) * (1 + rough * (Math.random() * 2 - 1));
    area += force[i];
  }
  for (const [f, amp, q] of modes) {
    if (f >= sr * 0.45 || amp <= 0) continue;
    const w = (2 * Math.PI * f) / sr;
    const r = Math.exp((-Math.PI * f) / (q * sr));
    const a1 = 2 * r * Math.cos(w);
    const a2 = r * r;
    const b = (amp * Math.sin(w)) / area;
    const vel = 1 / (2 * Math.sin(w / 2)); // keeps each mode at `amp`
    // stop once the mode is some 80 dB down
    const end = Math.min(n, nf + Math.ceil((q / (Math.PI * f)) * 9.2 * sr));
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < end; i++) {
      const y = (i < nf ? b * force[i] : 0) + a1 * y1 - a2 * y2;
      out[i] += (y - y1) * vel;
      y2 = y1;
      y1 = y;
    }
  }
  if (click) {
    const c = new Float32Array(Math.min(n, nf + 96));
    let prev = 0;
    for (let i = 0; i < c.length; i++) {
      const v = i < nf ? force[i] : 0;
      c[i] = v - prev;
      prev = v;
    }
    onePoleLP(c, sr, 5000);
    onePoleLP(c, sr, 5000);
    normalise(c, click);
    for (let i = 0; i < c.length; i++) out[i] += c[i];
  }
  if (hp) {
    onePoleHP(out, sr, hp);
    onePoleHP(out, sr, hp);
  }
  fadeTail(out, 0.1);
  if (raw) return out;
  // keep only what is audible (down to -54 dB), so a voice frees itself as
  // soon as it falls silent
  return normalise(trim(out, 0.002), 1);
}

// A room's impulse response: a diffuse tail of noise decaying at the room's
// reverb time through a low-pass that closes as it dies (air and soft
// surfaces take the highs first), after a handful of early reflections that
// differ left and right. Normalised to unit energy per channel, so a send
// gain is simply the wet-to-dry energy ratio.
function renderIR(ctx, { rt, top, bottom, predelay, early }) {
  const sr = ctx.sampleRate;
  const n = Math.ceil(Math.min(2.5, rt * 1.4 + 0.05) * sr);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(n);
    const p0 = Math.round(predelay * sr);
    let lp = 0;
    let tail = 0;
    for (let i = p0; i < n; i++) {
      const t = (i - p0) / sr;
      const fc = bottom + (top - bottom) * Math.exp((-3 * t) / rt);
      const a = Math.exp((-2 * Math.PI * fc) / sr);
      lp = (1 - a) * (Math.random() * 2 - 1) + a * lp;
      d[i] = lp * Math.exp((-6.91 * t) / rt) * Math.min(1, t / 0.015 + 0.15);
      tail += d[i] * d[i];
    }
    // the early reflections carry about a third of the energy
    const smear = [0.5, 0.3, 0.15, 0.05];
    let e = 0;
    for (const [, g] of early) e += g * g;
    const k = Math.sqrt((tail * 0.5) / (e * smear.reduce((s, x) => s + x * x, 0)));
    for (const [time, g] of early) {
      const at = p0 + Math.round(time * sr * (ch ? 1.06 : 0.94));
      for (let j = 0; j < smear.length && at + j < n; j++) d[at + j] += g * smear[j] * k * (ch && j === 0 ? 0.9 : 1);
    }
    fadeTail(d, 0.15);
    let energy = 0;
    for (let i = 0; i < n; i++) energy += d[i] * d[i];
    const s = 1 / Math.sqrt(energy);
    for (let i = 0; i < n; i++) d[i] *= s;
    buf.getChannelData(ch).set(d);
  }
  return buf;
}

// One instrument note at midi pitch m. Partials above 7 kHz are left out and
// those above 3.5 kHz softened, so nothing is sharp; higher notes are a
// little quieter because ears are most sensitive up there.
function renderNote(sr, inst, m) {
  const f = mtof(m);
  const d = trim(inst === 'harp' ? renderPluck(sr, f) : renderAdditive(sr, f, INST[inst](f)), 0.002);
  return normalise(d, f > 1000 ? (1000 / f) ** 0.35 : 1);
}

// Cut a signal where it falls below `floor` of its peak for good, easing
// the new end to zero.
function trim(d, floor) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  const th = m * floor;
  let cut = d.length - 1;
  while (cut > 0 && Math.abs(d[cut]) < th) cut--;
  if (cut >= d.length - 64) return d;
  const out = d.slice(0, cut + 64);
  fadeTail(out, 0.15);
  return out;
}

function renderAdditive(sr, f, { partials, attack, thump, len }) {
  const n = Math.ceil(len * sr);
  const d = new Float32Array(n);
  for (const [ratio, amp, tau] of partials) {
    const fr = f * ratio;
    if (fr > 7000 || fr > sr * 0.45) continue;
    const a0 = amp * (fr > 3500 ? 1 - (0.7 * (fr - 3500)) / 3500 : 1);
    const w = (2 * Math.PI * fr) / sr;
    const c = 2 * Math.cos(w);
    const k = Math.exp(-1 / (tau * sr));
    const end = Math.min(n, Math.ceil(tau * sr * 7));
    // a sine by recurrence, starting at phase 0
    let s1 = Math.sin(-w);
    let s2 = Math.sin(-2 * w);
    let e = a0;
    for (let i = 0; i < end; i++) {
      const s = c * s1 - s2;
      s2 = s1;
      s1 = s;
      d[i] += s * e;
      e *= k;
    }
  }
  if (thump) {
    const [amp, fc, tau] = thump;
    const m = Math.min(n, Math.ceil(tau * 8 * sr));
    const c = new Float32Array(m);
    for (let i = 0; i < m; i++) c[i] = (Math.random() * 2 - 1) * Math.exp(-i / (tau * sr));
    onePoleLP(c, sr, fc);
    onePoleLP(c, sr, fc);
    normalise(c, amp);
    for (let i = 0; i < m; i++) d[i] += c[i];
  }
  const na = Math.max(2, Math.round(attack * sr));
  for (let i = 0; i < na && i < n; i++) d[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / na);
  fadeTail(d, 0.3);
  return d;
}

// A harp string (Karplus-Strong): one period of softened noise circulates in
// a delay line whose averaging filter takes the highs first, with an
// all-pass for exact tuning. Plucked by a fingertip near the middle-ish.
function renderPluck(sr, f) {
  const n = Math.ceil(2.2 * sr);
  const d = new Float32Array(n);
  const D = sr / f;
  const N = Math.max(2, Math.floor(D - 0.6));
  const frac = D - 0.5 - N; // left for the all-pass, 0.1..1.1 samples
  const C = (1 - frac) / (1 + frac);
  const t60 = clamp(3.0 * (200 / f) ** 0.4, 0.9, 3.2);
  const rho = 10 ** (-3 / (f * t60));
  const line = new Float32Array(N);
  let lv = 0;
  let lv2 = 0;
  for (let i = 0; i < N; i++) {
    lv = 0.75 * lv + 0.25 * (Math.random() * 2 - 1);
    lv2 = 0.75 * lv2 + 0.25 * lv;
    line[i] = lv2;
  }
  const off = Math.max(1, Math.round(N / 4));
  const ex = line.slice();
  for (let i = 0; i < N; i++) line[i] = ex[i] - ex[(i + off) % N];
  let idx = 0;
  let prev = 0;
  let apIn = 0;
  let apOut = 0;
  for (let i = 0; i < n; i++) {
    const x = line[idx];
    const avg = 0.5 * (x + prev) * rho;
    prev = x;
    const ap = C * avg + apIn - C * apOut;
    apIn = avg;
    apOut = ap;
    line[idx] = ap;
    d[i] = x;
    idx = idx + 1 === N ? 0 : idx + 1;
  }
  onePoleLP(d, sr, 3400);
  onePoleHP(d, sr, 50);
  const na = Math.round(0.003 * sr);
  for (let i = 0; i < na; i++) d[i] *= i / na;
  fadeTail(d, 0.3);
  return d;
}

// ------------------------------------------------------------ lift loops

// Each loop repeats exactly: every periodic part fits a whole number of
// cycles into it, and noise and events wrap round the seam.
const LIFT_RATE = 24000;

function liftLoop(kind, tonic) {
  const sr = LIFT_RATE;
  if (kind === 'hum') return humLoop(sr, tonic);
  if (kind === 'babble') return babbleLoop(sr);
  if (kind === 'ratchet') return ratchetLoop(sr);
  return screwLoop(sr);
}

// filtered noise that loops seamlessly
function loopNoise(n, process) {
  return periodic(Float32Array.from({ length: n }, () => Math.random() * 2 - 1), process);
}

// The Archimedes screw: a small geared motor's soft hum and whine, the
// plastic flight swishing round inside the clear tube twice a second, and
// marbles tapping against the flights as they ride up.
function screwLoop(sr) {
  const L = 3;
  const n = sr * L;
  const d = new Float32Array(n);
  // the motor: 150 Hz with a few soft harmonics, and the gear mesh at 600
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let m = 0;
    for (let h = 1; h <= 5; h++) m += Math.sin(2 * Math.PI * 150 * h * t + h) / h ** 1.6;
    d[i] = 0.07 * m + 0.02 * Math.sin(2 * Math.PI * 600 * t) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 2 * t));
  }
  // the swish of the flight passing, twice a turn
  const swish = loopNoise(n, (x) => {
    bandPass(x, sr, 1100, 1.4);
    onePoleLP(x, sr, 3000);
  });
  normaliseRms(swish, 0.12);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] += swish[i] * (0.65 + 0.35 * Math.sin(2 * Math.PI * 2 * t)) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 12 * t));
  }
  // marbles tapping the flights: a soft plastic tick now and then
  for (let k = 0; k < 10; k++) {
    const ev = renderImpact(sr, hitSpec('plastic', 0), true);
    normalise(ev, rnd(0.05, 0.12));
    addWrapped(d, ev, Math.floor(rnd(0, n)));
  }
  return normalise(d, 0.8);
}

// The glass elevator: a soft, glassy chord in the level's key (root, fifth,
// octave and a faint twelfth), each tone a slowly beating pair, over a
// breath of airy shimmer that swells once a loop.
function humLoop(sr, tonic) {
  const L = 4;
  const n = sr * L;
  const d = new Float32Array(n);
  // frequencies rounded to whole cycles per loop
  const tones = [[tonic + 12, 1], [tonic + 19, 0.55], [tonic + 24, 0.35], [tonic + 31, 0.1]];
  for (const [m, a] of tones) {
    const f = Math.round(mtof(m) * L) / L;
    for (const [df, b] of [[0, 1], [0.5, 0.6]]) {
      const w = (2 * Math.PI * (f + df)) / sr;
      for (let i = 0; i < n; i++) d[i] += a * b * Math.sin(w * i);
    }
  }
  const air = loopNoise(n, (x) => {
    bandPass(x, sr, 3200, 0.8);
    onePoleLP(x, sr, 6000);
  });
  normaliseRms(air, 0.05);
  for (let i = 0; i < n; i++) d[i] += air[i] * (0.6 + 0.4 * Math.sin((2 * Math.PI * i) / n));
  return normalise(d, 0.8);
}

// A small waterfall: a soft bed of falling water and a babble of bubbles,
// each a tiny rising "plip" at its Minnaert resonance (a bubble a few
// millimetres across rings between 0.6 and 2.4 kHz for a few milliseconds).
function babbleLoop(sr) {
  const L = 4;
  const n = sr * L;
  const d = loopNoise(n, (x) => {
    bandPass(x, sr, 800, 0.6);
    onePoleLP(x, sr, 3500);
    onePoleHP(x, sr, 150);
  });
  normaliseRms(d, 0.1);
  for (let i = 0; i < n; i++) d[i] *= 0.8 + 0.2 * Math.sin((2 * Math.PI * 2 * i) / n);
  const count = 55 * L;
  for (let k = 0; k < count; k++) {
    const f0 = Math.exp(rnd(Math.log(600), Math.log(2400)));
    const tau = rnd(0.004, 0.012) * (1200 / f0) ** 0.5;
    const len = Math.ceil(tau * 6 * sr);
    const ev = new Float32Array(len);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      ph += (2 * Math.PI * f0 * (1 + (0.8 * t) / tau / 6)) / sr;
      ev[i] = Math.sin(ph) * Math.exp(-t / tau) * Math.min(1, i / 12);
    }
    addWrapped(d, ev, Math.floor(rnd(0, n)), 0.22 * Math.random() ** 2);
  }
  return normalise(d, 0.8);
}

// The hand-crank gear wheel: the brass pawl clicking over the ratchet five
// times a second, the gear train's soft whirr pulsing with it, and the
// crank's gentle knock once a turn.
function ratchetLoop(sr) {
  const L = 2.4;
  const n = Math.round(sr * L);
  const d = loopNoise(n, (x) => {
    bandPass(x, sr, 700, 2);
    onePoleLP(x, sr, 2500);
  });
  normaliseRms(d, 0.025);
  for (let i = 0; i < n; i++) d[i] *= 0.7 + 0.3 * Math.sin((2 * Math.PI * 5 * i) / sr);
  for (let k = 0; k < 12; k++) {
    const ev = renderImpact(sr, GEAR(), true);
    normalise(ev, (k % 2 ? 0.26 : 0.3) * rnd(0.9, 1.1));
    addWrapped(d, ev, Math.round((k / 12) * n + rnd(-0.003, 0.003) * sr + n) % n);
  }
  for (let k = 0; k < 2; k++) {
    const ev = renderImpact(sr, pieceSpec(0.1, 0), true);
    normalise(ev, 0.1);
    addWrapped(d, ev, Math.round((k / 2 + 0.05) * n));
  }
  return normalise(d, 0.8);
}
