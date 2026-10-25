// Combat: hit shapes, damage, armour, knockback, statuses, telegraphs,
// projectiles, zones, attack tokens. Pure sim: talks to render/audio/UI only
// through G.bus events.
//
// Exports (all take G first):
//   setBoonRuntime(mod)                  main.js hands in src/sim/boons.js (fireHook, heroStats, applyCall, tickBoons)
//   fire(G, name, ctx) -> ctx            run a boon hook (no-op until boons.js is loaded)
//   inShape(s, x, y, r = 0) -> bool      s.type|s.kind: 'circle' {x,y,r} | 'arc'/'cone' {x,y,r,angle,arc = HALF angle}
//                                        | 'line' {x,y,x2,y2,w = FULL width} | 'ring' {x,y,r,w = band width}
//   targetable(e) -> bool                alive, not spawning, not inv/untargetable
//   hitFoes(G, shape, hit) -> foes[]     hit { dmg, kb, kind, element, stun, hitstop, shake, once:Set, src, crit, pierce }
//   damageFoe(G, e, dmg, opts) -> dealt  opts { kind, element, crit, kb, dx, dy, stun, hitstop, shake, src, noHooks, pierce (ignores armour), quiet }
//   killFoe(G, e, opts)
//   hurtHero(G, dmg, opts) -> dealt      opts { src (entity), x, y, kind, element, kb, ignoreInv, force (even in god mode) }
//   killHero(G)                          normal death path (emits heroDeath)
//   healHero(G, n) -> healed
//   knock(G, e, dx, dy, power)           adds knock velocity (power / mass); world.js applies the wall-slam bonus
//   addStatus(G, e, name, t, power = 1)  e.status[name] = { t, power } (keeps the max of each)
//   tickStatuses(G, e, dt)               (world.js calls it for every foe and the hero)
//   telegraph(G, tg) -> tg               tg { kind:'circle'|'line'|'cone'|'ring', x, y, r, x2, y2, w, angle, arc, t (s until it hits), max,
//                                        color, owner (entity id), dmg? (auto-resolve vs hero at t = 0), kb?, live? (never auto-removed), done? }
//   updateTelegraphs(G, dt)
//   shoot(G, p) -> p                     p { team:'hero'|'foe', x, y, z, vx, vy, r, dmg, life, kind, pierce, homing (rad/s), bounce, owner,
//                                        element, kb, hitKind, update?(G,p,dt), onHit?(G,p,e), light? }
//   updateProjectiles(G, dt)
//   zone(G, z) -> z                      z { kind, x, y, r, t, team:'foe'|'hero'|'boss', dmg, every, delay, slow, element, update?(G,z,dt) }
//   updateZones(G, dt)
//   takeToken(G, e) -> bool, freeToken(G, e)
//   gainCall(G, amount)
//   addHitstop(G, s), emitShake(G, a, x, y)
//
// Bus events emitted here: hit, kill, armorBreak, heroHurt, heroDeath, deathDefiance, dodge, heal, status,
// telegraph, telegraphHit, projectile, projectileDie, zone, shake, callReady.
import { clamp, segDist, angDiff } from '../core/math.js';
import { insideChamber, reflectOffWalls } from './world.js';

export const HOOKS = { fire: null, stats: null, call: null, tick: null };
export function setBoonRuntime(m) {
  if (!m) return;
  if (typeof m.fireHook === 'function') HOOKS.fire = m.fireHook;
  if (typeof m.heroStats === 'function') HOOKS.stats = m.heroStats;
  if (typeof m.applyCall === 'function') HOOKS.call = m.applyCall;
  if (typeof m.tickBoons === 'function') HOOKS.tick = m.tickBoons;
}
export function fire(G, name, ctx) { if (HOOKS.fire) HOOKS.fire(G, name, ctx); return ctx; }

export function addHitstop(G, s) { if (s > 0) G.hitstop = Math.min(G.cfg.hitstop.max, Math.max(G.hitstop, s)); }
export function emitShake(G, a, x, y) { if (a > 0) G.bus.emit('shake', { a, x, y }); }

