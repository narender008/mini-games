// Garden Grow rules: the garden, its plants and all its little visitors, as
// plain data stepped in time. Nothing here touches the DOM, canvas or sound,
// so it runs in Node for the tests. Positions are CSS pixels; a plant's art
// is drawn in "units" that layout() scales to the screen (L.ps px per unit).
//
// The loop for a two-year-old: every tap does something.
//   empty soil  → a seed pops in and a sprout springs up
//   a sprout    → the watering can swoops in and it grows a bud
//   a bud       → it bursts into bloom, and a new visitor arrives
//   a bloom     → it giggles, wiggles and sings its own note
// Plants also grow by themselves, so the garden never stands still. When every
// patch is in bloom the garden throws a party, then the flowers puff into
// dandelion seeds and new ones are ready to plant. Nothing wilts, nothing is
// lost. Around the patches: butterflies, bees, birds on the fence, a ladybug,
// a snail, a bunny in the bush, a frog in the pond, worms, bubbles, apples on
// the trees, clouds that rain, a giggling sun and a hot-air balloon that
// drops seeds. Every one of them answers a tap.
//
// sim.events collects what happened ({ type, ... }) for the view and sound.

export const EMPTY = 0, SEED = 1, SPROUT = 2, BUD = 3, BLOOM = 4;
export const KINDS = ['daisy', 'tulip', 'puff', 'sunflower', 'carrot'];
export const COLORS = ['pink', 'red', 'purple', 'orange', 'blue', 'yellow'];
export const STEM = { daisy: 220, tulip: 205, puff: 215, sunflower: 255, carrot: 18 };
export const T = { seed: 0.6, water: 0.9, autoBud: 9, autoBloom: 8, party: 10, puffAt: 7.2, rain: 3.2, rainbow: 9, hint: 6, wiggle: 0.9 };
const CAPS = { butterfly: 5, bee: 3, bird: 2, ladybug: 2, bubble: 5 };
const VISITORS = ['butterfly', 'bee', 'bird', 'butterfly', 'ladybug', 'bee'];

