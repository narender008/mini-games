// Ace enemies: eight faceless machine types plus the mine and the shard, each
// a small procedural model of gunmetal plates around a glowing core whose
// colour names the type (dart magenta, gunship orange, diver red, bulwark
// yellow, mine layer teal, mine red, splitter and shard green, sniper violet,
// turret amber). Every type is a few InstancedMeshes (one per material and
// per moving part), so a screen full of enemies costs a few dozen draw calls
// and nothing is allocated per frame.
//
// Models are built nose up (+y) and turned to the enemy's heading (`angle`,
// radians, atan2 convention: -PI/2 points straight down at the player), then
// rolled into sideways moves. Turret pods keep their base still and turn
// only the gun head. Hit flash comes from `hitT` through the per-instance
// emission (`aEmit`, see kit.js); spawning enemies scale in over 0.25 s.
//
// The flat extras go to the bolts batch: engine glows, the bulwark's shield
// arc, telegraph lines (sniper beam, diver lock-on reticle), the diver's red
// streak, and the armed mine's danger ring.
import * as THREE from 'three';
import { Builder, MAT, machine, core, slab, sym, ngon, lathe, GEO, colorOf } from './kit.js';
import { SHAPE } from './bolts.js';

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;

// ------------------------------------------------------------ models
// Each builder returns { parts: [{ b: Builder, anim? }], glows: [[x, y, size]] }
// where `anim(e, t)` returns the local z rotation of that part.

function dart() {
  const b = new Builder();
  const hull = MAT.lilac(true);
  const dark = MAT.dark(true);
  const glow = core('magenta', 4, true);
  // forward-swept arrowhead
  b.add(slab(sym([[0, 0.5], [0.14, 0.16], [0.5, -0.26], [0.44, -0.36], [0.16, -0.18], [0, -0.3]]), 0.07, 0.03), hull);
  b.add(slab(sym([[0, 0.36], [0.08, 0.1], [0.06, -0.22], [0, -0.26]]), 0.12, 0.02), dark, { p: [0, 0, 0.02] });
  b.add(GEO.sphere, glow, { p: [0, 0.02, 0.07], s: [0.13, 0.17, 0.08] });
  b.mirror(GEO.box, glow, { p: [0.4, -0.27, 0.03], r: [0, 0, 0.6], s: [0.1, 0.025, 0.02] });
  return { parts: [{ b }], glows: [[0, -0.3, 0.32]] };
}

function gunship() {
  const b = new Builder();
  const hull = machine('gunship', { color: 0xc9c3b6, metalness: 0.55, roughness: 0.34, clearcoat: 0.5, panel: 0.5, panelScale: 2.6, inst: true });
  const gun = MAT.gunmetal(true);
  const dark = MAT.dark(true);
  const glow = core('orange', 4, true);
  // shield-shaped centre hull
  b.add(slab(sym([[0, -0.78], [0.22, -0.6], [0.36, -0.1], [0.36, 0.42], [0.22, 0.56], [0, 0.6]]), 0.3, 0.06), hull);
  b.add(slab(sym([[0, -0.6], [0.14, -0.46], [0.22, -0.1], [0.22, 0.3], [0, 0.4]]), 0.4, 0.03), gun, { p: [0, 0, 0.03] });
  // twin engine pods, engines at the back (+y: the gunship flies nose down)
  b.mirror(GEO.cyl, gun, { p: [0.55, 0.05, 0], s: [0.24, 1.1, 0.24] });
  b.mirror(GEO.cyl, dark, { p: [0.55, 0.62, 0], s: [0.2, 0.08, 0.2] });
  b.mirror(GEO.cone, hull, { p: [0.55, -0.58, 0], r: [Math.PI, 0, 0], s: [0.24, 0.18, 0.24] });
  b.mirror(GEO.box, dark, { p: [0.38, 0.08, 0], s: [0.2, 0.5, 0.14] });
  b.mirror(GEO.disc, glow, { p: [0.55, 0.665, 0], s: [0.15, 1, 0.15] });
  // gun barrels at the nose
  b.mirror(GEO.cyl, dark, { p: [0.12, -0.82, -0.02], s: [0.05, 0.3, 0.05] });
  // the core: a round orange reactor window
  b.add(GEO.cyl, dark, { p: [0, -0.18, 0.17], r: [HALF_PI, 0, 0], s: [0.32, 0.06, 0.32] });
  b.add(GEO.sphere, glow, { p: [0, -0.18, 0.2], s: [0.22, 0.22, 0.1] });
  b.mirror(GEO.box, glow, { p: [0.1, 0.3, 0.2], s: [0.04, 0.16, 0.02] });
  // gunships fly nose first; turn the model so the nose is +y like the others
  return { parts: [{ b, flip: true }], glows: [[0.55, -0.7, 0.55], [-0.55, -0.7, 0.55]] };
}

