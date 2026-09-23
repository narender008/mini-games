// The hot-air balloon envelope: an inverted-teardrop profile built from
// vertical gore panels that bulge slightly between their load tapes, and a
// procedural pattern shader (black nylon with vivid pills, ribbons or
// diamonds) shared with the torn shreds so they carry the same material.
import * as THREE from 'three';
import { PALETTES, PALETTE_SIZE, linearColor } from './config.js';

export const GORES = 20;
export const ENVELOPE_CENTER = new THREE.Vector3(0, 0.6, 0);

// Profile read off the reference: radius against height, mouth (0) to crown (1).
const PROFILE_POINTS = [
  [0.12, 0], [0.155, 0.065], [0.19, 0.13], [0.28, 0.25], [0.355, 0.375], [0.43, 0.5],
  [0.482, 0.6], [0.5, 0.68], [0.486, 0.78], [0.44, 0.86], [0.34, 0.93], [0.21, 0.975],
  [0.1, 0.995], [0.0, 1.0],
];

function buildProfileTable(samples = 600) {
  const curve = new THREE.CatmullRomCurve3(
    PROFILE_POINTS.map(([r, y]) => new THREE.Vector3(r, y, 0)),
    false,
    'centripetal',
  );
  const pts = curve.getPoints(samples);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, cum, length: cum[cum.length - 1] };
}

const TABLE = buildProfileTable();
export const PROFILE_LENGTH = TABLE.length;

// Radius and height at arc-length parameter v (0 = mouth, 1 = crown).
export function profileAt(v) {
  const s = Math.min(1, Math.max(0, v)) * TABLE.length;
  const { cum, pts } = TABLE;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < s) lo = mid;
    else hi = mid;
  }
  const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
  return {
    r: Math.max(0, pts[lo].x + (pts[hi].x - pts[lo].x) * t),
    y: pts[lo].y + (pts[hi].y - pts[lo].y) * t,
  };
}

function bulgeAt(v) {
  return 0.05 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, v))), 0.6);
}

// Object-space point on the envelope surface.
export function envelopePoint(u, v, out = new THREE.Vector3()) {
  const g = Math.floor(u * GORES);
  const f = u * GORES - g;
  const { r, y } = profileAt(v);
  const rr = r * (1 + bulgeAt(v) * (Math.sin(Math.PI * f) - 0.6366));
  const th = (u) * Math.PI * 2;
  return out.set(rr * Math.sin(th), y, rr * Math.cos(th));
}

export function goreWidthAt(v) {
  return (2 * Math.PI * profileAt(v).r) / GORES;
}

// Surface frame at (u, v): outward normal, tangent round the balloon, and
// tangent up the profile.
export function envelopeFrame(u, v) {
  const e = 0.002;
  const p = envelopePoint(u, v);
  const pu = envelopePoint(u + e, v).sub(envelopePoint(u - e, v));
  const pv = envelopePoint(u, Math.min(1, v + e)).sub(envelopePoint(u, Math.max(0, v - e)));
  const n = new THREE.Vector3().crossVectors(pu, pv);
  if (n.lengthSq() < 1e-10) n.set(0, 1, 0);
  n.normalize();
  return { p, n, tu: pu.normalize(), tv: pv.normalize() };
}

