// Geometry helpers shared by Magic Brush's toy and nature friends (car,
// rocket, boat, teddy, flower, tree, rainbow, sun): the sculpt's own field
// evaluated in JavaScript so parts can be placed exactly on a friend's body
// (marching to its surface, its normal there), panels that lie on the body
// (windows, portholes), solids of revolution (tyres, hubs, rocket parts),
// and merging plain or skinned geometries into one mesh.
import * as THREE from 'three';
import { frameFrom } from './parts.js';
import { clamp } from './anim.js';

const TAU = Math.PI * 2;

// The sculpt's field (the prepared primitives), to place parts on the body.
export function fieldOf(prims) {
  return (x, y, z) => dist(prims, x, y, z);
}

function sdEllipsoid(px, py, pz, rx, ry, rz) {
  const ax = px / rx, ay = py / ry, az = pz / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx, by = ay / ry, bz = az / rz;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

function sdRoundCone(px, py, pz, p) {
  const bax = p.bx - p.ax, bay = p.by - p.ay, baz = p.bz - p.az;
  const l2 = p.l2;
  const rr = p.r1 - p.r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - p.ax, pay = py - p.ay, paz = pz - p.az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - p.r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - p.r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - p.r1;
}

function sdRoundBox(px, py, pz, hx, hy, hz, r) {
  const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r, qz = Math.abs(pz) - hz + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

function prim(p, x, y, z) {
  if (p.type === 1) return sdRoundCone(x, y, z, p);
  let px = x - p.c[0], py = y - p.c[1], pz = z - p.c[2];
  const m = p.m;
  if (m) {
    const lx = m[0] * px + m[1] * py + m[2] * pz;
    const ly = m[3] * px + m[4] * py + m[5] * pz;
    const lz = m[6] * px + m[7] * py + m[8] * pz;
    px = lx; py = ly; pz = lz;
  }
  if (p.type === 0) return sdEllipsoid(px, py, pz, p.r[0], p.r[1], p.r[2]);
  if (p.type === 2) return sdRoundBox(px, py, pz, p.h[0], p.h[1], p.h[2], p.rr);
  const qq = Math.sqrt(px * px + pz * pz) - p.R;
  return Math.sqrt(qq * qq + py * py) - p.r;
}

export function dist(list, x, y, z) {
  let d = 1e3;
  for (const p of list) {
    const k = p.k;
    // skip primitives too far away to matter (once the sculpt has prepared them)
    if (p.bc) {
      const lb = Math.hypot(x - p.bc[0], y - p.bc[1], z - p.bc[2]) - p.br;
      if (p.sub ? lb >= -d + k : lb >= d + k) continue;
    }
    const di = prim(p, x, y, z);
    if (p.sub) {
      const a = -d;
      const h = clamp(0.5 + (0.5 * (di - a)) / k, 0, 1);
      d = -(di + (a - di) * h - k * h * (1 - h));
    } else {
      const h = clamp(0.5 + (0.5 * (di - d)) / k, 0, 1);
      d = di + (d - di) * h - k * h * (1 - h);
    }
  }
  return d;
}

// from a point inside, march along dir to the surface
export function hit(F, o, dir, max = 0.4) {
  const l = Math.hypot(dir[0], dir[1], dir[2]);
  const d = [dir[0] / l, dir[1] / l, dir[2] / l];
  const at = (t) => F(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
  let t0 = 0;
  let t1 = max;
  let t = 0;
  for (let i = 0; i < 200 && t < max; i++) {
    const v = at(t);
    if (v >= 0) {
      t1 = t;
      break;
    }
    t0 = t;
    t += Math.max(-v * 0.8, 0.0006);
  }
  for (let i = 0; i < 16; i++) {
    const mid = (t0 + t1) / 2;
    if (at(mid) < 0) t0 = mid;
    else t1 = mid;
  }
  const s = (t0 + t1) / 2;
  return [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s];
}

export function grad(F, p) {
  const e = 0.0004;
  const x = F(p[0] + e, p[1], p[2]) - F(p[0] - e, p[1], p[2]);
  const y = F(p[0], p[1] + e, p[2]) - F(p[0], p[1] - e, p[2]);
  const z = F(p[0], p[1], p[2] + e) - F(p[0], p[1], p[2] - e);
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

// a rounded, slightly tapering outline (a window): half sizes a, b, a
// squareness n, centre c; taper narrows its top, shift slides its top along u
export function squircle(a, b, n, c, { taper = 0, shift = 0 } = {}) {
  return (ang) => {
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const x = a * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / n);
    const y = b * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
    const k = y / b * 0.5 + 0.5;
    return [c[0] + x * (1 - taper * k) + shift * k, c[1] + y];
  };
}

// A panel (glass) lying on the body over an outline: rings of points from its
// middle to its edge, each found on the surface along axis (from origin's
// depth) and lifted off it. Also returns the edge as points (for a frame).
export function panelGeometry(F, origin, axis, u, v, shape, { rings = 5, segs = 40, lift = 0.001 }) {
  const A = new THREE.Vector3(...axis);
  const U = new THREE.Vector3(...u);
  const V = new THREE.Vector3(...v);
  const O = new THREE.Vector3(...origin);
  const center = shape(0).map((_, i) => {
    let s = 0;
    for (let k = 0; k < 16; k++) s += shape((k / 16) * TAU)[i];
    return s / 16;
  });
  const onBody = (a, b, up) => {
    const start = O.clone().addScaledVector(U, a).addScaledVector(V, b);
    // start from the plane through origin across the axis
    start.addScaledVector(A, -start.clone().sub(O).dot(A));
    const p = hit(F, start.toArray(), axis);
    const n = grad(F, p);
    return [p[0] + n[0] * up, p[1] + n[1] * up, p[2] + n[2] * up, ...n];
  };
  const pos = [];
  const nor = [];
  const idx = [];
  const c = onBody(center[0], center[1], lift);
  pos.push(c[0], c[1], c[2]);
  nor.push(c[3], c[4], c[5]);
  const rim = [];
  for (let r = 1; r <= rings; r++) {
    const s = r / rings;
    for (let j = 0; j < segs; j++) {
      const e = shape((j / segs) * TAU);
      const p = onBody(center[0] + (e[0] - center[0]) * s, center[1] + (e[1] - center[1]) * s, lift);
      pos.push(p[0], p[1], p[2]);
      nor.push(p[3], p[4], p[5]);
      if (r === rings) rim.push(onBody(e[0], e[1], lift + 0.0006).slice(0, 3));
    }
  }
  const ring = (r, j) => 1 + (r - 1) * segs + (j % segs);
  for (let j = 0; j < segs; j++) idx.push(0, ring(1, j), ring(1, j + 1));
  for (let r = 1; r < rings; r++)
    for (let j = 0; j < segs; j++) {
      const a = ring(r, j), b = ring(r, j + 1), cc = ring(r + 1, j), d = ring(r + 1, j + 1);
      idx.push(a, cc, b, b, cc, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  orient(g);
  rim.push(rim[0]);
  return { panel: g, rim };
}

// make every triangle face the way its vertex normals point
export function orient(g) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const ix = g.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), vn = new THREE.Vector3();
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(p, ix[i]);
    b.fromBufferAttribute(p, ix[i + 1]);
    c.fromBufferAttribute(p, ix[i + 2]);
    fn.crossVectors(b.sub(a), c.sub(a));
    vn.fromBufferAttribute(n, ix[i]);
    if (fn.dot(vn) < 0) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
  }
}

// put a part built facing +z at p, facing along n, offset along n
export function placeAlong(g, p, n, off = 0) {
  const f = frameFrom(n);
  const m = new THREE.Matrix4().makeBasis(f.x, f.y, f.z).setPosition(p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off);
  g.applyMatrix4(m);
  return g;
}

export function stripUv(g) {
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  return g.index ? g : indexed(g);
}

export function indexed(g) {
  const n = g.attributes.position.count;
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(idx);
  return g;
}

// merge plain geometries (position, normal, and look attributes if all have them)
export function mergeAll(list, keepLook = false) {
  const names = ['position', 'normal'];
  if (keepLook || list.every((g) => g.attributes.aTint)) names.push('aTint', 'aMix');
  return mergeWith(list, names);
}

export function mergeSkinned(list) {
  return mergeWith(list, ['position', 'normal', 'aTint', 'aMix', 'skinIndex', 'skinWeight']);
}

export function mergeWith(list, names) {
  const out = new THREE.BufferGeometry();
  let vtx = 0;
  let icount = 0;
  for (const g of list) {
    vtx += g.attributes.position.count;
    icount += g.index.count;
  }
  for (const name of names) {
    const a0 = list[0].attributes[name];
    const arr = new a0.array.constructor(vtx * a0.itemSize);
    let o = 0;
    for (const g of list) {
      const a = g.attributes[name];
      arr.set(a.array.subarray(0, a.count * a.itemSize), o);
      o += a.count * a.itemSize;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, a0.itemSize));
  }
  const index = new (vtx > 65535 ? Uint32Array : Uint16Array)(icount);
  let o = 0;
  let base = 0;
  for (const g of list) {
    const ia = g.index.array;
    for (let i = 0; i < ia.length; i++) index[o++] = ia[i] + base;
    base += g.attributes.position.count;
  }
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

// A solid of revolution about the x axis through c. profile: a closed loop of
// [w, rho] (w along the axle, outwards positive; rho from the axle). side
// flips it for the right-hand wheels. shape(w, rho, th, i) may displace rho.
export function latheX(c, profile, seg, side, shape) {
  const np = profile.length;
  const pos = new Float32Array((seg + 1) * np * 3);
  let o = 0;
  for (let j = 0; j <= seg; j++) {
    const th = (j / seg) * TAU;
    const cs = Math.cos(th), sn = Math.sin(th);
    for (let i = 0; i < np; i++) {
      let [w, rho] = profile[i];
      if (shape) [w, rho] = shape(w, rho, th, i);
      pos[o++] = c[0] + w * side;
      pos[o++] = c[1] + rho * cs;
      pos[o++] = c[2] + rho * sn;
    }
  }
  const idx = [];
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < np - 1; i++) {
      const a = j * np + i, b = a + np;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // weld the normals across the seams (first and last ring, first and last profile point)
  const n = g.attributes.normal;
  const avg = (i, k) => {
    const x = n.getX(i) + n.getX(k), y = n.getY(i) + n.getY(k), z = n.getZ(i) + n.getZ(k);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(i, x / l, y / l, z / l);
    n.setXYZ(k, x / l, y / l, z / l);
  };
  for (let i = 0; i < np; i++) avg(i, seg * np + i);
  const [fw, fr] = profile[0];
  const [lw, lr] = profile[np - 1];
  if (Math.abs(fw - lw) < 1e-7 && Math.abs(fr - lr) < 1e-7) for (let j = 0; j <= seg; j++) avg(j * np, j * np + np - 1);
  // outward: flip the winding if the enclosed volume comes out negative
  let vol = 0;
  const ix = g.index.array;
  const P = (k, a) => pos[ix[k] * 3 + a] - c[a];
  for (let i = 0; i < ix.length; i += 3) {
    const ax = P(i, 0), ay = P(i, 1), az = P(i, 2);
    const bx = P(i + 1, 0), by = P(i + 1, 1), bz = P(i + 1, 2);
    const cx = P(i + 2, 0), cy = P(i + 2, 1), cz = P(i + 2, 2);
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol < 0) {
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  return g;
}