function mulberry(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export function layout(W, H) {
  const portrait = H > W * 1.05;
  const u = Math.min(W, H) / 900;
  const L = { W, H, portrait, u };
  if (portrait) {
    L.ps = Math.min(W / 700, H / 1250);
    L.horizon = H * 0.37;
    L.patches = [[0.28, 0.6], [0.72, 0.6], [0.28, 0.83], [0.72, 0.83]].map(([x, y]) => ({ x: W * x, y: H * y }));
    L.sun = { x: W * 0.34, y: H * 0.085, r: 62 * L.ps * 1.3 };
    L.walkY = H * 0.7; L.walks = [[W * 0.06, W * 0.94]];
    L.pond = { x: W * 0.13, y: H * 0.955, rx: W * 0.11, ry: H * 0.022 };
    L.bush = { x: W * 0.9, y: H * 0.955, r: 50 * L.ps };
    L.buttons = { seed: { x: W * 0.39, y: H * 0.95, r: Math.max(34, 46 * L.ps * 1.2) }, can: { x: W * 0.61, y: H * 0.95, r: Math.max(34, 46 * L.ps * 1.2) } };
    L.trees = [{ x: W * 0.07, y: L.horizon + 6, s: L.ps * 0.8 }, { x: W * 0.93, y: L.horizon + 6, s: L.ps * 0.8 }];
    L.mushrooms = [{ x: W * 0.5, y: H * 0.665, s: L.ps }];
  } else {
    L.ps = Math.min(W / 1600, H / 900) * 1.02;
    L.horizon = H * 0.5;
    const n = 5;
    L.patches = Array.from({ length: n }, (_, i) => ({ x: W * (0.2 + i * 0.15), y: H * 0.84 }));
    L.sun = { x: W * 0.12, y: H * 0.16, r: 70 * L.ps };
    L.walkY = H * 0.958; L.walks = [[W * 0.14, W * 0.36], [W * 0.64, W * 0.88]];
    L.pond = { x: W * 0.065, y: H * 0.9, rx: W * 0.065, ry: H * 0.05 };
    L.bush = { x: W * 0.945, y: H * 0.9, r: 62 * L.ps };
    { const br = Math.max(32, 40 * L.ps), by = Math.min(H * 0.948, H - br - 6); L.buttons = { seed: { x: W * 0.425, y: by, r: br }, can: { x: W * 0.575, y: by, r: br } }; }
    L.trees = [{ x: W * 0.06, y: L.horizon + 4, s: L.ps * 0.9 }, { x: W * 0.93, y: L.horizon + 2, s: L.ps }];
    L.mushrooms = [{ x: W * 0.125, y: H * 0.7, s: L.ps }, { x: W * 0.875, y: H * 0.68, s: L.ps * 0.85 }];
  }
  L.fenceTop = L.horizon - 16 * L.ps;
  L.lily = [{ x: L.pond.x - L.pond.rx * 0.35, y: L.pond.y + L.pond.ry * 0.05 }, { x: L.pond.x + L.pond.rx * 0.45, y: L.pond.y - L.pond.ry * 0.25 }];
  // apple spots on the tree crowns, in tree units
  L.appleSpots = [];
  L.trees.forEach((t, ti) => [[-40, -190], [30, -215], [55, -150], [-62, -140]].forEach(([ax, ay], k) => L.appleSpots.push({ x: t.x + ax * t.s, y: t.y + ay * t.s, tree: ti, k })));
  return L;
}

// Where a plant's head is, without the sway the view adds.
export function headOf(sim, i) {
  const p = sim.patches[i], L = sim.L, k = p.stage === BLOOM ? 1 : p.stage === BUD ? 0.82 : p.stage === SPROUT ? 0.36 : 0;
  const h = p.kind === 'carrot' ? (p.stage >= BUD ? 22 : 30) : p.stage === SPROUT ? 75 : STEM[p.kind] * k;
  return { x: L.patches[i].x, y: L.patches[i].y - 8 * L.ps - h * L.ps };
}

export function createSim({ seed = 1, phase = 'play', W = 1280, H = 720 } = {}) {
  const sim = {
    seed, rand: mulberry(seed), t: 0, phase, events: [], nextId: 1,
    patches: [], creatures: [], wild: [], apples: [], clouds: [],
    round: 0, planted: 0, bloomed: 0, tickles: 0, taps: 0, parties: 0, visitors: 0,
    partyT: 0, rainT: 0, rainbowT: 0, rainGrew: false, sunSpin: 0, sunMood: 'happy', sunMoodT: 0,
    idleT: 0, hint: null, visitorIx: 0, timers: { bird: 4, worm: 10, bubble: 2, balloon: 14 },
    can: null, mushroomSquash: [], quiet: false, frozen: false,
  };
  sim.L = layout(W, H);
  sim.patches = sim.L.patches.map(() => newPatch(sim, EMPTY));
  pickKinds(sim);
  sim.clouds = (sim.L.portrait ? [0.78, 0.2, 1.05] : [0.38, 0.66, 0.9]).map((fx, i) => ({ x: W * fx, y: H * (sim.L.portrait ? [0.06, 0.19, 0.25][i] : 0.1 + (i % 2) * 0.09), s: (sim.L.portrait ? 48 : 52) * sim.L.ps * (1.1 - i * 0.15) / 0.9 * (sim.L.portrait ? 1.3 : 1), v: (6 + i * 3) * sim.L.ps, face: i === 0, bob: i }));
  sim.apples = sim.L.appleSpots.map(() => ({ has: true, regrow: 0 }));
  sim.mushroomSquash = sim.L.mushrooms.map(() => 0);
  for (let i = 0; i < 2; i++) add(sim, 'butterfly');
  add(sim, 'ladybug'); add(sim, 'snail'); add(sim, 'bunny'); add(sim, 'frog');
  if (phase === 'title') for (const p of sim.patches) { p.stage = BLOOM; p.grow = 1; }
  return sim;
}

function newPatch(sim, stage) { return { stage, kind: 'daisy', color: 'pink', t: 0, grow: 0, waterT: 0, wiggle: 0, mood: 'happy', moodT: 0, hop: 0, pop: 0 }; }
function pickKinds(sim) {
  const r = sim.rand, n = sim.patches.length;
  const kinds = KINDS.slice().sort(() => r() - 0.5);
  if (n > kinds.length) kinds.push(KINDS[Math.floor(r() * 4)]);
  const cols = COLORS.slice().sort(() => r() - 0.5);
  sim.patches.forEach((p, i) => { p.kind = kinds[i % kinds.length]; p.color = cols[i % cols.length]; });
}

export function resize(sim, W, H) {
  const o = sim.L, L = layout(W, H), sx = W / o.W, sy = H / o.H;
  sim.L = L;
  for (const c of sim.creatures) { c.x *= sx; c.y *= sy; if (c.tx != null) { c.tx *= sx; c.ty *= sy; } if (c.cx != null) { c.cx *= sx; c.cy *= sy; } if (c.x0 != null) { c.x0 *= sx; c.y0 *= sy; c.x1 *= sx; c.y1 *= sy; } }
  for (const c of sim.clouds) { c.x *= sx; c.y *= sy; c.s *= L.ps / o.ps; c.v *= L.ps / o.ps; }
  for (const w of sim.wild) { w.x *= sx; w.y *= sy; }
  // the number of patches changes between landscape (5) and portrait (4)
  while (sim.patches.length > L.patches.length) sim.patches.pop();
  while (sim.patches.length < L.patches.length) { const p = newPatch(sim, EMPTY); p.kind = KINDS[sim.patches.length % KINDS.length]; p.color = COLORS[sim.patches.length % COLORS.length]; sim.patches.push(p); }
  if (sim.apples.length !== L.appleSpots.length) sim.apples = L.appleSpots.map(() => ({ has: true, regrow: 0 }));
  if (sim.mushroomSquash.length !== L.mushrooms.length) sim.mushroomSquash = L.mushrooms.map(() => 0);
  for (const c of sim.creatures) if (c.kind === 'frog') { const p = L.lily[c.pad]; c.x = p.x; c.y = p.y; }
}

const seg = (sim, c) => sim.L.walks[(c.seg || 0) % sim.L.walks.length];
const emit = (sim, type, o = {}) => { if (!sim.quiet) sim.events.push({ type, ...o }); };
const count = (sim, kind) => sim.creatures.reduce((n, c) => n + (c.kind === kind && c.s !== 'leave' ? 1 : 0), 0);
const blooms = sim => sim.patches.map((p, i) => p.stage === BLOOM && p.kind !== 'carrot' ? i : -1).filter(i => i >= 0);

// ---------- visitors ----------
export function add(sim, kind, o = {}) {
  const L = sim.L, r = sim.rand, W = L.W, H = L.H;
  const c = { id: sim.nextId++, kind, x: 0, y: 0, s: 'fly', t: 0, dir: r() < 0.5 ? -1 : 1, a: r() * 10, tx: null, ty: null, f: -1, ...o };
  const side = r() < 0.5 ? -1 : 1;
  switch (kind) {
    case 'butterfly': case 'bee':
      if (o.x == null) { c.x = side < 0 ? -40 : W + 40; c.y = H * (0.15 + r() * 0.3); }
      c.s = 'fly'; pickTarget(sim, c); break;
    case 'bird': c.x = side < 0 ? -50 : W + 50; c.y = H * 0.12; c.s = 'flyin'; c.tx = W * (0.25 + r() * 0.5); c.ty = L.fenceTop; c.t = 0; c.x0 = c.x; c.y0 = c.y; c.x1 = c.tx; c.y1 = c.ty; c.dur = 2.2; c.dir = c.x1 > c.x0 ? 1 : -1; break;
    case 'ladybug': { c.seg = sim.creatures.filter(o => o.kind === 'ladybug').length + 1; const w = seg(sim, c); c.x = o.x ?? w[0] + r() * (w[1] - w[0]); c.y = L.walkY; c.s = 'walk'; break; }
    case 'snail': { c.seg = 0; const w = seg(sim, c); c.x = w[0] + (w[1] - w[0]) * 0.62; c.y = L.walkY; c.s = 'walk'; c.dir = -1; break; }
    case 'bunny': c.seg = L.walks.length - 1; c.x = L.bush.x; c.y = L.walkY; c.s = 'hidden'; c.t = 0; c.wait = 4 + r() * 4; break;
    case 'frog': c.pad = 0; c.x = L.lily[0].x; c.y = L.lily[0].y; c.s = 'sit'; c.t = 4 + r() * 4; break;
    case 'worm': c.x = L.patches[o.patch].x; c.y = L.patches[o.patch].y; c.patch = o.patch; c.s = 'up'; c.t = 0; break;
    case 'bubble': c.x = L.pond.x + (r() - 0.5) * L.pond.rx; c.y = L.pond.y - L.pond.ry * 0.3; c.s = 'rise'; c.t = 0; c.r = (14 + r() * 12) * L.ps * 1.2; break;
    case 'balloon': c.x = -120 * L.ps; c.y = H * (L.portrait ? 0.27 : 0.25); c.s = 'drift'; c.dir = 1; c.gift = true; break;
    case 'apple': c.s = 'fall'; c.vy = 0; c.vx = (r() - 0.5) * 40; c.t = 0; c.ground = L.horizon + (L.portrait ? 20 : 34) * L.ps; break;
  }
  sim.creatures.push(c);
  return c;
}
function pickTarget(sim, c) {
  const L = sim.L, r = sim.rand, b = blooms(sim);
  const taken = new Set(sim.creatures.filter(o => o !== c && o.f >= 0).map(o => o.f));
  const free = b.filter(i => !taken.has(i));
  if ((c.kind === 'bee' || r() < 0.55) && free.length) {
    c.f = free[Math.floor(r() * free.length)];
    const h = headOf(sim, c.f); c.tx = h.x; c.ty = h.y - 22 * L.ps;
  } else {
    c.f = -1; c.tx = L.W * (0.08 + r() * 0.84); c.ty = L.H * (0.1 + r() * (L.portrait ? 0.4 : 0.38));
  }
}
function flyTo(c, dt, speed) {
  const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy) || 1;
  const v = Math.min(d, speed * dt);
  c.x += dx / d * v; c.y += dy / d * v;
  if (Math.abs(dx) > 2) c.dir = dx > 0 ? 1 : -1;
  return d < 6;
}
function arc(c, k, height) { // position along a hop/flight from (x0,y0) to (x1,y1)
  c.x = c.x0 + (c.x1 - c.x0) * k; c.y = c.y0 + (c.y1 - c.y0) * k - Math.sin(Math.PI * k) * height;
}

