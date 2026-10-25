// The player's fighter: movement inside the lower part of the field, the
// guns (twin cannon, spread, pierce, missiles, wing drones), hull, shield
// and invulnerability, the afterburner dash, and pickups.
//
// Movement: input {x, y} is a target point; the ship flies toward it with a
// speed cap. input {dx, dy} (keyboard axis, -1..1) overrides it. input.slow
// halves the speed (precise dodging). input.dash (edge) dashes with the
// Afterburner upgrade.
import { clamp, range, rnd, chance } from './rng.js';
import { halveChain } from './score.js';

export const HITBOX = 0.16;
export const GRAZE_R = 0.7;
export const BASE_SPEED = 15;
export const SHOT_SPEED = 32;
export const ZONE_TOP = 0.45; // fraction of the field height the player may use

export function zone(S) {
  const f = S.field;
  return {
    x0: -f.halfW + 0.6,
    x1: f.halfW - 0.6,
    y0: -f.halfH + 0.9,
    y1: -f.halfH + f.halfH * 2 * ZONE_TOP,
  };
}

export function createPlayer(S) {
  const f = S.field;
  return {
    x: 0,
    y: -f.halfH + Math.min(3, f.halfH * 0.35),
    vx: 0,
    vy: 0,
    r: HITBOX,
    hull: 3,
    hullMax: 3,
    shield: 1,
    shields: 1,
    charge: 0, // seconds of recharge accumulated toward the next shield charge
    invuln: 0,
    emp: 2,
    drones: [],
    firing: false,
    dead: false,
    dash: 0, // seconds of dash left
    dashCd: 0,
    cannonT: 0,
    spreadT: 0,
    missileT: 0.5,
    droneT: 0,
    side: 1,
  };
}

const lv = (S, id) => S.upgrades[id] || 0;

export function shieldMax(S) {
  return lv(S, 'capacitor') >= 3 ? 2 : 1;
}
export function shieldTime(S) {
  return [6, 4.5, 3.5, 3.5][lv(S, 'capacitor')];
}
export function moveSpeed(S) {
  return BASE_SPEED * (1 + 0.15 * lv(S, 'afterburner'));
}

// keep the drone list in step with the upgrade level
export function syncDrones(S) {
  const P = S.player;
  const n = lv(S, 'drones') > 0 ? 2 : 0;
  while (P.drones.length < n) P.drones.push({ x: P.x, y: P.y, side: P.drones.length ? 1 : -1 });
  P.drones.length = n;
}

let nextShot = 1;
function addShot(S, x, y, ang, speed, kind, dmg, pierce) {
  S.shots.push({ id: nextShot++, x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, kind, dmg, t: 0, pierce, hitId: 0, target: null, r: kind === 'missile' ? 0.3 : 0.16 });
  S.stats.shotsFired++;
  S.stats.shots++;
}

export function stepPlayer(S, input, dt) {
  const P = S.player;
  const Z = zone(S);
  if (P.dead) {
    P.firing = false;
    P.vx = P.vy = 0;
    return;
  }
  P.invuln = Math.max(0, P.invuln - dt);
  P.dashCd = Math.max(0, P.dashCd - dt);

  // movement
  let speed = moveSpeed(S) * (input && input.slow ? 0.5 : 1);
  let wx = 0;
  let wy = 0;
  const ax = (input && input.dx) || 0;
  const ay = (input && input.dy) || 0;
  if (ax || ay) {
    const l = Math.hypot(ax, ay);
    const k = l > 1 ? 1 / l : 1;
    wx = ax * k * speed;
    wy = ay * k * speed;
  } else if (input && input.x != null && input.y != null) {
    const tx = clamp(input.x, Z.x0, Z.x1);
    const ty = clamp(input.y, Z.y0, Z.y1);
    wx = (tx - P.x) * 14;
    wy = (ty - P.y) * 14;
    const l = Math.hypot(wx, wy);
    if (l > speed) {
      wx *= speed / l;
      wy *= speed / l;
    }
  }
  const ab = lv(S, 'afterburner');
  if (input && input.dash && ab > 0 && P.dashCd <= 0) {
    P.dash = 0.2;
    P.dashCd = [0, 3, 2.2, 1.5][ab];
    P.invuln = Math.max(P.invuln, 0.24);
    S.events.push({ type: 'dash', x: P.x, y: P.y });
  }
  if (P.dash > 0) {
    P.dash -= dt;
    const l = Math.hypot(wx, wy);
    if (l > 0.5) {
      wx *= (speed * 2.6) / l;
      wy *= (speed * 2.6) / l;
    } else {
      wx = 0;
      wy = speed * 2.6;
    }
  }
  const blend = 1 - Math.exp(-28 * dt);
  P.vx += (wx - P.vx) * blend;
  P.vy += (wy - P.vy) * blend;
  P.x = clamp(P.x + P.vx * dt, Z.x0, Z.x1);
  P.y = clamp(P.y + P.vy * dt, Z.y0, Z.y1);

  // shield recharge
  const smax = shieldMax(S);
  const st = shieldTime(S);
  if (P.shields < smax) {
    P.charge += dt;
    if (P.charge >= st) {
      P.charge = 0;
      P.shields++;
      S.events.push({ type: 'shieldUp', x: P.x, y: P.y });
    }
    P.shield = P.shields >= smax ? 1 : P.charge / st;
  } else {
    P.charge = 0;
    P.shield = 1;
  }

  // drones trail the wings
  for (const d of P.drones) {
    const k = 1 - Math.exp(-10 * dt);
    d.x += (P.x + d.side * 1.15 - d.x) * k;
    d.y += (P.y - 0.3 - d.y) * k;
  }

  P.firing = !!(input && input.fire) && (S.phase === 'wave' || S.phase === 'boss' || S.phase === 'intro' || S.phase === 'cleared');
  if (P.firing) fire(S, dt);
}

