// The wanderer: movement, abilities, the lantern swing and the ember bolt,
// hurting and hazards. Runs once per fixed step (updatePlayer) before the world,
// enemies and combat; reads G.input (input.js) and moves with physics.js.
//
// Feel (numbers in config.js PHYS are what the levels and tests rely on):
//  - jumps: rise at PHYS.gravity with jump held, x3 when released early (short
//    hop), x0.55 near the apex while held (hang), x1.7 falling, capped at
//    maxFall. Jump speeds are solved at load so the apex is exactly
//    PHYS.jumpHeight (and doubleJumpHeight for Twin Leap) on this integrator.
//  - coyote time, jump buffer, ceiling corner correction (slide round a corner
//    by up to 10 px), dash ledge correction (pop up onto a ledge by up to 14 px).
//  - one-way '=' ledges and platforms: down + jump drops through (p.drop).
//  - water '~': slow sink, jump strokes up, jump at the surface leaps out.
//    In Fire Form lava behaves like thick water.
//  - spikes '^', lava 'L': hurtPlayer(..., { hazard }) fades out, back to the
//    last safe ground (p.safe), fades in. Ember-thorn 'B' hurts on touch, or
//    burns (world burnTile) in Fire Form.
//
// Fields for the painter (render/hero.js) besides the contract in the brief:
//   p.state, p.anim { t (s in state), run (phase, radians), land (0..1 squash) },
//   p.swingT (0..1 while swinging, else 1), p.swingDir 'side'|'up'|'down',
//   p.dashT (0..1 progress while dashing, else 0), p.dashDir { x, y },
//   p.landT (0..1 squash, decays), p.fade (0..1 black-out during a hazard reset),
//   p.hook null | { a (anchor), phase 'fire'|'pull'|'hang', len (chain px), theta },
//   p.scarf [{ x, y }] 6 points from the neck backwards (room px),
//   p.maxEnergy, p.restT (s left resting), p.liquid null|'water'|'lava'.
// p.attack while a swing is live: { x, y, w, h, dmg, id, dir: facing (+1|-1),
//   kind: 'side'|'up'|'down', kx, ky (unit knockback direction) }. combat.js
//   sets p.hitLanded = true when it hits something; the next step reads it
//   (energy +10, recoil, or a pogo bounce for a down swing).
import { PHYS, TILE, STEP } from './config.js';
import { T, isSolidCode } from './world/tiles.js';
import { moveBody, boxTouches, tileAtPx, lineOfSight } from './physics.js';
import { emit } from './events.js';
import { hasAbility, rest } from './game.js';
import * as world from './world/world.js';
import * as combat from './combat.js';

// ------------------------------------------------------------- tuning
const APEX_V = 90, HANG_K = 0.55, FALL_K = 1.7, CUT_K = 3;
const ACC_GROUND = 5200, DEC_GROUND = 6400, ACC_AIR = 3600, DEC_AIR = 2200, OVER_AIR = 500;
const DASH_STEPS = 12, DASH_CD = 0.38;
const WALL_SLIDE = 130, WALL_KICK = 340, WALL_LOCK = 0.13, WALL_KICK_IN = 150, WALL_LOCK_IN = 0.08;
const SWIM_SPEED = 0.65, SWIM_STROKE = 420, SINK = 80;
const HOOK_FIRE = 2800, HOOK_PULL = 1250, HANG_L = 70;
const SWING_T = 0.28, SWING_ON = 0.03, SWING_OFF = 0.15, SWING_CD = 0.34;
const BOLT_COST = 25, BOLT_CD = 0.3, BOLT_SPEED = 950;
const FIRE_DRAIN = 15, FIRE_MIN = 30, REGEN = 3;
const HAZARD_T = 0.7, HURT_T = 0.22, INV_T = 1.0;
const SCARF_N = 6, SCARF_SEG = 7;

