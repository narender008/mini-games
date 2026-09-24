// The soil that closes over a seed and cracks open as the shoot pushes
// through: crumbs roll in from the rim of the planting hole, the mound rises
// and bulges, splits into clods that tip apart, then settles and sinks away.
// Also the shared soil material (vertex-coloured, a small crumbly texture).
import * as THREE from 'three';
import { canvasTexture } from '../shared.js';
import { TAU, mix, ease, mixRGB, blob, place, paintNormal, noise2, fbm } from './common.js';

const _M = new THREE.Matrix4();

let soilMat = null;
export function soilMaterial() {
  if (!soilMat) {
    // tiles every 4 cm (uv = plant-space x, z * 25)
    const crumbH = (u, v) => {
      const a = fbm(u * 6, v * 6, 4);
      const c = fbm(u * 22 + 3, v * 22, 2);
      return a * 0.7 + c * 0.3;
    };
    const map = canvasTexture(128, 128, (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const k = 0.72 + 0.5 * crumbH(x / w, y / h) + 0.12 * (noise2(x * 0.9, y * 0.9) - 0.5);
          const i = (y * w + x) * 4;
          img.data[i] = Math.min(255, 205 * k);
          img.data[i + 1] = Math.min(255, 200 * k);
          img.data[i + 2] = Math.min(255, 196 * k);
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }, { srgb: true });
    const normalMap = paintNormal(128, 128, crumbH, 2.2);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    soilMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map, normalMap });
    soilMat.name = 'plant-soil';
  }
  return soilMat;
}

const SOIL_A = srgb(0.25, 0.185, 0.135);
const SOIL_B = srgb(0.33, 0.24, 0.17);
const SOIL_IN = srgb(0.2, 0.145, 0.105);
function srgb(r, g, b) {
  const c = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
}

// The soil that closes over a seed and cracks open as the shoot pushes up.
// Built into the plant's soil builder; nothing is drawn once it has settled.
export class SoilCover {
  constructor(rng, { radius = 0.034, height = 0.024, wedges = 6, crumbs = 14, rimY = 0.014 } = {}) {
    this.R = radius;
    this.H = height;
    this.rimY = rimY;
    this.nseed = rng() * 100;
    this.wedges = [];
    let a = rng() * TAU;
    const step = TAU / wedges;
    for (let k = 0; k < wedges; k++) {
      const a0 = a;
      a += step * (0.75 + rng() * 0.5);
      this.wedges.push({ a0, a1: k === wedges - 1 ? this.wedges[0].a0 + TAU : a, tilt: 0.08 + rng() * 0.14, push: 0.5 + rng() * 0.5 });
    }
    this.jag = Array.from({ length: wedges * 8 }, () => rng() - 0.5);
    this.crumbs = [];
    for (let k = 0; k < crumbs; k++) {
      const ang = rng() * TAU;
      const r = Math.sqrt(rng()) * radius * 0.85;
      const seed = rng() * 50;
      // shape and shade of each lump, worked out once
      const shape = new Float32Array(6 * 5);
      const shade = new Float32Array(6 * 5);
      for (let j = 0; j <= 4; j++) {
        for (let i = 0; i <= 5; i++) {
          const lon = (i % 5) / 5;
          shape[j * 6 + i] = 0.55 + 0.8 * noise2(lon * 5 + seed, (j / 4) * 4) * (0.7 + 0.3 * noise2(lon * 13, (j / 4) * 9 + seed));
          shade[j * 6 + i] = 0.8 + 0.4 * noise2(lon * 7 + seed, (j / 4) * 5);
        }
      }
      this.crumbs.push({
        ang,
        r,
        wedge: 0,
        from: [Math.cos(ang + (rng() - 0.5)) * radius * (1.45 + rng() * 0.5), Math.sin(ang + (rng() - 0.5)) * radius * (1.45 + rng() * 0.5)],
        t0: 0.03 + rng() * 0.03,
        size: 0.0018 + rng() * rng() * 0.004,
        spin: rng() * TAU,
        rgb: mixRGB(SOIL_A, SOIL_B, rng()),
        shape,
        shade,
      });
    }
    for (const c of this.crumbs) {
      for (let q = 0; q < wedges; q++) {
        let an = c.ang;
        while (an < this.wedges[q].a0) an += TAU;
        if (an < this.wedges[q].a1) c.wedge = q;
      }
    }
    this.cache = null;
  }

