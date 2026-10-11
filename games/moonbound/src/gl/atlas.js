// The sprite atlases pre-rendered in Blender (blender/build.sh). A "set" is
// one json plus its pages (`<set>_<n>.webp` albedo 2048², `<set>_<n>_n.webp`
// normal 1024²: RG normal xy, B gloss, A glow). The sets in use (the heroine
// with her weapon, the area, its bosses, common effects) are uploaded together
// as the layers of two texture arrays, so every sprite on screen is drawn by
// one instanced call. Changing area rebuilds the arrays (behind a loading
// card); frames are looked up by name, so nothing holds stale references.
//
// Frames are placed by their pivot (the ground point under them), in screen
// metres. Animations: atlas.anim(prefix) -> {n, fps, loop, dirs, mirror, at(i, angle)}.
import { loadImage } from './gl.js';

const EMPTY = Object.freeze({ n: 0, fps: 1, loop: true, dirs: 1, frames: [], flips: [] });

export class Atlas {
  constructor(gl, base, opts = {}) {
    this.gl = gl;
    this.base = base; // url prefix of the sprite folder
    this.half = !!opts.half; // low quality: halve the pages at upload
    this.meta = new Map(); // set -> json
    this.sets = [];
    this.albedo = null;
    this.normal = null;
    this.layers = 0;
    this.frames = new Map();
    this.anims = new Map();
    this.missing = new Set();
    this.generation = 0;
    this.anchors = {};
    this.values = {};
  }

  async json(set) {
    if (this.meta.has(set)) return this.meta.get(set);
    const r = await fetch(`${this.base}${set}.json`);
    if (!r.ok) throw new Error(`sprites ${set}: ${r.status}`);
    const m = await r.json();
    this.meta.set(set, m);
    return m;
  }

  // Make exactly these sets resident. onProgress(0..1).
  async use(sets, onProgress) {
    sets = [...new Set(sets)];
    const same = sets.length === this.sets.length && sets.every((s) => this.sets.includes(s));
    if (same && this.albedo) return;
    const metas = [];
    for (const s of sets) {
      try {
        metas.push([s, await this.json(s)]);
      } catch (e) {
        console.warn(e.message); // a set that is not built yet: its sprites are simply missing
      }
    }
    const pages = metas.reduce((n, [, m]) => n + m.pages, 0);
    let done = 0;
    const tick = () => onProgress?.(++done / Math.max(1, pages * 2));
    const imgs = [];
    await Promise.all(
      metas.flatMap(([s, m]) =>
        Array.from({ length: m.pages }, (_, i) =>
          Promise.all([
            loadImage(`${this.base}${s}_${i}.webp`).then((x) => (tick(), x)),
            loadImage(`${this.base}${s}_${i}_n.webp`).then((x) => (tick(), x)),
          ]).then(([a, n]) => imgs.push({ s, i, a, n })),
        ),
      ),
    );
    imgs.sort((p, q) => (p.s === q.s ? p.i - q.i : sets.indexOf(p.s) - sets.indexOf(q.s)));
    this.build(metas, imgs);
    this.sets = sets;
  }

