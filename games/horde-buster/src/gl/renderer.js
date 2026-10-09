// The frame: the baked road and its paint layer (blood, settled gibs, scorch,
// frost), shadows, ground glows, every creature, prop and gib in one y-sorted
// instanced draw, blood and smoke, fire and bolts, damage numbers, then bloom
// and the grade. Lit in linear HDR when the device can render to half floats.
import { createContext, program, texture, Target } from './gl.js';
import * as S from './shaders.js';
import { GROUNDS } from './ground/index.js';
import { clamp } from '../config.js';

const FRAME_FLOATS = 4 * (8 + S.MAX_LIGHTS * 2);
export const SPRITE_STRIDE = 16;
export const PARTICLE_STRIDE = 12;
export const SHADOW_STRIDE = 4;
const byScore = (a, b) => b.score - a.score;

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
  // a particle-style instance (stride 12)
  p(x, y, size, rot, r, g, b, a, kind, life, seed, stretch) {
    const k = this.alloc();
    const D = this.data;
    D[k] = x;
    D[k + 1] = y;
    D[k + 2] = size;
    D[k + 3] = rot;
    D[k + 4] = r;
    D[k + 5] = g;
    D[k + 6] = b;
    D[k + 7] = a;
    D[k + 8] = kind;
    D[k + 9] = life;
    D[k + 10] = seed;
    D[k + 11] = stretch;
  }
}

// Sprites are written in any order with a depth key (their ground y), then
// sorted into the draw list without allocating.
export class SpriteList {
  constructor(cap = 4096) {
    this.raw = new InstanceList(SPRITE_STRIDE, cap);
    this.out = new InstanceList(SPRITE_STRIDE, cap);
    this.keys = new Float64Array(cap);
  }
  clear() {
    this.raw.clear();
  }
  // f = atlas frame; x, y = pivot; depth = sort key (bigger is nearer)
  put(f, x, y, depth, scale = 1, rot = 0, flip = 1, flash = 0, freeze = 0, alpha = 1, gold = 0) {
    if (!f) return;
    const L = this.raw;
    const k = L.alloc();
    const D = L.data;
    D[k] = x;
    D[k + 1] = y;
    D[k + 2] = f.w * scale * flip;
    D[k + 3] = f.h * scale;
    D[k + 4] = f.u0;
    D[k + 5] = f.v0;
    D[k + 6] = f.u1;
    D[k + 7] = f.v1;
    D[k + 8] = f.ox * scale;
    D[k + 9] = f.oy * scale;
    D[k + 10] = rot;
    D[k + 11] = f.layer;
    D[k + 12] = flash;
    D[k + 13] = freeze;
    D[k + 14] = alpha;
    D[k + 15] = gold;
    const i = L.count - 1;
    if (i >= this.keys.length) {
      const nk = new Float64Array(this.keys.length * 2);
      nk.set(this.keys);
      this.keys = nk;
    }
    // depth in the high part, index in the low 15 bits: one typed sort orders them
    this.keys[i] = Math.floor((clamp(depth, -4000, 12000) + 4000) * 4) * 32768 + i;
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
    for (let j = 0; j < n; j++) {
      const a = (keys[j] % 32768) * SPRITE_STRIDE;
      const b = j * SPRITE_STRIDE;
      for (let k = 0; k < SPRITE_STRIDE; k++) dst[b + k] = src[a + k];
    }
    return out;
  }
}

