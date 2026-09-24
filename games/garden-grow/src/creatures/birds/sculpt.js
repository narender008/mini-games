// Sculpting a small bird from smooth shapes. The body and head are signed
// distance fields (blended ellipsoids); each mesh is a sphere whose rays are
// projected onto that surface, so the breast, neck and face flow into one
// another like feathers do. Where head and body meet, both meshes follow the
// same blended surface and share its normals, so the join shows no seam.
// Also here: the beak, the glossy eyes, and thin jointed legs and toes.
import * as THREE from 'three';

const MM = 0.001;

// ------------------------------------------------------------ distance fields

// A (possibly pitched) ellipsoid from a spec { c:[x,y,z], r:[rx,ry,rz], pitch }
// in millimetres; returns f(x, y, z) in metres (negative inside).
function ellipsoid(spec) {
  const cx = spec.c[0] * MM;
  const cy = spec.c[1] * MM;
  const cz = spec.c[2] * MM;
  const rx = spec.r[0] * MM;
  const ry = spec.r[1] * MM;
  const rz = spec.r[2] * MM;
  const p = THREE.MathUtils.degToRad(spec.pitch || 0);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  return (x, y, z) => {
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    // into the ellipsoid's frame: its z axis is tilted up by `pitch`
    const lz = dy * sp + dz * cp;
    const ly = dy * cp - dz * sp;
    const ax = dx / rx;
    const ay = ly / ry;
    const az = lz / rz;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = ax / rx;
    const by = ay / ry;
    const bz = az / rz;
    const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  };
}

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Builds the body, head and blended fields for a species shape. `covers`
// (breast-side and scapular feathers, mirrored left and right) are part of
// the body surface but not of the `core` the folded wing lies on, so they
// overlap the wing's front and upper edges the way real feathers do.
export function birdFields(shape) {
  const bodyParts = shape.body.map(ellipsoid);
  const headParts = shape.head.map(ellipsoid);
  const coverParts = [];
  for (const c of shape.covers || []) {
    coverParts.push(ellipsoid(c), ellipsoid({ ...c, c: [-c.c[0], c.c[1], c.c[2]] }));
  }
  const kb = shape.blend.body * MM;
  const kh = shape.blend.head * MM;
  const kn = shape.blend.neck * MM;
  const kc = (shape.blend.cover ?? 4) * MM;
  const core = (x, y, z) => {
    let d = bodyParts[0](x, y, z);
    for (let i = 1; i < bodyParts.length; i++) d = smin(d, bodyParts[i](x, y, z), kb);
    return d;
  };
  const body = (x, y, z) => {
    let d = core(x, y, z);
    for (let i = 0; i < coverParts.length; i++) d = smin(d, coverParts[i](x, y, z), kc);
    return d;
  };
  const head = (x, y, z) => {
    let d = headParts[0](x, y, z);
    for (let i = 1; i < headParts.length; i++) d = smin(d, headParts[i](x, y, z), kh);
    return d;
  };
  const union = (x, y, z) => smin(body(x, y, z), head(x, y, z), kn);
  const coreUnion = (x, y, z) => smin(core(x, y, z), head(x, y, z), kn);
  return { body, head, union, core, coreUnion };
}

export function gradient(f, x, y, z, out, h = 0.00008) {
  out.set(f(x + h, y, z) - f(x - h, y, z), f(x, y + h, z) - f(x, y - h, z), f(x, y, z + h) - f(x, y, z - h));
  const l = out.length();
  if (l > 1e-12) out.multiplyScalar(1 / l);
  else out.set(0, 1, 0);
  return out;
}

// First surface crossing of f along a ray from an inside point, or -1.
function rayRoot(f, ox, oy, oz, dx, dy, dz, rMax, step = 0.0006) {
  let r0 = 0;
  let f0 = f(ox, oy, oz);
  if (f0 > 0) return 0;
  for (let r = step; r <= rMax; r += step) {
    const f1 = f(ox + dx * r, oy + dy * r, oz + dz * r);
    if (f1 > 0) {
      let a = r0;
      let b = r;
      for (let i = 0; i < 14; i++) {
        const m = (a + b) * 0.5;
        if (f(ox + dx * m, oy + dy * m, oz + dz * m) > 0) b = m;
        else a = m;
      }
      return (a + b) * 0.5;
    }
    r0 = r;
    f0 = f1;
  }
  return -1;
}

