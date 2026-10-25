// Sector 5, the Dreadnought: flying low and fast along the spine of an
// enormous warship. Armour plates, greebles, vents and paint bands stream
// past on both sides of a deep central trench whose rim lights chase
// forward; superstructure blocks stand up off the hull; past the hull's
// edge, a distant fleet battle flashes against the stars and lights the
// armour in pulses.
//
// Layers, far to near:
//   space     (z -650) opaque: dark starfield haze with distant battle
//             flashes (shader, from a seeded timeline) and tracer streaks
//   stars     GPU points just in front of it
//   trench    floor (z -64) and two inner walls (planes in y/z) with ribs
//             and cold light strips, darkening with depth
//   hull      (z -14) one opaque plane: the deck either side of the trench,
//             shader-drawn plates, panels, greebles, vents, paint bands and
//             running lights, lit from a height field plus the battle light.
//             The trench and the space past the hull's edge are discarded.
//   blocks    instanced boxes standing on the deck (MeshStandardMaterial)
//   beams     instanced cross beams spanning the trench now and then
// `edges(y)` gives the trench rim at the play plane (the hull deck starts
// there), so turret pods can sit just outside it.
import * as THREE from 'three';
import { Plane, Motes, Stream, envDome, patchStandard, slot, visibleAt, scrollAt } from './common.js';
import { mulberry32 } from '../../textures.js';

const SPEED = 4.6;
const HULL_Z = -14;
const FLOOR_Z = -64;
const BOOMS = 4;

const spaceFragment = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uHaze;
uniform vec4 uBoom[${BOOMS}];   // x, y, size, age 0..1 (or < 0 = off)
uniform vec3 uBoomCol[${BOOMS}];
void main() {
  vec2 p = vec2(vWorld.x, vWorld.y + uScroll) / 512.0;
  float n = nz(p * 0.8).r * 0.7 + nz(p * 2.0 + 0.3).r * 0.3;
  vec3 col = uDeep + uHaze * smoothstep(0.45, 0.9, n);
  for (int i = 0; i < ${BOOMS}; i++) {
    vec4 b = uBoom[i];
    if (b.w < 0.0) continue;
    float d = length(vWorld.xy - b.xy) / b.z;
    float flash = exp(-d * d * 3.0) * pow(1.0 - b.w, 3.0) * 3.0;
    float ring = exp(-pow((d - b.w * 2.2) * 6.0, 2.0)) * (1.0 - b.w) * 0.6;
    float glow = exp(-d * 1.2) * (1.0 - b.w) * 0.25;
    col += uBoomCol[i] * (flash + ring + glow);
  }
  // tracer streaks across the far battle
  float tr = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float ph = fract(uTime * (0.21 + fk * 0.07) + fk * 0.37);
    float yy = (hash11(floor(uTime * (0.21 + fk * 0.07) + fk * 0.37) + fk * 13.0) * 2.0 - 1.0) * uView.y;
    float xx = mix(-1.3, 1.3, ph) * uView.x * (k == 1 ? -1.0 : 1.0);
    vec2 dv = vWorld.xy - vec2(xx, yy + (vWorld.x - xx) * 0.12);
    tr += exp(-dv.y * dv.y * 0.6) * exp(-max(abs(dv.x) - 6.0, 0.0) * 0.4) * step(abs(dv.x), 40.0);
  }
  col += vec3(1.0, 0.45, 0.2) * tr * 0.08;
  gl_FragColor = vec4(col, 1.0);
}`;

const hullFragment = /* glsl */ `
uniform float uTrench;      // half width of the trench at the hull's depth
uniform float uOuter;       // hull edge (x) at the hull's depth
uniform vec3 uKey;
uniform vec3 uLight;
uniform vec3 uPlate;
uniform vec3 uPaint;
uniform vec3 uVent;
uniform vec3 uRimLight;
uniform vec3 uRunLight;
uniform vec3 uBattle;       // battle light colour * intensity right now
uniform float uCalm;

