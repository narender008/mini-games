// A real rainbow. Its colours are worked out once from the physics: for each
// wavelength, water's refractive index gives the angle of the primary bow
// (one reflection inside the drop, about 42 degrees from the point opposite
// the sun) and the fainter secondary (two reflections, about 51 degrees,
// colours reversed); each band is blurred by the sun's width and the drops'
// size, the light is summed into colour with the eye's response curves, and
// the sky is a little brighter inside the bow and darker between the bows
// (Alexander's band). The result is a small lookup strip.
//
// The bow is drawn on a band of a sphere around the camera, centred on the
// antisolar point and placed far off (about 60 m), so the fence, trees and
// ground hide its feet, which also fade into the haze.
import * as THREE from 'three';
import { DataUtils } from 'three';

const DEG = Math.PI / 180;
const TH0 = 36; // band of angles drawn, degrees from the antisolar point
const TH1 = 56;
const LUT = 512;

function gauss(x, mu, s1, s2) {
  const s = x < mu ? s1 : s2;
  const t = (x - mu) / s;
  return Math.exp(-0.5 * t * t);
}

// CIE 1931 colour matching, multi-lobe fit (Wyman, Sloan and Shirley 2013)
function cie(nm) {
  const x = 1.056 * gauss(nm, 599.8, 37.9, 31.0) + 0.362 * gauss(nm, 442.0, 16.0, 26.7) - 0.065 * gauss(nm, 501.1, 20.4, 26.2);
  const y = 0.821 * gauss(nm, 568.8, 46.9, 40.5) + 0.286 * gauss(nm, 530.9, 16.3, 31.1);
  const z = 1.217 * gauss(nm, 437.0, 11.8, 36.0) + 0.681 * gauss(nm, 459.0, 26.0, 13.8);
  return [x, y, z];
}

// the bow's angle from the antisolar point for k reflections inside the drop
function bowAngle(n, k) {
  const cosI = Math.sqrt((n * n - 1) / (k * k + 2 * k));
  const i = Math.acos(cosI);
  const r = Math.asin(Math.sin(i) / n);
  return k === 1 ? (4 * r - 2 * i) / DEG : 180 + (2 * i - 6 * r) / DEG;
}

// red edges of the two bows (sodium light, n = 1.3317)
const B1 = bowAngle(1.3317, 1);
const B2 = bowAngle(1.3317, 2);

