// Emberfall terrain painter. When the room (or its tiles) changes, the static
// terrain is baked once into offscreen canvases:
//   back: rock masses traced from the tile mask (smooth or jagged contours,
//         rounded corners, never a grid), interior shading by depth, strata,
//         facets and cracks (bricks and arched niches in the Cloister, basalt
//         columns in the Core), lit rims on exposed edges, per-biome decor
//         (moss, mushrooms, vines, crystals, stalactites), one-way slabs,
//         spikes, ember-thorns, cracked walls; and
//   emit: everything that glows (crystal and mushroom light, fissures in
//         cracked walls, thorns, magma veins), drawn additively over the
//         darkness by render/lighting.js through drawTerrainGlow.
// Each frame adds the dynamic tiles (crumbling floors, boss doors), the room
// entities (render/props.js), static lights near the view, and in the 'front'
// layer the water, foreground silhouettes and the lava glow.
// Decoration is deterministic from the room id. Fake walls 'S' are traced as
// rock (one faint hairline is the only tell).
import { TILE, W, H } from '../config.js';
import { T } from '../world/tiles.js';
import { rng, rgba, mixHex, clamp } from '../util.js';
import { pal } from './biomes.js';
import { TAU, layer, glow, additive, fbm, hashStr, crystal, mushroom, vine, slab } from './paint.js';
import { drawProps } from './props.js';
export { drawBackdrop } from './backdrop.js';

// Everything baked for the current room; other render files read it through terrainInfo().
const S = {
  room: null, hash: -1, version: -1, k: 1, ke: 0.6,
  back: null, emit: null,
  lights: [],          // static lights { x, y, r, c, a, flicker }
  floors: [], ceils: [], // surface sample points { x, y } (room px) for fx (dust, drips)
  water: [], lava: [], waterSurf: [], lavaSurf: [], // rects { x, y, w, h } and surface runs { x, y, w }
  crumbles: [], doors: [], hangs: [], crumbleSprite: null,
  lastT: 0,
};
export const terrainInfo = () => S;

const isRockCode = (c) => c === T.SOLID || c === T.FAKE || c === T.CRACK;

// ------------------------------------------------------------ frame entry points
export function drawTerrain(g, G, which) {
  const r = G.room; if (!r) return;
  ensureBaked(G);
  if (which === 'back') {
    if (S.back) g.drawImage(S.back, 0, 0, S.back.width / S.k, S.back.height / S.k);
    drawCrumbles(g, G);
    drawDoors(g, G);
    drawProps(g, G);
    pushStaticLights(G);
  } else {
    drawWater(g, G);
    drawHangs(g, G);
  }
}

// Called by lighting.js after the darkness, with the camera transform set:
// the glow layer, lava (it is its own light) and water surface sparkle.
export function drawTerrainGlow(g, G) {
  const r = G.room; if (!r || !S.emit) return;
  additive(g, () => g.drawImage(S.emit, 0, 0, S.emit.width / S.ke, S.emit.height / S.ke));
  drawLava(g, G);
  drawWaterGlow(g, G);
}

function pushStaticLights(G) {
  const c = G.cam, x0 = c.x - 60, y0 = c.y - 60, x1 = c.x + W + 60, y1 = c.y + H + 60;
  for (const l of S.lights) if (l.x + l.r > x0 && l.x - l.r < x1 && l.y + l.r > y0 && l.y - l.r < y1) G.lights.push(l);
}

// ------------------------------------------------------------ baking
function defChar(r, x, y) { const row = r.def?.tiles?.[y]; return row ? row[x] : undefined; }

function tileHash(r) {
  let h = 2166136261;
  for (let i = 0; i < r.tiles.length; i++) {
    let c = r.tiles[i];
    if (c === T.CRUMBLE || c === T.DOOR) c = 0;
    else if (c === T.SOLID && S.doorSet?.has(i)) c = 0;
    else if (c === T.EMPTY && S.crumbleSet?.has(i)) c = 0;
    h = Math.imul(h ^ c, 16777619);
  }
  return h >>> 0;
}

function ensureBaked(G) {
  const r = G.room;
  if (S.room === r && S.version === r.version && S.K === G.renderK) return;
  if (S.K !== G.renderK) { S.K = G.renderK; S.hash = -1; }
  if (S.room !== r) { scanDynamic(r); S.hash = -1; }
  S.version = r.version;
  const h = tileHash(r);
  if (S.room === r && h === S.hash) return;
  S.room = r; S.hash = h;
  bake(G);
}

// Crumbling floors and boss doors are drawn live, so changing them never re-bakes.
function scanDynamic(r) {
  S.crumbles = []; S.doors = []; S.crumbleSet = new Set(); S.doorSet = new Set();
  const seen = new Set();
  for (let y = 0; y < r.th; y++) for (let x = 0; x < r.tw; x++) {
    const i = y * r.tw + x, c0 = r.tiles[i];
    const ch = c0 === T.CRUMBLE ? 'C' : c0 === T.DOOR ? 'D' : defChar(r, x, y);
    if (ch === 'C') { S.crumbles.push({ tx: x, ty: y, i }); S.crumbleSet.add(i); }
    if (ch === 'D' && !seen.has(i)) {
      // flood the door's tiles into one rectangle
      let x0 = x, x1 = x, y0 = y, y1 = y; const st = [[x, y]]; seen.add(i);
      while (st.length) {
        const [cx, cy] = st.pop(); S.doorSet.add(cy * r.tw + cx);
        x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          const ni = ny * r.tw + nx;
          if (nx >= 0 && ny >= 0 && nx < r.tw && ny < r.th && !seen.has(ni) && (r.tiles[ni] === T.DOOR || defChar(r, nx, ny) === 'D')) { seen.add(ni); st.push([nx, ny]); }
        }
      }
      S.doors.push({ tx: x0, ty: y0, tw: x1 - x0 + 1, th: y1 - y0 + 1, shut: 0 });
    }
  }
}

