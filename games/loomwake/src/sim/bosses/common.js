// Shared machinery for the boss fights: geometry against the hero, hitting the
// hero, telegraphs, arena hazards (G.zones entries with kind 'boss:*', which
// this module updates, damages with and removes; the engine only draws them),
// arena bounds and line picking. Sim only: no canvas, no DOM, G.rng.ai only.
//
// Hazard zone kinds (all carry team 'boss', dmg 0 for the engine, t 999,
// owner = boss id, life = seconds left, age = seconds alive, theme):
//   boss:spikeLine  { x, y, ang, len, w, speed, front, hold, power }  a lane of spikes erupting outward
//   boss:impact     { x, y, r, fall, item: 'glass'|'anvil'|'note' }    something falling from above, lands at age = fall
//   boss:wave       { x, y, r, speed, w, maxR, gaps: [{ a, arc }], spin } expanding ring; dash through
//   boss:pool       { x, y, r, tick }                                  molten / burning water patch
//   boss:flood      { x0, y0, x1, y1, warn, tick, slow }               a flooded floor section
//   boss:heat       { warn, safe: [{ x, y, r }], tick }                 the forge floor; only the safe circles are safe
//   boss:edge       { s, target, rate, tick }                          the arena edge closing in (thorns / unravelling)
//   boss:patch      { x, y, hw, warn, up }                             one square of the Regent's verdict
//   boss:slash      { x, y, x2, y2, w, warn, strike }                  one thread of Sable's storm
//   boss:beam       { x, y, ang, len, w, on }                          Morrow's lantern beam (visual; the move does the hit)
//   boss:tether     { a: id, b: id, on }                               Sable's snare thread (visual)
//   boss:burst      { x, y, r, warn, color }                           a delayed circle blast (mirrored powers)
import { onEvent as storyEvent } from '../story.js';
import { TAU, clamp, segDist, pointInPoly, wrapAng } from '../../core/math.js';
import { spawn as spawnFoe } from '../enemies/index.js';
import { hurtHero, telegraph as pushTelegraph, shoot as pushShot, addStatus, knock } from '../combat.js';

export const HR = () => 20;

// ---------- geometry against the hero ----------
export function heroAlive(G) { const h = G.hero; return !!h && !h.dead && h.hp > 0; }
export function dHero(G, x, y) { const h = G.hero; return Math.hypot(h.x - x, h.y - y); }
export function aHero(G, x, y) { const h = G.hero; return Math.atan2(h.y - y, h.x - x); }
export function inCircle(G, x, y, r) { return dHero(G, x, y) < r + (G.hero.r || 20); }
export function inLine(G, x, y, x2, y2, w) { const h = G.hero; return segDist(h.x, h.y, x, y, x2, y2) < w / 2 + (h.r || 20) * 0.7; }
export function inArc(G, x, y, r, ang, arc) {
  const d = dHero(G, x, y);
  if (d > r + (G.hero.r || 20)) return false;
  if (d < 30) return true;
  return Math.abs(wrapAng(aHero(G, x, y) - ang)) <= arc / 2 + 0.12;
}
export function inRing(G, x, y, r, w, gaps) {
  const d = dHero(G, x, y);
  if (Math.abs(d - r) > w / 2 + (G.hero.r || 20) * 0.75) return false;
  if (gaps && gaps.length) {
    const a = aHero(G, x, y);
    for (const g of gaps) if (Math.abs(wrapAng(a - g.a)) < g.arc / 2) return false;
  }
  return true;
}

// The hero is "dodging" while dash i-frames or hurt i-frames run.
export function heroInv(G) { const h = G.hero; return (h.inv || 0) > 0 || G.god; }

