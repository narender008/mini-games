// The eight enemy types (plus mines and shards): how each one flies and how
// it shoots. Every enemy follows a path (weave, swoop, hover, drop, cross,
// edge) set by the wave script, and has a type behaviour layered on top
// (fire patterns, diver lunges, sniper telegraphs, mine fuses, splitter
// shards). Kills score, feed the chain and drop loot here.
//
// Enemies only fire while on screen and above the player, and never put a
// bullet on top of the player (patterns.js enforces that for every spawn).
import { ENEMIES } from './data.js';
import { rnd, range, clamp, angDiff, TAU } from './rng.js';
import { shoot, aimed, fan, ring, burst, beam, aimAt, cancelEmitters } from './patterns.js';
import { scoreKill } from './score.js';
import { hurtPlayer, dropLoot } from './player.js';

export function spawnEnemy(S, type, x, y, path) {
  const def = ENEMIES[type];
  const hp = Math.round(def.hp * S.diff.hp * 10) / 10;
  const e = {
    id: S.nextId++,
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    hp,
    maxHp: hp,
    r: def.r,
    t: 0,
    hitT: 9,
    shield: def.shieldHp ? { angle: -Math.PI / 2, arc: 2.2, hp: Math.round(def.shieldHp * S.diff.hp), maxHp: Math.round(def.shieldHp * S.diff.hp) } : null,
    tele: null,
    armed: type === 'mine' ? false : undefined,
    value: def.value,
    big: !!def.big,
    dead: false,
    gone: false,
    entered: false,
    leaving: false,
    path: path || { kind: 'drop', vy: -3 },
    state: 'in',
    st: 0,
    fireT: 0,
    lockA: 0,
    x0: x,
    y0: y,
  };
  e.fireT = firstShot(S, e);
  S.enemies.push(e);
  S.events.push({ type: 'spawn', x, y, enemy: type, id: e.id });
  return e;
}

function firstShot(S, e) {
  const r = S.rng;
  switch (e.type) {
    case 'dart':
      return range(r, 0.3, 1.2);
    case 'gunship':
      return range(r, 1.2, 2);
    case 'bulwark':
      return range(r, 1.6, 2.4);
    case 'minelayer':
      return 0.8;
    case 'splitter':
      return range(r, 1.2, 2);
    case 'sniper':
      return range(r, 1.2, 2.2);
    case 'turret':
      return range(r, 0.6, 1.6);
    default:
      return 99;
  }
}

// ------------------------------------------------------------ paths

function movePath(S, e, dt) {
  const p = e.path;
  const f = S.field;
  switch (p.kind) {
    case 'weave':
      e.y += p.vy * dt;
      e.x = e.x0 + p.amp * Math.sin(p.freq * e.t + (p.phase || 0));
      break;
    case 'swoop': {
      // quadratic bezier from spawn through (cx, cy) to (ex, ey) over dur s
      const u = e.t / p.dur;
      if (u < 1) {
        const a = (1 - u) * (1 - u);
        const b = 2 * (1 - u) * u;
        const c = u * u;
        e.x = a * e.x0 + b * p.cx + c * p.ex;
        e.y = a * e.y0 + b * p.cy + c * p.ey;
      } else {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        return;
      }
      break;
    }
    case 'hover': {
      if (e.leaving) {
        e.y += (p.exitVy || 5) * dt;
        e.x += e.vx * 0.98 * dt;
        return;
      }
      const k = 1 - Math.exp(-(p.ease || 1.8) * dt);
      const tx = p.hx + (p.strafe || 0) * Math.sin(e.t * (p.sfreq || 0.6) + (p.sphase || 0));
      const ty = p.hy + (p.bob || 0.25) * Math.sin(e.t * 1.3 + e.id);
      e.x += (tx - e.x) * k;
      e.y += (ty - e.y) * k;
      if (e.t > (p.stay || 12)) e.leaving = true;
      break;
    }
    case 'cross':
      e.x += p.vx * dt;
      e.y = p.y + 0.5 * Math.sin(e.t * 1.1);
      break;
    case 'edge':
      e.x = p.side * (f.halfW - 0.75);
      e.y += -(p.scroll || 0.9) * dt;
      break;
    case 'free':
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      return;
    case 'drop':
    default:
      e.y += (p.vy || -3) * dt;
      e.x += (p.vx || 0) * dt;
      break;
  }
}

// ------------------------------------------------------------ behaviour

const DOWN = -Math.PI / 2;

