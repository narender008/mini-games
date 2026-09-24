// Builds a whole leaf (simple or compound) as one geometry: the stalk and
// rachis as a thin tube along an arching spine, and leaflet cards along it.
// It is built twice, as a folded bud (base) and fully open (morph target),
// so one instanced mesh can hold every leaf of a plant, each unfolding at
// its own pace. Leaves grow from the origin along +y, arching towards +z.
import * as THREE from 'three';
import { lerp } from '../../config.js';
import { leafGrid, staticTube, mergeGeometries, setPlantAttr, makeRelative } from './geom.js';

const pair = (v, k) => (Array.isArray(v) ? lerp(v[0], v[1], k) : v);
const X = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

// spine: { length, folded: 0.7 (length fraction when folded), seg,
//   arch(s, open) -> heading from vertical towards +z, radius(s), radial,
//   uv: stalk strip rect, thick }
// leaflets: [{ s, side: -1|0|1, size, width, uv, grid: [nu, nv], and pairs
//   [folded, open] (or plain numbers) for: phi (angle off the rachis), psi
//   (edge tilt), crease (fold along the midrib), droop, cup, level (0 follow
//   the rachis, 1 held level), lift (angle above level), stalk (petiolule),
//   shape (optional (u, v, o) extra offset along Nc in metres) }]
// flexLen: metres along the leaf that bend like the tip of a 40 cm stem.
export function buildLeaf({ spine, leaflets, flexLen = 0.4 }) {
  const seg = spine.seg ?? 12;
  const makeSpine = (open) => {
    const L = spine.length * lerp(spine.folded ?? 0.7, 1, open);
    const pts = [];
    const tan = [];
    let y = 0;
    let z = 0;
    const ds = L / seg;
    for (let i = 0; i <= seg; i++) {
      const s = i / seg;
      const th = spine.arch(s, open);
      if (i > 0) {
        const thm = spine.arch((i - 0.5) / seg, open);
        y += Math.cos(thm) * ds;
        z += Math.sin(thm) * ds;
      }
      pts.push(new THREE.Vector3(0, y, z));
      tan.push(new THREE.Vector3(0, Math.cos(th), Math.sin(th)));
    }
    return { pts, tan, L };
  };
  const sample = (sp, s) => {
    const f = Math.min(seg - 1e-6, s * seg);
    const i = Math.floor(f);
    const k = f - i;
    return { p: sp.pts[i].clone().lerp(sp.pts[i + 1], k), t: sp.tan[i].clone().lerp(sp.tan[i + 1], k).normalize() };
  };
  const folded = makeSpine(0);
  const open = makeSpine(1);
  const flex = (m) => (m / flexLen) * (m / flexLen);
  const parts = [];
  if (spine.radius) parts.push(staticTube(folded.pts, spine.radius, spine.radial ?? 4, spine.uv, open.pts, flex, spine.thick ?? 0.4));

  const card = (lf, k, sp) => {
    const { p, t } = sample(sp, lf.s);
    let U = new THREE.Vector3(0, t.z, -t.y); // upper (adaxial) side of the rachis
    const phi = lf.side === 0 ? 0 : pair(lf.phi ?? [0.2, 0.9], k);
    let D = t.clone().multiplyScalar(Math.cos(phi)).addScaledVector(X, Math.sin(phi) * (lf.side || 0)).normalize();
    const level = pair(lf.level ?? 0, k);
    if (level > 0) {
      // held out level (like a pumpkin leaf on its stalk), lifted a little
      const flat = new THREE.Vector3(D.x, 0, D.z);
      if (flat.lengthSq() < 1e-8) flat.set(0, 0, 1);
      flat.normalize();
      const lift = pair(lf.lift ?? 0, k);
      flat.multiplyScalar(Math.cos(lift)).addScaledVector(UP, Math.sin(lift));
      D.lerp(flat, level).normalize();
      U.lerp(UP, level);
    }
    const W = new THREE.Vector3().crossVectors(D, U).normalize();
    const Nc = new THREE.Vector3().crossVectors(W, D).normalize();
    const psi = (lf.side || 1) * pair(lf.psi ?? 0, k);
    W.applyAxisAngle(D, psi);
    Nc.applyAxisAngle(D, psi);
    const L = lf.size * lerp(lf.foldScale ?? 0.75, 1, k);
    const Wd = (lf.width ?? lf.size * 0.6) * lerp(lf.foldWidth ?? 0.6, 1, k);
    const crease = pair(lf.crease ?? [1.1, 0.15], k);
    const droop = pair(lf.droop ?? [-0.1, 0.15], k);
    const cup = pair(lf.cup ?? 0, k);
    const stalk = pair(lf.stalk ?? 0, k);
    const base = p.clone().addScaledVector(D, stalk);
    const tmp = new THREE.Vector3();
    return (u, v, o) => {
      const x = (u - 0.5) * Wd;
      const ax = Math.abs(x) / (Wd * 0.5 || 1);
      let n = Math.abs(x) * Math.sin(crease) + cup * ax * ax * Wd * 0.5 - droop * L * v * v;
      if (lf.shape) n += lf.shape(u, v, k);
      o.copy(base)
        .addScaledVector(D, v * L)
        .addScaledVector(W, x * Math.cos(crease))
        .addScaledVector(Nc, n);
      void tmp;
    };
  };
  const tips = [];
  for (const lf of leaflets) {
    const [nu, nv] = lf.grid ?? [2, 4];
    const g = leafGrid(nu, nv, card(lf, 0, folded), card(lf, 1, open), lf.uv);
    const at = lf.s * spine.length + (pair(lf.stalk ?? 0, 1) || 0);
    const v0 = lf.uv[1];
    const v1 = lf.uv[3];
    setPlantAttr(g, (x, y, z, u, v) => [flex(at + ((v - v0) / (v1 - v0)) * lf.size), 0]);
    parts.push(g);
    // where the leaflet tip ends up when open (landing spot for visitors)
    const f = card(lf, 1, open);
    const tip = new THREE.Vector3();
    f(0.5, 0.85, tip);
    tips.push(tip);
  }
  const geo = makeRelative(mergeGeometries(parts));
  geo.computeBoundingSphere();
  return { geo, tips, spine: open };
}
