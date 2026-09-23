// Monster Blocks: chunky glossy vinyl cubes with rounded edges, big googly
// eyes (a white dome with a loose black pupil) and a happy open mouth.
import * as THREE from 'three';
import { roundedBox } from '../geometry.js';
import { vinylMaterial } from '../materials.js';
import { PartBatch, enemyMatrix, partMatrix, eyeOpen } from './common.js';

const M = new THREE.Matrix4();
const P = new THREE.Matrix4();
const MOUTH_RED = new THREE.Color('#5c0d1c');
const TONGUE = new THREE.Color('#ff6f8e');
const BLUSH = new THREE.Color('#ff7a9a');

function mouthGeometry() {
  // a "D" on its back: flat-ish top lip, round bottom
  const s = new THREE.Shape();
  const w = 0.2;
  s.moveTo(-w, 0.02);
  s.quadraticCurveTo(0, -0.02, w, 0.02);
  s.absarc(0, 0.02, w, 0, -Math.PI, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 16 });
  g.computeVertexNormals();
  return g;
}

export class BlocksStyle {
  constructor({ capacity = 160 } = {}) {
    this.group = new THREE.Group();
    const cap = capacity;
    this.body = new PartBatch(roundedBox(0.9, 0.9, 0.8, 0.2, 4), vinylMaterial({ roughness: 0.3, sss: 0.32 }), cap);
    this.white = new PartBatch(new THREE.SphereGeometry(0.19, 24, 16), vinylMaterial({ color: 0xffffff, roughness: 0.15, sss: 0.05, sheen: 0 }), cap * 2, { colors: false });
    this.pupil = new PartBatch(
      new THREE.SphereGeometry(0.1, 18, 12),
      new THREE.MeshPhysicalMaterial({ color: 0x0b0b12, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
      cap * 2,
      { colors: false },
    );
    this.glint = new PartBatch(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2) }), cap * 2, { colors: false });
    this.mouth = new PartBatch(mouthGeometry(), new THREE.MeshPhysicalMaterial({ color: MOUTH_RED, roughness: 0.35, clearcoat: 0.6 }), cap, { colors: false });
    this.tongue = new PartBatch(new THREE.SphereGeometry(0.1, 14, 10), vinylMaterial({ color: TONGUE, roughness: 0.4, sss: 0.2 }), cap, { colors: false });
    this.cheek = new PartBatch(
      new THREE.CircleGeometry(0.07, 16),
      new THREE.MeshBasicMaterial({ color: BLUSH, transparent: true, opacity: 0.45, depthWrite: false }),
      cap * 2,
      { colors: false },
    );
    this.parts = [this.body, this.white, this.pupil, this.glint, this.mouth, this.tongue, this.cheek];
    for (const p of this.parts) this.group.add(p.mesh);
  }

  draw(enemies) {
    for (const p of this.parts) p.begin();
    for (const e of enemies) {
      if (e.gone || e.scale <= 0.001) continue;
      enemyMatrix(e, M);
      this.body.push(M, e.color, e.hitFlash * 0.8);
      const open = eyeOpen(e);
      const big = 0.95 + (e.variant % 5) * 0.05;
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const ex = side * 0.2;
        const ey = 0.12;
        this.white.push(partMatrix(M, ex, ey, 0.37, big, big * open, big * 0.62, 0, P));
        if (open > 0.4) {
          const p = e.pupils[i];
          const r = 0.085 * big;
          const px = ex + p.x * r;
          const py = ey + p.y * r * open;
          this.pupil.push(partMatrix(M, px, py, 0.46, big, big * open, 0.45, 0, P));
          this.glint.push(partMatrix(M, px + 0.035, py + 0.04, 0.5, 1, 1, 0.5, 0, P));
        }
        this.cheek.push(partMatrix(M, side * 0.3, -0.1, 0.402, 1, 0.7, 1, 0, P));
      }
      // mouth opens wider when the toy is squashed
      const gape = 1 + Math.max(0, e.squash) * 1.5 + (e.dying ? 0.4 : 0);
      this.mouth.push(partMatrix(M, 0, -0.14, 0.37, 1, gape, 1, 0, P));
      this.tongue.push(partMatrix(M, 0, -0.26 - (gape - 1) * 0.08, 0.38, 0.9, 0.45, 0.4, 0, P));
    }
    for (const p of this.parts) p.end();
  }

  dispose() {
    for (const p of this.parts) p.dispose();
  }
}
