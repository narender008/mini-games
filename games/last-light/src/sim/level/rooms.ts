// Room templates and their parser. Rooms are authored as text, one character per 16 px tile:
//   .  flagstone floor        ,  worn cobble path       "  overgrown floor (moss, ferns)
//   *  glowing flowers (floor) R  rune circle (floor)    P  player start
//   #  ruined wall (tall)      b  wall with a banner     l  wall with a lantern
//   F  dense foliage (solid)   ~  deep pool              w  shallow water (slows)
//   r  low stone rim          x  rubble (low)           _  chasm
//   o  pillar                  L  lantern post           s  statue        c  fallen block
//   O  orrery (contiguous cells form one machine)       D  door (sealed until the room is clear)
import { TILE } from '../../config';
import { Grid, T } from '../grid';
import type { EnemyKind, Prop } from '../types';

export type Zone = 'sanctum' | 'causeway' | 'aqueduct' | 'foundry' | 'heart';

export interface WaveDef { kinds: EnemyKind[]; elite?: number }

export interface RoomDef {
  id: string;
  zone: Zone;
  name: string;
  map: string[];
  waves: WaveDef[];
}

export interface Door { cells: { tx: number; ty: number }[]; side: 'n' | 's' | 'e' | 'w'; x: number; y: number; open: boolean }

export interface RoomData {
  def: RoomDef;
  w: number; h: number;
  grid: Grid;
  props: Prop[];
  doors: Door[];
  spawn: { x: number; y: number };
  /** The raw character at each tile, for the art baker. */
  ch: (tx: number, ty: number) => string;
}

const TILE_OF: Record<string, number> = {
  '.': T.FLOOR, ',': T.FLOOR, '"': T.FLOOR, '*': T.FLOOR, 'R': T.FLOOR, 'P': T.FLOOR,
  '#': T.WALL, 'b': T.WALL, 'l': T.WALL, 'F': T.FOLIAGE, '~': T.WATER, 'w': T.SHALLOW,
  'r': T.LOW, 'x': T.LOW, '_': T.PIT, 'o': T.PROP, 'L': T.PROP, 's': T.PROP, 'c': T.PROP, 'O': T.PROP,
  'D': T.WALL, 'T': T.FLOOR,
  // Interactive props: U upgrade shrine, H heartbloom, C light cache, K lore lantern, W/V weapon pedestals, B brazier.
  'U': T.PROP, 'H': T.PROP, 'C': T.PROP, 'K': T.PROP, 'W': T.PROP, 'V': T.PROP, 'B': T.PROP,
};

export function parseRoom(def: RoomDef): RoomData {
  const h = def.map.length, w = def.map[0].length;
  for (const row of def.map) if (row.length !== w) throw new Error(`room ${def.id}: ragged row`);
  const grid = new Grid(w, h);
  const props: Prop[] = [];
  let spawn = { x: (w / 2) * TILE, y: (h / 2) * TILE };
  const ch = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= w || ty >= h ? 'F' : def.map[ty][tx]);
  const seen = new Set<number>();
  let pid = 1;
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const c = ch(tx, ty);
      const t = TILE_OF[c];
      if (t === undefined) throw new Error(`room ${def.id}: unknown tile '${c}' at ${tx},${ty}`);
      grid.set(tx, ty, t);
      if (c === 'P') spawn = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
      if ('oLscUHCKWVB'.includes(c)) {
        props.push({ id: pid++, kind: c, tx, ty, tw: 1, th: 1, lit: c === 'L' || c === 'B', used: false, interact: null, data: 0 });
      }
      if (c === 'O' && !seen.has(ty * w + tx)) {
        // Flood the contiguous block.
        let x1 = tx, y1 = ty;
        while (ch(x1 + 1, ty) === 'O') x1++;
        while (ch(tx, y1 + 1) === 'O') y1++;
        for (let y = ty; y <= y1; y++) for (let x = tx; x <= x1; x++) seen.add(y * w + x);
        props.push({ id: pid++, kind: 'O', tx, ty, tw: x1 - tx + 1, th: y1 - ty + 1, lit: false, used: false, interact: null, data: 0 });
      }
    }
  }
  // Doors: contiguous groups of D cells.
  const doors: Door[] = [];
  const dseen = new Set<number>();
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    if (ch(tx, ty) !== 'D' || dseen.has(ty * w + tx)) continue;
    const cells: { tx: number; ty: number }[] = [];
    const stack = [[tx, ty]];
    dseen.add(ty * w + tx);
    while (stack.length) {
      const [x, y] = stack.pop()!;
      cells.push({ tx: x, ty: y });
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (ch(nx, ny) === 'D' && !dseen.has(ny * w + nx)) { dseen.add(ny * w + nx); stack.push([nx, ny]); }
      }
    }
    const minY = Math.min(...cells.map((c) => c.ty)), maxY = Math.max(...cells.map((c) => c.ty));
    const minX = Math.min(...cells.map((c) => c.tx)), maxX = Math.max(...cells.map((c) => c.tx));
    const side = minY === 0 ? 'n' : maxY === h - 1 ? 's' : minX === 0 ? 'w' : 'e';
    doors.push({ cells, side, x: ((minX + maxX + 1) / 2) * TILE, y: ((minY + maxY + 1) / 2) * TILE, open: false });
  }
  return { def, w, h, grid, props, doors, spawn, ch };
}

