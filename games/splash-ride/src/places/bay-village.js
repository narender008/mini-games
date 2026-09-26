// The night bay's fishing village: whitewashed stone cottages with slate
// roofs and warmly lit windows climbing the slope above the beach, a
// promenade along the sea wall with lamp posts and strings of paper lanterns,
// the wooden pier strung with more lanterns, fishing boats at their moorings
// and drawn up on the sand, and the lighthouse on the point, its lamp
// turning slowly behind the glass and sweeping a soft, warm beam round the
// bay. All the cottages share three materials and are merged into three
// meshes; lanterns, piles and posts are instanced.
import * as THREE from 'three';
import { rng } from '../config.js';
import { canvasTexture, instances, merge } from './common.js';

const COL = (hex) => new THREE.Color(hex);

// ------------------------------------------------------------ textures

function whitewashTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = rng(71);
    g.fillStyle = '#eeebe4';
    g.fillRect(0, 0, w, h);
    // rubble stones faintly showing through the lime
    for (let i = 0; i < 110; i++) {
      g.strokeStyle = `rgba(120, 112, 100, ${0.05 + r() * 0.08})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 7 + r() * 13, 4 + r() * 6, (r() - 0.5) * 0.4, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 3000; i++) {
      const v = 190 + r() * 60;
      g.fillStyle = `rgba(${v}, ${v - 4}, ${v - 12}, 0.25)`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // rain streaks
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(110, 105, 95, ${0.03 + r() * 0.05})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 20 + r() * 60);
    }
  }, { repeat: true });
}

function slateTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = rng(73);
    g.fillStyle = '#1e2024';
    g.fillRect(0, 0, w, h);
    const rows = 8;
    const rh = h / rows;
    for (let j = 0; j < rows; j++) {
      const y = j * rh;
      let x = (j % 2) * -14;
      while (x < w) {
        const sw = 22 + r() * 12;
        g.fillStyle = `hsl(${205 + r() * 25}, ${5 + r() * 9}%, ${34 + r() * 16}%)`;
        g.fillRect(x + 1, y + 1, sw - 2, rh - 2);
        g.fillStyle = 'rgba(0, 0, 0, 0.28)';
        g.fillRect(x + 1, y + rh - 5, sw - 2, 4);
        g.fillStyle = 'rgba(255, 255, 255, 0.05)';
        g.fillRect(x + 1, y + 1, sw - 2, 2);
        x += sw;
      }
    }
  }, { repeat: true });
}

function plankTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = rng(79);
    const n = 10; // planks across the pier, grain along it
    for (let i = 0; i < n; i++) {
      const x = (i * w) / n;
      g.fillStyle = `hsl(${26 + r() * 8}, ${18 + r() * 12}%, ${30 + r() * 12}%)`;
      g.fillRect(x, 0, w / n, h);
      for (let k = 0; k < 30; k++) {
        g.fillStyle = `rgba(${30 + r() * 30}, ${20 + r() * 20}, ${12 + r() * 10}, ${0.1 + r() * 0.15})`;
        g.fillRect(x + r() * (w / n), r() * h, 1, 20 + r() * 80);
      }
      g.fillStyle = 'rgba(12, 8, 5, 0.85)';
      g.fillRect(x, 0, 2, h);
      g.fillStyle = 'rgba(40, 40, 40, 0.8)';
      for (const y of [h * 0.2, h * 0.7]) g.fillRect(x + 5, y, 2, 2), g.fillRect(x + w / n - 7, y, 2, 2);
    }
  }, { repeat: true });
}

// a lit window: four panes behind glazing bars, curtains drawn to the sides
function windowTexture() {
  return canvasTexture(64, 96, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h * 0.6, 4, w / 2, h * 0.6, h * 0.75);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#a8805e');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(140, 55, 30, 0.6)';
    g.fillRect(4, 4, 9, h - 8);
    g.fillRect(w - 13, 4, 9, h - 8);
    g.fillStyle = 'rgba(90, 40, 20, 0.35)';
    g.fillRect(4, 4, w - 8, 8);
    g.fillStyle = '#16151a';
    g.fillRect(0, 0, w, 4);
    g.fillRect(0, h - 4, w, 4);
    g.fillRect(0, 0, 4, h);
    g.fillRect(w - 4, 0, 4, h);
    g.fillRect(w / 2 - 2, 0, 4, h);
    g.fillRect(0, h / 2 - 2, w, 4);
  });
}

// a round paper lantern: warm paper between bamboo ribs, dark caps
function paperTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    const r = rng(83);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#6a4a30');
    grad.addColorStop(0.1, '#e8c9a0');
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(0.9, '#e8c9a0');
    grad.addColorStop(1, '#6a4a30');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let y = 6; y < h - 4; y += 5) {
      g.fillStyle = 'rgba(120, 70, 30, 0.35)';
      g.fillRect(0, y, w, 1);
    }
    for (let i = 0; i < 200; i++) {
      g.fillStyle = `rgba(160, 110, 70, ${r() * 0.08})`;
      g.fillRect(r() * w, r() * h, 1, 1 + r() * 3);
    }
    g.fillStyle = '#2a1c12';
    g.fillRect(0, 0, w, 3);
    g.fillRect(0, h - 3, w, 3);
  }, { srgb: true });
}

// ------------------------------------------------------------ geometry helpers

// planar uvs from each face's normal, 2 m to the texture
function faceUV(geo, ox = 0, oy = 0) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u;
    let v;
    if (ay >= ax && ay >= az) {
      u = p.getX(i);
      v = p.getZ(i);
    } else if (ax >= az) {
      u = p.getZ(i);
      v = p.getY(i);
    } else {
      u = p.getX(i);
      v = p.getY(i);
    }
    uv[i * 2] = u * 0.5 + ox;
    uv[i * 2 + 1] = v * 0.5 + oy;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function paint(geo, color) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

function clean(geo, keep = ['position', 'normal', 'uv', 'color']) {
  for (const k of Object.keys(geo.attributes)) if (!keep.includes(k)) geo.deleteAttribute(k);
  return geo;
}

// a painted box, moved into place: uvs are laid out before it turns so
// slates and planks keep their direction
function box(w, h, d, x, y, z, color, rx = 0, ry = 0, uvo = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  faceUV(g, uvo, uvo * 0.7);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return paint(g, color);
}

function cyl(rt, rb, h, seg, x, y, z, color) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg).toNonIndexed();
  faceUV(g);
  g.translate(x, y, z);
  return clean(paint(g, color));
}

// the glowing pane of a window, facing +z in the cottage's space
function pane(w, h, x, y, z, ry, color) {
  const g = new THREE.PlaneGeometry(w, h).toNonIndexed();
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return clean(paint(g, color));
}

// ------------------------------------------------------------ cottages

const WALL = COL('#f2efe8');
const STONE = COL('#8d867c');
const SILL = COL('#cbc6bb');
const RIDGE = COL('#3a3a3e');
const DOORS = ['#2f5d7c', '#8c2f2a', '#2e6b4f', '#caa24a', '#2c2f3a', '#5a7fa0'].map(COL);
const LIT = [COL('#ffc27a'), COL('#ffb060'), COL('#ffd49a'), COL('#ff9f55')];
const DARK = COL('#0c1018');

// One cottage in its own space (front with the door towards +z, ridge along
// x, ground at y = 0); returns parts for the walls, roof and glass meshes.
function cottage(r, { W, D, H, pitch, door, twoStorey, porchLamp, litOdds = 0.8 }) {
  const walls = [];
  const roof = [];
  const glass = [];
  const uvo = r() * 10;
  const rh = (D / 2) * Math.tan(pitch);
  walls.push(box(W, H + 2.5, D, 0, (H - 2.5) / 2, 0, WALL, 0, 0, uvo));
  // the attic between the gables: a prism along the ridge
  const tri = new THREE.Shape();
  tri.moveTo(-D / 2, 0);
  tri.lineTo(D / 2, 0);
  tri.lineTo(0, rh);
  tri.closePath();
  const attic = new THREE.ExtrudeGeometry(tri, { depth: W, bevelEnabled: false });
  attic.rotateY(Math.PI / 2);
  attic.translate(-W / 2, H, 0);
  faceUV(attic, uvo, 0);
  walls.push(paint(attic.index ? attic.toNonIndexed() : attic, WALL));
  // slate roof: two slabs from the ridge with an overhang, and a ridge cap
  const ov = 0.35;
  const L = (D / 2 + ov) / Math.cos(pitch);
  for (const s of [1, -1]) {
    const zc = s * (L / 2) * Math.cos(pitch);
    const yc = H + rh - (L / 2) * Math.sin(pitch) + 0.07;
    roof.push(box(W + 0.5, 0.12, L, 0, yc, zc, COL('#ffffff'), s * pitch, 0, uvo));
  }
  walls.push(box(W + 0.55, 0.16, 0.3, 0, H + rh + 0.06, 0, RIDGE));
  // a chimney at one gable end
  const cs = r() < 0.5 ? -1 : 1;
  const cx = cs * (W / 2 - 0.5);
  walls.push(box(0.8, 2.6, 0.75, cx, H + rh - 0.2, 0, STONE, 0, 0, uvo));
  walls.push(cyl(0.12, 0.14, 0.4, 8, cx - 0.15, H + rh + 1.3, 0, COL('#9a5a40')));
  walls.push(cyl(0.12, 0.14, 0.35, 8, cx + 0.18, H + rh + 1.28, 0, COL('#9a5a40')));
  // the door, its step and the front windows
  const dx = (r() - 0.5) * (W - 3.5);
  walls.push(box(1.0, 2.05, 0.12, dx, 1.02, D / 2 + 0.03, door));
  walls.push(box(1.4, 0.22, 0.6, dx, 0.02, D / 2 + 0.3, STONE));
  const lit = () => (r() < litOdds ? LIT[Math.floor(r() * LIT.length)].clone().multiplyScalar(0.55 + r() * 0.6) : DARK);
  const windowAt = (x, y, face) => {
    // face: 0 front (+z), 1 right (+x), -1 left (-x)
    const c = lit();
    if (face === 0) {
      walls.push(box(1.08, 1.24, 0.06, x, y, D / 2 + 0.02, door));
      walls.push(box(1.16, 0.08, 0.22, x, y - 0.64, D / 2 + 0.09, SILL));
      glass.push(pane(0.9, 1.06, x, y, D / 2 + 0.06, 0, c));
    } else {
      const wx = face * (W / 2 + 0.02);
      walls.push(box(0.06, 1.24, 1.08, wx, y, x, door));
      walls.push(box(0.22, 0.08, 1.16, wx + face * 0.07, y - 0.64, x, SILL));
      glass.push(pane(0.9, 1.06, wx + face * 0.04, y, x, face * Math.PI / 2, c));
    }
  };
  const gy = 1.45;
  for (let x = -W / 2 + 1.2; x <= W / 2 - 1.1; x += 1.9) {
    if (Math.abs(x - dx) < 1.3) continue;
    windowAt(x, gy, 0);
  }
  if (twoStorey) for (let x = -W / 2 + 1.3; x <= W / 2 - 1.2; x += 2.2) windowAt(x, H - 1.05, 0);
  if (r() < 0.7) windowAt((r() - 0.5) * (D - 2.2), gy, 1);
  if (r() < 0.7) windowAt((r() - 0.5) * (D - 2.2), gy, -1);
  // a lamp by the door
  if (porchLamp) {
    const lx = dx + 0.85;
    walls.push(box(0.05, 0.35, 0.25, lx, 2.25, D / 2 + 0.12, COL('#222226')));
    glass.push(clean(paint(new THREE.BoxGeometry(0.2, 0.28, 0.2).toNonIndexed().translate(lx, 2.2, D / 2 + 0.3), COL('#ffcf8a').multiplyScalar(1.6))));
  }
  return { walls: walls.map((g) => clean(g)), roof: roof.map((g) => clean(g)), glass };
}

// ------------------------------------------------------------ boats

// a clinker fishing boat: lofted hull painted outside, wooden inside
function boatGeometry(L, B, Dp) {
  const seg = 18;
  const ring = 10;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const zz = (t - 0.5) * L;
    // fuller aft, fine bow (bow at -z)
    const w = Math.pow(Math.sin(t * Math.PI), 0.55 + 0.25 * (1 - t)) * B * 0.5;
    const sheer = Dp + Math.pow(Math.abs(t - 0.45) * 2, 2.5) * 0.28;
    for (let j = 0; j <= ring; j++) {
      const a = (j / ring) * Math.PI;
      pos.push(Math.cos(a) * w, -Math.sin(a) * sheer * 0.85 + sheer * 0.15, zz);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * (ring + 1) + j;
      const b = a + ring + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function fishingBoat(colour, { lamp = false, seed = 1 } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const L = 5 + r() * 0.8;
  const B = 1.8;
  const hull = boatGeometry(L, B, 0.75);
  const paintMat = new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.5 });
  const inside = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.85, side: THREE.BackSide });
  g.add(new THREE.Mesh(hull, paintMat), new THREE.Mesh(hull, inside));
  const trim = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.6 });
  const gun = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 6, 44), trim);
  gun.scale.set(B * 0.5, L * 0.5, 1);
  gun.rotation.x = Math.PI / 2;
  gun.position.y = 0.13;
  g.add(gun);
  const wood = new THREE.MeshStandardMaterial({ color: 0x6d5238, roughness: 0.8 });
  for (const zz of [-0.9, 0.3, 1.4]) {
    const th = new THREE.Mesh(new THREE.BoxGeometry(B * 0.85, 0.05, 0.26), wood);
    th.position.set(0, -0.12, zz);
    g.add(th);
  }
  // a stubby mast with a riding lantern on the moored ones
  if (lamp) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 6), wood);
    mast.position.set(0, 1.1, -L * 0.25);
    g.add(mast);
    const light = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.18, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc46e').multiplyScalar(5) }));
    light.position.set(0, 2.45, -L * 0.25);
    g.add(light);
  }
  // nets and a fish box
  const net = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshStandardMaterial({ color: 0x4a6a5a, roughness: 1 }));
  net.scale.set(1, 0.35, 1.3);
  net.position.set(0.2, -0.1, 0.9);
  g.add(net);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}

// ------------------------------------------------------------ lighthouse

function bandTexture() {
  return canvasTexture(64, 256, (g, w, h) => {
    const r = rng(89);
    g.fillStyle = '#f1eee8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#a3322b';
    g.fillRect(0, h * 0.28, w, h * 0.16);
    g.fillRect(0, h * 0.62, w, h * 0.16);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(90, 80, 70, ${r() * 0.06})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 12);
    }
  });
}

const BEAM_VERT = /* glsl */ `
varying float vAlong;
varying vec3 vN;
varying vec3 vV;
void main() {
  vAlong = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying float vAlong;
varying vec3 vN;
varying vec3 vV;
void main() {
  // uv.y runs 1 at the lamp to 0 at the far end of the cone
  float along = 1.0 - vAlong;
  float fall = pow(1.0 - along, 2.2) * smoothstep(0.0, 0.03, along);
  // brightest down the middle of the shaft, nothing at its silhouette
  float face = pow(abs(dot(vN, vV)), 2.0);
  gl_FragColor = vec4(uColor * uStrength * fall * face, 0.0);
}`;

function lighthouse(fxLayer) {
  const g = new THREE.Group();
  const H = 15;
  const pts = [
    new THREE.Vector2(0, -2),
    new THREE.Vector2(2.5, -2),
    new THREE.Vector2(2.45, 0),
    new THREE.Vector2(2.2, 4),
    new THREE.Vector2(1.95, 9),
    new THREE.Vector2(1.72, H),
    new THREE.Vector2(0, H),
  ];
  const tower = new THREE.Mesh(new THREE.LatheGeometry(pts, 36), new THREE.MeshStandardMaterial({ map: bandTexture(), roughness: 0.55 }));
  g.add(tower);
  const iron = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.45, metalness: 0.6 });
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.3, 0.3, 36), iron);
  gallery.position.y = H + 0.1;
  g.add(gallery);
  const rail = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    rail.push({ x: Math.cos(a) * 2.35, y: H + 0.75, z: Math.sin(a) * 2.35 });
  }
  g.add(instances(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5), iron, rail));
  const top = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.04, 6, 48), iron);
  top.rotation.x = Math.PI / 2;
  top.position.y = H + 1.25;
  g.add(top);
  // the lantern room: glowing glass between iron glazing bars
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x20180e, emissive: new THREE.Color('#ffc98a'), emissiveIntensity: 1.2, roughness: 0.15 });
  const room = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 1.9, 10, 1, true), glassMat);
  room.position.y = H + 1.2;
  g.add(room);
  const bars = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
    bars.push({ x: Math.cos(a) * 1.27, y: H + 1.2, z: Math.sin(a) * 1.27 });
  }
  g.add(instances(new THREE.BoxGeometry(0.07, 1.95, 0.07), iron, bars));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.35, 20), iron);
  base.position.y = H + 0.2;
  g.add(base);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.45, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a1c18, roughness: 0.4, metalness: 0.5 }));
  dome.scale.y = 0.75;
  dome.position.y = H + 2.15;
  g.add(dome);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), iron);
  ball.position.y = H + 3.35;
  g.add(ball);
  // the lamp itself
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').multiplyScalar(8) });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), lampMat);
  lamp.position.y = H + 1.2;
  g.add(lamp);
  // door and a lit window on the tower
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.3), new THREE.MeshStandardMaterial({ color: 0x2c4a5e, roughness: 0.6 }));
  door.position.set(0, 1.05, 2.4);
  g.add(door);
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc27a').multiplyScalar(2.2) });
  for (const [y, a] of [[6, 0.3], [10.5, -0.4]]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), winMat);
    const rr = y < 8 ? 2.13 : 1.9;
    win.position.set(Math.sin(a) * rr, y, Math.cos(a) * rr);
    win.rotation.y = a;
    g.add(win);
  }
  g.traverse((o) => {
    if (o.isMesh && o.material !== lampMat) o.castShadow = o.receiveShadow = true;
  });
  // two soft beams, opposite each other, turning slowly
  const beamGeo = new THREE.ConeGeometry(16, 230, 28, 1, true);
  beamGeo.translate(0, -115, 0);
  beamGeo.rotateZ(Math.PI / 2 - 0.02); // apex at the lamp, pointing out along +x, dipping a touch
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#ffd39a') }, uStrength: { value: 0.07 } },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const spin = new THREE.Group();
  spin.position.y = H + 1.2;
  for (const a of [0, Math.PI]) {
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.y = a;
    beam.layers.set(fxLayer);
    beam.frustumCulled = false;
    spin.add(beam);
  }
  g.add(spin);
  return { group: g, spin, lampMat, glassMat, height: H + 1.2 };
}

// ------------------------------------------------------------ the village

// Build everything. site: { PIER, MOORED, KNOLL, height, shoreX(z), rng }
export function makeVillage({ quality, PIER, MOORED, KNOLL, height, shoreX, fxLayer }) {
  const group = new THREE.Group();
  group.name = 'village';
  const r = rng(301);
  const low = quality.tier === 'low';
  const walls = [];
  const roofs = [];
  const glass = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const place = (parts, x, y, z, ry) => {
    m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, ry), new THREE.Vector3(1, 1, 1));
    for (const g of parts.walls) walls.push(g.applyMatrix4(m));
    for (const g of parts.roof) roofs.push(g.applyMatrix4(m));
    for (const g of parts.glass) glass.push(g.applyMatrix4(m));
  };

  // cottages in rows up the slope, facing the water (west)
  const rows = [
    { s: 25, z0: -122, z1: 70 },
    { s: 41, z0: -112, z1: 60 },
    { s: 58, z0: -96, z1: 44 },
  ];
  const houses = [];
  rows.forEach((row, k) => {
    let z = row.z0 + r() * 6;
    while (z < row.z1) {
      const W = 6 + r() * 3;
      const zc = z + W / 2;
      z += W + 2.5 + r() * 5;
      // a lane down to the pier
      if (k === 0 && Math.abs(zc - PIER.z) < W / 2 + 4) continue;
      if (r() < 0.12) continue;
      const x = shoreX(zc) + row.s + (r() - 0.5) * 4;
      const D = 4.6 + r() * 1.2;
      const ry = -Math.PI / 2 + (r() - 0.5) * 0.12;
      // sit on the lowest corner so no wall floats on the slope
      let y = Infinity;
      for (const [dx, dz] of [[-D / 2, -W / 2], [-D / 2, W / 2], [D / 2, -W / 2], [D / 2, W / 2]]) y = Math.min(y, height(x + dx, zc + dz));
      if (y < 0.9 || y > 14) continue;
      houses.push({ x, z: zc, y, W, D, ry });
      place(cottage(r, {
        W, D,
        H: k === 0 && r() < 0.45 ? 5.1 : 2.8,
        twoStorey: false,
        pitch: 0.62 + r() * 0.18,
        door: DOORS[Math.floor(r() * DOORS.length)],
        porchLamp: r() < 0.5,
      }), x, y - 0.05, zc, ry);
    }
  });
  // two-storey cottages need their upper windows
  // (rebuilt with twoStorey set where H is tall; simpler to decide up front)

  // the keeper's cottage beside the lighthouse
  const lhx = KNOLL.x + 2;
  const lhz = KNOLL.z - 1;
  const lhy = height(lhx, lhz);
  {
    const kx = lhx + 9;
    const kz = lhz + 5;
    place(cottage(r, { W: 7, D: 4.8, H: 2.8, pitch: 0.7, door: DOORS[0], porchLamp: true, litOdds: 1 }), kx, height(kx, kz) - 0.1, kz, -Math.PI / 2 - 0.5);
  }

  const wallMat = new THREE.MeshStandardMaterial({ map: whitewashTexture(), vertexColors: true, roughness: 0.88 });
  const roofMat = new THREE.MeshStandardMaterial({ map: slateTexture(), vertexColors: true, roughness: 0.62 });
  const glassMat = new THREE.MeshBasicMaterial({ map: windowTexture(), vertexColors: true, color: new THREE.Color(2.6, 2.6, 2.6) });
  const wallMesh = new THREE.Mesh(merge(walls), wallMat);
  const roofMesh = new THREE.Mesh(merge(roofs), roofMat);
  const glassMesh = new THREE.Mesh(merge(glass), glassMat);
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  roofMesh.castShadow = roofMesh.receiveShadow = true;
  group.add(wallMesh, roofMesh, glassMesh);

  // ---- the promenade: sea wall, lamp posts and lantern strings
  const iron = new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.5, metalness: 0.6 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8e877c, roughness: 0.9 });
  const wallSegs = [];
  const posts = [];
  const zA = -128;
  const zB = 76;
  let prev = null;
  for (let z = zA; z <= zB; z += 4) {
    const x = shoreX(z) + 15;
    if (prev) {
      const dx = x - prev.x;
      const dz = z - prev.z;
      const len = Math.hypot(dx, dz);
      const seg = new THREE.BoxGeometry(0.6, 1.8, len + 0.1);
      seg.rotateY(Math.atan2(dx, dz));
      seg.translate((x + prev.x) / 2, height((x + prev.x) / 2, (z + prev.z) / 2) - 0.5, (z + prev.z) / 2);
      wallSegs.push(seg.toNonIndexed());
    }
    prev = { x, z };
  }
  const seaWall = new THREE.Mesh(merge(wallSegs), stoneMat);
  seaWall.castShadow = seaWall.receiveShadow = true;
  group.add(seaWall);
  for (let z = zA + 6; z <= zB; z += 16) {
    if (Math.abs(z - PIER.z) < 3) continue;
    const x = shoreX(z) + 16.2;
    posts.push({ x, y: height(x, z), z });
  }
  const postGeo = merge([
    new THREE.CylinderGeometry(0.07, 0.1, 3.4, 8).translate(0, 1.7, 0),
    new THREE.CylinderGeometry(0.16, 0.2, 0.35, 8).translate(0, 0.17, 0),
    new THREE.BoxGeometry(0.34, 0.06, 0.34).translate(0, 3.42, 0),
    new THREE.ConeGeometry(0.28, 0.3, 4).rotateY(Math.PI / 4).translate(0, 3.95, 0),
  ].map((g) => clean(g.toNonIndexed(), ['position', 'normal'])));
  group.add(instances(postGeo, iron, posts));
  const headGlass = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd08e').multiplyScalar(4) });
  group.add(instances(new THREE.BoxGeometry(0.26, 0.36, 0.26).translate(0, 3.63, 0), headGlass, posts, { shadow: false }));

  // strings of paper lanterns: [ends...] -> lantern spots along sagging wires
  const lanterns = [];
  const wire = [];
  const string = (a, b, n, sag) => {
    let px = a.x;
    let py = a.y;
    let pz = a.z;
    for (let i = 1; i <= 16; i++) {
      const t = i / 16;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t);
      wire.push(px, py, pz, x, y, z);
      px = x;
      py = y;
      pz = z;
    }
    for (let i = 1; i < n; i++) {
      const t = i / n;
      lanterns.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t) - 0.22,
        z: a.z + (b.z - a.z) * t,
        s: 0.9 + r() * 0.25,
      });
    }
  };
  for (let i = 1; i < posts.length; i++) {
    const a = posts[i - 1];
    const b = posts[i];
    string({ x: a.x, y: a.y + 3.35, z: a.z }, { x: b.x, y: b.y + 3.35, z: b.z }, 8, 0.7);
  }

  // ---- the pier
  const deckY = PIER.deck;
  const len = PIER.x0 - PIER.x1;
  const pierGroup = new THREE.Group();
  const deckMat = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.82 });
  const deck = merge([
    faceUV(new THREE.BoxGeometry(len, 0.2, PIER.width).toNonIndexed()).translate(PIER.x1 + len / 2, deckY, PIER.z),
    faceUV(new THREE.BoxGeometry(PIER.headDepth, 0.2, PIER.head).toNonIndexed()).translate(PIER.x1 + PIER.headDepth / 2, deckY + 0.001, PIER.z),
  ].map((g) => clean(g, ['position', 'normal', 'uv'])));
  const deckMesh = new THREE.Mesh(deck, deckMat);
  deckMesh.castShadow = deckMesh.receiveShadow = true;
  pierGroup.add(deckMesh);
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x3b2e24, roughness: 0.9 });
  const piles = [];
  for (let x = PIER.x1 + 0.2; x <= PIER.x0 - 2; x += 3.6) {
    for (const s of [-1, 1]) piles.push({ x, y: deckY - 3.9, z: PIER.z + s * (PIER.width / 2 + 0.05) });
  }
  for (const s of [-1, 1]) for (const k of [0.45, 1]) piles.push({ x: PIER.x1 + 0.2, y: deckY - 3.9, z: PIER.z + s * PIER.head * 0.5 * k }), piles.push({ x: PIER.x1 + PIER.headDepth - 0.2, y: deckY - 3.9, z: PIER.z + s * PIER.head * 0.5 * k });
  pierGroup.add(instances(new THREE.CylinderGeometry(0.16, 0.19, 7.6, 8), woodDark, piles));
  // rails along both sides and round the head
  const railParts = [];
  const rail = (x0, z0, x1, z1) => {
    const L2 = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(x1 - x0, z1 - z0);
    for (const hy of [0.55, 1.05]) {
      const b = new THREE.BoxGeometry(0.07, 0.08, L2);
      b.rotateY(ang);
      b.translate((x0 + x1) / 2, deckY + hy, (z0 + z1) / 2);
      railParts.push(b.toNonIndexed());
    }
    const n = Math.max(1, Math.round(L2 / 2.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new THREE.BoxGeometry(0.1, 1.1, 0.1);
      p.translate(x0 + (x1 - x0) * t, deckY + 0.55, z0 + (z1 - z0) * t);
      railParts.push(p.toNonIndexed());
    }
  };
  const hw = PIER.width / 2;
  const hx = PIER.x1 + PIER.headDepth;
  rail(hx, PIER.z - hw, PIER.x0 - 1, PIER.z - hw);
  rail(hx, PIER.z + hw, PIER.x0 - 1, PIER.z + hw);
  rail(PIER.x1, PIER.z - PIER.head / 2, PIER.x1, PIER.z + PIER.head / 2);
  rail(PIER.x1, PIER.z - PIER.head / 2, hx, PIER.z - PIER.head / 2);
  rail(PIER.x1, PIER.z + PIER.head / 2, hx, PIER.z + PIER.head / 2);
  const railMesh = new THREE.Mesh(merge(railParts.map((g) => clean(g, ['position', 'normal']))), woodDark);
  railMesh.castShadow = railMesh.receiveShadow = true;
  pierGroup.add(railMesh);
  // tall lantern poles along the rails, strung with lanterns
  const poles = [];
  for (let x = hx + 0.5; x <= PIER.x0 - 1; x += 8.5) for (const s of [-1, 1]) poles.push({ x, y: deckY, z: PIER.z + s * (hw + 0.02) });
  for (const s of [-1, 1]) poles.push({ x: PIER.x1 + 0.1, y: deckY, z: PIER.z + s * (PIER.head / 2 - 0.1) });
  pierGroup.add(instances(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 6).translate(0, 1.6, 0), woodDark, poles));
  const topY = deckY + 3.1;
  for (const s of [-1, 1]) {
    const side = poles.filter((p) => Math.abs(p.z - (PIER.z + s * (hw + 0.02))) < 0.01).sort((a, b) => a.x - b.x);
    for (let i = 1; i < side.length; i++) string({ x: side[i - 1].x, y: topY, z: side[i - 1].z }, { x: side[i].x, y: topY, z: side[i].z }, 6, 0.5);
    // out to the corners of the head
    string({ x: side[0].x, y: topY, z: side[0].z }, { x: PIER.x1 + 0.1, y: topY, z: PIER.z + s * (PIER.head / 2 - 0.1) }, 6, 0.4);
  }
  // across the pier every other pair of poles, zig-zagging
  const left = poles.filter((p) => p.z < PIER.z - 0.5 && p.x > PIER.x1 + 1).sort((a, b) => a.x - b.x);
  const right = poles.filter((p) => p.z > PIER.z + 0.5 && p.x > PIER.x1 + 1).sort((a, b) => a.x - b.x);
  for (let i = 0; i + 1 < Math.min(left.length, right.length); i += 2) string({ x: left[i].x, y: topY, z: left[i].z }, { x: right[i + 1].x, y: topY, z: right[i + 1].z }, 5, 0.45);
  // the lamp on the pier head, benches and lobster pots
  const lampPost = instances(postGeo, iron, [{ x: PIER.x1 + 2.5, y: deckY, z: PIER.z }]);
  pierGroup.add(lampPost);
  pierGroup.add(instances(new THREE.BoxGeometry(0.26, 0.36, 0.26).translate(0, 3.63, 0), headGlass, [{ x: PIER.x1 + 2.5, y: deckY, z: PIER.z }], { shadow: false }));
  const bench = merge([
    new THREE.BoxGeometry(1.8, 0.06, 0.45).translate(0, 0.45, 0),
    new THREE.BoxGeometry(1.8, 0.4, 0.05).translate(0, 0.7, -0.22),
    new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(-0.8, 0.22, 0),
    new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(0.8, 0.22, 0),
  ].map((g) => clean(g.toNonIndexed(), ['position', 'normal'])));
  pierGroup.add(instances(bench, woodDark, [
    { x: PIER.x1 + 3.2, y: deckY + 0.1, z: PIER.z - PIER.head / 2 + 1.2, ry: 0 },
    { x: PIER.x1 + 3.2, y: deckY + 0.1, z: PIER.z + PIER.head / 2 - 1.2, ry: Math.PI },
  ]));
  const pot = merge([
    new THREE.BoxGeometry(0.8, 0.45, 0.55).translate(0, 0.22, 0),
  ].map((g) => clean(g.toNonIndexed(), ['position', 'normal'])));
  const pots = [];
  for (let i = 0; i < 5; i++) pots.push({ x: PIER.x0 - 12 - (i % 3) * 0.85, y: deckY + 0.1 + Math.floor(i / 3) * 0.46, z: PIER.z + hw - 0.5, ry: (r() - 0.5) * 0.2 });
  pierGroup.add(instances(pot, new THREE.MeshStandardMaterial({ color: 0x5b4a36, roughness: 0.95 }), pots));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.08, 8, 20), new THREE.MeshStandardMaterial({ color: 0xd9542c, roughness: 0.6 }));
  ring.position.set(PIER.x1 + 0.12, deckY + 0.8, PIER.z + 2);
  ring.rotation.y = Math.PI / 2;
  pierGroup.add(ring);
  group.add(pierGroup);

  // the paper lanterns and their wires
  const paperMat = new THREE.MeshBasicMaterial({ map: paperTexture(), color: new THREE.Color(2.8, 2.8, 2.8) });
  paperMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.7;
  float sw = sin(uTime * 1.3 + ph) * 0.5 + sin(uTime * 0.7 + ph * 2.1) * 0.5;
  transformed.x += sw * 0.035 * (1.0 - position.y * 4.0);
  transformed.z += cos(uTime * 1.1 + ph) * 0.03 * (1.0 - position.y * 4.0);
#endif`,
      );
  };
  paperMat.customProgramCacheKey = () => 'bay-paper-lantern';
  const time = { value: 0 };
  const lanternGeo = new THREE.SphereGeometry(0.16, 14, 10);
  lanternGeo.scale(1, 1.2, 1);
  const lanternMesh = instances(lanternGeo, paperMat, lanterns, { shadow: false, receive: false });
  const tints = [COL('#ffb366'), COL('#ffd08c'), COL('#ff9a66'), COL('#ff7a55'), COL('#ffc9a0'), COL('#ff8c7a')];
  lanterns.forEach((_, i) => lanternMesh.setColorAt(i, tints[Math.floor(r() * tints.length)]));
  if (lanternMesh.instanceColor) lanternMesh.instanceColor.needsUpdate = true;
  group.add(lanternMesh);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  group.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x151515 })));

  // ---- fishing boats: moored ones bob, two are drawn up on the sand
  const colours = [0x2f5f8a, 0xa8372e, 0x2f6d55, 0xd8d2c4, 0x3b4f7a];
  const bobbing = [];
  MOORED.forEach(([x, z, h], i) => {
    const b = fishingBoat(colours[i % colours.length], { lamp: true, seed: i + 3 });
    b.position.set(x, 0.12, z);
    b.rotation.y = h;
    b.userData.phase = i * 1.9;
    b.userData.heading = h;
    group.add(b);
    bobbing.push(b);
  });
  for (let i = 0; i < 2; i++) {
    const z = PIER.z + 14 + i * 7;
    const x = shoreX(z) + 5 + i * 1.5;
    const b = fishingBoat(colours[(i + 3) % colours.length], { seed: 20 + i });
    b.position.set(x, height(x, z) + 0.45, z);
    b.rotation.set(0, Math.PI / 2 + 0.3 - i * 0.5, 0.12, 'YXZ');
    group.add(b);
  }

  // ---- the lighthouse on its knoll
  const lh = lighthouse(fxLayer);
  lh.group.position.set(lhx, lhy - 0.3, lhz);
  group.add(lh.group);
  const lampWorld = new THREE.Vector3(lhx, lhy - 0.3 + lh.height, lhz);

  // ---- a few real lights: the pier head and along the front
  const lights = [];
  const addLight = (x, y, z, intensity, dist) => {
    const l = new THREE.PointLight(0xffb870, intensity, dist, 2);
    l.position.set(x, y, z);
    group.add(l);
    lights.push(l);
  };
  addLight(PIER.x1 + 2.5, deckY + 3.4, PIER.z, 60, 38);
  addLight(shoreX(-70) + 18, height(shoreX(-70) + 18, -70) + 3.6, -70, 70, 45);
  if (!low) addLight(shoreX(30) + 18, height(shoreX(30) + 18, 30) + 3.6, 30, 70, 45);

  const toCam = new THREE.Vector3();
  const beamDir = new THREE.Vector3();
  return {
    group,
    houses,
    lanternSpots: lanterns,
    lamp: lampWorld,
    update(dt, t, view) {
      time.value = t;
      for (const b of bobbing) {
        const p = b.userData.phase;
        b.position.y = 0.12 + Math.sin(t * 1.05 + p) * 0.035;
        b.rotation.set(Math.sin(t * 0.7 + p * 2) * 0.018, b.userData.heading + Math.sin(t * 0.13 + p) * 0.06, Math.sin(t * 0.9 + p) * 0.03, 'YXZ');
      }
      // the lamp turns once every 24 s; it flares softly as a beam comes round
      const a = (t * Math.PI * 2) / 24;
      lh.spin.rotation.y = a;
      let flare = 0;
      if (view) {
        toCam.copy(view.cam).sub(lampWorld);
        toCam.y = 0;
        toCam.normalize();
        beamDir.set(Math.cos(a), 0, -Math.sin(a));
        const c = Math.abs(beamDir.dot(toCam));
        flare = Math.pow(c, 60);
      }
      lh.lampMat.color.setRGB(1, 0.85, 0.63).multiplyScalar(7 + 40 * flare);
      lh.glassMat.emissiveIntensity = 1.1 + 1.6 * flare;
    },
  };
}
