// Enemy archetypes. Each kind is a small explicit state machine (e.state + e.st seconds in state) with a
// readable warning before every attack: a telegraph shape on the ground plus an audio cue, always at least
// ~0.4 s before damage. Damage comes from hazards, projectiles or a lunge/charge body check.
import { TILE } from '../config';
import { angleDiff, clamp } from '../core/math';
import type { Enemy, EnemyKind } from './types';
import type { World } from './world';
import { damagePlayer } from './combat';

export interface EnemyDef { hp: number; r: number; speed: number; mass: number; superArmor: boolean }
export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  stalker: { hp: 26, r: 7, speed: 64, mass: 1, superArmor: false },
  sentinel: { hp: 30, r: 6, speed: 42, mass: 1.2, superArmor: false },
  charger: { hp: 58, r: 10, speed: 44, mass: 2.4, superArmor: false },
  warden: { hp: 36, r: 6, speed: 46, mass: 1, superArmor: false },
  colossus: { hp: 180, r: 16, speed: 25, mass: 6, superArmor: true },
  boss: { hp: 2600, r: 26, speed: 0, mass: 99, superArmor: true },
  dummy: { hp: 99999, r: 7, speed: 0, mass: 99, superArmor: true },
};

const go = (e: Enemy, s: string) => { e.state = s; e.st = 0; };

/** Steer toward a point; uses line of sight, else the flow field toward the player. */
function steer(w: World, e: Enemy, tx: number, ty: number, speed: number, dt: number, towardPlayer = true) {
  let dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) { e.vx *= 0.8; e.vy *= 0.8; return; }
  dx /= d; dy /= d;
  if (towardPlayer && !w.grid.lineOfSight(e.x, e.y, tx, ty, true)) {
    const f = w.grid.flowDir(e.x, e.y);
    if (f) { dx = f.x; dy = f.y; }
  }
  const a = clamp(dt * 8, 0, 1);
  e.vx += (dx * speed - e.vx) * a;
  e.vy += (dy * speed - e.vy) * a;
}

