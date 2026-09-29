// The Blender-made props (src/props.js, `loadProp(id)`) may not be there yet,
// or may not know an id. A stage asks through this helper and builds its own
// stand-in when it gets null, so no stage ever fails for a missing prop.
let mod = null;

export async function tryProp(id) {
  try {
    mod ??= import('../props.js');
    const m = await mod;
    if (typeof m.loadProp !== 'function') return null;
    return (await m.loadProp(id)) ?? null;
  } catch {
    return null;
  }
}
