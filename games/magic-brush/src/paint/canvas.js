// The easel and its canvas. The canvas is a real stretched canvas (60 x 45
// cm board, fabric wrapped round the sides) on a beech A-frame easel with a
// paint-spattered ledge. Its face shows the painting from the paint engine
// with everything that makes paint look like paint: the linen weave of the
// primed canvas, impasto from the paint's thickness (normals from the height
// map), a wet gloss that dries to satin over a minute, matte watercolour
// stains, glitter flakes that catch the light, the friend's pencil outline
// (dots that the magic turns into a fine line) and the glow of the magic
// sweep.
import * as THREE from 'three';
import { CANVAS_W, CANVAS_H } from '../creatures/friend.js';
import { woodTextures } from '../world/textures.js';

const FACE_PARS = /* glsl */ `
uniform sampler2D tPig;
uniform sampler2D tSurf;
uniform sampler2D tLines;
uniform sampler2D tMask;
uniform vec2 uTexel;
uniform float uNow;
uniform float uLineAlpha;
uniform float uLineSolid;
uniform float uSweep;
uniform float uGlow;
uniform float uLift;
uniform float uTime;
uniform float uHasMask;
varying vec2 vUvC;
varying mat3 vFaceBasis;
float cH21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cN21(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cH21(i), cH21(i + vec2(1, 0)), f.x), mix(cH21(i + vec2(0, 1)), cH21(i + vec2(1, 1)), f.x), f.y);
}
// linen weave: threads over and under
float weave(vec2 uv) {
  vec2 p = uv * vec2(${(CANVAS_W * 1300).toFixed(1)}, ${(CANVAS_H * 1300).toFixed(1)});
  vec2 c = floor(p);
  vec2 f = fract(p);
  float over = mod(c.x + c.y, 2.0);
  float wx = sin(f.x * 3.14159) * (0.7 + 0.3 * cH21(vec2(c.x, 7.0)));
  float wy = sin(f.y * 3.14159) * (0.7 + 0.3 * cH21(vec2(3.0, c.y)));
  return mix(wy, wx, over);
}
`;

const FACE_COLOR = /* glsl */ `
vec4 P = texture2D(tPig, vUvC);
vec4 S = texture2D(tSurf, vUvC);
float lift = uLift * (uHasMask > 0.5 ? texture2D(tMask, vUvC).r : 0.0);
P.a *= 1.0 - lift * 0.92;
S.r *= 1.0 - lift;
S.b *= 1.0 - lift;
float cov = clamp(P.a, 0.0, 1.0);
float wv = weave(vUvC);
vec3 primer = vec3(0.9, 0.885, 0.85) * (0.94 + 0.06 * wv) * (0.97 + 0.03 * cN21(vUvC * 90.0));
vec3 paint = exp(-P.rgb);
vec3 col = mix(primer, primer * paint, cov);
// watercolour stains sink into the weave
col = mix(col, col * (0.9 + 0.1 * wv), S.a * cov);
// pencil outline: dots, turning into a fine line under the magic
vec4 ln = texture2D(tLines, vUvC);
float line = mix(ln.r, ln.g * 0.85, uLineSolid) * uLineAlpha;
col = mix(col, vec3(0.16, 0.15, 0.2), line * (1.0 - 0.55 * cov));
diffuseColor.rgb = col;
float cWet = cov * (1.0 - smoothstep(4.0, 70.0, uNow - S.g * 100.0));
float cGlit = S.b;
`;

