// Ace Pilot game rules: a vertical shoot-'em-up for 12+, pure JavaScript.
// No three.js, no DOM, no Math.random (a seeded stream on S.rng), so it runs
// the same in the browser and in Node (test/sim/). The view, UI and
// controller only read S and drain S.events.
//
// API
//   createAce({ seed, sector, field: { halfW, halfH }, wave, upgrades, god, boss })
//       wave > S.waves (or boss: true) starts straight at the boss
//   stepAce(S, input, dt)   advances in fixed 1/120 s substeps
//   setField(S, field)      on resize; world units, origin at centre, y up
//   chooseUpgrade(S, id), reroll(S)
//   autopilot(S) -> input, autopilotPick(S) -> upgrade id (may reroll)
//   SECTORS, ENEMIES, UPGRADES, BOSSES (data.js), WAVES (waves.js)
//
// input  { x, y }    target point in world units (or null), the ship flies to it
//        { dx, dy }  keyboard axis -1..1, overrides the target
//        fire        held; emp: true on the frame pressed (edge)
//        slow        half speed; dash: edge, needs the Afterburner upgrade
//
// State (S) read by the view/UI
//   phase   'intro' | 'wave' | 'upgrade' | 'boss' | 'cleared' | 'dead'
//           intro (2.4 s) -> wave 1 -> clear -> upgrade pick (waves 1-7) ->
//           next wave ... wave 8 -> boss -> cleared; hull 0 at any time -> dead.
//           The sim is frozen while phase is 'upgrade'.
//   time, sector, wave (1..8), waves (8), field, def (SECTORS entry)
//   player  { x, y, vx, vy, r, hull, hullMax, shield (0..1), shields, invuln,
//             emp, drones [{x, y}], firing, dead, dash, dashCd }
//   enemies [{ id, type, x, y, vx, vy, angle, hp, maxHp, r, t, hitT, shield
//             {angle, arc (full width, rad), hp, maxHp} | null, tele {x0, y0,
//             x1, y1, k} | null, armed (mines), state ('in'|'tele'|'dive' for
//             divers), leaving }]
//   bullets [{ id, x, y, vx, vy, r, kind 'orb'|'needle'|'ball'|'beam', color
//             'magenta'|'orange'|'red'|'cyan'|'green', t, grazed }] enemy fire;
//             beams also have x1, y1 and life (s); link: true marks the
//             Tempest Array's lightning links
//   shots   [{ id, x, y, vx, vy, kind 'cannon'|'pierce'|'missile'|'drone'|
//             'spread', dmg, t }] the player's
//   pickups [{ id, x, y, kind 'score'|'shield'|'emp'|'hull', t }]
//   boss    null | { type, name, x, y, hp, maxHp, phase, phases, t, scale,
//             state 'enter'|'fight'|'dying', entering, dying, enraged,
//             parts [{ id, kind, x, y, r, hp, maxHp, dead, open, vuln, phase,
//             hitT, tele, ang, drop (0..1, pylons/jaws), px, py (arm pivots)}] }
//   teles   [{ x0, y0, x1, y1, k (0..1), kind: 'beam', w }] every beam telegraph
//           (enemy and part .tele show only their latest one)
//   score, chain (1..16), chainT (0..1 left), rank 'S'|'A'|'B'|'C', par,
//   stats { kills, hits (hull), shieldHits, grazes, shots (= shotsFired), shotsHit, time,
//           noHitWaves, emps, bossTime }
//   upgrades { id: level }, offer [{ id, rarity, level, name }] | null, rerolls
//   result  null | { win, score, rank, time, sector, wave, ... } at the end
//
// Events (S.events; the consumer clears the array). All have type, x, y.
// ev.enemy names the enemy type ('boss' for boss fire) on enemyFire,
// telegraph, kill, hit and spawn.
//   fire (kind 'cannon'|'pierce'|'spread'|'missile'|'drone')
//   enemyFire (kind 'orb'|'needle'|'ball'|'beam'|'dive'|'launch'|'missile', n)
//   hit (target 'enemy'|'part'|'shield', blocked (bulwark shield or armour),
//        kind (shot kind), boss + part (part id) on boss hits)
//   kill (enemy, id, score, chain, big, how 'shot'|'emp'|'crash'|'fuse')
//   partDestroyed (id, kind, score)              playerHit (cause, hull)
//   shieldHit (cause)  shieldUp  shieldBreak (bulwark)  graze (score)
//   pickup (kind, score)  emp (cleared)  dash  upgrade (id, level)
//   waveStart (wave)  waveClear (wave, bonus, noHit)  bossStart (name, boss)
//   bossPhase (phase, cleared)  bossDead (bonus, name)  slam (id)
//   sectorClear (score, rank, bonus)  dead  spawn (enemy, id)
//   telegraph (kind 'beam'|'diver'|'mine'|'pylon'|'jaw', dur, x1?, y1?)
//
// Step order (each 1/120 s): chain decay -> player (move, shield, guns) ->
// EMP -> flow (intro / wave director / clear / boss) -> enemies (paths,
// behaviour, contact) -> emitters -> enemy bullets (move, beams, hits,
// grazes) -> player shots (homing, hits, shields, splash) -> pickups -> rank.
import { SECTORS, ENEMIES, UPGRADES, UPGRADE_BY_ID, BOSSES, RARITY } from './data.js';
import { makeRng, rnd, angDiff, segDist2, clamp } from './rng.js';
import { createPlayer, stepPlayer, hurtPlayer, syncDrones, nearestEnemy, stepPickups, zone, shieldMax, GRAZE_R } from './player.js';
import { stepEnemies, damageEnemy, killEnemy } from './enemies.js';
import { stepEmitters } from './patterns.js';
import { startWave, stepWave, WAVES } from './waves.js';
import { createBoss, stepBoss, damagePart, clearEnemyBullets } from './bosses.js';
import { stepChain, scoreGraze, rankFor, RANKS } from './score.js';

