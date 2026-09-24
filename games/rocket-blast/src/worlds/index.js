// The six worlds, each in its own module, loaded when first chosen.
const LOADERS = {
  sunny: () => import('./sunny.js'),
  night: () => import('./night.js'),
  storm: () => import('./storm.js'),
  clouds: () => import('./clouds.js'),
  grass: () => import('./grass.js'),
  space: () => import('./space.js'),
};

export async function loadWorld(id) {
  const mod = await (LOADERS[id] || LOADERS.sunny)();
  return mod.create;
}
