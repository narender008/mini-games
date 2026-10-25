// Emberfall map: the world drawn as rooms on the screen grid (G.world.rooms,
// gx gy w h in screens), for the HUD minimap and the full map screen.
// mapModel(world) works out once per world where each room's openings are
// (from its border tiles) and so which rooms join; drawRooms paints visited
// rooms filled in their biome colour, unvisited neighbours as faint outlines,
// links through the openings, and icons (braziers, bosses, pickups, secrets).
import { ROOM_W, ROOM_H, TILE, BIOMES, ABILITY_NAMES } from '../config.js';
import { rr, glow, additive, flame, skull, vesselIcon, crystalIcon, abilityGlyph, ABIL, TAU, SERIF, SANS, rgba, clock } from './kit.js';

const BLOCK = new Set(['#', 'C', 'X', 'B', 'L', '^']); // a border tile you cannot walk out through
const models = new WeakMap();

export function mapModel(world) {
  if (!world?.rooms) return null;
  let M = models.get(world.rooms);
  if (M) return M;
  const rooms = [], byId = {}, cell = new Map();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [id, def] of Object.entries(world.rooms)) {
    const r = { id, def, gx: def.gx | 0, gy: def.gy | 0, w: def.w || 1, h: def.h || 1, biome: def.biome, secret: !!def.secret, name: def.name || id, doors: [], icons: [], links: new Set() };
    rooms.push(r); byId[id] = r;
    for (let cy = 0; cy < r.h; cy++) for (let cx = 0; cx < r.w; cx++) cell.set((r.gx + cx) + ',' + (r.gy + cy), r);
    x0 = Math.min(x0, r.gx); y0 = Math.min(y0, r.gy); x1 = Math.max(x1, r.gx + r.w); y1 = Math.max(y1, r.gy + r.h);
    // icons in fractional screens from the room's top-left
    (def.ents || []).forEach((e, i) => {
      const fx = (e.x + 0.5) / ROOM_W, fy = (e.y + 0.5) / ROOM_H;
      if (e.t === 'brazier') r.icons.push({ kind: 'brazier', fx, fy });
      else if (e.t === 'boss') r.icons.push({ kind: 'boss', id: e.id, fx, fy });
      else if (e.t === 'ability' || e.t === 'vessel' || e.t === 'shards') r.icons.push({ kind: e.t, id: e.id, after: e.after, key: id + '#' + i, fx, fy });
      else if (e.t === 'ending') r.icons.push({ kind: 'ending', fx, fy });
    });
  }
  // openings: runs of passable tiles on each border, joined to the room on the other side
  for (const r of rooms) {
    const t = r.def.tiles || [], tw = ROOM_W * r.w, th = ROOM_H * r.h;
    const at = (x, y) => (t[y] && t[y][x]) || '#';
    const sides = [
      ['l', th, (i) => at(0, i), (i) => [r.gx - 0.01, r.gy + i / ROOM_H], (i) => [0, (i + 0.5) / ROOM_H]],
      ['r', th, (i) => at(tw - 1, i), (i) => [r.gx + r.w + 0.01, r.gy + i / ROOM_H], (i) => [r.w, (i + 0.5) / ROOM_H]],
      ['u', tw, (i) => at(i, 0), (i) => [r.gx + i / ROOM_W, r.gy - 0.01], (i) => [(i + 0.5) / ROOM_W, 0]],
      ['d', tw, (i) => at(i, th - 1), (i) => [r.gx + i / ROOM_W, r.gy + r.h + 0.01], (i) => [(i + 0.5) / ROOM_W, r.h]],
    ];
    for (const [side, n, tile, out, local] of sides) {
      let start = -1;
      for (let i = 0; i <= n; i++) {
        const open = i < n && !BLOCK.has(tile(i));
        if (open && start < 0) start = i;
        if (!open && start >= 0) {
          const mid = (start + i - 1) / 2, [ox, oy] = out(mid);
          const o = cell.get(Math.floor(ox) + ',' + Math.floor(oy));
          if (o && o !== r) {
            const [lx, ly] = local(mid);
            r.doors.push({ side, to: o.id, fx: lx, fy: ly, secret: tile(Math.round(mid)) === 'S' });
            r.links.add(o.id); o.links.add(r.id);
          }
          start = -1;
        }
      }
    }
  }
  M = { rooms, byId, x0: isFinite(x0) ? x0 : 0, y0: isFinite(y0) ? y0 : 0, x1: isFinite(x1) ? x1 : 1, y1: isFinite(y1) ? y1 : 1 };
  models.set(world.rooms, M);
  return M;
}

// The player's position in world screens (fractional).
export function playerSpot(G) {
  const r = G.room, p = G.player;
  if (!r || !p) return null;
  return { x: r.gx + (p.x + p.w / 2) / (ROOM_W * TILE), y: r.gy + (p.y + p.h / 2) / (ROOM_H * TILE), room: r.id };
}

