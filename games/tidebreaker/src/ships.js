// STUB (ships agent replaces): ship entities and drawing.
import { LANE_Y } from './config.js';
export function makePlayer(G) {
  return { kind: 'player', side: 'player', x: 300, y: LANE_Y, cx: 300, cy: LANE_Y - 60, s: 120, dir: 1, ang: 0, hp: 240, maxHp: 240, alive: true, gone: false, layer: 'lane',
    cd: { broadside: 0, chain: 0, fire: 0, lightning: 0, kraken: 0 }, burn: 0, slow: 0,
    hitTest(x, y, r) { return Math.abs(x - this.x) < this.s + r && y > this.y - this.s * 1.9 && y < this.y + 20 ? 1 : 0; },
    update() {}, draw(g) { g.fillStyle = '#7a3f1d'; g.fillRect(this.x - this.s, this.y - 40, this.s * 2, 40); } };
}
export function updatePlayer(G, dt) {}
export function drawShip(g, G, ship) {}
// Ship styles (colours, masts) and the painter: origin at the waterline, facing +x when dir = 1, s = half the hull length.
export const STYLES = { player: {}, pirate: {}, sloop: {} };
export function paintShip(g, x, y, ang, s, dir, style, opt = {}, t = 0) {}
// Enemy ship entity (see the entity contract in game.js). kind: sloop brig galleon fireship gunboat ...
export function makeShip(G, kind, x, opts = {}) { return null; }