// the hull's height field: big plates, inset panels, greeble rows, vents
float hull(vec2 p, out float vent, out float seam, out vec2 pid) {
  vec2 big = vec2(5.0, 8.0);
  pid = floor(p / big);
  vec2 f = (fract(p / big) - 0.5) * big;
  float hb = hash12(pid);
  float s = sdBox(f, big * 0.5 - 0.06);
  seam = smoothstep(-0.07, 0.0, s);
  float h = 0.4 * (1.0 - seam);
  vent = 0.0;
  // subdivide each plate in two or three bays
  vec2 bay = hb > 0.5 ? vec2(big.x, big.y / 3.0) : vec2(big.x / 2.0, big.y / 2.0);
  vec2 bid = floor((f + big * 0.5) / bay);
  vec2 bf = (fract((f + big * 0.5) / bay) - 0.5) * bay;
  float hk = hash12(pid * 3.1 + bid);
  if (hk < 0.3) {
    // recessed panel
    float d = sdBox(bf, bay * 0.5 - 0.35);
    h -= 0.25 * smoothstep(0.05, -0.05, d);
  } else if (hk < 0.6) {
    // raised greeble row: small boxes
    vec2 gs = vec2(0.6 + hk, 0.5);
    vec2 gid = floor(bf / gs);
    vec2 gf = (fract(bf / gs) - 0.5) * gs;
    float gh = hash12(gid + pid * 7.0 + bid);
    float d = sdBox(gf, gs * vec2(0.35 + 0.1 * gh, 0.3));
    h += (0.15 + 0.25 * gh) * smoothstep(0.03, -0.03, d) * step(sdBox(bf, bay * 0.5 - 0.3), 0.0);
  } else if (hk < 0.66) {
    // vent: slats over a glow
    float d = sdBox(bf, vec2(bay.x * 0.32, bay.y * 0.3));
    float inside = smoothstep(0.03, -0.03, d);
    float slat = step(0.5, fract(bf.y * 3.0));
    h -= inside * (0.3 - 0.2 * slat);
    vent = inside * (1.0 - slat);
  } else if (hk < 0.8) {
    // round hatch
    float r = length(bf) - min(bay.x, bay.y) * 0.28;
    h += 0.1 * smoothstep(0.04, -0.04, r) - 0.12 * smoothstep(0.06, 0.0, abs(r));
  }
  return h;
}