// Lights gathered for this frame; the strongest ones in view are sent.
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
  g.font = '900 64px "Arial Black", "Segoe UI Black", system-ui, sans-serif';
  g.lineJoin = 'round';
  // the outline into alpha only (black), the fill in white: the shader reads fill from red, cover from alpha
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < GLYPHS.length; i++) {
      const x = (i % cols) * cw + cw / 2;
      const y = Math.floor(i / cols) * ch + ch / 2 + 3;
      if (pass === 0) {
        g.strokeStyle = '#000';
        g.lineWidth = 14;
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
      ground: P(S.GROUND, 'ground'),
      sprite: P(S.SPRITE, 'sprite'),
      stamp: P(S.STAMP, 'stamp'),
      paint: P(S.PAINT, 'paint'),
      part: P(S.PARTICLE, 'particle'),
      shadow: P(S.SHADOW, 'shadow'),
      text: P(S.TEXT, 'text'),
      bright: P(S.BRIGHT, 'bright'),
      down: P(S.DOWN, 'down'),
      up: P(S.UP, 'up'),
      composite: P(S.COMPOSITE, 'composite'),
      solid: P(S.SOLID, 'solid'),
    };
    this.vao = gl.createVertexArray();
    this.noise = makeNoise(gl);
    this.glyphs = makeGlyphs(gl);
    this.blackTex();
    this.spriteVao = this.instanceVao(SPRITE_STRIDE, 4);
    this.partVao = this.instanceVao(PARTICLE_STRIDE, 3);
    this.shadowVao = this.instanceVao(SHADOW_STRIDE, 1);
    this.scene = new Target(gl, 4, 4);
    this.bloom = [];
    if (gl.hdr) for (let i = 0; i < 5; i++) this.bloom.push(new Target(gl, 4, 4));
    this.lights = new LightList();
    this.time = 0;
    this.cam = { x: 360, y: 640, zoom: 1, roll: 0 };
    this.look = null;
    this.post = { exposure: 1, bloom: 0.6, chroma: 0, saturation: 1.12, contrast: 1.04, vignette: 0.32, red: 0, desat: 0, flash: [1, 1, 1, 0] };
    this.atlas = null;
    this.base = null;
    this.paintT = null;
    this.stats = { draws: 0 };
  }

  ready() {
    for (const k in this.p) this.p[k].check();
  }

  instanceVao(stride, attribs) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (let i = 0; i < attribs; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, stride * 4, i * 16);
      gl.vertexAttribDivisor(i, 1);
    }
    gl.bindVertexArray(null);
    return { vao, buf, size: 0, attribs };
  }

  setAtlas(atlas) {
    this.atlas = atlas;
  }

  // ---- the ground: baked once per chapter (in strips, so no single draw runs long)
  // theme: { kind (index into GROUNDS), rect, colors: 8 linear rgb, params: 4 vec4, seed, field: [w, h], glow }
  bakeGround(theme) {
    const gl = this.gl;
    const R = theme.rect;
    const res = this.q.groundRes;
    const w = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), Math.round(R.w * res));
    const h = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), Math.round(R.h * res));
    const glow = !!theme.glow;
    if (!this.base || this.base.w !== w || this.base.h !== h || !!this.base.glow !== glow) {
      if (this.base) {
        gl.deleteTexture(this.base.tex);
        if (this.base.glow) gl.deleteTexture(this.base.glow);
      }
      const tex = texture(gl, { w, h, internal: gl.SRGB8_ALPHA8 });
      // the glow layer only exists for grounds that glow; it shares the size so one pass writes both
      const gt = glow ? texture(gl, { w, h, internal: gl.RGBA8 }) : null;
      this.base = { tex, glow: gt, w, h, fb: this.base?.fb || gl.createFramebuffer() };
    }
    this.baseRect = [R.x, R.y, R.w, R.h];
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.base.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.base.tex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.base.glow, 0);
    gl.drawBuffers(glow ? [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1] : [gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    const kind = theme.kind || 0;
    this.bakeP ||= [];
    if (!this.bakeP[kind]) {
      const g = GROUNDS[kind];
      this.bakeP[kind] = program(gl, ...Object.values(S.groundBake(g.src, g.fn)), 'bake' + kind);
    }
    const p = this.bakeP[kind];
    p.check();
    gl.useProgram(p.p);
    this.tex(p, 'uNoise', this.noise, 0);
    gl.uniform4f(p.u.uRect, R.x, R.y, R.w, R.h);
    gl.uniform3fv(p.u['uC[0]'] ?? p.u.uC, theme.colors.flat());
    gl.uniform4fv(p.u['uP[0]'] ?? p.u.uP, theme.params.flat());
    if (p.u.uSeed) gl.uniform1f(p.u.uSeed, theme.seed || 0);
    if (p.u.uField) gl.uniform2fv(p.u.uField, theme.field || [720, 1280]);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.SCISSOR_TEST);
    for (let x = 0; x < w; x += 512) {
      gl.scissor(x, 0, Math.min(512, w - x), h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.flush();
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ---- the paint layer: blood and gore that stays on the road
  initPaint(rect) {
    const gl = this.gl;
    // the blood layer keeps its detail but stays under ~9 MP on a wide field
    const res = Math.min(this.q.paintRes, Math.sqrt(9e6 / (rect.w * rect.h)));
    const w = Math.round(rect.w * res);
    const h = Math.round(rect.h * res);
    if (!this.paintT) this.paintT = new Target(gl, w, h, { internal: gl.SRGB8_ALPHA8, type: gl.UNSIGNED_BYTE });
    else this.paintT.resize(w, h);
    this.paintRect = [rect.x, rect.y, rect.w, rect.h];
    this.clearPaint();
  }

  clearPaint() {
    const gl = this.gl;
    this.paintT.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  paint(splats, stamps) {
    if (!splats.count && !stamps.count) return;
    const gl = this.gl;
    this.paintT.bind();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (stamps.count && this.atlas) {
      const p = this.p.stamp;
      gl.useProgram(p.p);
      gl.uniform4fv(p.u.uPaint, this.paintRect);
      this.texArray(p, 'uAlbedo', this.atlas.albedo, 0);
      this.texArray(p, 'uNormal', this.atlas.normal, 1);
      this.drawInstances(this.spriteVao, stamps);
    }
    if (splats.count) {
      const p = this.p.paint;
      gl.useProgram(p.p);
      gl.uniform4fv(p.u.uPaint, this.paintRect);
      this.tex(p, 'uNoise', this.noise, 0);
      this.drawInstances(this.partVao, splats);
    }
    splats.clear();
    stamps.clear();
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

  // screen (css px) <-> world
  toWorld(sx, sy, out) {
    const c = this.cam;
    out.x = c.x + (sx - this.cssW / 2) / c.zoom;
    out.y = c.y + (sy - this.cssH / 2) / c.zoom;
    return out;
  }
  toScreen(x, y, out) {
    const c = this.cam;
    out.x = this.cssW / 2 + (x - c.x) * c.zoom;
    out.y = this.cssH / 2 + (y - c.y) * c.zoom;
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
  drawInstances(v, list) {
    const gl = this.gl;
    if (!list.gpu) {
      list.gpu = this.instanceVao(list.stride, v.attribs);
      list.gpu.size = list.data.length;
      gl.bufferData(gl.ARRAY_BUFFER, list.data.byteLength, gl.DYNAMIC_DRAW);
    }
    v = list.gpu;
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

  // ---- the frame. `s` holds this frame's lists: sprites (a sorted
  // InstanceList), shadows, under (ground glows), alpha (blood, smoke), hot
  // (fire, bolts, sparks), text, and the paint lists (splats, stamps).
  // GPU time per frame (debug bench only): timer queries, read back a few frames later
  gpuBegin() {
    const gl = this.gl;
    if (!this.gpuOn) return;
    this.gpuExt ??= gl.getExtension('EXT_disjoint_timer_query_webgl2') || false;
    const X = this.gpuExt;
    if (!X) return;
    this.gpuQ ||= [];
    this.gpuTimes ||= [];
    // collect finished queries
    while (this.gpuQ.length && gl.getQueryParameter(this.gpuQ[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.gpuQ.shift();
      if (!gl.getParameter(X.GPU_DISJOINT_EXT)) {
        this.gpuTimes.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        (this.gpuFrames ||= []).push(q.frame);
      }
      gl.deleteQuery(q);
    }
    if (this.gpuQ.length > 8) return;
    const q = gl.createQuery();
    q.frame = this.frameNo; // which frame it timed (the bench lines it up with the game)
    gl.beginQuery(X.TIME_ELAPSED_EXT, q);
    this.gpuQ.push(q);
    this.gpuOpen = true;
  }

  gpuEnd() {
    if (!this.gpuOpen) return;
    this.gpuOpen = false;
    this.gl.endQuery(this.gpuExt.TIME_ELAPSED_EXT);
  }

  render(s) {
    const gl = this.gl;
    if (gl.lost || !this.base) return;
    this.frameNo = (this.frameNo || 0) + 1;
    this.gpuBegin();
    const q = this.q;
    this.stats.draws = 0;
    const c = this.cam;
    const W = this.w;
    const H = this.h;
    const look = this.look;
    const F = this.frame;
    // clip per world unit: zoom is css px per unit, the canvas spans cssW css px
    F[0] = c.x;
    F[1] = c.y;
    F[2] = (2 * c.zoom) / this.cssW;
    F[3] = (2 * c.zoom) / this.cssH;
    F[4] = this.time;
    F[5] = 1 / (c.zoom * (W / this.cssW));
    F[7] = c.roll;
    F.set(look.key, 8);
    F.set(look.keyCol, 12);
    F.set(look.ambTop, 16);
    F.set(look.ambBot, 20);
    F.set(look.rim, 24);
    F.set(look.fog, 28);
    // lights in view, strongest first when there are too many
    const L = this.lights;
    const halfW = this.cssW / 2 / c.zoom + 100;
    const halfH = this.cssH / 2 / c.zoom + 100;
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

    // gore that settled this frame goes into the paint layer first
    this.paint(s.splats, s.stamps);

    this.scene.bind();
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    let p = this.p.ground;
    gl.useProgram(p.p);
    this.tex(p, 'uBase', this.base.tex, 0);
    this.tex(p, 'uPaint', this.paintT.tex, 1);
    gl.uniform4fv(p.u.uBaseRect, this.baseRect);
    gl.uniform4fv(p.u.uPaintRect, this.paintRect);
    gl.uniform2f(p.u.uBaseTexel, 1 / this.base.w, 1 / this.base.h);
    gl.uniform1f(p.u.uGlowOn, this.base.glow ? 1 : 0);
    if (this.base.glow) this.tex(p, 'uGlow', this.base.glow, 2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (s.shadows.count) {
      p = this.p.shadow;
      gl.useProgram(p.p);
      this.drawInstances(this.shadowVao, s.shadows);
    }
    if (s.under.count) this.drawParticles(s.under);
    if (this.atlas && s.sprites.count) {
      p = this.p.sprite;
      gl.useProgram(p.p);
      this.texArray(p, 'uAlbedo', this.atlas.albedo, 0);
      this.texArray(p, 'uNormal', this.atlas.normal, 1);
      this.drawInstances(this.spriteVao, s.sprites);
    }
    if (s.alpha.count) this.drawParticles(s.alpha);
    if (s.hot.count) this.drawParticles(s.hot);
    if (this.atlas && s.over && s.over.count) {
      p = this.p.sprite;
      gl.useProgram(p.p);
      this.texArray(p, 'uAlbedo', this.atlas.albedo, 0);
      this.texArray(p, 'uNormal', this.atlas.normal, 1);
      this.drawInstances(this.spriteVao, s.over);
    }
    if (s.top && s.top.count) this.drawParticles(s.top);
    if (s.text.count) {
      p = this.p.text;
      gl.useProgram(p.p);
      this.tex(p, 'uGlyphs', this.glyphs.tex, 0);
      gl.uniform2f(p.u.uGrid, this.glyphs.cols, this.glyphs.rows);
      this.drawInstances(this.partVao, s.text);
    }

    // bloom (not without a half-float scene: an 8-bit one clips before any threshold)
    const bloomOn = this.bloom.length > 0;
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
      gl.uniform1f(p.u.uThreshold, look.bloomThreshold ?? 1.0);
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
    gl.uniform4f(p.u.uPost, po.exposure, bloomOn ? po.bloom : 0, 0.003 + po.chroma, po.saturation);
    gl.uniform4fv(p.u.uFlash, po.flash);
    gl.uniform4f(p.u.uGrade, po.contrast, po.vignette, po.red, po.desat);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.gpuEnd();
  }

  drawParticles(list) {
    const gl = this.gl;
    const p = this.p.part;
    gl.useProgram(p.p);
    this.tex(p, 'uNoise', this.noise, 0);
    this.drawInstances(this.partVao, list);
  }

  blackTex() {
    if (!this._black) this._black = texture(this.gl, { w: 1, h: 1, data: new Uint8Array(4) });
    return this._black;
  }
}
