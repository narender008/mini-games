// Plant materials: leaves, petals and stems. They are the standard PBR
// materials with three additions patched in by onBeforeCompile:
//  - the shared breeze (WIND_GLSL) bends every vertex by its `aPlant.x`
//    flex, so stems, leaves and petals sway together with the grass;
//  - thin-surface translucency: sunlight arriving on the far side of a leaf
//    or petal shines through it, tinted by its colour, strongest when you look
//    towards the sun (the golden-hour glow of backlit leaves and petals);
//  - thin surfaces never shadow themselves (the shadow lookup is nudged
//    towards the light), so a backlit leaf still glows but the leaf in front
//    of it still casts its shadow.
//
// Optional geometry attribute `aPlant` (vec2): x = flex (0 at the root, about
// 1 at the tip of a 40 cm stem; see windSway in shared.js), y = thickness
// (0 thin and translucent, 1 opaque). Without it a mesh does not sway and is
// fully translucent. Vertex colours are used only with `vertexColors: true`.
import * as THREE from 'three';
import { wind, WIND_GLSL } from '../shared.js';

// Filled by Plants.update each frame.
export const plantUniforms = {
  uSunDir: { value: new THREE.Vector3(-0.45, 0.4, -0.8).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.84, 0.63) },
  uNight: { value: 0 },
  uSway: { value: 1 }, // 0.5 with reduced motion
};

const VERT_DECL = /* glsl */ `
attribute vec2 aPlant;
uniform vec3 uSunDir;
uniform float uSway;
${WIND_GLSL}
`;

// Bend the vertex by the breeze in world space, then bring the offset back
// into object space (the plant group has no shear; scale is divided out).
const VERT_SWAY = /* glsl */ `
#include <begin_vertex>
{
  mat4 gm = modelMatrix;
  #ifdef USE_INSTANCING
    gm = modelMatrix * instanceMatrix;
  #endif
  vec3 wp = (gm * vec4(transformed, 1.0)).xyz;
  vec2 sw = windSway(wp, aPlant.x) * uSway;
  vec3 wo = vec3(sw.x, 0.0, sw.y);
  transformed += (wo * mat3(gm)) / max(1e-6, dot(gm[0].xyz, gm[0].xyz));
}
`;

const SHADOW_VERTEX = THREE.ShaderChunk.shadowmap_vertex.replace(
  'vec4 shadowWorldPosition;',
  'vec4 shadowWorldPosition;\n\tshadowWorldNormal *= dot(shadowWorldNormal, uSunDir) < 0.0 ? -1.0 : 1.0;',
);

const FRAG_DECL = /* glsl */ `
uniform float uTrans;
uniform vec3 uTransTint;
uniform vec3 uBackTint;
uniform float uGlow;
uniform float uNight;
uniform float uSpec;
varying float vThick;
`;

// Wraps the physical direct-light term with thin-surface transmission.
// Light that reaches the far side of a thin leaf or petal passes through it,
// filtered by its pigment (a little more saturated). It is normalised like
// the Lambert term, so a backlit petal is at most ~1.2x as bright as the
// same petal lit from the front: it glows softly and keeps its texture, and
// there is none of it unless the light really is behind the surface.
const FRAG_TRANSLUCENT = /* glsl */ `
#include <lights_physical_pars_fragment>
void RE_Direct_Plant(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal,
                     const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal,
                     const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  // the sun's own highlight can be toned down (a low sun glinting off a
  // leaf at a grazing angle would otherwise turn the whole leaf white)
  vec3 spec0 = reflectedLight.directSpecular;
  RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  reflectedLight.directSpecular = spec0 + (reflectedLight.directSpecular - spec0) * uSpec;
  float back = saturate(dot(-geometryNormal, directLight.direction));
  float toward = saturate(dot(-geometryViewDir, directLight.direction));
  float fwd = toward * toward;
  vec3 dc = material.diffuseColor;
  vec3 tcol = mix(dc, dc * dc / max(max(dc.r, max(dc.g, dc.b)), 0.04), 0.5) * uTransTint;
  float k = back * (0.6 + 0.6 * fwd) * uTrans * (1.0 - vThick);
  reflectedLight.directDiffuse += directLight.color * BRDF_Lambert(tcol) * k;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Plant
`;

