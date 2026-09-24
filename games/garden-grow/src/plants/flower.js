// The base every flower builds on: three meshes rebuilt as the plant grows
// (foliage, bloom, soil) with a deferred, budgeted rebuild, the tap wobble,
// landing spots for visitors, and the snip that frees a cut flower.
import * as THREE from 'three';
import { windSway } from '../shared.js';
import { REDUCED_MOTION } from '../config.js';
import { Builder, Wobble } from './common.js';
import { soilMaterial } from './soilcover.js';

const _w2 = new THREE.Vector2();
const _tv = new THREE.Vector3();
const _tn = new THREE.Matrix3();

// What every flower shares: three rebuilt meshes (foliage, bloom, soil), a
// deferred rebuild as growth changes, the tap wobble, landing spots, the
// snip. A species subclass implements build(g) (filling this.fol, this.blo
// and this.soi and calling this.spot(...) for landing spots) and sets
// this.height / this.spread as it grows. `cut` builds a picked stem instead.
export class FlowerBase {
  constructor({ seed = 1, color = '#ffffff', quality = null, cut = false } = {}, { foliage, bloom, height = 0.4, stiffness = 1, bloomRadius = 0 }) {
    this.seed = seed;
    this.color = color;
    this.quality = quality;
    this.cut = cut;
    this.maxHeight = height;
    this.object = new THREE.Group();
    this.body = new THREE.Group();
    this.object.add(this.body);
    this.fol = new Builder(600);
    this.blo = new Builder(400);
    this.soi = new Builder(200);
    const stiff = cut ? 0 : stiffness;
    const flex = (x, y, z) => stiff * (Math.max(0, y) * Math.max(0, y) * 6.25 + (x * x + z * z) * 6);
    this.fol.flexFn = flex;
    this.blo.flexFn = flex;
    const sphere = new THREE.Sphere(new THREE.Vector3(0, height * 0.5, 0), height * 0.9 + 0.1);
    const mk = (b, mat, parent) => {
      const m = new THREE.Mesh(b.geometry, mat);
      b.geometry.boundingSphere = sphere;
      m.castShadow = true;
      m.receiveShadow = true;
      m.visible = false;
      parent.add(m);
      return m;
    };
    this.folMesh = mk(this.fol, foliage, this.body);
    this.bloMesh = mk(this.blo, bloom, this.body);
    if (bloomRadius) {
      // the bloom is built in its own frame and placed by its matrix
      this.blo.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, bloomRadius * 0.4, 0), bloomRadius);
      this.bloMesh.matrixAutoUpdate = false;
    }
    this.flexFn = flex;
    this.soiMesh = mk(this.soi, soilMaterial(), this.object);
    this.soiMesh.castShadow = false;
    this.keys = [NaN, NaN, NaN];
    this.target = 0;
    this.shown = -1;
    this.capG = 1;
    this.height = 0.02;
    this.spread = 0.03;
    this.wob = new Wobble();
    this.snip = null;
    this.spots = [];
    this.nSpots = 0;
    this.outs = [];
  }

  get hitHeight() {
    return Math.max(0.09, this.height + 0.04);
  }

  get hitRadius() {
    return Math.max(0.07, this.spread * 0.75);
  }

  setGrowth(g) {
    if (g <= this.capG + 1e-3) this.capG = 1;
    g = Math.min(g, this.capG);
    if (this.snip) g = Math.max(g, this.target);
    if (g === this.target && this.shown >= 0) return;
    this.target = g;
    // big jumps (a fresh plant, a debug scrub) show at once; the small steps
    // of steady growth wait for Plants.update's rebuild budget
    if (this.shown < 0 || Math.abs(g - this.shown) > 0.03) this.flush();
  }

  pending() {
    return this.target !== this.shown;
  }

  flush() {
    const g = this.target;
    this.shown = g;
    this.nSpots = 0;
    this.build(g);
  }

  // Rebuild helper: only rebuild a part whose state key changed.
  part(i, key, builder, mesh, fn) {
    if (this.keys[i] === key) return;
    this.keys[i] = key;
    builder.reset();
    fn(builder);
    builder.commit();
    mesh.visible = builder.ni > 0;
  }

  // Put the bloom (built in its own frame) at M and refresh its sway.
  placeBloom(M) {
    this.bloMesh.matrix.copy(M);
    this.bloMesh.matrixWorldNeedsUpdate = true;
    this.blo.reflex(M);
  }

  // Record a landing spot (plant-local position and normal).
  spot(kind, p, n, color, flex) {
    let s = this.spots[this.nSpots];
    if (!s) {
      s = this.spots[this.nSpots] = { kind, p: new THREE.Vector3(), n: new THREE.Vector3(), color, flex: 0 };
      this.outs[this.nSpots] = { pos: new THREE.Vector3(), normal: new THREE.Vector3(), plant: null, kind, color };
    }
    s.kind = kind;
    s.p.set(p[0], p[1], p[2]);
    s.n.set(n[0], n[1], n[2]).normalize();
    s.color = color;
    s.flex = flex;
    this.nSpots++;
  }

  targets(out, plant) {
    if (this.snip) return;
    this.body.updateWorldMatrix(true, false);
    const mw = this.body.matrixWorld;
    _tn.getNormalMatrix(mw);
    for (let i = 0; i < this.nSpots; i++) {
      const s = this.spots[i];
      const o = this.outs[i];
      o.pos.copy(s.p).applyMatrix4(mw);
      windSway(o.pos.x, o.pos.y, o.pos.z, s.flex, _w2);
      const k = REDUCED_MOTION.matches ? 0.5 : 1;
      o.pos.x += _w2.x * k;
      o.pos.z += _w2.y * k;
      o.normal.copy(s.n).applyMatrix3(_tn).normalize();
      o.plant = plant;
      o.kind = s.kind;
      o.color = s.color;
      out.push(o);
    }
  }

  poke() {
    this.wob.poke(REDUCED_MOTION.matches ? 0.35 : 1);
  }

  update(dt) {
    const moving = this.wob.update(dt);
    if (moving || this._wobbling) {
      this._wobbling = moving;
      this.body.rotation.x = moving ? this.wob.z * 0.16 : 0;
      this.body.rotation.z = moving ? -this.wob.x * 0.16 : 0;
    }
    if (this.snip) {
      this.snip.t += dt;
      if (this.snip.t >= this.snip.dur) this._free();
    }
  }

  harvestable() {
    return !this.cut && !this.snip && this.shown >= 0.97;
  }

  // Snip: a short quiver, then the bloom and its upper stem come free as a
  // cut flower in world space and the plant goes back to a new bud.
  harvest(onFree) {
    if (!this.harvestable()) return { remove: false, regrowTo: this.shown };
    this.snip = { t: 0, dur: 0.22, onFree, regrowTo: 0.66 };
    this.wob.poke(REDUCED_MOTION.matches ? 0.25 : 0.6);
    return { remove: false, regrowTo: 0.66 };
  }

  _free() {
    const { onFree, regrowTo } = this.snip;
    this.snip = null;
    const cp = this.cutPoint();
    const item = new this.constructor({ seed: this.seed, color: this.color, quality: this.quality, cut: true });
    item.setGrowth(1);
    const obj = item.object;
    obj.userData.dispose = () => item.dispose();
    this.body.updateWorldMatrix(true, false);
    _tv.set(cp.p[0], cp.p[1], cp.p[2]).applyMatrix4(this.body.matrixWorld);
    obj.position.copy(_tv);
    const d = new THREE.Vector3(cp.t[0], cp.t[1], cp.t[2]).transformDirection(this.body.matrixWorld);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    obj.updateMatrixWorld(true);
    this.target = regrowTo;
    this.flush();
    this.capG = regrowTo;
    onFree?.(obj);
  }

  // Where a picked stem is cut: { p: [x, y, z], t: [dir] } in plant space.
  // Species override; the default cuts 30 cm below the top.
  cutPoint() {
    return { p: [0, Math.max(0.02, this.height - 0.32), 0], t: [0, 1, 0] };
  }

  dispose() {
    this.fol.geometry.dispose();
    this.blo.geometry.dispose();
    this.soi.geometry.dispose();
  }
}
