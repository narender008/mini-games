// Aurum, the Gilded Colossus (The Sunken Forge).
// Phase 1: hammer slams with a shockwave ring (dash over it) that leave molten
// floor, a wide sweep up close, thrown anvils, a fan of forge sparks.
// Phase 2 (55%): he stokes the forge: the whole arena glows, the floor runs
// molten except for shifting safe circles; he grows faster; slam chains.
// Phase 3 (22%): the Last Pour: molten cracks race out from him in every
// direction, wave after turning wave.
import { TAU, clamp } from '../../core/math.js';
import { stage, once, choose, walkTo, face, tele, hazard, hitHero, inArc, inCircle, dHero, aHero, arena, arenaPoint, clampToArena, shot, coneArc } from './common.js';

const lead = (G, t) => ({ x: G.hero.x + (G.hero.vx || 0) * t, y: G.hero.y + (G.hero.vy || 0) * t });

function pool(G, e, x, y, r, life) {
  hazard(G, e, 'pool', { x, y, r, life, tick: 0.4, dmgv: 6, theme: 'aurum', warn: 0.25, seed: (x * 7 + y * 3) | 0 });
}
function shock(G, e, x, y, m) {
  // the wave rises at the rim of the impact and only bites after a beat
  hazard(G, e, 'wave', { x, y, r: m.r0 ?? 60, grace: 0.12, speed: m.waveSpeed ?? 520, w: m.waveW ?? 30, maxR: m.wave ?? 600, gaps: [], life: 4, dmgv: Math.round((m.dmg ?? 20) * 0.6), theme: 'molten', element: 'fire' });
}

