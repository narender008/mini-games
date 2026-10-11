// The sprite atlases pre-rendered in Blender (blender/build.sh). A "set" is
// one json plus its pages (`<set>_<n>.webp` albedo 2048², `<set>_<n>_n.webp`
// normal 1024²: RG normal xy, B gloss, A glow). The sets in use (the heroine
// with her weapon, the area, the chamber's boss, common effects) are uploaded
// together as the layers of two texture arrays, so every sprite on screen is
// drawn by one instanced call. Changing area rebuilds the arrays (behind a
// loading card), which also lets go of a boss's pages once its chamber is
// left; frames are looked up by name, so nothing holds stale references.
//
// Frames are placed by their pivot (the ground point under them), in screen
// metres. Animations: atlas.anim(prefix) -> {n, fps, loop, dirs, mirror, at(i, angle)}.
import { loadImage } from './gl.js';

const EMPTY = Object.freeze({ n: 0, fps: 1, loop: true, dirs: 1, frames: [], flips: [] });

export class Atlas {
  constructor(gl, base, opts = {}) {
    this.gl = gl;
    this.base = base; // url prefix of the sprite folder
    this.half = !!opts.half; // low quality and phones: halve the pages at upload
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
    this.builtHalf = false; // the size the resident arrays were built at
    this.want = []; // the sets last asked for
    this.queued = 0; // rebuilds asked for and not yet done
    this.pending = Promise.resolve();
    this.onFail = null; // (error) => promise: a load that failed even after its retries runs again when it resolves
  }

  async json(set) {
    if (this.meta.has(set)) return this.meta.get(set);
    const m = await download(`${this.base}${set}.json`, (r) => r.json());
    this.meta.set(set, m);
    return m;
  }

  // are exactly these sets resident, at the current size?
  resident(sets) {
    return !!this.albedo && this.builtHalf === this.half && sets.length === this.sets.length && sets.every((s) => this.sets.includes(s));
  }

  // Make exactly these sets resident. onProgress(0..1). Rebuilds run one at a time.
  use(sets, onProgress) {
    this.want = sets;
    this.queued++;
    const next = () => this.settle(sets, onProgress).finally(() => this.queued--);
    return (this.pending = this.pending.then(next, next));
  }

  async settle(sets, onProgress) {
    for (;;) {
      try {
        return await this.load(sets, onProgress);
      } catch (e) {
        if (!this.onFail) throw e;
        console.error(e);
        await this.onFail(e);
      }
    }
  }

  async load(sets, onProgress) {
    sets = [...new Set(sets)];
    if (this.resident(sets)) return;
    const metas = [];
    for (const s of sets) {
      try {
        metas.push([s, await this.json(s)]);
      } catch (e) {
        if (e.status !== 404) throw e;
        console.warn(e.message); // a set that is not built yet: its sprites are simply missing
      }
    }
    const pages = metas.flatMap(([s, m]) => Array.from({ length: m.pages }, (_, i) => ({ s, i })));
    let done = 0;
    const tick = () => onProgress?.(++done / Math.max(1, pages.length * 4));
    const page = (url) => download(url, (r) => r.blob()).then((b) => (tick(), b));
    // the compressed pages download together; then the old arrays are let go and each page is decoded, uploaded
    // and dropped in turn, so no more than one decoded page is held at a time
    const files = await Promise.all(pages.map(({ s, i }) => Promise.all([page(`${this.base}${s}_${i}.webp`), page(`${this.base}${s}_${i}_n.webp`)])));
    const gl = this.gl;
    if (this.albedo) gl.deleteTexture(this.albedo);
    if (this.normal) gl.deleteTexture(this.normal);
    this.sets = [];
    const half = this.half;
    const n = Math.max(1, pages.length);
    const kinds = [
      [gl.SRGB8_ALPHA8, 2048 >> (half ? 1 : 0)],
      [gl.RGBA8, 1024 >> (half ? 1 : 0)],
    ];
    [this.albedo, this.normal] = kinds.map(([internal, size]) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.floor(Math.log2(size)) + 1, internal, size, size, n);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    });
    this.layers = n;
    this.index(metas, pages);
    for (let k = 0; k < kinds.length; k++) {
      const [internal, size] = kinds[k];
      const t = k ? this.normal : this.albedo;
      for (let layer = 0; layer < files.length; layer++) {
        const img = await decode(files[layer][k]);
        files[layer][k] = null;
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        if (half) shrinkInto(gl, t, internal, img, size, layer);
        else gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, size, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
        tick();
      }
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      if (files.length) gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      freeScratch(gl);
    }
    this.sets = sets;
    this.builtHalf = half;
  }

  // the frame and animation tables: a frame's layer is its page's index in `pages`
  index(metas, pages) {
    this.frames.clear();
    this.anims.clear();
    this.anchors = {};
    this.values = {};
    const layerOf = new Map(pages.map((pg, k) => [`${pg.s}:${pg.i}`, k]));
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

// a download, tried up to three times (0.5 s, then 1.5 s apart) so a dropped connection does not lose it; a file
// that is not there (404) is not asked for again
async function download(url, read) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw Object.assign(new Error(`could not load ${url} (${r.status})`), { status: r.status });
      return await read(r);
    } catch (e) {
      if (attempt === 2 || e.status === 404) throw e;
      await new Promise((ok) => setTimeout(ok, attempt ? 1500 : 500));
    }
  }
}

// a downloaded page as an image (uploaded unpremultiplied, which keeps the normal pages' glow alpha apart from their colour)
async function decode(blob) {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
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
