// The little activities that come between feeding rounds. After every five
// fruits there is a party (pop balloons, blow out the cake candle), and then
// one of three care games, in turn: bath time (scrub the monster with a
// sponge until it is covered in foam, then a shower rinses it), brushing
// teeth (rub the toothbrush over the germs in its open mouth), and dress-up
// (tap a hat, crown, bow or glasses and it pops onto the monster, and stays
// on for the next round). Nothing can go wrong in any of them, and each one
// finishes by itself if nobody plays.
//
// Each activity gets a world object from main.js (W, H, u, monster, babies,
// scene, sfx, later) and has start(), update(dt), draw(g) (in front of the
// monsters), down(p), move(p), up(), an info() for the debug hook, and sets
// done = true when it is over.
import * as P from './props.js';

const TAU = Math.PI * 2;
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const back = (t) => {
  t = Math.min(1, Math.max(0, t));
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// a pointing finger, used as a hint when nobody has touched anything
function hintHand(g, x, y, s, a = 1) {
  g.save();
  g.globalAlpha *= a;
  g.translate(x, y);
  g.scale(s / 100, s / 100);
  g.rotate(-0.35);
  const p = new Path2D();
  p.roundRect(-22, -70, 44, 110, 22);
  p.roundRect(-50, 0, 100, 90, 40);
  g.shadowColor = 'rgba(0,0,0,0.25)';
  g.shadowBlur = 16;
  g.shadowOffsetY = 6;
  P.blob(p, '#ffffff', '#ffe0c8', '#f2b996', 0, 0, 90, '#8a4a2a', 6);
  g.restore();
}

class Activity {
  constructor(world) {
    this.w = world;
    this.t = 0;
    this.idle = 0;
    this.done = false;
    this.ending = false;
  }
  get m() {
    return this.w.monster;
  }
  start() {}
  update(dt) {
    this.t += dt;
    this.idle += dt;
  }
  draw() {}
  down() {
    this.idle = 0;
    return false;
  }
  move() {}
  up() {}
  info() {
    return {};
  }
  finish(after = 1.8) {
    if (this.ending) return;
    this.ending = true;
    this.w.later(after, () => (this.done = true));
  }
  cheerBabies(k = 1.4) {
    for (const b of this.w.babies) {
      b.joy = k;
      b.squashV -= 5;
    }
  }
}

// ---------------------------------------------------------------- party

export class Party extends Activity {
  name = 'party';

  start() {
    const { W, H, u, scene, sfx, later, babies } = this.w;
    const m = this.m;
    m.dance = 3.3;
    for (const b of babies) b.dance = 3.3;
    sfx.fanfare();
    later(1.6, () => sfx.giggle());
    const colors = ['#ff4b4b', '#ff9f1c', '#ffe14a', '#5fce4f', '#3bb3ff', '#8b5cf6', '#ff5fa8'];
    for (let k = 0; k < 4; k++) {
      later(k * 0.45, () => {
        scene.emit('confetti', W * (0.2 + Math.random() * 0.6), H * 0.05, 40, {
          colors, angle: Math.PI / 2, spread: 2.4, speed: 0.6, grav: 0.6, drag: 1.4, size: 0.014, life: 2.6,
        });
        scene.emit('star', m.x, m.y - m.R * 0.5, 8, { colors: ['#ffe14a', '#fff6b0'], speed: 0.9, grav: 0.8, size: 0.03, life: 1.2 });
      });
    }
    this.balloons = [];
    this.spawned = 0;
    this.nextBalloon = 0.2;
    this.popped = 0;
    this.cakeT = -1.2; // slides in after a moment
    this.lit = true;
    this.blown = false;
    this.layout();
  }

  layout() {
    const { W, H } = this.w;
    const m = this.m;
    // the cake sits on the blanket in front of the monster, its candle
    // flame below the monster's mouth
    this.ck = Math.max(0.12, Math.min((m.R * 1.6) / 660, (H - 6 - (m.y + m.R * 0.35)) / 555));
    this.cx = m.x;
    this.cy = H - 6 - 172 * this.ck;
    this.br = Math.max(26, Math.min(W, H) * 0.062);
  }

  addBalloon() {
    const { W, H } = this.w;
    const r = this.br;
    const lanes = [0.1, 0.9, 0.22, 0.78, 0.33, 0.67, 0.14, 0.86];
    const x = W * lanes[this.spawned % lanes.length];
    this.balloons.push({ x0: x, x, y: H + r * 1.5, r, c: this.spawned % 6, p: Math.random() * TAU, vy: -Math.min(W, H) * (0.075 + Math.random() * 0.03), grow: 0 });
    this.spawned++;
  }

  update(dt) {
    super.update(dt);
    const { scene } = this.w;
    this.layout();
    if (!this.ending && this.spawned < 8) {
      this.nextBalloon -= dt;
      if (this.nextBalloon <= 0) {
        this.addBalloon();
        this.nextBalloon = 0.7 + Math.random() * 0.5;
      }
    }
    for (const b of [...this.balloons]) {
      b.y += b.vy * dt;
      b.grow = Math.min(1, b.grow + dt * 2);
      b.x = b.x0 + Math.sin(this.t * 1.4 + b.p) * b.r * 0.4;
      if (b.y < -b.r * 4) this.balloons.splice(this.balloons.indexOf(b), 1);
    }
    this.cakeT += dt;
    // nobody blew? the monster does it itself
    if (this.lit && this.cakeT > 9 && !this.blown) this.blow();
    if (!this.ending && this.blown && this.t > 4 && (this.balloons.length === 0 || this.idle > 3)) this.finish(1.2);
    if (!this.ending && this.t > 30) this.finish(0.5);
    if (this.lit && Math.random() < dt * 2) scene.emit('twinkle', this.cx, this.cy - 330 * this.ck, 1, { colors: ['#fff6b0'], speed: 0.1, grav: -0.1, size: 0.02, life: 0.6 });
  }

  cakeHit(p) {
    const k = this.ck;
    return this.cakeT > 0.6 && p.x > this.cx - 280 * k && p.x < this.cx + 280 * k && p.y > this.cy - 420 * k && p.y < this.cy + 130 * k;
  }

  blow() {
    if (!this.lit) return;
    const { sfx, scene, later, W, H } = this.w;
    const m = this.m;
    this.blown = true;
    m.squashV -= 9;
    m.lookAt = { x: this.cx, y: this.cy - 300 * this.ck };
    m.mouth = 0.4;
    sfx.blow();
    later(0.35, () => {
      this.lit = false;
      const fx = this.cx;
      const fy = this.cy - 330 * this.ck;
      scene.emit('puff', fx, fy, 6, { colors: ['#ffffff', '#e8e8f0'], angle: -Math.PI / 2, spread: 0.8, speed: 0.15, grav: -0.15, drag: 1, size: 0.03, life: 1.4 });
      sfx.cheer();
      m.joy = 2;
      m.lookAt = null;
      this.cheerBabies(2);
      const colors = ['#ff4b4b', '#ff9f1c', '#ffe14a', '#5fce4f', '#3bb3ff', '#8b5cf6', '#ff5fa8'];
      for (let k = 0; k < 3; k++) {
        later(k * 0.3, () =>
          scene.emit('confetti', W * (0.15 + Math.random() * 0.7), H * 0.02, 50, { colors, angle: Math.PI / 2, spread: 2.6, speed: 0.6, grav: 0.6, drag: 1.4, size: 0.015, life: 2.8 }),
        );
      }
      scene.emit('star', fx, fy, 12, { colors: ['#ffe14a', '#fff6b0'], speed: 0.8, grav: 0.6, size: 0.028, life: 1.3 });
    });
  }

  popBalloon(b) {
    const { sfx, scene } = this.w;
    const i = this.balloons.indexOf(b);
    if (i < 0) return;
    this.balloons.splice(i, 1);
    this.popped++;
    sfx.balloon(this.popped);
    const [col, light] = P.BALLOONS[b.c];
    scene.emit('confetti', b.x, b.y, 22, { colors: [col, light, '#ffffff', '#ffe14a'], speed: 0.55, grav: 0.7, drag: 1.6, size: 0.013, life: 1.6 });
    scene.emit('ring', b.x, b.y, 1, { colors: ['#ffffff'], speed: 0, grav: 0, size: (b.r * 1.8) / scene.u, life: 0.3, even: true });
    scene.emit('heart', b.x, b.y, 3, { colors: ['#ff4f8b', '#ff7aa8'], angle: -Math.PI / 2, spread: 1.6, speed: 0.3, grav: -0.15, drag: 1.5, size: 0.028, life: 1.2 });
    this.m.joy = Math.max(this.m.joy, 0.8);
    this.m.lookAt = null;
    for (const bb of this.w.babies) bb.squashV -= 4;
  }

  down(p) {
    super.down(p);
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const b = this.balloons[i];
      if (dist(p.x, p.y, b.x, b.y) < b.r * 1.4) {
        this.popBalloon(b);
        return true;
      }
    }
    if (this.lit && this.cakeHit(p)) {
      this.blow();
      return true;
    }
    return false;
  }

  draw(g) {
    const t = this.t;
    if (this.cakeT > -0.2) {
      const k = back(this.cakeT / 0.7);
      const y = this.cy + (1 - k) * (this.w.H - this.cy + 200 * this.ck);
      P.cake(this.cx, y, this.ck, this.lit, t);
      if (this.lit && this.cakeT > 3) hintHand(g, this.cx + 60 * this.ck, this.cy - 260 * this.ck + Math.sin(t * 5) * 12 * this.ck, 220 * this.ck, Math.min(1, (this.cakeT - 3) * 2));
    }
    for (const b of this.balloons) {
      const s = b.grow < 1 ? back(b.grow) : 1;
      P.balloon(b.x, b.y, b.r * s, b.c, Math.sin(t * 1.4 + b.p));
    }
  }

  info() {
    return { name: this.name, balloons: this.balloons.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y) })), popped: this.popped, lit: this.lit, cake: { x: Math.round(this.cx), y: Math.round(this.cy - 200 * this.ck) } };
  }
}

