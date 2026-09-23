// Top-view geometry. A cake is a stack of tiers standing on one outline; every
// cut is a vertical plane, so in the top view it is a straight segment. The
// segments divide the outline into faces, and each face is one piece of
// cake. Cuts that stop inside the cake without closing off a piece are
// "slits": they open the frosting but keep the piece whole.
//
// Points are [x, z] in cake space (metres). A polygon with positive signed
// area (see `area`) runs counter-clockwise in (x, z).

const TOL = 2e-6; // metres: points closer than this are the same point

export function area(poly) {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function centroid(poly) {
  let cx = 0;
  let cz = 0;
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const k = a[0] * b[1] - b[0] * a[1];
    s += k;
    cx += (a[0] + b[0]) * k;
    cz += (a[1] + b[1]) * k;
  }
  if (Math.abs(s) < 1e-14) return [poly[0][0], poly[0][1]];
  return [cx / (3 * s), cz / (3 * s)];
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function distToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

export function closestOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dz];
}

// ------------------------------------------------------------ outlines

// An outline knows its polygon, whether a point is inside, the distance to
// its edge and the outward normal there (for smooth frosting on the sides).
export function roundOutline(r, n = 144) {
  const poly = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    poly.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  return {
    kind: 'round',
    r,
    poly,
    area: area(poly),
    sdf: (x, z) => Math.hypot(x, z) - r,
    normal: (x, z) => {
      const l = Math.hypot(x, z) || 1;
      return [x / l, z / l];
    },
    extent: r,
  };
}

// A square with rounded corners, `half` from the centre to each side.
export function squareOutline(half, corner, perCorner = 10) {
  const poly = [];
  const c = half - corner;
  const centres = [
    [c, c],
    [-c, c],
    [-c, -c],
    [c, -c],
  ];
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i <= perCorner; i++) {
      const t = ((k + i / perCorner) * Math.PI) / 2;
      poly.push([centres[k][0] + Math.cos(t) * corner, centres[k][1] + Math.sin(t) * corner]);
    }
  }
  const sdf = (x, z) => {
    const qx = Math.abs(x) - c;
    const qz = Math.abs(z) - c;
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - corner;
  };
  return {
    kind: 'square',
    r: half,
    corner,
    poly,
    area: area(poly),
    sdf,
    normal: (x, z) => {
      const e = 1e-4;
      const nx = sdf(x + e, z) - sdf(x - e, z);
      const nz = sdf(x, z + e) - sdf(x, z - e);
      const l = Math.hypot(nx, nz) || 1;
      return [nx / l, nz / l];
    },
    extent: half * Math.SQRT2,
  };
}

// The part of segment a-b inside a convex outline, or null.
export function clipSegment(a, b, outline) {
  const poly = outline.poly;
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    // inward normal of a counter-clockwise edge
    const nx = -(q[1] - p[1]);
    const nz = q[0] - p[0];
    const num = nx * (a[0] - p[0]) + nz * (a[1] - p[1]);
    const den = nx * dx + nz * dz;
    if (Math.abs(den) < 1e-15) {
      if (num < 0) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    [a[0] + dx * t0, a[1] + dz * t0],
    [a[0] + dx * t1, a[1] + dz * t1],
  ];
}

