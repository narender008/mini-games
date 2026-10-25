// Tidebreaker: pirate fleets. Plans each fleet fight from the stage and the
// difficulty (2 waves early, 3 later), sails the ships in from the right edge
// and captains them: hold a station in x 650..1220, keep spacing, shift and
// sometimes fall back, telegraph and fire with lead and some error so moving
// dodges. Kinds: sloop (fast, weaves, light guns), brig (broadsides), galleon
// (the crimson flagship: tanky, heavy volleys), fireship (charges you and
// explodes on contact; shoot it first), gunboat (keeps far right and lobs
// mortars at where you will be).
import { W, PLAYER_X } from './config.js';
import { clamp } from './util.js';
import { emit } from './events.js';
import { spawn } from './world/fx.js';
import { makeShip, KINDS } from './ships.js';
import { enemyFire, damage, applyBurn, flightTime } from './combat.js';

const COST = { sloop: 1, fireship: 1, brig: 2, gunboat: 2, galleon: 4 };
// stage from which a kind turns up, and how often
const POOL = [['sloop', 0, 3], ['brig', 0, 3], ['fireship', 1, 1.3], ['gunboat', 3, 1.5], ['galleon', 9, 0.5]];
const STATION = { sloop: [680, 1000], brig: [740, 1090], galleon: [860, 1080], gunboat: [1080, 1210], fireship: [650, 1200] };
const SPAWN_GAP = 1.3, MAX_ALIVE = 4;

// enemy gun damage: gentle at first, rising with the stage and G.diff
const dmgK = (G) => (0.5 + G.stage * 0.07) * Math.max(0.5, G.diff / (1 + G.stage * 0.16));
function gauss(r) { return (r() + r() + r() + r() - 2) * 1.73; }

function planFleet(G) {
  const st = G.stage, r = G.rng;
  const waves = st < 5 ? 2 : 3;
  const plan = [];
  for (let w = 0; w < waves; w++) {
    let budget = 3.6 + st * 0.16 + w * 0.6;
    const list = [];
    // the flagship leads the last wave from the Tempest Strait on
    if (w === waves - 1 && st >= 6) { list.push('galleon'); budget -= 3.2; }
    if (st >= 1 && w > 0 && r() < 0.55) { list.push('fireship'); budget -= 1; }
    let guard = 0;
    while (budget >= 1 && guard++ < 20) {
      const opts = POOL.filter(([k, from]) => st >= from && COST[k] <= budget + 0.4);
      if (!opts.length) break;
      let tot = opts.reduce((a, o) => a + o[2], 0), x = r() * tot, kind = opts[0][0];
      for (const o of opts) { x -= o[2]; if (x <= 0) { kind = o[0]; break; } }
      list.push(kind); budget -= COST[kind];
    }
    // shuffle, but a fireship never leads
    for (let i = list.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [list[i], list[j]] = [list[j], list[i]]; }
    const fi = list.indexOf('fireship');
    if (fi === 0 && list.length > 1) [list[0], list[1]] = [list[1], list[0]];
    plan.push(list);
  }
  return plan;
}
// Toughness: the fleet's total hp grows about 10% a stage (about as fast as a
// half-sensible build's firepower); more ships later means each is scaled less.
// G.diff (1 + 0.16 x stage by default) shifts it all for the lead's tuning.
const pts = (plan) => plan.flat().reduce((a, k) => a + COST[k], 0);
function hpScale(G, plan) {
  const st = G.stage;
  return 1.35 * Math.pow(1.1, st) * (8.4 / Math.max(4, pts(plan))) * Math.max(0.5, G.diff / (1 + st * 0.16));
}

export function startFleet(G) {
  const plan = planFleet(G);
  G.enc = { type: 'fleet', done: false, wave: 0, waves: plan.length, t: 0, plan, hpMul: hpScale(G, plan), queue: [], spawnT: 1.2, waveT: 0, spawned: 0 };
  nextWave(G);
}

