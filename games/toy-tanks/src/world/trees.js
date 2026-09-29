// Trees for the scenery beyond the lane: real-sized (four to nine metres, or a
// few hundred metres away in the haze), and toy-sized ones near the tanks.
//
// A crown is a few hundred small CARDS (two triangles each), not a lumpy ball:
//  * a broadleaf crown is a set of leaf clumps ("lobes") sitting on a branch
//    skeleton and on the crown's outline; every card shows one of eight
//    hand-drawn leaf clusters from a procedural atlas (canvas, drawn once);
//  * a pine is a straight trunk with whorls of drooping needle sprays (flat
//    fans along their branches, long and short tiers alternating), narrowing
//    to a spire; the gap between tiers follows their width, so the trunk is
//    covered right up to the top.
// Leaf clumps turn to face the camera in the vertex shader, so a crown never
// thins out edge-on; a spray keeps its place in the world (thin from the
// side) with some of the face-on version blended in. Normals are bent outwards
// from the crown, lobe and card centre and each card adds a little dome, so
// the whole tree shades as one soft volume: a sunlit top, dark underside and
// inside, clumps that read as puffs; leaves let some light through.
// The atlas has its own mip chain that keeps the covered fraction constant
// (plain averaging would thin the leaves away with distance) and cutouts are
// alpha-to-coverage under MSAA, so far trees stay crisp and full.
// Instanced: one draw per crown shape and one or a few for the wood, all
// swaying slowly in the wind. `far: true` trees are the same thing with about
// a tenth of the cards, for thousands of them from 150 m out.
import * as THREE from 'three';
import { fbm3, rng, smoothstep } from '../config.js';
import { loadPBR } from '../env.js';
import { detectQuality } from '../quality.js';
import { BLAST_GLSL, blastUniforms } from './react.js';

// ------------------------------------------------------------------ the leaf atlas
// eight 256 px tiles, 4 x 2. Colours are neutral, dark to bright (the tree's own colour multiplies them in).
const TILE = 256;
const COLS = 4;
const ROWS = 2;
const AW = TILE * COLS;
const AH = TILE * ROWS;
const lin = (f) => Math.max(0, Math.min(255, Math.round(255 * Math.pow(Math.max(0, f), 1 / 2.2))));
// f: linear brightness, hy: -1 (cooler) .. 1 (yellower)
const rgb = (f, hy = 0) => `rgb(${lin(f * (1 + 0.16 * hy))},${lin(f)},${lin(f * (1 - 0.32 * hy))})`;

function lens(ctx, x, y, ang, len, wid) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const P = (lx, ly) => [x + c * lx - s * ly, y + s * lx + c * ly];
  const a = P(-len / 2, 0);
  const b = P(len / 2, 0);
  const u = P(0, -wid);
  const d = P(0, wid);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.quadraticCurveTo(u[0], u[1], b[0], b[1]);
  ctx.quadraticCurveTo(d[0], d[1], a[0], a[1]);
}

// a puffy clump of broad leaves: a solid dark core, then three layers of leaves, brighter outwards and upwards
function drawLeafCluster(ctx, ox, oy, R) {
  const p1 = R() * 6.28;
  const p2 = R() * 6.28;
  const p3 = R() * 6.28;
  const rim = (th) => 76 + 9 * Math.sin(3 * th + p1) + 6 * Math.sin(5 * th + p2) + 5 * Math.sin(2 * th + p3);
  const cx = ox + 128;
  const cy = oy + 128;
  ctx.fillStyle = rgb(0.32);
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) {
    const th = (i / 28) * 6.2832;
    const r = rim(th) * 0.74;
    const x = cx + Math.cos(th) * r;
    const y = cy + Math.sin(th) * r * 0.94;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.fill();
  const counts = [70, 92, 100];
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < counts[layer]; i++) {
      const th = R() * 6.2832;
      const u = Math.sqrt(R());
      const k = layer === 0 ? u * 0.85 : layer === 1 ? 0.1 + 0.9 * u : 0.3 + 0.7 * u;
      const r = rim(th) * (0.12 + 0.88 * k);
      const x = cx + Math.cos(th) * r;
      const y = cy + Math.sin(th) * r * 0.95;
      const top = (cy - y) / 90;
      const f = 0.36 + 0.15 * layer + 0.2 * top + 0.1 * (r / rim(th)) + (R() - 0.5) * 0.26;
      const len = 30 + R() * 14 - layer * 3;
      const wid = len * (0.4 + R() * 0.14);
      const ang = th + (R() - 0.5) * 2.4;
      const hy = (R() - 0.5) * 1.2 + top * 0.5;
      // a darker leaf with a brighter, smaller one on top of it, lit from above: a soft bevel, no outline
      lens(ctx, x, y, ang, len, wid);
      ctx.fillStyle = rgb(f * 0.78, hy - 0.1);
      ctx.fill();
      const sg = Math.cos(ang) < 0 ? 1 : -1; // towards whichever side faces up
      lens(ctx, x - Math.sin(ang) * sg * wid * 0.22, y + Math.cos(ang) * sg * wid * 0.22, ang, len * 0.86, wid * 0.62);
      ctx.fillStyle = rgb(Math.min(1, f * 1.12), hy + 0.1);
      ctx.fill();
    }
  }
}

