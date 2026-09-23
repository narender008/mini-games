// Big Kid power-ups: glossy glass orbs with a glowing symbol inside that
// float gently down. Fly into one or shoot it to collect it.
//   rapid   faster shots         triple  three-way shots
//   bomb    blasts every toy     double  double points
import * as THREE from 'three';
import { SPRITE } from './textures.js';
import { rand, pick } from './config.js';

export const POWERS = {
  rapid: { frame: SPRITE.BOLT, color: new THREE.Color('#ffd21a'), time: 10, name: 'Zoom zap!' },
  triple: { frame: SPRITE.TRIPLE, color: new THREE.Color('#3fd0ff'), time: 10, name: 'Triple shot!' },
  bomb: { frame: SPRITE.BOMB, color: new THREE.Color('#ff5a5a'), time: 0, name: 'Big boom!' },
  double: { frame: SPRITE.X2, color: new THREE.Color('#b56bff'), time: 12, name: 'Double points!' },
};

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpE = new THREE.Euler();

export class PowerUps {
  constructor({ scene, glow }) {
    this.glow = glow;
    this.items = [];
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      transparent: true,
      opacity: 0.55,
      iridescence: 0.6,
      iridescenceIOR: 1.5,
      envMapIntensity: 1.8,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.62, 32, 20), mat, 12);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(36), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 7;
    scene.add(this.mesh);
  }

  spawn(x, y, kind = pick(Object.keys(POWERS))) {
    if (this.items.length >= 6) return;
    this.items.push({ kind, x, y, vy: -1.1, phase: rand(0, 6.28), age: 0, spin: rand(-1, 1) });
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }

  // collect(kind, x, y) is called for each orb the rocket or a shot reaches
  update(dt, t, { rocket, shots, bottom, collect }) {
    let n = 0;
    for (const p of this.items) {
      p.age += dt;
      p.y += p.vy * dt;
      const x = p.x + Math.sin(t * 1.6 + p.phase) * 0.6;
      const got = Math.hypot(rocket.pos.x - x, rocket.pos.y + 0.2 - p.y) < 1.5 || (shots && shots(x, p.y, 0.8));
      if (got) {
        collect(p.kind, x, p.y);
        continue;
      }
      if (p.y < bottom - 1) continue;
      const pw = POWERS[p.kind];
      const pulse = 1 + Math.sin(t * 5 + p.phase) * 0.05;
      tmpE.set(0, t * p.spin, 0);
      tmpQ.setFromEuler(tmpE);
      tmpS.setScalar(pulse * Math.min(1, p.age * 4));
      tmpP.set(x, p.y, 0.3);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(n, tmpM);
      this.mesh.setColorAt(n, pw.color);
      this.items[n++] = p;
      const c = pw.color;
      this.glow.add({ x, y: p.y, z: 0.2, size: 2.4 * pulse, life: 0, frame: SPRITE.GLOW, r: c.r * 0.9, g: c.g * 0.9, b: c.b * 0.9, a: 0.8 });
      this.glow.add({ x, y: p.y, z: 1.0, size: 0.8, life: 0, frame: pw.frame, rot: Math.sin(t * 2 + p.phase) * 0.2, r: 2.4, g: 2.4, b: 2.4, a: 1 });
      if (Math.random() < 0.2) this.glow.add({ x: x + rand(-0.5, 0.5), y: p.y + rand(-0.5, 0.5), z: 1, vy: 0.4, size: rand(0.2, 0.35), life: 0.6, frame: SPRITE.SPARKLE, r: 2, g: 2, b: 2, twinkle: 20 });
    }
    this.items.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
