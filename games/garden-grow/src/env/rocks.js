// Small irregular lumps (soil clods, crumbs, pebbles): an icosphere pushed
// in and out by a few smooth random waves, with smooth normals. Instances
// then scale and turn them so no two look alike.
import * as THREE from 'three';
import { mulberry32 } from '../config.js';

export function rockGeometry({ detail = 1, lumpy = 0.25, seed = 1 } = {}) {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => new THREE.Vector3(...v).normalize());
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let s = 0; s < detail; s++) {
    const mid = new Map();
    const midpoint = (a, b) => {
      const key = a < b ? a * 65536 + b : b * 65536 + a;
      let i = mid.get(key);
      if (i === undefined) {
        i = verts.length;
        verts.push(verts[a].clone().add(verts[b]).normalize());
        mid.set(key, i);
      }
      return i;
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  // a few smooth random waves over the sphere make it lumpy
  const rnd = mulberry32(seed * 7919 + 13);
  const waves = [];
  for (let k = 0; k < 6; k++) {
    const d = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    waves.push({ d, f: 1.2 + rnd() * 2.8, p: rnd() * 6.28, a: (0.5 + rnd()) / (1 + k * 0.4) });
  }
  let norm = 0;
  for (const w of waves) norm += w.a;
  const pos = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => {
    let r = 0;
    for (const w of waves) r += Math.sin(v.dot(w.d) * w.f * Math.PI + w.p) * w.a;
    r = 1 + (lumpy * r) / norm;
    pos[i * 3] = v.x * r;
    pos[i * 3 + 1] = v.y * r;
    pos[i * 3 + 2] = v.z * r;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(faces.flat());
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
