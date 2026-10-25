// Tidebreaker: combat. Cannonballs and the other shots in G.shots, the
// player's broadside and abilities, enemy fire, statuses (burn, slow) and
// damage(), the only way hp goes down.
//
// Shots: { side: 'player'|'enemy', kind: 'ball'|'chain'|'barrel'|'mortar'|'fireball',
//   x, y, vx, vy, r, dmg, crit, t, landX (where it meets the lane), ... }.
// Balls are ballistic (GRAV px/s^2), launched so the arc passes through the aim
// point; they fly on past it and splash when they meet the lane surface.
import { W } from './config.js';
import { clamp, dist, rgba } from './util.js';
import { glow } from './gfx.js';
import { emit } from './events.js';
import { laneY } from './world/ocean.js';
import { spawn, paintFire, paintBolt } from './world/fx.js';
import { gunPorts, mastHead } from './ships.js';
import { summonKraken } from './kraken.js';

export const GRAV = 600;
const PLAYER_BALL = 700; // px/s that sets a player ball's flight time
const ENEMY_BALL = 520;

// Velocity that carries a ball from (x0, y0) through (ax, ay) in time T.
export function ballistic(x0, y0, ax, ay, T, g = GRAV) {
  return { vx: (ax - x0) / T, vy: (ay - y0) / T - 0.5 * g * T };
}
export function flightTime(x0, y0, ax, ay, speed = PLAYER_BALL, lo = 0.45, hi = 1.3) {
  return clamp(dist(x0, y0, ax, ay) / speed, lo, hi);
}
// Where a shot will meet the lane (steps the flight forward; the swell is taken as it is now).
function predictLand(G, s) {
  let x = s.x, y = s.y, vx = s.vx, vy = s.vy;
  const g = s.g ?? GRAV, h = 1 / 60;
  for (let i = 0; i < 360; i++) {
    vy += g * h; x += vx * h; y += vy * h;
    if (vy > 0 && y >= laneY(G, x)) return x;
  }
  return x;
}
// A roughly normal random number from the seeded generator (sd 1).
function gauss(r) { return (r() + r() + r() + r() - 2) * 1.73; }

// ------------------------------------------------------------- statuses
export function applyBurn(e, dps, time) {
  if (!e || !e.alive || dps <= 0 || time <= 0) return;
  e.burnDps = e.burn > 0 ? Math.max(e.burnDps || 0, dps) : dps;
  e.burn = Math.max(e.burn || 0, time);
}
export function applySlow(e, k, time) {
  if (!e || !e.alive || time <= 0) return;
  e.slowK = Math.max(e.slow > 0 ? e.slowK || 0 : 0, k);
  e.slow = Math.max(e.slow || 0, time);
}
function tickStatus(G, e, dt) {
  if (!e.alive) { e.burn = 0; e.slow = 0; return; }
  if (e.slow > 0) e.slow = Math.max(0, e.slow - dt);
  if (e.held > 0) e.held = Math.max(0, e.held - dt);
  if (e.burn > 0) {
    e.burn = Math.max(0, e.burn - dt);
    const d = (e.burnDps || 0) * dt;
    if (d > 0) {
      e.burnAcc = (e.burnAcc || 0) + damage(G, e, d, { kind: 'burn', quiet: true });
      e.burnShow = (e.burnShow ?? 0.6) - dt;
      if (e.burnShow <= 0 && e.burnAcc >= 1) {
        number(G, (e.cx ?? e.x) + (Math.random() - 0.5) * 30, (e.cy ?? e.y) - 30, `-${Math.round(e.burnAcc)}`, '#ff9a3a', 18);
        e.burnAcc = 0; e.burnShow = 0.6;
      }
    }
  }
}
function number(G, x, y, text, col, size, crit = false) { spawn(G, 'number', x, y, { text, col, size, crit }); }

