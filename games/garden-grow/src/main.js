// Garden Grow: a glossy, candy-bright garden for toddlers. Tap the soil and a
// seed pops in, tap the sprout and the watering can swoops over, tap the bud
// and it bursts into a smiling flower that sings along with the music. Every
// visitor answers a tap: butterflies loop, bees buzz, birds sing on the fence,
// the ladybug flies, the snail hides, the bunny jumps, the frog leaps, worms
// wiggle, bubbles pop, apples drop, clouds rain, the sun giggles and the
// balloon drops seeds. A full garden throws a party, then puffs into dandelion
// seeds and starts again. No text, no losing.
//
// Modules: sim.js (rules, Node-testable), art.js (sprites), world.js
// (backdrop and rainbow), render.js (the frame), fx.js (particles),
// audio.js (Web Audio music and effects), draw.js (helpers).
//
// URL switches: ?play starts straight into a game, ?seed=N, ?cover hides the
// corner buttons, ?quality=low draws at 1x, ?debug exposes window.__gg (see
// the end of this file).
import { use, layer, clamp } from './draw.js';
import * as Art from './art.js';
import * as World from './world.js';
import * as S from './sim.js';
import * as FX from './fx.js';
import * as R from './render.js';
import * as A from './audio.js';

const P = new URLSearchParams(location.search);
const DEBUG = P.has('debug');
if (P.has('cover')) document.body.classList.add('cover');
const canvas = document.getElementById('scene');
const g = canvas.getContext('2d');

const sim = S.createSim({ seed: +P.get('seed') || (Date.now() & 0xffffff), phase: P.has('play') ? 'play' : 'title', W: innerWidth || 1280, H: innerHeight || 720 });
const view = R.createView();
view.titleK = sim.phase === 'title' ? 1 : 0;
view.cover = P.has('cover');
const fx = FX.createFx();
const layers = { bg: null, rainbow: null };
const later = [];  // sounds and effects scheduled a moment ahead (view time)
let dpr = 1;

function resize() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  dpr = P.get('quality') === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  if (w * h * dpr * dpr > 4.6e6) dpr = Math.sqrt(4.6e6 / (w * h));
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  S.resize(sim, w, h);
  const L = sim.L;
  Art.setScale(L.ps, dpr);
  fx.ps = L.ps;
  layers.bg = layer(canvas.width, canvas.height);
  const bg = layers.bg.getContext('2d'); bg.setTransform(dpr, 0, 0, dpr, 0, 0); use(bg); World.paintBackdrop(L);
  layers.rainbow = layer(canvas.width, canvas.height);
  const rb = layers.rainbow.getContext('2d'); rb.setTransform(dpr, 0, 0, dpr, 0, 0); use(rb); World.paintRainbow(L);
  use(g);
}