  // Dome height at radius r (before bulge).
  dome(r) {
    const q = Math.min(1, r / this.R);
    return this.H * Math.pow(1 - q * q, 0.75);
  }

  // Surface bumps and colours for every wedge vertex, computed once.
  _cache() {
    const R = this.R;
    const seed = this.nseed;
    const nW = this.wedges.length;
    const C = { edges: [], top: [] };
    for (let w = 0; w < nW; w++) {
      const wd = this.wedges[w];
      const e0 = new Float32Array(WR + 1);
      const e1 = new Float32Array(WR + 1);
      for (let j = 0; j <= WR; j++) {
        const r = Math.max(0.001, (j / WR) * R);
        const k = Math.min(7, Math.floor((r / R) * 7));
        e0[j] = wd.a0 + this.jag[w * 8 + k] * 0.16 * (r / R);
        e1[j] = wd.a1 + this.jag[((w + 1) % nW) * 8 + k] * 0.16 * (r / R);
      }
      const n = (WC + 1) * (WR + 1);
      const h = new Float32Array(n);
      const col = new Float32Array(n * 3);
      for (let j = 0; j <= WR; j++) {
        const r = Math.max(0.001, (j / WR) * R);
        for (let i = 0; i <= WC; i++) {
          const a = mix(e0[j], e1[j], i / WC);
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          const n1 = fbm(x * 260 + seed * 0.1, z * 260, 3);
          const n2 = noise2(x * 900 + seed, z * 900);
          const k = j * (WC + 1) + i;
          h[k] = (n1 - 0.5) * 0.006 + (n2 - 0.5) * 0.0018;
          const c = mixRGB(SOIL_A, SOIL_B, n1);
          const dark = 0.85 + 0.3 * noise2(x * 400 + seed, z * 400);
          col[k * 3] = c[0] * dark;
          col[k * 3 + 1] = c[1] * dark;
          col[k * 3 + 2] = c[2] * dark;
        }
      }
      C.edges.push([e0, e1]);
      C.top.push({ h, col });
    }
    this.cache = C;
    return C;
  }

  // Tilt of wedge w: [cosA, sinA, cos tilt, sin tilt, push].
  _pose(w, open, settle, gap, out) {
    const wd = this.wedges[w];
    const am = (wd.a0 + wd.a1) / 2;
    const tilt = wd.tilt * open * (1 - 0.35 * settle);
    out[0] = am;
    out[1] = Math.cos(tilt);
    out[2] = Math.sin(tilt);
    out[3] = gap + wd.push * 0.005 * open;
    return out;
  }

  // A point of wedge (pose) at angle ang, radius r, height y -> out[3]:
  // tilted about a line across the wedge, then pushed outwards.
  _xf(pose, ang, r, y, sink, out) {
    const am = pose[0];
    const pivot = this.R * 0.55;
    const rr = r * Math.cos(ang - am);
    const tt = r * Math.sin(ang - am);
    const dr = rr - pivot;
    const R2 = pivot + dr * pose[1] + y * pose[2] + pose[3];
    const y2 = y * pose[1] - dr * pose[2];
    const ca = Math.cos(am);
    const sa = Math.sin(am);
    out[0] = ca * R2 - sa * tt;
    out[1] = y2 + sink;
    out[2] = sa * R2 + ca * tt;
    return out;
  }

