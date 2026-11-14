// The lantern keeper: movement, dash, the two weapons, Sunburst and interaction. A small state machine:
// normal -> attack (windup/active/recovery) | dash | cast, and dead. Timers are in seconds, scaled by dt.
import { PLAYER, WEAPONS, TILE } from '../config';
import { angleDiff, clamp } from '../core/math';
import type { Enemy, InputFrame, Player, WeaponId } from './types';
import type { World } from './world';
import { damageEnemy, sunburst } from './combat';

export function makePlayer(x: number, y: number, weapon: WeaponId): Player {
  return {
    x, y, px: x, py: y, vx: 0, vy: 0, r: PLAYER.radius,
    hp: PLAYER.baseHp, maxHp: PLAYER.baseHp, state: 'normal', st: 0, aim: -Math.PI / 2, facing: Math.PI / 2,
    moving: false, weapon, combo: 0, phase: 'windup', phaseT: 0, swingAim: 0, swingHit: new Set(),
    comboWindow: 0, attackBuffer: 0, fireCd: 0, shotCount: 0, dashCharges: 1, dashRecharge: 0,
    dashDirX: 0, dashDirY: 1, dashIframes: 0, dashDodged: false, iframes: 0, kx: 0, ky: 0, radiance: 0,
    empowered: 0, hurtFlash: 0, stepDist: 0, deniedT: 0, deniedWhat: '', reviveUsed: false, castFired: false, trailT: 0,
  };
}

const setState = (p: Player, s: Player['state']) => { p.state = s; p.st = 0; };

export function dashCooldown(w: World) { return PLAYER.dashCooldown * w.run.stats.dashCdMul; }
export function sunburstCost(w: World) { return Math.round(PLAYER.radianceMax * w.run.stats.flareCostMul); }

function deny(w: World, what: string) {
  const p = w.player;
  if (p.deniedT > 0.15 && p.deniedWhat === what) return;
  p.deniedT = 0.6;
  p.deniedWhat = what;
  w.emit({ type: 'deny', what });
}

/** Best target for aim assist: an enemy near the aim direction within reach. */
function assistAim(w: World, p: Player, raw: number): number {
  let best: Enemy | null = null, bestScore = Infinity;
  for (const e of w.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > 170) continue;
    const da = Math.abs(angleDiff(raw, Math.atan2(e.y - p.y, e.x - p.x)));
    if (da > 0.55) continue;
    const score = da * 120 + d;
    if (score < bestScore && w.grid.lineOfSight(p.x, p.y - 4, e.x, e.y - 4)) { bestScore = score; best = e; }
  }
  return best ? Math.atan2(best.y - 4 - (p.y - 6), best.x - p.x) : raw;
}

