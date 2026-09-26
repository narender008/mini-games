// Storybook Kingdom: a marble run growing out of an open storybook on a
// library table at dusk. Honey-lacquered wooden tracks on slim trestles, a
// little stone castle on the clouds at the back left whose waterfall carries
// the marbles back up (the lift, seen through its clear tube with the water
// tumbling behind it), a clear tube along the top, a sunflower funnel, a
// pinwheel, a friendly red dragon curled round the loop-the-loop, and three
// bell towers with blue slate roofs along the front.
import * as THREE from 'three';
import { CELL, LEVEL, PORT_SLOPE, R_MARBLE, REDUCED_MOTION } from '../config.js';
import { roundedBox, lathe } from '../geometry.js';
import { rotXZ } from '../track/layout.js';
import { portY } from '../track/pieces.js';

export const id = 'storybook';

// cell (0, 0) of the build grid, on the book's page
export const grid = {
  origin: new THREE.Vector3(0.05, 0, -0.01),
  min: [-12, -3],
  max: [7, 4],
};

// the pages of the open book are the ground
export const ground = { y: 0, surface: 'wood', bounds: { minX: -0.6, maxX: 0.56, minZ: -0.27, maxZ: 0.29 } };

export const palette = 'storybook';

// The ready-made run. Levels are 1 cm steps; see track/pieces.js.
export const layout = [
  // the castle's waterfall lift at the back left: marbles ride up through a
  // clear tube with the water tumbling behind it
  { type: 'lift', i: -7, j: -3, level: 0, rot: 2, h: 44, out: 'W' },
  // along the top, through a clear tube
  { type: 'long', i: -6, j: -3, level: 43 },
  { type: 'tube2', i: -4, j: -3, level: 42 },
  { type: 'straight', i: -2, j: -3, level: 41 },
  { type: 'curveR', i: -1, j: -3, level: 40 },
  // a straight run in, so marbles meet the sunflower's rim calmly
  { type: 'straight', i: -1, j: -2, level: 39, rot: 1 },
  { type: 'funnel', i: 0, j: -1, level: 30, rot: 1 },
  // a flipper under the flower: to the pinwheel and the dragon, or off to
  // the treehouse tray
  { type: 'splitter', i: 0, j: 1, level: 29, rot: 1 },
  { type: 'spinner', i: 1, j: 1, level: 28 },
  { type: 'loop', i: 2, j: 1, level: 15 },
  { type: 'uturnR', i: 5, j: 2, level: 13 },
  // back along the front, under the three bell towers
  { type: 'long', i: 4, j: 3, level: 12, rot: 2 },
  { type: 'long', i: 2, j: 3, level: 11, rot: 2 },
  { type: 'bell', i: 0, j: 3, level: 10, rot: 2 },
  { type: 'bell', i: -1, j: 3, level: 9, rot: 2 },
  { type: 'bell', i: -2, j: 3, level: 8, rot: 2 },
  { type: 'long', i: -3, j: 3, level: 7, rot: 2 },
  { type: 'straight', i: -5, j: 3, level: 6, rot: 2 },
  // and back up the left side to the foot of the waterfall
  { type: 'curveR', i: -6, j: 3, level: 5, rot: 2 },
  { type: 'long', i: -6, j: 2, level: 4, rot: 3 },
  { type: 'long', i: -6, j: 0, level: 3, rot: 3 },
  { type: 'straight', i: -6, j: -2, level: 2, rot: 3 },
  { type: 'curveL', i: -6, j: -3, level: 1, rot: 3 },
  // the other way from the flipper: a high walk to a tray
  { type: 'long', i: -1, j: 1, level: 28, rot: 2 },
  { type: 'long', i: -3, j: 1, level: 27, rot: 2 },
  { type: 'catcher', i: -5, j: 1, level: 26, rot: 2 },
];

// What Big kid builders get to place on this level.
export const kit = ['straight', 'long', 'steep', 'curveL', 'curveR', 'bendL', 'bendR', 'uturnL', 'uturnR', 'drop', 'tube2', 'funnel', 'loop', 'spinner', 'bell', 'splitter', 'catcher', 'goal', 'start', 'lift'];

// ------------------------------------------------------------ helpers

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// world position of a point in a placed piece's own frame
function toWorld(inst, x, y, z) {
  const p = inst.placement;
  const o = inst.layoutOrigin;
  const [rx, rz] = rotXZ(x, z, p.rot);
  return V(o.x + p.i * CELL + rx, o.y + p.level * LEVEL + y, o.z + p.j * CELL + rz);
}

// the piece's local direction in the world
function dirWorld(inst, x, y, z) {
  const [rx, rz] = rotXZ(x, z, inst.placement.rot);
  return V(rx, y, rz);
}

// Places a geometry (scale, rotation, translation) for merging.
function put(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], q = null } = {}) {
  const m = new THREE.Matrix4();
  const quat = q || new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2]));
  m.compose(new THREE.Vector3(...p), quat, new THREE.Vector3(...s));
  geo.applyMatrix4(m);
  return geo;
}

