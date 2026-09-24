// Shared kit for building flowers in code: a growable geometry builder that
// plants rebuild as they grow (one draw call per material per plant), a
// parametric sheet for leaves, petals and sepals, tubes for stems, lumps for
// seeds and buds, a springy wobble, and small pixel painters for textures.
import * as THREE from 'three';
import { canvasTexture, noise2, fbm } from '../shared.js';

export const TAU = Math.PI * 2;
export const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const mix = (a, b, k) => a + (b - a) * k;
// linear 0..1 ramp of g across [a, b], and its smoothstep
export const ramp = (g, a, b) => sat((g - a) / (b - a));
export const ease = (g, a, b) => {
  const k = sat((g - a) / (b - a));
  return k * k * (3 - 2 * k);
};
export const easeOut = (k) => 1 - (1 - k) * (1 - k);

// Round to 1/n steps (rebuild keys: a part rebuilds only when its key changes).
export const quant = (x, n) => Math.round(x * n) / n;

// A value keyed by growth: pts = [[g0, v0], [g1, v1], ...], eased between keys.
export function curve(g, pts) {
  if (g <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (g < pts[i][0]) {
      const [g0, v0] = pts[i - 1];
      const [g1, v1] = pts[i];
      const k = (g - g0) / (g1 - g0);
      return v0 + (v1 - v0) * k * k * (3 - 2 * k);
    }
  }
  return pts[pts.length - 1][1];
}

