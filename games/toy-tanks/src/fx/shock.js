// The shock ring: the fast, low wall of dust, powder or spray that runs out
// along the ground from an impact in the first 200 ms, and, for a splash in
// water, the thin crown that rises and folds back over it.
//
// Each ring is one instance of a short open band (a cone with no cap): its
// radius runs out quickly and slows (like a gravity current), its top edge
// stands a little behind its foot and breaks up in noise, and it is lit like
// the powder clouds (soft.js): the sun side bright, the far side in shade.
// The band is see-through and drawn on LAYER_SOFT with the other soft effects,
// so it fades against the scene depth where it meets the ground.
//
// kinds: 0 dust (smooth, dense), 1 spray or powder (speckled, thin), 2 crown
// (water: a thin bright sheet with a ragged lip, rising then falling)
import * as THREE from 'three';
import { LAYER_SOFT, SOFT_DEPTH_GLSL } from '../post.js';

const SEG = 96;

const VERT = /* glsl */ `
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aC;
attribute vec4 aD;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec4 uFlash;
varying vec4 vColor;
varying vec4 vInfo;
varying vec3 vN;
varying vec3 vLight;
varying vec2 vTex;
varying float vFlash;
void main() {
  float age = uTime - aA.w;
  float life = aB.z;
  if (age < 0.0 || age >= life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec4(0.0); vInfo = vec4(0.0); vN = vec3(0.0, 1.0, 0.0); vLight = vec3(0.0); vTex = vec2(0.0); vFlash = 0.0;
    return;
  }
  float u = age / life;
  float kind = aD.w;
  float th = atan(position.z, position.x);
  float seed = aB.w;
  // the front runs out fast and slows
  float e = 1.0 - pow(1.0 - min(1.0, age / (life * 0.82)), 3.0);
  float R = aB.x * (0.1 + 0.9 * e);
  float H;
  if (kind > 1.5) {
    // a crown: shoots up, then folds back and drops
    H = aB.y * smoothstep(0.0, 0.22, u) * (1.0 - smoothstep(0.42, 1.0, u) * 0.92);
  } else {
    H = aB.y * (0.4 + 0.6 * smoothstep(0.0, 0.5, u)) * (1.0 - 0.4 * smoothstep(0.6, 1.0, u));
  }
  // an uneven top: a few slow lobes round the ring
  float lobes = 0.78 + 0.22 * sin(th * 5.0 + seed * 40.0) + 0.14 * sin(th * 11.0 + seed * 17.0 + age * 3.0);
  if (kind > 1.5) lobes = 0.8 + 0.15 * sin(th * 7.0 + seed * 40.0) + 0.07 * sin(th * 13.0 + seed * 17.0);
  float v = position.y;
  float lean = kind > 1.5 ? -0.28 * smoothstep(0.15, 0.55, u) : aD.z;
  float radius = R * (1.0 - lean * v);
  vec3 dir = vec3(position.x, 0.0, position.z);
  vec3 pos = aA.xyz + dir * radius + vec3(0.0, H * lobes * v, 0.0);
  vec4 mv = viewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  // normal: outward and a little up (a rounded wall)
  vec3 wn = normalize(vec3(dir.x, 0.55 + 0.4 * v, dir.z));
  vN = mat3(viewMatrix) * wn;
  vLight = normalize(mat3(viewMatrix) * uSunDir);
  vTex = vec2(th, v);
  float fadeIn = smoothstep(0.0, 0.05, u);
  float fadeOut = kind > 1.5 ? 1.0 - smoothstep(0.5, 1.0, u) : 1.0 - smoothstep(0.3, 1.0, u);
  vColor = vec4(aC.rgb, aC.a * fadeIn * fadeOut);
  vInfo = vec4(kind, u, seed, -mv.z);
  vec3 fd = pos - uFlash.xyz;
  vFlash = uFlash.w / max(dot(fd, fd), 0.012);
}`;

const FRAG = /* glsl */ `
precision highp float;
${SOFT_DEPTH_GLSL}
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFlashColor;
varying vec4 vColor;
varying vec4 vInfo;
varying vec3 vN;
varying vec3 vLight;
varying vec2 vTex;
varying float vFlash;
void main() {
  if (vColor.a <= 0.0) discard;
  float kind = vInfo.x;
  float u = vInfo.y;
  float seed = vInfo.z;
  float v = vTex.y;
  // noise along the ring and up the wall; it rises with the dust
  vec2 p = vec2(vTex.x * 0.9 + seed * 5.0, v * (kind > 1.5 ? 1.1 : 0.8) - u * 0.55);
  vec4 n = texture2D(uNoise, p);
  vec4 n2 = texture2D(uNoise, p * 2.7 + vec2(0.37, 0.11) + (n.gb - 0.5) * 0.2);
  float h = n.r * 0.6 + n2.r * 0.4;
  float prof;
  float a;
  if (kind > 1.5) {
    // a thin sheet: solid low down, a ragged lip on top
    float lip = 1.0 - smoothstep(0.62, 1.0, v + (h - 0.5) * 0.5);
    prof = smoothstep(0.0, 0.1, v) * lip;
    a = prof * (0.4 + 0.5 * smoothstep(0.25, 0.75, h)) * (1.0 - 0.35 * v);
  } else {
    prof = smoothstep(0.0, 0.14, v) * (1.0 - smoothstep(0.15, 1.0, v + (h - 0.5) * 0.55 + u * 0.25));
    a = prof * smoothstep(0.18, 0.7, h + 0.25 * (1.0 - v));
    if (kind > 0.5) {
      // speckle: spray and powder, not smoke
      float sp = smoothstep(0.42, 0.62, n2.a * 0.6 + n.a * 0.5);
      a *= 0.35 + 0.65 * sp;
    }
  }
  vec3 nrm = normalize(vN);
  float wrap = clamp(dot(nrm, vLight) * 0.5 + 0.55, 0.0, 1.0);
  vec3 sunTerm = uSunColor * smoothstep(0.1, 0.95, wrap);
  vec3 amb = uAmbient * (0.75 + 0.25 * (nrm.y * 0.5 + 0.5));
  vec3 shade = (sunTerm + amb + uFlashColor * vFlash) * (0.88 + 0.22 * h);
  vec3 col = vColor.rgb * shade;
  if (kind > 1.5) {
    // water catches the sky along its rim
    float rim = pow(1.0 - clamp(abs(nrm.z), 0.0, 1.0), 2.0);
    col += vec3(0.5, 0.55, 0.6) * rim * 0.35 * (uSunColor + uAmbient);
  }
  a *= vColor.a;
  float vis = softFade(vInfo.w, 0.018);
  col *= vis;
  a *= vis;
  gl_FragColor = vec4(col * a, a);
}`;

