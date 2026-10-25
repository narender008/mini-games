// Emberfall world: the static map (rooms/*.js, 67 rooms on a grid of
// 32 x 18 tile screens), the live room, and everything in it that is not an
// enemy: moving platforms, crumbling floors, pickups, braziers, lore tablets,
// boss triggers, boss doors, the ending light and walking from room to room.
//
//   loadWorld(G)          G.world = { rooms: { id: def }, ids, start: { room, x, y } }
//   enterRoom(G, id, at)  builds G.room (shape in game.js); at = hitbox top-left in room px,
//                         or null for the room's entry (its brazier, else a standing spot by an exit)
//   updateWorld(G, dt)    platforms, crumbles, pickups, near flags, lore, boss triggers, ending, transitions
//   closeDoors / openDoors(G)       'D' tiles to SOLID and back (the boss fight)
//   breakTile / burnTile(G, tx, ty) cracks (Ember Dash) / ember-thorns (Fire Form): the whole
//                         connected group goes, for good (G.prog.opened 'room:tx,ty')
//   bossRoom(G, id), worldDump(G) (debug contract), ROOM_LIST
//
// Live ents (G.room.ents), px boxes { x, y, w, h } in room px unless noted:
//   brazier { lit, near }, lore { text, near }, ability { id, after, hidden, taken },
//   vessel / shards { n } (taken ones are left out), anchor (x, y = ring centre),
//   platform { w, h, path: [[x, y] px], speed, dx, dy (px moved this step) },
//   boss { id, trigger: px box }, gate (data only), ending. Each has key 'room#index'
//   (its index in def.ents), the key G.prog.taken / G.prog.lore use.
// Standing spots (start, gates' from/to, pickups in worldDump): a tile [tx, ty] the
// feet stand IN (floor at ty + 1) is the hitbox top-left { x: tx*40 + 8, y: (ty+1)*40 - 56 }.
import { TILE, ROOM_W, ROOM_H, BIOMES, PHYS, ABILITIES, DEBUG } from '../config.js';
import { T, CHARS } from './tiles.js';
import { emit } from '../events.js';
import { grantAbility, addVessel, addShards } from '../game.js';
import { saveGame } from '../save.js';
import { snapCamera } from '../render/camera.js';
import * as EN from '../enemies/index.js';
import { ROOM_LIST } from './rooms/index.js';
import { EXIT_REQS } from './rooms/exits.js';
export { ROOM_LIST };

const SW = ROOM_W * TILE, SH = ROOM_H * TILE;   // one screen in px
const stand = (tx, ty) => ({ x: tx * TILE + 8, y: (ty + 1) * TILE - 56 });
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

let grid = null;   // 'gx,gy' -> def, for the loaded world
const cellOf = (gx, gy) => grid.get(gx + ',' + gy) || null;

// ------------------------------------------------------------------ load
export function loadWorld(G) {
  const rooms = {};
  grid = new Map();
  for (const d of ROOM_LIST) {
    rooms[d.id] = d;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) grid.set((d.gx + x) + ',' + (d.gy + y), d);
  }
  const s = ROOM_LIST.find((d) => d.start) || ROOM_LIST[0];
  const at = s.start ? stand(s.start.x, s.start.y) : entryPoint(s);
  G.world = { rooms, ids: ROOM_LIST.map((d) => d.id), start: { room: s.id, x: at.x, y: at.y } };
  if (DEBUG) checkOpenings();
}

// Border openings of a room: runs of non-'#' tiles per side, with the room across.
function openings(d) {
  const out = [], tw = ROOM_W * d.w, th = ROOM_H * d.h;
  for (const side of ['l', 'r', 'u', 'd']) {
    const n = side === 'l' || side === 'r' ? th : tw;
    let run = null;
    for (let i = 0; i <= n; i++) {
      const tx = side === 'l' ? 0 : side === 'r' ? tw - 1 : i, ty = side === 'u' ? 0 : side === 'd' ? th - 1 : i;
      const open = i < n && d.tiles[ty][tx] !== '#';
      if (open && !run) run = { side, at: i, len: 0 };
      if (open) run.len++;
      if (!open && run) { out.push(run); run = null; }
    }
  }
  for (const o of out) {
    const mid = o.at + (o.len >> 1);
    const tx = o.side === 'l' ? -1 : o.side === 'r' ? ROOM_W * d.w : mid, ty = o.side === 'u' ? -1 : o.side === 'd' ? ROOM_H * d.h : mid;
    o.to = cellOf(d.gx + Math.floor(tx / ROOM_W), d.gy + Math.floor(ty / ROOM_H))?.id || null;
  }
  return out;
}