// sRGB hex -> linear [r, g, b]
export function lin(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
export function mixRGB(a, b, k, out = [0, 0, 0]) {
  out[0] = a[0] + (b[0] - a[0]) * k;
  out[1] = a[1] + (b[1] - a[1]) * k;
  out[2] = a[2] + (b[2] - a[2]) * k;
  return out;
}

// ------------------------------------------------------------ builder

// Accumulates vertices (position, normal, uv, colour, aPlant) and triangles,
// then hands them to a BufferGeometry whose attributes share its arrays.
// Rebuilding reuses the arrays, so a growing plant allocates nothing.
export class Builder {
  constructor(cap = 1024) {
    this.nv = 0;
    this.ni = 0;
    this.cap = 0;
    this.icap = 0;
    this._alloc(cap, cap * 6);
    this.geometry = new THREE.BufferGeometry();
    this._bound = -1;
    this.flexFn = null; // (x, y, z) -> flex, used when a vertex gives none
    this.thick = 0;
    this._o = { x: 0, y: 0, z: 0, u: 0, v: 0, r: 1, g: 1, b: 1, f: -1, t: -1 };
    this._bad = [];
  }

  _alloc(cap, icap) {
    const grow = (old, n) => {
      const a = new old.constructor(n);
      a.set(old.subarray(0, Math.min(old.length, n)));
      return a;
    };
    if (cap > this.cap) {
      if (!this.pos) {
        this.pos = new Float32Array(cap * 3);
        this.nor = new Float32Array(cap * 3);
        this.uv = new Float32Array(cap * 2);
        this.col = new Float32Array(cap * 3);
        this.pl = new Float32Array(cap * 2);
      } else {
        this.pos = grow(this.pos, cap * 3);
        this.nor = grow(this.nor, cap * 3);
        this.uv = grow(this.uv, cap * 2);
        this.col = grow(this.col, cap * 3);
        this.pl = grow(this.pl, cap * 2);
      }
      this.cap = cap;
    }
    if (icap > this.icap || (cap > 65535 && this.idx instanceof Uint16Array)) {
      const Type = cap > 65535 ? Uint32Array : Uint16Array;
      const a = new Type(icap);
      if (this.idx) a.set(this.idx.subarray(0, Math.min(this.idx.length, icap)));
      this.idx = a;
      this.icap = icap;
    }
  }

  _ensure(nv, ni) {
    if (nv > this.cap || ni > this.icap) this._alloc(Math.max(nv, Math.ceil(this.cap * 1.5)), Math.max(ni, Math.ceil(this.icap * 1.5)));
  }

  reset() {
    this.nv = 0;
    this.ni = 0;
    return this;
  }

  vertex(x, y, z, nx, ny, nz, u, v, r, g, b, flex = -1, thick = -1) {
    this._ensure(this.nv + 1, this.ni);
    const k = this.nv++;
    this.pos[k * 3] = x;
    this.pos[k * 3 + 1] = y;
    this.pos[k * 3 + 2] = z;
    this.nor[k * 3] = nx;
    this.nor[k * 3 + 1] = ny;
    this.nor[k * 3 + 2] = nz;
    this.uv[k * 2] = u;
    this.uv[k * 2 + 1] = v;
    this.col[k * 3] = r;
    this.col[k * 3 + 1] = g;
    this.col[k * 3 + 2] = b;
    this.pl[k * 2] = flex >= 0 ? flex : this.flexFn ? this.flexFn(x, y, z) : 0;
    this.pl[k * 2 + 1] = thick >= 0 ? thick : this.thick;
    return k;
  }

  tri(a, b, c) {
    this._ensure(this.nv, this.ni + 3);
    this.idx[this.ni++] = a;
    this.idx[this.ni++] = b;
    this.idx[this.ni++] = c;
  }

  // A (cols x rows) quad grid. fill(i, j, o) sets o.x/y/z, o.u/v, o.r/g/b and
  // optionally o.f (flex) and o.t (thickness). Normals come from the grid's
  // neighbours and face the side where (d/du x d/dv) points (flip reverses).
  grid(cols, rows, fill, wrap = false, flip = false) {
    const nu = cols + 1;
    const nr = rows + 1;
    const base = this.nv;
    this._ensure(base + nu * nr, this.ni + cols * rows * 6);
    const o = this._o;
    const { pos, nor, uv, col, pl } = this;
    for (let j = 0; j < nr; j++) {
      for (let i = 0; i < nu; i++) {
        o.f = -1;
        o.t = -1;
        fill(i, j, o);
        const k = base + j * nu + i;
        pos[k * 3] = o.x;
        pos[k * 3 + 1] = o.y;
        pos[k * 3 + 2] = o.z;
        uv[k * 2] = o.u;
        uv[k * 2 + 1] = o.v;
        col[k * 3] = o.r;
        col[k * 3 + 1] = o.g;
        col[k * 3 + 2] = o.b;
        pl[k * 2] = o.f >= 0 ? o.f : this.flexFn ? this.flexFn(o.x, o.y, o.z) : 0;
        pl[k * 2 + 1] = o.t >= 0 ? o.t : this.thick;
      }
    }
    const bad = this._bad;
    bad.length = 0;
    const s = flip ? -1 : 1;
    for (let j = 0; j < nr; j++) {
      const jd = j > 0 ? j - 1 : 0;
      const ju = j < rows ? j + 1 : rows;
      for (let i = 0; i < nu; i++) {
        const il = i > 0 ? i - 1 : wrap ? cols - 1 : 0;
        const ir = i < cols ? i + 1 : wrap ? 1 : cols;
        const L = (base + j * nu + il) * 3;
        const R = (base + j * nu + ir) * 3;
        const D = (base + jd * nu + i) * 3;
        const U = (base + ju * nu + i) * 3;
        const ax = pos[R] - pos[L];
        const ay = pos[R + 1] - pos[L + 1];
        const az = pos[R + 2] - pos[L + 2];
        const bx = pos[U] - pos[D];
        const by = pos[U + 1] - pos[D + 1];
        const bz = pos[U + 2] - pos[D + 2];
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const l = Math.hypot(nx, ny, nz);
        const k = (base + j * nu + i) * 3;
        if (l < 1e-14) {
          bad.push(j * nu + i);
          nx = 0;
          ny = 1;
          nz = 0;
        } else {
          nx = (nx / l) * s;
          ny = (ny / l) * s;
          nz = (nz / l) * s;
        }
        nor[k] = nx;
        nor[k + 1] = ny;
        nor[k + 2] = nz;
      }
    }
    // degenerate points (a pointed tip, a closed pole) borrow a neighbour's normal
    for (const q of bad) {
      const j = Math.floor(q / nu);
      const i = q % nu;
      const jj = j > 0 ? j - 1 : Math.min(rows, j + 1);
      const src = (base + jj * nu + i) * 3;
      const dst = (base + q) * 3;
      nor[dst] = nor[src];
      nor[dst + 1] = nor[src + 1];
      nor[dst + 2] = nor[src + 2];
    }
    const idx = this.idx;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = base + j * nu + i;
        const b = a + 1;
        const c = a + nu + 1;
        const d = a + nu;
        if (flip) {
          idx[this.ni++] = a;
          idx[this.ni++] = c;
          idx[this.ni++] = b;
          idx[this.ni++] = a;
          idx[this.ni++] = d;
          idx[this.ni++] = c;
        } else {
          idx[this.ni++] = a;
          idx[this.ni++] = b;
          idx[this.ni++] = c;
          idx[this.ni++] = a;
          idx[this.ni++] = c;
          idx[this.ni++] = d;
        }
      }
    }
    this.nv += nu * nr;
    return base;
  }

  // Recompute every vertex's flex as if it were moved by matrix M (for a
  // part built in its own frame and placed by its mesh's matrix).
  reflex(M) {
    if (!this.flexFn) return;
    const e = M.elements;
    const { pos, pl } = this;
    for (let k = 0; k < this.nv; k++) {
      const x = pos[k * 3];
      const y = pos[k * 3 + 1];
      const z = pos[k * 3 + 2];
      pl[k * 2] = this.flexFn(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
    const a = this.geometry.attributes.aPlant;
    if (a) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.nv * 2);
      a.needsUpdate = true;
    }
  }

  // Push the built data to the geometry (only the used ranges upload).
  commit() {
    const g = this.geometry;
    if (this._bound !== this.cap || g.index?.array !== this.idx) {
      if (this._bound >= 0) g.dispose();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
      g.setAttribute('aPlant', new THREE.BufferAttribute(this.pl, 2));
      g.setIndex(new THREE.BufferAttribute(this.idx, 1));
      for (const a of Object.values(g.attributes)) a.setUsage(THREE.DynamicDrawUsage);
      this._bound = this.cap;
    }
    for (const name in g.attributes) {
      const a = g.attributes[name];
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.nv * a.itemSize);
      a.needsUpdate = true;
    }
    g.index.clearUpdateRanges();
    g.index.addUpdateRange(0, this.ni);
    g.index.needsUpdate = true;
    g.setDrawRange(0, this.ni);
    return g;
  }
}

