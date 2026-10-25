// STUB (ui agent replaces).
import { W, H } from '../config.js';
export function drawScreen(g, G) {
  if (G.scene !== 'title') return;
  g.fillStyle = '#07050a'; g.fillRect(0, 0, W, H); g.fillStyle = '#ffb347'; g.font = 'bold 64px Georgia'; g.textAlign = 'center'; g.fillText('EMBERFALL', W / 2, H / 2);
}
export function screenButtons(G) { return G.scene === 'title' ? [{ id: 'btn-new', action: 'new', rect: [490, 420, 300, 70], label: 'New game' }] : []; }