function diver() {
  const b = new Builder();
  const hull = MAT.steel(true);
  const dark = MAT.dark(true);
  const glow = core('red', 4.5, true);
  b.add(lathe([[0, 0.62], [0.06, 0.45], [0.13, 0.05], [0.13, -0.3], [0.09, -0.42], [0, -0.42]], 16), hull, { s: [1, 1, 0.75] });
  b.mirror(slab([[0.08, 0.02], [0.42, -0.38], [0.4, -0.44], [0.1, -0.34]], 0.04, 0.012), dark);
  b.mirror(slab([[0.06, 0.34], [0.2, 0.18], [0.2, 0.12], [0.06, 0.2]], 0.03, 0.01), dark);
  b.add(GEO.box, glow, { p: [0, 0.0, 0.1], s: [0.035, 0.6, 0.03] });
  b.add(GEO.sphere, glow, { p: [0, 0.5, 0.04], s: [0.06, 0.12, 0.05] });
  b.add(GEO.disc, glow, { p: [0, -0.44, 0], s: [0.14, 1, 0.1] });
  return { parts: [{ b }], glows: [[0, -0.48, 0.4]] };
}

function bulwark() {
  const b = new Builder();
  const hull = machine('bulwark', { color: 0xa39d8a, metalness: 0.7, roughness: 0.38, panel: 0.55, panelScale: 2.4, inst: true });
  const gun = MAT.gunmetal(true);
  const dark = MAT.dark(true);
  const glow = core('yellow', 3.5, true);
  // a heavy armoured block, widest at the front (nose up: front is +y)
  b.add(slab(sym([[0, 0.62], [0.78, 0.5], [0.9, 0.2], [0.72, -0.42], [0.4, -0.58], [0, -0.58]]), 0.36, 0.06), hull);
  b.add(slab(sym([[0, 0.5], [0.48, 0.44], [0.54, 0.16], [0.46, -0.3], [0, -0.4]]), 0.46, 0.04), gun);
  // core window, framed
  b.add(slab(ngon(6, 0.24, HALF_PI), 0.52, 0.02), dark, { p: [0, 0.04, 0] });
  b.add(slab(ngon(6, 0.17, HALF_PI), 0.56, 0.01), glow, { p: [0, 0.04, 0] });
  // shield emitters on the front corners
  b.mirror(GEO.cyl, dark, { p: [0.62, 0.48, 0.1], s: [0.14, 0.18, 0.14] });
  b.mirror(GEO.sphere, core('cyan', 3, true), { p: [0.62, 0.58, 0.12], s: 0.1 });
  // side vents and rear thrusters
  for (let i = 0; i < 3; i++) b.mirror(GEO.box, dark, { p: [0.72, 0.05 - i * 0.14, 0.17], s: [0.16, 0.05, 0.04] });
  b.mirror(GEO.cyl, dark, { p: [0.36, -0.62, 0], s: [0.18, 0.12, 0.18] });
  return { parts: [{ b }], glows: [[0.36, -0.7, 0.45], [-0.36, -0.7, 0.45]] };
}

