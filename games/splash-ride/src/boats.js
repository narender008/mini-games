// The four boats you can drive: a glossy fibreglass runabout with an
// outboard, a painted clinker sailing dinghy whose sails fill and flap, a big
// inflatable rubber-duck boat and a jet ski. All built in code at real sizes.
//
// Hulls are lofted from cross-sections along the length (sheer, flare, chine,
// a sharp stem, a flat transom); the duck is an inflatable, so it is a smooth
// union of blobs turned into a mesh with surface nets. Parts that share a
// material are merged, so each boat is about a dozen draw calls. Paint
// stripes, clinker laps, welded vinyl seams and the slight waviness of
// moulded and inflated skins are worked out in the shaders from each
// vertex's place on the hull; upholstery, teak, varnished wood, sail cloth
// and rope use the baked maps from boat-textures.js.
//
// Every boat faces -z with its origin on the waterline, midships. The part
// below y = 0 is the underwater hull, closed and painted, since clear water
// shows it. Everything that moves (propeller, outboard, wheel, handlebars,
// jet nozzle, rudder and tiller, boom, sails, flags, the duck's head and
// paddle wheel) is an object transform or a small mesh updated on the CPU,
// so the ghost look and the shadow pass need no special shaders.
import * as THREE from 'three';
import { clamp, lerp, damp, smoothstep, TAU } from './config.js';
import {
  vinylTextures, teakTextures, woodTextures, ropeTextures, matTextures,
  sailTextures, eyeTexture, flagTexture, SAIL, mainChord,
} from './boat-textures.js';

export const BOAT_IDS = ['speedboat', 'sailboat', 'duck', 'jetski'];

// Sizes in metres, measured on the models. Boat space: x starboard, y up
// from the waterline, z aft (the bow points to -z). length/beam are the
// hull's; draft is the hull's depth below the waterline (the outboard leg,
// centreboard and rudder reach deeper); freeboard is the sheer height
// midships; mastTop the highest point. bowZ/sternZ are the hull's ends (the
// outboard, rudder, jet nozzle and duck's beak and wheel overhang them).
// spray: where bow spray leaves the hull at speed; wash: where the prop,
// jet or wheel churns; hornAt: where the horn sounds from.
export const BOAT_SPECS = {
  speedboat: {
    length: 4.6, beam: 1.9, draft: 0.33, freeboard: 0.76, mastTop: 1.74,
    bowZ: -2.3, sternZ: 2.3,
    spray: [[0.45, 0.02, -1.2], [-0.45, 0.02, -1.2], [0.78, 0.0, -0.45], [-0.78, 0.0, -0.45]],
    wash: [0, 0, 2.7],
    hornAt: [0.16, 0.9, -0.72],
    camera: { distance: 10, height: 3.5, lookHeight: 0.8 },
  },
  sailboat: {
    length: 4.2, beam: 1.6, draft: 0.2, freeboard: 0.57, mastTop: 5.67,
    bowZ: -2.1, sternZ: 2.11,
    spray: [[0.3, 0.02, -1.6], [-0.3, 0.02, -1.6]],
    wash: [0, 0, 2.2],
    hornAt: [0, 1.0, -1.03],
    camera: { distance: 11.5, height: 4.2, lookHeight: 1.8 },
  },
  duck: {
    length: 3.0, beam: 1.7, draft: 0.16, freeboard: 0.95, mastTop: 2.01,
    bowZ: -1.3, sternZ: 1.31,
    spray: [[0.5, 0.02, -1.0], [-0.5, 0.02, -1.0]],
    wash: [0, 0, 1.5],
    hornAt: [0, 1.42, -1.45],
    camera: { distance: 9.5, height: 3.4, lookHeight: 1.0 },
  },
  jetski: {
    length: 3.1, beam: 1.15, draft: 0.26, freeboard: 0.4, mastTop: 1.09,
    bowZ: -1.55, sternZ: 1.55,
    spray: [[0.36, 0.02, -0.8], [-0.36, 0.02, -0.8]],
    wash: [0, -0.02, 1.66],
    hornAt: [0, 0.88, -0.6],
    camera: { distance: 8.5, height: 3.1, lookHeight: 0.7 },
  },
};

const tierOf = (quality) => (typeof quality === 'string' ? quality : quality?.tier) || 'high';
const col = (c) => new THREE.Color(c);

// ================================================================ geometry

const same3 = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7 && Math.abs(a[2] - b[2]) < 1e-7;
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// One-sided or central difference at k in a run of `count` points, where a
// repeated point marks a crease: the tangent never reaches across it.
function tangentAt(get, k, count, closed, creaseAfter, creaseBefore, out) {
  let a = k - 1;
  let b = k + 1;
  if (closed) {
    a = (a + count) % count;
    b = b % count;
  } else {
    a = Math.max(a, 0);
    b = Math.min(b, count - 1);
  }
  if (creaseAfter(k)) b = k;
  if (creaseBefore(k)) a = k;
  let pa = get(a);
  let pb = get(b);
  const pk = get(k);
  // a degenerate stencil (points meeting at a stem or a pole): widen it
  if (dist3(pa, pb) < 1e-7) {
    let a2 = a;
    let b2 = b;
    while (b2 < count - 1 && same3(get(b2), pk)) b2++;
    while (a2 > 0 && same3(get(a2), pk)) a2--;
    pa = get(a2);
    pb = get(b2);
  }
  out[0] = pb[0] - pa[0];
  out[1] = pb[1] - pa[1];
  out[2] = pb[2] - pa[2];
  return out;
}

// Loft a grid of points rows[r][i] = [x, y, z] into a smooth indexed mesh.
// A repeated point in a row, or a repeated row, is a crease. uv are metres
// (u along the rows, v along each section); aGirth holds the distance from
// the nearest end of the section (from the sheer, on a hull), that distance
// as a fraction of half the section, and half the section's length.
function loft(rows, { closed = false, zone = 0, flip = false } = {}) {
  const nr = rows.length;
  const np = rows[0].length;
  const n = nr * np;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const gir = new Float32Array(n * 3);
  const zon = new Float32Array(n).fill(zone);
  for (let r = 0; r < nr; r++) {
    const row = rows[r];
    const cum = [0];
    for (let i = 1; i < np; i++) cum.push(cum[i - 1] + dist3(row[i], row[i - 1]));
    const total = cum[np - 1] + (closed ? dist3(row[0], row[np - 1]) : 0);
    const half = total / 2;
    for (let i = 0; i < np; i++) {
      const o = r * np + i;
      const g = closed ? cum[i] : Math.min(cum[i], total - cum[i]);
      gir[o * 3] = g;
      gir[o * 3 + 1] = half > 1e-6 ? g / half : 0;
      gir[o * 3 + 2] = half;
      uv[o * 2 + 1] = cum[i];
      pos[o * 3] = row[i][0];
      pos[o * 3 + 1] = row[i][1];
      pos[o * 3 + 2] = row[i][2];
    }
  }
  for (let i = 0; i < np; i++) {
    let acc = 0;
    for (let r = 0; r < nr; r++) {
      if (r > 0) acc += dist3(rows[r][i], rows[r - 1][i]);
      uv[(r * np + i) * 2] = acc;
    }
  }
  const rowSame = new Uint8Array(nr);
  for (let r = 0; r < nr - 1; r++) rowSame[r] = rows[r].every((p, i) => same3(p, rows[r + 1][i])) ? 1 : 0;
  const ts = [0, 0, 0];
  const tl = [0, 0, 0];
  const bad = [];
  for (let r = 0; r < nr; r++) {
    const row = rows[r];
    for (let i = 0; i < np; i++) {
      tangentAt((k) => row[k], i, np, closed,
        (k) => (closed || k < np - 1) && same3(row[k], row[(k + 1) % np]),
        (k) => (closed || k > 0) && same3(row[k], row[(k - 1 + np) % np]), ts);
      tangentAt((k) => rows[k][i], r, nr, false, (k) => k < nr - 1 && rowSame[k] === 1, (k) => k > 0 && rowSame[k - 1] === 1, tl);
      let nx = tl[1] * ts[2] - tl[2] * ts[1];
      let ny = tl[2] * ts[0] - tl[0] * ts[2];
      let nz = tl[0] * ts[1] - tl[1] * ts[0];
      const l = Math.hypot(nx, ny, nz);
      const o = (r * np + i) * 3;
      if (l < 1e-12) {
        bad.push(r * np + i);
        continue;
      }
      const s = flip ? -1 / l : 1 / l;
      nor[o] = nx * s;
      nor[o + 1] = ny * s;
      nor[o + 2] = nz * s;
    }
  }
  // points where nothing is defined (a stem head): borrow the next row's
  for (const k of bad) {
    const r = Math.floor(k / np);
    const i = k % np;
    for (const rr of [r + 1, r - 1, r + 2, r - 2]) {
      if (rr < 0 || rr >= nr) continue;
      const o2 = (rr * np + i) * 3;
      if (nor[o2] || nor[o2 + 1] || nor[o2 + 2]) {
        nor.copyWithin(k * 3, o2, o2 + 3);
        break;
      }
    }
  }
  const idx = [];
  const nc = closed ? np : np - 1;
  for (let r = 0; r < nr - 1; r++) {
    for (let i = 0; i < nc; i++) {
      const a = r * np + i;
      const b = a + np;
      const c = r * np + ((i + 1) % np);
      const d = c + np;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aGirth', new THREE.BufferAttribute(gir, 3));
  g.setAttribute('aZone', new THREE.BufferAttribute(zon, 1));
  g.setIndex(idx);
  return orient(g);
}

// Make every triangle wind so its face agrees with its vertex normals, and
// drop the degenerate ones.
function orient(g) {
  const p = g.attributes.position.array;
  const nm = g.attributes.normal.array;
  const src = g.index.array;
  const out = [];
  for (let t = 0; t < src.length; t += 3) {
    const a = src[t] * 3;
    const b = src[t + 1] * 3;
    const c = src[t + 2] * 3;
    const ux = p[b] - p[a];
    const uy = p[b + 1] - p[a + 1];
    const uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a];
    const vy = p[c + 1] - p[a + 1];
    const vz = p[c + 2] - p[a + 2];
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    if (Math.hypot(fx, fy, fz) < 1e-12) continue;
    const d = fx * (nm[a] + nm[b] + nm[c]) + fy * (nm[a + 1] + nm[b + 1] + nm[c + 1]) + fz * (nm[a + 2] + nm[b + 2] + nm[c + 2]);
    if (d < 0) out.push(src[t], src[t + 2], src[t + 1]);
    else out.push(src[t], src[t + 1], src[t + 2]);
  }
  g.setIndex(out);
  return g;
}

// Sweep a closed 2D profile [[a, b], ...] (a along the frame's N, b along B)
// along a path of Vector3s. `frame(i, T)` may return the N axis for point i;
// otherwise N is carried along by parallel transport from `up`. `scale(t)`
// shapes the profile along the path (t = 0..1 by length). uv: u along the
// path in metres, v round the profile in metres.
function sweep(path, profile, { closed = false, frame = null, scale = null, up = new THREE.Vector3(0, 1, 0), caps = false, profileOpen = false } = {}) {
  const n = path.length;
  const T = [];
  for (let i = 0; i < n; i++) {
    let a = i - 1;
    let b = i + 1;
    if (closed) {
      a = (a + n) % n;
      b %= n;
    } else {
      a = Math.max(0, a);
      b = Math.min(n - 1, b);
    }
    T.push(path[b].clone().sub(path[a]).normalize());
  }
  const N = [];
  const Bv = [];
  let prevN = null;
  for (let i = 0; i < n; i++) {
    let Ni = frame ? frame(i, T[i]) : null;
    if (!Ni) {
      if (!prevN) {
        Ni = up.clone().addScaledVector(T[i], -up.dot(T[i]));
        if (Ni.lengthSq() < 1e-8) Ni = new THREE.Vector3(1, 0, 0).addScaledVector(T[i], -T[i].x);
      } else {
        Ni = prevN.clone().addScaledVector(T[i], -prevN.dot(T[i]));
      }
    } else {
      Ni = Ni.clone().addScaledVector(T[i], -Ni.dot(T[i]));
    }
    Ni.normalize();
    N.push(Ni);
    Bv.push(new THREE.Vector3().crossVectors(T[i], Ni).normalize());
    prevN = Ni;
  }
  const lens = [0];
  for (let i = 1; i < n; i++) lens.push(lens[i - 1] + path[i].distanceTo(path[i - 1]));
  const total = lens[n - 1] || 1;
  const np = profile.length;
  // profile normals (outward for a counter-clockwise profile), creases at repeats
  const pn = [];
  const pv = [0];
  for (let i = 0; i < np; i++) {
    const t = [0, 0, 0];
    const P = (k) => [profile[k][0], profile[k][1], 0];
    tangentAt(P, i, np, !profileOpen,
      (k) => (!profileOpen || k < np - 1) && same3(P(k), P((k + 1) % np)),
      (k) => (!profileOpen || k > 0) && same3(P(k), P((k - 1 + np) % np)), t);
    const l = Math.hypot(t[0], t[1]) || 1;
    pn.push([t[1] / l, -t[0] / l]);
    if (i > 0) pv.push(pv[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  }
  const rows = closed ? n + 1 : n;
  const ring = profileOpen ? np : np + 1;
  const pos = new Float32Array(rows * ring * 3);
  const nor = new Float32Array(rows * ring * 3);
  const uv = new Float32Array(rows * ring * 2);
  const v = new THREE.Vector3();
  for (let r = 0; r < rows; r++) {
    const i = r % n;
    const s = scale ? scale(r === n ? 1 : lens[i] / total) : 1;
    for (let k = 0; k < ring; k++) {
      const j = k % np;
      const [a, b] = profile[j];
      const o = r * ring + k;
      v.copy(path[i]).addScaledVector(N[i], a * s).addScaledVector(Bv[i], b * s);
      pos[o * 3] = v.x;
      pos[o * 3 + 1] = v.y;
      pos[o * 3 + 2] = v.z;
      v.copy(N[i]).multiplyScalar(pn[j][0]).addScaledVector(Bv[i], pn[j][1]).normalize();
      nor[o * 3] = v.x;
      nor[o * 3 + 1] = v.y;
      nor[o * 3 + 2] = v.z;
      uv[o * 2] = r === n ? total + path[n - 1].distanceTo(path[0]) : lens[i];
      uv[o * 2 + 1] = (k === np ? pv[np - 1] + Math.hypot(profile[0][0] - profile[np - 1][0], profile[0][1] - profile[np - 1][1]) : pv[j]) * s;
    }
  }
  const idx = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < ring - 1; k++) {
      const a = r * ring + k;
      const b = a + ring;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g = orient(g);
  if (caps && !closed) {
    const list = [g];
    for (const end of [0, n - 1]) {
      const s = scale ? scale(end ? 1 : 0) : 1;
      const dir = end ? T[end] : T[end].clone().negate();
      const ring2 = profile.map(([a, b]) => path[end].clone().addScaledVector(N[end], a * s).addScaledVector(Bv[end], b * s));
      list.push(fan(ring2, path[end], dir));
    }
    g = merge(list);
  }
  return g;
}

// A flat fan from a centre over a closed ring of points, facing `normal`.
function fan(ring, centre, normal) {
  const pos = [centre.x, centre.y, centre.z];
  const nor = [normal.x, normal.y, normal.z];
  const uv = [0, 0];
  for (const p of ring) {
    pos.push(p.x, p.y, p.z);
    nor.push(normal.x, normal.y, normal.z);
    uv.push(p.x - centre.x, p.y - centre.y);
  }
  const idx = [];
  for (let i = 0; i < ring.length; i++) idx.push(0, 1 + i, 1 + ((i + 1) % ring.length));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return orient(g);
}

const circle = (r, segs = 10) => {
  const out = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * TAU;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
};

// A straight tube between two points.
function rod(a, b, r, segs = 8, caps = true) {
  return sweep([a, b], circle(r, segs), { caps, up: Math.abs(b.y - a.y) > 0.9 * a.distanceTo(b) ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0) });
}

// Merge geometries (indexed or not) that share their attribute names.
// Missing attributes are filled with zeros (aGirth -1: no stripe).
function merge(list) {
  list = list.filter(Boolean);
  const names = new Set();
  for (const g of list) for (const k of Object.keys(g.attributes)) names.add(k);
  let vcount = 0;
  let icount = 0;
  for (const g of list) {
    vcount += g.attributes.position.count;
    icount += g.index ? g.index.count : g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  const idx = new Uint32Array(icount);
  const arrays = {};
  const sizes = { position: 3, normal: 3, uv: 2, aGirth: 3, aZone: 1 };
  for (const k of names) arrays[k] = new Float32Array(vcount * (sizes[k] || list.find((g) => g.attributes[k]).attributes[k].itemSize));
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    for (const k of names) {
      const size = arrays[k].length / vcount;
      const a = g.attributes[k];
      if (a) arrays[k].set(a.array.subarray(0, c * size), vo * size);
      else if (k === 'aGirth') for (let i = 0; i < c; i++) arrays[k].set([-1, -1, 1], (vo + i) * 3);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    else for (let i = 0; i < c; i++) idx[io + i] = vo + i;
    io += g.index ? g.index.count : c;
    vo += c;
    g.dispose();
  }
  for (const k of names) out.setAttribute(k, new THREE.BufferAttribute(arrays[k], arrays[k].length / vcount));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Transform a geometry in place: position, rotation (Euler XYZ), scale.
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
function xf(g, [x = 0, y = 0, z = 0] = [], [rx = 0, ry = 0, rz = 0] = [], s = 1) {
  const sv = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
  _m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), sv);
  g.applyMatrix4(_m);
  return g;
}

// Constant hull-paint attributes for pieces that share a hull material.
function zoned(g, zone, girth = [-1, -1, 1]) {
  const c = g.attributes.position.count;
  const gi = new Float32Array(c * 3);
  for (let i = 0; i < c; i++) gi.set(girth, i * 3);
  g.setAttribute('aGirth', new THREE.BufferAttribute(gi, 3));
  g.setAttribute('aZone', new THREE.BufferAttribute(new Float32Array(c).fill(zone), 1));
  return g;
}

// Box with rounded edges, uv in metres by box projection.
function roundedBox(w, h, d, r = 0.02, seg = 2) {
  const [sx, sy, sz] = Array.isArray(seg) ? seg : [seg, seg, seg];
  const g = new THREE.BoxGeometry(w, h, d, sx * 2 + 1, sy * 2 + 1, sz * 2 + 1);
  const p = g.attributes.position;
  const nm = g.attributes.normal;
  const hx = w / 2 - r;
  const hy = h / 2 - r;
  const hz = d / 2 - r;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  const dl = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    dl.copy(v).sub(c);
    if (dl.lengthSq() > 1e-12) {
      dl.normalize();
      v.copy(c).addScaledVector(dl, r);
      nm.setXYZ(i, dl.x, dl.y, dl.z);
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  boxUV(g);
  return g;
}

// Box-projected uv in metres (the face's dominant normal picks the plane).
function boxUV(g, along = null) {
  const p = g.attributes.position;
  const nm = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const ax = Math.abs(nm.getX(i));
    const ay = Math.abs(nm.getY(i));
    const az = Math.abs(nm.getZ(i));
    let u;
    let w;
    if (ax >= ay && ax >= az) [u, w] = [z, y];
    else if (ay >= az) [u, w] = [x, z];
    else [u, w] = [x, y];
    // keep the grain running along the part's long axis
    if (along === 'x') [u, w] = ax >= ay && ax >= az ? [z, y] : [x, ay >= az ? z : y];
    if (along === 'z') [u, w] = az >= ax && az >= ay ? [x, y] : [z, ax >= ay ? y : x];
    if (along === 'y') [u, w] = ay >= ax && ay >= az ? [x, z] : [y, ax >= az ? z : x];
    uv[i * 2] = u;
    uv[i * 2 + 1] = w;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// A cushion of vinyl rolls lying side by side across x (rolls run along z),
// on a local origin at the middle of its underside. Outer rolls are fuller.
// uv: u along the roll in metres, v 0..1 across each roll (for the stitches).
function cushion(w, d, h, rolls) {
  const list = [];
  const rw = w / rolls;
  for (let i = 0; i < rolls; i++) {
    const outer = i === 0 || i === rolls - 1;
    const hh = outer ? h * 1.12 : h;
    const g = roundedBox(rw * 1.02, hh, d, Math.min(rw * 0.48, hh * 0.45), [2, 2, 1]);
    const x0 = -w / 2 + rw * (i + 0.5);
    xf(g, [x0, hh / 2, 0]);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let k = 0; k < p.count; k++) uv.setXY(k, p.getZ(k), (p.getX(k) - (x0 - rw / 2)) / rw);
    list.push(g);
  }
  return merge(list);
}

function lathe(pairs, segs = 24, phi = TAU) {
  const g = new THREE.LatheGeometry(pairs.map(([r, y]) => new THREE.Vector2(r, y)), segs, 0, phi);
  return g;
}

// ---------------------------------------------------------------- SDF mesher

// Surface nets over a signed distance function (negative inside): one vertex
// per cell the surface crosses, projected onto the surface, with the SDF's
// gradient for a normal; a quad for every grid edge the surface cuts.
function surfaceNets(f, lo, hi, cell) {
  const nx = Math.ceil((hi[0] - lo[0]) / cell) + 1;
  const ny = Math.ceil((hi[1] - lo[1]) / cell) + 1;
  const nz = Math.ceil((hi[2] - lo[2]) / cell) + 1;
  const val = new Float32Array(nx * ny * nz);
  const I = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) val[I(i, j, k)] = f(lo[0] + i * cell, lo[1] + j * cell, lo[2] + k * cell);
    }
  }
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const C = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const [a, b, d] = corners[c];
          cv[c] = val[I(i + a, j + b, k + d)];
          if (cv[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let cnt = 0;
        for (const [e0, e1] of edges) {
          const v0 = cv[e0];
          const v1 = cv[e1];
          if ((v0 < 0) === (v1 < 0)) continue;
          const t = v0 / (v0 - v1);
          const A = corners[e0];
          const Bc = corners[e1];
          sx += A[0] + (Bc[0] - A[0]) * t;
          sy += A[1] + (Bc[1] - A[1]) * t;
          sz += A[2] + (Bc[2] - A[2]) * t;
          cnt++;
        }
        cellV[C(i, j, k)] = pos.length / 3;
        pos.push(lo[0] + (i + sx / cnt) * cell, lo[1] + (j + sy / cnt) * cell, lo[2] + (k + sz / cnt) * cell);
      }
    }
  }
  // project onto the surface, then take the gradient as the normal
  const h = cell * 0.2;
  const nor = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    let x = pos[v];
    let y = pos[v + 1];
    let z = pos[v + 2];
    for (let it = 0; it < 3; it++) {
      const d = f(x, y, z);
      const gx = (f(x + h, y, z) - f(x - h, y, z)) / (2 * h);
      const gy = (f(x, y + h, z) - f(x, y - h, z)) / (2 * h);
      const gz = (f(x, y, z + h) - f(x, y, z - h)) / (2 * h);
      const g2 = gx * gx + gy * gy + gz * gz || 1;
      const step = Math.max(-cell * 0.5, Math.min(cell * 0.5, d / g2));
      x -= gx * step;
      y -= gy * step;
      z -= gz * step;
      if (it === 2) {
        const l = Math.sqrt(g2);
        nor[v] = gx / l;
        nor[v + 1] = gy / l;
        nor[v + 2] = gz / l;
      }
    }
    pos[v] = x;
    pos[v + 1] = y;
    pos[v + 2] = z;
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) [b, d] = [d, b];
    // split along the shorter diagonal
    const dac = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2;
    const dbd = (pos[b * 3] - pos[d * 3]) ** 2 + (pos[b * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b * 3 + 2] - pos[d * 3 + 2]) ** 2;
    if (dac < dbd) idx.push(a, b, c, a, c, d);
    else idx.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const v0 = val[I(i, j, k)] < 0;
        if (i < nx - 1 && v0 !== (val[I(i + 1, j, k)] < 0)) {
          quad(cellV[C(i, j - 1, k - 1)], cellV[C(i, j, k - 1)], cellV[C(i, j, k)], cellV[C(i, j - 1, k)], !v0);
        }
        if (j < ny - 1 && v0 !== (val[I(i, j + 1, k)] < 0)) {
          quad(cellV[C(i - 1, j, k - 1)], cellV[C(i - 1, j, k)], cellV[C(i, j, k)], cellV[C(i, j, k - 1)], !v0);
        }
        if (k < nz - 1 && v0 !== (val[I(i, j, k + 1)] < 0)) {
          quad(cellV[C(i - 1, j - 1, k)], cellV[C(i, j - 1, k)], cellV[C(i, j, k)], cellV[C(i - 1, j, k)], !v0);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  return orient(g);
}