export { SECTORS, ENEMIES, UPGRADES, BOSSES, WAVES, RANKS };
export { autopilot, autopilotPick } from './autopilot.js';

export const DT = 1 / 120;
const WAVES_PER_SECTOR = 8;
const INTRO_TIME = 2.4;
const CLEAR_TIME = 1.5;
const BREAK_TIME = 1.0;
const BOSS_DEAD_TIME = 2.6;

export function createAce({ seed = 1, sector = 1, field = { halfW: 15.84, halfH: 9.9 }, wave = 1, upgrades = {}, god = false, boss = false } = {}) {
  sector = clamp(sector | 0 || 1, 1, SECTORS.length);
  const def = SECTORS[sector - 1];
  const S = {
    seed,
    rng: makeRng(seed * 2654435761 + sector * 97),
    phase: 'intro',
    time: 0,
    sector,
    def,
    diff: def.diff,
    par: def.par * parScale(field),
    bossHp: def.diff.boss || 1,
    wave: clamp(wave | 0 || 1, 1, WAVES_PER_SECTOR + 1),
    waves: WAVES_PER_SECTOR,
    field: { halfW: field.halfW, halfH: field.halfH },
    player: null,
    enemies: [],
    bullets: [],
    shots: [],
    pickups: [],
    emitters: [],
    teles: [], // every live beam telegraph { x0, y0, x1, y1, k, kind, w }
    boss: null,
    score: 0,
    chain: 1,
    chainP: 0,
    chainT: 0,
    chainFall: 0,
    rank: 'C',
    stats: { kills: 0, hits: 0, shieldHits: 0, grazes: 0, shots: 0, shotsFired: 0, shotsHit: 0, time: 0, noHitWaves: 0, emps: 0, bossTime: 0 },
    upgrades: {},
    offer: null,
    rerolls: 1,
    events: [],
    result: null,
    god,
    flow: { k: 'intro', t: 0 },
    waveT: 0,
    queue: [],
    qi: 0,
    waveHit: false,
    vacuum: false,
    lastEmp: -99,
    nextId: 1,
    src: undefined, // enemy type whose fire is being spawned (for event.enemy)
    acc: 0,
  };
  if (boss) S.wave = WAVES_PER_SECTOR + 1;
  S.player = createPlayer(S);
  for (const [id, lv] of Object.entries(upgrades || {})) for (let i = 0; i < lv; i++) applyUpgrade(S, id);
  return S;
}

