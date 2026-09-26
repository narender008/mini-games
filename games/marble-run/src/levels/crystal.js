// Crystal Night: a glowing glass marble run on white glazed ceramic, out on
// a misty blue night. Edge-lit cyan glass troughs with gold trim, a big
// glass spiral funnel fed by a glowing glass elevator column at the left,
// a gold and glass starburst spinner, three glass bells with warm lamps in them across
// the top, glowing switchbacks down the right, a long front run into a
// glass loop-the-loop and, at the front left, a little oval run from a
// glass cup.
import * as THREE from 'three';
import { R_MARBLE } from '../config.js';
import { CHANNELS } from '../track/path.js';
import { sweep, profile, arcPts, roundedBox, lathe, mergeGeometries } from '../geometry.js';

export const id = 'crystal';

// cell (0, 0) of the build grid, on the base top
export const grid = {
  origin: new THREE.Vector3(0.02, 0, -0.1),
  min: [-12, -1],
  max: [8, 7],
};

export const ground = { y: 0, surface: 'ceramic', bounds: { minX: -0.6, maxX: 0.4, minZ: -0.13, maxZ: 0.32 } };

export const palette = 'crystal';

// The ready-made run. Levels are 1 cm steps; see track/pieces.js.
export const layout = [
  // the glass elevator at the front left carries marbles up to the rim of
  // the big glass funnel
  { type: 'lift', i: -6, j: 4, level: 0, rot: 2, h: 48, out: 'W' },
  { type: 'bigFunnel', i: -5, j: 2, level: 36 },
  { type: 'long', i: -2, j: 2, level: 35 },
  // a flipper sends marbles on round the run, or down a short slope into a
  // little glass dish on a post
  { type: 'splitter', i: 0, j: 2, level: 34 },
  { type: 'long', i: 0, j: 3, level: 33, rot: 1 },
  { type: 'catcher', i: 0, j: 5, level: 32, rot: 1 },
  // across the top: past the starburst and under the three bells
  { type: 'curveR', i: 0, j: 1, level: 33, rot: 3 },
  { type: 'spinner', i: 1, j: 1, level: 32 },
  { type: 'curveR', i: 2, j: 1, level: 31 },
  { type: 'curveL', i: 2, j: 2, level: 30, rot: 1 },
  { type: 'bell', i: 3, j: 2, level: 29 },
  { type: 'bell', i: 4, j: 2, level: 28 },
  { type: 'bell', i: 5, j: 2, level: 27 },
  // switchbacks down the right
  { type: 'uturnR', i: 6, j: 2, level: 25 },
  { type: 'long', i: 5, j: 3, level: 24, rot: 2 },
  { type: 'uturnL', i: 3, j: 3, level: 22, rot: 2 },
  { type: 'long', i: 4, j: 4, level: 21 },
  { type: 'uturnR', i: 6, j: 4, level: 19 },
  // the long front run through glowing tubes into the loop, and back to
  // the lift
  { type: 'tube3', i: 5, j: 5, level: 17, rot: 2 },
  { type: 'tube3', i: 2, j: 5, level: 15, rot: 2 },
  { type: 'long', i: -1, j: 5, level: 14, rot: 2 },
  { type: 'loop', i: -3, j: 5, level: 1, rot: 2 },
  // the little oval run at the front left: a glass cup, two turns, a bell
  { type: 'start', i: -11, j: 3, level: 12 },
  { type: 'long', i: -10, j: 3, level: 11 },
  { type: 'uturnR', i: -8, j: 3, level: 9 },
  { type: 'long', i: -9, j: 4, level: 8, rot: 2 },
  { type: 'uturnL', i: -11, j: 4, level: 6, rot: 2 },
  { type: 'long', i: -10, j: 5, level: 5 },
  { type: 'bell', i: -8, j: 5, level: 4, bellIndex: 3 },
  { type: 'catcher', i: -7, j: 5, level: 3 },
];

// What Big kid builders get to place on this level.
export const kit = ['straight', 'long', 'long3', 'steep', 'curveL', 'curveR', 'bendL', 'bendR', 'uturnL', 'uturnR', 'drop', 'tube2', 'tube3', 'funnel', 'bigFunnel', 'loop', 'bigLoop', 'spinner', 'bell', 'splitter', 'catcher', 'goal', 'start', 'lift'];

// ------------------------------------------------------------ the look

