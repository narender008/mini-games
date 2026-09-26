// Dressing a built layout in a level's look. The same pieces appear in
// every level; the level's theme picks the materials and styles (wooden
// beams and painted blocks in the playroom, glowing glass on white ceramic
// at night, plank tracks in the storybook, stone and brass in the
// observatory) and may replace the builder for any piece type with its own.
//
// build(built) returns one group holding every piece's meshes, and keeps a
// list of moving parts (wheels, bells, spinners, flippers, lift screws)
// that animate() drives from the pieces' mechanism state.
import * as THREE from 'three';
import { CELL, R_MARBLE } from './config.js';
import { sweep, troughBeam, shellChannel, tubeRings, roundedBox, lathe, arcPts, profile, mergeGeometries } from './geometry.js';
import { CHANNELS } from './track/path.js';
import { rotXZ } from './track/layout.js';

const R = R_MARBLE;

export class Skin {
  // theme: see levels/*.js; mats: a Materials instance
  constructor({ theme, mats, quality }) {
    this.theme = theme;
    this.mats = mats;
    this.quality = quality;
    this.movers = [];
    this.geos = [];
    this.group = null;
  }

  build(built) {
    this.dispose();
    const group = new THREE.Group();
    group.name = 'track';
    this.group = group;
    this.movers = [];
    this.pickables = [];
    this.bellCount = 0;
    for (const inst of built.pieces) {
      const g = new THREE.Group();
      g.name = inst.def.id;
      g.userData.inst = inst;
      const custom = this.theme.pieces?.[inst.def.id];
      if (custom) custom.call(this, inst, g, this);
      else this.piece(inst, g);
      group.add(g);
      inst.object = g;
      g.traverse((o) => {
        if (o.isMesh) {
          o.userData.inst = inst;
          if (o.castShadow === undefined || !o.userData.noShadow) o.castShadow = !o.material.transparent;
          o.receiveShadow = true;
        }
      });
      this.mergeStatic(g);
      if (this.quality?.dof || this.quality?.ao) this.depthProxies(g);
    }
    const pillars = new THREE.Group();
    pillars.name = 'pillars';
    for (const p of built.pillars) (this.theme.pillar || pillarBlocks).call(this, p, pillars, this);
    pillars.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    group.add(pillars);
    this.mergeStatic(pillars);
    return group;
  }

