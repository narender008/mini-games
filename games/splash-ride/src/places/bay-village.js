// The night bay's fishing village: whitewashed stone cottages with slate
// roofs and warmly lit windows climbing the slope above the beach, a
// promenade along the sea wall with lamp posts and strings of paper lanterns,
// the wooden pier strung with more lanterns, fishing boats at their moorings
// and drawn up on the sand, and the lighthouse on the point, its lamp
// turning slowly behind the glass and sweeping a soft, warm beam round the
// bay.
//
// To keep draw calls down almost everything painted plainly (iron, wood,
// stone, boats, lamp glass) is merged into one vertex-coloured mesh: vertex
// colours brighter than white glow instead of taking light, and the moored
// boats bob on the swell in its vertex shader. Cottages add three meshes
// (walls, roofs, windows) and the lanterns one instanced mesh.
import * as THREE from 'three';
import { rng } from '../config.js';
import { canvasTexture, merge } from './common.js';

const COL = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

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
    const n = 10; // planks across the pier, grain along them
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
  });
}

function bandTexture() {
  return canvasTexture(64, 256, (g, w, h) => {
    const r = rng(89);
    g.fillStyle = '#f1eee8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#a3322b';
    g.fillRect(0, h * 0.3, w, h * 0.15);
    g.fillRect(0, h * 0.62, w, h * 0.15);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(90, 80, 70, ${r() * 0.06})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 12);
    }
  });
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

function fill(geo, name, size, values) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * size);
  for (let i = 0; i < n; i++) a.set(values, i * size);
  geo.setAttribute(name, new THREE.BufferAttribute(a, size));
  return geo;
}

function keep(geo, names) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!names.includes(k)) g.deleteAttribute(k);
  return g;
}

// a box with planar uvs and a flat colour, turned and moved into place (uvs
// are laid out before it turns, so slates and planks keep their direction)
function box(w, h, d, x, y, z, color, rx = 0, ry = 0, uvo = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  faceUV(g, uvo, uvo * 0.7);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return fill(g, 'color', 3, [color.r, color.g, color.b]);
}

// ------------------------------------------------------------ the paint mesh

// Everything painted plainly. bob: [x, z, phase] for the parts of a moored boat.
class Paint {
  constructor() {
    this.parts = [];
  }

  add(geo, color, bob = null) {
    const g = keep(geo, ['position', 'normal']);
    fill(g, 'color', 3, [color.r, color.g, color.b]);
    fill(g, 'bob', 4, bob ? [bob[0], bob[1], bob[2], 1] : [0, 0, 0, 0]);
    this.parts.push(g);
    return g;
  }

  // a copy of a geometry at each spot [{ x, y, z, ry }]
  scatter(geo, color, spots) {
    for (const s of spots) {
      const g = geo.clone();
      if (s.ry) g.rotateY(s.ry);
      g.translate(s.x, s.y ?? 0, s.z);
      this.add(g, color);
    }
  }

