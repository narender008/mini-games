// The dusk atmosphere: a sky colour table taken from the reference photograph,
// and a directional, height-aware haze that every lit material shares so
// distant things melt into the same mist as the horizon.
import * as THREE from 'three';
import { SUN_DIR, glslVec3 } from './config.js';

// Sky colour keys. Columns are angular distance (radians) from the sun's
// azimuth; rows are elevation (radians). Values are sRGB, read off the
// reference from its warm right-hand glow to its stormy left edge.
const AZ = [0, 0.35, 0.82, 1.05, 1.46, 2.2, Math.PI];
const EL = [0, 0.04, 0.07, 0.11, 0.155, 0.2, 0.24, 0.28, 0.32, 0.36, 0.41, 0.49, 0.8, 1.571];
const KEYS = [
  ['#fff2c4', '#fde2a8', '#fbd79c', '#f6c28e', '#eba886', '#c98a7c', '#a06a6a', '#7a4a55', '#5a3242', '#402232', '#2c1826', '#1c0e18', '#0c0812', '#05040c'],
  ['#f9e3a5', '#f8d59c', '#f7d096', '#f3b889', '#e09d82', '#b77a72', '#8f5d60', '#6a3f4a', '#4e2a34', '#381c24', '#28151e', '#1a0d15', '#0a0610', '#05040c'],
  ['#e9bbb7', '#d5a6aa', '#b190ac', '#998bb1', '#8684b0', '#7073a4', '#636a9e', '#42518c', '#2b3a79', '#222d6d', '#141a50', '#070925', '#04061a', '#03040f'],
  ['#9a90b4', '#8a86b0', '#7478a8', '#6f79ae', '#5768a3', '#40518b', '#384a8b', '#29366d', '#202459', '#1b2259', '#181f58', '#080925', '#04061a', '#03040f'],
  ['#3c4a82', '#34427a', '#2c3970', '#253166', '#1e295c', '#182252', '#151d4a', '#121942', '#0f1538', '#0c1130', '#0a0e29', '#070a1f', '#040617', '#03040f'],
  ['#2a3664', '#252f5c', '#1f2853', '#1a2249', '#161d40', '#131938', '#101531', '#0d122b', '#0b0f25', '#0a0d21', '#080b1d', '#060817', '#040612', '#03040f'],
  ['#232d56', '#1f2850', '#1b2349', '#171e41', '#141a3a', '#111632', '#0e132c', '#0c1026', '#0a0e22', '#090c1e', '#070a1a', '#050715', '#040511', '#03040e'],
];

function lerpKeys(keys, xs, x) {
  if (x <= xs[0]) return keys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      const s = t * t * (3 - 2 * t);
      return keys[i - 1].clone().lerp(keys[i], s);
    }
  }
  return keys[keys.length - 1];
}

// A 128 x 128 float table: x = azimuth distance from the sun (0..pi),
// y = elevation remapped from -0.35..pi/2 (below the horizon is only seen
// by the environment map, and fades to the dark sea tone).
export const SKY_LUT_MIN_EL = -0.35;
export function createSkyLut(size = 128) {
  const cols = KEYS.map((col) => col.map((hex) => new THREE.Color(hex)));
  const data = new Float32Array(size * size * 4);
  const sea = new THREE.Color('#10163a');
  for (let y = 0; y < size; y++) {
    const el = SKY_LUT_MIN_EL + (y / (size - 1)) * (Math.PI / 2 - SKY_LUT_MIN_EL);
    for (let x = 0; x < size; x++) {
      const az = (x / (size - 1)) * Math.PI;
      // interpolate along elevation inside each column, then across columns
      const perCol = cols.map((col) => lerpKeys(col, EL, Math.max(0, el)));
      const c = lerpKeys(perCol, AZ, az);
      if (el < 0) c.lerp(sea, Math.min(1, -el / 0.3) ** 0.7);
      const i = (y * size + x) * 4;
      data[i] = c.r;
      data[i + 1] = c.g;
      data[i + 2] = c.b;
      data[i + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// GLSL shared by the sky, the sea, the mist and the global fog.
export const ATMO_GLSL = /* glsl */ `
const vec3 ATMO_SUN = vec3(${SUN_DIR.x.toFixed(5)}, ${SUN_DIR.y.toFixed(5)}, ${SUN_DIR.z.toFixed(5)});
const vec3 ATMO_SUN_COLOR = ${glslVec3('#ffc58a')};

// Angular distance of a direction's azimuth from the sun's azimuth, 0..pi.
float atmoAzimuth(vec3 dir) {
  vec2 a = normalize(dir.xz + vec2(1e-5));
  vec2 s = normalize(ATMO_SUN.xz);
  return acos(clamp(dot(a, s), -1.0, 1.0));
}

// Colour of the low haze at the horizon in a given direction (linear).
vec3 atmoHaze(vec3 dir) {
  float a = atmoAzimuth(dir);
  vec3 c0 = ${glslVec3('#fbe3ae')};
  vec3 c1 = ${glslVec3('#f5d09f')};
  vec3 c2 = ${glslVec3('#d8aaae')};
  vec3 c3 = ${glslVec3('#8d88b2')};
  vec3 c4 = ${glslVec3('#3b4880')};
  vec3 c5 = ${glslVec3('#262f5b')};
  vec3 c = mix(c0, c1, smoothstep(0.0, 0.35, a));
  c = mix(c, c2, smoothstep(0.35, 0.82, a));
  c = mix(c, c3, smoothstep(0.82, 1.1, a));
  c = mix(c, c4, smoothstep(1.1, 1.5, a));
  c = mix(c, c5, smoothstep(1.5, 2.4, a));
  // a little brighter looking up into the lit air near the sun
  return c;
}

// Height-aware optical depth along a view ray. Denser just above the water.
float atmoFogAmount(vec3 camPos, vec3 toPoint, float density) {
  float dist = length(toPoint);
  float h0 = camPos.y;
  float h1 = camPos.y + toPoint.y;
  const float H = 14.0;
  float dh = h1 - h0;
  float e0 = exp(-max(h0, 0.0) / H);
  float e1 = exp(-max(h1, 0.0) / H);
  float avgH = abs(dh) > 0.01 ? (e0 - e1) * H / dh : e0;
  float od = dist * density * (0.35 + 1.4 * avgH);
  return 1.0 - exp(-od);
}
`;

// Replace three.js's fog chunks so every material with fog gets directional,
// height-aware haze that matches the sky. Uses scene.fog (FogExp2) only to
// switch fog on and to feed its density.
export function installAtmosphereFog() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogToPoint;
#endif`;
  C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogToPoint = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
#endif`;
  C.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogDensity;
  varying float vFogDepth;
  varying vec3 vFogToPoint;
  ${ATMO_GLSL}
#endif`;
  C.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fogFactor = atmoFogAmount( cameraPosition, vFogToPoint, fogDensity );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, atmoHaze( normalize( vFogToPoint ) ), fogFactor );
#endif`;
}
