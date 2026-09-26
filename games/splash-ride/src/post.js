// The frame: a planar reflection of the world, the opaque world into its
// own target (colour and depth), then the composite target: that world
// copied across with distance haze, the water drawn over it (reading the
// world's colour and depth for absorption and refraction), then spray,
// sparkles and other see-through things. Bloom follows, and a final pass
// white-balances, applies filmic (AgX) tone mapping with a gentle
// photographic look, a light vignette and fine grain.
//
// Layers: 0 = the opaque world (also seen in the reflection), 1 = water,
// 2 = see-through effects drawn after the water.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { QUERY } from './config.js';
import { SKY_UNIFORMS_GLSL, SKY_GLSL } from './sky.js';

export const LAYER_WORLD = 0;
export const LAYER_WATER = 1;
export const LAYER_FX = 2;

// ------------------------------------------------------------ reflection

// Planar mirror about y = 0, adapted from three.js's Reflector (MIT), with
// an oblique near plane so nothing under the water leaks into the mirror.
class PlanarReflection {
  constructor(scale) {
    this.scale = scale;
    this.camera = new THREE.PerspectiveCamera();
    this.camera.layers.set(LAYER_WORLD);
    this.textureMatrix = new THREE.Matrix4();
    this.target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: true });
    this.target.texture.generateMipmaps = false;
    this._plane = new THREE.Plane();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
    this._view = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
    this._normal = new THREE.Vector3(0, 1, 0);
    this._origin = new THREE.Vector3(0, 0, 0);
  }

  setSize(w, h) {
    this.target.setSize(Math.max(16, Math.round(w * this.scale)), Math.max(16, Math.round(h * this.scale)));
  }

  render(renderer, scene, camera) {
    const rc = this.camera;
    const camPos = this._camPos.setFromMatrixPosition(camera.matrixWorld);
    const view = this._view.subVectors(this._origin, camPos);
    view.reflect(this._normal).negate().add(this._origin);
    this._rot.extractRotation(camera.matrixWorld);
    const look = this._look.set(0, 0, -1).applyMatrix4(this._rot).add(camPos);
    const target = this._target.subVectors(this._origin, look);
    target.reflect(this._normal).negate().add(this._origin);
    rc.position.copy(view);
    rc.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(this._normal);
    rc.lookAt(target);
    rc.far = camera.far;
    rc.near = camera.near;
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);

    this._plane.setFromNormalAndCoplanarPoint(this._normal, this._origin).applyMatrix4(rc.matrixWorldInverse);
    const clip = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = rc.projectionMatrix;
    const q = this._q;
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1;
    q.w = (1 + pm.elements[10]) / pm.elements[14];
    clip.multiplyScalar(2 / clip.dot(q));
    pm.elements[2] = clip.x;
    pm.elements[6] = clip.y;
    pm.elements[10] = clip.z + 1 - 0.003;
    pm.elements[14] = clip.w;
    rc.projectionMatrixInverse.copy(pm).invert();

    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, rc);
  }
}

// ------------------------------------------------------------ world pass

const COPY_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// The opaque world copied into the composite target with its depth, and
// distance haze in the sky's own colours.
const COPY_FRAG = /* glsl */ `
${SKY_UNIFORMS_GLSL}
${SKY_GLSL}
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform float uFog;
varying vec2 vUv;
void main() {
  float d = texture2D(tDepth, vUv).x;
  vec3 col = texture2D(tColor, vUv).rgb;
  if (d < 1.0) {
    vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    v.xyz /= v.w;
    vec3 wd = mat3(uCamWorld) * v.xyz;
    float dist = length(v.xyz);
    float camY = uCamWorld[3].y;
    float hf = 0.4 + 0.6 * exp(-max(camY + wd.y * 0.5, 0.0) / 60.0);
    float fog = 1.0 - exp(-dist * uFog * hf);
    col = mix(col, skyHaze(normalize(wd)), fog);
  }
  gl_FragColor = vec4(col, 1.0);
  gl_FragDepth = d;
}`;

