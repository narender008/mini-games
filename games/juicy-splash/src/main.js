// Juicy Splash: a fruit-slicing game for toddlers. Big fruit float up slowly
// over a sunny orchard picnic; any swipe or tap cuts them open with a juicy
// splat, the sun giggles, and the juice flies into a glass jar. Ten stripes
// fill the jar and it becomes a smiling rainbow smoothie with confetti and
// fireworks, then it is drunk up and play goes on. No text, no losing.
//
// Every fruit is a friend with a face (it blinks, watches your finger, gasps
// when you come close, and its halves giggle). A bunny peeks from her bush
// and munches the slices she is thrown, a chick catches juice drops, and both
// giggle when tapped. Now and then a giant fruit floats up and takes three
// bonks to burst into a shower of small fruit and treats; bubbles drift down
// carrying a fruit or a treat; at the party the friends dance and balloons
// rise to be popped.
//
// Modules: sim.js (rules, Node-testable), fruits.js (fruit art baked into
// sprites), world.js (orchard, sun, jar, trail), fx.js (particles),
// friends.js (faces, bunny, chick, bubbles, treats, balloons), buddies.js
// (the animal friends' behaviour), audio.js (Web Audio music and effects),
// draw.js (helpers).
//
// URL switches: ?play starts straight into a game, ?fruit=<kind> tosses only
// that fruit, ?seed=N, ?cover hides the buttons, ?quality=low draws at 1x,
// ?debug exposes window.__js (see the end of this file).
import { use, TAU, lerp, clamp, glow, additive, sparkle, sticker } from './draw.js';
import { FRUIT, KINDS, makeSprites, stain, drawFruit, drawHalf } from './fruits.js';
import * as World from './world.js';
import * as S from './sim.js';
import * as FX from './fx.js';
import * as A from './audio.js';
import * as Fr from './friends.js';
import * as B from './buddies.js';

const P = new URLSearchParams(location.search);
const DEBUG = P.has('debug');
if (P.has('cover')) document.body.classList.add('cover');
const canvas = document.getElementById('scene');
const g = canvas.getContext('2d');
use(g);

const force = KINDS.includes(P.get('fruit')) ? P.get('fruit') : null;
const sim = S.createSim({ seed: +P.get('seed') || (Date.now() & 0xffffff), phase: P.has('play') ? 'play' : 'title', force });
const fx = FX.createFx();
const pals = B.createBuddies();
pals.drawHalf = (kind, x, y, r, rot) => { const sp = sprites[kind], s = sp.size / dpr * r / sp.r * dpr; sprite(sp.half, x, y, rot, s); };
const balloons = [], treats = [], squash = new Map();
let feedTurn = 0;
const view = { t: 0, balloonT: 0, mood: 'smile', moodT: 0, bounce: 0, fill: 0, wob: 0, partyK: 0, titleK: sim.phase === 'title' ? 1 : 0, fireT: 0, stainT: 0, lastSwish: 0 };
const pointers = new Map();
const trails = [];
let L, dpr = 1, fruitR = 80, sprites, bg, stains, stainG, cloudSprites = [];

function layer(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function resize() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  dpr = P.get('quality') === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  if (w * h * dpr * dpr > 4.6e6) dpr = Math.sqrt(4.6e6 / (w * h));
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  L = World.setLayout(w, h);
  fruitR = L.portrait ? clamp(w * 0.125, 46, 110) : clamp(Math.min(w, h) * 0.1, 44, 110);
  sprites = makeSprites(fruitR * dpr);
  bg = layer(canvas.width, canvas.height);
  const bctx = bg.getContext('2d'); bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  use(bctx); World.paintBackdrop();
  const old = stains; stains = layer(canvas.width, canvas.height); stainG = stains.getContext('2d');
  if (old) stainG.drawImage(old, 0, 0, stains.width, stains.height);
  cloudSprites = World.clouds().map(c => {
    const s = c.s, cw = Math.ceil(s * 4 * dpr), ch = Math.ceil(s * 1.9 * dpr), cv = layer(cw, ch), cg = cv.getContext('2d');
    cg.setTransform(dpr, 0, 0, dpr, 0, 0); use(cg); World.cloud(s * 2, s * 1.45, s, c.seed);
    return { ...c, cv, cw: cw / dpr, ch: ch / dpr };
  });
  use(g);
  S.resize(sim, w, h, fruitR);
  B.layout(pals, L);
}

