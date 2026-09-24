// The garden beyond the fence: a clipped hedge, a couple of trees, a far
// tree line and fields. The fog and depth of field soften all of it, so it is
// cheap: leaf cards (camera-agnostic quads with canopy-shaped normals so the
// crowns shade as volumes), low-poly trunks and a silhouette strip.
import * as THREE from 'three';
import { noise2, fbm } from '../../shared.js';

// ---------------------------------------------------------------- leaf cards

// Collects leaf cards into one geometry. Each card is a quad centred on `p`,
// turned to face `facing`, rolled by `roll`, textured from one tile of the
// 2 x 2 leaf atlas, with a shared canopy normal and a shade colour.
export class Cards {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.count = 0;
  }

  add(p, facing, roll, w, h, tile, normal, shade = 1) {
    const f = facing.clone().normalize();
    const ref = Math.abs(f.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(ref, f).normalize();
    const upv = new THREE.Vector3().crossVectors(f, right).normalize();
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    const rx = right.clone().multiplyScalar(c).addScaledVector(upv, s).multiplyScalar(w / 2);
    const uy = upv.clone().multiplyScalar(c).addScaledVector(right, -s).multiplyScalar(h / 2);
    const u0 = (tile % 2) * 0.5 + 0.004;
    const v0 = (tile < 2 ? 0.5 : 0) + 0.004;
    const d = 0.492;
    const corners = [
      [-1, -1, u0, v0],
      [1, -1, u0 + d, v0],
      [1, 1, u0 + d, v0 + d],
      [-1, 1, u0, v0 + d],
    ];
    const col = typeof shade === 'number' ? [shade, shade, shade] : shade;
    for (const [a, b, u, v] of corners) {
      this.pos.push(p.x + rx.x * a + uy.x * b, p.y + rx.y * a + uy.y * b, p.z + rx.z * a + uy.z * b);
      this.nor.push(normal.x, normal.y, normal.z);
      this.uv.push(u, v);
      this.col.push(col[0], col[1], col[2]);
    }
    this.count++;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const idx = new Uint32Array(this.count * 6);
    for (let i = 0; i < this.count; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const rv = (rnd) => new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(2);

// ---------------------------------------------------------------- hedge

// A clipped hedge with a softly lumpy face and a slightly wavering top, its
// front edge along z, running x0..x1. Returns the body geometry; leaf cards
// for a broken, leafy outline go into `cards`.
export function hedge({ z, x0, x1, h = 1.7, depth = 0.8 }, rnd, cards, density = 1) {
  const prof = [
    [0.02, -0.05],
    [0.05, 0.3],
    [0.05, h * 0.55],
    [0.03, h - 0.16],
    [-0.06, h - 0.03],
    [-depth * 0.5, h + 0.01],
    [-depth + 0.06, h - 0.03],
    [-depth - 0.02, h - 0.2],
    [-depth, -0.05],
  ];
  // arc length along the profile for v
  const arc = [0];
  for (let i = 1; i < prof.length; i++) arc.push(arc[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const step = 0.14;
  const cols = Math.ceil((x1 - x0) / step) + 1;
  const rows = prof.length;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const col = new Float32Array(cols * rows * 3);
  const seed = rnd() * 50;
  const topAt = (x) => (fbm(x * 0.35 + seed, 3.1, 3) - 0.5) * 0.14;
  for (let i = 0; i < cols; i++) {
    const x = x0 + (i / (cols - 1)) * (x1 - x0);
    for (let j = 0; j < rows; j++) {
      const [dz, y0] = prof[j];
      const y = y0 + topAt(x) * Math.max(0, y0 / h);
      // lumps: clipped, but not by a machine
      const lump = (fbm(x * 1.4 + seed, y * 1.4, 3) - 0.5) * 0.12 + (noise2(x * 4.5, y * 4.5 + seed) - 0.5) * 0.04;
      const o = j * cols + i;
      const side = j <= 4 ? 1 : -1;
      pos[o * 3] = x;
      pos[o * 3 + 1] = y + (j === 5 ? lump * 0.5 : 0);
      pos[o * 3 + 2] = z + dz + (j > 0 && j < rows - 1 && j !== 5 ? lump * side : 0);
      uv[o * 2] = x / 0.8;
      uv[o * 2 + 1] = arc[j] / 0.8;
      const ao = 0.42 + 0.58 * Math.min(1, Math.max(0, y / 0.9));
      const k = ao * (0.9 + 0.2 * noise2(x * 0.8 + seed, y * 0.8));
      col.set([k, k, k * 0.95], o * 3);
    }
  }
  const idx = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();

  // leaf sprays on the face and along the top edge
  const nrm = g.attributes.normal;
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const per = Math.round(5 * density);
  for (let i = 0; i < cols - 1; i++) {
    for (let k = 0; k < per; k++) {
      // mostly along the top edges, a few on the face
      const j = rnd() < 0.25 ? 1 + Math.floor(rnd() * 3) : 3 + Math.floor(rnd() * 4);
      const f = rnd();
      const a = j * cols + i;
      const b = (j + 1 < rows ? j + 1 : j) * cols + i;
      P.fromBufferAttribute(g.attributes.position, a).lerp(P.clone().fromBufferAttribute(g.attributes.position, b), f);
      P.x += rnd() * step;
      N.fromBufferAttribute(nrm, a).normalize();
      if (P.y < 0.25) continue;
      const facing = N.clone().add(rv(rnd).multiplyScalar(0.7));
      const s = 0.22 + rnd() * 0.14;
      P.addScaledVector(N, 0.01 + rnd() * 0.04);
      const n = N.clone().add(new THREE.Vector3(0, 0.25, 0)).normalize();
      const onTop = N.y > 0.5;
      const shade = Math.min(1.05, (onTop ? 0.95 : 0.55 + 0.25 * Math.min(1, P.y / 1.2)) * (0.85 + rnd() * 0.25));
      cards.add(P.clone(), facing, rnd() * 6.28, s, s, 0, n, shade);
    }
  }
  return g;
}

// ---------------------------------------------------------------- trees

// A tapered, gently bending limb along `path` (Vector3s), radius r0 -> r1.
// UV: u around, v along the length in metres.
export function limb(path, r0, r1, radial = 7) {
  const rows = path.length;
  const cols = radial + 1;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const col = new Float32Array(rows * cols * 3);
  let len = 0;
  const T = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let j = 0; j < rows; j++) {
    if (j > 0) len += path[j].distanceTo(path[j - 1]);
    const t = j / (rows - 1);
    const r = r0 + (r1 - r0) * t;
    T.subVectors(path[Math.min(rows - 1, j + 1)], path[Math.max(0, j - 1)]).normalize();
    A.set(0, 0, 1);
    if (Math.abs(T.dot(A)) > 0.9) A.set(1, 0, 0);
    B.crossVectors(T, A).normalize();
    A.crossVectors(B, T).normalize();
    for (let i = 0; i < cols; i++) {
      const a = (i / radial) * Math.PI * 2;
      const o = j * cols + i;
      const flare = j === 0 ? 1.25 : 1;
      pos[o * 3] = path[j].x + (Math.cos(a) * A.x + Math.sin(a) * B.x) * r * flare;
      pos[o * 3 + 1] = path[j].y + (Math.cos(a) * A.y + Math.sin(a) * B.y) * r * flare;
      pos[o * 3 + 2] = path[j].z + (Math.cos(a) * A.z + Math.sin(a) * B.z) * r * flare;
      uv[o * 2] = i / radial;
      uv[o * 2 + 1] = len;
      const k = 0.6 + 0.4 * Math.min(1, path[j].y / 1.5);
      col.set([k, k, k], o * 3);
    }
  }
  const idx = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < radial; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function bendPath(from, to, n, wander, rnd) {
  const pts = [];
  const ph = rnd() * 6.28;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = from.clone().lerp(to, t);
    p.x += Math.sin(t * 3 + ph) * wander * t;
    p.z += Math.cos(t * 2.3 + ph) * wander * t;
    pts.push(p);
  }
  return pts;
}

// A tree: 'birch' (slender, white, airy) or 'broad' (apple or oak: short
// trunk, three main limbs, a big dome). Returns { trunk: [geos], bark }
// and adds the crown to `cards`.
export function tree({ x, z, h = 7, kind = 'broad' }, rnd, cards, density = 1) {
  const trunk = [];
  const base = new THREE.Vector3(x, -0.1, z);
  const birch = kind === 'birch';
  const top = new THREE.Vector3(x + (rnd() - 0.5) * 0.6, h * (birch ? 0.92 : 0.45), z + (rnd() - 0.5) * 0.4);
  trunk.push(limb(bendPath(base, top, birch ? 8 : 5, birch ? 0.25 : 0.2, rnd), birch ? 0.14 : 0.3, birch ? 0.03 : 0.18));
  const blobs = [];
  if (birch) {
    for (let i = 0; i < 5; i++) {
      const y = h * (0.45 + i * 0.11);
      blobs.push({ c: new THREE.Vector3(x + (rnd() - 0.5) * 0.9, y, z + (rnd() - 0.5) * 0.9), r: new THREE.Vector3(1.1 + rnd() * 0.5, 1.0 + rnd() * 0.4, 1.1 + rnd() * 0.5) });
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rnd();
      const end = new THREE.Vector3(x + Math.cos(a) * h * 0.26, h * (0.72 + rnd() * 0.1), z + Math.sin(a) * h * 0.2);
      trunk.push(limb(bendPath(top, end, 5, 0.3, rnd), 0.15, 0.05, 6));
      blobs.push({ c: end.clone(), r: new THREE.Vector3(1.9 + rnd() * 0.5, 1.5 + rnd() * 0.4, 1.8 + rnd() * 0.5) });
    }
    blobs.push({ c: new THREE.Vector3(x, h * 0.8, z), r: new THREE.Vector3(2.2, 1.6, 2.0) });
  }
  const tile = birch ? 1 : 2;
  const count = Math.round((birch ? 380 : 620) * density);
  const P = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const b = blobs[i % blobs.length];
    // points biased to the outside of each blob, where the leaves are
    const d = rv(rnd).normalize();
    const rr = Math.pow(rnd(), 0.35);
    P.set(d.x * b.r.x * rr, d.y * b.r.y * rr, d.z * b.r.z * rr).add(b.c);
    const n = new THREE.Vector3((P.x - b.c.x) / b.r.x, (P.y - b.c.y) / b.r.y + 0.35, (P.z - b.c.z) / b.r.z).normalize();
    const s = (birch ? 0.55 : 0.75) * (0.8 + rnd() * 0.45);
    // inner leaves sit in the crown's shade, top leaves catch the sky
    const shade = (0.45 + 0.55 * rr) * (0.85 + 0.25 * Math.max(0, n.y)) * (0.9 + rnd() * 0.2);
    cards.add(P.clone(), n.clone().add(rv(rnd).multiplyScalar(0.8)), rnd() * 6.28, s, s, tile, n, shade);
  }
  return { trunk, bark: birch ? 0 : 1 };
}

// ---------------------------------------------------------------- far away

// A far tree line: a strip whose top edge traces overlapping crowns, textured
// with the hedge foliage at a large scale. Seen through haze, it reads as a
// woodland edge. Runs along x at depth z, curving towards the camera.
export function treeLine({ z, x0, x1, hMin = 7, hMax = 14, bend = 0.004 }, rnd) {
  const crowns = [];
  for (let x = x0; x < x1; x += 2 + rnd() * 3.5) crowns.push([x, hMin + rnd() * (hMax - hMin), 2 + rnd() * 3]);
  const step = 0.5;
  const cols = Math.ceil((x1 - x0) / step) + 1;
  const pos = [];
  const uv = [];
  const col = [];
  const nor = [];
  const seed = rnd() * 40;
  for (let i = 0; i < cols; i++) {
    const x = x0 + (i / (cols - 1)) * (x1 - x0);
    let top = hMin * 0.6;
    for (const [cx, cy, r] of crowns) {
      const d = x - cx;
      if (Math.abs(d) < r) top = Math.max(top, cy - r + Math.sqrt(r * r - d * d) * 1.1);
    }
    top += (noise2(x * 1.3 + seed, 1) - 0.5) * 0.7 + (noise2(x * 4.1, seed) - 0.5) * 0.3;
    const zz = z + bend * x * x;
    for (const [y, k] of [
      [-1, 0.5],
      [top * 0.5, 0.75],
      [top, 1.1],
    ]) {
      pos.push(x, y, zz);
      uv.push(x / 6, y / 6);
      col.push(k, k, k);
      nor.push(0, 0.41, 0.91);
    }
  }
  const idx = [];
  for (let i = 0; i < cols - 1; i++) {
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j;
      const b = a + 3;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// Fields beyond the garden: a big ground plane under everything, a patchwork
// of greens and straw in vertex colours (the lawn covers the middle).
export function farGround({ size = 400, y = -0.03 } = {}, rnd) {
  const n = 64;
  const g = new THREE.PlaneGeometry(size, size, n, n);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, -size * 0.3);
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  const seed = rnd() * 99;
  const palette = [
    [0.78, 0.95, 0.62],
    [0.9, 1.0, 0.7],
    [1.15, 1.08, 0.7],
    [0.7, 0.86, 0.55],
    [1.0, 1.02, 0.75],
  ];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const cell = Math.floor((x + 1000) / 38) * 7 + Math.floor((z + 1000) / 27) * 13;
    const q = palette[Math.abs(Math.floor(Math.sin(cell + seed) * 1000)) % palette.length];
    const k = 0.85 + 0.3 * noise2(x * 0.05 + seed, z * 0.05);
    c.set([q[0] * k, q[1] * k, q[2] * k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
