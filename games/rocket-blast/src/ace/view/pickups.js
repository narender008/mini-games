// Ace pickups: small spinning lit tokens, one InstancedMesh per kind, each
// with a coloured glow under it so it reads against any backdrop:
//   score   a gold faceted gem
//   shield  a cyan hexagonal medal
//   emp     a violet ring round a bright core
//   hull    a white repair cross on a red plate
// They bob, spin and blink in their last two seconds when the sim gives them
// a lifetime (`life`).
import * as THREE from 'three';
import { Builder, MAT, core, slab, ngon, GEO } from './kit.js';

const KINDS = {
  score: { color: [1, 0.78, 0.25], build: (b) => b.add(new THREE.OctahedronGeometry(0.22, 0), core('amber', 1.5, true), { s: [1, 1.3, 0.8] }) },
  shield: {
    color: [0.3, 0.9, 1.2],
    build: (b) => {
      b.add(slab(ngon(6, 0.3, Math.PI / 2), 0.08, 0.03), MAT.steel(true));
      b.add(slab(ngon(6, 0.2, Math.PI / 2), 0.14, 0.01), core('cyan', 3, true));
    },
  },
  emp: {
    color: [0.7, 0.4, 1.4],
    build: (b) => {
      b.add(GEO.torus, MAT.steel(true), { s: [0.55, 0.55, 1] });
      b.add(GEO.sphere, core('violet', 3.5, true), { s: 0.24 });
    },
  },
  hull: {
    color: [1.2, 0.35, 0.3],
    build: (b) => {
      b.add(slab(ngon(4, 0.32, Math.PI / 4), 0.08, 0.03), MAT.red(true));
      b.add(GEO.box, core('white', 2.5, true), { p: [0, 0, 0.05], s: [0.3, 0.09, 0.04] });
      b.add(GEO.box, core('white', 2.5, true), { p: [0, 0, 0.05], s: [0.09, 0.3, 0.04] });
    },
  },
};
const CAP = 48;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

export class Pickups {
  constructor(group) {
    this.kinds = {};
    for (const [id, def] of Object.entries(KINDS)) {
      const b = new Builder();
      def.build(b);
      const meshes = [];
      for (const mat of b.materials()) {
        const geo = b.geometry(mat);
        geo.setAttribute('aEmit', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4));
        const m = new THREE.InstancedMesh(geo, mat, CAP);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        m.count = 0;
        group.add(m);
        meshes.push(m);
      }
      this.kinds[id] = { meshes, color: def.color, n: 0 };
    }
  }

  update(list, t, bolts) {
    for (const k in this.kinds) this.kinds[k].n = 0;
    for (const p of list || []) {
      const K = this.kinds[p.kind] || this.kinds.score;
      if (K.n >= CAP) continue;
      const age = p.t ?? 0;
      // blink in the last two seconds of a limited life
      const left = p.life ? p.life - age : 9;
      if (left < 2 && Math.floor(t * 10) % 2) continue;
      const s = age < 0.2 ? age / 0.2 : 1;
      const bob = Math.sin(t * 3 + (p.id || 0)) * 0.06;
      tmpM.compose(tmpP.set(p.x, p.y + bob, 0.2), tmpQ.setFromEuler(tmpE.set(0.35 + 0.25 * Math.sin(t * 2 + (p.id || 0)), 0.45 * Math.sin(t * 2.6 + (p.id || 0)), t * 1.2)), tmpS.set(s, s, s));
      for (const m of K.meshes) m.setMatrixAt(K.n, tmpM);
      K.n++;
      const [r, g, b] = K.color;
      if (bolts) bolts.glow(p.x, p.y + bob, 0.6 * s, r * 0.35, g * 0.35, b * 0.35);
    }
    for (const k in this.kinds) {
      const K = this.kinds[k];
      for (const m of K.meshes) {
        m.count = K.n;
        m.visible = K.n > 0;
        m.instanceMatrix.needsUpdate = true;
      }
    }
  }

  colorOf(kind) {
    return (this.kinds[kind] || this.kinds.score).color;
  }
}
