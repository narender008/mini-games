// STUB (world agent replaces): particles and painted effects.
// spawn(G, type, x, y, opts) types: smoke fire splash sparks debris flash explosion number bolt spray embers ring
export function spawn(G, type, x, y, opts = {}) {}
export function updateFx(G, dt) {}
// layer: 'under' (on the water, under ships) | 'over' (over ships) | 'text' (damage numbers, top)
export function drawFx(g, G, layer) {}

// Painters other modules use (ports of the concept renderer). t = time in seconds for animation.
export function paintFire(g, x, y, w, h, seed, a = 1, t = 0) {}
export function paintSmoke(g, x, y, n, size, col, seed, rise = 1, drift = 0.6, a = 0.6) {}
export function paintSparks(g, x, y, n, s, seed, col = '#ffd36a') {}
export function paintBolt(g, x0, y0, x1, y1, seed, col = '#bfe8ff', w = 1, branches = 3) { return []; }
export function paintSplash(g, x, y, s, seed, col = '#ffffff') {}
export function paintFlash(g, x, y, ang, s, col = '#ffcf5a') {}
export function paintDebris(g, x, y, n, s, seed) {}
