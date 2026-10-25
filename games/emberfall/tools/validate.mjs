#!/usr/bin/env node
// Emberfall map validator (node, no dependencies).
//
//   node games/emberfall/tools/validate.mjs [--write] [--png out.png] [--quiet]
//
// Loads the room data (src/world/rooms/index.js), then checks:
//  - room sizes, no overlapping rooms, edge openings that line up exactly
//    with the neighbour (both rooms open over the same tiles), openings that
//    lead nowhere, every room connected on the grid graph;
//  - a movement solver: the whole world as one tile grid, the wanderer's moves
//    simulated with the same integrator as src/player.js (jump, hang, Twin Leap,
//    Ember Dash, Root Grip wall kicks, Chain Hook rings, swimming, Fire Form in
//    lava and through ember-thorns) at 60 Hz, searched breadth-first from the
//    start for each stage of the ability order. It proves every ability, boss
//    trigger and the ending is reachable in order, every vessel, shard cache
//    and lore tablet in the end, that each gate (from -> to) needs its ability,
//    and reports soft locks (places you can reach but never leave).
//  --write  writes src/world/rooms/exits.js (what each exit requires, from the solver)
//  --png    draws the whole map (3 px per tile) to the given file
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

globalThis.location ??= { search: '' };
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src');
const { ROOM_LIST } = await import(pathToFileURL(join(src, 'world/rooms/index.js')));
const { PHYS, ABILITIES, ROOM_W, ROOM_H, TILE } = await import(pathToFileURL(join(src, 'config.js')));
const { CHARS } = await import(pathToFileURL(join(src, 'world/tiles.js')));

const args = process.argv.slice(2);
const WRITE = args.includes('--write'), QUIET = args.includes('--quiet');
const PNG = args.includes('--png') ? args[args.indexOf('--png') + 1] : null;
const errors = [], warns = [];
const err = (m) => errors.push(m), warn = (m) => warns.push(m);

// ------------------------------------------------------------- structure
const rooms = ROOM_LIST, byId = Object.fromEntries(rooms.map((r) => [r.id, r]));
if (rooms.length !== Object.keys(byId).length) err('duplicate room ids');
let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
for (const r of rooms) {
  gx0 = Math.min(gx0, r.gx); gy0 = Math.min(gy0, r.gy); gx1 = Math.max(gx1, r.gx + r.w); gy1 = Math.max(gy1, r.gy + r.h);
  if (r.tiles.length !== ROOM_H * r.h || r.tiles.some((s) => s.length !== ROOM_W * r.w)) err(`${r.id}: bad tile size`);
}
const GW = (gx1 - gx0) * ROOM_W, GH = (gy1 - gy0) * ROOM_H, N = GW * GH;
const grid = new Uint8Array(N).fill(1), roomAt = new Int16Array(N).fill(-1);
const screenOwner = new Map();
rooms.forEach((r, ri) => {
  for (let sy = 0; sy < r.h; sy++) for (let sx = 0; sx < r.w; sx++) {
    const k = `${r.gx + sx},${r.gy + sy}`;
    if (screenOwner.has(k)) err(`${r.id} overlaps ${screenOwner.get(k)} at screen ${k}`);
    screenOwner.set(k, r.id);
  }
  const ox = (r.gx - gx0) * ROOM_W, oy = (r.gy - gy0) * ROOM_H;
  r._ox = ox; r._oy = oy; r._ri = ri;
  r.tiles.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const i = (oy + y) * GW + ox + x; grid[i] = CHARS[row[x]] ?? 0; roomAt[i] = ri; } });
});
const cell = (x, y) => (x < 0 || y < 0 || x >= GW || y >= GH) ? 1 : grid[y * GW + x];
const roomOf = (x, y) => (x < 0 || y < 0 || x >= GW || y >= GH) ? -1 : roomAt[y * GW + x];

// openings: runs of non-'#' tiles on each side of each room
const SIDES = ['l', 'r', 'u', 'd'];
function openings(r) {
  const out = [], tw = ROOM_W * r.w, th = ROOM_H * r.h;
  for (const side of SIDES) {
    const n = side === 'l' || side === 'r' ? th : tw;
    let run = null;
    for (let i = 0; i <= n; i++) {
      let open = false, tx = 0, ty = 0;
      if (i < n) {
        tx = side === 'l' ? 0 : side === 'r' ? tw - 1 : i; ty = side === 'u' ? 0 : side === 'd' ? th - 1 : i;
        if (side === 'l' || side === 'r') ty = i;
        open = r.tiles[ty][tx] !== '#';
      }
      if (open && !run) run = { side, at: i, len: 0 };
      if (open) run.len++;
      if (!open && run) { out.push(run); run = null; }
    }
  }
  for (const o of out) {
    // the neighbour across the middle of the opening
    const mid = o.at + (o.len >> 1);
    const tx = o.side === 'l' ? -1 : o.side === 'r' ? ROOM_W * r.w : mid, ty = o.side === 'u' ? -1 : o.side === 'd' ? ROOM_H * r.h : mid;
    const ri = roomOf(r._ox + tx, r._oy + ty);
    o.to = ri >= 0 ? rooms[ri].id : null;
  }
  return out;
}
for (const r of rooms) {
  r._open = openings(r);
  const tw = ROOM_W * r.w, th = ROOM_H * r.h;
  for (const o of r._open) {
    if (!o.to) { err(`${r.id}: opening ${o.side}@${o.at}+${o.len} leads nowhere`); continue; }
    for (let i = o.at; i < o.at + o.len; i++) {
      const tx = o.side === 'l' ? -1 : o.side === 'r' ? tw : i, ty = o.side === 'u' ? -1 : o.side === 'd' ? th : i;
      const ri = roomOf(r._ox + tx, r._oy + ty);
      if (ri < 0 || rooms[ri].id !== o.to) err(`${r.id}: opening ${o.side}@${o.at} spans two rooms`);
    }
  }
  // tile-exact match with the neighbour
  const check = (x, y, nx, ny, what) => {
    const a = cell(x, y), b = cell(nx, ny), ra = roomOf(nx, ny);
    if (ra < 0) return;
    if ((a === 1) !== (b === 1)) err(`${r.id}: ${what} tile ${x - r._ox},${y - r._oy} open=${a !== 1} but ${rooms[ra].id} open=${b !== 1}`);
  };
  for (let y = 0; y < th; y++) { check(r._ox, r._oy + y, r._ox - 1, r._oy + y, 'left'); check(r._ox + tw - 1, r._oy + y, r._ox + tw, r._oy + y, 'right'); }
  for (let x = 0; x < tw; x++) { check(r._ox + x, r._oy, r._ox + x, r._oy - 1, 'top'); check(r._ox + x, r._oy + th - 1, r._ox + x, r._oy + th, 'bottom'); }
}
// grid connectivity
const startRoom = rooms.find((r) => r.start);
if (!startRoom) err('no start (w) in any room');
{
  const seen = new Set(startRoom ? [startRoom.id] : []), q = [...seen];
  while (q.length) { const id = q.shift(); for (const o of byId[id]._open) if (o.to && !seen.has(o.to)) { seen.add(o.to); q.push(o.to); } }
  for (const r of rooms) if (!seen.has(r.id)) err(`${r.id}: not connected to the start on the grid`);
}