// Unit shapes shared by every piece of every build (never disposed by the
// skin, which only frees geometry it made).
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const post = new THREE.CylinderGeometry(0.0042, 0.0042, 1, 16, 1, true);
  post.translate(0, 0.5, 0);
  const saddle = roundedBox(0.03, 0.007, 0.03, 0.0025, 2);
  const foot = new THREE.CylinderGeometry(0.0085, 0.011, 0.006, 24);
  const collar = new THREE.CylinderGeometry(0.0062, 0.0062, 0.004, 18);
  const bulb = new THREE.SphereGeometry(1, 16, 12);
  SHARED = { post, saddle, foot, collar, bulb };
  for (const g of Object.values(SHARED)) g.userData.shared = true;
  return SHARED;
}

const FRAME = () => ({ p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), w: new THREE.Vector3(), k: new THREE.Vector3() });

// Thin gold lines along both top edges of a glass trough, as one mesh.
function rims(skin, lane, g, style, mat) {
  const w = (style.width ?? 0.042) / 2 - 0.0012;
  const top = (style.top ?? 0.004) - 0.0006;
  const ring = (cw) => profile(arcPts(cw, top, 0.0011, 0, Math.PI * 2, 7).slice(0, -1), true);
  const a = sweep(lane, ring(-w), { step: 0.006 }).toNonIndexed();
  const b = sweep(lane, ring(w), { step: 0.006 }).toNonIndexed();
  const m = skin.mesh(mergeGeometries([a, b]), mat, g);
  m.userData.noShadow = true;
  return m;
}

// A gold band round a glowing tube at arc length s.
function band(skin, lane, s, g, mat, radius) {
  const f = lane.frame(s, FRAME());
  const geo = new THREE.TorusGeometry(radius, 0.0016, 8, 36);
  const m = skin.mesh(geo, mat, g);
  m.position.copy(f.p).addScaledVector(f.u, lane.rc - R_MARBLE);
  m.lookAt(m.position.clone().add(f.t));
  return m;
}

// Gold rims on every open glass lane of a piece (troughs, catchers, the
// splitter's arcs), after the skin has drawn it.
function trimmed(inst, g, skin) {
  skin.piece(inst, g);
  const t = skin.theme;
  for (const lane of inst.lanes) {
    if (lane.kinematic || lane.tube) continue;
    if (inst.def.bowl && lane.name === 'out') continue;
    if (lane.channel === CHANNELS.trough || lane.channel === CHANNELS.deep) rims(skin, lane, g, t.trough, t.trim);
  }
  if (inst.def.tubeLook) {
    const lane = inst.lanes[0];
    for (const s of [0.006, lane.length - 0.006]) band(skin, lane, s, g, t.trim, lane.rc + 0.0024);
  }
}

// A glass bell with a warm lamp for a clapper: the lamp swings with it. In
// place of the skin's frame, a gold gantry: a post clamped to the back of
// the trough and a bar along the track above the bell, sloping with it, so
// three bells in a row hang from one continuous gold rail on a colonnade.
function bellPiece(inst, g, skin) {
  trimmed(inst, g, skin);
  const mv = skin.movers.filter((m) => m.inst === inst && m.type === 'bell').pop();
  if (!mv) return;
  const t = skin.theme;
  const hang = mv.pivot.children[0];
  const size = t.bell.size;
  const halo = skin.mesh(shared().bulb, t.halo, hang);
  halo.scale.setScalar(size * 0.42);
  halo.position.y = -size * 1.12;
  halo.userData.noShadow = true;
  const lane = inst.laneByName.main;
  const e = lane.events.find((x) => x.type === 'bell');
  const f = lane.frame(e.s, FRAME());
  const rise = mv.pivot.position.y - f.p.y + 0.012;
  const a = lane.frame(0, FRAME()).p.addScaledVector(new THREE.Vector3(0, 1, 0), rise);
  const b = lane.frame(lane.length, FRAME()).p.addScaledVector(new THREE.Vector3(0, 1, 0), rise);
  const back = f.w.clone().multiplyScalar(-0.021);
  a.add(back);
  b.add(back);
  const parts = [];
  // the rail
  const len = a.distanceTo(b);
  const rail = new THREE.CylinderGeometry(0.0022, 0.0022, len, 10);
  rail.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()), new THREE.Vector3(1, 1, 1)));
  parts.push(rail.toNonIndexed());
  // the post, from the trough's back edge up to the rail
  const foot = f.p.clone().add(back);
  const top = a.clone().add(b).multiplyScalar(0.5);
  const post = new THREE.CylinderGeometry(0.0026, 0.0026, top.y - foot.y + 0.004, 10);
  post.translate(foot.x, (foot.y + top.y) / 2, foot.z);
  parts.push(post.toNonIndexed());
  // an arm from the rail out over the track to the bell's pivot
  const piv = mv.pivot.position.clone();
  const armFrom = new THREE.Vector3(piv.x, top.y, piv.z).add(back);
  const armTo = new THREE.Vector3(piv.x, top.y, piv.z);
  const arm = new THREE.CylinderGeometry(0.0016, 0.0016, armFrom.distanceTo(armTo), 8);
  arm.applyMatrix4(new THREE.Matrix4().compose(armFrom.clone().add(armTo).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), armTo.clone().sub(armFrom).normalize()), new THREE.Vector3(1, 1, 1)));
  parts.push(arm.toNonIndexed());
  const hook = new THREE.CylinderGeometry(0.0011, 0.0011, top.y - piv.y, 6);
  hook.translate(piv.x, (top.y + piv.y) / 2, piv.z);
  parts.push(hook.toNonIndexed());
  skin.mesh(mergeGeometries(parts), t.trim, g);
}

