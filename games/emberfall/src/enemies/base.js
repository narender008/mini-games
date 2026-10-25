// Enemy base: the object every enemy kind shares (contract in the build
// brief) plus placement and movement helpers. A kind is a spec:
//   { w, h, hp, contact, shards, color (death burst / light), place: 'floor'|'air'|'ceil'|'surface'|'water',
//     init(e, G, opts), update(e, G, dt), draw(g, e, G),
//     guard?(e, G, dmg, info) -> false to block the hit, or a new dmg,
//     onHurt?(e, G, dmg, info), onDie?(e, G), boxes?(e) -> hit boxes (default [e]) }
// e.st / e.stT is a tiny state machine (setState). e.flash > 0 draws white.
import { TILE } from '../config.js';
import { emit } from '../events.js';
import { addShards } from '../game.js';
import { moveBody, solidAt, tileAtPx } from '../physics.js';
import { T } from '../world/tiles.js';
import { additive, glow } from './paint.js';

const proto = {
  update(G, dt) { this.t += dt; this.stT += dt; if (this.flash > 0) this.flash -= dt; if (this.clank > 0) this.clank -= dt; this.spec.update(this, G, dt); },
  draw(g, G) { this.spec.draw(g, this, G); },
  hurt(G, dmg, info = {}) {
    if (!this.alive) return false;
    const s = this.spec;
    if (s.guard) {
      const r = s.guard(this, G, dmg, info);
      if (r === false) { this.flash = 0.05; this.clank = 0.25; emit('hit', { x: this.x + this.w / 2, y: this.y + this.h / 2, dmg: 0, target: this.kind, blocked: true }); return 'block'; }
      if (typeof r === 'number') dmg = r;
    }
    this.hp -= dmg; this.flash = 0.14;
    emit('hit', { x: this.x + this.w / 2, y: this.y + this.h / 2, dmg, target: this.kind });
    if (s.onHurt) s.onHurt(this, G, dmg, info);
    else if (!s.heavy && info.fromX != null) this.kvx = Math.sign(this.x + this.w / 2 - info.fromX || 1) * 260;
    if (this.hp <= 0) killEnemy(G, this);
    return true;
  },
};

export function makeEnemy(G, kind, spec, x, y, opts = {}) {
  const e = Object.create(proto);
  Object.assign(e, {
    kind, spec, x, y, w: spec.w, h: spec.h, hp: spec.hp, maxHp: spec.hp, alive: true, contact: spec.contact ?? 1,
    vx: 0, vy: 0, kvx: 0, face: opts.dir === 'left' || opts.dir === -1 ? -1 : 1, t: 0, st: 'idle', stT: 0,
    flash: 0, clank: 0, fireT: 0, dying: 0, seed: G.rng(), range: opts.range, opts,
  });
  return e;
}

export function setState(e, st) { e.st = st; e.stT = 0; }

// Death: off the hit lists at once, a short pop animation, shards and an event.
export function killEnemy(G, e) {
  if (!e.alive) return;
  e.alive = false; e.dying = 0.35; e.hp = 0;
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  emit('enemy-die', { x: cx, y: cy, kind: e.kind });
  if (e.spec.shards) addShards(G, e.spec.shards, cx, cy);
  if (e.spec.onDie) e.spec.onDie(e, G);
}

// Draws the death pop for an enemy that is dying (called by drawEnemies).
export function drawDying(g, e, G) {
  const k = e.dying / 0.35, cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  g.save(); g.globalAlpha = k * 0.8;
  g.translate(cx, cy); g.scale(1 + (1 - k) * 0.4, 1 - (1 - k) * 0.5); g.translate(-cx, -cy);
  e.flash = 0.12; e.spec.draw(g, e, G);
  g.restore();
  const c = e.spec.color || '#ff8a2a';
  additive(g, () => { glow(g, cx, cy, Math.max(e.w, e.h) * (1.6 - k), c, k); glow(g, cx, cy, 20 * k + 6, '#ffffff', k); });
}

