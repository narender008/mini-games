// Tile collision for anything that moves through a room: the wanderer, enemies
// and loose objects. Bodies are axis-aligned boxes { x, y, w, h, vx, vy } in
// room px (x, y top-left). Callers apply their own gravity and speeds; these
// helpers only move and collide.
import { TILE } from './config.js';
import { T, isSolidCode } from './world/tiles.js';

// Tile code at tile coords; outside the room counts as solid rock, except
// where the border is open (an exit), which reads as empty.
export function tileAt(G, tx, ty) {
  const r = G.room;
  if (tx < 0 || ty < 0 || tx >= r.tw || ty >= r.th) {
    // beyond the border: copy the border tile, so openings stay open
    const cx = tx < 0 ? 0 : tx >= r.tw ? r.tw - 1 : tx;
    const cy = ty < 0 ? 0 : ty >= r.th ? r.th - 1 : ty;
    return r.tiles[cy * r.tw + cx];
  }
  return r.tiles[ty * r.tw + tx];
}
export const tileAtPx = (G, x, y) => tileAt(G, Math.floor(x / TILE), Math.floor(y / TILE));
export const solidAt = (G, x, y) => isSolidCode(tileAtPx(G, x, y));

// Does the box overlap any tile matching test(code)? Returns the first { tx, ty, code } or null.
export function boxTouches(G, x, y, w, h, test) {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const c = tileAt(G, tx, ty);
    if (test(c)) return { tx, ty, code: c };
  }
  return null;
}

// Moving platforms are room entities { t: 'platform', x, y, w, h, dx, dy } (dx, dy: px moved this step).
function platforms(G) { return G.room.ents ? G.room.ents.filter((e) => e.t === 'platform') : []; }

// Move a body by its velocity for dt, sliding along tiles.
// opts: { oneWay: true (land on '=' ledges unless body.drop > 0), platforms: true }
// Sets body.onGround, body.hitWall (-1 left, 1 right, 0), body.hitCeil, body.ground (tile code or 'platform'),
// body.platform (the platform stood on, or null).
export function moveBody(G, b, dt, opts = {}) {
  const oneWay = opts.oneWay !== false;
  const usePlat = opts.platforms !== false;
  b.hitWall = 0; b.hitCeil = false;
  const wasOnGround = b.onGround;
  b.onGround = false; b.ground = null;

  // ride a platform: move with it first
  if (usePlat && b.platform) { b.x += b.platform.dx || 0; b.y += b.platform.dy || 0; }
  b.platform = null;

  // horizontal
  let dx = b.vx * dt;
  const stepX = Math.sign(dx) * Math.min(Math.abs(dx), TILE / 2);
  while (dx !== 0) {
    const m = Math.abs(dx) < Math.abs(stepX) ? dx : stepX;
    const nx = b.x + m;
    const edge = m > 0 ? nx + b.w : nx;
    const hit = columnSolid(G, edge, b.y, b.h);
    if (hit) {
      b.x = m > 0 ? Math.floor((nx + b.w) / TILE) * TILE - b.w : (Math.floor(nx / TILE) + 1) * TILE;
      b.hitWall = Math.sign(m); b.vx = 0; break;
    }
    b.x = nx; dx -= m;
  }
  // vertical
  let dy = b.vy * dt;
  const stepY = Math.sign(dy) * Math.min(Math.abs(dy), TILE / 2);
  while (dy !== 0) {
    const m = Math.abs(dy) < Math.abs(stepY) ? dy : stepY;
    const ny = b.y + m;
    if (m > 0) {
      const foot = ny + b.h;
      const prevFoot = b.y + b.h;
      const ty = Math.floor(foot / TILE);
      let land = rowSolid(G, b.x, b.w, foot);
      if (!land && oneWay && !(b.drop > 0) && Math.floor((prevFoot - 0.01) / TILE) < ty && rowCode(G, b.x, b.w, foot, T.ONEWAY)) land = 'oneway';
      if (land) { b.y = ty * TILE - b.h; b.vy = 0; b.onGround = true; b.ground = land === 'oneway' ? T.ONEWAY : land; break; }
    } else {
      if (rowSolid(G, b.x, b.w, ny)) { b.y = (Math.floor(ny / TILE) + 1) * TILE; b.vy = 0; b.hitCeil = true; break; }
    }
    b.y = ny; dy -= m;
  }
  // platforms (one-way from above)
  if (usePlat && b.vy >= 0) {
    for (const p of platforms(G)) {
      const foot = b.y + b.h;
      if (b.x + b.w > p.x && b.x < p.x + p.w && foot >= p.y - 1 && foot <= p.y + Math.max(12, b.vy * dt + (p.dy > 0 ? p.dy : 0) + 2) && !(b.drop > 0)) {
        b.y = p.y - b.h; b.vy = 0; b.onGround = true; b.ground = 'platform'; b.platform = p;
      }
    }
  }
  // stay glued to the floor when walking down off nothing: no (coyote time is the player's job)
  b.landed = b.onGround && !wasOnGround;
  return b;
}

function columnSolid(G, x, y, h) {
  const tx = Math.floor(x / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) { const c = tileAt(G, tx, ty); if (isSolidCode(c)) return c; }
  return 0;
}
function rowSolid(G, x, w, y) {
  const ty = Math.floor(y / TILE);
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
  for (let tx = x0; tx <= x1; tx++) { const c = tileAt(G, tx, ty); if (isSolidCode(c)) return c; }
  return 0;
}
function rowCode(G, x, w, y, code) {
  const ty = Math.floor(y / TILE);
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
  for (let tx = x0; tx <= x1; tx++) if (tileAt(G, tx, ty) === code) return true;
  return false;
}

// Is there a straight line of sight between two points (no solid tiles)?
export function lineOfSight(G, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / (TILE / 3));
  for (let i = 1; i < n; i++) { const t = i / n; if (solidAt(G, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false; }
  return true;
}
