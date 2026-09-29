// Geometry for the solid pieces, built once at start-up.
import * as THREE from 'three';

// A strip of paper: a plane with ten slices along its length so the shader can
// curl it into a ribbon. Local x is the length, y the width.
export function flatGeometry() {
  return new THREE.PlaneGeometry(1, 1, 10, 1);
}

// A quad for the ground stains: a 4 x 4 grid so it can follow the ground's
// bumps (the vertex shader lifts it by bilinearly interpolated corner heights).
export function decalGeometry() {
  return new THREE.PlaneGeometry(2, 2, 4, 4);
}

// A chunky, bevelled, puffy five-point star lying in the xy plane, facing +z,
// about 1 unit from centre to tip. Built as concentric rings of the rounded
// outline, shrunk towards the centre and raised into a soft dome, with the
// front and back sharing the rim so the smooth normals wrap round the edge.
export function starGeometry() {
  const OUT = 1;
  const IN = 0.53;
  const corners = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? OUT : IN;
    corners.push([Math.cos(a) * r, Math.sin(a) * r, i % 2 === 0]);
  }
  // round each corner with a quadratic curve through the vertex
  const outline = [];
  for (let i = 0; i < 10; i++) {
    const p = corners[i];
    const prev = corners[(i + 9) % 10];
    const next = corners[(i + 1) % 10];
    const tip = p[2];
    const f = tip ? 0.2 : 0.16;
    const ax = p[0] + (prev[0] - p[0]) * f;
    const ay = p[1] + (prev[1] - p[1]) * f;
    const bx = p[0] + (next[0] - p[0]) * f;
    const by = p[1] + (next[1] - p[1]) * f;
    const steps = tip ? 7 : 5;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      outline.push(u * u * ax + 2 * u * t * p[0] + t * t * bx, u * u * ay + 2 * u * t * p[1] + t * t * by);
    }
  }
  const N = outline.length / 2;
  // ring shrink factor and height (front); a rounded bevel then a gentle dome
  const rings = [
    [1.0, 0.0],
    [0.985, 0.07],
    [0.955, 0.115],
    [0.9, 0.15],
    [0.8, 0.178],
    [0.66, 0.2],
    [0.48, 0.218],
    [0.26, 0.23],
  ];
  const pos = [];
  const push = (x, y, z) => pos.push(x, y, z);
  // front rings (outer to inner), the centre, then back rings (inner to outer, without the shared rim)
  const R = rings.length;
  for (let r = 0; r < R; r++) {
    const [k, z] = rings[r];
    for (let i = 0; i < N; i++) push(outline[i * 2] * k, outline[i * 2 + 1] * k, z);
  }
  const frontCentre = pos.length / 3;
  push(0, 0, 0.238);
  const backStart = pos.length / 3;
  for (let r = 1; r < R; r++) {
    const [k, z] = rings[r];
    for (let i = 0; i < N; i++) push(outline[i * 2] * k, outline[i * 2 + 1] * k, -z);
  }
  const backCentre = pos.length / 3;
  push(0, 0, -0.238);
  const idx = [];
  const ringStart = (r) => r * N;
  for (let r = 0; r < R - 1; r++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = ringStart(r) + i;
      const b = ringStart(r) + j;
      const c = ringStart(r + 1) + i;
      const d = ringStart(r + 1) + j;
      idx.push(a, b, c, b, d, c);
    }
  }
  for (let i = 0; i < N; i++) idx.push(ringStart(R - 1) + i, ringStart(R - 1) + ((i + 1) % N), frontCentre);
  // back: ring r (1..R-1) lives at backStart + (r-1)*N; ring 0 is the front's rim
  const backRing = (r) => (r === 0 ? 0 : backStart + (r - 1) * N);
  for (let r = 0; r < R - 1; r++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = backRing(r) + i;
      const b = backRing(r) + j;
      const c = backRing(r + 1) + i;
      const d = backRing(r + 1) + j;
      idx.push(a, c, b, b, c, d);
    }
  }
  for (let i = 0; i < N; i++) idx.push(backRing(R - 1) + i, backCentre, backRing(R - 1) + ((i + 1) % N));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the outline runs anticlockwise seen from +z, so the front winding above may
  // come out inside-out; check the centre normal and flip if needed
  const n = g.attributes.normal;
  if (n.getZ(frontCentre) < 0) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    g.computeVertexNormals();
  }
  g.computeBoundingSphere();
  return g;
}

// The liquid / lump blob. It carries no real positions: position.xz is the
// azimuth (cos, sin) and position.y the position along the profile from the
// top pole to the tail tip, in three equal thirds (top cap, lower sphere, tail).
// The vertex shader turns that into a head sphere with an optional tapering
// tail (a drop on a thin neck), wobble and lumps, with analytic normals.
export function blobGeometry(segments = 16, capRings = 8) {
  const rings = capRings * 3;
  const pos = [];
  const idx = [];
  for (let r = 0; r <= rings; r++) {
    const s = r / rings;
    for (let i = 0; i <= segments; i++) {
      const th = (i / segments) * Math.PI * 2;
      pos.push(Math.cos(th), s, Math.sin(th));
    }
  }
  const row = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < segments; i++) {
      const a = r * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // three needs a bounding sphere for its bookkeeping; the shader's shape fits a radius of 4
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
  return g;
}
