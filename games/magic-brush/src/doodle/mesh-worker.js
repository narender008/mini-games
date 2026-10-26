// Meshes a doodle friend off the main thread (see inflate.js). A module
// worker has no import map, so inflate.js imports nothing.
import { buildDoodle } from './inflate.js';

self.onmessage = (e) => {
  const { id, bits, W, H, opts } = e.data;
  try {
    const out = buildDoodle(bits, W, H, opts);
    const transfer = [];
    for (const k of ['body', 'coarse']) {
      const g = out[k];
      if (!g) continue;
      for (const a of ['position', 'normal', 'index', 'skinIndex', 'skinWeight', 'tint', 'mix']) transfer.push(g[a].buffer);
    }
    // (the silhouette is only wanted on the page for debugging)
    if (out.silhouette) out.silhouette = null;
    self.postMessage({ id, out }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
