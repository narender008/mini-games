// Open water beyond the lane: a lake, the sea, a pond. A flat sheet at the
// water line that the terrain dips under, so the shore is wherever the land
// meets it. The surface is glassy, with small wind ripples and the sun
// glinting on them; its own colour shows only when looking down into it.
//
// With `reflect`, it mirrors the scenery for real: just before the water is
// drawn, the far scenery (whatever is on the REFLECT layer: the terrain, the
// trees, the sky) is drawn again from a camera mirrored under the water line,
// into a small picture the water then shows through its ripples, more and
// more towards the horizon (Fresnel). The mirror camera's near plane is
// tilted onto the water line (an oblique clip, after Lengyel), so nothing
// under the water leaks into the reflection. Without `reflect` it reflects
// the sky only (the stage's environment).
import * as THREE from 'three';

export const LAYER_REFLECT = 3;

const _plane = new THREE.Plane();
const _normal = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector2();

export class Water {
  // area: [x0, x1, z0, z1]; color: the water's body colour; ripple: strength;
  // reflect: { scale } (fraction of the screen size for the mirror picture)
  constructor({ y, area, color = 0x1f5566, ripple = 1, rough = 0.04, waves = 0, reflect = null }) {
    const [x0, x1, z0, z1] = area;
    this.y = y;
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, waves ? 160 : 1, waves ? 60 : 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    this.uniforms = {
      uTime: { value: 0 },
      uRipple: { value: ripple },
      uWaves: { value: waves },
      tReflect: { value: null },
      uReflect: { value: 0 },
      uReflectMatrix: { value: new THREE.Matrix4() },
    };
    const mat = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, ior: 1.33, specularIntensity: 1, envMapIntensity: reflect ? 0.25 : 1 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;\nvarying vec4 vReflUv;\nuniform float uTime;\nuniform float uWaves;\nuniform mat4 uReflectMatrix;')
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = position;
// long gentle swell (the sea); nothing on a lake
transformed.y += uWaves * (sin(position.z * 0.9 + uTime * 1.1) * 0.05 + sin(position.x * 0.37 + position.z * 0.5 + uTime * 0.8) * 0.04);`,
        )
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvReflUv = uReflectMatrix * vec4(vWaterPos, 1.0);');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vWaterPos;
varying vec4 vReflUv;
uniform float uTime;
uniform float uRipple;
uniform sampler2D tReflect;
uniform float uReflect;
vec2 wtRipple;
vec2 wtGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  // several small wave trains at different angles and sizes
  const int N = 6;
  for (int i = 0; i < N; i++) {
    float fi = float(i);
    float a = fi * 2.39996 + 0.4;
    vec2 d = vec2(cos(a), sin(a));
    float k = 1.6 * pow(1.55, fi);
    float amp = 0.06 / k;
    float ph = dot(d, p) * k + t * sqrt(9.8 * k) * 0.5 + fi * 1.7;
    g += d * cos(ph) * amp * k;
  }
  return g;
}`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `{
  float dist = length(vViewPosition);
  // ripples fade with distance so they never shimmer; a little stays for the sparkle
  float fade = uRipple / (1.0 + dist * 0.12);
  vec2 g = wtGrad(vWaterPos.xz * 3.0, uTime) * fade + wtGrad(vWaterPos.xz * 0.7 + 13.0, uTime * 0.6) * fade * 0.6;
  wtRipple = g;
  vec3 wn = normalize(vec3(-g.x, 1.0, -g.y));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`,
        )
        .replace(
          '#include <opaque_fragment>',
          `if (uReflect > 0.0) {
  // the mirrored scenery, wobbled by the ripples, stronger at grazing angles
  vec4 ru = vReflUv;
  ru.xy += wtRipple * ru.w * 0.35;
  vec3 refl = texture2DProj(tReflect, ru).rgb;
  float cosv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosv, 5.0);
  outgoingLight = mix(outgoingLight, refl, clamp(F * uReflect, 0.0, 1.0));
}
#include <opaque_fragment>`,
        );
    };
    mat.customProgramCacheKey = () => (reflect ? 'water-reflect' : 'water');
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'water';
    if (reflect) this.setupReflection(reflect);
  }

  setupReflection({ scale = 0.5, strength = 1 }) {
    this.scale = scale;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    this.rt.texture.generateMipmaps = false;
    this.mirror = new THREE.PerspectiveCamera();
    this.mirror.layers.set(LAYER_REFLECT);
    this.uniforms.tReflect.value = this.rt.texture;
    this.uniforms.uReflect.value = strength;
    this.busy = false;
    this.mesh.onBeforeRender = (renderer, scene, camera) => this.renderReflection(renderer, scene, camera);
  }

  renderReflection(renderer, scene, camera) {
    if (this.busy || !camera.isPerspectiveCamera) return;
    // looking at the water from below its surface: nothing to mirror
    if (camera.position.y < this.y) return;
    this.busy = true;
    renderer.getDrawingBufferSize(_v);
    const w = Math.max(64, Math.round(_v.x * this.scale));
    const h = Math.max(32, Math.round(_v.y * this.scale));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const m = this.mirror;
    // mirror the camera, the point it looks at and its up direction in the water line
    _p.setFromMatrixPosition(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_m.extractRotation(camera.matrixWorld)).add(_p);
    m.position.set(_p.x, 2 * this.y - _p.y, _p.z);
    _target.set(_look.x, 2 * this.y - _look.y, _look.z);
    m.up.set(0, 1, 0).applyMatrix4(_m.extractRotation(camera.matrixWorld));
    m.up.y *= -1;
    m.lookAt(_target);
    m.near = camera.near;
    m.far = camera.far;
    m.fov = camera.fov;
    m.aspect = camera.aspect;
    m.updateMatrixWorld();
    m.projectionMatrix.copy(camera.projectionMatrix);
    // where the mirror picture lands on the water: projective texture coordinates
    const R = this.uniforms.uReflectMatrix.value;
    R.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    R.multiply(m.projectionMatrix).multiply(m.matrixWorldInverse);
    // tilt the near plane onto the water line
    _plane.setFromNormalAndCoplanarPoint(_normal, _p.set(0, this.y, 0)).applyMatrix4(m.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const e = m.projectionMatrix.elements;
    _q.x = (Math.sign(_clip.x) + e[8]) / e[0];
    _q.y = (Math.sign(_clip.y) + e[9]) / e[5];
    _q.z = -1;
    _q.w = (1 + e[10]) / e[14];
    _clip.multiplyScalar(2 / _clip.dot(_q));
    e[2] = _clip.x;
    e[6] = _clip.y;
    e[10] = _clip.z + 1 - 0.003;
    e[14] = _clip.w;
    // draw it (the shadows are already up to date for this frame)
    const target = renderer.getRenderTarget();
    const shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    this.mesh.visible = false;
    renderer.setRenderTarget(this.rt);
    renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, m);
    this.mesh.visible = true;
    renderer.shadowMap.autoUpdate = shadows;
    renderer.setRenderTarget(target);
    this.busy = false;
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.rt?.dispose();
  }
}