// wide fields spread enemies out, so the same play scores less
export function parScale(field) {
  return clamp(1.25 - field.halfW * 0.035, 0.68, 1.05);
}

export function setField(S, field) {
  S.field.halfW = field.halfW;
  S.field.halfH = field.halfH;
  S.par = S.def.par * parScale(field);
  const P = S.player;
  const Z = zone(S);
  P.x = clamp(P.x, Z.x0, Z.x1);
  P.y = clamp(P.y, Z.y0, Z.y1);
  if (S.boss) S.boss.scale = clamp(field.halfW / 11, 0.6, 1);
}

export function stepAce(S, input, dt) {
  S.acc += Math.min(dt, 0.25);
  let emp = !!(input && input.emp);
  let dash = !!(input && input.dash);
  while (S.acc >= DT - 1e-9) {
    S.acc -= DT;
    step(S, input, DT, emp, dash);
    emp = dash = false;
  }
}

// ------------------------------------------------------------ one tick

const IN = { x: null, y: null, dx: 0, dy: 0, fire: false, slow: false, dash: false };

function step(S, input, dt, emp, dash) {
  if (S.phase === 'upgrade') return;
  S.time += dt;
  const playing = S.phase === 'wave' || S.phase === 'boss' || S.phase === 'intro';
  if (playing) S.stats.time += dt;
  stepChain(S, dt);
  if (input) {
    IN.x = input.x;
    IN.y = input.y;
    IN.dx = input.dx || 0;
    IN.dy = input.dy || 0;
    IN.fire = !!input.fire;
    IN.slow = !!input.slow;
  } else {
    IN.x = IN.y = null;
    IN.dx = IN.dy = 0;
    IN.fire = IN.slow = false;
  }
  IN.dash = dash;
  stepPlayer(S, IN, dt);
  if (emp && (S.phase === 'wave' || S.phase === 'boss')) useEmp(S);
  stepFlow(S, dt);
  stepEnemies(S, dt);
  stepEmitters(S, dt);
  stepBullets(S, dt);
  stepShots(S, dt);
  stepPickups(S, dt);
  updateRank(S);
}

function stepFlow(S, dt) {
  const F = S.flow;
  F.t += dt;
  switch (F.k) {
    case 'intro':
      if (F.t >= INTRO_TIME) {
        if (S.wave > S.waves) startBoss(S);
        else {
          S.phase = 'wave';
          go(S, 'wave');
          startWave(S, S.wave);
        }
      }
      break;
    case 'wave':
      if (stepWave(S, dt)) waveClear(S);
      break;
    case 'clear':
      if (F.t >= CLEAR_TIME) {
        S.vacuum = false;
        if (S.wave < S.waves) {
          S.offer = makeOffer(S);
          S.phase = 'upgrade';
          go(S, 'pick');
        } else startBoss(S);
      }
      break;
    case 'break':
      if (F.t >= BREAK_TIME) {
        go(S, 'wave');
        startWave(S, S.wave + 1);
      }
      break;
    case 'boss':
      stepBoss(S, dt);
      if (S.boss.dying) go(S, 'bossDead');
      break;
    case 'bossDead':
      stepBoss(S, dt);
      if (F.t >= BOSS_DEAD_TIME && S.phase === 'boss') sectorClear(S);
      break;
    default:
      if (S.boss) stepBoss(S, dt);
  }
}

function go(S, k) {
  S.flow.k = k;
  S.flow.t = 0;
}

