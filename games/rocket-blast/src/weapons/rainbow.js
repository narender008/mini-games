// Rainbow Beam: while firing, a wide glowing ribbon of real rainbow bands
// streams from the rocket's nose to the top of the sky, shimmering upward
// with sparkles and little stars riding it. It trails a little behind the
// rocket as it moves, and any toy it touches pops a moment later (one after
// another, so each gets its own celebration). MEGA and FIRE! make it a
// super-wide beam that sweeps from side to side.
import * as THREE from 'three';
import { SPRITE } from '../textures.js';
import { SpriteBatch } from '../sprites.js';
import { rand, clamp, damp } from '../config.js';

const TOUCH = 0.07; // seconds a toy must be in the beam before it pops
const STAGGER = 0.06; // seconds between pops
const FLARE = 1.5; // the beam widens out of the nose over this height
const BANDS = [
  [1, 0.1, 0.12],
  [1, 0.38, 0.03],
  [1, 0.85, 0.08],
  [0.12, 0.8, 0.2],
  [0.1, 0.42, 1],
  [0.52, 0.14, 1],
];
// solid little stars riding the beam: gold, white, pink, sky blue
const STARS = [
  [1.8, 1.45, 0.45],
  [1.9, 1.85, 1.75],
  [1.9, 1.05, 1.45],
  [1.05, 1.6, 1.95],
];
// C major pentatonic up high, for the sparkle bells
const NOTES = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.3, 2637];

const vertexShader = /* glsl */ `
uniform vec2 uBase;
uniform float uH;
uniform float uW;
uniform float uShear;
uniform float uSway;
uniform float uWob;
uniform float uTime;
varying vec2 vUv;
varying float vH;
void main() {
  float h = uv.y * uH;
  float v = uv.y;
  // must match Rainbow.centerAt()
  float cx = uBase.x + h * uShear + uSway * v * v + uWob * sin(h * 0.9 - uTime * 4.0) * min(1.0, h * 0.5);
  float flare = mix(0.3, 1.0, smoothstep(0.0, ${FLARE.toFixed(2)}, h));
  float across = (uv.x - 0.5) * 2.0 * 1.6; // the body is |across| < 1, the rest is halo
  vec3 p = vec3(cx + across * uW * 0.5 * flare, uBase.y + h, -0.12);
  vUv = vec2(across, v);
  vH = h;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

// Premultiplied output: the body is a mostly opaque, saturated rainbow (so it
// holds its colour on a bright sky) and the halo is pure added light.
const fragmentShader = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform float uLevel;
uniform float uReach;
varying vec2 vUv;
varying float vH;
const vec3 C0 = vec3(${BANDS[0].join(', ')});
const vec3 C1 = vec3(${BANDS[1].join(', ')});
const vec3 C2 = vec3(${BANDS[2].join(', ')});
const vec3 C3 = vec3(${BANDS[3].join(', ')});
const vec3 C4 = vec3(${BANDS[4].join(', ')});
const vec3 C5 = vec3(${BANDS[5].join(', ')});
vec3 band(float t) {
  t = clamp(t, 0.0, 1.0) * 5.0;
  float i = min(floor(t), 4.0);
  float f = smoothstep(0.2, 0.8, t - i);
  if (i < 0.5) return mix(C0, C1, f);
  if (i < 1.5) return mix(C1, C2, f);
  if (i < 2.5) return mix(C2, C3, f);
  if (i < 3.5) return mix(C3, C4, f);
  return mix(C4, C5, f);
}
void main() {
  float x = vUv.x;
  float ax = abs(x);
  float h = vH;
  // bands wave gently as they stream up
  float wave = sin(h * 0.7 - uTime * 3.0) * 0.05;
  vec3 col = band((x + wave) * 0.56 + 0.5);
  // a round, glossy tube of light: brighter along the middle
  float tube = 0.8 + 0.4 * (1.0 - x * x);
  // shimmer streaks and pulses of light racing up the beam
  float n = texture2D(uNoise, vec2(x * 0.16 + h * 0.01, h * 0.06 - uTime * 0.85)).r;
  float n2 = texture2D(uNoise, vec2(x * 0.27 - uTime * 0.04, h * 0.11 - uTime * 1.7)).b;
  float shimmer = smoothstep(0.55, 0.9, n * 0.6 + n2 * 0.6);
  float pulse = pow(0.5 + 0.5 * sin(h * 1.2 - uTime * 11.0), 12.0);
  vec3 c = col * tube * (1.0 + 0.5 * pulse) + vec3(1.0, 0.97, 0.92) * (shimmer * 0.45 + pulse * 0.2 + exp(-x * x * 14.0) * 0.12);
  // soft edges, a rounded start at the nose, and the growing tip
  float start = smoothstep(0.0, 0.45, h);
  float tip = 1.0 - smoothstep(uReach - 1.2, uReach, h);
  float k = start * tip * uLevel;
  float body = smoothstep(1.0, 0.8, ax) * k;
  float halo = exp(-max(0.0, ax - 0.85) * 5.0) * (1.0 - smoothstep(1.0, 0.8, ax)) * smoothstep(1.6, 1.15, ax) * k;
  float a = body * 0.88;
  vec3 edge = band(x * 0.56 + 0.5);
  gl_FragColor = vec4(c * a + edge * halo * 0.4, a);
}`;

