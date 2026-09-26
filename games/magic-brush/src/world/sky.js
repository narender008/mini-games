// A golden-hour sky: deep blue overhead fading through lavender to a warm
// peach horizon that glows gold towards the low sun, a soft sun disc with a
// wide halo, and slow cumulus clouds lit from the side, bright and golden at
// their edges towards the sun and a dusky rose-lavender away from it.
// The same colours feed the distant haze (skyHaze), so hills and the castle
// melt into the air the way far things do in late sun.
import * as THREE from 'three';

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform float uSkyTime;
uniform float uCloudCover;
float skH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float skN(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skH(i), skH(i + vec2(1, 0)), f.x), mix(skH(i + vec2(0, 1)), skH(i + vec2(1, 1)), f.x), f.y);
}
float skF(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * skN(p); p = p * 2.07 + vec2(17.1, 9.3); a *= 0.5; }
  return s;
}
vec3 skyBase(vec3 d) {
  float h = d.y;
  float mu = dot(d, uSunDir);
  float toward = smoothstep(-0.4, 1.0, mu);
  vec3 zenith = vec3(0.2, 0.34, 0.72);
  vec3 mid = mix(vec3(0.95, 0.7, 0.62), vec3(1.25, 0.8, 0.5), toward * 0.8);
  vec3 hor = mix(vec3(1.6, 1.0, 0.58), vec3(2.2, 1.25, 0.5), toward);
  vec3 c = mix(hor, mid, smoothstep(-0.02, 0.22, h));
  c = mix(c, zenith, smoothstep(0.25, 0.9, h));
  c += vec3(1.4, 0.85, 0.4) * pow(max(mu, 0.0), 6.0) * 0.45;
  c += vec3(2.2, 1.5, 0.8) * pow(max(mu, 0.0), 48.0) * 1.2;
  if (h < 0.0) c = mix(hor * 0.85, vec3(0.42, 0.34, 0.3), smoothstep(0.0, -0.25, h));
  return c;
}
vec3 skyHaze(vec3 d) {
  vec3 dd = normalize(vec3(d.x, max(d.y, 0.02) * 0.4, d.z));
  return skyBase(dd);
}
vec4 skyClouds(vec3 d) {
  if (d.y < 0.015) return vec4(0.0);
  vec2 uv = d.xz / (d.y + 0.09) * 0.55 + vec2(uSkyTime * 0.004, uSkyTime * 0.0015);
  float n = skF(uv * 1.3);
  float cover = uCloudCover;
  float dens = smoothstep(1.0 - cover, 1.0 - cover + 0.22, n);
  // light from the side: sample towards the sun
  vec2 sd = normalize(uSunDir.xz + 1e-4) * 0.08;
  float n2 = skF((uv + sd) * 1.3);
  float lit = clamp(0.5 + (n - n2) * 5.0, 0.0, 1.0);
  float mu = dot(d, uSunDir);
  vec3 dark = vec3(0.52, 0.44, 0.6);
  vec3 bright = mix(vec3(1.25, 0.95, 0.85), vec3(1.9, 1.25, 0.7), smoothstep(-0.2, 1.0, mu));
  vec3 col = mix(dark, bright, lit);
  // thin edges glow when the sun is behind them
  col += vec3(1.5, 1.0, 0.5) * pow(max(mu, 0.0), 6.0) * (1.0 - dens) * 1.5;
  float fade = smoothstep(0.015, 0.12, d.y);
  return vec4(col, dens * fade * 0.92);
}
`;

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
}`;

const FRAG = /* glsl */ `
uniform float uEnv;
varying vec3 vDir;
${SKY_GLSL}
void main() {
  vec3 d = normalize(vDir);
  vec3 c = skyBase(d);
  vec4 cl = skyClouds(d);
  c = mix(c, cl.rgb, cl.a);
  float mu = dot(d, uSunDir);
  if (uEnv < 0.5) {
    // the sun itself, softened by the haze low in the sky
    c += vec3(30.0, 22.0, 13.0) * smoothstep(0.99955, 0.99975, mu) * (1.0 - cl.a * 0.8);
  } else {
    c = min(c, vec3(3.0));
  }
  gl_FragColor = vec4(c, 1.0);
}`;

export class Sky {
  constructor() {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(-0.6, 0.27, 0.76).normalize() },
      uSkyTime: { value: 0 },
      uCloudCover: { value: 0.42 },
      uEnv: { value: 0 },
    };
    const geo = new THREE.SphereGeometry(900, 48, 24);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false }));
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  get sunDir() {
    return this.uniforms.uSunDir.value;
  }

  update(t) {
    this.uniforms.uSkyTime.value = t;
  }

  // an environment map from this sky over warm grass
  environment(renderer, size = 128) {
    const scene = new THREE.Scene();
    const u = { ...this.uniforms, uEnv: { value: 1 } };
    const sky = new THREE.Mesh(this.mesh.geometry, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, side: THREE.BackSide, depthWrite: false }));
    scene.add(sky);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(200, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.19, 0.1) }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    scene.add(ground);
    // warm lantern and window glints for eyes and glossy things to catch
    const glint = (x, y, z, s, c) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), new THREE.MeshBasicMaterial({ color: c }));
      m.position.set(x, y, z);
      scene.add(m);
    };
    glint(-6, 5, 6, 1.4, new THREE.Color(6, 4.4, 2.6));
    glint(5, 4, 5, 0.8, new THREE.Color(4, 3, 1.8));
    glint(3, 6, -7, 1.0, new THREE.Color(2.5, 2.2, 2.4));
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(scene, 0.02, 0.1, 1000, { size });
    pm.dispose();
    sky.material.dispose();
    return rt;
  }
}
