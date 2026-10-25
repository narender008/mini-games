// World: collision against the chamber (walkable polygon + round obstacles),
// entity integration with knockback and wall slams, hazards, and the master
// gameplay tick.
//
// Exports:
//   setSystems({ updateFoes, updateBosses })   main.js plugs in sim/enemies/index.js and sim/bosses/index.js
//   stepWorld(G, dt) -> bool             one gameplay tick (false while in hit-stop). Order:
//                                        hero -> generic foe timers -> updateFoes -> updateBosses -> integrate/collide ->
//                                        separation -> projectiles -> telegraphs -> zones -> hazards -> boon tick -> cleanup
//   insideChamber(ch, x, y, margin = 0) -> bool
//   nearestWall(ch, x, y) -> { x, y, d, nx, ny }   closest boundary point, inward normal
//   resolveWalls(ch, e, r) -> { nx, ny } | null     pushes e inside the shape and out of obstacles
//   reflectOffWalls(ch, p)               mirrors p.vx/p.vy off the nearest wall (bouncing projectiles)
//   moveEntity(G, e, dt)                 integrates e.vx/vy + knock e.kx/ky, collides, wall slam
//   clampToChamber(ch, x, y, margin) -> {x, y}      nearest point at least `margin` inside
//   nearestFoe(G, x, y, maxD = 1e9, filter?) -> foe | null
//   testChamber(seed) -> chamber        the motion-test Glasswood island arena (fallback / ?play without run.js)
//   spawnDummy(G, x, y, opts) -> foe    placeholder Hollow used only when sim/enemies/index.js is missing
//
// Bus events emitted here: slam {e, x, y}, fall {who, x, y}, hazard {kind, x, y}
import { clamp, pointInPoly, TAU } from '../core/math.js';
import { rng } from '../core/rng.js';
import { makeEntity } from '../state.js';
import { updateHero, tickHeroBuffers } from './hero.js';
import {
  HOOKS, tickStatuses, damageFoe, hurtHero, killFoe, updateProjectiles, updateTelegraphs, updateZones,
  telegraph, takeToken, freeToken, targetable, emitShake, addHitstop,
} from './combat.js';

const SYS = { updateFoes: null, updateBosses: null };
export function setSystems(s) { Object.assign(SYS, s); }

// ---------------------------------------------------------------- geometry
const cache = new WeakMap();
function geo(ch) {
  let g = cache.get(ch);
  if (g && g.shape === ch.shape) return g;
  const S = ch.shape || [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of S) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  g = { shape: ch.shape, box: [x0, y0, x1, y1] };
  cache.set(ch, g);
  return g;
}

export function nearestWall(ch, x, y) {
  const S = ch.shape;
  let best = { x, y, d: 1e9, nx: 0, ny: 0 };
  for (let i = 0, j = S.length - 1; i < S.length; j = i++) {
    const ax = S[j][0], ay = S[j][1], bx = S[i][0], by = S[i][1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
    const px = ax + dx * t, py = ay + dy * t, d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { x: px, y: py, d, nx: 0, ny: 0 };
  }
  const inside = pointInPoly(x, y, S);
  if (best.d > 1e-6) { const k = (inside ? 1 : -1) / best.d; best.nx = (x - best.x) * k; best.ny = (y - best.y) * k; }
  best.inside = inside;
  return best;
}

export function insideChamber(ch, x, y, margin = 0) {
  if (!ch || !ch.shape || ch.shape.length < 3) return true;
  const b = geo(ch).box;
  if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  if (!pointInPoly(x, y, ch.shape)) return false;
  return margin <= 0 || nearestWall(ch, x, y).d >= margin;
}

export function clampToChamber(ch, x, y, margin = 30) {
  if (!ch || !ch.shape) return { x, y };
  for (let k = 0; k < 3; k++) {
    const w = nearestWall(ch, x, y);
    if (w.inside && w.d >= margin) break;
    x = w.x + w.nx * margin; y = w.y + w.ny * margin;
  }
  return { x, y };
}

export function resolveWalls(ch, e, r = e.r) {
  if (!ch) return null;
  let hit = null;
  if (ch.shape && ch.shape.length >= 3) {
    for (let k = 0; k < 2; k++) {
      const w = nearestWall(ch, e.x, e.y);
      if (w.inside && w.d >= r) break;
      e.x = w.x + w.nx * r; e.y = w.y + w.ny * r; hit = { nx: w.nx, ny: w.ny };
    }
  }
  if (ch.obstacles) for (const o of ch.obstacles) {
    const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy), m = r + o.r;
    if (d < m) {
      const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : 1;
      e.x = o.x + nx * m; e.y = o.y + ny * m; hit = { nx, ny, obstacle: o };
    }
  }
  return hit;
}