// ---------------------------------------------------------------- shapes
export function inShape(s, x, y, r = 0) {
  const type = s.type || s.kind;
  const dx = x - s.x, dy = y - s.y;
  if (type === 'circle') return dx * dx + dy * dy <= (s.r + r) * (s.r + r);
  if (type === 'arc' || type === 'cone') {
    const d = Math.hypot(dx, dy);
    if (d > s.r + r) return false;
    if (d <= r + 8) return true;
    const slack = Math.asin(clamp(r / d, 0, 1));
    return Math.abs(angDiff(s.angle, Math.atan2(dy, dx))) <= s.arc + slack;
  }
  if (type === 'line') return segDist(x, y, s.x, s.y, s.x2, s.y2) <= (s.w || 20) / 2 + r;
  if (type === 'ring') { const d = Math.hypot(dx, dy); return Math.abs(d - s.r) <= (s.w || 30) / 2 + r; }
  return false;
}

export const targetable = (e) => e && !e.dead && !e.spawning && !(e.inv > 0) && !e.untargetable && !e._lethal;

// ---------------------------------------------------------------- hitting foes
export function hitFoes(G, shape, hit = {}) {
  const out = [];
  for (const e of G.foes) {
    if (!targetable(e)) continue;
    if (hit.once && hit.once.has(e.id)) continue;
    if (!inShape(shape, e.x, e.y, e.r)) continue;
    if (hit.once) hit.once.add(e.id);
    const dx = e.x - shape.x, dy = e.y - shape.y;
    const dealt = damageFoe(G, e, hit.dmg ?? 10, { ...hit, dx: hit.dx ?? dx, dy: hit.dy ?? dy, hitstop: 0, shake: 0, angle: shape.angle });
    if (dealt >= 0) out.push(e);
  }
  if (out.length) {
    addHitstop(G, hit.hitstop ?? G.cfg.hitstop.light);
    emitShake(G, hit.shake ?? G.cfg.shake.light, shape.x, shape.y);
  }
  return out;
}

export function damageFoe(G, e, dmg, opts = {}) {
  if (!e || e.dead || e._lethal) return -1;
  const c = G.cfg;
  const ctx = { target: e, dmg, kind: opts.kind || 'attack', element: opts.element || null, crit: !!opts.crit, kb: opts.kb ?? 0,
    x: e.x, y: e.y, angle: opts.angle ?? Math.atan2(opts.dy ?? 0, opts.dx ?? 1), src: opts.src ?? null, cancel: false };
  if (!opts.noHooks) { fire(G, 'beforeHit', ctx); if (ctx.cancel) return -1; }
  let d = Math.max(0, ctx.dmg);
  if (e.vuln > 0) d *= 1 + c.armour.brokenBonus;
  // armour soaks first; breaking it stuns
  let armourDmg = 0, broke = false;
  if (e.armor > 0 && !opts.pierce) {
    armourDmg = Math.min(e.armor, d);
    e.armor -= armourDmg; d -= armourDmg;
    if (e.armor <= 0.001) {
      e.armor = 0; broke = true;
      e.stun = Math.max(e.stun, c.armour.brokenStun); e.vuln = c.armour.brokenStun;
      if (e.hasToken) freeToken(G, e);
    }
  }
  const hpDmg = d > 0 ? Math.max(1, Math.round(d)) : 0;
  e.hp -= hpDmg;
  e.flash = 0.1;
  // knockback
  if (ctx.kb) {
    let dx = opts.dx ?? 0, dy = opts.dy ?? 0;
    if (!dx && !dy && G.hero) { dx = e.x - G.hero.x; dy = e.y - G.hero.y; }
    knock(G, e, dx, dy, ctx.kb * (G.hero?.stats?.kbMult ?? 1));
  }
  if (opts.stun && e.armor <= 0 && !e.boss) e.stun = Math.max(e.stun, opts.stun);
  if (e.team === 'foe' && ctx.kind !== 'call' && G.hero) gainCall(G, (hpDmg + armourDmg) * c.call.perDealt);
  const total = hpDmg + Math.round(armourDmg);
  const payload = { target: e, x: e.x, y: e.y, z: e.z, dmg: total, hpDmg, armourDmg, crit: ctx.crit, element: ctx.element, kind: ctx.kind,
    kb: ctx.kb, angle: ctx.angle, quiet: !!opts.quiet };
  G.bus.emit('hit', payload);
  if (broke) G.bus.emit('armorBreak', { e, x: e.x, y: e.y });
  if (!opts.noHooks) fire(G, 'onHit', ctx);
  if (typeof e.onHit === 'function') e.onHit(G, e, payload);
  if (typeof e.onDamaged === 'function') e.onDamaged(G, e, total, opts);
  if (opts.hitstop) addHitstop(G, opts.hitstop);
  if (opts.shake) emitShake(G, opts.shake, e.x, e.y);
  if (e.hp <= 0) {
    if (e.boss) {
      e.hp = 0;
      if (!e._lethal) { e._lethal = true; if (typeof e.onLethal === 'function') e.onLethal(G, e); }
    } else killFoe(G, e, opts);
  }
  return total;
}

