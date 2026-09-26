// Cosmic Observatory: a brass-and-glass marble run on a white marble plinth
// floating among the stars (reference picture 4). The lift is the
// observatory tower in the middle: a glowing glass column in a brass cage
// with a glass dome and a little orrery on top. From the top a white marble
// rail runs left under three orb chimes (glowing glass orbs with planets in
// them, in brass gimbals) to a cut-diamond funnel; glowing glass tubes carry
// marbles down to a flipper, which sends them either along a glowing tube
// to the violet loop and back round the right side to the tower, or over a
// brass sun gear and a star spinner along the moon-rock track to the tray at
// the front.
import * as THREE from 'three';
import { PIECES } from '../track/pieces.js';
import { mergeGeometries, sweep, profile } from '../geometry.js';

export const id = 'cosmic';

// cells where the telescope and the crystal clusters stand
const BLOCKED = new Set(['6,-3', '7,-3', '6,-2', '7,-2', '-12,-3', '-12,-2', '7,3']);

// cell (0, 0) of the build grid, on the plinth top
export const grid = {
  origin: new THREE.Vector3(0.05, 0, -0.025),
  min: [-12, -3],
  max: [7, 4],
  blocked: (i, j) => BLOCKED.has(`${i},${j}`),
};

export const ground = { y: 0, surface: 'stone', bounds: { minX: -0.66, maxX: 0.5, minZ: -0.34, maxZ: 0.34 } };

export const palette = 'cosmic';

// The ready-made run. Levels are 1 cm steps; see track/pieces.js.
export const layout = [
  // the tower: marbles come in at its foot from the right, ride up the
  // glowing column and leave at the top heading left
  { type: 'lift', i: -1, j: -2, level: 0, rot: 2, h: 41, out: 'E' },
  // the top rail with its three orb chimes, into the diamond funnel
  { type: 'straight', i: -2, j: -2, level: 40, rot: 2 },
  { type: 'bell', i: -3, j: -2, level: 39, rot: 2 },
  { type: 'bell', i: -4, j: -2, level: 38, rot: 2 },
  { type: 'bell', i: -5, j: -2, level: 37, rot: 2 },
  { type: 'funnel', i: -6, j: -1, level: 28, rot: 2 },
  // down a glowing tube to the flipper
  { type: 'curveL', i: -8, j: -1, level: 27, rot: 2 },
  { type: 'tube2', i: -8, j: 0, level: 26, rot: 1 },
  { type: 'splitter', i: -8, j: 2, level: 25, rot: 1 },
  // one way: glowing tubes across the middle, the loop, and back round
  // the right-hand side and along the back to the tower's foot
  { type: 'tube3', i: -7, j: 2, level: 23 },
  { type: 'tube3', i: -4, j: 2, level: 21 },
  { type: 'long', i: -1, j: 2, level: 20 },
  { type: 'loop', i: 1, j: 2, level: 7 },
  { type: 'curveL', i: 4, j: 3, level: 6 },
  { type: 'long', i: 4, j: 2, level: 5, rot: 3 },
  { type: 'long', i: 4, j: 0, level: 4, rot: 3 },
  { type: 'curveL', i: 4, j: -2, level: 3, rot: 3 },
  { type: 'long', i: 3, j: -2, level: 2, rot: 2 },
  { type: 'long', i: 1, j: -2, level: 1, rot: 2 },
  // the other way: the sun gear sends marbles back underneath, two turns
  // at the far left take the speed out of them, then the moon-rock track
  // runs along the front past the star spinner to the tray
  { type: 'wheel', i: -9, j: 2, level: 15, rot: 2 },
  { type: 'uturnR', i: -8, j: 2, level: 13, tint: 'rock' },
  { type: 'uturnL', i: -9, j: 3, level: 11, rot: 2, tint: 'rock' },
  { type: 'long', i: -8, j: 4, level: 10, tint: 'rock' },
  { type: 'spinner', i: -6, j: 4, level: 9 },
  { type: 'long', i: -5, j: 4, level: 8, tint: 'rock' },
  { type: 'long', i: -3, j: 4, level: 7, tint: 'rock' },
  { type: 'long', i: -1, j: 4, level: 6, tint: 'rock' },
  { type: 'long', i: 1, j: 4, level: 5, tint: 'rock' },
  { type: 'long', i: 3, j: 4, level: 4, tint: 'rock' },
  { type: 'catcher', i: 5, j: 4, level: 3 },
];