  mesh() {
    const time = { value: 0 };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec4 bob;')
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
  mat3 bobRot = mat3(1.0);
  float bobHeave = 0.0;
  if (bob.w > 0.0) {
    float ph = bob.z;
    float ax = sin(uTime * 0.7 + ph * 2.0) * 0.02;
    float az = sin(uTime * 0.9 + ph) * 0.03;
    float ay = sin(uTime * 0.13 + ph) * 0.05;
    bobRot = mat3(cos(ay), 0.0, -sin(ay), 0.0, 1.0, 0.0, sin(ay), 0.0, cos(ay))
      * mat3(1.0, 0.0, 0.0, 0.0, cos(ax), sin(ax), 0.0, -sin(ax), cos(ax))
      * mat3(cos(az), sin(az), 0.0, -sin(az), cos(az), 0.0, 0.0, 0.0, 1.0);
    bobHeave = sin(uTime * 1.05 + ph) * 0.035;
    objectNormal = bobRot * objectNormal;
  }`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
  if (bob.w > 0.0) {
    vec3 c = vec3(bob.x, 0.3, bob.y);
    transformed = c + bobRot * (transformed - c) + vec3(0.0, bobHeave, 0.0);
  }`,
        );
      // colours brighter than white are lamps: they glow and take no light
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  if (max(vColor.r, max(vColor.g, vColor.b)) > 1.01) {
    totalEmissiveRadiance = vColor.rgb;
    diffuseColor.rgb = vec3(0.0);
  }`,
      );
    };
    mat.customProgramCacheKey = () => 'bay-paint';
    const m = new THREE.Mesh(merge(this.parts), mat);
    m.castShadow = m.receiveShadow = true;
    m.userData.time = time;
    return m;
  }
}

// ------------------------------------------------------------ cottages

const WALL = COL('#f2efe8');
const STONE = COL('#8d867c');
const SILL = COL('#cbc6bb');
const RIDGE = COL('#3a3a3e');
const IRON = COL('#1f2024');
const WOOD = COL('#3b2e24');
const LAMP = COL('#ffcf8a', 4);
const DOORS = ['#2f5d7c', '#8c2f2a', '#2e6b4f', '#caa24a', '#2c2f3a', '#5a7fa0'].map((h) => COL(h));
const LIT = ['#ffc27a', '#ffb060', '#ffd49a', '#ff9f55'].map((h) => COL(h));
const DARK = COL('#0c1018');

// One cottage in its own space (front with the door towards +z, ridge along
// x, ground at y = 0); returns parts for the walls, roof and window meshes,
// and the spots of its lamps (for the paint mesh).
function cottage(r, { W, D, H, pitch, door, twoStorey, porchLamp, litOdds = 0.8 }) {
  const walls = [];
  const roof = [];
  const glass = [];
  const lamps = [];
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
  walls.push(fill(keep(attic, ['position', 'normal', 'uv']), 'color', 3, [WALL.r, WALL.g, WALL.b]));
  // slate roof: two slabs from the ridge with an overhang, and a ridge cap
  const ov = 0.35;
  const L = (D / 2 + ov) / Math.cos(pitch);
  const tint = COL('#ffffff').lerp(COL('#c9a79a'), r() < 0.25 ? 0.6 : 0);
  for (const s of [1, -1]) {
    const zc = s * (L / 2) * Math.cos(pitch);
    const yc = H + rh - (L / 2) * Math.sin(pitch) + 0.07;
    roof.push(box(W + 0.5, 0.12, L, 0, yc, zc, tint, s * pitch, 0, uvo));
  }
  walls.push(box(W + 0.55, 0.16, 0.3, 0, H + rh + 0.06, 0, RIDGE));
  // a chimney at one gable end
  const cx = (r() < 0.5 ? -1 : 1) * (W / 2 - 0.5);
  walls.push(box(0.8, 2.6, 0.75, cx, H + rh - 0.2, 0, STONE, 0, 0, uvo));
  walls.push(box(0.24, 0.4, 0.24, cx - 0.15, H + rh + 1.3, 0, COL('#9a5a40')));
  walls.push(box(0.24, 0.35, 0.24, cx + 0.18, H + rh + 1.28, 0, COL('#9a5a40')));
  // the door, its step and the windows
  const dx = (r() - 0.5) * (W - 3.5);
  walls.push(box(1.0, 2.05, 0.12, dx, 1.02, D / 2 + 0.03, door));
  walls.push(box(1.4, 0.22, 0.6, dx, 0.02, D / 2 + 0.3, STONE));
  const lit = () => (r() < litOdds ? LIT[Math.floor(r() * LIT.length)].clone().multiplyScalar(0.55 + r() * 0.6) : DARK);
  const pane = (w, h, x, y, z, ry, c) => {
    const g = new THREE.PlaneGeometry(w, h).toNonIndexed();
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    glass.push(fill(g, 'color', 3, [c.r, c.g, c.b]));
  };
  const windowAt = (x, y, face) => {
    // face: 0 front (+z), 1 right (+x), -1 left (-x)
    const c = lit();
    if (face === 0) {
      walls.push(box(1.08, 1.24, 0.06, x, y, D / 2 + 0.02, door));
      walls.push(box(1.16, 0.08, 0.22, x, y - 0.64, D / 2 + 0.09, SILL));
      pane(0.9, 1.06, x, y, D / 2 + 0.06, 0, c);
    } else {
      const wx = face * (W / 2 + 0.02);
      walls.push(box(0.06, 1.24, 1.08, wx, y, x, door));
      walls.push(box(0.22, 0.08, 1.16, wx + face * 0.07, y - 0.64, x, SILL));
      pane(0.9, 1.06, wx + face * 0.04, y, x, (face * Math.PI) / 2, c);
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
  if (porchLamp) {
    const lx = dx + 0.85;
    walls.push(box(0.05, 0.35, 0.25, lx, 2.25, D / 2 + 0.12, IRON));
    lamps.push(new THREE.Vector3(lx, 2.2, D / 2 + 0.3));
  }
  return { walls, roof, glass, lamps };
}

// ------------------------------------------------------------ boats

// a clinker fishing boat: a lofted hull, its bow towards -z
function hullGeometry(L, B, Dp, inside = false) {
  const seg = 18;
  const ring = 10;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const zz = (t - 0.5) * L;
    const w = Math.pow(Math.sin(t * Math.PI), 0.55 + 0.25 * (1 - t)) * B * 0.5 * (inside ? 0.94 : 1);
    const sheer = Dp + Math.pow(Math.abs(t - 0.45) * 2, 2.5) * 0.28;
    for (let j = 0; j <= ring; j++) {
      const a = (j / ring) * Math.PI;
      pos.push(Math.cos(a) * w, -Math.sin(a) * sheer * 0.85 * (inside ? 0.9 : 1) + sheer * 0.15, zz);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * (ring + 1) + j;
      const b = a + ring + 1;
      if (inside) idx.push(a, b, a + 1, a + 1, b, b + 1);
      else idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// add a boat to the paint mesh at (x, y, z) heading h; moored ones bob and
// carry a riding light
function addBoat(paint, r, colour, x, y, z, h, { moored = false, tilt = 0 } = {}) {
  const L = 5 + r() * 0.8;
  const B = 1.8;
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, h, tilt, 'YXZ')).setPosition(x, y, z);
  const bob = moored ? [x, z, r() * 10] : null;
  const part = (g, c) => paint.add(g.applyMatrix4(m), c, bob);
  part(hullGeometry(L, B, 0.9), COL(colour));
  part(hullGeometry(L, B, 0.9, true), COL('#8a6a4a'));
  part(new THREE.TorusGeometry(1, 0.045, 5, 36).scale(B * 0.5, L * 0.5, 1).rotateX(Math.PI / 2).translate(0, 0.13, 0), COL('#e8e2d6'));
  for (const zz of [-0.9, 0.3, 1.4]) part(new THREE.BoxGeometry(B * 0.85, 0.05, 0.26).translate(0, -0.12, zz), COL('#6d5238'));
  part(new THREE.SphereGeometry(0.4, 8, 5).scale(1, 0.35, 1.3).translate(0.2, -0.12, 0.9), COL('#4a6a5a'));
  if (moored) {
    part(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 6).translate(0, 1.1, -L * 0.25), COL('#6d5238'));
    part(new THREE.CylinderGeometry(0.07, 0.08, 0.18, 8).translate(0, 2.45, -L * 0.25), COL('#ffc46e', 6));
  }
}

// ------------------------------------------------------------ lighthouse

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
  // uv.y runs from 1 at the lamp to 0 at the far end of the cone
  float along = clamp(1.0 - vAlong, 0.0, 1.0);
  float fall = pow(1.0 - along, 2.2) * smoothstep(0.0, 0.03, along);
  // brightest down the middle of the shaft, nothing at its silhouette
  float face = pow(abs(dot(vN, vV)), 2.0);
  gl_FragColor = vec4(uColor * uStrength * fall * face, 0.0);
}`;

// the tower in its own space (ground at y = 0); iron, dome and windows go
// into the paint mesh through the matrix m
function lighthouse(paint, m, fxLayer) {
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
  const tower = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), new THREE.MeshStandardMaterial({ map: bandTexture(), roughness: 0.55 }));
  tower.castShadow = tower.receiveShadow = true;
  g.add(tower);
  const add = (geo, c) => paint.add(geo.applyMatrix4(m), c);
  add(new THREE.CylinderGeometry(2.45, 2.3, 0.3, 28).translate(0, H + 0.1, 0), IRON);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    add(new THREE.BoxGeometry(0.05, 1.0, 0.05).translate(Math.cos(a) * 2.35, H + 0.75, Math.sin(a) * 2.35), IRON);
  }
  add(new THREE.TorusGeometry(2.35, 0.04, 4, 40).rotateX(Math.PI / 2).translate(0, H + 1.25, 0), IRON);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
    add(new THREE.BoxGeometry(0.07, 1.95, 0.07).translate(Math.cos(a) * 1.27, H + 1.2, Math.sin(a) * 1.27), IRON);
  }
  add(new THREE.CylinderGeometry(1.35, 1.35, 0.35, 20).translate(0, H + 0.2, 0), IRON);
  add(new THREE.SphereGeometry(1.45, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1).translate(0, H + 2.15, 0), COL('#5a1c18'));
  add(new THREE.SphereGeometry(0.2, 10, 6).translate(0, H + 3.35, 0), IRON);
  add(new THREE.BoxGeometry(1.1, 2.1, 0.3).translate(0, 1.05, 2.4), COL('#2c4a5e'));
  for (const [y, a] of [[6, 0.3], [10.5, -0.4]]) {
    const rr = y < 8 ? 2.14 : 1.9;
    add(new THREE.BoxGeometry(0.5, 0.8, 0.05).rotateY(a).translate(Math.sin(a) * rr, y, Math.cos(a) * rr), COL('#ffc27a', 2.4));
  }
  // the lantern room's glass and the lamp inside (their glow swells as a
  // beam comes round), and two soft beams opposite each other
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x20180e, emissive: new THREE.Color('#ffc98a'), emissiveIntensity: 1.2, roughness: 0.15 });
  const room = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 1.9, 10, 1, true), glassMat);
  room.position.y = H + 1.2;
  g.add(room);
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').multiplyScalar(8) });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), lampMat);
  lamp.position.y = H + 1.2;
  g.add(lamp);
  const cone = new THREE.ConeGeometry(16, 230, 24, 1, true);
  cone.translate(0, -115, 0);
  cone.rotateZ(Math.PI / 2 - 0.02); // apex at the lamp, out along +x, dipping a touch
  const beamGeo = merge([cone, cone.clone().rotateY(Math.PI)]);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#ffd39a') }, uStrength: { value: 0.07 } },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    side: THREE.DoubleSide,
  });
  const spin = new THREE.Mesh(beamGeo, beamMat);
  spin.position.y = H + 1.2;
  spin.layers.set(fxLayer);
  spin.frustumCulled = false;
  g.add(spin);
  return { group: g, spin, lampMat, glassMat, beamMat, height: H + 1.2 };
}

