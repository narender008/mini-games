// The painting itself, kept on the GPU as two half-float images the size of
// the canvas (4:3):
//   pigment: rgb = optical density (absorbance, -ln reflectance) of the paint
//            layer, a = how much of the canvas it covers;
//   surface: r = paint thickness (impasto height), g = when it was painted
//            (seconds / 100, for how wet and glossy it still is), b = glitter,
//            a = how much of it is watercolour (matte, stained).
// Keeping density rather than colour makes mixing behave like paint: two
// opaque colours blended become a mix of pigments (blue and yellow make
// green, not grey), and watercolour glazes simply add density, darkening
// and mixing where washes overlap.
//
// A stroke is drawn in two steps. Each new piece of the stroke is stamped
// into a stroke buffer with a max blend (so the stroke never builds up
// where it overlaps itself): how much paint each spot got, the ridges the
// bristles left and the glitter. Every frame the stroke buffer is then
// laid over the committed painting ('base') into what the canvas shows
// ('live'), mixing with wet paint underneath; lifting the brush commits it.
// Bristles each carry their own load of paint and run dry at different
// points along the stroke, which leaves the streaky dry-brush ends of a real
// stroke. Undo replays the remaining strokes from their records over the
// floor, the painting under the last UNDO strokes (older ones are baked in).
import * as THREE from 'three';

export const TOOLS = { brush: 0, water: 1, glitter: 2, sponge: 3 };

// how many strokes can be taken back
const UNDO = 30;

// pigments: sRGB colour of a full-strength swatch, as density
export function densityOf(hex) {
  const c = new THREE.Color(hex); // linear
  const f = (x) => -Math.log(Math.max(0.004, Math.min(0.995, x)));
  return new THREE.Vector3(f(c.r), f(c.g), f(c.b));
}