// a needle spray: a solid, dark, saw-edged fan (so its middle never goes see-through, whatever the mip level), with twigs and
// needles drawn over it and a fringe of needle tips round the edge, hanging down; the stem runs left to right, trunk end at the left
function drawSpray(ctx, ox, oy, R) {
  const sx = (t) => ox + 10 + 232 * t;
  const sy = (t) => oy + 112 + 24 * t * t;
  const hw = (t) => 82 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.88 + 0.07)), 0.85);
  const N = 26;
  const up = [];
  const dn = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const jag = (i % 2 ? 1 : 0.62) * (0.8 + 0.4 * R());
    up.push([sx(t) + (R() - 0.5) * 6, sy(t) - hw(t) * 0.78 * jag]);
    dn.push([sx(t) + (R() - 0.5) * 6, sy(t) + hw(t) * 1.02 * jag + 10 * t]);
  }
  ctx.lineCap = 'round';
  ctx.fillStyle = rgb(0.15, 0.3);
  ctx.beginPath();
  up.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  for (let i = N; i >= 0; i--) ctx.lineTo(dn[i][0], dn[i][1]);
  ctx.closePath();
  ctx.fill();
  const needle = (x, y, a, len, f, hy, w) => {
    ctx.lineWidth = w;
    ctx.strokeStyle = rgb(f, hy);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len + len * 0.12);
    ctx.stroke();
  };
  // twigs from the stem to the saw teeth, needles along them
  const twig = (x0, y0, x1, y1, fringe) => {
    ctx.strokeStyle = rgb(0.11, 0.4);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 8, x1, y1 + 4);
    ctx.stroke();
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.floor(len / 3.6);
    const da = Math.atan2(y1 - y0, x1 - x0);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const x = x0 + (x1 - x0) * u;
      const y = y0 + (y1 - y0) * u + 8 * u * (1 - u);
      const gx = (x - ox) / 240;
      for (const sd of [-1, 1]) {
        const a = da + sd * (0.75 + R() * 0.45) + 0.15;
        const f = (0.36 + 0.5 * R()) * (Math.sin(a) < 0 ? 1.15 : 0.9) * (0.45 + 0.55 * Math.min(1, gx * 1.8));
        needle(x + (R() - 0.5) * 3, y + (R() - 0.5) * 3, a, 9 + 7 * R(), Math.min(1, f), 0.1 + (R() - 0.5) * 0.4, 2.2);
      }
    }
    if (fringe) {
      for (let k = 0; k < 5; k++) {
        const a = da + (R() - 0.5) * 1.5 + 0.2;
        needle(x1 + (R() - 0.5) * 6, y1 + (R() - 0.5) * 6, a, 12 + 9 * R(), Math.min(1, 0.55 + 0.4 * R()), 0.7 + (R() - 0.5) * 0.3, 2.8);
      }
    }
  };
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    twig(sx(t * 0.92), sy(t * 0.92), up[i][0], up[i][1] + 4, true);
    twig(sx(t * 0.92), sy(t * 0.92), dn[i][0], dn[i][1] - 4, true);
  }
  // the stem itself
  ctx.strokeStyle = rgb(0.12, 0.4);
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    if (i) ctx.lineTo(sx(t), sy(t));
    else ctx.moveTo(sx(t), sy(t));
  }
  ctx.stroke();
}

const atlasCache = new Map(); // kind -> { tex, users }

