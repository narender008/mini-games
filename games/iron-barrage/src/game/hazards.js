// Things that outlive the shot that made them, or arrive after it:
//  - napalm fires: fuel that splashes, runs a little way downhill along the
//    ground and burns for three rounds; a tank touching it takes damage at the
//    start of each of its turns;
//  - the smoke marker and the airstrike it calls (a jet that crosses at 110 m
//    and walks five bombs along the line, which are ordinary projectiles);
//  - the shield dome, the parachute's sound, and the turn-start bookkeeping
//    (burn damage, shield running out).
// The simulation steps in update(dt); everything you see and hear is made in
// draw(), which Projectiles.draw calls once a frame with the scene lights.
// Nothing here blocks the turn except an airstrike on its way (busy()).
import { WORLD, clamp, rand } from '../config.js';
import { K } from '../fx/particles.js';

const TAU = Math.PI * 2;
const G = WORLD.gravity;

// napalm
const CELLS = 15; // blobs of burning fuel along the ground
const CELL_W = 1.1; // half width of one blob
const FLOW_TIME = 2.2; // seconds the fuel keeps running
const FADE_TIME = 4.5; // seconds a burnt-out fire takes to die down

// airstrike
const JET_SPEED = 95; // m/s
const JET_ALT = 110; // m above the marker's ground
const JET_LEAD = 1.2; // s from the marker landing to the jet over the line
const BOMB_VX = 18; // sideways speed the bombs leave with (m/s)
const MARKER_LIFE = 11; // s the red smoke keeps coming

export class Hazards {
  constructor(battle) {
    this.b = battle;
    this.fires = [];
    this.markers = [];
    this.strikes = [];
    this.t = 0;
  }

  clear() {
    for (const f of this.fires) if (f.voice) f.voice.stop();
    for (const s of this.strikes) if (s.voice) s.voice.stop();
    this.fires.length = 0;
    this.markers.length = 0;
    this.strikes.length = 0;
  }

  // The next turn must wait while an airstrike is still on its way.
  busy() {
    return this.strikes.length > 0;
  }

  // ---------------------------------------------------------------- napalm
  // Called after the canister's own small blast: the fuel runs from (x, y).
  napalm(owner, x, y, w) {
    const b = this.b;
    x = clamp(x, 2, WORLD.width - 2); // a canister that landed off the world burns at its edge, not between two clamps
    const T = b.terrain;
    const cfg = w.burn;
    const gy = T.groundBelow(x, y + 3);
    const slot = owner ? Math.max(0, b.tanks.indexOf(owner)) : 0;
    const f = {
      owner,
      x,
      y: gy,
      cfg,
      cx: new Float32Array(CELLS),
      cy: new Float32Array(CELLS),
      cv: new Float32Array(CELLS),
      cf: new Float32Array(CELLS),
      ca: new Float32Array(CELLS),
      x0: x,
      x1: x,
      age: 0,
      flow: FLOW_TIME,
      refresh: 0.3,
      dying: 0,
      endKey: (b.round + cfg.rounds) * 100 + slot,
      glowT: 0,
      voice: null,
      soot: false,
    };
    // fuel lands in a heap at the burst and is thrown outwards, harder in the middle of the pack
    for (let i = 0; i < CELLS; i++) {
      const s = i / (CELLS - 1) - 0.5;
      f.cx[i] = x + s * 1.6 + rand(-0.4, 0.4);
      f.cy[i] = T.groundBelow(f.cx[i], gy + 3);
      f.cv[i] = s * rand(14, 24) + rand(-1.2, 1.2);
      f.cf[i] = 1 - Math.abs(s) * 0.5;
    }
    this.fires.push(f);
    this.extent(f);
    f.voice = b.sound.burn(x, 0.6);
    this.splash(x, gy + 0.6);
  }

