// Everything in flight: shells and their kin, stepped at a fixed 120 Hz with
// gravity and wind, checked against the ground and every tank and wreck.
// Each weapon kind may add its own behaviour through BEHAVIOURS:
//   launch(p, b)             set up p.data
//   step(p, h, b)            before the move; false removes the projectile
//   impact(p, tank, b)       on touching ground or a tank; it must detonate
//                            (b.detonate) or return false to keep flying
//   end(p, b)                it is gone (stop sounds)
//   trail(p, lights, fx, dt) the look of it in flight, once a frame
// A projectile with `p.custom` skips the default gravity and wind (the
// behaviour flies it); with `p.manual` the behaviour also does the moving and
// all the collisions (a rolling roller, a digging buster).
import { WORLD, clamp, rand } from '../config.js';
import { WEAPONS } from './weapons.js';
import { K } from '../fx/particles.js';
import { BEDROCK } from '../world/terrain.js';

const H = WORLD.step;
const G = WORLD.gravity;
const TAU = Math.PI * 2;
const MAX_AGE = 30; // nothing flies for longer than this: the turn can never hang
const NORM = { x: 0, y: 1 };
const COS12 = new Float32Array(12);
const SIN12 = new Float32Array(12);
for (let k = 0; k < 12; k++) {
  COS12[k] = Math.cos((k / 12) * TAU);
  SIN12[k] = Math.sin((k / 12) * TAU);
}

// ---------------------------------------------------------------- helpers

// Where, as a fraction along the segment, it first touches tank t (or -1).
// A cheap box test first; then a sample about every 0.35 m, so a fast dart
// cannot slip through the hull between two steps.
function segTank(t, x0, y0, x1, y1, pad) {
  const reach = t.len * 0.5 + 1.5;
  if ((x0 < t.x - reach && x1 < t.x - reach) || (x0 > t.x + reach && x1 > t.x + reach)) return -1;
  const lean = t.len * 0.5 * Math.abs(Math.sin(t.angle)) + 1.5;
  if ((y0 > t.y + t.hgt + lean && y1 > t.y + t.hgt + lean) || (y0 < t.y - lean && y1 < t.y - lean)) return -1;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.35));
  for (let k = 1; k <= n; k++) {
    const f = k / n;
    if (t.hit(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, pad)) return f;
  }
  return -1;
}

// The first tank (or wreck) a segment touches, or null; `at.f` gets the fraction.
const AT = { f: 0 };
function firstTank(b, p, x0, y0, x1, y1, pad) {
  let best = null;
  let bf = 2;
  for (let i = 0; i < b.tanks.length; i++) {
    const t = b.tanks[i];
    if (t === p.owner && p.age < 0.3) continue;
    const f = segTank(t, x0, y0, x1, y1, pad);
    if (f >= 0 && f < bf) {
      bf = f;
      best = t;
    }
  }
  AT.f = bf;
  return best;
}

