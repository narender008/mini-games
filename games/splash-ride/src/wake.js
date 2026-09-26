// The wake map: a top-down half-float texture around the boat that the
// water shader reads for foam (r), surface height (g, turned into normals)
// and the night bay's plankton glow (b). Every frame it is redrawn from the
// boat's recent path: two Kelvin arms opening at about 19 degrees from the
// bow, a broad churned trail of white water from the stern, and expanding
// ripple rings from splashes, rings and bumps. Nothing accumulates between
// frames, so the wake always follows the path exactly and fades with age.
import * as THREE from 'three';

const MAXP = 360; // path points kept (about 12 s at speed)
const MAXR = 32; // ripple rings at once
const KELVIN = 0.34; // tan(19.5 degrees)

const RIBBON_VERT = /* glsl */ `
uniform vec3 uInfo;
attribute float across;
attribute vec4 data; // foam, height, glow, bubbles
varying float vAcross;
varying vec4 vData;
void main() {
  vAcross = across;
  vData = data;
  gl_Position = vec4((position.xz - uInfo.xy) / uInfo.z * 2.0, 0.0, 1.0);
}`;

const RIBBON_FRAG = /* glsl */ `
uniform float uTrail;
varying float vAcross;
varying vec4 vData;
void main() {
  float a = vAcross;
  float prof = uTrail > 0.5 ? (1.0 - smoothstep(0.35, 1.0, abs(a))) : exp(-a * a * 3.0);
  // arms: a crest with a shallow trough outside it
  float h = uTrail > 0.5 ? vData.y * prof : vData.y * (exp(-a * a * 4.0) - 0.35 * exp(-(a - 0.9) * (a - 0.9) * 6.0));
  float bub = (1.0 - smoothstep(0.15, 1.0, abs(a)));
  gl_FragColor = vec4(vData.x * prof, h, vData.z * prof, vData.w * bub);
}`;

const RING_VERT = /* glsl */ `
uniform vec3 uInfo;
attribute vec2 local;
attribute vec4 params; // age, strength, radius, glow
varying vec2 vLocal;
varying vec4 vParams;
void main() {
  vLocal = local;
  vParams = params;
  gl_Position = vec4((position.xz - uInfo.xy) / uInfo.z * 2.0, 0.0, 1.0);
}`;

const RING_FRAG = /* glsl */ `
varying vec2 vLocal;
varying vec4 vParams;
void main() {
  float age = vParams.x;
  float s = vParams.y;
  float R = vParams.z;
  float r = length(vLocal) * R;
  float front = 0.25 + age * 1.6;
  float x = r - front;
  // (smoothstep needs edge0 < edge1: reversed edges are undefined in GLSL
  // and blow up on some GPUs, so the inner wavelets are written out)
  float inside = 1.0 - smoothstep(-2.5, 0.0, x);
  float env = s * exp(-age * 0.55) * exp(-x * x * 0.8) * smoothstep(0.0, 0.1, age);
  float trail = s * exp(-age * 0.8) * inside * exp(min(x, 0.0) * 0.5) * 0.5;
  // everything fades out well inside the quad, so its square edge never shows
  float edge = 1.0 - smoothstep(0.8, 0.98, length(vLocal));
  float h = cos(x * 4.2) * (env + trail) * 0.09 * edge;
  float foam = (s * exp(-age * 1.1) * exp(-r * r / (0.6 + s * 2.0 + age * 3.0)) * 1.3 + env * 0.06) * edge;
  gl_FragColor = vec4(foam, h, vParams.w * (foam + env * 0.6 * edge), foam * 0.6);
}`;

