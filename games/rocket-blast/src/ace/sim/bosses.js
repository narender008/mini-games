// The five sector bosses. A boss is a body (B.x, B.y, swaying near the top)
// carrying parts; each part has hit points (or none, for hazards like the
// Crusher's jaws), a phase it belongs to, and flags: vuln (shots hurt it),
// solid (shots stop on it), hurt (touching it hurts the player), open (the
// view opens hatches/irises), tele (a telegraph line, as on enemies).
//
// Phases advance when the current phase's parts are destroyed, or for some
// bosses when the core drops under half (phaseDone). Each phase has a list of
// attacks played in turn with a gap between; an attack returns how long it
// keeps the boss busy. B.hp/B.maxHp sum every part with hit points, so the
// bar drains across the whole fight. Layout scales with the field width
// (B.scale) so the fights fit a phone in portrait.
//
//   hauler       Quarry Hauler: two sweeping drill arms + ore volleys, then the core.
//   tempest      Tempest Array: three pylons linked by lightning that drop into
//                the player's zone, then the central coil (beams, spirals).
//   crusher      Foundry Crusher: four turrets, then the iris core (rings,
//                spirals), enraged under half; the jaws slam all fight.
//   brood        Brood Engine: pods launch drones, spores spiral; core; frenzy.
//   dreadnought  The Dreadnought: broadside batteries, missile racks, beam
//                cannon, final core.
import { BOSSES } from './data.js';
import { clamp, range, rnd, TAU } from './rng.js';
import { shoot, aimed, fan, ring, line, spiral, burst, beam, aimAt, cancelEmitters, MAX_BULLETS } from './patterns.js';
import { scoreKill } from './score.js';
import { dropPickup, zone, hurtPlayer } from './player.js';
import { spawnEnemy } from './enemies.js';

const DOWN = -Math.PI / 2;

function part(id, kind, ox, oy, r, hp, phase, o = {}) {
  return {
    id,
    kind,
    x: 0,
    y: 0,
    ox,
    oy,
    r,
    hp,
    maxHp: hp,
    dead: false,
    gone: false,
    open: false,
    vuln: false,
    phase,
    hitT: 9,
    tele: null,
    hurt: false,
    solid: true,
    free: false, // the boss update places it itself
    value: 2500,
    ang: DOWN,
    ...o,
  };
}

const P = (B, id) => B.parts.find((p) => p.id === id);
const alive = (p) => p && !p.dead;

// ------------------------------------------------------------ shared moves

function sway(S, B, dt, amp = 1, speed = 0.33) {
  const f = S.field;
  const room = Math.max(0, f.halfW - B.halfWidth * B.scale - 0.4);
  B.x = Math.min(room, amp * 3.2 * B.scale) * Math.sin(B.t * speed);
}

function later(B, t, fn) {
  B.later.push({ t, fn });
}

// a jaw/pylon drop cycle: tele, down, hold, up. Returns 0..1 drop amount
function stepDrop(d, dt) {
  if (!d || d.k === 'idle') return 0;
  d.t += dt;
  const T = d.times;
  if (d.k === 'tele' && d.t >= T[0]) (d.k = 'down'), (d.t = 0);
  if (d.k === 'down' && d.t >= T[1]) (d.k = 'hold'), (d.t = 0);
  if (d.k === 'hold' && d.t >= T[2]) (d.k = 'up'), (d.t = 0);
  if (d.k === 'up' && d.t >= T[3]) (d.k = 'idle'), (d.t = 0);
  if (d.k === 'tele') return 0;
  if (d.k === 'down') {
    const u = d.t / T[1];
    return u * u * (3 - 2 * u);
  }
  if (d.k === 'hold') return 1;
  if (d.k === 'up') {
    const u = 1 - d.t / T[3];
    return u * u * (3 - 2 * u);
  }
  return 0;
}

const startDrop = (times) => ({ k: 'tele', t: 0, times });

// ------------------------------------------------------------ definitions

