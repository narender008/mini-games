// Seeded room generator. Every combat room is a walled courtyard of the ruined city: foliage around the
// edge, a gate wall along the north with one or two doors, the way in at the south, and a zone-flavoured
// scatter of ruins, pools, pillars and growth. The result is validated (every door and most of the floor
// reachable from the spawn, room for a fight in the middle) and regenerated with the next seed if not.
import { Rng } from '../../core/rng';
import { Grid } from '../grid';
import type { RoomDef, Zone } from './rooms';
import { parseRoom } from './rooms';

export interface GenOpts {
  zone: Zone;
  doors: 1 | 2;
  /** A reward room: small, peaceful, with one reward prop in the middle. */
  reward?: string; // prop character placed at the centre
  name: string;
  id: string;
}

type Map2 = string[][];

const SIZES: Record<Zone, [number, number]> = {
  sanctum: [36, 26], causeway: [50, 34], aqueduct: [52, 34], foundry: [48, 34], heart: [40, 32],
};

export function generateRoom(seed: number, o: GenOpts): RoomDef {
  for (let attempt = 0; attempt < 40; attempt++) {
    const map = build(seed + attempt * 7919, o);
    const def: RoomDef = { id: o.id, zone: o.zone, name: o.name, map: map.map((r) => r.join('')), waves: [] };
    if (validate(def)) return def;
  }
  throw new Error(`room generator failed for ${o.id}`);
}

