// Soap bubbles: big, glossy and rainbow-skinned. A stream is blown from the
// child's side of the garden and drifts up and over the lawn on the breeze,
// sinking very slowly, until it is popped (by a touch, or by a friend
// jumping at it) or pops by itself. Popping is a tiny flurry of sparkles and
// a soft pop, lower for a bigger bubble.
//
// The look is a thin film drawn in the fragment shader: a rainbow of
// interference colours that swirl and drain towards the bottom of the
// bubble, the sky (the same sky as the scene) mirrored in the front surface
// and again, upside down and dimmer, in the back one, and a bright window
// glint. The middle stays clear, so it is only the rim that is seen, like a
// real bubble. One instanced draw for the lot.
import * as THREE from 'three';
import { SKY_GLSL } from '../world/sky.js';
import { rand, clamp, REDUCED_MOTION } from '../config.js';

const MAX = 26;
const PASTEL = [[1.7, 0.9, 1.5], [0.9, 1.5, 1.9], [1.6, 1.7, 0.9], [1.2, 1.9, 1.3]];
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();

const VERT = /* glsl */ `
attribute vec4 aSeed; // seed, film thickness, pop (0..1), unused
varying vec3 vN;
varying vec3 vP;
varying vec4 vSeed;
void main() {
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(instanceMatrix) * normal);
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vN;
varying vec3 vP;
varying vec4 vSeed;
${SKY_GLSL}
// what a bubble sees in a direction: the sky and clouds, and the warm lawn below
vec3 seen(vec3 d) {
  vec3 c = skyBase(d);
  vec4 cl = skyClouds(d);
  c = mix(c, cl.rgb, cl.a);
  c = mix(c, vec3(0.34, 0.42, 0.16), smoothstep(0.02, -0.28, d.y) * 0.85);
  return min(c, vec3(4.0));
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vP);
  float nv = dot(N, V);
  if (nv < 0.0) N = -N;
  float ndv = clamp(abs(nv), 0.0, 1.0);
  vec3 R = reflect(-V, N);
  // the back surface, seen through the front one: its normal, then what it mirrors
  vec3 Nb = normalize(N - 2.0 * ndv * V);
  vec3 Rb = reflect(-V, Nb);
  // the film swirls and drains: thicker towards the bottom, thinner at the top
  float dirn = vSeed.x > 0.5 ? 1.0 : -1.0;
  vec2 sw = N.xz * 1.7 + N.y * vec2(0.9, -1.3) + vec2(uTime * 0.13, -uTime * 0.09) * dirn + vSeed.x * 17.0;
  float n = skF(sw);
  float thick = 0.55 + (n - 0.5) * 1.1 - N.y * 0.3 + vSeed.y * 0.35;
  float cosT = sqrt(max(0.0, 1.0 - (1.0 - ndv * ndv) / 1.769));
  float opd = thick * cosT;
  vec3 film = 0.5 + 0.5 * cos(6.2831 * (opd * vec3(1.45, 1.75, 2.2) + vec3(0.0, 0.33, 0.67)));
  film = mix(vec3(0.85), film, 0.92);
  float F = 0.05 + 0.95 * pow(1.0 - ndv, 2.6);
  vec3 col = F * (seen(R) + 0.6 * seen(Rb)) * film;
  // a window glint where the light from the studio side lands, and the sun's
  vec3 key = normalize(vec3(-0.35, 0.6, 0.72));
  col += vec3(2.6, 2.5, 2.4) * smoothstep(0.978, 0.996, dot(R, key)) * (0.5 + 0.5 * F);
  col += vec3(1.2, 1.1, 1.0) * smoothstep(0.985, 0.998, dot(Rb, key)) * 0.5;
  // a trace of colour in the clear middle
  col += film * 0.03 * (1.0 - ndv);
  float a = clamp(dot(col, vec3(0.34)) * 0.62, 0.0, 0.92);
  a = max(a, 0.02 + 0.22 * F);
  float live = 1.0 - vSeed.z;
  gl_FragColor = vec4(col * live, a * live);
}`;

