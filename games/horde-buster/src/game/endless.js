// Endless mode: waves that never run out. Every wave is built from its number alone (n is 0-based), so the same
// number always gives the same wave, and nothing is stored. The result has the chapter script format
// ({ name, sub, events, barrels?, boss? }, see chapters.js), so the run plays it like any chapter wave.
//
// The field changes setting every five waves (city, graveyard, hell, then round again) and each setting ends in
// its boss (ogre, demon, abomination). Creatures arrive over the first ten waves, so a fresh hero meets shamblers
// and runners first; waves then get longer and denser, with elite groups, pickups and barrels in the mix.
// `endlessScale` gives the health, speed and damage multipliers the run applies to every creature; they never stop rising.
import { rng } from '../config.js';

// The knobs. Threat points buy creatures (see KINDS): a wave of `n` spends budget0 + step * n points.
export const ENDLESS = {
  budget0: 130, // threat points in wave 0
  step: 60, // more points for every wave after it ...
  budgetBend: 45, // ... easing off towards a ceiling of budget0 + step * budgetBend (bigger = later)
  hpBend: 12, // hp: how quickly the quadratic climb eases off into a straight line (bigger = later)
  hpGrow: 0.18, // hp: on top of that, grows by this fraction (compounding) per wave after the first boss
  speedLn: 0.3, // creature speed: 1 + speedLn * ln(1 + n / 6)
  dmgStep: 0.15, // what reaches the hero hurts this much more per wave after the first boss (x4.75 by wave 30)
  bossStep: 0.35, // boss health: +35% of its base per wave past the first boss (the endless hero keeps every level) ...
  bossBend: 0.02, // ... and more each wave after that (so the 6th boss, wave 30, has about 22x)
};

const SETTINGS = ['city', 'graveyard', 'hell'];
const BOSSES = ['ogre', 'demon', 'abom'];

// What each creature costs in threat points, the first wave it can appear in, how often it is picked in each
// setting (city, graveyard, hell), the biggest group worth sending at once (a wide field multiplies it) and the
// ways it likes to come in.
const KINDS = {
  shambler: { cost: 1, from: 0, w: [3, 3, 1.5], max: 90, pat: ['wall', 'line', 'cluster'] },
  runner: { cost: 1.3, from: 0, w: [2.5, 2, 1.5], max: 36, pat: ['flank', 'line', 'swarm'] },
  brute: { cost: 7, from: 1, w: [2, 1.5, 2], max: 9, pat: ['center', 'line', 'flank'] },
  spider: { cost: 0.4, from: 2, w: [2, 1, 2], max: 120, pat: ['swarm'] },
  spitter: { cost: 3.5, from: 2, w: [1.5, 1.5, 1], max: 9, pat: ['line', 'flank'] },
  exploder: { cost: 2.5, from: 3, w: [1, 2, 1.5], max: 14, pat: ['line', 'cluster', 'flank'] },
  knight: { cost: 6, from: 5, w: [0.6, 2.5, 1], max: 8, pat: ['line', 'center', 'flank'] },
  imp: { cost: 1.8, from: 8, w: [0.5, 1, 3], max: 22, pat: ['swarm', 'flank', 'line'] },
  hound: { cost: 2.5, from: 10, w: [0.5, 1, 3], max: 16, pat: ['flank', 'line', 'swarm'] },
};
const KEYS = Object.keys(KINDS);

