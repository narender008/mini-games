// The rules in Node, without a browser: fruit stay reachable, nothing can be
// lost, swipes and taps cut what they touch, and the jar fills, parties and
// empties again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/sim.js';
import { KIND_LIST } from '../src/kinds.js';

const run = (s, secs, fn) => { for (let t = 0; t < secs; t += 1 / 60) { S.step(s, 1 / 60); fn?.(s, t); } };
const types = evs => evs.map(e => e.type);

test('there are fourteen fruit kinds and a full shuffle shows every one', () => {
  assert.equal(KIND_LIST.length, 14);
  const s = S.createSim({ seed: 3, phase: 'play' });
  const seen = new Set();
  for (let i = 0; i < 14; i++) seen.add(S.launch(s).kind);
  assert.equal(seen.size, 14);
});

for (const [w, h, name] of [[1280, 720, 'landscape'], [390, 844, 'phone portrait'], [1024, 768, 'tablet']]) {
  test(`every fruit rises well inside the screen and comes back down (${name})`, () => {
    const s = S.createSim({ seed: 7, w, h, r: 60, phase: 'play' });
    for (let i = 0; i < 300; i++) {
      const f = S.launch(s);
      let top = Infinity, minX = Infinity, maxX = -Infinity, t = 0;
      const one = { ...f };
      while (t < 20) { one.x += one.vx / 60; one.y += one.vy / 60 + 0.5 * s.g / 3600; one.vy += s.g / 60; t += 1 / 60; top = Math.min(top, one.y); if (one.y < h) { minX = Math.min(minX, one.x); maxX = Math.max(maxX, one.x); } if (one.vy > 0 && one.y > h + f.r * 2.5) break; }
      assert.ok(top > h * 0.12 && top < h * 0.55, `apex at ${top.toFixed(0)} of ${h}`);
      assert.ok(minX > f.r * 0.5 && maxX < w - f.r * 0.5, `x went ${minX.toFixed(0)}..${maxX.toFixed(0)} of ${w}`);
      assert.ok(t > 2.4 && t < 9, `fruit was on screen ${t.toFixed(1)} s (should be slow, not endless)`);
      s.fruits.length = 0;
    }
  });
}

test('the title floats a fruit or two and the first touch starts play', () => {
  const s = S.createSim({ seed: 1 });
  let most = 0; run(s, 20, () => { most = Math.max(most, s.fruits.length); });
  assert.equal(s.phase, 'title'); assert.ok(most >= 1 && most <= 2, `title had ${most} fruit at once`);
  S.drainEvents(s);
  S.tap(s, 5, 5);
  assert.equal(s.phase, 'play');
  assert.ok(types(S.drainEvents(s)).includes('start'));
});

test('nobody playing for ten minutes: fruit keep coming, never pile up, nothing is lost', () => {
  const s = S.createSim({ seed: 11, w: 1280, h: 720, r: 72, phase: 'play' });
  let most = 0, fallen = 0;
  run(s, 600, () => { most = Math.max(most, s.fruits.length); for (const e of S.drainEvents(s)) if (e.type === 'fall') fallen++; });
  assert.equal(s.phase, 'play');
  assert.ok(s.launched > 150, `only ${s.launched} fruit in ten minutes`);
  assert.ok(most <= 4, `${most} fruit at once`);
  assert.ok(fallen >= s.launched - 4);
  assert.equal(s.stripes.length, 0);
});

test('fruit start one at a time and only build up to small waves', () => {
  const s = S.createSim({ seed: 5, w: 1280, h: 720, phase: 'play' });
  let early = 0; run(s, 8, () => { if (s.launched <= 4) early = Math.max(early, s.fruits.length); });
  assert.equal(early, 1);
  const p = S.createSim({ seed: 5, w: 390, h: 844, r: 48, phase: 'play' });
  let most = 0; run(p, 300, () => { most = Math.max(most, p.fruits.length); });
  assert.ok(most <= 3, `phone had ${most} fruit at once`);
});

test('a swipe cuts every fruit it passes near and nothing else', () => {
  const s = S.createSim({ seed: 2, phase: 'play' });
  const a = S.launch(s, 'apple', { x: 300, y: 300, hover: true });
  const b = S.launch(s, 'kiwi', { x: 600, y: 330, hover: true });
  const c = S.launch(s, 'plum', { x: 600, y: 650, hover: true });
  const y0 = 300 + a.r * 1.2, y1 = 330 + b.r * 1.2, cuts = S.swipe(s, 150, y0, 800, y1);
  assert.deepEqual(cuts.map(e => e.kind).sort(), ['apple', 'kiwi']);
  assert.deepEqual(s.fruits.map(f => f.id), [c.id]);
  assert.equal(s.halves.length, 4);
  assert.ok(cuts.every(e => Math.abs(e.dir - Math.atan2(y1 - y0, 650)) < 1e-9));
});

