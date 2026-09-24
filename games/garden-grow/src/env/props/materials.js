// Materials for the garden props, built on the shared painted textures.
// Timber, paint, terracotta and stone share one weathering chunk keyed off
// world position: splash-back dirt and damp just above the ground, green
// algae in patches, moss and lichen on faces turned to the sky. Leaf cards
// glow a little when the low sun is behind them.
import * as THREE from 'three';
import * as TX from './textures.js';

const WEATHER_VERT = /* glsl */ `
{
  vec4 ggP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  ggP = instanceMatrix * ggP;
  #endif
  vGgPos = (modelMatrix * ggP).xyz;
}`;

const NOISE = /* glsl */ `
float ggH3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float ggVN(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ggH3(i), ggH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(ggH3(i + vec3(0.0, 1.0, 0.0)), ggH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(ggH3(i + vec3(0.0, 0.0, 1.0)), ggH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(ggH3(i + vec3(0.0, 1.0, 1.0)), ggH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
`;

const WEATHER_FRAG_PARS = /* glsl */ `
varying vec3 vGgPos;
uniform vec4 uGg;      // x splash height (m), y dirt, z algae, w moss on top faces
uniform vec3 uGgDirt;  // dirt multiplier (linear)
uniform vec3 uGgAlgae; // algae / moss colour
${NOISE}`;

const WEATHER_FRAG = /* glsl */ `
{
  vec3 gp = vGgPos;
  float n1 = ggVN(gp * 6.0);
  float n2 = ggVN(gp * 23.0 + 3.7);
  float gn = n1 * 0.65 + n2 * 0.35;
  // splash-back: soil thrown up by rain darkens the bottom few centimetres
  float splash = 1.0 - smoothstep(0.0, uGg.x, gp.y + (gn - 0.5) * uGg.x * 0.9);
  diffuseColor.rgb *= mix(vec3(1.0), uGgDirt, splash * uGg.y);
  // green algae where it stays damp
  float al = smoothstep(0.55, 0.85, gn + splash * 0.35) * uGg.z;
  diffuseColor.rgb = mix(diffuseColor.rgb, uGgAlgae * (0.7 + 0.6 * n2), al);
  // moss and lichen on faces turned to the sky
  vec3 wN = inverseTransformDirection(normal, viewMatrix);
  float up = smoothstep(0.55, 0.95, wN.y);
  float moss = up * smoothstep(0.42, 0.72, ggVN(gp * 14.0 + 7.1)) * uGg.w;
  diffuseColor.rgb = mix(diffuseColor.rgb, uGgAlgae * (0.8 + 0.5 * n2), moss);
  roughnessFactor = min(1.0, roughnessFactor + splash * uGg.y * 0.08);
}`;

// Adds the weathering chunk to a standard/physical material.
export function weather(mat, { height = 0.12, dirt = 0.45, algae = 0.15, moss = 0, dirtMul = [0.55, 0.46, 0.36], algaeCol = '#4f5d2c' } = {}) {
  const u = {
    uGg: { value: new THREE.Vector4(height, dirt, algae, moss) },
    uGgDirt: { value: new THREE.Color().setRGB(...dirtMul) },
    uGgAlgae: { value: new THREE.Color(algaeCol) },
  };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGgPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WEATHER_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WEATHER_FRAG_PARS}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${WEATHER_FRAG}`);
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => `${key}|gg-weather`;
  mat.userData.weather = u;
  return mat;
}

// Leaf cards: keep the canopy-shaped normals on both faces (so a card seen
// from behind is lit like the canopy, not black) and let the low sun shine
// through the leaves when it is behind them.
export function foliage(mat, { transl = 0.6 } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTransl = { value: transl };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTransl;')
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
#ifdef DOUBLE_SIDED
normal *= faceDirection;
#endif`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
{
  vec3 ggL = directionalLights[0].direction;
  float ggBack = pow(max(dot(normalize(vViewPosition), -ggL), 0.0), 3.0);
  #ifdef USE_COLOR
  // leaves deep in a crown or pressed on a hedge face have no light behind them
  ggBack *= vColor.g * vColor.g;
  #endif
  reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.05, 1.15, 0.7) * directionalLights[0].color * ggBack * uTransl;
}
#endif`,
      );
  };
  mat.customProgramCacheKey = () => 'gg-foliage';
  return mat;
}

