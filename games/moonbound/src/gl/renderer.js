// The frame, back to front: the void backdrop and the far ruins drifting in
// it, the cliffs under the platforms, the baked floor (lit), ground effects
// (telegraphs, runes, rings, light pools), shadows, every creature and prop
// in one depth-sorted instanced draw, air effects (bursts, slashes, glows),
// damage numbers, then bloom and the grade. Lit in linear HDR when the device
// can render to half floats. Nothing here allocates per frame.
import { createContext, program, texture, Target } from './gl.js';
import * as S from './shaders.js';
import { clamp, SIN_E } from '../config.js';

const FRAME_FLOATS = 4 * (8 + S.MAX_LIGHTS * 2);
export const SPRITE_STRIDE = 20;
const byScore = (a, b) => b.score - a.score;

// A growable list of fixed-stride instances in one typed array; cleared every frame.
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
  // four vec4s (most effect lists)
  push16(a0, a1, a2, a3, b0, b1, b2, b3, c0, c1, c2, c3, d0, d1, d2, d3) {
    const k = this.alloc();
    const D = this.data;
    D[k] = a0;
    D[k + 1] = a1;
    D[k + 2] = a2;
    D[k + 3] = a3;
    D[k + 4] = b0;
    D[k + 5] = b1;
    D[k + 6] = b2;
    D[k + 7] = b3;
    D[k + 8] = c0;
    D[k + 9] = c1;
    D[k + 10] = c2;
    D[k + 11] = c3;
    D[k + 12] = d0;
    D[k + 13] = d1;
    D[k + 14] = d2;
    D[k + 15] = d3;
    return k;
  }
}

// Sprites are written in any order with a depth key (their ground y), then
// sorted into the draw list without allocating.
export class SpriteList {
  constructor(cap = 2048) {
    this.raw = new InstanceList(SPRITE_STRIDE, cap);
    this.out = new InstanceList(SPRITE_STRIDE, cap);
    this.keys = new Float64Array(cap);
    this.stride = SPRITE_STRIDE;
  }
  get count() {
    return this.raw.count;
  }
  clear() {
    this.raw.clear();
  }
  // f = atlas frame; x, y, z = the pivot in the world (ground y, height z); depth = sort key
  put(f, x, y, z, depth, flip = 1, scale = 1, flash = 0, dissolve = 0, alpha = 1, seed = 0, tr = 0, tg = 0, tb = 0, tint = 0) {
    if (!f) return;
    const L = this.raw;
    const k = L.alloc();
    const D = L.data;
    D[k] = x;
    D[k + 1] = y * SIN_E - z * 0.6427876;
    D[k + 2] = f.w * scale * flip;
    D[k + 3] = f.h * scale;
    D[k + 4] = f.u0;
    D[k + 5] = f.v0;
    D[k + 6] = f.u1;
    D[k + 7] = f.v1;
    D[k + 8] = f.ox * scale;
    D[k + 9] = f.oy * scale;
    D[k + 10] = f.layer;
    D[k + 11] = y;
    D[k + 12] = flash;
    D[k + 13] = dissolve;
    D[k + 14] = alpha;
    D[k + 15] = seed;
    D[k + 16] = tr;
    D[k + 17] = tg;
    D[k + 18] = tb;
    D[k + 19] = tint;
    const i = L.count - 1;
    if (i >= this.keys.length) {
      const nk = new Float64Array(this.keys.length * 2);
      nk.set(this.keys);
      this.keys = nk;
    }
    // depth in the high part, index in the low 15 bits: one typed sort orders them
    this.keys[i] = Math.floor((clamp(depth, -200, 600) + 200) * 64) * 32768 + i;
  }
  sort() {
    const n = this.raw.count;
    const keys = this.keys.subarray(0, n);
    keys.sort();
    const src = this.raw.data;
    const out = this.out;
    out.clear();
    if (out.data.length < src.length) out.data = new Float32Array(src.length);
    out.count = n;
    const dst = out.data;
    const st = SPRITE_STRIDE;
    for (let j = 0; j < n; j++) {
      const a = (keys[j] % 32768) * st;
      const b = j * st;
      for (let k = 0; k < st; k++) dst[b + k] = src[a + k];
    }
    return out;
  }
}

