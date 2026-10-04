// Everything in flight: shells and their kin, stepped at a fixed 120 Hz with
// gravity and wind, checked against the ground and every tank and wreck.
// Each weapon kind may add its own behaviour (splitting, homing, digging,
// rolling) through BEHAVIOURS.
import { WORLD } from '../config.js';
import { WEAPONS } from './weapons.js';
import { K } from '../fx/particles.js';

const H = WORLD.step;

export const BEHAVIOURS = {
  shell: {},
  bomblet: {},
  // Bursts into bomblets when it comes down near the ground.
  cluster: {
    step(p, h, b) {
      if (p.age < 0.35 || p.vy > 0) return true;
      const ground = b.terrain.groundBelow(p.x, p.y);
      const nearTank = b.tanks.some((t) => t.alive && t !== p.owner && Math.abs(t.x - p.x) < 14 && p.y - t.y < 22);
      if (p.y - ground < 16 || nearTank) {
        const w = p.w;
        for (let i = 0; i < w.count; i++) {
          const s = (i / (w.count - 1) - 0.5) * 2;
          b.projectiles.launch(p.owner, w.bomblet, p.x, p.y, p.vx * 0.7 + s * 5.5 + (Math.random() - 0.5) * 1.5, p.vy * 0.6 + Math.random() * 3, { sub: true });
        }
        b.fx.explode(p.x, p.y, 0.6, 0.35, { inGround: false });
        b.sound.boom('air', p.x, 0.5);
        return false;
      }
      return true;
    },
  },
};

export class Projectiles {
  constructor(battle) {
    this.b = battle;
    this.list = [];
    this.acc = 0;
  }

  get active() {
    return this.list.length > 0;
  }

  // w is a weapon id or a weapon-like definition (bomblets).
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
      age: 0,
      alive: true,
      rot: Math.atan2(vy, vx),
      sub: !!extra.sub,
      voice: null,
      trail: 0,
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
    // whistles and trails once per frame
    const b = this.b;
    for (const p of this.list) {
      if (p.vy < -4 && !p.voice && !p.sub && p.age > 0.5) p.voice = b.sound.whistle(p.x);
      if (p.voice) p.voice.update(p.x, p.y - b.terrain.groundBelow(p.x, p.y), Math.hypot(p.vx, p.vy));
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
      const B = BEHAVIOURS[p.kind];
      if (B && B.step && B.step(p, h, b) === false) {
        p.alive = false;
        this.remove(i);
        continue;
      }
      if (!p.custom) {
        p.vy -= g * (p.w.gravK ?? 1) * h;
        p.vx += wind * (p.w.windK ?? 1) * h;
      }
      const nx = p.x + p.vx * h;
      const ny = p.y + p.vy * h;
      // tanks and wrecks first (a direct hit)
      let hitTank = null;
      for (const t of b.tanks) {
        if (t === p.owner && p.age < 0.3) continue;
        if (t.hit(nx, ny, 0.1)) {
          hitTank = t;
          break;
        }
      }
      let hx = nx;
      let hy = ny;
      let hit = !!hitTank;
      if (!hit) {
        const f = T.hitSegment(p.x, p.y, nx, ny);
        if (f >= 0) {
          hit = true;
          hx = p.x + (nx - p.x) * f;
          hy = p.y + (ny - p.y) * f;
        }
      }
      if (hit) {
        p.x = hx;
        p.y = hy;
        if (B && B.impact) {
          if (B.impact(p, hitTank, b) === false) {
            // the behaviour keeps it going (rolling, digging)
            continue;
          }
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
    this.list.splice(i, 1);
  }

  clear() {
    for (let i = this.list.length - 1; i >= 0; i--) this.remove(i);
  }

  draw(atlas, sprites, lights, fx, dt) {
    const P = fx.p;
    for (const p of this.list) {
      atlas.put(sprites, p.w.sprite || 'shell', p.x, p.y, p.rot, 1, 1, 1, 1, 1, 0, 1);
      if (p.custom && p.data.hidden) continue;
      // a faint glowing tracer and a wisp of smoke behind it
      lights.add(p.x, p.y, 2, 7, 1.6, 0.8, 0.3, 0.3);
      p.trail -= dt;
      if (p.trail <= 0) {
        p.trail = 0.016;
        const j = P.spawn(K.SPARK, p.x, p.y, p.vx * 0.15, p.vy * 0.15, 0.09, 0.18, 4, 2, 0.8, 0.7);
        if (j >= 0) P.drag[j] = 4;
        if (Math.random() < 0.5) fx.smoke(p.x, p.y, 0, 0.3, 0.18, 1.2, 0.3, 0.18);
      }
    }
  }
}

// Where a shot would land, for the computer's aim (no effects, no sound).
export function trajectory(b, owner, x, y, vx, vy, w, out) {
  const T = b.terrain;
  const g = WORLD.gravity * (w.gravK ?? 1);
  const wind = b.windAcc() * (w.windK ?? 1);
  const h = 1 / 60;
  let maxY = y;
  for (let t = 0; t < 14; t += h) {
    vy -= g * h;
    vx += wind * h;
    const nx = x + vx * h;
    const ny = y + vy * h;
    for (const tk of b.tanks) {
      if (tk === owner && t < 0.3) continue;
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
    if (x < -80 || x > WORLD.width + 80) break;
  }
  out.x = x;
  out.y = y;
  out.tank = null;
  out.t = 14;
  out.apex = maxY;
  return out;
}
