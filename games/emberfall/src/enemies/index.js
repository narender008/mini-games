// Enemies: the registry of the 16 kinds (one file per biome) and the 4
// bosses (bosses/*.js), spawning from the room's enemy entities, the update
// and draw loops, and the boss fight entry points.
//   spawnEnemies(G)                 world.js calls it at the end of enterRoom: G.enemies from the room def
//   spawnEnemy(G, kind, x, y, opts) one enemy near room px (x, y); it snaps to its floor/ceiling/wall/water
//   updateEnemies(G, dt)            every enemy, boss triggers (player inside a boss ent's trigger rect)
//   drawEnemies(g, G)               world layer, camera transform set
//   startBoss(G, id)                spawn the boss at the room's boss ent, close the doors, banner
//   hurtBoss(G, n)                  damage the current boss (debug; ignores armour and phases)
//   killAll(G)                      kill every ordinary enemy in the room
// Room enemy ents: { t: 'enemy', kind, x, y (tiles), dir?: 'left'|'right', range?: tiles of patrol }.
import { TILE, W, H, BOSSES } from '../config.js';
import { emit } from '../events.js';
import * as world from '../world/world.js';
import { makeEnemy, killEnemy, drawDying } from './base.js';
import { useG } from './paint.js';
import hollow from './hollow.js';
import thicket from './thicket.js';
import cloister from './cloister.js';
import core from './core.js';
import wyrm from './bosses/gravel-wyrm.js';
import sporemother from './bosses/sporemother.js';
import abbot from './bosses/drowned-abbot.js';
import king from './bosses/cinder-king.js';

export const KINDS = { ...hollow, ...thicket, ...cloister, ...core };
export const BOSS_DEFS = { 'gravel-wyrm': wyrm, sporemother, 'drowned-abbot': abbot, 'cinder-king': king };

export function spawnEnemy(G, kind, x, y, opts = {}) {
  const spec = KINDS[kind];
  if (!spec) { console.warn('emberfall: unknown enemy kind', kind); return null; }
  const e = makeEnemy(G, kind, spec, x - spec.w / 2, y - spec.h / 2, opts);
  e.home = x;
  if (spec.place) spec.place(e, G, x, y);
  if (spec.init) spec.init(e, G, opts);
  G.enemies.push(e);
  return e;
}

const defEnts = (G) => G.room?.def?.ents || [];
export function spawnEnemies(G) {
  G.enemies = [];
  for (const en of defEnts(G)) {
    if (en.t !== 'enemy') continue;
    spawnEnemy(G, en.kind, (en.x + 0.5) * TILE, (en.y + 0.5) * TILE, { dir: en.dir, range: en.range });
  }
}

export function updateEnemies(G, dt) {
  if (!G.player || !G.room) return;
  // a boss fight starts when the player steps into its trigger (tiles)
  if (!G.boss) {
    const p = G.player, px = (p.x + p.w / 2) / TILE, py = (p.y + p.h / 2) / TILE;
    for (const en of defEnts(G)) {
      if (en.t !== 'boss' || G.prog.bosses[en.id] || !en.trigger) continue;
      const [tx, ty, tw, th] = en.trigger;
      if (px >= tx && px < tx + tw && py >= ty && py < ty + th) { startBoss(G, en.id); break; }
    }
  }
  const list = G.enemies.slice();
  for (const e of list) {
    if (e.alive || e.boss) e.update(G, dt);
    else e.dying -= dt;
  }
  G.enemies = G.enemies.filter((e) => (e.boss ? !e.removed : e.alive || e.dying > 0));
  if (G.boss) {   // keep the boss summary current (main.js state() and the HUD read it)
    const b = G.enemies.find((e) => e.boss);
    if (b) { G.boss.hp = Math.max(0, b.hp); G.boss.phase = b.phase; Object.assign(G.boss, b.weakBox()); }
  }
}

export function drawEnemies(g, G) {
  useG(G);
  const c = G.cam, x0 = c.x - 160, x1 = c.x + W + 160, y0 = c.y - 160, y1 = c.y + H + 160;
  for (const e of G.enemies) {
    if (!e.boss && (e.x + e.w < x0 || e.x > x1 || e.y + e.h < y0 || e.y > y1)) continue;
    g.save();
    if (e.alive || e.boss) e.draw(g, G); else drawDying(g, e, G);
    g.restore();
  }
}

export function startBoss(G, id) {
  const def = BOSS_DEFS[id];
  if (!def || G.prog.bosses[id] || (G.boss && G.boss.id === id)) return null;
  const en = defEnts(G).find((e) => e.t === 'boss' && e.id === id);
  const cx = en ? (en.x + 0.5) * TILE : G.room.w / 2, cy = en ? (en.y + 0.5) * TILE : G.room.h / 2;
  G.shots = [];
  world.closeDoors?.(G);
  const b = def.create(G, cx, cy);
  G.enemies.push(b);
  G.boss = { id, name: BOSSES[id]?.name || def.name, hp: b.hp, maxHp: b.maxHp, phase: 1, ...b.weakBox() };
  emit('boss-spawn', { id });
  G.banner = { title: G.boss.name, sub: def.epithet, t: 0, life: 3.5, kind: 'boss' };
  return b;
}

export function hurtBoss(G, n) {
  const b = G.enemies.find((e) => e.boss && e.alive);
  if (b) b.hurt(G, n, { src: 'debug', force: true });
}

export function killAll(G) {
  for (const e of G.enemies) if (!e.boss && e.alive) killEnemy(G, e);
  G.shots = G.shots.filter((s) => s.side === 'player');
}
