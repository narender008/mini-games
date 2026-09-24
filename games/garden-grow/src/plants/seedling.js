// The first days of a flower grown from seed (every species but the tulip):
// the real seed in its hole, the hypocotyl that arches up through the
// cracked soil as a hook and straightens, the two seed leaves (cotyledons)
// that unfold pale from the seed coat and turn green, and the stem that
// carries on from their node.
import * as THREE from 'three';
import { blob, sheet, frameAlong, lin, mixRGB, mix, ease, curve, TAU, noise2 } from './common.js';
import { PLAIN_UV } from './textures.js';

// Real seeds, in metres: length, width, thickness.
const SEEDS = {
  sunflower: { n: 1, L: 0.011, W: 0.0058, T: 0.0034, col: '#2b2724', alt: '#d9d3c6', stripes: 7, shape: 'tear' },
  rose: { n: 3, L: 0.0048, W: 0.0034, T: 0.0028, col: '#9a6a3c', alt: '#6f4a28', shape: 'angular' },
  daisy: { n: 7, L: 0.0025, W: 0.0011, T: 0.001, col: '#6e6456', alt: '#c2b9a4', stripes: 5, shape: 'rod' },
  lavender: { n: 8, L: 0.0019, W: 0.0011, T: 0.001, col: '#3b2a1f', alt: '#5a4230', shape: 'oval' },
  poppy: { n: 14, L: 0.0011, W: 0.0009, T: 0.0008, col: '#34323a', alt: '#5a5866', shape: 'kidney' },
  moonflower: { n: 1, L: 0.0105, W: 0.0082, T: 0.0066, col: '#d9c9a4', alt: '#b59a70', shape: 'moon' },
};

const M1 = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
const pt = { p: [0, 0, 0], t: [0, 1, 0] };
const tmpC = [0, 0, 0];

