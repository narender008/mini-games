// The guns: their numbers, how each one fires, and (for guns with their own
// projectiles) how those fly and are drawn. The run calls `fireGun` every
// step while the hero is firing, `updateWeapons` once a step and
// `drawWeapons` once a frame; everything else (bullets in flight, hits,
// burning, explosions) goes through the run's own pools and methods.
//
// A wide field fires proportionally more bolts (FIELD.r) at a little less
// damage each, so a gun's power grows with the horde (FIELD.c). Surges add a
// three-way spread (Triple Shot) or piercing, exploding shots (Rage).
//
// Guns that go beyond the run's bullet pool keep their own small pools here,
// made on first use and kept on `run.wpn`:
//   Tesla Gun / Thundergod  no projectile: arcs leap to the nearest foes and chain on
//   Saw Launcher / Bloodmill  spinning blades (`Blades`) that rip through every foe in their path
//   Dragon's Breath  incendiary shells (`Shells`) that set foes alight and pop
// Swarm Pod and Inferno reuse the run's rockets and the flame cone.
import { ARENA, FIELD, rnd, rand, clamp, TAU } from '../config.js';
import { TYPES } from './enemies.js';
import { FIRE, HOT, BOLT, GLOW, HERO_RING } from '../fx/particles.js';
import { CRIT, PROC, QUIET, BURN, SHOCK, BLAST } from './flags.js';
import { CRATE } from './pools.js';

// stars: a weapon found again levels up (more damage, faster)
export const WEAPONS = {
  blaster: { name: 'Blaster', icon: 'blaster', interval: 0.12, dmg: 11, speed: 1500, pellets: 1, spread: 0, gap: 16, life: 1.1, kb: 26, size: 11, color: [0.35, 0.75, 1.6], sound: 'blaster' },
  scatter: { name: 'Scatter Gun', icon: 'scatter', interval: 0.55, dmg: 13, speed: 1250, pellets: 8, spread: 0.46, gap: 0, life: 0.5, kb: 150, size: 6, color: [1.6, 0.9, 0.3], sound: 'scatter', perShot: 2 },
  rocket: { name: 'Rocket Pod', icon: 'rocket', interval: 0.95, dmg: 40, speed: 330, accel: 1500, pellets: 1, spread: 0.12, gap: 22, life: 1.6, kb: 60, size: 10, blast: 78, blastDmg: 38, color: [1.6, 0.7, 0.25], sound: 'rocket' },
  // the flamethrower: a short cone that hits everything in it every tick and sets it alight
  flamer: { name: 'Flamethrower', icon: 'flamer', interval: 0.06, dmg: 7.5, range: 300, cone: 0.34, burn: 2.2, burnDps: 16, kb: 6, size: 0, color: [2.4, 1.0, 0.25], sound: 'flamer' },
  railgun: { name: 'Railgun', icon: 'railgun', interval: 0.32, dmg: 34, beam: true, pellets: 1, gap: 18, kb: 90, size: 9, color: [0.4, 1.2, 2.2], sound: 'railgun' },

  // Tesla Gun: `arcs` bolts leap from the muzzle to the nearest foes ahead (within `reach`), then jump on to
  // the nearest unstruck foe up to `jumps` times, each hit `fall` times the last. A foe is struck once a volley.
  tesla: { name: 'Tesla Gun', icon: 'tesla', interval: 0.3, dmg: 18, reach: 560, jumpR: 175, arcs: 2, jumps: 3, fall: 0.85, kb: 40, color: [0.55, 1.3, 2.8], sound: 'tesla', fire: fireTesla },
  // Saw Launcher: `blades` spinning blades of hit radius `rad` fly at `speed`, rip through every foe once per pass,
  // bounce `bounces` times off the side edges and the top of the view, then fly off
  saw: { name: 'Saw Launcher', icon: 'saw', interval: 1.0, dmg: 15, speed: 780, blades: 1, rad: 20, art: 14.85, spin: 20, bounces: 1, life: 3.4, kb: 170, color: [1.8, 1.25, 0.3], sound: 'saw', fire: fireSaw },

  // ---- evolutions (a gun's slot fires one of these once its two upgrades are maxed)
  // Inferno: the flamethrower's jet, blue-white, longer and hotter
  inferno: { name: 'Inferno', icon: 'inferno', interval: 0.05, dmg: 9.5, range: 440, cone: 0.3, burn: 3.6, burnDps: 34, kb: 10, size: 0, color: [0.6, 1.3, 2.8], tint: [0.15, 0.55, 2.6], flameKind: 'inferno', sound: 'inferno' },
  // Swarm Pod: salvos of `pellets` times as many small homing rockets with small blasts
  swarm: { name: 'Swarm Pod', icon: 'swarm', interval: 0.8, dmg: 28, speed: 580, pellets: 3, spread: 0.2, gap: 9, life: 1.5, kb: 40, size: 6, blast: 56, color: [1.7, 0.8, 0.3], sound: 'swarm', fire: fireSwarm },
  // Dragon's Breath: fiery shells that set the foe alight and pop in a small burst (`pop` radius)
  dragon: { name: "Dragon's Breath", icon: 'dragon', interval: 0.5, dmg: 20, speed: 1200, pellets: 10, spread: 0.4, life: 0.55, kb: 120, size: 7, burn: 3.2, burnDps: 14, pop: 46, popP: 0.6, color: [2.2, 0.8, 0.2], sound: 'dragon', fire: fireDragon },
  // Thundergod: the Tesla Gun with more arcs and forks, and a bolt from the sky onto the thickest crowd every `strikeEvery` volleys
  thunder: { name: 'Thundergod', icon: 'thunder', interval: 0.3, dmg: 17, reach: 620, jumpR: 200, arcs: 3, jumps: 4, fall: 0.88, forks: 0.3, strikeEvery: 5, strike: 55, kb: 55, color: [0.8, 1.4, 3.0], sound: 'thunder', thunder: true, fire: fireTesla },
  // Bloodmill: huge blades that fly out, turn and come back to the hero like boomerangs, for double damage
  // (`boss`: a blade's cut of the boss is this share of its damage, every 0.2 s while it overlaps)
  bloodmill: { name: 'Bloodmill', icon: 'bloodmill', interval: 0.9, dmg: 60, speed: 660, blades: 2, rad: 33, art: 27, spin: 13, back: true, out: 0.95, boss: 0.5, life: 4.5, kb: 230, color: [2.6, 0.45, 0.2], sound: 'bloodmill', fire: fireSaw },
};

export const STAR_DMG = [1, 1, 1.3, 1.65];
export const STAR_RATE = [1, 1, 1.12, 1.25];
// each star also adds bolts (blaster lanes, scatter pellets, rockets) and a bigger look
export const STAR_SIZE = [1, 1, 1.2, 1.4];

export const RAGE_COL = [2.4, 0.55, 0.2]; // rage shots burn red-orange

// Called every step while the hero fires. dt is already scaled by fire rate,
// stars and Overdrive. A gun with `range` is a flame; one with `fire` fires
// its own way; the rest go through `fire` below on the gun's interval.
export function fireGun(run, gun, def, stars, mx, my, dt) {
  if (def.range) {
    flame(run, def, stars, mx, my, dt);
    return;
  }
  run.wTimer -= dt;
  let guard = 0;
  while (run.wTimer <= 0 && guard++ < 4) {
    run.wTimer += def.interval;
    (def.fire || fire)(run, gun, def, stars, mx, my);
  }
}

// once a step: guns with their own projectiles move them here
export function updateWeapons(run, dt) {
  const W = run.wpn;
  if (!W) return;
  if (W.blades && W.blades.n) updateBlades(run, W, dt);
  if (W.shells && W.shells.n) updateShells(run, W, dt);
}

// once a frame: and draw them here (d: the Draw, its sprite and particle lists; a: interpolation)
export function drawWeapons(run, d, a) {
  const W = run.wpn;
  if (!W) return;
  if (W.blades && W.blades.n) drawBlades(run, W, d, a);
  if (W.shells && W.shells.n) drawShells(W, d, a);
}

// a new run: clear any projectiles of their own
export function resetWeapons(run) {
  const W = run.wpn;
  if (!W) return;
  W.volley = 0;
  if (W.blades) W.blades.clear();
  if (W.shells) W.shells.n = 0;
}

