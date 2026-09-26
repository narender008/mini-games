// The sky of each place: a gradient from the horizon haze up to the zenith,
// a glow around the sun (or the big friendly moon), drifting clouds lit from
// the sun's side, and at night twinkling stars. The same GLSL gives the
// water its reflected sky where the planar reflection has nothing, and gives
// the haze that distant land and water melt into, so all three always
// agree. A PMREM of it lights every material (scene.environment).
import * as THREE from 'three';

export const SKY_UNIFORMS_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;     // direct sunlight (linear colour x intensity)
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
uniform vec3 uSkyGlow;      // colour of the glow around the sun near the horizon
uniform vec4 uSkyShape;     // x gradient power, y glow width, z glow strength, w sun disc size (cos)
uniform vec4 uCloud;        // x coverage, y softness, z brightness, w height scale
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec4 uNight;        // x stars, y moon size (cos), z moon brightness, w night amount
uniform vec3 uMoonDir;
uniform float uSkyTime;
uniform sampler2D uSkyNoise;
`;

export const SKY_GLSL = /* glsl */ `
vec3 skyGradient(vec3 d) {
  float y = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(y, uSkyShape.x));
  float mu = max(dot(d, uSunDir), 0.0);
  float nearH = exp(-y * 3.0);
  c += uSkyGlow * (pow(mu, uSkyShape.y) * uSkyShape.z * (0.35 + 0.65 * nearH) + pow(mu, 3.0) * 0.18 * nearH);
  return c;
}
// the colour distant things fade into, looking along d
vec3 skyHaze(vec3 d) {
  return skyGradient(normalize(vec3(d.x, 0.035, d.z)));
}
float skyCloudDensity(vec3 d, out float thick) {
  thick = 0.0;
  if (d.y <= 0.01) return 0.0;
  vec2 p = d.xz / (d.y + 0.06) * uCloud.w;
  vec2 wind = vec2(uSkyTime * 0.0016, uSkyTime * 0.0007);
  float n = texture2D(uSkyNoise, p * 0.11 + wind).r * 0.6 + texture2D(uSkyNoise, p * 0.31 - wind * 1.7).g * 0.3 + texture2D(uSkyNoise, p * 0.93 + wind * 2.3).b * 0.1;
  // fbm bunches round 0.5: stretch it so coverage behaves
  n = clamp((n - 0.5) * 2.6 + 0.5, 0.0, 1.0);
  float cov = smoothstep(1.0 - uCloud.x, 1.0 - uCloud.x + uCloud.y, n);
  thick = smoothstep(1.0 - uCloud.x, 1.0, n);
  // thin out towards the horizon so the haze band stays clean
  return cov * smoothstep(0.01, 0.12, d.y);
}
vec3 skyColor(vec3 d, bool withSun) {
  vec3 c = skyGradient(d);
  if (d.y < 0.0) c = mix(c, uSkyGround, (1.0 - smoothstep(-0.08, 0.0, d.y)));
  float mu = dot(d, uSunDir);
  // stars and the moon
  if (uNight.w > 0.0 && d.y > 0.0) {
    vec3 a = abs(d);
    vec2 sp = (a.x > a.z ? d.zy / a.x : d.xy / a.z) * 170.0;
    vec2 cell = floor(sp);
    vec2 f = fract(sp) - 0.5;
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float h2 = fract(h * 91.7);
    float star = step(0.965, h) * smoothstep(0.16, 0.0, length(f - (vec2(h2, fract(h * 17.3)) - 0.5) * 0.6));
    float tw = 0.65 + 0.35 * sin(uSkyTime * (1.5 + h2 * 3.0) + h * 40.0);
    c += vec3(1.0, 0.95, 0.85) * star * tw * uNight.x * (0.3 + h2 * 1.4) * smoothstep(0.02, 0.25, d.y);
    float mm = dot(d, uMoonDir);
    float disc = smoothstep(uNight.y - 0.00004, uNight.y + 0.00004, mm);
    if (disc > 0.0) {
      // a friendly moon: soft maria from the noise texture, lit whole
      vec3 up = vec3(0.0, 1.0, 0.0);
      vec3 mx = normalize(cross(up, uMoonDir));
      vec3 my = cross(uMoonDir, mx);
      float r = sqrt(max(0.0, 1.0 - uNight.y * uNight.y));
      vec2 mp = vec2(dot(d, mx), dot(d, my)) / r;
      float limb = sqrt(max(0.0, 1.0 - dot(mp, mp)));
      float mar = texture2D(uSkyNoise, mp * 0.22 + 0.4).r;
      float crater = texture2D(uSkyNoise, mp * 0.5 + 0.1).a;
      vec3 moon = vec3(1.0, 0.94, 0.8) * (0.78 + 0.22 * limb) * (1.0 - smoothstep(0.45, 0.62, mar) * 0.28 - smoothstep(0.75, 0.95, crater) * 0.1);
      c = mix(c, moon * uNight.z, disc);
    }
    c += vec3(1.0, 0.9, 0.7) * uNight.z * 0.035 * pow(max(mm, 0.0), 180.0);
    c += vec3(1.0, 0.9, 0.72) * uNight.z * 0.012 * pow(max(mm, 0.0), 12.0);
  }
  // clouds, lit on the sun side, darker and thicker in the middle
  float thick;
  float cd = skyCloudDensity(d, thick);
  if (cd > 0.0) {
    float lit = 0.55 + 0.45 * max(mu, 0.0);
    vec3 cc = mix(uCloudLit, uCloudShade, thick * 0.75) * lit * uCloud.z;
    // silver lining near the sun
    cc += uSkyGlow * pow(max(mu, 0.0), 12.0) * (1.0 - thick) * 1.2;
    c = mix(c, cc, cd * 0.92);
  }
  if (withSun) {
    float disc = smoothstep(uSkyShape.w - 0.00002, uSkyShape.w + 0.00002, mu);
    c += uSunColor * disc * 12.0 * (1.0 - cd * 0.85);
    c += uSunColor * pow(max(mu, 0.0), 900.0) * 1.2;
  }
  return c;
}
`;

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vDir = w.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * w;
  gl_Position.z = gl_Position.w; // on the far plane
}`;

