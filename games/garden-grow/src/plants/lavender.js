// Lavender: a pinch of tiny dark seeds, small seed leaves, then a low dome
// of leafy shoots with crossed pairs of narrow grey-green leaves, and a
// fountain of slender stalks rising above it, each ending in a spike of
// whorled florets: grey-green buds, violet calyces, then brighter corollas
// opening from the bottom of the spike up. The florets are instanced (two
// draw calls for all of them).
import * as THREE from 'three';
import { PLANTS, mulberry32 } from '../config.js';
import { leafMaterial, petalMaterial } from './materials.js';
import { Builder, Path, sheet, tube, blob, frameAlong, paint, lin, mixRGB, mix, ease, quant, sat, fbm, TAU } from './common.js';
import { FlowerBase } from './flower.js';
import { SoilCover } from './soilcover.js';
import { Seedling } from './seedling.js';
import { leafAtlas, BLADE_UV, STEM_U } from './textures.js';

const sm = (a, b, x) => {
  const k = sat((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

let shared = null;
function assets() {
  if (shared) return shared;
  const leaf = leafAtlas({
    c1: [0.36, 0.44, 0.34],
    c2: [0.44, 0.52, 0.4],
    vein: [0.5, 0.56, 0.44],
    rib: [0.56, 0.62, 0.5],
    edge: [0.46, 0.5, 0.4],
    venation: 'parallel',
    veins: 3,
    net: 10,
    netK: 0,
    quilt: 0.1,
    hair: 1,
    plain1: [0.38, 0.46, 0.34],
    plain2: [0.46, 0.54, 0.4],
    stem1: [0.36, 0.42, 0.3],
    stem2: [0.44, 0.5, 0.36],
    stemHair: 0.3,
  });
  const map = paint(64, 64, (u, v, o) => {
    const l = 0.86 + 0.14 * fbm(u * 8, v * 8, 3);
    o[0] = o[1] = o[2] = l;
  });
  const foliage = leafMaterial({ map: leaf.map, normalMap: leaf.normalMap, normalScale: 0.6, vertexColors: true, roughness: 0.7, translucency: 0.35 });
  const bloom = petalMaterial({ map, vertexColors: true, translucency: 0.8, roughness: 0.6 });
  // one corolla, pointing up +y from its base (instanced; the calyces are
  // built as lumpy whorls with the spikes)
  const kb = new Builder(32);
  const M = new THREE.Matrix4();
  // the corolla's two lips: a broad notched upper lip and a smaller lower one
  for (let i = 0; i < 2; i++) {
    const upper = i === 0;
    M.makeRotationY(upper ? Math.PI : 0).setPosition(0, 0, upper ? 0.0004 : -0.0004);
    sheet(kb, M, {
      L: upper ? 0.0042 : 0.0032,
      W: upper ? 0.005 : 0.004,
      nu: 2,
      nv: 1,
      width: (v) => 0.55 + 0.45 * v,
      bend0: -(upper ? 0.35 : 0.9),
      wrap: 150,
      notch: upper ? 0.25 : 0,
      uv: [0.2, 0.8, 0.2, 0.8],
    });
  }
  kb.commit();
  shared = { foliage, bloom, corolla: kb.geometry };
  return shared;
}

const CALYX = lin('#5f4e86');
const BUD = lin('#7d8c78');
const WOOD = [1.35, 1.05, 0.85];
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const M1 = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
const pt = { p: [0, 0, 0], t: [0, 1, 0] };
const col = new THREE.Color();
const tmp = [0, 0, 0];

// Per-plant instanced florets sharing the one floret geometry's buffers.
function florets(geometry, material, max) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) g.setAttribute(name, geometry.attributes[name]);
  g.setIndex(geometry.index);
  g.setDrawRange(0, geometry.drawRange.count);
  const flex = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
  flex.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aPlant', flex);
  const mesh = new THREE.InstancedMesh(g, material, max);
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, col.setRGB(1, 1, 1));
  return mesh;
}

