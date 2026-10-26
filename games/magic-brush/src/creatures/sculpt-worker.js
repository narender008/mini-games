// Meshes a friend's sculpted field off the main thread (see sculptcore.js).
import { meshField } from './sculptcore.js';

self.onmessage = (e) => {
  const { id, prims, nb, opts } = e.data;
  try {
    const out = meshField(prims, nb, opts);
    const transfer = [out.position.buffer, out.normal.buffer, out.skinIndex.buffer, out.skinWeight.buffer, out.tint.buffer, out.mix.buffer, out.index.buffer];
    self.postMessage({ id, out }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
