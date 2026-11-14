// Bubble Sub rules. Pure and Node-importable: no canvas, DOM or audio.
//
// The world is a long strip of sea in world units, WORLD_W wide and as tall as
// the screen (VH units, at least 900). The camera only scrolls sideways.
// Zones from left to right: Sunny Reef, Kelp Wreck, Coral Garden and the
// Glow Cave, which gets dark so the sub's headlight comes on.
//
// The child steers by touching: while a finger is down the sub glides toward
// it; a tap sends it there. Tapping a sea friend makes it squish and giggle
// and, the first time, puts it on the friend shelf. Ten friends on the shelf
// throw a party, then the shelf empties and play goes on. Pearls along the
// way are picked up by just driving through them. Nothing can be lost.
//
// Events (drainEvents): start, steer, honk, friend {kind, id, x, y, isNew},
// school {x, y}, pearl {x, y, n}, chest {x, y}, zone {zone}, party, refill.

export const WORLD_W = 6000;
export const SURFACE = 40;
export const ZONES = [
  { id: 'reef', x0: 0, x1: 1700 },
  { id: 'kelp', x0: 1700, x1: 3200 },
  { id: 'garden', x0: 3200, x1: 4500 },
  { id: 'cave', x0: 4500, x1: WORLD_W },
];
export const SHELF = ['clown', 'puffer', 'octopus', 'turtle', 'crab', 'seahorse', 'jelly', 'dolphin', 'shark', 'whale'];
export const SUB_R = 92;            // the sub's hull radius in world units
export const MAX_SPEED = 560;
export const PARTY_TIME = 9;
export const HINT_AFTER = 6;
export const PEARL_R = 16;

// Size (radius) and how each kind moves: swim (free in a box), floor (walks
// on the sand), bob (hovers in place), drift (jellies, slow vertical pulse).
export const KIND = {
  clown: { r: 34, move: 'swim', speed: 70 },
  fish: { r: 30, move: 'swim', speed: 80 },
  angel: { r: 36, move: 'swim', speed: 50 },
  puffer: { r: 42, move: 'swim', speed: 40 },
  octopus: { r: 52, move: 'bob', speed: 25 },
  turtle: { r: 64, move: 'swim', speed: 45 },
  crab: { r: 38, move: 'floor', speed: 45 },
  starfish: { r: 32, move: 'still', speed: 0 },
  seahorse: { r: 46, move: 'bob', speed: 15 },
  jelly: { r: 46, move: 'drift', speed: 20 },
  dolphin: { r: 72, move: 'swim', speed: 150 },
  shark: { r: 88, move: 'swim', speed: 70 },
  manta: { r: 95, move: 'swim', speed: 60 },
  whale: { r: 170, move: 'swim', speed: 35 },
};
// [kind, x, y as a share of the swimmable height (0 top .. 1 floor), box half-width]
const CAST = [
  ['clown', 380, 0.72, 160], ['clown', 1180, 0.66, 150], ['fish', 760, 0.45, 220], ['puffer', 1000, 0.5, 200],
  ['octopus', 560, 0.9, 80], ['crab', 260, 1, 180], ['crab', 1400, 1, 200], ['starfish', 820, 1.02, 0],
  ['turtle', 1500, 0.35, 300], ['dolphin', 900, 0.18, 500], ['angel', 1250, 0.55, 140], ['jelly', 1600, 0.3, 40],
  ['shark', 2300, 0.42, 420], ['manta', 2700, 0.22, 400], ['seahorse', 2050, 0.75, 30], ['crab', 2600, 1, 200],
  ['fish', 2950, 0.6, 200], ['puffer', 2450, 0.68, 150], ['starfish', 2250, 1.02, 0], ['octopus', 3050, 0.9, 80],
  ['whale', 3700, 0.22, 450], ['clown', 3500, 0.7, 150], ['angel', 3900, 0.55, 160], ['turtle', 4150, 0.45, 260],
  ['seahorse', 4300, 0.72, 30], ['dolphin', 3600, 0.15, 400], ['crab', 4000, 1, 220], ['starfish', 3350, 1.02, 0],
  ['fish', 1900, 0.3, 200], ['angel', 2700, 0.62, 140], ['fish', 4250, 0.25, 220], ['clown', 1700, 0.5, 150],
  ['jelly', 4800, 0.35, 40], ['jelly', 5050, 0.6, 40], ['jelly', 5300, 0.25, 40], ['jelly', 5550, 0.5, 40], ['jelly', 5800, 0.3, 40],
  ['seahorse', 5200, 0.78, 30], ['octopus', 4950, 0.9, 80], ['manta', 5400, 0.4, 350], ['crab', 5700, 1, 150],
];
// Schools of little fish: [x, y share, roam half-width, count, palette index]
const SCHOOLS = [[700, 0.3, 450, 34, 0], [1500, 0.62, 350, 30, 2], [2500, 0.35, 500, 44, 1], [3200, 0.2, 400, 30, 0], [3800, 0.45, 450, 40, 2], [5200, 0.55, 450, 36, 3]];