// ---------------------------------------------------------------- bath

const FOAM_GOAL = 14;

export class Bath extends Activity {
  name = 'bath';

  start() {
    this.foam = []; // {x, y, r, t} in units of R around the body centre
    this.rinsing = false;
    this.scrub = 0;
    this.dragging = false;
    this.pointer = null;
    this.bubbles = [];
    this.nextBubble = 0.5;
    this.duck = { hop: 0, v: 0 };
    this.lastScrub = 0;
    this.overlay = (g, R) => {
      for (const f of this.foam) {
        const pop = f.t < 0.25 ? back(f.t / 0.25) : 1;
        const gone = f.gone ? Math.max(0, 1 - f.gone / 0.25) : 1;
        if (gone <= 0) continue;
        P.foamBall(f.x * R, f.y * R, f.r * R * pop * gone * (1 + Math.sin(this.t * 3 + f.x * 9) * 0.04));
      }
    };
    this.m.overlays.push(this.overlay);
    this.w.sfx.splash();
  }

  get tubY() {
    const m = this.m;
    const k = ease(this.t / 0.6);
    return m.y + m.R * 0.3 + (1 - k) * (this.w.H - m.y + m.R);
  }

  get tubW() {
    return Math.min(this.w.W * 0.96, this.m.R * 3.1);
  }