// gravity multiplier for the current vertical speed (shared with the solver)
function gravK(vy, held) {
  if (vy < 0) return !held ? CUT_K : vy > -APEX_V ? HANG_K : 1;
  return held && vy < APEX_V ? HANG_K : FALL_K;
}
// Height a jump launched at v0 reaches with jump held, on exactly this integrator.
function riseHeight(v0) {
  let vy = -v0, y = 0, top = 0;
  for (let n = 0; n < 1000; n++) {
    vy += PHYS.gravity * gravK(vy, true) * STEP;
    if (vy >= 0) break;
    y += vy * STEP; top = Math.min(top, y);
  }
  return -top;
}
function solveJump(h) {
  let lo = 50, hi = 4000;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (riseHeight(m) < h) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const JUMP_V = solveJump(PHYS.jumpHeight);
// +6: the gain counted from the step after the press (as the tests do) still lands near PHYS
const DOUBLE_V = solveJump(PHYS.doubleJumpHeight + 6);
const WALL_V = solveJump(110), WALL_V_IN = solveJump(125);
const POGO_V = solveJump(115);
const DASH_V = PHYS.dashDistance / (DASH_STEPS * STEP);
export const PLAYER_TUNING = { JUMP_V, DOUBLE_V, WALL_V, POGO_V, DASH_V, DASH_STEPS };

let swingId = 0;

export function makePlayer(G) {
  return {
    x: 0, y: 0, w: PHYS.playerW, h: PHYS.playerH, vx: 0, vy: 0, onGround: false, facing: 1,
    hp: 5, maxHp: 5, energy: 100, maxEnergy: 100, form: 'normal', state: 'idle', inv: 0, attack: null,
    swingT: 1, swingDir: 'side', onWall: 0, swimming: false, liquid: null, hooked: null, hook: null,
    anim: { t: 0, run: 0, land: 0 }, safe: null, roomId: null,
    // timers and counters
    coyoteT: 0, bufferT: 0, airJumps: 0, dashReady: true, dashCd: 0, dashN: 0, dashT: 0, dashDir: { x: 1, y: 0 },
    lockT: 0, hurtT: 0, hazardT: 0, fade: 0, restT: 0, swingCd: 0, boltCd: 0, drop: 0, swimLock: 0,
    riseHold: false, landT: 0, platform: null, ground: null, hitLanded: false, swingHit: false,
    scarf: null,
  };
}

// ------------------------------------------------------------- helpers
const solidNoThorn = (c) => isSolidCode(c) && c !== T.BRAMBLE;
const freeAt = (G, x, y, w, h) => !boxTouches(G, x, y, w, h, isSolidCode);
const liquidAt = (G, x, y) => tileAtPx(G, x, y);

function wallSide(G, p, dir, reach = 3) {
  const x = dir > 0 ? p.x + p.w : p.x - reach;
  return !!boxTouches(G, x, p.y + 10, reach, p.h - 20, solidNoThorn);
}

function breakAt(G, tx, ty) {
  if (world.breakTile) world.breakTile(G, tx, ty);
  else { G.room.tiles[ty * G.room.tw + tx] = T.EMPTY; G.room.version++; emit('break', { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }); }
}
function burnAt(G, tx, ty) {
  if (world.burnTile) world.burnTile(G, tx, ty);
  else { G.room.tiles[ty * G.room.tw + tx] = T.EMPTY; G.room.version++; emit('burn', { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }); }
}
// every tile of a code a box covers
function eachTile(G, x, y, w, h, code, fn) {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tx < 0 || ty < 0 || tx >= G.room.tw || ty >= G.room.th) continue;
    if (G.room.tiles[ty * G.room.tw + tx] === code) fn(tx, ty);
  }
}

function endHook(p) { p.hook = null; p.hooked = null; }
function refresh(p) { p.airJumps = 1; p.dashReady = true; }

// ------------------------------------------------------------- hurting
// The only way the wanderer loses flames. info: { hazard: 'spikes'|'lava'|..., debug, kind }
export function hurtPlayer(G, dmg = 1, fromX, info = {}) {
  const p = G.player;
  if (!p || p.hp <= 0 || G.scene !== 'play' && !info.debug) return false;
  if (p.hazardT > 0) return false;
  const hazard = info.hazard;
  if (!hazard && !info.debug && (p.inv > 0 || p.dashN > 0)) return false;
  if (!G.god) p.hp = Math.max(0, p.hp - dmg);
  const cx = p.x + p.w / 2;
  emit('player-hit', { dmg, x: cx, y: p.y + p.h / 2, hazard: hazard || null });
  emit('shake', { amp: hazard ? 10 : 7, t: 0.25 });
  endHook(p); p.dashN = 0; p.dashT = 0; p.attack = null; p.swingT = 1; p.restT = 0;
  if (hazard) {
    p.hazardT = HAZARD_T; p.vx = 0; p.vy = 0; p.inv = Math.max(p.inv, HAZARD_T + INV_T);
  } else {
    const d = fromX == null || Math.abs(fromX - cx) < 1 ? -p.facing : Math.sign(cx - fromX);
    p.vx = d * 330; p.vy = Math.min(p.vy, -420); p.onGround = false;
    p.hurtT = HURT_T; p.lockT = HURT_T; p.inv = INV_T; p.riseHold = true;
  }
  return true;
}

