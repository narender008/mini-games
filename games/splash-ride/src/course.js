// Big kid: the buoy course of each place. Drive through the start gate (two
// striped spar buoys with flags) and the clock starts; the next buoy glows
// and has a bobbing arrow over it; pass near each one in turn and come back
// through the gate. Missing a buoy is fine (passing a later one simply moves
// the target on) and taking a long time is fine too: the course just
// carries on, nobody fails. The best run in each place is kept on the
// device together with its path, and replayed as a see-through ghost boat
// next time.
import * as THREE from 'three';
import { load, save, TAU } from './config.js';
import { LAYER_FX } from './post.js';

const PASS = 9; // metres from a buoy counts as passing it
const SAMPLE = 0.1; // seconds between ghost samples
const MAX_RUN = 600; // seconds kept in a recording

function stripes(g, w, h, a, b, n) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect(0, (i * h) / n, w, h / n + 1);
  }
}

function stripeTexture(a, b, n) {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 128;
  stripes(c.getContext('2d'), 8, 128, a, b, n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A round inflatable marker buoy (about 1.1 m tall) and a spar buoy with a
// flag for the gate.
function markerBuoy(mat) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = -0.35 + t * 1.45;
    const r = 0.52 * Math.sin(Math.min(1, t * 1.05) * Math.PI * 0.5 + 0.35) * (1 - Math.pow(t, 6) * 0.9);
    pts.push(new THREE.Vector2(Math.max(0.02, r), y));
  }
  const g = new THREE.LatheGeometry(pts, 28);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

function sparBuoy(stripeMat, flagMat, poleMat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.6, 16), stripeMat);
  body.position.y = 0.9;
  body.castShadow = true;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8), poleMat);
  pole.position.y = 2.9;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55, 8, 1), flagMat);
  flag.geometry.translate(0.45, 0, 0);
  flag.position.set(0.03, 3.3, 0);
  g.add(body, pole, flag);
  g.userData.flag = flag;
  return g;
}

