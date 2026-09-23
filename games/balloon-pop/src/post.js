// Post-processing: HDR render, shock-wave refraction from each pop, bloom,
// filmic (ACES) tone mapping, then a light vignette and film grain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MAX_SHOCKS = 4;

const DistortShader = {
  uniforms: {
    tDiffuse: { value: null },
    uShocks: { value: Array.from({ length: MAX_SHOCKS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uAspect: { value: 1 },
    uAberration: { value: 0 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec4 uShocks[${MAX_SHOCKS}]; // xy centre (uv), z radius (uv, x-scaled), w strength
uniform float uAspect;
uniform float uAberration;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  vec2 offset = vec2(0.0);
  for (int i = 0; i < ${MAX_SHOCKS}; i++) {
    vec4 s = uShocks[i];
    if (s.w <= 0.0) continue;
    vec2 d = uv - s.xy;
    d.x *= uAspect;
    float r = length(d) + 1e-5;
    float x = (r - s.z) / (0.035 + s.z * 0.25);
    float ring = exp(-x * x) * s.w;
    offset += (d / r) * ring * 0.02;
  }
  uv -= vec2(offset.x / uAspect, offset.y);
  vec2 c = uv - 0.5;
  float ab = uAberration * dot(c, c);
  vec3 col;
  col.r = texture2D(tDiffuse, uv - c * ab).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv + c * ab).b;
  // never let a stray NaN/Inf reach the bloom blur, where it would spread
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  gl_FragColor = vec4(min(col, vec3(2000.0)), 1.0);
}`,
};

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.32 },
    uAspect: { value: 1 },
  },
  vertexShader: DistortShader.vertexShader,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uGrain;
uniform float uVignette;
uniform float uAspect;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 7.13) * 43758.5453); }
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  vec2 d = vUv - 0.5;
  d.x *= mix(1.0, uAspect, 0.5);
  float v = 1.0 - uVignette * smoothstep(0.25, 0.95, length(d) * 1.2);
  c.rgb *= v;
  float g = hash(vUv * vec2(1713.0, 997.0)) - 0.5;
  c.rgb += g * uGrain * (1.0 - c.rgb * 0.6);
  gl_FragColor = vec4(c.rgb, 1.0);
}`,
};

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality.msaa,
    });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.distort = new ShaderPass(DistortShader);
    this.composer.addPass(this.distort);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.62, 0.92);
    this.composer.addPass(this.bloom);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.shocks = [];
    this.bloomBase = 0.55;
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.distort.uniforms.uAspect.value = w / h;
    this.finish.uniforms.uAspect.value = w / h;
  }

  // Start a refractive shock ring centred on a screen point.
  shock(uv, radius, strength) {
    this.shocks.push({ uv: uv.clone(), r0: radius, age: 0, strength });
    if (this.shocks.length > MAX_SHOCKS) this.shocks.shift();
  }

  update(dt, realDt, time, { slowmo = 0 } = {}) {
    const arr = this.distort.uniforms.uShocks.value;
    for (let i = 0; i < MAX_SHOCKS; i++) arr[i].set(0, 0, 0, 0);
    const life = 0.35;
    for (const s of this.shocks) s.age += dt;
    this.shocks = this.shocks.filter((s) => s.age <= life);
    this.shocks.forEach((s, i) => {
      const k = s.age / life;
      arr[i].set(s.uv.x, s.uv.y, s.r0 + k * 0.35, s.strength * (1 - k) * (1 - k));
    });
    this.distort.uniforms.uAberration.value = 0.012 * slowmo;
    this.bloom.strength = this.bloomBase + slowmo * 0.25;
    this.finish.uniforms.uTime.value = time % 100;
  }

  render(realDt) {
    this.composer.render(realDt);
  }
}