// ------------------------------------------------------------- the step
export function updatePlayer(G, dt) {
  const p = G.player, i = G.input;
  if (!p || !G.room) return;
  if (p.roomId !== G.room.id) { p.roomId = G.room.id; p.safe = { x: p.x, y: p.y }; p.scarf = null; endHook(p); }
  const prevState = p.state;

  // timers
  for (const k of ['inv', 'dashCd', 'lockT', 'hurtT', 'swingCd', 'boltCd', 'drop', 'swimLock'])
    if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
  p.bufferT = Math.max(0, p.bufferT - dt);
  p.landT = Math.max(0, p.landT - dt * 4);
  if (i.jumpP) p.bufferT = PHYS.jumpBuffer;
  if (p.swingT < 1) p.swingT = Math.min(1, p.swingT + dt / SWING_T);
  p.attack = null;

  // hazard reset: fade out, back to safe ground, fade in
  if (p.hazardT > 0) {
    const before = p.hazardT;
    p.hazardT = Math.max(0, p.hazardT - dt);
    const half = HAZARD_T / 2;
    if (before > half && p.hazardT <= half && p.hp > 0 && p.safe) {
      p.x = p.safe.x; p.y = p.safe.y; p.vx = p.vy = 0; p.onGround = true; p.scarf = null;
    }
    p.fade = 1 - Math.abs(p.hazardT - half) / half;
    p.bufferT = 0;
    finish(G, p, dt, prevState);
    return;
  }
  p.fade = 0;

  // energy and Fire Form
  if (p.form === 'fire') {
    p.energy = Math.max(0, p.energy - FIRE_DRAIN * dt);
    if (p.energy <= 0 || (i.fireP) || !hasAbility(G, 'fire-form')) { p.form = 'normal'; emit('fire-form', { on: false }); }
  } else {
    p.energy = Math.min(p.maxEnergy, p.energy + REGEN * dt);
    if (i.fireP && hasAbility(G, 'fire-form') && p.energy >= FIRE_MIN) { p.form = 'fire'; emit('fire-form', { on: true }); }
  }

  // what the last swing hit (combat sets hitLanded after our step)
  if (p.hitLanded) {
    p.hitLanded = false;
    if (!p.swingHit) {
      p.swingHit = true;
      p.energy = Math.min(p.maxEnergy, p.energy + 10);
      if (p.swingDir === 'down') pogo(p);
      else if (p.swingDir === 'side') { p.vx = -p.facing * 240; p.lockT = Math.max(p.lockT, 0.07); }
    }
  }

  const dir = (i.right ? 1 : 0) - (i.left ? 1 : 0);
  const cx = p.x + p.w / 2;

  // resting at a brazier
  if (p.restT > 0) {
    p.restT = Math.max(0, p.restT - dt);
    if (p.restT < 0.9 && (dir || i.jumpP || i.attackP || i.dashP)) p.restT = 0;
    p.vx = 0;
  } else if (i.interactP && p.onGround && !p.hook && G.room.ents) {
    const e = G.room.ents.find((e) => (e.t === 'brazier') && nearEnt(p, e));
    if (e) {
      p.restT = 1.2; p.vx = 0; p.bufferT = 0;
      rest(G, G.room.id, p.x, p.y);
    }
  }
  const busy = p.restT > 0 || p.hurtT > 0;

  // liquids: water, and lava when burning bright
  const midCode = liquidAt(G, cx, p.y + p.h * 0.45), lowCode = liquidAt(G, cx, p.y + p.h * 0.7);
  const isLiquid = (c) => c === T.WATER || (c === T.LAVA && p.form === 'fire');
  const wasSwim = p.swimming;
  p.swimming = p.swimLock <= 0 && !p.hook && (isLiquid(midCode) || (wasSwim && isLiquid(lowCode)));
  p.liquid = p.swimming ? (midCode === T.LAVA || lowCode === T.LAVA ? 'lava' : 'water') : null;
  if (p.swimming !== wasSwim) emit('splash', { x: cx, y: p.y + p.h * 0.5, size: Math.min(1, Math.abs(p.vy) / 700 + 0.3), lava: p.liquid === 'lava' });
  if (p.swimming) refresh(p);

  // start actions
  if (!busy) {
    if (i.hookP && hasAbility(G, 'chain-hook')) startHook(G, p);
    if (i.dashP && hasAbility(G, 'ember-dash') && p.dashCd <= 0 && p.dashReady && p.dashN <= 0) startDash(G, p, i, dir);
    if (i.attackP && p.swingCd <= 0 && p.dashN <= 0) startSwing(G, p, i);
    if (i.boltP && p.boltCd <= 0 && p.energy >= BOLT_COST) fireBolt(G, p, i);
  }

  const preVy = p.vy, wasGround = p.onGround;
  if (p.hook) updateHook(G, p, i, dt, dir);
  else if (p.dashN > 0) updateDash(G, p, dt);
  else if (p.swimming) updateSwim(G, p, i, dt, dir, busy);
  else updateNormal(G, p, i, dt, dir, busy);

  // landing, coyote time, safe ground
  if (p.onGround) {
    p.coyoteT = PHYS.coyote; refresh(p); p.riseHold = false;
    if (!wasGround && preVy > 150) {
      p.landT = Math.min(1, preVy / PHYS.maxFall);
      emit('land', { x: p.x + p.w / 2, y: p.y + p.h, v: preVy });
    }
    if (isSafeGround(G, p)) p.safe = { x: p.x, y: p.y };
  } else p.coyoteT = Math.max(0, p.coyoteT - dt);

  touchHazards(G, p);
  if (p.swingT < 1) liveSwing(G, p);
  finish(G, p, dt, prevState);
}