// What Big kid builders get to place on this level.
export const kit = ['straight', 'long', 'long3', 'steep', 'curveL', 'curveR', 'bendL', 'bendR', 'uturnL', 'uturnR', 'drop', 'tube2', 'tube3', 'funnel', 'loop', 'wheel', 'spinner', 'bell', 'splitter', 'catcher', 'goal', 'start', 'lift'];

// ------------------------------------------------------------ the look

const R = 0.0095; // marble radius
const frame = () => ({ p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), w: new THREE.Vector3(), k: new THREE.Vector3() });

// Place a geometry (translate, rotate, scale) and make it non-indexed so a
// handful can be merged into one mesh.
function placed(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  geo.applyMatrix4(m);
  const out = geo.index ? geo.toNonIndexed() : geo;
  if (out !== geo) geo.dispose();
  return out;
}

// Materials and styles for this level's pieces, and the landmarks built onto
// them: the observatory tower round the lift, orb chimes for bells, a cut
// crystal round the funnel and a brass sun gear on the wheel.
export function theme(mats, quality = {}) {
  // the lens pass (depth of field, ambient occlusion) is what needs glass
  // depth; phones without it skip the twins, and the fine glow lines
  const needDepth = quality.dof !== false || quality.ao !== false;
  const fine = quality.tier !== 'low';
  const stone = mats.marbleStone({ color: '#f3efe9', veins: '#a39a9f' });
  const brass = mats.brass({ polish: 0.88, age: 0.12 });
  const oldBrass = mats.brass({ polish: 0.6, age: 0.45 });
  const gold = mats.gold({ polish: 0.92 });
  const chrome = mats.chrome();
  const rock = mats.asteroid();
  const ivory = mats.ceramic({ color: '#f4ecdc' });
  const walnut = mats.wood({ species: 'walnut', mapping: 'object', finish: 'lacquer' });
  const violet = mats.glowGlass({ color: '#8f74ff', glow: 0.55 });
  const blue = mats.glowGlass({ color: '#5aa8ff', glow: 0.5 });
  const cyan = mats.glowGlass({ color: '#62d8ff', glow: 1.1 });
  const orbGlass = mats.glowGlass({ color: '#b48cff', glow: 1.2 });
  // the tower's column: clear glass, just lit at its edges
  const column = mats.glowGlass({ color: '#a9b8ff', glow: 0.3 });
  // the light running up the middle of the tower
  const beamCore = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8d9bff').multiplyScalar(2.6) });
  const clear = mats.acrylic({ tint: '#f2f4ff' });
  const diamond = mats.crystal({ tint: '#cfe4ff', glow: 0.45 });
  const tints = {
    rock: { mat: rock, top: 0.005, width: 0.046 },
    gold: { kind: 'shell', mat: gold, top: 0.007, thickness: 0.0026 },
    violet: { kind: 'shell', mat: violet, top: 0.007, thickness: 0.0026 },
    blue: { kind: 'shell', mat: blue, top: 0.007, thickness: 0.0026 },
  };
  // little planets inside the orbs
  const orbCores = ['#7f63e8', '#3fa7c9', '#d98b52'].map((c) => mats.plastic({ color: c, gloss: 0.7 }));

  // which sound each lane makes: stone, glass or moon rock
  function surfaces(inst) {
    const tint = inst.placement.tint;
    for (const lane of inst.lanes) {
      if (tint === 'rock') lane.surface = 'rock';
      else if (lane.tube || inst.def.loop || tint === 'violet' || tint === 'blue') lane.surface = 'glass';
      else if (inst.def.lift && lane.kinematic) lane.surface = 'glass';
      else lane.surface = 'stone';
    }
  }

  // A toothed brass gear, flat in its own xy plane, centred on the origin.
  function gearGeometry(r, teeth, depth, hole) {
    const shape = new THREE.Shape();
    for (let i = 0; i < teeth * 4; i++) {
      const a = (i / (teeth * 4)) * Math.PI * 2;
      const rr = i % 4 === 1 || i % 4 === 2 ? r : r - 0.007;
      if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    shape.closePath();
    if (hole) {
      const h = new THREE.Path();
      h.absarc(0, 0, hole, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.0007, bevelSize: 0.0006, bevelSegments: 1, curveSegments: 4 });
    geo.translate(0, 0, -depth / 2);
    return geo;
  }

  // ---- the lift: a clear glass column with the gold helix turning inside
  // round a glowing core, wound by a brass hand-crank gear on a post beside
  // it (the gear in the picture). The column is dressed as the observatory
  // tower: a brass cage, a gallery, a glass dome and a little orrery.
  function lift(inst, g, skin) {
    skin.piece(inst, g);
    const ride = inst.laneByName.ride;
    const box = new THREE.Box3().setFromArray(ride.pos);
    const c = box.getCenter(new THREE.Vector3());
    const base = inst.placement.level * 0.01 + inst.layoutOrigin.y;
    const y1 = box.max.y + 0.01;
    const outlet = inst.laneByName.outlet;
    const topY = outlet.pos[outlet.pos.length - 2];
    const n3 = outlet.pos.length - 3;
    const od = new THREE.Vector2(outlet.pos[n3] - c.x, outlet.pos[n3 + 2] - c.z).normalize();
    // brass foot
    const foot = skin.mesh(skin.theme._lathe([[0.001, 0], [0.034, 0], [0.036, 0.003], [0.033, 0.006], [0.026, 0.008], [0.022, 0.011], [0.017, 0.013], [0.001, 0.013]], 48), brass, g);
    foot.position.set(c.x, base, c.z);
    // the cage: slim rods and rings
    const parts = [];
    const cageR = 0.021;
    const cy0 = base + 0.045;
    const cy1 = y1 - 0.02;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      parts.push(placed(new THREE.CylinderGeometry(0.0011, 0.0011, cy1 - cy0, 8), { p: [Math.cos(a) * cageR, (cy0 + cy1) / 2, Math.sin(a) * cageR] }));
    }
    const nRings = Math.max(2, Math.round((cy1 - cy0) / 0.075));
    for (let k = 0; k <= nRings; k++) {
      const y = cy0 + ((cy1 - cy0) * k) / nRings;
      parts.push(placed(new THREE.TorusGeometry(cageR, k === 0 || k === nRings ? 0.0022 : 0.0014, 8, 40), { p: [0, y, 0], r: [Math.PI / 2, 0, 0] }));
    }
    // the gallery at the top: a brass ring with little balusters, open
    // where marbles leave
    parts.push(placed(new THREE.TorusGeometry(0.026, 0.0026, 8, 40), { p: [0, cy1 + 0.002, 0], r: [Math.PI / 2, 0, 0] }));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (Math.cos(a) * od.x + Math.sin(a) * od.y > 0.4) continue;
      parts.push(placed(new THREE.CylinderGeometry(0.0009, 0.0009, 0.012, 6), { p: [Math.cos(a) * 0.026, cy1 + 0.008, Math.sin(a) * 0.026] }));
      parts.push(placed(new THREE.SphereGeometry(0.0016, 8, 6), { p: [Math.cos(a) * 0.026, cy1 + 0.0145, Math.sin(a) * 0.026] }));
    }
    const cage = skin.mesh(skin.theme._merge(parts), brass, g);
    cage.position.set(c.x, 0, c.z);
    // the dome: a clear glass bubble on a brass ring, with a finial
    const dy = topY + 0.06;
    skin.mesh(new THREE.SphereGeometry(0.024, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.78), clear, g).position.set(c.x, dy, c.z);
    const dparts = [
      placed(new THREE.TorusGeometry(0.0188, 0.0022, 8, 40), { p: [0, dy - 0.0152, 0], r: [Math.PI / 2, 0, 0] }),
      placed(new THREE.CylinderGeometry(0.0016, 0.0016, 0.024, 8), { p: [0, dy + 0.024 + 0.006, 0] }),
      placed(new THREE.SphereGeometry(0.0038, 16, 12), { p: [0, dy + 0.024 + 0.019, 0] }),
      // meridian ribs over the dome
      ...[0, 1, 2].map((k) => placed(new THREE.TorusGeometry(0.0243, 0.0008, 6, 48, Math.PI * 0.62), { p: [0, dy, 0], r: [0, (k * Math.PI) / 3, Math.PI * 0.19] })),
    ];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const ya = cy1 + 0.004;
      const yb = dy - 0.0152;
      dparts.push(placed(new THREE.CylinderGeometry(0.0012, 0.0012, yb - ya, 8), { p: [Math.cos(a) * 0.0188, (ya + yb) / 2, Math.sin(a) * 0.0188] }));
    }
    skin.mesh(skin.theme._merge(dparts), brass, g).position.set(c.x, 0, c.z);
    // the orrery: a tilted gold ring round the dome carrying two little
    // planets, turning slowly (driven like a wheel that never stops)
    const orrery = new THREE.Group();
    orrery.position.set(c.x, dy - 0.004, c.z);
    orrery.rotation.set(-Math.PI / 2 + 0.28, 0, 0.2);
    const spin = new THREE.Group();
    orrery.add(spin);
    skin.mesh(new THREE.TorusGeometry(0.042, 0.0011, 6, 64), gold, spin);
    skin.mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 0.084, 6), gold, spin).rotation.z = Math.PI / 2;
    skin.mesh(new THREE.SphereGeometry(0.0052, 20, 14), orbGlass, spin).position.set(0.042, 0, 0);
    skin.mesh(new THREE.SphereGeometry(0.0038, 16, 12), gold, spin).position.set(-0.042, 0, 0);
    g.add(orrery);
    skin.movers.push({ type: 'wheel', spin, mech: { angle: 0, omega: 0.35 }, inst });
    // a glowing ring round the tower's foot
    const halo = skin.mesh(new THREE.TorusGeometry(0.03, 0.0022, 8, 48), cyan, g);
    halo.rotation.x = Math.PI / 2;
    halo.position.set(c.x, base + 0.004, c.z);

    // The crank gear, beside the column on the side away from the outlet
    // (to the right when the outlet leaves to the left), a third of the way
    // up, facing the front; its teeth just meet the column as if they
    // drove the helix. It turns with the lift's screw.
    const lm = skin.movers.find((x) => x.inst === inst && x.type === 'lift');
    const side = od.x <= 0 ? 1 : -1;
    const gr = 0.05;
    const gc = new THREE.Vector3(c.x + side * (0.0175 + gr - 0.004), base + 0.021 + (y1 - base) * 0.46, c.z);
    const post = [
      placed(new THREE.CylinderGeometry(0.004, 0.0048, gc.y - base, 14), { p: [gc.x, base + (gc.y - base) / 2, gc.z - 0.026] }),
      placed(skin.theme._lathe([[0.001, 0], [0.012, 0], [0.0125, 0.0025], [0.009, 0.005], [0.006, 0.007], [0.001, 0.007]], 20), { p: [gc.x, base, gc.z - 0.026] }),
      placed(new THREE.CylinderGeometry(0.0026, 0.0026, 0.03, 12), { p: [gc.x, gc.y, gc.z - 0.013], r: [Math.PI / 2, 0, 0] }),
      placed(new THREE.SphereGeometry(0.0055, 14, 10), { p: [gc.x, gc.y, gc.z - 0.026] }),
    ];
    skin.mesh(skin.theme._merge(post), oldBrass, g);
    const gearRoot = new THREE.Group();
    gearRoot.position.copy(gc);
    g.add(gearRoot);
    const gearSpin = new THREE.Group();
    gearRoot.add(gearSpin);
    const gparts = [placed(gearGeometry(gr, 24, 0.005, gr - 0.013))];
    // spokes and hub
    for (let k = 0; k < 6; k++) gparts.push(placed(new THREE.BoxGeometry(0.0035, gr * 2 - 0.018, 0.004), { r: [0, 0, (k / 6) * Math.PI] }));
    gparts.push(placed(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 20), { r: [Math.PI / 2, 0, 0] }));
    // the crank arm on the front
    gparts.push(placed(new THREE.BoxGeometry(0.036, 0.006, 0.003), { p: [0.016, 0, 0.0055] }));
    skin.mesh(skin.theme._merge(gparts), brass, gearSpin);
    const handle = skin.mesh(new THREE.CylinderGeometry(0.0038, 0.0042, 0.02, 16), walnut, gearSpin);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0.032, 0, 0.017);
    const knob = skin.mesh(new THREE.SphereGeometry(0.0045, 14, 10), walnut, gearSpin);
    knob.position.set(0.032, 0, 0.027);
    // the gear follows the screw (a slower, geared-down turn)
    const screw = lm?.screw;
    const mech = {
      omega: 0,
      get angle() {
        return screw ? screw.rotation.y * 0.3 * side : 0;
      },
      set angle(v) {
        void v;
      },
    };
    skin.movers.push({ type: 'wheel', spin: gearSpin, mech, inst });
  }

  // ---- an orb chime: a glowing glass orb in a brass gimbal ring, hung
  // from a brass arch over the track, swinging when a marble passes
  function bell(inst, g, skin) {
    const lane = inst.laneByName.main;
    skin.trough(lane, g, skin.theme.trough);
    const e = lane.events.find((x) => x.type === 'bell');
    const f = lane.frame(e.s, frame());
    const orbR = 0.017;
    const hang = new THREE.Group();
    // the orb's bottom just clears a passing marble
    const pivotY = f.p.y + R + 0.004 + orbR * 2 + 0.012;
    const pivot = new THREE.Group();
    pivot.position.set(f.p.x, pivotY, f.p.z);
    pivot.add(hang);
    g.add(pivot);
    const oy = -0.012 - orbR;
    const orb = skin.mesh(new THREE.SphereGeometry(orbR, 32, 20), orbGlass, hang);
    orb.position.y = oy;
    const core = skin.mesh(new THREE.SphereGeometry(orbR * 0.5, 24, 16), orbCores[skin.bellCount % 3], hang);
    core.position.y = oy;
    // gimbal: a vertical ring round the orb (across the track, so it swings
    // in its own plane) and a horizontal one, a rod and a cap, as one mesh
    const across = Math.atan2(f.t.x, f.t.z);
    const gim = [
      placed(new THREE.TorusGeometry(orbR + 0.0022, 0.0011, 8, 40), { p: [0, oy, 0], r: [0, across, 0] }),
      placed(new THREE.TorusGeometry(orbR + 0.0022, 0.0009, 8, 40), { p: [0, oy, 0], r: [Math.PI / 2, 0, 0] }),
      placed(new THREE.CylinderGeometry(0.0009, 0.0009, 0.012, 8), { p: [0, -0.006, 0] }),
      placed(new THREE.SphereGeometry(0.0022, 12, 8), { p: [0, oy + orbR + 0.0022, 0] }),
    ];
    skin.mesh(skin.theme._merge(gim), brass, hang);
    // the arch
    const barY = pivotY + 0.002;
    const parts = [];
    for (const sgn of [-1, 1]) {
      const b = f.p.clone().addScaledVector(f.w, sgn * 0.025);
      const h = barY - (f.p.y - 0.012);
      parts.push(placed(new THREE.CylinderGeometry(0.0018, 0.0022, h, 10), { p: [b.x, f.p.y - 0.012 + h / 2, b.z] }));
      parts.push(placed(new THREE.SphereGeometry(0.003, 12, 8), { p: [b.x, barY, b.z] }));
    }
    const bar = new THREE.CylinderGeometry(0.0015, 0.0015, 0.05, 10);
    bar.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.w.clone().normalize())));
    bar.translate(f.p.x, barY, f.p.z);
    parts.push(bar.toNonIndexed());
    bar.dispose();
    skin.mesh(skin.theme._merge(parts), brass, g);
    inst.mech.bell.index = inst.placement.bellIndex ?? skin.bellCount++ % 3;
    skin.movers.push({ type: 'bell', pivot, axis: f.t.clone(), mech: inst.mech.bell, inst });
    skin.pickables.push({ inst, object: pivot, kind: 'bell' });
  }

  // ---- the funnel: a glowing blue bowl set in a cut diamond
  function funnel(inst, g, skin) {
    skin.piece(inst, g);
    const b = inst.bowl;
    const prof = [[0.007, -0.074], [0.066, -0.012], [0.069, -0.006], [0.066, 0.0], [0.058, 0.009], [0.057, 0.0095]];
    const d = skin.mesh(skin.theme._lathe(prof, 10), diamond, g);
    d.position.set(b.x, b.rimY, b.z);
    d.rotation.y = 0.3;
    const ring = skin.mesh(new THREE.TorusGeometry(0.0575, 0.0018, 8, 64), gold, g);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(b.x, b.rimY + 0.0095, b.z);
  }

  // ---- the wheel: a brass sun gear with a crank, turning with the wheel
  function wheel(inst, g, skin) {
    skin.piece(inst, g);
    const m = skin.movers.find((x) => x.inst === inst && x.type === 'wheel');
    if (!m) return;
    const w = inst.mech.wheel;
    const rim = w.radius + R + 0.004;
    const teeth = 18;
    const shape = new THREE.Shape();
    for (let i = 0; i < teeth * 4; i++) {
      const a = (i / (teeth * 4)) * Math.PI * 2;
      const r = i % 4 === 1 || i % 4 === 2 ? rim + 0.009 : rim + 0.002;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, rim - 0.006, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const gearGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0006, bevelSegments: 1, curveSegments: 6 });
    const gear = skin.mesh(gearGeo, brass, m.spin);
    gear.position.z = -0.021;
    // spokes behind the paddles
    const sp = [];
    for (let k = 0; k < 6; k++) sp.push(placed(new THREE.BoxGeometry(rim * 2 - 0.01, 0.003, 0.003), { p: [0, 0, -0.019], r: [0, 0, (k / 6) * Math.PI] }));
    skin.mesh(skin.theme._merge(sp), oldBrass, m.spin);
    // the crank on the front
    const arm = skin.mesh(new THREE.BoxGeometry(0.03, 0.005, 0.003), brass, m.spin);
    arm.position.set(0.015, 0, 0.028);
    const knob = skin.mesh(new THREE.CylinderGeometry(0.0035, 0.004, 0.016, 16), ivory, m.spin);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(0.03, 0, 0.036);
  }

  // Brass posts under the pieces, turned rings every so often, on a small
  // marble foot: slim like the picture's, but plenty of them.
  function pillar(p, group, skin) {
    const h = p.y1 - p.y0;
    if (h < 0.004) return;
    const parts = [placed(new THREE.CylinderGeometry(0.0052, 0.0052, h, 16), { p: [0, h / 2, 0] })];
    parts.push(placed(new THREE.CylinderGeometry(0.0078, 0.0078, 0.005, 18), { p: [0, h - 0.0025, 0] }));
    parts.push(placed(new THREE.CylinderGeometry(0.0062, 0.0078, 0.004, 18), { p: [0, h - 0.007, 0] }));
    // a little brass ball on top, so a post that ends under a loop or a
    // gear looks finished rather than cut off
    parts.push(placed(new THREE.SphereGeometry(0.0058, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), { p: [0, h, 0] }));
    const n = Math.floor(h / 0.09);
    for (let k = 1; k <= n; k++) parts.push(placed(new THREE.TorusGeometry(0.0056, 0.0014, 6, 18), { p: [0, (h * k) / (n + 1), 0], r: [Math.PI / 2, 0, 0] }));
    if (p.y0 < 0.001) parts.push(placed(skin.theme._lathe([[0.001, 0], [0.013, 0], [0.0135, 0.0025], [0.011, 0.005], [0.0075, 0.008], [0.001, 0.008]], 24)));
    const post = skin.mesh(skin.theme._merge(parts), brass, group);
    post.position.set(p.x, p.y0, p.z);
  }

  // Glass is blended without writing depth, so the lens pass would see the
  // far sky through it and blur a tube as if it were light years away. A
  // depth-only twin of each glass mesh, drawn after everything else, puts
  // its distance in the depth buffer without changing a single colour.
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true });
  function depthProxies(inst, g, skin) {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    // parts that swing or turn keep a twin of their own; the rest share one
    const moving = new Set();
    for (const m of skin.movers) if (m.inst === inst) for (const v of Object.values(m)) if (v?.isObject3D) moving.add(v);
    const statics = [];
    const twins = [];
    g.traverse((o) => {
      if (!o.isMesh || !o.material.transparent || o.userData.depthProxy) return;
      let moves = false;
      for (let a = o; a && a !== g; a = a.parent) if (moving.has(a)) moves = true;
      (moves ? twins : statics).push(o);
    });
    for (const o of twins) {
      const d = new THREE.Mesh(o.geometry, depthOnly);
      d.userData.depthProxy = true;
      d.renderOrder = 50;
      o.add(d);
    }
    if (!statics.length) return;
    const geos = statics.map((o) => {
      const q = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      q.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      return q;
    });
    const d = skin.mesh(mergeGeometries(geos), depthOnly, g);
    d.userData.depthProxy = true;
    d.renderOrder = 50;
  }

  // A thin violet light line along each side of the marble tracks, low
  // down, as if the stone were lit from inside (the picture's glowing rails).
  const lineGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8f70ff').multiplyScalar(3.2), side: THREE.DoubleSide });
  function glowLines(inst, g, skin) {
    const tint = inst.placement.tint;
    if ((tint && tint !== 'gold') || inst.def.lift || inst.def.bowl || inst.def.loop || inst.def.wheel || inst.def.id === 'drop' || inst.def.id === 'tallDrop') return;
    const parts = [];
    for (const lane of inst.lanes) {
      if (lane.tube || lane.kinematic) continue;
      for (const sgn of [-1, 1]) {
        const a = sgn * 0.0197;
        const b = sgn * 0.021;
        const w0 = Math.min(a, b);
        const w1 = Math.max(a, b);
        const geo = sweep(lane, profile([[w0, -0.0125], [w1, -0.0125], [w1, -0.0112], [w0, -0.0112]], true), { step: 0.006 });
        parts.push(geo.index ? geo.toNonIndexed() : geo);
        if (geo.index) geo.dispose();
      }
    }
    if (!parts.length) return;
    const m = skin.mesh(mergeGeometries(parts), lineGlow, g);
    m.castShadow = false;
    m.userData.noShadow = true;
  }

  const custom = { lift, bell, funnel, wheel };
  const pieces = {};
  for (const id of Object.keys(PIECES)) {
    pieces[id] = function (inst, g, skin) {
      surfaces(inst);
      (custom[id] || ((i, gg, s) => s.piece(i, gg)))(inst, g, skin);
      if (fine) glowLines(inst, g, skin);
      if (needDepth) depthProxies(inst, g, skin);
    };
  }

  return {
    trough: { mat: stone, top: 0.004, width: 0.04 },
    tinted: (tint) => tints[tint] || { mat: stone, top: 0.004, width: 0.04 },
    loop: { kind: 'shell', mat: violet, top: 0.009, thickness: 0.003 },
    tube: { mat: blue, thickness: 0.0016 },
    enclosed: { mat: clear },
    funnel: { mat: cyan, stemMat: blue },
    bell: { mat: brass, bead: brass, clapper: brass, frame: { mat: brass }, size: 0.016 },
    wheel: { segmentMats: [gold, brass], paddle: gold, hub: chrome, cover: null, mat: brass },
    spinner: { mat: brass, tip: orbGlass, post: brass },
    splitter: { mat: gold },
    cup: { mat: brass, neck: clear },
    lift: { tube: column, screw: gold, core: beamCore, cap: brass },
    goal: { flag: orbGlass, pole: brass },
    block: () => stone,
    pillar,
    pieces,
    _lathe: (pairs, segs) => new THREE.LatheGeometry(pairs.map(([x, y]) => new THREE.Vector2(x, y)), segs),
    _merge: (list) => mergeGeometries(list),
  };
}

// a little above the plinth, looking down on the run as in the picture
export const cameraDefault = { target: new THREE.Vector3(-0.07, 0.18, 0.0), distance: 1.24, azimuth: THREE.MathUtils.degToRad(0), elevation: THREE.MathUtils.degToRad(25), fov: 34 };

export async function setting(ctx) {
  const mod = await import('./cosmic-setting.js');
  return mod.createCosmicSetting(ctx);
}
