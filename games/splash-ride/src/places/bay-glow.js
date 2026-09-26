// The lights of the night bay that live and move: fireflies blinking over
// the dune grass, the gardens and the woods (and faintly in the water's
// mirror), paper lanterns floating on the bay, each with a warm pool of
// light on the water round it, bobbing on the swell and drifting gently out
// of the boat's way, and a faint twinkle of sea sparkle in the open water
// that livens up round the boat.
//
// Fireflies and sparkles are GPU points (one draw each) added over the
// scene (ONE/ONE blending, no depth writes); the floating lanterns are two
// instanced meshes moved on the CPU (a few dozen matrices a frame).
import * as THREE from 'three';
import { rng } from '../config.js';
import { canvasTexture } from './common.js';

const ADD = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor };

// ------------------------------------------------------------ fireflies

const FF_VERT = /* glsl */ `
attribute vec4 seed; // phase 0..1, blink period (s), drift speed, glow size (m)
uniform float uTime;
uniform float uScale;
uniform float uMirror; // 1: drawn only into the water's reflection
varying float vGlow;
void main() {
  // the reflection is rendered from a camera mirrored below the water
  if ((uMirror > 0.5) != (cameraPosition.y < 0.0)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vGlow = 0.0;
    return;
  }
  vec3 p = position;
  float t = uTime * seed.z;
  float ph = seed.x * 6.2831;
  p.x += sin(t * 0.53 + ph) * 1.1 + sin(t * 1.37 + ph * 3.0) * 0.3;
  p.z += cos(t * 0.47 + ph * 1.7) * 1.1 + cos(t * 1.21 + ph * 2.0) * 0.3;
  p.y += sin(t * 0.39 + ph * 2.3) * 0.5 + sin(t * 1.9 + ph) * 0.08;
  // a slow, soft glow now and then
  float c = fract(uTime / seed.y + seed.x);
  vGlow = smoothstep(0.0, 0.12, c) * (1.0 - smoothstep(0.3, 0.55, c));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = seed.w * uScale / max(0.5, -mv.z);
  gl_PointSize = max(px, 2.0);
  // far away they fade out rather than shrink to specks of dust
  vGlow *= smoothstep(0.15, 1.2, px);
}`;