function minelayer() {
  const b = new Builder();
  const hull = MAT.plum(true);
  const gun = MAT.gunmetal(true);
  const dark = MAT.dark(true);
  const glow = core('green', 3.5, true);
  // a saucer seen from above: a broad disc, a raised deck and a dome
  b.add(lathe([[0.0, 0.14], [0.36, 0.12], [0.62, 0.05], [0.74, -0.01], [0.66, -0.08], [0.3, -0.12], [0, -0.12]], 40), hull, { r: [HALF_PI, 0, 0] });
  b.add(GEO.cyl, gun, { p: [0, 0, 0.12], r: [HALF_PI, 0, 0], s: [0.62, 0.08, 0.62] });
  b.add(GEO.sphere, dark, { p: [0, 0.0, 0.16], s: [0.3, 0.3, 0.16] });
  b.add(GEO.sphere, glow, { p: [0, 0.0, 0.24], s: [0.13, 0.13, 0.08] });
  // a mine bay at the back
  b.add(GEO.box, dark, { p: [0, 0.5, 0.06], s: [0.34, 0.18, 0.1] });
  // a ring of running lights that turns
  const ring = new Builder();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    ring.add(GEO.box, glow, { p: [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.17], r: [0, 0, a], s: [0.05, 0.1, 0.03] });
  }
  return { parts: [{ b }, { b: ring, anim: (e, t) => t * 1.6 }], glows: [] };
}

function mine() {
  const b = new Builder();
  const hull = MAT.dark(true);
  const spike = MAT.steel(true);
  const glow = core('red', 4, true);
  b.add(GEO.sphere, hull, { s: 0.42 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.add(GEO.cone, spike, { p: [Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0], r: [0, 0, a - HALF_PI], s: [0.1, 0.18, 0.1] });
  }
  b.add(GEO.cone, spike, { p: [0, 0, 0.27], r: [HALF_PI, 0, 0], s: [0.1, 0.18, 0.1] });
  b.add(GEO.sphere, glow, { p: [0, 0, 0.2], s: [0.14, 0.14, 0.06] });
  b.add(GEO.torus, glow, { s: [0.44, 0.44, 0.3] });
  return { parts: [{ b, anim: (e, t) => t * 1.4 + (e.id || 0) }], glows: [] };
}

// one wedge of the splitter; also the shard
function wedge(b, mat, glow, s = 1, p = [0, 0, 0], rz = 0) {
  const m = new THREE.Matrix4().makeRotationZ(rz).setPosition(p[0], p[1], p[2]);
  b.add(slab([[0, 0.62 * s], [0.34 * s, -0.08 * s], [0, -0.22 * s], [-0.34 * s, -0.08 * s]], 0.16 * s, 0.04 * s), mat, { m });
  b.add(slab([[0, 0.36 * s], [0.08 * s, 0.04 * s], [0, -0.04 * s], [-0.08 * s, 0.04 * s]], 0.24 * s, 0.01), glow, { m });
  b.add(slab([[0, 0.5 * s], [0.24 * s, -0.02 * s], [0, -0.14 * s], [-0.24 * s, -0.02 * s]], 0.2 * s, 0.02 * s), MAT.dark(true), { m });
}

function splitter() {
  const outer = new Builder();
  const hull = MAT.steel(true);
  const glow = core('green', 3.5, true);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    wedge(outer, hull, glow, 0.95, [-Math.sin(a) * 0.32, Math.cos(a) * 0.32, 0], a);
  }
  const mid = new Builder();
  mid.add(GEO.ico, MAT.dark(true), { s: 0.42 });
  mid.add(GEO.ico, glow, { s: 0.26 });
  return { parts: [{ b: outer, anim: (e, t) => t * 0.9 }, { b: mid, anim: (e, t) => -t * 2 }], glows: [] };
}

