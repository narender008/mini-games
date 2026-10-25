// Sector 4, the Hive Nebula: flying down a channel between the walls of a
// vast biomechanical hive (still machines: grown armour, not flesh), deep in
// a purple and green nebula. The walls are honeycombs of glossy hex cells
// with an organic, wavering inner edge rimmed in violet; some cells hold
// glowing green pods that pulse. Ribbed conduits arch out from the walls
// behind the play field, and spores drift everywhere.
//
// Layers, far to near:
//   nebula    (z -520) opaque: violet and green gas, dark dust, faint stars,
//             darker in the middle of the screen
//   conduits  (z -11) instanced ribbed tubes (MeshStandardMaterial, glossy
//             purple with green rim) arching out of the walls and back
//   walls     (z -1.5) one opaque plane, shader-drawn hex cells lit from a
//             height field: raised glossy ridges, dished cell floors, pods
//             with a pulsing green glow, a violet membrane lip on the inner
//             edge and the wall's side face. The middle is discarded.
//   spores    GPU motes, green and violet, swaying, calm in the middle
// `edges(y)` gives the inner edge of the walls at the play plane; the
// waver is a sum of sines that the shader and edges() share.
import * as THREE from 'three';
import { Plane, Motes, Stream, envDome, patchStandard, scrollAt, visibleAt, PERIOD } from './common.js';
import { mulberry32 } from '../../textures.js';

const SPEED = 2.8;
const WALL_Z = -1.5;
const TAU = Math.PI * 2;
// the edge waver: amplitude (fraction of uWave) and period (world units,
// each a divisor of PERIOD) per term
const WAVES = [
  [0.55, 64, 1.3],
  [0.3, 32, 0.4],
  [0.15, 16, 2.2],
];

const nebulaFragment = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uViolet;
uniform vec3 uGreen;
uniform vec3 uMagenta;
void main() {
  vec2 p = vec2(vWorld.x, vWorld.y + uScroll) / 512.0;
  vec2 w = p + (vec2(nz(p * 0.6 + 0.1).r, nz(p * 0.6 + 0.6).r) - 0.5) * 0.35;
  float a = nz(w * 0.9).r;
  float b = nz(w * 1.9 + 0.3).r;
  float c = nz(w * 4.1 + 0.8).b;
  float gas = smoothstep(0.4, 0.88, a * 0.7 + b * 0.35 + c * 0.1);
  float hue = nz(p * 0.3 + 0.7).r;
  vec3 neb = mix(uViolet, uMagenta, smoothstep(0.55, 0.7, hue));
  neb = mix(neb, uGreen, smoothstep(0.45, 0.3, hue));
  vec3 col = uDeep * (0.8 + 0.4 * b);
  float side = mix(0.22, 1.0, sideMask(vNdc, 0.1, 0.85));
  col += neb * gas * (0.4 + 1.0 * b * b) * side;
  // hot green pockets of glow
  float pocket = smoothstep(0.72, 0.9, nz(w * 1.3 + 0.45).g);
  col += uGreen * pocket * 0.45 * side;
  float dust = smoothstep(0.5, 0.75, nz(w * 1.4 + 0.2).r);
  col *= 1.0 - dust * 0.5;
  // faint stars
  vec2 sc = floor(vWorld.xy / 1.6 + vec2(0.0, uScroll / 1.6));
  float st = step(0.985, hash12(sc));
  vec2 sf = fract(vWorld.xy / 1.6 + vec2(0.0, uScroll / 1.6)) - 0.5;
  col += vec3(0.8, 0.85, 1.0) * st * smoothstep(0.2, 0.0, length(sf)) * 0.5;
  gl_FragColor = vec4(col, 1.0);
}`;

const wallFragment = /* glsl */ `
uniform float uEdge;
uniform float uWave;
uniform float uHex;        // cell size (world units)
uniform vec3 uKey;
uniform vec3 uShell;
uniform vec3 uDeepCell;
uniform vec3 uPod;
uniform vec3 uLip;
uniform vec3 uLight;