export function reflectOffWalls(ch, p) {
  const w = nearestWall(ch, p.x, p.y);
  const dot = p.vx * w.nx + p.vy * w.ny;
  if (dot < 0) { p.vx -= 2 * dot * w.nx; p.vy -= 2 * dot * w.ny; }
  p.x = w.x + w.nx * 2; p.y = w.y + w.ny * 2;
}

// ---------------------------------------------------------------- integration
export function moveEntity(G, e, dt) {
  const c = G.cfg;
  let vx = e.vx, vy = e.vy;
  if (e !== G.hero) {
    if (e.stun > 0 || e.status.bound) { vx = 0; vy = 0; e.vx *= 0.8; e.vy *= 0.8; }
    const sl = e.status.slow;
    if (sl) { const k = 1 - clamp(sl.power, 0, 0.9); vx *= k; vy *= k; }
  }
  const kmag = Math.hypot(e.kx, e.ky);
  e.x += (vx + e.kx) * dt; e.y += (vy + e.ky) * dt;
  const f = Math.exp(-c.knock.decay * dt);
  e.kx *= f; e.ky *= f;
  if (kmag < 2) { e.kx = 0; e.ky = 0; }
  if (e.knockT > 0) e.knockT -= dt;
  if (e.flying && e.noClip) return null;
  const hit = resolveWalls(G.chamber, e, e.r);
  if (hit) {
    // cancel the velocity component into the wall
    const kd = e.kx * hit.nx + e.ky * hit.ny;
    if (kd < 0) {
      if (e.team === 'foe' && !e.dead && e.knockT > 0 && -kd > c.knock.slamSpeed && G.chamber.edge === 'void' && !hit.obstacle && !e.boss && !e.flying && !(e.armor > 0)) {
        // knocked off the island into the void
        e.knockT = 0; e.fell = true;
        G.bus.emit('fall', { who: e.kind, e, x: e.x, y: e.y, edge: true });
        killFoe(G, e, { kind: 'fall' });
        return hit;
      }
      if (e.team === 'foe' && !e.dead && e.knockT > 0 && -kd > c.knock.slamSpeed) {
        e.knockT = 0;
        G.bus.emit('slam', { e, x: e.x - hit.nx * e.r, y: e.y - hit.ny * e.r, obstacle: !!hit.obstacle });
        damageFoe(G, e, c.knock.slamDmg * (G.hero?.stats?.slamMult ?? 1), { kind: 'slam', kb: 0, hitstop: c.knock.slamHitstop, shake: 0.2 });
      }
      e.kx -= kd * hit.nx * 1.3; e.ky -= kd * hit.ny * 1.3;
    }
  }
  return hit;
}