function stepCreature(sim, c, dt) {
  const L = sim.L, r = sim.rand, ps = L.ps;
  c.t += dt; c.a += dt;
  switch (c.kind) {
    case 'butterfly': case 'bee': {
      const fast = c.kind === 'bee' ? 150 : 95;
      if (c.s === 'fly') {
        if (c.f >= 0 && sim.patches[c.f]?.stage !== BLOOM) pickTarget(sim, c);
        if (flyTo(c, dt, fast * ps * 1.4)) { if (c.f >= 0) { c.s = 'rest'; c.t = 0; c.restFor = c.kind === 'bee' ? 1.4 + r() : 2.5 + r() * 2.5; } else pickTarget(sim, c); }
        c.y += Math.sin(c.a * (c.kind === 'bee' ? 9 : 4)) * (c.kind === 'bee' ? 30 : 22) * ps * dt;
      } else if (c.s === 'rest') {
        if (c.f < 0 || sim.patches[c.f]?.stage !== BLOOM) { c.s = 'fly'; pickTarget(sim, c); break; }
        const h = headOf(sim, c.f); c.x = h.x; c.y = h.y - 22 * ps;
        if (c.t > c.restFor) { c.s = 'fly'; c.f = -1; pickTarget(sim, c); }
      } else if (c.s === 'loop') {
        const k = c.t / 1.4, a = k * Math.PI * 2;
        c.x = c.cx + Math.sin(a) * 55 * ps; c.y = c.cy - (1 - Math.cos(a)) * 45 * ps;
        if (k >= 1) { c.s = 'fly'; c.f = -1; pickTarget(sim, c); }
      } else if (c.s === 'leave') {
        if (!c.out) { c.out = true; c.tx = c.x < L.W / 2 ? -90 : L.W + 90; c.ty = Math.max(-60, c.y - 80); }
        if (flyTo(c, dt, fast * ps * 2) || c.t > 20) c.dead = true;
      }
      break;
    }
    case 'bird': {
      if (c.s === 'flyin' || c.s === 'flyoff') {
        const k = Math.min(1, c.t / c.dur); arc(c, k, c.s === 'flyin' ? -60 * ps : 80 * ps);
        if (k >= 1) { if (c.s === 'flyoff') c.dead = true; else { c.s = 'perch'; c.t = 0; c.stay = 14 + r() * 10; c.next = 1.5 + r() * 2; } }
      } else if (c.s === 'perch') {
        c.y = L.fenceTop;
        if (c.t > c.next) {
          c.next = c.t + 1.6 + r() * 2.4;
          if (r() < 0.55) { emit(sim, 'sing', { x: c.x, y: c.y - 30 * ps, id: c.id }); c.sing = 0.6; }
          else { c.hop = 0.35; c.x = clamp(c.x + (r() - 0.5) * 60 * ps, L.W * 0.05, L.W * 0.95); c.dir = r() < 0.5 ? -1 : 1; }
        }
        if (c.t > c.stay) flyOff(c, sim);
      }
      if (c.hop > 0) c.hop -= dt; if (c.sing > 0) c.sing -= dt;
      break;
    }
    case 'ladybug': case 'snail': {
      if (c.s === 'walk') {
        const w = seg(sim, c);
        c.x += c.dir * (c.kind === 'snail' ? 9 : 26) * ps * dt;
        if (c.x < w[0]) { c.x = w[0]; c.dir = 1; } if (c.x > w[1]) { c.x = w[1]; c.dir = -1; }
        c.y = L.walkY;
      } else if (c.s === 'flyup') { const k = Math.min(1, c.t / 1.3); arc(c, k, 140 * ps); if (k >= 1) { c.s = 'walk'; c.y = L.walkY; } }
      else if (c.s === 'hide' && c.t > 2.6) { c.s = 'walk'; emit(sim, 'peek', { x: c.x, y: c.y }); }
      break;
    }
    case 'bunny': {
      if (c.s === 'hidden') { if (c.t > (c.wait ?? 0)) { c.s = 'peek'; c.t = 0; c.x = L.bush.x; c.y = L.walkY; emit(sim, 'bunnyPeek', { x: c.x, y: c.y }); } }
      else if (c.s === 'peek' && c.t > 2.2) { c.s = 'hop'; c.t = 0; c.x0 = c.x; c.y0 = L.walkY; { const w = seg(sim, c); c.x1 = w[0] + (w[1] - w[0]) * (0.1 + r() * 0.8); } c.y1 = L.walkY; c.dir = c.x1 > c.x0 ? 1 : -1; c.hops = Math.max(2, Math.round(Math.abs(c.x1 - c.x0) / (70 * ps))); }
      else if (c.s === 'hop' || c.s === 'home') {
        const dur = c.hops * 0.45, k = Math.min(1, c.t / dur), hk = (k * c.hops) % 1;
        c.x = c.x0 + (c.x1 - c.x0) * k; c.y = c.y0 - Math.sin(Math.PI * hk) * 28 * ps;
        if (k >= 1) {
          if (c.s === 'hop') { c.s = 'sit'; c.t = 0; c.sitFor = 2 + r() * 2; }
          else { c.s = 'hidden'; c.t = 0; c.wait = 9 + r() * 8; }
        }
      } else if (c.s === 'sit' && c.t > c.sitFor) { c.s = 'home'; c.t = 0; c.x0 = c.x; c.y0 = L.walkY; c.x1 = L.bush.x; c.y1 = L.walkY; c.dir = c.x1 > c.x0 ? 1 : -1; c.hops = Math.max(2, Math.round(Math.abs(c.x1 - c.x0) / (70 * ps))); }
      else if (c.s === 'jump') { const k = Math.min(1, c.t / 0.8); c.y = c.y0 - Math.sin(Math.PI * k) * 110 * ps; if (k >= 1) { c.y = c.y0; c.s = 'sit'; c.t = 0; c.sitFor = 1.5; } }
      break;
    }
    case 'frog': {
      if (c.s === 'sit') { if (c.t > (c.croakAt ?? 5)) { c.croakAt = c.t + 6 + r() * 6; c.croak = 0.5; emit(sim, 'croak', { x: c.x, y: c.y }); } }
      else if (c.s === 'jump') { const k = Math.min(1, c.t / 0.75); arc(c, k, 90 * ps); if (k >= 1) { c.s = 'sit'; c.t = 0; c.croakAt = 4; emit(sim, 'splash', { x: c.x, y: c.y }); } }
      if (c.croak > 0) c.croak -= dt;
      break;
    }
    case 'worm': {
      const p = sim.patches[c.patch];
      if (!p || p.stage !== EMPTY) { c.dead = true; break; }
      if (c.s === 'up' && c.t > 3.4) { c.s = 'down'; c.t = 0; }
      if (c.s === 'down' && c.t > 0.45) c.dead = true;
      break;
    }
    case 'bubble': c.y -= 34 * ps * dt; c.x += Math.sin(c.a * 2.2) * 14 * ps * dt; if (c.t > 6 || c.y < -40) { c.dead = true; emit(sim, 'bubbleGone', { x: c.x, y: c.y, r: c.r }); } break;
    case 'balloon': c.x += (L.W / (L.portrait ? 16 : 22)) * dt; c.y = L.H * (L.portrait ? 0.27 : 0.25) + Math.sin(c.a * 0.9) * 12 * ps; if (c.x > L.W + 160 * ps) c.dead = true; break;
    case 'apple': {
      if (c.s === 'fall') { c.vy += 1500 * ps * dt; c.y += c.vy * dt; c.x += c.vx * dt; if (c.y > c.ground) { c.y = c.ground; c.vy *= -0.45; if (Math.abs(c.vy) < 80 * ps) { c.s = 'roll'; c.t = 0; c.vx = (c.vx >= 0 ? 1 : -1) * 60 * ps; } emit(sim, 'thud', { x: c.x, y: c.y, soft: Math.abs(c.vy) < 200 }); } }
      else if (c.s === 'roll') { c.x += c.vx * dt; c.vx *= 1 - dt * 1.2; c.spin = (c.spin || 0) + c.vx * dt / (16 * ps); if (c.t > 2.2) { c.dead = true; emit(sim, 'sparkle', { x: c.x, y: c.y }); } }
      break;
    }
  }
}
function flyOff(c, sim) { const L = sim.L; c.s = 'flyoff'; c.t = 0; c.x0 = c.x; c.y0 = c.y; c.x1 = c.x < L.W / 2 ? -60 : L.W + 60; c.y1 = L.H * 0.08; c.dur = 1.8; c.dir = c.x1 > c.x0 ? 1 : -1; }

