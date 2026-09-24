// Moonflower (Ipomoea alba), the night flower for Bedtime: a large pale
// seed sown beside a slim bamboo cane, butterfly-shaped seed leaves, then a
// vine that twines up the cane with heart-shaped leaves on long stalks.
// Long buds, twisted like a furled umbrella, untwist into broad white
// trumpets with a faint green star. They glow very softly, more at night.
import * as THREE from 'three';
import { PLANTS, mulberry32 } from '../config.js';
import { leafMaterial, petalMaterial } from './materials.js';
import { Path, sheet, sheetMidrib, tube, frameAlong, paint, paintNormal, lin, mixRGB, mix, ease, quant, sat, fbm, TAU } from './common.js';
import { FlowerBase } from './flower.js';
import { SoilCover } from './soilcover.js';
import { Seedling } from './seedling.js';
import { leafAtlas, BLADE_UV, STEM_U } from './textures.js';

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
    c1: [0.19, 0.35, 0.13],
    c2: [0.25, 0.42, 0.16],
    vein: [0.4, 0.55, 0.26],
    rib: [0.48, 0.62, 0.32],
    edge: [0.2, 0.34, 0.13],
    veins: 6,
    angle: 0.5,
    basal: true,
    net: 22,
    netK: 0.25,
    quilt: 0.45,
    plain1: [0.3, 0.46, 0.18],
    plain2: [0.36, 0.52, 0.22],
    stem1: [0.3, 0.45, 0.2],
    stem2: [0.38, 0.5, 0.24],
  });
  // the corolla: soft white with fine veins running out from the throat
  const veinAt = (x, v) => Math.pow(Math.abs(Math.cos(x * Math.PI * 30 + fbm(x * 4, v * 4, 2) * 2)), 12);
  const map = paint(256, 256, (u, v, o) => {
    if (u > 0.86) {
      const l = 0.88 + 0.1 * fbm(u * 30, v * 30, 3);
      o[0] = o[1] = o[2] = l;
      return;
    }
    const x = u / 0.84;
    const l = 0.95 + 0.05 * fbm(x * 6, v * 3, 3) - 0.04 * veinAt(x, v) * sm(0.3, 0.9, v);
    o[0] = o[1] = o[2] = Math.min(1, l);
  });
  const normalMap = paintNormal(256, 256, (u, v) => {
    const x = Math.min(1, u / 0.84);
    return veinAt(x, v) * 0.12 + fbm(x * 8, v * 8, 3) * 0.3;
  }, 1.4);
  shared = {
    foliage: leafMaterial({ map: leaf.map, normalMap: leaf.normalMap, normalScale: 0.9, vertexColors: true, roughness: 0.5, translucency: 0.5 }),
    bloom: petalMaterial({ map, normalMap, normalScale: 0.5, vertexColors: true, translucency: 0.85, roughness: 0.55, glow: 0.07, backTint: [0.97, 0.99, 0.94] }),
  };
  return shared;
}

const WHITE = lin('#fbf8ee');
const STAR = lin('#e3ebc2');
const THROAT = lin('#dce8b8');
const TUBE = lin('#e6eed2');
const CALYX = lin('#6d8f48');
// the cane uses the stem strip of the leaf atlas, tinted from green to cane
const BAMBOO = [5.0, 1.7, 3.2];
const NODE = [2.7, 0.9, 1.6];

const M1 = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
const F = new THREE.Matrix4();
const X = new THREE.Vector3();
const Y = new THREE.Vector3();
const Z = new THREE.Vector3();
const pt = { p: [0, 0, 0], t: [0, 1, 0] };
const tmp = [0, 0, 0];

