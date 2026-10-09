// A stand-in player for testing and balancing (?debug only): steers toward
// the thickest column of the horde while keeping clear of claws and shots,
// throws bombs into crowds, raises the shield when cornered or under a
// barrage, picks upgrade cards by a simple priority in the break after each
// wave and claims rewards. skill < 1 is a weaker player: it rethinks its lane
// less often (a human's reaction time), weighs danger less and wanders. `sim`
// runs a whole chapter as fast as the CPU allows (no drawing).
import { ARENA, BAND, FIELD, STEP, clamp } from './config.js';
import { TYPES } from './game/enemies.js';
import { CRATE, CRATE_GUNS } from './game/pools.js';

// how the pilot rates guns: a crate is worth taking for a star on the gun in
// hand, or for a gun it rates above the one it holds (counting stars)
const GUN_RANK = { blaster: 1.05, scatter: 0.95, rocket: 1.1, flamer: 1 };
function wantCrate(run, id) {
  if (id === run.held) return run.arms[id] < 3;
  // the flamethrower cannot reach the boss
  if (run.boss && run.enemies.alive[run.boss.i]) return id !== 'flamer' && (run.held === 'flamer' || run.arms[id] > run.arms[run.held]);
  const mine = GUN_RANK[run.held] * (1 + 0.6 * run.arms[run.held]);
  const theirs = GUN_RANK[id] * (1 + 0.6 * Math.max(1, run.arms[id]));
  return theirs > mine;
}

const PRIORITY = ['railgun', 'stormcaller', 'carpetbomb', 'multishot', 'damage', 'firerate', 'pierce', 'crit', 'maxhp', 'explosive', 'chain', 'regen', 'speed', 'magnet', 'knockback', 'cooldown', 'freezer', 'bombup', 'shieldup'];

export function pilot(run, skill = 1) {
  const h = run.hero;
  const E = run.enemies;
  if (!h.alive) return;
  // a weaker player decides less often and less precisely
  run.botT = (run.botT || 0) - 1 / 60;
  if (run.botT > 0) {
    abilities(run, h, E);
    return;
  }
  run.botT = skill >= 1 ? 0 : 0.12 + (1 - skill) * 0.9;
  // score each lane by how many creatures are up the road in it, minus danger close by
  // (creatures are binned into 30-unit columns once, so a wide field stays cheap)
  const cols = Math.ceil(ARENA.w / 30) + 1;
  if (!run.botCols || run.botCols.length < cols * 2) run.botCols = new Float32Array(cols * 2 + 8);
  const C = run.botCols;
  C.fill(0);
  for (let k = 0; k < E.n; k++) {
    const i = E.list[k];
    const c = clamp(Math.floor(E.x[i] / 30), 0, cols - 1);
    if (E.y[i] < h.y - 120) C[c * 2] += 1 + (E.type[i] === 2 ? 2 : 0);
    const dy = h.y - E.y[i];
    if (dy < 230 && dy > -60) C[c * 2 + 1] += 1;
  }
  // crates: go for a star on the gun in hand or a better gun, keep clear of the rest; surge orbs are always welcome
  const P = run.pickups;
  const bossX = run.boss && E.alive[run.boss.i] && run.boss.state !== 'enter' ? E.x[run.boss.i] : null;
  let bestX = h.x;
  let best = -1e9;
  for (let lx = 60; lx <= ARENA.w - 60; lx += 30) {
    const c = Math.floor(lx / 30);
    let score = 0;
    for (let d = -2; d <= 2; d++) {
      const cc = c + d;
      if (cc < 0 || cc >= cols) continue;
      if (d >= -1 && d <= 1) score += C[cc * 2];
      score -= 12 * skill * C[cc * 2 + 1];
    }
    // shots heading into this lane
    const S = run.shots;
    for (let k = 0; k < S.n; k++) {
      const t = (h.y - 30 - S.y[k]) / (S.vy[k] || 1);
      if (t > 0 && t < 1.2) {
        const xa = S.x[k] + S.vx[k] * t;
        if (Math.abs(xa - lx) < 40) score -= 20 * skill;
      }
    }
    for (let k = 0; k < P.n; k++) {
      if (P.y[k] < BAND.y0 - 260 || Math.abs(P.x[k] - lx) > 60) continue;
      if (P.kind[k] === CRATE) score += wantCrate(run, CRATE_GUNS[P.w[k]]) ? 40 : -40;
      else if (P.kind[k] > CRATE) score += 25;
    }
    score -= (Math.abs(lx - h.x) * 0.01) / FIELD.s;
    // a player stays under the boss to hit it (its charge and slam are dodged below)
    if (bossX !== null && Math.abs(lx - bossX) < 110) score += 30 * skill + 10;
    if (score > best) {
      best = score;
      bestX = lx;
    }
  }
  // the last stragglers of a wave: go and shoot them rather than keep clear
  if (run.mopUp && E.n) {
    let nd = 1e9;
    for (let k = 0; k < E.n; k++) {
      const i = E.list[k];
      const d = Math.abs(E.x[i] - h.x) + Math.max(0, E.y[i] - (h.y - 300)) * 2;
      if (d < nd) {
        nd = d;
        bestX = E.x[i] + (E.y[i] > h.y - 200 ? (E.x[i] > h.x ? -140 : 140) : 0);
      }
    }
  }
  // the boss's charge lane and slam circle
  if (run.boss && E.alive[run.boss.i]) {
    const b = run.boss;
    if (b.state === 'charge_wind' || b.state === 'charge') bestX = Math.abs(h.x - b.lockX) < 160 ? (b.lockX > ARENA.w / 2 ? b.lockX - 260 : b.lockX + 260) : bestX;
    if (b.state === 'slam_wind') bestX = b.slamX > ARENA.w / 2 ? 70 : ARENA.w - 70;
  }
  if (skill < 1) bestX += (Math.random() - 0.5) * 160 * FIELD.s * (1 - skill);
  run.target.x = clamp(bestX, BAND.x0, BAND.x1);
  // the flamethrower is short: step up the band to reach
  run.target.y = run.held === 'flamer' ? BAND.y0 + 50 : BAND.y1 - 30;
  abilities(run, h, E);
}