function bake(G) {
  const r = G.room, P = pal(r.biome), biome = r.biome;
  const seed = hashStr(r.id || 'room');
  const quality = G.quality === 'low' ? 0.5 : 1;
  // baked at the canvas's device scale so drawing it is a 1:1 copy
  let k = G.renderK || 1;
  const cap = 12e6; if (r.w * r.h * k * k > cap) k = Math.sqrt(cap / (r.w * r.h));
  S.k = k; S.ke = k;
  S.back = sized(S.back, r.w * k, r.h * k);
  S.emit = sized(S.emit, r.w * S.ke, r.h * S.ke);
  const g = S.back.getContext('2d'), e = S.emit.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S.back.width, S.back.height);
  e.setTransform(1, 0, 0, 1, 0, 0); e.clearRect(0, 0, S.emit.width, S.emit.height);
  g.setTransform(k, 0, 0, k, 0, 0); e.setTransform(S.ke, 0, 0, S.ke, 0, 0);
  S.lights = []; S.floors = []; S.ceils = []; S.hangs = [];

  const code = (x, y) => r.tiles[clamp(y, 0, r.th - 1) * r.tw + clamp(x, 0, r.tw - 1)];
  const idx = (x, y) => clamp(y, 0, r.th - 1) * r.tw + clamp(x, 0, r.tw - 1);
  const rock = (x, y) => { const i = idx(x, y); return isRockCode(r.tiles[i]) && !S.doorSet.has(i); };
  // outside the room the border tiles continue; the trace stops one tile out so loops close off-canvas
  const rockT = (x, y) => x >= -1 && y >= -1 && x <= r.tw && y <= r.th && rock(x, y);

  const R = rng(seed);
  const style = { hollow: { cvx: 20, ccv: 18, floor: 1.5, wall: 6, ceil: 7, step: 8, smooth: true, relax: 3 },
    thicket: { cvx: 22, ccv: 20, floor: 2, wall: 7, ceil: 8, step: 8, smooth: true, relax: 4 },
    cloister: { cvx: 5, ccv: 3, floor: 0.8, wall: 1.5, ceil: 1.5, step: 10, smooth: true, relax: 0 },
    core: { cvx: 9, ccv: 8, floor: 1.5, wall: 7, ceil: 8, step: 14, smooth: false, relax: 1 } }[biome] || {};
  const loops = traceLoops(rockT, -1, -1, r.tw + 1, r.th + 1).map((l) => relax(outline(l, style, seed), style.relax));
  const path = new Path2D();
  for (const l of loops) { path.moveTo(l[0].x, l[0].y); for (let i = 1; i < l.length; i++) path.lineTo(l[i].x, l[i].y); path.closePath(); }
  S.path = path;

  // ---- rock body
  g.save();
  g.fillStyle = P.rock; g.fill(path);
  g.clip(path);
  // depth shading: a one-pixel-per-tile map, smoothly scaled up
  const depth = depthMap(r, rock);
  g.imageSmoothingEnabled = true; g.drawImage(depth.canvasFor(P.rockBot), -TILE, -TILE, (r.tw + 2) * TILE, (r.th + 2) * TILE);
  const edgeTiles = depth.near;   // rock tiles within 3 of open space: where texture shows
  if (biome === 'cloister') bricks(g, r, P, R, depth);
  else if (biome === 'core') basalt(g, r, P, R, edgeTiles);
  // facets
  for (let n = 0; n < edgeTiles.length * 0.9 * quality; n++) {
    const [tx, ty] = edgeTiles[(R() * edgeTiles.length) | 0];
    const x = tx * TILE + R() * TILE, y = ty * TILE + R() * TILE, w = 16 + R() * 50, h = 6 + R() * 16;
    g.fillStyle = rgba(R() < 0.55 ? '#000000' : '#ffffff', 0.03 + R() * 0.06);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.3, y - h * 0.6); g.lineTo(x + w, y - h * 0.2); g.lineTo(x + w * 0.8, y + h * 0.5); g.lineTo(x + w * 0.1, y + h * 0.4); g.closePath(); g.fill();
  }
  if (biome !== 'cloister') {
    // strata: long wavy lines across the room, only visible inside the rock
    g.strokeStyle = rgba(P.crack, 0.3); g.lineWidth = 1.5;
    for (let y0 = 20 + R() * 30; y0 < r.h; y0 += 34 + R() * 20) {
      g.beginPath();
      for (let x = -20; x <= r.w + 40; x += 40) g.lineTo(x, y0 + Math.sin(x * 0.01 + y0) * 8 + (R() - 0.5) * 6);
      g.stroke();
    }
  }
  // cracks
  g.strokeStyle = rgba(P.crack, 0.55); g.lineWidth = 1.4;
  for (let n = 0; n < edgeTiles.length * 0.18; n++) {
    const [tx, ty] = edgeTiles[(R() * edgeTiles.length) | 0];
    let x = tx * TILE + R() * TILE, y = ty * TILE + R() * TILE;
    g.beginPath(); g.moveTo(x, y);
    for (let i = 0; i < 4; i++) { x += (R() - 0.5) * 26; y += 6 + R() * 14; g.lineTo(x, y); }
    g.stroke();
  }
  // cracked walls: darker, split by glowing fissures (the "dash here" tell)
  for (let ty = 0; ty < r.th; ty++) for (let tx = 0; tx < r.tw; tx++) if (r.tiles[ty * r.tw + tx] === T.CRACK) crackTile(g, e, tx, ty, R);
  // the fake wall's tell: one faint hairline
  for (let ty = 0; ty < r.th; ty++) for (let tx = 0; tx < r.tw; tx++) if (r.tiles[ty * r.tw + tx] === T.FAKE && R() < 0.5) {
    g.strokeStyle = rgba('#ffffff', 0.07); g.lineWidth = 1;
    g.beginPath(); g.moveTo(tx * TILE + 8 + R() * 24, ty * TILE + 4); g.lineTo(tx * TILE + 12 + R() * 16, ty * TILE + TILE - 6); g.stroke();
  }
  g.restore();

  // ---- rims on exposed edges: bright on floors, softer on walls and ceilings
  rims(g, e, loops, P, biome, r);
  // surface samples for decor and fx
  for (const l of loops) for (let i = 0; i < l.length; i++) {
    const p = l[i];
    if (p.x < 0 || p.y < 0 || p.x > r.w || p.y > r.h) continue;
    if (p.ny < -0.7) S.floors.push(p); else if (p.ny > 0.7) S.ceils.push(p);
  }

  // ---- decor per biome
  decor(g, e, r, P, biome, R, quality);

  // ---- special tiles
  slabs(g, e, r, P, biome, R);
  spikes(g, e, r, P, biome, code, rock);
  brambles(g, e, r, R);
  liquids(r);
  S.crumbleSprite = crumbleSprite(P, biome, k);
  hangers(r, P, R);
}

function sized(c, w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  if (!c) return layer(w, h);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}

