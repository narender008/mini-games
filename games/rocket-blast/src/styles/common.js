// Shared parts for the enemy styles. Each style draws every enemy with a few
// instanced meshes (body, eyes, pupils, mouth...), so a screen full of toys
// costs only a handful of draw calls.
import * as THREE from 'three';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

// One instanced mesh that is refilled every frame.
export class PartBatch {
  constructor(geometry, material, capacity, { shadow = false, colors = true } = {}) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colors) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow;
    this.capacity = capacity;
    this.n = 0;
  }

  begin() {
    this.n = 0;
  }

  // matrix: world matrix; color: THREE.Color or null; brighten: extra light
  push(matrix, color, brighten = 0) {
    if (this.n >= this.capacity) return;
    this.mesh.setMatrixAt(this.n, matrix);
    if (this.mesh.instanceColor) {
      if (color) tmpC.copy(color);
      else tmpC.setRGB(1, 1, 1);
      if (brighten) tmpC.lerp(WHITE, Math.min(1, brighten)).multiplyScalar(1 + brighten * 1.5);
      this.mesh.setColorAt(this.n, tmpC);
    }
    this.n++;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }
}

const WHITE = new THREE.Color(1, 1, 1);

// The enemy's own world matrix: position, gentle tilt, pop-in scale and the
// jelly squash (volume-preserving: wider when flatter).
export function enemyMatrix(e, out = new THREE.Matrix4()) {
  const s = e.scale * e.size;
  const q = e.squash; // >0 flattens, <0 stretches
  const sy = 1 - q;
  const sx = 1 / Math.sqrt(Math.max(0.2, sy));
  tmpE.set(e.tiltX, e.tiltY, e.tilt);
  tmpQ.setFromEuler(tmpE);
  tmpS.set(s * sx, s * sy, s * sx);
  tmpP.set(e.x, e.y, e.z);
  return out.compose(tmpP, tmpQ, tmpS);
}

// Compose a part's local transform onto its parent's world matrix.
export function partMatrix(parent, x, y, z, sx, sy, sz, rz = 0, out = tmpM, rx = 0, ry = 0) {
  tmpE.set(rx, ry, rz);
  tmpQ.setFromEuler(tmpE);
  tmpS.set(sx, sy, sz);
  tmpP.set(x, y, z);
  out.compose(tmpP, tmpQ, tmpS);
  return out.premultiply(parent);
}

// How open an enemy's eyes are (blinks, and screwed shut while squashed).
export function eyeOpen(e) {
  const blink = e.blink < 0.12 ? Math.abs(e.blink - 0.06) / 0.06 : 1;
  const squint = e.hitFlash > 0.2 || e.dying ? 0.15 : 1;
  return Math.max(0.08, Math.min(blink, squint));
}
