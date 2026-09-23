// Rockets: chunky little white-and-red toy rockets (tiny cousins of the
// player's own) that pop out to the sides, curve smoothly onto the nearest
// toy on a trail of soft smoke, and go off with a blast that also pops every
// toy close by. With nothing to chase they simply fly straight up.
import * as THREE from 'three';
import { SPRITE } from '../textures.js';
import { mergeGeometries, clean } from '../geometry.js';
import { rand, clamp } from '../config.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpR = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const SPLASH = 1.4; // blast radius in cells
const CAP = 64;
const WHITE = new THREE.Color(1, 1, 1);
const SPARK_COLORS = [
  [3, 1.6, 0.4],
  [3, 2.4, 0.9],
  [2.6, 1, 0.3],
];

// Fresh exhaust smoke glows warm from the flame, then cools to soft white
// lit by the world's sky.
function smokeTint(p) {
  const k = Math.min(1, p.age / (p.life * 0.25));
  const s = p.shade;
  const c = p.tint;
  p.r = s * (1 + (c.r - 1) * k);
  p.g = s * (0.8 + (c.g - 0.8) * k);
  p.b = s * (0.56 + (c.b - 0.56) * k);
}

function painted(g, hex) {
  const c = new THREE.Color(hex);
  const out = clean(g);
  const n = out.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

// One merged, vertex-coloured toy rocket about 0.9 units long, nose up (+y).
function toyRocketGeometry() {
  const lathe = (pts, hex, seg = 24) => painted(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), hex);
  const parts = [
    // red tail band
    lathe(
      [
        [0.001, -0.36],
        [0.11, -0.36],
        [0.145, -0.33],
        [0.162, -0.26],
        [0.165, -0.22],
      ],
      '#e3262c',
    ),
    // white body
    lathe(
      [
        [0.165, -0.22],
        [0.168, -0.08],
        [0.166, 0.08],
        [0.157, 0.19],
      ],
      '#f5f5f7',
    ),
    // red nose cone
    lathe(
      [
        [0.157, 0.19],
        [0.145, 0.26],
        [0.115, 0.34],
        [0.07, 0.41],
        [0.03, 0.445],
        [0.001, 0.455],
      ],
      '#e3262c',
    ),
    // dark metal nozzle
    lathe(
      [
        [0.07, -0.35],
        [0.085, -0.39],
        [0.115, -0.44],
        [0.1, -0.445],
        [0.07, -0.41],
        [0.055, -0.37],
      ],
      '#3a3d45',
      16,
    ),
  ];
  // four swept fins
  const fin = new THREE.Shape();
  fin.moveTo(0.12, -0.05);
  fin.bezierCurveTo(0.2, -0.14, 0.27, -0.24, 0.29, -0.4);
  fin.quadraticCurveTo(0.295, -0.47, 0.25, -0.455);
  fin.lineTo(0.12, -0.34);
  fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 2, curveSegments: 8 });
  finGeo.translate(0, 0, -0.015);
  finGeo.computeVertexNormals();
  for (let k = 0; k < 4; k++) {
    const g = finGeo.clone();
    g.rotateY((k / 4) * TAU + Math.PI / 4);
    parts.push(painted(g, '#e3262c'));
  }
  // a little blue porthole with a pale rim, like the big rocket's
  const port = new THREE.SphereGeometry(0.058, 16, 10);
  port.scale(1, 1, 0.45);
  port.translate(0, 0.03, 0.158);
  parts.push(painted(port, '#3f9cff'));
  const rim = new THREE.TorusGeometry(0.062, 0.014, 8, 20);
  rim.translate(0, 0.03, 0.16);
  parts.push(painted(rim, '#dfe4ea'));
  return mergeGeometries(parts);
}

