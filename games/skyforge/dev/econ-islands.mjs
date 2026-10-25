// Headless: print every island's cells (front row at the bottom) and the rim gaps
// between home-cluster neighbours. node games/skyforge/dev/econ-islands.mjs [id]
import { ISLANDS, genCells, findFalls, HOME_CLUSTER } from '../src/content/islands.js';
const only = process.argv[2];
const rims = {};
for (const d of ISLANDS) {
  const c = genCells(d);
  const rim = [];
  const at = (u, v) => (u < 0 || v < 0 || u >= d.w || v >= d.h ? ' ' : c[v * d.w + u]);
  for (let v = 0; v < d.h; v++) for (let u = 0; u < d.w; u++) if (at(u, v) !== ' ' && [[1,0],[-1,0],[0,1],[0,-1]].some(([a,b]) => at(u+a, v+b) === ' ')) rim.push([d.ox + u + 0.5, d.oy + v + 0.5]);
  rims[d.id] = rim;
  if (only && only !== d.id) continue;
  const counts = {}; for (const ch of c) counts[ch] = (counts[ch] || 0) + 1;
  console.log(`\n${d.id} ${d.w}x${d.h} at (${d.ox},${d.oy}) alt ${d.alt}  ${JSON.stringify(counts)} falls ${JSON.stringify(findFalls(d, c))}`);
  for (let v = d.h - 1; v >= 0; v--) console.log(String(v).padStart(2) + ' ' + c.slice(v * d.w, v * d.w + d.w).split('').map((x) => x === ' ' ? '·' : x).join(''));
}
console.log('\nrim gaps (tiles, edge cell centre to centre minus 1):');
for (let i = 0; i < HOME_CLUSTER.length; i++) for (let j = i + 1; j < HOME_CLUSTER.length; j++) {
  const a = HOME_CLUSTER[i], b = HOME_CLUSTER[j]; let best = 1e9;
  for (const p of rims[a]) for (const q of rims[b]) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
  console.log(`  ${a} - ${b}: ${(best - 1).toFixed(1)}`);
}
