// The garden's surroundings in one place: sky and light (sky.js), the ground
// with its soil, wetness and grass (ground.js), and the props and backdrop
// of the chosen garden style (props.js).
import { Atmosphere } from './sky.js';
import { Ground } from './ground.js';
import { buildProps } from './props.js';
import { LAYOUTS } from '../layout.js';

export class Environment {
  constructor({ renderer, scene, quality }) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.atmosphere = new Atmosphere({ renderer, scene, quality });
    scene.add(this.atmosphere.group);
    this.ground = new Ground({ renderer, scene, quality });
    scene.add(this.ground.group);
    this.propsByStyle = {};
    this.props = null;
    this.layout = null;
    this.styleId = null;
  }

  get state() {
    return this.atmosphere.state;
  }

  get sun() {
    return this.atmosphere.sun;
  }

  get pickMeshes() {
    return this.ground.pickMeshes;
  }

  setStyle(id) {
    if (id === this.styleId) return;
    this.styleId = id;
    this.layout = LAYOUTS[id];
    this.ground.build(this.layout);
    if (this.props) this.scene.remove(this.props.group);
    // props are kept per style, so switching back is instant
    this.props = this.propsByStyle[id] ??= buildProps(this.layout, { renderer: this.renderer, quality: this.quality });
    this.scene.add(this.props.group);
  }

  setTime(id, seconds) {
    this.atmosphere.setTime(id, seconds);
  }

  setOvercast(v, seconds) {
    this.atmosphere.setOvercast(v, seconds);
  }

  heightAt(x, z) {
    return this.ground.heightAt(x, z);
  }

  zoneAt(x, z) {
    return this.ground.zoneAt(x, z);
  }

  wet(x, z, radius, amount) {
    this.ground.wet(x, z, radius, amount);
  }

  wetAll(amount) {
    this.ground.wetAll(amount);
  }

  wetness(x, z) {
    return this.ground.wetness(x, z);
  }

  dig(x, z) {
    this.ground.dig(x, z);
  }

  update(dt, t, camera, { night, rain }) {
    this.atmosphere.update(dt, t, camera);
    const s = this.atmosphere.state;
    this.ground.setLight?.({ sunDir: s.sunDir, sunColor: s.sunColor, night: s.night });
    this.ground.update(dt, t, { night, rain });
    this.props?.update?.(dt, t, { night });
  }
}