class WorldPass extends Pass {
  constructor(scene, camera, quality, sky, water) {
    super();
    this.needsSwap = false;
    this.scene = scene;
    this.camera = camera;
    this.water = water;
    this.reflection = quality.reflect > 0 ? new PlanarReflection(quality.reflect) : null;
    this.opaque = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: quality.msaa || 0,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.FloatType),
    });
    this.opaque.texture.generateMipmaps = false;
    this.copyMat = new THREE.ShaderMaterial({
      uniforms: {
        ...sky.uniforms,
        tColor: { value: this.opaque.texture },
        tDepth: { value: this.opaque.depthTexture },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uFog: { value: 0.0005 },
      },
      vertexShader: COPY_VERT,
      fragmentShader: COPY_FRAG,
      depthTest: true,
      depthWrite: true,
      depthFunc: THREE.AlwaysDepth,
    });
    this.quad = new FullScreenQuad(this.copyMat);
    const u = water.uniforms;
    u.uOpaque.value = this.opaque.texture;
    u.uDepth.value = this.opaque.depthTexture;
    if (this.reflection) {
      u.uReflect.value = this.reflection.target.texture;
      u.uTexMatrix.value = this.reflection.textureMatrix;
      u.uReflectOn.value = 1;
    }
  }

  setSize(w, h) {
    this.opaque.setSize(w, h);
    this.water.uniforms.uResolution.value.set(w, h);
    this.reflection?.setSize(w, h);
  }

  render(renderer, writeBuffer, readBuffer) {
    const { scene, camera } = this;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    const layers = camera.layers.mask;
    this.water.uniforms.uCamNF.value.set(camera.near, camera.far);
    // this frame's shadows, drawn by whichever render comes first
    renderer.shadowMap.needsUpdate = true;
    if (this.reflection) this.reflection.render(renderer, scene, camera);
    camera.layers.set(LAYER_WORLD);
    renderer.setRenderTarget(this.opaque);
    renderer.clear();
    renderer.render(scene, camera);
    // composite: world + haze, water, then effects
    this.copyMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    this.copyMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    renderer.setRenderTarget(readBuffer);
    renderer.clear();
    this.quad.render(renderer);
    camera.layers.set(LAYER_WATER);
    renderer.render(scene, camera);
    camera.layers.set(LAYER_FX);
    renderer.render(scene, camera);
    camera.layers.mask = layers;
    renderer.autoClear = autoClear;
  }

  dispose() {
    this.opaque.dispose();
    this.reflection?.target.dispose();
    this.copyMat.dispose();
    this.quad.dispose();
  }
}

// ------------------------------------------------------------ final grade

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
  // The renderer's toneMapping is not used (the final pass tone maps); its
  // toneMappingExposure is.
  constructor(renderer, scene, camera, quality, sky, water) {
    this.renderer = renderer;
    this.quality = quality;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality.msaa || 0,
      depthBuffer: true,
    });
    this.composer = new EffectComposer(renderer, target);
    this.world = new WorldPass(scene, camera, quality, sky, water);
    this.composer.addPass(this.world);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.2, 0.5, 1.6);
    this.bloom.highPassUniforms.smoothWidth.value = 1.2;
    this.composer.addPass(this.bloom);
    const tone = QUERY.get('tone') || 'agx';
    this.final = new FinalPass(tone);
    this.composer.addPass(this.final);
    this.setGrade();
  }

  setFog(density) {
    this.world.copyMat.uniforms.uFog.value = density;
  }

  setBloom({ strength = 0.2, threshold = 1.6, radius = 0.5 } = {}) {
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
    this.bloom.radius = radius;
    this.bloom.enabled = strength > 0.001;
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.world.setSize(Math.floor(w * pixelRatio), Math.floor(h * pixelRatio));
    this.final.uniforms.uAspect.value = w / h;
  }

  // Colour look, from the place's grade. Missing keys fall back to the default.
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
}
