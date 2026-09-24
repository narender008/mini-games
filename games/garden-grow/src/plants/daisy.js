// Daisy (Shasta / oxeye): a cluster of tiny ribbed seeds, round seed leaves,
// a rosette of dark glossy toothed leaves, then two slender stems with a few
// narrow leaves, each lifting a green bud of bracts that opens into white
// rays around a domed yellow disc of florets.
import * as THREE from 'three';
import { PLANTS, mulberry32 } from '../config.js';
import { leafMaterial, petalMaterial } from './materials.js';
import { Path, sheet, tube, blob, place, frameAlong, lin, mixRGB, mix, ease, curve, quant, sat, TAU } from './common.js';
import { FlowerBase } from './flower.js';
import { SoilCover } from './soilcover.js';
import { Seedling } from './seedling.js';
import { leafAtlas, compositeAtlas, BLADE_UV, PLAIN_UV, STEM_U, RAY_UV, BRACT_UV, discUV } from './textures.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

let shared = null;
function assets() {
  if (shared) return shared;
  const leaf = leafAtlas({
    c1: [0.12, 0.26, 0.08],
    c2: [0.19, 0.35, 0.12],
    vein: [0.3, 0.46, 0.18],
    rib: [0.42, 0.56, 0.26],
    edge: [0.16, 0.28, 0.1],
    veins: 7,
    angle: 0.38,
    teeth: 10,
    toothDepth: 0.1,
    net: 22,
    netK: 0.22,
    quilt: 0.3,
    plain1: [0.26, 0.44, 0.14],
    plain2: [0.34, 0.52, 0.18],
    stem1: [0.25, 0.4, 0.16],
    stem2: [0.33, 0.48, 0.2],
    stemHair: 0.25,
  });
  const head = compositeAtlas({
    size: 512,
    ray: { base: 0.9, tip: 1, veins: 7, veinK: 0.025, notches: 2, notchDepth: 0.035 },
    disc: { n: 380, center: [0.7, 0.72, 0.22], mid: [1, 0.8, 0.12], ring: [1, 0.84, 0.16], pollen: [1, 0.92, 0.45], open: 0.62, capShade: 0.3, gap: [0.45, 0.3, 0.05], gapK: 0.5 },
  });
  shared = {
    foliage: leafMaterial({ map: leaf.map, normalMap: leaf.normalMap, normalScale: 0.9, vertexColors: true, alphaTest: 0.5, roughness: 0.4, translucency: 0.5 }),
    bloom: petalMaterial({ map: head.map, normalMap: head.normalMap, normalScale: 0.8, vertexColors: true, alphaTest: 0.5, translucency: 0.7, roughness: 0.55, transTint: [1.05, 1.05, 0.95] }),
  };
  return shared;
}

const WHITE = lin('#f4f3ec');
const RAY_BASE = lin('#e4ecc4');
const BUD_GREEN = lin('#7f9a52');
const BRACT = lin('#6f8a44');
const BRACT_EDGE = lin('#9a8a5a');
const DISC_Y = lin('#ffffff');

const M1 = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
const F = new THREE.Matrix4();
const pt = { p: [0, 0, 0], t: [0, 1, 0] };
const tmp = [0, 0, 0];
const uvo = { u: 0, v: 0 };