class Moonflower extends FlowerBase {
  constructor(opts = {}) {
    const a = assets();
    super(opts, { foliage: a.foliage, bloom: a.bloom, height: PLANTS.moonflower.height + 0.08, stiffness: 0.5 });
    const rng = mulberry32((opts.seed ?? 1) * 31 + 17);
    this.H = PLANTS.moonflower.height * (0.92 + rng() * 0.14);
    this.rgb = lin(opts.color ?? PLANTS.moonflower.colors[0]);
    this.sprout = new Seedling(rng, { seed: 'moonflower', hyp: 0.042, coat: true, cot: { L: 0.022, W: 0.03, shape: 'butterfly', petiole: 0.28 } });
    this.soil = new SoilCover(rng, { radius: 0.03, height: 0.016, wedges: 5, crumbs: 12 });
    // the cane stands just behind the seed, leaning a touch
    const caneAz = -Math.PI * 0.5 + (rng() - 0.5) * 0.8;
    this.cane = [Math.cos(caneAz) * 0.028, Math.sin(caneAz) * 0.028];
    this.caneLean = [(rng() - 0.5) * 0.04, (rng() - 0.5) * 0.04];
    this.twist0 = rng() * TAU;
    this.vineMax = this.H - 0.05;
    this.leaves = [];
    const nl = 6 + Math.floor(rng() * 2);
    for (let i = 0; i < nl; i++) {
      this.leaves.push({
        at: 0.05 + ((i + rng() * 0.3) / nl) * (this.vineMax - 0.08),
        L: (0.1 - i * 0.005) * (0.9 + rng() * 0.2),
        pet: 0.04 + rng() * 0.02,
        droop: 0.35 + rng() * 0.45,
        twist: (rng() - 0.5) * 0.7,
        turn: (rng() - 0.5) * 0.8,
        c: [0, 0, 0],
        n: [0, 1, 0],
      });
    }
    this.flowers = [
      { at: this.vineMax * 0.93, open: [0.8, 0.97], turn: (rng() - 0.5) * 0.5, lift: 0.55 + rng() * 0.2, spin: rng() * TAU },
      { at: this.vineMax * 0.6, open: [0.86, 1.0], turn: (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.3), lift: 0.4 + rng() * 0.2, spin: rng() * TAU },
    ];
    this.path = new Path(26);
    this.vine = new Path(72);
    this.canePath = new Path(4);
    this.leafPath = new Path(5);
    this.pedPath = new Path(4);
    this.vLen = 0;
  }

  vineLen(g) {
    return this.cut ? 0.3 : this.vineMax * ease(g, 0.28, 0.62);
  }

  caneAt(y, out) {
    out[0] = this.cane[0] + this.caneLean[0] * y;
    out[1] = this.cane[1] + this.caneLean[1] * y;
    return out;
  }

  // The vine rises from the seed-leaf node, reaches over to the cane and
  // twines up it. A cut piece is just a gently curved stem.
  vinePath(g) {
    const len = this.vineLen(g);
    this.vLen = len;
    if (this.cut) {
      return this.vine.set(12, (k, n, out) => {
        const s = (k / (n - 1)) * len;
        out[0] = 0.012 * Math.sin(s * 9);
        out[1] = s;
        out[2] = 0;
      });
    }
    const node = this.path.at(this.sprout.nodeS, pt).p.slice();
    const pitch = 0.085;
    const R = 0.0052;
    const n = Math.max(6, Math.min(72, Math.round((len / pitch) * 10) + 4));
    const c = [0, 0];
    return this.vine.set(n, (k, nn, out) => {
      const s = (k / (nn - 1)) * len;
      const reach = sm(0, 0.05, s);
      const y = node[1] + s;
      const a = this.twist0 + (s / pitch) * TAU;
      this.caneAt(y, c);
      out[0] = mix(node[0], c[0] + Math.cos(a) * R, reach);
      out[1] = y;
      out[2] = mix(node[2], c[1] + Math.sin(a) * R, reach);
    });
  }

  // The vine point at climb distance s (the vine is sampled evenly in s,
  // not in arc length).
  vineAt(s, out) {
    const v = this.vine;
    const f = sat(s / Math.max(1e-6, this.vLen)) * (v.n - 1);
    const k = Math.min(v.n - 2, Math.floor(f));
    return v.at(mix(v.s[k], v.s[k + 1], f - k), out);
  }