function fire(S, dt) {
  const P = S.player;
  const od = lv(S, 'overdrive');
  const pierce = lv(S, 'pierce');
  const rate = 10 * (1 + 0.2 * od);
  P.cannonT -= dt;
  if (P.cannonT <= 0) {
    P.cannonT += 1 / rate;
    if (P.cannonT < 0) P.cannonT = 0;
    const kind = pierce ? 'pierce' : 'cannon';
    const dmg = 1 * (1 + 0.15 * Math.max(0, pierce - 1));
    addShot(S, P.x - 0.22, P.y + 0.55, Math.PI / 2, SHOT_SPEED, kind, dmg, pierce);
    addShot(S, P.x + 0.22, P.y + 0.55, Math.PI / 2, SHOT_SPEED, kind, dmg, pierce);
    // spread guns fire every other volley
    const sp = lv(S, 'spread');
    if (sp && (P.spreadT ^= 1)) {
      const dmgS = sp >= 3 ? 0.8 : 0.55;
      const angs = sp >= 2 ? [0.12, 0.25] : [0.13];
      for (const a of angs) {
        addShot(S, P.x - 0.35, P.y + 0.4, Math.PI / 2 + a, SHOT_SPEED * 0.92, 'spread', dmgS, 0);
        addShot(S, P.x + 0.35, P.y + 0.4, Math.PI / 2 - a, SHOT_SPEED * 0.92, 'spread', dmgS, 0);
      }
      S.events.push({ type: 'fire', x: P.x, y: P.y + 0.5, kind: 'spread' });
    }
    S.events.push({ type: 'fire', x: P.x, y: P.y + 0.6, kind });
  }
  const ml = lv(S, 'missiles');
  if (ml) {
    P.missileT -= dt;
    if (P.missileT <= 0) {
      P.missileT += [0, 1, 0.75, 0.75][ml];
      const n = ml >= 3 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        P.side = -P.side;
        addShot(S, P.x + P.side * 0.45, P.y + 0.1, Math.PI / 2 + P.side * 0.6, 12, 'missile', 5, 0);
      }
      S.events.push({ type: 'fire', x: P.x, y: P.y, kind: 'missile' });
    }
  }
  const dl = lv(S, 'drones');
  if (dl && P.drones.length) {
    P.droneT -= dt;
    if (P.droneT <= 0) {
      P.droneT += 1 / [0, 4.5, 6, 6][dl];
      for (const d of P.drones) {
        let a = Math.PI / 2;
        if (dl >= 3) {
          const t = nearestEnemy(S, d.x, d.y, 0.9);
          if (t) a = Math.atan2(t.y - d.y, t.x - d.x);
        }
        addShot(S, d.x, d.y + 0.3, a, SHOT_SPEED * 0.9, 'drone', dl >= 2 ? 0.8 : 0.6, 0);
      }
      S.events.push({ type: 'fire', x: P.x, y: P.y + 0.3, kind: 'drone' });
    }
  }
}

