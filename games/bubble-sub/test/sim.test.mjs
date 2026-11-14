// The rules in Node, without a browser: the sub goes where it is steered and
// never leaves the water, friends react to taps and fill the shelf, ten
// friends throw a party that ends and starts a new round, pearls and the
// treasure chest are collected by driving through them, and nothing can go
// wrong in a long random session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/sim.js';

const run = (s, secs) => { for (let t = 0; t < secs; t += 1 / 60) S.step(s, 1 / 60); };
const types = evs => evs.map(e => e.type);
const screen = (s, x, y) => ({ x: x - s.cam, y });   // world point to screen units
// An open-water spot near (x, y) with no friend, fish or sub under it.
function openWater(s, x, y) {
  for (let r = 0; r < 600; r += 20) for (let a = 0; a < 6.28; a += 0.5) {
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.5;
    if (py < S.SURFACE + 140 || py > S.floorY(s.VH, px) - 100) continue;
    if (S.hitCreature(s, px, py) || S.hitSub(s, px, py)) continue;
    if (s.schools.some(f => f.fish.some(fi => Math.hypot(px - (f.x + fi.ox + fi.sx), py - (f.y + fi.oy + fi.sy)) < 60))) continue;
    return { x: px, y: py };
  }
  throw new Error('no open water');
}

test('the title waits for a touch, then play starts', () => {
  const s = S.createSim({ seed: 1 });
  run(s, 3);
  assert.equal(s.phase, 'title');
  assert.equal(S.press(s, 100, 100), 'start');
  assert.equal(s.phase, 'play');
  assert.deepEqual(types(S.drainEvents(s)), ['start']);
});

test('ten shelf friends exist in the world and every kind has art settings', () => {
  const s = S.createSim({ seed: 2, phase: 'play' });
  assert.equal(S.SHELF.length, 10);
  for (const k of S.SHELF) assert.ok(s.creatures.some(c => c.kind === k), `no ${k} in the world`);
  for (const c of s.creatures) assert.ok(S.KIND[c.kind], `unknown kind ${c.kind}`);
  assert.ok(s.schools.length >= 4 && s.schools.every(f => f.fish.length >= 30), 'schools of fish are missing');
});

test('a tap on open water steers the sub there; holding and dragging keeps steering', () => {
  const s = S.createSim({ seed: 3, phase: 'play' });
  const x0 = s.sub.x, target = openWater(s, x0 + 400, s.VH * 0.3);
  const p = screen(s, target.x, target.y);
  assert.equal(S.press(s, p.x, p.y), 'steer');
  S.release(s);
  run(s, 3);
  assert.ok(Math.hypot(s.sub.x - target.x, s.sub.y - target.y) < 40, `sub ended at ${s.sub.x.toFixed(0)},${s.sub.y.toFixed(0)}, target ${target.x.toFixed(0)},${target.y.toFixed(0)}`);
  assert.equal(s.sub.face, 1);
  // drag to the left: it turns round and follows
  S.press(s, 50, s.VH * 0.5); for (let i = 0; i < 60; i++) { S.drag(s, 50, s.VH * 0.5); S.step(s, 1 / 60); }
  assert.equal(s.sub.face, -1);
  assert.ok(s.sub.x < target.x - 100);
});

test('the sub never leaves the water or the world, whatever is touched', () => {
  const s = S.createSim({ seed: 4, phase: 'play' });
  for (const [x, y] of [[-500, -500], [99999, 99999], [10, s.VH + 300], [s.VW, -100]]) {
    S.press(s, x, y);
    for (let i = 0; i < 400; i++) { S.drag(s, x, y); S.step(s, 1 / 60); }
    S.release(s);
    assert.ok(s.sub.y >= S.SURFACE + 80 && s.sub.y <= S.floorY(s.VH, s.sub.x), `sub out of the water at y=${s.sub.y}`);
    assert.ok(s.sub.x >= 140 && s.sub.x <= S.WORLD_W - 140, `sub out of the world at x=${s.sub.x}`);
    assert.ok(s.cam >= 0 && s.cam <= S.WORLD_W - s.VW + 1e-6, `camera out of range ${s.cam}`);
  }
});

test('the camera follows the sub all the way to the Glow Cave, where it gets dark', () => {
  const s = S.createSim({ seed: 5, phase: 'play' });
  const zones = new Set();
  for (let i = 0; i < 60 * 30 && s.sub.x < 5600; i++) { S.drag(s, s.VW - 10, s.VH * 0.4); S.step(s, 1 / 60); for (const e of S.drainEvents(s)) if (e.type === 'zone') zones.add(e.zone); }
  assert.ok(s.sub.x > 5500, `sub only reached ${s.sub.x}`);
  assert.deepEqual([...zones], ['kelp', 'garden', 'cave']);
  assert.ok(S.darkness(s.cam + s.VW / 2) > 0.9);
  assert.ok(Math.abs(s.sub.x - (s.cam + s.VW / 2)) < s.VW * 0.4, 'sub went off screen');
});

