// The rules in Node, without a browser: every tap does something, plants
// grow by tap and by themselves, every visitor answers a tap, the garden
// throws a party and starts again, and nothing ever gets stuck or lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/sim.js';

const run = (s, secs) => { for (let t = 0; t < secs; t += 1 / 60) S.step(s, 1 / 60); };
const types = s => s.events.splice(0).map(e => e.type);
const play = (o = {}) => { const s = S.createSim({ seed: 5, phase: 'play', W: 1280, H: 720, ...o }); s.events.length = 0; return s; };
const tapPatch = (s, i) => { const p = s.L.patches[i]; return S.tap(s, p.x, p.y); };
const tapHead = (s, i) => { const h = S.headOf(s, i); return S.tap(s, h.x, h.y); };
const find = (s, kind) => s.creatures.find(c => c.kind === kind);

for (const [W, H, name, n] of [[1280, 720, 'landscape', 5], [390, 844, 'phone portrait', 4], [1024, 768, 'tablet', 5], [844, 390, 'phone landscape', 5]]) {
  test(`the garden fits the screen with big targets (${name})`, () => {
    const L = S.layout(W, H);
    assert.equal(L.patches.length, n);
    for (const p of L.patches) { assert.ok(p.x > 30 && p.x < W - 30 && p.y > H * 0.4 && p.y < H - 30, `patch at ${p.x},${p.y}`); }
    for (const b of Object.values(L.buttons)) { assert.ok(b.r >= 32, `button radius ${b.r}`); assert.ok(b.y + b.r <= H + 2 && b.x - b.r >= 0 && b.x + b.r <= W); }
    // neighbouring patches are far enough apart for a small finger
    const xs = L.patches.map(p => p.x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]).filter(d => d > 1);
    assert.ok(Math.min(...gaps) >= 80, `patches only ${Math.min(...gaps)} px apart`);
    const s = S.createSim({ seed: 2, phase: 'play', W, H });
    for (let i = 0; i < L.patches.length; i++) assert.equal(tapPatch(s, i), 'plant', `patch ${i} did not take a tap`);
  });
}

test('the title shows a garden in bloom and the first tap starts a fresh one', () => {
  const s = S.createSim({ seed: 1, phase: 'title' });
  assert.ok(s.patches.every(p => p.stage === S.BLOOM));
  run(s, 5); assert.equal(s.phase, 'title');
  assert.equal(S.tap(s, 10, 10), 'start');
  assert.equal(s.phase, 'play');
  assert.ok(s.patches.every(p => p.stage === S.EMPTY));
  const ev = types(s); assert.ok(ev.includes('start') && ev.filter(e => e === 'puff').length === s.patches.length);
});

test('tap the soil: a seed pops in and a sprout springs up', () => {
  const s = play();
  assert.equal(tapPatch(s, 0), 'plant');
  assert.equal(s.patches[0].stage, S.SEED);
  assert.ok(types(s).includes('plant'));
  run(s, S.T.seed + 0.1);
  assert.equal(s.patches[0].stage, S.SPROUT);
  assert.ok(types(s).includes('sprout'));
});

test('tap the sprout: the watering can comes and a bud grows; tap the bud: it blooms and a visitor arrives', () => {
  const s = play();
  tapPatch(s, 1); run(s, 1); types(s);
  tapHead(s, 1);
  assert.ok(types(s).includes('water'));
  assert.equal(s.patches[1].stage, S.SPROUT, 'grew before the water landed');
  run(s, S.T.water + 0.1);
  assert.equal(s.patches[1].stage, S.BUD);
  run(s, 0.3); types(s);
  const before = s.creatures.length;
  tapHead(s, 1);
  assert.equal(s.patches[1].stage, S.BLOOM);
  const ev = types(s);
  assert.ok(ev.includes('bloom') && ev.includes('arrive'), ev.join(','));
  assert.equal(s.creatures.length, before + 1);
});

test('a bloom giggles and sings its own note when tapped, and every third tickle brings a friend', () => {
  const s = play();
  s.patches[2].stage = S.BLOOM; s.patches[2].kind = 'daisy';
  let arrivals = 0;
  for (let k = 0; k < 6; k++) { tapHead(s, 2); const ev = s.events.splice(0); assert.ok(ev.some(e => e.type === 'tickle' && e.color)); arrivals += ev.filter(e => e.type === 'arrive').length; run(s, 0.3); }
  assert.equal(s.patches[2].mood === 'giggle' || s.patches[2].wiggle > 0, true);
  assert.ok(arrivals >= 1, 'no friend came');
});

test('plants keep growing by themselves, so the garden never stands still', () => {
  const s = play();
  tapPatch(s, 0);
  run(s, S.T.seed + S.T.autoBud + S.T.autoBloom + 1);
  assert.equal(s.patches[0].stage, S.BLOOM);
});