// ---------- what happened → effects and sound ----------
const at = (delay, fn) => { if (delay > 0) later.push({ t: view.t + delay, fn }); else fn(); };
let lastPuff = -9;
function handle(ev) {
  const L = sim.L, ps = L.ps;
  switch (ev.type) {
    case 'start': A.gift(); view.press.seed = 1; break;
    case 'plant': {
      const d = ev.delay || 0;
      FX.seedDrop(fx, ev.x + (Math.random() - 0.5) * 10 * ps, ev.y - 4 * ps, d, ev.how === 'gift' ? 380 : 170);
      at(d, () => A.pop());
      break;
    }
    case 'seedLand': FX.dust(fx, ev.x, ev.y, 7); A.plop(); break;
    case 'sprout': FX.sparkles(fx, ev.x, ev.y - 40 * ps, 8, 50); FX.ring(fx, ev.x, ev.y - 30 * ps, 60 * ps, '#ffffff'); A.sprout(); break;
    case 'water': view.cans.push({ i: ev.i, x: ev.x, y: ev.y, flip: ev.x < sim.L.W * 0.3 ? -1 : 1, t: -(ev.delay || 0), dur: S.T.water + 0.7 + (ev.delay ? 0 : 0), col: ['#3fa9ff', '#ff5f8f', '#a55bff'][ev.i % 3], drip: 0 }); at(ev.delay || 0, () => A.pour(0.8)); break;
    case 'bud': FX.sparkles(fx, ev.x, ev.y, 10, 60); FX.ring(fx, ev.x, ev.y, 70 * ps); A.grow(); break;
    case 'bloom':
      FX.petals(fx, ev.x, ev.y, ev.color, 12); FX.sparkles(fx, ev.x, ev.y, 16, 90); FX.hearts(fx, ev.x, ev.y - 40 * ps, 4); FX.ring(fx, ev.x, ev.y, 110 * ps, '#fff6a0'); FX.stars(fx, ev.x, ev.y, 4, 0.8);
      A.bloom(ev.color); at(0.35, () => A.giggle(true));
      break;
    case 'tickle': FX.notes(fx, ev.x, ev.y - 50 * ps, 2); FX.sparkles(fx, ev.x, ev.y, 8, 70, '#ffd0ec'); FX.petals(fx, ev.x, ev.y, ev.color, 3, 0.6); A.bell(ev.color); A.giggle(); if (ev.kind === 'carrot') A.boing(); break;
    case 'arrive': at(0.2, () => (ev.kind === 'bee' ? A.buzz() : ev.kind === 'bird' ? A.chirp() : A.flutter())); break;
    case 'poke': {
      const k = ev.kind;
      if (k === 'butterfly') { A.flutter(); FX.hearts(fx, ev.x, ev.y, 4); FX.sparkles(fx, ev.x, ev.y, 10, 40); }
      else if (k === 'bee') { A.buzz(); FX.stars(fx, ev.x, ev.y, 4, 0.6); }
      else if (k === 'bird') { A.chirp(true); FX.notes(fx, ev.x, ev.y - 20 * ps, 3); FX.sparkles(fx, ev.x, ev.y, 6, 30); }
      else if (k === 'ladybug') { A.flutter(); FX.sparkles(fx, ev.x, ev.y, 8, 30); }
      else if (k === 'snail') { A.squeak(); FX.sparkles(fx, ev.x, ev.y - 20 * ps, 5, 30); }
      else if (k === 'bunny') { A.boing(); A.giggle(true); FX.hearts(fx, ev.x, ev.y - 70 * ps, 5); }
      else if (k === 'frog') { A.ribbit(); }
      else if (k === 'worm') { A.giggle(true); FX.dust(fx, ev.x, ev.y, 5); }
      else if (k === 'bubble') { A.bubblePop(); FX.pop(fx, ev.x, ev.y, 26 * ps); FX.sparkles(fx, ev.x, ev.y, 6, 30); }
      else if (k === 'apple') { A.boing(); }
      break;
    }
    case 'gift': A.gift(); FX.stars(fx, ev.x, ev.y + 40 * ps, 10, 0.8); FX.sparkles(fx, ev.x, ev.y, 16, 80); FX.hearts(fx, ev.x, ev.y, 5); break;
    case 'sing': FX.notes(fx, ev.x, ev.y, 2); A.chirp(); break;
    case 'croak': A.ribbit(); break;
    case 'splash': A.splash(); FX.ring(fx, ev.x, ev.y, 50 * ps, '#e8fbff'); FX.drops(fx, ev.x, ev.y - 10 * ps, 6, ev.y + 10 * ps, 30); break;
    case 'sun': A.sunGiggle(); FX.sparkles(fx, ev.x, ev.y, 18, 160, '#fff38a'); FX.stars(fx, ev.x, ev.y, 5, 0.7); break;
    case 'rain': A.rain(); break;
    case 'rainbow': A.rainbow(); FX.sparkles(fx, L.W / 2, L.horizon - 120 * ps, 24, 400); break;
    case 'party': A.fanfare(); A.duck(true); FX.confetti(fx, L.W, L.H, L.portrait ? 110 : 170); break;
    case 'firework': FX.firework(fx, ev.x, ev.y); A.firework(); break;
    case 'puff': FX.fluff(fx, ev.x, ev.y, 10); FX.petals(fx, ev.x, ev.y, ev.color, 5, 0.6); if (view.t - lastPuff > 0.4) { lastPuff = view.t; A.puff(); } break;
    case 'partyEnd': A.duck(false); break;
    case 'wild': A.pop(); FX.sparkles(fx, ev.x, ev.y, 5, 20); break;
    case 'twinkle': A.twinkle(ev.x / L.W); FX.sparkles(fx, ev.x, ev.y, 7, 30); break;
    case 'boing': A.boing(); FX.stars(fx, ev.x, ev.y, 3, 0.5); break;
    case 'appleDrop': A.pop(); break;
    case 'thud': if (!ev.soft) { A.thud(); FX.dust(fx, ev.x, ev.y, 4); } break;
    case 'sparkle': FX.sparkles(fx, ev.x, ev.y, 8, 30); break;
    case 'appleGrow': FX.sparkles(fx, ev.x, ev.y, 3, 10); break;
    case 'wormUp': FX.dust(fx, ev.x, ev.y, 5); A.plop(); break;
    case 'bubbleGone': FX.pop(fx, ev.x, ev.y, ev.r * 0.8); break;
    case 'balloon': A.whoosh(); break;
    case 'seedButton': view.press.seed = 1; if (!ev.n) A.boing(); break;
    case 'canButton': view.press.can = 1; if (!ev.n) A.boing(); break;
    case 'splashDot': if (Math.random() < 0.25) FX.ring(fx, ev.x, ev.y, 12 * ps, '#e8fbff'); break;
  }
}