float waver(float Y, float ph) {
  return uWave * (${WAVES[0][0]} * sin(Y * ${(TAU / WAVES[0][1]).toFixed(6)} + ${WAVES[0][2]} + ph)
    + ${WAVES[1][0]} * sin(Y * ${(TAU / WAVES[1][1]).toFixed(6)} + ${WAVES[1][2]} + ph * 1.7)
    + ${WAVES[2][0]} * sin(Y * ${(TAU / WAVES[2][1]).toFixed(6)} + ${WAVES[2][2]} + ph * 2.3));
}

// hex tiling: local position in the cell and the cell's id
vec4 hexCell(vec2 uv) {
  const vec2 r = vec2(1.0, 1.7320508);
  const vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  return vec4(gv, uv - gv);
}
float hexDist(vec2 p) {
  p = abs(p);
  return max(dot(p, vec2(0.5, 0.8660254)), p.x);
}
// height of the comb: raised rims, dished floors, and pods that bulge
float comb(vec2 uv, out float pod, out float hd, out vec2 id) {
  vec4 c = hexCell(uv);
  id = c.zw;
  hd = hexDist(c.xy);
  // each cell is a domed armour plate; grooves between them
  float x = hd / 0.5;
  float h = smoothstep(0.5, 0.41, hd) * (0.55 + 0.45 * (1.0 - x * x));
  float hp = hash12(id * 1.37 + 0.5);
  pod = step(0.86, hp);
  // a pod is a glassy bulb sunk into the plate
  h -= pod * (1.0 - smoothstep(0.0, 0.34, hd)) * 0.35;
  return h;
}

