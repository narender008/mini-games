// Picking: which island cell, building, airship or pirate sits under a screen
// point. Pure math on the binding oblique projection (render/camera.js), so it
// runs in node for unit checks: no DOM here.
//
// A screen point is a line through the world. In unzoomed tile units it is
//   x + y*DX = A,   -y*DY - z = B
// so moving along it, y grows while z falls: the viewer sits at y -> -inf,
// z -> +inf, and the NEAREST hit is the one with the SMALLEST y.
import { DX, DY, T, toWorld, toScreen } from '../render/camera.js';
import { CFG } from '../config.js';

const IC = () => CFG.input || {};

// The pick line for CSS pixel (sx, sy).
export function rayAt(cam, sx, sy) {
  const [x0, y0] = toWorld(cam, sx, sy, 0);     // the plane z = 0
  return { A: x0 + y0 * DX, B: -y0 * DY };
}

// Point of the line on the horizontal plane at altitude z.
export function onPlane(ray, z) {
  const y = -(ray.B + z) / DY;
  return [ray.A - y * DX, y];
}

// Entry depth (y) of the line into an axis-aligned box, or null when it misses.
export function boxHit(ray, x0, x1, y0, y1, z0, z1) {
  let lo = y0, hi = y1;
  // x = A - y*DX in [x0, x1]  ->  y in [(A - x1)/DX, (A - x0)/DX]
  lo = Math.max(lo, (ray.A - x1) / DX); hi = Math.min(hi, (ray.A - x0) / DX);
  // z = -B - y*DY in [z0, z1]  ->  y in [(-B - z1)/DY, (-B - z0)/DY]
  lo = Math.max(lo, (-ray.B - z1) / DY); hi = Math.min(hi, (-ray.B - z0) / DY);
  return lo <= hi ? lo : null;
}

export const cellAt = (isl, u, v) => (u < 0 || v < 0 || u >= isl.w || v >= isl.h) ? ' ' : (isl.cells ? isl.cells[v * isl.w + u] || ' ' : 'g');

// Islands that appear in the colony view (the chart shows the rest).
export function viewIslands(G) {
  return (G?.islands || []).filter((i) => i.owned || i.kind === 'home' || i.kind === 'islet' || i.inView);
}

export function footprint(content, type) {
  const def = content?.BUILDINGS?.find?.((b) => b.id === type);
  const s = def?.size || [1, 1];
  return { w: s[0] || 1, d: s[1] || 1, h: def?.height ?? def?.h ?? (IC().pickHeight?.[type] ?? 1 + 0.45 * Math.max(s[0] || 1, s[1] || 1)), def };
}

// The building that covers cell (u, v) of island `id` (uses G.tmp.occ if ECONOMY fills it).
export function buildingOnCell(G, content, id, u, v) {
  const occ = G.tmp?.occ?.[id];
  if (occ) {
    const isl = G.islands.find((i) => i.id === id);
    const bid = Array.isArray(occ) || ArrayBuffer.isView(occ) ? occ[v * (isl?.w || 0) + u] : occ[`${u},${v}`];
    if (bid) return G.buildings.find((b) => b.id === bid) || null;
  }
  for (const b of G.buildings) {
    if (b.island !== id) continue;
    const f = footprint(content, b.type);
    if (u >= b.u && u < b.u + f.w && v >= b.v && v < b.v + f.d) return b;
  }
  return null;
}

// Placement origin (min corner, the front-left cell) for a pointer at fractional
// cell (fu, fv): the cell under the pointer IS the origin, so clicking
// __sf.toScreen(island, u, v) for a spot from spots() builds exactly at (u, v);
// the footprint extends right (+u) and back (+v) from it.
export const originFor = (fu, fv) => [Math.floor(fu), Math.floor(fv)];

