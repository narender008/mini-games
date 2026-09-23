// Building blocks for the worlds: a sky dome with sun, moon glow and stars,
// and fields of lit cloud puffs (soft impostor spheres shaded by the sun, so
// they read as real cumulus with bright tops and blue-grey bellies).
//
// A world module exports `create(ctx)` returning:
//   group      Object3D added to the scene (the backdrop)
//   envScene   a Scene rendered once into the environment map (sky only)
//   light      { sunDir: Vector3, sunColor, sunIntensity, skyColor, groundColor,
//                hemiIntensity, envIntensity, exposure, fillColor, fillIntensity }
//   update(dt, t, view)   view = { camera, halfW, halfH, dist, visibleAt(z) }
//   dispose()
// Optional: flash (0..1 read each frame for storm lightning), theme colours
// for the HUD: { accent }.
import * as THREE from 'three';

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = (modelMatrix * vec4(position, 0.0)).xyz;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99998, p.w);
}`;

const skyFragment = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunDisc;   // brightness of the disc (0 hides it)
uniform float uSunSize;   // angular radius (cos space)
uniform float uGlow;
uniform float uHorizonEl;
uniform float uTopEl;
uniform float uStars;
uniform float uTime;
uniform vec3 uBand;       // extra colour band just above the horizon
uniform float uBandAmt;
varying vec3 vDir;

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float t = clamp((el - uHorizonEl) / (uTopEl - uHorizonEl), 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.75));
  col = mix(col, uBand, uBandAmt * exp(-t * 7.0) * step(uHorizonEl, el));
  float below = clamp((uHorizonEl - el) * 4.0, 0.0, 1.0);
  col = mix(col, uGround, below);
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 60.0) * 0.6) * uGlow;
  col += uSunColor * smoothstep(uSunSize, uSunSize + 0.0004, sd) * uSunDisc;
  if (uStars > 0.0) {
    vec3 g = floor(d * 180.0);
    float h = hash(g);
    vec3 f = fract(d * 180.0) - 0.5;
    float star = step(0.985, h) * smoothstep(0.3, 0.0, length(f));
    float tw = 0.6 + 0.4 * sin(uTime * (2.0 + h * 5.0) + h * 40.0);
    col += vec3(0.9, 0.95, 1.0) * star * tw * uStars * (0.6 + 2.5 * fract(h * 13.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class SkyDome {
  constructor(o = {}) {
    this.uniforms = {
      uZenith: { value: new THREE.Color(o.zenith ?? '#2a74d8') },
      uHorizon: { value: new THREE.Color(o.horizon ?? '#bfe3ff') },
      uGround: { value: new THREE.Color(o.ground ?? '#dff1ff') },
      uSunDir: { value: (o.sunDir ?? new THREE.Vector3(0.4, 0.5, -0.75)).clone().normalize() },
      uSunColor: { value: new THREE.Color(o.sunColor ?? '#fff3d6') },
      uSunDisc: { value: o.sunDisc ?? 30 },
      uSunSize: { value: o.sunSize ?? 0.9994 },
      uGlow: { value: o.glow ?? 1 },
      uHorizonEl: { value: o.horizonEl ?? -0.35 },
      uTopEl: { value: o.topEl ?? 0.45 },
      uStars: { value: o.stars ?? 0 },
      uTime: { value: 0 },
      uBand: { value: new THREE.Color(o.band ?? '#ffffff') },
      uBandAmt: { value: o.bandAmt ?? 0 },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  // a copy for the environment map (same uniforms, so it stays in sync)
  clone() {
    const m = new THREE.Mesh(this.mesh.geometry, this.material);
    m.frustumCulled = false;
    return m;
  }

  update(t, camera) {
    this.uniforms.uTime.value = t;
    this.mesh.position.copy(camera.position);
  }
}

const cloudVertex = /* glsl */ `
attribute vec4 iPos;     // xyz, size
attribute vec4 iShade;   // height in cloud 0..1, seed, alpha, stretch
varying vec2 vUv;
varying vec4 vShade;
varying float vFog;
uniform float uFogNear;
uniform float uFogFar;
void main() {
  vec3 p = iPos.xyz;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * iPos.w * vec2(iShade.w, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vShade = iShade;
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
}`;

const cloudFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uLit;
uniform vec3 uShadow;
uniform vec3 uHaze;
uniform vec3 uSun;       // direction to the sun (world, camera looks down -z)
uniform float uRim;
uniform float uSoft;
uniform float uTime;
uniform float uFlash;    // storm lightning inside the clouds
uniform vec3 uFlashColor;
varying vec2 vUv;
varying vec4 vShade;
varying float vFog;
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
  float light = sunL * mix(0.45, 1.0, smoothstep(0.0, 0.85, h));
  vec3 col = mix(uShadow, uLit, light);
  // light scattered through thin edges
  col += uLit * pow(1.0 - dens, 2.0) * uRim;
  col += uFlashColor * uFlash * (0.4 + 0.6 * n) * (1.0 - h * 0.5);
  col = mix(col, uHaze, vFog);
  gl_FragColor = vec4(col, dens * vShade.z);
}`;

// A field of cumulus clouds built from lit puffs. Clouds drift sideways and
// wrap round; `bank` clouds form a flat carpet along the bottom of the view.
export class CloudField {
  constructor({ noise, lit = '#ffffff', shadow = '#9fb3cf', haze = '#cfe6ff', sun = new THREE.Vector3(0.4, 0.6, 0.6), rim = 0.25, soft = 0.35, fogNear = 40, fogFar = 220, capacity = 900, renderOrder = -5 } = {}) {
    this.capacity = capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    this.pos = new Float32Array(capacity * 4);
    this.shade = new Float32Array(capacity * 4);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 4).setUsage(THREE.DynamicDrawUsage);
    this.aShade = new THREE.InstancedBufferAttribute(this.shade, 4);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iShade', this.aShade);
    g.instanceCount = 0;
    this.uniforms = {
      uNoise: { value: noise },
      uLit: { value: new THREE.Color(lit) },
      uShadow: { value: new THREE.Color(shadow) },
      uHaze: { value: new THREE.Color(haze) },
      uSun: { value: sun.clone().normalize() },
      uRim: { value: rim },
      uSoft: { value: soft },
      uTime: { value: 0 },
      uFogNear: { value: fogNear },
      uFogFar: { value: fogFar },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color('#dfe8ff') },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: cloudVertex,
      fragmentShader: cloudFragment,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.geometry = g;
    this.clouds = [];
    this.puffs = [];
  }

  // Add one cloud. x, y: centre of its flat base; z: depth (negative = far).
  // w, h: size in world units. Returns the cloud so callers can move it.
  addCloud({ x, y, z, w, h, vx = 0, vy = 0, puffs = 0, alpha = 1, flat = 0.15, stretch = 1, rand = Math.random }) {
    const cloud = { x, y, z, w, h, vx, vy, list: [] };
    const count = puffs || Math.max(5, Math.round((w / h) * 7));
    for (let i = 0; i < count; i++) {
      const u = rand() * 2 - 1; // across the cloud
      const dome = 1 - u * u;
      const py = rand() * h * dome * (1 - flat) + h * flat * rand();
      const size = h * (0.45 + 0.5 * dome) * (0.8 + rand() * 0.45);
      cloud.list.push({
        dx: (u * w) / 2,
        dy: py + size * 0.15,
        dz: (rand() - 0.5) * Math.min(w, h) * 0.4,
        size,
        height: py / h,
        seed: rand(),
        alpha,
        stretch,
      });
    }
    // bottom puffs first so the bright tops are drawn over the bellies
    cloud.list.sort((a, b) => a.dy - b.dy);
    this.clouds.push(cloud);
    return cloud;
  }

  // Call once after adding clouds: sorts far to near for blending.
  finish() {
    this.clouds.sort((a, b) => a.z - b.z);
    this.puffs = [];
    for (const c of this.clouds) for (const p of c.list) this.puffs.push({ c, p });
    this.count = Math.min(this.capacity, this.puffs.length);
    for (let i = 0; i < this.count; i++) {
      const { p } = this.puffs[i];
      this.shade[i * 4] = p.height;
      this.shade[i * 4 + 1] = p.seed;
      this.shade[i * 4 + 2] = p.alpha;
      this.shade[i * 4 + 3] = p.stretch;
    }
    this.aShade.needsUpdate = true;
    this.geometry.instanceCount = this.count;
  }

  // wrap: { halfW(z) } returns half the visible width at a depth, to wrap
  // clouds round when they drift off one side.
  update(dt, t, wrap) {
    this.uniforms.uTime.value = t;
    for (const c of this.clouds) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (wrap) {
        const hw = wrap.halfW(c.z) + c.w * 0.6;
        if (c.x > hw) c.x -= hw * 2;
        if (c.x < -hw) c.x += hw * 2;
        if (wrap.wrapY) wrap.wrapY(c);
      }
    }
    for (let i = 0; i < this.count; i++) {
      const { c, p } = this.puffs[i];
      this.pos[i * 4] = c.x + p.dx;
      this.pos[i * 4 + 1] = c.y + p.dy;
      this.pos[i * 4 + 2] = c.z + p.dz;
      this.pos[i * 4 + 3] = p.size;
    }
    this.aPos.needsUpdate = true;
  }
}

// Half the visible width/height at depth z for a camera at distance `dist`
// looking down -z.
export function visibleAt(camera, dist, z) {
  const d = dist - z;
  const hh = d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return { halfH: hh, halfW: hh * camera.aspect };
}