// ------------------------------------------------------------ sheets

const _M = new THREE.Matrix4();
const _v = new THREE.Vector3();
const ROWS_MAX = 64;
const rowC = new Float32Array(ROWS_MAX * 3);
const rowX = new Float32Array(ROWS_MAX * 3);
const rowN = new Float32Array(ROWS_MAX * 3);
const rowHW = new Float32Array(ROWS_MAX);
const rowPhi = new Float32Array(ROWS_MAX);
const rowK = new Float32Array(ROWS_MAX);
const rowWR = new Float32Array(ROWS_MAX);
const rowWL = new Float32Array(ROWS_MAX);
const rowTY = new Float32Array(ROWS_MAX);
const rowTZ = new Float32Array(ROWS_MAX);

const val = (p, v) => (typeof p === 'function' ? p(v) : p);

// A leaf, petal, sepal or bract. In its own frame the base is at the origin,
// the midrib runs along +y for length L, the blade spans x (width W) and the
// front face (upper side of a leaf, inner side of a petal) looks along +z.
// Shape parameters (numbers or functions of v, 0 at base .. 1 at tip):
//   width(v)  half-width as a fraction of W/2
//   fold      V-fold at the midrib, radians per half (closed leaf ~ 1.5)
//   wrap      cross curvature (1/m) bending the halves towards the front
//   curl      total bend of the midrib towards the front (radians); curlPow
//             how it is spread (1 even, >1 towards the tip)
//   twist     radians along the length
//   wave      margin ripple amplitude (m), waveN ripples along the length
//   crinkle   random crumples (m), noise frequency crinkleF
//   shift(v)  moves a whole row along the sheet's +z (rolled leaves nest)
//   notch     pulls the middle of the tip back (fraction of L; notchW wide)
//   tipCurl   an extra roll over the last part (from tipAt), e.g. rose rims
// `M` places the sheet; `uv` = [u0, u1, v0, v1] atlas region; `color(s, v, o)`
// may set o.r/g/b (s is -1..1 across); otherwise `rgb`.
export function sheet(b, M, p) {
  const cols = p.nu ?? 8;
  const rows = Math.min(ROWS_MAX - 1, p.nv ?? 12);
  const L = p.L;
  const W = p.W;
  const curl = p.curl ?? 0;
  const curlPow = p.curlPow ?? 1;
  const twist = p.twist ?? 0;
  const bend0 = p.bend0 ?? 0;
  const wave = p.wave ?? 0;
  const waveN = p.waveN ?? 3;
  const wavePh = p.wavePh ?? 0;
  const shift = p.shift ?? null;
  const ds = L / rows;
  let y = 0;
  let z = 0;
  // everything that only depends on the row is worked out once per row
  const tipCurl = p.tipCurl ?? 0;
  const tipAt = p.tipAt ?? 0.65;
  const tc = (v) => (tipCurl && v > tipAt ? tipCurl * ((v - tipAt) / (1 - tipAt)) ** 2 : 0);
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const th = curl * Math.pow(v, curlPow) + bend0 + tc(v);
    if (j > 0) {
      const thm = curl * Math.pow((j - 0.5) / rows, curlPow) + bend0 + tc((j - 0.5) / rows);
      y += ds * Math.cos(thm);
      z += ds * Math.sin(thm);
    }
    const ty = Math.cos(th);
    const tz = Math.sin(th);
    const tw = twist * v;
    const c = Math.cos(tw);
    const sn = Math.sin(tw);
    rowC[j * 3] = 0;
    rowC[j * 3 + 1] = y;
    rowC[j * 3 + 2] = z + (shift ? shift(v) : 0);
    // lateral and front normal, rotated about the tangent (0, ty, tz) by the twist
    rowX[j * 3] = c;
    rowX[j * 3 + 1] = -tz * sn;
    rowX[j * 3 + 2] = ty * sn;
    rowN[j * 3] = -sn;
    rowN[j * 3 + 1] = -tz * c;
    rowN[j * 3 + 2] = ty * c;
    rowHW[j] = 0.5 * W * val(p.width, v);
    rowPhi[j] = val(p.fold ?? 0, v);
    rowK[j] = val(p.wrap ?? 0, v);
    rowWR[j] = wave ? wave * Math.sin(waveN * Math.PI * v + wavePh) : 0;
    rowWL[j] = wave ? wave * Math.sin(waveN * Math.PI * v + wavePh + 1.7) : 0;
    rowTY[j] = ty;
    rowTZ[j] = tz;
  }
  const notch = p.notch ? p.notch * L : 0;
  const notchW = p.notchW ?? 0.5;
  const uv = p.uv ?? [0, 1, 0, 1];
  const e = M.elements;
  const rgb = p.rgb ?? [1, 1, 1];
  const crinkle = p.crinkle ?? 0;
  const crF = p.crinkleF ?? 9;
  const crS = p.seed ?? 0;
  const dip = p.dip ?? 0; // midrib groove depth (m)
  const color = p.color ?? null;
  const u0 = uv[0];
  const du = uv[1] - uv[0];
  const v0 = uv[2];
  const dv = uv[3] - uv[2];
  return b.grid(
    cols,
    rows,
    (i, j, o) => {
      const v = j / rows;
      const s = (i / cols) * 2 - 1;
      const as = s < 0 ? -s : s;
      const d = as * rowHW[j];
      const phi = rowPhi[j];
      const k = rowK[j];
      let la;
      let nn;
      if (k < 1e-4 && k > -1e-4) {
        la = d * Math.cos(phi);
        nn = d * Math.sin(phi);
      } else {
        la = (Math.sin(phi + k * d) - Math.sin(phi)) / k;
        nn = (Math.cos(phi) - Math.cos(phi + k * d)) / k;
      }
      if (s < 0) la = -la;
      if (wave) nn += (s < 0 ? rowWL[j] : rowWR[j]) * as * as;
      if (crinkle) nn += crinkle * (noise2(s * crF + crS, v * crF * 1.3 - crS) - 0.5) * Math.sqrt(as + 0.05) * Math.min(1, v * 6);
      if (dip) nn -= dip * Math.exp(-(d * d) / 9e-6);
      const j3 = j * 3;
      const x = rowX[j3] * la + rowN[j3] * nn;
      let yy = rowC[j3 + 1] + rowX[j3 + 1] * la + rowN[j3 + 1] * nn;
      let zz = rowC[j3 + 2] + rowX[j3 + 2] * la + rowN[j3 + 2] * nn;
      if (notch && as < notchW) {
        // a notch in the tip: the middle of the last rows is pulled back
        const q = 1 - as / notchW;
        const back = notch * q * q * Math.max(0, (v - 0.5) / 0.5) ** 2;
        yy -= rowTY[j] * back;
        zz -= rowTZ[j] * back;
      }
      o.x = e[0] * x + e[4] * yy + e[8] * zz + e[12];
      o.y = e[1] * x + e[5] * yy + e[9] * zz + e[13];
      o.z = e[2] * x + e[6] * yy + e[10] * zz + e[14];
      o.u = u0 + (s * 0.5 + 0.5) * du;
      o.v = v0 + v * dv;
      o.r = rgb[0];
      o.g = rgb[1];
      o.b = rgb[2];
      if (color) color(s, v, o);
    },
    false,
    !!p.flip,
  );
}

