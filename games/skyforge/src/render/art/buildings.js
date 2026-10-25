// Building painters: one entry point for every building id in the brief.
//
//   drawBuilding(g, type, x, y, opts)
//
// (x, y) is the screen position, in unzoomed world pixels, of the footprint's
// FRONT-LEFT GROUND CORNER: for a building on island cell (u, v) that is
// wpx(island.ox + u, island.oy + v, island.alt) from render/camera.js. The
// footprint w x d tiles (T = 48 px) runs right along the front edge (w*T px)
// and back/up-right along the depth by (0.55, -0.36) * d*T px, exactly the
// camera's oblique projection. Nothing is drawn below y + ~6 px (contact shadow).
//
// opts = {
//   level 1|2|..      (cottage 2 = townhouse; skyforge: stages completed 0..5)
//   state 'built'|'site'|'ruin'
//   progress 0..1     construction progress while state is 'site': foundation
//                     (<.25), frame (<.5), walls (<.75), roof/scaffold (<1)
//   t seconds         animation clock (sails, smoke, glows, flames, gears)
//   night 0..1        lit windows and lamps
//   damage 0..1, fire 0..1, working bool, seed (int, picks colour variants)
//   variant           smelter: 'vent' (on a heat vent); mooring/cablestation: dir 'e'|'w'|'n'|'s'
//   aim, firing       harpoon/bastion: aim angle (radians, screen space, 0 = right, -PI/2 = up), muzzle flash
//   charge 0..1       rod (glow) and shieldgen; on bool for shieldgen
//   growth 0..1       farm crop stage (0 tilled .. 1 ripe); defaults from t
//   part 'all'|'base'|'anim'|'light'
//       base  = the static body (cache this in a sprite; depends on level, state,
//               progress stage, damage, night bucket, seed, variant: see spriteKey)
//       anim  = moving parts drawn every frame on top (sails, smoke, flames, gears, crane)
//       light = additive halos (windows, lamps, furnaces, crystals) for after the night grade
//   size [w, d]       footprint override in tiles
// }
//
// buildingInfo(type, opts) -> anchors relative to (x, y): { size, W, D, top, bbox,
//   door, smoke[], glow[], fire[], center, dock?, cable?, muzzle?, roof }
// spriteKey(type, opts) -> a string that changes exactly when the base layer changes.
// FOOTPRINTS come from content/buildings.js (size [w, d]) when ECONOMY lists the
// type, otherwise from DEFAULT_SIZE below.
import { BUILDINGS } from '../../content/buildings.js';
import {
  T, DX, DY, OUT, rng, hash, lerp, clamp, sat, mix, rgba, shade, char, pathPts, rr, ell, circ, vgrad,
  glow, shadowBlob, face, box, ink, line, smoke, flames, NULLG, winGlow, FXFLAGS,
} from './common.js';
import { HOMES } from './homes.js';
import { INDUSTRY } from './industry.js';
import { FARMING } from './farming.js';
import { PORTS } from './airport.js';
import { DEFENCE } from './defence.js';
import { WONDER } from './skyforge.js';
import { drawSettler } from './settlers.js';

export const DEFS = Object.assign({}, HOMES, INDUSTRY, FARMING, PORTS, DEFENCE, WONDER);
export const BUILDING_IDS = Object.keys(DEFS);

export const DEFAULT_SIZE = {
  townhall: [2, 2], cottage: [1, 1], well: [1, 1], tavern: [2, 2], warehouse: [2, 2],
  lumber: [2, 2], quarry: [2, 2], mine: [2, 2], coalpit: [2, 2], sawmill: [2, 2], smelter: [2, 2], workshop: [2, 2], drill: [2, 2], refinery: [2, 2],
  farm: [3, 2], windmill: [1, 1], bakery: [2, 1],
  mooring: [2, 2], cablestation: [1, 1], shipyard: [3, 2],
  academy: [2, 2], observatory: [2, 2], market: [2, 2],
  harpoon: [1, 1], rod: [1, 1], shieldgen: [1, 1], bastion: [2, 2],
  skyforge: [3, 3],
};
export function footprint(type, o = {}) {
  if (o.size) return o.size;
  const b = Array.isArray(BUILDINGS) ? BUILDINGS.find((e) => e.id === type) : null;
  return (b && Array.isArray(b.size) && b.size.length === 2) ? b.size : (DEFAULT_SIZE[type] || [1, 1]);
}

