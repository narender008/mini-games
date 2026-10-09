// A stand-in player for testing and balancing (?debug only): steers toward
// the thickest column of the horde while keeping clear of claws and shots,
// throws bombs into crowds, raises the shield when cornered, picks upgrade
// cards by a simple priority and claims rewards. `sim` runs a whole chapter
// as fast as the CPU allows (no drawing) and reports how it went.
import { ARENA, BAND, STEP, clamp } from './config.js';
import { TYPES } from './game/enemies.js';

const PRIORITY = ['railgun', 'stormcaller', 'carpetbomb', 'multishot', 'damage', 'firerate', 'pierce', 'crit', 'maxhp', 'explosive', 'chain', 'regen', 'speed', 'magnet', 'knockback', 'cooldown', 'freezer', 'bombup', 'shieldup'];

export function pilot(run, skill = 1) {
  const h = run.hero;
  const E = run.enemies;
  if (!h.alive) return;
  // score each lane by how many creatures are up the road in it, minus danger close by
  let bestX = h.x;
  let best = -1e9;
  for (let lx = 60; lx <= ARENA.w - 60; lx += 30) {
    let score = 0;
    for (let k = 0; k < E.n; k++) {
      const i = E.list[k];
      const dx = Math.abs(E.x[i] - lx);
      if (dx < 50 && E.y[i] < h.y - 120) score += 1 + (E.type[i] === 2 ? 2 : 0);
      const dy = h.y - E.y[i];
      if (dx < 70 && dy < 230 && dy > -60) score -= 12 * skill;
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
    score -= Math.abs(lx - h.x) * 0.01;
    if (score > best) {
      best = score;
      bestX = lx;
    }
  }
  // the boss's charge lane and slam circle
  if (run.boss && E.alive[run.boss.i]) {
    const b = run.boss;
    if (b.state === 'charge_wind' || b.state === 'charge') bestX = Math.abs(h.x - b.lockX) < 160 ? (b.lockX > ARENA.w / 2 ? b.lockX - 260 : b.lockX + 260) : bestX;
    if (b.state === 'slam_wind') bestX = b.slamX > ARENA.w / 2 ? 70 : ARENA.w - 70;
  }
  run.target.x = clamp(bestX, BAND.x0, BAND.x1);
  run.target.y = BAND.y1 - 30;
  // abilities
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
  if (E.n > 40 && run.abil.lightning.charges > 0) run.useAbility('lightning');
  if (near >= 18 && run.abil.freeze.charges > 0) run.useAbility('freeze', cx / near, cy / near);
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
    while (run.pendingLevels > 0 || run.pendingChests > 0) {
      const cards = run.cards();
      if (!cards.length) break;
      run.pick(cards[pickCard(cards)]);
      if (run.pendingLevels > 0) run.pendingLevels--;
      else run.pendingChests--;
    }
    if (run.phase === 'reward') {
      log.push({ wave: run.wave + 1, secs: +(run.time - waveStart).toFixed(1), level: run.level, hp: Math.round(run.hero.hp), minHp: Math.round(minHp), hits: run.hitsTaken, kills: run.kills, peak: app.simPeak || 0, weapons: run.weapons.map((w) => `${w.id}*${w.stars}`).join(' ') });
      minHp = run.hero.hp;
      app.simPeak = 0;
      run.claimReward();
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
