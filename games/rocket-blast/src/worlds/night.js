// Starry Night: a friendly blue-violet night sky with a big glowing moon
// (soft craters and a halo), twinkling stars and the odd shooting star, a
// faint aurora ribbon low down, and moonlit clouds with silver edges. The
// toys get a cool moon key and a warm fill so their candy colours still pop.
import * as THREE from 'three';
import { CloudField, visibleAt } from './common.js';
import { SpriteBatch } from '../sprites.js';
import { mulberry32, SPRITE } from '../textures.js';

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = (modelMatrix * vec4(position, 0.0)).xyz;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99998, p.w);
}`;

const skyFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uBand;
uniform vec3 uGround;
uniform float uHorizonEl;
uniform float uTopEl;
uniform vec3 uMoonDir;
uniform float uMoonR;      // angular radius, radians
uniform vec3 uMoonColor;
uniform float uMoonLight;  // disc brightness
uniform vec3 uHaloColor;
uniform float uHalo;
uniform float uStars;
uniform float uAurora;
uniform float uTime;
varying vec3 vDir;

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

// a few soft craters in moon-disc coordinates: centre xy, radius
const vec3 CRATERS[9] = vec3[9](
  vec3(-0.34, 0.30, 0.17), vec3(0.32, 0.44, 0.10), vec3(0.18, -0.36, 0.21),
  vec3(-0.46, -0.24, 0.09), vec3(0.52, -0.04, 0.12), vec3(-0.06, 0.02, 0.07),
  vec3(0.28, 0.12, 0.06), vec3(-0.18, -0.58, 0.08), vec3(-0.62, 0.12, 0.06)
);

vec3 moonSurface(vec2 p, float r) {
  float nz = sqrt(max(0.0, 1.0 - r * r));
  // maria: big soft darker seas
  float m = texture2D(uNoise, p * 0.32 + vec2(0.13, 0.61)).r;
  float m2 = texture2D(uNoise, p * 0.8 + vec2(0.4, 0.2)).b;
  float albedo = 1.0 - 0.26 * smoothstep(0.45, 0.68, m) - 0.12 * (m2 - 0.5);
  // craters: a darker bowl, shaded across, with a pale rim
  vec2 L = normalize(vec2(-0.6, 0.8));
  for (int i = 0; i < 9; i++) {
    vec3 c = CRATERS[i];
    vec2 q = (p - c.xy) / c.z;
    float d = length(q);
    float bowl = smoothstep(1.0, 0.6, d);
    float e = (d - 1.0) * 4.0;
    float rim = exp(-e * e);
    float side = dot(q, L);
    albedo += bowl * (-0.13 + 0.1 * side) + rim * (0.07 - 0.06 * side);
  }
  // fine pitting
  float pit = texture2D(uNoise, p * 2.2 + vec2(0.7, 0.3)).a;
  albedo -= smoothstep(0.82, 0.95, pit) * 0.06;
  float limb = mix(0.86, 1.0, pow(nz, 0.6));
  return uMoonColor * albedo * limb * uMoonLight;
}

void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float t = clamp((el - uHorizonEl) / (uTopEl - uHorizonEl), 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.7));
  col = mix(col, uBand, exp(-t * 5.0) * step(uHorizonEl, el) * 0.8);
  col = mix(col, uGround, clamp((uHorizonEl - el) * 4.0, 0.0, 1.0));

  // aurora: soft folded curtains low over the horizon
  if (uAurora > 0.0) {
    float az = atan(d.x, -d.z);
    float fold = texture2D(uNoise, vec2(az * 0.8 + uTime * 0.004, 0.37)).r;
    float fold2 = texture2D(uNoise, vec2(az * 2.1 - uTime * 0.007, 0.83)).b;
    float base = uHorizonEl + 0.17 + (fold - 0.5) * 0.16 + (fold2 - 0.5) * 0.05;
    float h = el - base;
    float rays = texture2D(uNoise, vec2(az * 2.2 - uTime * 0.006, 0.71)).b;
    float rays2 = texture2D(uNoise, vec2(az * 5.0 + uTime * 0.01, 0.13)).r;
    float curtain = smoothstep(-0.01, 0.04, h) * exp(-max(h, 0.0) * 9.0);
    float band = smoothstep(0.35, 0.75, texture2D(uNoise, vec2(az * 0.22 - uTime * 0.002, 0.52)).g);
    float a = curtain * band * (0.45 + 0.9 * rays * rays2);
    vec3 green = vec3(0.25, 1.0, 0.72);
    vec3 pink = vec3(0.85, 0.45, 1.0);
    col += mix(green, pink, smoothstep(0.02, 0.14, h)) * a * uAurora;
  }

  float cosA = dot(d, uMoonDir);
  float ang = acos(clamp(cosA, -1.0, 1.0));
  float rr = ang / uMoonR;
  // stars, hidden near the horizon and in the moon's glow
  if (uStars > 0.0) {
    float fade = smoothstep(0.15, 0.55, t) * smoothstep(1.6, 4.0, rr);
    vec3 g = floor(d * 170.0);
    float h = hash(g);
    vec3 f = fract(d * 170.0) - 0.5;
    float star = step(0.982, h) * smoothstep(0.32, 0.0, length(f));
    float tw = 0.55 + 0.45 * sin(uTime * (1.5 + h * 4.0) + h * 50.0);
    vec3 tint = mix(vec3(0.8, 0.88, 1.0), vec3(1.0, 0.9, 0.75), step(0.7, fract(h * 31.0)));
    col += tint * star * tw * fade * uStars * (0.5 + 2.2 * fract(h * 13.0));
    // a finer, dimmer layer for depth
    vec3 g2 = floor(d * 420.0);
    float h2 = hash(g2 + 17.0);
    vec3 f2 = fract(d * 420.0) - 0.5;
    col += vec3(0.75, 0.82, 1.0) * step(0.975, h2) * smoothstep(0.35, 0.0, length(f2)) * fade * uStars * 0.45;
  }

  // halo and the moon itself
  float outside = max(rr - 1.0, 0.0);
  vec3 inner = mix(uMoonColor, uHaloColor, 0.55);
  col += (inner * 0.36 * exp(-outside * 2.2) + uHaloColor * 0.2 * exp(-outside * 0.5)) * uHalo;
  if (rr < 1.0) {
    vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, uMoonDir);
    vec2 p = vec2(dot(d, right), dot(d, up)) / sin(uMoonR);
    float r = length(p);
    vec3 moon = moonSurface(p, min(r, 1.0));
    col = mix(col, moon, smoothstep(1.0, 0.97, r));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function nightSky(noise, o) {
  const uniforms = {
    uNoise: { value: noise },
    uZenith: { value: new THREE.Color(o.zenith) },
    uHorizon: { value: new THREE.Color(o.horizon) },
    uBand: { value: new THREE.Color(o.band) },
    uGround: { value: new THREE.Color(o.ground) },
    uHorizonEl: { value: o.horizonEl ?? -0.36 },
    uTopEl: { value: o.topEl ?? 0.45 },
    uMoonDir: { value: (o.moonDir ?? new THREE.Vector3(-0.3, 0.2, -1)).clone().normalize() },
    uMoonR: { value: o.moonR ?? 0.07 },
    uMoonColor: { value: new THREE.Color(o.moonColor ?? '#fff3dc') },
    uMoonLight: { value: o.moonLight ?? 1.5 },
    uHaloColor: { value: new THREE.Color(o.haloColor ?? '#9fb0ff') },
    uHalo: { value: o.halo ?? 1 },
    uStars: { value: o.stars ?? 0 },
    uAurora: { value: o.aurora ?? 0 },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false });
  return { uniforms, material };
}

// Moonlit clouds: the shared puff shading plus a silver lining where thin
// edges sit close to the moon, and a soft glow on everything near it.
const cloudVertex = /* glsl */ `
attribute vec4 iPos;
attribute vec4 iShade;
varying vec2 vUv;
varying vec4 vShade;
varying float vFog;
varying vec3 vView;
uniform float uFogNear;
uniform float uFogFar;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
  mv.xy += position.xy * iPos.w * vec2(iShade.w, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vShade = iShade;
  vView = mv.xyz;
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
}`;

const cloudFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uLit;
uniform vec3 uShadow;
uniform vec3 uHaze;
uniform vec3 uSun;
uniform float uRim;
uniform float uSoft;
uniform float uTime;
uniform vec3 uMoonView;
uniform vec3 uSilver;
varying vec2 vUv;
varying vec4 vShade;
varying float vFog;
varying vec3 vView;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float seed = vShade.y;
  vec2 q = vUv * 0.55 + vec2(seed * 7.3, seed * 3.1) + vec2(uTime * 0.004, 0.0);
  float n = texture2D(uNoise, q).g;
  float n2 = texture2D(uNoise, q * 2.3 + 0.37).r;
  float n3 = texture2D(uNoise, q * 5.1 + 0.71).a;
  float edge = 1.0 - r + (n - 0.5) * 0.7 + (n2 - 0.5) * 0.3 + (n3 - 0.5) * 0.12;
  float dens = smoothstep(0.0, uSoft, edge);
  if (dens < 0.004) discard;
  vec2 bump = (vec2(n, n2) - 0.5) * 1.1;
  vec3 N = normalize(vec3(p * 0.95 + bump, sqrt(max(0.0, 1.0 - r * r)) + 0.15));
  float sunL = clamp(dot(N, normalize(uSun)) * 0.6 + 0.45, 0.0, 1.0);
  float h = clamp(vShade.x + p.y * 0.18 + (n - 0.5) * 0.2, 0.0, 1.0);
  float light = sunL * mix(0.4, 1.0, smoothstep(0.0, 0.85, h));
  vec3 col = mix(uShadow, uLit, light);
  float thin = pow(1.0 - dens, 2.0);
  col += uLit * thin * uRim;
  // closeness to the moon on screen: silver edges and a gentle glow
  float toMoon = max(dot(normalize(vView), uMoonView), 0.0);
  float nearMoon = pow(toMoon, 90.0);
  float aroundMoon = pow(toMoon, 14.0);
  col += uSilver * (thin * 2.6 + 0.25) * nearMoon + uSilver * thin * aroundMoon * 0.5;
  col = mix(col, uHaze, vFog);
  gl_FragColor = vec4(col, dens * vShade.z);
}`;