// ---------- events from the rules ----------
const jarMouth = () => { const b = jarNow(); return { x: b.x, y: b.y - b.h * 0.9 }; };
function handle(ev) {
  switch (ev.type) {
    case 'start': A.pop(); break;
    case 'launch': A.launch(); break;
    case 'cut': {
      const big = ev.sparkle;
      FX.burst(fx, ev.x, ev.y, ev.r, ev.kind, ev.dir, big, [L.BT + 12 * L.u, L.H - 12 * L.u]);
      FX.stars(fx, ev.x, ev.y, big ? 9 : 3, Math.min(ev.r, fruitR * 1.2));
      const m = jarMouth();
      FX.toJar(fx, ev.x, ev.y, m.x, m.y, ev.kind, S.JAR_DELAY, ev.r);
      if (big) FX.toJar(fx, ev.x, ev.y, m.x, m.y, ev.kind, S.JAR_DELAY + 0.25, ev.r);
      if (ev.how === 'swipe') A.swish(); else A.pop();
      A.splat(ev.r / fruitR, big);
      if (ev.n % 2 === 1 || big) A.giggle(big);
      view.mood = 'laugh'; view.moodT = 1.1; view.bounce = 1;
      if (ev.giant) break;
      // every other slice goes to a friend: a half to the bunny, juice to the chick
      if (ev.n % 2 === 0) { if (feedTurn++ % 2 === 0) B.feedBunny(pals, ev.x, ev.y, { type: 'half', kind: ev.kind }); else B.feedChick(pals, ev.x, ev.y, FRUIT[ev.kind].juice); }
      break;
    }
    case 'giant': A.giant(); B.wow(pals); squash.set(ev.id, { k: 1, t: 0 }); break;
    case 'thump':
      squash.set(ev.id, { k: 1, t: 0 }); A.thump(ev.hp); A.giggle(true);
      FX.stars(fx, ev.x, ev.y - ev.r * 0.6, 6, fruitR); FX.ripple(fx, ev.x, ev.y, ev.r * 1.1);
      view.mood = 'wow'; view.moodT = 0.8; B.wow(pals);
      break;
    case 'burst': {
      A.burst(); B.cheer(pals);
      FX.stars(fx, ev.x, ev.y, 14, fruitR, 0.5); FX.firework(fx, ev.x, ev.y, L.u);
      ev.treats.forEach((k, i) => { const a = -Math.PI / 2 + (i - 2.5) * 0.45, sp = 520 * L.u * (0.8 + Math.random() * 0.4); treats.push({ kind: k, x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: 0, spin: (Math.random() - 0.5) * 8, t: 0 }); });
      B.feedBunny(pals, ev.x - ev.r * 0.4, ev.y, { type: 'treat', kind: 'lolly' });
      B.feedChick(pals, ev.x + ev.r * 0.4, ev.y, FRUIT[ev.kind].juice);
      view.mood = 'grin'; view.moodT = 2;
      break;
    }
    case 'bubble': break;
    case 'bubblePop':
      A.bubblePop(); FX.ripple(fx, ev.x, ev.y, ev.r * 1.2);
      for (let i = 0; i < 6; i++) FX.stars(fx, ev.x, ev.y, 1, fruitR * 0.8, 0.5);
      if (ev.by && ev.inside.type === 'treat') { if (pals.bunny.munch > 0.3) B.feedChick(pals, ev.x, ev.y, B.TREAT_COL[ev.inside.kind]); else B.feedBunny(pals, ev.x, ev.y, { type: 'treat', kind: ev.inside.kind }); A.giggle(true); }
      if (ev.fruit) squash.set(ev.fruit, { k: 1, t: 0 });
      break;
    case 'stripe': A.plink(ev.n); view.wob = 1; break;
    case 'party':
      A.fanfare(); A.duck(true); FX.confettiRain(fx, L.W, L.H, L.portrait ? 120 : 180, L.u);
      view.fireT = 0.8; view.mood = 'grin'; view.moodT = 99; view.bounce = 1;
      break;
    case 'firework': {
      if (popBalloonAt(ev.x, ev.y) || pokeAt(ev.x, ev.y)) break;
      FX.firework(fx, ev.x, ev.y, L.u); A.firework(); break;
    }
    case 'tap': if (pokeAt(ev.x, ev.y)) break; FX.ripple(fx, ev.x, ev.y, 60 * L.u); A.boop(ev.x / L.W); break;
    case 'drink': A.slurp(); view.wob = 1; break;
    case 'refill': A.duck(false); view.mood = 'smile'; view.moodT = 0; break;
  }
}