export function rng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function zoneAt(x) { for (const z of ZONES) if (x < z.x1) return z.id; return 'cave'; }
// How dark the sea is at world x (0 bright reef .. 1 deep cave).
export const darkness = x => smooth(4350, 4950, x);
export const floorY = (VH, x) => VH - 120 + Math.sin(x / 210) * 16 + Math.sin(x / 90) * 6;

export function createSim({ seed = 1, VH = 900, VW = 1600, phase = 'title' } = {}) {
  const s = {
    seed, R: rng(seed), VH, VW, phase, t: 0, idle: 0, frozen: false,
    sub: { x: 520, y: VH * 0.45, vx: 0, vy: 0, face: 1, tilt: 0, tx: null, ty: null, hold: false, honkT: 0, bump: 0, speed: 0 },
    cam: 0, creatures: [], schools: [], pearls: [], chest: null,
    found: new Set(), lastFound: null, partyT: 0, rounds: 0, pearlsTaken: 0, taps: 0, zone: 'reef',
    events: [], nextId: 1,
  };
  layout(s);
  s.cam = clamp(s.sub.x - VW * 0.4, 0, WORLD_W - VW);
  return s;
}
const swimTop = s => SURFACE + 90, swimBot = (s, x) => floorY(s.VH, x) - 60;

function layout(s) {
  const R = rng(s.seed * 7 + 3);
  s.creatures = CAST.map(([kind, x, ys, half], i) => {
    const k = KIND[kind], top = swimTop(s), bot = swimBot(s, x);
    let y = top + (bot - top) * Math.min(1, ys);
    if (k.move === 'floor' || k.move === 'still') y = floorY(s.VH, x) - k.r * 0.55 + (ys > 1 ? 18 : 0);
    if (kind === 'octopus') y = floorY(s.VH, x) - k.r * 1.35;
    return {
      id: s.nextId++, kind, x, y, hx: x, hy: y, half, r: k.r, vx: (R() < 0.5 ? -1 : 1) * k.speed, vy: 0,
      face: R() < 0.5 ? -1 : 1, phase: R() * 10, happyT: 0, squash: 0, squashV: 0, puff: 0, variant: i % 3, turnT: 2 + R() * 4,
    };
  });
  s.schools = SCHOOLS.map(([x, ys, half, n, pal], i) => {
    const top = swimTop(s), bot = swimBot(s, x), y = top + (bot - top) * ys;
    const fish = [];
    for (let k = 0; k < n; k++) { const a = R() * Math.PI * 2, rad = Math.sqrt(R()); fish.push({ ox: Math.cos(a) * rad * 170, oy: Math.sin(a) * rad * 70, ph: R() * 10, s: 0.7 + R() * 0.6, c: (R() * 3) | 0, sx: 0, sy: 0 }); }
    return { id: i, x, y, hx: x, hy: y, half, dir: i % 2 ? -1 : 1, speed: 55 + i * 6, fish, scatter: 0, sx: 0, sy: 0, pal };
  });
  // pearls: little arcs along the way, more in the cave
  s.pearls = [];
  const runs = [[700, 0.55, 6], [1350, 0.3, 5], [2000, 0.6, 7], [2850, 0.4, 6], [3400, 0.7, 6], [4100, 0.3, 6], [4700, 0.6, 7], [5300, 0.45, 6]];
  for (const [x0, ys, n] of runs) {
    const top = swimTop(s), bot = swimBot(s, x0), y0 = top + (bot - top) * ys;
    for (let i = 0; i < n; i++) s.pearls.push({ x: x0 + i * 62, y: y0 - Math.sin(i / (n - 1) * Math.PI) * 70, taken: false, back: 0, c: i % 4 });
  }
  s.chest = { x: 5720, y: floorY(s.VH, 5720) + 4, open: false, t: 0 };
}