// The point on a sheet's midrib at v (in the sheet frame, before M), for
// attaching things or butterfly landing spots. Returns [y, z].
export function sheetMidrib(p, v) {
  const rows = 24;
  const curl = p.curl ?? 0;
  const curlPow = p.curlPow ?? 1;
  let y = 0;
  let z = 0;
  const n = Math.round(v * rows);
  for (let j = 1; j <= n; j++) {
    const th = curl * Math.pow((j - 0.5) / rows, curlPow) + (p.bend0 ?? 0);
    y += (p.L / rows) * Math.cos(th);
    z += (p.L / rows) * Math.sin(th);
  }
  const th = curl * Math.pow(n / rows, curlPow) + (p.bend0 ?? 0);
  return [y, z, Math.cos(th), Math.sin(th)];
}

// The midrib's z (towards the front) at every row of a sheet, in one pass
// (rows + 1 values into outZ), matching sheet()'s own walk.
export function midribZ(p, rows, outZ) {
  const curl = p.curl ?? 0;
  const curlPow = p.curlPow ?? 1;
  const bend0 = p.bend0 ?? 0;
  const ds = p.L / rows;
  let z = 0;
  outZ[0] = 0;
  const tipCurl = p.tipCurl ?? 0;
  const tipAt = p.tipAt ?? 0.65;
  for (let j = 1; j <= rows; j++) {
    const v = (j - 0.5) / rows;
    z += ds * Math.sin(curl * Math.pow(v, curlPow) + bend0 + (tipCurl && v > tipAt ? tipCurl * ((v - tipAt) / (1 - tipAt)) ** 2 : 0));
    outZ[j] = z;
  }
  return outZ;
}