function pokeAt(x, y) {
  const who = B.hit(pals, x, y); if (!who) return false;
  B.poke(pals, who); A.boing(); if (who === 'chick') A.chirp();
  return true;
}
function popBalloonAt(x, y, x1 = x, y1 = y) {
  for (let i = balloons.length - 1; i >= 0; i--) {
    const b = balloons[i];
    const d = distSeg(b.x, b.y, x, y, x1, y1);
    if (d < b.r * 1.15) { balloons.splice(i, 1); A.balloonPop(); FX.ripple(fx, b.x, b.y, b.r * 1.3); FX.stars(fx, b.x, b.y, 4, b.r, 0.5); return true; }
  }
  return false;
}
function distSeg(px, py, x0, y0, x1, y1) { const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy; let t = l2 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0; t = clamp(t, 0, 1); return Math.hypot(px - x0 - t * dx, py - y0 - t * dy); }

// ---------- input ----------
const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
canvas.addEventListener('pointerdown', e => {
  e.preventDefault(); A.unlock();
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  const p = pos(e), now = performance.now() / 1000;
  pointers.set(e.pointerId, { pts: [{ x: p.x, y: p.y, t: now }] });
  S.tap(sim, p.x, p.y);
});
canvas.addEventListener('pointermove', e => {
  const ptr = pointers.get(e.pointerId); if (!ptr) return;
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ce of list.length ? list : [e]) {
    const p = pos(ce), now = performance.now() / 1000, last = ptr.pts[ptr.pts.length - 1];
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    if (d < 2) continue;
    S.swipe(sim, last.x, last.y, p.x, p.y);
    if (balloons.length) popBalloonAt(last.x, last.y, p.x, p.y);
    const speed = d / Math.max(0.004, now - last.t);
    if (speed > 1400 * L.u && now - view.lastSwish > 0.28) { view.lastSwish = now; A.swish(0.45); }
    ptr.pts.push({ x: p.x, y: p.y, t: now });
    if (ptr.pts.length > 64) ptr.pts.shift();
  }
});
const lift = e => { const ptr = pointers.get(e.pointerId); if (!ptr) return; pointers.delete(e.pointerId); trails.push(ptr); };
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
canvas.addEventListener('contextmenu', e => e.preventDefault());

const soundBtn = document.getElementById('sound');
function syncSound() { const m = A.isMuted(); soundBtn.setAttribute('aria-pressed', String(!m)); soundBtn.setAttribute('aria-label', m ? 'Sound off' : 'Sound on'); soundBtn.classList.toggle('muted', m); }
soundBtn.addEventListener('click', () => { A.unlock(); A.setMuted(!A.isMuted()); syncSound(); });
syncSound();

document.addEventListener('visibilitychange', () => {
  A.suspend(document.hidden);
  if (document.hidden) { for (const [id, p] of pointers) trails.push(p); pointers.clear(); }
  last = performance.now();
});
window.addEventListener('resize', resize);