// ------------------------------------------------------------- the mover (mirror of src/player.js)
const TMAX = +(process.env.EFTMAX || 10);
const Q = +(process.env.EFQ || 16), QV = +(process.env.EFQV || 150), SEG = +(process.env.EFSEG || 10);
const STEP = 1 / 60, G0 = PHYS.gravity, RUN = PHYS.runSpeed, PW = PHYS.playerW, PH = PHYS.playerH;
const APEX_V = 90, HANG_K = 0.55, FALL_K = 1.7, CUT_K = 3, ACC_AIR = 3600, DEC_AIR = 2200, OVER_AIR = 500;
const DASH_STEPS = 12, DASH_V = PHYS.dashDistance / (DASH_STEPS * STEP);
const WALL_SLIDE = 130, WALL_KICK = 340, WALL_LOCK = 0.13, WALL_KICK_IN = 150, WALL_LOCK_IN = 0.08, HANG_L = 70;
function gravK(vy, held) { if (vy < 0) return !held ? CUT_K : vy > -APEX_V ? HANG_K : 1; return held && vy < APEX_V ? HANG_K : FALL_K; }
function riseHeight(v0) { let vy = -v0, y = 0, top = 0; for (let n = 0; n < 1000; n++) { vy += G0 * gravK(vy, true) * STEP; if (vy >= 0) break; y += vy * STEP; top = Math.min(top, y); } return -top; }
function solveJump(h) { let lo = 50, hi = 4000; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (riseHeight(m) < h) lo = m; else hi = m; } return (lo + hi) / 2; }
const JUMP_V = solveJump(PHYS.jumpHeight), DOUBLE_V = solveJump(PHYS.doubleJumpHeight);
const WALL_V = solveJump(110), WALL_V_IN = solveJump(125);