const FRAG = /* glsl */ `
${SKY_UNIFORMS_GLSL}
uniform float uWithSun;
varying vec3 vDir;
${SKY_GLSL}
void main() {
  vec3 d = normalize(vDir);
  gl_FragColor = vec4(skyColor(d, uWithSun > 0.5), 1.0);
}`;

const V = (a) => new THREE.Vector3().fromArray(a);
const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

// A direction from azimuth (degrees, 0 = -z, clockwise seen from above) and
// elevation (degrees).
export function dirFrom(azDeg, elDeg) {
  const az = THREE.MathUtils.degToRad(azDeg);
  const el = THREE.MathUtils.degToRad(elDeg);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

export class Sky {
  constructor(noise) {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSkyZenith: { value: new THREE.Color() },
      uSkyHorizon: { value: new THREE.Color() },
      uSkyGround: { value: new THREE.Color() },
      uSkyGlow: { value: new THREE.Color() },
      uSkyShape: { value: new THREE.Vector4(0.5, 40, 1, 0.99999) },
      uCloud: { value: new THREE.Vector4(0.3, 0.2, 1, 1) },
      uCloudLit: { value: new THREE.Color(1, 1, 1) },
      uCloudShade: { value: new THREE.Color(0.6, 0.65, 0.7) },
      uNight: { value: new THREE.Vector4(0, 0.9999, 0, 0) },
      uMoonDir: { value: new THREE.Vector3(0, 0.5, -1).normalize() },
      uSkyTime: { value: 0 },
      uSkyNoise: { value: noise },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uWithSun: { value: 1 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), this.material);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.onBeforeRender = (r, s, cam) => this.mesh.position.copy(cam.position);
  }

  // def: the place's sky settings (see places/*.js)
  set(def) {
    const u = this.uniforms;
    u.uSunDir.value.copy(def.sunDir).normalize();
    u.uSunColor.value.copy(def.sunColor);
    u.uSkyZenith.value.copy(def.zenith);
    u.uSkyHorizon.value.copy(def.horizon);
    u.uSkyGround.value.copy(def.ground);
    u.uSkyGlow.value.copy(def.glow);
    u.uSkyShape.value.set(def.gradient ?? 0.5, def.glowWidth ?? 40, def.glowStrength ?? 1, Math.cos(THREE.MathUtils.degToRad(def.sunSize ?? 0.6)));
    u.uCloud.value.set(def.cloud?.cover ?? 0.3, def.cloud?.soft ?? 0.25, def.cloud?.bright ?? 1, def.cloud?.scale ?? 1);
    u.uCloudLit.value.copy(def.cloud?.lit ?? new THREE.Color(1, 1, 1));
    u.uCloudShade.value.copy(def.cloud?.shade ?? new THREE.Color(0.6, 0.65, 0.72));
    const n = def.night;
    u.uNight.value.set(n?.stars ?? 0, Math.cos(THREE.MathUtils.degToRad(n?.moonSize ?? 2)), n?.moonBright ?? 0, n ? 1 : 0);
    if (n?.moonDir) u.uMoonDir.value.copy(n.moonDir).normalize();
  }

  update(time) {
    this.uniforms.uSkyTime.value = time;
  }

  // Bake the sky (without the sharp sun disc, which the sun light already
  // covers) into a PMREM environment map for image-based lighting.
  environment(renderer, size = 256) {
    const scene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uWithSun: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(this.mesh.geometry, mat);
    scene.add(mesh);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(scene, 0, 0.1, 1000, { size });
    pmrem.dispose();
    mat.dispose();
    return rt;
  }
}

export { V, C };
