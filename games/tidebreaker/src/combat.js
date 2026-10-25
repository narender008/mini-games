// STUB (ships agent replaces): shots, damage and the player's guns.
export function playerControl(G, dt) {}
export function updateShots(G, dt) {}
export function drawShots(g, G) {}
export function damage(G, target, amount, info = {}) {}
export function enemyFire(G, from, tx, ty, opts = {}) {}
// A cannonball with its glowing trail (also used by card art).
export function paintBall(g, x, y, vx, vy, r = 5, trail = '#ffe6a0', hot) {}