// Debug: every border tile must match its neighbour tile for tile (open against open).
function checkOpenings() {
  for (const d of ROOM_LIST) {
    const tw = ROOM_W * d.w, th = ROOM_H * d.h;
    const edge = (side, i) => side === 'l' || side === 'r' ? [side === 'l' ? -1 : tw, i, side === 'l' ? 0 : tw - 1, i] : [i, side === 'u' ? -1 : th, i, side === 'u' ? 0 : th - 1];
    for (const side of ['l', 'r', 'u', 'd']) {
      const n = side === 'l' || side === 'r' ? th : tw;
      for (let i = 0; i < n; i++) {
        const [ox, oy, ix, iy] = edge(side, i);
        const open = d.tiles[iy][ix] !== '#';
        const wx = d.gx * ROOM_W + ox, wy = d.gy * ROOM_H + oy;
        const o = cellOf(Math.floor(wx / ROOM_W), Math.floor(wy / ROOM_H));
        if (!o) { if (open) console.warn(`emberfall world: ${d.id} ${side}@${i} opens onto nothing`); continue; }
        const otherOpen = o.tiles[wy - o.gy * ROOM_H][wx - o.gx * ROOM_W] !== '#';
        if (open !== otherOpen) console.warn(`emberfall world: ${d.id} ${side}@${i} does not match ${o.id}`);
      }
    }
  }
}

// Where goto without coordinates puts you: the brazier, the start, else by an exit.
function entryPoint(d) {
  const b = d.ents.find((e) => e.t === 'brazier');
  if (b) return stand(b.x, b.y);
  if (d.start) return stand(d.start.x, d.start.y);
  const tw = ROOM_W * d.w, th = ROOM_H * d.h, t = (x, y) => (x < 0 || y < 0 || x >= tw || y >= th ? '#' : d.tiles[y][x]);
  const standable = (x, y) => y + 1 < th && t(x, y) === '.' && t(x, y - 1) === '.' && '#=CX'.includes(t(x, y + 1));
  for (const o of openings(d)) {
    if (o.side === 'l' || o.side === 'r') {
      const x = o.side === 'l' ? 1 : tw - 2;
      for (let y = o.at + o.len - 1; y >= o.at; y--) if (standable(x, y)) return stand(x, y);
    } else {
      for (let y = 0; y < th; y++) for (let x = o.at; x < o.at + o.len; x++) if (standable(x, y)) return stand(x, y);
    }
  }
  let best = null, bd = Infinity;
  for (let y = 1; y < th - 1; y++) for (let x = 1; x < tw - 1; x++) {
    if (!standable(x, y)) continue;
    const dd = Math.abs(x - tw / 2) + Math.abs(y - th / 2);
    if (dd < bd) { bd = dd; best = stand(x, y); }
  }
  return best || { x: TILE * 2, y: TILE * 2 };
}