// the wave's name and tagline come from the creature it features
const THEMES = {
  shambler: [['The Long Dead', 'Hold the road'], ['Grave Tide', 'Keep shooting'], ['Rotting Rush', 'No end in sight']],
  runner: [['Dead Heat', 'Faster than they look'], ['The Sprint', 'Do not stand still'], ['Fast Dead', 'Keep moving']],
  brute: [['Brute Force', 'Big, red and angry'], ['Heavy Hands', 'Hit them hard'], ['Meat Wall', 'Aim for the head']],
  spider: [['The Swarm', 'So many legs'], ['Eight Legs', 'Do not get surrounded'], ['Web of Teeth', 'Spread them out']],
  spitter: [['Acid Rain', 'Keep moving'], ['Spit Storm', 'Dodge the green'], ['Green Barrage', 'Do not stand still']],
  exploder: [['Powder Keg', 'Pop them far away'], ['Big Bang Bloats', 'Do not let them close'], ['Pop Goes the Dead', 'Mind the boils']],
  knight: [['Iron Dead', 'Break the shields'], ['Rusted Legion', 'Shoot the shield down'], ['Shield Wall', 'Pierce the line']],
  imp: [['Winged Menace', 'Look up'], ['Imp Storm', 'They fly over walls'], ['Fire from Above', 'Keep your eyes up']],
  hound: [['Hell Hounds', 'They run on fire'], ['The Pack', 'Do not get cornered'], ['Dogs of War', 'Fast and hungry']],
};
const BOSS_NAMES = {
  ogre: ['Ogre Warlord', 'The big one'],
  demon: ['The Gilded Summoner', 'Mind the portals'],
  abom: ['The Abomination', 'Stitched from the fallen'],
};
const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

// what the road drops by itself: health, shields, bombs, a magnet, a lightning strike, a freeze
const UTILITY = ['shield', 'bomb', 'magnet', 'lightning', 'freeze'];
const SURGE = ['overdrive', 'triple', 'rage'];

export const endlessSetting = (n) => SETTINGS[Math.floor(Math.max(0, n) / 5) % 3];

// every fifth wave (5th, 10th, ...) is a boss wave; the boss follows the setting
export const endlessBoss = (n) => (n % 5 === 4 ? BOSSES[Math.floor(n / 5) % 3] : null);

// Multipliers for creature health and speed and for the boss's health in wave n. Chapter waves use
// hp = (1 + 0.4w + 0.2w^2) times 1, 1.6 or 2.3 for wave w of chapters 1 to 3 (run.js CHAPTER_HP); this starts on the same quadratic (1, 1.6, 2.6, 4,
// 5.8), bends towards a straight climb and, after the first boss, compounds about 18% a wave, so it passes the
// chapter 3 finale (13.3) around wave 8 and never stops; what reaches the hero hurts more each wave too. It is
// meant to outrun a hero who has levelled all the way (the chapter heroes have not): the autopilot, armoury half
// bought, falls to a boss or lasts into the high twenties. The run also holds a wave back while the field is
// packed (run.js runScript), so late waves get tougher, not more crowded.
// The boss grows faster still (x3.2 on wave 10, x10.8 on wave 20), since a hero that never resets outgrows it.
export function endlessScale(n) {
  n = Math.max(0, n);
  const m = Math.max(0, n - 4); // waves since the first boss
  return {
    hp: (1 + 0.4 * n + (0.2 * n * n) / (1 + n / ENDLESS.hpBend)) * Math.exp(ENDLESS.hpGrow * m),
    speed: 1 + ENDLESS.speedLn * Math.log(1 + n / 6),
    boss: 1 + ENDLESS.bossStep * m + ENDLESS.bossBend * m * m,
    dmg: 1 + ENDLESS.dmgStep * m,
  };
}

// a seeded generator for wave n, warmed up so neighbouring waves do not share their first numbers
function waveRng(n, salt = 0) {
  const r = rng((Math.imul(n + 1, 2654435761) ^ Math.imul(salt + 7, 0x5bd1e995)) >>> 0);
  for (let i = 0; i < 4; i++) r();
  return r;
}

// how often a creature is picked in wave n: the setting's weight, with runners and spitters (fast, and shooting
// from afar) held back while the hero has nothing yet
const weight = (key, n, set) => KINDS[key].w[set] * ((key === 'runner' && n < 4) || (key === 'spitter' && n < 6) ? 0.4 : 1);