export default {
  id: 'aurum',
  introTime: 3.6, dieTime: 3.2, phaseTime: 2.8,
  init(G, e) { e.heat = 0; e.baseSpeed = e.speed; },
  gap(G, e) { return (e.phase === 3 ? 0.35 : e.phase === 2 ? 0.5 : 0.75) + G.rng.ai() * 0.45; },
  tick(G, e, dt) {
    // forge heat (0..1) eases toward the phase's target; the painter and overlay read it
    const want = e.phase === 1 ? 0 : e.phase === 2 ? 0.75 : 1;
    e.heat += clamp(want - e.heat, -dt * 0.4, dt * 0.4);
  },
  idle(G, e, dt) {
    const d = dHero(G, e.x, e.y);
    if (d > 240) walkTo(e, G.hero.x, G.hero.y, e.speed, dt, 220);
    else { e.vx *= 0.8; e.vy *= 0.8; }
  },
  pick(G, e) {
    const d = dHero(G, e.x, e.y);
    if (e.phase === 1) return choose(G, e, [['sweep', d < 330 ? 4 : 0], ['slam', d < 520 ? 3.4 : 1], ['anvil', d > 300 ? 3 : 0.6], ['breath', d < 620 ? 1.8 : 0.4]]);
    if (e.phase === 2) return choose(G, e, [['heat', 3.4], ['chain', 2.6], ['sweep', d < 330 ? 3 : 0], ['slam', 1.6], ['anvil', d > 300 ? 2.4 : 0.6], ['breath', 1.6]]);
    return choose(G, e, [['pour', 3.4], ['heat', 2.4], ['chain', 2.4], ['sweep', d < 330 ? 3 : 0], ['anvil', d > 300 ? 2 : 0.4], ['breath', 1.4]]);
  },
  phaseStart(G, e, n) { e.tempo = n === 2 ? 1.18 : 1.28; e.speed = e.baseSpeed * (n === 2 ? 1.35 : 1.55); },
  phase(G, e, n) {
    G.bus.emit('bossSetPiece', { id: 'aurum', name: n === 2 ? 'stoke' : 'pour' });
    e.cd.heat = G.t + 1.5;
    if (n === 3) e.cd.pour = G.t + 0.8;
    // ring of molten splashes from the transformation
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; pool(G, e, e.x + Math.cos(a) * 260, e.y + Math.sin(a) * 180, 70, 5); }
  },
  moves: {
    slam: slamMove(1),
    chain: slamMove(3),
    sweep: {
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'wind') {
          if (a.t < a.W * 0.65) { e.aim = aHero(G, e.x, e.y); e.facing = e.aim; }
          if (once(a, 'tg')) a.tg = tele(G, e, { kind: 'cone', x: e.x, y: e.y, r: m.r, angle: e.aim, arc: coneArc(m.arc), max: a.W });
          a.tg.angle = e.aim;
        } else if (s === 'act' && once(a, 'hit')) {
          if (inArc(G, e.x, e.y, m.r, e.aim, m.arc)) hitHero(G, e, m.dmg, e.x, e.y, { kb: 820 });
          G.bus.emit('bossImpact', { id: 'aurum', x: e.x + Math.cos(e.aim) * 200, y: e.y + Math.sin(e.aim) * 140, r: 100, item: 'sweep' });
        }
        return s === 'done';
      },
    },
    anvil: {
      start(G, e, a, m) {
        stage(G, e, a, m);
      },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'wind') { e.aim = aHero(G, e.x, e.y); e.facing = e.aim; }
        if (s === 'wind' && a.t > a.W * 0.35 && once(a, 'aim')) {
          // the anvil is aimed (and its landing marked) while still overhead
          const n = e.phase > 1 ? 2 : 1;
          a.targets = [];
          for (let i = 0; i < n; i++) {
            const p0 = i === 0 ? lead(G, 0.55) : { x: G.hero.x + (G.rng.ai() - 0.5) * 420, y: G.hero.y + (G.rng.ai() - 0.5) * 300 };
            const p = clampToArena(G, p0.x, p0.y, 0.9);
            const fall = (a.W * 0.65) + m.act / (e.tempo || 1) + i * 0.25;
            a.targets.push(p);
            tele(G, e, { kind: 'circle', x: p.x, y: p.y, r: m.r, max: fall });
            hazard(G, e, 'impact', {
              x: p.x, y: p.y, r: m.r, fall, life: fall + 1, item: 'anvil', dmgv: m.dmg, sx: e.x, sy: e.y,
              after: (G2, b, z) => { shock(G2, b, z.x, z.y, { wave: m.wave, waveSpeed: 480, waveW: 26, dmg: m.dmg }); pool(G2, b, z.x, z.y, 90, m.molten); },
            });
          }
        }
        return s === 'done';
      },
    },
    breath: {
      start(G, e, a, m) { stage(G, e, a, m); e.aim = aHero(G, e.x, e.y); a.tg = tele(G, e, { kind: 'cone', x: e.x, y: e.y, r: 600, angle: e.aim, arc: coneArc(m.arc), max: a.W }); },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'wind' && a.t < a.W * 0.6) { e.aim = aHero(G, e.x, e.y); e.facing = e.aim; a.tg.angle = e.aim; }
        if (s === 'act') {
          // the stream drifts slowly toward Iri
          const want = aHero(G, e.x, e.y);
          let d = want - e.aim; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
          e.aim += clamp(d, -0.5 * dt, 0.5 * dt);
          // the stream's cone stays on the floor while it pours, turning with it
          if (!a.lv) { if (a.tg) a.tg.done = true; a.lv = tele(G, e, { kind: 'cone', live: true, x: e.x, y: e.y, r: 600, angle: e.aim, arc: coneArc(m.arc), max: a.A }); }
          a.lv.angle = e.aim;
          a.acc = (a.acc || 0) + dt;
          while (a.acc >= m.rate) {
            a.acc -= m.rate;
            const ang = e.aim + (G.rng.ai() - 0.5) * m.arc;
            const sp = m.speed * (0.8 + G.rng.ai() * 0.4);
            const mx = e.x + Math.cos(e.aim) * 70, my = e.y + Math.sin(e.aim) * 50;
            shot(G, e, { kind: 'boss:spark', x: mx, y: my, z: 120, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 10, dmg: m.dmg, life: 1.25, element: 'fire', burn: 2 });
          }
        } else if (a.lv) { a.lv.done = true; }
        return s === 'done';
      },
      abort(G, e, a) { if (a.lv) a.lv.done = true; },
    },
    heat: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        // three safe circles: one always within reach of Iri
        const A = arena(G);
        const safe = [];
        const near = clampToArena(G, G.hero.x + (G.rng.ai() - 0.5) * 520, G.hero.y + (G.rng.ai() - 0.5) * 360, 0.72);
        safe.push({ x: near.x, y: near.y, r: m.safeR });
        for (let tries = 0; safe.length < m.safe && tries < 60; tries++) {
          const p = arenaPoint(G, 0.78);
          if (safe.every((s) => Math.hypot(s.x - p.x, s.y - p.y) > 430) && Math.hypot(p.x - e.x, p.y - e.y) > 260) safe.push({ x: p.x, y: p.y, r: m.safeR });
        }
        a.zone = hazard(G, e, 'heat', { x: A.cx, y: A.cy, warn: a.W, life: a.W + a.A + 0.2, safe, tick: m.tick, dmgv: m.dmg });
        G.bus.emit('bossSetPiece', { id: 'aurum', name: 'heat' });
      },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        return s === 'done';
      },
      abort(G, e, a) { if (a.zone) a.zone.life = Math.min(a.zone.life, 0.4); },
    },
    pour: {
      start(G, e, a, m) { stage(G, e, a, m); a.base = aHero(G, e.x, e.y); G.bus.emit('bossSetPiece', { id: 'aurum', name: 'pour' }); },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        const period = a.A / m.waves;
        for (let w = 0; w < m.waves; w++) {
          const at = a.W + w * period;
          const base = a.base + w * (Math.PI / m.lines);
          // warn each wave 0.75 s ahead (the first during the wind-up)
          if (a.t >= at - 0.75 && once(a, 'tg' + w)) {
            for (let i = 0; i < m.lines; i++) { const ang = base + (i / m.lines) * TAU; tele(G, e, { kind: 'line', x: e.x + Math.cos(ang) * 90, y: e.y + Math.sin(ang) * 70, x2: e.x + Math.cos(ang) * m.len, y2: e.y + Math.sin(ang) * m.len, w: m.w, max: 0.75 }); }
          }
          if (a.t >= at && once(a, 'go' + w)) {
            for (let i = 0; i < m.lines; i++) { const ang = base + (i / m.lines) * TAU; hazard(G, e, 'spikeLine', { x: e.x + Math.cos(ang) * 90, y: e.y + Math.sin(ang) * 70, ang, len: m.len, w: m.w, speed: m.speed, front: 0, hold: 0.45, life: 3, dmgv: m.dmg, theme: 'molten', seed: w * 10 + i }); }
            G.bus.emit('bossImpact', { id: 'aurum', x: e.x, y: e.y, r: 160, item: 'hammer' });
          }
        }
        return s === 'done';
      },
    },
  },
};

