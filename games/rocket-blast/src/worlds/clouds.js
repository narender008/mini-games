// Cloud Kingdom: a cotton-candy sunset. A pink, peach and lavender sky with
// a warm low sun, a soft pastel rainbow in the distance, and flat-topped
// cloud islands at several depths, slowly bobbing and drifting, their edges
// glowing where the sun shines through.
import * as THREE from 'three';
import { CloudField, visibleAt } from './common.js';
import { mulberry32 } from '../textures.js';

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
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform float uHorizonEl;
uniform float uTopEl;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunDisc;
uniform float uSunSize;   // angular radius, radians
uniform float uGlow;
uniform vec3 uBowDir;
uniform float uBowR;
uniform float uBow;
uniform float uTime;
varying vec3 vDir;

vec3 spectrum(float x) {
  // x: 0 inside (violet) .. 1 outside (red)
  vec3 c = clamp(abs(mod(x * 0.8 + vec3(0.0, 0.66, 0.33), 1.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return mix(vec3(1.0), c, 0.62);
}

void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float t = clamp((el - uHorizonEl) / (uTopEl - uHorizonEl), 0.0, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.5, t));
  col = mix(col, uZenith, smoothstep(0.4, 1.0, t));
  col = mix(col, uGround, clamp((uHorizonEl - el) * 4.0, 0.0, 1.0));
  float az = atan(d.x, -d.z);
  float m = texture2D(uNoise, vec2(az * 0.7 + uTime * 0.002, el * 1.3)).r;

  // warm sun: a wide soft glow and a gentle disc
  float cs = dot(d, uSunDir);
  float sd = max(cs, 0.0);
  col += uSunColor * (pow(sd, 4.0) * 0.16 + pow(sd, 30.0) * 0.4 + pow(sd, 400.0) * 0.6) * uGlow;
  float sa = acos(clamp(cs, -1.0, 1.0));
  col += uSunColor * smoothstep(uSunSize, uSunSize * 0.8, sa) * uSunDisc;

  // pastel rainbow, fading into the haze low down
  if (uBow > 0.0) {
    float ang = acos(clamp(dot(d, uBowDir), -1.0, 1.0));
    float x = (ang - uBowR) / (uBowR * 0.075) * 0.5 + 0.5;
    float band = smoothstep(0.0, 0.25, x) * smoothstep(1.0, 0.75, x);
    float fade = smoothstep(uHorizonEl + 0.12, uHorizonEl + 0.42, el) * (0.75 + 0.25 * m);
    col += spectrum(clamp(x, 0.0, 1.0)) * band * fade * uBow;
    col += vec3(0.05) * uBow * smoothstep(0.0, -0.5, x) * step(ang, uBowR) * fade;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function candySky(noise, o) {
  const uniforms = {
    uNoise: { value: noise },
    uZenith: { value: new THREE.Color(o.zenith) },
    uMid: { value: new THREE.Color(o.mid) },
    uHorizon: { value: new THREE.Color(o.horizon) },
    uGround: { value: new THREE.Color(o.ground) },
    uHorizonEl: { value: o.horizonEl ?? -0.36 },
    uTopEl: { value: o.topEl ?? 0.42 },
    uSunDir: { value: (o.sunDir ?? new THREE.Vector3(0.5, -0.1, -1)).clone().normalize() },
    uSunColor: { value: new THREE.Color(o.sunColor ?? '#ffe6c4') },
    uSunDisc: { value: o.sunDisc ?? 2.5 },
    uSunSize: { value: o.sunSize ?? 0.03 },
    uGlow: { value: o.glow ?? 1 },
    uBowDir: { value: new THREE.Vector3(0, -0.5, -1).normalize() },
    uBowR: { value: 0.5 },
    uBow: { value: o.bow ?? 0 },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false });
  return { uniforms, material };
}

// Candy clouds: the shared puff shading with lavender shadows, a pink glow
// bounced into the bellies, and golden edges where the sun shines through.
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
uniform vec3 uSunView;
uniform vec3 uGold;
uniform vec3 uBounce;
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
  float light = sunL * mix(0.5, 1.0, smoothstep(0.0, 0.8, h));
  vec3 col = mix(uShadow, uLit, light);
  // warm pink light bounced up from the clouds below
  col += uBounce * (1.0 - h) * clamp(-N.y * 0.8 + 0.3, 0.0, 1.0) * 0.35;
  float thin = pow(1.0 - dens, 2.0);
  col += uLit * thin * uRim;
  // golden edges near the sun
  float toSun = max(dot(normalize(vView), uSunView), 0.0);
  col += uGold * thin * (pow(toSun, 30.0) * 2.6 + pow(toSun, 6.0) * 0.5);
  col += uGold * pow(toSun, 12.0) * 0.18 * (1.0 - thin);
  col = mix(col, uHaze, vFog);
  gl_FragColor = vec4(col, dens * vShade.z);
}`;

// A flat-topped cloud island: a level, gently lumpy top edge with a second
// row just behind it (so it reads as a surface from above), over a fluffy
// belly that rounds off underneath. `y` is the level of the top.
function addIsland(field, { x, y, z, w, h, vx, rand, puffs = 36, alpha = 1 }) {
  const cloud = { x, y, z, w, h, vx, vy: 0, list: [] };
  const nTop = Math.round(puffs * 0.34);
  const nBack = Math.round(puffs * 0.16);
  const nBelly = puffs - nTop - nBack;
  const belly = [];
  const back = [];
  const top = [];
  const puff = (list, dx, dy, dz, size, height) => list.push({ dx, dy, dz, size, height, seed: rand(), alpha, stretch: 1.1 });
  for (let i = 0; i < nBelly; i++) {
    const u = rand() * 2 - 1;
    const k = Math.pow(1 - u * u, 0.7);
    const dy = -h * (0.25 + 0.6 * k * Math.sqrt(rand()));
    const size = h * (0.5 + 0.45 * k) * (0.85 + rand() * 0.3);
    puff(belly, (u * w) / 2 * 0.85, dy + size * 0.1, (rand() - 0.5) * w * 0.12, size, 0.2 + 0.75 * Math.max(0, 1 + dy / h));
  }
  for (let i = 0; i < nBack; i++) {
    const u = (i + rand()) / nBack * 2 - 1;
    const size = h * (0.42 + rand() * 0.14);
    puff(back, (u * w) / 2 * 0.8, -size * 0.42, -w * 0.18, size, 0.95);
  }
  for (let i = 0; i < nTop; i++) {
    const u = (i + rand()) / nTop * 2 - 1;
    const end = 1 - Math.pow(Math.abs(u), 6) * 0.5;
    const size = h * (0.4 + rand() * 0.16) * end;
    puff(top, (u * w) / 2 * 0.95, -size * 0.45 + h * 0.03 * rand(), w * 0.06 * (rand() - 0.3), size, 0.88 + rand() * 0.12);
  }
  belly.sort((a, b) => a.dy - b.dy);
  cloud.list = belly.concat(back, top);
  cloud.baseY = y;
  cloud.bobA = 0;
  cloud.bobW = 0;
  cloud.phase = 0;
  field.clouds.push(cloud);
  return cloud;
}

export function create(ctx) {
  const group = new THREE.Group();

  const sky = candySky(ctx.noise, {
    zenith: '#7f86e0',
    mid: '#f0a8cf',
    horizon: '#ffcbab',
    ground: '#ffc3b6',
    sunColor: '#ffe0b8',
    sunDisc: 4,
    glow: 0.8,
    bow: 0.26,
  });
  const skyGeo = new THREE.SphereGeometry(1000, 48, 24);
  const skyMesh = new THREE.Mesh(skyGeo, sky.material);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -10;
  group.add(skyMesh);

  const clouds = new CloudField({ noise: ctx.noise, lit: '#fff2ee', shadow: '#ad98dc', haze: '#f5c2d6', sun: new THREE.Vector3(0.6, 0.65, 0.5), rim: 0.3, soft: 0.42, fogNear: 80, fogFar: 480, capacity: 700 });
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      ...clouds.uniforms,
      uSunView: { value: new THREE.Vector3(0, 0, -1) },
      uGold: { value: new THREE.Color('#ffd49a') },
      uBounce: { value: new THREE.Color('#ffb0c8') },
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
  let islands = [];
  const layout = (v) => {
    view = v;
    const cam = v.camera;
    const at = (z) => visibleAt(cam, v.dist, z);
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const wide = cam.aspect >= 1;
    const k = THREE.MathUtils.clamp(cam.aspect / 1.3, 0.45, 1); // narrower islands on tall screens
    const dir = (sx, sy) => new THREE.Vector3(sx * tanH * cam.aspect, sy * tanH, -1).normalize();
    // the sun sits low on the right, half behind a cloud island; the
    // rainbow arcs across the far sky
    const sun = wide ? [0.66, -0.12] : [0.42, -0.02];
    sky.uniforms.uSunDir.value.copy(dir(sun[0], sun[1]));
    sky.uniforms.uSunSize.value = THREE.MathUtils.degToRad(wide ? 2 : 1.6);
    const bowC = dir(wide ? -0.3 : -0.2, -1.9);
    sky.uniforms.uBowDir.value.copy(bowC);
    sky.uniforms.uBowR.value = bowC.angleTo(dir(wide ? -0.3 : -0.2, 0.42));

    clouds.clouds.length = 0;
    islands = [];
    const rand = mulberry32(64);
    const r = (a, b) => a + rand() * (b - a);
    const island = (o) => {
      const c = addIsland(clouds, { ...o, rand });
      c.bobA = r(0.15, 0.3) * (1 + -o.z / 100);
      c.bobW = r(0.35, 0.6);
      c.phase = r(0, 6.3);
      islands.push(c);
      return c;
    };
    // far islands resting on the haze near the horizon
    for (let i = 0; i < Math.round(4 * amount + 2); i++) {
      const z = r(-300, -220);
      const w = at(z);
      island({ x: r(-1, 1) * w.halfW, y: r(-0.4, -0.22) * w.halfH, z, w: r(40, 64), h: r(10, 14), vx: 0.25, puffs: 26, alpha: 0.95 });
    }
    // the island the sun is setting behind
    {
      const z = -130;
      const w = at(z);
      const sunR = sky.uniforms.uSunSize.value * (v.dist - z);
      island({ x: sun[0] * w.halfW - r(2, 6) * k, y: sun[1] * w.halfH + sunR * 0.2, z, w: r(30, 36) * k, h: r(11, 13) * (0.6 + 0.4 * k), vx: 0.04, puffs: 40 });
    }
    // mid-distance islands on the left
    for (let i = 0; i < Math.round(amount + 1); i++) {
      const z = r(-120, -90);
      const w = at(z);
      island({ x: -r(0.45, 0.9) * w.halfW, y: r(-0.4, -0.1) * w.halfH, z, w: r(24, 32) * k, h: r(9, 12) * (0.6 + 0.4 * k), vx: 0.4, puffs: 38 });
    }
    // two big near islands in the lower corners
    for (let i = 0; i < 2; i++) {
      const z = r(-48, -38);
      const w = at(z);
      island({ x: (i ? 1 : -1) * r(0.7, 0.85) * w.halfW, y: r(-0.6, -0.5) * w.halfH, z, w: r(15, 19) * k, h: r(6, 7.5) * (0.6 + 0.4 * k), vx: 0.3, puffs: 44 });
    }
    // a few wisps high in the sky
    for (let i = 0; i < 3; i++) {
      const z = r(-200, -150);
      const w = at(z);
      clouds.addCloud({ x: (i - 1) * 0.7 * w.halfW + r(-10, 10), y: r(0.55, 0.85) * w.halfH, z, w: r(30, 45), h: r(3, 4.5), vx: 0.6, alpha: 0.45, flat: 0.6, stretch: 2.5, puffs: 12, rand });
    }
    // a soft sea of cloud tops far below, along the bottom of the view
    const nSea = 7;
    for (let i = 0; i < nSea; i++) {
      const z = r(-70, -55);
      const w = at(z);
      const cw = (w.halfW * 2.4) / nSea + r(4, 10);
      clouds.addCloud({ x: -w.halfW * 1.2 + (i + 0.5) * ((w.halfW * 2.4) / nSea) + r(-2, 2), y: -w.halfH * 1.08, z, w: cw, h: w.halfH * r(0.2, 0.28), vx: 0.2, flat: 0.35, puffs: 14, alpha: 0.95, rand });
    }
    clouds.finish();
  };

  // environment: the same candy sky, brighter, with the sun out in front so
  // the toys catch a warm highlight
  const envSky = candySky(ctx.noise, {
    zenith: '#6f72d0',
    mid: '#e493c0',
    horizon: '#f6b89a',
    ground: '#c98f9c',
    horizonEl: -0.45,
    topEl: 0.8,
    sunDir: new THREE.Vector3(0.55, 0.45, 0.7),
    sunColor: '#fff0d8',
    sunDisc: 4,
    sunSize: 0.16,
    glow: 0.8,
  });
  const env = new THREE.Scene();
  const envMesh = new THREE.Mesh(skyGeo, envSky.material);
  envMesh.frustumCulled = false;
  env.add(envMesh);

  const wrap = { halfW: (z) => visibleAt(view.camera, view.dist, z).halfW };
  const sunView = cloudMat.uniforms.uSunView.value;

  return {
    id: 'clouds',
    group,
    envScene: env,
    light: {
      // warm sunset key, lavender sky fill, a pink rim from behind
      sunDir: new THREE.Vector3(0.5, 0.75, 0.55),
      sunColor: new THREE.Color('#ffe8d8'),
      sunIntensity: 2.0,
      skyColor: new THREE.Color('#d8c4ff'),
      groundColor: new THREE.Color('#ffcfb8'),
      hemiIntensity: 0.5,
      envIntensity: 0.8,
      exposure: 0.97,
      rimColor: new THREE.Color('#ffc8dc'),
      rimIntensity: 1.3,
      bloom: 0.45,
    },
    layout,
    update(dt, t, v) {
      view = v;
      sky.uniforms.uTime.value = t;
      skyMesh.position.copy(v.camera.position);
      for (const c of islands) c.y = c.baseY + Math.sin(t * c.bobW + c.phase) * c.bobA;
      clouds.update(dt, t, wrap);
      sunView.copy(sky.uniforms.uSunDir.value).transformDirection(v.camera.matrixWorldInverse);
    },
    dispose() {
      group.removeFromParent();
      clouds.mesh.geometry.dispose();
      cloudMat.dispose();
      sky.material.dispose();
      envSky.material.dispose();
      skyGeo.dispose();
    },
  };
}
