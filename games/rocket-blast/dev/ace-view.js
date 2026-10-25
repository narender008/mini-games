// Dev harness for the Ace Pilot view (src/ace/view): a renderer, camera,
// lights and post set up like main.js, and a small fake sim that fills the
// state contract from the build brief (every enemy type, all bullet kinds,
// player shots, pickups, a boss of each kind with moving parts, and a stream
// of events), so the models and effects can be judged without the real sim.
//
// ?scene=sim drives the view with the real sim instead (src/ace/sim:
// createAce + stepAce + autopilot, god mode, upgrades picked by
// autopilotPick): ?sector=<id> picks the sector and backdrop, ?wave=N the
// starting wave, ?fight starts at the boss, ?seed=N.
//
// Time only moves through advance(seconds, step), in fixed steps, so a
// headless capture at a given time is always the same picture.
import * as THREE from 'three';
import { Post } from '../src/post.js';
import { createNoiseTexture, createSpriteAtlas, mulberry32 } from '../src/textures.js';
import { SpriteBatch } from '../src/sprites.js';
import { AceView } from '../src/ace/view/index.js';
import { createAce, stepAce, setField, autopilot, autopilotPick, chooseUpgrade, SECTORS } from '../src/ace/sim/index.js';

// part layouts copied from src/ace/sim/bosses.js: [id, kind, ox, oy, r]
const BOSS_LAYOUT = {
  hauler: [['armL', 'drill', -3.4, -0.4, 0.95], ['armR', 'drill', 3.4, -0.4, 0.95], ['core', 'core', 0, -0.2, 1.25]],
  tempest: [['pyL', 'pylon', -4.4, -0.6, 0.95], ['pyC', 'pylon', 0, -1.6, 0.95], ['pyR', 'pylon', 4.4, -0.6, 0.95], ['coil', 'coil', 0, 0.9, 1.35]],
  crusher: [['t1', 'turret', -3.0, 1.0, 0.8], ['t2', 'turret', 3.0, 1.0, 0.8], ['t3', 'turret', -1.75, -1.35, 0.8], ['t4', 'turret', 1.75, -1.35, 0.8], ['core', 'core', 0, 0.15, 1.5], ['jawL', 'jaw', -4.7, -3.0, 1.25], ['jawR', 'jaw', 4.7, -3.0, 1.25]],
  brood: [['podL', 'pod', -3.5, -0.5, 0.95], ['podR', 'pod', 3.5, -0.5, 0.95], ['podC', 'pod', 0, -1.9, 0.95], ['core', 'core', 0, 0.6, 1.45]],
  dreadnought: [['b1', 'battery', -4.6, -0.9, 0.85], ['b2', 'battery', -2.6, -1.7, 0.85], ['b3', 'battery', 2.6, -1.7, 0.85], ['b4', 'battery', 4.6, -0.9, 0.85], ['rackL', 'rack', -3.4, 0.8, 1.0], ['rackR', 'rack', 3.4, 0.8, 1.0], ['cannon', 'cannon', 0, -1.3, 1.25], ['core', 'core', 0, 0.7, 1.45]],
};

const Q = new URLSearchParams(location.search);
const SCENE = Q.get('scene') || 'wave';
const BOSS = Q.get('boss') || 'crusher';
const VFOV = 40;
const VIEW_ZOOM = 1.8;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(VFOV, 1.6, 0.5, 3000);
scene.add(camera);
const quality = { tier: 'high', maxDpr: 1, msaa: Number(Q.get('msaa') ?? 0), debris: 1 };
const noise = createNoiseTexture();
const atlas = createSpriteAtlas();
const glow = new SpriteBatch(atlas, { capacity: 3000, blending: 'add', renderOrder: 20 });
const smoke = new SpriteBatch(atlas, { capacity: 1200, blending: 'alpha', renderOrder: 4 });
scene.add(glow.mesh, smoke.mesh);
const key = new THREE.DirectionalLight(0xdfe8ff, 2.6);
key.position.set(5, 8, 14);
const hemi = new THREE.HemisphereLight(0x8fb4ff, 0x1a1420, 0.8);
const rim = new THREE.DirectionalLight(0xffc890, 1.4);
rim.position.set(-6, 6, -4);
scene.add(key, hemi, rim);
const post = new Post(renderer, scene, camera, quality);

