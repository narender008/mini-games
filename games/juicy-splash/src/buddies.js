// The animal friends on the picnic: a bunny who peeks out of her bush and
// munches the slices she is thrown, and a chick on the blanket who catches
// juice drops in his beak. They react to everything (giant fruit, treats,
// the party) and giggle when tapped. View-only state: nothing here touches
// the rules in sim.js. main.js calls layout(), step(), the reaction
// functions and the two draw passes.
import { ctx, TAU, lerp, clamp, sticker, rng } from './draw.js';
import { bunny, chick, bush, candy, lolly } from './friends.js';

const R = rng(4242), rnd = (a, b) => a + R() * (b - a);
export const TREAT_COL = { candy: '#ff4f9a', lolly: '#ffd23a' };

export function createBuddies() {
  return {
    t: 0, dance: false,
    bunny: { x: 0, base: 0, s: 1, up: 0.5, upT: 0.5, mood: 'happy', moodT: 0, munch: 0, hop: 0, look: 0, waiting: 0, next: 2.5 },
    chick: { x: 0, y: 0, s: 1, mood: 'happy', moodT: 0, hop: 0, flap: 0, look: 0, waiting: 0, next: 3.5 },
    flyers: [], hearts: [],
  };
}

export function layout(B, L) {
  const { W, H, u, BT, portrait } = L;
  Object.assign(B.bunny, portrait ? { x: W * 0.56, base: BT + 18 * u, s: 74 * u } : { x: W * 0.25, base: BT + 20 * u, s: 84 * u });
  Object.assign(B.chick, portrait ? { x: W * 0.45, y: H - 74 * u, s: 50 * u } : { x: W * 0.7, y: H - 82 * u, s: 60 * u });
}

const bunnyHead = b => ({ x: b.x, y: b.base - b.s * (0.55 + b.up * 1.05) - b.hop * b.s * 0.5 });
const chickBody = c => ({ x: c.x, y: c.y - c.hop * c.s * 0.8 });
export function mouths(B) {
  const h = bunnyHead(B.bunny), c = chickBody(B.chick);
  return { bunny: { x: h.x, y: h.y + B.bunny.s * 0.3 }, chick: { x: c.x, y: c.y + B.chick.s * 0.15 } };
}

function hearts(B, x, y, n, s) { for (let i = 0; i < n; i++) B.hearts.push({ x: x + rnd(-s, s) * 0.6, y, vx: rnd(-30, 30), vy: rnd(-120, -70), r: rnd(0.16, 0.26) * s, kind: R() < 0.7 ? 'heart' : 'star', t: 0, life: rnd(1, 1.5), rot: rnd(-0.4, 0.4) }); }
function mood(o, m, t) { o.mood = m; o.moodT = t; }

// Throw something to a friend: a fruit half or a treat to the bunny, juice
// drops to the chick. It flies on an arc and lands in the mouth.
export function feedBunny(B, x, y, item) {
  const b = B.bunny; b.upT = 1; b.waiting = 0.9; mood(b, 'wow', 0.9);
  B.flyers.push({ to: 'bunny', item, x0: x, y0: y, t: 0, dur: 0.8, spin: rnd(4, 8) * (R() < 0.5 ? -1 : 1) });
}
export function feedChick(B, x, y, col) {
  const c = B.chick; c.waiting = 0.8; mood(c, 'open', 0.8);
  for (let i = 0; i < 5; i++) B.flyers.push({ to: 'chick', item: { type: 'drop', col }, x0: x + rnd(-10, 10), y0: y + rnd(-10, 10), t: -i * 0.06, dur: 0.7, r: rnd(0.08, 0.14) });
}
export function poke(B, who) {
  const o = B[who]; o.hop = 1; mood(o, 'cheer', 0.9);
  if (who === 'bunny') { o.upT = 1; o.up = Math.max(o.up, 0.8); }
  else o.flap = 1;
  const p = who === 'bunny' ? bunnyHead(o) : chickBody(o);
  hearts(B, p.x, p.y - o.s * 0.6, 3, o.s);
}
export function cheer(B, t = 1.4) { for (const w of ['bunny', 'chick']) { const o = B[w]; mood(o, 'cheer', t); o.hop = 1; } B.bunny.upT = 1; B.chick.flap = 1; }
export function wow(B) { mood(B.bunny, 'wow', 1.4); mood(B.chick, 'open', 1.4); B.bunny.upT = 1; }
export function hit(B, x, y) {
  const b = B.bunny, h = bunnyHead(b);
  if (b.up > 0.25 && Math.hypot(x - h.x, y - h.y) < b.s * 0.95) return 'bunny';
  const c = chickBody(B.chick);
  if (Math.hypot(x - c.x, y - c.y) < B.chick.s * 1.15) return 'chick';
  return null;
}