export class Wake {
  constructor({ quality }) {
    this.res = quality.wake;
    this.size = quality.tier === 'high' ? 170 : 150;
    this.texel = this.size / this.res;
    this.info = new THREE.Vector3(0, 0, this.size);
    this.target = new THREE.WebGLRenderTarget(this.res, this.res, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    this.texture = this.target.texture;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.path = [];
    this.lastRec = null;
    this.glow = 0;

    const blend = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, depthTest: false, depthWrite: false, side: THREE.DoubleSide };
    const mkRibbon = (trail) => {
      const n = (MAXP + 1) * 2;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('across', new THREE.BufferAttribute(new Float32Array(n), 1));
      g.setAttribute('data', new THREE.BufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
      const idx = [];
      for (let i = 0; i < MAXP; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      g.setIndex(idx);
      const across = g.attributes.across.array;
      for (let i = 0; i < n; i += 2) {
        across[i] = -1;
        across[i + 1] = 1;
      }
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG, uniforms: { uInfo: { value: this.info }, uTrail: { value: trail ? 1 : 0 } }, ...blend }));
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    this.trail = mkRibbon(true);
    this.armL = mkRibbon(false);
    this.armR = mkRibbon(false);

    // ripple rings: one quad each
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXR * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const local = new Float32Array(MAXR * 8);
    const idx = [];
    for (let i = 0; i < MAXR; i++) {
      local.set([-1, -1, 1, -1, 1, 1, -1, 1], i * 8);
      const a = i * 4;
      idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
    }
    g.setAttribute('local', new THREE.BufferAttribute(local, 2));
    g.setAttribute('params', new THREE.BufferAttribute(new Float32Array(MAXR * 4 * 4), 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.rings = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, uniforms: { uInfo: { value: this.info } }, ...blend }));
    this.rings.frustumCulled = false;
    this.scene.add(this.rings);
    this.ripples = Array.from({ length: MAXR }, () => ({ x: 0, z: 0, t0: -100, s: 0, glow: 0 }));
    this.rippleIndex = 0;
  }

  // forget the path (a new place, or the boat was moved)
  reset() {
    this.path.length = 0;
    this.lastRec = null;
    for (const r of this.ripples) r.t0 = -100;
  }

  // Record the boat's pose. p: { x, z, dx, dz (unit heading), speed,
  // halfBeam, halfLength, foam (0..1, 0 while airborne), glow (0..1) }
  record(time, p) {
    this.head = { ...p, t: time };
    const last = this.lastRec;
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < 0.45 && time - last.t < 0.12) return;
    const rec = { x: p.x, z: p.z, dx: p.dx, dz: p.dz, v: p.speed, hw: p.halfBeam, hl: p.halfLength, foam: p.foam, glow: p.glow, t: time };
    this.path.push(rec);
    if (this.path.length > MAXP) this.path.shift();
    this.lastRec = rec;
  }

  // An expanding ring on the water: strength 0..1.5
  ripple(x, z, strength, time, glow = 0) {
    const r = this.ripples[this.rippleIndex];
    this.rippleIndex = (this.rippleIndex + 1) % MAXR;
    r.x = x;
    r.z = z;
    r.t0 = time;
    r.s = strength;
    r.glow = glow;
  }

  fillRibbon(mesh, time, kind) {
    const pos = mesh.geometry.attributes.position.array;
    const data = mesh.geometry.attributes.data.array;
    const pts = this.path;
    const n = pts.length;
    let k = 0;
    const put = (x, z, w, rx, rz, foam, h, glow, bub) => {
      for (const side of [-1, 1]) {
        pos[k * 3] = x + rx * w * side;
        pos[k * 3 + 2] = z + rz * w * side;
        data[k * 4] = foam;
        data[k * 4 + 1] = h;
        data[k * 4 + 2] = glow;
        data[k * 4 + 3] = bub;
        k++;
      }
    };
    const each = (p, age) => {
      const rx = -p.dz;
      const rz = p.dx;
      const v = p.v;
      const fresh = Math.min(1, age / 0.12);
      if (kind === 'trail') {
        const sx = p.x - p.dx * p.hl * 0.9;
        const sz = p.z - p.dz * p.hl * 0.9;
        const w = p.hw * 0.7 + age * 0.45;
        const vk = 0.6 + 0.4 * Math.min(1, v / 8);
        const foam = p.foam * (Math.exp(-age / 0.55) * 0.55 + Math.exp(-age / 2.4) * 0.3) * vk;
        const bub = p.foam * Math.exp(-age / 5.5) * 0.9 * vk;
        put(sx, sz, w, rx, rz, foam, -0.04 * p.foam * Math.exp(-age / 2), p.glow * Math.exp(-age / 7) * 1.4, bub);
      } else {
        const side = kind === 'left' ? -1 : 1;
        const bx = p.x + p.dx * p.hl * 0.55;
        const bz = p.z + p.dz * p.hl * 0.55;
        const spread = p.hw * 0.95 + age * v * KELVIN;
        const w = 0.35 + age * 0.28 + v * 0.02;
        const cx = bx + rx * spread * side;
        const cz = bz + rz * spread * side;
        const foam = p.foam * Math.exp(-age / 1.3) * 0.62 * Math.min(1, v / 6) * fresh;
        const h = 0.12 * Math.min(1.4, v / 9) * Math.exp(-age / 3.5) * (p.foam > 0 ? 1 : 0.2);
        put(cx, cz, w, rx, rz, foam, h, p.glow * Math.exp(-age / 5), p.foam * Math.exp(-age / 3) * 0.3);
      }
    };
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const age = time - p.t;
      each(p, Math.max(0, age));
    }
    if (this.head && n) each(this.head, 0);
    const count = Math.max(0, k / 2 - 1);
    mesh.geometry.setDrawRange(0, count * 6);
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.data.needsUpdate = true;
  }

  render(renderer, cx, cz, time) {
    // snap to whole texels so the foam never shimmers as the map moves
    const t = this.texel;
    this.info.set(Math.round(cx / t) * t, Math.round(cz / t) * t, this.size);
    this.fillRibbon(this.trail, time, 'trail');
    this.fillRibbon(this.armL, time, 'left');
    this.fillRibbon(this.armR, time, 'right');
    // ripple quads
    const pos = this.rings.geometry.attributes.position.array;
    const par = this.rings.geometry.attributes.params.array;
    let live = 0;
    for (const r of this.ripples) {
      const age = time - r.t0;
      if (age < 0 || age > 7) continue;
      const R = 1.2 + age * 1.6 + 3;
      const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
      for (let c = 0; c < 4; c++) {
        const o = live * 4 + c;
        pos[o * 3] = r.x + corners[c * 2] * R;
        pos[o * 3 + 2] = r.z + corners[c * 2 + 1] * R;
        par[o * 4] = age;
        par[o * 4 + 1] = r.s;
        par[o * 4 + 2] = R;
        par[o * 4 + 3] = r.glow;
      }
      live++;
    }
    this.rings.geometry.setDrawRange(0, live * 6);
    this.rings.geometry.attributes.position.needsUpdate = true;
    this.rings.geometry.attributes.params.needsUpdate = true;
    this.rings.visible = live > 0;

    const prev = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(this._clear || (this._clear = new THREE.Color()));
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(prevClear, prevAlpha);
  }
}
