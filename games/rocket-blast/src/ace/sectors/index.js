// The five Ace Pilot sectors, each in its own module, loaded when first
// needed. Same shape as src/worlds/index.js: loadSector(id) resolves to the
// module's create(ctx).
const LOADERS = {
  belt: () => import('./belt.js'),
  storm: () => import('./storm.js'),
  foundry: () => import('./foundry.js'),
  hive: () => import('./hive.js'),
  dreadnought: () => import('./dreadnought.js'),
};

export const SECTOR_IDS = Object.keys(LOADERS);

export async function loadSector(id) {
  const mod = await (LOADERS[id] || LOADERS.belt)();
  return mod.create;
}