// nearest live target above (x, y) within a cone of half-angle cone (rad);
// enemies and vulnerable boss parts both count
export function nearestEnemy(S, x, y, cone = Math.PI) {
  let best = null;
  let bd = Infinity;
  const f = S.field;
  for (const e of S.enemies) {
    if (e.hp <= 0 || e.y > f.halfH + 0.3 || e.y < -f.halfH || Math.abs(e.x) > f.halfW + 0.3) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    if (Math.abs(Math.atan2(dx, dy)) > cone) continue;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  const B = S.boss;
  if (B && !B.entering) {
    for (const p of B.parts) {
      if (p.dead || !p.vuln) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      if (Math.abs(Math.atan2(dx, dy)) > cone) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
  }
  return best;
}

// a hit on the player from (x, y); returns true if it landed (shield or hull)
export function hurtPlayer(S, x, y, cause) {
  const P = S.player;
  if (P.dead || P.invuln > 0 || S.phase === 'cleared') return false;
  if (S.god) {
    S.events.push({ type: 'shieldHit', x: P.x, y: P.y, cause, god: true });
    P.invuln = 0.3;
    return true;
  }
  P.charge = 0;
  if (P.shields > 0) {
    P.shields--;
    P.shield = 0;
    P.invuln = 0.6;
    S.stats.shieldHits++;
    S.waveHit = true;
    S.events.push({ type: 'shieldHit', x: P.x, y: P.y, cause });
    return true;
  }
  P.hull--;
  P.invuln = 1.5;
  S.stats.hits++;
  S.waveHit = true;
  halveChain(S);
  S.events.push({ type: 'playerHit', x: P.x, y: P.y, cause, hull: P.hull });
  if (P.hull <= 0) {
    P.dead = true;
    P.firing = false;
    S.phase = 'dead';
    S.result = { win: false, score: S.score, rank: S.rank, time: S.stats.time, wave: S.wave, sector: S.sector };
    S.events.push({ type: 'dead', x: P.x, y: P.y });
  }
  return true;
}

// ------------------------------------------------------------ pickups

let nextPickup = 1;
export function dropPickup(S, x, y, kind) {
  if (S.pickups.length > 80) return;
  const r = S.rng;
  S.pickups.push({ id: nextPickup++, x, y, kind, t: 0, vx: range(r, -2.5, 2.5), vy: range(r, 1, 3.2) });
}

// loot table for a kill
export function dropLoot(S, x, y, type, big) {
  const r = S.rng;
  if (big) {
    const n = 2 + Math.floor(rnd(r) * 2);
    for (let i = 0; i < n; i++) dropPickup(S, x, y, 'score');
    const roll = rnd(r);
    if (roll < 0.022) dropPickup(S, x, y, 'hull');
    else if (roll < 0.05) dropPickup(S, x, y, 'emp');
    else if (roll < 0.12) dropPickup(S, x, y, 'shield');
  } else if (chance(r, type === 'mine' || type === 'shard' ? 0.1 : 0.3)) dropPickup(S, x, y, 'score');
}

export function stepPickups(S, dt) {
  const P = S.player;
  const f = S.field;
  const mag = [0, 3, 5, 8][lv(S, 'magnet')];
  const list = S.pickups;
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    p.t += dt;
    const dx = P.x - p.x;
    const dy = P.y - p.y;
    const d = Math.hypot(dx, dy);
    if (!P.dead && (S.vacuum || d < mag)) {
      const sp = S.vacuum ? 22 : 13;
      p.vx = (dx / (d || 1)) * sp;
      p.vy = (dy / (d || 1)) * sp;
    } else {
      p.vx *= Math.exp(-2.5 * dt);
      p.vy += (-1.8 - p.vy) * (1 - Math.exp(-2 * dt));
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (!P.dead && d < 1.05) {
      collect(S, p);
      continue;
    }
    if (p.y < -f.halfH - 1 || p.t > 20) continue;
    list[j++] = p;
  }
  list.length = j;
}

function collect(S, p) {
  const P = S.player;
  let value = 0;
  if (p.kind === 'score') value = 150;
  else if (p.kind === 'shield') {
    if (P.shields < shieldMax(S)) {
      P.shields++;
      P.shield = P.shields >= shieldMax(S) ? 1 : 0;
      P.charge = 0;
    } else value = 500;
  } else if (p.kind === 'emp') {
    if (P.emp < 9) P.emp++;
    else value = 500;
  } else if (p.kind === 'hull') {
    if (P.hull < P.hullMax) P.hull++;
    else value = 1000;
  }
  S.score += value;
  S.events.push({ type: 'pickup', x: p.x, y: p.y, kind: p.kind, score: value });
}
