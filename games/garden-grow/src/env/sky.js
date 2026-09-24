// Sky, sun, moon, light and time of day. One Atmosphere owns the sky dome
// (scattering sky, sun and moon discs, stars, drifting clouds), the key
// light (the sun by day, the moon at night) with its shadows, the
// hemisphere fill, the environment map made from the sky, and the fog that
// hazes the distant trees. setTime / setOvercast ease every one of them
// together; `state` tells the rest of the garden what the light is doing.
import * as THREE from 'three';
import { transmittance, CLOUD_ALT, CIRRUS_ALT } from './atmosphere.js';
import { createSkyNoise } from './sky/noise.js';
import { createSkyUniforms, createDome, skyRadiance } from './sky/dome.js';
import { PRESETS, flatten, blend, copyFlat } from './sky/presets.js';

const E0 = 5.2; // sunlight above the air, in DirectionalLight units
const MOON_LIGHT = new THREE.Color('#9db8ff'); // moonlight as the eye sees it
const MOON_SKY = [0.85, 0.9, 1.0]; // moonlight scattering in the sky
const MOON_DISC = new THREE.Color('#fff4e2');
const GRASS = [0.075, 0.11, 0.035]; // albedo of the lawn seen from afar
const TREES = [0.035, 0.055, 0.025];
const SHADOW_BOX = { x0: -3.5, x1: 3.5, z0: -3.5, z1: 3.5, y0: -0.2, y1: 2.4 };
const LUM = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const ease = (k) => k * k * (3 - 2 * k);

