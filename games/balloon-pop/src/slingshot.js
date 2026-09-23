// A hand-made slingshot: a forked branch with a leather-wrapped handle,
// two amber latex bands and a leather pouch cradling a round river stone.
// Built in metres with the fork's crotch at the origin, prongs up (+Y) and
// the shooting direction along +Z, so the pouch draws back towards -Z.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

// Bark-stripped hazel: pale honey wood with fine lengthwise streaks.
function hazelTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#b07a45';
  x.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 60; i++) {
    x.fillStyle = `rgba(${70 + Math.random() * 40}, ${40 + Math.random() * 20}, 15, ${0.1 + Math.random() * 0.25})`;
    x.fillRect(Math.random() * 64, 0, 0.6 + Math.random() * 1.6, 256);
  }
  for (let i = 0; i < 6; i++) {
    x.fillStyle = 'rgba(60, 34, 14, 0.5)';
    x.beginPath();
    x.ellipse(Math.random() * 64, Math.random() * 256, 2.5, 4, 0, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// A slightly lumpy, rounded pebble with speckles in its vertex colours.
export function createStoneGeometry(radius) {
  const geo = new THREE.IcosahedronGeometry(radius, 3);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const seed = Math.random() * 10;
  const base = new THREE.Color('#8d8a86');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i).normalize();
    const lump = 1 + Math.sin(tmp.x * 3.1 + seed) * Math.sin(tmp.y * 2.7 + seed * 1.3) * 0.08 + Math.sin(tmp.z * 5.3 + seed) * 0.03;
    tmp.multiply(new THREE.Vector3(1.12, 0.86, 1)).multiplyScalar(radius * lump);
    pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
    const speck = Math.random() < 0.12 ? 0.55 : 0.85 + Math.random() * 0.25;
    c.copy(base).multiplyScalar(speck);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // the icosahedron's faces are unshared, so smooth normals come from the
  // shape itself rather than computeVertexNormals
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i).divide(new THREE.Vector3(1.12, 0.86, 1)).normalize();
    nrm.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  return geo;
}

export const stoneMaterial = () =>
  new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5 });

export class SlingshotModel {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'slingshot';
    const wood = new THREE.MeshPhysicalMaterial({ map: hazelTexture(), roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4 });
    const leather = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#5b3420'),
      roughness: 0.78,
      sheen: 0.4,
      sheenColor: new THREE.Color('#c08a60'),
    });
    this.bandMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#e08a2c'),
      roughness: 0.35,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      sheen: 0.3,
      sheenColor: new THREE.Color('#ffd0a0'),
    });

    // handle, with a leather wrap in the middle
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.12, 14), wood);
    handle.position.y = -0.058;
    this.group.add(handle);
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0172, 0.07, 14), leather);
    wrap.position.y = -0.07;
    this.group.add(wrap);
    for (let k = 0; k < 5; k++) {
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.0166, 0.0016, 6, 20), leather);
      ridge.rotation.x = Math.PI / 2;
      ridge.position.y = -0.1 + k * 0.015;
      this.group.add(ridge);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 10), wood);
    knob.scale.set(1, 0.6, 1);
    knob.position.y = -0.118;
    this.group.add(knob);

    // the fork: two prongs curving up and out
    this.tips = [];
    for (const sx of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.01, 0),
        new THREE.Vector3(sx * 0.016, 0.02, 0),
        new THREE.Vector3(sx * 0.038, 0.058, 0.002),
        new THREE.Vector3(sx * 0.046, 0.098, 0.004),
      ]);
      const prong = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.0095, 10, false), wood);
      this.group.add(prong);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0098, 12, 8), wood);
      cap.position.set(sx * 0.046, 0.098, 0.004);
      this.group.add(cap);
      // band lashing just under the tip
      const lash = new THREE.Mesh(new THREE.TorusGeometry(0.0104, 0.0022, 6, 16), this.bandMaterial);
      lash.rotation.x = Math.PI / 2;
      lash.position.set(sx * 0.045, 0.09, 0.004);
      this.group.add(lash);
      this.tips.push(new THREE.Vector3(sx * 0.045, 0.09, 0.004));
    }
    const crotch = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 12, 10), wood);
    crotch.position.y = -0.004;
    this.group.add(crotch);

    // bands: unit cylinders stretched between a tip and the pouch each frame
    const bandGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    bandGeo.translate(0, 0.5, 0);
    this.bands = this.tips.map(() => {
      const m = new THREE.Mesh(bandGeo, this.bandMaterial);
      this.group.add(m);
      return m;
    });

    // pouch: a narrow cupped strip of leather behind the stone, which shows
    // above and below it
    this.pouch = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.45), leather);
    cup.rotation.x = Math.PI / 2; // open side faces forward (+Z)
    cup.scale.set(1.45, 1, 0.55);
    cup.position.z = 0.003;
    this.pouch.add(cup);
    this.stone = new THREE.Mesh(createStoneGeometry(0.0125), stoneMaterial());
    this.stone.position.z = 0.001;
    this.pouch.add(this.stone);
    this.group.add(this.pouch);
    this.pouchRest = new THREE.Vector3(0, 0.084, -0.028);
    this.setDraw(0, 0);
  }

  // pull: 0 at rest .. 1 fully drawn. wobble: the bands' overshoot after a
  // release, in metres along the shot.
  setDraw(pull, wobble = 0, loaded = true) {
    const p = this.pouch.position.copy(this.pouchRest);
    p.z += -pull * 0.15 + wobble;
    p.y -= pull * 0.024;
    this.pouch.rotation.x = -pull * 0.25;
    this.stone.visible = loaded;
    const halfW = 0.015 + (1 - pull) * 0.004;
    this.tips.forEach((tip, i) => {
      const band = this.bands[i];
      const end = tmp.set(p.x + (i === 0 ? -halfW : halfW), p.y, p.z);
      const d = tmp2.subVectors(end, tip);
      const len = d.length();
      band.position.copy(tip);
      band.quaternion.setFromUnitVectors(UP, d.normalize());
      // latex thins as it stretches
      const r = 0.0034 / Math.sqrt(Math.max(1, len / 0.03));
      band.scale.set(r, len, r * 0.75);
    });
  }

  stoneWorldPosition(out) {
    return this.stone.getWorldPosition(out);
  }
}
