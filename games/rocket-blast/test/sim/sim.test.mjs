// Headless tests for the Ace Pilot sim (games/rocket-blast/src/ace/sim/).
//   node --test games/rocket-blast/test/sim/
// The long balance run is bot.mjs; this file checks the contract the view,
// UI and controller rely on, the rules, determinism and fairness guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAce, stepAce, setField, chooseUpgrade, reroll, autopilot, autopilotPick, SECTORS, ENEMIES, UPGRADES, BOSSES, WAVES } from '../../src/ace/sim/index.js';
import { shoot, MAX_BULLETS, SAFE_SPAWN } from '../../src/ace/sim/patterns.js';
import { spawnEnemy } from '../../src/ace/sim/enemies.js';
import { zone } from '../../src/ace/sim/player.js';

const LAPTOP = { halfW: 15.84, halfH: 9.9 };
const PHONE = { halfW: 6.7, halfH: 14.5 };
const DT = 1 / 120;

function run(S, seconds, input = null, onStep) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    if (S.phase === 'upgrade') chooseUpgrade(S, autopilotPick(S));
    stepAce(S, input === 'auto' ? autopilot(S) : input, DT);
    if (onStep) onStep(S);
    S.events.length = 0;
    if (S.phase === 'dead' || S.phase === 'cleared') break;
  }
  return S;
}

// a controller-style direct upgrade outside an offer (see src/ace/ace.js)
function giveUpgrade(S, id) {
  const offer = S.offer;
  const phase = S.phase;
  S.offer = [{ id, rarity: 'common' }];
  S.phase = 'upgrade';
  chooseUpgrade(S, id);
  S.offer = offer;
  if (phase !== 'upgrade') S.phase = phase;
}

test('data: five sectors, eight waves each, known enemies and forms', () => {
  assert.equal(SECTORS.length, 5);
  for (const s of SECTORS) {
    for (const k of ['id', 'name', 'blurb', 'boss', 'bossName', 'threats', 'diff', 'par']) assert.ok(k in s, `${s.id}.${k}`);
    assert.ok(BOSSES[s.boss], s.boss);
    assert.equal(BOSSES[s.boss].name, s.bossName);
    const waves = WAVES[s.id];
    assert.equal(waves.length, 8, s.id);
    for (const w of waves) {
      assert.ok(w.length >= 6, `${s.id} wave has groups`);
      for (const g of w) {
        assert.ok(ENEMIES[g[1]], `${s.id}: ${g[1]}`);
        assert.ok(['v', 'col', 'line', 'pair', 'single', 'edges'].includes(g[2]), g[2]);
      }
    }
  }
  assert.equal(Object.keys(ENEMIES).length, 10);
  assert.deepEqual(UPGRADES.map((u) => u.id).sort(), ['afterburner', 'capacitor', 'drones', 'emp', 'magnet', 'missiles', 'overdrive', 'pierce', 'repair', 'spread']);
});

test('threats arrive one sector at a time', () => {
  const seen = new Set(['shard', 'mine']);
  for (const s of SECTORS) {
    for (const t of s.threats) seen.add(t);
    for (const w of WAVES[s.id]) for (const g of w) assert.ok(seen.has(g[1]), `${s.id} uses ${g[1]} before it is introduced`);
  }
});

test('createAce exposes the contract state', () => {
  const S = createAce({ seed: 3, sector: 2, field: LAPTOP });
  for (const k of ['phase', 'time', 'sector', 'wave', 'waves', 'field', 'player', 'enemies', 'bullets', 'shots', 'pickups', 'boss', 'score', 'chain', 'chainT', 'rank', 'stats', 'upgrades', 'offer', 'rerolls', 'events']) assert.ok(k in S, k);
  assert.equal(S.phase, 'intro');
  assert.equal(S.waves, 8);
  const P = S.player;
  for (const k of ['x', 'y', 'vx', 'vy', 'r', 'hull', 'hullMax', 'shield', 'shields', 'invuln', 'emp', 'drones', 'firing', 'dead']) assert.ok(k in P, k);
  assert.equal(P.hull, 3);
  assert.equal(P.emp, 2);
  assert.equal(P.r, 0.16);
  for (const k of ['kills', 'hits', 'grazes', 'shots', 'shotsHit', 'time', 'noHitWaves']) assert.ok(k in S.stats, k);
});