  // the babies hop into the tub too
  get babyLift() {
    return this.t > 0.3 ? 0.62 : 0;
  }

  local(p) {
    const m = this.m;
    return { x: (p.x - m.x) / m.size, y: (p.y - (m.y + m.hopY())) / m.size };
  }

  addFoam(p, quiet) {
    const m = this.m;
    if (this.rinsing || !m.contains(p.x, p.y) || p.y > this.tubY - m.R * 0.05) return false;
    const l = this.local(p);
    if (this.foam.length < 26) this.foam.push({ x: l.x, y: l.y, r: 0.11 + Math.random() * 0.07, t: 0 });
    const { scene, sfx } = this.w;
    scene.emit('bubble', p.x, p.y, 3, { speed: 0.25, grav: -0.25, drag: 1.2, size: 0.012, life: 1.1 });
    if (!quiet || this.t - this.lastScrub > 0.18) {
      sfx.scrub();
      this.lastScrub = this.t;
    }
    m.wiggle = Math.max(m.wiggle, 0.35);
    m.poke(p.x, p.y, 0.4);
    if (Math.random() < 0.3) sfx.giggle();
    if (this.foam.length >= FOAM_GOAL) this.rinse();
    return true;
  }

  rinse() {
    if (this.rinsing) return;
    this.rinsing = true;
    this.rinseT = 0;
    const { sfx, later } = this.w;
    later(0.4, () => sfx.shower());
    // pop the foam a ball at a time
    this.foam.forEach((f, i) => later(0.7 + i * 0.07, () => {
      f.gone = 0.0001;
      const m = this.m;
      this.w.scene.emit('bubble', m.x + f.x * m.size, m.y + f.y * m.size, 2, { speed: 0.3, grav: -0.3, drag: 1, size: 0.014, life: 1.2 });
      if (i % 3 === 0) sfx.bubble();
    }));
    later(0.8 + this.foam.length * 0.07 + 0.3, () => {
      const m = this.m;
      m.joy = 2.2;
      m.squashV -= 8;
      sfx.sparkleClean();
      this.cheerBabies(1.8);
      this.w.scene.emit('twinkle', m.x, m.y - m.R * 0.3, 12, { colors: ['#ffffff', '#fff3a0', '#c6f2ff'], speed: 0.7, grav: 0, drag: 2.5, size: 0.035, life: 1 });
      this.finish(1.8);
    });
  }