// ability flags for a stage, and a per-cell flag table rebuilt from them
let AB = { leap: false, dash: false, grip: false, hook: false, fire: false };
const F_SOLID = 1, F_ONEWAY = 2, F_HAZ = 4, F_THORN = 8, F_LIQ = 16, F_GRIP = 32;
const FL = new Uint8Array(N);
function buildFlags() {
  for (let i = 0; i < N; i++) {
    const c = grid[i]; let f = 0;
    if (c === 1 || c === 6 || (c === 7 && !AB.dash) || (c === 8 && !AB.fire)) f |= F_SOLID;
    if ((f & F_SOLID) && c !== 8) f |= F_GRIP;
    if (c === 2 || c === 11) f |= F_ONEWAY;
    if (c === 3 || (c === 5 && !AB.fire)) f |= F_HAZ;
    if (c === 8 && !AB.fire) f |= F_THORN;
    if (c === 4 || (c === 5 && AB.fire)) f |= F_LIQ;
    FL[i] = f;
  }
}
const fl = (tx, ty) => (tx < 0 || ty < 0 || tx >= GW || ty >= GH) ? F_SOLID | F_GRIP : FL[ty * GW + tx];
const solid = (c) => c === 1 || c === 6 || (c === 7 && !AB.dash) || (c === 8 && !AB.fire);
const oneway = (c) => c === 2 || c === 11;
const liquid = (c) => c === 4 || (c === 5 && AB.fire);
const tAt = (px, py) => cell(Math.floor(px / TILE), Math.floor(py / TILE));
function boxMask(x, y, w, h, m) {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE), y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (fl(tx, ty) & m) return true;
  return false;
}
const free = (x, y) => !boxMask(x, y, PW, PH, F_SOLID);
function colMask(x, y, h, m) { const tx = Math.floor(x / TILE), y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE); for (let ty = y0; ty <= y1; ty++) if (fl(tx, ty) & m) return true; return false; }
function rowMask(x, w, y, m) { const ty = Math.floor(y / TILE), x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE); for (let tx = x0; tx <= x1; tx++) if (fl(tx, ty) & m) return true; return false; }
function moveBody(b) {
  b.hitWall = 0; b.onGround = false;
  let dx = b.vx * STEP; const sx = Math.sign(dx) * Math.min(Math.abs(dx), TILE / 2);
  while (dx !== 0) {
    const m = Math.abs(dx) < Math.abs(sx) ? dx : sx, nx = b.x + m, edge = m > 0 ? nx + PW : nx;
    if (colMask(edge, b.y, PH, F_SOLID)) { b.x = m > 0 ? Math.floor((nx + PW) / TILE) * TILE - PW : (Math.floor(nx / TILE) + 1) * TILE; b.hitWall = m > 0 ? 1 : -1; b.vx = 0; break; }
    b.x = nx; dx -= m;
  }
  let dy = b.vy * STEP; const sy = Math.sign(dy) * Math.min(Math.abs(dy), TILE / 2);
  while (dy !== 0) {
    const m = Math.abs(dy) < Math.abs(sy) ? dy : sy, ny = b.y + m;
    if (m > 0) {
      const foot = ny + PH, prev = b.y + PH, ty = Math.floor(foot / TILE);
      let land = rowMask(b.x, PW, foot, F_SOLID);
      if (!land && !(b.drop > 0) && Math.floor((prev - 0.01) / TILE) < ty && rowMask(b.x, PW, foot, F_ONEWAY)) land = true;
      if (land) { b.y = ty * TILE - PH; b.vy = 0; b.onGround = true; break; }
    } else if (rowMask(b.x, PW, ny, F_SOLID)) { b.y = (Math.floor(ny / TILE) + 1) * TILE; b.vy = 0; break; }
    b.y = ny; dy -= m;
  }
}
function cornerCorrect(b) {
  if (b.vy >= 0) return;
  const ny = b.y + b.vy * STEP;
  if (free(b.x, ny)) return;
  for (let k = 1; k <= 10; k++) for (let s = 1; s >= -1; s -= 2) {
    if (s * k * b.vx < 0 && k > 4) continue;
    const nx = b.x + s * k;
    if (free(nx, ny) && free(nx, b.y)) { b.x = nx; return; }
  }
}
const wallSide = (b, dir, reach = 3) => boxMask(dir > 0 ? b.x + PW : b.x - reach, b.y + 10, reach, PH - 20, F_GRIP);
function horizontal(b, dir) {
  if (b.lock > 0) return;
  const target = dir * RUN; let a;
  if (Math.abs(b.vx) > RUN && Math.sign(b.vx) === dir) a = OVER_AIR; else if (dir === 0) a = DEC_AIR; else a = ACC_AIR;
  b.vx = b.vx < target ? Math.min(target, b.vx + a * STEP) : Math.max(target, b.vx - a * STEP);
}
// an airborne body (field order fixed so V8 keeps one shape)
function Body(x, y, vx, vy, held, air, dashReady, dashN, dashDir, lock, drop, swimLock, t) {
  this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.held = held; this.air = air; this.dashReady = dashReady;
  this.dashN = dashN; this.dashDir = dashDir; this.lock = lock; this.drop = drop; this.swimLock = swimLock; this.t = t;
  this.hitWall = 0; this.onGround = false;
}
const clone = (s) => new Body(s.x, s.y, s.vx, s.vy, s.held, s.air, s.dashReady, s.dashN, s.dashDir, s.lock, s.drop, s.swimLock, s.t);
// one 60 Hz air step; returns 1 ground, 2 liquid, 3 dead, 0 still flying
function airStep(b, dir) {
  if (b.lock > 0) b.lock = Math.max(0, b.lock - STEP);
  if (b.drop > 0) b.drop = Math.max(0, b.drop - STEP);
  if (b.swimLock > 0) b.swimLock = Math.max(0, b.swimLock - STEP);
  if (b.dashN > 0) {
    b.vx = b.dashDir * DASH_V; b.vy = 0;
    const ax = b.x + b.vx * STEP;
    if (!free(ax, b.y)) for (let k = 1; k <= 14; k++) if (free(ax, b.y - k) && free(b.x, b.y - k)) { b.y -= k; break; }
    moveBody(b); b.dashN--;
    if (b.hitWall) b.dashN = 0;
    if (b.dashN <= 0) { b.vx = dir === b.dashDir ? dir * RUN : 0; b.vy = 0; }
  } else {
    horizontal(b, dir);
    let onWall = false;
    if (AB.grip && dir && b.vy > 0 && wallSide(b, dir)) { onWall = true; b.air = AB.leap ? 1 : 0; b.dashReady = true; }
    b.vy += G0 * gravK(b.vy, b.held) * STEP;
    if (onWall) b.vy = Math.min(b.vy, WALL_SLIDE);
    if (b.vy > PHYS.maxFall) b.vy = PHYS.maxFall;
    cornerCorrect(b);
    moveBody(b);
    if (b.hitWall && b.lock > 0) b.lock = 0;
  }
  // hazards (as player.js touchHazards) and liquids
  if (boxMask(b.x + 4, b.y + 6, PW - 8, PH - 8, F_HAZ)) return 3;
  if (!AB.fire && boxMask(b.x - 2, b.y - 2, PW + 4, PH + 4, F_THORN)) return 3;
  if (!(b.swimLock > 0) && (fl(Math.floor((b.x + PW / 2) / TILE), Math.floor((b.y + PH * 0.45) / TILE)) & F_LIQ)) return 2;
  if (b.onGround) return 1;
  return 0;
}