function slamMove(n) {
  return {
    start(G, e, a, m) { a.i = 0; },
    update(G, e, a, dt, m) {
      const last = a.i >= n - 1;
      const s = stage(G, e, a, m, 1);
      if (s === 'wind') {
        if (a.t < a.W * 0.6) {
          e.aim = aHero(G, e.x, e.y); e.facing = e.aim;
          // the colossus steps into each strike of a chain
          if (n > 1) { e.vx = Math.cos(e.aim) * e.speed * 1.2; e.vy = Math.sin(e.aim) * e.speed * 1.2; }
          else { e.vx = e.vy = 0; }
        } else { e.vx = e.vy = 0; }
        const reach = Math.min(m.reach, Math.max(60, dHero(G, e.x, e.y) - 10));
        a.tx = e.x + Math.cos(e.aim) * reach; a.ty = e.y + Math.sin(e.aim) * reach * 0.8;
        if (once(a, 'tg' + a.i)) a.tg = tele(G, e, { kind: 'circle', x: a.tx, y: a.ty, r: m.r, max: a.W - a.t });
        if (a.t < a.W * 0.6) { a.tg.x = a.tx; a.tg.y = a.ty; }
        else { a.tx = a.tg.x; a.ty = a.tg.y; }
      } else if (s === 'act') {
        e.vx = e.vy = 0;
        if (once(a, 'hit' + a.i)) {
          a.tx = a.tg.x; a.ty = a.tg.y;
          if (inCircle(G, a.tx, a.ty, m.r)) hitHero(G, e, m.dmg, a.tx, a.ty, { kb: 700 });
          shock(G, e, a.tx, a.ty, Object.assign({ r0: m.r * 0.85 }, m));
          pool(G, e, a.tx, a.ty, 110, (m.molten ?? 5) + (e.phase > 1 ? 2 : 0));
          G.bus.emit('bossImpact', { id: 'aurum', x: a.tx, y: a.ty, r: m.r, item: 'hammer' });
        }
      } else if (s === 'rec' && !last && a.t > a.W + a.A + a.R * 0.3) {
        a.i++; a.t = 0; a.once = {};
      }
      e.chainI = a.i;
      return s === 'done' && last;
    },
  };
}
