// Feed the Monster: a game for toddlers, in a cardboard-box cartoon world.
// Big fruits float around a squishy, big-eyed monster standing on a box;
// drag one into its mouth, or just tap it and it flies in. Soap bubbles
// carrying fruit or a treat float up now and then: pop one and its prize
// flies to the monster. Poke the monster and its jelly body wobbles and it
// giggles; tap the bud on its sprout and it blooms. Leave it alone long
// enough and it yawns and naps until someone touches the screen. Every bite
// sends a star up to the row at the top, and five stars make it dance under
// a rainbow and change colour. There is no way to lose, no timer and no text.
//
// Debug switches: ?debug exposes window.__fm (freeze, thaw, step(ms),
// feed(i) taps fruit i, drag(i, x, y) holds fruit i at a point, drop(i)
// releases it, bubble(kind) floats a bubble up, popBubble(i), tickle(x, y),
// bloom, sleep, wake, celebrate, idle (asks for food), state), and ?cover
// hides the two corner buttons.
import { Monster, PALETTES } from './monster.js';
import { Scene, star, twinkle } from './scene.js';
import { KINDS, TREATS, CRUMBS, makeSprites } from './fruits.js';
import { sfx, unlock, isMuted, setMuted, suspend, audioContext } from './audio.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
if (params.has('cover')) document.body.classList.add('cover');

const ROUND = 5; // fruits per celebration
const IDLE_HINT = 7; // seconds of quiet before the monster asks for food
const NAP = 26; // seconds of quiet before it naps

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
const bubbles = [];
const flyStars = [];
let nextBubble = 5;
let asks = 0;
let snore = 0;
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
  if (s && s.fruit === f) {
    s.fruit = null;
    s.respawn = 0.8;
  }
  fruits.splice(fruits.indexOf(f), 1);
  if (!TREATS.includes(f.kind)) lastKind = f.kind;
  idle = 0;
  asks = 0;
  monster.chomp();
  sfx.chomp();
  try {
    navigator.vibrate?.(25);
  } catch {}
  const mx = monster.mouthX;
  const my = monster.mouthY;
  const cols = CRUMBS[f.kind];
  scene.emit('ring', mx, my, 1, { colors: ['#ffffff'], speed: 0, grav: 0, size: 0.16, life: 0.35, even: true });
  scene.emit('drop', mx, my, 10, { colors: cols, angle: -Math.PI / 2, spread: 2.8, speed: 0.85, size: 0.014, grav: 2.4, life: 0.9 });
  scene.emit('crumb', mx, my, 10, { colors: cols, angle: -Math.PI / 2, spread: 2.6, speed: 0.7, size: 0.012, grav: 2.2, life: 0.8 });
  scene.emit('twinkle', mx, my, 6, { colors: ['#ffffff', '#fff3a0'], speed: 0.45, grav: 0, drag: 3, size: 0.03, life: 0.6 });
  for (let i = 0; i < 3; i++) later(0.28 + i * 0.22, () => sfx.nom(i));
  later(0.95, () => swallow(f.kind));
}

function swallow(kind) {
  sfx.yum();
  monster.gulp();
  const treat = TREATS.includes(kind);
  if (treat) {
    monster.love = 2.2;
    later(0.1, () => sfx.treat());
  } else monster.joy = 1.3;
  scene.emit('heart', monster.x, monster.y - monster.R * 0.9, treat ? 10 : 5, {
    colors: ['#ff4f8b', '#ff7aa8', '#ff3b6b'], angle: -Math.PI / 2, spread: treat ? 2.6 : 1.6, speed: 0.35, grav: -0.15, drag: 1.5, size: 0.035, life: 1.6,
  });
  if (celebrating) return;
  const n = stars.findIndex((s) => !s.on && !s.pending);
  if (n < 0) return;
  stars[n].pending = true;
  monster.fed = n + 1;
  // a star zips up from the monster to its place in the row
  const [tx, ty] = starPos(n);
  flyStars.push({ n, x0: monster.x, y0: monster.y - monster.R * 0.6, tx, ty, t: 0, dur: 0.75, x: monster.x, y: monster.y });
  sfx.zip();
}