// What the player knows: visited rooms, and unvisited neighbours (secret rooms
// stay hidden until found).
export function known(G, M) {
  const v = G.prog.visited, seen = new Set();
  for (const r of M.rooms) if (v[r.id]) for (const id of r.links) { const o = M.byId[id]; if (!v[id] && !o.secret) seen.add(id); }
  return seen;
}

// Paint the rooms. ox, oy: screen px of world grid (0, 0); cw, ch: px per screen.
// opts: { labels (icons), gap, here: spot | null, t (seconds, blink), lineW }
export function drawRooms(g, G, M, ox, oy, cw, ch, { labels = false, gap = 3, here = null, t = 0 } = {}) {
  const v = G.prog.visited, outline = known(G, M);
  const X = (gx) => ox + gx * cw, Y = (gy) => oy + gy * ch;
  g.save();
  // links: room centre -> opening -> neighbour centre
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const r of M.rooms) {
    if (!v[r.id]) continue;
    for (const d of r.doors) {
      const o = M.byId[d.to];
      if (!v[o.id] && !outline.has(o.id)) continue;
      if (v[o.id] && o.id < r.id) continue; // draw each visited pair once
      const ax = X(r.gx + r.w / 2), ay = Y(r.gy + r.h / 2), dx = X(r.gx + d.fx), dy = Y(r.gy + d.fy);
      g.strokeStyle = v[o.id] ? 'rgba(255,230,200,0.4)' : 'rgba(255,230,200,0.25)';
      g.lineWidth = Math.max(1.5, cw * 0.06);
      g.setLineDash(v[o.id] ? [] : [3, 4]);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(dx, dy);
      if (v[o.id]) g.lineTo(X(o.gx + o.w / 2), Y(o.gy + o.h / 2));
      g.stroke();
    }
  }
  g.setLineDash([]);
  const rad = Math.min(5, cw * 0.18);
  for (const r of M.rooms) {
    const seen = !!v[r.id];
    if (!seen && !outline.has(r.id)) continue;
    const c = BIOMES[r.biome]?.color || '#c0b0d0';
    const x = X(r.gx) + gap / 2, y = Y(r.gy) + gap / 2, w = r.w * cw - gap, h = r.h * ch - gap;
    rr(g, x, y, w, h, rad);
    if (seen) { g.fillStyle = rgba(c, r.id === here?.room ? 0.45 : 0.32); g.fill(); g.strokeStyle = rgba(c, 0.95); g.lineWidth = 1.6; g.stroke(); }
    else { g.fillStyle = 'rgba(60,50,70,0.22)'; g.fill(); g.setLineDash([3, 3]); g.strokeStyle = 'rgba(170,160,190,0.4)'; g.lineWidth = 1; g.stroke(); g.setLineDash([]); }
  }
  if (labels) for (const r of M.rooms) if (v[r.id]) drawIcons(g, G, r, X(r.gx), Y(r.gy), cw, ch, t);
  g.restore();
  if (here) {
    const px = X(here.x), py = Y(here.y), blink = 0.55 + 0.45 * Math.sin(t * 6);
    additive(g, () => glow(g, px, py, Math.max(18, cw * 0.9), '#ffe9a8', 0.75 * blink));
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(px, py, Math.max(3, Math.min(7, cw * 0.1)), 0, TAU); g.fill();
  }
}

