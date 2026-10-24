// Feed the Monster: a game for toddlers. Big fruits float around a friendly
// monster; drag one into its mouth, or just tap it and it flies in. Every
// fruit fills a star at the top, and five stars make the monster dance under
// a rainbow and change colour. There is no way to lose, no timer and no text.
//
// Debug switches: ?debug exposes window.__fm (freeze, thaw, step(ms),
// feed(i) taps fruit i, drag(i, x, y) holds fruit i at a point, drop(i)
// releases it, tickle, celebrate, idle (asks for food), state), and ?cover
// hides the two corner buttons.
import { Monster, PALETTES } from './monster.js';
import { Scene, star } from './scene.js';
import { KINDS, CRUMBS, makeSprites } from './fruits.js';
import { sfx, unlock, isMuted, setMuted, suspend, audioContext } from './audio.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
if (params.has('cover')) document.body.classList.add('cover');

const ROUND = 5; // fruits per celebration
const IDLE_HINT = 7; // seconds of quiet before the monster asks for food

const canvas = document.getElementById('scene');
const g = canvas.getContext('2d');
const monster = new Monster();
const scene = new Scene();

let W = 0;
let H = 0;
let dpr = 1;
let fruitR = 40;
let sprites = null;
let slots = [];
const fruits = [];
const timers = [];
let stars = []; // fill animation per star
let celebrating = false;
let idle = 0;
let lastKind = null;
let frozen = false;

const later = (s, fn) => timers.push({ t: s, fn });
const ease = (t) => 1 - Math.pow(1 - t, 3);
const elastic = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -9 * t) * Math.cos(t * 9.5));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// ---------------------------------------------------------------- layout

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const u = Math.min(W, H);
  fruitR = Math.max(34, u * 0.1);
  let pos;
  if (W > H) {
    monster.R = Math.min(H * 0.27, W * 0.18);
    monster.x = W / 2;
    monster.y = H * 0.6;
    const cx = Math.max(fruitR * 1.1 + W * 0.045, Math.min(W * 0.18, W / 2 - monster.R * 1.5 - fruitR * 1.2));
    pos = [
      [cx, 0.3], [cx - W * 0.045, 0.55], [cx, 0.8],
      [W - cx, 0.3], [W - cx + W * 0.045, 0.55], [W - cx, 0.8],
    ].map(([x, y]) => [x, H * y]);
  } else {
    monster.R = Math.min(W * 0.3, H * 0.2);
    monster.x = W / 2;
    monster.y = H * 0.68;
    pos = [
      [0.2, 0.17], [0.5, 0.15], [0.8, 0.17],
      [0.32, 0.33], [0.68, 0.33],
    ].map(([x, y]) => [W * x, H * y]);
  }
  const groundY = monster.y + monster.R * 0.95;
  scene.layout(W, H, dpr, groundY, monster.x, monster.R);
  sprites = makeSprites(fruitR, dpr);

  // keep fruits that are already out; move them to their new homes
  const old = slots;
  slots = pos.map(([x, y], i) => ({ x, y, fruit: old[i]?.fruit || null, respawn: old[i] ? old[i].respawn : 0.2 + i * 0.12 }));
  for (let i = slots.length; i < old.length; i++) {
    const f = old[i].fruit;
    if (f) fruits.splice(fruits.indexOf(f), 1);
  }
  for (const s of slots) {
    if (!s.fruit) continue;
    s.fruit.homeX = s.x;
    s.fruit.homeY = s.y;
    if (s.fruit.state === 'idle' || s.fruit.state === 'spawn') {
      s.fruit.x = s.x;
      s.fruit.y = s.y;
    }
  }
  if (stars.length !== ROUND) stars = Array.from({ length: ROUND }, () => ({ on: false, t: 0 }));
}

// ---------------------------------------------------------------- fruits

function pickKind() {
  const shown = new Set(fruits.map((f) => f.kind));
  let pool = KINDS.filter((k) => !shown.has(k) && k !== lastKind);
  if (!pool.length) pool = KINDS.filter((k) => k !== lastKind);
  return pool[Math.floor(Math.random() * pool.length)];
}

function spawn(slotIndex) {
  const s = slots[slotIndex];
  const f = {
    kind: pickKind(),
    slot: slotIndex,
    x: s.x,
    y: s.y,
    homeX: s.x,
    homeY: s.y,
    state: 'spawn',
    t: 0,
    scale: 0,
    rot: 0,
    phase: Math.random() * 6,
    hint: 0,
    pid: null,
  };
  s.fruit = f;
  fruits.push(f);
  sfx.pop();
}

function grab(f, p, pid) {
  f.state = 'drag';
  f.pid = pid;
  f.offX = f.x - p.x;
  f.offY = f.y - p.y;
  f.downX = p.x;
  f.downY = p.y;
  f.moved = 0;
  f.vx = 0;
  f.hint = 0;
  sfx.pickup();
}

