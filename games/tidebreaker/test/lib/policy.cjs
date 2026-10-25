// The bot's in-page brain. Each call runs inside the browser against the
// frozen sim: read __tb.state(), hold an input, step, and on the card screen
// pick by the build's rule. It keeps its run log on window.__bot so a run can
// be advanced in slices without a long-running evaluate.

function botInit(cfg) {
  const tb = window.__tb;
  let a = cfg.seed * 9301 + 49297 | 0;
  const rnd = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.__bot = { cfg, rnd, log: { picks: [], waves: [], bossAt: null, bosses: [], abilities: {}, hpLow: Infinity, end: null, shots0: 0 }, reaction: 0, target: null, aimOff: { x: 0, y: 0 } };
  tb.freeze();
  return tb.state();
}

function botRun(sliceSec) {
  const tb = window.__tb, B = window.__bot, cfg = B.cfg, L = B.log;
  const dt = cfg.tickMs;
  const re = (p) => new RegExp(p, 'i');
  const pick = (offer, upgrades) => {
    if (!offer || !offer.length) return 0;
    const ids = offer.map((c) => (typeof c === 'string' ? c : c.id || c.name || String(c)));
    if (cfg.build.rule === 'first') return 0;
    if (cfg.build.rule === 'last') return ids.length - 1;
    if (cfg.build.rule === 'random') return Math.floor(B.rnd() * ids.length);
    for (const p of cfg.build.prefer || []) {
      const i = ids.findIndex((id) => id === p || re(`^(?:${p})$`).test(id));
      if (i >= 0) return i;
    }
    // stack what we already have, else the first
    const own = ids.findIndex((id) => upgrades.includes(id));
    return own >= 0 ? own : 0;
  };
  let s = tb.state();
  const end = s.time + sliceSec;
  while (s.time < end) {
    if (s.scene === 'won' || s.scene === 'lost') { L.end = s.scene; break; }
    if (s.scene === 'shop' || s.scene === 'title') { L.end = `left-run-${s.scene}`; break; }
    if (s.scene === 'cards') {
      const i = pick(s.cards, s.upgrades || []);
      const c = s.cards[i];
      L.picks.push({ t: s.time, wave: s.wave, id: typeof c === 'string' ? c : c.id || c.name });
      tb.choose(typeof c === 'string' ? c : (c.id ?? i));
      s = tb.state();
      continue;
    }
    const stage = s.stage ?? s.wave;
    if (stage != null && L.waves[L.waves.length - 1]?.stage !== stage) L.waves.push({ stage, leg: s.leg, node: s.node, wave: s.wave, t: s.time, hp: s.hp });
    if (s.boss && L.bossAt == null) L.bossAt = s.time;
    if (s.boss?.kind && !L.bosses.some((b) => b.kind === s.boss.kind)) L.bosses.push({ kind: s.boss.kind, t: s.time });
    if (s.hp != null && s.maxHp) L.hpLow = Math.min(L.hpLow, s.hp / s.maxHp);
    // choose a target: the boss if up, else the nearest enemy to the ship
    const p = s.player || { x: 200, y: 400 };
    const foes = (s.enemyList || []).filter((e) => e.hp == null || e.hp > 0);
    if (s.boss && s.boss.x != null) foes.push(s.boss);
    B.reaction -= dt;
    if (!B.target || B.reaction <= 0 || !foes.includes(B.target)) {
      let best = null, bd = Infinity;
      for (const e of foes) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
      B.target = best;
      B.reaction = cfg.reactionMs;
      B.aimOff = { x: (B.rnd() - 0.5) * 2 * cfg.aimNoise, y: (B.rnd() - 0.5) * 2 * cfg.aimNoise };
    }
    const t = B.target && foes.find((e) => (B.target.id != null ? e.id === B.target.id : e === B.target)) || B.target;
    // dodge: drift away from the closest incoming shot, else hold position
    let move = 0;
    if (cfg.dodge) for (const b of s.threats || []) { const lx = b.landX ?? b.x; if (Math.abs(lx - p.x) < 70 && (b.vy == null || b.vy > 0 || Math.abs(b.y - p.y) < 200)) { move = lx > p.x ? -1 : 1; if (p.x < 140) move = 1; if (p.x > 540) move = -1; break; } }
    let ax = t?.x, ay = t?.y;
    if (t && B.prev && B.prev.kind === t.kind && Math.hypot(B.prev.x - t.x, B.prev.y - t.y) < 30) { ax += (t.x - B.prev.x) * cfg.lead; ay += (t.y - B.prev.y) * cfg.lead; }
    B.prev = t ? { x: t.x, y: t.y, kind: t.kind } : null;
    // use abilities as they come ready, aimed at the target like the guns
    const ability = t && s.abilities ? Object.keys(s.abilities).find((k) => s.abilities[k].ready) : undefined;
    if (ability) L.abilities[ability] = (L.abilities[ability] || 0) + 1;
    tb.input(t ? { fire: true, aim: { x: ax + B.aimOff.x, y: ay + B.aimOff.y }, move, ability } : { fire: false, move });
    tb.step(dt, { render: false });
    s = tb.state();
    if (s.time > cfg.maxSec) { L.end = 'timeout'; break; }
  }
  if (s.scene === 'won' || s.scene === 'lost') L.end = s.scene;
  return { done: !!L.end, s: { scene: s.scene, time: s.time, wave: s.wave, stage: s.stage, leg: s.leg, node: s.node, gold: s.gold, hp: s.hp, maxHp: s.maxHp, score: s.score, shots: s.shots, hits: s.hits, upgrades: s.upgrades, boss: s.boss && { hp: s.boss.hp, maxHp: s.boss.maxHp } }, log: L };
}

module.exports = { botInit, botRun };
