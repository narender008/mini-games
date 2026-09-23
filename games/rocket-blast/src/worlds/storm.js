// Storm: a gentle rainy sky. Soft blue-grey and lavender storm clouds, a
// light slanting rain, and now and then a soft flash of lightning glowing
// inside one cloud (never a bolt). On the right a warm sunbeam breaks through
// and a faint rainbow shows on the left, to keep it cheerful.
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
uniform vec3 uHorizon;
uniform vec3 uBand;
uniform vec3 uGround;
uniform float uHorizonEl;
uniform float uTopEl;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunGlow;
uniform float uRays;
uniform vec3 uBowDir;      // centre of the rainbow
uniform float uBowR;       // its angular radius
uniform float uBow;
uniform vec3 uFlashDir;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uTime;
varying vec3 vDir;

vec3 spectrum(float x) {
  // x: 0 inside (violet) .. 1 outside (red)
  vec3 c = clamp(abs(mod(x * 0.8 + vec3(0.0, 0.66, 0.33), 1.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return mix(vec3(1.0), c, 0.75);
}

void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float t = clamp((el - uHorizonEl) / (uTopEl - uHorizonEl), 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.8));
  col = mix(col, uBand, exp(-t * 5.0) * step(uHorizonEl, el) * 0.7);
  col = mix(col, uGround, clamp((uHorizonEl - el) * 4.0, 0.0, 1.0));
  // soft mottling so the overcast is not a flat gradient
  float az = atan(d.x, -d.z);
  float m = texture2D(uNoise, vec2(az * 0.9 + uTime * 0.002, el * 1.6)).r;
  col *= 0.94 + 0.12 * m;

  // warm light breaking through, with soft rays fanning down from it
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 5.0) * 0.28 + pow(sd, 40.0) * 0.45) * uSunGlow;
  if (uRays > 0.0) {
    vec3 right = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, uSunDir);
    vec3 v = d - uSunDir * dot(d, uSunDir);
    float a = atan(dot(v, up), dot(v, right));
    float fan = texture2D(uNoise, vec2(a * 1.3, uTime * 0.01)).b;
    float fan2 = texture2D(uNoise, vec2(a * 3.1, 0.5 + uTime * 0.013)).r;
    float down = smoothstep(0.2, -0.6, sin(a)); // mostly below the sun
    float fall = pow(sd, 3.0) * smoothstep(0.9995, 0.99, sd);
    col += uSunColor * smoothstep(0.45, 0.8, fan * 0.6 + fan2 * 0.5) * down * fall * uRays;
  }

  // faint rainbow
  if (uBow > 0.0) {
    float ang = acos(clamp(dot(d, uBowDir), -1.0, 1.0));
    float x = (ang - uBowR) / (uBowR * 0.09) * 0.5 + 0.5;
    float band = smoothstep(0.0, 0.2, x) * smoothstep(1.0, 0.8, x);
    float fade = smoothstep(uHorizonEl + 0.05, uHorizonEl + 0.3, el) * (0.5 + 0.5 * m);
    col += spectrum(clamp(x, 0.0, 1.0)) * band * fade * uBow;
    // the sky inside a rainbow is a touch brighter
    col += vec3(0.04, 0.045, 0.05) * uBow * 3.0 * smoothstep(0.0, -0.4, x) * step(ang, uBowR) * fade;
  }

  // lightning glow behind the clouds
  float fd = max(dot(d, uFlashDir), 0.0);
  col += uFlashColor * uFlash * (pow(fd, 30.0) * 0.5 + pow(fd, 6.0) * 0.12);
  gl_FragColor = vec4(col, 1.0);
}`;

function stormSky(noise, o) {
  const uniforms = {
    uNoise: { value: noise },
    uZenith: { value: new THREE.Color(o.zenith) },
    uHorizon: { value: new THREE.Color(o.horizon) },
    uBand: { value: new THREE.Color(o.band) },
    uGround: { value: new THREE.Color(o.ground) },
    uHorizonEl: { value: o.horizonEl ?? -0.36 },
    uTopEl: { value: o.topEl ?? 0.42 },
    uSunDir: { value: (o.sunDir ?? new THREE.Vector3(0.5, 0.35, -1)).clone().normalize() },
    uSunColor: { value: new THREE.Color(o.sunColor ?? '#ffe6b8') },
    uSunGlow: { value: o.sunGlow ?? 1 },
    uRays: { value: o.rays ?? 0 },
    uBowDir: { value: new THREE.Vector3(0, -0.3, -1).normalize() },
    uBowR: { value: 0.4 },
    uBow: { value: o.bow ?? 0 },
    uFlashDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color('#e4e6ff') },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false });
  return { uniforms, material };
}

// Storm clouds: the shared puff shading, plus lightning that glows inside
// the one cloud it starts in and spills a little onto its neighbours.
const cloudVertex = /* glsl */ `
attribute vec4 iPos;
attribute vec4 iShade;
varying vec2 vUv;
varying vec4 vShade;
varying float vFog;
varying float vFlash;
uniform float uFogNear;
uniform float uFogFar;
uniform vec4 uFlashPos;  // xyz, radius
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
  mv.xy += position.xy * iPos.w * vec2(iShade.w, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vShade = iShade;
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
  vec3 fd = (iPos.xyz - uFlashPos.xyz) / uFlashPos.w;
  fd.z *= 0.5;
  vFlash = exp(-dot(fd, fd) * 1.4);
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
uniform float uFlash;
uniform vec3 uFlashColor;
uniform vec3 uWarm;
varying vec2 vUv;
varying vec4 vShade;
varying float vFog;
varying float vFlash;
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
  float light = sunL * mix(0.5, 1.0, smoothstep(0.0, 0.85, h));
  vec3 col = mix(uShadow, uLit, light);
  float thin = pow(1.0 - dens, 2.0);
  col += uLit * thin * uRim;
  // a hint of the warm sunbeam on the edges that face it
  col += uWarm * thin * clamp(N.x, 0.0, 1.0) * 0.35;
  // lightning: glows from inside, strongest in the thick middle
  float f = uFlash * vFlash;
  col += uFlashColor * f * (0.55 + 0.9 * n) * (0.6 + 0.4 * dens) * (1.1 - h * 0.4);
  col = mix(col, uHaze, vFog * (1.0 - f * 0.5));
  gl_FragColor = vec4(col, dens * vShade.z);
}`;

// Rain: thin streaks animated entirely on the GPU. Each drop falls through a
// box that fills the view at its depth and wraps round.
const rainVertex = /* glsl */ `
attribute vec4 iDrop;   // x0, y0 (0..1), z, speed
attribute vec2 iLook;   // length, alpha
uniform float uTime;
uniform float uTanH;
uniform float uAspect;
uniform float uDist;
uniform float uSlant;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float z = iDrop.z;
  float hh = (uDist - z) * uTanH * 1.15;
  float hw = hh * uAspect + 2.0;
  float y01 = fract(iDrop.y - uTime * iDrop.w / (2.0 * hh));
  float y = (y01 * 2.0 - 1.0) * hh;
  float x = (iDrop.x * 2.0 - 1.0) * hw + y * uSlant;
  x = mod(x + hw, 2.0 * hw) - hw;
  vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
  vec2 along = normalize(vec2(uSlant, 1.0));
  vec2 across = vec2(along.y, -along.x);
  float width = 0.018 + (uDist - z) * 0.0012;
  mv.xy += along * position.y * iLook.x + across * position.x * width;
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vAlpha = iLook.y * smoothstep(0.0, 0.08, y01) * smoothstep(1.0, 0.92, y01);
}`;

const rainFragment = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float a = smoothstep(0.0, 0.9, across) * pow(max(sin(3.1416 * vUv.y), 0.0), 0.6) * mix(1.0, 0.35, vUv.y) * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}`;