  update(dt) {
    super.update(dt);
    const { scene, u } = this.w;
    const m = this.m;
    for (const f of this.foam) {
      f.t += dt;
      if (f.gone) f.gone += dt;
    }
    this.duck.v += (-90 * this.duck.hop - 6 * this.duck.v) * dt;
    this.duck.hop += this.duck.v * dt;
    // soap bubbles drift up out of the tub
    this.nextBubble -= dt;
    if (this.nextBubble <= 0) {
      this.nextBubble = 0.6 + Math.random() * 0.7;
      if (this.bubbles.length < 9) {
        const tw = this.tubW;
        this.bubbles.push({ x0: m.x + (Math.random() - 0.5) * tw * 0.9, y: this.tubY, r: u * (0.02 + Math.random() * 0.035), p: Math.random() * TAU, vy: -u * (0.08 + Math.random() * 0.06), t: 0 });
      }
    }
    for (const b of [...this.bubbles]) {
      b.t += dt;
      b.y += b.vy * dt;
      b.x = b.x0 + Math.sin(b.t * 1.5 + b.p) * b.r;
      if (b.y < -b.r) this.bubbles.splice(this.bubbles.indexOf(b), 1);
    }
    if (this.rinsing) {
      this.rinseT += dt;
      if (this.rinseT < 1.8 && Math.random() < dt * 40) {
        scene.emit('drop', m.x + (Math.random() - 0.5) * m.R * 2, m.y - m.R * 2.2, 1, { colors: ['#7fd8ff', '#c6f2ff', '#ffffff'], angle: Math.PI / 2, spread: 0.3, speed: 0.9, grav: 1.4, drag: 0.2, size: 0.012, life: 0.7 });
      }
    }
    m.lookAt = this.pointer && this.dragging ? this.pointer : null;
    if (!this.rinsing && (this.idle > 16 || this.t > 45)) {
      // nobody scrubbed: the monster soaps itself up and rinses off
      while (this.foam.length < 8) this.foam.push({ x: (Math.random() - 0.5) * 1.3, y: -0.2 - Math.random() * 0.6, r: 0.13, t: Math.random() * 0.2 });
      this.rinse();
    }
  }

  duckPos() {
    const tw = this.tubW;
    return { x: this.m.x + tw * 0.36, y: this.tubY - this.m.R * 0.12 - this.duck.hop * this.m.R * 0.3 + Math.sin(this.t * 2.2) * this.m.R * 0.02 };
  }

  down(p) {
    super.down(p);
    const d = this.duckPos();
    const ds = this.m.R * 0.3;
    if (dist(p.x, p.y, d.x, d.y - ds * 0.4) < ds * 1.3) {
      this.duck.v += 9;
      this.w.sfx.squeak();
      this.w.scene.emit('drop', d.x, d.y, 8, { colors: ['#7fd8ff', '#ffffff'], angle: -Math.PI / 2, spread: 2, speed: 0.4, grav: 1.4, size: 0.01, life: 0.7 });
      return true;
    }
    for (const b of this.bubbles) {
      if (dist(p.x, p.y, b.x, b.y) < b.r * 1.4) {
        this.bubbles.splice(this.bubbles.indexOf(b), 1);
        this.w.sfx.bubble();
        this.w.scene.emit('ring', b.x, b.y, 1, { colors: ['#ffffff'], speed: 0, grav: 0, size: (b.r * 1.5) / this.w.scene.u, life: 0.3, even: true });
        return true;
      }
    }
    this.dragging = true;
    this.pointer = { x: p.x, y: p.y };
    this.lastP = { x: p.x, y: p.y };
    this.scrub = 0;
    if (!this.addFoam(p) && p.y > this.tubY - this.m.R * 0.1) {
      this.w.sfx.splashSmall();
      this.w.scene.emit('drop', p.x, p.y, 8, { colors: ['#7fd8ff', '#ffffff'], angle: -Math.PI / 2, spread: 1.6, speed: 0.4, grav: 1.4, size: 0.01, life: 0.7 });
    }
    return true;
  }

  move(p) {
    if (!this.dragging) return;
    this.idle = 0;
    this.scrub += dist(p.x, p.y, this.lastP.x, this.lastP.y);
    this.lastP = { x: p.x, y: p.y };
    this.pointer = { x: p.x, y: p.y };
    if (this.scrub > this.m.R * 0.22) {
      this.scrub = 0;
      this.addFoam(p, true);
    }
  }

  up() {
    this.dragging = false;
  }

  drawBack(g) {
    // the back rim of the tub, behind the monster
    const m = this.m;
    const y = this.tubY;
    const tw = this.tubW;
    g.save();
    const p = new Path2D();
    p.ellipse(m.x, y, tw / 2 + m.R * 0.05, m.R * 0.22, 0, Math.PI, TAU);
    P.blob(p, '#ffffff', '#e8f0ff', '#a8c0e0', m.x, y - m.R * 0.2, tw / 2, '#5a7fb8', m.R * 0.03);
    g.restore();
  }

