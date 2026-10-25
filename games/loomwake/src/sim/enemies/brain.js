// The shared foe brain: the state machine every Unravelled runs, plus the
// small toolkit the archetype modules and attacks use. Deterministic: the
// only randomness is G.rng.ai.
//
// States (e.state, e.st seconds in state, e.stDur its planned length):
//   pending  waiting out a spawn delay (hidden, untargetable)
//   spawn    the black-thread vortex rises (0.6 s, invulnerable)
//   move     approach / flank / strafe (the archetype's move())
//   windup   the anticipation pose; a telegraph is on the floor (>= 0.35 s)
//   active   the attack's live frames
//   recover  the punish window
//   stagger  knocked off balance by a hit (only when not armoured)
//   stun     armour broken (engine sets e.stun = 1.5) or stunned by a power
//   blink    a short vanish (casters), see caster.js
//   dying    unravelling; e.dead is set by the engine's killFoe, e.gone ends it
// e.atk is the current attack id, e.A its ATTACKS row, e.chain attacks left.
import * as C from '../combat.js';
import { ATTACKS } from '../../content/enemies.js';
import { clamp, damp, len, segDist, wrapAng, pointInPoly } from '../../core/math.js';

export const DYING = 1.25;      // seconds the unravel plays
export const SPAWN = 0.6;       // the vortex
const STAGGER = 0.3;
const STAGGER_IMMUNE = 0.55;    // poise after a stagger, so nothing is stun-locked forever

export const hero = (G) => G.hero;
export const heroAlive = (G) => G.hero && !G.hero.dead && G.hero.hp > 0;
export const rnd = (G) => G.rng.ai;

export function setState(e, s, dur = 0) { e.state = s; e.st = 0; e.stDur = dur; }

export function angleTo(e, x, y) { return Math.atan2(y - e.y, x - e.x); }
export function distTo(e, x, y) { return len(x - e.x, y - e.y); }
export function heroDist(G, e) { const h = G.hero; return h ? len(h.x - e.x, h.y - e.y) : 1e9; }
export function heroAng(G, e) { const h = G.hero; return h ? Math.atan2(h.y - e.y, h.x - e.x) : e.facing; }

// turn e.facing toward angle a at rate rad/s
export function turn(e, a, rate, dt) {
  const d = wrapAng(a - e.facing);
  const s = rate * dt;
  e.facing = wrapAng(e.facing + clamp(d, -s, s));
}

// smoothly steer the velocity the world integrates
export function steer(e, tvx, tvy, dt, accel = 8) {
  e.vx = damp(e.vx, tvx, accel, dt);
  e.vy = damp(e.vy, tvy, accel, dt);
}
export function brake(e, dt, rate = 10) { steer(e, 0, 0, dt, rate); }

// Inside the chamber? (world.js may offer a better test; the polygon is the rule)
export function inside(G, x, y, margin = 0) {
  const sh = G.chamber && G.chamber.shape;
  if (!sh || sh.length < 3) return true;
  if (!pointInPoly(x, y, sh)) return false;
  if (margin > 0) {
    for (const a of [0, 1.57, 3.14, 4.71]) if (!pointInPoly(x + Math.cos(a) * margin, y + Math.sin(a) * margin, sh)) return false;
  }
  for (const o of G.chamber.obstacles || []) if (len(x - o.x, y - o.y) < (o.r || 0) + margin * 0.6) return false;
  return true;
}

// Neighbour push used in desired-point picking (the world adds a soft
// separation too; this one keeps packs spread into a ring, not a clump).
export function spread(G, e, radius = 70) {
  let sx = 0, sy = 0;
  for (const o of G.foes) {
    if (o === e || o.dead || o.state === 'pending') continue;
    const dx = e.x - o.x, dy = e.y - o.y, d = len(dx, dy), m = radius + (o.r - 18);
    if (d > 0.01 && d < m) { const k = (m - d) / m; sx += (dx / d) * k; sy += (dy / d) * k; }
  }
  return [sx, sy];
}

// A point on a ring around the hero, offset by this foe's slot angle so a pack
// surrounds rather than stacks. e.slot drifts with e.flank (+1/-1).
export function ringPoint(G, e, dist, dt, drift = 0.5) {
  const h = G.hero;
  let a = Math.atan2(e.y - h.y, e.x - h.x);
  a += e.flank * drift * dt * 2;
  // pull toward the slot angle relative to other attackers of the hero
  let crowd = 0;
  for (const o of G.foes) {
    if (o === e || o.dead || o.boss || o.state === 'pending') continue;
    const oa = Math.atan2(o.y - h.y, o.x - h.x), d = wrapAng(a - oa);
    if (Math.abs(d) < 0.7 && len(o.x - h.x, o.y - h.y) < dist * 1.6) crowd += Math.sign(d || e.flank) * (0.7 - Math.abs(d));
  }
  a += crowd * 0.9;
  return [h.x + Math.cos(a) * dist, h.y + Math.sin(a) * dist];
}

