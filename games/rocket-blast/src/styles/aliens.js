// Cute Aliens: squishy gumdrop blobs of glossy jelly vinyl that glow in their
// candy colour, with one, two or three googly eyes, wobbly antennae topped by
// glowing bobbles, stubby waving arms, rosy cheeks and a happy open mouth.
import * as THREE from 'three';
import { mergeGeometries, clean } from '../geometry.js';
import { vinylMaterial } from '../materials.js';
import { PartBatch, enemyMatrix, partMatrix, eyeOpen } from './common.js';

const M = new THREE.Matrix4(); // the enemy
const B = new THREE.Matrix4(); // the enemy plus its idle jelly breathing
const E = new THREE.Matrix4(); // one eye's frame, tangent to the body
const P = new THREE.Matrix4(); // one part
const C = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);
const MOUTH_RED = new THREE.Color('#5c0d1c');
const TONGUE = new THREE.Color('#ff6f8e');

// body: a lathe gumdrop, a little wider low down, a little flat front to back
const R = 0.4;
const H = 0.8;
const Y0 = -0.06;
const ZS = 0.9;
const STALK = 0.16; // antenna length

function profile(n = 30) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    const s = Math.sin(a);
    const c = Math.max(0, Math.cos(a));
    const k = s < 0 ? 2.8 : 2.1; // flatter seat, round dome
    const y = Math.sign(s) * Math.abs(s) ** (2 / k);
    const x = i === 0 || i === n ? 0 : c ** (2 / k) * (1 - 0.13 * y);
    pts.push(new THREE.Vector2(x * R, Y0 + (y * H) / 2));
  }
  return pts;
}

const PROFILE = profile();

// Body radius at height y (front half of the lathe profile).
function radiusAt(y) {
  const p = PROFILE;
  if (y <= p[0].y) return 0;
  for (let i = 1; i < p.length; i++) {
    if (y <= p[i].y) {
      const k = (y - p[i - 1].y) / (p[i].y - p[i - 1].y);
      return p[i - 1].x + (p[i].x - p[i - 1].x) * k;
    }
  }
  return 0;
}

// Where the front surface is at (x, y), and the rotation that faces its normal.
function surface(x, y, inset = 0) {
  const r = radiusAt(y);
  const z = ZS * Math.sqrt(Math.max(0, r * r - x * x));
  const dr = (radiusAt(y + 0.005) - radiusAt(y - 0.005)) / 0.01;
  const n = new THREE.Vector3(x, -r * dr, z / (ZS * ZS)).normalize();
  return { x: x - n.x * inset, y: y - n.y * inset, z: z - n.z * inset, rx: Math.atan2(-n.y, n.z), ry: Math.asin(n.x) };
}

// Height of the top of the dome at a given x.
function topAt(x) {
  let y = PROFILE[PROFILE.length - 1].y;
  while (y > 0 && radiusAt(y) < Math.abs(x)) y -= 0.002;
  return y;
}

function bodyGeometry() {
  const g = new THREE.LatheGeometry(PROFILE, 48);
  g.scale(1, 1, ZS);
  return g;
}

// An open "D" smile with a tongue, bent to hug the round body; the two
// colours are baked in so it is a single draw.
function mouthGeometry() {
  const s = new THREE.Shape();
  const w = 0.125;
  s.moveTo(-w, 0.015);
  s.quadraticCurveTo(0, -0.012, w, 0.015);
  s.absarc(0, 0.015, w, 0, -Math.PI, true);
  const lip = new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.014, bevelSegments: 3, curveSegments: 18 });
  const tongue = new THREE.SphereGeometry(0.062, 16, 10);
  tongue.scale(1, 0.46, 0.42);
  tongue.translate(0, -0.075, 0.012);
  const parts = [lip, tongue].map((g, i) => {
    const c = clean(g);
    const col = i ? TONGUE : MOUTH_RED;
    const n = c.attributes.position.count;
    if (!c.index) c.setIndex(Array.from({ length: n }, (_, j) => j)); // merge wants indexed parts
    const arr = new Float32Array(n * 3);
    for (let j = 0; j < n; j++) arr.set([col.r, col.g, col.b], j * 3);
    c.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    return c;
  });
  const g = mergeGeometries(parts);
  // wrap round the body's curve
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) - (pos.getX(i) ** 2) / (2 * 0.42));
  g.computeVertexNormals();
  return g;
}

