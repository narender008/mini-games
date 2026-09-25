// Geometry helpers: profiles swept along lanes (troughs, tubes, rails),
// rounded boxes for blocks, and lathe shapes for cups, funnels and bells.
// Swept geometry carries uv in metres: u along the track (so wood grain
// follows it round bends), v around the profile.
import * as THREE from 'three';
import { R_MARBLE } from './config.js';

// A closed or open 2D profile: points [w, u] in the lane's cross-section
// (w to the side, u up, from the resting marble's centre) and a smooth
// normal at each, plus sharp corners where needed (duplicate the point).
export function profile(points, closed = true) {
  return { points, closed };
}

// Round a polygon's corners: pts [[w,u],...], radius per corner (number or
// array), segs per corner.
export function roundPoly(pts, radius, segs = 4) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const r = Array.isArray(radius) ? radius[i] : radius;
    const p = pts[i];
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    if (!r) {
      out.push(p);
      continue;
    }
    const da = norm2([a[0] - p[0], a[1] - p[1]]);
    const db = norm2([b[0] - p[0], b[1] - p[1]]);
    const p0 = [p[0] + da[0] * r, p[1] + da[1] * r];
    const p1 = [p[0] + db[0] * r, p[1] + db[1] * r];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      // quadratic Bezier through the corner
      const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p[0] + t * t * p1[0];
      const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p[1] + t * t * p1[1];
      out.push([x, y]);
    }
  }
  return out;
}

function norm2(v) {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

// Arc points centred (cw, cu), radius r, from angle a0 to a1 (0 = +w, pi/2 = +u).
export function arcPts(cw, cu, r, a0, a1, segs) {
  const out = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    out.push([cw + r * Math.cos(a), cu + r * Math.sin(a)]);
  }
  return out;
}

