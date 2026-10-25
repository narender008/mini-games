// Queen Veyl, the Thorn Regent (Glasswood Shallows).
// Phase 1: thorn lanes erupting toward Iri, glass volleys falling from the
// canopy, a sweeping claw when Iri is close, a burrow through the briars.
// Phase 2 (50%): two Glass Knights rise, the arena edge grows thorns and closes
// in, five-lane eruptions, a spinning thorn spiral, and below 30% the Regent's
// Verdict: the whole floor erupts in a checkerboard, wave after wave.
import { TAU, clamp } from '../../core/math.js';
import { BOSSES } from '../../content/bosses.js';
import { stage, once, choose, summon, aliveSummons, walkTo, face, tele, hazard, hitHero, inArc, inCircle, dHero, aHero, arena, arenaPoint, clampToArena, shot, bark, insideArena, hazardsOf, coneArc } from './common.js';

const lead = (G, t) => ({ x: G.hero.x + (G.hero.vx || 0) * t, y: G.hero.y + (G.hero.vy || 0) * t });

export default {
  id: 'veyl',
  introTime: 3.4, dieTime: 3.0, phaseTime: 2.8,
  init(G, e) {
    e.hover = 0;
    e.sunk = 0; // 0..1 how far she has sunk into the briars (burrow), read by the painter
  },
  gap(G, e) { return (e.phase > 1 ? 0.45 : 0.75) + G.rng.ai() * 0.4; },
  idle(G, e, dt) {
    // glide to a stately distance, circling slowly
    const d = dHero(G, e.x, e.y), a = aHero(G, e.x, e.y);
    const want = 360;
    const side = (e.id % 2 ? 1 : -1);
    const tx = G.hero.x - Math.cos(a) * want + Math.cos(a + Math.PI / 2) * 90 * side;
    const ty = G.hero.y - Math.sin(a) * want + Math.sin(a + Math.PI / 2) * 90 * side;
    const p = clampToArena(G, tx, ty, 0.78);
    walkTo(e, p.x, p.y, e.speed * (d > 600 ? 1.3 : 1), dt, 20);
  },
  pick(G, e) {
    const d = dHero(G, e.x, e.y);
    if (e.phase === 1) {
      return choose(G, e, [['claw', d < 320 ? 6 : 0], ['lanes', 3], ['volley', 2.4], ['burrow', d > 640 ? 4 : 0.5]]);
    }
    const low = e.hp / e.maxHp < 0.3;
    return choose(G, e, [
      ['verdict', low ? 6 : 0],
      ['claw', d < 320 ? 5 : 0], ['lanes2', 3], ['volley', 2], ['ring', 2.4],
      ['summon', aliveSummons(G, e) === 0 ? 2.5 : 0], ['burrow', d > 640 ? 3 : 0.6],
    ]);
  },
  phaseStart(G, e) { e.tempo = 1.08; },
  phase(G, e) {
    // the garden closes: thorns grow in from the edge, and the knights rise
    hazard(G, e, 'edge', { s: 1.02, target: 0.82, rate: 0.05, tick: 0.6, dmgv: 8, life: 1e9, theme: 'thorn' });
    G.bus.emit('bossSetPiece', { id: 'veyl', name: 'thornEdge' });
    const pts = [-1, 1].map((s) => clampToArena(G, e.x + s * 240, e.y + 80, 0.7));
    summon(G, e, 'glassKnight', pts, { delay: 0.3 });
    e.cd.summon = G.t + 20;
  },
  moves: {
    lanes: lanesMove(),
    lanes2: lanesMove(),
    volley: {
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0; face(G, e);
        if (s === 'act') {
          const n = m.n + (e.phase > 1 ? 3 : 0);
          const k = Math.floor(((a.t - a.W) / a.A) * n);
          a.shot = a.shot || 0;
          while (a.shot <= k && a.shot < n) {
            const i = a.shot++;
            let p;
            if (i % 3 === 0) p = lead(G, m.fall * 0.6);
            else { const ang = G.rng.ai() * TAU, r = 90 + G.rng.ai() * 260; p = { x: G.hero.x + Math.cos(ang) * r, y: G.hero.y + Math.sin(ang) * r * 0.8 }; }
            p = clampToArena(G, p.x, p.y, 0.92);
            tele(G, e, { kind: 'circle', x: p.x, y: p.y, r: m.r, max: m.fall });
            hazard(G, e, 'impact', { x: p.x, y: p.y, r: m.r, fall: m.fall, life: m.fall + 1, item: 'glass', dmgv: m.dmg, seed: i * 7 + e.id });
          }
        }
        return s === 'done';
      },
    },
    claw: {
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        if (s === 'wind') {
          // track Iri for most of the wind-up, then commit
          if (a.t < a.W * 0.7) { e.aim = aHero(G, e.x, e.y); e.facing = e.aim; }
          if (once(a, 'tg')) a.tg = tele(G, e, { kind: 'cone', x: e.x, y: e.y, r: m.r, angle: e.aim, arc: coneArc(m.arc), max: a.W });
          a.tg.angle = e.aim; a.tg.x = e.x; a.tg.y = e.y;
          e.vx = e.vy = 0;
        } else if (s === 'act') {
          if (once(a, 'hit') && inArc(G, e.x, e.y, m.r, e.aim, m.arc)) hitHero(G, e, m.dmg, e.x, e.y, { kb: 640 });
          e.vx = Math.cos(e.aim) * 260; e.vy = Math.sin(e.aim) * 260;
        } else { e.vx = e.vy = 0; }
        return s === 'done';
      },
    },
    burrow: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        const p = lead(G, 0.5);
        a.to = clampToArena(G, p.x, p.y, 0.8);
        a.from = { x: e.x, y: e.y };
        a.tg = tele(G, e, { kind: 'circle', x: a.to.x, y: a.to.y, r: m.r, max: a.W + a.A * 0.92 });
      },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'wind') e.sunk = a.t / a.W;
        else if (s === 'act') {
          e.sunk = 1; e.untargetable = true;
          // the briar burst that follows the emergence is marked too
          if (a.t > a.W + a.A * 0.92 - 0.6 && once(a, 'rays')) {
            for (let i = 0; i < 8; i++) { const ang = (i / 8) * TAU + 0.2; tele(G, e, { kind: 'line', x: a.to.x + Math.cos(ang) * 70, y: a.to.y + Math.sin(ang) * 70, x2: a.to.x + Math.cos(ang) * 310, y2: a.to.y + Math.sin(ang) * 310, w: 46, max: 0.6 }); }
          }
          // drift the briar-wake toward the target while hidden; keep tracking a little
          const k = clamp((a.t - a.W) / (a.A * 0.8), 0, 1);
          e.x = a.from.x + (a.to.x - a.from.x) * k; e.y = a.from.y + (a.to.y - a.from.y) * k;
          if (a.t > a.W + a.A * 0.92 && once(a, 'up')) {
            e.x = a.to.x; e.y = a.to.y;
            if (inCircle(G, e.x, e.y, m.r)) hitHero(G, e, m.dmg, e.x, e.y, { kb: 700 });
            for (let i = 0; i < 8; i++) {
              const ang = (i / 8) * TAU + 0.2;
              hazard(G, e, 'spikeLine', { x: e.x + Math.cos(ang) * 70, y: e.y + Math.sin(ang) * 70, ang, len: 240, w: 46, speed: 1200, front: 0, hold: 0.25, life: 2, dmgv: Math.round(m.dmg * 0.6), theme: 'thorn' });
            }
            G.bus.emit('bossImpact', { id: 'veyl', x: e.x, y: e.y, r: m.r, item: 'emerge' });
          }
        } else { e.sunk = s === 'done' ? 0 : Math.max(0, 1 - (a.t - a.W - a.A) / Math.max(0.2, a.R * 0.8)); e.untargetable = false; }
        if (s === 'done') e.sunk = 0;
        return s === 'done';
      },
      abort(G, e) { e.sunk = 0; e.untargetable = false; },
    },
    ring: {
      start(G, e, a, m) { stage(G, e, a, m); tele(G, e, { kind: 'circle', x: e.x, y: e.y, r: 170, max: a.W }); a.dir = G.rng.ai() < 0.5 ? 1 : -1; a.base = G.rng.ai() * TAU; },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'act') {
          a.acc = (a.acc || 0) + dt;
          while (a.acc >= m.rate) {
            a.acc -= m.rate;
            const t = a.t - a.W;
            for (let i = 0; i < m.arms; i++) {
              const ang = a.base + (i / m.arms) * TAU + a.dir * m.spin * t;
              shot(G, e, { kind: 'boss:thorn', x: e.x + Math.cos(ang) * 60, y: e.y + Math.sin(ang) * 40, z: 50, vx: Math.cos(ang) * m.speed, vy: Math.sin(ang) * m.speed, r: 11, dmg: m.dmg, life: 3.6, ang });
            }
          }
        }
        return s === 'done';
      },
    },
    verdict: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        G.bus.emit('bossSetPiece', { id: 'veyl', name: 'verdict' });
        bark(G, e, 'phase3', BOSSES.veyl, { force: true, pri: 6 });
      },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'act') {
          const k = Math.floor((a.t - a.W) / 1.1);
          a.wave = a.wave ?? -1;
          if (k > a.wave && k < m.waves) {
            a.wave = k;
            const A = arena(G), c = m.cell;
            const nx = Math.ceil((A.rx * 2) / c), ny = Math.ceil((A.ry * 2) / c);
            for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
              if ((i + j + k) % 2) continue;
              const x = A.cx - A.rx + c * (i + 0.5), y = A.cy - A.ry + c * (j + 0.5);
              if (!insideArena(G, x, y, 20)) continue;
              if (Math.abs(x - e.x) < c * 0.6 && Math.abs(y - e.y) < c * 0.6) continue;
              hazard(G, e, 'patch', { x, y, hw: c / 2 - 6, warn: m.warn, up: 0.55, life: m.warn + 0.7, dmgv: m.dmg, theme: 'thorn', seed: i * 31 + j * 17 + k });
            }
          }
        }
        return s === 'done';
      },
    },
    summon: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        a.pts = [-1, 1].map((sd) => clampToArena(G, e.x + sd * 230, e.y + 60, 0.75));
        for (const p of a.pts) tele(G, e, { kind: 'circle', x: p.x, y: p.y, r: 60, max: a.W, color: '#c48bff' });
      },
      update(G, e, a, dt, m, def) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'act' && once(a, 'go')) { summon(G, e, m.kind, a.pts); bark(G, e, 'summon', def, { pri: 2 }); }
        return s === 'done';
      },
    },
  },
};


