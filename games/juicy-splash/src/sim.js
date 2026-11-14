// The rules of Juicy Splash, with no canvas, DOM or audio, so they run in
// Node for the tests. Positions are CSS pixels. Nothing here can be lost:
// a fruit that is not sliced just falls back down and another one comes.
//
// Phases: 'title' (fruit drift up slowly behind the logo; the first touch
// starts play), 'play', 'party' (the jar is full: celebration), then the jar
// is drunk ('drain') and play goes on. The renderer reads the state and the
// events list (cut, launch, stripe, party, drink, tap, firework, start,
// thump, giant, burst, bubble, bubblePop).
//
// Surprises on top of the plain fruit:
// - a giant fruit now and then floats up to the middle and stays there; it
//   takes GIANT_HP hits (squash, crack) and then bursts into a shower of
//   small fruit to slice and treats for the animal friends.
// - bubbles drift slowly down from the sky carrying a fruit or a treat. A tap
//   or swipe pops one: a fruit tumbles out to be sliced, a treat goes to the
//   friends. A bubble nobody pops pops by itself above the blanket.
import { KIND_LIST, KIND_SIZE } from './kinds.js';

export const JAR_CAP = 10;          // stripes in a full jar
export const JAR_DELAY = 0.7;       // seconds for juice to fly into the jar
export const PARTY_TIME = 7;        // seconds of celebration
export const DRAIN_TIME = 1.4;      // seconds to drink the smoothie
export const HINT_AFTER = 6;        // seconds without a touch before the hint hand
export const SPARKLE_EVERY = 9;     // every ninth fruit glitters and fills two stripes
export const GIANT_FIRST = 8;       // slices before the first giant fruit
export const GIANT_EVERY = 16;      // slices between giants
export const GIANT_HP = 3;          // hits to burst a giant
export const GIANT_SCALE = 2.3;     // giant radius in fruit radii
export const GIANT_LIFE = 16;       // seconds a giant waits before it floats away
export const GIANT_MINIS = 5;       // small fruit in a giant's shower
export const BUBBLE_FIRST = 7;      // seconds of play before the first bubble
export const TREATS = ['candy', 'lolly'];

export function rng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function createSim({ seed = 1, w = 1280, h = 720, r = 80, phase = 'title', kinds = KIND_LIST, force = null } = {}) {
  const s = {
    t: 0, phase, w, h, r, g: h * 0.42, rand: rng(seed), kinds, force,
    fruits: [], halves: [], events: [], pending: [], stripes: [],
    nextSpawn: phase === 'title' ? 0.8 : 0.5, launched: 0, sliced: 0, rounds: 0,
    partyT: 0, drainT: 0, idle: 0, bag: [], nextId: 1, frozen: false, noSpawn: false,
    bubbles: [], nextBubble: BUBBLE_FIRST, nextGiant: GIANT_FIRST, giants: 0, popped: 0, playT: 0,
  };
  return s;
}

export function resize(s, w, h, r) {
  const k = w / s.w, kh = h / s.h;
  for (const f of [...s.fruits, ...s.halves]) { f.x *= k; f.y *= kh; f.vx *= k; f.vy *= kh; if (f.homeY != null) f.homeY *= kh; }
  for (const b of s.bubbles) { b.x *= k; b.y *= kh; b.vy *= kh; b.r = r * 1.3; }
  s.w = w; s.h = h; s.r = r; s.g = h * 0.42;
}

export function start(s) {
  if (s.phase !== 'title') return;
  s.phase = 'play'; s.idle = 0; s.nextSpawn = Math.min(s.nextSpawn, 0.4);
  s.events.push({ type: 'start' });
}

function pickKind(s) {
  if (s.force) return s.force;
  if (!s.bag.length) { s.bag = s.kinds.slice(); for (let i = s.bag.length - 1; i > 0; i--) { const j = Math.floor(s.rand() * (i + 1)); [s.bag[i], s.bag[j]] = [s.bag[j], s.bag[i]]; } }
  return s.bag.pop();
}

