// Foe painters registry. The renderer calls drawFoe(ctx, e, G, P) for every
// foe that is not a boss, with ctx translated to its foot point (e.x, e.y - e.z)
// at world scale, and reads foeLight(e) (also left on e.light) for its light.
// drawFoeFx / foeFxLights / drawFoeProjectile: see fx.js.
import hollow from './hollow.js';
import { animTick } from './kit.js';
import thornling from './thornling.js';
import knight from './knight.js';
import glassKnight from './glassKnight.js';
import needlecaster from './needlecaster.js';
import chorister from './chorister.js';
import snarl from './snarl.js';
import loomhulk from './loomhulk.js';
import bellowsBrute from './bellowsBrute.js';
import lanternWarden from './lanternWarden.js';
import forgeThrall from './forgeThrall.js';
import echo from './echo.js';
import unspooler from './unspooler.js';

export const PAINTERS = { hollow, thornling, knight, glassKnight, needlecaster, chorister, snarl, loomhulk, bellowsBrute, lanternWarden, forgeThrall, echo, unspooler };
export { drawFoeFx, foeFxLights, drawFoeProjectile, foeProjectileLight, FOE_PROJECTILES } from './fx.js';

// ---- pose sprite cache (engine perf pass) ----
// Painting a foe from paths costs ~1 ms on a CPU canvas (clipped rims and shades, tapered threads), so a
// room of 40 cost 40 ms. Each foe's look is instead keyed by what changes it (kind, palette, side/back,
// state and its progress, walk phase, a slow idle beat, flash/hurt, aim, armour, statuses, screen scale),
// painted once into a sprite and blitted. Spawning and dying foes are still painted live (their reveal
// and unravel are continuous). The walk cycle steps at 8 poses, the idle beat at 5 per second.
const TAU2 = Math.PI * 2;
const AIMS = new Set(['needlecaster', 'loomhulk']);   // painters that draw the aim angle
const UNTIMED = new Set(['move', 'idle', 'chase', 'stun']);   // states whose look ignores their progress (st / stDur)
const CACHE = new Map();
let CAP = 900, hits = 0, misses = 0, stale = 0, missFrame = -1, missN = 0;
const COARSE = new Map();   // kind|side|back|state -> the latest sprite (stand-in when the miss budget is spent)
const MISS_BUDGET = 4;      // fresh paints per frame; past it a close sprite stands in for a frame or two
const pool = [];
let scratch = null, sg = null;
// learned sprite bounds per kind|side|state|scale: the first LEARN paints of each are scanned (getImageData),
// later ones paint straight into a box that size plus PAD px; every RELEARN-th one is scanned again
const BOUNDS = new Map();
const LEARN = 4, RELEARN = 24, PAD = 6;
// Rim light (engine, playtest P1-17): dark foes vanished on dark floors. Each cached sprite gets a faint
// cool outline just outside its silhouette and a thin moonlit band along its top edges, baked once per
// sprite (no per-frame cost).
let rimT = null, rg = null;
function rimify(c, sc) {
  const w = c.width, h = c.height;
  if (w < 4 || h < 4) return;
  if (!rimT) { rimT = document.createElement('canvas'); rg = rimT.getContext('2d', { willReadFrequently: true }); }
  if (rimT.width < w || rimT.height < h) { rimT.width = Math.max(rimT.width, w); rimT.height = Math.max(rimT.height, h); }
  const d = Math.max(1, Math.round(1.4 * sc)), g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  // top band: the sprite minus itself moved down
  rg.setTransform(1, 0, 0, 1, 0, 0); rg.globalAlpha = 1; rg.globalCompositeOperation = 'source-over'; rg.clearRect(0, 0, w, h);
  rg.drawImage(c, 0, 0); rg.globalCompositeOperation = 'destination-out'; rg.drawImage(c, 0, d + 1);
  rg.globalCompositeOperation = 'source-in'; rg.fillStyle = '#cfdcff'; rg.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.32; g.drawImage(rimT, 0, 0, w, h, 0, 0, w, h);
  // outline: the sprite grown by d, minus itself
  rg.globalCompositeOperation = 'source-over'; rg.clearRect(0, 0, w, h);
  rg.drawImage(c, -d, 0); rg.drawImage(c, d, 0); rg.drawImage(c, 0, -d); rg.drawImage(c, 0, d);
  rg.globalCompositeOperation = 'destination-out'; rg.drawImage(c, 0, 0);
  rg.globalCompositeOperation = 'source-in'; rg.fillStyle = '#9fb4ff'; rg.fillRect(0, 0, w, h);
  rg.globalCompositeOperation = 'source-over';
  g.globalCompositeOperation = 'destination-over'; g.globalAlpha = 0.2; g.drawImage(rimT, 0, 0, w, h, 0, 0, w, h);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}