// Advance; returns what landed this step ({ to, item }) so main can play the
// munch and chirp sounds.
export function step(B, dt, lookX) {
  B.t += dt;
  const b = B.bunny, c = B.chick, arrived = [];
  for (const f of B.flyers) f.t += dt;
  for (const f of B.flyers.filter(f => f.t >= f.dur)) {
    const o = B[f.to];
    if (f.to === 'bunny') { o.munch = 1.6; o.snack = f.item; o.waiting = 0; hearts(B, bunnyHead(o).x, bunnyHead(o).y - o.s * 0.5, f.item.type === 'half' ? 2 : 4, o.s); }
    else if (!arrived.some(a => a.to === 'chick')) { o.waiting = 0; mood(o, 'cheer', 0.8); o.hop = 1; o.flap = 1; hearts(B, o.x, o.y - o.s, 2, o.s); }
    arrived.push({ to: f.to, item: f.item });
  }
  B.flyers = B.flyers.filter(f => f.t < f.dur);
  for (const h of B.hearts) { h.t += dt; h.x += h.vx * dt; h.y += h.vy * dt; h.vy *= 1 - dt; }
  B.hearts = B.hearts.filter(h => h.t < h.life);

  // bunny: peeks in and out of the bush, looks at the fruit, munches
  b.moodT -= dt; b.munch = Math.max(0, b.munch - dt); b.waiting = Math.max(0, b.waiting - dt);
  b.next -= dt;
  if (b.next <= 0 && !b.munch && !b.waiting) { b.upT = b.upT > 0.6 ? rnd(0.25, 0.45) : 1; b.next = rnd(2.5, 5); }
  if (B.dance) b.upT = 1;
  b.up += (b.upT - b.up) * Math.min(1, dt * 6);
  b.hop = Math.max(0, b.hop - dt * 2.5);
  b.look += (clamp(((lookX ?? b.x) - b.x) / (b.s * 4), -1, 1) - b.look) * Math.min(1, dt * 4);
  if (b.munch > 0) b.mood = Math.floor(b.munch * 9) % 2 ? 'munch' : 'chew';
  else if (B.dance) b.mood = 'cheer';
  else if (b.moodT <= 0) b.mood = 'happy';

  // chick: little hops and flaps now and then
  c.moodT -= dt; c.waiting = Math.max(0, c.waiting - dt); c.next -= dt;
  if (c.next <= 0) { c.hop = 0.6; c.flap = 0.6; c.next = rnd(3, 6); }
  c.hop = Math.max(0, c.hop - dt * 2.5); c.flap = Math.max(0, c.flap - dt * 2);
  c.look += (clamp(((lookX ?? c.x) - c.x) / (c.s * 4), -1, 1) - c.look) * Math.min(1, dt * 4);
  if (B.dance) c.mood = 'cheer'; else if (c.moodT <= 0) c.mood = 'happy';
  return arrived;
}

const bounce = k => Math.sin(Math.min(1, k) * Math.PI);
export function drawBunny(B) {
  const b = B.bunny, h = bunnyHead(b), t = B.t;
  const sq = b.munch > 0 ? Math.sin(t * 28) * 0.04 : 0;
  const d = B.dance ? Math.sin(t * 7) : 0;
  const hop = B.dance ? Math.abs(Math.sin(t * 7)) * 0.35 : bounce(1 - b.hop) * b.hop;
  bunny(h.x, h.y - hop * b.s * 0.4, b.s, b.mood, { noBody: true, look: b.look, rot: d * 0.15 + b.look * 0.06, ear: Math.sin(t * 2.3) * 0.08 + d * 0.15, sx: 1 + sq, sy: 1 - sq, pawY: b.munch > 0 ? 0.45 : 0.62, pawX: b.munch > 0 ? 0.2 : 0.3,
    hold: b.munch > 0 && b.snack ? () => {
      // the snack gets smaller with every bite
      const k = 0.45 + 0.55 * Math.min(1, b.munch / 1.6), it = b.snack;
      if (it.type === 'half' && B.drawHalf) B.drawHalf(it.kind, 0, b.s * 0.5, b.s * 0.42 * k, Math.PI);
      else if (it.type !== 'half') drawTreat(it.kind, 0, b.s * 0.5, b.s * 0.36 * k, 0.3);
    } : null });
  bush(b.x, b.base, b.s * 0.85, 4);
}
export function drawChick(B) {
  const c = B.chick, p = chickBody(c), t = B.t;
  const d = B.dance ? Math.sin(t * 7 + 1) : 0;
  const hop = B.dance ? Math.abs(Math.sin(t * 7 + 1)) * 0.4 : bounce(1 - c.hop) * c.hop * 0.6;
  const g = ctx; g.save(); g.fillStyle = 'rgba(60,10,10,0.22)'; g.beginPath(); g.ellipse(c.x, c.y + c.s * 0.95, c.s * (0.8 - hop * 0.3), c.s * 0.16, 0, 0, TAU); g.fill(); g.restore();
  const sq = (1 - hop) * 0.05;
  chick(p.x, c.y - hop * c.s * 0.9, c.s, c.mood, { rot: d * 0.18 + c.look * 0.08, flap: c.flap > 0.3 || (B.dance && Math.sin(t * 14) > 0), sx: 1 + sq, sy: 1 - sq });
}
// Things in flight to the friends, and the hearts they give back.
export function drawFront(B) {
  const m = mouths(B), g = ctx, drawHalf = B.drawHalf;
  for (const f of B.flyers) {
    if (f.t < 0) continue;
    const k = f.t / f.dur, to = m[f.to], s = B[f.to].s;
    const x = lerp(f.x0, to.x, k), y = lerp(f.y0, to.y, k) - Math.sin(k * Math.PI) * s * 2.2;
    const sc = lerp(1, 0.55, k);
    if (f.item.type === 'half') drawHalf(f.item.kind, x, y, s * 0.55 * sc, f.t * f.spin);
    else if (f.item.type === 'drop') { const r = s * f.r * 1.6; g.fillStyle = f.item.col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU); g.fill(); }
    else drawTreat(f.item.kind, x, y, s * 0.42 * sc, f.t * f.spin * 0.5);
  }
  for (const h of B.hearts) { const k = h.t / h.life; g.save(); g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; sticker(h.kind, h.x, h.y, h.r * (k < 0.15 ? k / 0.15 : 1), h.rot); g.restore(); }
}
export function drawTreat(kind, x, y, r, rot = 0) { if (kind === 'lolly') lolly(x, y - r * 0.4, r * 0.85, rot); else candy(x, y, r * 0.7, TREAT_COL.candy, rot); }
