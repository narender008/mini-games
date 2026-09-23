// Procedural geometry shared by the toys: rounded boxes, puffy stars, gems,
// wrapped candy, and a small merge helper (the vendored three.js keeps only
// the core, so the addon utilities are not available).
import * as THREE from 'three';

// A box with rounded edges and corners. Each face is a grid whose outer
// rows bend round the edge with even angular steps, so the curve stays
// smooth with few vertices; normals are exact.
export function roundedBox(w = 1, h = 1, d = 1, r = 0.15, steps = 4) {
  const half = new THREE.Vector3(w / 2, h / 2, d / 2);
  const inner = half.clone().subScalar(r);
  const samples = (inn) => {
    const s = [];
    for (let j = steps; j >= 1; j--) s.push(-(inn + r * Math.tan(((j / steps) * Math.PI) / 4)));
    s.push(-inn, inn);
    for (let j = 1; j <= steps; j++) s.push(inn + r * Math.tan(((j / steps) * Math.PI) / 4));
    return s;
  };
  const sx = samples(inner.x);
  const sy = samples(inner.y);
  const sz = samples(inner.z);
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const n = new THREE.Vector3();
  // axis: which coordinate is fixed; sign: which side; (ua, va): the grid axes
  const faces = [
    { axis: 'x', sign: 1, ua: 'z', va: 'y', flipU: true },
    { axis: 'x', sign: -1, ua: 'z', va: 'y', flipU: false },
    { axis: 'y', sign: 1, ua: 'x', va: 'z', flipU: false, flipV: true },
    { axis: 'y', sign: -1, ua: 'x', va: 'z', flipU: false },
    { axis: 'z', sign: 1, ua: 'x', va: 'y', flipU: false },
    { axis: 'z', sign: -1, ua: 'x', va: 'y', flipU: true },
  ];
  const lists = { x: sx, y: sy, z: sz };
  for (const f of faces) {
    const us = lists[f.ua];
    const vs = lists[f.va];
    const base = pos.length / 3;
    for (let j = 0; j < vs.length; j++) {
      for (let i = 0; i < us.length; i++) {
        p.set(0, 0, 0);
        p[f.ua] = us[i];
        p[f.va] = vs[j];
        // push the face-plane point out from the inner box by the radius
        p[f.axis] = f.sign * (inner[f.axis] + r);
        q.set(
          THREE.MathUtils.clamp(p.x, -inner.x, inner.x),
          THREE.MathUtils.clamp(p.y, -inner.y, inner.y),
          THREE.MathUtils.clamp(p.z, -inner.z, inner.z),
        );
        n.subVectors(p, q);
        if (n.lengthSq() < 1e-12) n.set(0, 0, 0)[f.axis] = f.sign;
        n.normalize();
        const v = q.clone().addScaledVector(n, r);
        pos.push(v.x, v.y, v.z);
        nor.push(n.x, n.y, n.z);
        let u = (us[i] / (half[f.ua] * 2)) + 0.5;
        let vv = (vs[j] / (half[f.va] * 2)) + 0.5;
        if (f.flipU) u = 1 - u;
        if (f.flipV) vv = 1 - vv;
        uv.push(u, vv);
      }
    }
    const nu = us.length;
    for (let j = 0; j < vs.length - 1; j++) {
      for (let i = 0; i < nu - 1; i++) {
        const a = base + j * nu + i;
        const b = a + 1;
        const c = a + nu;
        const e = c + 1;
        // wind so the face points outward
        if (f.sign * crossSign(f.ua, f.va, f.axis) > 0) idx.push(a, b, e, a, e, c);
        else idx.push(a, e, b, a, c, e);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// +1 when (u axis × v axis) points along +axis.
function crossSign(ua, va, axis) {
  const order = { x: 0, y: 1, z: 2 };
  const u = order[ua];
  const v = order[va];
  const a = order[axis];
  const cyclic = (u + 1) % 3 === v && (v + 1) % 3 === a;
  return cyclic ? 1 : -1;
}

// Merge geometries that share the same attributes into one indexed geometry.
export function mergeGeometries(list) {
  const names = Object.keys(list[0].attributes);
  const out = new THREE.BufferGeometry();
  const arrays = {};
  for (const name of names) arrays[name] = [];
  const index = [];
  let offset = 0;
  for (const g0 of list) {
    const g = g0;
    for (const name of names) {
      const attr = g.attributes[name];
      for (let i = 0; i < attr.count * attr.itemSize; i++) arrays[name].push(attr.array[i]);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(g.index.array[i] + offset);
    else for (let i = 0; i < g.attributes.position.count; i++) index.push(i + offset);
    offset += g.attributes.position.count;
  }
  for (const name of names) {
    const size = list[0].attributes[name].itemSize;
    out.setAttribute(name, new THREE.Float32BufferAttribute(arrays[name], size));
  }
  out.setIndex(index);
  out.computeBoundingSphere();
  return out;
}

// Keep only position, normal and uv so geometries can be merged.
export function clean(g) {
  const keep = new THREE.BufferGeometry();
  keep.setAttribute('position', g.attributes.position);
  keep.setAttribute('normal', g.attributes.normal);
  if (g.attributes.uv) keep.setAttribute('uv', g.attributes.uv);
  else keep.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (g.index) keep.setIndex(g.index);
  return keep;
}

// A puffy five-point star, centred, about 1 unit across.
export function puffyStar(points = 5, outer = 0.5, innerR = 0.24, depth = 0.16) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? outer : innerR;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.6,
    bevelSize: outer * 0.12,
    bevelSegments: 3,
    curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return clean(g);
}

// A brilliant-cut gem: a table, a crown and a pointed pavilion.
export function gemGeometry(sides = 8) {
  const pts = [];
  pts.push(new THREE.Vector2(0, -0.5));
  pts.push(new THREE.Vector2(0.5, 0.05));
  pts.push(new THREE.Vector2(0.5, 0.12));
  pts.push(new THREE.Vector2(0.3, 0.32));
  pts.push(new THREE.Vector2(0, 0.32));
  const g = new THREE.LatheGeometry(pts, sides).toNonIndexed();
  g.computeVertexNormals(); // non-indexed: flat facets
  return clean(g);
}

// A wrapped sweet: a round body with two twisted wrapper ends.
export function candyGeometry() {
  const body = new THREE.SphereGeometry(0.28, 18, 12);
  body.scale(1.25, 1, 1);
  const endL = new THREE.ConeGeometry(0.2, 0.28, 8, 1, true);
  endL.rotateZ(-Math.PI / 2);
  endL.translate(-0.46, 0, 0);
  const endR = new THREE.ConeGeometry(0.2, 0.28, 8, 1, true);
  endR.rotateZ(Math.PI / 2);
  endR.translate(0.46, 0, 0);
  return mergeGeometries([clean(body), clean(endL), clean(endR)]);
}

// A round lollipop swirl disc.
export function lollipopGeometry() {
  const disc = new THREE.CylinderGeometry(0.34, 0.34, 0.12, 24, 1);
  disc.rotateX(Math.PI / 2);
  const stick = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6);
  stick.translate(0, -0.55, 0);
  return mergeGeometries([clean(disc), clean(stick)]);
}
