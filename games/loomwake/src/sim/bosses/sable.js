// Sable, the Unweaver (The Unwoven, final boss).
// Phase 1, masked: a duel. Telegraphed lunges, a three-cut combo, a thread
// snare that drags Iri in (dash to snap it), an en-garde stance that punishes
// standing close, and Echoes of Iri.
// Phase 2 (52%), unmasked: Iri's dark mirror. He copies Iri's dash (i-frames
// and afterimages; he answers Iri's own dashes), Iri's combo, and twisted
// versions of the patron powers Iri carries this run. A black-thread storm
// slashes across the arena and the room unravels from its edges.
// True-ending mode (opts.trueEnding / G.run.trueEnding): at 12% the fight stops
// for the choice (runner: 'bossChoice', resolveBossChoice(G, 'braid'|'cut')).
import { TAU, clamp, wrapAng, segDist } from '../../core/math.js';
import { SABLE_MIRRORS } from '../../content/bosses.js';
import { stage, once, choose, summon, aliveSummons, walkTo, face, tele, hazard, hitHero, inArc, inCircle, inLine, dHero, aHero, arena, clampToArena, shot, bark, insideArena, pushHero, hazardsOf, coneArc } from './common.js';

const lead = (G, t) => ({ x: G.hero.x + (G.hero.vx || 0) * t, y: G.hero.y + (G.hero.vy || 0) * t });

function heroPatrons(G) {
  const out = new Set();
  for (const b of (G.run && G.run.boons) || []) {
    if (b.patron) out.add(b.patron);
    else if (typeof b.id === 'string') { const p = b.id.split(/[._]/)[0]; if (SABLE_MIRRORS[p]) out.add(p); }
  }
  return [...out].filter((p) => SABLE_MIRRORS[p]);
}