// ---------- plants ----------
function setStage(sim, i, stage, how = 'tap') {
  const p = sim.patches[i], L = sim.L, h = () => headOf(sim, i);
  p.stage = stage; p.t = 0; p.pop = 1;
  const at = L.patches[i];
  if (stage === SEED) { sim.planted++; emit(sim, 'plant', { i, x: at.x, y: at.y, how }); }
  if (stage === SPROUT) emit(sim, 'sprout', { i, x: at.x, y: at.y, ...h() });
  if (stage === BUD) emit(sim, 'bud', { i, ...h(), how });
  if (stage === BLOOM) {
    sim.bloomed++; p.mood = 'wow'; p.moodT = 1.2;
    emit(sim, 'bloom', { i, ...h(), kind: p.kind, color: p.color, how });
    if (sim.phase === 'play') arrive(sim, h());
    checkParty(sim);
  }
  if (stage === EMPTY) emit(sim, 'cleared', { i });
}
function arrive(sim, at) {
  for (let n = 0; n < VISITORS.length; n++) {
    const kind = VISITORS[sim.visitorIx++ % VISITORS.length];
    if (count(sim, kind) < CAPS[kind]) { const c = add(sim, kind); sim.visitors++; emit(sim, 'arrive', { kind, id: c.id, x: at.x, y: at.y }); return c; }
  }
  return null;
}
function grow(sim, i, how) {
  const p = sim.patches[i];
  if (p.stage === SEED) setStage(sim, i, SPROUT, how);
  else if (p.stage === SPROUT) setStage(sim, i, BUD, how);
  else if (p.stage === BUD) setStage(sim, i, BLOOM, how);
}
function water(sim, i, delay = 0) {
  const p = sim.patches[i];
  if (p.stage !== SPROUT && p.stage !== BUD) return false;
  if (p.waterT > 0) return false;
  p.waterT = T.water + delay; p.waterDelay = delay;
  const at = sim.L.patches[i];
  emit(sim, 'water', { i, x: at.x, y: at.y, delay });
  return true;
}
function checkParty(sim) {
  if (sim.phase !== 'play') return;
  if (sim.patches.every(p => p.stage === BLOOM)) { sim.phase = 'party'; sim.partyT = 0; sim.parties++; sim.fireAt = 0.6; sim.rainbowT = Math.max(sim.rainbowT, T.party); emit(sim, 'party'); sim.hint = null; }
}