/** Move away from a point, sliding along walls, preferring open space. */
function flee(w: World, e: Enemy, fx: number, fy: number, speed: number, dt: number) {
  let best = 0, bestScore = -Infinity;
  const base = Math.atan2(e.y - fy, e.x - fx);
  for (let i = -3; i <= 3; i++) {
    const a = base + i * 0.4;
    const free = w.grid.rayLength(e.x, e.y, a, 60, true);
    const score = free - Math.abs(i) * 6;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  const a = clamp(dt * 6, 0, 1);
  e.vx += (Math.cos(best) * speed - e.vx) * a;
  e.vy += (Math.sin(best) * speed - e.vy) * a;
}

const stop = (e: Enemy, dt: number, k = 10) => { const f = Math.exp(-k * dt); e.vx *= f; e.vy *= f; };
const faceTo = (e: Enemy, x: number, y: number, rate: number, dt: number) => {
  e.face += clamp(angleDiff(e.face, Math.atan2(y - e.y, x - e.x)), -rate * dt, rate * dt);
};

export function updateEnemy(w: World, e: Enemy, dt: number) {
  const p = w.player;
  const pd = Math.hypot(p.x - e.x, p.y - e.y);
  const alive = p.state !== 'dead';
  e.cd = Math.max(0, e.cd - dt);
  if (e.stun > 0) {
    e.stun -= dt;
    stop(e, dt, 6);
    if (e.stun <= 0 && e.state === 'stunned') go(e, 'idle');
    // Stun interrupts windups (and removes their warning).
    if (e.state !== 'stunned' && e.state !== 'dead' && e.kind !== 'colossus') { w.removeTelegraphsOf(e); go(e, 'stunned'); }
    return;
  }
  const flinch = e.flash > 0 && !e.superArmor ? 0.35 : 1;
  switch (e.kind) {
    case 'dummy': stop(e, dt); return;
    case 'stalker': return stalker(w, e, dt, pd, alive, flinch);
    case 'sentinel': return sentinel(w, e, dt, pd, alive, flinch);
    case 'charger': return charger(w, e, dt, pd, alive, flinch);
    case 'warden': return warden(w, e, dt, pd, alive, flinch);
    case 'colossus': return colossus(w, e, dt, pd, alive);
    case 'boss': return w.updateBoss(e, dt);
  }
}

// --- Hollow Stalker: a lanky shadow that hunts you down and lunges. -----------------------------
function stalker(w: World, e: Enemy, dt: number, pd: number, alive: boolean, flinch: number) {
  const p = w.player;
  const spd = ENEMY_DEFS.stalker.speed * (e.elite ? 1.2 : 1);
  switch (e.state) {
    case 'idle': case 'stunned': go(e, 'chase'); break;
    case 'chase': {
      if (!alive) { stop(e, dt); break; }
      // Each stalker approaches from its own angle so a pack surrounds rather than queues.
      const off = ((e.id * 2.39996) % (Math.PI * 2));
      const ring = pd > 60 ? 0 : 20;
      const tx = p.x + Math.cos(off) * ring, ty = p.y + Math.sin(off) * ring;
      steer(w, e, tx, ty, spd * flinch, dt);
      faceTo(e, p.x, p.y, 10, dt);
      if (pd < 34 && e.cd <= 0 && w.grid.lineOfSight(e.x, e.y, p.x, p.y, true) && w.attackSlot(e)) {
        go(e, 'windup');
        e.tele = w.addTelegraph({ kind: 'cone', x: e.x, y: e.y, r: 40, ang: e.face, len: 0.55, dur: e.elite ? 0.42 : 0.56, boss: false });
        w.cue(e, 'enemyWindup');
      }
      break;
    }
    case 'windup': {
      const dur = e.elite ? 0.42 : 0.56;
      stop(e, dt);
      if (e.st < dur - 0.12) faceTo(e, p.x, p.y, 7, dt);
      w.moveTelegraph(e.tele, e.x, e.y, e.face);
      if (e.st >= dur) {
        w.removeTelegraph(e.tele);
        e.tele = 0;
        go(e, 'lunge');
        e.aux = 0; // hit latch
        w.cue(e, 'enemyLunge');
      }
      break;
    }
    case 'lunge': {
      e.vx = Math.cos(e.face) * 235;
      e.vy = Math.sin(e.face) * 235;
      if (!e.aux && Math.hypot(p.x - e.x, p.y - e.y) < e.r + 9) {
        e.aux = 1;
        damagePlayer(w, 1, e.x, e.y, 140);
      }
      if (e.st >= 0.15) go(e, 'recover');
      break;
    }
    case 'recover': {
      stop(e, dt, 7);
      if (e.st >= 0.6) { e.cd = 0.6 + w.rng.next() * 0.6; go(e, 'chase'); }
      break;
    }
    default: go(e, 'chase');
  }
}

// --- Gloom Sentinel: a robed caster that keeps its distance and fires aimed orb volleys. ---------
function sentinel(w: World, e: Enemy, dt: number, pd: number, alive: boolean, flinch: number) {
  const p = w.player;
  const spd = ENEMY_DEFS.sentinel.speed;
  switch (e.state) {
    case 'idle': case 'stunned': go(e, 'keep'); e.aux2 = w.rng.chance(0.5) ? 1 : -1; break;
    case 'keep': {
      faceTo(e, p.x, p.y, 6, dt);
      if (!alive) { stop(e, dt); break; }
      const los = w.grid.lineOfSight(e.x, e.y - 8, p.x, p.y - 6);
      if (pd < 80) flee(w, e, p.x, p.y, spd * 1.3 * flinch, dt);
      else if (pd > 170 || !los) steer(w, e, p.x, p.y, spd * flinch, dt);
      else {
        // Strafe around the player, switching direction now and then or when blocked.
        const a = Math.atan2(e.y - p.y, e.x - p.x) + e.aux2 * 0.9;
        const tx = p.x + Math.cos(a) * 125, ty = p.y + Math.sin(a) * 125;
        if (!w.grid.walkableAt(tx, ty) || w.rng.chance(dt * 0.3)) e.aux2 *= -1;
        steer(w, e, tx, ty, spd * 0.7 * flinch, dt, false);
      }
      if (e.cd <= 0 && los && pd < 220 && w.attackSlot(e)) {
        go(e, 'aim');
        e.tele = w.addTelegraph({ kind: 'line', x: e.x, y: e.y - 8, r: 3, ang: e.face, len: Math.min(220, w.grid.rayLength(e.x, e.y - 8, e.face, 220)), dur: 0.8, boss: false });
        w.cue(e, 'enemyWindup');
      }
      break;
    }
    case 'aim': {
      stop(e, dt);
      if (e.st < 0.62) faceTo(e, p.x, p.y - 4, 5, dt);
      w.moveTelegraph(e.tele, e.x, e.y - 8, e.face, w.grid.rayLength(e.x, e.y - 8, e.face, 220));
      if (e.st >= 0.8) { w.removeTelegraph(e.tele); e.tele = 0; go(e, 'fire'); e.aux = 0; }
      break;
    }
    case 'fire': {
      stop(e, dt);
      const shots = e.elite ? 4 : 3;
      while (e.aux < shots && e.st >= e.aux * 0.13) {
        const a = e.face + (e.aux - (shots - 1) / 2) * 0.09;
        w.spawnProjectile({ x: e.x + Math.cos(a) * 8, y: e.y - 8 + Math.sin(a) * 8, vx: Math.cos(a) * 98, vy: Math.sin(a) * 98, r: 3.5, team: 'enemy', dmg: 1, life: 2.6, pierce: 0, kind: 'orb', homing: 0 });
        w.emit({ type: 'shot', x: e.x, y: e.y - 8, ang: a, team: 'enemy', kind: 'orb' });
        e.aux++;
      }
      if (e.st >= shots * 0.13 + 0.45) { e.cd = 1.9 + w.rng.next() * 0.9; go(e, 'keep'); }
      break;
    }
    default: go(e, 'keep');
  }
}

// --- Bastion Beetle: plants, shows its lane, then charges; stunned and exposed if it hits a wall. --
function charger(w: World, e: Enemy, dt: number, pd: number, alive: boolean, flinch: number) {
  const p = w.player;
  switch (e.state) {
    case 'idle': go(e, 'approach'); break;
    case 'stunned': e.vulnerable = 1; go(e, 'approach'); break;
    case 'approach': {
      e.vulnerable = 1;
      if (!alive) { stop(e, dt); break; }
      faceTo(e, p.x, p.y, 3.5, dt);
      steer(w, e, p.x, p.y, ENEMY_DEFS.charger.speed * flinch, dt);
      if (e.cd <= 0 && pd < 170 && pd > 34 && w.grid.lineOfSight(e.x, e.y, p.x, p.y, true) && w.attackSlot(e)) {
        go(e, 'plant');
        const len = Math.min(230, w.grid.rayLength(e.x, e.y, e.face, 230, true));
        e.tele = w.addTelegraph({ kind: 'lane', x: e.x, y: e.y, r: 18, ang: e.face, len, dur: 0.9, boss: false });
        w.cue(e, 'chargeWindup');
      }
      break;
    }
    case 'plant': {
      stop(e, dt);
      if (e.st < 0.62) faceTo(e, p.x, p.y, 2.6, dt);
      const len = Math.min(230, w.grid.rayLength(e.x, e.y, e.face, 230, true));
      w.moveTelegraph(e.tele, e.x, e.y, e.face, len);
      if (e.st >= 0.9) {
        w.removeTelegraph(e.tele); e.tele = 0;
        e.tx = e.x; e.ty = e.y; e.aux = 0;
        go(e, 'charge');
      }
      break;
    }
    case 'charge': {
      const sp = e.elite ? 290 : 255;
      e.vx = Math.cos(e.face) * sp; e.vy = Math.sin(e.face) * sp;
      if (!e.aux && Math.hypot(p.x - e.x, p.y - e.y) < e.r + 8) {
        e.aux = 1;
        damagePlayer(w, 2, e.x, e.y, 230);
      }
      // A wall ahead: crash.
      const ahead = w.grid.rayLength(e.x, e.y, e.face, e.r + 4, true) < e.r + 3;
      if (ahead) {
        go(e, 'crashed');
        e.vx = -Math.cos(e.face) * 60; e.vy = -Math.sin(e.face) * 60;
        e.vulnerable = 1.6;
        w.emit({ type: 'wallBonk', x: e.x + Math.cos(e.face) * e.r, y: e.y + Math.sin(e.face) * e.r });
        w.shake(2.5, 0.2);
      } else if (Math.hypot(e.x - e.tx, e.y - e.ty) > 235 || e.st > 1.2) go(e, 'skid');
      break;
    }
    case 'skid': {
      stop(e, dt, 5);
      if (e.st > 0.55) { e.cd = 1.6 + w.rng.next(); go(e, 'approach'); }
      break;
    }
    case 'crashed': {
      stop(e, dt, 4);
      if (e.st > 1.7) { e.vulnerable = 1; e.cd = 1.2; go(e, 'approach'); }
      break;
    }
    default: go(e, 'approach');
  }
}

// --- Moss Warden: a support caster that wards its allies with bark shields and blinks away. -------
function warden(w: World, e: Enemy, dt: number, pd: number, alive: boolean, flinch: number) {
  const p = w.player;
  const spd = ENEMY_DEFS.warden.speed;
  switch (e.state) {
    case 'idle': case 'stunned': go(e, 'drift'); break;
    case 'drift': {
      faceTo(e, p.x, p.y, 5, dt);
      // Stay near allies, away from the player.
      let cx = 0, cy = 0, n = 0;
      for (const o of w.enemies) if (!o.dead && o !== e && o.kind !== 'warden' && o.spawnT <= 0) { cx += o.x; cy += o.y; n++; }
      if (pd < 85 && alive) flee(w, e, p.x, p.y, spd * 1.35 * flinch, dt);
      else if (n) steer(w, e, cx / n + (e.x - p.x) * 0.25, cy / n + (e.y - p.y) * 0.25, spd * 0.8 * flinch, dt, false);
      else if (pd < 140) flee(w, e, p.x, p.y, spd * flinch, dt);
      else stop(e, dt, 3);
      // Blink away when cornered.
      if (alive && pd < 46 && e.aux2 <= 0) blinkAway(w, e);
      e.aux2 = Math.max(0, e.aux2 - dt);
      if (e.cd <= 0) {
        const targets = wardTargets(w, e);
        if (targets.length) {
          go(e, 'channel');
          w.cue(e, 'enemyWindup');
        } else if (alive && pd < 200 && w.grid.lineOfSight(e.x, e.y - 8, p.x, p.y - 6) && w.attackSlot(e)) {
          // Nobody to protect: lob a slow seed.
          const a = Math.atan2(p.y - 6 - (e.y - 8), p.x - e.x);
          w.spawnProjectile({ x: e.x, y: e.y - 8, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, r: 3.5, team: 'enemy', dmg: 1, life: 3, pierce: 0, kind: 'orb', homing: 0.6 });
          w.emit({ type: 'shot', x: e.x, y: e.y - 8, ang: a, team: 'enemy', kind: 'orb' });
          e.cd = 2.6;
        }
      }
      break;
    }
    case 'channel': {
      stop(e, dt);
      if (pd < 40 && e.aux2 <= 0) { blinkAway(w, e); go(e, 'drift'); break; }
      if (e.st >= 0.9) {
        for (const t of wardTargets(w, e)) {
          const hp = e.elite ? 30 : 20;
          t.shield = { hp, max: hp, t: 9 };
          w.emit({ type: 'shieldUp', id: t.id });
        }
        e.cd = 5 + w.rng.next() * 1.5;
        go(e, 'drift');
      }
      break;
    }
    default: go(e, 'drift');
  }
}

/** Allies the warden is about to shield (also read by the view to draw tethers). */
export function wardTargets(w: World, e: Enemy): Enemy[] {
  const list = w.enemies.filter((o) => !o.dead && o !== e && o.kind !== 'warden' && o.kind !== 'boss' && o.spawnT <= 0 && !o.shield && Math.hypot(o.x - e.x, o.y - e.y) < 130);
  list.sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y));
  return list.slice(0, 3);
}