// ------------------------------------------------------------ the village

export function makeVillage({ quality, PIER, MOORED, KNOLL, height, shoreX, fxLayer }) {
  const group = new THREE.Group();
  group.name = 'village';
  const r = rng(301);
  const low = quality.tier === 'low';
  const paint = new Paint();
  const walls = [];
  const roofs = [];
  const glass = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const place = (parts, x, y, z, ry) => {
    m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, ry), one);
    for (const g of parts.walls) walls.push(keep(g, ['position', 'normal', 'uv', 'color']).applyMatrix4(m));
    for (const g of parts.roof) roofs.push(keep(g, ['position', 'normal', 'uv', 'color']).applyMatrix4(m));
    for (const g of parts.glass) glass.push(keep(g, ['position', 'normal', 'uv', 'color']).applyMatrix4(m));
    for (const p of parts.lamps) paint.add(new THREE.BoxGeometry(0.2, 0.28, 0.2).translate(p.x, p.y, p.z).applyMatrix4(m), LAMP);
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
      const tall = k < 2 && r() < 0.4;
      place(cottage(r, { W, D, H: tall ? 5.1 : 2.8, twoStorey: tall, pitch: 0.62 + r() * 0.18, door: DOORS[Math.floor(r() * DOORS.length)], porchLamp: r() < 0.5 }), x, y - 0.05, zc, ry);
    }
  });
  // the keeper's cottage beside the lighthouse
  const lhx = KNOLL.x + 2;
  const lhz = KNOLL.z - 1;
  const lhy = height(lhx, lhz) - 0.3;
  {
    const kx = lhx + 9;
    const kz = lhz + 5;
    place(cottage(r, { W: 7, D: 4.8, H: 2.8, pitch: 0.7, door: DOORS[0], porchLamp: true, litOdds: 1 }), kx, height(kx, kz) - 0.1, kz, -Math.PI / 2 - 0.5);
  }
  const wallMesh = new THREE.Mesh(merge(walls), new THREE.MeshStandardMaterial({ map: whitewashTexture(), vertexColors: true, roughness: 0.88 }));
  const roofMesh = new THREE.Mesh(merge(roofs), new THREE.MeshStandardMaterial({ map: slateTexture(), vertexColors: true, roughness: 0.62 }));
  const glassMesh = new THREE.Mesh(merge(glass), new THREE.MeshBasicMaterial({ map: windowTexture(), vertexColors: true, color: new THREE.Color(2.6, 2.6, 2.6) }));
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  roofMesh.castShadow = roofMesh.receiveShadow = true;
  group.add(wallMesh, roofMesh, glassMesh);

  // ---- the promenade: sea wall, lamp posts and lantern strings
  const zA = -128;
  const zB = 76;
  let prev = null;
  for (let z = zA; z <= zB; z += 4) {
    const x = shoreX(z) + 15;
    if (prev) {
      const dx = x - prev.x;
      const dz = z - prev.z;
      const seg = new THREE.BoxGeometry(0.6, 1.8, Math.hypot(dx, dz) + 0.1);
      seg.rotateY(Math.atan2(dx, dz));
      seg.translate((x + prev.x) / 2, height((x + prev.x) / 2, (z + prev.z) / 2) - 0.3, (z + prev.z) / 2);
      paint.add(seg, STONE);
    }
    prev = { x, z };
  }
  const posts = [];
  for (let z = zA + 6; z <= zB; z += 16) {
    if (Math.abs(z - PIER.z) < 3) continue;
    const x = shoreX(z) + 16.2;
    posts.push({ x, y: height(x, z), z });
  }
  const postGeo = merge([
    new THREE.CylinderGeometry(0.07, 0.1, 3.4, 6).translate(0, 1.7, 0),
    new THREE.CylinderGeometry(0.16, 0.2, 0.35, 6).translate(0, 0.17, 0),
    new THREE.BoxGeometry(0.34, 0.06, 0.34).translate(0, 3.42, 0),
    new THREE.ConeGeometry(0.28, 0.3, 4).rotateY(Math.PI / 4).translate(0, 3.95, 0),
  ].map((g) => keep(g, ['position', 'normal'])));
  const headGeo = new THREE.BoxGeometry(0.26, 0.36, 0.26).translate(0, 3.63, 0);
  paint.scatter(postGeo, IRON, posts);
  paint.scatter(headGeo, LAMP, posts);

  // strings of paper lanterns hanging from sagging wires
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
      lanterns.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t) - 0.22, z: a.z + (b.z - a.z) * t, s: 0.9 + r() * 0.25 });
    }
  };
  for (let i = 1; i < posts.length; i++) {
    const a = posts[i - 1];
    const b = posts[i];
    string({ x: a.x, y: a.y + 3.35, z: a.z }, { x: b.x, y: b.y + 3.35, z: b.z }, 8, 0.7);
  }

  // ---- the pier: a planked deck on piles, rails, and poles hung with lanterns
  const deckY = PIER.deck;
  const len = PIER.x0 - PIER.x1;
  const deck = merge([
    faceUV(new THREE.BoxGeometry(len, 0.2, PIER.width).toNonIndexed()).translate(PIER.x1 + len / 2, deckY, PIER.z),
    faceUV(new THREE.BoxGeometry(PIER.headDepth, 0.2, PIER.head).toNonIndexed()).translate(PIER.x1 + PIER.headDepth / 2, deckY + 0.001, PIER.z),
  ]);
  const deckMesh = new THREE.Mesh(deck, new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.82 }));
  deckMesh.castShadow = deckMesh.receiveShadow = true;
  group.add(deckMesh);
  const hw = PIER.width / 2;
  const hx = PIER.x1 + PIER.headDepth;
  const piles = [];
  for (let x = PIER.x1 + 0.2; x <= PIER.x0 - 2; x += 3.6) for (const s of [-1, 1]) piles.push({ x, y: deckY - 3.9, z: PIER.z + s * (hw + 0.05) });
  for (const s of [-1, 1]) {
    for (const k of [0.45, 1]) {
      piles.push({ x: PIER.x1 + 0.2, y: deckY - 3.9, z: PIER.z + s * PIER.head * 0.5 * k });
      piles.push({ x: hx - 0.2, y: deckY - 3.9, z: PIER.z + s * PIER.head * 0.5 * k });
    }
  }
  paint.scatter(new THREE.CylinderGeometry(0.16, 0.19, 7.6, 7), WOOD, piles);
  const rail = (x0, z0, x1, z1) => {
    const L2 = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(x1 - x0, z1 - z0);
    for (const hy of [0.55, 1.05]) paint.add(new THREE.BoxGeometry(0.07, 0.08, L2).rotateY(ang).translate((x0 + x1) / 2, deckY + hy, (z0 + z1) / 2), WOOD);
    const n = Math.max(1, Math.round(L2 / 2.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      paint.add(new THREE.BoxGeometry(0.1, 1.1, 0.1).translate(x0 + (x1 - x0) * t, deckY + 0.55, z0 + (z1 - z0) * t), WOOD);
    }
  };
  rail(hx, PIER.z - hw, PIER.x0 - 1, PIER.z - hw);
  rail(hx, PIER.z + hw, PIER.x0 - 1, PIER.z + hw);
  rail(PIER.x1, PIER.z - PIER.head / 2, PIER.x1, PIER.z + PIER.head / 2);
  rail(PIER.x1, PIER.z - PIER.head / 2, hx, PIER.z - PIER.head / 2);
  rail(PIER.x1, PIER.z + PIER.head / 2, hx, PIER.z + PIER.head / 2);
  rail(hx, PIER.z - PIER.head / 2, hx, PIER.z - hw);
  rail(hx, PIER.z + hw, hx, PIER.z + PIER.head / 2);
  const poles = [];
  for (let x = hx + 0.5; x <= PIER.x0 - 1; x += 8.5) for (const s of [-1, 1]) poles.push({ x, y: deckY, z: PIER.z + s * (hw + 0.02) });
  const corners = [-1, 1].map((s) => ({ x: PIER.x1 + 0.1, y: deckY, z: PIER.z + s * (PIER.head / 2 - 0.1) }));
  paint.scatter(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 5).translate(0, 1.6, 0), WOOD, [...poles, ...corners]);
  const topY = deckY + 3.1;
  for (const s of [-1, 1]) {
    const side = poles.filter((p) => Math.sign(p.z - PIER.z) === s).sort((a, b) => a.x - b.x);
    for (let i = 1; i < side.length; i++) string({ x: side[i - 1].x, y: topY, z: side[i - 1].z }, { x: side[i].x, y: topY, z: side[i].z }, 6, 0.5);
    const c = corners[s < 0 ? 0 : 1];
    string({ x: side[0].x, y: topY, z: side[0].z }, { x: c.x, y: topY, z: c.z }, 6, 0.4);
  }
  // across the pier every other pair of poles, zig-zagging, and across the head
  const left = poles.filter((p) => p.z < PIER.z).sort((a, b) => a.x - b.x);
  const right = poles.filter((p) => p.z > PIER.z).sort((a, b) => a.x - b.x);
  for (let i = 0; i + 1 < Math.min(left.length, right.length); i += 2) string({ x: left[i].x, y: topY, z: left[i].z }, { x: right[i + 1].x, y: topY, z: right[i + 1].z }, 5, 0.45);
  string({ x: corners[0].x, y: topY, z: corners[0].z }, { x: corners[1].x, y: topY, z: corners[1].z }, 10, 0.7);
  // the lamp on the pier head, benches, lobster pots and a life ring
  const pierLamp = { x: PIER.x1 + 2.5, y: deckY, z: PIER.z };
  paint.scatter(postGeo, IRON, [pierLamp]);
  paint.scatter(headGeo, LAMP, [pierLamp]);
  const bench = [
    new THREE.BoxGeometry(1.8, 0.06, 0.45).translate(0, 0.45, 0),
    new THREE.BoxGeometry(1.8, 0.4, 0.05).translate(0, 0.7, -0.22),
    new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(-0.8, 0.22, 0),
    new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(0.8, 0.22, 0),
  ];
  for (const [bz, bry] of [[PIER.z - PIER.head / 2 + 1.2, 0], [PIER.z + PIER.head / 2 - 1.2, Math.PI]]) {
    for (const b of bench) paint.add(b.clone().rotateY(bry).translate(PIER.x1 + 3.2, deckY + 0.1, bz), WOOD);
  }
  for (let i = 0; i < 5; i++) {
    const g = new THREE.BoxGeometry(0.8, 0.45, 0.55).rotateY((r() - 0.5) * 0.2).translate(PIER.x0 - 12 - (i % 3) * 0.85, deckY + 0.32 + Math.floor(i / 3) * 0.46, PIER.z + hw - 0.5);
    paint.add(g, COL('#5b4a36'));
  }
  paint.add(new THREE.TorusGeometry(0.34, 0.08, 6, 16).rotateY(Math.PI / 2).translate(PIER.x1 + 0.12, deckY + 0.8, PIER.z + 2), COL('#d9542c'));

  // ---- the lanterns and their wires
  const time = { value: 0 };
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
  float k = 1.0 - position.y * 4.0;
  transformed.x += (sin(uTime * 1.3 + ph) * 0.5 + sin(uTime * 0.7 + ph * 2.1) * 0.5) * 0.035 * k;
  transformed.z += cos(uTime * 1.1 + ph) * 0.03 * k;