// Screen size changed: keep the sub and everything at the same depth share.
export function resize(s, VH, VW) {
  const k = VH / s.VH;
  if (Math.abs(k - 1) > 1e-6) {
    const ry = y => y * k;
    s.sub.y = ry(s.sub.y); if (s.sub.ty != null) s.sub.ty = ry(s.sub.ty);
    for (const c of s.creatures) { c.y = ry(c.y); c.hy = ry(c.hy); }
    for (const f of s.schools) { f.y = ry(f.y); f.hy = ry(f.hy); }
    for (const p of s.pearls) p.y = ry(p.y);
    s.chest.y = floorY(VH, s.chest.x) + 4;
    for (const c of s.creatures) if (KIND[c.kind].move === 'floor' || KIND[c.kind].move === 'still') { c.y = c.hy = floorY(VH, c.hx) - c.r * 0.55 + (c.kind === 'starfish' ? 18 : 0); }
  }
  s.VH = VH; s.VW = VW;
  s.cam = clamp(s.sub.x - VW / 2, 0, Math.max(0, WORLD_W - VW));
}

const emit = (s, type, o = {}) => s.events.push({ type, ...o });
export function drainEvents(s) { const e = s.events; s.events = []; return e; }

export function start(s) { if (s.phase !== 'title') return; s.phase = 'play'; s.idle = 0; emit(s, 'start'); }

// Screen point to world point.
export const toWorld = (s, sx, sy) => ({ x: sx + s.cam, y: sy });

// Which friend (if any) is under a world point. Generous for small fingers.
export function hitCreature(s, x, y) {
  let best = null, bd = Infinity;
  for (const c of s.creatures) {
    const reach = c.r * (c.kind === 'whale' ? 1.0 : 1.2) + 18, d = Math.hypot(x - c.x, y - c.y);
    if (d < reach && d / reach < bd) { bd = d / reach; best = c; }
  }
  return best;
}
export const hitSub = (s, x, y) => Math.hypot((x - s.sub.x) / 1.3, y - s.sub.y) < SUB_R * 1.05;

// A finger came down at screen (sx, sy). Returns what it touched.
export function press(s, sx, sy) {
  s.idle = 0; s.taps++;
  if (s.phase === 'title') { start(s); return 'start'; }
  const { x, y } = toWorld(s, sx, sy);
  if (hitSub(s, x, y)) { honk(s); return 'sub'; }
  const c = hitCreature(s, x, y);
  if (c) { tickle(s, c); return 'friend'; }
  for (const f of s.schools) {
    for (const fi of f.fish) { if (Math.hypot(x - (f.x + fi.ox + fi.sx), y - (f.y + fi.oy + fi.sy)) < 40) { scare(s, f, x, y); emit(s, 'school', { x, y }); return 'school'; } }
  }
  steer(s, sx, sy, true);
  return 'steer';
}
// Finger moving while held: keep steering toward it.
export function drag(s, sx, sy) { if (s.phase === 'title') return; s.idle = 0; steer(s, sx, sy, false); }
export function release(s) { s.sub.hold = false; }

