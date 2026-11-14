// Room art, baked once per room at 1x: the floor (flagstones, cobbles, moss, pools, rune circles, flowers,
// contact shadows) and, per tile row, a strip of everything tall (wall caps and faces, banners, wall
// lanterns, foliage clumps) that the view depth-sorts against characters by the row's base line.
import { TILE, WALL_H } from '../config';
import { hash2 } from '../core/rng';
import { Pix, bayer, fbm, mix, shade, valueNoise, type RGBA } from './pix';
import { P } from './palette';
import type { RoomData, Zone } from '../sim/level/rooms';

export interface ZoneLook {
  stone: RGBA[]; // flagstone base ramp, dark -> light
  cobble: RGBA[];
  grout: RGBA;
  soil: RGBA;
  leaf: RGBA[]; // foliage ramp dark -> light
  moss: RGBA;
  water: RGBA[];
  wall: RGBA[]; // wall face ramp
  cap: RGBA[];
  accent: RGBA; // flowers / runes
}

export const LOOKS: Record<Zone, ZoneLook> = {
  sanctum: {
    stone: [P.stoneD, P.stone, P.stoneM, P.stoneL, P.stoneH], cobble: [P.stoneD, P.stone, P.stoneM, P.stoneL],
    grout: P.grout, soil: P.soil, leaf: [P.leafD, P.leaf, P.leafM, P.leafL, P.leafH], moss: P.moss,
    water: [P.water, P.waterL, P.waterH], wall: [P.stoneD, P.stone, P.stoneM, P.stoneL], cap: [P.stone, P.stoneM, P.stoneL, P.stoneH],
    accent: P.amber,
  },
  causeway: {
    stone: [P.stoneD, P.stone, P.stoneM, P.stoneL, P.stoneH], cobble: [P.stoneD, P.stone, P.stoneM, P.stoneL],
    grout: P.grout, soil: P.soil, leaf: [P.leafD, P.leaf, P.leafM, P.leafL, P.leafH], moss: P.moss,
    water: [P.water, P.waterL, P.waterH], wall: [P.stoneD, P.stone, P.stoneM, P.stoneL], cap: [P.stone, P.stoneM, P.stoneL, P.stoneH],
    accent: P.cyan,
  },
  aqueduct: {
    stone: [mix(P.stoneD, P.water, 0.2), mix(P.stone, P.water, 0.2), mix(P.stoneM, P.water, 0.18), mix(P.stoneL, P.water, 0.15), mix(P.stoneH, P.waterH, 0.1)],
    cobble: [P.stoneD, P.stone, P.stoneM, P.stoneL], grout: P.grout, soil: mix(P.soil, P.water, 0.3),
    leaf: [P.leafD, P.leaf, P.leafM, P.leafL, P.leafH], moss: P.moss, water: [P.water, P.waterL, P.waterH],
    wall: [P.stoneD, mix(P.stone, P.water, 0.15), mix(P.stoneM, P.water, 0.15), P.stoneL], cap: [P.stone, P.stoneM, P.stoneL, P.stoneH], accent: P.cyan,
  },
  foundry: {
    stone: [mix(P.stoneD, P.amberD, 0.06), mix(P.stone, P.amberD, 0.1), mix(P.stoneM, P.amberD, 0.1), mix(P.stoneL, P.amberD, 0.08), P.stoneH],
    cobble: [P.stoneD, P.stone, P.stoneM, P.stoneL], grout: mix(P.grout, P.ink, 0.4), soil: mix(P.soil, P.amberD, 0.12),
    leaf: [mix(P.leafD, P.amberD, 0.15), mix(P.leaf, P.amberD, 0.25), mix(P.leafM, P.amberD, 0.3), mix(P.leafL, P.amber, 0.25), mix(P.leafH, P.amber, 0.3)], moss: mix(P.moss, P.amberD, 0.35),
    water: [P.water, P.waterL, P.waterH], wall: [P.stoneD, mix(P.stone, P.amberD, 0.08), mix(P.stoneM, P.amberD, 0.08), P.stoneL], cap: [P.stone, P.stoneM, P.stoneL, P.stoneH], accent: P.amber,
  },

  heart: {
    stone: [P.stoneD, P.stone, P.stoneM, P.stoneL, P.stoneH], cobble: [P.stoneD, P.stone, P.stoneM, P.stoneL],
    grout: P.grout, soil: P.soil, leaf: [P.leafD, P.leaf, P.leafM, P.leafL, P.leafH], moss: P.moss,
    water: [P.water, P.waterL, P.waterH], wall: [P.stoneD, P.stone, P.stoneM, P.stoneL], cap: [P.stone, P.stoneM, P.stoneL, P.stoneH], accent: P.magenta,
  },
};

const isWallCh = (c: string) => c === '#' || c === 'b' || c === 'l' || c === 'D';
const isFoliageCh = (c: string) => c === 'F';
const isTall = (c: string) => isWallCh(c) || isFoliageCh(c);

type Mat = 'flag' | 'cobble' | 'grass' | 'water' | 'shallow' | 'void';
function matOf(c: string): Mat {
  switch (c) {
    case ',': return 'cobble';
    case '"': case '*': case 'F': return 'grass';
    case '~': return 'water';
    case 'w': return 'shallow';
    case '_': return 'void';
    default: return 'flag';
  }
}

/** Builds the stone layout: every 8 px cell gets a stone id; stones are 1-3 cells wide/high. */
function stoneLayout(cw: number, ch: number, seed: number) {
  const id = new Int32Array(cw * ch).fill(-1);
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (id[y * cw + x] >= 0) continue;
    const r = hash2(x, y, seed);
    let w = r < 0.35 ? 1 : r < 0.8 ? 2 : 3;
    let h = hash2(x, y, seed + 7) < 0.55 ? 1 : 2;
    while (w > 1 && (x + w > cw || [...Array(w).keys()].some((i) => id[y * cw + x + i] >= 0))) w--;
    while (h > 1 && (y + h > ch || [...Array(w).keys()].some((i) => id[(y + h - 1) * cw + x + i] >= 0))) h--;
    const k = rects.length;
    rects.push({ x, y, w, h });
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) id[(y + j) * cw + x + i] = k;
  }
  return { id, rects };
}

