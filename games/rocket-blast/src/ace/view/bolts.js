// Bolts: one instanced quad batch, one draw call, for everything flat and
// bright in Ace Pilot. Each instance is a quad in the play plane with a
// shape id; the fragment shader draws the shape from signed distances, so
// 800 bullets cost one draw and no textures.
//
// Enemy bullets are drawn in layers that read on any backdrop: a white-hot
// core, a saturated coloured body, a thin DARK rim (it darkens what is
// behind, so orange balls stay readable over lava) and a soft coloured halo
// that bloom spreads further. That needs one blend mode that can both add
// light and darken: premultiplied alpha (src ONE, dst ONE_MINUS_SRC_ALPHA).
// A fragment writing alpha 0 is purely additive; alpha 1 is opaque.
//
// Shapes (SHAPE): ORB, NEEDLE (capsule along the velocity), BALL (big orb),
// BEAM (long ray from x0,y0 to x1,y1), BOLT (player shot, additive), LINE
// (dashed telegraph), ARC (energy shield arc), RING (shockwave / danger
// ring), GLOW (soft additive light), RETICLE (lock-on brackets), MISSILE.
import * as THREE from 'three';

export const SHAPE = { ORB: 0, NEEDLE: 1, BALL: 2, BEAM: 3, BOLT: 4, LINE: 5, ARC: 6, RING: 7, GLOW: 8, RETICLE: 9, MISSILE: 10, DISC: 11 };

const vertexShader = /* glsl */ `
attribute vec4 iA; // x, y, rotation, shape
attribute vec4 iB; // half extents of the quad (hx, hy), p0, p1
attribute vec4 iC; // rgb, p2
uniform float uZ;
varying vec2 vLocal;
varying vec4 vB;
varying vec4 vC;
varying float vShape;
void main() {
  vec2 local = position.xy * 2.0 * iB.xy;
  float c = cos(iA.z);
  float s = sin(iA.z);
  vec2 w = iA.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(w, uZ, 1.0);
  vLocal = local;
  vB = iB;
  vC = iC;
  vShape = iA.w;
}`;

