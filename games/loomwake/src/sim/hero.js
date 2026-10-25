// Iri: movement, dash, Snare (the golden thread), Call, input buffering and
// weapon dispatch. Pure sim (render/actors/hero.js draws from these fields).
//
// Exports:
//   registerWeapon(mod)                  add a weapon module (blade is built in; main.js registers the others)
//   getWeapon(id) -> module              (falls back to blade)
//   WEAPON_IDS                           ids registered so far
//   recomputeStats(G) -> stats           boons.heroStats(G) if loaded, else BASE_STATS; updates maxHp/dash charges
//   resetHero(G, { x, y, full })         full = new run (hp, call, death defiance, weapon init); else chamber entry
//   placeHero(G, x, y)                   move without other changes (render resets cloth on a jump > 300 px)
//   respawnHero(G, x, y)                 thread re-weave: state 'respawn' for cfg.hero.respawnTime, then 'move'
//   updateHero(G, dt)                    world.js calls it once per gameplay tick
//   tickHeroBuffers(G, dt)               records presses during hit-stop
//   endAction(h)                         weapons call it to hand control back (state 'move')
//   aimDir(h) -> [x, y]                  unit vector of h.facing
//   startDash(G, h), doCall(G, h)
//
// Hero states: 'move' | 'dash' | 'attack' | 'dashAttack' | 'special' | 'snare' (throw pose) | 'snareRecall' | 'call' | 'dead' | 'respawn'
// Fields the renderer reads: facing, vx, vy, state, st, dashing, dashDir, combo, wpn (weapon scratch), snare, inv, hurtT, call.
// Bus events: dash {x, y, dx, dy}, dashEnd, snare {x, y, angle}, snareHit {target, x, y}, snareRecall {target, x, y, heavy},
// snareBack, call {patron, x, y}, explode {x, y, r, element}, respawn {x, y}, swing/special (from weapons).
import { BASE_STATS } from '../config.js';
import { clamp, lerp } from '../core/math.js';
import { HOOKS, fire, hitFoes, damageFoe, addStatus, tickStatuses, targetable } from './combat.js';
import { moveEntity, insideChamber, safeSpot } from './world.js';
import blade from './weapons/blade.js';

const WEAPONS = {};
export const WEAPON_IDS = [];
export function registerWeapon(mod) {
  const m = mod && (mod.default || mod);
  if (!m || !m.id) return;
  if (!WEAPONS[m.id]) WEAPON_IDS.push(m.id);
  WEAPONS[m.id] = m;
}
// blade registers lazily (an import cycle through blade.js must not touch it at module-evaluation time)
export function getWeapon(id) {
  if (!WEAPONS.blade) registerWeapon(blade);
  return WEAPONS[id] || WEAPONS.blade;
}

export const aimDir = (h) => [Math.cos(h.facing), Math.sin(h.facing)];
export function endAction(h) { h.state = 'move'; h.st = 0; h.cancel = false; }

export function recomputeStats(G) {
  const h = G.hero;
  let s = null;
  if (HOOKS.stats) s = HOOKS.stats(G);
  s = Object.assign({}, BASE_STATS, s || h.stats || {});
  h.stats = s;
  h.maxHp = Math.max(1, Math.round(s.maxHp));
  if (h.hp > h.maxHp) h.hp = h.maxHp;
  if (h.dashCharges > s.dashCharges) h.dashCharges = s.dashCharges;
  return s;
}

function clearTransient(h) {
  h.vx = h.vy = h.kx = h.ky = h.tvx = h.tvy = 0;
  h.state = 'move'; h.st = 0; h.dashing = false; h.snare = null; h.status = {};
  h.stun = 0; h.cancel = false; h.combo = 0; h.comboWin = 0; h.hurtT = 0; h.flash = 0;
  for (const k in h.buf) h.buf[k] = 0;
}

export function resetHero(G, { x, y, full = false } = {}) {
  const h = G.hero;
  if (x != null) { const p = safeSpot(G.chamber, x, y, h.r); h.x = p.x; h.y = p.y; h.safe = { x: p.x, y: p.y }; h.vx = h.vy = h.kx = h.ky = 0; }
  clearTransient(h);
  const s = recomputeStats(G);
  h.dashCharges = s.dashCharges; h.dashCd = 0;
  h.cd.special = 0; h.cd.snare = 0;
  if (full) {
    h.dead = false; h.hp = h.maxHp; h.call = 0; h.armor = s.maxArmor || 0;
    h.deathDefiance = s.deathDefiance || 0;
    h.wpn = {};
    getWeapon(h.weapon).init?.(G, h);
  }
  h.inv = 0.4;
  G.bus.emit('heroReset', { x: h.x, y: h.y, full });
}

