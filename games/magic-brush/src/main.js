// Magic Brush: a storybook painting game for children of about 2 to 7.
// Pick a friend, paint it on the easel, press the magic wand and it peels
// off the paper wearing the child's own paint, then lives in a meadow with
// up to five others. Every painted friend is kept in a sticker book.
//
// Pure Canvas 2D, no assets: every picture is painted by code (src/art.js,
// src/rig.js) and every sound is synthesised (src/audio.js). Screens live in
// src/screens/; each has enter/exit/layout/update/draw/pointer and owns its
// DOM buttons (src/ui.js). Static backgrounds are baked once per size into
// offscreen canvases; friends are cached part bitmaps (src/rig.js) animated
// by src/actor.js. The painting engine and coverage grid are src/paint.js,
// saved friends src/store.js (index in localStorage, textures in IndexedDB).
//
// Must-keep rules: every screen ignores taps for 400 ms after it appears and
// any tap whose press began on an earlier screen; screen actions are
// one-shot; no screen puts a button where the previous screen had one that
// leads onward; the easel's friend is captured synchronously at GO; each
// painting is saved once; resizing re-lays out immediately (backgrounds are
// re-baked once the size settles).
//
// Debug (?debug) exposes window.__mb: freeze, thaw, step(ms), state(),
// screen(name), pick(id|'blank'), paint(points, color) in page uv,
// colourIn(colors?), undo, go, toy(name, x, y), tapFriend(i), clearSave,
// perf(). Switches: ?screen=, ?pick=, ?cover (hides UI), ?mute, ?seed=N.
import { clamp, rng } from './lib.js';
import { Fx, setFxDpr } from './fx.js';
import { unlock, suspend, sfx } from './audio.js';
import * as store from './store.js';
import { TitleScreen } from './screens/title.js';
import { PickScreen } from './screens/pick.js';
import { EaselScreen } from './screens/easel.js';
import { AliveScreen } from './screens/alive.js';
import { MeadowScreen } from './screens/meadow.js';
import { BookScreen } from './screens/book.js';

const Q = new URLSearchParams(location.search);
const DEBUG = Q.has('debug');
const COVER = Q.has('cover');
if (COVER) document.body.classList.add('cover');

const canvas = document.getElementById('scene');
const g = canvas.getContext('2d', { alpha: false });
const ui = document.getElementById('ui');

const QUIET = 0.4; // seconds a new screen ignores taps

export const app = {
  canvas, g, ui, W: 0, H: 0, dpr: 1, t: 0,
  cover: COVER, debug: DEBUG,
  screen: null, screens: {}, trans: null,
  screenAt: -1, readyAt: 0, resizedAt: -9,
  fx: new Fx(),
  rand: rng(Number(Q.get('seed')) || (Date.now() & 0xffff)),
  store, sfx,
  clock: () => performance.now() / 1000,
  // where the button that opened this screen was (CSS px), for a short while
  landing: null,
  landingGuard(btn) {
    const L = this.landing;
    if (!L || this.clock() - this.screenAt > 1.0 || L.W !== this.W || L.H !== this.H) return false;
    const r = btn.rect ? Math.max(btn.w, btn.h) / 2 : btn.r;
    return Math.hypot(btn.x - L.x, btn.y - L.y) < r + L.r;
  },
  inputReady() { return !this.trans && this.clock() >= this.readyAt; },
  bakeOk() { return this.clock() - this.resizedAt > 0.15; },
  unlockAudio() { unlock(); },
  // a button radius that is at least 28 px (56 px targets) on phones and 40 px (80 px) on tablets
  get btnR() { const m = Math.min(this.W, this.H); return Math.max(clamp(m * 0.062, 28, 62), m >= 600 ? 40 : 28); },
  get phone() { return Math.min(this.W, this.H) < 600; },
  get portrait() { return this.H > this.W * 1.05; },
  go(name, opts = {}) {
    if (this.trans) return false;
    if (!this.screens[name]) return false;
    this.trans = { phase: 'out', t: 0, dur: opts.fast ? 0.12 : 0.22, to: name, opts };
    this.readyAt = Infinity;
    return true;
  },
  jump(name, opts = {}) { this.trans = null; switchTo(name, opts); },
};

