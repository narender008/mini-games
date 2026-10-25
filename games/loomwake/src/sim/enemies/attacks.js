// Every foe attack: what the wind-up tracks and telegraphs, what the active
// frames do, and how it ends. Timings and sizes are in content/enemies.js
// ATTACKS. Each entry: { wind0(G,e,A), wind(G,e,A,dt), start(G,e,A), act(G,e,A,dt), end(G,e,A) }.
// The red ground telegraph always goes down at wind-up start (>= 0.35 s).
import * as C from '../combat.js';
import {
  tg, hurt, heroAng, heroDist, turn, brake, steer, fx, emit, rnd, inside,
  heroInCircle, heroInLine, heroInArc, heroInRing,
} from './brain.js';
import { clamp, len, lerp, wrapAng } from '../../core/math.js';

const TRACK = 0.65;            // wind-up fraction during which the aim still follows the hero
const lockAim = (G, e, rate, dt) => {
  if (e.st < e.stDur * TRACK) { const a = heroAng(G, e); e.aim = e.aim + clamp(wrapAng(a - e.aim), -rate * dt, rate * dt); }
  turn(e, e.aim, 10, dt);
};
const dirOf = (a) => [Math.cos(a), Math.sin(a)];
const end = (e, A, reach) => [e.x + Math.cos(e.aim) * reach, e.y + Math.sin(e.aim) * reach];
const impact = (G, e, x, y, r, power = 1, color) => emit(G, 'foeImpact', { e, x, y, r, power, kind: e.kind, color });
const shoot = (G, p) => { if (C.shoot) C.shoot(G, p); else G.projectiles.push(p); };
const zone = (G, z) => { if (C.zone) C.zone(G, z); else G.zones.push(z); };

// keep a line telegraph glued to the aim while it tracks
function followLine(e, t, reach, off = 0) {
  if (!t) return;
  const [dx, dy] = dirOf(e.aim);
  t.x = e.x + dx * off; t.y = e.y + dy * off; t.x2 = e.x + dx * reach; t.y2 = e.y + dy * reach; t.angle = e.aim;
}
function followCone(e, t) { if (t) { t.x = e.x; t.y = e.y; t.angle = e.aim; } }

// An expanding ring that hurts where its band passes (dash through it).
function shockRing(G, e, x, y, r1, speed, w, mul, kind = 'shock', delay = 0) {
  fx(G, { kind, x, y, r: 10, r1, speed, w, mul, owner: e.id, src: e, hit: false, delay, color: e.elite ? '#ff3a7a' : '#ff6a8a' });
}