export function placeHero(G, x, y) { const h = G.hero; const p = safeSpot(G.chamber, x, y, h.r); h.x = p.x; h.y = p.y; h.safe = { x: p.x, y: p.y }; h.vx = h.vy = h.kx = h.ky = 0; h.tvx = h.tvy = 0; h.snare = null; if (h.dashing) { h.dashing = false; } if (h.state !== 'dead' && h.state !== 'respawn' && h.state !== 'move') endAction(h); }

export function respawnHero(G, x = G.hero.x, y = G.hero.y) {
  const h = G.hero;
  placeHero(G, x, y);
  clearTransient(h);
  h.dead = false; h.hp = Math.max(h.hp, 1);
  h.state = 'respawn'; h.st = 0; h.inv = G.cfg.hero.respawnTime + 0.5;
  G.bus.emit('respawn', { x: h.x, y: h.y });
}

const ACTIONS = ['attack', 'special', 'snare', 'dash', 'call'];
function recordPresses(G) {
  const I = G.input, h = G.hero, b = G.cfg.inputBuffer;
  for (const a of ACTIONS) if (I[a + 'P']) h.buf[a] = b;
}
export function tickHeroBuffers(G) { if (G.hero) recordPresses(G); }

export function startDash(G, h) {
  const I = G.input, c = G.cfg.dash;
  let dx = I.move.x, dy = I.move.y;
  if (Math.hypot(dx, dy) < 0.2) { dx = Math.cos(h.facing); dy = Math.sin(h.facing); }
  const l = Math.hypot(dx, dy) || 1;
  if (h.state === 'attack' || h.state === 'special' || h.state === 'dashAttack') getWeapon(h.weapon).cancel?.(G, h);
  h.dashDir = { x: dx / l, y: dy / l };
  h.state = 'dash'; h.st = 0; h.dashing = true; h.cancel = false;
  // presses from before the dash never cancel it (a mashed attack would otherwise turn it into a standing strike)
  h.buf.attack = 0; h.buf.special = 0;
  h.dashCharges--; if (h.dashCd <= 0) h.dashCd = (h.stats.dashRecharge ?? c.recharge) * (h.stats.dashCd ?? 1);
  h.inv = Math.max(h.inv, c.inv);
  h.facing = Math.atan2(h.dashDir.y, h.dashDir.x);
  h.lastDash = G.t;
  G.bus.emit('dash', { x: h.x, y: h.y, dx: h.dashDir.x, dy: h.dashDir.y });
  fire(G, 'onDash', { x: h.x, y: h.y, dx: h.dashDir.x, dy: h.dashDir.y });
}

function endDash(G, h) {
  h.dashing = false; h.lastDashEnd = G.t;
  if (h.state === 'dash') { h.state = 'move'; h.st = 0; }
  G.bus.emit('dashEnd', { x: h.x, y: h.y });
  fire(G, 'onDashEnd', { x: h.x, y: h.y });
}

export function doCall(G, h) {
  const c = G.cfg.call, cost = h.stats.callCost ?? 1;
  h.call = Math.max(0, h.call - cost);
  h.state = 'call'; h.st = 0; h.inv = Math.max(h.inv, 0.6);
  const patron = G.run?.callPatron ?? G.run?.patron ?? null;
  G.bus.emit('call', { patron, x: h.x, y: h.y });
  const handled = HOOKS.call ? HOOKS.call(G) : false;
  if (handled) return;
  // generic burst: golden shockwave that clears nearby foe projectiles
  hitFoes(G, { type: 'circle', x: h.x, y: h.y, r: c.burstR }, { dmg: c.burstDmg * (h.stats.callDmg ?? 1), kb: c.burstKnock, kind: 'call', element: 'gold', stun: c.burstStun, hitstop: 0.1, shake: 0.6 });
  for (const p of G.projectiles) if (p.team === 'foe' && Math.hypot(p.x - h.x, p.y - h.y) < c.burstR + 40) { p.dead = true; G.bus.emit('projectileDie', { p, x: p.x, y: p.y, why: 'call' }); }
  G.bus.emit('explode', { x: h.x, y: h.y, r: c.burstR, element: 'gold', call: true });
}

// ---------------------------------------------------------------- snare (the golden thread)
function throwSnare(G, h) {
  const c = G.cfg.snare;
  const dx = Math.cos(h.facing), dy = Math.sin(h.facing);
  h.snare = { state: 'out', x: h.x, y: h.y, dx, dy, d: 0, t: 0, target: null };
  h.cd.snare = c.cooldown;
  if (h.state === 'move' || h.state === 'attack' || h.state === 'special') { if (h.state !== 'move') getWeapon(h.weapon).cancel?.(G, h); h.state = 'snare'; h.st = 0; }
  G.bus.emit('snare', { x: h.x, y: h.y, angle: h.facing });
  fire(G, 'onSnare', { x: h.x, y: h.y, angle: h.facing });
}