export function steer(s, sx, sy, fresh) {
  const { x, y } = toWorld(s, sx, sy), sub = s.sub;
  sub.tx = clamp(x, 140, WORLD_W - 140); sub.ty = clamp(y, swimTop(s), swimBot(s, x) - 10); sub.hold = true;
  if (fresh) emit(s, 'steer', { x: sub.tx, y: sub.ty });
}
export function honk(s) { s.sub.honkT = 1; s.sub.bump = 1; emit(s, 'honk', { x: s.sub.x, y: s.sub.y }); }

export function tickle(s, c) {
  c.happyT = 1.6; c.squashV -= 9; if (c.kind === 'puffer') c.puff = 1;
  const shelfKind = c.kind === 'fish' || c.kind === 'angel' ? null : c.kind;
  const isNew = !!shelfKind && SHELF.includes(shelfKind) && !s.found.has(shelfKind) && s.phase === 'play';
  if (isNew) { s.found.add(shelfKind); s.lastFound = shelfKind; }
  emit(s, 'friend', { kind: c.kind, id: c.id, x: c.x, y: c.y, isNew, count: s.found.size });
  if (isNew && s.found.size === SHELF.length) { s.phase = 'party'; s.partyT = 0; emit(s, 'party'); }
}
function scare(s, f, x, y) { f.scatter = 1; f.fromX = x; f.fromY = y; }

// ---------- stepping ----------
export function step(s, dt) {
  if (s.frozen) return;
  s.t += dt; s.idle += dt;
  stepSub(s, dt);
  for (const c of s.creatures) stepCreature(s, c, dt);
  for (const f of s.schools) stepSchool(s, f, dt);
  stepPearls(s, dt);
  const z = zoneAt(s.sub.x); if (z !== s.zone) { s.zone = z; emit(s, 'zone', { zone: z }); }
  if (s.phase === 'party') {
    s.partyT += dt;
    if (s.partyT >= PARTY_TIME) { s.phase = 'play'; s.found.clear(); s.lastFound = null; s.rounds++; for (const p of s.pearls) { p.taken = false; p.back = 0; } s.chest.open = false; emit(s, 'refill'); }
  }
  // camera keeps the sub a little behind centre, looking where it heads
  const lead = s.sub.face * s.VW * 0.08, want = clamp(s.sub.x - s.VW / 2 + lead, 0, Math.max(0, WORLD_W - s.VW));
  s.cam += (want - s.cam) * Math.min(1, dt * 2.6);
}

function stepSub(s, dt) {
  const b = s.sub;
  let ax = 0, ay = 0;
  if (b.tx != null) {
    const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
    if (d > 6 || Math.hypot(b.vx, b.vy) > 25) {
      const want = Math.min(MAX_SPEED, d * 1.7), vx = d > 0.5 ? dx / d * want : 0, vy = d > 0.5 ? dy / d * want : 0;
      ax = (vx - b.vx) * 4.2; ay = (vy - b.vy) * 4.2;
      if (Math.abs(dx) > 80) b.face = dx > 0 ? 1 : -1;
    } else if (!b.hold) { b.tx = b.ty = null; }
  } else {
    // idle: gentle bob, drift to a stop
    ax = -b.vx * 1.5; ay = -b.vy * 1.5 + Math.sin(s.t * 1.6) * 14;
  }
  b.vx += ax * dt; b.vy += ay * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;
  const top = swimTop(s), bot = swimBot(s, b.x) - 10;
  if (b.y < top) { b.y = top; b.vy = Math.max(0, b.vy); }
  if (b.y > bot) { b.y = bot; b.vy = Math.min(0, b.vy); }
  if (b.x < 140) { b.x = 140; b.vx = Math.max(0, b.vx); }
  if (b.x > WORLD_W - 140) { b.x = WORLD_W - 140; b.vx = Math.min(0, b.vx); }
  b.speed = Math.hypot(b.vx, b.vy);
  const wantTilt = clamp(b.vy / MAX_SPEED * 0.5, -0.35, 0.35) * b.face;
  b.tilt += (wantTilt - b.tilt) * Math.min(1, dt * 5);
  b.honkT = Math.max(0, b.honkT - dt * 0.9); b.bump = Math.max(0, b.bump - dt * 2.5);
}