// Lights gathered for this frame; the strongest ones near the view are sent.
export class LightList {
  constructor() {
    this.pool = [];
    this.n = 0;
  }
  clear() {
    this.n = 0;
  }
  add(x, y, z, radius, r, g, b) {
    if (radius <= 0 || r + g + b <= 0.002) return;
    let l = this.pool[this.n];
    if (!l) l = this.pool[this.n] = { x: 0, y: 0, z: 0, radius: 0, r: 0, g: 0, b: 0, score: 0 };
    this.n++;
    l.x = x;
    l.y = y;
    l.z = z;
    l.radius = radius;
    l.r = r;
    l.g = g;
    l.b = b;
  }
}

export function makeNoise(gl) {
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
  const lats = {};
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

// The glyph sheet for damage numbers: drawn once with the 2D canvas.
export const GLYPHS = '0123456789+-x!%.';
function makeGlyphs(gl) {
  const cols = 8;
  const rows = 2;
  const cw = 64;
  const ch = 80;
  const c = document.createElement('canvas');
  c.width = cols * cw;
  c.height = rows * ch;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 62px "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
  g.lineJoin = 'round';
  // the outline into alpha only (black), the fill in white: the shader reads fill from red, cover from alpha
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < GLYPHS.length; i++) {
      const x = (i % cols) * cw + cw / 2;
      const y = Math.floor(i / cols) * ch + ch / 2 + 3;
      if (pass === 0) {
        g.strokeStyle = '#000';
        g.lineWidth = 12;
        g.strokeText(GLYPHS[i], x, y);
      } else {
        g.fillStyle = '#fff';
        g.fillText(GLYPHS[i], x, y);
      }
    }
  }
  const t = texture(gl, { image: c, mips: true });
  return { tex: t, cols, rows, aspect: cw / ch };
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
      floor: P(S.FLOOR, 'floor'),
      cliff: P(S.CLIFF, 'cliff'),
      backdrop: P(S.BACKDROP, 'backdrop'),
      sprite: P(S.SPRITE, 'sprite'),
      shadow: P(S.SPRITE_SHADOW, 'shadow'),
      blob: P(S.BLOB, 'blob'),
      far: P(S.FAR, 'far'),
      ground: P(S.GROUND_FX, 'groundfx'),
      burst: P(S.BURST, 'burst'),
      arc: P(S.ARC, 'arc'),
      glow: P(S.GLOW, 'glow'),
      text: P(S.TEXT, 'text'),
      bright: P(S.BRIGHT, 'bright'),
      down: P(S.DOWN, 'down'),
      up: P(S.UP, 'up'),
      composite: P(S.COMPOSITE, 'composite'),
    };
    this.bakeP = new Map();
    this.vao = gl.createVertexArray();
    this.noise = makeNoise(gl);
    this.glyphs = makeGlyphs(gl);
    this.scene = new Target(gl, 4, 4);
    this.bloom = [];
    if (gl.hdr) for (let i = 0; i < 5; i++) this.bloom.push(new Target(gl, 4, 4));
    this.lights = new LightList();
    this.time = 0;
    this.cam = { x: 0, y: 0, ppm: 60 }; // camera centre in screen-metres; css px per metre
    this.look = null;
    this.post = {
      exposure: 1,
      bloom: 0.7,
      chroma: 0,
      saturation: 1.05,
      contrast: 1.06,
      vignette: 0.42,
      red: 0,
      desat: 0,
      flash: [1, 1, 1, 0],
    };
    this.darkness = 0;
    this.atlas = null;
    this.floorTex = null;
    this.stats = { draws: 0 };
    this.lightSel = [];
  }

  ready() {
    for (const k in this.p) this.p[k].check();
  }

  // a VAO over one buffer of `attribs` vec4s per instance; `divisor` = how many instances share one record
  instanceVao(stride, attribs, divisor = 1) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (let i = 0; i < attribs; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, stride * 4, i * 16);
      gl.vertexAttribDivisor(i, divisor);
    }
    gl.bindVertexArray(null);
    return { vao, buf, size: 0 };
  }

  setAtlas(atlas) {
    this.atlas = atlas;
  }

  // ---- the floor: baked once per room (in strips, so no single draw runs long)
  // room: { rect: {x, y, w, h}, mask: {data Uint8Array RGBA, w, h, rect}, decals: [[x, y, r, kind]], region: {floorSrc, floorFn, colors (8 rgb), params (4 vec4)} }
  bakeFloor(room) {
    const gl = this.gl;
    const R = room.rect;
    const res = this.q.floorRes;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const w = Math.min(max, Math.round(R.w * res));
    const h = Math.min(max, Math.round(R.h * res));
    if (!this.floorTex || this.floorTex.w !== w || this.floorTex.h !== h) {
      if (this.floorTex) gl.deleteTexture(this.floorTex.tex);
      const tex = texture(gl, { w, h, internal: gl.SRGB8_ALPHA8 });
      this.floorTex = { tex, w, h, fb: this.floorTex?.fb || gl.createFramebuffer() };
    }
    const M = room.mask;
    if (!this.maskTex || this.maskTex.w !== M.w || this.maskTex.h !== M.h) {
      if (this.maskTex) gl.deleteTexture(this.maskTex.tex);
      this.maskTex = { tex: texture(gl, { w: M.w, h: M.h, data: M.data }), w: M.w, h: M.h };
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, M.w, M.h, gl.RGBA, gl.UNSIGNED_BYTE, M.data);
    }
    this.floorRect = [R.x, R.y, R.w, R.h];
    const reg = room.region;
    const key = reg.floorFn;
    let p = this.bakeP.get(key);
    if (!p) {
      const src = S.floorBake(reg.floorSrc, reg.floorFn);
      p = program(gl, src.vs, src.fs, 'bake-' + key);
      this.bakeP.set(key, p);
    }
    p.check();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.floorTex.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.floorTex.tex, 0);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(p.p);
    this.tex(p, 'uNoise', this.noise, 0);
    this.tex(p, 'uMask', this.maskTex.tex, 1);
    gl.uniform4f(p.u.uRect, R.x, R.y, R.w, R.h);
    gl.uniform4f(p.u.uMaskRect, M.rect.x, M.rect.y, M.rect.w, M.rect.h);
    gl.uniform3fv(p.u.uC, reg.colors);
    gl.uniform4fv(p.u.uP, reg.params);
    const dec = this.decalBuf || (this.decalBuf = new Float32Array(32 * 4));
    dec.fill(0);
    const nd = Math.min(32, room.decals.length);
    for (let i = 0; i < nd; i++) dec.set(room.decals[i], i * 4);
    gl.uniform4fv(p.u.uDecal, dec);
    gl.uniform1i(p.u.uDecals, nd);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.SCISSOR_TEST);
    for (let x = 0; x < w; x += 512) {
      gl.scissor(x, 0, Math.min(512, w - x), h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.flush();
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.bindTexture(gl.TEXTURE_2D, this.floorTex.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  resize(cssW, cssH, dpr) {
    cssW = Math.max(1, cssW);
    cssH = Math.max(1, cssH);
    const scale = Math.min(dpr, this.q.maxDpr);
    let w = cssW * scale;
    let h = cssH * scale;
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
    for (let i = 0; i < this.bloom.length; i++) this.bloom[i].resize(w / 2 ** (i + 1), h / 2 ** (i + 1));
  }

  // css px <-> screen-metres
  toScreenMetres(px, py, out) {
    const c = this.cam;
    out.x = c.x + (px - this.cssW / 2) / c.ppm;
    out.y = c.y + (py - this.cssH / 2) / c.ppm;
    return out;
  }
  toCss(sx, sy, out) {
    const c = this.cam;
    out.x = this.cssW / 2 + (sx - c.x) * c.ppm;
    out.y = this.cssH / 2 + (sy - c.y) * c.ppm;
    return out;
  }

  tex(p, name, t, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(p.u[name], unit);
  }
  texArray(p, name, t, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.uniform1i(p.u[name], unit);
  }

  // each list streams into its own buffer, made at the list's full size the first time it draws: a buffer shared by
  // several draws in one frame, or one that grows in a busy moment, stalls the GPU for a frame or two
  upload(list, attribs, divisor = 1) {
    const gl = this.gl;
    const key = divisor === 1 ? 'gpu' : 'gpu' + divisor;
    if (!list[key]) {
      list[key] = this.instanceVao(list.stride, attribs, divisor);
      list[key].size = list.data.length;
      gl.bufferData(gl.ARRAY_BUFFER, list.data.byteLength, gl.DYNAMIC_DRAW);
    }
    const v = list[key];
    gl.bindVertexArray(v.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, v.buf);
    const n = list.count * list.stride;
    if (n > v.size) {
      v.size = list.data.length;
      gl.bufferData(gl.ARRAY_BUFFER, list.data.byteLength, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, list.data, 0, n);
  }

  drawQuads(list, attribs) {
    if (!list.count) return;
    this.upload(list, attribs);
    this.gl.drawArraysInstanced(this.gl.TRIANGLE_STRIP, 0, 4, list.count);
    this.stats.draws++;
  }

  // GPU time per frame (debug bench only): timer queries, read back a few frames later
  gpuBegin() {
    const gl = this.gl;
    if (!this.gpuOn) return;
    this.gpuExt ??= gl.getExtension('EXT_disjoint_timer_query_webgl2') || false;
    const X = this.gpuExt;
    if (!X) return;
    this.gpuQ ||= [];
    this.gpuTimes ||= [];
    while (this.gpuQ.length && gl.getQueryParameter(this.gpuQ[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.gpuQ.shift();
      if (!gl.getParameter(X.GPU_DISJOINT_EXT)) this.gpuTimes.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
    if (this.gpuQ.length > 8) return;
    const q = gl.createQuery();
    gl.beginQuery(X.TIME_ELAPSED_EXT, q);
    this.gpuQ.push(q);
    this.gpuOpen = true;
  }
  gpuEnd() {
    if (!this.gpuOpen) return;
    this.gpuOpen = false;
    this.gl.endQuery(this.gpuExt.TIME_ELAPSED_EXT);
  }

  // ---- the frame. `s` holds this frame's lists: far (sprites in the void), cliffs, ground (ground effects),
  // blobs, sprites (a SpriteList), bursts, arcs, glows, glowsUnder (flames drawn before sprites), text.
  render(s) {
    const gl = this.gl;
    if (gl.lost || !this.look) return;
    this.gpuBegin();
    const q = this.q;
    this.stats.draws = 0;
    const c = this.cam;
    const W = this.w;
    const H = this.h;
    const look = this.look;
    const F = this.frame;
    F[0] = c.x;
    F[1] = c.y;
    F[2] = (2 * c.ppm) / this.cssW;
    F[3] = (2 * c.ppm) / this.cssH;
    F[4] = this.time;
    F[5] = 1 / (c.ppm * (W / this.cssW));
    F[7] = this.darkness;
    const dk = 1 - this.darkness * 0.75;
    F[8] = look.key[0];
    F[9] = look.key[1];
    F[10] = look.key[2];
    F[11] = 0;
    for (let i = 0; i < 3; i++) {
      F[12 + i] = look.keyCol[i] * dk;
      F[16 + i] = look.ambTop[i] * dk;
      F[20 + i] = look.ambBot[i] * dk;
      F[24 + i] = look.rim[i] * dk;
      F[28 + i] = look.fog[i] * dk;
    }
    F[27] = look.rim[3];
    F[31] = look.fog[3];
    // lights near the view, strongest first when there are too many
    const L = this.lights;
    const halfW = this.cssW / 2 / c.ppm + 4;
    const halfH = this.cssH / 2 / c.ppm + 4;
    const list = this.lightSel;
    list.length = 0;
    for (let i = 0; i < L.n; i++) {
      const l = L.pool[i];
      const sy = l.y * SIN_E - l.z * 0.6427876;
      if (Math.abs(l.x - c.x) > halfW + l.radius || Math.abs(sy - c.y) > halfH + l.radius) continue;
      l.score = (l.r + l.g + l.b) * l.radius;
      list.push(l);
    }
    if (list.length > q.lights) list.sort(byScore);
    const nl = Math.min(list.length, q.lights);
    F[6] = nl;
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
      F[k + 7] = 0;
    }
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, F, 0, 32 + nl * 8);

    this.scene.bind();
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    // the void
    let p = this.p.backdrop;
    gl.useProgram(p.p);
    this.tex(p, 'uNoise', this.noise, 0);
    gl.uniform3fv(p.u.uSky, look.sky);
    gl.uniform4fv(p.u.uGlowA, look.glowA);
    gl.uniform4fv(p.u.uGlowB, look.glowB);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const atlas = this.atlas;
    if (atlas?.albedo && s.far.count) {
      p = this.p.far;
      gl.useProgram(p.p);
      this.texArray(p, 'uAlbedo', atlas.albedo, 0);
      this.texArray(p, 'uNormal', atlas.normal, 1);
      this.drawQuads(s.far, 5);
    }
    if (s.cliffs.count) {
      p = this.p.cliff;
      gl.useProgram(p.p);
      this.tex(p, 'uNoise', this.noise, 0);
      gl.uniform3fv(p.u.uC, look.cliff);
      this.drawQuads(s.cliffs, 2);
    }
    // the floor
    if (this.floorTex) {
      p = this.p.floor;
      gl.useProgram(p.p);
      this.tex(p, 'uBase', this.floorTex.tex, 0);
      this.tex(p, 'uNoise', this.noise, 1);
      gl.uniform4fv(p.u.uRect, this.floorRect);
      gl.uniform2f(p.u.uTexel, 1 / this.floorTex.w, 1 / this.floorTex.h);
      gl.uniform4fv(p.u.uGlow, look.inlay);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // shadows (darken), then ground effects (light)
    if (s.blobs.count) {
      p = this.p.blob;
      gl.useProgram(p.p);
      this.drawQuads(s.blobs, 1);
    }
    const sprites = s.sprites.count ? s.sprites.sort() : null;
    if (atlas?.albedo && s.shadows.count && q.shadows) {
      p = this.p.shadow;
      gl.useProgram(p.p);
      this.texArray(p, 'uAlbedo', atlas.albedo, 0);
      gl.uniform2f(p.u.uShear, look.shear[0], look.shear[1]);
      gl.uniform1f(p.u.uStrength, look.shadow * (1 - this.darkness * 0.5));
      this.drawQuads(s.shadows, 5);
    }
    if (s.ground.count) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      p = this.p.ground;
      gl.useProgram(p.p);
      this.tex(p, 'uNoise', this.noise, 0);
      this.drawQuads(s.ground, 4);
    }
    if (s.glowsUnder.count) this.drawGlows(s.glowsUnder);
    if (atlas?.albedo && sprites) {
      p = this.p.sprite;
      gl.useProgram(p.p);
      this.texArray(p, 'uAlbedo', atlas.albedo, 0);
      this.texArray(p, 'uNormal', atlas.normal, 1);
      this.tex(p, 'uNoise', this.noise, 2);
      this.drawQuads(sprites, 5);
    }
    if (s.arcs.count) {
      p = this.p.arc;
      gl.useProgram(p.p);
      this.tex(p, 'uNoise', this.noise, 0);
      this.upload(s.arcs, 4);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 2 * (S.ARC_SEGMENTS + 1), s.arcs.count);
      this.stats.draws++;
    }
    if (s.bursts.count) {
      p = this.p.burst;
      gl.useProgram(p.p);
      this.upload(s.bursts, 4, S.BURST_COUNT);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, s.bursts.count * S.BURST_COUNT);
      this.stats.draws++;
    }
    if (s.glows.count) this.drawGlows(s.glows);
    if (s.text.count) {
      p = this.p.text;
      gl.useProgram(p.p);
      this.tex(p, 'uGlyphs', this.glyphs.tex, 0);
      gl.uniform2f(p.u.uGrid, this.glyphs.cols, this.glyphs.rows);
      this.drawQuads(s.text, 3);
    }

    // bloom (not without a half-float scene: an 8-bit one clips before any threshold)
    const bloomOn = this.bloom.length > 0 && q.bloomLevels > 0;
    const po = this.post;
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    if (bloomOn) {
      const levels = Math.min(q.bloomLevels, this.bloom.length);
      this.bloom[0].bind();
      p = this.p.bright;
      gl.useProgram(p.p);
      this.tex(p, 'uScene', this.scene.tex, 0);
      gl.uniform2f(p.u.uTexel, 1 / this.scene.w, 1 / this.scene.h);
      gl.uniform1f(p.u.uThreshold, look.bloomThreshold ?? 0.9);
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
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    p = this.p.composite;
    gl.useProgram(p.p);
    this.tex(p, 'uScene', this.scene.tex, 0);
    this.tex(p, 'uBloom', bloomOn ? this.bloom[0].tex : this.blackTex(), 1);
    this.tex(p, 'uNoise', this.noise, 2);
    gl.uniform4f(p.u.uPost, po.exposure * look.exposure, bloomOn ? po.bloom * look.bloom : 0, 0.002 + po.chroma, po.saturation * look.saturation);
    gl.uniform4fv(p.u.uFlash, po.flash);
    gl.uniform4f(p.u.uGrade, po.contrast * look.contrast, po.vignette, po.red, po.desat);
    gl.uniform3fv(p.u.uLift, look.lift);
    gl.uniform3fv(p.u.uGain, look.gain);
    gl.uniform4fv(p.u.uMist, look.mist);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.gpuEnd();
  }

  drawGlows(list) {
    const gl = this.gl;
    const p = this.p.glow;
    gl.useProgram(p.p);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.tex(p, 'uNoise', this.noise, 0);
    this.drawQuads(list, 4);
  }

  blackTex() {
    if (!this._black) this._black = texture(this.gl, { w: 1, h: 1, data: new Uint8Array(4) });
    return this._black;
  }
}
