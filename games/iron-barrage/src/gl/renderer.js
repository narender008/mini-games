// The frame: sky, parallax backdrop, back smoke, the ground, props, wrecks
// and tanks, debris, smoke and dust, fire and sparks, weather, then heat
// shimmer, bloom and the film grade. Lit in linear HDR when the device can
// render to half floats.
import { createContext, program, texture, Target } from './gl.js';
import * as S from './shaders.js';
import { BACKDROP_BAKE } from './bake.js';
import { WORLD, clamp } from '../config.js';

const byScore = (a, b) => b.score - a.score;
// shared defaults for the look uniforms (no allocation per frame)
const ZERO4 = new Float32Array(4);
const MIST4 = new Float32Array([0.3, 6, 0, 0]);
const ACC3 = new Float32Array([0.2, 0.17, 0.12]);
const SKYA0 = new Float32Array([0.04, 0, 0, 0]);
const SKYB0 = new Float32Array([0, 1, 0, 0]);
const FRAME_FLOATS = 4 * (8 + S.MAX_LIGHTS * 2);

// Stride of the per-instance buffers, in floats.
export const SPRITE_STRIDE = 20;
export const PARTICLE_STRIDE = 12;
export const DECAL_STRIDE = 12;

// A growable list of instances in one typed array; cleared every frame.
export class InstanceList {
  constructor(stride, cap = 256) {
    this.stride = stride;
    this.data = new Float32Array(stride * cap);
    this.count = 0;
  }
  clear() {
    this.count = 0;
  }
  alloc() {
    if ((this.count + 1) * this.stride > this.data.length) {
      const d = new Float32Array(this.data.length * 2);
      d.set(this.data);
      this.data = d;
    }
    return this.count++ * this.stride;
  }
}

// Lights gathered for this frame; the brightest ones near the view are sent.
export class LightList {
  constructor(max) {
    this.max = max;
    this.pool = [];
    this.n = 0;
  }
  clear() {
    this.n = 0;
  }
  add(x, y, z, radius, r, g, b, wrap = 0.3) {
    if (radius <= 0 || r + g + b <= 0.001) return;
    let l = this.pool[this.n];
    if (!l) l = this.pool[this.n] = { x: 0, y: 0, z: 0, radius: 0, r: 0, g: 0, b: 0, wrap: 0, score: 0 };
    this.n++;
    l.x = x;
    l.y = y;
    l.z = z;
    l.radius = radius;
    l.r = r;
    l.g = g;
    l.b = b;
    l.wrap = wrap;
  }
}

function makeNoise(gl) {
  // Four tiling noise channels: smooth fbm (r, g), finer fbm (b) and cells (a).
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const lattice = (period, seed) => {
    const v = new Float32Array(period * period);
    let s = seed;
    for (let i = 0; i < v.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      v[i] = s / 4294967296;
    }
    return v;
  };
  const value = (v, period, x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const i0 = ((xi % period) + period) % period;
    const j0 = ((yi % period) + period) % period;
    const i1 = (i0 + 1) % period;
    const j1 = (j0 + 1) % period;
    const a = v[j0 * period + i0];
    const b = v[j0 * period + i1];
    const c = v[j1 * period + i0];
    const d = v[j1 * period + i1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const fbm = (seed, base, oct, x, y) => {
    let a = 0;
    let w = 0.5;
    let p = base;
    let tot = 0;
    for (let o = 0; o < oct; o++) {
      const L = lats[seed + o] || (lats[seed + o] = lattice(p, 977 * (seed + o) + 13));
      a += w * value(L, p, (x / N) * p, (y / N) * p);
      tot += w;
      w *= 0.5;
      p *= 2;
    }
    return a / tot;
  };
  const lats = {};
  // cells for the alpha channel
  const cellsN = 24;
  const pts = [];
  let s = 12345;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < cellsN * cellsN; i++) pts.push([r(), r(), 0.18 + 0.5 * r() * r()]);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const k = (y * N + x) * 4;
      data[k] = fbm(0, 4, 5, x, y) * 255;
      data[k + 1] = fbm(10, 8, 4, x, y) * 255;
      data[k + 2] = fbm(20, 16, 4, x, y) * 255;
      const cx = (x / N) * cellsN;
      const cy = (y / N) * cellsN;
      // a stone in each cell, of its own size: 1 at its centre, 0 at its rim
      let best = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const gx = Math.floor(cx) + i;
          const gy = Math.floor(cy) + j;
          const p = pts[(((gy % cellsN) + cellsN) % cellsN) * cellsN + (((gx % cellsN) + cellsN) % cellsN)];
          const dx = gx + p[0] - cx;
          const dy = gy + p[1] - cy;
          const v = 1 - Math.sqrt(dx * dx + dy * dy) / p[2];
          if (v > best) best = v;
        }
      }
      data[k + 3] = clamp(best, 0, 1) * 255;
    }
  }
  return texture(gl, { w: N, h: N, data, wrap: gl.REPEAT, mips: true });
}