function buildAtlas(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = AW;
  canvas.height = AH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const R = rng(kind === 'pine' ? 7717 : 3313);
  const n = COLS * ROWS;
  for (let i = 0; i < n; i++) (kind === 'pine' ? drawSpray : drawLeafCluster)(ctx, (i % COLS) * TILE, Math.floor(i / COLS) * TILE, R);
  const base = new Uint8Array(ctx.getImageData(0, 0, AW, AH).data.buffer.slice(0));
  // colour under the see-through texels: the tile's mean, so bilinear edges do not go dark
  const CUT = 0.55;
  const cover0 = [];
  for (let t = 0; t < n; t++) {
    const tx = (t % COLS) * TILE;
    const ty = Math.floor(t / COLS) * TILE;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let sa = 0;
    let c = 0;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const o = ((ty + y) * AW + tx + x) * 4;
        const a = base[o + 3];
        sr += base[o] * a;
        sg += base[o + 1] * a;
        sb += base[o + 2] * a;
        sa += a;
        if (a >= CUT * 255) c++;
      }
    }
    cover0.push(c / (TILE * TILE));
    const mr = Math.round(sr / Math.max(1, sa));
    const mg = Math.round(sg / Math.max(1, sa));
    const mb = Math.round(sb / Math.max(1, sa));
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const o = ((ty + y) * AW + tx + x) * 4;
        if (base[o + 3] === 0) {
          base[o] = mr;
          base[o + 1] = mg;
          base[o + 2] = mb;
        }
      }
    }
  }
  // mip chain: colour averaged by alpha; alpha scaled per tile so the same share of texels stays solid
  const levels = [{ data: base, width: AW, height: AH }];
  let prev = { w: AW, h: AH, p: new Float32Array(AW * AH * 4) };
  for (let i = 0; i < AW * AH; i++) {
    const a = base[i * 4 + 3] / 255;
    prev.p[i * 4] = (base[i * 4] / 255) * a;
    prev.p[i * 4 + 1] = (base[i * 4 + 1] / 255) * a;
    prev.p[i * 4 + 2] = (base[i * 4 + 2] / 255) * a;
    prev.p[i * 4 + 3] = a;
  }
  for (let k = 1; AW >> k >= 1 || AH >> k >= 1; k++) {
    const w = Math.max(1, AW >> k);
    const h = Math.max(1, AH >> k);
    const pw = prev.w;
    const ph = prev.h;
    const p = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const xs = pw > w ? 2 : 1;
        const ys = ph > h ? 2 : 1;
        for (let c = 0; c < 4; c++) {
          let s = 0;
          for (let dy = 0; dy < ys; dy++) for (let dx = 0; dx < xs; dx++) s += prev.p[(((y * ys + dy) * pw) + x * xs + dx) * 4 + c];
          p[(y * w + x) * 4 + c] = s / (xs * ys);
        }
      }
    }
    prev = { w, h, p };
    const out = new Uint8Array(w * h * 4);
    const tk = TILE >> k; // tile size at this level (0 once a tile is under a texel)
    const scale = new Float32Array(n).fill(1);
    if (tk >= 1) {
      for (let t = 0; t < n; t++) {
        const tx = (t % COLS) * tk;
        const ty = Math.floor(t / COLS) * tk;
        const vals = [];
        for (let y = 0; y < tk; y++) for (let x = 0; x < tk; x++) vals.push(p[((ty + y) * w + tx + x) * 4 + 3]);
        let lo = 1;
        let hi = 8;
        for (let it = 0; it < 14; it++) {
          const mid = (lo + hi) / 2;
          let c = 0;
          for (const v of vals) if (v * mid >= CUT + 0.05) c++;
          if (c / vals.length >= cover0[t]) hi = mid;
          else lo = mid;
        }
        scale[t] = hi;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = p[i + 3];
        const t = tk >= 1 ? Math.min(ROWS - 1, Math.floor(y / tk)) * COLS + Math.min(COLS - 1, Math.floor(x / tk)) : 0;
        const inv = a > 1e-5 ? 1 / a : 0;
        out[i] = Math.round(Math.min(1, p[i] * inv) * 255);
        out[i + 1] = Math.round(Math.min(1, p[i + 1] * inv) * 255);
        out[i + 2] = Math.round(Math.min(1, p[i + 2] * inv) * 255);
        out[i + 3] = Math.round(Math.min(1, a * scale[t]) * 255);
      }
    }
    levels.push({ data: out, width: w, height: h });
    if (w === 1 && h === 1) break;
  }
  const tex = new THREE.DataTexture(base, AW, AH, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = levels;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function acquireAtlas(kind) {
  let e = atlasCache.get(kind);
  if (!e) {
    e = { tex: buildAtlas(kind), users: 0 };
    atlasCache.set(kind, e);
  }
  e.users++;
  return e.tex;
}

function releaseAtlas(kind) {
  const e = atlasCache.get(kind);
  if (e && --e.users <= 0) {
    e.tex.dispose();
    atlasCache.delete(kind);
  }
}

// ------------------------------------------------------------------ geometry builders
const gauss = (R) => (R() + R() + R() + R() - 2) * 1.2;

// leaf cards: four vertices each, all carrying the card's centre; the vertex shader spreads them into a quad
class Cards {
  constructor(R) {
    this.R = R;
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.uv = [];
    this.card = [];
    this.axis = [];
    this.n = 0;
    this.maxSize = 0;
  }

  // p centre, n bent normal, tint [r,g,b]; hl/hw half length/width (in tree heights); axis: a branch direction (sprays) or null (blobs spin)
  add(p, n, tint, hl, hw, axis, ext, tile) {
    const R = this.R;
    const t = tile ?? Math.floor(R() * COLS * ROWS);
    const u0 = ((t % COLS) * TILE + 1.5) / AW;
    const v0 = (Math.floor(t / COLS) * TILE + 1.5) / AH;
    const su = (TILE - 3) / AW;
    const sv = (TILE - 3) / AH;
    let ax = axis;
    if (!ax) {
      const a = R() * 6.2832;
      ax = [Math.cos(a), Math.sin(a), 0];
    }
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(n.x, n.y, n.z);
      this.col.push(tint[0], tint[1], tint[2]);
      this.uv.push(u0 + su * (0.5 + 0.5 * cx), v0 + sv * (0.5 - 0.5 * cy));
      this.card.push(cx, cy, hl, hw);
      this.axis.push(ax[0], ax[1], ax[2], ext);
    }
    this.n++;
    this.maxSize = Math.max(this.maxSize, hl, hw);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aCard', new THREE.Float32BufferAttribute(this.card, 4));
    g.setAttribute('aAxis', new THREE.Float32BufferAttribute(this.axis, 4));
    const idx = new Uint16Array(this.n * 6);
    for (let i = 0; i < this.n; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    // the vertices are card centres: make room for the cards and the sway
    g.boundingSphere.radius += this.maxSize * 1.5 + 0.06;
    return g;
  }
}

// trunks and limbs: tapered tubes (open ended: the ends are hidden in the ground and in the leaves)
class Wood {
  constructor(meanH) {
    this.meanH = meanH;
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.idx = [];
  }

  tube(pts, radii, sides) {
    const n = pts.length;
    const base = this.pos.length / 3;
    const tile = 2; // metres of bark texture: 'bark' is 2 m a tile
    const uTiles = Math.max(1, Math.round((2 * Math.PI * radii[0] * this.meanH) / tile));
    const t = new THREE.Vector3();
    const nv = new THREE.Vector3();
    const bv = new THREE.Vector3();
    const dir = new THREE.Vector3();
    let arc = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      t.subVectors(b, a).normalize();
      if (i === 0) nv.set(Math.abs(t.y) > 0.9 ? 1 : 0, Math.abs(t.y) > 0.9 ? 0 : 1, 0);
      nv.addScaledVector(t, -nv.dot(t)).normalize();
      bv.crossVectors(t, nv);
      if (i) arc += pts[i].distanceTo(pts[i - 1]);
      for (let k = 0; k <= sides; k++) {
        const ang = (k / sides) * Math.PI * 2;
        dir.copy(nv).multiplyScalar(Math.cos(ang)).addScaledVector(bv, Math.sin(ang));
        this.pos.push(pts[i].x + dir.x * radii[i], pts[i].y + dir.y * radii[i], pts[i].z + dir.z * radii[i]);
        this.nrm.push(dir.x, dir.y, dir.z);
        this.uv.push((k / sides) * uTiles, (arc * this.meanH) / tile);
      }
    }
    const row = sides + 1;
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const a = base + i * row + k;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        this.idx.push(a, b, c, b, d, c);
      }
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.boundingSphere.radius += 0.06;
    return g;
  }
}