test('a tap pops the fruit under the finger; a tap on nothing still answers', () => {
  const s = S.createSim({ seed: 2, phase: 'play' });
  const f = S.launch(s, 'orange', { x: 400, y: 300, hover: true });
  assert.equal(S.tap(s, 400 + f.r * 1.2, 300).kind, 'orange');
  S.drainEvents(s);
  assert.equal(S.tap(s, 1000, 100), null);
  assert.deepEqual(types(S.drainEvents(s)), ['tap']);
});

test('ten fruit fill the jar, it parties, is drunk and play goes on', () => {
  const s = S.createSim({ seed: 9, phase: 'play' });
  s.nextSpawn = 1e9;
  for (let i = 0; i < 10; i++) { const f = S.launch(s, 'pear', { x: 300, y: 300, hover: true, sparkle: false }); S.tap(s, f.x, f.y); }
  const seen = [];
  run(s, S.JAR_DELAY + 0.1, () => seen.push(...types(S.drainEvents(s))));
  assert.equal(s.stripes.length, 10); assert.equal(s.phase, 'party');
  assert.equal(seen.filter(t => t === 'stripe').length, 10); assert.ok(seen.includes('party'));
  run(s, S.PARTY_TIME + S.DRAIN_TIME + 0.1, () => seen.push(...types(S.drainEvents(s))));
  assert.ok(seen.includes('drink') && seen.includes('refill'));
  assert.equal(s.phase, 'play'); assert.equal(s.stripes.length, 0); assert.equal(s.rounds, 1);
});

test('a glittering fruit fills two stripes, and every ninth fruit glitters', () => {
  const s = S.createSim({ seed: 4, phase: 'play' });
  const fs = Array.from({ length: 18 }, () => S.launch(s));
  assert.deepEqual(fs.map((f, i) => f.sparkle ? i : -1).filter(i => i >= 0), [8, 17]);
  s.fruits.length = 0;
  const g = S.launch(s, 'mango', { x: 200, y: 200, hover: true, sparkle: true });
  S.tap(s, g.x, g.y);
  run(s, S.JAR_DELAY + 0.4);
  assert.equal(s.stripes.length, 2);
});

test('the hint hand shows only after a quiet spell, and a touch hides it', () => {
  const s = S.createSim({ seed: 6, phase: 'play' });
  S.launch(s, 'apple', { x: 400, y: 300, hover: true });
  s.nextSpawn = 1e9;
  run(s, S.HINT_AFTER - 0.5); assert.equal(S.hintTarget(s), null);
  run(s, 1); assert.ok(S.hintTarget(s));
  S.tap(s, 1200, 50); assert.equal(S.hintTarget(s), null);
});

test('a toddler bot scribbling for five minutes fills the jar again and again', () => {
  const s = S.createSim({ seed: 21, w: 1280, h: 720, r: 72, phase: 'title' });
  let rnd = 1, x = 640, y = 360, parties = 0;
  const R = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  for (let t = 0; t < 300; t += 1 / 60) {
    S.step(s, 1 / 60);
    // every so often, swipe roughly at a fruit, like a small child
    if (R() < 0.08 && s.fruits.length) {
      const f = s.fruits[Math.floor(R() * s.fruits.length)], nx = f.x + (R() - 0.5) * 260, ny = f.y + (R() - 0.5) * 260;
      S.swipe(s, x, y, nx, ny); x = nx; y = ny;
    } else if (R() < 0.01) S.tap(s, R() * 1280, R() * 720);
    for (const e of S.drainEvents(s)) if (e.type === 'party') parties++;
    for (const f of [...s.fruits, ...s.halves]) assert.ok(Number.isFinite(f.x + f.y + f.vx + f.vy));
  }
  assert.ok(parties >= 4, `only ${parties} parties in five minutes`);
  assert.ok(s.halves.length < 30);
});

test('resizing keeps fruit in the same place on screen', () => {
  const s = S.createSim({ seed: 2, phase: 'play', w: 1000, h: 800 });
  const f = S.launch(s, 'apple', { x: 500, y: 400, hover: true });
  S.resize(s, 500, 1000, 50);
  assert.equal(f.x, 250); assert.equal(f.y, 500); assert.equal(s.g, 1000 * 0.42);
});