export function bakeFloor(room: RoomData, zone: Zone, seed: number): Pix {
  const L = LOOKS[zone];
  const W = room.w * TILE, H = room.h * TILE;
  const p = new Pix(W, H);
  const n1 = valueNoise(seed + 11), n2 = valueNoise(seed + 23), n3 = valueNoise(seed + 37);
  const flags = flagLayout(W, H, seed);
  const n4 = valueNoise(seed + 51), n5 = valueNoise(seed + 53);
  const missing = new Set<number>();
  const cob = stoneLayout(Math.ceil(W / 6), Math.ceil(H / 6), seed + 99);
  const ch = room.ch;
  const tileAt = (x: number, y: number) => ch(Math.floor(x / TILE), Math.floor(y / TILE));

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // Organic borders between materials: sample the map through a small noise warp.
    const jx = (n1(x / 9, y / 9) - 0.5) * 9, jy = (n2(x / 9, y / 9) - 0.5) * 9;
    let m = matOf(tileAt(x + jx, y + jy));
    const own = tileAt(x, y);
    if (own === '~') m = 'water';
    else if (m === 'water') m = matOf(own) === 'water' ? 'water' : matOf(own);
    if (m === 'grass' && fbm(n3, x / 14, y / 14) > 0.7) m = 'flag'; // broken stones peeking through moss
    let c: RGBA;
    if (own === 'D') { p.set(x, y, stairPixel(x, y, room, L)); continue; }
    if (m === 'flag') {
      // Ruin: in worn regions whole stones are gone (soil and moss show) or half-buried in moss.
      const ruin = fbm(n5, x / 34, y / 34);
      const st = flags.rects[flags.id[y * W + x]];
      if (ruin > 0.6 && st.worn < (ruin - 0.6) * 2.6) { c = mix(grassPixel(x, y, L, n1, n3, seed), L.moss, 0.3); missing.add(flags.id[y * W + x]); }
      else c = flagPixel(x, y, flags, L, n3, n4);
    }
    else if (m === 'cobble') c = cobblePixel(x, y, cob, Math.ceil(W / 6), L, seed);
    else if (m === 'grass') c = grassPixel(x, y, L, n1, n3, seed);
    else if (m === 'water') c = waterPixel(x, y, room, L, n2);
    else if (m === 'shallow') {
      // Shallow run-off over the paving: the stones show through a sheet of lit water.
      const st = flagPixel(x, y, flags, L, n3, n4);
      c = mix(st, L.water[1], 0.5);
      const v = n2(x / 6 + 3, y / 4);
      if (Math.abs(v - 0.5) < 0.03) c = mix(c, L.water[2], 0.35);
    } else c = zone === 'foundry' ? magmaPixel(x, y, room, n2) : voidPixel(x, y, room);
    p.set(x, y, c);
  }

  // Holes where stones are gone fill with low growth.
  for (const k of missing) {
    const r = flags.rects[k];
    const n = Math.max(2, Math.floor((r.w * r.h) / 40));
    for (let i = 0; i < n; i++) {
      const x = r.x + 2 + hash2(i, k, seed + 81) * (r.w - 4), y = r.y + 3 + hash2(i, k, seed + 82) * (r.h - 4);
      drawLeaf(p, x, y, -Math.PI / 2 + (hash2(i, k, seed + 83) - 0.5) * 2.4, 4 + Math.floor(hash2(i, k, seed + 84) * 3), (hash2(i, k, seed + 85) - 0.6) * 1.2, L);
    }
  }

  // Decorations, from the map.
  for (let ty = 0; ty < room.h; ty++) for (let tx = 0; tx < room.w; tx++) {
    const c = ch(tx, ty);
    const x0 = tx * TILE, y0 = ty * TILE;
    const r = hash2(tx, ty, seed + 3);
    if (c === '"') {
      groundCover(p, x0, y0, L, seed + tx * 131 + ty * 17, hash2(tx, ty, seed + 61));
      if (r < 0.3) fern(p, x0 + 3 + r * 10, y0 + 4 + hash2(tx, ty, 9) * 8, L, hash2(tx, ty, 17));
    }
    if (c === '*') flowers(p, x0, y0, L, seed + tx * 7 + ty * 13);
    if (c === '.' || c === ',') floorDebris(p, x0, y0, L, room, tx, ty, seed);
    if (c === 'R') runeCircle(p, x0 + 8, y0 + 8, 22, L);
    if (c === 'r' || c === 'x') lowBlock(p, x0, y0, ch(tx, ty - 1) === 'r' || ch(tx, ty - 1) === 'x', c === 'x', L, r);
    if (c === 'O') platform(p, x0, y0, L);
  }

  // Contact shadows and soft ambient occlusion under walls and foliage (3/4 view: they cast downward).
  const tallAbove = (x: number, y: number) => isTall(tileAt(x, y));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isTall(tileAt(x, y))) continue;
    let k = 0;
    if (tallAbove(x, y - 2)) k = 0.55; else if (tallAbove(x, y - 5)) k = 0.4; else if (tallAbove(x, y - 9)) k = 0.22;
    if (tallAbove(x - 2, y) || tallAbove(x + 2, y)) k = Math.max(k, 0.3);
    else if (tallAbove(x - 5, y) || tallAbove(x + 5, y)) k = Math.max(k, 0.15);
    if (k > 0) {
      const c = p.get(x, y);
      p.set(x, y, shade(c, -k + (bayer(x, y) - 0.5) * 0.08));
    }
  }
  return p;
}

interface Flags { id: Int32Array; rects: { x: number; y: number; w: number; h: number; tone: number; hue: number; crack: number; worn: number }[]; W: number }

/** Running-bond flagstones of irregular widths (8-17 px) in rows 6-9 px tall, with occasional big slabs. */
function flagLayout(W: number, H: number, seed: number): Flags {
  const id = new Int32Array(W * H).fill(-1);
  const rects: Flags['rects'] = [];
  let y = 0, row = 0;
  while (y < H) {
    const rh = 11 + Math.floor(hash2(row, 1, seed) * 5);
    let x = -Math.floor(hash2(row, 2, seed) * 18);
    let col = 0;
    while (x < W) {
      const big = hash2(col, row, seed + 5) < 0.06;
      const w = big ? 24 + Math.floor(hash2(col, row, seed + 6) * 8) : 11 + Math.floor(hash2(col, row, seed + 7) * 11);
      const h = rh;
      const k = rects.length;
      rects.push({ x, y, w, h, tone: hash2(col, row, seed + 11), hue: hash2(col, row, seed + 12), crack: hash2(col, row, seed + 13), worn: hash2(col, row, seed + 14) });
      for (let j = 0; j < h && y + j < H; j++) for (let i = 0; i < w; i++) {
        const xx = x + i;
        if (xx >= 0 && xx < W) id[(y + j) * W + xx] = k;
      }
      x += w; col++;
    }
    y += rh; row++;
  }
  return { id, rects, W };
}

function flagPixel(x: number, y: number, F: Flags, L: ZoneLook, n: (x: number, y: number) => number, nb: (x: number, y: number) => number): RGBA {
  const r = F.rects[F.id[y * F.W + x]];
  const lx = x - r.x, ly = y - r.y, sw = r.w, sh = r.h;
  // Eroded edges: the grout line wanders a pixel into worn stones.
  const ero = nb(x / 2.5, y / 2.5);
  const edgeD = Math.min(lx, ly, sw - 1 - lx, sh - 1 - ly);
  if (lx === sw - 1 || ly === sh - 1) return groutPixel(x, y, L, n);
  if (edgeD === 0 && ero > 0.78 - r.worn * 0.25) return groutPixel(x, y, L, n);
  // Rounded corners (radius 2, more on worn stones).
  const cxd = Math.min(lx, sw - 2 - lx), cyd = Math.min(ly, sh - 2 - ly);
  const rad = r.worn > 0.6 ? 3 : 2;
  if (cxd < rad && cyd < rad && (rad - cxd) ** 2 + (rad - cyd) ** 2 > rad * rad + 0.5) return groutPixel(x, y, L, n);
  let base = r.tone < 0.2 ? L.stone[1] : r.tone < 0.62 ? L.stone[2] : r.tone < 0.92 ? mix(L.stone[2], L.stone[3], 0.6) : L.stone[3];
  if (r.hue < 0.18) base = mix(base, L.moss, 0.18); else if (r.hue > 0.86) base = mix(base, L.soil, 0.25);
  // Large-scale wear: dark damp patches and pale dry ones.
  const wear = n(x / 26, y / 26);
  let c = shade(base, (wear - 0.5) * 0.28);
  // Surface grain.
  const g = nb(x / 1.7, y / 1.7) + (bayer(x, y) - 0.5) * 0.3;
  if (g > 0.84) c = shade(c, 0.06); else if (g < 0.16) c = shade(c, -0.07);
  // Bevel: lit top-left rim, shadowed bottom-right.
  if (ly === 0 || lx === 0) c = shade(c, 0.14);
  else if (ly === 1 || lx === 1) c = shade(c, 0.05);
  else if (ly === sh - 2 || lx === sw - 2) c = shade(c, -0.2);
  // Cracks.
  if (r.crack > 0.9 && ly > 0 && ly < sh - 2) {
    const cx = Math.floor(r.crack * 97) % Math.max(2, sw - 4) + 2;
    const path = cx + Math.round(Math.sin(ly * 1.3 + r.crack * 40) * 1.2) + Math.floor(ly * (r.crack - 0.9) * 3);
    if (lx === path) c = shade(base, -0.38);
    else if (lx === path + 1) c = shade(c, 0.06);
  }
  return c;
}