export default {
  id: 'sable',
  introTime: 3.0, dieTime: 3.0, phaseTime: 3.0,
  init(G, e) {
    e.r = 30; e.masked = true; e.orbit = 1; e.mirrors = heroPatrons(G); e.lastHeroDash = false; e.ghosts = 0;
  },
  gap(G, e) { return (e.phase > 1 ? 0.28 : 0.45) + G.rng.ai() * 0.35; },
  tick(G, e, dt) {
    // answer Iri's dash with his own (phase 2)
    const h = G.hero;
    const dashing = !!(h && (h.dashing || h.state === 'dash'));
    if (dashing && !e.lastHeroDash) e.heroDashed = G.t;
    e.lastHeroDash = dashing;
  },
  idle(G, e, dt) {
    const d = dHero(G, e.x, e.y), a = aHero(G, e.x, e.y);
    if (G.rng.ai() < dt * 0.4) e.orbit *= -1;
    const want = e.phase > 1 ? 230 : 270;
    const tx = G.hero.x - Math.cos(a) * want + Math.cos(a + Math.PI / 2) * 130 * e.orbit;
    const ty = G.hero.y - Math.sin(a) * want + Math.sin(a + Math.PI / 2) * 130 * e.orbit;
    const p = clampToArena(G, tx, ty, 0.75);
    walkTo(e, p.x, p.y, e.speed * (e.phase > 1 ? 0.75 : 0.6), dt, 8);
    // a mirrored dash interrupts the pause
    if (e.phase > 1 && e.heroDashed && G.t - e.heroDashed < 0.2 && (e.cd.dash ?? 0) <= G.t && G.rng.ai() < 0.6) { e.gap = 0; e.wantDash = true; e.heroDashed = 0; }
  },
  pick(G, e) {
    const d = dHero(G, e.x, e.y);
    if (e.wantDash) { e.wantDash = false; return 'dash'; }
    if (e.phase === 1) return choose(G, e, [
      ['combo', d < 200 ? 4 : 0.6], ['lunge', d > 180 ? 3.2 : 1], ['snare', d > 220 ? 2 : 0.4],
      ['riposte', d < 260 ? 1.4 : 0], ['echoes', aliveSummons(G, e) === 0 ? 1.6 : 0],
    ]);
    const low = e.hp / e.maxHp < 0.3;
    return choose(G, e, [
      ['dash', 2.2], ['combo', d < 200 ? 3.4 : 0.8], ['lunge', d > 180 ? 2 : 0.6], ['snare', d > 220 ? 1.2 : 0.3],
      ['mirror', 2.6], ['storm', low ? 3.6 : 2], ['echoes', aliveSummons(G, e) === 0 ? 1 : 0],
    ]);
  },
  phaseStart(G, e) { e.masked = false; e.tempo = 1.12; e.speed *= 1.1; },
  phase(G, e) {
    G.bus.emit('bossSetPiece', { id: 'sable', name: 'unmask' });
    hazard(G, e, 'edge', { s: 1.02, target: 0.84, rate: 0.03, tick: 0.5, dmgv: 10, life: 1e9, theme: 'void' });
    G.bus.emit('bossSetPiece', { id: 'sable', name: 'unravel' });
    e.mirrors = heroPatrons(G);
    e.cd.storm = G.t + 2.5;
  },
  moves: {
    lunge: {
      start(G, e, a, m) { stage(G, e, a, m); e.aim = aHero(G, e.x, e.y); a.tg = tele(G, e, { kind: 'line', x: e.x, y: e.y, x2: e.x, y2: e.y, w: m.w, max: a.W }); },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        if (s === 'wind') {
          e.vx = e.vy = 0;
          if (a.t < a.W * 0.55) { e.aim = aHero(G, e.x, e.y); e.facing = e.aim; }
          const L = m.len + (e.phase > 1 ? 80 : 0);
          a.tg.x = e.x; a.tg.y = e.y; a.tg.x2 = e.x + Math.cos(e.aim) * L; a.tg.y2 = e.y + Math.sin(e.aim) * L;
          a.L = L; a.sx = e.x; a.sy = e.y;
        } else if (s === 'act') {
          const v = a.L / a.A;
          e.vx = Math.cos(e.aim) * v; e.vy = Math.sin(e.aim) * v;
          e.ghost = 1;
          if (!a.hit && segDist(G.hero.x, G.hero.y, a.sx, a.sy, e.x + e.vx * dt, e.y + e.vy * dt) < m.w / 2 + 16) { if (hitHero(G, e, m.dmg, e.x, e.y, { kb: 520 })) a.hit = true; }
        } else { e.vx *= 0.75; e.vy *= 0.75; e.ghost = 0; }
        return s === 'done';
      },
      abort(G, e) { e.ghost = 0; },
    },
    combo: comboMove(),
    snare: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        a.tg = tele(G, e, { kind: 'line', x: e.x, y: e.y, x2: G.hero.x, y2: G.hero.y, w: 18, max: a.W, color: '#ff3d5e' });
      },
      update(G, e, a, dt, m, def) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'wind') {
          e.aim = aHero(G, e.x, e.y); e.facing = e.aim;
          a.tg.x = e.x; a.tg.y = e.y; a.tg.x2 = e.x + Math.cos(e.aim) * m.range; a.tg.y2 = e.y + Math.sin(e.aim) * m.range;
          return false;
        }
        if (s === 'act') {
          if (!a.head) {
            a.head = { x: e.x, y: e.y - 0, d: 0, vx: Math.cos(e.aim) * m.speed, vy: Math.sin(e.aim) * m.speed };
            a.tz = hazard(G, e, 'tether', { x: e.x, y: e.y, hx: e.x, hy: e.y, bound: false, life: 3, a: e.id });
          }
          const H = a.head;
          if (!a.bound && !a.missed) {
            H.x += H.vx * dt; H.y += H.vy * dt; H.d += m.speed * dt;
            if (inCircle(G, H.x, H.y, 14)) {
              if (hitHero(G, e, m.dmg, H.x, H.y, { kb: 0 })) { a.bound = true; a.boundT = 0; G.bus.emit('snareHit', { boss: 'sable' }); }
              else a.missed = true;
            }
            if (H.d > m.range) a.missed = true;
          }
          if (a.bound) {
            a.boundT += dt;
            const h = G.hero;
            H.x = h.x; H.y = h.y;
            const dashing = h.dashing || h.state === 'dash';
            if (dashing || a.boundT > 0.95) { a.bound = false; a.snapped = true; a.missed = true; G.bus.emit('bossSnap', { id: 'sable', x: h.x, y: h.y }); }
            else {
              const ang = Math.atan2(e.y - h.y, e.x - h.x), dd = dHero(G, e.x, e.y);
              if (dd > 90) { h.kx = Math.cos(ang) * m.pull; h.ky = Math.sin(ang) * m.pull; }
              else if (!a.cut) { a.cut = true; a.cutAt = a.t; a.cutTg = tele(G, e, { kind: 'circle', x: e.x, y: e.y, r: 130, max: 0.38 }); }
            }
          }
          if (a.missed && !a.bound && !a.cut) {
            // reel the thread back in
            H.x += (e.x - H.x) * Math.min(1, dt * 12); H.y += (e.y - H.y) * Math.min(1, dt * 12);
          }
          if (a.cut && a.t - a.cutAt >= 0.38 && once(a, 'cutHit')) {
            if (inCircle(G, e.x, e.y, 130)) hitHero(G, e, 16, e.x, e.y, { kb: 560 });
            a.bound = false; a.missed = true;
          }
          if (a.tz) { a.tz.x = e.x; a.tz.y = e.y; a.tz.hx = H.x; a.tz.hy = H.y; a.tz.bound = a.bound; }
        } else if (a.tz) { a.tz.life = 0; a.tz = null; }
        return s === 'done';
      },
      abort(G, e, a) { if (a.tz) a.tz.life = 0; },
    },
    riposte: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        a.hitAt = e.lastDamagedT || -9;
        a.tg = tele(G, e, { kind: 'circle', x: e.x, y: e.y, r: 160, max: a.W + a.A, color: '#ff3d5e' });
      },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        a.tg.x = e.x; a.tg.y = e.y;
        // struck while en garde: the counter comes early (still 0.35 s of warning)
        if (s === 'act' && !a.early && (e.lastDamagedT || -9) > a.hitAt + 0.01) {
          a.early = true; a.strikeAt = a.t + 0.36;
          a.tg.t = 0.36; a.tg.max = Math.max(0.36, a.tg.max);
          e.riposteFlash = G.t;   // when the counter was triggered (painters flash from it)
        }
        const strike = a.early ? a.t >= a.strikeAt : s === 'rec';
        if (strike && once(a, 'hit')) {
          if (inCircle(G, e.x, e.y, 160)) hitHero(G, e, m.dmg, e.x, e.y, { kb: 640 });
          G.bus.emit('bossImpact', { id: 'sable', x: e.x, y: e.y, r: 160, item: 'riposte' });
          if (a.early) { a.t = a.W + a.A; }
        }
        return s === 'done';
      },
    },
    echoes: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        a.pts = [-1, 1].map((sd) => { const ang = aHero(G, e.x, e.y) + sd * 1.9; return clampToArena(G, G.hero.x + Math.cos(ang) * 260, G.hero.y + Math.sin(ang) * 200, 0.8); });
        for (const p of a.pts) tele(G, e, { kind: 'circle', x: p.x, y: p.y, r: 54, max: a.W, color: '#c48bff' });
      },
      update(G, e, a, dt, m, def) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'act' && once(a, 'go')) {
          const room = Math.max(0, (m.max || 2) - aliveSummons(G, e));
          summon(G, e, m.kind, a.pts.slice(0, room));
          bark(G, e, 'summon', def, { pri: 2 });
        }
        return s === 'done';
      },
    },
    dash: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        // dash past Iri to their flank, or mirror Iri's own dash direction
        const h = G.hero;
        const a0 = aHero(G, e.x, e.y);
        const side = G.rng.ai() < 0.5 ? 1 : -1;
        let ang = a0 + side * 0.55;
        if (h.dashDir && (h.dashing || h.state === 'dash')) ang = Math.atan2(h.dashDir.y, h.dashDir.x);
        let p = { x: e.x + Math.cos(ang) * m.dist, y: e.y + Math.sin(ang) * m.dist };
        if (!insideArena(G, p.x, p.y, 60)) { ang = a0 - side * 0.55; p = clampToArena(G, e.x + Math.cos(ang) * m.dist, e.y + Math.sin(ang) * m.dist, 0.8); }
        a.ang = Math.atan2(p.y - e.y, p.x - e.x); a.L = Math.hypot(p.x - e.x, p.y - e.y);
        e.aim = a.ang;
        a.sx = e.x; a.sy = e.y;
        a.tg = tele(G, e, { kind: 'line', x: e.x, y: e.y, x2: p.x, y2: p.y, w: 40, max: a.W });
      },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        if (s === 'wind') { e.vx = e.vy = 0; }
        else if (s === 'act') {
          const v = a.L / a.A;
          e.vx = Math.cos(a.ang) * v; e.vy = Math.sin(a.ang) * v;
          e.inv = Math.max(e.inv || 0, 0.05); e.ghost = 1;
          if (!a.hit && segDist(G.hero.x, G.hero.y, a.sx, a.sy, e.x, e.y) < 36) { if (hitHero(G, e, 12, e.x, e.y, { kb: 400 })) a.hit = true; }
        } else {
          e.vx *= 0.7; e.vy *= 0.7; e.ghost = 0;
          // a dash-strike follows half the time, like Iri's
          if (once(a, 'next') && G.rng.ai() < 0.55 && dHero(G, e.x, e.y) < 220) { e.cd.combo = 0; e.gap = 0; }
        }
        return s === 'done';
      },
      abort(G, e) { e.ghost = 0; },
    },
    mirror: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        const pool = e.mirrors && e.mirrors.length ? e.mirrors : ['shade', 'storm'];
        a.kind = pool[Math.floor(G.rng.ai() * pool.length)];
        e.mirror = a.kind;
        G.bus.emit('bossMirror', { id: 'sable', patron: a.kind, name: SABLE_MIRRORS[a.kind].name });
        e.aim = aHero(G, e.x, e.y);
      },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        if (s === 'wind' && once(a, 'cast')) MIRRORS[a.kind](G, e, a, m);
        if (a.later) for (const l of a.later) if (!l.done && a.t >= l.at) { l.done = true; l.fn(); }
        if (s === 'done') e.mirror = null;
        return s === 'done';
      },
      abort(G, e) { e.mirror = null; },
    },
    storm: {
      start(G, e, a, m) {
        stage(G, e, a, m);
        G.bus.emit('bossSetPiece', { id: 'sable', name: 'storm' });
        a.plan = [];
        const A = arena(G);
        const n = m.lines + (e.hp / e.maxHp < 0.3 ? 4 : 0);
        for (let i = 0; i < n; i++) {
          // chords across the arena; every third one cuts through Iri's spot
          const through = i % 3 === 0 ? lead(G, 0.3) : { x: A.cx + (G.rng.ai() - 0.5) * A.rx * 1.4, y: A.cy + (G.rng.ai() - 0.5) * A.ry * 1.4 };
          const ang = G.rng.ai() * Math.PI;
          const L = Math.max(A.rx, A.ry) * 2.4;
          a.plan.push({ at: a.W + i * m.gap, x: through.x - Math.cos(ang) * L / 2, y: through.y - Math.sin(ang) * L / 2, x2: through.x + Math.cos(ang) * L / 2, y2: through.y + Math.sin(ang) * L / 2, through: i % 3 === 0 });
        }
      },
      update(G, e, a, dt, m) {
        const s = stage(G, e, a, m);
        e.vx = e.vy = 0;
        for (let i = 0; i < a.plan.length; i++) {
          const p = a.plan[i];
          if (a.t >= p.at - m.warn && once(a, 's' + i)) {
            // aimed lines re-aim at their warning moment so they stay fair and fresh
            if (p.through) { const c = G.hero; const ang = Math.atan2(p.y2 - p.y, p.x2 - p.x); const L = Math.hypot(p.x2 - p.x, p.y2 - p.y); p.x = c.x - Math.cos(ang) * L / 2; p.y = c.y - Math.sin(ang) * L / 2; p.x2 = c.x + Math.cos(ang) * L / 2; p.y2 = c.y + Math.sin(ang) * L / 2; }
            hazard(G, e, 'slash', { x: p.x, y: p.y, x2: p.x2, y2: p.y2, w: m.w, warn: m.warn, life: m.warn + 0.5, dmgv: m.dmg, theme: 'void' });
            tele(G, e, { kind: 'line', x: p.x, y: p.y, x2: p.x2, y2: p.y2, w: m.w, max: m.warn });
          }
        }
        return s === 'done' && a.t > (a.plan.length ? a.plan[a.plan.length - 1].at + 0.3 : 0);
      },
    },
  },
};

