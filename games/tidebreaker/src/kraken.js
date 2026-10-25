// Tidebreaker: the Kraken ally. summonKraken(G, target) (the 'kraken'
// ability; target is an enemy entity or null for the nearest) sends
// stats.krakenTentacles pink-purple tentacles bursting out of the sea. On a
// ship a tentacle wraps the hull and crushes it for stats.krakenDmg per second
// for about 4 s (and holds it: target.held = seconds, target.slow with the
// krakenSlow combo); on a boss part it rears up and slams the aim point (the
// weak spot when open) over and over. All damage goes through combat.damage.
// Tentacles live in G.allies with update / draw / gone.
import { LANE_Y, W } from './config.js';
import { clamp, lerp, smooth } from './util.js';
import { emit } from './events.js';
import { laneY, aboveLane } from './world/ocean.js';
import { spawn } from './world/fx.js';
import { damage } from './combat.js';
import { KRAKEN, paintTentacle, addGlow } from './creatures.js';

const LIFE = 4.2, RISE = 0.4, SINK = 0.6, TICK = 0.25, SLAM = 0.85;

const hittable = (e) => e && e.alive && !e.decor && !e.gone && e.hp > 0;
function isBossPart(G, e) { return !!(e.boss || (G.enc?.B && G.enc.B.parts.includes(e))); }
function pickTarget(G, want, used) {
  if (hittable(want) && !used.has(want)) return want;
  const px = G.player ? G.player.x : 300;
  let best = null, bd = Infinity;
  for (const e of G.enemies) {
    if (!hittable(e) || used.has(e) || isBossPart(G, e)) continue;
    const d = Math.abs((e.cx ?? e.x) - px);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) return best;
  // no ship left: go for the boss (the part under its aim point first)
  const B = G.enc?.B;
  if (B && G.boss) {
    const parts = B.parts.filter((p) => hittable(p) && !used.has(p));
    const under = parts.find((p) => p.hitTest(G.boss.x, G.boss.y, 6) > 0);
    return under || parts[0] || null;
  }
  return null;
}

export function summonKraken(G, target) {
  const n = Math.max(1, G.stats?.krakenTentacles | 0 || 1);
  const used = new Set();
  let first = null;
  for (let i = 0; i < n; i++) {
    let tg = pickTarget(G, i === 0 ? target : null, used);
    if (!tg) tg = first;              // more tentacles than targets: gang up
    if (!tg) break;
    if (!first) first = tg;
    used.add(tg);
    G.allies.push(makeTentacle(G, tg, i));
  }
  if (first) emit('kraken', { x: first.cx ?? first.x, y: first.cy ?? first.y, n });
  return !!first;
}