// Toss one fruit up from below the screen so its top point is well inside.
export function launch(s, kind = pickKind(s), opt = {}) {
  const R = s.rand, w = s.w, h = s.h, r = s.r * (KIND_SIZE[kind] || 1) * (opt.scale || 1);
  const x0 = opt.x ?? w * (0.15 + R() * 0.7);
  const apexY = opt.apexY ?? h * (0.2 + R() * 0.22) + (h > w ? h * 0.04 : 0);
  const y0 = h + r * 1.2;
  const vy = -Math.sqrt(2 * s.g * (y0 - apexY));
  // across the whole flight (up and back down) the fruit drifts from x0 to
  // xEnd, both kept a fruit's width inside the edges
  const T = 2 * -vy / s.g;
  const lo = Math.max(w * 0.12, r * 1.1), hi = Math.min(w * 0.88, w - r * 1.1);
  const x1 = Math.max(lo, Math.min(hi, x0)), xEnd = Math.max(lo, Math.min(hi, x1 + (R() - 0.5) * w * 0.45));
  const f = {
    id: s.nextId++, kind, x: x1, y: y0, vx: (xEnd - x1) / T, vy, rot: (R() - 0.5) * 0.6, spin: (R() - 0.5) * 1.6,
    r, sparkle: opt.sparkle ?? ((s.launched + 1) % SPARKLE_EVERY === 0), born: s.t, hover: !!opt.hover,
  };
  if (opt.y != null) { f.x = x0; f.y = opt.y; f.vy = opt.vy ?? 0; f.vx = opt.vx ?? 0; }
  if (opt.giant) { f.giant = true; f.hp = GIANT_HP; f.hitT = -9; f.homeY = apexY; f.spin = 0; f.rot = 0; f.sparkle = false; }
  if (opt.mini) f.mini = true;
  s.fruits.push(f); s.launched++;
  s.events.push({ type: f.giant ? 'giant' : 'launch', kind, x: f.x, sparkle: f.sparkle, id: f.id });
  return f;
}

function maxOnScreen(s) {
  if (s.phase === 'title') return 2;
  const base = s.h > s.w ? 3 : 4;
  return s.launched < 4 ? 1 : s.launched < 12 ? Math.min(2, base) : base;
}
function waveSize(s) {
  if (s.phase === 'title' || s.launched < 4) return 1;
  const R = s.rand();
  return s.launched < 12 ? (R < 0.6 ? 1 : 2) : (R < 0.35 ? 1 : R < 0.8 ? 2 : 3);
}

export function step(s, dt) {
  if (s.frozen || dt <= 0) return;
  s.t += dt;
  const g = s.g;
  // fruit and halves fly on simple arcs (exact for constant gravity)
  for (const f of s.fruits) {
    if (f.giant) { stepGiant(s, f, dt); continue; }
    if (f.hover) continue;
    f.x += f.vx * dt; f.y += f.vy * dt + 0.5 * g * dt * dt; f.vy += g * dt; f.rot += f.spin * dt;
  }
  stepBubbles(s, dt);
  for (const f of s.halves) { f.x += f.vx * dt; f.y += f.vy * dt + 0.5 * g * 1.4 * dt * dt; f.vy += g * 1.4 * dt; f.rot += f.spin * dt; f.t += dt; }
  const gone = f => f.vy > 0 && f.y > s.h + f.r * 2.5;
  for (const f of s.fruits) if (gone(f)) s.events.push({ type: 'fall', kind: f.kind });
  s.fruits = s.fruits.filter(f => !gone(f));
  s.halves = s.halves.filter(f => !gone(f));

  // juice reaching the jar
  for (const p of s.pending) p.t -= dt;
  while (s.pending.length && s.pending[0].t <= 0) {
    const p = s.pending.shift();
    if (s.phase === 'play' && s.stripes.length < JAR_CAP) {
      s.stripes.push(p.kind);
      s.events.push({ type: 'stripe', kind: p.kind, n: s.stripes.length });
      if (s.stripes.length >= JAR_CAP) { s.phase = 'party'; s.partyT = 0; s.events.push({ type: 'party', round: s.rounds + 1 }); }
    }
  }

  if (s.phase === 'party') {
    s.partyT += dt;
    if (s.partyT >= PARTY_TIME) { s.phase = 'drain'; s.drainT = 0; s.events.push({ type: 'drink' }); }
  } else if (s.phase === 'drain') {
    s.drainT += dt;
    if (s.drainT >= DRAIN_TIME) { s.stripes = []; s.phase = 'play'; s.rounds++; s.nextSpawn = 0.6; s.events.push({ type: 'refill' }); }
  }

  // tossing new fruit
  if (s.phase === 'play' || s.phase === 'title') {
    if (s.phase === 'play') { s.idle += dt; s.playT += dt; }
    if (s.noSpawn) return;
    if (s.phase === 'play') {
      // a giant waits for an empty sky and then comes up alone
      if (s.sliced >= s.nextGiant && !s.fruits.some(f => f.giant)) {
        s.nextSpawn = Math.max(s.nextSpawn, 0.5);
        if (s.fruits.length === 0) { launchGiant(s); return; }
      }
      if (s.fruits.some(f => f.giant)) return;
      s.nextBubble -= dt;
      if (s.nextBubble <= 0) { if (s.bubbles.length < 2) addBubble(s); s.nextBubble = 7 + s.rand() * 5; }
    }
    s.nextSpawn -= dt;
    if (s.fruits.length === 0 && s.nextSpawn > 0.6) s.nextSpawn = 0.6;
    if (s.nextSpawn <= 0) {
      const room = maxOnScreen(s) - s.fruits.length;
      const n = Math.min(room, waveSize(s));
      for (let i = 0; i < n; i++) launch(s);
      const R = s.rand();
      s.nextSpawn = s.phase === 'title' ? 2.4 + R : n > 0 ? 1.4 + R * 0.9 : 0.4;
    }
  }
}