// Joins placed geometries into one (position, normal, uv), so a many-part
// prop costs one draw call per material.
function merge(list) {
  let nv = 0;
  let ni = 0;
  const parts = list.map((g) => {
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const idx = g.index ? g.index.array : Uint32Array.from({ length: g.attributes.position.count }, (_, i) => i);
    nv += g.attributes.position.count;
    ni += idx.length;
    return { g, idx };
  });
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const index = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  for (const { g, idx } of parts) {
    pos.set(g.attributes.position.array, ov * 3);
    nor.set(g.attributes.normal.array, ov * 3);
    uv.set(g.attributes.uv.array, ov * 2);
    for (let k = 0; k < idx.length; k++) index[oi + k] = idx[k] + ov;
    ov += g.attributes.position.count;
    oi += idx.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

// A soft rounded tube along points, radius per point (for the dragon).
function softTube(pts, radii, radial = 16) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const n = Math.max(24, pts.length * 4);
  const frames = curve.computeFrenetFrames(n, false);
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const rAt = (t) => {
    const x = t * (radii.length - 1);
    const i = Math.min(radii.length - 2, Math.floor(x));
    const k = x - i;
    return radii[i] * (1 - k) + radii[i + 1] * k;
  };
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = rAt(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const d = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos.push(c.x + d.x * r, c.y + d.y * r, c.z + d.z * r);
      nor.push(d.x, d.y, d.z);
      uv.push(t, j / radial);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const ball = (r, p, s = [1, 1, 1], seg = 20) => put(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), { p, s });

// ------------------------------------------------------------ water

// A falling sheet of water: bright streaks slide down, broken into gentle
// ribbons, whiter where it spills over the lip and churns at the foot.
// Alpha blended over whatever is behind it (the clear lift tube stays in
// front, so riding marbles show against the water).
function waterMaterial({ flow = 1, pool = false } = {}) {
  const u = { uTime: { value: 0 } };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      float h1(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
      float n1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
      float n2(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float a = h1(i.x + i.y * 57.0); float b = h1(i.x + 1.0 + i.y * 57.0);
        float c = h1(i.x + (i.y + 1.0) * 57.0); float d = h1(i.x + 1.0 + (i.y + 1.0) * 57.0);
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      void main() {
        float t = uTime * ${flow.toFixed(3)};
        ${pool
          ? `
        // a round pool: ripples spreading from where the water lands
        vec2 q = vUv - 0.5;
        float r = length(q) * 2.0;
        float rip = 0.5 + 0.5 * sin(r * 38.0 - t * 5.0 + n2(q * 9.0) * 3.0);
        float foam = smoothstep(0.45, 0.0, length(q - vec2(0.0, -0.28))) * (0.55 + 0.45 * n2(q * 30.0 + t));
        vec3 deep = vec3(0.05, 0.22, 0.42);
        vec3 c = mix(deep, vec3(0.35, 0.7, 0.95), rip * 0.35) + foam * vec3(0.9, 0.95, 1.0);
        float fr = pow(1.0 - abs(dot(normalize(vN), vV)), 3.0);
        c += fr * vec3(0.55, 0.5, 0.65);
        float a = (0.72 + 0.2 * foam) * smoothstep(1.0, 0.94, r);
        gl_FragColor = vec4(c * a, a);`
          : `
        // u across the sheet, v down it (0 at the lip)
        float x = vUv.x;
        float v = vUv.y;
        float ribbons = n1(x * 9.0 + 3.0) * 0.6 + n1(x * 23.0) * 0.4;
        float streak = n2(vec2(x * 38.0, v * 6.0 - t * 3.2));
        streak = streak * 0.6 + n2(vec2(x * 90.0, v * 14.0 - t * 5.0)) * 0.4;
        float edge = smoothstep(0.0, 0.12, x) * smoothstep(1.0, 0.88, x);
        float lip = smoothstep(0.12, 0.0, v);
        float foot = smoothstep(0.8, 1.0, v);
        float white = clamp(pow(streak, 2.2) * 1.4 + lip * 0.8 + foot * 0.7 * n2(vec2(x * 30.0, v * 20.0 - t * 4.0)), 0.0, 1.0);
        vec3 c = mix(vec3(0.12, 0.42, 0.78), vec3(0.62, 0.86, 1.0), ribbons * 0.6);
        c = mix(c, vec3(1.0, 1.0, 1.02), white);
        float fr = pow(1.0 - abs(dot(normalize(vN), vV)), 2.0);
        c += fr * vec3(0.3, 0.35, 0.45);
        float a = edge * (0.42 + 0.25 * ribbons + 0.33 * white);
        c *= 1.6;
        gl_FragColor = vec4(c * a, a);`}
      }`,
  });
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.userData.tick = (time) => {
    u.uTime.value = REDUCED_MOTION.matches ? 0 : time;
  };
  return m;
}

// Water meshes update their clock just before they draw, so they must stay
// separate meshes (the skin bakes static parts together unless marked).
function animated(mesh, mat) {
  mesh.onBeforeRender = () => mat.userData.tick(performance.now() / 1000);
  mesh.userData.dynamic = true;
  mesh.userData.noShadow = true;
  mesh.castShadow = false;
  mesh.renderOrder = 1;
  return mesh;
}

// ------------------------------------------------------------ the theme

// Materials and styles for this level's pieces.
export function theme(mats) {
  const maple = mats.wood({ species: 'maple', mapping: 'uv', finish: 'lacquer' });
  const oakPost = mats.wood({ species: 'oak', mapping: 'object', finish: 'lacquer', grain: 'y' });
  const walnut = mats.wood({ species: 'walnut', mapping: 'object', finish: 'lacquer' });
  const stone = mats.stone({ kind: 'castle' });
  const slate = mats.slate({ color: '#5a8cf2' });
  const acrylic = mats.acrylic({ tint: '#f4fbff' });
  const brass = mats.brass({ polish: 0.85, age: 0.2 });
  const gold = mats.gold({ polish: 0.9 });
  // the bells glow softly gold, as if a candle burned in each tower
  const bellGold = new THREE.MeshPhysicalMaterial({ color: '#ffd36a', metalness: 1, roughness: 0.24, emissive: '#ffae45', emissiveIntensity: 0.13 });
  const ivory = mats.paint({ color: '#efe4cc', wear: 0.2, gloss: 0.7 });
  const dragonRed = mats.paint({ color: '#c8322a', wear: 0.05, gloss: 0.95 });
  const belly = mats.paint({ color: '#f3cf7a', wear: 0.05, gloss: 0.9 });
  const cheek = mats.paint({ color: '#f08a8a', wear: 0, gloss: 0.6 });
  const eyeBlack = mats.plastic({ color: '#16110e', gloss: 1 });
  const eyeWhite = mats.plastic({ color: '#fbf8f2', gloss: 1 });
  const petal = mats.paint({ color: '#ffd83a', wear: 0.05, gloss: 0.75 });
  const petalDeep = mats.paint({ color: '#fbbd24', wear: 0.05, gloss: 0.75 });
  const seedHead = mats.paint({ color: '#7a4a1c', wear: 0.3, gloss: 0.4 });
  const leaf = mats.paint({ color: '#3f8a2e', wear: 0.1, gloss: 0.6 });
  const cloud = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.95, sheen: 1, sheenColor: '#ffffff', sheenRoughness: 0.4, emissive: '#fff1de', emissiveIntensity: 0.16 });
  const pinColours = ['#23a8c9', '#57b847', '#f2c230', '#9b52d6', '#e8503a', '#2f6fe0'].map((color) => mats.paint({ color, wear: 0.05, gloss: 0.9 }));
  const flag = mats.paint({ color: '#e0473a', wear: 0.1, gloss: 0.5 });
  const rock = mats.stone({ kind: 'cobble' });
  const castleWhite = mats.paint({ color: '#f4efe4', wear: 0.12, gloss: 0.45 });
  const windowGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.5, 0.55) });
  const dragonMats = { red: dragonRed, belly, cheek, eyeBlack, eyeWhite, gold, spike: mats.paint({ color: '#f2b233', wear: 0.05, gloss: 0.9 }) };
  const water = waterMaterial({ flow: 1 });
  const poolWater = waterMaterial({ flow: 1, pool: true });

  return {
    trough: { mat: maple, top: 0.004, width: 0.042 },
    tinted: () => ({ mat: maple, top: 0.004, width: 0.042 }),
    loop: { kind: 'shell', mat: dragonRed, top: 0.009, thickness: 0.003 },
    tube: { mat: acrylic, thickness: 0.0016 },
    enclosed: { mat: acrylic },
    funnel: { mat: mats.paint({ color: '#d9861c', wear: 0.1, gloss: 0.8 }), stemMat: leaf, lip: 0.004 },
    bell: { mat: bellGold, bead: walnut, clapper: brass, frame: null, size: 0.015 },
    spinner: { mat: brass, tip: pinColours[0] },
    splitter: { mat: brass },
    cup: { mat: dragonRed, neck: acrylic },
    lift: { tube: acrylic, screw: mats.plastic({ color: '#e9f3fb' }), cap: brass },
    goal: { flag, pole: maple },
    block: () => oakPost,
    pieces: {
      lift(inst, g, skin) {
        skin.piece(inst, g);
        // a short lift (in the free build) is just the clear screw tower
        if ((inst.placement.h ?? 30) < 24) return;
        castleWaterfall(inst, g, skin, { stone, castle: castleWhite, slate, gold, flag, cloud, water, poolWater, rock, moss: leaf, glow: windowGlow });
      },
      loop(inst, g, skin) {
        skin.piece(inst, g);
        dragon(inst, g, skin, dragonMats);
      },
      bigLoop(inst, g, skin) {
        skin.piece(inst, g);
        dragon(inst, g, skin, dragonMats);
      },
      bell(inst, g, skin) {
        skin.piece(inst, g);
        bellTower(inst, g, skin, { ivory, slate, gold, stone });
      },
      funnel(inst, g, skin) {
        skin.piece(inst, g);
        sunflower(inst, g, skin, { petal, petalDeep, seedHead, leaf });
      },
      bigFunnel(inst, g, skin) {
        skin.piece(inst, g);
        sunflower(inst, g, skin, { petal, petalDeep, seedHead, leaf });
      },
      spinner(inst, g, skin) {
        for (const lane of inst.lanes) skin.trough(lane, g, skin.theme.trough);
        pinwheel(inst, g, skin, { colours: pinColours, gold, brass });
      },
    },
    pillar(p, group, skin) {
      trestle(p, group, skin, { post: oakPost, stone, cap: walnut });
    },
  };
}

// ------------------------------------------------------------ supports

// Slim lacquered oak posts on castle-stone footings; the bell towers stand
// on stone plinths.
function trestle(p, parent, skin, m) {
  const h = p.y1 - p.y0;
  if (h < 0.004) return;
  if (p.inst?.def.bell || h < 0.03) {
    const b = skin.mesh(roundedBox(0.04, h, 0.04, Math.min(0.003, h / 3), 1), m.stone, parent);
    b.position.set(p.x, p.y0 + h / 2, p.z);
    return;
  }
  const foot = Math.min(0.022, h * 0.25);
  const onGround = p.y0 < 0.002;
  if (onGround) {
    const f = skin.mesh(roundedBox(0.03, foot, 0.03, 0.003, 1), m.stone, parent);
    f.position.set(p.x, p.y0 + foot / 2, p.z);
  }
  const y0 = onGround ? p.y0 + foot : p.y0;
  const post = skin.mesh(roundedBox(0.012, p.y1 - y0 - 0.005, 0.012, 0.002, 1), m.post, parent);
  post.position.set(p.x, (y0 + p.y1 - 0.005) / 2, p.z);
  const cap = skin.mesh(roundedBox(0.03, 0.006, 0.03, 0.002, 1), m.cap, parent);
  cap.position.set(p.x, p.y1 - 0.003, p.z);
}

// ------------------------------------------------------------ the castle

// Behind the lift (outside the build grid) a rocky crag rises from a round
// pool; a little white castle with blue slate cones sits on top among
// puffy clouds, and a waterfall pours from under its gate down the front of
// the crag, behind the lift's clear tube, so riding marbles climb against
// the falling water.
function castleWaterfall(inst, g, skin, m) {
  const ride = inst.laneByName.ride;
  const box = new THREE.Box3().setFromArray(ride.pos);
  const c = box.getCenter(new THREE.Vector3());
  const top = box.max.y;
  const kx = c.x - 0.012;
  const kz = c.z - 0.078;
  const crag = top - 0.085; // where the castle stands
  const hash = (x) => {
    const s = Math.sin(x * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };
  // the crag: a lumpy tapering column, cut flat at the front where the
  // water runs
  const FACE = 0.036;
  const cg = new THREE.CylinderGeometry(0.05, 0.085, crag, 44, 20, false);
  {
    const p = cg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const h = (y + crag / 2) / crag;
      const ka = Math.round((a / (Math.PI * 2)) * 44);
      const kh = Math.round(h * 20);
      let k = 1 + (hash(ka * 3.1 + kh * 7.7) - 0.5) * 0.22 + Math.sin(a * 3 + h * 9) * 0.06 + Math.sin(a * 7 - h * 17) * 0.03;
      // front face (towards +z) flatter and set back for the waterfall
      if (h > 0.97) k *= 0.96;
      // the front is a flat cliff face for the water to run down
      let nz = z * k;
      if (nz > FACE) nz = FACE - hash(ka * 1.7 + kh * 3.3) * 0.002;
      p.setXYZ(i, x * k, y, nz);
    }
    cg.computeVertexNormals();
    cg.translate(kx, crag / 2, kz);
  }
  skin.mesh(cg, m.rock, g);
  const frontZ = kz + FACE;

  // the castle on top: a keep, a gatehouse front, two turrets, a curtain wall
  const stoneParts = [];
  const keepR = 0.03;
  const keepH = 0.1;
  const kz2 = kz - 0.01;
  stoneParts.push(put(new THREE.CylinderGeometry(keepR, keepR * 1.04, keepH, 36), { p: [kx, crag + keepH / 2, kz2] }));
  stoneParts.push(put(new THREE.CylinderGeometry(keepR + 0.003, keepR + 0.003, 0.006, 36), { p: [kx, crag + keepH - 0.003, kz2] }));
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    stoneParts.push(put(roundedBox(0.009, 0.008, 0.005, 0.0012, 1), { p: [kx + Math.cos(a) * (keepR + 0.001), crag + keepH + 0.004, kz2 + Math.sin(a) * (keepR + 0.001)], r: [0, -a + Math.PI / 2, 0] }));
  }
  const turrets = [
    { x: kx - 0.05, z: kz - 0.002, r: 0.016, h: 0.078 },
    { x: kx + 0.05, z: kz - 0.012, r: 0.015, h: 0.07 },
    { x: kx - 0.018, z: kz - 0.048, r: 0.014, h: 0.095 },
    { x: kx + 0.03, z: kz - 0.045, r: 0.012, h: 0.06 },
  ];
  for (const t of turrets) {
    stoneParts.push(put(new THREE.CylinderGeometry(t.r, t.r * 1.05, t.h, 24), { p: [t.x, crag - 0.004 + t.h / 2, t.z] }));
    stoneParts.push(put(new THREE.CylinderGeometry(t.r + 0.0025, t.r + 0.0025, 0.005, 24), { p: [t.x, crag - 0.004 + t.h - 0.0025, t.z] }));
  }
  // curtain wall round the back with merlons
  for (const [x0, z0, x1, z1] of [
    [turrets[0].x, turrets[0].z, turrets[2].x, turrets[2].z],
    [turrets[2].x, turrets[2].z, turrets[1].x, turrets[1].z],
  ]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    stoneParts.push(put(new THREE.BoxGeometry(len, 0.036, 0.008), { p: [(x0 + x1) / 2, crag + 0.014, (z0 + z1) / 2], r: [0, -ang, 0] }));
    for (let k = 0; k < 4; k++) {
      const t = (k + 0.5) / 4;
      stoneParts.push(put(new THREE.BoxGeometry(0.006, 0.007, 0.008), { p: [x0 + (x1 - x0) * t, crag + 0.035, z0 + (z1 - z0) * t], r: [0, -ang, 0] }));
    }
  }
  // the spout under the keep, and the pool's kerb at the foot
  const spoutY = crag - 0.004;
  stoneParts.push(put(roundedBox(0.03, 0.007, 0.022, 0.002, 1), { p: [c.x, spoutY, frontZ + 0.002] }));
  const poolR = 0.03;
  const poolZ = c.z - 0.047;
  const kerb = put(lathe([[poolR - 0.001, 0], [poolR + 0.0045, 0], [poolR + 0.0045, 0.01], [poolR + 0.0022, 0.012], [poolR, 0.01], [poolR, 0.004]], 40), { p: [c.x, 0, poolZ] });
  skin.mesh(kerb, m.stone, g);
  skin.mesh(merge(stoneParts), m.castle, g);

  // slate cones
  const roofs = [];
  roofs.push(put(lathe([[0.0005, 0.07], [keepR * 0.5, 0.036], [keepR * 0.95, 0.01], [keepR + 0.008, 0], [keepR + 0.006, -0.003], [0.0005, -0.003]], 36), { p: [kx, crag + keepH + 0.008, kz2] }));
  for (const t of turrets) roofs.push(put(lathe([[0.0005, 0.045], [t.r * 0.5, 0.022], [t.r + 0.005, 0], [t.r + 0.003, -0.003], [0.0005, -0.003]], 24), { p: [t.x, crag - 0.004 + t.h, t.z] }));
  skin.mesh(merge(roofs), m.slate, g);

  // gold finials and a red pennant on the keep
  const fin = [];
  const peak = crag + keepH + 0.008 + 0.07;
  fin.push(put(new THREE.CylinderGeometry(0.0009, 0.0009, 0.03, 8), { p: [kx, peak + 0.012, kz2] }));
  fin.push(ball(0.0026, [kx, peak, kz2]));
  for (const t of turrets) fin.push(ball(0.002, [t.x, crag - 0.004 + t.h + 0.046, t.z]));
  skin.mesh(merge(fin), m.gold, g);
  const pennant = new THREE.BufferGeometry();
  const py = peak + 0.022;
  pennant.setAttribute('position', new THREE.Float32BufferAttribute([kx, py + 0.006, kz2, kx + 0.024, py, kz2, kx, py - 0.006, kz2], 3));
  pennant.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  pennant.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 0.5, 0, 0], 2));
  const pm = skin.mesh(pennant, m.flag, g);
  pm.material.side = THREE.DoubleSide;

  // warm lit windows
  const wins = [];
  const wy = crag + keepH * 0.55;
  for (const a of [-0.9, -0.3, 0.35, 0.95]) {
    wins.push(put(roundedBox(0.005, 0.01, 0.002, 0.0008, 1), { p: [kx + Math.sin(a) * (keepR + 0.0006), wy + (a > 0 ? 0.018 : 0), kz2 + Math.cos(a) * (keepR + 0.0006)], r: [0, a, 0] }));
  }
  for (const t of turrets) {
    const a = Math.atan2(t.x - kx, 0.05);
    wins.push(put(roundedBox(0.004, 0.008, 0.002, 0.0007, 1), { p: [t.x + Math.sin(a) * (t.r + 0.0006), crag + t.h * 0.6, t.z + Math.cos(a) * (t.r + 0.0006)], r: [0, a, 0] }));
  }
  const wm = skin.mesh(merge(wins), m.glow, g);
  wm.userData.noShadow = true;

  // clouds round the castle's feet, kept off the front of the lift
  const puffs = [];
  const rand = (() => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  for (let k = 0; k < 16; k++) {
    const a = Math.PI * (0.95 + rand() * 1.1) + (k % 2 ? 0.0 : Math.PI * 0.05);
    const rr = 0.062 + rand() * 0.03;
    const x = kx + Math.cos(a) * rr;
    const z = kz + Math.sin(a) * rr * 0.8;
    const r = 0.016 + rand() * 0.012;
    const y = crag - 0.012 + rand() * 0.012;
    for (let j = 0; j < 4; j++) puffs.push(ball(r * (1 - j * 0.15), [x + (rand() - 0.5) * r * 1.6, y + (rand() - 0.3) * r * 0.8, z + (rand() - 0.5) * r * 1.2], [1.15, 0.9, 1.05], 11));
  }
  // and a few on the front corners, left and right of the tube
  for (const [dx, dz, r] of [[-0.066, 0.03, 0.02], [-0.05, 0.05, 0.014], [0.062, 0.028, 0.019], [0.046, 0.047, 0.013], [-0.085, 0.0, 0.018], [0.085, -0.005, 0.017]]) {
    for (let j = 0; j < 4; j++) puffs.push(ball(r * (1 - j * 0.18), [kx + dx + (rand() - 0.5) * r * 1.8, crag - 0.01 + (rand() - 0.3) * r * 0.8, kz + dz + (rand() - 0.5) * r], [1.15, 0.9, 1.05], 11));
  }
  skin.mesh(merge(puffs), m.cloud, g);

  // the waterfall, from the spout down the crag's front into the pool
  const fallH = spoutY - 0.008;
  const wf = new THREE.PlaneGeometry(0.044, fallH, 8, 34);
  const pos = wf.attributes.position;
  const uv = wf.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const v = 1 - uv.getY(i);
    const x = pos.getX(i);
    // it leaves the lip curving out, then follows the crag, spreading a
    // little and fanning out at the foot into the pool
    const out = 0.006 * Math.sqrt(v) + 0.004 * v * v;
    pos.setX(i, x * (0.85 + 0.6 * v));
    pos.setZ(i, out - Math.pow(Math.abs(x) / 0.022, 2) * 0.005);
    uv.setY(i, v);
  }
  wf.computeVertexNormals();
  const wmesh = skin.mesh(wf, m.water, g);
  wmesh.position.set(c.x, 0.008 + fallH / 2, frontZ + 0.004);
  animated(wmesh, m.water);
  const pool = skin.mesh(new THREE.CircleGeometry(poolR + 0.0005, 40), m.poolWater, g);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(c.x, 0.008, poolZ);
  animated(pool, m.poolWater);
  // moss and little bushes on the crag's ledges
  const moss = [];
  for (let k = 0; k < 18; k++) {
    const h = 0.05 + rand() * (crag - 0.08);
    const a = Math.PI * (0.1 + rand() * 0.8) + (rand() < 0.5 ? Math.PI * 0.9 : 0);
    const r = 0.085 - (0.035 * h) / crag;
    if (Math.sin(a) > 0.55) continue;
    moss.push(ball(0.006 + rand() * 0.005, [kx + Math.cos(a) * r, h, kz + Math.sin(a) * r], [1.3, 0.6, 1.3], 12));
  }
  skin.mesh(merge(moss), m.moss, g);
}

// ------------------------------------------------------------ the dragon

// A cuddly toy dragon curled round the loop: a plump red body hugging the
// outside of the track from its tail (low on the far side) round over the
// top to its head, which rests at the near side of the loop, smiling out at
// the room with big glossy eyes, rosy cheeks and little golden horns.
function dragon(inst, g, skin, m) {
  const lane = inst.laneByName.main;
  const L = lane.spec.loopAt;
  const def = inst.def;
  const len = def.cells.length / 2;
  const xe = (len - 1) * CELL + CELL / 2;
  const yb = portY(0) + PORT_SLOPE * (xe - L.x) * 0.9;
  const r = L.r;
  const zAt = (a) => {
    const t = a / (2 * Math.PI);
    return CELL * t * t * (3 - 2 * t);
  };
  // body centre-line: hugging the outside of the channel, from the head
  // at the upper right, over the top and down the far side to the tail
  const BR = 0.0115;
  const off = r + 0.0155 + 0.003 + BR * 0.8;
  const bodyPts = [];
  const radii = [];
  const a0 = Math.PI * 0.6;
  const a1 = 2 * Math.PI - 0.42;
  const N = 30;
  const rOf = (t) => BR * (1 - 0.7 * Math.pow(t, 1.5)) + 0.0006;
  for (let k = 0; k <= N; k++) {
    const a = a0 + ((a1 - a0) * k) / N;
    const x = L.x + off * Math.sin(a);
    const y = yb + r - off * Math.cos(a);
    bodyPts.push(toWorld(inst, x, y, zAt(a)));
    radii.push(rOf(k / N));
  }
  // the tail curls out and up at the end
  const tailEnd = bodyPts[bodyPts.length - 1];
  const tailDir = tailEnd.clone().sub(bodyPts[bodyPts.length - 2]).normalize();
  bodyPts.push(tailEnd.clone().addScaledVector(tailDir, 0.008).add(V(-0.004, 0.002, 0)));
  radii.push(0.0024);
  skin.mesh(softTube(bodyPts, radii, 20), m.red, g);
  // a golden belly stripe on the camera side
  const fw = dirWorld(inst, 0, 0, 1);
  const bellyPts = bodyPts.slice(0, -1).map((p, k) => p.clone().addScaledVector(fw, radii[k] * 0.5));
  skin.mesh(softTube(bellyPts, radii.slice(0, -1).map((x) => x * 0.56), 14), m.belly, g);

  // soft golden bumps along the back (outer side)
  const spikes = [];
  for (let k = 2; k < N - 1; k += 2) {
    const a = a0 + ((a1 - a0) * k) / N;
    const t = k / N;
    const rr = rOf(t);
    const out = off + rr * 0.8;
    const p = toWorld(inst, L.x + out * Math.sin(a), yb + r - out * Math.cos(a), zAt(a));
    const dir = dirWorld(inst, Math.sin(a), -Math.cos(a), 0).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
    const sh = 0.011 * (1 - t * 0.5);
    // round plush bumps rather than points, so it stays a cuddly toy
    const bump = new THREE.SphereGeometry(1, 14, 10).scale(0.0046 * (1 - t * 0.5), sh * 0.5, 0.0046 * (1 - t * 0.5));
    spikes.push(put(bump, { p: p.clone().addScaledVector(dir, sh * 0.22).toArray(), q }));
  }
  skin.mesh(merge(spikes), m.spike, g);

  // the head, at the start of the body (near the bottom of the near side)
  const aH = a0 - 0.08;
  const neck = toWorld(inst, L.x + off * Math.sin(aH), yb + r - off * Math.cos(aH), zAt(aH));
  const side = dirWorld(inst, 1, 0, 0).normalize(); // the way it looks: out past the loop
  const front = dirWorld(inst, 0, 0, 1).normalize(); // towards the camera
  const head = new THREE.Group();
  head.position.copy(neck).addScaledVector(side, 0.017).add(V(0, 0.008, 0)).addScaledVector(front, 0.008);
  head.scale.setScalar(1.6);
  // face out past the loop and a little towards the camera, chin down
  const look = side.clone().multiplyScalar(0.5).addScaledVector(front, 0.86).add(V(0, -0.1, 0)).normalize();
  head.quaternion.setFromUnitVectors(V(1, 0, 0), look);
  g.add(head);
  const red = [];
  red.push(ball(0.0125, [0, 0.002, 0], [1.05, 0.95, 1.0], 28)); // cranium
  red.push(ball(0.0095, [0.012, -0.002, 0], [1.1, 0.78, 0.95], 24)); // snout
  red.push(ball(0.0034, [-0.004, 0.012, 0.0085], [1.2, 0.6, 0.8], 12)); // brows / ears
  red.push(ball(0.0034, [-0.004, 0.012, -0.0085], [1.2, 0.6, 0.8], 12));
  skin.mesh(merge(red), m.red, head);
  const bel = [];
  bel.push(ball(0.0072, [0.0125, -0.0055, 0], [1.15, 0.5, 0.9], 20)); // chin
  skin.mesh(merge(bel), m.belly, head);
  // eyes: big and friendly, glossy black with two catch-lights
  const whites = [];
  const blacks = [];
  const glints = [];
  for (const s of [-1, 1]) {
    const ep = [0.004, 0.006, s * 0.0078];
    whites.push(ball(0.0052, ep, [0.8, 1.05, 0.9], 20));
    blacks.push(ball(0.0038, [ep[0] + 0.0022, ep[1] - 0.0003, ep[2] + s * 0.0006], [0.7, 1.05, 0.85], 18));
    glints.push(ball(0.0011, [ep[0] + 0.0046, ep[1] + 0.0016, ep[2] + s * 0.0004], [1, 1, 1], 10));
    glints.push(ball(0.0005, [ep[0] + 0.0048, ep[1] - 0.0012, ep[2] - s * 0.0008], [1, 1, 1], 8));
  }
  skin.mesh(merge(whites.concat(glints)), m.eyeWhite, head);
  skin.mesh(merge(blacks), m.eyeBlack, head);
  // rosy cheeks
  const ch = [];
  for (const s of [-1, 1]) ch.push(ball(0.0026, [0.009, -0.0005, s * 0.0085], [1, 0.6, 0.45], 12));
  skin.mesh(merge(ch), m.cheek, head);
  // a wide gentle smile and two little nostrils, laid on the snout's
  // surface (an ellipsoid round (0.012, -0.002, 0))
  const snoutX = (y, z) => 0.012 + 0.01045 * Math.sqrt(Math.max(0, 1 - ((y + 0.002) / 0.00741) ** 2 - (z / 0.009) ** 2));
  const smilePts = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16 - 0.5;
    const z = t * 0.012;
    const y = -0.0046 + 0.0022 * (2 * t) ** 2;
    smilePts.push(V(snoutX(y, z) + 0.0003, y, z));
  }
  const mouth = [];
  mouth.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smilePts), 20, 0.00055, 6, false));
  for (const sz of [-1, 1]) mouth.push(ball(0.0007, [snoutX(0.0012, sz * 0.0028), 0.0012, sz * 0.0028], [1, 1, 1], 8));
  skin.mesh(merge(mouth), m.eyeBlack, head);
  // little golden horns, rounded at the tips
  const horns = [];
  for (const s of [-1, 1]) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(s * -0.35, 0, 0.55));
    horns.push(put(new THREE.ConeGeometry(0.0026, 0.011, 12), { p: [-0.007, 0.0145, s * 0.0055], q }));
    // a round bead just over the tip, so the horn is soft to the eye
    const tip = V(0, 0.0052, 0).applyQuaternion(q).add(V(-0.007, 0.0145, s * 0.0055));
    horns.push(ball(0.0012, tip.toArray()));
  }
  skin.mesh(merge(horns), m.spike, head);

}

// ------------------------------------------------------------ bell towers

// An open ivory pavilion over each bell: four posts with little arches, a
// flared blue slate roof and a gold finial. It stands on a stone plinth
// (the pillar under the bell).
function bellTower(inst, g, skin, m) {
  const lane = inst.laneByName.main;
  const e = lane.events.find((x) => x.type === 'bell');
  const f = lane.frame(e.s, { p: V(0, 0, 0), t: V(0, 0, 0), u: V(0, 0, 0), w: V(0, 0, 0), k: V(0, 0, 0) });
  const c = skin.cellCentre(inst, 0);
  const size = skin.theme.bell.size;
  const pivotY = f.p.y + R_MARBLE + 0.001 + size * 1.45;
  const base = f.p.y - 0.018;
  const topY = pivotY + 0.012;
  const hw = 0.021;
  const posts = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      posts.push(put(roundedBox(0.005, topY - base, 0.005, 0.0012, 1), { p: [c.x + sx * hw, (topY + base) / 2, c.z + sz * hw] }));
    }
  }
  // lintel ring and arches
  for (const [w, d, x, z] of [
    [2 * hw + 0.005, 0.005, 0, hw],
    [2 * hw + 0.005, 0.005, 0, -hw],
    [0.005, 2 * hw + 0.005, hw, 0],
    [0.005, 2 * hw + 0.005, -hw, 0],
  ]) {
    posts.push(put(roundedBox(w, 0.005, d, 0.0012, 1), { p: [c.x + x, topY - 0.0025, c.z + z] }));
  }
  for (const [ry, x, z] of [
    [0, 0, hw],
    [0, 0, -hw],
    [Math.PI / 2, hw, 0],
    [Math.PI / 2, -hw, 0],
  ]) {
    const arch = new THREE.TorusGeometry(hw * 0.9, 0.0018, 6, 18, Math.PI);
    posts.push(put(arch, { p: [c.x + x, topY - 0.016, c.z + z], r: [0, ry, 0], s: [1, 0.55, 1] }));
  }
  // a hanging beam across for the bell
  const beam = roundedBox(0.004, 0.004, 2 * hw, 0.001, 1);
  const [bx] = rotXZ(0, 1, inst.placement.rot);
  posts.push(put(beam, { p: [f.p.x, pivotY + size * 0.55, f.p.z], r: [0, Math.abs(bx) > 0.5 ? Math.PI / 2 : 0, 0] }));
  skin.mesh(merge(posts), m.ivory, g);
  // a flared pyramid roof (four flat sides) with a lip
  let roof = lathe([[0.0005, 0.046], [0.009, 0.034], [0.021, 0.016], [0.033, 0.004], [0.041, -0.001], [0.042, -0.003], [0.034, -0.004], [0.0005, -0.004]], 4);
  roof = roof.toNonIndexed();
  roof.computeVertexNormals();
  put(roof, { r: [0, Math.PI / 4, 0], p: [c.x, topY, c.z] });
  skin.mesh(roof, m.slate, g);
  const fin = [ball(0.003, [c.x, topY + 0.048, c.z]), put(new THREE.CylinderGeometry(0.0008, 0.0008, 0.012, 6), { p: [c.x, topY + 0.053, c.z] })];
  skin.mesh(merge(fin), m.gold, g);
}

// ------------------------------------------------------------ sunflower

// Petals round the funnel's rim (two rings, the back ring deeper gold), a
// ring of seeds just inside and two leaves on the stem. No petals where the
// track comes in over the rim.
function sunflower(inst, g, skin, m) {
  const b = inst.bowl;
  const rimR = b.R + R_MARBLE + 0.002;
  const inLane = inst.laneByName.in;
  const n = inLane.n;
  // angle where the in-lane crosses the rim, to leave that gap
  let gapA = 0;
  for (let k = n - 1; k >= 0; k--) {
    const dx = inLane.pos[k * 3] - b.x;
    const dz = inLane.pos[k * 3 + 2] - b.z;
    if (Math.hypot(dx, dz) > rimR + 0.01) {
      gapA = Math.atan2(dz, dx);
      break;
    }
  }
  // petals: plump lacquered ovals, two rings, rising a little then
  // leaning out; the back ring sits lower and a deeper gold
  const front = [];
  const back = [];
  const rings = [
    { list: back, count: 15, len: 0.05, wid: 0.021, tilt: 0.34, off: 0.5, y: -0.006 },
    { list: front, count: 15, len: 0.044, wid: 0.019, tilt: 0.16, off: 0, y: -0.001 },
  ];
  for (const ring of rings) {
    for (let k = 0; k < ring.count; k++) {
      const a = ((k + ring.off) / ring.count) * Math.PI * 2;
      const d = Math.abs(((a - gapA + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < 0.45) continue;
      const geo = new THREE.SphereGeometry(0.5, 12, 6);
      // a petal: long, a little pointed at the tip, cupped
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const tip = Math.max(0, x) * 2;
        p.setZ(i, z * (1 - 0.45 * tip * tip));
        p.setY(i, p.getY(i) + (z * z) * 0.5);
      }
      geo.computeVertexNormals();
      geo.scale(ring.len, 0.12 * ring.wid / 0.5 * 0.5, ring.wid);
      geo.translate(ring.len * 0.5, 0, 0);
      geo.rotateZ(ring.tilt);
      geo.rotateY(-a);
      const r0 = rimR - 0.003;
      ring.list.push(put(geo, { p: [b.x + Math.cos(a) * r0, b.rimY + 0.004 + ring.y, b.z + Math.sin(a) * r0] }));
    }
  }
  skin.mesh(merge(front), m.petal, g);
  skin.mesh(merge(back), m.petalDeep, g);
  // seeds: a dark ring of bumps just inside the rim
  const seeds = [];
  for (let k = 0; k < 44; k++) {
    const a = (k / 44) * Math.PI * 2;
    const rr = b.R + R_MARBLE * 0.2 + (k % 2) * 0.003;
    seeds.push(ball(0.0017, [b.x + Math.cos(a) * rr, b.rimY + b.f(rr) - R_MARBLE + 0.0012, b.z + Math.sin(a) * rr], [1, 0.6, 1], 8));
  }
  skin.mesh(merge(seeds), m.seedHead, g);
}

// ------------------------------------------------------------ pinwheel

// A garden pinwheel on a brass stem behind the track: six curled petal
// sails in bright lacquer round a gold hub. Passing marbles flick its lower
// sails and set it turning.
function pinwheel(inst, g, skin, m) {
  const lane = inst.laneByName.main;
  const f = lane.frame(lane.length / 2, { p: V(0, 0, 0), t: V(0, 0, 0), u: V(0, 0, 0), w: V(0, 0, 0), k: V(0, 0, 0) });
  const hub = new THREE.Group();
  hub.position.copy(f.p).addScaledVector(f.w, -0.028).addScaledVector(f.u, 0.035);
  hub.lookAt(hub.position.clone().add(f.w));
  const spin = new THREE.Group();
  hub.add(spin);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // a sail: a curled triangle from the hub out to a rounded tip
    const shape = new THREE.Shape();
    shape.moveTo(0.002, -0.002);
    shape.bezierCurveTo(0.018, -0.012, 0.036, -0.008, 0.04, 0.0);
    shape.bezierCurveTo(0.042, 0.008, 0.03, 0.012, 0.018, 0.009);
    shape.lineTo(0.002, 0.002);
    const geo = new THREE.ShapeGeometry(shape, 10);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k);
      const y = p.getY(k);
      p.setZ(k, Math.sin((x / 0.04) * Math.PI * 0.9) * 0.006 * (y + 0.012) / 0.024);
    }
    geo.computeVertexNormals();
    geo.rotateZ(a);
    const sail = skin.mesh(geo, m.colours[i % m.colours.length], spin);
    sail.material.side = THREE.DoubleSide;
    skin.mesh(new THREE.TorusGeometry(0.0018, 0.0006, 6, 12), m.gold, spin).position.set(Math.cos(a) * 0.039, Math.sin(a) * 0.039, 0.001);
  }
  const hubBall = skin.mesh(new THREE.SphereGeometry(0.0055, 20, 14), m.gold, spin);
  hubBall.scale.set(1, 1, 0.7);
  const axle = skin.mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.014, 10), m.brass, hub);
  axle.rotation.x = Math.PI / 2;
  axle.position.z = -0.006;
  g.add(hub);
  // the stem, down to the lane's level and a little below
  const stemH = 0.035 + 0.03;
  const stem = skin.mesh(new THREE.CylinderGeometry(0.0016, 0.0019, stemH, 10), m.brass, g);
  stem.position.copy(hub.position).addScaledVector(f.w, -0.008).add(V(0, -stemH / 2, 0));
  skin.movers.push({ type: 'spinner', spin, mech: inst.mech.spinner, inst });
  skin.pickables.push({ inst, object: hub, kind: 'spinner' });
}

export const cameraDefault = { target: new THREE.Vector3(-0.02, 0.2, 0.0), distance: 1.6, azimuth: THREE.MathUtils.degToRad(-4), elevation: THREE.MathUtils.degToRad(21), fov: 34 };

export async function setting(ctx) {
  const mod = await import('./storybook-setting.js');
  return mod.createStorybookSetting(ctx);
}
