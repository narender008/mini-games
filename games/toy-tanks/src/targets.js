// Target practice: things to hit along the lane.
//   balloon  - a party balloon on a string, bobbing; a ball pops it and flies on
//   blocks   - a little tower of painted wooden toy blocks; a hit sends them tumbling
//   bullseye - a round painted target on a stand; points by ring
//   bonus    - a spinning golden star in the air; fly through it to collect
// Each level lists its targets, how many balls there are, and the points
// for one, two and three stars. The level ends when the balls run out or
// everything has been hit.
import * as THREE from 'three';
import { rng, clamp, GRAVITY } from './config.js';

// Levels per stage: x along the lane (the player's tank is on the left),
// y above the ground for things in the air. `wind` scales the stage's wind.
// Items are [kind, distance from the tank, height or block count]. The
// distances are written for a long lane and squeezed by TARGET_REACH so
// the whole range fits the close, low camera.
export const TARGET_REACH = 0.72;

export const TARGET_LEVELS = {
  meadow: [
    { balls: 5, wind: 0.3, stars: [60, 140, 220], items: [['balloon', 0.35, 0.28], ['bullseye', 0.75], ['balloon', 1.05, 0.4], ['bonus', 0.25, 0.45]] },
    { balls: 5, wind: 0.7, stars: [80, 180, 280], items: [['blocks', 0.55, 4], ['balloon', 0.9, 0.35], ['bullseye', 1.25], ['bonus', 0.6, 0.55], ['balloon', 1.5, 0.3]] },
    { balls: 6, wind: 1, stars: [100, 220, 340], items: [['bullseye', 0.45], ['blocks', 1.0, 5], ['balloon', 1.35, 0.5], ['balloon', 0.75, 0.62], ['bonus', 1.2, 0.7], ['blocks', 1.65, 3]] },
  ],
  beach: [
    { balls: 5, wind: 0.4, stars: [60, 140, 220], items: [['blocks', 0.5, 3], ['balloon', 0.85, 0.3], ['bullseye', 1.15], ['bonus', 0.4, 0.5]] },
    { balls: 5, wind: 0.8, stars: [80, 180, 280], items: [['balloon', 0.4, 0.45], ['balloon', 0.7, 0.3], ['blocks', 1.1, 5], ['bonus', 0.9, 0.62], ['bullseye', 1.45]] },
    { balls: 6, wind: 1, stars: [100, 220, 340], items: [['bullseye', 0.6], ['bullseye', 1.3], ['balloon', 1.0, 0.55], ['blocks', 1.7, 4], ['bonus', 0.35, 0.6], ['bonus', 1.5, 0.75]] },
  ],
  garden: [
    { balls: 5, wind: 0.3, stars: [60, 140, 220], items: [['bullseye', 0.6], ['balloon', 0.95, 0.32], ['blocks', 1.3, 3], ['bonus', 0.5, 0.45]] },
    { balls: 5, wind: 0.6, stars: [80, 180, 280], items: [['blocks', 0.45, 4], ['blocks', 1.2, 4], ['balloon', 0.8, 0.5], ['bonus', 1.0, 0.65]] },
    { balls: 6, wind: 0.9, stars: [100, 220, 340], items: [['balloon', 0.4, 0.3], ['balloon', 0.65, 0.55], ['balloon', 0.95, 0.38], ['bullseye', 1.35], ['blocks', 1.7, 5], ['bonus', 1.3, 0.72]] },
  ],
  snow: [
    { balls: 5, wind: 0.4, stars: [60, 140, 220], items: [['balloon', 0.5, 0.35], ['blocks', 0.95, 4], ['bonus', 0.7, 0.5], ['bullseye', 1.3]] },
    { balls: 5, wind: 0.8, stars: [80, 180, 280], items: [['bullseye', 0.7], ['balloon', 1.05, 0.5], ['blocks', 1.45, 5], ['bonus', 1.2, 0.62], ['balloon', 0.4, 0.4]] },
    { balls: 6, wind: 1, stars: [100, 220, 340], items: [['blocks', 0.6, 3], ['blocks', 1.1, 4], ['blocks', 1.6, 5], ['balloon', 0.85, 0.62], ['bonus', 1.35, 0.8], ['bullseye', 1.9]] },
  ],
  forest: [
    { balls: 5, wind: 0.3, stars: [60, 140, 220], items: [['bullseye', 0.55], ['balloon', 0.9, 0.42], ['bonus', 0.7, 0.6], ['blocks', 1.3, 3]] },
    { balls: 5, wind: 0.7, stars: [80, 180, 280], items: [['balloon', 0.5, 0.55], ['balloon', 1.0, 0.45], ['bullseye', 1.4], ['blocks', 0.8, 4], ['bonus', 1.2, 0.75]] },
    { balls: 6, wind: 1, stars: [100, 220, 340], items: [['blocks', 0.5, 4], ['bullseye', 1.0], ['balloon', 1.35, 0.6], ['balloon', 1.6, 0.4], ['blocks', 1.85, 5], ['bonus', 0.9, 0.8]] },
  ],
};