// The starburst: gold rods with balls, and between them shorter rods of
// glowing blue glass.
function spinnerPiece(inst, g, skin) {
  trimmed(inst, g, skin);
  const mv = skin.movers.filter((m) => m.inst === inst && m.type === 'spinner').pop();
  if (!mv) return;
  const n = skin.theme.spinner.blades ?? 12;
  const rods = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    const rod = new THREE.CylinderGeometry(0.0019, 0.0019, 0.03, 8);
    rod.rotateZ(a - Math.PI / 2);
    rod.translate(Math.cos(a) * 0.021, Math.sin(a) * 0.021, 0);
    rods.push(rod.toNonIndexed());
  }
  skin.mesh(mergeGeometries(rods), skin.theme.starGlass, mv.spin);
}

// The lift: a glowing glass elevator column. A white ceramic foot hides
// where marbles roll in; above it a violet-glowing glass tube with gold
// rings, clear enough in the middle to watch the marbles ride up inside,
// with a thin cyan light rail spiralling round its inside wall that turns
// while the lift runs; a ceramic crown with an open glass cup on top,
// where tapped-in marbles drop.
function liftPiece(inst, g, skin) {
  const t = skin.theme;
  for (const name of ['intake', 'outlet']) {
    const lane = inst.laneByName[name];
    skin.trough(lane, g, t.trough);
    rims(skin, lane, g, t.trough, t.trim);
  }
  const ride = inst.laneByName.ride;
  const box = new THREE.Box3().setFromArray(ride.pos);
  const c = box.getCenter(new THREE.Vector3());
  const yLo = 0.046;
  const yHi = box.max.y - 0.03;
  const rCol = 0.0205;
  // foot: a rounded ceramic block the intake runs into
  const foot = skin.mesh(roundedBox(0.05, yLo, 0.05, 0.008, 3), t.ceramic, g);
  foot.position.set(c.x, yLo / 2, c.z);
  // the glowing column
  const col = skin.mesh(new THREE.CylinderGeometry(rCol, rCol, yHi - yLo, 48, 1, true), t.towerGlass, g);
  col.position.set(c.x, (yLo + yHi) / 2, c.z);
  // gold rings up the column
  const rings = [];
  const nr = Math.max(2, Math.round((yHi - yLo) / 0.085));
  for (let k = 0; k <= nr; k++) {
    const r = new THREE.TorusGeometry(rCol + 0.0012, k === 0 || k === nr ? 0.0024 : 0.0016, 8, 40);
    r.rotateX(Math.PI / 2);
    r.translate(c.x, yLo + ((yHi - yLo) * k) / nr, c.z);
    rings.push(r.toNonIndexed());
  }
  skin.mesh(mergeGeometries(rings), t.trim, g);
  // the light rail: a thin helix just inside the wall, clear of the
  // marbles' path (7 mm off the axis, 9.5 mm marbles)
  const screw = new THREE.Group();
  screw.position.set(c.x, yLo, c.z);
  screw.userData.dynamic = true;
  const h = yHi - yLo;
  const turns = Math.round(h / 0.06);
  const pts = [];
  for (let i = 0; i <= turns * 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.0178, (i / (turns * 24)) * h, Math.sin(a) * 0.0178));
  }
  skin.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 28, 0.0009, 5, false), t.railGlow, screw);
  g.add(screw);
  // crown: a ceramic drum, a gold lip and an open glass cup on top
  const drum = skin.mesh(lathe([[0, 0], [0.024, 0], [0.027, 0.004], [0.028, 0.03], [0.026, 0.036], [0.018, 0.04], [0.0, 0.04]], 40), t.ceramic, g);
  drum.position.set(c.x, yHi, c.z);
  const lip = skin.mesh(new THREE.TorusGeometry(0.0275, 0.0019, 8, 40), t.trim, g);
  lip.rotation.x = Math.PI / 2;
  lip.position.set(c.x, yHi + 0.004, c.z);
  const cup = skin.mesh(lathe([[0.012, 0], [0.016, 0.006], [0.024, 0.02], [0.03, 0.03], [0.0315, 0.0325], [0.03, 0.033], [0.0285, 0.031], [0.0225, 0.021], [0.0145, 0.007], [0.0105, 0.001]], 48), t.cupGlass, g);
  cup.position.set(c.x, yHi + 0.038, c.z);
  // the skin turns the rail while marbles ride, slowly when idle
  skin.movers.push({ type: 'lift', screw, mech: inst.mech.lift, inst });
}