// Sutherland-Hodgman: a polygon clipped to a convex outline.
export function clipPolygon(poly, clip) {
  let out = poly;
  for (let i = 0, n = clip.length; i < n && out.length; i++) {
    const p = clip[i];
    const q = clip[(i + 1) % n];
    const nx = -(q[1] - p[1]);
    const nz = q[0] - p[0];
    const side = (v) => nx * (v[0] - p[0]) + nz * (v[1] - p[1]);
    const input = out;
    out = [];
    for (let j = 0, m = input.length; j < m; j++) {
      const a = input[j];
      const b = input[(j + 1) % m];
      const sa = side(a);
      const sb = side(b);
      if (sa >= 0) out.push(a);
      if (sa >= 0 !== sb >= 0) {
        const t = sa / (sa - sb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
  }
  return dedupe(out);
}

function dedupe(poly) {
  const out = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > TOL) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= TOL) out.pop();
  return out;
}

// ------------------------------------------------------------ arrangement

// Splits the outline by the cuts. Each cut is { a, b, id } and should already
// lie inside the outline. Returns the pieces (faces, each with a contour, any
// holes, and for every contour edge whether it is rim or which cut) and the
// slits (cut segments that do not bound a piece).
export function arrange(outline, cuts) {
  const verts = [];
  const vid = (p) => {
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      if (Math.abs(v[0] - p[0]) <= TOL && Math.abs(v[1] - p[1]) <= TOL) return i;
    }
    verts.push([p[0], p[1]]);
    return verts.length - 1;
  };

  const segs = [];
  const rim = outline.poly;
  for (let i = 0; i < rim.length; i++) segs.push({ a: rim[i], b: rim[(i + 1) % rim.length], kind: 'rim', id: -1, ts: [0, 1] });
  const firstCut = segs.length;
  for (const c of cuts) segs.push({ a: c.a, b: c.b, kind: 'cut', id: c.id, ts: [0, 1] });

  // every crossing splits both segments there
  for (let i = firstCut; i < segs.length; i++) {
    const s = segs[i];
    for (let j = 0; j < segs.length; j++) {
      if (j === i || (j >= firstCut && j < i)) continue;
      const o = segs[j];
      const hit = crossing(s.a, s.b, o.a, o.b);
      if (!hit) continue;
      s.ts.push(hit[0]);
      o.ts.push(hit[1]);
    }
  }

  const edges = new Map(); // "u,v" (u < v) -> { u, v, kind, id }
  for (const s of segs) {
    const ts = [...new Set(s.ts.map((t) => Math.round(t * 1e9) / 1e9))].sort((x, y) => x - y);
    let prev = null;
    for (const t of ts) {
      const p = [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
      const v = vid(p);
      if (prev !== null && prev !== v) {
        const key = prev < v ? `${prev},${v}` : `${v},${prev}`;
        const old = edges.get(key);
        // a cut lying along the rim stays rim
        if (!old || (old.kind === 'cut' && s.kind === 'rim')) edges.set(key, { u: Math.min(prev, v), v: Math.max(prev, v), kind: s.kind, id: s.id });
      }
      prev = v;
    }
  }

  // adjacency
  const adj = verts.map(() => new Set());
  for (const e of edges.values()) {
    adj[e.u].add(e.v);
    adj[e.v].add(e.u);
  }
  const freeEnd = adj.map((s) => s.size === 1);

  // peel off dangling edges: they are slits, not piece boundaries
  const slits = [];
  const stack = [];
  adj.forEach((s, i) => s.size === 1 && stack.push(i));
  while (stack.length) {
    const u = stack.pop();
    if (adj[u].size !== 1) continue;
    const v = adj[u].values().next().value;
    const e = edges.get(u < v ? `${u},${v}` : `${v},${u}`);
    slits.push({ a: verts[u], b: verts[v], freeA: freeEnd[u], freeB: freeEnd[v], id: e ? e.id : -1 });
    adj[u].delete(v);
    adj[v].delete(u);
    if (adj[v].size === 1) stack.push(v);
  }

  // outgoing neighbours sorted by angle
  const order = adj.map((s, i) => {
    const p = verts[i];
    return [...s].sort((x, y) => Math.atan2(verts[x][1] - p[1], verts[x][0] - p[0]) - Math.atan2(verts[y][1] - p[1], verts[y][0] - p[0]));
  });

  // trace faces: from each half-edge u->v, turn to the neighbour just
  // clockwise of v->u; bounded faces come out counter-clockwise
  const seen = new Set();
  const cycles = [];
  for (let u = 0; u < verts.length; u++) {
    for (const v of order[u]) {
      if (seen.has(`${u}>${v}`)) continue;
      const loop = [];
      let a = u;
      let b = v;
      for (let guard = 0; guard < 10000; guard++) {
        seen.add(`${a}>${b}`);
        loop.push(a);
        const list = order[b];
        const i = list.indexOf(a);
        const c = list[(i - 1 + list.length) % list.length];
        a = b;
        b = c;
        if (a === u && b === v) break;
      }
      cycles.push(loop);
    }
  }

  const faces = [];
  const holes = [];
  let outer = null;
  for (const loop of cycles) {
    const poly = loop.map((i) => verts[i]);
    const A = area(poly);
    if (A > 1e-9) faces.push({ loop, poly, area: A, holes: [] });
    else if (A < -1e-9) {
      if (!outer || A < outer.area) {
        if (outer) holes.push(outer);
        outer = { loop, poly, area: A };
      } else holes.push({ loop, poly, area: A });
    }
  }
  // an island of cuts not touching the rim leaves a hole in the face round it
  for (const h of holes) {
    const a = h.poly[0];
    const b = h.poly[1];
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const probe = [m[0] - ((b[1] - a[1]) / len) * 1e-5, m[1] + ((b[0] - a[0]) / len) * 1e-5];
    let best = null;
    for (const f of faces) if (pointInPolygon(probe, f.poly) && (!best || f.area < best.area)) best = f;
    if (best) best.holes.push(h);
  }

  const edgeInfo = (a, b) => {
    const e = edges.get(a < b ? `${a},${b}` : `${b},${a}`);
    return e ? { kind: e.kind, id: e.id } : { kind: 'cut', id: -1 };
  };
  const pieces = faces.map((f) => ({
    contour: f.poly,
    edges: f.loop.map((u, i) => edgeInfo(u, f.loop[(i + 1) % f.loop.length])),
    holes: f.holes.map((h) => ({ poly: h.poly, edges: h.loop.map((u, i) => edgeInfo(u, h.loop[(i + 1) % h.loop.length])) })),
    area: 0,
  }));
  for (const p of pieces) p.area = area(p.contour) + p.holes.reduce((s, h) => s + area(h.poly), 0);
  return { pieces, slits };
}

// Parameters (t on a-b, u on c-d) where two segments meet, or null.
function crossing(a, b, c, d) {
  const rx = b[0] - a[0];
  const rz = b[1] - a[1];
  const sx = d[0] - c[0];
  const sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  const lr = Math.hypot(rx, rz);
  const ls = Math.hypot(sx, sz);
  if (Math.abs(den) < 1e-12 * lr * ls + 1e-18) return null;
  const qx = c[0] - a[0];
  const qz = c[1] - a[1];
  let t = (qx * sz - qz * sx) / den;
  let u = (qx * rz - qz * rx) / den;
  const et = TOL / (lr || 1);
  const eu = TOL / (ls || 1);
  if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) return null;
  t = Math.max(0, Math.min(1, t));
  u = Math.max(0, Math.min(1, u));
  return [t, u];
}

// Tells rim edges from cut edges after a polygon has been clipped to a tier.
export function labelEdges(poly, outline, cuts) {
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (Math.abs(outline.sdf(m[0], m[1])) < 4e-4) return { kind: 'rim', id: -1 };
    let id = -1;
    let best = 5e-5;
    for (const c of cuts) {
      const d = Math.max(distToLine(a, c.a, c.b), distToLine(b, c.a, c.b));
      if (d < best) {
        best = d;
        id = c.id;
      }
    }
    return { kind: 'cut', id };
  });
}

function distToLine(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  return Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / l;
}
