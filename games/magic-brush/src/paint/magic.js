// The magic that finishes a painting: how much of a friend's outline the
// child has covered, a fill that spreads the child's own colours into
// whatever is left (every unpainted spot takes the colour of the nearest
// paint, found with a jump flood on the GPU, and is laid down with brush
// streaks so it still looks painted), the sweep that paints that fill in
// across the canvas while tidying away paint outside the outline, and the
// friend's skin: the finished painting as a colour texture, spread past the
// outline so nothing white creeps in at the edges.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const NOISE = /* glsl */ `
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n21(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}`;

// seeds: painted texels know where they are
const SEED_FRAG = /* glsl */ `
uniform sampler2D tP;
varying vec2 vUv;
void main() {
  vec4 P = texture2D(tP, vUv);
  float lum = dot(exp(-P.rgb), vec3(0.3, 0.5, 0.2));
  // only real colour counts (not faint ghosts or near-white glazes)
  bool seed = P.a > 0.35 && (lum < 0.93 || P.a > 0.8);
  gl_FragColor = seed ? vec4(vUv, 0.0, 1.0) : vec4(-10.0, -10.0, 0.0, 0.0);
}`;

const JFA_FRAG = /* glsl */ `
uniform sampler2D tSeed;
uniform vec2 uStep;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec4 best = texture2D(tSeed, vUv);
  vec2 d0 = (best.xy - vUv) * vec2(uAspect, 1.0);
  float bd = best.a > 0.5 ? dot(d0, d0) : 1e9;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    if (i == 0 && j == 0) continue;
    vec4 s = texture2D(tSeed, vUv + vec2(float(i), float(j)) * uStep);
    if (s.a < 0.5) continue;
    vec2 d = (s.xy - vUv) * vec2(uAspect, 1.0);
    float dd = dot(d, d);
    if (dd < bd) { bd = dd; best = s; }
  }
  gl_FragColor = best;
}`;

// the fill: each texel takes its nearest seed's colour, with a wobble so
// the borders between colours look like brushwork rather than a diagram
const FILL_FRAG = /* glsl */ `
uniform sampler2D tSeed;
uniform sampler2D tP;
uniform sampler2D tDefault;
uniform float uHasSeeds;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 wob = (vec2(n21(vUv * vec2(9.0, 40.0)), n21(vUv * vec2(9.0, 40.0) + 7.3)) - 0.5) * 0.03;
  vec4 s = texture2D(tSeed, clamp(vUv + wob, 0.0, 1.0));
  vec3 dens;
  if (uHasSeeds > 0.5 && s.a > 0.5) {
    vec4 P = texture2D(tP, s.xy);
    dens = P.rgb;
  } else {
    vec3 c = texture2D(tDefault, vUv).rgb;
    dens = -log(clamp(c, 0.004, 0.995));
  }
  gl_FragColor = vec4(dens, 1.0);
}`;

// the magic sweep: fill inside the outline behind the sweep line, tidy
// outside it (little ones), and leave brush texture in the new paint
const RAW_VERT = /* glsl */ `
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const SWEEP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tP;
uniform sampler2D tH;
uniform sampler2D tFill;
uniform sampler2D tMask;
uniform float uSweep;
uniform float uTidy;
uniform float uNow;
in vec2 vUv;
layout(location = 0) out vec4 oP;
layout(location = 1) out vec4 oH;
${NOISE}
void main() {
  vec4 P = texture(tP, vUv);
  vec4 H = texture(tH, vUv);
  float inside = texture(tMask, vUv).r;
  // soften the mask edge a touch
  float w = 1.5 / 512.0;
  inside = (inside * 2.0 + texture(tMask, vUv + vec2(w, 0.0)).r + texture(tMask, vUv - vec2(w, 0.0)).r
    + texture(tMask, vUv + vec2(0.0, w)).r + texture(tMask, vUv - vec2(0.0, w)).r) / 6.0;
  float wave = n21(vec2(vUv.y * 12.0, 3.0)) * 0.06;
  float swept = smoothstep(uSweep, uSweep - 0.05, vUv.x - wave);
  vec3 fill = texture(tFill, vUv).rgb;
  // streaks along the sweep, like one confident brush stroke
  float streak = n21(vec2(vUv.x * 30.0, vUv.y * 260.0));
  float need = inside * swept * (1.0 - smoothstep(0.55, 0.95, P.a));
  P.rgb = mix(P.rgb, fill * (0.92 + 0.16 * streak), need);
  P.a = max(P.a, need);
  H.r = max(H.r, need * (0.3 + 0.5 * streak));
  if (need > 0.01) H.g = uNow / 100.0;
  float tidy = (1.0 - inside) * swept * uTidy;
  P *= 1.0 - tidy * 0.97;
  H.r *= 1.0 - tidy;
  H.b *= 1.0 - tidy;
  oP = P;
  oH = H;
}`;

// the skin: painted colour inside, the fill outside
const SKIN_FRAG = /* glsl */ `
uniform sampler2D tP;
uniform sampler2D tFill;
uniform sampler2D tMask;
varying vec2 vUv;
void main() {
  vec4 P = texture2D(tP, vUv);
  vec3 fill = exp(-texture2D(tFill, vUv).rgb);
  float inside = texture2D(tMask, vUv).r;
  vec3 paint = exp(-P.rgb);
  vec3 c = mix(fill, paint, smoothstep(0.2, 0.7, P.a) * inside);
  gl_FragColor = vec4(c, 1.0);
}`;

// the painting as it looks on the primed canvas, for keeping
const LOOK_FRAG = /* glsl */ `
uniform sampler2D tP;
varying vec2 vUv;
void main() {
  vec4 P = texture2D(tP, vUv);
  vec3 primer = vec3(0.9, 0.885, 0.85);
  vec3 c = mix(primer, primer * exp(-P.rgb), clamp(P.a, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;

// coverage: painted texels inside the outline, and the outline's size
const COVER_FRAG = /* glsl */ `
uniform sampler2D tP;
uniform sampler2D tMask;
varying vec2 vUv;
void main() {
  float inside = texture2D(tMask, vUv).r;
  float a = texture2D(tP, vUv).a;
  gl_FragColor = vec4(inside * smoothstep(0.25, 0.6, a), inside, smoothstep(0.25, 0.6, a), 1.0);
}`;

export class Magic {
  constructor(renderer, engine) {
    this.renderer = renderer;
    this.engine = engine;
    const fw = 256;
    const fh = 192;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.seedA = new THREE.WebGLRenderTarget(fw, fh, opts);
    this.seedB = new THREE.WebGLRenderTarget(fw, fh, opts);
    this.fill = new THREE.WebGLRenderTarget(fw, fh, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
    this.skin = new THREE.WebGLRenderTarget(512, 384, { depthBuffer: false, generateMipmaps: false, colorSpace: THREE.SRGBColorSpace });
    this.cover = new THREE.WebGLRenderTarget(128, 96, { depthBuffer: false, generateMipmaps: false });
    this.coverData = new Uint8Array(128 * 96 * 4);
    const m = (fragmentShader, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, ...extra });
    this.seedMat = m(SEED_FRAG, { tP: { value: null } });
    this.jfaMat = m(JFA_FRAG, { tSeed: { value: null }, uStep: { value: new THREE.Vector2() }, uAspect: { value: 4 / 3 } });
    this.fillMat = m(FILL_FRAG, { tSeed: { value: null }, tP: { value: null }, tDefault: { value: null }, uHasSeeds: { value: 1 } });
    this.sweepMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: RAW_VERT,
      fragmentShader: SWEEP_FRAG,
      uniforms: { tP: { value: null }, tH: { value: null }, tFill: { value: this.fill.texture }, tMask: { value: null }, uSweep: { value: 0 }, uTidy: { value: 1 }, uNow: { value: 0 } },
      depthTest: false,
      depthWrite: false,
    });
    this.skinMat = m(SKIN_FRAG, { tP: { value: null }, tFill: { value: this.fill.texture }, tMask: { value: null } });
    this.coverMat = m(COVER_FRAG, { tP: { value: null }, tMask: { value: null } });
    this.lookMat = m(LOOK_FRAG, { tP: { value: null } });
    this.look = new THREE.WebGLRenderTarget(640, 480, { depthBuffer: false, generateMipmaps: false, colorSpace: THREE.SRGBColorSpace });
    this.copyMat = m('uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }', { t: { value: null } });
    this.quad = new FullScreenQuad(null);
    this.warm();
  }

  // Run every pass once (they are small) so their shaders are compiled while
  // the game loads, not in the middle of the sweep.
  warm() {
    const e = this.engine;
    const p = e.live.textures[0];
    this.seedMat.uniforms.tP.value = p;
    this._pass(this.seedMat, this.seedA);
    this.jfaMat.uniforms.tSeed.value = this.seedA.texture;
    this._pass(this.jfaMat, this.seedB);
    const f = this.fillMat.uniforms;
    f.tSeed.value = this.seedB.texture;
    f.tP.value = p;
    f.tDefault.value = p;
    this._pass(this.fillMat, this.fill);
    this.coverMat.uniforms.tP.value = p;
    this._pass(this.coverMat, this.cover);
    this.sweep(null, 0, true);
    this.skinMat.uniforms.tP.value = p;
    this._pass(this.skinMat, this.skin);
    this.lookMat.uniforms.tP.value = p;
    this._pass(this.lookMat, this.look);
    this.copyMat.uniforms.t.value = this.look.texture;
    this._pass(this.copyMat, this.cover);
    // the sweep drew into the live painting: clear it again
    e.clearAll();
  }

  _pass(mat, target) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    this.quad.material = mat;
    r.setRenderTarget(target);
    this.quad.render(r);
    r.setRenderTarget(prev);
  }

  // fraction of the outline painted (0..1), and how much paint there is at all
  coverage(mask) {
    const e = this.engine;
    this.coverMat.uniforms.tP.value = e.live.textures[0];
    this.coverMat.uniforms.tMask.value = mask;
    this._pass(this.coverMat, this.cover);
    this.renderer.readRenderTargetPixels(this.cover, 0, 0, 128, 96, this.coverData);
    let a = 0;
    let b = 0;
    let c = 0;
    const d = this.coverData;
    for (let i = 0; i < d.length; i += 4) {
      a += d[i];
      b += d[i + 1];
      c += d[i + 2];
    }
    return { inside: b > 0 ? a / b : 0, painted: c / (255 * 128 * 96) };
  }

  // the same, read back in the background (the GPU is a frame or two behind,
  // and reading it at once would stall the frame until it caught up)
  async coverageAsync(mask) {
    const e = this.engine;
    this.coverMat.uniforms.tP.value = e.live.textures[0];
    this.coverMat.uniforms.tMask.value = mask;
    this._pass(this.coverMat, this.cover);
    const d = new Uint8Array(128 * 96 * 4);
    await this.renderer.readRenderTargetPixelsAsync(this.cover, 0, 0, 128, 96, d);
    let a = 0;
    let b = 0;
    let c = 0;
    for (let i = 0; i < d.length; i += 4) {
      a += d[i];
      b += d[i + 1];
      c += d[i + 2];
    }
    return { inside: b > 0 ? a / b : 0, painted: c / (255 * 128 * 96) };
  }

  // Work out the fill from the live painting. defaultTex: the friend's own
  // colours, used where nothing at all has been painted; mask: its outline.
  // It resolves a moment later, when the read-back has come.
  async prepare(defaultTex, mask) {
    const e = this.engine;
    this.seedMat.uniforms.tP.value = e.live.textures[0];
    this._pass(this.seedMat, this.seedA);
    let a = this.seedA;
    let b = this.seedB;
    for (let s = 128; s >= 1; s = Math.floor(s / 2)) {
      this.jfaMat.uniforms.tSeed.value = a.texture;
      this.jfaMat.uniforms.uStep.value.set(s / 256, s / 192);
      this._pass(this.jfaMat, b);
      [a, b] = [b, a];
    }
    this.seedResult = a;
    const cov = await this.coverageAsync(mask);
    const f = this.fillMat.uniforms;
    f.tSeed.value = a.texture;
    f.tP.value = e.live.textures[0];
    f.tDefault.value = defaultTex;
    f.uHasSeeds.value = cov.painted > 0.0015 ? 1 : 0;
    this._pass(this.fillMat, this.fill);
    return cov;
  }

  // draw the sweep at position x (0..1 across the canvas) into live
  sweep(mask, x, tidy) {
    const e = this.engine;
    const u = this.sweepMat.uniforms;
    u.tP.value = e.base.textures[0];
    u.tH.value = e.base.textures[1];
    u.tMask.value = mask;
    u.uSweep.value = x;
    u.uTidy.value = tidy ? 1 : 0;
    u.uNow.value = e.clock;
    this._pass(this.sweepMat, e.live);
    e.changed++;
  }

  // bake the friend's skin from the live painting
  bakeSkin(mask) {
    const e = this.engine;
    const u = this.skinMat.uniforms;
    u.tP.value = e.live.textures[0];
    u.tMask.value = mask;
    this._pass(this.skinMat, this.skin);
    return this.skin.texture;
  }

  // A render target as an upright JPEG data URL. Neither the read-back nor
  // the encoding stalls the frame: the pixels come back when the GPU has
  // caught up, and the browser encodes them off the main thread.
  async _image(target, quality) {
    const w = target.width;
    const h = target.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    // the pixels are read straight into the canvas's own image data, then turned upright and made opaque in place
    const img = g.createImageData(w, h);
    await this.renderer.readRenderTargetPixelsAsync(target, 0, 0, w, h, img.data);
    const row = w * 4;
    const tmp = new Uint8ClampedArray(row);
    for (let y = 0; y < h >> 1; y++) {
      const a = img.data.subarray(y * row, (y + 1) * row);
      const b = img.data.subarray((h - 1 - y) * row, (h - y) * row);
      tmp.set(a);
      a.set(b);
      b.set(tmp);
    }
    // (opaque alpha, a whole pixel at a time)
    const px = new Uint32Array(img.data.buffer);
    const opaque = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1 ? 0xff000000 : 0x000000ff;
    for (let i = 0; i < px.length; i++) px[i] |= opaque;
    g.putImageData(img, 0, 0);
    return new Promise((resolve, reject) =>
      c.toBlob((blob) => {
        if (!blob) return reject(new Error('no image'));
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      }, 'image/jpeg', quality),
    );
  }

  // the friend's skin as a JPEG data URL (upright), kept with the friend
  skinImage(quality = 0.86) {
    return this._image(this.skin, quality);
  }

  // the whole painting as a JPEG data URL, for keeping
  paintingImage(quality = 0.86) {
    this.lookMat.uniforms.tP.value = this.engine.live.textures[0];
    this._pass(this.lookMat, this.look);
    return this._image(this.look, quality);
  }

  // the part of the canvas that has paint on it, [u0, v0, u1, v1], or null
  paintedRect() {
    this.coverage(null);
    const d = this.coverData;
    let x0 = 128, y0 = 96, x1 = -1, y1 = -1;
    let n = 0;
    for (let y = 0; y < 96; y++)
      for (let x = 0; x < 128; x++) {
        if (d[(y * 128 + x) * 4 + 2] < 128) continue;
        n++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    if (n < 12) return null;
    return [x0 / 128, y0 / 96, (x1 + 1) / 128, (y1 + 1) / 96];
  }

  // the painted texels as a 128 x 96 map (1 = paint), after paintedRect/coverage
  paintedMap() {
    const d = this.coverData;
    const out = new Uint8Array(128 * 96);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 2] > 127 ? 1 : 0;
    return out;
  }

  // a standalone copy of the current skin texture (the target is reused)
  skinCopy() {
    const w = this.skin.width;
    const h = this.skin.height;
    const t = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, generateMipmaps: false, colorSpace: THREE.SRGBColorSpace });
    this.copyMat.uniforms.t.value = this.skin.texture;
    this._pass(this.copyMat, t);
    return t;
  }

  dispose() {
    for (const t of [this.seedA, this.seedB, this.fill, this.skin, this.cover, this.look]) t.dispose();
    for (const m of [this.seedMat, this.jfaMat, this.fillMat, this.sweepMat, this.skinMat, this.coverMat, this.lookMat]) m.dispose();
    this.quad.dispose();
  }
}