export function updatePlayer(w: World, inp: InputFrame, dt: number) {
  const p = w.player;
  const s = w.run.stats;
  p.st += dt;
  p.deniedT = Math.max(0, p.deniedT - dt);
  p.iframes = Math.max(0, p.iframes - dt);
  p.dashIframes = Math.max(0, p.dashIframes - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.empowered = Math.max(0, p.empowered - dt);
  p.attackBuffer = Math.max(0, p.attackBuffer - dt);
  p.comboWindow = Math.max(0, p.comboWindow - dt);
  p.fireCd = Math.max(0, p.fireCd - dt);

  // Dash charges recharge one at a time.
  const maxCharges = s.dashCharges;
  if (p.dashCharges < maxCharges) {
    p.dashRecharge -= dt;
    if (p.dashRecharge <= 0) {
      p.dashCharges++;
      p.dashRecharge = p.dashCharges < maxCharges ? dashCooldown(w) : 0;
      w.emit({ type: 'dashReady' });
    }
  } else if (p.dashCharges > maxCharges) p.dashCharges = maxCharges;

  if (p.state === 'dead') {
    p.vx *= 0.9; p.vy *= 0.9;
    return;
  }

  // Aim from the mouse (aim point is relative to the lantern height above the feet).
  let aim = Math.atan2(inp.aimY - (p.y - 8), inp.aimX - p.x);
  if (!Number.isFinite(aim)) aim = p.aim;
  if (inp.aimAssist) aim = assistAim(w, p, aim);
  p.aim = aim;

  let mx = inp.moveX, my = inp.moveY;
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  const moving = ml > 0.1;

  if (inp.attackPressed) p.attackBuffer = 0.22;

  // Dash: from normal, or cancelling attack recovery.
  if (inp.dashPressed && p.state !== 'dash' && p.state !== 'cast') {
    const canCancel = p.state === 'normal' || (p.state === 'attack' && p.phase === 'recovery');
    if (canCancel) {
      if (p.dashCharges > 0) {
        startDash(w, p, moving ? mx : Math.cos(p.aim), moving ? my : Math.sin(p.aim));
      } else deny(w, 'dash');
    }
  }

  // Sunburst.
  if (inp.specialPressed && (p.state === 'normal' || (p.state === 'attack' && p.phase === 'recovery'))) {
    if (p.radiance >= sunburstCost(w)) {
      p.radiance -= sunburstCost(w);
      setState(p, 'cast');
      w.emit({ type: 'castStart', x: p.x, y: p.y });
    } else deny(w, 'light');
  }

  let speedMul = s.moveMul * (w.grid.isShallow(p.x, p.y) ? 0.82 : 1);

  switch (p.state) {
    case 'normal': {
      if (p.weapon === 'lantern') {
        // A press (buffered) or holding the button starts or continues the combo.
        if (p.attackBuffer > 0 || inp.attack) startSwing(w, p);
      } else {
        if ((inp.attack || p.attackBuffer > 0) && p.fireCd <= 0) fireBolt(w, p);
        if (inp.attack) speedMul *= 0.78;
      }
      break;
    }
    case 'attack': {
      speedMul *= p.phase === 'active' ? 0.25 : 0.4;
      updateSwing(w, p, dt, inp);
      break;
    }
    case 'dash': {
      const t = PLAYER.dashTime;
      p.vx = p.dashDirX * PLAYER.dashSpeed;
      p.vy = p.dashDirY * PLAYER.dashSpeed;
      if (s.trail && p.st - p.trailT >= 0.03) {
        p.trailT = p.st;
        w.addHazard({ kind: 'fire', team: 'player', x: p.x, y: p.y, r: 9, t: 0, dur: 1.6, delay: 0, dmg: 4, tick: 0.35 });
      }
      if (p.st >= t) {
        setState(p, 'normal');
        p.vx *= 0.35; p.vy *= 0.35;
      }
      break;
    }
    case 'cast': {
      p.vx *= 0.8; p.vy *= 0.8;
      if (p.st >= 0.2 && !p.castFired) {
        p.castFired = true;
        sunburst(w, p.x, p.y - 6, false);
      }
      if (p.st >= 0.36) { p.castFired = false; setState(p, 'normal'); }
      break;
    }
  }

  // Facing for the sprite: aim while attacking, otherwise movement.
  if (p.state === 'attack' || (p.weapon === 'sunlance' && inp.attack)) p.facing = p.state === 'attack' ? p.swingAim : p.aim;
  else if (moving && p.state !== 'dash') p.facing = Math.atan2(my, mx);

  // Movement (not while dashing or casting).
  if (p.state === 'normal' || p.state === 'attack') {
    const tvx = mx * PLAYER.speed * speedMul, tvy = my * PLAYER.speed * speedMul;
    const a = (moving ? PLAYER.accel : PLAYER.friction) * dt;
    p.vx += clamp(tvx - p.vx, -a, a);
    p.vy += clamp(tvy - p.vy, -a, a);
  }
  p.moving = moving && (p.state === 'normal' || p.state === 'attack');

  // Knockback decays quickly.
  const kd = Math.exp(-10 * dt);
  p.kx *= kd; p.ky *= kd;

  const ox = p.x, oy = p.y;
  p.x += (p.vx + p.kx) * dt;
  p.y += (p.vy + p.ky) * dt;
  w.grid.collideCircle(p, p.r);
  const moved = Math.hypot(p.x - ox, p.y - oy);
  if (p.state === 'normal' || p.state === 'attack') {
    const before = Math.floor(p.stepDist / 13);
    p.stepDist += moved;
    if (Math.floor(p.stepDist / 13) !== before && moved > 0.2) w.emit({ type: 'step', x: p.x, y: p.y });
  }

  // Interact with the nearest prop in reach.
  if (inp.interactPressed) w.interact();
}

function startDash(w: World, p: Player, dx: number, dy: number) {
  const l = Math.hypot(dx, dy) || 1;
  p.dashDirX = dx / l; p.dashDirY = dy / l;
  p.dashCharges--;
  if (p.dashRecharge <= 0) p.dashRecharge = dashCooldown(w);
  p.dashIframes = PLAYER.dashIframes;
  p.dashDodged = false;
  p.trailT = -1;
  p.facing = Math.atan2(p.dashDirY, p.dashDirX);
  setState(p, 'dash');
  p.comboWindow = 0;
  p.combo = 0;
  w.emit({ type: 'dash', x: p.x, y: p.y, ang: p.facing });
}

function startSwing(_w: World, p: Player) {
  p.attackBuffer = 0;
  if (p.comboWindow <= 0) p.combo = 0;
  setState(p, 'attack');
  p.phase = 'windup';
  p.phaseT = 0;
  p.swingAim = p.aim;
  p.swingHit.clear();
}

function updateSwing(w: World, p: Player, dt: number, inp: InputFrame) {
  const sw = WEAPONS.lantern.combo[p.combo];
  const sp = w.run.stats.atkSpeed;
  p.phaseT += dt;
  if (p.phase === 'windup') {
    // Small aim correction during the windup so the swing follows the cursor.
    p.swingAim += clamp(angleDiff(p.swingAim, p.aim), -10 * dt, 10 * dt);
    if (p.phaseT >= sw.windup / sp) {
      p.phase = 'active';
      p.phaseT = 0;
      p.vx += Math.cos(p.swingAim) * sw.lunge;
      p.vy += Math.sin(p.swingAim) * sw.lunge;
      const emp = p.empowered > 0;
      w.emit({ type: 'swing', x: p.x, y: p.y - 6, ang: p.swingAim, combo: p.combo, half: sw.half, range: sw.range, empowered: emp });
      if (sw.heavy && w.run.stats.crescent > 0) {
        w.spawnProjectile({
          x: p.x + Math.cos(p.swingAim) * 14, y: p.y - 6 + Math.sin(p.swingAim) * 14,
          vx: Math.cos(p.swingAim) * 210, vy: Math.sin(p.swingAim) * 210, r: 10, team: 'player',
          dmg: sw.dmg * w.run.stats.crescent, life: 0.5, pierce: 99, kind: 'lance', homing: 0,
        });
      }
    }
  } else if (p.phase === 'active') {
    swingHits(w, p, sw);
    if (p.phaseT >= sw.active / sp) {
      p.phase = 'recovery';
      p.phaseT = 0;
    }
  } else {
    if (p.phaseT >= sw.recovery / sp) {
      const next = (p.combo + 1) % 3;
      p.combo = next;
      p.comboWindow = next === 0 ? 0 : WEAPONS.lantern.comboWindow;
      setState(p, 'normal');
      if (p.attackBuffer > 0 || inp.attack) startSwing(w, p);
      return;
    }
    // Late in recovery a buffered press chains straight into the next swing.
    if (p.attackBuffer > 0 && p.phaseT >= (sw.recovery / sp) * 0.45) {
      p.combo = (p.combo + 1) % 3;
      p.comboWindow = WEAPONS.lantern.comboWindow;
      startSwing(w, p);
    }
  }
}

function swingHits(w: World, p: Player, sw: (typeof WEAPONS.lantern.combo)[number]) {
  const cx = p.x, cy = p.y - 4;
  for (const e of w.enemies) {
    if (e.dead || e.spawnT > 0 || p.swingHit.has(e.id)) continue;
    const ex = e.x, ey = e.y - e.r * 0.6;
    const d = Math.hypot(ex - cx, ey - cy) - e.r;
    if (d > sw.range) continue;
    const da = Math.abs(angleDiff(p.swingAim, Math.atan2(ey - cy, ex - cx)));
    if (da > sw.half && d > 6) continue;
    if (!w.grid.lineOfSight(cx, cy, ex, ey)) continue;
    p.swingHit.add(e.id);
    const emp = p.empowered > 0;
    let dmg = sw.dmg * w.run.stats.dmgMul * (emp ? 2 : 1);
    damageEnemy(w, e, dmg, {
      src: 'melee', x: cx, y: cy, knock: sw.knock, heavy: sw.heavy || emp, proc: true, empowered: emp,
    });
  }
  // Swings also cut enemy projectiles out of the air (a reward for timing).
  for (const pr of w.projectiles) {
    if (pr.dead || pr.team !== 'enemy') continue;
    const d = Math.hypot(pr.x - cx, pr.y - cy);
    if (d > sw.range + 4) continue;
    if (Math.abs(angleDiff(p.swingAim, Math.atan2(pr.y - cy, pr.x - cx))) > sw.half) continue;
    pr.dead = true;
    w.emit({ type: 'impact', x: pr.x, y: pr.y, kind: pr.kind, team: 'enemy' });
  }
  if (p.empowered > 0 && p.swingHit.size > 0) p.empowered = 0;
}

function fireBolt(w: World, p: Player) {
  const W = WEAPONS.sunlance;
  p.attackBuffer = 0;
  p.fireCd = W.interval / w.run.stats.atkSpeed;
  p.shotCount++;
  const lance = p.shotCount % 4 === 0;
  const emp = p.empowered > 0;
  const spread = (w.rng.next() - 0.5) * 2 * W.spread;
  const a = p.aim + spread;
  const ox = p.x + Math.cos(a) * 9, oy = p.y - 8 + Math.sin(a) * 9;
  // Never spawn a bolt inside a wall (point-blank against walls).
  const sx = w.grid.shotBlockedAt(ox, oy) ? p.x : ox, sy = w.grid.shotBlockedAt(ox, oy) ? p.y - 8 : oy;
  w.spawnProjectile({
    x: sx, y: sy, vx: Math.cos(a) * W.speed * (lance ? 1.25 : 1), vy: Math.sin(a) * W.speed * (lance ? 1.25 : 1),
    r: lance ? 4 : 2.5, team: 'player', dmg: W.dmg * (lance ? 2.2 : 1) * (emp ? 2 : 1), life: W.range / W.speed,
    pierce: w.run.stats.pierce + (lance ? 2 : 0), kind: lance ? 'lance' : 'bolt', homing: 0,
  });
  if (emp) p.empowered = 0;
  // Recoil.
  p.kx -= Math.cos(a) * (lance ? 40 : 14);
  p.ky -= Math.sin(a) * (lance ? 40 : 14);
  w.emit({ type: 'shot', x: sx, y: sy, ang: a, team: 'player', kind: lance ? 'lance' : 'bolt' });
}

/** Called by combat when an enemy attack would have hit the player during dash invulnerability. */
export function onDodged(w: World) {
  const p = w.player;
  if (p.dashDodged || p.state !== 'dash') return;
  p.dashDodged = true;
  if (w.run.stats.afterglow) {
    p.empowered = 2.5;
    w.slowMo(0.45, 0.3);
  }
  w.emit({ type: 'dodge', x: p.x, y: p.y });
}

export const playerTile = (p: Player) => ({ tx: Math.floor(p.x / TILE), ty: Math.floor(p.y / TILE) });