function shard() {
  const b = new Builder();
  wedge(b, MAT.steel(true), core('green', 3.5, true), 0.75);
  return { parts: [{ b, anim: (e, t) => t * 5 + (e.id || 0) }], glows: [] };
}

function sniper() {
  const b = new Builder();
  const hull = MAT.gunmetal(true);
  const dark = MAT.dark(true);
  const light = MAT.steel(true);
  const glow = core('violet', 4, true);
  // a long rail gun with a slim body slung under it, nose up
  b.mirror(GEO.box, light, { p: [0.07, 0.25, 0.04], s: [0.045, 1.1, 0.07] });
  b.add(GEO.box, glow, { p: [0, 0.3, 0.04], s: [0.03, 0.95, 0.03] });
  b.add(slab(sym([[0, 0.1], [0.16, -0.05], [0.42, -0.28], [0.4, -0.36], [0.12, -0.3], [0, -0.42]]), 0.12, 0.03), hull);
  b.add(GEO.box, dark, { p: [0, 0.82, 0.04], s: [0.22, 0.06, 0.1] });
  b.add(GEO.sphere, glow, { p: [0, -0.12, 0.08], s: [0.1, 0.1, 0.06] });
  b.mirror(GEO.box, glow, { p: [0.36, -0.3, 0.04], r: [0, 0, 0.7], s: [0.1, 0.022, 0.02] });
  return { parts: [{ b }], glows: [[0, -0.44, 0.3]] };
}

function turret() {
  const base = new Builder();
  const hull = MAT.olive(true);
  const dark = MAT.dark(true);
  const glow = core('amber', 3.5, true);
  base.add(slab(ngon(6, 0.62, 0), 0.24, 0.05), hull);
  base.add(slab(ngon(6, 0.46, 0), 0.32, 0.02), dark);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    base.add(GEO.cyl8, MAT.steel(true), { p: [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.13], r: [HALF_PI, 0, 0], s: [0.06, 0.04, 0.06] });
  }
  const head = new Builder();
  head.add(GEO.sphere, MAT.steel(true), { p: [0, 0, 0.2], s: [0.62, 0.62, 0.36] });
  head.mirror(GEO.cyl, dark, { p: [0.09, 0.42, 0.24], s: [0.07, 0.5, 0.07] });
  head.add(GEO.cyl, glow, { p: [0, 0, 0.38], r: [HALF_PI, 0, 0], s: [0.18, 0.04, 0.18] });
  return { parts: [{ b: base }, { b: head, anim: (e) => (e.angle ?? -HALF_PI) - HALF_PI }], glows: [], fixed: true };
}

const BUILDERS = { dart, gunship, diver, bulwark, minelayer, mine, splitter, shard, sniper, turret };
const CORE_COLOR = { dart: 'magenta', gunship: 'orange', diver: 'red', bulwark: 'yellow', minelayer: 'green', mine: 'red', splitter: 'green', shard: 'green', sniper: 'violet', turret: 'amber' };
const CAPACITY = { dart: 96, mine: 96, shard: 96, gunship: 32, diver: 48, bulwark: 24, minelayer: 24, splitter: 32, sniper: 32, turret: 32 };

export const ENEMY_TYPES = Object.keys(BUILDERS);
export const enemyColor = (type) => colorOf(CORE_COLOR[type] || 'magenta');

// ------------------------------------------------------------ the layer

const tmpM = new THREE.Matrix4();
const tmpL = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const AX_Z = new THREE.Vector3(0, 0, 1);
const AX_Y = new THREE.Vector3(0, 1, 0);

