// Fireflies (placeholder while the real swarm is built).
import * as THREE from 'three';
export class Fireflies {
  constructor(host) {
    this.host = host;
    this.object = new THREE.Group();
    this.count = 0;
  }
  spawn() {
    return null;
  }
  leaveAll() {}
  clear() {}
  update() {}
  pick() {
    return null;
  }
  poke() {}
  portrait() {
    return null;
  }
}