#endif`,
      );
  };
  paperMat.customProgramCacheKey = () => 'bay-paper-lantern';
  const lanternGeo = new THREE.SphereGeometry(0.16, 10, 6);
  lanternGeo.scale(1, 1.2, 1);
  const lanternMesh = new THREE.InstancedMesh(lanternGeo, paperMat, lanterns.length);
  const tints = ['#ffb366', '#ffd08c', '#ff9a66', '#ff7a55', '#ffc9a0', '#ff8c7a'].map((h) => COL(h));
  const lm = new THREE.Matrix4();
  lanterns.forEach((l, i) => {
    lm.makeScale(l.s, l.s, l.s).setPosition(l.x, l.y, l.z);
    lanternMesh.setMatrixAt(i, lm);
    lanternMesh.setColorAt(i, tints[Math.floor(r() * tints.length)]);
  });
  lanternMesh.computeBoundingSphere();
  group.add(lanternMesh);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  group.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x151515 })));

  // ---- fishing boats: three at their moorings, two drawn up on the sand
  const colours = ['#2f5f8a', '#a8372e', '#2f6d55', '#d8d2c4', '#3b4f7a'];
  MOORED.forEach(([x, z, h], i) => addBoat(paint, r, colours[i % colours.length], x, 0.3, z, h, { moored: true }));
  for (let i = 0; i < 2; i++) {
    const z = PIER.z + 14 + i * 7;
    const x = shoreX(z) + 5 + i * 1.5;
    addBoat(paint, r, colours[i + 3], x, height(x, z) + 0.45, z, Math.PI / 2 + 0.3 - i * 0.5, { tilt: 0.12 });
  }

  // ---- the lighthouse on its knoll
  const lh = lighthouse(paint, new THREE.Matrix4().makeTranslation(lhx, lhy, lhz), fxLayer);
  lh.group.position.set(lhx, lhy, lhz);
  group.add(lh.group);
  const lampWorld = new THREE.Vector3(lhx, lhy + lh.height, lhz);

  const paintMesh = paint.mesh();
  group.add(paintMesh);

  // ---- a few real lights: the pier head and along the front
  const addLight = (x, y, z, intensity, dist) => {
    const l = new THREE.PointLight(0xffb870, intensity, dist, 2);
    l.position.set(x, y, z);
    group.add(l);
  };
  addLight(pierLamp.x, deckY + 3.4, PIER.z, 60, 38);
  addLight(shoreX(-70) + 18, height(shoreX(-70) + 18, -70) + 3.6, -70, 70, 45);
  if (!low) addLight(shoreX(30) + 18, height(shoreX(30) + 18, 30) + 3.6, 30, 70, 45);

  const toCam = new THREE.Vector3();
  const beamDir = new THREE.Vector3();
  return {
    group,
    houses,
    lamp: lampWorld,
    beam: lh.beamMat,
    update(dt, t, view) {
      time.value = t;
      paintMesh.userData.time.value = t;
      // the lamp turns once every 24 s and flares softly as a beam comes round
      const a = (t * Math.PI * 2) / 24;
      lh.spin.rotation.y = a;
      toCam.copy(view.cam).sub(lampWorld);
      toCam.y = 0;
      toCam.normalize();
      beamDir.set(Math.cos(a), 0, -Math.sin(a));
      const flare = Math.pow(Math.abs(beamDir.dot(toCam)), 60);
      lh.lampMat.color.setRGB(1, 0.85, 0.63).multiplyScalar(7 + 40 * flare);
      lh.glassMat.emissiveIntensity = 1.1 + 1.6 * flare;
    },
  };
}