  draw(g) {
    const m = this.m;
    const R = m.R;
    const y = this.tubY;
    const tw = this.tubW;
    P.tub(m.x, y, tw);
    // foam heaped along the rim
    for (let i = 0; i < 15; i++) {
      const fx = m.x - tw * 0.47 + (i / 14) * tw * 0.94;
      const r = R * (0.12 + 0.05 * Math.sin(i * 2.7) + 0.015 * Math.sin(this.t * 2 + i));
      P.foamBall(fx, y - R * 0.08 - Math.abs(Math.sin(i * 1.3)) * R * 0.08, r);
    }
    const d = this.duckPos();
    P.duck(d.x, d.y, R * 0.3);
    for (const b of this.bubbles) P.soapBubble(b.x, b.y, b.r);
    // the sponge: in the hand while scrubbing, resting on the rim otherwise
    if (this.dragging && this.pointer && !this.rinsing) {
      P.sponge(this.pointer.x, this.pointer.y, R / 420, 0.3 + Math.sin(this.t * 18) * 0.12);
    } else if (!this.rinsing) {
      const sx = m.x - tw * 0.36;
      const sy = y - R * 0.2;
      const bob = 1 + Math.sin(this.t * 4) * 0.05;
      P.sponge(sx, sy, (R / 420) * bob, -0.2);
      if (this.idle > 2.5) {
        // a hint: the hand rubs back and forth across the monster
        const k = (Math.sin(this.t * 2.5) + 1) / 2;
        hintHand(g, m.x - R * 0.45 + k * R * 0.9, m.y - R * 0.2 + R * 0.25, R * 0.5, Math.min(1, (this.idle - 2.5) * 2));
      }
    }
  }

  info() {
    return { name: this.name, foam: this.foam.length, goal: FOAM_GOAL, rinsing: this.rinsing, duck: this.duckPos() };
  }

  end() {
    const i = this.m.overlays.indexOf(this.overlay);
    if (i >= 0) this.m.overlays.splice(i, 1);
  }
}

// ---------------------------------------------------------------- teeth

const GERM_SPOTS = [[-0.5, 0.3], [0.0, 0.22], [0.5, 0.3], [-0.25, 0.6], [0.25, 0.6]];

export class Teeth extends Activity {
  name = 'teeth';

  start() {
    this.germs = GERM_SPOTS.map(([fx, fy], i) => ({ fx, fy, clean: 0, gone: 0, hue: i % 3, wob: 0 }));
    this.cleaned = 0;
    this.pointer = null;
    this.dragging = false;
    this.lastBrush = 0;
    this.finished = false;
    this.shineT = 0;
    this.overlay = (g, R, m) => {
      if (this.finished) {
        if (this.shineT < 1.6) P.sparkle(R * 0.25, R * 0.33, R * 0.14 * Math.sin(Math.min(1, this.shineT / 1.6) * Math.PI), '#ffffff');
        return;
      }
      const o = m.mouth;
      const my = R * (0.3 - 0.16 * o);
      const w = R * (0.26 + 0.36 * o);
      const h = R * (0.06 + 0.6 * o);
      for (const gm of this.germs) {
        if (gm.gone > 0.3) continue;
        const s = gm.gone ? 1 - gm.gone / 0.3 : 1;
        const shake = gm.wob > 0 ? Math.sin(gm.wob * 40) * R * 0.02 : 0;
        P.germ(gm.fx * w + shake, my + gm.fy * h, R * 0.1 * s * Math.min(1, o * 1.4), this.t, gm.hue);
      }
    };
    this.m.overlays.push(this.overlay);
    this.m.gape = 1;
    this.w.sfx.hungry();
  }

  germPos(gm) {
    const m = this.m;
    const R = m.size;
    const o = m.mouth;
    const my = R * (0.3 - 0.16 * o);
    const w = R * (0.26 + 0.36 * o);
    const h = R * (0.06 + 0.6 * o);
    return { x: m.x + gm.fx * w, y: m.y + m.hopY() + my + gm.fy * h };
  }

  brushAt(p, amount) {
    const m = this.m;
    const { sfx, scene } = this.w;
    let hit = false;
    for (const gm of this.germs) {
      if (gm.gone) continue;
      const q = this.germPos(gm);
      if (dist(p.x, p.y, q.x, q.y) > m.R * 0.2) continue;
      hit = true;
      gm.clean += amount;
      gm.wob = 0.25;
      if (Math.random() < 0.5) scene.emit('bubble', q.x, q.y, 2, { speed: 0.2, grav: -0.2, drag: 1.2, size: 0.01, life: 0.9 });
      if (gm.clean >= 1) {
        gm.gone = 0.0001;
        this.cleaned++;
        sfx.ding(this.cleaned);
        scene.emit('twinkle', q.x, q.y, 6, { colors: ['#ffffff', '#fff3a0', '#c6f2ff'], speed: 0.4, grav: 0, drag: 2.5, size: 0.03, life: 0.7 });
        scene.emit('bubble', q.x, q.y, 6, { speed: 0.4, grav: -0.3, drag: 1.2, size: 0.014, life: 1 });
        m.squashV -= 3;
        if (this.cleaned === this.germs.length) this.sparkly();
      }
    }
    if (hit && this.t - this.lastBrush > 0.12) {
      sfx.brush();
      this.lastBrush = this.t;
    }
    return hit;
  }