export function stepEnemies(S, dt) {
  const f = S.field;
  const P = S.player;
  const list = S.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || e.gone) continue;
    if (e.hp <= 0) {
      killEnemy(S, e, 'shot');
      continue;
    }
    e.t += dt;
    e.hitT += dt;
    e.st += dt;
    const ox = e.x;
    const oy = e.y;
    if (e.type === 'diver' && e.state === 'dive') {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    } else if (e.type === 'shard') stepShard(S, e, dt);
    else movePath(S, e, dt);
    if (!(e.type === 'diver' && e.state === 'dive') && e.type !== 'shard' && e.path.kind !== 'free' && !(e.path.kind === 'swoop' && e.t > e.path.dur)) {
      e.vx = (e.x - ox) / dt;
      e.vy = (e.y - oy) / dt;
    }
    const on = e.x > -f.halfW - 0.2 && e.x < f.halfW + 0.2 && e.y < f.halfH - 0.2 && e.y > -f.halfH + 0.2;
    if (on) e.entered = true;
    else if (e.entered || e.t > 14) {
      const m = 2.5;
      if (e.x < -f.halfW - m || e.x > f.halfW + m || e.y < -f.halfH - m || e.y > f.halfH + m + 2) {
        e.gone = true;
        cancelEmitters(S, e);
        continue;
      }
    }
    // firing window: on screen, a little in from the top and above the player
    const canFire = on && !P.dead && e.y < f.halfH - 0.4 && e.y > P.y + 2.2 && !e.leaving && S.phase !== 'cleared';
    S.src = e.type;
    behave(S, e, dt, canFire);

    // contact with the player
    if (!P.dead && P.invuln <= 0) {
      const dx = e.x - P.x;
      const dy = e.y - P.y;
      const rr = e.r * 0.8 + P.r;
      if (dx * dx + dy * dy < rr * rr) {
        if (hurtPlayer(S, e.x, e.y, e.type)) {
          if (e.big || e.type === 'turret') {
            e.hp -= 4;
            e.hitT = 0;
          } else killEnemy(S, e, 'crash');
        }
      }
    }
  }
  let j = 0;
  for (let i = 0; i < list.length; i++) if (!list[i].dead && !list[i].gone) list[j++] = list[i];
  list.length = j;
}

function cd(S, base) {
  return (base * range(S.rng, 0.85, 1.15)) / S.diff.fire;
}

function behave(S, e, dt, canFire) {
  const P = S.player;
  const sec = S.sector;
  switch (e.type) {
    case 'dart': {
      e.angle = Math.atan2(e.vy, e.vx);
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = cd(S, 1.9);
        if (canFire) aimed(S, e.x, e.y - 0.3, 5.4, 'orb', 'magenta', sec >= 2 && e.id % 3 === 0 ? 2 + (sec >= 4) : 1, 0.3);
      }
      break;
    }
    case 'gunship': {
      e.angle = aimAt(S, e.x, e.y);
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = cd(S, 2.4);
        if (canFire) {
          const n = 4 + Math.min(2, sec >> 1);
          if (sec >= 2 && (e.shots = (e.shots || 0) + 1) % 2 === 0) fan(S, e.x, e.y - 0.5, aimAt(S, e.x, e.y), 5, 0.9, 5, 'orb', 'magenta');
          else burst(S, e, { n, interval: 0.1, speed: 9.5, aim: false, ang: aimAt(S, e.x, e.y), oy: -0.5 });
        }
      }
      break;
    }
    case 'diver':
      stepDiver(S, e, dt);
      break;
    case 'bulwark': {
      // the shield turns slowly toward the player, never far from facing down
      if (e.shield) {
        const want = clamp(angDiff(DOWN, aimAt(S, e.x, e.y)), -0.55, 0.55) + DOWN;
        e.shield.angle += clamp(angDiff(e.shield.angle, want), -0.8 * dt, 0.8 * dt);
        e.angle = e.shield.angle;
      }
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = cd(S, 2.8);
        if (canFire) fan(S, e.x, e.y - 0.7, aimAt(S, e.x, e.y), sec >= 5 ? 7 : 5, sec >= 5 ? 1.3 : 1.0, 4.1, 'ball', 'red');
      }
      break;
    }
    case 'minelayer': {
      e.angle = e.path.vx > 0 ? 0 : Math.PI;
      e.fireT -= dt;
      const f = S.field;
      if (e.fireT <= 0) {
        e.fireT = cd(S, 1.35);
        if (e.x > -f.halfW + 0.8 && e.x < f.halfW - 0.8 && e.y < f.halfH - 0.4 && S.phase !== 'cleared') {
          const m = spawnEnemy(S, 'mine', e.x, e.y - 0.5, { kind: 'free' });
          m.vx = range(S.rng, -0.5, 0.5);
          m.vy = -range(S.rng, 1.1, 1.6);
          m.fuse = range(S.rng, 4, 5.2);
        }
      }
      break;
    }
    case 'mine': {
      if (!e.armed && e.t > 0.8) {
        e.armed = true;
        S.events.push({ type: 'telegraph', x: e.x, y: e.y, kind: 'mine', enemy: 'mine', dur: (e.fuse || 4.5) - e.t });
      }
      e.angle += dt * 1.5;
      if (e.t > (e.fuse || 4.5)) killEnemy(S, e, 'fuse');
      break;
    }
    case 'splitter': {
      e.angle += dt * 0.7;
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = cd(S, 2.4);
        if (canFire) aimed(S, e.x, e.y - 0.5, 5, 'orb', 'green', 3, 0.5);
      }
      break;
    }
    case 'sniper': {
      e.fireT -= dt;
      if (!e.tele) e.angle += clamp(angDiff(e.angle, aimAt(S, e.x, e.y)), -2 * dt, 2 * dt);
      else e.angle = Math.atan2(e.tele.y1 - e.tele.y0, e.tele.x1 - e.tele.x0);
      if (e.fireT <= 0) {
        e.fireT = cd(S, 3.6) + 1.3;
        if (canFire) beam(S, e, { tele: 1, lock: 0.62, life: 0.3, width: 0.2, color: 'red', oy: -0.35 });
      }
      break;
    }
    case 'turret': {
      const want = aimAt(S, e.x, e.y);
      e.angle += clamp(angDiff(e.angle, want), -1.8 * dt, 1.8 * dt);
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = cd(S, 2.1);
        if (canFire || (e.y > S.player.y + 0.8 && e.y < S.field.halfH - 0.4)) burst(S, e, { n: 3, interval: 0.12, speed: 8.6, aim: false, ang: e.angle, ox: Math.cos(e.angle) * 0.5, oy: Math.sin(e.angle) * 0.5 });
      }
      break;
    }
  }
}

