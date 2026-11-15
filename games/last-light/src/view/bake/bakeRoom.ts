// Paints a room's whole environment into images: floor chunks (each at most 2048 texels square), one
// cropped strip per tile row chunk for the tall layer, and one image per prop, each with an emissive twin
// when it has any glow. Pure canvas work with no Phaser or DOM, so it runs in the bake worker
// (OffscreenCanvas, results transferred as ImageBitmaps) or, as a fallback, on the main thread.
import { TILE } from '../../config';
import { parseRoom, ROOMS, type RoomDef } from '../../sim/level/rooms';
import { layer, makeCanvas, type Ctx } from '../../art/paint';
import { roomMap } from '../../art/env/map';
import { planFloor, paintFloor } from '../../art/env/floor';
import { foliageKit } from '../../art/env/foliage';
import { planRow } from '../../art/env/walls';
import { propArt } from '../../art/env/props';

export type ImageSrc = HTMLCanvasElement | ImageBitmap;

export interface BakedImage {
  /** World position of the top-left corner and texels per world unit. */
  x: number; y: number; d: number;
  kind: 'floor' | 'row' | 'prop';
  /** Depth-sort line (world y) for rows and props. */
  sortY: number;
  emissive: boolean;
  propId?: number;
  src: ImageSrc;
}

export interface BakedLight { propId: number; kind: string; x: number; y: number; r: number; color: number; i: number }

export interface BakedRoom { key: string; images: BakedImage[]; lights: BakedLight[]; ms: number }

/** A stable seed for a room's art: the same room in the same run always looks the same, and the
 *  hand-made rooms (sanctum, plaza, heart) look the same in every run, so the title's sanctum is reused. */
export function envSeed(def: RoomDef, runSeed: number) {
  const handMade = ROOMS[def.id]?.map === def.map;
  let h = 2166136261 ^ (handMade ? 0 : runSeed);
  const s = def.id + def.zone + def.map.join('');
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 1000003;
}

export const bakeKey = (def: RoomDef, seed: number, d: number) => `${def.id}/${def.zone}/${seed}/${d}/${def.map.length}x${def.map[0].length}`;

/** Whether a canvas has anything painted on it (checked on a tiny copy). */
function hasInk(c: HTMLCanvasElement) {
  const t = makeCanvas(24, 24), g = t.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  g.drawImage(c, 0, 0, 24, 24);
  const px = g.getImageData(0, 0, 24, 24).data;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 1) return true;
  return false;
}

export function bakeRoom(def: RoomDef, seed: number, d: number, de: number, finish: (c: HTMLCanvasElement) => ImageSrc = (c) => c): BakedRoom {
  const t0 = performance.now();
  const room = parseRoom(def);
  const zone = def.zone;
  const M = roomMap(room, seed);
  const kit = foliageKit(zone, d, de);
  const images: BakedImage[] = [];
  const lights: BakedLight[] = [];
  const push = (c: HTMLCanvasElement, im: Omit<BakedImage, 'src'>) => images.push({ ...im, src: finish(c) });

  // Floor.
  const plan = planFloor(M, zone, seed, kit, room.props);
  const CH = Math.floor(2048 / d);
  for (let y0 = 0; y0 < M.H; y0 += CH) for (let x0 = 0; x0 < M.W; x0 += CH) {
    const w = Math.min(CH, M.W - x0), h = Math.min(CH, M.H - y0);
    const A = layer(w, h, d), E = layer(w, h, de);
    A.g.translate(-x0, -y0); E.g.translate(-x0, -y0);
    paintFloor(plan, A.g, E.g, x0, y0, w, h);
    push(A.c, { x: x0, y: y0, d, kind: 'floor', sortY: 0, emissive: false });
    if (hasInk(E.c)) push(E.c, { x: x0, y: y0, d: de, kind: 'floor', sortY: 0, emissive: true });
  }

  // Tall rows, each split into chunks cropped to what they hold.
  const STRIP = 256;
  for (let ty = 0; ty < room.h; ty++) {
    const els = planRow(M, zone, ty, seed, kit);
    if (!els.length) continue;
    const baseY = (ty + 1) * TILE;
    for (let cx0 = 0; cx0 < M.W; cx0 += STRIP) {
      const cx1 = Math.min(M.W, cx0 + STRIP);
      const hit = els.filter((el) => el.x1 > cx0 && el.x0 < cx1);
      if (!hit.length) continue;
      const bx0 = Math.max(cx0, Math.floor(Math.min(...hit.map((el) => el.x0)))), bx1 = Math.min(cx1, Math.ceil(Math.max(...hit.map((el) => el.x1))));
      const by0 = Math.floor(Math.min(...hit.map((el) => el.y0))), by1 = Math.ceil(Math.max(...hit.map((el) => el.y1)));
      if (bx1 <= bx0 || by1 <= by0) continue;
      const w = bx1 - bx0, h = by1 - by0;
      const A = layer(w, h, d), E = layer(w, h, de);
      A.g.translate(-bx0, -by0); E.g.translate(-bx0, -by0);
      const paintAll = (g: Ctx, e: Ctx) => { for (const el of hit) { g.save(); e.save(); el.draw(g, e); g.restore(); e.restore(); } };
      paintAll(A.g, E.g);
      push(A.c, { x: bx0, y: by0, d, kind: 'row', sortY: baseY, emissive: false });
      if (hasInk(E.c)) push(E.c, { x: bx0, y: by0, d: de, kind: 'row', sortY: baseY, emissive: true });
    }
  }

  // Props.
  for (const p of room.props) {
    const art = propArt(p.kind, p.tw, p.th, zone, seed + p.id * 13);
    const footY = (p.ty + p.th) * TILE;
    const x = p.tx * TILE - art.ox, y = footY - art.oy;
    const A = layer(art.w, art.h, d), E = layer(art.w, art.h, de);
    art.paint(A.g, E.g);
    push(A.c, { x, y, d, kind: 'prop', sortY: footY - 2, emissive: false, propId: p.id });
    if (hasInk(E.c)) push(E.c, { x, y, d: de, kind: 'prop', sortY: footY - 2, emissive: true, propId: p.id });
    if (art.light) lights.push({ propId: p.id, kind: p.kind, x: x + art.light.x, y: y + art.light.y, r: art.light.r, color: art.light.color, i: art.light.i });
  }
  return { key: bakeKey(def, seed, d), images, lights, ms: performance.now() - t0 };
}