/** Door cells: worn steps climbing away into darkness (north doors) or a dark threshold. */
function stairPixel(x: number, y: number, room: RoomData, L: ZoneLook): RGBA {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  let below = 0;
  while (room.ch(tx, ty + below + 1) === 'D') below++;
  const fromEdge = (below + 1) * TILE - (y - ty * TILE); // px from the passage mouth
  const dark = Math.min(1, fromEdge / (TILE * 3.2));
  const step = Math.floor(fromEdge / 6), sy = fromEdge % 6;
  let c = step % 2 ? L.stone[2] : L.stone[3];
  if (sy === 5) c = shade(L.stone[3], 0.12); // lit step nose
  else if (sy < 2) c = shade(c, -0.25); // riser shadow
  if (hash2(x >> 2, step, 5) < 0.12) c = mix(c, L.moss, 0.5);
  // Side walls of the passage.
  let l = 0, r = 0;
  while (room.ch(tx - l - 1, ty) === 'D') l++;
  while (room.ch(tx + r + 1, ty) === 'D') r++;
  const lx = x - (tx - l) * TILE, rx = (tx + r + 1) * TILE - 1 - x;
  if (Math.min(lx, rx) < 3) c = shade(L.wall[1], -0.2);
  return shade(c, -0.85 * dark);
}

/** A pit: dark depths under a broken lip. */
function voidPixel(x: number, y: number, room: RoomData): RGBA {
  const ty = Math.floor(y / 16);
  const fromTop = room.ch(Math.floor(x / 16), ty - 1) !== '_' ? y - ty * 16 : 99;
  return fromTop < 4 ? shade(P.stoneD, -0.4 - fromTop * 0.1) : P.ink;
}

/** A foundry pit: a crust of cooling slag over glowing magma. */
function magmaPixel(x: number, y: number, room: RoomData, n: (x: number, y: number) => number): RGBA {
  const ty = Math.floor(y / 16);
  const fromTop = room.ch(Math.floor(x / 16), ty - 1) !== '_' ? y - ty * 16 : 99;
  if (fromTop < 3) return shade(P.stoneD, -0.5);
  const v = n(x / 5, y / 5), w = n(x / 2 + 50, y / 2);
  if (Math.abs(v - 0.5) < 0.06) return w > 0.5 ? [255, 214, 120, 255] : [255, 150, 60, 255];
  if (Math.abs(v - 0.5) < 0.12) return [214, 82, 30, 255];
  return mix([46, 22, 20, 255], [90, 34, 22, 255], w);
}

function groutPixel(x: number, y: number, L: ZoneLook, n: (x: number, y: number) => number): RGBA {
  const m = n(x / 11 + 40, y / 11);
  if (m > 0.62) return bayer(x, y) > 0.5 ? L.moss : mix(L.moss, L.leaf[2], 0.4);
  if (m > 0.55) return mix(L.grout, L.moss, 0.5);
  return L.grout;
}

function cobblePixel(x: number, y: number, lay: ReturnType<typeof stoneLayout>, cw: number, L: ZoneLook, seed: number): RGBA {
  const C = 6;
  const cx = Math.floor(x / C), cy = Math.floor(y / C);
  const k = lay.id[cy * cw + cx];
  const r = lay.rects[k];
  const lx = x - r.x * C, ly = y - r.y * C, sw = r.w * C, sh = r.h * C;
  // Rounded corners read as cobbles.
  const corner = (lx === 0 || lx === sw - 1) && (ly === 0 || ly === sh - 1);
  if (corner || lx === sw - 1 || ly === sh - 1) return L.grout;
  const h = hash2(r.x, r.y, seed);
  const base = h < 0.3 ? L.cobble[1] : h < 0.75 ? L.cobble[2] : L.cobble[3];
  if (lx === 0 || ly === 0) return shade(base, 0.1);
  if (lx === sw - 2 || ly === sh - 2) return shade(base, -0.15);
  return base;
}

function grassPixel(x: number, y: number, L: ZoneLook, n1: (x: number, y: number) => number, n3: (x: number, y: number) => number, _seed: number): RGBA {
  // Damp dark earth under low growth; the leaves themselves are drawn on top as shapes.
  const v = fbm(n1, x / 10, y / 10);
  const w = n3(x / 4, y / 4);
  let c = mix(L.soil, L.leaf[0], 0.55 + (v - 0.5) * 0.6);
  if (v > 0.6) c = mix(c, L.moss, 0.35);
  if (w > 0.75) c = shade(c, 0.06); else if (w < 0.2) c = shade(c, -0.08);
  return c;
}

/** Low ground cover for a grass tile: a scatter of small leaves and blades, lit from above. */
export function groundCover(p: Pix, x0: number, y0: number, L: ZoneLook, seed: number, density: number) {
  const n = Math.floor(3 + density * 4);
  const items: { x: number; y: number; a: number; len: number; k: number }[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + hash2(i, seed, 21) * 16, y = y0 + hash2(i, seed, 22) * 16;
    const a = -Math.PI / 2 + (hash2(i, seed, 23) - 0.5) * 2.6;
    items.push({ x, y, a, len: 5 + Math.floor(hash2(i, seed, 24) * 4), k: (hash2(i, seed, 25) - 0.55) * 1.3 });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) drawLeaf(p, it.x, it.y, it.a, it.len, it.k, L);
}

function waterPixel(x: number, y: number, room: RoomData, L: ZoneLook, n: (x: number, y: number) => number): RGBA {
  // Luminous shallow pool: pale cyan near the rim, deeper teal in the middle, with caustic lines.
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  let edge = 99;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const c = room.ch(tx + dx, ty + dy);
    if (c !== '~' && c !== 'w') {
      const ex = dx < 0 ? x - tx * TILE : dx > 0 ? (tx + 1) * TILE - 1 - x : 99;
      const ey = dy < 0 ? y - ty * TILE : dy > 0 ? (ty + 1) * TILE - 1 - y : 99;
      edge = Math.min(edge, dx && dy ? Math.hypot(Math.min(ex, 8), Math.min(ey, 8)) : Math.min(ex, ey));
    }
  }
  const depth = Math.min(1, edge / 9);
  let c = mix(mix(L.water[2], L.water[1], 0.35), L.water[0], depth * 0.85);
  // Caustics: thin bright lines where two warped noise fields cross their midlines.
  const v1 = n(x / 6 + 3, y / 4), v2 = n(x / 5 - 9, y / 7 + 4);
  if (Math.abs(v1 - 0.5) < 0.025 || Math.abs(v2 - 0.5) < 0.02) c = mix(c, L.water[2], 0.32 - depth * 0.12);
  // A dark lip right under the rim (the rim's shadow on the water).
  if (edge < 1.5) c = shade(L.water[1], -0.25);
  return c;
}

