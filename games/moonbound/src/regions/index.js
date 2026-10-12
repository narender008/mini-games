// The road up Nocthelm: every region a run climbs, bottom to top (DESIGN.md
// "A region"). The order is fixed here, whatever order the regions are built
// in. A region is registered by filling in its own `load` line below (its
// folder's index.js, whose default export is the region); a slot left at null
// is skipped, so a run climbs straight from one registered region to the next.
// Nothing else in the game needs to change when a region is added.
//
// The regions are loaded once at start (loadRegions()); after that REGIONS
// holds the registered ones in climbing order and everything reads it.
export const CLIMB = [
  // 1. the outer ramparts
  { id: 'gloamwall', load: () => import('./gloamwall/index.js') },

  // 2. the Vigil Vaults
  { id: 'vaults', load: null },

  // 3. the Fallen Orrery
  { id: 'orrery', load: null },

  // 4. the Midnight Clock, the summit (the final region)
  { id: 'clock', load: null },
];

export const REGIONS = [];

export async function loadRegions() {
  if (REGIONS.length) return REGIONS;
  const slots = CLIMB.filter((s) => s.load);
  const mods = await Promise.all(slots.map((s) => s.load()));
  slots.forEach((s, i) => {
    const r = mods[i].default;
    if (!r || r.id !== s.id) throw new Error(`region slot ${s.id} loaded ${r?.id ?? 'nothing'}`);
    REGIONS.push(r);
  });
  return REGIONS;
}

export const regionById = (id) => REGIONS.find((r) => r.id === id) || null;

// the next registered region up, or null at the top of the climb so far
export function regionAfter(region) {
  const i = REGIONS.indexOf(region);
  return i >= 0 ? REGIONS[i + 1] || null : null;
}

// the registered region whose layouts hold this layout id
export const regionOfLayout = (id) => REGIONS.find((r) => r.layouts.some((l) => l.id === id)) || null;
