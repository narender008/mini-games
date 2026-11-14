// Bubble Sub: a submarine game for toddlers. Touch anywhere and the shiny
// yellow sub glides there; tap a sea friend and it squishes and giggles and
// joins the friend shelf; drive through pearls; find the treasure in the dark
// Glow Cave with the headlight. Ten friends on the shelf throw a party. No
// text in play, nothing to lose, no timer.
//
// Modules: sim.js (rules, Node-testable), art.js (sub and creatures, from the
// approved concept), reef.js and paint.js (painted pieces), scenery.js (baked
// backdrop layers), audio.js (Web Audio engine, voices and music), draw.js
// (helpers). The world is in units (sim.js); U is CSS px per unit.
//
// URL switches: ?play starts straight into a game, ?x=N starts the sub at
// world x, ?seed=N, ?cover hides the buttons and shelf, ?quality=low draws at
// 1x, ?debug exposes window.__bs (see the end of this file).
import { use, setUnit, setArea, TAU, lerp, clamp, rgba, mix, glow, sparkle, sticker, rng } from './draw.js';
import * as Art from './art.js';
import { bubble } from './paint.js';
import * as Scene from './scenery.js';
import * as S from './sim.js';
import * as A from './audio.js';

const P = new URLSearchParams(location.search);
const DEBUG = P.has('debug');
const COVER = P.has('cover');
if (COVER) document.body.classList.add('cover');
const canvas = document.getElementById('scene');
const g = canvas.getContext('2d');

let L = null;                        // layout: W, H (CSS px), U, VW, VH (units), dpr, k
const sim = S.createSim({ seed: +P.get('seed') || (Date.now() & 0xffffff), phase: P.has('play') ? 'play' : 'title' });
if (P.get('x')) { sim.sub.x = clamp(+P.get('x'), 140, S.WORLD_W - 140); sim.cam = clamp(sim.sub.x - 600, 0, S.WORLD_W - 1600); }
const view = { t: 0, titleK: sim.phase === 'title' ? 1 : 0, partyK: 0, happySub: 0, shelfPop: new Map(), lastPing: -9, bubbleT: 0, ambientT: 0, confT: 0 };
const fx = [];                        // particles, in world units
let frozen = false, last = performance.now();

// ---------- layout and baking ----------
const bake = { far: null, farK: 1, tiles: [], tileK: 1, ceil: null, fore: [], rays: null, raysK: 1, dark: null, cone: null, items: [], queue: [] };
const sprites = new Map();

function resize() {
  const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
  let dpr = P.get('quality') === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  if (W * H * dpr * dpr > 4.6e6) dpr = Math.sqrt(4.6e6 / (W * H));
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const portrait = H > W;
  const U = portrait ? Math.min(H / 900, W / 560) : Math.min(H / 900, W / 900);
  L = { W, H, U, VW: W / U, VH: H / U, dpr, k: U * dpr, portrait };
  S.resize(sim, L.VH, L.VW);
  sprites.clear();
  bake.items = Scene.decor(L.VH);
  bake.farK = L.k * 0.5; bake.far = Scene.paintFar(L.VH, L.VW, bake.farK);
  bake.tileK = Math.min(L.k, 1.7);
  bake.tiles = new Array(Math.ceil(S.WORLD_W / Scene.TILE)).fill(null);
  bake.ceil = Scene.paintCeiling(L.VH, bake.tileK);
  bake.fore = [0, 1, 2].map(i => Scene.paintFore(i, Math.min(L.k, 1.2) * 0.6));
  bake.raysK = L.k * 0.4; bake.rays = Scene.paintRays(L.VW, L.VH, bake.raysK);
  bake.dark = Scene.layer(W * dpr * 0.5, H * dpr * 0.5);
  bake.cone = coneSprite();
  // floor tiles: the ones on screen now, the rest a frame at a time
  const near = visibleTiles(); for (const i of near) ensureTile(i);
  bake.queue = bake.tiles.map((_, i) => i).filter(i => !near.includes(i)).sort((a, b) => Math.abs(a - near[0]) - Math.abs(b - near[0]));
  use(g); setUnit(L.U); setArea(W, H);
}
function visibleTiles() { const a = Math.floor(sim.cam / Scene.TILE), b = Math.floor((sim.cam + L.VW) / Scene.TILE); const out = []; for (let i = Math.max(0, a); i <= Math.min(bake.tiles.length - 1, b); i++) out.push(i); return out; }
function ensureTile(i) { if (!bake.tiles[i]) bake.tiles[i] = Scene.paintFloorTile(i, bake.items, L.VH, bake.tileK); return bake.tiles[i]; }
function coneSprite() {
  const w = 512, h = 300, cv = Scene.layer(w, h), cg = cv.getContext('2d');
  cg.filter = 'blur(10px)';
  const gr = cg.createRadialGradient(10, h / 2, 4, 10, h / 2, w);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  cg.fillStyle = gr; cg.beginPath(); cg.moveTo(10, h / 2 - 14); cg.lineTo(w, 10); cg.lineTo(w, h - 10); cg.lineTo(10, h / 2 + 14); cg.closePath(); cg.fill();
  return cv;
}