function starLands(fs) {
  const s = stars[fs.n];
  s.on = true;
  s.pending = false;
  s.t = 0;
  sfx.star(fs.n);
  scene.emit('twinkle', fs.tx, fs.ty, 6, { colors: ['#ffffff', '#fff3a0'], speed: 0.35, grav: 0, drag: 3, size: 0.03, life: 0.6 });
  scene.emit('ring', fs.tx, fs.ty, 1, { colors: ['#fff3a0'], speed: 0, grav: 0, size: 0.08, life: 0.4, even: true });
  if (fs.n + 1 === ROUND) later(0.45, celebrate);
}

function celebrate() {
  celebrating = true;
  bubbles.forEach((b) => popBubble(b, true));
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
    for (const s of stars) s.on = s.pending = false;
    scene.emit('puff', monster.x, monster.y, 14, { colors: ['#ffffff'], speed: 0.5, grav: 0, drag: 3, size: 0.06, life: 0.8 });
    sfx.poof();
    monster.joy = 1;
    celebrating = false;
  });
}

// ---------------------------------------------------------------- bubbles

function addBubble(kind) {
  const r = fruitR * 1.15;
  // rise just beside the monster, between it and the fruits
  const side = Math.random() < 0.5 ? -1 : 1;
  const x = Math.max(r * 1.1, Math.min(W - r * 1.1, W / 2 + side * (monster.R * 1.2 + r * 0.5)));
  bubbles.push({
    kind: kind || (Math.random() < 0.4 ? TREATS[Math.floor(Math.random() * TREATS.length)] : pickKind()),
    x,
    baseX: x,
    y: H + r,
    r,
    t: 0,
    phase: Math.random() * 6,
    vy: -H / (11 + Math.random() * 3),
    grow: 0,
  });
  sfx.blub();
}

function popBubble(b, quiet) {
  const i = bubbles.indexOf(b);
  if (i < 0) return;
  bubbles.splice(i, 1);
  sfx.bubble();
  scene.emit('drop', b.x, b.y, 14, { colors: ['#d8f4ff', '#ffffff', '#ffd6f2'], speed: 0.5, grav: 0.8, drag: 1.5, size: 0.01, life: 0.6 });
  scene.emit('ring', b.x, b.y, 1, { colors: ['#ffffff'], speed: 0, grav: 0, size: (b.r * 1.6) / scene.u, life: 0.3, even: true });
  if (quiet) return;
  // its prize flies to the monster
  const f = { kind: b.kind, slot: -1, x: b.x, y: b.y, homeX: b.x, homeY: b.y, state: 'fly', t: 0, scale: 1, rot: 0, phase: 0, hint: 0, pid: null };
  fruits.push(f);
  fly(f);
  idle = 0;
}

function bubbleAt(p) {
  for (const b of bubbles) if (dist(p.x, p.y, b.x, b.y) < b.r * 1.25) return b;
  return null;
}

// ---------------------------------------------------------------- naps

function fallAsleep() {
  monster.yawn = 1.4;
  sfx.yawn();
  later(1.3, () => {
    if (monster.yawn > 0.2 || idle < NAP) return;
    monster.asleep = true;
    snore = 0.8;
  });
}