// SDF primitives (IQ)
const sdEllipsoid = (x, y, z, rx, ry, rz) => {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
};
const sdRoundBox = (x, y, z, bx, by, bz, r) => {
  const qx = Math.abs(x) - bx + r;
  const qy = Math.abs(y) - by + r;
  const qz = Math.abs(z) - bz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
};
const sdCapsule = (x, y, z, ax, ay, az, bx, by, bz, r) => {
  const px = x - ax;
  const py = y - ay;
  const pz = z - az;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const h = clamp((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
  return Math.hypot(px - dx * h, py - dy * h, pz - dz * h) - r;
};
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);

// ================================================================ materials

// Shared GLSL: a hash, 3D value noise and bump mapping from a height in
// metres using screen derivatives (Mikkelsen), as in the other games.
const GLSL_LIB = /* glsl */ `
float bhH31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float bhNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(bhH31(i), bhH31(i + vec3(1, 0, 0)), f.x), mix(bhH31(i + vec3(0, 1, 0)), bhH31(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(bhH31(i + vec3(0, 0, 1)), bhH31(i + vec3(1, 0, 1)), f.x), mix(bhH31(i + vec3(0, 1, 1)), bhH31(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
vec3 bhBump(vec3 surfPos, vec3 surfNorm, float height, float faceDir) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec2 dh = vec2(dFdx(height), dFdy(height));
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
float bhBand(float x, float a, float b) {
  float w = fwidth(x) * 0.7 + 1e-5;
  return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x));
}
`;

// Painted or gelcoated hull. Zone 0 is the outside: topside colour, a sheer
// stripe and pinstripe at set distances below the sheer, a boot stripe and
// bottom paint by height. Zone 1 is the deck, liner or inside of the boat.
// Optional clinker laps (planks per side) and a faint orange-peel waviness.
function hullPaint(o) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: o.coatRough ?? 0.05,
    sheen: o.sheen ?? 0,
  });
  const u = {
    hpTop: { value: col(o.top) },
    hpStripe: { value: col(o.stripe ?? o.top) },
    hpPin: { value: col(o.pin ?? o.stripe ?? o.top) },
    hpBoot: { value: col(o.boot ?? o.top) },
    hpBottom: { value: col(o.bottom ?? o.top) },
    hpDeck: { value: col(o.deck ?? o.top) },
    hpStripeG: { value: new THREE.Vector4(...(o.stripeG ?? [-2, -2, -2, -2])) },
    hpBootY: { value: new THREE.Vector4(...(o.bootY ?? [-9, -9, -9, 0])) },
    hpK: { value: new THREE.Vector4(o.rough ?? 0.2, o.bottomRough ?? 0.6, o.bottomCoat ?? 0, o.deckRough ?? 0.3) },
    hpPlank: { value: new THREE.Vector4(o.planks ?? 0, o.lap ?? 0, o.peel ?? 0.00012, o.deckCoat ?? 1) },
  };
  const planks = o.planks ? 1 : 0;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aGirth;\nattribute float aZone;\nvarying vec3 vHpPos;\nvarying vec3 vHpGir;\nvarying float vHpZone;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHpPos = position;\nvHpGir = aGirth;\nvHpZone = aZone;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
#define HP_PLANKS ${planks}
uniform vec3 hpTop;
uniform vec3 hpStripe;
uniform vec3 hpPin;
uniform vec3 hpBoot;
uniform vec3 hpBottom;
uniform vec3 hpDeck;
uniform vec4 hpStripeG;
uniform vec4 hpBootY;
uniform vec4 hpK;
uniform vec4 hpPlank;
varying vec3 vHpPos;
varying vec3 vHpGir;
varying float vHpZone;
${GLSL_LIB}`)
      .replace('#include <map_fragment>', /* glsl */ `
vec3 hpC = hpTop;
float hpR = hpK.x;
float hpCoat = 1.0;
float hpH = 0.0;
if (vHpZone < 0.5) {
  hpC = mix(hpC, hpStripe, bhBand(vHpGir.x, hpStripeG.x, hpStripeG.y));
  hpC = mix(hpC, hpPin, bhBand(vHpGir.x, hpStripeG.z, hpStripeG.w));
  hpC = mix(hpC, hpBoot, bhBand(vHpPos.y, hpBootY.x, hpBootY.y));
  float wy = fwidth(vHpPos.y) * 0.7 + 1e-5;
  float bot = 1.0 - smoothstep(hpBootY.z - wy, hpBootY.z + wy, vHpPos.y);
  hpC = mix(hpC, hpBottom, bot);
  hpR = mix(hpR, hpK.y, bot);
  hpCoat = mix(1.0, hpK.z, bot);
} else {
  hpC = hpDeck;
  hpR = hpK.w;
  hpCoat = hpPlank.w;
}
#if HP_PLANKS == 1
if (vHpGir.y >= 0.0) {
  // clinker laps: each plank's lower edge stands proud of the next
  float pk = vHpGir.y * hpPlank.x;
  float pf = fract(pk);
  float w = clamp(fwidth(pk) * 1.5, 0.02, 0.5);
  hpH += ((1.0 - pf) - (1.0 - smoothstep(0.0, w, pf))) * hpPlank.y;
  hpC *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, w * 2.0 + 0.05, pf));
}
#endif
hpH += (bhNoise(vHpPos * 55.0) - 0.5) * hpPlank.z + (bhNoise(vHpPos * 6.0) - 0.5) * hpPlank.z * 4.0;
diffuseColor.rgb = hpC;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = hpR;')
      .replace('#include <normal_fragment_maps>', 'normal = bhBump(-vViewPosition, normal, hpH, faceDirection);')
      .replace('#include <clearcoat_normal_fragment_maps>', '#ifdef USE_CLEARCOAT\nclearcoatNormal = normalize(mix(nonPerturbedNormal, normal, 0.9));\n#endif')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= hpCoat;\n#endif');
  };
  m.customProgramCacheKey = () => `boat-hull-${planks}`;
  m.userData.uniforms = u;
  return m;
}

// Glossy PVC for the inflatable: welded seams (a raised bead with the skin
// pillowing into it) along two planes, a slightly wobbly inflated surface and
// a little light bleeding through the vinyl at glancing angles.
function inflatable(o) {
  const m = new THREE.MeshPhysicalMaterial({
    color: col(o.color),
    roughness: o.rough ?? 0.32,
    clearcoat: 1,
    clearcoatRoughness: o.coatRough ?? 0.08,
    sheen: 0.12,
    sheenRoughness: 0.5,
    sheenColor: col('#ffffff'),
  });
  const u = {
    dvSeamA: { value: new THREE.Vector4(...(o.seamA ?? [0, 0, 0, 99])) },
    dvSeamB: { value: new THREE.Vector4(...(o.seamB ?? [0, 0, 0, 99])) },
    dvMask: { value: new THREE.Vector4(o.seamAFrom ?? -9, o.seamBMaxNy ?? 0.7, o.wobble ?? 0.0012, o.glow ?? 0.06) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDvPos;\nvarying vec3 vDvNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDvPos = position;\nvDvNrm = objectNormal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec4 dvSeamA;
uniform vec4 dvSeamB;
uniform vec4 dvMask;
varying vec3 vDvPos;
varying vec3 vDvNrm;
${GLSL_LIB}`)
      .replace('#include <map_fragment>', /* glsl */ `
#include <map_fragment>
float dvH = 0.0;
float dvBead = 0.0;
{
  float dA = abs(dot(vDvPos, dvSeamA.xyz) - dvSeamA.w);
  float mA = smoothstep(dvMask.x - 0.02, dvMask.x + 0.02, vDvPos.y);
  float dB = abs(dot(vDvPos, dvSeamB.xyz) - dvSeamB.w);
  float mB = 1.0 - smoothstep(dvMask.y - 0.1, dvMask.y, abs(normalize(vDvNrm).y));
  dvBead = max(mA * (1.0 - smoothstep(0.0015, 0.0045, dA)), mB * (1.0 - smoothstep(0.0015, 0.0045, dB)));
  dvH -= mA * 0.005 * exp(-dA / 0.03) + mB * 0.005 * exp(-dB / 0.03);
  dvH += dvBead * 0.0012;
  dvH += (bhNoise(vDvPos * 3.2) - 0.5) * dvMask.z + (bhNoise(vDvPos * 9.0 + 7.0) - 0.5) * dvMask.z * 0.35;
  diffuseColor.rgb *= 1.0 - 0.16 * dvBead;
}`)
      .replace('#include <normal_fragment_maps>', 'normal = bhBump(-vViewPosition, normal, dvH, faceDirection);')
      .replace('#include <clearcoat_normal_fragment_maps>', '#ifdef USE_CLEARCOAT\nclearcoatNormal = normal;\n#endif')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += diffuseColor.rgb * dvMask.w * (0.3 + 0.7 * pow(1.0 - ndv, 2.0));
}`);
  };
  m.customProgramCacheKey = () => 'boat-inflatable';
  return m;
}

// Dacron: sheen, a soft backlit glow where the sun shines through the cloth
// (darker along the doubled seams and patches, as on a real sail).
function sailMaterial(tex) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.62,
    sheen: 0.6,
    sheenRoughness: 0.45,
    sheenColor: col('#fffaf0'),
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_NORMALMAP
{
  // the sail number printed on the far face shows through only faintly
  float sa = texture2D(normalMap, vNormalMapUv).a * 2.0 - 1.0;
  float ghost = gl_FrontFacing ? max(-sa, 0.0) : max(sa, 0.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.83, 0.79, 0.69), ghost * 0.74);
}
#endif`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
  float back = saturate(-dot(normal, directionalLights[i].direction));
  reflectedLight.directDiffuse += diffuseColor.rgb * diffuseColor.rgb * directionalLights[i].color * back * 0.28;
}
#endif`);
  };
  m.customProgramCacheKey = () => 'boat-sail';
  return m;
}

