// Bubble Blaster: big wobbly soap bubbles with a swirling thin-film rainbow
// skin. They float up in a gentle spread, bounce off the sides and the top
// of the sky, pop a couple of toys each and then burst with a spray of
// droplets and a soft pop.
import * as THREE from 'three';
import { SPRITE } from '../textures.js';
import { rand } from '../config.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const TAU = Math.PI * 2;
const CAP = 48;
const WHITE = new THREE.Color(1, 1, 1);
// soap-film tints for the pop spray (linear, bright)
const FILM = [
  [1.9, 0.9, 2.2],
  [0.8, 2.1, 2.2],
  [2.3, 1.9, 0.7],
  [1, 2.2, 1.1],
  [2.3, 1.1, 1.5],
];

const vertexShader = /* glsl */ `
attribute vec4 aBub; // phase, jiggle, fade, hue shift
uniform float uTime;
varying vec3 vN;
varying vec3 vView;
varying vec3 vLocal;
varying vec4 vBub;
void main() {
  vec3 p = position;
  float ph = aBub.x;
  // a soap bubble never holds still: slow low-order wobbles, plus a
  // quick jelly ring after every bounce
  float w = sin(p.y * 2.6 + uTime * 4.3 + ph) * 0.035
          + sin(p.x * 2.2 - uTime * 3.7 + ph * 1.7) * 0.03
          + sin(p.z * 2.9 + uTime * 3.1 + ph * 2.3) * 0.02;
  w += aBub.y * sin(p.y * 3.0 + p.x * 1.5 + uTime * 22.0 + ph) * 0.13;
  p += normal * w;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vView = cameraPosition - wp.xyz;
  vLocal = position;
  vBub = aBub;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// Thin-film interference: the reflected colour of a soap film of thickness
// d (nm) is sin^2(2 pi n d / lambda) per wavelength. The film swirls, drains
// thinner towards the top, and shifts with viewing angle. Output is
// premultiplied so the highlights can glow while the body stays clear.
const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uKey;
uniform vec3 uSun;
varying vec3 vN;
varying vec3 vView;
varying vec3 vLocal;
varying vec4 vBub;
vec3 film(float d) {
  vec3 s = sin(6.2831853 * 1.33 * d / vec3(650.0, 530.0, 450.0));
  return s * s;
}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.2);
  float ph = vBub.x;
  vec3 q = vLocal;
  float swirl = sin(q.x * 3.1 + sin(q.y * 4.3 + uTime * 1.1 + ph) * 1.6 + uTime * 0.7)
              + 0.7 * sin(q.z * 3.7 - q.y * 2.0 - uTime * 0.9 + ph * 1.3);
  float d = 380.0 + 140.0 * swirl - 160.0 * q.y + vBub.w * 120.0;
  d *= mix(1.0, 0.78, 1.0 - ndv);
  vec3 f = film(d);
  float l = dot(f, vec3(0.3333));
  f = max(mix(vec3(l), f, 1.7), 0.0);
  vec3 r = reflect(-v, n);
  vec3 env = mix(uGround, uSky, smoothstep(-0.4, 0.5, r.y));
  // the key light is a soft-box: a rounded window reflected in the film
  float kd = max(dot(r, uKey), 0.0);
  vec3 kx = normalize(cross(vec3(0.0, 1.0, 0.0), uKey));
  vec3 ky = cross(uKey, kx);
  vec2 kp = vec2(dot(r, kx), dot(r, ky)) / max(kd, 0.05);
  vec2 kq = max(abs(kp) - vec2(0.1, 0.14), 0.0);
  float key = smoothstep(0.1, 0.05, length(kq)) * step(0.3, kd);
  float keySoft = pow(kd, 14.0);
  float fill = smoothstep(0.955, 0.985, max(dot(r, normalize(vec3(0.55, -0.5, 0.67))), 0.0));
  float sun = pow(max(dot(r, uSun), 0.0), 40.0);
  float fade = vBub.z;
  // the film only tints where it reflects: dark bands stay see-through
  float a = (0.035 + 0.92 * fres) * (0.7 + 0.3 * l) * fade;
  vec3 col = f * (0.3 + 1.6 * fres) * (0.65 + 0.55 * env);
  vec3 spec = vec3(1.0, 0.99, 0.96) * (key * 1.9 + keySoft * 0.035 + fill * 0.7 + sun * 0.6 * fres) * fade;
  gl_FragColor = vec4(col * a + spec, a + clamp(key + fill * 0.6, 0.0, 1.0) * 0.6 * fade);
}`;

