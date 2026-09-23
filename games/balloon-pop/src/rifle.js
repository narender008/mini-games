// A fairground air rifle, the kind chained to the counter of a balloon
// shooting stall: lacquered walnut stock, blued steel barrel and action,
// brass trim, and a cocking knob that snaps back after every shot.
// Built in metres along +Z (muzzle forward, +Y up) with the origin at the
// trigger, so the rig can hold it like a viewmodel and aim it with lookAt.
import * as THREE from 'three';

// Walnut: warm base, long dark grain lines that wander along the stock, and
// a few pores. Drawn once on a canvas; the stock's side UVs follow its
// length, so the grain runs the right way.
function walnutTexture() {
  const w = 512;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3f1d0c');
  g.addColorStop(0.5, '#5c2d13');
  g.addColorStop(1, '#361809');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const y0 = Math.random() * h;
    const amp = 2 + Math.random() * 7;
    const freq = 0.004 + Math.random() * 0.01;
    const phase = Math.random() * 10;
    x.strokeStyle = `rgba(${30 + Math.random() * 30}, ${12 + Math.random() * 12}, 4, ${0.18 + Math.random() * 0.3})`;
    x.lineWidth = 0.6 + Math.random() * 1.8;
    x.beginPath();
    for (let px = 0; px <= w; px += 8) {
      const py = y0 + Math.sin(px * freq + phase) * amp + Math.sin(px * freq * 3.1 + phase) * amp * 0.3;
      if (px === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.stroke();
  }
  // lighter figure in the grain
  for (let i = 0; i < 18; i++) {
    x.fillStyle = `rgba(170, 95, 45, ${0.05 + Math.random() * 0.07})`;
    x.beginPath();
    x.ellipse(Math.random() * w, Math.random() * h, 30 + Math.random() * 60, 3 + Math.random() * 5, 0, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Side profile of the stock in (forward, up), metres.
function stockShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.39, -0.118); // toe of the butt
  s.lineTo(-0.392, 0.022); // butt plate
  s.quadraticCurveTo(-0.3, 0.036, -0.17, 0.028); // comb
  s.quadraticCurveTo(-0.1, 0.024, -0.075, 0.012); // down to the wrist
  s.quadraticCurveTo(-0.04, 0.006, -0.02, 0.018); // rise to the action bed
  s.lineTo(0.2, 0.016); // top of the forend
  s.quadraticCurveTo(0.222, 0.012, 0.22, -0.004); // rounded tip
  s.quadraticCurveTo(0.21, -0.02, 0.19, -0.022);
  s.lineTo(0.035, -0.026); // underside of the forend
  s.quadraticCurveTo(0.0, -0.028, -0.03, -0.04); // pistol grip swell
  s.quadraticCurveTo(-0.055, -0.058, -0.075, -0.052);
  s.quadraticCurveTo(-0.2, -0.078, -0.39, -0.118); // belly back to the toe
  return s;
}

export function buildRifle() {
  const g = new THREE.Group();
  g.name = 'rifle';
  const wood = new THREE.MeshPhysicalMaterial({
    map: walnutTexture(),
    roughness: 0.55,
    clearcoat: 0.55,
    clearcoatRoughness: 0.22,
    envMapIntensity: 0.7,
  });
  const blued = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#2c3240'),
    metalness: 1,
    roughness: 0.24,
    clearcoat: 0.4,
    clearcoatRoughness: 0.2,
  });
  const brass = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#d9a64a'), metalness: 1, roughness: 0.24 });
  const rubber = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#1a1414'), roughness: 0.75 });

  // stock: the side profile extruded to 38 mm with rounded edges
  const sg = new THREE.ExtrudeGeometry(stockShape(), {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 3,
    curveSegments: 16,
  });
  sg.translate(0, 0, -0.015);
  sg.rotateY(-Math.PI / 2); // shape x -> +Z forward, extrusion -> sideways
  // UVs: stretch the grain along the stock
  const uv = sg.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.6 + 0.5, uv.getY(i) * 4 + 0.5);
  const stock = new THREE.Mesh(sg, wood);
  g.add(stock);

  // rubber butt pad
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.142, 0.014), rubber);
  pad.position.set(0, -0.048, -0.398);
  pad.rotation.x = 0.05;
  g.add(pad);

  // action (receiver) and barrel, blued steel
  const bore = 0.035; // height of the barrel axis above the origin
  const action = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.24, 24), blued);
  action.rotation.x = Math.PI / 2;
  action.position.set(0, bore, 0.07);
  g.add(action);
  const endCap = new THREE.Mesh(new THREE.SphereGeometry(0.017, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), blued);
  endCap.rotation.x = -Math.PI / 2;
  endCap.scale.set(1, 1, 0.55);
  endCap.position.set(0, bore, -0.05);
  g.add(endCap);
  const barrelLen = 0.46;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.011, barrelLen, 20), blued);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, bore, 0.19 + barrelLen / 2);
  g.add(barrel);
  // barrel breech block where it meets the action
  const breech = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 20), blued);
  breech.rotation.x = Math.PI / 2;
  breech.position.set(0, bore, 0.205);
  g.add(breech);
  // muzzle ring and front sight
  const muzzleZ = 0.19 + barrelLen;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.03, 20), blued);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, bore, muzzleZ - 0.015);
  g.add(ring);
  const bore0 = new THREE.Mesh(new THREE.CircleGeometry(0.0035, 16), new THREE.MeshBasicMaterial({ color: 0x050505 }));
  bore0.position.set(0, bore, muzzleZ + 0.0005);
  g.add(bore0);
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.016, 0.018), blued);
  front.position.set(0, bore + 0.018, muzzleZ - 0.02);
  g.add(front);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 10, 8), brass);
  bead.position.set(0, bore + 0.027, muzzleZ - 0.02);
  g.add(bead);
  // rear sight: a notched leaf on the action
  const rear = new THREE.Group();
  for (const sx of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014, 0.01), blued);
    leaf.position.set(sx * 0.0065, 0, 0);
    rear.add(leaf);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.006, 0.02), blued);
  base.position.y = -0.008;
  rear.add(base);
  rear.position.set(0, bore + 0.024, 0.16);
  g.add(rear);

  // brass trim: forend band and a stall number plate
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.0205, 0.0035, 8, 28), brass);
  band.scale.set(1.12, 1, 1);
  band.position.set(0, 0.0, 0.16);
  g.add(band);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.018, 0.05), brass);
  plate.position.set(0.0215, -0.03, -0.24);
  g.add(plate);

  // trigger and guard
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.003, 8, 24, Math.PI * 1.1), blued);
  guard.rotation.set(0, Math.PI / 2, Math.PI * 1.02);
  guard.position.set(0, -0.026, 0.004);
  g.add(guard);
  const trigger = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0025, 6, 12, Math.PI * 0.8), blued);
  trigger.rotation.set(0, Math.PI / 2, Math.PI * 1.25);
  trigger.position.set(0, -0.022, 0.006);
  g.add(trigger);

  // cocking knob on the right side of the action, on a short stalk
  const bolt = new THREE.Group();
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.03, 10), blued);
  stalk.rotation.z = Math.PI / 2;
  stalk.position.x = 0.015;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 12), brass);
  knob.position.x = 0.031;
  bolt.add(stalk, knob);
  bolt.position.set(0.012, bore + 0.004, 0.02);
  g.add(bolt);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, bore, muzzleZ + 0.004);
  g.add(muzzle);

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return { group: g, muzzle, bolt, boltRest: bolt.position.z };
}