// Glass written premultiplied: reflections at full strength, only the tint
// of the body itself scaled by its opacity.
function glassMaterial(color, opacity) {
  const m = new THREE.MeshPhysicalMaterial({
    color: col(color),
    roughness: 0.03,
    metalness: 0,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMapIntensity: 1.2,
  });
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      'gl_FragColor = vec4(outgoingLight - totalDiffuse * (1.0 - diffuseColor.a), diffuseColor.a);',
    );
  };
  m.customProgramCacheKey = () => 'boat-glass';
  return m;
}

// Everything on every boat, made once and shared by all boats and ghosts.
let LIB = null;
let libUsers = 0;

function library(tier) {
  if (LIB) return LIB;
  const big = tier !== 'low';
  const made = [];
  const lazy = (fn) => {
    let v = null;
    return () => {
      if (!v) made.push((v = fn()));
      return v;
    };
  };
  const tex = {
    vinyl: lazy(() => vinylTextures(big ? 512 : 256)),
    teak: lazy(() => teakTextures(big ? 512 : 256)),
    mahogany: lazy(() => woodTextures('mahogany', big ? 512 : 256)),
    spruce: lazy(() => woodTextures('spruce', big ? 512 : 256)),
    rope: lazy(() => ropeTextures()),
    mat: lazy(() => matTextures(big ? 256 : 128)),
    sail: lazy(() => sailTextures(big ? 1024 : 512)),
    eye: lazy(() => eyeTexture()),
    flag: lazy(() => flagTexture()),
  };
  // clones of a tiled texture set with its repeat for metre uv
  const tiled = (set, extra = 1) => {
    const r = new THREE.Vector2(1 / set.tile[0], 1 / set.tile[1]).multiplyScalar(extra);
    const out = {};
    for (const k of ['map', 'normalMap', 'roughnessMap']) {
      if (!set[k]) continue;
      out[k] = set[k];
      out[k].repeat.copy(r);
    }
    return out;
  };
  const M = {};
  const mat = (name, fn) => {
    Object.defineProperty(M, name, { get: lazy(fn), enumerable: true });
  };
  mat('chrome', () => new THREE.MeshStandardMaterial({ color: col('#e3e6ea'), metalness: 1, roughness: 0.1 }));
  mat('steel', () => new THREE.MeshStandardMaterial({ color: col('#b9bdc2'), metalness: 1, roughness: 0.3 }));
  mat('bronze', () => new THREE.MeshStandardMaterial({ color: col('#c89458'), metalness: 1, roughness: 0.34 }));
  mat('rubber', () => new THREE.MeshPhysicalMaterial({ color: col('#18191b'), roughness: 0.6, sheen: 0.3, sheenRoughness: 0.6, sheenColor: col('#666a70') }));
  mat('blackGloss', () => new THREE.MeshPhysicalMaterial({ color: col('#0c0d0e'), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 }));
  mat('blackSatin', () => new THREE.MeshPhysicalMaterial({ color: col('#1b1c1e'), roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.25 }));
  mat('whitePlastic', () => new THREE.MeshPhysicalMaterial({ color: col('#e6e6e1'), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12 }));
  mat('fender', () => new THREE.MeshPhysicalMaterial({ color: col('#ebebe6'), roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.15, sheen: 0.3 }));
  mat('windscreen', () => glassMaterial('#5b6b66', 0.34));
  mat('visor', () => glassMaterial('#3a4248', 0.55));
  mat('gauge', () => new THREE.MeshPhysicalMaterial({ color: col('#0b0c0d'), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.02 }));
  mat('flag', () => new THREE.MeshStandardMaterial({ map: tex.flag(), roughness: 0.75, side: THREE.DoubleSide }));
  mat('teak', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, ...tiled(tex.teak()), roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) }));
  const vinyl = (c) => new THREE.MeshPhysicalMaterial({
    color: col(c), ...tiled(tex.vinyl()), roughness: 1, normalScale: new THREE.Vector2(0.7, 0.7),
    sheen: 0.35, sheenRoughness: 0.5, sheenColor: col('#ffffff'), clearcoat: 0.25, clearcoatRoughness: 0.35,
  });
  mat('vinylCream', () => vinyl('#e2d6bb'));
  mat('vinylBlack', () => vinyl('#1a1b1d'));
  mat('vinylBlue', () => vinyl('#2a5f9e'));
  const varnish = (set) => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, ...tiled(set), roughness: 0.42, normalScale: new THREE.Vector2(0.3, 0.3), clearcoat: 1, clearcoatRoughness: 0.07,
  });
  mat('mahogany', () => varnish(tex.mahogany()));
  mat('spruce', () => varnish(tex.spruce()));
  const rope = (c) => new THREE.MeshPhysicalMaterial({
    color: col(c), ...tiled(tex.rope()), roughness: 0.85, sheen: 0.5, sheenRoughness: 0.6, sheenColor: col('#ffffff'),
  });
  mat('ropeCream', () => rope('#e9e2cf'));
  mat('ropeNavy', () => rope('#2b3f66'));
  mat('mat', () => new THREE.MeshPhysicalMaterial({ color: col('#2d3033'), ...tiled(tex.mat()), roughness: 1 }));
  mat('matGrey', () => new THREE.MeshPhysicalMaterial({ color: col('#8d949b'), ...tiled(tex.mat()), roughness: 1 }));
  mat('sail', () => sailMaterial(tex.sail()));
  mat('eye', () => new THREE.MeshPhysicalMaterial({ map: tex.eye(), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 }));
  mat('speedHull', () => hullPaint({
    top: '#ebebe6', stripe: '#d4463a', pin: '#1f2a44', boot: '#d4463a', bottom: '#e4e4de', deck: '#e9e8e2',
    stripeG: [0.07, 0.19, 0.225, 0.237], bootY: [0.03, 0.1, -9, 0], rough: 0.14, bottomRough: 0.22, bottomCoat: 0.8, deckRough: 0.3,
  }));
  mat('sailHull', () => hullPaint({
    top: '#1b2c52', stripe: '#ecebe4', pin: '#ecebe4', boot: '#ecebe4', bottom: '#8e3526', deck: '#e4dcc6',
    stripeG: [0.03, 0.07, -2, -2], bootY: [0.0, 0.045, 0.0, 0], rough: 0.2, bottomRough: 0.75, bottomCoat: 0, deckRough: 0.42,
    planks: 7, lap: 0.009, peel: 0.0002, coatRough: 0.07, deckCoat: 0.5,
  }));
  mat('jetHull', () => hullPaint({
    top: '#ecece8', stripe: '#0f9aa0', pin: '#2a2d31', boot: '#ecece8', bottom: '#e6e6e1', deck: '#0e98a0',
    stripeG: [0.0, 0.2, 0.225, 0.245], bootY: [-9, -9, -9, 0], rough: 0.12, bottomRough: 0.2, bottomCoat: 0.9, deckRough: 0.16,
  }));
  mat('duckYellow', () => inflatable({ color: '#f7bf00', seamA: [1, 0, 0, 0], seamAFrom: 0.62, seamB: [0, 1, 0, 0.4], glow: 0.07 }));
  mat('duckHead', () => inflatable({ color: '#f7bf00', seamA: [1, 0, 0, 0], seamAFrom: 0.55, seamB: [0, 1, 0, 0.12], glow: 0.07 }));
  mat('beak', () => inflatable({ color: '#e9780f', seamA: [0, 1, 0, 0.728], seamAFrom: -9, glow: 0.05, wobble: 0.0005 }));
  mat('collar', () => inflatable({ color: '#44576b', rough: 0.4, coatRough: 0.14, seamB: [0, 1, 0, 0.04], seamBMaxNy: 0.35, glow: 0.02 }));
  LIB = { tex, M, made };
  return LIB;
}

function releaseLibrary() {
  if (--libUsers > 0 || !LIB) return;
  // only what was actually made: textures and materials are created lazily
  for (const v of LIB.made) {
    if (v.isMaterial || v.isTexture) v.dispose();
    else for (const t of Object.values(v)) if (t && t.isTexture) t.dispose();
  }
  LIB = null;
}

// Ghost: a pale blue-white glow, strongest at the silhouette.
function ghostMaterial(side) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0.72, 0.88, 1.0) }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
void main() {
  float nv = abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(1.0 - nv, 2.2);
  gl_FragColor = vec4(uColor * (0.55 + 1.4 * rim), (0.07 + 0.55 * rim) * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    transparent: true,
    depthWrite: false,
    side,
  });
}

// ================================================================ boat kit

// Collects geometries per material, then makes one mesh per material.
function kit(M) {
  const lists = new Map();
  return {
    add(name, g) {
      if (!lists.has(name)) lists.set(name, []);
      lists.get(name).push(g);
      return g;
    },
    build(group, { noShadow = [] } = {}) {
      const meshes = {};
      for (const [name, list] of lists) {
        const mesh = new THREE.Mesh(merge(list), M[name]);
        mesh.castShadow = !noShadow.includes(name);
        mesh.receiveShadow = true;
        mesh.name = name;
        group.add(mesh);
        meshes[name] = mesh;
      }
      return meshes;
    },
  };
}

function mesh(g, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(g, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// Emissive lens whose glow the horn can flash.
function lensMaterial(color, glow) {
  return new THREE.MeshPhysicalMaterial({
    color: col(color), emissive: col(glow), emissiveIntensity: 0.4, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02,
  });
}

// A little flag: a grid that streams out along +z from its luff (x = 0 edge)
// and ripples in the wind, updated on the CPU.
function makeFlag(w, h, uv0, uv1, cols = 10, rows = 4) {
  const count = (cols + 1) * (rows + 1);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const idx = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const k = j * (cols + 1) + i;
      uv[k * 2] = lerp(uv0[0], uv1[0], i / cols);
      uv[k * 2 + 1] = lerp(uv0[1], uv1[1], j / rows);
      if (i < cols && j < rows) idx.push(k, k + cols + 1, k + 1, k + 1, k + cols + 1, k + cols + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, w / 2), w + h);
  // taper: 1 = rectangle, 0 = triangle (a pennant or burgee)
  const taper = 0.1;
  return {
    geometry: g,
    update(t, strength, phase = 0) {
      const amp = 0.02 + 0.07 * (1 - strength * 0.5);
      for (let j = 0; j <= rows; j++) {
        for (let i = 0; i <= cols; i++) {
          const k = j * (cols + 1) + i;
          const u = i / cols;
          const v = j / rows - 0.5;
          const hh = h * (1 - u * (1 - taper));
          const wave = Math.sin(u * 7.5 - t * (9 + 7 * strength) + phase) * amp * u + Math.sin(u * 13 - t * 15 + phase * 2) * amp * 0.3 * u;
          const droop = (1 - strength) * 0.35 * u * u * w;
          pos[k * 3] = wave;
          pos[k * 3 + 1] = v * hh - droop;
          pos[k * 3 + 2] = u * w * (1 - 0.08 * (1 - strength));
        }
      }
      gridNormals(pos, nor, cols + 1, rows + 1);
      g.attributes.position.needsUpdate = true;
      g.attributes.normal.needsUpdate = true;
    },
  };
}

// Normals of a (w x h) vertex grid from central differences.
function gridNormals(pos, nor, w, h) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(w - 1, i + 1);
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(h - 1, j + 1);
      const a = (j * w + i0) * 3;
      const b = (j * w + i1) * 3;
      const c = (j0 * w + i) * 3;
      const d = (j1 * w + i) * 3;
      const ux = pos[b] - pos[a];
      const uy = pos[b + 1] - pos[a + 1];
      const uz = pos[b + 2] - pos[a + 2];
      const vx = pos[d] - pos[c];
      const vy = pos[d + 1] - pos[c + 1];
      const vz = pos[d + 2] - pos[c + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      const o = (j * w + i) * 3;
      if (l < 1e-10) {
        // a row pinched to a point (a sail's head): keep the row below's
        const p = ((j > 0 ? j - 1 : j + 1) * w + i) * 3;
        nor[o] = nor[p];
        nor[o + 1] = nor[p + 1];
        nor[o + 2] = nor[p + 2] || 1;
        continue;
      }
      nor[o] = nx / l;
      nor[o + 1] = ny / l;
      nor[o + 2] = nz / l;
    }
  }
}

// Cleat: a horn on two feet, along z, sitting on y = 0.
function cleat(len = 0.15) {
  const r = len * 0.07;
  const horn = new THREE.CapsuleGeometry(r, len - 2 * r, 4, 8);
  xf(horn, [0, len * 0.2, 0], [Math.PI / 2, 0, 0]);
  const f1 = xf(new THREE.CylinderGeometry(r * 0.9, r * 1.3, len * 0.2, 8), [0, len * 0.1, -len * 0.18]);
  const f2 = xf(new THREE.CylinderGeometry(r * 0.9, r * 1.3, len * 0.2, 8), [0, len * 0.1, len * 0.18]);
  return merge([horn, f1, f2]);
}

// ================================================================ speedboat

