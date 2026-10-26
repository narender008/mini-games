// Everything that can be painted alive, in picker order. Each entry names
// the module that builds it and how it lies on the canvas.
//   group:   'pals' (the five heroes), 'wings', 'nature', 'toys', 'animals'
//   view:    how it is painted (see Friend.computeProjection): 'side',
//            'front' or 'top'
//   palette: its own colours (sRGB), used where nothing is painted and to
//            help guess what a free painting is
//   home:    where it lives once alive: 'ground' (roams the lawn and deck),
//            'garden' (planted in a flower bed), 'pond' (on the water) or
//            'sky' (up above the garden)
//   aspect:  width / height of its outline on the canvas (for guessing)
import { CALLS } from '../sound/calls.js';

const S = (id, name, group, view, palette, extra = {}) => ({ id, name, group, view, palette, home: 'ground', ...extra, load: () => import(`./${id}.js`) });

export const SUBJECTS = [
  // the Paint Pals
  S('dragon', 'Draco', 'pals', 'side', [0x2fc0b0, 0x3a7bd5, 0x8a4fd8], { aspect: 1.75 }),
  S('unicorn', 'Lumi', 'pals', 'side', [0xf7f1ff, 0xf5a3d6, 0xa98bf0], { aspect: 1.1 }),
  S('fox', 'Flick', 'pals', 'side', [0xfff1dc, 0xf2842a, 0x6b3b22], { aspect: 1.5 }),
  S('elephant', 'Poppy', 'pals', 'side', [0xa9b9dc, 0xf3a9c6, 0x7f90bd], { aspect: 1.25 }),
  S('whale', 'Wave', 'pals', 'side', [0x3a8ee0, 0xa6e4ff, 0x2a5fb8], { aspect: 1.2 }),
  // wings
  S('butterfly', 'Flutter', 'wings', 'top', [0xff8a3d, 0x8a4fd8, 0x3ac0e8], { aspect: 1.5 }),
  // nature
  S('flower', 'Bloom', 'nature', 'front', [0xf25a8e, 0xffd23f, 0x4caf50], { aspect: 0.6, home: 'garden' }),
  S('tree', 'Sprout', 'nature', 'front', [0x4caf50, 0x8a5a36, 0xa5d63a], { aspect: 0.75, home: 'garden' }),
  S('rainbow', 'Arc', 'nature', 'front', [0xe53935, 0xfdd835, 0x1e88e5], { aspect: 1.9, home: 'sky' }),
  S('sun', 'Sunny', 'nature', 'front', [0xffc93c, 0xff9a3c, 0xffffff], { aspect: 1.3, home: 'sky' }),
  // toys and vehicles
  S('car', 'Zoom', 'toys', 'side', [0xe53935, 0xff7043, 0xffca28], { aspect: 1.8 }),
  S('rocket', 'Blast', 'toys', 'front', [0xf2f2f5, 0xe53935, 0x1e88e5], { aspect: 0.55 }),
  S('boat', 'Bob', 'toys', 'side', [0xfdd835, 0xe53935, 0xffffff], { aspect: 1.3, home: 'pond' }),
  S('teddy', 'Teddy', 'toys', 'front', [0xb07a45, 0xe8c9a0, 0x5a3a22], { aspect: 0.8 }),
  // more animal friends
  S('bunny', 'Hop', 'animals', 'side', [0xf4ede4, 0xf5b8c8, 0xc9b8a6], { aspect: 1.0 }),
  S('kitten', 'Mittens', 'animals', 'side', [0xf0a050, 0xfff4e6, 0x8a5a36], { aspect: 1.35 }),
  S('puppy', 'Biscuit', 'animals', 'side', [0xd9a066, 0xfff1dc, 0x6b4428], { aspect: 1.3 }),
  S('penguin', 'Pip', 'animals', 'front', [0x2b2f3a, 0xfdfdfd, 0xffa726], { aspect: 0.75 }),
  S('turtle', 'Shelly', 'animals', 'side', [0x4caf50, 0x8bc34a, 0x795548], { aspect: 2.3 }),
];

export const BY_ID = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));

// build a friend of a kind (async: meshing runs in a worker)
export async function makeFriend(id, ctx) {
  const info = BY_ID[id] || SUBJECTS[0];
  const mod = await info.load();
  // a module may bring its own calls (see sound/calls.js)
  if (mod.calls && !CALLS[info.id]) CALLS[info.id] = mod.calls;
  const Cls = mod.default || Object.values(mod).find((v) => typeof v === 'function' && v.prototype && 'sculpt' in v.prototype);
  const f = new Cls(info, ctx);
  await f.build();
  return f;
}