// ------------------------------------------------------------------ enter
export function enterRoom(G, id, at) {
  const def = G.world.rooms[id];
  if (!def) { console.warn('emberfall: no room', id); return; }
  const prevBiome = G.room?.biome, prevId = G.room?.id;
  const tw = ROOM_W * def.w, th = ROOM_H * def.h;
  const tiles = new Uint8Array(tw * th);
  def.tiles.forEach((row, y) => { for (let x = 0; x < tw; x++) tiles[y * tw + x] = CHARS[row[x]] ?? 0; });
  for (const k in G.prog.opened) {
    if (!k.startsWith(id + ':')) continue;
    const [tx, ty] = k.slice(id.length + 1).split(',').map(Number);
    if (tx >= 0 && ty >= 0 && tx < tw && ty < th) tiles[ty * tw + tx] = T.EMPTY;
  }
  const ents = [];
  def.ents.forEach((e, i) => {
    const key = `${id}#${i}`;
    const box = { x: e.x * TILE, y: e.y * TILE, w: TILE, h: TILE };
    switch (e.t) {
      case 'enemy': return;   // enemies/index.js spawns these from def.ents
      case 'vessel': case 'shards':
        if (G.prog.taken[key]) return;
        ents.push({ ...e, ...box, key }); return;
      case 'ability':
        ents.push({ ...e, ...box, key, taken: !!G.prog.taken[key] || !!G.prog.abilities[e.id], hidden: !!(e.after && !G.prog.bosses[e.after]) }); return;
      case 'anchor': ents.push({ ...e, x: (e.x + 0.5) * TILE, y: (e.y + 0.5) * TILE, key }); return;
      case 'platform': {
        const path = (e.path || [[e.x, e.y]]).map(([x, y]) => [x * TILE, y * TILE]);
        ents.push({ ...e, x: path[0][0], y: path[0][1], w: e.w * TILE, h: 20, path, s: 0, dir: 1, dx: 0, dy: 0, key }); return;
      }
      case 'boss': {
        const [x, y, w, h] = e.trigger || [0, 0, tw, th];
        ents.push({ ...e, ...box, trigger: { x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE }, key }); return;
      }
      case 'ending': ents.push({ ...e, x: box.x, y: box.y - TILE, w: TILE, h: TILE * 2, key }); return;
      default: ents.push({ ...e, ...box, key, near: false });
    }
  });
  G.room = { id, def, biome: def.biome, gx: def.gx, gy: def.gy, tw, th, w: tw * TILE, h: th * TILE, tiles, ents, version: 1, dark: def.dark ?? 0.75, crumble: new Map() };
  const p = G.player;
  if (p) {
    const a = at || entryPoint(def);
    p.x = a.x; p.y = a.y; p.platform = null;
    if (p.hook) { p.hook = null; p.hooked = null; }
  }
  const firstInBiome = !Object.keys(G.prog.visited).some((r) => G.world.rooms[r]?.biome === def.biome);
  G.prog.visited[id] = true;
  G.enemies = [];
  EN.spawnEnemies?.(G);
  emit('room', { id, from: prevId || null });
  if (def.biome !== prevBiome) {
    emit('biome', { id: def.biome, from: prevBiome || null });
    if (firstInBiome && prevBiome) G.banner = { title: BIOMES[def.biome]?.name || def.biome, sub: def.name, t: 0, life: 4, kind: 'biome' };
  }
}

// ------------------------------------------------------------------ update
export function updateWorld(G, dt) {
  const r = G.room, p = G.player;
  if (!r || !p) return;
  const pb = { x: p.x, y: p.y, w: p.w, h: p.h };
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
  const cp = G.prog.checkpoint;
  let dirty = false;
  for (let i = 0; i < r.ents.length; i++) {
    const e = r.ents[i];
    switch (e.t) {
      case 'platform': movePlatform(e, dt); break;
      case 'brazier':
        e.near = Math.abs(e.x + TILE / 2 - pcx) < 60 && Math.abs(e.y + TILE / 2 - pcy) < 70;
        e.lit = !!cp && cp.room === r.id && Math.abs(cp.x - e.x) < 3 * TILE && Math.abs(cp.y - e.y) < 3 * TILE;
        break;
      case 'lore':
        e.near = Math.abs(e.x + TILE / 2 - pcx) < 60 && Math.abs(e.y + TILE / 2 - pcy) < 70;
        if (e.near && G.input?.interactP && !p.hook) {
          G.banner = { title: r.def.name, sub: e.text, t: 0, life: 6, kind: 'lore' };
          if (!G.prog.lore[e.key]) { G.prog.lore[e.key] = true; emit('lore', { key: e.key }); }
        }
        break;
      case 'ability':
        if (e.after && e.hidden && G.prog.bosses[e.after]) e.hidden = false;
        if (e.taken || e.hidden || !overlap(pb, e)) break;
        e.taken = true; take(G, e); grantAbility(G, e.id); break;
      case 'vessel': case 'shards':
        if (e.taken || !overlap(pb, e)) break;
        e.taken = true; dirty = true; take(G, e);
        if (e.t === 'vessel') addVessel(G); else addShards(G, e.n || 25, e.x + TILE / 2, e.y + TILE / 2);
        break;
      case 'boss':
        if (!G.boss && !G.prog.bosses[e.id] && pcx >= e.trigger.x && pcx < e.trigger.x + e.trigger.w && pcy >= e.trigger.y && pcy < e.trigger.y + e.trigger.h) EN.startBoss?.(G, e.id);
        break;
      case 'ending':
        if (G.scene !== 'won' && overlap(pb, e)) { G.scene = 'won'; G.wonT = 0; emit('won', {}); }
        break;
    }
  }
  if (dirty) r.ents = r.ents.filter((e) => !(e.taken && (e.t === 'vessel' || e.t === 'shards')));
  updateCrumbles(G, dt);
  transition(G);
}

