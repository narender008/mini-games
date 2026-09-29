// Dappled sunlight under trees, done the way it happens: leaves overhead.
// A hundred or so ragged leaf-clusters hang a few metres above the lane and
// cast their shadows through the sun's shadow map onto the ground, the moss,
// the ferns and the tanks, leaving bright patches between them. The clusters
// themselves draw nothing (no colour, no depth): only their shadows show.
// They are placed by where their shadows must land, keeping the tanks' spots
// in the sun, and drift a little all together, as if the canopy stirred.
import * as THREE from 'three';
import { rng } from '../config.js';

export class Canopy {
  // sun: unit vector towards the sun; area: [x0, x1, z0, z1] of ground to dapple;
  // clear: [{ x, z, r }] spots that stay sunlit; amount: 0..1 of the ground in shade
  constructor({ sun, area = [-3, 3, -2.0, 1.7], clear = [], amount = 0.5, height = 3.2, size = [0.13, 0.32], seed = 12, count = 0 }) {
    const R = rng(seed);
    const [x0, x1, z0, z1] = area;
    const rMean = (size[0] + size[1]) / 2;
    const n = count || Math.round(((x1 - x0) * (z1 - z0) * amount) / (Math.PI * rMean * rMean * 0.62));
    // a ragged little disc: a leaf cluster's outline
    const SIDES = 11;
    const pos = [0, 0, 0];
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      const r = 0.7 + R() * 0.3;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    const idx = [];
    for (let i = 0; i < SIDES; i++) idx.push(0, 1 + i, 1 + ((i + 1) % SIDES));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const t = height / Math.max(0.2, sun.y);
    let k = 0;
    let guard = 0;
    while (k < n && guard++ < n * 30) {
      const gx = x0 + R() * (x1 - x0);
      const gz = z0 + R() * (z1 - z0);
      const r = size[0] + (size[1] - size[0]) * Math.pow(R(), 1.4);
      let ok = true;
      for (const c of clear) if (Math.hypot(gx - c.x, gz - c.z) < c.r + r * 1.2) ok = false;
      if (!ok) continue;
      // the shadow falls at (gx, gz): hang the cluster up the sun's ray from there
      const h = t * (0.85 + R() * 0.3);
      p.set(gx + sun.x * h, sun.y * h, gz + sun.z * h);
      e.set((R() - 0.5) * 0.4, R() * 6.283, (R() - 0.5) * 0.4);
      q.setFromEuler(e);
      s.set(r, 1, r * (0.7 + R() * 0.5));
      m.compose(p, q, s);
      this.mesh.setMatrixAt(k++, m);
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'canopy-shadows';
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.count = k;
  }

  // the canopy stirs: everything slides a few centimetres together
  update(dt, time, world) {
    const w = 1 + Math.abs(world.wind ?? 0) * 2;
    this.group.position.set(Math.sin(time * 0.31) * 0.03 * w + Math.sin(time * 0.83 + 1) * 0.008, 0, Math.cos(time * 0.23 + 2) * 0.02 * w);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose?.();
  }
}
