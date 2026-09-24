// Friendly Robots: chunky toy robot heads in glossy candy-painted metal with
// white trim and chrome ear bolts, a dark glass visor where glowing LED eyes
// follow the rocket, blink and squint above a light-up smile, and a springy
// antenna with a blinking light on top.
import * as THREE from 'three';
import { roundedBox } from '../geometry.js';
import { paintMaterial, chromeMaterial, vinylMaterial } from '../materials.js';
import { PartBatch, enemyMatrix, partMatrix, eyeOpen } from './common.js';

const M = new THREE.Matrix4();
const P = new THREE.Matrix4();
const C = new THREE.Color();

// head box and visor
const HW = 0.8;
const HH = 0.74;
const HD = 0.66;
const HY = -0.04; // head centre
const FRONT = HD / 2; // front face z
const VW = 0.6; // visor
const VH = 0.4;
const VY = -0.01;
const LED_Z = FRONT + 0.035;

const EYE_COLORS = [new THREE.Color(0.25, 2.0, 3.6), new THREE.Color(0.35, 2.5, 0.8), new THREE.Color(0.25, 2.0, 3.6), new THREE.Color(2.7, 1.6, 0.25)];
const EYE_WHITE = new THREE.Color(2.6, 2.6, 2.6);
const CHEEK = new THREE.Color(1.6, 0.4, 0.7);
const TIP_COLORS = [new THREE.Color(3.4, 0.55, 0.7), new THREE.Color(3.3, 2.4, 0.5)];
const EAR = new THREE.Color(0.6, 2.2, 3.4);
const STATUS = [new THREE.Color(3.2, 0.6, 0.6), new THREE.Color(3.2, 2.5, 0.5), new THREE.Color(0.7, 3.2, 0.9)];

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// The white plastic frame round the visor.
function bezelGeometry() {
  const s = roundedRect(VW + 0.08, VH + 0.08, 0.14);
  const hole = roundedRect(VW - 0.005, VH - 0.005, 0.1);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.016, bevelSegments: 4, curveSegments: 10 });
  g.translate(0, VY, FRONT - 0.012);
  g.computeVertexNormals();
  return g;
}

// The dark glass screen: a slightly domed pane that fills the frame.
function visorGeometry() {
  const g = new THREE.ExtrudeGeometry(roundedRect(VW - 0.02, VH - 0.02, 0.09), { depth: 0.01, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 4, curveSegments: 10 });
  g.translate(0, VY, FRONT - 0.01);
  g.computeVertexNormals();
  return g;
}

// A unit cylinder standing on the origin (ear bolts, antenna base and stalk).
function rodGeometry() {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1);
  g.translate(0, 0.5, 0);
  return g;
}

// A light-up smile: an arc of tube, bottom-centred.
function smileGeometry() {
  const arc = Math.PI * 0.78;
  const g = new THREE.TorusGeometry(0.1, 0.02, 10, 32, arc);
  g.rotateZ(-Math.PI / 2 - arc / 2);
  g.scale(1, 1, 0.55);
  return g;
}

