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

// ---------- giant fruit and bubbles ----------
const sliceAll = s => { for (const f of s.fruits.slice()) if (!f.giant && f.y < s.h * 0.7) S.cut(s, f, 0); };

test('after a few slices a giant fruit floats up alone and waits in the middle', () => {
  const s = S.createSim({ seed: 9, w: 1280, h: 720, r: 72, phase: 'play' });
  let giant = null;
  for (let t = 0; t < 120 && !giant; t += 1 / 60) { S.step(s, 1 / 60); sliceAll(s); giant = s.fruits.find(f => f.giant); }
  run(s, 4);
  assert.ok(giant, 'no giant came');
  assert.ok(s.sliced >= S.GIANT_FIRST);
  const g = s.fruits.find(f => f.giant);
  assert.ok(g, 'giant left too early');
  assert.ok(g.hover, 'giant should hover');
  assert.ok(g.y - g.r > 0 && g.y + g.r < s.h, `giant at ${g.y.toFixed(0)} r ${g.r.toFixed(0)} is off screen`);
  assert.ok(g.x - g.r > 0 && g.x + g.r < s.w);
  assert.equal(s.fruits.filter(f => !f.giant).length, 0, 'giant should come alone');
});

test('a giant takes three hits, one per swipe, then bursts into small fruit and three stripes', () => {
  for (const [w, h] of [[1280, 720], [390, 844]]) {
    const s = S.createSim({ seed: 4, w, h, r: 60, phase: 'play' });
    s.noSpawn = true;
    const g = S.launchGiant(s, 'watermelon');
    run(s, 3);
    S.drainEvents(s);
    // one long swipe through the giant counts once
    S.swipe(s, g.x - g.r, g.y, g.x, g.y); S.swipe(s, g.x, g.y, g.x + g.r, g.y);
    assert.equal(g.hp, S.GIANT_HP - 1);
    run(s, 0.5); S.tap(s, g.x, g.y);
    assert.equal(g.hp, 1);
    assert.ok(s.fruits.includes(g));
    run(s, 0.5); S.tap(s, g.x, g.y);
    assert.ok(!s.fruits.includes(g), 'giant should burst on the third hit');
    const evs = S.drainEvents(s), burst = evs.find(e => e.type === 'burst');
    assert.ok(burst, 'no burst event');
    assert.deepEqual(types(evs).filter(t => t === 'thump').length, 2);
    const minis = s.fruits.filter(f => f.mini);
    assert.equal(minis.length, S.GIANT_MINIS);
    // the shower stays on screen
    for (const m of minis) { const one = { ...m }; for (let t = 0; t < 6; t += 1 / 60) { one.x += one.vx / 60; one.y += one.vy / 60; one.vy += s.g / 60; if (one.y < h) assert.ok(one.x > 0 && one.x < w, `mini went to x=${one.x.toFixed(0)} of ${w}`); } }
    run(s, 1.5);
    assert.equal(s.stripes.length, 3);
  }
});

test('an ignored giant floats away after a while and play goes on', () => {
  const s = S.createSim({ seed: 2, w: 1280, h: 720, r: 72, phase: 'play' });
  S.launchGiant(s);
  run(s, S.GIANT_LIFE + 8);
  assert.ok(!s.fruits.some(f => f.giant));
  run(s, 6);
  assert.ok(s.fruits.length >= 1, 'normal fruit should come back');
});

test('bubbles drift down; a tap pops one and its fruit tumbles out to slice', () => {
  const s = S.createSim({ seed: 3, w: 1280, h: 720, r: 72, phase: 'play' });
  s.noSpawn = true;
  const b = S.addBubble(s, { type: 'fruit', kind: 'kiwi' }, 600);
  run(s, 2);
  assert.ok(b.y > 0 && b.y < s.h * 0.6);
  S.drainEvents(s);
  S.tap(s, b.x, b.y);
  const ev = S.drainEvents(s).find(e => e.type === 'bubblePop');
  assert.ok(ev && ev.by && ev.fruit, 'pop should release a fruit');
  assert.equal(s.bubbles.length, 0);
  const f = s.fruits.find(x => x.id === ev.fruit);
  assert.equal(f.kind, 'kiwi');
  assert.ok(f.vy < 0, 'released fruit hops up');
  S.tap(s, f.x, f.y);
  assert.equal(s.sliced, 1);
});

test('a treat bubble gives no fruit, and a bubble nobody pops pops by itself above the blanket', () => {
  const s = S.createSim({ seed: 3, w: 1280, h: 720, r: 72, phase: 'play' });
  s.noSpawn = true;
  const t = S.addBubble(s, { type: 'treat', kind: 'candy' }, 300);
  run(s, 2); S.swipe(s, t.x - 50, t.y, t.x + 50, t.y);
  assert.equal(s.fruits.length, 0); assert.equal(s.popped, 1);
  S.addBubble(s, { type: 'fruit', kind: 'apple' }, 800);
  let pop = null;
  run(s, 20, () => { for (const e of S.drainEvents(s)) if (e.type === 'bubblePop') pop = e; });
  assert.ok(pop && !pop.by, 'bubble should pop by itself');
  assert.ok(pop.y < s.h * 0.8);
  assert.equal(s.fruits.length, 0, 'a self-popped bubble drops nothing');
});

test('bubbles come along during play, never more than two at once', () => {
  const s = S.createSim({ seed: 8, w: 1280, h: 720, r: 72, phase: 'play' });
  let most = 0, made = 0;
  run(s, 180, () => { most = Math.max(most, s.bubbles.length); for (const e of S.drainEvents(s)) if (e.type === 'bubble') made++; });
  assert.ok(made >= 8, `only ${made} bubbles in three minutes`);
  assert.ok(most <= 2);
});
