// Log-roll edging round the cottage bed: peeled softwood logs about 6 cm
// across, driven in side by side so 8-10 cm shows above the lawn, following
// the bed's ellipse. Tops are sawn end grain, weathered silver; each log
// leans and sits a little differently, as a real roll does once it settles.
import * as THREE from 'three';
import { GRAIN, lathe, merge } from './geom.js';

// One log: radius r, `above` metres showing, `below` buried. UVs: long grain
// up the side, end grain (pith centred) on the sawn top.
function logGeo(r, above, below, rnd) {
  const prof = [
    [r * 0.97, -below],
    [r, -below + 0.02],
    [r * (1 + (rnd() - 0.5) * 0.04), above * 0.5],
    [r, above - 0.006],
    [r - 0.0025, above - 0.0012],
    [r - 0.007, above],
    [0, above + 0.0005],
  ];
  const seg = 11;
  const g = lathe(prof, seg, {
    wobble: (a) => r * 0.035 * Math.sin(a * 2 + r * 900) + r * 0.02 * Math.sin(a * 3 + 1.3),
  });
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  const offU = rnd();
  const span = GRAIN.v1 - GRAIN.v0;
  const offV = rnd() * (span - ((Math.PI * 2 * r) / GRAIN.across) * span);
  const po = [(rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.04];
  // each log weathered its own way: some greyer, some browner
  const grey = rnd();
  const tone = 0.86 + rnd() * 0.22;
  const tint = [tone * (1 - grey * 0.06), tone * (1 - grey * 0.02), tone * (1 + grey * 0.05)];
  const cols = seg + 1;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (row >= 4) {
      // sawn top: end grain, pith in the middle
      uv.setXY(i, 0.5 + po[0] + x / GRAIN.endSize, (0.5 + po[1] + z / GRAIN.endSize) * GRAIN.v0);
    } else {
      uv.setXY(i, y / GRAIN.len + offU, GRAIN.v0 + offV + ((col / seg) * Math.PI * 2 * r * span) / GRAIN.across);
    }
    // darker where the log meets the ground, lighter on the weathered top
    const k = row >= 4 ? 1.02 : 0.55 + 0.45 * Math.min(1, Math.max(0, (y + 0.005) / 0.05));
    c[i * 3] = k * tint[0];
    c[i * 3 + 1] = k * tint[1];
    c[i * 3 + 2] = k * tint[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// Builds the edging round an ellipse zone. Returns { geo, perches }.
export function logRollEdging(zone, rnd) {
  const R = 0.031;
  const rx = zone.rx + R * 0.72;
  const rz = zone.rz + R * 0.72;
  // arc-length table so the logs sit evenly round the curve
  const N = 1440;
  const len = new Float32Array(N + 1);
  let px = rx;
  let pz = 0;
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const x = Math.cos(t) * rx;
    const z = Math.sin(t) * rz;
    len[i] = len[i - 1] + Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
  }
  const total = len[N];
  const count = Math.floor(total / (R * 2 + 0.0012));
  const step = total / count;
  const parts = [];
  const perches = [];
  let j = 0;
  const start = rnd() * step;
  for (let k = 0; k < count; k++) {
    const s = start + k * step;
    while (j < N && len[j + 1] < s) j++;
    const f = (s - len[j]) / Math.max(1e-9, len[j + 1] - len[j]);
    const t = ((j + f) / N) * Math.PI * 2;
    const x = zone.cx + Math.cos(t) * rx;
    const z = zone.cz + Math.sin(t) * rz;
    // outward normal of the ellipse
    const nx = Math.cos(t) / rx;
    const nz = Math.sin(t) / rz;
    const nl = Math.hypot(nx, nz);
    const r = R * (0.88 + rnd() * 0.18);
    const above = 0.082 + rnd() * 0.022;
    const g = logGeo(r, above, 0.05, rnd);
    // lean a touch outward (the soil pushes) and a little at random
    const lean = 0.02 + rnd() * 0.03;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((nz / nl) * lean + (rnd() - 0.5) * 0.03, rnd() * Math.PI * 2, -(nx / nl) * lean + (rnd() - 0.5) * 0.03, 'XZY')),
      new THREE.Vector3(1, 1, 1),
    );
    g.applyMatrix4(m);
    parts.push(g);
    if (k % 9 === 4) perches.push({ pos: new THREE.Vector3(x, above - 0.002, z), normal: new THREE.Vector3(0, 1, 0) });
  }
  return { geo: merge(parts), perches };
}