export function createEnvelopeGeometry(segPerGore = 6, rows = 72) {
  const cols = GORES * (segPerGore + 1);
  const count = cols * (rows + 1);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const gore = new Float32Array(count * 2);
  const index = [];
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const tmpD = new THREE.Vector3();
  const n = new THREE.Vector3();
  // position evaluated with the gore index fixed so seams keep a crease
  const P = (g, f, v, out) => {
    const { r, y } = profileAt(v);
    const rr = r * (1 + bulgeAt(v) * (Math.sin(Math.PI * f) - 0.6366));
    const th = ((g + f) / GORES) * Math.PI * 2;
    return out.set(rr * Math.sin(th), y, rr * Math.cos(th));
  };
  let k = 0;
  for (let g = 0; g < GORES; g++) {
    for (let j = 0; j <= segPerGore; j++) {
      const f = j / segPerGore;
      for (let i = 0; i <= rows; i++) {
        const v = i / rows;
        P(g, f, v, tmpA);
        const e = 0.004;
        P(g, f + e, v, tmpB).sub(P(g, f - e, v, tmpC));
        P(g, f, Math.min(1, v + e), tmpC).sub(P(g, f, Math.max(0, v - e), tmpD));
        n.crossVectors(tmpB, tmpC);
        if (n.lengthSq() < 1e-12 || v > 0.999) n.set(0, 1, 0);
        n.normalize();
        pos.set([tmpA.x, tmpA.y, tmpA.z], k * 3);
        nor.set([n.x, n.y, n.z], k * 3);
        uv.set([(g + f) / GORES, v], k * 2);
        gore.set([f, goreWidthAt(v)], k * 2);
        k++;
      }
    }
  }
  const R = rows + 1;
  for (let g = 0; g < GORES; g++) {
    const base = g * (segPerGore + 1) * R;
    for (let j = 0; j < segPerGore; j++) {
      for (let i = 0; i < rows; i++) {
        const a = base + j * R + i;
        const b = base + (j + 1) * R + i;
        const c = a + 1;
        const d = b + 1;
        index.push(a, b, c, b, d, c);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aGore', new THREE.BufferAttribute(gore, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

// ---------------------------------------------------------------------------
// Pattern shader

const palette = [];
for (const p of PALETTES) for (const hex of p) palette.push(linearColor(hex));

// Uniforms shared by every envelope and shred material.
export const sharedEnvelopeUniforms = {
  uPal: { value: palette },
  uSunView: { value: new THREE.Vector3(0, 0, -1) },
  uSunColor: { value: linearColor('#ffc58a') },
  uNoise: { value: null },
};

export const ENVELOPE_GLSL = /* glsl */ `
uniform vec3 uPal[${palette.length}];
uniform vec3 uSunView;
uniform vec3 uSunColor;
const float ENV_GORES = ${GORES.toFixed(1)};
const float ENV_LEN = ${PROFILE_LENGTH.toFixed(4)};

vec3 envPal(float pal, float idx) {
  int i = int(pal) * ${PALETTE_SIZE} + int(mod(idx, ${PALETTE_SIZE.toFixed(1)}));
  return uPal[i];
}

// Rounded pill in gore space. X is the across-gore coordinate (edge at +-1),
// y is height along the profile in physical units, hw the pill half-width.
float envPill(float X, float y, float y0, float y1, float hw) {
  float ey = max(max((y0 + hw) - y, y - (y1 - hw)), 0.0) / max(hw, 1e-4);
  float d = length(vec2(X, ey)) - 1.0;
  float w = fwidth(d) * 0.9 + 1e-4;
  return 1.0 - smoothstep(-w, w, d);
}

// rgb = albedo, a = glow mask. rough / metal are written out.
vec4 envelopePattern(vec2 uv, vec2 gore, float pal, float pat, out float rough, out float metal) {
  float gi = floor(uv.x * ENV_GORES);
  float f = gore.x;
  float gw = gore.y;
  float v = uv.y;
  float y = v * ENV_LEN;
  vec3 black = vec3(0.010, 0.0085, 0.012);
  vec3 col = black;
  float glow = 0.0;
  rough = 0.46;
  metal = 0.0;
  float X = (f - 0.5) / 0.3;
  float hw = 0.3 * gw;

  if (pat < 0.5) {
    // Reference: pills in an upper and a lower band on alternate gores.
    if (mod(gi, 2.0) < 0.5) {
      vec3 c = envPal(pal, gi * 0.5);
      float up = envPill(X, y, 0.6 * ENV_LEN, 0.968 * ENV_LEN, hw);
      float lo = envPill(X, y, 0.035 * ENV_LEN, 0.47 * ENV_LEN, hw);
      // lower pills run hotter towards the burner
      vec3 hot = mix(c, c * vec3(1.15, 1.05, 0.7) + vec3(0.25, 0.14, 0.0), smoothstep(0.3, 0.02, v) * 0.55);
      col = mix(col, c, up);
      col = mix(col, hot, lo);
      glow = max(up, lo);
    }
  } else if (pat < 1.5) {
    // Ribbons: long tapered stripes, colour sweeping from one hue to the next.
    if (mod(gi, 2.0) < 0.5) {
      vec3 c0 = envPal(pal, gi * 0.5);
      vec3 c1 = envPal(pal, gi * 0.5 + 1.0);
      float m = envPill(X * 1.15, y, 0.03 * ENV_LEN, 0.975 * ENV_LEN, hw * 0.85);
      vec3 c = mix(c0, c1, smoothstep(0.25, 0.8, v));
      col = mix(col, c, m);
      glow = m;
    }
  } else if (pat < 2.5) {
    // Diamonds round the equator plus a thin band lower down.
    vec3 c = envPal(pal, gi);
    float dm = abs(f - 0.5) / 0.47 + abs(v - 0.63) / 0.15;
    float w = fwidth(dm) + 1e-4;
    float dmask = 1.0 - smoothstep(1.0 - w, 1.0 + w, dm);
    float band = smoothstep(0.30, 0.305, v) * (1.0 - smoothstep(0.34, 0.345, v));
    col = mix(col, c, dmask);
    col = mix(col, envPal(pal, 2.0), band);
    glow = max(dmask, band);
  } else {
    // Gold leaf with black pills.
    vec3 gold = vec3(1.0, 0.72, 0.29);
    col = gold;
    rough = 0.24;
    metal = 1.0;
    if (mod(gi, 2.0) < 0.5) {
      float up = envPill(X, y, 0.6 * ENV_LEN, 0.968 * ENV_LEN, hw);
      float lo = envPill(X, y, 0.035 * ENV_LEN, 0.47 * ENV_LEN, hw);
      float m = max(up, lo);
      col = mix(col, vec3(0.02, 0.012, 0.01), m);
      rough = mix(rough, 0.4, m);
      metal = 1.0 - m;
    }
    glow = 0.0;
  }

  // Load tapes along the seams, and a slight shadow in the seam valleys.
  float edge = min(f, 1.0 - f);
  float tape = 1.0 - smoothstep(0.0, 0.035, edge);
  col = mix(col, col * 0.55 + vec3(0.018, 0.016, 0.02), tape * 0.7);
  float valley = mix(0.72, 1.0, smoothstep(0.0, 0.18, edge));
  col *= valley;
  if (metal < 0.5) rough = mix(rough, 0.6, tape);
  // crown vent ring
  float crown = smoothstep(0.985, 0.99, v);
  col = mix(col, black * 1.6, crown);
  glow *= 1.0 - crown;
  return vec4(col, glow);
}

// Translucent glow: sunlight through the fabric from behind, plus the
// burner warming the lower panels from inside.
vec3 envelopeGlow(vec3 col, float mask, vec3 viewNormal, float v, float glow, float burn) {
  float through = pow(max(dot(viewNormal, -uSunView), 0.0), 1.2);
  vec3 sun = uSunColor * glow * (0.35 + 0.9 * through);
  float inner = pow(clamp(1.0 - v / 0.55, 0.0, 1.0), 1.6) * burn;
  vec3 fire = vec3(1.0, 0.62, 0.25) * inner * 1.6;
  return col * mask * (sun + fire) + vec3(1.0, 0.45, 0.12) * inner * 0.012;
}
`;

// Patch a MeshPhysicalMaterial into an envelope (or instanced shred) shader.
export function patchEnvelopeMaterial(material, uniforms, { shred = false } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedEnvelopeUniforms, uniforms);
    const vDecl = shred
      ? /* glsl */ `
attribute vec4 aUvRect;
attribute vec4 aShred;   // palette, pattern, seed, curl
attribute vec2 aShred2;  // gore width, unused
varying vec2 vEnvUv;
varying vec2 vGore;
varying vec2 vLocalUv;
varying vec4 vShred;`
      : /* glsl */ `
attribute vec2 aGore;
uniform vec4 uDent;
varying vec2 vEnvUv;
varying vec2 vGore;
varying vec3 vObjPos;`;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${vDecl}`);
    if (shred) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
vec3 transformed = vec3(position);
float curl = aShred.w;
float seed = aShred.z;
// roll the strip up around its long axis as the rubber snaps back
float kx = curl * 5.5 + 0.0001;
float ang = transformed.x * kx;
transformed.z += (1.0 - cos(ang)) / kx;
transformed.x = sin(ang) / kx;
// twist and crumple
float tw = (fract(seed * 7.31) - 0.5) * curl * 2.2 * transformed.y;
transformed.xz = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * transformed.xz;
transformed.z += sin(position.x * 17.0 + seed * 40.0) * sin(position.y * 13.0 + seed * 23.0) * 0.07 * curl;
transformed.z += position.y * position.y * (fract(seed * 3.7) - 0.5) * curl * 1.6;
vEnvUv = aUvRect.xy + uv * aUvRect.zw;
vGore = vec2(fract(vEnvUv.x * ${GORES.toFixed(1)}), aShred2.x);
vLocalUv = uv;
vShred = aShred;`,
      );
    } else {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
#include <begin_vertex>
float dentD = distance(position, uDent.xyz);
transformed -= objectNormal * uDent.w * exp(-dentD * dentD / 0.012);
vEnvUv = uv;
vGore = aGore;
vObjPos = position;`,
      );
    }

    const fDecl = shred
      ? /* glsl */ `
varying vec2 vEnvUv;
varying vec2 vGore;
varying vec2 vLocalUv;
varying vec4 vShred;
uniform sampler2D uNoise;
uniform float uGlow;
${ENVELOPE_GLSL}`
      : /* glsl */ `
varying vec2 vEnvUv;
varying vec2 vGore;
varying vec3 vObjPos;
uniform float uPalette;
uniform float uPattern;
uniform float uGlow;
uniform float uBurn;
uniform vec4 uTear;      // xyz puncture direction from the centre, w tear radius (rad)
uniform float uTearSeed;
uniform sampler2D uNoise;
${ENVELOPE_GLSL}
float tearFingers(float phi, float seed) {
  return pow(abs(sin(phi * 2.5 + seed)), 5.0) * 0.55 + pow(abs(sin(phi * 5.0 + seed * 2.3)), 9.0) * 0.35;
}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${fDecl}`);

    const clipCode = shred
      ? /* glsl */ `
#include <clipping_planes_fragment>
{
  // ragged torn edges
  vec2 lu = vLocalUv;
  float e = min(min(lu.x, 1.0 - lu.x), min(lu.y, 1.0 - lu.y));
  float nz = texture2D(uNoise, lu * vec2(0.23, 0.41) + vShred.z * 3.7).a;
  float nz2 = texture2D(uNoise, lu * vec2(0.9, 0.7) + vShred.z * 1.3).b;
  if (e < 0.04 + 0.3 * nz * nz2) discard;
}`
      : /* glsl */ `
#include <clipping_planes_fragment>
float tearEdge = 1.0;
if (uTear.w > 0.0) {
  vec3 dirP = normalize(vObjPos - vec3(0.0, ${ENVELOPE_CENTER.y.toFixed(3)}, 0.0));
  float angT = acos(clamp(dot(dirP, uTear.xyz), -1.0, 1.0));
  vec3 ax = uTear.xyz;
  vec3 t1 = normalize(cross(ax, abs(ax.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(ax, t1);
  float phi = atan(dot(dirP, t2), dot(dirP, t1));
  float jag = texture2D(uNoise, vEnvUv * vec2(3.0, 1.6) + uTearSeed).a;
  float radius = uTear.w * (1.0 + tearFingers(phi, uTearSeed)) + (jag - 0.5) * 0.22 * min(uTear.w, 1.0);
  if (angT < radius) discard;
  tearEdge = smoothstep(0.0, 0.06, angT - radius);
}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', clipCode);

    const palExpr = shred ? 'vShred.x' : 'uPalette';
    const patExpr = shred ? 'vShred.y' : 'uPattern';
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      /* glsl */ `
float envRough;
float envMetal;
vec4 envPat = envelopePattern(vEnvUv, vGore, ${palExpr}, ${patExpr}, envRough, envMetal);
diffuseColor.rgb = envPat.rgb;
${shred ? '' : 'diffuseColor.rgb = mix(diffuseColor.rgb + vec3(0.05, 0.04, 0.05), diffuseColor.rgb, tearEdge);'}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = envRough;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      '#include <metalnessmap_fragment>\nmetalnessFactor = envMetal;',
    );
    const burnExpr = shred ? '0.0' : 'uBurn';
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += envelopeGlow(envPat.rgb, envPat.a, normal * faceDirection, vEnvUv.y, uGlow, ${burnExpr});`,
    );
  };
  material.customProgramCacheKey = () => (shred ? 'envelope-shred' : 'envelope');
}

export function createEnvelopeMaterial({ ripstop, gold = false }) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.46,
    metalness: 0,
    side: THREE.DoubleSide,
    normalMap: ripstop,
    normalScale: new THREE.Vector2(0.22, 0.22),
    sheen: 0.7,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color('#b9a6e8'),
    clearcoat: gold ? 0.6 : 0.28,
    clearcoatRoughness: gold ? 0.18 : 0.38,
    iridescence: gold ? 0.55 : 0,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [260, 520],
    envMapIntensity: 1.0,
  });
  return material;
}