// ------------------------------------------------------------ paths and tubes

// A sampled centre line with parallel-transported frames.
export class Path {
  constructor(max = 48) {
    this.max = max;
    this.n = 0;
    this.p = new Float32Array(max * 3);
    this.t = new Float32Array(max * 3);
    this.nrm = new Float32Array(max * 3);
    this.bin = new Float32Array(max * 3);
    this.s = new Float32Array(max); // arc length
  }

  // fn(k, n, out3) writes point k of n.
  set(n, fn) {
    n = Math.min(n, this.max);
    this.n = n;
    const p = this.p;
    const tmp = [0, 0, 0];
    for (let k = 0; k < n; k++) {
      fn(k, n, tmp);
      p[k * 3] = tmp[0];
      p[k * 3 + 1] = tmp[1];
      p[k * 3 + 2] = tmp[2];
    }
    this._frames();
    return this;
  }

  _frames() {
    const { n, p, t, nrm, bin, s } = this;
    s[0] = 0;
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1);
      const b = Math.min(n - 1, k + 1);
      let x = p[b * 3] - p[a * 3];
      let y = p[b * 3 + 1] - p[a * 3 + 1];
      let z = p[b * 3 + 2] - p[a * 3 + 2];
      const l = Math.hypot(x, y, z) || 1;
      t[k * 3] = x / l;
      t[k * 3 + 1] = y / l;
      t[k * 3 + 2] = z / l;
      if (k > 0) s[k] = s[k - 1] + Math.hypot(p[k * 3] - p[k * 3 - 3], p[k * 3 + 1] - p[k * 3 - 2], p[k * 3 + 2] - p[k * 3 - 1]);
    }
    // initial normal: +z projected off the tangent (stems start upright)
    let nx = 0;
    let ny = 0;
    let nz = 1;
    for (let k = 0; k < n; k++) {
      const tx = t[k * 3];
      const ty = t[k * 3 + 1];
      const tz = t[k * 3 + 2];
      const d = nx * tx + ny * ty + nz * tz;
      nx -= d * tx;
      ny -= d * ty;
      nz -= d * tz;
      let l = Math.hypot(nx, ny, nz);
      if (l < 1e-6) {
        nx = 1;
        ny = 0;
        nz = 0;
        l = 1;
      }
      nx /= l;
      ny /= l;
      nz /= l;
      nrm[k * 3] = nx;
      nrm[k * 3 + 1] = ny;
      nrm[k * 3 + 2] = nz;
      bin[k * 3] = ty * nz - tz * ny;
      bin[k * 3 + 1] = tz * nx - tx * nz;
      bin[k * 3 + 2] = tx * ny - ty * nx;
    }
  }

  length() {
    return this.s[this.n - 1];
  }

  // Position and tangent at arc length `at` (clamped), into out {p:[3], t:[3]}.
  at(at, out) {
    const { n, s, p, t } = this;
    at = Math.max(0, Math.min(s[n - 1], at));
    let k = 0;
    while (k < n - 2 && s[k + 1] < at) k++;
    const f = s[k + 1] > s[k] ? (at - s[k]) / (s[k + 1] - s[k]) : 0;
    for (let c = 0; c < 3; c++) {
      out.p[c] = p[k * 3 + c] + (p[k * 3 + 3 + c] - p[k * 3 + c]) * f;
      out.t[c] = t[k * 3 + c] + (t[k * 3 + 3 + c] - t[k * 3 + c]) * f;
    }
    const l = Math.hypot(out.t[0], out.t[1], out.t[2]) || 1;
    out.t[0] /= l;
    out.t[1] /= l;
    out.t[2] /= l;
    return out;
  }
}