function buildSpeedboat(M, tier) {
  const group = new THREE.Group();
  const K = kit(M);
  const hi = tier !== 'low';
  const L = 4.6;
  const z0 = -2.3;
  const zAt = (s) => z0 + s * L;
  const sheerY = (s) => 0.7 + 0.3 * Math.pow(1 - s, 2.4);
  const sheerHB = (s) => 0.95 * Math.pow(Math.sin((Math.min(1, s / 0.58) * Math.PI) / 2), 0.8) * (1 - 0.055 * smoothstep(0.7, 1, s));
  const S_FF = 0.32;
  const SC0 = 0.09;
  const keelY = (s) => (s < S_FF ? -0.33 + (sheerY(0) + 0.33) * Math.pow(1 - s / S_FF, 1.45) : -0.33);
  const chineY = (s) => (s <= SC0 ? keelY(s) : -0.05 + (keelY(SC0) + 0.05) * Math.pow(1 - smoothstep(SC0, 0.6, s), 1.6));
  const chineHB = (s) => (s <= SC0 ? 0 : 0.8 * Math.pow(Math.sin((Math.PI / 2) * Math.min(1, (s - SC0) / (0.62 - SC0))), 0.75) * (1 - 0.03 * smoothstep(0.7, 1, s)));

  // starboard half-section, sheer down to keel, [x, y]
  const NT = hi ? 10 : 7;
  const NB = hi ? 9 : 6;
  const halfSection = (s) => {
    const yS = sheerY(s);
    const hS = sheerHB(s);
    const yK = keelY(s);
    const yC = chineY(s);
    const hC = chineHB(s);
    const flat = 0.035 * smoothstep(0.1, 0.3, s);
    const cx = hC + flat;
    const cy = yC + 0.004 * smoothstep(0.1, 0.3, s);
    const pts = [];
    for (let k = 0; k <= NT; k++) {
      const t = k / NT;
      pts.push([lerp(hS, cx, t) + 0.02 * Math.sin(Math.PI * t) * smoothstep(0.0, 0.1, s), lerp(yS, cy, t)]);
    }
    pts.push([cx, cy]);
    pts.push([hC, yC], [hC, yC]);
    // two lifting strakes on the bottom, as small steps
    for (let k = 1; k <= NB; k++) {
      const t = k / NB;
      const b = 0.012 * Math.sin(Math.PI * t) * (hC / 0.8);
      pts.push([hC * (1 - t), lerp(yC, yK, t) - b]);
      if (k === Math.round(NB * 0.33) || k === Math.round(NB * 0.66)) {
        const p = pts[pts.length - 1];
        pts.push([p[0], p[1]], [p[0] - 0.02 * (hC / 0.8), p[1] - 0.012 * (hC / 0.8)], [p[0] - 0.02 * (hC / 0.8), p[1] - 0.012 * (hC / 0.8)]);
      }
    }
    return pts;
  };
  const fullSection = (s) => {
    const h = halfSection(s);
    const z = zAt(s);
    const out = h.map(([x, y]) => [x, y, z]);
    for (let i = h.length - 1; i >= 0; i--) out.push([-h[i][0], h[i][1], z]);
    return out;
  };
  const NS = hi ? 64 : 40;
  const sList = [];
  for (let k = 0; k <= NS; k++) sList.push(Math.pow(k / NS, 1.35));
  const hullRows = sList.map(fullSection);
  K.add('speedHull', loft(hullRows, { zone: 0 }));

  // deck, gunwales, cockpit liner and floor as one loft; a doubled station
  // makes the dash and the aft bulkhead vertical walls
  const S_DASH = 0.42;
  const S_AFT = 0.9;
  const yF = 0.14;
  const topHalf = (s, state) => {
    const yS = sheerY(s);
    const hS = sheerHB(s);
    if (state === 'pit') {
      return [
        [hS, yS], [hS - 0.018, yS + 0.014], [hS - 0.12, yS + 0.016], [hS - 0.142, yS - 0.004], [hS - 0.155, yS - 0.09],
        [hS - 0.175, lerp(yS, yF, 0.55)], [hS - 0.2, yF], [hS - 0.2, yF], [(hS - 0.2) * 0.5, yF], [0, yF],
      ];
    }
    const crown = state === 'fore' ? 0.06 : 0.012;
    // near the stem everything shrinks to the stem head
    const f = Math.min(1, hS / 0.15);
    const out = [[hS, yS], [hS - 0.018 * f, yS + 0.014 * f]];
    for (let k = 0; k < 8; k++) {
      const x = (hS - 0.1 * f) * (1 - k / 7);
      out.push([x, yS + 0.016 * f + crown * f * (1 - (x / Math.max(hS, 1e-3)) ** 2)]);
    }
    return out;
  };
  const topRow = (s, state) => {
    const h = topHalf(s, state);
    const z = zAt(s);
    const out = h.map(([x, y]) => [x, y, z]);
    for (let i = h.length - 2; i >= 0; i--) out.push([-h[i][0], h[i][1], z]);
    return out;
  };
  const topRows = [];
  let phase = 'fore';
  for (const s of sList) {
    if (phase === 'fore' && s >= S_DASH) {
      topRows.push(topRow(S_DASH, 'fore'), topRow(S_DASH, 'fore'), topRow(S_DASH + 0.0004, 'pit'), topRow(S_DASH + 0.0004, 'pit'));
      phase = 'pit';
    }
    if (phase === 'pit' && s >= S_AFT) {
      topRows.push(topRow(S_AFT, 'pit'), topRow(S_AFT, 'pit'), topRow(S_AFT + 0.0004, 'aft'), topRow(S_AFT + 0.0004, 'aft'));
      phase = 'aft';
    }
    topRows.push(topRow(s, phase));
  }
  K.add('speedHull', loft(topRows, { zone: 1, flip: true }));

  // transom: outer section plus the rear deck's edge, as one flat face
  {
    const outer = hullRows[hullRows.length - 1];
    const deck = topRows[topRows.length - 1];
    const ring = [...outer, ...deck.slice().reverse()].map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const c = new THREE.Vector3(0, 0.25, zAt(1));
    const g = fan(ring, c, new THREE.Vector3(0, 0, 1));
    const p = g.attributes.position;
    const gi = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) gi.set([sheerY(1) - p.getY(i), 0, 1], i * 3);
    g.setAttribute('aGirth', new THREE.BufferAttribute(gi, 3));
    g.setAttribute('aZone', new THREE.BufferAttribute(new Float32Array(p.count), 1));
    K.add('speedHull', g);
  }

  // teak overlay on the cockpit sole
  {
    const rows = [];
    const sa = S_DASH + 0.012;
    const sb = S_AFT - 0.012;
    for (let k = 0; k <= 16; k++) {
      const s = lerp(sa, sb, k / 16);
      const e = Math.min(k, 16 - k) / 16;
      const w = (sheerHB(s) - 0.225) * (e < 0.06 ? 0.94 + e : 1);
      const row = [];
      for (let i = 0; i <= 6; i++) row.push([lerp(w, -w, i / 6), yF + 0.008, zAt(s)]);
      rows.push(row);
    }
    const g = loft(rows, { flip: true });
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i), p.getX(i) + 0.4);
    // edges of the mat
    K.add('teak', g);
  }

  // helm console on the starboard side, dash face and gauges, wheel
  const zDash = zAt(S_DASH);
  {
    const pod = roundedBox(0.52, 0.6, 0.26, 0.04);
    xf(pod, [0.43, yF + 0.3, zDash + 0.12]);
    K.add('speedHull', zoned(pod, 1));
    // sloping dash panel from the pod up to the windscreen, with gauges
    const th = 0.38;
    const pc = new THREE.Vector3(0.43, yF + 0.64, zDash + 0.125);
    const panel = roundedBox(0.52, 0.04, 0.29, 0.015);
    xf(panel, pc.toArray(), [th, 0, 0]);
    K.add('speedHull', zoned(panel, 1));
    const nrm = new THREE.Vector3(0, Math.cos(th), Math.sin(th));
    const along = new THREE.Vector3(0, -Math.sin(th), Math.cos(th));
    for (const [gx, gr, ga] of [[-0.12, 0.045, 0.02], [0.12, 0.045, 0.02], [0, 0.034, -0.03]]) {
      const c = pc.clone().addScaledVector(nrm, 0.022).addScaledVector(along, ga).add(new THREE.Vector3(gx, 0, 0));
      K.add('gauge', xf(new THREE.CylinderGeometry(gr, gr, 0.008, 20), c.toArray(), [th, 0, 0]));
      K.add('chrome', xf(new THREE.TorusGeometry(gr, 0.0055, 6, 20), c.addScaledVector(nrm, 0.004).toArray(), [th - Math.PI / 2, 0, 0]));
    }
  }
  const wheel = new THREE.Group();
  wheel.position.set(0.43, yF + 0.47, zDash + 0.36);
  wheel.rotation.x = -0.45;
  {
    const rim = new THREE.TorusGeometry(0.165, 0.014, 8, 36);
    const hub = xf(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 14), [0, 0, 0.0], [Math.PI / 2, 0, 0]);
    const spokes = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + Math.PI / 2;
      spokes.push(rod(new THREE.Vector3(0, 0, 0.01), new THREE.Vector3(Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0.02), 0.009, 6));
    }
    const shaft = rod(new THREE.Vector3(0, 0, -0.02), new THREE.Vector3(0, 0, -0.14), 0.018, 8);
    wheel.add(mesh(rim, M.blackSatin), mesh(merge([hub, ...spokes, shaft]), M.chrome));
  }
  group.add(wheel);

  // seats: two bucket seats and a bench across the stern
  const seat = (x, z, w) => {
    const base = roundedBox(w * 0.78, 0.3, 0.4, 0.04);
    xf(base, [x, yF + 0.15, z]);
    K.add('speedHull', zoned(base, 1));
    const c = cushion(w, 0.46, 0.1, 4);
    xf(c, [x, yF + 0.3, z]);
    K.add('vinylCream', c);
    const back = cushion(w * 0.92, 0.42, 0.08, 4);
    xf(back, [0, 0, 0], [-Math.PI / 2 + 0.2, 0, 0]);
    xf(back, [x, yF + 0.62, z + 0.19]);
    K.add('vinylCream', back);
    // the back of the seat: a padded vinyl panel with a rounded top
    const shell = roundedBox(w + 0.02, 0.5, 0.09, 0.04, [2, 2, 1]);
    const sp = shell.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const yy = sp.getY(i);
      const xx = sp.getX(i) / ((w + 0.02) / 2);
      // round the shoulders of the backrest
      if (yy > 0.12) sp.setY(i, 0.12 + (yy - 0.12) * (1 - 0.35 * xx * xx));
    }
    boxUV(shell);
    const su = shell.attributes.uv;
    for (let i = 0; i < sp.count; i++) su.setXY(i, sp.getY(i), sp.getX(i) / (w + 0.02) + 0.5);
    xf(shell, [0, 0, 0], [0.2, 0, 0]);
    xf(shell, [x, yF + 0.6, z + 0.265]);
    K.add('vinylCream', shell);
  };
  seat(0.43, zAt(0.58), 0.5);
  seat(-0.43, zAt(0.58), 0.5);
  {
    const zb = zAt(S_AFT) - 0.22;
    const w = 2 * (sheerHB(0.8) - 0.21);
    const base = roundedBox(w, 0.28, 0.44, 0.03);
    xf(base, [0, yF + 0.14, zb]);
    K.add('speedHull', zoned(base, 1));
    const c = cushion(w, 0.44, 0.1, 7);
    xf(c, [0, yF + 0.28, zb]);
    K.add('vinylCream', c);
    const back = cushion(w * 0.98, 0.27, 0.08, 7);
    xf(back, [0, 0, 0], [-Math.PI / 2 + 0.25, 0, 0]);
    xf(back, [0, yF + 0.52, zAt(S_AFT) - 0.06]);
    K.add('vinylCream', back);
  }

  // windscreen: wraps round from side to side over the gunwales
  {
    const zWs = zDash - 0.02;
    const path = [];
    const ns = hi ? 36 : 24;
    const sideLen = 0.3;
    const hw = sheerHB(S_DASH) - 0.07;
    const rc = 0.2;
    // plan outline: side (aft end) -> corner -> front -> corner -> side
    const straight = hw - rc;
    const total = sideLen + (Math.PI / 2) * rc + straight;
    for (let k = 0; k <= ns; k++) {
      let d = (k / ns) * 2 * total - total; // -total..total (port..stbd)
      const sg = Math.sign(d) || 1;
      d = Math.abs(d);
      let x;
      let z;
      let nx;
      let nz;
      if (d <= straight) {
        x = d;
        z = zWs;
        nx = 0;
        nz = -1;
      } else if (d <= straight + (Math.PI / 2) * rc) {
        const a = (d - straight) / rc;
        x = straight + Math.sin(a) * rc;
        z = zWs + rc - Math.cos(a) * rc;
        nx = Math.sin(a);
        nz = -Math.cos(a);
      } else {
        x = hw;
        z = zWs + rc + (d - straight - (Math.PI / 2) * rc);
        nx = 1;
        nz = 0;
      }
      path.push({ x: x * sg, z, nx: nx * sg, nz });
    }
    const deckAt = (x, z) => {
      const s = (z - z0) / L;
      const hS = sheerHB(s);
      if (z <= zDash) return sheerY(s) + 0.016 + 0.06 * (1 - (x / hS) ** 2);
      return sheerY(s) + 0.016;
    };
    const H = 0.35;
    const lean = 0.16;
    const bottom = path.map((p) => new THREE.Vector3(p.x, deckAt(p.x, p.z) + 0.012, p.z));
    const top = path.map((p, i) => new THREE.Vector3(p.x - p.nx * lean, bottom[i].y + H, p.z - p.nz * lean));
    // glass is a sheet: loft two rows across, curved along the path
    const glass = loft([bottom.map((v) => [v.x, v.y, v.z]), top.map((v) => [v.x, v.y, v.z])]);
    K.add('windscreen', glass);
    K.add('chrome', sweep(top, circle(0.011, 8), { caps: true }));
    K.add('rubber', sweep(bottom, circle(0.012, 6), { caps: true }));
    for (const i of [0, ns]) K.add('chrome', rod(bottom[i], top[i], 0.012, 8));
  }

  // rubbing strake: black rubber D-section round the sheer with a chrome insert
  {
    const path = [];
    const ns = hi ? 60 : 36;
    for (let k = ns; k >= 1; k--) {
      const s = Math.pow(k / ns, 1.2);
      path.push(new THREE.Vector3(sheerHB(s), sheerY(s) - 0.035, zAt(s)));
    }
    path.push(new THREE.Vector3(0, sheerY(0) - 0.035, zAt(0) - 0.01));
    for (let k = 1; k <= ns; k++) {
      const s = Math.pow(k / ns, 1.2);
      path.push(new THREE.Vector3(-sheerHB(s), sheerY(s) - 0.035, zAt(s)));
    }
    // across the transom
    for (let k = 1; k < 8; k++) path.push(new THREE.Vector3(lerp(-sheerHB(1), sheerHB(1), k / 8), sheerY(1) - 0.035, zAt(1) + 0.002));
    const outward = (i, T) => {
      const p = path[i];
      const o = new THREE.Vector3(T.z, 0, -T.x);
      const toward = new THREE.Vector3(p.x, 0, p.z - 0.4);
      if (o.dot(toward) < 0) o.negate();
      return o;
    };
    const D = [[0, -0.028], [0.012, -0.028]];
    for (let k = 1; k < 8; k++) {
      const a = -Math.PI / 2 + (k / 8) * Math.PI;
      D.push([0.012 + Math.cos(a) * 0.028, Math.sin(a) * 0.028]);
    }
    D.push([0.012, 0.028], [0, 0.028]);
    D.push([0, 0.028]);
    D.unshift([0, -0.028]);
    K.add('rubber', sweep(path, D, { closed: true, frame: outward }));
    const insert = path.map((p, i) => {
      const T = path[(i + 1) % path.length].clone().sub(path[(i - 1 + path.length) % path.length]).normalize();
      return p.clone().addScaledVector(outward(i, T).normalize(), 0.038);
    });
    K.add('chrome', sweep(insert, circle(0.006, 6), { closed: true }));
  }

  // fenders hanging on each side, with their lines
  for (const sd of [1, -1]) {
    const s = 0.55;
    const x = sd * (sheerHB(s) + 0.09);
    const top = sheerY(s) - 0.12;
    const f = lathe([[0.001, 0], [0.03, 0.004], [0.055, 0.02], [0.07, 0.06], [0.072, 0.2], [0.07, 0.34], [0.055, 0.38], [0.03, 0.396], [0.001, 0.4]], 18);
    xf(f, [x, top - 0.4, zAt(s)], [0, 0, sd * 0.06]);
    K.add('fender', f);
    const eye = xf(new THREE.TorusGeometry(0.018, 0.006, 6, 12), [x, top + 0.012, zAt(s)], [0, Math.PI / 2, 0]);
    K.add('fender', eye);
    K.add('rubber', rod(new THREE.Vector3(x, top + 0.02, zAt(s)), new THREE.Vector3(sd * (sheerHB(s) - 0.06), sheerY(s) + 0.03, zAt(s) + 0.04), 0.006, 6, false));
  }

  // deck hardware: bow cleat, bow eye, grab rails, stern cleats, horns, lights
  {
    const bc = cleat(0.16);
    xf(bc, [0, sheerY(0.08) + 0.06, zAt(0.08)]);
    K.add('chrome', bc);
    for (const sd of [1, -1]) {
      const sc = cleat(0.15);
      xf(sc, [sd * (sheerHB(0.94) - 0.08), sheerY(0.94) + 0.028, zAt(0.94)]);
      K.add('chrome', sc);
      // low grab rail along the foredeck edge
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const s = lerp(0.14, 0.36, k / 10);
        const hS = sheerHB(s) - 0.07;
        const lift = k === 0 || k === 10 ? 0.0 : 0.065;
        pts.push(new THREE.Vector3(sd * hS, sheerY(s) + 0.016 + 0.06 * (1 - (hS / sheerHB(s)) ** 2) + lift, zAt(s)));
      }
      const rail = [pts[0], pts[0].clone().setY(pts[0].y + 0.06), ...pts.slice(1, 10), pts[10].clone().setY(pts[10].y + 0.06), pts[10]];
      K.add('chrome', sweep(rail, circle(0.011, 8), { caps: true }));
    }
    // bow eye on the stem, 30 cm up
    let lo = 0;
    let hiS = S_FF;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hiS) / 2;
      if (keelY(mid) > 0.3) lo = mid;
      else hiS = mid;
    }
    const eye = xf(new THREE.TorusGeometry(0.03, 0.008, 6, 14), [0, 0.3, zAt(lo) - 0.022], [0, Math.PI / 2, 0]);
    K.add('chrome', eye);
    // twin trumpet horns on the foredeck
    for (const hx of [0.1, 0.22]) {
      const tr = lathe([[0.0, 0], [0.012, 0], [0.014, 0.08], [0.022, 0.12], [0.036, 0.15], [0.0385, 0.152]], 16);
      xf(tr, [hx, sheerY(0.34) + 0.075, zAt(0.34) + 0.06], [-Math.PI / 2, 0, 0]);
      K.add('chrome', tr);
    }
  }

  // outboard motor, steering on its swivel bracket
  const motor = new THREE.Group();
  motor.position.set(0, sheerY(1) - 0.08, zAt(1) + 0.1);
  motor.scale.setScalar(0.92);
  group.add(motor);
  {
    const MK = kit(M);
    // clamp bracket over the transom
    const clamp1 = roundedBox(0.2, 0.2, 0.14, 0.02);
    xf(clamp1, [0, 0.02, -0.05]);
    MK.add('blackGloss', clamp1);
    // cowling: rounded sections lofted up the engine
    const sec = (y, w, d, zc) => {
      const out = [];
      const n = 22;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const e = 2 / 4.2;
        out.push([w * Math.sign(c) * Math.abs(c) ** e, y, zc + d * Math.sign(s) * Math.abs(s) ** e * (s > 0 ? 1.12 : 0.9)]);
      }
      return out;
    };
    const cow = [];
    const prof = [[0.12, 0.15, 0.245], [0.2, 0.172, 0.285], [0.34, 0.182, 0.305], [0.55, 0.186, 0.31], [0.7, 0.18, 0.3], [0.76, 0.168, 0.285], [0.795, 0.145, 0.255], [0.812, 0.11, 0.215], [0.82, 0.06, 0.15], [0.823, 0.0, 0.0]];
    for (const [y, w, d] of prof) cow.push(sec(y, w, d, 0.3));
    MK.add('blackGloss', loft(cow, { closed: true }));
    const under = [];
    for (const [y, w, d] of [[0.0, 0.0, 0.0], [0.02, 0.1, 0.16], [0.12, 0.16, 0.25]]) under.push(sec(y, w, d, 0.3));
    MK.add('blackGloss', loft(under, { closed: true }));
    // a grey trim band where the upper and lower cowls meet
    const band = [];
    for (const [y, w, d] of [[0.335, 0.1845, 0.3085], [0.365, 0.1855, 0.31]]) band.push(sec(y, w, d, 0.3));
    MK.add('steel', loft(band, { closed: true }));
    // midsection and leg: a streamlined strut down to the gearcase
    const foil = (y, c, t, zc) => {
      const out = [];
      const n = 14;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const x = Math.sin(a) * t * (0.6 + 0.4 * Math.cos(a));
        out.push([x, y, zc + Math.cos(a) * c]);
      }
      return out;
    };
    const legBottom = -0.33 - (sheerY(1) - 0.08);
    const leg = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      leg.push(foil(lerp(0.13, legBottom, t), lerp(0.16, 0.13, t), lerp(0.075, 0.045, t), lerp(0.3, 0.26, t)));
    }
    MK.add('blackGloss', loft(leg, { closed: true }));
    // anti-ventilation plate
    const plate = roundedBox(0.3, 0.012, 0.36, 0.005);
    xf(plate, [0, legBottom + 0.03, 0.3]);
    MK.add('blackGloss', plate);
    // gearcase torpedo and skeg
    const torp = lathe([[0.0, -0.22], [0.035, -0.2], [0.058, -0.14], [0.064, 0.0], [0.06, 0.12], [0.05, 0.17]], 16);
    xf(torp, [0, legBottom - 0.07, 0.26], [Math.PI / 2, 0, 0]);
    MK.add('blackGloss', torp);
    const skeg = roundedBox(0.012, 0.2, 0.14, 0.005);
    xf(skeg, [0, legBottom - 0.16, 0.33], [0.25, 0, 0]);
    MK.add('blackGloss', skeg);
    MK.build(motor);
    // propeller: three cupped blades on a hub
    const prop = new THREE.Group();
    prop.position.set(0, legBottom - 0.07, 0.45);
    const blades = [];
    for (let k = 0; k < 3; k++) {
      const bl = new THREE.SphereGeometry(1, 10, 6);
      xf(bl, [0, 0.085, 0], [0, 0, 0], [0.055, 0.085, 0.012]);
      xf(bl, [0, 0, 0], [0, 0.45, 0]);
      xf(bl, [0, 0, 0], [0, 0, (k / 3) * TAU]);
      blades.push(bl);
    }
    const hub = lathe([[0.0, 0.07], [0.03, 0.06], [0.04, 0.02], [0.04, -0.04], [0.0, -0.05]], 14);
    xf(hub, [0, 0, 0], [Math.PI / 2, 0, 0]);
    prop.add(mesh(merge([...blades.map((b) => { b.deleteAttribute('uv'); return b; }), (hub.deleteAttribute('uv'), hub)]), M.steel));
    motor.add(prop);
    motor.userData.prop = prop;
  }

  // stern light pole (port quarter) and flagstaff with a pennant (starboard)
  const lens = lensMaterial('#f3f0e6', '#fff4d8');
  {
    const x = -(sheerHB(0.97) - 0.1);
    const y = sheerY(0.97) + 0.016;
    const z = zAt(0.97);
    K.add('chrome', rod(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + 0.95, z), 0.011, 8));
    const cap = xf(new THREE.CylinderGeometry(0.03, 0.034, 0.02, 12), [x, y + 0.965, z]);
    K.add('chrome', cap);
    const sl = xf(new THREE.SphereGeometry(0.032, 14, 10), [x, y + 0.99, z]);
    const bl = xf(roundedBox(0.07, 0.035, 0.05, 0.01), [0, sheerY(0.03) + 0.03, zAt(0.03)]);
    group.add(mesh(merge([sl, bl]), lens, { cast: false }));
    // boarding ladder over the port quarter
    const lx = -0.5;
    const top = sheerY(1) + 0.016;
    const zt = zAt(1);
    for (const dx of [-0.13, 0.13]) {
      const rail = [
        new THREE.Vector3(lx + dx, top, zt - 0.12), new THREE.Vector3(lx + dx, top + 0.05, zt - 0.06), new THREE.Vector3(lx + dx, top + 0.05, zt + 0.02),
        new THREE.Vector3(lx + dx, top - 0.04, zt + 0.08), new THREE.Vector3(lx + dx, -0.35, zt + 0.1),
      ];
      K.add('chrome', sweep(rail, circle(0.011, 8), { caps: true }));
    }
    for (const ry of [0.32, 0.02, -0.28]) K.add('chrome', rod(new THREE.Vector3(lx - 0.13, ry, zt + 0.095), new THREE.Vector3(lx + 0.13, ry, zt + 0.095), 0.012, 8));
  }
  const flagX = sheerHB(0.97) - 0.1;
  const flagY = sheerY(0.97) + 0.016;
  const flagZ = zAt(0.97);
  K.add('chrome', rod(new THREE.Vector3(flagX, flagY, flagZ), new THREE.Vector3(flagX, flagY + 0.7, flagZ), 0.008, 8));
  const flag = makeFlag(0.34, 0.2, [0.02, 0.02], [0.48, 0.98]);
  const flagMesh = mesh(flag.geometry, M.flag);
  flagMesh.position.set(flagX, flagY + 0.58, flagZ + 0.01);
  group.add(flagMesh);

  K.build(group, { noShadow: ['windscreen'] });

  let propAngle = 0;
  let steer = 0;
  let flash = 0;
  return {
    group,
    lens,
    update(dt, st) {
      steer = damp(steer, st.turn, 6, dt);
      motor.rotation.y = steer * 0.4;
      wheel.rotation.z = -steer * 1.4;
      motor.rotation.x = st.airborne ? -0.05 : 0;
      const spin = 7 + 16 * st.throttle + 10 * st.boost + (st.airborne ? 10 : 0);
      propAngle = (propAngle + spin * dt) % TAU;
      motor.userData.prop.rotation.z = propAngle;
      const w = st.windLocal;
      if (Math.hypot(w.x, w.z) > 0.3) flagMesh.rotation.y = Math.atan2(w.x, w.z);
      flag.update(st.time, clamp(0.35 + st.speed01 * 0.8, 0, 1));
      flash = Math.max(0, flash - dt);
      lens.emissiveIntensity = 0.4 + (flash > 0 ? 7 * (Math.sin(flash * 25) > 0 ? 1 : 0.1) : 0);
    },
    horn() {
      flash = 0.7;
    },
  };
}

