// STUB (player agent replaces): the wanderer.
import { PHYS } from './config.js';
export function makePlayer(G) {
  return { x: 0, y: 0, w: PHYS.playerW, h: PHYS.playerH, vx: 0, vy: 0, onGround: false, facing: 1, hp: 5, maxHp: 5, form: 'normal', energy: 1, state: 'idle', inv: 0, attack: null };
}
export function updatePlayer(G, dt) {
  const p = G.player, i = G.input;
  p.vx = (i.right - i.left) * PHYS.runSpeed;
  p.x += p.vx * dt;
}
export function hurtPlayer(G, n) { if (!G.god) G.player.hp -= n; }
