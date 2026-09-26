// Big kid: pearly shells to find, bobbing on the water in the corners of
// each place (by islands, along shores, under bridges), each with a slow
// twinkle so it can be spotted from afar. Drive over one to collect it; when
// every shell in a place has been found, a new set appears. The number found
// is kept on the device.
import * as THREE from 'three';
import { load, save, rng, TAU } from './config.js';

const COUNT = 12;
const REACH = 3.2; // metres

// A scallop: a fan of ribs rising from a hinge, with little ears.
function scallopGeometry() {
  const seg = 40;
  const rings = 10;
  const pos = [];
  const idx = [];
  for (let j = 0; j <= rings; j++) {
    const r = j / rings;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg - 0.5) * 2.3;
      const rib = Math.cos((i / seg) * Math.PI * 18) * 0.035 * r;
      const R = r * (0.32 + rib * 0.2);
      const x = Math.sin(a) * R;
      const z = -Math.cos(a) * R * 0.95 + 0.14;
      const y = (0.09 + rib) * Math.sin(r * Math.PI * 0.85) * (1 - Math.abs(a) / 2.6);
      pos.push(x, y, z);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Shells {
  constructor({ scene }) {
    this.group = new THREE.Group();
    this.group.name = 'shells';
    this.group.visible = false;
    scene.add(this.group);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xf6d6c4,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      iridescence: 0.7,
      iridescenceIOR: 1.6,
      sheen: 0.4,
      sheenColor: new THREE.Color(0xffe7f0),
      emissive: 0xffc9a8,
      emissiveIntensity: 0.12,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(scallopGeometry(), mat, COUNT);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
    this.items = [];
    this.total = load('shells', 0);
    this.found = 0;
    this.onCollect = () => {};
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  // Scatter a fresh set through the place: near shores but in open water.
  scatter(land, area, seed = 1) {
    const r = rng(seed * 977 + (this.round = (this.round || 0) + 1));
    this.items = [];
    let tries = 0;
    while (this.items.length < COUNT && tries++ < 4000) {
      const x = area.minX + 30 + r() * (area.maxX - area.minX - 60);
      const z = area.minZ + 30 + r() * (area.maxZ - area.minZ - 60);
      const d = land.distance(x, z);
      if (d < 5 || d > 45) continue;
      if (this.items.some((s) => Math.hypot(s.x - x, s.z - z) < 45)) continue;
      this.items.push({ x, z, live: true, phase: r() * TAU, pop: 0 });
    }
    this.mesh.count = this.items.length;
  }

  setVisible(v) {
    this.group.visible = v;
  }

  update(dt, time, boat, heightAt) {
    if (!this.group.visible) return;
    let live = 0;
    this.items.forEach((s, i) => {
      let scale = 1;
      if (!s.live) {
        s.pop += dt * 3;
        scale = Math.max(0.001, 1 - s.pop) * (1 + s.pop * 0.8);
      } else {
        live++;
        if (Math.hypot(boat.pos.x - s.x, boat.pos.z - s.z) < REACH && boat.pos.y < 1.2) {
          s.live = false;
          this.found++;
          this.total++;
          save('shells', this.total);
          this.onCollect(s, this.found);
        }
      }
      const y = heightAt(s.x, s.z) + 0.05 + (s.live ? Math.sin(time * 2 + s.phase) * 0.04 : s.pop * 1.2);
      this._e.set(Math.sin(time * 1.3 + s.phase) * 0.12, time * 0.4 + s.phase, Math.cos(time * 1.1 + s.phase) * 0.12, 'YXZ');
      this._q.setFromEuler(this._e);
      this._p.set(s.x, y, s.z);
      // a touch larger than life so a child can spot it from the boat
      this._s.setScalar(scale * 1.6);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    return live;
  }
}