  sparkly() {
    const { sfx, later, scene } = this.w;
    later(0.4, () => {
      this.finished = true;
      this.shineT = 0;
      const m = this.m;
      m.gape = 0;
      m.joy = 2.4;
      sfx.sparkleClean();
      this.cheerBabies(2);
      scene.emit('twinkle', m.x, m.y + m.R * 0.2, 10, { colors: ['#ffffff', '#fff3a0'], speed: 0.6, grav: 0, drag: 2.5, size: 0.035, life: 1 });
      this.finish(2);
    });
  }

  update(dt) {
    super.update(dt);
    const m = this.m;
    this.shineT += dt;
    if (!this.finished) m.gape = Math.max(m.gape, 0.3);
    for (const gm of this.germs) {
      gm.wob = Math.max(0, gm.wob - dt);
      if (gm.gone) gm.gone += dt;
    }
    m.lookAt = this.dragging && this.pointer ? this.pointer : null;
    if (!this.finished && !this.ending && (this.idle > 18 || this.t > 50)) {
      // the germs give up and hop out by themselves
      for (const gm of this.germs) if (!gm.gone) gm.gone = 0.0001;
      this.cleaned = this.germs.length;
      this.sparkly();
    }
  }

  down(p) {
    super.down(p);
    this.dragging = true;
    this.pointer = { x: p.x, y: p.y };
    this.lastP = { x: p.x, y: p.y };
    this.brushAt(p, 0.4);
    return true;
  }

  move(p) {
    if (!this.dragging) return;
    this.idle = 0;
    const d = dist(p.x, p.y, this.lastP.x, this.lastP.y);
    this.lastP = { x: p.x, y: p.y };
    this.pointer = { x: p.x, y: p.y };
    this.brushAt(p, d / (this.m.R * 1.1));
  }

  up() {
    this.dragging = false;
  }

  draw(g) {
    const { W, H, u } = this.w;
    const m = this.m;
    const R = m.R;
    // the brush: in the hand, scrubbing, or waiting beside the monster
    const s = R / 520;
    if (!this.finished) {
      if (this.dragging && this.pointer) {
        const jig = Math.sin(this.t * 30) * R * 0.02;
        P.toothbrush(this.pointer.x + jig, this.pointer.y + R * 0.08, -0.45, s);
      } else {
        const bx = Math.min(m.x + R * 1.12, this.w.W - 430 * s - 6);
        const by = m.y - R * 0.15 + Math.sin(this.t * 3) * R * 0.03;
        P.toothbrush(bx, by, -0.45 + Math.sin(this.t * 2) * 0.05, s);
        if (this.idle > 2.5) {
          const k = (Math.sin(this.t * 3) + 1) / 2;
          const gm = this.germs.find((x) => !x.gone) || this.germs[0];
          const q = this.germPos(gm);
          hintHand(g, q.x - R * 0.12 + k * R * 0.24, q.y + R * 0.25, R * 0.45, Math.min(1, (this.idle - 2.5) * 2));
        }
      }
    }
    // the tooth meter: one tooth lights up for each germ brushed away
    const n = this.germs.length;
    const ts = Math.max(18, u * 0.04);
    const gap = ts * 2.1;
    const y = W > H ? H - ts * 1.4 : H - ts * 1.6;
    const x0 = W / 2 - (gap * (n - 1)) / 2;
    const pill = new Path2D();
    pill.roundRect(x0 - gap * 0.7, y - ts * 1.25, gap * (n - 1) + gap * 1.4, ts * 2.5, ts * 1.25);
    g.save();
    g.shadowColor = 'rgba(40,40,90,0.25)';
    g.shadowBlur = ts * 0.6;
    P.blob(pill, 'rgba(255,255,255,0.95)', 'rgba(240,246,255,0.92)', 'rgba(200,215,240,0.92)', W / 2, y, gap * n, null);
    g.restore();
    for (let i = 0; i < n; i++) P.tooth(x0 + i * gap, y, ts, i < this.cleaned, Math.sin(this.t * 4 + i) * 0.5 + 0.5);
  }

  info() {
    return { name: this.name, cleaned: this.cleaned, germs: this.germs.filter((x) => !x.gone).map((x) => this.germPos(x)).map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })), finished: this.finished };
  }

  end() {
    const i = this.m.overlays.indexOf(this.overlay);
    if (i >= 0) this.m.overlays.splice(i, 1);
    this.m.gape = 0;
  }
}

