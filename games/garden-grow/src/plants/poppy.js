// Field poppy (Papaver rhoeas): a pinch of tiny grey seeds, narrow seed
// leaves, a rosette of hairy, deeply lobed grey-green leaves, then bristly
// stems whose buds hang their heads. At flowering the stem straightens, the
// hairy sepals split and fall, and four crumpled, tissue-thin petals unfold
// into a bowl with black blotches at their base around a seed pod ringed by
// dark stamens. The petals glow when the low sun shines through them.
import * as THREE from 'three';
import { PLANTS, mulberry32 } from '../config.js';
import { leafMaterial, petalMaterial } from './materials.js';
import { Path, sheet, tube, blob, place, frameAlong, stalkPath, hairs, paint, paintNormal, lin, mixRGB, mix, ease, curve, quant, sat, fbm, noise2, TAU } from './common.js';
import { FlowerBase } from './flower.js';
import { SoilCover } from './soilcover.js';
import { Seedling } from './seedling.js';
import { leafAtlas, BLADE_UV, PLAIN_UV, STEM_U } from './textures.js';

const PETAL_UV = [0.0, 0.84, 0, 1];
const PLAIN_P = [0.9, 0.97, 0.2, 0.8];
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const sm = (a, b, x) => {
  const k = sat((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

let shared = null;
function assets() {
  if (shared) return shared;
  const leaf = leafAtlas({
    c1: [0.27, 0.4, 0.2],
    c2: [0.35, 0.48, 0.25],
    vein: [0.45, 0.56, 0.32],
    rib: [0.52, 0.62, 0.38],
    edge: [0.3, 0.42, 0.22],
    veins: 6,
    angle: 0.3,
    lobes: 5,
    lobeDepth: 0.62,
    teeth: 16,
    toothDepth: 0.05,
    net: 18,
    netK: 0.15,
    quilt: 0.2,
    hair: 0.8,
    plain1: [0.36, 0.5, 0.26],
    plain2: [0.44, 0.56, 0.3],
    stem1: [0.33, 0.47, 0.24],
    stem2: [0.4, 0.54, 0.28],
    stemHair: 0.5,
  });
  // tissue-thin petals: fine veins fanning from the base, crumples, a black
  // blotch at the base
  const petalField = (x, v) => {
    const th = Math.atan2(x - 0.5, v + 0.06);
    const warp = fbm(x * 4, v * 4, 3);
    return { th, warp };
  };
  const map = paint(256, 256, (u, v, o) => {
    if (u > 0.86) {
      const l = 0.88 + 0.1 * fbm(u * 30, v * 30, 3);
      o[0] = o[1] = o[2] = l;
      return;
    }
    const x = u / 0.84;
    const { th, warp } = petalField(x, v);
    const vein = Math.pow(Math.abs(Math.cos(th * 34 + warp * 3)), 14);
    let l = 0.93 + 0.07 * fbm(x * 3, v * 3, 3) - 0.07 * vein * (0.4 + 0.6 * (1 - v));
    l *= 1 + 0.05 * sm(0.6, 1, v);
    // the blotch, with a ragged edge
    const e = Math.hypot((x - 0.5) * 1.25, v) + 0.035 * (fbm(x * 9, v * 9, 3) - 0.5);
    const blot = 1 - sm(0.15, 0.24, e);
    l = mix(l, 0.035, blot);
    o[0] = o[1] = o[2] = Math.max(0, Math.min(1, l));
  });
  const normalMap = paintNormal(256, 256, (u, v) => {
    if (u > 0.86) return fbm(u * 40, v * 40, 2) * 0.2;
    const x = u / 0.84;
    const { th, warp } = petalField(x, v);
    return Math.sin(th * 22 + warp * 5) * 0.35 * sm(0.1, 0.5, v) + fbm(x * 7, v * 7, 3) * 0.6 + Math.pow(Math.abs(Math.cos(th * 34 + warp * 3)), 8) * 0.15;
  }, 2.6);
  shared = {
    foliage: leafMaterial({ map: leaf.map, normalMap: leaf.normalMap, normalScale: 0.8, vertexColors: true, alphaTest: 0.5, roughness: 0.62, translucency: 0.5 }),
    bloom: petalMaterial({ map, normalMap, normalScale: 0.9, vertexColors: true, translucency: 1, roughness: 0.5 }),
  };
  return shared;
}

const POD = lin('#a9b98f');
const POD_TOP = lin('#4a3a52');
const STAMEN = lin('#1e1518');
const ANTHER = lin('#241a26');
const SEPAL = lin('#6f8f4e');
const HAIR = [1.25, 1.3, 1.15];

const M1 = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
const F = new THREE.Matrix4();
const pt = { p: [0, 0, 0], t: [0, 1, 0] };
const tmp = [0, 0, 0];

class Poppy extends FlowerBase {
  constructor(opts = {}) {
    const a = assets();
    super(opts, { foliage: a.foliage, bloom: a.bloom, height: PLANTS.poppy.height, stiffness: 1.3 });
    const rng = mulberry32((opts.seed ?? 1) * 17 + 11);
    this.H = PLANTS.poppy.height * (0.88 + rng() * 0.22);
    this.rgb = lin(opts.color ?? PLANTS.poppy.colors[0]);
    const mx = Math.max(...this.rgb);
    this.rgb = this.rgb.map((c) => mix(c, (c * c) / mx, 0.35));
    this.sprout = new Seedling(rng, { seed: 'poppy', hyp: 0.03, cot: { L: 0.008, W: 0.0022, shape: 'narrow', petiole: 0.1 } });
    this.soil = new SoilCover(rng, { radius: 0.03, height: 0.012, wedges: 5, crumbs: 12 });
    const a0 = rng() * TAU;
    this.rosette = [];
    const nL = 6 + Math.floor(rng() * 3);
    for (let i = 0; i < nL; i++) {
      const k = i / (nL - 1);
      this.rosette.push({
        az: a0 + i * GOLDEN,
        L: (0.13 - 0.04 * k) * (0.9 + rng() * 0.2),
        W: (0.042 - 0.01 * k) * (0.9 + rng() * 0.2),
        g0: 0.3 + i * 0.03,
        tilt: 1.05 - 0.3 * k + (rng() - 0.5) * 0.2,
        arch: -(0.3 + rng() * 0.35),
        twist: (rng() - 0.5) * 0.5,
        ph: rng() * 6,
      });
    }
    const facing = Math.PI * 0.5 + (rng() - 0.5) * 0.8;
    const side = rng() < 0.5 ? -1 : 1;
    this.stems = [0, 1].map((i) => ({
      az: facing + (i ? side * (0.9 + rng() * 0.6) : (rng() - 0.5) * 0.5),
      lean: i ? 0.2 + rng() * 0.12 : 0.06 + rng() * 0.1,
      H: (i ? 0.8 : 0.97) * this.H,
      rise: i ? [0.5, 0.78] : [0.44, 0.72],
      lift: i ? [0.8, 0.88] : [0.76, 0.84],
      open: i ? [0.86, 1.02] : [0.82, 0.99],
      nodAz: rng() * TAU,
      spin: rng() * TAU,
      seed: rng() * 100,
      path: new Path(22),
      leaves: [0.12, 0.3].map((s, j) => ({ s: s + (rng() - 0.5) * 0.05, az: rng() * TAU + j * 2.5, L: (0.07 - j * 0.02) * (0.85 + rng() * 0.3), W: 0.024 - j * 0.006 })),
      petals: [0, 1, 2, 3].map((j) => ({ az: j * Math.PI * 0.5 + (rng() - 0.5) * 0.15, outer: j % 2 === 0, s: 0.93 + rng() * 0.14, seed: rng() * 30, tilt: (rng() - 0.5) * 0.15 })),
    }));
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
    this.part(0, quant(Math.min(g, 0.9), 400), this.fol, this.folMesh, (b) => {
      if (!cut) {
        if (g > 0.09) {
          tube(b, this.path, () => 0.0008 * mix(0.8, 1.4, ease(g, 0.3, 0.6)), { radial: 5, u0: STEM_U[0], u1: STEM_U[1], vScale: 4 });
          sp.cotyledons(b, g, this.path, 0.0008, 1 - ease(g, 0.6, 0.8) * 0.5);
        }
        for (const lf of this.rosette) this.rosetteLeaf(b, g, lf);
      }
      for (let i = 0; i < this.stems.length; i++) {
        if (cut && i > 0) continue;
        this.stem(b, g, this.stems[i]);
      }
    });
    this.part(1, g < 0.5 && !cut ? -1 : quant(g, 300), this.blo, this.bloMesh, (b) => {
      if (g < 0.5 && !cut) return;
      for (let i = 0; i < this.stems.length; i++) {
        if (cut && i > 0) continue;
        this.head(b, g, this.stems[i]);
      }
    });
    const st = this.stems[0];
    this.stemPathFor(g, st).at(st.path.length(), pt);
    this.height = Math.max(0.03, g < 0.44 ? 0.02 + 0.05 * ease(g, 0.28, 0.44) : pt.p[1] + 0.02);
    this.spread = 0.05 + 0.09 * ease(g, 0.3, 0.6);
    if (!cut) {
      for (const s of this.stems) {
        if (ease(g, s.open[0], s.open[1]) > 0.75) {
          this.stemPathFor(g, s).at(s.path.length(), pt);
          this.spot('bloom', [pt.p[0] + pt.t[0] * 0.01, pt.p[1] + pt.t[1] * 0.01, pt.p[2] + pt.t[2] * 0.01], pt.t, this.color, 1.3);
        }
      }
      if (g > 0.45) {
        const lf = this.rosette[0];
        const d = lf.L * 0.55 * Math.sin(lf.tilt);
        this.spot('leaf', [Math.sin(lf.az) * d, 0.02, Math.cos(lf.az) * d], [0, 1, 0], '#5a7a44', 0.1);
      }
    }
  }

  stemPathFor(g, s) {
    const cut = this.cut;
    const rise = cut ? 1 : ease(g, s.rise[0], s.rise[1]);
    const len = cut ? 0.3 : s.H * rise;
    // buds hang their heads until they are about to open
    const nod = cut ? 0.05 : mix(2.5, 0.08, ease(g, s.lift[0], s.lift[1])) * sm(0.0, 0.25, rise);
    return stalkPath(s.path, { base: cut ? [0, 0, 0] : [0, 0.03, 0], len, lean: cut ? 0.03 : s.lean, az: s.az, nod, nodLen: 0.06, nodAz: s.nodAz, wig: 0.0012, seed: s.seed, n: 22 });
  }

  rosetteLeaf(b, g, lf) {
    const k = ease(g, lf.g0, lf.g0 + 0.25);
    if (k <= 0.01) return;
    const young = 1 - k;
    place(M1, Math.sin(lf.az) * 0.001, 0.028, Math.cos(lf.az) * 0.001, lf.az + Math.PI);
    sheet(b, M1, {
      L: lf.L * mix(0.2, 1, k),
      W: lf.W * mix(0.3, 1, k),
      nu: 8,
      nv: 12,
      width: (v) => (v < 0.12 ? 0.12 + v * 1.5 : Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + ((v - 0.12) / 0.88) * 0.95)), 0.65)),
      fold: mix(0.2, 1.1, young),
      wrap: 8,
      bend0: -mix(0.2, lf.tilt, k),
      curl: lf.arch * k,
      curlPow: 1.4,
      twist: lf.twist * k,
      wave: 0.002 * k,
      waveN: 5,
      wavePh: lf.ph,
      uv: BLADE_UV,
      color: (s, v, o) => {
        const ao = 0.72 + 0.28 * Math.min(1, v * 4);
        o.r = ao * (1 + 0.1 * young);
        o.g = ao * (1 + 0.1 * young);
        o.b = ao;
      },
    });
  }

  stem(b, g, s) {
    const cut = this.cut;
    const rise = cut ? 1 : ease(g, s.rise[0], s.rise[1]);
    if (rise <= 0.005) return;
    const path = this.stemPathFor(g, s);
    const len = path.length();
    tube(b, path, (q) => mix(0.0022, 0.0015, q), { radial: 6, u0: STEM_U[0], u1: STEM_U[1], vScale: 3 });
    // bristles that catch the light
    hairs(b, path, Math.round(70 * rise), { len: 0.0024, radius: 0.0016, rgb: HAIR, seed: s.seed, uv: PLAIN_UV, up: 0.5 });
    for (const lf of s.leaves) {
      const at = lf.s * len;
      if (at < 0.01) continue;
      const k = sat((rise - lf.s * 0.5) / 0.5);
      if (k <= 0) continue;
      path.at(at, pt);
      frameAlong(M1, pt.p, pt.t, lf.az);
      M2.makeRotationY(Math.PI).setPosition(0, 0, 0.0018);
      M1.multiply(M2);
      sheet(b, M1, {
        L: lf.L * mix(0.3, 1, k),
        W: lf.W * mix(0.4, 1, k),
        nu: 6,
        nv: 9,
        width: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + v * 0.88)), 0.7),
        fold: mix(0.3, 1.1, 1 - k),
        bend0: -mix(0.15, 0.6, k),
        curl: -0.4 * k,
        uv: BLADE_UV,
      });
    }
  }

  head(b, g, s) {
    const cut = this.cut;
    const rise = cut ? 1 : ease(g, s.rise[0], s.rise[1]);
    if (!cut && rise < 0.25) return;
    const path = this.stemPathFor(g, s);
    path.at(path.length(), pt);
    const bud = cut ? 1 : ease(g, s.rise[0] + 0.1, s.lift[0]);
    const open = cut ? 1 : ease(g, s.open[0], s.open[1]);
    const split = cut ? 1 : ease(g, s.open[0] - 0.03, s.open[0] + 0.04);
    const sc = mix(0.4, 1, bud);
    frameAlong(F, pt.p, pt.t, s.spin, sc);
    // hairy sepals: a closed oval bud, then they part and drop away
    if (split < 1) {
      for (let i = 0; i < 2; i++) {
        const az = i * Math.PI;
        M1.makeRotationY(az + Math.PI).setPosition(Math.sin(az) * 0.0015, 0.001, Math.cos(az) * 0.0015);
        M1.premultiply(F);
        const drop = sm(0.4, 1, split);
        const M = M1.clone();
        if (drop > 0) M.multiply(M2.makeTranslation(0, -0.01 * drop, 0));
        sheet(b, M, {
          L: 0.022,
          W: 0.03,
          nu: 7,
          nv: 8,
          width: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + v * 0.93)), 0.55),
          bend0: -mix(0.55, 1.6, split),
          curl: mix(1.7, 0.9, split),
          wrap: 105,
          uv: PLAIN_UV,
          color: (sv, v, o) => {
            o.r = SEPAL[0];
            o.g = SEPAL[1];
            o.b = SEPAL[2];
          },
          thick: 0.4,
        });
      }
    }
    // petals: crumpled in the bud, unfolding and smoothing into a bowl
    const show = cut ? 1 : ease(g, s.open[0] - 0.02, s.open[0] + 0.03);
    if (show > 0) {
      for (const p of s.petals) {
        const outer = p.outer;
        const r0 = outer ? 0.0045 : 0.0035;
        M1.makeRotationY(p.az + Math.PI).setPosition(Math.sin(p.az) * r0, outer ? 0 : 0.0008, Math.cos(p.az) * r0);
        M1.premultiply(F);
        const L = (outer ? 0.04 : 0.036) * p.s * mix(0.55, 1, open);
        const W = (outer ? 0.056 : 0.05) * p.s * mix(0.45, 1, open);
        sheet(b, M1, {
          L,
          W,
          nu: 14,
          nv: 13,
          width: (v) => (v < 0.1 ? 0.18 + v * 2 : Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + ((v - 0.1) / 0.9) * 0.62)), 0.55) * (v > 0.75 ? Math.sqrt(Math.max(0, 1 - ((v - 0.75) / 0.25) ** 2)) * 0.5 + 0.5 : 1)),
          bend0: -mix(0.15, outer ? 1.12 : 0.92, open) - p.tilt * open,
          curl: mix(1.6, outer ? 0.5 : 0.6, open),
          curlPow: 1.4,
          wrap: mix(90, outer ? 12 : 16, open),
          crinkle: mix(0.005, 0.0016, open),
          crinkleF: 7,
          seed: p.seed,
          uv: PETAL_UV,
          color: (sv, v, o) => {
            const ao = 0.75 + 0.25 * sm(0.0, 0.35, v);
            o.r = this.rgb[0] * ao * (1 + 0.08 * v);
            o.g = this.rgb[1] * ao;
            o.b = this.rgb[2] * ao;
          },
        });
      }
      // the seed pod, its dark ribbed cap, and the ring of stamens
      const k = mix(0.7, 1, open);
      M1.makeTranslation(0, 0.0062 * k, 0);
      M1.premultiply(F);
      blob(b, M1, 0.0048 * k, 0.0062 * k, 0.0048 * k, {
        cols: 10,
        rows: 6,
        uv: PLAIN_P,
        rgb: POD,
        thick: 0.8,
        shape: (lat, lon, out) => {
          out[0] = 1 + 0.06 * Math.cos(lon * TAU * 9);
        },
      });
      M1.makeTranslation(0, 0.0122 * k, 0);
      M1.premultiply(F);
      blob(b, M1, 0.0056 * k, 0.0012 * k, 0.0056 * k, {
        cols: 18,
        rows: 4,
        uv: PLAIN_P,
        thick: 0.9,
        color: (lat, lon, o) => {
          const ray = Math.pow(Math.abs(Math.cos(lon * Math.PI * 9)), 6);
          mixRGB(POD, POD_TOP, 0.55 + 0.45 * ray, tmp);
          o.r = tmp[0];
          o.g = tmp[1];
          o.b = tmp[2];
        },
      });
      // a dense ring of dark stamens round the pod
      const n = 72;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + (i % 3) * 0.03;
        const tilt = 0.25 + (i % 4) * 0.12;
        const r0 = 0.0048 + (i % 2) * 0.0006;
        place(M1, Math.sin(a) * r0, 0.001, Math.cos(a) * r0, a, tilt * open + 0.1, 0);
        M1.premultiply(F);
        const e = M1.elements;
        const len = 0.0085 * k * (0.8 + (i % 5) * 0.08);
        const vtx = (x, y, z, rgb) => b.vertex(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14], e[8], e[9], e[10], PLAIN_P[0], PLAIN_P[2], rgb[0], rgb[1], rgb[2], -1, 0.7);
        const a0 = vtx(-0.00014, 0, 0, STAMEN);
        const a1 = vtx(0.00014, 0, 0, STAMEN);
        const a2 = vtx(0, len, 0, STAMEN);
        b.tri(a0, a1, a2);
        const b0 = vtx(-0.0006, len - 0.0005, 0, ANTHER);
        const b1 = vtx(0.0006, len - 0.0005, 0, ANTHER);
        const b2 = vtx(0.0005, len + 0.0011, 0, ANTHER);
        const b3 = vtx(-0.0005, len + 0.0011, 0, ANTHER);
        b.tri(b0, b1, b2);
        b.tri(b0, b2, b3);
      }
    }
  }

  cutPoint() {
    const s = this.stems[0];
    const path = this.stemPathFor(this.shown, s);
    const len = path.length();
    const top = path.at(len, { p: [0, 0, 0], t: [0, 1, 0] });
    const p = path.at(Math.max(0, len - 0.3), { p: [0, 0, 0], t: [0, 1, 0] });
    return { p: p.p.slice(), t: [top.p[0] - p.p[0], top.p[1] - p.p[1], top.p[2] - p.p[2]] };
  }
}

export function createPoppy(opts) {
  return new Poppy(opts);
}