class TypeLayer {
  constructor(type, capacity, group) {
    const def = BUILDERS[type]();
    this.type = type;
    this.def = def;
    this.capacity = capacity;
    this.fixed = !!def.fixed;
    this.color = enemyColor(type);
    this.parts = [];
    for (const part of def.parts) {
      for (const mat of part.b.materials()) {
        const geo = part.b.geometry(mat);
        if (part.flip) geo.rotateZ(Math.PI);
        const emit = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aEmit', emit);
        const mesh = new THREE.InstancedMesh(geo, mat, capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.visible = false;
        group.add(mesh);
        this.parts.push({ mesh, emit, anim: part.anim, isCore: mat.emissiveIntensity > 1 && mat.type === 'MeshStandardMaterial' });
      }
    }
    // the gunship model was built nose down; flip its glows with it
    this.glows = def.parts[0].flip ? def.glows.map(([x, y, s]) => [-x, -y, s]) : def.glows;
    this.n = 0;
  }

  begin() {
    this.n = 0;
  }

  // base: the enemy's world matrix; flash 0..1; extra: core boost rgb
  push(e, base, flash, er, eg, eb, t) {
    const i = this.n;
    if (i >= this.capacity) return;
    for (const p of this.parts) {
      if (p.anim) {
        tmpL.makeRotationZ(p.anim(e, t));
        tmpM.multiplyMatrices(base, tmpL);
        p.mesh.setMatrixAt(i, tmpM);
      } else p.mesh.setMatrixAt(i, base);
      const f = flash * (p.isCore ? 1.5 : 0.55);
      if (p.isCore) p.emit.setXYZW(i, f + er, f + eg, f + eb, 0);
      else p.emit.setXYZW(i, f, f * 0.95, f * 0.9, 0);
    }
    this.n = i + 1;
  }

  end() {
    for (const p of this.parts) {
      p.mesh.count = this.n;
      p.mesh.visible = this.n > 0;
      p.mesh.instanceMatrix.needsUpdate = true;
      p.emit.needsUpdate = true;
    }
  }

  dispose() {
    for (const p of this.parts) {
      p.mesh.geometry.dispose();
      p.mesh.dispose();
    }
  }
}

export class EnemyLayer {
  constructor(group) {
    this.group = group;
    this.layers = {};
    for (const type of ENEMY_TYPES) this.layers[type] = new TypeLayer(type, CAPACITY[type], group);
  }

  update(list, t, bolts) {
    const layers = this.layers;
    for (const k in layers) layers[k].begin();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const L = layers[e.type] || layers.dart;
      // heading: the sim's angle, or along the velocity, or straight down
      let h = e.angle;
      if (typeof h !== 'number') h = Math.hypot(e.vx || 0, e.vy || 0) > 0.5 ? Math.atan2(e.vy, e.vx) : -HALF_PI;
      if (L.fixed) h = HALF_PI;
      const vx = e.vx || 0;
      const vy = e.vy || 0;
      const lat = vx * Math.sin(h) - vy * Math.cos(h);
      const roll = L.fixed ? 0 : Math.max(-0.6, Math.min(0.6, lat * 0.12));
      // scale in on spawn, wobble a little
      const age = e.t ?? 1;
      const grow = age < 0.25 ? 0.3 + 0.7 * easeOut(age / 0.25) : 1;
      tmpQ.setFromAxisAngle(AX_Z, h - HALF_PI);
      tmpQ2.setFromAxisAngle(AX_Y, roll);
      tmpQ.multiply(tmpQ2);
      tmpM.compose(tmpP.set(e.x, e.y, 0), tmpQ, tmpS.set(grow, grow, grow));
      const hitT = e.hitT ?? 9;
      // under steady fire hitT stays low: flicker (full on one 1/14 s slot in two,
      // 0.3 on the other, offset per enemy) so a big ship never holds solid white
      const flash = hitT < 0.06 ? (1 - hitT / 0.06) * ((Math.floor(t * 14) + (e.id | 0)) % 2 ? 0.3 : 1) : 0;
      const [cr, cg, cb] = L.color;
      let boost = 0;
      if (e.type === 'mine') boost = e.armed ? (Math.sin(t * 18) > 0 ? 2.5 : 0) : 0.3 * (0.5 + 0.5 * Math.sin(t * 4));
      else if (e.tele) boost = 1.5 * e.tele.k;
      L.push(e, tmpM, flash, cr * boost, cg * boost, cb * boost, t);
      if (bolts) this.extras(e, L, h, grow, t, bolts);
    }
    for (const k in layers) layers[k].end();
  }