// ================================================================ sailboat

function buildSailboat(M, tier, T) {
  const group = new THREE.Group();
  const K = kit(M);
  const hi = tier !== 'low';
  const L = 4.2;
  const z0 = -2.1;
  const zAt = (s) => z0 + s * L;
  const sheerY = (s) => 0.525 + 0.2 * Math.pow(1 - s, 2.4) + 0.03 * s * s * s;
  const sheerHB = (s) => (s <= 0.56 ? 0.8 * Math.pow(Math.sin((s / 0.56) * (Math.PI / 2)), 0.85) : 0.8 - 0.19 * Math.pow(smoothstep(0.56, 1, s), 1.4));
  const S_FF = 0.14;
  const keelY = (s) => {
    if (s < S_FF) {
      const u = 1 - s / S_FF;
      return -0.2 + (sheerY(0) + 0.2) * (1 - Math.pow(1 - Math.pow(u, 2.5), 0.4));
    }
    return -0.2 + 0.13 * Math.pow(smoothstep(0.55, 1, s), 1.5);
  };
  // round-bilge half-section, keel to sheer, as a cubic Bezier
  const NP = hi ? 22 : 14;
  const halfSection = (s) => {
    const yS = sheerY(s);
    const hS = sheerHB(s);
    const yK = keelY(s);
    const bow = 1 - smoothstep(0.02, 0.42, s);
    const H = yS - yK;
    const p0 = [0.02 * (1 - bow), yK];
    const p1 = [lerp(0.5, 0.18, bow) * hS, yK + lerp(0.02, 0.3, bow) * H];
    const p2 = [lerp(0.99, 0.72, bow) * hS, yK + lerp(0.22, 0.55, bow) * H];
    const p3 = [hS, yS];
    const pts = [];
    for (let k = NP; k >= 0; k--) {
      const t = k / NP;
      const a = (1 - t) ** 3;
      const b = 3 * (1 - t) ** 2 * t;
      const c = 3 * (1 - t) * t * t;
      const d = t ** 3;
      pts.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
    }
    pts.push([0, yK]);
    return pts; // sheer first, keel last
  };
  const full = (h, z) => {
    const out = h.map(([x, y]) => [x, y, z]);
    for (let i = h.length - 1; i >= 0; i--) out.push([-h[i][0], h[i][1], z]);
    return out;
  };
  const NS = hi ? 60 : 36;
  const sList = [];
  for (let k = 0; k <= NS; k++) sList.push(Math.pow(k / NS, 1.2));
  const outerRows = sList.map((s) => full(halfSection(s), zAt(s)));
  K.add('sailHull', loft(outerRows, { zone: 0 }));
  // inside of the planking: the same shape 14 mm in
  const inset = (h, d) => h.map(([x, y], i) => {
    const a = h[Math.max(0, i - 1)];
    const b = h[Math.min(h.length - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    // the outward normal of a sheer-to-keel half is (-ty, tx)
    return [Math.max(0, x + (ty / l) * d), y - (tx / l) * d];
  });
  const innerRows = sList.map((s) => full(inset(halfSection(s), 0.014), zAt(s)));
  K.add('sailHull', loft(innerRows, { zone: 1, flip: true }));
  // gunwale strip joining the two skins at the sheer
  {
    const rows = sList.map((s) => {
      const o = halfSection(s)[0];
      const i = inset(halfSection(s), 0.014)[0];
      return [[o[0], o[1], zAt(s)], [i[0], i[1], zAt(s)]];
    });
    K.add('sailHull', zoned(loft(rows, { flip: true }), 1));
    K.add('sailHull', zoned(loft(rows.map((r) => r.map(([x, y, z]) => [-x, y, z]))), 1));
  }
  // transom: varnished mahogany, raked slightly
  {
    const h = halfSection(1);
    const ring = full(h, zAt(1)).map((p) => new THREE.Vector3(p[0], p[1], p[2] + 0.012));
    const g = fan(ring, new THREE.Vector3(0, (sheerY(1) + keelY(1)) / 2, zAt(1) + 0.012), new THREE.Vector3(0, 0, 1));
    const g2 = fan(ring.map((p) => p.clone().setZ(p.z - 0.024)), new THREE.Vector3(0, (sheerY(1) + keelY(1)) / 2, zAt(1) - 0.012), new THREE.Vector3(0, 0, -1));
    const t = merge([g, g2]);
    const p = t.attributes.position;
    const uv = t.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getY(i));
    K.add('mahogany', t);
    // antifouling below the waterline on the transom
    const lowRing = ring.filter((v) => v.y < 0.005);
    if (lowRing.length > 2) {
      const lg = fan(lowRing.map((v) => v.clone().setZ(v.z + 0.002)), new THREE.Vector3(0, Math.min(...lowRing.map((v) => v.y)) * 0.5, zAt(1) + 0.014), new THREE.Vector3(0, 0, 1));
      K.add('sailHull', zoned(lg, 0, [1, -1, 1]));
    }
  }

  // wooden trim: outwale (rubbing strake), inwale, foredeck, thwarts, floorboards
  const gunPath = (sd, off, dy) => {
    const pts = [];
    for (let k = 0; k <= (hi ? 40 : 26); k++) {
      const s = lerp(0.015, 0.998, k / (hi ? 40 : 26));
      const o = inset(halfSection(s), off)[0];
      pts.push(new THREE.Vector3(sd * o[0], o[1] + dy, zAt(s)));
    }
    return pts;
  };
  const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2]];
  const roundRect = (w, h, r) => {
    const out = [];
    for (const [cx, cy, a0] of [[w / 2 - r, -h / 2 + r, -Math.PI / 2], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI]]) {
      for (let k = 0; k <= 3; k++) {
        const a = a0 + (k / 3) * (Math.PI / 2);
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    }
    return out;
  };
  for (const sd of [1, -1]) {
    const out = gunPath(sd, -0.018, -0.02);
    K.add('mahogany', sweep(out, roundRect(0.036, 0.05, 0.012), { caps: true, frame: (i, t) => new THREE.Vector3(sd * t.z, 0, -sd * t.x) }));
    const inn = gunPath(sd, 0.03, -0.02);
    K.add('mahogany', sweep(inn, roundRect(0.03, 0.045, 0.01), { caps: true, frame: (i, t) => new THREE.Vector3(sd * t.z, 0, -sd * t.x) }));
  }
  // foredeck: crowned, from the stem to just behind the mast
  const S_DECK = 0.24;
  {
    const rows = [];
    for (let k = 0; k <= 14; k++) {
      const s = lerp(0.0, S_DECK, Math.pow(k / 14, 1.1));
      const i0 = inset(halfSection(s), 0.0)[0];
      const hw = i0[0];
      const row = [];
      for (let i = 0; i <= 10; i++) {
        const x = lerp(hw, -hw, i / 10);
        row.push([x, sheerY(s) + 0.012 + 0.04 * (1 - (x / Math.max(hw, 1e-3)) ** 2), zAt(s)]);
      }
      rows.push(row);
    }
    const d = loft(rows, { flip: true });
    const p = d.attributes.position;
    const uv = d.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i), p.getX(i));
    K.add('mahogany', d);
    // coaming (breakwater) at its after edge, in a shallow V
    const e = rows[rows.length - 1];
    const cz = zAt(S_DECK);
    const cpath = e.map(([x, y]) => new THREE.Vector3(x * 0.92, y + 0.035, cz - 0.1 * (1 - Math.abs(x) / (Math.abs(e[0][0]) || 1)) + 0.01));
    const bw = sweep(cpath, rect(0.018, 0.08), { caps: true });
    K.add('mahogany', bw);
    // king plank: a pale spruce strip down the middle
    const kp = roundedBox(0.07, 0.006, L * S_DECK, 0.002);
    xf(kp, [0, 0, 0], [0, 0, 0]);
    const kpp = kp.attributes.position;
    for (let i = 0; i < kpp.count; i++) {
      const z = kpp.getZ(i) + zAt(S_DECK / 2);
      const s = (z - z0) / L;
      kpp.setXYZ(i, kpp.getX(i), kpp.getY(i) + sheerY(clamp(s, 0, 1)) + 0.052 + 0.001, z);
    }
    boxUV(kp, 'z');
    K.add('spruce', kp);
  }
  // aft deck, small
  {
    const rows = [];
    for (let k = 0; k <= 6; k++) {
      const s = lerp(0.9, 1.0, k / 6);
      const hw = inset(halfSection(s), 0.0)[0][0];
      const row = [];
      for (let i = 0; i <= 8; i++) {
        const x = lerp(hw, -hw, i / 8);
        row.push([x, sheerY(s) + 0.012 + 0.015 * (1 - (x / hw) ** 2), zAt(s)]);
      }
      rows.push(row);
    }
    const d = loft(rows, { flip: true });
    const p = d.attributes.position;
    const uv = d.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
    K.add('mahogany', d);
  }
  // cockpit sole just above the waterline, so the water never shows inside
  // the boat; the hull's inside below it is out of sight
  const SOLE = 0.1;
  const innerBeam = (s, y) => {
    const h = inset(halfSection(s), 0.014);
    for (let i = 0; i < h.length - 1; i++) {
      const [x0, y0] = h[i];
      const [x1, y1] = h[i + 1];
      if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) return lerp(x0, x1, (y - y0) / (y1 - y0));
    }
    return 0;
  };
  {
    const rows = [];
    for (let k = 0; k <= 16; k++) {
      const s = lerp(0.2, 0.93, k / 16);
      const hw = innerBeam(s, SOLE) + 0.004;
      const row = [];
      for (let i = 0; i <= 6; i++) row.push([lerp(hw, -hw, i / 6), SOLE, zAt(s)]);
      rows.push(row);
    }
    K.add('sailHull', zoned(loft(rows, { flip: true }), 1, [0.5, 0.5, 1]));
  }
  // ribs (steamed timbers) up each side from the sole
  for (let k = 0; k < 11; k++) {
    const s = lerp(0.27, 0.88, k / 10);
    const h = inset(halfSection(s), 0.018).filter(([, y]) => y > SOLE - 0.03);
    const z = zAt(s);
    for (const sd of [1, -1]) {
      const pts = h.filter((_, i) => i % 2 === 0 || i === h.length - 1).map(([x, y]) => new THREE.Vector3(sd * x, y, z));
      K.add('mahogany', sweep(pts, rect(0.025, 0.012), { caps: true, up: new THREE.Vector3(0, 0, 1) }));
    }
  }
  // thwarts
  const thwart = (s, y, d = 0.2) => {
    const hw = inset(halfSection(s), 0.03).reduce((best, [x, yy]) => (Math.abs(yy - y) < Math.abs(best[1] - y) ? [x, yy] : best), [0, -9])[0];
    const g = roundedBox(2 * hw, 0.028, d, 0.008);
    xf(g, [0, y, zAt(s)]);
    boxUV(g, 'x');
    return g;
  };
  const MAST_Z = zAt(0.265);
  K.add('mahogany', thwart(0.265, 0.36));
  K.add('mahogany', thwart(0.5, 0.3, 0.24));
  K.add('mahogany', thwart(0.82, 0.33, 0.22));
  // floorboards on each side of the centreboard case
  for (const sd of [1, -1]) {
    for (let k = 0; k < 4; k++) {
      const x = sd * (0.07 + k * 0.09);
      const g = roundedBox(0.07, 0.016, 1.9 - k * 0.22, 0.005);
      xf(g, [x, SOLE + 0.01, zAt(0.58)]);
      boxUV(g, 'z');
      K.add('mahogany', g);
    }
  }
  // centreboard case and centreboard
  {
    const c = roundedBox(0.05, 0.46, 0.95, 0.01);
    xf(c, [0, 0.05, zAt(0.46)]);
    boxUV(c, 'z');
    K.add('mahogany', c);
    const b = roundedBox(0.014, 0.8, 0.36, 0.006);
    xf(b, [0, -0.52, zAt(0.46) + 0.08], [0.18, 0, 0]);
    boxUV(b, 'y');
    K.add('sailHull', zoned(b, 0, [1, -1, 1]));
  }

  // mast, boom
  const MAST_TOP = 5.5;
  const rake = 0.035;
  const mastBase = new THREE.Vector3(0, -0.12, MAST_Z);
  const mastDir = new THREE.Vector3(0, Math.cos(rake), Math.sin(rake));
  const mastLen = (MAST_TOP - mastBase.y) / mastDir.y;
  const mastAt = (y) => mastBase.clone().addScaledVector(mastDir, (y - mastBase.y) / mastDir.y);
  {
    const path = [];
    for (let k = 0; k <= 10; k++) path.push(mastBase.clone().addScaledVector(mastDir, (k / 10) * mastLen));
    const m = sweep(path, circle(0.037, 12), { caps: true, scale: (t) => 1 - 0.38 * Math.max(0, t - 0.35) / 0.65, up: new THREE.Vector3(0, 0, -1) });
    const p = m.attributes.position;
    const uv = m.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setX(i, uv.getX(i));
    K.add('spruce', m);
    // mast track, halyard sheaves, bronze fittings
    K.add('bronze', xf(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), [0, 0, 0], [rake, 0, 0]).translate(...mastAt(0.37).toArray()));
    K.add('bronze', xf(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), [0, 0, 0], [rake, 0, 0]).translate(...mastAt(MAST_TOP - 0.01).toArray()));
    K.add('bronze', xf(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 12), [0, 0, 0], [rake, 0, 0]).translate(...mastAt(4.45).toArray()));
    // halyard running up the front of the mast
    K.add('ropeCream', rod(mastAt(1.2).add(new THREE.Vector3(0.012, 0, -0.04)), mastAt(MAST_TOP - 0.05).add(new THREE.Vector3(0.012, 0, -0.03)), 0.004, 5, false));
    // mast cleat
    const mc = cleat(0.1);
    xf(mc, [0, 0, 0], [Math.PI / 2 + rake, 0, 0]);
    xf(mc, mastAt(0.9).add(new THREE.Vector3(0, 0, -0.04)).toArray());
    K.add('bronze', mc);
  }
  const GOOSE_Y = 1.36;
  const boom = new THREE.Group();
  boom.position.copy(mastAt(GOOSE_Y)).add(new THREE.Vector3(0, 0, 0.04));
  group.add(boom);
  const BOOM_LEN = SAIL.main.foot + 0.12;
  {
    const b = sweep([new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(0, 0, BOOM_LEN)], roundRect(0.055, 0.075, 0.022), { caps: true, up: new THREE.Vector3(1, 0, 0) });
    boom.add(mesh(b, M.spruce));
    const fit = merge([
      xf(roundedBox(0.07, 0.05, 0.08, 0.01), [0, 0, 0.0]),
      xf(new THREE.TorusGeometry(0.02, 0.005, 6, 10), [0, -0.05, BOOM_LEN - 0.08], [0, Math.PI / 2, 0]),
      xf(roundedBox(0.064, 0.084, 0.05, 0.012), [0, 0, BOOM_LEN - 0.01]),
    ]);
    boom.add(mesh(fit, M.bronze));
  }

  // standing rigging: forestay and shrouds
  const STEM = new THREE.Vector3(0, sheerY(0) + 0.03, zAt(0) + 0.02);
  const HOUNDS = mastAt(4.45);
  const chain = (sd) => new THREE.Vector3(sd * (sheerHB(0.3) + 0.012), sheerY(0.3) - 0.02, zAt(0.3));
  K.add('steel', rod(STEM, HOUNDS.clone().add(new THREE.Vector3(0, 0, -0.03)), 0.0035, 5, false));
  for (const sd of [1, -1]) {
    K.add('steel', rod(chain(sd), HOUNDS.clone().add(new THREE.Vector3(sd * 0.03, 0, 0)), 0.003, 5, false));
    K.add('bronze', xf(roundedBox(0.012, 0.14, 0.03, 0.004), chain(sd).add(new THREE.Vector3(0, -0.05, 0)).toArray()));
  }
  K.add('bronze', xf(roundedBox(0.04, 0.03, 0.06, 0.008), STEM.toArray()));

  // rudder and tiller, hung on the transom
  const rudder = new THREE.Group();
  rudder.position.set(0, 0, zAt(1) + 0.05);
  group.add(rudder);
  {
    const blade = roundedBox(0.022, 0.78, 0.3, 0.008);
    const p = blade.attributes.position;
    // taper the blade's lower end and sweep it back
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = clamp((0.39 - y) / 0.78, 0, 1);
      p.setZ(i, p.getZ(i) * (1 - 0.35 * t * t) + 0.08 * t + 0.1);
    }
    xf(blade, [0, -0.12, 0]);
    boxUV(blade, 'y');
    const stock = roundedBox(0.07, 0.42, 0.22, 0.012);
    xf(stock, [0, 0.43, 0.08]);
    boxUV(stock, 'y');
    const tiller = sweep(
      [new THREE.Vector3(0, 0.62, 0.05), new THREE.Vector3(0, 0.66, -0.3), new THREE.Vector3(0, 0.67, -0.7), new THREE.Vector3(0, 0.66, -1.02)],
      roundRect(0.035, 0.05, 0.014),
      { caps: true, up: new THREE.Vector3(1, 0, 0), scale: (t) => 1 - 0.3 * t },
    );
    // tiller extension in varnished ash, part of the same mesh
    const ext = rod(new THREE.Vector3(0, 0.67, -0.95), new THREE.Vector3(0.18, 0.63, -1.6), 0.011, 8);
    rudder.add(mesh(merge([blade, stock, tiller, ext]), M.mahogany));
    // gudgeons on the transom stay put while the rudder swings
    for (const y of [0.1, 0.42]) K.add('bronze', xf(roundedBox(0.03, 0.04, 0.05, 0.008), [0, y, zAt(1) + 0.03]));
  }

  // sails: one mesh holding the main and the jib, reshaped every frame
  const sailTex = T.sail();
  const NU = hi ? 12 : 8;
  const NV = hi ? 20 : 12;
  const JU = hi ? 9 : 6;
  const JV = hi ? 15 : 10;
  const mainCount = (NU + 1) * (NV + 1);
  const jibCount = (JU + 1) * (JV + 1);
  const sailPos = new Float32Array((mainCount + jibCount) * 3);
  const sailNor = new Float32Array((mainCount + jibCount) * 3);
  const sailUv = new Float32Array((mainCount + jibCount) * 2);
  const sailIdx = [];
  for (let j = 0; j <= NV; j++) {
    for (let i = 0; i <= NU; i++) {
      const k = j * (NU + 1) + i;
      const v = j / NV;
      const [a, b] = sailTex.uvMain((i / NU) * mainChord(v), v * SAIL.main.luff);
      sailUv[k * 2] = a;
      sailUv[k * 2 + 1] = b;
      if (i < NU && j < NV) sailIdx.push(k, k + 1, k + NU + 1, k + 1, k + NU + 2, k + NU + 1);
    }
  }
  const J = SAIL.jib;
  for (let j = 0; j <= JV; j++) {
    for (let i = 0; i <= JU; i++) {
      const k = mainCount + j * (JU + 1) + i;
      const u = i / JU;
      const v = j / JV;
      // bilinear over the triangle: luff (tack->head) to leech (clew->head)
      const x = lerp(0, lerp(J.foot, 0, v), u);
      const y = lerp(v * J.luff, lerp(J.clewUp, J.luff, v), u);
      const [a, b] = sailTex.uvJib(x, y);
      sailUv[k * 2] = a;
      sailUv[k * 2 + 1] = b;
      if (i < JU && j < JV) sailIdx.push(k, k + 1, k + JU + 1, k + 1, k + JU + 2, k + JU + 1);
    }
  }
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.BufferAttribute(sailPos, 3));
  sailGeo.setAttribute('normal', new THREE.BufferAttribute(sailNor, 3));
  sailGeo.setAttribute('uv', new THREE.BufferAttribute(sailUv, 2));
  sailGeo.setIndex(sailIdx);
  sailGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, -0.3), 3.6);
  const sails = mesh(sailGeo, M.sail);
  group.add(sails);

  // running rigging that follows the boom and the jib clew
  const sheetGeo = rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.005, 5, false);
  const mainsheet = mesh(sheetGeo, M.ropeCream, { cast: false });
  const jibSheet = mesh(sheetGeo, M.ropeCream, { cast: false });
  group.add(mainsheet, jibSheet);
  const traveller = new THREE.Vector3(0, sheerY(0.82) - 0.03, zAt(0.82) - 0.08);
  K.add('bronze', xf(roundedBox(0.05, 0.05, 0.05, 0.012), traveller.toArray()));
  const stretch = (m, a, b) => {
    m.position.copy(a);
    const d = _tmpV.copy(b).sub(a);
    m.scale.set(1, d.length(), 1);
    m.quaternion.setFromUnitVectors(_up, d.normalize());
  };

  // burgee on a stick at the masthead, weathervaning downwind
  const burgee = new THREE.Group();
  burgee.position.copy(mastAt(MAST_TOP));
  group.add(burgee);
  const bflag = makeFlag(0.26, 0.13, [0.52, 0.04], [0.98, 0.96], 8, 3);
  const bmesh = mesh(bflag.geometry, M.flag, { cast: false });
  bmesh.position.set(0, 0.1, 0.01);
  burgee.add(bmesh);
  K.add('spruce', rod(mastAt(MAST_TOP).add(new THREE.Vector3(0, -0.02, 0)), mastAt(MAST_TOP).add(new THREE.Vector3(0, 0.13, 0)), 0.004, 5));

  // a small bronze bell on the mast: it swings when the horn sounds
  const bell = new THREE.Group();
  bell.position.copy(mastAt(1.06)).add(new THREE.Vector3(0, 0, -0.06));
  group.add(bell);
  {
    const b = lathe([[0.0, 0.0], [0.012, 0.0], [0.022, -0.012], [0.028, -0.045], [0.036, -0.07], [0.038, -0.076], [0.0, -0.076]], 16);
    const lug = xf(new THREE.TorusGeometry(0.008, 0.003, 6, 10), [0, 0.006, 0]);
    bell.add(mesh(merge([b, lug].map((g) => { g.deleteAttribute('uv'); return g; })), M.bronze));
  }

  K.build(group, { noShadow: ['steel', 'ropeCream'] });

  // --- animation state
  const st8 = { side: 1, sideS: 1, boom: 0.25, fill: 0.8, luff: 0.2, rudder: 0, bell: 0, bellV: 0, t: 0 };
  const P = new THREE.Vector3();
  const Q = new THREE.Vector3();
  const boomEnd = new THREE.Vector3();
  const clew = new THREE.Vector3();
  const head = new THREE.Vector3();
  const tack = STEM.clone().add(new THREE.Vector3(0, 0.04, 0.05));
  const jibHead = tack.clone().lerp(HOUNDS, SAIL.jib.luff / tack.distanceTo(HOUNDS));
  const jn = new THREE.Vector3();
  const chord = new THREE.Vector3();

  function shapeSails(t) {
    const { fill, luff } = st8;
    const side = st8.sideS >= 0 ? 1 : -1;
    const beta = st8.boom;
    const goose = boom.position;
    const flutterW = 13 + 4 * luff;
    // mainsail
    for (let j = 0; j <= NV; j++) {
      const v = j / NV;
      const c = mainChord(v);
      const th = beta + side * (0.05 + 0.3 * Math.pow(v, 1.3)) * (0.4 + 0.6 * fill);
      const dx = Math.sin(th);
      const dz = Math.cos(th);
      const nx = side * Math.cos(th);
      const nz = -side * Math.sin(th);
      const depth = c * fill * (0.09 + 0.05 * Math.sin(Math.PI * v)) * smoothstep(0.0, 0.14, v) * (1 + 0.04 * Math.sin(t * 0.9 + v * 2));
      P.copy(goose).addScaledVector(mastDir, 0.02 + v * SAIL.main.luff);
      for (let i = 0; i <= NU; i++) {
        const u = i / NU;
        const cam = 4 * u * (1 - u) * (1 - 0.3 * (2 * u - 1));
        let off = depth * cam;
        // luffing: ripples running aft along the cloth, biggest at the leech
        const flap = luff * (0.03 + 0.16 * Math.pow(u, 1.4)) * smoothstep(0.02, 0.2, v) *
          (Math.sin(u * c * 4.2 - t * flutterW + v * 3.1) * 0.7 + Math.sin(u * c * 7.3 - t * flutterW * 1.37 + v * 5.3) * 0.3);
        off += flap;
        const k = (j * (NU + 1) + i) * 3;
        sailPos[k] = P.x + dx * u * c + nx * off;
        sailPos[k + 1] = P.y + (luff * 0.02 * Math.sin(t * 9 + u * 6) * u);
        sailPos[k + 2] = P.z + dz * u * c + nz * off;
      }
    }
    // jib: clew sheeted to leeward, a little inside the boom's angle
    const bj = side * (0.16 + 0.5 * Math.abs(beta) * 0.6) * (0.5 + 0.5 * fill);
    clew.set(tack.x + Math.sin(bj) * J.foot * 0.98, tack.y + J.clewUp * 0.95, tack.z + Math.cos(bj) * J.foot * 0.98);
    head.copy(jibHead);
    for (let j = 0; j <= JV; j++) {
      const v = j / JV;
      P.copy(tack).lerp(head, v);
      Q.copy(clew).lerp(head, v);
      chord.copy(Q).sub(P);
      const cl = chord.length();
      jn.set(chord.z, 0, -chord.x).normalize().multiplyScalar(side);
      const depth = cl * fill * 0.11 * smoothstep(0.0, 0.1, v) * (1.0 - smoothstep(0.8, 1.0, v));
      for (let i = 0; i <= JU; i++) {
        const u = i / JU;
        const cam = 4 * u * (1 - u) * (1 - 0.25 * (2 * u - 1));
        const flap = luff * (0.02 + 0.12 * Math.pow(u, 1.3)) * Math.sin(u * cl * 5 - t * flutterW * 1.1 + v * 4);
        const off = depth * cam + flap;
        const k = (mainCount + j * (JU + 1) + i) * 3;
        sailPos[k] = P.x + chord.x * u + jn.x * off;
        sailPos[k + 1] = P.y + chord.y * u;
        sailPos[k + 2] = P.z + chord.z * u + jn.z * off;
      }
    }
    gridNormals(sailPos, sailNor, NU + 1, NV + 1);
    gridNormals(sailPos.subarray(mainCount * 3), sailNor.subarray(mainCount * 3), JU + 1, JV + 1);
    sailGeo.attributes.position.needsUpdate = true;
    sailGeo.attributes.normal.needsUpdate = true;
    // sheets
    boomEnd.set(Math.sin(beta) * (BOOM_LEN - 0.08), -0.05, Math.cos(beta) * (BOOM_LEN - 0.08)).add(boom.position);
    stretch(mainsheet, traveller, boomEnd);
    const fair = _tmpW.set(side * (sheerHB(0.45) - 0.05), sheerY(0.45) + 0.02, zAt(0.45));
    stretch(jibSheet, clew, fair);
  }

  return {
    group,
    update(dt, s) {
      st8.t = s.time;
      const w = s.windLocal;
      const ws = w ? Math.hypot(w.x, w.z) : 0;
      let awa = w && ws > 0.2 ? Math.atan2(Math.abs(w.x), w.z) : 0;
      if (w && Math.abs(w.x) > 0.15) st8.side = w.x > 0 ? 1 : -1;
      st8.sideS = damp(st8.sideS, st8.side, 2.2, dt);
      const fillT = smoothstep(0.24, 0.55, awa) * smoothstep(0.6, 2.5, ws);
      const luffT = clamp(1 - fillT + 0.8 * smoothstep(0.55, 1, Math.abs(s.turn)) + 0.7 * (1 - smoothstep(0.06, 0.3, s.speed01)), 0, 1);
      st8.luff = damp(st8.luff, luffT, 4, dt);
      st8.fill = damp(st8.fill, fillT * (1 - 0.8 * st8.luff) + 0.12, 3, dt);
      const boomAbs = clamp(awa * 0.5 - 0.06, 0.1, 1.3) * (0.6 + 0.4 * st8.fill) + st8.luff * 0.05 * Math.sin(s.time * 3.1);
      st8.boom = damp(st8.boom, st8.sideS * boomAbs, 2.2, dt);
      boom.rotation.y = st8.boom;
      boom.rotation.x = -0.02 * st8.luff * Math.sin(s.time * 5);
      st8.rudder = damp(st8.rudder, s.turn, 5, dt);
      rudder.rotation.y = st8.rudder * 0.45;
      shapeSails(s.time);
      // burgee streams downwind
      if (w && ws > 0.1) burgee.rotation.y = Math.atan2(w.x, w.z);
      bflag.update(s.time, clamp(ws / 6, 0.2, 1), 1.3);
      // bell: a damped pendulum
      st8.bellV += (-st8.bell * 60 - st8.bellV * 3) * dt;
      st8.bell += st8.bellV * dt;
      bell.rotation.x = st8.bell;
    },
    horn() {
      st8.bellV += 5;
    },
  };
}
const _tmpV = new THREE.Vector3();
const _tmpW = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// ================================================================ duck