// ---------------------------------------------------------------- options
function resolve(type, o) {
  const size = footprint(type, o);
  const seed = (o.seed ?? 1) | 0;
  const part = o.part || 'all';
  const state = o.state || 'built';
  const q = {
    type, size, W: size[0] * T, D: size[1] * T, seed, R: rng(hash(type, seed)),
    level: o.level ?? (type === 'skyforge' ? (state === 'built' ? 5 : 0) : 1), state, progress: sat(o.progress ?? (state === 'site' ? 0.5 : 1)),
    t: o.t ?? 0, night: sat(o.night ?? 0), damage: sat(o.damage ?? 0), fire: sat(o.fire ?? 0),
    working: o.working ?? true, variant: o.variant ?? null, dir: o.dir ?? null, aim: o.aim ?? -0.7, firing: !!o.firing,
    charge: o.charge ?? 0, tod: o.tod, on: o.on ?? true, growth: o.growth, reload: o.reload ?? 0,
    L: [],                                          // light halos collected while painting
  };
  q.lit = state === 'built' ? q.night : 0;          // window light
  return q;
}
const P_ALL = { base: true, anim: true, light: true };
const P_OF = { all: P_ALL, base: { base: true }, anim: { anim: true }, light: { light: true } };
function anchorsRec() { return { door: null, smoke: [], glow: [], fire: [], body: null, top: 0, l: 0, r: 0, b: 0, dock: null, cable: null, muzzle: null, roof: null }; }


// ---------------------------------------------------------------- layers (for damage and ruin tinting)
function makeLayer(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return null;
}
// paint fn into an offscreen layer covering bbox (local px), then post(lg) on it, then composite
function withLayer(g, bb, fn, post) {
  if (g === NULLG) { fn(g); return; }
  const m = g.getTransform ? g.getTransform() : { a: 1, d: 1 };
  const sc = clamp(Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)), 0.25, 4);
  const w = Math.ceil(bb.w * sc) + 2, h = Math.ceil(bb.h * sc) + 2;
  const L = w * h < 9e6 ? makeLayer(w, h) : null;
  if (!L) { fn(g); return; }
  const lg = L.getContext('2d');
  lg.scale(sc, sc); lg.translate(-bb.x, -bb.y);
  fn(lg);
  lg.setTransform(1, 0, 0, 1, 0, 0); lg.scale(sc, sc); lg.translate(-bb.x, -bb.y);
  post(lg);
  g.drawImage(L, bb.x, bb.y, w / sc, h / sc);
}

// ---------------------------------------------------------------- info
const INFO = new Map();
export function buildingInfo(type, o = {}) {
  const def = DEFS[type]; if (!def) return null;
  const size = footprint(type, o);
  const key = type + '|' + size + '|' + (o.level ?? '') + '|' + (o.variant ?? '') + '|' + (o.dir ?? '') + '|' + (o.state === 'built' || !o.state ? '' : o.state);
  let inf = INFO.get(key);
  if (inf) return inf;
  const q = resolve(type, { ...o, state: 'built', t: 0, night: 0, damage: 0, fire: 0 });
  const A = anchorsRec();
  def.paint(NULLG, q.W, q.D, q, P_ALL, A);
  const W = q.W, D = q.D;
  const top = Math.min(A.top, D * DY - 4);
  const x0 = Math.min(-4, -A.l), x1 = Math.max(W + D * DX + 4, W + D * DX + A.r), y1 = 8 + A.b;
  inf = {
    type, size, W, D, top, foot: [W, D],
    bbox: { x: x0 - 4, y: top - 6, w: x1 - x0 + 8, h: y1 - top + 6 },
    center: [W / 2 + D * DX / 2, D * DY / 2],
    door: A.door || [W / 2, 0], smoke: A.smoke, glow: A.glow,
    fire: A.fire.length ? A.fire : [[W * 0.35 + D * DX * 0.5, top * 0.6], [W * 0.65 + D * DX * 0.4, top * 0.45]],
    dock: A.dock, cable: A.cable, muzzle: A.muzzle, roof: A.roof ?? top, body: A.body,
  };
  INFO.set(key, inf);
  return inf;
}
// footprint polygon (local px) for hit testing on the ground
export function footPoly(type, o = {}) {
  const [w, d] = footprint(type, o), W = w * T, D = d * T;
  return [[0, 0], [W, 0], [W + D * DX, D * DY], [D * DX, D * DY]];
}
// hit test a local point (px relative to the anchor) against the building silhouette box
export function hitBuilding(type, px, py, o = {}) {
  const inf = buildingInfo(type, o); if (!inf) return false;
  const b = inf.bbox; if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) return false;
  // tighter: inside the footprint, or above it within the body column
  const W = inf.W, D = inf.D;
  const xl = 0 + Math.max(0, Math.min(D * DX, (-py) / -DY * DX));
  return px >= -6 && px <= W + D * DX + 6 && py <= 6 && py >= inf.top - 4 && (px >= xl - W * 0.15 || py < D * DY);
}
export function spriteKey(type, o = {}) {
  const st = o.state || 'built', p = o.progress ?? 1;
  const stage = st === 'site' ? Math.min(15, Math.floor(sat(p) * 16)) : 0;
  const nb = st === 'built' ? Math.round(sat(o.night ?? 0) * 4) : 0;
  const db = Math.round(sat(o.damage ?? 0) * 4);
  const gb = type === 'farm' ? Math.round(sat(o.growth ?? 0.5) * 8) : 0;
  const ex = type === 'harpoon' || type === 'bastion' ? Math.round((o.aim ?? -0.7) * 8) : 0;
  return [type, footprint(type, o), o.level ?? 1, st, stage, nb, db, (o.seed ?? 1) % 8, o.variant ?? '', o.dir ?? '', gb, ex, o.working === false ? 0 : 1].join('|');
}

