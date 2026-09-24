// Stepping stones across the lawn: riven sandstone flags 35-40 cm across,
// irregular outlines with softened edges, set a little into the turf so only
// a centimetre or so stands proud, with moss creeping in at the edges.
import * as THREE from 'three';
import { noise2 } from '../../shared.js';

const RINGS = [
  // [fraction of the outline radius, height above the lawn (m)]
  [0, 0.0115],
  [0.35, 0.0113],
  [0.65, 0.0108],
  [0.86, 0.01],
  [0.965, 0.0088],
  [1.0, 0.0068],
  [1.012, 0.0025],
  [1.03, -0.025],
];

function stoneGeo(x, z, rnd) {
  const R = 0.17 + rnd() * 0.025;
  const ex = 0.78 + rnd() * 0.22;
  const rot = rnd() * Math.PI;
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const seg = 48;
  const cols = seg + 1;
  const rows = RINGS.length;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const col = new Float32Array(rows * cols * 3);
  const tilt = [(rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.02];
  const uo = rnd();
  const vo = rnd();
  const seed = rnd() * 100;
  for (let j = 0; j < rows; j++) {
    const [f, h] = RINGS[j];
    for (let i = 0; i < cols; i++) {
      const a = (i / seg) * Math.PI * 2;
      // a rough, broken outline: a few low harmonics plus a little chipping
      const edge =
        1 +
        0.09 * Math.sin(2 * a + ph[0]) +
        0.06 * Math.sin(3 * a + ph[1]) +
        0.035 * Math.sin(5 * a + ph[2]) +
        0.02 * Math.sin(9 * a + ph[3]) +
        0.025 * (noise2(Math.cos(a) * 2.5 + seed, Math.sin(a) * 2.5) - 0.5);
      const lx = Math.cos(a) * R * edge * f;
      const lz = Math.sin(a) * R * edge * f * ex;
      const px = x + lx * Math.cos(rot) - lz * Math.sin(rot);
      const pz = z + lx * Math.sin(rot) + lz * Math.cos(rot);
      // riven top: gentle undulation, a slight tilt
      const und = f <= 1 ? (noise2(px * 9 + seed, pz * 9) - 0.5) * 0.003 + (noise2(px * 31, pz * 31 + seed) - 0.5) * 0.001 : 0;
      const y = h + und + (f <= 1.01 ? lx * tilt[0] + lz * tilt[1] : 0);
      const o = j * cols + i;
      pos.set([px, y, pz], o * 3);
      uv.set([px / 0.6 + uo, pz / 0.6 + vo], o * 2);
      // moss creeping in from the edges, soil-stained sides
      const m = Math.max(0, Math.min(1, (f - 0.78) / 0.22)) * (0.4 + 0.8 * noise2(px * 22 + seed, pz * 22));
      const side = f > 1.01 ? 1 : 0;
      const r = 1 - m * 0.55 - side * 0.35;
      const g = 1 - m * 0.28 - side * 0.35;
      const b = 1 - m * 0.7 - side * 0.4;
      col.set([r, g, b], o * 3);
    }
  }
  const idx = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function steppingStones(points, rnd) {
  return points.map(([x, z]) => stoneGeo(x, z, rnd));
}