// A tube along a path. radius(q) with q = 0..1 along the path; uv spans
// [u0, u1] around and v = arc length * vScale + v0.
export function tube(b, path, radius, { radial = 7, u0 = 0, u1 = 1, v0 = 0, vScale = 4, rgb = [1, 1, 1], color = null, flip = false } = {}) {
  const { n, p, nrm, bin, s } = path;
  const len = s[n - 1] || 1;
  return b.grid(
    radial,
    n - 1,
    (i, j, o) => {
      const a = (i / radial) * TAU;
      const q = s[j] / len;
      const r = radius(q, j);
      const c = Math.cos(a) * r;
      const sn = Math.sin(a) * r;
      o.x = p[j * 3] + nrm[j * 3] * c + bin[j * 3] * sn;
      o.y = p[j * 3 + 1] + nrm[j * 3 + 1] * c + bin[j * 3 + 1] * sn;
      o.z = p[j * 3 + 2] + nrm[j * 3 + 2] * c + bin[j * 3 + 2] * sn;
      o.u = u0 + (i / radial) * (u1 - u0);
      o.v = v0 + s[j] * vScale;
      o.r = rgb[0];
      o.g = rgb[1];
      o.b = rgb[2];
      if (color) color(q, a, o);
    },
    true,
    !flip,
  );
}

// A closed lumpy ellipsoid (seeds, bulbs, crumbs, buds). shape(lat, lon, out)
// may reshape: lat 0 (bottom) .. 1 (top), lon 0..1; out = [rScale, yShift].
export function blob(b, M, rx, ry, rz, { cols = 10, rows = 7, uv = [0, 1, 0, 1], rgb = [1, 1, 1], color = null, shape = null, flex = -1, thick = 1 } = {}) {
  const e = M.elements;
  const tmp = [1, 0];
  return b.grid(
    cols,
    rows,
    (i, j, o) => {
      const lat = j / rows;
      const lon = i / cols;
      const th = lat * Math.PI;
      const ph = lon * TAU;
      tmp[0] = 1;
      tmp[1] = 0;
      if (shape) shape(lat, lon, tmp);
      const sr = Math.sin(th) * tmp[0];
      const x = Math.cos(ph) * sr * rx;
      const y = -Math.cos(th) * ry + tmp[1];
      const z = Math.sin(ph) * sr * rz;
      o.x = e[0] * x + e[4] * y + e[8] * z + e[12];
      o.y = e[1] * x + e[5] * y + e[9] * z + e[13];
      o.z = e[2] * x + e[6] * y + e[10] * z + e[14];
      o.u = uv[0] + lon * (uv[1] - uv[0]);
      o.v = uv[2] + lat * (uv[3] - uv[2]);
      o.r = rgb[0];
      o.g = rgb[1];
      o.b = rgb[2];
      o.f = flex;
      o.t = thick;
      if (color) color(lat, lon, o);
    },
    true,
    true,
  );
}

