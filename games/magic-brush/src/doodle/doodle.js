// Doodle: the third way to play. A blank canvas, every paint and brush, and
// whatever the child draws comes alive as itself: GO puffs the drawing up
// into a soft 3D plush of its own shape (inflate.js, in a worker), painted
// with the drawing, with googly eyes, a smile and little feet
// (creatures/doodle.js), and it peels off the canvas with the same magic as
// every other friend (the sweep, alive.js, the leap) and plays in the garden.
//
// It paints with the big kid tools, so the app runs in mode 'big' with this
// switched on (main.js setMode). Hooks into main.js are marked [doodle]:
//   setMode       'doodle' turns this on (and the start screen card)
//   go            GO hands over to go() here
//   comeAlive     the record keeps f.recordExtra (the drawing's mask), so
//   friendFromRecord  fromRecord() can build the same friend again
// A drawing that is almost nothing gets a gentle hint instead (the easel
// wiggles, sparkles circle the canvas, the paint pots bounce).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { QUERY, load, rand, REDUCED_MOTION } from '../config.js';
import { BY_ID } from '../creatures/catalog.js';
import { CALLS } from '../sound/calls.js';
import { CANVAS_W, CANVAS_H } from '../creatures/friend.js';
import { buildDoodle, packBits, unpackBits } from './inflate.js';
import { PRESETS } from './presets.js';

export const MW = 256;
export const MH = 192;
const OPTS = { canvasW: CANVAS_W, canvasH: CANVAS_H, tris: 30000, size: 0.15 };

const INFO = { id: 'doodle', name: 'Doodle', group: 'doodle', view: 'front', palette: [0xf06ab0, 0xffd04a, 0x4fa8ff], home: 'ground', margin: 1 };
BY_ID.doodle = { ...INFO, load: () => import('../creatures/doodle.js') };

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// painted texels (as Magic's seeds count them)
const MASK_FRAG = /* glsl */ `
uniform sampler2D tP;
varying vec2 vUv;
void main() {
  float a = texture2D(tP, vUv).a;
  gl_FragColor = vec4(vec3(step(0.35, a)), 1.0);
}`;

// The fill for a doodle: like the magic's own (every unpainted spot takes the
// nearest paint's colour), but far from any paint the colour fades to a soft
// pastel of it, so a drawing made of lines (a face, a ring) stays a drawing
// on a soft body instead of drowning in one flat colour.
const SOFT_FRAG = /* glsl */ `
uniform sampler2D tSeed;
uniform sampler2D tP;
varying vec2 vUv;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n21(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 wob = (vec2(n21(vUv * vec2(9.0, 40.0)), n21(vUv * vec2(9.0, 40.0) + 7.3)) - 0.5) * 0.03;
  vec4 s = texture2D(tSeed, clamp(vUv + wob, 0.0, 1.0));
  vec3 dens = vec3(0.04, 0.05, 0.08);
  if (s.a > 0.5) {
    dens = texture2D(tP, s.xy).rgb;
    float d = length((s.xy - vUv) * vec2(4.0 / 3.0, 1.0));
    dens *= mix(1.0, 0.28, smoothstep(0.035, 0.11, d));
  }
  gl_FragColor = vec4(dens, 1.0);
}`;

// ------------------------------------------------------------ meshing (worker)

let worker = null;
let workerBroken = false;
let jobId = 0;
const jobs = new Map();