export class Renderer {
  constructor(canvas, quality) {
    this.canvas = canvas;
    this.q = quality;
    const gl = (this.gl = createContext(canvas));
    if (!gl) throw new Error('webgl2');
    this.frame = new Float32Array(FRAME_FLOATS);
    this.ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, this.frame.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo);

    const P = (src, name) => program(gl, src.vs, src.fs, name);
    this.p = {
      sky: P(S.SKY, 'sky'),
      bake: P(BACKDROP_BAKE, 'bake'),
      backdrop: P(S.BACKDROP, 'backdrop'),
      terrain: P(S.TERRAIN, 'terrain'),
      field: P(S.FIELD, 'field'),
      decal: P(S.DECAL, 'decal'),
      sprite: P(S.SPRITE, 'sprite'),
      lit: P(S.PARTICLE_LIT, 'lit'),
      hot: P(S.PARTICLE_HOT, 'hot'),
      weather: P(S.WEATHER, 'weather'),
      distort: P(S.DISTORT, 'distort'),
      bright: P(S.BRIGHT, 'bright'),
      down: P(S.DOWN, 'down'),
      up: P(S.UP, 'up'),
      composite: P(S.COMPOSITE, 'composite'),
      line: P(S.LINE, 'line'),
      solid: P(S.SOLID, 'solid'),
      blob: P(S.BLOB, 'blob'),
    };
    this.vao = gl.createVertexArray();
    this.noise = makeNoise(gl);
    this.blackTex(); // made now: making it mid-frame would take over a bound unit

    // instance buffers and their vertex arrays
    this.spriteVao = this.instanceVao(SPRITE_STRIDE, this.p.sprite, ['aA', 'aB', 'aC', 'aD', 'aE']);
    this.partVao = this.instanceVao(PARTICLE_STRIDE, this.p.lit, ['aA', 'aB', 'aC']);
    this.decalVao = this.instanceVao(DECAL_STRIDE, this.p.decal, ['aA', 'aB', 'aC']);
    this.blobVao = this.instanceVao(4, this.p.blob, ['aA']);
    this.lineBuf = gl.createBuffer();
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
    gl.bindVertexArray(null);