// ---------- drawing ----------
const ease = k => k * k * (3 - 2 * k);
function jarNow() {
  const a = World.jarBox(), k = ease(view.partyK);
  if (k <= 0) return a;
  const cw = L.portrait ? Math.min(L.W * 0.6, 330 * L.u) : 330 * L.u;
  const b = { x: L.W / 2, y: L.H - (L.portrait ? 120 : 30) * L.u, w: cw, h: cw * 1.42 };
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) };
}
// The celebration's sunbeams, baked once per size.
let raysCv = null;
function rays() {
  const side = Math.ceil(Math.hypot(L.W, L.H) * 2 * Math.min(dpr, 1.5));
  if (raysCv && raysCv.width === side) return raysCv;
  raysCv = layer(side, side); const rg = raysCv.getContext('2d'), c = side / 2, k = side / 2 / Math.hypot(L.W, L.H) / 1;
  rg.translate(c, c);
  for (let i = 0; i < 14; i++) { rg.save(); rg.rotate(i / 14 * TAU); const gr = rg.createLinearGradient(0, 0, 0, -c); gr.addColorStop(0, 'rgba(255,240,170,0.4)'); gr.addColorStop(1, 'rgba(255,240,170,0)'); rg.fillStyle = gr; rg.beginPath(); rg.moveTo(0, 0); rg.lineTo(-60 * L.u * k * 2, -c); rg.lineTo(60 * L.u * k * 2, -c); rg.fill(); rg.restore(); }
  return raysCv;
}
function sprite(img, x, y, rot, s, alpha = 1) {
  g.save(); g.translate(x, y); g.rotate(rot); if (alpha !== 1) g.globalAlpha = alpha;
  g.drawImage(img, -s / 2, -s / 2, s, s); g.restore();
}
// Where each kind's face sits (fruit radii from the centre) and how big it is.
const FACE = { strawberry: [0, 0.14, 0.72], pineapple: [0, 0.22, 0.68], banana: [0.02, 0.22, 0.5], pear: [0, 0.38, 0.6], lemon: [0, 0.04, 0.72], dragonfruit: [0, 0.08, 0.72], pomegranate: [0, 0.14, 0.76], apple: [0, 0.14, 0.76], watermelon: [0, 0.06, 0.74], mango: [0.04, 0.06, 0.7] };
function fruitMood(f) {
  const age = view.t - (f.seen ??= view.t);
  if ((view.t * 0.31 + f.id * 0.37) % 3.1 < 0.13) return 'sleepy';                    // blink
  if (f.giant) return f.hp >= 3 ? (age < 2 ? 'wow' : 'happy') : f.hp === 2 ? 'wow' : 'giggle';
  for (const p of pointers.values()) { const q = p.pts[p.pts.length - 1]; if (Math.hypot(q.x - f.x, q.y - f.y) < f.r * 2.6) return 'wow'; }
  if (f.mini || f.sparkle) return 'giggle';
  return f.id % 5 === 0 ? 'wink' : 'happy';
}
function fruitLook(f) {
  let best = null, bd = Infinity;
  for (const p of pointers.values()) { const q = p.pts[p.pts.length - 1], d = Math.hypot(q.x - f.x, q.y - f.y); if (d < bd) { bd = d; best = q; } }
  let lx = best ? best.x - f.x : f.vx * 0.4, ly = best ? best.y - f.y : f.vy * 0.15;
  const n = Math.hypot(lx, ly) || 1; const c = Math.cos(-f.rot), s = Math.sin(-f.rot);
  lx /= n; ly /= n; return [lx * c - ly * s, lx * s + ly * c];
}
// squash and stretch: stretched along a fast rise or fall, round at the top,
// a wobbly spring after a bonk (giants) or a tumble out of a bubble
function squashOf(f) {
  const vmax = Math.sqrt(2 * sim.g * L.H * 0.6), v = clamp(Math.abs(f.vy) / vmax, 0, 1);
  let sy = f.giant || f.hover ? 1 : 1 + 0.13 * v - 0.05 * (1 - Math.min(1, v * 4)), sx = 1 / Math.sqrt(sy);
  const q = squash.get(f.id);
  if (q) { const w = Math.sin(q.t * 22) * q.k * 0.16; sx *= 1 + w; sy *= 1 - w; }
  if (f.giant) { const b = Math.sin(view.t * 2.2) * 0.025; sx *= 1 + b; sy *= 1 - b; }
  return [sx, sy];
}
function drawFruitSprite(f) {
  const sp = sprites[f.kind], s = sp.size / dpr * f.r / (sp.r / dpr);
  if (f.sparkle) additive(() => { glow(f.x, f.y, f.r * 1.9, '#fff2a0', 0.75); });
  if (f.giant) additive(() => { glow(f.x, f.y, f.r * (1.7 + Math.sin(view.t * 3) * 0.1), '#fff2a0', 0.55 + (3 - f.hp) * 0.15); });
  const [sx, sy] = squashOf(f);
  g.save(); g.translate(f.x, f.y); g.scale(sx, sy);
  sprite(sp.wholeShadow, f.r * 0.08, f.r * 0.22, f.rot, s);
  // a giant is painted from its paths, so it stays crisp at its size
  if (f.giant) drawFruit(f.kind, 0, 0, f.r, f.rot); else sprite(sp.whole, 0, 0, f.rot, s);
  g.rotate(f.rot);
  if (f.giant && f.hp < 3) cracks(f);
  const fc = FACE[f.kind] || [0, 0.08, 0.8];
  Fr.face(fc[0] * f.r, fc[1] * f.r, fc[2] * f.r, fruitMood(f), fruitLook(f));
  g.restore();
  if (f.sparkle) for (let i = 0; i < 4; i++) { const a = view.t * 1.8 + i * TAU / 4; sparkle(f.x + Math.cos(a) * f.r * 1.25, f.y + Math.sin(a) * f.r * 1.25, f.r * (0.16 + 0.08 * Math.sin(view.t * 6 + i)), 1); }
}
const CRACKS = [[[-0.2, -0.95], [-0.1, -0.7], [-0.28, -0.55], [-0.12, -0.38]], [[0.85, -0.5], [0.62, -0.42], [0.7, -0.2], [0.5, -0.08]], [[-0.95, 0.25], [-0.72, 0.2], [-0.78, 0.45]], [[0.4, 0.88], [0.32, 0.66], [0.5, 0.55]]];
function cracks(f) {
  const n = (3 - f.hp) * 2, r = f.r;
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  for (let i = 0; i < n && i < CRACKS.length; i++) {
    g.beginPath(); CRACKS[i].forEach((p, j) => j ? g.lineTo(p[0] * r, p[1] * r) : g.moveTo(p[0] * r, p[1] * r));
    g.strokeStyle = '#7a3a00'; g.lineWidth = r * 0.06; g.stroke(); g.strokeStyle = '#ffe680'; g.lineWidth = r * 0.03; g.stroke();
    additive(() => { g.strokeStyle = 'rgba(255,250,200,0.7)'; g.lineWidth = r * 0.09; g.stroke(); });
  }
  g.restore();
}
function drawBubble(b) {
  const inside = b.inside;
  Fr.bubble(b.x, b.y, b.r, (x, y, r) => {
    if (inside.type === 'fruit') { const sp = sprites[inside.kind], s = sp.size / dpr * r / (sp.r / dpr) * 0.9; sprite(sp.whole, x, y, Math.sin(view.t + b.id) * 0.2, s); const fc = FACE[inside.kind] || [0, 0.08, 0.8]; Fr.face(x + fc[0] * r * 0.9, y + fc[1] * r * 0.9, fc[2] * r * 0.9, 'sleepy'); }
    else B.drawTreat(inside.kind, x, y, r * 0.95, Math.sin(view.t * 1.5 + b.id) * 0.3);
  });
}
const BALLOON_COLS = ['#ff4f9a', '#3fb8ff', '#ffd23a', '#7ae04a', '#b06aff', '#ff9f1c'];
function drawTrail(ptr, now, fade) {
  const pts = ptr.pts.filter(p => now - p.t < 0.16).map(p => [p.x, p.y]);
  if (pts.length < 2) return;
  World.trail(pts, 15 * L.u * (fade ?? 1), ptr.pts.length);
}
function drawHint(f) {
  const k = (view.t % 1.8) / 1.8, a = Math.min(1, (sim.idle - S.HINT_AFTER) * 2) * (k < 0.85 ? 1 : (1 - k) / 0.15);
  const x0 = f.x - f.r * 2.2, y0 = f.y + f.r * 1.2, x1 = f.x + f.r * 2.2, y1 = f.y - f.r * 0.8, e = ease(Math.min(1, k / 0.7));
  const hx = lerp(x0, x1, e), hy = lerp(y0, y1, e) - Math.sin(e * Math.PI) * f.r * 0.5;
  g.save(); g.globalAlpha = a;
  g.setLineDash([2, 18 * L.u]); g.lineCap = 'round'; g.lineWidth = 10 * L.u; g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(f.x, f.y - f.r * 0.9, x1, y1); g.stroke(); g.setLineDash([]);
  World.hand(hx, hy, f.r * 1.2, -0.6);
  g.restore();
}

