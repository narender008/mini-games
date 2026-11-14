// The run: a fixed arc of rooms through the ruined city, generated from the run seed.
//
//   Sanctum -> Causeway (3 combat) -> Aqueduct (3 combat) -> Foundry (2 combat) -> the Heart (boss)
//
// After some combat rooms the gate wall has two doors, each promising a reward room (shrine, heartbloom,
// light cache or ember trial). Waves are built from a point budget that grows with depth, from each
// area's enemy pool. Pure and deterministic: the same seed gives the same rooms, waves and offers.
import { Rng } from '../core/rng';
import type { EnemyKind } from './types';
import { generateRoom } from './level/gen';
import { ROOMS, type RoomDef, type WaveDef, type Zone } from './level/rooms';

export type Reward = 'shrine' | 'heal' | 'cache' | 'trial';
export type NodeKind = 'sanctum' | 'combat' | 'reward' | 'boss';

export interface RunNode {
  index: number;
  kind: NodeKind;
  zone: Zone;
  /** The next step offers a choice of two reward rooms (one per door). */
  choice: boolean;
  reward?: Reward;
  name: string;
}

export const REWARD_INFO: Record<Reward, { name: string; door: string; prop: string; prompt: string }> = {
  shrine: { name: 'Shrine of Embers', door: 'Upgrade', prop: 'U', prompt: 'Pray at the shrine' },
  heal: { name: 'Heartbloom Garden', door: 'Heal', prop: 'H', prompt: 'Breathe in the heartbloom' },
  cache: { name: 'Light Cache', door: 'Light', prop: 'C', prompt: 'Open the light cache' },
  trial: { name: 'Ember Trial', door: 'Trial', prop: 'U', prompt: 'Claim the trial reward' },
};

const AREA_NAMES: Record<Zone, string[]> = {
  sanctum: ['The Last Sanctum'],
  causeway: ['The Orrery Plaza', 'Starlit Causeway', 'Hall of Banners', 'The Broken Colonnade'],
  aqueduct: ['Flooded Gardens', 'The Drowned Cistern', 'Moonwell Terrace', 'Lily Aqueduct'],
  foundry: ['The Cinder Kilns', 'Ashen Forge', 'Slag Galleries'],
  heart: ['Heart of the Fallen Star'],
};

/** The arc. `choice` marks combat rooms whose doors lead to a pick of reward rooms. */
const ARC: { kind: NodeKind; zone: Zone; choice?: boolean }[] = [
  { kind: 'sanctum', zone: 'sanctum' },
  { kind: 'combat', zone: 'causeway' },
  { kind: 'combat', zone: 'causeway', choice: true },
  { kind: 'reward', zone: 'causeway' },
  { kind: 'combat', zone: 'causeway' },
  { kind: 'combat', zone: 'aqueduct', choice: true },
  { kind: 'reward', zone: 'aqueduct' },
  { kind: 'combat', zone: 'aqueduct' },
  { kind: 'combat', zone: 'aqueduct', choice: true },
  { kind: 'reward', zone: 'aqueduct' },
  { kind: 'combat', zone: 'foundry' },
  { kind: 'combat', zone: 'foundry', choice: true },
  { kind: 'reward', zone: 'foundry' },
  { kind: 'boss', zone: 'heart' },
];

const COST: Record<EnemyKind, number> = { stalker: 1, sentinel: 1.5, charger: 2.2, warden: 2, colossus: 5, boss: 99, dummy: 99 };
const POOLS: Record<Zone, [EnemyKind, number, number][]> = {
  // kind, weight, first combat index it may appear at
  sanctum: [],
  causeway: [['stalker', 5, 0], ['sentinel', 3, 1], ['charger', 2, 3]],
  aqueduct: [['stalker', 4, 0], ['sentinel', 3, 0], ['warden', 2, 0], ['charger', 2, 0]],
  foundry: [['stalker', 3, 0], ['sentinel', 3, 0], ['warden', 1.5, 0], ['charger', 2.5, 0], ['colossus', 1.4, 0]],
  heart: [],
};

export class RunPlan {
  readonly nodes: RunNode[];
  private usedNames = new Set<string>();
  /** The offers on the doors of the current choice room, in door order. */
  offers: Reward[] = [];

