// The sky dome: one sphere drawn behind everything. The expensive part, the
// light scattered by the air, is worked out per vertex (the dome is dense
// near the horizon, where the sky changes fastest); per pixel it adds the
// sun and moon discs, the halo round them (the phase functions), twinkling
// stars, drifting cumulus and high cirrus, the grey of an overcast day and
// the hazy ground below the horizon.
//
// A second copy (env: true) renders into the environment cube: no sun or
// moon disc (the DirectionalLight is the sun), no stars, values clamped, and
// a soft tree line round the horizon, as a real garden has.
import * as THREE from 'three';
import { ATMOSPHERE_GLSL, PHASE_GLSL, CLOUD_ALT, CIRRUS_ALT, scatter, phaseR, phaseM } from '../atmosphere.js';

const VERT = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uTurb;
uniform float uMoonOn;
varying vec3 vDir;
varying vec3 vRS;
varying vec3 vMS;
varying vec3 vRM;
varying vec3 vMM;
varying vec3 vTV;
${ATMOSPHERE_GLSL}
void main() {
  vDir = position;
  vec3 d = normalize(position);
  vec3 dh = normalize(vec3(d.x, max(d.y, 0.0) + 1e-4, d.z));
  aScatter(dh, uSunDir, uMoonDir, uTurb, uMoonOn > 0.5, vRS, vMS, vRM, vMM, vTV);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w); // on the far plane: never clips
}`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uMoonOn;
uniform vec3 uSunE;
uniform vec3 uMoonE;
uniform float uMieG;
uniform float uMS;
uniform vec3 uTint;
uniform float uSat;
uniform vec3 uGlow;
uniform vec3 uBelt;
uniform vec3 uNightZen;
uniform vec3 uNightHor;
uniform vec3 uGround;
uniform float uOvercast;
uniform vec3 uOvercastCol;
uniform float uSunDisc;
uniform float uSunRad;
uniform float uMoon;
uniform float uMoonRad;
uniform vec3 uMoonRight;
uniform vec3 uMoonUp;
uniform vec3 uMoonCol;
uniform float uMoonGlow;
uniform float uStars;
uniform float uTime;
uniform sampler2D tNoise;
uniform float uCloudCover;
uniform float uCloudOpacity;
uniform vec2 uCloudOffset;
uniform vec3 uCloudSun;
uniform vec3 uCloudAmb;
uniform vec3 uCloudLight;
uniform float uCirrus;
uniform vec3 uCirrusSun;
uniform vec2 uCirrusOffset;
uniform float uTreeline;
uniform vec3 uTreeCol;
varying vec3 vDir;
varying vec3 vRS;
varying vec3 vMS;
varying vec3 vRM;
varying vec3 vMM;
varying vec3 vTV;
${PHASE_GLSL}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// Hand-tuned colour on top of the physics: the apricot glow where the sun
// has set, the pink belt opposite it, and the deep blue of a moonlit night.
vec3 artSky(vec3 dh) {
  float el = dh.y;
  float ca = clamp(dot(normalize(dh.xz + 1e-5), normalize(uSunDir.xz + 1e-5)), -1.0, 1.0);
  vec3 c = mix(uNightHor, uNightZen, sqrt(el));
  c += uGlow * exp(-el * 7.0) * pow(0.5 + 0.5 * ca, 2.5);
  c += uBelt * exp(-pow((el - 0.13) / 0.1, 2.0)) * pow(0.5 - 0.5 * ca, 1.5);
  return c;
}

// Distance from the eye to a shell alt metres up, along dh.
float shellDist(float mu, float alt) {
  float r0 = ${(6360e3 + 60).toFixed(1)};
  float rc = ${6360e3.toFixed(1)} + alt;
  return -r0 * mu + sqrt(r0 * r0 * mu * mu + (rc - r0) * (rc + r0));
}

float cloudDensity(vec2 p, float cov) {
  float base = texture2D(tNoise, p).r;
  return clamp((base - (1.0 - cov)) / max(cov, 0.12), 0.0, 1.0);
}

void main() {
  vec3 d = normalize(vDir);
  vec3 dh = normalize(vec3(d.x, max(d.y, 0.0) + 1e-4, d.z));
  float muS = dot(dh, uSunDir);
  float muM = dot(dh, uMoonDir);
  vec3 col = uSunE * (vRS * (aPhaseR(muS) + uMS) + vMS * (aPhaseM(muS, uMieG) + uMS));
  if (uMoonOn > 0.5) col += uMoonE * (vRM * (aPhaseR(muM) + uMS) + vMM * (aPhaseM(muM, uMieG) + uMS));
  col = col * uTint + artSky(dh);
  // AgX mutes strong colour; lean into it a little so the blue stays blue
  col = max(vec3(0.0), mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, uSat));
  vec3 horizon = col;
  float above = smoothstep(-0.004, 0.004, d.y);

  // ---- stars, moon and sun (behind the clouds)
  vec3 lights = vec3(0.0);
#ifndef ENV
  float px = max(length(fwidth(d)), 1e-5);
  vec2 mq = vec2(dot(d, uMoonRight), dot(d, uMoonUp)) / uMoonRad;
  float mr = length(mq);
  float maa = max(fwidth(mr), 1e-3);
  float moonDisc = (1.0 - smoothstep(1.0 - maa, 1.0 + maa, mr)) * step(0.0, dot(d, uMoonDir)) * uMoon;
  if (uStars > 0.001) {
    vec3 sp = d * 110.0;
    vec3 cell = floor(sp);
    float h = hash13(cell);
    if (h > 0.962) {
      vec3 jit = vec3(hash13(cell + 1.7), hash13(cell + 4.3), hash13(cell + 8.9));
      vec3 sd = normalize(cell + 0.2 + 0.6 * jit);
      float ang = length(d - sd);
      // a few bright stars, many faint ones, all pin-sharp
      float mag = pow(hash13(cell + 2.1), 9.0);
      float size = px * (0.5 + 0.45 * mag);
      float s = exp(-ang * ang / (size * size));
      float tw = 0.6 + 0.4 * sin(uTime * (1.1 + 2.6 * jit.x) + h * 97.0);
      vec3 sc = mix(vec3(0.75, 0.84, 1.0), vec3(1.0, 0.88, 0.72), jit.y);
      lights += sc * s * (0.035 + 1.1 * mag) * tw * uStars * smoothstep(0.02, 0.25, d.y) * (1.0 - moonDisc);
    }
  }
  if (uMoon > 0.001) {
    if (mr < 1.2) {
      vec2 q = mq * 0.5;
      float maria = smoothstep(0.42, 0.68, textureLod(tNoise, q * 0.42 + vec2(0.31, 0.62), 0.0).b);
      float crater = textureLod(tNoise, q * 1.3 + vec2(0.13, 0.77), 0.0).g;
      float grain = textureLod(tNoise, q * 3.1 + vec2(0.5, 0.2), 0.0).a;
      float alb = 1.0 - 0.34 * maria - 0.1 * smoothstep(0.6, 0.95, crater) + 0.1 * (grain - 0.5);
      float nz = sqrt(max(0.0, 1.0 - mr * mr));
      lights += uMoonCol * alb * (0.8 + 0.2 * nz) * moonDisc;
    }
    // a soft glow of moonlight in the haze round the disc
    lights += uMoonCol * uMoonGlow * uMoon * exp(-max(mr - 1.0, 0.0) * 0.35) * (1.0 - moonDisc) * step(0.0, dot(d, uMoonDir));
  }
  if (uSunDisc > 0.0) {
    float sa = length(d - uSunDir);
    float saa = max(fwidth(sa), 1e-5);
    float disc = 1.0 - smoothstep(uSunRad - saa, uSunRad + saa, sa);
    float limb = sqrt(max(0.0, 1.0 - pow(min(sa / uSunRad, 1.0), 2.0)));
    lights += vec3(1.0, 0.98, 0.94) * uSunDisc * disc * (0.45 + 0.55 * limb);
  }
#endif
  col += lights * vTV * above;

  // ---- clouds: a cumulus layer and a high cirrus layer on shells round the Earth
  float mu = max(d.y, 0.012);
  float tc = shellDist(mu, ${CLOUD_ALT.toFixed(1)});
  vec2 p = dh.xz * tc / 9000.0 + uCloudOffset;
  float ocMod = texture2D(tNoise, p * 0.35 + vec2(0.2, 0.7)).b;
  if (uCloudCover > 0.001) {
    float cov = uCloudCover * mix(0.55, 1.35, texture2D(tNoise, p * 0.23 + vec2(0.37, 0.11)).b);
    float dens = cloudDensity(p, cov);
    float det = texture2D(tNoise, p * 3.3 + vec2(0.71, 0.29)).g;
    float wisp = texture2D(tNoise, p * 8.7 + vec2(0.4, 0.9)).a;
    dens = clamp(dens * 1.35 - (1.0 - det) * 0.5 * (1.0 - dens) - wisp * 0.12, 0.0, 1.0);
    vec2 L = normalize(uCloudLight.xz + 1e-4) * 0.011;
    float occ = cloudDensity(p + L, cov) * 0.5;
#ifndef LOW
    occ += cloudDensity(p + L * 2.5, cov) * 0.3 + cloudDensity(p + L * 5.0, cov) * 0.2;
#else
    occ = occ * 1.6;
#endif
    float muL = dot(d, uCloudLight);
    float Tl = exp(-occ * 2.2 - dens * 0.5);
    // looking towards the light, thick cores go dark and thin edges glow
    float back = smoothstep(-0.1, 0.95, muL);
    float thin = exp(-dens * 3.0);
    float ph = 0.5 * aHG(muL, 0.55) + 0.5 * aHG(muL, -0.25);
    vec3 cc = uCloudSun * Tl * (0.4 + 0.6 * ph) * mix(1.0, thin * 1.5 + 0.1, back);
    cc += uCloudSun * aHG(muL, 0.85) * 0.1 * thin * smoothstep(0.0, 0.2, dens);
    // flat grey-blue bases overhead; towards the horizon we see their sides
    cc += uCloudAmb * (1.0 - 0.55 * dens * smoothstep(0.03, 0.4, d.y));
    float a = smoothstep(0.0, 0.35, dens) * uCloudOpacity * exp(-tc / 32000.0) * above;
    col = mix(col, cc, a);
  }
  if (uCirrus > 0.001) {
    float th = shellDist(mu, ${CIRRUS_ALT.toFixed(1)});
    vec2 q = dh.xz * th / 30000.0 + uCirrusOffset;
    q = vec2(q.x * 0.92 - q.y * 0.38, (q.x * 0.38 + q.y * 0.92) * 2.2);
    float c = texture2D(tNoise, q * 0.3).b * 0.75 + texture2D(tNoise, q * 1.4 + 0.37).a * 0.4;
    float ci = smoothstep(0.6, 1.02, c) * uCirrus * exp(-th / 90000.0) * above;
    float muL = dot(d, uCloudLight);
    vec3 cc = uCirrusSun * (0.45 + 0.5 * aHG(muL, 0.7)) + uCloudAmb * 0.9;
    col = mix(col, cc, ci * 0.6);
  }

  // ---- a soft grey sky for rain: brighter overhead, gently mottled
  if (uOvercast > 0.001) {
    float billow = texture2D(tNoise, p * 0.9 + uCloudOffset * 0.4).r;
    vec3 oc = uOvercastCol * (0.62 + 0.38 * smoothstep(0.0, 0.8, d.y)) * (0.8 + 0.26 * ocMod + 0.22 * (billow - 0.5) * above);
    col = mix(col, oc, uOvercast);
    horizon = mix(horizon, uOvercastCol * 0.62, uOvercast);
  }

  // ---- below the horizon: distant ground fading into the haze
  if (d.y < 0.0) col = mix(uGround, horizon, exp(d.y * 16.0));

#ifdef ENV
  // a garden's horizon is trees and hedges, not open sky
  float az = atan(d.x, -d.z) / 6.2831853;
  float tree = 0.03 + 0.07 * textureLod(tNoise, vec2(az * 3.0, 0.37), 0.0).b + 0.025 * textureLod(tNoise, vec2(az * 19.0, 0.61), 0.0).a;
  float tm = (1.0 - smoothstep(tree - 0.012, tree + 0.012, d.y)) * step(-0.02, d.y) * uTreeline;
  col = mix(col, mix(uTreeCol, horizon, 0.3), tm);
  col = min(col, vec3(12.0));
#endif

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash13(vec3(gl_FragCoord.xy, 7.0)) - 0.5) / 255.0;
}`;