// Glowing LEDs: the (HDR) instance colour is the light, under a glossy lens.
function ledMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04 });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
  {
    float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    totalEmissiveRadiance += vColor.rgb * (0.4 + 0.6 * ndv);
  }`,
    );
  };
  m.customProgramCacheKey = () => 'rb-robot-led';
  return m;
}

export class RobotsStyle {
  constructor({ capacity = 160 } = {}) {
    this.group = new THREE.Group();
    const cap = capacity;
    const head = roundedBox(HW, HH, HD, 0.17, 5);
    head.translate(0, HY, 0);
    this.body = new PartBatch(head, paintMaterial(0xffffff, { roughness: 0.3, metalness: 0.1 }), cap);
    this.bezel = new PartBatch(bezelGeometry(), vinylMaterial({ color: 0xf6f7fb, roughness: 0.2, sss: 0.12, sheen: 0 }), cap, { colors: false });
    this.visor = new PartBatch(
      visorGeometry(),
      new THREE.MeshPhysicalMaterial({ color: 0x0a1020, roughness: 0.06, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02 }),
      cap,
      { colors: false },
    );
    this.chrome = new PartBatch(rodGeometry(), chromeMaterial(0xe4e8ee, 0.16), cap * 6, { colors: false });
    const led = ledMaterial();
    this.led = new PartBatch(new THREE.SphereGeometry(0.5, 18, 10), led, cap * 12);
    this.smile = new PartBatch(smileGeometry(), led, cap * 3);
    this.parts = [this.body, this.bezel, this.visor, this.chrome, this.led, this.smile];
    for (const p of this.parts) this.group.add(p.mesh);
  }

  draw(enemies, t = 0) {
    for (const p of this.parts) p.begin();
    const top = HY + HH / 2;
    for (const e of enemies) {
      if (e.gone || e.scale <= 0.001) continue;
      enemyMatrix(e, M);
      const v = e.variant;
      const flash = e.hitFlash * 0.8;
      this.body.push(M, e.color, flash);
      this.bezel.push(M);
      this.visor.push(M);

      // ear bolts with little lights that breathe in turn
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        this.chrome.push(partMatrix(M, side * (HW / 2 - 0.03), 0.02, 0, 0.2, 0.06, 0.2, -side * Math.PI / 2, P));
        this.chrome.push(partMatrix(M, side * (HW / 2 + 0.025), 0.02, 0, 0.11, 0.045, 0.11, -side * Math.PI / 2, P));
        const k = 0.55 + 0.45 * Math.sin(t * 2.4 + e.phase + i * Math.PI);
        C.copy(EAR).multiplyScalar(0.35 + k * 0.75);
        this.led.push(partMatrix(M, side * (HW / 2 + 0.075), 0.02, 0, 0.04, 0.085, 0.085, 0, P), C, flash);
      }

      // springy antenna: whips when squashed, light blinks
      const rz = Math.sin(t * 3.3 + e.phase) * 0.1 + e.squashV * 0.012;
      const rx = Math.sin(t * 2.6 + e.phase * 1.7) * 0.06;
      this.chrome.push(partMatrix(M, 0, top - 0.02, 0, 0.14, 0.05, 0.14, 0, P));
      const len = 0.15;
      this.chrome.push(partMatrix(M, 0, top, 0, 0.032, len, 0.032, rz, P, rx));
      const on = (t * 1.1 + e.phase) % 1 < 0.45;
      C.copy(TIP_COLORS[(v >> 3) & 1]).multiplyScalar(on ? 1 : 0.18);
      const c = Math.cos(rz) * (len + 0.03);
      this.led.push(partMatrix(M, -Math.sin(rz) * (len + 0.03), top + c * Math.cos(rx), c * Math.sin(rx), 0.1, 0.1, 0.1, 0, P), C, flash);

      // LED eyes: they roll with the googly pupils, blink and squint
      const open = eyeOpen(e);
      const happy = e.dying || e.hitFlash > 0.2;
      const shape = v % 3;
      const ew = shape === 1 ? 0.13 : shape === 2 ? 0.17 : 0.15;
      const eh = shape === 1 ? 0.19 : shape === 2 ? 0.12 : 0.15;
      let ci = (v >> 2) % 4;
      if (ci === 3 && (e.colorIndex === 3 || e.colorIndex === 4)) ci = 0; // no amber eyes on yellow or orange
      const eyeC = EYE_COLORS[ci];
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const p = e.pupils[i];
        const ex = side * 0.135 + p.x * 0.035;
        const ey = VY + 0.055 + p.y * 0.03;
        if (happy) {
          // squeezed shut into happy "^ ^" arcs
          this.smile.push(partMatrix(M, ex, ey - 0.03, LED_Z - 0.01, 0.75, 0.65, 1, Math.PI, P), eyeC, flash);
        } else {
          this.led.push(partMatrix(M, ex, ey, LED_Z, ew, eh * open, 0.05, 0, P), eyeC, flash);
          // a bright sparkle in each eye
          if (open > 0.4) this.led.push(partMatrix(M, ex + ew * 0.2, ey + eh * 0.2 * open, LED_Z + 0.015, 0.035, 0.035 * open, 0.02, 0, P), EYE_WHITE, 0);
        }
        // rosy cheek lights
        this.led.push(partMatrix(M, side * 0.215, VY - 0.1, LED_Z - 0.005, 0.075, 0.045, 0.03, 0, P), CHEEK, flash);
      }

      // light-up smile, opening wide when squashed or hit
      const gape = 1 + Math.max(0, e.squash) * 1.8 + (e.dying ? 0.5 : 0) + (e.hitFlash > 0.2 ? 0.4 : 0);
      this.smile.push(partMatrix(M, 0, VY - 0.03, LED_Z - 0.01, 0.95, 0.85 * gape, 1, 0, P), eyeC, flash);

      // three little status lights under the visor, chasing
      for (let i = 0; i < 3; i++) {
        const k = Math.max(0, Math.sin(t * 5 + e.phase - i * 1.1));
        C.copy(STATUS[i]).multiplyScalar(0.25 + k * 0.85);
        this.led.push(partMatrix(M, (i - 1) * 0.075, VY - VH / 2 - 0.085, FRONT + 0.005, 0.042, 0.042, 0.03, 0, P), C, flash);
      }
    }
    for (const p of this.parts) p.end();
  }

  dispose() {
    for (const p of this.parts) p.dispose();
  }
}
