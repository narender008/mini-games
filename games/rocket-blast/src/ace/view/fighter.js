// The Ace fighter: a sleek interceptor about 1.3 units nose to tail. White
// clear-coated paint over gunmetal, a red spine stripe and wing chevrons, a
// dark tinted canopy, twin engines with cyan nozzles and real cyan flames,
// gun ports at the wing roots. It banks into sideways moves (roll about its
// long axis, so the camera sees the wings foreshorten), noses up a touch when
// climbing, flickers while invulnerable after a hit, and wears a shield
// bubble (fresnel rim with a crawling hex shimmer) while the shield holds a
// charge. Wing drones are small cyan-lit pods at the sim's drone positions.
import * as THREE from 'three';
import { Builder, MAT, core, slab, sym, lathe, GEO } from './kit.js';
import { SHAPE } from './bolts.js';

const flameVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// A narrow jet of ion fire: white at the nozzle, cyan, then blue at the tip.
const flameFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform float uPower;
uniform float uSeed;
varying vec2 vUv;
void main() {
  float along = 1.0 - vUv.y;
  float x = (vUv.x - 0.5) * 2.0;
  float n = texture2D(uNoise, vec2(vUv.x * 0.7 + uSeed, along * 0.8 + uTime * 3.1)).r;
  float width = mix(0.8, 0.1, pow(along, 0.7)) * (0.85 + 0.3 * n);
  float body = smoothstep(width, width * 0.3, abs(x));
  float len = along / max(0.25, uPower);
  float tip = smoothstep(1.0, 0.35 + 0.3 * n, len);
  float a = body * tip;
  float coreK = smoothstep(0.5, 0.0, len) * smoothstep(width * 0.7, 0.0, abs(x));
  vec3 col = mix(vec3(0.1, 0.3, 1.0), vec3(0.3, 0.9, 1.0), smoothstep(0.0, 0.6, a));
  col = mix(col, vec3(1.0, 1.0, 1.0), coreK);
  gl_FragColor = vec4(col * a * (1.4 + coreK * 2.5), 0.0);
}`;

const shieldVertex = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const shieldFragment = /* glsl */ `
uniform float uTime;
uniform float uCharge;
uniform float uHit;
uniform vec3 uColor;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(f, 4.0) + smoothstep(0.93, 1.0, f) * 0.8;
  // hex cells crawling over the bubble
  vec2 q = vP.xy * 9.0 + vec2(0.0, uTime * 0.6);
  vec2 r = vec2(1.0, 1.732);
  vec2 h = r * 0.5;
  vec2 a = mod(q, r) - h;
  vec2 b = mod(q - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  float edge = smoothstep(0.42, 0.5, max(abs(g.x) * 0.866 + abs(g.y) * 0.5, abs(g.y)));
  float sweep = 0.5 + 0.5 * sin(vP.y * 6.0 - uTime * 4.0 + vP.x * 2.0);
  float hex = edge * sweep * pow(f, 2.0) * 0.6;
  float k = uCharge;
  vec3 c = uColor * (rim * 1.8 + hex * 0.5 + 0.015) * k + vec3(1.0) * uHit * (rim + 0.25);
  gl_FragColor = vec4(c, 0.0);
}`;

export class Fighter {
  constructor({ noise }) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.vx = 0;
    this.lastX = null;
    this.lastY = null;
    this.bank = 0;
    this.pitch = 0;
    this.shieldShow = 0;
    this.shieldHit = 0;
    this.build(noise);
  }

  build(noise) {
    const b = new Builder();
    const white = MAT.white();
    const gun = MAT.gunmetal();
    const dark = MAT.dark();
    const red = MAT.red();
    const cyan = core('cyan', 4);
    // fuselage: a flattened body of revolution, pointed nose up (+y)
    const fus = lathe(
      [
        [0.0, -0.5],
        [0.1, -0.5],
        [0.14, -0.42],
        [0.155, -0.2],
        [0.15, 0.05],
        [0.13, 0.25],
        [0.095, 0.45],
        [0.05, 0.62],
        [0.0, 0.72],
      ],
      28,
    );
    b.add(fus, white, { s: [1, 1, 0.72] });
    // dark nose tip and intake rings
    b.add(GEO.cone, gun, { p: [0, 0.68, 0], s: [0.06, 0.1, 0.045] });
    // canopy: a long tinted bubble on top (z+)
    b.add(GEO.sphere, MAT.glass(), { p: [0, 0.26, 0.075], s: [0.13, 0.36, 0.11] });
    b.add(GEO.torus, gun, { p: [0, 0.26, 0.06], r: [0, 0, 0], s: [0.15, 0.38, 0.6] });
    // red spine stripe running back from the canopy
    b.add(GEO.box, red, { p: [0, -0.15, 0.108], s: [0.035, 0.5, 0.02] });
    b.add(GEO.box, red, { p: [0, 0.52, 0.065], r: [-0.25, 0, 0], s: [0.025, 0.14, 0.02] });
    // main wings: swept delta, white with gunmetal root panel
    const wing = slab(
      [
        [0.1, 0.22],
        [0.62, -0.28],
        [0.64, -0.4],
        [0.48, -0.4],
        [0.1, -0.36],
      ],
      0.035,
      0.012,
    );
    b.mirror(wing, white, { p: [0, 0, 0] });
    const root = slab(
      [
        [0.1, 0.12],
        [0.32, -0.08],
        [0.32, -0.34],
        [0.1, -0.34],
      ],
      0.05,
      0.01,
    );
    b.mirror(root, gun, { p: [0, 0, 0.005] });
    // red chevrons near the wing tips and a red leading-edge band
    const chev = slab(
      [
        [0.44, -0.12],
        [0.56, -0.24],
        [0.56, -0.3],
        [0.44, -0.18],
      ],
      0.05,
      0.004,
    );
    b.mirror(chev, red, { p: [0, 0, 0.004] });
    // wing-tip pods
    b.mirror(GEO.cyl, gun, { p: [0.63, -0.3, 0], s: [0.035, 0.26, 0.035] });
    // canards
    const can = slab(
      [
        [0.08, 0.42],
        [0.24, 0.3],
        [0.24, 0.26],
        [0.08, 0.32],
      ],
      0.025,
      0.008,
    );
    b.mirror(can, gun);
    // engine nacelles with nozzles
    b.mirror(GEO.cyl, gun, { p: [0.12, -0.36, -0.01], s: [0.11, 0.34, 0.1] });
    b.mirror(lathe([[0.05, 0], [0.065, -0.02], [0.07, -0.08], [0.05, -0.08]], 20), dark, { p: [0.12, -0.51, -0.01] });
    b.mirror(GEO.disc, cyan, { p: [0.12, -0.585, -0.01], s: [0.09, 1, 0.09] });
    // tail fins: canted outwards, tipped red
    const fin = slab(
      [
        [0, 0],
        [0.16, -0.06],
        [0.2, -0.2],
        [0.0, -0.18],
      ],
      0.02,
      0.008,
    );
    b.mirror(fin, gun, { p: [0.16, -0.24, 0.05], r: [0, -1.1, 0] });
    // gun barrels at the wing roots
    b.mirror(GEO.cyl, dark, { p: [0.2, 0.18, 0], s: [0.025, 0.2, 0.025] });
    // cyan running lights
    b.mirror(GEO.box, cyan, { p: [0.36, -0.36, 0.02], s: [0.12, 0.018, 0.02] });
    b.add(GEO.sphere, cyan, { p: [0, -0.05, 0.12], s: 0.04 });
    this.body.add(b.group());

    // flames
    this.flames = [];
    const flameGeo = new THREE.PlaneGeometry(0.2, 0.9);
    flameGeo.translate(0, -0.45, 0);
    for (const side of [-1, 1]) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uNoise: { value: noise }, uTime: { value: 0 }, uPower: { value: 1 }, uSeed: { value: side * 0.37 } },
        vertexShader: flameVertex,
        fragmentShader: flameFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      const f = new THREE.Mesh(flameGeo, mat);
      f.position.set(side * 0.12, -0.58, -0.01);
      f.renderOrder = 6;
      this.body.add(f);
      this.flames.push(f);
    }

    // shield bubble
    this.shieldMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCharge: { value: 1 }, uHit: { value: 0 }, uColor: { value: new THREE.Color(0.25, 0.85, 1.2) } },
      vertexShader: shieldVertex,
      fragmentShader: shieldFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(0.88, 40, 24), this.shieldMat);
    this.shield.scale.set(1, 1.02, 0.7);
    this.shield.renderOrder = 18;
    this.root.add(this.shield);

    // wing drones (pooled, 4 at most)
    const d = new Builder();
    d.add(lathe([[0, 0.16], [0.06, 0.1], [0.075, -0.04], [0.05, -0.12], [0, -0.12]], 16), MAT.white(), { s: [1, 1, 0.8] });
    d.mirror(slab([[0.04, 0.02], [0.14, -0.08], [0.14, -0.11], [0.04, -0.08]], 0.02, 0.006), gun);
    d.add(GEO.torus, cyan, { p: [0, -0.02, 0.0], r: [Math.PI / 2, 0, 0], s: [0.17, 0.17, 0.4] });
    this.droneGeo = d;
    this.drones = [];
    for (let i = 0; i < 4; i++) {
      const g = d.group();
      g.visible = false;
      this.drones.push(g);
    }
  }

  // drones live in world space, beside the fighter
  attach(parent) {
    parent.add(this.root);
    for (const g of this.drones) parent.add(g);
  }

  // p: S.player; returns the nozzle glow positions in `out` for the bolts
  update(p, dt, t, bolts) {
    const root = this.root;
    if (!p || p.dead) {
      root.visible = false;
      for (const g of this.drones) g.visible = false;
      this.lastX = null;
      return;
    }
    root.visible = true;
    // velocity: prefer the sim's, fall back to differencing
    let vx = p.vx;
    let vy = p.vy;
    if (vx === undefined && this.lastX !== null && dt > 0) {
      vx = (p.x - this.lastX) / dt;
      vy = (p.y - this.lastY) / dt;
    }
    vx = vx || 0;
    vy = vy || 0;
    this.lastX = p.x;
    this.lastY = p.y;
    const k = 1 - Math.exp(-dt * 12);
    this.bank += (Math.max(-0.75, Math.min(0.75, vx * 0.07)) - this.bank) * k;
    this.pitch += (Math.max(-0.25, Math.min(0.25, vy * 0.025)) - this.pitch) * k;
    root.position.set(p.x, p.y, 0);
    this.body.rotation.set(this.pitch, this.bank, -this.bank * 0.12);

    // invulnerable after a hit: flicker (hidden every other 1/15 s)
    const inv = p.invuln > 0;
    this.body.visible = !inv || Math.floor(t * 15) % 2 === 0;

    // flames: longer when climbing, flutter
    const power = Math.max(0.55, Math.min(1.6, 1 + vy * 0.05)) * (0.92 + 0.06 * Math.sin(t * 41) + 0.04 * Math.sin(t * 27));
    for (const f of this.flames) {
      f.material.uniforms.uTime.value = t;
      f.material.uniforms.uPower.value = power;
      f.scale.set(1, power, 1);
    }

    // shield bubble: fades in with charge, bright flash when it takes a hit
    const charged = (p.shields ?? 0) > 0 || (p.shield ?? 0) >= 1;
    const target = charged ? 1 : 0;
    this.shieldShow += (target - this.shieldShow) * (1 - Math.exp(-dt * 8));
    this.shieldHit = Math.max(0, this.shieldHit - dt * 3);
    const show = this.shieldShow + this.shieldHit;
    this.shield.visible = show > 0.02;
    this.shieldMat.uniforms.uTime.value = t;
    this.shieldMat.uniforms.uCharge.value = this.shieldShow * (0.85 + 0.15 * Math.sin(t * 3)) * ((p.shields ?? 1) > 1 ? 1.35 : 1);
    this.shieldMat.uniforms.uHit.value = this.shieldHit;
    // a faint recharge ring that fills as the shield charges
    if (!charged && bolts && (p.shield ?? 0) > 0.02) {
      bolts.push(SHAPE.RING, p.x, p.y, 0, 1.0, 1.0, 0.8, 0.012, 0.2 * p.shield, 0.6 * p.shield, 0.9 * p.shield, 0);
    }

    // nozzle glows
    if (bolts) {
      const cb = Math.cos(this.bank);
      for (const s of [-1, 1]) bolts.glow(p.x + s * 0.12 * cb, p.y - 0.62, 0.45 * power, 0.25, 0.7, 1.2);
    }

    // drones
    const ds = p.drones || [];
    for (let i = 0; i < this.drones.length; i++) {
      const g = this.drones[i];
      const d = ds[i];
      g.visible = !!d;
      if (!d) continue;
      g.position.set(d.x, d.y + Math.sin(t * 3 + i) * 0.04, 0);
      g.rotation.set(0, this.bank * 0.8, 0);
      if (bolts) bolts.glow(d.x, d.y - 0.14, 0.28, 0.2, 0.6, 1.0);
    }
  }

  hitShield() {
    this.shieldHit = 1;
  }
}