// A capsule with its base at the origin, growing up +y (arms and antenna stalks).
function limbGeometry() {
  const g = new THREE.CapsuleGeometry(0.06, 0.08, 6, 14);
  g.translate(0, 0.1, 0);
  return g;
}

// Adds shader code to a material under its own program cache key.
function patch(m, key, fn) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    fn(shader);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// Jelly vinyl with a pale belly and rosy cheeks painted on in the shader.
function bodyMaterial() {
  const m = vinylMaterial({ roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, sss: 0.5, sheen: 0.18 });
  return patch(m, 'rb-alien-body', (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal;').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  {
    float front = smoothstep(0.02, 0.22, vLocal.z);
    vec2 b = (vLocal.xy - vec2(0.0, -0.31)) / vec2(0.26, 0.15);
    float belly = (1.0 - smoothstep(0.35, 1.0, length(b))) * front;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.4 + vec3(0.62, 0.6, 0.56), belly * 0.55);
    vec2 ck = vec2(abs(vLocal.x) - 0.285, vLocal.y + 0.165) / vec2(0.065, 0.05);
    float cheek = (1.0 - smoothstep(0.3, 1.0, length(ck))) * front;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.42, 0.58), cheek * 0.55);
    // a touch deeper colour up top, like thicker jelly
    diffuseColor.rgb *= 0.9 + 0.1 * smoothstep(0.35, -0.2, vLocal.y);
  }`,
    );
  });
}

// Light bulbs: the instance colour (HDR) is the glow; a clear coat on top.
function bulbMaterial(key) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
  return patch(m, key, (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
  {
    float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    totalEmissiveRadiance += vColor.rgb * (0.45 + 0.55 * ndv);
  }`,
    );
  });
}

// One eye layout per variant: 1 big cyclops eye, 2 eyes, or 3 eyes.
function layouts() {
  const eye = (x, y, s, p) => ({ ...surface(x, y, 0.015 * s), s, p });
  const mouth = (y, w) => ({ ...surface(0, y, 0.01), w });
  return [
    { eyes: [eye(0, 0.05, 1.32, 0)], mouth: mouth(-0.235, 1) },
    { eyes: [eye(-0.168, 0.045, 0.88, 0), eye(0.168, 0.045, 0.88, 1)], mouth: mouth(-0.175, 1) },
    { eyes: [eye(-0.178, -0.015, 0.7, 0), eye(0.178, -0.015, 0.7, 1), eye(0, 0.2, 0.74, 2)], mouth: mouth(-0.215, 0.9) },
  ];
}