function blinkAway(w: World, e: Enemy) {
  const p = w.player;
  for (let tries = 0; tries < 24; tries++) {
    const a = w.rng.next() * Math.PI * 2, d = 100 + w.rng.next() * 60;
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (!w.isOpenSpot(x, y, e.r + 2)) continue;
    w.emit({ type: 'enemyCue', id: e.id, cue: 'blink', x: e.x, y: e.y });
    e.x = e.px = x; e.y = e.py = y; e.vx = e.vy = 0;
    w.emit({ type: 'enemyCue', id: e.id, cue: 'blinkIn', x, y });
    e.aux2 = 4;
    return;
  }
}

// --- Husk Colossus: slow and unstoppable; slams leave burning ground, stomps send a shockline. ----
function colossus(w: World, e: Enemy, dt: number, pd: number, alive: boolean) {
  const p = w.player;
  switch (e.state) {
    case 'idle': case 'stunned': go(e, 'walk'); break;
    case 'walk': {
      if (!alive) { stop(e, dt); break; }
      faceTo(e, p.x, p.y, 2.2, dt);
      steer(w, e, p.x, p.y, ENEMY_DEFS.colossus.speed, dt);
      if (e.cd <= 0 && w.attackSlot(e)) {
        if (pd < 62) {
          go(e, 'slamWind');
          e.tx = e.x + Math.cos(e.face) * 20; e.ty = e.y + Math.sin(e.face) * 20;
          e.tele = w.addTelegraph({ kind: 'circle', x: e.tx, y: e.ty, r: 46, ang: 0, len: 0, dur: 1.0, boss: false });
          w.cue(e, 'slamWindup');
        } else if (pd < 190 && w.grid.lineOfSight(e.x, e.y, p.x, p.y, true)) {
          go(e, 'stompWind');
          e.tx = Math.atan2(p.y - e.y, p.x - e.x);
          e.tele = w.addTelegraph({ kind: 'lane', x: e.x, y: e.y, r: 22, ang: e.tx, len: Math.min(190, w.grid.rayLength(e.x, e.y, e.tx, 190, true)), dur: 0.95, boss: false });
          w.cue(e, 'slamWindup');
        }
      }
      break;
    }
    case 'slamWind': {
      stop(e, dt);
      if (e.st >= 1.0) {
        w.removeTelegraph(e.tele); e.tele = 0;
        w.addHazard({ kind: 'slam', team: 'enemy', x: e.tx, y: e.ty, r: 46, t: 0, dur: 0.12, delay: 0, dmg: 2, tick: 0 });
        w.addHazard({ kind: 'pool', team: 'enemy', x: e.tx, y: e.ty, r: 30, t: 0, dur: 3.6, delay: 0.25, dmg: 1, tick: 0.9 });
        w.emit({ type: 'slam', x: e.tx, y: e.ty, r: 46 });
        w.shake(4, 0.3);
        go(e, 'recover');
      }
      break;
    }
    case 'stompWind': {
      stop(e, dt);
      if (e.st >= 0.95) {
        w.removeTelegraph(e.tele); e.tele = 0;
        const len = Math.min(190, w.grid.rayLength(e.x, e.y, e.tx, 190, true));
        for (let d = 16, i = 0; d <= len; d += 20, i++) {
          w.addHazard({ kind: 'wave', team: 'enemy', x: e.x + Math.cos(e.tx) * d, y: e.y + Math.sin(e.tx) * d, r: 13, t: 0, dur: 0.18, delay: i * 0.055, dmg: 1, tick: 0 });
        }
        w.emit({ type: 'slam', x: e.x, y: e.y, r: 20 });
        w.shake(2.5, 0.2);
        go(e, 'recover');
      }
      break;
    }
    case 'recover': {
      stop(e, dt);
      if (e.st >= 1.0) { e.cd = 1.4 + w.rng.next() * 0.8; go(e, 'walk'); }
      break;
    }
    default: go(e, 'walk');
  }
}

/** Contact damage is off for every enemy: only telegraphed attacks hurt. Kept as a hook for tuning. */
export const touchesHurt = false;
export const tileOf = (x: number) => Math.floor(x / TILE);