// Iri's three-cut combo, mirrored (phase 1 uses it too, slower).
function comboMove() {
  return {
    start(G, e, a, m) { a.i = 0; a.sub = 0; },
    update(G, e, a, dt, m) {
      const k = e.tempo || 1;
      const W = Math.max(0.35, (a.i === 0 ? m.wind : 0.4) / k), A = 0.12, R = a.i === m.hits - 1 ? m.rec / k : 0.06;
      const t = a.sub += dt;
      if (t < W) {
        e.pose = 'wind'; e.pt = t / W;
        // close the distance while winding up
        const d = dHero(G, e.x, e.y);
        if (t < W * 0.6) { e.aim = aHero(G, e.x, e.y); e.facing = e.aim; }
        if (d > m.reach * 0.75) { e.vx = Math.cos(e.aim) * e.speed * 1.1; e.vy = Math.sin(e.aim) * e.speed * 1.1; } else { e.vx = e.vy = 0; }
        if (once(a, 'tg' + a.i)) a.tg = tele(G, e, { kind: 'cone', x: e.x, y: e.y, r: m.reach, angle: e.aim, arc: coneArc(m.arc), max: W - t });
        a.tg.x = e.x; a.tg.y = e.y; if (t < W * 0.6) a.tg.angle = e.aim;
      } else if (t < W + A) {
        e.pose = 'act'; e.pt = (t - W) / A;
        e.vx = Math.cos(e.aim) * 240; e.vy = Math.sin(e.aim) * 240;
        if (once(a, 'hit' + a.i) && inArc(G, e.x, e.y, m.reach, e.aim, m.arc)) hitHero(G, e, m.dmg + (a.i === m.hits - 1 ? 4 : 0), e.x, e.y, { kb: a.i === m.hits - 1 ? 560 : 220 });
      } else if (t < W + A + R) {
        e.pose = 'rec'; e.pt = (t - W - A) / R; e.vx *= 0.7; e.vy *= 0.7;
      } else {
        if (a.i >= m.hits - 1) return true;
        a.i++; a.sub = 0;
      }
      e.comboI = a.i;
      return false;
    },
  };
}