/** Small things on open stone: pebbles, fallen leaves, weeds in the joints, near overgrowth more of them. */
function floorDebris(p: Pix, x0: number, y0: number, L: ZoneLook, room: RoomData, tx: number, ty: number, seed: number) {
  let near = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const c = room.ch(tx + dx, ty + dy); if (c === '"' || c === 'F' || c === '*') near++; }
  const r = hash2(tx, ty, seed + 71);
  if (r < 0.02 + near * 0.035) {
    // A weed clump growing from a joint.
    const x = x0 + Math.floor(hash2(tx, ty, seed + 72) * 12) + 2, y = y0 + Math.floor(hash2(tx, ty, seed + 73) * 10) + 4;
    for (let i = 0; i < 3 + (near > 3 ? 2 : 0); i++) drawLeaf(p, x + (i - 1) * 2, y, -Math.PI / 2 + (i - 1.5) * 0.6, 4 + (i % 2) * 2, (hash2(i, tx, ty) - 0.5) * 1.2, L);
  } else if (r < 0.12) {
    // Pebbles.
    for (let i = 0; i < 3; i++) {
      const x = x0 + hash2(i, tx * 7 + ty, seed + 74) * 15, y = y0 + hash2(i, tx + ty * 5, seed + 75) * 15;
      p.set(x, y, L.stone[3]); p.set(x + 1, y, L.stone[2]); p.set(x, y + 1, shade(L.grout, -0.2));
    }
  } else if (r < 0.18) {
    // A fallen leaf.
    drawLeaf(p, x0 + 4 + hash2(tx, ty, seed + 76) * 8, y0 + 4 + hash2(tx, ty, seed + 77) * 8, hash2(tx, ty, seed + 78) * 6.28, 4, -0.3, L);
  }
}

function fern(p: Pix, x: number, y: number, L: ZoneLook, r: number) {
  const fronds = 4 + Math.floor(r * 3);
  for (let i = 0; i < fronds; i++) {
    const a = -Math.PI / 2 + (i / (fronds - 1) - 0.5) * 2.4;
    const len = 5 + ((r * 13 + i * 7) % 4);
    for (let s = 0; s < len; s++) {
      const fx = x + Math.cos(a) * s, fy = y + Math.sin(a) * s * 0.7 + s * s * 0.04;
      p.set(fx, fy, s < 2 ? L.leaf[1] : s % 2 ? L.leaf[2] : L.leaf[3]);
      if (s > 1 && s % 2 === 0) { p.set(fx - Math.sin(a), fy + 1, L.leaf[1]); }
    }
  }
}

function tufts(p: Pix, x0: number, y0: number, L: ZoneLook, seed: number) {
  for (let i = 0; i < 5; i++) {
    const x = x0 + hash2(i, seed, 1) * 15, y = y0 + 3 + hash2(i, seed, 2) * 12;
    const h = 2 + Math.floor(hash2(i, seed, 3) * 3);
    for (let k = 0; k < h; k++) p.set(x + (k > 1 ? (i % 2 ? 1 : -1) : 0), y - k, k === h - 1 ? L.leaf[3] : L.leaf[2]);
  }
}

function flowers(p: Pix, x0: number, y0: number, L: ZoneLook, seed: number) {
  tufts(p, x0, y0, L, seed);
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(x0 + 2 + hash2(i, seed, 5) * 12), y = Math.floor(y0 + 2 + hash2(i, seed, 6) * 12);
    p.set(x, y + 1, L.leaf[2]); p.set(x, y + 2, L.leaf[1]);
    const petal = mix(L.accent, [255, 255, 255, 255], 0.25);
    p.set(x - 1, y, petal); p.set(x + 1, y, petal); p.set(x, y - 1, petal); p.set(x, y + 1, petal);
    p.set(x, y, [255, 255, 240, 255]);
  }
}

function runeCircle(p: Pix, cx: number, cy: number, R: number, L: ZoneLook) {
  const inlay = mix(L.stone[1], P.brass, 0.55), glow = mix(P.brass, P.amber, 0.4);
  for (let y = -R - 2; y <= R + 2; y++) for (let x = -R - 2; x <= R + 2; x++) {
    const d = Math.hypot(x, y * 1.0);
    const a = Math.atan2(y, x);
    if (Math.abs(d - R) < 0.8 || Math.abs(d - (R - 4)) < 0.6) p.set(cx + x, cy + y, inlay);
    else if (d < R - 4 && d > R - 9 && (Math.floor((a + Math.PI) * 6) % 2 === 0) && Math.abs(d - (R - 6.5)) < 0.7) p.set(cx + x, cy + y, glow);
    else if (d < 7 && Math.abs(d - 6) < 0.6) p.set(cx + x, cy + y, inlay);
  }
  // Eight-pointed star.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const len = i % 2 ? R - 9 : R - 4;
    p.line(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, cx + Math.cos(a) * len, cy + Math.sin(a) * len, i % 2 ? inlay : glow);
  }
  p.set(cx, cy, P.brassH);
}

function lowBlock(p: Pix, x0: number, y0: number, continuesAbove: boolean, rubble: boolean, L: ZoneLook, r: number) {
  // Rough rim stones: two or three rounded blocks per tile, each with a lit top and a short front face.
  void continuesAbove;
  const seed = Math.floor(r * 10007);
  const blocks = rubble ? 3 : 2;
  for (let i = 0; i < blocks; i++) {
    const bw = rubble ? 7 + Math.floor(hash2(i, seed, 1) * 4) : 10 + Math.floor(hash2(i, seed, 1) * 4);
    const bh = 8 + Math.floor(hash2(i, seed, 2) * 4);
    const bx = x0 + (blocks === 2 ? i * 7 - 2 : i * 5 - 1) + Math.floor(hash2(i, seed, 3) * 2);
    const by = y0 + Math.floor(hash2(i, seed, 4) * 4);
    const face = 3;
    const tone = hash2(i, seed, 5);
    const top = tone < 0.4 ? L.cap[1] : tone < 0.8 ? L.cap[2] : L.cap[3];
    p.ellipse(bx + bw / 2, by + bh / 2 + face, bw / 2 + 0.6, bh / 2 + 0.6, shade(L.grout, -0.3));
    for (let y = 0; y < bh + face; y++) for (let x = 0; x < bw; x++) {
      const u = (x + 0.5 - bw / 2) / (bw / 2), v = (Math.min(y, bh) + 0.5 - bh / 2) / (bh / 2);
      if (u * u + v * v > 1.15) continue;
      let c: RGBA;
      if (y >= bh - 1) c = y === bh - 1 ? shade(L.wall[2], 0.05) : shade(L.wall[1], -(y - bh) * 0.08);
      else {
        c = top;
        if (u < -0.4 || v < -0.4) c = shade(top, 0.12);
        else if (u > 0.5) c = shade(top, -0.12);
        if (hash2(x + bx, y + by, seed) < 0.12) c = shade(c, -0.08);
        if (v < -0.2 && hash2(x + bx * 3, y, seed + 9) < (rubble ? 0.35 : 0.2)) c = mix(L.moss, L.leaf[2], 0.3);
      }
      p.set(bx + x, by + y, c);
    }
  }
}

function platform(p: Pix, x0: number, y0: number, L: ZoneLook) {
  // Under the orrery: dark worn stone.
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) p.set(x0 + x, y0 + y, shade(L.stone[1], -0.15 + (bayer(x, y) - 0.5) * 0.1));
}

// ---- Tall things, per row -------------------------------------------------------------------------