// ---------------------------------------------------------------- the entry point
export function drawBuilding(g, type, x, y, opts = {}) {
  const def = DEFS[type]; if (!def) return null;
  const q = resolve(type, opts);
  const P = P_OF[q.part] || P_ALL;
  const A = anchorsRec();
  if (P === P_OF.light) { // light pass alone: run the whole painter blind to collect its halos
    const q2 = resolve(type, opts); paintAll(NULLG, def, q2, P_ALL, anchorsRec(), type, opts);
    g.save(); g.translate(x, y);
    if (q2.fire > 0.02 && q2.state !== 'site') burn(g, type, opts, q2, P);
    for (const [lx, ly, r, col, a] of q2.L) glow(g, lx, ly, r, col, a * dayDim(q2.night));
    g.restore(); return A;
  }
  g.save(); g.translate(x, y);
  paintAll(g, def, q, P, A, type, opts);
  if (q.fire > 0.02 && q.state !== 'site') burn(g, type, opts, q, P);
  if (P.light) for (const [lx, ly, r, col, a] of q.L) glow(g, lx, ly, r, col, a * dayDim(q.night));
  g.restore();
  return A;
}
// halos read far stronger against a bright day sky: tone them down by day
const dayDim = (n) => 0.42 + 0.58 * n;
function paintAll(g, def, q, P, A, type, opts) {
  if (type === 'skyforge') def.paint(g, q.W, q.D, q, P, A);           // the wonder handles its own stages
  else if (q.state === 'site') construction(g, def, q, P, A);
  else if (q.state === 'ruin') ruin(g, def, q, P, A);
  else {
    if (q.damage > 0.05 && P.base) {
      const inf = buildingInfo(type, opts);
      withLayer(g, inf.bbox, (lg) => def.paint(lg, q.W, q.D, q, { base: true }, A), (lg) => soot(lg, inf, q));
      cracks(g, inf, q);
      if (P.anim || P.light) def.paint(g, q.W, q.D, q, { anim: P.anim, light: P.light }, A);
    } else def.paint(g, q.W, q.D, q, P, A);
    if (q.damage > 0.35 && P.anim) { const inf = buildingInfo(type, opts); const [sx, sy] = inf.fire[0]; smoke(g, sx, sy, 0.55 + q.damage * 0.3, '#5a5058', { t: q.t, seed: q.seed + 7, n: 6, a: 0.5 * q.damage }); }
  }
}

