// Camera-facing sprites drawn in one call per batch: glows, sparks, rings,
// smoke and cloud puffs. Callers add particles with a lifetime and simple
// motion; the batch moves, fades and draws them.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iSizeRot; // w, h, rotation, frame
attribute vec4 iColor;   // rgb (may exceed 1 for bloom), alpha
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSizeRot.z);
  float s = sin(iSizeRot.z);
  vec2 q = position.xy * iSizeRot.xy;
  mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  gl_Position = projectionMatrix * mv;
  float f = iSizeRot.w;
  vec2 cell = vec2(mod(f, 4.0), 3.0 - floor(f / 4.0));
  vUv = (cell + uv) / 4.0;
  vColor = iColor;
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform float uSoft;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vColor.a;
  if (a < 0.003) discard;
  // the atlas shapes are white, so only their alpha is used (the colour of
  // fully transparent texels is black and would darken small mip levels)
  gl_FragColor = vec4(vColor.rgb * mix(1.0, a, uSoft), a);
}`;

export class SpriteBatch {
  // blending: 'add' for light, 'alpha' for smoke and clouds
  constructor(texture, { capacity = 1024, blending = 'add', renderOrder = 10, depthTest = true } = {}) {
    this.capacity = capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    this.pos = new Float32Array(capacity * 3);
    this.sr = new Float32Array(capacity * 4);
    this.col = new Float32Array(capacity * 4);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSr = new THREE.InstancedBufferAttribute(this.sr, 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iSizeRot', this.aSr);
    g.setAttribute('iColor', this.aCol);
    g.instanceCount = 0;
    const add = blending === 'add';
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture }, uSoft: { value: add ? 1 : 0 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.geometry = g;
    this.list = [];
  }

  // p: { x, y, z, vx, vy, vz, size, grow, w?, h?, rot, spin, life, frame,
  //      r, g, b, a, fadeIn, drag, gravity, align (rotate along velocity),
  //      twinkle, curve (alpha shape: 'out' | 'inout') }
  // life 0 draws the sprite for one frame only.
  add(p) {
    if (this.list.length >= this.capacity) this.list.shift();
    p.age = 0;
    p.vx ??= 0;
    p.vy ??= 0;
    p.vz ??= 0;
    p.rot ??= 0;
    p.spin ??= 0;
    p.grow ??= 0;
    p.drag ??= 0;
    p.gravity ??= 0;
    p.a ??= 1;
    p.fadeIn ??= 0;
    p.stretch ??= 1;
    this.list.push(p);
    return p;
  }

  clear() {
    this.list.length = 0;
  }

  update(dt) {
    const list = this.list;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.life === 0) {
        // a single-frame sprite (glows that follow a moving object)
        if (p.seen) continue;
        p.seen = true;
      } else {
        p.age += dt;
        if (p.age >= p.life) continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.vz *= k;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      if (p.onUpdate) p.onUpdate(p, dt);
      list[n++] = p;
    }
    list.length = n;
    const count = Math.min(n, this.capacity);
    for (let i = 0; i < count; i++) {
      const p = list[i];
      const k = p.life ? p.age / p.life : 0;
      let alpha = p.curve === 'inout' ? Math.sin(Math.PI * k) : 1 - k * k;
      if (p.fadeIn) alpha *= Math.min(1, p.age / p.fadeIn);
      if (p.twinkle) alpha *= 0.55 + 0.45 * Math.sin(p.age * p.twinkle + p.x * 3.1);
      const size = p.size * (1 + p.grow * k);
      let rot = p.rot;
      let w = (p.w ?? 1) * size;
      const h = (p.h ?? 1) * size;
      if (p.align) {
        rot = Math.atan2(p.vy, p.vx);
        w *= p.stretch;
      }
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.sr[i * 4] = w;
      this.sr[i * 4 + 1] = h;
      this.sr[i * 4 + 2] = rot;
      this.sr[i * 4 + 3] = p.frame;
      this.col[i * 4] = p.r;
      this.col[i * 4 + 1] = p.g;
      this.col[i * 4 + 2] = p.b;
      this.col[i * 4 + 3] = p.a * alpha;
    }
    this.geometry.instanceCount = count;
    this.aPos.needsUpdate = true;
    this.aSr.needsUpdate = true;
    this.aCol.needsUpdate = true;
  }
}