// Matrix helpers (reused scratch objects; results are copied by callers).
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q2 = new THREE.Quaternion();

// A frame at `pos` whose +y points along `dir`, then spun `spin` about it.
export function frameAlong(out, pos, dir, spin = 0, scale = 1) {
  _d.set(dir[0], dir[1], dir[2]).normalize();
  _q.setFromUnitVectors(_up, _d);
  _q.multiply(_q2.setFromAxisAngle(_up, spin));
  _p.set(pos[0], pos[1], pos[2]);
  _s.set(scale, scale, scale);
  return out.compose(_p, _q, _s);
}

// Euler-built placement: translate, then rotate Y (azimuth), X (tilt), Z (roll).
export function place(out, x, y, z, ry, rx = 0, rz = 0, scale = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(scale, scale, scale);
  return out.compose(_p, _q, _s);
}

// ------------------------------------------------------------ wobble

// A damped spring for taps: the plant tips a little and springs back.
export class Wobble {
  constructor() {
    this.x = 0;
    this.z = 0;
    this.vx = 0;
    this.vz = 0;
  }

  poke(strength = 1) {
    const a = Math.random() * TAU;
    this.vx += Math.cos(a) * 1.3 * strength;
    this.vz += Math.sin(a) * 1.3 * strength;
  }

  update(dt) {
    if (Math.abs(this.x) + Math.abs(this.z) + Math.abs(this.vx) + Math.abs(this.vz) < 1e-5) return false;
    const k = 60;
    const c = 3.2;
    const n = Math.max(1, Math.ceil(dt / 0.01));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vx += (-k * this.x - c * this.vx) * h;
      this.vz += (-k * this.z - c * this.vz) * h;
      this.x += this.vx * h;
      this.z += this.vz * h;
    }
    return Math.abs(this.x) + Math.abs(this.z) + Math.abs(this.vx) * 0.1 + Math.abs(this.vz) * 0.1 > 1e-4;
  }
}

// ------------------------------------------------------------ painting