// ------------------------------------------------------------ field
let field;
let view;
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  const aspect = w / h;
  const cellsH = Math.max(11, 7.4 / aspect) * VIEW_ZOOM;
  const halfH = cellsH / 2;
  const halfW = halfH * aspect;
  const dist = halfH / Math.tan(THREE.MathUtils.degToRad(VFOV / 2));
  field = { halfW, halfH };
  camera.aspect = aspect;
  // ?zoom=N&focus=x,y: a close look at the models (field stays the same)
  const [fx, fy] = (Q.get('focus') || '0,0').split(',').map(Number);
  camera.position.set(fx, fy, dist / Number(Q.get('zoom') || 1));
  camera.far = dist + 2000;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  post.setSize(w, h, 1);
  view = { camera, dist, halfW, halfH };
  if (backdrop) backdrop.layout?.(view);
}

// ------------------------------------------------------------ backdrop
let backdrop = null;

function simpleBackdrop(kind) {
  // a dark starfield (or bright lava stripes to test bullet contrast)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLava: { value: kind === 'lava' ? 1 : 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uLava; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 p = vP + vec2(0.0, uTime * 3.0);
        vec3 c = mix(vec3(0.015,0.03,0.06), vec3(0.03,0.07,0.11), smoothstep(-40.0, 40.0, vP.y));
        c += vec3(0.05,0.02,0.09) * smoothstep(0.3, 1.0, sin(p.x*0.05)*sin(p.y*0.04));
        vec2 g = floor(p * 0.6); float s = step(0.985, h(g)) * smoothstep(0.25, 0.0, length(fract(p * 0.6) - 0.5)); c += vec3(0.8,0.9,1.0) * s * h(g+1.0);
        if (uLava > 0.5) {
          float band = smoothstep(0.15, 0.0, abs(fract(vP.x * 0.03 + sin(p.y*0.05)*0.05) - 0.5) - 0.12);
          c = mix(c, vec3(1.0,0.45,0.08) * 1.1, band);
          c = mix(c, vec3(0.55,0.56,0.6), step(0.5, fract(p.y * 0.02 + floor(vP.x*0.02)*0.3)) * (1.0-band) * 0.6);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(400, 260), mat);
  plane.position.z = -40;
  const group = new THREE.Group();
  group.add(plane);
  // environment for the metal: a navy studio with a few bright soft boxes
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: 0x0b1424, side: THREE.BackSide })));
  for (const [x, y, z, c, s] of [
    [20, 30, 5, 0x8fa4cf, 16],
    [-30, 10, 10, 0x406080, 18],
    [0, -30, 20, 0x302028, 30],
    [10, 5, -40, 0xffd0a0, 14],
  ]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  }
  return {
    group,
    envScene: env,
    light: null,
    update: (dt, t) => (mat.uniforms.uTime.value = t),
    layout: () => {},
  };
}

async function loadBackdrop() {
  const id = Q.get('sector');
  if (id) {
    try {
      const { loadSector } = await import('../src/ace/sectors/index.js');
      const create = await loadSector(id);
      return create({ noise, quality, renderer, atlas, glow, smoke });
    } catch (err) {
      console.warn('sector failed, using the plain backdrop', err);
    }
  }
  return simpleBackdrop(Q.get('bg') || 'dark');
}

// ------------------------------------------------------------ fake sim
const rnd = mulberry32(Number(Q.get('seed') || 7));
const R = (a, b) => a + rnd() * (b - a);
let S;
let nextId = 1;
const emitters = [];

function makeSim() {
  const id = Q.get('sector') || 'belt';
  const sector = Math.max(1, SECTORS.findIndex((d) => d.id === id) + 1);
  S = createAce({ seed: Number(Q.get('seed') || 3), sector, field: { halfW: field.halfW, halfH: field.halfH }, wave: Number(Q.get('wave') || 1), boss: Q.has('fight'), god: true });
}