// A closed, sphere-like mesh projected from `center` onto the surface `own`.
// Near the other part (`other`), vertices move out onto the blended `union`
// surface so the two meshes meet in one smooth fillet. The sphere's poles
// run along `axis` (front) so feathers can flow along v. Returns geometry
// with position (relative to `pivot`), normal, uv (scaled by `repeat`) and
// aRest (the rest-pose position, for painting the plumage).
export function sculptMesh({ fields, part, center, axis, up, segU = 64, segV = 48, repeat = [6, 4], pivot, rMax = 0.08 }) {
  const own = fields[part];
  const other = part === 'body' ? fields.head : fields.body;
  const union = fields.union;
  const c = new THREE.Vector3(...center).multiplyScalar(MM);
  const A = new THREE.Vector3(...axis).normalize();
  const E1 = new THREE.Vector3(...up);
  E1.addScaledVector(A, -E1.dot(A)).normalize();
  const E2 = new THREE.Vector3().crossVectors(A, E1).normalize();
  const pv = new THREE.Vector3(...pivot).multiplyScalar(MM);
  const count = (segU + 1) * (segV + 1);
  const pos = new Float32Array(count * 3);
  const rest = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const d = new THREE.Vector3();
  const g = new THREE.Vector3();
  let k = 0;
  for (let j = 0; j <= segV; j++) {
    // cluster rings slightly towards the poles, which are small and rounded
    const th = (j / segV) * Math.PI;
    for (let i = 0; i <= segU; i++) {
      const ph = (i / segU) * Math.PI * 2;
      const s = Math.sin(th);
      d.copy(A).multiplyScalar(Math.cos(th));
      d.addScaledVector(E1, Math.cos(ph) * s).addScaledVector(E2, Math.sin(ph) * s).normalize();
      let r0 = rayRoot(own, c.x, c.y, c.z, d.x, d.y, d.z, rMax);
      if (r0 < 0) r0 = 0.002;
      let r = r0;
      const px = c.x + d.x * r0;
      const py = c.y + d.y * r0;
      const pz = c.z + d.z * r0;
      const w = THREE.MathUtils.smoothstep(other(px, py, pz), -0.0006, 0.0035);
      if (w > 0) {
        let ru = rayRoot(union, c.x, c.y, c.z, d.x, d.y, d.z, rMax);
        if (ru < 0 || ru > r0 + 0.012) ru = r0;
        r = r0 + (Math.max(ru, r0) - r0) * w;
      }
      const x = c.x + d.x * r;
      const y = c.y + d.y * r;
      const z = c.z + d.z * r;
      gradient(union, x, y, z, g);
      // hidden inside the other part: keep the own-surface normal
      if (w <= 0) gradient(own, x, y, z, g);
      rest[k * 3] = x;
      rest[k * 3 + 1] = y;
      rest[k * 3 + 2] = z;
      pos[k * 3] = x - pv.x;
      pos[k * 3 + 1] = y - pv.y;
      pos[k * 3 + 2] = z - pv.z;
      nor[k * 3] = g.x;
      nor[k * 3 + 1] = g.y;
      nor[k * 3 + 2] = g.z;
      uv[k * 2] = (i / segU) * repeat[0];
      uv[k * 2 + 1] = (j / segV) * repeat[1];
      k++;
    }
  }
  const idx = [];
  const row = segU + 1;
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * row + i;
      const b = a + row;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

// The point where a ray from `from` (mm) in direction `dir` leaves the
// surface f, and the surface normal there. Metres.
export function surfacePoint(f, from, dir) {
  const o = new THREE.Vector3(...from).multiplyScalar(MM);
  const d = new THREE.Vector3(...dir).normalize();
  const r = rayRoot(f, o.x, o.y, o.z, d.x, d.y, d.z, 0.08, 0.0002);
  const p = o.addScaledVector(d, Math.max(0, r));
  const n = gradient(f, p.x, p.y, p.z, new THREE.Vector3());
  return { p, n };
}

// ------------------------------------------------------------ mesh helpers

// Plain arrays so pieces can be built, transformed and merged cheaply.
export function piece() {
  return { p: [], n: [], uv: [], c: [], i: [] };
}

export function mergePieces(list, { colors = true } = {}) {
  const out = piece();
  for (const q of list) {
    const base = out.p.length / 3;
    out.p.push(...q.p);
    out.n.push(...q.n);
    out.uv.push(...q.uv);
    if (colors) out.c.push(...q.c);
    for (const i of q.i) out.i.push(i + base);
  }
  return out;
}

export function toGeometry(q) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(q.p, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(q.n, 3));
  if (q.uv.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(q.uv, 2));
  if (q.c.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(q.c, 3));
  geo.setIndex(q.i);
  geo.computeBoundingSphere();
  return geo;
}