const FACE_NORMAL = /* glsl */ `
{
  float hC = texture2D(tSurf, vUvC).r;
  float hL = texture2D(tSurf, vUvC - vec2(uTexel.x, 0.0)).r;
  float hR = texture2D(tSurf, vUvC + vec2(uTexel.x, 0.0)).r;
  float hD = texture2D(tSurf, vUvC - vec2(0.0, uTexel.y)).r;
  float hU = texture2D(tSurf, vUvC + vec2(0.0, uTexel.y)).r;
  float k = 0.85 * (1.0 - uLift * 0.8);
  vec2 g = vec2(hR - hL, hU - hD) * k;
  // the weave shows through thin paint
  float thin = 1.0 - smoothstep(0.05, 0.4, hC);
  vec2 wg = vec2(weave(vUvC + vec2(0.0004, 0.0)) - weave(vUvC - vec2(0.0004, 0.0)), weave(vUvC + vec2(0.0, 0.0004)) - weave(vUvC - vec2(0.0, 0.0004)));
  g += wg * 0.06 * thin;
  // glitter flakes: little mirrors tipped every which way
  if (cGlit > 0.02) {
    vec2 cell = floor(vUvC * vec2(1400.0, 1050.0));
    float hsh = cH21(cell);
    if (hsh < cGlit * 0.75) {
      vec2 tilt = (vec2(cH21(cell + 3.1), cH21(cell + 7.7)) - 0.5) * 1.6;
      g = tilt;
    }
  }
  vec3 nObj = normalize(vec3(-g, 1.0));
  normal = normalize(vFaceBasis * nObj);
}
`;

const FACE_ROUGH = /* glsl */ `
{
  float r = mix(0.86, 0.5, cov);
  r = mix(r, 0.82, S.a * cov);
  r = mix(r, 0.14, cWet * (1.0 - S.a * 0.7));
  roughnessFactor = r;
}
`;

const FACE_GLIT = /* glsl */ `
if (cGlit > 0.02) {
  vec2 cell = floor(vUvC * vec2(1400.0, 1050.0));
  float hsh = cH21(cell);
  if (hsh < cGlit * 0.75) {
    material.roughness = 0.12;
    material.metalness = 0.85;
    material.diffuseColor = mix(material.diffuseColor, vec3(0.0), 0.7);
    vec3 fc = mix(vec3(1.0, 0.85, 0.55), diffuseColor.rgb * 1.6 + 0.2, 0.5);
    material.specularColor = fc;
    material.specularColorBlended = fc;
  }
}
`;

const FACE_EMISSIVE = /* glsl */ `
{
  // bounce light from the bright studio keeps the canvas reading white
  totalEmissiveRadiance += diffuseColor.rgb * 0.55;
  float band = exp(-pow((vUvC.x - uSweep) / 0.035, 2.0));
  float spark = pow(cN21(vUvC * vec2(240.0, 180.0) + uTime * 2.0), 8.0) * 6.0;
  totalEmissiveRadiance += vec3(1.0, 0.82, 0.5) * uGlow * band * (0.8 + spark);
  // glitter twinkles a little by itself too
  if (cGlit > 0.02) {
    vec2 cell = floor(vUvC * vec2(1400.0, 1050.0));
    float tw = pow(max(0.0, sin(uTime * (2.0 + 5.0 * cH21(cell + 1.3)) + cH21(cell) * 40.0)), 24.0);
    totalEmissiveRadiance += vec3(1.0, 0.9, 0.7) * tw * cGlit * step(cH21(cell), cGlit * 0.75) * 0.9;
  }
}
`;