// per-run state of the guns that keep their own (made on first use)
function wstate(run) {
  return run.wpn || (run.wpn = { volley: 0, blades: null, shells: null, grindT: -1, popStep: -1, pops: 0, frSaw: null, frBig: null, frTry: 0 });
}

// bolts per volley: n0 on the old 720-wide road, proportionally more on a wide one
const scaled = (n0) => Math.max(n0, Math.round(n0 * FIELD.r));

// One trigger pull. A wide field fires proportionally more bolts (FIELD.r)
// at a little less damage each, so the gun's power grows with the horde
// (FIELD.c); surges add a three-way spread (Triple Shot) or piercing,
// exploding shots (Rage).
function fire(run, gun, def, stars, mx, my) {
  const s = run.stats;
  const h = run.hero;
  h.fireT = 0.06;
  const triple = run.surge.triple > 0;
  const rage = run.surge.rage > 0;
  const look = STAR_SIZE[stars] * (rage ? 1.25 : 1);
  const col = rage ? RAGE_COL : def.color;
  const base = def.dmg * s.dmg * STAR_DMG[stars] * (rage ? 1.2 : 1);
  if (def.beam && run.aimDown) {
    // the rail swung down: heavy piercing bolts at the close threat
    const sp = 2200;
    run.bullet(mx, my, Math.cos(run.aim) * sp, Math.sin(run.aim) * sp, base * FIELD.c, 3 + (rage ? 3 : 0), 0, def, look, col, rage);
    run.sound.shot('railgun', run.pan(mx));
    return;
  }
  if (def.beam) {
    const n0 = 1 + s.multi + (stars - 1);
    const n = Math.max(n0, Math.round(n0 * FIELD.r)) * (triple ? 3 : 1);
    const dmg = (base * FIELD.c * n0 * (triple ? 3 : 1)) / n;
    const gap = def.gap * (triple ? 2.2 : 1) * FIELD.r;
    for (let k = 0; k < n; k++) rail(run, mx + (k - (n - 1) / 2) * gap, my, dmg, def, rage, look);
    run.fx.flash(mx, my, 0, 46 * look, col[0], col[1], col[2], 0.1);
    run.fx.light(mx, my - 40, 50, 330, 0.8, 2, 3, 0.12);
    run.sound.shot('railgun', run.pan(mx));
    return;
  }
  const pierce = (gun === 'scatter' ? Math.floor(s.pierce / 2) : gun === 'rocket' ? 0 : s.pierce) + (rage && gun !== 'rocket' ? 3 : 0);
  let n0 = def.pellets;
  if (gun === 'blaster') n0 += s.multi + (stars - 1);
  else if (gun === 'scatter') n0 += 2 * s.multi + 2 * (stars - 1);
  else if (gun === 'rocket') n0 += Math.floor(s.multi / 1.5) + (stars - 1);
  const n = Math.max(n0, Math.round(n0 * FIELD.r));
  const dmg = (base * FIELD.c * n0) / n;
  const fan = triple ? 3 : 1;
  for (let f = 0; f < fan; f++) {
    const aim = run.aim + (f - (fan - 1) / 2) * 0.26 * Math.sqrt(FIELD.r);
    // lanes sit side by side across the aim
    const px = -Math.sin(aim);
    const py = Math.cos(aim);
    for (let k = 0; k < n; k++) {
      let ang;
      let ox = 0;
      const c = k - (n - 1) / 2;
      if (gun === 'scatter') ang = aim + (rnd() - 0.5) * def.spread * 2 * Math.min(1.7, FIELD.r);
      else if (gun === 'rocket') {
        ang = aim + c * def.spread * FIELD.r;
        ox = c * def.gap;
      } else {
        // blaster: parallel lanes, fanning out a little past three (wider on a wide field)
        ox = c * def.gap * look;
        ang = aim + (n > 3 ? c * 0.05 * FIELD.r : 0);
      }
      const sp = def.speed * (gun === 'scatter' ? rand(0.85, 1.15) : 1);
      run.bullet(mx + px * ox, my + py * ox, Math.cos(ang) * sp, Math.sin(ang) * sp, dmg, pierce, gun === 'blaster' ? 0 : gun === 'scatter' ? 1 : 2, def, look, col, rage);
    }
  }
  run.fx.flash(mx, my, 0, (gun === 'scatter' ? 60 : 34) * look, col[0], col[1], col[2], 0.07);
  run.fx.light(mx, my - 20, 50, gun === 'scatter' ? 300 : 220, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 0.08);
  if (gun === 'scatter') run.fx.smoke(mx, my, 0, 18, 1, 0.4);
  run.sound.shot(def.sound, run.pan(mx));
}

// The flamethrower: a short cone in front of the gun. Every tick it burns
// whatever is inside (the boss and barrels too) and sets it alight. The
// Inferno is the same cone, longer and hotter, with a blue-white jet (`tint`).
function flame(run, def, stars, mx, my, dt) {
  const s = run.stats;
  const h = run.hero;
  h.fireT = 0.06;
  run.flameLv = 1;
  run.flameKind = def.flameKind || null; // the run passes it to sound.flame(level, kind)
  const rage = run.surge.rage > 0;
  const look = STAR_SIZE[stars];
  const range = def.range * (1 + 0.22 * (stars - 1)) * (1 + 0.08 * s.pierce);
  const cone0 = def.cone * (1 + 0.25 * (stars - 1)) + 0.05 * s.multi;
  const wide = Math.sqrt(FIELD.r);
  const cone = Math.min(1.15, cone0 * wide * (run.surge.triple > 0 ? 1.8 : 1));
  const ax = Math.cos(run.aim);
  const ay = Math.sin(run.aim);
  // the jet: hot puffs thrown along the cone, smoke off the end
  const fx = run.fx;
  const tint = def.tint;
  const cr = tint ? tint[0] : 1;
  const cg = tint ? tint[1] : rage ? 0.6 : 1;
  const cb = tint ? tint[2] : rage ? 0.6 : 1;
  const puffs = tint ? 6 : 4;
  for (let k = 0; k < puffs; k++) {
    const a = run.aim + (rnd() - 0.5) * cone * 1.6;
    const sp = range * rand(2.4, 3.2);
    fx.add(FIRE, HOT, mx + ax * 8, my + ay * 8, 0, Math.cos(a) * sp, Math.sin(a) * sp, 0, rand(0.26, 0.36), 9 * look, rand(40, 62) * look * (0.6 + cone), cr, cg, cb, 1, 0, 2.2);
  }
  if (tint) {
    // a white-hot spearhead down the middle of the jet
    fx.sparks(mx + ax * 12, my + ay * 12, 0, 2, 0.8, 1.8, 3.4, range * 3.2, ax, ay, cone * 0.9);
    if (rnd() < 0.5) fx.add(GLOW, HOT, mx + ax * range * rand(0.2, 0.8), my + ay * range * rand(0.2, 0.8), 0, 0, 0, 0, 0.12, 40 * look, 60 * look, 0.35, 0.9, 2.2, 1, 0, 0);
  }
  if (rnd() < 0.3) fx.smoke(mx + ax * range * 0.9, my + ay * range * 0.9, 0, 26, 1, 0.25);
  if (tint) fx.light(mx + ax * range * 0.45, my + ay * range * 0.45, 40, range * 1.3, 0.6, 1.5, 2.8, 0.05);
  else fx.light(mx + ax * range * 0.45, my + ay * range * 0.45, 40, range * 1.3, 2.2, 1.0, 0.25, 0.05);
  run.flameT -= dt;
  if (run.flameT > 0) return;
  run.flameT += def.interval;
  const tick = ++run.flameTick;
  // the flame's power grows with the field as the guns' does (FIELD.c), shared over its wider cone
  const dmg = (def.dmg * s.dmg * STAR_DMG[stars] * FIELD.c * (rage ? 1.3 : 1)) / wide;
  run.burnDps = (def.burnDps * s.dmg * STAR_DMG[stars] * FIELD.c * (rage ? 2 : 1)) / wide;
  const flags = QUIET | BURN | (tick % 4 === 0 ? PROC : 0) | (tick % 3 === 0 ? CRIT : 0);
  const E = run.enemies;
  const G = run.grid;
  const tc = Math.tan(cone);
  const c0 = G.cx(mx - range - 60);
  const c1 = G.cx(mx + range + 60);
  const r0 = G.cy(my - range - 20);
  const r1 = G.cy(my + range + 160);
  for (let rr = r0; rr <= r1; rr++)
    for (let c = c0; c <= c1; c++) {
      const cc = rr * G.cols + c;
      for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
        const j = G.items[m];
        if (!E.alive[j] || E.dying[j]) continue;
        const T0 = TYPES[E.type[j]];
        if (T0.boss) continue;
        const hr = T0.hr * E.scale[j];
        if (inCone(E.x[j] - mx, E.y[j] - T0.hitY * E.scale[j] * 0.5 - my, ax, ay, range, tc, hr)) scorch(run, j, dmg, ax, ay, def.kb, flags, def.burn);
      }
    }
  const b = run.boss && E.alive[run.boss.i] ? run.boss.i : -1;
  if (b >= 0) {
    const T0 = TYPES[E.type[b]];
    if (inCone(E.x[b] - mx, E.y[b] - T0.hitY * 0.5 - my, ax, ay, range, tc, T0.hr * 0.8)) scorch(run, b, dmg, ax, ay, 0, flags, def.burn * 0.5);
  }
  const R = run.barrels;
  for (let k = 0; k < R.n; k++) if (inCone(R.x[k] - mx, R.y[k] - 22 - my, ax, ay, range, tc, 22)) R.hp[k] -= dmg * 2;
}