function buildDuck(M, tier) {
  const group = new THREE.Group();
  const K = kit(M);
  const hi = tier !== 'low';
  // the body: an egg of a duck with a raised tail, fat wings, and an oval
  // cockpit scooped out of its back
  const COCK = { z: 0.12, hx: 0.47, hz: 0.6, floor: 0.2 };
  const WHEEL = { y: 0.08, z: 1.3 };
  const body = (x, y, z) => {
    let d = sdEllipsoid(x, y - 0.4, z - 0.12, 0.75, 0.52, 1.2);
    d = smin(d, sdEllipsoid(x, y - 0.55, z + 0.72, 0.64, 0.52, 0.52), 0.25);
    // tail: tipped up and back
    const ty = y - 0.82;
    const tz = z - 1.08;
    const ca = Math.cos(0.6);
    const sa = Math.sin(0.6);
    d = smin(d, sdEllipsoid(x, ty * ca + tz * sa, -ty * sa + tz * ca, 0.3, 0.2, 0.44), 0.3);
    // wings
    for (const sd of [1, -1]) {
      const wy = y - 0.56;
      const wz = z - 0.28;
      const cw = Math.cos(-0.18);
      const sw = Math.sin(-0.18);
      d = smin(d, sdEllipsoid(x - sd * 0.69, wy * cw + wz * sw, -wy * sw + wz * cw, 0.12, 0.27, 0.6), 0.07);
    }
    // cockpit
    const cut = sdRoundBox(x, y - (COCK.floor + 0.6), z - COCK.z, COCK.hx, 0.6, COCK.hz, 0.24);
    d = smax(d, -cut, 0.1);
    // well for the paddle wheel under the tail
    const well = Math.max(Math.hypot(y - WHEEL.y, z - WHEEL.z) - 0.25, Math.abs(x) - 0.25);
    d = smax(d, -well, 0.04);
    // flat underside inside the collar
    d = smax(d, -(y + 0.1), 0.05);
    return d;
  };
  const bodyGeo = surfaceNets(body, [-0.9, -0.16, -1.3], [0.9, 1.3, 1.7], hi ? 0.05 : 0.066);
  K.add('duckYellow', bodyGeo);

  // head and neck in their own group, so the head can bob and nod
  const PIV = new THREE.Vector3(0, 0.7, -0.78);
  const HC = [0, 0.85, -0.12]; // head centre, pivot space
  const headFn = (x, y, z) => {
    // a short, thick neck under a big round head with full cheeks
    let d = sdCapsule(x, y, z, 0, -0.12, 0.02, 0, 0.3, -0.05, 0.36);
    d = smin(d, sdEllipsoid(x, y - HC[1], z - HC[2], 0.45, 0.46, 0.47), 0.3);
    d = smin(d, sdEllipsoid(x, y - 0.72, z + 0.28, 0.39, 0.29, 0.35), 0.12);
    return d;
  };
  const head = new THREE.Group();
  head.position.copy(PIV);
  group.add(head);
  const headGeo = surfaceNets(headFn, [-0.5, -0.12, -0.66], [0.5, 1.46, 0.4], hi ? 0.034 : 0.046);
  head.add(mesh(headGeo, M.duckHead));
  // beak: a wide flat bill with a smile line
  // beak: a broad, flat bill, slightly upturned, with a shallow mouth line
  const beakFn = (x, y, z) => {
    // widen towards the rounded tip, like a real bill
    const w = 1 + 0.25 * clamp(-z / 0.25, 0, 1);
    let d = sdEllipsoid(x / w, y - 0.02, z + 0.05, 0.19, 0.085, 0.23);
    d = smin(d, sdEllipsoid(x / w, y + 0.045, z + 0.03, 0.16, 0.06, 0.19), 0.04);
    // a shallow mouth line along the front half
    const mouth = Math.abs(y + 0.012) - 0.0025;
    d = smax(d, -mouth - clamp((z + 0.06) * 0.4, 0, 0.02), 0.005);
    return d;
  };
  const beakGeo = surfaceNets(beakFn, [-0.3, -0.13, -0.33], [0.3, 0.13, 0.2], hi ? 0.016 : 0.022);
  xf(beakGeo, [0, 0.74, -0.52]);
  head.add(mesh(beakGeo, M.beak));
  // eyes: printed ovals set into the vinyl, found by marching from the
  // head's centre out to its surface
  {
    const eyes = [];
    for (const sd of [1, -1]) {
      const dir = new THREE.Vector3(sd * 0.6, 0.3, -0.74).normalize();
      const c = new THREE.Vector3(...HC);
      let tt = 0.8;
      for (let k = 0; k < 60; k++) {
        const p = c.clone().addScaledVector(dir, tt);
        const d = headFn(p.x, p.y, p.z);
        if (Math.abs(d) < 1e-5) break;
        tt -= d * 0.8;
      }
      const p = c.clone().addScaledVector(dir, tt);
      const e = 1e-3;
      const n = new THREE.Vector3(
        headFn(p.x + e, p.y, p.z) - headFn(p.x - e, p.y, p.z),
        headFn(p.x, p.y + e, p.z) - headFn(p.x, p.y - e, p.z),
        headFn(p.x, p.y, p.z + e) - headFn(p.x, p.y, p.z - e),
      ).normalize();
      // a gently domed disc, 8.5 x 11 cm
      const disc = new THREE.SphereGeometry(1, 20, 6, 0, TAU, 0, 0.55);
      const dp = disc.attributes.position;
      const duv = disc.attributes.uv;
      const R = Math.sin(0.55);
      for (let i = 0; i < dp.count; i++) {
        duv.setXY(i, 0.5 + (dp.getX(i) / R) * 0.5 * sd, 0.5 + (dp.getZ(i) / R) * 0.5);
      }
      xf(disc, [0, -Math.cos(0.55), 0]);
      xf(disc, [0, 0, 0], [0, 0, 0], [0.047 / R, 0.045, 0.062 / R]);
      // local frame: y along the surface normal, z along the head's "up"
      const upv = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
      const xv = new THREE.Vector3().crossVectors(n, upv);
      const basis = new THREE.Matrix4().makeBasis(xv, n, upv);
      disc.applyMatrix4(basis);
      xf(disc, p.addScaledVector(n, 0.001).toArray());
      eyes.push(disc);
    }
    head.add(mesh(merge(eyes), M.eye, { cast: false }));
  }

  // inflatable collar round the waterline, open at the stern for the wheel,
  // with its grab line and patches
  const collarPath = [];
  const cN = hi ? 72 : 48;
  const cx = 0.65;
  const cz = 1.2;
  const collarAt = (a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const e = 2 / 2.6;
    const z = 0.1 + cz * Math.sign(s) * Math.abs(s) ** e;
    const x = cx * Math.sign(c) * Math.abs(c) ** e * (1 + 0.06 * (z - 0.1) / cz);
    return new THREE.Vector3(x, 0.03, z);
  };
  const GAP = 0.64;
  const a0 = Math.PI / 2 + GAP;
  const a1 = Math.PI / 2 + TAU - GAP;
  for (let k = 0; k <= cN; k++) collarPath.push(collarAt(lerp(a0, a1, k / cN)));
  {
    let total = 0;
    for (let k = 1; k < collarPath.length; k++) total += collarPath[k].distanceTo(collarPath[k - 1]);
    const R = 0.19;
    const endCap = (t) => {
      const d = Math.min(t, 1 - t) * total;
      return d >= R ? 1 : Math.sqrt(Math.max(0.0004, 1 - (1 - d / R) ** 2));
    };
    // extend each end by the cap's length so the rounded ends sit past the last station
    const ext = (p, q) => p.clone().add(p.clone().sub(q).normalize().multiplyScalar(R));
    collarPath.unshift(ext(collarPath[0], collarPath[1]));
    collarPath.push(ext(collarPath[collarPath.length - 1], collarPath[collarPath.length - 2]));
    total += 2 * R;
    const pts = [];
    for (let k = 0; k <= 8; k++) pts.push(collarPath[0].clone().lerp(collarPath[1], k / 8));
    const pts2 = [];
    for (let k = 0; k <= 8; k++) pts2.push(collarPath[collarPath.length - 2].clone().lerp(collarPath[collarPath.length - 1], k / 8));
    const path = [...pts, ...collarPath.slice(2, -2), ...pts2];
    K.add('collar', sweep(path, circle(R, hi ? 16 : 12), { scale: endCap, caps: true }));
  }
  {
    const pts = [];
    const n = 12;
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < 6; j++) {
        const a = lerp(a0 + 0.25, a1 - 0.25, (k + j / 6) / n);
        const p = collarAt(a);
        const o = new THREE.Vector3(p.x, 0, p.z - 0.1).normalize();
        // the line hangs lower between its patches
        const phi = 0.62 - 0.5 * Math.sin((j / 6) * Math.PI);
        pts.push(p.clone().addScaledVector(o, 0.199 * Math.cos(phi)).setY(0.03 + 0.199 * Math.sin(phi)));
        if (k === n - 1 && j === 5) {
          const q = collarAt(a1 - 0.25);
          const oq = new THREE.Vector3(q.x, 0, q.z - 0.1).normalize();
          pts.push(q.clone().addScaledVector(oq, 0.199 * Math.cos(0.62)).setY(0.03 + 0.199 * Math.sin(0.62)));
        }
      }
    }
    for (let k = 0; k <= n; k++) {
      const p = collarAt(lerp(a0 + 0.25, a1 - 0.25, k / n));
      const o = new THREE.Vector3(p.x, 0, p.z - 0.1).normalize();
      const nrm = o.clone().multiplyScalar(Math.cos(0.62)).add(new THREE.Vector3(0, Math.sin(0.62), 0));
      const patch = new THREE.CylinderGeometry(0.038, 0.038, 0.01, 14);
      xf(patch, [0, 0, 0], [Math.PI / 2, 0, 0]);
      patch.lookAt(nrm);
      xf(patch, p.clone().addScaledVector(o, 0.19 * Math.cos(0.62)).setY(0.03 + 0.19 * Math.sin(0.62)).toArray());
      K.add('collar', patch);
      const ring = new THREE.TorusGeometry(0.014, 0.004, 6, 10);
      ring.lookAt(nrm);
      xf(ring, p.clone().addScaledVector(o, 0.199 * Math.cos(0.62)).setY(0.03 + 0.199 * Math.sin(0.62) + 0.004).toArray());
      K.add('steel', ring);
    }
    K.add('ropeNavy', sweep(pts, circle(0.0065, 6), { caps: true }));
  }
  // floor of the cockpit (grey non-slip) and the bench
  {
    const rows = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const z = COCK.z - COCK.hz + 0.1 + t * (2 * COCK.hz - 0.2);
      const e = Math.abs(t - 0.5) * 2;
      const w = (COCK.hx - 0.06) * Math.sqrt(Math.max(0, 1 - Math.pow(e, 6)));
      const row = [];
      for (let i = 0; i <= 6; i++) row.push([lerp(w, -w, i / 6), COCK.floor + 0.012, z]);
      rows.push(row);
    }
    const g = loft(rows, { flip: true });
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
    K.add('matGrey', g);
    const base = roundedBox(0.84, 0.28, 0.36, 0.05);
    xf(base, [0, COCK.floor + 0.14, COCK.z + 0.3]);
    K.add('whitePlastic', base);
    const c = cushion(0.86, 0.4, 0.1, 5);
    xf(c, [0, COCK.floor + 0.28, COCK.z + 0.3]);
    K.add('vinylBlue', c);
    // a pedal crank housing and steering lever in front of the bench
    const ped = roundedBox(0.2, 0.16, 0.3, 0.05);
    xf(ped, [0, COCK.floor + 0.08, COCK.z - 0.3]);
    K.add('whitePlastic', ped);
    const lever = rod(new THREE.Vector3(0, COCK.floor + 0.1, COCK.z - 0.05), new THREE.Vector3(0.0, COCK.floor + 0.48, COCK.z - 0.12), 0.014, 8);
    K.add('blackSatin', lever);
    K.add('blackSatin', xf(new THREE.SphereGeometry(0.035, 12, 8), [0, COCK.floor + 0.5, COCK.z - 0.125]));
    // inflation valve on the side
    const valve = xf(new THREE.CylinderGeometry(0.03, 0.034, 0.02, 14), [0.72, 0.62, 0.62], [0, 0, -Math.PI / 2 + 0.35]);
    K.add('whitePlastic', valve);
  }
  // paddle wheel under the tail, in a white housing
  const wheel = new THREE.Group();
  wheel.position.set(0, WHEEL.y, WHEEL.z);
  group.add(wheel);
  {
    const parts = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const pd = roundedBox(0.32, 0.12, 0.012, 0.004);
      xf(pd, [0, 0.17, 0]);
      xf(pd, [0, 0, 0], [a, 0, 0]);
      parts.push(pd);
    }
    for (const sx of [0.17, -0.17]) {
      const disc = xf(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 24), [sx, 0, 0], [0, 0, Math.PI / 2]);
      parts.push(disc);
    }
    parts.push(xf(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 10), [0, 0, 0], [0, 0, Math.PI / 2]));
    wheel.add(mesh(merge(parts), M.whitePlastic));
    for (const sx of [0.215, -0.215]) {
      const side = roundedBox(0.025, 0.32, 0.34, 0.012);
      xf(side, [sx, WHEEL.y + 0.05, WHEEL.z]);
      K.add('whitePlastic', side);
    }
  }

  K.build(group);

  const hs = { nod: 0, nodV: 0, horn: 0, turn: 0, wheel: 0 };
  return {
    group,
    update(dt, s) {
      hs.turn = damp(hs.turn, s.turn, 4, dt);
      hs.wheel = (hs.wheel + (1.2 + 5 * s.speed01 + 3 * s.boost) * dt) % TAU;
      wheel.rotation.x = hs.wheel;
      // a happy nod on the horn: a quick spring
      hs.nodV += (-hs.nod * 90 - hs.nodV * 7) * dt;
      hs.nod += hs.nodV * dt;
      const bob = 0.035 * Math.sin(s.time * 1.6) + 0.02 * Math.sin(s.time * 2.7 + 1);
      head.rotation.set(
        bob + hs.nod - 0.06 * s.speed01 + (s.airborne ? -0.08 : 0),
        -hs.turn * 0.16,
        -hs.turn * 0.12 + 0.02 * Math.sin(s.time * 1.1),
        'YXZ',
      );
    },
    horn() {
      hs.nodV += 3.2;
    },
  };
}