// ---------- sprites ----------
// [art, box in r units x0 y0 x1 y1, colour per variant]
const FISHC = ['#ff5f8f', '#4fe08a', '#3fc8ff'];
const JELLYC = ['#c77bff', '#5fd8ff', '#ff7ad8', '#7affc8', '#ffe14a'];
const SPEC = {
  clown: [(r, o) => Art.fish(0, 0, r, '#ff7a3a', { stripes: true, ...o }), [-1.75, -1.35, 1.2, 1.0]],
  fish: [(r, o, v) => Art.fish(0, 0, r, FISHC[v % 3], o), [-1.75, -1.35, 1.2, 1.0]],
  angel: [(r, o, v) => Art.angelfish(0, 0, r, { col: ['#ffd23a', '#ff9ad8', '#7af0ff'][v % 3], ...o }), [-1.15, -1.6, 1.0, 1.6]],
  puffer: [(r, o) => Art.puffer(0, 0, r, o), [-1.5, -1.35, 1.35, 1.35]],
  octopus: [(r, o) => Art.octopus(0, 0, r, { ...o, wave: o.happy ? 1.2 : 0 }), [-1.5, -1.05, 1.5, 1.65]],
  turtle: [(r, o) => Art.turtle(0, 0, r, o), [-1.05, -0.95, 1.55, 0.95]],
  crab: [(r, o) => Art.crab(0, 0, r, { ...o, wave: o.happy }), [-1.4, -1.5, 1.4, 1.05]],
  starfish: [(r, o) => Art.starfish(0, 0, r, '#ffa53a', o), [-1.15, -1.15, 1.15, 1.15]],
  seahorse: [(r, o, v) => Art.seahorse(0, 0, r, { col: v % 2 ? '#ff9ad8' : '#ffd23a', ...o }), [-0.8, -1.05, 0.85, 1.3]],
  jelly: [(r, o, v) => Art.jelly(0, 0, r, JELLYC[v % 5], { glow: 0, ...o }), [-1.2, -0.85, 1.2, 1.85]],
  dolphin: [(r, o) => Art.dolphin(0, 0, r, o), [-1.75, -1.05, 1.45, 0.55]],
  shark: [(r, o) => Art.shark(0, 0, r, o), [-1.95, -1.15, 1.3, 0.9]],
  manta: [(r, o) => Art.manta(0, 0, r, o), [-1.7, -1.35, 0.8, 1.1]],
  whale: [(r, o) => Art.whale(0, 0, r, { ...o, spout: o.happy }), [-1.95, -1.35, 1.3, 0.8]],
};
const variants = k => k === 'jelly' ? 5 : k === 'fish' || k === 'angel' ? 3 : k === 'seahorse' ? 2 : 1;
function bakeSprite(key, r, box, paint) {
  let sp = sprites.get(key);
  if (sp) return sp;
  const k = L.k, pad = 4;
  const w = (box[2] - box[0]) * r * k + pad * 2, h = (box[3] - box[1]) * r * k + pad * 2;
  const cv = Scene.layer(w, h), cg = cv.getContext('2d');
  use(cg); setUnit(k); setArea(w, h);
  cg.translate(-box[0] * r * k + pad, -box[1] * r * k + pad);
  paint(r * k);
  use(g); setUnit(L.U); setArea(L.W, L.H);
  sp = { cv, ox: (box[0] * r * k - pad) / k, oy: (box[1] * r * k - pad) / k, w: w / k, h: h / k };
  sprites.set(key, sp);
  return sp;
}
function creatureSprite(kind, v, happy) {
  const [art, box] = SPEC[kind], r = S.KIND[kind].r, vv = v % variants(kind);
  return bakeSprite(`${kind}:${vv}:${happy ? 1 : 0}`, r, box, R => art(R, happy ? { happy: true, open: true } : {}, vv));
}
const SUB_BOX = [-1.75, -1.5, 1.72, 1.62];
function subSprite(happy) {
  return bakeSprite(`sub:${happy ? 1 : 0}`, S.SUB_R, SUB_BOX, R => Art.sub(0, 0, R, { pilotHappy: happy, pilotOpen: happy, under: Art.subUnder({ wash: false }), extra: Art.subExtra({}) }));
}
function schoolSprite(c) { return bakeSprite(`school:${c}`, 15, [-1.75, -1.35, 1.2, 1.0], R => Art.fish(0, 0, R, c, {})); }
function iconSprite(kind, found) {
  const key = `icon:${kind}:${found ? 1 : 0}`;
  let sp = sprites.get(key); if (sp) return sp;
  const base = creatureSprite(kind, 0, false);
  const cv = Scene.layer(base.cv.width, base.cv.height), cg = cv.getContext('2d');
  cg.drawImage(base.cv, 0, 0);
  if (!found) { cg.globalCompositeOperation = 'source-in'; cg.fillStyle = 'rgba(255,255,255,0.55)'; cg.fillRect(0, 0, cv.width, cv.height); }
  sp = { ...base, cv }; sprites.set(key, sp); return sp;
}
function stickerSprite(kind) {
  return bakeSprite(`st:${kind}`, 20, [-1.4, -1.4, 1.4, 1.4], R => { if (kind === 'note') Art.note(0, R * 0.3, R / 30, '#fff6a0'); else if (kind === 'note2') Art.note(0, R * 0.3, R / 30, '#ffd0ec'); else sticker(kind, 0, 0, R, 0); });
}
function bubbleSprite() { return bakeSprite('bubble', 20, [-1.1, -1.1, 1.1, 1.1], R => bubble(0, 0, R)); }
function pearlSprite(c) { return bakeSprite(`pearl:${c}`, S.PEARL_R, [-3.2, -3.2, 3.2, 3.2], R => Art.pearl(0, 0, R, ['#ffffff', '#ffe680', '#ffb8e0', '#9ff4ff'][c])); }
function chestSprite(open) { return bakeSprite(`chest:${open ? 1 : 0}`, 80, [-2.5, -3.0, 2.5, 1.3], R => Art.chest(0, 0, R, open)); }
// Draw a sprite at world (x, y) (screen = (x - cam) * U), with flip, rotation and scale.
function draw(sp, x, y, { flip = false, rot = 0, sx = 1, sy = 1, alpha = 1, screen = false } = {}) {
  const X = screen ? x : (x - sim.cam) * L.U, Y = screen ? y : y * L.U, U = L.U;
  if (X + (sp.ox + sp.w) * U * Math.abs(sx) * 1.3 < -50 || X - sp.w * U * 1.3 > L.W + 50) return;
  g.save(); g.translate(X, Y); if (rot) g.rotate(rot); g.scale(flip ? -sx : sx, sy);
  if (alpha !== 1) g.globalAlpha = alpha;
  g.drawImage(sp.cv, sp.ox * U, sp.oy * U, sp.w * U, sp.h * U);
  g.restore();
}