// Go toward (tx, ty) at speed, with spread, stopping gently.
export function goTo(G, e, tx, ty, speed, dt, accel = 7) {
  const dx = tx - e.x, dy = ty - e.y, d = len(dx, dy);
  const [sx, sy] = spread(G, e);
  let vx = 0, vy = 0;
  if (d > 6) { const k = Math.min(1, d / 60); vx = (dx / d) * speed * k; vy = (dy / d) * speed * k; }
  vx += sx * speed * 0.9; vy += sy * speed * 0.9;
  steer(e, vx, vy, dt, accel);
}

// ---------- hero hit tests ----------
export function heroInCircle(G, x, y, r) { const h = G.hero; return !!h && len(h.x - x, h.y - y) < r + (h.r || 20) * 0.7; }
export function heroInLine(G, ax, ay, bx, by, w) { const h = G.hero; return !!h && segDist(h.x, h.y, ax, ay, bx, by) < w / 2 + (h.r || 20) * 0.7; }
export function heroInArc(G, x, y, r, ang, arc) {
  const h = G.hero; if (!h) return false;
  const dx = h.x - x, dy = h.y - y, d = len(dx, dy);
  if (d > r + (h.r || 20) * 0.7) return false;
  if (d < (h.r || 20) + 10) return true;
  return Math.abs(wrapAng(Math.atan2(dy, dx) - ang)) <= arc / 2 + 0.12;
}
export function heroInRing(G, x, y, r, w) { const h = G.hero; if (!h) return false; const d = len(h.x - x, h.y - y); return Math.abs(d - r) < w / 2 + (h.r || 20) * 0.6; }

// Damage the hero from foe e (engine's hurtHero handles i-frames, armour, defiance).
export function hurt(G, e, mul = 1, o = {}) {
  const h = G.hero; if (!h) return false;
  const dmg = Math.max(1, Math.round(e.dmg * mul));
  const x = o.x ?? e.x, y = o.y ?? e.y;
  const r = C.hurtHero ? C.hurtHero(G, dmg, { src: e, x, y, kind: o.kind || e.atk || 'melee', kb: o.kb ?? 420, element: o.element }) : false;
  return r !== false;
}

// ---------- telegraphs ----------
export function tg(G, e, o) {
  const t = Object.assign({ color: e.elite ? '#ff3a7a' : '#ff5a7a', owner: e.id }, o);
  t.max = t.t;
  if (C.telegraph) C.telegraph(G, t); else G.telegraphs.push(t);
  (e.tgs || (e.tgs = [])).push(t);
  return t;
}
export function clearTgs(e) { if (e.tgs) { for (const t of e.tgs) t.done = true; e.tgs.length = 0; } }

// ---------- tokens ----------
export function token(G, e) {
  if (e.hasToken) return true;
  const ok = C.takeToken ? C.takeToken(G, e) : true;
  if (ok) e.hasToken = true;
  return ok;
}
export function release(G, e) { if (e.hasToken) { e.hasToken = false; if (C.freeToken) C.freeToken(G, e); } }

// ---------- foe effects that outlive one frame (rings, lobs, threads) ----------
export function fx(G, o) { (G.foeFx || (G.foeFx = [])).push(Object.assign({ t: 0, done: false }, o)); return G.foeFx[G.foeFx.length - 1]; }
export function emit(G, type, p) { if (G.bus) G.bus.emit(type, p); }

// ---------- attack flow ----------
export function begin(G, e, id, X) {
  const A = ATTACKS[id];
  e.atk = id; e.A = A; e.hitOnce = false; e.aim = heroAng(G, e); e.mem = {};
  e.chain = e.chain > 0 ? e.chain : (A.chain || 1);
  let w = A.wind * (e.enraged ? 0.82 : 1);
  if (e.chainIdx > 0) w *= 0.8;
  w = Math.max(G.cfg?.minTelegraph ?? 0.35, w);
  setState(e, 'windup', w);
  e.attacking = true;
  const fn = X[id];
  if (fn && fn.wind0) fn.wind0(G, e, A);
  emit(G, 'foeWindup', { e, atk: id });
}

export function cancel(G, e) {
  clearTgs(e);
  release(G, e);
  e.attacking = false; e.atk = null; e.chain = 0; e.chainIdx = 0;
  e.z = Math.max(0, e.z);
}

// Called by the engine after every hit (e.onHit), and from the bus fallback.
export function onHit(G, e, hit) {
  if (e.dead || e.state === 'dying') return;
  e.hurtT = 0.28;
  const h = G.hero;
  if (h) e.hurtA = Math.atan2(e.y - h.y, e.x - h.x);
  const armoured = e.armor > 0 || e.def.superArmor;
  if (armoured) { e.clank = 0.18; return; }
  if (e.stagImm > 0 || e.state === 'stun' || e.state === 'spawn' || e.state === 'blink') return;
  // committed active frames of heavy foes are not interrupted (they have armour anyway)
  if (e.state === 'active' && e.def.mass >= 3) return;
  cancel(G, e);
  setState(e, 'stagger', STAGGER + ((hit && hit.kind === 'special') ? 0.15 : 0));
  e.stagImm = STAGGER + STAGGER_IMMUNE;
}

