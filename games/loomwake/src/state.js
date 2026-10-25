// The game object G (shape: build brief, "The game object G").
//
// Exports:
//   createGame({ seed, cfg }) -> G
//   makeEntity(G, o) -> entity with every generic field filled (foes, bosses, hero)
//   createHero(G, x, y) -> hero entity (also stored as G.hero)
//   seedRng(G, seed)         reseeds G.rng.run/ai/combat from one seed
//   hashState(G) -> uint32   hash of the whole sim state (determinism checks)
//
// Generic entity fields (sim/world.js and sim/combat.js maintain these):
//   id, kind, team ('hero'|'foe'), x, y, z, vx, vy (driven velocity), kx, ky (knock velocity, decays),
//   r, mass, hp, maxHp, armor, maxArmor, facing (radians), state, st (seconds in state),
//   flash (hit flash s), stun (s), inv (s, untargetable for hits), vuln (s, +50% dmg after armour break),
//   status: { name: { t, power } }, elite, dead, gone (remove from G.foes), spawning, untargetable,
//   hasToken (attack token), anim: {} (render scratch; the sim never reads it, hash ignores it)
import { cloneFeel, BASE_STATS, DT } from './config.js';
import { createBus } from './core/events.js';
import { rng, hashSeed } from './core/rng.js';

export function seedRng(G, seed) {
  G.seed = seed >>> 0;
  G.rng = { run: rng(hashSeed(seed, 'run')), ai: rng(hashSeed(seed, 'ai')), combat: rng(hashSeed(seed, 'combat')) };
  return G.rng;
}

export function createGame({ seed = 1, cfg } = {}) {
  const G = {
    t: 0, dt: DT, frame: 0, hitstop: 0, slow: 1, paused: false, frozen: false,
    scene: 'loading',
    bus: createBus(),
    rng: null, seed: 0,
    input: blankInput(),
    cfg: cfg || cloneFeel(),
    hero: null,
    foes: [], boss: null, projectiles: [], telegraphs: [], zones: [], pickups: [], npcs: [],
    chamber: null, run: null, meta: null, profile: 0,
    offer: null, dialogue: null,
    ui: {}, view: null, god: false,
    nextId: 1,
  };
  seedRng(G, seed);
  createHero(G, 0, 120);
  return G;
}

export function blankInput() {
  return {
    move: { x: 0, y: 0 }, aim: null, aimDir: { x: 1, y: 0 },
    attack: false, special: false, snare: false, dash: false, call: false, interact: false, pause: false, map: false, confirm: false,
    attackP: false, specialP: false, snareP: false, dashP: false, callP: false, interactP: false, pauseP: false, mapP: false, confirmP: false,
    device: 'kbm', touch: null,
  };
}

export function makeEntity(G, o = {}) {
  const e = {
    id: G.nextId++, kind: 'foe', team: 'foe',
    x: 0, y: 0, z: 0, vx: 0, vy: 0, kx: 0, ky: 0,
    r: 20, mass: 1, hp: 10, maxHp: 10, armor: 0, maxArmor: 0,
    facing: 0, state: 'idle', st: 0,
    flash: 0, stun: 0, inv: 0, vuln: 0, status: {},
    elite: false, dead: false, gone: false, spawning: false, untargetable: false, hasToken: false,
    anim: {},
  };
  Object.assign(e, o);
  if (o.maxHp == null && o.hp != null) e.maxHp = o.hp;
  if (o.hp == null && o.maxHp != null) e.hp = o.maxHp;
  if (o.maxArmor == null && o.armor) e.maxArmor = o.armor;
  return e;
}

export function createHero(G, x = 0, y = 0) {
  const c = G.cfg;
  const h = makeEntity(G, {
    kind: 'hero', team: 'hero', x, y, r: c.hero.r, mass: c.hero.mass,
    hp: BASE_STATS.maxHp, maxHp: BASE_STATS.maxHp, facing: -Math.PI / 2,
    state: 'move',
    weapon: 'blade', wpn: {},
    stats: { ...BASE_STATS },
    tvx: 0, tvy: 0,            // target velocity (weapons set it during their actions)
    moveAmt: 0, phase: 0, squash: 0,
    dashCharges: BASE_STATS.dashCharges, dashCd: 0, dashDir: { x: 1, y: 0 }, dashT: 9, dashing: false,
    combo: 0, comboWin: 0, cancel: false,
    cd: { special: 0, snare: 0 },
    buf: { attack: 0, special: 0, snare: 0, dash: 0, call: 0 },
    snare: null,               // { state:'out'|'lodged'|'back', x, y, dx, dy, d, t, target }
    call: 0,                   // gauge 0..1
    deathDefiance: 0,
    cloak: 0, hurtT: 0, lastHurt: -9,
    safe: { x, y },            // last safe floor point (pits)
    actionT: 0,
  });
  G.hero = h;
  return h;
}

// FNV-1a over a canonical walk of the sim state (numbers rounded to 1e-3).
export function hashState(G) {
  let h = 2166136261 >>> 0;
  const mixS = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  const mixN = (n) => mixS(Number.isFinite(n) ? String(Math.round(n * 1000)) : String(n));
  const ent = (e) => { mixN(e.id); mixS(String(e.kind)); mixN(e.x); mixN(e.y); mixN(e.vx); mixN(e.vy); mixN(e.hp); mixN(e.armor); mixS(String(e.state)); mixN(e.st); mixN(e.dead ? 1 : 0); };
  mixN(G.t); mixN(G.hitstop); mixS(G.scene);
  for (const k of ['run', 'ai', 'combat']) mixN(G.rng[k].state);
  if (G.hero) { ent(G.hero); mixN(G.hero.call); mixN(G.hero.dashCharges); mixN(G.hero.combo); }
  for (const e of G.foes) ent(e);
  for (const p of G.projectiles) { mixN(p.x); mixN(p.y); mixN(p.life); }
  for (const t of G.telegraphs) { mixN(t.x); mixN(t.y); mixN(t.t); }
  for (const z of G.zones) { mixN(z.x); mixN(z.y); mixN(z.t); }
  for (const p of G.pickups) { mixS(String(p.kind)); mixN(p.x); mixN(p.y); }
  mixS(G.chamber ? String(G.chamber.id) : '-');
  return h >>> 0;
}
