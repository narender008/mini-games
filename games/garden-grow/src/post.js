// Post-processing, like a real camera: an HDR render with depth, then a lens
// pass with ambient occlusion (from the depth buffer, at half resolution)
// and a gentle depth of field focused on the bed, so the fence and trees
// behind melt into soft bokeh; bloom for the low sun, dew and fireflies; AgX
// filmic tone mapping; and a light grade with vignette and film grain. At
// bedtime the whole picture dims.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const VIEWPOS = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uInvProj;
vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}`;

const AO_FRAG = /* glsl */ `
${VIEWPOS}
uniform vec2 uRes;
uniform mat4 uProj;
uniform float uRadius;
uniform float uIntensity;
varying vec2 vUv;
#define SAMPLES 12
void main() {
  float d = texture2D(tDepth, vUv).x;
  if (d >= 1.0) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  vec2 t = 1.0 / uRes;
  vec3 pr = viewPos(vUv + vec2(t.x, 0.0)) - P;
  vec3 pl = P - viewPos(vUv - vec2(t.x, 0.0));
  vec3 pu = viewPos(vUv + vec2(0.0, t.y)) - P;
  vec3 pd = P - viewPos(vUv - vec2(0.0, t.y));
  vec3 dx = abs(pr.z) < abs(pl.z) ? pr : pl;
  vec3 dy = abs(pu.z) < abs(pd.z) ? pu : pd;
  vec3 N = normalize(cross(dx, dy));
  float rPx = uRadius * uProj[1][1] / -P.z * 0.5 * uRes.y;
  if (rPx < 1.0) { gl_FragColor = vec4(1.0); return; }
  float spin = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  float occ = 0.0;
  float r2 = uRadius * uRadius;
  for (int i = 0; i < SAMPLES; i++) {
    float f = (float(i) + 0.5) / float(SAMPLES);
    float a = float(i) * 2.39996 + spin;
    vec2 off = vec2(cos(a), sin(a)) * f * rPx * t;
    vec3 S = viewPos(vUv + off);
    vec3 v = S - P;
    float vv = dot(v, v);
    float vn = dot(v, N);
    float fall = max(0.0, 1.0 - vv / r2);
    occ += max(0.0, vn - 0.002 * -P.z) / (vv + 0.0002) * fall * fall;
  }
  float ao = max(0.0, 1.0 - uIntensity * occ * uRadius / float(SAMPLES));
  gl_FragColor = vec4(vec3(ao), 1.0);
}`;

const BLUR_FRAG = /* glsl */ `
${VIEWPOS}
uniform sampler2D tAO;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  float z = viewPos(vUv).z;
  float sum = 0.0;
  float wsum = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 uv = vUv + uDir * float(i);
    float zs = viewPos(uv).z;
    float w = exp(-float(i * i) / 8.0) * exp(-abs(zs - z) / (0.01 * abs(z) + 0.002));
    sum += texture2D(tAO, uv).r * w;
    wsum += w;
  }
  gl_FragColor = vec4(vec3(sum / wsum), 1.0);
}`;

const LENS_FRAG = /* glsl */ `
${VIEWPOS}
uniform sampler2D tColor;
uniform sampler2D tAO;
uniform float uUseAO;
uniform vec2 uRes;
uniform float uFocus;
uniform float uTolerance;
uniform float uAperture;
uniform float uMaxCoC;
uniform float uDof;
varying vec2 vUv;
#define TAPS 24
float coc(vec2 uv) {
  float z = max(0.001, -viewPos(uv).z);
  return clamp((abs(1.0 / uFocus - 1.0 / z) - uTolerance) * uAperture, 0.0, uMaxCoC);
}
vec3 shade(vec2 uv) {
  vec3 c = texture2D(tColor, uv).rgb;
  if (uUseAO > 0.5) c *= texture2D(tAO, uv).r;
  return c;
}
void main() {
  vec3 col = shade(vUv);
  if (uDof > 0.5) {
    float c = coc(vUv);
    if (c > 0.6) {
      vec3 sum = col;
      float wsum = 1.0;
      for (int i = 0; i < TAPS; i++) {
        float f = sqrt((float(i) + 0.5) / float(TAPS));
        float a = float(i) * 2.39996;
        float dist = f * c;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * dist / uRes;
        float cs = coc(uv);
        float w = smoothstep(dist - 1.5, dist + 0.5, cs);
        // brighter samples weigh more, so highlights open into bokeh discs
        vec3 s = shade(uv);
        w *= 1.0 + 0.6 * clamp(dot(s, vec3(0.3, 0.6, 0.1)) - 1.0, 0.0, 4.0);
        sum += s * w;
        wsum += w;
      }
      col = sum / wsum;
    }
  }
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  gl_FragColor = vec4(min(col, vec3(1000.0)), 1.0);
}`;

class LensPass extends Pass {
  constructor(camera, quality) {
    super();
    this.camera = camera;
    this.useAO = quality.ao;
    this.useDof = quality.dof;
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.aoA = rt();
    this.aoB = rt();
    const common = () => ({ tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() } });
    this.aoMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: AO_FRAG,
      uniforms: { ...common(), uRes: { value: new THREE.Vector2() }, uProj: { value: new THREE.Matrix4() }, uRadius: { value: 0.12 }, uIntensity: { value: 0.55 } },
      depthTest: false,
      depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: { ...common(), tAO: { value: null }, uDir: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
    this.lensMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: LENS_FRAG,
      uniforms: {
        ...common(),
        tColor: { value: null },
        tAO: { value: null },
        uUseAO: { value: this.useAO ? 1 : 0 },
        uRes: { value: new THREE.Vector2() },
        uFocus: { value: 3 },
        uTolerance: { value: 0.1 },
        uAperture: { value: 50 },
        uMaxCoC: { value: 12 },
        uDof: { value: this.useDof ? 1 : 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(null);
    this.aperture = 1;
  }

  setSize(w, h) {
    const hw = Math.max(1, Math.floor(w / 2));
    const hh = Math.max(1, Math.floor(h / 2));
    this.aoA.setSize(hw, hh);
    this.aoB.setSize(hw, hh);
    this.aoMat.uniforms.uRes.value.set(hw, hh);
    this.lensMat.uniforms.uRes.value.set(w, h);
    this.h = h;
    this.applyAperture();
  }

  // blur size and bokeh scale with the picture height; `k` opens the lens
  // further for close-ups
  applyAperture() {
    const h = this.h || 1000;
    this.lensMat.uniforms.uAperture.value = 50 * this.aperture * (h / 1000);
    this.lensMat.uniforms.uMaxCoC.value = 12 * Math.min(1.6, this.aperture) * (h / 1000);
  }

  render(renderer, writeBuffer, readBuffer) {
    const depth = readBuffer.depthTexture;
    const cam = this.camera;
    for (const m of [this.aoMat, this.blurMat, this.lensMat]) {
      m.uniforms.tDepth.value = depth;
      m.uniforms.uInvProj.value.copy(cam.projectionMatrixInverse);
    }
    if (this.useAO) {
      this.aoMat.uniforms.uProj.value.copy(cam.projectionMatrix);
      this.quad.material = this.aoMat;
      renderer.setRenderTarget(this.aoA);
      this.quad.render(renderer);
      this.quad.material = this.blurMat;
      this.blurMat.uniforms.tAO.value = this.aoA.texture;
      this.blurMat.uniforms.uDir.value.set(1 / this.aoA.width, 0);
      renderer.setRenderTarget(this.aoB);
      this.quad.render(renderer);
      this.blurMat.uniforms.tAO.value = this.aoB.texture;
      this.blurMat.uniforms.uDir.value.set(0, 1 / this.aoA.height);
      renderer.setRenderTarget(this.aoA);
      this.quad.render(renderer);
    }
    this.lensMat.uniforms.tColor.value = readBuffer.texture;
    this.lensMat.uniforms.tAO.value = this.aoA.texture;
    this.quad.material = this.lensMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.022 },
    uVignette: { value: 0.2 },
    uAspect: { value: 1 },
    uSaturation: { value: 1.12 },
    uContrast: { value: 1.04 },
    uDim: { value: 1 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uGrain;
uniform float uVignette;
uniform float uAspect;
uniform float uSaturation;
uniform float uContrast;
uniform float uDim;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 7.13) * 43758.5453); }
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  // AgX is gentle and a little flat: put back some saturation and a soft
  // S-curve, with a hint of warmth in the shadows
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  c.rgb = mix(vec3(l), c.rgb, uSaturation);
  c.rgb = clamp((c.rgb - 0.5) * uContrast + 0.5, 0.0, 1.0);
  c.rgb += vec3(0.010, 0.004, -0.004) * (1.0 - l);
  vec2 d = vUv - 0.5;
  d.x *= mix(1.0, uAspect, 0.5);
  c.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.95, length(d) * 1.25);
  c.rgb *= uDim;
  float g = hash(vUv * vec2(1713.0, 997.0)) - 0.5;
  c.rgb += g * uGrain * (1.0 - c.rgb * 0.6);
  gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), 1.0);
}`,
};

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality.msaa,
      depthTexture: new THREE.DepthTexture(size.x, size.y),
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.renderTarget2.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.lens = new LensPass(camera, quality);
    this.composer.addPass(this.lens);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.25, 0.6, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.lens.setSize(Math.floor(w * pixelRatio), Math.floor(h * pixelRatio));
    this.finish.uniforms.uAspect.value = w / h;
  }

  // focus distance in metres, and how wide the lens is open (1 = normal)
  setFocus(distance, aperture = 1) {
    this.lens.lensMat.uniforms.uFocus.value = distance;
    if (aperture !== this.lens.aperture) {
      this.lens.aperture = aperture;
      this.lens.applyAperture();
    }
  }

  setBloom(strength) {
    this.bloom.strength = strength;
  }

  setDim(v) {
    this.finish.uniforms.uDim.value = v;
  }

  update(time) {
    this.finish.uniforms.uTime.value = time % 100;
  }

  render() {
    this.composer.render(1 / 60);
  }
}
