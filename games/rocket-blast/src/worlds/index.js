// The six worlds, each in its own module, loaded when first chosen, and the
// five Ace Pilot sectors, which follow the same interface.
const LOADERS = {
  sunny: () => import('./sunny.js'),
  night: () => import('./night.js'),
  storm: () => import('./storm.js'),
  clouds: () => import('./clouds.js'),
  grass: () => import('./grass.js'),
  space: () => import('./space.js'),
  // the Ace Pilot sectors (src/ace/sectors/)
  'ace:belt': () => import('../ace/sectors/belt.js'),
  'ace:storm': () => import('../ace/sectors/storm.js'),
  'ace:foundry': () => import('../ace/sectors/foundry.js'),
  'ace:hive': () => import('../ace/sectors/hive.js'),
  'ace:dreadnought': () => import('../ace/sectors/dreadnought.js'),
};

export async function loadWorld(id) {
  const mod = await (LOADERS[id] || LOADERS.sunny)();
  return mod.create;
}
