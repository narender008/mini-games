// STUB (ships agent replaces): pirate fleets.
export function startFleet(G) { G.enc = { type: 'fleet', done: false, wave: 1, waves: 1, t: 0 }; }
export function updateFleet(G, dt) { G.enc.t += dt; if (G.enc.t > 3) G.enc.done = true; }