function nearEnt(p, e) {
  if (e.near !== undefined) return e.near;
  const ex = e.x + (e.w || 0) / 2, ey = e.y + (e.h || 0) / 2;
  return Math.abs(ex - (p.x + p.w / 2)) < 60 && Math.abs(ey - (p.y + p.h / 2)) < 70;
}

function isSafeGround(G, p) {
  if (p.ground === 'platform' || p.ground === T.CRUMBLE || !p.ground) return false;
  const fy = p.y + p.h + 2;
  const under = (x) => { const c = tileAtPx(G, x, fy); return c === T.SOLID || c === T.ONEWAY || c === T.CRACK; };
  if (!under(p.x + 1) || !under(p.x + p.w - 1)) return false;
  const bad = (c) => c === T.SPIKE || c === T.LAVA || c === T.BRAMBLE || c === T.WATER;
  return !boxTouches(G, p.x - 40, p.y - 8, p.w + 80, p.h + 8, bad);
}

// ------------------------------------------------------------- movement modes
function horizontal(p, dir, dt, speed, ground) {
  if (p.lockT > 0) return;
  const target = dir * speed;
  let a;
  if (!ground && Math.abs(p.vx) > speed && Math.sign(p.vx) === dir) a = OVER_AIR;   // keep a hook or wall boost
  else if (dir === 0) a = ground ? DEC_GROUND : DEC_AIR;
  else a = ground ? (Math.sign(p.vx) === -dir ? DEC_GROUND + ACC_GROUND : ACC_GROUND) : ACC_AIR;
  p.vx = p.vx < target ? Math.min(target, p.vx + a * dt) : Math.max(target, p.vx - a * dt);
  if (dir) p.facing = dir;
}