// Cut fruit f along direction dir (radians).
export function cut(s, f, dir, how = 'swipe') {
  const i = s.fruits.indexOf(f); if (i < 0) return null;
  if (f.giant && f.hp > 1) {
    // one swipe is one hit, however many segments it crosses
    if (s.t - f.hitT < 0.35) return null;
    f.hp--; f.hitT = s.t; f.hover = true; f.vy = 0;
    const ev = { type: 'thump', kind: f.kind, x: f.x, y: f.y, r: f.r, dir, hp: f.hp, how, id: f.id };
    s.events.push(ev); return ev;
  }
  s.fruits.splice(i, 1);
  const n = dir - Math.PI / 2, sp = s.r * 2.4, nx = Math.cos(n), ny = Math.sin(n);
  const base = { kind: f.kind, r: f.r, t: 0 };
  s.halves.push({ ...base, side: 0, x: f.x - nx * f.r * 0.1, y: f.y - ny * f.r * 0.1, vx: f.vx * 0.5 - nx * sp, vy: Math.min(f.vy, 0) * 0.4 - ny * sp - s.r * 2, rot: dir + Math.PI, spin: -1.8 - s.rand() * 1.5 });
  s.halves.push({ ...base, side: 1, x: f.x + nx * f.r * 0.1, y: f.y + ny * f.r * 0.1, vx: f.vx * 0.5 + nx * sp, vy: Math.min(f.vy, 0) * 0.4 + ny * sp - s.r * 2, rot: dir, spin: 1.8 + s.rand() * 1.5 });
  s.sliced++;
  const stripes = f.giant ? 3 : f.sparkle ? 2 : 1;
  for (let k = 0; k < stripes; k++) s.pending.push({ t: JAR_DELAY + k * 0.25, kind: f.kind });
  s.pending.sort((a, b) => a.t - b.t);
  const ev = { type: 'cut', kind: f.kind, x: f.x, y: f.y, r: f.r, dir, sparkle: f.sparkle, how, n: s.sliced, giant: !!f.giant };
  s.events.push(ev);
  if (f.giant) burstGiant(s, f);
  return ev;
}

function distToSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
// A finger moved from (x0, y0) to (x1, y1): cut everything it touched.
// Generous: the reach is a third bigger than the fruit.
export function swipe(s, x0, y0, x1, y1) {
  s.idle = 0;
  if (s.phase === 'title') start(s);
  for (const b of s.bubbles.filter(b => distToSeg(b.x, b.y, x0, y0, x1, y1) < b.r * 1.1)) popBubble(s, b, true);
  const hits = s.fruits.filter(f => distToSeg(f.x, f.y, x0, y0, x1, y1) < f.r * (f.giant ? 1.05 : 1.3));
  const len = Math.hypot(x1 - x0, y1 - y0);
  const dir = len > 1 ? Math.atan2(y1 - y0, x1 - x0) : s.rand() * Math.PI * 2;
  return hits.map(f => cut(s, f, dir, 'swipe')).filter(Boolean);
}
// A tap: pops the nearest fruit under the finger, or makes a little splash.
export function tap(s, x, y) {
  s.idle = 0;
  if (s.phase === 'title') start(s);
  let best = null, bd = Infinity;
  for (const f of s.fruits) { const d = Math.hypot(f.x - x, f.y - y); if (d < f.r * (f.giant ? 1.05 : 1.4) && d < bd) { bd = d; best = f; } }
  if (best) return cut(s, best, -0.5 + (s.rand() - 0.5) * 1.6, 'tap');
  let bb = null;
  for (const b of s.bubbles) { const d = Math.hypot(b.x - x, b.y - y); if (d < b.r * 1.2 && d < bd) { bd = d; bb = b; } }
  if (bb) return popBubble(s, bb, true);
  s.events.push({ type: s.phase === 'party' ? 'firework' : 'tap', x, y });
  return null;
}

export function drainEvents(s) { const e = s.events; s.events = []; return e; }

// The fruit the hint hand should point at, if nobody has touched for a while.
export function hintTarget(s) {
  if (s.phase !== 'play' || s.idle < HINT_AFTER) return null;
  let best = null;
  for (const f of s.fruits) if (f.vy < s.g * 0.6 && f.y < s.h * 0.75 && (!best || f.y < best.y)) best = f;
  return best;
}

