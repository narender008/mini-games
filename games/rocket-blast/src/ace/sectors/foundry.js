// Sector 3, the Scrap Foundry: skimming down the shaft of an orbital
// smelter. Heavy deck walls run down both sides with molten channels, worn
// hazard trims, pipes, vents and blinking running lights; between them the
// shaft drops away to a dim machine floor where a molten river glows far
// below. Truss girders span the shaft now and then. Embers drift up off the
// melt.
//
// Layers, far to near:
//   floor    (z -90) opaque: dark machinery blocks and a meandering molten
//            river, kept dim so the middle of the field stays calm
//   girders  (z -7) instanced lit trusses (MeshStandardMaterial) spanning
//            the shaft; their ends tuck under the walls
//   walls    (z -1.5) one opaque plane, shader-drawn: a stepped inner edge
//            (so the shaft narrows and widens in blocks), hazard trim along
//            every edge, bevelled plates lit from a height field, a pipe,
//            the molten channel with drifting crust, lava glow spilling on
//            the plates, running lights. The middle is discarded.
//   embers   GPU motes, sides only
// `edges(y)` gives the inner edge of the walls at the play plane (z = 0) so
// turret pods can sit on them; the shader and edges() share one table of
// step offsets.
import * as THREE from 'three';
import { Plane, Motes, Stream, envDome, patchStandard, scrollAt, visibleAt } from './common.js';
import { mulberry32 } from '../../textures.js';

const SPEED = 3.0;
const WALL_Z = -1.5;
const SEG = 4; // length of one wall block, world units (divides PERIOD)
const STEPS = 32; // blocks before the step pattern repeats (SEG * STEPS divides PERIOD)

const floorFragment = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uMolten;
uniform float uCalm;
float river(float y, float ph) {
  return sin(y * 6.2832 / 256.0 + ph) * 22.0 + sin(y * 6.2832 / 128.0 + ph * 2.3) * 9.0;
}
void main() {
  float X = vWorld.x;
  float Y = vWorld.y + uScroll;
  // big dark machine blocks
  vec2 cell = vec2(10.0, 16.0);
  vec2 id = floor(vec2(X, Y) / cell);
  vec2 f = fract(vec2(X, Y) / cell) - 0.5;
  float hh = hash12(id + 3.0);
  vec2 inset = vec2(0.36 + hh * 0.1, 0.38 + hash12(id + 9.0) * 0.08);
  float b = sdBox(f * cell, inset * cell);
  float edge = smoothstep(0.35, 0.0, abs(b + 0.2));
  vec3 col = uBase * (0.6 + hh * 0.6);
  col *= 1.0 - 0.45 * smoothstep(-0.2, 0.6, b);
  col += uBase * edge * 0.8;
  // stripes of small lit windows on a few blocks
  float lit = step(0.8, hh) * step(0.5, fract(Y * 0.5)) * step(abs(f.x * cell.x), 3.0) * step(abs(f.y * cell.y - 2.0), 0.4);
  col += vec3(0.6, 0.35, 0.15) * lit * 0.08;
  // the molten river and a fainter branch
  float r1 = X - river(Y, 0.0);
  float r2 = X - river(Y + 90.0, 2.1) * 1.4 - 30.0;
  float w = 1.6 + nz(vec2(0.3, Y / 128.0)).r * 1.2;
  float core = exp(-r1 * r1 / (w * w));
  float halo = exp(-r1 * r1 / (w * w * 18.0));
  float core2 = exp(-r2 * r2 / (w * w * 0.5)) * 0.25;
  float flow = 0.6 + 0.6 * nz(vec2(X / 32.0, (Y - uTime * 6.0) / 64.0)).g;
  col = mix(col, col * 0.2, core);
  col += uMolten * (core * flow * 1.1 + halo * 0.18 + core2 * flow * 0.7);
  col *= mix(uCalm, 1.0, sideMask(vNdc, 0.0, 0.8));
  gl_FragColor = vec4(col, 1.0);
}`;

const wallFragment = /* glsl */ `
uniform float uEdge;        // inner edge of the walls at this depth
uniform float uSteps[${STEPS}];
uniform vec3 uLava;         // lava centre (from the inner edge), width, wobble
uniform float uPipe;        // pipe centre, from the inner edge
uniform vec3 uKey;
uniform vec3 uPlate;
uniform vec3 uHazard;
uniform vec3 uMoltenA;
uniform vec3 uMoltenB;
uniform vec3 uLight;

float stepAt(float seg, float side) {
  float i = mod(seg + (side > 0.0 ? 11.0 : 0.0), ${STEPS}.0);
  return uSteps[int(i)];
}