// ------------------------------------------------------------ contour tracing
// Directed edges around every rock cell, solid on the right (y down), joined
// into closed loops of tile-corner vertices.
function traceLoops(rock, x0, y0, x1, y1) {
  const out = new Map(); const edges = [];
  const add = (sx, sy, ex, ey) => { const e = { sx, sy, ex, ey, dx: ex - sx, dy: ey - sy, used: false }; edges.push(e); const k = sx * 65536 + sy + 0x8000; (out.get(k) || out.set(k, []).get(k)).push(e); };
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (!rock(x, y)) continue;
    if (!rock(x, y - 1)) add(x, y, x + 1, y);
    if (!rock(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!rock(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!rock(x - 1, y)) add(x, y + 1, x, y);
  }
  const loops = [];
  for (const e0 of edges) {
    if (e0.used) continue;
    const pts = []; let e = e0;
    while (e && !e.used) {
      e.used = true; pts.push([e.sx, e.sy, e.dx, e.dy]);
      const c = (out.get(e.ex * 65536 + e.ey + 0x8000) || []).filter((n) => !n.used);
      if (c.length > 1) c.sort((a, b) => (e.dx * b.dy - e.dy * b.dx) - (e.dx * a.dy - e.dy * a.dx)); // saddle: turn right
      e = c[0];
    }
    // keep only the corners
    const corners = pts.filter((p, i) => { const q = pts[(i - 1 + pts.length) % pts.length]; return q[2] !== p[2] || q[3] !== p[3]; });
    if (corners.length >= 3) loops.push(corners.map((p) => [p[0] * TILE, p[1] * TILE]));
  }
  return loops;
}

// Corner vertices -> a dense outline { x, y, nx, ny } with rounded corners and
// noisy edges (little noise on floors, so feet stay on the line).
function outline(v, st, seed) {
  const n = v.length, out = [], noise = fbm(seed + 3), jr = rng(seed + 5);
  const unit = (ax, ay, bx, by) => { const d = Math.hypot(bx - ax, by - ay) || 1; return [(bx - ax) / d, (by - ay) / d, d]; };
  const corner = [];
  for (let i = 0; i < n; i++) {
    const p = v[(i - 1 + n) % n], c = v[i], q = v[(i + 1) % n];
    const [ix, iy, li] = unit(p[0], p[1], c[0], c[1]), [ox, oy, lo] = unit(c[0], c[1], q[0], q[1]);
    const cross = ix * oy - iy * ox;
    const rad = Math.min(cross > 0 ? st.cvx : st.ccv, li * 0.45, lo * 0.45);
    corner.push({ c, ix, iy, ox, oy, rad });
  }
  for (let i = 0; i < n; i++) {
    const C = corner[i], N = corner[(i + 1) % n];
    // the rounded corner (quadratic through the vertex)
    const ax = C.c[0] - C.ix * C.rad, ay = C.c[1] - C.iy * C.rad, bx = C.c[0] + C.ox * C.rad, by = C.c[1] + C.oy * C.rad;
    for (let s = 0; s < 4; s++) {
      const t = s / 4, u = 1 - t;
      const nx = (C.iy * u + C.oy * t), ny = -(C.ix * u + C.ox * t), nl = Math.hypot(nx, ny) || 1;
      out.push({ x: u * u * ax + 2 * u * t * C.c[0] + t * t * bx, y: u * u * ay + 2 * u * t * C.c[1] + t * t * by, nx: nx / nl, ny: ny / nl });
    }
    // the straight run to the next corner, displaced along its normal
    const ex = N.c[0] - N.ix * N.rad, ey = N.c[1] - N.iy * N.rad;
    const len = Math.hypot(ex - bx, ey - by), nx = C.oy, ny = -C.ox;
    const amp = ny < -0.7 ? st.floor : ny > 0.7 ? st.ceil : st.wall;
    const m = Math.max(1, Math.round(len / st.step));
    for (let s = 0; s < m; s++) {
      const t = s / m, x = bx + (ex - bx) * t, y = by + (ey - by) * t;
      const env = Math.min(1, (t * len) / 14, ((1 - t) * len) / 14);
      const d = st.smooth ? (noise((x + y * 1.3) / 31) - 0.5) * 2 * amp : (jr() - 0.5) * 2 * amp;
      out.push({ x: x + nx * d * env, y: y + ny * d * env, nx, ny });
    }
  }
  return out;
}

// Soften stair-stepped walls and ceilings: average each point with its
// neighbours a few times. Floor-facing points stay put, so feet stay on the line.
function relax(l, n) {
  const m = l.length;
  for (let it = 0; it < n; it++) {
    const xs = l.map((p) => p.x), ys = l.map((p) => p.y);
    for (let i = 0; i < m; i++) {
      if (l[i].ny < -0.7) continue;
      let sx = 0, sy = 0;
      for (let k = -2; k <= 2; k++) { const j = (i + k + m) % m; sx += xs[j]; sy += ys[j]; }
      l[i].x = sx / 5; l[i].y = sy / 5;
    }
  }
  return l;
}

// Rock depth: distance (in tiles) to open space, as a tiny shade canvas.
function depthMap(r, rock) {
  const w = r.tw + 2, h = r.th + 2, d = new Float32Array(w * h).fill(99), q = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!rock(x - 1, y - 1)) { d[y * w + x] = 0; q.push(y * w + x); }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % w, y = (i / w) | 0, nd = d[i] + 1;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx; if (d[j] > nd) { d[j] = nd; q.push(j); }
    }
  }
  const near = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const v = d[y * w + x]; if (v > 0 && v <= 3) near.push([x - 1, y - 1, v]); }
  return {
    d, w, near, at: (tx, ty) => d[(ty + 1) * w + tx + 1],
    canvasFor(col) {
      const c = layer(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
      const [cr, cg, cb] = [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)];
      for (let i = 0; i < w * h; i++) {
        const a = d[i] >= 99 ? 0.95 : clamp((d[i] - 0.85) * 0.32, 0, 0.95);
        img.data[i * 4] = cr; img.data[i * 4 + 1] = cg; img.data[i * 4 + 2] = cb; img.data[i * 4 + 3] = a * 255;
      }
      g.putImageData(img, 0, 0); return c;
    },
  };
}