function take(G, e) {
  G.prog.taken[e.key] = true;
  emit('pickup', { kind: e.t, id: e.id || null, n: e.n || 0, x: e.x + TILE / 2, y: e.y + TILE / 2 });
  saveGame(G);
}

// Ping-pong along the path at e.speed px/s; dx, dy = this step's move (physics.js carries riders).
function movePlatform(e, dt) {
  const P = e.path;
  if (P.length < 2) { e.dx = e.dy = 0; return; }
  const segs = [];
  let total = 0;
  for (let k = 1; k < P.length; k++) { const l = Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); segs.push(l); total += l; }
  e.s += e.dir * (e.speed || 80) * dt;
  if (e.s >= total) { e.s = 2 * total - e.s; e.dir = -1; }
  if (e.s <= 0) { e.s = -e.s; e.dir = 1; }
  let s = e.s, k = 0;
  while (k < segs.length - 1 && s > segs[k]) { s -= segs[k]; k++; }
  const f = segs[k] ? Math.min(1, s / segs[k]) : 0;
  const nx = P[k][0] + (P[k + 1][0] - P[k][0]) * f, ny = P[k][1] + (P[k + 1][1] - P[k][1]) * f;
  e.dx = nx - e.x; e.dy = ny - e.y; e.x = nx; e.y = ny;
}

// Crumbling floor: shakes 0.5 s after it is stood on, then gone; back after 4 s unless you are in it.
function updateCrumbles(G, dt) {
  const r = G.room, p = G.player, C = r.crumble;
  if (p.onGround) {
    const ty = Math.floor((p.y + p.h + 1) / TILE);
    for (let tx = Math.floor(p.x / TILE); tx <= Math.floor((p.x + p.w - 0.01) / TILE); tx++) {
      const k = ty * r.tw + tx;
      if (tx >= 0 && ty >= 0 && tx < r.tw && ty < r.th && r.tiles[k] === T.CRUMBLE && !C.has(k)) C.set(k, { tx, ty, t: 0, gone: false });
    }
  }
  for (const [k, c] of C) {
    c.t += dt;
    if (!c.gone && c.t >= 0.5) {
      c.gone = true; c.t = 0; r.tiles[k] = T.EMPTY; r.version++;
      emit('crumble', { x: (c.tx + 0.5) * TILE, y: (c.ty + 0.5) * TILE });
    } else if (c.gone && c.t >= 4 && !overlap(p, { x: c.tx * TILE, y: c.ty * TILE, w: TILE, h: TILE })) {
      r.tiles[k] = T.CRUMBLE; r.version++; C.delete(k);
    }
  }
}

// Walk out of the room: the room at that world point takes over, velocity kept.
function transition(G) {
  const r = G.room, p = G.player;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  if (cx >= 0 && cx < r.w && cy >= 0 && cy < r.h) return;
  const wx = r.gx * SW + cx, wy = r.gy * SH + cy;
  const d = cellOf(Math.floor(wx / SW), Math.floor(wy / SH));
  if (!d || d.id === r.id) {
    // nowhere to go: stay inside
    if (cx < 0 || cx >= r.w) { p.x = Math.max(-p.w / 2 + 1, Math.min(r.w - p.w / 2 - 1, p.x)); p.vx = 0; }
    if (cy < 0) { p.y = -p.h / 2 + 1; p.vy = Math.max(0, p.vy); }
    if (cy >= r.h) { p.y = r.h - p.h / 2 - 1; p.vy = Math.min(0, p.vy); }
    return;
  }
  const fromBelow = cy < 0;
  const at = { x: p.x + (r.gx - d.gx) * SW, y: p.y + (r.gy - d.gy) * SH };
  enterRoom(G, d.id, at);
  if (fromBelow && p.vy < 0) p.vy = Math.min(p.vy, -320);   // a small lift onto the ledge over the hole
  G.shots = [];
  snapCamera(G);
}

