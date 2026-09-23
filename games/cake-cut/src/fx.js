// Small things that fly: crumbs from the cut, confetti for the birthday
// moment, smoke wisps from blown-out candles and sparkles from the sword.
import * as THREE from 'three';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();

// An irregular lump: an icosahedron with its corners pulled about.
function lumpGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.7 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.6;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

// Crumbs fall under gravity, bounce a little and come to rest on whatever
// is below: the board, the stand, a plate or the cloth.
export class Crumbs {
  constructor(max, supportAt) {
    this.max = max;
    this.supportAt = supportAt;
    this.mesh = new THREE.InstancedMesh(lumpGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.9 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.items = [];
    this.next = 0;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, white);
  }

  spawn(pos, vel, colour, size = 0.0015, { rest = null, life = Infinity } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const item = {
      p: pos.clone(),
      v: vel.clone(),
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30),
      size: size * (0.6 + Math.random() * 0.8),
      resting: false,
      rest,
      life,
      age: 0,
    };
    this.items[i] = item;
    this.mesh.setColorAt(i, colour.clone().multiplyScalar(0.8 + Math.random() * 0.35));
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
    this.next = 0;
  }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.items.length; i++) {
      const c = this.items[i];
      if (!c) continue;
      c.age += dt;
      let scale = c.size;
      if (c.age > c.life) scale *= Math.max(0, 1 - (c.age - c.life) / 0.6);
      if (!c.resting) {
        c.v.y -= 9.8 * dt;
        c.v.multiplyScalar(Math.exp(-dt * 1.5));
        c.p.addScaledVector(c.v, dt);
        c.rot.x += c.spin.x * dt;
        c.rot.y += c.spin.y * dt;
        c.rot.z += c.spin.z * dt;
        const floor = (c.rest ?? this.supportAt(c.p.x, c.p.z)) + c.size * 0.5;
        if (c.p.y < floor) {
          c.p.y = floor;
          if (Math.abs(c.v.y) > 0.25) {
            c.v.y *= -0.25;
            c.v.x *= 0.5;
            c.v.z *= 0.5;
            c.spin.multiplyScalar(0.4);
          } else {
            c.resting = true;
            c.v.set(0, 0, 0);
          }
        }
      }
      tmpE.copy(c.rot);
      tmpQ.setFromEuler(tmpE);
      tmpS.setScalar(scale);
      tmpM.compose(c.p, tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
      dirty = true;
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