// ------------------------------------------------------------- nodes and the search
// node ids: stand node = cell index of the tile the feet are in; liquid = N + component; anchor = N + NC + i
const comp = new Int32Array(N).fill(-1);
let NC = 0;
const compCells = [];
function buildComps() {
  comp.fill(-1); NC = 0; compCells.length = 0;
  for (let i = 0; i < N; i++) {
    if (comp[i] >= 0 || !liquid(grid[i])) continue;
    const list = [i]; comp[i] = NC;
    for (let k = 0; k < list.length; k++) {
      const j = list[k], x = j % GW, y = (j / GW) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const n2 = ny * GW + nx;
        if (comp[n2] < 0 && liquid(grid[n2])) { comp[n2] = NC; list.push(n2); }
      }
    }
    compCells.push(list); NC++;
  }
}
const anchors = [];
for (const r of rooms) for (const e of r.ents) if (e.t === 'anchor') anchors.push({ room: r._ri, x: (r._ox + e.x) * TILE + TILE / 2, y: (r._oy + e.y) * TILE + TILE / 2 });
// moving platforms: their whole path becomes one-way ledges (code 11) for the solver
for (const r of rooms) for (const e of r.ents) if (e.t === 'platform') {
  const pts = [[e.x, e.y], ...(e.path || [])];
  for (let k = 0; k < pts.length; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % pts.length];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let s = 0; s <= n; s++) {
      const px = Math.round(ax + (bx - ax) * s / n), py = Math.round(ay + (by - ay) * s / n);
      for (let w = 0; w < (e.w || 3); w++) { const i = (r._oy + py) * GW + r._ox + px + w; if (grid[i] === 0) grid[i] = 11; }
    }
  }
}
function los(x0, y0, x1, y1) { const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / (TILE / 3)); for (let i = 1; i < n; i++) { const t = i / n; if (fl(Math.floor((x0 + (x1 - x0) * t) / TILE), Math.floor((y0 + (y1 - y0) * t) / TILE)) & F_SOLID) return false; } return true; }
function anchorsInReach(b) {
  const cx = b.x + PW / 2, cy = b.y + 16, ri = roomOf(Math.floor(cx / TILE), Math.floor((b.y + PH / 2) / TILE)), out = [];
  for (let i = 0; i < anchors.length; i++) { const a = anchors[i]; if (a.room === ri && Math.hypot(a.x - cx, a.y - cy) <= PHYS.hookRange && los(cx, cy, a.x, a.y)) out.push(i); }
  return out;
}
function standable(tx, ty) {
  const c = cell(tx, ty), u = cell(tx, ty - 1), f = cell(tx, ty + 1);
  return !solid(c) && !solid(u) && !liquid(c) && c !== 3 && !(c === 5) && (solid(f) || oneway(f));
}