app.screens = {
  title: new TitleScreen(app),
  pick: new PickScreen(app),
  paint: new EaselScreen(app),
  alive: new AliveScreen(app),
  meadow: new MeadowScreen(app),
  book: new BookScreen(app),
};

function switchTo(name, opts) {
  if (app.screen) app.screen.exit();
  app.fx.clear();
  app.screen = app.screens[name];
  app.screenAt = app.clock();
  app.readyAt = app.screenAt + QUIET;
  const lt = app.lastTapSpot;
  app.landing = lt && app.screenAt - lt.t < 1.5 ? lt : null;
  document.body.dataset.screen = name;
  app.screen.enter(opts || {});
  app.screen.layout(app.W, app.H);
}

// ---------------------------------------------------------------- sizing

// the pixel ratio comes down a step (never below 1) on a device that cannot
// keep up: 4 s averaging under 45 fps outside the come-alive moment
let dprCap = 2, slowT = 0, slowN = 0;
function adapt(dt) {
  if (app.trans || !app.screen || app.screen.name === 'alive' || document.hidden) { slowT = slowN = 0; return; }
  slowT += dt; slowN++;
  if (slowT < 4) return;
  const f = slowN / slowT; slowT = slowN = 0;
  if (f < 45 && app.dpr > 1.05 && !Q.has('dpr')) { dprCap = Math.max(1, app.dpr * 0.8); resizePending = true; }
}
function resize() {
  const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
  let dpr = Math.min(window.devicePixelRatio || 1, 2, dprCap);
  if (W * H * dpr * dpr > 3.5e6) dpr = Math.sqrt(3.5e6 / (W * H));
  dpr = Math.max(0.5, Math.round(dpr * 100) / 100);
  const changed = W !== app.W || H !== app.H || dpr !== app.dpr;
  if (!changed) return;
  if (app.W) app.resizedAt = app.clock();
  app.W = W; app.H = H; app.dpr = dpr;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  setFxDpr(dpr);
  if (app.screen) app.screen.layout(W, H);
}
let resizePending = true;
window.addEventListener('resize', () => { resizePending = true; });
window.addEventListener('orientationchange', () => { resizePending = true; });

// ---------------------------------------------------------------- input

const ignored = new Set();
function pt(e) { return { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType, t: app.clock() }; }
canvas.addEventListener('pointerdown', (e) => {
  unlock();
  if (resizePending) { resizePending = false; resize(); }
  if (!app.inputReady()) { ignored.add(e.pointerId); return; }
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  app.screen && app.screen.pointer('down', pt(e));
});
canvas.addEventListener('pointermove', (e) => {
  if (ignored.has(e.pointerId)) return;
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  if (events && events.length > 1) for (const ce of events) app.screen && app.screen.pointer('move', { id: e.pointerId, x: ce.clientX, y: ce.clientY, type: e.pointerType, t: app.clock(), buttons: e.buttons });
  else app.screen && app.screen.pointer('move', Object.assign(pt(e), { buttons: e.buttons }));
});
const upHandler = (type) => (e) => {
  if (ignored.has(e.pointerId)) { ignored.delete(e.pointerId); return; }
  app.screen && app.screen.pointer(type, pt(e));
};
canvas.addEventListener('pointerup', upHandler('up'));
canvas.addEventListener('pointercancel', upHandler('cancel'));
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && app.screen) app.screen.pointer('leave', pt(e)); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && app.screen && app.screen.name !== 'title' && app.screen.name !== 'alive' && app.inputReady()) app.go('title'); });

// ---------------------------------------------------------------- loop

let frozen = false, raf = 0, last = 0;
const frameMs = [];
let frames = 0, fpsT = 0, fps = 0;