// a creature for wave n by the setting's weights; `skip` is left out, `only` (if given) is all that is allowed
function pickKind(r, n, set, skip, only) {
  const ok = (k) => KINDS[k].from <= n && k !== skip && (!only || only.includes(k));
  let tot = 0;
  for (const k of KEYS) if (ok(k)) tot += weight(k, n, set);
  let x = r() * tot;
  let last = 'shambler';
  for (const k of KEYS) {
    if (!ok(k)) continue;
    last = k;
    x -= weight(k, n, set);
    if (x <= 0) return k;
  }
  return last;
}

// the creature a wave is about; never the same as the wave before's
function theme(n) {
  const only = (m) => (m < 1 ? ['shambler'] : m < 3 ? ['shambler', 'brute'] : null); // a gentle start
  const first = (m) => pickKind(waveRng(m, 1), m, Math.floor(m / 5) % 3, null, only(m));
  const t = first(n);
  return n > 0 && t === first(n - 1) ? pickKind(waveRng(n, 2), n, Math.floor(n / 5) % 3, t, only(n)) : t;
}

const cache = new Map();

export function endlessWave(n) {
  n = Math.max(0, Math.floor(n));
  let w = cache.get(n);
  if (!w) {
    w = build(n);
    cache.set(n, w);
    if (cache.size > 12) cache.delete(cache.keys().next().value); // the run only ever asks for the current wave
  }
  return w;
}