test('Math.random is never used', () => {
  const real = Math.random;
  Math.random = () => {
    throw new Error('Math.random called');
  };
  try {
    const S = createAce({ seed: 5, sector: 5, field: LAPTOP });
    run(S, 40, 'auto');
    const B = createAce({ seed: 5, sector: 5, field: PHONE, boss: true });
    run(B, 30, 'auto');
  } finally {
    Math.random = real;
  }
});

test('same seed, same game', () => {
  const a = run(createAce({ seed: 11, sector: 3, field: LAPTOP }), 60, 'auto');
  const b = run(createAce({ seed: 11, sector: 3, field: LAPTOP }), 60, 'auto');
  assert.equal(a.score, b.score);
  assert.equal(a.player.x, b.player.x);
  assert.equal(a.enemies.length, b.enemies.length);
});

test('flow: intro, wave, upgrade offer, pick, next wave', () => {
  const S = createAce({ seed: 2, sector: 1, field: LAPTOP });
  const types = [];
  let offered = null;
  for (let i = 0; i < 120 * 120 && !offered; i++) {
    stepAce(S, autopilot(S), DT);
    for (const e of S.events) {
      types.push(e.type);
      assert.equal(typeof e.x, 'number', `${e.type}.x`);
      assert.equal(typeof e.y, 'number', `${e.type}.y`);
    }
    S.events.length = 0;
    if (S.phase === 'upgrade') offered = S.offer;
  }
  assert.ok(types.includes('waveStart') && types.includes('waveClear') && types.includes('spawn') && types.includes('kill'));
  assert.ok(offered, 'an offer after wave 1');
  assert.equal(offered.length, 3);
  assert.equal(new Set(offered.map((o) => o.id)).size, 3);
  for (const o of offered) assert.ok(['common', 'rare', 'legendary'].includes(o.rarity));
  // frozen while choosing
  const t = S.time;
  stepAce(S, null, 0.5);
  assert.equal(S.time, t);
  // reroll once
  assert.equal(S.rerolls, 1);
  assert.ok(reroll(S));
  assert.equal(S.rerolls, 0);
  assert.equal(reroll(S), false);
  assert.equal(chooseUpgrade(S, 'not-offered'), false);
  const pick = S.offer[0].id;
  assert.ok(chooseUpgrade(S, pick));
  assert.equal(S.phase, 'wave');
  run(S, 2);
  assert.equal(S.wave, 2);
});

test('offers never include maxed upgrades, repair only when damaged', () => {
  const S = createAce({ seed: 9, sector: 1, field: LAPTOP, upgrades: { overdrive: 3, spread: 3, pierce: 3, drones: 3, missiles: 3, capacitor: 3, magnet: 3 } });
  S.phase = 'upgrade';
  S.flow.k = 'pick';
  for (let i = 0; i < 30; i++) {
    S.offer = null;
    S.rerolls = 1;
    S.offer = [{ id: 'emp' }];
    reroll(S);
    for (const o of S.offer) {
      assert.ok(!['overdrive', 'spread', 'pierce', 'drones', 'missiles', 'capacitor', 'magnet', 'repair'].includes(o.id), o.id);
    }
  }
  S.player.hull = 1;
  let sawRepair = false;
  for (let i = 0; i < 40; i++) {
    S.rerolls = 1;
    reroll(S);
    if (S.offer.some((o) => o.id === 'repair')) sawRepair = true;
  }
  assert.ok(sawRepair);
});

test('direct upgrades from the controller keep the phase', () => {
  const S = createAce({ seed: 1, sector: 1, field: LAPTOP });
  run(S, 5);
  assert.equal(S.phase, 'wave');
  giveUpgrade(S, 'drones');
  giveUpgrade(S, 'emp');
  assert.equal(S.phase, 'wave');
  assert.equal(S.upgrades.drones, 1);
  assert.equal(S.player.drones.length, 2);
  assert.equal(S.player.emp, 3);
});

test('shield, hull, invulnerability and death', () => {
  const S = createAce({ seed: 1, sector: 1, field: LAPTOP });
  run(S, 3);
  const P = S.player;
  const hitAt = () => {
    P.invuln = 0;
    S.bullets.push({ x: P.x, y: P.y + 0.05, vx: 0, vy: 0, r: 0.2, kind: 'orb', color: 'magenta', t: 0, grazed: false, acc: 0, max: 0, home: 0, turn: 0, curve: 0, life: 0 });
    stepAce(S, null, DT);
  };
  hitAt();
  assert.equal(P.shields, 0, 'shield absorbs first');
  assert.equal(P.hull, 3);
  hitAt();
  assert.equal(P.hull, 2);
  assert.ok(P.invuln > 1.4);
  // invulnerable: a bullet passes through
  S.bullets.push({ x: P.x, y: P.y, vx: 0, vy: 0, r: 0.2, kind: 'orb', color: 'magenta', t: 0, grazed: false, acc: 0, max: 0, home: 0, turn: 0, curve: 0, life: 0 });
  stepAce(S, null, DT);
  assert.equal(P.hull, 2);
  hitAt();
  hitAt();
  assert.equal(P.hull, 0);
  assert.equal(S.phase, 'dead');
  assert.ok(P.dead);
  assert.equal(S.result.win, false);
});