function makeTentacle(G, tg, i) {
  const k = {
    kind: 'kraken', side: 'player', layer: 'front', alive: true, gone: false, t: 0, i,
    target: tg, slam: isBossPart(G, tg), tick: 0.05, side2: i % 2 ? -1 : 1, seed: 7 + i * 5,
    bx: 0, tx: 0, ty: 0, ax: 0, ay: 0, hitT: 0,
    update(G2, dt) { updateTentacle(G2, this, dt); },
    draw(g, G2) { drawTentacle(g, G2, this); },
  };
  aimAt(G, k);
  // a slam rises between your ship and the target, never on top of you
  const px = G.player ? G.player.x : 300;
  k.bx = k.slam ? clamp(k.ax + 150 * k.side2, Math.min(px + 170, W - 60), W - 60) : k.tx + 74 * k.side2;
  spawn(G, 'splash', k.bx, laneY(G, k.bx) - 8, { size: 36, col: '#ffd0f0' });
  emit('splash', { x: k.bx, y: LANE_Y, size: 2 });
  return k;
}
// Where to crush or slam this step.
function aimAt(G, k) {
  const tg = k.target;
  if (k.slam) {
    const b = G.boss;
    if (b && tg.hitTest && tg.hitTest(b.x, b.y, 6) > 0) { k.ax = b.x; k.ay = b.y; }
    else { k.ax = tg.cx ?? tg.x; k.ay = tg.cy ?? tg.y; }
  } else {
    k.tx = tg.x; k.ty = laneY(G, tg.x);
    k.ax = tg.cx ?? tg.x; k.ay = tg.cy ?? tg.y;
  }
}
function updateTentacle(G, k, dt) {
  k.t += dt;
  const tg = k.target, s = G.stats || {};
  if (k.t > LIFE + SINK) { k.gone = true; k.alive = false; return; }
  if (k.t > LIFE) { if (!k.slam && tg) tg.held = 0; return; }
  if (!hittable(tg)) {
    // the target is gone: find another while there is time left, else let go
    const next = k.t < LIFE - 1.2 ? pickTarget(G, null, new Set()) : null;
    if (tg) tg.held = 0;
    if (next && isBossPart(G, next) === k.slam) { k.target = next; }
    else { k.t = Math.max(k.t, LIFE); return; }
  }
  aimAt(G, k);
  if (!k.slam) k.bx = lerp(k.bx, k.tx + 74 * k.side2, Math.min(1, dt * 4));
  if (k.t < RISE) return;
  // (combat.damage adds the krakenSlow bonus on held targets)
  const dps = s.krakenDmg ?? 30;
  if (k.slam) {
    // rear up and slam on a loop
    const ph = slamPh(k);
    if (ph > 0.62 && !k.struck) {
      k.struck = true;
      damage(G, k.target, dps * SLAM, { kind: 'kraken', x: k.ax, y: k.ay, src: 'kraken' });
      spawn(G, 'splash', k.ax, k.ay, { size: 24, col: '#ffd0f0' }); spawn(G, 'sparks', k.ax, k.ay, { n: 10, col: '#ff9af0' });
      emit('hit', { x: k.ax, y: k.ay, dmg: dps * SLAM, kind: 'kraken', target: k.target });
    } else if (ph < 0.62) k.struck = false;
  } else {
    k.tick -= dt;
    const t = k.target;
    t.held = 0.3; t.vx = 0;
    if (s.krakenSlow) { t.slow = Math.max(t.slow || 0, 0.5); t.slowK = Math.max(t.slowK || 0, s.chainSlow || 0.4); }
    if (k.tick <= 0) {
      k.tick += TICK;
      damage(G, t, dps * TICK, { kind: 'kraken', x: k.ax, y: k.ay, src: 'kraken' });
      if (Math.random() < 0.5) spawn(G, 'spray', t.x + (Math.random() - 0.5) * 60, k.ty - 10, { n: 4 });
    }
  }
}
// Slam cycle position 0..1, starting at the strike (0.55) right after rising.
const slamPh = (k) => (Math.max(0, k.t - RISE) / SLAM + 0.55) % 1;
function pose(G, k) {
  const ly = laneY(G, k.bx), t = G.vt, d = k.side2;
  if (k.slam) {
    const ph = slamPh(k);
    // 0..0.55 rear up, 0.55..0.62 strike, then lie on the target
    const up = [[k.bx, ly + 30], [k.bx, ly - 260], [lerp(k.bx, k.ax, 0.4), Math.min(k.ay, 300) - 200], [lerp(k.bx, k.ax, 0.7), Math.min(k.ay, 300) - 160]];
    const down = [[k.bx, ly + 30], [k.bx, ly - 200], [lerp(k.bx, k.ax, 0.5), k.ay - 150], [k.ax, k.ay]];
    let u = ph < 0.55 ? 1 - smooth(ph / 0.55) : ph < 0.62 ? ((ph - 0.55) / 0.07) ** 2 : 1;
    if (k.t < RISE) u = 0;
    return { p: up.map((p, i) => [lerp(p[0], down[i][0], u), lerp(p[1], down[i][1], u)]), r0: 38 };
  }
  // wrap: arch over the deck and curl round the hull
  const sq = Math.sin(t * 5 + k.seed) * 6;
  return { p: [[k.bx, ly + 30], [k.bx + 10 * d, ly - 170], [k.tx - 20 * d, ly - 200 - sq], [k.tx - 46 * d, ly - 44 + sq]], r0: 28 };
}
function drawTentacle(g, G, k) {
  const { p, r0 } = pose(G, k);
  const rise = smooth(clamp(k.t / RISE, 0, 1)), sink = smooth(clamp((k.t - LIFE) / SINK, 0, 1));
  const drop = (1 - rise) * 320 + sink * 340;
  const q = p.map(([x, y]) => [x, y + drop]);
  aboveLane(g, G, () => {
    paintTentacle(g, q[0], q[1], q[2], q[3], r0, KRAKEN, k.seed, 1, G.vt);
    if (!k.slam && rise > 0.6 && sink < 0.5) {
      // two coils round the hull
      const ly = laneY(G, k.tx);
      for (const [ox, rx] of [[-22, 13], [24, 12]]) {
        const x = k.tx + ox, y = ly - 26, tight = 1 + Math.sin(G.vt * 6 + ox) * 0.06;
        g.lineCap = 'round';
        g.strokeStyle = KRAKEN.dark; g.lineWidth = 16; g.beginPath(); g.ellipse(x, y, rx * tight, 36, 0.25, -Math.PI / 2, Math.PI / 2); g.stroke();
        g.strokeStyle = KRAKEN.base; g.lineWidth = 12; g.stroke();
        g.strokeStyle = KRAKEN.hi; g.lineWidth = 3; g.beginPath(); g.ellipse(x - 2, y, rx * tight, 34, 0.25, -Math.PI / 2, Math.PI / 6); g.stroke();
        g.fillStyle = KRAKEN.sucker;
        for (let j = 0; j < 3; j++) { const a = -0.9 + j * 0.9; g.beginPath(); g.arc(x + Math.cos(a) * rx * tight, y + Math.sin(a) * 36, 2.6, 0, 7); g.fill(); }
      }
    }
  }, 6);
  if (k.slam && k.struck && !sink) addGlow(g, k.ax, k.ay, 60, '#ff9af0', 0.5);
}