// A path that leans out at the base and turns upwards towards the tip.
function risePath(path, base, len, lean, az, turn, n) {
  const lx = Math.cos(az);
  const lz = Math.sin(az);
  const ds = Math.max(1e-4, len) / (n - 1);
  let x = base[0];
  let y = base[1];
  let z = base[2];
  return path.set(n, (k, nn, out) => {
    if (k > 0) {
      const th = lean * (1 - turn * ((k - 0.5) / (nn - 1)));
      x += ds * Math.sin(th) * lx;
      y += ds * Math.cos(th);
      z += ds * Math.sin(th) * lz;
    }
    out[0] = x;
    out[1] = y;
    out[2] = z;
  });
}

class Lavender extends FlowerBase {
  constructor(opts = {}) {
    const a = assets();
    super(opts, { foliage: a.foliage, bloom: a.bloom, height: PLANTS.lavender.height, stiffness: 0.9 });
    const rng = mulberry32((opts.seed ?? 1) * 29 + 13);
    const low = opts.quality?.tier === 'low';
    this.H = PLANTS.lavender.height * (0.9 + rng() * 0.18);
    this.rgb = lin(opts.color ?? PLANTS.lavender.colors[0]);
    this.sprout = new Seedling(rng, { seed: 'lavender', hyp: 0.03, cot: { L: 0.006, W: 0.0038, shape: 'oval', petiole: 0.2 } });
    this.soil = new SoilCover(rng, { radius: 0.028, height: 0.012, wedges: 5, crumbs: 12 });
    // leafy shoots making a low dome: upright in the middle, leaning out
    // at the edge, each turning upwards towards its tip
    this.shoots = [];
    const ns = (low ? 11 : 13) + Math.floor(rng() * 3);
    const a0 = rng() * TAU;
    for (let i = 0; i < ns; i++) {
      const t = (i + 0.5) / ns;
      const L = mix(0.21, 0.14, t) * (0.9 + rng() * 0.2);
      const lean = mix(0.1, 0.95, Math.sqrt(t)) + (rng() - 0.5) * 0.12;
      this.shoots.push({
        az: a0 + i * GOLDEN + (rng() - 0.5) * 0.3,
        lean,
        L,
        g0: 0.3 + t * 0.14,
        nodes: 10 + Math.floor(rng() * 3),
        spin: rng() * TAU,
        path: new Path(10),
        // where the full-grown shoot ends, for sizing its flower stalks
        top: L * (Math.cos(lean) + Math.cos(lean * 0.45)) * 0.5 + 0.012,
        out: L * (Math.sin(lean) + Math.sin(lean * 0.45)) * 0.5,
      });
    }
    // flower stalks from the shoot tips fanning out into a fountain
    this.stalks = [];
    for (const s of this.shoots) {
      const m = low ? 1 : 1 + (rng() < 0.6 ? 1 : 0);
      for (let j = 0; j < m; j++) {
        const lean = s.lean * 0.5 + (rng() - 0.5) * 0.14;
        const reach = this.H * (0.94 + rng() * 0.1) - s.top;
        this.stalks.push({
          shoot: s,
          az: s.az + (rng() - 0.5) * 0.7,
          lean,
          L: Math.max(0.1, reach / Math.cos(lean * 0.9)),
          g0: 0.52 + rng() * 0.08,
          spike: 0.055 + rng() * 0.02,
          whorls: (low ? 8 : 10) + Math.floor(rng() * 2),
          spin: rng() * TAU,
          path: new Path(8),
        });
      }
    }
    this.per = low ? 2 : 3;
    this.maxFlorets = this.stalks.reduce((n, s) => n + s.whorls * this.per, 0);
    this.corolla = florets(a.corolla, a.bloom, this.maxFlorets);
    this.body.add(this.corolla);
    this.path = new Path(26);
    this.low = low;
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
    this.part(0, quant(Math.min(g, 0.82), 260), this.fol, this.folMesh, (b) => {
      if (!cut) {
        if (g > 0.09) {
          tube(b, this.path, () => 0.0008 * mix(0.8, 2.6, ease(g, 0.3, 0.7)), { radial: 5, u0: STEM_U[0], u1: STEM_U[1], vScale: 4 });
          sp.cotyledons(b, g, this.path, 0.0008, 1 - ease(g, 0.45, 0.65));
        }
        for (const s of this.shoots) this.shoot(b, g, s);
      }
      for (let i = 0; i < this.stalks.length; i++) {
        if (cut && i > 4) break;
        this.stalk(b, g, this.stalks[i], i);
      }
    });
    const fk = cut ? 1 : g < 0.5 ? -1 : quant(g, 250);
    this.part(1, fk, this.blo, this.bloMesh, (b) => {
      this.corolla.count = 0;
      if (fk >= 0) this.spikes(b, g);
      this.corolla.visible = this.corolla.count > 0;
    });
    this.height = Math.max(0.03, g < 0.3 ? 0.03 : 0.04 + (this.H - 0.04) * ease(g, 0.3, 0.8));
    this.spread = 0.06 + 0.1 * ease(g, 0.3, 0.65);
    if (!cut) {
      if (g > 0.9) {
        for (let i = 0; i < Math.min(4, this.stalks.length); i++) {
          const st = this.stalks[i];
          this.stalkPath(g, st, i).at(st.path.length() - st.spike * 0.4, pt);
          this.spot('bloom', pt.p, [pt.t[0] * 0.3, 1, pt.t[2] * 0.3], this.color, 1.0);
        }
      }
      if (g > 0.45) {
        const s = this.shoots[this.shoots.length - 1];
        this.shootPath(g, s).at(s.path.length() * 0.8, pt);
        this.spot('leaf', [pt.p[0], pt.p[1] + 0.006, pt.p[2]], [0, 1, 0], '#7a8a70', 0.3);
      }
    }
  }