// ---------- input ----------
// Returns the name of what was touched (handy for tests and the view).
export function tap(sim, x, y) {
  const L = sim.L, ps = L.ps;
  sim.taps++; sim.idleT = 0; sim.hint = null;
  if (sim.phase === 'title') { start(sim); return 'start'; }
  // the two big buttons
  for (const [name, b] of Object.entries(L.buttons)) if (dist(x, y, b.x, b.y) < b.r * 1.15) { button(sim, name); return name; }
  // visitors, topmost first
  const hitR = k => Math.max(30, k * ps);
  const order = ['balloon', 'bubble', 'butterfly', 'bee', 'bird', 'apple', 'bunny', 'frog', 'ladybug', 'snail', 'worm'];
  for (const kind of order) {
    for (let j = sim.creatures.length - 1; j >= 0; j--) {
      const c = sim.creatures[j];
      if (c.kind !== kind || c.dead) continue;
      const R = { balloon: 95, bubble: c.r / ps + 14, butterfly: 52, bee: 50, bird: 46, apple: 30, bunny: 58, frog: 52, ladybug: 40, snail: 50, worm: 40 }[kind];
      const cy = kind === 'bunny' || kind === 'snail' || kind === 'frog' ? c.y - 30 * ps : kind === 'balloon' ? c.y + 20 * ps : kind === 'worm' ? c.y - 28 * ps : c.y;
      if (kind === 'bunny' && c.s === 'hidden') continue;
      if (dist(x, y, c.x, cy) < hitR(R)) { poke(sim, c); return kind; }
    }
  }
  // apples on the trees
  for (let j = 0; j < L.appleSpots.length; j++) {
    const s = L.appleSpots[j], a = sim.apples[j];
    if (a.has && dist(x, y, s.x, s.y) < hitR(34)) {
      a.has = false; a.regrow = 6;
      add(sim, 'apple', { x: s.x, y: s.y, tree: s.tree });
      emit(sim, 'appleDrop', { x: s.x, y: s.y }); return 'apple';
    }
  }
  if (dist(x, y, L.sun.x, L.sun.y) < Math.max(40, L.sun.r * 1.35)) { sim.sunSpin = 1; sim.sunMood = 'giggle'; sim.sunMoodT = 1.4; emit(sim, 'sun', { x: L.sun.x, y: L.sun.y }); return 'sun'; }
  for (const c of sim.clouds) if (Math.abs(x - c.x) < c.s * 1.9 && Math.abs(y - c.y) < c.s * 1.1) { rain(sim, c); return 'cloud'; }
  // plants: the soil, the stem and the head all count
  let best = -1, bd = 1e9;
  sim.patches.forEach((p, i) => {
    const at = L.patches[i], hx = Math.max(44, 78 * ps), top = headOf(sim, i).y - (p.stage === BLOOM ? 75 : 45) * ps;
    if (Math.abs(x - at.x) < hx && y > top && y < at.y + Math.max(30, 40 * ps)) { const d = Math.abs(x - at.x); if (d < bd) { bd = d; best = i; } }
  });
  if (best >= 0) { tapPlant(sim, best); return 'plant'; }
  for (let j = 0; j < L.mushrooms.length; j++) { const m = L.mushrooms[j]; if (dist(x, y, m.x, m.y - 25 * m.s) < hitR(45)) { sim.mushroomSquash[j] = 1; emit(sim, 'boing', { x: m.x, y: m.y - 30 * m.s }); return 'mushroom'; } }
  if (y > L.horizon + 10 * ps) {
    if (sim.wild.length >= 24) sim.wild.shift();
    const cols = ['#ff5fa8', '#ffd21f', '#a55bff', '#3fa9ff', '#ff8a1f', '#ffffff'];
    sim.wild.push({ x, y, col: cols[Math.floor(sim.rand() * cols.length)], t: 0, s: 0.8 + sim.rand() * 0.5 });
    emit(sim, 'wild', { x, y });
    return 'grass';
  }
  emit(sim, 'twinkle', { x, y });
  return 'sky';
}