const DEFS = {
  // ---------------------------------------------------------- Quarry Hauler
  hauler: {
    halfWidth: 5,
    gaps: [1.2, 0.95],
    parts: () => [
      part('armL', 'drill', -3.4, -0.4, 0.95, 400, 1, { free: true, hurt: true }),
      part('armR', 'drill', 3.4, -0.4, 0.95, 400, 1, { free: true, hurt: true }),
      part('core', 'core', 0, -0.2, 1.25, 1150, 2, { value: 6000 }),
    ],
    update(S, B, dt) {
      sway(S, B, dt, 1, 0.3);
      const m = B.mem;
      m.sweep = Math.max(0, (m.sweep || 0) - dt);
      const k = m.sweep > 0 ? 1 : 0;
      m.sw = (m.sw || 0) + (k - (m.sw || 0)) * (1 - Math.exp(-3 * dt));
      m.ph = (m.ph || 0) + dt * (0.9 + 1.3 * m.sw);
      for (const side of [-1, 1]) {
        const p = side < 0 ? B.parts[0] : B.parts[1];
        const amp = 0.32 + 0.55 * m.sw;
        const a = DOWN + side * 0.42 - side * amp * Math.sin(m.ph);
        p.px = B.x + p.ox * B.scale;
        p.py = B.y + p.oy * B.scale;
        p.ang = a;
        const len = 3.4 * B.scale;
        p.x = p.px + Math.cos(a) * len;
        p.y = p.py + Math.sin(a) * len;
      }
    },
    attacks: {
      1: [
        (S, B) => {
          const c = P(B, 'core');
          burst(S, c, { n: 2, interval: 0.6, per: 5, arc: 0.95, speed: 4.2, kind: 'ball', color: 'red', oy: -1 * B.scale });
          return 1.4;
        },
        (S, B) => {
          for (const p of B.parts) if (p.kind === 'drill' && alive(p)) burst(S, p, { n: 6, interval: 0.12, speed: 8, kind: 'needle', color: 'orange' });
          return 1.2;
        },
        (S, B) => {
          B.mem.sweep = 3.4;
          for (const p of B.parts) if (p.kind === 'drill' && alive(p)) burst(S, p, { n: 7, interval: 0.48, per: 3, arc: 0.6, speed: 4.6, kind: 'orb', color: 'magenta' });
          return 3.6;
        },
      ],
      2: [
        (S, B) => {
          const c = P(B, 'core');
          ring(S, c.x, c.y, 16, 3.8, 'orb', 'magenta', rnd(S.rng));
          later(B, 0.55, () => alive(c) && ring(S, c.x, c.y, 16, 3.8, 'orb', 'magenta', rnd(S.rng)));
          return 1.4;
        },
        (S, B) => {
          spiral(S, P(B, 'core'), { arms: 2, rate: 9, spin: rnd(S.rng) < 0.5 ? 1.7 : -1.7, speed: 4.4, dur: 3.2, kind: 'orb', color: 'orange' });
          return 3.4;
        },
        (S, B) => {
          burst(S, P(B, 'core'), { n: 2, interval: 0.6, per: 7, arc: 1.2, speed: 4.2, kind: 'ball', color: 'red', oy: -1 * B.scale });
          return 1.5;
        },
        (S, B) => {
          burst(S, P(B, 'core'), { n: 8, interval: 0.1, speed: 9.5, kind: 'needle', color: 'orange', oy: -1 * B.scale });
          return 1.3;
        },
      ],
    },
    enterPhase(S, B, n) {
      if (n === 2) {
        const c = P(B, 'core');
        c.open = true;
        c.vuln = true;
      }
    },
  },

  // ---------------------------------------------------------- Tempest Array
  tempest: {
    halfWidth: 5.2,
    gaps: [1.1, 0.95],
    parts: () => [
      part('pyL', 'pylon', -4.4, -0.6, 0.95, 420, 1, { free: true, hurt: true }),
      part('pyC', 'pylon', 0, -1.6, 0.95, 420, 1, { free: true, hurt: true }),
      part('pyR', 'pylon', 4.4, -0.6, 0.95, 420, 1, { free: true, hurt: true }),
      part('coil', 'coil', 0, 0.9, 1.35, 1500, 2, { value: 6000 }),
    ],
    update(S, B, dt) {
      sway(S, B, dt, 0.6, 0.25);
      const m = B.mem;
      const Z = zone(S);
      const low = Z.y1 - 2.2;
      for (const p of B.parts) {
        if (p.kind !== 'pylon') continue;
        const d = stepDrop(m[p.id], dt);
        const hx = B.x + p.ox * B.scale;
        const hy = B.y + p.oy * B.scale;
        p.x = hx;
        p.y = hy + (low - hy) * d;
        p.drop = d;
      }
      // the lightning links between neighbouring pylons
      const on = S.time - S.lastEmp > 2;
      for (const L of B.links) {
        const a = P(B, L.a);
        const b = P(B, L.b);
        const live = on && alive(a) && alive(b) && !B.dying;
        if (live && (!L.bullet || L.bullet.removed)) {
          if (S.bullets.length < MAX_BULLETS) {
            L.bullet = { id: -1, x: a.x, y: a.y, vx: 0, vy: 0, r: 0.2, kind: 'beam', color: 'cyan', t: 0, grazed: false, acc: 0, max: 0, home: 0, turn: 0, curve: 0, life: 1e9, x1: b.x, y1: b.y, link: true };
            S.bullets.push(L.bullet);
          }
        } else if (!live && L.bullet) {
          L.bullet.life = 0;
          L.bullet = null;
        }
        if (L.bullet) {
          L.bullet.x = a.x;
          L.bullet.y = a.y;
          L.bullet.x1 = b.x;
          L.bullet.y1 = b.y;
        }
      }
    },
    init(S, B) {
      B.links = [
        { a: 'pyL', b: 'pyC', bullet: null },
        { a: 'pyC', b: 'pyR', bullet: null },
      ];
    },
    attacks: {
      1: [
        (S, B) => dropPylon(S, B, B.mem.side = -(B.mem.side || 1)),
        (S, B) => {
          // discharge: the links rain two staggered curtains
          for (const L of B.links) {
            const a = P(B, L.a);
            const b = P(B, L.b);
            if (!alive(a) || !alive(b)) continue;
            const n = Math.max(4, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 1.5));
            line(S, a.x, a.y, b.x, b.y, n, DOWN, 3.3, 'orb', 'cyan');
            later(B, 0.7, () => alive(a) && alive(b) && line(S, a.x, a.y, b.x, b.y, n - 1, DOWN, 3.3, 'orb', 'cyan'));
          }
          for (const p of B.parts) if (p.kind === 'pylon' && alive(p) && B.links.every((L) => !(L.a === p.id || L.b === p.id) || !alive(P(B, L.a === p.id ? L.b : L.a)))) aimed(S, p.x, p.y, 5, 'orb', 'cyan', 5, 0.9);
          return 2;
        },
        (S, B) => {
          for (const p of B.parts) if (p.kind === 'pylon' && alive(p)) burst(S, p, { n: 2, interval: 0.5, per: 3, arc: 0.45, speed: 5.2, kind: 'orb', color: 'cyan' });
          return 1.5;
        },
        (S, B) => {
          const L = P(B, 'pyL');
          const R = P(B, 'pyR');
          if (alive(L) && alive(R) && alive(P(B, 'pyC'))) {
            dropPylon(S, B, -1);
            dropPylon(S, B, 1);
            burst(S, P(B, 'pyC'), { n: 5, interval: 0.5, speed: 6, kind: 'needle', color: 'orange', delay: 1.2 });
            return 6;
          }
          return dropPylon(S, B, alive(L) ? -1 : 1);
        },
      ],
      2: [
        (S, B) => {
          spiral(S, P(B, 'coil'), { arms: B.enraged ? 4 : 3, rate: 7, spin: rnd(S.rng) < 0.5 ? 1.4 : -1.4, speed: 4.2, dur: 3.4, kind: 'orb', color: 'cyan' });
          return 3.6;
        },
        (S, B) => {
          const c = P(B, 'coil');
          const px = S.player.x;
          const gap = 3.2 * Math.max(0.75, B.scale);
          for (const dx of [-gap, 0, gap]) beam(S, c, { ox: px + dx - c.x, oy: -1.2 * B.scale, ang: DOWN, tele: 1.05, life: 0.45, width: 0.32, color: 'cyan' });
          return 1.9;
        },
        (S, B) => {
          const c = P(B, 'coil');
          ring(S, c.x, c.y, 20, 3.6, 'orb', 'cyan', 0, null, 1.1, aimAt(S, c.x, c.y) + range(S.rng, -0.5, 0.5));
          later(B, 0.6, () => alive(c) && ring(S, c.x, c.y, 20, 3.6, 'orb', 'magenta', 0, null, 1.1, aimAt(S, c.x, c.y)));
          return 1.6;
        },
        (S, B) => {
          burst(S, P(B, 'coil'), { n: 3, interval: 0.4, per: 5, arc: 0.7, speed: 7.5, kind: 'needle', color: 'orange', oy: -1.2 * B.scale });
          return 1.5;
        },
      ],
    },
    enterPhase(S, B, n) {
      if (n === 2) {
        const c = P(B, 'coil');
        c.open = true;
        c.vuln = true;
      }
    },
  },

  // ---------------------------------------------------------- Foundry Crusher
  crusher: {
    halfWidth: 5.6,
    gaps: [1.05, 0.95, 0.8],
    parts: () => [
      part('t1', 'turret', -3.0, 1.0, 0.8, 250, 1),
      part('t2', 'turret', 3.0, 1.0, 0.8, 250, 1),
      part('t3', 'turret', -1.75, -1.35, 0.8, 250, 1),
      part('t4', 'turret', 1.75, -1.35, 0.8, 250, 1),
      part('core', 'core', 0, 0.15, 1.5, 1500, 2, { value: 8000 }),
      part('jawL', 'jaw', -4.7, -3.0, 1.25, 0, 0, { free: true, hurt: true, solid: false }),
      part('jawR', 'jaw', 4.7, -3.0, 1.25, 0, 0, { free: true, hurt: true, solid: false }),
    ],
    phaseDone(S, B) {
      if (B.phase === 2) return P(B, 'core').hp <= P(B, 'core').maxHp * 0.5;
      return null;
    },
    update(S, B, dt) {
      sway(S, B, dt, 0.5, 0.22);
      const m = B.mem;
      const Z = zone(S);
      for (const id of ['jawL', 'jawR']) {
        const p = P(B, id);
        const hx = B.x + p.ox * B.scale;
        const hy = B.y + p.oy * B.scale;
        const low = Z.y1 - 1.1;
        const d = stepDrop(m[id], dt);
        p.x = hx;
        p.y = hy + (low - hy) * d;
        p.drop = d;
        const dr = m[id];
        if (dr && dr.k === 'tele') p.tele = { x0: hx, y0: hy, x1: hx, y1: low - p.r * B.scale, k: dr.t / dr.times[0] };
        else p.tele = null;
      }
      for (const p of B.parts) if (p.kind === 'turret' && !p.dead) p.ang = aimAt(S, p.x, p.y);
    },
    attacks: {
      1: [
        (S, B) => {
          for (const p of B.parts) if (p.kind === 'turret' && alive(p)) burst(S, p, { n: 4, interval: 0.11, speed: 8.6, kind: 'needle', color: 'orange', delay: rnd(S.rng) * 0.4 });
          return 1.5;
        },
        (S, B) => slam(S, B, (B.mem.side = -(B.mem.side || 1))),
        (S, B) => {
          for (const p of B.parts) if (p.kind === 'turret' && alive(p)) aimed(S, p.x, p.y, 4.6, 'orb', 'magenta', 5, 1.0);
          return 1.4;
        },
      ],
      2: [
        (S, B) => {
          const c = P(B, 'core');
          ring(S, c.x, c.y, 18, 3.8, 'orb', 'orange', rnd(S.rng));
          later(B, 0.5, () => alive(c) && ring(S, c.x, c.y, 18, 3.8, 'orb', 'magenta', rnd(S.rng)));
          return 1.5;
        },
        (S, B) => {
          spiral(S, P(B, 'core'), { arms: 4, rate: 6, spin: (B.mem.spin = -(B.mem.spin || -1.5)), speed: 4.2, dur: 3.4, kind: 'orb', color: 'magenta' });
          return 3.6;
        },
        (S, B) => slam(S, B, (B.mem.side = -(B.mem.side || 1))),
        (S, B) => {
          burst(S, P(B, 'core'), { n: 2, interval: 0.55, per: 5, arc: 0.8, speed: 4.4, kind: 'ball', color: 'red' });
          return 1.4;
        },
      ],
      3: [
        (S, B) => {
          const c = P(B, 'core');
          spiral(S, c, { arms: 3, rate: 6, spin: 1.5, speed: 4, dur: 3.6, kind: 'orb', color: 'magenta' });
          spiral(S, c, { arms: 3, rate: 6, spin: -1.5, speed: 4, dur: 3.6, kind: 'orb', color: 'orange', a: DOWN + 0.5 });
          return 3.8;
        },
        (S, B) => {
          slam(S, B, -1);
          slam(S, B, 1);
          const c = P(B, 'core');
          later(B, 1.2, () => alive(c) && ring(S, c.x, c.y, 16, 3.6, 'orb', 'orange', rnd(S.rng)));
          return 2.6;
        },
        (S, B) => {
          burst(S, P(B, 'core'), { n: 3, interval: 0.45, per: 5, arc: 0.9, speed: 4.6, kind: 'ball', color: 'red' });
          return 1.7;
        },
        (S, B) => {
          const c = P(B, 'core');
          ring(S, c.x, c.y, 22, 3.6, 'orb', 'magenta', 0, null, 1, aimAt(S, c.x, c.y));
          burst(S, c, { n: 6, interval: 0.12, speed: 9, kind: 'needle', color: 'orange', delay: 0.5 });
          return 1.6;
        },
      ],
    },
    enterPhase(S, B, n) {
      const c = P(B, 'core');
      if (n >= 2) {
        c.open = true;
        c.vuln = true;
      }
    },
  },

  // ---------------------------------------------------------- Brood Engine
  brood: {
    halfWidth: 5.2,
    gaps: [1.0, 0.9, 0.75],
    parts: () => [
      part('podL', 'pod', -3.5, -0.5, 0.95, 300, 1),
      part('podR', 'pod', 3.5, -0.5, 0.95, 300, 1),
      part('podC', 'pod', 0, -1.9, 0.95, 300, 1),
      part('core', 'core', 0, 0.6, 1.45, 1600, 2, { value: 8000 }),
    ],
    phaseDone(S, B) {
      if (B.phase === 2) return P(B, 'core').hp <= P(B, 'core').maxHp * 0.5;
      return null;
    },
    update(S, B, dt) {
      sway(S, B, dt, 0.8, 0.3);
    },
    attacks: {
      1: [
        (S, B) => {
          for (const p of B.parts) if (p.kind === 'pod' && alive(p)) launchDarts(S, B, p, 2);
          return 1.6;
        },
        (S, B) => {
          spiral(S, P(B, 'core'), { arms: 2, rate: 7, spin: rnd(S.rng) < 0.5 ? 1.2 : -1.2, speed: 3.1, dur: 3.6, kind: 'orb', color: 'green' });
          return 3.2;
        },
        (S, B) => {
          for (const p of B.parts) if (p.kind === 'pod' && alive(p)) burst(S, p, { n: 2, interval: 0.45, per: 3, arc: 0.5, speed: 5, kind: 'orb', color: 'green' });
          return 1.4;
        },
      ],
      2: [
        (S, B) => {
          const c = P(B, 'core');
          spiral(S, c, { arms: 3, rate: 7, spin: 1.3, speed: 3.2, dur: 3.4, kind: 'orb', color: 'green' });
          later(B, 1.6, () => alive(c) && ring(S, c.x, c.y, 14, 3.4, 'orb', 'magenta', rnd(S.rng)));
          return 3.6;
        },
        (S, B) => {
          const c = P(B, 'core');
          const n = S.enemies.filter((e) => e.type === 'splitter').length;
          if (n < 2) {
            const e = spawnEnemy(S, 'splitter', c.x, c.y - 1, { kind: 'hover', hx: range(S.rng, -0.6, 0.6) * (S.field.halfW - 1.5), hy: c.y - 3.5 * B.scale, stay: 9, strafe: 1, sfreq: 0.6 });
            e.value = 150;
          }
          aimed(S, c.x, c.y - 1, 5.2, 'orb', 'green', 5, 0.8);
          return 1.4;
        },
        (S, B) => {
          burst(S, P(B, 'core'), { n: 6, interval: 0.14, speed: 8.5, kind: 'needle', color: 'orange' });
          return 1.4;
        },
        (S, B) => {
          const c = P(B, 'core');
          ring(S, c.x, c.y, 20, 3.5, 'orb', 'green', 0, null, 1.1, aimAt(S, c.x, c.y) + range(S.rng, -0.6, 0.6));
          return 1.1;
        },
      ],
      3: [
        (S, B) => {
          const c = P(B, 'core');
          spiral(S, c, { arms: 3, rate: 6, spin: 1.6, speed: 3.6, dur: 3.6, kind: 'orb', color: 'green' });
          spiral(S, c, { arms: 3, rate: 6, spin: -1.6, speed: 3.6, dur: 3.6, kind: 'orb', color: 'magenta', a: DOWN + 0.5 });
          return 3.8;
        },
        (S, B) => {
          launchDarts(S, B, P(B, 'core'), 4);
          burst(S, P(B, 'core'), { n: 3, interval: 0.4, per: 3, arc: 0.4, speed: 6, kind: 'needle', color: 'orange' });
          return 1.6;
        },
        (S, B) => {
          const c = P(B, 'core');
          ring(S, c.x, c.y, 22, 3.6, 'orb', 'green', rnd(S.rng));
          later(B, 0.45, () => alive(c) && ring(S, c.x, c.y, 22, 3.6, 'orb', 'magenta', rnd(S.rng)));
          return 1.5;
        },
      ],
    },
    enterPhase(S, B, n) {
      const c = P(B, 'core');
      if (n >= 2) {
        c.open = true;
        c.vuln = true;
      }
    },
  },

  // ---------------------------------------------------------- The Dreadnought
  dreadnought: {
    halfWidth: 5.8,
    gaps: [1.0, 0.95, 0.9, 0.75],
    parts: () => [
      part('b1', 'battery', -4.6, -0.9, 0.85, 230, 1),
      part('b2', 'battery', -2.6, -1.7, 0.85, 230, 1),
      part('b3', 'battery', 2.6, -1.7, 0.85, 230, 1),
      part('b4', 'battery', 4.6, -0.9, 0.85, 230, 1),
      part('rackL', 'rack', -3.4, 0.8, 1.0, 420, 2),
      part('rackR', 'rack', 3.4, 0.8, 1.0, 420, 2),
      part('cannon', 'cannon', 0, -1.3, 1.25, 650, 3, { value: 6000 }),
      part('core', 'core', 0, 0.7, 1.45, 1000, 4, { value: 12000 }),
    ],
    update(S, B, dt) {
      sway(S, B, dt, 0.45, 0.2);
      for (const p of B.parts) if ((p.kind === 'battery' || p.kind === 'cannon') && !p.dead) p.ang = aimAt(S, p.x, p.y);
    },
    attacks: {
      1: [
        (S, B) => {
          // broadside: the batteries fire in a ripple, outside in
          let i = 0;
          for (const id of ['b1', 'b4', 'b2', 'b3']) {
            const p = P(B, id);
            if (alive(p)) burst(S, p, { n: 3, interval: 0.12, per: 3, arc: 0.3, speed: 8, kind: 'needle', color: 'orange', delay: i++ * 0.3 });
          }
          return 2;
        },
        (S, B) => {
          for (const p of B.parts) if (p.kind === 'battery' && alive(p)) fan(S, p.x, p.y - 0.6, DOWN + (p.ox < 0 ? 0.25 : -0.25), 7, 1.3, 4.1, 'orb', 'magenta');
          return 1.5;
        },
        (S, B) => {
          const c = P(B, 'cannon');
          burst(S, c, { n: 2, interval: 0.6, per: 5, arc: 0.9, speed: 4.4, kind: 'ball', color: 'red' });
          return 1.4;
        },
      ],
      2: [
        (S, B) => {
          for (const p of B.parts) if (p.kind === 'rack' && alive(p)) missiles(S, B, p, 3);
          return 2.2;
        },
        (S, B) => {
          const c = P(B, 'cannon');
          burst(S, c, { n: 3, interval: 0.4, per: 5, arc: 0.8, speed: 7.5, kind: 'needle', color: 'orange' });
          return 1.6;
        },
        (S, B) => {
          for (const p of B.parts) if (p.kind === 'rack' && alive(p)) ring(S, p.x, p.y, 12, 3.6, 'orb', 'magenta', rnd(S.rng));
          return 1.2;
        },
      ],
      3: [
        (S, B) => {
          // the beam cannon: starts beside the player and sweeps away
          const c = P(B, 'cannon');
          const side = S.player.x > c.x ? -1 : 1;
          const a = aimAt(S, c.x, c.y) - side * 0.3;
          beam(S, c, { ang: a, tele: 1.2, life: 1.8, width: 0.5, sweep: -side * 0.42, color: 'red', oy: -1 * B.scale });
          later(B, 1.3, () => alive(c) && ring(S, c.x, c.y, 14, 3.4, 'orb', 'magenta', rnd(S.rng)));
          return 3.4;
        },
        (S, B) => {
          const c = P(B, 'cannon');
          for (const s of [-1, 1]) beam(S, c, { ang: DOWN + s * 0.42, tele: 1, life: 1.2, width: 0.42, color: 'red', oy: -1 * B.scale });
          burst(S, c, { n: 6, interval: 0.15, speed: 8, kind: 'needle', color: 'orange', delay: 1 });
          return 2.4;
        },
        (S, B) => {
          for (const p of B.parts) if (p.kind === 'rack' && alive(p)) missiles(S, B, p, 2);
          aimed(S, P(B, 'cannon').x, P(B, 'cannon').y, 4.4, 'ball', 'red', 5, 0.9);
          return 1.8;
        },
      ],
      4: [
        (S, B) => {
          spiral(S, P(B, 'core'), { arms: 4, rate: 6, spin: (B.mem.spin = -(B.mem.spin || -1.4)), speed: 4, dur: 3.6, kind: 'orb', color: 'magenta' });
          return 3.6;
        },
        (S, B) => {
          const c = P(B, 'core');
          beam(S, c, { tele: 0.9, life: 0.4, width: 0.3, color: 'red', lock: 0.6 });
          ring(S, c.x, c.y, 20, 3.6, 'orb', 'orange', 0, null, 1.1, aimAt(S, c.x, c.y) + 0.8);
          return 1.8;
        },
        (S, B) => {
          burst(S, P(B, 'core'), { n: 3, interval: 0.45, per: 5, arc: 0.9, speed: 4.6, kind: 'ball', color: 'red' });
          return 1.6;
        },
        (S, B) => {
          missiles(S, B, P(B, 'core'), 4);
          return 1.8;
        },
      ],
    },
    enterPhase(S, B, n) {
      for (const p of B.parts) if (p.phase === n) (p.vuln = true), (p.open = true);
    },
  },
};