export const STRIP_EXTRA = 18; // extra height above a raised wall cap for foliage crowns and banners
export const STRIP_H = TILE + WALL_H + STRIP_EXTRA;

/**
 * Bake the tall layer of one tile row. The strip's bottom edge is the row's base line ((ty+1)*TILE);
 * it extends STRIP_H upward. Returns null when the row has nothing tall.
 */
export function bakeRowStrip(room: RoomData, zone: Zone, ty: number, seed: number): Pix | null {
  const L = LOOKS[zone];
  const ch = room.ch;
  let any = false;
  for (let tx = 0; tx < room.w; tx++) if (isTall(ch(tx, ty))) { any = true; break; }
  if (!any) return null;
  const W = room.w * TILE;
  const p = new Pix(W, STRIP_H);
  const base = STRIP_H; // y of the row's base line inside the strip
  // Walls first.
  for (let tx = 0; tx < room.w; tx++) {
    const c = ch(tx, ty);
    if (!isWallCh(c) || c === 'D') continue;
    drawWallTile(p, room, tx, ty, base, L, seed);
  }
  // Foliage clumps on top.
  const clumps: { x: number; y: number; r: number; s: number }[] = [];
  for (let tx = 0; tx < room.w; tx++) {
    if (!isFoliageCh(ch(tx, ty))) continue;
    const h = hash2(tx, ty, seed + 5);
    const n = h < 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const jx = (hash2(tx, ty + i * 17, seed + 6) - 0.5) * 10, jy = (hash2(tx + i * 5, ty, seed + 8) - 0.5) * 6;
      // Edge clumps (next to walkable ground) are a little smaller so the border reads cleanly.
      const open = !isTall(ch(tx, ty + 1)) || !isTall(ch(tx - 1, ty)) || !isTall(ch(tx + 1, ty));
      clumps.push({ x: tx * TILE + 8 + jx, y: base - 6 + jy, r: open ? 10 + h * 3 : 12 + h * 4, s: hash2(tx, ty, seed + 9) });
    }
  }
  clumps.sort((a, b) => a.y - b.y);
  for (const c of clumps) leafClump(p, c.x, c.y - 8, c.r, L, c.s);
  return p;
}

function drawWallTile(p: Pix, room: RoomData, tx: number, ty: number, base: number, L: ZoneLook, seed: number) {
  const ch = room.ch;
  const below = ch(tx, ty + 1), above = ch(tx, ty - 1);
  const faceVisible = !isWallCh(below) || below === 'D';
  const x0 = tx * TILE;
  const capTop = base - TILE - WALL_H; // the raised cap occupies [capTop, capTop+TILE)
  const r = hash2(tx, ty, seed + 1);
  // Cap (top surface).
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let c = L.cap[1];
    const v = hash2(x0 + x, ty * 31 + y, seed) + (bayer(x, y) - 0.5) * 0.3;
    if (v > 0.75) c = L.cap[2]; else if (v < 0.2) c = L.cap[0];
    // Slab joints on the cap.
    if ((x + tx * 5) % 12 === 0 || (y === 7 && (tx + ty) % 2 === 0)) c = shade(L.cap[0], -0.2);
    // Moss and grass growing on top.
    const m = fbm(valueNoise(seed + 77), (x0 + x) / 8, (ty * TILE + y) / 8);
    if (m > 0.58) c = m > 0.68 ? L.leaf[2] : L.moss;
    // The exposed top edge of the wall mass (nothing tall above) is broken and lit.
    if (!isWallCh(above) && y < 2) c = y === 0 ? (r > 0.3 && (x + Math.floor(r * 9)) % 9 < 6 ? L.cap[3] : [0, 0, 0, 0]) : L.cap[2];
    if (c[3]) p.set(x0 + x, capTop + y, c);
  }
  // Side edges of the cap where the mass ends horizontally.
  if (!isWallCh(ch(tx - 1, ty))) for (let y = 0; y < TILE; y++) p.set(x0, capTop + y, L.cap[3]);
  if (!isWallCh(ch(tx + 1, ty))) for (let y = 0; y < TILE; y++) p.set(x0 + TILE - 1, capTop + y, shade(L.cap[0], -0.3));
  // Vertical sides of a wall that ends left or right: show its depth as a narrow dark face.
  if (!faceVisible) return;
  // Front face: large dressed blocks in 7 px courses, offset per course, lit from the top-left.
  const faceTop = capTop + TILE;
  const COURSE = 7;
  for (let y = 0; y < WALL_H; y++) {
    const course = Math.floor(y / COURSE), cy = y % COURSE;
    // Block boundaries along this course, in room space so neighbouring tiles line up.
    for (let x = 0; x < TILE; x++) {
      const gx = x0 + x;
      const off = Math.floor(hash2(course, ty, seed + 3) * 13);
      const u = gx + off;
      // Variable block widths: a boundary every 10-15 px, chosen per 13 px cell.
      const cell = Math.floor(u / 13), within = u - cell * 13;
      const bw = 10 + Math.floor(hash2(cell, course + ty * 7, seed) * 4);
      const bx = within % bw, blockId = cell * 3 + Math.floor(within / bw);
      const tone = hash2(blockId, course + ty * 31, seed + 5);
      let c = tone < 0.3 ? L.wall[1] : tone < 0.8 ? L.wall[2] : L.wall[3];
      const grain = hash2(gx >> 1, (faceTop + y) >> 1, seed + 9);
      if (grain > 0.85) c = shade(c, 0.06); else if (grain < 0.12) c = shade(c, -0.08);
      if (cy === 0) c = shade(c, 0.16);
      else if (cy === 1 || bx === 0) c = shade(c, 0.07);
      if (cy === COURSE - 2 || bx === bw - 2) c = shade(c, -0.14);
      if (cy === COURSE - 1 || bx === bw - 1) c = L.grout;
      if (hash2(blockId, course * 3 + ty, seed + 7) > 0.94 && cy > 0 && cy < COURSE - 1 && bx < bw - 1) c = shade(L.wall[0], -0.45); // missing block
      // Damp moss streaks running down from the top.
      const streak = hash2(gx >> 2, ty, seed + 13);
      if (streak > 0.78 && y < 6 + streak * 14 && hash2(gx, y, seed + 14) < 0.7 && cy !== COURSE - 1) c = mix(c, L.moss, 0.55);
      if (y >= WALL_H - 4) c = shade(c, -0.12 - (y - WALL_H + 4) * 0.08); // darker toward the ground
      if (x === 0 && !isWallCh(ch(tx - 1, ty))) c = shade(c, 0.12);
      if (x === TILE - 1 && !isWallCh(ch(tx + 1, ty))) c = shade(c, -0.3);
      p.set(gx, faceTop + y, c);
    }
  }
  // The lip of the cap overhangs the face by a pixel.
  for (let x = 0; x < TILE; x++) { p.set(x0 + x, faceTop, L.cap[3]); p.set(x0 + x, faceTop + 1, shade(L.wall[0], -0.3)); }
  // Hanging vines from the cap edge.
  if (r > 0.45) {
    const vx = x0 + 2 + Math.floor(r * 11);
    const len = 4 + Math.floor(hash2(tx, ty, seed + 4) * (WALL_H - 4));
    for (let k = 0; k < len; k++) {
      const x = vx + Math.round(Math.sin(k * 0.7 + r * 6) * 0.8);
      p.set(x, faceTop + k, k % 3 === 0 ? L.leaf[3] : L.leaf[2]);
      if (k % 4 === 2) p.set(x + 1, faceTop + k, L.leaf[1]);
    }
  }
  // Overgrowth on the wall top: leaves spill over the cap and its front lip.
  const og = hash2(tx, ty, seed + 21);
  if (og < 0.8) {
    const n = 2 + Math.floor(og * 6);
    for (let i = 0; i < n; i++) {
      const lx = x0 + hash2(i, tx * 13 + ty, seed + 22) * TILE, ly = capTop + 3 + hash2(i, tx + ty * 17, seed + 23) * (TILE - 2);
      drawLeaf(p, lx, ly, -Math.PI / 2 + (hash2(i, tx, seed + 24) - 0.5) * 2.8, 6 + Math.floor(hash2(i, ty, seed + 25) * 4), (hash2(i, tx + ty, seed + 26) - 0.35) * 1.4, L);
    }
  }
  const c = ch(tx, ty);
  if (c === 'b') banner(p, x0, faceTop - 6, L);
  if (c === 'l') wallLantern(p, x0 + 5, faceTop + 3);
}