test('the seed button plants every empty patch and the can button waters every sprout and bud', () => {
  const s = play();
  S.tap(s, s.L.buttons.seed.x, s.L.buttons.seed.y);
  assert.ok(s.patches.every(p => p.stage === S.SEED));
  run(s, 2);
  assert.ok(s.patches.every(p => p.stage === S.SPROUT));
  types(s);
  assert.equal(S.tap(s, s.L.buttons.can.x, s.L.buttons.can.y), 'can');
  assert.equal(types(s).filter(e => e === 'water').length, s.patches.length);
  run(s, S.T.water + 0.35 * s.patches.length + 0.2);
  assert.ok(s.patches.every(p => p.stage === S.BUD), s.patches.map(p => p.stage).join());
});

test('a full garden throws a party, puffs into dandelion seeds and starts a new round', () => {
  const s = play();
  const kinds0 = s.patches.map(p => p.kind).join();
  s.patches.forEach(p => { p.stage = S.BUD; p.t = 99; });
  run(s, 0.05);
  assert.equal(s.phase, 'party');
  assert.equal(s.parties, 1);
  run(s, S.T.party + 0.2);
  const ev = types(s);
  assert.ok(ev.includes('party') && ev.includes('firework') && ev.includes('puff') && ev.includes('partyEnd'), ev.join(','));
  assert.equal(s.phase, 'play');
  assert.ok(s.patches.every(p => p.stage === S.EMPTY));
  assert.equal(s.round, 1);
  // a new round can bring different flowers in different places
  let changed = false; for (let k = 0; k < 4 && !changed; k++) { s.patches.forEach(p => { p.stage = S.BUD; p.t = 99; }); run(s, S.T.party + 0.3); changed = s.patches.map(p => p.kind).join() !== kinds0; }
  assert.ok(changed, 'the flowers never changed');
});

test('during the party flowers still giggle when tapped, and nothing new can be planted until it ends', () => {
  const s = play();
  s.patches.forEach(p => { p.stage = S.BUD; p.t = 99; }); run(s, 0.05); types(s);
  tapHead(s, 0);
  assert.ok(types(s).includes('tickle'));
  assert.equal(s.phase, 'party');
});

test('tap a cloud: it rains, everything planted grows a step, and a rainbow follows', () => {
  const s = play();
  tapPatch(s, 0); run(s, 1);
  s.patches[1].stage = S.BUD;
  const c = s.clouds[0];
  assert.equal(S.tap(s, c.x, c.y), 'cloud');
  assert.ok(s.rainT > 0);
  run(s, S.T.rain + 0.1);
  assert.equal(s.patches[0].stage, S.BUD);
  assert.equal(s.patches[1].stage, S.BLOOM);
  assert.equal(s.patches[2].stage, S.EMPTY, 'rain planted a seed by itself');
  assert.ok(s.rainbowT > 0 && types(s).includes('rainbow'));
  run(s, S.T.rainbow + 1);
  assert.equal(s.rainbowT <= 0, true);
});

test('the sun giggles and spins, apples drop and grow back, mushrooms boing, grass sprouts little flowers, the sky twinkles', () => {
  const s = play();
  assert.equal(S.tap(s, s.L.sun.x, s.L.sun.y), 'sun'); assert.ok(s.sunSpin > 0.9 && s.sunMood === 'giggle');
  const a = s.L.appleSpots[0];
  assert.equal(S.tap(s, a.x, a.y), 'apple'); assert.equal(s.apples[0].has, false); assert.ok(find(s, 'apple'));
  run(s, 7); assert.equal(s.apples[0].has, true); assert.ok(!find(s, 'apple'), 'the fallen apple never went away');
  const m = s.L.mushrooms[0];
  assert.equal(S.tap(s, m.x, m.y - 20 * m.s), 'mushroom'); assert.ok(s.mushroomSquash[0] > 0.9);
  assert.equal(S.tap(s, s.L.W * 0.27, s.L.H * 0.62), 'grass'); assert.equal(s.wild.length, 1);
  for (let k = 0; k < 40; k++) S.tap(s, s.L.W * (0.25 + (k % 5) * 0.003), s.L.H * 0.62);
  assert.equal(s.wild.length, 24, 'wildflowers should be capped');
  assert.equal(S.tap(s, s.L.W * 0.5, s.L.H * 0.3), 'sky');
});