function poke(sim, c) {
  const L = sim.L, ps = L.ps;
  emit(sim, 'poke', { kind: c.kind, id: c.id, x: c.x, y: c.y });
  switch (c.kind) {
    case 'butterfly': case 'bee': c.s = 'loop'; c.t = 0; c.cx = c.x; c.cy = c.y; c.f = -1; break;
    case 'bird': flyOff(c, sim); break;
    case 'ladybug': c.s = 'flyup'; c.t = 0; c.x0 = c.x; c.y0 = c.y; { const w = seg(sim, c); c.x1 = clamp(c.x + (sim.rand() < 0.5 ? -1 : 1) * (120 + sim.rand() * 160) * ps, w[0], w[1]); } c.y1 = L.walkY; c.dir = c.x1 > c.x0 ? 1 : -1; break;
    case 'snail': if (c.s !== 'hide') { c.s = 'hide'; c.t = 0; } break;
    case 'bunny': c.s = 'jump'; c.t = 0; c.y0 = L.walkY; if (c.y > L.walkY) c.y = L.walkY; break;
    case 'frog': if (c.s === 'sit') { c.s = 'jump'; c.t = 0; c.x0 = c.x; c.y0 = c.y; c.pad = 1 - c.pad; c.x1 = L.lily[c.pad].x; c.y1 = L.lily[c.pad].y; c.dir = c.x1 > c.x0 ? 1 : -1; } break;
    case 'worm': if (c.s === 'up') { c.s = 'down'; c.t = 0; } break;
    case 'bubble': c.dead = true; break;
    case 'apple': c.s = 'roll'; c.t = 0; c.vx = (sim.rand() < 0.5 ? -1 : 1) * 140 * ps; break;
    case 'balloon':
      if (c.gift) { c.gift = false; emit(sim, 'gift', { x: c.x, y: c.y }); sim.patches.forEach((p, i) => { if (p.stage === EMPTY) { p.stage = SEED; p.t = -0.4 - i * 0.12; sim.planted++; emit(sim, 'plant', { i, x: L.patches[i].x, y: L.patches[i].y, how: 'gift', delay: 0.4 + i * 0.12 }); } }); }
      break;
  }
}