function updateNormal(G, p, i, dt, dir, busy) {
  horizontal(p, busy && p.restT > 0 ? 0 : dir, dt, PHYS.runSpeed, p.onGround);

  // wall: Root Grip slides down a wall you push into
  p.onWall = 0;
  const grip = hasAbility(G, 'root-grip');
  if (grip && !p.onGround && !busy) {
    if (dir && p.vy > 0 && wallSide(G, p, dir)) { p.onWall = dir; refresh(p); }
  }

  // jumps
  if (!busy && p.bufferT > 0) {
    const onDrop = (p.onGround || p.coyoteT > 0) && i.down && (p.ground === T.ONEWAY || p.ground === 'platform');
    if (onDrop) { p.drop = 0.22; p.bufferT = 0; p.coyoteT = 0; p.onGround = false; p.platform = null; }
    else if (p.onGround || p.coyoteT > 0) {
      jump(p, JUMP_V); emit('jump', { x: p.x + p.w / 2, y: p.y + p.h, double: false });
    } else if (grip && (p.onWall || wallSide(G, p, 1, 6) || wallSide(G, p, -1, 6))) {
      const w = p.onWall || (wallSide(G, p, 1, 6) ? 1 : -1);
      const into = dir === w;  // pushing into the wall: a small climbing kick
      p.vy = -(into ? WALL_V_IN : WALL_V); p.vx = -w * (into ? WALL_KICK_IN : WALL_KICK);
      p.lockT = into ? WALL_LOCK_IN : WALL_LOCK; p.facing = -w; p.bufferT = 0; p.onWall = 0; p.riseHold = false;
      refresh(p);
      emit('wall-jump', { x: w > 0 ? p.x + p.w : p.x, y: p.y + p.h / 2 });
    } else if (i.jumpP && p.airJumps > 0 && hasAbility(G, 'twin-leap')) {
      p.airJumps--; jump(p, DOUBLE_V); emit('jump', { x: p.x + p.w / 2, y: p.y + p.h, double: true }); emit('double', { x: p.x + p.w / 2, y: p.y + p.h });
    }
  }

  // gravity
  if (p.riseHold && p.vy >= 0) p.riseHold = false;
  let g = PHYS.gravity * gravK(p.vy, i.jump || p.riseHold);
  p.vy += g * dt;
  if (p.onWall) p.vy = Math.min(p.vy, WALL_SLIDE);
  p.vy = Math.min(p.vy, PHYS.maxFall);

  cornerCorrect(G, p, dt);
  moveBody(G, p, dt);
  if (p.hitWall && p.lockT > 0 && p.hurtT <= 0) p.lockT = 0;
}

function jump(p, v) {
  p.vy = -v; p.onGround = false; p.coyoteT = 0; p.bufferT = 0; p.riseHold = false; p.platform = null;
}

function pogo(p) {
  p.vy = -POGO_V; p.riseHold = true; refresh(p); p.onGround = false;
  emit('jump', { x: p.x + p.w / 2, y: p.y + p.h, double: false, pogo: true });
}

// rising into a ceiling corner: slide round it by up to 10 px
function cornerCorrect(G, p, dt) {
  if (p.vy >= 0) return;
  const ny = p.y + p.vy * dt;
  if (freeAt(G, p.x, ny, p.w, p.h)) return;
  for (let k = 1; k <= 10; k++) for (const s of [1, -1]) {
    if (s * k * p.vx < 0 && k > 4) continue;  // don't fight the stick much
    const nx = p.x + s * k;
    if (freeAt(G, nx, ny, p.w, p.h) && freeAt(G, nx, p.y, p.w, p.h)) { p.x = nx; return; }
  }
}

function updateSwim(G, p, i, dt, dir, busy) {
  p.onWall = 0;
  horizontal(p, busy ? 0 : dir, dt, PHYS.runSpeed * SWIM_SPEED, true);
  const headOut = !isLiquidCode(G, p, tileAtPx(G, p.x + p.w / 2, p.y + 6));
  if (!busy && p.bufferT > 0) {
    if (headOut || p.onGround) {  // leap out of the surface
      jump(p, JUMP_V); p.swimLock = 0.3; p.swimming = false;
      emit('jump', { x: p.x + p.w / 2, y: p.y + p.h, double: false, swim: true });
      emit('splash', { x: p.x + p.w / 2, y: p.y + p.h * 0.4, size: 0.8, lava: p.liquid === 'lava' });
    } else { p.vy = Math.min(p.vy, -SWIM_STROKE); p.bufferT = 0; emit('splash', { x: p.x + p.w / 2, y: p.y + 10, size: 0.25, stroke: true }); }
  }
  if (p.swimming) {
    // drift toward a target speed: sink slowly, up rises, down dives; float at the surface
    let target = i.down ? 260 : i.up ? -170 : SINK;
    if (headOut && target < 0) target = 0;
    const a = p.vy < target ? 700 : 1100;
    p.vy = p.vy < target ? Math.min(target, p.vy + a * dt) : Math.max(target, p.vy - a * dt);
  } else p.vy += PHYS.gravity * dt;
  cornerCorrect(G, p, dt);
  moveBody(G, p, dt);
}
function isLiquidCode(G, p, c) { return c === T.WATER || (c === T.LAVA && p.form === 'fire'); }

