// Boss base. A boss def: { id, name, epithet, hp, phases: [hp fractions where phase 2, 3 begin],
//   deathTime (s of death animation before defeatBoss), create(G, cx, cy) -> makeBoss(...),
//   update(b, G, dt), draw(g, b, G), guard?(b, G, dmg, info) -> false (blocked, clank) | 'immune' | dmg,
//   onPhase?(b, G, phase), onDeath?(b, G), death?(b, G, dt) (animation step), boxes?(b), weak?(b) }
// The boss is an enemy (contract in the build brief) with boss: true, phase, weakBox() -> { x, y, w, h }
// (the spot to swing at, copied into G.boss by enemies/index.js) and boxes() (hit and contact boxes).
// A debug hurt (info.src 'debug') ignores armour and, on a kill, calls defeatBoss at once.
import { TILE } from '../../config.js';
import { emit } from '../../events.js';
import { defeatBoss } from '../../game.js';
import { solidAt } from '../../physics.js';
import { floorBelow, ceilAbove, killEnemy } from '../base.js';

export function makeBoss(G, def, o) {
  const b = {
    boss: true, id: def.id, kind: def.id, def, hp: def.hp, maxHp: def.hp, alive: true, contact: 0, phase: 1,
    t: 0, st: 'intro', stT: 0, flash: 0, clank: 0, removed: false, deathT: 0, defeated: false, face: -1, vx: 0, vy: 0,
    ...o,
    update(G, dt) {
      this.t += dt; this.stT += dt;
      if (this.flash > 0) this.flash -= dt; if (this.clank > 0) this.clank -= dt;
      if (!this.alive) {
        this.deathT += dt;
        if (def.death) def.death(this, G, dt);
        if (!this.defeated && this.deathT >= def.deathTime) { this.defeated = true; defeatBoss(G, def.id); }
        if (this.deathT >= def.deathTime + 1.2) this.removed = true;
        return;
      }
      def.update(this, G, dt);
    },
    draw(g, G) { def.draw(g, this, G); },
    hurt(G, dmg, info = {}) {
      if (!this.alive) return false;
      if (info.src !== 'debug' && def.guard) {
        const r = def.guard(this, G, dmg, info);
        if (r === 'immune') return false;
        if (r === false) { this.clank = 0.25; emit('hit', { x: info.fromX ?? this.x, y: this.y + this.h / 2, dmg: 0, target: def.id, blocked: true }); return 'block'; }
        if (typeof r === 'number') dmg = r;
      }
      this.hp = Math.max(0, this.hp - dmg); this.flash = 0.12;
      const w = this.weakBox();
      emit('hit', { x: w.x + w.w / 2, y: w.y + w.h / 2, dmg, target: def.id, boss: true });
      const f = this.hp / this.maxHp;
      while (def.phases && this.phase <= def.phases.length && f <= def.phases[this.phase - 1] && this.hp > 0) {
        this.phase++;
        emit('boss-phase', { id: def.id, phase: this.phase }); emit('boss-roar', { id: def.id }); emit('shake', { amp: 10, t: 0.5 });
        if (def.onPhase) def.onPhase(this, G, this.phase);
      }
      if (this.hp <= 0) {
        this.alive = false; this.deathT = 0; this.contact = 0;
        G.shots = G.shots.filter((s) => s.side === 'player');
        for (const e of G.enemies) if (!e.boss && e.alive) killEnemy(G, e);
        emit('boss-roar', { id: def.id }); emit('shake', { amp: 16, t: 1.2 }); emit('flash', { color: '#ffffff', a: 0.5 });
        if (def.onDeath) def.onDeath(this, G);
        if (info.src === 'debug') { this.defeated = true; defeatBoss(G, def.id); }
      }
      return true;
    },
    weakBox() { const w = def.weak ? def.weak(this) : this; return { x: Math.round(w.x), y: Math.round(w.y), w: Math.round(w.w), h: Math.round(w.h) }; },
    boxes() { return def.boxes ? def.boxes(this) : [this]; },
  };
  return b;
}

export function setSt(b, st) { b.st = st; b.stT = 0; }

// The arena around a point: floor y (the most common floor height across it, so pools and
// steps don't fool it), ceiling y, inner wall xs (room px).
export function arena(G, cx, cy) {
  const f0 = floorBelow(G, cx, cy, 20) ?? G.room.h - TILE;
  const y = f0 - 110;
  let x0 = cx, x1 = cx;
  while (x0 > 0 && !solidAt(G, x0 - 1, y)) x0 -= TILE / 4;
  while (x1 < G.room.w && !solidAt(G, x1 + 1, y)) x1 += TILE / 4;
  x0 = Math.floor(x0 / TILE) * TILE; x1 = Math.ceil(x1 / TILE) * TILE;
  const count = new Map();
  for (let x = x0 + TILE / 2; x < x1; x += TILE) { const f = floorBelow(G, x, y, 16); if (f != null) count.set(f, (count.get(f) || 0) + 1); }
  let floor = f0, best = 0;
  for (const [f, n] of count) if (n > best || (n === best && f < floor)) { best = n; floor = f; }
  const ceil = ceilAbove(G, cx, y, 20) ?? 0;
  return { x0, x1, floor, ceil, w: x1 - x0, cx: (x0 + x1) / 2 };
}

// Tile edits that a boss makes for a while (flood rows, lava floor): remembers what was there.
export function setTiles(G, list, code, store) {
  const r = G.room;
  for (const [tx, ty] of list) {
    if (tx < 0 || ty < 0 || tx >= r.tw || ty >= r.th) continue;
    const i = ty * r.tw + tx;
    if (!store.has(i)) store.set(i, r.tiles[i]);
    r.tiles[i] = code;
  }
  r.version = (r.version || 0) + 1;
}
export function restoreTiles(G, store, keep = null) {
  const r = G.room;
  for (const [i, c] of store) if (!keep || !keep(i)) { r.tiles[i] = c; store.delete(i); }
  r.version = (r.version || 0) + 1;
}