// Sweep a profile along a lane between s0 and s1. Normals come from the
// profile's own 2D normals (outward for a counter-clockwise closed profile
// seen looking along the lane), so the surface is smooth round curves and
// sharp only where points are doubled.
export function sweep(lane, prof, { s0 = 0, s1 = lane.length, step = 0.004, flip = false, caps = false } = {}) {
  const pts = prof.points;
  const np = pts.length;
  const ring = prof.closed ? np + 1 : np;
  // profile normals and running length
  const pn = [];
  const pv = [0];
  for (let i = 0; i < np; i++) {
    const a = pts[(i - 1 + np) % np];
    const b = pts[(i + 1) % np];
    let tw;
    let tu;
    if (!prof.closed && i === 0) {
      tw = pts[1][0] - pts[0][0];
      tu = pts[1][1] - pts[0][1];
    } else if (!prof.closed && i === np - 1) {
      tw = pts[i][0] - pts[i - 1][0];
      tu = pts[i][1] - pts[i - 1][1];
    } else {
      tw = b[0] - a[0];
      tu = b[1] - a[1];
    }
    const l = Math.hypot(tw, tu) || 1;
    // outward normal for a counter-clockwise profile: (tu, -tw)
    pn.push(flip ? [-tu / l, tw / l] : [tu / l, -tw / l]);
    if (i > 0) pv.push(pv[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const closeLen = prof.closed ? pv[np - 1] + Math.hypot(pts[0][0] - pts[np - 1][0], pts[0][1] - pts[np - 1][1]) : 0;
  const L = Math.max(0.001, s1 - s0);
  const nseg = Math.max(1, Math.ceil(L / step));
  const pos = new Float32Array((nseg + 1) * ring * 3);
  const nor = new Float32Array((nseg + 1) * ring * 3);
  const uv = new Float32Array((nseg + 1) * ring * 2);
  const f = { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), w: new THREE.Vector3(), k: new THREE.Vector3() };
  const v = new THREE.Vector3();
  for (let k = 0; k <= nseg; k++) {
    const s = s0 + (L * k) / nseg;
    lane.frame(s, f);
    for (let i = 0; i < ring; i++) {
      const pi = i % np;
      const [w, u] = pts[pi];
      const [nw, nu] = pn[pi];
      const o = (k * ring + i) * 3;
      v.copy(f.p).addScaledVector(f.w, w).addScaledVector(f.u, u);
      pos[o] = v.x;
      pos[o + 1] = v.y;
      pos[o + 2] = v.z;
      v.copy(f.w).multiplyScalar(nw).addScaledVector(f.u, nu).normalize();
      nor[o] = v.x;
      nor[o + 1] = v.y;
      nor[o + 2] = v.z;
      const q = (k * ring + i) * 2;
      uv[q] = s;
      uv[q + 1] = i === np ? closeLen : pv[pi];
    }
  }
  const idx = [];
  for (let k = 0; k < nseg; k++) {
    for (let i = 0; i < ring - 1; i++) {
      const a = k * ring + i;
      const b = a + ring;
      if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1);
      else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (caps && prof.closed) return mergeGeometries([g, cap(lane, prof, s0, false), cap(lane, prof, s1, true)].map(toNonIndexedSafe));
  return g;
}

function toNonIndexedSafe(g) {
  return g.index ? g.toNonIndexed() : g;
}

// flat end cap of a closed profile (a simple fan: profiles here are convex
// enough, or hidden inside joins)
function cap(lane, prof, s, atEnd) {
  const f = { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), w: new THREE.Vector3(), k: new THREE.Vector3() };
  lane.frame(s, f);
  const pts = prof.points;
  let cw = 0;
  let cu = 0;
  for (const [w, u] of pts) {
    cw += w;
    cu += u;
  }
  cw /= pts.length;
  cu /= pts.length;
  const pos = [];
  const nor = [];
  const uv = [];
  const n = atEnd ? f.t.clone() : f.t.clone().negate();
  const P = (w, u) => f.p.clone().addScaledVector(f.w, w).addScaledVector(f.u, u);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const tri = atEnd ? [[cw, cu], a, b] : [[cw, cu], b, a];
    for (const [w, u] of tri) {
      const p = P(w, u);
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(w + s, u);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// ------------------------------------------------------------ standard profiles

const R = R_MARBLE;

// The inside of a U channel of inner radius rc whose axis is (rc - R) above
// the marble's resting centre, with upright walls to `top`.
export function channelInner(rc, top, segs = 14) {
  const axis = rc - R;
  const pts = [[-rc, top]];
  pts.push(...arcPts(0, axis, rc, Math.PI, 2 * Math.PI, segs));
  pts.push([rc, top]);
  return pts;
}

// A solid beam with a U channel cut along its top: outer width, depth below
// the channel floor, corner rounding. Counter-clockwise looking along the
// lane; sharp corners are doubled points.
export function troughBeam({ rc = 0.0155, top = 0.004, width = 0.042, floor = 0.006, round = 0.003 } = {}) {
  const axis = rc - R;
  const bottom = -R - floor;
  const hw = width / 2;
  const pts = [];
  pts.push(...arcPts(-hw + round, bottom + round, round, Math.PI, 1.5 * Math.PI, 4));
  pts.push(...arcPts(hw - round, bottom + round, round, -0.5 * Math.PI, 0, 4));
  pts.push(...arcPts(hw - round, top - round, round, 0, 0.5 * Math.PI, 4));
  pts.push(...arcPts(rc + 0.0012, top - 0.0012, 0.0012, 0.5 * Math.PI, Math.PI, 3));
  pts.push(...arcPts(0, axis, rc, 0, -Math.PI, 20));
  pts.push(...arcPts(-rc - 0.0012, top - 0.0012, 0.0012, 0, 0.5 * Math.PI, 3));
  pts.push(...arcPts(-hw + round, top - round, round, 0.5 * Math.PI, Math.PI, 4));
  return profile(dedupe(pts), true);
}

// A thin shell channel (glass or plastic track): wall thickness t, rolled rims.
export function shellChannel({ rc = 0.0155, top = 0.006, t = 0.0022, segs = 20 } = {}) {
  const axis = rc - R;
  const ro = rc + t;
  const pts = [];
  // outer skin from the left rim round the bottom to the right rim
  pts.push(...arcPts(0, axis, ro, Math.PI, 2 * Math.PI, segs));
  pts.push([ro, top]);
  pts.push(...arcPts(rc + t / 2, top, t / 2, 0, Math.PI, 5).slice(1));
  pts.push([rc, axis]);
  pts.push(...arcPts(0, axis, rc, 0, -Math.PI, segs).slice(1));
  pts.push([-rc, top]);
  pts.push(...arcPts(-rc - t / 2, top, t / 2, 0, Math.PI, 5).slice(1));
  pts.push([-ro, axis]);
  return profile(dedupe(pts), true);
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p);
  }
  const a = out[0];
  const z = out[out.length - 1];
  if (Math.hypot(a[0] - z[0], a[1] - z[1]) < 1e-6) out.pop();
  return out;
}

// A round tube: an outer and an inner surface (for clear tubes both show).
export function tubeRings(rc = 0.0128, t = 0.0016, segs = 28) {
  const axis = rc - R;
  const outer = arcPts(0, axis, rc + t, 0, 2 * Math.PI, segs).slice(0, -1);
  const inner = arcPts(0, axis, rc, 0, 2 * Math.PI, segs).slice(0, -1);
  return { outer: profile(outer, true), inner: profile(inner, true) };
}

// ------------------------------------------------------------ solids

// A box with rounded edges (for blocks), centred at the origin.
export function roundedBox(w, h, d, r = 0.003, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2 + 1, seg * 2 + 1, seg * 2 + 1);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const hx = w / 2 - r;
  const hy = h / 2 - r;
  const hz = d / 2 - r;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const dlt = v.clone().sub(c);
    if (dlt.lengthSq() > 1e-12) {
      dlt.normalize();
      v.copy(c).addScaledVector(dlt, r);
      n.setXYZ(i, dlt.x, dlt.y, dlt.z);
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// A lathe from [radius, height] pairs around y.
export function lathe(pairs, segs = 48) {
  return new THREE.LatheGeometry(pairs.map(([x, y]) => new THREE.Vector2(x, y)), segs);
}

// Merge non-indexed geometries with position, normal and uv.
export function mergeGeometries(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