// ------------------------------------------------------------ attack helpers

function dropPylon(S, B, side) {
  const id = side < 0 ? 'pyL' : 'pyR';
  const p = P(B, id);
  if (!alive(p)) return 0.2;
  B.mem[id] = startDrop([1.0, 1.3, 1.7, 1.3]);
  S.events.push({ type: 'telegraph', x: p.x, y: p.y, kind: 'pylon', id, dur: 1, enemy: 'boss', boss: true });
  const c = P(B, 'pyC');
  if (alive(c)) burst(S, c, { n: 3, interval: 0.7, per: 3, arc: 0.4, speed: 5, kind: 'orb', color: 'cyan', delay: 1.2 });
  return 5.4;
}

function slam(S, B, side) {
  const id = side < 0 ? 'jawL' : 'jawR';
  const p = P(B, id);
  const d = B.mem[id];
  if (d && d.k !== 'idle') return 0.3;
  B.mem[id] = startDrop([0.9, 0.22, 0.6, 1.0]);
  S.events.push({ type: 'telegraph', x: p.x, y: p.y, kind: 'jaw', id, dur: 0.9, enemy: 'boss', boss: true });
  later(B, 1.12, () => {
    S.events.push({ type: 'slam', x: p.x, y: p.y, id });
    ring(S, p.x, p.y, 10, 3.4, 'orb', 'orange', DOWN + 0.3, null, 1.6, Math.PI / 2);
  });
  return 2.2;
}