export class Seedling {
  // opts: { seed: kind, hyp: final hypocotyl length, cot: { L, W, shape },
  //         coat: the seed coat rides up on the seed leaves }
  constructor(rng, { seed = 'daisy', hyp = 0.03, cot = {}, coat = false } = {}) {
    this.kind = SEEDS[seed];
    this.hyp = hyp;
    this.cot = { L: 0.012, W: 0.007, shape: 'oval', petiole: 0.15, ...cot };
    this.coat = coat;
    this.hookAz = rng() * TAU;
    this.cotAz = this.hookAz + Math.PI * 0.5;
    this.seeds = [];
    const k = this.kind;
    for (let i = 0; i < k.n; i++) {
      const r = k.n === 1 ? 0 : 0.001 + Math.sqrt(rng()) * 0.0035;
      const a = rng() * TAU;
      this.seeds.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: rng() * TAU, roll: (rng() - 0.5) * 0.6, s: 0.85 + rng() * 0.3 });
    }
    this.coatFall = { x: (rng() - 0.5) * 0.03, z: 0.012 + rng() * 0.012, yaw: rng() * TAU };
  }

  // The seed (or a little cluster of tiny seeds) lying in the hole.
  seedMesh(b, g) {
    if (g >= 0.085) return;
    const k = this.kind;
    for (const s of this.seeds) {
      M1.makeRotationY(s.yaw);
      M2.makeRotationZ(Math.PI * 0.5 + s.roll);
      M1.multiply(M2).setPosition(s.x, k.T * 0.5 * s.s + 0.0008, s.z);
      this.seedShape(b, M1, s.s, 1);
    }
  }

  // One seed, long axis along local y.
  seedShape(b, M, sc, flexFree) {
    const k = this.kind;
    const col = lin(k.col);
    const alt = lin(k.alt);
    const lumpy = k.shape === 'angular';
    blob(b, M, k.W * 0.5 * sc, k.L * 0.5 * sc, k.T * 0.5 * sc, {
      cols: k.stripes ? 16 : 10,
      rows: 7,
      flex: 0,
      shape: (lat, lon, out) => {
        if (k.shape === 'tear') out[0] = 1 - 0.45 * Math.pow(lat, 2.2);
        else if (k.shape === 'kidney') out[0] = 1 - 0.25 * Math.max(0, Math.cos(lon * TAU)) * Math.sin(lat * Math.PI);
        else if (k.shape === 'moon') out[0] = 1 - 0.35 * Math.max(0, Math.cos(lon * TAU)) ** 3;
        else if (lumpy) out[0] = 0.8 + 0.35 * noise2(lon * 4, lat * 3 + sc * 10);
        else if (k.shape === 'rod') out[0] = 0.85 + 0.15 * Math.cos(lon * TAU * 5);
      },
      color: (lat, lon, o) => {
        let t = 0.3 * noise2(lon * 6, lat * 5);
        if (k.stripes) {
          const st = 0.5 + 0.5 * Math.cos(lon * TAU * k.stripes + Math.sin(lat * 3) * 0.6);
          t = st > 0.72 ? 0.9 : t;
        }
        mixRGB(col, alt, t, tmpC);
        o.r = tmpC[0];
        o.g = tmpC[1];
        o.b = tmpC[2];
      },
    });
  }

  // How long the hypocotyl is and how hooked, at g.
  hypState(g) {
    const hyp = this.hyp;
    return {
      len: curve(g, [[0.09, 0.003], [0.18, 0.033], [0.23, Math.max(0.04, hyp * 0.9)], [0.34, Math.max(0.04, hyp)]]),
      hook: curve(g, [[0.12, 3.05], [0.2, 2.5], [0.25, 1.3], [0.3, 0]]),
    };
  }

  // Fill `path` with the whole stem at g: the hypocotyl (hooked while it
  // pushes through) and then the stem above the seed-leaf node.
  // o: { epi: stem length above the node, lean: radians over the stem,
  //      leanAz, nod: bend at the tip (poppy bud), nodLen, wig, n, y0 }
  stemPath(path, g, o = {}) {
    const { len: hypL, hook } = this.hypState(g);
    const epi = Math.max(0, o.epi ?? 0);
    const total = hypL + epi;
    const hookLen = Math.min(hypL, 0.011);
    const y0 = o.y0 ?? -0.008;
    const n = o.n ?? 26;
    const lean = o.lean ?? 0;
    const lax = Math.cos(o.leanAz ?? 0);
    const laz = Math.sin(o.leanAz ?? 0);
    const hx = Math.cos(this.hookAz);
    const hz = Math.sin(this.hookAz);
    const nod = o.nod ?? 0;
    const nodLen = Math.min(total * 0.5, o.nodLen ?? 0.05);
    const nx = Math.cos(o.nodAz ?? 0);
    const nz = Math.sin(o.nodAz ?? 0);
    const wig = o.wig ?? 0;
    let x = 0;
    let y = y0;
    let z = 0;
    const ds = total / (n - 1);
    this.nodeS = hypL;
    return path.set(n, (k, nn, out) => {
      if (k > 0) {
        const s = (k - 0.5) * ds;
        const hb = hook * sm(hypL - hookLen, hypL, s);
        const lb = lean * Math.min(1, s / Math.max(0.05, total));
        const nb = nod * sm(total - nodLen, total, s);
        const wb = wig * Math.sin(s * 40 + this.hookAz * 3) * Math.min(1, s * 10);
        const bx = hx * hb + lax * lb + nx * nb - hz * wb;
        const bz = hz * hb + laz * lb + nz * nb + hx * wb;
        const a = Math.hypot(bx, bz);
        const sa = a > 1e-6 ? Math.sin(a) / a : 1;
        x += ds * bx * sa;
        y += ds * Math.cos(a);
        z += ds * bz * sa;
      }
      out[0] = x;
      out[1] = y;
      out[2] = z;
    });
  }

  // Pale folded seed leaves that open flat and green at the node.
  // `r` is the stem radius there.
  cotyledons(b, g, path, r = 0.001, fade = 1) {
    if (g < 0.1 || fade <= 0) return;
    const c = this.cot;
    const open = ease(g, 0.235, 0.33);
    const grow = mix(0.5, 1, ease(g, 0.14, 0.36)) * fade;
    path.at(this.nodeS, pt);
    frameAlong(M1, pt.p, pt.t, this.cotAz);
    const L = c.L * grow;
    const W = c.W * grow;
    const shape = c.shape;
    const width = (v) => {
      if (v < c.petiole) return 0.18 + 0.1 * (v / c.petiole);
      const q = (v - c.petiole) / (1 - c.petiole);
      if (shape === 'narrow') return Math.pow(Math.sin(Math.PI * Math.min(1, q * 0.92 + 0.04)), 0.7);
      if (shape === 'butterfly') return Math.pow(Math.sin(Math.PI * (0.12 + q * 0.6)), 0.5) * (0.6 + 0.5 * q);
      return Math.pow(Math.sin(Math.PI * (0.03 + q * 0.94)), 0.62);
    };
    const pale = 1 - ease(g, 0.24, 0.36);
    for (let i = 0; i < 2; i++) {
      const az = i * Math.PI;
      M2.makeRotationY(az + Math.PI).setPosition(Math.sin(az) * r, 0, Math.cos(az) * r);
      M2.premultiply(M1);
      sheet(b, M2, {
        L,
        W,
        nu: 6,
        nv: 8,
        width,
        bend0: -mix(0.04, 1.2, open) - 0.12 * ease(g, 0.4, 0.7),
        curl: mix(0.25, -0.35, open),
        wrap: mix(90, 20, open),
        notch: shape === 'butterfly' ? 0.35 : 0,
        notchW: 0.55,
        uv: PLAIN_UV,
        color: (s, v, o) => {
          o.r = mix(1, 1.45, pale);
          o.g = mix(1, 1.3, pale);
          o.b = mix(1, 0.75, pale);
        },
      });
    }
  }

  // The seed coat caught on the closed seed leaves, until they open and
  // shrug it off onto the soil.
  coatMesh(b, g, path) {
    if (!this.coat || g < 0.1 || g > 0.5) return;
    const k = this.kind;
    if (g < 0.265) {
      path.at(this.nodeS, pt);
      const L = this.cot.L * mix(0.5, 1, ease(g, 0.14, 0.36));
      frameAlong(M1, [pt.p[0] + pt.t[0] * L * 0.62, pt.p[1] + pt.t[1] * L * 0.62, pt.p[2] + pt.t[2] * L * 0.62], pt.t, this.cotAz + Math.PI * 0.5);
      M2.makeRotationY(0);
      this.seedShape(b, M1, 1.02, 0);
    } else {
      const f = this.coatFall;
      M1.makeRotationY(f.yaw);
      M2.makeRotationZ(Math.PI * 0.5);
      M1.multiply(M2).setPosition(f.x, 0.004 + k.T * 0.4, f.z);
      this.seedShape(b, M1, 1.02, 0);
    }
  }
}

function sm(a, b, x) {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}