function abilities(run, h, E) {
  let near = 0;
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < E.n; k++) {
    const i = E.list[k];
    const dx = E.x[i] - h.x;
    const dy = E.y[i] - h.y;
    if (dx * dx + dy * dy < 300 * 300) {
      near++;
      cx += E.x[i];
      cy += E.y[i];
    }
  }
  if (near >= 10 && run.abil.bomb.charges > 0) run.useAbility('bomb', cx / near, cy / near);
  // shots about to land: a human raises the shield against a barrage
  let incoming = 0;
  const S = run.shots;
  for (let k = 0; k < S.n; k++) {
    const dx = h.x - S.x[k];
    const dy = h.y - 30 - S.y[k];
    const d = Math.hypot(dx, dy);
    if (d < 260 && (dx * S.vx[k] + dy * S.vy[k]) / (d || 1) > 150) incoming++;
  }
  if ((h.hp < run.stats.maxHp * 0.45 && near >= 4) || near >= 25 || incoming >= 4) run.useAbility('shield');
}

export function pickCard(cards) {
  let k = 0;
  let bestP = 1e9;
  cards.forEach((c, i) => {
    const p = PRIORITY.indexOf(c.id);
    if (p >= 0 && p < bestP) {
      bestP = p;
      k = i;
    }
  });
  return k;
}

// Plays the chapter from the current state; returns a log per wave.
export function sim(app, maxSeconds = 900, skill = 1) {
  const run = app.run;
  const E = run.enemies;
  const log = [];
  let waveStart = run.time;
  let lastWave = run.wave;
  let minHp = run.hero.hp;
  let t = 0;
  const t0 = performance.now();
  while (t < maxSeconds) {
    pilot(run, skill);
    run.step(STEP);
    t += STEP;
    minHp = Math.min(minHp, run.hero.hp);
    if (run.phase === 'reward') {
      log.push({ wave: run.wave + 1, secs: +(run.time - waveStart).toFixed(1), level: run.level, hp: Math.round(run.hero.hp), minHp: Math.round(minHp), hits: run.hitsTaken, kills: run.kills, peak: app.simPeak || 0, weapons: run.weapons.map((w) => `${w.id}*${w.stars}`).join(' ') });
      minHp = run.hero.hp;
      app.simPeak = 0;
      run.claimReward();
      // the banked level-ups are picked in the break, as a player does
      while (run.pendingLevels > 0 || run.pendingChests > 0) {
        const cards = run.cards();
        if (!cards.length) break;
        run.pick(cards[pickCard(cards)]);
        if (run.pendingLevels > 0) run.pendingLevels--;
        else run.pendingChests--;
      }
      run.nextWave();
      waveStart = run.time;
      if (run.phase === 'victory') break;
    }
    if (run.wave !== lastWave) lastWave = run.wave;
    app.simPeak = Math.max(app.simPeak || 0, run.enemies.n);
    if (!run.hero.alive && run.phase === 'dead') {
      const near = [];
      for (let k = 0; k < E.n; k++) {
        const i = E.list[k];
        if (Math.hypot(E.x[i] - run.hero.x, E.y[i] - run.hero.y) < 200) near.push(TYPES[E.type[i]].key + (E.elite[i] ? '*' : '') + ':' + Math.round(E.hp[i]));
      }
      log.push({ near: near.join(','), shots: run.shots.n, enemies: E.n, died: true, wave: run.wave + 1, secs: +(run.time - waveStart).toFixed(1), level: run.level, hits: run.hitsTaken, kills: run.kills, bossHp: run.boss && run.enemies.alive[run.boss.i] ? +(run.enemies.hp[run.boss.i] / run.enemies.maxHp[run.boss.i]).toFixed(2) : null });
      break;
    }
  }
  return { log, level: run.level, upgrades: { ...run.levels }, evolved: Object.keys(run.evolved), cpuMs: Math.round(performance.now() - t0), types: TYPES.length };
}