function transformPiece(q, m) {
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  for (let k = 0; k < q.p.length; k += 3) {
    v.set(q.p[k], q.p[k + 1], q.p[k + 2]).applyMatrix4(m);
    q.p[k] = v.x;
    q.p[k + 1] = v.y;
    q.p[k + 2] = v.z;
    v.set(q.n[k], q.n[k + 1], q.n[k + 2]).applyMatrix3(nm).normalize();
    q.n[k] = v.x;
    q.n[k + 1] = v.y;
    q.n[k + 2] = v.z;
  }
  return q;
}

// A tube swept along points with per-point radii (sides around), colours
// per point. Ends are closed with a fan.
function tube(points, radii, colors, sides = 7) {
  const q = piece();
  const n = points.length;
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const ref = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < n; k++) {
    const a = points[Math.max(0, k - 1)];
    const b = points[Math.min(n - 1, k + 1)];
    T.subVectors(b, a).normalize();
    if (Math.abs(T.dot(ref)) > 0.95) ref.set(1, 0, 0);
    N.crossVectors(ref, T).normalize();
    B.crossVectors(T, N).normalize();
    for (let s = 0; s <= sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const cx = Math.cos(ang);
      const cy = Math.sin(ang);
      const nx = N.x * cx + B.x * cy;
      const ny = N.y * cx + B.y * cy;
      const nz = N.z * cx + B.z * cy;
      q.p.push(points[k].x + nx * radii[k], points[k].y + ny * radii[k], points[k].z + nz * radii[k]);
      q.n.push(nx, ny, nz);
      q.uv.push(s / sides, k / (n - 1));
      q.c.push(...colors[k]);
    }
  }
  const row = sides + 1;
  for (let k = 0; k < n - 1; k++) {
    for (let s = 0; s < sides; s++) {
      const a = k * row + s;
      const b = a + row;
      q.i.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  // end caps
  for (const [k, dir] of [
    [0, -1],
    [n - 1, 1],
  ]) {
    const a = points[Math.max(0, k - 1 * (dir > 0 ? 1 : 0))];
    const b = points[Math.min(n - 1, k + (dir > 0 ? 0 : 1))];
    T.subVectors(b, a).normalize().multiplyScalar(dir);
    const ci = q.p.length / 3;
    q.p.push(points[k].x + T.x * radii[k] * 0.6, points[k].y + T.y * radii[k] * 0.6, points[k].z + T.z * radii[k] * 0.6);
    q.n.push(T.x, T.y, T.z);
    q.uv.push(0.5, k / (n - 1));
    q.c.push(...colors[k]);
    for (let s = 0; s < sides; s++) {
      const a0 = k * row + s;
      if (dir > 0) q.i.push(a0, a0 + 1, ci);
      else q.i.push(a0 + 1, a0, ci);
    }
  }
  return q;
}

// ------------------------------------------------------------ beak

// One mandible in beak space: base at the origin, pointing +z. `upper`
// builds the top half (culmen), else the lower half. Closed along the
// cutting edge so a singing beak shows a dark mouth, not a hollow shell.
export function mandible({ len, w, h, curve = 0, upper = true, base, tip, mouth, hook = 0 }) {
  const q = piece();
  const nS = 14;
  const nA = 10;
  const L = len * MM;
  const W = w * MM * 0.5;
  const H = h * MM * (upper ? 0.55 : 0.45);
  const sgn = upper ? 1 : -1;
  const col = new THREE.Color();
  const cb = new THREE.Color(base);
  const ct = new THREE.Color(tip);
  const cm = new THREE.Color(mouth);
  const prof = (s) => {
    // a gentle conical taper with a fine, slightly rounded point
    const t = Math.pow(1 - s, 0.85);
    return t * (1 - 0.15 * s * s);
  };
  const center = (s) => -curve * MM * s * s * s + (upper ? hook * MM * Math.max(0, s - 0.85) * -2 : 0);
  for (let si = 0; si <= nS; si++) {
    const s = si / nS;
    const pr = prof(s);
    col.copy(cb).lerp(ct, THREE.MathUtils.smoothstep(s, 0.45, 1));
    for (let ai = 0; ai <= nA; ai++) {
      const a = (ai / nA) * Math.PI;
      const x = Math.cos(a) * W * pr;
      const yy = Math.sin(a) * H * pr * sgn;
      q.p.push(x, center(s) + yy, s * L);
      const nx = Math.cos(a) / Math.max(W, 1e-6);
      const ny = (Math.sin(a) * sgn) / Math.max(H, 1e-6);
      const l = Math.hypot(nx, ny) || 1;
      q.n.push(nx / l, ny / l, 0.25);
      q.uv.push(ai / nA, s);
      q.c.push(col.r, col.g, col.b);
    }
  }
  const row = nA + 1;
  for (let si = 0; si < nS; si++) {
    for (let ai = 0; ai < nA; ai++) {
      const a = si * row + ai;
      const b = a + row;
      if (upper) q.i.push(a, b, a + 1, a + 1, b, b + 1);
      else q.i.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  // the flat inside along the cutting edge
  const base0 = q.p.length / 3;
  for (let si = 0; si <= nS; si++) {
    const s = si / nS;
    const pr = prof(s);
    for (const x of [W * pr * 0.92, -W * pr * 0.92]) {
      q.p.push(x, center(s) + sgn * 0.00005, s * L * 0.98);
      q.n.push(0, -sgn, 0);
      q.uv.push(0, s);
      q.c.push(cm.r, cm.g, cm.b);
    }
  }
  for (let si = 0; si < nS; si++) {
    const a = base0 + si * 2;
    if (upper) q.i.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    else q.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  // normalise the side normals (the z lean above is a rough cone slope)
  for (let k = 0; k < q.n.length; k += 3) {
    const l = Math.hypot(q.n[k], q.n[k + 1], q.n[k + 2]) || 1;
    q.n[k] /= l;
    q.n[k + 1] /= l;
    q.n[k + 2] /= l;
  }
  return q;
}

// ------------------------------------------------------------ eyes

// Both eyes (glossy dark spheres) with a thin lid ring, in head space.
// `eyes` = [{ p: Vector3 (centre, head space), n: Vector3 (outward) }].
export function eyesPiece(eyes, r, ringColor, irisColor, seg = 20) {
  const out = [];
  const ci = new THREE.Color(irisColor);
  const cr = new THREE.Color(ringColor);
  const up = new THREE.Vector3(0, 0, 1);
  for (const e of eyes) {
    const sph = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7));
    const q = piece();
    q.p = Array.from(sph.attributes.position.array);
    q.n = Array.from(sph.attributes.normal.array);
    q.uv = Array.from(sph.attributes.uv.array);
    q.i = Array.from(sph.index.array);
    for (let k = 0; k < q.p.length; k += 3) q.c.push(ci.r, ci.g, ci.b);
    const m = new THREE.Matrix4().makeTranslation(e.p.x, e.p.y, e.p.z);
    out.push(transformPiece(q, m));
    // lid ring: a torus sitting where the eye meets the feathers
    const tor = new THREE.TorusGeometry(r * 0.93, r * 0.2, 6, Math.round(seg * 1.2));
    const t = piece();
    t.p = Array.from(tor.attributes.position.array);
    t.n = Array.from(tor.attributes.normal.array);
    t.uv = Array.from(tor.attributes.uv.array);
    t.i = Array.from(tor.index.array);
    for (let k = 0; k < t.p.length; k += 3) t.c.push(cr.r, cr.g, cr.b);
    const qn = new THREE.Quaternion().setFromUnitVectors(up, e.n);
    const mt = new THREE.Matrix4().compose(e.p.clone().addScaledVector(e.n, r * 0.28), qn, new THREE.Vector3(1, 1, 1));
    out.push(transformPiece(t, mt));
  }
  return mergePieces(out);
}

// ------------------------------------------------------------ legs and feet

// The bare lower leg (tarsus): unit length along +y, scaled per frame.
export function tarsusGeometry(rBottom, rTop, color, scaleColor) {
  const pts = [];
  const radii = [];
  const cols = [];
  const cb = new THREE.Color(color);
  const cs = new THREE.Color(scaleColor);
  const n = 9;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    pts.push(new THREE.Vector3(0, t, 0));
    // a slight swelling at the ankle joint at the top
    radii.push(THREE.MathUtils.lerp(rBottom, rTop, t) * MM * (1 + 0.35 * Math.exp(-Math.pow((t - 0.96) / 0.05, 2))));
    cols.push(k % 2 ? [cs.r, cs.g, cs.b] : [cb.r, cb.g, cb.b]);
  }
  const q = tube(pts, radii, cols, 8);
  // radii are in metres but the tube runs along a unit length: the leg
  // scales y per frame, so keep the cross-section in x and z only
  return toGeometry(q);
}

// Four toes with claws (three forward, the hallux back), in foot space:
// origin at the base of the tarsus, +z forward, the sole on y = 0.
export function footGeometry({ toe, hallux, r, color, claw }) {
  const cc = new THREE.Color(color);
  const ck = new THREE.Color(claw);
  const R = r * MM;
  const toes = [
    { yaw: 0, len: toe, rad: 1 },
    { yaw: -24, len: toe * 0.78, rad: 0.95 },
    { yaw: 22, len: toe * 0.82, rad: 0.95 },
    { yaw: 180, len: hallux, rad: 1.15 },
  ];
  const parts = [];
  for (const t of toes) {
    const L = t.len * MM;
    const a = THREE.MathUtils.degToRad(t.yaw);
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const pts = [];
    const radii = [];
    const cols = [];
    const steps = 10;
    for (let k = 0; k <= steps; k++) {
      const s = k / steps;
      // toe along the ground, knuckles slightly raised, claw curving down
      const along = s * L;
      const clawPart = THREE.MathUtils.smoothstep(s, 0.72, 0.8);
      const knuckle = 0.35 * R * Math.abs(Math.sin(s * Math.PI * 3.2));
      const y = R * 0.95 + knuckle * (1 - clawPart) - clawPart * R * 1.1 * Math.pow((s - 0.75) / 0.25, 2) + R * 0.5 * (1 - s) * (1 - s);
      pts.push(new THREE.Vector3(dx * along, Math.max(R * 0.15, y), dz * along));
      const rr = R * t.rad * (1 - 0.35 * s) * (clawPart > 0.5 ? Math.max(0.12, 1 - (s - 0.76) / 0.26) * 0.75 : 1);
      radii.push(rr);
      const c = new THREE.Color().copy(cc).lerp(ck, clawPart);
      cols.push([c.r, c.g, c.b]);
    }
    parts.push(tube(pts, radii, cols, 6));
  }
  // a small pad under the base of the toes
  const pad = new THREE.SphereGeometry(R * 1.5, 10, 8);
  const q = piece();
  q.p = Array.from(pad.attributes.position.array);
  q.n = Array.from(pad.attributes.normal.array);
  q.uv = Array.from(pad.attributes.uv.array);
  q.i = Array.from(pad.index.array);
  for (let k = 0; k < q.p.length; k += 3) q.c.push(cc.r, cc.g, cc.b);
  transformPiece(q, new THREE.Matrix4().makeTranslation(0, R * 1.2, 0));
  parts.push(q);
  return toGeometry(mergePieces(parts));
}
