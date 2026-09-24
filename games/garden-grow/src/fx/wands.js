// Big kid tools: the sun wand and the rain cloud. (First version: the API is
// in place; the visuals follow.)
export class Wands {
  constructor({ scene, quality }) {
    this.scene = scene;
    this.quality = quality;
    this.id = null;
    this.target = null;
    this.on = false;
    this.onWater = null;
    this.onSun = null;
  }

  set(id) {
    this.id = id;
  }

  aim(target) {
    this.target = target ? target.clone() : null;
  }

  active(on) {
    this.on = on;
  }

  update(dt) {
    if (!this.on || !this.target || !this.id) return;
    const { x, z } = this.target;
    if (this.id === 'sun' && this.onSun) this.onSun(x, z, dt);
    if (this.id === 'rain' && this.onWater) this.onWater(x, z, dt);
  }
}