// ------------------------------------------------------------- damage
// The only way hp drops. info: { kind, x, y, crit, mul (weak spot), quiet, noBounty, by }
export function damage(G, target, amount, info = {}) {
  if (!target || !target.alive || !(amount > 0)) return 0;
  const isPlayer = target === G.player;
  let dmg = amount * (info.mul || 1);
  if (isPlayer) {
    if (G.god) return 0;
    dmg *= 1 - clamp(G.stats.armor || 0, 0, 0.6);
  } else if (target.held && G.stats.krakenSlow) dmg *= 1 + G.stats.krakenSlow;
  const r = target.onDamage?.(G, dmg, info);
  if (typeof r === 'number') dmg = r;
  if (!(dmg > 0)) return 0;
  target.hp -= dmg;
  const x = info.x ?? target.cx ?? target.x, y = info.y ?? target.cy ?? target.y;
  if (isPlayer) {
    if (!info.quiet) { number(G, x, y - 20, `-${Math.round(dmg)}`, '#ff5a5a', 26); emit('player-hit', { dmg, x, y }); }
  } else {
    if (G.run) G.run.dmg += dmg;
    if (!info.quiet) {
      const weak = (info.mul || 1) > 1;
      if (info.crit) number(G, x, y - 40, `CRIT ${Math.round(dmg)}`, '#ff6a3a', 30, true);
      else number(G, x, y - 30, `-${Math.round(dmg)}`, info.col || (weak ? '#9affff' : '#ffe14a'), weak ? 32 : 28);
      if (weak && !info.crit) number(G, x, y - 64, 'WEAK SPOT', '#9affff', 18);
      emit('hit', { x, y, dmg, crit: !!info.crit, weak, kind: info.kind || 'ball', target: target.kind });
    }
  }
  if (target.hp <= 0) {
    target.hp = 0; target.alive = false;
    target.onDeath?.(G);
    if (isPlayer) { emit('sink', { x: target.x, y: target.y, kind: 'player', boss: false }); return dmg; }
    if (G.run && !info.noBounty) {
      const gold = Math.round((target.bounty || 0) * (G.stats.goldMul || 1));
      G.run.gold += gold; G.run.score += (target.bounty || 0) * 10 + Math.round(target.maxHp || 0); G.run.kills++;
      if (gold > 0) { emit('coin', { n: gold, x: target.cx ?? target.x, y: target.cy ?? target.y }); number(G, target.cx ?? target.x, (target.cy ?? target.y) - 90, `+${gold}`, '#ffd34a', 22); }
    }
    emit('sink', { x: target.cx ?? target.x, y: target.y, kind: target.kind, boss: !!target.boss });
  }
  return dmg;
}

// ------------------------------------------------------------- the player's guns
function newShot(G, o) {
  const s = { t: 0, r: 6, hit: null, g: GRAV, ...o };
  s.landX = predictLand(G, s);
  G.shots.push(s);
  return s;
}
// Each ball in a broadside goes out 50 to 70 ms after the last.
function broadside(G, p) {
  const S = G.stats, n = Math.max(1, Math.round(S.guns));
  const ports = gunPorts(p, Math.min(n, 6));
  let at = 0;
  for (let i = 0; i < n; i++) { p.volley.push({ at, port: i % ports.length, n }); at += 0.05 + G.rng() * 0.02; }
  p.kick = 1;
  emit('fire', { side: 'player', kind: 'broadside', x: p.x, y: p.cy, n });
}
function fireBall(G, p, v) {
  const S = G.stats, r = G.rng;
  const ports = gunPorts(p, Math.min(v.n, 6));
  const [x0, y0] = ports[v.port];
  const ax = G.input.aim.x + gauss(r) * S.spread * 0.6, ay = G.input.aim.y + gauss(r) * S.spread * 0.6;
  const T = flightTime(x0, y0, ax, ay, PLAYER_BALL * (S.shotSpeed || 1));
  const { vx, vy } = ballistic(x0, y0, ax, ay, T);
  const crit = r() < S.crit;
  const burn = S.broadsideBurn ? Math.max(S.burn || 0, S.burnDps || 0) : S.burn || 0;
  newShot(G, { side: 'player', kind: 'ball', x: x0, y: y0, vx, vy, r: 6 + Math.min(3, (S.dmg - 14) / 10), dmg: S.dmg * (crit ? S.critMul : 1), crit,
    splash: S.splash || 0, burn, pierce: S.pierce || 0, skip: S.skip || 0, hit: new Set(), hot: crit || burn > 0 });
  G.run.shots++;
  const dir = Math.atan2(vy, vx);
  spawn(G, 'flash', x0 + 4, y0, { ang: dir, size: 10 + v.port });
  spawn(G, 'smoke', x0 + 10, y0 - 6, { size: 13, n: 6, col: '#ffffff', drift: 1.2, a: 0.5 });
}