function stepCreature(s, c, dt) {
  const k = KIND[c.kind];
  c.happyT = Math.max(0, c.happyT - dt); c.puff = Math.max(0, c.puff - dt * 0.35);
  // springy squash: squash is the displacement, squashV its velocity
  c.squashV += (-c.squash * 120 - c.squashV * 9) * dt; c.squash += c.squashV * dt;
  c.phase += dt;
  const party = s.phase === 'party';
  if (party && k.move !== 'still') {
    // everyone gathers around the sub and dances
    const a = c.id * 2.399 + s.partyT * 0.5, rx = 330 + (c.id % 4) * 70, ry = 150 + (c.id % 3) * 50;
    let tx = s.sub.x + Math.cos(a) * rx, ty = s.sub.y + Math.sin(a) * ry - 30;
    if (c.kind === 'whale') { tx = s.sub.x; ty = swimTop(s) + 70; }
    if (k.move === 'floor') ty = c.y;
    const top = swimTop(s), bot = swimBot(s, tx);
    ty = clamp(ty, top, bot);
    c.x += (tx - c.x) * Math.min(1, dt * 1.6); c.y += (ty - c.y) * Math.min(1, dt * 1.6);
    if (Math.abs(tx - c.x) > 5) c.face = tx > c.x ? 1 : -1;
    return;
  }
  switch (k.move) {
    case 'swim': {
      c.turnT -= dt;
      const lo = c.hx - c.half, hi = c.hx + c.half;
      if (c.x < lo) c.vx = Math.abs(c.vx); else if (c.x > hi) c.vx = -Math.abs(c.vx);
      else if (c.turnT <= 0) { c.turnT = 3 + (c.id * 37 % 50) / 10; if (c.half > 60) c.vx = -c.vx; }
      // swim away from the sub a little if it comes right up (except when happy)
      const dx = c.x - s.sub.x, dy = c.y - s.sub.y, d = Math.hypot(dx, dy);
      let push = 0; if (d < SUB_R + c.r + 40 && c.happyT <= 0 && c.kind !== 'whale') push = 1 - d / (SUB_R + c.r + 40);
      const sp = k.speed * (c.happyT > 0 ? 0.35 : 1);
      c.x += (Math.sign(c.vx) * sp + dx / (d || 1) * push * 280) * dt;
      const ty = c.hy + Math.sin(c.phase * 0.6 + c.id) * 40;
      c.y += ((ty - c.y) * 0.8 + dy / (d || 1) * push * 240) * dt;
      c.face = c.vx >= 0 ? 1 : -1;
      c.y = clamp(c.y, swimTop(s) + c.r * 0.3, swimBot(s, c.x) - c.r * 0.2);
      break;
    }
    case 'floor': {
      if (c.x < c.hx - c.half) c.vx = Math.abs(c.vx); if (c.x > c.hx + c.half) c.vx = -Math.abs(c.vx);
      const walk = Math.sin(c.phase * 0.7) > -0.3 ? 1 : 0;
      c.x += c.vx * walk * (c.happyT > 0 ? 0 : 1) * dt;
      c.y = floorY(s.VH, c.x) - c.r * 0.55;
      break;
    }
    case 'bob': c.y = c.hy + Math.sin(c.phase * 1.4) * 10; c.x = c.hx + Math.sin(c.phase * 0.4) * c.half * 0.5; break;
    case 'drift': c.y = c.hy + Math.sin(c.phase * 0.5 + c.id) * 70; c.x = c.hx + Math.sin(c.phase * 0.23 + c.id) * 40; break;
    default: break;
  }
}

