// A built-in pilot, used by the tests, the balance bot and ?debug auto.
// Pitched at a good teenage player, not a perfect one: it re-plans 30 times a
// second, looks 0.5 s ahead, does not see a bullet for its first 0.2 s, now and then freezes for a beat, and keeps a slightly loose dodge margin.
//
// Each plan scores candidate points around the ship (rings of directions at
// three reaches, plus "stay" and "go under the target"). For each candidate
// the ship's straight path at its top speed is sampled at a few look-ahead
// times against every nearby bullet (moved along its velocity), beam,
// telegraph line, enemy body and boss hazard; a near miss costs a lot, open
// space a little. Then come preferences: under the chosen target, low in
// the zone, away from walls and corners, close to the previous plan. The
// cheapest candidate is the target point. When every candidate still hits
// soon and no shield is left (or the hull is on its last segment), it fires
// the EMP, or dashes if it has the Afterburner.
import { makeRng, rnd, clamp, segDist2 } from './rng.js';
import { zone, moveSpeed } from './player.js';
import { reroll } from './index.js';

const TAUS = [0, 0.08, 0.16, 0.25, 0.35, 0.5];
const WT = TAUS.map((t) => 1 / (1 + 3 * t));
const DIRS = 16;
const REACH = [0.7, 1.7, 3.4];
const HIT = 1000;

// skill knobs (tuned so sector 1 is nearly always cleared and sector 5 only sometimes)
// react: bullets younger than this are not seen yet (reaction time)
// lapse: chance per second of a short freeze (holds the old plan for lapseT s)
const SKILL = { margin: 0.04, replan: 1 / 30, react: 0.2, lapse: 0.8, lapseT: 0.22 };

function brain(S) {
  if (!S._ap || S._ap.seed !== S.seed) {
    S._ap = { seed: S.seed, rng: makeRng((S.seed ^ 0x5bd1e995) >>> 0), t: -1, out: { x: 0, y: 0, dx: 0, dy: 0, fire: true, emp: false, dash: false }, px: 0, py: 0, near: [], danger: 0, freeze: 0 };
  }
  return S._ap;
}

export function autopilot(S) {
  const A = brain(S);
  const P = S.player;
  const out = A.out;
  out.emp = false;
  out.dash = false;
  out.fire = true;
  if (P.dead || S.phase === 'upgrade' || S.phase === 'cleared' || S.phase === 'dead') {
    out.x = P.x;
    out.y = P.y;
    return { ...out };
  }
  if (S.time - A.t < SKILL.replan && A.t >= 0) return { ...out };
  A.t = S.time;
  // an occasional lapse: keep the old plan for a moment
  if (S.time < A.freeze) return { ...out };
  if (rnd(A.rng) < SKILL.lapse * SKILL.replan) {
    A.freeze = S.time + SKILL.lapseT;
    return { ...out };
  }
  plan(S, A);
  return { ...out };
}

function plan(S, A) {
  const P = S.player;
  const Z = zone(S);
  const speed = moveSpeed(S) * 0.9;
  const out = A.out;

  // threats near enough to matter within the look-ahead
  const near = A.near;
  near.length = 0;
  for (const b of S.bullets) {
    if (b.t < SKILL.react && b.kind !== 'beam') continue;
    if (b.kind === 'beam') {
      near.push(b);
      continue;
    }
    const v = Math.abs(b.vx) + Math.abs(b.vy);
    const dx = b.x - P.x;
    const dy = b.y - P.y;
    const lim = v * 0.75 + 4.5;
    if (dx * dx + dy * dy < lim * lim) near.push(b);
  }
  const teles = [];
  for (const t of S.teles) if (t.k > 0.25) teles.push(t);
  for (const e of S.enemies) if (e.tele && e.tele.k > 0.25 && e.type !== 'sniper') teles.push(e.tele);
  const B = S.boss;
  if (B) for (const p of B.parts) if (p.tele && p.tele.k > 0.15) teles.push(p.tele);

  // where to fight from
  const tx = targetX(S, P);
  const ypref = Z.y0 + (Z.y1 - Z.y0) * 0.22;

  let best = null;
  let bestCost = Infinity;
  let bestDanger = 0;
  const tryPoint = (cx, cy) => {
    cx = clamp(cx, Z.x0, Z.x1);
    cy = clamp(cy, Z.y0, Z.y1);
    const danger = dangerOf(S, A, P, cx, cy, speed, near, teles);
    let cost = danger;
    if (tx != null) {
      const d = Math.abs(cx - tx);
      cost += d < 6 ? 0.32 * d : 1.92 + 0.15 * (d - 6);
    }
    cost += 0.18 * Math.abs(cy - ypref);
    const ex = Math.min(cx - Z.x0, Z.x1 - cx);
    if (ex < 1.6) cost += (1.6 - ex) * 1.4;
    const ey = Math.min(cy - Z.y0, Z.y1 - cy);
    if (ey < 0.9) cost += (0.9 - ey) * 1.2;
    cost += 0.12 * Math.hypot(cx - A.px, cy - A.py);
    if (cost < bestCost) {
      bestCost = cost;
      best = [cx, cy];
      bestDanger = danger;
    }
  };
  tryPoint(P.x, P.y);
  if (tx != null) tryPoint(P.x + clamp(tx - P.x, -REACH[2], REACH[2]), ypref);
  for (let r = 0; r < REACH.length; r++) {
    for (let i = 0; i < DIRS; i++) {
      const a = ((i + (r & 1) * 0.5) / DIRS) * Math.PI * 2;
      tryPoint(P.x + Math.cos(a) * REACH[r], P.y + Math.sin(a) * REACH[r]);
    }
  }
  out.x = best[0];
  out.y = best[1];
  A.px = best[0];
  A.py = best[1];
  A.danger = bestDanger;

  // cornered: every option still collides soon
  if (bestDanger >= HIT * WT[3] && P.invuln <= 0.05) {
    const last = P.shields === 0 && (P.hull <= 2 || bestDanger >= HIT * WT[1]);
    if ((S.upgrades.afterburner || 0) > 0 && P.dashCd <= 0) out.dash = true;
    else if (P.emp > 0 && last) out.emp = true;
  }
}