function banner(p: Pix, x0: number, y0: number, L: ZoneLook) {
  const cloth = [16, 22, 40, 255] as RGBA, clothL = [30, 40, 70, 255] as RGBA, trim = P.brass;
  p.rect(x0 + 1, y0, 14, 2, P.brassD);
  p.set(x0, y0, P.brass); p.set(x0 + 15, y0, P.brass);
  for (let y = 2; y < 26; y++) for (let x = 3; x < 13; x++) {
    const tip = y > 21 && Math.abs(x - 7.5) < y - 21;
    if (tip) continue;
    let c = x < 5 ? clothL : cloth;
    if (x === 3 || x === 12) c = trim;
    p.set(x0 + x, y0 + y, c);
  }
  // Sun emblem.
  const cx = x0 + 8, cy = y0 + 11;
  p.ellipse(cx, cy, 2, 2, P.brass);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.set(cx - 0.5 + Math.cos(a) * 3.6, cy - 0.5 + Math.sin(a) * 3.6, i % 2 ? P.brassD : P.brass); }
  p.set(cx - 0.5, cy - 0.5, P.brassH);
  void L;
}

function wallLantern(p: Pix, x: number, y: number) {
  p.rect(x + 1, y, 4, 1, P.brassD); // bracket
  p.set(x + 3, y + 1, P.brassD);
  p.rect(x + 1, y + 2, 5, 1, P.brass);
  p.rect(x, y + 3, 7, 6, P.brassD);
  p.rect(x + 1, y + 3, 5, 6, P.glass);
  p.rect(x + 2, y + 4, 3, 4, P.core);
  p.rect(x + 1, y + 9, 5, 1, P.brass);
}

export function leafClump(p: Pix, cx: number, cy: number, r: number, L: ZoneLook, s: number) {
  // A bush built from individual leaves: a dark mass, then leaves back to front, lit from the top-left.
  const seed = Math.floor(s * 9973);
  const ry = r * 0.82;
  p.ellipse(cx, cy + 1, r + 1, ry + 1, shade(L.leaf[0], -0.45));
  p.ellipse(cx, cy, r, ry, (x, y) => (hash2(x >> 1, y >> 1, seed) > 0.5 ? L.leaf[0] : shade(L.leaf[0], -0.2)));
  const count = Math.floor(r * r * 0.11) + 4;
  const leaves: { x: number; y: number; a: number; len: number; k: number }[] = [];
  for (let i = 0; i < count; i++) {
    const ang = hash2(i, seed, 1) * Math.PI * 2, rad = Math.sqrt(hash2(i, seed, 2));
    const x = cx + Math.cos(ang) * rad * (r - 3), y = cy + Math.sin(ang) * rad * (ry - 3);
    const a = Math.atan2(y - cy + 3, x - cx) + (hash2(i, seed, 3) - 0.5) * 1.1;
    const u = (x - cx) / r, v = (y - cy) / ry;
    const k = -u * 0.4 - v * 0.85 + (hash2(i, seed, 4) - 0.5) * 0.5;
    leaves.push({ x, y, a, len: 8 + Math.floor(hash2(i, seed, 5) * 4), k });
  }
  leaves.sort((a, b) => a.y - b.y);
  for (const l of leaves) drawLeaf(p, l.x, l.y, l.a, l.len, l.k, L);
  // A crown of upward leaves over the centre so the bush has a lit top, not a hollow.
  for (let i = 0; i < 3 + Math.floor(r / 5); i++) {
    const x = cx + (hash2(i, seed, 31) - 0.5) * r * 0.9, y = cy - ry * 0.25 + (hash2(i, seed, 32) - 0.5) * ry * 0.6;
    drawLeaf(p, x, y, -Math.PI / 2 + (hash2(i, seed, 33) - 0.5) * 1.8, 8 + Math.floor(hash2(i, seed, 34) * 3), 0.5 + hash2(i, seed, 35) * 0.5, L);
  }
  // Bioluminescent star flowers on some bushes.
  if (s > 0.6) {
    const n = 1 + Math.floor((s - 0.6) * 10);
    for (let i = 0; i < n; i++) {
      const bx = Math.round(cx + (hash2(i, seed, 11) - 0.5) * r * 1.3), by = Math.round(cy + (hash2(i, seed, 12) - 0.7) * ry * 1.2);
      const petal = s > 0.9 ? P.magentaL : P.cyan;
      p.set(bx - 1, by, petal); p.set(bx + 1, by, petal); p.set(bx, by - 1, petal); p.set(bx, by + 1, petal);
      p.set(bx, by, P.cyanL);
    }
  }
}

export function drawLeaf(p: Pix, x0: number, y0: number, a: number, len: number, k: number, L: ZoneLook) {
  // A pointed leaf sampled per pixel in its own frame (u along, v across): lit half, shaded half,
  // pale midrib, and a dark rim so every leaf reads as its own shape.
  const col = k > 0.75 ? L.leaf[4] : k > 0.3 ? L.leaf[3] : k > -0.15 ? L.leaf[2] : k > -0.6 ? L.leaf[1] : L.leaf[0];
  const lit = mix(col, L.leaf[4], 0.35), dark = shade(col, -0.28), rim = shade(L.leaf[0], -0.55), vein = mix(col, L.leaf[4], 0.55);
  const dx = Math.cos(a), dy = Math.sin(a);
  const hw = Math.max(1.4, len * 0.3);
  const half = (u: number) => (u <= 0 || u >= len ? -1 : hw * Math.pow(Math.sin(Math.PI * Math.pow(u / len, 0.8)), 0.9));
  const inside = (u: number, v: number) => Math.abs(v) <= half(u);
  const R = Math.ceil(len + 2);
  for (let py = -R; py <= R; py++) for (let px = -R; px <= R; px++) {
    const X = Math.floor(x0) + px, Y = Math.floor(y0) + py;
    const rx = X + 0.5 - x0, ry = Y + 0.5 - y0;
    const u = rx * dx + ry * dy, v = -rx * dy + ry * dx;
    if (!inside(u, v)) {
      // One-pixel rim around the leaf.
      let near = false;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const uu = (rx + ox) * dx + (ry + oy) * dy, vv = -(rx + ox) * dy + (ry + oy) * dx; if (inside(uu, vv)) { near = true; break; } }
      if (near && p.alpha(X, Y) > 0) p.set(X, Y, rim);
      continue;
    }
    // Light comes from the top-left: the half whose normal faces up-left is lit.
    const nUp = (v < 0 ? -1 : 1) * (dy * 1 + -dx * 0.5);
    let c = nUp > 0.05 ? dark : lit;
    if (Math.abs(v) < 0.5 && u > len * 0.12 && u < len * 0.85 && len >= 6) c = vein;
    else if (Math.abs(v) > half(u) - 0.8) c = nUp > 0.05 ? shade(dark, -0.15) : col;
    p.set(X, Y, c);
  }
}

