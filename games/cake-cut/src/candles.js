// Birthday candles: twisted striped candles or glittery number candles, a
// flame on each wick that flickers, leans when blown at and goes out with a
// puff, and a match to light them.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { seeded, sweep, circle } from './decorations.js';

// ------------------------------------------------------------ flame

const FLAME_VERT = /* glsl */ `
uniform vec2 uSize;
uniform vec2 uLean;
varying vec2 vUv;
void main() {
  vUv = vec2(position.x * 2.0, position.y + 0.5);
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float y = position.y + 0.5;
  // the flame bends with the air, more towards its tip
  mv.xy += vec2(position.x * uSize.x, y * uSize.y - uSize.y * 0.12) + uLean * uSize.y * y * y;
  gl_Position = projectionMatrix * mv;
}`;

const FLAME_FRAG = /* glsl */ `
${NOISE}
uniform float uTime;
uniform float uSeed;
uniform float uAmount;
uniform float uFlicker;
varying vec2 vUv;
void main() {
  float y = vUv.y;
  float t = uTime * 7.0 + uSeed * 10.0;
  float wob = (vnoise(vec3(y * 2.5 - t * 0.9, uSeed, t * 0.3)) - 0.5) * (0.12 + 0.35 * uFlicker) * y;
  float x = vUv.x - wob;
  float h = clamp(y / max(uAmount, 0.05), 0.0, 1.2);
  float width = 0.46 * pow(max(sin(3.14159 * pow(clamp(h, 0.0, 1.0), 0.55)), 0.0), 0.85) * (1.0 - 0.3 * h);
  float d = abs(x) / max(width, 1e-3);
  float body = smoothstep(1.0, 0.55, d) * step(h, 1.0);
  float core = smoothstep(0.75, 0.1, d) * smoothstep(0.08, 0.3, h) * smoothstep(0.85, 0.35, h);
  float blue = smoothstep(1.0, 0.4, d) * smoothstep(0.3, 0.06, h) * smoothstep(0.0, 0.05, h);
  vec3 outer = mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.62, 0.2), smoothstep(0.9, 0.3, h));
  vec3 col = outer * body * 1.6;
  col += vec3(1.0, 0.86, 0.6) * core * 3.2;
  col += vec3(0.25, 0.4, 1.0) * blue * 0.9;
  // a faint glow round the whole flame
  float glow = exp(-pow(length(vec2(vUv.x * 0.9, (y - 0.4) * 0.8)) / 0.55, 2.0)) * 0.12;
  col += vec3(1.0, 0.55, 0.2) * glow;
  gl_FragColor = vec4(col * uAmount * (0.92 + 0.12 * vnoise(vec3(t * 1.7, uSeed, 0.0))), 1.0);
}`;

export function flameMaterial(seed = Math.random()) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: seed },
      uAmount: { value: 0 },
      uFlicker: { value: 0 },
      uSize: { value: new THREE.Vector2(0.0075, 0.024) },
      uLean: { value: new THREE.Vector2() },
    },
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

const flameGeo = new THREE.PlaneGeometry(1, 1);

// ------------------------------------------------------------ candle bodies

function stripedWax(a, b) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#fff4e8'), clearcoat: 0.2 });
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uA = { value: ca };
    shader.uniforms.uB = { value: cb };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWax;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWax = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWax;\nuniform vec3 uA;\nuniform vec3 uB;')
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
#include <map_fragment>
float ang = atan(vWax.z, vWax.x) / 6.2831853;
float s = fract(ang * 2.0 + vWax.y * 32.0);
float band = smoothstep(0.46, 0.5, s) - smoothstep(0.96, 1.0, s);
diffuseColor.rgb = mix(uA, uB, band);`,
      );
  };
  m.customProgramCacheKey = () => 'striped-wax';
  return m;
}

function glitterWax(colour) {
  const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colour), roughness: 0.38, metalness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.25 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGl = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGl;\n${NOISE}\nfloat gFlake;`)
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\nvec3 gc = h33(floor(vGl * 1800.0));\ngFlake = step(0.72, gc.x);\ndiffuseColor.rgb *= 0.85 + 0.35 * gc.y;',
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, gFlake);')
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal = normalize(normal + (h33(floor(vGl * 1800.0) + 3.1) - 0.5) * 1.1 * gFlake);',
      );
  };
  m.customProgramCacheKey = () => 'glitter-wax';
  return m;
}

const wickMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2420'), roughness: 0.9 });
const wickGeo = new THREE.CylinderGeometry(0.00045, 0.0005, 0.007, 6);
wickGeo.translate(0, 0.0035, 0);

// Centre-lines of the digits in a 1 x 1.5 box, as lists of strokes.
function arc(cx, cy, r, a0, a1, n = 24, ry = r) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]);
  }
  return pts;
}
function chaikin(pts, k = 2) {
  let p = pts;
  for (let it = 0; it < k; it++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [a, b] = [p[i], p[i + 1]];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}
const DIGITS = {
  0: () => [{ pts: arc(0.5, 0.75, 0.37, 0, 360, 48, 0.62), closed: true }],
  1: () => [{ pts: chaikin([[0.2, 1.1], [0.56, 1.42], [0.56, 0.06]]) }],
  2: () => [{ pts: chaikin([...arc(0.5, 1.06, 0.36, 160, -38, 24), [0.12, 0.08], [0.92, 0.08]], 2) }],
  3: () => [{ pts: [...arc(0.47, 1.12, 0.31, 150, -90, 20), ...arc(0.47, 0.44, 0.37, 90, -150, 24)] }],
  4: () => [{ pts: chaikin([[0.7, 0.06], [0.7, 1.42], [0.1, 0.5], [0.94, 0.5]], 1) }],
  5: () => [{ pts: [...chaikin([[0.86, 1.42], [0.24, 1.42], [0.19, 0.88]], 1), ...arc(0.5, 0.48, 0.4, 122, -150, 26)] }],
  6: () => [
    { pts: arc(0.5, 0.46, 0.37, 0, 360, 40), closed: true },
    { pts: chaikin([[0.82, 1.34], [0.42, 1.22], [0.16, 0.8], [0.13, 0.48]], 2) },
  ],
  7: () => [{ pts: chaikin([[0.1, 1.42], [0.9, 1.42], [0.36, 0.06]], 1) }],
  8: () => [
    { pts: arc(0.5, 1.1, 0.29, 0, 360, 36), closed: true },
    { pts: arc(0.5, 0.43, 0.37, 0, 360, 40), closed: true },
  ],
  9: () => DIGITS[6]().map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [1 - x, 1.5 - y]) })),
};