function buildLut() {
  const rgb = new Float32Array(LUT * 3);
  const dark = new Float32Array(LUT);
  let peak = 0;
  for (let j = 0; j < LUT; j++) {
    const th = TH0 + ((j + 0.5) / LUT) * (TH1 - TH0);
    let X = 0;
    let Y = 0;
    let Z = 0;
    for (let nm = 400; nm <= 700; nm += 5) {
      const n = 1.324 + 3100 / (nm * nm); // water, Cauchy fit
      const b1 = bowAngle(n, 1);
      const b2 = bowAngle(n, 2);
      // primary: bright just inside its angle, nothing outside
      const x1 = b1 - th;
      let I = Math.exp(-(((x1 - 0.3) / 0.42) ** 2)) + 0.16 * Math.exp(-(((x1 - 1.35) / 0.3) ** 2));
      // secondary: reversed, broader and fainter
      const x2 = th - b2;
      I += 0.42 * (Math.exp(-(((x2 - 0.35) / 0.55) ** 2)) + 0.1 * Math.exp(-(((x2 - 1.7) / 0.4) ** 2)));
      const [cx, cy, cz] = cie(nm);
      X += I * cx;
      Y += I * cy;
      Z += I * cz;
    }
    // XYZ to linear sRGB; the purest spectral colours fall outside, clip them
    let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
    let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
    let b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
    r = Math.max(0, r);
    g = Math.max(0, g);
    b = Math.max(0, b);
    rgb[j * 3] = r;
    rgb[j * 3 + 1] = g;
    rgb[j * 3 + 2] = b;
    peak = Math.max(peak, r, g, b);
    // between the bows no drop sends light towards you
    dark[j] = smooth(B1 + 0.2, B1 + 1.2, th) * (1 - smooth(B2 - 1.2, B2 - 0.2, th));
  }
  const data = new Uint16Array(LUT * 4);
  for (let j = 0; j < LUT; j++) {
    const th = TH0 + ((j + 0.5) / LUT) * (TH1 - TH0);
    // inside the primary the sky is lit by all the drops' light: a soft white
    const inside = th < B1 ? 0.09 * Math.exp(-(B1 - th) / 6) * (1 - Math.exp(-(B1 - th) * 1.2)) : 0;
    data[j * 4] = DataUtils.toHalfFloat(rgb[j * 3] / peak + inside);
    data[j * 4 + 1] = DataUtils.toHalfFloat(rgb[j * 3 + 1] / peak + inside);
    data[j * 4 + 2] = DataUtils.toHalfFloat(rgb[j * 3 + 2] / peak + inside);
    data[j * 4 + 3] = DataUtils.toHalfFloat(dark[j]);
  }
  const tex = new THREE.DataTexture(data, LUT, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function smooth(a, b, x) {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

// A band of the unit sphere around +z from TH0 to TH1 degrees.
function bandGeometry() {
  const rings = 48;
  const segs = 160;
  const pos = [];
  const ang = [];
  const idx = [];
  for (let i = 0; i <= rings; i++) {
    const th = (TH0 + ((TH1 - TH0) * i) / rings) * DEG;
    for (let j = 0; j <= segs; j++) {
      const ph = (j / segs) * Math.PI * 2;
      pos.push(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th));
      ang.push(i / rings, j / segs);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const b = a + segs + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBand', new THREE.Float32BufferAttribute(ang, 2));
  g.setIndex(idx);
  return g;
}

const VERT = /* glsl */ `
attribute vec2 aBand; // across the band (0..1), round it (0..1)
varying vec2 vBand;
varying vec3 vDir;
void main() {
  vBand = aBand;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = normalize(wp.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uLut;
uniform vec3 uTint;
uniform float uAmount;
uniform float uFeet;
varying vec2 vBand;
varying vec3 vDir;
float h1(float x) { return fract(sin(x * 91.7) * 43758.5453); }
float n1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
void main() {
  vec4 l = texture2D(uLut, vec2(vBand.x, 0.5));
  // the feet fade into the haze near the horizon (and below it)
  float feet = smoothstep(uFeet, uFeet + 0.12, vDir.y);
  // real bows are never even: the rain is thicker in some places
  float patchy = 0.72 + 0.28 * n1(vBand.y * 23.0) * n1(vBand.y * 7.0 + 3.0);
  float k = uAmount * feet * patchy;
  if (k < 0.002) discard;
  gl_FragColor = vec4(l.rgb * uTint * k, l.a * 0.07 * k);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Rainbow {
  constructor(scene) {
    this.distance = 60; // metres: far behind the fence
    this.yaw = 0; // extra turn about the vertical, radians, to frame it
    this.uniforms = {
      uLut: { value: buildLut() },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uAmount: { value: 0 },
      uFeet: { value: -0.06 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(bandGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -5; // before the near see-through things
    this.mesh.visible = false;
    this.center = new THREE.Vector3();
    this.fwd = new THREE.Vector3();
    scene.add(this.mesh);
  }

  // v: 0..1; sunDir: towards the sun; sunColor: colour times intensity
  update(v, camera, sunDir, sunColor, night) {
    const up = smooth(-0.02, 0.08, sunDir.y) * (1 - night);
    const k = v * up;
    this.mesh.visible = k > 0.003 && !!camera;
    if (!this.mesh.visible) return;
    // opposite the sun; if that is behind the camera, swing it round to the
    // front at the same height, so the bow stands over the garden
    const c = this.center.set(-sunDir.x, -sunDir.y, -sunDir.z);
    camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    this.fwd.normalize();
    const along = c.x * this.fwd.x + c.z * this.fwd.z;
    if (along < 0) {
      c.x -= 2 * along * this.fwd.x;
      c.z -= 2 * along * this.fwd.z;
    }
    if (this.yaw) c.applyAxisAngle(Y_AXIS, this.yaw);
    c.normalize();
    const d = Math.min(this.distance, camera.far * 0.85);
    this.mesh.position.copy(camera.position);
    this.mesh.quaternion.setFromUnitVectors(Z_AXIS, c);
    this.mesh.scale.setScalar(d);
    // tinted by the sun: golden-hour bows are warm
    const m = Math.max(sunColor.r, sunColor.g, sunColor.b, 1e-4);
    this.uniforms.uTint.value.setRGB(sunColor.r / m, sunColor.g / m, sunColor.b / m).multiplyScalar(0.45 * Math.min(1.5, m / 3));
    this.uniforms.uAmount.value = k;
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