function solve(stage, opts = {}) {
  AB = { leap: stage >= 1, dash: stage >= 2, grip: stage >= 3, hook: stage >= 4, fire: stage >= 5, ...(opts.ab || {}) };
  buildFlags(); buildComps();
  const NN = N + NC + anchors.length;
  const seen = new Uint8Array(NN), touched = new Uint8Array(N), air = new Map();
  // the move graph: stand/liquid/anchor nodes are 0..NN-1, airborne states NN + i
  let EA = new Int32Array(1 << 20), EB = new Int32Array(1 << 20), EN = 0, nextAir = NN;
  const edge = (a, b) => { if (!opts.edges) return; if (EN === EA.length) { const A = new Int32Array(EN * 2), B = new Int32Array(EN * 2); A.set(EA); B.set(EB); EA = A; EB = B; } EA[EN] = a; EB[EN++] = b; };
  const crossings = new Map();
  const bounds = opts.bounds;
  const q = [];
  let cur = -1;
  const reach = (n) => { edge(cur, n); if (!seen[n]) { seen[n] = 1; q.push(n); } };
  const touch = (b) => {
    const x0 = Math.max(0, Math.floor(b.x / TILE)), x1 = Math.min(GW - 1, Math.floor((b.x + PW - 0.01) / TILE)), y0 = Math.max(0, Math.floor(b.y / TILE)), y1 = Math.min(GH - 1, Math.floor((b.y + PH - 0.01) / TILE));
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) touched[ty * GW + tx] = 1;
  };
  const centreRoom = (b) => roomOf(Math.floor((b.x + PW / 2) / TILE), Math.floor((b.y + PH / 2) / TILE));
  const cross = (from, to, b) => { if (from >= 0 && to >= 0 && from !== to) { const k = `${from}>${to}@${Math.floor((b.x + PW / 2) / TILE)},${Math.floor((b.y + PH / 2) / TILE)}`; crossings.set(k, true); } };
  const inBounds = (b) => !bounds || (b.x >= bounds[0] && b.x <= bounds[2] && b.y >= bounds[1] && b.y <= bounds[3]);
  const landNode = (b) => {
    const ty = Math.floor((b.y + PH) / TILE) - 1;
    let tx = Math.floor((b.x + PW / 2) / TILE);
    if (!standable(tx, ty)) { const a = Math.floor(b.x / TILE), c = Math.floor((b.x + PW - 0.01) / TILE); tx = standable(a, ty) ? a : standable(c, ty) ? c : -1; }
    return tx < 0 ? -1 : ty * GW + tx;
  };
  // search the air from a launch state; every outcome becomes a node. Airborne
  // states are deduplicated on a coarse 31-bit key (position, speed, flags).
  const keyOf = (s) => {
    const xq = Math.min(2047, Math.max(0, Math.round(s.x / Q))), yq = Math.min(1023, Math.max(0, Math.round(s.y / Q)));
    const vyq = Math.min(15, Math.max(0, Math.round((s.vy + 1200) / QV))), vxq = Math.min(7, Math.max(0, Math.round((s.vx + 700) / 200)));
    return ((((xq * 1024 + yq) * 16 + vyq) * 8 + vxq) * 8) + (s.air ? 1 : 0) + (s.dashReady ? 2 : 0) + (s.held && s.vy < APEX_V ? 4 : 0);
  };
  const ACTS = [];
  function fly(b0) {
    const from = cur;
    b0.id = nextAir++; edge(from, b0.id);
    const stack = [b0];
    while (stack.length) {
      const s = stack.pop();
      cur = s.id;
      if (s.t > TMAX || !inBounds(s)) continue;
      if (AB.hook && !(s.dashN > 0)) for (const i of anchorsInReach(s)) reach(N + NC + i);
      ACTS.length = 0; ACTS.push(0);
      if (s.held && s.vy < 0 && s.t < 0.25) ACTS.push(1);
      const nearWall = AB.grip && !(s.dashN > 0) && (wallSide(s, 1, 6) || wallSide(s, -1, 6));
      if (!(s.dashN > 0) && (nearWall || (s.air > 0 && AB.leap))) ACTS.push(2);
      if (AB.dash && s.dashReady && !(s.dashN > 0)) ACTS.push(3);
      const acts = ACTS.slice();
      for (let dir = -1; dir <= 1; dir++) for (const act of acts) {
        if (act === 3 && dir === 0) continue;
        const b = clone(s);
        if (act === 1) b.held = false;
        else if (act === 2) {
          if (nearWall) {
            const w = wallSide(b, 1, 6) ? 1 : -1, into = dir === w;
            b.vy = -(into ? WALL_V_IN : WALL_V); b.vx = -w * (into ? WALL_KICK_IN : WALL_KICK); b.lock = into ? WALL_LOCK_IN : WALL_LOCK;
            b.air = AB.leap ? 1 : 0; b.dashReady = true; b.held = true;
          } else { b.air--; b.vy = -DOUBLE_V; b.held = true; }
        } else if (act === 3) { b.dashN = DASH_STEPS; b.dashDir = dir; b.dashReady = false; }
        let r0 = centreRoom(b), out = 0;
        const n = b.dashN > 0 ? DASH_STEPS : SEG;
        for (let f = 0; f < n && !out; f++) {
          out = airStep(b, dir); b.t += STEP; touch(b);
          const r1 = centreRoom(b); if (r1 !== r0) { cross(r0, r1, b); r0 = r1; }
        }
        cur = s.id;
        if (out === 3) continue;
        if (out === 1) { const nd = landNode(b); if (nd >= 0) reach(nd); continue; }
        if (out === 2) { const c = comp[Math.floor((b.y + PH * 0.45) / TILE) * GW + Math.floor((b.x + PW / 2) / TILE)]; if (c >= 0) reach(N + c); continue; }
        const key = keyOf(b), old = air.get(key);
        if (old !== undefined) { edge(s.id, old); continue; }
        b.id = nextAir++; air.set(key, b.id); edge(s.id, b.id);
        stack.push(b);
      }
    }
    cur = from;
  }
  const base = (x, y, o = {}) => new Body(x, y, o.vx ?? 0, o.vy ?? 0, o.held ?? false, AB.leap ? 1 : 0, true, o.dashN ?? 0, o.dashDir ?? 1, 0, o.drop ?? 0, o.swimLock ?? 0, 0);
  const launchJumps = (x, y, v0, vxs, extra = {}) => { for (const vx of vxs) fly(base(x, y, { ...extra, vx, vy: -v0, held: true })); };

  if (opts.sim) { const b = base(...opts.sim.at, opts.sim.o); for (let f = 0; f < 120; f++) { const d = opts.sim.dir(f); const o = airStep(b, d); console.log(f, d, b.x.toFixed(1), b.y.toFixed(1), b.vx.toFixed(0), b.vy.toFixed(0), o); if (o) break; } return; }
  const start = opts.from ?? ((startRoom._oy + startRoom.start.y) * GW + startRoom._ox + startRoom.start.x);
  seen[start] = 1; q.push(start);
  while (q.length) {
    const n = q.shift(); cur = n;
    if (n < N) {
      const tx = n % GW, ty = (n / GW) | 0, y = (ty + 1) * TILE - PH, fc = cell(tx, ty + 1);
      touched[n] = 1; if (ty > 0) touched[n - GW] = 1;
      // walk
      for (const d of [-1, 1]) {
        const nx = tx + d;
        if (solid(cell(nx, ty)) || solid(cell(nx, ty - 1))) continue;
        if (standable(nx, ty)) { const rr = roomOf(nx, ty), r0 = roomOf(tx, ty); if (rr !== r0) crossings.set(`${r0}>${rr}@${nx},${ty}`, true); if (!bounds || inBounds({ x: nx * TILE, y })) reach(ty * GW + nx); }
        else if (cell(nx, ty) !== 3 && !(cell(nx, ty) === 5 && !AB.fire)) fly(base(d > 0 ? nx * TILE + 1 : nx * TILE + TILE - PW - 1, y, { vx: d * RUN }));
      }
      launchJumps(tx * TILE, y, JUMP_V, [-RUN, 0]); launchJumps(tx * TILE + 8, y, JUMP_V, [0]); launchJumps(tx * TILE + 16, y, JUMP_V, [0, RUN]);
      if (oneway(fc)) fly(base(tx * TILE + 8, y + 1, { drop: 0.22 }));
      if (fc === 6 && free(tx * TILE + 8, (ty + 2) * TILE + 1)) fly(base(tx * TILE + 8, (ty + 2) * TILE + 1));
      if (AB.dash) for (const d of [-1, 1]) fly(base(tx * TILE + 8, y, { dashN: DASH_STEPS, dashDir: d }));
      if (AB.hook) for (const i of anchorsInReach(base(tx * TILE + 8, y))) reach(N + NC + i);
      if (AB.hook) for (const i of anchorsInReach(base(tx * TILE + 8, y - PHYS.jumpHeight + 10))) if (free(tx * TILE + 8, y - PHYS.jumpHeight + 10)) reach(N + NC + i);
    } else if (n < N + NC) {
      const list = compCells[n - N];
      for (const j of list) {
        touched[j] = 1;
        const x = j % GW, y = (j / GW) | 0;
        // the pool can lead out of the room under water
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { const ra = roomOf(x, y), rb = roomOf(nx, ny); if (rb >= 0 && rb !== ra && comp[ny * GW + nx] === n - N) crossings.set(`${ra}>${rb}@${nx},${ny}`, true); }
        const above = cell(x, y - 1);
        if (liquid(above) || solid(above)) continue;
        touched[j - GW] = 1;
        const px = x * TILE + 8, py = y * TILE - 8;
        if (bounds && !inBounds({ x: px, y: py })) continue;
        launchJumps(px, py, JUMP_V, [-208, 0, 208], { swimLock: 0.3 });
        if (AB.dash) for (const d of [-1, 1]) fly(base(px, py, { dashN: DASH_STEPS, dashDir: d, swimLock: 0.3 }));
        if (AB.hook) for (const i of anchorsInReach(base(px, py))) reach(N + NC + i);
      }
    } else {
      const a = anchors[n - N - NC];
      for (const dx of [0, -45, 45]) {
        const x = a.x - PW / 2 + dx, y = a.y + HANG_L - PH / 2 - (dx ? 15 : 0);
        if (!free(x, y)) continue;
        const b = base(x, y);
        touch(b);
        for (const i of anchorsInReach(b)) if (i !== n - N - NC) reach(N + NC + i);
        for (const d of [-1, 0, 1]) fly(base(x, y, { vx: d * 260, vy: -JUMP_V * 0.95, held: true }));
        fly(base(x, y, { drop: 0.1 }));
        if (AB.dash) for (const d of [-1, 1]) fly(base(x, y, { dashN: DASH_STEPS, dashDir: d }));
      }
    }
  }
  if (process.env.EFDBG) console.log('air states', air.size);
  return { seen, touched, crossings, NN, NT: nextAir, EA: EA.subarray(0, EN), EB: EB.subarray(0, EN) };
}