  // Burning fuel flung through the air from the burst.
  splash(x, y) {
    const fx = this.b.fx;
    const P = fx.p;
    const q = fx.q.particleScale;
    const n = Math.round(36 * q);
    for (let i = 0; i < n; i++) {
      const a = rand(0.15, Math.PI - 0.15);
      const sp = rand(5, 17);
      const j = P.spawn(K.FIRE, x + rand(-0.6, 0.6), y, Math.cos(a) * sp * 1.15, Math.sin(a) * sp, rand(0.35, 0.8), rand(0.7, 1.4), 1, 1, 1, 1);
      if (j < 0) continue;
      P.grow[j] = rand(0.2, 0.7);
      P.drag[j] = 0.7;
      P.grav[j] = 0.75;
      P.hit[j] = 1;
    }
    for (let i = 0; i < Math.round(22 * q); i++) {
      const a = rand(0.1, Math.PI - 0.1);
      const sp = rand(6, 22);
      const j = P.spawn(K.EMBER, x, y + 0.3, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.05, 0.1), rand(0.8, 1.8), 5, 1.9, 0.45, 1);
      if (j < 0) continue;
      P.grav[j] = 0.7;
      P.drag[j] = 0.6;
    }
    fx.glow(x, y + 2, 4, 26, 4, 1.9, 0.5, 0.6, 0.3);
  }

  extent(f) {
    let a = Infinity;
    let c = -Infinity;
    for (let i = 0; i < CELLS; i++) {
      if (f.cx[i] < a) a = f.cx[i];
      if (f.cx[i] > c) c = f.cx[i];
    }
    f.x0 = a - CELL_W;
    f.x1 = c + CELL_W;
  }

  // Does the fire touch this tank (a blob under its hull)?
  touches(f, t) {
    const half = t.len * 0.5 + CELL_W * 0.6;
    if (t.x < f.x0 - half || t.x > f.x1 + half) return false;
    const lean = t.len * 0.5 * Math.abs(Math.sin(t.angle)) + 2.2;
    for (let i = 0; i < CELLS; i++) {
      if (f.cf[i] < 0.2) continue;
      if (Math.abs(f.cx[i] - t.x) < half && Math.abs(f.cy[i] - t.y) < lean) return true;
    }
    return false;
  }

  updateFire(f, dt) {
    const T = this.b.terrain;
    f.age += dt;
    if (f.dying > 0) {
      f.dying += dt;
    }
    if (f.flow > 0) {
      f.flow -= dt;
      const run = f.cfg.run;
      const fric = Math.exp(-1.5 * dt);
      for (let i = 0; i < CELLS; i++) {
        let x = f.cx[i];
        const y = f.cy[i];
        // downhill: slope of the ground either side
        const sl = (T.groundBelow(x + 0.4, y + 3) - T.groundBelow(x - 0.4, y + 3)) / 0.8;
        const s = sl / Math.sqrt(1 + sl * sl);
        let v = f.cv[i] - s * G * 0.55 * dt;
        v = clamp(v * fric, -14, 14);
        x = clamp(x + v * dt, Math.max(2, f.x - run), Math.min(WORLD.width - 2, f.x + run));
        if (x === f.x - run || x === f.x + run) v = 0;
        f.cv[i] = v;
        f.cx[i] = x;
        f.cy[i] = T.groundBelow(x, y + 3);
        // thin fuel at the edges burns lower
        f.cf[i] = clamp(1 - Math.abs(x - f.x) / (run * 1.5), 0.35, 1);
      }
      if (f.flow <= 0) {
        for (let i = 0; i < CELLS; i++) f.cv[i] = 0;
        this.soot(f, 1);
      }
      this.extent(f);
    } else if ((f.refresh -= dt) <= 0) {
      // the ground may have been blasted away from under it
      f.refresh = 0.3;
      for (let i = 0; i < CELLS; i++) f.cy[i] = T.groundBelow(f.cx[i], f.cy[i] + 2.5);
    }
  }

  // Scorch under the fire (stamped again as it burns, and when it goes out).
  soot(f, k) {
    const fx = this.b.fx;
    for (let i = 0; i < CELLS; i += 2) {
      fx.decal(0, f.cx[i], f.cy[i], 2.1 + k, 0.8 * k, 0, 0, 0, rand(0, TAU), 1.5);
    }
  }

  // ---------------------------------------------------------------- airstrike
  // The marker has landed at p: red smoke, and a jet on its way.
  marker(p, hitTank) {
    const b = this.b;
    const T = b.terrain;
    const w = p.w;
    const owner = p.owner;
    const x = p.x;
    const y = p.y;
    if (owner) owner.lastImpact = { x, y };
    const gy = Math.max(T.groundBelow(x, y + 2), 0);
    this.markers.push({ x, y: hitTank ? gy + 1 : y, t: 0, acc: 0 });
    // the pop
    const fx = b.fx;
    const P = fx.p;
    P.spawn(K.FLASH, x, y, 0, 0, 3, 0.16, 4, 0.8, 0.5, 1);
    fx.glow(x, y + 1, 3, 16, 3, 0.4, 0.25, 0.6, 0.2);
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI);
      const sp = rand(3, 11);
      const j = fx.smoke(x, y + 0.4, Math.cos(a) * sp, Math.sin(a) * sp * 0.8 + 1, rand(0.7, 1.4), rand(3, 6), 0, 0.85);
      if (j >= 0) {
        P.r[j] = 0.8;
        P.g[j] = 0.07;
        P.b[j] = 0.05;
        P.drag[j] = 1.4;
      }
    }
    b.sound.boom('small', x, 0.3);
    // the camera looks at the line, wide enough to see the jet come in
    b.lastBlast = { x, y: gy + 38, t: b.time, power: 7.5 };
    // the strike
    const n = w.count;
    const dir = owner ? (x >= owner.x ? 1 : -1) : 1;
    const alt = gy + JET_ALT;
    const mid = (n - 1) / 2;
    const bombs = [];
    for (let i = 0; i < n; i++) {
      const tx = x + (i - mid) * w.spacing * dir;
      const top = T.groundBelow(tx, alt);
      const fall = Math.sqrt((2 * Math.max(1, alt - top)) / G);
      bombs.push({ rx: tx - dir * BOMB_VX * fall, done: false, mid: i === Math.round(mid) });
    }
    const centre = bombs[Math.round(mid)].rx;
    this.strikes.push({
      owner,
      w,
      dir,
      bombs,
      t: 0,
      x: centre - dir * JET_SPEED * JET_LEAD,
      y: alt,
      x0: centre - dir * JET_SPEED * JET_LEAD,
      exit: bombs[n - 1].rx + dir * 150,
      jet: true,
      voice: b.sound.jet(centre - dir * JET_SPEED * JET_LEAD),
    });
  }

  updateStrike(s, dt) {
    const b = this.b;
    s.t += dt;
    if (s.jet) {
      s.x = s.x0 + s.dir * JET_SPEED * s.t;
      let left = false;
      for (const bm of s.bombs) {
        if (bm.done) continue;
        if (s.dir * (s.x - bm.rx) >= 0) {
          bm.done = true;
          b.projectiles.launch(s.owner, s.w.bomb, s.x, s.y - 1.4, s.dir * BOMB_VX, -2, { sub: !bm.mid, quiet: !bm.mid });
        } else left = true;
      }
      if (s.dir * (s.x - s.exit) > 0 && !left) {
        s.jet = false;
        if (s.voice) s.voice.stop();
        s.voice = null;
      }
    }
    // done once the jet is gone (the bombs are projectiles and keep the turn waiting themselves)
    if (!s.jet || s.t > 14) {
      if (s.voice) s.voice.stop();
      s.voice = null;
      s.jet = false;
      s.over = true;
    }
  }

  // ---------------------------------------------------------------- per tank
  // A tank's turn begins: burning ground hurts it, a shield may run out.
  turnStart(t) {
    const b = this.b;
    const key = b.round * 100 + b.turn;
    let burn = 0;
    let pierce = 0;
    let by = null;
    const fx = b.fx;
    for (const f of this.fires) {
      if (f.dying > 0) continue;
      if (key >= f.endKey) {
        f.dying = 0.001;
        this.soot(f, 1.6);
        continue;
      }
      if (t.alive && this.touches(f, t)) {
        burn += f.cfg.dmg;
        pierce = f.cfg.pierce;
        by = f.owner;
      }
    }
    if (burn > 0) {
      for (let i = 0; i < 9; i++) fx.fire(t.x + rand(-t.len * 0.4, t.len * 0.4), t.y + rand(0.3, t.hgt), rand(-1, 1), rand(2, 5), rand(0.5, 1), rand(0.4, 0.8), 0.95);
      b.harm(t, burn, by, 1, pierce);
    }
    if (t.shield > 0 && t.shieldRounds !== undefined) {
      t.shieldRounds--;
      if (t.shieldRounds <= 0) {
        t.shield = 0;
        t.shieldRounds = undefined;
        this.shieldPulse(t, 0.6);
      }
    }
  }

  // The dome flares (k 0..1): when it goes up, soaks a hit or runs out.
  shieldPulse(t, k) {
    t.shieldGlow = Math.max(t.shieldGlow || 0, k);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      this.updateFire(f, dt);
      if (f.dying > FADE_TIME) {
        if (f.voice) f.voice.stop();
        this.fires.splice(i, 1);
      }
    }
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.t += dt;
      if (m.t > MARKER_LIFE) this.markers.splice(i, 1);
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      this.updateStrike(s, dt);
      if (s.over) this.strikes.splice(i, 1);
    }
    // a tank's parachute makes its sound as it opens
    for (const t of this.b.tanks) {
      if (t.chute && t.chuteOpen > 0.05) {
        if (!t.chuteSnd) {
          t.chuteSnd = true;
          this.b.sound.hit('chute', t.x, 0.9);
        }
      } else t.chuteSnd = false;
    }
  }

  // ---------------------------------------------------------------- visuals
  draw(atlas, sprites, lights, fx, dt) {
    const b = this.b;
    const P = fx.p;
    const q = fx.q.particleScale;
    const time = fx.time;
    // burning fuel
    for (const f of this.fires) {
      const fade = f.dying > 0 ? Math.pow(clamp(1 - f.dying / FADE_TIME, 0, 1), 1.5) : 1;
      let cxm = 0;
      for (let i = 0; i < CELLS; i++) {
        const fu = f.cf[i] * fade;
        cxm += f.cx[i];
        if (fu < 0.03) continue;
        const x = f.cx[i];
        const y = f.cy[i];
        f.ca[i] += dt * 11 * fu * q;
        while (f.ca[i] >= 1) {
          f.ca[i] -= 1;
          const r = Math.random();
          if (r < 0.74) {
            // dense flame tongues, leaning with the wind
            fx.fire(x + rand(-CELL_W, CELL_W), y + 0.1, rand(-0.8, 0.8) + b.windAcc() * 0.2, rand(2.5, 6.5) * (0.6 + 0.4 * fu), rand(0.8, 1.6) * (0.5 + 0.5 * fu), rand(0.45, 0.9), 0.95);
          } else if (r < 0.88) {
            // black oily smoke
            fx.smoke(x + rand(-1, 1), y + 1, rand(-0.8, 0.8), rand(3.5, 7), rand(1.1, 2.2) * (0.6 + 0.4 * fu), rand(6, 10), rand(0.012, 0.03), 0.92 * Math.min(1, fade * 2));
          } else if (r < 0.97) {
            const j = P.spawn(K.EMBER, x + rand(-CELL_W, CELL_W), y + rand(0, 1), rand(-2, 2), rand(3, 10), rand(0.04, 0.09), rand(1.2, 3), 5, 1.8, 0.4, 1);
            if (j >= 0) {
              P.grav[j] = 0.08;
              P.drag[j] = 0.9;
              P.wind[j] = 0.9;
            }
          } else P.spawn(K.HEAT, x, y + 2, 0, 2.5, 3.6, 1.6, 0, 0, 0, 0.6);
        }
        // every third blob lights the ground round it
        if (i % 3 === 1) {
          const fl = 0.75 + 0.25 * Math.sin(time * 17 + x * 0.9) * Math.sin(time * 7.3 + i);
          lights.add(x, y + 1.6, 2.6, 12 + 5 * fu, 3 * fu * fl, 1.25 * fu * fl, 0.3 * fu * fl, 0.4);
        }
      }
      // the ground glows under it
      f.glowT -= dt;
      if (f.glowT <= 0 && fade > 0.1) {
        f.glowT = 0.5;
        for (let i = 0; i < CELLS; i += 2) fx.decal(0, f.cx[i], f.cy[i], 1.7, 0, 0, 0, 0.5 * f.cf[i] * fade, rand(0, TAU), 1.4);
      }
      if (f.voice) f.voice.update(cxm / CELLS, clamp((0.4 + (f.x1 - f.x0) / 22) * fade, 0, 1.2));
    }
    // red marker smoke
    for (const m of this.markers) {
      const k = 1 - m.t / MARKER_LIFE;
      m.acc += dt * 24 * Math.min(1, k * 3) * q;
      while (m.acc >= 1) {
        m.acc -= 1;
        const j = fx.smoke(m.x + rand(-0.3, 0.3), m.y + 0.3, rand(-0.5, 0.5), rand(3, 5.5), rand(0.5, 0.9), rand(5, 8), 0, 0.6);
        if (j >= 0) {
          P.r[j] = 0.78;
          P.g[j] = 0.07;
          P.b[j] = 0.05;
          P.grow[j] *= 0.7;
        }
      }
      const fl = 0.8 + 0.2 * Math.sin(time * 21 + m.x);
      lights.add(m.x, m.y + 1.5, 2.4, 11, 1.7 * k * fl, 0.15 * k * fl, 0.08 * k * fl, 0.4);
    }
    // the jet
    for (const s of this.strikes) {
      if (!s.jet) continue;
      if (atlas.has('jet')) atlas.put(sprites, 'jet', s.x, s.y, 0.04 * s.dir, s.dir, 1, 1, 1, 1, 0, 1);
      if (s.voice) s.voice.update(s.x);
      s.acc = (s.acc || 0) + dt * 90;
      const tail = s.x - s.dir * 7.5;
      while (s.acc >= 1) {
        s.acc -= 1;
        const j = P.spawn(K.FIRE, tail + rand(-0.4, 0.4), s.y + rand(-0.2, 0.3), -s.dir * rand(8, 20), rand(-0.5, 0.5), rand(0.3, 0.6), rand(0.1, 0.22), 0.6, 0.8, 1.6, 1);
        if (j >= 0) P.drag[j] = 4;
        const k = fx.smoke(tail - s.dir * rand(0, 2), s.y, -s.dir * rand(2, 6), rand(-0.3, 0.3), rand(0.25, 0.5), rand(2.5, 4), 0.5, 0.2);
        if (k >= 0) P.grow[k] *= 0.4;
      }
    }
    // shield domes: short arcs of light running round a bubble, a faint
    // glow inside it, a ring that bends the picture at its edge
    for (const t of b.tanks) {
      if (!t.alive) continue;
      const g = t.shieldGlow || 0;
      if (t.shield <= 0 && g <= 0.01) {
        t.shieldGlow = 0;
        continue;
      }
      const cx = t.x;
      const cy = t.y + 0.4;
      const R = Math.max(t.len * 0.6, 3.2) + 0.9;
      const full = t.shield > 0 ? clamp(t.shield / (t.shieldMax || 50), 0.3, 1) : 0;
      const k = 0.55 * full + 1.1 * g;
      t.shieldAcc = (t.shieldAcc || 0) + dt * (50 * full + 260 * g) * q;
      while (t.shieldAcc >= 1) {
        t.shieldAcc -= 1;
        const a = 0.05 + Math.random() * (Math.PI - 0.1);
        const sp = (Math.random() < 0.5 ? -1 : 1) * rand(30, 55);
        const j = P.spawn(K.SPARK, cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.95, -Math.sin(a) * sp, Math.cos(a) * sp, rand(0.07, 0.12), rand(0.18, 0.36), 0.5 * k + 0.1, 2.2 * k + 0.2, 4 * k + 0.3, 1);
        if (j >= 0) P.drag[j] = 14;
      }
      t.shieldRing = (t.shieldRing || 0) - dt;
      if (t.shieldRing <= 0) {
        t.shieldRing = 0.16;
        P.spawn(K.FLASH, cx, cy + R * 0.3, 0, 0, R * 1.1, 0.22, 0.05, 0.25, 0.55, 0.3 * full + 0.5 * g);
        // the bending ring only when hit or raised (a constant one warps the tank)
        if (fx.q.distort && g > 0.2) P.spawn(K.SHOCK, cx, cy, 0, 0, R, 0.24, 0, 0, 0, 0.6 * g);
      }
      lights.add(cx, cy + 2, 2.2, 9 + 4 * g, (0.06 * full + 0.5 * g) * 0.8, (0.3 * full + 0.9 * g) * 0.8, (0.7 * full + 1.2 * g) * 0.8, 0.4);
      t.shieldGlow = Math.max(0, g - dt * 2.2);
    }
  }

  // The shield's bubble itself: a thin bright rim with a soft halo, brighter
  // toward the edges and flickering when struck. Drawn with the line overlay
  // each frame (after the renderer clears it).
  drawDomes(R, time) {
    for (const t of this.b.tanks) {
      if (!t.alive || (t.shield <= 0 && !(t.shieldGlow > 0.01))) continue;
      const g = t.shieldGlow || 0;
      const full = t.shield > 0 ? clamp(t.shield / (t.shieldMax || 50), 0.3, 1) : 0;
      const cx = t.x;
      const cy = t.y + 0.4;
      const rad = Math.max(t.len * 0.6, 3.2) + 0.9;
      const n = 28;
      const flick = 0.85 + 0.15 * Math.sin(time * 23 + t.x);
      const a0 = (0.22 * full + 0.6 * g) * flick;
      for (let i = 0; i < n; i++) {
        const u0 = (i / n) * Math.PI;
        const u1 = ((i + 1) / n) * Math.PI;
        const x0 = cx + Math.cos(u0) * rad;
        const y0 = cy + Math.sin(u0) * rad * 0.95;
        const x1 = cx + Math.cos(u1) * rad;
        const y1 = cy + Math.sin(u1) * rad * 0.95;
        // a band of light sweeping round
        const sweep = 0.5 + 0.5 * Math.sin(u0 * 3 - time * 2.4);
        const a = a0 * (0.6 + 0.4 * sweep);
        R.seg(x0, y0, x1, y1, 0.5, 0.5, 0.25, 0.75, 1.6, a * 0.18);
        R.seg(x0, y0, x1, y1, 0.07, 0.07, 0.7, 1.6, 3.2, a);
      }
    }
  }
}