// The patron powers he mirrors, darkened. Each is telegraphed for >= 0.6 s.
const MIRRORS = {
  dawn(G, e, a, m) {
    // Black Dawn: three delayed blasts around Iri
    const c = lead(G, 0.4);
    const pts = [c, { x: c.x + 170, y: c.y - 40 }, { x: c.x - 150, y: c.y + 70 }];
    pts.forEach((p, i) => { const q = clampToArena(G, p.x, p.y, 0.9); const warn = 0.8 + i * 0.2; hazard(G, e, 'burst', { x: q.x, y: q.y, r: 140, warn, life: warn + 0.6, dmgv: m.dmg, element: 'dawn', color: SABLE_MIRRORS.dawn.color, theme: 'dawn' }); tele(G, e, { kind: 'circle', x: q.x, y: q.y, r: 140, max: warn }); });
  },
  tide(G, e) {
    // Undertow: a ring of black water with two gaps that drags inward
    hazard(G, e, 'wave', { x: e.x, y: e.y, r: 30, speed: 380, w: 34, maxR: 1100, gaps: [{ a: aHero(G, e.x, e.y) + 1.6, arc: 0.7 }, { a: aHero(G, e.x, e.y) - 1.6, arc: 0.7 }], spin: 0, life: 4, dmgv: 14, theme: 'tide', element: 'water' });
    tele(G, e, { kind: 'circle', x: e.x, y: e.y, r: 120, max: 0.6 });
  },
  storm(G, e, a, m) {
    // Dead Storm: lightning walks across the floor toward Iri
    const n = 6;
    const sx = e.x, sy = e.y, tx = G.hero.x, ty = G.hero.y;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n;
      const x = sx + (tx - sx) * k * 1.25 + (G.rng.ai() - 0.5) * 60, y = sy + (ty - sy) * k * 1.25 + (G.rng.ai() - 0.5) * 60;
      const q = clampToArena(G, x, y, 0.92), warn = 0.6 + i * 0.12;
      hazard(G, e, 'burst', { x: q.x, y: q.y, r: 90, warn, life: warn + 0.5, dmgv: Math.round(m.dmg * 0.8), element: 'storm', color: SABLE_MIRRORS.storm.color, theme: 'storm' });
      tele(G, e, { kind: 'circle', x: q.x, y: q.y, r: 90, max: warn });
    }
  },
  stone(G, e, a, m) {
    // Faultline: three cracks of void race along the ground after their warning
    const base = aHero(G, e.x, e.y);
    for (const off of [-0.3, 0, 0.3]) {
      const ang = base + off;
      tele(G, e, { kind: 'line', x: e.x, y: e.y, x2: e.x + Math.cos(ang) * 900, y2: e.y + Math.sin(ang) * 900, w: 54, max: 0.6 });
      hazard(G, e, 'spikeLine', { x: e.x + Math.cos(ang) * 40, y: e.y + Math.sin(ang) * 40, ang, len: 900, w: 54, speed: 1400, front: 0, wait: 0.6, hold: 0.35, life: 3.6, dmgv: m.dmg, theme: 'void' });
    }
  },
  shade(G, e, a, m) {
    // Second Shadow: two shadows of him slash through Iri from the sides
    const h = G.hero;
    for (const sd of [-1, 1]) {
      const ang = aHero(G, e.x, e.y) + sd * Math.PI / 2;
      const x = h.x + Math.cos(ang) * 300, y = h.y + Math.sin(ang) * 300;
      const x2 = h.x - Math.cos(ang) * 300, y2 = h.y - Math.sin(ang) * 300;
      hazard(G, e, 'slash', { x, y, x2, y2, w: 50, warn: 0.75 + (sd > 0 ? 0.25 : 0), life: 1.5, dmgv: m.dmg, theme: 'shade', shadow: true });
      tele(G, e, { kind: 'line', x, y, x2, y2, w: 50, max: 0.75 + (sd > 0 ? 0.25 : 0) });
    }
  },
  wind(G, e, a, m) {
    // Cutting Wind: three crescent gusts, loosed after their warning
    const base = aHero(G, e.x, e.y);
    tele(G, e, { kind: 'cone', x: e.x, y: e.y, r: 700, angle: base, arc: 0.55, max: 0.6 });
    a.later = (a.later || []).concat([{ at: a.t + 0.6, fn: () => {
      for (const off of [-0.35, 0, 0.35]) {
        const ang = base + off;
        shot(G, e, { kind: 'boss:gust', x: e.x + Math.cos(ang) * 40, y: e.y + Math.sin(ang) * 30, z: 40, vx: Math.cos(ang) * 640, vy: Math.sin(ang) * 640, ang, r: 24, dmg: Math.round(m.dmg * 0.8), life: 2.2 });
      }
    } }]);
  },
};