// ------------------------------------------------------------ rock styles
function bricks(g, r, P, R, depth) {
  const bw = 60, bh = 30;
  g.lineWidth = 2; g.strokeStyle = rgba(P.crack, 0.55);
  for (let y = 0; y < r.h; y += bh) {
    const off = ((y / bh) & 1) * bw / 2;
    g.beginPath(); g.moveTo(0, y); g.lineTo(r.w, y); g.stroke();
    for (let x = -off; x < r.w; x += bw) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + bh); g.stroke();
      if (R() < 0.3) { g.fillStyle = rgba(R() < 0.5 ? '#000000' : '#bfffe8', 0.04 + R() * 0.05); g.fillRect(x + 2, y + 2, bw - 4, bh - 4); }
    }
  }
  // arched niches carved into deep wall masses
  for (let ty = 1; ty < r.th - 4; ty++) for (let tx = 1; tx < r.tw - 3; tx++) {
    if (R() > 0.06) continue;
    let ok = true;
    for (let y = ty; y < ty + 4 && ok; y++) for (let x = tx; x < tx + 2 && ok; x++) if (!(depth.at(x, y) >= 2)) ok = false;
    if (!ok) continue;
    const x = tx * TILE + 6, y = ty * TILE + 10, w = TILE * 2 - 12, h = TILE * 4 - 20;
    g.fillStyle = rgba('#000000', 0.45);
    g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, TAU); g.lineTo(x + w, y + h); g.closePath(); g.fill();
    g.strokeStyle = rgba(P.rim, 0.12); g.lineWidth = 2; g.stroke();
    tx += 3;
  }
}
function basalt(g, r, P, R, near) {
  g.strokeStyle = rgba('#000000', 0.45); g.lineWidth = 2;
  for (let x = R() * 20; x < r.w; x += 16 + R() * 18) {
    g.beginPath(); let y = 0; g.moveTo(x, 0);
    while (y < r.h) { y += 30 + R() * 50; g.lineTo(x + (R() - 0.5) * 4, y); }
    g.stroke();
  }
  // hexagonal column breaks
  g.strokeStyle = rgba('#ffb36a', 0.06); g.lineWidth = 1;
  for (let n = 0; n < near.length * 0.4; n++) {
    const [tx, ty] = near[(R() * near.length) | 0];
    const x = tx * TILE + R() * TILE, y = ty * TILE + R() * TILE;
    g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x, y - 4); g.lineTo(x + 9, y); g.stroke();
  }
}
function crackTile(g, e, tx, ty, R) {
  const x = tx * TILE, y = ty * TILE;
  g.fillStyle = 'rgba(30,10,8,0.45)'; g.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
  // chiselled boulder outlines
  g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x + 3, y + 14 + R() * 8); g.lineTo(x + 20, y + 18 + R() * 6); g.lineTo(x + TILE - 3, y + 12 + R() * 10); g.stroke();
  const lines = [];
  let cx = x + TILE * (0.3 + R() * 0.4), cy = y;
  lines.push([cx, cy]);
  while (cy < y + TILE) { cx += (R() - 0.5) * 16; cy += 6 + R() * 8; lines.push([clamp(cx, x + 4, x + TILE - 4), Math.min(cy, y + TILE)]); }
  const draw = (c, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.beginPath(); lines.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); c.stroke(); };
  draw(g, 3.5, '#120504'); draw(g, 1.6, '#ffb347');
  draw(e, 7, 'rgba(255,120,40,0.55)'); draw(e, 2.5, 'rgba(255,220,140,0.9)');
  // a short side branch
  const [bx, by] = lines[(lines.length / 2) | 0];
  const side = [[bx, by], [bx + (R() < 0.5 ? -1 : 1) * (8 + R() * 8), by + 5 + R() * 6]];
  for (const c of [g, e]) { c.strokeStyle = c === g ? '#ffb347' : 'rgba(255,170,80,0.8)'; c.lineWidth = c === g ? 1.2 : 3; c.beginPath(); c.moveTo(...side[0]); c.lineTo(...side[1]); c.stroke(); }
  if (ty % 2 === 0) S.lights.push({ x: x + TILE / 2, y: y + TILE / 2, r: 80, c: '#ff8a3a', a: 0.22, flicker: true });
}

function rims(g, e, loops, P, biome, r) {
  const cls = [new Path2D(), new Path2D(), new Path2D()]; // floor, wall, ceiling
  for (const l of loops) {
    let prev = -1;
    for (let i = 0; i <= l.length; i++) {
      const p = l[i % l.length], q = l[(i + 1) % l.length];
      const c = p.ny < -0.6 ? 0 : p.ny > 0.6 ? 2 : 1;
      if (c !== prev) cls[c].moveTo(p.x, p.y);
      cls[c].lineTo(q.x, q.y); prev = c;
    }
  }
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  // dark lip just inside the rim reads as a thickness
  g.strokeStyle = rgba('#000000', 0.25); g.lineWidth = 9;
  g.stroke(cls[1]); g.stroke(cls[2]);
  g.strokeStyle = rgba(P.rim, 0.22); g.lineWidth = 7; g.stroke(cls[0]);
  g.strokeStyle = P.rim; g.lineWidth = 2.4; g.stroke(cls[0]);
  g.strokeStyle = rgba(P.rimSide, 0.45); g.lineWidth = 2; g.stroke(cls[1]);
  g.strokeStyle = rgba(P.rimCeil, 0.55); g.lineWidth = 2; g.stroke(cls[2]);
  g.restore();
  // a faint version in the glow layer so floors read in the dark
  e.save(); e.lineJoin = 'round';
  e.strokeStyle = rgba(P.rim, biome === 'core' ? 0.3 : 0.1); e.lineWidth = 6; e.stroke(cls[0]);
  e.strokeStyle = rgba(P.rim, biome === 'core' ? 0.6 : 0.26); e.lineWidth = 1.4; e.stroke(cls[0]);
  e.strokeStyle = rgba(P.rimSide, 0.07); e.lineWidth = 2; e.stroke(cls[1]);
  e.strokeStyle = rgba(P.rimCeil, 0.08); e.lineWidth = 2; e.stroke(cls[2]);
  e.restore();
}