function nextWave(G) {
  const E = G.enc;
  E.queue = [...E.plan[E.wave]];
  E.wave++; E.waveT = 0;
  if (E.wave > 1) {
    E.spawnT = 0.8;
    G.banner = { title: `WAVE ${E.wave} OF ${E.waves}`, sub: E.wave === E.waves && E.queue.includes('galleon') ? 'THE FLAGSHIP' : '', t: 0, life: 1.6 };
    emit('wave', { wave: E.wave, waves: E.waves });
  }
}

export function updateFleet(G, dt) {
  const E = G.enc;
  E.t += dt; E.waveT += dt;
  const alive = G.enemies.filter((e) => e.alive).length;
  if (E.queue.length) {
    E.spawnT -= dt;
    if (E.spawnT <= 0 && alive < MAX_ALIVE) { spawnShip(G, E.queue.shift()); E.spawnT = SPAWN_GAP; }
  } else if (E.wave < E.waves && ((alive <= 1 && E.waveT > 6) || E.waveT > 32)) nextWave(G);
  E.done = E.wave >= E.waves && !E.queue.length && alive === 0;
}

// ------------------------------------------------------------- one ship
function spawnShip(G, kind) {
  const K = KINDS[kind];
  const e = makeShip(G, kind, W + K.s * 1.5, {
    think: kind === 'fireship' ? fireThink : captain,
    hpMul: G.enc.hpMul, bountyMul: 1 + G.stage * 0.025,
  });
  e.station = pickStation(G, e);
  e.moveT = 3 + G.rng() * 4;
  e.weave = G.rng() * 6;
  if (G.world.biome === 'fog') e.reveal = 0;
  if (kind === 'fireship') {
    const sink = e.onDeath;
    e.onDeath = (G) => { sink.call(e, G); if (!e.blown) blast(G, e, false); };
  }
  G.enemies.push(e);
  return e;
}

// A free spot in the kind's band, as far as possible from the other ships' stations.
function pickStation(G, e) {
  const [a, b] = STATION[e.kind] || [700, 1150];
  let best = (a + b) / 2, bd = -1;
  for (let i = 0; i < 8; i++) {
    const x = a + G.rng() * (b - a);
    let d = 1e9;
    for (const o of G.enemies) if (o !== e && o.alive && o.kind !== 'fireship' && !o.boss) d = Math.min(d, Math.abs((o.station ?? o.x) - x) - (o.s || 80) - e.s);
    if (d > bd) { bd = d; best = x; }
  }
  return best;
}

function sail(G, e, dt) {
  const speed = e.speed * (e.slow > 0 ? 1 - (e.slowK || 0.4) : 1);
  const want = clamp((e.station - e.x) * 1.4, -speed, speed);
  e.vx += (want - e.vx) * Math.min(1, dt * 1.6);
}
function fogReveal(G, e, dt) {
  if (G.world.biome !== 'fog') { e.reveal = Math.min(1, (e.reveal ?? 1) + dt); return; }
  const target = clamp((W + 40 - e.x) / 320, 0, 1) * clamp(0.55 + (1100 - e.x) / 600, 0.55, 1);
  e.reveal = (e.reveal ?? 0) + (target - (e.reveal ?? 0)) * Math.min(1, dt * 2);
}

function captain(G, e, dt) {
  const r = G.rng, p = G.player;
  fogReveal(G, e, dt);
  // shift position now and then; sloops weave; a badly hurt ship may fall back
  e.moveT -= dt;
  if (e.moveT <= 0) {
    e.moveT = 4 + r() * 5;
    e.station = clamp(pickStation(G, e) * 0.5 + e.station * 0.5 + (r() - 0.5) * 160, 650, 1220);
  }
  if (!e.fled && e.hp < e.maxHp * 0.35) { e.fled = true; if (r() < 0.5) { e.station = 1120 + r() * 90; e.moveT = 6; } }
  if (KINDS[e.kind].weave) e.station += Math.sin(e.t * 0.9 + e.weave) * 70 * dt;
  // keep spacing from the other ships
  for (const o of G.enemies) {
    if (o === e || !o.alive || o.kind === 'fireship' || o.boss || !o.s) continue;
    const gap = (e.s + o.s) * 0.95, dx = e.x - o.x;
    if (Math.abs(dx) < gap) e.station += (dx >= 0 ? 1 : -1) * 170 * dt;
  }
  e.station = clamp(e.station, 650, 1220);
  sail(G, e, dt);
  // guns: reload, run out (ports glow, a telegraph), fire
  if (!p || !p.alive || e.x > W - 50) return;
  if (e.charge > 0) {
    e.charge -= dt;
    if (e.charge <= 0) { e.charge = 0; volley(G, e); e.kick = 1; }
    return;
  }
  e.reload -= dt * (1 + G.stage * 0.015);
  if (e.reload <= 0) { e.charge = e.kind === 'gunboat' ? 0.8 : 0.6; e.reload = e.reloadT * (0.85 + r() * 0.35); }
}

