// A living dusk sea: wind ripples stretched along the horizon, a long swell,
// a real planar reflection of the sky and the balloons (broken up by the
// wave slopes), Fresnel, a sun glitter path, and expanding ripple rings
// wherever something lands in the water.
import * as THREE from 'three';
import { ATMO_GLSL } from './atmosphere.js';
import { glslVec3 } from './config.js';

export const MAX_RIPPLES = 24;
export const LAYER_NO_REFLECT = 1;

const vertexShader = /* glsl */ `
uniform mat4 uTexMatrix;
varying vec3 vWorld;
varying vec4 vReflCoord;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vReflCoord = uTexMatrix * w;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D uReflection;
uniform sampler2D uWaves;
uniform float uTime;
uniform float uFogDensity;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform vec4 uFlash; // xyz position, w intensity
varying vec3 vWorld;
varying vec4 vReflCoord;
${ATMO_GLSL}

vec2 waveSlope(vec2 uv) { return texture2D(uWaves, uv).rg * 2.0 - 1.0; }

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 p = vWorld.xz;
  float t = uTime;

  // Wind ripples: sampled with x squashed so crests run along the horizon.
  float detail = exp(-dist * 0.0035);
  vec2 s = waveSlope(vec2(p.x * 0.010, p.y * 0.036) + vec2(t * 0.0021, t * 0.0072)) * 0.55;
  s += waveSlope(vec2(p.x * 0.026, p.y * 0.085) + vec2(-t * 0.0043, t * 0.0151)) * 0.38;
  s += waveSlope(vec2(p.x * 0.071, p.y * 0.22) + vec2(t * 0.0067, -t * 0.026)) * 0.26 * detail;
  s += waveSlope(vec2(p.x * 0.19, p.y * 0.5) + vec2(-t * 0.011, t * 0.043)) * 0.16 * detail * detail;
  // long, slow swell rolling towards the viewer
  s.y += sin(p.y * 0.31 + p.x * 0.03 + t * 1.05) * 0.05 + sin(p.y * 0.73 - p.x * 0.11 + t * 1.6) * 0.03;

  // Ripple rings from splashes.
  float foam = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    if (r.w <= 0.0) continue;
    float age = t - r.z;
    if (age < 0.0 || age > 6.0) continue;
    vec2 dp = p - r.xy;
    float d = length(dp) + 1e-4;
    float front = age * 2.4 + 0.15;
    float x = d - front;
    float env = r.w * exp(-age * 0.75) * exp(-x * x * 0.9) * smoothstep(0.0, 0.08, age);
    // trailing crests inside the front
    float trail = r.w * exp(-age * 1.1) * smoothstep(0.0, -1.5, x) * exp(x * 0.6) * 0.55;
    float dh = cos(x * 6.5) * (env + trail) * 6.5 * 0.07;
    s += (dp / d) * dh;
    foam += r.w * exp(-age * 2.2) * exp(-d * d * 0.9 / (0.4 + r.w));
  }

  float slopeScale = mix(0.25, 1.0, detail);
  vec3 N = normalize(vec3(-s.x * slopeScale, 1.0, -s.y * slopeScale));

  // Reflection, pushed by the wave slopes; more vertical smear than sideways.
  vec2 ruv = vReflCoord.xy / vReflCoord.w;
  float distort = 1.0 / (1.0 + dist * 0.02);
  ruv += vec2(N.x * 0.035, N.z * 0.11) * distort + vec2(0.0, N.z * 0.02);
  vec3 refl = texture2D(uReflection, clamp(ruv, 0.001, 0.999)).rgb;

  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  float reflectivity = clamp(fresnel * 1.1 + 0.12, 0.0, 1.0);

  // Deep water tint lit by the sky, warmer towards the sun.
  vec3 skyDir = normalize(vec3(-toCam.x, 0.0, -toCam.z));
  vec3 haze = atmoHaze(skyDir);
  vec3 deep = ${glslVec3('#0a0e2a')} + haze * 0.035;
  // light through the steep wave fronts
  float sss = pow(max(dot(-V, ATMO_SUN) , 0.0), 3.0) * max(N.z, 0.0);
  deep += ${glslVec3('#5a2f3a')} * sss * 0.6;

  vec3 col = mix(deep, refl, reflectivity);

  // Sun glitter path.
  vec3 R = reflect(-V, N);
  float sd = max(dot(R, ATMO_SUN), 0.0);
  col += ATMO_SUN_COLOR * (pow(sd, 700.0) * 14.0 + pow(sd, 60.0) * 0.35) * smoothstep(-0.05, 0.1, ATMO_SUN.y + 0.05);

  // Pop flashes light the water around them.
  if (uFlash.w > 0.0) {
    vec3 L = uFlash.xyz - vWorld;
    float ld = length(L);
    L /= ld;
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 40.0);
    col += vec3(1.0, 0.85, 0.65) * uFlash.w * (spec * 2.0 + max(dot(N, L), 0.0) * 0.08) / (1.0 + ld * ld * 0.02);
  }

  // Splash foam.
  col = mix(col, haze * 0.9 + vec3(0.08), clamp(foam, 0.0, 0.8));

  // Mist over the water towards the horizon.
  float fog = atmoFogAmount(cameraPosition, -toCam, uFogDensity);
  col = mix(col, atmoHaze(-V), fog);

  gl_FragColor = vec4(col, 1.0);
}`;