function sim(dt) {
  app.t += dt;
  const tr = app.trans;
  if (tr) {
    tr.t += dt;
    if (tr.phase === 'out' && tr.t >= tr.dur) { switchTo(tr.to, tr.opts); app.trans = { phase: 'in', t: 0, dur: 0.26 }; app.readyAt = Infinity; }
    else if (tr.phase === 'in' && tr.t >= tr.dur) { app.trans = null; app.readyAt = app.clock() + QUIET * 0.6; app.screenAt = Math.min(app.screenAt, app.clock()); }
  }
  app.screen.update(dt);
  app.fx.update(dt);
}
function render() {
  const { W, H, dpr } = app;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  app.screen.draw(g);
  const tr = app.trans;
  if (tr) {
    const a = tr.phase === 'out' ? tr.t / tr.dur : 1 - tr.t / tr.dur;
    g.fillStyle = `rgba(255,248,234,${clamp(a, 0, 1)})`;
    g.fillRect(0, 0, W, H);
  }
}
function frame(ts) {
  raf = requestAnimationFrame(frame);
  if (resizePending) { resizePending = false; resize(); }
  const dt = last ? Math.min(0.05, Math.max(0, (ts - last) / 1000)) : 1 / 60;
  if (last) { frameMs.push(ts - last); if (frameMs.length > 240) frameMs.shift(); }
  last = ts;
  frames++; fpsT += dt;
  if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  if (frozen) return;
  adapt(dt);
  sim(dt);
  render();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; suspend(true); sfx.brush(0); }
  else { suspend(false); last = 0; if (!raf) raf = requestAnimationFrame(frame); }
});

// ---------------------------------------------------------------- boot

resize(); resizePending = false;
// ?pick= opens the easel with that friend, unless ?screen=alive asks for it to come alive
const startScreen = Q.get('screen') === 'alive' ? 'alive' : Q.get('pick') ? 'paint' : Q.get('screen') && app.screens[Q.get('screen')] ? Q.get('screen') : 'title';
if (startScreen === 'alive') {
  switchTo('paint', { kind: Q.get('pick') || 'dragon' });
  app.screens.paint.painting.colourIn();
  switchTo('alive', { painting: app.screens.paint.painting });
} else switchTo(startScreen, { kind: Q.get('pick') || 'dragon' });
raf = requestAnimationFrame(frame);
// bake the next likely backgrounds while the child looks at the title
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
idle(() => { for (const s of ['pick', 'paint', 'meadow']) { try { app.screens[s].prebake && app.screens[s].prebake(); } catch {} } });

// ---------------------------------------------------------------- debug

if (DEBUG) {
  const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  const stepMs = (ms) => { let left = ms; while (left > 0) { const d = Math.min(1 / 60, left / 1000); sim(d); left -= d * 1000; } render(); };
  window.__mb = {
    app,
    freeze() { frozen = true; },
    thaw() { frozen = false; last = 0; },
    step(ms = 16.7) { stepMs(ms); },
    state() {
      const s = app.screen;
      const base = { screen: s.name, friend: null, coverage: 0, stars: 0, goReady: false, meadow: [], book: store.count(), fps: Math.round(fps * 10) / 10, busy: !!app.trans || !!(s.busy) };
      return Object.assign(base, s.debugState ? s.debugState() : {});
    },
    screen(name, opts) { app.jump(name, opts || {}); app.readyAt = 0; return app.screen.name; },
    pick(id = 'dragon') { app.jump('paint', { kind: id }); app.readyAt = 0; return app.screens.paint.kind; },
    paint(points, color) { return app.screens.paint.debugPaint(points, color); },
    colourIn(colors) { return app.screens.paint.debugColourIn(colors); },
    undo() { return app.screens.paint.undo(); },
    go() { app.readyAt = 0; return app.screen.name === 'paint' ? app.screens.paint.pressGo(true) : false; },
    toy(name, x, y) { return app.screen.name === 'meadow' ? app.screens.meadow.useToy(name, x, y) : false; },
    tapFriend(i) { return app.screen.tapFriend ? app.screen.tapFriend(i) : false; },
    clearSave() { return store.clearSave(); },
    perf() { return { fps: Math.round(fps * 10) / 10, frameMs: { p50: Math.round(pct(frameMs, 0.5) * 10) / 10, p95: Math.round(pct(frameMs, 0.95) * 10) / 10 }, canvasPx: canvas.width * canvas.height }; },
    ready() { app.readyAt = 0; },
  };
}
