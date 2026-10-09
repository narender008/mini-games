// Damage flags passed to Run.hurt: where a hit came from and what it may do.
export const CRIT = 1; // may crit
export const PROC = 2; // may trigger on-hit effects (explode, chain, freeze, ignite)
export const BLAST = 4; // came from an explosion
export const SHOCK = 8; // lightning
export const ICE = 16;
export const QUIET = 32; // no number, sound or big spurt (flame ticks, burning)
export const BURN = 64; // fire: the kill burns the body up