const BALLOON_COLORS = [0xff4d6d, 0x3d8bff, 0xffc93d, 0x4dd07a, 0xb05cff, 0xff8a3d];
const BLOCK_COLORS = [0xe8392f, 0x2f7fe0, 0xffc21f, 0x39b85a, 0xf07ac0, 0xff8a1f];

// ------------------------------------------------------------ looks

function bullseyeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const rings = ['#ffffff', '#e8392f', '#ffffff', '#2f7fe0', '#ffd23d'];
  for (let i = 0; i < 5; i++) {
    g.fillStyle = rings[i];
    g.beginPath();
    g.arc(128, 128, 126 - i * 25, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc(128, 128, 126 - i * 25, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function starShape(outer, inner) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? inner : outer;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

let shared = null;
function looks() {
  if (shared) return shared;
  const balloonGeo = new THREE.SphereGeometry(0.03, 32, 24);
  // a balloon is a little taller than wide, narrowing to the knot
  const p = balloonGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 0.03;
    const squeeze = y < 0 ? 1 - Math.pow(-y, 2.2) * 0.35 : 1;
    p.setXYZ(i, p.getX(i) * squeeze, p.getY(i) * 1.18, p.getZ(i) * squeeze);
  }
  balloonGeo.computeVertexNormals();
  shared = {
    balloonGeo,
    knotGeo: new THREE.ConeGeometry(0.004, 0.006, 10),
    blockGeo: new THREE.BoxGeometry(0.03, 0.03, 0.03, 2, 2, 2),
    boardGeo: new THREE.CylinderGeometry(0.055, 0.055, 0.008, 48),
    legGeo: new THREE.CylinderGeometry(0.0025, 0.003, 0.09, 8),
    starGeo: new THREE.ExtrudeGeometry(starShape(0.024, 0.011), { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.002, bevelSegments: 3 }),
    board: new THREE.MeshStandardMaterial({ map: bullseyeTexture(), roughness: 0.5 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xb98a58, roughness: 0.65 }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xffc933, metalness: 1, roughness: 0.22, clearcoat: 0.6, emissive: 0x6a4a00, emissiveIntensity: 0.25 }),
    string: new THREE.LineBasicMaterial({ color: 0xf4f0e6 }),
  };
  shared.starGeo.center();
  return shared;
}

function edgeBlock(color) {
  // painted wood: a little clearcoat, softly rounded by the shading
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 });
}

// ------------------------------------------------------------ targets

export class Targets {
  constructor({ scene, terrain, fx, audio, ui }) {
    this.scene = scene;
    this.terrain = terrain;
    this.fx = fx;
    this.audio = audio;
    this.ui = ui;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.shapes = [];
    this.pieces = [];
    this.time = 0;
    this.onPoints = null;
  }

  clear() {
    for (const it of this.items) this.group.remove(it.object);
    this.items.length = 0;
    this.shapes.length = 0;
    this.pieces.length = 0;
  }