export const ATTACK_FNS = {
  // ---- Hollow / Thornling: raise both claws, then a lunging two-claw slash
  clawLunge: {
    wind0(G, e, A) { e.mem.t = tg(G, e, { kind: 'line', x: e.x, y: e.y, x2: e.x, y2: e.y, w: A.w, t: e.stDur }); },
    wind(G, e, A, dt) { brake(e, dt, 9); lockAim(G, e, 5, dt); followLine(e, e.mem.t, A.reach); },
    start(G, e, A) { const [dx, dy] = dirOf(e.aim); e.vx = dx * A.speed; e.vy = dy * A.speed; emit(G, 'foeSwing', { e, atk: 'clawLunge' }); },
    act(G, e, A, dt) {
      const k = e.st / e.stDur, [dx, dy] = dirOf(e.aim);
      const sp = A.speed * (1 - k * 0.7);
      e.vx = dx * sp; e.vy = dy * sp;
      if (!e.hitOnce && heroInArc(G, e.x, e.y, e.r + 34, e.aim, 2.2)) { e.hitOnce = true; hurt(G, e, 1, { kb: 380 }); }
    },
    end(G, e) { e.vx *= 0.3; e.vy *= 0.3; },
  },
  twinRake: null, // filled below (same as clawLunge with chain 2)

  // ---- Thread-Knight / Glass Knight: overhead greatsword slam + shockwave
  overheadSlam: {
    wind0(G, e, A) { e.mem.t = tg(G, e, { kind: 'line', x: e.x, y: e.y, x2: e.x, y2: e.y, w: A.w, t: e.stDur }); emit(G, 'foeHum', { e }); },
    wind(G, e, A, dt) { brake(e, dt, 9); lockAim(G, e, 2.2, dt); followLine(e, e.mem.t, A.reach); },
    start(G, e, A) {
      const [x2, y2] = end(e, A, A.reach);
      if (heroInLine(G, e.x, e.y, x2, y2, A.w)) hurt(G, e, 1, { kb: 520, x: e.x, y: e.y });
      impact(G, e, x2, y2, 90, 1);
      if (A.wave) shockRing(G, e, x2, y2, A.wave, 520, 22, 0.5);
      if (A.shards) {
        const n = A.shards;
        for (let i = 0; i < n; i++) {
          const a = e.aim + (i - (n - 1) / 2) * 0.32, s = 470;
          shoot(G, { team: 'foe', kind: 'glassShard', x: x2, y: y2, z: 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 9, dmg: Math.round(e.dmg * 0.4), life: 0.9, owner: e.id, color: '#9ff4ff' });
        }
      }
    },
    act(G, e, A, dt) { brake(e, dt, 20); },
  },
  doubleSlam: null,
  shardSlam: null,
  // horizontal sweep when Iri is behind it
  backSweep: {
    wind0(G, e, A) { e.aim = heroAng(G, e); e.mem.t = tg(G, e, { kind: 'cone', x: e.x, y: e.y, r: A.r, angle: e.aim, arc: A.arc, t: e.stDur }); },
    wind(G, e, A, dt) { brake(e, dt, 9); lockAim(G, e, 3, dt); followCone(e, e.mem.t); },
    start(G, e) { emit(G, 'foeSwing', { e, atk: 'backSweep' }); },
    act(G, e, A, dt) {
      brake(e, dt, 12);
      if (!e.hitOnce && e.st > e.stDur * 0.35) { e.hitOnce = true; if (heroInArc(G, e.x, e.y, A.r, e.aim, A.arc)) hurt(G, e, 0.8, { kb: 600 }); }
    },
  },

  // ---- Needlecaster: fan of black needles
  needleFan: {
    wind0(G, e, A) {
      e.mem.ts = [];
      for (let i = 0; i < A.n; i++) e.mem.ts.push(tg(G, e, { kind: 'line', x: e.x, y: e.y, x2: e.x, y2: e.y, w: 8, t: e.stDur, thin: true }));
    },
    wind(G, e, A, dt) {
      steer(e, 0, 0, dt, 6); lockAim(G, e, 3, dt);
      e.mem.ts.forEach((t, i) => { const a = e.aim + (i - (A.n - 1) / 2) * (A.spread / (A.n - 1)) * 2 * 0.5; const L = 300; t.x = e.x; t.y = e.y; t.x2 = e.x + Math.cos(a) * L; t.y2 = e.y + Math.sin(a) * L; });
    },
    start(G, e, A) { fan(G, e, A, 0); e.mem.v = 1; emit(G, 'foeCast', { e, atk: e.atk }); },
    act(G, e, A, dt) {
      brake(e, dt, 6);
      if (A.volleys > 1 && e.mem.v < A.volleys && e.st > e.stDur * 0.5) { e.aim = heroAng(G, e); fan(G, e, A, 0.5); e.mem.v++; }
    },
  },
  needleStorm: null,

  // ---- Drowned Chorister: song rings
  songRing: {
    wind0(G, e, A) { e.mem.t = tg(G, e, { kind: 'circle', x: e.x, y: e.y, r: 70, t: e.stDur, color: '#6fb8ff' }); emit(G, 'foeSing', { e }); },
    wind(G, e, A, dt) { brake(e, dt, 5); turn(e, heroAng(G, e), 4, dt); },
    start(G, e, A) { ring(G, e, A, 0); if (A.rings > 1) ring(G, e, A, 0.7); },
    act(G, e, A, dt) { brake(e, dt, 5); },
  },
  canon: null,

  // ---- Snarl: crouch, leap to a landing circle
  leap: {
    wind0(G, e, A) {
      const h = G.hero;
      // land where the hero will be, a little short, inside the room
      const lead = 0.25;
      let tx = h.x + (h.vx || 0) * lead, ty = h.y + (h.vy || 0) * lead;
      const d = len(tx - e.x, ty - e.y), maxD = A.range + 40;
      if (d > maxD) { tx = e.x + (tx - e.x) * maxD / d; ty = e.y + (ty - e.y) * maxD / d; }
      if (!inside(G, tx, ty, 20)) { tx = lerp(e.x, tx, 0.6); ty = lerp(e.y, ty, 0.6); }
      e.mem.tx = tx; e.mem.ty = ty; e.mem.x0 = e.x; e.mem.y0 = e.y;
      e.aim = Math.atan2(ty - e.y, tx - e.x);
      e.mem.t = tg(G, e, { kind: 'circle', x: tx, y: ty, r: A.r, t: e.stDur + A.act });
    },
    wind(G, e, A, dt) { brake(e, dt, 14); turn(e, e.aim, 10, dt); },
    start(G, e, A) { e.mem.x0 = e.x; e.mem.y0 = e.y; emit(G, 'foeLeap', { e }); },
    act(G, e, A, dt) {
      const k = clamp(e.st / e.stDur, 0, 1);
      e.z = Math.sin(k * Math.PI) * 90;
      const vx = (e.mem.tx - e.mem.x0) / A.act, vy = (e.mem.ty - e.mem.y0) / A.act;
      e.vx = vx; e.vy = vy;
    },
    end(G, e, A) {
      e.z = 0; e.vx *= 0.2; e.vy *= 0.2;
      if (heroInCircle(G, e.mem.tx, e.mem.ty, A.r)) hurt(G, e, 1, { kb: 460, x: e.x, y: e.y });
      impact(G, e, e.x, e.y, A.r, 0.6);
    },
  },
  doubleLeap: null,
  bite: {
    wind0(G, e, A) { e.aim = heroAng(G, e); e.mem.t = tg(G, e, { kind: 'cone', x: e.x, y: e.y, r: A.reach, angle: e.aim, arc: A.arc, t: e.stDur }); },
    wind(G, e, A, dt) { brake(e, dt, 9); lockAim(G, e, 4, dt); followCone(e, e.mem.t); },
    start(G, e) { const [dx, dy] = dirOf(e.aim); e.vx = dx * 380; e.vy = dy * 380; emit(G, 'foeSwing', { e, atk: 'bite' }); },
    act(G, e, A, dt) {
      brake(e, dt, 10);
      if (!e.hitOnce && heroInArc(G, e.x, e.y, A.reach, e.aim, A.arc)) { e.hitOnce = true; hurt(G, e, 0.8, { kb: 300 }); }
    },
  },

  // ---- Lantern Warden: censer of burning water
  censerSwing: {
    wind0(G, e, A) { e.aim = heroAng(G, e); e.mem.t = tg(G, e, { kind: 'cone', x: e.x, y: e.y, r: A.r, angle: e.aim, arc: A.arc, t: e.stDur }); },
    wind(G, e, A, dt) { brake(e, dt, 9); lockAim(G, e, 2.4, dt); followCone(e, e.mem.t); },
    start(G, e) { emit(G, 'foeSwing', { e, atk: 'censerSwing' }); },
    act(G, e, A, dt) {
      brake(e, dt, 12);
      if (!e.hitOnce && e.st > e.stDur * 0.4) {
        e.hitOnce = true;
        if (heroInArc(G, e.x, e.y, A.r, e.aim, A.arc)) hurt(G, e, 1, { kb: 520, element: 'burn' });
        for (let i = -1; i <= 1; i++) { const a = e.aim + i * A.arc * 0.33, d = A.r * 0.72; burnWater(G, e, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 46, A.burn); }
      }
    },
  },
  censerSlam: {
    wind0(G, e, A) { const [x, y] = end(e, A, A.reach); e.mem.t = tg(G, e, { kind: 'circle', x, y, r: A.r, t: e.stDur }); },
    wind(G, e, A, dt) { brake(e, dt, 9); lockAim(G, e, 2, dt); const [x, y] = end(e, A, A.reach - 40); if (e.mem.t) { e.mem.t.x = x; e.mem.t.y = y; } },
    start(G, e, A) {
      const t = e.mem.t, x = t ? t.x : e.x, y = t ? t.y : e.y;
      if (heroInCircle(G, x, y, A.r)) hurt(G, e, 1.2, { kb: 560, x, y, element: 'burn' });
      impact(G, e, x, y, A.r, 0.9, '#7fd8ff');
      burnWater(G, e, x, y, A.r * 0.9, A.burn);
    },
    act(G, e, A, dt) { brake(e, dt, 20); },
  },
  censerSpin: {
    wind0(G, e, A) { e.mem.t = tg(G, e, { kind: 'circle', x: e.x, y: e.y, r: A.r, t: e.stDur }); },
    wind(G, e, A, dt) { brake(e, dt, 9); if (e.mem.t) { e.mem.t.x = e.x; e.mem.t.y = e.y; } },
    start(G, e) { e.mem.n = 0; emit(G, 'foeSwing', { e, atk: 'censerSpin' }); },
    act(G, e, A, dt) {
      e.facing = wrapAng(e.facing + dt * 14);
      const h = G.hero; if (h) { const a = heroAng(G, e); steer(e, Math.cos(a) * 60, Math.sin(a) * 60, dt, 4); }
      if (!e.hitOnce && heroInCircle(G, e.x, e.y, A.r)) { e.hitOnce = true; hurt(G, e, 1, { kb: 600, element: 'burn' }); }
      if (e.st > e.mem.n * 0.3) { e.mem.n++; const a = e.facing; burnWater(G, e, e.x + Math.cos(a) * A.r * 0.8, e.y + Math.sin(a) * A.r * 0.8, 40, A.burn); }
    },
  },

  // ---- Forge Thrall: lobbed molten hammers
  hammerLob: {
    wind0(G, e, A) {
      const h = G.hero, n = A.n || 1;
      e.mem.targets = [];
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i - (n - 1) / 2) : 0;
        const a = heroAng(G, e) + off * 0.42;
        const d = clamp(heroDist(G, e) + (n > 1 && i !== 1 ? rnd(G).range(-30, 30) : 0), A.min, A.range);
        let tx = e.x + Math.cos(a) * d + (n === 1 ? (h.vx || 0) * 0.3 : 0), ty = e.y + Math.sin(a) * d + (n === 1 ? (h.vy || 0) * 0.3 : 0);
        if (!inside(G, tx, ty, 10)) { tx = lerp(e.x, tx, 0.7); ty = lerp(e.y, ty, 0.7); }
        e.mem.targets.push([tx, ty, tg(G, e, { kind: 'circle', x: tx, y: ty, r: A.r, t: e.stDur + A.act })]);
      }
      e.aim = heroAng(G, e);
    },
    wind(G, e, A, dt) { brake(e, dt, 9); turn(e, e.aim, 6, dt); },
    start(G, e, A) {
      for (const [tx, ty] of e.mem.targets) fx(G, { kind: 'lob', x0: e.x + Math.cos(e.aim) * 14, y0: e.y - 2, z0: 70, x: e.x, y: e.y, z: 70, tx, ty, dur: A.act, src: e, owner: e.id, r: A.r, hot: A.hot, mul: 1 });
      emit(G, 'foeThrow', { e });
    },
    act(G, e, A, dt) { brake(e, dt, 9); },
  },
  tripleLob: null,
  hammerSwing: {
    wind0(G, e, A) { e.aim = heroAng(G, e); e.mem.t = tg(G, e, { kind: 'cone', x: e.x, y: e.y, r: A.reach, angle: e.aim, arc: A.arc, t: e.stDur }); },
    wind(G, e, A, dt) { brake(e, dt, 9); lockAim(G, e, 3.5, dt); followCone(e, e.mem.t); },
    start(G, e) { emit(G, 'foeSwing', { e, atk: 'hammerSwing' }); },
    act(G, e, A, dt) { brake(e, dt, 12); if (!e.hitOnce && e.st > e.stDur * 0.3) { e.hitOnce = true; if (heroInArc(G, e.x, e.y, A.reach, e.aim, A.arc)) hurt(G, e, 1, { kb: 480, element: 'burn' }); } },
  },

  // ---- Loomhulk / Bellows Brute
  groundSlam: {
    wind0(G, e, A) { e.mem.t = tg(G, e, { kind: 'circle', x: e.x, y: e.y, r: A.r, t: e.stDur }); emit(G, 'foeHum', { e }); },
    wind(G, e, A, dt) { brake(e, dt, 10); turn(e, heroAng(G, e), 2, dt); if (e.mem.t) { e.mem.t.x = e.x; e.mem.t.y = e.y; } },
    start(G, e, A) {
      if (heroInCircle(G, e.x, e.y, A.r)) hurt(G, e, 1, { kb: 700 });
      impact(G, e, e.x, e.y, A.r, 1.4);
      shockRing(G, e, e.x, e.y, A.wave, 560, 24, 0.55);
      if (A.rings > 1) shockRing(G, e, e.x, e.y, A.wave, 520, 24, 0.55, 'shock', 0.35);
    },
    act(G, e, A, dt) { brake(e, dt, 20); },
  },
  quake: null,
  charge: {
    wind0(G, e, A) {
      e.aim = heroAng(G, e);
      e.mem.t = tg(G, e, { kind: 'line', x: e.x, y: e.y, x2: e.x, y2: e.y, w: A.w, t: e.stDur });
      emit(G, 'foeRoar', { e });
    },
    wind(G, e, A, dt) { brake(e, dt, 10); lockAim(G, e, 1.6, dt); followLine(e, e.mem.t, A.len); },
    start(G, e, A) { e.mem.d = 0; e.mem.stall = 0; },
    act(G, e, A, dt) {
      const [dx, dy] = dirOf(e.aim), sp = A.speed * (e.enraged ? 1.15 : 1);
      e.vx = dx * sp; e.vy = dy * sp;
      e.mem.d += sp * dt;
      if (!e.hitOnce && heroInCircle(G, e.x, e.y, e.r + 14)) { e.hitOnce = true; hurt(G, e, 1, { kb: 820 }); }
      // stop at the lane's end or when a wall stops us (moved far less than asked)
      const moved = e.mem.px === undefined ? sp * dt : len(e.x - e.mem.px, e.y - e.mem.py);
      e.mem.px = e.x; e.mem.py = e.y;
      if (moved < sp * dt * 0.25 && e.st > 0.1) e.mem.stall++;
      if (e.mem.d >= A.len || e.mem.stall > 3) {
        if (e.mem.stall > 3) { impact(G, e, e.x + dx * e.r, e.y + dy * e.r, 80, 1.2); e.stunSelf = true; }
        e.atkDone = true;
      }
    },
    end(G, e) { e.vx *= 0.15; e.vy *= 0.15; if (e.stunSelf) { e.stunSelf = false; e.stun = Math.max(e.stun || 0, 0.9); } },
  },
  fireBreath: {
    wind0(G, e, A) { e.aim = heroAng(G, e); e.mem.t = tg(G, e, { kind: 'cone', x: e.x, y: e.y, r: A.r, angle: e.aim, arc: A.arc, t: e.stDur, color: '#ff7a3a' }); emit(G, 'foeInhale', { e }); },
    wind(G, e, A, dt) { brake(e, dt, 10); lockAim(G, e, 2, dt); followCone(e, e.mem.t); },
    start(G, e, A) {
      e.mem.tick = 0; e.mem.a0 = e.aim;
      e.mem.live = tg(G, e, { kind: 'cone', x: e.x, y: e.y, r: A.r, angle: e.aim, arc: A.arc, t: 0.02, live: true, color: '#ff7a3a' });
      emit(G, 'foeBreath', { e });
    },
    act(G, e, A, dt) {
      brake(e, dt, 10);
      if (A.sweep) {
        const k = e.st / e.stDur;
        e.aim = e.mem.a0 + (k - 0.5) * A.sweep * (e.mem.dir || (e.mem.dir = rnd(G).chance(0.5) ? 1 : -1));
      }
      turn(e, e.aim, 20, dt);
      const t = e.mem.live; if (t) { t.x = e.x; t.y = e.y; t.angle = e.aim; t.t = 0.02; }
      e.mem.tick -= dt;
      if (e.mem.tick <= 0) {
        e.mem.tick = A.tick;
        if (heroInArc(G, e.x, e.y, A.r, e.aim, A.arc)) {
          hurt(G, e, 0.28, { kb: 120, element: 'burn' });
          if (C.addStatus) C.addStatus(G, G.hero, 'burn', 2, 3);
        }
      }
    },
    end(G, e) { if (e.mem.live) e.mem.live.done = true; },
  },
  fireSweep: null,

  // ---- Echo of Iri: Iri's own dash and three-hit combo, in black
  echoDash: {
    wind0(G, e, A) { e.aim = heroAng(G, e); e.mem.t = tg(G, e, { kind: 'line', x: e.x, y: e.y, x2: e.x, y2: e.y, w: A.w, t: e.stDur }); },
    wind(G, e, A, dt) { brake(e, dt, 14); lockAim(G, e, 6, dt); followLine(e, e.mem.t, Math.min(A.range, heroDist(G, e) + 80)); },
    start(G, e, A) { const [dx, dy] = dirOf(e.aim); e.vx = dx * A.speed; e.vy = dy * A.speed; e.dashing = true; emit(G, 'foeDash', { e }); },
    act(G, e, A, dt) {
      const [dx, dy] = dirOf(e.aim); e.vx = dx * A.speed; e.vy = dy * A.speed;
      if (!e.hitOnce && heroInCircle(G, e.x, e.y, e.r + 16)) { e.hitOnce = true; hurt(G, e, 1, { kb: 420 }); }
    },
    end(G, e) { e.dashing = false; e.vx *= 0.2; e.vy *= 0.2; },
  },
  echoChain: null,
  echoCombo: {
    wind0(G, e, A) { e.aim = heroAng(G, e); e.mem.t = tg(G, e, { kind: 'cone', x: e.x, y: e.y, r: A.reach, angle: e.aim, arc: A.arc, t: e.stDur }); },
    wind(G, e, A, dt) { brake(e, dt, 12); lockAim(G, e, 5, dt); followCone(e, e.mem.t); },
    start(G, e) { e.mem.hit = 0; },
    act(G, e, A, dt) {
      const times = [0.06, 0.24, 0.44];
      const i = e.mem.hit;
      if (i < A.hits && e.st >= times[i]) {
        e.mem.hit++; e.combo = i;
        const [dx, dy] = dirOf(e.aim); e.vx = dx * (i === 2 ? 380 : 220); e.vy = dy * (i === 2 ? 380 : 220);
        if (heroInArc(G, e.x, e.y, A.reach, e.aim, A.arc)) hurt(G, e, i === 2 ? 1.2 : 0.6, { kb: i === 2 ? 500 : 200 });
        emit(G, 'foeSwing', { e, atk: 'echoCombo', combo: i });
        // the next swing gets its own short telegraph
        if (i + 1 < A.hits) { e.aim = e.aim + clamp(wrapAng(heroAng(G, e) - e.aim), -0.5, 0.5); }
      } else brake(e, dt, 9);
    },
  },

  // ---- Unspooler: a black thread that pulls Iri in; dash to break it
  snareThread: {
    wind0(G, e, A) {
      const n = A.n || 1; e.mem.ts = [];
      for (let i = 0; i < n; i++) e.mem.ts.push(tg(G, e, { kind: 'line', x: e.x, y: e.y, x2: e.x, y2: e.y, w: 14, t: e.stDur }));
    },
    wind(G, e, A, dt) {
      brake(e, dt, 8); lockAim(G, e, 3, dt);
      const n = A.n || 1;
      e.mem.ts.forEach((t, i) => { const a = e.aim + (n > 1 ? (i - 0.5) * 0.5 : 0); t.x = e.x; t.y = e.y; t.x2 = e.x + Math.cos(a) * A.range; t.y2 = e.y + Math.sin(a) * A.range; });
    },
    start(G, e, A) {
      const n = A.n || 1;
      for (let i = 0; i < n; i++) { const a = e.aim + (n > 1 ? (i - 0.5) * 0.5 : 0); fx(G, { kind: 'snare', src: e, owner: e.id, x: e.x, y: e.y - 50, a, d: 0, max: A.range, speed: A.speed, pull: A.pull, state: 'out', hold: 0 }); }
      emit(G, 'foeCast', { e, atk: 'snareThread' });
    },
    act(G, e, A, dt) { brake(e, dt, 8); },
  },
  twinThread: null,
  spoolSlash: {
    wind0(G, e, A) { e.mem.t = tg(G, e, { kind: 'circle', x: e.x, y: e.y, r: A.r, t: e.stDur }); },
    wind(G, e, A, dt) { brake(e, dt, 10); if (e.mem.t) { e.mem.t.x = e.x; e.mem.t.y = e.y; } },
    start(G, e) { emit(G, 'foeSwing', { e, atk: 'spoolSlash' }); },
    act(G, e, A, dt) { e.facing = wrapAng(e.facing + dt * 18); brake(e, dt, 10); if (!e.hitOnce && heroInCircle(G, e.x, e.y, A.r)) { e.hitOnce = true; hurt(G, e, 1, { kb: 480 }); } },
  },
};

