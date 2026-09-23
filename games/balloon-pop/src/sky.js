// Storm-to-sunset sky dome with layered, self-shadowed clouds. The clouds
// are projected onto horizontal planes at altitude, so they foreshorten
// naturally towards the horizon, and are lit from the low sun: dark
// indigo storm bellies on the left, rose and gold edges near the sun.
import * as THREE from 'three';
import { ATMO_GLSL, SKY_LUT_MIN_EL } from './atmosphere.js';
import { glslVec3 } from './config.js';

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = (modelMatrix * vec4(position, 0.0)).xyz;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99998, p.w); // pin to the far plane
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D uLut;
uniform sampler2D uNoise;
uniform float uTime;
uniform float uCloudDetail; // 1 = full quality, 0 = cheap
varying vec3 vDir;
${ATMO_GLSL}

const float MIN_EL = ${SKY_LUT_MIN_EL.toFixed(4)};

vec3 skyBase(vec3 d) {
  float az = atmoAzimuth(d);
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec2 uv = vec2(az / 3.14159265, (el - MIN_EL) / (1.5708 - MIN_EL));
  return texture2D(uLut, uv).rgb;
}

float n2(vec2 p) { return texture2D(uNoise, p).r; }

// Billowy fbm for the storm clouds.
float cloudFbm(vec2 p) {
  float v = texture2D(uNoise, p).g * 0.5;
  v += texture2D(uNoise, p * 2.03 + vec2(0.31, 0.17)).r * 0.25;
  v += texture2D(uNoise, p * 4.11 + vec2(0.73, 0.41)).b * 0.14;
  if (uCloudDetail > 0.5) {
    v += texture2D(uNoise, p * 8.37 + vec2(0.11, 0.83)).a * 0.07;
    v += texture2D(uNoise, p * 17.1 + vec2(0.57, 0.29)).b * 0.04;
  } else {
    v += 0.055;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyBase(d);
  float az = atmoAzimuth(d);
  float sunDot = max(dot(d, ATMO_SUN), 0.0);
  float towardSun = smoothstep(1.7, 0.2, az);

  // Warm Mie glow round the sun, strongest along the horizon.
  float horizonBand = exp(-max(d.y, 0.0) * 9.0);
  col += ATMO_SUN_COLOR * (pow(sunDot, 5.0) * 0.28 + pow(sunDot, 40.0) * 0.55) * (0.35 + 0.65 * horizonBand);
  col += ATMO_SUN_COLOR * pow(sunDot, 900.0) * 30.0 * smoothstep(-0.01, 0.01, d.y);

  if (d.y > 0.0) {
    float t = uTime;

    // --- Low storm layer: heavy cumulus bellies. ---
    float h1 = 900.0;
    vec2 p1 = d.xz / (d.y + 0.035) * h1;
    vec2 q1 = p1 * 0.00016 + vec2(t * 0.0009, t * 0.0002);
    float n1 = cloudFbm(q1);
    // more cloud away from the sun and overhead; the sunset gap stays clearer
    float cover = mix(0.43, 0.63, towardSun) - smoothstep(0.25, 0.9, d.y) * 0.08;
    float dens1 = smoothstep(cover, cover + 0.22, n1);
    // light marching towards the sun (two taps) for self-shadowing
    vec2 sunStep = normalize(ATMO_SUN.xz) * 0.012;
    float s1 = smoothstep(cover, cover + 0.22, cloudFbm(q1 + sunStep));
    float s2 = smoothstep(cover, cover + 0.22, cloudFbm(q1 + sunStep * 2.3));
    float shadow = exp(-(s1 * 1.4 + s2 * 0.9));
    float thin = 1.0 - dens1;
    vec3 stormDark = mix(${glslVec3('#0f1333')}, ${glslVec3('#2a1726')}, towardSun);
    vec3 stormLit = mix(${glslVec3('#6a6aa0')}, ${glslVec3('#f0a07a')}, towardSun);
    float lit = shadow * (0.25 + 0.75 * towardSun) * (0.45 + 0.55 * thin);
    vec3 c1 = mix(stormDark, stormLit, lit);
    // silver lining on thin edges facing the sun
    c1 += ATMO_SUN_COLOR * pow(thin, 2.5) * pow(sunDot, 3.0) * 1.3 * shadow;
    // underside catches the warm horizon light
    c1 += skyBase(vec3(d.x, 0.02, d.z)) * 0.18 * (1.0 - dens1 * 0.5);
    float far1 = smoothstep(0.015, 0.14, d.y);
    float a1 = dens1 * far1 * 0.96;
    col = mix(col, c1, a1);

    // --- High streaky layer: pink-lit altostratus, stretched by wind. ---
    float h2 = 3200.0;
    vec2 p2 = d.xz / (d.y + 0.02) * h2;
    vec2 q2 = vec2(p2.x * 0.00003, p2.y * 0.00012) + vec2(t * 0.00035, 0.0);
    float n3 = texture2D(uNoise, q2).r * 0.65 + texture2D(uNoise, q2 * 3.1 + 0.4).b * 0.35;
    float dens2 = smoothstep(0.52, 0.8, n3) * (1.0 - dens1 * 0.8);
    vec3 c2 = mix(${glslVec3('#6d6aa5')}, ${glslVec3('#f7b894')}, towardSun) * (0.7 + 0.5 * pow(sunDot, 2.0));
    col = mix(col, c2, dens2 * 0.55 * smoothstep(0.02, 0.2, d.y));

    // --- Horizon streaks: long low bands of lit mist. ---
    float el = d.y;
    float band = smoothstep(0.0, 0.02, el) * smoothstep(0.1, 0.03, el);
    float streak = texture2D(uNoise, vec2(az * 0.9 + t * 0.0003, el * 9.0)).r;
    streak = smoothstep(0.45, 0.8, streak) * band;
    vec3 streakCol = mix(${glslVec3('#8f8bbb')}, ${glslVec3('#ffd8b0')}, towardSun);
    col = mix(col, streakCol, streak * 0.45);
  }

  // Bright horizon haze line where sky meets the misty sea.
  float horizonGlow = exp(-abs(d.y) * 60.0);
  col = mix(col, atmoHaze(d) * 1.08, horizonGlow * 0.55);

  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor({ lut, noise, detail = 1 }) {
    this.uniforms = {
      uLut: { value: lut },
      uNoise: { value: noise },
      uTime: { value: 0 },
      uCloudDetail: { value: detail },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), material);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sky';
  }

  update(time, camera) {
    this.uniforms.uTime.value = time;
    this.mesh.position.copy(camera.position);
  }
}