  constructor(readonly seed: number) {
    this.nodes = ARC.map((a, index) => ({ index, kind: a.kind, zone: a.zone, choice: !!a.choice, name: '' }));
    for (const n of this.nodes) n.name = n.kind === 'reward' ? '' : this.pickName(n.zone, n.index);
  }

  get length() { return this.nodes.length; }
  combatIndex(i: number) { return this.nodes.slice(0, i).filter((n) => n.kind === 'combat').length; }

  private pickName(zone: Zone, index: number) {
    if (zone === 'causeway' && index === 1) { this.usedNames.add('The Orrery Plaza'); return 'The Orrery Plaza'; }
    const names = AREA_NAMES[zone].filter((n) => !this.usedNames.has(n));
    const name = names.length ? names[new Rng(this.seed + index * 31).int(0, names.length - 1)] : AREA_NAMES[zone][0];
    this.usedNames.add(name);
    return name;
  }

  /** Two different rewards for the doors of a choice room; the last before the boss is heal or upgrade. */
  rollOffers(i: number): Reward[] {
    const r = new Rng(this.seed * 7 + i * 131);
    const next = this.nodes[i + 2];
    if (next && next.kind === 'boss') return ['heal', 'shrine'];
    const pool: Reward[] = ['shrine', 'heal', 'cache', 'trial'];
    const W: Record<Reward, number> = { shrine: 4, heal: 2.5, cache: 2.5, trial: 2 };
    const a = r.weighted(pool, (p) => W[p]);
    const rest = pool.filter((p) => p !== a);
    const b = r.weighted(rest, (p) => W[p]);
    return [a, b];
  }

  /** The room for node i. Combat rooms get their waves; reward rooms their prop; the boss room is fixed. */
  room(i: number, reward?: Reward): RoomDef {
    const n = this.nodes[i];
    if (n.kind === 'sanctum') return ROOMS.sanctum;
    if (n.kind === 'boss') return ROOMS.heart;
    if (n.kind === 'reward') {
      const rw = reward ?? 'shrine';
      n.reward = rw;
      n.name = REWARD_INFO[rw].name;
      const def = generateRoom(this.seed + i * 977, { zone: n.zone, doors: 1, reward: REWARD_INFO[rw].prop, name: n.name, id: `r${i}` });
      if (rw === 'trial') def.waves = this.waves(i, 0.75, true);
      return def;
    }
    const base = i === 1 ? { ...ROOMS.plaza, map: ROOMS.plaza.map } : generateRoom(this.seed + i * 977, { zone: n.zone, doors: n.choice ? 2 : 1, name: n.name, id: `c${i}` });
    return { ...base, name: n.name, waves: this.waves(i, 1, false) };
  }

  /** Waves from a budget: ~6 points in the first room up to ~20 by the last. */
  waves(i: number, scale: number, trial: boolean): WaveDef[] {
    const n = this.nodes[i];
    const ci = this.combatIndex(i);
    const r = new Rng(this.seed * 13 + i * 7349);
    const budget = (4.6 + ci * 2.0) * scale * (trial ? 1.1 : 1);
    const count = ci === 0 ? 2 : ci < 4 ? 3 : 3;
    const pool = POOLS[n.zone].filter(([, , from]) => ci >= from || n.zone !== 'causeway');
    const waves: WaveDef[] = [];
    for (let w = 0; w < count; w++) {
      // Later waves are bigger.
      let pts = budget * (0.7 + w * 0.3) / (count === 2 ? 0.85 : 1);
      const kinds: EnemyKind[] = [];
      let colossi = 0;
      while (pts > 0.9 && kinds.length < 9) {
        const opts = pool.filter(([k]) => COST[k] <= pts + 0.5 && (k !== 'colossus' || colossi < 1));
        if (!opts.length) break;
        const k = r.weighted(opts, (o) => o[1])[0];
        if (k === 'colossus') colossi++;
        kinds.push(k);
        pts -= COST[k];
      }
      if (!kinds.length) kinds.push('stalker');
      const elite = trial ? 1 : w === count - 1 ? Math.min(2, Math.floor(ci / 3)) : 0;
      waves.push({ kinds, elite });
    }
    return waves;
  }
}