// Paints a texture pixel by pixel: fn(u, v, out) writes out[0..3] in 0..1
// (sRGB colour maps) and the texture is returned.
export function paint(w, h, fn, opts = {}) {
  return canvasTexture(
    w,
    h,
    (ctx) => {
      const img = ctx.createImageData(w, h);
      const d = img.data;
      const out = [0, 0, 0, 1];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          out[3] = 1;
          // v = 0 is the bottom row, like uv
          fn((x + 0.5) / w, 1 - (y + 0.5) / h, out);
          const i = (y * w + x) * 4;
          d[i] = out[0] * 255;
          d[i + 1] = out[1] * 255;
          d[i + 2] = out[2] * 255;
          d[i + 3] = out[3] * 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    { srgb: opts.srgb ?? true, repeat: false, anisotropy: 8 },
  );
}

// A tangent-space normal map from a height function h(u, v) (v up).
export function paintNormal(w, h, height, strength = 2) {
  const hs = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hs[y * w + x] = height((x + 0.5) / w, 1 - (y + 0.5) / h);
  return canvasTexture(
    w,
    h,
    (ctx) => {
      const img = ctx.createImageData(w, h);
      const d = img.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const l = hs[y * w + Math.max(0, x - 1)];
          const r = hs[y * w + Math.min(w - 1, x + 1)];
          const up = hs[Math.max(0, y - 1) * w + x];
          const dn = hs[Math.min(h - 1, y + 1) * w + x];
          let nx = (l - r) * strength;
          let ny = (up - dn) * strength;
          const len = Math.hypot(nx, ny, 1);
          const i = (y * w + x) * 4;
          d[i] = (nx / len * 0.5 + 0.5) * 255;
          d[i + 1] = (ny / len * 0.5 + 0.5) * 255;
          d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
          d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    { srgb: false, repeat: false, anisotropy: 8 },
  );
}

export { noise2, fbm };

// A flower stalk from `base`, `len` long: it leans `lean` radians (spread
// along it) towards azimuth `az`, bends a further `nod` over its last
// `nodLen` metres (a nodding bud), and wanders a little.
export function stalkPath(path, { base = [0, 0, 0], len, lean = 0, az = 0, nod = 0, nodLen = 0.05, nodAz = az, wig = 0.002, seed = 0, n = 18 }) {
  const lx = Math.cos(az);
  const lz = Math.sin(az);
  const nx = Math.cos(nodAz);
  const nz = Math.sin(nodAz);
  const ds = Math.max(1e-4, len) / (n - 1);
  const nl = Math.min(len * 0.6, nodLen);
  let x = base[0];
  let y = base[1];
  let z = base[2];
  return path.set(n, (k, nn, out) => {
    if (k > 0) {
      const s = (k - 0.5) * ds;
      const lb = lean * (s / Math.max(1e-4, len));
      const q = sat((s - (len - nl)) / Math.max(1e-4, nl));
      const nb = nod * q * q * (3 - 2 * q);
      const w = wig * Math.sin(s * 31 + seed) * 8;
      const bx = lx * lb + nx * nb - lz * w;
      const bz = lz * lb + nz * nb + lx * w;
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

// Fine hairs along a path: small double-sided quads standing out from the
// surface (poppy and sunflower stems, buds). Uses the plain atlas region.
export function hairs(b, path, count, { len = 0.0025, width = 0.00016, radius = 0.0015, uv = [0.72, 0.85, 0, 1], rgb = [1, 1, 1], seed = 1, from = 0, to = 1, up = 0.4 } = {}) {
  const L = path.length();
  let h = seed * 97.13;
  const rnd = () => {
    h = (h * 16807 + 0.5) % 2147483647;
    return (h % 10000) / 10000;
  };
  const at = { p: [0, 0, 0], t: [0, 1, 0] };
  for (let i = 0; i < count; i++) {
    const s = L * mix(from, to, rnd());
    path.at(s, at);
    const a = rnd() * TAU;
    // a direction around the stem, tipped towards the stem's tip
    const t = at.t;
    let ox = -t[2];
    let oy = 0;
    let oz = t[0];
    let ol = Math.hypot(ox, oy, oz);
    if (ol < 1e-4) {
      ox = 1;
      oz = 0;
      ol = 1;
    }
    ox /= ol;
    oz /= ol;
    const bx = t[1] * oz - t[2] * oy;
    const by = t[2] * ox - t[0] * oz;
    const bz = t[0] * oy - t[1] * ox;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const dx = ox * c + bx * sn;
    const dy = oy * c + by * sn;
    const dz = oz * c + bz * sn;
    const px = at.p[0] + dx * radius;
    const py = at.p[1] + dy * radius;
    const pz = at.p[2] + dz * radius;
    const l = len * (0.6 + 0.8 * rnd());
    const ex = (dx + t[0] * up) * l;
    const ey = (dy + t[1] * up) * l;
    const ez = (dz + t[2] * up) * l;
    // width across: perpendicular to the hair and the stem
    const wx = (dy * t[2] - dz * t[1]) * width;
    const wy = (dz * t[0] - dx * t[2]) * width;
    const wz = (dx * t[1] - dy * t[0]) * width;
    const v0 = b.vertex(px - wx, py - wy, pz - wz, dx, dy, dz, uv[0], uv[2], rgb[0], rgb[1], rgb[2], -1, 0.3);
    const v1 = b.vertex(px + wx, py + wy, pz + wz, dx, dy, dz, uv[1], uv[2], rgb[0], rgb[1], rgb[2], -1, 0.3);
    const v2 = b.vertex(px + ex, py + ey, pz + ez, dx, dy, dz, (uv[0] + uv[1]) / 2, uv[3], rgb[0], rgb[1], rgb[2], -1, 0.3);
    b.tri(v0, v1, v2);
  }
}