const fib = (i, n) => {
  const y = 1 - ((i + 0.5) / n) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const th = i * 2.399963;
  return [Math.cos(th) * r, y, Math.sin(th) * r];
};

// a broadleaf tree, height 1: trunk to about 0.34, a crown centred at 0.63 (0.72 wide, 0.56 tall)
const RC = { cy: 0.63, rx: 0.37, ry: 0.29 };
const RC_FAR = { cy: 0.56, rx: 0.36, ry: 0.36 };

function roundTree(seed, far, detail, fine, meanH) {
  const R = rng(seed);
  const { cy, rx, ry } = far ? RC_FAR : RC;
  const cards = new Cards(R);
  const wood = new Wood(meanH);
  const C = new THREE.Vector3(0, cy, 0);
  const ell = (p) => Math.hypot(p.x / rx, (p.y - cy) / ry, p.z / rx);
  const cardScale = 1 - 0.3 * fine;

  // skeleton: a slightly leaning trunk, a fork, limbs that reach into the crown, a side branch or two on each
  const tips = [];
  const forkY = (far ? 0.26 : 0.31) + R() * 0.05;
  const lean = [(R() - 0.5) * 0.05, (R() - 0.5) * 0.05];
  const trunkY = [0, 0.05, 0.14, 0.24, forkY];
  const trunkR = [0.052, 0.033, 0.027, 0.0235, 0.021];
  const trunkP = trunkY.map((y) => {
    const k = Math.pow(y / forkY, 1.6);
    return new THREE.Vector3(lean[0] * k + (R() - 0.5) * 0.006, y, lean[1] * k + (R() - 0.5) * 0.006);
  });
  const fork = trunkP[4].clone();
  if (far) {
    wood.tube(trunkP.slice(0, 4).concat([fork.clone().add(new THREE.Vector3(0, 0.05, 0))]), [0.05, 0.034, 0.028, 0.024, 0.02], 4);
  } else {
    // the trunk carries on a little past the fork, tapering shut, so the limbs grow out of solid wood
    wood.tube(trunkP.concat([fork.clone().add(new THREE.Vector3(0, 0.035, 0))]), trunkR.concat([0.007]), 8);
  }
  const nLimb = 4 + (R() < 0.55 ? 1 : 0);
  const a0 = R() * 6.28;
  for (let i = 0; i < nLimb; i++) {
    const a = a0 + (i / nLimb) * 6.283 + (R() - 0.5) * 0.7;
    let el = 0.5 + R() * 0.45;
    const L = 0.27 + R() * 0.1;
    const pts = [];
    const radii = [];
    const p = fork.clone();
    for (let j = 0; j <= 4; j++) {
      const t = j / 4;
      pts.push(p.clone());
      radii.push(Math.max(0.0035, 0.0185 * (1 - 0.78 * t)));
      el += 0.16 * (1 - t) * 0.2 + 0.06;
      const e = Math.min(1.3, el);
      p.x += Math.cos(a) * Math.cos(e) * (L / 4);
      p.y += Math.sin(e) * (L / 4);
      p.z += Math.sin(a) * Math.cos(e) * (L / 4);
    }
    // keep the tip inside the crown
    const tip = pts[4];
    const e = ell(tip);
    if (e > 0.92) {
      for (const q of pts) {
        q.x *= 0.92 / e;
        q.z *= 0.92 / e;
      }
    }
    if (!far) wood.tube(pts, radii, 5);
    tips.push(pts[4].clone(), pts[3].clone());
    // a side branch at the middle, one further out
    for (const [at, sgn] of [[2, i % 2 ? 1 : -1], [3, i % 2 ? -1 : 1]]) {
      if (R() < 0.35) continue;
      const q0 = pts[at];
      const sa = a + sgn * (0.6 + R() * 0.5);
      const sl = 0.13 + R() * 0.07;
      const sp = [q0.clone()];
      const sr = [radii[at] * 0.72];
      for (let j = 1; j <= 3; j++) {
        const t = j / 3;
        sp.push(new THREE.Vector3(q0.x + Math.cos(sa) * sl * t * 0.9, q0.y + sl * t * (0.55 + 0.25 * t), q0.z + Math.sin(sa) * sl * t * 0.9));
        sr.push(Math.max(0.003, sr[0] * (1 - 0.7 * t)));
      }
      const se = ell(sp[3]);
      if (se > 0.95) for (const q of sp) { q.x *= 0.95 / se; q.z *= 0.95 / se; }
      if (!far) wood.tube(sp, sr, 4);
      tips.push(sp[3].clone());
    }
  }

  const nc = new THREE.Vector3();
  const nl = new THREE.Vector3();
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  const addLobe = (lc, rad, count, size, shade) => {
    for (let i = 0; i < count; i++) {
      p.set(gauss(R), gauss(R) * 0.8, gauss(R)).multiplyScalar(rad).add(lc);
      const e0 = ell(p);
      if (e0 > 1.1) p.sub(C).multiplyScalar(1.1 / e0).add(C);
      const e = ell(p);
      nc.set(p.x / (rx * rx), (p.y - cy) / (ry * ry), p.z / (rx * rx)).normalize();
      nl.subVectors(p, lc);
      if (nl.lengthSq() < 1e-6) nl.copy(nc);
      nl.normalize();
      n.copy(nc).multiplyScalar(0.55).addScaledVector(nl, 0.55);
      n.x += (R() - 0.5) * 0.25;
      n.y += 0.08 + (R() - 0.5) * 0.25;
      n.z += (R() - 0.5) * 0.25;
      n.normalize();
      const up = (p.y - cy) / ry;
      // dark inside and underneath, each lobe darker on its own underside too
      const lobeUp = rad > 0.05 ? (p.y - lc.y) / rad : 0;
      const ao = (0.09 + 0.91 * smoothstep(0.15, 1.0, e)) * (0.32 + 0.68 * smoothstep(-1.0, 0.5, up)) * (0.6 + 0.4 * smoothstep(-1.2, 0.8, lobeUp));
      const h = fbm3(p.x * 3.1 + 5, p.y * 3.1, p.z * 3.1, 2, seed) * 2.2 + up * 0.5;
      const br = ao * shade * (0.86 + 0.28 * R());
      const s = size * (0.85 + 0.3 * R()) * cardScale;
      cards.add(p, n, [br * (1 + 0.1 * h), br * (1 + 0.03 * h), br * (1 - 0.24 * h)], s, s, null, smoothstep(0.5, 1.0, e));
    }
  };

  const nShell = far ? 9 : Math.round(30 * detail);
  const total = Math.ceil(nShell * 1.3);
  const lobeR = far ? 0.15 : 0.115;
  const per = far ? 3 : Math.max(4, Math.round(10 * (1 + 0.5 * fine) * detail));
  const size = far ? 0.19 : 0.095;
  for (let i = 0; i < total; i++) {
    const d = fib(i, total);
    if (d[1] < -0.45) continue;
    const g = 0.66 + 0.3 * R();
    const bump = 1 + 0.16 * fbm3(d[0] * 2.2 + 3, d[1] * 2.2, d[2] * 2.2, 2, seed + 9) * 2;
    const lc = new THREE.Vector3(d[0] * rx * g * bump, cy + d[1] * ry * g * bump, d[2] * rx * g * bump);
    const lv = 0.75 + 0.5 * R();
    addLobe(lc, lobeR * lv, Math.max(2, Math.round(per * lv)), size * (0.85 + 0.3 * lv), 0.85 + 0.3 * R());
  }
  if (!far) {
    for (const t of tips) addLobe(t, 0.085, Math.max(3, Math.round(6 * detail)), 0.09, 0.95);
    // the inside: dark cards so nothing shows through the middle of the crown
    for (let i = 0; i < Math.round(26 * detail); i++) {
      const d = fib(i, Math.round(26 * detail));
      const g = 0.15 + R() * 0.45;
      addLobe(new THREE.Vector3(d[0] * rx * g, cy + d[1] * ry * g, d[2] * rx * g), 0.02, 1, 0.13, 0.8);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const d = fib(i, 4);
      addLobe(new THREE.Vector3(d[0] * rx * 0.3, cy + d[1] * ry * 0.3, d[2] * rx * 0.3), 0.02, 1, 0.22, 0.8);
    }
  }
  return { crown: cards.build(), wood: wood.build(), cards: cards.n };
}

