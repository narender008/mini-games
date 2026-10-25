// The Unravelled: registry, spawning, the per-tick update, and wave building.
//
// API
//   KINDS, ATTACKS                    re-exported from content/enemies.js
//   spawn(G, kind, x, y, opts)        -> entity (pushed to G.foes, emits 'spawn')
//        opts: { elite, delay (s before the vortex), region, scale (hp mul),
//                summoned, owner, noReward, facing }
//   updateFoes(G, dt)                 run every non-boss foe's AI, then G.foeFx
//   aliveFoes(G, owner?)              living, non-boss foes (optionally summoned by owner)
//   waveBudget(region, depth, wave, kind?) -> points for one wave
//   buildWave(rng, { region, depth, wave, budget, elites, kind, max }) -> [{ kind, elite }]
//   WAVE_MIX                          per-region templates (which kinds mix well)
//
// Bus events emitted here and in attacks.js (all carry e): spawn, foeRise,
// foeWindup {atk}, foeSwing {atk}, foeCast, foeSing, foeThrow, foeLeap,
// foeDash, foeBlink {x,y}, foeHum, foeRoar, foeInhale, foeBreath, foeSnare,
// foeSnareBreak, foeEnrage, foeImpact {x, y, r, power, kind, color}.
import { KINDS, ATTACKS, REGION_SCALE, ELITE, REGIONS } from '../../content/enemies.js';
import { onHit, setState, SPAWN, emit } from './brain.js';
import { updateFoeFx } from './attacks.js';
import stalker from './stalker.js';
import knight from './knight.js';
import caster from './caster.js';
import beast from './beast.js';
import brute from './brute.js';
import thrower from './thrower.js';
import echo from './echo.js';
import unspooler from './unspooler.js';

export { KINDS, ATTACKS };
export const AI = { stalker, knight, caster, beast, brute, thrower, echo, unspooler };

const hitHook = (G, e, hit) => onHit(G, e, hit);

export function spawn(G, kind, x, y, opts = {}) {
  const def = KINDS[kind];
  if (!def) { console.warn('[loomwake] unknown foe kind', kind); return null; }
  const region = opts.region || (G.chamber && G.chamber.region) || def.regions[0] || 'glasswood';
  const sc = REGION_SCALE[region] || REGION_SCALE.glasswood;
  const elite = !!opts.elite;
  const R = G.rng.ai;
  const hpMul = (opts.scale ?? sc.hp) * (elite ? ELITE.hp : 1);
  const hp = Math.round(def.hp * hpMul);
  const armor = Math.round(elite ? def.armor * ELITE.armorMul + ELITE.armorAdd : def.armor) * (opts.scale ?? sc.hp);
  const delay = Math.max(0, opts.delay || 0);
  const e = {
    id: G.nextId++, kind, team: 'foe', def, ai: def.ai, art: def.art, region,
    x, y, z: 0, vx: 0, vy: 0, kx: 0, ky: 0, r: def.r * (elite ? 1.08 : 1), mass: def.mass * (elite ? 1.3 : 1),
    hp, maxHp: hp, armor: Math.round(armor), maxArmor: Math.round(armor),
    speed: def.speed * sc.speed * (elite ? ELITE.speed : 1),
    dmg: Math.round(def.dmg * sc.dmg * (elite ? ELITE.dmg : 1)),
    facing: opts.facing ?? (G.hero ? Math.atan2(G.hero.y - y, G.hero.x - x) : Math.PI / 2),
    state: delay > 0 ? 'pending' : 'spawn', st: 0, stDur: delay > 0 ? delay : SPAWN,
    flash: 0, stun: 0, inv: SPAWN + delay + 0.05, vuln: 0, status: {}, elite, dead: false,
    spawning: true, untargetable: true, hidden: delay > 0,
    attacking: false, hasToken: false, atk: null, A: null, chain: 0, chainIdx: 0, mem: {},
    cd: 1, flank: R() < 0.5 ? -1 : 1, seed: Math.floor(R() * 1e9),
    height: def.height * (elite ? 1.08 : 1), float: def.float || 0,
    points: def.points * (elite ? ELITE.points : 1),
    summoned: !!opts.summoned, owner: opts.owner ?? null, noReward: !!opts.noReward,
    tgs: [], anim: {}, light: null,
  };
  e.onHit = hitHook;
  G.foes.push(e);
  const M = AI[def.ai];
  if (M && M.init) M.init(G, e);
  if (delay <= 0) {
    // the vortex telegraph so a spawn never lands a hit unannounced
    const t = { kind: 'circle', x, y, r: e.r * 2.2, t: SPAWN, max: SPAWN, color: '#8a6cff', owner: e.id, spawn: true };
    G.telegraphs.push(t); e.tgs.push(t);
    emit(G, 'foeRise', { e });
  }
  emit(G, 'spawn', { e });
  return e;
}

export function updateFoes(G, dt) {
  const L = G.foes;
  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    if (e.boss || e.gone || !e.def) continue;
    const M = AI[e.ai];
    if (M) M.update(G, e, dt);
  }
  updateFoeFx(G, dt);
}

