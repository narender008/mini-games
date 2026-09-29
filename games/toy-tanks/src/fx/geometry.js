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