function separate(G) {
  const F = G.foes, h = G.hero, s = G.cfg.separation;
  for (let i = 0; i < F.length; i++) {
    const a = F[i];
    if (a.dead || a.noCollide) continue;
    for (let j = i + 1; j < F.length; j++) {
      const b = F[j];
      if (b.dead || b.noCollide || a.flying !== b.flying) continue;
      const dx = b.x - a.x, dy = b.y - a.y, m = a.r + b.r;
      if (Math.abs(dx) > m || Math.abs(dy) > m) continue;
      const d = Math.hypot(dx, dy);
      if (d >= m) continue;
      const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0, o = (m - d) * s.foe;
      const ma = a.mass || 1, mb = b.mass || 1, ta = mb / (ma + mb);
      a.x -= nx * o * ta; a.y -= ny * o * ta; b.x += nx * o * (1 - ta); b.y += ny * o * (1 - ta);
    }
    if (h && !h.dead && !h.dashing && !a.spawning && !a.flying) {
      const dx = a.x - h.x, dy = a.y - h.y, m = a.r + h.r * 0.8, d = Math.hypot(dx, dy);
      if (d < m) {
        const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0, o = (m - d) * s.hero;
        const ma = a.mass || 1, ta = ma / (ma + 1);
        h.x -= nx * o * ta; h.y -= ny * o * ta; a.x += nx * o * (1 - ta); a.y += ny * o * (1 - ta);
      }
    }
  }
}

// ---------------------------------------------------------------- hazards
function hazards(G, dt) {
  const ch = G.chamber, h = G.hero, c = G.cfg.hazards;
  if (!ch || !ch.hazards || !ch.hazards.length) { if (h) { h.safe.x = h.x; h.safe.y = h.y; } return; }
  let heroSafe = true;
  for (const z of ch.hazards) {
    z._cd = Math.max(0, (z._cd || 0) - dt);
    const inHero = h && !h.dead && Math.hypot(h.x - z.x, h.y - z.y) < z.r - 4;
    if (inHero) heroSafe = false;
    if (z.type === 'pit' || z.type === 'void') {
      if (inHero && !h.dashing && Math.hypot(h.x - z.x, h.y - z.y) < z.r - h.r * 0.5) {
        G.bus.emit('fall', { who: 'hero', x: h.x, y: h.y });
        h.x = h.safe.x; h.y = h.safe.y; h.vx = h.vy = h.kx = h.ky = 0;
        hurtHero(G, c.fallDmg, { x: h.x, y: h.y, kind: 'fall', kb: 0, ignoreInv: true });
        h.inv = Math.max(h.inv, 0.8);
      }
      for (const e of G.foes) if (!e.dead && !e.flying && !e.boss && Math.hypot(e.x - z.x, e.y - z.y) < z.r - e.r * 0.5) {
        G.bus.emit('fall', { who: e.kind, e, x: e.x, y: e.y }); killFoe(G, e, { kind: 'fall' }); e.fell = true;
      }
      continue;
    }
    let active = true;
    if (z.type === 'spikes') {
      const ph = ((G.t + (z.phase ?? (z.x * 0.0031 + z.y * 0.0017))) % c.spikeCycle + c.spikeCycle) % c.spikeCycle;
      active = ph < c.spikeUp;
      z.up = active; z.warn = !active && ph > c.spikeCycle - 0.5;
    }
    if (!active) continue;
    const dmg = z.dmg ?? (z.type === 'spikes' ? c.spikeDmg : z.type === 'molten' ? c.moltenDmg : c.thornDmg);
    if (inHero && z._cd <= 0) {
      if (hurtHero(G, dmg, { x: z.x, y: z.y, kind: 'hazard', element: z.type, kb: z.type === 'molten' ? 80 : 260 }) > 0) { z._cd = 0.5; G.bus.emit('hazard', { kind: z.type, x: h.x, y: h.y }); }
    }
    for (const e of G.foes) {
      if (e.dead || e.flying || !targetable(e)) continue;
      if (Math.hypot(e.x - z.x, e.y - z.y) > z.r) continue;
      e._hz = (e._hz || 0) - dt;
      if (e._hz > 0) continue;
      e._hz = 0.5;
      const bonus = e.knockT > 0 ? 2 : 1;
      damageFoe(G, e, dmg * bonus, { kind: 'thorns', element: z.type, noHooks: true });
    }
  }
  if (h && heroSafe && !h.dashing) { h.safe.x = h.x; h.safe.y = h.y; }
}