function createRain(count, rand) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  const drop = new Float32Array(count * 4);
  const look = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    // more drops close to the play plane, fewer far away
    const z = -2 - Math.pow(rand(), 1.4) * 40;
    drop[i * 4] = rand();
    drop[i * 4 + 1] = rand();
    drop[i * 4 + 2] = z;
    drop[i * 4 + 3] = 13 + rand() * 6 + -z * 0.25;
    look[i * 2] = 0.7 + rand() * 0.6 + -z * 0.02;
    look[i * 2 + 1] = (0.2 + rand() * 0.22) * (1 - Math.min(0.5, -z / 90));
  }
  g.setAttribute('iDrop', new THREE.InstancedBufferAttribute(drop, 4));
  g.setAttribute('iLook', new THREE.InstancedBufferAttribute(look, 2));
  g.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTanH: { value: Math.tan(THREE.MathUtils.degToRad(20)) },
      uAspect: { value: 1.6 },
      uDist: { value: 15 },
      uSlant: { value: 0.2 },
      uColor: { value: new THREE.Color('#f4f7ff') },
    },
    vertexShader: rainVertex,
    fragmentShader: rainFragment,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -4;
  return mesh;
}

// one soft flicker: quick rise, gentle fade
const pulse = (a, peak) => (a < 0 ? 0 : peak * (1 - Math.exp(-a / 0.025)) * Math.exp(-a / 0.15));

