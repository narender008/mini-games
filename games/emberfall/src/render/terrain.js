// STUB (render agent replaces).
import { TILE, W, H } from '../config.js';
export function drawBackdrop(g) { g.fillStyle = '#120a10'; g.fillRect(0, 0, W, H); }
export function drawTerrain(g, G, layer) {
  if (layer !== 'back') return; const r = G.room; g.fillStyle = '#3a2a24';
  for (let y = 0; y < r.th; y++) for (let x = 0; x < r.tw; x++) if (r.tiles[y * r.tw + x] === 1) g.fillRect(x * TILE, y * TILE, TILE, TILE);
}
