// Placeholder for the garden birds (robin, blue tit, goldfinch). The birds
// helper replaces this file; until then birds simply never arrive.
import * as THREE from 'three';

export class Birds {
  constructor({ scene, quality } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.kinds = ['robin', 'blue-tit', 'goldfinch'];
    this.onArrive = null;
    this.onChirp = null;
  }

  spawn() {}

  count() {
    return 0;
  }

  leaveAll() {}

  clear() {}

  update() {}

  pick() {
    return null;
  }

  poke() {}

  model() {
    return new THREE.Group();
  }
}