// variants that share an executor
const alias = { twinRake: 'clawLunge', doubleSlam: 'overheadSlam', shardSlam: 'overheadSlam', needleStorm: 'needleFan', canon: 'songRing', doubleLeap: 'leap', quake: 'groundSlam', tripleLob: 'hammerLob', fireSweep: 'fireBreath', echoChain: 'echoDash', twinThread: 'snareThread' };
for (const k in alias) ATTACK_FNS[k] = ATTACK_FNS[alias[k]];

function fan(G, e, A, offset) {
  const n = A.n, s = A.speed;
  for (let i = 0; i < n; i++) {
    const a = e.aim + (i - (n - 1) / 2 + offset) * (A.spread / (n - 1));
    shoot(G, { team: 'foe', kind: 'needle', x: e.x + Math.cos(a) * 16, y: e.y + Math.sin(a) * 8, z: (e.def.float || 0) + 58, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 7, dmg: e.dmg, life: 1.5, owner: e.id, color: e.elite ? '#ff3a7a' : '#a8f6ff', angle: a });
  }
}
function ring(G, e, A, delay) {
  fx(G, { kind: 'song', x: e.x, y: e.y, r: 20, r1: A.r, speed: A.speed, w: A.w, mul: 1, owner: e.id, src: e, hit: false, delay, color: e.elite ? '#ff3a7a' : '#8a3cff' });
}
function burnWater(G, e, x, y, r, t) {
  if (!inside(G, x, y)) return;
  zone(G, { kind: 'burnWater', color: '#5ec8ff', x, y, r, t, max: t, team: 'foe', dmg: Math.max(2, Math.round(e.dmg * 0.25)), tick: 0.5, element: 'burn', owner: e.id });
}