test('every visitor answers a tap', () => {
  const s = play();
  const poke = (kind, prep) => {
    const c = find(s, kind) || S.add(s, kind, prep?.o || {});
    prep?.fn?.(c);
    const y = kind === 'bunny' || kind === 'snail' || kind === 'frog' ? c.y - 30 * s.L.ps : kind === 'worm' ? c.y - 28 * s.L.ps : kind === 'balloon' ? c.y + 20 * s.L.ps : c.y;
    const what = S.tap(s, c.x, y);
    assert.equal(what, kind, `${kind} at ${Math.round(c.x)},${Math.round(c.y)} was not hit (got ${what})`);
    return c;
  };
  const b = poke('butterfly', { fn: c => { c.x = 640; c.y = 200; c.tx = 640; c.ty = 200; } }); assert.equal(b.s, 'loop');
  const bee = poke('bee', { fn: c => { c.x = 400; c.y = 180; c.tx = 400; c.ty = 180; } }); assert.equal(bee.s, 'loop');
  const bird = S.add(s, 'bird'); bird.s = 'perch'; bird.x = 700; bird.y = s.L.fenceTop; bird.stay = 99; bird.next = 99;
  assert.equal(S.tap(s, bird.x, bird.y), 'bird'); assert.equal(bird.s, 'flyoff');
  const lb = poke('ladybug'); assert.equal(lb.s, 'flyup');
  const sn = poke('snail'); assert.equal(sn.s, 'hide');
  const bn = find(s, 'bunny'); bn.s = 'sit'; bn.t = 0; bn.sitFor = 9; bn.x = s.L.walks[0][0] + 50; bn.y = s.L.walkY;
  assert.equal(S.tap(s, bn.x, bn.y - 30 * s.L.ps), 'bunny'); assert.equal(bn.s, 'jump');
  const fr = poke('frog'); assert.equal(fr.s, 'jump'); run(s, 1); assert.equal(fr.s, 'sit'); assert.equal(fr.pad, 1);
  const w = S.add(s, 'worm', { patch: 2 }); assert.equal(S.tap(s, w.x, w.y - 28 * s.L.ps), 'worm'); assert.equal(w.s, 'down');
  const bu = S.add(s, 'bubble'); bu.y = 400; bu.x = 60; const nb = s.creatures.length; assert.equal(S.tap(s, bu.x, bu.y), 'bubble'); run(s, 0.02); assert.ok(!s.creatures.includes(bu));
  // the balloon drops seeds into every empty patch
  s.patches[0].stage = S.BLOOM;
  const bl = S.add(s, 'balloon'); bl.x = 640; types(s);
  assert.equal(S.tap(s, bl.x, bl.y + 20 * s.L.ps), 'balloon');
  const ev = types(s);
  assert.ok(ev.includes('gift'));
  assert.equal(s.patches.filter(p => p.stage === S.SEED).length, s.patches.length - 1);
  assert.equal(s.patches[0].stage, S.BLOOM);
  run(s, 2); assert.ok(s.patches.slice(1).every(p => p.stage === S.SPROUT));
});

test('a toddler who stops gets a hint, and any tap clears it', () => {
  const s = play();
  run(s, S.T.hint + 0.2);
  assert.ok(s.hint && s.hint.i === 0);
  S.tap(s, 640, 200);
  assert.equal(s.hint, null);
});

test('turning the screen keeps visitors in proportion and changes the number of patches', () => {
  const s = play();
  run(s, 3);
  S.resize(s, 390, 844);
  assert.equal(s.patches.length, 4);
  run(s, 10);
  for (const c of s.creatures) if (c.kind !== 'balloon' && c.kind !== 'bird' && c.kind !== 'butterfly' && c.kind !== 'bee') assert.ok(c.x > -20 && c.x < 410 && c.y > -20 && c.y < 870, `${c.kind} at ${c.x},${c.y}`);
  S.resize(s, 1280, 720);
  assert.equal(s.patches.length, 5);
  assert.equal(tapPatch(s, 4), 'plant');
});

test('ten minutes of wild tapping: nothing breaks, visitors stay within limits, parties keep coming', () => {
  for (const seed of [1, 2, 3]) {
    const s = S.createSim({ seed, phase: 'play', W: 1280, H: 720 });
    let rnd = seed * 99991;
    const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    let maxB = 0, maxBee = 0;
    for (let f = 0; f < 60 * 600; f++) {
      if (f % 9 === 0) S.tap(s, r() * 1280, r() * 720);
      if (f % 31 === 0) { const i = (r() * s.patches.length) | 0; tapPatch(s, i); tapHead(s, i); }
      S.step(s, 1 / 60);
      s.events.length = 0;
      if (f % 60 === 0) {
        for (const c of s.creatures) assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), `${c.kind} has a bad position`);
        maxB = Math.max(maxB, s.creatures.filter(c => c.kind === 'butterfly' && c.s !== 'leave').length);
        maxBee = Math.max(maxBee, s.creatures.filter(c => c.kind === 'bee' && c.s !== 'leave').length);
        assert.ok(s.creatures.length < 40, `${s.creatures.length} creatures`);
      }
    }
    assert.ok(s.parties >= 5, `only ${s.parties} parties in ten minutes`);
    assert.ok(maxB <= 5 && maxBee <= 3, `butterflies ${maxB}, bees ${maxBee}`);
    assert.ok(s.visitors > 10);
  }
});

test('the same seed gives the same garden', () => {
  const a = play({ seed: 9 }), b = play({ seed: 9 });
  run(a, 30); run(b, 30);
  assert.deepEqual(S.snapshot(a), S.snapshot(b));
});
