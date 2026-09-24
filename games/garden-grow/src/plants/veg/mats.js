// Materials for the vegetables. Leaves and stems come from the shared plant
// materials (../materials.js) so the whole garden has one look; this adds
// a per-instance sway allowance for instanced leaves, and glossy or waxy
// fruit that sways rigidly with the stem it hangs from.
import * as THREE from 'three';
import { leafMaterial, stemMaterial, plantUniforms } from '../materials.js';
import { wind, WIND_GLSL } from '../../shared.js';
import { once } from './tex.js';

// Instanced leaves sit at different heights on one plant, but the shared
// sway reads one flex per vertex. `aVegFlex` (instanced vec2: x = extra
// scale, y = offset) lets each instance start from the flex of the stem it
// grows from: flex = aPlant.x * (1 + x) + y. Missing attributes read 0.
function addInstanceFlex(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev?.(shader, r);
    shader.vertexShader = shader.vertexShader
      .replace('attribute vec2 aPlant;', 'attribute vec2 aPlant;\nattribute vec2 aVegFlex;')
      .replace('windSway(wp, aPlant.x)', 'windSway(wp, aPlant.x * (1.0 + aVegFlex.x) + aVegFlex.y)');
  };
  const key = m.customProgramCacheKey?.() ?? '';
  m.customProgramCacheKey = () => `${key}-vegflex`;
  return m;
}

export function vegLeaf(key, opts) {
  return once(`leafmat-${key}`, () => addInstanceFlex(leafMaterial(opts)));
}

export function vegStem(key, opts) {
  return once(`stemmat-${key}`, () => addInstanceFlex(stemMaterial(opts)));
}

// A physical material that sways rigidly: each instance (or the whole mesh)
// moves with the breeze at its own origin, by the flex in aVegFlex.y
// (instanced) or uFlex (plain meshes). Fruit hanging from a swaying stem
// stays on it.
export function rigidSway(m, extra) {
  m.userData.uFlex = { value: 0 };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev?.(shader, r);
    Object.assign(shader.uniforms, wind, { uSway: plantUniforms.uSway, uFlex: m.userData.uFlex });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 aVegFlex;\nuniform float uSway;\nuniform float uFlex;\n${WIND_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  mat4 gm = modelMatrix;
  #ifdef USE_INSTANCING
    gm = modelMatrix * instanceMatrix;
  #endif
  vec3 wp0 = (gm * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec2 sw = windSway(wp0, uFlex + aVegFlex.y) * uSway;
  transformed += (vec3(sw.x, 0.0, sw.y) * mat3(gm)) / max(1e-6, dot(gm[0].xyz, gm[0].xyz));
}`,
      );
    extra?.(shader);
  };
  const key = m.customProgramCacheKey?.() ?? '';
  m.customProgramCacheKey = () => `${key}-vegrigid-${m.userData.kind ?? ''}`;
  return m;
}

// Sets an instance's flex allowance (see addInstanceFlex / rigidSway).
export function instanceFlex(mesh) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 2), 2);
  a.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.setAttribute('aVegFlex', a);
  return a;
}