// The living enemy tank nearest to a point.
export function nearestFoe(b, owner, x, y) {
  let best = null;
  let bd = Infinity;
  for (let i = 0; i < b.tanks.length; i++) {
    const t = b.tanks[i];
    if (!t.alive || (owner && t.team === owner.team)) continue;
    const d = Math.abs(t.x - x) + Math.abs(t.y - y) * 0.5;
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

// Clods and dust thrown out of a hole, along the surface normal.
function dirtBurst(fx, x, y, nx, ny, n, speed) {
  const P = fx.p;
  const soil = fx.soil;
  const q = fx.q.particleScale;
  const a0 = Math.atan2(ny, nx);
  for (let k = 0; k < Math.round(n * q); k++) {
    const a = a0 + rand(-0.9, 0.9);
    const sp = rand(0.4, 1) * speed;
    const i = P.spawn(K.DIRT, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.08, 0.3), rand(1.5, 3), soil[0] * rand(0.7, 1.3), soil[1] * rand(0.7, 1.2), soil[2] * rand(0.7, 1.2), 1);
    if (i < 0) continue;
    P.grav[i] = 1;
    P.drag[i] = 0.25;
    P.hit[i] = 1;
    P.spin[i] = rand(-10, 10);
  }
  for (let k = 0; k < Math.round(n * 0.4 * q); k++) {
    const a = a0 + rand(-1, 1);
    const i = fx.smoke(x, y, Math.cos(a) * speed * 0.25, Math.sin(a) * speed * 0.25 + 1, rand(0.7, 1.5), rand(1.5, 3), 0, 0.5);
    if (i < 0) continue;
    P.r[i] = soil[0] * 1.5 + 0.04;
    P.g[i] = soil[1] * 1.5 + 0.035;
    P.b[i] = soil[2] * 1.5 + 0.03;
  }
}

// A circle of radius R at p against the ground mask: pushes it out along the
// surface and returns true (normal in NORM) if it was touching.
function pushOut(T, p, R) {
  let sx = 0;
  let sy = 0;
  let c = 0;
  for (let k = 0; k < 12; k++) {
    if (T.solid(p.x + COS12[k] * R, p.y + SIN12[k] * R)) {
      sx -= COS12[k];
      sy -= SIN12[k];
      c++;
    }
  }
  if (!c) return false;
  const l = Math.hypot(sx, sy);
  if (l < 0.05) {
    NORM.x = 0;
    NORM.y = 1;
  } else {
    NORM.x = sx / l;
    NORM.y = sy / l;
  }
  for (let i = 0; i < 16; i++) {
    p.x += NORM.x * 0.05;
    p.y += NORM.y * 0.05;
    let any = false;
    for (let k = 0; k < 12; k++) {
      if (T.solid(p.x + COS12[k] * R, p.y + SIN12[k] * R)) {
        any = true;
        break;
      }
    }
    if (!any) break;
  }
  return true;
}

// Tracer sparks and a wisp of smoke, interpolated along this frame's path so a
// fast shell leaves a line and not a dotted trail.
function defaultTrail(p, lights, fx, dt) {
  lights.add(p.x, p.y, 2, 7, 1.6, 0.8, 0.3, 0.3);
  const P = fx.p;
  p.tacc += dt;
  let n = Math.floor(p.tacc / 0.016);
  if (n <= 0) return;
  p.tacc -= n * 0.016;
  if (n > 4) n = 4;
  for (let k = 1; k <= n; k++) {
    const f = k / n;
    const x = p.lx + (p.x - p.lx) * f;
    const y = p.ly + (p.y - p.ly) * f;
    const j = P.spawn(K.SPARK, x, y, p.vx * 0.15, p.vy * 0.15, 0.09, 0.18, 4, 2, 0.8, 0.7);
    if (j >= 0) P.drag[j] = 4;
    if (Math.random() < 0.5) fx.smoke(x, y, 0, 0.3, 0.18, 1.2, 0.3, 0.18);
  }
}

// ---------------------------------------------------------------- behaviours

export const BEHAVIOURS = {
  shell: {},
  bomblet: {},

  // Bursts into bomblets when it comes down near the ground or over a tank.
  cluster: {
    step(p, h, b) {
      if (p.age < 0.35 || p.vy > 0) return true;
      const ground = b.terrain.groundBelow(p.x, p.y);
      let near = false;
      for (let i = 0; i < b.tanks.length; i++) {
        const t = b.tanks[i];
        if (t.alive && t !== p.owner && (!p.owner || t.team !== p.owner.team) && Math.abs(t.x - p.x) < 14 && p.y - t.y < 22) near = true;
      }
      if (p.y - ground < 16 || near) {
        const w = p.w;
        const mid = Math.round((w.count - 1) / 2); // this bomblet marks the owner's last impact, as the airstrike's middle bomb does
        for (let i = 0; i < w.count; i++) {
          const s = (i / (w.count - 1) - 0.5) * 2;
          b.projectiles.launch(p.owner, w.bomblet, p.x, p.y, p.vx * 0.7 + s * 5.5 + (Math.random() - 0.5) * 1.5, p.vy * 0.6 + Math.random() * 3, { sub: i !== mid, quiet: true });
        }
        b.fx.explode(p.x, p.y, 0.6, 0.35, { inGround: false });
        b.sound.boom('air', p.x, 0.5);
        return false;
      }
      return true;
    },
  },

  // Canister: a small burst, then burning fuel on the ground (see hazards.js).
  napalm: {
    impact(p, hitTank, b) {
      b.detonate(p, p.x, p.y, hitTank);
      b.hazards.napalm(p.owner, p.x, p.y, p.w);
    },
    trail(p, lights, fx, dt) {
      defaultTrail(p, lights, fx, dt);
      if (Math.random() < dt * 40) fx.fire(p.x, p.y, rand(-1, 1), rand(-1, 1), rand(0.25, 0.45), rand(0.2, 0.4), 0.9);
    },
  },

  // Smoke-marker canister: pops red smoke and calls the jet (see hazards.js).
  airstrike: {
    impact(p, hitTank, b) {
      b.hazards.marker(p, hitTank);
    },
    trail(p, lights, fx, dt) {
      lights.add(p.x, p.y, 2, 10, 1.8, 0.25, 0.12, 0.3);
      const P = fx.p;
      p.tacc += dt;
      let n = Math.floor(p.tacc / 0.02);
      if (n <= 0) return;
      p.tacc -= n * 0.02;
      if (n > 4) n = 4;
      for (let k = 1; k <= n; k++) {
        const f = k / n;
        const x = p.lx + (p.x - p.lx) * f;
        const y = p.ly + (p.y - p.ly) * f;
        const j = P.spawn(K.SPARK, x, y, p.vx * 0.1, p.vy * 0.1, 0.1, 0.22, 5, 1.4, 0.8, 0.8);
        if (j >= 0) P.drag[j] = 3;
        const s = fx.smoke(x, y, 0, 0.3, 0.2, 1.8, 0, 0.5);
        if (s >= 0) {
          P.r[s] = 0.8;
          P.g[s] = 0.08;
          P.b[s] = 0.05;
        }
      }
    },
  },

  // One of the airstrike's bombs: it just falls (no wind, see windK).
  bomb: {
    trail() {},
  },

  // A dart: a thin white-hot streak and no smoke.
  sabot: {
    trail(p, lights, fx, dt) {
      lights.add(p.x, p.y, 2, 5, 1.3, 0.9, 0.5, 0.3);
      const P = fx.p;
      p.tacc += dt;
      let n = Math.floor(p.tacc / 0.012);
      if (n <= 0) return;
      p.tacc -= n * 0.012;
      if (n > 6) n = 6;
      for (let k = 1; k <= n; k++) {
        const f = k / n;
        const j = P.spawn(K.SPARK, p.lx + (p.x - p.lx) * f, p.ly + (p.y - p.ly) * f, p.vx * 0.04, p.vy * 0.04, 0.06, 0.12, 5, 3.6, 2.4, 0.7);
        if (j >= 0) P.drag[j] = 6;
      }
    },
  },

  // The Sunburst: a heavy shell with a long soft smoke trail.
  nuke: {
    trail(p, lights, fx, dt) {
      defaultTrail(p, lights, fx, dt);
      if (Math.random() < dt * 30) fx.smoke(p.x, p.y, 0, 0.3, 0.5, 2.6, 0.3, 0.3);
    },
  },

  // Coasts, lights its motor, steers onto the nearest enemy tank, and runs
  // ballistic again when the fuel is gone.
  missile: {
    launch(p, b) {
      const d = p.data;
      d.lit = false;
      d.fuel = p.w.homing.fuel;
      d.tgt = null;
      d.look = 0;
      d.rocket = null;
    },
    step(p, h, b) {
      const d = p.data;
      const hm = p.w.homing;
      if (!d.lit) {
        if (p.age < hm.delay) return true;
        d.lit = true;
        d.rocket = b.sound.rocket(p.x);
        // ignition: a flash and a gout of smoke
        b.fx.p.spawn(K.FLASH, p.x, p.y, 0, 0, 2.4, 0.12, 5, 3, 1.4, 1);
        for (let i = 0; i < 6; i++) b.fx.smoke(p.x, p.y, rand(-2, 2) - p.vx * 0.05, rand(-2, 2) - p.vy * 0.05, rand(0.4, 0.9), rand(1, 2), 0.3, 0.5);
        return true;
      }
      if (d.fuel <= 0) return true;
      d.fuel -= h;
      d.look -= h;
      if (d.look <= 0 || !d.tgt || !d.tgt.alive) {
        d.look = 0.2;
        d.tgt = nearestFoe(b, p.owner, p.x, p.y);
      }
      const t = d.tgt;
      p.custom = !!t; // with nothing to hunt it falls like a shell
      if (t) {
        let cur = Math.atan2(p.vy, p.vx);
        const dx = t.x - p.x;
        const dy = t.y + t.hgt * 0.4 - p.y;
        const dist = Math.hypot(dx, dy);
        // top attack: aim above the target while far off, so it arcs over the
        // hills and comes down on the tank
        let want = Math.atan2(dy + clamp((dist - 25) * 0.32, 0, 30), dx);
        // and climb if the ground ahead is about to meet it (not on the last dive)
        if (dist > 22) {
          const hx = Math.cos(cur);
          const hy = Math.sin(cur);
          const T = b.terrain;
          for (let k = 12; k <= 24; k += 12) {
            if (T.groundBelow(p.x + hx * k, p.y + 60) + 3 > p.y + hy * k) {
              want = cur + (hx < 0 ? -0.7 : 0.7);
              break;
            }
          }
        }
        let da = want - cur;
        da -= TAU * Math.round(da / TAU);
        cur += clamp(da, -hm.turn * h, hm.turn * h);
        let sp = Math.hypot(p.vx, p.vy);
        sp += clamp(hm.speed - sp, -25 * h, 40 * h);
        p.vx = Math.cos(cur) * sp;
        p.vy = Math.sin(cur) * sp;
        // proximity fuze: close enough to the hull is a hit
        if (t.distance(p.x, p.y) < hm.prox) {
          b.detonate(p, p.x, p.y, t);
          return false;
        }
      }
      if (d.fuel <= 0) {
        p.custom = false;
        if (d.rocket) d.rocket.stop();
        d.rocket = null;
      }
      return true;
    },
    end(p) {
      if (p.data.rocket) p.data.rocket.stop();
      p.data.rocket = null;
    },
    trail(p, lights, fx, dt) {
      const d = p.data;
      const P = fx.p;
      if (!d.lit || d.fuel <= 0) {
        defaultTrail(p, lights, fx, dt);
        return;
      }
      lights.add(p.x, p.y, 2.5, 15, 4.4, 2.1, 0.7, 0.8);
      p.tacc += dt;
      let n = Math.floor(p.tacc / 0.01);
      if (n <= 0) return;
      p.tacc -= n * 0.01;
      if (n > 6) n = 6;
      const ca = Math.cos(p.rot);
      const sa = Math.sin(p.rot);
      for (let k = 1; k <= n; k++) {
        const f = k / n;
        const x = p.lx + (p.x - p.lx) * f - ca * 1.5;
        const y = p.ly + (p.y - p.ly) * f - sa * 1.5;
        const j = fx.fire(x, y, -ca * rand(3, 8), -sa * rand(3, 8), rand(0.35, 0.65), rand(0.12, 0.25), 1);
        if (j >= 0) P.drag[j] = 6;
        if (k % 2) {
          const s = fx.smoke(x, y, rand(-0.3, 0.3), rand(-0.3, 0.3), rand(0.3, 0.55), rand(2, 3.5), 0.42, 0.55);
          if (s >= 0) P.grow[s] *= 0.6;
        }
      }
    },
  },

  // Goes into the ground and keeps going, carving a tunnel, then detonates.
  buster: {
    impact(p, hitTank, b) {
      if (hitTank) {
        b.detonate(p, p.x, p.y, hitTank);
        return true;
      }
      const dig = p.w.dig;
      const d = p.data;
      const sp = Math.hypot(p.vx, p.vy) || 1;
      d.dx = p.vx / sp;
      d.dy = p.vy / sp;
      // a hit that would run along or out of the ground is turned down into it
      if (d.dy > -0.35) {
        d.dy = -0.35;
        const l = Math.hypot(d.dx, d.dy);
        d.dx /= l;
        d.dy /= l;
      }
      d.digging = true;
      d.travel = 0;
      d.carve = 0;
      d.fuse = -1;
      d.leak = 1.6;
      d.mx = p.x;
      d.my = p.y;
      p.manual = true;
      p.custom = true;
      if (p.voice) p.voice.stop();
      p.voice = null;
      b.terrain.carve(p.x, p.y, dig.tunnel * 1.3);
      const n = b.terrain.normal(p.x, p.y, NORM);
      dirtBurst(b.fx, p.x, p.y, n.x, n.y, 26, 16);
      b.fx.shake(0.18);
      b.sound.hit('dirt', p.x, 0.8);
      return false;
    },
    step(p, h, b) {
      const d = p.data;
      if (!d.digging) return true;
      const dig = p.w.dig;
      if (d.fuse >= 0) {
        d.fuse -= h;
        if (d.fuse < 0) {
          b.detonate(p, p.x, p.y, null);
          return false;
        }
        return true;
      }
      const dist = dig.speed * h;
      const nx = p.x + d.dx * dist;
      const ny = p.y + d.dy * dist;
      // a tank in the way takes it
      const hit = firstTank(b, p, p.x, p.y, nx, ny, 0.1);
      if (hit) {
        b.detonate(p, nx, ny, hit);
        return false;
      }
      p.x = nx;
      p.y = ny;
      p.rot = Math.atan2(d.dy, d.dx);
      d.travel += dist;
      d.carve += dist;
      if (d.carve >= 0.45) {
        d.carve -= 0.45;
        b.terrain.carve(p.x, p.y, dig.tunnel);
      }
      const ahead = b.terrain.solid(p.x + d.dx * 1.8, p.y + d.dy * 1.8);
      if (d.travel >= dig.depth || p.y < BEDROCK + 1.5 || p.x < 3 || p.x > WORLD.width - 3 || (!ahead && d.travel > 2.5)) {
        d.fuse = ahead ? dig.fuse : 0.05;
        if (ahead) b.sound.hit('thud', p.x, 0.5);
      }
      return true;
    },
    trail(p, lights, fx, dt) {
      const d = p.data;
      if (!d.digging) {
        defaultTrail(p, lights, fx, dt);
        return;
      }
      // dust still seeping out of the hole, a hot glow at the nose
      lights.add(p.x, p.y, 1.5, 6, 1.2, 0.55, 0.2, 0.3);
      if (d.leak > 0) {
        d.leak -= dt;
        if (Math.random() < dt * 22) {
          const j = fx.smoke(d.mx + rand(-0.5, 0.5), d.my + 0.3, rand(-1, 1), rand(1, 3), rand(0.5, 1), rand(1.2, 2.4), 0, 0.4);
          if (j >= 0) {
            fx.p.r[j] = fx.soil[0] * 1.5 + 0.04;
            fx.p.g[j] = fx.soil[1] * 1.5 + 0.035;
            fx.p.b[j] = fx.soil[2] * 1.5 + 0.03;
          }
        }
      }
    },
  },

  // Rolls along the surface (downhill, round hills, off walls) and goes off
  // when it touches a tank, stops, or has rolled long enough.
  roller: {
    impact(p, hitTank, b) {
      if (hitTank) {
        b.detonate(p, p.x, p.y, hitTank);
        return true;
      }
      const cfg = p.w.roll;
      const d = p.data;
      const n = b.terrain.normal(p.x, p.y, NORM);
      // keep a share of the landing speed along the ground
      const vn = p.vx * n.x + p.vy * n.y;
      p.vx = (p.vx - vn * n.x) * cfg.keep;
      p.vy = (p.vy - vn * n.y) * cfg.keep;
      p.x += n.x * 0.5;
      p.y += n.y * 0.5;
      d.roll = true;
      d.t = 0;
      d.grace = 0.1;
      d.chk = 0.5;
      d.ax = p.x;
      d.ay = p.y;
      d.dust = 0;
      p.manual = true;
      p.custom = true;
      if (p.voice) p.voice.stop();
      p.voice = null;
      dirtBurst(b.fx, p.x, p.y, n.x, n.y, 12, 8);
      b.sound.hit('thud', p.x, 0.6);
      return false;
    },
    step(p, h, b) {
      const d = p.data;
      if (!d.roll) return true;
      const cfg = p.w.roll;
      const T = b.terrain;
      const R = 0.5;
      d.t += h;
      p.vy -= G * h;
      p.x += p.vx * h;
      p.y += p.vy * h;
      d.grace -= h;
      if (pushOut(T, p, R)) {
        d.grace = 0.1; // it hovers a hair above the ground between touches
        const vn = p.vx * NORM.x + p.vy * NORM.y;
        if (vn < 0) {
          const e = vn < -5 ? 0.3 : 0;
          p.vx -= (1 + e) * vn * NORM.x;
          p.vy -= (1 + e) * vn * NORM.y;
          if (vn < -5) {
            b.sound.hit('thud', p.x, Math.min(0.8, -vn / 20));
            dirtBurst(b.fx, p.x, p.y - R * 0.6, NORM.x, NORM.y, 6, 6);
          }
        }
        d.spin = (p.vx * -NORM.y + p.vy * NORM.x) / R;
      }
      // rolling resistance while it is on the ground
      if (d.grace > 0) {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 0) {
          const k = Math.max(0, sp - (cfg.friction + sp * cfg.drag) * h) / sp;
          p.vx *= k;
          p.vy *= k;
        }
      }
      p.rot += (d.spin || 0) * h;
      d.touch = d.grace > 0;
      // the edges of the world are walls
      if (p.x < 3) {
        p.x = 3;
        p.vx = Math.abs(p.vx) * 0.3;
      } else if (p.x > WORLD.width - 3) {
        p.x = WORLD.width - 3;
        p.vx = -Math.abs(p.vx) * 0.3;
      }
      // touching a tank, a wreck included
      for (let i = 0; i < b.tanks.length; i++) {
        const t = b.tanks[i];
        if (t === p.owner && d.t < 0.6) continue;
        if (Math.abs(t.x - p.x) > t.len * 0.5 + 2) continue;
        if (t.distance(p.x, p.y) < R + 0.25) {
          b.detonate(p, p.x, p.y, t);
          return false;
        }
      }
      // stopped for good (hardly moved in the last half second, which also
      // catches a ball rocking in a pit), or out of time
      d.chk -= h;
      let stopped = false;
      if (d.chk <= 0) {
        d.chk = 0.5;
        stopped = Math.hypot(p.x - d.ax, p.y - d.ay) < 0.35;
        d.ax = p.x;
        d.ay = p.y;
      }
      if (stopped || d.t > cfg.life || p.y < 1) {
        b.detonate(p, p.x, p.y, null);
        return false;
      }
      return true;
    },
    trail(p, lights, fx, dt) {
      const d = p.data;
      if (!d.roll) {
        defaultTrail(p, lights, fx, dt);
        return;
      }
      // dust kicked up behind it, a fuse spark on top
      const sp = Math.hypot(p.vx, p.vy);
      lights.add(p.x, p.y + 0.6, 2, 4, 1.4, 0.45, 0.15, 0.3);
      d.dust -= dt;
      if (d.touch && sp > 2.5 && d.dust <= 0) {
        d.dust = 0.03;
        const j = fx.smoke(p.x - Math.sign(p.vx) * 0.4, p.y - 0.3, rand(-1, 1) - p.vx * 0.1, rand(0.3, 1.4), rand(0.3, 0.7), rand(0.8, 1.6), 0, 0.4);
        if (j >= 0) {
          fx.p.r[j] = fx.soil[0] * 1.6 + 0.04;
          fx.p.g[j] = fx.soil[1] * 1.6 + 0.035;
          fx.p.b[j] = fx.soil[2] * 1.6 + 0.03;
        }
      }
      if (Math.random() < dt * 40) fx.p.spawn(K.SPARK, p.x, p.y + 0.55, rand(-2, 2), rand(2, 6), 0.05, 0.25, 5, 2.4, 0.8, 1);
    },
  },
};