// Hit the hero once; returns true when the hit landed. opts: { kb, element, status: [name, t, power] }
export function hitHero(G, e, dmg, x, y, opts = {}) {
  if (!heroAlive(G)) return false;
  if ((G.hero.inv || 0) > 0) return false;
  const k = e && e.dmgMul ? e.dmgMul : 1;
  let landed = false;
  try { landed = (hurtHero(G, Math.round(dmg * k), { x, y, src: e, kind: 'boss', boss: e && e.kind, kb: opts.kb ?? 380, element: opts.element }) || 0) > 0; } catch (err) { landed = false; }
  if (landed && opts.status) { try { addStatus(G, G.hero, opts.status[0], opts.status[1], opts.status[2] ?? 1); } catch (err) { /* hero may not take statuses */ } }
  if (landed && e) { e.lastHitT = G.t; e.heroHits = (e.heroHits || 0) + 1; }
  return landed;
}

export function pushHero(G, dx, dy, power) {
  try { knock(G, G.hero, dx, dy, power); } catch (err) { /* ignore */ }
}

// ---------- telegraphs and shots ----------
// Every telegraph lasts at least cfg.minTelegraph. Returns the telegraph.
export function tele(G, e, o) {
  const min = (G.cfg && G.cfg.minTelegraph) || 0.35;
  // engine contract: tg.t is seconds until the hit (counts down to 0), max its full length
  const dur = Math.max(min, o.max ?? o.t ?? 0.6);
  const tg = Object.assign({ color: '#ff3d5e', owner: e ? e.id : 0, boss: e ? e.kind : null }, o);
  tg.t = dur; tg.max = dur;
  try { pushTelegraph(G, tg); } catch (err) { G.telegraphs.push(tg); }
  return tg;
}
export function clearTeles(G, e) {
  if (!G.telegraphs) return;
  for (let i = G.telegraphs.length - 1; i >= 0; i--) if (G.telegraphs[i].owner === e.id) G.telegraphs.splice(i, 1);
}
export function shot(G, e, o) {
  const p = Object.assign({ team: 'foe', z: 40, r: 10, dmg: 10, life: 3, pierce: false, owner: e.id, boss: e.kind, src: e }, o);
  if (e.dmgMul) p.dmg = Math.round(p.dmg * e.dmgMul);
  try { pushShot(G, p); } catch (err) { G.projectiles.push(p); }
  return p;
}
export function clearShots(G, e) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) if (G.projectiles[i].owner === e.id) G.projectiles.splice(i, 1);
}

// ---------- hazards ----------
export function hazard(G, e, kind, o) {
  const z = Object.assign({ kind: 'boss:' + kind, team: 'boss', dmg: 0, t: 999, owner: e.id, boss: e.kind, age: 0, life: 5, hit: false, theme: e.kind, dmgv: 12 }, o);
  G.zones.push(z);
  return z;
}
export function clearHazards(G, e, keep) {
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i];
    if (z.owner === e.id && (!keep || !keep(z))) G.zones.splice(i, 1);
  }
}
export function hazardsOf(G, e, kind) { const k = 'boss:' + kind; return G.zones.filter((z) => z.owner === e.id && z.kind === k); }

// Tick-damage helper: one hurt per `tick` seconds while inside.
function tickHurt(G, e, z, dmg, x, y, status) {
  z.tk = (z.tk || 0) - G.dtStep;
  if (z.tk > 0) return;
  if (hitHero(G, e, dmg, x, y, { kb: 120, status })) z.tk = z.tick || 0.4;
}