// a pine, height 1: a thin straight trunk, whorls of drooping needle sprays (long ones alternating with short ones, so the
// tiers show; the gap between tiers follows the tier's width, so the trunk is covered right up to the spire), narrowing to a spire
function pineTree(seed, far, detail, fine) {
  const R = rng(seed);
  const cards = new Cards(R);
  const Y0 = 0.045;
  const Y1 = 0.93;
  const RMAX = far ? 0.25 : 0.23;
  const radAt = (y) => RMAX * Math.pow(Math.max(0, 1 - (y - Y0) / (Y1 - Y0)), 0.9) + 0.02;
  const gapK = far ? 0.45 : 0.42 / (1 + 0.35 * fine) / (0.75 + 0.25 * detail);
  const minGap = far ? 0.05 : 0.02 / (0.75 + 0.25 * detail);
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  const spray = (y, a, len, droop, lift, bright, ext, hwK) => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const cd = Math.cos(droop);
    const sd = Math.sin(droop);
    const ax = [ca * cd, -sd, sa * cd];
    p.set(ax[0] * (len * 0.5 + 0.006), y + ax[1] * (len * 0.5) + lift, ax[2] * (len * 0.5 + 0.006));
    n.set(ca * 0.8, 0.5 + lift * 14 + (0.3 - droop) * 0.6, sa * 0.8).normalize();
    const hl = len * 0.53;
    const br = bright * (0.8 + 0.3 * R());
    const h = R() - 0.5;
    cards.add(p, n, [br * (1 + 0.12 * h), br * (1 + 0.03 * h), br * (1 - 0.3 * h)], hl, hl * hwK, ax, ext);
  };
  let y = Y0 + 0.02;
  for (let j = 0; y < Y1 - 0.025; j++) {
    const tt = (y - Y0) / (Y1 - Y0);
    const rad0 = radAt(y);
    const rad = rad0 * (j % 2 === 0 ? 1 : 0.78) * (0.92 + 0.16 * R());
    const count = Math.max(4, Math.round(THREE.MathUtils.lerp(far ? 7 : 11, far ? 4 : 5, tt) * (1 + 0.4 * fine) * (far ? 1 : 0.8 + 0.2 * detail)));
    const twist = R() * 6.283;
    const shade = 0.5 + 0.5 * Math.sqrt(tt);
    for (let k = 0; k < count; k++) {
      const a = twist + ((k + (R() - 0.5) * 0.5) / count) * 6.283;
      const len = rad * (0.9 + R() * 0.35) * (far ? 1.15 : 1);
      const droop = THREE.MathUtils.lerp(0.62, 0.22, tt) + (R() - 0.5) * 0.2;
      spray(y, a, len, droop, 0, shade, 0.5 + 0.5 * tt, far ? 1.3 : 1.25);
      if (!far && R() < 0.6) {
        // a shorter spray above it, angled up a little: the depth of a real branch
        spray(y, a + (R() - 0.5) * 0.6, len * 0.72, droop - 0.3, 0.012, shade * 1.12, 0.6 + 0.4 * tt, 1);
      }
    }
    if (!far) {
      // the dark inside of the tier, so the trunk does not show through
      for (let k = 0; k < 4; k++) spray(y - 0.012, ((k + R() * 0.6) / 4) * 6.283, rad * 0.7, 0.55, 0, shade * 0.5, 0.2, 1.35);
    }
    y += Math.max(minGap, rad0 * gapK);
  }
  // the leader, with a small skirt round its foot
  for (let k = 0; k < (far ? 3 : 4); k++) spray(Y1 - 0.05, (k / (far ? 3 : 4)) * 6.283 + R(), 0.05, 0.3, 0, 0.9, 1, 1.2);
  spray(Y1 - 0.06, 0, 0.09, -1.35, 0, 0.9, 1, 0.55);
  return { crown: cards.build(), cards: cards.n };
}