function tapPlant(sim, i) {
  const p = sim.patches[i];
  if (sim.phase === 'party') { p.wiggle = 1; p.mood = 'giggle'; p.moodT = 0.8; emit(sim, 'tickle', { i, ...headOf(sim, i), color: p.color, kind: p.kind }); return; }
  switch (p.stage) {
    case EMPTY: setStage(sim, i, SEED); break;
    case SEED: p.wiggle = 1; break;
    case SPROUT: case BUD:
      if (p.stage === BUD && p.waterT <= 0 && p.t > 0.25) { setStage(sim, i, BLOOM); break; }
      if (!water(sim, i)) p.wiggle = 1;
      break;
    case BLOOM:
      p.wiggle = 1; p.mood = 'giggle'; p.moodT = 1; sim.tickles++;
      if (p.kind === 'carrot') p.hop = 1;
      emit(sim, 'tickle', { i, ...headOf(sim, i), color: p.color, kind: p.kind });
      if (sim.tickles % 3 === 0) arrive(sim, headOf(sim, i));
      break;
  }
}

export function button(sim, name) {
  if (sim.phase === 'title') { start(sim); return; }
  const L = sim.L;
  if (name === 'seed') {
    let n = 0;
    sim.patches.forEach((p, i) => { if (p.stage === EMPTY) { p.stage = SEED; p.t = -n * 0.18; sim.planted++; emit(sim, 'plant', { i, x: L.patches[i].x, y: L.patches[i].y, how: 'button', delay: n * 0.18 }); n++; } });
    emit(sim, 'seedButton', { n });
    if (!n) sim.patches.forEach((p) => { p.wiggle = 1; });
  } else {
    let n = 0;
    sim.patches.forEach((p, i) => { if (water(sim, i, n * 0.35)) n++; });
    emit(sim, 'canButton', { n });
    if (!n) sim.patches.forEach((p, i) => { if (p.stage === BLOOM) { p.wiggle = 1; p.mood = 'giggle'; p.moodT = 0.8; } });
  }
}

export function rain(sim, cloud) {
  if (sim.rainT > 0) return;
  sim.rainT = T.rain; sim.rainGrew = false; sim.rainCloud = cloud ? sim.clouds.indexOf(cloud) : 0;
  emit(sim, 'rain', { x: cloud ? cloud.x : sim.L.W / 2, y: cloud ? cloud.y : sim.L.H * 0.12 });
}

export function start(sim) {
  if (sim.phase !== 'title') return;
  sim.phase = 'play';
  emit(sim, 'start');
  sim.patches.forEach((p, i) => { emit(sim, 'puff', { i, ...headOf(sim, i), color: p.color, kind: p.kind }); p.stage = EMPTY; p.t = 0; p.pop = 1; });
  sim.round++; pickKinds(sim);
  sim.hint = null; sim.idleT = 0;
}