function launchDarts(S, B, p, n) {
  if (S.enemies.length > 14) return;
  const f = S.field;
  for (let i = 0; i < n; i++) {
    const side = p.x < -0.5 ? -1 : p.x > 0.5 ? 1 : i % 2 ? 1 : -1;
    const e = spawnEnemy(S, 'dart', p.x, p.y, {
      kind: 'swoop',
      cx: p.x + side * (3 + i * 1.2),
      cy: p.y - (5 + i),
      ex: -side * (f.halfW + 2.5),
      ey: p.y - 7,
      dur: 4.2 + i * 0.3,
    });
    e.value = 60;
    e.entered = true;
  }
  S.events.push({ type: 'enemyFire', x: p.x, y: p.y, kind: 'launch', n, enemy: 'boss' });
}

function missiles(S, B, p, n) {
  for (let i = 0; i < n; i++) {
    const a = DOWN + (i - (n - 1) / 2) * 0.55;
    shoot(S, p.x, p.y, a, 3.2, 'ball', 'red', { home: 1.5, turn: 1.3, acc: 2.2, max: 7, r: 0.3 });
  }
  S.events.push({ type: 'enemyFire', x: p.x, y: p.y, kind: 'missile', n, enemy: 'boss' });
}

// ------------------------------------------------------------ lifecycle

