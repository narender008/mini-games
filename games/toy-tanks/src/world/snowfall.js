// Snowfall: a light, cheap veil of drifting flakes around the lane. One
// instanced draw of soft quads on LAYER_SOFT (drawn after the lens pass), and
// every flake is moved by the vertex shader alone: it falls, sways and drifts
// downwind, wrapping round a box, so there is nothing to simulate on the CPU
// and no per-frame allocation. The lens pass cannot blur this layer, so each
// flake works out its own defocus from the camera's focus distance and blooms
// into a faint, larger disc when it is nearer or farther than the toys (it
// reads the lens pass's own uniforms, so it blurs exactly like the picture);
// that is what makes the snow look photographed instead of pasted on. Flakes fade
// against the scene depth (SOFT_DEPTH_GLSL), so they slip behind tanks and
// rocks and vanish into the ground without a hard line.
// The sideways drift is integrated on the CPU (an offset that grows with the
// wind and wraps round the box), so a change of wind bends the flakes' path
// from then on instead of shifting every flake by (time x change).
import * as THREE from 'three';
import { LAYER_SOFT, SOFT_DEPTH_GLSL } from '../post.js';
import { rng } from '../config.js';

const VERT = /* glsl */ `
attribute vec4 aPos;    // xyz: where in the box (0..1), w: random
attribute vec4 aFlake;  // radius (m), fall speed (m/s), sway (m), phase
uniform float uTime;
uniform vec3 uMin;
uniform vec3 uSize;
uniform float uOffset;  // how far the wind has carried the flakes sideways, m (wrapped)
uniform float uFocus;   // the lens pass's own uniforms
uniform vec2 uTolerance;
uniform float uAperture;
uniform float uMaxCoC;
uniform vec2 uViewport;
varying vec2 vUv;
varying vec4 vInfo;     // alpha, glint, depth, fade distance
void main() {
  float t = uTime;
  float y = fract(aPos.y - t * aFlake.y / uSize.y);
  float x = fract(aPos.x + uOffset / uSize.x);
  vec3 w = uMin + vec3(x, y, aPos.z) * uSize;
  float ph = aFlake.w * 6.2831853;
  w.x += sin(t * 0.8 + ph) * aFlake.z;
  w.z += cos(t * 0.65 + ph * 1.7) * aFlake.z * 0.7;
  // ends of the box fade, so a flake never pops when it wraps
  float edge = smoothstep(0.0, 0.07, y) * smoothstep(1.0, 0.86, y) * smoothstep(0.0, 0.05, x) * smoothstep(1.0, 0.95, x);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float depth = max(-mv.z, 0.05);
  float pxPerM = uViewport.y * projectionMatrix[1][1] * 0.5 / depth;
  float d = 1.0 / uFocus - 1.0 / depth;
  float coc = clamp((abs(d) - (d < 0.0 ? uTolerance.x : uTolerance.y)) * uAperture, 0.0, uMaxCoC);     // blur radius, px
  float r0 = aFlake.x * pxPerM;
  float r = max(r0, 0.8) + coc;
  // the light of a flake is spread over a bigger disc: fainter as it blurs
  float alpha = edge * (r0 * r0 + 0.5) / (r * r + 0.5);
  alpha = clamp(alpha * 1.5, 0.0, 1.0);
  vec2 q = position.xy;
  mv.xy += q * (r / pxPerM);
  gl_Position = projectionMatrix * mv;
  vUv = q;
  float glint = pow(max(0.0, sin(t * 2.3 + aPos.w * 90.0)), 24.0);
  vInfo = vec4(alpha, glint, depth, 0.06 + coc / pxPerM);
}`;

const FRAG = /* glsl */ `
precision highp float;
${SOFT_DEPTH_GLSL}
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vUv;
varying vec4 vInfo;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0 || vInfo.x < 0.003) discard;
  // a soft disc with a slightly brighter heart
  float a = smoothstep(1.0, 0.25, sqrt(r2)) * vInfo.x * uStrength;
  float vis = softFade(vInfo.z, vInfo.w);
  a *= vis;
  vec3 col = uColor * (1.0 + vInfo.y * 2.5);
  gl_FragColor = vec4(col * a, a);
}`;