// ---------------------------------------------------------------- dress-up

export const OUTFIT_ITEMS = ['hat', 'crown', 'bow', 'glasses', 'flowers'];
const DRESS_GOAL = 4;

// draws what the monster is wearing, in its local units (installed once by main.js)
export function outfitOverlay(g, R, m) {
  const o = m.outfit;
  if (!o) return;
  const k = R / 255;
  if (o.side) P.DRESS[o.side].draw(R * 0.62, -R * 0.72, k);
  if (o.head) {
    const id = o.head;
    const y = id === 'hat' ? -R * 0.84 : id === 'crown' ? -R * 0.88 : -R * 0.9;
    P.DRESS[id].draw(0, y, k * (id === 'flowers' ? 0.85 : id === 'hat' ? 1.25 : 0.8));
  }
  if (o.face) P.DRESS[o.face].draw(m.look.x * R * 0.03, -R * 0.34, k * 0.72);
}

export class Dress extends Activity {
  name = 'dress';

  start() {
    this.flying = [];
    this.placed = 0;
    this.trayT = 0;
    this.pressed = -1;
    this.m.outfit = this.m.outfit || {};
    this.w.sfx.dress();
  }

  // the tray of pieces: a tall one down the right side on a wide screen, a
  // long one across the top on a tall screen, where the fruit usually are
  slots() {
    const { W, H, u } = this.w;
    const n = OUTFIT_ITEMS.length;
    const wide = W > H;
    const slide = 1 - back(this.trayT / 0.6);
    if (wide) {
      const tw = Math.max(80, Math.min(u * 0.2, (H * 0.86) / n));
      const th = Math.min(H * 0.86, tw * n * 1.02);
      const x = W - tw * 0.5 - Math.max(10, u * 0.03) + slide * tw * 2;
      const y0 = H / 2 - th / 2 + u * 0.03;
      const cell = th / n;
      return { vertical: true, x0: x - tw / 2, y0, tw, th, items: OUTFIT_ITEMS.map((id, i) => ({ id, x, y: y0 + cell * (i + 0.5), r: Math.min(cell, tw) * 0.42 })) };
    }
    const th = Math.max(70, Math.min(u * 0.2, (W * 0.94) / n));
    const tw = Math.min(W * 0.94, th * n * 1.02);
    const y = Math.max(u * 0.2, this.m.y - this.m.R * 2.25) - th * 0.5 - slide * (H * 0.4);
    const x0 = W / 2 - tw / 2;
    const cell = tw / n;
    return { vertical: false, x0, y0: y - th / 2, tw, th, items: OUTFIT_ITEMS.map((id, i) => ({ id, x: x0 + cell * (i + 0.5), y, r: Math.min(cell, th) * 0.42 })) };
  }

  wear(id) {
    const { sfx, scene } = this.w;
    const m = this.m;
    const slot = P.DRESS[id].slot;
    const before = m.outfit[slot];
    m.outfit[slot] = id;
    m.hideSprout = m.outfit.head === 'hat';
    m.wiggle = 0.6;
    m.joy = 1.6;
    m.squashV -= 7;
    sfx.dressOn(this.placed);
    scene.emit('twinkle', m.x, m.y - m.R * 0.8, 10, { colors: ['#ffffff', '#fff3a0', '#ffc6e0'], speed: 0.6, grav: 0, drag: 2.5, size: 0.035, life: 0.9 });
    scene.emit('star', m.x, m.y - m.R * 0.6, 6, { colors: ['#ffe14a', '#fff6b0'], speed: 0.6, grav: 0.6, size: 0.022, life: 1 });
    if (before !== id) this.placed++;
    this.cheerBabies(1);
    if (this.placed >= DRESS_GOAL && !this.ending) {
      this.w.later(0.6, () => {
        m.dance = 2.2;
        sfx.fanfare();
        this.showOff = true;
      });
      this.finish(3);
    }
  }

  target(id) {
    const m = this.m;
    const R = m.size;
    const slot = P.DRESS[id].slot;
    if (slot === 'head') return { x: m.x, y: m.y - R * 0.9 };
    if (slot === 'face') return { x: m.x, y: m.y - R * 0.34 };
    return { x: m.x + R * 0.62, y: m.y - R * 0.72 };
  }

  pick(id) {
    const s = this.slots().items.find((it) => it.id === id);
    if (!s || this.flying.some((f) => f.id === id)) return;
    this.flying.push({ id, x0: s.x, y0: s.y, t: 0, k0: s.r / 130 });
    this.w.sfx.whoosh();
  }