function inCone(vx, vy, ax, ay, range, tc, hr) {
  const along = vx * ax + vy * ay;
  if (along < -hr || along > range + hr) return false;
  const side = Math.abs(vx * ay - vy * ax);
  return side < Math.max(0, along) * tc + hr + 10;
}

function scorch(run, j, dmg, ax, ay, kb, flags, burn) {
  run.ignite(j, burn, run.burnDps);
  run.hurt(j, dmg, ax, ay, kb, flags);
}

// a rail beam: everything in its lane up the road takes the hit
function rail(run, lx, my, dmg, def, rage = false, look = 1) {
  const E = run.enemies;
  const G = run.grid;
  const c0 = G.cx(lx - 50);
  const c1 = G.cx(lx + 50);
  const r1 = G.cy(my + 60);
  const top = run.top();
  for (let rr = 0; rr <= r1; rr++)
    for (let c = c0; c <= c1; c++) {
      const cc = rr * G.cols + c;
      for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
        const j = G.items[m];
        if (!E.alive[j] || E.dying[j]) continue;
        const T0 = TYPES[E.type[j]];
        if (T0.boss) continue; // tested below with its own big circle
        const cy = E.y[j] - T0.hitY * E.scale[j];
        if (cy > my || cy < top - 40) continue;
        if (Math.abs(E.x[j] - lx) < T0.hr * E.scale[j] + 8 * look) {
          run.hurt(j, dmg, 0, -1, def.kb, CRIT | PROC);
          if (rage && run.blastBudget > 0 && rnd() < 0.35) {
            run.blastBudget--;
            run.explode(E.x[j], cy + 10, 60, dmg * 0.6, 300, 'round');
          }
        }
      }
    }
  if (run.boss && E.alive[run.boss.i]) {
    const b = run.boss.i;
    if (Math.abs(E.x[b] - lx) < TYPES[E.type[b]].hr) run.hurt(b, dmg, 0, -1, 0, CRIT | PROC);
  }
  run.hitBarrelsLine(lx, my, dmg);
  const c = rage ? RAGE_COL : def.color;
  run.fx.beam(lx, my, lx, top - 60, 10 * look, c[0], c[1], c[2], 0.14, 0);
}

// ====================================================================== Tesla Gun, Thundergod
// A volley: the nearest foes in front of the muzzle each take an arc (phase 1, so every arc has its own
// target), then each arc jumps on from its foe to the nearest one not yet struck, a little weaker each time
// (phase 2). A foe is struck once a volley (run.chainMark / chainId, as run.chain does). With fewer foes than
// arcs the spare arcs strike the nearest again, so a lone boss takes every arc.

const MAX_CAND = 24;
const CAND = new Int32Array(MAX_CAND);
const CAND_D = new Float32Array(MAX_CAND);
let nCand = 0;
const ARC = new Int32Array(MAX_CAND * 3); // this volley's arcs: the foe each strikes (a repeat strike on a foe already chosen is possible)
const PRIM = new Int32Array(MAX_CAND * 3); // the foes that chain on (each chosen once), in arc order
const PRIM_X = new Float32Array(MAX_CAND * 3); // where each arc's foe was
const PRIM_Y = new Float32Array(MAX_CAND * 3);
const FORK = { x: new Float32Array(8), y: new Float32Array(8), j: new Int32Array(8), n: new Uint8Array(8), d: new Float32Array(8) };
// the volley being fired (read by the chain)
const Z = { col: null, jumpR: 0, fall: 0.8, forkP: 0, rage: false, hits: 0, cap: 90 };

// remember a foe at distance d, keeping the K nearest in order
function offer(j, d, K) {
  let k;
  if (nCand < K) k = nCand++;
  else if (d < CAND_D[K - 1]) k = K - 1;
  else return;
  while (k > 0 && CAND_D[k - 1] > d) {
    CAND[k] = CAND[k - 1];
    CAND_D[k] = CAND_D[k - 1];
    k--;
  }
  CAND[k] = j;
  CAND_D[k] = d;
}

// the K nearest unstruck foes inside a cone (heading `ang`, cosine `cosMin`) out to `range`; the boss counts from its rim
function scanAhead(run, mx, my, ang, cosMin, range, K) {
  nCand = 0;
  const ax = Math.cos(ang);
  const ay = Math.sin(ang);
  const E = run.enemies;
  const G = run.grid;
  const mark = run.chainMark;
  const id = run.chainId;
  const r2 = range * range;
  const c0 = G.cx(mx - range);
  const c1 = G.cx(mx + range);
  const r0 = G.cy(my - range);
  const r1 = G.cy(my + range + 100);
  for (let rr = r0; rr <= r1; rr++)
    for (let c = c0; c <= c1; c++) {
      const cc = rr * G.cols + c;
      for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
        const j = G.items[m];
        if (!E.alive[j] || E.dying[j] || mark[j] === id) continue;
        const T0 = TYPES[E.type[j]];
        if (T0.boss) continue;
        const vx = E.x[j] - mx;
        const vy = E.y[j] - T0.hitY * E.scale[j] * 0.6 - my;
        const d2 = vx * vx + vy * vy;
        if (d2 > r2 || d2 < 4) continue;
        const d = Math.sqrt(d2);
        if (vx * ax + vy * ay < cosMin * d) continue;
        offer(j, d, K);
      }
    }
  const b = run.boss && E.alive[run.boss.i] ? run.boss.i : -1;
  if (b >= 0 && mark[b] !== id) {
    const T0 = TYPES[E.type[b]];
    const vx = E.x[b] - mx;
    const vy = E.y[b] - T0.hitY * 0.6 - my;
    const d = Math.sqrt(vx * vx + vy * vy) || 1;
    if (d - T0.hr * 0.7 < range && vx * ax + vy * ay >= cosMin * d) offer(b, Math.max(1, d - T0.hr * 0.7), K);
  }
}

// a jagged arc: a few kinked segments of the run's lightning beam (its shader adds a flicker)
function bolt(fx, x0, y0, x1, y1, w, col, life) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const segs = len < 70 ? 2 : len < 180 ? 3 : len < 360 ? 4 : 6;
  const nx = -dy / len;
  const ny = dx / len;
  const amp = Math.min(34, len * 0.11);
  let ax = x0;
  let ay = y0;
  for (let k = 1; k <= segs; k++) {
    let bx = x1;
    let by = y1;
    if (k < segs) {
      const t = k / segs;
      const o = (rnd() - 0.5) * 2 * amp;
      bx = x0 + dx * t + nx * o;
      by = y0 + dy * t + ny * o;
    }
    fx.beam(ax, ay, bx, by, w, col[0], col[1], col[2], life, 1);
    ax = bx;
    ay = by;
  }
}

