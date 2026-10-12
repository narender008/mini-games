// This frame's draw lists and the helpers entities use to fill them.
import { InstanceList, SpriteList } from '../gl/renderer.js';

export class DrawLists {
  constructor() {
    this.far = new InstanceList(20, 32);
    this.cliffs = new InstanceList(8, 64);
    this.ground = new InstanceList(16, 128);
    this.blobs = new InstanceList(4, 128);
    this.shadows = new InstanceList(20, 256);
    this.sprites = new SpriteList(1024);
    this.bursts = new InstanceList(16, 128);
    this.arcs = new InstanceList(16, 32);
    this.glows = new InstanceList(16, 128);
    this.glowsUnder = new InstanceList(16, 64);
    this.text = new InstanceList(12, 128);
  }
  clear() {
    this.far.clear();
    this.cliffs.clear();
    this.ground.clear();
    this.blobs.clear();
    this.shadows.clear();
    this.sprites.clear();
    this.bursts.clear();
    this.arcs.clear();
    this.glows.clear();
    this.glowsUnder.clear();
    this.text.clear();
  }
}

const SIN_E = Math.sin((50 * Math.PI) / 180);
const COS_E = Math.cos((50 * Math.PI) / 180);

export class Painter {
  constructor(lists, atlas, lights) {
    this.L = lists;
    this.atlas = atlas;
    this.lights = lights;
    this.time = 0;
    this.placeholders = true;
    this.O = { flash: 0, dissolve: 0, alpha: 1, seed: 0, tr: 0, tg: 0, tb: 0, ta: 0, shadow: false, depthBias: 0, scale: 1, flip: 1, height: 1.6, noPlaceholder: false };
    this.P = { f: null, flip: 1, n: 0, fps: 1 };
  }

  // the shared draw options: reset, then set what differs (no object per call)
  opt() {
    const o = this.O;
    o.flash = 0;
    o.dissolve = 0;
    o.alpha = 1;
    o.seed = 0;
    o.tr = o.tg = o.tb = o.ta = 0;
    o.shadow = false;
    o.depthBias = 0;
    o.scale = 1;
    o.flip = 1;
    o.height = 1.6;
    o.noPlaceholder = false;
    return o;
  }

  // a frame of an animation facing `angle`; i = frame index (clamped or wrapped by the caller)
  pose(prefix, angle, i) {
    const a = this.atlas.anim(prefix);
    if (!a.n) return null;
    const d = a.dir(angle);
    const row = a.frames[d];
    const k = Math.max(0, Math.min(a.n - 1, i | 0));
    const P = this.P;
    P.f = row[k];
    P.flip = a.flips[d];
    P.n = a.n;
    P.fps = a.fps;
    return P;
  }

  // frame index for a fraction k (0..1) of a one-shot animation, whatever its frame count
  frameOf(prefix, k) {
    const n = this.atlas.anim(prefix).n;
    return n ? Math.max(0, Math.min(n - 1, Math.floor(k * n))) : 0;
  }

  // frame index for time t of a one-shot lasting `total` seconds whose key frame (the atlas's `kind` value for the
  // animation, e.g. the hit) must show at tKey: the frames before and after it are spread over the time either side
  frameKeyed(prefix, t, tKey, total, kind = 'hit') {
    const n = this.atlas.anim(prefix).n;
    if (!n) return 0;
    const v = this.atlas.value(kind, prefix);
    const kf = Array.isArray(v) ? v[0] : v;
    if (kf == null || !(tKey > 0) || !(total > tKey)) return Math.max(0, Math.min(n - 1, Math.floor((t / total) * n)));
    const i = t < tKey ? Math.floor((t / tKey) * kf) : kf + Math.floor(((t - tKey) / (total - tKey)) * (n - kf));
    return Math.max(0, Math.min(n - 1, i));
  }

  // frame index for a time into an animation
  frameAt(prefix, t, loop = true) {
    const a = this.atlas.anim(prefix);
    if (!a.n) return 0;
    const i = Math.floor(t * a.fps);
    return loop ? ((i % a.n) + a.n) % a.n : Math.min(a.n - 1, i);
  }

  // o (from opt()): flash, dissolve, alpha, seed, tint tr tg tb ta (ta > 0 an aura, < 0 an afterimage of light),
  // shadow, depthBias, scale
  sprite(f, flip, x, y, z, o = this.opt()) {
    if (!f) return;
    const sc = o.scale;
    this.L.sprites.put(f, x, y, z, y + o.depthBias, flip, sc, o.flash, o.dissolve, o.alpha, o.seed, o.tr, o.tg, o.tb, o.ta);
    if (o.shadow && z < 0.6) this.shadow(f, flip, x, y, sc, o.alpha, o.dissolve);
  }

  shadow(f, flip, x, y, sc, alpha, dissolve) {
    const S = this.L.shadows;
    const k = S.alloc();
    const D = S.data;
    D[k] = x;
    D[k + 1] = y * SIN_E;
    D[k + 2] = f.w * sc * flip;
    D[k + 3] = f.h * sc;
    D[k + 4] = f.u0;
    D[k + 5] = f.v0;
    D[k + 6] = f.u1;
    D[k + 7] = f.v1;
    D[k + 8] = f.ox * sc;
    D[k + 9] = f.oy * sc;
    D[k + 10] = f.layer;
    D[k + 11] = y;
    D[k + 12] = 0;
    D[k + 13] = dissolve;
    D[k + 14] = alpha;
    D[k + 15] = 0;
    D[k + 16] = D[k + 17] = D[k + 18] = D[k + 19] = 0;
  }

  // an animated actor; returns the frame drawn (or null)
  actor(prefix, angle, i, x, y, z, o = this.opt()) {
    const p = this.pose(prefix, angle, i);
    if (!p || !p.f) {
      if (this.placeholders) this.placeholder(x, y, z, o);
      return null;
    }
    this.sprite(p.f, p.flip, x, y, z, o);
    return p.f;
  }

  prop(name, x, y, z, o = this.opt()) {
    const f = name ? this.atlas.frame(name) : null;
    if (!f) {
      if (this.placeholders && !o.noPlaceholder) this.placeholder(x, y, z, o);
      return null;
    }
    this.sprite(f, o.flip, x, y, z, o);
    return f;
  }

  placeholder(x, y, z, o) {
    const h = o.height;
    this.L.glows.push16(x, y, z + h * 0.5, h * 0.35, 0.4, 0.5, 0.7, o.alpha * 0.6, 0, 0, 0, 0, 0, 0, 0, 0);
  }

  blob(x, y, r, k = 0.5) {
    const B = this.L.blobs;
    const i = B.alloc();
    const D = B.data;
    D[i] = x;
    D[i + 1] = y;
    D[i + 2] = r;
    D[i + 3] = k;
  }

  glow(kind, x, y, z, size, r, g, b, a, seed = 0, stretch = 0, rot = 0, p0 = 0, under = false) {
    (under ? this.L.glowsUnder : this.L.glows).push16(x, y, z, size, r, g, b, a, kind, seed, stretch, rot, p0, 0, 0, 0);
  }

  ground(kind, x, y, sx, sy, r, g, b, a, progress = 0, rot = 0, seed = 0, p = 0) {
    this.L.ground.push16(x, y, sx, sy, r, g, b, a, kind, progress, rot, seed, p, 0, 0, 0);
  }

  light(x, y, z, radius, r, g, b) {
    this.lights.add(x, y, z, radius, r, g, b);
  }
}

export { SIN_E, COS_E };