export function createSkyUniforms(noise) {
  const V = () => ({ value: new THREE.Vector3() });
  const F = (v = 0) => ({ value: v });
  return {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uTurb: F(1),
    uMoonOn: F(0),
    uSunE: V(),
    uMoonE: V(),
    uMieG: F(0.8),
    uMS: F(0),
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uSat: F(1),
    uGlow: V(),
    uBelt: V(),
    uNightZen: V(),
    uNightHor: V(),
    uGround: V(),
    uOvercast: F(0),
    uOvercastCol: V(),
    uSunDisc: F(0),
    uSunRad: F(0.0052),
    uMoon: F(0),
    uMoonRad: F(0.0088),
    uMoonRight: { value: new THREE.Vector3(1, 0, 0) },
    uMoonUp: { value: new THREE.Vector3(0, 1, 0) },
    uMoonCol: V(),
    uMoonGlow: F(0),
    uStars: F(0),
    uTime: F(0),
    tNoise: { value: noise },
    uCloudCover: F(0),
    uCloudOpacity: F(1),
    uCloudOffset: { value: new THREE.Vector2() },
    uCloudSun: V(),
    uCloudAmb: V(),
    uCloudLight: { value: new THREE.Vector3(0, 1, 0) },
    uCirrus: F(0),
    uCirrusSun: V(),
    uCirrusOffset: { value: new THREE.Vector2() },
    uTreeline: F(1),
    uTreeCol: V(),
  };
}

