// Falling rain: a few hundred soft streaks in a box around the lane, drawn on
// the see-through layer after the lens (LAYER_SOFT) and fading against the
// scene depth, so nothing cuts a hard line against the ground or a leaf.
// Every drop is a slanted streak that falls for ever inside the box (the
// vertex shader wraps it round), leaning with the wind. To look like
// rain through a real lens, drops far from the focus are drawn wider and
// fainter (the same circle of confusion the lens pass uses), so the ones
// behind the fence melt into soft light streaks and only those near the
// tanks stay thin and crisp. One instanced draw, nothing per frame but a few
// uniforms.
import * as THREE from 'three';
import { LAYER_SOFT, SOFT_DEPTH_GLSL } from '../post.js';
import { rng } from '../config.js';

const VERT = /* glsl */ `
attribute vec4 aRain;   // x, start height, z, speed factor
attribute vec2 aRand;
uniform float uTime;
uniform float uWind;
uniform float uTop;
uniform float uLen;
uniform float uViewH;
uniform float uFocus;
uniform vec2 uTolerance;
uniform float uAperture;
uniform float uMaxCoC;
varying vec2 vUv;
varying float vAlpha;
varying float vDepth;
void main() {
  float speed = 6.0 + aRain.w * 3.0;
  float y = mod(aRain.y - uTime * speed, uTop);
  vec3 vel = vec3(uWind * 4.0 + 0.3, -speed, 0.0);
  vec3 dir = normalize(vel);
  // the path is a slanted line: the further it has fallen, the more it has drifted
  vec3 head = vec3(aRain.x + vel.x * (uTop - y) / speed, y, aRain.z);
  float len = uLen * (0.65 + 0.7 * aRand.x);
  vec3 vc = (viewMatrix * vec4(head - dir * len * 0.5, 1.0)).xyz;
  vec3 dv = mat3(viewMatrix) * dir;
  float depth = -vc.z;
  float pxPerM = uViewH * projectionMatrix[1][1] * 0.5 / max(depth, 0.05);
  float d = 1.0 / uFocus - 1.0 / max(depth, 0.05);
  float coc = clamp((abs(d) - (d < 0.0 ? uTolerance.x : uTolerance.y)) * uAperture, 0.0, uMaxCoC);
  float widthPx = max(1.5, 0.9 + coc * 0.75);
  float w = widthPx / pxPerM;
  vec2 sd = vec2(dv.y, -dv.x);
  float sl = length(sd);
  sd = sl > 1e-3 ? sd / sl : vec2(1.0, 0.0);
  vec3 p = vc + dv * (position.y * len);
  p.xy += sd * position.x * w;
  gl_Position = projectionMatrix * vec4(p, 1.0);
  // fade in at the top of the box, out at the ground, near the lens and far away
  float env = smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(uTop - 0.4, uTop, y));
  env *= smoothstep(0.2, 0.6, depth) * (1.0 - smoothstep(5.0, 11.0, depth));
  vAlpha = env * (0.55 + 0.45 * aRand.y) / (0.6 + widthPx * 0.4);
  vUv = vec2(position.x * 2.0, position.y * 2.0);
  vDepth = depth;
}`;

const FRAG = /* glsl */ `
${SOFT_DEPTH_GLSL}
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
varying float vAlpha;
varying float vDepth;
void main() {
  float across = 1.0 - smoothstep(0.2, 1.0, abs(vUv.x));
  // brightest at the falling end, fading up the streak
  float along = smoothstep(-1.0, 0.7, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
  float a = vAlpha * uAlpha * across * along * softFade(vDepth, 0.08);
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

export class Rain {
  // area: [x0, x1, z0, z1] the box the rain falls in; top: its height (m)
  constructor({ quality, softUniforms, lensUniforms, count = 900, area = [-3.4, 3.4, -6.5, 2.4], top = 3.2, color = 0xdfe8f0, alpha = 0.5, length = 0.32, seed = 91 }) {
    const R = rng(seed);
    const n = Math.max(80, Math.round(count * Math.min(1, quality.particles + 0.2)));
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    const rain = new Float32Array(n * 4);
    const rand = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      // denser in the middle distance, where the lens is looking through it
      const z = area[2] + (area[3] - area[2]) * Math.pow(R(), 0.8);
      rain[i * 4] = area[0] + R() * (area[1] - area[0]);
      rain[i * 4 + 1] = R() * top;
      rain[i * 4 + 2] = z;
      rain[i * 4 + 3] = R();
      rand[i * 2] = R();
      rand[i * 2 + 1] = R();
    }
    geo.setAttribute('aRain', new THREE.InstancedBufferAttribute(rain, 4));
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 2));
    geo.instanceCount = n;
    this.count = n;
    this.uniforms = {
      ...softUniforms,
      ...lensUniforms,
      uTime: { value: 0 },
      uWind: { value: 0 },
      uTop: { value: top },
      uLen: { value: length },
      uViewH: { value: 900 },
      uColor: { value: new THREE.Color(color) },
      uAlpha: { value: alpha },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER_SOFT);
    this.mesh.renderOrder = 6;
    this.mesh.name = 'rain';
  }

  update(dt, time, app) {
    const U = this.uniforms;
    U.uTime.value = time;
    U.uWind.value += ((app.world.wind ?? 0) - U.uWind.value) * Math.min(1, dt * 1.5);
    U.uViewH.value = app.view.h * app.dpr;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