const HZ = {
  spikeLine(G, e, z, dt) {
    if (z.wait > 0) { z.wait -= dt; return; }
    const prev = z.front;
    z.front = Math.min(z.len, z.front + z.speed * dt);
    if (z.front >= z.len) z.hold -= dt;
    if (z.hold <= -0.35) z.life = 0;
    if (!z.hit && z.front > prev) {
      const back = Math.max(0, z.front - 200);
      const c = Math.cos(z.ang), s = Math.sin(z.ang);
      if (inLine(G, z.x + c * back, z.y + s * back, z.x + c * z.front, z.y + s * z.front, z.w)) {
        if (hitHero(G, e, z.dmgv, z.x + c * z.front, z.y + s * z.front, { kb: 420, element: z.theme === 'molten' ? 'fire' : null, status: z.theme === 'molten' ? ['burn', 2.5, 1] : null })) z.hit = true;
      }
    }
  },
  impact(G, e, z, dt) {
    if (!z.landed && z.age >= z.fall) {
      z.landed = true; z.life = 0.7;
      if (inCircle(G, z.x, z.y, z.r)) hitHero(G, e, z.dmgv, z.x, z.y, { kb: 360 });
      G.bus.emit('bossImpact', { id: e.kind, x: z.x, y: z.y, r: z.r, item: z.item });
      if (z.after) z.after(G, e, z);
    }
  },
  wave(G, e, z, dt) {
    const prev = z.r;
    z.r += z.speed * dt;
    if (z.spin) for (const g of z.gaps) g.a += z.spin * dt;
    if (z.r > z.maxR) z.life = 0;
    if (!z.hit && z.r > 10 && z.age >= (z.grace || 0)) {
      // swept test so a fast ring never skips over the hero
      const d = dHero(G, z.x, z.y), hr = G.hero.r || 20;
      const crossed = d + hr * 0.75 + z.w / 2 >= prev && d - hr * 0.75 - z.w / 2 <= z.r;
      if (crossed && inRing(G, z.x, z.y, clamp(d, prev, z.r), z.w, z.gaps)) {
        if (hitHero(G, e, z.dmgv, G.hero.x, G.hero.y, { kb: 340, element: z.element })) z.hit = true;
      }
    }
  },
  pool(G, e, z) {
    if (z.age > (z.warn || 0) && inCircle(G, z.x, z.y, z.r * 0.92)) tickHurt(G, e, z, z.dmgv, z.x, z.y, z.theme === 'aurum' ? ['burn', 2, 1] : ['slow', 0.6, 0.4]);
  },
  flood(G, e, z) {
    if (z.age < z.warn) return;
    const h = G.hero;
    if (h.x > z.x0 && h.x < z.x1 && h.y > z.y0 && h.y < z.y1) {
      tickHurt(G, e, z, z.dmgv, h.x, h.y, ['slow', 0.5, z.slow || 0.4]);
    }
  },
  heat(G, e, z) {
    if (z.age < z.warn) return;
    const h = G.hero;
    for (const s of z.safe) if (Math.hypot(h.x - s.x, h.y - s.y) < s.r - 6) return;
    tickHurt(G, e, z, z.dmgv, h.x, h.y, ['burn', 1.5, 1]);
  },
  edge(G, e, z, dt) {
    z.s += clamp(z.target - z.s, -z.rate * dt, z.rate * dt);
    const A = arena(G), h = G.hero;
    const nx = (h.x - A.cx) / (A.rx * z.s), ny = (h.y - A.cy) / (A.ry * z.s);
    const d = Math.hypot(nx, ny);
    if (d > 1) {
      tickHurt(G, e, z, z.dmgv, h.x, h.y);
      h.x -= (nx / d) * 160 * dt * (d - 0.98) * 6; h.y -= (ny / d) * 160 * dt * (d - 0.98) * 6;
    }
  },
  patch(G, e, z) {
    if (!z.hit && z.age >= z.warn && z.age < z.warn + 0.25) {
      const h = G.hero;
      if (Math.abs(h.x - z.x) < z.hw + 8 && Math.abs(h.y - z.y) < z.hw + 8) { if (hitHero(G, e, z.dmgv, z.x, z.y, { kb: 300 })) z.hit = true; }
    }
    if (z.age > z.warn + z.up) z.life = 0;
  },
  slash(G, e, z) {
    if (!z.hit && z.age >= z.warn && z.age < z.warn + 0.14) {
      if (inLine(G, z.x, z.y, z.x2, z.y2, z.w)) { if (hitHero(G, e, z.dmgv, G.hero.x, G.hero.y, { kb: 300 })) z.hit = true; }
    }
    if (!z.struck && z.age >= z.warn) { z.struck = true; G.bus.emit('bossSlash', { id: e.kind, x: z.x, y: z.y, x2: z.x2, y2: z.y2 }); }
  },
  burst(G, e, z) {
    if (!z.done && z.age >= z.warn) {
      z.done = true; z.life = 0.5;
      if (inCircle(G, z.x, z.y, z.r)) hitHero(G, e, z.dmgv, z.x, z.y, { kb: 420, element: z.element, status: z.status });
      G.bus.emit('explode', { x: z.x, y: z.y, r: z.r, element: z.element || 'void' });
    }
  },
  beam() {}, tether() {},
};