// A unit sphere with its rings bunched up near the horizon (elevation goes
// as t|t|), so per-vertex scattering is smooth where the sky changes fastest.
function domeGeometry(segments, rings) {
  const pos = [];
  const idx = [];
  for (let j = 0; j <= rings; j++) {
    const t = (j / rings) * 2 - 1;
    const el = (t * Math.abs(t) * Math.PI) / 2;
    const y = Math.sin(el);
    const r = Math.cos(el);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pos.push(Math.sin(a) * r, y, -Math.cos(a) * r);
    }
  }
  const row = segments + 1;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * row + i;
      const b = a + row;
      // wound to face inwards
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

export function createDome({ uniforms, quality, env = false }) {
  const low = quality.tier === 'low';
  const geometry = domeGeometry(low ? 48 : 72, low ? 44 : 64);
  const defines = {};
  if (env) defines.ENV = 1;
  if (low || env) defines.LOW = 1;
  const material = new THREE.ShaderMaterial({
    name: env ? 'SkyEnv' : 'SkyDome',
    uniforms,
    defines,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.FrontSide,
    depthWrite: false,
    depthTest: !env,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = env ? 'sky-env' : 'sky-dome';
  mesh.frustumCulled = false;
  mesh.scale.setScalar(100);
  // drawn after the opaque scene, so only sky pixels are shaded
  mesh.renderOrder = env ? 0 : 1e6;
  mesh.raycast = () => {};
  return mesh;
}

// ------------------------------------------------------------ JavaScript twin

const _s = { rs: [0, 0, 0], ms: [0, 0, 0], rm: [0, 0, 0], mm: [0, 0, 0], tv: [0, 0, 0] };
const _dh = new THREE.Vector3();
const _base = [0, 0, 0];

// The sky's radiance in direction d (unit Vector3) without clouds, stars or
// discs: the same sum the fragment shader makes, for fog, fill and cloud light.
export function skyRadiance(d, U, out, steps) {
  _dh.set(d.x, Math.max(d.y, 0) + 1e-4, d.z).normalize();
  const sun = U.uSunDir.value;
  const moon = U.uMoonDir.value;
  const moonOn = U.uMoonOn.value > 0.5;
  scatter(_dh, sun, moon, U.uTurb.value, moonOn, _s, steps);
  const g = U.uMieG.value;
  const ms = U.uMS.value;
  const muS = _dh.dot(sun);
  const muM = _dh.dot(moon);
  const pRS = phaseR(muS) + ms;
  const pMS = phaseM(muS, g) + ms;
  const pRM = phaseR(muM) + ms;
  const pMM = phaseM(muM, g) + ms;
  const sE = U.uSunE.value;
  const mE = U.uMoonE.value;
  const tint = U.uTint.value;
  // artSky
  const el = _dh.y;
  const hl = Math.hypot(_dh.x, _dh.z) + 1e-5;
  const sl = Math.hypot(sun.x, sun.z) + 1e-5;
  const ca = Math.min(1, Math.max(-1, (_dh.x * sun.x + _dh.z * sun.z) / (hl * sl)));
  const nz = Math.sqrt(el);
  const glow = Math.exp(-el * 7) * Math.pow(0.5 + 0.5 * ca, 2.5);
  const belt = Math.exp(-Math.pow((el - 0.13) / 0.1, 2)) * Math.pow(0.5 - 0.5 * ca, 1.5);
  const oc = U.uOvercast.value;
  const ocGrad = 0.62 + 0.38 * smooth01(d.y / 0.8);
  const keys = ['x', 'y', 'z'];
  for (let c = 0; c < 3; c++) {
    const k = keys[c];
    let v = sE[k] * (_s.rs[c] * pRS + _s.ms[c] * pMS);
    if (moonOn) v += mE[k] * (_s.rm[c] * pRM + _s.mm[c] * pMM);
    _base[c] = v * tint[k] + U.uNightHor.value[k] + (U.uNightZen.value[k] - U.uNightHor.value[k]) * nz + U.uGlow.value[k] * glow + U.uBelt.value[k] * belt;
  }
  const sat = U.uSat.value;
  const l = 0.2126 * _base[0] + 0.7152 * _base[1] + 0.0722 * _base[2];
  for (let c = 0; c < 3; c++) {
    const k = keys[c];
    let v = Math.max(0, l + (_base[c] - l) * sat);
    let horizon = v;
    if (oc > 0.001) {
      v += (U.uOvercastCol.value[k] * ocGrad - v) * oc;
      horizon += (U.uOvercastCol.value[k] * 0.62 - horizon) * oc;
    }
    if (d.y < 0) v = U.uGround.value[k] + (horizon - U.uGround.value[k]) * Math.exp(d.y * 16);
    out[k] = v;
  }
  return out;
}

function smooth01(v) {
  const k = Math.min(1, Math.max(0, v));
  return k * k * (3 - 2 * k);
}