export class Snowfall {
  // area: { x: [lo, hi], y: [lo, hi], z: [lo, hi] } the box the flakes live in (metres);
  // lens: app.post.lens.cocU (uFocus, uTolerance, uAperture, uMaxCoC), shared, not copied
  constructor({ softUniforms, lens, quality, count = 900, area = { x: [-2.6, 2.6], y: [0, 1.7], z: [-2.2, 1.0] }, far = 0.3, color = 0xfff4f4, strength = 0.7, seed = 41 }) {
    const R = rng(seed);
    const n = Math.max(60, Math.round(count * (quality.particles ?? 1)));
    const nFar = Math.round(n * far);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const pos = new Float32Array(n * 4);
    const fl = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      pos[i * 4] = R();
      pos[i * 4 + 1] = R();
      pos[i * 4 + 2] = R();
      pos[i * 4 + 3] = R();
      // a few big slow ones and mostly small quick ones
      const big = R() < 0.12;
      fl[i * 4] = big ? 0.0035 + R() * 0.003 : 0.0012 + R() * 0.002;
      fl[i * 4 + 1] = big ? 0.06 + R() * 0.05 : 0.09 + R() * 0.1;
      fl[i * 4 + 2] = 0.02 + R() * 0.05;
      fl[i * 4 + 3] = R();
    }
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 4));
    geo.setAttribute('aFlake', new THREE.InstancedBufferAttribute(fl, 4));
    geo.instanceCount = n;
    this.uniforms = {
      ...softUniforms,
      uTime: { value: 0 },
      uMin: { value: new THREE.Vector3(area.x[0], area.y[0], area.z[0]) },
      uSize: { value: new THREE.Vector3(area.x[1] - area.x[0], area.y[1] - area.y[0], area.z[1] - area.z[0]) },
      uOffset: { value: 0 },
      uFocus: lens?.uFocus ?? { value: 1.7 },
      uTolerance: lens?.uTolerance ?? { value: new THREE.Vector2(0.15, 0.15) },
      uAperture: lens?.uAperture ?? { value: 22 },
      uMaxCoC: lens?.uMaxCoC ?? { value: 10 },
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.group = new THREE.Group();
    const near = new THREE.Mesh(geo, mat);
    near.frustumCulled = false;
    near.renderOrder = 15;
    near.layers.set(LAYER_SOFT);
    geo.instanceCount = n - nFar;
    this.group.add(near);
    // the far ones: a wide, deep box down the valley, with their own uniforms
    if (nFar > 0) {
      const g2 = new THREE.InstancedBufferGeometry();
      g2.index = geo.index;
      g2.setAttribute('position', geo.getAttribute('position'));
      g2.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos.subarray((n - nFar) * 4), 4));
      const fl2 = fl.slice((n - nFar) * 4);
      // bigger flakes, so they still read from afar
      for (let i = 0; i < nFar; i++) fl2[i * 4] *= 2.6;
      g2.setAttribute('aFlake', new THREE.InstancedBufferAttribute(fl2, 4));
      g2.instanceCount = nFar;
      const u2 = { ...this.uniforms, uOffset: { value: 0 }, uMin: { value: new THREE.Vector3(-9, 0, -16) }, uSize: { value: new THREE.Vector3(18, 5, 14.5) } };
      this.farUniforms = u2;
      const m2 = mat.clone();
      m2.uniforms = u2;
      const far = new THREE.Mesh(g2, m2);
      far.frustumCulled = false;
      far.renderOrder = 15;
      far.layers.set(LAYER_SOFT);
      this.group.add(far);
      this.meshes = [near, far];
    } else this.meshes = [near];
    this.drift = 0.05;
    this.group.name = 'snowfall';
  }

  update(dt, time, app) {
    const U = this.uniforms;
    U.uTime.value = time;
    // the wind eases in and out; the offset it has carried the flakes is integrated, then wrapped
    const wind = app.world.wind ?? 0;
    this.drift += (0.03 + wind * 0.45 - this.drift) * Math.min(1, dt * 1.5);
    const w = U.uSize.value.x;
    U.uOffset.value = (U.uOffset.value + this.drift * dt) % w;
    if (this.farUniforms) this.farUniforms.uOffset.value = (this.farUniforms.uOffset.value + this.drift * 1.4 * dt) % this.farUniforms.uSize.value.x;
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}