function recallSnare(G, h) {
  const s = h.snare, e = G.foes.find((f) => f.id === s.target);
  if (!e || e.dead) { s.state = 'back'; return; }
  s.state = 'pull'; s.t = 0;
  s.heavy = !!e.boss || (e.mass || 1) >= G.cfg.snare.heavyMass;
  if (h.state === 'move') { h.state = 'snareRecall'; h.st = 0; }
  G.bus.emit('snareRecall', { target: e, x: e.x, y: e.y, heavy: s.heavy });
}

function updateSnare(G, h, dt) {
  const s = h.snare, c = G.cfg.snare;
  if (!s) return;
  s.t += dt;
  if (s.state === 'out') {
    s.d += c.speed * dt;
    s.x = h.x + s.dx * s.d; s.y = h.y + s.dy * s.d;
    for (const e of G.foes) {
      if (!targetable(e) || Math.hypot(e.x - s.x, e.y - s.y) > e.r + c.r) continue;
      s.state = 'lodged'; s.target = e.id; s.t = 0;
      damageFoe(G, e, c.dmg * (h.stats.snareDmg ?? 1), { kind: 'snare', element: 'gold', kb: 0, stun: 0.5, hitstop: 0.04, shake: 0.1, dx: s.dx, dy: s.dy });
      G.bus.emit('snareHit', { target: e, x: e.x, y: e.y });
      fire(G, 'onSnareHit', { target: e, x: e.x, y: e.y });
      getWeapon(h.weapon).onSnare?.(G, h, e);
      break;
    }
    if (s.state === 'out') {
      let blocked = s.d > c.range || (G.chamber && !insideChamber(G.chamber, s.x, s.y, 0));
      if (!blocked && G.chamber?.obstacles) for (const o of G.chamber.obstacles) if (Math.hypot(s.x - o.x, s.y - o.y) < o.r) { blocked = true; break; }
      if (blocked) { s.state = 'back'; s.t = 0; G.bus.emit('snareBack', { x: s.x, y: s.y }); }
    }
  } else if (s.state === 'lodged') {
    const e = G.foes.find((f) => f.id === s.target);
    if (!e || e.dead) { s.state = 'back'; s.d = Math.hypot(s.x - h.x, s.y - h.y); return; }
    s.x = e.x; s.y = e.y;
    if (s.t > c.lodge) { s.state = 'back'; s.d = Math.hypot(s.x - h.x, s.y - h.y); s.dx = (s.x - h.x) / (s.d || 1); s.dy = (s.y - h.y) / (s.d || 1); }
  } else if (s.state === 'pull') {
    const e = G.foes.find((f) => f.id === s.target);
    if (!e || e.dead) { h.snare = null; return; }
    const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy) || 1;
    s.x = e.x; s.y = e.y;
    const reach = e.r + h.r + 26;
    if (d > reach && s.t < 0.45) {
      if (s.heavy) { h.kx = -(dx / d) * c.pullSpeed; h.ky = -(dy / d) * c.pullSpeed; h.inv = Math.max(h.inv, 0.08); }
      else { e.kx = (dx / d) * c.pullSpeed; e.ky = (dy / d) * c.pullSpeed; e.knockT = 0; }
    } else {
      if (s.heavy) { h.kx *= 0.2; h.ky *= 0.2; } else { e.kx *= 0.15; e.ky *= 0.15; }
      damageFoe(G, e, c.recallDmg * (h.stats.snareDmg ?? 1), { kind: 'snare', element: 'gold', kb: 120, stun: c.bind, dx: -dx, dy: -dy, hitstop: 0.06, shake: 0.25 });
      if (!e.dead) addStatus(G, e, 'bound', c.bind, 1);
      G.bus.emit('snareBind', { target: e, x: e.x, y: e.y });
      h.snare = null;
      if (h.state === 'snareRecall') endAction(h);
    }
  } else if (s.state === 'back') {
    s.d -= 2600 * dt;
    s.x = h.x + s.dx * s.d; s.y = h.y + s.dy * s.d;
    if (s.d <= 0) h.snare = null;
  }
}