export function create(ctx) {
  const group = new THREE.Group();
  const rand0 = mulberry32(7);

  const sky = nightSky(ctx.noise, {
    zenith: '#1a1f66',
    horizon: '#4b4fa8',
    band: '#7d6cc4',
    ground: '#5a5aa6',
    stars: 1,
    aurora: 0.85,
    moonColor: '#fff8ec',
    moonR: THREE.MathUtils.degToRad(4.2),
    moonLight: 1.06,
    haloColor: '#8fa2ff',
    halo: 0.9,
  });
  const skyGeo = new THREE.SphereGeometry(1000, 48, 24);
  const skyMesh = new THREE.Mesh(skyGeo, sky.material);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -10;
  group.add(skyMesh);

  // bigger twinkling stars and shooting stars, drawn behind the clouds
  const stars = new SpriteBatch(ctx.atlas, { capacity: 96, blending: 'add', renderOrder: -8 });
  group.add(stars.mesh);

  const moonLit = new THREE.Vector3(0.55, 0.7, 0.45);
  const clouds = new CloudField({ noise: ctx.noise, lit: '#c3cdf6', shadow: '#363e86', haze: '#5a56b0', sun: moonLit, rim: 0.4, soft: 0.42, fogNear: 70, fogFar: 330, capacity: 700 });
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      ...clouds.uniforms,
      uMoonView: { value: new THREE.Vector3(0, 0, -1) },
      uSilver: { value: new THREE.Color('#dfe6ff') },
    },
    vertexShader: cloudVertex,
    fragmentShader: cloudFragment,
    transparent: true,
    depthWrite: false,
  });
  clouds.material.dispose();
  clouds.material = cloudMat;
  clouds.mesh.material = cloudMat;
  group.add(clouds.mesh);

  const amount = ctx.quality.clouds;
  let view = null;
  const layout = (v) => {
    view = v;
    const cam = v.camera;
    const at = (z) => visibleAt(cam, v.dist, z);
    // the moon sits in the upper right, a little smaller on tall phones
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const wide = cam.aspect >= 1;
    const k = THREE.MathUtils.clamp(cam.aspect / 1.3, 0.45, 1); // narrower clouds on tall screens
    const sx = wide ? 0.56 : 0.42;
    const sy = wide ? 0.5 : 0.56;
    sky.uniforms.uMoonDir.value.set(sx * tanH * cam.aspect, sy * tanH, -1).normalize();
    sky.uniforms.uMoonR.value = THREE.MathUtils.degToRad(wide ? 4.2 : 3.4);

    clouds.clouds.length = 0;
    const rand = mulberry32(33);
    const r = (a, b) => a + rand() * (b - a);
    // far, hazy clouds low over the horizon
    for (let i = 0; i < Math.round(6 * amount + 2); i++) {
      const z = r(-300, -200);
      const w = at(z);
      clouds.addCloud({ x: r(-w.halfW, w.halfW), y: r(-0.62, -0.34) * w.halfH, z, w: r(45, 75), h: r(7, 10), vx: 0.3, alpha: 0.8, stretch: 1.7, flat: 0.35, puffs: Math.round(r(26, 32)), rand });
    }
    // a thin silvery band drifting under the moon
    {
      const z = -160;
      const w = at(z);
      const my = sy * w.halfH - sky.uniforms.uMoonR.value * (v.dist - z) * 1.6;
      for (let i = 0; i < 2; i++) {
        clouds.addCloud({ x: sx * w.halfW + (i ? 1 : -1) * r(14, 26) * k, y: my - i * 4, z: z - i * 6, w: r(36, 48) * k, h: r(4, 5.5), vx: 0.45, alpha: 0.55, flat: 0.6, stretch: 2.4, puffs: 22, rand });
      }
    }
    // mid-distance cumulus at the sides
    for (let i = 0; i < Math.round(3 * amount + 2); i++) {
      const z = r(-120, -80);
      const w = at(z);
      const side = i % 2 ? 1 : -1;
      clouds.addCloud({ x: side * r(0.45, 1) * w.halfW, y: r(-0.5, -0.05) * w.halfH, z, w: r(18, 28) * k, h: r(6, 9) * (0.6 + 0.4 * k), vx: 0.55, puffs: Math.round(r(16, 22)), rand });
    }
    // soft carpet of moonlit cloud tops along the bottom
    for (const [zA, zB, n] of [
      [-30, -22, 7],
      [-14, -8, 8],
    ]) {
      for (let i = 0; i < n; i++) {
        const z = r(zA, zB);
        const w = at(z);
        const cw = (w.halfW * 2.4) / n + r(2, 6);
        clouds.addCloud({ x: -w.halfW * 1.2 + (i + 0.5) * ((w.halfW * 2.4) / n) + r(-1, 1), y: -w.halfH - r(1.5, 3.5) * (w.halfH / 12), z, w: cw, h: r(4, 6.5) * (w.halfH / 12), vx: 0.22, flat: 0.3, puffs: 12, rand });
      }
    }
    clouds.finish();

    // big twinkling stars, scattered over the upper sky away from the moon
    stars.clear();
    const zs = -600;
    const w = at(zs);
    const mx = sx * w.halfW;
    const my = sy * w.halfH;
    const moonR = sky.uniforms.uMoonR.value * (v.dist - zs);
    const n = Math.round(22 * (0.5 + amount * 0.5));
    for (let i = 0, tries = 0; i < n && tries < 400; tries++) {
      const x = r(-1, 1) * w.halfW;
      const y = r(-0.05, 1) * w.halfH;
      if (Math.hypot(x - mx, y - my) < moonR * 3.2) continue;
      const size = w.halfH * r(0.018, 0.04);
      const warm = rand() < 0.3;
      const c = r(1.2, 2.2);
      stars.add({ x, y, z: zs, size: size * 2.6, life: 1e9, frame: SPRITE.GLOW, r: 0.45 * c, g: 0.55 * c, b: 0.95 * c, a: 0.35, twinkle: r(1.2, 2.6) });
      stars.add({ x, y, z: zs, size, life: 1e9, frame: SPRITE.SPARKLE, rot: r(-0.2, 0.2), r: (warm ? 1.3 : 1.05) * c, g: 1.1 * c, b: (warm ? 0.8 : 1.3) * c, a: 1, twinkle: r(1.5, 3.5) });
      i++;
    }
  };

  // environment: a brighter version of the night with the moon out in front
  // so the glossy toys pick up a soft moon highlight and violet reflections
  const envSky = nightSky(ctx.noise, {
    zenith: '#3c3fa8',
    horizon: '#8a86e0',
    band: '#c49ad8',
    ground: '#b58a9c',
    horizonEl: -0.5,
    topEl: 0.8,
    moonDir: new THREE.Vector3(0.45, 0.55, 0.7),
    moonR: 0.22,
    moonLight: 4,
    haloColor: '#b8c4ff',
    halo: 1.4,
  });
  const env = new THREE.Scene();
  const envMesh = new THREE.Mesh(skyGeo, envSky.material);
  envMesh.frustumCulled = false;
  env.add(envMesh);

  const wrap = { halfW: (z) => visibleAt(view.camera, view.dist, z).halfW };
  const moonView = cloudMat.uniforms.uMoonView.value;
  let shootT = 3 + rand0() * 4;

  const shootingStar = () => {
    const zs = -520;
    const w = visibleAt(view.camera, view.dist, zs);
    const x = (0.1 + rand0() * 0.9) * w.halfW * (rand0() < 0.5 ? -1 : 1);
    const y = (0.45 + rand0() * 0.5) * w.halfH;
    const dir = x > 0 ? -1 : 1;
    const speed = w.halfH * (1.1 + rand0() * 0.5);
    const vx = dir * speed * 0.9;
    const vy = -speed * 0.42;
    const life = 1.1 + rand0() * 0.4;
    stars.add({ x, y, z: zs, vx, vy, size: w.halfH * 0.32, h: 0.25, life, frame: SPRITE.STREAK, align: true, curve: 'inout', r: 1.6, g: 1.7, b: 2.2, a: 0.9 });
    stars.add({ x, y, z: zs + 1, vx, vy, size: w.halfH * 0.035, life, frame: SPRITE.GLOW, curve: 'inout', r: 2.2, g: 2.2, b: 2.6, a: 1 });
  };

  return {
    id: 'night',
    group,
    envScene: env,
    light: {
      // a cool moon key from the upper right, a warm glow from below
      sunDir: new THREE.Vector3(0.4, 0.75, 0.6),
      sunColor: new THREE.Color('#dde4ff'),
      sunIntensity: 2.3,
      skyColor: new THREE.Color('#aeb6ff'),
      groundColor: new THREE.Color('#ffc6a6'),
      hemiIntensity: 0.9,
      envIntensity: 1.0,
      exposure: 1.12,
      rimColor: new THREE.Color('#a9bcff'),
      rimIntensity: 1.8,
      bloom: 0.5,
    },
    layout,
    update(dt, t, v) {
      view = v;
      sky.uniforms.uTime.value = t;
      skyMesh.position.copy(v.camera.position);
      clouds.update(dt, t, wrap);
      moonView.copy(sky.uniforms.uMoonDir.value).transformDirection(v.camera.matrixWorldInverse);
      shootT -= dt;
      if (shootT <= 0) {
        shootT = 6 + rand0() * 7;
        shootingStar();
      }
      stars.update(dt);
    },
    dispose() {
      group.removeFromParent();
      clouds.mesh.geometry.dispose();
      cloudMat.dispose();
      sky.material.dispose();
      envSky.material.dispose();
      skyGeo.dispose();
      stars.geometry.dispose();
      stars.material.dispose();
    },
  };
}
