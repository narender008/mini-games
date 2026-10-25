// Dev harness for the Ace Pilot sectors (src/ace/sectors/). Renders one
// sector with the same camera, lights, environment map and post chain as
// src/main.js, plus grey stand-ins for the fighter and enemies and glowing
// bullets, to judge how readable the play field is.
//
//   ?sector=belt|storm|foundry|hive|dreadnought
//   ?t=12.5    render that moment once (stepped at fixed dt) and stop;
//              window.__ready turns true when the frame is on screen
//   ?bare      no stand-ins
//   ?edges     mark the side scenery edges the sector reports
//   ?quality=high|medium|low
// Without ?t it runs in real time.
import * as THREE from 'three';
import { QUERY, CELL, VIEW_ZOOM } from '../src/config.js';
import { detectQuality } from '../src/quality.js';
import { Post } from '../src/post.js';
import { createNoiseTexture, createSpriteAtlas, SPRITE } from '../src/textures.js';
import { SpriteBatch } from '../src/sprites.js';
import { loadSector } from '../src/ace/sectors/index.js';

const VFOV = 40;
const id = QUERY.get('sector') || 'belt';
const still = QUERY.has('t');
const T = Number(QUERY.get('t') || 0);

const canvas = document.getElementById('c');
const q = detectQuality();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(VFOV, 1.6, 0.5, 3000);
scene.add(camera);
const noise = createNoiseTexture();
const atlas = createSpriteAtlas();
const glow = new SpriteBatch(atlas, { capacity: 3000, blending: 'add', renderOrder: 20 });
const smoke = new SpriteBatch(atlas, { capacity: 1200, blending: 'alpha', renderOrder: 4 });
scene.add(glow.mesh, smoke.mesh);
const key = new THREE.DirectionalLight(0xffffff, 2.5);
const hemi = new THREE.HemisphereLight(0xbfe0ff, 0xf4efe6, 0.9);
const rim = new THREE.DirectionalLight(0xfff0d0, 1.2);
rim.position.set(-3, 4, -6);
scene.add(key, hemi, rim);
const post = new Post(renderer, scene, camera, q);

// the same field as App.resize
const w = innerWidth;
const h = innerHeight;
const dpr = Math.min(devicePixelRatio || 1, q.maxDpr);
const aspect = w / h;
const halfH = (Math.max(11, 7.4 / aspect) * CELL * VIEW_ZOOM) / 2;
const halfW = halfH * aspect;
const dist = halfH / Math.tan(THREE.MathUtils.degToRad(VFOV / 2));
camera.aspect = aspect;
camera.position.set(0, 0, dist);
camera.far = dist + 2000;
camera.updateProjectionMatrix();
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
renderer.setPixelRatio(dpr);
renderer.setSize(w, h, false);
post.setSize(w, h, dpr);
const view = { camera, dist, halfW, halfH };

const create = await loadSector(id);
const world = create({ noise, quality: q, renderer, atlas, glow, smoke });
world.layout(view);
const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(world.envScene, 0.02, 0.1, 2000);
pmrem.dispose();
scene.add(world.group);
scene.environment = envRT.texture;
const L = world.light;
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