// Supports: a slim polished gold column with collars at both ends,
// standing on a ceramic foot, with a white ceramic saddle under the track
// (the picture's gold posts and white glaze). All opaque, so the skin
// merges every support into a draw call or two.
function pillarPost(p, parent, skin) {
  const h = p.y1 - p.y0;
  if (h < 0.004) return;
  const t = skin.theme;
  const sh = shared();
  const post = skin.mesh(sh.post, t.trim, parent);
  post.position.set(p.x, p.y0, p.z);
  post.scale.y = Math.max(0.001, h - 0.006);
  if (h > 0.012) {
    const saddle = skin.mesh(sh.saddle, t.ceramic, parent);
    saddle.position.set(p.x, p.y1 - 0.0035, p.z);
    const top = skin.mesh(sh.collar, t.trim, parent);
    top.position.set(p.x, p.y1 - 0.009, p.z);
  }
  if (p.y0 < 0.002 && h > 0.02) {
    const foot = skin.mesh(sh.foot, t.ceramic, parent);
    foot.position.set(p.x, p.y0 + 0.003, p.z);
  }
  if (h > 0.02) {
    const collar = skin.mesh(sh.collar, t.trim, parent);
    collar.position.set(p.x, p.y0 + (p.y0 < 0.002 ? 0.008 : 0.002), p.z);
  }
}

// Materials and styles for this level's pieces.
export function theme(mats) {
  const cyan = mats.glowGlass({ color: '#46e0ff', glow: 1 });
  const violet = mats.glowGlass({ color: '#8f86ff', glow: 1.1 });
  const blue = mats.glowGlass({ color: '#3f8bff', glow: 1.3 });
  const clear = mats.acrylic({ tint: '#eef9ff' });
  const bellGlass = mats.glowGlass({ color: '#ffd49a', glow: 0.9 });
  const gold = mats.gold({ polish: 0.9 });
  const ceramic = mats.ceramic({ color: '#f7f5f0' });
  // warm lamps and glowing rings: plain HDR colour, so bloom picks them up
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.64, 0.3).multiplyScalar(4.5) });
  const halo = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.4).multiplyScalar(1.6), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  const ringGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.9, 1.0).multiplyScalar(2.2) });
  const pieces = {};
  for (const id of ['straight', 'long', 'long3', 'steep', 'tube2', 'tube3', 'curveL', 'curveR', 'bendL', 'bendR', 'uturnL', 'uturnR', 'funnel', 'bigFunnel', 'wheel', 'splitter', 'catcher', 'goal', 'start', 'drop', 'tallDrop']) pieces[id] = trimmed;
  pieces.bell = bellPiece;
  pieces.spinner = spinnerPiece;
  pieces.lift = liftPiece;
  return {
    trough: { mat: cyan, top: 0.004, width: 0.04 },
    loop: { kind: 'shell', mat: cyan, top: 0.009, thickness: 0.003 },
    tube: { mat: violet, thickness: 0.0016 },
    enclosed: { mat: clear },
    funnel: { mat: cyan, stemMat: violet, rings: ringGlow, lip: 0.005 },
    bell: { mat: bellGlass, bead: gold, clapper: lamp, frame: null, size: 0.0175 },
    wheel: { segmentMats: [cyan, violet], paddle: gold, hub: gold, cover: clear, mat: cyan },
    spinner: { mat: gold, tip: gold, post: gold, blades: 12 },
    splitter: { mat: gold },
    cup: { mat: cyan, neck: clear },
    lift: { tube: clear, screw: cyan, cap: gold },
    goal: { flag: violet, pole: gold },
    block: () => ceramic,
    pillar: pillarPost,
    pieces,
    // extras the custom builders above use
    trim: gold,
    ceramic,
    towerGlass: mats.glowGlass({ color: '#a08cff', glow: 0.6 }),
    railGlow: cyan,
    cupGlass: cyan,
    starGlass: blue,
    halo,
  };
}

export const cameraDefault = { target: new THREE.Vector3(-0.08, 0.245, 0.06), distance: 1.18, azimuth: THREE.MathUtils.degToRad(-4), elevation: THREE.MathUtils.degToRad(16), fov: 34 };

export async function setting(ctx) {
  const mod = await import('./crystal-setting.js');
  return mod.createCrystalSetting(ctx);
}