const fragmentShader = /* glsl */ `
uniform float uTime;
varying vec2 vLocal;
varying vec4 vB;
varying vec4 vC;
varying float vShape;

// layered bullet: d is the distance from the centre line, R the body radius.
// White-hot core, saturated body, a dark tinted rim that is opaque enough to
// cut the bullet out of any backdrop, then only a faint halo (bloom does the
// rest), so hundreds of bullets never sum into a haze.
vec4 bullet(float d, float R, vec3 col, float hot) {
  float body = smoothstep(R, R * 0.86, d);
  float coreK = smoothstep(R * 0.42, R * 0.12, d);
  float rimOut = R * 1.38;
  float rim = smoothstep(rimOut, rimOut - R * 0.12, d) * (1.0 - body);
  float halo = exp(-max(d - rimOut, 0.0) / (R * 0.35)) * smoothstep(rimOut - R * 0.1, rimOut, d);
  vec3 bodyC = col * mix(1.25, 0.8, smoothstep(R * 0.3, R, d));
  vec3 c = bodyC * body * (1.0 - coreK) + vec3(1.0, 0.98, 0.95) * coreK * hot + col * 0.06 * rim + col * halo * 0.22;
  float a = max(body, rim * 0.88);
  return vec4(c, a);
}

void main() {
  int shape = int(vShape + 0.5);
  vec2 p = vLocal;
  vec3 col = vC.rgb;
  vec4 o = vec4(0.0);
  if (shape == 0) {
    // ORB: p0 = radius
    o = bullet(length(p), vB.z, col, 1.6);
  } else if (shape == 1) {
    // NEEDLE: capsule along x, p0 = half length of the spine, p1 = radius
    float d = length(vec2(max(abs(p.x) - vB.z, 0.0), p.y));
    o = bullet(d, vB.w, col, 1.7);
  } else if (shape == 2) {
    // BALL: big pulsing orb, p0 = radius, p1 = phase
    float R = vB.z * (1.0 + 0.06 * sin(uTime * 14.0 + vB.w));
    float d = length(p);
    o = bullet(d, R, col, 1.4);
    // a darker band inside the body so it reads as a sphere of plasma
    float band = smoothstep(R * 0.55, R * 0.75, d) * smoothstep(R, R * 0.85, d);
    o.rgb *= 1.0 - band * 0.35;
  } else if (shape == 3) {
    // BEAM: along x, p0 = half width, p1 = strength 0..1
    float w = vB.z;
    float along = 1.0 - smoothstep(vB.x - w * 1.5, vB.x, abs(p.x));
    float flick = 0.85 + 0.15 * sin(uTime * 60.0 + p.x * 3.0);
    float coreK = exp(-pow(p.y / (w * 0.28), 2.0));
    float bodyK = exp(-pow(p.y / w, 2.0));
    float halo = exp(-abs(p.y) / (w * 1.6));
    vec3 c = (vec3(1.0, 0.97, 0.94) * coreK * 3.0 + col * bodyK * 2.0 + col * halo * 0.5) * flick;
    o = vec4(c * along * vB.w, 0.0);
  } else if (shape == 4) {
    // BOLT: additive player shot, capsule p0 half spine, p1 radius
    float d = length(vec2(max(abs(p.x) - vB.z, 0.0), p.y));
    float R = vB.w;
    float coreK = smoothstep(R * 0.7, R * 0.15, d);
    float bodyK = smoothstep(R * 1.6, R * 0.5, d);
    float tail = 0.55 + 0.45 * smoothstep(-vB.z, vB.z, p.x);
    o = vec4((vec3(1.0) * coreK * 2.2 + col * bodyK * 1.6) * tail, 0.0);
  } else if (shape == 5) {
    // LINE: dashed telegraph, p0 = charge 0..1, p1 = thickness
    float k = vB.z;
    float th = vB.w * (1.0 + k * 1.5);
    float across = smoothstep(th, th * 0.3, abs(p.y));
    float dash = step(0.45, fract(p.x * 1.6 - uTime * 6.0));
    float solid = smoothstep(0.75, 0.95, k);
    float m = mix(dash, 1.0, solid);
    float pulse = 0.7 + 0.3 * sin(uTime * 30.0);
    float ends = smoothstep(vB.x, vB.x - 0.3, abs(p.x));
    vec3 c = col * across * m * (0.6 + 1.6 * k) * mix(1.0, pulse, solid) * ends;
    o = vec4(c + vec3(1.0) * solid * smoothstep(th * 0.4, 0.0, abs(p.y)) * ends, 0.0);
  } else if (shape == 6) {
    // ARC: energy shield facing +x, p0 = radius, p1 = half angle, p2 = strength
    float r = length(p);
    float a = abs(atan(p.y, p.x));
    float ang = smoothstep(vB.w, vB.w * 0.82, a);
    float band = exp(-pow((r - vB.z) / 0.07, 2.0));
    float inner = smoothstep(vB.z, vB.z - 0.3, r) * smoothstep(vB.z - 0.45, vB.z - 0.1, r) * 0.25;
    float hex = 0.6 + 0.4 * sin(atan(p.y, p.x) * 22.0 + uTime * 5.0) * sin(r * 30.0 - uTime * 3.0);
    float s = vC.a;
    o = vec4((col * (band * 2.2 + inner * hex) + vec3(1.0) * band * 0.8) * ang * s, 0.0);
  } else if (shape == 7) {
    // RING: p0 = radius, p1 = thickness, p2 = fill strength
    float r = length(p);
    float ring = exp(-pow((r - vB.z) / max(vB.w, 0.005), 2.0));
    float fill = smoothstep(vB.z, vB.z * 0.6, r) * vC.a;
    o = vec4(col * (ring + fill * 0.25), 0.0);
  } else if (shape == 8) {
    // GLOW: soft light, p0 = falloff radius
    float r = length(p) / vB.z;
    float g = exp(-r * r * 2.5) + 0.25 * exp(-r * 1.6);
    o = vec4(col * g, 0.0);
  } else if (shape == 9) {
    // RETICLE: four corner brackets, p0 = size, p1 = spin
    float ca = cos(vB.w);
    float sa = sin(vB.w);
    vec2 q = abs(vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y));
    float s = vB.z;
    float edge = max(smoothstep(0.035, 0.0, abs(q.x - s)) * step(s * 0.55, q.y) * step(q.y, s), smoothstep(0.035, 0.0, abs(q.y - s)) * step(s * 0.55, q.x) * step(q.x, s));
    float dot0 = smoothstep(0.08, 0.02, length(p));
    o = vec4(col * (edge + dot0) * 2.0, 0.0);
  } else if (shape == 10) {
    // MISSILE: grey body along +x with a hot tail, p0 = half length, p1 = radius
    float d = length(vec2(max(abs(p.x) - vB.z, 0.0), p.y));
    float body = smoothstep(vB.w, vB.w * 0.7, d) * step(-vB.z * 0.9, p.x);
    float nose = smoothstep(vB.z * 0.6, vB.z, p.x);
    vec3 bc = mix(vec3(0.75, 0.78, 0.82), col * 2.0, nose);
    float tail = exp(-pow(p.y / (vB.w * 0.8), 2.0)) * smoothstep(-vB.x, -vB.z, p.x) * step(p.x, -vB.z * 0.6);
    o = vec4(bc * body + vec3(1.0, 0.6, 0.2) * tail * 2.5, body);
  } else {
    // DISC: flat dark disc with a soft edge (shadows, burn marks), p0 = radius
    float r = length(p);
    float a = smoothstep(vB.z, vB.z * 0.5, r) * vC.a;
    o = vec4(col * a, a);
  }
  // fade everything to nothing before the quad's edge (no square halos)
  float qe = max(abs(p.x) / vB.x, abs(p.y) / vB.y);
  o *= smoothstep(1.0, 0.72, qe);
  if (o.a < 0.002 && dot(o.rgb, vec3(1.0)) < 0.002) discard;
  gl_FragColor = o;
}`;