// Evenly respaced points along a polyline.
function resample(pts, step, closed) {
  const src = closed ? [...pts, pts[0]] : pts;
  const out = [src[0]];
  let carry = 0;
  for (let i = 0; i < src.length - 1; i++) {
    const [a, b] = [src[i], src[i + 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = step - carry;
    while (d <= L) {
      const t = d / L;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += step;
    }
    carry = L - (d - step);
  }
  if (!closed) out.push(src[src.length - 1]);
  else out.pop();
  return out;
}

const digitCache = new Map();
function digitGeometry(d) {
  if (digitCache.has(d)) return digitCache.get(d);
  const S = 0.032; // metres per box unit
  const r = 0.0068;
  const parts = [];
  let top = [0.5, 0];
  for (const stroke of DIGITS[d]()) {
    const pts = resample(stroke.pts.map(([x, y]) => [x * S, y * S]), 0.0012, stroke.closed);
    for (const p of pts) if (p[1] > top[1]) top = p;
    const path = pts.map(([x, y]) => new THREE.Vector3(x - 0.5 * S, y, 0));
    const len = pts.length;
    const g = sweep(
      path,
      (t) => {
        let k = 1;
        if (!stroke.closed) {
          const dEnd = Math.min(t, 1 - t) * len * 0.0012;
          k = dEnd < r ? Math.sqrt(Math.max(0.02, 1 - Math.pow(1 - dEnd / r, 2))) : 1;
        }
        return circle(r * k, 14);
      },
      { closed: !!stroke.closed },
    );
    parts.push(g);
  }
  const geo = parts.length === 1 ? parts[0] : mergeTwo(parts);
  geo.scale(1, 1, 0.62);
  geo.computeVertexNormals();
  const out = { geo, wick: new THREE.Vector3(top[0] - 0.5 * S, top[1] + r * 0.8, 0), width: S * 1.05 };
  digitCache.set(d, out);
  return out;
}
function mergeTwo(parts) {
  const pos = [];
  const uv = [];
  const idx = [];
  let base = 0;
  for (const g of parts) {
    pos.push(...g.attributes.position.array);
    uv.push(...g.attributes.uv.array);
    idx.push(...Array.from(g.index.array, (i) => i + base));
    base += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

const STRIPES = [
  ['#fdf8f2', '#f28aa5'],
  ['#fdf8f2', '#7fb8e8'],
  ['#fdf8f2', '#f5c451'],
  ['#fdf8f2', '#8fd0a8'],
  ['#fdf8f2', '#b89ae6'],
];
const stripedCache = new Map();
const striped = (pair) => {
  const k = pair.join();
  if (!stripedCache.has(k)) stripedCache.set(k, stripedWax(pair[0], pair[1]));
  return stripedCache.get(k);
};
const regularGeo = new THREE.CylinderGeometry(0.0029, 0.0031, 0.064, 18, 1);
regularGeo.translate(0, 0.032 - 0.01, 0);

// ------------------------------------------------------------ the set

export class Candles {
  // kind: 'regular' (count candles) or 'number' (the digits of `number`)
  constructor(cake, { kind = 'regular', count = 5, number = 0, seed = 1, spot = null } = {}) {
    this.cake = cake;
    this.list = [];
    this.reserved = [];
    const rng = seeded(seed);
    const tiers = cake.tiers;
    const top = tiers[tiers.length - 1];
    const R = top.r;
    // where the candles stand: the middle, or behind a piped message
    const cz = spot ? spot[1] : 0;
    const cx = spot ? spot[0] : 0;
    const mount = (obj, x, z, wick, r) => {
      obj.position.set(x, cake.topAt(x, z), z);
      obj.traverse((o) => {
        if (o.isMesh) {
          o.userData.decoration = true;
          o.castShadow = o !== obj.userData.flame && o !== obj.userData.glow;
        }
      });
      obj.userData.decoration = true;
      cake.addDecoration(obj, x, z, r);
      this.reserved.push({ x, z, r: r + 0.004 });
      const flame = new THREE.Mesh(flameGeo, flameMaterial(rng()));
      flame.position.copy(wick).add(new THREE.Vector3(0, 0.001, 0));
      flame.frustumCulled = false;
      flame.renderOrder = 5;
      flame.castShadow = false;
      flame.userData.decoration = true;
      flame.userData.ownMaterial = true;
      obj.add(flame);
      this.list.push({ obj, flame, wick: wick.clone(), lit: false, amount: 0, resist: 0.45 + rng() * 0.8, blown: 0, out: false });
    };
    if (kind === 'number') {
      const digits = String(Math.max(0, Math.min(99, Math.round(number)))).split('').map(Number);
      const w = 0.036;
      digits.forEach((d, i) => {
        const { geo, wick } = digitGeometry(d);
        const g = new THREE.Group();
        const body = new THREE.Mesh(geo, glitterWax(i % 2 ? '#e7b7c8' : '#e4bf74'));
        body.position.y = 0.004;
        const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0008, 0.014, 6), wickMat);
        // made for this candle alone, so freed with it
        body.userData.ownGeometry = true;
        spike.userData.ownGeometry = true;
        spike.position.set(0, -0.002, 0);
        const w1 = new THREE.Mesh(wickGeo, wickMat);
        const wickAt = wick.clone().add(new THREE.Vector3(0, 0.004, 0));
        w1.position.copy(wickAt);
        g.add(body, spike, w1);
        const x = cx + (i - (digits.length - 1) / 2) * w;
        const z = cz + (spot ? 0 : 0.012);
        g.rotation.y = 0;
        mount(g, x, z, wickAt.clone().add(new THREE.Vector3(0, 0.007, 0)), 0.016);
      });
    } else {
      const n = Math.max(1, Math.min(12, Math.round(count)));
      const pair = STRIPES[Math.floor(rng() * STRIPES.length)];
      const ring = n === 1 ? 0 : Math.min(R * 0.55, 0.012 + n * 0.0045);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng() * 0.2 + 0.3;
        const x = cx + Math.cos(a) * ring;
        const z = cz + Math.sin(a) * ring * (spot ? 0.7 : 1);
        const g = new THREE.Group();
        const body = new THREE.Mesh(regularGeo, striped(n > 3 ? STRIPES[i % STRIPES.length] : pair));
        const w1 = new THREE.Mesh(wickGeo, wickMat);
        w1.position.y = 0.054;
        w1.rotation.z = (rng() - 0.5) * 0.3;
        g.add(body, w1);
        g.rotation.set((rng() - 0.5) * 0.05, rng() * 6.28, (rng() - 0.5) * 0.05);
        mount(g, x, z, new THREE.Vector3(0, 0.061, 0), 0.006);
      }
    }
  }

  get lit() {
    return this.list.filter((c) => c.lit).length;
  }
  get anyLit() {
    return this.list.some((c) => c.lit);
  }
  get allOut() {
    return this.list.every((c) => !c.lit);
  }

  // World position of a candle's wick.
  wickWorld(c, v = new THREE.Vector3()) {
    return c.obj.localToWorld(v.copy(c.wick));
  }

  light(c) {
    if (c.lit) return;
    c.lit = true;
    c.out = false;
    c.blown = 0;
  }

  // Advance flames. `blow` is 0..1 of breath strength; `lean` a screen-space
  // direction the flames bend towards; `rate` how quickly breath puts a
  // flame out. Returns candles that went out.
  update(dt, time, blow, lean, rate = 1.1) {
    const out = [];
    for (const c of this.list) {
      const u = c.flame.material.uniforms;
      u.uTime.value = time;
      const target = c.lit ? 1 : 0;
      c.amount += (target - c.amount) * Math.min(1, dt * (c.lit ? 4 : 14));
      if (c.lit && blow > 0.05) {
        c.blown += dt * blow * blow * rate;
        if (c.blown > c.resist) {
          c.lit = false;
          c.out = true;
          out.push(c);
        }
      } else c.blown = Math.max(0, c.blown - dt * 0.6);
      const squash = c.lit ? 1 - Math.min(0.55, c.blown / c.resist) * blow : 1;
      u.uAmount.value = c.amount * (0.94 + 0.06 * Math.sin(time * 13 + u.uSeed.value * 40)) * squash;
      u.uFlicker.value = Math.min(1, 0.15 + blow * 1.5);
      u.uLean.value.set(lean.x * blow * 1.1, -Math.abs(lean.y) * blow * 0.3);
      c.flame.visible = c.amount > 0.01;
    }
    return out;
  }

  // Warm light from the lit candles: where it sits and how bright.
  glow(target, time) {
    const lit = this.list.filter((c) => c.amount > 0.05);
    if (!lit.length) return 0;
    target.set(0, 0, 0);
    let a = 0;
    const v = new THREE.Vector3();
    for (const c of lit) {
      target.add(this.wickWorld(c, v));
      a += c.amount;
    }
    target.multiplyScalar(1 / lit.length);
    target.y += 0.02;
    return a * (0.93 + 0.07 * Math.sin(time * 17.3) * Math.sin(time * 7.1));
  }
}

// ------------------------------------------------------------ the match

export function createMatch() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.0026, 0.0026, 0.05), new THREE.MeshStandardMaterial({ color: new THREE.Color('#d9b98a'), roughness: 0.8 }));
  stick.position.z = 0.025;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0027, 10, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a1a12'), roughness: 0.7 }));
  head.scale.set(1, 1, 1.4);
  const flame = new THREE.Mesh(flameGeo, flameMaterial(0.37));
  flame.position.set(0, 0.004, -0.001);
  flame.frustumCulled = false;
  flame.renderOrder = 5;
  g.add(stick, head, flame);
  g.userData.flame = flame;
  g.visible = false;
  stick.castShadow = true;
  return g;
}