function waveClear(S) {
  const noHit = !S.waveHit;
  const bonus = 1000 * S.wave + (noHit ? 2500 : 0);
  if (noHit) S.stats.noHitWaves++;
  S.score += bonus;
  S.vacuum = true;
  clearEnemyBullets(S);
  S.emitters.length = 0;
  S.events.push({ type: 'waveClear', x: 0, y: 0, wave: S.wave, bonus, noHit });
  go(S, 'clear');
}

function startBoss(S) {
  S.wave = S.waves;
  S.boss = createBoss(S);
  S.phase = 'boss';
  S.waveHit = false;
  go(S, 'boss');
  S.events.push({ type: 'bossStart', x: 0, y: S.boss.y, name: S.boss.name, boss: S.boss.type });
}

function sectorClear(S) {
  const P = S.player;
  const bonus = 4000 * P.hull + (S.waveHit ? 0 : 5000);
  S.score += bonus;
  S.phase = 'cleared';
  go(S, 'done');
  S.rank = rankFor(S.score, S.par, S.stats.hits);
  S.result = { win: true, score: S.score, rank: S.rank, time: S.stats.time, sector: S.sector, wave: S.wave, hull: P.hull, bonus, bossTime: S.stats.bossTime };
  S.events.push({ type: 'sectorClear', x: 0, y: 0, score: S.score, rank: S.rank, bonus });
}

function updateRank(S) {
  if (S.phase === 'cleared' || S.phase === 'dead') return;
  let prog;
  if (S.boss) prog = (S.waves + (S.boss.maxHp ? 1 - S.boss.hp / S.boss.maxHp : 0)) / (S.waves + 1);
  else prog = (S.wave - 1 + (S.flow.k === 'clear' || S.flow.k === 'pick' || S.flow.k === 'break' ? 1 : Math.min(0.9, S.waveT / 30))) / (S.waves + 1);
  S.rank = rankFor(S.score, S.par * Math.max(0.05, prog), S.stats.hits);
}

// ------------------------------------------------------------ EMP

function useEmp(S) {
  const P = S.player;
  if (P.dead || P.emp <= 0) return;
  P.emp--;
  S.stats.emps++;
  S.lastEmp = S.time;
  P.invuln = Math.max(P.invuln, 1.2);
  const n = clearEnemyBullets(S);
  S.score += n * 10;
  for (const e of S.emitters) e.done = true;
  for (const e of S.emitters) if (e.src) e.src.tele = null;
  S.emitters.length = 0;
  S.teles.length = 0;
  const lv = S.upgrades.emp || 0;
  const dmg = (20 + 8 * lv) * S.diff.hp;
  for (const e of S.enemies) {
    if (e.dead || e.gone) continue;
    e.tele = null;
    if (e.type === 'diver' && e.state === 'tele') e.state = 'in';
    if (e.type === 'mine') killEnemy(S, e, 'emp');
    else if ((e.hp -= dmg) <= 0) killEnemy(S, e, 'emp');
    else e.hitT = 0;
  }
  const B = S.boss;
  if (B && !B.entering && !B.dying) {
    for (const p of B.parts) {
      p.tele = null;
      if (!p.dead && p.vuln && p.maxHp > 0) damagePart(S, B, p, Math.min(p.maxHp * 0.07, 80) * (1 + 0.25 * lv));
    }
  }
  S.events.push({ type: 'emp', x: P.x, y: P.y, cleared: n });
}

// ------------------------------------------------------------ enemy fire