function simStep(dt) {
  if (S.phase === 'upgrade' && S.offer) chooseUpgrade(S, autopilotPick(S));
  stepAce(S, autopilot(S), dt);
}

function makeState() {
  if (SCENE === 'sim') return makeSim();
  const f = field;
  S = {
    phase: SCENE === 'boss' ? 'boss' : 'wave',
    time: 0,
    sector: 1,
    wave: 3,
    waves: 8,
    field: f,
    player: { x: 0, y: -f.halfH * 0.62, vx: 0, vy: 0, r: 0.16, hull: 3, hullMax: 3, shield: 1, shields: 1, invuln: 0, emp: 2, drones: [], firing: true, dead: false },
    enemies: [],
    bullets: [],
    shots: [],
    pickups: [],
    boss: null,
    events: [],
    score: 0,
    chain: 6,
  };
  if (Q.has('drones') || SCENE !== 'fx') S.player.drones = [{ x: -1, y: S.player.y - 0.3 }, { x: 1, y: S.player.y - 0.3 }];
  if (SCENE === 'wave') waveScene();
  if (SCENE === 'boss' || SCENE === 'fx') bossScene(SCENE === 'fx' ? 'crusher' : BOSS);
  if (SCENE === 'bullets') bulletScene();
  if (SCENE === 'gallery') galleryScene();
}

// every model in a grid, still, for close looks (?zoom=2)
function galleryScene() {
  const types = ['dart', 'gunship', 'diver', 'bulwark', 'minelayer', 'mine', 'splitter', 'shard', 'sniper', 'turret'];
  types.forEach((type, i) => {
    const x = -8 + (i % 5) * 4;
    const y = i < 5 ? 3 : -1;
    const e = enemy(type, x, y, { move: type === 'turret' ? 'turret' : 'still' });
    if (type === 'bulwark') e.shield = { angle: -Math.PI / 2, arc: 2.2, hp: 20, maxHp: 26 };
    if (type === 'mine') e.armed = true;
  });
  S.player.y = -5;
  S.player.drones.length = 0;
  for (const [k, x] of [['score', -3], ['shield', -1], ['emp', 1], ['hull', 3]]) S.pickups.push({ id: nextId++, kind: k, x, y: -3.5, t: 1 });
}

function enemy(type, x, y, extra = {}) {
  const r = { dart: 0.48, gunship: 0.8, diver: 0.5, bulwark: 0.85, minelayer: 0.75, mine: 0.36, splitter: 0.8, shard: 0.34, sniper: 0.58, turret: 0.62 }[type];
  const e = { id: nextId++, type, x, y, x0: x, y0: y, vx: 0, vy: 0, angle: -Math.PI / 2, hp: 10, maxHp: 10, r, t: R(1, 3), hitT: 9, shield: null, tele: null, ...extra };
  S.enemies.push(e);
  return e;
}