// raised plates with grooves; X across the wall, Y along it
float plates(vec2 p) {
  vec2 sz = vec2(1.3, 1.9);
  vec2 id = floor(p / sz);
  vec2 f = (fract(p / sz) - 0.5) * sz;
  float h = hash12(id);
  // some plates split in two
  if (h > 0.7) f.y = abs(f.y) - sz.y * 0.25;
  vec2 hb = (h > 0.7 ? vec2(0.5, 0.25) : vec2(0.5, 0.5)) * sz - 0.05;
  float d = sdBox(f, hb);
  float v = smoothstep(0.0, -0.08, d);
  // rivets in the corners
  vec2 rv = abs(f) - (hb - 0.12);
  v += 0.4 * smoothstep(0.05, 0.02, length(rv)) * step(h, 0.7);
  // slatted vents on a few plates
  if (h < 0.18) v -= 0.5 * step(0.5, fract(f.y * 6.0)) * step(abs(f.x), hb.x - 0.15) * step(abs(f.y), hb.y - 0.15);
  return v + h * 0.12;
}

void main() {
  float side = sign(vWorld.x);
  float X = abs(vWorld.x);
  float Y = vWorld.y + uScroll + (side > 0.0 ? 0.0 : 37.0);
  float seg = floor(Y / ${SEG}.0);
  float e0 = uEdge - stepAt(seg, side);
  float face = 0.22;          // the inner side face, seen in perspective
  if (X < e0 - face) discard;
  float e1 = uEdge - stepAt(seg + 1.0, side);
  float em = uEdge - stepAt(seg - 1.0, side);
  float fy = Y - seg * ${SEG}.0;
  // distance to the nearest edge of the deck (including block ends)
  float dEdge = X - e0;
  if (X < e1) dEdge = min(dEdge, ${SEG}.0 - fy);
  if (X < em) dEdge = min(dEdge, fy);
  vec3 col;
  if (X < e0) {
    // side face: dark ribbed metal falling away into the shaft
    float k = (X - (e0 - face)) / face;
    col = uPlate * (0.08 + 0.25 * k) * (0.8 + 0.2 * step(0.5, fract(Y * 2.0)));
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  float d = X - e0;
  vec2 p = vec2(X, Y);
  float e = 0.03;
  float h = plates(p);
  float hx = plates(p + vec2(e, 0.0));
  float hy = plates(p + vec2(0.0, e));
  vec3 N = normalize(vec3(-(hx - h) / e * side, -(hy - h) / e, 6.0));
  float grime = nz(p / 9.0).r * 0.6 + nz(p / 2.5).b * 0.4;
  vec3 alb = uPlate * (0.55 + 0.6 * grime) * (0.75 + 0.25 * h);
  // hazard trim along every edge
  float haz = smoothstep(0.42, 0.38, dEdge) * step(0.06, dEdge);
  float stripe = step(0.5, fract((Y + X * side) * 1.25));
  float wear = smoothstep(0.35, 0.65, nz(p / 3.0 + 0.5).g);
  alb = mix(alb, mix(uHazard, uPlate * 0.15, stripe) * (0.6 + 0.4 * wear), haz);
  // bright worn lip right at the edge
  float lip = smoothstep(0.06, 0.0, dEdge);
  // the pipe, a long cylinder
  float db = X - uEdge;        // from the unstepped edge: channel and pipe run straight
  float pd = (db - uPipe) / 0.22;
  float pipe = step(abs(pd), 1.0);
  if (pipe > 0.0) {
    N = normalize(vec3(pd * side, 0.0, sqrt(max(0.0, 1.0 - pd * pd))));
    alb = uPlate * 0.7 * (0.9 + 0.1 * step(0.9, fract(Y * 0.25)));
  }
  float diff = clamp(dot(N, uKey), 0.0, 1.0);
  vec3 col2 = alb * (uLight * diff * 0.9 + 0.12);
  float spec = pow(clamp(dot(reflect(-uKey, N), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 24.0) * (0.3 + 0.5 * pipe);
  col2 += uLight * spec * 0.35;
  col2 += uLight * lip * 0.35;
  // the molten channel
  float lc = uLava.x + (nz(vec2(0.7, Y / 48.0)).r - 0.5) * uLava.z;
  float ld = abs(db - lc) / (uLava.y * 0.5);
  float glowK = exp(-max(ld - 1.0, 0.0) * 1.6);
  col2 += uMoltenA * glowK * 0.06 * (1.0 - step(ld, 1.0));
  if (ld < 1.25) {
    // channel rim: dark bevel
    float rim = smoothstep(1.25, 1.0, ld);
    col2 = mix(col2, uPlate * 0.05, rim);
  }
  if (ld < 1.0) {
    // cooling crust plates drifting on the melt, bright cracks between them
    vec2 lp = vec2(db / 1.6, (Y - uTime * 1.2) / 1.6);
    lp += (nz(lp * 0.3).rb - 0.5) * 0.4;
    float cellA = nz(lp * 0.5).g;
    float crack = smoothstep(0.34, 0.16, cellA);
    float edgeHeat = smoothstep(0.82, 1.0, ld);
    float heat = max(crack, edgeHeat) * (0.75 + 0.5 * nz(lp * 0.9 + uTime * 0.05).r);
    vec3 crustCol = uMoltenA * 0.16 * (0.6 + 0.8 * nz(lp * 1.7).b);
    col2 = mix(crustCol, mix(uMoltenA, uMoltenB, heat * heat), heat);
  }
  // running lights on the trim, and a few amber lamps on the plates
  float lamp = smoothstep(0.09, 0.03, length(vec2(dEdge - 0.24, mod(Y, 4.0) - 2.0)));
  float blink = step(0.55, fract(uTime * 0.8 + floor(Y / 4.0) * 0.37));
  col2 += vec3(3.0, 0.25, 0.15) * lamp * blink * haz;
  gl_FragColor = vec4(col2, 1.0);
}`;

// A truss girder: two chords, cross ties and diagonals, merged into one
// geometry along x, centred on 0.
function trussGeometry(len) {
  const parts = [];
  const box = (w, h, d, x, y, z, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g);
  };
  const H = 0.9;
  box(len, 0.16, 0.22, 0, H / 2, 0);
  box(len, 0.16, 0.22, 0, -H / 2, 0);
  box(len, 0.06, 0.06, 0, 0, -0.1);
  const bay = 1.0;
  const n = Math.floor(len / bay);
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + i * bay;
    box(0.1, H, 0.14, x, 0, 0);
    if (i < n) box(Math.hypot(bay, H) * 0.98, 0.07, 0.1, x + bay / 2, 0, 0.02, Math.atan2(H, bay) * (i % 2 ? 1 : -1));
  }
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
}

function mergeGeometries(list) {
  let count = 0;
  for (const g of list) count += g.index.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of list) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i++) {
      const j = idx[i];
      pos.set([p.getX(j), p.getY(j), p.getZ(j)], o * 3);
      nor.set([n.getX(j), n.getY(j), n.getZ(j)], o * 3);
      o++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

export function create(ctx) {
  const group = new THREE.Group();
  const q = ctx.quality;
  const key = new THREE.Vector3(0.4, 0.62, 0.68).normalize();

  // the wall step table: how far each block juts into the shaft
  const sr = mulberry32(33);
  const steps = Array.from({ length: STEPS }, (_, i) => {
    const r = sr();
    return i % 3 === 0 ? 0 : r < 0.45 ? 0 : r < 0.75 ? 0.7 : r < 0.92 ? 1.3 : 2.0;
  });

  const floor = new Plane({
    z: -90,
    speed: SPEED,
    noise: ctx.noise,
    fragment: floorFragment,
    renderOrder: -10,
    uniforms: {
      uBase: { value: new THREE.Color('#1a1c22').multiplyScalar(0.55) },
      uMolten: { value: new THREE.Color('#e0360c').multiplyScalar(0.16) },
      uCalm: { value: 0.55 },
    },
  });
  group.add(floor.mesh);

  const walls = new Plane({
    z: WALL_Z,
    speed: SPEED,
    noise: ctx.noise,
    fragment: wallFragment,
    renderOrder: -4,
    uniforms: {
      uEdge: { value: 10 },
      uSteps: { value: steps },
      uLava: { value: new THREE.Vector3(2, 1, 0.3) },
      uPipe: { value: 1 },
      uKey: { value: key },
      uPlate: { value: new THREE.Color('#5d636c') },
      uHazard: { value: new THREE.Color('#d39a16') },
      uMoltenA: { value: new THREE.Color('#ff3a06').multiplyScalar(1.5) },
      uMoltenB: { value: new THREE.Color('#ffb640').multiplyScalar(2.6) },
      uLight: { value: new THREE.Color('#ffe8d0').multiplyScalar(1.1) },
    },
  });
  group.add(walls.mesh);

  // girders spanning the shaft
  const trussGeo = trussGeometry(44);
  const trussMat = new THREE.MeshStandardMaterial({ color: '#4c525a', metalness: 0.65, roughness: 0.5, envMapIntensity: 0.6 });
  patchStandard(trussMat, { haze: '#0b0b0e', near: 30, far: 140, rim: '#ff6a20', rimAmt: 0.35, rimPower: 2.5, grit: ctx.noise, gritScale: 0.5, gritAmt: 0.5 });
  const truss = new THREE.InstancedMesh(trussGeo, trussMat, 2);
  const trussStream = new Stream(
    truss,
    [
      { x: 0, y0: 0.15, z: -7, speed: SPEED, scale: new THREE.Vector3(1, 1, 1), rot: new THREE.Euler(0, 0, 0), size: 1 },
      { x: 0, y0: 0.65, z: -9, speed: SPEED, scale: new THREE.Vector3(1, 1.2, 1), rot: new THREE.Euler(0, 0, 0.03), size: 1 },
    ],
    { margin: 14 },
  );
  group.add(truss);

  const embers = new Motes({
    count: Math.round(420 * q.clouds),
    rand: mulberry32(44),
    calm: 0.0,
    flicker: 0.7,
    sway: 0.35,
    colA: '#ff5a14',
    colB: '#ffc060',
    renderOrder: -2,
    gen: (r) => ({ x: r() < 0.5 ? r() * 0.22 : 1 - r() * 0.22, y: r(), z: -0.5 - r() * 3, speed: SPEED * (0.5 + r() * 0.4), size: 1.4 + r() * 2.2, bright: 0.6 + r() * 1.6, mix: r() }),
  });
  group.add(embers.points);

  const env = envDome({
    base: '#07070a',
    up: '#2a2d36',
    down: '#140805',
    lobes: [
      { dir: [0.4, 0.62, 0.68], color: '#ffe6cc', power: 1.3, sharp: 7 },
      { dir: [-1, -0.2, 0.3], color: '#ff5a18', power: 0.7, sharp: 3 },
      { dir: [1, -0.2, 0.3], color: '#ff5a18', power: 0.7, sharp: 3 },
      { dir: [0, 0, 1], color: '#353a44', power: 0.4, sharp: 2 },
    ],
  });

  // wall geometry in play-plane units, set in layout
  let edgeK = 0.66;
  let dist = 27;
  let tScroll = 0;
  const layout = (view) => {
    const portrait = view.halfH > view.halfW;
    dist = view.dist;
    floor.layout(view);
    walls.layout(view);
    trussStream.layout(view);
    const v = visibleAt(view.camera, view.dist, WALL_Z);
    edgeK = portrait ? 0.73 : 0.68;
    const E = v.halfW * edgeK;
    const W = v.halfW * 1.12 - E;
    const u = walls.uniforms;
    u.uEdge.value = E;
    // portrait walls are thin: shallow steps, a narrower channel
    u.uSteps.value = steps.map((s) => s * (portrait ? 0.35 : 1));
    u.uLava.value.set(Math.min(W * 0.62, 3.6), portrait ? 0.55 : 1.15, portrait ? 0.2 : 0.5);
    u.uPipe.value = Math.min(W * 0.32, 1.5);
    stepScale = portrait ? 0.35 : 1;
    edgeAt = E;
  };
  let stepScale = 1;
  let edgeAt = 10;

  // inner edge of the walls at the play plane (z = 0), mirrored
  const k0 = () => dist / (dist - WALL_Z);
  const edgeOffset = (y, side) => {
    const wy = y / k0(); // the wall point seen behind play-plane height y
    const Y = wy + tScroll + (side > 0 ? 0 : 37);
    const seg = Math.floor(Y / SEG);
    const i = (((seg + (side > 0 ? 11 : 0)) % STEPS) + STEPS) % STEPS;
    return (edgeAt - steps[i] * stepScale) * k0();
  };

  return {
    id: 'foundry',
    accent: '#ff8a3a',
    group,
    envScene: env.scene,
    edges: (y) => ({ left: -edgeOffset(y, -1), right: edgeOffset(y, 1) }),
    light: {
      sunDir: key.clone(),
      sunColor: new THREE.Color('#ffe8d4'),
      sunIntensity: 2.3,
      skyColor: new THREE.Color('#545b68'),
      groundColor: new THREE.Color('#3a1606'),
      hemiIntensity: 0.5,
      envIntensity: 0.9,
      exposure: 1.0,
      rimColor: new THREE.Color('#ff8a40'),
      rimIntensity: 1.8,
      bloom: 0.5,
    },
    layout,
    update(dt, t, view) {
      floor.update(t);
      walls.update(t);
      tScroll = scrollAt(t, SPEED);
      trussStream.update(t);
      embers.update(t, view, ctx.renderer.getPixelRatio());
    },
    dispose() {
      group.removeFromParent();
      floor.dispose();
      walls.dispose();
      trussGeo.dispose();
      trussMat.dispose();
      truss.dispose();
      embers.dispose();
      env.dispose();
    },
  };
}