// ------------------------------------------------------------- Ember Dash
function startDash(G, p, i, dir) {
  const dx = dir || p.facing;
  const dy = !p.onGround && i.down && dir ? 0.5 : 0;   // a slight down-diagonal in the air; never up
  const n = Math.hypot(dx, dy);
  p.dashDir = { x: dx / n, y: dy / n };
  p.facing = dx;
  p.dashN = DASH_STEPS; p.dashT = 0; p.dashCd = DASH_CD + DASH_STEPS * STEP;
  if (!p.onGround) p.dashReady = false;
  endHook(p); p.onWall = 0; p.swingT = 1;
  emit('dash', { x: p.x + p.w / 2, y: p.y + p.h / 2, dir: dx });
}

function updateDash(G, p, dt) {
  const d = p.dashDir;
  p.vx = d.x * DASH_V; p.vy = d.y * DASH_V;
  // shatter cracked walls ahead (and keep going through them)
  const ax = p.x + p.vx * dt, ay = p.y + p.vy * dt;
  eachTile(G, Math.min(p.x, ax) - 2, ay, p.w + Math.abs(p.vx * dt) + 4, p.h, T.CRACK, (tx, ty) => breakAt(G, tx, ty));
  // clip a ledge corner with the feet: pop up onto it
  if (!freeAt(G, ax, p.y, p.w, p.h)) {
    for (let k = 1; k <= 14; k++) if (freeAt(G, ax, p.y - k, p.w, p.h) && freeAt(G, p.x, p.y - k, p.w, p.h)) { p.y -= k; break; }
  }
  moveBody(G, p, dt);
  p.dashN--;
  p.dashT = 1 - p.dashN / DASH_STEPS;
  if (p.hitWall) p.dashN = 0;
  if (p.dashN <= 0) {
    p.dashN = 0; p.dashT = 0;
    const i = G.input, dir = (i.right ? 1 : 0) - (i.left ? 1 : 0);
    p.vx = dir === Math.sign(d.x) ? dir * PHYS.runSpeed : 0;
    p.vy = d.y > 0 ? 200 : 0;
  }
}

// ------------------------------------------------------------- Chain Hook
function findAnchor(G, p, skip) {
  const cx = p.x + p.w / 2, cy = p.y + 8, range = PHYS.hookRange + 10;
  let best = null, bd = range;
  for (const e of G.room.ents || []) {
    if (e.t !== 'anchor' || e === skip || e.hidden) continue;
    const d = Math.hypot(e.x - cx, e.y - cy);
    // a ring ahead or above reads as nearer than one behind
    const score = d + ((e.x - cx) * p.facing < -20 ? 40 : 0);
    if (d <= range && score < bd + 40 && lineOfSight(G, cx, cy, e.x, e.y)) {
      if (!best || score < best.s) { best = { e, s: score }; bd = d; }
    }
  }
  return best && best.e;
}

function startHook(G, p) {
  const cur = p.hook && p.hook.a;
  const a = findAnchor(G, p, cur);
  if (!a) { if (cur) endHook(p); return; }
  p.hook = { a, phase: 'fire', len: p.hook ? 0 : 0, t: 0, theta: 0, omega: 0 };
  p.hooked = a; p.dashN = 0; p.dashT = 0; p.onWall = 0; p.swingT = 1;
  p.facing = a.x >= p.x + p.w / 2 ? 1 : -1;
  refresh(p);
  emit('hook', { x: a.x, y: a.y });
}