  // the flat lights and markings round an enemy
  extras(e, L, h, grow, t, bolts) {
    const [cr, cg, cb] = L.color;
    const c = Math.cos(h - HALF_PI);
    const s = Math.sin(h - HALF_PI);
    for (const [gx, gy, size] of L.glows) {
      const x = e.x + (c * gx - s * gy) * grow;
      const y = e.y + (s * gx + c * gy) * grow;
      bolts.glow(x, y, size * grow * (0.9 + 0.1 * Math.sin(t * 30 + gx)), cr * 0.8, cg * 0.8, cb * 0.8);
    }
    // a soft light round the core so the type colour reads at a glance
    bolts.glow(e.x, e.y, (e.r || 0.5) * 1.4 * grow, cr * 0.18, cg * 0.18, cb * 0.18);
    if (e.shield && (e.shield.hp ?? 1) > 0) {
      const sh = e.shield;
      const R = (e.r || 0.85) * 1.45;
      const hitT = e.hitT ?? 9;
      const strength = Math.min(1, 0.7 + (hitT < 0.15 ? 0.6 : 0)) * (0.85 + 0.15 * Math.sin(t * 9));
      const arc = sh.arc ?? 2;
      bolts.push(SHAPE.ARC, e.x, e.y, sh.angle ?? -HALF_PI, R + 0.3, R + 0.3, R, arc / 2, 0.35, 0.8, 1.4, strength);
    }
    // beam telegraphs (kind 'beam') are drawn from S.teles by AceView
    if (e.tele && e.tele.kind !== 'beam') this.telegraph(e.tele, e.type, t, bolts);
    if (e.type === 'diver') {
      const sp = Math.hypot(e.vx || 0, e.vy || 0);
      if (sp > 4) {
        // a red streak behind a diving diver
        const len = Math.min(2.2, sp * 0.14);
        const a = Math.atan2(e.vy, e.vx);
        bolts.push(SHAPE.BOLT, e.x - Math.cos(a) * len * 0.6, e.y - Math.sin(a) * len * 0.6, a, len, 0.3, len * 0.8, 0.12, 1.4, 0.22, 0.12, 0);
      }
    }
    if (e.type === 'mine' && e.armed) {
      const r = (e.burstR ?? 2.2) * (0.97 + 0.03 * Math.sin(t * 9));
      bolts.push(SHAPE.RING, e.x, e.y, 0, r + 0.2, r + 0.2, r, 0.03, 0.7, 0.08, 0.12, 0.5);
    }
  }

  // red line for beams (sniper, bosses); a lock-on reticle for divers
  telegraph(tl, type, t, bolts) {
    const k = Math.max(0, Math.min(1, tl.k ?? 0));
    if (type === 'diver') {
      bolts.ray(SHAPE.LINE, tl.x0, tl.y0, tl.x1, tl.y1, 0.1, k * 0.6, 0.025, 0.9, 0.12, 0.08);
      bolts.push(SHAPE.RETICLE, tl.x1, tl.y1, 0, 0.7, 0.7, 0.45 + (1 - k) * 0.4, t * 3, 1.2, 0.15, 0.1);
    } else bolts.ray(SHAPE.LINE, tl.x0, tl.y0, tl.x1, tl.y1, 0.14, k, 0.03, 1.0, 0.1, 0.12);
  }

  clear() {
    for (const k in this.layers) {
      this.layers[k].begin();
      this.layers[k].end();
    }
  }

  dispose() {
    for (const k in this.layers) this.layers[k].dispose();
  }
}

const easeOut = (k) => 1 - (1 - k) * (1 - k);
