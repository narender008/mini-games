// Cantor Morrow, the Drowned Choirmaster (The Drowned Choir).
// Phase 1: song rings expanding from him (dash through them), a sweeping
// lantern beam, homing requiem notes, Choristers, sinking and resurfacing.
// Phase 2 (60%): the drowned choir rises at the arena's edge and sings with
// him: rings from four places at once overlap in patterns; sections of the
// floor flood. Phase 3 (28%): the Requiem: gapped rings that turn as they
// spread, and floods every few seconds.
import { TAU, clamp, wrapAng } from '../../core/math.js';
import { BOSSES } from '../../content/bosses.js';
import { stage, once, choose, summon, aliveSummons, walkTo, face, tele, hazard, hitHero, inLine, dHero, aHero, arena, clampToArena, shot, bark, arenaPoint, hazardsOf } from './common.js';

export default {
  id: 'morrow',
  introTime: 3.4, dieTime: 3.0, phaseTime: 2.8,
  init(G, e) { e.sunk = 0; e.choir = []; e.lastFlood = -1; },
  gap(G, e) { return (e.phase === 3 ? 0.35 : e.phase === 2 ? 0.5 : 0.7) + G.rng.ai() * 0.4; },
  idle(G, e, dt) {
    const d = dHero(G, e.x, e.y), a = aHero(G, e.x, e.y);
    const want = 430;
    e.orbit = (e.orbit ?? 1);
    if (G.rng.ai() < dt * 0.15) e.orbit *= -1;
    const tx = G.hero.x - Math.cos(a) * want + Math.cos(a + Math.PI / 2) * 160 * e.orbit;
    const ty = G.hero.y - Math.sin(a) * want + Math.sin(a + Math.PI / 2) * 160 * e.orbit;
    const p = clampToArena(G, tx, ty, 0.72);
    walkTo(e, p.x, p.y, e.speed * (d < 220 ? 1.5 : 1), dt, 10);
  },
  pick(G, e) {
    const d = dHero(G, e.x, e.y);
    const floods = hazardsOf(G, e, 'flood').length;
    if (e.phase === 1) return choose(G, e, [['ring', 3], ['sweep', 2.4], ['notes', 2.2], ['summon', aliveSummons(G, e) < 2 ? 1.6 : 0], ['sink', d < 240 ? 3 : 0.5]]);
    if (e.phase === 2) return choose(G, e, [['choir', 3], ['ring', 1.6], ['sweep', 2], ['notes', 1.6], ['flood', floods ? 0 : 2.6], ['summon', aliveSummons(G, e) < 2 ? 1.2 : 0], ['sink', d < 240 ? 3 : 0.4]]);
    return choose(G, e, [['requiem', 3.2], ['choir', 2], ['sweep', 1.6], ['notes', 1.2], ['flood', floods ? 0 : 3.2], ['sink', d < 240 ? 3 : 0.4]]);
  },
  phaseStart(G, e, n) { e.tempo = n === 2 ? 1.08 : 1.14; },
  phase(G, e, n, def) {
    if (n === 2) {
      // the drowned choir rises around the edge of the nave
      const A = arena(G);
      e.choir = [[-0.86, -0.25], [0.86, -0.25], [-0.5, 0.78], [0.5, 0.78], [0, -0.9]].map(([fx, fy], i) => ({ x: A.cx + fx * A.rx, y: A.cy + fy * A.ry, i }));
      G.bus.emit('bossSetPiece', { id: 'morrow', name: 'choir' });
      const pts = [-1, 1].map((s) => clampToArena(G, e.x + s * 220, e.y + 60, 0.7));
      summon(G, e, 'chorister', pts, { delay: 0.4 });
    } else {
      G.bus.emit('bossSetPiece', { id: 'morrow', name: 'requiem' });
    }
  },
  moves: {
    ring: {
      start(G, e, a, m) { stage(G, e, a, m); tele(G, e, { kind: 'circle', x: e.x, y: e.y, r: 130, max: a.W, color: '#ff3d5e' }); },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx *= 0.9; e.vy *= 0.9;
        if (s === 'act') {
          const n = m.n + (e.phase > 1 ? 1 : 0);
          const k = Math.floor((a.t - a.W) / (m.gap / (e.tempo || 1)));
          a.sent = a.sent ?? 0;
          while (a.sent <= k && a.sent < n) { a.sent++; ringAt(G, e, e.x, e.y, m); }
        }
        return s === 'done';
      },
    },
    sweep: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        const h = aHero(G, e.x, e.y);
        a.dir = G.rng.ai() < 0.5 ? 1 : -1;
        a.a0 = h - a.dir * m.arc / 2; a.a1 = h + a.dir * m.arc / 2;
        e.aim = a.a0;
        a.tg = tele(G, e, { kind: 'cone', x: e.x, y: e.y, r: m.len, angle: h, arc: m.arc, max: a.W, color: '#ff5a6e' });
      },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'wind') { e.aim = a.a0; a.tg.x = e.x; a.tg.y = e.y; }
        if (s === 'act') {
          const k = (a.t - a.W) / a.A;
          const ease = k * k * (3 - 2 * k);
          e.aim = a.a0 + (a.a1 - a.a0) * ease;
          if (!a.beam) a.beam = hazard(G, e, 'beam', { x: e.x, y: e.y, ang: e.aim, len: m.len, w: m.w, on: true, life: a.A + 0.2 });
          a.beam.x = e.x; a.beam.y = e.y - 0; a.beam.ang = e.aim;
          const x2 = e.x + Math.cos(e.aim) * m.len, y2 = e.y + Math.sin(e.aim) * m.len;
          if (!a.hit && inLine(G, e.x, e.y, x2, y2, m.w)) { if (hitHero(G, e, m.dmg, G.hero.x, G.hero.y, { kb: 300, status: ['burn', 1.5, 1] })) a.hit = true; }
        } else if (a.beam) { a.beam.on = false; }
        return s === 'done';
      },
      abort(G, e, a) { if (a.beam) a.beam.life = 0; },
    },
    notes: {
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx *= 0.9; e.vy *= 0.9;
        if (s === 'wind' && once(a, 'tg')) tele(G, e, { kind: 'circle', x: e.x, y: e.y, r: 90, max: a.W, color: '#ff6a7a' });
        if (s === 'act') {
          const n = m.n + (e.phase - 1);
          const k = Math.floor(((a.t - a.W) / a.A) * n);
          a.sent = a.sent ?? 0;
          while (a.sent <= k && a.sent < n) {
            const i = a.sent++;
            const ang = aHero(G, e.x, e.y) + (i - (n - 1) / 2) * 0.5;
            shot(G, e, {
              kind: 'boss:note', x: e.x + Math.cos(ang) * 50, y: e.y + Math.sin(ang) * 30, z: 90,
              vx: Math.cos(ang) * m.speed, vy: Math.sin(ang) * m.speed, r: 13, dmg: m.dmg, life: m.life, seed: i,
              turn: m.homing, speed: m.speed, update: homing,
            });
          }
        }
        return s === 'done';
      },
    },
    summon: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        a.pts = [-1, 1].map((sd) => clampToArena(G, e.x + sd * 200, e.y + 90, 0.75));
        for (const p of a.pts) tele(G, e, { kind: 'circle', x: p.x, y: p.y, r: 60, max: a.W, color: '#8fb0ff' });
      },
      update(G, e, a, dt, m, def) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'act' && once(a, 'go')) {
          const room = Math.max(0, (m.max || 3) - aliveSummons(G, e));
          summon(G, e, m.kind, a.pts.slice(0, Math.min(m.n, room)));
          bark(G, e, 'summon', def, { pri: 2 });
        }
        return s === 'done';
      },
    },
    sink: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        // surface away from Iri
        let best = null, bd = -1;
        for (let i = 0; i < 6; i++) { const p = arenaPoint(G, 0.75); const d = Math.hypot(p.x - G.hero.x, p.y - G.hero.y); if (d > bd && d < 760) { bd = d; best = p; } }
        a.to = best || arenaPoint(G, 0.6);
        a.from = { x: e.x, y: e.y };
      },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'wind') e.sunk = a.t / a.W;
        else if (s === 'act') {
          e.sunk = 1; e.untargetable = true;
          const k = clamp((a.t - a.W) / (a.A * 0.7), 0, 1);
          e.x = a.from.x + (a.to.x - a.from.x) * k; e.y = a.from.y + (a.to.y - a.from.y) * k;
          if (a.t > a.W + a.A * 0.5 && once(a, 'tg')) tele(G, e, { kind: 'circle', x: a.to.x, y: a.to.y, r: 140, max: a.A * 0.5, color: '#ff3d5e' });
        } else {
          e.untargetable = false;
          e.sunk = Math.max(0, 1 - (a.t - a.W - a.A) / Math.max(0.1, a.R));
          if (once(a, 'up')) { ringAt(G, e, e.x, e.y, { dmg: 12, speed: 380, w: 30, maxR: 560 }); }
        }
        return s === 'done';
      },
      abort(G, e) { e.sunk = 0; e.untargetable = false; },
    },
    choir: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        // pick 3 singers (with him) in an order
        const pts = (e.choir && e.choir.length ? e.choir : []).slice();
        for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(G.rng.ai() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
        a.singers = pts.slice(0, e.phase === 3 ? 4 : 3).concat([{ x: e.x, y: e.y, self: true }]);
        a.singers.forEach((p, i) => { p.at = a.W + i * 0.55 / (e.tempo || 1); if (i === 0) tele(G, e, { kind: 'circle', x: p.x, y: p.y, r: 120, max: a.W, color: '#ff3d5e' }); });
        G.bus.emit('bossSetPiece', { id: 'morrow', name: 'chorus' });
        e.singing = a.singers.map((p) => p.i ?? -1);
      },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx *= 0.9; e.vy *= 0.9;
        for (let i = 0; i < a.singers.length; i++) {
          const p = a.singers[i];
          // each singer's own warning, then its ring
          if (i > 0 && a.t >= p.at - 0.6 && once(a, 'tg' + i)) tele(G, e, { kind: 'circle', x: p.self ? e.x : p.x, y: p.self ? e.y : p.y, r: 110, max: 0.6, color: '#ff3d5e' });
          if (a.t >= p.at && once(a, 'r' + i)) ringAt(G, e, p.self ? e.x : p.x, p.self ? e.y : p.y, m, p.i);
        }
        if (s === 'done') e.singing = null;
        return s === 'done';
      },
      abort(G, e) { e.singing = null; },
    },
    flood: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        const A = arena(G);
        // four quarters of the nave; flood two of them (never the same pair twice running)
        const q = [[0, 0], [1, 0], [0, 1], [1, 1]];
        let pick;
        const hx = G.hero.x < A.cx ? 0 : 1, hy = G.hero.y < A.cy ? 0 : 1;
        const heroQ = q.findIndex(([x, y]) => x === hx && y === hy);
        const opts = [[0, 3], [1, 2], [0, 1], [2, 3], [0, 2], [1, 3]].filter((p) => p.join() !== e.lastFlood);
        // usually include Iri's quarter, so it must be left
        const withHero = opts.filter((p) => p.includes(heroQ));
        const pool = withHero.length && G.rng.ai() < 0.8 ? withHero : opts;
        pick = pool[Math.floor(G.rng.ai() * pool.length)];
        e.lastFlood = pick.join();
        const warn = Math.max(0.6, m.wind / (e.tempo || 1));
        for (const i of pick) {
          const [qx, qy] = q[i];
          const x0 = A.cx - A.rx * 1.2 + qx * A.rx * 1.2, x1 = x0 + A.rx * 1.2;
          const y0 = A.cy - A.ry * 1.2 + qy * A.ry * 1.2, y1 = y0 + A.ry * 1.2;
          hazard(G, e, 'flood', { x0, y0, x1, y1, x: (x0 + x1) / 2, y: (y0 + y1) / 2, warn, life: warn + m.act, tick: m.tick, slow: m.slow, dmgv: m.dmg });
          tele(G, e, { kind: 'line', x: x0, y: (y0 + y1) / 2, x2: x1, y2: (y0 + y1) / 2, w: y1 - y0, max: warn, color: '#ff3d5e', soft: true });
        }
        G.bus.emit('bossSetPiece', { id: 'morrow', name: 'flood' });
      },
      update(G, e, a, dt, m) {
        e.vx *= 0.9; e.vy *= 0.9;
        // he raises the staff while the water rises, then carries on
        const W = Math.max(0.6, m.wind / (e.tempo || 1));
        e.pose = a.t < W * 0.6 ? 'wind' : 'act'; e.pt = clamp(a.t / (W * 0.6), 0, 1);
        return a.t > W * 0.75;
      },
    },
    requiem: {
      start(G, e, a, m) { stage(G, e, a, m); tele(G, e, { kind: 'circle', x: e.x, y: e.y, r: 150, max: a.W }); a.base = G.rng.ai() * TAU; G.bus.emit('bossSetPiece', { id: 'morrow', name: 'requiem' }); },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'act') {
          const k = Math.floor((a.t - a.W) / (a.A / m.rings));
          a.sent = a.sent ?? 0;
          while (a.sent <= k && a.sent < m.rings) {
            const i = a.sent++;
            const gaps = [];
            const base = a.base + i * 0.9;
            for (let g = 0; g < m.gaps; g++) gaps.push({ a: base + (g / m.gaps) * TAU, arc: m.gapArc });
            ringAt(G, e, e.x, e.y, { dmg: m.dmg, speed: m.speed, w: m.w, maxR: 1300 }, -1, gaps, (i % 2 ? 1 : -1) * 0.35);
          }
        }
        return s === 'done';
      },
    },
  },
};

function ringAt(G, e, x, y, m, singer = -1, gaps = null, spin = 0) {
  hazard(G, e, 'wave', { x, y, r: 30, speed: m.speed ?? 330, w: m.w ?? 34, maxR: m.maxR ?? 1250, gaps: gaps || [], spin, life: 6, dmgv: m.dmg ?? 14, theme: 'water', element: 'water', singer });
  G.bus.emit('bossImpact', { id: 'morrow', x, y, r: 60, item: 'ring' });
}

function homing(G, p, dt) {
  const h = G.hero;
  if (!h || p.life < 0.6) return;
  const want = Math.atan2(h.y - p.y, h.x - p.x), cur = Math.atan2(p.vy, p.vx);
  const d = wrapAng(want - cur);
  const na = cur + clamp(d, -p.turn * dt, p.turn * dt);
  p.vx = Math.cos(na) * p.speed; p.vy = Math.sin(na) * p.speed;
}