function drawIcons(g, G, r, x, y, cw, ch, t) {
  const s = Math.max(6, Math.min(cw, ch) * 0.2);
  for (const ic of r.icons) {
    const cx = x + ic.fx * cw, cy = y + ic.fy * ch;
    if (ic.kind === 'brazier') { additive(g, () => { glow(g, cx, cy, s * 3, '#ffd36a', 0.45); flame(g, cx, cy + s * 0.8, s * 0.85, '#ffb347', 1); flame(g, cx, cy + s * 0.8, s * 0.45, '#fff0c0', 1); }); }
    else if (ic.kind === 'boss') skull(g, cx, cy, s * 1.15, '#ff5a4a', !!G.prog.bosses[ic.id]);
    else if (ic.kind === 'ending') additive(g, () => { glow(g, cx, cy, s * 3, '#fff2c0', 0.6 + 0.2 * Math.sin(t * 2)); });
    else if (ic.kind === 'vessel') vesselIcon(g, cx, cy, s, !!G.prog.taken[ic.key]);
    else if (ic.kind === 'shards') {
      if (G.prog.taken[ic.key]) { g.fillStyle = 'rgba(150,220,240,0.3)'; g.beginPath(); g.arc(cx, cy, s * 0.25, 0, TAU); g.fill(); }
      else crystalIcon(g, cx, cy, s * 0.6);
    } else if (ic.kind === 'ability') {
      if (ic.after && !G.prog.bosses[ic.after]) continue;
      const a = ABIL[ic.id]; if (!a) continue;
      const got = !!G.prog.taken[ic.key] || !!G.prog.abilities[ic.id];
      if (!got) additive(g, () => glow(g, cx, cy, s * 3, a.c, 0.4 + 0.2 * Math.sin(t * 3)));
      abilityGlyph(g, a.glyph, cx, cy, s * 1.6, a.c, !got);
    }
  }
  if (r.secret) { g.fillStyle = '#c9a8ff'; g.font = `bold ${Math.round(Math.min(cw * r.w, ch * r.h) * 0.4)}px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.globalAlpha = 0.85; g.fillText('?', x + r.w * cw / 2, y + r.h * ch / 2 + 1); g.globalAlpha = 1; g.textBaseline = 'alphabetic'; }
}

// The HUD minimap: a window on the map at a fixed scale, centred on the player.
// The rooms layer is baked to an offscreen canvas until progress changes.
const mini = { key: '', canvas: null, cw: 24, ch: 14 };
export function drawMiniMap(g, G, x, y, w, h) {
  const M = mapModel(G.world); if (!M) return;
  const here = playerSpot(G); if (!here) return;
  const k = G.renderK || 1, { cw, ch } = mini, pad = 2;
  const key = [M.rooms.length, Object.keys(G.prog.visited).length, Object.keys(G.prog.taken).length, Object.keys(G.prog.bosses).length, k].join('|');
  if (key !== mini.key) {
    mini.key = key;
    const cvs = mini.canvas || document.createElement('canvas');
    cvs.width = Math.ceil(((M.x1 - M.x0) * cw + pad * 2) * k); cvs.height = Math.ceil(((M.y1 - M.y0) * ch + pad * 2) * k);
    const c = cvs.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0);
    drawRooms(c, G, M, pad - M.x0 * cw, pad - M.y0 * ch, cw, ch, { gap: 2 });
    mini.canvas = cvs;
  }
  g.save();
  g.fillStyle = 'rgba(8,6,14,0.72)'; rr(g, x, y, w, h, 10); g.fill();
  g.strokeStyle = 'rgba(255,200,150,0.4)'; g.lineWidth = 1.2; g.stroke();
  rr(g, x + 2, y + 2, w - 4, h - 4, 8); g.clip();
  const ox = x + w / 2 - (here.x - M.x0) * cw - pad, oy = y + h / 2 - (here.y - M.y0) * ch - pad;
  g.drawImage(mini.canvas, ox, oy, mini.canvas.width / k, mini.canvas.height / k);
  const px = x + w / 2, py = y + h / 2, blink = 0.6 + 0.4 * Math.sin(clock() * 5);
  additive(g, () => glow(g, px, py, 22, '#ffe9a8', 0.8 * blink));
  g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py, 3, 0, TAU); g.fill();
  g.restore();
}

// The full map inside box [x, y, w, h]; returns the scale used.
export function drawFullMap(g, G, bx, by, bw, bh, t) {
  const M = mapModel(G.world); if (!M) return;
  const cols = M.x1 - M.x0, rows = M.y1 - M.y0, aspect = 1.4;
  const cw = Math.min(bw / cols, (bh / rows) * aspect, 120), ch = cw / aspect;
  const ox = bx + (bw - cols * cw) / 2 - M.x0 * cw, oy = by + (bh - rows * ch) / 2 - M.y0 * ch;
  // biome haze behind the visited rooms
  const v = G.prog.visited;
  additive(g, () => {
    for (const [id, b] of Object.entries(BIOMES)) {
      const rs = M.rooms.filter((r) => r.biome === id && v[r.id]); if (!rs.length) continue;
      const cx = rs.reduce((s, r) => s + r.gx + r.w / 2, 0) / rs.length, cy = rs.reduce((s, r) => s + r.gy + r.h / 2, 0) / rs.length;
      glow(g, ox + cx * cw, oy + cy * ch, Math.max(cw, ch) * 3.5, b.color, 0.1);
    }
  });
  const here = playerSpot(G);
  drawRooms(g, G, M, ox, oy, cw, ch, { labels: true, gap: Math.max(3, Math.min(8, cw * 0.1)), here, t });
  if (here) {
    g.save(); g.font = `bold 15px ${SANS}`; g.textAlign = 'center'; g.fillStyle = '#ffe9b8'; g.shadowColor = '#000'; g.shadowBlur = 6;
    g.fillText('YOU', ox + here.x * cw, oy + here.y * ch - Math.max(14, cw * 0.18)); g.restore();
  }
  return { cw, ch, ox, oy };
}
export { ABILITY_NAMES };