export class Missiles {
  constructor(sys) {
    this.sys = sys;
    this.list = [];
    this.pending = []; // splash hits waiting for the blast wave to reach them
    this.side = 1;
    this.lastSound = 0;
    this.amount = sys.app?.quality?.debris ?? 1;
    this.tint = new THREE.Color(0.93, 0.94, 0.97);
    const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.07 });
    this.mesh = new THREE.InstancedMesh(toyRocketGeometry(), mat, CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    sys.scene.add(this.mesh);
  }

  interval(mega) {
    return mega ? 0.34 : 0.42;
  }

  fire(ctx, { mega = false, volley = false } = {}) {
    const r = ctx.rocket.pos;
    const size = mega || volley ? 1.4 : 1.25;
    const launch = (side, ang, speed, delay = 0, out = 0) => {
      if (this.list.length >= CAP) return;
      const x = r.x + side * (0.72 + out);
      const y = r.y + 0.75 - out * 0.8;
      this.list.push({
        id: ctx.nextShot(),
        x,
        y,
        ang,
        speed,
        vx: Math.sin(ang) * speed,
        vy: Math.cos(ang) * speed,
        age: -delay,
        roll: rand(0, TAU),
        spin: side * rand(5, 8),
        size,
        splash: mega || volley ? SPLASH + 0.35 : SPLASH,
        target: this.pickTarget(ctx, x, y, side * 1.5, null),
        emit: 0,
        wait: delay,
      });
      if (!delay) this.flash(x, y + 0.1, size);
    };
    if (volley) {
      // a celebration fan: rockets spray out both sides and each finds its own toy
      const n = mega ? 12 : 8;
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const k = Math.floor(i / 2) / (n / 2 - 1 || 1);
        launch(side, side * (0.2 + k * 1.1), rand(5, 6.5), Math.floor(i / 2) * 0.06, k * 0.5);
      }
      this.sys.audio?.whoosh(0);
      setTimeout(() => this.sys.audio?.whoosh(0), 120);
      ctx.rocket.kick(1.2);
    } else if (mega) {
      launch(-1, -0.95, 5);
      launch(1, 0.95, 5);
      launch(this.side, this.side * 0.3, 6.5, 0.06);
      this.side = -this.side;
      this.whoosh(ctx);
      ctx.rocket.kick(0.8);
    } else {
      launch(this.side, this.side * 0.85, 5);
      this.side = -this.side;
      this.whoosh(ctx);
      ctx.rocket.kick(0.5);
    }
  }

  whoosh(ctx) {
    const a = this.sys.audio;
    if (!a || ctx.time - this.lastSound < 0.1) return;
    this.lastSound = ctx.time;
    a.whoosh(this.sys.app?.panFor?.(ctx.rocket.pos.x) ?? 0);
  }

  flash(x, y, size) {
    const g = this.sys.glow;
    g.add({ x, y, z: 0.4, size: 0.9 * size, life: 0.12, frame: SPRITE.GLOW, r: 2.4, g: 1.5, b: 0.5, a: 0.8 });
    for (let i = 0; i < 3; i++) {
      this.sys.smoke.add({ x: x + rand(-0.15, 0.15), y: y - 0.2, z: -0.15, vx: rand(-1, 1), vy: rand(-1.5, -0.5), drag: 3, size: rand(0.3, 0.45), grow: 1.8, rot: rand(0, TAU), spin: rand(-1, 1), life: rand(0.5, 0.8), frame: i % 2 ? SPRITE.PUFF : SPRITE.PUFF2, shade: 0.97, tint: this.tint, r: 1, g: 0.8, b: 0.56, a: 0.45, fadeIn: 0.03, onUpdate: smokeTint });
    }
  }

  // The nearest visible toy ahead, preferring ones no other rocket is after.
  pickTarget(ctx, x, y, bias, self) {
    const top = ctx.bounds.maxY + 0.3;
    let best = null;
    let bs = Infinity;
    for (const e of ctx.enemies) {
      if (!e.alive || e.y > top || e.y < y - 1.2) continue;
      const dx = e.x - (x + bias);
      const dy = (e.y - y) * 0.8;
      let s = dx * dx + dy * dy;
      if (!e.boss) for (const m of this.list) if (m !== self && m.target === e) s += 25;
      if (s < bs) {
        bs = s;
        best = e;
      }
    }
    return best;
  }

  update(dt, t, ctx) {
    this.flushPending(t, ctx);
    const L = this.sys.app?.world?.light;
    if (L) this.tint.copy(L.skyColor).lerp(WHITE, 0.7);
    const b = ctx.bounds;
    const glow = this.sys.glow;
    const smoke = this.sys.smoke;
    // keep the smoke budget in check when the sky is full of rockets: fewer,
    // bigger puffs per rocket
    const crowd = Math.max(1, this.list.length / 8);
    const step = (0.014 * crowd) / Math.max(0.5, this.amount);
    const puff = Math.min(1.5, Math.sqrt(crowd));
    let n = 0;
    let k = 0;
    for (let i = 0; i < this.list.length; i++) {
      const m = this.list[i];
      m.age += dt;
      if (m.age < 0) {
        this.list[n++] = m; // a staggered volley rocket still waiting
        continue;
      }
      if (m.wait) {
        m.wait = 0;
        this.flash(m.x, m.y + 0.1, m.size);
      }
      // steer: a short straight launch, then a smooth curve onto the target
      if (m.age > 0.12) {
        if (!m.target || !m.target.alive) m.target = this.pickTarget(ctx, m.x, m.y, 0, m);
        let want = 0;
        if (m.target) want = Math.atan2(m.target.x - m.x, m.target.y - m.y);
        let d = want - m.ang;
        d -= Math.round(d / TAU) * TAU;
        const rate = (m.target ? 2 + 4.5 * ctx.assist : 2.6) * (1 + Math.min(2, (m.age - 0.12) * 1.2));
        m.ang += clamp(d, -rate * dt, rate * dt);
      }
      m.speed = Math.min(11.5, m.speed + 17 * dt);
      m.vx = Math.sin(m.ang) * m.speed;
      m.vy = Math.cos(m.ang) * m.speed;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.roll += m.spin * dt;

      // touch anything and go boom
      let boom = null;
      for (const e of ctx.enemies) {
        if (!e.alive) continue;
        const r = 0.42 * m.size + 0.5 * e.size;
        const dx = e.x - m.x;
        const dy = e.y - m.y;
        if (dx * dx + dy * dy < r * r) {
          boom = e;
          break;
        }
      }
      if (boom) {
        this.explode(m, boom, ctx, t);
        continue;
      }
      if (m.y > b.maxY + 1.5 || m.y < b.minY - 1.5 || m.x < b.minX - 1.5 || m.x > b.maxX + 1.5 || m.age > 5) continue;

      // draw: point along the flight path and roll about the long axis
      const s = m.size;
      tmpQ.setFromAxisAngle(Z, -m.ang);
      tmpR.setFromAxisAngle(Y, m.roll);
      tmpQ.multiply(tmpR);
      tmpS.set(s, s, s);
      tmpP.set(m.x, m.y, 0.25);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(k++, tmpM);
      this.list[n++] = m;

      // exhaust: a short flame, a warm glow, sparks and a soft smoke trail
      const fx = Math.sin(m.ang);
      const fy = Math.cos(m.ang);
      const nx = m.x - fx * 0.47 * s;
      const ny = m.y - fy * 0.47 * s;
      const flick = 0.85 + 0.3 * Math.random();
      glow.add({ x: nx - fx * 0.28 * s, y: ny - fy * 0.28 * s, z: 0.3, vx: fx * 0.001, vy: fy * 0.001, size: 0.55 * s * flick, w: 1, h: 0.5, align: true, life: 0, frame: SPRITE.STREAK, r: 2.8, g: 1.5, b: 0.35, a: 0.95 });
      glow.add({ x: nx - fx * 0.05, y: ny - fy * 0.05, z: 0.35, size: 0.3 * s, life: 0, frame: SPRITE.DOT, r: 3.2, g: 2.7, b: 1.6, a: 0.9 });
      glow.add({ x: nx, y: ny, z: 0.2, size: 0.85 * s * flick, life: 0, frame: SPRITE.GLOW, r: 1.5, g: 0.65, b: 0.15, a: 0.45 });
      if (Math.random() < 0.3) {
        const c = SPARK_COLORS[(Math.random() * 3) | 0];
        glow.add({ x: nx, y: ny, z: 0.3, vx: -fx * rand(2, 4) + rand(-1, 1), vy: -fy * rand(2, 4) + rand(-1, 1), drag: 2, size: rand(0.05, 0.09), life: rand(0.2, 0.35), frame: SPRITE.DOT, r: c[0], g: c[1], b: c[2] });
      }
      m.emit += dt;
      while (m.emit >= step) {
        m.emit -= step;
        const back = m.emit; // spread puffs evenly along this frame's path
        smoke.add({
          x: nx - m.vx * back - fx * 0.12 + rand(-0.04, 0.04),
          y: ny - m.vy * back - fy * 0.12 + rand(-0.04, 0.04),
          z: rand(-0.2, -0.05),
          vx: -fx * 0.8 + rand(-0.25, 0.25),
          vy: -fy * 0.8 + rand(-0.25, 0.25) + 0.15,
          drag: 2.2,
          size: rand(0.22, 0.3) * s * puff,
          grow: rand(2.2, 3),
          rot: rand(0, TAU),
          spin: rand(-1.2, 1.2),
          life: rand(0.7, 1.05),
          frame: Math.random() < 0.5 ? SPRITE.PUFF : SPRITE.PUFF2,
          shade: rand(0.86, 1),
          tint: this.tint,
          r: 1,
          g: 0.8,
          b: 0.56,
          a: 0.42,
          fadeIn: 0.07,
          onUpdate: smokeTint,
        });
      }
    }
    this.list.length = n;
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // The blast: the toy it touched pops at once, and a wave rolls out popping
  // everything within the splash radius a few hundredths of a second apart.
  explode(m, direct, ctx, t) {
    ctx.hit(direct, m.x, m.y, { weapon: 'rocket', shot: m.id });
    // the blast is centred on the toy it struck (a boss is too big for that)
    const x = direct.boss ? m.x : direct.x;
    const y = direct.boss ? m.y : direct.y;
    if (direct.boss) {
      // a rocket is a big hit: the boss feels it three times
      this.pending.push({ e: direct, t: t + 0.09, shot: m.id, boss: true }, { e: direct, t: t + 0.18, shot: m.id, boss: true });
    }
    for (const e of ctx.enemies) {
      if (!e.alive || e === direct) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const r = m.splash + (e.boss ? 0.5 : 0.2) * e.size;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) this.pending.push({ e, t: t + 0.03 + Math.sqrt(d2) * 0.05, shot: m.id });
    }
    // our own flourish (the hit brings the big flash): a shock ring the size
    // of the splash, sparks and a billow of soft smoke
    const g = this.sys.glow;
    const R = m.splash;
    g.add({ x, y, z: 0.8, size: 0.7, grow: (R * 2.3) / 0.7 - 1, life: 0.3, frame: SPRITE.RING, r: 2.2, g: 1.5, b: 0.7, a: 0.75 });
    const ns = Math.round(10 * this.amount);
    for (let i = 0; i < ns; i++) {
      const a = rand(0, TAU);
      const sp = rand(5, 9);
      const c = SPARK_COLORS[i % 3];
      g.add({ x, y, z: 0.9, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, gravity: 4, size: rand(0.08, 0.14), life: rand(0.3, 0.5), frame: SPRITE.DOT, r: c[0], g: c[1], b: c[2] });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + rand(-0.3, 0.3);
      const sp = rand(1.5, 2.6);
      const sh = rand(0.9, 1);
      this.sys.smoke.add({ x: x + Math.cos(a) * 0.2, y: y + Math.sin(a) * 0.2, z: -0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.3, drag: 2.6, size: rand(0.5, 0.75), grow: 1.8, rot: rand(0, TAU), spin: rand(-0.8, 0.8), life: rand(0.7, 1.1), frame: i % 2 ? SPRITE.PUFF : SPRITE.PUFF2, shade: sh, tint: this.tint, r: 1, g: 0.8, b: 0.56, a: 0.42, fadeIn: 0.04, onUpdate: smokeTint });
    }
  }

  flushPending(t, ctx) {
    const list = this.pending;
    if (!list.length) return;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (t < p.t) {
        list[n++] = p;
        continue;
      }
      const e = p.e;
      if (!e.alive) continue;
      const x = p.boss ? e.x + rand(-0.6, 0.6) : e.x;
      const y = p.boss ? e.y - e.size * 0.3 + rand(-0.4, 0.4) : e.y;
      ctx.hit(e, x, y, { weapon: 'rocket', shot: p.shot });
    }
    list.length = n;
  }

  clear() {
    this.list.length = 0;
    this.pending.length = 0;
    this.mesh.count = 0;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