export function killFoe(G, e, opts = {}) {
  if (!e || e.dead) return;
  e.dead = true; e.hp = 0; e.deadT = 0; e.state = e.boss ? e.state : 'dying'; e.st = 0;
  if (e.hasToken) freeToken(G, e);
  for (const tg of G.telegraphs) if (tg.owner === e.id && !tg.fired && !tg.live) tg.done = true;
  addHitstop(G, G.cfg.hitstop.kill);
  emitShake(G, G.cfg.shake.kill, e.x, e.y);
  G.bus.emit('kill', { e, x: e.x, y: e.y, kind: e.kind, by: opts.kind || null, elite: !!e.elite });
  fire(G, 'onKill', { e, kind: opts.kind || null, x: e.x, y: e.y });
}

// ---------------------------------------------------------------- the hero
export function hurtHero(G, dmg, opts = {}) {
  const h = G.hero, c = G.cfg;
  if (!h || h.dead || h.state === 'respawn') return 0;
  if (!opts.ignoreInv && h.inv > 0) return 0;
  if (G.god && !opts.force) { G.bus.emit('dodge', { x: h.x, y: h.y, god: true }); return 0; }
  const src = opts.src && typeof opts.src === 'object' ? opts.src : null;
  if (src?.status?.weak) dmg *= 1 - clamp(src.status.weak.power, 0, 0.9);
  const ctx = { dmg, src, x: opts.x ?? src?.x ?? h.x, y: opts.y ?? src?.y ?? h.y, kind: opts.kind || 'hit', element: opts.element || null, cancel: false, dodged: false };
  fire(G, 'beforeHurt', ctx);
  if (ctx.cancel || ctx.dodged || ctx.dmg <= 0) { G.bus.emit('dodge', { x: h.x, y: h.y }); h.inv = Math.max(h.inv, 0.2); return 0; }
  let d = Math.max(1, Math.round(ctx.dmg * (G.assist?.taken ?? 1)));
  if (h.armor > 0) { const a = Math.min(h.armor, d); h.armor -= a; d -= a; if (a) G.bus.emit('wardHit', { x: h.x, y: h.y, absorbed: a }); }
  h.hp -= d;
  h.inv = Math.max(h.inv, c.hero.hurtInv); h.hurtT = 0.3; h.lastHurt = G.t;
  const kdx = h.x - ctx.x, kdy = h.y - ctx.y;
  knock(G, h, kdx || 0.01, kdy, opts.kb ?? c.hero.hurtKnock);
  gainCall(G, d * c.call.perTaken);
  addHitstop(G, c.hitstop.hurt);
  emitShake(G, c.shake.hurt, h.x, h.y);
  G.bus.emit('heroHurt', { dmg: d, x: h.x, y: h.y, kind: ctx.kind, src: src ? src.kind : null });
  fire(G, 'onHurt', ctx);
  if (h.hp <= 0) {
    if (h.deathDefiance > 0) {
      h.deathDefiance--; h.hp = Math.ceil(h.maxHp * 0.4); h.inv = 1.6;
      G.bus.emit('deathDefiance', { x: h.x, y: h.y, left: h.deathDefiance });
    } else killHero(G);
  }
  return d;
}

export function killHero(G) {
  const h = G.hero;
  if (!h || h.dead) return;
  h.hp = 0; h.dead = true; h.state = 'dead'; h.st = 0; h.snare = null; h.dashing = false; h.vx = h.vy = 0;
  G.bus.emit('heroDeath', { x: h.x, y: h.y });
}

export function healHero(G, n) {
  const h = G.hero;
  if (!h || h.dead) return 0;
  const amt = Math.min(h.maxHp - h.hp, Math.round(n * (h.stats?.healMult ?? 1)));
  if (amt > 0) { h.hp += amt; G.bus.emit('heal', { x: h.x, y: h.y, n: amt }); }
  return amt;
}

export function gainCall(G, amount) {
  const h = G.hero;
  if (!h || !(amount > 0)) return;
  const was = h.call;
  h.call = Math.min(1, h.call + amount * (h.stats?.callGain ?? 1));
  const need = h.stats?.callCost ?? 1;
  if (was < need && h.call >= need) G.bus.emit('callReady', {});
}

