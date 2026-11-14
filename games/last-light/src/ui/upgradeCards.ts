// View-models for the interface's upgrade displays: the three choice cards, and the list of upgrades a run
// has taken (pause and result screens). Pure data, no DOM, so it can be tested in Node.
import { SYNERGIES, UPGRADE_BY_ID, synergyCompletedBy, synergiesOf, type Category, type Choice, type Ranks, type SynergyId, type UpgradeId } from '../sim/upgrades';
import type { WeaponId } from '../sim/types';

export const CATEGORY_LABEL: Record<Category, string> = { offense: 'Offense', defense: 'Defense', mobility: 'Mobility', light: 'Light' };

/** The cost an upgrade carries, shown on its own line so a downside is never missed. */
export const TRADEOFFS: Partial<Record<UpgradeId, string>> = {
  glass: '2 less maximum health',
};

export type SynergyHint =
  | { kind: 'completes'; id: SynergyId; name: string; desc: string }
  | { kind: 'active'; id: SynergyId; name: string; desc: string }
  | { kind: 'needs'; id: SynergyId; name: string; desc: string; partner: UpgradeId; partnerName: string };

export interface UpgradeCard {
  id: UpgradeId;
  name: string;
  cat: Category;
  catLabel: string;
  rarity: 'common' | 'rare';
  /** The rank this pick takes it to (1-based) and the most it can reach. */
  rank: number;
  maxRank: number;
  /** "New", or "Rank 1 → 2". */
  rankLabel: string;
  desc: string;
  tradeoff: string | null;
  synergy: SynergyHint | null;
}

const ownedRank = (ranks: Ranks, id: UpgradeId) => ranks[id] ?? 0;

/** The most useful synergy line for one card: completing one beats one already active beats one still needing a partner. */
export function synergyHint(id: UpgradeId, ranks: Ranks): SynergyHint | null {
  const done = synergyCompletedBy(id, ranks);
  if (done) return { kind: 'completes', id: done.id, name: done.name, desc: done.desc };
  const syns = synergiesOf(id);
  const partnerOf = (needs: readonly UpgradeId[]) => needs[0] === id ? needs[1] : needs[0];
  const active = syns.find((s) => ownedRank(ranks, id) > 0 && ownedRank(ranks, partnerOf(s.needs)) > 0);
  if (active) return { kind: 'active', id: active.id, name: active.name, desc: active.desc };
  const open = syns.find((s) => ownedRank(ranks, partnerOf(s.needs)) === 0);
  if (!open) return null;
  const partner = partnerOf(open.needs);
  return { kind: 'needs', id: open.id, name: open.name, desc: open.desc, partner, partnerName: UPGRADE_BY_ID[partner].name };
}

/** Split "+45% damage, but 2 less maximum health." into the gain, when the cost is shown separately. */
function mainText(desc: string, tradeoff: string | null) {
  if (!tradeoff) return desc;
  const i = desc.indexOf(', but ');
  return i > 0 ? desc.slice(0, i) + '.' : desc;
}

/** Keep a number with the word after it ("3 s", "2 less") so a line never breaks between them. */
const keepNumbers = (t: string) => t.replace(/(\d) /g, '$1\u00a0');

export function buildUpgradeCard(choice: Pick<Choice, 'id' | 'rank'>, ranks: Ranks, weapon: WeaponId): UpgradeCard {
  const u = UPGRADE_BY_ID[choice.id];
  const rank = Math.max(1, Math.min(u.maxRank, choice.rank));
  const tradeoff = TRADEOFFS[u.id] ?? null;
  const hint = synergyHint(u.id, ranks);
  return {
    id: u.id, name: u.name, cat: u.cat, catLabel: CATEGORY_LABEL[u.cat], rarity: u.rare ? 'rare' : 'common',
    rank, maxRank: u.maxRank,
    rankLabel: rank <= 1 ? (u.maxRank > 1 ? `New · max ${u.maxRank}` : 'New') : `Rank ${rank - 1} → ${rank}`,
    desc: keepNumbers(mainText(u.desc(rank, weapon), tradeoff)),
    tradeoff,
    synergy: hint && { ...hint, desc: keepNumbers(hint.desc) },
  };
}

export const buildUpgradeCards = (choices: readonly Pick<Choice, 'id' | 'rank'>[], ranks: Ranks, weapon: WeaponId) =>
  choices.map((c) => buildUpgradeCard(c, ranks, weapon));

export interface TakenUpgrade { id: UpgradeId; name: string; cat: Category; catLabel: string; rank: number; maxRank: number }

/** Upgrades taken in a run, one entry each in first-taken order, with the rank reached. */
export function summarizePicks(picks: readonly UpgradeId[]): TakenUpgrade[] {
  const out = new Map<UpgradeId, TakenUpgrade>();
  for (const id of picks) {
    const u = UPGRADE_BY_ID[id];
    if (!u) continue;
    const t = out.get(id);
    if (t) t.rank = Math.min(u.maxRank, t.rank + 1);
    else out.set(id, { id, name: u.name, cat: u.cat, catLabel: CATEGORY_LABEL[u.cat], rank: 1, maxRank: u.maxRank });
  }
  return [...out.values()];
}

/** Synergies a set of picks has formed. */
export function activeSynergies(picks: readonly UpgradeId[]) {
  const have = new Set(picks);
  return SYNERGIES.filter((s) => have.has(s.needs[0]) && have.has(s.needs[1]));
}