function render(now) {
  const { W, H, u } = L;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.drawImage(bg, 0, 0, W, H);
  // sun and drifting clouds
  for (const c of cloudSprites) {
    const span = W + c.cw * 2, x = ((c.x + view.t * (6 + c.seed * 3) * u) % span + span) % span - c.cw;
    g.drawImage(c.cv, x - c.cw / 2, c.y - c.s * 1.45, c.cw, c.ch);
  }
  const sp = World.sunPos(), k = 1 + 0.12 * Math.sin(view.bounce * Math.PI) * view.bounce;
  g.save(); g.translate(sp.x, sp.y + Math.sin(view.t * 1.3) * 4 * u); g.scale(k, 2 - k);
  World.sunFriend(0, 0, sp.r, view.mood, view.t * 0.12); g.restore();
  if (view.partyK > 0) { g.save(); g.globalAlpha = ease(view.partyK); World.rainbow(W / 2, L.HZ + 30 * u, Math.min(W * 0.42, 620 * u), 30 * u); g.restore(); }
  g.drawImage(stains, 0, 0, W, H);
  B.drawBunny(pals);
  // jar (comes forward and grows for the party)
  const jb = jarNow(), pk = ease(view.partyK);
  if (pk > 0) additive(() => {
    const R = rays(), s = R.width / dpr;
    g.save(); g.translate(jb.x, jb.y - jb.h * 0.5); g.rotate(view.t * 0.2); g.globalAlpha = pk * 0.8; g.drawImage(R, -s / 2, -s / 2, s, s); g.restore();
  });
  const target = sim.phase === 'drain' ? 1 - Math.min(1, sim.drainT / (S.DRAIN_TIME * 0.85)) : sim.stripes.length / S.JAR_CAP;
  const layers = sim.phase === 'drain' && sim.stripes.length === 0 ? [] : sim.stripes.map(kd => FRUIT[kd].juice);
  const w = Math.sin(view.wob * 14) * view.wob * 0.07;
  g.save(); g.translate(jb.x, jb.y); g.scale(1 + w, 1 - w); g.translate(-jb.x, -jb.y);
  World.jar(jb.x, jb.y, jb.w, jb.h, layers.length ? layers : ['#ffffff'], { fill: layers.length ? Math.max(0.02, view.fill) : 0, face: pk > 0.5 || sim.phase === 'drain', glow: pk > 0.2, cream: pk > 0.35 && sim.phase === 'party' });
  g.restore();
  B.drawChick(pals);
  FX.drawFxBack(fx);
  for (const h of sim.halves) {
    const sp = sprites[h.kind], s2 = sp.size / dpr * h.r / (sp.r / dpr);
    sprite(sp.halfShadow, h.x + h.r * 0.08, h.y + h.r * 0.2, h.rot, s2);
    if (h.r > sp.r / dpr * 1.4) drawHalf(h.kind, h.x, h.y, h.r, h.rot); else sprite(sp.half, h.x, h.y, h.rot, s2);
    g.save(); g.translate(h.x, h.y); g.rotate(h.rot); Fr.face(0, -h.r * 0.42, h.r * 0.48, h.side ? 'giggle' : 'yum'); g.restore();
  }
  for (const f of sim.fruits) drawFruitSprite(f);
  for (const b of sim.bubbles) drawBubble(b);
  for (const t of treats) B.drawTreat(t.kind, t.x, t.y, fruitR * 0.5, t.rot);
  FX.drawFxFront(fx);
  B.drawFront(pals);
  for (const b of balloons) Fr.balloon(b.x + Math.sin(view.t * 1.3 + b.ph) * b.r * 0.3, b.y, b.r, b.col);
  if (pk > 0.6 && sim.phase === 'party') {
    const t = view.t;
    sticker('star', jb.x - jb.w * 0.95, jb.y - jb.h * 0.75 + Math.sin(t * 3) * 8 * u, 46 * u, Math.sin(t * 2) * 0.3);
    sticker('star', jb.x + jb.w * 0.95, jb.y - jb.h * 0.8 + Math.cos(t * 3) * 8 * u, 40 * u, Math.cos(t * 2) * 0.3);
    sticker('heart', jb.x - jb.w * 0.75, jb.y - jb.h * 0.25 + Math.sin(t * 4) * 6 * u, 34 * u);
    sticker('heart', jb.x + jb.w * 0.75, jb.y - jb.h * 0.22 + Math.cos(t * 4) * 6 * u, 36 * u);
  }
  // swipe trails
  const ns = frozen ? frozenAt : now / 1000;
  for (const p of pointers.values()) drawTrail(p, ns);
  for (let i = trails.length - 1; i >= 0; i--) { const tr = trails[i], age = ns - tr.pts[tr.pts.length - 1].t; if (age > 0.2) { trails.splice(i, 1); continue; } drawTrail({ pts: tr.pts.map(p => ({ ...p, t: p.t + age * 0.5 })) }, ns, 1 - age / 0.2); }
  const hint = S.hintTarget(sim); if (hint) drawHint(hint);
  // title
  if (view.titleK > 0.01) {
    const tk = ease(view.titleK);
    g.save(); g.globalAlpha = tk;
    World.logo(W / 2, H * (L.portrait ? 0.26 : 0.3) - (1 - tk) * H * 0.4, (L.portrait ? 92 : 150) * u, view.t);
    World.playButton(W / 2, H * (L.portrait ? 0.45 : 0.6), 95 * u * tk, Math.sin(view.t * 4) * 0.5 + 0.5);
    g.restore();
  }
}