// ---------------------------------------------------------------- knock + statuses
export function knock(G, e, dx, dy, power) {
  const l = Math.hypot(dx, dy);
  if (!(l > 1e-6) || !power) return;
  const m = Math.max(0.2, e.mass || 1);
  const v = power / m;
  e.kx += (dx / l) * v; e.ky += (dy / l) * v;
  e.knockT = 0.3;
}

export function addStatus(G, e, name, t, power = 1) {
  if (!e || e.dead) return;
  const s = e.status[name];
  if (s) { s.t = Math.max(s.t, t); s.power = Math.max(s.power, power); }
  else e.status[name] = { t, power, acc: 0 };
  if (name === 'stun' && !(e.armor > 0) && !e.boss) e.stun = Math.max(e.stun, t);
  G.bus.emit('status', { e, name, t, power });
}

export function tickStatuses(G, e, dt) {
  for (const name in e.status) {
    const s = e.status[name];
    s.t -= dt;
    if (name === 'burn' && e.team === 'foe' && !e.dead) {
      s.acc = (s.acc || 0) + s.power * dt;
      s.tick = (s.tick || 0) + dt;
      if (s.tick >= 0.25 && s.acc >= 1) {
        const n = Math.floor(s.acc); s.acc -= n; s.tick = 0;
        damageFoe(G, e, n, { kind: 'boon', element: 'dawn', noHooks: true, quiet: true });
      }
    }
    if (s.t <= 0) delete e.status[name];
  }
}

// ---------------------------------------------------------------- telegraphs
let tgId = 1;
export function telegraph(G, tg) {
  tg.id = tg.id ?? tgId++;
  tg.kind = tg.kind || 'circle';
  if (!tg.live) tg.t = Math.max(tg.t ?? G.cfg.minTelegraph, G.cfg.minTelegraph);
  else tg.t = tg.t ?? 0.02;
  tg.max = tg.max ?? tg.t;
  tg.fired = false;
  G.telegraphs.push(tg);
  G.bus.emit('telegraph', { tg });
  return tg;
}

export function updateTelegraphs(G, dt) {
  const T = G.telegraphs;
  for (let i = T.length - 1; i >= 0; i--) {
    const tg = T[i];
    if (tg.done) { T.splice(i, 1); continue; }
    if (tg.live) continue;
    if (tg.follow && tg.owner != null) { const o = G.foes.find((e) => e.id === tg.owner); if (o) { tg.x = o.x; tg.y = o.y; } }
    tg.t -= dt;
    if (!tg.fired && tg.t <= 0) {
      tg.fired = true;
      if (tg.dmg && G.hero && inShape(tg, G.hero.x, G.hero.y, G.hero.r * 0.7)) {
        const src = tg.owner != null ? G.foes.find((e) => e.id === tg.owner) : null;
        hurtHero(G, tg.dmg, { src, x: tg.x, y: tg.y, kind: 'telegraph', kb: tg.kb, element: tg.element });
      }
      G.bus.emit('telegraphHit', { tg });
    }
    if (tg.t < -G.cfg.telegraphLinger) T.splice(i, 1);
  }
}

// ---------------------------------------------------------------- projectiles
let pId = 1;
export function shoot(G, p) {
  const q = Object.assign({ id: pId++, team: 'foe', x: 0, y: 0, z: 30, vx: 0, vy: 0, r: 8, dmg: 8, life: 3, kind: 'orb', pierce: 0, homing: 0, bounce: 0, age: 0, dead: false }, p);
  q.max = q.max ?? q.life;
  if (q.team === 'hero') q.hit = q.hit || [];
  G.projectiles.push(q);
  G.bus.emit('projectile', { p: q });
  return q;
}

function dieProjectile(G, p, why) { p.dead = true; G.bus.emit('projectileDie', { p, x: p.x, y: p.y, why }); }

