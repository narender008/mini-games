// Who rises in a combat chamber: waves drawn from the region's encounter
// tables (regions/<id>/encounters.js) against a threat budget that grows with
// the region's combat depth (1 at its first combat chamber). The next wave
// rises when few of the last are left (run.js).

// A chamber's numbers: threat budget per wave, how many waves, the elite
// chance. `floor` is the last combat chamber of the region below, so a new
// region never plans a chamber easier than where the climb left off.
export function chamberNumbers(enc, depth, floor) {
  return {
    budget: Math.max(enc.budget(depth), floor?.budget || 0),
    waves: Math.max(enc.waves(depth), floor?.waves || 0),
    elite: Math.max(enc.eliteChance(depth), floor?.elite || 0),
  };
}

// the waves for one chamber: [[{kind, elite}]]. `pool` weights which foes
// appear from which depth on; `sets` are hand-made groups mixed in so fights
// have shape; foes listed in `noElite` (swarms) are never elites.
export function planWaves(enc, depth, rng, n) {
  const waves = [];
  const nW = n.waves;
  for (let w = 0; w < nW; w++) {
    let budget = n.budget * (w === nW - 1 ? 1.15 : 1);
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
      const c = pick.group || 1;
      for (let i = 0; i < c; i++) foes.push({ kind: pick.kind });
      budget -= enc.threat[pick.kind] * c;
    }
    // elites
    for (const f of foes) {
      if (!enc.noElite?.includes(f.kind) && rng.next() < n.elite) f.elite = enc.elites[Math.floor(rng.next() * enc.elites.length)];
    }
    waves.push(foes.slice(0, 11));
  }
  return waves;
}