export function createBoss(S) {
  const type = S.def.boss;
  const D = DEFS[type];
  const f = S.field;
  const scale = clamp(f.halfW / 11, 0.6, 1);
  const top = zone(S).y1;
  const parts = D.parts();
  for (const p of parts) {
    p.r *= scale;
    // narrow fields: parts are smaller and side guns miss more, so a little less to chew through
    p.hp = p.maxHp = Math.round(p.hp * S.diff.hp * S.bossHp * (0.75 + 0.25 * scale));
  }
  const B = {
    type,
    name: BOSSES[type].name,
    x: 0,
    y: f.halfH + 7 * scale,
    hx: 0,
    hy: Math.min(f.halfH - 3.4 * scale, top + 10.5),
    hp: 0,
    maxHp: 0,
    phase: 1,
    phases: BOSSES[type].phases,
    t: 0,
    pt: 0,
    parts,
    state: 'enter',
    scale,
    halfWidth: D.halfWidth,
    entering: true,
    dying: false,
    enraged: false,
    atkT: 1.2,
    amb: 2,
    atkI: 0,
    mem: {},
    links: [],
    later: [],
  };
  if (D.init) D.init(S, B);
  for (const p of parts) placePart(B, p);
  sumHp(B);
  return B;
}

function placePart(B, p) {
  if (p.free && p.x !== 0) return;
  p.x = B.x + p.ox * B.scale;
  p.y = B.y + p.oy * B.scale;
}