export function updateProjectiles(G, dt) {
  const P = G.projectiles, h = G.hero;
  for (const p of P) {
    if (p.dead) continue;
    p.age += dt;
    if (typeof p.update === 'function') p.update(G, p, dt);
    if (p.dead) continue;
    if (p.homing) {
      let tx = null, ty = null;
      if (p.team === 'foe' && h && !h.dead) { tx = h.x; ty = h.y; }
      else if (p.team === 'hero') { let bd = 1e9; for (const e of G.foes) { if (!targetable(e)) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; tx = e.x; ty = e.y; } } }
      if (tx != null) {
        const a = Math.atan2(p.vy, p.vx), want = Math.atan2(ty - p.y, tx - p.x);
        const na = a + clamp(angDiff(a, want), -p.homing * dt, p.homing * dt), sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
      }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { dieProjectile(G, p, 'life'); continue; }
    if (!p.ghost && G.chamber && !insideChamber(G.chamber, p.x, p.y, 0)) {
      if (p.bounce > 0) { p.bounce--; reflectOffWalls(G.chamber, p); G.bus.emit('projectileBounce', { p }); }
      else { dieProjectile(G, p, 'wall'); continue; }
    }
    if (!p.ghost && G.chamber?.obstacles) {
      let hitOb = false;
      for (const o of G.chamber.obstacles) if (!o.low && Math.hypot(p.x - o.x, p.y - o.y) < o.r + p.r * 0.5) { hitOb = true; break; }
      if (hitOb) { dieProjectile(G, p, 'wall'); continue; }
    }
    if (p.team === 'foe') {
      if (h && !h.dead && Math.hypot(h.x - p.x, h.y - p.y) < p.r + h.r * 0.8) {
        const src = p.owner != null ? G.foes.find((e) => e.id === p.owner) : null;
        const d = hurtHero(G, p.dmg, { src, x: p.x - p.vx * 0.05, y: p.y - p.vy * 0.05, kind: 'projectile', element: p.element, kb: p.kb ?? 300 });
        if (d > 0 || !p.pierceHero) { if (p.pierce > 0 && h.inv > 0 && d === 0) continue; dieProjectile(G, p, 'hit'); }
      }
    } else if (p.team === 'hero') {
      for (const e of G.foes) {
        if (!targetable(e) || p.hit.includes(e.id)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) > p.r + e.r) continue;
        p.hit.push(e.id);
        damageFoe(G, e, p.dmg, { kind: p.hitKind || 'attack', element: p.element, kb: p.kb ?? 200, dx: p.vx, dy: p.vy, src: 'hero', crit: p.crit });
        if (typeof p.onHit === 'function') p.onHit(G, p, e);
        if (p.pierce > 0) p.pierce--; else { dieProjectile(G, p, 'hit'); break; }
      }
    }
  }
  for (let i = P.length - 1; i >= 0; i--) if (P[i].dead) P.splice(i, 1);
}

// ---------------------------------------------------------------- zones
let zId = 1;
export function zone(G, z) {
  const q = Object.assign({ id: zId++, kind: 'zone', x: 0, y: 0, r: 60, t: 3, team: 'foe', dmg: 0, every: 0.5, acc: 0, delay: 0, slow: 0, age: 0 }, z);
  q.max = q.max ?? q.t;
  G.zones.push(q);
  G.bus.emit('zone', { z: q });
  return q;
}

export function updateZones(G, dt) {
  const Z = G.zones, h = G.hero;
  for (let i = Z.length - 1; i >= 0; i--) {
    const z = Z[i];
    if (z.team === 'boss') continue;   // boss set pieces manage themselves
    z.age += dt;
    if (typeof z.update === 'function') z.update(G, z, dt);
    if (z.done) { Z.splice(i, 1); continue; }
    if (z.delay > 0) { z.delay -= dt; continue; }
    z.t -= dt;
    if (z.t <= 0) { Z.splice(i, 1); continue; }
    z.acc += dt;
    const tickNow = z.acc >= z.every;
    if (tickNow) z.acc -= z.every;
    if (z.team === 'foe') {
      if (h && !h.dead && Math.hypot(h.x - z.x, h.y - z.y) < z.r + h.r * 0.5) {
        if (z.slow) addStatus(G, h, 'slow', 0.2, z.slow);
        if (tickNow && z.dmg) hurtHero(G, z.dmg, { x: z.x, y: z.y, kind: 'zone', element: z.element, kb: 120 });
      }
    } else if (z.team === 'hero') {
      for (const e of G.foes) {
        if (!targetable(e) || Math.hypot(e.x - z.x, e.y - z.y) > z.r + e.r * 0.5) continue;
        if (z.slow) addStatus(G, e, 'slow', 0.25, z.slow);
        if (tickNow && z.dmg) damageFoe(G, e, z.dmg, { kind: 'boon', element: z.element, quiet: false, noHooks: true });
      }
    }
  }
}

// ---------------------------------------------------------------- attack tokens
export function takeToken(G, e) {
  if (e.hasToken) return true;
  let n = 0;
  for (const o of G.foes) if (o.hasToken && !o.dead && !o.boss) n++;
  if (n >= G.cfg.maxAttackers) return false;
  e.hasToken = true;
  return true;
}
export function freeToken(G, e) { if (e) e.hasToken = false; }