const QUAD_VERT = /* glsl */ `
in vec3 position;
uniform vec4 uBox; // xmin, ymin, xmax, ymax in texels
uniform vec2 uRes;
out vec2 vPix;
void main() {
  vec2 p = mix(uBox.xy, uBox.zw, position.xy);
  vPix = p;
  gl_Position = vec4(p / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;

const COMMON = /* glsl */ `
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n11(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
float n21(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}`;

// one piece of a stroke: a capsule from p0 (radius r0) to p1 (radius r1)
const SEG_FRAG = /* glsl */ `
precision highp float;
uniform vec2 uP0;
uniform vec2 uP1;
uniform float uR0;
uniform float uR1;
uniform float uS0;
uniform float uS1;
uniform float uSeed;
uniform int uTool;
uniform float uLoad;
uniform float uBristles;
in vec2 vPix;
out vec4 o;
${COMMON}
void main() {
  vec2 d = uP1 - uP0;
  float L = length(d);
  vec2 dir = L > 1e-4 ? d / L : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 q = vPix - uP0;
  float along = dot(q, dir);
  float across = dot(q, nrm);
  float t = L > 1e-4 ? clamp(along / L, 0.0, 1.0) : 0.0;
  float r = mix(uR0, uR1, t);
  float dist = length(q - dir * clamp(along, 0.0, L));
  if (dist > r * 1.2) discard;
  float s = mix(uS0, uS1, t);
  // across the brush, -1..1 (the sign from which side of the line)
  float u = clamp((across >= 0.0 ? 1.0 : -1.0) * dist / r, -1.2, 1.2);
  float au = abs(u);
  // bristles are placed across the stroke: use the sideways offset (not the
  // distance, which rings round every stamp's round cap)
  float ul = clamp(across / r, -1.2, 1.2);
  float aul = abs(ul);
  float inSeg = 1.0 - smoothstep(0.0, r * 0.35, max(-along, along - L));
  float rag = (n21(vec2(s * 0.045 + uSeed, u * 2.5)) - 0.5) * 0.16;
  float amount = 0.0;
  float ridge = 0.0;
  float glit = 0.0;
  if (uTool == 0 || uTool == 2) {
    float body = 1.0 - smoothstep(0.8 + rag, 1.0 + rag * 0.5, au);
    // each bristle's own load; it runs dry after a while
    float bi = floor((ul * 0.5 + 0.5) * uBristles);
    float load = uLoad * (0.55 + 0.9 * h11(bi + uSeed * 13.0));
    float dry = smoothstep(load * 0.75, load * 1.3, s + (n11(s * 0.02 + bi * 3.1) - 0.5) * load * 0.35);
    // bristle grooves a couple of texels apart, and a few fatter clumps of bristles
    float fine = n11(ul * r * 0.45 + uSeed * 7.0);
    float clump = n11(ul * 3.1 + uSeed * 3.0);
    float streak = 0.62 + 0.38 * fine * (0.6 + 0.4 * clump);
    amount = body * (1.0 - dry) * mix(1.0, streak, 0.55);
    // bristle grooves, paint pushed up in a rim at the edges and where the
    // bristles run dry, a thick blob where the stroke began
    float start = 1.0 - smoothstep(0.0, r * 1.8, s);
    float rim = smoothstep(0.5, 0.9, aul) * (1.0 - smoothstep(0.95, 1.1, aul)) * inSeg;
    float tail = smoothstep(0.35, 0.7, dry) * (1.0 - smoothstep(0.7, 1.0, dry));
    ridge = amount * (0.35 + 0.6 * fine * (0.5 + 0.5 * clump)) + body * rim * (1.0 - dry) * 0.7 + body * tail * 0.45 + start * body * 0.75;
    if (uTool == 2) {
      glit = body * (0.6 + 0.4 * n21(vPix * 0.35));
      amount = body * 0.9;
      ridge *= 0.35;
    }
  } else if (uTool == 1) {
    // watercolour: soft, pooling at the edges, grainy
    float body = 1.0 - smoothstep(0.55 + rag, 1.05 + rag, au);
    float gran = 0.78 + 0.35 * n21(vPix * 0.55) * n21(vPix * 0.13 + uSeed);
    float pool = 0.6 + 0.55 * smoothstep(0.55, 0.95, au) * body;
    amount = body * pool * gran * (1.0 - 0.35 * smoothstep(uLoad * 0.8, uLoad * 1.6, s));
  } else {
    // sponge: a round stamp full of holes
    float body = 1.0 - smoothstep(0.7 + rag, 1.0, au);
    float pores = smoothstep(0.3, 0.55, n21(vPix * 0.16 + uSeed) * 0.7 + n21(vPix * 0.45) * 0.3);
    amount = body * mix(0.35, 1.0, pores);
  }
  o = vec4(clamp(amount, 0.0, 1.0), max(ridge, 0.0), clamp(glit, 0.0, 1.0), 0.0);
}`;

// lay the stroke buffer over the base painting
const COMPOSE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tP;
uniform sampler2D tH;
uniform sampler2D tS;
uniform vec2 uRes;
uniform int uTool;
uniform vec3 uAbs;
uniform float uNow;
uniform float uStrength;
in vec2 vPix;
layout(location = 0) out vec4 oP;
layout(location = 1) out vec4 oH;
void main() {
  vec2 uv = vPix / uRes;
  vec4 P = texture(tP, uv);
  vec4 H = texture(tH, uv);
  vec4 S = texture(tS, uv);
  float a = S.r * uStrength;
  if (a <= 0.002) { oP = P; oH = H; return; }
  float wet = P.a * (1.0 - smoothstep(0.0, 45.0, uNow - H.g * 100.0));
  if (uTool == 0) {
    // opaque paint, picking up some of the wet colour beneath
    vec3 brush = mix(uAbs, P.rgb, 0.42 * wet * P.a);
    float k = min(1.0, a * 1.05);
    P.rgb = mix(P.rgb, brush, k);
    P.a = max(P.a, a);
    H.r = max(H.r * (1.0 - 0.55 * k), S.g * 0.9 + H.r * 0.25 * k);
    H.g = uNow / 100.0;
    H.b *= 1.0 - k;
    H.a *= 1.0 - k;
  } else if (uTool == 1) {
    // a wash: density adds (glazing), wet washes bleed together
    P.rgb += uAbs * a * 0.42;
    P.rgb = min(P.rgb, vec3(6.0));
    P.a = max(P.a, min(1.0, a * 0.85));
    H.r *= 1.0 - a * 0.25;
    H.g = uNow / 100.0;
    H.a = max(H.a, a);
  } else if (uTool == 2) {
    // glitter gel: a clear tinted gel full of flakes
    P.rgb = mix(P.rgb, P.rgb + uAbs * 0.35, a);
    P.a = max(P.a, a * 0.7);
    H.r = max(H.r, S.g + 0.12 * a);
    H.b = max(H.b, S.b);
    H.g = uNow / 100.0;
  } else {
    // sponge: lifts the paint away, leaving a faint ghost
    float k = a * 0.92;
    P.rgb *= 1.0 - k;
    P.a *= 1.0 - k;
    H.r *= 1.0 - k * 0.9;
    H.b *= 1.0 - k;
    H.a *= 1.0 - k;
  }
  oP = P;
  oH = H;
}`;

const COPY_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tP;
uniform sampler2D tH;
uniform vec2 uRes;
in vec2 vPix;
layout(location = 0) out vec4 oP;
layout(location = 1) out vec4 oH;
void main() {
  vec2 uv = vPix / uRes;
  oP = texture(tP, uv);
  oH = texture(tH, uv);
}`;

const CLEAR_FRAG = /* glsl */ `
precision highp float;
in vec2 vPix;
layout(location = 0) out vec4 oP;
layout(location = 1) out vec4 oH;
void main() { oP = vec4(0.0); oH = vec4(0.0); }`;

function rtMRT(w, h) {
  const t = new THREE.WebGLRenderTarget(w, h, {
    count: 2,
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
  return t;
}

export class PaintEngine {
  constructor(renderer, width = 1024) {
    this.renderer = renderer;
    this.w = width;
    this.h = Math.round((width * 3) / 4);
    this.res = new THREE.Vector2(this.w, this.h);
    this.base = rtMRT(this.w, this.h);
    this.live = rtMRT(this.w, this.h);
    this.floor = rtMRT(this.w, this.h);
    this.stroke = new THREE.WebGLRenderTarget(this.w, this.h, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
    this.camera = new THREE.Camera();
    const quad = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
    const mat = (frag, uniforms, extra = {}) =>
      new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: QUAD_VERT,
        fragmentShader: frag,
        uniforms: { uBox: { value: new THREE.Vector4() }, uRes: { value: this.res }, ...uniforms },
        depthTest: false,
        depthWrite: false,
        ...extra,
      });
    this.segMat = mat(
      SEG_FRAG,
      {
        uP0: { value: new THREE.Vector2() },
        uP1: { value: new THREE.Vector2() },
        uR0: { value: 10 },
        uR1: { value: 10 },
        uS0: { value: 0 },
        uS1: { value: 0 },
        uSeed: { value: 0 },
        uTool: { value: 0 },
        uLoad: { value: 600 },
        uBristles: { value: 28 },
      },
      { blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor },
    );
    this.composeMat = mat(COMPOSE_FRAG, {
      tP: { value: null },
      tH: { value: null },
      tS: { value: this.stroke.texture },
      uTool: { value: 0 },
      uAbs: { value: new THREE.Vector3() },
      uNow: { value: 0 },
      uStrength: { value: 1 },
    });
    this.copyMat = mat(COPY_FRAG, { tP: { value: null }, tH: { value: null } });
    this.clearMat = mat(CLEAR_FRAG, {});
    this.mesh = new THREE.Mesh(quad, this.segMat);
    this.mesh.frustumCulled = false;
    this.history = [];
    this.baked = [];
    this.current = null;
    this.dirty = null;
    this.clock = 0;
    this.changed = 0; // bumps whenever the painting changes
    this.clearAll();
  }

  get textures() {
    return { pigment: this.live.textures[0], surface: this.live.textures[1] };
  }

  // ------------------------------------------------------------ drawing passes

  _pass(material, target, box = null) {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = false;
    this.mesh.material = material;
    const b = box || [0, 0, this.w, this.h];
    material.uniforms.uBox.value.set(b[0], b[1], b[2], b[3]);
    r.setRenderTarget(target);
    r.render(this.mesh, this.camera);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
  }

  _copy(from, to, box = null) {
    this.copyMat.uniforms.tP.value = from.textures[0];
    this.copyMat.uniforms.tH.value = from.textures[1];
    this._pass(this.copyMat, to, box);
  }

  clearAll() {
    this._pass(this.clearMat, this.floor);
    this._pass(this.clearMat, this.base);
    this._pass(this.clearMat, this.live);
    this.history = [];
    this.baked = [];
    this.changed++;
  }

  // every stroke in the painting, oldest first
  get strokes() {
    return this.baked.concat(this.history);
  }

  // ------------------------------------------------------------ strokes

  // brush: { tool: 'brush'|'water'|'glitter'|'sponge', color: hex, radius (texels), load (texels) }
  begin(brush, x, y, pressure = 0.5, time = this.clock) {
    this.end();
    const seed = Math.random() * 100;
    this.current = { brush: { ...brush }, seed, time, pts: [] };
    this.r = this.renderer;
    // clear the stroke buffer
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.stroke);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.setRenderTarget(prev);
    this.dirty = null;
    this._point(x, y, pressure);
  }

  move(x, y, pressure = 0.5) {
    if (!this.current) return;
    this._point(x, y, pressure);
  }

  _radius(b, pressure) {
    return b.radius * (b.tool === 'sponge' ? 1 : 0.55 + 0.9 * Math.min(1, Math.max(0, pressure)));
  }

  _point(x, y, pressure) {
    const c = this.current;
    const b = c.brush;
    const pts = c.pts;
    const r = this._radius(b, pressure);
    const last = pts[pts.length - 1];
    let len = 0;
    if (last) {
      const d = Math.hypot(x - last[0], y - last[1]);
      if (d < Math.max(0.6, r * 0.08)) return;
      len = last[3] + d;
    }
    const p = [x, y, r, len];
    pts.push(p);
    this._segment(last || p, p, c);
  }

  _segment(a, b, c) {
    const br = c.brush;
    const u = this.segMat.uniforms;
    u.uP0.value.set(a[0], a[1]);
    u.uP1.value.set(b[0], b[1]);
    // a stroke eases in over its first few millimetres, like a brush landing
    const ease = (s) => 0.6 + 0.4 * Math.min(1, s / (br.radius * 1.5));
    u.uR0.value = a[2] * ease(a[3]);
    u.uR1.value = b[2] * ease(b[3]);
    u.uS0.value = a[3];
    u.uS1.value = b[3];
    u.uSeed.value = c.seed;
    u.uTool.value = TOOLS[br.tool] ?? 0;
    u.uLoad.value = br.load ?? 800;
    u.uBristles.value = br.bristles ?? 26;
    const R = Math.max(u.uR0.value, u.uR1.value) * 1.25 + 2;
    const box = [Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R];
    this._pass(this.segMat, this.stroke, box);
    const d = this.dirty;
    this.dirty = d ? [Math.min(d[0], box[0]), Math.min(d[1], box[1]), Math.max(d[2], box[2]), Math.max(d[3], box[3])] : box;
    this.needCompose = true;
  }

  _compose(c, box, under = this.base) {
    const u = this.composeMat.uniforms;
    u.tP.value = under.textures[0];
    u.tH.value = under.textures[1];
    u.uTool.value = TOOLS[c.brush.tool] ?? 0;
    u.uAbs.value.copy(densityOf(c.brush.color ?? 0xffffff));
    u.uNow.value = c.time + 0.5;
    u.uStrength.value = 1;
    const b = box.map((v, i) => Math.max(0, Math.min(i % 2 ? this.h : this.w, v)));
    b[0] = Math.floor(b[0]);
    b[1] = Math.floor(b[1]);
    b[2] = Math.ceil(b[2]);
    b[3] = Math.ceil(b[3]);
    if (b[2] <= b[0] || b[3] <= b[1]) return;
    this._pass(this.composeMat, this.live, b);
  }

  // per frame: show the stroke so far
  update(dt) {
    this.clock += dt;
    if (this.current && this.needCompose && this.dirty) {
      this.needCompose = false;
      this._compose(this.current, this.dirty);
      this.changed++;
    }
  }

  end() {
    const c = this.current;
    if (!c) return null;
    if (this.needCompose && this.dirty) this._compose(c, this.dirty);
    this.needCompose = false;
    if (this.dirty) this._copy(this.live, this.base, this.dirty.map((v) => Math.round(v)));
    this.current = null;
    this.history.push(c);
    if (this.history.length > UNDO) {
      this._bake();
      this._copy(this.base, this.live);
    }
    this.changed++;
    return c;
  }

  get painting() {
    return !!this.current;
  }

  // Take back the last stroke: replay the others onto a clean canvas.
  undo() {
    this.end();
    if (!this.history.length) return false;
    this.history.pop();
    this.replay(this.history);
    return true;
  }

  // paint recorded strokes again over the floor (baking in any past the undo limit)
  replay(strokes) {
    this.history = strokes.slice();
    this._bake();
    this._copy(this.floor, this.base);
    for (const s of this.history) this._lay(s, this.base);
    this._copy(this.base, this.live);
    this.dirty = null;
    this.needCompose = false;
    this.changed++;
  }

  // strokes past the undo limit go into the floor for good
  _bake() {
    while (this.history.length > UNDO) {
      const s = this.history.shift();
      this._lay(s, this.floor);
      this.baked.push(s);
    }
  }

  // one recorded stroke painted again onto `under` (through live)
  _lay(s, under) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.stroke);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.setRenderTarget(prev);
    this.dirty = null;
    for (let i = 0; i < s.pts.length; i++) {
      const p = s.pts[i];
      const last = s.pts[i - 1] || p;
      this._segment(last, p, s);
    }
    if (this.dirty) {
      this._compose(s, this.dirty, under);
      this._copy(this.live, under, this.dirty.map((v) => Math.round(v)));
    }
  }

  // commit whatever is live (after the magic fill, say)
  commitLive() {
    this._copy(this.live, this.base);
    this.changed++;
  }

  // copy base into live (drop what an effect drew into live)
  resetLive() {
    this._copy(this.base, this.live);
    this.changed++;
  }

  dispose() {
    this.base.dispose();
    this.live.dispose();
    this.floor.dispose();
    this.stroke.dispose();
    for (const m of [this.segMat, this.composeMat, this.copyMat, this.clearMat]) m.dispose();
    this.mesh.geometry.dispose();
  }
}
