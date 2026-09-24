// Tulip: a papery brown bulb in its hole, soil closing over it and cracking,
// a pointed shoot of rolled glaucous leaves, broad leaves that unroll and
// arch, a stalk lifting a green bud that colours and swells, then six waxy
// tepals opening into a cup around the pistil and dark stamens.
import * as THREE from 'three';
import { PLANTS, mulberry32 } from '../config.js';
import { leafMaterial, petalMaterial } from './materials.js';
import { Path, sheet, sheetMidrib, midribZ, tube, blob, place, frameAlong, paint, paintNormal, lin, mixRGB, mix, ease, curve, quant, sat, fbm, noise2, TAU } from './common.js';
import { FlowerBase } from './flower.js';
import { SoilCover } from './soilcover.js';

const LEAF_UV = [0.0, 0.84, 0, 1];
const STEM_U = [0.87, 0.99];
const PETAL_UV = [0.0, 0.84, 0, 1];
const PLAIN_UV = [0.9, 0.97, 0.2, 0.8];

const sm = (a, b, x) => {
  const k = sat((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

// ------------------------------------------------------------ textures

let shared = null;
function assets() {
  if (shared) return shared;
  const G1 = [0.25, 0.4, 0.3];
  const G2 = [0.33, 0.48, 0.35];
  const BLOOM = [0.44, 0.54, 0.51];
  const RIB = [0.52, 0.64, 0.46];
  const BASE = [0.78, 0.82, 0.62];
  const leafMap = paint(256, 512, (u, v, o) => {
    if (u > 0.855) {
      const x = (u - 0.87) / 0.12;
      const n = fbm(x * 4, v * 60, 3);
      const streak = 0.5 + 0.5 * Math.cos(x * Math.PI * 14 + n * 2);
      const c = mixRGB([0.3, 0.45, 0.31], [0.38, 0.53, 0.37], n * 0.8 + streak * 0.2);
      o[0] = c[0];
      o[1] = c[1];
      o[2] = c[2];
      return;
    }
    const x = Math.min(1, u / 0.84);
    const n = fbm(x * 5, v * 16, 4);
    let c = mixRGB(G1, G2, n);
    const bloom = sm(0.42, 0.72, fbm(x * 2.5 + 5, v * 5, 3)) * 0.45;
    c = mixRGB(c, BLOOM, bloom);
    const line = Math.pow(Math.abs(Math.cos(Math.PI * 30 * x + 0.6 * noise2(x * 8, v * 3))), 18);
    c = mixRGB(c, RIB, line * 0.28);
    const rib = Math.exp(-(((x - 0.5) / 0.014) ** 2));
    c = mixRGB(c, RIB, rib * 0.55);
    const edge = sm(0.03, 0.0, Math.min(x, 1 - x));
    c = mixRGB(c, [0.62, 0.62, 0.46], edge * 0.5);
    const base = sm(0.13, 0.0, v);
    c = mixRGB(c, BASE, base * 0.75);
    o[0] = c[0];
    o[1] = c[1];
    o[2] = c[2];
  });
  const leafNormal = paintNormal(256, 512, (u, v) => {
    if (u > 0.855) return 0.5 + 0.5 * Math.cos(((u - 0.87) / 0.12) * Math.PI * 14);
    const x = Math.min(1, u / 0.84);
    const line = Math.pow(Math.abs(Math.cos(Math.PI * 30 * x + 0.6 * noise2(x * 8, v * 3))), 18);
    const rib = Math.exp(-(((x - 0.5) / 0.012) ** 2));
    return line * 0.35 - rib * 1.2 + fbm(x * 18, v * 50, 3) * 0.25;
  }, 2.2);
  const petalMap = paint(256, 512, (u, v, o) => {
    if (u > 0.86) {
      const l = 0.9 + 0.08 * fbm(u * 30, v * 30, 3);
      o[0] = o[1] = o[2] = l;
      return;
    }
    const x = Math.min(1, u / 0.84);
    const w = 0.28 + 0.72 * Math.sin(Math.min(1, v / 0.6) * Math.PI * 0.5);
    const xx = (x - 0.5) / w;
    const vein = Math.pow(Math.abs(Math.cos(Math.PI * 21 * xx + 2.2 * fbm(xx * 5, v * 3, 3))), 6);
    const satin = 0.92 + 0.08 * fbm(x * 2.5, v * 9, 4);
    let l = satin - 0.025 * vein * (0.3 + 0.7 * (1 - v));
    l *= 0.86 + 0.14 * sm(0.0, 0.2, v);
    l *= 1 + 0.04 * sm(0.35, 0.5, Math.abs(x - 0.5));
    o[0] = o[1] = o[2] = Math.min(1, l);
  });
  const petalNormal = paintNormal(256, 512, (u, v) => {
    if (u > 0.86) return fbm(u * 40, v * 40, 2) * 0.3;
    const x = Math.min(1, u / 0.84);
    const w = 0.28 + 0.72 * Math.sin(Math.min(1, v / 0.6) * Math.PI * 0.5);
    const xx = (x - 0.5) / w;
    return Math.pow(Math.abs(Math.cos(Math.PI * 21 * xx + 2.2 * fbm(xx * 5, v * 3, 3))), 4) * 0.1 + fbm(x * 4, v * 10, 3) * 0.25;
  }, 1.2);
  shared = {
    foliage: leafMaterial({ map: leafMap, normalMap: leafNormal, normalScale: 0.8, vertexColors: true, translucency: 0.55, roughness: 0.52 }),
    bloom: petalMaterial({ map: petalMap, normalMap: petalNormal, normalScale: 0.6, vertexColors: true, translucency: 0.9, roughness: 0.36 }),
  };
  return shared;
}

// ------------------------------------------------------------ the plant

const BULB = lin('#8a5a33');
const BULB_DARK = lin('#5a3820');
const BULB_FLESH = lin('#e9dcbf');
const PLATE = lin('#b99a6c');
const BUD_GREEN = lin('#86a35c');
const PISTIL = lin('#c9cf8a');
const STIGMA = lin('#efe3a0');

// the inside base of each colour: yellow, dark or green-tinged blotches
const BLOTCH = { '#e0262c': '#f0b72a', '#f4c21f': '#b9b840', '#f27ba3': '#f6f0e4', '#8e3fb0': '#3a1d4a', '#f7f1e4': '#f1d77a' };
const DARK_STAMENS = new Set(['#e0262c', '#8e3fb0', '#f27ba3']);

const M1 = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
const F = new THREE.Matrix4();
const pt = { p: [0, 0, 0], t: [0, 1, 0] };
const ramp01 = (g, a, b) => sat((g - a) / (b - a));

class Tulip extends FlowerBase {
  constructor(opts = {}) {
    const a = assets();
    super(opts, { foliage: a.foliage, bloom: a.bloom, height: PLANTS.tulip.height, stiffness: 1, bloomRadius: 0.07 });
    const rng = mulberry32((opts.seed ?? 1) * 7 + 3);
    const H = PLANTS.tulip.height * (0.9 + rng() * 0.18);
    this.stalkH = H - 0.058;
    this.leanX = (rng() - 0.5) * 0.12;
    this.leanZ = (rng() - 0.5) * 0.1 + 0.03;
    this.wig = rng() * TAU;
    const side = rng() < 0.5 ? -1 : 1;
    const a0 = side * Math.PI * 0.5 + (rng() - 0.5) * 0.8;
    const k = H / 0.4;
    this.leaves = [
      { az: a0, L: (0.2 + rng() * 0.05) * k, W: 0.062 + rng() * 0.01, y0: -0.018, tilt: 0.26 + rng() * 0.14, arch: -(0.55 + rng() * 0.4), twist: (rng() - 0.5) * 0.5, len: [[0.12, 0.02], [0.22, 0.045], [0.3, 0.075], [0.56, 1]], un: [0.27, 0.52], ph: rng() * 6 },
      { az: a0 + Math.PI + (rng() - 0.5) * 0.7, L: (0.18 + rng() * 0.05) * k, W: 0.056 + rng() * 0.01, y0: -0.013, tilt: 0.22 + rng() * 0.14, arch: -(0.45 + rng() * 0.4), twist: (rng() - 0.5) * 0.5, len: [[0.14, 0.015], [0.24, 0.035], [0.33, 0.06], [0.6, 1]], un: [0.33, 0.58], ph: rng() * 6 },
      { az: a0 + side * (Math.PI * 0.5 + (rng() - 0.5) * 0.6), L: (0.12 + rng() * 0.04) * k, W: 0.032 + rng() * 0.008, y0: 0, up: 0.16 + rng() * 0.08, tilt: 0.2 + rng() * 0.12, arch: -(0.35 + rng() * 0.3), twist: (rng() - 0.5) * 0.6, len: [[0.3, 0.02], [0.42, 0.05], [0.64, 1]], un: [0.4, 0.64], ph: rng() * 6 },
    ];
    this.rgb = lin(color(opts));
    this.blotch = lin(BLOTCH[color(opts)] ?? '#f0cf6a');
    this.darkStamens = DARK_STAMENS.has(color(opts));
    this.tepals = [];
    const spin = rng() * TAU;
    for (let i = 0; i < 6; i++) {
      const outer = i % 2 === 0;
      this.tepals.push({
        outer,
        az: spin + (i * Math.PI) / 3 + (rng() - 0.5) * 0.08,
        L: (outer ? 0.064 : 0.06) * (0.95 + rng() * 0.1),
        W: (outer ? 0.044 : 0.04) * (0.95 + rng() * 0.1),
        open: (rng() - 0.5) * 0.12,
        tint: 0.94 + rng() * 0.1,
        seed: rng() * 20,
      });
    }
    this.soil = new SoilCover(rng, { radius: 0.034, height: 0.023, wedges: 6, crumbs: 16 });
    this.bulbSpin = rng() * TAU;
    this.path = new Path(20);
  }

  // Receptacle height above the soil at growth g.
  stalkHeight(g) {
    if (this.cut) return 0.3;
    return curve(g, [[0.18, 0.0], [0.3, 0.03], [0.5, 0.16], [0.66, this.stalkH * 0.86], [0.92, this.stalkH]]);
  }

  stalk(g) {
    const hs = this.stalkHeight(g);
    const y0 = this.cut ? 0 : -0.02;
    const lx = this.cut ? 0 : this.leanX;
    const lz = this.cut ? 0 : this.leanZ;
    const w = this.wig;
    return this.path.set(16, (k, n, out) => {
      const t = k / (n - 1);
      const h = y0 + t * (hs - y0);
      out[0] = lx * t * t * hs + Math.sin(t * Math.PI * 1.3 + w) * 0.004 * hs;
      out[1] = h;
      out[2] = lz * t * t * hs + Math.cos(t * Math.PI * 1.1 + w) * 0.003 * hs;
    });
  }

  build(g) {
    const cut = this.cut;
    const path = this.stalk(g);
    // --- soil, bulb
    this.part(2, cut ? -1 : quant(Math.min(g, 0.73), 250), this.soi, this.soiMesh, (b) => {
      if (cut) return;
      if (g < 0.085) this.bulb(b);
      this.soil.build(b, g, 0.08, 0.17);
    });
    // --- stalk and leaves
    this.part(0, quant(Math.min(g, 0.92), 400), this.fol, this.folMesh, (b) => {
      if (g >= 0.28 || cut) {
        const thin = cut ? 1 : mix(0.55, 1, ease(g, 0.3, 0.62));
        tube(b, path, (q) => (mix(0.0048, 0.0036, q) + 0.0012 * sm(0.9, 1, q)) * thin, { radial: 7, u0: STEM_U[0], u1: STEM_U[1], v0: 0, vScale: 1 / Math.max(0.05, path.length()) });
      }
      for (let i = 0; i < this.leaves.length; i++) {
        if (cut && i !== 2) continue;
        this.leaf(b, g, this.leaves[i]);
      }
    });
    // --- bud and bloom: its shape depends only on how open and how coloured
    // it is; its size and place are the mesh's matrix
    const open = cut ? 1 : quant(ease(g, 0.8, 1.0), 160);
    const colour = cut ? 1 : quant(ramp01(g, 0.64, 0.8), 50);
    const s = this.budScale(g);
    this.part(1, g < 0.3 && !cut ? -1 : open * 1000 + colour, this.blo, this.bloMesh, (b) => {
      if (g < 0.3 && !cut) return;
      this.flower(b, open, colour);
    });
    const top = path.at(path.length(), pt);
    if (this.bloMesh.visible) this.placeBloom(frameAlong(F, top.p, top.t, 0, s));
    // size for picking, and landing spots
    this.height = Math.max(0.03, top.p[1] + 0.06 * s);
    this.spread = g < 0.3 ? 0.05 : 0.08 + 0.08 * ease(g, 0.3, 0.6);
    if (!cut) {
      if (g > 0.86) this.spot('bloom', [top.p[0] + top.t[0] * 0.028 * s, top.p[1] + top.t[1] * 0.028 * s, top.p[2] + top.t[2] * 0.028 * s], top.t, color(this), 1);
      if (g > 0.45) this.leafSpot(g, this.leaves[0]);
    }
  }

  budScale(g) {
    if (this.cut) return 1;
    return curve(g, [[0.3, 0.28], [0.62, 0.52], [0.8, 1]]);
  }

  bulb(b) {
    M1.makeRotationY(this.bulbSpin);
    M2.makeRotationX(0.12);
    M1.multiply(M2).setPosition(0, 0.0, 0);
    const sp = this.bulbSpin;
    blob(b, M1, 0.012, 0.0138, 0.012, {
      cols: 20,
      rows: 12,
      shape: (lat, lon, out) => {
        out[0] = lat < 0.5 ? 1 - 0.12 * sm(0.25, 0.0, lat) : 1 - 0.8 * Math.pow((lat - 0.5) / 0.5, 1.5);
        out[1] = (lat < 0.2 ? (0.2 - lat) * 0.015 : 0) + (lat > 0.75 ? ((lat - 0.75) / 0.25) ** 2 * 0.0065 : 0);
      },
      color: (lat, lon, o) => {
        const n = noise2(lon * 22 + sp, lat * 3);
        const torn = sm(0.62, 0.72, fbm(lon * 6 + sp, lat * 4, 3)) * sm(0.15, 0.3, lat) * sm(0.85, 0.6, lat);
        let c = mixRGB(BULB, BULB_DARK, 0.25 + 0.5 * n * n + 0.35 * sm(0.6, 1, lat));
        c = mixRGB(c, BULB_FLESH, torn * 0.8);
        c = mixRGB(c, PLATE, sm(0.14, 0.04, lat));
        o.r = c[0];
        o.g = c[1];
        o.b = c[2];
      },
    });
  }

  // Leaf state: length (m), how unrolled (0..1).
  leafState(g, lf) {
    if (this.cut) return { len: lf.L, un: 1 };
    // the first keys are absolute lengths (the rolled shoot), the last is "full"
    const keys = lf.len.map(([gg, v], i) => [gg, i === lf.len.length - 1 ? lf.L : v]);
    return { len: Math.max(0.004, curve(g, keys)), un: ease(g, lf.un[0], lf.un[1]) };
  }

  leafSheet(g, lf) {
    const { len, un } = this.leafState(g, lf);
    const L = len;
    const W = lf.W * Math.max(0.62, Math.pow(Math.min(1, L / lf.L), 0.5)) * mix(0.92, 1, un);
    const width = (v) => (v < 0.3 ? mix(0.62, 1, Math.sin((v / 0.3) * Math.PI * 0.5)) : Math.pow(Math.max(0, 1 - Math.pow((v - 0.3) / 0.7, 1.8)), 0.72));
    const rolled = 1 - un;
    const hwMax = 0.5 * W;
    // rolled: each half wraps ~0.96 pi, a closed spike; open: a shallow V
    // with the base still clasping the stalk
    const wrap = (v) => {
      const hw = Math.max(1e-4, 0.5 * W * width(v));
      const roll = (0.96 * Math.PI) / hw;
      const clasp = v < 0.14 ? mix((0.75 * Math.PI) / hw, 9, sm(0.0, 0.14, v)) : 9;
      return mix(clasp, roll, Math.pow(rolled, 0.7));
    };
    const fold = (v) => mix(0.3, 0.0, Math.pow(rolled, 0.5)) * sm(0.0, 0.2, v);
    const rho = (v) => (0.5 * W * width(v)) / (0.96 * Math.PI);
    const rhoMax = hwMax / (0.96 * Math.PI);
    const ringR = mix(0.005, rhoMax, Math.pow(rolled, 0.7));
    // rolled rows keep their tube centred on the stalk, so the leaves nest
    const shift = (v) => (rhoMax - rho(v)) * Math.pow(rolled, 0.7);
    const y0 = lf.up ? this.stalkHeight(g) * lf.up + (this.cut ? 0 : -0.02) * (1 - lf.up) : lf.y0;
    return {
      p: {
        L,
        W,
        nu: 8,
        nv: 14,
        width,
        wrap,
        fold,
        bend0: -lf.tilt * un,
        curl: lf.arch * un * (0.4 + 0.6 * Math.min(1, L / lf.L)),
        curlPow: 1.7,
        twist: lf.twist * un,
        shift,
        wave: 0.0035 * un,
        waveN: 5,
        wavePh: lf.ph,
        uv: LEAF_UV,
      },
      ringR,
      y0,
      un,
    };
  }

  leaf(b, g, lf) {
    const { p, ringR, y0, un } = this.leafSheet(g, lf);
    if (p.L < 0.005) return;
    const young = 1 - un;
    const tipRed = young * 0.5;
    p.color = (s, v, o) => {
      const ao = 0.72 + 0.28 * sm(0.0, 0.16, v);
      const pale = 1 + 0.25 * sm(0.12, 0.0, v) * young;
      o.r = ao * pale * (1 + tipRed * 0.6 * sm(0.75, 1, v));
      o.g = ao * pale * (1 + 0.06 * young) * (1 - tipRed * 0.25 * sm(0.75, 1, v));
      o.b = ao * pale * (1 - 0.08 * young);
    };
    place(M1, Math.sin(lf.az) * ringR, y0, Math.cos(lf.az) * ringR, lf.az + Math.PI);
    sheet(b, M1, p);
  }

  leafSpot(g, lf) {
    const { p, ringR, y0 } = this.leafSheet(g, lf);
    const [yy, zz, ty, tz] = sheetMidrib(p, 0.55);
    place(M1, Math.sin(lf.az) * ringR, y0, Math.cos(lf.az) * ringR, lf.az + Math.PI);
    const pos = new THREE.Vector3(0, yy, zz).applyMatrix4(M1);
    const n = new THREE.Vector3(0, -tz, ty).transformDirection(M1);
    if (n.y < 0) n.negate();
    pos.addScaledVector(n, 0.002);
    this.spot('leaf', [pos.x, pos.y, pos.z], [n.x, n.y, n.z], '#6f9468', 0.2);
  }

  // Six tepals, pistil and stamens in the flower's own frame (receptacle at
  // the origin, axis +y, full size). o: 0 closed bud .. 1 open cup;
  // c: 0 green .. 1 coloured (tips first).
  flower(b, o, c) {
    F.identity();
    const s = 1;
    const rgb = this.rgb;
    const tmp = [0, 0, 0];
    const rows = 14;
    const wrapTab = new Float32Array(rows + 1);
    const zTab = new Float32Array(rows + 1);
    for (const tp of this.tepals) {
      const outer = tp.outer;
      const L = tp.L * s * mix(0.9, 1, o);
      const W = tp.W * s * mix(0.88, 1, o);
      const r0 = (outer ? 0.0052 : 0.0036) * s;
      const width = (v) => (v < 0.58 ? 0.26 + 0.74 * Math.sin((v / 0.58) * Math.PI * 0.5) : Math.pow(Math.max(0, 1 - ((v - 0.58) / 0.42) ** 2), 0.42));
      const p = {
        L,
        W,
        nu: 10,
        nv: rows,
        width,
        bend0: outer ? mix(-0.62, -0.72, o) - tp.open * o : mix(-0.5, -0.6, o) - tp.open * o,
        curl: outer ? mix(1.95, 0.55, o) : mix(1.75, 0.6, o),
        curlPow: 1.15,
        uv: PETAL_UV,
        seed: tp.seed,
        crinkle: 0.0006 * o,
        crinkleF: 5,
      };
      // cross curvature: hug the bud when closed (each tepal covering a third
      // or so of it), a gentle cup when open
      midribZ(p, rows, zTab);
      for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        const rad = Math.max(0.002, r0 - zTab[j]);
        const hw = Math.max(1e-4, 0.5 * W * width(v));
        const cap = ((outer ? 1.08 : 0.95) * Math.PI) / 3 / hw;
        const closed = Math.min(1 / rad, cap);
        wrapTab[j] = mix(closed, outer ? 15 : 19, o * o);
      }
      p.wrap = (v) => wrapTab[Math.round(v * rows)];
      const colK = (v) => {
        const k = sat((c - 0.6 * (1 - v)) / 0.4 + 0.25 * v);
        return k * k * (3 - 2 * k);
      };
      p.color = (sv, v, out) => {
        const k = colK(v);
        mixRGB(BUD_GREEN, rgb, k, tmp);
        const bl = (1 - sm(0.04, 0.24, v)) * k;
        mixRGB(tmp, this.blotch, bl * 0.85, tmp);
        const ao = 0.62 + 0.38 * sm(0.0, 0.3, v);
        const t = tp.tint * ao * (1 + 0.06 * Math.pow(Math.abs(sv), 4));
        out.r = tmp[0] * t;
        out.g = tmp[1] * t;
        out.b = tmp[2] * t;
      };
      p.flip = false;
      M1.makeTranslation(Math.sin(tp.az) * r0, 0, Math.cos(tp.az) * r0);
      M2.makeRotationY(tp.az + Math.PI);
      M1.multiply(M2);
      M2.multiplyMatrices(F, M1);
      sheet(b, M2, p);
    }
    // pistil and stamens, seen once the cup opens
    if (o > 0.05) {
      const k = s;
      M1.makeTranslation(0, 0.008 * k, 0);
      M2.multiplyMatrices(F, M1);
      blob(b, M2, 0.0032 * k, 0.009 * k, 0.0032 * k, {
        cols: 9,
        rows: 6,
        uv: PLAIN_UV,
        rgb: PISTIL,
        thick: 0.5,
        shape: (lat, lon, out) => {
          out[0] = 1 + 0.18 * Math.cos(lon * TAU * 3);
        },
      });
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3 + 0.3;
        place(M1, Math.sin(a) * 0.0022 * k, 0.0175 * k, Math.cos(a) * 0.0022 * k, a, 0.9, 0);
        M2.multiplyMatrices(F, M1);
        blob(b, M2, 0.0022 * k, 0.0012 * k, 0.0032 * k, { cols: 6, rows: 4, uv: PLAIN_UV, rgb: STIGMA, thick: 0.5 });
      }
      const fil = this.darkStamens ? lin('#2c1a2a') : lin('#d8c060');
      const anth = this.darkStamens ? lin('#1c1016') : lin('#e0b22a');
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6 + this.tepals[0].az;
        place(M1, Math.sin(a) * 0.0042 * k, 0.001, Math.cos(a) * 0.0042 * k, a, 0.22, 0);
        M2.multiplyMatrices(F, M1);
        M2.multiply(M1.makeTranslation(0, 0.0055 * k, 0));
        blob(b, M2, 0.0006 * k, 0.0055 * k, 0.0006 * k, { cols: 5, rows: 3, uv: PLAIN_UV, rgb: fil, thick: 0.6 });
        M2.multiply(M1.makeTranslation(0, 0.0085 * k, 0));
        blob(b, M2, 0.0013 * k, 0.0042 * k, 0.0011 * k, { cols: 6, rows: 4, uv: PLAIN_UV, rgb: anth, thick: 0.8 });
      }
    }
  }

  cutPoint() {
    const top = this.path.at(this.path.length(), pt);
    const p = this.path.at(Math.max(0, this.path.length() - 0.3), { p: [0, 0, 0], t: [0, 1, 0] });
    const d = [top.p[0] - p.p[0], top.p[1] - p.p[1], top.p[2] - p.p[2]];
    return { p: p.p.slice(), t: d };
  }
}

function color(o) {
  return (o.color ?? PLANTS.tulip.colors[0]).toLowerCase();
}

export function createTulip(opts) {
  return new Tulip(opts);
}
