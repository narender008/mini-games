// Emberfall room authoring: room(spec) turns a drawn map into a room
// definition (the shape in the build brief). Pure data, no browser imports,
// so tools/validate.mjs can load the rooms in node.
//
// spec: { id, name, biome, gx, gy, w = 1, h = 1 (screens), dark, secret,
//         map: template string, 18*h rows of 32*w chars,
//         key: { '1'..'9': ent } (digits in the map; t defaults to 'enemy',
//              on: tile char under it, default '.'),
//         lore: [text, ...] (for each 'l' in reading order), shards: [n, ...] (each '$'),
//         ability, after (for 'a'), boss: { id, trigger: [x, y, w, h] } (for 'k'),
//         gates: [{ kind, requires, x, y, w, h, from: [tx, ty], to: [tx, ty] }],
//         ents: [explicit ents: platforms, exit-req] }
// Map markers (each stands in the tile the thing sits in; the floor is below):
//   p brazier   w start (the wanderer wakes here)   v vessel   $ shards
//   o hook ring   l lore tablet   a ability shrine   k boss   e the ending light
//   1-9 from key (enemies, or anything placed in water with on: '~')
// Gate from / to: the tile the player's feet stand IN (the floor is the tile
// below), on the near side and the far side of the gate.
const TILE_CHARS = '.#=^~LCXBSD';

export function room(spec) {
  const W = 32 * (spec.w || 1), H = 18 * (spec.h || 1);
  const rows = spec.map.split('\n').map((s) => s.trimEnd()).filter((s) => s.length);
  if (rows.length !== H) throw new Error(`${spec.id}: ${rows.length} rows, want ${H}`);
  const ents = [...(spec.ents || [])];
  const lore = [...(spec.lore || [])], shards = [...(spec.shards || [])];
  let start = null;
  const tiles = rows.map((row, y) => {
    if (row.length !== W) throw new Error(`${spec.id}: row ${y} has ${row.length} chars, want ${W}`);
    let out = '';
    for (let x = 0; x < W; x++) {
      const c = row[x];
      if (TILE_CHARS.includes(c)) { out += c; continue; }
      let e = null, under = '.';
      switch (c) {
        case 'p': e = { t: 'brazier', x, y }; break;
        case 'w': start = { x, y }; break;
        case 'v': e = { t: 'vessel', x, y }; break;
        case '$': e = { t: 'shards', n: shards.length ? shards.shift() : 25, x, y }; break;
        case 'o': e = { t: 'anchor', x, y }; break;
        case 'l': e = { t: 'lore', x, y, text: lore.shift() || '' }; break;
        case 'a': e = { t: 'ability', id: spec.ability, x, y, ...(spec.after ? { after: spec.after } : {}) }; break;
        case 'k': e = { t: 'boss', id: spec.boss.id, x, y, trigger: spec.boss.trigger }; break;
        case 'e': e = { t: 'ending', x, y }; break;
        default: {
          const k = spec.key && spec.key[c];
          if (!k) throw new Error(`${spec.id}: unknown map char '${c}' at ${x},${y}`);
          const { on, ...rest } = k;
          e = { t: 'enemy', ...rest, x, y };
          if (on) under = on;
        }
      }
      if (e) ents.push(e);
      out += under;
    }
    return out;
  });
  (spec.gates || []).forEach((g, i) => ents.push({ t: 'gate', id: `${spec.id}-${g.kind}${i ? i + 1 : ''}`, ...g }));
  const def = {
    id: spec.id, name: spec.name, biome: spec.biome, gx: spec.gx, gy: spec.gy, w: spec.w || 1, h: spec.h || 1,
    tiles, dark: spec.dark ?? 0.75, ents,
  };
  if (spec.secret) def.secret = true;
  if (start) def.start = start;
  return def;
}