function fireTesla(run, gun, def, stars, mx, my) {
  const s = run.stats;
  const fx = run.fx;
  run.hero.fireT = 0.06;
  const W = wstate(run);
  const triple = run.surge.triple > 0;
  const rage = run.surge.rage > 0;
  const E = run.enemies;
  const col = def.color;
  const look = STAR_SIZE[stars];
  const base = def.dmg * s.dmg * STAR_DMG[stars] * (rage ? 1.2 : 1);
  // more stars and Multishot: more arcs; Piercing: more jumps. A wide field: more arcs at less damage each.
  const n0 = def.arcs + s.multi + (stars - 1);
  const n = Math.min(scaled(n0), MAX_CAND);
  const dmg = (base * FIELD.c * n0) / n;
  const jumps = def.jumps + (stars - 1) + s.pierce + (rage ? 2 : 0);
  const reach = def.reach * FIELD.r * (1 + 0.08 * (stars - 1));
  const fans = triple ? 3 : 1;
  Z.col = col;
  Z.jumpR = def.jumpR * FIELD.r;
  Z.fall = def.fall;
  Z.forkP = def.forks || 0;
  Z.rage = rage;
  Z.hits = 0;
  W.pops = 0;
  run.chainId++;
  // choose: one arc to each of the nearest foes (each fan of a Triple Shot to its own side), marking them so no
  // arc takes another's target; with fewer foes than arcs the spare arcs repeat on the nearest
  let na = 0;
  let np = 0;
  for (let f = 0; f < fans; f++) {
    const ang = run.aim + (f - (fans - 1) / 2) * 0.62;
    scanAhead(run, mx, my, ang, fans > 1 ? 0.66 : 0.1, reach, n);
    const m = nCand;
    for (let k = 0; k < m && k < n; k++) run.chainMark[CAND[k]] = run.chainId;
    for (let k = 0; m && k < n && na < ARC.length; k++) {
      ARC[na] = CAND[k % m];
      if (k < m) PRIM[np++] = CAND[k]; // a repeat strike on the same foe does not chain again
      na++;
    }
  }
  // strike
  for (let k = 0; k < na; k++) {
    const j = ARC[k];
    const T0 = TYPES[E.type[j]];
    const bz = T0.boss ? T0.hitY * 0.6 : T0.hitY * E.scale[j] * 0.7;
    const jx = E.x[j];
    const jy = E.y[j] - bz;
    PRIM_X[k] = jx;
    PRIM_Y[k] = jy;
    if (!E.alive[j] || E.dying[j]) continue; // already struck down by an earlier arc's burst
    const dx = jx - mx;
    const dy = jy - my;
    const d = Math.hypot(dx, dy) || 1;
    bolt(fx, mx, my, jx + (T0.boss ? rand(-1, 1) * T0.hr * 0.4 : 0), jy, 8.5 * Math.sqrt(look), col, 0.14);
    fx.sparks(jx, E.y[j], bz, 3, 0.8, 1.8, 3.2, 320, dx / d, dy / d, 2.6);
    run.hurt(j, dmg, dx / d, dy / d, def.kb, CRIT | PROC | SHOCK);
    Z.hits++;
    if (rage) pop(run, W, jx, jy + 8, dmg, 0.5);
  }
  // a Chain Lightning proc during the strikes starts a new chain id: mark the struck foes again, then jump on
  run.chainId++;
  for (let k = 0; k < np; k++) run.chainMark[PRIM[k]] = run.chainId;
  for (let k = 0, q = 0; k < na && q < np; k++) {
    if (ARC[k] !== PRIM[q]) continue;
    chainArc(run, W, PRIM_X[k], PRIM_Y[k], ARC[k], jumps, dmg);
    q++;
  }
  if (!na) {
    // nothing in reach: the coil crackles into the air
    const a = run.aim + rand(-0.5, 0.5);
    const L = rand(0.25, 0.45) * reach;
    bolt(fx, mx, my, mx + Math.cos(a) * L, my + Math.sin(a) * L, 6, col, 0.1);
  }
  fx.flash(mx, my, 0, 52 * look, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 0.09);
  fx.light(mx, my - 20, 50, 280, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 0.09);
  run.sound.shot(def.sound, run.pan(mx));
  if (def.thunder && ++W.volley % def.strikeEvery === 0) skyStrike(run, def, stars, jumps);
}

// jump on from (x, y) (a struck foe `cur`) to the nearest unstruck foes; thunder arcs fork now and then
function chainArc(run, W, x, y, cur, jumps, dmg) {
  const E = run.enemies;
  const fx = run.fx;
  const col = Z.col;
  let sp = 0;
  for (;;) {
    while (jumps > 0 && Z.hits < Z.cap) {
      const j = run.nearest(x, y + 16, Z.jumpR, cur);
      if (j < 0) break;
      run.chainMark[j] = run.chainId;
      const T0 = TYPES[E.type[j]];
      const bz = T0.boss ? T0.hitY * 0.6 : T0.hitY * E.scale[j] * 0.7;
      const jx = E.x[j];
      const jy = E.y[j] - bz;
      const dx = jx - x;
      const dy = jy - y;
      const d = Math.hypot(dx, dy) || 1;
      dmg *= Z.fall;
      jumps--;
      Z.hits++;
      bolt(fx, x, y, jx, jy, 5.5, col, 0.13);
      fx.sparks(jx, E.y[j], bz, 2, 0.8, 1.8, 3.2, 260, dx / d, dy / d, 2.4);
      run.hurt(j, dmg, dx / d, dy / d, 30, CRIT | SHOCK | QUIET);
      if (Z.rage) pop(run, W, jx, jy + 8, dmg, 0.22);
      if (Z.forkP && jumps > 0 && sp < 6 && rnd() < Z.forkP) {
        FORK.x[sp] = jx;
        FORK.y[sp] = jy;
        FORK.j[sp] = j;
        FORK.n[sp] = jumps - 1;
        FORK.d[sp++] = dmg;
      }
      x = jx;
      y = jy;
      cur = j;
    }
    if (!sp) return;
    sp--;
    x = FORK.x[sp];
    y = FORK.y[sp];
    cur = FORK.j[sp];
    jumps = FORK.n[sp];
    dmg = FORK.d[sp];
  }
}

// Rage: an arc bursts where it hits (at most a few a volley, and within the run's blast budget)
function pop(run, W, x, y, dmg, p) {
  if (W.pops >= 5 || run.blastBudget <= 0 || rnd() >= p) return;
  W.pops++;
  run.blastBudget--;
  run.explode(x, y, 52, dmg * 0.6, 260, 'round');
}

// Thundergod: a bolt from the sky onto the thickest part of the crowd, chaining on (run.lightningStrike, scaled to the gun)
function skyStrike(run, def, stars, jumps) {
  const E = run.enemies;
  const s = run.stats;
  const fx = run.fx;
  const top = run.top();
  let best = -1;
  let bestN = 0;
  for (let k = 0; k < 28 && E.n; k++) {
    const i = E.list[Math.floor(rnd() * E.n)];
    if (E.dying[i] || E.y[i] < top + 60) continue;
    const c = run.countNear(E.x[i], E.y[i], 130);
    if (c > bestN) {
      bestN = c;
      best = i;
    }
  }
  if (best < 0) return;
  const T0 = TYPES[E.type[best]];
  const x = E.x[best];
  const y = E.y[best] - T0.hitY * 0.5;
  const col = def.color;
  fx.beam(x + rand(-40, 40), top - 200, x, y, 15, 1.1, 1.5, 3.2, 0.24, 1);
  fx.beam(x + rand(-90, 90), top - 200, x, y, 8, 1.1, 1.5, 3.2, 0.18, 1);
  fx.flash(x, y, 20, 220, 1.5, 2, 4, 0.18);
  fx.light(x, y, 120, 760, 2.4, 3.2, 5, 0.3);
  fx.ring(x, y, 20, 170 * FIELD.r, 1, 1.6, 3, 0.3);
  fx.splat(x, y, 80, 0.04, 0.04, 0.05, 0.5, 2);
  run.sound.lightning?.();
  run.app.flash?.(0.7, 0.85, 1, 0.16);
  run.shake(0.3);
  const dmg = def.strike * s.dmg * STAR_DMG[stars] * FIELD.c;
  run.blast(x, y, 120 * FIELD.r, dmg, 380, 'shock');
  if (E.alive[best]) {
    run.chainId++;
    run.chainMark[best] = run.chainId;
    Z.col = col;
    Z.jumpR = def.jumpR * FIELD.r;
    Z.fall = 0.9;
    Z.forkP = def.forks || 0;
    Z.rage = false;
    Z.hits = 0;
    Z.cap = 40;
    chainArc(run, wstate(run), x, y, best, jumps + 3, dmg * 0.5);
    Z.cap = 90;
  }
}