// ---------------------------------------------------------------- the tick
export function updateHero(G, dt) {
  const h = G.hero, c = G.cfg, I = G.input;
  if (!h) return;
  h.st += dt;
  h.inv = Math.max(0, h.inv - dt); h.hurtT = Math.max(0, h.hurtT - dt); h.flash = Math.max(0, h.flash - dt);
  h.cloak = Math.max(0, (h.cloak || 0) - dt);
  h.cd.special = Math.max(0, h.cd.special - dt); h.cd.snare = Math.max(0, h.cd.snare - dt);
  h.comboWin = Math.max(0, h.comboWin - dt);
  for (const k in h.buf) h.buf[k] = Math.max(0, h.buf[k] - dt);
  tickStatuses(G, h, dt);
  if (h.dead) { h.state = 'dead'; h.vx *= 0.85; h.vy *= 0.85; moveEntity(G, h, dt); return; }
  if (h.state === 'respawn') { h.vx = h.vy = 0; if (h.st >= c.hero.respawnTime) endAction(h); return; }
  recordPresses(G);
  const s = h.stats, W = getWeapon(h.weapon);
  const maxCh = s.dashCharges ?? 2;
  if (h.dashCharges < maxCh && !h.dashing) { h.dashCd -= dt; if (h.dashCd <= 0) { h.dashCharges++; h.dashCd = h.dashCharges < maxCh ? (s.dashRecharge ?? c.dash.recharge) * (s.dashCd ?? 1) : 0; } }
  // aim: from input (mouse point / stick / auto-aim), else the move direction
  const free = h.state === 'move' || h.state === 'dash' || h.state === 'snare' || h.state === 'snareRecall';
  if (free) {
    const ad = I.aimDir;
    if (ad && (ad.x || ad.y)) h.facing = Math.atan2(ad.y, ad.x);
    else if (Math.hypot(I.move.x, I.move.y) > 0.2) h.facing = Math.atan2(I.move.y, I.move.x);
  }
  const bound = !!h.status.bound;
  // -------- actions, highest priority first
  if (h.buf.dash > 0 && h.dashCharges > 0 && !bound && (h.state !== 'dash' || h.st >= c.dash.time * c.dash.chainAt) && h.state !== 'call') {
    h.buf.dash = 0;
    if (h.dashing) h.dashing = false;
    startDash(G, h);
  }
  if (h.buf.call > 0 && h.call >= (s.callCost ?? 1) - 1e-6 && h.state !== 'dash' && h.state !== 'call') {
    h.buf.call = 0;
    if (h.state === 'attack' || h.state === 'special' || h.state === 'dashAttack') W.cancel?.(G, h);
    doCall(G, h);
  }
  if (h.buf.snare > 0) {
    if (h.snare && h.snare.state === 'lodged') { h.buf.snare = 0; recallSnare(G, h); }
    else if (!h.snare && h.cd.snare <= 0 && (h.state === 'move' || ((h.state === 'attack' || h.state === 'special') && h.cancel))) { h.buf.snare = 0; throwSnare(G, h); }
  }
  const canAct = h.state === 'move' || h.state === 'snare' && h.st > 0.08 || h.state === 'snareRecall' || ((h.state === 'attack' || h.state === 'special' || h.state === 'dashAttack') && h.cancel);
  if (h.buf.special > 0 && canAct) { if (W.special(G, h)) h.buf.special = 0; }
  // a dash becomes a dash-strike only once it has covered most of its distance (the press stays buffered)
  if (h.buf.attack > 0 && (canAct || (h.state === 'dash' && h.st >= c.dash.time * c.dash.chainAt))) {
    if (h.state === 'dash') endDash(G, h);
    if (W.attack(G, h)) h.buf.attack = 0;
  }
  // -------- movement per state
  const speed = c.hero.speed * (s.speed ?? 1) * (h.status.slow ? 1 - clamp(h.status.slow.power, 0, 0.8) : 1);
  let tvx = 0, tvy = 0, accel = c.hero.accel;
  if (h.state === 'move' || h.state === 'snareRecall') { tvx = I.move.x * speed; tvy = I.move.y * speed; }
  else if (h.state === 'dash') {
    const ds = (c.dash.dist * (s.dashDist ?? 1)) / c.dash.time;
    tvx = h.dashDir.x * ds; tvy = h.dashDir.y * ds; accel = 0;
    if (h.st >= c.dash.time) endDash(G, h);
  } else if (h.state === 'snare') {
    tvx = I.move.x * speed * 0.6; tvy = I.move.y * speed * 0.6;
    if (h.st >= 0.16) endAction(h);
  } else if (h.state === 'call') {
    if (h.st >= 0.5) endAction(h);
  } else if (h.state === 'attack' || h.state === 'special' || h.state === 'dashAttack') {
    tvx = h.tvx; tvy = h.tvy; accel = h.accel ?? c.hero.accel;
  }
  if (bound) { tvx *= 0.15; tvy *= 0.15; }
  W.update?.(G, h, dt);
  if (h.state === 'attack' || h.state === 'special' || h.state === 'dashAttack') { tvx = h.tvx; tvy = h.tvy; accel = h.accel ?? c.hero.accel; }
  if (accel <= 0) { h.vx = tvx; h.vy = tvy; }
  else { const k = 1 - Math.exp(-dt * accel); h.vx = lerp(h.vx, tvx, k); h.vy = lerp(h.vy, tvy, k); }
  moveEntity(G, h, dt);
  updateSnare(G, h, dt);
}
