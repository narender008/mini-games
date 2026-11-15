// Dev-only contact sheets of every character set, painted exactly as the game paints them (served by
// `npm run dev` at /art.html, never built). Query: ?only=keeper,stalker (sets to show), &d=6 (texels per
// world unit for the sheets), &lit=0 (skip the in-game look rows).
// For each set: a lineup row at game look (navy floor, dim multiply light like the game's ambient, then
// the emissive layer added on top) and one row per animation showing the raw painted body.
import { drawKeeper, KEEPER_ANIMS, KEEPER_FOOT_Y, KEEPER_W, KEEPER_H, type Dir, type KeeperAnim } from '../art/keeper';
import { stalkerSprites, sentinelSprites, beetleSprites, wardenSprites, colossusSprites, dummySprites } from '../art/enemies';
import { bossSprites, bossThornSprites, bossWallSprites } from '../art/boss';
import { layer, makeCanvas } from '../art/paint';
import type { Painter, SpriteSet } from '../art/sprite';

const q = new URLSearchParams(location.search);
const D = Number(q.get('d')) || 6;
const only = q.get('only')?.split(',') ?? null;
const showLit = q.get('lit') !== '0';
document.body.style.background = '#10131d';
document.body.style.color = '#ccd';
document.body.style.font = '13px monospace';
document.body.style.margin = '8px';

type AnySet = { w: number; h: number; footY: number; anims: Record<string, unknown[]> };
function painter(f: unknown, w: number, h: number): Painter {
  if (typeof f === 'function') return f as Painter;
  const pix = f as { w: number; h: number; drawTo(g: CanvasRenderingContext2D, x: number, y: number, s?: number): void };
  const c = makeCanvas(pix.w, pix.h);
  pix.drawTo(c.getContext('2d')!, 0, 0, 1);
  return (g) => { g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, w, h); };
}
function norm(s: AnySet): SpriteSet {
  const anims: Record<string, Painter[]> = {};
  for (const [k, v] of Object.entries(s.anims)) anims[k] = v.map((f) => painter(f, s.w, s.h));
  return { w: s.w, h: s.h, footY: s.footY, anims };
}

/** Paint one frame: returns body and emissive canvases at density d. */
function paintFrame(p: Painter, w: number, h: number, d: number) {
  const a = layer(w, h, d), e = layer(w, h, d);
  p(a.g, e.g);
  return { body: a.c, emit: e.c };
}

const AMBIENT = 'rgb(108,124,172)';
function floor(g: CanvasRenderingContext2D, w: number, h: number, d: number) {
  g.fillStyle = '#1a1f2c'; g.fillRect(0, 0, w, h);
  const s = 15 * d;
  for (let y = 0; y < h; y += s) for (let x = -s; x < w; x += s) {
    const off = (Math.floor(y / s) % 2) * s * 0.5;
    g.fillStyle = (Math.floor(x / s) + Math.floor(y / s)) % 3 ? '#7d8597' : '#737b8e';
    g.beginPath(); g.roundRect(x + off + 0.6 * d, y + 0.6 * d, s - 1.2 * d, s - 1.2 * d, 2 * d); g.fill();
  }
}

function title(t: string) { const h = document.createElement('div'); h.textContent = t; h.style.margin = '14px 0 4px'; document.body.appendChild(h); }

function sheet(name: string, set: SpriteSet) {
  title(`${name}  ${set.w}x${set.h} units, feet at ${set.footY}  (sheet at ${D} texels/unit)`);
  const rows = Object.entries(set.anims);
  const cols = Math.max(...rows.map(([, v]) => v.length));
  const fw = (set.w + 2) * D, fh = (set.h + 2) * D;
  const c = makeCanvas(cols * fw + 110, (rows.length + (showLit ? 1 : 0)) * fh);
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a4256'; g.fillRect(0, 0, c.width, c.height);
  let row = 0;
  if (showLit) {
    // In-game look: floor x ambient, then each frame body x ambient, then emissive added.
    const lit = makeCanvas(c.width, fh), lg = lit.getContext('2d')!;
    floor(lg, lit.width, lit.height, D);
    const frames = rows.map(([, v]) => v[0]);
    const painted = frames.map((p) => paintFrame(p, set.w, set.h, D));
    painted.forEach((f, i) => lg.drawImage(f.body, 110 + i * fw + D, D));
    lg.globalCompositeOperation = 'multiply'; lg.fillStyle = AMBIENT; lg.fillRect(0, 0, lit.width, lit.height);
    lg.globalCompositeOperation = 'lighter';
    painted.forEach((f, i) => lg.drawImage(f.emit, 110 + i * fw + D, D));
    lg.globalCompositeOperation = 'source-over';
    g.drawImage(lit, 0, 0);
    g.fillStyle = '#ccd'; g.fillText('game look', 4, 14);
    g.fillText('(first frame', 4, 30); g.fillText(' of each anim)', 4, 44);
    row++;
  }
  for (const [k, list] of rows) {
    g.fillStyle = '#ccd'; g.fillText(k, 4, row * fh + 14);
    list.forEach((p, i) => {
      const f = paintFrame(p, set.w, set.h, D);
      const x = 110 + i * fw + D, y = row * fh + D;
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.strokeRect(x, y, set.w * D, set.h * D);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y + set.footY * D, set.w * D, 1);
      g.drawImage(f.body, x, y);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6; g.drawImage(f.emit, x, y); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    });
    row++;
  }
  document.body.appendChild(c);
}

function keeperSet(): SpriteSet {
  const anims: Record<string, Painter[]> = {};
  for (const dir of ['down', 'side', 'up'] as Dir[]) {
    for (const anim of Object.keys(KEEPER_ANIMS) as KeeperAnim[]) {
      if (anim === 'dead' && dir !== 'down') continue;
      anims[`${dir} ${anim}`] = Array.from({ length: KEEPER_ANIMS[anim] }, (_, f) => drawKeeper(dir, anim, f).paint);
    }
  }
  return { w: KEEPER_W, h: KEEPER_H, footY: KEEPER_FOOT_Y, anims };
}

const all: Record<string, () => AnySet> = {
  keeper: keeperSet,
  stalker: () => stalkerSprites(), stalkerElite: () => stalkerSprites(true), sentinel: () => sentinelSprites(), charger: () => beetleSprites(),
  warden: () => wardenSprites(), colossus: () => colossusSprites(), colossusElite: () => colossusSprites(true), dummy: () => dummySprites(),
  boss: () => bossSprites(), bossWall: () => bossWallSprites(), bossThorn: () => bossThornSprites(),
};
for (const [name, make] of Object.entries(all)) {
  if (only && !only.includes(name)) continue;
  sheet(name, norm(make()));
}
(window as unknown as { __ready: boolean }).__ready = true;