// ---------- loop ----------
let last = performance.now(), frozen = false, frozenAt = 0;
function update(dt) {
  if (!frozen) S.step(sim, dt);
  for (const ev of S.drainEvents(sim)) handle(ev);
  if (frozen) return;
  view.t += dt;
  view.moodT -= dt; if (view.moodT <= 0 && view.mood !== 'smile' && sim.phase !== 'party') view.mood = 'smile';
  view.bounce = Math.max(0, view.bounce - dt * 2.2);
  view.wob = Math.max(0, view.wob - dt * 1.6);
  view.fill += (sim.stripes.length / S.JAR_CAP - view.fill) * Math.min(1, dt * 5);
  if (sim.phase === 'drain') view.fill = 1 - Math.min(1, sim.drainT / (S.DRAIN_TIME * 0.85));
  const wantParty = sim.phase === 'party' || (sim.phase === 'drain' && sim.drainT < S.DRAIN_TIME * 0.9) ? 1 : 0;
  view.partyK = clamp(view.partyK + (wantParty ? dt * 1.4 : -dt * 1.8), 0, 1);
  view.titleK = clamp(view.titleK + (sim.phase === 'title' ? dt : -dt * 2), 0, 1);
  if (sim.phase === 'party') {
    view.fireT -= dt;
    if (view.fireT <= 0) { view.fireT = 0.65 + Math.random() * 0.4; FX.firework(fx, L.W * (0.15 + Math.random() * 0.7), L.H * (0.1 + Math.random() * 0.3), L.u); A.firework(); }
  }
  pals.dance = sim.phase === 'party';
  const lookAt = sim.fruits.length ? sim.fruits.reduce((a, f) => f.y < a.y ? f : a).x : null;
  for (const a of B.step(pals, dt, lookAt)) { if (a.to === 'bunny') A.munch(); else if (a.item.type !== 'drop' || Math.random() < 0.3) A.chirp(); }
  for (const [id, q] of squash) { q.t += dt; q.k -= dt * 1.6; if (q.k <= 0) squash.delete(id); }
  for (const t of treats) { t.t += dt; t.x += t.vx * dt; t.y += t.vy * dt; t.vy += sim.g * 1.2 * dt; t.rot += t.spin * dt; }
  for (let i = treats.length - 1; i >= 0; i--) if (treats[i].y > L.H + 80 * L.u) treats.splice(i, 1);
  // party balloons drift up from the blanket, ready to be popped
  if (sim.phase === 'party') { view.balloonT -= dt; if (view.balloonT <= 0 && balloons.length < 7) { view.balloonT = 0.55 + Math.random() * 0.4; const r = (L.portrait ? 44 : 54) * L.u; balloons.push({ x: L.W * (0.08 + Math.random() * 0.84), y: L.H + r * 1.2, r, vy: -(120 + Math.random() * 70) * L.u, ph: Math.random() * TAU, col: BALLOON_COLS[Math.floor(Math.random() * BALLOON_COLS.length)] }); } }
  for (const b of balloons) b.y += b.vy * dt;
  for (let i = balloons.length - 1; i >= 0; i--) if (balloons[i].y < -balloons[i].r * 4) balloons.splice(i, 1);
  const landed = FX.stepFx(fx, dt, sim.g);
  if (landed.length) {
    const b = World.basketPos();
    stainG.setTransform(dpr, 0, 0, dpr, 0, 0); use(stainG);
    for (const p of landed) { const seed = Math.floor(p.x * 7 + p.y); if (seed % 2 || (Math.abs(p.x - b.x) < b.s * 1.1 && p.y > b.y - b.s * 0.5)) continue; stain(p.x, p.y, p.r * 3.4, p.col, seed, 0.7); }
    use(g);
  }
  view.stainT += dt;
  if (view.stainT > 0.25) { view.stainT = 0; stainG.setTransform(1, 0, 0, 1, 0, 0); stainG.globalCompositeOperation = 'destination-out'; stainG.fillStyle = 'rgba(0,0,0,0.02)'; stainG.fillRect(0, 0, stains.width, stains.height); stainG.globalCompositeOperation = 'source-over'; }
}
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (!document.hidden) { update(dt); render(now); }
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(t => { last = t; frame(t); });