export function updateHazards(G, e, dt) {
  G.dtStep = dt;
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i];
    if (z.owner !== e.id || z.team !== 'boss') continue;
    z.age += dt; z.life -= dt;
    const fn = HZ[z.kind.slice(5)];
    if (fn && heroAlive(G) && !e.dying) fn(G, e, z, dt);
    else if (fn && z.kind === 'boss:wave') { z.r += z.speed * dt; }
    if (z.life <= 0) G.zones.splice(i, 1);
  }
}

// ---------- arena ----------
// The boss arena as an ellipse (centre and radii) from the chamber outline.
export function arena(G) {
  const c = G.chamber;
  if (c && c._bossArena) return c._bossArena;
  let A = { cx: 0, cy: 0, rx: 900, ry: 560 };
  if (c && c.shape && c.shape.length > 2) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of c.shape) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    A = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2 * 0.9, ry: (y1 - y0) / 2 * 0.9, shape: c.shape };
  }
  if (c) c._bossArena = A;
  return A;
}
export function insideArena(G, x, y, m = 0) {
  const A = arena(G);
  if (A.shape) return pointInPoly(x, y, A.shape) && ((x - A.cx) / (A.rx - m)) ** 2 + ((y - A.cy) / (A.ry - m)) ** 2 < 1.15;
  return ((x - A.cx) / (A.rx - m)) ** 2 + ((y - A.cy) / (A.ry - m)) ** 2 < 1;
}
// A random point inside the arena (ellipse fraction f), using G.rng.ai.
export function arenaPoint(G, f = 0.8) {
  const A = arena(G), r = G.rng.ai;
  for (let i = 0; i < 20; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * f;
    const x = A.cx + Math.cos(a) * A.rx * d, y = A.cy + Math.sin(a) * A.ry * d;
    if (insideArena(G, x, y, 40)) return { x, y };
  }
  return { x: A.cx, y: A.cy };
}
export function clampToArena(G, x, y, f = 0.85) {
  const A = arena(G);
  const nx = (x - A.cx) / (A.rx * f), ny = (y - A.cy) / (A.ry * f), d = Math.hypot(nx, ny);
  if (d <= 1) return { x, y };
  return { x: A.cx + (nx / d) * A.rx * f, y: A.cy + (ny / d) * A.ry * f };
}