// ---------- G.foeFx update: rings, lobs, snares ----------
export function updateFoeFx(G, dt) {
  const L = G.foeFx; if (!L || !L.length) return;
  const h = G.hero;
  for (const f of L) {
    if (f.delay > 0) { f.delay -= dt; continue; }
    f.t += dt;
    if (f.kind === 'shock' || f.kind === 'song') {
      f.r += f.speed * dt;
      // the ring is also a live telegraph while it travels (bot, readability pass, anything reading G.telegraphs);
      // painted by the foe fx painter, so the renderer skips it on the floor pass (fxRing)
      if (!f.tg) f.tg = C.telegraph ? C.telegraph(G, { kind: 'ring', x: f.x, y: f.y, r: f.r, w: f.w, live: true, fxRing: true, owner: f.owner, color: f.color, sfx: false }) : null;
      else f.tg.r = f.r;
      if (!f.hit && h && heroInRing(G, f.x, f.y, f.r, f.w)) { f.hit = true; hurt(G, f.src, f.mul, { x: f.x, y: f.y, kb: 360, kind: f.kind }); }
      if (f.r >= f.r1) f.done = true;
    } else if (f.kind === 'lob') {
      const k = clamp(f.t / f.dur, 0, 1);
      f.x = lerp(f.x0, f.tx, k); f.y = lerp(f.y0, f.ty, k);
      f.z = lerp(f.z0, 0, k) + Math.sin(k * Math.PI) * 170;
      f.spin = (f.spin || 0) + dt * 14;
      if (k >= 1) {
        f.done = true;
        if (heroInCircle(G, f.tx, f.ty, f.r)) hurt(G, f.src, f.mul, { x: f.tx, y: f.ty, kb: 420, element: 'burn' });
        if (inside(G, f.tx, f.ty)) zone(G, { kind: 'molten', color: '#ff7a2a', x: f.tx, y: f.ty, r: f.r * 0.85, t: f.hot, max: f.hot, team: 'foe', dmg: Math.max(2, Math.round(f.src.dmg * 0.3)), tick: 0.5, element: 'burn', owner: f.owner });
        emit(G, 'foeImpact', { e: f.src, x: f.tx, y: f.ty, r: f.r, power: 0.8, kind: 'hammer', color: '#ff9a3a' });
      }
    } else if (f.kind === 'snare') {
      const s = f.src;
      if (s.dead || s.state === 'stun' || s.state === 'stagger') { f.state = 'snap'; }
      if (f.state === 'out') {
        f.d += f.speed * dt;
        f.x = s.x + Math.cos(f.a) * f.d; f.y = s.y - 50 + Math.sin(f.a) * f.d;
        if (h && len(h.x - f.x, h.y - 30 - f.y) < (h.r || 20) + 14) {
          if ((h.inv > 0) || h.dashing || h.state === 'dash') { f.state = 'snap'; }
          else { f.state = 'hold'; f.hold = 0; hurt(G, s, 0.4, { kb: 0, kind: 'snare' }); emit(G, 'foeSnare', { e: s }); }
        } else if (f.d >= f.max || !inside(G, f.x, f.y + 50)) f.state = 'back';
      } else if (f.state === 'hold') {
        f.hold += dt;
        // a dash breaks the thread
        if (!h || h.dashing || h.state === 'dash' || h.dead || s.los === false) { f.state = 'snap'; emit(G, 'foeSnareBreak', { e: s }); }
        else {
          const dx = s.x - h.x, dy = s.y - h.y, d = len(dx, dy);
          if (d > s.r + (h.r || 20) + 30) { const k = Math.min(f.pull * dt, d - 40) / d; h.x += dx * k; h.y += dy * k; h.tethered = 0.1; }
          f.x = h.x; f.y = h.y - 34;
          if (f.hold > 1.1 || d < s.r + (h.r || 20) + 34) f.state = 'snap';
        }
      } else if (f.state === 'back') {
        f.d -= f.speed * 1.6 * dt; f.x = s.x + Math.cos(f.a) * f.d; f.y = s.y - 50 + Math.sin(f.a) * f.d;
        if (f.d <= 0) f.done = true;
      } else if (f.state === 'snap') { f.snapT = (f.snapT || 0) + dt; if (f.snapT > 0.3) f.done = true; }
    } else if (f.t > (f.life || 2)) f.done = true;
  }
  for (let i = L.length - 1; i >= 0; i--) if (L[i].done) { if (L[i].tg) L[i].tg.done = true; L.splice(i, 1); }
}
