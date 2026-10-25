// Loomwake tuning. Every feel number lives here; G.cfg is a live deep copy
// (debug `__lw.set('dash.time', 0.2)` edits it at runtime).
//
// Exports:
//   DT                       fixed sim step (1/120 s)
//   CONFIG_VERSION           bump when a number changes meaning (content() reports it)
//   FEEL                     the tuning tree (copied into G.cfg by createGame)
//   BASE_STATS               the hero's stat block before boons (G.hero.stats has these names)
//   BINDINGS                 default input map (rebindable; settings store a copy)
//   PALETTE                  shared colours (hero, telegraph language, patrons)
//   cloneFeel()              a fresh deep copy of FEEL

export const DT = 1 / 120;
export const CONFIG_VERSION = 1;

export const FEEL = {
  hero: {
    r: 20, mass: 1, speed: 330,
    accel: 16,            // velocity lerp rate while moving (1/s)
    attackMove: 0.25,     // fraction of speed allowed while swinging
    hurtInv: 0.55,        // i-frames after taking a hit (s)
    hurtKnock: 480,
    respawnTime: 1.4,     // thread re-weave animation (s)
  },
  dash: {
    time: 0.15,           // s
    dist: 200,            // px (speed = dist / time)
    inv: 0.1,             // i-frames from the start of the dash (s)
    charges: 2,
    recharge: 0.45,       // s per charge, starts after a dash ends
    chainAt: 0.6,         // fraction of the dash after which the next dash may start
    strikeWindow: 0.12,   // attack within this long after a dash = dash-strike (s)
  },
  inputBuffer: 0.12,      // s a press stays buffered until it can be used
  hitstop: { light: 0.04, heavy: 0.08, kill: 0.05, hurt: 0.08, max: 0.12 },
  shake: { light: 0.14, heavy: 0.34, hurt: 0.4, kill: 0.16 },
  maxAttackers: 3,
  minTelegraph: 0.35,
  telegraphLinger: 0.16,  // a resolved telegraph fades this long
  stagger: 0.2,           // s an unarmoured foe is stunned by an ordinary hit
  armour: { brokenStun: 1.5, brokenBonus: 0.5 },
  knock: { decay: 9, slamSpeed: 380, slamDmg: 18, slamHitstop: 0.05 },
  separation: { foe: 0.9, hero: 0.6 },
  snare: {
    speed: 1500, range: 470, r: 16,
    dmg: 10, recallDmg: 18,
    lodge: 2.6,           // s the thread stays in a foe waiting for recall
    bind: 1.1,            // s a recalled foe is bound (rooted)
    pullSpeed: 1150, heavyMass: 4,
    cooldown: 1.2,
  },
  call: {
    perDealt: 1 / 700,    // gauge per point of damage dealt
    perTaken: 1 / 90,     // gauge per point of damage taken
    burstR: 280, burstDmg: 70, burstKnock: 720, burstStun: 1.4,
  },
  camera: { follow: 5, lead: 60, leadPad: 70, zoom: 1, kickDecay: 10, maxShake: 18 },
  hazards: { spikeCycle: 2.2, spikeUp: 0.6, spikeDmg: 14, thornDmg: 8, moltenDmg: 6, fallDmg: 12 },
};

// Stat names follow src/sim/boons.js heroStats(G) (powers helper), which
// recomputes G.hero.stats from these plus boons. Multipliers unless noted.
export const BASE_STATS = {
  maxHp: 100,       // absolute
  speed: 1,         // x FEEL.hero.speed
  dashCharges: 2,   // integer
  dashDist: 1,
  dashCd: 1,        // recharge time multiplier
  attackSpeed: 1,   // >1 = faster swings
  kbMult: 1,
  callGain: 1,
  callCost: 1,      // fraction of the gauge one Call spends
  slamMult: 1,
  maxArmor: 0,      // hero ward, spent before hp, refilled on room start (absolute)
  healMult: 1,
  deathDefiance: 0, // extra lives (absolute; meta adds)
};

// Physical key codes (KeyboardEvent.code), mouse buttons, standard gamepad buttons.
export const BINDINGS = {
  keys: {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    attack: ['KeyJ'], special: ['KeyK'], snare: ['KeyQ'], dash: ['Space', 'ShiftLeft'], call: ['KeyR'],
    interact: ['KeyE'], pause: ['Escape', 'KeyP'], map: ['Tab', 'KeyM'], confirm: ['Enter'],
  },
  mouse: { attack: 0, special: 2 },
  pad: { attack: [2], special: [3], snare: [7], dash: [0], interact: [1], pause: [9], map: [8], call: [[4, 5]] },
  padDeadzone: 0.2,
  aimAssist: { kbm: 0, pad: 0.5, touch: 0.8 },
};

export const PALETTE = {
  cloak: '#a3203f', cloakHi: '#e0485c', cloakDark: '#3e0a1f', lining: '#2b2462',
  tunic: '#2c3278', tunicHi: '#4a54a8', trim: '#f2c46b', trimHi: '#fff1c4',
  skin: '#f3cfae', skinShade: '#c99a83', boot: '#3a2418', leg: '#1d1c3a',
  scarf: ['#fff0b8', '#f2b443', '#ff7a3a'],
  gold: '#ffd27a', goldHi: '#fff1c4',
  danger: '#ff3d5e', dangerRim: '#ffb3c0', dangerHot: '#ffffff',
  patron: { dawn: '#ffc35a', tide: '#5ec8ff', storm: '#a6f6ff', stone: '#d8a46a', shade: '#b48cff', wind: '#8ff5b0' },
};

export function cloneFeel() { return JSON.parse(JSON.stringify(FEEL)); }