// ================================================================ jet ski

function buildJetski(M, tier) {
  const group = new THREE.Group();
  const K = kit(M);
  const hi = tier !== 'low';
  const L = 3.1;
  const z0 = -1.55;
  const zAt = (s) => z0 + s * L;
  const gunY = (s) => 0.3 + 0.3 * Math.pow(1 - s, 2.2);
  const gunHB = (s) => 0.575 * Math.pow(Math.sin((Math.min(1, s / 0.5) * Math.PI) / 2), 0.92) * (1 - 0.07 * smoothstep(0.82, 1, s));
  const S_FF = 0.3;
  const SC0 = 0.07;
  const keelY = (s) => (s < S_FF ? -0.26 + (gunY(0) + 0.26) * Math.pow(1 - s / S_FF, 1.5) : -0.26);
  const chineY = (s) => (s <= SC0 ? keelY(s) : -0.06 + (keelY(SC0) + 0.06) * Math.pow(1 - smoothstep(SC0, 0.55, s), 1.6));
  const chineHB = (s) => (s <= SC0 ? 0 : 0.44 * Math.pow(Math.sin((Math.PI / 2) * Math.min(1, (s - SC0) / (0.55 - SC0))), 0.75) * (1 - 0.05 * smoothstep(0.85, 1, s)));
  const NT = hi ? 8 : 6;
  const NB = hi ? 8 : 6;
  const halfSection = (s) => {
    const yS = gunY(s);
    const hS = gunHB(s);
    const yK = keelY(s);
    const yC = chineY(s);
    const hC = chineHB(s);
    const pts = [];
    for (let k = 0; k <= NT; k++) {
      const t = k / NT;
      // flared topsides: the side kicks out just under the rub rail
      pts.push([hC + (hS - hC) * Math.pow(1 - t, 1.5) + 0.012 * Math.sin(Math.PI * t) * smoothstep(0, 0.2, s), lerp(yS, yC, t)]);
    }
    pts.push([hC, yC]);
    for (let k = 1; k <= NB; k++) {
      const t = k / NB;
      pts.push([hC * (1 - t), lerp(yC, yK, t) - 0.01 * Math.sin(Math.PI * t) * (hC / 0.47)]);
    }
    return pts;
  };
  const full = (h, z, skipLast = false) => {
    const out = h.map(([x, y]) => [x, y, z]);
    for (let i = h.length - (skipLast ? 2 : 1); i >= 0; i--) out.push([-h[i][0], h[i][1], z]);
    return out;
  };
  const NS = hi ? 56 : 36;
  const sList = [];
  for (let k = 0; k <= NS; k++) sList.push(Math.pow(k / NS, 1.3));
  const hullRows = sList.map((s) => full(halfSection(s), zAt(s)));
  K.add('jetHull', loft(hullRows, { zone: 0 }));

  // upper deck: hood, footwells either side of the seat pedestal, platform
  const S_FW = 0.37;
  const S_PE = 0.87;
  const yFw = 0.27;
  const yP = 0.62;
  const xP = 0.19;
  const hoodTop = (s) => gunY(0) + 0.25 * Math.pow(smoothstep(0, 0.35, s), 0.7);
  const deckHalf = (s, state) => {
    const yG = gunY(s);
    const hG = gunHB(s);
    const q = Math.min(1, hG / 0.12);
    const lip = [[hG, yG], [hG - 0.015 * q, yG + 0.035 * q], [hG - 0.055 * q, yG + 0.042 * q]];
    if (state === 'hood') {
      const top = hoodTop(s);
      const out = [...lip];
      for (let k = 0; k < 9; k++) {
        const x = (hG - 0.07 * q) * (1 - k / 8);
        const f = Math.pow(Math.max(0, 1 - Math.pow(x / Math.max(hG, 1e-3), 2.8)), 0.45);
        out.push([x, yG + 0.042 * q + (top - yG - 0.042 * q) * f * q]);
      }
      return out;
    }
    if (state === 'well') {
      // the seat pedestal's sides lean in, as moulded
      return [...lip, [hG - 0.08, yG + 0.005], [hG - 0.09, yFw + 0.01], [hG - 0.09, yFw + 0.01], [xP + 0.06, yFw], [xP + 0.06, yFw],
        [xP + 0.035, yFw + 0.04], [xP, yP - 0.06], [xP - 0.035, yP], [0, yP + 0.012]];
    }
    // rear boarding platform, flush with the rub rail and open at the stern
    const yPl = yG + 0.012;
    const out = [[hG, yG], [hG - 0.01, yG + 0.009], [hG - 0.025, yPl]];
    for (let k = 0; k < 9; k++) out.push([(hG - 0.04) * (1 - k / 8), yPl]);
    return out;
  };
  const deckRow = (s, state) => full(deckHalf(s, state), zAt(s), true);
  const deckRows = [];
  let phase = 'hood';
  for (const s of sList) {
    if (phase === 'hood' && s >= S_FW) {
      deckRows.push(deckRow(S_FW, 'hood'), deckRow(S_FW, 'hood'), deckRow(S_FW + 0.0004, 'well'), deckRow(S_FW + 0.0004, 'well'));
      phase = 'well';
    }
    if (phase === 'well' && s >= S_PE) {
      deckRows.push(deckRow(S_PE, 'well'), deckRow(S_PE, 'well'), deckRow(S_PE + 0.0004, 'plat'), deckRow(S_PE + 0.0004, 'plat'));
      phase = 'plat';
    }
    deckRows.push(deckRow(s, phase));
  }
  K.add('jetHull', loft(deckRows, { zone: 1, flip: true }));
  // stern: closes the hull and the platform edge
  {
    const outer = hullRows[hullRows.length - 1];
    const deck = deckRows[deckRows.length - 1];
    const ring = [...outer, ...deck.slice().reverse()].map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const g = fan(ring, new THREE.Vector3(0, 0.1, zAt(1)), new THREE.Vector3(0, 0, 1));
    K.add('jetHull', zoned(g, 0, [0.5, 0.5, 1]));
  }
  // pod on the hood where the handlebars come out; display and visor
  {
    const pod = roundedBox(0.32, 0.2, 0.34, 0.07);
    xf(pod, [0, hoodTop(0.33) + 0.03, zAt(0.315)], [0.18, 0, 0]);
    K.add('jetHull', zoned(pod, 1));
    const disp = roundedBox(0.16, 0.012, 0.09, 0.004);
    xf(disp, [0, hoodTop(0.3) + 0.115, zAt(0.285)], [0.5, 0, 0]);
    K.add('gauge', disp);
    // smoked visor in front of the pod
    const rows = [];
    for (const [h, back] of [[0, 0], [0.17, 0.1]]) {
      const row = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10 - 0.5;
        row.push([t * 0.42, hoodTop(0.27) + 0.06 + h, zAt(0.255) + back + 0.1 * t * t]);
      }
      rows.push(row);
    }
    K.add('visor', loft(rows));
    // mirrors
    for (const sd of [1, -1]) {
      const stalk = rod(new THREE.Vector3(sd * 0.2, hoodTop(0.28) - 0.02, zAt(0.29)), new THREE.Vector3(sd * 0.33, hoodTop(0.28) + 0.09, zAt(0.3)), 0.01, 6);
      K.add('blackSatin', stalk);
      const housing = roundedBox(0.13, 0.075, 0.05, 0.02);
      xf(housing, [sd * 0.36, hoodTop(0.28) + 0.11, zAt(0.3)], [0, sd * 0.15, 0]);
      K.add('blackSatin', housing);
      const glass = roundedBox(0.115, 0.06, 0.004, 0.012);
      xf(glass, [sd * 0.362, hoodTop(0.28) + 0.11, zAt(0.3) + 0.026], [0, sd * 0.15, 0]);
      K.add('chrome', glass);
    }
  }
  // seat: black leatherette saddle with welted seams
  {
    const rows = [];
    const sa = 0.385;
    const sb = 0.865;
    const n = 26;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const s = lerp(sa, sb, t);
      const endF = Math.min(1, Math.min(t / 0.07, (1 - t) / 0.06));
      const ef = Math.sqrt(Math.max(0, 1 - (1 - endF) ** 2));
      const top = 0.815 - 0.035 * smoothstep(0.42, 0.55, s) + 0.03 * smoothstep(0.64, 0.74, s);
      const hw = 0.215 * (0.35 + 0.65 * ef);
      const yb = yP - 0.01;
      const hgt = (top - yb) * (0.3 + 0.7 * ef);
      const row = [];
      const m = 18;
      for (let i = 0; i <= m; i++) {
        const a = -Math.PI / 2 + (i / m) * Math.PI;
        const sn = Math.sin(a);
        const cs = Math.cos(a);
        const e = 2 / 5;
        row.push([hw * Math.sign(sn) * Math.abs(sn) ** e, yb + hgt * Math.abs(cs) ** e, zAt(s)]);
      }
      rows.push(row.reverse());
    }
    const g = loft(rows, { flip: true });
    // v measured from the top panel's edges so the stitches sit on the welts
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    const m = 19;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const cum = [0];
      for (let i = 1; i < row.length; i++) cum.push(cum[i - 1] + dist3(row[i], row[i - 1]));
      const a = cum[4];
      const b = cum[m - 5];
      for (let i = 0; i < m; i++) {
        const k = r * m + i;
        uv.setXY(k, p.getZ(k), (cum[i] - a) / (b - a));
      }
    }
    K.add('vinylBlack', g);
    // grab handle wrapped round the back of the seat
    const hp = [];
    for (let k = 0; k <= 14; k++) {
      const a = (k / 14) * Math.PI;
      hp.push(new THREE.Vector3(Math.cos(a) * 0.2, yP - 0.035, zAt(S_PE) - 0.06 + Math.sin(a) * 0.1));
    }
    K.add('blackSatin', sweep(hp, circle(0.016, 8), { caps: true }));
  }
  // footwell mats and the platform mat
  const matPiece = (s0, s1, rowAt, flip) => {
    const rows = [];
    for (let k = 0; k <= 12; k++) rows.push(rowAt(lerp(s0, s1, k / 12)));
    const g = loft(rows, { flip });
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
    K.add('mat', g);
  };
  for (const sd of [1, -1]) {
    matPiece(S_FW + 0.015, S_PE - 0.008, (s) => {
      const row = [];
      for (let i = 0; i <= 4; i++) row.push([sd * lerp(gunHB(s) - 0.1, xP + 0.04, i / 4), yFw + 0.006, zAt(s)]);
      return row;
    }, sd > 0);
  }
  matPiece(S_PE + 0.012, 0.985, (s) => {
    const row = [];
    for (let i = 0; i <= 6; i++) row.push([lerp(gunHB(s) - 0.06, -(gunHB(s) - 0.06), i / 6), gunY(s) + 0.016, zAt(s)]);
    return row;
  }, true);
  // rub rail round the gunwale, sponsons, intake grate, ride plate, tow eye
  {
    const path = [];
    const ns = hi ? 50 : 32;
    for (let k = ns; k >= 1; k--) {
      const s = Math.pow(k / ns, 1.2);
      path.push(new THREE.Vector3(gunHB(s), gunY(s) - 0.005, zAt(s)));
    }
    path.push(new THREE.Vector3(0, gunY(0) - 0.005, zAt(0) - 0.012));
    for (let k = 1; k <= ns; k++) {
      const s = Math.pow(k / ns, 1.2);
      path.push(new THREE.Vector3(-gunHB(s), gunY(s) - 0.005, zAt(s)));
    }
    for (let k = 1; k < 6; k++) path.push(new THREE.Vector3(lerp(-gunHB(1), gunHB(1), k / 6), gunY(1) - 0.005, zAt(1) + 0.003));
    const outward = (i, T) => {
      const p = path[i];
      const o = new THREE.Vector3(T.z, 0, -T.x);
      if (o.dot(new THREE.Vector3(p.x, 0, p.z - 0.3)) < 0) o.negate();
      return o;
    };
    const D = [[0, -0.022], [0, -0.022], [0.01, -0.022]];
    for (let k = 1; k < 8; k++) {
      const a = -Math.PI / 2 + (k / 8) * Math.PI;
      D.push([0.01 + Math.cos(a) * 0.022, Math.sin(a) * 0.022]);
    }
    D.push([0.01, 0.022], [0, 0.022], [0, 0.022]);
    K.add('blackSatin', sweep(path, D, { closed: true, frame: outward }));
    for (const sd of [1, -1]) {
      const sp = roundedBox(0.03, 0.06, 0.34, 0.012);
      xf(sp, [sd * (chineHB(0.82) + 0.04), chineY(0.82) + 0.12, zAt(0.82)], [0, 0, sd * 0.3]);
      K.add('blackSatin', sp);
    }
    const grate = roundedBox(0.2, 0.02, 0.4, 0.008);
    xf(grate, [0, keelY(0.7) + 0.02, zAt(0.7)]);
    K.add('blackSatin', grate);
    const ride = roundedBox(0.34, 0.02, 0.3, 0.006);
    xf(ride, [0, keelY(0.95) + 0.03, zAt(0.95)]);
    K.add('steel', ride);
    K.add('chrome', xf(new THREE.TorusGeometry(0.03, 0.008, 6, 12), [0, 0.3, zAt(0.07) - 0.02], [0, Math.PI / 2, 0]));
    K.add('chrome', xf(new THREE.TorusGeometry(0.03, 0.008, 6, 12), [0, gunY(1) - 0.09, zAt(1) + 0.01], [0, Math.PI / 2, 0]));
    // fold-down reboarding step on the transom, off-centre above the nozzle
    const step = roundedBox(0.2, 0.022, 0.09, 0.008);
    xf(step, [0.2, gunY(1) - 0.2, zAt(1) + 0.055]);
    K.add('blackSatin', step);
    for (const sx of [0.13, 0.27]) K.add('blackSatin', rod(new THREE.Vector3(sx, gunY(1) - 0.05, zAt(1) + 0.004), new THREE.Vector3(sx, gunY(1) - 0.2, zAt(1) + 0.02), 0.009, 6));
  }

  // handlebars on a column tilted back, turning with the steering
  const steerTilt = new THREE.Group();
  steerTilt.position.set(0, hoodTop(0.34) + 0.06, zAt(0.335));
  steerTilt.rotation.x = 0.55;
  group.add(steerTilt);
  const steer = new THREE.Group();
  steerTilt.add(steer);
  {
    const col2 = roundedBox(0.11, 0.2, 0.1, 0.04);
    xf(col2, [0, 0.08, 0]);
    const bar = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12 - 0.5;
      bar.push(new THREE.Vector3(t * 0.74, 0.18 + 0.04 * Math.abs(t) * 2, 0.04 * t * t * 4));
    }
    const barG = sweep(bar, circle(0.014, 8), { caps: true });
    const clampG = roundedBox(0.12, 0.05, 0.06, 0.015);
    xf(clampG, [0, 0.18, 0]);
    steer.add(mesh(merge([col2, barG]), M.blackSatin));
    steer.add(mesh(clampG, M.chrome));
    const grips = [];
    for (const sd of [1, -1]) {
      const pr = [[0.019, 0]];
      for (let k = 0; k <= 12; k++) pr.push([0.021 + (k % 2 ? 0.003 : 0), 0.01 + k * 0.01]);
      pr.push([0.024, 0.14], [0.02, 0.145], [0.0, 0.145]);
      const gr = lathe(pr, 14);
      xf(gr, [0, 0, 0], [0, 0, -sd * Math.PI / 2]);
      xf(gr, [sd * 0.25, 0.18 + 0.04 * 0.5 * 2 * 0.68, 0.03]);
      grips.push(gr);
    }
    const lever = sweep([new THREE.Vector3(0.22, 0.17, -0.02), new THREE.Vector3(0.28, 0.14, -0.05), new THREE.Vector3(0.33, 0.14, -0.05)], circle(0.007, 6), { caps: true });
    steer.add(mesh(merge([...grips.map((g) => { g.deleteAttribute('uv'); return g; }), (lever.deleteAttribute('uv'), lever)]), M.rubber));
  }

  // steerable jet nozzle below the platform
  const nozzle = new THREE.Group();
  nozzle.position.set(0, -0.02, zAt(1) - 0.07);
  group.add(nozzle);
  {
    const n = lathe([[0.085, 0.0], [0.08, 0.07], [0.066, 0.16], [0.062, 0.175], [0.052, 0.175], [0.056, 0.14], [0.07, 0.05], [0.075, 0.0]], 18);
    xf(n, [0, 0, 0], [Math.PI / 2, 0, 0]);
    nozzle.add(mesh(n, M.steel));
  }
  // running lights on the front of the hood, flashed by the horn
  const lens = lensMaterial('#e8eef2', '#dff0ff');
  for (const sd of [1, -1]) {
    const l = roundedBox(0.1, 0.018, 0.03, 0.008);
    xf(l, [sd * 0.2, gunY(0.12) + 0.075, zAt(0.12)], [-0.35, sd * 0.4, 0]);
    group.add(mesh(l, lens, { cast: false }));
  }

  K.build(group, { noShadow: ['visor'] });

  let st = 0;
  let flash = 0;
  return {
    group,
    lens,
    update(dt, s) {
      st = damp(st, s.turn, 7, dt);
      steer.rotation.y = -st * 0.42;
      nozzle.rotation.y = st * 0.4;
      flash = Math.max(0, flash - dt);
      lens.emissiveIntensity = 0.35 + (flash > 0 ? 6 * (Math.sin(flash * 22) > 0 ? 1 : 0.15) : 0);
    },
    horn() {
      flash = 0.7;
    },
  };
}

