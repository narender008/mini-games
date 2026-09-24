// The light the effects are lit by. Water, petals, clouds and dust use their
// own shaders, so they read the scene's key light (the sun, or the moon at
// night) and the sky fill straight from the lights in the scene. One reader
// per scene; refreshing it is a handful of vector operations.
import * as THREE from 'three';

const readers = new WeakMap();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

class SceneLight {
  constructor(scene) {
    this.scene = scene;
    this.sun = null;
    this.hemi = null;
    this.rescan = 0;
    this.sunDir = new THREE.Vector3(-0.48, 0.42, -0.77).normalize(); // towards the light
    this.sunColor = new THREE.Color(3.2, 2.5, 1.7); // colour times intensity
    this.sky = new THREE.Color(0.55, 0.65, 0.8); // sky radiance, roughly
    this.ground = new THREE.Color(0.12, 0.13, 0.08);
    this.env = new THREE.Color(0.35, 0.38, 0.4); // what a clear drop shows on average
    this.override = null; // a sunDir handed in by the caller (Weather gets it)
  }

  find() {
    let best = null;
    let hemi = null;
    this.scene.traverse((o) => {
      if (o.isDirectionalLight && (!best || (o.castShadow && !best.castShadow) || o.intensity > best.intensity)) best = o;
      if (o.isHemisphereLight && !hemi) hemi = o;
    });
    this.sun = best;
    this.hemi = hemi;
  }

  update() {
    // lights may be added after the effects are built, or replaced
    if ((!this.sun || !this.sun.parent || !this.hemi) && this.rescan-- <= 0) {
      this.find();
      this.rescan = 30;
    }
    const s = this.sun;
    if (s) {
      tmpA.setFromMatrixPosition(s.matrixWorld);
      tmpB.setFromMatrixPosition(s.target.matrixWorld);
      tmpA.sub(tmpB);
      if (tmpA.lengthSq() > 1e-8) this.sunDir.copy(tmpA.normalize());
      this.sunColor.copy(s.color).multiplyScalar(s.visible ? s.intensity : 0);
    }
    if (this.override) this.sunDir.copy(this.override);
    const envI = this.scene.environment ? (this.scene.environmentIntensity ?? 1) : 0;
    if (this.hemi) {
      const k = this.hemi.visible ? this.hemi.intensity : 0;
      this.sky.copy(this.hemi.color).multiplyScalar(k * 0.9 + envI * 0.55);
      this.ground.copy(this.hemi.groundColor).multiplyScalar(k * 0.9 + envI * 0.35);
    }
    // a drop is a tiny lens: it shows the sky and the ground turned upside down
    this.env.copy(this.sky).multiplyScalar(0.62).add(tmpColor.copy(this.ground).multiplyScalar(0.38));
    return this;
  }
}

const tmpColor = new THREE.Color();

export function lightFor(scene) {
  let r = readers.get(scene);
  if (!r) {
    r = new SceneLight(scene);
    readers.set(scene, r);
  }
  return r.update();
}