// Sparkles riding the beam stay locked to it as it sways.
function ride(p) {
  const beam = p.beam;
  p.x = beam.centerAt(p.y) + p.off * beam.halfAt(p.y);
  p.a = p.a0 * beam.level;
}

export class Rainbow {
  constructor(sys) {
    this.sys = sys;
    this.amount = sys.app?.quality?.debris ?? 1;
    this.hold = 0; // fire() keeps this topped up while the trigger is held
    this.level = 0; // 0..1 fade of the whole beam
    this.reach = 0; // how far up the beam has shot so far
    this.superT = 0; // FIRE! volley: super beam time left
    this.superK = 0; // 0..1 blend towards the super-wide sweeping beam
    this.mega = false;
    this.sway = 0;
    this.time = 0;
    this.baseX = 0;
    this.baseY = 0;
    this.H = 10;
    this.W = 2;
    this.shear = 0;
    this.wob = 0.12;
    this.emit = 0;
    this.shot = 0;
    this.shotT = 0;
    this.bossT = 0;
    this.lastPop = -1;
    this.queueE = [];
    this.queueT = [];
    this.bellT = 0;
    this.hum = null;
    this.uniforms = {
      uNoise: { value: sys.noise },
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uReach: { value: 0 },
      uBase: { value: new THREE.Vector2() },
      uH: { value: 10 },
      uW: { value: 2 },
      uShear: { value: 0 },
      uSway: { value: 0 },
      uWob: { value: 0.12 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 12, 64), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    sys.scene.add(this.mesh);
    // solid (alpha-blended) stars read on the bright beam where added light
    // would just wash to white; they share the sprite atlas
    this.stars = new SpriteBatch(sys.glow.material.uniforms.uMap.value, { capacity: 160, blending: 'alpha', renderOrder: 8 });
    sys.scene.add(this.stars.mesh);
  }

  interval() {
    return 0.08;
  }

  fire(ctx, { mega = false, volley = false } = {}) {
    this.hold = 0.14;
    this.mega = mega;
    if (volley) {
      this.superT = 1.8;
      this.volleyBurst(ctx);
    }
  }

  // x of the beam's centre line at height y (mirrors the vertex shader)
  centerAt(y) {
    const h = Math.max(0, y - this.baseY);
    const v = Math.min(1, h / this.H);
    return this.baseX + h * this.shear + this.sway * v * v + this.wob * Math.sin(h * 0.9 - this.time * 4) * Math.min(1, h * 0.5);
  }

  // half the body width at height y
  halfAt(y) {
    const h = Math.max(0, y - this.baseY);
    const k = clamp(h / FLARE, 0, 1);
    return this.W * 0.5 * (0.3 + 0.7 * k * k * (3 - 2 * k));
  }

  update(dt, t, ctx) {
    this.time = t;
    this.stars.update(dt);
    this.flushQueue(t, ctx);
    const on = this.hold > 0;
    this.hold -= dt;
    this.superT = Math.max(0, this.superT - dt);
    this.level = on ? Math.min(1, this.level + dt / 0.08) : Math.max(0, this.level - dt / 0.3);
    if (this.level <= 0) {
      this.reach = 0;
      this.mesh.visible = false;
      this.stopHum();
      return;
    }
    const b = ctx.bounds;
    const m = ctx.muzzle;
    this.baseX = m.x;
    this.baseY = m.y - 0.2;
    this.H = Math.max(1, b.maxY + 1 - this.baseY);
    this.reach = on ? Math.min(this.H + 2, this.reach + dt * 45) : this.reach;
    this.superK = damp(this.superK, this.superT > 0 || (this.mega && ctx.active) ? 1 : 0, 5, dt);
    this.W = (2 + 1.4 * this.superK) * (0.55 + 0.45 * this.level);
    this.shear = this.superK * Math.sin(t * 1.9) * 0.3;
    // the top of the beam trails behind the rocket like a hose
    this.sway = damp(this.sway, clamp(-ctx.rocket.vel.x * 0.1, -1.8, 1.8), 6, dt);
    this.wob = 0.12 + 0.1 * this.superK;
    const u = this.uniforms;
    u.uTime.value = t;
    u.uLevel.value = this.level;
    u.uReach.value = this.reach;
    u.uBase.value.set(this.baseX, this.baseY);
    u.uH.value = this.H;
    u.uW.value = this.W;
    u.uShear.value = this.shear;
    u.uSway.value = this.sway;
    u.uWob.value = this.wob;
    this.mesh.visible = true;

    if (this.level > 0.4) this.touch(dt, t, ctx);
    this.decorate(dt, t, ctx);
    this.sing(dt, ctx);
  }

  // Toys inside the beam join the pop queue; the boss takes steady hits.
  touch(dt, t, ctx) {
    this.shotT -= dt;
    if (this.shotT <= 0) {
      this.shot = ctx.nextShot(); // one "shot" per sweep, for the multi-hit bonus
      this.shotT = 0.6;
    }
    this.bossT -= dt;
    const top = Math.min(this.baseY + this.reach, ctx.bounds.maxY + 0.2);
    for (const e of ctx.enemies) {
      if (!e.alive) continue;
      const r = e.size * 0.5;
      if (e.y + r < this.baseY || e.y - r * 0.5 > top) continue;
      const dx = Math.abs(e.x - this.centerAt(e.y));
      if (dx > this.halfAt(e.y) + r * 0.85) continue;
      if (e.boss) {
        if (this.bossT <= 0) {
          this.bossT = 0.14;
          ctx.hit(e, this.centerAt(e.y - r * 0.6), e.y - r * 0.6, { weapon: 'rainbow', shot: this.shot });
        }
        continue;
      }
      if (this.queueE.includes(e)) continue;
      const at = Math.max(t + TOUCH, this.lastPop + STAGGER);
      this.lastPop = at;
      this.queueE.push(e);
      this.queueT.push(at);
    }
  }

  flushQueue(t, ctx) {
    const qe = this.queueE;
    const qt = this.queueT;
    let n = 0;
    for (let i = 0; i < qe.length; i++) {
      const e = qe[i];
      if (t < qt[i]) {
        qe[n] = e;
        qt[n++] = qt[i];
        continue;
      }
      if (e.alive) ctx.hit(e, e.x, e.y, { weapon: 'rainbow', shot: this.shot });
    }
    qe.length = n;
    qt.length = n;
  }

  // Base flare, sparkles and stars riding up, and the bright growing tip.
  decorate(dt, t, ctx) {
    const g = this.sys.glow;
    const L = this.level;
    const x = this.baseX;
    const y = this.baseY + 0.25;
    const w = this.W * 0.5;
    g.add({ x, y, z: 0.35, size: 1.6 * w, life: 0, frame: SPRITE.GLOW, r: 2, g: 1.85, b: 1.6, a: 0.5 * L });
    g.add({ x, y, z: 0.4, size: 3 * w, h: 0.5, life: 0, frame: SPRITE.FLARE, r: 1.6, g: 1.4, b: 1.8, a: 0.55 * L });
    g.add({ x, y, z: 0.4, size: 1.1 * w, rot: t * 1.3, life: 0, frame: SPRITE.BURST, r: 1.8, g: 1.5, b: 1.9, a: 0.35 * L });
    if (this.reach < this.H) {
      const ty = this.baseY + this.reach - 0.6;
      g.add({ x: this.centerAt(ty), y: ty, z: 0.3, size: 2.4 * w, life: 0, frame: SPRITE.GLOW, r: 2.2, g: 2, b: 2.2, a: 0.6 * L });
    }
    if (L < 0.5) return;
    this.emit += dt * (30 + 30 * this.superK) * this.amount;
    while (this.emit >= 1) {
      this.emit -= 1;
      const off = rand(-0.85, 0.85);
      const star = Math.random() < 0.45;
      const c = star ? STARS[(Math.random() * STARS.length) | 0] : BANDS[clamp(Math.floor((off * 0.5 + 0.5) * 6), 0, 5)];
      const k = star ? 1 : 1.8;
      const vy = rand(6, 10);
      const p = (star ? this.stars : g).add({
        x,
        y: this.baseY + rand(0.6, 1.6),
        z: 0.3,
        vy,
        size: star ? rand(0.34, 0.5) : rand(0.4, 0.6),
        rot: rand(0, 6.28),
        spin: star ? rand(-2, 2) : rand(-3, 3),
        life: Math.min(1.6, this.H / vy) * rand(0.75, 1),
        frame: star ? SPRITE.STAR : SPRITE.SPARKLE,
        r: (star ? 0 : 0.8) + c[0] * k,
        g: (star ? 0 : 0.8) + c[1] * k,
        b: (star ? 0 : 0.8) + c[2] * k,
        a: 1,
        twinkle: star ? 0 : 20,
        fadeIn: 0.05,
        curve: 'inout',
      });
      p.beam = this;
      p.off = off;
      p.a0 = 1;
      p.onUpdate = ride;
    }
    // a few sparks spraying from the nose
    if (Math.random() < dt * 14 * this.amount) {
      const a = rand(-1.2, 1.2);
      const sp = rand(2, 4);
      const c = BANDS[(Math.random() * 6) | 0];
      g.add({ x, y, z: 0.5, vx: Math.sin(a) * sp, vy: Math.cos(a) * sp * 0.6, drag: 2.5, gravity: 3, size: rand(0.06, 0.1), life: rand(0.3, 0.5), frame: SPRITE.DOT, r: 1 + c[0] * 2, g: 1 + c[1] * 2, b: 1 + c[2] * 2 });
    }
  }

  // FIRE!: a big flash at the nose and a fountain of stars up the beam.
  volleyBurst(ctx) {
    const g = this.sys.glow;
    const m = ctx.muzzle;
    g.add({ x: m.x, y: m.y + 0.3, z: 0.6, size: 3.5, grow: 0.4, life: 0.3, frame: SPRITE.GLOW, r: 2.4, g: 2.2, b: 2.4, a: 0.8 });
    g.add({ x: m.x, y: m.y + 0.3, z: 0.6, size: 1, grow: 4, life: 0.4, frame: SPRITE.RING, r: 1.8, g: 1.6, b: 2, a: 0.7 });
    for (let i = 0; i < 24 * this.amount; i++) {
      const a = rand(-0.5, 0.5);
      const sp = rand(6, 13);
      const c = BANDS[i % 6];
      g.add({ x: m.x, y: m.y + 0.4, z: 0.6, vx: Math.sin(a) * sp, vy: Math.cos(a) * sp, drag: 1.2, gravity: 2, size: rand(0.3, 0.5), rot: rand(0, 6), spin: rand(-4, 4), life: rand(0.8, 1.2), frame: SPRITE.STAR, r: 0.8 + c[0] * 2, g: 0.8 + c[1] * 2, b: 0.8 + c[2] * 2, twinkle: 25 });
    }
    this.sys.audio?.shimmer(1.4);
    ctx.rocket.kick(0.8);
  }

  // A soft, shimmering hum under the beam, with little sparkle bells.
  sing(dt, ctx) {
    const a = this.sys.audio;
    if (!a || !a.ready()) {
      this.stopHum();
      return;
    }
    const pan = this.sys.app?.panFor?.(this.baseX) ?? 0;
    if (!this.hum) this.startHum(a, pan);
    const h = this.hum;
    const now = a.ctx.currentTime;
    h.gain.gain.setTargetAtTime(this.level * (0.028 + 0.012 * this.superK), now, 0.05);
    h.out.pan.setTargetAtTime(clamp(pan, -0.8, 0.8), now, 0.1);
    this.bellT -= dt;
    if (this.bellT <= 0 && this.level > 0.6) {
      this.bellT = rand(0.14, 0.3);
      a.bell(NOTES[(Math.random() * NOTES.length) | 0], now, 0.012 + 0.006 * this.superK, h.out, 0.3);
    }
  }

  startHum(a, pan) {
    const ctx = a.ctx;
    const out = a.out(pan, 0.5);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(out);
    // a soft open fifth with slow tremolo and a touch of chorus
    const trem = ctx.createGain();
    trem.gain.value = 0.7;
    trem.connect(gain);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.value = 0.3;
    lfo.connect(depth).connect(trem.gain);
    const oscs = [lfo];
    for (const [f, amp] of [
      [523.25, 0.5],
      [526, 0.3],
      [783.99, 0.35],
      [1046.5, 0.15],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = amp;
      o.connect(g).connect(trem);
      oscs.push(o);
    }
    for (const o of oscs) o.start();
    this.hum = { out, gain, oscs };
  }

  stopHum() {
    const h = this.hum;
    if (!h) return;
    this.hum = null;
    const ctx = this.sys.audio.ctx;
    const now = ctx.currentTime;
    h.gain.gain.cancelScheduledValues(now);
    h.gain.gain.setTargetAtTime(0, now, 0.05);
    for (const o of h.oscs) o.stop(now + 0.4);
    setTimeout(() => h.out.disconnect(), 600);
  }

  clear() {
    this.hold = 0;
    this.level = 0;
    this.reach = 0;
    this.superT = 0;
    this.queueE.length = 0;
    this.queueT.length = 0;
    this.mesh.visible = false;
    this.stars.clear();
    this.stopHum();
  }

  dispose() {
    this.clear();
    this.stars.mesh.removeFromParent();
    this.stars.geometry.dispose();
    this.stars.material.dispose();
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