export class AliensStyle {
  constructor({ capacity = 160 } = {}) {
    this.group = new THREE.Group();
    const cap = capacity;
    this.layouts = layouts();
    this.stalkBase = topAt(0.11) - 0.03;
    this.armBase = surface(0.36, -0.12);

    this.body = new PartBatch(bodyGeometry(), bodyMaterial(), cap);
    this.white = new PartBatch(new THREE.SphereGeometry(0.19, 28, 18), vinylMaterial({ color: 0xffffff, roughness: 0.12, sss: 0.05, sheen: 0 }), cap * 3, { colors: false });
    this.pupil = new PartBatch(
      new THREE.SphereGeometry(0.1, 20, 12),
      new THREE.MeshPhysicalMaterial({ color: 0x020205, roughness: 0.3, specularIntensity: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.08 }),
      cap * 3,
      { colors: false },
    );
    this.glint = new PartBatch(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6) }), cap * 6, { colors: false });
    this.mouth = new PartBatch(mouthGeometry(), new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.1 }), cap, { colors: false });
    this.limb = new PartBatch(limbGeometry(), vinylMaterial({ roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, sss: 0.45 }), cap * 4);
    this.bobble = new PartBatch(new THREE.SphereGeometry(0.064, 16, 12), bulbMaterial('rb-alien-bulb'), cap * 2);
    this.parts = [this.body, this.white, this.pupil, this.glint, this.mouth, this.limb, this.bobble];
    for (const p of this.parts) this.group.add(p.mesh);
  }

  draw(enemies, t = 0) {
    for (const p of this.parts) p.begin();
    for (const e of enemies) {
      if (e.gone || e.scale <= 0.001) continue;
      enemyMatrix(e, M);
      const v = e.variant;
      const w = t * 3.1 + e.phase;
      // idle jelly breathing (volume-preserving)
      const br = Math.sin(w) * 0.028;
      partMatrix(M, 0, 0, 0, 1 - br * 0.5, 1 + br, 1 - br * 0.5, 0, B);
      const flash = e.hitFlash * 0.8;
      this.body.push(B, e.color, flash);

      // googly eyes
      const L = this.layouts[v % 3];
      const open = eyeOpen(e);
      for (const eye of L.eyes) {
        const s = eye.s;
        partMatrix(B, eye.x, eye.y, eye.z, 1, 1, 1, 0, E, eye.rx, eye.ry);
        this.white.push(partMatrix(E, 0, 0, 0, s, s * open, s * 0.62, 0, P));
        if (open > 0.4) {
          const a = e.pupils[eye.p === 1 ? 1 : 0];
          const b = e.pupils[eye.p === 0 ? 0 : 1];
          const r = 0.072 * s;
          const px = ((a.x + b.x) / 2) * r;
          const py = ((a.y + b.y) / 2) * r * open;
          const ps = 1.12 * s;
          this.pupil.push(partMatrix(E, px, py, 0.085 * s, ps, ps * open, 0.45 * s, 0, P));
          this.glint.push(partMatrix(E, px + 0.042 * s, py + 0.045 * s, 0.13 * s, 0.9 * s, 0.9 * s, 0.5 * s, 0, P));
          this.glint.push(partMatrix(E, px - 0.04 * s, py - 0.038 * s, 0.13 * s, 0.5 * s, 0.5 * s, 0.3 * s, 0, P));
        }
      }

      // mouth opens wider when squashed
      const m = L.mouth;
      const gape = 1 + Math.max(0, e.squash) * 1.6 + (e.dying ? 0.45 : 0) + (e.hitFlash > 0.2 ? 0.3 : 0);
      this.mouth.push(partMatrix(B, 0, m.y, m.z, m.w * (1 + (v % 7) * 0.02), gape, 1, 0, P, m.rx));

      // antennae: springy stalks that whip when squashed, glowing bobbles
      const splay = Math.max(-0.3, e.squash) * 1.4;
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const rz = -side * (0.34 + splay + ((v >> 2) % 3) * 0.06) + Math.sin(t * 4.3 + e.phase + i * 1.9) * 0.13;
        const rx = -0.22 + Math.sin(t * 3.4 + e.phase * 1.3 + i) * 0.06;
        const bx = side * 0.11;
        const by = this.stalkBase;
        this.limb.push(partMatrix(B, bx, by, 0, 0.3, 0.9, 0.3, rz, P, rx), e.color, flash);
        const len = STALK + 0.035;
        const c = Math.cos(rz) * len;
        C.copy(e.color).lerp(WHITE, 0.25).multiplyScalar(3.3 + Math.sin(t * 3 + e.phase + i * 2.2) * 0.8);
        this.bobble.push(partMatrix(B, bx - Math.sin(rz) * len, by + c * Math.cos(rx), c * Math.sin(rx), 1, 1, 1, 0, P), C, flash);
      }

      // stubby arms; some aliens wave hello
      const waver = (v >> 4) % 3 === 0;
      const ab = this.armBase;
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const wave = waver && i === 1;
        let rz = side * -2.05 + side * Math.sin(t * 3.7 + e.phase + i) * 0.14 - side * e.squash * 0.9;
        if (wave) rz = -0.62 + Math.sin(t * 9 + e.phase) * 0.38;
        this.limb.push(partMatrix(B, side * (ab.x - 0.035), ab.y, ab.z * 0.7, 1.2, wave ? 1 : 0.85, 1.2, rz, P, 0, -side * 0.2), e.color, flash);
      }
    }
    for (const p of this.parts) p.end();
  }

  dispose() {
    for (const p of this.parts) p.dispose();
  }
}