// Full pick at CSS px (sx, sy).
// opts: { content, ground: true -> islands only (build mode), air: false -> skip ships/pirates }
// -> { island, u, v, fu, fv, cell, building, pirate, ship, depth } (fields null when absent) or null
export function pickAt(G, cam, sx, sy, opts = {}) {
  if (!G) return null;
  const content = opts.content;
  const ray = rayAt(cam, sx, sy);
  const res = { island: null, u: null, v: null, fu: null, fv: null, cell: null, building: null, pirate: null, ship: null, depth: Infinity };

  // airships and pirates first: they fly above everything and are small targets
  if (opts.air !== false) {
    const R = IC().pickRadius || {};
    let best = 1;
    const test = (o, kindKey) => {
      if (o.x == null || o.y == null) return;
      const [px, py] = toScreen(cam, o.x, o.y, o.z || 0);
      const r = (R[o.kind] ?? R.default ?? 1.4) * T * cam.zoom;
      const d = Math.hypot(sx - px, (sy - (py - r * 0.25)) * 1.3) / Math.max(10, r);
      if (d < best) { best = d; res.pirate = null; res.ship = null; res[kindKey] = o; }
    };
    for (const p of G.pirates || []) if (p.state !== 'down' && p.state !== 'sunk' && p.hp > 0) test(p, 'pirate');
    if (!res.pirate) { best = 1; for (const s of G.ships || []) if (s.state !== 'docked' || opts.docked) test(s, 'ship'); }
  }

  const isles = viewIslands(G);
  // island tops and cliff faces
  for (const isl of isles) {
    const [x, y] = onPlane(ray, isl.alt);
    const fu = x - isl.ox, fv = y - isl.oy;
    const u = Math.floor(fu), v = Math.floor(fv);
    const ch = cellAt(isl, u, v);
    if (ch !== ' ' && y < res.depth) Object.assign(res, { island: isl, u, v, fu, fv, cell: ch, depth: y, building: null });
    if (!opts.ground) {
      // the rocky underside occludes what lies behind it (centre band of the front face)
      const deep = Math.min(IC().cliffDepth ?? 4, isl.w * 0.45);
      const hit = boxHit(ray, isl.ox + isl.w * 0.18, isl.ox + isl.w * 0.82, isl.oy, isl.oy + 0.01, isl.alt - deep, isl.alt - 0.01);
      if (hit != null && hit < res.depth) Object.assign(res, { island: isl, u: null, v: null, fu: null, fv: null, cell: null, depth: hit, building: null });
    }
  }

  // buildings as boxes (roofs stick up above their cells)
  if (!opts.ground) {
    const byId = new Map(isles.map((i) => [i.id, i]));
    for (const b of G.buildings) {
      const isl = byId.get(b.island); if (!isl) continue;
      const f = footprint(content, b.type);
      const x0 = isl.ox + b.u, y0 = isl.oy + b.v;
      const hit = boxHit(ray, x0, x0 + f.w, y0, y0 + f.d, isl.alt, isl.alt + f.h);
      if (hit != null && hit <= res.depth + 1e-6) {
        Object.assign(res, { island: isl, building: b, depth: hit, u: b.u, v: b.v, fu: b.u + f.w / 2, fv: b.v + f.d / 2, cell: cellAt(isl, b.u, b.v) });
      }
    }
    if (res.island && res.u != null && !res.building) res.building = buildingOnCell(G, content, res.island.id, res.u, res.v);
  }
  if (!res.island && !res.pirate && !res.ship) return null;
  return res;
}

// Camera bounds (world tiles) of the islands in view, padded.
export function viewBounds(G, pad = IC().clampPad ?? 8) {
  const isles = viewIslands(G);
  if (!isles.length) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z = 0;
  for (const i of isles) {
    x0 = Math.min(x0, i.ox); x1 = Math.max(x1, i.ox + i.w);
    y0 = Math.min(y0, i.oy); y1 = Math.max(y1, i.oy + i.h);
    if (i.id === 'hearthrock' || i.kind === 'home') z = i.alt;
  }
  return { x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: y1 + pad, z };
}