  build(g) {
    const cut = this.cut;
    const sp = this.sprout;
    if (!cut) sp.stemPath(this.path, g, { epi: 0 });
    this.part(2, cut ? -1 : quant(Math.min(g, 0.73), 250), this.soi, this.soiMesh, (b) => {
      if (cut) return;
      sp.seedMesh(b, g);
      sp.coatMesh(b, g, this.path);
      this.soil.build(b, g, 0.08, 0.16);
    });
    const vine = g > 0.28 || cut ? this.vinePath(g) : null;
    if (!vine) this.vLen = 0;
    this.part(0, quant(Math.min(g, 0.8), 260), this.fol, this.folMesh, (b) => {
      if (!cut) {
        this.caneMesh(b);
        if (g > 0.09) {
          tube(b, this.path, () => 0.0016 * mix(0.8, 1.2, ease(g, 0.3, 0.6)), { radial: 6, u0: STEM_U[0], u1: STEM_U[1], vScale: 4 });
          sp.cotyledons(b, g, this.path, 0.0016, 1 - ease(g, 0.55, 0.75) * 0.5);
        }
      }
      if (vine) {
        tube(b, vine, (q) => mix(0.0021, 0.0012, q), { radial: 5, u0: STEM_U[0], u1: STEM_U[1], vScale: 3 });
        for (const lf of this.leaves) this.leaf(b, g, lf);
        for (const fl of this.flowers) this.peduncle(b, g, fl);
      }
    });
    this.part(1, !cut && g < 0.58 ? -1 : quant(g, 220), this.blo, this.bloMesh, (b) => {
      if (!cut && g < 0.58) return;
      for (let i = 0; i < this.flowers.length; i++) {
        if (cut && i > 0) continue;
        this.flower(b, g, this.flowers[i]);
      }
    });
    const top = vine ? vine.p[(vine.n - 1) * 3 + 1] : this.path.p[(this.path.n - 1) * 3 + 1];
    this.height = Math.max(0.06, top + (g > 0.62 || cut ? 0.07 : 0.02));
    this.spread = 0.06 + 0.1 * ease(g, 0.35, 0.7);
    if (!cut && vine) {
      for (const fl of this.flowers) {
        if (this.vLen < fl.at + 0.01 || ease(g, fl.open[0], fl.open[1]) < 0.75) continue;
        const e = this.flowerFrame(fl).elements;
        const d = 0.075 + 0.01;
        this.spot('bloom', [e[12] + e[4] * d, e[13] + e[5] * d, e[14] + e[6] * d], [e[4], e[5], e[6]], this.color, 0.8);
      }
      const lf = this.leaves[1];
      if (this.leafK(lf) > 0.9) this.spot('leaf', lf.c, lf.n, '#2f5a24', 0.5);
    }
  }

  // The bamboo cane: pale straw with darker nodes.
  caneMesh(b) {
    const H = this.H + 0.02;
    const c = [0, 0];
    this.canePath.set(4, (k, n, out) => {
      const y = -0.05 + (k / (n - 1)) * (H + 0.05);
      this.caneAt(y, c);
      out[0] = c[0];
      out[1] = y;
      out[2] = c[1];
    });
    tube(b, this.canePath, (q) => (q > 0.99 ? 0.0011 : 0.0028), {
      radial: 8,
      u0: STEM_U[0],
      u1: STEM_U[1],
      vScale: 1,
      color: (q, a, o) => {
        const y = q * (H + 0.05);
        const nodeK = Math.max(0, 1 - Math.abs((y % 0.14) - 0.07) * 70);
        o.r = mix(BAMBOO[0], NODE[0], nodeK);
        o.g = mix(BAMBOO[1], NODE[1], nodeK);
        o.b = mix(BAMBOO[2], NODE[2], nodeK);
        o.t = 1;
      },
    });
  }

  leafK(lf) {
    return this.cut ? 1 : sat((this.vLen - lf.at - 0.01) / 0.07);
  }