function dangerOf(S, A, P, cx, cy, speed, near, teles) {
  const dx = cx - P.x;
  const dy = cy - P.y;
  const dist = Math.hypot(dx, dy);
  const tt = dist / speed;
  const m = SKILL.margin;
  let cost = 0;
  for (let k = 0; k < TAUS.length; k++) {
    const tau = TAUS[k];
    const u = tt > 0 ? Math.min(1, tau / tt) : 1;
    const px = P.x + dx * u;
    const py = P.y + dy * u;
    const w = WT[k];
    for (let i = 0; i < near.length; i++) {
      const b = near[i];
      if (b.kind === 'beam') {
        if (b.t + tau > b.life) continue;
        const rr = b.r + P.r + m + 0.1;
        const d2 = segDist2(px, py, b.x, b.y, b.x1, b.y1);
        if (d2 < rr * rr) cost += HIT * w;
        continue;
      }
      const bx = b.x + b.vx * tau - px;
      const by = b.y + b.vy * tau - py;
      const d2 = bx * bx + by * by;
      const rr = b.r + P.r + m;
      if (d2 < rr * rr) cost += HIT * w;
      else if (d2 < 2.2) cost += 0.8 * w * (2.2 - d2);
    }
    for (const e of S.enemies) {
      if (e.dead) continue;
      const ex = e.x + e.vx * tau - px;
      const ey = e.y + e.vy * tau - py;
      const rr = e.r * 0.8 + P.r + 0.3;
      const d2 = ex * ex + ey * ey;
      if (d2 < rr * rr) cost += HIT * w;
      else if (d2 < (rr + 1.2) ** 2) cost += 2 * w;
    }
    if (tau >= 0.08) {
      for (const t of teles) {
        const d2 = segDist2(px, py, t.x0, t.y0, t.x1, t.y1);
        if (d2 < 0.75 * 0.75 + (t.wide || 0)) cost += HIT * 0.5 * w;
      }
    }
    const B = S.boss;
    if (B && !B.dying) {
      for (const p of B.parts) {
        if (!p.hurt || p.dead) continue;
        const ex = p.x - px;
        const ey = p.y - py;
        const rr = p.r + P.r + 0.45;
        if (ex * ex + ey * ey < rr * rr) cost += HIT * w;
      }
    }
  }
  return cost;
}

// x to fight from: under the most pressing target
function targetX(S, P) {
  const f = S.field;
  const B = S.boss;
  if (B && !B.entering && !B.dying) {
    let best = null;
    let bs = Infinity;
    for (const p of B.parts) {
      if (p.dead || !p.vuln) continue;
      const s = Math.abs(p.x - P.x) * 0.5 + p.hp / Math.max(1, p.maxHp) * 3;
      if (s < bs) (bs = s), (best = p);
    }
    if (best) return best.x;
  }
  let best = null;
  let bs = Infinity;
  for (const e of S.enemies) {
    if (e.dead || e.gone || e.type === 'mine' || e.y > f.halfH - 0.3 || e.y < P.y + 1.5 || Math.abs(e.x) > f.halfW) continue;
    let s = (e.y - P.y) * 0.6 + Math.abs(e.x - P.x) * 0.35;
    if (e.type === 'sniper' || e.type === 'turret') s -= 3;
    if (e.type === 'diver' && e.state !== 'dive') s -= 2;
    if (e.type === 'gunship' || e.type === 'bulwark' || e.type === 'splitter') s -= 1;
    if (s < bs) (bs = s), (best = e);
  }
  if (!best) return null;
  // flank a shielded bulwark a little
  if (best.shield && !(S.upgrades.pierce > 0)) return best.x + (best.x > 0 ? -1.4 : 1.4);
  return best.x;
}

// ------------------------------------------------------------ upgrade picks

const PREF = {
  overdrive: [10, 8, 6],
  spread: [8, 7, 5],
  pierce: [8, 7, 5],
  missiles: [9, 7, 6],
  drones: [8, 6, 5],
  capacitor: [7, 6, 6],
  afterburner: [4, 3, 3],
  emp: [5, 4, 3],
  magnet: [2, 1, 1],
};

function weight(S, o) {
  if (o.id === 'repair') return S.player.hull <= 1 ? 20 : S.player.hull === 2 ? 7.5 : 0;
  const lv = S.upgrades[o.id] || 0;
  let w = (PREF[o.id] || [1, 1, 1])[lv] ?? 1;
  if (o.id === 'pierce' && S.sector >= 3) w += 2;
  if (o.id === 'emp' && S.player.emp === 0) w += 3;
  return w;
}

export function autopilotPick(S) {
  if (!S.offer || !S.offer.length) return null;
  let best = S.offer.reduce((a, o) => (weight(S, o) > weight(S, a) ? o : a), S.offer[0]);
  if (weight(S, best) < 5 && S.rerolls > 0 && reroll(S)) best = S.offer.reduce((a, o) => (weight(S, o) > weight(S, a) ? o : a), S.offer[0]);
  return best.id;
}