export class Shock {
  constructor(scene, softUniforms, noiseTexture, capacity = 6) {
    this.capacity = capacity;
    this.head = 0;
    this.time = 0;
    this.endTime = 0;
    // the band: SEG + 1 columns x 3 rows; position = (cos, v, sin)
    const rows = 3;
    const pos = new Float32Array((SEG + 1) * rows * 3);
    const idx = [];
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i <= SEG; i++) {
        const t = (i / SEG) * Math.PI * 2;
        const o = (r * (SEG + 1) + i) * 3;
        pos[o] = Math.cos(t);
        pos[o + 1] = r / (rows - 1);
        pos[o + 2] = Math.sin(t);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let i = 0; i < SEG; i++) {
        const a = r * (SEG + 1) + i;
        const b = a + 1;
        const c = a + SEG + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mk = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aA = mk();
    this.aB = mk();
    this.aC = mk();
    this.aD = mk();
    this.attrs = [this.aA, this.aB, this.aC, this.aD];
    geo.setAttribute('aA', this.aA);
    geo.setAttribute('aB', this.aB);
    geo.setAttribute('aC', this.aC);
    geo.setAttribute('aD', this.aD);
    geo.instanceCount = capacity;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.aA.array.fill(-1e6);
    this.aB.array.fill(1e-3);
    this.uniforms = {
      ...softUniforms,
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      uSunColor: { value: new THREE.Vector3(1, 0.95, 0.85) },
      uAmbient: { value: new THREE.Vector3(0.35, 0.42, 0.55) },
      uFlash: { value: new THREE.Vector4(0, -100, 0, 0) },
      uFlashColor: { value: new THREE.Vector3(0.11, 0.09, 0.06) },
      uNoise: { value: noiseTexture },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    // just under the soft particles, so a cloud drawn later covers the ring's inner side
    this.mesh.renderOrder = 19;
    this.mesh.layers.set(LAYER_SOFT);
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.geo = geo;
  }

  // x, y, z: the foot of the ring; R: how far it runs (m); H: how high its top edge stands;
  // life (s); colour and alpha; lean: how far the top stands back from the foot (0..0.5);
  // kind: 0 dust, 1 spray or powder, 2 crown; delay (s)
  spawn(x, y, z, R, H, life, r, g, b, alpha, lean, kind, delay = 0) {
    const i = this.head;
    this.head = (i + 1) % this.capacity;
    const o = i * 4;
    const t0 = this.time + delay;
    let A = this.aA.array;
    A[o] = x; A[o + 1] = y; A[o + 2] = z; A[o + 3] = t0;
    A = this.aB.array;
    A[o] = R; A[o + 1] = H; A[o + 2] = life; A[o + 3] = Math.random();
    A = this.aC.array;
    A[o] = r; A[o + 1] = g; A[o + 2] = b; A[o + 3] = alpha;
    A = this.aD.array;
    A[o] = 0; A[o + 1] = 0; A[o + 2] = lean; A[o + 3] = kind;
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.capacity * 4);
      a.needsUpdate = true;
    }
    if (t0 + life > this.endTime) this.endTime = t0 + life;
    this.mesh.visible = true;
  }

  setLight(dx, dy, dz, sr, sg, sb, ar, ag, ab) {
    const u = this.uniforms;
    u.uSunDir.value.set(dx, dy, dz).normalize();
    u.uSunColor.value.set(sr, sg, sb);
    u.uAmbient.value.set(ar, ag, ab);
  }

  setFlash(x, y, z, intensity) {
    this.uniforms.uFlash.value.set(x, y, z, intensity);
  }

  update(time) {
    this.time = time;
    this.uniforms.uTime.value = time;
    this.mesh.visible = time < this.endTime;
  }

  clear() {
    this.aA.array.fill(-1e6);
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.capacity * 4);
      a.needsUpdate = true;
    }
    this.endTime = 0;
    this.mesh.visible = false;
  }
}
