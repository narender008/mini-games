// Dev-only: a whole room's environment painted exactly as the game bakes it, on a plain canvas, so the
// look can be iterated without booting the game (served by `npm run dev` at /env.html, never built).
// Query: ?room=plaza (a hand-made room) or ?zone=aqueduct&seed=4 (a generated one), &d=3 (texels per
// unit), &x=..&y=..&w=..&h=.. (world rect to show), &lit=0 (raw albedo instead of the night look),
// &amb=7884ae (ambient colour).
import { ROOMS, parseRoom, type RoomDef, type Zone } from '../sim/level/rooms';
import { generateRoom } from '../sim/level/gen';
import { TILE } from '../config';
import { roomMap } from '../art/env/map';
import { planFloor, paintFloor } from '../art/env/floor';
import { foliageKit } from '../art/env/foliage';
import { planRow } from '../art/env/walls';
import { propArt } from '../art/env/props';
import { layer } from '../art/paint';

const q = new URLSearchParams(location.search);
const d = Number(q.get('d')) || 3, de = Math.max(1, d / 2);
let def: RoomDef;
if (q.get('zone')) def = generateRoom(Number(q.get('seed')) || 1, { zone: q.get('zone') as Zone, doors: 2, name: 'preview', id: 'preview' });
else def = ROOMS[q.get('room') || 'plaza'];
const room = parseRoom(def);
const zone = def.zone;
const seed = Number(q.get('seed')) || 5;
const t0 = performance.now();
const M = roomMap(room, seed);
const kit = foliageKit(zone, d, de);
const x0 = Number(q.get('x')) || 0, y0 = Number(q.get('y')) || 0;
const W = Number(q.get('w')) || M.W - x0, H = Number(q.get('h')) || M.H - y0;
const A = layer(W, H, d), E = layer(W, H, de);
A.g.translate(-x0, -y0); E.g.translate(-x0, -y0);
const plan = planFloor(M, zone, seed, kit, room.props);
paintFloor(plan, A.g, E.g, x0, y0, W, H);
// Tall rows and props, back to front by their base line.
const items: { y: number; draw: () => void }[] = [];
for (let ty = 0; ty < room.h; ty++) {
  const els = planRow(M, zone, ty, seed, kit);
  items.push({ y: (ty + 1) * TILE, draw: () => { for (const el of els) { A.g.save(); E.g.save(); el.draw(A.g, E.g); A.g.restore(); E.g.restore(); } } });
}
for (const p of room.props) {
  const art = propArt(p.kind, p.tw, p.th, zone, seed + p.id * 13);
  const footY = (p.ty + p.th) * TILE;
  items.push({ y: footY - 2, draw: () => {
    A.g.save(); E.g.save();
    A.g.translate(p.tx * TILE - art.ox, footY - art.oy); E.g.translate(p.tx * TILE - art.ox, footY - art.oy);
    art.paint(A.g, E.g);
    A.g.restore(); E.g.restore();
  } });
}
items.sort((a, b) => a.y - b.y);
for (const it of items) it.draw();
const ms = performance.now() - t0;
const out = document.createElement('canvas');
out.width = A.c.width; out.height = A.c.height;
const g = out.getContext('2d')!;
g.drawImage(A.c, 0, 0);
if (q.get('lit') !== '0') {
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = '#' + (q.get('amb') || '7884ae');
  g.fillRect(0, 0, out.width, out.height);
  g.globalCompositeOperation = 'lighter';
  g.drawImage(E.c, 0, 0, out.width, out.height);
}
document.body.style.margin = '0';
document.body.style.background = '#000';
document.body.appendChild(out);
const info = document.createElement('div');
info.textContent = `${def.id} ${zone} d=${d} ${Math.round(ms)} ms`;
info.style.cssText = 'position:fixed;left:4px;top:4px;color:#ccd;font:12px monospace;background:#0008;padding:2px 4px';
document.body.appendChild(info);
(window as unknown as { __ready: boolean }).__ready = true;