function pineWood(meanH, far) {
  const wood = new Wood(meanH);
  const rings = far ? 3 : 8;
  const pts = [];
  const radii = [];
  for (let i = 0; i < rings; i++) {
    const y = (i / (rings - 1)) * 0.9;
    pts.push(new THREE.Vector3(0, y, 0));
    radii.push(0.0145 * Math.pow(1 - y / 1.05, 1.1) + 0.0028 + 0.012 * Math.exp(-y / 0.04));
  }
  wood.tube(pts, radii, far ? 4 : 8);
  return wood.build();
}

// ------------------------------------------------------------------ shaders
const SWAY = `
uniform float uTime;
uniform float uWind;
${BLAST_GLSL}
// a small tree close to a burst leans away and swings back (a big one hardly notices)
vec2 treeKick(float hgt, vec3 root, float sy) {
  return blastSway(root.xz, uTime, 1.3, 2.4) * hgt * hgt * min(sy, 0.45) * 0.1;
}
// the whole tree bends in the wind, most at the top (hgt is in tree heights, sy the tree's height in metres)
float treeSway(float hgt, vec3 root, float sy) {
  float ph = root.x * 0.37 + root.z * 0.23;
  float sw = (sin(uTime * 0.7 + ph) * 0.6 + sin(uTime * 1.7 + ph * 2.0) * 0.25) * (0.3 + abs(uWind) * 1.5) + uWind * 0.6;
  return sw * hgt * hgt * sy * 0.016;
}`;

// turns each card's four vertices into a view-facing quad; needs `mvPosition` declared by the caller's chunk
function cardVertex(spray) {
  return `
#define FACE_ON 0.38
vec3 cT = position;
float sxz = length(instanceMatrix[0].xyz);
float sy = length(instanceMatrix[1].xyz);
float fh = fract(sin(dot(cT, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
float ft = uTime * (1.3 + fh * 1.2) + fh * 40.0;
cT += vec3(sin(ft), sin(ft * 1.3 + 1.0) * 0.6, cos(ft * 0.9)) * (0.003 + 0.005 * abs(uWind)) * (0.3 + cT.y);
vec4 wp = instanceMatrix * vec4(cT, 1.0);
wp.x += treeSway(max(cT.y, 0.0), instanceMatrix[3].xyz, sy);
wp.xz += treeKick(max(cT.y, 0.0), instanceMatrix[3].xyz, sy);
vec3 mvC = (modelViewMatrix * wp).xyz;
float sz = 0.5 * (sxz + sy);
${spray ? `
// a spray is a flat fan along its branch: as it is in the world (thin from the side, full from above or below),
// with some of the face-on version blended in so it never goes edge-on
vec3 axO = aAxis.xyz;
vec3 acO = normalize( vec3( -axO.z, 0.0, axO.x ) + vec3( 0.0001, 0.0, 0.0 ) );
mat3 Mv = mat3( modelViewMatrix ) * mat3( instanceMatrix );
vec3 Av = Mv * axO;
vec3 offF = Av * ( aCard.x * aCard.z ) + ( Mv * acO ) * ( aCard.y * aCard.w );
vec3 axV = normalize( mat3( modelViewMatrix ) * ( mat3( instanceMatrix ) * axO ) );
float pl = length( axV.xy );
vec2 ad = pl > 0.001 ? axV.xy / pl : vec2( 0.0, -1.0 );
float lk = mix( 0.5, 1.0, smoothstep( 0.0, 0.75, pl ) );
vec2 pd = vec2( -ad.y, ad.x ) * ( ad.x < 0.0 ? -1.0 : 1.0 );
vec3 offV = vec3( ( ad * ( aCard.x * aCard.z * lk ) + pd * ( aCard.y * aCard.w ) ) * sz, 0.0 );
vec3 off = mix( offF, offV, FACE_ON );
vec3 mvP = mvC + off + vec3( 0.0, 0.0, -0.16 * sz * aCard.z * dot( aCard.xy, aCard.xy ) );
vCard = vec3( off.xy / ( sz * aCard.z * 1.05 ), aAxis.w );` : `
vec2 rq = vec2(aCard.x * aAxis.x - aCard.y * aAxis.y, aCard.x * aAxis.y + aCard.y * aAxis.x);
vec3 mvP = mvC + vec3(rq * (aCard.z * sz), -0.16 * sz * aCard.z * dot(aCard.xy, aCard.xy));
vCard = vec3(rq, aAxis.w);`}
vec4 mvPosition = vec4(mvP, 1.0);
gl_Position = projectionMatrix * mvPosition;`;
}