  // A heart-shaped leaf on a long stalk. The blade is built from its tip
  // back to its base so the sheet's notch makes the heart's sinus.
  leaf(b, g, lf) {
    if (this.cut && lf !== this.leaves[1]) return;
    const k = this.leafK(lf);
    if (k <= 0.01) return;
    this.vineAt(this.cut ? 0.14 : lf.at, pt);
    const P0 = pt.p.slice();
    // outwards from the cane, turned a little towards the front of the bed
    let dx = 1;
    let dz = 0;
    if (!this.cut) {
      const c = this.caneAt(P0[1], [0, 0]);
      dx = P0[0] - c[0];
      dz = P0[2] - c[1] + 0.004;
    }
    const az = Math.atan2(dz, dx) + lf.turn;
    dx = Math.cos(az);
    dz = Math.sin(az);
    const young = 1 - k;
    const sc = mix(0.22, 1, Math.pow(k, 0.8));
    const pet = lf.pet * sc;
    const P1 = [P0[0] + dx * pet * 0.8, P0[1] + pet * mix(0.9, 0.45, k), P0[2] + dz * pet * 0.8];
    const C = [P0[0] + dx * pet * 0.2, P0[1] + pet * 0.7, P0[2] + dz * pet * 0.2];
    this.leafPath.set(5, (i, n, out) => {
      const t = i / (n - 1);
      const u = 1 - t;
      for (let c = 0; c < 3; c++) out[c] = u * u * P0[c] + 2 * u * t * C[c] + t * t * P1[c];
    });
    tube(b, this.leafPath, () => 0.0011, { radial: 4, u0: STEM_U[0], u1: STEM_U[1], vScale: 3 });
    // blade direction D (base to tip) and its upper face N
    const a = mix(-0.9, lf.droop, k);
    const D = [dx * Math.cos(a), -Math.sin(a), dz * Math.cos(a)];
    let N = [dx * Math.sin(a), Math.cos(a), dz * Math.sin(a)];
    const tw = lf.twist * k;
    const DxN = [D[1] * N[2] - D[2] * N[1], D[2] * N[0] - D[0] * N[2], D[0] * N[1] - D[1] * N[0]];
    N = [N[0] * Math.cos(tw) + DxN[0] * Math.sin(tw), N[1] * Math.cos(tw) + DxN[1] * Math.sin(tw), N[2] * Math.cos(tw) + DxN[2] * Math.sin(tw)];
    const L = lf.L * sc;
    const p = {
      L,
      W: L * 0.92,
      nu: 8,
      nv: 12,
      width: (v) => (v < 0.68 ? Math.pow(Math.sin((v / 0.68) * Math.PI * 0.5), 0.8) : 1 - 0.42 * ((v - 0.68) / 0.32) ** 2),
      notch: 0.2,
      notchW: 0.5,
      fold: mix(0.08, 1.25, young),
      wrap: mix(4, 40, young),
      curl: -0.35 * k,
      wave: 0.0015 * k,
      waveN: 2,
      uv: [BLADE_UV[0], BLADE_UV[1], 1, 0],
      color: (s, v, o) => {
        const ao = 0.82 + 0.18 * sm(0.2, 0.7, v);
        o.r = ao * (1 + 0.14 * young);
        o.g = ao * (1 + 0.12 * young);
        o.b = ao;
      },
    };
    // put the base of the midrib (after the notch) on the stalk's end
    const m = sheetMidrib(p, 1);
    const by = m[0] - m[2] * p.notch * L;
    const bz = m[1] - m[3] * p.notch * L;
    Y.set(-D[0], -D[1], -D[2]);
    Z.set(N[0], N[1], N[2]);
    X.crossVectors(Y, Z).normalize();
    M1.makeBasis(X, Y, Z).setPosition(P1[0] - Y.x * by - Z.x * bz, P1[1] - Y.y * by - Z.y * bz, P1[2] - Y.z * by - Z.z * bz);
    sheet(b, M1, p);
    const e = M1.elements;
    const hy = m[0] * 0.5;
    const hz = m[1] * 0.5;
    lf.c[0] = e[12] + e[4] * hy + e[8] * hz + N[0] * 0.003;
    lf.c[1] = e[13] + e[5] * hy + e[9] * hz + N[1] * 0.003;
    lf.c[2] = e[14] + e[6] * hy + e[10] * hz + N[2] * 0.003;
    lf.n[0] = N[0];
    lf.n[1] = N[1];
    lf.n[2] = N[2];
  }

  // Each flower sits on a short stalk from the vine, facing out and up
  // towards the front of the bed.
  flowerFrame(fl) {
    if (this.cut) {
      this.vineAt(this.vLen, pt);
      return frameAlong(F, pt.p, [0, Math.sin(1.2), Math.cos(1.2)], fl.spin, 1);
    }
    this.vineAt(fl.at, pt);
    const out = Math.PI * 0.5 + fl.turn;
    const lift = fl.lift;
    const dir = [Math.cos(out) * Math.cos(lift), Math.sin(lift), Math.sin(out) * Math.cos(lift)];
    const base = [pt.p[0] + dir[0] * 0.016, pt.p[1] + dir[1] * 0.016 - 0.006, pt.p[2] + dir[2] * 0.016];
    return frameAlong(F, base, dir, fl.spin, 1);
  }

  peduncle(b, g, fl) {
    if (this.cut || this.vLen < fl.at + 0.01 || g < 0.58) return;
    this.vineAt(fl.at, pt);
    const p0 = pt.p.slice();
    const f = this.flowerFrame(fl).elements;
    const p1 = [f[12], f[13], f[14]];
    this.pedPath.set(4, (k, n, out) => {
      const t = k / (n - 1);
      out[0] = mix(p0[0], p1[0], t);
      out[1] = mix(p0[1], p1[1], t) + Math.sin(t * Math.PI) * 0.004;
      out[2] = mix(p0[2], p1[2], t);
    });
    tube(b, this.pedPath, () => 0.0013, { radial: 4, u0: STEM_U[0], u1: STEM_U[1], vScale: 3 });
  }