export function playerControl(G, dt) {
  const p = G.player, I = G.input, S = G.stats;
  if (!p || !p.alive) return;
  for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
  // queued balls of the current broadside
  if (p.volley.length) {
    p.volleyT = (p.volleyT || 0) + dt;
    while (p.volley.length && p.volley[0].at <= p.volleyT) fireBall(G, p, p.volley.shift());
    if (!p.volley.length) p.volleyT = 0;
  }
  if (I.fireTap) p.buffer = 0.3;
  else p.buffer = Math.max(0, p.buffer - dt);
  if ((I.fire || p.buffer > 0) && p.cd.broadside <= 0 && !p.volley.length) {
    broadside(G, p); p.cd.broadside = S.reload; p.buffer = 0;
  }
  if (I.ability) useAbility(G, p, I.ability);
}

const CD = { chain: 'cdChain', fire: 'cdFire', lightning: 'cdLightning', kraken: 'cdKraken' };
function nearestEnemy(G, x, y, skip) {
  let best = null, bd = Infinity;
  for (const e of G.enemies) {
    if (!e.alive || (skip && skip.has(e)) || (e.reveal ?? 1) < 0.2) continue;
    const d = dist(x, y, e.cx ?? e.x, e.cy ?? e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
export function useAbility(G, p, id) {
  const S = G.stats;
  if (!CD[id] || !(S[id] > 0) || p.cd[id] > 0) return false;
  const aim = G.input.aim;
  if (id === 'chain') {
    const [x0, y0] = gunPorts(p, 6)[3];
    const T = flightTime(x0, y0, aim.x, aim.y, PLAYER_BALL * (S.shotSpeed || 1));
    const { vx, vy } = ballistic(x0, y0, aim.x, aim.y, T);
    newShot(G, { side: 'player', kind: 'chain', x: x0, y: y0, vx, vy, r: 16, dmg: S.dmg * S.chainDmg, slow: S.chainSlow, slowTime: S.slowTime, hit: new Set(), spin: 0 });
    spawn(G, 'flash', x0, y0, { ang: Math.atan2(vy, vx), size: 16 });
    p.kick = 0.8;
  } else if (id === 'fire') {
    const n = Math.max(1, Math.round(S.barrels));
    for (let i = 0; i < n; i++) {
      const [x0, y0] = gunPorts(p, 6)[1 + (i % 4)];
      const tx = aim.x + (i - (n - 1) / 2) * 70 + gauss(G.rng) * 12;
      const ty = Math.min(aim.y, laneY(G, tx) - 10);
      const T = clamp(dist(x0, y0, tx, ty) / 520, 0.8, 1.6);
      const { vx, vy } = ballistic(x0, y0, tx, ty, T);
      newShot(G, { side: 'player', kind: 'barrel', x: x0, y: y0, vx, vy, r: 12, dmg: S.dmg, fuse: 4 + i * 0.3, spin: G.rng() * 6, hit: new Set() });
    }
  } else if (id === 'lightning') {
    const [x0, y0] = mastHead(p);
    let from = [x0, y0], first = nearestEnemy(G, x0, y0);
    if (!first) return false;
    const hit = new Set(), mul = (G.world.biome === 'storm' ? S.stormBonus : 1);
    let e = first;
    for (let i = 0; i < Math.max(1, S.lightningTargets) && e; i++) {
      hit.add(e);
      const tx = e.cx ?? e.x, ty = e.cy ?? e.y;
      zap(G, from[0], from[1], tx, ty, i === 0 ? 1 : 0.75);
      emit('lightning', { x0: from[0], y0: from[1], x1: tx, y1: ty });
      spawn(G, 'sparks', tx, ty, { n: 18, size: 34, col: '#bff4ff' });
      damage(G, e, S.lightningDmg * mul * (i === 0 ? 1 : 0.85), { kind: 'lightning', col: '#9ff4ff', x: tx, y: ty });
      if (i > 0) number(G, tx - 30, ty - 70, `CHAIN x${i + 1}`, '#9ff4ff', 20);
      if (S.lightningIgnites) applyBurn(e, S.burnDps, S.burnTime * 0.6);
      from = [tx, ty];
      const nx = nearestEnemy(G, tx, ty, hit);
      e = nx && dist(tx, ty, nx.cx ?? nx.x, nx.cy ?? nx.y) < 520 ? nx : null;
    }
  } else if (id === 'kraken') {
    const t = nearestEnemy(G, aim.x, aim.y);
    if (!t) return false;
    summonKraken(G, t);
  }
  p.cd[id] = S[CD[id]];
  emit('ability', { id });
  emit('fire', { side: 'player', kind: id, x: p.x, y: p.cy, n: 1 });
  return true;
}
// A short-lived lightning bolt drawn by drawShots.
function zap(G, x0, y0, x1, y1, w = 1) {
  (G.zaps || (G.zaps = [])).push({ x0, y0, x1, y1, w, t: 0, life: 0.32, seed: (Math.random() * 1e4) | 0 });
}

// ------------------------------------------------------------- enemy fire
// kind 'ball' (aimed through tx, ty), 'mortar' (high arc onto the lane at tx with a
// marked landing ring), 'fireball' (a ball that sets fire).
// opts: { kind, dmg, n, spread, err, x0, y0, T, radius, burn, r, delay }
export function enemyFire(G, from, tx, ty, opts = {}) {
  const kind = opts.kind || 'ball', r = G.rng, out = [];
  const n = opts.n || 1;
  const ports = from.s ? gunPorts(from, Math.min(6, Math.max(2, n))) : null;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = opts.x0 != null ? [opts.x0, opts.y0] : ports ? ports[(ports.length - 1 - i) % ports.length] : [from.cx ?? from.x, from.cy ?? from.y];
    if (kind === 'mortar') {
      const lx = tx + (n > 1 ? (i - (n - 1) / 2) * (opts.spread ?? 90) : 0) + gauss(r) * (opts.err || 0);
      const T = opts.T || 2.4;
      const ly = laneY(G, lx);
      const { vx, vy } = ballistic(x0, y0, lx, ly, T);
      const s = newShot(G, { side: 'enemy', kind, x: x0, y: y0, vx, vy, r: 8, dmg: opts.dmg || 20, radius: opts.radius || 80, T, owner: from });
      s.landX = lx; out.push(s);
    } else {
      const ax = tx + (i - (n - 1) / 2) * (opts.spread ?? 26) + gauss(r) * (opts.err || 0);
      const ay = ty + gauss(r) * (opts.err || 0) * 0.5;
      const T = opts.T || flightTime(x0, y0, ax, ay, ENEMY_BALL, 0.7, 1.6);
      const { vx, vy } = ballistic(x0, y0, ax, ay, T);
      out.push(newShot(G, { side: 'enemy', kind, x: x0, y: y0, vx, vy, r: opts.r || (kind === 'fireball' ? 8 : 6), dmg: opts.dmg || 8, burn: opts.burn || (kind === 'fireball' ? 3 : 0), owner: from, delay: (opts.delay || 0) * i }));
    }
    const ang = Math.atan2(out[out.length - 1].vy, out[out.length - 1].vx);
    spawn(G, 'flash', x0, y0, { ang, size: kind === 'mortar' ? 14 : 10, col: '#ff8a3a' });
    spawn(G, 'smoke', x0 - 10, y0 - 6, { size: kind === 'mortar' ? 18 : 12, n: 5, col: '#d8b0c0', drift: -1.2, a: 0.5 });
  }
  emit('fire', { side: 'enemy', kind, x: from.cx ?? from.x, y: from.cy ?? from.y, n });
  return out;
}

// ------------------------------------------------------------- the shots each step
export function updateShots(G, dt) {
  for (const e of G.enemies) tickStatus(G, e, dt);
  if (G.player) tickStatus(G, G.player, dt);
  if (G.zaps) { for (const z of G.zaps) z.t += dt; G.zaps = G.zaps.filter((z) => z.t < z.life); }
  const keep = [];
  for (const s of G.shots) if (stepShot(G, s, dt)) keep.push(s);
  G.shots = keep;
}

// Returns false when the shot is spent.
function stepShot(G, s, dt) {
  if (s.delay > 0) { s.delay -= dt; return true; }
  s.t += dt;
  if (s.kind === 'barrel' && s.float) return floatBarrel(G, s, dt);
  s.vy += s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt;
  if (s.spin != null) s.spin += dt * 9;
  if (s.t > 0.2 && ((s.t * 60) | 0) % 12 === 0) s.landX = predictLand(G, s);
  if (s.side === 'player') {
    for (const e of G.enemies) {
      if (!e.alive || (s.hit && s.hit.has(e))) continue;
      const m = e.hitTest(s.x, s.y, s.r);
      if (!m) continue;
      if (s.kind === 'barrel') { burstBarrel(G, s); return false; }
      hitEnemy(G, s, e, m);
      if (s.pierce > 0) { s.pierce--; continue; }
      return false;
    }
  } else if (s.kind !== 'mortar') {
    const p = G.player;
    if (p && p.alive && p.hitTest(s.x, s.y, s.r)) {
      damage(G, p, s.dmg, { kind: s.kind, x: s.x, y: s.y });
      if (s.burn) applyBurn(p, s.burn, 3);
      spawn(G, 'sparks', s.x, s.y, { n: 12, size: 24 });
      spawn(G, 'debris', s.x, s.y, { n: 5, size: 0.6 });
      p.flash = 0.12;
      return false;
    }
  }
  const ly = laneY(G, s.x);
  if (s.vy > 0 && s.y >= ly) return land(G, s, ly);
  if (s.x < -200 || s.x > W + 300 || s.y > 900) return false;
  return true;
}

function hitEnemy(G, s, e, m) {
  const S = G.stats;
  if (G.run) G.run.hits = (G.run.hits || 0) + 1;
  if (s.hit) s.hit.add(e);
  damage(G, e, s.dmg, { kind: s.kind, crit: s.crit, mul: m, x: s.x, y: s.y });
  spawn(G, 'sparks', s.x, s.y, { n: s.crit ? 20 : 12, size: s.crit ? 34 : 24 });
  spawn(G, 'debris', s.x, s.y, { n: 6, size: 0.7 });
  if (s.burn > 0) applyBurn(e, s.burn, S.burnTime || 4);
  if (s.slow) applySlow(e, s.slow, s.slowTime || 3);
  if (s.splash > 0) splashDamage(G, s.x, s.y, s.splash, s.dmg * 0.5, e);
  if (s.crit && S.critArc > 0) {
    const done = new Set([e]);
    let from = [s.x, s.y];
    for (let i = 0; i < S.critArc; i++) {
      const n = nearestEnemy(G, from[0], from[1], done);
      if (!n || dist(from[0], from[1], n.cx, n.cy) > 420) break;
      done.add(n); zap(G, from[0], from[1], n.cx, n.cy, 0.6);
      damage(G, n, s.dmg * 0.5, { kind: 'lightning', col: '#9ff4ff' });
      from = [n.cx, n.cy];
    }
  }
}
function splashDamage(G, x, y, r, dmg, except) {
  spawn(G, 'explosion', x, y, { size: r * 0.6 });
  for (const e of G.enemies) {
    if (!e.alive || e === except) continue;
    if (e.hitTest(x, y, r)) damage(G, e, dmg, { kind: 'splash', x: e.cx, y: e.cy });
  }
}

// A shot meets the sea.
function land(G, s, ly) {
  if (s.kind === 'ball' && s.side === 'player' && s.skip > 0) {
    s.skip--; s.vy = -Math.abs(s.vy) * 0.5; s.vx *= 0.85; s.y = ly - 1;
    spawn(G, 'splash', s.x, ly, { size: 12 }); emit('splash', { x: s.x, y: ly, size: 0.4 });
    return true;
  }
  if (s.kind === 'barrel') {
    s.float = true; s.vx = 0; s.vy = 0; s.y = ly;
    spawn(G, 'splash', s.x, ly, { size: 16 }); emit('splash', { x: s.x, y: ly, size: 0.6 });
    return true;
  }
  if (s.kind === 'mortar') {
    spawn(G, 'explosion', s.x, ly - 10, { size: s.radius * 0.8 });
    spawn(G, 'splash', s.x, ly, { size: 44 });
    emit('explode', { x: s.x, y: ly, size: 1 });
    const p = G.player;
    if (p && p.alive && Math.abs(p.x - s.x) < s.radius + p.s * 0.35) damage(G, p, s.dmg, { kind: 'mortar', x: p.x, y: p.cy });
    return false;
  }
  if (s.side === 'player' && s.splash > 0) splashDamage(G, s.x, ly, s.splash, s.dmg * 0.5, null);
  const size = s.kind === 'chain' ? 30 : 22;
  spawn(G, 'splash', s.x, ly, { size });
  emit('splash', { x: s.x, y: ly, size: size / 30 });
  return false;
}

// Fire barrels drift on the lane, burning, until a ship touches one or the fuse ends.
function floatBarrel(G, s, dt) {
  s.fuse -= dt; s.y = laneY(G, s.x); s.x -= 6 * dt;
  for (const e of G.enemies) {
    if (!e.alive || !e.s) continue;
    if (Math.abs(e.x - s.x) < e.s * 0.95) { burstBarrel(G, s); return false; }
  }
  if (s.fuse <= 0) { burstBarrel(G, s); return false; }
  return true;
}
function burstBarrel(G, s) {
  const S = G.stats, R = 130;
  spawn(G, 'explosion', s.x, s.y - 10, { size: 60 });
  spawn(G, 'fire', s.x, s.y, { size: 40, dur: 1.2 });
  emit('explode', { x: s.x, y: s.y, size: 0.8 });
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const ex = e.cx ?? e.x, reach = R + (e.s || 60) * 0.7;
    if (Math.abs(ex - s.x) < reach && Math.abs((e.y ?? s.y) - s.y) < 260) {
      damage(G, e, s.dmg, { kind: 'fire', x: ex, y: e.cy });
      applyBurn(e, S.burnDps, S.burnTime);
    }
  }
}

// ------------------------------------------------------------- drawing
// A cannonball with its glowing trail (also used by card art).
export function paintBall(g, x, y, vx, vy, r = 5, trail = '#ffe6a0', hot) {
  const L = Math.hypot(vx, vy) || 1, ux = vx / L, uy = vy / L, len = Math.min(70, L * 0.1 + 10);
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createLinearGradient(x, y, x - ux * len, y - uy * len);
  gr.addColorStop(0, rgba(trail, 0.8)); gr.addColorStop(1, rgba(trail, 0));
  g.strokeStyle = gr; g.lineWidth = r * 1.3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, y); g.lineTo(x - ux * len, y - uy * len); g.stroke();
  if (hot) glow(g, x, y, r * 5, hot, 0.8);
  g.restore();
  g.fillStyle = hot ? '#fff1c0' : '#1b1b22'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, 7); g.fill();
}