// ---------- input ----------
const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
function press(x, y) {
  const what = S.tap(sim, x, y);
  if (what === 'start') view.titleGo = true;
  return what;
}
canvas.addEventListener('pointerdown', e => {
  e.preventDefault(); A.unlock();
  const p = pos(e);
  press(p.x, p.y);
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

const soundBtn = document.getElementById('sound');
function syncSound() { const m = A.isMuted(); soundBtn.setAttribute('aria-pressed', String(!m)); soundBtn.setAttribute('aria-label', m ? 'Sound off' : 'Sound on'); soundBtn.classList.toggle('muted', m); }
soundBtn.addEventListener('click', () => { A.unlock(); A.setMuted(!A.isMuted()); syncSound(); });
syncSound();
document.addEventListener('visibilitychange', () => A.suspend(document.hidden));
addEventListener('resize', resize);

// ---------- the loop ----------
let last = performance.now(), frozen = false;
function update(dt) {
  view.t += dt;
  S.step(sim, dt);
  for (const ev of sim.events.splice(0)) handle(ev);
  // scheduled bits
  for (let i = later.length - 1; i >= 0; i--) if (later[i].t <= view.t) { const f = later[i].fn; later.splice(i, 1); f(); }
  const L = sim.L, ps = L.ps;
  // the watering cans pour drops on the way
  for (const cn of view.cans) {
    cn.t += dt;
    const sp = R.spoutOf(cn, ps);
    if (sp && cn.pos.pouring) { cn.drip += dt; while (cn.drip > 0.03) { cn.drip -= 0.03; FX.drops(fx, sp.x, sp.y, 1, L.patches[cn.i].y - 6 * ps, 16); } }
  }
  view.cans = view.cans.filter(c => c.t < c.dur);
  // rain falls from the clouds over the whole garden
  if (sim.rainT > 0 && sim.rainT < S.T.rain - 0.3) { const n = Math.round(dt * (L.portrait ? 70 : 120)); for (let i = 0; i < n; i++) { const c = sim.clouds[(Math.random() * sim.clouds.length) | 0]; FX.rainDrop(fx, c.x + (Math.random() - 0.5) * c.s * 3, c.y + c.s * 0.5, L.horizon + Math.random() * (L.H - L.horizon)); } }
  FX.step(fx, dt, sim.events);
  for (const ev of sim.events.splice(0)) handle(ev);
  view.sunRot += dt * (0.18 + sim.sunSpin * 9);
  view.rbA += ((sim.rainbowT > 0 ? Math.min(1, sim.rainbowT / 1.5) : 0) - view.rbA) * Math.min(1, dt * 2.5);
  view.press.seed = Math.max(0, view.press.seed - dt * 3); view.press.can = Math.max(0, view.press.can - dt * 3);
  view.titleK = sim.phase === 'title' ? 1 : Math.max(0, view.titleK - dt * 3);
}
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.1); last = now;
  if (!frozen) update(dt);
  render();
  requestAnimationFrame(frame);
}
function render() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  use(g);
  R.draw(g, sim, view, fx, layers);
}

resize();
requestAnimationFrame(frame);

// ---------- debug hook ----------
if (DEBUG) {
  const hook = {
    sim, view, fx,
    freeze() { frozen = true; }, thaw() { frozen = false; last = performance.now(); },
    step(ms) { const n = Math.ceil(ms / (1000 / 60)); for (let i = 0; i < n; i++) update(Math.min(1 / 60, ms / 1000 / n)); render(); },
    state() { return { ...S.snapshot(sim), audio: A.state(), cans: view.cans.length, particles: fx.list.length, titleK: view.titleK }; },
    tap(x, y) { return press(x, y); },
    plant(i) { if (i == null) return S.button(sim, 'seed'); if (sim.patches[i].stage === S.EMPTY) return press(sim.L.patches[i].x, sim.L.patches[i].y); },
    grow(i) { const p = sim.patches[i]; if (p.stage === S.EMPTY) p.stage = S.SEED; p.t = 99; S.step(sim, 0.001); },
    bloomAll() { sim.patches.forEach(p => { if (p.stage !== S.BLOOM) { p.stage = S.BUD; p.t = 99; p.waterT = 0; } }); S.step(sim, 0.001); },
    fill(n) { const k = n ?? sim.patches.length; sim.patches.forEach((p, i) => { if (i < k && p.stage !== S.BLOOM) { p.stage = S.BUD; p.t = 99; p.waterT = 0; } }); S.step(sim, 0.001); },
    spawn(kind, o) { return S.add(sim, kind, o || {}).id; },
    rain() { S.rain(sim, sim.clouds[0]); },
    button(name) { S.button(sim, name); },
    start() { S.start(sim); },
    quiet(on = true) { sim.timers.bird = sim.timers.bubble = sim.timers.worm = sim.timers.balloon = on ? 1e9 : 3; },
    set(kind, props) { const c = sim.creatures.find(o => o.kind === kind); if (c) Object.assign(c, props); return !!c; },
    clearVisitors() { sim.creatures = sim.creatures.filter(c => c.kind === 'frog' || c.kind === 'snail'); },
    render,
  };
  window.__gg = hook;
}