  update(dt) {
    super.update(dt);
    this.trayT += dt;
    for (const f of [...this.flying]) {
      f.t += dt;
      if (f.t >= 0.5) {
        this.flying.splice(this.flying.indexOf(f), 1);
        this.wear(f.id);
      }
    }
    if (this.showOff && Math.random() < dt * 8) {
      const m = this.m;
      this.w.scene.emit('twinkle', m.x + (Math.random() - 0.5) * m.R * 2.4, m.y - Math.random() * m.R * 1.8, 1, { colors: ['#ffffff', '#fff3a0'], speed: 0.1, grav: 0, size: 0.03, life: 0.7 });
    }
    this.w.scene.rays += ((this.showOff ? 1 : 0) - this.w.scene.rays) * Math.min(1, dt * 3);
    if (!this.ending && (this.idle > 18 || this.t > 50)) this.finish(0.3);
  }

  down(p) {
    super.down(p);
    if (this.ending) return false;
    const { items } = this.slots();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (dist(p.x, p.y, it.x, it.y) < it.r * 1.25) {
        this.pressed = i;
        this.pressT = this.t;
        this.pick(it.id);
        return true;
      }
    }
    return false;
  }

  drawItem(id, x, y, r) {
    const k = r / 150;
    if (id === 'hat') P.partyHat(x, y + r * 0.35, k * 0.95);
    else if (id === 'crown') P.crown(x, y + r * 0.1, k);
    else if (id === 'bow') P.bow(x, y, k * 0.95);
    else if (id === 'glasses') P.glasses(x, y, k * 0.75);
    else P.flowerCrown(x, y - r * 0.05, k * 1.05);
  }

  draw(g) {
    const { vertical, th, tw, y0, x0, items } = this.slots();
    const tray = new Path2D();
    const rr = Math.min(tw, th) / 2;
    tray.roundRect(x0, y0, tw, th, rr);
    g.save();
    g.shadowColor = 'rgba(120,50,20,0.35)';
    g.shadowBlur = rr * 0.5;
    g.shadowOffsetY = rr * 0.12;
    P.blob(tray, '#fff8ea', '#ffe8c2', '#f4c98a', x0 + tw / 2, y0 + th / 2, Math.max(tw, th) / 2, '#c98a3a', Math.max(2, rr * 0.06));
    g.restore();
    if (vertical) P.shine(x0 + tw * 0.2, y0 + th / 2, tw * 0.05, th * 0.4, 0, 0.6);
    else P.shine(x0 + tw / 2, y0 + th * 0.14, tw * 0.4, th * 0.05, 0, 0.7);
    const o = this.m.outfit;
    items.forEach((it, i) => {
      const worn = o.head === it.id || o.face === it.id || o.side === it.id;
      const press = i === this.pressed && this.t - this.pressT < 0.25 ? 1 - Math.sin(((this.t - this.pressT) / 0.25) * Math.PI) * 0.2 : 1;
      const bob = Math.sin(this.t * 3 + i * 1.3) * it.r * 0.05;
      if (worn) {
        g.save();
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.lineWidth = Math.max(2, it.r * 0.08);
        g.setLineDash([1, it.r * 0.22]);
        g.lineCap = 'round';
        g.beginPath();
        g.arc(it.x, it.y, it.r * 1.05, 0, TAU);
        g.stroke();
        g.restore();
      }
      if (this.flying.some((f) => f.id === it.id)) return;
      P.softShadow(it.x, it.y + it.r * 0.8, it.r * 0.8, it.r * 0.14, 0.25);
      this.drawItem(it.id, it.x, it.y + bob, it.r * press);
    });
    for (const f of this.flying) {
      const tg = this.target(f.id);
      const k = ease(f.t / 0.5);
      const x = f.x0 + (tg.x - f.x0) * k;
      const yy = f.y0 + (tg.y - f.y0) * k - Math.sin(k * Math.PI) * this.m.R * 0.8;
      g.save();
      g.translate(x, yy);
      g.rotate(Math.sin(k * Math.PI) * 0.6);
      this.drawItem(f.id, 0, 0, this.m.R * (0.35 + 0.15 * k));
      g.restore();
    }
    if (this.idle > 3 && !this.ending && items.length) {
      const it = items[Math.floor(this.t / 2) % items.length];
      hintHand(g, it.x + it.r * 0.3, it.y + it.r * 0.6 + Math.sin(this.t * 6) * it.r * 0.1, it.r * 1.1, Math.min(1, (this.idle - 3) * 2));
    }
  }

  info() {
    return { name: this.name, placed: this.placed, outfit: { ...this.m.outfit }, items: this.slots().items.map((it) => ({ id: it.id, x: Math.round(it.x), y: Math.round(it.y) })) };
  }
}

export const CARE = [Bath, Teeth, Dress];