void main() {
  float side = sign(vWorld.x);
  float X = abs(vWorld.x);
  float Y = vWorld.y + uScroll;
  float E = uEdge + waver(Y, side > 0.0 ? 0.0 : 2.1);
  float face = 0.3;
  if (X < E - face) discard;
  if (X < E) {
    // side face: dark ribbed armour falling away, lit faintly by the lip
    float k = (X - (E - face)) / face;
    vec3 col = uShell * (0.06 + 0.25 * k * k) + uLip * pow(k, 6.0) * 0.6;
    col *= 0.8 + 0.2 * step(0.5, fract(Y * 3.0));
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  float d = X - E;
  vec2 uv = vec2(X * side, Y) / uHex;
  float pod;
  float hd;
  vec2 id;
  float h = comb(uv, pod, hd, id);
  float e = 0.02;
  float p1;
  float h1;
  vec2 i1;
  float hx = comb(uv + vec2(e, 0.0), p1, h1, i1);
  float hy = comb(uv + vec2(0.0, e), p1, h1, i1);
  vec3 N = normalize(vec3(-(hx - h) / e, -(hy - h) / e, 2.5));
  float rim = smoothstep(0.4, 0.49, hd);   // the groove
  float var = hash12(id + 7.0);
  vec3 alb = mix(uShell * (0.7 + 0.6 * var), uDeepCell, rim);
  // organic mottling on the shell
  alb *= 0.75 + 0.5 * nz(vec2(X, Y) / 3.0).r;
  float diff = clamp(dot(N, uKey), 0.0, 1.0);
  vec3 col = alb * (uLight * diff + 0.08);
  float spec = pow(clamp(dot(reflect(-uKey, N), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 40.0);
  col += uLight * spec * 0.45 * (1.0 - rim);
  // the grooves glow faintly green from inside
  col += uPod * 0.03 * rim * hash12(id + 3.0);
  // pods: a lit bulb with a pulsing heart, more of them near the edge
  float near = exp(-d / 2.5);
  float isPod = pod * step(0.55 - near * 0.35, var);
  if (isPod > 0.0) {
    float pulse = 0.55 + 0.45 * sin(uTime * (1.5 + var * 2.0) + var * 30.0);
    float bulb = 1.0 - smoothstep(0.24, 0.34, hd);
    float heart = 1.0 - smoothstep(0.0, 0.3, hd);
    vec3 glow = uPod * (heart * heart * (0.8 + 1.6 * pulse) + 0.12);
    col = mix(col, glow + uLight * spec * 0.8, bulb);
    col += uPod * smoothstep(0.45, 0.32, hd) * 0.1 * pulse * (1.0 - bulb);
  }
  // the membrane lip along the inner edge
  float lip = exp(-d / 0.08);
  col = col * (1.0 - lip * 0.5) + uLip * lip * 1.2;
  col *= 0.75 + 0.25 * smoothstep(0.0, 0.6, d);
  gl_FragColor = vec4(col, 1.0);
}`;

// A ribbed conduit: a tube arching out from x = 0 to `reach` and back over
// `span` in y, tapering towards its far end, with rings every so often.
function conduitGeometry(reach, span) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    const a = k * Math.PI;
    pts.push(new THREE.Vector3(-1.2 + Math.sin(a) * (reach + 1.2) + Math.sin(a * 3) * 0.3, span / 2 - k * span, Math.sin(a) * 0.6));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const seg = 120;
  const geo = new THREE.TubeGeometry(curve, seg, 0.55, 12, false);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  const radial = 13;
  for (let i = 0; i <= seg; i++) {
    const k = i / seg;
    curve.getPointAt(k, c);
    const ribs = 1 + 0.18 * Math.pow(Math.max(0, Math.cos(k * 64 * Math.PI)), 6);
    const taper = (0.75 + 0.45 * Math.sin(k * Math.PI)) * ribs;
    for (let j = 0; j < radial; j++) {
      const idx = i * radial + j;
      v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(taper).add(c);
      p.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export function create(ctx) {
  const group = new THREE.Group();
  const q = ctx.quality;
  const key = new THREE.Vector3(0.35, 0.65, 0.68).normalize();
  const rows = Math.round(PERIOD / (1.7320508 * 1.05));
  const hex = PERIOD / (rows * 1.7320508);

  const nebula = new Plane({
    z: -520,
    speed: 3,
    noise: ctx.noise,
    fragment: nebulaFragment,
    renderOrder: -10,
    uniforms: {
      uDeep: { value: new THREE.Color('#06030b') },
      uViolet: { value: new THREE.Color('#5b2a9a').multiplyScalar(0.42) },
      uGreen: { value: new THREE.Color('#2fd068').multiplyScalar(0.2) },
      uMagenta: { value: new THREE.Color('#a03090').multiplyScalar(0.3) },
    },
  });
  group.add(nebula.mesh);

  const walls = new Plane({
    z: WALL_Z,
    speed: SPEED,
    noise: ctx.noise,
    fragment: wallFragment,
    renderOrder: -4,
    uniforms: {
      uEdge: { value: 10 },
      uWave: { value: 1 },
      uHex: { value: hex },
      uKey: { value: key },
      uShell: { value: new THREE.Color('#40245f') },
      uDeepCell: { value: new THREE.Color('#0b0614') },
      uPod: { value: new THREE.Color('#5dff8a').multiplyScalar(1.6) },
      uLip: { value: new THREE.Color('#9a5cff').multiplyScalar(1.1) },
      uLight: { value: new THREE.Color('#eadcff').multiplyScalar(1.15) },
    },
  });
  group.add(walls.mesh);

  // conduits arching out of both walls, behind the play field
  const conduitGeo = conduitGeometry(6.5, 16);
  const conduitMat = new THREE.MeshStandardMaterial({ color: '#5a3478', roughness: 0.3, metalness: 0.2, envMapIntensity: 0.8 });
  patchStandard(conduitMat, { haze: '#0a0510', near: 30, far: 120, rim: '#6dff9c', rimAmt: 0.6, rimPower: 3, grit: ctx.noise, gritScale: 0.6, gritAmt: 0.45 });
  const conduits = new THREE.InstancedMesh(conduitGeo, conduitMat, 2);
  const one = () => new THREE.Vector3(1, 1, 1);
  const conduitItems = [
    { fx: -0.8, y0: 0.2, z: -11, speed: SPEED, scale: one(), rot: new THREE.Euler(0, 0, 0), size: 4 },
    { fx: 0.8, y0: 0.72, z: -13, speed: SPEED, scale: one(), rot: new THREE.Euler(0, Math.PI, 0), size: 4 },
  ];
  const conduitStream = new Stream(conduits, conduitItems, { margin: 4 });
  group.add(conduits);

  const spores = new Motes({
    count: Math.round(520 * q.clouds),
    rand: mulberry32(66),
    calm: 0.25,
    flicker: 0.4,
    sway: 0.5,
    colA: '#6dff9a',
    colB: '#b48cff',
    renderOrder: -2,
    gen: (r) => {
      const big = r() < 0.08;
      return { x: r(), y: r(), z: -1 - r() * 30, speed: SPEED * (0.6 + r() * 0.5), size: big ? 5 + r() * 5 : 1.2 + r() * 2.2, bright: big ? 0.12 + r() * 0.15 : 0.35 + r() * 0.8, mix: r() < 0.7 ? 0 : 1 };
    },
  });
  group.add(spores.points);

  const env = envDome({
    base: '#08040d',
    up: '#2e1f40',
    down: '#06120a',
    lobes: [
      { dir: [0.35, 0.65, 0.68], color: '#efe2ff', power: 1.3, sharp: 7 },
      { dir: [-0.8, -0.3, 0.4], color: '#3cd870', power: 0.6, sharp: 3 },
      { dir: [0.8, -0.3, 0.4], color: '#8a4ce0', power: 0.6, sharp: 3 },
      { dir: [0, 0, 1], color: '#2f2440', power: 0.4, sharp: 2 },
    ],
  });

  let dist = 27;
  let tScroll = 0;
  let edgeAt = 10;
  let wave = 1;
  const layout = (view) => {
    const portrait = view.halfH > view.halfW;
    dist = view.dist;
    nebula.layout(view);
    walls.layout(view);
    const v = visibleAt(view.camera, view.dist, WALL_Z);
    edgeAt = v.halfW * (portrait ? 0.76 : 0.72);
    wave = portrait ? 0.45 : 1.0;
    walls.uniforms.uEdge.value = edgeAt;
    walls.uniforms.uWave.value = wave;
    // conduits reach a third of the way across, less on narrow screens
    const s = portrait ? 0.5 : 1;
    for (const it of conduitItems) {
      it.fx = Math.sign(it.fx) * (portrait ? 0.9 : 0.82);
      it.scale.set(s, s * 1.0, s);
    }
    conduitStream.layout(view);
  };

  const k0 = () => dist / (dist - WALL_Z);
  const edgeOffset = (y, side) => {
    const Y = y / k0() + tScroll;
    const ph = side > 0 ? 0 : 2.1;
    const mul = [1, 1.7, 2.3];
    let w = 0;
    WAVES.forEach(([a, per, p0], i) => {
      w += a * Math.sin(Y * (TAU / per) + p0 + ph * mul[i]);
    });
    return (edgeAt + wave * w) * k0();
  };

  return {
    id: 'hive',
    accent: '#7dff9e',
    group,
    envScene: env.scene,
    edges: (y) => ({ left: -edgeOffset(y, -1), right: edgeOffset(y, 1) }),
    light: {
      sunDir: key.clone(),
      sunColor: new THREE.Color('#efe2ff'),
      sunIntensity: 2.3,
      skyColor: new THREE.Color('#5a3f80'),
      groundColor: new THREE.Color('#0f2a18'),
      hemiIntensity: 0.5,
      envIntensity: 0.9,
      exposure: 1.0,
      rimColor: new THREE.Color('#7dff9e'),
      rimIntensity: 1.5,
      bloom: 0.58,
    },
    layout,
    update(dt, t, view) {
      nebula.update(t);
      walls.update(t);
      tScroll = scrollAt(t, SPEED);
      conduitStream.update(t);
      spores.update(t, view, ctx.renderer.getPixelRatio());
    },
    dispose() {
      group.removeFromParent();
      nebula.dispose();
      walls.dispose();
      conduitGeo.dispose();
      conduitMat.dispose();
      conduits.dispose();
      spores.dispose();
      env.dispose();
    },
  };
}