export class Bubbles {
  constructor(sys) {
    this.sys = sys;
    this.list = [];
    this.flip = 1;
    this.lastPop = 0;
    this.lastShot = 0;
    this.amount = sys.app?.quality?.debris ?? 1;
    const geo = new THREE.SphereGeometry(1, 40, 28);
    this.state = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    this.state.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aBub', this.state);
    this.uniforms = {
      uTime: { value: 0 },
      uSky: { value: new THREE.Color(0.75, 0.87, 1) },
      uGround: { value: new THREE.Color(0.95, 0.93, 0.9) },
      uKey: { value: new THREE.Vector3(-0.42, 0.62, 0.66).normalize() },
      uSun: { value: new THREE.Vector3(0.5, 0.42, -0.75).normalize() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 9;
    sys.scene.add(this.mesh);
  }

  interval(mega) {
    return mega ? 0.3 : 0.34;
  }

  fire(ctx, { mega = false, volley = false } = {}) {
    const m = ctx.muzzle;
    const big = mega || volley;
    const R = big ? 0.6 : 0.44;
    const pops = big ? 3 : 2;
    const spread = volley ? 9 : mega ? 3 : 2;
    this.flip = -this.flip;
    for (let i = 0; i < spread; i++) {
      // fan the bubbles out: two in a V, three for MEGA, a big fan for FIRE!
      const k = spread === 1 ? 0 : i / (spread - 1) - 0.5;
      const a = k * (volley ? 2.5 : mega ? 1.3 : 0.85) + this.flip * 0.07 + rand(-0.1, 0.1);
      const sp = volley ? rand(7, 10) : rand(6.2, 7.6);
      this.spawn(m.x + Math.sin(a) * 0.25, m.y + 0.15, Math.sin(a) * sp, Math.cos(a) * sp, R * rand(0.9, 1.1), pops, ctx, volley ? i * 0.03 : 0, volley ? CAP : mega ? 30 : 20);
    }
    const g = this.sys.glow;
    g.add({ x: m.x, y: m.y + 0.15, z: 0.4, size: 0.5, grow: 2, life: 0.18, frame: SPRITE.RING, r: 1, g: 1.4, b: 1.8, a: 0.6 });
    g.add({ x: m.x, y: m.y + 0.1, z: 0.4, size: 0.8, life: 0.1, frame: SPRITE.GLOW, r: 1.2, g: 1.4, b: 1.8, a: 0.5 });
    if (ctx.time - this.lastShot > 0.1) {
      this.lastShot = ctx.time;
      this.sys.audio?.bloop(this.sys.app?.panFor?.(m.x) ?? 0);
    }
    ctx.rocket.kick(volley ? 0.9 : 0.35);
  }

  spawn(x, y, vx, vy, R, pops, ctx, delay, cap) {
    // too many afloat: the oldest one pops to make room
    if (this.list.length >= cap) this.burst(this.list.shift(), true);
    this.list.push({
      id: ctx.nextShot(),
      x,
      y,
      vx,
      vy,
      R,
      pops,
      age: -delay,
      life: rand(2.9, 3.6),
      jig: 0.6,
      phase: rand(0, TAU),
      hue: rand(-1, 1),
      spin: rand(-0.6, 0.6),
      bossCool: 0,
    });
  }

  update(dt, t, ctx) {
    this.uniforms.uTime.value = t;
    const L = this.sys.app?.world?.light;
    if (L) {
      this.uniforms.uSky.value.copy(L.skyColor).lerp(WHITE, 0.3);
      this.uniforms.uGround.value.copy(L.groundColor);
      if (L.sunDir) this.uniforms.uSun.value.copy(L.sunDir).normalize();
    }
    const b = ctx.bounds;
    const drag = Math.exp(-dt * 0.35);
    let n = 0;
    let k = 0;
    for (let i = 0; i < this.list.length; i++) {
      const bb = this.list[i];
      bb.age += dt;
      if (bb.age < 0) {
        this.list[n++] = bb;
        continue;
      }
      // float: a little drag, gentle buoyancy and a lazy side-to-side wander
      bb.vx *= drag;
      bb.vy *= drag;
      bb.vy += 1.1 * dt;
      bb.vx += Math.sin(t * 1.7 + bb.phase) * 0.9 * dt;
      // aim help: drift towards the nearest toy close by
      if (ctx.assist > 0) {
        let best = null;
        let bd = 20;
        for (const e of ctx.enemies) {
          if (!e.alive || e.y > b.maxY) continue;
          const dx = e.x - bb.x;
          const dy = e.y - bb.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bd) {
            bd = d2;
            best = e;
          }
        }
        if (best) {
          const d = Math.sqrt(bd) || 1;
          bb.vx += ((best.x - bb.x) / d) * 5 * ctx.assist * dt;
          bb.vy += ((best.y - bb.y) / d) * 5 * ctx.assist * dt;
        }
      }
      bb.x += bb.vx * dt;
      bb.y += bb.vy * dt;
      bb.jig *= Math.exp(-dt * 3.5);
      const R = bb.R;
      // bounce off the walls and the top of the sky
      if (bb.x < b.minX + R) {
        bb.x = b.minX + R;
        bb.vx = Math.abs(bb.vx) * 0.9;
        this.boing(bb);
      } else if (bb.x > b.maxX - R) {
        bb.x = b.maxX - R;
        bb.vx = -Math.abs(bb.vx) * 0.9;
        this.boing(bb);
      }
      if (bb.y > b.maxY - R) {
        bb.y = b.maxY - R;
        bb.vy = -Math.abs(bb.vy) * 0.75 - 0.4;
        this.boing(bb);
      } else if (bb.y < b.minY + R) {
        bb.y = b.minY + R;
        bb.vy = Math.abs(bb.vy);
      }
      // pop whatever it touches, bouncing off each one (the boss gets
      // boinged too, but only once per bounce)
      bb.bossCool -= dt;
      for (const e of ctx.enemies) {
        if (!e.alive || (e.boss && bb.bossCool > 0)) continue;
        const dx = bb.x - e.x;
        const dy = bb.y - e.y;
        const r = R + 0.45 * e.size + 0.2;
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        const d = Math.sqrt(d2) || 1;
        const nx = dx / d;
        const ny = dy / d;
        ctx.hit(e, e.x + nx * e.size * 0.45, e.y + ny * e.size * 0.45, { weapon: 'bubble', shot: bb.id });
        bb.pops--;
        if (bb.pops <= 0) break;
        const vn = bb.vx * nx + bb.vy * ny;
        if (vn < 0) {
          bb.vx -= 1.7 * vn * nx;
          bb.vy -= 1.7 * vn * ny;
        }
        if (e.boss) bb.bossCool = 0.35;
        this.boing(bb);
      }
      if (bb.pops <= 0 || bb.age > bb.life) {
        this.burst(bb, true);
        continue;
      }
      // draw: grow in with a springy overshoot, fade in the last moments
      const g = bb.age < 0.35 ? 1 + Math.sin(bb.age * 18) * Math.exp(-bb.age * 9) * 0.35 - Math.exp(-bb.age * 22) * 0.75 : 1;
      const s = R * g;
      tmpQ.set(0, 0, Math.sin(bb.spin * bb.age * 0.5), Math.cos(bb.spin * bb.age * 0.5));
      tmpS.set(s, s, s);
      tmpP.set(bb.x, bb.y, 0.3);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(k, tmpM);
      const left = bb.life - bb.age;
      this.state.setXYZW(k, bb.phase, Math.min(1, bb.jig), Math.min(1, bb.age * 6, 0.35 + left * 1.5), bb.hue);
      k++;
      this.list[n++] = bb;
    }
    this.list.length = n;
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.state.needsUpdate = true;
  }

  boing(bb) {
    bb.jig = Math.min(1.2, bb.jig + 0.8);
  }

  // Pop: a flash of the film ring, a spray of droplets and sparkles.
  burst(bb, sound) {
    const g = this.sys.glow;
    const { x, y, R } = bb;
    if (bb.age < 0) return;
    g.add({ x, y, z: 0.5, size: R * 2.1, grow: 0.8, life: 0.12, frame: SPRITE.RING, r: 1, g: 1.2, b: 1.5, a: 0.6 });
    g.add({ x, y, z: 0.5, size: R * 2.4, life: 0.1, frame: SPRITE.GLOW, r: 0.9, g: 1, b: 1.2, a: 0.35 });
    const nd = Math.round(12 * this.amount);
    for (let i = 0; i < nd; i++) {
      const a = rand(0, TAU);
      const sp = rand(2.5, 5.5);
      const c = FILM[i % FILM.length];
      g.add({ x: x + Math.cos(a) * R * 0.8, y: y + Math.sin(a) * R * 0.8, z: 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.5, drag: 3, gravity: 7, size: rand(0.06, 0.11), life: rand(0.3, 0.5), frame: SPRITE.DOT, r: c[0], g: c[1], b: c[2], a: 1 });
    }
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU);
      const c = FILM[(i * 2 + 1) % FILM.length];
      g.add({ x: x + Math.cos(a) * R, y: y + Math.sin(a) * R, z: 0.7, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, drag: 2, size: rand(0.3, 0.45), rot: rand(0, TAU), spin: rand(-3, 3), life: rand(0.25, 0.4), frame: SPRITE.SPARKLE, r: c[0], g: c[1], b: c[2], a: 1 });
    }
    const a = this.sys.audio;
    if (sound && a && this.sys.app) {
      const now = this.sys.app.time;
      if (now - this.lastPop > 0.035) {
        this.lastPop = now;
        a.bubblePop(this.sys.app.panFor(x));
      }
    }
  }

  clear() {
    this.list.length = 0;
    this.mesh.count = 0;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
