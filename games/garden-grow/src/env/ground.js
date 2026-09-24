// The ground of the garden: soil in every planting zone (soil.js), the lawn
// with its grass (grass.js), or the gravel patch and wooden deck of the
// other styles (surfaces.js), all sharing one wet map (wetmap.js) so water
// darkens whatever it lands on and dries slowly.
import * as THREE from 'three';
import { WetMap } from './wetmap.js';
import { Soil } from './soil.js';
import { Lawn } from './grass.js';
import { LawnBits } from './lawnbits.js';
import { lawnMap } from './lawnmaps.js';
import { Gravel, Deck } from './surfaces.js';

export class Ground {
  constructor({ renderer, scene, quality }) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'ground';
    this.wetMap = new WetMap();
    this.soil = new Soil({ renderer, quality, wet: this.wetMap });
    this.group.add(this.soil.group);
    this.lawn = null;
    this.bits = null;
    this.gravel = null;
    this.deck = null;
    this.pickMeshes = [];
    this.layout = null;
    this.density = quality.grass ?? 1;
  }

  build(layout) {
    this.layout = layout;
    this.wetMap.clear();
    this.soil.build(layout);
    const q = this.quality;
    const shared = this.wetMap.uniforms;
    const surfaces = [];
    if (layout.ground === 'lawn') {
      this.lawn ??= new Lawn({ quality: q, uniforms: shared, lawnMap: lawnMap(this.renderer, q.tier === 'low' ? 512 : 1024), soilMaps: this.soil.maps });
      this.lawn.build(layout, this.renderer);
      this.lawn.setDensity(this.density);
      this.group.add(this.lawn.group);
      this.bits ??= new LawnBits({ quality: q, uniforms: shared });
      this.bits.build(layout);
      this.group.add(this.bits.group);
      surfaces.push(this.lawn.ground);
    } else {
      this.lawn?.clear();
      this.bits?.clear();
    }
    if (layout.gravel) {
      this.gravel ??= new Gravel({ renderer: this.renderer, quality: q, uniforms: shared, soilMaps: this.soil.maps });
      this.gravel.build(layout);
      this.group.add(this.gravel.group);
      surfaces.unshift(this.gravel.surface);
    } else this.gravel?.clear();
    if (layout.ground === 'deck') {
      this.deck ??= new Deck({ quality: q, uniforms: shared });
      this.deck.build(layout);
      this.group.add(this.deck.group);
      surfaces.push(this.deck.surface);
    } else this.deck?.clear();
    this.pickMeshes = [...this.soil.pickMeshes, ...surfaces.filter(Boolean)];
  }

  // Surface height under (x, z): soil (with any dug holes) or 0.
  heightAt(x, z) {
    return this.soil.heightAt(x, z) ?? 0;
  }

  zoneAt(x, z) {
    return this.soil.zoneAt(x, z);
  }

  wet(x, z, radius, amount) {
    this.wetMap.paint(x, z, radius, amount);
  }

  wetAll(amount) {
    this.wetMap.paintAll(amount);
  }

  wetness(x, z) {
    return this.wetMap.at(x, z);
  }

  dig(x, z) {
    this.soil.dig(x, z);
  }

  setDensity(k) {
    this.density = k;
    this.lawn?.setDensity(k);
    this.bits?.setDensity(k);
  }

  update(dt, t, { rain = 0 } = {}) {
    this.wetMap.update(dt, rain);
    this.soil.update(dt);
  }

  dispose() {
    this.soil.dispose();
    this.lawn?.dispose();
    this.bits?.dispose();
    this.gravel?.dispose();
    this.deck?.dispose();
    this.wetMap.dispose();
  }
}