export function create(ctx) {
  const group = new THREE.Group();
  const rand0 = mulberry32(99);

  const sunDir = new THREE.Vector3(0.62, 0.34, -1).normalize();
  const sky = stormSky(ctx.noise, {
    zenith: '#61709c',
    horizon: '#a9b3cf',
    band: '#c4bbdc',
    ground: '#a3acc8',
    sunDir,
    sunColor: '#ffe3b0',
    sunGlow: 0.6,
    rays: 0.055,
    bow: 0.12,
  });
  const skyGeo = new THREE.SphereGeometry(1000, 48, 24);
  const skyMesh = new THREE.Mesh(skyGeo, sky.material);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -10;
  group.add(skyMesh);

  const clouds = new CloudField({ noise: ctx.noise, lit: '#e9ecf8', shadow: '#6f78a3', haze: '#a9b3cf', sun: new THREE.Vector3(0.35, 0.8, 0.5), rim: 0.22, soft: 0.42, fogNear: 60, fogFar: 320, capacity: 700 });
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      ...clouds.uniforms,
      uFlashPos: { value: new THREE.Vector4(0, 0, -100, 20) },
      uWarm: { value: new THREE.Color('#ffd9a0') },
    },
    vertexShader: cloudVertex,
    fragmentShader: cloudFragment,
    transparent: true,
    depthWrite: false,
  });
  cloudMat.uniforms.uFlashColor.value.set('#e8e6ff');
  clouds.material.dispose();
  clouds.material = cloudMat;
  clouds.mesh.material = cloudMat;
  group.add(clouds.mesh);

  const amount = ctx.quality.clouds;
  const rain = createRain(Math.round(300 * amount), mulberry32(5));
  group.add(rain);

  let view = null;
  let flashable = [];
  const layout = (v) => {
    view = v;
    const cam = v.camera;
    const at = (z) => visibleAt(cam, v.dist, z);
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const ru = rain.material.uniforms;
    ru.uTanH.value = tanH;
    ru.uAspect.value = cam.aspect;
    ru.uDist.value = v.dist;
    // sunbreak on the right, a faint rainbow arcing up on the left
    const wide = cam.aspect >= 1;
    const k = THREE.MathUtils.clamp(cam.aspect / 1.3, 0.45, 1); // narrower clouds on tall screens
    sky.uniforms.uSunDir.value.set((wide ? 0.72 : 1.05) * tanH * cam.aspect, (wide ? 0.62 : 0.7) * tanH, -1).normalize();
    sky.uniforms.uBowDir.value.set((wide ? -0.55 : -0.9) * tanH * cam.aspect, -1.25 * tanH, -1).normalize();
    sky.uniforms.uBowR.value = Math.atan(tanH * (wide ? 1.35 : 1.1));

    clouds.clouds.length = 0;
    flashable = [];
    const rand = mulberry32(12);
    const r = (a, b) => a + rand() * (b - a);
    // far, hazy clouds over the horizon
    for (let i = 0; i < Math.round(5 * amount + 2); i++) {
      const z = r(-300, -210);
      const w = at(z);
      clouds.addCloud({ x: r(-w.halfW, w.halfW), y: r(-0.62, -0.36) * w.halfH, z, w: r(50, 80), h: r(8, 12), vx: 0.25, alpha: 0.85, stretch: 1.5, flat: 0.3, puffs: 26, rand });
    }
    // a soft ceiling of storm clouds along the top, with the lightning inside
    const nTop = Math.round(3 * amount + 3);
    for (let i = 0; i < nTop; i++) {
      const z = r(-150, -100);
      const w = at(z);
      const cw = (w.halfW * 2.6) / nTop + r(10, 20) * k;
      const c = clouds.addCloud({ x: -w.halfW * 1.3 + (i + 0.5) * ((w.halfW * 2.6) / nTop) + r(-4, 4), y: r(0.5, 0.72) * w.halfH, z, w: cw, h: r(14, 20) * (0.7 + 0.3 * k), vx: 0.5, flat: 0.2, puffs: 26, rand });
      flashable.push(c);
    }
    // a big soft cumulus on each side, low down
    for (let i = 0; i < 2; i++) {
      const z = r(-95, -70);
      const w = at(z);
      const c = clouds.addCloud({ x: (i ? 1 : -1) * r(0.6, 0.85) * w.halfW, y: r(-0.55, -0.35) * w.halfH, z, w: r(22, 30) * k, h: r(11, 14) * (0.6 + 0.4 * k), vx: 0.4, puffs: 24, rand });
      flashable.push(c);
    }
    // soft grey carpet along the bottom
    for (const [zA, zB, n] of [
      [-30, -22, 7],
      [-14, -8, 8],
    ]) {
      for (let i = 0; i < n; i++) {
        const z = r(zA, zB);
        const w = at(z);
        const cw = (w.halfW * 2.4) / n + r(2, 6);
        clouds.addCloud({ x: -w.halfW * 1.2 + (i + 0.5) * ((w.halfW * 2.4) / n) + r(-1, 1), y: -w.halfH - r(1.5, 3.5) * (w.halfH / 12), z, w: cw, h: r(4, 6.5) * (w.halfH / 12), vx: 0.2, flat: 0.3, puffs: 12, rand });
      }
    }
    clouds.finish();
  };

  // environment: a bright overcast with the warm break on one side
  const envSky = stormSky(ctx.noise, {
    zenith: '#aab6dc',
    horizon: '#e4e8f4',
    band: '#ece4f6',
    ground: '#c9c2cc',
    horizonEl: -0.4,
    topEl: 0.8,
    sunDir: new THREE.Vector3(0.6, 0.5, 0.6),
    sunColor: '#fff0d0',
    sunGlow: 2.2,
  });
  const env = new THREE.Scene();
  const envMesh = new THREE.Mesh(skyGeo, envSky.material);
  envMesh.frustumCulled = false;
  env.add(envMesh);

  const wrap = { halfW: (z) => visibleAt(view.camera, view.dist, z).halfW };
  const flashPos = cloudMat.uniforms.uFlashPos.value;
  const flashDir = sky.uniforms.uFlashDir.value;
  let nextFlash = 3 + rand0() * 3;
  let flashAge = 99;
  let second = 0.14;
  let strength = 1;
  let flashCloud = null;

  const world = {
    id: 'storm',
    group,
    envScene: env,
    flash: 0,
    light: {
      // soft, even overcast light with a warm rim from the sunbeam
      sunDir: new THREE.Vector3(0.3, 0.8, 0.6),
      sunColor: new THREE.Color('#f6f4ff'),
      sunIntensity: 1.9,
      skyColor: new THREE.Color('#c9d3f4'),
      groundColor: new THREE.Color('#f2e4d8'),
      hemiIntensity: 0.9,
      envIntensity: 0.95,
      exposure: 1.05,
      rimColor: new THREE.Color('#ffe2b8'),
      rimIntensity: 1.3,
      bloom: 0.4,
    },
    layout,
    update(dt, t, v) {
      view = v;
      sky.uniforms.uTime.value = t;
      skyMesh.position.copy(v.camera.position);
      clouds.update(dt, t, wrap);
      rain.material.uniforms.uTime.value = t;

      // lightning: every 6-12 s a soft double flicker inside one cloud
      nextFlash -= dt;
      if (nextFlash <= 0 && flashable.length) {
        nextFlash = 6 + rand0() * 6;
        flashAge = 0;
        second = 0.11 + rand0() * 0.1;
        strength = 0.75 + rand0() * 0.25;
        flashCloud = flashable[Math.floor(rand0() * flashable.length)];
        flashPos.w = Math.max(flashCloud.w, flashCloud.h * 2) * 0.55;
      }
      flashAge += dt;
      let f = 0;
      if (flashAge < 1.2) {
        f = Math.max(pulse(flashAge, 1), pulse(flashAge - second, 0.7)) * strength;
        // follow the cloud as it drifts
        flashPos.set(flashCloud.x + (rand0() - 0.5) * 0.02, flashCloud.y + flashCloud.h * 0.45, flashCloud.z, flashPos.w);
        flashDir.set(flashPos.x - v.camera.position.x, flashPos.y - v.camera.position.y, flashPos.z - v.camera.position.z).normalize();
      }
      cloudMat.uniforms.uFlash.value = f * 1.1;
      sky.uniforms.uFlash.value = f;
      world.flash = f * 0.6;
    },
    dispose() {
      group.removeFromParent();
      clouds.mesh.geometry.dispose();
      cloudMat.dispose();
      sky.material.dispose();
      envSky.material.dispose();
      skyGeo.dispose();
      rain.geometry.dispose();
      rain.material.dispose();
    },
  };
  return world;
}