function volley(G, e) {
  const p = G.player, r = G.rng, k = dmgK(G);
  if (e.kind === 'gunboat') {
    const T = 2.4;
    const lead = 0.5 + r() * 0.4;
    const tx = clamp(p.x + p.vx * T * lead + gauss(r) * 30, PLAYER_X.min - 20, PLAYER_X.max + 40);
    enemyFire(G, e, tx, 0, { kind: 'mortar', n: G.stage >= 13 ? 2 : 1, spread: 170, T, dmg: e.gunDmg * k, radius: 78, x0: e.x + e.dir * e.s * 0.1, y0: e.y - e.s * 0.55 });
    return;
  }
  const x0 = e.x + e.dir * e.s * 0.3, y0 = e.y - e.s * 0.1;
  const T = flightTime(x0, y0, p.cx, p.cy, 520, 0.7, 1.6);
  const lead = 0.45 + r() * 0.5;
  const err = { sloop: 72, brig: 60, galleon: 50 }[e.kind] ?? 60;
  const n = e.kind === 'sloop' ? 1 + (r() < 0.5 ? 1 : 0) : e.guns;
  const fire = e.kind === 'galleon' && G.stage >= 9 && r() < 0.3 ? 'fireball' : 'ball';
  enemyFire(G, e, p.cx + p.vx * T * lead, p.y - p.s * 0.35, { kind: fire, n, err, spread: e.kind === 'galleon' ? 40 : 30, dmg: e.gunDmg * k, delay: 0.06 });
}

// Fireships sail straight at you, faster as they close, and blow up on contact.
function fireThink(G, e, dt) {
  const p = G.player;
  fogReveal(G, e, dt);
  if (!p || !p.alive) { e.station = 1300; sail(G, e, dt); return; }
  const gap = Math.abs(e.x - p.x);
  e.station = p.x;
  const speed = e.speed * (1 + G.stage * 0.03) * (gap < 400 ? 1.5 : 1) * (e.slow > 0 ? 1 - (e.slowK || 0.4) : 1);
  const want = clamp((e.station - e.x) * 2, -speed, speed);
  e.vx += (want - e.vx) * Math.min(1, dt * 1.2);
  if (gap < e.s * 0.7 + p.s * 0.85) blast(G, e, true);
}
function blast(G, e, contact) {
  e.blown = true;
  const k = dmgK(G);
  spawn(G, 'explosion', e.x, e.y - e.s * 0.4, { size: e.s * 1.6 });
  spawn(G, 'fire', e.x, e.y - e.s * 0.2, { size: e.s, dur: 1.5 });
  emit('explode', { x: e.x, y: e.y, size: 1.6 });
  const p = G.player;
  if (contact) {
    if (p && p.alive) { damage(G, p, KINDS.fireship.dmg * k, { kind: 'fireship', x: p.x + p.s * 0.6, y: p.cy }); applyBurn(p, 4 * k, 3); }
    damage(G, e, 1e9, { kind: 'fireship', quiet: true, noBounty: true });
  } else {
    // shot down: the blast scorches whatever is alongside
    for (const o of G.enemies) {
      if (o === e || !o.alive) continue;
      if (Math.abs((o.cx ?? o.x) - e.x) < 150 + (o.s || 60)) { damage(G, o, 30 * k, { kind: 'fire', x: o.cx, y: o.cy }); applyBurn(o, 5 * k, 3); }
    }
    if (p && p.alive && Math.abs(p.x - e.x) < 140 + p.s * 0.6) damage(G, p, KINDS.fireship.dmg * k * 0.5, { kind: 'fireship' });
  }
}