// ---------- giant fruit ----------
export function launchGiant(s, kind) {
  const R = s.rand;
  kind = kind || ['watermelon', 'pineapple', 'orange', 'strawberry', 'apple'][Math.floor(R() * 5)];
  s.nextGiant = s.sliced + GIANT_EVERY; s.giants++;
  const portrait = s.h > s.w;
  return launch(s, kind, { giant: true, scale: GIANT_SCALE / (KIND_SIZE[kind] || 1) * (portrait ? 0.85 : 1), x: s.w / 2, apexY: s.h * (portrait ? 0.4 : 0.44) });
}
function stepGiant(s, f, dt) {
  const age = s.t - f.born;
  if (!f.hover && !f.leaving) {
    f.y += f.vy * dt + 0.5 * s.g * dt * dt; f.vy += s.g * dt;
    if (f.vy >= 0) { f.hover = true; f.vy = 0; }
  } else if (f.hover && !f.leaving) {
    // bob gently around its spot, springing back after a hit
    f.y += (f.homeY + Math.sin(age * 1.6) * f.r * 0.05 - f.y) * Math.min(1, dt * 3);
    f.rot = Math.sin(age * 1.1) * 0.06;
    if (age > GIANT_LIFE && s.phase === 'play') { f.leaving = true; f.hover = false; f.vy = 0; }
  } else {
    f.y += f.vy * dt + 0.5 * s.g * 0.5 * dt * dt; f.vy += s.g * 0.5 * dt;
  }
}
function burstGiant(s, f) {
  const R = s.rand, n = GIANT_MINIS, kinds = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.5 + (R() - 0.5) * 0.2;
    const sp = Math.sqrt(2 * s.g * s.h * 0.22) * (0.85 + R() * 0.3);
    const kind = s.kinds[Math.floor(R() * s.kinds.length)];
    let vx = Math.cos(a) * sp * 0.9;
    const vy = Math.sin(a) * sp, T = (-vy + Math.sqrt(vy * vy + 2 * s.g * (s.h - f.y))) / s.g, edge = s.r * 1.2;
    if (f.x + vx * T < edge) vx = (edge - f.x) / T; if (f.x + vx * T > s.w - edge) vx = (s.w - edge - f.x) / T;
    launch(s, kind, { mini: true, scale: 0.72, x: f.x + Math.cos(a) * f.r * 0.3, y: f.y, vx, vy: Math.sin(a) * sp, sparkle: false });
    kinds.push(kind);
  }
  const treats = [0, 1, 2, 3, 4, 5].map(i => TREATS[i % TREATS.length]);
  s.events.push({ type: 'burst', kind: f.kind, x: f.x, y: f.y, r: f.r, kinds, treats });
  s.nextSpawn = Math.max(s.nextSpawn, 2.2);
}

// ---------- bubbles ----------
export function addBubble(s, inside, x) {
  const R = s.rand, r = s.r * 1.3;
  if (!inside) inside = R() < 0.6 ? { type: 'fruit', kind: pickKind(s) } : { type: 'treat', kind: TREATS[Math.floor(R() * TREATS.length)] };
  x = x ?? Math.max(r * 1.2, Math.min(s.w - r * 1.2, s.w * (0.15 + R() * 0.7)));
  const b = { id: s.nextId++, x, y: -r, x0: x, r, vy: s.h * (0.07 + R() * 0.02), ph: R() * Math.PI * 2, t: 0, inside };
  s.bubbles.push(b);
  s.events.push({ type: 'bubble', id: b.id, inside });
  return b;
}
function stepBubbles(s, dt) {
  for (const b of s.bubbles) {
    b.t += dt; b.y += b.vy * dt;
    b.x = b.x0 + Math.sin(b.t * 0.9 + b.ph) * b.r * 0.5;
  }
  const floor = s.h * (s.h > s.w ? 0.8 : 0.79) - s.r * 0.4;
  for (const b of s.bubbles.filter(b => b.y > floor)) popBubble(s, b, false);
}
// by: true when a finger popped it. Then a fruit inside tumbles out to be
// sliced; a bubble that reaches the blanket just pops and its gift sparkles.
export function popBubble(s, b, by) {
  const i = s.bubbles.indexOf(b); if (i < 0) return null;
  s.bubbles.splice(i, 1);
  if (by) s.popped++;
  let fruit = null;
  if (by && b.inside.type === 'fruit') fruit = launch(s, b.inside.kind, { x: b.x, y: b.y, vx: (s.rand() - 0.5) * s.r, vy: -Math.sqrt(2 * s.g * s.h * 0.1), sparkle: true });
  const ev = { type: 'bubblePop', x: b.x, y: b.y, r: b.r, inside: b.inside, by, fruit: fruit && fruit.id };
  s.events.push(ev);
  return ev;
}