// ---------- voice lines ----------
// History comes from the run/save helper: G.meta.stats.bossMeets[id] (meetings
// before this one), bossWins[id], bossLosses[id], lastRun { result, boss };
// reveals in G.meta.reveals (['sable', 'sleep', 'halves']), flags in G.meta.flags.
const SAID = new Map();
export function bossLog(G, id) {
  const st = (G.meta && G.meta.stats) || {};
  const lr = st.lastRun || null;
  if (!SAID.has(id)) SAID.set(id, []);
  return {
    met: (st.bossMeets && st.bossMeets[id]) || 0,
    wins: (st.bossWins && st.bossWins[id]) || 0,
    losses: (st.bossLosses && st.bossLosses[id]) || 0,
    lastLoss: !!(lr && lr.result === 'death' && lr.boss === id),
    said: SAID.get(id),
  };
}
const REVEAL_FLAGS = { reveal1: 'sable', reveal2: 'sleep', reveal3: 'halves' };
function flagOn(G, f) {
  const m = G.meta || {};
  if (REVEAL_FLAGS[f] && Array.isArray(m.reveals) && m.reveals.includes(REVEAL_FLAGS[f])) return true;
  const fl = m.flags;
  if (fl && (Array.isArray(fl) ? fl.includes(f) : fl[f])) return true;
  return !!(G.story && G.story.flags && G.story.flags[f]);
}
function hasPatron(G, p) {
  const b = (G.run && G.run.boons) || [];
  return b.some((x) => x.patron === p || (typeof x.id === 'string' && x.id.startsWith(p + '_')) || (typeof x.id === 'string' && x.id.startsWith(p + '.')));
}
function fits(G, e, w, log) {
  if (!w) return true;
  const inR = (v, r) => v >= r[0] && v <= r[1];
  if (w.met && !inR(e.meet ?? log.met, w.met)) return false;
  if (w.wins && !inR(log.wins, w.wins)) return false;
  if (w.losses && !inR(log.losses, w.losses)) return false;
  if (w.lastLoss && !log.lastLoss) return false;
  if (w.patron && !hasPatron(G, w.patron)) return false;
  if (w.flag && !flagOn(G, w.flag)) return false;
  if (w.noFlag && flagOn(G, w.noFlag)) return false;
  if (w.trueEnding != null && !!e.trueEnding !== w.trueEnding) return false;
  return true;
}
// Mid-fight barks go to the story system first (src/sim/story.js onEvent 'bossBark' {id, cue}); its
// lines know the whole save. It rate-limits itself, so when it stays quiet the boss's own pool speaks.
const STORY_CUE = { taunt: 'hurtHero', hurt: 'armor', heavy: 'heavy', low: 'low', summon: 'summon', idle: 'idle' };
function storyBark(G, e, trigger) {
  const cue = STORY_CUE[trigger];
  if (!cue) return null;
  try {
    const out = storyEvent(G, 'bossBark', { id: e.kind, cue });
    const r = out && out.find((x) => x && x.lines && x.lines.length);
    if (!r) return null;
    return { id: r.id, text: r.lines.map((l) => l.text).join(' '), mood: r.lines[0].mood, story: true };
  } catch (err) { return null; }
}
export function pickLine(G, e, trigger, def) {
  const sl = storyBark(G, e, trigger);
  if (sl) return sl;
  if (trigger === 'heavy' || trigger === 'low') trigger = 'hurt';
  try {
    if (G.story && typeof G.story.bossLine === 'function') {
      const l = G.story.bossLine(G, e.kind, trigger, e);
      if (l && l.text) return l;
      if (l === false) return null;
    }
  } catch (err) { /* fall back to the defaults */ }
  const pool = (def.lines && def.lines[trigger]) || [];
  const log = bossLog(G, e.kind);
  const ok = pool.filter((l) => fits(G, e, l.when, log));
  if (!ok.length) return null;
  const top = Math.max(...ok.map((l) => l.pri || 0));
  let best = ok.filter((l) => (l.pri || 0) === top);
  const fresh = best.filter((l) => l.id !== e.lastLine && !(trigger === 'intro' && log.said.includes(l.id) && l.pri === 0));
  if (fresh.length) best = fresh;
  return best[Math.floor(G.rng.ai() * best.length)];
}
// Set a mid-fight voice line on the boss (G.boss.bark) and announce it.
export function bark(G, e, trigger, def, opts = {}) {
  if (!opts.force && e.bark && e.bark.t > 0.6 && (e.bark.pri || 0) >= (opts.pri || 0)) return null;
  const l = pickLine(G, e, trigger, def);
  if (!l) return null;
  e.lastLine = l.id;
  e.bark = { text: l.text, mood: l.mood, t: opts.dur ?? Math.max(2.4, 1.2 + l.text.length * 0.055), max: 0, lineId: l.id, trigger, pri: opts.pri || 0, at: G.t };
  e.bark.max = e.bark.t;
  const log = bossLog(G, e.kind);
  if (!log.said.includes(l.id)) { log.said.push(l.id); if (log.said.length > 80) log.said.shift(); }
  G.bus.emit('bossBark', { id: e.kind, speaker: e.kind, lineId: l.id, text: l.text, mood: l.mood, trigger, source: l.story ? 'story' : 'boss' });
  return l;
}