// ====================================================================== Saw Launcher, Bloodmill
// Blades live in fixed slots. Each remembers (in `seen`, one row per blade) which creatures it has cut this pass,
// by the creature's generation, so a foe is hit once per pass; a bounce (or the Bloodmill's turn) starts a new pass.
// A killing blow is a 'crit' kill with extra blood and limbs.

const MAXB = 48;
class Blades {
  constructor(ecap) {
    this.ecap = ecap;
    this.n = 0;
    const F = () => new Float32Array(MAXB);
    this.x = F();
    this.y = F();
    this.px = F();
    this.py = F();
    this.vx = F();
    this.vy = F();
    this.rot = F();
    this.prot = F();
    this.vrot = F();
    this.dmg = F();
    this.age = F();
    this.life = F();
    this.rad = F();
    this.draw = F(); // sprite scale
    this.kb = F();
    this.bossT = F(); // time to the next cut of the boss
    this.boss = F(); // share of its damage a cut of the boss does
    this.out = F(); // Bloodmill: seconds of flying out before it turns
    this.alive = new Uint8Array(MAXB);
    this.kind = new Uint8Array(MAXB); // 0 saw, 1 bloodmill
    this.bounce = new Uint8Array(MAXB);
    this.rage = new Uint8Array(MAXB);
    this.stage = new Uint8Array(MAXB); // Bloodmill: 0 flying out, 1 coming back
    this.seen = new Int32Array(MAXB * ecap);
  }
  clear() {
    this.alive.fill(0);
    this.n = 0;
  }
  take() {
    for (let i = 0; i < MAXB; i++)
      if (!this.alive[i]) {
        this.alive[i] = 1;
        this.n++;
        this.seen.fill(0, i * this.ecap, (i + 1) * this.ecap);
        return i;
      }
    return -1;
  }
  free(i) {
    this.alive[i] = 0;
    this.n--;
  }
}

function fireSaw(run, gun, def, stars, mx, my) {
  const s = run.stats;
  const W = wstate(run);
  run.hero.fireT = 0.06;
  const B = W.blades || (W.blades = new Blades(run.enemies.cap));
  const triple = run.surge.triple > 0;
  const rage = run.surge.rage > 0;
  const mill = !!def.back;
  const col = rage ? RAGE_COL : def.color;
  const look = STAR_SIZE[stars];
  // the Saw: a second blade from two stars, and Multishot one more each; the Bloodmill's are huge, one more for every two
  const n0 = mill ? def.blades + Math.floor((s.multi + stars - 1) / 2) : def.blades + s.multi + (stars > 1 ? 1 : 0);
  const n = Math.min(scaled(n0), 12);
  const dmg = (def.dmg * s.dmg * STAR_DMG[stars] * (rage ? 1.2 : 1) * FIELD.c * n0) / n;
  const rad = def.rad * (1 + (mill ? 0.12 : 0.1) * (stars - 1)) * s.size * (rage ? 1.1 : 1);
  const bounces = def.bounces + (stars >= 3 ? 1 : 0) + s.bounce;
  const fans = triple ? 3 : 1;
  const spread = 0.2 * Math.sqrt(FIELD.r);
  let launched = 0;
  for (let f = 0; f < fans; f++)
    for (let k = 0; k < n; k++) {
      const i = B.take();
      if (i < 0) break;
      launched++;
      const ang = run.aim + (f - (fans - 1) / 2) * 0.55 + (k - (n - 1) / 2) * spread + rand(-0.04, 0.04);
      const sp = def.speed * (mill ? 1 : rand(0.95, 1.05));
      B.x[i] = B.px[i] = mx;
      B.y[i] = B.py[i] = my;
      B.vx[i] = Math.cos(ang) * sp;
      B.vy[i] = Math.sin(ang) * sp;
      B.rot[i] = B.prot[i] = rnd() * TAU;
      B.vrot[i] = def.spin * (rnd() < 0.5 ? -1 : 1) * rand(0.9, 1.1);
      B.dmg[i] = dmg;
      B.age[i] = 0;
      B.life[i] = def.life;
      B.rad[i] = rad;
      B.draw[i] = rad / def.art;
      B.kb[i] = def.kb;
      B.bossT[i] = 0;
      B.boss[i] = def.boss || 1;
      B.out[i] = def.out || 0;
      B.kind[i] = mill ? 1 : 0;
      B.bounce[i] = mill ? 0 : bounces;
      B.rage[i] = rage ? 1 : 0;
      B.stage[i] = 0;
    }
  if (launched) {
    const fx = run.fx;
    fx.flash(mx, my, 0, 46 * look, col[0], col[1], col[2], 0.08);
    fx.sparks(mx, my, 0, 5, col[0], col[1], col[2], 420, Math.cos(run.aim), Math.sin(run.aim), 1.2);
    fx.light(mx, my - 20, 50, 240, col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 0.08);
  }
  if (launched) run.sound.shot(def.sound, run.pan(mx));
}

const LIMBS = [];
// the arms and legs thrown clear of a blade kill, by creature type: [an arm and a leg, two of each] (names made once)
function limbs(type) {
  let a = LIMBS[type];
  if (!a) {
    const g = TYPES[type].gib;
    a = LIMBS[type] = [[`${g}_arm`, `${g}_leg`], [`${g}_arm`, `${g}_leg`, `${g}_arm`, `${g}_leg`]];
  }
  return a;
}

// one cut: a killing blow is a 'crit' kill (heads and limbs fly) with extra blood and limbs sprayed along the blade
function rip(run, j, dmg, nx, ny, kb) {
  const E = run.enemies;
  const T0 = TYPES[E.type[j]];
  const x = E.x[j];
  const y = E.y[j];
  const h = T0.hitY * E.scale[j];
  const col = T0.blood;
  const lethal = E.hp[j] <= dmg;
  run.hurt(j, lethal ? Math.max(0, E.hp[j] - 0.01) : dmg, nx, ny, kb, CRIT | PROC | QUIET);
  const fx = run.fx;
  if (lethal) {
    if (E.alive[j] && !E.dying[j]) run.kill(j, 'crit', nx, ny);
    fx.blood(x, y, h, nx, ny, 16, 520, col, 1.1);
    fx.blood(x, y, h, -nx, -ny, 6, 300, col, 1.5);
    fx.mist(x, y, h, col, 26, 2);
    const g = run.gore;
    if (g.n < g.cap * 0.55) g.burst(limbs(E.type[j])[rnd() < 0.5 ? 1 : 0], x, y, h, 440, col, nx, ny);
  } else {
    fx.blood(x, y, h, nx, ny, 5, 340, col, 0.9);
  }
}

// a blade is spent: Rage blades go off where they end
function endBlade(run, B, i) {
  if (B.rage[i] && run.blastBudget > 0) {
    run.blastBudget--;
    const x = clamp(B.x[i], 40, ARENA.w - 40);
    const y = clamp(B.y[i], run.top() + 80, ARENA.h);
    run.explode(x, y, 95, B.dmg[i] * 1.6, 520, 'round');
  }
  B.free(i);
}