// The per-tick driver. M is the archetype module: { move(G,e,dt), choose(G,e) -> id|null }
// X is the attack table (attacks.js).
export function run(G, e, dt, M, X) {
  // world.js already advanced e.st and counted down flash, stun, inv, vuln and statuses
  e.hurtT = Math.max(0, (e.hurtT || 0) - dt);
  e.clank = Math.max(0, (e.clank || 0) - dt);
  e.stagImm = Math.max(0, (e.stagImm || 0) - dt);

  if (e.dead) {
    if (e.state !== 'dying') {
      cancel(G, e);
      setState(e, 'dying', DYING);
      e.untargetable = true; e.attacking = false; e.z = 0;
      if (M.die) M.die(G, e);
    }
    brake(e, dt, 5);
    if (M.dying) M.dying(G, e, dt);
    if (e.st >= e.stDur) e.gone = true;
    return;
  }

  if (e.state === 'pending') {
    e.vx = e.vy = 0;
    if (e.st >= e.stDur) {
      setState(e, 'spawn', SPAWN); e.hidden = false;
      tg(G, e, { kind: 'circle', x: e.x, y: e.y, r: e.r * 2.2, t: SPAWN, color: '#8a6cff', spawn: true });
      emit(G, 'foeRise', { e });
    }
    return;
  }
  if (e.state === 'spawn') {
    e.vx = e.vy = 0;
    if (e.st >= e.stDur) { e.spawning = false; e.inv = 0; e.untargetable = false; setState(e, 'move'); e.facing = heroAng(G, e); }
    return;
  }

  // engine counts e.stun down; armour break sets it
  if (e.stun > 0 || (e.status && e.status.freeze && e.status.freeze.t > 0)) {
    if (e.state !== 'stun') { cancel(G, e); setState(e, 'stun', e.stun); }
    brake(e, dt, 12);
    e.z = Math.max(0, e.z - 400 * dt);
    return;
  }
  if (e.state === 'stun') setState(e, 'recover', 0.3);

  if (!heroAlive(G)) {
    if (e.attacking && e.state !== 'active') cancel(G, e);
    if (e.state !== 'active') { brake(e, dt); if (e.state !== 'move') setState(e, 'move'); return; }
  }

  // enrage (Loomhulk and kin)
  if (e.def.enrage && !e.enraged && e.hp <= e.maxHp * 0.5) { e.enraged = true; e.speed *= 1.25; emit(G, 'foeEnrage', { e }); }

  const fn = e.atk ? X[e.atk] : null;
  switch (e.state) {
    case 'stagger':
      brake(e, dt, 6);
      if (e.st >= e.stDur) setState(e, 'move');
      break;
    case 'windup': {
      if (fn && fn.wind) fn.wind(G, e, e.A, dt); else { brake(e, dt); turn(e, heroAng(G, e), 4, dt); }
      if (e.st >= e.stDur) { setState(e, 'active', e.A.act); e.hitOnce = false; if (fn && fn.start) fn.start(G, e, e.A); }
      break;
    }
    case 'active': {
      if (fn && fn.act) fn.act(G, e, e.A, dt);
      if (e.st >= e.stDur || e.atkDone) {
        e.atkDone = false;
        if (fn && fn.end) fn.end(G, e, e.A);
        clearTgs(e);
        e.chain--; e.chainIdx = (e.chainIdx || 0) + 1;
        if (e.chain > 0 && heroAlive(G)) { begin(G, e, e.atk, X); }
        else { e.chainIdx = 0; e.chain = 0; release(G, e); e.attacking = false; setState(e, 'recover', e.A.rec); }
      }
      break;
    }
    case 'recover':
      brake(e, dt, 5);
      e.z = Math.max(0, e.z - 500 * dt);
      if (e.st >= e.stDur) {
        const A = e.A; e.atk = null;
        e.cd = A ? rnd(G).range(A.cd[0], A.cd[1]) : 0.5;
        setState(e, 'move');
      }
      break;
    case 'blink':
      if (M.blink) M.blink(G, e, dt); else setState(e, 'move');
      break;
    default: {
      if (e.state !== 'move') setState(e, 'move');
      e.cd -= dt;
      M.move(G, e, dt);
      if (e.cd <= 0 && heroAlive(G)) {
        const id = M.choose(G, e);
        if (id) {
          if (token(G, e)) begin(G, e, id, X);
          else e.cd = rnd(G).range(0.25, 0.6); // wait our turn: keep circling
        }
      }
    }
  }
}