function stepBullets(S, dt) {
  const P = S.player;
  const f = S.field;
  const list = S.bullets;
  const live = !P.dead && S.phase !== 'cleared';
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    b.t += dt;
    let keep = true;
    if (b.kind === 'beam') {
      if (b.t >= b.life) keep = false;
      else if (live) {
        const d2 = segDist2(P.x, P.y, b.x, b.y, b.x1, b.y1);
        const rr = b.r + P.r;
        if (d2 < rr * rr) hurtPlayer(S, P.x, P.y, 'beam');
        else if (!b.grazed && P.invuln <= 0 && d2 < (rr + GRAZE_R * 0.6) ** 2) graze(S, b);
      }
    } else {
      if (b.home > 0) {
        b.home -= dt;
        const a = Math.atan2(b.vy, b.vx);
        const want = Math.atan2(P.y - b.y, P.x - b.x);
        const na = a + clamp(angDiff(a, want), -b.turn * dt, b.turn * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp;
      }
      if (b.acc) {
        const sp = Math.hypot(b.vx, b.vy);
        let ns = sp + b.acc * dt;
        if (b.max && ns > b.max * S.diff.speed) ns = b.max * S.diff.speed;
        if (sp > 0) {
          b.vx *= ns / sp;
          b.vy *= ns / sp;
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -f.halfH - 1.5 || b.y > f.halfH + 4 || b.x < -f.halfW - 1.5 || b.x > f.halfW + 1.5 || b.t > 25) keep = false;
      else if (live) {
        const dx = b.x - P.x;
        const dy = b.y - P.y;
        const d2 = dx * dx + dy * dy;
        const rr = b.r + P.r;
        if (d2 < rr * rr) {
          if (hurtPlayer(S, b.x, b.y, b.kind)) keep = false;
        } else if (!b.grazed && P.invuln <= 0 && d2 < (GRAZE_R + b.r * 0.5) ** 2) graze(S, b);
      }
    }
    if (keep) list[j++] = b;
    else b.removed = true;
  }
  list.length = j;
}

function graze(S, b) {
  b.grazed = true;
  S.stats.grazes++;
  scoreGraze(S);
  S.events.push({ type: 'graze', x: b.x, y: b.y, score: 50 });
}

// ------------------------------------------------------------ player shots

function stepShots(S, dt) {
  const f = S.field;
  const list = S.shots;
  const B = S.boss;
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    s.t += dt;
    if (s.kind === 'missile') steerMissile(S, s, dt);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    let keep = !(s.y > f.halfH + 1 || s.y < -f.halfH - 1 || s.x < -f.halfW - 2 || s.x > f.halfW + 2 || (s.kind === 'missile' && s.t > 3.2));
    if (keep) keep = !hitEnemies(S, s);
    if (keep && B && !B.dying) keep = !hitBoss(S, B, s);
    if (keep) list[j++] = s;
  }
  list.length = j;
}

function steerMissile(S, s, dt) {
  const t = s.target;
  if (!t || t.dead || t.gone || t.hp <= 0 || t.vuln === false) s.target = nearestEnemy(S, s.x, s.y, 1.6);
  const sp = Math.min(24, Math.hypot(s.vx, s.vy) + 30 * dt);
  let a = Math.atan2(s.vy, s.vx);
  if (s.target && s.t > 0.12) a += clamp(angDiff(a, Math.atan2(s.target.y - s.y, s.target.x - s.x)), -6 * dt, 6 * dt);
  else if (!s.target) a += clamp(angDiff(a, Math.PI / 2), -3 * dt, 3 * dt);
  s.vx = Math.cos(a) * sp;
  s.vy = Math.sin(a) * sp;
}

// returns true when the shot is used up
function hitEnemies(S, s) {
  const list = S.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || e.gone || e.hp <= 0 || e.id === s.hitId) continue;
    const dx = s.x - e.x;
    const dy = s.y - e.y;
    const d2 = dx * dx + dy * dy;
    const sh = e.shield;
    const outer = e.r + (sh ? 0.4 : 0) + s.r;
    if (d2 > outer * outer) continue;
    if (sh && s.kind !== 'missile' && s.kind !== 'pierce') {
      const a = Math.atan2(dy, dx);
      if (Math.abs(angDiff(sh.angle, a)) < sh.arc / 2) {
        sh.hp -= s.dmg;
        S.events.push({ type: 'hit', x: s.x, y: s.y, target: 'shield', blocked: true, kind: s.kind, id: e.id, enemy: e.type });
        if (sh.hp <= 0) {
          e.shield = null;
          S.events.push({ type: 'shieldBreak', x: e.x, y: e.y, id: e.id });
        }
        return true;
      }
    }
    const rr = e.r + s.r;
    if (d2 > rr * rr) continue;
    S.stats.shotsHit++;
    S.events.push({ type: 'hit', x: s.x, y: s.y, target: 'enemy', kind: s.kind, id: e.id, enemy: e.type });
    damageEnemy(S, e, s.dmg);
    if (s.kind === 'missile') splash(S, s, e);
    if (s.pierce > 0) {
      s.pierce--;
      s.hitId = e.id;
      continue;
    }
    return true;
  }
  return false;
}

