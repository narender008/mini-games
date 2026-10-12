// Who fights in the Gloamwall's chambers (planned by game/waves.js). A
// chamber's foes come in waves drawn from a threat budget that grows with
// depth (the region's combat chambers count 1, 2, ...). `pool` weights which
// foes appear from which chamber on; `sets` are hand-made groupings mixed in
// so fights have shape (a shield wall with archers behind, a skitter swarm, a
// lantern procession).
export const ENCOUNTERS = {
  // threat budget per wave by chamber depth (1-based) and waves per chamber
  budget: (depth) => 3.2 + depth * 0.85,
  waves: (depth) => (depth <= 1 ? 2 : depth <= 5 ? 2 + (depth >= 4 ? 1 : 0) : 3),
  eliteChance: (depth) => (depth < 3 ? 0 : Math.min(0.32, 0.08 + (depth - 3) * 0.05)),
  elites: ['swift', 'warded', 'vengeful', 'hulking'],
  noElite: ['skitter'],
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
