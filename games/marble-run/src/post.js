// Post-processing, tuned for small toys filmed close up: an HDR render with
// depth, then a lens pass that adds ambient occlusion (from the depth
// buffer, at half resolution, sized for centimetre gaps between blocks) and
// a gentle depth of field focused on the tower (at half resolution, with
// smooth round bokeh), then bloom for the night lamp and sun glints, and a
// final pass that white-balances, applies filmic (AgX) tone mapping,
// restores a little saturation and contrast, and adds a light vignette and
// fine grain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { QUERY } from './config.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// View-space position and distance from the depth buffer. uProj[2][2] and
// uProj[3][2] give the linear distance without a full matrix multiply.
const DEPTH = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform mat4 uProj;
vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}
float viewDist(vec2 uv) {
  float ndc = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return uProj[3][2] / (uProj[2][2] + ndc);
}`;

// Two scales of occlusion: a tight one (about a centimetre) that darkens the
// seams between stacked blocks and their contact with the floor, and a
// broader, weaker one that stands in for the sky light a tower blocks from
// the floor around its base.
const AO_FRAG = /* glsl */ `
${DEPTH}
uniform vec2 uRes;
uniform vec2 uRadius;
uniform vec2 uIntensity;
varying vec2 vUv;
#define SAMPLES 8
float gather(vec3 P, vec3 N, float radius, float spin, vec2 t) {
  float rPx = radius * uProj[1][1] / -P.z * 0.5 * uRes.y;
  if (rPx < 1.0) return 0.0;
  rPx = min(rPx, 0.25 * uRes.y);
  float occ = 0.0;
  float r2 = radius * radius;
  for (int i = 0; i < SAMPLES; i++) {
    float f = (float(i) + 0.5) / float(SAMPLES);
    float a = float(i) * 2.39996 + spin;
    vec2 off = vec2(cos(a), sin(a)) * f * rPx * t;
    vec3 v = viewPos(vUv + off) - P;
    float vv = dot(v, v);
    float fall = max(0.0, 1.0 - vv / r2);
    occ += max(0.0, dot(v, N) - 0.002 * radius / 0.01 * 0.25) / (vv + 0.02 * r2) * fall * fall;
  }
  return occ * radius / float(SAMPLES);
}
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
  float spin = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  float near = gather(P, N, uRadius.x, spin, t);
  float wide = gather(P, N, uRadius.y, spin + 1.3, t);
  float ao = max(0.0, 1.0 - uIntensity.x * near) * max(0.0, 1.0 - uIntensity.y * wide);
  gl_FragColor = vec4(vec3(ao), 1.0);
}`;

const BLUR_FRAG = /* glsl */ `
${DEPTH}
uniform sampler2D tAO;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  float z = viewDist(vUv);
  float sum = 0.0;
  float wsum = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 uv = vUv + uDir * float(i);
    float zs = viewDist(uv);
    float w = exp(-float(i * i) / 8.0) * exp(-abs(zs - z) / (0.012 * z + 0.002));
    sum += texture2D(tAO, uv).r * w;
    wsum += w;
  }
  gl_FragColor = vec4(vec3(sum / wsum), 1.0);
}`;

// Depth of field. The circle of confusion (CoC) follows a thin lens:
// proportional to |1/focus - 1/distance|, less a tolerance so the whole play
// area around the tower stays crisp. The blur runs at half resolution in two
// passes, after the way CryEngine 3 did it: a gather over a disc of taps
// laid out on a golden-angle spiral, then a small fill blur spaced to the
// gaps between those taps. Together they act like several hundred taps, so a
// small bright light (a fairy bulb, a star, the lamp) spreads into a smooth,
// soft-edged disc, as through a real lens wide open, instead of a ring of
// dots. A sample only counts if its own circle reaches the pixel, so the
// sharp tower never smears over the soft room. The full-resolution pass
// then blends the sharp picture into the blurred one by CoC.
const COC = /* glsl */ `
uniform float uFocus;
uniform float uTolerance;
uniform float uAperture;
uniform float uMaxCoC;
float coc(vec2 uv) {
  float z = max(0.001, viewDist(uv));
  return clamp((abs(1.0 / uFocus - 1.0 / z) - uTolerance) * uAperture, 0.0, uMaxCoC);
}`;

// Full-res colour (with AO) averaged into half-res texels; alpha carries the
// CoC in half-res pixels, the smallest of the four so a texel straddling the
// tower's edge counts as sharp and never bleeds the tower into the blur.
const DOF_PREFILTER_FRAG = /* glsl */ `
${DEPTH}
${COC}
uniform sampler2D tColor;
uniform sampler2D tAO;
uniform float uUseAO;
uniform vec2 uFullRes;
varying vec2 vUv;
void main() {
  vec2 t = 0.5 / uFullRes;
  float c = min(min(coc(vUv - t), coc(vUv + vec2(t.x, -t.y))), min(coc(vUv + vec2(-t.x, t.y)), coc(vUv + t)));
  vec3 col = texture2D(tColor, vUv).rgb;
  if (uUseAO > 0.5) col *= texture2D(tAO, vUv).r;
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  gl_FragColor = vec4(min(col, vec3(500.0)), c * 0.5);
}`;

const DOF_GATHER_FRAG = /* glsl */ `
uniform sampler2D tDof;
uniform vec2 uRes;
varying vec2 vUv;
void main() {
  vec4 centre = texture2D(tDof, vUv);
  float c = centre.a;
  if (c < 0.5) { gl_FragColor = centre; return; }
  vec3 sum = centre.rgb;
  float wsum = 1.0;
  for (int i = 0; i < TAPS; i++) {
    float f = sqrt((float(i) + 0.5) / float(TAPS));
    float a = float(i) * 2.39996323;
    float dist = f * c;
    vec4 s = texture2D(tDof, vUv + vec2(cos(a), sin(a)) * dist / uRes);
    float w = smoothstep(dist - 1.0, dist + 0.25, s.a);
    sum += s.rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(sum / wsum, c);
}`;

// Two hexagonal rings, at half and at the full gap between gather taps.
const DOF_FILL_FRAG = /* glsl */ `
uniform sampler2D tDof;
uniform vec2 uRes;
uniform float uGap;
varying vec2 vUv;
void main() {
  vec4 centre = texture2D(tDof, vUv);
  float c = centre.a;
  if (c < 0.5) { gl_FragColor = centre; return; }
  float r = max(0.75, c * uGap);
  vec3 sum = centre.rgb;
  float wsum = 1.0;
  for (int i = 0; i < 12; i++) {
    bool inner = i < 6;
    float a = float(i) * 1.04719755 + (inner ? 0.0 : 0.52359878);
    vec4 s = texture2D(tDof, vUv + vec2(cos(a), sin(a)) * r * (inner ? 0.5 : 1.0) / uRes);
    float w = (inner ? 0.8 : 0.45) * smoothstep(0.25, 0.75, s.a);
    sum += s.rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(sum / wsum, c);
}`;

// Full resolution: the sharp picture with AO, blended into the half-res
// blur where the CoC calls for it. The upsample skips half-res texels that
// are in focus, so no sharp colour leaks into the soft background.
const LENS_FRAG = /* glsl */ `
${DEPTH}
${COC}
uniform sampler2D tColor;
uniform sampler2D tAO;
uniform sampler2D tDof;
uniform float uUseAO;
uniform float uDof;
uniform vec2 uHalfRes;
varying vec2 vUv;
vec4 halfTexel(vec2 base, vec2 o, vec2 fr) {
  vec4 s = texture2D(tDof, (base + o + 0.5) / uHalfRes);
  float bw = mix(1.0 - fr.x, fr.x, o.x) * mix(1.0 - fr.y, fr.y, o.y);
  float w = bw * (smoothstep(0.0, 0.75, s.a) + 1e-3);
  return vec4(s.rgb * w, w);
}
void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  if (uUseAO > 0.5) col *= texture2D(tAO, vUv).r;
  if (uDof > 0.5) {
    float m = smoothstep(0.35, 1.5, coc(vUv));
    if (m > 0.0) {
      vec2 hp = vUv * uHalfRes - 0.5;
      vec2 base = floor(hp);
      vec2 fr = hp - base;
      vec4 acc = halfTexel(base, vec2(0.0, 0.0), fr) + halfTexel(base, vec2(1.0, 0.0), fr)
        + halfTexel(base, vec2(0.0, 1.0), fr) + halfTexel(base, vec2(1.0, 1.0), fr);
      col = mix(col, acc.rgb / max(acc.a, 1e-6), m);
    }
  }
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  gl_FragColor = vec4(min(col, vec3(500.0)), 1.0);
}`;

class LensPass extends Pass {
  constructor(camera, quality) {
    super();
    this.camera = camera;
    this.useAO = !!quality.ao;
    this.useDof = !!quality.dof;
    this.aperture = 1;
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.aoA = rt();
    this.aoB = rt();
    this.dofA = rt();
    this.dofB = rt();
    const common = () => ({ tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() } });
    const mat = (fragmentShader, uniforms, defines = {}) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms: { ...common(), ...uniforms }, defines, depthTest: false, depthWrite: false });
    this.aoMat = mat(AO_FRAG, {
      uRes: { value: new THREE.Vector2() },
      uRadius: { value: new THREE.Vector2(0.012, 0.07) },
      uIntensity: { value: new THREE.Vector2(1.3, 0.7) },
    });
    this.blurMat = mat(BLUR_FRAG, { tAO: { value: null }, uDir: { value: new THREE.Vector2() } });
    // shared by the prefilter and the final blend, so both see the same CoC
    this.cocU = {
      uFocus: { value: 1.1 },
      uTolerance: { value: 0.15 },
      uAperture: { value: 30 },
      uMaxCoC: { value: 14 },
    };
    const useAO = { value: this.useAO ? 1 : 0 };
    const halfRes = new THREE.Vector2();
    this.prefMat = mat(DOF_PREFILTER_FRAG, { ...this.cocU, tColor: { value: null }, tAO: { value: null }, uUseAO: useAO, uFullRes: { value: new THREE.Vector2() } });
    // taps per gather: the fill pass smooths the rest, so phones get fewer
    const taps = quality.tier === 'high' ? 48 : 32;
    this.gatherMat = mat(DOF_GATHER_FRAG, { tDof: { value: null }, uRes: { value: halfRes } }, { TAPS: taps });
    this.fillMat = mat(DOF_FILL_FRAG, { tDof: { value: null }, uRes: { value: halfRes }, uGap: { value: Math.sqrt(Math.PI / taps) } });
    this.lensMat = mat(LENS_FRAG, {
      ...this.cocU,
      tColor: { value: null },
      tAO: { value: null },
      tDof: { value: null },
      uUseAO: useAO,
      uDof: { value: this.useDof ? 1 : 0 },
      uHalfRes: { value: halfRes },
    });
    this.quad = new FullScreenQuad(null);
  }

  setSize(w, h) {
    const hw = Math.max(1, Math.floor(w / 2));
    const hh = Math.max(1, Math.floor(h / 2));
    for (const t of [this.aoA, this.aoB, this.dofA, this.dofB]) t.setSize(hw, hh);
    this.aoMat.uniforms.uRes.value.set(hw, hh);
    this.lensMat.uniforms.uHalfRes.value.set(hw, hh);
    this.prefMat.uniforms.uFullRes.value.set(w, h);
    this.height = h;
    this.applyAperture();
  }

  // blur scales with the picture height so every screen size gets the same look
  applyAperture() {
    const h = this.height || 1000;
    this.cocU.uAperture.value = 30 * this.aperture * (h / 1000);
    this.cocU.uMaxCoC.value = 15 * Math.max(0.2, this.aperture) * (h / 1000);
  }

  setFocus(distance) {
    this.cocU.uFocus.value = Math.max(0.05, distance);
  }

  pass(renderer, material, target) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  render(renderer, writeBuffer, readBuffer) {
    const depth = readBuffer.depthTexture;
    const cam = this.camera;
    for (const m of [this.aoMat, this.blurMat, this.prefMat, this.lensMat]) {
      m.uniforms.tDepth.value = depth;
      m.uniforms.uInvProj.value.copy(cam.projectionMatrixInverse);
      m.uniforms.uProj.value.copy(cam.projectionMatrix);
    }
    if (this.useAO) {
      this.pass(renderer, this.aoMat, this.aoA);
      this.blurMat.uniforms.tAO.value = this.aoA.texture;
      this.blurMat.uniforms.uDir.value.set(1 / this.aoA.width, 0);
      this.pass(renderer, this.blurMat, this.aoB);
      this.blurMat.uniforms.tAO.value = this.aoB.texture;
      this.blurMat.uniforms.uDir.value.set(0, 1 / this.aoA.height);
      this.pass(renderer, this.blurMat, this.aoA);
    }
    if (this.useDof) {
      this.prefMat.uniforms.tColor.value = readBuffer.texture;
      this.prefMat.uniforms.tAO.value = this.aoA.texture;
      this.pass(renderer, this.prefMat, this.dofA);
      this.gatherMat.uniforms.tDof.value = this.dofA.texture;
      this.pass(renderer, this.gatherMat, this.dofB);
      this.fillMat.uniforms.tDof.value = this.dofB.texture;
      this.pass(renderer, this.fillMat, this.dofA);
    }
    this.lensMat.uniforms.tColor.value = readBuffer.texture;
    this.lensMat.uniforms.tAO.value = this.aoA.texture;
    this.lensMat.uniforms.tDof.value = this.dofA.texture;
    this.pass(renderer, this.lensMat, this.renderToScreen ? null : writeBuffer);
  }

  dispose() {
    for (const x of [this.aoA, this.aoB, this.dofA, this.dofB, this.aoMat, this.blurMat, this.prefMat, this.gatherMat, this.fillMat, this.lensMat]) x.dispose();
    this.quad.dispose();
  }
}

// The last pass, straight to the screen: white balance in linear light,
// filmic tone mapping, then a gentle look in display space. AgX keeps
// saturated paint from skewing hue in bright sun (ACES turns sunlit yellow
// orange and warm wood a burnt orange), so it reads more like a real camera.
// Plain AgX is flat and grey, so a 'punchy' look (a power curve and a
// saturation boost inside AgX's own encoding, as Blender does) brings back
// the contrast and colour of a good photo without clipping highlights.
const FINAL_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uTime;
uniform vec3 uWhite;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uVignette;
uniform float uGrain;
uniform float uAspect;
uniform float uFringe;
uniform float uLookPower;
uniform float uLookSat;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
varying vec2 vUv;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031 + uTime * 0.37);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 agxLook(vec3 color) {
  const mat3 inset = mat3(
    vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
    vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
    vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859)
  );
  const mat3 outset = mat3(
    vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
    vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
    vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405)
  );
  const float minEv = -12.47393;
  const float maxEv = 4.026069;
  color *= toneMappingExposure;
  color = inset * (LINEAR_SRGB_TO_LINEAR_REC2020 * color);
  color = clamp((log2(max(color, 1e-10)) - minEv) / (maxEv - minEv), 0.0, 1.0);
  color = agxDefaultContrastApprox(color);
  color = pow(max(color, 0.0), vec3(uLookPower));
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = luma + uLookSat * (color - luma);
  color = outset * color;
  color = pow(max(vec3(0.0), color), vec3(2.2));
  return clamp(LINEAR_REC2020_TO_LINEAR_SRGB * color, 0.0, 1.0);
}
void main() {
  vec2 d = vUv - 0.5;
  vec3 c;
  // a whisper of lateral colour fringing towards the corners, like a real lens
  float k = uFringe * dot(d, d);
  c.r = texture2D(tDiffuse, vUv - d * k).r;
  c.g = texture2D(tDiffuse, vUv).g;
  c.b = texture2D(tDiffuse, vUv + d * k).b;
  c *= uWhite;
#if defined( ACES_LOOK )
  c = ACESFilmicToneMapping(c);
#elif defined( NEUTRAL_LOOK )
  c = NeutralToneMapping(c);
#else
  c = agxLook(c);
#endif
  c = sRGBTransferOETF(vec4(max(c, 0.0), 1.0)).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  // soft S-curve about mid grey, gentle in the toes so shadows keep detail
  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
  c += uShadowTint * (1.0 - smoothstep(0.0, 0.55, l)) + uHighTint * smoothstep(0.45, 1.0, l);
  vec2 v = d;
  v.x *= mix(1.0, uAspect, 0.5);
  c *= 1.0 - uVignette * smoothstep(0.2, 0.95, length(v) * 1.3);
  // fine luminance grain, strongest in the mid-tones, plus it dithers away banding
  float g = (hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 17.3) - 1.0);
  c += g * uGrain * (0.35 + l * (1.0 - l) * 2.6);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const FINAL_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DEFAULT_GRADE = {
  white: [1.0, 1.0, 1.0],
  power: 1.25,
  lookSaturation: 1.3,
  saturation: 1.0,
  contrast: 0.06,
  shadowTint: [0.006, 0.002, -0.004],
  highTint: [0.004, 0.002, -0.004],
  vignette: 0.22,
  grain: 0.022,
  fringe: 0.004,
};

class FinalPass extends Pass {
  constructor(tone) {
    super();
    const defines = {};
    if (tone === 'aces') defines.ACES_LOOK = '';
    if (tone === 'neutral') defines.NEUTRAL_LOOK = '';
    this.uniforms = {
      tDiffuse: { value: null },
      toneMappingExposure: { value: 1 },
      uTime: { value: 0 },
      uWhite: { value: new THREE.Vector3(1, 1, 1) },
      uSaturation: { value: 1 },
      uContrast: { value: 0 },
      uShadowTint: { value: new THREE.Vector3() },
      uHighTint: { value: new THREE.Vector3() },
      uVignette: { value: 0 },
      uGrain: { value: 0 },
      uAspect: { value: 1 },
      uFringe: { value: 0 },
      uLookPower: { value: 1 },
      uLookSat: { value: 1 },
    };
    this.material = new THREE.RawShaderMaterial({
      uniforms: this.uniforms,
      defines,
      vertexShader: FINAL_VERT,
      fragmentShader: FINAL_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}

export class Post {
  // quality: from detectQuality(). The renderer's toneMapping is not used
  // (the final pass tone maps); its toneMappingExposure is.
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.quality = quality;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality.msaa || 0,
      depthTexture: new THREE.DepthTexture(size.x, size.y),
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.renderTarget2.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.lens = new LensPass(camera, quality);
    this.composer.addPass(this.lens);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.2, 0.6, 2.2);
    // a soft knee, so a sunlit glint grows a halo gradually instead of popping
    this.bloom.highPassUniforms.smoothWidth.value = 2.5;
    this.composer.addPass(this.bloom);
    const tone = QUERY.get('tone') || 'agx';
    this.final = new FinalPass(tone);
    this.composer.addPass(this.final);
    this.setGrade();
  }

  get bloomStrength() {
    return this.bloom.strength;
  }

  set bloomStrength(v) {
    this.bloom.strength = v;
    this.bloom.enabled = v > 0.001;
  }

  get bloomThreshold() {
    return this.bloom.threshold;
  }

  set bloomThreshold(v) {
    this.bloom.threshold = v;
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.lens.setSize(Math.floor(w * pixelRatio), Math.floor(h * pixelRatio));
    this.final.uniforms.uAspect.value = w / h;
  }

  // distance in metres from the camera to the point that should be sharpest
  setFocus(distance) {
    this.lens.setFocus(distance);
  }

  // 0 = everything sharp, 1 = the default gentle blur, a little more is allowed
  setAperture(k) {
    this.lens.aperture = Math.max(0, Math.min(1.5, k));
    this.lens.applyAperture();
  }

  // Colour look, usually from room.grade. Missing keys fall back to the default.
  setGrade(grade = {}) {
    const g = { ...DEFAULT_GRADE, ...grade };
    const u = this.final.uniforms;
    u.uWhite.value.fromArray(g.white);
    u.uSaturation.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uShadowTint.value.fromArray(g.shadowTint);
    u.uHighTint.value.fromArray(g.highTint);
    u.uVignette.value = g.vignette;
    u.uGrain.value = g.grain;
    u.uFringe.value = g.fringe;
    u.uLookPower.value = g.power;
    u.uLookSat.value = g.lookSaturation;
  }

  update(time) {
    this.final.uniforms.uTime.value = time % 60;
  }

  render() {
    this.composer.render(1 / 60);
  }

  dispose() {
    this.lens.dispose();
    this.bloom.dispose();
    this.final.dispose();
    this.composer.dispose();
  }
}