// ---------------------------------------------------------------- the list

export class Projectiles {
  constructor(battle) {
    this.b = battle;
    this.list = [];
    this.acc = 0;
  }

  get active() {
    return this.list.length > 0;
  }

  // w is a weapon id or a weapon-like definition (bomblets, bombs).
  // extra: { sub: true } children do not mark your last impact; { quiet: true } no whistle.
  launch(owner, w, x, y, vx, vy, extra = {}) {
    const def = typeof w === 'string' ? WEAPONS[w] : w;
    const kind = def.kind || 'bomblet';
    const p = {
      w: def,
      kind,
      owner,
      x,
      y,
      vx,
      vy,
      lx: x,
      ly: y,
      age: 0,
      alive: true,
      rot: Math.atan2(vy, vx),
      sub: !!extra.sub,
      quiet: !!extra.quiet,
      custom: false,
      manual: false,
      voice: null,
      tacc: 0,
      data: {},
    };
    const B = BEHAVIOURS[kind];
    if (B && B.launch) B.launch(p, this.b);
    this.list.push(p);
    return p;
  }

  update(dt) {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= H && steps < 12) {
      this.acc -= H;
      steps++;
      this.step(H);
    }
    if (steps === 12) this.acc = 0;
    // whistles and motors once per frame
    const b = this.b;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      if (p.vy < -4 && !p.voice && !p.sub && !p.quiet && !p.custom && !p.manual && p.age > 0.5) p.voice = b.sound.whistle(p.x);
      if (p.voice) {
        if (p.custom || p.manual) {
          p.voice.stop();
          p.voice = null;
        } else p.voice.update(p.x, p.y - b.terrain.groundBelow(p.x, p.y), Math.hypot(p.vx, p.vy));
      }
      const rk = p.data.rocket;
      if (rk) rk.update(p.x, p.y);
    }
  }

  step(h) {
    const b = this.b;
    const T = b.terrain;
    const g = WORLD.gravity;
    const wind = b.windAcc();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!p.alive) {
        this.remove(i);
        continue;
      }
      p.age += h;
      if (p.age > MAX_AGE) {
        p.alive = false;
        this.remove(i);
        continue;
      }
      const B = BEHAVIOURS[p.kind];
      if (B && B.step && B.step(p, h, b) === false) {
        p.alive = false;
        this.remove(i);
        continue;
      }
      if (p.manual) {
        if (p.x < -80 || p.x > WORLD.width + 80 || p.y < -20) {
          p.alive = false;
          this.remove(i);
        }
        continue;
      }
      if (!p.custom) {
        p.vy -= g * (p.w.gravK ?? 1) * h;
        p.vx += wind * (p.w.windK ?? 1) * h;
      }
      const nx = p.x + p.vx * h;
      const ny = p.y + p.vy * h;
      // the first thing along this step: a tank or wreck (a direct hit) or the ground
      let hitTank = firstTank(b, p, p.x, p.y, nx, ny, 0.1);
      let f = hitTank ? AT.f : -1;
      const gf = T.hitSegment(p.x, p.y, nx, ny);
      if (gf >= 0 && (f < 0 || gf < f)) {
        f = gf;
        hitTank = null;
      }
      if (f >= 0) {
        const hx = p.x + (nx - p.x) * f;
        const hy = p.y + (ny - p.y) * f;
        p.x = hx;
        p.y = hy;
        if (B && B.impact) {
          if (B.impact(p, hitTank, b) === false) continue; // it keeps going (rolling, digging)
        } else b.detonate(p, hx, hy, hitTank);
        p.alive = false;
        this.remove(i);
        continue;
      }
      p.x = nx;
      p.y = ny;
      p.rot = Math.atan2(p.vy, p.vx);
      if (p.x < -80 || p.x > WORLD.width + 80 || p.y < -20) {
        p.alive = false;
        this.remove(i);
      }
    }
  }

  remove(i) {
    const p = this.list[i];
    if (p.voice) p.voice.stop();
    p.voice = null;
    const B = BEHAVIOURS[p.kind];
    if (B && B.end) B.end(p, this.b);
    this.list.splice(i, 1);
  }

  clear() {
    for (let i = this.list.length - 1; i >= 0; i--) this.remove(i);
    if (this.b.hazards) this.b.hazards.clear();
  }

  draw(atlas, sprites, lights, fx, dt) {
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      atlas.put(sprites, p.w.sprite || 'shell', p.x, p.y, p.rot, 1, 1, 1, 1, 1, 0, 1);
      if (!p.data.hidden) {
        const B = BEHAVIOURS[p.kind];
        if (B && B.trail) B.trail(p, lights, fx, dt);
        else defaultTrail(p, lights, fx, dt);
      }
      p.lx = p.x;
      p.ly = p.y;
    }
    // fires, markers, the jet and shield domes ride along with the shots
    this.b.hazards.draw(atlas, sprites, lights, fx, dt);
  }
}