function sumHp(B) {
  let hp = 0;
  let max = 0;
  for (const p of B.parts) {
    if (p.maxHp <= 0) continue;
    max += p.maxHp;
    if (!p.dead) hp += Math.max(0, p.hp);
  }
  B.hp = hp;
  B.maxHp = max;
}

export function stepBoss(S, dt) {
  const B = S.boss;
  if (!B) return;
  const D = DEFS[B.type];
  B.t += dt;
  B.pt += dt;
  if (B.entering) {
    B.y += (B.hy - B.y) * (1 - Math.exp(-1.4 * dt));
    S.src = 'boss';
    if (B.t > 3.4) {
      B.entering = false;
      B.state = 'fight';
      D.enterPhase(S, B, 1);
      for (const p of B.parts) if (p.phase === 1) p.vuln = true;
    }
  } else if (B.dying) {
    B.y += dt * 0.8;
  }
  D.update(S, B, dt);
  for (const p of B.parts) {
    p.hitT += dt;
    if (!p.free) placePart(B, p);
    if (!p.dead && p.maxHp > 0 && p.hp <= 0) destroyPart(S, B, p);
  }
  // timers set by attacks
  for (let i = 0; i < B.later.length; i++) {
    const L = B.later[i];
    L.t -= dt;
    if (L.t <= 0 && !B.dying) {
      S.src = 'boss';
      L.fn();
    }
  }
  let j = 0;
  for (const L of B.later) if (L.t > 0) B.later[j++] = L;
  B.later.length = j;

  sumHp(B);
  if (B.dying) return;

  // contact with hazard parts
  const Pl = S.player;
  if (!Pl.dead && Pl.invuln <= 0) {
    for (const p of B.parts) {
      if (!p.hurt || p.dead) continue;
      const dx = p.x - Pl.x;
      const dy = p.y - Pl.y;
      const rr = p.r * 0.85 + Pl.r;
      if (dx * dx + dy * dy < rr * rr) {
        hurtPlayer(S, p.x, p.y, p.kind);
        break;
      }
    }
  }

  // all parts with hit points gone: the boss is beaten
  if (B.parts.every((p) => p.maxHp <= 0 || p.dead)) {
    bossDown(S, B);
    return;
  }

  // phase change
  if (!B.entering) {
    const done = D.phaseDone && D.phaseDone(S, B);
    const cur = done ?? B.parts.every((p) => p.phase !== B.phase || p.maxHp <= 0 || p.dead);
    if (cur && B.phase < B.phases) nextPhase(S, B);
    if (!B.enraged && B.phase === B.phases && B.hp < B.maxHp * 0.25) B.enraged = true;
  }

  // background pressure: an aimed spread from a random live part
  if (!B.entering) {
    B.amb -= dt;
    if (B.amb <= 0) {
      B.amb = (B.enraged ? 1.2 : 1.6) / S.diff.fire;
      const live = B.parts.filter((p) => !p.dead && p.maxHp > 0 && p.solid);
      if (live.length) {
        const p = live[Math.floor(rnd(S.rng) * live.length)];
        S.src = 'boss';
        aimed(S, p.x, p.y - p.r * 0.5, 4.8, 'orb', 'magenta', S.sector >= 3 ? 3 : 2, 0.35);
      }
    }
  }

  // attacks
  if (!B.entering) {
    B.atkT -= dt;
    if (B.atkT <= 0) {
      const list = D.attacks[B.phase];
      const fn = list[B.atkI++ % list.length];
      S.src = 'boss';
      const busy = fn(S, B) || 1;
      const gap = D.gaps[B.phase - 1] * (B.enraged ? 0.75 : 1);
      B.atkT = (busy + gap) / S.diff.fire;
    }
  }
}