function updateBlades(run, W, dt) {
  const B = W.blades;
  const E = run.enemies;
  const hero = run.hero;
  const boss = run.boss && E.alive[run.boss.i] ? run.boss.i : -1;
  const fieldW = ARENA.w;
  const topY = run.top() + 40;
  let hitAny = 0;
  let grindX = hero.x;
  for (let i = 0; i < MAXB; i++) {
    if (!B.alive[i]) continue;
    B.px[i] = B.x[i];
    B.py[i] = B.y[i];
    B.prot[i] = B.rot[i];
    B.rot[i] += B.vrot[i] * dt;
    B.age[i] += dt;
    B.bossT[i] -= dt;
    const rad = B.rad[i];
    if (B.kind[i] === 1) {
      // the Bloodmill: flies out, then curves home to the hero and is caught (a fresh pass each way)
      if (B.stage[i] === 0 && (B.age[i] >= B.out[i] || B.y[i] < topY)) {
        B.stage[i] = 1;
        B.seen.fill(0, i * B.ecap, (i + 1) * B.ecap);
        if (B.rage[i]) {
          endBlade(run, B, i);
          continue;
        }
      }
      if (B.stage[i] === 1 && hero.alive) {
        const dx = hero.x - B.x[i];
        const dy = hero.y - 70 - B.y[i];
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d < 60) {
          run.fx.sparks(B.x[i], B.y[i], 0, 6, 2.4, 0.8, 0.4, 380, 0, -1, TAU);
          B.free(i);
          continue;
        }
        const sp = Math.min(1000, 520 + (B.age[i] - B.out[i]) * 900);
        const k = Math.min(1, 6 * dt);
        B.vx[i] += ((dx / d) * sp - B.vx[i]) * k;
        B.vy[i] += ((dy / d) * sp - B.vy[i]) * k;
      }
    }
    const x0 = B.x[i];
    const y0 = B.y[i];
    let x1 = x0 + B.vx[i] * dt;
    let y1 = y0 + B.vy[i] * dt;
    let end = B.age[i] >= B.life[i] || y1 > ARENA.h + 90;
    // the side edges and the top of the view: bounce while bounces are left (a new pass, on a slightly new line), else fly off
    if (!end) {
      const left = x1 < 14 && B.vx[i] < 0;
      const right = x1 > fieldW - 14 && B.vx[i] > 0;
      const up = y1 < topY + rad * 0.5 && B.vy[i] < 0;
      if (B.kind[i] === 1) {
        if (left || right) {
          B.vx[i] = -B.vx[i];
          x1 = clamp(x1, 14, fieldW - 14);
        }
        if (up) {
          B.vy[i] = Math.abs(B.vy[i]);
          y1 = topY + rad * 0.5;
        }
      } else if (left || right || up) {
        if (B.bounce[i] > 0) {
          B.bounce[i]--;
          const sp = Math.hypot(B.vx[i], B.vy[i]);
          if (up) {
            y1 = topY + rad * 0.5 + (topY + rad * 0.5 - y1);
            B.vy[i] = -B.vy[i];
          } else {
            x1 = left ? 28 - x1 : 2 * (fieldW - 14) - x1;
            B.vx[i] = -B.vx[i];
          }
          const a = Math.atan2(B.vy[i], B.vx[i]) + rand(-0.3, 0.3);
          B.vx[i] = Math.cos(a) * sp;
          B.vy[i] = Math.sin(a) * sp;
          B.seen.fill(0, i * B.ecap, (i + 1) * B.ecap);
          run.fx.sparks(clamp(x1, 14, fieldW - 14), Math.max(y1, topY), 0, 8, 2.4, 1.8, 0.8, 520, -B.vx[i], -B.vy[i], 2.2);
        } else if (x1 < -60 || x1 > fieldW + 60 || y1 < topY - 70) end = true;
      }
    }
    B.x[i] = x1;
    B.y[i] = y1;
    if (end) {
      endBlade(run, B, i);
      continue;
    }
    // cut everything the blade sweeps through
    const sl = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = (x1 - x0) / sl;
    const ny = (y1 - y0) / sl;
    const hits = sweepBlade(run, B, i, x0, y0, x1, y1, nx, ny);
    hitAny += hits;
    if (hits) grindX = x1;
    if (boss >= 0 && B.bossT[i] <= 0) {
      const T0 = TYPES[E.type[boss]];
      const ex = E.x[boss];
      const ey = E.y[boss] - T0.hitY;
      const rr = T0.hr * 0.85 + rad;
      const dx = x1 - ex;
      const dy = y1 - ey;
      if (dx * dx + dy * dy < rr * rr) {
        B.bossT[i] = 0.2;
        run.hurt(boss, B.dmg[i] * B.boss[i], nx, ny, 0, CRIT | PROC);
        run.fx.sparks(x1, y1, 0, 4, B.rage[i] ? 2.4 : 1.8, 1.2, 0.5, 380, -nx, -ny, 2);
        hitAny++;
      }
    }
    grab(run, x1, y1, rad, B.dmg[i]);
    // sparks off the edge, and a light for the first few
    if (rnd() < 0.35) run.fx.sparks(x1, y1, 0, 1, 1.8, 1.4, 0.7, 260, -nx, -ny, 1.6);
    if (i < 5 && (run.stepN & 1) === 0) run.fx.light(x1, y1, 30, 150, B.kind[i] ? 1.6 : 1.2, B.kind[i] ? 0.3 : 0.8, B.kind[i] ? 0.15 : 0.3, 0.06);
  }
  if (hitAny && run.time - W.grindT > 0.07) {
    W.grindT = run.time;
    run.sound.sawGrind?.(run.pan(grindX));
  }
}

// the swept disc of blade i against creature hit circles in the cells it crosses; returns the number cut
function sweepBlade(run, B, i, x0, y0, x1, y1, nx, ny) {
  const E = run.enemies;
  const G = run.grid;
  const R = B.rad[i];
  const pad = 90;
  const c0 = G.cx(Math.min(x0, x1) - pad);
  const c1 = G.cx(Math.max(x0, x1) + pad);
  const r0 = G.cy(Math.min(y0, y1) - 40);
  const r1 = G.cy(Math.max(y0, y1) + 130); // creatures are binned by their feet, which lie below the circle a blade meets
  const sx = x1 - x0;
  const sy = y1 - y0;
  const sl2 = sx * sx + sy * sy || 1;
  const seen = B.seen;
  const o = i * B.ecap;
  let hits = 0;
  for (let rr = r0; rr <= r1; rr++)
    for (let c = c0; c <= c1; c++) {
      const cc = rr * G.cols + c;
      for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
        const j = G.items[m];
        if (!E.alive[j] || E.dying[j] || seen[o + j] === E.gen[j]) continue;
        const T0 = TYPES[E.type[j]];
        if (T0.boss) continue; // cut below on a timer
        const sc = E.scale[j];
        const ex = E.x[j];
        const ey = E.y[j] - T0.hitY * sc;
        const rad = T0.hr * sc * 0.9 + R;
        let t = ((ex - x0) * sx + (ey - y0) * sy) / sl2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = x0 + sx * t - ex;
        const qy = y0 + sy * t - ey;
        if (qx * qx + qy * qy > rad * rad) continue;
        seen[o + j] = E.gen[j];
        rip(run, j, B.dmg[i], nx, ny, B.kb[i]);
        hits++;
      }
    }
  return hits;
}

// a projectile of the guns' own passes over the road: it bursts weapon-less pickups (like a bullet) and lights barrels
function grab(run, x, y, r, dmg) {
  const P = run.pickups;
  for (let k = 0; k < P.n; k++) {
    if (P.kind[k] === CRATE) continue; // crates are a choice: only touching one swaps the gun
    const dx = x - P.x[k];
    const dy = y - P.y[k];
    if (dx * dx + dy * dy < (30 + r) * (30 + r)) {
      run.collect(k);
      k--;
    }
  }
  const R = run.barrels;
  for (let k = 0; k < R.n; k++) {
    const dx = x - R.x[k];
    const dy = y - (R.y[k] - 22);
    if (dx * dx + dy * dy < (22 + r) * (22 + r)) {
      R.hp[k] -= dmg;
      R.flash[k] = 1;
    }
  }
}

function bladeFrames(run, W) {
  if (W.frSaw && W.frBig) return;
  // look again only now and then while the art is not in the atlas
  if (!W.frSaw && !W.frBig && W.frTry++ % 120) return;
  if (!W.frSaw) W.frSaw = run.atlas.get('sawblade');
  if (!W.frBig) W.frBig = run.atlas.get('sawblade_big', 'sawblade');
}

