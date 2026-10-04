// The sprite atlas pre-rendered in Blender (albedo, and a screen-space normal
// map whose alpha marks painted armour), with its frame table. Frames are
// placed by their pivot, in metres.
import { texture, loadImage } from './gl.js';
import { SPRITE_STRIDE } from './renderer.js';

export class Atlas {
  constructor(gl, albedoImg, normalImg, meta) {
    this.meta = meta;
    this.w = meta.size[0];
    this.h = meta.size[1];
    this.albedo = texture(gl, { image: albedoImg, internal: gl.SRGB8_ALPHA8, mips: true });
    this.normal = texture(gl, { image: normalImg, internal: gl.RGBA8, mips: true });
    this.frames = {};
    for (const [name, f] of Object.entries(meta.frames)) {
      const ppm = f.ppm || 48;
      this.frames[name] = {
        name,
        w: f.w / ppm,
        h: f.h / ppm,
        ox: -f.px / ppm,
        oy: -(f.h - f.py) / ppm,
        u0: f.x / this.w,
        v0: f.y / this.h,
        u1: (f.x + f.w) / this.w,
        v1: (f.y + f.h) / this.h,
      };
    }
    this.tanks = meta.tanks || {};
  }

  has(name) {
    return !!this.frames[name];
  }

  // Writes one sprite instance. `o` carries the optional extras.
  put(list, name, x, y, rot = 0, flip = 1, scale = 1, tr = 1, tg = 1, tb = 1, paint = 0, alpha = 1, char = 0, blood = 0, glow = 0) {
    const f = this.frames[name];
    if (!f) return;
    const k = list.alloc();
    const D = list.data;
    D[k] = x;
    D[k + 1] = y;
    D[k + 2] = rot;
    D[k + 3] = flip;
    D[k + 4] = f.w * scale;
    D[k + 5] = f.h * scale;
    D[k + 6] = f.ox * scale;
    D[k + 7] = f.oy * scale;
    D[k + 8] = f.u0;
    D[k + 9] = f.v0;
    D[k + 10] = f.u1;
    D[k + 11] = f.v1;
    D[k + 12] = tr;
    D[k + 13] = tg;
    D[k + 14] = tb;
    D[k + 15] = paint;
    D[k + 16] = alpha;
    D[k + 17] = char;
    D[k + 18] = blood;
    D[k + 19] = glow;
  }
}

export async function loadAtlas(gl, base) {
  try {
    const [meta, a, n] = await Promise.all([
      fetch(`${base}.json`).then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }),
      loadImage(`${base}.webp`),
      loadImage(`${base}_n.webp`),
    ]);
    return new Atlas(gl, a, n, meta);
  } catch (e) {
    console.warn('sprite atlas missing, using stand-ins', e);
    return standInAtlas(gl);
  }
}