function build(n) {
  const set = Math.floor(n / 5) % 3;
  const bossKey = endlessBoss(n);
  const r = waveRng(n);
  const rr = (a, b) => a + r() * (b - a);
  const events = [];
  const pts = ENDLESS.budget0 + (ENDLESS.step * n) / (1 + n / ENDLESS.budgetBend);
  const dense = Math.max(0.3, 1 / (1 + 0.04 * Math.max(0, n - 4))); // boss-wave stream gaps shrink as waves go on
  const seconds = (s) => Math.round(s * 10) / 10;
  const gap = (s) => Math.max(0.2, seconds(s)); // a stream never spawns faster than five times a second
  const pickup = (t, kind) => events.push({ t: seconds(t), pickup: kind });
  const ramp = Math.min(1, 0.35 + n / 10); // the first waves send smaller groups
  const size = (key, points) => Math.max(1, Math.min(Math.round(KINDS[key].max * ramp), Math.round(points / KINDS[key].cost)));
  const pat = (key) => KINDS[key].pat[Math.floor(r() * KINDS[key].pat.length)];

  if (bossKey) {
    // a boss wave: the boss, and the horde pouring in until it falls (same shape as the chapter boss waves)
    events.push({ t: 1.5, boss: bossKey });
    const stream = (key, t, a, b, k = 1) => events.push({ t, stream: key, every: [gap(a * dense), gap(b * dense)], until: 999, n: k });
    stream('shambler', 8, 1.4, 0.6);
    stream('runner', 30, 4, 2.2);
    stream('spider', 20, 5, 3, 12);
    if (set === 1) {
      stream('exploder', 14, 7, 4);
      if (n >= 9) stream('knight', 40, 14, 9);
    } else if (set === 2) {
      stream('hound', 14, 6, 3.5, 2);
      stream('imp', 24, 5, 3, 3);
    } else if (n >= 9) stream('spitter', 36, 9, 6);
    // escorts through a long fight (the first boss is the chapter's, as it was)
    for (let t = 45, k = 0; n >= 9 && t <= 165; t += 30, k++) {
      const key = pickKind(r, n, set, 'spider', ['brute', 'knight', 'exploder', 'hound', 'imp', 'shambler']);
      events.push({ t, group: key, n: size(key, 0.1 * pts), pattern: pat(key), elite: n >= 9 && k % 2 === 0 ? 1 : 0 });
    }
    pickup(18, 'heart');
    pickup(30, SURGE[Math.floor(r() * 3)]);
    pickup(40, 'shield');
    pickup(55, 'heart');
    pickup(70, 'bomb');
    pickup(100, 'heart');
    const [name, sub] = BOSS_NAMES[bossKey];
    return { name: name + (ROMAN[Math.floor(n / 15)] ?? ` ${Math.floor(n / 15) + 1}`), sub, barrels: 4, boss: true, events };
  }

  const dur = Math.min(100, 50 + 1.4 * n);
  const feat = theme(n);
  const groupPts = pts * 0.65;
  const streamPts = pts * 0.35;

  // groups: a beat every few seconds, the featured creature about half the time, the last beat the biggest
  const beats = [];
  for (let t = 0.5; t < dur - 6; t += Math.max(3.2, 7 - 0.12 * n) * rr(0.8, 1.2)) beats.push(seconds(t));
  const weights = beats.map((_, i) => rr(0.6, 1.4) * (i === beats.length - 1 ? 1.5 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  // the heavy and the distant creatures are rationed (a wide field multiplies the counts), more of them as waves go on
  const left = { spider: 360, brute: 3 + 1.2 * n, knight: 2 + n, spitter: 4 + 0.5 * n };
  beats.forEach((t, i) => {
    let key = r() < 0.5 ? feat : pickKind(r, n, set);
    const points = (groupPts * weights[i]) / total;
    if (left[key] !== undefined && left[key] < (key === 'spider' ? 30 : 1)) key = 'shambler';
    if (points < KINDS[key].cost * 0.7) key = n < 2 ? 'shambler' : 'runner';
    let count = size(key, points);
    if (left[key] !== undefined) {
      count = Math.max(1, Math.min(count, Math.floor(left[key])));
      left[key] -= count;
    }
    events.push({ t, group: key, n: count, pattern: pat(key) });
  });

  // streams: a steady trickle under the beats (shamblers and runners, then the setting's own creature)
  const until = seconds(dur - 3);
  const stream = (key, t, share) => {
    const count = (streamPts * share) / KINDS[key].cost;
    const per = Math.max(1, Math.ceil((count * 0.34) / (until - t))); // at most about 3 spawns a second
    const avg = (until - t) / Math.max(1, count / per);
    events.push({ t, stream: key, every: [gap(avg * 1.35), gap(avg * 0.65)], until, n: per });
  };
  stream('shambler', 1, 0.5);
  stream('runner', 6, 0.3);
  if (n >= 6) stream(feat === 'shambler' || feat === 'runner' ? pickKind(r, n, set, feat, ['spider', 'spitter', 'exploder', 'imp', 'hound', 'brute']) : feat, 12, 0.2);

  // elite groups: one big leader (4x health, a chest and a crate) with followers
  const elites = n < 2 ? 0 : Math.min(3, 1 + Math.floor((n - 2) / 6));
  for (let i = 0; i < elites; i++) {
    const key = pickKind(r, n, set, 'spider', ['shambler', 'runner', 'brute', 'exploder', 'knight', 'imp', 'hound']);
    events.push({ t: seconds(dur * [0.4, 0.68, 0.84][i]), group: key, n: Math.max(2, size(key, 0.08 * pts)), pattern: pat(key), elite: 1 });
  }

  // pickups
  pickup(dur * 0.35, 'heart');
  if (n >= 10) pickup(dur * 0.15, 'heart');
  pickup(dur * 0.55, UTILITY[Math.floor(r() * UTILITY.length)]);
  pickup(dur * 0.8, UTILITY[Math.floor(r() * UTILITY.length)]);
  if (n % 2 === 1 || n >= 12) pickup(dur * 0.2, SURGE[Math.floor(r() * 3)]);

  // barrels: some on the road at the start, more rolling in mid-wave
  events.push({ t: seconds(dur * 0.5), barrels: 3 });
  const [name, sub] = THEMES[feat][Math.floor(r() * 3)];
  return { name, sub, barrels: Math.min(9, 4 + Math.floor(n / 6)), events };
}
