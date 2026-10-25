// STUB (bosses agent replaces): fortress, Mistcoil Serpent, Drowned Leviathan.
export function startBoss(G, kind) { G.enc = { type: kind, done: false, wave: 1, waves: 1, t: 0 }; }
export function updateBoss(G, dt) { G.enc.t += dt; if (G.enc.t > 3) G.enc.done = true; }
