// Bird materials. The body and head share one plumage material per species:
// a physical material with a soft feather sheen whose colour comes from the
// species paint function (species.js), evaluated at the rest-pose position
// of the centre of the feather under each pixel (see bodyDetail), so colour
// borders break along feather edges the way real plumage does.
import * as THREE from 'three';
import { PAINT_LIB } from './species.js';
import { bodyDetail, featherAtlas, featherNormal, DETAIL_OFFSET } from './textures.js';
import { featherDims } from './feathers.js';

function paletteDefines(pal) {
  let s = '';
  for (const [name, hex] of Object.entries(pal)) {
    const c = new THREE.Color(hex); // linear working colour
    s += `#define ${name} vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})\n`;
  }
  return s;
}

export function plumageMaterial(sp) {
  const det = bodyDetail();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0,
    normalMap: det.normal,
    normalScale: new THREE.Vector2(0.38, 0.38),
    sheen: 0.45,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(1, 1, 1),
    specularIntensity: 0.3,
  });
  mat.name = `bird-plumage-${sp.id}`;
  const uniforms = { uDetail: { value: det.map } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRest;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vRest = aRest;`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uDetail;
varying vec3 vRest;
${paletteDefines(sp.palette)}
${PAINT_LIB}
${sp.paint}
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec4 det = texture2D(uDetail, vNormalMapUv);
  // move to the centre of the feather under this pixel
  vec2 off = (det.gb * 2.0 - 1.0) * ${DETAIL_OFFSET.toFixed(3)};
  vec3 dpx = dFdx(vRest);
  vec3 dpy = dFdy(vRest);
  vec2 dux = dFdx(vNormalMapUv);
  vec2 duy = dFdy(vNormalMapUv);
  float dd = dux.x * duy.y - dux.y * duy.x;
  vec3 anchor = vRest;
  if (abs(dd) > 1e-12) {
    vec3 dPdu = (dpx * duy.y - dpy * dux.y) / dd;
    vec3 dPdv = (dpy * dux.x - dpx * duy.x) / dd;
    vec3 shift = dPdu * off.x + dPdv * off.y;
    float l = length(shift);
    anchor += shift * min(1.0, 0.0025 / max(l, 1e-6));
  }
  vec3 plum = plumage(anchor * 1000.0);
  diffuseColor.rgb *= plum * mix(0.8, 1.1, det.r);
}
`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
#ifdef USE_SHEEN
  material.sheenColor *= diffuseColor.rgb * 1.3 + 0.03;
#endif
`,
      );
  };
  mat.customProgramCacheKey = () => `bird-plumage-${sp.id}`;
  return mat;
}

export function featherMaterial(sp) {
  const dims = featherDims(sp);
  const mat = new THREE.MeshPhysicalMaterial({
    map: featherAtlas(sp, dims),
    normalMap: featherNormal(dims),
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
    sheen: 0.55,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(1, 1, 1),
    specularIntensity: 0.3,
  });
  mat.name = `bird-feathers-${sp.id}`;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
#ifdef USE_SHEEN
  material.sheenColor *= diffuseColor.rgb * 1.2 + 0.03;
#endif
`,
    );
  };
  mat.customProgramCacheKey = () => 'bird-feathers';
  return mat;
}

export function beakMaterial() {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.62,
    clearcoat: 0.12,
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.45,
    side: THREE.DoubleSide,
  });
}

export function eyeMaterial() {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.6,
    specularIntensity: 1,
  });
}

export function legMaterial() {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.48,
    clearcoat: 0.2,
    clearcoatRoughness: 0.4,
  });
}