// ------------------------------------------------------------ decor
function decor(g, e, r, P, biome, R, quality) {
  const floors = S.floors, ceils = S.ceils;
  const openAbove = (x, y, n) => { for (let k = 1; k <= n; k++) { const ty = Math.floor(y / TILE) - k, tx = Math.floor(x / TILE); if (ty < 0 || r.tiles[ty * r.tw + tx] !== T.EMPTY) return false; } return true; };
  let lastCrystal = -1e9, lastBig = -1e9, lastLight = -1e9;
  const mossF = fbm(hashStr(r.id || '') + 11), mossN = (x) => mossF(x / 90);
  // keep big decor clear of the room's entities (shrines, braziers, tablets)
  const ents = (r.def?.ents || []).filter((e) => e.x != null).map((e) => (e.x + 0.5) * TILE);
  const clear = (x, d = 140) => !ents.some((ex) => Math.abs(ex - x) < d);
  for (let i = 0; i < floors.length; i++) {
    const p = floors[i];
    if (biome === 'hollow' || biome === 'cloister' || biome === 'thicket') {
      if (P.moss && mossN(p.x) > 0.45 && R() < 0.5) {
        g.fillStyle = R() < 0.3 ? P.mossHi : P.moss;
        g.beginPath(); g.ellipse(p.x, p.y + 1, 7 + R() * 11, 3 + R() * 3, 0, 0, TAU); g.fill();
        if (R() < 0.3) { g.fillStyle = rgba(P.mossHi, 0.8); g.beginPath(); g.ellipse(p.x + (R() - 0.5) * 6, p.y - 1, 3 + R() * 4, 1.6, 0, 0, TAU); g.fill(); }
      }
      if (P.moss && R() < 0.12) { g.strokeStyle = P.mossHi; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + (R() - 0.5) * 6, p.y - 5 - R() * 8); g.stroke(); }
    }
    if (biome === 'hollow') {
      if (R() < 0.05) { g.fillStyle = rgba('#000000', 0.35); g.beginPath(); g.ellipse(p.x, p.y - 1, 3 + R() * 4, 2 + R() * 2, 0, Math.PI, TAU); g.fill(); }
      if (p.x - lastCrystal > 300 && R() < 0.05 && openAbove(p.x, p.y, 2) && clear(p.x, 60)) {
        lastCrystal = p.x;
        const c = R() < 0.6 ? P.crystal[0] : P.crystal[1];
        crystal(g, p.x, p.y + 3, 22 + R() * 16, c, (R() - 0.5) * 0.5, 0.7, e);
        crystal(g, p.x + 12, p.y + 3, 14 + R() * 10, c, 0.3 + R() * 0.3, 0.7, e);
        if (R() < 0.6) crystal(g, p.x - 10, p.y + 3, 10 + R() * 8, P.crystal[1], -0.5, 0.7, e);
        S.lights.push({ x: p.x, y: p.y - 18, r: 150, c, a: 0.28 });
      } else if (R() < 0.012) {
        // a little cluster of amber glowcaps
        for (let k = 0; k < 3; k++) mushroom(g, p.x + (k - 1) * 7 + R() * 3, p.y + 1, 5 + R() * 9, 6 + R() * 8, { cap: '#ffb34a', stem: '#d8c8b0', emit: e });
        if (p.x - lastLight > 160) { lastLight = p.x; S.lights.push({ x: p.x, y: p.y - 10, r: 90, c: '#ffb34a', a: 0.18 }); }
      }
    }
    if (biome === 'thicket') {
      if (p.x - lastBig > 520 && R() < 0.05 && openAbove(p.x, p.y, 4) && clear(p.x)) {
        lastBig = p.x;
        const c = P.caps[(R() * 3) | 0];
        mushroom(g, p.x, p.y + 2, 60 + R() * 50, 60 + R() * 50, { cap: c, stem: '#d8c8f0', glowC: c, lean: (R() - 0.5) * 20, emit: e });
        S.lights.push({ x: p.x, y: p.y - 80, r: 220, c, a: 0.22 });
      } else if (R() < 0.1) {
        const c = P.caps[(R() * 4) | 0], cw = 7 + R() * 14;
        mushroom(g, p.x, p.y + 1, 6 + R() * 18, cw, { cap: c, stem: '#cbbbe8', emit: e });
        if (p.x - lastLight > 140) { lastLight = p.x; S.lights.push({ x: p.x, y: p.y - 14, r: 110, c, a: 0.2 }); }
      }
    }
    if (biome === 'cloister' && p.x - lastCrystal > 900 && R() < 0.01 && openAbove(p.x, p.y, 2)) {
      lastCrystal = p.x;
      crystal(g, p.x, p.y + 3, 22, P.crystal[0], 0, 0.7, e); crystal(g, p.x + 14, p.y + 3, 14, P.crystal[0], 0.4, 0.7, e);
      S.lights.push({ x: p.x, y: p.y - 14, r: 100, c: P.crystal[0], a: 0.3 });
    }
    if (biome === 'core' && R() < 0.035) magmaVein(g, e, p, R, r, S.path);
  }
  for (let i = 0; i < ceils.length; i++) {
    const p = ceils[i];
    if (biome !== 'cloister' && R() < (biome === 'core' ? 0.05 : 0.035)) stalactite(g, e, p, P, biome, R);
    if (biome === 'hollow' && R() < 0.03 * quality) {
      // roots, some strung with glowworms
      const lit = R() < 0.5, len = 30 + R() * 80;
      vine(g, p.x, p.y - 2, len, P.vine, (R() * 1e6) | 0, lit ? P.vineGlow : null, e);
      if (lit && R() < 0.5) S.lights.push({ x: p.x, y: p.y + len * 0.6, r: 80, c: P.vineGlow, a: 0.12 });
    }
    if (biome === 'thicket' && R() < 0.05) {
      const c = R() < 0.5 ? P.vineGlow : P.vineGlow2;
      vine(g, p.x, p.y - 2, 40 + R() * 110, P.vine, (R() * 1e6) | 0, c, e);
      if (R() < 0.25) S.lights.push({ x: p.x, y: p.y + 40, r: 90, c, a: 0.15 });
    }
    if (biome === 'cloister' && R() < 0.06) vine(g, p.x, p.y - 2, 10 + R() * 40, P.moss, (R() * 1e6) | 0, R() < 0.2 ? P.vineGlow : null, e, 1.6);
  }
}
function stalactite(g, e, p, P, biome, R) {
  const w = 5 + R() * 10, l = 10 + R() * 34;
  const gr = g.createLinearGradient(0, p.y, 0, p.y + l);
  gr.addColorStop(0, P.rock); gr.addColorStop(1, mixHex(P.rock, P.rimCeil, 0.35));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(p.x - w, p.y - 3); g.quadraticCurveTo(p.x - w * 0.2, p.y + l * 0.5, p.x, p.y + l); g.quadraticCurveTo(p.x + w * 0.25, p.y + l * 0.5, p.x + w, p.y - 3); g.closePath(); g.fill();
  if (biome === 'core' && R() < 0.5) { additive(e, () => glow(e, p.x, p.y + l, 8, '#ff8a2a', 0.8)); }
}
function magmaVein(g, e, p, R, r, clip) {
  const pts = [[p.x, p.y + 2]];
  let x = p.x, y = p.y + 2;
  for (let i = 0; i < 4; i++) { x += (R() - 0.5) * 18; y += 6 + R() * 12; pts.push([x, y]); }
  const path = (c) => { c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); };
  g.lineCap = e.lineCap = 'round';
  path(g); g.strokeStyle = '#ff7a2a'; g.lineWidth = 1.6; g.stroke();
  e.save(); if (clip) e.clip(clip);
  path(e); e.strokeStyle = 'rgba(255,110,30,0.55)'; e.lineWidth = 6; e.stroke();
  path(e); e.strokeStyle = 'rgba(255,210,120,0.9)'; e.lineWidth = 1.8; e.stroke();
  e.restore();
  if (R() < 0.35) S.lights.push({ x: p.x, y: p.y + 10, r: 70, c: '#ff6a1a', a: 0.16 });
}