function waveScene() {
  const W = field.halfW;
  const H = field.halfH;
  // two V formations of darts
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const k = i - 2;
      enemy('dart', side * W * 0.55 + k * 1.1, H * 0.6 - Math.abs(k) * 0.7, { move: 'weave', phase: side });
    }
  }
  const g = enemy('gunship', W * 0.12, H * 0.62, { move: 'hover' });
  emitters.push({ src: g, kind: 'needle', color: 'orange', every: 0.12, burst: 5, rest: 0.9, speed: 8, aim: true, acc: 0, n: 0 });
  enemy('diver', -W * 0.18, H * 0.25, { move: 'lock' });
  enemy('diver', W * 0.36, H * 0.05, { move: 'dive' });
  for (let i = 0; i < 3; i++) {
    const b = enemy('bulwark', (i - 1) * 3.4, H * 0.28, { move: 'hover', shield: { angle: -Math.PI / 2, arc: 2.2, hp: 20, maxHp: 26 } });
    if (i === 1) emitters.push({ src: b, kind: 'ball', color: 'red', every: 1.4, ring: 10, speed: 3.2, acc: 0.4 });
  }
  enemy('minelayer', W * 0.58, H * 0.2, { move: 'drift' });
  enemy('mine', W * 0.48, -H * 0.05, { armed: true, burstR: 2.2 });
  enemy('mine', W * 0.68, -H * 0.12);
  enemy('splitter', -W * 0.55, H * 0.0, { move: 'drift' });
  for (let i = 0; i < 3; i++) enemy('shard', -W * 0.42 + i * 0.7, -H * 0.18 - i * 0.3, { move: 'drift' });
  enemy('sniper', W * 0.78, H * 0.7, { move: 'snipe' });
  enemy('turret', -W * 0.93, -H * 0.05, { move: 'turret' });
  enemy('turret', W * 0.93, H * 0.35, { move: 'turret' });
  // dart fans
  if (Q.has('calm')) return;
  for (const e of S.enemies.filter((e) => e.type === 'dart' && e.id % 2)) emitters.push({ src: e, kind: 'orb', color: 'magenta', every: 1.6, fan: 3, speed: 4.5, acc: R(0, 1.6) });
  // a spiral to fill the screen
  emitters.push({ src: { x: 0, y: H * 0.8 }, kind: 'orb', color: 'magenta', every: 0.16, spiral: 3, speed: 3.6, acc: 0, a: 0 });
  for (const [k, x, y] of [
    ['score', -2, -1],
    ['shield', 3, -2],
    ['emp', -5, -3],
    ['hull', 5.5, -4],
  ])
    S.pickups.push({ id: nextId++, kind: k, x, y, t: 1 });
}

function bossScene(type) {
  const H = field.halfH;
  const layout = BOSS_LAYOUT[type];
  // as the sim: scale with the field width, sit near the top
  const scale = Math.min(1, Math.max(0.6, field.halfW / 11));
  const by = H - 3.4 * scale - 0.6;
  S.boss = {
    type,
    name: type,
    x: 0,
    y: by,
    hp: 1000,
    maxHp: 1000,
    phase: 1,
    phases: 3,
    t: 0,
    scale,
    state: 'fight',
    parts: layout.map(([id, kind, ox, oy, r]) => ({ id, kind, x: ox * scale, y: by + oy * scale, ox, oy, r: r * scale, hp: 50, maxHp: 50, dead: false, open: false, hitT: 9, ang: -Math.PI / 2 })),
  };
  if (type === 'tempest') S.boss.links = [['pyL', 'pyC'], ['pyC', 'pyR']].map(([a, b]) => ({ a, b, bullet: null }));
  const dead = Number(Q.get('dead') ?? 1);
  if (dead >= 0 && S.boss.parts[dead]) S.boss.parts[dead].dead = true;
  if (Q.has('open')) for (const p of S.boss.parts) p.open = true;
  const B = S.boss;
  if (Q.has('calm')) return;
  emitters.push({ src: B, kind: 'orb', color: 'orange', every: 0.12, spiral: 4, speed: 4, acc: 0, a: 0, oy: -0.5 });
  emitters.push({ src: B, kind: 'orb', color: 'magenta', every: 1.1, ring: 18, speed: 3, acc: 0.5 });
  for (const p of B.parts) if (['turret', 'battery'].includes(p.kind) && !p.dead) emitters.push({ src: p, kind: 'needle', color: 'orange', every: 0.14, burst: 4, rest: 1.2, speed: 8, aim: true, acc: R(0, 1), n: 0 });
  const beamer = B.parts.find((p) => ['cannon', 'coil'].includes(p.kind) && !p.dead);
  if (beamer) beamer.beam = { cycle: 2.6, tele: 1.2, life: 0.6 };
}

function bulletScene() {
  const H = field.halfH;
  const W = field.halfW;
  for (let i = 0; i < 4; i++) emitters.push({ src: { x: -W * 0.6 + i * W * 0.4, y: H * 0.7 }, kind: i % 2 ? 'orb' : 'needle', color: ['magenta', 'orange', 'cyan', 'green'][i], every: 0.05, spiral: 5, speed: 3 + i * 0.4, acc: 0, a: i });
  emitters.push({ src: { x: 0, y: H * 0.85 }, kind: 'ball', color: 'red', every: 0.5, ring: 16, speed: 2.5, acc: 0 });
}