function updateHook(G, p, i, dt, dir) {
  const h = p.hook, a = h.a;
  h.t += dt;
  p.onWall = 0;
  const cx = () => p.x + p.w / 2, cy = () => p.y + p.h / 2;
  if (h.phase === 'fire') {
    h.len += HOOK_FIRE * dt;
    p.vx *= 0.85; p.vy = Math.min(p.vy + 900 * dt, 300);
    const d = Math.hypot(a.x - cx(), a.y - (p.y + 16));
    if (h.len >= d) { h.phase = 'pull'; h.t = 0; emit('hook-pull', { x: a.x, y: a.y }); }
    moveBody(G, p, dt);
    h.len = Math.min(h.len, d);
    return;
  }
  if (h.phase === 'pull') {
    const tx = a.x, ty = a.y + HANG_L;
    const dx = tx - cx(), dy = ty - cy(), d = Math.hypot(dx, dy);
    const sp = Math.min(HOOK_PULL * Math.min(1, 0.4 + h.t * 6), d / dt);
    p.vx = d > 0 ? dx / d * sp : 0; p.vy = d > 0 ? dy / d * sp : 0;
    const ox = p.x, oy = p.y;
    moveBody(G, p, dt);
    h.len = Math.hypot(a.x - cx(), a.y - (p.y + 4));
    const stuck = Math.hypot(p.x - ox, p.y - oy) < 0.5 && h.t > 0.05;
    if (d < 6 || stuck || h.t > 0.8) {
      h.phase = 'hang';
      h.theta = Math.atan2(cx() - a.x, cy() - a.y);
      h.omega = Math.max(-4, Math.min(4, (p.vx * Math.cos(h.theta) - p.vy * Math.sin(h.theta)) / HANG_L * 0.6));
    }
    if (p.bufferT > 0 && h.t > 0.06) releaseHook(G, p, dir, true);
    return;
  }
  // hang: a pendulum under the ring; left/right pump it
  const L = HANG_L;
  const alpha = -(PHYS.gravity / L) * Math.sin(h.theta) + dir * 7;
  h.omega += alpha * dt; h.omega *= 1 - 0.8 * dt;
  h.theta += h.omega * dt;
  if (Math.abs(h.theta) > 1.25) { h.theta = Math.sign(h.theta) * 1.25; h.omega = 0; }
  const nx = a.x + L * Math.sin(h.theta) - p.w / 2, ny = a.y + L * Math.cos(h.theta) - p.h / 2;
  p.vx = (nx - p.x) / dt; p.vy = (ny - p.y) / dt;
  moveBody(G, p, dt, { platforms: false });
  if (p.hitWall || p.hitCeil || p.onGround) { h.theta = Math.atan2(cx() - a.x, cy() - a.y); h.omega = 0; }
  h.len = Math.hypot(a.x - cx(), a.y - (p.y + 4));
  if (dir) p.facing = dir;
  p.vx = h.omega * L * Math.cos(h.theta); p.vy = -h.omega * L * Math.sin(h.theta);
  if (p.bufferT > 0) releaseHook(G, p, dir, true);
  else if (i.down && !i.jump) releaseHook(G, p, dir, false);
}

function releaseHook(G, p, dir, jumped) {
  const tvx = p.vx, tvy = p.vy;
  endHook(p); refresh(p);
  if (jumped) {
    p.vx = Math.max(-620, Math.min(620, tvx * 0.9 + dir * 260));
    p.vy = -JUMP_V * 0.95 + Math.min(0, tvy * 0.5);
    p.bufferT = 0; p.riseHold = false;
    emit('jump', { x: p.x + p.w / 2, y: p.y + p.h, double: false, hook: true });
  } else { p.vx = tvx * 0.6; p.vy = Math.max(0, tvy); }
}

// ------------------------------------------------------------- lantern and bolt
function startSwing(G, p, i) {
  p.swingDir = i.up ? 'up' : (i.down && !p.onGround && !p.swimming) ? 'down' : 'side';
  p.swingT = 0; p.swingCd = SWING_CD; p.swingHit = false; p.hitLanded = false;
  p.swingId = ++swingId;
  emit('swing', { x: p.x + p.w / 2, y: p.y + p.h / 2, dir: p.swingDir === 'side' ? p.facing : p.swingDir });
}

function liveSwing(G, p) {
  const t = p.swingT * SWING_T;
  if (t < SWING_ON || t > SWING_OFF) return;
  const cx = p.x + p.w / 2;
  let a;
  if (p.swingDir === 'up') a = { x: cx - 34, y: p.y - 62, w: 68, h: 72, kx: 0, ky: -1 };
  else if (p.swingDir === 'down') a = { x: cx - 30, y: p.y + p.h - 10, w: 60, h: 72, kx: 0, ky: 1 };
  else a = { x: p.facing > 0 ? p.x + p.w - 6 : p.x - 76 + 6, y: p.y + 2, w: 76, h: 56, kx: p.facing, ky: 0 };
  p.attack = { ...a, dmg: 1, id: p.swingId, dir: p.facing, kind: p.swingDir };
  // a down swing bounces off spikes and thorns too
  if (p.swingDir === 'down' && !p.swingHit && boxTouches(G, a.x, a.y, a.w, a.h, (c) => c === T.SPIKE || c === T.BRAMBLE)) {
    p.swingHit = true; pogo(p);
  }
}