// ---------- time ----------
export function step(sim, dt) {
  if (sim.frozen) return;
  dt = clamp(dt, 0, 0.1);
  sim.t += dt;
  const L = sim.L, r = sim.rand;
  if (sim.phase !== 'title') sim.idleT += dt;
  // plants
  sim.patches.forEach((p, i) => {
    p.t += dt;
    p.wiggle = Math.max(0, p.wiggle - dt / T.wiggle);
    p.pop = Math.max(0, p.pop - dt * 2.2);
    p.hop = Math.max(0, p.hop - dt * 1.4);
    p.grow = Math.min(1, p.grow + dt * 2.5);
    if (p.moodT > 0) { p.moodT -= dt; if (p.moodT <= 0) p.mood = 'happy'; }
    if (p.waterT > 0) { p.waterT -= dt; if (p.waterT <= 0) grow(sim, i, 'water'); }
    if (sim.phase === 'title') return;
    if (p.stage === SEED && p.t > T.seed) setStage(sim, i, SPROUT, 'auto');
    else if (sim.phase === 'play' && p.stage === SPROUT && p.t > T.autoBud && p.waterT <= 0) setStage(sim, i, BUD, 'auto');
    else if (sim.phase === 'play' && p.stage === BUD && p.t > T.autoBloom && p.waterT <= 0) setStage(sim, i, BLOOM, 'auto');
  });
  // rain and rainbow
  if (sim.rainT > 0) {
    sim.rainT -= dt;
    if (!sim.rainGrew && sim.rainT < T.rain - 1.2) { sim.rainGrew = true; sim.patches.forEach((p, i) => { if (p.stage === SEED || p.stage === SPROUT || p.stage === BUD) grow(sim, i, 'rain'); }); }
    if (sim.rainT <= 0) { sim.rainbowT = T.rainbow; emit(sim, 'rainbow'); }
  } else if (sim.rainbowT > 0) sim.rainbowT -= dt;
  // the party
  if (sim.phase === 'party') {
    sim.partyT += dt;
    if (sim.partyT > sim.fireAt && sim.partyT < T.puffAt - 0.5) { sim.fireAt += 0.75 + r() * 0.4; emit(sim, 'firework', { x: L.W * (0.15 + r() * 0.7), y: L.H * (0.12 + r() * 0.22) }); }
    if (sim.partyT >= T.puffAt && !sim.puffed) {
      sim.puffed = true;
      sim.patches.forEach((p, i) => { emit(sim, 'puff', { i, ...headOf(sim, i), color: p.color, kind: p.kind }); p.stage = EMPTY; p.t = 0; p.pop = 1; });
      sim.wild.length = 0;
      sim.round++; pickKinds(sim);
    }
    if (sim.partyT >= T.party) { sim.phase = 'play'; sim.puffed = false; sim.idleT = 0; emit(sim, 'partyEnd'); }
  }
  // sun, mushrooms, apples, clouds, wildflowers
  sim.sunSpin = Math.max(0, sim.sunSpin - dt * 0.8);
  if (sim.sunMoodT > 0) { sim.sunMoodT -= dt; if (sim.sunMoodT <= 0) sim.sunMood = 'happy'; }
  for (let j = 0; j < sim.mushroomSquash.length; j++) sim.mushroomSquash[j] = Math.max(0, sim.mushroomSquash[j] - dt * 1.4);
  sim.apples.forEach((a, j) => { if (!a.has) { a.regrow -= dt; if (a.regrow <= 0) { a.has = true; a.grow = 1; emit(sim, 'appleGrow', { ...L.appleSpots[j] }); } } if (a.grow > 0) a.grow = Math.max(0, a.grow - dt * 2); });
  for (const c of sim.clouds) { c.x += c.v * dt; if (c.x > L.W + c.s * 2.5) c.x = -c.s * 2.5; }
  for (const w of sim.wild) w.t += dt;
  // visitors come and go
  const tm = sim.timers;
  tm.bird -= dt; if (tm.bird <= 0) { tm.bird = 9 + r() * 10; if (count(sim, 'bird') < 1 || (count(sim, 'bird') < CAPS.bird && r() < 0.4)) add(sim, 'bird'); }
  tm.bubble -= dt; if (tm.bubble <= 0) { tm.bubble = 1.6 + r() * 2.2; if (count(sim, 'bubble') < CAPS.bubble) add(sim, 'bubble'); }
  tm.worm -= dt; if (tm.worm <= 0) { tm.worm = 8 + r() * 8; const e = sim.patches.map((p, i) => p.stage === EMPTY ? i : -1).filter(i => i >= 0 && !sim.creatures.some(c => c.kind === 'worm' && c.patch === i)); if (sim.phase === 'play' && e.length) { const c = add(sim, 'worm', { patch: e[Math.floor(r() * e.length)] }); emit(sim, 'wormUp', { x: c.x, y: c.y }); } }
  tm.balloon -= dt; if (tm.balloon <= 0) { tm.balloon = 32 + r() * 16; if (!sim.creatures.some(c => c.kind === 'balloon')) { add(sim, 'balloon'); emit(sim, 'balloon'); } }
  // too many butterflies or bees? the oldest wander off
  for (const kind of ['butterfly', 'bee']) { let n = count(sim, kind); for (const c of sim.creatures) if (n > CAPS[kind] && c.kind === kind && c.s !== 'leave') { c.s = 'leave'; c.t = 0; n--; } }
  if (!blooms(sim).length) for (const c of sim.creatures) if (c.kind === 'bee' && c.s !== 'leave' && c.s !== 'loop') { c.s = 'leave'; c.t = 0; }
  for (const c of sim.creatures) stepCreature(sim, c, dt);
  sim.creatures = sim.creatures.filter(c => !c.dead);
  // a hint for a toddler who has stopped: point at the next thing to tap
  if (sim.phase === 'play' && sim.idleT > T.hint && !sim.hint) {
    let i = sim.patches.findIndex(p => p.stage === EMPTY);
    if (i < 0) i = sim.patches.findIndex(p => p.stage === BUD || p.stage === SPROUT);
    if (i >= 0) { const h = sim.patches[i].stage === EMPTY ? sim.L.patches[i] : headOf(sim, i); sim.hint = { i, x: h.x, y: h.y }; emit(sim, 'hint', sim.hint); }
  }
}

// A compact snapshot for tests and the debug hook.
export function snapshot(sim) {
  return {
    phase: sim.phase, t: +sim.t.toFixed(2), round: sim.round, parties: sim.parties,
    planted: sim.planted, bloomed: sim.bloomed, tickles: sim.tickles, taps: sim.taps, visitors: sim.visitors,
    stages: sim.patches.map(p => p.stage), kinds: sim.patches.map(p => p.kind),
    patches: sim.L.patches.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), head: (({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }))(headOf(sim, i)) })),
    creatures: sim.creatures.map(c => ({ id: c.id, kind: c.kind, s: c.s, x: Math.round(c.x), y: Math.round(c.y) })),
    counts: sim.creatures.reduce((o, c) => (o[c.kind] = (o[c.kind] || 0) + 1, o), {}),
    raining: sim.rainT > 0, rainbow: sim.rainbowT > 0, wild: sim.wild.length, hint: sim.hint,
    apples: sim.apples.filter(a => a.has).length, sunSpin: +sim.sunSpin.toFixed(2),
    W: sim.L.W, H: sim.L.H, portrait: sim.L.portrait, ps: +sim.L.ps.toFixed(3),
    buttons: Object.fromEntries(Object.entries(sim.L.buttons).map(([k, b]) => [k, { x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.r) }])),
    sun: { x: Math.round(sim.L.sun.x), y: Math.round(sim.L.sun.y) }, clouds: sim.clouds.map(c => ({ x: Math.round(c.x), y: Math.round(c.y) })),
    appleSpots: sim.L.appleSpots.map(s => ({ x: Math.round(s.x), y: Math.round(s.y) })), mushrooms: sim.L.mushrooms.map(m => ({ x: Math.round(m.x), y: Math.round(m.y) })),
  };
}