const FF_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vGlow;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 22.0) + exp(-r2 * 5.0) * 0.3;
  gl_FragColor = vec4(uColor * a * vGlow, 0.0);
}`;

// spots: [{ x, y, z }] where each firefly hovers
export function makeFireflies(spots, fxLayer, seed = 5) {
  const r = rng(seed);
  const n = spots.length;
  const pos = new Float32Array(n * 3);
  const sd = new Float32Array(n * 4);
  spots.forEach((s, i) => {
    pos.set([s.x, s.y, s.z], i * 3);
    sd.set([r(), 2.4 + r() * 3.2, 0.5 + r() * 0.7, 0.45 + r() * 0.25], i * 4);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(sd, 4));
  const uniforms = { uTime: { value: 0 }, uScale: { value: 700 }, uColor: { value: new THREE.Color(0.85, 1.0, 0.32).multiplyScalar(12) }, uMirror: { value: 0 } };
  const direct = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: FF_VERT, fragmentShader: FF_FRAG, uniforms, ...ADD }));
  direct.frustumCulled = false;
  direct.layers.set(fxLayer);
  direct.renderOrder = 5;
  // a copy in the world layer, seen only by the reflection camera
  const mirror = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: FF_VERT, fragmentShader: FF_FRAG, uniforms: { ...uniforms, uMirror: { value: 1 }, uColor: { value: uniforms.uColor.value.clone().multiplyScalar(0.7) } }, ...ADD }));
  mirror.frustumCulled = false;
  const group = new THREE.Group();
  group.add(direct, mirror);
  group.userData.direct = direct;
  group.userData.update = (t, h) => {
    uniforms.uTime.value = t;
    mirror.material.uniforms.uTime.value = t;
    if (h) {
      uniforms.uScale.value = h;
      mirror.material.uniforms.uScale.value = h;
    }
  };
  return group;
}

// ------------------------------------------------------------ floating lanterns

// the paper of a floating lantern: warm fibres, a painted flower, brightest
// low down where the candle sits
function lanternPaper() {
  return canvasTexture(128, 128, (g, w, h) => {
    const r = rng(97);
    const grad = g.createRadialGradient(w / 2, h * 0.85, 6, w / 2, h * 0.7, h * 0.95);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#ffe2b8');
    grad.addColorStop(1, '#c98f58');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.strokeStyle = `rgba(170, 110, 60, ${r() * 0.1})`;
      g.lineWidth = 0.6;
      g.beginPath();
      const x = r() * w;
      const y = r() * h;
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 10, y + (r() - 0.5) * 10);
      g.stroke();
    }
    // a simple five-petal blossom in soft red
    g.fillStyle = 'rgba(200, 70, 50, 0.45)';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      g.beginPath();
      g.ellipse(w / 2 + Math.cos(a) * 11, h * 0.45 + Math.sin(a) * 11, 9, 5.5, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(230, 150, 40, 0.6)';
    g.beginPath();
    g.arc(w / 2, h * 0.45, 4, 0, Math.PI * 2);
    g.fill();
    // the frame's shadow along the edges
    g.fillStyle = 'rgba(80, 45, 20, 0.45)';
    g.fillRect(0, 0, 5, h);
    g.fillRect(w - 5, 0, 5, h);
    g.fillRect(0, 0, w, 5);
  });
}

function poolTexture() {
  return canvasTexture(128, 128, (g, w) => {
    const c = w / 2;
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, 'rgba(255,255,255,0.4)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.06)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  }, { srgb: false });
}

function lanternGeometry() {
  const S = 0.32;
  const H = 0.34;
  const y0 = 0.035;
  // four paper sides and, inside the open top, the candle's glow
  const sides = [];
  for (let k = 0; k < 4; k++) {
    const p = new THREE.PlaneGeometry(S, H).toNonIndexed();
    p.translate(0, y0 + H / 2, S / 2);
    p.rotateY((k * Math.PI) / 2);
    sides.push(p);
  }
  const top = new THREE.PlaneGeometry(S * 0.9, S * 0.9).toNonIndexed();
  top.rotateX(-Math.PI / 2);
  top.translate(0, y0 + H * 0.55, 0);
  const uv = top.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.15);
  sides.push(top);
  const paper = mergeSimple(sides);
  // the wooden base and the frame
  const wood = [];
  const add = (w, h, d, x, y, z) => wood.push(new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y, z));
  add(S + 0.1, 0.05, S + 0.1, 0, 0.01, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(0.022, H + 0.01, 0.022, (sx * S) / 2, y0 + H / 2, (sz * S) / 2);
  for (const s of [-1, 1]) {
    add(S + 0.02, 0.02, 0.022, 0, y0 + H, (s * S) / 2);
    add(0.022, 0.02, S + 0.02, (s * S) / 2, y0 + H, 0);
  }
  return { paper, frame: mergeSimple(wood, ['position', 'normal']) };
}

function mergeSimple(geos, keep = ['position', 'normal', 'uv']) {
  const out = new THREE.BufferGeometry();
  for (const name of keep) {
    const size = geos[0].attributes[name].itemSize;
    let len = 0;
    for (const g of geos) len += g.attributes[name].count * size;
    const arr = new Float32Array(len);
    let o = 0;
    for (const g of geos) {
      arr.set(g.attributes[name].array, o);
      o += g.attributes[name].count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

// spots: [{ x, z }] starting places; land: the LandField; keepOut: [{ x, z, r }]
// (wave bumps and ramps) that the lanterns drift clear of; swell: the
// place's swell waves, so they ride the same water the boat does
export function makeFloatingLanterns({ spots, land, keepOut, swell, fxLayer, seed = 9 }) {
  const r = rng(seed);
  const n = spots.length;
  const { paper, frame } = lanternGeometry();
  const tints = ['#ffb35c', '#ffc680', '#ff9a5a', '#ffd49c', '#ff8a60', '#ffbf8a'].map((h) => new THREE.Color(h));
  const paperMat = new THREE.MeshBasicMaterial({ map: lanternPaper(), color: new THREE.Color(3.2, 3.2, 3.2), side: THREE.DoubleSide });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 });
  const paperMesh = new THREE.InstancedMesh(paper, paperMat, n);
  const frameMesh = new THREE.InstancedMesh(frame, frameMat, n);
  frameMesh.castShadow = true;
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: new THREE.Color('#ffb868').multiplyScalar(0.45), ...ADD, blendSrc: THREE.SrcAlphaFactor });
  const poolGeo = new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, n);
  pools.layers.set(fxLayer);
  pools.renderOrder = 4;
  for (const m of [paperMesh, frameMesh, pools]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
  }
  const L = spots.map((s, i) => {
    const c = tints[Math.floor(r() * tints.length)];
    paperMesh.setColorAt(i, c);
    pools.setColorAt(i, c);
    return { x: s.x, z: s.z, vx: 0, vz: 0, ph: r() * 10, ry: r() * 6.28, spin: (r() - 0.5) * 0.08, rock: 0, rockPh: 0 };
  });
  paperMesh.instanceColor.needsUpdate = true;
  pools.instanceColor.needsUpdate = true;
  // the swell as the water shader has it
  const waves = (swell || []).map((w) => {
    const a = THREE.MathUtils.degToRad(w.dir);
    const k = (Math.PI * 2) / w.length;
    return [Math.sin(a) * k, -Math.cos(a) * k, w.amp, Math.sqrt(9.81 * k)];
  });
  const swellAt = (x, z, t) => {
    let h = 0;
    for (const w of waves) h += Math.sin(w[0] * x + w[1] * z - w[3] * t) * w[2];
    return h;
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const grad = { x: 0, z: 0 };
  const group = new THREE.Group();
  group.add(paperMesh, frameMesh, pools);
  // boat: { x, z, fx, fz, speed } or null
  group.userData.update = (dt, t, boat) => {
    dt = Math.min(dt, 0.05);
    for (let i = 0; i < n; i++) {
      const o = L[i];
      // a lazy current, each lantern wandering a little on its own
      let ax = Math.sin(t * 0.021 + o.ph) * 0.012 + Math.sin(o.z * 0.004 + 1.3) * 0.006;
      let az = Math.cos(t * 0.017 + o.ph * 1.3) * 0.012 + Math.cos(o.x * 0.004) * 0.006;
      // drift clear of the shore and the wave bumps
      const d = land.distance(o.x, o.z);
      if (d < 16) {
        land.gradient(o.x, o.z, grad);
        ax += grad.x * (16 - d) * 0.02;
        az += grad.z * (16 - d) * 0.02;
      }
      for (const k of keepOut) {
        const dx = o.x - k.x;
        const dz = o.z - k.z;
        const dd = Math.hypot(dx, dz);
        if (dd < k.r && dd > 0.01) {
          ax += (dx / dd) * (k.r - dd) * 0.01;
          az += (dz / dd) * (k.r - dd) * 0.01;
        }
      }
      // pushed aside by the boat's bow wave, and set rocking
      if (boat) {
        const dx = o.x - boat.x;
        const dz = o.z - boat.z;
        const dd = Math.hypot(dx, dz);
        const reach = 9 + boat.speed * 0.4;
        if (dd < reach && dd > 0.01) {
          const push = (1 - dd / reach) * (1.2 + boat.speed * 0.35);
          // out to the side of the boat's track rather than straight ahead of it
          const side = dx * -boat.fz + dz * boat.fx >= 0 ? 1 : -1;
          ax += ((dx / dd) * 0.5 + -boat.fz * side * 0.8) * push;
          az += ((dz / dd) * 0.5 + boat.fx * side * 0.8) * push;
          o.rock = Math.min(1, o.rock + dt * push * 0.8);
        }
      }
      o.vx += ax * dt;
      o.vz += az * dt;
      const drag = Math.exp(-dt * 0.6);
      o.vx *= drag;
      o.vz *= drag;
      const sp = Math.hypot(o.vx, o.vz);
      if (sp > 2.5) {
        o.vx *= 2.5 / sp;
        o.vz *= 2.5 / sp;
      }
      o.x += o.vx * dt;
      o.z += o.vz * dt;
      o.ry += (o.spin + sp * 0.1) * dt;
      o.rock *= Math.exp(-dt * 0.7);
      const y = swellAt(o.x, o.z, t) + Math.sin(t * 1.3 + o.ph) * 0.012;
      const rk = 0.04 + o.rock * 0.22;
      e.set(Math.sin(t * 1.1 + o.ph) * rk, o.ry, Math.cos(t * 0.9 + o.ph * 1.7) * rk, 'YXZ');
      q.setFromEuler(e);
      p.set(o.x, y, o.z);
      m4.compose(p, q, one);
      paperMesh.setMatrixAt(i, m4);
      frameMesh.setMatrixAt(i, m4);
      p.y = 0.14;
      q.identity();
      m4.compose(p, q, one);
      pools.setMatrixAt(i, m4);
    }
    paperMesh.instanceMatrix.needsUpdate = true;
    frameMesh.instanceMatrix.needsUpdate = true;
    pools.instanceMatrix.needsUpdate = true;
  };
  group.userData.update(0, 0, null);
  return group;
}

// ------------------------------------------------------------ sea sparkle

const SP_VERT = /* glsl */ `
attribute vec2 seed; // phase, rate (flashes per second)
uniform float uTime;
uniform float uScale;
uniform float uSize;
uniform vec3 uCenter;
uniform vec3 uBoat;
uniform sampler2D uLand;
uniform vec4 uLandInfo;
varying float vGlow;
void main() {
  // a tile of sparkles that wraps round the camera, fixed in the world
  vec2 base = uCenter.xz - uSize * 0.5;
  vec2 w = base + mod(position.xz * uSize - base, uSize);
  float boat = 1.0 - smoothstep(3.0, 12.0, distance(w, uBoat.xz));
  float rate = seed.y * (1.0 + boat * 5.0);
  float c = fract(uTime * rate + seed.x);
  float flash = smoothstep(0.0, 0.015, c) * (1.0 - smoothstep(0.02, 0.07, c));
  float d = distance(w, cameraPosition.xz);
  float land = texture2D(uLand, (w - uLandInfo.xy) / uLandInfo.zw).r;
  vGlow = flash * (0.6 + boat * 1.4) * (1.0 - smoothstep(35.0, 70.0, d)) * smoothstep(1.5, 5.0, land);
  vec4 mv = viewMatrix * vec4(w.x, 0.09, w.y, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = 0.07 * uScale / max(0.5, -mv.z);
  gl_PointSize = vGlow > 0.0 ? max(px, 1.8) : 0.0;
  vGlow *= clamp(px / 1.8, 0.3, 1.0);
}`;

const SP_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vGlow;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  gl_FragColor = vec4(uColor * (exp(-r2 * 10.0) + exp(-r2 * 3.0) * 0.2) * vGlow, 0.0);
}`;

export function makeSeaSparkle({ count, land, glow, fxLayer, seed = 13 }) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const sd = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    pos.set([r(), 0, r()], i * 3);
    sd.set([r(), 1 / (5 + r() * 9)], i * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(sd, 2));
  const uniforms = {
    uTime: { value: 0 },
    uScale: { value: 700 },
    uSize: { value: 140 },
    uCenter: { value: new THREE.Vector3() },
    uBoat: { value: new THREE.Vector3(0, -100, 0) },
    uLand: { value: land.texture },
    uLandInfo: { value: new THREE.Vector4(land.minX, land.minZ, land.sizeX, land.sizeZ) },
    uColor: { value: glow.clone().multiplyScalar(2.2) },
  };
  const points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: SP_VERT, fragmentShader: SP_FRAG, uniforms, ...ADD }));
  points.frustumCulled = false;
  points.layers.set(fxLayer);
  points.renderOrder = 3;
  points.userData.update = (t, cam, boat, h) => {
    uniforms.uTime.value = t;
    uniforms.uCenter.value.copy(cam);
    if (boat) uniforms.uBoat.value.set(boat.x, 0, boat.z);
    if (h) uniforms.uScale.value = h;
  };
  return points;
}