test('shield recharges after 6 s without damage', () => {
  const S = createAce({ seed: 1, sector: 1, field: LAPTOP, god: true }); // god: no stray hit resets the timer
  const P = S.player;
  P.shields = 0;
  P.charge = 0;
  run(S, 5.9);
  assert.equal(P.shields, 0);
  run(S, 0.2);
  assert.equal(P.shields, 1);
});

test('god mode takes no damage', () => {
  const S = createAce({ seed: 1, sector: 5, field: LAPTOP, god: true });
  run(S, 90, null);
  assert.equal(S.player.hull, 3);
  assert.notEqual(S.phase, 'dead');
});

test('EMP clears bullets, damages enemies, is limited', () => {
  const S = createAce({ seed: 4, sector: 1, field: LAPTOP });
  run(S, 3);
  for (let i = 0; i < 40; i++) shoot(S, -5 + i * 0.25, 5, -Math.PI / 2, 3);
  const e = spawnEnemy(S, 'gunship', 0, 4, { kind: 'hover', hx: 0, hy: 4 });
  const hp = e.hp;
  stepAce(S, { emp: true }, DT);
  assert.equal(S.bullets.length, 0);
  assert.ok(e.hp < hp);
  assert.equal(S.player.emp, 1);
  stepAce(S, { emp: true }, DT);
  stepAce(S, { emp: true }, DT);
  assert.equal(S.player.emp, 0);
});

test('bullets never spawn on top of the player, and are capped', () => {
  const S = createAce({ seed: 1, sector: 1, field: LAPTOP });
  run(S, 3);
  const P = S.player;
  assert.equal(shoot(S, P.x + 0.3, P.y + 0.3, 0, 4), null);
  assert.ok(shoot(S, P.x, P.y + SAFE_SPAWN + 0.2, 0, 4));
  for (let i = 0; i < 2000; i++) shoot(S, 0, 5, i, 1);
  assert.equal(S.bullets.length, MAX_BULLETS);
});

test('the player stays in the lower part of the field', () => {
  for (const field of [LAPTOP, PHONE]) {
    const S = createAce({ seed: 1, sector: 1, field });
    run(S, 2, { x: 0, y: 100 });
    const Z = zone(S);
    assert.ok(Math.abs(S.player.y - Z.y1) < 1e-6);
    assert.ok(Z.y1 <= -field.halfH + field.halfH * 2 * 0.46);
    run(S, 2, { dx: -1, dy: -1 });
    assert.ok(Math.abs(S.player.x - Z.x0) < 1e-6 && Math.abs(S.player.y - Z.y0) < 1e-6);
  }
  const S = createAce({ seed: 1, sector: 1, field: LAPTOP });
  run(S, 2, { x: 15, y: -1 });
  setField(S, PHONE);
  assert.ok(S.player.x <= PHONE.halfW);
});

test('bulwark shield blocks cannon fire from below, pierce goes through', () => {
  const S = createAce({ seed: 1, sector: 3, field: LAPTOP });
  run(S, 3);
  S.queue = [];
  const e = spawnEnemy(S, 'bulwark', 0, 2, { kind: 'hover', hx: 0, hy: 2, stay: 99 });
  e.fireT = 99;
  const hp = e.hp;
  run(S, 0.5, { x: 0, y: -6, fire: true });
  assert.equal(e.hp, hp, 'body untouched');
  assert.ok(e.shield && e.shield.hp < e.shield.maxHp, 'shield took the hits');
  giveUpgrade(S, 'pierce');
  run(S, 0.5, { x: 0, y: -6, fire: true });
  assert.ok(e.hp < hp || e.dead, 'pierce reaches the body');
});