const CARD_ATTRS = `
attribute vec4 aCard;
attribute vec4 aAxis;
varying vec3 vCard;`;

// ------------------------------------------------------------------ the class
// list: [{ x, y, z, h, wide? }]  look: { kind: 'round' | 'pine', far: cheap crowns for the thousands beyond 150 m, colors: [hex...],
//   trunk: hex, variants, seed, snow: 0..1 (a dusting of snow on whatever faces up),
//   shadow: true (trees that cast shadows, for the toy-sized ones near the lane),
//   leafScale: 1 (finer, denser sprays and clumps for toy-sized trees: ~6), detail: 0..1 (fewer cards on slower devices) }
export class Trees {
  constructor({ list, look = {}, quality = null }) {
    const L = { kind: 'round', colors: [0x4d7a26, 0x5f8d2c, 0x3f6b24, 0x74a03a], trunk: 0x5a4632, variants: 3, seed: 5, far: false, snow: 0, shadow: false, leafScale: 1, detail: null, ...look };
    this.snow = L.snow;
    this.leafScale = L.leafScale;
    this.kind = L.kind === 'pine' ? 'pine' : 'round';
    const pine = this.kind === 'pine';
    const R = rng(L.seed);
    let tier = quality?.tier;
    if (!tier) {
      try {
        tier = detectQuality().tier;
      } catch (e) {
        tier = 'high';
      }
    }
    const detail = L.detail ?? (tier === 'low' ? 0.55 : tier === 'medium' ? 0.8 : 1);
    const fine = Math.max(0, Math.min(1, (L.leafScale - 1) / 5));
    this.uniforms = { ...blastUniforms, uTime: { value: 0 }, uWind: { value: 0 }, uSnow: { value: L.snow } };
    this.atlas = acquireAtlas(this.kind);
    let meanH = 0;
    for (const t of list) meanH += t.h;
    meanH = list.length ? meanH / list.length : 1;

    const built = [];
    for (let i = 0; i < L.variants; i++) built.push(pine ? pineTree(L.seed * 31 + i, L.far, detail, fine) : roundTree(L.seed * 31 + i, L.far, detail, fine, meanH));
    // per variant wood for the broadleaf trees (their limbs differ); the pines share a trunk
    const sharedWood = pine ? pineWood(meanH, L.far) : L.far ? built[0].wood : null;
    this.geometries = built.map((b) => b.crown);
    if (sharedWood) this.geometries.push(sharedWood);
    else for (const b of built) this.geometries.push(b.wood);
    this.stats = { cardsPerCrown: built.map((b) => b.cards), variants: built.length };

    this.crownMat = this.crownMaterial(pine);
    this.woodMat = this.woodMaterial(L.trunk);
    const depthMat = L.shadow ? this.depthMaterial(pine) : null;
    this.depthMat = depthMat;

    const byShape = built.map(() => []);
    list.forEach((t, i) => byShape[i % built.length].push({ t, i }));
    this.meshes = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    const shared = sharedWood ? new THREE.InstancedMesh(sharedWood, this.woodMat, Math.max(1, list.length)) : null;
    built.forEach((b, k) => {
      const items = byShape[k];
      const crown = new THREE.InstancedMesh(b.crown, this.crownMat, Math.max(1, items.length));
      const wood = shared ? null : new THREE.InstancedMesh(b.wood, this.woodMat, Math.max(1, items.length));
      crown.count = items.length;
      if (wood) wood.count = items.length;
      items.forEach(({ t, i }, j) => {
        q.setFromAxisAngle(up, R() * Math.PI * 2);
        const w = t.h * (0.85 + R() * 0.35) * (t.wide ?? 1);
        m4.compose(pos.set(t.x, t.y - t.h * 0.02, t.z), q, s.set(w, t.h, w));
        crown.setMatrixAt(j, m4);
        wood?.setMatrixAt(j, m4);
        shared?.setMatrixAt(i, m4);
        crown.setColorAt(j, c.set(L.colors[Math.floor(R() * L.colors.length)]).multiplyScalar(0.9 + R() * 0.2));
      });
      crown.name = `trees-${k}`;
      if (depthMat) crown.customDepthMaterial = depthMat;
      this.meshes.push(crown);
      if (wood) {
        wood.name = `wood-${k}`;
        this.meshes.push(wood);
      }
    });
    if (shared) {
      shared.count = list.length;
      shared.name = 'trunks';
      this.meshes.push(shared);
    }
    for (const m of this.meshes) {
      m.castShadow = L.shadow;
      m.receiveShadow = false;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere?.();
    }
    this.group = new THREE.Group();
    this.group.add(...this.meshes);
    this.instances = list.length;
    // the bark: plain wood at first, textured wood (a fresh material) when the pictures arrive
    this.trunkColor = L.trunk;
    loadPBR('bark', { repeat: 1, anisotropy: 4 })
      .then((set) => {
        if (this.disposed) return;
        const old = this.woodMat;
        this.woodMat = this.woodMaterial(this.trunkColor, set);
        for (const m of this.meshes) if (m.material === old) m.material = this.woodMat;
        old.dispose();
      })
      .catch(() => {});
  }