function release(f) {
  f.pid = null;
  const toMonster = dist(f.x, f.y, monster.x, monster.y);
  const toHome = dist(f.x, f.y, f.homeX, f.homeY);
  if (f.moved < fruitR * 0.6 || toMonster < monster.R * 1.7 || toMonster < toHome) fly(f);
  else {
    f.state = 'home';
    f.t = 0;
    f.fromX = f.x;
    f.fromY = f.y;
  }
}

function fly(f) {
  f.state = 'fly';
  f.t = 0;
  f.fromX = f.x;
  f.fromY = f.y;
  const d = dist(f.x, f.y, monster.mouthX, monster.mouthY);
  f.dur = 0.4 + d / 2200;
  f.arc = Math.min(H * 0.18, d * 0.35);
  sfx.whoosh();
}

function eat(f) {
  const s = slots[f.slot];
  if (s.fruit === f) {
    s.fruit = null;
    s.respawn = 0.8;
  }
  fruits.splice(fruits.indexOf(f), 1);
  lastKind = f.kind;
  idle = 0;
  monster.chomp();
  sfx.chomp();
  try {
    navigator.vibrate?.(25);
  } catch {}
  scene.emit('crumb', monster.mouthX, monster.mouthY, 16, {
    colors: CRUMBS[f.kind], angle: -Math.PI / 2, spread: 2.6, speed: 0.75, size: 0.016, grav: 2.2, life: 0.9,
  });
  for (let i = 0; i < 3; i++) later(0.28 + i * 0.22, () => sfx.nom(i));
  later(0.95, () => swallow());
}

function swallow() {
  sfx.yum();
  monster.joy = 1.3;
  scene.emit('heart', monster.x, monster.y - monster.R * 0.9, 5, {
    colors: ['#ff4f8b', '#ff7aa8', '#ff3b6b'], angle: -Math.PI / 2, spread: 1.6, speed: 0.35, grav: -0.15, drag: 1.5, size: 0.035, life: 1.6,
  });
  if (celebrating) return;
  const n = stars.findIndex((s) => !s.on);
  if (n < 0) return;
  stars[n].on = true;
  stars[n].t = 0;
  monster.fed = n + 1;
  later(0.15, () => sfx.star(n));
  if (n + 1 === ROUND) later(0.6, celebrate);
}

function celebrate() {
  celebrating = true;
  monster.dance = 3.3;
  sfx.fanfare();
  later(1.6, () => sfx.burp());
  later(1.75, () => sfx.giggle());
  const colors = ['#ff4b4b', '#ff9f1c', '#ffe14a', '#5fce4f', '#3bb3ff', '#8b5cf6', '#ff5fa8'];
  for (let k = 0; k < 4; k++) {
    later(k * 0.45, () => {
      scene.emit('confetti', W * (0.2 + Math.random() * 0.6), H * 0.05, 40, {
        colors, angle: Math.PI / 2, spread: 2.4, speed: 0.6, grav: 0.6, drag: 1.4, size: 0.014, life: 2.6,
      });
      scene.emit('star', monster.x, monster.y - monster.R * 0.5, 8, {
        colors: ['#ffe14a', '#fff6b0'], speed: 0.9, grav: 0.8, size: 0.03, life: 1.2,
      });
    });
  }
  later(3.5, () => {
    // a puff of smoke and a new colour for the next round
    monster.pal = (monster.pal + 1) % PALETTES.length;
    monster.fed = 0;
    for (const s of stars) s.on = false;
    scene.emit('puff', monster.x, monster.y, 14, { colors: ['#ffffff'], speed: 0.5, grav: 0, drag: 3, size: 0.06, life: 0.8 });
    sfx.poof();
    monster.joy = 1;
    celebrating = false;
  });
}

function askForFood() {
  monster.gape = 1.2;
  monster.squashV -= 6;
  sfx.hungry();
  const ready = fruits.filter((f) => f.state === 'idle');
  if (ready.length) {
    const f = ready[Math.floor(Math.random() * ready.length)];
    f.hint = 1.6;
    monster.lookAt = { x: f.x, y: f.y };
    later(1.4, () => (monster.lookAt = null));
  }
}

// ---------------------------------------------------------------- input

const drags = new Map();