function drawAim(g, G) {
  const p = G.player, a = G.input.aim;
  if (!p || !p.alive || G.scene !== 'play' || G.auto) return;
  const [x0, y0] = gunPorts(p, 6)[3];
  const T = flightTime(x0, y0, a.x, a.y, PLAYER_BALL * (G.stats.shotSpeed || 1));
  const { vx, vy } = ballistic(x0, y0, a.x, a.y, T);
  const ready = p.cd.broadside <= 0;
  g.save(); g.setLineDash([3, 9]); g.lineWidth = 2; g.strokeStyle = rgba('#ffe6a0', ready ? 0.38 : 0.18);
  g.beginPath();
  for (let i = 0; i <= 24; i++) { const t = T * i / 24; const x = x0 + vx * t, y = y0 + vy * t + 0.5 * GRAV * t * t; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke(); g.setLineDash([]);
  g.strokeStyle = rgba('#ffe6a0', ready ? 0.6 : 0.25); g.lineWidth = 1.5;
  g.beginPath(); g.arc(a.x, a.y, 9, 0, 7); g.moveTo(a.x - 15, a.y); g.lineTo(a.x - 5, a.y); g.moveTo(a.x + 5, a.y); g.lineTo(a.x + 15, a.y); g.stroke();
  g.restore();
}

export function drawShots(g, G) {
  drawAim(g, G);
  const t = G.vt;
  // landing marks first: mortar rings and the faint ripple where an enemy ball will fall
  for (const s of G.shots) {
    if (s.side !== 'enemy' || s.delay > 0) continue;
    const ly = laneY(G, s.landX);
    if (s.kind === 'mortar') {
      const k = clamp(s.t / s.T, 0, 1), pulse = 0.5 + 0.5 * Math.sin(t * 14);
      g.save(); g.strokeStyle = rgba('#ff4a3a', 0.35 + 0.5 * k * pulse); g.lineWidth = 2 + k * 2;
      g.beginPath(); g.ellipse(s.landX, ly + 2, s.radius * (1.25 - 0.25 * k), 10 * (1.25 - 0.25 * k), 0, 0, 7); g.stroke();
      g.fillStyle = rgba('#ff4a3a', 0.12 + 0.15 * k); g.fill();
      g.beginPath(); g.moveTo(s.landX - 10, ly + 2); g.lineTo(s.landX + 10, ly + 2); g.moveTo(s.landX, ly - 6); g.lineTo(s.landX, ly + 10); g.stroke();
      g.restore();
    } else if (s.landX < 700) {
      g.fillStyle = rgba('#ff5a4a', 0.28); g.beginPath(); g.ellipse(s.landX, ly + 3, 16, 3.5, 0, 0, 7); g.fill();
    }
  }
  for (const s of G.shots) {
    if (s.delay > 0) continue;
    if (s.kind === 'ball') {
      if (s.side === 'player') paintBall(g, s.x, s.y, s.vx, s.vy, s.r, s.crit ? '#ffd36a' : '#ffe6a0', s.hot ? (s.crit ? '#ff7a2a' : '#ff5a1a') : null);
      else paintBall(g, s.x, s.y, s.vx, s.vy, s.r, '#ff8a6a', '#ff3a2a');
    } else if (s.kind === 'fireball') paintBall(g, s.x, s.y, s.vx, s.vy, s.r, '#ff9a4a', '#ff3a1a');
    else if (s.kind === 'mortar') {
      paintBall(g, s.x, s.y, s.vx, s.vy, s.r, '#ffb06a', null);
      g.fillStyle = '#ffd36a'; g.fillRect(s.x - 1, s.y - s.r - 3, 2, 3);
    } else if (s.kind === 'chain') drawChain(g, s);
    else if (s.kind === 'barrel') drawBarrel(g, G, s);
  }
  if (G.zaps) for (const z of G.zaps) {
    const a = 1 - z.t / z.life;
    g.save(); g.globalAlpha = a;
    paintBolt(g, z.x0, z.y0, z.x1, z.y1, z.seed + ((z.t * 30) | 0), '#7fe6ff', 0.9 * z.w, 2);
    g.restore();
  }
}

function drawChain(g, s) {
  const c = Math.cos(s.spin), sn = Math.sin(s.spin), d = 22;
  const ax = s.x - c * d, ay = s.y - sn * d * 0.6, bx = s.x + c * d, by = s.y + sn * d * 0.6;
  g.strokeStyle = '#2a2a33'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(s.x - sn * 8, s.y - 8, bx, by); g.stroke();
  paintBall(g, ax, ay, s.vx, s.vy, 6, '#cfe0ff'); paintBall(g, bx, by, s.vx, s.vy, 6, '#cfe0ff');
}
function drawBarrel(g, G, s) {
  g.save(); g.translate(s.x, s.y - (s.float ? 6 : 0)); g.rotate(s.float ? Math.sin(G.vt * 2 + s.spin) * 0.2 : s.spin);
  g.fillStyle = '#6a3a1a'; g.beginPath(); g.ellipse(0, 0, 11, 13, 0, 0, 7); g.fill();
  g.strokeStyle = '#2a160a'; g.lineWidth = 2; g.beginPath(); g.moveTo(-11, -5); g.lineTo(11, -5); g.moveTo(-11, 5); g.lineTo(11, 5); g.stroke();
  g.restore();
  paintFire(g, s.x, s.y - (s.float ? 14 : 8), 22, s.float ? 34 : 22, (s.spin * 100) | 0, 1, G.vt);
}