export class Bubbles {
  constructor(T) {
    this.T = T;
    const geo = new THREE.SphereGeometry(1, 24, 16);
    this.seed = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.seed.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSeed', this.seed);
    const sky = T.sky.uniforms;
    this.uniforms = { uTime: { value: 0 }, uSunDir: sky.uSunDir, uSkyTime: sky.uSkyTime, uCloudCover: sky.uCloudCover };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.b = [];
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.b.push({ on: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 0.08, age: 0, life: 8, seed: 0, thin: 0, pop: -1, byFriend: false });
    }
    T.scene.add(this.mesh);
    this.stream = 0; // bubbles still to blow
    this.streamT = 0;
    this.think = 0;
    this.cand = [];
  }

  get count() {
    let n = 0;
    for (const b of this.b) if (b.on && b.pop < 0) n++;
    return n;
  }

  // ------------------------------------------------------------ making them

  // the pool holds up to MAX; when it is full the oldest pops
  slot() {
    let free = null;
    let oldest = null;
    for (const b of this.b) {
      if (!b.on) {
        free = b;
        break;
      }
      if (b.pop < 0 && (!oldest || b.age > oldest.age)) oldest = b;
    }
    if (free) return free;
    if (oldest) this.pop(oldest, false, true);
    return null;
  }

  spawn(x, y, z, vx, vy, vz, r) {
    const b = this.slot();
    if (!b) return null;
    b.on = true;
    b.pos.set(x, y, z);
    b.vel.set(vx, vy, vz);
    b.r = r;
    b.age = 0;
    b.life = rand(6, 10);
    b.seed = Math.random();
    b.thin = Math.random();
    b.pop = -1;
    b.byFriend = false;
    return b;
  }

  // blow a stream from the child's side of the garden
  blow() {
    this.stream = Math.min(28, this.stream + (REDUCED_MOTION.matches ? 8 : 13));
    this.streamT = 0;
    this.T.snd.blow();
  }

  // one bubble from just in front of the camera, at the bottom of the screen
  blowOne() {
    const { T } = this;
    const cam = T.camera;
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const d = 1.1;
    const halfH = Math.tan((cam.fov * Math.PI) / 360) * d;
    const sx = rand(-0.28, 0.28);
    _v.copy(cam.position).addScaledVector(_f, d).addScaledVector(_u, -halfH * 0.95).addScaledVector(_r, halfH * cam.aspect * sx * 2);
    // keep them off the ground and up in front of the friends
    const fwd = rand(0.85, 1.25);
    const r = rand(0.05, 0.12);
    this.spawn(_v.x, Math.max(0.35, _v.y), _v.z, _f.x * fwd + _r.x * rand(-0.15, 0.15), rand(0.32, 0.6), _f.z * fwd + _r.z * rand(-0.15, 0.15), r);
  }

  // a few bubbles rising from a spot on the lawn
  puffAt(gp) {
    const { T } = this;
    const n = REDUCED_MOTION.matches ? 2 : 3;
    for (let i = 0; i < n; i++) this.spawn(gp.x + rand(-0.12, 0.12), 0.25 + rand(0, 0.15), gp.z + rand(-0.12, 0.12), rand(-0.1, 0.1), rand(0.28, 0.45), rand(-0.1, 0.1), rand(0.04, 0.09));
    T.snd.blow();
    return true;
  }

  // ------------------------------------------------------------ popping

  // the bubbles under the pointer at (x, y) px: pop up to `max`, the closest first; how many popped
  hit(x, y, max = 1) {
    const { T, cand } = this;
    cand.length = 0;
    for (const b of this.b) {
      if (!b.on || b.pop >= 0) continue;
      if (!T.project(b.pos)) continue;
      const rpx = b.r * T.pxPerM(T.camera.position.distanceTo(b.pos));
      const d = Math.hypot(x - T.px.x, y - T.px.y) - rpx;
      if (d < 26) {
        b.score = d;
        cand.push(b);
      }
    }
    if (!cand.length) return 0;
    cand.sort((p, q) => p.score - q.score);
    const n = Math.min(max, cand.length);
    for (let i = 0; i < n; i++) this.pop(cand[i]);
    return n;
  }

  pop(b, byFriend = false, quiet = false) {
    if (!b.on || b.pop >= 0) return;
    const { T } = this;
    b.pop = 0;
    b.byFriend = byFriend;
    if (quiet) return;
    const n = T.amount(13);
    T.fx.sparkles.burst(b.pos, n, { colors: PASTEL, speed: 0.5 + b.r * 2, size: 0.013, life: 0.75, up: 0, gravity: -0.35 });
    T.snd.pop(b.r * 2);
  }

  // ------------------------------------------------------------ the frame

  update(dt) {
    const { T } = this;
    this.uniforms.uTime.value = T.time;
    // a stream being blown
    if (this.stream > 0 && (this.streamT -= dt) <= 0) {
      this.blowOne();
      this.stream--;
      this.streamT = rand(0.13, 0.25);
    }
    const t = T.time;
    let any = false;
    for (let i = 0; i < MAX; i++) {
      const b = this.b[i];
      if (!b.on) continue;
      any = true;
      b.age += dt;
      let live = 0;
      if (b.pop >= 0) {
        b.pop += dt / 0.11;
        if (b.pop >= 1) {
          b.on = false;
          this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
          this.seed.setXYZW(i, 0, 0, 1, 0);
          continue;
        }
        live = 1 + 0.2 * b.pop;
      } else {
        // the breeze carries it; it sinks very slowly
        const p = b.pos;
        const wx = 0.06 + Math.sin(t * 0.37 + p.z * 0.9) * 0.07;
        const wz = -0.02 + Math.cos(t * 0.29 + p.x * 0.8) * 0.06;
        const kh = 1 - Math.exp(-0.5 * dt);
        const kv = 1 - Math.exp(-0.9 * dt);
        b.vel.x += (wx - b.vel.x) * kh;
        b.vel.z += (wz - b.vel.z) * kh;
        b.vel.y += (-0.05 - b.vel.y) * kv;
        p.addScaledVector(b.vel, dt);
        const floor = T.groundAt(p.x, p.z) + b.r;
        if (p.y < floor) {
          p.y = floor;
          this.pop(b, false);
        } else if (b.age > b.life) this.pop(b, false);
        live = 1;
      }
      // wobbles as it goes
      const a = b.age;
      const wob = REDUCED_MOTION.matches ? 0.02 : 0.055;
      _s.set(1 + wob * Math.sin(a * 5.3 + b.seed * 9), 1 + wob * Math.sin(a * 6.1 + b.seed * 5 + 1.3), 1 + wob * Math.sin(a * 4.7 + b.seed * 7 + 2.6)).multiplyScalar(b.r * live);
      _m.compose(b.pos, _q.identity(), _s);
      this.mesh.setMatrixAt(i, _m);
      this.seed.setXYZW(i, b.seed, b.thin, Math.max(0, b.pop), 0);
    }
    if (any || this.dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.seed.needsUpdate = true;
    }
    this.dirty = any;
    this.friendsPlay(dt);
  }

  // friends look up at bubbles, and one or two leap at a low one
  friendsPlay(dt) {
    if ((this.think -= dt) > 0) return;
    this.think = 0.45;
    const { T } = this;
    if (!this.count) return;
    let chasers = 0;
    for (const e of T.friends.list) if (e.toy === 'bubbles') chasers++;
    for (const e of T.friends.list) {
      if (e.leaving || e.state === 'journey' || e.state === 'hello' || e.friend.trick) continue;
      // the closest bubble to this friend
      let best = null;
      let bd = 3.4;
      for (const b of this.b) {
        if (!b.on || b.pop >= 0) continue;
        const d = Math.hypot(b.pos.x - e.pos.x, b.pos.z - e.pos.z);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      if (!best) continue;
      if (!e.toy) T.friends.lookAt(e, best.pos, 1.1);
      const reach = e.friend.restRadius * e.scale * 1.7 + 0.45;
      if (chasers < 2 && e.home === 'ground' && T.free(e) && e.state === 'idle' && best.pos.y < reach && bd > 0.35 && e.friend.walkSpeed > 0) {
        const ok = T.go(e, 'bubbles', best.pos, { pace: bd > 1.2 ? 'run' : 'walk', stopR: 0.1, onArrive: (en) => this.leap(en, best) });
        if (ok) chasers++;
      }
    }
  }

  // the friend is under the bubble: a hop and, if it is close, a pop
  leap(e, b) {
    const { T } = this;
    if (!T.mine(e, 'bubbles')) return;
    T.friends.emote(e, 'hop', 0.7);
    T.later(0.28, () => {
      if (b.on && b.pop < 0 && Math.hypot(b.pos.x - e.pos.x, b.pos.z - e.pos.z) < 0.9 && b.pos.y < e.friend.restRadius * e.scale * 1.7 + 0.5) {
        this.pop(b, true);
        T.friends.emote(e, 'giggle');
      }
      if (T.mine(e, 'bubbles')) {
        T.done(e);
        T.friends.release(e);
      }
    });
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
