// Ladybird (placeholder while the real model is built).
import * as THREE from 'three';
export class Ladybird {
  constructor(host) {
    this.kind = 'ladybird';
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
