// What the environment painters need to know about a room's map: materials by tile, which foliage
// stands tall (next to open ground, so it must depth-sort with characters) and which is deep canopy
// (painted flat into the floor), and how far each tile is from open ground (for darkening the jungle).
import type { RoomData } from '../../sim/level/rooms';
import { noise2 } from '../paint';
import { TILE } from '../../config';

export const isWallCh = (c: string) => c === '#' || c === 'b' || c === 'l';
export const isDoorCh = (c: string) => c === 'D';
/** Tiles a character can stand on or that are open ground (props stand on open ground). */
export const isOpenCh = (c: string) => !isWallCh(c) && c !== 'F' && c !== 'D' && c !== '~' && c !== '_';

export type Mat = 'flag' | 'cobble' | 'grass' | 'canopy' | 'water' | 'shallow' | 'void' | 'stairs';

export function matOfCh(c: string): Mat {
  switch (c) {
    case ',': return 'cobble';
    case '"': case '*': return 'grass';
    case 'F': return 'canopy';
    case '~': return 'water';
    case 'w': return 'shallow';
    case '_': return 'void';
    case 'D': return 'stairs';
    default: return 'flag';
  }
}

export interface RoomMap {
  room: RoomData;
  W: number; H: number; // world units
  ch: (tx: number, ty: number) => string;
  /** Tiles from open ground (0 = open, 1 = next to it, ...), capped at 8. */
  dist: Uint8Array;
  /** Foliage tiles drawn as tall, depth-sorted bushes. */
  tallF: Uint8Array;
  /** Material at a world point, with tile borders warped by noise so they read as organic. */
  matAt: (x: number, y: number) => Mat;
  distAt: (tx: number, ty: number) => number;
  isTallF: (tx: number, ty: number) => boolean;
}

export function roomMap(room: RoomData, seed: number): RoomMap {
  const { w, h, ch } = room;
  const dist = new Uint8Array(w * h).fill(8);
  const q: number[] = [];
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) if (isOpenCh(ch(tx, ty))) { dist[ty * w + tx] = 0; q.push(ty * w + tx); }
  for (let i = 0; i < q.length; i++) {
    const k = q[i], tx = k % w, ty = (k / w) | 0, d = dist[k];
    if (d >= 8) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x;
      if (dist[j] > d + 1) { dist[j] = d + 1; q.push(j); }
    }
  }
  const tallF = new Uint8Array(w * h);
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    if (ch(tx, ty) !== 'F') continue;
    let tall = false;
    // Open ground just above (the bush hides a character's legs) or beside or below it, or a wall
    // right below (leaves show over the wall top).
    for (let dy = -2; dy <= 1 && !tall; dy++) for (let dx = -1; dx <= 1 && !tall; dx++) {
      const c = ch(tx + dx, ty + dy);
      if (isOpenCh(c) || c === '~' || c === '_') tall = true;
    }
    if (!tall && (isWallCh(ch(tx, ty + 1)) || isWallCh(ch(tx, ty + 2)))) tall = true;
    tallF[ty * w + tx] = tall ? 1 : 0;
  }
  const n1 = noise2(seed + 11), n2 = noise2(seed + 23);
  const tileCh = (x: number, y: number) => ch(Math.floor(x / TILE), Math.floor(y / TILE));
  const matAt = (x: number, y: number): Mat => {
    const own = matOfCh(tileCh(x, y));
    if (own === 'water' || own === 'void' || own === 'stairs') return own;
    const jx = (n1(x / 9, y / 9) - 0.5) * 10, jy = (n2(x / 9, y / 9) - 0.5) * 10;
    const m = matOfCh(tileCh(x + jx, y + jy));
    if (m === 'water' || m === 'void' || m === 'stairs') return own;
    return m;
  };
  return {
    room, W: w * TILE, H: h * TILE, ch, dist, tallF, matAt,
    distAt: (tx, ty) => (tx < 0 || ty < 0 || tx >= w || ty >= h ? 8 : dist[ty * w + tx]),
    isTallF: (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h && tallF[ty * w + tx] === 1,
  };
}