function shoot(x, y, ang, speed, kind, color) {
  if (S.bullets.length >= 900) return;
  S.bullets.push({ id: nextId++, x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: { orb: 0.2, needle: 0.14, ball: 0.34 }[kind] || 0.2, kind, color, t: 0 });
}

function fakeStep(dt) {
  const T = (S.time += dt);
  const P = S.player;
  const W = field.halfW;
  const H = field.halfH;
  // the player weaves along the bottom
  const px = SCENE === 'gallery' ? 0 : Math.sin(T * 0.7) * W * 0.25;
  P.vx = (px - P.x) / dt;
  P.x = px;
  P.vy = 0;
  if (P.drones.length) {
    P.drones[0].x += (P.x - 1.05 - P.drones[0].x) * Math.min(1, dt * 10);
    P.drones[1].x += (P.x + 1.05 - P.drones[1].x) * Math.min(1, dt * 10);
    for (const d of P.drones) d.y = P.y - 0.25;
  }
  // enemies
  for (const e of S.enemies) {
    e.t += dt;
    e.hitT += dt;
    const ox = e.x;
    const oy = e.y;
    if (e.move === 'weave') {
      e.x = e.x0 + Math.sin(T * 1.2 + e.phase) * 1.2;
      e.y = e.y0 + Math.sin(T * 0.9) * 0.4;
    } else if (e.move === 'hover') {
      e.x = e.x0 + Math.sin(T * 0.6 + e.id) * 0.6;
      e.y = e.y0 + Math.cos(T * 0.8 + e.id) * 0.2;
    } else if (e.move === 'drift') {
      e.x = e.x0 + Math.sin(T * 0.5 + e.id) * 1.2;
      e.y = e.y0 + Math.cos(T * 0.4 + e.id) * 0.5;
      e.angle += dt * (e.type === 'mine' ? 1.5 : 0.7);
    } else if (e.move === 'dive') {
      const k = (T * 0.5 + 0.3) % 1;
      e.x = e.x0 - k * 6;
      e.y = e.y0 + 6 - k * 18;
    } else if (e.move === 'lock') {
      const k = (T / 1.5) % 1;
      e.tele = { x0: e.x, y0: e.y, x1: P.x, y1: P.y, k };
    } else if (e.move === 'snipe') {
      const k = (T / 2) % 1;
      e.tele = k < 0.8 ? { x0: e.x, y0: e.y, x1: e.x + (P.x - e.x) * 4, y1: e.y + (P.y - e.y) * 4, k: k / 0.8 } : null;
      e.angle = Math.atan2(P.y - e.y, P.x - e.x);
      if (k >= 0.8 && !e.fired) {
        e.fired = true;
        S.bullets.push({ id: nextId++, x: e.x, y: e.y, x1: e.x + (P.x - e.x) * 4, y1: e.y + (P.y - e.y) * 4, vx: 0, vy: 0, r: 0.22, kind: 'beam', color: 'red', t: 0, life: 0.35 });
      }
      if (k < 0.8) e.fired = false;
    } else if (e.move === 'turret') {
      e.angle = Math.atan2(P.y - e.y, P.x - e.x);
    }
    if (e.move !== 'turret' && e.move !== 'snipe' && e.move !== 'drift') {
      e.vx = (e.x - ox) / dt;
      e.vy = (e.y - oy) / dt;
      if (e.type !== 'gunship' && e.type !== 'bulwark') e.angle = Math.hypot(e.vx, e.vy) > 2 ? Math.atan2(e.vy, e.vx) : -Math.PI / 2;
    }
    if (e.type === 'gunship') e.angle = Math.atan2(P.y - e.y, P.x - e.x);
  }
  // boss
  const B = S.boss;
  if (B) {
    B.t += dt;
    const k = B.scale;
    B.x = Math.sin(T * 0.3) * 1.2 * k;
    for (const p of B.parts) {
      const hx = B.x + p.ox * k;
      const hy = B.y + p.oy * k;
      p.x = hx;
      p.y = hy;
      if (p.kind === 'drill') {
        // as the sim: swing on an arm from the shoulder
        const side = Math.sign(p.ox);
        const a = -Math.PI / 2 + side * 0.42 - side * 0.5 * Math.sin(T * 1.3);
        p.px = hx;
        p.py = hy;
        p.ang = a;
        p.x = hx + Math.cos(a) * 3.4 * k;
        p.y = hy + Math.sin(a) * 3.4 * k;
      } else if (p.kind === 'jaw' || p.kind === 'pylon') {
        // drop toward the player now and then
        const low = P.y + 2.2;
        const d = Math.max(0, Math.sin(T * 1.1 + (p.ox > 0 ? 2 : 0))) ** 4;
        p.y = hy + (low - hy) * d;
      }
      if (['turret', 'battery', 'cannon'].includes(p.kind)) p.ang = Math.atan2(P.y - p.y, P.x - p.x);
      p.hitT += dt;
      if (p.beam && !p.dead) {
        const k = (T % p.beam.cycle) / p.beam.cycle;
        const tl = p.beam.tele / p.beam.cycle;
        const aim = -Math.PI / 2 + Math.sin(T * 0.5) * 0.3;
        if (k < tl) {
          p.tele = { x0: p.x, y0: p.y - (p.kind === 'cannon' ? 2 : 0), x1: p.x + Math.cos(aim) * 40, y1: p.y + Math.sin(aim) * 40, k: k / tl };
          p.fired = false;
        } else {
          p.tele = null;
          if (!p.fired) {
            p.fired = true;
            S.bullets.push({ id: nextId++, x: p.x, y: p.y - (p.kind === 'cannon' ? 2 : 0), x1: p.x + Math.cos(aim) * 40, y1: p.y + Math.sin(aim) * 40, vx: 0, vy: 0, r: 0.3, kind: 'beam', color: p.kind === 'pylon' ? 'cyan' : 'red', t: 0, life: p.beam.life });
            S.events.push({ type: 'enemyFire', x: p.x, y: p.y - 2, kind: 'beam' });
          }
        }
      }
    }
  }
  // tempest: standing lightning links between live pylons
  if (B && B.links) {
    for (const L of B.links) {
      const a = B.parts.find((p) => p.id === L.a);
      const b = B.parts.find((p) => p.id === L.b);
      const live = !a.dead && !b.dead && !S.noFire;
      if (live && !L.bullet) S.bullets.push((L.bullet = { id: -1, x: 0, y: 0, x1: 0, y1: 0, vx: 0, vy: 0, r: 0.2, kind: 'beam', color: 'cyan', t: 0, life: 1e9, link: true }));
      if (!live && L.bullet) L.bullet = (L.bullet.life = 0) || null;
      if (L.bullet) Object.assign(L.bullet, { x: a.x, y: a.y, x1: b.x, y1: b.y });
    }
  }
  // emitters
  for (const em of emitters) {
    const src = em.src;
    if (src.dead || S.noFire) continue;
    em.acc += dt;
    const x = src.x + (em.ox || 0);
    const y = src.y + (em.oy || 0);
    if (em.burst) {
      const period = em.burst * em.every + em.rest;
      const ph = em.acc % period;
      const shot = Math.floor(ph / em.every);
      if (shot < em.burst && shot !== em.last) {
        em.last = shot;
        shoot(x, y - 0.4, Math.atan2(P.y - y, P.x - x), em.speed, em.kind, em.color);
        if (shot === 0) S.events.push({ type: 'enemyFire', x, y: y - 0.4, kind: em.kind });
      } else if (shot >= em.burst) em.last = -1;
      continue;
    }
    while (em.acc >= em.every) {
      em.acc -= em.every;
      if (em.spiral) {
        for (let k = 0; k < em.spiral; k++) shoot(x, y, em.a + (k / em.spiral) * Math.PI * 2, em.speed, em.kind, em.color);
        em.a += 0.23;
      } else if (em.ring) {
        for (let k = 0; k < em.ring; k++) shoot(x, y, (k / em.ring) * Math.PI * 2 + T, em.speed, em.kind, em.color);
        S.events.push({ type: 'enemyFire', x, y, kind: em.kind });
      } else if (em.fan) {
        const a = Math.atan2(P.y - y, P.x - x);
        for (let k = 0; k < em.fan; k++) shoot(x, y, a + (k - (em.fan - 1) / 2) * 0.25, em.speed, em.kind, em.color);
      }
    }
  }
  // bullets
  let j = 0;
  for (const b of S.bullets) {
    b.t += dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.kind === 'beam' ? b.t < b.life : Math.abs(b.x) < W + 2 && Math.abs(b.y) < H + 2) S.bullets[j++] = b;
    // grazes near the player now and then
    if (b.kind !== 'beam' && !b.grazed && Math.hypot(b.x - P.x, b.y - P.y) < 0.7) {
      b.grazed = true;
      S.events.push({ type: 'graze', x: b.x, y: b.y });
    }
  }
  S.bullets.length = j;
  // player shots
  if (SCENE === 'gallery') return script(T, dt);
  P.fireAcc = (P.fireAcc || 0) + dt;
  while (P.fireAcc > 0.075) {
    P.fireAcc -= 0.075;
    const pierce = Q.has('pierce');
    for (const s of [-1, 1]) S.shots.push({ x: P.x + s * 0.2, y: P.y + 0.6, vx: 0, vy: 26, kind: pierce ? 'pierce' : 'cannon', t: 0 });
    S.events.push({ type: 'fire', x: P.x, y: P.y + 0.6, kind: 'cannon' });
    for (const d of P.drones) S.shots.push({ x: d.x, y: d.y + 0.2, vx: 0, vy: 22, kind: 'drone', t: 0 });
    if ((P.n = (P.n || 0) + 1) % 4 === 0) {
      S.shots.push({ x: P.x - 0.5, y: P.y, vx: -6, vy: 10, kind: 'spread', t: 0 });
      S.shots.push({ x: P.x + 0.5, y: P.y, vx: 6, vy: 10, kind: 'spread', t: 0 });
    }
    if (P.n % 12 === 0) S.shots.push({ x: P.x, y: P.y, vx: R(-6, 6), vy: 8, kind: 'missile', t: 0 });
  }
  j = 0;
  for (const s of S.shots) {
    s.t += dt;
    if (s.kind === 'missile') {
      s.vx *= Math.exp(-dt * 2);
      s.vy += dt * 20;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    // shots stop at the first enemy they reach (a hit)
    let hit = null;
    for (const e of S.enemies) if (Math.abs(e.x - s.x) < e.r && Math.abs(e.y - s.y) < e.r) hit = e;
    if (B) for (const p of B.parts) if (!p.dead && Math.abs(p.x - s.x) < 0.7 && Math.abs(p.y - s.y) < 0.7) hit = p;
    if (hit) {
      hit.hitT = 0;
      if (hit.hp !== undefined && hit.kind) hit.hp = Math.max(1, hit.hp - 0.05);
      if (B) B.hp -= 0.2;
      if (Q.has('calm')) hit.hitT = 9;
      if (rnd() < 0.3) S.events.push({ type: 'hit', x: s.x, y: s.y });
      continue;
    }
    if (s.y < H + 1 && Math.abs(s.x) < W + 1) S.shots[j++] = s;
  }
  S.shots.length = j;
  for (const p of S.pickups) p.t += dt;
  // scripted events
  script(T, dt);
}