function fireBolt(G, p, i) {
  const ox = p.x + p.w / 2 + p.facing * 14, oy = p.y + 22;
  let dx = p.facing, dy = 0;
  if (i.aim) { const ax = i.aim.x - ox, ay = i.aim.y - oy, d = Math.hypot(ax, ay); if (d > 4) { dx = ax / d; dy = ay / d; } }
  else if (i.up && !i.left && !i.right) { dx = 0; dy = -1; }
  if (Math.abs(dx) > 0.05) p.facing = dx > 0 ? 1 : -1;
  p.energy -= BOLT_COST; p.boltCd = BOLT_CD;
  if (combat.spawnShot) combat.spawnShot(G, { side: 'player', kind: 'bolt', x: ox, y: oy, vx: dx * BOLT_SPEED, vy: dy * BOLT_SPEED, r: 9, dmg: 2, life: 1.1 });
  emit('bolt', { x: ox, y: oy, dx, dy });
}

// ------------------------------------------------------------- hazards
function touchHazards(G, p) {
  if (p.hazardT > 0 || p.hp <= 0) return;
  const hz = boxTouches(G, p.x + 4, p.y + 6, p.w - 8, p.h - 8, (c) => c === T.SPIKE || (c === T.LAVA && p.form !== 'fire'));
  if (hz) { hurtPlayer(G, 1, p.x + p.w / 2, { hazard: hz.code === T.SPIKE ? 'spikes' : 'lava' }); return; }
  // ember-thorn: solid, so test a box 2 px larger
  if (p.form === 'fire') eachTile(G, p.x - 3, p.y - 3, p.w + 6, p.h + 6, T.BRAMBLE, (tx, ty) => burnAt(G, tx, ty));
  else {
    const b = boxTouches(G, p.x - 2, p.y - 2, p.w + 4, p.h + 4, (c) => c === T.BRAMBLE);
    if (b) hurtPlayer(G, 1, (b.tx + 0.5) * TILE, { kind: 'thorn' });
  }
}

// ------------------------------------------------------------- state, anim, scarf
function finish(G, p, dt, prevState) {
  let s;
  if (p.hazardT > 0 || p.hurtT > 0) s = 'hurt';
  else if (p.restT > 0) s = 'rest';
  else if (p.hook) s = 'hook';
  else if (p.dashN > 0) s = 'dash';
  else if (p.swimming) s = 'swim';
  else if (p.swingT < 1) s = 'swing';
  else if (p.onWall) s = 'wall';
  else if (p.onGround) s = Math.abs(p.vx) > 20 ? 'run' : 'idle';
  else s = p.vy < 0 ? 'jump' : 'fall';
  p.state = s;
  p.anim.t = s === prevState ? p.anim.t + dt : 0;
  if (p.onGround) p.anim.run += Math.abs(p.vx) * dt / 22;
  p.anim.land = p.landT;
  scarf(p, dt);
}

function scarf(p, dt) {
  const ax = p.x + p.w / 2 - p.facing * 3, ay = p.y + 14;
  if (!p.scarf || Math.hypot(p.scarf[0].x - ax, p.scarf[0].y - ay) > 120) {
    p.scarf = Array.from({ length: SCARF_N }, (_, k) => ({ x: ax - p.facing * k * SCARF_SEG, y: ay, px: ax - p.facing * k * SCARF_SEG, py: ay }));
  }
  const s = p.scarf;
  s[0].x = s[0].px = ax; s[0].y = s[0].py = ay;
  const wind = -p.facing * 260 - p.vx * 0.5, lift = -60 + Math.sin(performance.now() / 180) * 40;
  for (let k = 1; k < s.length; k++) {
    const q = s[k], vx = (q.x - q.px) * 0.9, vy = (q.y - q.py) * 0.9;
    q.px = q.x; q.py = q.y;
    q.x += vx + wind * dt * dt * 6; q.y += vy + (300 + lift) * dt * dt * 6 - p.vy * dt * dt * 2;
  }
  for (let it = 0; it < 3; it++) for (let k = 1; k < s.length; k++) {
    const a = s[k - 1], b = s[k], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - SCARF_SEG) / d;
    if (k === 1) { b.x -= dx * f; b.y -= dy * f; } else { a.x += dx * f * 0.5; a.y += dy * f * 0.5; b.x -= dx * f * 0.5; b.y -= dy * f * 0.5; }
  }
}