export function aliveFoes(G, owner) {
  return G.foes.filter((e) => !e.dead && !e.boss && !e.gone && (owner == null || e.owner === owner));
}

// ---------------- waves ----------------
// Kinds that make good packs per region, from early to late in the region.
// Each template is a list of kinds; the builder cycles through it while the
// budget lasts, so the first kind is the backbone of the wave.
export const WAVE_MIX = {
  glasswood: [
    { kinds: ['hollow', 'hollow', 'thornling'], from: 0 },
    { kinds: ['hollow', 'needlecaster', 'hollow'], from: 1 },
    { kinds: ['thornling', 'hollow', 'threadKnight'], from: 2 },
    { kinds: ['hollow', 'glassKnight', 'needlecaster', 'thornling'], from: 3 },
    { kinds: ['glassKnight', 'needlecaster', 'hollow', 'hollow'], from: 5 },
  ],
  choir: [
    { kinds: ['hollow', 'chorister', 'hollow'], from: 0 },
    { kinds: ['snarl', 'hollow', 'chorister'], from: 1 },
    { kinds: ['lanternWarden', 'hollow', 'chorister'], from: 2 },
    { kinds: ['snarl', 'snarl', 'needlecaster', 'threadKnight'], from: 3 },
    { kinds: ['lanternWarden', 'chorister', 'snarl', 'hollow'], from: 5 },
  ],
  forge: [
    { kinds: ['forgeThrall', 'hollow', 'hollow'], from: 0 },
    { kinds: ['snarl', 'forgeThrall', 'hollow'], from: 1 },
    { kinds: ['threadKnight', 'forgeThrall', 'needlecaster'], from: 2 },
    { kinds: ['forgeThrall', 'snarl', 'threadKnight', 'hollow'], from: 3 },
    { kinds: ['bellowsBrute', 'forgeThrall', 'snarl'], from: 5 },
  ],
  unwoven: [
    { kinds: ['echo', 'hollow', 'hollow'], from: 0 },
    { kinds: ['unspooler', 'hollow', 'snarl'], from: 1 },
    { kinds: ['echo', 'unspooler', 'needlecaster'], from: 2 },
    { kinds: ['threadKnight', 'echo', 'snarl', 'unspooler'], from: 3 },
    { kinds: ['echo', 'echo', 'unspooler', 'threadKnight'], from: 5 },
  ],
};

// Points for one wave. depth = chamber index in the region (0..11), wave = 0..2.
export function waveBudget(region, depth = 0, wave = 0, kind = 'combat') {
  const ri = Math.max(0, REGIONS.indexOf(region));
  // balance 2026-10-25: a new region eases in (its first chambers sit closer to the last region's end)
  // and every wave carries a little more than before, for 25-40 s fights
  let b = (4 + ri * Math.min(2.2, 1.3 + depth * 0.1) + depth * 0.75 + wave * 1.6) * 1.12;
  if (kind === 'elite') b *= 1.25;
  return Math.min(b, 24);
}

// Build one wave's roster. rng: G.rng.run (layout stream). Returns [{ kind, elite }].
export function buildWave(rng, o = {}) {
  const region = o.region || 'glasswood', depth = o.depth || 0, wave = o.wave || 0;
  let budget = o.budget ?? waveBudget(region, depth, wave, o.kind);
  const max = o.max ?? 14;
  const mixes = (WAVE_MIX[region] || WAVE_MIX.glasswood).filter((m) => m.from <= depth);
  const mix = rng.weighted(mixes, (m) => 1 + m.from * 0.6);
  const ok = (k) => KINDS[k] && (KINDS[k].minDepth ?? 0) <= depth + (wave >= 2 ? 1 : 0);
  const out = [];
  // elites: chamber kind 'elite' gets one (two deep in the region); wave 3 of
  // ordinary chambers sometimes brings one after the first chambers.
  let elites = o.elites ?? (o.kind === 'elite' ? (depth >= 7 ? 2 : 1) : (wave >= 2 && depth >= 3 && rng.chance(0.3) ? 1 : 0));
  // elite-tier brutes as the wave-3 elite
  if (wave >= 2 && elites > 0 && depth >= 4) {
    const brutes = Object.keys(KINDS).filter((k) => KINDS[k].tier === 'elite' && KINDS[k].regions.includes(region) && ok(k));
    if (brutes.length && rng.chance(0.55)) { const k = rng.pick(brutes); out.push({ kind: k, elite: false }); budget -= KINDS[k].points; elites--; }
  }
  let i = 0, guard = 0;
  while (budget > 0.6 && out.length < max && guard++ < 60) {
    let k = mix.kinds[i++ % mix.kinds.length];
    if (!ok(k)) k = mix.kinds.find(ok) || 'hollow';
    const elite = elites > 0 && KINDS[k].tier !== 'fodder' && KINDS[k].tier !== 'elite';
    const cost = KINDS[k].points * (elite ? ELITE.points : 1);
    if (cost > budget + 0.8) { if (KINDS[k].tier === 'fodder') break; continue; }
    out.push({ kind: k, elite });
    if (elite) elites--;
    budget -= cost;
  }
  if (!out.length) out.push({ kind: 'hollow', elite: false });
  return out;
}
