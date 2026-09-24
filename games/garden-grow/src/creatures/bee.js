// Bees (placeholder while the real model is built).
import * as THREE from 'three';
export const BEE_KINDS = { bumblebee: {}, honeybee: {} };
export class Bee {
  constructor(kind, host) {
    this.kind = kind;
    this.host = host;
    this.object = new THREE.Group();
    this.pos = this.object.position;
    this.dead = true;
  }
  enter() {}
  update() {}
  leave() {}
  portrait() {
    return null;
  }
}