function mesh(bits) {
  if (!worker && !workerBroken) {
    try {
      worker = new Worker(new URL('./mesh-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const job = jobs.get(e.data.id);
        if (!job) return;
        jobs.delete(e.data.id);
        if (e.data.error) job.reject(new Error(e.data.error));
        else job.resolve(e.data.out);
      };
      worker.onerror = () => {
        workerBroken = true;
        worker = null;
        for (const [, job] of jobs) job.fallback();
        jobs.clear();
      };
    } catch {
      workerBroken = true;
      worker = null;
    }
  }
  if (!worker) return Promise.resolve(buildDoodle(bits, MW, MH, OPTS));
  return new Promise((resolve, reject) => {
    const id = ++jobId;
    const fallback = () => {
      try {
        resolve(buildDoodle(bits, MW, MH, OPTS));
      } catch (err) {
        reject(err);
      }
    };
    jobs.set(id, { resolve, reject, fallback });
    worker.postMessage({ id, bits, W: MW, H: MH, opts: OPTS });
  });
}

function hashBits(bits) {
  let h = 2166136261;
  for (let i = 0; i < bits.length; i++) if (bits[i]) h = Math.imul(h ^ i, 16777619);
  return h >>> 0 || 1;
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => {
        const t = new THREE.Texture(img);
        t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
        resolve(t);
      });
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ------------------------------------------------------------ the mode

export class Doodle {
  // did the child last play Doodle (or ask for it with ?mode=doodle)?
  static wanted() {
    return (QUERY.get('mode') || load('mode', 'little')) === 'doodle';
  }

  constructor(app) {
    this.app = app;
    this.on = false;
    this.busy = false;
    this.hintT = -1;
    this.last = null;
    this.target = new THREE.WebGLRenderTarget(MW, MH, { depthBuffer: false, generateMipmaps: false });
    const mat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });
    this.maskMat = mat(MASK_FRAG, { tP: { value: null } });
    this.softMat = mat(SOFT_FRAG, { tSeed: { value: null }, tP: { value: null } });
    this.quad = new FullScreenQuad(null);
    // the soft fill goes in right after the magic works out its own (see SOFT_FRAG)
    const magic = app.magic;
    const prepare = magic.prepare.bind(magic);
    magic.prepare = async (defaultTex, mask) => {
      const cov = await prepare(defaultTex, mask);
      if (this.softNext) {
        this.softNext = false;
        this.soften();
      }
      return cov;
    };
  }

  pass(material, target) {
    const r = this.app.renderer;
    const prev = r.getRenderTarget();
    this.quad.material = material;
    r.setRenderTarget(target);
    this.quad.render(r);
    r.setRenderTarget(prev);
  }

  setOn(on) {
    this.on = !!on;
    document.body.dataset.doodle = this.on ? 'on' : 'off';
    this.syncUi();
  }

  // the start screen card: Doodle lit, not Big kid, while it is on
  syncUi() {
    for (const b of document.querySelectorAll('.mode')) b.setAttribute('aria-checked', String(this.on ? b.dataset.mode === 'doodle' : b.dataset.mode === this.app.mode));
  }

  // ------------------------------------------------------------ GO

  // the painted texels of the canvas, MW x MH, row 0 at the bottom
  async readMask() {
    const r = this.app.renderer;
    this.maskMat.uniforms.tP.value = this.app.paint.live.textures[0];
    this.pass(this.maskMat, this.target);
    const d = new Uint8Array(MW * MH * 4);
    try {
      await r.readRenderTargetPixelsAsync(this.target, 0, 0, MW, MH, d);
    } catch {
      r.readRenderTargetPixels(this.target, 0, 0, MW, MH, d);
    }
    const bits = new Uint8Array(MW * MH);
    for (let i = 0; i < bits.length; i++) bits[i] = d[i * 4] > 127 ? 1 : 0;
    return bits;
  }

  async go() {
    const app = this.app;
    if (this.busy || app.state !== 'paint' || app.alive.busy) return;
    this.busy = true;
    // (no more painting while it is worked out)
    app.setState('magic');
    try {
      const bits = await this.readMask();
      const data = await mesh(bits);
      if (app.state !== 'magic' || app.magicRun) return;
      if (data.empty) {
        app.setState('paint');
        this.hint();
        return;
      }
      const seed = hashBits(bits);
      const f = await this.makeFriend(data, { v: 1, mask: packBits(bits), seed }, app.paintedColors());
      if (app.state !== 'magic' || app.magicRun) {
        f.dispose();
        return;
      }
      app.warmFriend(f);
      app.outline.clear();
      await app.outline.draw(f);
      app.easel.setOutline(app.outline.lines, app.outline.mask);
      this.softNext = true;
      app.startMagic(f);
      // (specks the friend left out are tidied off the canvas by the sweep)
      if (app.magicRun) app.magicRun.tidy = true;
      app.audio.magic?.('shimmer');
      this.last = { stats: data.stats, tris: this.triangles(f), coarse: data.coarse?.tris ?? 0, id: f.info.id };
    } catch (err) {
      console.warn('doodle', err);
      if (app.state === 'magic' && !app.magicRun) app.setState('paint');
    } finally {
      this.busy = false;
    }
  }

  async makeFriend(data, save, colors = []) {
    const mod = await import('../creatures/doodle.js');
    const id = 'doodle-' + (save.seed >>> 0).toString(36);
    const palette = colors.length ? colors.slice(0, 4).map((c) => c.getHex()) : INFO.palette;
    const info = { ...INFO, id, palette };
    BY_ID[id] = { ...info, load: BY_ID.doodle.load };
    CALLS[id] = mod.voiceFor(data.stats, save.seed);
    const f = new mod.DoodleFriend(info, this.app.friendCtx, data);
    await f.build();
    // (kept with the friend's record, to build it again: see fromRecord)
    f.recordExtra = { doodle: save };
    return f;
  }

  // a kept doodle friend, built again from its drawing's mask and its skin
  async fromRecord(rec) {
    try {
      const bits = unpackBits(rec.doodle.mask, MW * MH);
      const data = await mesh(bits);
      if (data.empty) return null;
      const [f, tex] = await Promise.all([this.makeFriend(data, rec.doodle), loadTexture(rec.skin)]);
      f.setSkin(tex);
      f.ownSkin = tex;
      await this.app.warmFriend(f);
      this.app.renderer.initTexture(tex);
      return f;
    } catch {
      return null;
    }
  }

  soften() {
    const m = this.app.magic;
    if (!m.seedResult) return;
    this.softMat.uniforms.tSeed.value = m.seedResult.texture;
    this.softMat.uniforms.tP.value = this.app.paint.live.textures[0];
    this.pass(this.softMat, m.fill);
  }

  triangles(f) {
    let n = 0;
    for (const m of f.meshes) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    return n;
  }

  // ------------------------------------------------------------ almost nothing

  // a gentle "draw something!": the easel wiggles, sparkles circle the canvas,
  // the paint pots bounce
  hint() {
    const app = this.app;
    app.audio.creature?.('generic', 'boing');
    this.hintT = 0;
    this.board0 ??= app.easel.board.rotation.z;
    const plane = app.easel.plane;
    const v = new THREE.Vector3();
    const o = new THREE.Vector3(0, 0, 0).applyMatrix4(plane);
    const vel = new THREE.Vector3();
    const col = new THREE.Color();
    const n = REDUCED_MOTION.matches ? 10 : 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      v.set(Math.cos(a) * CANVAS_W * 0.28, Math.sin(a) * CANVAS_H * 0.3, 0.012).applyMatrix4(plane);
      app.fx.sparkles.emit(v.x, v.y, v.z, 0, rand(0.02, 0.12), rand(0.02, 0.1), i % 2 ? [2.0, 1.6, 0.9] : [1.2, 1.4, 2.0], rand(0.014, 0.024), rand(0.7, 1.2));
      // (sparkles hardly show on white paper: a ring of paint-coloured petals
      // pops out of the canvas and flutters down too)
      if (i % 2 && app.fx.petals) {
        vel.set(Math.cos(a) * 0.35, Math.sin(a) * 0.3 + 0.35, 0.45).applyMatrix4(plane).sub(o);
        app.fx.petals.throw(v, vel, col.setHSL(i / n, 0.75, 0.6), rand(0.01, 0.015));
      }
    }
    const bar = document.getElementById('toolbar');
    bar?.classList.remove('doodle-hint');
    void bar?.offsetWidth;
    bar?.classList.add('doodle-hint');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => bar?.classList.remove('doodle-hint'), 1500);
  }

  update(dt) {
    if (this.hintT < 0) return;
    this.hintT += dt;
    const k = this.hintT;
    const board = this.app.easel.board;
    board.rotation.z = this.board0 + Math.sin(k * 24) * Math.exp(-k * 3) * 0.014;
    if (k > 1.5) {
      board.rotation.z = this.board0;
      this.hintT = -1;
    }
  }

  // ------------------------------------------------------------ debug

  // for window.__mb: doodle(preset | strokes | points, { go }) draws on a
  // fresh canvas in Doodle mode (presets: blob, star, snake, two-blobs, tiny,
  // face, stick); doodleInfo() the last one made
  debugApi() {
    const d = this;
    const app = this.app;
    const drawStroke = (s) => {
      if (s.color) app.ui.setColor(s.color, s.kind || 'brush');
      app.ui.setSize(s.size || 'medium');
      app.applyTool();
      const pts = s.pts;
      const px = (p) => [p[0] * app.paint.w, p[1] * app.paint.h];
      const pr = 0.55;
      app.paint.begin(app.brushSpec(), ...px(pts[0]), pr);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 200));
        for (let j = 1; j <= n; j++) app.paint.move(...px([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]), pr);
      }
      app.paint.update(0);
      app.paint.end();
    };
    return {
      async doodle(what = 'blob', { go = false, keep = false } = {}) {
        if (!d.on) app.setMode('doodle');
        if (app.state !== 'paint') app.startPainting(true);
        if (!keep) app.newCanvas();
        let strokes;
        if (typeof what === 'string') strokes = (PRESETS[what] || PRESETS.blob)();
        else if (Array.isArray(what) && Array.isArray(what[0]) && typeof what[0][0] === 'number') strokes = [{ pts: what, color: 'purple', size: 'large' }];
        else strokes = what;
        for (const s of strokes) drawStroke(s);
        app.checkCoverage();
        if (go) await d.go();
        return d.last;
      },
      doodleGo: () => d.go(),
      doodleInfo: () => d.last,
      doodleOn: () => d.on,
      doodleMask: async () => {
        const bits = await d.readMask();
        let n = 0;
        for (const b of bits) n += b;
        return n;
      },
      doodlePresets: () => Object.keys(PRESETS),
    };
  }
}