export function setDoorOpen(room: RoomData, door: Door, open: boolean) {
  door.open = open;
  for (const c of door.cells) room.grid.set(c.tx, c.ty, open ? T.FLOOR : T.WALL);
  room.grid.flowTarget = -1;
}

export const ROOMS: Record<string, RoomDef> = {
  sanctum: {
    id: 'sanctum',
    zone: 'sanctum',
    name: 'The Last Sanctum',
    map: [
      'FFFFFFFFFFFFFFFFDDDDFFFFFFFFFFFFFFFF',
      'FFFFFFFFFFFFFFFFDDDDFFFFFFFFFFFFFFFF',
      'FFFFFFFFFFFFFFFFDDDDFFFFFFFFFFFFFFFF',
      'FFF.############DDDD############""FF',
      'FF..#####l###bl#DDDD#lb###l#####.FFF',
      'FFF.............,,,,..........."."FF',
      'FF..............,,,,.............FFF',
      'FFF........"*...,,,,....."*....".FFF',
      'FFF."...K........................FFF',
      'FFF."............................FFF',
      'FFF.".........................."."FF',
      'FFF"........W..........V.........FFF',
      'FFF....s..........R.........s..."FFF',
      'FFF"............................"FFF',
      'FF..".........................."""FF',
      'FFF.......L..............L.......FFF',
      'FFF...............................FF',
      'FFF...............T..............FFF',
      'FFF""."*........................""FF',
      'FF........................."*....FFF',
      'FF""....."*.....,,,,..............FF',
      'FFF"....".."....,,P,""...."""""..FFF',
      'FFF""...."""...",,,,.........."..FFF',
      'FFFF.F.FFF...FFFFF"FF"F"..F".".FFFFF',
      'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
      'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
    ],
    waves: [],
  },
  plaza: {
    id: 'plaza',
    zone: 'causeway',
    name: 'The Orrery Plaza',
    map: [
      'FFFFFFFFFFFFFFFFFFFFFFFFFFDDDDFFFFFFFFFFFFFFFFFFFFFFFFFF',
      'FFFFFFFFFFFFFFFFFFFFFFFFFFDDDDFFFFFFFFFFFFFFFFFFFFFFFFFF',
      'FFFF"FFFFFFFFFFFFFFFFFFFFFDDDDFFFFFFFFFFFFFFFFFFFFF"..FF',
      'FFFF"FFF##################DDDD##################FFFFFFFF',
      'FFF...FF######l#######b#l#DDDD#l#b#######l######FF""FFFF',
      'FF...."....."."......"""..,,,,.."".......""""."."....FFF',
      'FF.F.,,,,,,,..............,,,,....................."F"FF',
      'FFF.",.OOO.,..............,,,,......................F"FF',
      'FFF..,.OOO.,.L............,,,,.............###F......FFF',
      'FF.F.,.OOO.,......o..................o.....#~~......".FF',
      'FF"F.,,,,,,,...............................#~~....""."FF',
      'FF.F"*""*".................................#rr....".FFFF',
      'FF.F...................................."*........""F"FF',
      'FF.F"........rrrrr.....s........s.......".........."."FF',
      'FFFF.".......r~~~r.....................o.L........"..FFF',
      'FFF..".......r~~~r................................".FFFF',
      'FF.".".......rrrrr..................................F.FF',
      'FFFF."......"*"...................................""FFFF',
      'FFFF.".............."*......P......................"FFFF',
      'FFFF................".............."*.............".".FF',
      'FFF...........c...................."..............."..FF',
      'FFFF""............................................."FFFF',
      'FF."""............o..................o............."FFFF',
      'FF.F".".".........................................".FFFF',
      'FFFF"......................"*.....................""FFFF',
      'FFFF""...R................."..............rrrr........FF',
      'FFFF."....................................r~~r......F.FF',
      'FF."............"*............c...........r~~r........FF',
      'FF"F"...........".........................rrrr...."...FF',
      'FFFF................................................""FF',
      'FFFF."....xrrrr"""##c###..."..."."#c####."".rrxr."...FFF',
      'FF.F".."""r.".."..#""""#..""".".""#""""#....."...."""FFF',
      'FFFF.F".FFF.F.FFFFFFFF..FFFFFF"F.FFFFF."F.F"F..FFFF...FF',
      'FF"".FFF.FFF.F"FF..FF.FFF.F.FFFF".FF""F".FFF.FFF"FFF..FF',
      'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
      'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
    ],
    waves: [
      { kinds: ['stalker', 'stalker'] },
      { kinds: ['stalker', 'stalker', 'stalker'] },
      { kinds: ['stalker', 'stalker', 'stalker', 'stalker'], elite: 1 },
    ],
  },
  // The final arena: a round court of broken flagstones where the Choked Star fell. Six pillars give
  // cover from its beams and orbs; the only way in (and out) is the door at the bottom. The boss is
  // spawned by installBoss (src/sim/boss.ts) at the centre-top, so there is no wave list.
  heart: {
    id: 'heart',
    zone: 'heart',
    name: 'The Heart of the Fall',
    map: [
      'FFFFFFFFFFF#################FFFFFFFFFFFF',
      'FFFFFFFF#######"""."."*"#######FFFFFFFFF',
      'FFFFFFF#####*""".."."**"...#####FFFFFFFF',
      'FFFFF####""".",,,,,,,,,,,"."""####FFFFFF',
      'FFFF####""""s,",,",,,,,,,,,s"*"####FFFFF',
      'FFF###.""",,,,,",,,",,,,,,","*"".###FFFF',
      'FF###*"",,,,,,,,,,,,,,,,,,"",,,"""###FFF',
      'F###..",",,,,",.........,,,,,,,,""*###FF',
      'F###."",,,,,".............,,",",,""###FF',
      '###".",",o,,...............","o",".*###F',
      '###""",",,".................,,,,,,""###F',
      '###".,",,"...................",,,,".###F',
      '##.".,,,,,...................,,,,,.."##F',
      '##**x,,","...................,",,,.x.##F',
      '##""",","".........RR........,,,,,"..##F',
      '###*",,,",...................,,,,,""###F',
      '###.",,o",,.................",,,o"""###F',
      '###."*,,,,,,...............,,,,,""..###F',
      'F###"x,,,,,",............."",,,",.x###FF',
      'F###""",,"",,,,.........,,,,,,,""""###FF',
      'FF###.*.,",",,,,","""",",",",",*"*###FFF',
      'FFF###".".,,,o,",,,,",,,,,o,,."."###FFFF',
      'FFFF####"".",,,,,,",,,,,,",""""####FFFFF',
      'FFFFF####*""".,,L,,,,,"L"""*."####FFFFFF',
      'FFFFFFF#####*".".",,,,*..".#####FFFFFFFF',
      'FFFFFFFF#######""",P,,""#######FFFFFFFFF',
      'FFFFFFFFFFF#######DDDD######FFFFFFFFFFFF',
      'FFFFFFFFFFFFFFF###DDDD##FFFFFFFFFFFFFFFF',
      'FFFFFFFFFFFFFFFFF#DDDD#FFFFFFFFFFFFFFFFF',
      'FFFFFFFFFFFFFFFFF#DDDD#FFFFFFFFFFFFFFFFF',
    ],
    waves: [],
  },
};
