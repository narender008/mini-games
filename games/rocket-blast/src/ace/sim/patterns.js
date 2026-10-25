// The enemy fire library. One-shot patterns (shoot, aimed, fan, ring, line)
// push bullets at once; emitters (spiral, burst, stream, beam) live in
// S.emitters, are tied to a source object (an enemy or a boss part, anything
// with x, y and dead/gone flags) and fire over time until done or until their
// source dies.
//
// Bullets: { x, y, vx, vy, r, kind, color, t, grazed, acc, home, life, ... }.
// kind 'beam' is a segment from (x, y) to (x1, y1) of half-width r that hurts
// for `life` seconds. Every spawn goes through shoot(), which keeps the
// bullet cap and never puts a bullet on top of the player.
import { TAU, clamp, angDiff } from './rng.js';

export const MAX_BULLETS = 900;
// no bullet may appear closer than this to the player's centre
export const SAFE_SPAWN = 1.15;

export const RADIUS = { orb: 0.2, needle: 0.14, ball: 0.34, beam: 0.22 };

let nextBullet = 1;

export function shoot(S, x, y, ang, speed, kind = 'orb', color = 'magenta', opts) {
  if (S.bullets.length >= MAX_BULLETS) return null;
  const P = S.player;
  const dx = x - P.x;
  const dy = y - P.y;
  if (!P.dead && dx * dx + dy * dy < SAFE_SPAWN * SAFE_SPAWN) return null;
  const f = S.field;
  if (x < -f.halfW - 1.5 || x > f.halfW + 1.5 || y < -f.halfH - 1.5 || y > f.halfH + 3) return null;
  const sp = speed * S.diff.speed;
  const b = {
    id: nextBullet++,
    x,
    y,
    vx: Math.cos(ang) * sp,
    vy: Math.sin(ang) * sp,
    r: (opts && opts.r) || RADIUS[kind] || 0.2,
    kind,
    color,
    t: 0,
    grazed: false,
    acc: (opts && opts.acc) || 0, // speed change per second along the heading
    max: (opts && opts.max) || 0, // speed limit when accelerating (0 = none)
    home: (opts && opts.home) || 0, // seconds of homing left
    turn: (opts && opts.turn) || 0, // homing turn rate rad/s
    curve: (opts && opts.curve) || 0, // constant turn rad/s (curving orbs)
    life: (opts && opts.life) || 0, // > 0: dies after this many seconds
  };
  S.bullets.push(b);
  return b;
}

export function aimAt(S, x, y) {
  return Math.atan2(S.player.y - y, S.player.x - x);
}

// n bullets aimed at the player, spread over arc radians
export function aimed(S, x, y, speed, kind, color, n = 1, arc = 0, opts) {
  return fan(S, x, y, aimAt(S, x, y), n, arc, speed, kind, color, opts);
}

export function fan(S, x, y, ang, n, arc, speed, kind, color, opts) {
  const step = n > 1 ? arc / (n - 1) : 0;
  const a0 = ang - arc / 2;
  let any = false;
  for (let i = 0; i < n; i++) any = shoot(S, x, y, n > 1 ? a0 + step * i : ang, speed, kind, color, opts) || any;
  if (any) S.events.push({ type: 'enemyFire', x, y, kind, n, enemy: S.src });
  return any;
}

// a full ring; gap (radians, optional) leaves an opening centred on gapAt
export function ring(S, x, y, n, speed, kind, color, offset = 0, opts, gap = 0, gapAt = 0) {
  const step = TAU / n;
  let any = false;
  for (let i = 0; i < n; i++) {
    const a = offset + step * i;
    if (gap > 0 && Math.abs(angDiff(a, gapAt)) < gap / 2) continue;
    any = shoot(S, x, y, a, speed, kind, color, opts) || any;
  }
  if (any) S.events.push({ type: 'enemyFire', x, y, kind, n, enemy: S.src });
  return any;
}

// bullets spaced along a segment, all fired in one direction (a curtain)
export function line(S, x0, y0, x1, y1, n, ang, speed, kind, color, opts) {
  for (let i = 0; i < n; i++) {
    const k = n > 1 ? i / (n - 1) : 0.5;
    shoot(S, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, ang, speed, kind, color, opts);
  }
  S.events.push({ type: 'enemyFire', x: (x0 + x1) / 2, y: (y0 + y1) / 2, kind, n, enemy: S.src });
}

// ------------------------------------------------------------ emitters

function emitter(S, src, o) {
  const e = { src, ox: o.ox || 0, oy: o.oy || 0, t: 0, done: false, shot: 0, acc: 0, ...o };
  S.emitters.push(e);
  return e;
}

// arms bullets every 1/rate s, the angle turning by spin rad/s, for dur s
export function spiral(S, src, o) {
  return emitter(S, src, { type: 'spiral', arms: 3, rate: 8, spin: 1.6, speed: 4.5, kind: 'orb', color: 'magenta', dur: 3, a: o.a ?? -Math.PI / 2, ...o });
}