// ---------- debug ----------
if (DEBUG) {
  const stepMs = ms => { const was = frozen; frozen = false; sim.frozen = false; let left = ms / 1000; while (left > 1e-6) { const d = Math.min(1 / 60, left); update(d); left -= d; } frozen = was; sim.frozen = was; if (was) frozenAt = performance.now() / 1000; render(performance.now()); };
  window.__js = {
    sim, fx, view, A, S,
    layout: () => ({ ...L, dpr, fruitR }),
    freeze() { frozen = true; sim.frozen = true; frozenAt = performance.now() / 1000; },
    thaw() { frozen = false; sim.frozen = false; },
    step: stepMs,
    start() { S.start(sim); },
    // put a fruit at (x, y) that hovers until cut
    spawn(kind = 'apple', x = L.W / 2, y = L.H / 2, opt = {}) { const f = S.launch(sim, kind, { x, y, hover: true, ...opt }); return f.id; },
    clear() { sim.fruits.length = 0; },
    noSpawn(on = true) { sim.noSpawn = on; },
    swipe(x0, y0, x1, y1, n = 8) { const ptr = { pts: [] }, t0 = performance.now() / 1000; for (let i = 0; i <= n; i++) { const k = i / n, x = lerp(x0, x1, k), y = lerp(y0, y1, k); if (i) S.swipe(sim, ptr.pts[i - 1].x, ptr.pts[i - 1].y, x, y); ptr.pts.push({ x, y, t: t0 - (n - i) * 0.012 }); } trails.push(ptr); },
    tap(x, y) { A.unlock(); S.tap(sim, x, y); },
    fill(n = S.JAR_CAP) { for (let i = 0; i < n; i++) sim.pending.push({ t: 0, kind: KINDS[i % KINDS.length] }); },
    state: () => ({ phase: sim.phase, fruits: sim.fruits.map(f => ({ id: f.id, kind: f.kind, x: f.x, y: f.y, r: f.r, sparkle: f.sparkle, giant: !!f.giant, hp: f.hp, mini: !!f.mini, hover: !!f.hover })), bubbles: sim.bubbles.length, giants: sim.giants, popped: sim.popped, treats: treats.length, balloons: balloons.length, halves: sim.halves.length, stripes: sim.stripes.length, sliced: sim.sliced, launched: sim.launched, rounds: sim.rounds, idle: sim.idle, hint: !!S.hintTarget(sim), audio: A.state(), drops: fx.drops.length, layout: { ...L, dpr, fruitR } }),
    render: () => render(performance.now()),
    giant(kind) { return S.launchGiant(sim, kind).id; },
    bubble(type = 'fruit', kind = 'strawberry', x, y) { const b = S.addBubble(sim, { type, kind }, x); if (y != null) b.y = y; return b.id; },
    bubbles: () => sim.bubbles.map(b => ({ id: b.id, x: b.x, y: b.y, r: b.r, inside: b.inside })),
    buddies: () => ({ bunny: { ...pals.bunny, head: B.mouths(pals).bunny, snack: undefined }, chick: { ...pals.chick }, flyers: pals.flyers.length, dance: pals.dance }),
    poke(who) { B.poke(pals, who); A.boing(); },
    feed(who = 'bunny', kind = 'watermelon') { if (who === 'bunny') B.feedBunny(pals, L.W / 2, L.H / 3, { type: 'half', kind }); else B.feedChick(pals, L.W / 2, L.H / 3, FRUIT[kind].juice); },
    balloons: () => balloons.map(b => ({ x: b.x, y: b.y, r: b.r })),
  };
}