  crownMaterial(pine) {
    const snow = this.snow > 0;
    const mat = new THREE.MeshStandardMaterial({
      map: this.atlas, vertexColors: true, roughness: 0.86, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>${SWAY}${CARD_ATTRS}`)
        .replace('#include <project_vertex>', cardVertex(pine));
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vCard;
uniform float uSnow;`)
        .replace('#include <map_fragment>', `vec4 leafTex = texture2D( map, vMapUv, ${pine ? '0.35' : '-0.3'} );
diffuseColor.a *= leafTex.a;
diffuseColor.rgb *= leafTex.rgb * ${pine ? '1.4' : '1.38'};
float leafLum = dot( leafTex.rgb, vec3( 0.333 ) );`)
        .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'))
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // each card is a little dome facing the camera, on top of the crown's own bent normal
  vec2 cq = vCard.xy;
  float r2 = min( dot( cq, cq ), 1.6 );
  vec3 dome = normalize( vec3( cq * 0.9, sqrt( max( 0.1, 1.15 - r2 * 0.75 ) ) ) );
  normal = normalize( normal * 0.95 + dome * 0.7 );${snow ? `
  // snow settles on whatever faces up, in ragged clumps that follow the leaves
  vec3 wn = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  float sm = smoothstep( 0.0, 0.3, wn.y + ( leafLum - 0.45 ) + uSnow * 0.5 - 0.72 );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.88, 0.91, 0.99 ) * mix( 1.0, vColor.r, 0.3 ), sm );` : ''}
}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // light through the leaves: where the sun is on the far side of a leaf, and round the edge of the crown against the sun
  vec3 vd = normalize( vViewPosition );
  vec3 tr = vec3( 0.0 );
  #if NUM_DIR_LIGHTS > 0
  for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
    vec3 Ld = directionalLights[ i ].direction;
    float through = clamp( - dot( normal, Ld ), 0.0, 1.0 );
    float rim = pow( clamp( - dot( Ld, vd ), 0.0, 1.0 ), 2.0 );
    tr += directionalLights[ i ].color * ( through * 0.3 + rim * 0.6 );
  }
  #endif
  totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.0, 1.0, 0.62 ) * tr * ( 0.015 + 0.07 * vCard.z );
}`);
    };
    mat.customProgramCacheKey = () => `tree-crown-${pine ? 'spray' : 'blob'}${snow ? '-snow' : ''}`;
    return mat;
  }

  // the crown's shadow: the same cards, cut out
  depthMaterial(pine) {
    const mat = new THREE.MeshDepthMaterial();
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>${SWAY}${CARD_ATTRS}`)
        .replace('#include <project_vertex>', cardVertex(pine));
    };
    mat.customProgramCacheKey = () => `tree-depth-${pine ? 'spray' : 'blob'}`;
    return mat;
  }

  woodMaterial(trunk, set = null) {
    const col = new THREE.Color(trunk);
    const hsl = {};
    col.getHSL(hsl);
    col.setHSL(hsl.h, hsl.s * 0.45, Math.min(0.5, hsl.l * (set ? (this.kind === 'pine' ? 1.15 : 1.5) : 1)));
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 1, metalness: 0 });
    if (set) {
      mat.map = set.map;
      mat.normalMap = set.normalMap;
      mat.roughnessMap = set.ormMap;
    }
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>${SWAY}`)
        .replace('#include <project_vertex>', `vec4 wp = instanceMatrix * vec4( transformed, 1.0 );
wp.x += treeSway( max( transformed.y, 0.0 ), instanceMatrix[3].xyz, length( instanceMatrix[1].xyz ) );
wp.xz += treeKick( max( transformed.y, 0.0 ), instanceMatrix[3].xyz, length( instanceMatrix[1].xyz ) );
vec4 mvPosition = modelViewMatrix * wp;
gl_Position = projectionMatrix * mvPosition;`);
    };
    mat.customProgramCacheKey = () => (set ? 'tree-wood-bark' : 'tree-wood');
    return mat;
  }

  update(dt, time, world) {
    this.uniforms.uTime.value = time;
    this.uniforms.uWind.value = world.wind ?? 0;
  }

  dispose() {
    this.disposed = true;
    for (const g of this.geometries) g.dispose();
    for (const m of this.meshes) m.dispose?.();
    this.crownMat.dispose();
    this.woodMat.dispose();
    this.depthMat?.dispose();
    releaseAtlas(this.kind);
  }
}

// scatter trees where fn(x, z) says (0..1 density) on the ground
export function scatterTrees({ count, area, density, heightAt, size = [4, 8], seed = 3, minGap = 2 }) {
  const R = rng(seed);
  const out = [];
  const taken = new Set(); // one tree per minGap cell, so they never overlap
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const x = area[0] + R() * (area[1] - area[0]);
    const z = area[2] + R() * (area[3] - area[2]);
    if (R() > density(x, z)) continue;
    let ok = true;
    const key = `${Math.floor(x / minGap)},${Math.floor(z / minGap)}`;
    if (taken.has(key)) ok = false;
    if (!ok) continue;
    taken.add(key);
    out.push({ x, y: heightAt(x, z), z, h: size[0] + R() * (size[1] - size[0]) });
  }
  return out;
}
