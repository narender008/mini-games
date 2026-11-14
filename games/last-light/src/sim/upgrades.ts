// Upgrades ("Kindlings"), their stat effects, synergies, and the seeded three-card choice.
// Every upgrade changes real numbers in Stats; the simulation reads only Stats, never upgrade ids directly.
import type { Rng } from '../core/rng';
import type { WeaponId } from './types';

export type UpgradeId =
  | 'kindled' | 'quickened' | 'brand' | 'arc' | 'shardbloom' | 'piercing' | 'glass' | 'reaper'
  | 'heartwood' | 'wisp' | 'emberheart' | 'mending' | 'aegis'
  | 'phase' | 'trail' | 'fleet' | 'afterglow'
  | 'flare' | 'hoard';
export type SynergyId = 'wildfire' | 'storm' | 'supernova' | 'eclipse';
export type Category = 'offense' | 'defense' | 'mobility' | 'light';

export interface Stats {
  dmgMul: number;
  atkSpeed: number; // multiplier on attack speed (phase durations divide by it)
  moveMul: number;
  dashCdMul: number;
  dashCharges: number;
  maxHpBonus: number;
  burnFrac: number; // burn damage per second as a fraction of the hit, 0 = no burn
  chainEvery: number; // every Nth hit chains, 0 = off
  chainDmg: number;
  chainTargets: number;
  shards: number; // shards released on kill
  pierce: number; // sunlance extra pierce
  crescent: number; // lantern: final swing sends a crescent wave (0 = off, else damage multiplier)
  wisps: number;
  revive: boolean;
  mendEvery: number; // motes per heal, 0 = off
  radianceMul: number;
  flareRadiusMul: number;
  flareCostMul: number;
  trail: boolean;
  afterglow: boolean;
  reaper: boolean;
  aegis: boolean;
  magnetMul: number;
  synergies: Set<SynergyId>;
}