// Plain stand-in shapes, used only if the Blender atlas is missing.
function standInAtlas(gl) {
  const W = 1024;
  const H = 512;
  const ppm = 48;
  const ca = document.createElement('canvas');
  ca.width = W;
  ca.height = H;
  const cn = document.createElement('canvas');
  cn.width = W;
  cn.height = H;
  const A = ca.getContext('2d');
  const Nn = cn.getContext('2d');
  const frames = {};
  let x = 2;
  let y = 2;
  let rowH = 0;
  const add = (name, w, h, px, py, draw, paint) => {
    w = Math.ceil(w * ppm);
    h = Math.ceil(h * ppm);
    if (x + w > W) {
      x = 2;
      y += rowH + 4;
      rowH = 0;
    }
    A.save();
    A.translate(x, y);
    draw(A, w, h);
    A.restore();
    Nn.save();
    Nn.translate(x, y);
    Nn.fillStyle = paint ? 'rgba(128,128,255,1)' : 'rgba(128,128,255,0)';
    Nn.globalCompositeOperation = 'source-over';
    draw(Nn, w, h, true);
    Nn.restore();
    frames[name] = { x, y, w, h, px: px * ppm, py: py * ppm, ppm };
    x += w + 4;
    rowH = Math.max(rowH, h);
  };
  const body = (col) => (c, w, h, n) => {
    c.fillStyle = n ? c.fillStyle : col;
    c.beginPath();
    c.moveTo(w * 0.04, h * 0.45);
    c.lineTo(w * 0.96, h * 0.45);
    c.lineTo(w, h * 0.72);
    c.lineTo(w * 0.9, h);
    c.lineTo(w * 0.1, h);
    c.lineTo(0, h * 0.72);
    c.closePath();
    c.fill();
  };
  for (const t of ['warden', 'bulwark', 'lynx']) {
    for (let i = 0; i < 4; i++) add(`${t}_hull_${i}`, 7.4, 1.6, 3.7, 1.6, body('#9a9a92'), true);
    add(`${t}_turret`, 3.6, 1.0, 1.6, 1.0, (c, w, h, n) => {
      if (!n) c.fillStyle = '#a4a49c';
      c.beginPath();
      c.moveTo(0, h);
      c.lineTo(w * 0.12, 0);
      c.lineTo(w * 0.85, 0);
      c.lineTo(w, h);
      c.fill();
    }, true);
    add(`${t}_gun`, 6.4, 0.4, 1.4, 0.2, (c, w, h, n) => {
      if (!n) c.fillStyle = '#7a7a72';
      c.fillRect(0, h * 0.3, w, h * 0.4);
      c.fillRect(w * 0.15, 0, w * 0.12, h);
    }, true);
    add(`${t}_wreck_hull`, 7.4, 1.6, 3.7, 1.6, body('#1d1a17'), false);
    add(`${t}_wreck_turret`, 6.0, 1.0, 1.6, 1.0, (c, w, h, n) => {
      if (!n) c.fillStyle = '#211d19';
      c.fillRect(0, 0, w * 0.6, h);
      c.fillRect(w * 0.5, h * 0.4, w * 0.5, h * 0.2);
    }, false);
  }
  add('crew_commander', 0.6, 0.85, 0.3, 0.85, (c, w, h, n) => {
    if (!n) c.fillStyle = '#4a4a32';
    c.fillRect(w * 0.15, h * 0.35, w * 0.7, h * 0.65);
    if (!n) c.fillStyle = '#c9a07a';
    c.beginPath();
    c.arc(w * 0.5, h * 0.22, w * 0.22, 0, 7);
    c.fill();
  });
  const blob = (col) => (c, w, h, n) => {
    if (!n) c.fillStyle = col;
    c.beginPath();
    c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, 7);
    c.fill();
  };
  add('gore_helmet', 0.32, 0.22, 0.16, 0.11, blob('#3e3e2a'));
  add('gore_boot', 0.32, 0.18, 0.16, 0.09, blob('#1c1712'));
  for (let i = 0; i < 4; i++) add(`gore_chunk_${i}`, 0.24, 0.18, 0.12, 0.09, blob('#4a0806'));
  for (const d of ['debris_wheel', 'debris_sprocket', 'debris_hatch', 'debris_plate_0', 'debris_plate_1', 'debris_plate_2', 'debris_track', 'debris_jerrycan', 'debris_toolbox', 'debris_mg'])
    add(d, 0.8, 0.8, 0.4, 0.4, blob('#3a3a36'));
  for (const o of ['shell', 'shell_heavy', 'sabot', 'cluster', 'bomblet', 'napalm', 'missile', 'buster', 'roller', 'nuke', 'bomb', 'flare'])
    add(o, 0.8, 0.22, 0.4, 0.11, blob('#5a5a40'));
  add('jet', 16, 4, 8, 2, blob('#6a6e72'));
  add('parachute', 7, 5, 3.5, 5, blob('#56583a'));
  const meta = {
    size: [W, H],
    frames,
    tanks: Object.fromEntries(
      ['warden', 'bulwark', 'lynx'].map((t) => [t, { turret: [-0.2, 1.6], gun: [0.2, 0.5], muzzle: 5.0, hatch: [-0.6, 1.0], length: 7.4, height: 2.6, trackLength: 6.0 }]),
    ),
  };
  return new Atlas(gl, ca, cn, meta);
}

export { SPRITE_STRIDE };