// ---------- move helpers ----------
// Stage timing for a wind / act / rec move. Sets e.pose and e.pt; returns the stage
// ('wind' | 'act' | 'rec' | 'done'). Wind never drops below cfg.minTelegraph.
export function stage(G, e, a, m, scale = 1) {
  const min = (G.cfg && G.cfg.minTelegraph) || 0.35;
  const k = (e.tempo || 1);
  const W = Math.max(min, (m.wind * scale) / k), A = (m.act * scale) / k, R = (m.rec * scale) / k;
  a.W = W; a.A = A; a.R = R;
  const t = a.t;
  let s, p;
  if (t < W) { s = 'wind'; p = t / W; } else if (t < W + A) { s = 'act'; p = (t - W) / Math.max(1e-6, A); } else if (t < W + A + R) { s = 'rec'; p = (t - W - A) / Math.max(1e-6, R); } else { s = 'done'; p = 1; }
  e.pose = s === 'done' ? 'rec' : s; e.pt = clamp(p, 0, 1);
  return s;
}
// True the first time it is called with this key during the current move.
export function once(a, key) { if (a.once[key]) return false; a.once[key] = true; return true; }
// Pick a move from [[name, weight], ...], skipping those on cooldown.
export function choose(G, e, list) {
  const ok = list.filter(([n, w]) => w > 0 && (e.cd[n] == null || e.cd[n] <= G.t));
  if (!ok.length) return null;
  let s = 0; for (const [, w] of ok) s += w;
  let k = G.rng.ai() * s;
  for (const [n, w] of ok) { k -= w; if (k <= 0) return n; }
  return ok[ok.length - 1][0];
}
// Summon regular foes through the enemies registry (guarded: missing kinds are skipped).
export function summon(G, e, kind, pts, opts = {}) {
  const out = [];
  const reg = SPAWN.fn;
  if (!reg) return out;
  for (const p of pts) {
    try {
      const f = reg(G, kind, p.x, p.y, Object.assign({ summoned: true, owner: e.kind, noReward: true, region: (e.region || 'glasswood') }, opts));
      if (f) out.push(f);
    } catch (err) { /* kind not ready */ }
  }
  if (out.length) G.bus.emit('bossSummon', { id: e.kind, kind, n: out.length });
  return out;
}
export function aliveSummons(G, e) { return G.foes.filter((f) => !f.boss && !f.dead && f.owner === e.kind).length; }
// The enemies registry (setSpawner lets tests swap it).
const SPAWN = { fn: spawnFoe };
export function setSpawner(fn) { SPAWN.fn = fn; }

// Walk toward a point at the boss's speed (sets vx/vy; the engine integrates).
export function walkTo(e, x, y, speed, dt, stopAt = 0) {
  const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
  if (d <= stopAt + 1) { e.vx = e.vy = 0; return true; }
  const v = Math.min(speed, (d - stopAt) / Math.max(dt, 1e-3));
  e.vx = (dx / d) * v; e.vy = (dy / d) * v;
  return false;
}
export function face(G, e) { if (G.hero) e.facing = Math.atan2(G.hero.y - e.y, G.hero.x - e.x); return e.facing; }