// ---- Props (separate sprites, depth-sorted) -----------------------------------------------------------

export interface PropArt { pix: Pix; ox: number; oy: number } // ox, oy: where the footprint's bottom-left sits in the pix

export function bakeProp(kind: string, tw: number, th: number, zone: Zone, seed: number): PropArt {
  const L = LOOKS[zone];
  switch (kind) {
    case 'o': return pillar(L, seed);
    case 'L': return lanternPost();
    case 'O': return orrery(tw, th, L);
    case 's': return statue(L);
    case 'c': return fallenBlock(L, seed);
    case 'W': return pedestal(L, 'lantern');
    case 'V': return pedestal(L, 'lance');
    case 'U': return shrine(L);
    case 'H': return heartbloom(L);
    case 'C': return cache(L);
    case 'K': return loreLantern(L);
    case 'B': return brazier();
    default: return { pix: new Pix(16, 16), ox: 0, oy: 16 };
  }
}

function pillar(L: ZoneLook, seed: number): PropArt {
  const H = 44, p = new Pix(18, H);
  const broken = hash2(seed, 3, 1) < 0.4;
  const top = broken ? 12 : 4;
  // Base plinth.
  p.rect(0, H - 7, 18, 6, L.wall[1]);
  p.rect(0, H - 7, 18, 1, L.cap[2]);
  p.rect(1, H - 12, 16, 5, L.cap[1]);
  p.rect(1, H - 12, 16, 1, L.cap[2]);
  // Shaft with fluting.
  for (let y = top + 4; y < H - 12; y++) for (let x = 3; x < 15; x++) {
    const u = (x - 3) / 11;
    let c = u < 0.25 ? L.wall[3] : u < 0.55 ? L.wall[2] : u < 0.85 ? L.wall[1] : L.wall[0];
    if ((x - 3) % 3 === 2) c = shade(c, -0.18);
    if (y % 9 === 0) c = L.grout;
    p.set(x, y, c);
  }
  if (!broken) {
    p.rect(1, top, 16, 4, L.cap[1]);
    p.rect(1, top, 16, 1, L.cap[3]);
    p.rect(2, top + 3, 14, 1, L.wall[0]);
  } else {
    for (let x = 3; x < 15; x++) { const jag = Math.floor(hash2(x, 1, seed) * 4); for (let y = top + 4; y < top + 4 + jag; y++) p.clear(x, y); p.set(x, top + 4 + jag, L.cap[2]); }
  }
  // Ivy.
  for (let k = 0; k < 18; k++) {
    const x = 4 + Math.round(Math.sin(k * 0.6 + seed) * 2 + 3), y = H - 14 - k;
    p.set(x, y, k % 3 ? L.leaf[2] : L.leaf[3]);
    if (k % 3 === 1) p.set(x + 1, y + 1, L.leaf[1]);
  }
  p.outline(P.ink2);
  return { pix: p, ox: 1, oy: H - 1 };
}

function lanternPost(): PropArt {
  const H = 34, p = new Pix(12, H);
  p.rect(3, H - 4, 6, 3, P.stoneM);
  p.rect(3, H - 4, 6, 1, P.stoneL);
  p.rect(5, 10, 2, H - 14, P.brassD);
  p.set(5, 12, P.brass); p.set(5, 18, P.brass);
  p.rect(2, 1, 8, 2, P.brass);
  p.rect(1, 3, 10, 8, P.brassD);
  p.rect(2, 3, 8, 7, P.glass);
  p.rect(4, 4, 4, 5, P.core);
  p.rect(2, 10, 8, 1, P.brass);
  p.outline(P.ink2);
  return { pix: p, ox: -2, oy: H - 1 };
}

function statue(L: ZoneLook): PropArt {
  // A hooded stone keeper of old with a stone lantern.
  const H = 46, p = new Pix(20, H);
  p.rect(1, H - 8, 18, 7, L.wall[1]); p.rect(1, H - 8, 18, 1, L.cap[2]);
  p.poly([5, 14, 15, 14, 17, H - 8, 3, H - 8], (x) => (x < 8 ? L.wall[3] : x < 12 ? L.wall[2] : L.wall[1]));
  p.ellipse(10, 10, 5, 6, (x, y) => (x < 9 && y < 9 ? L.cap[3] : L.wall[2]));
  p.ellipse(10, 12, 3, 2.5, L.grout);
  p.rect(15, 22, 4, 6, L.wall[2]); p.rect(16, 23, 2, 4, mix(P.glass, L.wall[2], 0.5));
  p.outline(P.ink2);
  return { pix: p, ox: 2, oy: H - 1 };
}

function fallenBlock(L: ZoneLook, seed: number): PropArt {
  const p = new Pix(18, 22);
  p.rect(1, 4, 16, 10, L.cap[1]); p.rect(1, 4, 16, 1, L.cap[3]);
  p.rect(1, 14, 16, 7, L.wall[1]); p.rect(1, 14, 16, 1, L.wall[0]);
  for (let i = 0; i < 6; i++) p.set(2 + hash2(i, seed, 2) * 14, 5 + hash2(i, seed, 3) * 8, L.moss);
  p.outline(P.ink2);
  return { pix: p, ox: 1, oy: 21 };
}

function orrery(tw: number, th: number, L: ZoneLook): PropArt {
  // An ancient armillary orrery on a stepped stone dais: brass rings around a dark glass core.
  const W = tw * TILE + 8, H = th * TILE + 40;
  const p = new Pix(W, H);
  const cx = W / 2, by = H - 2;
  // Dais: two steps.
  for (let s = 0; s < 2; s++) {
    const w = W - 2 - s * 10, x0 = (W - w) / 2, y0 = by - 8 - s * 7, h = 7;
    p.rect(x0, y0, w, 3, L.cap[2 - s]);
    p.rect(x0, y0, w, 1, L.cap[3]);
    p.rect(x0, y0 + 3, w, h - 3, L.wall[1]);
    for (let x = 0; x < w; x += 6) p.set(x0 + x, y0 + 4, L.grout);
  }
  // Pedestal.
  p.rect(cx - 4, by - 30, 8, 16, L.wall[2]);
  p.rect(cx - 4, by - 30, 2, 16, L.wall[3]);
  p.rect(cx - 6, by - 31, 12, 2, L.cap[2]);
  // Rings.
  const ry = by - 46, R = Math.min(W / 2 - 3, 22);
  const ring = (rx: number, rr: number, tilt: number, col: RGBA, front: boolean) => {
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      const x = Math.cos(a) * rx, y = Math.sin(a) * rr;
      const X = x * Math.cos(tilt) - y * Math.sin(tilt), Y = x * Math.sin(tilt) + y * Math.cos(tilt);
      const isFront = Math.sin(a) > 0;
      if (isFront !== front) continue;
      p.set(cx + X, ry + Y, col);
      p.set(cx + X, ry + Y + 1, shade(col, -0.35));
    }
  };
  ring(R, R * 0.35, 0.35, P.brassD, false);
  ring(R * 0.85, R * 0.85, 0, P.brassD, false);
  // Core globe.
  p.ellipse(cx, ry, 6, 6, (x, y) => (x < cx - 1 && y < ry - 1 ? mix(P.glass, P.brassD, 0.5) : x > cx + 2 ? P.brassD : P.brass));
  p.set(cx - 2, ry - 3, P.brassH);
  ring(R, R * 0.35, 0.35, P.brass, true);
  ring(R * 0.85, R * 0.85, 0, P.brass, true);
  ring(R * 0.6, R * 0.2, -0.8, P.brassH, true);
  // Small planets on the rings.
  p.ellipse(cx + R * 0.9, ry + 3, 2, 2, P.cyan);
  p.ellipse(cx - R * 0.6, ry - R * 0.5, 1.6, 1.6, P.amber);
  // Vines around the dais.
  for (let k = 0; k < 30; k++) p.set(4 + ((k * 7) % (W - 8)), by - 2 - ((k * 3) % 12), k % 2 ? L.leaf[2] : L.leaf[3]);
  p.outline(P.ink2);
  return { pix: p, ox: (W - tw * TILE) / 2, oy: H - 1 };
}

