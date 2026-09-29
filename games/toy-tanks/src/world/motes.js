// Wind motes: the little things that drift on the air around the lane
// (dandelion fluff and pollen in the meadow, sand grains on the beach,
// seeds in the forest), so the wind shows in the picture as well as on the
// flag: they sail downwind faster the stronger it blows and hang lazily when
// it is calm. One instanced draw of soft quads on LAYER_SOFT, moved in the
// vertex shader; the downwind distance is added up on the CPU each frame so
// a change of wind never makes them jump. Being drawn after the lens pass,
// each mote works out its own defocus from the lens's own uniforms and grows
// into a faint disc when it is nearer or farther than the toys.
import * as THREE from 'three';
import { LAYER_SOFT, SOFT_DEPTH_GLSL } from '../post.js';
import { rng } from '../config.js';

const VERT = /* glsl */ `
attribute vec4 aPos;     // xyz: where in the box (0..1), w: random
attribute vec4 aMote;    // radius (m), rise/fall speed (m/s, + is up), bob (m), phase
uniform float uTime;
uniform float uOffset;   // downwind distance so far, m
uniform vec3 uMin;
uniform vec3 uSize;
uniform float uFocus;
uniform vec2 uTolerance;
uniform float uAperture;
uniform float uMaxCoC;
uniform vec2 uViewport;
varying vec2 vUv;
varying vec4 vInfo;      // alpha, twinkle, depth, fade distance
void main() {
  float t = uTime;
  float ph = aMote.w * 6.2831853;
  float x = fract(aPos.x + (uOffset * (0.75 + 0.5 * aPos.w)) / uSize.x);
  float y = fract(aPos.y + t * aMote.y / uSize.y);
  vec3 w = uMin + vec3(x, y, aPos.z) * uSize;
  w.y += sin(t * 0.9 + ph) * aMote.z;
  w.z += cos(t * 0.7 + ph * 1.3) * aMote.z * 0.8;
  // fade in and out at the ends of the box, so nothing pops when it wraps
  float edge = smoothstep(0.0, 0.08, x) * smoothstep(1.0, 0.92, x) * smoothstep(0.0, 0.1, y) * smoothstep(1.0, 0.9, y);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float depth = max(-mv.z, 0.05);
  float pxPerM = uViewport.y * projectionMatrix[1][1] * 0.5 / depth;
  float d = 1.0 / uFocus - 1.0 / depth;
  float coc = clamp((abs(d) - (d < 0.0 ? uTolerance.x : uTolerance.y)) * uAperture, 0.0, uMaxCoC);
  float r0 = aMote.x * pxPerM;
  float r = max(r0, 0.9) + coc;
  // the same light spread over a bigger disc is fainter
  float alpha = edge * clamp((r0 * r0 + 0.6) / (r * r + 0.6) * 1.6, 0.0, 1.0);
  mv.xy += position.xy * (r / pxPerM);
  gl_Position = projectionMatrix * mv;
  vUv = position.xy;
  float twinkle = pow(max(0.0, sin(t * 1.7 + aPos.w * 80.0)), 16.0);
  vInfo = vec4(alpha, twinkle, depth, 0.05 + coc / pxPerM);
}`;

const FRAG = /* glsl */ `
precision highp float;
${SOFT_DEPTH_GLSL}
uniform vec3 uColor;
uniform float uFluff;    // 1 = a dandelion seed's soft star of fibres, 0 = a plain grain
varying vec2 vUv;
varying vec4 vInfo;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float disc = smoothstep(1.0, 0.55, r);
  float a = atan(vUv.y, vUv.x);
  float fibres = mix(1.0, 0.55 + 0.45 * pow(abs(cos(a * 4.0)), 6.0), uFluff * smoothstep(0.2, 0.6, r));
  float core = smoothstep(0.5, 0.0, r);
  float alpha = vInfo.x * disc * fibres * (0.55 + 0.45 * core);
  alpha *= softFade(vInfo.z, vInfo.w);
  if (alpha < 0.004) discard;
  vec3 c = uColor * (1.0 + core * 0.4 + vInfo.y * 1.5);
  gl_FragColor = vec4(c * alpha, alpha);
}`;

// spec: { count, box: [x0, x1, y0, y1, z0, z1], size: [r0, r1] m, color, fluff 0..1, rise [a, b] m/s, bob m, calm (m/s drift with no wind), windScale }
export class Motes {
  constructor({ post, quality, spec }) {
    const S = { count: 180, box: [-1.8, 1.8, 0.02, 0.7, -0.7, 0.45], size: [0.0015, 0.004], color: 0xfffbe8, fluff: 1, rise: [-0.01, 0.02], bob: 0.02, calm: 0.02, windScale: 0.5, ...spec };
    this.spec = S;
    const n = Math.max(8, Math.round(S.count * (quality.particles ?? 1)));
    const R = rng(4242);
    const pos = new Float32Array(n * 4);
    const mote = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      pos.set([R(), R(), R(), R()], i * 4);
      mote.set([S.size[0] + (S.size[1] - S.size[0]) * Math.pow(R(), 2), S.rise[0] + R() * (S.rise[1] - S.rise[0]), S.bob * (0.5 + R()), R()], i * 4);
    }
    const quad = new THREE.PlaneGeometry(2, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 4));
    geo.setAttribute('aMote', new THREE.InstancedBufferAttribute(mote, 4));
    geo.instanceCount = n;
    const [x0, x1, y0, y1, z0, z1] = S.box;
    const lens = post.lens.cocU;
    this.uniforms = {
      ...post.softUniforms,
      uFocus: lens.uFocus,
      uTolerance: lens.uTolerance,
      uAperture: lens.uAperture,
      uMaxCoC: lens.uMaxCoC,
      uTime: { value: 0 },
      uOffset: { value: 0 },
      uMin: { value: new THREE.Vector3(x0, y0, z0) },
      uSize: { value: new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0) },
      uColor: { value: new THREE.Color(S.color) },
      uFluff: { value: S.fluff },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
    this.mesh.layers.set(LAYER_SOFT);
    this.mesh.name = 'motes';
    this.drift = S.calm;
  }

  update(dt, time, world) {
    const U = this.uniforms;
    U.uTime.value = time;
    const want = this.spec.calm * Math.sign(world.wind || 1) + (world.wind ?? 0) * this.spec.windScale;
    this.drift += (want - this.drift) * Math.min(1, dt * 1.2);
    // keep it small, so the shader's arithmetic stays exact
    U.uOffset.value = (U.uOffset.value + this.drift * dt) % (U.uSize.value.x * 1000);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
