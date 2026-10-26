// Juicy Splash: a fruit-slicing game for toddlers. Big fruit float up slowly
// over a sunny orchard picnic; any swipe or tap cuts them open with a juicy
// splat, the sun giggles, and the juice flies into a glass jar. Ten stripes
// fill the jar and it becomes a smiling rainbow smoothie with confetti and
// fireworks, then it is drunk up and play goes on. No text, no losing.
//
// Modules: sim.js (rules, Node-testable), fruits.js (fruit art baked into
// sprites), world.js (orchard, sun, jar, trail), fx.js (particles),
// audio.js (Web Audio music and effects), draw.js (helpers).
//
// URL switches: ?play starts straight into a game, ?fruit=<kind> tosses only
// that fruit, ?seed=N, ?cover hides the buttons, ?quality=low draws at 1x,
// ?debug exposes window.__js (see the end of this file).
import { use, TAU, lerp, clamp, glow, additive, sparkle, sticker } from './draw.js';
import { FRUIT, KINDS, makeSprites, stain } from './fruits.js';
import * as World from './world.js';
import * as S from './sim.js';
import * as FX from './fx.js';
import * as A from './audio.js';

const P = new URLSearchParams(location.search);
const DEBUG = P.has('debug');
if (P.has('cover')) document.body.classList.add('cover');
const canvas = document.getElementById('scene');
const g = canvas.getContext('2d');
use(g);

const force = KINDS.includes(P.get('fruit')) ? P.get('fruit') : null;
const sim = S.createSim({ seed: +P.get('seed') || (Date.now() & 0xffffff), phase: P.has('play') ? 'play' : 'title', force });
const fx = FX.createFx();
const view = { t: 0, mood: 'smile', moodT: 0, bounce: 0, fill: 0, wob: 0, partyK: 0, titleK: sim.phase === 'title' ? 1 : 0, fireT: 0, stainT: 0, lastSwish: 0 };
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
      FX.stars(fx, ev.x, ev.y, big ? 9 : 3, ev.r);
      const m = jarMouth();
      FX.toJar(fx, ev.x, ev.y, m.x, m.y, ev.kind, S.JAR_DELAY, ev.r);
      if (big) FX.toJar(fx, ev.x, ev.y, m.x, m.y, ev.kind, S.JAR_DELAY + 0.25, ev.r);
      if (ev.how === 'swipe') A.swish(); else A.pop();
      A.splat(ev.r / fruitR, big);
      if (ev.n % 2 === 1 || big) A.giggle(big);
      view.mood = 'laugh'; view.moodT = 1.1; view.bounce = 1;
      break;
    }
    case 'stripe': A.plink(ev.n); view.wob = 1; break;
    case 'party':
      A.fanfare(); A.duck(true); FX.confettiRain(fx, L.W, L.H, L.portrait ? 120 : 180, L.u);
      view.fireT = 0.8; view.mood = 'grin'; view.moodT = 99; view.bounce = 1;
      break;
    case 'firework': FX.firework(fx, ev.x, ev.y, L.u); A.firework(); break;
    case 'tap': FX.ripple(fx, ev.x, ev.y, 60 * L.u); A.boop(ev.x / L.W); break;
    case 'drink': A.slurp(); view.wob = 1; break;
    case 'refill': A.duck(false); view.mood = 'smile'; view.moodT = 0; break;
  }
}

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
function drawFruitSprite(f) {
  const sp = sprites[f.kind], s = sp.size / dpr;
  if (f.sparkle) additive(() => { glow(f.x, f.y, f.r * 1.9, '#fff2a0', 0.75); });
  sprite(sp.wholeShadow, f.x + f.r * 0.08, f.y + f.r * 0.22, f.rot, s);
  sprite(sp.whole, f.x, f.y, f.rot, s);
  if (f.sparkle) for (let i = 0; i < 4; i++) { const a = view.t * 1.8 + i * TAU / 4; sparkle(f.x + Math.cos(a) * f.r * 1.25, f.y + Math.sin(a) * f.r * 1.25, f.r * (0.16 + 0.08 * Math.sin(view.t * 6 + i)), 1); }
}
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
  FX.drawFxBack(fx);
  for (const h of sim.halves) { const s2 = sprites[h.kind].size / dpr; sprite(sprites[h.kind].halfShadow, h.x + h.r * 0.08, h.y + h.r * 0.2, h.rot, s2); sprite(sprites[h.kind].half, h.x, h.y, h.rot, s2); }
  for (const f of sim.fruits) drawFruitSprite(f);
  FX.drawFxFront(fx);
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
    state: () => ({ phase: sim.phase, fruits: sim.fruits.map(f => ({ id: f.id, kind: f.kind, x: f.x, y: f.y, r: f.r, sparkle: f.sparkle })), halves: sim.halves.length, stripes: sim.stripes.length, sliced: sim.sliced, launched: sim.launched, rounds: sim.rounds, idle: sim.idle, hint: !!S.hintTarget(sim), audio: A.state(), drops: fx.drops.length, layout: { ...L, dpr, fruitR } }),
    render: () => render(performance.now()),
  };
}