// Planar mirror about y = 0, adapted from three.js's Reflector (MIT).
class PlanarReflection {
  constructor(scale) {
    this.scale = scale;
    this.camera = new THREE.PerspectiveCamera();
    this.camera.layers.set(0);
    this.textureMatrix = new THREE.Matrix4();
    this.target = new THREE.WebGLRenderTarget(16, 16, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
    });
    this.target.texture.generateMipmaps = false;
    this._plane = new THREE.Plane();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
    this._view = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
    this._normal = new THREE.Vector3(0, 1, 0);
    this._origin = new THREE.Vector3(0, 0, 0);
  }

  setSize(w, h) {
    this.target.setSize(Math.max(16, Math.round(w * this.scale)), Math.max(16, Math.round(h * this.scale)));
  }

  render(renderer, scene, camera, hide) {
    const rc = this.camera;
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
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

    // Oblique near plane so nothing under the water leaks into the mirror.
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

    for (const o of hide) o.visible = false;
    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, rc);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadow;
    for (const o of hide) o.visible = true;
  }
}

export class Sea {
  constructor({ waves, fogDensity, reflectionScale }) {
    this.reflection = new PlanarReflection(reflectionScale);
    this.ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0));
    this.rippleIndex = 0;
    this.uniforms = {
      uReflection: { value: this.reflection.target.texture },
      uTexMatrix: { value: this.reflection.textureMatrix },
      uWaves: { value: waves },
      uTime: { value: 0 },
      uFogDensity: { value: fogDensity },
      uRipples: { value: this.ripples },
      uFlash: { value: new THREE.Vector4() },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      fog: false,
    });
    const geo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'sea';
    this.mesh.renderOrder = -500;
    this.mesh.frustumCulled = false;
  }

  addRipple(x, z, strength, time) {
    const r = this.ripples[this.rippleIndex];
    r.set(x, z, time, strength);
    this.rippleIndex = (this.rippleIndex + 1) % MAX_RIPPLES;
  }

  setSize(w, h) {
    this.reflection.setSize(w, h);
  }

  update(time, camera) {
    this.uniforms.uTime.value = time;
    this.mesh.position.set(camera.position.x, 0, camera.position.z);
  }

  renderReflection(renderer, scene, camera, hide = []) {
    this.reflection.render(renderer, scene, camera, [this.mesh, ...hide]);
  }
}