// Where a shot would land if it flew like a shell (no effects, no sound), for
// the computer's aim: gravity, wind and the weapon's own gravK and windK, the
// same 1/120 s step as the real thing. Homing, rolling and digging are not
// modelled: this is the ballistic arc up to the first ground or tank touched.
// out: { x, y, tank, t, apex }
export function trajectory(b, owner, x, y, vx, vy, w, out) {
  const T = b.terrain;
  const g = WORLD.gravity * (w.gravK ?? 1);
  const wind = b.windAcc() * (w.windK ?? 1);
  const h = H;
  const tanks = b.tanks;
  let maxY = y;
  for (let t = 0; t < 16; t += h) {
    vy -= g * h;
    vx += wind * h;
    const nx = x + vx * h;
    const ny = y + vy * h;
    for (let i = 0; i < tanks.length; i++) {
      const tk = tanks[i];
      if (tk === owner && t < 0.3) continue;
      // a cheap box test before the exact one
      if (Math.abs(nx - tk.x) > tk.len * 0.5 + 1.5 || ny > tk.y + tk.hgt + 3 || ny < tk.y - 3 - tk.len * 0.5) continue;
      if (tk.hit(nx, ny, 0.1)) {
        out.x = nx;
        out.y = ny;
        out.tank = tk;
        out.t = t;
        out.apex = maxY;
        return out;
      }
    }
    const f = T.hitSegment(x, y, nx, ny);
    if (f >= 0) {
      out.x = x + (nx - x) * f;
      out.y = y + (ny - y) * f;
      out.tank = null;
      out.t = t;
      out.apex = maxY;
      return out;
    }
    x = nx;
    y = ny;
    if (y > maxY) maxY = y;
    if (x < -80 || x > WORLD.width + 80 || y < -20) break;
  }
  out.x = x;
  out.y = y;
  out.tank = null;
  out.t = 16;
  out.apex = maxY;
  return out;
}