test('splitters break into three shards; mines burst into rings', () => {
  const S = createAce({ seed: 1, sector: 4, field: LAPTOP });
  run(S, 3);
  const e = spawnEnemy(S, 'splitter', 0, 3, { kind: 'hover', hx: 0, hy: 3 });
  e.hp = 0;
  stepAce(S, null, DT);
  assert.equal(S.enemies.filter((x) => x.type === 'shard').length, 3);
  const m = spawnEnemy(S, 'mine', 4, 3, { kind: 'free' });
  m.fuse = 1;
  const before = S.bullets.length;
  run(S, 1.2);
  assert.ok(m.dead);
  assert.ok(S.bullets.length >= before + 8);
});

test('every boss: enters, phases in order, dies, sector clears', () => {
  for (const sec of [1, 2, 3, 4, 5]) {
    for (const field of [LAPTOP, PHONE]) {
      const S = createAce({ seed: 2, sector: sec, field, boss: true, god: true });
      const phases = [];
      let started = false;
      let dead = false;
      for (let i = 0; i < 120 * 60 && S.phase !== 'cleared'; i++) {
        stepAce(S, { x: 0, y: -100, fire: false }, DT);
        for (const e of S.events) {
          if (e.type === 'bossStart') started = true;
          if (e.type === 'bossPhase') phases.push(e.phase);
          if (e.type === 'bossDead') dead = true;
        }
        S.events.length = 0;
        const B = S.boss;
        // shoot it down part by part, in the order the phases open them
        if (B && !B.entering && i % 120 === 0) {
          const p = B.parts.find((x) => x.vuln && !x.dead && x.maxHp > 0);
          if (p) p.hp = Math.max(0, p.hp - p.maxHp * 0.6);
        }
      }
      assert.ok(started, `boss ${sec} starts`);
      assert.deepEqual(phases, Array.from({ length: BOSSES[SECTORS[sec - 1].boss].phases - 1 }, (_, i) => i + 2), `boss ${sec} phases`);
      assert.ok(dead, `boss ${sec} dies`);
      assert.equal(S.phase, 'cleared');
      assert.equal(S.result.win, true);
      for (const p of S.boss.parts) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
        assert.ok(Math.abs(p.x) < field.halfW + 1, `${p.id} inside the field`);
      }
    }
  }
});

test('boss parts hold until their phase', () => {
  const S = createAce({ seed: 1, sector: 3, field: LAPTOP, boss: true, god: true });
  run(S, 8);
  const core = S.boss.parts.find((p) => p.id === 'core');
  assert.equal(core.vuln, false);
  const hp = core.hp;
  S.shots.push({ id: 1, x: core.x, y: core.y - 0.5, vx: 0, vy: 30, kind: 'cannon', dmg: 5, t: 0, pierce: 0, hitId: 0, target: null, r: 0.16 });
  stepAce(S, null, DT);
  assert.equal(core.hp, hp);
});

test('chain builds on kills, halves on a hit', () => {
  const S = createAce({ seed: 1, sector: 1, field: LAPTOP });
  run(S, 3);
  for (let i = 0; i < 12; i++) {
    const e = spawnEnemy(S, 'dart', 0, 5, { kind: 'drop', vy: 0 });
    e.hp = 0;
    stepAce(S, null, DT);
  }
  assert.ok(S.chain >= 4, `chain ${S.chain}`);
  const c = S.chain;
  S.player.shields = 0;
  S.player.invuln = 0;
  S.bullets.push({ x: S.player.x, y: S.player.y, vx: 0, vy: 0, r: 0.2, kind: 'orb', color: 'magenta', t: 0, grazed: false, acc: 0, max: 0, home: 0, turn: 0, curve: 0, life: 0 });
  stepAce(S, null, DT);
  assert.equal(S.chain, c >> 1);
});

test('stepping is cheap', () => {
  const S = createAce({ seed: 1, sector: 5, field: LAPTOP, god: true });
  const t0 = performance.now();
  run(S, 120, { x: 0, y: -8, fire: true });
  const ms = performance.now() - t0;
  assert.ok(ms < 4000, `120 s of sector 5 took ${ms.toFixed(0)} ms`);
});

test('the autopilot clears sector 1 on both fields', () => {
  for (const field of [LAPTOP, PHONE]) {
    const S = run(createAce({ seed: 7920, sector: 1, field }), 900, 'auto');
    assert.equal(S.phase, 'cleared', `sector 1 on ${field.halfW}`);
    assert.ok(['S', 'A', 'B', 'C'].includes(S.rank));
    assert.ok(S.stats.time > 240 && S.stats.time < 480, `sector time ${S.stats.time}`);
  }
});