  // The flower: calyx, then the corolla as one surface, a slender tube that
  // flares into a broad flat limb. Closed, the limb is furled into a long
  // twisted bud; as it opens it untwists and spreads.
  flower(b, g, fl) {
    const cut = this.cut;
    if (!cut && this.vLen < fl.at + 0.01) return;
    const bud = cut ? 1 : ease(g, 0.6, fl.open[0]);
    const open = cut ? 1 : ease(g, fl.open[0], fl.open[1]);
    const Fm = this.flowerFrame(fl);
    const sc = mix(0.25, 1, bud);
    M1.makeScale(sc, sc, sc);
    const M = M2.multiplyMatrices(Fm, M1);
    const e = M.elements;
    for (let i = 0; i < 5; i++) {
      const az = (i / 5) * TAU;
      M1.makeRotationY(az + Math.PI).setPosition(Math.sin(az) * 0.0032, 0, Math.cos(az) * 0.0032);
      M1.premultiply(M);
      sheet(b, M1, {
        L: 0.017,
        W: 0.009,
        nu: 3,
        nv: 4,
        width: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.2 + v * 0.75)), 0.7),
        bend0: -0.1,
        curl: 0.15,
        wrap: 110,
        uv: PLAIN_P,
        rgb: CALYX,
      });
    }
    const cols = 30;
    const rows = 20;
    const tubeL = 0.075;
    const R = 0.05;
    const throat = 0.46;
    const o2 = sm(0, 1, open);
    const closed = 1 - o2;
    const twist = 3.0 * closed;
    const rgb = this.rgb;
    b.grid(
      cols,
      rows,
      (i, j, o) => {
        const phi = (i / cols) * TAU;
        const s = j / rows;
        let r;
        let y;
        let tw = 0;
        if (s <= throat) {
          const q = s / throat;
          r = mix(0.0024, mix(0.0042, 0.0055, o2), q * q);
          y = q * tubeL * mix(0.8, 1, bud);
        } else {
          const q = (s - throat) / (1 - throat);
          const penta = 0.93 + 0.07 * Math.cos(5 * (phi + 0.3));
          const rOpen = mix(0.0055, R * penta, Math.pow(q, 0.85));
          // five soft pleats along the star's bands
          const pleat = Math.pow(Math.max(0, Math.cos(5 * (phi + 0.3 - Math.PI / 5))), 6) * 0.0028 * Math.sin(q * Math.PI * 0.8);
          const yOpen = tubeL + 0.011 * Math.sin(q * Math.PI * 0.55) - 0.005 * q * q * q + pleat;
          const rClosed = mix(0.0042, 0.0012, q) * (1 + 0.9 * Math.sin(q * Math.PI * 0.9)) * (1 + 0.14 * Math.cos(5 * phi) * sm(0.05, 0.3, q));
          const yClosed = tubeL * mix(0.8, 1, bud) + q * 0.045;
          r = mix(rClosed, rOpen, o2);
          y = mix(yClosed, yOpen, o2);
          tw = twist * q;
        }
        const a = phi + tw;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        o.x = e[0] * x + e[4] * y + e[8] * z + e[12];
        o.y = e[1] * x + e[5] * y + e[9] * z + e[13];
        o.z = e[2] * x + e[6] * y + e[10] * z + e[14];
        o.u = PETAL_UV[0] + (i / cols) * (PETAL_UV[1] - PETAL_UV[0]);
        o.v = s;
        // the tube, a pale green throat, then white with a faint green star
        const band = Math.pow(Math.max(0, Math.cos(5 * (phi + 0.3 - Math.PI / 5))), 16);
        const lim = sm(throat - 0.02, throat + 0.14, s);
        mixRGB(TUBE, WHITE, lim, tmp);
        mixRGB(tmp, THROAT, (1 - sm(throat + 0.02, throat + 0.2, s)) * lim * 0.8, tmp);
        mixRGB(tmp, STAR, band * lim * (0.7 - 0.35 * s), tmp);
        mixRGB(tmp, TUBE, closed * 0.45, tmp);
        const ao = mix(1, 0.82, closed * lim);
        o.r = ((tmp[0] * rgb[0]) / WHITE[0]) * ao;
        o.g = ((tmp[1] * rgb[1]) / WHITE[1]) * ao;
        o.b = ((tmp[2] * rgb[2]) / WHITE[2]) * ao;
        o.t = s < throat ? 0.35 : 0;
      },
      true,
      false,
    );
  }

  cutPoint() {
    const f = this.flowerFrame(this.flowers[0]).elements;
    return { p: [f[12] - f[4] * 0.3, f[13] - f[5] * 0.3, f[14] - f[6] * 0.3], t: [f[4], f[5], f[6]] };
  }
}

export function createMoonflower(opts) {
  return new Moonflower(opts);
}