// ---------------------------------------------------------------- the tick
export function stepWorld(G, dt) {
  if (G.hitstop > 0) { G.hitstop = Math.max(0, G.hitstop - dt); tickHeroBuffers(G, dt); return false; }
  updateHero(G, dt);
  for (const e of G.foes) {
    e.st += dt;
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
    if (e.stun > 0) e.stun = Math.max(0, e.stun - dt);
    if (e.inv > 0) e.inv = Math.max(0, e.inv - dt);
    if (e.vuln > 0) e.vuln = Math.max(0, e.vuln - dt);
    tickStatuses(G, e, dt);
    if (e.dead) { e.deadT = (e.deadT || 0) + dt; if (e.deadT > 3) e.gone = true; }
  }
  if (SYS.updateFoes) SYS.updateFoes(G, dt);
  for (const e of G.foes) if (e.fallback) dummyAI(G, e, dt);
  if (SYS.updateBosses) SYS.updateBosses(G, dt);
  for (const e of G.foes) if (!e.gone) moveEntity(G, e, dt);
  separate(G);
  updateProjectiles(G, dt);
  updateTelegraphs(G, dt);
  updateZones(G, dt);
  hazards(G, dt);
  if (HOOKS.tick) HOOKS.tick(G, dt);
  const F = G.foes;
  for (let i = F.length - 1; i >= 0; i--) if (F[i].gone) { if (F[i] === G.boss) G.boss = null; F.splice(i, 1); }
  return true;
}