// ------------------------------------------------------------- run the stages
const STAGE_NAMES = ['none', ...ABILITIES];
const items = [];
for (const r of rooms) r.ents.forEach((e, i) => {
  if (['ability', 'vessel', 'shards', 'lore', 'boss', 'ending', 'brazier'].includes(e.t)) {
    const cells = [];
    if (e.t === 'boss') { const [x, y, w, h] = e.trigger; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) cells.push((r._oy + yy) * GW + r._ox + xx); }
    else cells.push((r._oy + e.y) * GW + r._ox + e.x);
    items.push({ room: r.id, i, e, cells, stage: -1 });
  }
});
const expect = { 'twin-leap': 0, 'ember-dash': 1, 'root-grip': 2, 'chain-hook': 3, 'fire-form': 4 };
const bossStage = { 'gravel-wyrm': 1, sporemother: 3, 'drowned-abbot': 4, 'cinder-king': 5 };
const exitStage = new Map();
const t0 = Date.now();
const results = [];
const LAST = +(process.env.EFSTAGES ?? 5);
if (process.env.EFSIM) { const r = byId['hollow-02']; solve(0, { sim: { at: [(r._ox + 28) * TILE, (r._oy + 15) * TILE - PH], o: { vx: -RUN, vy: -JUMP_V, held: true }, dir: () => -1 } }); process.exit(0); }
for (let s = 0; s <= LAST; s++) {
  const res = solve(s, { edges: true });
  results.push(res);
  for (const it of items) if (it.stage < 0 && it.cells.some((c) => res.touched[c])) it.stage = s;
  for (const k of res.crossings.keys()) { const [ab, at] = k.split('@'); if (!exitStage.has(k)) exitStage.set(k, s); }
  // soft locks: reachable nodes that can't get back to the start
  const start = (startRoom._oy + startRoom.start.y) * GW + startRoom._ox + startRoom.start.x;
  // reverse edges (CSR) and a backwards search from the start
  const { EA, EB, NT } = res, cnt = new Int32Array(NT + 1);
  for (let i = 0; i < EB.length; i++) cnt[EB[i] + 1]++;
  for (let i = 0; i < NT; i++) cnt[i + 1] += cnt[i];
  const fill = cnt.slice(), src = new Int32Array(EB.length);
  for (let i = 0; i < EB.length; i++) src[fill[EB[i]]++] = EA[i];
  const back = new Uint8Array(NT), q = [start]; back[start] = 1;
  while (q.length) { const n = q.pop(); for (let k = cnt[n]; k < cnt[n + 1]; k++) { const a = src[k]; if (!back[a]) { back[a] = 1; q.push(a); } } }
  const locks = new Map();
  for (let n = 0; n < res.NN; n++) if (res.seen[n] && !back[n]) {
    let x, y; if (n < N) { x = n % GW; y = (n / GW) | 0; } else if (n < N + NC) { const j = compCells[n - N][0]; x = j % GW; y = (j / GW) | 0; } else { const a = anchors[n - N - NC]; x = Math.floor(a.x / TILE); y = Math.floor(a.y / TILE); }
    const r = rooms[roomOf(x, y)]; const k = r.id; if (!locks.has(k)) locks.set(k, []); locks.get(k).push(`${x - r._ox},${y - r._oy}`);
  }
  results[s].locks = locks;
  if (process.env.EFTRACE && s === +(process.env.EFTRACE_STAGE || 0)) {
    const [rid, x, y] = process.env.EFTRACE.split(','), r = byId[rid], node = (r._oy + +y) * GW + r._ox + +x;
    const show = (n) => { if (n >= N) return 'n' + n; const rr = rooms[roomOf(n % GW, (n / GW) | 0)]; return `${rr.id}:${n % GW - rr._ox},${((n / GW) | 0) - rr._oy}`; };
    console.log('trace', show(node), 'seen', res.seen[node], 'back', back[node]);
  }
  if (process.env.EFROOM && s === +(process.env.EFTRACE_STAGE || 0)) {   // debug: '*' = reached standing/swimming node
    const r = byId[process.env.EFROOM];
    for (let y = 0; y < r.tiles.length; y++) console.log(String(y).padStart(2), [...r.tiles[y]].map((c, x) => res.seen[(r._oy + y) * GW + r._ox + x] ? '*' : c).join(''));
  }
  let nodes = 0; for (let n = 0; n < res.NN; n++) nodes += res.seen[n];
  const roomsSeen = new Set(); for (let n = 0; n < N; n++) if (res.touched[n] && roomAt[n] >= 0) roomsSeen.add(roomAt[n]);
  results[s].rooms = roomsSeen;
  if (!QUIET) console.log(`stage ${s} (${STAGE_NAMES[s]}): ${nodes} nodes, ${roomsSeen.size} rooms, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const [k, l] of locks) (s === 5 ? err : warn)(`stage ${s}: soft lock in ${k} at ${l.slice(0, 6).join(' ')}${l.length > 6 ? ` (+${l.length - 6})` : ''}`);
}
for (const it of items) {
  const e = it.e, where = `${it.room} ${e.t}${e.id ? ' ' + e.id : ''} @${e.x},${e.y}`;
  if (it.stage < 0) { err(`unreachable: ${where}`); continue; }
  if (e.t === 'ability' && it.stage > expect[e.id]) err(`${where}: first reached at stage ${it.stage}, needed by stage ${expect[e.id]}`);
  if (e.t === 'ability' && it.stage < expect[e.id]) warn(`${where}: reachable early (stage ${it.stage})`);
  if (e.t === 'boss' && it.stage > bossStage[e.id]) err(`${where}: first reached at stage ${it.stage}, needed by stage ${bossStage[e.id]}`);
  if (e.t === 'boss' && it.stage < bossStage[e.id]) warn(`${where}: boss reachable early (stage ${it.stage})`);
}
// gates: from -> to only with the ability
for (const r of rooms) for (const e of r.ents) if (e.t === 'gate') {
  const k = ABILITIES.indexOf(e.requires);
  if (!e.from || !e.to || k < 0) { err(`${r.id} gate ${e.id}: needs from, to and requires`); continue; }
  const from = (r._oy + e.from[1]) * GW + r._ox + e.from[0], to = (r._oy + e.to[1]) * GW + r._ox + e.to[0];
  const bx = [(r._ox - 4) * TILE, (r._oy - 4) * TILE, (r._ox + ROOM_W * r.w + 4) * TILE, (r._oy + ROOM_H * r.h + 4) * TILE];
  AB = { leap: true, dash: true, grip: true, hook: true, fire: true };
  if (!standable(from % GW, (from / GW) | 0)) err(`${r.id} gate ${e.id}: from ${e.from} is not standable`);
  if (!standable(to % GW, (to / GW) | 0)) err(`${r.id} gate ${e.id}: to ${e.to} is not standable`);
  // the test suite holds every ability but the gate's own for the 'without' run (its hook
  // script never dashes, so a hook gate only has to beat Twin Leap and Root Grip)
  const all = { leap: true, dash: true, grip: true, hook: true, fire: true }, flag = { 'twin-leap': 'leap', 'ember-dash': 'dash', 'root-grip': 'grip', 'chain-hook': 'hook', 'fire-form': 'fire' }[e.requires];
  const yes = solve(5, { from, bounds: bx, ab: all }), no = solve(5, { from, bounds: bx, ab: { ...all, [flag]: false, ...(e.kind === 'hook' ? { dash: false } : {}) } });
  if (!yes.seen[to]) err(`${r.id} gate ${e.id} (${e.kind}): cannot get from ${e.from} to ${e.to} with ${e.requires}`);
  if (no.seen[to]) err(`${r.id} gate ${e.id} (${e.kind}): ${e.from} -> ${e.to} works without ${e.requires}`);
}

// ------------------------------------------------------------- exit requirements
const exitReqs = {};
for (const r of rooms) {
  const list = [];
  for (const o of r._open) {
    if (!o.to) continue;
    const ri = r._ri, rj = byId[o.to]._ri;
    let best = 9;
    for (const [k, s] of exitStage) {
      const [ab, at] = k.split('@'), [a, b] = ab.split('>').map(Number);
      if (a !== ri || b !== rj) continue;
      const [x, y] = at.split(',').map(Number), lx = x - r._ox, ly = y - r._oy;
      const along = o.side === 'l' || o.side === 'r' ? ly : lx;
      if (along >= o.at - 2 && along < o.at + o.len + 2) best = Math.min(best, s);
    }
    o.stage = best;
    if (best === 9) warn(`${r.id}: exit ${o.side}@${o.at} to ${o.to} is never used`);
    list.push({ side: o.side, at: o.at, len: o.len, to: o.to, requires: best === 9 ? null : ABILITIES.slice(0, best) });
  }
  exitReqs[r.id] = list;
}
if (WRITE) {
  const out = join(src, 'world/rooms/exits.js');
  writeFileSync(out, `// Generated by tools/validate.mjs --write: for each room, its border openings and the\n// abilities the solver first needed to pass out through them from this side\n// (null: never). world.js worldDump reads this for exits[].requires.\nexport const EXIT_REQS = ${JSON.stringify(exitReqs)};\n`);
  console.log('wrote', out);
}

// ------------------------------------------------------------- summary
const count = (f) => rooms.filter(f).length;
const ents = rooms.flatMap((r) => r.ents.map((e) => ({ ...e, room: r.id, biome: r.biome })));
const byBiome = {}; for (const r of rooms) byBiome[r.biome] = (byBiome[r.biome] || 0) + 1;
if (!QUIET) {
  console.log(`rooms ${rooms.length} ${JSON.stringify(byBiome)}, screens ${rooms.reduce((a, r) => a + r.w * r.h, 0)}, world ${gx1 - gx0}x${gy1 - gy0} screens`);
  console.log(`secret rooms ${count((r) => r.secret)}, braziers ${ents.filter((e) => e.t === 'brazier').length}, vessels ${ents.filter((e) => e.t === 'vessel').length}, shard caches ${ents.filter((e) => e.t === 'shards').length}, lore ${ents.filter((e) => e.t === 'lore').length}, anchors ${anchors.length}, enemies ${ents.filter((e) => e.t === 'enemy').length}, gates ${ents.filter((e) => e.t === 'gate').length}, platforms ${ents.filter((e) => e.t === 'platform').length}`);
  for (const it of items) if (it.e.t !== 'brazier') console.log(`  ${it.e.t.padEnd(8)} ${(it.e.id || it.e.n || '').toString().padEnd(14)} ${it.room.padEnd(14)} stage ${it.stage} (${STAGE_NAMES[it.stage] ?? '-'})`);
  for (let s = 0; s <= 5; s++) console.log(`  stage ${s}: rooms ${[...results[s].rooms].length}`);
}

// ------------------------------------------------------------- picture
if (PNG) {
  const S = 3, w = GW * S, h = GH * S, px = new Uint8Array(w * h * 3);
  const BIO = { hollow: [255, 163, 74], thicket: [224, 90, 255], cloister: [58, 214, 208], core: [255, 74, 42] };
  const reach5 = results[5].touched;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x, c = grid[i], ri = roomAt[i];
    let col;
    if (ri < 0) col = [8, 6, 10];
    else {
      const b = BIO[rooms[ri].biome];
      col = c === 1 ? b.map((v) => v * 0.42 | 0) : c === 0 || c === 9 || c === 10 ? (reach5[i] ? [34, 28, 38] : [20, 16, 22]) : c === 2 || c === 11 ? [200, 190, 170] : c === 3 ? [240, 240, 255] : c === 4 ? [40, 110, 200] : c === 5 ? [255, 90, 0] : c === 6 ? [150, 120, 90] : c === 7 ? [255, 255, 120] : c === 8 ? [120, 255, 60] : [100, 100, 100];
      if (c === 9) col = [120, 70, 170];
      if (c === 10) col = [255, 40, 120];
      if (rooms[ri].secret && c === 0) col = [44, 30, 60];
    }
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) { const o = ((y * S + yy) * w + x * S + xx) * 3; px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; }
  }
  const dot = (tx, ty, col, r = 2) => { for (let yy = -r; yy <= r + 1; yy++) for (let xx = -r; xx <= r + 1; xx++) { const X = tx * S + 1 + xx, Y = ty * S + 1 + yy; if (X >= 0 && Y >= 0 && X < w && Y < h) { const o = (Y * w + X) * 3; px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; } } };
  const ECOL = { brazier: [255, 200, 60], vessel: [255, 60, 60], shards: [255, 230, 150], lore: [150, 200, 255], ability: [80, 255, 255], boss: [255, 0, 0], ending: [255, 255, 255], anchor: [200, 200, 200], enemy: [180, 60, 60] };
  for (const r of rooms) for (const e of r.ents) if (ECOL[e.t]) dot(r._ox + e.x, r._oy + e.y, ECOL[e.t], e.t === 'enemy' ? 1 : 2);
  if (startRoom) dot(startRoom._ox + startRoom.start.x, startRoom._oy + startRoom.start.y, [255, 255, 255], 3);
  // screen grid lines
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x % (ROOM_W * S) === 0 || y % (ROOM_H * S) === 0)) { const o = (y * w + x) * 3; px[o] = Math.max(px[o], 60); px[o + 1] = Math.max(px[o + 1], 60); px[o + 2] = Math.max(px[o + 2], 70); }
  writeFileSync(PNG, encodePng(w, h, px));
  if (!QUIET) console.log('map picture:', PNG, `${w}x${h}`);
}
function encodePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ------------------------------------------------------------- verdict
for (const w of warns) console.log('warn:', w);
for (const e of errors) console.log('ERROR:', e);
console.log(errors.length ? `FAILED: ${errors.length} errors, ${warns.length} warnings` : `OK (${warns.length} warnings)`);
process.exit(errors.length ? 1 : 0);