function stepDiver(S, e, dt) {
  const P = S.player;
  const f = S.field;
  if (e.state === 'in') {
    // the hover path brings it in; once settled, lock on
    e.angle = DOWN;
    if (e.t > (e.path.lockAt || 1.4) && e.y < f.halfH - 0.5 && !P.dead) {
      e.state = 'tele';
      e.st = 0;
      e.lockA = aimAt(S, e.x, e.y);
      e.tele = { x0: e.x, y0: e.y, x1: e.x, y1: e.y, k: 0 };
      S.events.push({ type: 'telegraph', x: e.x, y: e.y, kind: 'diver', enemy: 'diver', id: e.id, dur: 0.6 });
    }
  } else if (e.state === 'tele') {
    if (e.st < 0.35) e.lockA += clamp(angDiff(e.lockA, aimAt(S, e.x, e.y)), -3 * dt, 3 * dt);
    e.angle = e.lockA;
    e.tele.x0 = e.x;
    e.tele.y0 = e.y;
    e.tele.x1 = e.x + Math.cos(e.lockA) * 40;
    e.tele.y1 = e.y + Math.sin(e.lockA) * 40;
    e.tele.k = e.st / 0.6;
    if (e.st >= 0.6) {
      e.state = 'dive';
      e.tele = null;
      const sp = 16.5 * S.diff.speed;
      e.vx = Math.cos(e.lockA) * sp;
      e.vy = Math.sin(e.lockA) * sp;
      e.entered = true;
      S.events.push({ type: 'enemyFire', x: e.x, y: e.y, kind: 'dive', id: e.id, enemy: 'diver', n: 1 });
    }
  }
}

function stepShard(S, e, dt) {
  // fly outward, then steer at the player for a while, then straight on
  if (e.t > 0.45 && e.t < 2 && !S.player.dead) {
    const a = Math.atan2(e.vy, e.vx);
    const na = a + clamp(angDiff(a, aimAt(S, e.x, e.y)), -2.2 * dt, 2.2 * dt);
    const sp = Math.min(7.5 * S.diff.speed, Math.hypot(e.vx, e.vy) + 10 * dt);
    e.vx = Math.cos(na) * sp;
    e.vy = Math.sin(na) * sp;
  } else if (e.t <= 0.45) {
    e.vx *= Math.exp(-2 * dt);
    e.vy *= Math.exp(-2 * dt);
  }
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  e.angle = Math.atan2(e.vy, e.vx);
}

function burstMine(S, e) {
  const n = S.field.halfW < 9 ? 9 : 11;
  S.src = 'mine';
  ring(S, e.x, e.y, n, 3.7, 'orb', 'orange', rnd(S.rng) * TAU);
}

// ------------------------------------------------------------ damage

export function damageEnemy(S, e, dmg) {
  if (e.dead || e.gone) return;
  e.hp -= dmg;
  e.hitT = 0;
  if (e.hp <= 0) killEnemy(S, e, 'shot');
}

export function killEnemy(S, e, how) {
  if (e.dead) return;
  e.dead = true;
  e.tele = null;
  cancelEmitters(S, e);
  let pts = 0;
  // crashes and fuses score nothing; shots, splash and EMP do
  if (how !== 'crash' && how !== 'fuse') {
    pts = scoreKill(S, e.value);
    S.stats.kills++;
    dropLoot(S, e.x, e.y, e.type, e.big);
  }
  S.events.push({ type: 'kill', x: e.x, y: e.y, enemy: e.type, id: e.id, score: pts, chain: S.chain, big: e.big, how });
  if (e.type === 'mine' && e.armed && how !== 'emp') burstMine(S, e);
  if (e.type === 'splitter' && how !== 'emp') {
    const base = rnd(S.rng) * 0.6;
    for (let k = 0; k < 3; k++) {
      const a = DOWN + base + ((k - 1) * TAU) / 3;
      const s = spawnEnemy(S, 'shard', e.x + Math.cos(a) * 0.4, e.y + Math.sin(a) * 0.4, { kind: 'free' });
      s.vx = Math.cos(a) * 6;
      s.vy = Math.sin(a) * 6;
      s.entered = true;
    }
  }
}