// ---------- effects ----------
function addFx(p) { if (fx.length < 500) fx.push(p); }
function burstBubbles(x, y, n, spread = 60, size = 12) { const R = Math.random; for (let i = 0; i < n; i++) { const a = R() * TAU; addFx({ t: 'bubble', x: x + Math.cos(a) * spread * R(), y: y + Math.sin(a) * spread * R(), vx: Math.cos(a) * 60 * R(), vy: -40 - R() * 80, r: size * (0.4 + R()), life: 1.6 + R() * 1.2 }); } }
function burstStickers(x, y, n, kinds = ['heart', 'star']) { const R = Math.random; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (R() - 0.5) * 2.2; addFx({ t: 'sticker', k: kinds[i % kinds.length], x, y, vx: Math.cos(a) * (120 + R() * 140), vy: Math.sin(a) * (120 + R() * 160), r: 14 + R() * 12, rot: (R() - 0.5) * 0.8, life: 1.2 + R() * 0.5 }); } }
function burstSparkles(x, y, n, col = '#ffffff') { const R = Math.random; for (let i = 0; i < n; i++) { const a = R() * TAU, s = 60 + R() * 140; addFx({ t: 'sparkle', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 8 + R() * 10, col: R() < 0.5 ? col : '#fff6a0', life: 0.6 + R() * 0.5 }); } }
function ring(x, y, r, col = '#ffffff') { addFx({ t: 'ring', x, y, r, col, life: 0.7 }); }
function notes(x, y, n = 3) { for (let i = 0; i < n; i++) addFx({ t: 'sticker', k: i % 2 ? 'note2' : 'note', x: x + i * 30, y, vx: 40 + i * 25, vy: -90 - i * 20, r: 20, rot: -0.2, life: 1.5, sway: true }); }
function confetti(n) { const R = Math.random, cols = ['#ff5f8f', '#ffd23a', '#4fe08a', '#3fc8ff', '#b57bff', '#ff9a2a']; for (let i = 0; i < n; i++) addFx({ t: 'conf', x: sim.cam + R() * L.VW, y: -20 - R() * 200, vx: (R() - 0.5) * 60, vy: 60 + R() * 90, r: 6 + R() * 8, col: cols[i % 6], rot: R() * TAU, vr: (R() - 0.5) * 8, life: 6 }); }
function flyToShelf(kind, x, y) { addFx({ t: 'fly', k: kind, sx: (x - sim.cam) * L.U, sy: y * L.U, life: 1.0, max: 1.0 }); }

function stepFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const p = fx[i]; p.life -= dt;
    if (p.life <= 0) { if (p.t === 'fly') { view.shelfPop.set(p.k, 1); A.newFriend(sim.found.size); } fx.splice(i, 1); continue; }
    switch (p.t) {
      case 'bubble': p.vy -= 30 * dt; p.vx *= 1 - dt; p.x += (p.vx + Math.sin(p.life * 6 + p.r) * 20) * dt; p.y += p.vy * dt; if (p.y < S.SURFACE + 10) p.life = 0; break;
      case 'sticker': p.vy += (p.sway ? -10 : 160) * dt; p.vx *= 1 - dt * 1.5; p.x += p.vx * dt; p.y += p.vy * dt; break;
      case 'sparkle': p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; p.x += p.vx * dt; p.y += p.vy * dt; break;
      case 'conf': p.x += (p.vx + Math.sin(p.life * 3 + p.r) * 40) * dt; p.y += p.vy * dt; p.rot += p.vr * dt; break;
      default: break;
    }
  }
  for (const [k, v] of view.shelfPop) { const n = v - dt * 2.5; if (n <= 0) view.shelfPop.delete(k); else view.shelfPop.set(k, n); }
}

// ---------- events from the rules ----------
function handle(ev) {
  switch (ev.type) {
    case 'start': A.horn(); break;
    case 'steer': ring(ev.x, ev.y, 34, '#ffffff'); A.steerBlip(); break;
    case 'honk': A.horn(); notes(ev.x + sim.sub.face * 110, ev.y - 90); view.happySub = 1.2; break;
    case 'friend': {
      A.voice(ev.kind);
      const c = sim.creatures.find(c => c.id === ev.id), r = c ? c.r : 50;
      burstBubbles(ev.x, ev.y, 10, r, 10); burstStickers(ev.x, ev.y - r * 0.6, ev.isNew ? 7 : 3); ring(ev.x, ev.y, r * 0.9);
      if (ev.isNew) { burstSparkles(ev.x, ev.y, 12); flyToShelf(ev.kind, ev.x, ev.y); view.happySub = 1.4; }
      break;
    }
    case 'school': A.voice('fish'); burstBubbles(ev.x, ev.y, 8, 40, 8); break;
    case 'pearl': A.pearl(ev.n); burstSparkles(ev.x, ev.y, 7, '#fff6c0'); break;
    case 'chest': A.chest(); burstSparkles(ev.x, ev.y - 90, 20, '#ffe680'); burstBubbles(ev.x, ev.y - 60, 16, 80, 12); view.happySub = 1.5; break;
    case 'zone': if (ev.zone === 'cave') A.ping(); break;
    case 'party': A.party(); confetti(160); view.confT = 1.2; view.happySub = 9; break;
    case 'refill': A.partyEnd(); break;
  }
}

// ---------- input ----------
const pointers = new Map();
const pos = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / L.U, y: (e.clientY - r.top) / L.U }; };
canvas.addEventListener('pointerdown', e => {
  e.preventDefault(); A.unlock();
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  const p = pos(e), what = S.press(sim, p.x, p.y);
  pointers.set(e.pointerId, { steering: what === 'steer' });
});
canvas.addEventListener('pointermove', e => {
  const ptr = pointers.get(e.pointerId); if (!ptr) return;
  const p = pos(e);
  // a drag that started on a friend becomes steering once it leaves it
  if (!ptr.steering) { const w = S.toWorld(sim, p.x, p.y); if (S.hitCreature(sim, w.x, w.y) || S.hitSub(sim, w.x, w.y)) return; ptr.steering = true; }
  S.drag(sim, p.x, p.y);
});
const lift = e => { if (!pointers.has(e.pointerId)) return; pointers.delete(e.pointerId); if (![...pointers.values()].some(p => p.steering)) S.release(sim); };
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
canvas.addEventListener('contextmenu', e => e.preventDefault());