function sprite(bw, bh) {
  const c = pool.pop() || document.createElement('canvas');
  if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; } else { const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, bw, bh); }
  return c;
}
function q(v, n) { return Math.round(v * n); }
function keyOf(e, G, P, A) {
  const s = e.state, st = e.st || 0, dur = e.stDur || 1, k = Math.min(1, Math.max(0, st / dur));
  const walking = s === 'move' && (A.walk || 0) > 0.25;
  const ph = walking ? Math.floor((((A.ph || 0) % TAU2) + TAU2) % TAU2 / TAU2 * 8) : 0;
  // the idle beat only shows while standing; the walk cycle carries the bob while walking
  const beat = walking ? 0 : Math.floor((G ? G.t : 0) * 3 + ((e.seed || 0) % 3)) % 3;
  const side = Math.cos(e.facing) >= 0 ? 1 : 0;
  const back = s !== 'windup' && s !== 'active' && Math.sin(e.facing) < -0.55 ? 1 : 0;   // kit.begin ignores back then
  const fl = e.flash > 0 ? (e.flash > 0.05 ? 2 : 1) : 0;
  const hurt = q(Math.min(1, Math.max(0, (e.hurtT || 0) / 0.28)), 2);
  const aim = AIMS.has(e.art || e.kind) ? Math.round((((e.aim ?? e.facing) % TAU2) + TAU2) % TAU2 / TAU2 * 12) % 12 : 0;
  const arm = e.maxArmor > 0 ? (e.armor > 0 ? 1 + q(e.armor / e.maxArmor, 2) : 0) : 9;
  let stat = '';
  if (e.status) for (const n in e.status) { const v = e.status[n]; if (v && (v.t > 0 || v === true || v > 0)) stat += n[0] + n[1]; }
  const sc = Math.round(Math.min(P?.tier === 'low' ? 1 : 1.6, P?.scale || 1) * 8);
  return (e.art || e.kind) + (e.elite ? 'E' : '') + (e.region || G?.chamber?.region || '') + '|' + side + back + '|' + s + (UNTIMED.has(s) ? '' : q(k, 6)) + '|' + ph + (walking ? 'w' : '') + beat + '|' + fl + hurt + '|' + aim + '|' + arm + stat + '|' + q(e.z || 0, 0.125) + '|' + sc;
}
let MISSLOG = null;
export const spriteCacheStats = (log) => { if (log !== undefined) MISSLOG = log ? [] : null; return { size: CACHE.size, hits, misses, stale, log: MISSLOG && MISSLOG.slice() }; };