function drawBlades(run, W, d, a) {
  bladeFrames(run, W);
  const B = W.blades;
  const S = d.overSprites;
  for (let i = 0; i < MAXB; i++) {
    if (!B.alive[i]) continue;
    const x = B.px[i] + (B.x[i] - B.px[i]) * a;
    const y = B.py[i] + (B.y[i] - B.py[i]) * a;
    const rot = B.prot[i] + (B.rot[i] - B.prot[i]) * a;
    const mill = B.kind[i] === 1;
    const fr = mill ? W.frBig : W.frSaw;
    const rage = B.rage[i] === 1;
    const rad = B.rad[i];
    // a glow, two ghosts behind it (the motion), the blade, and a shadow on the road
    if (mill || rage) d.hot.p(x, y, rad * 2.4, 0, 2.2, 0.35, 0.12, 0.42, GLOW, 0, 0, 0);
    else d.hot.p(x, y, rad * 2.0, 0, 1.4, 1.0, 0.4, 0.3, GLOW, 0, 0, 0);
    if (fr) {
      const vx = B.vx[i] * 0.016;
      const vy = B.vy[i] * 0.016;
      S.put(fr, x - vx * 2, y - vy * 2, y, B.draw[i], rot - B.vrot[i] * 0.032, 1, 0, 0, 0.22);
      S.put(fr, x - vx, y - vy, y, B.draw[i], rot - B.vrot[i] * 0.016, 1, 0, 0, 0.4);
      S.put(fr, x, y, y + 1, B.draw[i], rot, 1, 0, 0, 1, rage ? 0.5 : 0);
    } else {
      // no art yet: a spinning ring stands in
      d.hot.p(x, y, rad * 1.3, rot, 1.8, 1.6, 1.2, 1, HERO_RING, 0, 0, 0);
    }
    d.shadow(x, y + 36, rad * 0.9, 0.28);
  }
}

// ====================================================================== Swarm Pod
// The rocket's homing rockets (run.bullet kind 2), three times as many, each smaller. They fly at a steady speed (no
// engine smoke from the run, which would swamp the particles) and the salvo leaves staggered: each at its own speed.

function fireSwarm(run, gun, def, stars, mx, my) {
  const s = run.stats;
  run.hero.fireT = 0.06;
  const triple = run.surge.triple > 0;
  const rage = run.surge.rage > 0;
  const look = STAR_SIZE[stars] * (rage ? 1.15 : 1);
  const col = rage ? RAGE_COL : def.color;
  const base = def.dmg * s.dmg * STAR_DMG[stars] * (rage ? 1.2 : 1);
  const n0 = def.pellets * (1 + Math.floor(s.multi / 1.5) + (stars - 1));
  const n = Math.min(scaled(n0), triple ? 8 : 24);
  const dmg = (base * FIELD.c * n0) / n;
  const fan = triple ? 3 : 1;
  for (let f = 0; f < fan; f++) {
    const aim = run.aim + (f - (fan - 1) / 2) * 0.3 * Math.sqrt(FIELD.r);
    const px = -Math.sin(aim);
    const py = Math.cos(aim);
    for (let k = 0; k < n; k++) {
      const c = k - (n - 1) / 2;
      const ang = aim + c * (def.spread * 0.5 / Math.max(1, Math.sqrt(n / 3))) * FIELD.r + rand(-0.06, 0.06);
      const ox = c * def.gap;
      const sp = def.speed * rand(0.55, 1.1);
      run.bullet(mx + px * ox, my + py * ox, Math.cos(ang) * sp, Math.sin(ang) * sp, dmg, 0, 2, def, look, col, rage);
    }
  }
  const fx = run.fx;
  fx.flash(mx, my, 0, 46 * look, col[0], col[1], col[2], 0.08);
  fx.smoke(mx, my, 0, 22, 2, 0.4);
  fx.light(mx, my - 20, 50, 240, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 0.09);
  run.sound.shot(def.sound, run.pan(mx));
}

// ====================================================================== Dragon's Breath
// Scatter-gun shells that burn: a hit sets the foe alight (run.ignite) and the shell pops in a small burst that
// hurts and ignites the foes round it. Shells fly, hit and pierce like the run's pellets (and ricochet with that stat).

const MAXS = 640;
class Shells {
  constructor() {
    this.n = 0;
    const F = () => new Float32Array(MAXS);
    this.x = F();
    this.y = F();
    this.px = F();
    this.py = F();
    this.vx = F();
    this.vy = F();
    this.dmg = F();
    this.life = F();
    this.size = F();
    this.kb = F();
    this.burn = F();
    this.pierce = new Int16Array(MAXS);
    this.bounce = new Uint8Array(MAXS);
    this.rage = new Uint8Array(MAXS);
    this.hitN = new Uint8Array(MAXS);
    this.hits = new Int32Array(MAXS * 4);
    this.arrays = [this.x, this.y, this.px, this.py, this.vx, this.vy, this.dmg, this.life, this.size, this.kb, this.burn, this.pierce, this.bounce, this.rage, this.hitN];
  }
  kill(i) {
    const last = --this.n;
    if (i === last) return;
    const A = this.arrays;
    for (let k = 0; k < A.length; k++) A[k][i] = A[k][last];
    this.hits.copyWithin(i * 4, last * 4, last * 4 + 4);
  }
}

function fireDragon(run, gun, def, stars, mx, my) {
  const s = run.stats;
  const W = wstate(run);
  const S = W.shells || (W.shells = new Shells());
  run.hero.fireT = 0.06;
  const triple = run.surge.triple > 0;
  const rage = run.surge.rage > 0;
  const look = STAR_SIZE[stars] * (rage ? 1.2 : 1);
  const col = rage ? RAGE_COL : def.color;
  const base = def.dmg * s.dmg * STAR_DMG[stars] * (rage ? 1.2 : 1);
  const n0 = def.pellets + 2 * s.multi + 2 * (stars - 1);
  const n = Math.min(scaled(n0), triple ? 30 : 60);
  const dmg = (base * FIELD.c * n0) / n;
  const pierce = Math.floor(s.pierce / 2) + (rage ? 2 : 0);
  // the burn grows with the gun like the flame's (shared over the shells)
  const burn = (def.burnDps * s.dmg * STAR_DMG[stars] * FIELD.c * (rage ? 1.6 : 1)) / Math.sqrt(FIELD.r);
  const fan = triple ? 3 : 1;
  for (let f = 0; f < fan; f++) {
    const aim = run.aim + (f - (fan - 1) / 2) * 0.26 * Math.sqrt(FIELD.r);
    for (let k = 0; k < n && S.n < MAXS; k++) {
      const ang = aim + (rnd() - 0.5) * def.spread * 2 * Math.min(1.7, FIELD.r);
      const sp = def.speed * rand(0.85, 1.15);
      const i = S.n++;
      S.x[i] = S.px[i] = mx;
      S.y[i] = S.py[i] = my;
      S.vx[i] = Math.cos(ang) * sp;
      S.vy[i] = Math.sin(ang) * sp;
      S.dmg[i] = dmg;
      S.life[i] = def.life;
      S.size[i] = def.size * look * s.size;
      S.kb[i] = def.kb;
      S.burn[i] = burn;
      S.pierce[i] = pierce;
      S.bounce[i] = s.bounce;
      S.rage[i] = rage ? 1 : 0;
      S.hitN[i] = 0;
    }
  }
  const fx = run.fx;
  fx.flash(mx, my, 0, 66 * look, col[0], col[1], col[2], 0.09);
  fx.add(FIRE, HOT, mx + Math.cos(run.aim) * 24, my + Math.sin(run.aim) * 24, 0, Math.cos(run.aim) * 120, Math.sin(run.aim) * 120, 0, 0.3, 14 * look, 56 * look, 1, 1, 1, 1, 0, 3);
  fx.smoke(mx, my, 0, 18, 1, 0.35);
  fx.light(mx, my - 20, 50, 320, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 0.09);
  run.sound.shot(def.sound, run.pan(mx));
}