function point(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function fruitAt(p) {
  let best = null;
  let bd = fruitR * 1.4;
  for (const f of fruits) {
    if (f.state === 'drag' || f.state === 'fly') continue;
    const d = dist(p.x, p.y, f.x, f.y);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

function down(p, pid) {
  unlock();
  idle = 0;
  const f = fruitAt(p);
  if (f) {
    grab(f, p, pid);
    drags.set(pid, f);
    return;
  }
  if (monster.contains(p.x, p.y)) {
    monster.tickle();
    sfx.giggle();
    scene.emit('heart', p.x, p.y, 3, { colors: ['#ff4f8b', '#ff7aa8'], angle: -Math.PI / 2, spread: 1.4, speed: 0.3, grav: -0.2, drag: 1.5, size: 0.03, life: 1.2 });
  } else {
    sfx.sparkle();
    scene.emit('star', p.x, p.y, 7, { colors: ['#ffe14a', '#ffffff', '#ff9fd0'], speed: 0.35, grav: 0.3, drag: 2, size: 0.022, life: 0.8 });
  }
}

function move(p, pid) {
  const f = drags.get(pid);
  if (!f) return;
  const nx = p.x + f.offX;
  const ny = p.y + f.offY;
  f.vx = nx - f.x;
  f.x = nx;
  f.y = ny;
  f.moved = Math.max(f.moved, dist(p.x, p.y, f.downX, f.downY));
  // the monster snaps it out of your hand once it reaches the mouth
  if (dist(f.x, f.y, monster.mouthX, monster.mouthY) < monster.R * 0.55) {
    drags.delete(pid);
    eat(f);
  }
}

function up(pid) {
  const f = drags.get(pid);
  if (!f) return;
  drags.delete(pid);
  release(f);
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
  down(point(e), e.pointerId);
});
canvas.addEventListener('pointermove', (e) => move(point(e), e.pointerId));
canvas.addEventListener('pointerup', (e) => up(e.pointerId));
canvas.addEventListener('pointercancel', (e) => up(e.pointerId));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const soundBtn = document.getElementById('sound');
function showSound() {
  soundBtn.setAttribute('aria-pressed', String(!isMuted()));
  soundBtn.setAttribute('aria-label', isMuted() ? 'Sound off' : 'Sound on');
}
soundBtn.addEventListener('click', () => {
  unlock();
  setMuted(!isMuted());
  showSound();
});
showSound();

document.addEventListener('visibilitychange', () => suspend(document.hidden));
window.addEventListener('resize', layout);

// ---------------------------------------------------------------- update

function update(dt) {
  for (let i = timers.length - 1; i >= 0; i--) {
    timers[i].t -= dt;
    if (timers[i].t <= 0) {
      const fn = timers[i].fn;
      timers.splice(i, 1);
      fn();
    }
  }

  slots.forEach((s, i) => {
    if (s.fruit) return;
    s.respawn -= dt;
    if (s.respawn <= 0) spawn(i);
  });

  let excite = 0;
  let look = null;
  for (const f of [...fruits]) {
    f.t += dt;
    f.hint = Math.max(0, f.hint - dt);
    if (f.state === 'spawn') {
      f.scale = elastic(Math.min(1, f.t / 0.55));
      if (f.t >= 0.55) {
        f.state = 'idle';
        f.t = 0;
      }
    }
    if (f.state === 'idle' || f.state === 'spawn') {
      f.x = f.homeX;
      f.y = f.homeY + Math.sin(f.t * 2 + f.phase) * fruitR * 0.07;
      f.rot = Math.sin(f.t * 1.6 + f.phase) * 0.06 + (f.hint > 0 ? Math.sin(f.hint * 18) * 0.25 : 0);
      if (f.state === 'idle') f.scale = 1 + (f.hint > 0 ? Math.abs(Math.sin(f.hint * 6)) * 0.12 : 0);
    } else if (f.state === 'drag') {
      f.scale += (1.15 - f.scale) * Math.min(1, dt * 15);
      f.rot += (Math.max(-0.4, Math.min(0.4, f.vx * 0.03)) - f.rot) * Math.min(1, dt * 10);
      f.vx *= 0.8;
      const d = dist(f.x, f.y, monster.mouthX, monster.mouthY);
      excite = Math.max(excite, Math.min(1, Math.max(0.2, 1 - (d - monster.R * 0.5) / (monster.R * 2.6))));
      look = { x: f.x, y: f.y };
    } else if (f.state === 'fly') {
      const k = Math.min(1, f.t / f.dur);
      const e = ease(k);
      const tx = monster.mouthX;
      const ty = monster.mouthY;
      f.x = f.fromX + (tx - f.fromX) * e;
      f.y = f.fromY + (ty - f.fromY) * e - Math.sin(k * Math.PI) * f.arc;
      f.scale = 1.1 - 0.35 * e;
      f.rot += dt * 8;
      excite = 1;
      look = { x: f.x, y: f.y };
      if (k >= 1) eat(f);
    } else if (f.state === 'home') {
      const k = Math.min(1, f.t / 0.35);
      const e = ease(k);
      f.x = f.fromX + (f.homeX - f.fromX) * e;
      f.y = f.fromY + (f.homeY - f.fromY) * e;
      f.scale = 1.15 - 0.15 * e;
      f.rot *= 0.9;
      if (k >= 1) {
        f.state = 'idle';
        f.t = 0;
      }
    }
  }
  if (monster.chew > 0) excite = 0;
  monster.exciteTarget = excite;
  if (look) monster.lookAt = look;
  else if (monster.gape <= 0) monster.lookAt = null;
  monster.update(dt);

  scene.rainbow += ((celebrating ? 1 : 0) - scene.rainbow) * Math.min(1, dt * 2.5);
  scene.update(dt);
  for (const s of stars) s.t += dt;

  if (!drags.size && !fruits.some((f) => f.state === 'fly') && !celebrating && monster.chew <= 0) {
    idle += dt;
    if (idle > IDLE_HINT) {
      idle = 0;
      askForFood();
    }
  }
}

// ---------------------------------------------------------------- draw

function drawFruit(f) {
  const { size, scale } = sprites;
  g.save();
  g.translate(f.x, f.y);
  if (f.state === 'idle' || f.state === 'spawn') {
    // a soft glow so each fruit reads as something to touch
    const gr = fruitR * 1.3 * f.scale;
    const glow = g.createRadialGradient(0, 0, gr * 0.4, 0, 0, gr);
    glow.addColorStop(0, `rgba(255,255,255,${0.55 + (f.hint > 0 ? 0.3 : 0)})`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(0, 0, gr, 0, Math.PI * 2);
    g.fill();
  }
  g.rotate(f.rot);
  const s = size * scale * f.scale;
  g.drawImage(sprites.sprites[f.kind], -s / 2, -s / 2, s, s);
  g.restore();
}

function drawStars() {
  const r = Math.max(13, Math.min(W, H) * 0.035);
  const gap = r * 2.6;
  const y = Math.max(32, r + 14);
  const x0 = W / 2 - (gap * (ROUND - 1)) / 2;
  stars.forEach((s, i) => {
    g.save();
    g.translate(x0 + i * gap, y);
    let k = 1;
    if (s.on && s.t < 0.5) k = 1 + Math.sin((s.t / 0.5) * Math.PI) * 0.5;
    if (celebrating) k = 1 + Math.abs(Math.sin(performance.now() / 160 + i)) * 0.25;
    g.scale(k, k);
    star(g, r, r * 0.48);
    g.lineJoin = 'round';
    if (s.on) {
      g.fillStyle = '#ffd23f';
      g.fill();
      g.lineWidth = r * 0.18;
      g.strokeStyle = '#ff9f1c';
      g.stroke();
    } else {
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fill();
      g.lineWidth = r * 0.14;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.stroke();
    }
    g.restore();
  });
}

function draw() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  scene.drawBack(g, monster.x, monster.y + monster.R * 0.95, Math.min(W * 0.48, monster.R * 2.6));
  for (const f of fruits) if (f.state !== 'drag' && f.state !== 'fly') drawFruit(f);
  monster.draw(g);
  for (const f of fruits) if (f.state === 'fly') drawFruit(f);
  for (const f of fruits) if (f.state === 'drag') drawFruit(f);
  scene.drawParts(g);
  drawStars();
}

// ---------------------------------------------------------------- loop

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!frozen) update(dt);
  draw();
  requestAnimationFrame(frame);
}