function dirFromAzEl(az, el, out) {
  const a = THREE.MathUtils.degToRad(az);
  const e = THREE.MathUtils.degToRad(el);
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

// Cosine-weighted directions over the upper hemisphere (for fill light).
const HEMI_DIRS = [];
for (const [theta, n] of [
  [15, 3],
  [45, 6],
  [72, 7],
]) {
  const t = THREE.MathUtils.degToRad(theta);
  for (let i = 0; i < n; i++) {
    const a = ((i + (theta === 45 ? 0.5 : 0)) / n) * Math.PI * 2;
    const d = new THREE.Vector3(Math.sin(t) * Math.sin(a), Math.cos(t), -Math.sin(t) * Math.cos(a));
    HEMI_DIRS.push({ d, w: (Math.cos(t) * Math.sin(t)) / n });
  }
}

const _t = [0, 0, 0];
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export class Atmosphere {
  constructor({ renderer, scene, quality }) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    const low = quality.tier === 'low';

    this.group = new THREE.Group();
    this.group.name = 'atmosphere';
    this.noise = createSkyNoise(low ? 128 : 256);
    this.uniforms = createSkyUniforms(this.noise);
    this.dome = createDome({ uniforms: this.uniforms, quality });
    this.group.add(this.dome);

    // the environment map: the sky rendered into a small cube, prefiltered
    this.envScene = new THREE.Scene();
    this.envScene.add(createDome({ uniforms: this.uniforms, quality, env: true }));
    this.cubeRT = new THREE.WebGLCubeRenderTarget(low ? 64 : 128, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCam = new THREE.CubeCamera(0.1, 1000, this.cubeRT);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.envTimer = 0;
    this.envDirty = true;
    this.computeTimer = 0;

    // key light: the sun (or the moon at night)
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.name = 'sun';
    sun.castShadow = !!quality.shadows;
    const size = quality.shadowSize || 2048;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.018;
    this.shadowScale = size / 2048;
    this.sun = sun;
    this.group.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd6f5, 0x4f5a33, 0.5);
    this.hemi.name = 'sky-fill';
    this.group.add(this.hemi);

    this.fog = new THREE.FogExp2(0xc8c0b0, 0.015);
    scene.fog = this.fog;

    this.state = {
      time: 'golden',
      sunDir: new THREE.Vector3(),
      sunColor: new THREE.Color(),
      sunIntensity: 0,
      night: 0,
      exposure: 1,
      bloom: 0.3,
      fogColor: this.fog.color,
      fogDensity: 0,
      skyColor: new THREE.Color(),
      overcast: 0,
      // extras
      moonDir: this.uniforms.uMoonDir.value,
      skySunDir: this.uniforms.uSunDir.value, // the real sun (may be below the horizon)
      horizonColor: new THREE.Color(),
      groundColor: new THREE.Color(),
      envIntensity: 1,
      blending: false,
    };

    this.cur = flatten(PRESETS.golden);
    this.from = copyFlat(this.cur);
    this.to = copyFlat(this.cur);
    this.k = 1;
    this.dur = 1;
    this.oc = { v: 0, from: 0, to: 0, k: 1, dur: 1 };
    this.viewAz = 0;
    this.skyAvg = new THREE.Vector3();
    this.keyDir = new THREE.Vector3();
    this.keyColor = new THREE.Color();
    this.lastShadowDir = new THREE.Vector3();

    this.compute();
    this.refreshEnv();
    scene.add(this.group);
  }

  // Ease to a time of day: 'morning' | 'golden' | 'dusk' | 'night'.
  setTime(id, seconds = 3) {
    const p = PRESETS[id];
    if (!p) return;
    this.state.time = id;
    this.from = copyFlat(this.cur);
    this.to = flatten(p);
    this.dur = Math.max(1e-3, seconds);
    this.k = seconds > 0 ? 0 : 1;
    if (this.k >= 1) {
      copyFlat(this.to, this.cur);
      this.compute();
      this.envDirty = true;
    }
  }

  // 0..1: a soft grey rain sky, diffuse light, faint shadows.
  setOvercast(v, seconds = 4) {
    const o = this.oc;
    o.from = o.v;
    o.to = THREE.MathUtils.clamp(v, 0, 1);
    o.dur = Math.max(1e-3, seconds);
    o.k = seconds > 0 ? 0 : 1;
    if (o.k >= 1) {
      o.v = o.to;
      this.compute();
      this.envDirty = true;
    }
  }

  update(dt, t, camera) {
    const U = this.uniforms;
    let changed = false;
    let ended = false;
    if (this.k < 1) {
      this.k = Math.min(1, this.k + dt / this.dur);
      blend(this.from, this.to, ease(this.k), this.cur);
      changed = true;
      ended = this.k >= 1;
    }
    const o = this.oc;
    if (o.k < 1) {
      o.k = Math.min(1, o.k + dt / o.dur);
      o.v = o.from + (o.to - o.from) * ease(o.k);
      changed = true;
      ended = ended || o.k >= 1;
    }
    this.state.blending = this.k < 1 || o.k < 1;

    if (camera) {
      this.dome.position.copy(camera.position);
      // on the far plane anyway; a big radius keeps depth-only passes sane too
      this.dome.scale.setScalar(camera.far * 0.9);
      camera.getWorldDirection(_fwd);
      const az = Math.atan2(_fwd.x, -_fwd.z);
      if (Math.abs(az - this.viewAz) > 0.05) {
        this.viewAz = az;
        if (!changed) this.computeFog();
      }
    }
    // lights and uniforms follow a blend at about 30 Hz, and exactly at its end
    this.computeTimer -= dt;
    if (changed && (this.computeTimer <= 0 || ended)) {
      this.computeTimer = 1 / 30;
      this.compute();
    }

    // clouds drift on a light breeze aloft (tiles of 9 km a side)
    U.uCloudOffset.value.x += dt * 0.00042;
    U.uCloudOffset.value.y -= dt * 0.00017;
    U.uCirrusOffset.value.x += dt * 0.00012;
    U.uTime.value = t;

    // the environment follows the sky, a few times a second at most
    this.envTimer -= dt;
    if (changed) this.envDirty = true;
    if (this.envDirty && (this.envTimer <= 0 || ended)) this.refreshEnv();
  }

  // Works out every uniform, light and state value from the current blend.
  compute() {
    const P = this.cur;
    const U = this.uniforms;
    const S = this.state;
    const oc = this.oc.v;
    const sunDir = dirFromAzEl(P.sunAz, P.sunEl, U.uSunDir.value);
    const moonDir = dirFromAzEl(P.moonAz, P.moonEl, U.uMoonDir.value);
    const turb = P.turb * (1 + oc * 1.5);
    U.uTurb.value = turb;
    U.uMieG.value = P.mieG;
    U.uMS.value = P.ms;
    U.uSunE.value.setScalar(E0 * P.sky);
    U.uMoonE.value.fromArray(MOON_SKY).multiplyScalar(P.moonE);
    U.uMoonOn.value = P.moonE > 1e-4 ? 1 : 0;
    U.uTint.value.fromArray(P.tint);
    U.uSat.value = P.sat;
    U.uGlow.value.fromArray(P.glow);
    U.uBelt.value.fromArray(P.belt);
    U.uNightZen.value.fromArray(P.nightZen);
    U.uNightHor.value.fromArray(P.nightHor);
    U.uSunDisc.value = P.sunDisc * (1 - oc);
    U.uMoon.value = P.moonDisc * (1 - oc);
    U.uMoonCol.value.set(MOON_DISC.r, MOON_DISC.g, MOON_DISC.b).multiplyScalar(2.6);
    U.uMoonGlow.value = P.moonGlow;
    U.uStars.value = P.stars * (1 - oc);
    // the moon's face stays upright
    const right = U.uMoonRight.value.crossVectors(moonDir, _v.set(0, 1, 0)).normalize();
    U.uMoonUp.value.crossVectors(right, moonDir).normalize();

    // key light: the sun, never lower than keyMinEl so shadows stay sane
    const keyEl = Math.max(P.sunEl, P.keyMinEl);
    const sunKey = dirFromAzEl(P.sunAz, keyEl, _w);
    transmittance(60, sunKey.y, turb, _t);
    let lum = Math.max(1e-6, LUM(_t[0], _t[1], _t[2]));
    const sunI = E0 * lum * P.key;
    const sunCol = this.keyColor.setRGB(_t[0] / lum, _t[1] / lum, _t[2] / lum);
    // keySat < 1 whitens the physical colour, > 1 deepens it
    sunCol.setRGB(1 + (sunCol.r - 1) * P.keySat, 1 + (sunCol.g - 1) * P.keySat, Math.max(0.05, 1 + (sunCol.b - 1) * P.keySat));
    lum = LUM(sunCol.r, sunCol.g, sunCol.b);
    sunCol.multiplyScalar(1 / lum);
    const ws = 1 - THREE.MathUtils.smoothstep(P.moonKey, 0, 0.5);
    const wm = THREE.MathUtils.smoothstep(P.moonKey, 0.5, 1);
    if (P.moonKey < 0.5) {
      S.sunDir.copy(sunKey);
      S.sunColor.copy(sunCol);
      S.sunIntensity = sunI * ws;
    } else {
      S.sunDir.copy(moonDir);
      S.sunColor.copy(MOON_LIGHT);
      S.sunIntensity = P.moonKeyI * wm;
    }
    const clearKey = S.sunIntensity;
    S.sunIntensity *= 1 - 0.85 * oc;

    // light on the clouds: sunlight at their height (as warm as the key
    // light), plus moonlight
    const cl = P.cloudLit * E0 * P.sky * 0.1;
    this.cloudLight(CLOUD_ALT, sunDir.y, turb, P.cloudSat, cl, U.uCloudSun.value);
    this.cloudLight(CIRRUS_ALT, sunDir.y, turb, P.cloudSat, cl, U.uCirrusSun.value);
    if (P.moonE > 0) {
      transmittance(CLOUD_ALT, moonDir.y, turb, _t);
      _v.fromArray(MOON_SKY).multiplyScalar(P.moonE * 0.3);
      U.uCloudSun.value.x += _t[0] * _v.x;
      U.uCloudSun.value.y += _t[1] * _v.y;
      U.uCloudSun.value.z += _t[2] * _v.z;
      U.uCirrusSun.value.x += _t[0] * _v.x;
      U.uCirrusSun.value.y += _t[1] * _v.y;
      U.uCirrusSun.value.z += _t[2] * _v.z;
    }
    U.uCloudLight.value.lerpVectors(sunDir, moonDir, THREE.MathUtils.smoothstep(P.moonKey, 0.3, 0.7)).normalize();
    U.uCloudCover.value = P.clouds + (0.9 - P.clouds) * oc;
    U.uCloudOpacity.value = P.cloudOpacity;
    U.uCirrus.value = P.cirrus * (1 - oc);

    // the clear sky's fill, then the grey of rain made from it
    U.uOvercast.value = 0;
    this.hemiAverage(this.skyAvg);
    if (oc > 0.001) {
      // a little of the clear sky's colour shows through the grey
      const a = this.skyAvg;
      const l = Math.max(1e-6, LUM(a.x, a.y, a.z));
      const bright = l * 1.35 + clearKey * Math.max(0.12, S.sunDir.y) * 0.06;
      U.uOvercastCol.value.set(0.93 + 0.3 * (a.x / l - 1), 0.96 + 0.3 * (a.y / l - 1), 1.02 + 0.3 * (a.z / l - 1)).multiplyScalar(bright);
      U.uOvercast.value = oc;
      this.hemiAverage(this.skyAvg);
    }
    const sky = this.skyAvg;
    U.uCloudAmb.value.copy(sky).multiplyScalar(P.cloudAmb);

    // the lawn and trees far off, lit by the key light and the sky
    const kUp = (Math.max(0, S.sunDir.y) * S.sunIntensity) / Math.PI;
    const c = S.sunColor;
    U.uGround.value.set(GRASS[0] * (kUp * c.r + sky.x), GRASS[1] * (kUp * c.g + sky.y), GRASS[2] * (kUp * c.b + sky.z));
    U.uTreeCol.value.set(TREES[0] * (kUp * c.r + sky.x), TREES[1] * (kUp * c.g + sky.y), TREES[2] * (kUp * c.b + sky.z));

    // lights
    this.sun.color.copy(S.sunColor);
    this.sun.intensity = S.sunIntensity;
    this.sun.position.copy(S.sunDir).multiplyScalar(15);
    this.sun.target.position.set(0, 0, 0);
    const sr = P.shadowRadius * (1 + 1.5 * oc) * Math.max(0.6, this.shadowScale);
    this.sun.shadow.radius = sr;
    this.sun.shadow.intensity = P.shadowIntensity * (1 - 0.75 * oc);
    if (S.sunDir.distanceToSquared(this.lastShadowDir) > 1e-7) this.fitShadow();

    const skyLum = Math.max(1e-6, LUM(sky.x, sky.y, sky.z));
    this.hemi.color.setRGB(sky.x / skyLum, sky.y / skyLum, sky.z / skyLum);
    this.hemi.groundColor.setRGB(U.uGround.value.x / skyLum, U.uGround.value.y / skyLum, U.uGround.value.z / skyLum);
    this.hemi.intensity = P.hemi * Math.PI * skyLum * (1 + 0.4 * oc);
    this.scene.environmentIntensity = P.env * (1 + 0.3 * oc);

    S.night = P.night;
    S.exposure = P.exposure * (1 + 0.15 * oc);
    S.bloom = P.bloom * (1 - 0.4 * oc);
    S.skyColor.setRGB(sky.x, sky.y, sky.z);
    S.groundColor.setRGB(U.uGround.value.x, U.uGround.value.y, U.uGround.value.z);
    S.overcast = oc;
    S.envIntensity = this.scene.environmentIntensity;
    this.computeFog();
  }

  cloudLight(alt, mu, turb, sat, k, out) {
    transmittance(alt, mu, turb, _t);
    const l = LUM(_t[0], _t[1], _t[2]);
    if (l < 1e-6) return out.set(0, 0, 0);
    const r = _t[0] / l;
    const g = _t[1] / l;
    const b = _t[2] / l;
    return out.set(Math.max(0, 1 + (r - 1) * sat), Math.max(0, 1 + (g - 1) * sat), Math.max(0.03, 1 + (b - 1) * sat)).multiplyScalar(l * k);
  }

  // Fog takes the colour of the horizon the camera is looking towards.
  computeFog() {
    const P = this.cur;
    const U = this.uniforms;
    const acc = _q.set(0, 0, 0);
    for (const off of [-0.4, 0, 0.4]) {
      const a = this.viewAz + off;
      _v.set(Math.sin(a) * 0.9994, 0.035, -Math.cos(a) * 0.9994);
      skyRadiance(_v, U, _w);
      acc.add(_w);
    }
    acc.multiplyScalar(1 / 3);
    this.state.horizonColor.setRGB(acc.x, acc.y, acc.z);
    // haze over a few tens of metres is paler than the horizon itself
    const l = LUM(acc.x, acc.y, acc.z);
    acc.lerp(_w.setScalar(l), 0.3).multiplyScalar(P.fogGain);
    this.fog.color.setRGB(acc.x, acc.y, acc.z);
    this.fog.density = P.fog * (1 + 1.2 * this.oc.v);
    this.state.fogDensity = this.fog.density;
  }

  hemiAverage(out) {
    out.set(0, 0, 0);
    let wsum = 0;
    for (const { d, w } of HEMI_DIRS) {
      skyRadiance(d, this.uniforms, _v, 10);
      out.addScaledVector(_v, w);
      wsum += w;
    }
    return out.multiplyScalar(1 / wsum);
  }

  // Fits the shadow camera tightly round the garden box as seen from the light.
  fitShadow() {
    const cam = this.sun.shadow.camera;
    const dir = this.state.sunDir;
    this.lastShadowDir.copy(dir);
    const eye = _v.copy(dir).multiplyScalar(15);
    _m.lookAt(eye, _w.set(0, 0, 0), THREE.Object3D.DEFAULT_UP);
    _m.setPosition(eye);
    _m.invert();
    const b = SHADOW_BOX;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      _q.set(i & 1 ? b.x1 : b.x0, i & 2 ? b.y1 : b.y0, i & 4 ? b.z1 : b.z0).applyMatrix4(_m);
      x0 = Math.min(x0, _q.x);
      x1 = Math.max(x1, _q.x);
      y0 = Math.min(y0, _q.y);
      y1 = Math.max(y1, _q.y);
      z0 = Math.min(z0, _q.z);
      z1 = Math.max(z1, _q.z);
    }
    cam.left = x0;
    cam.right = x1;
    cam.bottom = y0;
    cam.top = y1;
    cam.near = Math.max(0.05, -z1 - 0.5);
    cam.far = -z0 + 0.5;
    cam.updateProjectionMatrix();
    this.sun.shadow.needsUpdate = true;
  }

  refreshEnv() {
    this.envDirty = false;
    this.envTimer = 0.4;
    this.cubeCam.update(this.renderer, this.envScene);
    this.envRT = this.pmrem.fromCubemap(this.cubeRT.texture, this.envRT);
    this.scene.environment = this.envRT.texture;
  }

  dispose() {
    this.group.removeFromParent();
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    for (const m of this.envScene.children) {
      m.geometry?.dispose();
      m.material?.dispose();
    }
    this.noise.dispose();
    this.cubeRT.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
    if (this.scene.environment === this.envRT?.texture) this.scene.environment = null;
    if (this.scene.fog === this.fog) this.scene.fog = null;
  }
}