// ------------------------------------------------------------------ tiles
export function closeDoors(G) { swapDoors(G, T.SOLID); }
export function openDoors(G) { swapDoors(G, T.DOOR); }
function swapDoors(G, code) {
  const r = G.room; if (!r) return;
  let n = 0;
  r.def.tiles.forEach((row, y) => { for (let x = 0; x < r.tw; x++) if (row[x] === 'D') { r.tiles[y * r.tw + x] = code; n++; } });
  if (n) r.version++;
}

export function breakTile(G, tx, ty) { return clearGroup(G, tx, ty, T.CRACK, 'break'); }
export function burnTile(G, tx, ty) { return clearGroup(G, tx, ty, T.BRAMBLE, 'burn'); }
function clearGroup(G, tx, ty, code, ev) {
  const r = G.room;
  if (!r || tx < 0 || ty < 0 || tx >= r.tw || ty >= r.th || r.tiles[ty * r.tw + tx] !== code) return 0;
  const todo = [[tx, ty]], done = [];
  r.tiles[ty * r.tw + tx] = T.EMPTY;
  while (todo.length) {
    const [x, y] = todo.pop();
    done.push([x, y]);
    G.prog.opened[`${r.id}:${x},${y}`] = true;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= r.tw || ny >= r.th || r.tiles[ny * r.tw + nx] !== code) continue;
      r.tiles[ny * r.tw + nx] = T.EMPTY; todo.push([nx, ny]);
    }
  }
  r.version++;
  for (const [x, y] of done) emit(ev, { tx: x, ty: y, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, room: r.id });
  saveGame(G);
  return done.length;
}

// ------------------------------------------------------------------ queries
export function bossRoom(G, id) {
  const d = ROOM_LIST.find((r) => r.ents.some((e) => e.t === 'boss' && e.id === id));
  return d ? d.id : null;
}

export function worldDump(G) {
  const start = G.world?.start;
  return {
    tile: TILE, roomW: ROOM_W, roomH: ROOM_H, start, abilityOrder: [...ABILITIES], physics: { ...PHYS },
    rooms: ROOM_LIST.map((d) => {
      const reqs = EXIT_REQS[d.id] || [];
      const exits = openings(d).filter((o) => o.to).map((o) => {
        const q = reqs.find((e) => e.side === o.side && e.at === o.at);
        const tw = ROOM_W * d.w, th = ROOM_H * d.h, v = o.side === 'l' || o.side === 'r';
        const x = v ? (o.side === 'l' ? 0 : (tw - 1) * TILE) : o.at * TILE, y = v ? o.at * TILE : (o.side === 'u' ? 0 : (th - 1) * TILE);
        const ex = { to: o.to, side: o.side, x, y, w: v ? TILE : o.len * TILE, h: v ? o.len * TILE : TILE, requires: q?.requires ? [...q.requires] : [...ABILITIES] };
        if (q && !q.requires) ex.passable = false;   // the solver never got out this way (a drop, a one-way wall)
        return ex;
      });
      const brazier = d.ents.find((e) => e.t === 'brazier');
      const out = {
        id: d.id, name: d.name, biome: d.biome, gx: d.gx, gy: d.gy, w: d.w, h: d.h, tw: ROOM_W * d.w, th: ROOM_H * d.h,
        tiles: [...d.tiles], exits,
        gates: d.ents.filter((e) => e.t === 'gate').map((g) => ({ id: g.id, kind: g.kind, requires: g.requires, x: g.x * TILE, y: g.y * TILE, w: g.w * TILE, h: g.h * TILE, from: stand(...g.from), to: stand(...g.to) })),
        pickups: d.ents.map((e, i) => ['ability', 'vessel', 'shards', 'lore'].includes(e.t) ? { kind: e.t, id: e.t === 'ability' ? e.id : `${d.id}#${i}`, ...stand(e.x, e.y), ...(e.after ? { after: e.after } : {}), ...(e.n ? { n: e.n } : {}) } : null).filter(Boolean),
        anchors: d.ents.filter((e) => e.t === 'anchor').map((e) => ({ x: (e.x + 0.5) * TILE, y: (e.y + 0.5) * TILE })),
      };
      const boss = d.ents.find((e) => e.t === 'boss');
      if (boss) out.boss = boss.id;
      if (brazier) out.checkpoint = stand(brazier.x, brazier.y);
      if (d.ents.some((e) => e.t === 'ending')) out.ending = true;
      if (d.secret) out.secret = true;
      return out;
    }),
  };
}