// ------------------------------------------------------------ special tiles
function slabs(g, e, r, P, biome, R) {
  for (let ty = 0; ty < r.th; ty++) {
    let x0 = -1;
    for (let tx = 0; tx <= r.tw; tx++) {
      const on = tx < r.tw && r.tiles[ty * r.tw + tx] === T.ONEWAY;
      if (on && x0 < 0) x0 = tx;
      if (!on && x0 >= 0) {
        const x = x0 * TILE, w = (tx - x0) * TILE, y = ty * TILE;
        if (biome === 'hollow' || biome === 'thicket') woodSlab(g, x, y, w, P, R);
        else slab(g, x - 2, y, w + 4, 16, { ...P.slab, seed: (R() * 1e6) | 0 });
        if (biome === 'core') { e.strokeStyle = 'rgba(255,140,60,0.35)'; e.lineWidth = 4; e.beginPath(); e.moveTo(x, y); e.lineTo(x + w, y); e.stroke(); }
        x0 = -1;
      }
    }
  }
}
// Planks lashed on two beams: the caves' and the thicket's one-way ledges.
function woodSlab(g, x, y, w, P, R) {
  const plank = P === pal('thicket') ? ['#4a3a5a', '#2a1e38'] : ['#6a4a34', '#2e1e16'];
  g.fillStyle = '#1a120e'; g.fillRect(x + 6, y + 10, 5, 10); g.fillRect(x + w - 11, y + 10, 5, 10);
  const gr = g.createLinearGradient(0, y, 0, y + 12); gr.addColorStop(0, plank[0]); gr.addColorStop(1, plank[1]);
  g.fillStyle = gr; g.fillRect(x, y, w, 11);
  g.strokeStyle = rgba('#000000', 0.5); g.lineWidth = 1.2;
  for (let px = x + 14 + R() * 10; px < x + w - 6; px += 16 + R() * 14) { g.beginPath(); g.moveTo(px, y + 1); g.lineTo(px, y + 11); g.stroke(); }
  g.strokeStyle = '#c8a070'; g.lineWidth = 1.5; // rope lashings
  for (const lx of [x + 8, x + w - 9]) { g.beginPath(); g.moveTo(lx - 3, y); g.lineTo(lx + 3, y + 11); g.moveTo(lx + 3, y); g.lineTo(lx - 3, y + 11); g.stroke(); }
  g.strokeStyle = rgba(P.rim, 0.8); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y + 0.5); g.lineTo(x + w, y + 0.5); g.stroke();
}
function spikes(g, e, r, P, biome, code, rock) {
  for (let ty = 0; ty < r.th; ty++) for (let tx = 0; tx < r.tw; tx++) {
    if (r.tiles[ty * r.tw + tx] !== T.SPIKE) continue;
    // point away from the rock they grow on
    let ang = 0; // up
    if (rock(tx, ty + 1) || code(tx, ty + 1) === T.SPIKE) ang = 0;
    else if (rock(tx, ty - 1)) ang = Math.PI;
    else if (rock(tx - 1, ty)) ang = Math.PI / 2;
    else if (rock(tx + 1, ty)) ang = -Math.PI / 2;
    g.save(); g.translate(tx * TILE + TILE / 2, ty * TILE + TILE / 2); g.rotate(ang);
    for (let i = 0; i < 3; i++) {
      const bx = -TILE / 2 + 2 + i * 12, h = 26 + ((tx * 7 + i * 5) % 9);
      const gr = g.createLinearGradient(0, TILE / 2, 0, TILE / 2 - h);
      gr.addColorStop(0, P.spike[0]); gr.addColorStop(0.7, mixHex(P.spike[0], P.spike[1], 0.4)); gr.addColorStop(1, P.spike[1]);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(bx, TILE / 2 + 2); g.lineTo(bx + 6, TILE / 2 - h); g.lineTo(bx + 12, TILE / 2 + 2); g.closePath(); g.fill();
    }
    g.restore();
    if (biome === 'core' || biome === 'thicket') {
      e.save(); e.translate(tx * TILE + TILE / 2, ty * TILE + TILE / 2); e.rotate(ang);
      for (let i = 0; i < 3; i++) glow(e, -TILE / 2 + 8 + i * 12, -TILE / 2 + 12, 6, P.spike[1], 0.6);
      e.restore();
    }
  }
}
// Ember-thorns: a tangle of dark briars with glowing red tips and a hot core.
function brambles(g, e, r, R) {
  for (let ty = 0; ty < r.th; ty++) for (let tx = 0; tx < r.tw; tx++) {
    if (r.tiles[ty * r.tw + tx] !== T.BRAMBLE) continue;
    const x = tx * TILE, y = ty * TILE;
    additive(e, () => glow(e, x + TILE / 2, y + TILE / 2, 34, '#ff3a1a', 0.5));
    g.fillStyle = 'rgba(40,6,6,0.75)'; g.beginPath(); g.ellipse(x + TILE / 2, y + TILE / 2, TILE * 0.55, TILE * 0.55, 0, 0, TAU); g.fill();
    for (let n = 0; n < 5; n++) {
      let a = R() * TAU, px = x + TILE / 2 + Math.cos(a) * 18, py = y + TILE / 2 + Math.sin(a) * 18;
      g.strokeStyle = n % 2 ? '#2a0806' : '#4a1008'; g.lineWidth = 3.2 - n * 0.3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(px, py);
      const pts = [];
      for (let k = 0; k < 4; k++) {
        a += (R() - 0.5) * 2.2; px += Math.cos(a) * 12; py += Math.sin(a) * 12;
        px = clamp(px, x - 6, x + TILE + 6); py = clamp(py, y - 6, y + TILE + 6);
        g.lineTo(px, py); pts.push([px, py, a]);
      }
      g.stroke();
      for (const [qx, qy, qa] of pts) {
        const s = (R() < 0.5 ? 1 : -1) * Math.PI / 2, tx2 = qx + Math.cos(qa + s) * 6, ty2 = qy + Math.sin(qa + s) * 6;
        g.strokeStyle = '#ff5a2a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(qx, qy); g.lineTo(tx2, ty2); g.stroke();
        e.fillStyle = 'rgba(255,120,60,0.95)'; e.fillRect(tx2 - 1.5, ty2 - 1.5, 3, 3);
        additive(e, () => glow(e, tx2, ty2, 7, '#ff4a1a', 0.8));
      }
    }
    if ((tx + ty) % 2 === 0) S.lights.push({ x: x + TILE / 2, y: y + TILE / 2, r: 90, c: '#ff3a1a', a: 0.22, flicker: true });
  }
}
function crumbleSprite(P, biome, k) {
  // a loose slab of the biome's rock, split into chunks by bright-edged cracks
  const c = layer(TILE * k, TILE * k), g = c.getContext('2d'); g.scale(k, k);
  const R = rng(biome.length * 31 + 7);
  const shape = () => { g.beginPath(); g.moveTo(1, 2); g.lineTo(TILE - 1, 2); g.lineTo(TILE - 2, 18); g.lineTo(TILE * 0.72, 26); g.lineTo(TILE * 0.5, 22); g.lineTo(TILE * 0.28, 29); g.lineTo(2, 17); g.closePath(); };
  shape();
  const gr = g.createLinearGradient(0, 0, 0, 30); gr.addColorStop(0, mixHex(P.rock, '#ffffff', 0.22)); gr.addColorStop(1, mixHex(P.rock, P.rockBot, 0.5));
  g.fillStyle = gr; g.fill();
  g.save(); shape(); g.clip();
  for (let i = 0; i < 6; i++) { g.fillStyle = rgba(R() < 0.5 ? '#000000' : '#ffffff', 0.06 + R() * 0.06); g.fillRect(R() * TILE, 4 + R() * 18, 6 + R() * 12, 3 + R() * 4); }
  g.restore();
  // cracks: dark gash with a pale lip so they read at a glance
  for (const cx of [TILE * 0.34, TILE * 0.68]) {
    const pts = [[cx + (R() - 0.5) * 4, 2]]; let x = pts[0][0], y = 2;
    while (y < 22) { x += (R() - 0.5) * 9; y += 5 + R() * 4; pts.push([x, y]); }
    for (const [col, w] of [['rgba(255,220,190,0.35)', 3.2], ['#050206', 1.8]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach(([a, b2], i) => (i ? g.lineTo(a, b2) : g.moveTo(a, b2))); g.stroke(); }
  }
  g.strokeStyle = P.rim; g.lineWidth = 2.4; g.beginPath(); g.moveTo(1, 2); g.lineTo(TILE * 0.3, 2); g.moveTo(TILE * 0.38, 2); g.lineTo(TILE * 0.64, 2); g.moveTo(TILE * 0.72, 2); g.lineTo(TILE - 1, 2); g.stroke();
  return c;
}

// ------------------------------------------------------------ live tiles
function drawCrumbles(g, G) {
  const r = G.room;
  for (const c of S.crumbles) {
    if (r.tiles[c.i] !== T.CRUMBLE) {
      // broken: a few pebbles mark where it will come back
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(c.tx * TILE + 6, c.ty * TILE + 1, 4, 3); g.fillRect(c.tx * TILE + 26, c.ty * TILE + 1, 5, 3);
      continue;
    }
    const st = r.crumble?.get?.(c.i);
    const shake = st && !st.broken && st.t > 0 ? Math.sin(G.vt * 70 + c.i) * 1.6 : 0;
    g.drawImage(S.crumbleSprite, c.tx * TILE + shake, c.ty * TILE - 2, TILE, TILE);
  }
}
function drawDoors(g, G) {
  const r = G.room, dt = Math.min(0.1, Math.max(0, G.vt - S.lastT)); S.lastT = G.vt;
  for (const d of S.doors) {
    let closed = false;
    for (let y = d.ty; y < d.ty + d.th; y++) for (let x = d.tx; x < d.tx + d.tw; x++) if (r.tiles[y * r.tw + x] === T.SOLID) closed = true;
    d.shut = clamp(d.shut + (closed ? dt * 3 : -dt * 2), 0, 1);
    const x = d.tx * TILE, y = d.ty * TILE, w = d.tw * TILE, h = d.th * TILE, vert = h >= w;
    // stone frame: lintel and posts
    g.fillStyle = '#2a1e2e';
    if (vert) { g.fillRect(x - 6, y - 14, w + 12, 16); g.fillRect(x - 6, y, 7, h); g.fillRect(x + w - 1, y, 7, h); }
    else { g.fillRect(x - 14, y - 6, 16, h + 12); g.fillRect(x + w - 2, y - 6, 16, h + 12); }
    g.fillStyle = 'rgba(255,200,150,0.25)'; if (vert) g.fillRect(x - 6, y - 14, w + 12, 2);
    if (d.shut > 0.01) {
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      const off = vert ? -h * (1 - d.shut) : 0, offx = vert ? 0 : -w * (1 - d.shut);
      g.translate(offx, off);
      g.fillStyle = 'rgba(5,3,8,0.55)'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#3a3440'; g.lineWidth = 5;
      for (let bx = x + 6; bx < x + w; bx += 11) { g.beginPath(); g.moveTo(bx, y); g.lineTo(bx, y + h - 4); g.stroke(); }
      g.lineWidth = 4;
      for (let by = y + 18; by < y + h; by += 40) { g.beginPath(); g.moveTo(x, by); g.lineTo(x + w, by); g.stroke(); }
      g.fillStyle = '#6a6070';
      for (let bx = x + 6; bx < x + w; bx += 11) { g.beginPath(); g.moveTo(bx - 3, y + h - 6); g.lineTo(bx, y + h); g.lineTo(bx + 3, y + h - 6); g.fill(); }
      g.restore();
    }
    // the rune above glows red while the door holds you in
    const rx = vert ? x + w / 2 : x - 6, ry = vert ? y - 7 : y + h / 2;
    additive(g, () => glow(g, rx, ry, 20 + 16 * d.shut, '#ff4a2a', 0.3 + 0.6 * d.shut));
    g.fillStyle = d.shut > 0.5 ? '#ff8a5a' : '#8a5a4a'; g.fillRect(rx - 1.5, ry - 5, 3, 10); g.fillRect(rx - 4, ry - 1, 8, 2);
    if (d.shut > 0.2) G.lights.push({ x: x + w / 2, y: y + h / 2, r: 120, c: '#ff4a2a', a: 0.25 * d.shut });
  }
}

// ------------------------------------------------------------ liquids
function liquids(r) {
  S.water = rects(r, T.WATER); S.lava = rects(r, T.LAVA);
  S.waterSurf = surfaces(r, T.WATER); S.lavaSurf = surfaces(r, T.LAVA);
  const P = pal(r.biome);
  for (const w of S.water) { w.grad = null; }
  for (const s of S.lavaSurf) for (let x = s.x + 40; x < s.x + s.w; x += 120) S.lights.push({ x, y: s.y, r: 180, c: '#ff6a1a', a: 0.3, flicker: true });
  for (const s of S.lavaSurf) if (s.w < 120) S.lights.push({ x: s.x + s.w / 2, y: s.y, r: 150, c: '#ff6a1a', a: 0.3, flicker: true });
  for (const s of S.waterSurf) for (let x = s.x + 60; x < s.x + s.w; x += 160) S.lights.push({ x, y: s.y + 20, r: 130, c: P.waterHi, a: 0.1, k: 0.55 });
  S.waterCol = P.water; S.waterHi = P.waterHi;
}
function rects(r, c) {
  const out = []; let open = new Map();
  for (let y = 0; y < r.th; y++) {
    const next = new Map();
    let x0 = -1;
    for (let x = 0; x <= r.tw; x++) {
      const on = x < r.tw && r.tiles[y * r.tw + x] === c;
      if (on && x0 < 0) x0 = x;
      if (!on && x0 >= 0) {
        const key = x0 * 1000 + x, prev = open.get(key);
        if (prev) { prev.h += TILE; next.set(key, prev); } else { const rc = { x: x0 * TILE, y: y * TILE, w: (x - x0) * TILE, h: TILE }; out.push(rc); next.set(key, rc); }
        x0 = -1;
      }
    }
    open = next;
  }
  return out;
}
function surfaces(r, c) {
  const out = [];
  for (let y = 0; y < r.th; y++) {
    let x0 = -1;
    for (let x = 0; x <= r.tw; x++) {
      const on = x < r.tw && r.tiles[y * r.tw + x] === c && (y === 0 || r.tiles[(y - 1) * r.tw + x] === T.EMPTY || r.tiles[(y - 1) * r.tw + x] === T.ONEWAY);
      if (on && x0 < 0) x0 = x;
      if (!on && x0 >= 0) { out.push({ x: x0 * TILE, y: y * TILE + 6, w: (x - x0) * TILE }); x0 = -1; }
    }
  }
  return out;
}
function drawWater(g, G) {
  if (!S.water.length) return;
  const t = G.vt;
  for (const w of S.water) {
    if (!w.grad) {
      const top = S.waterSurf.some((s) => Math.abs(s.y - 6 - w.y) < 1) ? w.y + 6 : w.y;
      w.top = top;
      w.grad = g.createLinearGradient(0, top, 0, top + Math.max(80, w.h));
      w.grad.addColorStop(0, rgba(S.waterCol[0], 0.5)); w.grad.addColorStop(0.35, rgba(S.waterCol[0], 0.62)); w.grad.addColorStop(1, rgba(S.waterCol[1], 0.85));
    }
    g.fillStyle = w.grad; g.fillRect(w.x, w.top, w.w, w.h - (w.top - w.y));
  }
  // the surface: a gently moving line
  g.save(); g.lineWidth = 2; g.strokeStyle = rgba(S.waterHi, 0.5);
  for (const s of S.waterSurf) {
    g.beginPath();
    for (let x = s.x; x <= s.x + s.w; x += 10) g.lineTo(x, s.y + Math.sin(x * 0.05 + t * 2.2) * 1.6 + Math.sin(x * 0.013 - t) * 1.2);
    g.stroke();
  }
  g.restore();
}
function drawWaterGlow(g, G) {
  if (!S.waterSurf.length) return;
  const t = G.vt, c = G.cam;
  additive(g, () => {
    for (const s of S.waterSurf) {
      if (s.x > c.x + W || s.x + s.w < c.x || s.y < c.y - 20 || s.y > c.y + H + 20) continue;
      g.fillStyle = rgba(S.waterHi, 0.12); g.fillRect(s.x, s.y - 3, s.w, 6);
      // light scattered just under the surface
      if (!s.grad) { s.grad = g.createLinearGradient(0, s.y, 0, s.y + 110); s.grad.addColorStop(0, rgba(S.waterHi, 0.13)); s.grad.addColorStop(1, rgba(S.waterHi, 0)); }
      g.fillStyle = s.grad; g.fillRect(s.x, s.y, s.w, 110);
      // caustic glints drifting along the surface
      g.strokeStyle = rgba(S.waterHi, 0.45); g.lineWidth = 1.3;
      const n = Math.ceil(s.w / 50);
      for (let i = 0; i < n; i++) {
        const ph = (i * 97.3) % 50, x = s.x + ((i * 50 + ph + t * (10 + (i % 3) * 6)) % s.w), wd = 10 + (i * 13) % 30;
        const yy = s.y + 2 + Math.sin(t * 2 + i) * 2;
        g.beginPath(); g.moveTo(x, yy); g.lineTo(Math.min(s.x + s.w, x + wd), yy); g.stroke();
      }
    }
  });
}
function drawLava(g, G) {
  if (!S.lava.length) return;
  const t = G.vt, c = G.cam;
  for (const l of S.lava) {
    if (l.x > c.x + W || l.x + l.w < c.x || l.y > c.y + H || l.y + l.h < c.y - 40) continue;
    const top = S.lavaSurf.some((s) => Math.abs(s.y - 6 - l.y) < 1) ? l.y + 6 : l.y;
    if (!l.grad) { l.grad = g.createLinearGradient(0, top, 0, top + Math.max(60, l.h)); l.grad.addColorStop(0, '#ffd27a'); l.grad.addColorStop(0.12, '#ff8a2a'); l.grad.addColorStop(1, '#8a1406'); }
    g.fillStyle = l.grad;
    g.beginPath(); g.moveTo(l.x, l.y + l.h);
    if (top !== l.y) for (let x = l.x; x <= l.x + l.w; x += 10) g.lineTo(x, top + Math.sin(x * 0.04 + t * 1.6) * 2.5);
    else { g.lineTo(l.x, l.y); g.lineTo(l.x + l.w, l.y); }
    g.lineTo(l.x + l.w, l.y + l.h); g.closePath(); g.fill();
    // drifting crust
    g.fillStyle = 'rgba(60,8,4,0.5)';
    const n = Math.ceil(l.w * l.h / 4000);
    for (let i = 0; i < n; i++) {
      const fx = ((i * 137.7 + t * (6 + i % 4)) % l.w), fy = 10 + ((i * 71.3) % Math.max(10, l.h - 16));
      g.beginPath(); g.ellipse(l.x + fx, top + fy, 10 + (i * 17) % 26, 2.5 + (i % 3), 0, 0, TAU); g.fill();
    }
  }
  additive(g, () => {
    for (const s of S.lavaSurf) {
      if (s.x > c.x + W || s.x + s.w < c.x) continue;
      const gr = g.createLinearGradient(0, s.y - 50, 0, s.y + 4);
      gr.addColorStop(0, 'rgba(255,90,20,0)'); gr.addColorStop(1, 'rgba(255,130,40,0.4)');
      g.fillStyle = gr; g.fillRect(s.x, s.y - 50, s.w, 54);
      g.strokeStyle = 'rgba(255,240,170,0.75)'; g.lineWidth = 2;
      g.beginPath(); for (let x = s.x; x <= s.x + s.w; x += 10) g.lineTo(x, s.y + Math.sin(x * 0.04 + t * 1.6) * 2.5); g.stroke();
    }
  });
}

// ------------------------------------------------------------ foreground
// Hanging roots, vines or chains close to the camera, with a little extra parallax.
function hangers(r, P, R) {
  let last = -1e9;
  for (const p of S.ceils) {
    if (p.x - last < 260 + R() * 300 || R() < 0.5 || p.y > r.h * 0.6) continue;
    last = p.x;
    S.hangs.push({ x: p.x, y: p.y - 4, len: 60 + R() * 140, seed: (R() * 1e6) | 0, w: 3 + R() * 4 });
  }
}
function drawHangs(g, G) {
  if (!S.hangs.length) return;
  const r = G.room, P = pal(r.biome), cx = G.cam.x + W / 2, cy = G.cam.y + H / 2, t = G.vt;
  g.save(); g.lineCap = 'round';
  for (const h of S.hangs) {
    const px = (h.x - cx) * 0.18, py = (h.y - cy) * 0.1;
    const x = h.x + px, y = h.y + py;
    if (x < G.cam.x - 60 || x > G.cam.x + W + 60) continue;
    const sway = Math.sin(t * 0.8 + h.seed) * 6;
    if (r.biome === 'cloister') {
      g.strokeStyle = P.hang; g.lineWidth = 4;
      for (let i = 0; i < h.len; i += 12) { g.beginPath(); g.ellipse(x + sway * i / h.len, y + i, 4, 7, 0, 0, TAU); g.stroke(); }
    } else {
      g.strokeStyle = P.hang; g.lineWidth = h.w;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + sway + 8, y + h.len * 0.5, x + sway, y + h.len); g.stroke();
      g.lineWidth = h.w * 0.5;
      g.beginPath(); g.moveTo(x + 2, y + h.len * 0.3); g.quadraticCurveTo(x + 14 + sway, y + h.len * 0.5, x + 10 + sway, y + h.len * 0.75); g.stroke();
      if (r.biome === 'thicket') additive(g, () => glow(g, x + sway, y + h.len, 10, P.vineGlow2, 0.5));
    }
  }
  g.restore();
}