function nextPhase(S, B) {
  const D = DEFS[B.type];
  B.phase++;
  B.pt = 0;
  B.atkI = 0;
  B.atkT = 1.6;
  B.later.length = 0;
  for (const p of B.parts) {
    cancelEmitters(S, p);
    p.tele = null;
    if (p.phase === B.phase) p.vuln = true;
  }
  D.enterPhase(S, B, B.phase);
  const n = clearEnemyBullets(S);
  S.score += n * 10;
  S.events.push({ type: 'bossPhase', x: B.x, y: B.y, phase: B.phase, cleared: n });
}

export function clearEnemyBullets(S) {
  let n = 0;
  for (const b of S.bullets) {
    b.removed = true;
    if (!b.link) n++;
  }
  S.bullets.length = 0;
  return n;
}

export function damagePart(S, B, p, dmg) {
  if (p.dead || !p.vuln || B.entering || B.dying) return false;
  p.hp -= dmg;
  p.hitT = 0;
  if (p.hp <= 0) destroyPart(S, B, p);
  return true;
}

function destroyPart(S, B, p) {
  p.dead = true;
  p.hp = 0;
  p.vuln = false;
  p.tele = null;
  cancelEmitters(S, p);
  const pts = scoreKill(S, p.value);
  S.stats.kills++;
  for (let i = 0; i < 4; i++) dropPickup(S, p.x, p.y, 'score');
  if (rnd(S.rng) < 0.35) dropPickup(S, p.x, p.y, 'shield');
  S.events.push({ type: 'partDestroyed', x: p.x, y: p.y, id: p.id, kind: p.kind, score: pts });
}

function bossDown(S, B) {
  B.dying = true;
  B.state = 'dying';
  B.later.length = 0;
  for (const p of B.parts) {
    cancelEmitters(S, p);
    p.tele = null;
    p.hurt = false;
  }
  for (const L of B.links) if (L.bullet) L.bullet.life = 0;
  const n = clearEnemyBullets(S);
  const bonus = 20000 + 10000 * S.sector;
  S.score += bonus + n * 10;
  S.stats.bossTime = B.t;
  S.events.push({ type: 'bossDead', x: B.x, y: B.y, bonus, name: B.name });
}