  // How the soil sits at growth g: returns false when nothing is shown.
  build(b, g, crackStart = 0.08, openAt = 0.16) {
    if (g < 0.025 || g > 0.72) return false;
    const C = this.cache ?? this._cache();
    const rise = ease(g, 0.035, 0.08);
    const bulge = ease(g, crackStart, openAt) * (1 - ease(g, openAt + 0.02, openAt + 0.12));
    const open = ease(g, crackStart + 0.03, openAt + 0.05);
    const settle = ease(g, openAt + 0.08, 0.6);
    const hScale = rise * (1 + 0.3 * bulge) * (1 - 0.5 * settle);
    const sink = -0.004 * settle - 0.012 * ease(g, 0.55, 0.72);
    const gap = 0.0007 * ease(g, crackStart, crackStart + 0.03);
    const nW = this.wedges.length;
    const pose = _pose;
    if (rise > 0.02) {
      for (let w = 0; w < nW; w++) {
        this._pose(w, open, settle, gap, pose);
        this._wedge(b, w, C, pose, hScale, sink, gap);
      }
    }
    // crumbs roll in from the rim, then ride their wedge
    const tmp = _tmp3;
    for (const c of this.crumbs) {
      const k = ease(g, c.t0, c.t0 + 0.02);
      if (k <= 0) {
        this._crumb(b, c, c.from[0], this.rimY, c.from[1], 1);
        continue;
      }
      this._pose(c.wedge, open, settle, gap, pose);
      this._xf(pose, c.ang, c.r, this.dome(c.r) * hScale + c.size * 0.35, sink, tmp);
      const x = mix(c.from[0], tmp[0], k);
      const z = mix(c.from[1], tmp[2], k);
      const yy = mix(this.rimY, tmp[1], k) + Math.sin(k * Math.PI) * 0.01;
      this._crumb(b, c, x, yy, z, 1 - 0.3 * settle);
    }
    return true;
  }

  _crumb(b, c, x, y, z, sc) {
    const M = place(_M, x, y, z, c.spin, c.spin * 0.7, 0, sc);
    const { shape, shade } = c;
    blob(b, M, c.size, c.size * 0.7, c.size * 0.85, {
      cols: 5,
      rows: 4,
      rgb: c.rgb,
      shape: (lat, lon, out) => {
        out[0] = shape[Math.round(lat * 4) * 6 + Math.round(lon * 5)];
      },
      color: (lat, lon, o) => {
        const k = shade[Math.round(lat * 4) * 6 + Math.round(lon * 5)];
        o.r *= k;
        o.g *= k;
        o.b *= k;
      },
    });
  }

  _wedge(b, w, C, pose, hScale, sink, gap) {
    const R = this.R;
    const [e0, e1] = C.edges[w];
    const { h, col } = C.top[w];
    const out = _tmp3;
    const jag = this.jag;
    const gapAt = (r) => gap / Math.max(0.0025, r);
    const topY = (j, i) => (this.dome((j / WR) * R) + h[j * (WC + 1) + i]) * hScale + 0.0006;
    // top surface
    b.grid(
      WC,
      WR,
      (i, j, o) => {
        const r = Math.max(0.001, (j / WR) * R);
        const ga = gapAt(r);
        const a = mix(e0[j] + ga, e1[j] - ga, i / WC);
        this._xf(pose, a, r, topY(j, i), sink, out);
        o.x = out[0];
        o.y = out[1];
        o.z = out[2];
        o.u = Math.cos(a) * r * 25;
        o.v = Math.sin(a) * r * 25;
        const k = (j * (WC + 1) + i) * 3;
        o.r = col[k];
        o.g = col[k + 1];
        o.b = col[k + 2];
        o.f = 0;
        o.t = 1;
      },
      false,
      false,
    );
    // the two crack faces (visible once the wedges part), broken and uneven
    for (let side = 0; side < 2; side++) {
      const other = side === 0 ? w : (w + 1) % this.wedges.length;
      const ci = side === 0 ? 0 : WC;
      b.grid(
        WR,
        3,
        (i, j, o) => {
          const r = Math.max(0.001, (i / WR) * R);
          const f = j / 3;
          const ga = gapAt(r);
          const base = side === 0 ? e0[i] + ga : e1[i] - ga;
          const a = base + (j > 0 && j < 3 ? jag[other * 8 + ((i + j * 3) % 8)] * 0.05 * Math.min(1, r / 0.006) : 0);
          const top = topY(i, ci);
          this._xf(pose, a, r, mix(-0.003, top, f), sink, out);
          o.x = out[0];
          o.y = out[1];
          o.z = out[2];
          o.u = r * 25;
          o.v = f * top * 25;
          const k = (0.8 + 0.35 * noise2(i * 3.1, j * 2.3 + side + w)) * mix(0.8, 1, f);
          o.r = SOIL_IN[0] * k;
          o.g = SOIL_IN[1] * k;
          o.b = SOIL_IN[2] * k;
          o.f = 0;
          o.t = 1;
        },
        false,
        side === 0,
      );
    }
  }
}

const WC = 6; // wedge grid: columns across, rows out from the centre
const WR = 7;
const _pose = [0, 1, 0, 0];
const _tmp3 = [0, 0, 0];