export function drawFoe(ctx, e, G, P) {
  const fn = PAINTERS[e.art] || PAINTERS[e.kind] || hollow;
  const s = e.state;
  if (e.hidden || e.gone || s === 'pending') return;
  if (P && P.noFoeCache || s === 'spawn' || s === 'dying' || e.spawning || e.dead) { fn(ctx, e, G, P); return; }
  const A = animTick(e, G);
  const key = keyOf(e, G, P, A);
  let c = CACHE.get(key);
  const W = Math.max(220, (e.r || 22) * 7), H = (e.height || 80) * 2 + 110, ax = W / 2, ay = H - 60;
  const fr = G ? G.t : 0;
  if (fr !== missFrame) { missFrame = fr; missN = 0; }
  const ck = (e.art || e.kind) + (e.elite ? 'E' : '') + '|' + (Math.cos(e.facing) >= 0 ? 1 : 0) + (Math.sin(e.facing) < -0.55 ? 1 : 0) + s;
  if (c && c.__W === W && c.__H === H) { CACHE.delete(key); CACHE.set(key, c); hits++; }
  else if (missN >= MISS_BUDGET && COARSE.get(ck) && COARSE.get(ck).__W === W) { c = COARSE.get(ck); stale++; }
  else {
    missN++;
    misses++;
    if (MISSLOG) MISSLOG.push(key);
    const sc = Math.min(P?.tier === 'low' ? 1 : 1.6, P?.scale || 1);
    const cw = Math.ceil(W * sc), ch = Math.ceil(H * sc);
    const bk = ck + '|' + Math.round(sc * 8) + '|' + (e.z > 1 ? 1 : 0);
    let L = BOUNDS.get(bk);
    if (!L || L.n < LEARN || (++L.m % RELEARN) === 0) {
      // learn the bounds: paint into a shared scratch, scan its alpha (every 2 px), copy just that box
      if (!scratch) { scratch = document.createElement('canvas'); sg = scratch.getContext('2d', { willReadFrequently: true }); }
      if (scratch.width < cw || scratch.height < ch) { scratch.width = Math.max(scratch.width, cw); scratch.height = Math.max(scratch.height, ch); }
      const g = sg;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, cw, ch);
      g.setTransform(sc, 0, 0, sc, ax * sc, ay * sc);
      fn(g, e, G, P);
      g.setTransform(1, 0, 0, 1, 0, 0);
      // tight bounds: blitting the empty margin of a sprite costs as much as its body on a CPU canvas
      const d = g.getImageData(0, 0, cw, ch).data, sw = cw * 4;
      let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
      for (let y = 0; y < ch; y += 2) { const row = y * sw; for (let x = 0; x < cw; x += 2) if (d[row + x * 4 + 3] > 6) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
      if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 1; }
      x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(cw, x1 + 3); y1 = Math.min(ch, y1 + 3);
      if (!L) BOUNDS.set(bk, L = { x0, y0, x1, y1, n: 0, m: 0 });
      else { L.x0 = Math.min(L.x0, x0); L.y0 = Math.min(L.y0, y0); L.x1 = Math.max(L.x1, x1); L.y1 = Math.max(L.y1, y1); }
      L.n++;
      const bw = x1 - x0, bh = y1 - y0;
      c = sprite(bw, bh);
      c.getContext('2d').drawImage(scratch, x0, y0, bw, bh, 0, 0, bw, bh);
      c.__b = [x0, y0, bw, bh, sc];
    } else {
      // bounds known for this kind, side and state: paint straight into a sprite that size (a little
      // padding), no read-back
      const x0 = Math.max(0, L.x0 - PAD), y0 = Math.max(0, L.y0 - PAD), bw = Math.min(cw, L.x1 + PAD) - x0, bh = Math.min(ch, L.y1 + PAD) - y0;
      c = sprite(bw, bh);
      const g = c.getContext('2d');
      g.setTransform(sc, 0, 0, sc, ax * sc - x0, ay * sc - y0);
      fn(g, e, G, P);
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      c.__b = [x0, y0, bw, bh, sc];
    }
    if (!(P && P.noFoeRim)) rimify(c, sc);
    c.__W = W; c.__H = H;
    CACHE.set(key, c); COARSE.set(ck, c);
    while (CACHE.size > CAP) { const k0 = CACHE.keys().next().value; const old = CACHE.get(k0); CACHE.delete(k0); if (pool.length < 32) pool.push(old); }
  }
  const b = c.__b;
  ctx.drawImage(c, b[0] / b[4] - ax, b[1] / b[4] - ay, b[2] / b[4], b[3] / b[4]);
}
export function foeLight(e) {
  const l = e.light;
  if (!l || e.hidden || e.gone) return null;
  return l;
}