    this.scene = new Target(gl, 4, 4);
    this.distortT = gl.hdr ? new Target(gl, 4, 4, { internal: gl.RGBA16F }) : null;
    // bloom only means something over a half-float scene (an 8-bit one clips
    // before any threshold), so without HDR there are no bloom targets
    this.bloom = [];
    if (gl.hdr) for (let i = 0; i < 5; i++) this.bloom.push(new Target(gl, 4, 4));
    this.lights = new LightList(64);
    this.time = 0;
    this.cam = { x: 160, y: 50, viewW: 120, roll: 0 };
    this.flash = [1, 1, 1, 0];
    this.chroma = 0;
    this.layers = [];
    this.bf = null;
    this.atlas = null;
    this.lineData = new Float32Array(6 * 6 * 512);
    this.lineCount = 0;
    this.stats = { draws: 0 };
  }

  // Link checks happen after the driver has compiled in the background.
  ready() {
    for (const k in this.p) this.p[k].check();
  }

  instanceVao(stride, prog, names) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // fixed attribute locations shared by every instanced program
    names.forEach((n, i) => {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, stride * 4, i * 16);
      gl.vertexAttribDivisor(i, 1);
    });
    gl.bindVertexArray(null);
    return { vao, buf, size: 0 };
  }

  setAtlas(atlas) {
    this.atlas = atlas;
  }

  // ---- terrain textures
  initTerrain(terrain) {
    const gl = this.gl;
    this.terrain = terrain;
    const { cols, rows } = terrain;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (this.maskTex) gl.deleteTexture(this.maskTex);
    if (this.origTex) gl.deleteTexture(this.origTex);
    this.maskTex = texture(gl, { w: cols, h: rows, internal: gl.R8, format: gl.RED, data: terrain.mask });
    this.origTex = texture(gl, { w: cols, h: rows, internal: gl.R8, format: gl.RED, data: terrain.orig });
    // where the ground stood before the first shot, per column (metres): the
    // terrain shader reads its layers (and fresh earth in craters) from it
    const surf = terrain.surf0 || new Float32Array(cols);
    for (let i = 0; i < cols && !terrain.surf0; i++) {
      let j = rows - 1;
      while (j > 0 && terrain.orig[j * cols + i] <= 127) j--;
      const v = terrain.orig[j * cols + i] / 255;
      const above = j + 1 < rows ? terrain.orig[(j + 1) * cols + i] / 255 : 0;
      surf[i] = (j + v + above) / terrain.res;
    }
    if (this.surfTex) gl.deleteTexture(this.surfTex);
    this.surfTex = texture(gl, { w: cols, h: 1, internal: gl.R16F, format: gl.RED, type: gl.FLOAT, data: surf });
    const fr = this.q.fieldRes;
    if (!this.fieldT) this.fieldT = new Target(gl, 4, 4, { internal: gl.RGBA8 });
    this.fieldT.resize(WORLD.width * fr, WORLD.height * fr);
    if (!this.decalT) this.decalT = new Target(gl, 4, 4, { internal: gl.RGBA8 });
    this.decalT.resize(WORLD.width * 2, WORLD.height * 2);
    this.decalT.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    terrain.dirty = { x0: 0, y0: 0, x1: cols, y1: rows };
    this.fieldDirty = [0, 0, WORLD.width, WORLD.height];
  }

  // Sends the changed rows of the mask and redoes the field around them.
  syncTerrain() {
    const t = this.terrain;
    const d = t.dirty;
    if (!d) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, t.cols);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, d.x0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, d.y0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0, gl.RED, gl.UNSIGNED_BYTE, t.mask);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    const r = WORLD.res;
    // the sun march in the field shader reaches 0.6 + 27 * 27 * 0.075 = 55 m,
    // so ground that far from a change (away from the sun) needs redoing
    const pad = 56;
    const f = this.fieldDirty;
    const box = [d.x0 / r - pad, d.y0 / r - pad, d.x1 / r + pad, d.y1 / r + 10];
    if (f) {
      f[0] = Math.min(f[0], box[0]);
      f[1] = Math.min(f[1], box[1]);
      f[2] = Math.max(f[2], box[2]);
      f[3] = Math.max(f[3], box[3]);
    } else this.fieldDirty = box;
    t.dirty = null;
  }

  updateField() {
    const f = this.fieldDirty;
    if (!f) return;
    this.fieldDirty = null;
    const gl = this.gl;
    const x0 = clamp(f[0], 0, WORLD.width);
    const y0 = clamp(f[1], 0, WORLD.height);
    const x1 = clamp(f[2], 0, WORLD.width);
    const y1 = clamp(f[3], 0, WORLD.height);
    if (x1 <= x0 || y1 <= y0) return;
    this.fieldT.bind();
    gl.disable(gl.BLEND);
    const p = this.p.field;
    gl.useProgram(p.p);
    gl.uniform4f(p.u.uRect, x0, y0, x1, y1);
    this.tex(p, 'uMask', this.maskTex, 0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---- decals (scorch, blood, glow) painted into the battlefield overlay
  paintDecals(list) {
    if (!list.count) return;
    const gl = this.gl;
    this.decalT.bind();
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    const p = this.p.decal;
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(p.p);
    this.tex(p, 'uNoise', this.noise, 0);
    this.drawInstances(this.decalVao, list);
    gl.blendEquation(gl.FUNC_ADD);
    list.clear();
  }

  // Fades scorch, blood, wetness and glow by subtracting a little (8-bit maths
  // never reaches zero by multiplying).
  fadeDecals(scorch, blood, wet, glow) {
    const gl = this.gl;
    this.decalT.bind();
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
    gl.blendFunc(gl.ONE, gl.ONE);
    const p = this.p.solid;
    gl.useProgram(p.p);
    gl.uniform4f(p.u.uColor, scorch, blood, wet, glow);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.blendEquation(gl.FUNC_ADD);
  }

  // ---- battlefield look
  setBattlefield(bf) {
    this.bf = bf;
    const gl = this.gl;
    for (const l of this.layers) gl.deleteTexture(l.tex);
    this.layers = [];
    const fb = gl.createFramebuffer();
    for (const L of bf.layers) {
      const k = this.q.tier === 'low' ? 0.5 : 1;
      const w = Math.round((L.texW || 2048) * k);
      const h = Math.round((L.texH || 512) * k);
      const tex = texture(gl, { w, h, wrap: gl.REPEAT, wrapT: gl.CLAMP_TO_EDGE });
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      const p = this.p.bake;
      gl.useProgram(p.p);
      this.tex(p, 'uNoise', this.noise, 0);
      gl.uniform2f(p.u.uSize, L.width, L.height);
      gl.uniform1i(p.u.uKind, L.kind);
      gl.uniform1f(p.u.uSeed, L.seed);
      gl.uniform1f(p.u.uBase, L.base);
      gl.uniform1f(p.u.uAmp, L.amp);
      gl.uniform3fv(p.u.uCol, L.color);
      gl.uniform3fv(p.u.uCol2, L.color2 || L.color);
      gl.uniform3fv(p.u.uLit, L.lit || [1, 0.6, 0.3]);
      gl.uniform3fv(p.u.uCol3, L.color3 || L.color2 || L.color);
      gl.uniform3fv(p.u.uCol4, L.color4 || L.color);
      gl.uniform4fv(p.u.uP, L.p || [0, 0, 0, 0]);
      gl.uniform4fv(p.u.uQ, L.q || [0, 0, 0, 0]);
      gl.uniform3f(p.u.uLight, clamp(bf.sun[0] * 1.6, -1, 1), bf.sun[1], L.light ?? bf.layerLight ?? 1);
      const sm = L.smoke || [];
      const smk = new Float32Array(16);
      sm.slice(0, 4).forEach((s4, i) => smk.set(s4, i * 4));
      gl.uniform4fv(p.u.uSmoke, smk);
      gl.uniform4f(p.u.uSmokeA, Math.min(4, sm.length), L.smokeOp ?? 0.6, L.smokeBase ?? L.base, 0);
      gl.uniform3fv(p.u.uSmokeCol, L.smokeCol || [0.05, 0.05, 0.05]);
      gl.uniform4fv(p.u.uFire, L.fire || [60, 0, 0, 8]);
      gl.bindVertexArray(this.vao);
      // in strips, each flushed on its own: one draw over a whole 4096-wide
      // layer can run long enough on a phone GPU to trip its watchdog
      gl.enable(gl.SCISSOR_TEST);
      const strip = 512;
      for (let x = 0; x < w; x += strip) {
        gl.scissor(x, 0, Math.min(strip, w - x), h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.flush();
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.layers.push({ ...L, tex });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
  }

  resize(cssW, cssH, dpr) {
    const scale = Math.min(dpr, this.q.maxDpr);
    let w = cssW * scale;
    let h = cssH * scale;
    // the pixel cap first, the governor's scale on top of it: the other way
    // round, a big high-DPI screen stays capped and every governor step is lost
    const max = this.q.maxPixels;
    if (w * h > max) {
      const k = Math.sqrt(max / (w * h));
      w *= k;
      h *= k;
    }
    const gs = this.q.scale || 1;
    w = Math.round(w * gs);
    h = Math.round(h * gs);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.w = w;
    this.h = h;
    this.cssW = cssW;
    this.cssH = cssH;
    this.scene.resize(w, h);
    if (this.distortT) this.distortT.resize(w / 2, h / 2);
    for (let i = 0; i < this.bloom.length; i++) this.bloom[i].resize(w / 2 ** (i + 1), h / 2 ** (i + 1));
  }

  // screen (css px) <-> world
  toWorld(sx, sy, out = {}) {
    const c = this.cam;
    const mpp = c.viewW / this.cssW;
    out.x = c.x + (sx - this.cssW / 2) * mpp;
    out.y = c.y - (sy - this.cssH / 2) * mpp;
    return out;
  }
  toScreen(x, y, out = {}) {
    const c = this.cam;
    const ppm = this.cssW / c.viewW;
    out.x = this.cssW / 2 + (x - c.x) * ppm;
    out.y = this.cssH / 2 - (y - c.y) * ppm;
    return out;
  }
  viewH() {
    return (this.cam.viewW * this.cssH) / this.cssW;
  }

  tex(p, name, t, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(p.u[name], unit);
  }

  drawInstances(v, list) {
    const gl = this.gl;
    gl.bindVertexArray(v.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, v.buf);
    const n = list.count * list.stride;
    if (n > v.size) {
      v.size = list.data.length;
      gl.bufferData(gl.ARRAY_BUFFER, list.data.byteLength, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, list.data, 0, n);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, list.count);
    this.stats.draws++;
  }

  // ---- world-space line/triangle overlay (aim guide)
  lineBegin() {
    this.lineCount = 0;
  }
  // a thick segment as two triangles
  seg(x0, y0, x1, y1, w0, w1, r, g, b, a0, a1 = a0) {
    if (this.lineCount + 6 > this.lineData.length / 6) return;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const v = this.lineData;
    const k = this.lineCount * 6; // lineCount counts vertices, 6 floats each
    const P = this.segPts || (this.segPts = new Float32Array(18));
    P[0] = x0 + nx * w0; P[1] = y0 + ny * w0; P[2] = a0;
    P[3] = x0 - nx * w0; P[4] = y0 - ny * w0; P[5] = a0;
    P[6] = x1 + nx * w1; P[7] = y1 + ny * w1; P[8] = a1;
    P[9] = x1 + nx * w1; P[10] = y1 + ny * w1; P[11] = a1;
    P[12] = x0 - nx * w0; P[13] = y0 - ny * w0; P[14] = a0;
    P[15] = x1 - nx * w1; P[16] = y1 - ny * w1; P[17] = a1;
    for (let i = 0; i < 6; i++) {
      const o = k + i * 6;
      v[o] = P[i * 3];
      v[o + 1] = P[i * 3 + 1];
      v[o + 2] = r;
      v[o + 3] = g;
      v[o + 4] = b;
      v[o + 5] = P[i * 3 + 2];
    }
    this.lineCount += 6;
  }

  // ---- the frame
  render(s) {
    const gl = this.gl;
    if (gl.lost) return; // context lost: gl.js is asking for a reload
    const q = this.q;
    this.stats.draws = 0;
    const bf = this.bf;
    const c = this.cam;
    const W = this.w;
    const H = this.h;
    const ppm = W / c.viewW;
    // frame uniforms
    const F = this.frame;
    F[0] = c.x;
    F[1] = c.y;
    F[2] = (2 * ppm) / W;
    F[3] = (2 * ppm) / H;
    F[4] = Math.cos(c.roll);
    F[5] = Math.sin(c.roll);
    F[6] = this.time;
    F[7] = 1 / ppm;
    F.set(bf.sun, 8);
    F.set(bf.sunCol, 12);
    F.set(bf.sky, 16);
    F.set(bf.ground, 20);
    F.set(bf.fog, 24);
    F[28] = WORLD.width;
    F[29] = WORLD.height;
    F[30] = WORLD.res;
    // pick the lights that matter for this view
    const L = this.lights;
    const halfW = c.viewW / 2 + 20;
    const halfH = (c.viewW * H) / W / 2 + 20;
    const list = this.lightSel || (this.lightSel = []);
    list.length = 0;
    for (let i = 0; i < L.n; i++) {
      const l = L.pool[i];
      if (Math.abs(l.x - c.x) > halfW + l.radius || Math.abs(l.y - c.y) > halfH + l.radius) continue;
      l.score = (l.r + l.g + l.b) * l.radius;
      list.push(l);
    }
    if (list.length > q.lights) list.sort(byScore);
    const nl = Math.min(list.length, q.lights);
    F[31] = nl;
    for (let i = 0; i < nl; i++) {
      const l = list[i];
      const k = 32 + i * 8;
      F[k] = l.x;
      F[k + 1] = l.y;
      F[k + 2] = l.z;
      F[k + 3] = l.radius;
      F[k + 4] = l.r;
      F[k + 5] = l.g;
      F[k + 6] = l.b;
      F[k + 7] = l.wrap;
    }
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, F, 0, 32 + nl * 8);

    // terrain upkeep
    this.syncTerrain();
    this.updateField();
    if (s.decals) this.paintDecals(s.decals);

    gl.bindVertexArray(this.vao);
    this.scene.bind();
    gl.disable(gl.BLEND);

    // sky
    let p = this.p.sky;
    gl.useProgram(p.p);
    this.tex(p, 'uNoise', this.noise, 0);
    gl.uniform3fv(p.u.uZenith, bf.zenith);
    gl.uniform3fv(p.u.uHorizon, bf.horizon);
    gl.uniform3fv(p.u.uSunGlow, bf.sunGlow);
    gl.uniform2fv(p.u.uSunPos, bf.sunPos);
    gl.uniform4fv(p.u.uCloud, bf.cloud);
    gl.uniform3fv(p.u.uCloudCol, bf.cloudCol);
    gl.uniform1f(p.u.uStars, bf.stars || 0);
    gl.uniform4fv(p.u.uSkyA, bf.skyA || SKYA0);
    gl.uniform4fv(p.u.uSkyB, bf.skyB || SKYB0);
    gl.uniform1f(p.u.uAspect, W / H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // backdrop layers, far to near
    p = this.p.backdrop;
    gl.useProgram(p.p);
    const half = c.viewW / 2;
    // A tall (portrait) view shows more than the strip below each layer's
    // ground line; there the layers come down to sit on the lowest ground in view
    // (eased, so the hills passing underneath do not jolt them).
    const viewH = (c.viewW * H) / W;
    let fg = -1;
    if (H > W && this.terrain) {
      let g = Infinity;
      for (let i = 0; i <= 16; i++) g = Math.min(g, this.terrain.top(c.x - half + (c.viewW * i) / 16));
      this.bdropG = this.bdropG === undefined || Math.abs(this.bdropG - g) > 60 ? g : this.bdropG + (g - this.bdropG) * 0.08;
      fg = (this.bdropG - (c.y - viewH / 2)) / viewH;
    } else this.bdropG = undefined;
    for (const Lr of this.layers) {
      this.tex(p, 'uTex', Lr.tex, 0);
      const k = Lr.scale * Math.pow(60 / half, 1 - Lr.parallax);
      gl.uniform4f(p.u.uLayer, Lr.parallax, k, Lr.width, Lr.height);
      let anchor = Lr.anchorY;
      if (fg > 0) {
        const hh = (viewH / 2) * k; // half the layer's visible height, layer metres
        const cy = anchor + c.y * Lr.parallax;
        if ((hh - cy) / (2 * hh) > fg) anchor += hh * (1 - 2 * fg) - cy; // strip foot onto the ground line
      }
      gl.uniform2f(p.u.uAnchor, anchor, Lr.offsetX || 0);
      gl.uniform4fv(p.u.uHaze, Lr.haze);
      gl.uniform1f(p.u.uLightK, Lr.lightK ?? 0.05);
      gl.uniform4fv(p.u.uMist, Lr.mist || MIST4);
      gl.uniform4fv(p.u.uEmit, Lr.emit || ZERO4);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // far smoke columns
    if (s.litBack && s.litBack.count) this.drawParticles(this.p.lit, s.litBack, false);

    // ground
    p = this.p.terrain;
    gl.useProgram(p.p);
    this.tex(p, 'uMask', this.maskTex, 0);
    this.tex(p, 'uOrig', this.origTex, 1);
    this.tex(p, 'uField', this.fieldT.tex, 2);
    this.tex(p, 'uDecal', this.decalT.tex, 3);
    this.tex(p, 'uNoise', this.noise, 4);
    const m = bf.ground_;
    gl.uniform4fv(p.u.uTop, m.top);
    gl.uniform4fv(p.u.uSoil, m.soil);
    gl.uniform4fv(p.u.uDeep, m.deep);
    gl.uniform4fv(p.u.uRock, m.rock);
    gl.uniform4fv(p.u.uGrass, m.grass);
    this.tex(p, 'uSurf', this.surfTex, 5);
    gl.uniform4fv(p.u.uMat, m.mat || ZERO4);
    gl.uniform4fv(p.u.uMat2, m.mat2 || ZERO4);
    gl.uniform3fv(p.u.uAcc, m.acc || ACC3);
    gl.uniform3fv(p.u.uAcc2, m.acc2 || ACC3);
    gl.uniform1f(p.u.uWind, s.wind || 0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // contact shadows
    if (s.shadows && s.shadows.count) {
      p = this.p.blob;
      gl.useProgram(p.p);
      this.tex(p, 'uMask', this.maskTex, 0);
      this.tex(p, 'uField', this.fieldT.tex, 1);
      this.drawInstances(this.blobVao, s.shadows);
    }

    // props, wrecks, tanks, debris
    if (this.atlas) {
      p = this.p.sprite;
      gl.useProgram(p.p);
      this.tex(p, 'uAlbedo', this.atlas.albedo, 0);
      this.tex(p, 'uNormal', this.atlas.normal, 1);
      this.tex(p, 'uField', this.fieldT.tex, 2);
      this.tex(p, 'uNoise', this.noise, 3);
      for (const sl of s.sprites) if (sl.count) this.drawInstances(this.spriteVao, sl);
    }

    // smoke, dust, clods, blood
    if (s.lit && s.lit.count) this.drawParticles(this.p.lit, s.lit, false);
    // fire, sparks, flashes, embers
    // (fire covers what is behind it a little; sparks and glows only add)
    if (s.hot && s.hot.count) this.drawParticles(this.p.hot, s.hot, false);
    // aim guide
    if (this.lineCount) {
      p = this.p.line;
      gl.useProgram(p.p);
      gl.bindVertexArray(this.lineVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.lineData.subarray(0, this.lineCount * 6), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, this.lineCount);
    }
    // weather
    if (s.weather && s.weather.count) this.drawParticles(this.p.weather, s.weather, false);

    // heat shimmer and shock rings
    let useDistort = false;
    if (this.distortT && q.distort && s.distort && s.distort.count) {
      this.distortT.bind();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendFunc(gl.ONE, gl.ONE);
      this.drawParticles(this.p.distort, s.distort, false);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      useDistort = true;
    }

    // bloom (not without a half-float scene: see the constructor)
    const bloomOn = this.bloom.length > 0;
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    if (bloomOn) {
      const levels = q.bloomLevels;
      let b = this.bloom[0];
      b.bind();
      p = this.p.bright;
      gl.useProgram(p.p);
      this.tex(p, 'uScene', this.scene.tex, 0);
      gl.uniform2f(p.u.uTexel, 1 / this.scene.w, 1 / this.scene.h);
      gl.uniform1f(p.u.uThreshold, bf.bloomThreshold ?? 1.1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      p = this.p.down;
      gl.useProgram(p.p);
      for (let i = 1; i < levels; i++) {
        const src = this.bloom[i - 1];
        this.bloom[i].bind();
        this.tex(p, 'uTex', src.tex, 0);
        gl.uniform2f(p.u.uTexel, 1 / src.w, 1 / src.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      p = this.p.up;
      gl.useProgram(p.p);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = levels - 1; i > 0; i--) {
        const src = this.bloom[i];
        this.bloom[i - 1].bind();
        this.tex(p, 'uTex', src.tex, 0);
        gl.uniform2f(p.u.uTexel, 1 / src.w, 1 / src.h);
        gl.uniform1f(p.u.uWeight, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
    }

    // final picture
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    p = this.p.composite;
    gl.useProgram(p.p);
    this.tex(p, 'uScene', this.scene.tex, 0);
    this.tex(p, 'uBloom', bloomOn ? this.bloom[0].tex : this.blackTex(), 1);
    this.tex(p, 'uDistort', useDistort ? this.distortT.tex : this.blackTex(), 2);
    const g = bf.grade;
    gl.uniform4f(p.u.uPost, g.exposure * (s.exposure || 1), bloomOn ? g.bloom : 0, 0.004 + this.chroma, q.grain ? g.grain : 0);
    gl.uniform4fv(p.u.uFlash, this.flash);
    gl.uniform4f(p.u.uGrade, g.saturation * (s.saturation ?? 1), g.contrast, g.vignette, g.warmth);
    gl.uniform3fv(p.u.uLift, g.lift);
    gl.uniform3fv(p.u.uGain, g.gain);
    gl.uniform1f(p.u.uHdrScale, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  drawParticles(p, list, add) {
    const gl = this.gl;
    gl.useProgram(p.p);
    if (p.u.uNoise) this.tex(p, 'uNoise', this.noise, 0);
    if (p.u.uField) this.tex(p, 'uField', this.fieldT.tex, 1);
    this.drawInstances(this.partVao, list);
  }

  blackTex() {
    if (!this._black) this._black = texture(this.gl, { w: 1, h: 1, data: new Uint8Array(4) });
    return this._black;
  }
}
