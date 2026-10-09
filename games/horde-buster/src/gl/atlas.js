// The sprite atlas pre-rendered in Blender (blender/build.sh): albedo pages
// and normal pages (alpha = glow mask), uploaded as the layers of two texture
// arrays so every sprite in a frame is one instanced draw. Frames are placed
// by their pivot, in world units.
import { loadImage } from './gl.js';

export class Atlas {
  constructor(gl, meta, albedoPages, normalPages) {
    this.meta = meta;
    const P = meta.page;
    const n = albedoPages.length;
    const levels = Math.floor(Math.log2(P)) + 1;
    const make = (internal, pages) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, internal, P, P, n);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      pages.forEach((img, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, P, P, 1, gl.RGBA, gl.UNSIGNED_BYTE, img));
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      return t;
    };
    this.albedo = make(gl.SRGB8_ALPHA8, albedoPages);
    this.normal = make(gl.RGBA8, normalPages);
    this.frames = {};
    this.missing = new Set();
    const upm = meta.unitsPerMetre || 54; // world units per Blender metre
    for (const [name, f] of Object.entries(meta.frames)) {
      const upp = upm / (f.ppm || 56); // world units per atlas pixel
      this.frames[name] = {
        name,
        w: f.w * upp,
        h: f.h * upp,
        ox: -f.px * upp,
        oy: -f.py * upp,
        u0: f.x / P,
        v0: f.y / P,
        u1: (f.x + f.w) / P,
        v1: (f.y + f.h) / P,
        layer: f.p || 0,
      };
    }
    this.anchors = meta.anchors || {};
    this.anims = {};
  }

  has(name) {
    return !!this.frames[name];
  }

  // a frame by name, or the first fallback that exists
  get(name, ...fallbacks) {
    let f = this.frames[name];
    for (let i = 0; !f && i < fallbacks.length; i++) f = this.frames[fallbacks[i]];
    if (!f) this.missing.add(name); // listed by __hb.state() under ?debug
    return f || null;
  }

  // frames prefix_0, prefix_1 ... (cached); falls back to other prefixes
  anim(prefix, ...fallbacks) {
    const key = prefix;
    let a = this.anims[key];
    if (a) return a;
    for (const pre of [prefix, ...fallbacks]) {
      a = [];
      for (let i = 0; this.frames[`${pre}_${i}`]; i++) a.push(this.frames[`${pre}_${i}`]);
      if (a.length) break;
    }
    if (!a.length) a = [this.get(prefix, ...fallbacks)].filter(Boolean);
    this.anims[key] = a;
    return a;
  }

  anchor(kind, name, fallback = [0, 0]) {
    return this.anchors[kind]?.[name] || fallback;
  }
}

export async function loadAtlas(gl, base, onProgress) {
  const meta = await fetch(`${base}.json`).then((r) => {
    if (!r.ok) throw new Error(`sprites ${r.status}`);
    return r.json();
  });
  const n = meta.pages;
  let done = 0;
  const tick = (img) => {
    done++;
    onProgress?.(done / (n * 2));
    return img;
  };
  const albedo = [];
  const normal = [];
  await Promise.all(
    Array.from({ length: n }, (_, i) =>
      Promise.all([loadImage(`${base}_${i}.webp`).then(tick), loadImage(`${base}_${i}_n.webp`).then(tick)]).then(([a, b]) => {
        albedo[i] = a;
        normal[i] = b;
      }),
    ),
  );
  return new Atlas(gl, meta, albedo, normal);
}