// n shots, one every interval s, aimed at the player each time (or along ang)
export function burst(S, src, o) {
  return emitter(S, src, { type: 'burst', n: 4, interval: 0.09, speed: 9, kind: 'needle', color: 'orange', spread: 0, per: 1, arc: 0, ...o });
}

// a beam: telegraph line for tele s (tracking the player until lock, a 0..1
// fraction of tele), then a beam for life s, optionally sweeping
export function beam(S, src, o) {
  const e = emitter(S, src, { type: 'beam', tele: 1, life: 0.35, width: 0.22, len: 60, lock: 0.7, sweep: 0, color: 'red', ...o });
  e.ang = o.ang ?? aimAt(S, src.x + e.ox, src.y + e.oy);
  e.track = o.ang == null;
  e.b = null;
  return e;
}

export function stepEmitters(S, dt) {
  const list = S.emitters;
  S.teles.length = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.done) continue;
    const src = e.src;
    if (src.dead || src.gone) {
      endEmitter(e);
      continue;
    }
    const x = src.x + e.ox;
    const y = src.y + e.oy;
    S.src = src.type || (src.kind ? 'boss' : undefined);
    e.t += dt;
    if (e.delay > 0) {
      e.delay -= dt;
      continue;
    }
    if (e.type === 'spiral') {
      e.acc += dt * e.rate;
      while (e.acc >= 1) {
        e.acc -= 1;
        for (let k = 0; k < e.arms; k++) shoot(S, x, y, e.a + (k * TAU) / e.arms, e.speed, e.kind, e.color, e.opts);
        if ((e.shot++ & 3) === 0) S.events.push({ type: 'enemyFire', x, y, kind: e.kind, n: e.arms, enemy: S.src });
      }
      e.a += e.spin * dt;
      if (e.t >= e.dur) e.done = true;
    } else if (e.type === 'burst' || e.type === 'stream') {
      e.acc += dt;
      while (e.acc >= e.interval && e.shot < e.n) {
        e.acc -= e.interval;
        const a = e.aim === false ? e.ang : aimAt(S, x, y) + (e.jitter ? (((e.shot * 7919) % 13) / 13 - 0.5) * e.jitter : 0);
        if (e.per > 1) fan(S, x, y, a, e.per, e.arc, e.speed, e.kind, e.color, e.opts);
        else if (shoot(S, x, y, a, e.speed, e.kind, e.color, e.opts) && e.shot === 0) S.events.push({ type: 'enemyFire', x, y, kind: e.kind, n: e.n, enemy: S.src });
        e.shot++;
      }
      if (e.shot >= e.n) e.done = true;
    } else if (e.type === 'beam') {
      if (e.t < e.tele) {
        if (e.track && e.t < e.tele * e.lock) {
          const want = aimAt(S, x, y);
          const d = angDiff(e.ang, want);
          e.ang += clamp(d, -2.4 * dt, 2.4 * dt);
        }
        // each beam has its own telegraph (S.teles lists them all); the source
        // shows the latest one as .tele
        const tele = e.tl || (e.tl = { x0: 0, y0: 0, x1: 0, y1: 0, k: 0, kind: 'beam', w: e.width });
        src.tele = tele;
        S.teles.push(tele);
        tele.x0 = x;
        tele.y0 = y;
        tele.x1 = x + Math.cos(e.ang) * e.len;
        tele.y1 = y + Math.sin(e.ang) * e.len;
        tele.k = e.t / e.tele;
        if (!e.told) {
          e.told = true;
          S.events.push({ type: 'telegraph', x, y, x1: tele.x1, y1: tele.y1, dur: e.tele, kind: 'beam', enemy: S.src });
        }
      } else {
        if (!e.b) {
          if (src.tele === e.tl) src.tele = null;
          if (S.bullets.length < MAX_BULLETS) {
            e.b = { id: nextBullet++, x, y, vx: 0, vy: 0, r: e.width, kind: 'beam', color: e.color, t: 0, grazed: false, acc: 0, max: 0, home: 0, turn: 0, curve: 0, life: e.life, x1: x, y1: y };
            S.bullets.push(e.b);
            S.events.push({ type: 'enemyFire', x, y, kind: 'beam', n: 1, enemy: S.src });
          }
        }
        if (e.b) {
          e.ang += e.sweep * dt;
          e.b.x = x;
          e.b.y = y;
          e.b.x1 = x + Math.cos(e.ang) * e.len;
          e.b.y1 = y + Math.sin(e.ang) * e.len;
        }
        if (e.t >= e.tele + e.life) e.done = true;
      }
    }
  }
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.done) list[j++] = e;
    else if (e.type === 'beam' && e.src.tele === e.tl && e.tl) e.src.tele = null;
  }
  list.length = j;
}

function endEmitter(e) {
  e.done = true;
  if (e.b) e.b.life = Math.min(e.b.life, e.b.t);
  if (e.type === 'beam' && e.src && e.src.tele === e.tl) e.src.tele = null;
}

// stop every emitter of a source (used when an attack is cancelled)
export function cancelEmitters(S, src) {
  for (const e of S.emitters) if (e.src === src) endEmitter(e);
}