// stand-ins: a gunmetal fighter, a few enemies, and bullets
const metal = new THREE.MeshStandardMaterial({ color: '#9aa3ad', metalness: 0.75, roughness: 0.32 });
const dark = new THREE.MeshStandardMaterial({ color: '#4a525c', metalness: 0.7, roughness: 0.4 });
const props = new THREE.Group();
function fighter() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.3, 0.3), metal);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.36, 0.08), metal);
  wing.position.y = -0.2;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.32), new THREE.MeshStandardMaterial({ color: '#c0262d', roughness: 0.4 }));
  g.add(body, wing, stripe);
  return g;
}
function enemy(s) {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 0.6 * s, 0.4 * s), dark);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.9 * s, 0.5 * s), metal);
  g.add(a, b);
  g.rotation.x = 0.3;
  return g;
}
const bullets = [];
if (!QUERY.has('bare')) {
  const f = fighter();
  f.position.set(0, -halfH * 0.72, 0);
  props.add(f);
  const ex = [-0.45, -0.15, 0.15, 0.45];
  ex.forEach((fx, i) => {
    const e = enemy(i % 2 ? 1.2 : 0.9);
    e.position.set(fx * halfW * 0.9, halfH * (0.55 - (i % 2) * 0.15), 0);
    props.add(e);
  });
  // a ring of magenta orbs, two lines of orange needles, the player's cyan shots
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    bullets.push({ x: -halfW * 0.35 + Math.cos(a) * 2.2, y: halfH * 0.1 + Math.sin(a) * 2.2, c: [3.2, 0.5, 2.6], s: 0.2 });
  }
  for (let i = 0; i < 9; i++) {
    bullets.push({ x: halfW * 0.25 + i * 0.35, y: halfH * 0.2 - i * 0.9, c: [3.2, 1.4, 0.3], s: 0.14, needle: true });
    bullets.push({ x: halfW * 0.1 + i * 0.25, y: halfH * 0.3 - i * 1.0, c: [3.2, 1.4, 0.3], s: 0.14, needle: true });
  }
  for (let i = 0; i < 10; i++) bullets.push({ x: (i % 2 ? 0.15 : -0.15), y: -halfH * 0.6 + i * 1.3, c: [0.4, 2.4, 3.2], s: 0.1, needle: true });
  bullets.push({ x: -halfW * 0.05, y: -halfH * 0.15, c: [3.2, 0.9, 0.4], s: 0.45 });
  bullets.push({ x: halfW * 0.5, y: -halfH * 0.35, c: [3.2, 0.9, 0.4], s: 0.45 });
  const geo = new THREE.SphereGeometry(1, 12, 8);
  for (const b of bullets) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(b.c[0] * 0.6 + 0.6, b.c[1] * 0.6 + 0.6, b.c[2] * 0.6 + 0.6) }));
    m.position.set(b.x, b.y, 0.2);
    m.scale.set(b.s, b.needle ? b.s * 2.6 : b.s, b.s);
    props.add(m);
  }
}
scene.add(props);

// marks where the sector says its side scenery starts (after time is set)
function drawEdges() {
  if (!QUERY.has('edges') || !world.edges) return;
  const pts = [];
  for (let y = -halfH; y <= halfH; y += 0.25) {
    const e = world.edges(y);
    if (e) pts.push(new THREE.Vector3(e.left, y, 0.3), new THREE.Vector3(e.right, y, 0.3));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#00ff66', size: 4, sizeAttenuation: false })));
}

function decorate() {
  for (const b of bullets) {
    smoke.add({ x: b.x, y: b.y, z: 0.1, size: b.s * 4.5, life: 0, frame: SPRITE.GLOW, r: 0, g: 0, b: 0, a: 0.55 });
    glow.add({ x: b.x, y: b.y, z: 0.25, size: b.s * 5, h: b.needle ? 1.8 : 1, life: 0, frame: SPRITE.GLOW, r: b.c[0], g: b.c[1], b: b.c[2], a: 0.9 });
  }
}

function frame(dt, t) {
  world.update(dt, t, view);
  if (world.flash !== undefined) post.wash(world.flash * 0.18, '#eef3ff');
  glow.update(dt);
  smoke.update(dt);
  post.update(dt);
}

const info = document.getElementById('info');
info.textContent = `${id}  ${halfW.toFixed(2)} x ${halfH.toFixed(2)}`;
if (still) {
  const dt = 1 / 30;
  let t = Math.max(0, T - 3);
  frame(0, t);
  while (t < T - 1e-6) {
    const d = Math.min(dt, T - t);
    t += d;
    if (t >= T - 1e-6) decorate();
    frame(d, t);
  }
  if (T === 0) {
    decorate();
    frame(0, 0);
  }
  drawEdges();
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  post.render();
  requestAnimationFrame(() => {
    window.__ready = true;
  });
} else {
  let last = performance.now();
  let t = 0;
  let frames = 0;
  let acc = 0;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    decorate();
    frame(dt, t);
    post.render();
    frames++;
    acc += dt;
    if (acc > 1) {
      info.textContent = `${id}  ${halfW.toFixed(2)} x ${halfH.toFixed(2)}  ${Math.round(frames / acc)} fps  ${renderer.info.render.calls} calls`;
      frames = 0;
      acc = 0;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
window.__world = world;
window.__view = view;
window.__render = () => post.render();
window.__scene = scene;
