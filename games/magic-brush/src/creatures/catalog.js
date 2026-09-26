// Everything that can be painted alive, in picker order. Each entry names
// the module that builds it and how it lies on the canvas.
//   group: 'pals' (the five heroes), 'animals', 'nature', 'toys'
//   view:  how it is painted (see Friend.computeProjection)
//   palette: its own colours (sRGB), used when nothing is painted and to
//            help guess what a free painting is
//   moves: how it gets about in the world: 'walk', 'hop', 'fly', 'swim',
//          'drive', 'sail', 'still'
export const SUBJECTS = [
  { id: 'dragon', name: 'Draco', group: 'pals', view: 'side', palette: [0x2fc0b0, 0x3a7bd5, 0x8a4fd8], moves: 'walk', load: () => import('./dragon.js') },
];

export const BY_ID = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));

// build a friend of a kind (async: meshing runs in a worker)
export async function makeFriend(id, ctx) {
  const info = BY_ID[id] || SUBJECTS[0];
  const mod = await info.load();
  const Cls = mod.default || Object.values(mod).find((v) => typeof v === 'function' && v.prototype && v.prototype.sculpt);
  const f = new Cls(info, ctx);
  await f.build();
  return f;
}