  // build a level; x0 is the player's tank position, facing +x
  setup(level, x0, seed = 1) {
    this.clear();
    const L = looks();
    const R = rng(seed);
    let bi = 0;
    for (const [kind, dx, arg] of level.items) {
      const x = x0 + dx * TARGET_REACH;
      const g = this.terrain.heightAt(x, 0);
      const it = { kind, x, alive: true, object: new THREE.Group(), phase: R() * 10 };
      it.object.position.set(x, g, 0);
      if (kind === 'balloon') {
        const color = BALLOON_COLORS[bi++ % BALLOON_COLORS.length];
        const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.08, sheen: 0.4, sheenColor: new THREE.Color(0xffffff) });
        const body = new THREE.Mesh(L.balloonGeo, mat);
        body.castShadow = true;
        const knot = new THREE.Mesh(L.knotGeo, mat);
        knot.position.y = -0.037;
        const holder = new THREE.Group();
        holder.add(body, knot);
        it.balloon = holder;
        it.height = arg;
        holder.position.y = arg;
        // the string down to a little peg in the ground
        const pts = [];
        for (let k = 0; k <= 12; k++) pts.push(new THREE.Vector3(Math.sin(k * 1.3) * 0.003, (arg - 0.04) * (1 - k / 12), 0));
        it.stringGeo = new THREE.BufferGeometry().setFromPoints(pts);
        it.string = new THREE.Line(it.stringGeo, L.string);
        const peg = new THREE.Mesh(L.legGeo, L.wood);
        peg.scale.set(1.4, 0.12, 1.4);
        it.object.add(holder, it.string, peg);
        it.shape = { kind: 'sphere', x, y: g + arg, z: 0, r: 0.034, pass: true, target: it };
        it.color = color;
      } else if (kind === 'blocks') {
        it.blocks = [];
        const n = arg;
        let y = 0.015;
        for (let k = 0; k < n; k++) {
          const b = new THREE.Mesh(L.blockGeo, edgeBlock(BLOCK_COLORS[(k + bi) % BLOCK_COLORS.length]));
          b.castShadow = b.receiveShadow = true;
          b.position.set((R() - 0.5) * 0.004, y, 0);
          b.rotation.y = (R() - 0.5) * 0.3;
          it.object.add(b);
          it.blocks.push(b);
          y += 0.03;
        }
        bi++;
        it.shape = { kind: 'box', x, y: g + (n * 0.03) / 2, z: 0, hx: 0.018, hy: (n * 0.03) / 2, hz: 0.018, target: it };
      } else if (kind === 'bullseye') {
        // the board faces back along the lane, turned part way to the camera
        // so its rings read
        const face = new THREE.Group();
        face.rotation.y = 0.7;
        const board = new THREE.Mesh(L.boardGeo, [L.wood, L.board, L.wood]);
        board.rotation.z = Math.PI / 2;
        board.position.y = 0.1;
        board.castShadow = true;
        const leg1 = new THREE.Mesh(L.legGeo, L.wood);
        leg1.position.set(0.012, 0.045, 0.03);
        leg1.rotation.x = 0.25;
        const leg2 = leg1.clone();
        leg2.position.z = -0.03;
        leg2.rotation.x = -0.25;
        for (const m of [leg1, leg2]) m.castShadow = true;
        face.add(board, leg1, leg2);
        it.board = board;
        it.object.add(face);
        it.centerY = g + 0.1;
        it.shape = { kind: 'box', x, y: g + 0.1, z: 0, hx: 0.008, hy: 0.056, hz: 0.056, rot: 0.7, target: it };
      } else if (kind === 'bonus') {
        const star = new THREE.Mesh(L.starGeo, L.gold);
        star.castShadow = true;
        star.position.y = arg;
        it.star = star;
        it.object.add(star);
        it.shape = { kind: 'sphere', x, y: g + arg, z: 0, r: 0.03, pass: true, target: it };
      }
      this.group.add(it.object);
      this.items.push(it);
      this.shapes.push(it.shape);
    }
  }

  get remaining() {
    return this.items.filter((i) => i.alive && i.kind !== 'bonus').length;
  }

  // the ball touched a pass-through target (balloon or bonus star)
  collect(shape) {
    const it = shape.target;
    if (!it || !it.alive) return 0;
    it.alive = false;
    const p = it.object.position;
    if (it.kind === 'balloon') {
      const y = p.y + it.height;
      this.fx.burst('confetti', p.x, y, 0, { power: 0.5, great: false, ground: 'air', scale: 0.5 });
      this.fx.sparkle?.(p.x, y, 0, 24, it.color);
      this.audio.target('balloon', 0);
      it.balloon.visible = false;
      it.falling = 0;
      return this.award(it, 30, p.x, y);
    }
    this.fx.sparkle?.(p.x, p.y + it.star.position.y, 0, 40, 0xffd23d);
    this.audio.target('bonus', 0);
    it.star.visible = false;
    return this.award(it, 25, p.x, p.y + it.star.position.y);
  }

  // the ball hit a solid target (blocks or bullseye)
  hit(shape, ball) {
    const it = shape.target;
    if (!it) return 0;
    const p = it.object.position;
    if (it.kind === 'blocks') {
      if (!it.alive) return 0;
      it.alive = false;
      this.audio.target('blocks', 0);
      // the blocks tumble away from the hit
      for (const b of it.blocks) {
        const wp = b.getWorldPosition(new THREE.Vector3());
        this.pieces.push({
          mesh: b,
          pos: wp,
          vel: new THREE.Vector3(Math.sign(ball.vel.x) * (0.25 + Math.random() * 0.5), 0.2 + Math.random() * 0.45, (Math.random() - 0.5) * 0.35),
          spin: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
          rest: 0,
        });
        it.object.remove(b);
        b.position.copy(wp);
        this.group.add(b);
      }
      it.shape.hy = 0.001;
      it.shape.y = -9;
      return this.award(it, 50 + it.blocks.length * 10, p.x, p.y + 0.08);
    }
    if (it.kind === 'bullseye') {
      // distance from the middle, measured across the board's face
      const r = it.shape.rot;
      const across = Math.sin(r) * (ball.pos.x - p.x) + Math.cos(r) * ball.pos.z;
      const off = Math.hypot(ball.pos.y - it.centerY, across) / 0.055;
      const pts = off < 0.2 ? 100 : off < 0.4 ? 70 : off < 0.6 ? 50 : off < 0.8 ? 30 : 15;
      it.wobble = 1;
      this.audio.target('bullseye', 0);
      if (pts === 100) this.fx.sparkle?.(p.x, it.centerY, 0, 50, 0xffd23d);
      const first = it.alive;
      it.alive = false;
      return this.award(it, first ? pts : Math.round(pts / 2), p.x, it.centerY + 0.07);
    }
    return 0;
  }

  award(it, pts, x, y) {
    this.onPoints?.(pts, x, y, it.kind);
    return pts;
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    for (const it of this.items) {
      if (it.kind === 'balloon' && it.alive) {
        // bob and drift gently on the string
        const b = it.balloon;
        b.position.y = it.height + Math.sin(t * 1.3 + it.phase) * 0.006;
        b.position.x = Math.sin(t * 0.9 + it.phase * 2) * 0.004;
        b.rotation.z = Math.sin(t * 1.1 + it.phase) * 0.08;
        it.shape.y = it.object.position.y + b.position.y;
      } else if (it.kind === 'balloon' && it.string.visible) {
        // the string falls to the grass
        it.falling += dt;
        it.string.scale.y = Math.max(0.05, 1 - it.falling * 1.6);
        if (it.falling > 0.7) it.string.visible = false;
      } else if (it.kind === 'bonus' && it.alive) {
        it.star.rotation.y = t * 2.2 + it.phase;
        it.star.position.y += Math.sin(t * 1.7 + it.phase) * 0.00006;
      } else if (it.kind === 'bullseye' && it.wobble > 0.001) {
        it.wobble *= Math.exp(-dt * 3);
        it.board.rotation.z = Math.PI / 2 + Math.sin(t * 22) * 0.12 * it.wobble;
      }
    }
    // tumbling blocks: a simple, friendly fall with bounces
    for (const pc of this.pieces) {
      if (pc.rest > 1) continue;
      pc.vel.y -= GRAVITY * 2.2 * dt;
      pc.pos.addScaledVector(pc.vel, dt);
      const g = this.terrain.heightAt(pc.pos.x, pc.pos.z) + 0.015;
      if (pc.pos.y < g) {
        pc.pos.y = g;
        pc.vel.y = Math.abs(pc.vel.y) * 0.35;
        pc.vel.x *= 0.6;
        pc.vel.z *= 0.6;
        pc.spin.multiplyScalar(0.5);
        if (Math.abs(pc.vel.y) < 0.05) pc.rest += dt * 4;
      }
      pc.mesh.position.copy(pc.pos);
      pc.mesh.rotation.x += pc.spin.x * dt;
      pc.mesh.rotation.y += pc.spin.y * dt;
      pc.mesh.rotation.z += pc.spin.z * dt;
      if (pc.rest > 1) {
        // settle flat on a face
        const q = Math.PI / 2;
        pc.mesh.rotation.x = Math.round(pc.mesh.rotation.x / q) * q;
        pc.mesh.rotation.z = Math.round(pc.mesh.rotation.z / q) * q;
      }
    }
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