layout();
requestAnimationFrame(frame);

if (DEBUG) {
  const step = (ms) => {
    for (let t = 0; t < ms; t += 1000 / 60) update(1 / 60);
    draw();
  };
  window.__fm = {
    freeze: () => (frozen = true),
    thaw: () => (frozen = false),
    step,
    feed: (i = 0) => {
      const f = slots[i]?.fruit;
      if (f && f.state !== 'fly') fly(f);
    },
    drag: (i, x, y) => {
      const f = slots[i]?.fruit;
      if (!f) return;
      if (f.state !== 'drag') grab(f, { x: f.x, y: f.y }, 'debug' + i);
      f.x = x;
      f.y = y;
      f.moved = fruitR * 2;
    },
    drop: (i) => {
      const f = slots[i]?.fruit;
      if (f && f.state === 'drag') release(f);
    },
    tickle: () => monster.tickle(),
    celebrate: () => {
      stars.forEach((s) => (s.on = true));
      monster.fed = ROUND;
      celebrate();
    },
    idle: askForFood,
    state: () => ({
      fed: monster.fed,
      palette: monster.pal,
      celebrating,
      fruits: fruits.map((f) => ({ kind: f.kind, state: f.state, x: Math.round(f.x), y: Math.round(f.y) })),
      audio: audioContext()?.state || 'none',
    }),
    monster,
    scene,
  };
}
