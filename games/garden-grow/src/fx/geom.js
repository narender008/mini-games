// Small geometry builders for the effects and the watering can: a lathe with
// UVs measured along the profile, a swept tube with an oval cross-section,
// and a merge so a model made of parts draws in one call.
import * as THREE from 'three';

function build(pos, nor, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Spins a profile [[r, y], ...] (listed bottom to top along the outside)
// around the y axis. u runs once around, starting at +x; v is the distance
// along the profile in metres times vScale.
export function lathe(profile, segments = 48, { vScale = 1 } = {}) {
  const n = profile.length;
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const s = [0];
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]);
  const nr = [];
  const ny = [];
  for (let i = 0; i < n; i++) {
    const a = profile[Math.max(0, i - 1)];
    const b = profile[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    nr.push(ty / l);
    ny.push(-tx / l);
  }
  for (let j = 0; j <= segments; j++) {
    const phi = (j / segments) * Math.PI * 2;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    for (let i = 0; i < n; i++) {
      const r = profile[i][0];
      pos.push(r * c, profile[i][1], -r * sn);
      nor.push(nr[i] * c, ny[i], -nr[i] * sn);
      uv.push(j / segments, s[i] * vScale);
    }
  }
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = (j + 1) * n + i;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return build(pos, nor, uv, idx);
}

// Sweeps an oval cross-section along a path of points. `ra(t)` is the
// half-size along the path's bend (in the path's plane), `rb(t)` across it
// (along `side`), t running 0..1 along the path. For paths that lie in a
// plane, `side` is that plane's normal. Ends can be capped.
export function sweep(points, { ra, rb = ra, sides = 12, side = new THREE.Vector3(0, 0, 1), vScale = 1, caps = true } = {}) {
  const n = points.length;
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  let len = 0;
  const frames = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) len += points[i].distanceTo(points[i - 1]);
    T.subVectors(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]).normalize();
    N.crossVectors(side, T).normalize();
    B.crossVectors(T, N).normalize();
    frames.push({ T: T.clone(), N: N.clone(), B: B.clone(), s: len });
  }
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = ra(t);
    const b = rb(t);
    const f = frames[i];
    for (let k = 0; k <= sides; k++) {
      const ang = (k / sides) * Math.PI * 2;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const p = points[i];
      pos.push(p.x + f.N.x * a * c + f.B.x * b * sn, p.y + f.N.y * a * c + f.B.y * b * sn, p.z + f.N.z * a * c + f.B.z * b * sn);
      const nx = f.N.x * (c / a) + f.B.x * (sn / b);
      const nyy = f.N.y * (c / a) + f.B.y * (sn / b);
      const nz = f.N.z * (c / a) + f.B.z * (sn / b);
      const l = Math.hypot(nx, nyy, nz) || 1;
      nor.push(nx / l, nyy / l, nz / l);
      uv.push(k / sides, f.s * vScale);
    }
  }
  const row = sides + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * row + k;
      const b = (i + 1) * row + k;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  if (caps) {
    for (const end of [0, n - 1]) {
      const f = frames[end];
      const sign = end === 0 ? -1 : 1;
      const c0 = pos.length / 3;
      const p = points[end];
      pos.push(p.x, p.y, p.z);
      nor.push(f.T.x * sign, f.T.y * sign, f.T.z * sign);
      uv.push(0.5, f.s * vScale);
      for (let k = 0; k <= sides; k++) {
        const j = (end * row + k) * 3;
        pos.push(pos[j], pos[j + 1], pos[j + 2]);
        nor.push(f.T.x * sign, f.T.y * sign, f.T.z * sign);
        uv.push(k / sides, f.s * vScale);
      }
      for (let k = 0; k < sides; k++) {
        if (sign < 0) idx.push(c0, c0 + 2 + k, c0 + 1 + k);
        else idx.push(c0, c0 + 1 + k, c0 + 2 + k);
      }
    }
  }
  return build(pos, nor, uv, idx);
}

// Joins indexed geometries (position, normal, uv) into one.
export function merge(list) {
  let count = 0;
  let icount = 0;
  for (const g of list) {
    count += g.attributes.position.count;
    icount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const idx = new Uint32Array(icount);
  let v = 0;
  let k = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, v * 3);
    nor.set(g.attributes.normal.array, v * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, v * 2);
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) idx[k + i] = src[i] + v;
      k += src.length;
    } else {
      for (let i = 0; i < c; i++) idx[k + i] = v + i;
      k += c;
    }
    v += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// An irregular little lump (a soil crumb): a low-poly ball pushed about.
export function lumpGeometry(seed = 1) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const h = (x) => {
    const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  // the icosahedron repeats corner vertices per face: move copies together
  const moved = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let k = moved.get(key);
    if (k === undefined) {
      k = 0.72 + h(moved.size + 1) * 0.5;
      moved.set(key, k);
    }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.78, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}