function wakeUp() {
  if (!monster.asleep) return;
  monster.wake();
  sfx.wake();
  idle = 0;
  asks = 0;
  scene.emit('twinkle', monster.budX, monster.budY, 5, { colors: ['#ffffff', '#fff3a0'], speed: 0.4, grav: 0, drag: 3, size: 0.03, life: 0.6 });
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
  asks = 0;
  if (monster.asleep) {
    wakeUp();
    return;
  }
  const b = bubbleAt(p);
  if (b) {
    popBubble(b);
    return;
  }
  const f = fruitAt(p);
  if (f) {
    grab(f, p, pid);
    drags.set(pid, f);
    return;
  }
  if (monster.onBud(p.x, p.y)) {
    if (monster.bloom <= 0.5) sfx.bloom();
    monster.bloom = 2.6;
    monster.sprout.v += 8;
    scene.emit('twinkle', monster.budX, monster.budY, 8, { colors: ['#ffffff', '#fff3a0', '#ffc6e0'], speed: 0.45, grav: 0, drag: 2.5, size: 0.03, life: 0.8 });
    scene.emit('heart', monster.budX, monster.budY, 3, { colors: ['#ff4f8b', '#ff7aa8'], angle: -Math.PI / 2, spread: 1.4, speed: 0.3, grav: -0.2, drag: 1.5, size: 0.025, life: 1.2 });
  } else if (monster.contains(p.x, p.y)) {
    monster.tickle();
    monster.poke(p.x, p.y);
    sfx.boing();
    sfx.giggle();
    scene.emit('heart', p.x, p.y, 3, { colors: ['#ff4f8b', '#ff7aa8'], angle: -Math.PI / 2, spread: 1.4, speed: 0.3, grav: -0.2, drag: 1.5, size: 0.03, life: 1.2 });
  } else {
    sfx.sparkle();
    scene.emit('twinkle', p.x, p.y, 6, { colors: ['#ffffff', '#fff3a0', '#ffc6e0'], speed: 0.35, grav: 0, drag: 2.5, size: 0.028, life: 0.7 });
    scene.emit('star', p.x, p.y, 4, { colors: ['#ffe14a'], speed: 0.4, grav: 0.8, drag: 1.5, size: 0.02, life: 0.8 });
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

  for (const b of [...bubbles]) {
    b.t += dt;
    b.grow = Math.min(1, b.grow + dt * 3);
    b.y += b.vy * dt;
    b.x = b.baseX + Math.sin(b.t * 1.3 + b.phase) * b.r * 0.35;
    // at the top it pops by itself with a sparkle, and another comes later
    if (b.y < b.r + H * 0.12) {
      scene.emit('twinkle', b.x, b.y, 5, { colors: ['#ffffff', '#fff3a0'], speed: 0.3, grav: 0, drag: 3, size: 0.03, life: 0.6 });
      popBubble(b, true);
    }
  }
  if (!monster.asleep && !celebrating) {
    nextBubble -= dt;
    if (nextBubble <= 0) {
      if (!bubbles.length) addBubble();
      nextBubble = 9 + Math.random() * 6;
    }
  }

  for (let i = flyStars.length - 1; i >= 0; i--) {
    const fs = flyStars[i];
    fs.t += dt;
    const k = Math.min(1, fs.t / fs.dur);
    const e = ease(k);
    const cx = (fs.x0 + fs.tx) / 2 + (fs.x0 < fs.tx ? -1 : 1) * W * 0.12;
    const cy = Math.min(fs.y0, fs.ty) - H * 0.05;
    fs.x = (1 - e) * (1 - e) * fs.x0 + 2 * (1 - e) * e * cx + e * e * fs.tx;
    fs.y = (1 - e) * (1 - e) * fs.y0 + 2 * (1 - e) * e * cy + e * e * fs.ty;
    if (Math.random() < dt * 40) scene.emit('twinkle', fs.x, fs.y, 1, { colors: ['#fff3a0', '#ffffff'], speed: 0.05, grav: 0, size: 0.022, life: 0.45 });
    if (k >= 1) {
      flyStars.splice(i, 1);
      starLands(fs);
    }
  }

  if (monster.asleep) {
    snore -= dt;
    if (snore <= 0) {
      snore = 2.6;
      sfx.snore();
      scene.emit('zzz', monster.x + monster.R * 0.5, monster.y - monster.R * 0.9, 1, {
        colors: ['#bfe6ff'], angle: -Math.PI / 2 + 0.5, spread: 0.3, speed: 0.08, grav: -0.02, drag: 0.2, size: 0.03, life: 2.4,
      });
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
      if (Math.random() < dt * 30) scene.emit('twinkle', f.x, f.y, 1, { colors: ['#ffffff', '#fff3a0'], speed: 0.04, grav: 0, size: 0.024, life: 0.4 });
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
  scene.rays += ((celebrating ? 1 : 0) - scene.rays) * Math.min(1, dt * 3);
  scene.update(dt);
  for (const s of stars) s.t += dt;

  if (!drags.size && !fruits.some((f) => f.state === 'fly') && !celebrating && monster.chew <= 0 && !monster.asleep) {
    idle += dt;
    if (asks < 2 && idle > IDLE_HINT * (asks + 1)) {
      asks++;
      askForFood();
    }
    if (idle > NAP && monster.yawn <= 0) fallAsleep();
  }
}

// ---------------------------------------------------------------- draw

function drawFruit(f) {
  const { size, scale } = sprites;
  const s = size * scale * f.scale;
  g.save();
  g.translate(f.x, f.y);
  // its shadow on the cardboard wall, further away when lifted
  const lift = f.state === 'drag' || f.state === 'fly' ? 1.8 : 1;
  g.save();
  g.translate(fruitR * 0.12 * lift, fruitR * 0.22 * lift);
  g.rotate(f.rot);
  g.globalAlpha = lift > 1 ? 0.6 : 1;
  g.drawImage(sprites.shadows[f.kind], -s / 2, -s / 2, s, s);
  g.restore();
  if (f.hint > 0) {
    const gr = fruitR * 1.4 * f.scale;
    const glow = g.createRadialGradient(0, 0, gr * 0.3, 0, 0, gr);
    glow.addColorStop(0, 'rgba(255,250,210,0.8)');
    glow.addColorStop(1, 'rgba(255,250,210,0)');
    g.fillStyle = glow;
    g.fillRect(-gr, -gr, gr * 2, gr * 2);
  }
  g.rotate(f.rot);
  g.drawImage(sprites.sprites[f.kind], -s / 2, -s / 2, s, s);
  g.restore();
}

function drawBubble(b) {
  const r = b.r * (b.grow < 1 ? elastic(b.grow) : 1) * (1 + Math.sin(b.t * 5) * 0.03);
  const { size, scale } = sprites;
  g.save();
  g.translate(b.x, b.y);
  // the prize inside, rocking gently
  g.save();
  g.rotate(Math.sin(b.t * 2) * 0.2);
  const s = size * scale * 0.78;
  g.drawImage(sprites.sprites[b.kind], -s / 2, -s / 2, s, s);
  g.restore();
  // the soap film: clear in the middle, rainbow at the rim, two shines
  const film = g.createRadialGradient(0, 0, r * 0.6, 0, 0, r);
  film.addColorStop(0, 'rgba(200,240,255,0.06)');
  film.addColorStop(0.8, 'rgba(190,230,255,0.22)');
  film.addColorStop(1, 'rgba(255,255,255,0.55)');
  g.fillStyle = film;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = r * 0.05;
  const rim = g.createLinearGradient(-r, -r, r, r);
  rim.addColorStop(0, 'rgba(255,140,220,0.8)');
  rim.addColorStop(0.35, 'rgba(140,220,255,0.8)');
  rim.addColorStop(0.7, 'rgba(255,240,140,0.8)');
  rim.addColorStop(1, 'rgba(160,255,190,0.8)');
  g.strokeStyle = rim;
  g.stroke();
  g.save();
  g.rotate(-0.8);
  g.beginPath();
  g.ellipse(0, -r * 0.72, r * 0.32, r * 0.1, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fill();
  g.restore();
  g.beginPath();
  g.arc(r * 0.5, r * 0.5, r * 0.07, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fill();
  g.restore();
}

function starR() {
  return Math.max(15, Math.min(W, H) * 0.04);
}

function starPos(i) {
  const r = starR();
  const gap = r * 2.5;
  return [W / 2 - (gap * (ROUND - 1)) / 2 + i * gap, Math.max(34, r + 16)];
}

// a glossy gold star with a dark outline and a glow
function goldStar(r, glow) {
  if (glow) {
    const gl = g.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2);
    gl.addColorStop(0, 'rgba(255,230,120,0.6)');
    gl.addColorStop(1, 'rgba(255,230,120,0)');
    g.fillStyle = gl;
    g.fillRect(-r * 2, -r * 2, r * 4, r * 4);
  }
  star(g, r, r * 0.5);
  g.lineJoin = 'round';
  g.lineWidth = r * 0.2;
  g.strokeStyle = '#6a3300';
  g.stroke();
  const sg = g.createLinearGradient(0, -r, 0, r);
  sg.addColorStop(0, '#fff6a0');
  sg.addColorStop(0.5, '#ffd23f');
  sg.addColorStop(1, '#f08a00');
  g.fillStyle = sg;
  g.fill();
  g.beginPath();
  g.ellipse(-r * 0.2, -r * 0.3, r * 0.22, r * 0.11, -0.5, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fill();
}

function drawStars() {
  const r = starR();
  const now = performance.now() / 1000;
  stars.forEach((s, i) => {
    const [x, y] = starPos(i);
    g.save();
    g.translate(x, y);
    let k = 1;
    if (s.on && s.t < 0.5) k = 1 + Math.sin((s.t / 0.5) * Math.PI) * 0.5;
    if (celebrating) k = 1 + Math.abs(Math.sin(now * 6 + i)) * 0.25;
    g.scale(k, k);
    if (s.on) {
      g.rotate(Math.sin(now * 2 + i) * 0.08);
      goldStar(r, true);
    } else {
      // an empty star pressed into the cardboard
      star(g, r, r * 0.5);
      g.lineJoin = 'round';
      g.fillStyle = 'rgba(80,38,10,0.28)';
      g.fill();
      g.lineWidth = r * 0.12;
      g.strokeStyle = 'rgba(255,236,200,0.55)';
      g.stroke();
    }
    g.restore();
  });
  for (const fs of flyStars) {
    g.save();
    g.translate(fs.x, fs.y);
    g.rotate(fs.t * 10);
    goldStar(r * (0.8 + Math.sin(Math.min(1, fs.t / fs.dur) * Math.PI) * 0.5), true);
    g.restore();
  }
}

function draw() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  scene.drawBack(g, monster.x, monster.y, monster.R);
  for (const f of fruits) if (f.state !== 'drag' && f.state !== 'fly') drawFruit(f);
  monster.draw(g);
  for (const b of bubbles) drawBubble(b);
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
    tickle: (x = monster.x + monster.R * 0.5, y = monster.y) => down({ x, y }, 'debug'),
    bubble: (kind) => addBubble(kind),
    popBubble: (i = 0) => bubbles[i] && popBubble(bubbles[i]),
    bloom: () => down({ x: monster.budX, y: monster.budY }, 'debug'),
    sleep: () => {
      idle = NAP + 1;
      fallAsleep();
    },
    wake: wakeUp,
    celebrate: () => {
      stars.forEach((s) => (s.on = true, s.pending = false));
      monster.fed = ROUND;
      celebrate();
    },
    idle: askForFood,
    state: () => ({
      fed: monster.fed,
      palette: monster.pal,
      celebrating,
      asleep: monster.asleep,
      stars: stars.filter((s) => s.on).length,
      bubbles: bubbles.map((b) => ({ kind: b.kind, x: Math.round(b.x), y: Math.round(b.y) })),
      fruits: fruits.map((f) => ({ kind: f.kind, state: f.state, x: Math.round(f.x), y: Math.round(f.y) })),
      audio: audioContext()?.state || 'none',
    }),
    monster,
    scene,
  };
}