// one-off events at set times (and a steady trickle of kills in waves)
const fired = new Set();
function at(time, T, dt, fn, id) {
  if (T >= time && T - dt < time && !fired.has(id)) {
    fired.add(id);
    fn();
  }
}
function script(T, dt) {
  const P = S.player;
  if (SCENE === 'wave' && !Q.has('calm')) {
    // an explosion where an enemy is, every 0.9 s
    const k = Math.floor(T / 0.9);
    if (k !== S.lastKill) {
      S.lastKill = k;
      const list = S.enemies.filter((e) => e.type !== 'turret');
      const e = list[(k * 7) % list.length];
      S.events.push({ type: 'kill', x: e.x, y: e.y, enemy: e.type, big: ['gunship', 'bulwark', 'minelayer', 'splitter'].includes(e.type) });
    }
  }
  if (SCENE === 'fx') {
    at(0.3, T, dt, () => S.events.push({ type: 'kill', x: -8, y: 3, enemy: 'gunship', big: true }), 1);
    at(0.5, T, dt, () => S.events.push({ type: 'kill', x: 8, y: 2, enemy: 'dart' }), 2);
    at(0.7, T, dt, () => S.events.push({ type: 'partDestroyed', x: S.boss.parts[0].x, y: S.boss.parts[0].y }), 3);
    at(0.9, T, dt, () => S.events.push({ type: 'shieldHit', x: P.x, y: P.y }), 4);
    at(1.0, T, dt, () => S.events.push({ type: 'emp', x: P.x, y: P.y }), 5);
    at(1.3, T, dt, () => {
      S.events.push({ type: 'bossDead', x: S.boss.x, y: S.boss.y });
    }, 6);
    at(1.32, T, dt, () => {
      S.boss.dead = true;
      S.noFire = true;
      S.boss = null;
    }, 7);
  }
}

