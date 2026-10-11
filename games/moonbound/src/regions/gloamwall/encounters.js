// Who fights in the Gloamwall's chambers. A chamber's foes come in waves
// (the next rises when few of the last are left), drawn from a threat budget
// that grows with depth. `pool` weights which foes appear from which chamber
// on; `sets` are hand-made groupings mixed in so fights have shape (a shield
// wall with archers behind, a skitter swarm, a lantern procession).
export const ENCOUNTERS = {
  // threat budget per wave by chamber depth (1-based) and waves per chamber
  budget: (depth) => 3.2 + depth * 0.85,
  waves: (depth) => (depth <= 1 ? 2 : depth <= 5 ? 2 + (depth >= 4 ? 1 : 0) : 3),
  eliteChance: (depth) => (depth < 3 ? 0 : Math.min(0.32, 0.08 + (depth - 3) * 0.05)),
  elites: ['swift', 'warded', 'vengeful', 'hulking'],
  pool: [
    { kind: 'thrall', from: 1, weight: 5 },
    { kind: 'skitter', from: 1, weight: 3, group: 3 },
    { kind: 'gravebow', from: 2, weight: 3 },
    { kind: 'mourner', from: 3, weight: 2.5 },
    { kind: 'lampwight', from: 4, weight: 2 },
    { kind: 'warden', from: 5, weight: 1.6 },
  ],
  sets: [
    { from: 2, foes: ['thrall', 'thrall', 'gravebow'] },
    { from: 3, foes: ['skitter', 'skitter', 'skitter', 'skitter', 'skitter'] },
    { from: 4, foes: ['mourner', 'mourner', 'thrall'] },
    { from: 5, foes: ['warden', 'gravebow', 'gravebow'] },
    { from: 6, foes: ['lampwight', 'thrall', 'thrall', 'skitter', 'skitter'] },
    { from: 7, foes: ['warden', 'warden', 'lampwight'] },
  ],
  threat: { thrall: 1, skitter: 0.5, gravebow: 1.2, mourner: 1.1, lampwight: 1.6, warden: 2.2 },
};

// build the waves for one chamber: [[{kind, elite}]]
export function planWaves(enc, depth, rng) {
  const waves = [];
  const nW = enc.waves(depth);
  for (let w = 0; w < nW; w++) {
    let budget = enc.budget(depth) * (w === nW - 1 ? 1.15 : 1);
    const foes = [];
    // sometimes open with a set piece
    const sets = enc.sets.filter((s) => s.from <= depth);
    if (sets.length && rng.next() < 0.4) {
      const s = sets[Math.floor(rng.next() * sets.length)];
      for (const k of s.foes) {
        foes.push({ kind: k });
        budget -= enc.threat[k];
      }
    }
    const pool = enc.pool.filter((p) => p.from <= depth);
    let guard = 0;
    while (budget > 0.4 && guard++ < 40) {
      let tot = 0;
      for (const p of pool) tot += p.weight;
      let r = rng.next() * tot;
      let pick = pool[0];
      for (const p of pool) {
        r -= p.weight;
        if (r <= 0) {
          pick = p;
          break;
        }
      }
      const n = pick.group || 1;
      for (let i = 0; i < n; i++) foes.push({ kind: pick.kind });
      budget -= enc.threat[pick.kind] * n;
    }
    // elites
    const ec = enc.eliteChance(depth);
    for (const f of foes) {
      if (f.kind !== 'skitter' && rng.next() < ec) f.elite = enc.elites[Math.floor(rng.next() * enc.elites.length)];
    }
    waves.push(foes.slice(0, 11));
  }
  return waves;
}