// ---------------------------------------------------------------- damage and fire
function soot(lg, inf, q) {
  const R = rng(q.seed * 31 + 5), W = inf.W, D = inf.D, k = q.damage;
  lg.save(); lg.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 3 + k * 7; i++) {
    const x = lerp(W * 0.05, W + D * DX * 0.8, R()), y = lerp(inf.top * 0.9, -2, R()), r = (10 + R() * 22) * (0.6 + k);
    const gr = lg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(30,20,22,${0.55 * k})`); gr.addColorStop(1, 'rgba(30,20,22,0)');
    lg.fillStyle = gr; lg.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // scorch streaks rising from the windows
  lg.fillStyle = vgrad(lg, inf.top, 0, [[0, `rgba(25,18,20,${0.35 * k})`], [1, 'rgba(25,18,20,0)']]); lg.fillRect(inf.bbox.x, inf.top, inf.bbox.w, -inf.top);
  lg.restore();
}
function cracks(g, inf, q) {
  const R = rng(q.seed * 17 + 3), k = q.damage, W = inf.W, b = inf.body || { x: W * 0.2, y: -4, w: W * 0.6, h: -inf.top * 0.5 };
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < Math.round(k * 6); i++) {
    let x = lerp(b.x + b.w * 0.1, b.x + b.w * 0.9, R()), y = lerp(b.y - b.h * 0.95, b.y - b.h * 0.45, R());
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 4; s++) { x += (R() - 0.5) * 6; y += 2 + R() * 3; g.lineTo(x, y); }
    g.strokeStyle = rgba('#1c0f16', 0.65); g.lineWidth = 1.2; g.stroke();
  }
  if (k > 0.5) { // a loose plank hanging from the roof line
    const x = lerp(b.x + b.w * 0.2, b.x + b.w * 0.8, R()), y = b.y - b.h;
    g.save(); g.translate(x, y); g.rotate(0.5 + R() * 0.5); g.fillStyle = '#8a6040'; g.fillRect(-2, 0, 4, 16); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(-2, 0, 4, 16); g.restore();
  }
  g.restore();
}
function burn(g, type, opts, q, P) {
  const inf = buildingInfo(type, opts), f = q.fire, pts = inf.fire, n = Math.max(1, Math.round(pts.length * Math.min(1, f * 1.6)));
  for (let i = 0; i < n; i++) {
    const [fx, fy] = pts[i % pts.length], s = (0.55 + f * 0.75) * (inf.W >= 96 ? 1.15 : 0.85);
    if (P.anim) { smoke(g, fx + 4, fy - 26 * s, 0.9 * s + f * 0.4, '#3e3640', { t: q.t, seed: q.seed + i * 13, n: 7, a: 0.6, drift: 1.2 }); flames(g, fx, fy, s, q.t, q.seed + i * 7, 4 + Math.round(f * 4)); }
    if (P.light) glow(g, fx, fy - 12 * s, 34 * s + f * 26, '#ff7a2a', (0.3 + f * 0.25) * (0.55 + 0.45 * q.night));
  }
}

// ---------------------------------------------------------------- construction site
const STAGES = ['foundation', 'frame', 'walls', 'roof'];
export const stageOf = (p) => STAGES[Math.min(3, Math.floor(sat(p) * 4))];
function construction(g, def, q, P, A) {
  const inf = buildingInfo(q.type, { size: q.size, level: q.level, variant: q.variant, dir: q.dir });
  const W = q.W, D = q.D, p = q.progress, st = Math.min(3, Math.floor(p * 4)), sub = sat(p * 4 - st);
  const body = inf.body || { x: W * 0.12 + D * 0.15 * DX, y: D * 0.15 * DY, w: W * 0.76, h: Math.min(-inf.top * 0.6, 40), d: D * 0.7 };
  const R = rng(q.seed + 99), lq = { ...q, lit: 0, night: 0, working: false, L: [] };
  if (P.base) {
    shadowBlob(g, W * 0.6 + D * DX * 0.4, D * DY * 0.4 + 2, W * 0.55, D * 0.22, 0.18);
    pad(g, W, D, st === 0 ? sub : 1, R);
    if (st >= 2) {
      // the real building, clipped to the height the walls have reached (stage 2), whole in stage 3
      const top = st === 2 ? lerp(0, body.h, 0.3 + sub * 0.7) : 1e4;
      const bx0 = inf.bbox.x - 40, bx1 = inf.bbox.x + inf.bbox.w + 40, cy = body.y - top, ox = body.d * DX, oy = body.d * DY;
      g.save(); pathPts(g, [[bx0, 40], [bx0, cy], [body.x + body.w, cy], [body.x + body.w + ox, cy + oy], [bx1, cy + oy], [bx1, 40]]); g.clip();
      def.paint(g, W, D, lq, { base: true }, anchorsRec());
      g.restore();
      if (st === 2) frame(g, body, 1, true);
    }
    if (st === 1) frame(g, body, 0.25 + sub * 0.75, false);
    if (st >= 1) scaffold(g, body, st === 3 ? 1 - sub * 0.7 : 1, R);
    materials(g, W, D, R, st);
  }
  if (P.anim) {
    // builders at work
    const n = W >= 96 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const bx = (i ? W * 0.82 : W * 0.18) + D * DX * 0.1, by = D * DY * 0.1 + 4;
      drawSettler(g, bx, by, { seed: q.seed + i * 3, t: q.t + i * 0.37, hammer: true, dir: i ? -1 : 1, s: 1 });
    }
    if (st === 0 && sub > 0.1) smoke(g, W * 0.4 + D * DX * 0.5, D * DY * 0.5, 0.35, '#e8dcc8', { t: q.t, seed: q.seed, n: 4, a: 0.35, rise: 30 });
  }
  A.top = inf.top;
}
function pad(g, W, D, f, R) {
  const m = 3, P0 = [m + m * DX, m * DY], ox = (D - 2 * m) * DX, oy = (D - 2 * m) * DY, w = W - 2 * m;
  const pts = [P0, [P0[0] + w, P0[1]], [P0[0] + w + ox, P0[1] + oy], [P0[0] + ox, P0[1] + oy]];
  // dug earth
  pathPts(g, pts); g.fillStyle = '#b08458'; g.fill(); g.strokeStyle = rgba('#5a3a20', 0.6); g.lineWidth = 1; g.stroke();
  // stone pad laid row by row
  const rows = 6, done = Math.round(rows * f);
  for (let r = 0; r < done; r++) {
    const t0 = r / rows, t1 = (r + 1) / rows;
    const q = [[P0[0] + ox * t0, P0[1] + oy * t0], [P0[0] + w + ox * t0, P0[1] + oy * t0], [P0[0] + w + ox * t1, P0[1] + oy * t1], [P0[0] + ox * t1, P0[1] + oy * t1]];
    pathPts(g, q); g.fillStyle = r % 2 ? '#cfc2b0' : '#c4b6a2'; g.fill();
    g.strokeStyle = rgba('#6a5a58', 0.45); g.lineWidth = 0.8; g.stroke();
    for (let c = 1; c < W / 14; c++) { const xx = c * 14 + (r % 2) * 7; if (xx < w) line(g, q[0][0] + xx, q[0][1], q[3][0] + xx, q[3][1], rgba('#6a5a58', 0.35), 0.8); }
  }
  // front edge of the pad (thickness)
  g.fillStyle = '#8f7f72'; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); g.lineTo(pts[1][0], pts[1][1] + 3); g.lineTo(pts[0][0], pts[0][1] + 3); g.closePath(); g.fill();
  // corner stakes with string line
  g.strokeStyle = rgba('#fff2d0', 0.8); g.lineWidth = 0.8; pathPts(g, pts.map(([a, b]) => [a, b - 5])); g.stroke();
  for (const [a, b] of pts) { g.fillStyle = '#7a5236'; g.fillRect(a - 1, b - 7, 2, 8); g.fillStyle = '#e24a3a'; g.fillRect(a - 1.4, b - 8, 2.8, 2); }
}
function frame(g, b, f, upperOnly) {
  const { x, y, w, h, d } = b, ox = d * DX, oy = d * DY, hh = h * f, col = '#9a6a42';
  g.lineCap = 'butt';
  const post = (px, py) => { g.fillStyle = col; g.fillRect(px - 1.6, py - hh, 3.2, hh); g.strokeStyle = OUT; g.lineWidth = 0.8; g.strokeRect(px - 1.6, py - hh, 3.2, hh); };
  // back posts first
  post(x + ox, y + oy); post(x + w + ox, y + oy);
  const beam = (x1, y1, x2, y2) => { line(g, x1, y1, x2, y2, OUT, 3.6); line(g, x1, y1, x2, y2, '#b07a4c', 2.2); };
  if (f > 0.6) { beam(x + ox, y + oy - hh, x + w + ox, y + oy - hh); beam(x, y - hh, x + ox, y + oy - hh); beam(x + w, y - hh, x + w + ox, y + oy - hh); }
  post(x, y); post(x + w, y); if (w > 60) post(x + w / 2, y);
  if (f > 0.6) beam(x, y - hh, x + w, y - hh);
  if (!upperOnly) { // diagonal braces
    line(g, x + 2, y - 2, x + w * 0.35, y - hh * 0.6, '#8a5a3a', 1.6); line(g, x + w - 2, y - 2, x + w * 0.65, y - hh * 0.6, '#8a5a3a', 1.6);
    line(g, x + w, y - hh * 0.5, x + w + ox, y + oy - hh * 0.5, '#8a5a3a', 1.6);
  }
  g.lineCap = 'round';
}
function scaffold(g, b, a, R) {
  const { x, y, w, h } = b, H = h + 10;
  g.save(); g.globalAlpha = a;
  const col = '#b98a5a';
  for (let i = 0; i <= Math.max(2, Math.round(w / 26)); i++) { const px = x - 4 + i * (w + 8) / Math.max(2, Math.round(w / 26)); line(g, px, y + 3, px, y - H, OUT, 2.6); line(g, px, y + 3, px, y - H, col, 1.6); }
  for (let lv = 1; lv <= 3; lv++) {
    const py = y - H * lv / 3.2;
    g.fillStyle = '#c99a62'; g.fillRect(x - 6, py - 1.5, w + 12, 3); g.strokeStyle = OUT; g.lineWidth = 0.8; g.strokeRect(x - 6, py - 1.5, w + 12, 3);
  }
  line(g, x - 4, y, x + w * 0.5, y - H * 0.6, rgba('#8a5a3a', 0.8), 1);
  // ladder
  const lx = x + w * 0.75; line(g, lx, y + 2, lx + 3, y - H * 0.62, '#7a5236', 1.2); line(g, lx + 5, y + 2, lx + 8, y - H * 0.62, '#7a5236', 1.2);
  for (let i = 1; i < 7; i++) { const t = i / 7; line(g, lx + t * 3, y + 2 - t * (H * 0.62 + 2), lx + 5 + t * 3, y + 2 - t * (H * 0.62 + 2), '#7a5236', 1); }
  g.restore();
}
function materials(g, W, D, R, st) {
  // a stack of planks and a pile of cut stone at the front-right corner
  const x = W - 16, y = 2;
  for (let i = 0; i < 4; i++) { box(g, x - 8, y - i * 2.6, 18, 2.6, 7, i % 2 ? '#d0a46a' : '#c09058', { ao: false }); }
  if (st < 3) for (const [a, b] of [[-26, 2], [-19, 2], [-23, -4]]) box(g, x + a, y + b, 6, 5, 5, '#c8bcae', { ao: false });
}

// ---------------------------------------------------------------- ruin
function ruin(g, def, q, P, A) {
  const inf = buildingInfo(q.type, { size: q.size, level: q.level, variant: q.variant, dir: q.dir });
  const W = q.W, D = q.D, R = rng(q.seed * 7 + 1), lq = { ...q, lit: 0, night: 0, working: false, L: [], damage: 0 };
  const cut = Math.max(inf.top * 0.42, -46);
  if (P.base) {
    withLayer(g, inf.bbox, (lg) => def.paint(lg, W, D, lq, { base: true }, anchorsRec()), (lg) => {
      // break the top off along a jagged line, then char what is left
      lg.save(); lg.globalCompositeOperation = 'destination-out'; lg.beginPath();
      const x0 = inf.bbox.x - 2, x1 = inf.bbox.x + inf.bbox.w + 2; lg.moveTo(x0, inf.bbox.y - 2);
      for (let x = x0, i = 0; x <= x1; x += 6, i++) lg.lineTo(x, cut + (x - x0) * (DY * 0.4) + (i % 2 ? -1 : 1) * (2 + R() * 9) + Math.sin(x * 0.08) * 6);
      lg.lineTo(x1, inf.bbox.y - 2); lg.closePath(); lg.fill(); lg.restore();
      lg.save(); lg.globalCompositeOperation = 'source-atop';
      lg.fillStyle = 'rgba(44,30,32,0.55)'; lg.fillRect(inf.bbox.x, inf.bbox.y, inf.bbox.w, inf.bbox.h);
      lg.fillStyle = vgrad(lg, cut - 10, 0, [[0, 'rgba(15,10,12,0.55)'], [1, 'rgba(15,10,12,0)']]); lg.fillRect(inf.bbox.x, cut - 20, inf.bbox.w, -cut + 20);
      lg.restore();
    });
    // rubble and charred beams
    for (let i = 0; i < 9; i++) {
      const u = R(), x = lerp(4, W + D * DX * 0.6, u), y = lerp(2, D * DY * 0.5, R()) + 2;
      box(g, x, y, 4 + R() * 7, 3 + R() * 5, 3 + R() * 4, R() < 0.5 ? '#8f8078' : '#6e5a50', { ao: false });
    }
    for (let i = 0; i < 3; i++) {
      const x = lerp(W * 0.15, W * 0.85, R()), y = lerp(-4, D * DY * 0.5, R()), a = -0.6 + R() * 1.2, l = 18 + R() * 16;
      line(g, x, y, x + Math.cos(a - 1.2) * l, y + Math.sin(a - 1.2) * l, OUT, 4.4); line(g, x, y, x + Math.cos(a - 1.2) * l, y + Math.sin(a - 1.2) * l, '#3a2622', 3);
    }
  }
  if (P.anim) smoke(g, W * 0.45 + D * DX * 0.5, cut * 0.6, 0.5, '#6a6068', { t: q.t, seed: q.seed, n: 5, a: 0.35 });
  A.top = cut;
}

// ---------------------------------------------------------------- renderer adapter (render/scene.js)
// BUILDING_ART[type] = { static(g, o), anim(g, o), lights(g, o), bounds } with the renderer's
// option names: o = { w, d, level, state, progress, damaged, on, night, t, seed, stage, aim, firing,
// charge, growth, variant, dir, working }. Origin = the footprint's front-left ground corner.
// anim and lights leave smoke and building fires to the renderer's fx (see CHIMNEYS/GLOWS and
// buildingInfo().fire); pass o.smoke = true to have the painters draw their own smoke columns.
const toOpts = (type, o = {}, part) => ({
  size: o.w && o.d ? [o.w, o.d] : undefined, level: type === 'skyforge' ? (o.stage ?? o.level ?? 0) : (o.level ?? 1),
  state: o.state || 'built', progress: o.progress, damage: o.damaged ?? o.damage ?? 0, fire: o.smoke ? (o.fire ?? 0) : 0,
  on: o.on, working: o.working ?? (o.on !== false), night: o.night ?? 0, t: o.t ?? 0, seed: o.seed ?? 1, aim: o.aim, firing: o.firing,
  charge: o.charge, growth: o.growth, variant: o.variant, dir: o.dir, reload: o.reload, tod: o.tod, part,
});
function withSmoke(on, fn) { const was = FXFLAGS.smoke; FXFLAGS.smoke = on; try { fn(); } finally { FXFLAGS.smoke = was; } }
export function paintBuilding(g, type, o = {}) { drawBuilding(g, type, 0, 0, toOpts(type, o, 'base')); }
export const BUILDING_ART = {};
export const CHIMNEYS = {}, GLOWS = {};
for (const type of Object.keys(DEFS)) {
  BUILDING_ART[type] = {
    static: (g, o) => drawBuilding(g, type, 0, 0, toOpts(type, o, 'base')),
    anim: (g, o) => withSmoke(!!(o && o.smoke), () => drawBuilding(g, type, 0, 0, toOpts(type, o, 'anim'))),
    lights: (g, o) => drawBuilding(g, type, 0, 0, toOpts(type, o, 'light')),
    get bounds() {
      let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
      for (const level of type === 'skyforge' ? [5] : type === 'cottage' ? [1, 2] : [1]) {
        const b = buildingInfo(type, { level }).bbox; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
      }
      return [x0, y0, x1, y1];
    },
  };
  Object.defineProperty(CHIMNEYS, type, { enumerable: true, get: () => buildingInfo(type, {}).smoke });
  Object.defineProperty(GLOWS, type, { enumerable: true, get: () => buildingInfo(type, {}).glow });
}
