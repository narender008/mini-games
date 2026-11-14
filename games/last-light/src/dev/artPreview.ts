import { stalkerSprites, sentinelSprites, beetleSprites, wardenSprites, colossusSprites, dummySprites, type SpriteSet } from '../art/enemies';
// Dev-only contact sheets of the generated art (served by `npm run dev` at /art.html, never built).
// The first sheet is a lineup at the in-game scale on navy stone under a dim multiply, to judge size
// and readability; the rest show every frame of every animation.
import { drawKeeper, KEEPER_ANIMS, KEEPER_FOOT_Y, KEEPER_W, KEEPER_H, type Dir, type KeeperAnim } from '../art/keeper';
import { makeCanvas, type Pix } from '../art/pix';

const S = 4;
const dim = new URLSearchParams(location.search).has('dim');
document.body.style.background = '#10131d';
document.body.style.color = '#ccd';
document.body.style.font = '12px monospace';

function sheet(title: string, rows: { label: string; frames: Pix[] }[], bg = '#3a4256') {
  const h = document.createElement('div');
  h.textContent = title;
  document.body.appendChild(h);
  const fw = Math.max(...rows.flatMap((r) => r.frames.map((f) => f.w)));
  const fh = Math.max(...rows.flatMap((r) => r.frames.map((f) => f.h)));
  const cols = Math.max(...rows.map((r) => r.frames.length));
  const c = makeCanvas((cols * (fw + 2) + 16) * S, rows.length * (fh + 2) * S);
  const g = c.getContext('2d')!;
  g.fillStyle = dim ? '#2a3150' : bg;
  g.fillRect(0, 0, c.width, c.height);
  rows.forEach((r, j) => {
    g.fillStyle = '#ccd';
    g.fillText(r.label, 2, j * (fh + 2) * S + 12);
    r.frames.forEach((f, i) => put(g, f, (16 + i * (fw + 2)) * S, j * (fh + 2) * S + 8, S));
  });
  if (dim) multiply(g, c.width, c.height);
  document.body.appendChild(c);
}

/** Draw a Pix over what is already on the canvas (Pix.drawTo uses putImageData, which replaces). */
function put(g: CanvasRenderingContext2D, pix: Pix, x: number, y: number, s: number) {
  const t = makeCanvas(pix.w * s, pix.h * s);
  pix.drawTo(t.getContext('2d')!, 0, 0, s);
  g.drawImage(t, x, y);
}

function multiply(g: CanvasRenderingContext2D, w: number, h: number) {
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = 'rgb(150,160,200)';
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
}

const sets: Record<string, SpriteSet> = {
  stalker: stalkerSprites(), stalkerElite: stalkerSprites(true), sentinel: sentinelSprites(), beetle: beetleSprites(),
  warden: wardenSprites(), colossus: colossusSprites(), colossusElite: colossusSprites(true), dummy: dummySprites(),
};

// Lineup at about the in-game screen scale (≈2.65 screen px per art px; 3 here), feet on one line.
{
  const L = 3;
  const list: { pix: Pix; footY: number }[] = [
    { pix: drawKeeper('down', 'idle', 0).pix, footY: KEEPER_FOOT_Y },
    { pix: drawKeeper('side', 'atk1', 0).pix, footY: KEEPER_FOOT_Y },
    ...Object.values(sets).map((s) => ({ pix: s.anims.idle[0], footY: s.footY })),
    { pix: sets.stalker.anims.windup[1], footY: sets.stalker.footY },
    { pix: sets.sentinel.anims.windup[1], footY: sets.sentinel.footY },
    { pix: sets.colossus.anims.windup[1], footY: sets.colossus.footY },
  ];
  const base = Math.max(...list.map((e) => e.footY)) + 4;
  const wsum = list.reduce((a, e) => a + e.pix.w + 4, 8);
  const c = makeCanvas(wsum * L, (base + 8) * L);
  const g = c.getContext('2d')!;
  // Navy flagstones like the game floor.
  for (let y = 0; y < c.height; y += 16 * L) for (let x = 0; x < c.width; x += 16 * L) {
    g.fillStyle = ((x / (16 * L) + y / (16 * L)) % 2) ? '#3a4466' : '#343d5d';
    g.fillRect(x + (y / (16 * L) % 2 ? 8 * L : 0), y, 15 * L, 15 * L);
  }
  let x = 8;
  for (const e of list) { put(g, e.pix, x * L, (base - e.footY) * L, L); x += e.pix.w + 4; }
  multiply(g, c.width, c.height);
  const h = document.createElement('div');
  h.textContent = 'lineup (game scale, dim)';
  document.body.appendChild(h);
  document.body.appendChild(c);
}

const rows: { label: string; frames: Pix[] }[] = [];
for (const dir of ['down', 'side', 'up'] as Dir[]) {
  for (const anim of Object.keys(KEEPER_ANIMS) as KeeperAnim[]) {
    if (anim === 'dead' && dir !== 'down') continue;
    const frames = [];
    for (let f = 0; f < KEEPER_ANIMS[anim]; f++) frames.push(drawKeeper(dir, anim, f).pix);
    rows.push({ label: `${dir} ${anim}`, frames });
  }
}
// Keeper rows side by side in two columns would need a custom layout; one sheet is clear enough.
sheet(`keeper ${KEEPER_W}x${KEEPER_H}`, rows);
for (const [name, set] of Object.entries(sets)) {
  sheet(`${name} ${set.w}x${set.h} foot ${set.footY}`, Object.entries(set.anims).map(([k, v]) => ({ label: k, frames: v })));
}
(window as unknown as { __ready: boolean }).__ready = true;