function stepSchool(s, f, dt) {
  const lo = f.hx - f.half, hi = f.hx + f.half;
  if (f.x < lo) f.dir = 1; else if (f.x > hi) f.dir = -1;
  f.x += f.dir * f.speed * dt;
  f.y = f.hy + Math.sin(s.t * 0.4 + f.id) * 40;
  // the sub coming close scatters the school; it regroups after
  const d = Math.hypot(s.sub.x - f.x, s.sub.y - f.y);
  if (d < 230 && s.sub.speed > 60 && f.scatter < 0.6) { f.scatter = 1; f.fromX = s.sub.x; f.fromY = s.sub.y; }
  f.scatter = Math.max(0, f.scatter - dt * 0.45);
  for (const fi of f.fish) {
    const wx = f.x + fi.ox, wy = f.y + fi.oy;
    if (f.scatter > 0.5 && f.fromX != null) {
      const dx = wx - f.fromX, dy = wy - f.fromY, dd = Math.hypot(dx, dy) || 1;
      fi.sx += dx / dd * 260 * dt; fi.sy += dy / dd * 160 * dt;
    } else { fi.sx *= 1 - Math.min(1, dt * 1.2); fi.sy *= 1 - Math.min(1, dt * 1.2); }
    // little fish never sit on top of the sub
    const ex = f.x + fi.ox + fi.sx - s.sub.x, ey = f.y + fi.oy + fi.sy - s.sub.y, ed = Math.hypot(ex / 1.4, ey);
    if (ed < SUB_R * 1.5) { fi.sx += ex / (ed || 1) * 240 * dt; fi.sy += ey / (ed || 1) * 240 * dt; }
    fi.ph += dt;
    const top = swimTop(s) - f.y - fi.oy, bot = swimBot(s, wx) - f.y - fi.oy;
    fi.sy = clamp(fi.sy, top, bot);
  }
}

function stepPearls(s, dt) {
  const b = s.sub;
  for (const p of s.pearls) {
    if (p.taken) { p.back += dt; continue; }
    if (Math.hypot((p.x - b.x) / 1.25, p.y - b.y) < SUB_R * 0.95 + PEARL_R) { p.taken = true; p.back = 0; s.pearlsTaken++; emit(s, 'pearl', { x: p.x, y: p.y, n: s.pearlsTaken }); }
  }
  const ch = s.chest;
  if (!ch.open && Math.hypot(ch.x - b.x, ch.y - 60 - b.y) < SUB_R + 90) {
    ch.open = true; ch.t = 0; emit(s, 'chest', { x: ch.x, y: ch.y });
    for (let i = 0; i < 7; i++) s.pearls.push({ x: ch.x - 150 + i * 50, y: ch.y - 170 - Math.sin(i / 6 * Math.PI) * 90, taken: false, back: 0, c: i % 4, fromChest: true });
  }
  if (ch.open) ch.t += dt;
  // chest pearls go away once collected so they can come again next round
  s.pearls = s.pearls.filter(p => !(p.fromChest && p.taken && p.back > 2));
}

// The friend the hint hand should point at: the nearest one not yet found.
export function hintTarget(s) {
  if (s.phase !== 'play' || s.idle < HINT_AFTER) return null;
  let best = null, bd = Infinity;
  for (const c of s.creatures) {
    if (!SHELF.includes(c.kind) || s.found.has(c.kind)) continue;
    const sx = c.x - s.cam; if (sx < 40 || sx > s.VW - 40) continue;
    const d = Math.abs(c.x - s.sub.x); if (d < bd) { bd = d; best = c; }
  }
  return best || { x: s.sub.x + s.sub.face * 300, y: s.sub.y, kind: 'steer' };
}