function build(seed: number, o: GenOpts): Map2 {
  const rng = new Rng(seed);
  let [W, H] = SIZES[o.zone];
  if (o.reward) { W = 30; H = 24; }
  else { W += rng.int(-2, 3) * 2; H += rng.int(-1, 2) * 2; }
  const g: Map2 = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
  const put = (x: number, y: number, c: string) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? g[y][x] : 'F');
  const rect = (x: number, y: number, w: number, h: number, c: string) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };
  const isOpen = (x: number, y: number, w: number, h: number, pad = 1) => {
    for (let j = -pad; j < h + pad; j++) for (let i = -pad; i < w + pad; i++) if (at(x + i, y + j) !== '.') return false;
    return true;
  };

  // Overgrown border.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d < 2 || (d < 4 && rng.chance(0.55))) put(x, y, 'F');
    else if (d < 6 && rng.chance(0.3)) put(x, y, '"');
  }

  // North gate wall with doors, banners and wall lanterns.
  const wy = 3;
  rect(5, 0, W - 10, wy, 'F');
  rect(5, wy, W - 10, 2, '#');
  const doorXs = o.doors === 2 ? [Math.round(W * 0.3) - 2, Math.round(W * 0.7) - 2] : [Math.floor(W / 2) - 2];
  for (const dx of doorXs) {
    rect(dx, 0, 4, wy + 2, 'D');
    rect(dx, wy + 2, 4, 3, ',');
    put(dx - 2, wy + 1, rng.chance(0.5) ? 'b' : 'l');
    put(dx + 5, wy + 1, rng.chance(0.5) ? 'b' : 'l');
  }
  for (let x = 7; x < W - 7; x += rng.int(5, 9)) if (at(x, wy + 1) === '#' && at(x - 1, wy + 1) === '#' && at(x + 1, wy + 1) === '#') put(x, wy + 1, rng.chance(0.6) ? 'l' : 'b');

  // South entry and spawn.
  const sx = Math.floor(W / 2), sy = H - 6;
  rect(sx - 2, sy - 1, 4, 4, ',');
  put(sx, sy, 'P');
  for (let y = sy + 1; y < H; y++) for (let x = sx - 2; x < sx + 2; x++) if (at(x, y) === 'F') put(x, y, '"');

  // Keep a clear arena in the middle and paths from the entry to each door.
  const keep = new Set<number>();
  const cx = W / 2, cy = (wy + 2 + sy) / 2;
  const arenaR = o.reward ? 4 : Math.min(W, H) * 0.22;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot((x - cx) * 0.8, y - cy) < arenaR) keep.add(y * W + x);
  for (const dx of doorXs) {
    for (let t = 0; t <= 1; t += 0.02) {
      const x = Math.round(sx + (dx + 1.5 - sx) * t), y = Math.round(sy + (wy + 5 - sy) * t);
      for (let i = -2; i <= 2; i++) keep.add(y * W + x + i);
    }
  }
  const free = (x: number, y: number, w: number, h: number, pad = 1) => {
    if (!isOpen(x, y, w, h, pad)) return false;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (keep.has((y + j) * W + x + i)) return false;
    return true;
  };
  const tryPlace = (w: number, h: number, fn: (x: number, y: number) => void, tries = 30, pad = 1) => {
    for (let k = 0; k < tries; k++) {
      const x = rng.int(4, W - 4 - w), y = rng.int(wy + 4, H - 5 - h);
      if (free(x, y, w, h, pad)) { fn(x, y); return true; }
    }
    return false;
  };

  if (o.reward) {
    put(Math.floor(W / 2) - 1, Math.floor(H / 2) - 1, o.reward);
    // A ring of lamps and flowers around the reward.
    for (const [ox, oy] of [[-5, -2], [4, -2]]) put(Math.floor(W / 2) + ox, Math.floor(H / 2) + oy, 'L');
    for (let i = 0; i < 6; i++) tryPlace(1, 1, (x, y) => { put(x, y, '*'); });
    for (let i = 0; i < 3; i++) tryPlace(2, 2, (x, y) => rect(x, y, 2, 2, '"'));
    return g;
  }

  // Zone flavour.
  const pool = (x: number, y: number, w: number, h: number) => { rect(x, y, w, h, 'r'); rect(x + 1, y + 1, w - 2, h - 2, '~'); };
  const ruinWall = (x: number, y: number, w: number) => { rect(x, y, w, 1, '#'); if (rng.chance(0.5)) put(x + rng.int(0, w), y, 'x'); };
  const n = (a: number, b: number) => rng.int(a, b);
  if (o.zone === 'causeway') {
    // Colonnade: pairs of pillars flanking the arena, a rune circle, lamps, statues.
    const px = Math.round(W * 0.28), qx = W - 1 - px;
    for (let y = wy + 6; y < sy - 2; y += n(4, 6)) { if (free(px, y, 1, 1, 0)) put(px, y, 'o'); if (free(qx, y, 1, 1, 0)) put(qx, y, 'o'); }
    tryPlace(1, 1, (x, y) => put(x, y, 'R'), 40, 2);
    for (let i = 0; i < 2; i++) tryPlace(1, 1, (x, y) => put(x, y, 'L'), 30, 2);
    for (let i = 0; i < 2; i++) tryPlace(1, 1, (x, y) => put(x, y, 's'), 30, 1);
    for (let i = 0; i < n(1, 2); i++) tryPlace(4, 4, (x, y) => pool(x, y, 4, 4), 40, 1);
    for (let i = 0; i < n(2, 3); i++) { const w = n(3, 6); tryPlace(w, 1, (x, y) => ruinWall(x, y, w), 30, 2); }
  } else if (o.zone === 'aqueduct') {
    // Flooded gardens: several pools, a shallow channel, dense bushes.
    for (let i = 0; i < n(3, 4); i++) { const w = n(4, 6), h = n(3, 5); tryPlace(w, h, (x, y) => pool(x, y, w, h), 40, 1); }
    const chy = rng.int(wy + 8, sy - 6);
    for (let x = 4; x < W - 4; x++) for (let j = 0; j < 2; j++) if (at(x, chy + j) === '.' || at(x, chy + j) === '"') put(x, chy + j, 'w');
    for (let i = 0; i < n(4, 6); i++) { const w = n(2, 3), h = n(2, 3); tryPlace(w, h, (x, y) => rect(x, y, w, h, 'F'), 30, 1); }
    for (let i = 0; i < 3; i++) tryPlace(1, 1, (x, y) => put(x, y, 'L'), 30, 2);
    for (let i = 0; i < 2; i++) tryPlace(1, 1, (x, y) => put(x, y, 'o'), 30, 1);
  } else if (o.zone === 'foundry') {
    // The old kilns: pits with rims, braziers, broken walls and fallen blocks.
    for (let i = 0; i < n(2, 3); i++) { const w = n(3, 5), h = n(2, 4); tryPlace(w, h, (x, y) => { rect(x, y, w, h, 'r'); rect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 2), '_'); }, 40, 1); }
    for (let i = 0; i < n(3, 4); i++) { const w = n(3, 7); tryPlace(w, 1, (x, y) => ruinWall(x, y, w), 30, 2); }
    for (let i = 0; i < n(3, 4); i++) tryPlace(1, 1, (x, y) => put(x, y, 'B'), 30, 2);
    for (let i = 0; i < n(3, 5); i++) tryPlace(1, 1, (x, y) => put(x, y, 'c'), 30, 1);
    for (let i = 0; i < 2; i++) tryPlace(1, 1, (x, y) => put(x, y, 'o'), 30, 1);
  }
  // Common: overgrown islands, rubble, a lore lantern now and then, ground growth and flowers.
  for (let i = 0; i < n(3, 5); i++) { const w = n(2, 3), h = n(2, 3); tryPlace(w, h, (x, y) => { rect(x, y, w, h, 'F'); for (let k = 0; k < w + 2; k++) { put(x - 1 + k, y + h, '"'); } }, 30, 1); }
  for (let i = 0; i < n(2, 4); i++) tryPlace(2, 1, (x, y) => { put(x, y, 'x'); if (rng.chance(0.5)) put(x + 1, y, 'x'); put(x, y + 1, '"'); }, 30, 1);
  for (let i = 0; i < n(1, 3); i++) tryPlace(1, 1, (x, y) => put(x, y, rng.chance(0.5) ? 'c' : 'o'), 30, 1);
  if (rng.chance(0.6)) tryPlace(1, 1, (x, y) => put(x, y, 'K'), 40, 2);
  for (let i = 0; i < n(4, 7); i++) { const w = n(1, 3), h = n(1, 2); tryPlace(w, h, (x, y) => { rect(x, y, w, h, '"'); put(x + w - 1, y, '*'); }, 20, 0); }
  return g;
}

/** Every door and the spawn connect; at least 55% of the non-foliage interior is walkable and reachable. */
export function validate(def: RoomDef): boolean {
  let room;
  try { room = parseRoom(def); } catch { return false; }
  const g: Grid = room.grid;
  const reach = g.reachable(Math.floor(room.spawn.x / 16), Math.floor(room.spawn.y / 16));
  for (const d of room.doors) {
    // The cell just inside each door must be reachable.
    const inside = d.cells.map((c) => ({ tx: c.tx, ty: Math.max(...d.cells.map((k) => k.ty)) + 1 }));
    if (!inside.some((c) => reach[c.ty * room.w + c.tx])) return false;
  }
  let walk = 0, interior = 0;
  for (let ty = 1; ty < room.h - 1; ty++) for (let tx = 1; tx < room.w - 1; tx++) {
    const c = room.ch(tx, ty);
    if (c === 'F' || c === 'D') continue;
    interior++;
    if (reach[ty * room.w + tx]) walk++;
  }
  return walk / interior >= 0.55;
}