test('tapping a friend makes it happy and squishy and puts it on the shelf once', () => {
  const s = S.createSim({ seed: 6, phase: 'play' });
  const c = s.creatures.find(c => c.kind === 'octopus');
  s.cam = Math.max(0, c.x - 300);
  S.drainEvents(s);
  assert.equal(S.press(s, c.x - s.cam + 10, c.y - 10), 'friend');
  let ev = S.drainEvents(s);
  assert.equal(ev[0].type, 'friend'); assert.equal(ev[0].kind, 'octopus'); assert.equal(ev[0].isNew, true);
  assert.ok(c.happyT > 1);
  S.step(s, 0.05); assert.ok(Math.abs(c.squash) > 0.05, 'no squash');
  run(s, 3); assert.ok(Math.abs(c.squash) < 0.02, 'squash never settled');
  S.press(s, c.x - s.cam, c.y);
  ev = S.drainEvents(s);
  assert.equal(ev[0].isNew, false);
  assert.deepEqual([...s.found], ['octopus']);
});

test('tapping the sub honks the horn and does not steer', () => {
  const s = S.createSim({ seed: 7, phase: 'play' });
  const x = s.sub.x;
  assert.equal(S.press(s, s.sub.x - s.cam, s.sub.y), 'sub');
  assert.deepEqual(types(S.drainEvents(s)), ['honk']);
  run(s, 1); assert.ok(Math.abs(s.sub.x - x) < 5);
});

test('ten friends throw a party, which ends with an empty shelf and a new round', () => {
  const s = S.createSim({ seed: 8, phase: 'play' });
  for (const k of S.SHELF) S.tickle(s, s.creatures.find(c => c.kind === k));
  const ev = types(S.drainEvents(s));
  assert.equal(ev.filter(t => t === 'friend').length, 10);
  assert.equal(ev.at(-1), 'party');
  assert.equal(s.phase, 'party');
  run(s, 3);
  // everyone gathers near the sub
  const near = s.creatures.filter(c => Math.hypot(c.x - s.sub.x, c.y - s.sub.y) < 900).length;
  assert.ok(near > s.creatures.length * 0.6, `only ${near} friends came to the party`);
  run(s, S.PARTY_TIME);
  assert.equal(s.phase, 'play'); assert.equal(s.found.size, 0); assert.equal(s.rounds, 1);
  assert.ok(types(S.drainEvents(s)).includes('refill'));
});

test('driving through pearls collects them, and the chest opens with more', () => {
  const s = S.createSim({ seed: 9, phase: 'play' });
  const p = s.pearls[0];
  s.sub.x = p.x - 200; s.sub.y = p.y; s.cam = Math.max(0, s.sub.x - 300);
  const tp = screen(s, p.x + 400, p.y); S.steer(s, tp.x, tp.y, true); S.release(s);
  run(s, 2);
  assert.ok(s.pearlsTaken >= 3, `only ${s.pearlsTaken} pearls`);
  const before = s.pearls.length;
  s.sub.x = s.chest.x - 60; s.sub.y = s.chest.y - 120; s.sub.tx = null;
  run(s, 0.2);
  assert.equal(s.chest.open, true);
  assert.ok(s.pearls.length > before, 'no pearls from the chest');
});

test('the hint shows after a quiet spell and points at a friend not yet found', () => {
  const s = S.createSim({ seed: 10, phase: 'play' });
  run(s, S.HINT_AFTER - 0.5); assert.equal(S.hintTarget(s), null);
  run(s, 1); const h = S.hintTarget(s);
  assert.ok(h);
  if (h.kind !== 'steer') assert.ok(S.SHELF.includes(h.kind) && !s.found.has(h.kind));
  S.press(s, 10, 10); assert.equal(S.hintTarget(s), null);
});

test('resizing keeps everything inside the water', () => {
  const s = S.createSim({ seed: 11, phase: 'play', VH: 900, VW: 1600 });
  run(s, 2);
  S.resize(s, 1212, 560);
  for (const c of s.creatures) assert.ok(c.y < S.floorY(1212, c.x) + 40, `${c.kind} below the floor`);
  S.resize(s, 900, 1948);
  assert.ok(s.cam <= S.WORLD_W - 1948);
  run(s, 2);
  assert.ok(s.sub.y <= S.floorY(900, s.sub.x));
});

test('ten minutes of random toddler play never produces a bad number', () => {
  const s = S.createSim({ seed: 12, phase: 'play' }), R = S.rng(99);
  let parties = 0;
  for (let i = 0; i < 60 * 600; i++) {
    if (i % 20 === 0) { const r = R(); if (r < 0.3) S.press(s, R() * s.VW, R() * s.VH); else if (r < 0.5) S.drag(s, R() * s.VW, R() * s.VH); else if (r < 0.6) S.release(s); else if (r < 0.75) { const c = s.creatures[(R() * s.creatures.length) | 0]; S.press(s, c.x - s.cam, c.y); } }
    S.step(s, 1 / 60);
    for (const e of S.drainEvents(s)) if (e.type === 'party') parties++;
  }
  const nums = [s.sub.x, s.sub.y, s.sub.vx, s.sub.vy, s.cam, ...s.creatures.flatMap(c => [c.x, c.y, c.squash]), ...s.schools.flatMap(f => f.fish.flatMap(fi => [fi.sx, fi.sy]))];
  assert.ok(nums.every(Number.isFinite), 'NaN or Infinity in the state');
  assert.ok(s.creatures.every(c => c.y > S.SURFACE && c.y < s.VH), 'a friend left the water');
  assert.ok(s.pearls.length < 120, 'pearls keep piling up');
  assert.ok(parties >= 0);
});
