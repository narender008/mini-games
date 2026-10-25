// STUB (world agent replaces): loads the rooms, enters them, transitions.
import { TILE, ROOM_W, ROOM_H } from '../config.js';
import { CHARS } from './tiles.js';
const ROOM = { id: 'test', biome: 'hollow', gx: 0, gy: 0, w: 1, h: 1, tiles: [
  ...Array(15).fill('#' + ' '.repeat(30) + '#'), ...Array(3).fill('#'.repeat(32)) ], ents: [] };
export function loadWorld(G) { G.world = { rooms: { test: ROOM }, ids: ['test'], start: { room: 'test', x: 200, y: 15 * TILE - 56 } }; }
export function enterRoom(G, id, at) {
  const def = G.world.rooms[id];
  const tw = ROOM_W * def.w, th = ROOM_H * def.h;
  const tiles = new Uint8Array(tw * th);
  def.tiles.forEach((row, y) => { for (let x = 0; x < tw; x++) tiles[y * tw + x] = CHARS[row[x]] ?? 0; });
  G.room = { id, def, biome: def.biome, gx: def.gx, gy: def.gy, tw, th, w: tw * TILE, h: th * TILE, tiles, ents: [], version: 1, dark: 0.8 };
  const p = G.player; const a = at || G.world.start; p.x = a.x; p.y = a.y;
  G.prog.visited[id] = true;
}
export function updateWorld() {}
export function openDoors() {}
export function bossRoom() { return null; }
export function worldDump(G) { return { tile: TILE, start: G.world.start, rooms: [] }; }