export class Course {
  constructor({ scene, audio, makeGhost }) {
    this.scene = scene;
    this.audio = audio;
    this.makeGhost = makeGhost;
    this.group = new THREE.Group();
    this.group.name = 'course';
    this.group.visible = false;
    scene.add(this.group);
    this.buoyMat = new THREE.MeshPhysicalMaterial({ color: 0xffb21e, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    this.nextMat = new THREE.MeshPhysicalMaterial({ color: 0xff7a2e, roughness: 0.3, clearcoat: 0.7, emissive: 0xff5a10, emissiveIntensity: 0.25 });
    this.stripeMat = new THREE.MeshStandardMaterial({ map: stripeTexture('#f5f2ea', '#e2452f', 8), roughness: 0.5 });
    this.flagMat = new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.7, side: THREE.DoubleSide });
    this.poleMat = new THREE.MeshStandardMaterial({ color: 0xcfd6da, roughness: 0.3, metalness: 0.8 });
    // the bobbing arrow over the next buoy, and a glow ring on the water
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, -0.7);
    arrowShape.lineTo(0.62, 0.05);
    arrowShape.lineTo(0.24, 0.05);
    arrowShape.lineTo(0.24, 0.7);
    arrowShape.lineTo(-0.24, 0.7);
    arrowShape.lineTo(-0.24, 0.05);
    arrowShape.lineTo(-0.62, 0.05);
    arrowShape.closePath();
    this.arrow = new THREE.Mesh(
      new THREE.ExtrudeGeometry(arrowShape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }),
      new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffb020, emissiveIntensity: 1.4, roughness: 0.35 }),
    );
    this.arrow.geometry.center();
    this.group.add(this.arrow);
    this.state = 'idle'; // idle | running
    this.buoys = [];
    this.target = 0;
    this.time = 0;
    this.clock = 0;
    this.onEvent = () => {};
    this.ghost = null;
  }

  // def: { gate: { x, z, angle, width }, buoys: [[x, z], ...] }, placeId, boatId
  setCourse(def, placeId) {
    for (const b of this.buoys) this.group.remove(b.obj);
    if (this.gate) this.group.remove(this.gate.a, this.gate.b, this.gate.line);
    this.buoys = [];
    this.def = def;
    this.placeId = placeId;
    if (!def) return;
    for (const [x, z] of def.buoys) {
      const obj = markerBuoy(this.buoyMat);
      obj.position.set(x, 0, z);
      this.group.add(obj);
      this.buoys.push({ x, z, obj, phase: Math.random() * TAU });
    }
    const g = def.gate;
    const ax = Math.cos(g.angle);
    const az = -Math.sin(g.angle);
    const w = g.width / 2;
    const a = sparBuoy(this.stripeMat, this.flagMat, this.poleMat);
    const b = sparBuoy(this.stripeMat, this.flagMat, this.poleMat);
    a.position.set(g.x - ax * w, 0, g.z - az * w);
    b.position.set(g.x + ax * w, 0, g.z + az * w);
    // a line of little floats between them
    const floats = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.4 }), 13);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 13; i++) {
      const t = (i + 1) / 14;
      m.makeTranslation(g.x + ax * w * (t * 2 - 1), 0.02, g.z + az * w * (t * 2 - 1));
      floats.setMatrixAt(i, m);
    }
    this.gate = { a, b, line: floats, x: g.x, z: g.z, nx: -Math.sin(g.angle), nz: -Math.cos(g.angle), ax, az, w, side: null };
    this.group.add(a, b, floats);
    this.best = load(`best.${placeId}`, null);
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.target = 0;
    this.clock = 0;
    this.gate && (this.gate.side = null);
    this.hideGhost();
    for (const b of this.buoys) b.obj.material = this.buoyMat;
  }

  setVisible(v) {
    this.group.visible = v;
    if (!v) this.reset();
  }

  // what the HUD should say
  status() {
    const fmt = (t) => {
      const m = Math.floor(t / 60);
      const s = t - m * 60;
      return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
    };
    return {
      now: this.state === 'running' ? fmt(this.clock) : 'Drive through the flags',
      best: this.best ? fmt(this.best.time) : 'No best yet',
      running: this.state === 'running',
    };
  }

  // where the boat should head for next (for the edge arrow)
  targetPoint() {
    if (!this.def) return null;
    if (this.state === 'running' && this.target < this.buoys.length) return this.buoys[this.target];
    return this.gate;
  }

  start(boatId) {
    this.state = 'running';
    this.clock = 0;
    this.target = 0;
    this.boatId = boatId;
    this.track = [];
    this.sampleT = 0;
    this.audio.countdown?.(0);
    this.onEvent('start');
    if (this.best?.track?.length) this.showGhost();
  }

  finish() {
    const t = this.clock;
    const isBest = !this.best || t < this.best.time;
    if (isBest) {
      this.best = { time: t, boat: this.boatId, track: this.track };
      save(`best.${this.placeId}`, this.best);
    }
    this.audio.courseFinish?.(isBest);
    this.onEvent('finish', { time: t, isBest });
    this.state = 'idle';
    this.target = 0;
    this.hideGhost();
    for (const b of this.buoys) b.obj.material = this.buoyMat;
  }

  showGhost() {
    this.hideGhost();
    const g = this.makeGhost(this.best.boat);
    if (!g) return;
    this.ghost = g;
    g.object.rotation.order = 'YXZ';
    g.object.traverse((o) => {
      if (o.isMesh) o.layers.set(LAYER_FX);
    });
    this.scene.add(g.object);
  }

  hideGhost() {
    if (!this.ghost) return;
    this.scene.remove(this.ghost.object);
    this.ghost.dispose?.();
    this.ghost = null;
  }

  update(dt, time, boat) {
    if (!this.def || !this.group.visible) return;
    // buoys bob; the next one glows under its arrow
    for (let i = 0; i < this.buoys.length; i++) {
      const b = this.buoys[i];
      b.obj.position.y = Math.sin(time * 1.6 + b.phase) * 0.06 - 0.02;
      b.obj.rotation.z = Math.sin(time * 1.1 + b.phase) * 0.06;
    }
    for (const s of [this.gate.a, this.gate.b]) {
      s.userData.flag.rotation.y = Math.sin(time * 3 + s.position.x) * 0.25;
      s.position.y = Math.sin(time * 1.3 + s.position.z) * 0.05;
    }
    const tp = this.targetPoint();
    this.arrow.position.set(tp.x, 3.1 + Math.sin(time * 2.4) * 0.22, tp.z);
    this.arrow.rotation.y = time * 1.2;

    // the gate: crossing its line between the spars
    const g = this.gate;
    const dx = boat.pos.x - g.x;
    const dz = boat.pos.z - g.z;
    const along = dx * g.nx + dz * g.nz;
    const across = dx * g.ax + dz * g.az;
    const side = Math.sign(along);
    const crossed = g.side !== null && side !== g.side && Math.abs(across) < g.w + 1;
    g.side = side;
    if (this.state === 'idle') {
      if (crossed) this.start(boat.id);
      return;
    }
    this.clock += dt;
    // record for the ghost
    this.sampleT -= dt;
    if (this.sampleT <= 0 && this.clock < MAX_RUN) {
      this.sampleT += SAMPLE;
      const r = (v) => Math.round(v * 100) / 100;
      this.track.push(r(boat.pos.x), r(boat.pos.y), r(boat.pos.z), r(boat.heading), r(boat.pitch.x), r(boat.roll.x));
    }
    // buoys in order; a later one moves the target on too
    for (let i = this.target; i < this.buoys.length; i++) {
      const b = this.buoys[i];
      if (Math.hypot(boat.pos.x - b.x, boat.pos.z - b.z) < PASS) {
        this.target = i + 1;
        this.audio.buoy?.(i);
        this.onEvent('buoy', { i, x: b.x, z: b.z });
        break;
      }
    }
    for (let i = 0; i < this.buoys.length; i++) this.buoys[i].obj.material = i === this.target ? this.nextMat : this.buoyMat;
    if (this.target >= this.buoys.length && crossed) this.finish();
    // the ghost replays the best run on the same clock
    if (this.ghost && this.best) {
      const tr = this.best.track;
      const f = this.clock / SAMPLE;
      const i = Math.floor(f);
      const n = tr.length / 6;
      if (i + 1 < n) {
        const k = f - i;
        const a = i * 6;
        const b = a + 6;
        const lerpA = (p, q) => {
          let d = q - p;
          if (d > Math.PI) d -= TAU;
          if (d < -Math.PI) d += TAU;
          return p + d * k;
        };
        const o = this.ghost.object;
        o.position.set(tr[a] + (tr[b] - tr[a]) * k, tr[a + 1] + (tr[b + 1] - tr[a + 1]) * k, tr[a + 2] + (tr[b + 2] - tr[a + 2]) * k);
        o.rotation.set(tr[a + 4] + (tr[b + 4] - tr[a + 4]) * k, lerpA(tr[a + 3], tr[b + 3]), tr[a + 5] + (tr[b + 5] - tr[a + 5]) * k, 'YXZ');
        const gs = this.ghostState || (this.ghostState = { speed: 8, speed01: 0.8, turn: 0, throttle: 1, boost: 0, airborne: false, windLocal: new THREE.Vector3(5, 0, 4) });
        gs.time = time;
        this.ghost.update?.(dt, gs);
        o.visible = true;
      } else {
        this.ghost.object.visible = false;
      }
    }
  }

  // how far the boat is from the target, as a screen-edge hint
  distanceTo(boat) {
    const tp = this.targetPoint();
    return tp ? Math.hypot(boat.pos.x - tp.x, boat.pos.z - tp.z) : Infinity;
  }
}