void main() {
  float side = sign(vWorld.x);
  float X = abs(vWorld.x);
  float Y = vWorld.y + uScroll;
  if (X < uTrench || X > uOuter) discard;
  float d = X - uTrench;        // from the trench rim
  float o = uOuter - X;         // from the hull's edge
  vec2 p = vec2(d, Y + (side > 0.0 ? 0.0 : 4.0));
  float vent;
  float seam;
  vec2 pid;
  float h = hull(p, vent, seam, pid);
  float e = 0.03;
  float v1;
  float s1;
  vec2 i1;
  float hx = hull(p + vec2(e, 0.0), v1, s1, i1);
  float hy = hull(p + vec2(0.0, e), v1, s1, i1);
  // rim bevels fall away into the trench and over the edge
  float bevel = smoothstep(0.0, 0.5, d) * smoothstep(0.0, 0.5, o);
  vec3 N = normalize(vec3(-(hx - h) / e * side, -(hy - h) / e, 5.0));
  N = normalize(mix(vec3(-side * 0.8, 0.0, 0.6) * step(d, o) + vec3(side * 0.8, 0.0, 0.6) * step(o, d), N, bevel));
  float tone = 0.75 + 0.5 * hash12(pid + 5.0);
  float grime = 0.7 + 0.6 * (nz(p / 14.0).r * 0.6 + nz(p / 3.0).b * 0.4);
  vec3 alb = uPlate * tone * grime;
  // paint: a dark red band along the trench and chevrons pointing forward
  float band = step(0.9, d) * step(d, 1.5);
  float sect = step(0.6, hash11(floor(Y / 24.0)));
  float chev = step(0.72, fract((Y - abs(d - 2.4) * 0.8) / 2.2)) * step(abs(d - 2.4), 0.45) * sect;
  alb = mix(alb, uPaint * grime, max(band, chev) * 0.85);
  alb *= 1.0 - seam * 0.6;
  float diff = clamp(dot(N, uKey), 0.0, 1.0);
  vec3 col = alb * (uLight * diff + 0.06 + uBattle * clamp(N.z * 0.5 + 0.5, 0.0, 1.0));
  float spec = pow(clamp(dot(reflect(-uKey, N), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 20.0);
  col += uLight * spec * 0.18;
  // vents breathe a dull orange
  col += uVent * vent * (0.6 + 0.4 * sin(uTime * 2.0 + pid.y * 3.0));
  // chase lights along the trench rim, racing forward
  float cy = mod(Y + uTime * 18.0, 3.0) - 1.5;
  float chase = smoothstep(0.14, 0.04, length(vec2(d - 0.28, cy)));
  float wave = 0.25 + 0.75 * pow(0.5 + 0.5 * sin((Y + uTime * 30.0) * 0.08), 6.0);
  col += uRimLight * chase * wave;
  // red running lights on the hull's edge
  float ry = mod(Y, 5.0) - 2.5;
  float run = smoothstep(0.12, 0.04, length(vec2(o - 0.35, ry)));
  col += uRunLight * run * step(0.5, fract(uTime * 0.7 + floor(Y / 5.0) * 0.13));
  col *= mix(uCalm, 1.0, sideMask(vNdc, 0.1, 0.65));
  gl_FragColor = vec4(col, 1.0);
}`;

// The trench's inner walls and floor: one shader, KIND 0 = wall, 1 = floor.
const trenchVertex = /* glsl */ `
varying vec3 vWorld;
varying vec2 vNdc;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 p = projectionMatrix * viewMatrix * wp;
  vNdc = p.xy / p.w;
  gl_Position = p;
}`;

const trenchFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform float uScroll;
uniform float uTime;
uniform vec3 uPlate;
uniform vec3 uStrip;
uniform vec3 uKey;
uniform vec3 uBattle;
uniform float uTop;
uniform float uBottom;
varying vec3 vWorld;
varying vec2 vNdc;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  float Y = vWorld.y + uScroll;
#if KIND == 0
  // depth down the wall, 0 at the rim .. 1 at the floor
  float k = clamp((uTop - vWorld.z) / (uTop - uBottom), 0.0, 1.0);
  float rib = step(0.82, fract(Y / 2.0));
  float ledge = step(0.92, fract(k * 5.0));
  float hb = hash12(vec2(floor(Y / 6.0), floor(k * 5.0)));
  vec3 col = uPlate * (0.55 + 0.5 * hb) * (1.0 - rib * 0.5) * (1.0 + ledge * 0.6);
  col *= 0.06 + 0.7 * pow(1.0 - k, 2.0);
  col += uBattle * 0.25 * (1.0 - k);
  // cold light strips along the wall
  float strip = smoothstep(0.012, 0.0, abs(k - 0.3)) + smoothstep(0.012, 0.0, abs(k - 0.62)) * 0.6;
  float pulse = 0.6 + 0.4 * sin(Y * 0.15 + uTime * 6.0);
  col += uStrip * strip * pulse * step(0.3, fract(Y / 4.0));
  // windows here and there
  float win = step(0.86, hb) * step(0.3, fract(Y * 1.5)) * smoothstep(0.03, 0.0, abs(fract(k * 5.0) - 0.45));
  col += vec3(0.9, 0.7, 0.4) * win * 0.6 * (1.0 - k);
#else
  float x = vWorld.x;
  float rail = smoothstep(0.08, 0.0, abs(abs(x) - 1.2)) + smoothstep(0.06, 0.0, abs(x)) * 0.5;
  float tie = step(0.85, fract(Y / 1.5));
  vec3 col = uPlate * 0.18 * (0.8 + 0.4 * texture2D(uNoise, vec2(x, Y) / 12.0).r);
  col += uPlate * rail * 0.25 + uPlate * tie * 0.05;
  // guide lights rushing along the floor
  // dim marker lamps beside the rails (no streaks: they would read as shots)
  float lamp = smoothstep(0.18, 0.06, length(vec2(abs(x) - 2.2, mod(Y, 6.0) - 3.0)));
  col += uStrip * lamp * 0.25;
#endif
  gl_FragColor = vec4(col, 1.0);
}`;

export function create(ctx) {
  const group = new THREE.Group();
  const q = ctx.quality;
  const key = new THREE.Vector3(0.45, 0.6, 0.66).normalize();
  const battle = new THREE.Color(0, 0, 0);

  const booms = Array.from({ length: BOOMS }, () => new THREE.Vector4(0, 0, 1, -1));
  const boomCols = Array.from({ length: BOOMS }, () => new THREE.Color());
  const space = new Plane({
    z: -650,
    speed: 4,
    noise: ctx.noise,
    fragment: spaceFragment,
    renderOrder: -10,
    uniforms: {
      uDeep: { value: new THREE.Color('#04050a') },
      uHaze: { value: new THREE.Color('#2a1a2e').multiplyScalar(0.5) },
      uBoom: { value: booms },
      uBoomCol: { value: boomCols },
    },
  });
  group.add(space.mesh);

  const stars = new Motes({
    count: Math.round(900 * q.clouds),
    rand: mulberry32(55),
    calm: 1,
    flicker: 0.2,
    colA: '#a8c0ff',
    colB: '#ffd8c0',
    renderOrder: -9,
    gen: (r) => ({ x: r(), y: r(), z: -560 - r() * 60, speed: 4, size: 1 + r() * 1.6, bright: 0.3 + r() * 0.8, mix: r() }),
  });
  group.add(stars.points);

  const hull = new Plane({
    z: HULL_Z,
    speed: SPEED,
    noise: ctx.noise,
    fragment: hullFragment,
    renderOrder: -4,
    uniforms: {
      uTrench: { value: 6 },
      uOuter: { value: 20 },
      uKey: { value: key },
      uLight: { value: new THREE.Color('#e4eaf5').multiplyScalar(0.95) },
      uPlate: { value: new THREE.Color('#3e444d') },
      uPaint: { value: new THREE.Color('#4a1614') },
      uVent: { value: new THREE.Color('#ff5a18').multiplyScalar(0.3) },
      uRimLight: { value: new THREE.Color('#9fdcff').multiplyScalar(3) },
      uRunLight: { value: new THREE.Color('#ff3020').multiplyScalar(3) },
      uBattle: { value: battle },
      uCalm: { value: 0.6 },
    },
  });
  group.add(hull.mesh);

  // the trench: two walls (planes in y/z) and a floor
  const trenchU = (kind) => ({
    uNoise: { value: ctx.noise },
    uScroll: { value: 0 },
    uTime: { value: 0 },
    uPlate: { value: new THREE.Color('#4a515c') },
    uStrip: { value: new THREE.Color('#5ec8ff').multiplyScalar(kind ? 1.0 : 0.7) },
    uKey: { value: key },
    uBattle: { value: battle },
    uTop: { value: HULL_Z },
    uBottom: { value: FLOOR_Z },
  });
  const wallU = trenchU(0);
  const floorU = trenchU(1);
  const wallMat = new THREE.ShaderMaterial({ uniforms: wallU, vertexShader: trenchVertex, fragmentShader: trenchFragment, defines: { KIND: 0 }, side: THREE.DoubleSide });
  const floorMat = new THREE.ShaderMaterial({ uniforms: floorU, vertexShader: trenchVertex, fragmentShader: trenchFragment, defines: { KIND: 1 } });
  const wallGeo = new THREE.PlaneGeometry(1, 1);
  const walls = [-1, 1].map((s) => {
    const m = new THREE.Mesh(wallGeo, wallMat);
    m.rotation.y = (s * Math.PI) / 2;
    m.frustumCulled = false;
    m.renderOrder = -6;
    group.add(m);
    return m;
  });
  const floorMesh = new THREE.Mesh(wallGeo, floorMat);
  floorMesh.frustumCulled = false;
  floorMesh.renderOrder = -7;
  group.add(floorMesh);

  // superstructure blocks on the deck
  const rand = mulberry32(77);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0, 0.5); // stands on its base
  const boxMat = new THREE.MeshStandardMaterial({ color: '#3d434b', metalness: 0.7, roughness: 0.42, envMapIntensity: 0.3 });
  patchStandard(boxMat, { haze: '#06070b', near: 30, far: 120, rim: '#ff7a48', rimAmt: 0.12, rimPower: 3, grit: ctx.noise, gritScale: 1.4, gritAmt: 0.7 });
  const blockItems = Array.from({ length: Math.round(46 * q.debris) }, (_, i) => {
    const big = rand() < 0.2;
    const h = big ? 0.8 + rand() * 1.0 : 0.25 + rand() * 0.5;
    return {
      side: i % 2 ? 1 : -1,
      u: rand(), // across the deck, 0 rim .. 1 edge
      y0: rand(),
      z: HULL_Z,
      speed: SPEED,
      scale: new THREE.Vector3(big ? 1.2 + rand() * 1.6 : 0.4 + rand() * 1.0, big ? 2 + rand() * 3.5 : 0.4 + rand() * 1.2, h),
      rot: new THREE.Euler(0, 0, 0),
      size: 2,
      ps: 0.6,
    };
  });
  const blocks = new THREE.InstancedMesh(boxGeo, boxMat, blockItems.length);
  const blockStream = new Stream(blocks, blockItems, { margin: 3 });
  group.add(blocks);

  // cross beams spanning the trench
  const beamGeo = new THREE.BoxGeometry(1, 0.7, 0.6);
  const beams = new THREE.InstancedMesh(beamGeo, boxMat, 2);
  const beamItems = [
    { x: 0, y0: 0.1, z: HULL_Z - 2.5, speed: SPEED, scale: new THREE.Vector3(1, 1, 1), rot: new THREE.Euler(), size: 2 },
    { x: 0, y0: 0.55, z: HULL_Z - 6, speed: SPEED, scale: new THREE.Vector3(1, 1.6, 1.2), rot: new THREE.Euler(), size: 2 },
  ];
  const beamStream = new Stream(beams, beamItems, { margin: 6 });
  group.add(beams);

  const env = envDome({
    base: '#06070b',
    up: '#2a303c',
    down: '#0a0808',
    lobes: [
      { dir: [0.45, 0.6, 0.66], color: '#e8eef8', power: 1.4, sharp: 7 },
      { dir: [-0.7, 0.3, 0.4], color: '#ff6a3a', power: 0.5, sharp: 3 },
      { dir: [0, -0.6, 0.6], color: '#4aa8e0', power: 0.4, sharp: 3 },
      { dir: [0, 0, 1], color: '#353b48', power: 0.4, sharp: 2 },
    ],
  });

  let dist = 27;
  let trench = 6;
  let outer = 20;
  let tScroll = 0;
  let portrait = false;
  let spaceV = { halfW: 300, halfH: 200 };
  const layout = (view) => {
    portrait = view.halfH > view.halfW;
    dist = view.dist;
    space.layout(view);
    hull.layout(view);
    const v = visibleAt(view.camera, view.dist, HULL_Z);
    spaceV = visibleAt(view.camera, view.dist, -650);
    trench = v.halfW * (portrait ? 0.4 : 0.33);
    outer = portrait ? v.halfW * 1.3 : v.halfW * 0.9;
    hull.uniforms.uTrench.value = trench;
    hull.uniforms.uOuter.value = outer;
    const len = v.halfH * 2.4;
    walls.forEach((m, i) => {
      m.position.set((i ? 1 : -1) * trench, 0, (HULL_Z + FLOOR_Z) / 2);
      m.scale.set(HULL_Z - FLOOR_Z, len * 1.6, 1);
    });
    floorMesh.position.set(0, 0, FLOOR_Z);
    floorMesh.scale.set(trench * 2.2, len * 2.2, 1);
    for (const it of blockItems) {
      // keep blocks on the deck, clear of the trench rim and the hull edge
      const x = trench + 1.2 + it.u * (Math.min(outer, v.halfW * 1.05) - trench - 2.4);
      it.x = it.side * x;
      it.z = HULL_Z;
    }
    for (const it of beamItems) it.scale.x = trench * 2.3;
    blockStream.layout(view);
    beamStream.layout(view);
  };

  const k0 = () => dist / (dist - HULL_Z);

  // distant battle: a seeded timeline of blasts in the space past the hull
  const battleCols = ['#ff8a3a', '#ffd27a', '#7ab8ff', '#ff5a4a'];
  const updateBattle = (t) => {
    let light = 0;
    battle.setRGB(0, 0, 0);
    for (let i = 0; i < BOOMS; i++) {
      const s = slot(t, 1.6 + i * 0.37, 90 + i);
      const r = s.r;
      const life = 1.2 + r() * 1.2;
      const k = s.age / life;
      const b = booms[i];
      if (s.age < 0 || k > 1) {
        b.w = -1;
        continue;
      }
      const sx = r() < 0.5 ? -1 : 1;
      b.set(sx * spaceV.halfW * (0.75 + r() * 0.45), (r() * 2 - 1) * spaceV.halfH * 0.8, spaceV.halfH * (0.05 + r() * 0.1), k);
      const c = battleCols[Math.floor(r() * battleCols.length)];
      boomCols[i].set(c);
      const f = Math.pow(1 - k, 4);
      light += f;
      battle.r += boomCols[i].r * f * 0.12;
      battle.g += boomCols[i].g * f * 0.12;
      battle.b += boomCols[i].b * f * 0.12;
    }
    return light;
  };

  return {
    id: 'dreadnought',
    accent: '#ff6a3a',
    group,
    envScene: env.scene,
    edges: () => {
      const e = trench * k0();
      return { left: -e, right: e };
    },
    light: {
      sunDir: key.clone(),
      sunColor: new THREE.Color('#e6ecf6'),
      sunIntensity: 2.5,
      skyColor: new THREE.Color('#4c5668'),
      groundColor: new THREE.Color('#140e0c'),
      hemiIntensity: 0.5,
      envIntensity: 0.95,
      exposure: 1.0,
      rimColor: new THREE.Color('#ff7a48'),
      rimIntensity: 1.5,
      bloom: 0.55,
    },
    layout,
    update(dt, t, view) {
      space.update(t);
      hull.update(t);
      tScroll = scrollAt(t, SPEED);
      wallU.uScroll.value = floorU.uScroll.value = tScroll;
      wallU.uTime.value = floorU.uTime.value = t;
      stars.update(t, view, ctx.renderer.getPixelRatio());
      blockStream.update(t);
      beamStream.update(t);
      updateBattle(t);
    },
    dispose() {
      group.removeFromParent();
      space.dispose();
      stars.dispose();
      hull.dispose();
      wallGeo.dispose();
      wallMat.dispose();
      floorMat.dispose();
      boxGeo.dispose();
      boxMat.dispose();
      blocks.dispose();
      beamGeo.dispose();
      beams.dispose();
      env.dispose();
    },
  };
}
