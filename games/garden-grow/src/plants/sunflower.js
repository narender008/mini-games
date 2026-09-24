// Dwarf sunflower: a striped seed, a thick reddish seedling stalk carrying
// its seed coat up on two big oval seed leaves, a bristly stem climbing with
// coarse, toothed, heart-shaped leaves on long stalks, a spiky green bud of
// bracts that swells, then golden rays unfold round a disc of florets set in
// golden-angle spirals, and the heavy head tips towards the viewer.
import * as THREE from 'three';
import { PLANTS, mulberry32 } from '../config.js';
import { leafMaterial, petalMaterial } from './materials.js';
import { Path, sheet, tube, frameAlong, hairs, lin, mixRGB, mix, ease, curve, quant, sat, TAU } from './common.js';
import { FlowerBase } from './flower.js';
import { SoilCover } from './soilcover.js';
import { Seedling } from './seedling.js';
import { leafAtlas, compositeAtlas, BLADE_UV, PLAIN_UV, STEM_U, RAY_UV, BRACT_UV, discUV } from './textures.js';

const sm = (a, b, x) => {
  const k = sat((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

let shared = null;
function assets() {
  if (shared) return shared;
  const leaf = leafAtlas({
    c1: [0.2, 0.34, 0.1],
    c2: [0.28, 0.42, 0.14],
    vein: [0.42, 0.54, 0.24],
    rib: [0.52, 0.62, 0.3],
    edge: [0.24, 0.36, 0.12],
    veins: 6,
    angle: 0.42,
    basal: true,
    teeth: 14,
    toothDepth: 0.05,
    net: 30,
    netK: 0.35,
    quilt: 0.8,
    hair: 0.5,
    plain1: [0.3, 0.46, 0.16],
    plain2: [0.38, 0.54, 0.2],
    stem1: [0.3, 0.44, 0.18],
    stem2: [0.38, 0.52, 0.22],
    stemHair: 0.6,
  });
  const head = compositeAtlas({
    size: 768,
    ray: { base: 0.82, tip: 1, veins: 11, veinK: 0.05, pointed: true },
    disc: { n: 1100, center: [0.44, 0.4, 0.16], mid: [0.36, 0.23, 0.09], ring: [0.66, 0.44, 0.1], pollen: [0.98, 0.78, 0.22], open: 0.32, dark: [0.32, 0.19, 0.08], darkK: 0.72, capShade: 0.35, gap: [0.1, 0.06, 0.03], gapK: 0.6 },
  });
  shared = {
    foliage: leafMaterial({ map: leaf.map, normalMap: leaf.normalMap, normalScale: 1.1, vertexColors: true, alphaTest: 0.5, roughness: 0.72, translucency: 0.45 }),
    bloom: petalMaterial({ map: head.map, normalMap: head.normalMap, normalScale: 1.0, vertexColors: true, alphaTest: 0.5, translucency: 0.8, roughness: 0.72 }),
  };
  return shared;
}

const BRACT = lin('#5d7a36');
const BRACT_TIP = lin('#88985a');
const BACK = lin('#6a8a3e');
const HAIR = [1.3, 1.3, 1.2];
const HYPO = [1.25, 0.9, 0.85];

const M1 = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
const F = new THREE.Matrix4();
const pt = { p: [0, 0, 0], t: [0, 1, 0] };
const tmp = [0, 0, 0];
const uvo = { u: 0, v: 0 };

class Sunflower extends FlowerBase {
  constructor(opts = {}) {
    const a = assets();
    super(opts, { foliage: a.foliage, bloom: a.bloom, height: PLANTS.sunflower.height, stiffness: 0.35, bloomRadius: 0.13 });
    const rng = mulberry32((opts.seed ?? 1) * 19 + 7);
    this.H = PLANTS.sunflower.height * (0.9 + rng() * 0.15);
    // a touch richer than the swatch (rays are mostly seen in soft light)
    const c = lin(opts.color ?? PLANTS.sunflower.colors[0]);
    const mx = Math.max(c[0], c[1], c[2], 1e-3);
    this.rgb = c.map((v) => mix(v, (v * v) / mx, 0.25));
    this.sprout = new Seedling(rng, { seed: 'sunflower', hyp: 0.05, coat: true, cot: { L: 0.024, W: 0.013, shape: 'oval', petiole: 0.14 } });
    this.soil = new SoilCover(rng, { radius: 0.032, height: 0.016, wedges: 5, crumbs: 14 });
    this.epiMax = this.H - 0.1 - 0.05;
    this.lean = (rng() - 0.5) * 0.08;
    this.leanAz = rng() * TAU;
    // leaves up the stem: the first pair opposite, then alternate on a spiral
    this.leaves = [];
    const n = 12 + Math.floor(rng() * 3);
    let az = rng() * TAU;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      if (i === 1) az += Math.PI;
      else if (i > 1) az += 2.4 + (rng() - 0.5) * 0.4;
      this.leaves.push({
        at: i < 2 ? 0.015 : 0.015 + Math.pow((i - 1) / (n - 2), 1.1) * (this.epiMax - 0.13),
        az,
        L: (0.27 - 0.14 * k) * (0.9 + rng() * 0.2),
        W: (0.17 - 0.085 * k) * (0.9 + rng() * 0.2),
        pet: 0.32 - 0.1 * k,
        tilt: 0.75 + 0.35 * (1 - k) + (rng() - 0.5) * 0.2,
        arch: -(0.8 + rng() * 0.5) * (1 - 0.35 * k),
        twist: (rng() - 0.5) * 0.6,
        ph: rng() * 6,
      });
    }
    this.headTilt = 0.62 + rng() * 0.18;
    this.headAz = Math.PI * 0.5 + (rng() - 0.5) * 0.5; // towards +z (the viewer)
    this.spin = rng() * TAU;
    this.rays = [];
    const nr = 26 + Math.floor(rng() * 8);
    for (let i = 0; i < nr; i++) this.rays.push({ az: (i / nr) * TAU + (rng() - 0.5) * 0.06, row: i % 2, s: 0.9 + rng() * 0.2, r: [rng() - 0.5, rng() - 0.5, rng() - 0.5] });
    this.path = new Path(30);
  }

  epi(g) {
    if (this.cut) return 0;
    return curve(g, [[0.28, 0], [0.4, 0.07], [0.55, this.epiMax * 0.55], [0.7, this.epiMax * 0.92], [0.85, this.epiMax]]);
  }

  stemPathAt(g) {
    if (this.cut) {
      return this.path.set(16, (k, n, out) => {
        const t = k / (n - 1);
        out[0] = 0;
        out[1] = t * 0.34;
        out[2] = Math.sin(t * 2) * 0.004;
      });
    }
    return this.sprout.stemPath(this.path, g, { epi: this.epi(g), lean: this.lean, leanAz: this.leanAz, wig: 0.03, n: 30 });
  }

  build(g) {
    const cut = this.cut;
    const sp = this.sprout;
    const path = this.stemPathAt(g);
    this.part(2, cut ? -1 : quant(Math.min(g, 0.73), 250), this.soi, this.soiMesh, (b) => {
      if (cut) return;
      sp.seedMesh(b, g);
      sp.coatMesh(b, g, path);
      this.soil.build(b, g, 0.08, 0.16);
    });
    this.part(0, quant(Math.min(g, 0.9), 400), this.fol, this.folMesh, (b) => {
      if (!cut && g < 0.09) return;
      const len = path.length();
      const node = cut ? 0 : sp.nodeS;
      const thick = cut ? 1 : mix(0.35, 1, ease(g, 0.26, 0.75));
      tube(b, path, (q) => {
        const s = q * len;
        const r = s < node ? 0.0024 : mix(0.0075, 0.0045, (s - node) / Math.max(0.05, len - node));
        return r * thick;
      }, { radial: 8, u0: STEM_U[0], u1: STEM_U[1], vScale: 3, color: cut ? null : (q, a, o) => {
        // the seedling stalk is flushed red-purple
        const k = 1 - sm(node * 0.6, node * 1.4, q * len);
        o.r = mix(1, HYPO[0], k);
        o.g = mix(1, HYPO[1], k);
        o.b = mix(1, HYPO[2], k);
      } });
      if (len > 0.06) hairs(b, path, Math.round(220 * sm(0.06, 0.6, len)), { len: 0.0028, radius: 0.005 * thick, rgb: HAIR, seed: this.seed, from: cut ? 0 : node / len, uv: PLAIN_UV, up: 0.3 });
      if (!cut) sp.cotyledons(b, g, path, 0.0024 * thick, 1 - ease(g, 0.7, 0.9) * 0.3);
      for (const lf of this.leaves) this.leaf(b, g, lf, path, node);
    });
    const open = cut ? 1 : quant(ease(g, 0.8, 0.99), 120);
    const bud = cut ? 1 : quant(ease(g, 0.6, 0.82), 60);
    this.part(1, !cut && g < 0.58 ? -1 : open * 1000 + bud, this.blo, this.bloMesh, (b) => {
      if (!cut && g < 0.58) return;
      this.head(b, open, bud);
    });
    // the head sits on the stem top, and tips over as it grows heavy
    const top = path.at(path.length(), pt);
    const tilt = this.cut ? this.headTilt * 0.5 : this.headTilt * sm(0.7, 0.97, g);
    const dir = [top.t[0] + Math.cos(this.headAz) * Math.sin(tilt) * 1.6, top.t[1], top.t[2] + Math.sin(this.headAz) * Math.sin(tilt) * 1.6];
    const l = Math.hypot(dir[0], dir[1], dir[2]);
    dir[0] /= l;
    dir[1] /= l;
    dir[2] /= l;
    const sc = cut ? 1 : mix(0.3, 1, bud);
    if (this.bloMesh.visible) this.placeBloom(frameAlong(F, [top.p[0] + dir[0] * 0.012, top.p[1] + dir[1] * 0.012, top.p[2] + dir[2] * 0.012], dir, this.spin, sc));
    this.height = Math.max(0.04, top.p[1] + 0.06 * sc);
    this.spread = 0.06 + 0.16 * ease(g, 0.35, 0.7);
    if (!cut) {
      if (g > 0.9) this.spot('bloom', [top.p[0] + dir[0] * 0.03, top.p[1] + dir[1] * 0.03, top.p[2] + dir[2] * 0.03], dir, this.color, 0.4);
      if (g > 0.5) this.leafSpot(g, this.leaves[2], path, sp.nodeS);
    }
  }

  // Leaf state along the stem: how open (0..1), from when the stem passes it.
  leafK(g, lf, node) {
    if (this.cut) return 1;
    const e = this.epi(g);
    return sat((e - lf.at - 0.004) / 0.09);
  }

  leafFrame(g, lf, path, node) {
    path.at(node + lf.at * (this.cut ? 0 : 1), pt);
    frameAlong(M1, pt.p, pt.t, lf.az);
    M2.makeRotationY(Math.PI).setPosition(0, 0, 0.006);
    return M1.multiply(M2);
  }

  leaf(b, g, lf, path, node) {
    if (this.cut && lf !== this.leaves[this.leaves.length - 2] && lf !== this.leaves[this.leaves.length - 3]) return;
    if (this.cut) {
      // two upper leaves on the cut stem
      const i = this.leaves.indexOf(lf);
      path.at(0.08 + (this.leaves.length - 2 - i) * 0.07, pt);
      frameAlong(M1, pt.p, pt.t, lf.az);
      M2.makeRotationY(Math.PI).setPosition(0, 0, 0.005);
      M1.multiply(M2);
    } else {
      const k0 = this.leafK(g, lf, node);
      if (k0 <= 0.01) return;
      this.leafFrame(g, lf, path, node);
    }
    const k = this.leafK(g, lf, node);
    const young = 1 - k;
    const pet = lf.pet;
    const scale = mix(0.18, 1, Math.pow(k, 0.8));
    sheet(b, M1, {
      L: lf.L * scale,
      W: lf.W * scale * 1.06,
      nu: 8,
      nv: 13,
      width: (v) => {
        if (v < pet) return 0.05 + 0.03 * (v / pet);
        const q = (v - pet) / (1 - pet);
        // heart-shaped: broad just above the stalk, tapering to a point
        return q < 0.22 ? 0.55 + 0.45 * Math.sin((q / 0.22) * Math.PI * 0.5) : Math.pow(1 - (q - 0.22) / 0.78, 0.85);
      },
      fold: mix(0.18, 1.2, young),
      // a channelled stalk that opens into the blade
      wrap: (v) => mix(2.2 / Math.max(0.001, 0.5 * lf.W * scale * 0.065), 6, sm(pet - 0.02, pet + 0.06, v)),
      bend0: -mix(0.2, lf.tilt, k),
      curl: lf.arch * k,
      curlPow: 1.6,
      twist: lf.twist * k,
      wave: 0.004 * k,
      waveN: 6,
      wavePh: lf.ph,
      uv: [BLADE_UV[0], BLADE_UV[1], -pet / (1 - pet), 1],
      color: (s, v, o) => {
        const ao = 0.78 + 0.22 * sm(pet, pet + 0.2, v);
        o.r = ao * (1 + 0.15 * young);
        o.g = ao * (1 + 0.12 * young);
        o.b = ao * (1 - 0.05 * young);
      },
    });
  }

  leafSpot(g, lf, path, node) {
    if (this.leafK(g, lf, node) < 0.8) return;
    this.leafFrame(g, lf, path, node);
    const pos = new THREE.Vector3(0, lf.L * 0.6 * Math.cos(lf.tilt), -lf.L * 0.6 * Math.sin(lf.tilt)).applyMatrix4(M1);
    this.spot('leaf', [pos.x, pos.y + 0.004, pos.z], [0, 1, 0], '#4e6e2a', 0.3);
  }

  // The head in its own frame: axis +y, full size (the matrix scales the bud).
  head(b, open, bud) {
    F.identity();
    const discR = 0.042;
    const fe = F.elements;
    // green back of the head
    b.grid(
      18,
      5,
      (i, j, o) => {
        const a = (i / 18) * TAU;
        const q = j / 5;
        const r = discR * 1.02 * Math.sin(q * Math.PI * 0.5 + 0.02);
        const y = -0.022 * Math.cos(q * Math.PI * 0.5) * mix(1, 0.75, open);
        o.x = Math.cos(a) * r;
        o.y = y;
        o.z = Math.sin(a) * r;
        o.u = BRACT_UV[0] + 0.02;
        o.v = 0.5;
        o.r = BACK[0];
        o.g = BACK[1];
        o.b = BACK[2];
        o.t = 1;
      },
      true,
      true,
    );
    // bracts: three rows of pointed, hairy green bracts; a tight star-like bud
    // at first, then a ruff behind the rays
    const rows = 3;
    for (let row = 0; row < rows; row++) {
      const n = 16 + row * 3;
      for (let i = 0; i < n; i++) {
        const az = (i / n) * TAU + row * 0.37;
        const r0 = discR * (0.96 - row * 0.12);
        M1.makeRotationY(az + Math.PI).setPosition(Math.sin(az) * r0, -0.004 - row * 0.005, Math.cos(az) * r0);
        const L = (0.026 - row * 0.004) * mix(0.9, 1, open);
        sheet(b, M1, {
          L,
          W: 0.011 - row * 0.0015,
          nu: 4,
          nv: 6,
          width: (v) => (v < 0.4 ? 0.7 + 0.3 * Math.sin((v / 0.4) * Math.PI * 0.5) : Math.pow(1 - (v - 0.4) / 0.6, 1.4)),
          bend0: -mix(0.05, 1.55 + row * 0.25, open) + mix(0.25, 0, open),
          curl: mix(1.15 - row * 0.2, -0.3, open),
          wrap: 40,
          uv: BRACT_UV,
          color: (sv, v, o) => {
            mixRGB(BRACT, BRACT_TIP, v * v, tmp);
            o.r = tmp[0];
            o.g = tmp[1];
            o.b = tmp[2];
          },
          thick: 0.4,
        });
      }
    }
    // the disc of florets, a low dome
    const dh = mix(0.012, 0.006, open);
    b.grid(
      24,
      8,
      (i, j, o) => {
        const a = (i / 24) * TAU;
        const q = j / 8;
        const r = discR * Math.sin(q * Math.PI * 0.5 + 1e-3);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        o.x = x;
        o.y = dh * Math.cos(q * Math.PI * 0.5) - 0.001;
        o.z = z;
        discUV(x, z, discR, uvo);
        o.u = uvo.u;
        o.v = uvo.v;
        const k = mix(0.4, 1, open);
        o.r = mix(0.55, 1, k);
        o.g = mix(0.75, 1, k);
        o.b = mix(0.35, 1, k);
        o.t = 1;
      },
      true,
      false,
    );
    // golden rays: they peep out of the bud, lengthen and spread
    const emerge = sat(open * 2.2);
    if (emerge <= 0) return;
    const spread = sm(0.15, 1, open);
    const rgb = this.rgb;
    for (const ray of this.rays) {
      const r0 = discR * (0.98 - ray.row * 0.04);
      M1.makeRotationY(ray.az + Math.PI).setPosition(Math.sin(ray.az) * r0, -0.001 - ray.row * 0.0015, Math.cos(ray.az) * r0);
      sheet(b, M1, {
        L: 0.058 * ray.s * mix(0.3, 1, emerge),
        W: 0.016 * mix(0.6, 1, emerge),
        nu: 5,
        nv: 10,
        width: (v) => (v < 0.2 ? 0.45 + 0.55 * Math.sin((v / 0.2) * Math.PI * 0.5) : v < 0.65 ? 1 : Math.pow(1 - (v - 0.65) / 0.35, 0.9)),
        bend0: -mix(0.1, 1.45 + ray.r[0] * 0.2 - ray.row * 0.12, spread),
        curl: mix(0.6, -0.35 + ray.r[1] * 0.3, spread),
        curlPow: 1.4,
        twist: ray.r[2] * 0.7 * spread,
        wrap: mix(60, 30, spread),
        wave: 0.0015 * spread,
        waveN: 2,
        uv: RAY_UV,
        color: (sv, v, o) => {
          const ao = 0.72 + 0.28 * sm(0, 0.25, v);
          o.r = rgb[0] * ao;
          o.g = rgb[1] * ao * (0.97 + 0.05 * v);
          o.b = rgb[2] * ao;
        },
      });
    }
  }

  cutPoint() {
    const path = this.stemPathAt(this.shown);
    const len = path.length();
    const top = path.at(len, { p: [0, 0, 0], t: [0, 1, 0] });
    const p = path.at(Math.max(0, len - 0.34), { p: [0, 0, 0], t: [0, 1, 0] });
    return { p: p.p.slice(), t: [top.p[0] - p.p[0], top.p[1] - p.p[1], top.p[2] - p.p[2]] };
  }
}

export function createSunflower(opts) {
  return new Sunflower(opts);
}