class Daisy extends FlowerBase {
  constructor(opts = {}) {
    const a = assets();
    super(opts, { foliage: a.foliage, bloom: a.bloom, height: PLANTS.daisy.height, stiffness: 1.1 });
    const rng = mulberry32((opts.seed ?? 1) * 13 + 5);
    this.H = PLANTS.daisy.height * (0.9 + rng() * 0.2);
    this.sprout = new Seedling(rng, { seed: 'daisy', hyp: 0.03, cot: { L: 0.009, W: 0.0058, shape: 'oval', petiole: 0.3 } });
    this.soil = new SoilCover(rng, { radius: 0.03, height: 0.013, wedges: 5, crumbs: 12 });
    const a0 = rng() * TAU;
    this.rosette = [];
    const nL = 10 + Math.floor(rng() * 3);
    for (let i = 0; i < nL; i++) {
      const k = i / (nL - 1);
      this.rosette.push({
        az: a0 + i * GOLDEN,
        L: (0.12 - 0.04 * k) * (0.9 + rng() * 0.2),
        W: (0.026 - 0.007 * k) * (0.9 + rng() * 0.2),
        g0: 0.29 + i * 0.024,
        tilt: 1.15 - 0.35 * k + (rng() - 0.5) * 0.2,
        arch: -(0.25 + rng() * 0.3),
        twist: (rng() - 0.5) * 0.5,
        ph: rng() * 6,
      });
    }
    const facing = Math.PI * 0.5 + (rng() - 0.5) * 0.9; // towards +z, the camera side
    const side = rng() < 0.5 ? -1 : 1;
    this.stems = [0, 1, 2].map((i) => ({
      az: facing + (i === 0 ? (rng() - 0.5) * 0.6 : (i === 1 ? side : -side) * (0.9 + rng() * 0.6)),
      lean: i ? 0.18 + rng() * 0.14 : 0.08 + rng() * 0.1,
      H: [0.96, 0.8, 0.68][i] * this.H * (0.95 + rng() * 0.1),
      rise: [[0.44, 0.7], [0.5, 0.76], [0.54, 0.8]][i],
      open: [[0.79, 0.97], [0.83, 1.0], [0.87, 1.02]][i],
      rays: 18 + Math.floor(rng() * 7),
      R: [0.027, 0.024, 0.021][i] * (0.92 + rng() * 0.16),
      disc: [0.009, 0.008, 0.0072][i],
      spin: rng() * TAU,
      path: new Path(18),
      leaves: [0.14, 0.3, 0.46, 0.6].map((s, j) => ({ s: s + (rng() - 0.5) * 0.06, az: rng() * TAU + j * 2.3, L: (0.048 - j * 0.008) * (0.85 + rng() * 0.3), W: 0.0095 - j * 0.0014 })),
      rayRand: Array.from({ length: 30 }, () => [rng() - 0.5, rng() - 0.5, rng() - 0.5]),
    }));
    this.path = new Path(26);
  }

  build(g) {
    const cut = this.cut;
    const sp = this.sprout;
    if (!cut) sp.stemPath(this.path, g, { epi: 0 });
    // --- soil and seeds
    this.part(2, cut ? -1 : quant(Math.min(g, 0.73), 250), this.soi, this.soiMesh, (b) => {
      if (cut) return;
      sp.seedMesh(b, g);
      this.soil.build(b, g, 0.08, 0.16);
    });
    // --- seedling, rosette, stems and their leaves
    this.part(0, quant(Math.min(g, 0.8), 400), this.fol, this.folMesh, (b) => {
      if (!cut) {
        if (g > 0.09) {
          tube(b, this.path, () => 0.0009 * mix(0.8, 1.3, ease(g, 0.3, 0.6)), { radial: 5, u0: STEM_U[0], u1: STEM_U[1], vScale: 4 });
          sp.cotyledons(b, g, this.path, 0.0009, 1 - ease(g, 0.62, 0.8) * 0.4);
        }
        for (const lf of this.rosette) this.rosetteLeaf(b, g, lf);
      }
      for (let i = 0; i < this.stems.length; i++) {
        if (cut && i > 0) continue;
        this.stem(b, g, this.stems[i]);
      }
    });
    // --- buds and flowers
    this.part(1, g < 0.6 && !cut ? -1 : quant(g, 300), this.blo, this.bloMesh, (b) => {
      if (g < 0.6 && !cut) return;
      for (let i = 0; i < this.stems.length; i++) {
        if (cut && i > 0) continue;
        this.head(b, g, this.stems[i]);
      }
    });
    // pick size and landing spots
    const st = this.stems[0];
    this.stemPathFor(g, st);
    st.path.at(st.path.length(), pt);
    this.height = Math.max(0.03, g < 0.44 ? 0.02 + 0.05 * ease(g, 0.28, 0.44) : pt.p[1] + 0.01);
    this.spread = 0.04 + 0.08 * ease(g, 0.3, 0.6);
    if (!cut) {
      for (const s of this.stems) {
        const o = ease(g, s.open[0], s.open[1]);
        if (o > 0.7) {
          this.stemPathFor(g, s);
          s.path.at(s.path.length(), pt);
          this.spot('bloom', [pt.p[0] + pt.t[0] * 0.005, pt.p[1] + pt.t[1] * 0.005, pt.p[2] + pt.t[2] * 0.005], pt.t, '#f6d23a', 1);
        }
      }
      if (g > 0.45) {
        const lf = this.rosette[0];
        const d = lf.L * 0.6 * Math.sin(lf.tilt);
        this.spot('leaf', [Math.sin(lf.az) * d, 0.012 + lf.L * 0.6 * Math.cos(lf.tilt) * 0.5, Math.cos(lf.az) * d], [0, 1, 0], '#3f6a2a', 0.1);
      }
    }
  }

  stemRise(g, s) {
    return this.cut ? 1 : ease(g, s.rise[0], s.rise[1]);
  }

