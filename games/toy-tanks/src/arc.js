// The white dotted arc from the picture: rounded white dashes along the path
// the next shot will take, marching slowly towards where it will land. Drawn
// after the lens pass (always crisp), hidden where the ground or a hill is in
// front of it, with a soft dark edge so it reads over snow and sand too.
import * as THREE from 'three';
import { LAYER_SOFT, SOFT_DEPTH_GLSL } from './post.js';

const MAX_DASHES = 120;
const DASH = 0.02;
const GAP = 0.016;

const VERT = /* glsl */ `
attribute vec4 aDash;   // centre x, y, z and alpha
attribute vec3 aDir;    // unit tangent
uniform float uLen;
uniform float uWidth;
varying vec2 vUv;
varying float vAlpha;
varying float vDepth;
void main() {
  vec3 c = aDash.xyz;
  vec3 view = normalize(cameraPosition - c);
  vec3 side = normalize(cross(view, aDir));
  float len = uLen * (0.55 + 0.45 * aDash.w);
  vec3 p = c + aDir * position.x * (len + uWidth) + side * position.y * uWidth * 1.6;
  vUv = vec2(position.x * (len + uWidth) / uWidth, position.y * 1.6);
  vAlpha = aDash.w;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
${SOFT_DEPTH_GLSL}
uniform float uHalf;    // half the dash length in widths
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
varying float vDepth;
void main() {
  // a capsule: distance from the segment along x
  vec2 q = vec2(max(abs(vUv.x) - uHalf, 0.0), vUv.y);
  float d = length(q);
  float body = 1.0 - smoothstep(0.78, 0.98, d);
  float edge = 1.0 - smoothstep(0.98, 1.55, d);
  float a = max(body, edge * 0.28) * vAlpha * uOpacity * softFade(vDepth, 0.03);
  if (a < 0.003) discard;
  vec3 col = mix(vec3(0.05, 0.06, 0.08), vec3(1.0, 1.0, 0.98) * 1.6, body);
  gl_FragColor = vec4(col * a, a);
}`;

export class Arc {
  constructor(scene, softUniforms) {
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(2, 2);
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    this.dash = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DASHES * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.dir = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DASHES * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aDash', this.dash);
    geo.setAttribute('aDir', this.dir);
    geo.instanceCount = 0;
    const width = 0.0042;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...softUniforms,
        uLen: { value: DASH / 2 },
        uWidth: { value: width },
        uHalf: { value: DASH / 2 / width },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER_SOFT);
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
    this.geo = geo;
    this.opacity = 0;
    this.shown = false;
    this.march = 0;
  }

  // points: flat x, y pairs in the lane (z = 0); n: how many; fraction: how
  // much of the path to show (1 = all the way to where it lands)
  set(points, n, fraction = 1) {
    this.points = points;
    this.n = n;
    this.fraction = fraction;
  }

  show(on) {
    this.shown = on;
  }

  update(dt) {
    this.opacity += ((this.shown ? 1 : 0) - this.opacity) * Math.min(1, dt * 10);
    this.material.uniforms.uOpacity.value = this.opacity;
    if (this.opacity < 0.01 || !this.points || this.n < 2) {
      this.geo.instanceCount = 0;
      return;
    }
    this.march = (this.march + dt * 0.05) % (DASH + GAP);
    const P = this.points;
    // total length, to know where to stop and fade
    let total = 0;
    for (let i = 1; i < this.n; i++) total += Math.hypot(P[i * 2] - P[i * 2 - 2], P[i * 2 + 1] - P[i * 2 - 1]);
    const show = total * this.fraction;
    const D = this.dash.array;
    const R = this.dir.array;
    let k = 0;
    let s = 0;
    let next = 0.045 + this.march;
    for (let i = 1; i < this.n && k < MAX_DASHES; i++) {
      const x0 = P[i * 2 - 2];
      const y0 = P[i * 2 - 1];
      const dx = P[i * 2] - x0;
      const dy = P[i * 2 + 1] - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      while (next <= s + len && next <= show && k < MAX_DASHES) {
        const f = (next - s) / len;
        // fade in near the barrel and out at the end of what is shown
        const a = Math.min(1, (next - 0.03) / 0.06) * Math.min(1, (show - next) / Math.max(0.04, show * (this.fraction < 1 ? 0.35 : 0.08)));
        D[k * 4] = x0 + dx * f;
        D[k * 4 + 1] = y0 + dy * f;
        D[k * 4 + 2] = 0;
        D[k * 4 + 3] = Math.max(0, a);
        R[k * 3] = dx / len;
        R[k * 3 + 1] = dy / len;
        R[k * 3 + 2] = 0;
        k++;
        next += DASH + GAP;
      }
      s += len;
      if (s > show) break;
    }
    this.geo.instanceCount = k;
    this.dash.addUpdateRange(0, k * 4);
    this.dir.addUpdateRange(0, k * 3);
    this.dash.needsUpdate = true;
    this.dir.needsUpdate = true;
  }
}