  // Many small meshes that never move cost a draw call each: bake them
  // together per material. Moving and see-through parts, and anything a
  // level marks userData.dynamic, stay as they are.
  mergeStatic(root) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const keep = new Set();
    for (const m of this.movers) for (const v of Object.values(m)) if (v?.isObject3D) keep.add(v);
    for (const p of this.pickables) keep.add(p.object);
    const groups = new Map();
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
      for (let a = o; a && a !== root; a = a.parent) if (keep.has(a) || a.userData.dynamic) return;
      const mat = o.material;
      if (Array.isArray(mat) || mat.transparent || mat.vertexColors || o.geometry.attributes.color || o.geometry.morphAttributes?.position) return;
      if (o.matrixWorld.determinant() < 0) return;
      const key = `${mat.uuid}|${o.castShadow}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    });
    const m4 = new THREE.Matrix4();
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((o) => {
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
        return g;
      });
      const merged = this.mesh(mergeGeometries(geos), list[0].material, root);
      merged.castShadow = list[0].castShadow;
      merged.receiveShadow = true;
      merged.userData.inst = root.userData.inst;
      for (const o of list) o.removeFromParent();
    }
  }

  // Glass is blended without writing depth, so the lens pass would see what
  // lies behind a clear tube and blur the tube as if it were far away. A
  // depth-only twin of each see-through mesh, drawn after everything else,
  // puts its distance in the depth buffer without changing a colour. (A
  // level that makes its own twins marks them userData.depthProxy.)
  depthProxies(root) {
    let has = false;
    root.traverse((o) => (has ||= !!o.userData.depthProxy));
    if (has) return;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const moving = new Set();
    for (const m of this.movers) for (const v of Object.values(m)) if (v?.isObject3D) moving.add(v);
    const statics = [];
    const twins = [];
    root.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material) || !o.material.transparent || o.material.colorWrite === false) return;
      let moves = false;
      for (let a = o; a && a !== root; a = a.parent) if (moving.has(a) || a.userData.dynamic) moves = true;
      (moves ? twins : statics).push(o);
    });
    for (const o of twins) {
      const d = new THREE.Mesh(o.geometry, DEPTH_ONLY);
      d.userData.depthProxy = true;
      d.renderOrder = 50;
      d.castShadow = false;
      o.add(d);
    }
    if (!statics.length) return;
    const m4 = new THREE.Matrix4();
    const geos = statics.map((o) => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
      return g;
    });
    const d = this.mesh(mergeGeometries(geos), DEPTH_ONLY, root);
    d.userData.depthProxy = true;
    d.renderOrder = 50;
    d.castShadow = false;
  }

  mesh(geo, mat, parent) {
    if (!geo.userData.shared) this.geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    if (mat.transparent) {
      m.renderOrder = 2;
      m.castShadow = false;
    }
    parent?.add(m);
    return m;
  }

  // ------------------------------------------------------------ generic pieces

  piece(inst, g) {
    const t = this.theme;
    const id = inst.def.id;
    for (const lane of inst.lanes) {
      if (lane.kinematic) continue;
      if (inst.def.bowl && lane.name === 'out') {
        this.funnelStem(inst, lane, g);
        continue;
      }
      if (id === 'drop' || id === 'tallDrop') continue;
      if (lane.channel === CHANNELS.guard) {
        // an open channel with a clear guard strip over the top
        const tint = inst.placement.tint;
        const style = tint && t.tinted ? { ...(t.loop || t.trough), mat: t.tinted(tint).mat } : t.loop || t.trough;
        this.trough(lane, g, style);
        this.guard(lane, g);
      } else if (lane.tube) this.tube(lane, g, inst.def.tubeLook ? t.tube : t.enclosed || t.tube);
      else {
        const tint = inst.placement.tint;
        let style = lane === inst.laneByName.main && inst.def.loop ? t.loop || t.trough : t.trough;
        if (tint && t.tinted) style = inst.def.loop && t.loop ? { ...t.loop, mat: t.tinted(tint).mat } : t.tinted(tint);
        this.trough(lane, g, style);
      }
    }
    if (id === 'drop' || id === 'tallDrop') this.dropBlock(inst, g);
    if (inst.def.bowl) this.funnel(inst, g);
    if (inst.def.bell) this.bell(inst, g);
    if (inst.def.wheel) this.wheel(inst, g);
    if (inst.def.spinner) this.spinner(inst, g);
    if (inst.def.splitter) this.splitter(inst, g);
    if (inst.def.start) this.cup(inst, g);
    if (inst.def.lift) this.lift(inst, g);
    if (id === 'goal') this.goalFlag(inst, g);
  }

  trough(lane, parent, style) {
    const s = style || {};
    const prof = s.kind === 'shell' ? shellChannel({ rc: lane.rc, top: s.top ?? 0.006, t: s.thickness ?? 0.0022 }) : troughBeam({ rc: lane.rc, top: s.top ?? 0.004, width: s.width ?? 0.042 });
    const geo = sweep(lane, prof, { step: s.step ?? 0.004, caps: s.caps ?? true });
    const m = this.mesh(geo, s.mat, parent);
    if (s.glow) m.userData.noShadow = true;
    return m;
  }

  tube(lane, parent, style) {
    const s = style || {};
    const rings = tubeRings(lane.rc, s.thickness ?? 0.0016);
    const outer = sweep(lane, rings.outer, { step: 0.004 });
    const inner = sweep(lane, rings.inner, { step: 0.004, flip: true });
    this.mesh(outer, s.mat, parent);
    if (s.innerMat !== null) this.mesh(inner, s.innerMat || s.mat, parent);
  }

  // a clear strip over an open channel
  guard(lane, parent) {
    const rc = lane.rc + 0.001;
    const axis = rc - R;
    const pts = arcPts(0, axis - 0.001, rc + 0.0025, Math.PI * 0.2, Math.PI * 0.8, 10);
    const inner = arcPts(0, axis - 0.001, rc + 0.001, Math.PI * 0.8, Math.PI * 0.2, 10);
    const geo = sweep(lane, profile([...pts, ...inner], true), { step: 0.004 });
    this.mesh(geo, this.theme.tube.mat, parent);
  }

  // a block with a bore: the marble drops inside it
  dropBlock(inst, g) {
    const lane = inst.lanes[0];
    const box = new THREE.Box3().setFromArray(lane.pos);
    const h = box.max.y - box.min.y + 0.03;
    const geo = roundedBox(CELL * 0.92, h, CELL * 0.92, 0.003);
    const m = this.mesh(geo, this.theme.block?.(inst, 0) || this.theme.trough.mat, g);
    const c = box.getCenter(new THREE.Vector3());
    const cellC = this.cellCentre(inst, 0);
    m.position.set(cellC.x, box.min.y - 0.016 + h / 2, cellC.z);
    // short trough stubs at the mouths
    this.stubs(inst, lane, g);
    return c;
  }

  stubs(inst, lane, g) {
    const t = this.theme.trough;
    const head = { ...lane };
    void head;
    // entry and exit pieces of the lane that stick out of the block
    const mat = t.mat;
    const inLen = Math.min(0.012, lane.length * 0.2);
    this.mesh(sweep(lane, troughBeam({ rc: 0.0155, top: t.top ?? 0.004, width: t.width ?? 0.042 }), { s0: 0, s1: inLen, caps: true }), mat, g);
    this.mesh(sweep(lane, troughBeam({ rc: 0.0155, top: t.top ?? 0.004, width: t.width ?? 0.042 }), { s0: lane.length - inLen, s1: lane.length, caps: true }), mat, g);
  }

  cellCentre(inst, k) {
    const p = inst.placement;
    const [a, b] = inst.def.cells[k];
    const [x, z] = rotXZ(a * CELL, b * CELL, p.rot);
    const o = inst.layoutOrigin;
    return new THREE.Vector3(o.x + p.i * CELL + x, 0, o.z + p.j * CELL + z);
  }

  // ------------------------------------------------------------ funnel

  funnel(inst, g) {
    const b = inst.bowl;
    const style = this.theme.funnel || {};
    // the marble centre follows rimY + f(rho); the bowl's inner surface is
    // one marble radius below that, along the surface normal
    const pts = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const rho = b.hole + (b.R - b.hole) * Math.pow(i / n, 0.7);
      const fp = b.fp(rho);
      const len = Math.hypot(1, fp);
      pts.push([rho + (fp / len) * R, b.rimY + b.f(rho) - R / len]);
    }
    const rimR = b.R + R + 0.002;
    const lip = style.lip ?? 0.004;
    const top = b.rimY + 0.006;
    // inside, up over the rim, outside down, round the bottom of the stem
    const outline = [
      [b.hole * 0.9, pts[0][1] - 0.004],
      ...pts,
      [rimR, top - 0.002],
      [rimR + lip * 0.5, top],
      [rimR + lip, top - 0.002],
      [rimR + lip * 0.8, top - 0.008],
      ...pts
        .slice()
        .reverse()
        .map(([x, y]) => [x + 0.0025, y - 0.0028]),
      [b.hole * 0.9 + 0.003, pts[0][1] - 0.01],
    ];
    const geo = lathe(outline.map(([x, y]) => [x, y - b.rimY]), this.quality.tier === 'low' ? 40 : 72);
    const m = this.mesh(geo, style.mat, g);
    m.position.set(b.x, b.rimY, b.z);
    m.material.side = THREE.DoubleSide;
    if (style.rings) {
      // spiral grooves / glowing rings
      for (let k = 1; k <= 4; k++) {
        const rho = b.hole + ((b.R - b.hole) * k) / 5;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rho + R * 0.7, 0.0006, 6, 64), style.rings);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(b.x, b.rimY + b.f(rho) - R * 0.75, b.z);
        g.add(ring);
      }
    }
  }

  funnelStem(inst, lane, g) {
    const style = this.theme.funnel || {};
    const rings = tubeRings(lane.rc, 0.0025);
    this.mesh(sweep(lane, rings.outer, { step: 0.003 }), style.stemMat || style.mat, g);
    // where the stem opens out, a short trough to carry on
    const t = this.theme.trough;
    this.mesh(sweep(lane, troughBeam({ rc: lane.rc + 0.0027, top: t.top ?? 0.004, width: t.width ?? 0.042 }), { s0: lane.length - 0.02, s1: lane.length, caps: true }), t.mat, g);
  }

  // ------------------------------------------------------------ bells

  bell(inst, g) {
    const lane = inst.laneByName.main;
    const e = lane.events.find((x) => x.type === 'bell');
    const f = lane.frame(e.s, { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), w: new THREE.Vector3(), k: new THREE.Vector3() });
    const style = this.theme.bell || {};
    const hang = new THREE.Group();
    const size = style.size ?? 0.017;
    // a hand bell: flared lip, waist, crown
    const prof = [
      [0.0005, 0],
      [size * 0.35, 0.0005],
      [size * 0.52, size * 0.35],
      [size * 0.6, size * 0.9],
      [size * 0.92, size * 1.32],
      [size * 1.0, size * 1.45],
      [size * 0.95, size * 1.48],
      [size * 0.82, size * 1.36],
      [size * 0.5, size * 0.95],
      [size * 0.42, size * 0.4],
      [0.0005, size * 0.12],
    ].map(([x, y]) => [x, -y]);
    const bellMesh = this.mesh(lathe(prof, 40), style.mat, hang);
    bellMesh.position.y = 0;
    // clapper
    const clap = this.mesh(new THREE.SphereGeometry(size * 0.18, 12, 10), style.clapper || style.mat, hang);
    clap.position.y = -size * 1.3;
    // wooden bead on top
    if (style.bead) {
      const bead = this.mesh(new THREE.SphereGeometry(size * 0.32, 16, 12), style.bead, hang);
      bead.position.y = size * 0.25;
    }
    // the bell hangs so its lip just brushes a passing marble
    const pivot = new THREE.Group();
    const lipY = f.p.y + R + 0.001;
    pivot.position.set(f.p.x, lipY + size * 1.45, f.p.z);
    pivot.add(hang);
    g.add(pivot);
    // frame: two posts and a bar across the track
    const fr = style.frame;
    if (fr !== null) {
      const barY = pivot.position.y + size * 0.55;
      const span = 0.05;
      const sideW = f.w.clone();
      const postMat = fr?.mat || this.theme.trough.mat;
      for (const sgn of [-1, 1]) {
        const base = f.p.clone().addScaledVector(sideW, sgn * 0.024);
        const hgt = barY - (f.p.y - 0.01);
        const post = this.mesh(roundedBox(0.006, hgt, 0.006, 0.0015), postMat, g);
        post.position.set(base.x, f.p.y - 0.01 + hgt / 2, base.z);
      }
      const bar = this.mesh(roundedBox(0.006, 0.006, span + 0.006, 0.0015), postMat, g);
      bar.position.set(f.p.x, barY, f.p.z);
      bar.lookAt(bar.position.clone().add(sideW));
      bar.rotateY(Math.PI / 2);
      void span;
    }
    inst.mech.bell.index = inst.placement.bellIndex ?? this.bellCount++ % 3;
    this.movers.push({ type: 'bell', pivot, axis: f.t.clone(), mech: inst.mech.bell, inst });
    this.pickables.push({ inst, object: pivot, kind: 'bell' });
  }

  // ------------------------------------------------------------ wheel

  wheel(inst, g) {
    const w = inst.mech.wheel;
    const style = this.theme.wheel || {};
    const p = inst.placement;
    const rim = w.radius + R + 0.004;
    const hub = new THREE.Group();
    hub.position.copy(w.centre);
    // the wheel turns about the piece's local z axis
    const [ax, az] = rotXZ(0, 1, p.rot);
    hub.lookAt(hub.position.clone().add(new THREE.Vector3(ax, 0, az)));
    const spin = new THREE.Group();
    hub.add(spin);
    const segs = style.segments ?? 8;
    const colours = style.segmentMats || [style.mat];
    // coloured sectors on a disc behind the paddles
    for (let i = 0; i < segs; i++) {
      const geo = new THREE.CylinderGeometry(rim, rim, 0.004, 12, 1, false, (i / segs) * Math.PI * 2, (Math.PI * 2) / segs);
      const m = this.mesh(geo, colours[i % colours.length], spin);
      m.rotation.x = Math.PI / 2;
      m.position.z = -0.016;
    }
    // paddles
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const pad = this.mesh(roundedBox(rim - 0.006, 0.003, 0.03, 0.001), style.paddle || style.mat, spin);
      pad.position.set(Math.cos(a) * (rim / 2 + 0.003), Math.sin(a) * (rim / 2 + 0.003), 0);
      pad.rotation.z = a;
    }
    const axle = this.mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 20), style.hub || style.mat, hub);
    axle.rotation.x = Math.PI / 2;
    // clear front cover ring
    if (style.cover) {
      const ring = this.mesh(new THREE.TorusGeometry(rim + 0.002, 0.002, 8, 64), style.cover, hub);
      ring.position.z = 0.016;
    }
    // stand
    const leg = this.mesh(roundedBox(0.008, w.centre.y - (inst.lanes[2].pos[1] - 0.02), 0.008, 0.002), this.theme.trough.mat, g);
    const base = new THREE.Vector3().copy(w.centre);
    const [bx, bz] = rotXZ(0, -0.022, p.rot);
    leg.position.set(base.x + bx, (w.centre.y + inst.lanes[2].pos[1] - 0.02) / 2, base.z + bz);
    g.add(hub);
    this.movers.push({ type: 'wheel', spin, mech: w, inst });
    this.pickables.push({ inst, object: hub, kind: 'wheel' });
  }

  spinner(inst, g) {
    const lane = inst.laneByName.main;
    const f = lane.frame(lane.length / 2, { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), w: new THREE.Vector3(), k: new THREE.Vector3() });
    const style = this.theme.spinner || {};
    const hub = new THREE.Group();
    hub.position.copy(f.p).addScaledVector(f.w, -0.028).addScaledVector(f.u, 0.035);
    hub.lookAt(hub.position.clone().add(f.w));
    const spin = new THREE.Group();
    hub.add(spin);
    const n = style.blades ?? 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rod = this.mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.04, 8), style.mat, spin);
      rod.position.set(Math.cos(a) * 0.02, Math.sin(a) * 0.02, 0);
      rod.rotation.z = a - Math.PI / 2;
      const tip = this.mesh(new THREE.SphereGeometry(0.0022, 10, 8), style.tip || style.mat, spin);
      tip.position.set(Math.cos(a) * 0.041, Math.sin(a) * 0.041, 0);
    }
    const ball = this.mesh(new THREE.SphereGeometry(0.006, 20, 14), style.tip || style.mat, spin);
    void ball;
    const post = this.mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.05, 8), style.post || style.mat, g);
    post.position.copy(hub.position).add(new THREE.Vector3(0, -0.025, 0));
    g.add(hub);
    this.movers.push({ type: 'spinner', spin, mech: inst.mech.spinner, inst });
    this.pickables.push({ inst, object: hub, kind: 'spinner' });
  }

  splitter(inst, g) {
    const lane = inst.laneByName.left;
    const f = lane.frame(0.004, { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), w: new THREE.Vector3(), k: new THREE.Vector3() });
    const style = this.theme.splitter || {};
    const pivot = new THREE.Group();
    pivot.position.copy(f.p).addScaledVector(f.u, 0.012);
    const flap = this.mesh(roundedBox(0.003, 0.02, 0.026, 0.001), style.mat || this.theme.trough.mat, pivot);
    flap.position.set(0, -0.004, 0.0);
    const [ax, az] = rotXZ(1, 0, inst.placement.rot);
    pivot.lookAt(pivot.position.clone().add(new THREE.Vector3(ax, 0, az)));
    g.add(pivot);
    this.movers.push({ type: 'splitter', pivot, mech: inst.mech.splitter, inst });
  }

  // the cup where marbles are dropped in
  cup(inst, g) {
    const style = this.theme.cup || {};
    const lane = inst.laneByName.main;
    const p0 = new THREE.Vector3().fromArray(lane.pos, 0);
    const y = p0.y + 0.03;
    const prof = [
      [0.008, 0],
      [0.012, 0.006],
      [0.02, 0.016],
      [0.034, 0.03],
      [0.038, 0.036],
      [0.036, 0.037],
      [0.031, 0.031],
      [0.017, 0.018],
      [0.0095, 0.008],
      [0.0085, 0.001],
    ];
    const m = this.mesh(lathe(prof, 56), style.mat, g);
    m.position.set(inst.spawn.x, y - 0.012, inst.spawn.z);
    m.material.side = THREE.DoubleSide;
    // a short clear neck down to the track
    if (style.neck !== null) {
      const neck = this.mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.02, 24, 1, true), style.neck || this.theme.tube.mat, g);
      neck.position.set(inst.spawn.x, y - 0.022, inst.spawn.z);
    }
  }

  lift(inst, g) {
    const style = this.theme.lift || {};
    const ride = inst.laneByName.ride;
    const box = new THREE.Box3().setFromArray(ride.pos);
    const c = box.getCenter(new THREE.Vector3());
    const h = box.max.y - box.min.y + 0.02;
    // clear column with a turning screw inside
    const tube = this.mesh(new THREE.CylinderGeometry(0.0135, 0.0135, h, 32, 1, true), style.tube || this.theme.tube.mat, g);
    tube.position.set(c.x, box.min.y + h / 2 - 0.01, c.z);
    const screw = new THREE.Group();
    screw.position.set(c.x, box.min.y - 0.01, c.z);
    // the screw's flight: a thin helical ramp from the core to the wall
    this.mesh(helicoid(0.0024, 0.0122, h, Math.max(1, Math.round(h / 0.035)), 0.0012), style.screw || this.theme.tube.mat, screw);
    const core = this.mesh(new THREE.CylinderGeometry(0.0022, 0.0022, h, 10), style.core || style.screw || this.theme.tube.mat, screw);
    core.position.y = h / 2;
    g.add(screw);
    // intake and outlet troughs are swept by piece(); a cap on top
    const capM = this.mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.008, 28), style.cap || this.theme.trough.mat, g);
    capM.position.set(c.x, box.max.y + 0.014, c.z);
    this.movers.push({ type: 'lift', screw, mech: inst.mech.lift, inst });
  }

  goalFlag(inst, g) {
    const lane = inst.laneByName.main;
    const p = new THREE.Vector3().fromArray(lane.pos, Math.floor(lane.n / 2) * 3);
    const style = this.theme.goal || {};
    const pole = this.mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.06, 8), style.pole || this.theme.trough.mat, g);
    pole.position.set(p.x, p.y + 0.03, p.z - 0.019);
    const flag = this.mesh(roundedBox(0.022, 0.014, 0.0012, 0.0005, 1), style.flag, g);
    flag.position.set(p.x + 0.011, p.y + 0.052, p.z - 0.019);
    this.movers.push({ type: 'goal', flag, mech: inst.mech.goal, inst });
  }

  // ------------------------------------------------------------ motion

  animate(dt, time) {
    for (const m of this.movers) {
      switch (m.type) {
        case 'wheel':
          m.mech.angle += m.mech.omega * dt;
          m.spin.rotation.z = m.mech.angle;
          break;
        case 'spinner':
          m.mech.angle += m.mech.omega * dt;
          m.mech.omega *= Math.exp(-0.7 * dt);
          m.spin.rotation.z = m.mech.angle;
          break;
        case 'bell': {
          const b = m.mech;
          b.vel += (-40 * b.swing - 1.6 * b.vel) * dt;
          b.swing += b.vel * dt;
          m.pivot.quaternion.setFromAxisAngle(m.axis, b.swing);
          break;
        }
        case 'splitter': {
          const s = m.mech;
          const target = s.side ? 0.35 : -0.35;
          s.tilt += (target - s.tilt) * Math.min(1, dt * 14);
          m.pivot.rotation.z = s.tilt;
          break;
        }
        case 'lift':
          m.screw.rotation.y -= dt * (m.mech.running ? 5.5 : 1.2);
          m.mech.running = Math.max(0, m.mech.running - dt * 0.5);
          break;
        case 'goal':
          m.flag.rotation.y = Math.sin(time * 3) * 0.2;
          break;
        default:
          break;
      }
    }
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    this.geos = [];
    this.group?.removeFromParent();
    this.group = null;
  }
}

// Stacked toy blocks under a piece, like a wooden marble-run kit.
export function pillarBlocks(p, parent, skin) {
  const theme = skin.theme;
  const h = p.y1 - p.y0;
  // whole cube blocks from the bottom, one shorter block on top to fit
  const unit = POST;
  const n = Math.max(1, Math.round(h / unit));
  const bh0 = h / n;
  const seed = (p.i * 73856093) ^ (p.j * 19349663);
  for (let k = 0; k < n; k++) {
    const mat = theme.block ? theme.block(p.inst, seed + k * 7) : theme.trough.mat;
    const m = skin.mesh(blockGeo(bh0), mat, parent);
    m.position.set(p.x, p.y0 + (k + 0.5) * bh0, p.z);
  }
}

const DEPTH_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true });

// posts are this wide (the sim's collision boxes match)
export const POST = 0.038;
const blockGeos = new Map();
function blockGeo(h) {
  const key = Math.round(h * 2000);
  if (!blockGeos.has(key)) {
    const g = roundedBox(POST, key / 2000 - 0.0008, POST, Math.min(0.0028, key / 6000), 2);
    g.userData.shared = true;
    blockGeos.set(key, g);
  }
  return blockGeos.get(key);
}

// Slim posts under a piece (glass, stone or brass levels).
export function pillarPosts(p, parent, skin, mat) {
  const h = p.y1 - p.y0;
  if (h < 0.004) return;
  const m = skin.mesh(new THREE.CylinderGeometry(0.004, 0.004, h, 16), mat, parent);
  m.position.set(p.x, p.y0 + h / 2, p.z);
}

export { profile, arcPts };

// A screw flight: a ramp winding round the y axis from radius r0 to r1,
// `turns` times over height h, as a closed slab `t` thick (so it needs no
// double-sided material).
function helicoid(r0, r1, h, turns, t) {
  const n = turns * 48;
  const pos = [];
  const idx = [];
  // rows: top inner, top outer, bottom outer, bottom inner
  for (let i = 0; i <= n; i++) {
    const a = (i / 48) * Math.PI * 2;
    const y = (i / n) * h;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    pos.push(c * r0, y + t / 2, sn * r0, c * r1, y + t / 2, sn * r1, c * r1, y - t / 2, sn * r1, c * r0, y - t / 2, sn * r0);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 4;
    const b = a + 4;
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      idx.push(a + k, b + k, a + k1, a + k1, b + k, b + k1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
