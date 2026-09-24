// Rose: a few hard little achenes, oval seed leaves, then a small bush of
// three canes with hooked prickles and glossy compound leaves (bronze-red
// when young) of toothed leaflets. Each cane ends in a pointed bud wrapped
// in sepals; the sepals fold back and the velvety petals open outer ones
// first, their rims rolling back, round a tight spiral heart.
import * as THREE from 'three';
import { PLANTS, mulberry32 } from '../config.js';
import { leafMaterial, petalMaterial } from './materials.js';
import { Path, sheet, tube, blob, frameAlong, stalkPath, paint, paintNormal, lin, mixRGB, mix, ease, quant, sat, fbm, noise2, TAU } from './common.js';
import { FlowerBase } from './flower.js';
import { SoilCover } from './soilcover.js';
import { Seedling } from './seedling.js';
import { leafAtlas, BLADE_UV, PLAIN_UV, STEM_U } from './textures.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const PETAL_UV = [0.0, 0.84, 0, 1];
const PLAIN_P = [0.9, 0.97, 0.2, 0.8];

const sm = (a, b, x) => {
  const k = sat((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

let shared = null;
function assets() {
  if (shared) return shared;
  const leaf = leafAtlas({
    c1: [0.13, 0.26, 0.08],
    c2: [0.19, 0.34, 0.11],
    vein: [0.26, 0.4, 0.14],
    rib: [0.34, 0.46, 0.18],
    edge: [0.2, 0.2, 0.08],
    veins: 7,
    angle: 0.36,
    teeth: 13,
    toothDepth: 0.07,
    net: 26,
    netK: 0.15,
    quilt: 0.45,
    plain1: [0.26, 0.42, 0.16],
    plain2: [0.32, 0.48, 0.2],
    stem1: [0.26, 0.4, 0.16],
    stem2: [0.32, 0.46, 0.2],
  });
  // velvet petals: soft mottling, faint veins fanning from the base
  const map = paint(256, 256, (u, v, o) => {
    if (u > 0.86) {
      const l = 0.88 + 0.1 * fbm(u * 30, v * 30, 3);
      o[0] = o[1] = o[2] = l;
      return;
    }
    const x = u / 0.84;
    const th = Math.atan2(x - 0.5, v + 0.15);
    const vein = Math.pow(Math.abs(Math.cos(th * 26 + fbm(x * 3, v * 3, 2) * 2)), 10);
    let l = 0.9 + 0.1 * fbm(x * 5, v * 5, 4) - 0.04 * vein;
    l *= 0.9 + 0.1 * sm(0.0, 0.3, v);
    o[0] = o[1] = o[2] = Math.min(1, l);
  });
  const normalMap = paintNormal(256, 256, (u, v) => {
    if (u > 0.86) return fbm(u * 40, v * 40, 2) * 0.2;
    const x = u / 0.84;
    const th = Math.atan2(x - 0.5, v + 0.15);
    return Math.pow(Math.abs(Math.cos(th * 26 + fbm(x * 3, v * 3, 2) * 2)), 6) * 0.2 + fbm(x * 10, v * 10, 3) * 0.25;
  }, 1.4);
  shared = {
    petalMap: map,
    petalNormal: normalMap,
    blooms: new Map(),
    foliage: leafMaterial({ map: leaf.map, normalMap: leaf.normalMap, normalScale: 0.6, vertexColors: true, alphaTest: 0.5, roughness: 0.55, translucency: 0.4 }),
  };
  return shared;
}

// Petals per colour: velvet sheen in the petal's own hue (a neutral sheen
// would wash a red rose pink at the rims).
function bloomMaterial(a, rgb) {
  const key = rgb.map((v) => v.toFixed(3)).join(',');
  let m = a.blooms.get(key);
  if (!m) {
    m = petalMaterial({ map: a.petalMap, normalMap: a.petalNormal, normalScale: 0.5, vertexColors: true, translucency: 0.5, roughness: 0.62, sheen: 0.6 });
    m.sheenColor.setRGB(rgb[0] * 0.45 + 0.01, rgb[1] * 0.45 + 0.01, rgb[2] * 0.45 + 0.01);
    m.sheenRoughness = 0.45;
    a.blooms.set(key, m);
  }
  return m;
}

const HIP = lin('#6c8a3c');
const SEPAL = lin('#5a7a34');
const BRONZE = [2.0, 0.95, 0.8];
const THORN = [2.4, 0.72, 0.85];

const M1 = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
const M3 = new THREE.Matrix4();
const L0 = new THREE.Matrix4();
const F = new THREE.Matrix4();
const pt = { p: [0, 0, 0], t: [0, 1, 0] };
const tmp = [0, 0, 0];
const _v = new THREE.Vector3();

class Rose extends FlowerBase {
  constructor(opts = {}) {
    const a = assets();
    // a touch richer than the swatch: petals are seen through light and sheen
    const c = lin(opts.color ?? PLANTS.rose.colors[0]);
    const mx = Math.max(c[0], c[1], c[2], 1e-3);
    const rgb = c.map((v) => mix(v, (v * v) / mx, 0.3));
    super(opts, { foliage: a.foliage, bloom: bloomMaterial(a, rgb), height: PLANTS.rose.height, stiffness: 0.55 });
    const rng = mulberry32((opts.seed ?? 1) * 23 + 3);
    this.H = PLANTS.rose.height * (0.9 + rng() * 0.16);
    this.rgb = rgb;
    const low = opts.quality?.tier === 'low';
    this.sprout = new Seedling(rng, { seed: 'rose', hyp: 0.035, cot: { L: 0.011, W: 0.0065, shape: 'oval', petiole: 0.2 } });
    this.soil = new SoilCover(rng, { radius: 0.03, height: 0.013, wedges: 5, crumbs: 12 });
    const facing = Math.PI * 0.5 + (rng() - 0.5) * 0.6;
    // canes from the crown, upright in the middle and arching outwards
    // round it; three flower, one carries a bud, one is leafy
    const specs = [
      { az: facing + (rng() - 0.5) * 0.4, lean: 0.18, H: this.H - 0.04, grow: [0.33, 0.66], petals: 24, size: 1 },
      { az: facing + 1.3 + (rng() - 0.5) * 0.4, lean: 0.55, H: this.H * 0.84, grow: [0.36, 0.7], petals: 18, size: 0.86 },
      { az: facing - 1.4 + (rng() - 0.5) * 0.4, lean: 0.62, H: this.H * 0.74, grow: [0.4, 0.72], petals: 16, size: 0.78 },
      { az: facing + 2.6 + (rng() - 0.5) * 0.4, lean: 0.7, H: this.H * 0.68, grow: [0.42, 0.74], petals: 10, size: 0.7, budOnly: true },
      { az: facing - 2.7 + (rng() - 0.5) * 0.4, lean: 0.78, H: this.H * 0.56, grow: [0.44, 0.76], petals: 0, size: 0 },
    ].slice(0, low ? 3 : 5);
    this.canes = specs.map((c, ci) => {
      const leaves = [];
      const nl = 6 + Math.floor(rng() * 2) - (ci >= 2 ? 1 : 0);
      let laz = rng() * TAU;
      for (let i = 0; i < nl; i++) {
        laz += 2.5 + (rng() - 0.5) * 0.4;
        leaves.push({ at: (0.1 + (0.8 * i) / nl) * c.H, az: laz, Lr: (0.085 - i * 0.005) * (0.9 + rng() * 0.2), n: i >= nl - 1 || i === 0 ? 3 : 5, tilt: 0.8 + rng() * 0.35, droop: 0.25 + rng() * 0.25, s: 0.9 + rng() * 0.2 });
      }
      const thorns = [];
      const nt = Math.round(c.H * 40);
      for (let i = 0; i < nt; i++) thorns.push({ at: (0.05 + rng() * 0.85) * c.H, az: rng() * TAU, s: 0.7 + rng() * 0.6 });
      const petals = [];
      const spin = rng() * TAU;
      for (let i = 0; i < c.petals; i++) petals.push({ az: spin + i * GOLDEN + (rng() - 0.5) * 0.15, s: 0.92 + rng() * 0.16, r: rng() - 0.5, tint: 0.95 + rng() * 0.1 });
      const bloomAt = c.budOnly ? [0.7, 1.5, 2] : [0.62 + ci * 0.02, 0.8 + ci * 0.03, 0.98 + ci * 0.01];
      const base = [Math.cos(c.az) * 0.006 * ci, 0.024, Math.sin(c.az) * 0.006 * ci];
      return { ...c, leaves, thorns, petals, seed: rng() * 100, spin, base, path: new Path(18), bloomAt };
    });
    this.path = new Path(26);
  }

  build(g) {
    const cut = this.cut;
    const sp = this.sprout;
    if (!cut) sp.stemPath(this.path, g, { epi: 0 });
    this.part(2, cut ? -1 : quant(Math.min(g, 0.73), 250), this.soi, this.soiMesh, (b) => {
      if (cut) return;
      sp.seedMesh(b, g);
      this.soil.build(b, g, 0.08, 0.16);
    });
    this.part(0, quant(Math.min(g, 0.85), 260), this.fol, this.folMesh, (b) => {
      if (!cut && g > 0.09) {
        tube(b, this.path, () => 0.0011 * mix(0.8, 2.6, ease(g, 0.3, 0.7)), { radial: 6, u0: STEM_U[0], u1: STEM_U[1], vScale: 4 });
        sp.cotyledons(b, g, this.path, 0.0011, 1 - ease(g, 0.5, 0.7));
      }
      for (let i = 0; i < this.canes.length; i++) {
        if (cut && i > 0) continue;
        this.cane(b, g, this.canes[i]);
      }
    });
    this.part(1, !cut && g < 0.55 ? -1 : quant(g, 220), this.blo, this.bloMesh, (b) => {
      if (!cut && g < 0.55) return;
      for (let i = 0; i < this.canes.length; i++) {
        if ((cut && i > 0) || !this.canes[i].petals.length) continue;
        this.bloom(b, g, this.canes[i]);
      }
    });
    const c0 = this.canes[0];
    this.canePath(g, c0).at(c0.path.length(), pt);
    this.height = Math.max(0.03, g < 0.34 ? 0.02 + 0.05 * ease(g, 0.2, 0.34) : pt.p[1] + 0.03);
    this.spread = 0.05 + 0.13 * ease(g, 0.35, 0.7);
    if (!cut) {
      for (const c of this.canes) {
        if (c.petals.length && ease(g, c.bloomAt[1], c.bloomAt[2]) > 0.7) {
          this.canePath(g, c).at(c.path.length(), pt);
          this.spot('bloom', [pt.p[0] + pt.t[0] * 0.022, pt.p[1] + pt.t[1] * 0.022, pt.p[2] + pt.t[2] * 0.022], pt.t, this.color, 0.6);
        }
      }
      if (g > 0.5) {
        const lf = c0.leaves[1];
        if (this.leafK(g, c0, lf) > 0.8) {
          this.leafFrame(g, c0, lf);
          _v.set(0, lf.Lr * 0.8, 0).applyMatrix4(L0);
          this.spot('leaf', [_v.x, _v.y + 0.004, _v.z], [0, 1, 0], '#2f4a1e', 0.4);
        }
      }
    }
  }

  caneLen(g, c) {
    return this.cut ? 0.3 : c.H * ease(g, c.grow[0], c.grow[1]);
  }

  canePath(g, c) {
    const len = this.caneLen(g, c);
    return stalkPath(c.path, { base: this.cut ? [0, 0, 0] : c.base, len: Math.max(0.001, len), lean: this.cut ? 0.02 : c.lean, az: c.az, wig: 0.0015, seed: c.seed, n: 18 });
  }

  leafK(g, c, lf) {
    if (this.cut) return 1;
    return sat((this.caneLen(g, c) - lf.at - 0.01) / 0.07);
  }

  // The compound leaf's own frame: rachis along +y, upper side +z.
  leafFrame(g, c, lf) {
    const at = this.cut ? Math.min(0.26, lf.at * 0.6 + 0.06) : lf.at;
    c.path.at(at, pt);
    frameAlong(M1, pt.p, pt.t, lf.az);
    M2.makeRotationY(Math.PI).setPosition(0, 0, 0.0028);
    M3.makeRotationX(-lf.tilt * mix(0.3, 1, this.leafK(g, c, lf)));
    return L0.multiplyMatrices(M1, M2).multiply(M3);
  }

  cane(b, g, c) {
    const len = this.caneLen(g, c);
    if (len < 0.004) return;
    const path = this.canePath(g, c);
    const young = 1 - ease(g, c.grow[1] - 0.05, c.grow[1] + 0.2);
    tube(b, path, (q) => mix(0.0042, 0.0026, q) * mix(0.7, 1, sat(len / 0.2)), {
      radial: 7,
      u0: STEM_U[0],
      u1: STEM_U[1],
      vScale: 3,
      color: (q, a, o) => {
        // new growth is flushed red
        const k = young * sm(0.5, 1, q);
        o.r = mix(1, 1.5, k);
        o.g = mix(1, 0.85, k);
        o.b = mix(1, 0.9, k);
      },
    });
    // hooked prickles
    for (const t of c.thorns) {
      if (t.at > len - 0.01) continue;
      path.at(t.at, pt);
      frameAlong(M1, pt.p, pt.t, t.az);
      const e = M1.elements;
      const r = mix(0.0042, 0.0026, t.at / Math.max(0.05, len)) * 0.95;
      const s = t.s;
      const v = (x, y, z) => b.vertex(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14], e[8], e[9], e[10], STEM_U[0], 0.5, THORN[0], THORN[1], THORN[2], -1, 1);
      const w = 0.0016 * s;
      const a0 = v(-w, w, r * 0.9);
      const a1 = v(w, w, r * 0.9);
      const a2 = v(0, -w * 1.2, r * 0.9);
      const tip = v(0, -0.0026 * s, r + 0.0034 * s);
      b.tri(a0, a1, tip);
      b.tri(a1, a2, tip);
      b.tri(a2, a0, tip);
    }
    for (const lf of c.leaves) {
      if (this.cut && lf.at > 0.3 * c.H) continue;
      const k = this.leafK(g, c, lf);
      if (k <= 0.01) continue;
      this.compoundLeaf(b, g, c, lf, k);
    }
  }

  compoundLeaf(b, g, c, lf, k) {
    this.leafFrame(g, c, lf);
    const young = 1 - k;
    const sc = lf.s * mix(0.25, 1, Math.pow(k, 0.8));
    const Lr = lf.Lr * sc;
    const droop = lf.droop * k;
    // the rachis: a thin stalk arching down a little
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      _v.set(0, t * Lr, -droop * Lr * t * t * 0.6).applyMatrix4(L0);
      pts.push([_v.x, _v.y, _v.z]);
    }
    const rp = this.rachis ?? (this.rachis = new Path(8));
    rp.set(7, (i, n, out) => {
      out[0] = pts[i][0];
      out[1] = pts[i][1];
      out[2] = pts[i][2];
    });
    tube(b, rp, (q) => mix(0.0009, 0.0005, q), { radial: 4, u0: STEM_U[0], u1: STEM_U[1], vScale: 3 });
    const leaflet = (M, L, W, side) => {
      sheet(b, M, {
        L,
        W: W * 1.1,
        nu: 4,
        nv: 5,
        width: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + v * 0.9)), 0.62) * (1 - 0.25 * v),
        fold: mix(0.22, 1.35, young),
        wrap: 12,
        bend0: -0.1 * side,
        curl: -0.25 * k,
        twist: 0.15 * side,
        uv: BLADE_UV,
        color: (s, v, o) => {
          o.r = mix(1, BRONZE[0], young * 0.9);
          o.g = mix(1, BRONZE[1], young * 0.9);
          o.b = mix(1, BRONZE[2], young * 0.9);
        },
      });
    };
    const pairs = lf.n === 5 ? [0.34, 0.66] : [0.55];
    for (const f of pairs) {
      const y = f * Lr;
      const z = -droop * Lr * f * f * 0.6;
      for (const side of [-1, 1]) {
        M1.makeTranslation(0, y, z);
        M2.makeRotationZ(side * (Math.PI * 0.5 - 0.55));
        M1.multiply(M2);
        M1.premultiply(L0);
        leaflet(M1, 0.036 * sc * (0.85 + f * 0.2), 0.024 * sc, side);
      }
    }
    M1.makeTranslation(0, Lr, -droop * Lr * 0.6);
    M2.makeRotationX(-droop * 0.8);
    M1.multiply(M2).premultiply(L0);
    leaflet(M1, 0.044 * sc, 0.029 * sc, 0);
  }

  bloom(b, g, c) {
    const cut = this.cut;
    const [b0, o0, o1] = c.bloomAt;
    const len = this.caneLen(g, c);
    if (!cut && (g < b0 - 0.04 || len < 0.05)) return;
    const path = this.canePath(g, c);
    path.at(path.length(), pt);
    const bud = cut ? 1 : ease(g, b0 - 0.04, o0);
    const open = cut ? 1 : ease(g, o0, o1);
    const sc = mix(0.3, 1, bud) * c.size;
    frameAlong(F, pt.p, pt.t, c.spin, sc);
    // the hip below the flower
    blob(b, M1.copy(F).multiply(M2.makeTranslation(0, -0.003, 0)), 0.0042, 0.0055, 0.0042, { cols: 8, rows: 5, uv: PLAIN_P, rgb: HIP, thick: 1 });
    // five sepals: wrapped round the bud, then folding back
    const back = sm(0.1, 0.7, open) + sm(0.55, 0.9, bud) * 0.35;
    for (let i = 0; i < 5; i++) {
      const az = (i / 5) * TAU + c.spin * 0.3;
      M1.makeRotationY(az + Math.PI).setPosition(Math.sin(az) * 0.0035, 0.001, Math.cos(az) * 0.0035);
      M1.premultiply(F);
      sheet(b, M1, {
        L: 0.024,
        W: 0.0075,
        nu: 4,
        nv: 7,
        width: (v) => (v < 0.35 ? 0.8 + 0.2 * Math.sin((v / 0.35) * Math.PI * 0.5) : Math.pow(1 - (v - 0.35) / 0.65, 1.3)),
        bend0: -mix(0.12, 1.9, sat(back)),
        curl: mix(1.1, -0.6, sat(back)),
        wrap: 80,
        uv: PLAIN_P,
        rgb: SEPAL,
        thick: 0.5,
      });
    }
    // petals, innermost first
    const n = c.petals.length;
    const colK = cut ? 1 : sm(b0 + 0.06, o0 + 0.02, g);
    for (let i = 0; i < n; i++) {
      const p = c.petals[i];
      const f = n > 1 ? i / (n - 1) : 1;
      const oi = sat((open - (1 - f) * 0.5) / 0.5);
      const oe = oi * oi * (3 - 2 * oi);
      const L = mix(0.021, 0.037, f) * p.s;
      const W = mix(0.024, 0.044, f) * p.s;
      const r0 = mix(0.0008, 0.0048, f);
      M1.makeRotationY(p.az + Math.PI).setPosition(Math.sin(p.az) * r0, f * 0.001, Math.cos(p.az) * r0);
      M1.premultiply(F);
      const closedWrap = mix(300, 75, f);
      sheet(b, M1, {
        L,
        W,
        nu: f < 0.4 ? 4 : 6,
        nv: f < 0.4 ? 6 : 9,
        width: (v) => (v < 0.12 ? 0.3 + v * 3 : Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + ((v - 0.12) / 0.88) * 0.8)), 0.45)),
        notch: 0.05 * oe,
        notchW: 0.35,
        bend0: -mix(mix(0.05, 0.28, f), mix(0.35, 1.35, f), oe),
        curl: mix(mix(1.7, 0.95, f), mix(1.2, 0.25, f), oe),
        curlPow: 1.2,
        tipCurl: -mix(0.2, 1.7, f) * oe,
        tipAt: 0.6,
        wrap: mix(closedWrap, mix(110, 16, f), oe),
        wave: 0.0012 * oe,
        waveN: 2,
        wavePh: p.r * 6,
        uv: PETAL_UV,
        color: (sv, v, o) => {
          const k = mix(0.4, 1, colK) * (0.35 + 0.65 * sat(v * 1.6 + colK));
          mixRGB(SEPAL, this.rgb, k, tmp);
          const ao = (0.62 + 0.38 * sm(0.0, 0.5, v)) * mix(0.78, 1, f) * p.tint;
          o.r = tmp[0] * ao;
          o.g = tmp[1] * ao;
          o.b = tmp[2] * ao;
        },
      });
    }
  }

  cutPoint() {
    const c = this.canes[0];
    const path = this.canePath(this.shown, c);
    const len = path.length();
    const top = path.at(len, { p: [0, 0, 0], t: [0, 1, 0] });
    const p = path.at(Math.max(0, len - 0.3), { p: [0, 0, 0], t: [0, 1, 0] });
    return { p: p.p.slice(), t: [top.p[0] - p.p[0], top.p[1] - p.p[1], top.p[2] - p.p[2]] };
  }
}

export function createRose(opts) {
  return new Rose(opts);
}