const soundBtn = document.getElementById('sound');
function syncSound() { const m = A.isMuted(); soundBtn.setAttribute('aria-pressed', String(!m)); soundBtn.setAttribute('aria-label', m ? 'Sound off' : 'Sound on'); }
soundBtn.addEventListener('click', () => { A.unlock(); A.setMuted(!A.isMuted()); syncSound(); });
syncSound();
document.addEventListener('visibilitychange', () => { A.suspend(document.hidden); if (document.hidden) { pointers.clear(); S.release(sim); } last = performance.now(); });
window.addEventListener('resize', resize);

// ---------- drawing ----------
const ease = k => k * k * (3 - 2 * k);
function waterColours(d) {
  return [mix('#7ff3ff', '#1a3c8c', d), mix('#18b6e0', '#0c2266', d), mix('#0a4c9c', '#070f40', d), mix('#062a66', '#040824', d)];
}
function drawWater(d) {
  const [a, b, c, e] = waterColours(d), gr = g.createLinearGradient(0, 0, 0, L.H);
  gr.addColorStop(0, a); gr.addColorStop(0.35, b); gr.addColorStop(0.75, c); gr.addColorStop(1, e);
  g.fillStyle = gr; g.fillRect(0, 0, L.W, L.H);
}
function drawFar() {
  const k = bake.farK, sx = sim.cam * Scene.FAR_K * k, sw = Math.min(bake.far.width - sx, L.VW * k);
  g.drawImage(bake.far, sx, 0, sw, bake.far.height, 0, 0, sw / k * L.U, L.H);
}
function drawRays(d) {
  if (d >= 0.98) return;
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = (1 - d) * (0.85 + Math.sin(view.t * 0.7) * 0.15);
  const off = Math.sin(view.t * 0.25) * 30 * L.U - (sim.cam * 0.05 % 200) * 0;
  g.drawImage(bake.rays, off, 0, L.W, L.H);
  g.restore();
  // rippling surface
  const y = S.SURFACE * L.U, ph = sim.cam * 0.6 + view.t * 30;
  g.save(); g.globalAlpha = 1 - d;
  const gr = g.createLinearGradient(0, 0, 0, y + 30 * L.U); gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(200,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0);
  const wave = x => y + Math.sin((x / L.U + ph) / 60) * 7 * L.U + Math.sin((x / L.U + ph * 1.3) / 23 + 1) * 3 * L.U;
  for (let x = 0; x <= L.W + 12; x += 12) g.lineTo(x, wave(x));
  g.lineTo(L.W, 0); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3 * L.U; g.beginPath();
  for (let x = 0; x <= L.W + 12; x += 12) x ? g.lineTo(x, wave(x)) : g.moveTo(x, wave(x));
  g.stroke(); g.restore();
}
function drawFloor() {
  const top = (L.VH - Scene.FLOOR_BAND) * L.U, k = bake.tileK;
  for (const i of visibleTiles()) {
    const t = ensureTile(i), x = (i * Scene.TILE - sim.cam) * L.U;
    g.drawImage(t, x, top, t.width / k * L.U, t.height / k * L.U);
  }
  if (sim.cam + L.VW > Scene.CEIL_X) { const c = bake.ceil, x = (Scene.CEIL_X - sim.cam) * L.U; g.drawImage(c, x, 0, c.width / k * L.U, c.height / k * L.U); }
}
function drawMotes(d) {
  // drifting specks of sea snow, brighter plankton in the dark
  const R = rng(5), n = 90, col = d > 0.5 ? '#9ffcff' : '#ffffff';
  g.save(); g.fillStyle = col; g.globalAlpha = 0.35 + d * 0.4;
  for (let i = 0; i < n; i++) {
    const px = R() * (L.VW + 200), py = R() * L.VH, s = (1 + R() * 2.4) * L.U, par = 0.5 + R() * 0.6;
    const x = ((px - sim.cam * par + view.t * (6 + R() * 10)) % (L.VW + 200) + L.VW + 200) % (L.VW + 200) - 100;
    const y = ((py - view.t * (4 + R() * 8)) % L.VH + L.VH) % L.VH;
    g.fillRect(x * L.U, y * L.U, s, s);
  }
  g.restore();
}
function creaturePose(c) {
  const k = S.KIND[c.kind];
  let sx = 1 - c.squash * 0.35, sy = 1 + c.squash * 0.35, rot = 0, y = c.y;
  if (k.move === 'swim') rot = Math.sin(c.phase * 3) * 0.05 + (c.kind === 'dolphin' ? Math.sin(c.phase * 1.2) * 0.12 : 0);
  if (c.kind === 'jelly') { const p = Math.sin(c.phase * 2.2); sy *= 1 + p * 0.07; sx *= 1 - p * 0.05; }
  if (c.kind === 'puffer' && c.puff > 0) { const s = 1 + 0.45 * Math.sin(Math.min(1, (1 - c.puff) * 4) * Math.PI / 2) * c.puff; sx *= s; sy *= s; }
  if (c.kind === 'crab') rot = Math.sin(c.phase * 9) * 0.04;
  if (c.happyT > 0 && k.move !== 'swim') y -= Math.abs(Math.sin(c.happyT * 9)) * 10 * c.happyT;
  if (sim.phase === 'party') { y -= Math.abs(Math.sin(view.t * 5 + c.id)) * 18; rot += Math.sin(view.t * 4 + c.id) * 0.12; }
  return { sx, sy, rot, y };
}
function drawCreature(c) {
  const happy = c.happyT > 0 || sim.phase === 'party' || (c.kind === 'whale' && false);
  const blink = !happy && ((view.t + c.id * 1.7) % 4.2) < 0.12;
  const sp = creatureSprite(c.kind, c.variant + c.id, happy || blink);
  const p = creaturePose(c);
  draw(sp, c.x, p.y, { flip: c.face < 0 && c.kind !== 'starfish' && c.kind !== 'jelly' && c.kind !== 'octopus' && c.kind !== 'crab', rot: p.rot * (c.face < 0 ? -1 : 1), sx: p.sx, sy: p.sy });
}
function drawSchools(d) {
  for (const f of sim.schools) {
    const cols = [['#ffd23a', '#ffe14a', '#3fc8ff'], ['#ff7a3a', '#ffd23a', '#ff5f8f'], ['#3fc8ff', '#7af0ff', '#b57bff'], ['#7af0ff', '#c8ff7a', '#ff9ad8']][f.pal];
    if ((f.x + 300 - sim.cam) < -100 || (f.x - 300 - sim.cam) > L.VW + 100) continue;
    for (const fi of f.fish) {
      const x = f.x + fi.ox + fi.sx + Math.sin(fi.ph * 2) * 6, y = f.y + fi.oy + fi.sy + Math.sin(fi.ph * 3) * 4;
      const away = fi.sx * f.dir < -5 ? -1 : 1;
      draw(schoolSprite(cols[fi.c]), x, y, { flip: f.dir * away < 0, sx: fi.s, sy: fi.s * (1 + Math.sin(fi.ph * 9) * 0.04), rot: Math.sin(fi.ph * 2) * 0.08 });
      if (d > 0.4) { g.save(); g.globalCompositeOperation = 'lighter'; glow((x - sim.cam) * L.U, y * L.U, 26 * L.U, cols[fi.c], 0.35 * d); g.restore(); }
    }
  }
}
function drawPearls() {
  for (const p of sim.pearls) {
    let a = 1, s = 1;
    if (p.taken) { if (p.back > 0.35) continue; s = 1 + p.back * 3; a = 1 - p.back / 0.35; }
    draw(pearlSprite(p.c), p.x, p.y + Math.sin(view.t * 2 + p.x) * 5, { sx: s, sy: s, alpha: a });
  }
}
function drawSub(d) {
  const b = sim.sub, U = L.U, X = (b.x - sim.cam) * U, Y = (b.y + Math.sin(view.t * 1.6) * 4) * U, r = S.SUB_R, f = b.face;
  const sp = Math.min(1, b.speed / S.MAX_SPEED);
  const bump = Math.sin(b.bump * Math.PI * 3) * b.bump * 0.08;
  g.save(); g.translate(X, Y); g.rotate(b.tilt); g.scale(f, 1);
  // headlight beam in the dark
  if (d > 0.05) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 * d; g.drawImage(bake.cone, r * 1.15 * U, (r * 0.1 - 260) * U, 820 * U, 520 * U); g.restore(); }
  // propeller wash rings
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) { const ph = (view.t * (1 + sp * 4) + i / 4) % 1; g.strokeStyle = `rgba(220,255,255,${(0.35 - ph * 0.3) * (0.3 + sp)})`; g.lineWidth = r * 0.045 * U; g.beginPath(); g.ellipse(-r * (1.55 + ph * 0.9) * U, r * 0.08 * U, r * (0.1 + ph * 0.12) * U, r * (0.32 + ph * 0.3) * U, 0, 0, TAU); g.stroke(); }
  g.restore();
  g.scale(1 + bump, 1 - bump);
  const happy = view.happySub > 0 || sim.phase === 'party';
  const s = subSprite(happy);
  g.drawImage(s.cv, s.ox * U, s.oy * U, s.w * U, s.h * U);
  // propeller spin: a blurred disc over the blades
  g.fillStyle = `rgba(255,170,120,${0.15 + sp * 0.35})`; g.beginPath(); g.ellipse(-r * 1.44 * U, r * 0.08 * U, r * 0.09 * U, r * 0.3 * U * (0.6 + 0.4 * Math.abs(Math.sin(view.t * 30))), 0, 0, TAU); g.fill();
  // antenna blink
  const blink = (view.t % 1.2) < 0.5;
  if (blink) { g.save(); g.globalCompositeOperation = 'lighter'; glow(-r * 0.7 * U, -r * 1.28 * U, r * 0.45 * U, '#ff4a6a', 0.9); g.restore(); }
  // horn sound waves
  if (b.honkT > 0) {
    g.save(); g.translate(r * 0.92 * U, -r * 0.48 * U); g.rotate(-0.5); g.globalCompositeOperation = 'lighter';
    for (let i = 1; i <= 4; i++) { const ph = (1 - b.honkT) * 2 + i * 0.25; g.strokeStyle = `rgba(255,255,220,${Math.max(0, 0.8 - ph * 0.35) * b.honkT})`; g.lineWidth = r * 0.05 * U; g.beginPath(); g.arc(r * 0.38 * U, 0, r * (0.2 + ph * 0.5) * U, -0.7, 0.7); g.stroke(); }
    g.restore();
  }
  g.restore();
}
// Darkness of the Glow Cave, with holes cut for every light.
function drawDarkness(d) {
  if (d < 0.02) return;
  const dc = bake.dark, dg = dc.getContext('2d'), s = dc.width / L.W;
  dg.setTransform(1, 0, 0, 1, 0, 0); dg.globalCompositeOperation = 'source-over'; dg.clearRect(0, 0, dc.width, dc.height);
  dg.fillStyle = `rgba(3,6,30,${0.84 * d})`; dg.fillRect(0, 0, dc.width, dc.height);
  dg.globalCompositeOperation = 'destination-out';
  const U = L.U * s, hole = (x, y, r, a = 1) => glow((x - sim.cam) * U, y * U, r * U, '#ffffff', a, dg);
  const b = sim.sub, r = S.SUB_R;
  hole(b.x, b.y, r * 2.4, 0.9);
  dg.save(); dg.translate((b.x - sim.cam) * U, b.y * U); dg.rotate(b.tilt); dg.scale(b.face, 1); dg.globalAlpha = 0.95;
  dg.drawImage(bake.cone, r * 1.15 * U, (r * 0.1 - 260) * U, 820 * U, 520 * U); dg.restore();
  for (const c of sim.creatures) if (c.kind === 'jelly') hole(c.x, c.y, c.r * 3, 0.8); else if (c.happyT > 0) hole(c.x, c.y, c.r * 2, 0.6);
  for (const it of bake.items) if ((it.t === 'glowcoral' || it.t === 'crystal') && it.x > sim.cam - 200 && it.x < sim.cam + L.VW + 200) hole(it.x, it.y - (it.h || 60) * 0.4, (it.h || 60) * 1.3, 0.75);
  for (const p of sim.pearls) if (!p.taken) hole(p.x, p.y, 70, 0.6);
  hole(sim.chest.x, sim.chest.y - 60, sim.chest.open ? 260 : 150, 0.8);
  for (const p of fx) if (p.t === 'sparkle' || p.t === 'sticker') hole(p.x, p.y, 50, 0.5);
  dg.globalCompositeOperation = 'source-over';
  g.drawImage(dc, 0, 0, L.W, L.H);
  // coloured glows on top so the lights bloom
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const c of sim.creatures) if (c.kind === 'jelly') glow((c.x - sim.cam) * L.U, c.y * L.U, c.r * 2.6 * L.U, JELLYC[(c.variant + c.id) % 5], 0.45 * d);
  g.restore();
}
function drawFx() {
  const U = L.U;
  for (const p of fx) {
    const X = (p.x - sim.cam) * U, Y = p.y * U;
    switch (p.t) {
      case 'bubble': { const b = bubbleSprite(), s = p.r / 20; g.globalAlpha = Math.min(1, p.life); g.drawImage(b.cv, X + b.ox * s * U, Y + b.oy * s * U, b.w * s * U, b.h * s * U); g.globalAlpha = 1; break; }
      case 'sticker': { const sp = stickerSprite(p.k), s = p.r / 20 * (p.life < 0.3 ? p.life / 0.3 : 1); g.save(); g.translate(X, Y); g.rotate(p.rot); g.globalAlpha = Math.min(1, p.life * 2); g.drawImage(sp.cv, sp.ox * s * U, sp.oy * s * U, sp.w * s * U, sp.h * s * U); g.restore(); break; }
      case 'sparkle': sparkle(X, Y, p.r * U * Math.min(1, p.life * 2), Math.min(1, p.life * 2), p.col); break;
      case 'ring': { const k = 1 - p.life / 0.7; g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = rgba(p.col, 0.8 * (1 - k)); g.lineWidth = 5 * U * (1 - k) + 1; g.beginPath(); g.arc(X, Y, p.r * U * (0.6 + k * 1.4), 0, TAU); g.stroke(); g.restore(); break; }
      case 'conf': g.save(); g.translate(X, Y); g.rotate(p.rot); g.fillStyle = p.col; g.fillRect(-p.r * U, -p.r * 0.4 * U, p.r * 2 * U, p.r * 0.8 * U); g.restore(); break;
      default: break;
    }
  }
}
function drawFore() {
  const U = L.U, par = Scene.FORE_K;
  const spots = [[2600, 2], [4000, 1]];
  for (const [wx, kind] of spots) {
    const cv = bake.fore[kind], k = Math.min(L.k, 1.2) * 0.6, w = cv.width / k * U, h = cv.height / k * U;
    const X = (wx - sim.cam * par) * U;
    if (X + w < -20 || X - w > L.W + 20) continue;
    g.globalAlpha = 0.6; g.drawImage(cv, X - w * 0.35, L.H - h * 0.7 + 30 * U, w * 0.7, h * 0.7); g.globalAlpha = 1;
  }
}
// The friend shelf: ten little slots at the top; found friends in colour.
function shelfLayout() {
  const n = S.SHELF.length, rows = L.portrait ? 2 : 1, per = Math.ceil(n / rows);
  const r = clamp(Math.min(26, (L.W - 140) / (per * 2.5)), 14, 30), gap = r * 2.5;
  const w = per * gap, x0 = (L.W - w) / 2 + gap / 2, y0 = Math.max(12, 8) + r + 6;
  return { r, gap, rows, per, x0, y0, w };
}
function slotPos(i) { const s = shelfLayout(); const row = Math.floor(i / s.per), col = i % s.per; return { x: s.x0 + col * s.gap, y: s.y0 + row * s.r * 2.5, r: s.r }; }
function drawShelf() {
  const s = shelfLayout(), h = s.rows * s.r * 2.5;
  g.save(); g.fillStyle = 'rgba(8,40,100,0.3)'; g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
  const x = s.x0 - s.gap * 0.55, y = s.y0 - s.r * 1.25, w = s.w + s.gap * 0.1;
  g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, s.r * 1.25) : g.rect(x, y, w, h); g.fill(); g.stroke(); g.restore();
  S.SHELF.forEach((kind, i) => {
    const p = slotPos(i), found = sim.found.has(kind) && !fx.some(f => f.t === 'fly' && f.k === kind);
    const sp = iconSprite(kind, found), big = Math.max(sp.w, sp.h), sc = (p.r * 2.1) / (big * L.U) * (1 + (view.shelfPop.get(kind) || 0) * 0.5);
    g.save(); g.translate(p.x, p.y); g.scale(sc, sc); g.globalAlpha = found ? 1 : 0.6;
    g.drawImage(sp.cv, (sp.ox - (sp.ox + sp.w / 2)) * L.U, (sp.oy - (sp.oy + sp.h / 2)) * L.U, sp.w * L.U, sp.h * L.U);
    g.restore();
    if (found && view.shelfPop.get(kind)) sparkle(p.x + p.r, p.y - p.r, p.r * 0.6, view.shelfPop.get(kind));
  });
  // friends flying up to their slot
  for (const f of fx) if (f.t === 'fly') {
    const i = S.SHELF.indexOf(f.k), p = slotPos(i), k = ease(1 - f.life / f.max);
    const x = lerp(f.sx, p.x, k), y = lerp(f.sy, p.y, k) - Math.sin(k * Math.PI) * 120, sp = iconSprite(f.k, true), big = Math.max(sp.w, sp.h);
    const sc = lerp(1, (p.r * 2.1) / (big * L.U), k) * (1 + Math.sin(k * Math.PI) * 0.3);
    g.save(); g.translate(x, y); g.scale(sc, sc); g.drawImage(sp.cv, -sp.w / 2 * L.U, -sp.h / 2 * L.U, sp.w * L.U, sp.h * L.U); g.restore();
    sparkle(x, y, 14 * (1 - k) + 6, 1);
  }
}
function drawHint() {
  const h = S.hintTarget(sim); if (!h) return;
  const a = Math.min(1, (sim.idle - S.HINT_AFTER) * 2), U = L.U;
  const sx = (sim.sub.x - sim.cam) * U, sy = sim.sub.y * U, tx = (h.x - sim.cam) * U, ty = h.y * U;
  const k = (view.t % 1.6) / 1.6;
  g.save(); g.globalAlpha = a;
  g.setLineDash([2, 16 * U]); g.lineCap = 'round'; g.lineWidth = 8 * U; g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo((sx + tx) / 2, Math.min(sy, ty) - 80 * U, tx, ty); g.stroke(); g.setLineDash([]);
  // a pulsing finger-tap circle on the target
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2; i++) { const q = (k + i * 0.5) % 1; g.strokeStyle = `rgba(255,255,255,${0.9 * (1 - q)})`; g.lineWidth = 5 * U; g.beginPath(); g.arc(tx, ty, (24 + q * 60) * U, 0, TAU); g.stroke(); }
  glow(tx, ty, 50 * U, '#ffffff', 0.7);
  g.restore();
}
function drawTitle() {
  const tk = ease(view.titleK); if (tk <= 0.01) return;
  const U = L.U, W = L.W, H = L.H;
  g.save(); g.globalAlpha = tk;
  logo(W / 2, H * (L.portrait ? 0.2 : 0.18) - (1 - tk) * H * 0.3, Math.min(W / 1500, H / 900) * (L.portrait ? 1.6 : 1.05));
  const pr = Math.min(W, H) * 0.085, px = L.portrait ? W / 2 : W * 0.7, py = L.portrait ? H * 0.66 : H * 0.5, pulse = 1 + Math.sin(view.t * 4) * 0.05;
  playButton(px, py, pr * pulse);
  g.restore();
}
function logo(cx, cy, s) {
  const text = ['B', 'u', 'b', 'b', 'l', 'e', ' ', 'S', 'u', 'b'];
  const cols = ['#ff5f8f', '#ff9a2a', '#ffd23a', '#4fe08a', '#3fc8ff', '#b57bff', null, '#ffd23a', '#ff7a3a', '#ff5f8f'];
  g.save(); g.font = `900 ${150 * s}px 'Arial Rounded MT Bold', 'Nunito', 'Baloo 2', 'Trebuchet MS', system-ui, sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'center';
  const ws = text.map(c => c === ' ' ? 50 * s : g.measureText(c).width * 0.95), tw = ws.reduce((a, b) => a + b, 0);
  let x = cx - tw / 2;
  text.forEach((c, i) => {
    if (c === ' ') { x += ws[i]; return; }
    const y = cy + Math.sin(i * 0.9 + view.t * 2) * 10 * s, rot = Math.sin(i * 1.7 + view.t) * 0.06, mx = x + ws[i] / 2;
    g.save(); g.translate(mx, y); g.rotate(rot);
    g.lineJoin = 'round'; g.lineWidth = 34 * s; g.strokeStyle = '#0b2a6a'; g.strokeText(c, 0, 8 * s);
    g.lineWidth = 22 * s; g.strokeStyle = '#ffffff'; g.strokeText(c, 0, 0);
    const gr = g.createLinearGradient(0, -70 * s, 0, 70 * s); gr.addColorStop(0, mix(cols[i], '#ffffff', 0.55)); gr.addColorStop(0.5, cols[i]); gr.addColorStop(1, mix(cols[i], '#000000', 0.3));
    g.fillStyle = gr; g.fillText(c, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(-ws[i] * 0.08, -36 * s, ws[i] * 0.3, 12 * s, -0.2, 0, TAU); g.fill();
    g.restore(); x += ws[i];
  });
  g.restore();
}
function playButton(x, y, r) {
  g.save(); g.globalCompositeOperation = 'lighter'; glow(x, y, r * 2.2, '#9ff4ff', 0.5); g.restore();
  g.save(); g.beginPath(); g.arc(x, y + r * 0.1, r, 0, TAU); g.fillStyle = '#0b5a2a'; g.fill();
  g.beginPath(); g.arc(x, y, r, 0, TAU);
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.05, x, y, r * 1.25); gr.addColorStop(0, '#c8ffd0'); gr.addColorStop(0.45, '#3fd36a'); gr.addColorStop(1, '#1a7a3a');
  g.lineWidth = r * 0.08; g.strokeStyle = '#0b4a2a'; g.stroke(); g.fillStyle = gr; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.5, r * 0.3, r * 0.13, -0.55, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(x - r * 0.3, y - r * 0.45); g.lineTo(x + r * 0.5, y); g.lineTo(x - r * 0.3, y + r * 0.45); g.closePath(); g.lineJoin = 'round';
  g.lineWidth = r * 0.12; g.strokeStyle = '#0b4a2a'; g.stroke(); g.fillStyle = '#ffffff'; g.fill(); g.restore();
}
function drawParty() {
  const k = ease(view.partyK); if (k <= 0) return;
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = k * 0.5;
  ['#ff5f8f', '#ff9a2a', '#ffd23a', '#4fe08a', '#3fc8ff', '#b57bff'].forEach((c, i) => { g.strokeStyle = rgba(c, 0.5); g.lineWidth = 28 * L.U; g.beginPath(); g.arc(L.W / 2, L.H * 1.05, L.H * (0.82 - i * 0.05), Math.PI * 1.08, Math.PI * 1.92); g.stroke(); });
  g.restore();
}

function render() {
  use(g); setUnit(L.U); setArea(L.W, L.H);
  g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  const d = S.darkness(sim.cam + L.VW / 2);
  drawWater(d);
  drawFar();
  drawRays(d);
  drawMotes(d);
  drawFloor();
  const ch = sim.chest; draw(chestSprite(ch.open), ch.x, ch.y);
  drawPearls();
  const big = sim.creatures.filter(c => c.kind === 'whale' || c.kind === 'manta' || c.kind === 'shark');
  for (const c of big) drawCreature(c);
  drawSchools(d);
  for (const c of sim.creatures) if (!big.includes(c)) drawCreature(c);
  drawSub(d);
  drawDarkness(d);
  drawFx();
  drawFore();
  drawParty();
  if (!COVER && sim.phase !== 'title') drawShelf();
  drawHint();
  drawTitle();
}

// ---------- loop ----------
function update(dt) {
  if (!frozen) S.step(sim, dt);
  for (const ev of S.drainEvents(sim)) handle(ev);
  if (frozen) return;
  view.t += dt;
  view.titleK = clamp(view.titleK + (sim.phase === 'title' ? dt : -dt * 2), 0, 1);
  view.partyK = clamp(view.partyK + (sim.phase === 'party' ? dt * 1.5 : -dt * 1.5), 0, 1);
  view.happySub = Math.max(0, view.happySub - dt);
  stepFx(dt);
  const b = sim.sub, sp = Math.min(1, b.speed / S.MAX_SPEED), d = S.darkness(b.x);
  A.engine(sim.phase === 'title' ? 0.1 : sp, S.darkness(sim.cam + L.VW / 2), sim.phase === 'party');
  // propeller bubbles
  view.bubbleT -= dt * (0.6 + sp * 6);
  if (view.bubbleT <= 0) { view.bubbleT = 0.25; addFx({ t: 'bubble', x: b.x - b.face * S.SUB_R * 1.6, y: b.y + 8 + (Math.random() - 0.5) * 30, vx: -b.face * (40 + sp * 120), vy: -30 - Math.random() * 40, r: 5 + Math.random() * 9, life: 1.5 + Math.random() }); if (sp > 0.3 && Math.random() < 0.3) A.bubblePop(Math.random()); }
  // ambient bubble streams from the reef
  view.ambientT -= dt;
  if (view.ambientT <= 0) { view.ambientT = 0.5 + Math.random() * 0.6; const x = sim.cam + Math.random() * L.VW; addFx({ t: 'bubble', x, y: S.floorY(L.VH, x) - 20, vx: 0, vy: -50, r: 4 + Math.random() * 8, life: 4 + Math.random() * 2 }); }
  // sonar pings now and then while moving in the dark
  if (d > 0.6 && sp > 0.2 && view.t - view.lastPing > 4.5) { view.lastPing = view.t; A.ping(); }
  if (sim.phase === 'party') { view.confT -= dt; if (view.confT <= 0) { view.confT = 1.4; confetti(40); burstStickers(sim.sub.x + (Math.random() - 0.5) * 500, sim.sub.y - 120, 3); if (Math.random() < 0.5) notes(sim.sub.x - 200 + Math.random() * 400, sim.sub.y - 150, 2); } }
  // finish baking floor tiles in the background, one per frame
  if (bake.queue.length) ensureTile(bake.queue.shift());
}
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (!document.hidden) { update(dt); render(); }
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(t => { last = t; frame(t); });

// ---------- debug ----------
if (DEBUG) {
  const stepMs = ms => { const was = frozen; frozen = false; sim.frozen = false; let left = ms / 1000; while (left > 1e-6) { const dd = Math.min(1 / 60, left); update(dd); left -= dd; } frozen = was; sim.frozen = was; render(); };
  const find = kind => sim.creatures.find(c => c.kind === kind);
  window.__bs = {
    sim, view, A, S, fx,
    freeze() { frozen = true; sim.frozen = true; },
    thaw() { frozen = false; sim.frozen = false; },
    step: stepMs,
    start() { S.start(sim); },
    // screen CSS px, like a finger
    press(x, y) { A.unlock(); return S.press(sim, x / L.U, y / L.U); },
    drag(x, y) { S.drag(sim, x / L.U, y / L.U); },
    release() { S.release(sim); },
    // move the sub (and camera) straight to world x, y share of the screen
    goto(x, ys = 0.45) { sim.sub.x = clamp(x, 140, S.WORLD_W - 140); sim.sub.y = L.VH * ys; sim.sub.vx = sim.sub.vy = 0; sim.sub.tx = null; sim.cam = clamp(sim.sub.x - L.VW / 2, 0, S.WORLD_W - L.VW); for (const i of visibleTiles()) ensureTile(i); },
    // tap the first friend of a kind (brings the camera to it first)
    tickle(kind) { const c = find(kind); if (!c) return null; if (c.x < sim.cam + 60 || c.x > sim.cam + L.VW - 60) this.goto(c.x - 250, 0.4); S.tickle(sim, c); return c.id; },
    screenOf(kind) { const c = find(kind); return c ? { x: (c.x - sim.cam) * L.U, y: c.y * L.U, r: c.r * L.U } : null; },
    subScreen() { return { x: (sim.sub.x - sim.cam) * L.U, y: sim.sub.y * L.U }; },
    findAll(n = S.SHELF.length) { for (const k of S.SHELF.slice(0, n)) { const c = find(k); if (c && !sim.found.has(k)) S.tickle(sim, c); } },
    honk() { S.honk(sim); },
    bakeAll() { while (bake.queue.length) ensureTile(bake.queue.shift()); },
    state: () => ({
      phase: sim.phase, sub: { x: sim.sub.x, y: sim.sub.y, speed: sim.sub.speed, face: sim.sub.face }, cam: sim.cam, zone: sim.zone,
      found: [...sim.found], rounds: sim.rounds, pearls: sim.pearlsTaken, chest: sim.chest.open, idle: sim.idle, hint: !!S.hintTarget(sim),
      dark: S.darkness(sim.cam + L.VW / 2), fx: fx.length, tilesBaked: bake.tiles.filter(Boolean).length, audio: A.state(),
      layout: { W: L.W, H: L.H, U: L.U, VW: L.VW, VH: L.VH, dpr: L.dpr },
    }),
    render,
  };
}
