// Doodle inflation (src/doodle/inflate.js) in Node, no browser: every test
// drawing becomes a closed, manifold surface facing outwards, at full and
// coarse detail, with a face and feet; a speck is "almost nothing".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDoodle, packBits, unpackBits } from '../src/doodle/inflate.js';
import { PRESETS, rasterise } from '../src/doodle/presets.js';

const W = 256;
const H = 192;
const OPTS = { canvasW: 0.64, canvasH: 0.48, tris: 30000, size: 0.15 };

// edges used by other than exactly two triangles, and edges walked the same way twice
function topology(index) {
  const uses = new Map();
  const directed = new Set();
  let flipped = 0;
  for (let i = 0; i < index.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = index[i + k];
      const b = index[i + ((k + 1) % 3)];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      uses.set(key, (uses.get(key) || 0) + 1);
      const d = `${a},${b}`;
      if (directed.has(d)) flipped++;
      directed.add(d);
    }
  }
  let open = 0;
  let nonManifold = 0;
  for (const n of uses.values()) {
    if (n === 1) open++;
    else if (n > 2) nonManifold++;
  }
  return { open, nonManifold, flipped };
}

// signed volume (positive for a closed surface wound outwards), and how many
// triangles face the way their vertex normals do
function orientation(position, normal, index) {
  let vol = 0;
  let agree = 0;
  let n = 0;
  const v = (i) => [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]];
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [v(index[t]), v(index[t + 1]), v(index[t + 2])];
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const len = Math.hypot(...fn);
    if (len < 1e-14) continue;
    let dot = 0;
    for (const i of [index[t], index[t + 1], index[t + 2]]) dot += fn[0] * normal[i * 3] + fn[1] * normal[i * 3 + 1] + fn[2] * normal[i * 3 + 2];
    n++;
    if (dot > 0) agree++;
  }
  return { vol, agree: agree / n };
}

const SHAPES = Object.keys(PRESETS).filter((k) => k !== 'tiny');

test('the presets are the ones the debug API lists', () => {
  assert.deepEqual(Object.keys(PRESETS), ['blob', 'star', 'snake', 'two-blobs', 'tiny', 'face', 'stick']);
});

for (const name of SHAPES) {
  test(`${name}: a closed, manifold puffy body facing outwards`, () => {
    const bits = rasterise(PRESETS[name](), W, H);
    const d = buildDoodle(bits, W, H, OPTS);
    assert.equal(d.empty, false);
    for (const [lod, mesh] of [
      ['fine', d.body],
      ['coarse', d.coarse],
    ]) {
      const t = topology(mesh.index);
      assert.equal(t.open, 0, `${lod}: watertight (open edges)`);
      assert.equal(t.nonManifold, 0, `${lod}: manifold`);
      assert.equal(t.flipped, 0, `${lod}: consistently wound`);
      const o = orientation(mesh.position, mesh.normal, mesh.index);
      assert.ok(o.vol > 0, `${lod}: wound outwards (volume ${o.vol})`);
      assert.ok(o.agree > 0.99, `${lod}: normals point out (${(o.agree * 100).toFixed(2)}% agree)`);
      for (const x of mesh.position) assert.ok(Number.isFinite(x), `${lod}: finite positions`);
    }
    assert.ok(d.body.tris > 5000 && d.body.tris < 40000, `fine triangles ${d.body.tris}`);
    assert.ok(d.coarse.tris < d.body.tris / 2, `coarse triangles ${d.coarse.tris}`);
    // a face and something to stand on
    assert.equal(d.eyes.length, 2, 'two eyes');
    assert.ok(d.mouth, 'a smile');
    assert.ok(d.legs.length >= 2, 'feet');
    // skin weights sum to one
    const sw = d.body.skinWeight;
    for (let i = 0; i < sw.length; i += 4 * 97) assert.ok(Math.abs(sw[i] + sw[i + 1] + sw[i + 2] + sw[i + 3] - 1) < 1e-3, 'skin weights');
  });
}

test('a long doodle walks on more legs than a round one', () => {
  const legs = (name) => buildDoodle(rasterise(PRESETS[name](), W, H), W, H, OPTS).legs.length;
  assert.ok(legs('snake') > legs('blob'));
});

test('a speck is almost nothing', () => {
  const d = buildDoodle(rasterise(PRESETS.tiny(), W, H), W, H, OPTS);
  assert.equal(d.empty, true);
  assert.equal(buildDoodle(new Uint8Array(W * H), W, H, OPTS).empty, true);
});

test('a drawing packs and unpacks exactly (how a doodle is kept)', () => {
  const bits = rasterise(PRESETS.star(), W, H);
  const back = unpackBits(packBits(bits), W * H);
  assert.deepEqual(Array.from(back), Array.from(bits));
});
