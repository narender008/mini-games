// Fireflies for the night garden: soft yellow-green glows drifting slowly
// over the lawn and the bed, each blinking in its own calm rhythm. They are
// cheap: every glow is one point of a single Points draw (bright enough to
// bloom), and every tiny beetle is one instance of two instanced meshes.
// One spawn() brings one firefly; it rises out of the grass as night falls.
import * as THREE from 'three';
import { damp, smooth } from '../config.js';
import { ellipsoid, tube, merge, paint } from './geo.js';
import { VOLUME, LENS_CLEARANCE } from './flight.js';

const MAX = 60;
const GLOW = new THREE.Color(0.62, 1.0, 0.22); // ~565 nm, the colour of a firefly's lantern
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3(1, 1, 1);
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _size = new THREE.Vector2();

function glowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: GLOW.clone() }, uViewH: { value: 800 } },
    vertexShader: /* glsl */ `
      attribute float aGlow;
      attribute float aSize;
      uniform float uViewH;
      varying float vGlow;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * projectionMatrix[1][1] * 0.5 * uViewH / -mv.z, 1.5, 96.0);
        vGlow = aGlow;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vGlow;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(c, c);
        if (r2 > 1.0 || vGlow < 0.002) discard;
        float core = exp(-r2 * 26.0);
        float halo = exp(-r2 * 4.0) * (1.0 - r2) * 0.75;
        float a = (core * 3.2 + halo) * vGlow;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
  });
}

// a Photinus-like beetle, 1.2 cm: black head under a rosy shield with a dark
// centre, dusky wing cases edged pale, and a lantern at the tail
let parts = null;
function fireflyParts() {
  if (parts) return parts;
  const L = 0.012;
  const pieces = [];
  // the shield over the head: pale rim, rosy sides, a dark centre spot
  const shield = ellipsoid(0, L * 0.02, L * 0.3, L * 0.17, L * 0.045, L * 0.15, 16, 8);
  paint(shield, (x, y, z, out) => {
    const r = Math.hypot(x / (L * 0.17), (z - L * 0.3) / (L * 0.15));
    if (r > 0.86) return out.set('#d8c98a');
    if (Math.abs(x) < L * 0.05 && z < L * 0.38) return out.set('#1a1412');
    return out.set('#d98672');
  });
  // wing cases: dusky, edged pale yellow along the sides and the seam
  for (const s of [1, -1]) {
    const wc = ellipsoid(s * L * 0.075, L * 0.035, -L * 0.13, L * 0.085, L * 0.045, L * 0.33, 12, 10);
    paint(wc, (x, y, z, out) => {
      const edge = Math.abs(x) > L * 0.14 || Math.abs(x) < L * 0.012;
      return out.set(edge ? '#bfae76' : '#2e2924');
    });
    pieces.push(wc);
  }
  // head, abdomen and legs underneath
  const head = ellipsoid(0, -L * 0.01, L * 0.4, L * 0.07, L * 0.05, L * 0.06, 10, 6);
  paint(head, (x, y, z, out) => out.set('#141010'));
  const belly = ellipsoid(0, -L * 0.02, -L * 0.12, L * 0.11, L * 0.04, L * 0.34, 12, 8);
  paint(belly, (x, y, z, out) => out.set('#3a2e26'));
  const V = (x, y, z) => new THREE.Vector3(x * L, y * L, z * L);
  for (const s of [1, -1]) {
    const ant = tube([V(s * 0.03, 0.0, 0.45), V(s * 0.1, 0.06, 0.62), V(s * 0.16, 0.08, 0.8)], L * 0.008, 3);
    paint(ant, (x, y, z, out) => out.set('#1a1412'));
    pieces.push(ant);
    for (const [z, sw] of [
      [0.28, 0.3],
      [0.14, 0],
      [0.0, -0.3],
    ]) {
      const leg = tube([V(s * 0.05, -0.03, z), V(s * 0.16, -0.02, z + sw * 0.1), V(s * 0.2, -0.09, z + sw * 0.2)], L * 0.01, 3);
      paint(leg, (x, y, z2, out) => out.set('#1e1814'));
      pieces.push(leg);
    }
  }
  pieces.push(shield, head, belly);
  const lantern = ellipsoid(0, -L * 0.045, -L * 0.36, L * 0.1, L * 0.035, L * 0.14, 10, 6);
  paint(lantern, (x, y, z, out) => out.set('#ffffff'));
  parts = {
    body: merge(pieces),
    lantern: merge([lantern]),
    bodyMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
    lanternMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  };
  return parts;
}

export class Fireflies {
  constructor(host) {
    this.host = host;
    this.object = new THREE.Group();
    this.object.name = 'fireflies';
    const pos = new Float32Array(MAX * 3);
    const glow = new Float32Array(MAX);
    const size = new Float32Array(MAX);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.glowMat = glowMaterial();
    this.points = new THREE.Points(geo, this.glowMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(_size);
      this.glowMat.uniforms.uViewH.value = _size.y;
    };
    const p = fireflyParts();
    this.bodies = new THREE.InstancedMesh(p.body, p.bodyMat, MAX);
    this.lanterns = new THREE.InstancedMesh(p.lantern, p.lanternMat, MAX);
    this.lanterns.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    for (const im of [this.bodies, this.lanterns]) {
      im.count = 0;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    this.object.add(this.points, this.bodies, this.lanterns);
    this.list = [];
    this.count = 0; // fireflies here (not counting those fading away)
    this.night = 0;
  }

  spawn() {
    if (this.list.length >= MAX) return null;
    const f = {
      kind: 'firefly',
      host: this.host,
      pos: new THREE.Vector3(-1.8 + Math.random() * 3.6, 0.04 + Math.random() * 0.1, -1.4 + Math.random() * 2.1),
      vel: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      seed: Math.random() * 100,
      // a slow blink: a soft flash every few seconds, each at its own pace
      period: 3.2 + Math.random() * 3.5,
      phase: Math.random(),
      flashLen: 0.28 + Math.random() * 0.18,
      boost: 0,
      echo: -1,
      glow: 0,
      fade: 0,
      height: 0.25 + Math.random() * 0.75,
      leaving: false,
      arrived: false,
      loop: 0,
      radius: 0.08,
    };
    this.list.push(f);
    this.count++;
    return f;
  }

  leaveAll() {
    for (const f of this.list) {
      if (!f.leaving) this.count--;
      f.leaving = true;
    }
  }

  clear() {
    this.list.length = 0;
    this.count = 0;
    this.sync();
  }

  update(dt, t, world) {
    const reduced = this.host?.reduced;
    this.night = damp(this.night, world.night || 0, 1.5, dt);
    const vis = smooth(0.45, 0.8, this.night);
    const V = VOLUME;
    const cam = world.camera;
    for (let k = this.list.length - 1; k >= 0; k--) {
      const f = this.list[k];
      // appear at night, drift up and away when leaving or at dawn
      const want = f.leaving ? 0 : vis;
      f.fade = damp(f.fade, want, f.leaving ? 0.8 : 0.5 + (f.seed % 1) * 0.6, dt);
      if (f.leaving && f.fade < 0.02) {
        this.list.splice(k, 1);
        continue;
      }
      if (!f.arrived && f.fade > 0.5 && vis > 0.5) {
        f.arrived = true;
        this.host?.settle(f);
      }
      if (f.fade < 0.001 && !f.leaving) continue;
      // the blink: a smooth flash in each period, plus answers to neighbours
      const slow = reduced ? 1.5 : 1;
      f.phase = (f.phase + dt / (f.period * slow)) % 1;
      const x = f.phase / f.flashLen;
      let flash = x < 1 ? Math.sin(Math.PI * x) ** 2 : 0;
      if (f.echo >= 0) {
        f.echo -= dt;
        if (f.echo < 0) f.boost = Math.max(f.boost, 0.8);
      }
      f.boost = Math.max(0, f.boost - dt * 0.9);
      flash = Math.max(flash, f.boost);
      f.glow = (0.1 + flash) * f.fade;
      // slow drift: lazy curves, rising a little while it flashes
      const tt = t * 0.35 + f.seed;
      const sp = reduced ? 0.045 : 0.075;
      const vx = Math.sin(tt * 1.1) * 0.6 + Math.sin(tt * 2.3 + 1.7) * 0.4;
      const vz = Math.sin(tt * 0.9 + 2.1) * 0.6 + Math.sin(tt * 1.9 + 0.4) * 0.4;
      let vy = Math.sin(tt * 1.4 + 3.3) * 0.25 + (f.height - f.pos.y) * 0.8 + flash * 0.35;
      if (f.leaving) vy += 0.4;
      if (f.loop > 0) {
        // poked: a quick little loop upwards
        f.loop -= dt;
        const a = (1 - f.loop / 1.2) * Math.PI * 2;
        vy += Math.sin(a) * 1.2;
      }
      let ax = vx * sp;
      let az = vz * sp;
      if (f.pos.x < V.x0) ax += 0.05;
      if (f.pos.x > V.x1) ax -= 0.05;
      if (f.pos.z < V.z0) az += 0.05;
      if (f.pos.z > V.z1) az -= 0.05;
      f.vel.x = damp(f.vel.x, ax, 1.5, dt);
      f.vel.y = damp(f.vel.y, vy * sp, 1.5, dt);
      f.vel.z = damp(f.vel.z, az, 1.5, dt);
      f.pos.addScaledVector(f.vel, dt);
      const ground = (world.lawn && world.lawn(f.pos.x, f.pos.z)) ?? 0;
      if (f.pos.y < ground + 0.03) f.pos.y = ground + 0.03;
      if (cam) {
        _v.subVectors(f.pos, cam.position);
        const d = _v.length();
        if (d < LENS_CLEARANCE && d > 1e-6) f.pos.copy(cam.position).addScaledVector(_v, LENS_CLEARANCE / d);
      }
      if (Math.hypot(f.vel.x, f.vel.z) > 0.01) f.yaw = Math.atan2(f.vel.x, f.vel.z);
    }
    this.sync();
  }

  // copy the live fireflies into the GPU buffers
  sync() {
    const geo = this.points.geometry;
    const pos = geo.attributes.position.array;
    const glow = geo.attributes.aGlow.array;
    const size = geo.attributes.aSize.array;
    const col = this.lanterns.instanceColor.array;
    let n = 0;
    for (const f of this.list) {
      if (f.fade < 0.001) continue;
      pos[n * 3] = f.pos.x;
      pos[n * 3 + 1] = f.pos.y;
      pos[n * 3 + 2] = f.pos.z;
      glow[n] = f.glow;
      size[n] = 0.075;
      _e.set(-0.25, f.yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      _s.setScalar(Math.max(0.001, Math.min(1, f.fade * 3)));
      _m.compose(f.pos, _q, _s);
      this.bodies.setMatrixAt(n, _m);
      this.lanterns.setMatrixAt(n, _m);
      _c.copy(GLOW).multiplyScalar(0.4 + f.glow * 5);
      col[n * 3] = _c.r;
      col[n * 3 + 1] = _c.g;
      col[n * 3 + 2] = _c.b;
      n++;
    }
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aGlow.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    this.bodies.count = this.lanterns.count = n;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.lanterns.instanceMatrix.needsUpdate = true;
    this.lanterns.instanceColor.needsUpdate = true;
  }

  pick(ray) {
    let best = null;
    let bestT = Infinity;
    for (const f of this.list) {
      if (f.fade < 0.3 || f.leaving) continue;
      if (ray.distanceSqToPoint(f.pos) > f.radius * f.radius) continue;
      const t = _v.subVectors(f.pos, ray.origin).dot(ray.direction);
      if (t > 0 && t < bestT) {
        bestT = t;
        best = f;
      }
    }
    return best ? { fly: best, t: bestT } : null;
  }

  // tapped: a bright flash and a little loop, and the others near it answer
  poke(f) {
    f.boost = 1.6;
    f.loop = 1.2;
    for (const o of this.list) {
      if (o === f) continue;
      const d = o.pos.distanceTo(f.pos);
      if (d < 0.9) o.echo = 0.25 + d * 0.9 + Math.random() * 0.2;
    }
  }

  // a glowing firefly for the visitors book
  portrait() {
    const p = fireflyParts();
    const g = new THREE.Group();
    const body = new THREE.Mesh(p.body, p.bodyMat);
    const lantern = new THREE.Mesh(p.lantern, new THREE.MeshBasicMaterial({ color: GLOW.clone().multiplyScalar(2.5) }));
    g.add(body, lantern);
    g.rotation.set(0.5, -0.9, 0);
    return g;
  }
}