function patch(material, opts) {
  const own = {
    uTrans: { value: opts.translucency ?? 0.6 },
    uTransTint: { value: new THREE.Color(...(opts.transTint ?? [1, 1, 1])) },
    uBackTint: { value: new THREE.Color(...(opts.backTint ?? [1, 1, 1])) },
    uGlow: { value: opts.glow ?? 0 },
    uSpec: { value: opts.spec ?? 1 },
  };
  material.userData.uniforms = own;
  const glow = (opts.glow ?? 0) > 0;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wind, plantUniforms, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}\nvarying float vThick;`)
      .replace('#include <begin_vertex>', `${VERT_SWAY}\nvThick = aPlant.y;`)
      .replace('#include <shadowmap_vertex>', SHADOW_VERTEX);
    let frag = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <lights_physical_pars_fragment>', FRAG_TRANSLUCENT)
      // the underside of a leaf is paler; the inside of a petal a touch deeper
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb *= uBackTint;');
    if (glow) {
      // a soft self-glow (moonflower), mostly at night
      frag = frag.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uGlow * mix(0.12, 1.0, uNight);',
      );
    }
    shader.fragmentShader = frag;
  };
  material.customProgramCacheKey = () => `gg-plant-${glow ? 1 : 0}`;
  return material;
}

// Leaves (and sepals, cotyledons, bracts). Double-sided; `map` is an sRGB
// colour texture, `normalMap` a linear one (veins); `translucency` 0..1;
// `spec` scales the sun's highlight (uniforms: material.userData.uniforms).
export function leafMaterial({
  color = '#ffffff',
  map = null,
  normalMap = null,
  normalScale = 1,
  translucency = 0.55,
  roughness = 0.55,
  vertexColors = false,
  alphaTest = 0,
  transTint = [1.0, 1.05, 0.7],
  backTint = [1.12, 1.15, 1.08],
  spec = 0.5,
} = {}) {
  const m = new THREE.MeshStandardMaterial({ color, map, normalMap, roughness, metalness: 0, side: THREE.DoubleSide, vertexColors, alphaTest });
  if (normalMap) m.normalScale.set(normalScale, normalScale);
  return patch(m, { translucency, transTint, backTint, spec });
}

// Petals. `sheen` 0..1 adds a velvet sheen (roses, poppies); `glow` a faint
// self-light that strengthens with night (moonflower).
export function petalMaterial({
  color = '#ffffff',
  map = null,
  normalMap = null,
  normalScale = 1,
  translucency = 0.8,
  sheen = 0,
  roughness = 0.5,
  vertexColors = false,
  alphaTest = 0,
  transTint = [1, 1, 1],
  backTint = [0.96, 0.96, 0.96],
  glow = 0,
} = {}) {
  const params = { color, map, normalMap, roughness, metalness: 0, side: THREE.DoubleSide, vertexColors, alphaTest };
  const m =
    sheen > 0
      ? new THREE.MeshPhysicalMaterial({ ...params, sheen, sheenRoughness: 0.45, sheenColor: new THREE.Color(0.9, 0.85, 0.85).multiplyScalar(0.6) })
      : new THREE.MeshStandardMaterial(params);
  if (normalMap) m.normalScale.set(normalScale, normalScale);
  return patch(m, { translucency, transTint, backTint, glow });
}

// Stems, stalks and petioles: single-sided tubes, a little translucent.
export function stemMaterial({ color = '#ffffff', map = null, normalMap = null, roughness = 0.6, vertexColors = false, translucency = 0.25 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, map, normalMap, roughness, metalness: 0, vertexColors });
  return patch(m, { translucency, transTint: [1, 1.05, 0.7] });
}
