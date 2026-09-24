// Post-processing: HDR render, a soft shock ripple from big blasts, bloom,
// filmic tone mapping, then a light grade (saturation back, soft vignette).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MAX_SHOCKS = 4;

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const RippleShader = {
  uniforms: {
    tDiffuse: { value: null },
    uShocks: { value: Array.from({ length: MAX_SHOCKS }, () => new THREE.Vector4()) },
    uAspect: { value: 1 },
  },
  vertexShader,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec4 uShocks[${MAX_SHOCKS}];
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  vec2 off = vec2(0.0);
  for (int i = 0; i < ${MAX_SHOCKS}; i++) {
    vec4 s = uShocks[i];
    if (s.w <= 0.0) continue;
    vec2 d = uv - s.xy;
    d.x *= uAspect;
    float r = length(d) + 1e-5;
    float x = (r - s.z) / (0.03 + s.z * 0.25);
    off += (d / r) * exp(-x * x) * s.w * 0.012;
  }
  uv -= vec2(off.x / uAspect, off.y);
  vec3 col = texture2D(tDiffuse, uv).rgb;
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  gl_FragColor = vec4(min(col, vec3(1000.0)), 1.0);
}`,
};

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.1 },
    uVignette: { value: 0.12 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uAspect: { value: 1 },
  },
  vertexShader,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uSaturation;
uniform float uVignette;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(mix(vec3(l), c, uSaturation), 0.0, 1.0);
  vec2 d = vUv - 0.5;
  d.x *= mix(1.0, uAspect, 0.5);
  c *= 1.0 - uVignette * smoothstep(0.3, 0.95, length(d) * 1.2);
  c = mix(c, uFlashColor, uFlash);
  gl_FragColor = vec4(c, 1.0);
}`,
};

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality.msaa });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.ripple = new ShaderPass(RippleShader);
    this.composer.addPass(this.ripple);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.45, 1.25);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.shocks = [];
    this.bloomBase = 0.42;
    this.bloomBoost = 0;
    this.flash = 0;
  }

  setSize(w, h, dpr) {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.ripple.uniforms.uAspect.value = w / h;
    this.finish.uniforms.uAspect.value = w / h;
  }

  shock(uv, radius, strength) {
    this.shocks.push({ uv: uv.clone(), r0: radius, age: 0, strength });
    if (this.shocks.length > MAX_SHOCKS) this.shocks.shift();
  }

  // a soft full-screen wash, used for the gentle storm flashes
  wash(amount, color) {
    this.flash = Math.max(this.flash, amount);
    if (color) this.finish.uniforms.uFlashColor.value.set(color);
  }

  update(dt) {
    const arr = this.ripple.uniforms.uShocks.value;
    for (const v of arr) v.set(0, 0, 0, 0);
    const life = 0.4;
    for (const s of this.shocks) s.age += dt;
    this.shocks = this.shocks.filter((s) => s.age <= life);
    this.shocks.forEach((s, i) => {
      const k = s.age / life;
      arr[i].set(s.uv.x, s.uv.y, s.r0 + k * 0.3, s.strength * (1 - k) * (1 - k));
    });
    this.bloomBoost *= Math.exp(-dt * 3);
    this.bloom.strength = this.bloomBase + this.bloomBoost;
    this.flash *= Math.exp(-dt * 6);
    this.finish.uniforms.uFlash.value = this.flash;
  }

  render() {
    this.composer.render();
  }
}