export class Bolts {
  constructor({ capacity = 1024, renderOrder = 30, z = 0.6 } = {}) {
    this.capacity = capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    this.a = new Float32Array(capacity * 4);
    this.b = new Float32Array(capacity * 4);
    this.c = new Float32Array(capacity * 4);
    this.aA = new THREE.InstancedBufferAttribute(this.a, 4).setUsage(THREE.DynamicDrawUsage);
    this.aB = new THREE.InstancedBufferAttribute(this.b, 4).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.InstancedBufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', this.aA);
    g.setAttribute('iB', this.aB);
    g.setAttribute('iC', this.aC);
    g.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uZ: { value: z } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.geometry = g;
    this.n = 0;
  }

  begin(t) {
    this.n = 0;
    this.material.uniforms.uTime.value = t;
  }

  // one instance; returns false when full
  push(shape, x, y, rot, hx, hy, p0 = 0, p1 = 0, r = 1, g = 1, b = 1, p2 = 1) {
    const i = this.n;
    if (i >= this.capacity) return false;
    const a = this.a;
    const bb = this.b;
    const c = this.c;
    const k = i * 4;
    a[k] = x;
    a[k + 1] = y;
    a[k + 2] = rot;
    a[k + 3] = shape;
    bb[k] = hx;
    bb[k + 1] = hy;
    bb[k + 2] = p0;
    bb[k + 3] = p1;
    c[k] = r;
    c[k + 1] = g;
    c[k + 2] = b;
    c[k + 3] = p2;
    this.n = i + 1;
    return true;
  }

  // a ray between two points (beams, telegraph lines)
  ray(shape, x0, y0, x1, y1, halfWidth, p0, p1, r, g, b, p2 = 1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1e-4;
    return this.push(shape, (x0 + x1) / 2, (y0 + y1) / 2, Math.atan2(dy, dx), len / 2, halfWidth, p0, p1, r, g, b, p2);
  }

  glow(x, y, size, r, g, b) {
    return this.push(SHAPE.GLOW, x, y, 0, size, size, size * 0.5, 0, r, g, b, 0);
  }

  end() {
    this.geometry.instanceCount = this.n;
    this.aA.needsUpdate = true;
    this.aB.needsUpdate = true;
    this.aC.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