export const baseStats = (): Stats => ({
  dmgMul: 1, atkSpeed: 1, moveMul: 1, dashCdMul: 1, dashCharges: 1, maxHpBonus: 0,
  burnFrac: 0, chainEvery: 0, chainDmg: 0, chainTargets: 0, shards: 0, pierce: 0, crescent: 0,
  wisps: 0, revive: false, mendEvery: 0, radianceMul: 1, flareRadiusMul: 1, flareCostMul: 1,
  trail: false, afterglow: false, reaper: false, aegis: false, magnetMul: 1, synergies: new Set(),
});

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  cat: Category;
  maxRank: number;
  rare: boolean;
  /** Description of what taking the next rank does. `rank` is the rank it would become (1-based). */
  desc: (rank: number, weapon: WeaponId) => string;
  apply: (s: Stats, rank: number) => void;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'kindled', name: 'Kindled Edge', cat: 'offense', maxRank: 3, rare: false,
    desc: () => `+20% damage with every attack.`,
    apply: (s, r) => { s.dmgMul *= 1 + 0.2 * r; } },
  { id: 'quickened', name: 'Quickened Rite', cat: 'offense', maxRank: 3, rare: false,
    desc: () => `Attack 15% faster.`,
    apply: (s, r) => { s.atkSpeed *= 1 + 0.15 * r; } },
  { id: 'brand', name: 'Ember Brand', cat: 'offense', maxRank: 2, rare: false,
    desc: (r) => r === 1 ? `Hits set foes burning for 3 s (30% of the hit per second).` : `Burns grow hotter: 50% of the hit per second.`,
    apply: (s, r) => { s.burnFrac = r === 1 ? 0.3 : 0.5; } },
  { id: 'arc', name: 'Arc Thread', cat: 'offense', maxRank: 2, rare: false,
    desc: (r) => r === 1 ? `Every 5th hit leaps as lightning to 3 nearby foes.` : `Lightning leaps every 3rd hit, to 4 foes, and hits harder.`,
    apply: (s, r) => { s.chainEvery = r === 1 ? 5 : 3; s.chainTargets = r === 1 ? 3 : 4; s.chainDmg = r === 1 ? 9 : 13; } },
  { id: 'shardbloom', name: 'Shardbloom', cat: 'offense', maxRank: 2, rare: false,
    desc: (r) => r === 1 ? `Slain foes burst into 4 seeking shards of light.` : `Slain foes burst into 7 shards.`,
    apply: (s, r) => { s.shards = r === 1 ? 4 : 7; } },
  { id: 'piercing', name: 'Piercing Dawn', cat: 'offense', maxRank: 2, rare: false,
    desc: (r, w) => w === 'sunlance'
      ? (r === 1 ? `Bolts pierce one more foe.` : `Bolts pierce two more foes.`)
      : (r === 1 ? `Your third swing sends a crescent of light flying forward.` : `The crescent is larger and hits twice as hard.`),
    apply: (s, r) => { s.pierce = r; s.crescent = r === 1 ? 0.7 : 1.4; } },
  { id: 'glass', name: 'Glass Lantern', cat: 'offense', maxRank: 1, rare: true,
    desc: () => `+45% damage, but 2 less maximum health.`,
    apply: (s) => { s.dmgMul *= 1.45; s.maxHpBonus -= 2; } },
  { id: 'reaper', name: 'Dusk Reaper', cat: 'offense', maxRank: 1, rare: false,
    desc: () => `+60% damage to foes below 35% health.`,
    apply: (s) => { s.reaper = true; } },
  { id: 'heartwood', name: 'Heartwood', cat: 'defense', maxRank: 3, rare: false,
    desc: () => `+2 maximum health, and heal 2.`,
    apply: (s, r) => { s.maxHpBonus += 2 * r; } },
  { id: 'wisp', name: 'Lantern Wisp', cat: 'defense', maxRank: 2, rare: false,
    desc: (r) => r === 1 ? `A wisp circles you, blocking enemy shots and singeing foes.` : `A second wisp joins the first.`,
    apply: (s, r) => { s.wisps = r; } },
  { id: 'emberheart', name: 'Ember Heart', cat: 'defense', maxRank: 1, rare: true,
    desc: () => `Once per run, a killing blow instead leaves you at 3 health and unleashes a Sunburst.`,
    apply: (s) => { s.revive = true; } },
  { id: 'mending', name: 'Mending Motes', cat: 'defense', maxRank: 2, rare: false,
    desc: (r) => r === 1 ? `Every 30 motes of light you gather heal 1 health.` : `Heal every 20 motes instead.`,
    apply: (s, r) => { s.mendEvery = r === 1 ? 30 : 20; } },
  { id: 'aegis', name: 'Radiant Aegis', cat: 'defense', maxRank: 1, rare: false,
    desc: () => `Sunburst also wraps you in a ward that stops the next hit.`,
    apply: (s) => { s.aegis = true; } },
  { id: 'phase', name: 'Phase Step', cat: 'mobility', maxRank: 2, rare: false,
    desc: () => `+1 dash charge.`,
    apply: (s, r) => { s.dashCharges += r; } },
  { id: 'trail', name: 'Cinder Trail', cat: 'mobility', maxRank: 1, rare: false,
    desc: () => `Dashing leaves a trail of embers that burns foes.`,
    apply: (s) => { s.trail = true; } },
  { id: 'fleet', name: 'Fleetfoot', cat: 'mobility', maxRank: 2, rare: false,
    desc: () => `Move 10% faster; dash recovers 15% sooner.`,
    apply: (s, r) => { s.moveMul *= 1 + 0.1 * r; s.dashCdMul *= 1 - 0.15 * r; } },
  { id: 'afterglow', name: 'Afterglow', cat: 'mobility', maxRank: 1, rare: true,
    desc: () => `Dash through an attack at the last moment to slow time; your next attack deals double damage and stuns.`,
    apply: (s) => { s.afterglow = true; } },
  { id: 'flare', name: 'Solar Flare', cat: 'light', maxRank: 2, rare: false,
    desc: () => `Sunburst reaches 30% further and costs 20% less light.`,
    apply: (s, r) => { s.flareRadiusMul *= 1 + 0.3 * r; s.flareCostMul *= 1 - 0.2 * r; } },
  { id: 'hoard', name: 'Hoarded Light', cat: 'light', maxRank: 1, rare: false,
    desc: () => `Motes give 50% more light for Sunburst and are drawn to you from twice as far.`,
    apply: (s) => { s.radianceMul *= 1.5; s.magnetMul *= 2; } },
];