function lanesMove() {
  // Lanes arrive one after another, sweeping across the fan (alternating side each cast), so only a couple
  // of warnings overlap near her at any moment. Each lane is warned for at least the move's wind-up.
  const GAP = 0.2, R0 = 120;
  return {
    start(G, e, a, m) {
      stage(G, e, a, m);
      a.tgs = [];
      a.base = aHero(G, e.x, e.y);
      a.dir = (e.laneDir = -(e.laneDir || 1));
      e.aim = a.base;
    },
    update(G, e, a, dt, m) {
      const s = stage(G, e, a, m);
      e.vx = e.vy = 0;
      // lane i: warning appears at i*GAP/2 into the wind-up, erupts i*GAP after the strike
      for (let i = a.tgs.length; i < m.n && a.t >= i * GAP * 0.5; i++) {
        const k = a.dir > 0 ? i : m.n - 1 - i;
        const off = (k - (m.n - 1) / 2) * m.spread;
        a.tgs.push(tele(G, e, { kind: 'line', x: e.x, y: e.y, x2: e.x, y2: e.y, w: m.w, max: Math.max(0.6, a.W - a.t) + i * GAP, off, i }));
      }
      if (s === 'wind') {
        if (a.t < a.W * 0.6) { a.base = aHero(G, e.x, e.y); e.aim = a.base; e.facing = a.base; }
      }
      if (s === 'wind' || s === 'act') {
        for (const tg of a.tgs) {
          if (tg.fired) continue;
          const ang = a.base + tg.off;
          tg.x = e.x + Math.cos(ang) * R0; tg.y = e.y + Math.sin(ang) * R0;
          tg.x2 = e.x + Math.cos(ang) * m.len; tg.y2 = e.y + Math.sin(ang) * m.len;
        }
      }
      if (s === 'act' && once(a, 'go')) {
        for (const tg of a.tgs) {
          const ang = a.base + tg.off;
          tg.fired = true;
          hazard(G, e, 'spikeLine', { x: e.x + Math.cos(ang) * R0, y: e.y + Math.sin(ang) * R0, ang, len: m.len - R0, w: m.w, speed: m.speed, front: 0, wait: tg.i * GAP, hold: 0.5, life: 3 + tg.i * GAP, dmgv: m.dmg, theme: 'thorn', seed: (tg.off * 1000) | 0 });
        }
        G.bus.emit('bossImpact', { id: 'veyl', x: e.x, y: e.y, r: 120, item: 'lanes' });
      }
      return s === 'done' && a.t >= a.W + (m.n - 1) * GAP;
    },
  };
}