  shootLen(g, s) {
    return s.L * ease(g, s.g0, s.g0 + 0.3);
  }

  shootPath(g, s) {
    return risePath(s.path, [0, 0.012, 0], Math.max(0.001, this.shootLen(g, s)), s.lean, s.az, 0.55, 10);
  }

  // A leafy shoot: narrow grey leaves in crossed pairs, with little tufts
  // of short leaves in their axils lower down.
  shoot(b, g, s) {
    const len = this.shootLen(g, s);
    if (len < 0.004) return;
    const path = this.shootPath(g, s);
    tube(b, path, (qq) => mix(0.0022, 0.0011, qq), {
      radial: 4,
      u0: STEM_U[0],
      u1: STEM_U[1],
      vScale: 3,
      color: (qq, a, o) => {
        // woody near the crown
        const k = 1 - sm(0.1, 0.5, qq);
        o.r = mix(1, WOOD[0], k);
        o.g = mix(1, WOOD[1], k);
        o.b = mix(1, WOOD[2], k);
      },
    });
    const grown = sat(len / s.L);
    for (let i = 0; i < s.nodes; i++) {
      const f = i / (s.nodes - 1);
      const at = s.L * (0.1 + 0.88 * f) * grown;
      if (at > len - 0.003) continue;
      path.at(at, pt);
      const age = sat((len - at) / 0.05);
      const tufts = !this.low && f < 0.5 && age > 0.5;
      for (let j = 0; j < (tufts ? 4 : 2); j++) {
        const small = j >= 2;
        frameAlong(M1, pt.p, pt.t, s.spin + i * Math.PI * 0.5 + (j % 2) * Math.PI + (small ? Math.PI * 0.5 : 0));
        M2.makeRotationY(Math.PI).setPosition(0, 0, 0.001);
        M1.multiply(M2);
        sheet(b, M1, {
          L: 0.042 * mix(0.3, 1, age) * (1 - 0.35 * f) * (small ? 0.45 : 1),
          W: 0.0044,
          nu: 2,
          nv: 3,
          width: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + v * 0.86)), 0.5),
          fold: 0.5,
          bend0: -mix(0.12, small ? 0.4 : 0.62, age),
          curl: -0.25 * age,
          uv: BLADE_UV,
        });
      }
    }
  }

  stalkLen(g, st) {
    return this.cut ? 0.28 : st.L * ease(g, st.g0, st.g0 + 0.2);
  }

  stalkPath(g, st, i) {
    const cut = this.cut;
    let base;
    if (!cut) {
      const s = st.shoot;
      this.shootPath(g, s).at(s.path.length() * 0.9, pt);
      base = pt.p.slice();
    } else base = [(i % 3) * 0.002 - 0.002, 0, Math.floor(i / 3) * 0.002];
    const len = Math.max(0.001, this.stalkLen(g, st));
    return risePath(st.path, base, len, cut ? 0.03 + i * 0.03 : st.lean, st.az, 0.2, 8);
  }

  stalk(b, g, st, i) {
    const len = this.stalkLen(g, st);
    if (len < 0.004) return;
    const path = this.stalkPath(g, st, i);
    tube(b, path, (qq) => mix(0.0011, 0.0008, qq), { radial: 3, u0: STEM_U[0], u1: STEM_U[1], vScale: 3 });
  }

  // The flower spikes: each whorl of calyces is one lumpy ring (grey-green
  // buds, then violet), and the open corollas are instanced round it,
  // opening from the bottom of the spike up.
  spikes(b, g) {
    const cut = this.cut;
    let n = 0;
    const km = this.corolla;
    const kf = km.geometry.attributes.aPlant;
    const per = this.per;
    const colour = cut ? 1 : ease(g, 0.68, 0.84);
    mixRGB(BUD, CALYX, colour, tmp);
    const cr = tmp[0];
    const cg = tmp[1];
    const cb = tmp[2];
    for (let si = 0; si < this.stalks.length; si++) {
      if (cut && si > 4) break;
      const st = this.stalks[si];
      const len = this.stalkLen(g, st);
      const grown = cut ? 1 : ease(g, st.g0 + 0.06, st.g0 + 0.22);
      if (grown <= 0.02 || len < 0.03) continue;
      const path = this.stalkPath(g, st, si);
      const spike = st.spike * mix(0.5, 1, grown);
      for (let w = 0; w < st.whorls; w++) {
        const f = w / (st.whorls - 1); // 0 at the bottom of the spike
        // whorls crowd together towards the tip; the lowest stand apart
        const at = len - spike * Math.pow(1 - f, 1.3) - (w === 0 ? spike * 0.25 : 0);
        path.at(Math.max(0, at), pt);
        const s = grown * mix(1.35, 0.8, f * f);
        frameAlong(M1, pt.p, pt.t, st.spin + w * 0.9);
        blob(b, M1, 0.0036 * s, 0.0034 * s, 0.0036 * s, {
          cols: 6,
          rows: 3,
          uv: [0.1, 0.9, 0.1, 0.9],
          thick: 0.5,
          // calyces standing out round the stalk, a star in section
          shape: (lat, lon, out) => {
            out[0] = (Math.round(lon * 6) % 2 ? 0.72 : 1.05) * (0.8 + 0.3 * lat);
            out[1] = 0.0012 * s * lat;
          },
          color: (lat, lon, o) => {
            const k = 0.72 + 0.4 * lat;
            o.r = cr * k;
            o.g = cg * k;
            o.b = cb * k;
          },
        });
        const open = cut ? 1 : sat(ease(g, 0.8, 1.0) * 1.35 - f * 0.35);
        if (open <= 0.02) continue;
        const fl = cut ? 0 : this.flexFn(pt.p[0], pt.p[1], pt.p[2]);
        for (let k = 0; k < per; k++) {
          const a = (k / per) * TAU + w * 0.9 + st.spin + 0.5;
          frameAlong(M1, pt.p, pt.t, a);
          M2.makeRotationX(0.95).setPosition(0, 0.0024 * s, 0.003 * s);
          M1.multiply(M2);
          const ko = sat(open * 1.2 - k * 0.1) * mix(1.0, 1.3, 1 - f);
          M2.makeScale(ko, ko, ko);
          M1.multiply(M2);
          km.setMatrixAt(n, M1);
          km.setColorAt(n, col.setRGB(this.rgb[0], this.rgb[1], this.rgb[2]));
          kf.array[n * 2] = fl;
          kf.array[n * 2 + 1] = 0;
          n++;
        }
      }
    }
    km.count = n;
    km.instanceMatrix.needsUpdate = true;
    if (km.instanceColor) km.instanceColor.needsUpdate = true;
    kf.needsUpdate = true;
  }

  cutPoint() {
    const st = this.stalks[0];
    const path = this.stalkPath(this.shown, st, 0);
    const len = path.length();
    const top = path.at(len, { p: [0, 0, 0], t: [0, 1, 0] });
    const p = path.at(Math.max(0, len - 0.28), { p: [0, 0, 0], t: [0, 1, 0] });
    return { p: p.p.slice(), t: [top.p[0] - p.p[0], top.p[1] - p.p[1], top.p[2] - p.p[2]] };
  }

  dispose() {
    super.dispose();
    this.corolla.geometry.dispose();
    this.corolla.dispose();
  }
}

export function createLavender(opts) {
  return new Lavender(opts);
}