  build(metas, imgs) {
    const gl = this.gl;
    if (this.albedo) gl.deleteTexture(this.albedo);
    if (this.normal) gl.deleteTexture(this.normal);
    const P = 2048 >> (this.half ? 1 : 0);
    const NP = 1024 >> (this.half ? 1 : 0);
    const n = Math.max(1, imgs.length);
    const make = (internal, size, key) => {
      const levels = Math.floor(Math.log2(size)) + 1;
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, internal, size, size, n);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      imgs.forEach((im, layer) => {
        if (this.half) shrinkInto(gl, t, internal, im[key], size, layer);
        else gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, size, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, im[key]);
      });
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (imgs.length) gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      return t;
    };
    this.albedo = make(gl.SRGB8_ALPHA8, P, 'a');
    this.normal = make(gl.RGBA8, NP, 'n');
    freeScratch(gl);
    this.layers = n;
    // frames: layer = the image's index in imgs
    this.frames.clear();
    this.anims.clear();
    this.anchors = {};
    this.values = {};
    const layerOf = new Map(imgs.map((im, k) => [`${im.s}:${im.i}`, k]));
    for (const [s, m] of metas) {
      const PG = m.page;
      for (const [name, f] of Object.entries(m.frames)) {
        const [p, x, y, w, h, px, py, ppm] = f;
        const mpp = 1 / ppm; // screen metres per atlas pixel
        this.frames.set(name, {
          name,
          w: w * mpp,
          h: h * mpp,
          ox: -px * mpp,
          oy: -py * mpp,
          u0: x / PG,
          v0: y / PG,
          u1: (x + w) / PG,
          v1: (y + h) / PG,
          layer: layerOf.get(`${s}:${p}`) ?? 0,
        });
      }
      for (const [k, v] of Object.entries(m.anims || {})) this.anims.set(k, { ...v, set: s, built: null });
      for (const kind of ['anchors', 'values']) {
        for (const [k, v] of Object.entries(m[kind] || {})) Object.assign((this[kind][k] ||= {}), v);
      }
    }
    this.generation++;
  }

  has(name) {
    return this.frames.has(name);
  }

  frame(name) {
    const f = this.frames.get(name);
    if (!f && !this.missing.has(name)) this.missing.add(name); // listed by __mb.state() under ?debug
    return f || null;
  }

  // An animation: frames[d][i] for every direction d (null for a direction that is drawn mirrored).
  anim(prefix) {
    const a = this.anims.get(prefix);
    if (!a) {
      this.missing.add(prefix);
      return EMPTY;
    }
    if (a.built) return a.built;
    const dirs = a.dirs || 1;
    const frames = [];
    const flips = [];
    const srcDir = [];
    for (let d = 0; d < dirs; d++) {
      let sd = d;
      let flip = 1;
      if (dirs > 1 && a.mirror && Math.cos((d * 2 * Math.PI) / dirs) < -1e-6) {
        sd = (((dirs >> 1) - d) % dirs + dirs) % dirs;
        flip = -1;
      }
      srcDir.push(sd);
      flips.push(flip);
    }
    for (let d = 0; d < dirs; d++) {
      const row = [];
      for (let i = 0; i < a.n; i++) {
        const nm = dirs > 1 ? `${prefix}_d${srcDir[d]}_${i}` : `${prefix}_${i}`;
        row.push(this.frames.get(nm) || null);
      }
      frames.push(row);
    }
    const built = {
      n: a.n,
      fps: a.fps || 12,
      loop: a.loop !== false,
      dirs,
      frames,
      flips,
      // direction index nearest to a ground-plane facing angle (0 east, pi/2 south)
      dir(angle) {
        if (dirs <= 1) return 0;
        const step = (2 * Math.PI) / dirs;
        return ((Math.round(angle / step) % dirs) + dirs) % dirs;
      },
    };
    a.built = built;
    return built;
  }

  anchor(kind, name) {
    return this.anchors[kind]?.[name] || null;
  }
  value(kind, name) {
    return this.values[kind]?.[name];
  }
}

// Low quality: halve a page on the GPU. The full page goes into a scratch
// texture, then a linear 2:1 framebuffer blit averages it into the array
// layer. (A 2D canvas would premultiply alpha and wipe the normals, whose
// alpha is the glow mask.)
const scratch = new Map();
function shrinkInto(gl, array, internal, img, size, layer) {
  const full = size * 2;
  let s = scratch.get(internal);
  if (!s) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, internal, full, full);
    s = { tex, read: gl.createFramebuffer(), draw: gl.createFramebuffer() };
    scratch.set(internal, s);
  }
  gl.bindTexture(gl.TEXTURE_2D, s.tex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, full, full, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s.read);
  gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, s.tex, 0);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, s.draw);
  gl.framebufferTextureLayer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, array, 0, layer);
  gl.blitFramebuffer(0, 0, full, full, 0, 0, size, size, gl.COLOR_BUFFER_BIT, gl.LINEAR);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
}

// the scratch textures are only needed while uploading
export function freeScratch(gl) {
  for (const s of scratch.values()) {
    gl.deleteTexture(s.tex);
    gl.deleteFramebuffer(s.read);
    gl.deleteFramebuffer(s.draw);
  }
  scratch.clear();
}