// One set of materials per built garden. Textures are shared by every
// garden (painted once); materials are cheap and belong to this build.
export function makeKit(quality) {
  const made = new Map();
  const once = (key, fn) => {
    if (!made.has(key)) made.set(key, fn());
    return made.get(key);
  };
  const low = quality && quality.tier === 'low';
  return {
    low,
    // weathered timber, tinted per use (the texture is a neutral silver-honey)
    wood: (tint = '#c8ad8a', opts = {}) =>
      once(`wood${tint}${JSON.stringify(opts)}`, () => {
        const t = TX.woodTextures();
        const m = new THREE.MeshStandardMaterial({
          color: new THREE.Color(tint),
          map: t.map,
          normalMap: t.normalMap,
          normalScale: new THREE.Vector2(0.9, 0.9),
          roughness: 0.86,
          vertexColors: true,
        });
        return weather(m, { height: 0.14, dirt: 0.55, algae: 0.18, moss: 0.25, ...opts });
      }),
    painted: (tint = '#ffffff', opts = {}) =>
      once(`paint${tint}${JSON.stringify(opts)}`, () => {
        const t = TX.paintedTextures();
        const m = new THREE.MeshStandardMaterial({
          color: new THREE.Color(tint),
          map: t.map,
          normalMap: t.normalMap,
          normalScale: new THREE.Vector2(0.7, 0.7),
          roughness: 0.72,
          vertexColors: true,
        });
        return weather(m, { height: 0.2, dirt: 0.5, algae: 0.22, moss: 0.35, ...opts });
      }),
    terracotta: () =>
      once('terracotta', () => {
        const t = TX.terracottaTextures();
        const m = new THREE.MeshStandardMaterial({
          map: t.map,
          normalMap: t.normalMap,
          normalScale: new THREE.Vector2(0.6, 0.6),
          roughness: 0.9,
          vertexColors: true,
        });
        return weather(m, { height: 0.05, dirt: 0.35, algae: 0.05, moss: 0.1 });
      }),
    stone: () =>
      once('stone', () => {
        const t = TX.stoneTextures();
        const m = new THREE.MeshStandardMaterial({
          map: t.map,
          normalMap: t.normalMap,
          normalScale: new THREE.Vector2(0.8, 0.8),
          roughness: 0.93,
          vertexColors: true,
        });
        return m;
      }),
    leaves: (opts = {}) =>
      once(`leaves${JSON.stringify(opts)}`, () => {
        const t = TX.leafTextures();
        const m = new THREE.MeshStandardMaterial({
          map: t.map,
          alphaTest: 0.42,
          side: THREE.DoubleSide,
          roughness: 0.78,
          vertexColors: true,
          ...opts,
        });
        return foliage(m);
      }),
    hedge: () =>
      once('hedge', () => {
        const t = TX.hedgeTextures();
        return new THREE.MeshStandardMaterial({
          map: t.map,
          normalMap: t.normalMap,
          normalScale: new THREE.Vector2(1.2, 1.2),
          roughness: 0.82,
          vertexColors: true,
        });
      }),
    canopy: () =>
      once('canopy', () => {
        const t = TX.canopyTextures();
        return new THREE.MeshStandardMaterial({
          map: t.map,
          normalMap: t.normalMap,
          normalScale: new THREE.Vector2(1, 1),
          roughness: 0.85,
          vertexColors: true,
        });
      }),
    bark: (kind = 1) =>
      once(`bark${kind}`, () => {
        const t = TX.barkTextures(kind);
        return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.95, vertexColors: true });
      }),
    brick: () =>
      once('brick', () => {
        const t = TX.brickTextures();
        const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.92, vertexColors: true });
        return weather(m, { height: 0.25, dirt: 0.35, algae: 0.12, moss: 0.3 });
      }),
    wicker: () =>
      once('wicker', () => {
        const t = TX.wickerTextures();
        return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.8, vertexColors: true });
      }),
    // black powder-coated steel
    metal: () =>
      once('metal', () => {
        const m = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1b1c1d'), roughness: 0.42, metalness: 0.35, vertexColors: true });
        return weather(m, { height: 0.08, dirt: 0.25, algae: 0, moss: 0 });
      }),
    steel: () => once('steel', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#8d8f8f'), roughness: 0.38, metalness: 1, vertexColors: true })),
    // flat colours for far, hazed things
    plain: (hex, roughness = 0.95) => once(`plain${hex}${roughness}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness, vertexColors: true })),
  };
}

// Makes sure a geometry has a colour attribute (the materials use vertex
// colours for baked darkening; a missing attribute would read as black).
export function ensureColor(geo, v = 1) {
  if (!geo.attributes.color) {
    const c = new Float32Array(geo.attributes.position.count * 3).fill(v);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  return geo;
}

// A mesh that casts and receives shadows.
export function solid(geo, mat, { cast = true, receive = true } = {}) {
  ensureColor(geo);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