// ---- Interactive props -------------------------------------------------------------------------------

function plinth(p: Pix, x0: number, y0: number, w: number, h: number, L: ZoneLook) {
  p.rect(x0, y0, w, 3, L.cap[2]); p.rect(x0, y0, w, 1, L.cap[3]);
  p.rect(x0, y0 + 3, w, h - 3, L.wall[2]);
  p.rect(x0, y0 + 3, 2, h - 3, L.wall[3]);
  p.rect(x0 + w - 2, y0 + 3, 2, h - 3, L.wall[1]);
  p.rect(x0, y0 + h - 1, w, 1, shade(L.wall[0], -0.3));
}

function pedestal(L: ZoneLook, kind: 'lantern' | 'lance'): PropArt {
  const p = new Pix(20, 40);
  plinth(p, 2, 28, 16, 11, L);
  p.rect(5, 30, 10, 1, P.brassD);
  if (kind === 'lantern') {
    // A brass lantern floating above the plinth.
    p.rect(9, 6, 2, 3, P.brassD); p.ellipse(10, 6, 2.5, 2, P.brass); p.ellipse(10, 6, 1.2, 1, [0, 0, 0, 0]);
    p.rect(6, 9, 8, 2, P.brass);
    p.rect(5, 11, 10, 11, P.brassD);
    p.rect(6, 11, 8, 10, P.glass); p.rect(8, 12, 4, 7, P.core);
    p.rect(9, 11, 1, 10, P.brassD);
    p.rect(6, 21, 8, 2, P.brass);
  } else {
    // The Sunlance: a slim spear of brass and light, point up.
    for (let y = 2; y < 26; y++) p.set(10, y, y < 8 ? P.core : y < 10 ? P.brassH : P.brass);
    for (let y = 10; y < 26; y++) p.set(11, y, P.brassD);
    p.poly([10, 0, 13, 7, 10, 10, 7, 7], (x) => (x < 10 ? P.core : P.glass));
    p.rect(8, 10, 5, 1, P.brassH); p.rect(9, 24, 3, 2, P.brassD);
  }
  p.outline(P.ink2);
  return { pix: p, ox: 2, oy: 39 };
}

function shrine(L: ZoneLook): PropArt {
  const p = new Pix(28, 48);
  plinth(p, 1, 38, 26, 9, L);
  plinth(p, 4, 32, 20, 7, L);
  // The stele.
  p.rect(7, 6, 14, 27, L.wall[2]); p.rect(7, 6, 3, 27, L.wall[3]); p.rect(18, 6, 3, 27, L.wall[1]);
  p.ellipse(14, 7, 7, 5, (x, y) => (y < 7 ? (x < 11 ? L.cap[3] : L.cap[2]) : null));
  // The sun disc inlay with a glowing core.
  p.ellipse(14, 17, 5, 5, P.brassD); p.ellipse(14, 17, 3.6, 3.6, P.amberD); p.ellipse(14, 17, 2.2, 2.2, P.core);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.set(14 + Math.cos(a) * 6.5, 17 + Math.sin(a) * 6.5, P.brass); }
  for (let y = 25; y < 31; y++) p.set(14, y, P.brassD);
  // Ivy.
  for (let k = 0; k < 14; k++) p.set(8 + Math.round(Math.sin(k * 0.8) * 1.5), 31 - k, k % 2 ? L.leaf[3] : L.leaf[2]);
  p.outline(P.ink2);
  return { pix: p, ox: 6, oy: 47 };
}

function heartbloom(L: ZoneLook): PropArt {
  const p = new Pix(30, 30);
  leafClump(p, 15, 20, 11, L, 0.3);
  // Big glowing rose-red blossoms.
  const petal = hexA('#ff7a9a'), petalL = hexA('#ffc2d2'), heart = hexA('#fff1f4');
  for (const [x, y, r] of [[15, 12, 4.5], [8, 17, 3.2], [22, 17, 3.4]] as const) {
    p.ellipse(x, y, r, r * 0.85, (px, py) => (Math.hypot(px - x + 1, py - y + 1) < r * 0.45 ? heart : (px + py) % 3 === 0 ? petalL : petal));
  }
  p.outline(P.ink2);
  return { pix: p, ox: 7, oy: 29 };
}

function cache(L: ZoneLook): PropArt {
  const p = new Pix(22, 22);
  // A brass-bound reliquary chest with light leaking from its seams.
  p.rect(2, 8, 18, 12, hexA('#3a2a22')); p.rect(2, 8, 18, 1, hexA('#5a4232'));
  p.ellipse(11, 8, 9, 4, (x, y) => (y < 8 ? (x < 9 ? hexA('#5a4232') : hexA('#47342a')) : null));
  for (const x of [2, 10, 18]) p.rect(x, 5, 2, 15, P.brass);
  p.rect(2, 12, 18, 1, P.cyan); p.rect(9, 11, 4, 3, P.cyanL);
  p.rect(2, 19, 18, 1, shade(L.wall[0], -0.3));
  p.outline(P.ink2);
  return { pix: p, ox: 3, oy: 21 };
}

function loreLantern(L: ZoneLook): PropArt {
  const p = new Pix(16, 38);
  plinth(p, 2, 30, 12, 7, L);
  p.rect(6, 12, 4, 18, L.wall[2]); p.rect(6, 12, 1, 18, L.wall[3]);
  p.rect(3, 3, 10, 2, P.brassD);
  p.rect(4, 5, 8, 8, shade(P.brassD, -0.3));
  p.rect(5, 6, 6, 6, hexA('#2a2420')); // dark glass until kindled (the light is drawn by the view)
  p.rect(4, 12, 8, 1, P.brassD);
  p.outline(P.ink2);
  return { pix: p, ox: 0, oy: 37 };
}

function brazier(): PropArt {
  const p = new Pix(18, 26);
  // An iron bowl on three legs, heaped with embers.
  for (const [x0, x1] of [[4, 2], [9, 9], [14, 16]]) p.line(x0, 14, x1, 24, hexA('#2b2524'));
  p.ellipse(9, 12, 7, 3.5, hexA('#3a3230'));
  p.ellipse(9, 11, 6, 2.5, hexA('#ff7a2a'));
  p.ellipse(9, 10.5, 3.5, 1.5, hexA('#ffd27a'));
  for (const [x, y] of [[6, 7], [9, 4], [12, 6], [8, 2]]) p.set(x, y, hexA('#ffb347'));
  p.outline(P.ink2);
  return { pix: p, ox: 1, oy: 25 };
}

function hexA(c: string): RGBA { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; }