export class Easel {
  constructor({ quality, paint }) {
    this.group = new THREE.Group();
    this.group.name = 'easel';
    const q = quality;
    const wood = woodTextures({ size: q.tier === 'low' ? 256 : 512, light: 0xd8b07a, dark: 0xa87444, seed: 8, rings: 10, knots: 0, splatter: 70 });
    wood.map.repeat.set(1, 0.25);
    this.woodMat = new THREE.MeshStandardMaterial({ map: wood.map, roughnessMap: wood.roughMap, roughness: 0.75, metalness: 0 });
    const woodBox = (w, h, d) => {
      const g = new THREE.BoxGeometry(w, h, d);
      // grain along the longest side
      const m = new THREE.Mesh(g, this.woodMat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    const leg = (x0, y0, z0, x1, y1, z1, w = 0.034, d = 0.022) => {
      const a = new THREE.Vector3(x0, y0, z0);
      const b = new THREE.Vector3(x1, y1, z1);
      const len = a.distanceTo(b);
      const m = woodBox(w, len, d);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      this.group.add(m);
      return m;
    };
    // the A-frame: two front legs, a mast, a back leg and a crossbar
    leg(-0.34, 0, 0.1, -0.055, 1.74, -0.07);
    leg(0.34, 0, 0.1, 0.055, 1.74, -0.07);
    leg(0, 0.5, 0.045, 0, 1.8, -0.085, 0.04, 0.026);
    leg(0, 1.7, -0.1, 0, 0, -0.62, 0.03, 0.02);
    leg(-0.29, 0.28, 0.07, 0.29, 0.28, 0.07, 0.03, 0.02);
    // the ledge the canvas stands on, with a lip
    const tilt = 0.1; // the canvas leans back like the easel
    this.tilt = tilt;
    const ledge = woodBox(0.74, 0.022, 0.075);
    ledge.position.set(0, 0.76, 0.07);
    this.group.add(ledge);
    const lip = woodBox(0.74, 0.03, 0.012);
    lip.position.set(0, 0.785, 0.104);
    this.group.add(lip);
    // top clamp
    const clamp = woodBox(0.1, 0.045, 0.04);
    clamp.position.set(0, 0.785 + CANVAS_H * Math.cos(tilt) + 0.02, 0.05 - Math.sin(tilt) * CANVAS_H - 0.035);
    this.group.add(clamp);

    // the canvas: a board with a painted face
    this.board = new THREE.Group();
    this.board.position.set(0, 0.772 + (CANVAS_H / 2) * Math.cos(tilt), 0.066 - (CANVAS_H / 2) * Math.sin(tilt));
    this.board.rotation.x = -tilt;
    this.group.add(this.board);
    const depth = 0.022;
    const side = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.9 });
    const back = new THREE.MeshStandardMaterial({ color: 0xcdb48c, roughness: 0.85 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(CANVAS_W, CANVAS_H, depth), [side, side, side, side, side, back]);
    box.position.z = -depth / 2;
    box.castShadow = true;
    box.receiveShadow = true;
    this.board.add(box);
    this.uniforms = {
      tPig: { value: paint.textures.pigment },
      tSurf: { value: paint.textures.surface },
      tLines: { value: null },
      tMask: { value: null },
      uTexel: { value: new THREE.Vector2(1 / paint.w, 1 / paint.h) },
      uNow: { value: 0 },
      uLineAlpha: { value: 0 },
      uLineSolid: { value: 0 },
      uSweep: { value: -1 },
      uGlow: { value: 0 },
      uLift: { value: 0 },
      uTime: { value: 0 },
      uHasMask: { value: 0 },
    };
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    blank.needsUpdate = true;
    this.uniforms.tLines.value = blank;
    this.uniforms.tMask.value = blank;
    this.blank = blank;
    const face = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, clearcoat: 0, specularIntensity: 1 });
    face.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.uniforms);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vUvC;\nvarying mat3 vFaceBasis;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUvC = uv;\nvFaceBasis = mat3(normalize(normalMatrix * vec3(1.0, 0.0, 0.0)), normalize(normalMatrix * vec3(0.0, 1.0, 0.0)), normalize(normalMatrix * vec3(0.0, 0.0, 1.0)));');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\n${FACE_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FACE_COLOR}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FACE_ROUGH}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FACE_NORMAL}`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${FACE_GLIT}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FACE_EMISSIVE}`);
    };
    face.customProgramCacheKey = () => 'mb-canvas-face';
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(CANVAS_W, CANVAS_H), face);
    this.face.position.z = 0.0005;
    this.face.receiveShadow = true;
    this.board.add(this.face);
    this.group.updateMatrixWorld(true);
  }

  // the canvas plane in world space: origin at its centre, x right, y up,
  // z out of the canvas towards the painter
  get plane() {
    this.face.updateWorldMatrix(true, false);
    return this.face.matrixWorld;
  }

  // canvas uv (0..1) under a ray, or null
  hit(ray) {
    const hits = ray.intersectObject(this.face, false);
    if (!hits.length) return null;
    return hits[0].uv;
  }

  setOutline(lines, mask) {
    this.uniforms.tLines.value = lines || this.blank;
    this.uniforms.tMask.value = mask || this.blank;
    this.uniforms.uHasMask.value = mask ? 1 : 0;
  }

  update(dt, t, paintClock) {
    this.uniforms.uTime.value = t;
    this.uniforms.uNow.value = paintClock;
  }
}