// ---------------------------------------------------------------- placement
// Spawn points come as a point inside a tile cell; each kind snaps itself.
export function floorBelow(G, x, y, max = 12) {
  let ty = Math.floor(y / TILE);
  for (let i = 0; i < max; i++, ty++) { const c = tileAtPx(G, x, ty * TILE + 1); if (c === T.SOLID || c === T.CRUMBLE || c === T.CRACK || c === T.BRAMBLE || c === T.ONEWAY) return ty * TILE; }
  return null;
}
export function ceilAbove(G, x, y, max = 12) {
  let ty = Math.floor(y / TILE);
  for (let i = 0; i < max; i++, ty--) if (solidAt(G, x, ty * TILE + 1)) return (ty + 1) * TILE;
  return null;
}
// The nearest surface around a cell for wall/floor clingers: { n, x, y }: n is the way the surface faces
// ('up' a floor, 'down' a ceiling, 'left' a wall on the right, 'right' a wall on the left), x, y the contact point.
export function nearestSurface(G, cx, cy) {
  const f = floorBelow(G, cx, cy, 2); if (f != null) return { n: 'up', x: cx, y: f };
  for (const d of [-1, 1]) for (let i = 0; i < 2; i++) {
    const tx = Math.floor(cx / TILE) + d * (i + 1);
    if (solidAt(G, tx * TILE + 1, cy)) return { n: d < 0 ? 'right' : 'left', x: d < 0 ? (tx + 1) * TILE : tx * TILE, y: cy };
  }
  const c = ceilAbove(G, cx, cy, 2); if (c != null) return { n: 'down', x: cx, y: c };
  return { n: 'up', x: cx, y: floorBelow(G, cx, cy, 20) ?? cy + TILE / 2 };
}
export const isWaterAt = (G, x, y) => tileAtPx(G, x, y) === T.WATER;

// ---------------------------------------------------------------- movement
// A ground walker: gravity, knockback, moveBody. Returns the body.
export function walk(G, e, dt, speed) {
  e.vx = speed + e.kvx; e.kvx *= Math.pow(0.002, dt); if (Math.abs(e.kvx) < 5) e.kvx = 0;
  e.vy = Math.min(900, e.vy + 2200 * dt);
  return moveBody(G, e, dt, { platforms: true });
}
// Would a walker stepping dir run off a ledge or into a wall?
export function blockedAhead(G, e, dir) {
  const fx2 = dir > 0 ? e.x + e.w + 4 : e.x - 4;
  if (solidAt(G, fx2, e.y + e.h / 2) || solidAt(G, fx2, e.y + 4)) return true;
  if (!e.onGround) return false;
  const c = tileAtPx(G, fx2, e.y + e.h + 4);
  return !(c === T.SOLID || c === T.CRUMBLE || c === T.CRACK || c === T.ONEWAY || c === T.BRAMBLE);
}
// Turn at edges, walls and the edge of the patrol range (tiles around home).
export function patrol(G, e, dt, speed) {
  if (blockedAhead(G, e, e.face)) e.face = -e.face;
  else if (e.range != null && Math.abs(e.x + e.w / 2 - e.home) > e.range * TILE && Math.sign(e.x + e.w / 2 - e.home) === e.face) e.face = -e.face;
  return walk(G, e, dt, e.face * speed);
}
// A flier: free movement that still bumps off walls.
export function fly(G, e, dt) {
  e.vx += e.kvx; const b = moveBody(G, e, dt, { oneWay: false, platforms: false }); e.vx -= e.kvx;
  e.kvx *= Math.pow(0.002, dt); if (Math.abs(e.kvx) < 5) e.kvx = 0;
  return b;
}

// Player helpers
export const pc = (G) => ({ x: G.player.x + G.player.w / 2, y: G.player.y + G.player.h / 2 });
export function playerDist(G, e) { const p = pc(G); return Math.hypot(p.x - (e.x + e.w / 2), p.y - (e.y + e.h / 2)); }
// Velocity to lob a shot from (x0, y0) to land on (x1, y1) under gravity grav.
export function lob(x0, y0, x1, y1, grav, speed = 420) {
  const t = Math.max(0.55, Math.min(1.5, Math.hypot(x1 - x0, y1 - y0) / speed));
  return { vx: (x1 - x0) / t, vy: (y1 - y0) / t - 0.5 * grav * t };
}