export const UPGRADE_BY_ID: Record<UpgradeId, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<UpgradeId, UpgradeDef>;

export interface SynergyDef { id: SynergyId; name: string; needs: [UpgradeId, UpgradeId]; desc: string }
export const SYNERGIES: readonly SynergyDef[] = [
  { id: 'wildfire', name: 'Wildfire', needs: ['brand', 'trail'], desc: 'Burning foes erupt in flame when they fall, setting their neighbours alight.' },
  { id: 'storm', name: 'Storm Lantern', needs: ['arc', 'wisp'], desc: 'Your wisps loose chain lightning at nearby foes every 2 seconds.' },
  { id: 'supernova', name: 'Supernova', needs: ['shardbloom', 'flare'], desc: 'Sunburst also releases a ring of 12 seeking shards.' },
  { id: 'eclipse', name: 'Eclipse', needs: ['afterglow', 'reaper'], desc: 'An empowered attack slays any non-boss foe below 35% health outright.' },
];

export type Ranks = Partial<Record<UpgradeId, number>>;

export function computeStats(ranks: Ranks): Stats {
  const s = baseStats();
  for (const u of UPGRADES) {
    const r = ranks[u.id] ?? 0;
    if (r > 0) u.apply(s, Math.min(r, u.maxRank));
  }
  for (const syn of SYNERGIES) {
    if ((ranks[syn.needs[0]] ?? 0) > 0 && (ranks[syn.needs[1]] ?? 0) > 0) s.synergies.add(syn.id);
  }
  return s;
}

/** Synergy this upgrade would complete (partner already owned), if any. */
export function synergyCompletedBy(id: UpgradeId, ranks: Ranks): SynergyDef | null {
  if ((ranks[id] ?? 0) > 0) return null;
  for (const syn of SYNERGIES) {
    const i = syn.needs.indexOf(id);
    if (i >= 0 && (ranks[syn.needs[1 - i]] ?? 0) > 0) return syn;
  }
  return null;
}

/** Synergies this upgrade takes part in (for card hints). */
export const synergiesOf = (id: UpgradeId) => SYNERGIES.filter((s) => s.needs.includes(id));

export interface Choice { id: UpgradeId; rank: number; synergy: SynergyId | null }

/**
 * Pick three distinct upgrades the player can still take. Upgrades that would complete a synergy are
 * favoured; `guaranteeRare` (shrine rooms) forces at least one rare or synergy-completing card when possible.
 */
export function rollChoices(rng: Rng, ranks: Ranks, count = 3, guaranteeRare = false): Choice[] {
  const pool = UPGRADES.filter((u) => (ranks[u.id] ?? 0) < u.maxRank);
  const out: Choice[] = [];
  const weight = (u: UpgradeDef) => {
    let w = u.rare ? 4 : 10;
    if (synergyCompletedBy(u.id, ranks)) w *= 2.5;
    if ((ranks[u.id] ?? 0) > 0) w *= 1.3; // deepening a build is a little more likely
    return w;
  };
  const avail = pool.slice();
  if (guaranteeRare) {
    const special = avail.filter((u) => u.rare || synergyCompletedBy(u.id, ranks));
    if (special.length) {
      const u = rng.weighted(special, weight);
      out.push(toChoice(u, ranks));
      avail.splice(avail.indexOf(u), 1);
    }
  }
  while (out.length < count && avail.length) {
    const u = rng.weighted(avail, weight);
    out.push(toChoice(u, ranks));
    avail.splice(avail.indexOf(u), 1);
  }
  return out;
}

function toChoice(u: UpgradeDef, ranks: Ranks): Choice {
  return { id: u.id, rank: (ranks[u.id] ?? 0) + 1, synergy: synergyCompletedBy(u.id, ranks)?.id ?? null };
}

/** Motes needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) => 16 + level * 8;