  stemPathFor(g, s) {
    const len = this.cut ? 0.28 : s.H * mix(0.0, 1, this.stemRise(g, s));
    const base = this.cut ? [0, 0, 0] : [0, 0.012, 0];
    const lean = this.cut ? 0.03 : s.lean;
    const lx = Math.cos(s.az);
    const lz = Math.sin(s.az);
    return s.path.set(18, (k, n, out) => {
      const t = k / (n - 1);
      const h = t * len;
      const bend = lean * t * t;
      out[0] = base[0] + lx * bend * len * 0.9 + Math.sin(t * 5 + s.spin) * 0.002;
      out[1] = base[1] + h * (1 - 0.1 * lean * t);
      out[2] = base[2] + lz * bend * len * 0.9 + Math.cos(t * 4 + s.spin) * 0.002;
    });
  }

  rosetteLeaf(b, g, lf) {
    const k = ease(g, lf.g0, lf.g0 + 0.26);
    if (k <= 0.01) return;
    const L = lf.L * mix(0.2, 1, k);
    const W = lf.W * mix(0.3, 1, k);
    const pet = 0.32;
    place(M1, Math.sin(lf.az) * 0.0012, 0.011, Math.cos(lf.az) * 0.0012, lf.az + Math.PI);
    const young = 1 - k;
    sheet(b, M1, {
      L,
      W: W * 1.12,
      nu: 6,
      nv: 11,
      width: (v) => (v < pet ? 0.1 + 0.06 * (v / pet) : Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + ((v - pet) / (1 - pet)) * 0.62)), 0.7) * (v > 0.85 ? Math.sqrt(Math.max(0, 1 - ((v - 0.85) / 0.15) ** 2)) * 0.6 + 0.4 * (1 - (v - 0.85) / 0.15) : 1)),
      fold: mix(0.25, 1.2, young),
      wrap: 10,
      bend0: -mix(0.15, lf.tilt, k),
      curl: lf.arch * k,
      curlPow: 1.5,
      twist: lf.twist * k,
      wave: 0.0015 * k,
      waveN: 4,
      wavePh: lf.ph,
      uv: BLADE_UV,
      color: (s, v, o) => {
        const ao = 0.7 + 0.3 * Math.min(1, v * 4);
        o.r = ao * (1 + 0.15 * young);
        o.g = ao * (1 + 0.12 * young);
        o.b = ao;
      },
    });
  }

  stem(b, g, s) {
    const rise = this.stemRise(g, s);
    if (rise <= 0.005) return;
    const path = this.stemPathFor(g, s);
    const len = path.length();
    tube(b, path, (q) => mix(0.0019, 0.0014, q) + 0.0006 * Math.max(0, (q - 0.9) / 0.1), { radial: 6, u0: STEM_U[0], u1: STEM_U[1], vScale: 3 });
    for (const lf of s.leaves) {
      const at = lf.s * len;
      if (at < 0.01) continue;
      const k = sat((rise - lf.s * 0.6) / 0.4);
      if (k <= 0) continue;
      path.at(at, pt);
      frameAlong(M1, pt.p, pt.t, lf.az);
      M2.makeRotationY(Math.PI).setPosition(0, 0, 0.0016);
      M1.multiply(M2);
      sheet(b, M1, {
        L: lf.L * mix(0.3, 1, k),
        W: lf.W * 1.15 * mix(0.4, 1, k),
        nu: 4,
        nv: 7,
        width: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + v * 0.9)), 0.8) * (1 - 0.4 * v),
        fold: mix(0.3, 1.1, 1 - k),
        bend0: -mix(0.1, 0.55, k),
        curl: -0.3 * k,
        uv: BLADE_UV,
      });
    }
  }

  head(b, g, s) {
    const cut = this.cut;
    const rise = this.stemRise(g, s);
    if (!cut && rise < 0.3) return;
    const path = this.stemPathFor(g, s);
    path.at(path.length(), pt);
    // the head nods a little towards the stem's lean
    const bud = cut ? 1 : ease(g, s.rise[0] + 0.12, s.open[0] + 0.02);
    const open = cut ? 1 : ease(g, s.open[0], s.open[1]);
    const emerge = cut ? 1 : ease(g, s.open[0] - 0.03, s.open[0] + 0.06);
    const sc = mix(0.45, 1, bud);
    frameAlong(F, pt.p, pt.t, s.spin, sc);
    const R = s.R;
    const rd = s.disc;
    // green bracts: a tight bud, then a cup under the head
    for (let row = 0; row < 2; row++) {
      const n = 11;
      for (let i = 0; i < n; i++) {
        const az = (i / n) * TAU + row * 0.3;
        const r0 = rd * (0.55 + 0.25 * row);
        M1.makeRotationY(az + Math.PI).setPosition(Math.sin(az) * r0, -0.0035 + row * 0.0006, Math.cos(az) * r0);
        M1.premultiply(F);
        const closed = 1 - open;
        sheet(b, M1, {
          L: (0.0058 - row * 0.001) * mix(1, 0.85, open),
          W: 0.0034 - row * 0.0006,
          nu: 3,
          nv: 4,
          width: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + v * 0.8)), 0.7),
          bend0: -mix(0.35, 1.45, open) + row * 0.15,
          curl: mix(1.5, 0.15, open),
          wrap: 60,
          uv: BRACT_UV,
          color: (sv, v, o) => {
            mixRGB(BRACT, BRACT_EDGE, Math.pow(Math.abs(sv), 3) * 0.8 + v * 0.2, tmp);
            o.r = tmp[0];
            o.g = tmp[1];
            o.b = tmp[2];
          },
          thick: 0.3,
        });
      }
    }
    // the disc: a low dome of florets
    const dh = rd * mix(0.35, 0.6, open);
    const dr = rd * mix(0.8, 1, bud);
    const fe = F.elements;
    b.grid(
      16,
      5,
      (i, j, o) => {
        const a = (i / 16) * TAU;
        const q = j / 5;
        const r = dr * Math.sin(q * Math.PI * 0.5 + 1e-3) ** 0.9;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const y = dh * Math.cos(q * Math.PI * 0.5) - 0.001;
        o.x = fe[0] * x + fe[4] * y + fe[8] * z + fe[12];
        o.y = fe[1] * x + fe[5] * y + fe[9] * z + fe[13];
        o.z = fe[2] * x + fe[6] * y + fe[10] * z + fe[14];
        discUV(x, z, dr, uvo);
        o.u = uvo.u;
        o.v = uvo.v;
        const k = mix(0.55, 1, open);
        mixRGB(BUD_GREEN, DISC_Y, k, tmp);
        o.r = tmp[0];
        o.g = tmp[1];
        o.b = tmp[2];
        o.t = 0.8;
      },
      true,
      false,
    );
    // white rays: they push out of the bud upright, then spread flat
    if (emerge <= 0) return;
    const n = s.rays;
    for (let i = 0; i < n; i++) {
      const rr = s.rayRand[i % s.rayRand.length];
      const az = (i / n) * TAU + rr[0] * 0.12;
      M1.makeRotationY(az + Math.PI).setPosition(Math.sin(az) * dr * 0.92, -0.0006, Math.cos(az) * dr * 0.92);
      M1.premultiply(F);
      const L = R * (0.95 + rr[1] * 0.12) * mix(0.25, 1, emerge);
      const spread = Math.min(1, open * 1.15);
      sheet(b, M1, {
        L,
        W: 0.0058 * (0.9 + rr[2] * 0.2) * mix(0.6, 1, emerge),
        nu: 4,
        nv: 9,
        width: (v) => (v < 0.12 ? 0.35 + (v / 0.12) * 0.5 : 0.85 + 0.15 * Math.sin(((v - 0.12) / 0.88) * Math.PI * 0.9)) * (v > 0.9 ? Math.sqrt(Math.max(0, 1 - ((v - 0.9) / 0.1) ** 2)) * 0.4 + 0.6 : 1),
        bend0: -mix(0.45, 1.5 + rr[2] * 0.12, spread),
        curl: mix(0.25, -0.25 + rr[1] * 0.2, spread),
        curlPow: 1.3,
        twist: rr[0] * 0.5 * spread,
        wrap: mix(90, 45, spread),
        uv: RAY_UV,
        color: (sv, v, o) => {
          mixRGB(RAY_BASE, WHITE, Math.min(1, v * 4) * mix(0.6, 1, emerge), tmp);
          const ao = 0.75 + 0.25 * Math.min(1, v * 5);
          o.r = tmp[0] * ao;
          o.g = tmp[1] * ao;
          o.b = tmp[2] * ao;
        },
      });
    }
  }

  cutPoint() {
    const s = this.stems[0];
    const path = this.stemPathFor(this.shown, s);
    const len = path.length();
    const top = path.at(len, { p: [0, 0, 0], t: [0, 1, 0] });
    const p = path.at(Math.max(0, len - 0.28), { p: [0, 0, 0], t: [0, 1, 0] });
    return { p: p.p.slice(), t: [top.p[0] - p.p[0], top.p[1] - p.p[1], top.p[2] - p.p[2]] };
  }
}

export function createDaisy(opts) {
  return new Daisy(opts);
}