// ================================================================ public

const BUILDERS = { speedboat: buildSpeedboat, sailboat: buildSailboat, duck: buildDuck, jetski: buildJetski };
const ZERO_WIND = new THREE.Vector3(0, 0, 0);
const DEFAULT_STATE = { time: 0, speed: 0, speed01: 0, turn: 0, throttle: 0, boost: 0, airborne: false, windLocal: ZERO_WIND };

export function makeBoat(id, { quality } = {}) {
  const tier = tierOf(quality);
  const kind = BUILDERS[id] ? id : 'speedboat';
  const lib = library(tier);
  libUsers++;
  const built = BUILDERS[kind](lib.M, tier, lib.tex);
  const object = new THREE.Group();
  object.name = `boat-${kind}`;
  object.add(built.group);
  const ghostFront = ghostMaterial(THREE.FrontSide);
  const ghostDouble = ghostMaterial(THREE.DoubleSide);
  let ghost = false;
  let time = 0;
  const s = { ...DEFAULT_STATE };
  const view = {
    object,
    id: kind,
    spec: BOAT_SPECS[kind],
    update(dt, state = DEFAULT_STATE) {
      dt = Math.min(dt, 0.1);
      time = state.time ?? time + dt;
      s.time = time;
      s.speed = state.speed ?? 0;
      s.speed01 = state.speed01 ?? 0;
      s.turn = clamp(state.turn ?? 0, -1, 1);
      s.throttle = state.throttle ?? s.speed01;
      s.boost = state.boost ?? 0;
      s.airborne = !!state.airborne;
      s.windLocal = state.windLocal ?? ZERO_WIND;
      built.update(dt, s);
    },
    horn() {
      built.horn();
    },
    setGhost(on) {
      if (on === ghost) return;
      ghost = on;
      object.traverse((o) => {
        if (!o.isMesh) return;
        if (on) {
          o.userData.boatMat = o.material;
          o.userData.boatShadow = [o.castShadow, o.receiveShadow];
          o.material = o.material.side === THREE.DoubleSide ? ghostDouble : ghostFront;
          o.castShadow = false;
          o.receiveShadow = false;
        } else if (o.userData.boatMat) {
          o.material = o.userData.boatMat;
          [o.castShadow, o.receiveShadow] = o.userData.boatShadow;
        }
      });
    },
    dispose() {
      object.removeFromParent();
      object.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
      ghostFront.dispose();
      ghostDouble.dispose();
      built.lens?.dispose();
      releaseLibrary();
    },
  };
  return view;
}

export function makeGhost(id, { quality } = {}) {
  const b = makeBoat(id, { quality });
  b.setGhost(true);
  return b;
}