function updateShells(run, W, dt) {
  const S = W.shells;
  const E = run.enemies;
  const G = run.grid;
  const top = run.top() - 80;
  const def = WEAPONS.dragon;
  const fx = run.fx;
  const boss = run.boss && E.alive[run.boss.i] ? run.boss.i : -1;
  for (let i = 0; i < S.n; i++) {
    S.px[i] = S.x[i];
    S.py[i] = S.y[i];
    const x0 = S.x[i];
    const y0 = S.y[i];
    const x1 = x0 + S.vx[i] * dt;
    const y1 = y0 + S.vy[i] * dt;
    S.x[i] = x1;
    S.y[i] = y1;
    S.life[i] -= dt;
    // a fiery trail, thinned when there are many shells in the air
    if ((run.stepN + i) % 3 === 0 && S.n < 80) fx.add(FIRE, HOT, x1, y1, 0, rand(-25, 25), rand(-25, 25), 0, rand(0.14, 0.24), 5, 13, 1, 1, 1, 1, 0, 2);
    let dead = S.life[i] <= 0 || y1 < top || y1 > ARENA.h + 80 || x1 < -60 || x1 > ARENA.w + 60;
    if (!dead) {
      const pad = 70;
      const c0 = G.cx(Math.min(x0, x1) - pad);
      const c1 = G.cx(Math.max(x0, x1) + pad);
      const r0 = G.cy(Math.min(y0, y1) - 10);
      const r1 = G.cy(Math.max(y0, y1) + 130); // creatures are binned by their feet, below the circle a shell meets
      const sx = x1 - x0;
      const sy = y1 - y0;
      const sl2 = sx * sx + sy * sy || 1;
      outer: for (let rr = r0; rr <= r1; rr++)
        for (let c = c0; c <= c1; c++) {
          const cc = rr * G.cols + c;
          for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
            const j = G.items[m];
            if (j === boss || !E.alive[j] || E.dying[j]) continue;
            const T0 = TYPES[E.type[j]];
            const sc = E.scale[j];
            const ex = E.x[j];
            const ey = E.y[j] - T0.hitY * sc;
            const rad = T0.hr * sc + S.size[i] * 0.5;
            let t = ((ex - x0) * sx + (ey - y0) * sy) / sl2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = x0 + sx * t - ex;
            const qy = y0 + sy * t - ey;
            if (qx * qx + qy * qy > rad * rad) continue;
            if (shellSeen(S, i, E, j)) continue;
            if (shellHit(run, W, S, i, j, def)) {
              dead = true;
              break outer;
            }
          }
        }
      if (!dead && boss >= 0) {
        // the boss's circle is far above its feet, where the grid has it: tested on its own, as the run does for bullets
        const T0 = TYPES[E.type[boss]];
        const dx = x1 - E.x[boss];
        const dy = y1 - (E.y[boss] - T0.hitY);
        if (dx * dx + dy * dy < T0.hr * T0.hr && !shellSeen(S, i, E, boss) && shellHit(run, W, S, i, boss, def)) dead = true;
      }
      if (!dead) dead = shellProps(run, S, i);
    }
    if (dead) {
      S.kill(i);
      i--;
    }
  }
}

function shellSeen(S, i, E, j) {
  const key = j * 4096 + (E.gen[j] & 4095);
  const n = S.hitN[i];
  for (let k = 0; k < n && k < 4; k++) if (S.hits[i * 4 + k] === key) return true;
  return false;
}

// a shell meets a creature; true when the shell is spent
function shellHit(run, W, S, i, j, def) {
  const E = run.enemies;
  const sp = Math.hypot(S.vx[i], S.vy[i]) || 1;
  const dx = S.vx[i] / sp;
  const dy = S.vy[i] / sp;
  const x = S.x[i];
  const y = S.y[i];
  run.hurt(j, S.dmg[i], dx, dy, S.kb[i], CRIT | PROC);
  run.ignite(j, def.burn, S.burn[i]);
  run.fx.sparks(x, y, 0, 3, 2.4, 1.0, 0.3, 300, -dx, -dy, 1.8);
  // the pop: a small burst round the hit (Rage: nearly every shell, bigger)
  if (run.blastBudget > 0 && rnd() < (S.rage[i] ? 0.9 : def.popP)) {
    run.blastBudget--;
    shellPop(run, W, x, y, def.pop * (S.rage[i] ? 1.4 : 1), S.dmg[i] * 0.55, def.burn * 0.7, S.burn[i] * 0.8, j);
  }
  const key = j * 4096 + (E.gen[j] & 4095);
  if (S.pierce[i] > 0) {
    S.pierce[i]--;
    S.hits[i * 4 + (S.hitN[i] & 3)] = key;
    S.hitN[i]++;
    S.dmg[i] *= 0.85;
    return false;
  }
  if (S.bounce[i] > 0) {
    // ricochet: off to the nearest other foe
    run.chainId++;
    run.chainMark[j] = run.chainId;
    const k = run.nearest(x, y, 280, j);
    if (k >= 0) {
      S.bounce[i]--;
      S.hits[i * 4 + (S.hitN[i] & 3)] = key;
      S.hitN[i]++;
      const tx = E.x[k] - x;
      const ty = E.y[k] - TYPES[E.type[k]].hitY * E.scale[k] - y;
      const d = Math.hypot(tx, ty) || 1;
      S.vx[i] = (tx / d) * sp;
      S.vy[i] = (ty / d) * sp;
      S.life[i] = Math.max(S.life[i], 0.35);
      S.dmg[i] *= 0.8;
      return false;
    }
  }
  return true;
}

// the pop of a shell: hurts and ignites everything within r (not the creature it hit, which already burns)
function shellPop(run, W, x, y, r, dmg, burnT, burnDps, skip) {
  const E = run.enemies;
  const G = run.grid;
  const c0 = G.cx(x - r - 40);
  const c1 = G.cx(x + r + 40);
  const r0 = G.cy(y - r - 40);
  const r1 = G.cy(y + r + 100);
  for (let rr = r0; rr <= r1; rr++)
    for (let c = c0; c <= c1; c++) {
      const cc = rr * G.cols + c;
      for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
        const j = G.items[m];
        if (j === skip || !E.alive[j] || E.dying[j]) continue;
        const T0 = TYPES[E.type[j]];
        const dx = E.x[j] - x;
        const dy = E.y[j] - T0.hitY * E.scale[j] * 0.5 - y;
        const rad = r + T0.hr * E.scale[j];
        const d2 = dx * dx + dy * dy;
        if (d2 > rad * rad) continue;
        const d = Math.sqrt(d2) || 1;
        const f = 1 - (d / rad) * 0.5;
        run.ignite(j, burnT, burnDps);
        run.hurt(j, dmg * f, dx / d, dy / d, 160 * f, BLAST | QUIET);
      }
    }
  const R = run.barrels;
  for (let k = 0; k < R.n; k++) {
    const dx = R.x[k] - x;
    const dy = R.y[k] - y;
    if (dx * dx + dy * dy < r * r * 1.1 && R.fuse[k] <= 0 && R.hp[k] > 0) R.fuse[k] = rand(0.08, 0.18);
  }
  run.fx.explosion(x, y, r * 1.1, 0.45);
  if (W.popStep !== run.stepN) {
    W.popStep = run.stepN;
    run.sound.explode?.(run.pan(x), 0.3);
  }
}

// shells burst pickups and light barrels like bullets
function shellProps(run, S, i) {
  const R = run.barrels;
  for (let k = 0; k < R.n; k++) {
    const dx = S.x[i] - R.x[k];
    const dy = S.y[i] - (R.y[k] - 22);
    if (dx * dx + dy * dy < 22 * 22) {
      R.hp[k] -= S.dmg[i];
      R.flash[k] = 1;
      return true;
    }
  }
  const P = run.pickups;
  for (let k = 0; k < P.n; k++) {
    if (P.kind[k] === CRATE) continue;
    const dx = S.x[i] - P.x[k];
    const dy = S.y[i] - P.y[k];
    if (dx * dx + dy * dy < 30 * 30) {
      run.collect(k);
      return false;
    }
  }
  return false;
}

function drawShells(W, d, a) {
  const S = W.shells;
  for (let i = 0; i < S.n; i++) {
    const x = S.px[i] + (S.x[i] - S.px[i]) * a;
    const y = S.py[i] + (S.y[i] - S.py[i]) * a;
    const rot = Math.atan2(S.vy[i], S.vx[i]);
    d.hot.p(x, y, S.size[i], rot, 2.6, 1.0, 0.25, 1, BOLT, 0, 0, 1.6);
  }
}