function splash(S, s, skip) {
  for (const e of S.enemies) {
    if (e === skip || e.dead || e.gone) continue;
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    if (dx * dx + dy * dy < 2.6) damageEnemy(S, e, 2);
  }
}

function hitBoss(S, B, s) {
  for (const p of B.parts) {
    if (p.dead || !p.solid) continue;
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    const rr = p.r + s.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    const ok = damagePart(S, B, p, s.dmg);
    if (ok) S.stats.shotsHit++;
    S.events.push({ type: 'hit', x: s.x, y: s.y, target: 'part', blocked: !ok, kind: s.kind, id: p.id, boss: true, part: p.id, enemy: 'boss' });
    if (ok && s.pierce > 0 && s.hitId !== p.id) {
      s.pierce--;
      s.hitId = p.id;
      continue;
    }
    return true;
  }
  return false;
}

// ------------------------------------------------------------ upgrades

function level(S, id) {
  return S.upgrades[id] || 0;
}

function applyUpgrade(S, id) {
  const u = UPGRADE_BY_ID[id];
  if (!u) return false;
  const P = S.player;
  if (id === 'repair') {
    P.hull = Math.min(P.hullMax, P.hull + 1);
  } else {
    if (level(S, id) >= u.max) return false;
    S.upgrades[id] = level(S, id) + 1;
    if (id === 'emp') P.emp++;
    if (id === 'drones') syncDrones(S);
    if (id === 'capacitor' && P.shields < shieldMax(S) && P.shields === 0) P.charge = Math.max(P.charge, 0);
  }
  S.events.push({ type: 'upgrade', x: P.x, y: P.y, id, level: level(S, id) });
  return true;
}

export function upgradePool(S) {
  return UPGRADES.filter((u) => (u.max === 0 ? S.player.hull < S.player.hullMax : level(S, u.id) < u.max));
}

export function makeOffer(S, avoid = null) {
  let pool = upgradePool(S);
  if (avoid && pool.length - avoid.length >= 3) pool = pool.filter((u) => !avoid.includes(u.id));
  const out = [];
  while (out.length < 3 && pool.length) {
    let total = 0;
    for (const u of pool) total += RARITY[u.rarity];
    let r = rnd(S.rng) * total;
    let k = 0;
    for (; k < pool.length - 1; k++) {
      r -= RARITY[pool[k].rarity];
      if (r < 0) break;
    }
    const u = pool[k];
    pool = pool.filter((x) => x !== u);
    out.push({ id: u.id, rarity: u.rarity, level: u.max ? level(S, u.id) + 1 : 0, name: u.name });
  }
  return out;
}

export function chooseUpgrade(S, id) {
  if (S.phase !== 'upgrade' || !S.offer || !S.offer.some((o) => o.id === id)) return false;
  applyUpgrade(S, id);
  S.offer = null;
  if (S.flow.k === 'pick') {
    S.phase = 'wave';
    go(S, 'break');
  }
  return true;
}

export function reroll(S) {
  if (S.phase !== 'upgrade' || S.rerolls <= 0 || !S.offer) return false;
  S.rerolls--;
  S.offer = makeOffer(S, S.offer.map((o) => o.id));
  return true;
}
