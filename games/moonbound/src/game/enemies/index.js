// Every foe by id: its data (name, health, size, animations, codex text)
// and its class (behaviour). To add a foe: a file like thrall.js (data plus a
// class extending Foe with think()), its sprites in a region's set, and an
// entry here; then list it in a region's encounters.
import { Thrall, THRALL } from './thrall.js';
import { Gravebow, GRAVEBOW } from './gravebow.js';
import { Skitter, SKITTER } from './skitter.js';
import { Mourner, MOURNER } from './mourner.js';
import { Lampwight, LAMPWIGHT } from './lampwight.js';
import { Warden, WARDEN } from './warden.js';
import { Gaoler, GAOLER } from '../bosses/gaoler.js';
import { Seraph, SERAPH } from '../bosses/seraph.js';

export const FOES = {
  thrall: { def: THRALL, cls: Thrall },
  gravebow: { def: GRAVEBOW, cls: Gravebow },
  skitter: { def: SKITTER, cls: Skitter },
  mourner: { def: MOURNER, cls: Mourner },
  lampwight: { def: LAMPWIGHT, cls: Lampwight },
  warden: { def: WARDEN, cls: Warden },
  gaoler: { def: GAOLER, cls: Gaoler },
  seraph: { def: SERAPH, cls: Seraph },
};

export function makeFoe(world, kind, x, y, opts) {
  const f = FOES[kind];
  if (!f) throw new Error('no foe ' + kind);
  return new f.cls(world, f.def, x, y, opts);
}