// ------------------------------------------------------------ run
let time = 0;
function step(dt) {
  if (SCENE === 'sim') simStep(dt);
  else fakeStep(dt);
  aceView.sync(S, dt, time);
  for (const ev of S.events) aceView.onEvent(ev, S);
  S.events.length = 0;
  backdrop.update?.(dt, time, view);
  glow.update(dt);
  smoke.update(dt);
  post.update(dt);
  time += dt;
}

let aceView;
async function main() {
  resize();
  backdrop = await loadBackdrop();
  backdrop.layout?.(view);
  scene.add(backdrop.group);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(backdrop.envScene, 0.02, 0.1, 2000).texture;
  pmrem.dispose();
  const L = backdrop.light;
  if (L) {
    scene.environmentIntensity = L.envIntensity ?? 1;
    key.color.copy(L.sunColor);
    key.intensity = L.sunIntensity;
    key.position.copy(L.sunDir).multiplyScalar(20);
    hemi.color.copy(L.skyColor);
    hemi.groundColor.copy(L.groundColor);
    hemi.intensity = L.hemiIntensity;
    rim.color.copy(L.rimColor ?? L.sunColor);
    rim.intensity = L.rimIntensity ?? 1;
    renderer.toneMappingExposure = L.exposure ?? 1;
    post.bloomBase = L.bloom ?? 0.42;
  }
  aceView = new AceView({ scene, glow, smoke, noise, atlas, quality });
  makeState();
  const advance = (seconds, dt = 1 / 60) => {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) step(dt);
  };
  const render = () => post.render();
  window.__av = { advance, render, get S() { return S; }, view: aceView, renderer };
  advance(Number(Q.get('t') ?? 2));
  for (const h of (Q.get('hide') || '').split(',')) {
    if (h === 'smoke') smoke.mesh.visible = false;
    if (h === 'glow') glow.mesh.visible = false;
    if (h === 'under') aceView.under.mesh.visible = false;
    if (h === 'over') aceView.over.mesh.visible = false;
    if (h === 'bg') backdrop.group.visible = false;
  }
  renderer.render(scene, camera);
  const calls = renderer.info.render.calls;
  render();
  document.getElementById('info').textContent = `${SCENE}${SCENE === 'boss' ? ' ' + BOSS : ''}${SCENE === 'sim' ? ` ${S.phase} w${S.wave}${S.boss ? ' ' + S.boss.type : ''} · enemies ${S.enemies.length} · teles ${S.teles.length}` : ''} · calls ${calls} · bullets ${S.bullets.length}`;
  window.__av.ready = true;
  if (!Q.has('still')) {
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
addEventListener('resize', resize);
main();