export function nearestFoe(G, x, y, maxD = 1e9, filter) {
  let best = null, bd = maxD;
  for (const e of G.foes) {
    if (!targetable(e) || (filter && !filter(e))) continue;
    const d = Math.hypot(e.x - x, e.y - y) - e.r;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ---------------------------------------------------------------- test arena
const ROOM = { rx: 1060, ry: 660 };
const shapeAt = (a) => 1 + 0.06 * Math.sin(3 * a + 1.3) + 0.04 * Math.sin(5 * a + 0.4) + 0.025 * Math.sin(9 * a);
export function testChamber(seed = 5) {
  const shape = [];
  for (let i = 0; i < 96; i++) { const a = (i / 96) * TAU, s = shapeAt(a) * 0.95; shape.push([Math.round(Math.cos(a) * ROOM.rx * s), Math.round(Math.sin(a) * ROOM.ry * s)]); }
  const r = rng(seed);
  const props = [];
  for (let i = 0; i < 11; i++) { const a = (i / 11) * TAU + r.range(-0.1, 0.1); if (Math.sin(a) < 0.15) { const s = shapeAt(a); props.push({ type: 'tree', x: Math.cos(a) * ROOM.rx * s, y: Math.sin(a) * ROOM.ry * s, s: r.range(0.8, 1.1), seed: Math.floor(r() * 1e6) }); } }
  for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU + r.range(-0.1, 0.1), s = shapeAt(a) * 0.99, front = Math.sin(a) > 0.3; props.push({ type: 'crystal', x: Math.cos(a) * ROOM.rx * s, y: Math.sin(a) * ROOM.ry * s, s: front ? r.range(0.45, 0.65) : r.range(0.8, 1.3), seed: Math.floor(r() * 1e6) }); }
  const obstacles = [[-520, -170, 1.0], [560, 210, 0.9], [-260, 330, 0.7], [380, -300, 0.8]].map(([x, y, s]) => ({ type: 'crystal', x, y, r: Math.round(40 * s), s, seed: x * 7 + y }));
  for (const [x, y] of [[-760, 300], [760, -280], [0, -560]]) obstacles.push({ type: 'lantern', x, y, r: 14 });
  return {
    id: 'test-arena', region: 'glasswood', template: 'motion-test', kind: 'combat', seed,
    shape, obstacles, hazards: [], props, features: [], edge: 'void',
    entry: { x: 0, y: 120 }, doors: [], waves: [], spawnPoints: [],
    lights: [{ x: -760, y: 204, r: 240, color: '#8ff3ff', i: 0.75 }, { x: 760, y: -376, r: 240, color: '#d2a6ff', i: 0.75 }, { x: 0, y: -656, r: 240, color: '#ffd27a', i: 0.75 }, { x: 0, y: 0, r: 260, color: '#ffd27a', i: 0.35 }],
    ambient: 'glasswood',
  };
}

// A hooded Hollow stand-in so the engine is playable before the enemies helper lands.
export function spawnDummy(G, x, y, opts = {}) {
  const e = makeEntity(G, { kind: 'hollow', art: 'hollow', ai: 'dummy', fallback: true, x, y, r: 22, hp: 45, mass: 1, speed: 150, dmg: 10,
    state: 'spawn', spawning: true, inv: 0.6, elite: !!opts.elite, cd: 1 + G.rng.ai() * 1.4, ...opts });
  if (e.elite) { e.hp = e.maxHp = 90; e.armor = e.maxArmor = 40; e.r = 26; }
  G.foes.push(e);
  G.bus.emit('spawn', { e });
  return e;
}

function dummyAI(G, e, dt) {
  const h = G.hero;
  if (e.dead) { if (e.deadT > 1.1) e.gone = true; e.vx *= 0.9; e.vy *= 0.9; return; }
  if (e.state === 'spawn') { e.vx = e.vy = 0; if (e.st > 0.6) { e.spawning = false; e.state = 'idle'; e.st = 0; } return; }
  if (!h || h.dead) { e.vx = e.vy = 0; return; }
  const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy) || 1;
  e.attacking = e.state === 'windup' || e.state === 'lunge';
  if (e.stun > 0) {
    if (e.state !== 'stagger') { if (e.tg) e.tg.done = true; e.tg = null; freeToken(G, e); e.state = 'stagger'; e.st = 0; }
    return;
  }
  if (e.state === 'stagger') { e.state = 'idle'; e.st = 0; e.cd = 0.4 + G.rng.ai() * 0.6; }
  if (e.state === 'idle' || e.state === 'chase') {
    e.state = 'chase';
    e.facing = Math.atan2(dy, dx);
    const want = d > 70 ? 1 : 0;
    e.vx = (dx / d) * e.speed * want; e.vy = (dy / d) * e.speed * want;
    e.cd -= dt;
    if (d < 170 && e.cd <= 0 && takeToken(G, e)) {
      e.state = 'windup'; e.st = 0; e.lunge = { x: dx / d, y: dy / d };
      e.tg = telegraph(G, { kind: 'cone', x: e.x, y: e.y, r: 130, angle: e.facing, arc: 0.7, t: 0.45, owner: e.id, follow: true });
    }
  } else if (e.state === 'windup') {
    e.vx = e.vy = 0;
    if (e.st < 0.3) { e.facing = Math.atan2(dy, dx); e.lunge = { x: Math.cos(e.facing), y: Math.sin(e.facing) }; if (e.tg) e.tg.angle = e.facing; }
    if (e.st >= 0.45) { e.state = 'lunge'; e.st = 0; e.hitDone = false; }
  } else if (e.state === 'lunge') {
    e.vx = e.lunge.x * 620; e.vy = e.lunge.y * 620;
    if (!e.hitDone && e.st > 0.05) {
      const ax = e.x + e.lunge.x * 40, ay = e.y + e.lunge.y * 40;
      if (Math.hypot(h.x - ax, h.y - ay) < h.r + 46) { e.hitDone = true; hurtHero(G, e.dmg, { src: e, kind: 'slash' }); }
    }
    if (e.st > 0.2) { e.state = 'recover'; e.st = 0; freeToken(G, e); e.tg = null; }
  } else if (e.state === 'recover') {
    e.vx *= 0.85; e.vy *= 0.85;
    if (e.st > 0.55) { e.state = 'chase'; e.st = 0; e.cd = 0.6 + G.rng.ai() * 1.2; }
  }
}
export { addHitstop, emitShake };
