// The toys: what keeps a child happily busy in the garden once a friend has
// come alive. Every toy is one tap or one drag, with nothing to lose and
// nothing to read:
//
//   pet      drag a finger over a friend: it leans into your hand, hearts float
//            up; scribble fast and it giggles          (pet.js)
//   bubbles  blow big soap bubbles; pop them by touch, friends jump at them
//                                                     (bubbles.js)
//   ball     a soft ball to bounce and kick about; Big kids drag it to throw
//            and friends fetch it back                 (ball.js)
//   snack    a glowing star-berry a friend runs over and eats  (snack.js)
//   call     everybody runs to you and cheers          (call.js)
//   paint    (Big kids) shiny puddles of paint; friends jump in and leave
//            coloured tracks                           (puddles.js)
// and a welcome when a new friend arrives: confetti, stars, and a star that
// flies into the friends shelf                          (welcome.js)
//
// This manager owns the toy bar (index.html #toybar, in the garden's HUD), the
// shared bits (hearts, confetti) and sounds, and routes the pointer. main.js
// calls pointerDown/Move/Up first in the garden; a toy that uses a touch
// returns true and the tap goes no further. A tap on a friend is passed back
// (onTapFriend) once it is clear it was a tap and not the start of a stroke.
//
// Friends are borrowed from friends.js through its public API only (send,
// emote, lookAt, release, walkers, nearest, stageSpot). A friend that a toy has
// its eye on carries e.toy (the toy's name), and other toys leave it be.
import * as THREE from 'three';
import { REDUCED_MOTION, rand, clamp } from '../config.js';
import { COLORS, BIG_COLORS } from '../paint/tools.js';
import { Bits, SHAPE } from './bits.js';
import { ToySounds } from '../sound/toys.js';
import { Pet } from './pet.js';
import { Bubbles } from './bubbles.js';
import { Ball } from './ball.js';
import { Snack } from './snack.js';
import { Call } from './call.js';
import { Welcome } from './welcome.js';
import { Puddles } from './puddles.js';

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const PINKS = [[1.25, 0.3, 0.5], [1.0, 0.36, 0.62], [1.3, 0.55, 0.7], [1.15, 0.22, 0.4]];
// the paints on offer for puddles
const PUDDLE_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

export class Toys {
  // scene, camera; view(): { w, h }; fx, audio, sky (for reflections), friends, gcam, quality,
  // strain(): 0..1 how much the frame governor wants less; groundAt(x, z);
  // direct(entry, kind, seconds): the garden camera comes close on the fun;
  // onTapFriend(entry): a tap on a friend (its trick)
  constructor({ scene, camera, view, fx, audio, sky, friends, gcam, quality, strain, groundAt, direct, onTapFriend }) {
    this.scene = scene;
    this.camera = camera;
    this.view = view;
    this.fx = fx;
    this.audio = audio;
    this.sky = sky;
    this.friends = friends;
    this.gcam = gcam;
    this.q = quality;
    this.strain = strain || (() => 0);
    this.groundAt = groundAt;
    this.direct = direct || (() => {});
    this.onTapFriend = onTapFriend || (() => {});
    this.mode = 'little';
    this.toy = 'pet';
    this.on = false;
    this.clock = 0;
    this.time = 0;
    this.tok = 0;
    this.down = null; // { id, x, y, moved }: the pointer that is down
    this.ray = new THREE.Raycaster();
    this.gp = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.px = { x: 0, y: 0, z: 0 };
    this.snd = new ToySounds(audio);
    const max = clamp(Math.round(quality.particles * 0.3), 160, 420);
    this.bits = new Bits(scene, max);
    this.pet = new Pet(this);
    this.bubbles = new Bubbles(this);
    this.ball = new Ball(this);
    this.snack = new Snack(this);
    this.call = new Call(this);
    this.welcome = new Welcome(this);
    this.puddles = new Puddles(this);
    this.color = 'pink';
    this.bindBar();
  }

  // ------------------------------------------------------------ the toy bar

  bindBar() {
    this.bar = document.getElementById('toybar');
    this.colors = document.getElementById('toy-colors');
    this.buttons = this.bar ? [...this.bar.querySelectorAll('[data-toy]')] : [];
    this.onClick = [];
    for (const b of this.buttons) {
      const fn = () => this.press(b.dataset.toy, b);
      b.addEventListener('click', fn);
      this.onClick.push([b, fn]);
    }
    if (this.colors) {
      this.colors.textContent = '';
      for (const name of PUDDLE_COLORS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.dataset.color = name;
        b.setAttribute('aria-label', `${name} paint`);
        b.setAttribute('aria-pressed', String(name === this.color));
        b.style.setProperty('--c', '#' + COLORS[name].toString(16).padStart(6, '0'));
        const fn = () => {
          this.color = name;
          this.syncColors();
          this.puddles.dropNear();
        };
        b.addEventListener('click', fn);
        this.onClick.push([b, fn]);
        this.colors.appendChild(b);
      }
    }
    this.syncBar();
  }

  syncBar() {
    for (const b of this.buttons) if (b.dataset.toy !== 'call') b.setAttribute('aria-pressed', String(b.dataset.toy === this.toy));
    if (this.colors) this.colors.hidden = !(this.toy === 'paint' && this.mode === 'big');
    this.syncColors();
  }

  syncColors() {
    if (!this.colors) return;
    for (const b of this.colors.children) b.setAttribute('aria-pressed', String(b.dataset.color === this.color));
    const hex = '#' + COLORS[this.color].toString(16).padStart(6, '0');
    const paint = this.bar?.querySelector('[data-toy="paint"]');
    if (paint) paint.style.setProperty('--c', hex);
  }

  // a button was pressed: pick the toy, and do its first thing at once
  press(name, button = null) {
    this.audio.unlock();
    if (name === 'call') {
      this.wiggle(button);
      this.call.start();
      return;
    }
    if (name === 'paint' && this.mode !== 'big') return;
    this.toy = name;
    this.syncBar();
    this.wiggle(button);
    if (name === 'pet') this.pet.hint();
    else if (name === 'bubbles') this.bubbles.blow();
    else if (name === 'ball') this.ball.drop();
    else if (name === 'snack') this.snack.dropNearFriend();
    else if (name === 'paint') this.puddles.dropNear();
  }

  wiggle(button) {
    if (!button || REDUCED_MOTION.matches) return;
    button.classList.remove('boing');
    // restart the animation
    void button.offsetWidth;
    button.classList.add('boing');
  }

  setMode(mode) {
    this.mode = mode;
    if (mode !== 'big' && this.toy === 'paint') this.toy = 'pet';
    this.ball.setMode(mode);
    this.syncBar();
  }

  // show every hidden toy object while shaders are compiled up front, so nothing stutters the first time
  warm(on) {
    this.ball.warm(on);
    this.snack.warm(on);
  }

  // playing in the garden (the toy bar is only shown then, and taps are ours)
  setActive(on) {
    this.on = on;
    if (!on) this.abort();
  }

  // let go of any drag in progress
  abort() {
    this.pet.up();
    this.ball.release(0, 0, true);
    this.down = null;
  }

  // the drawing buffer's height in pixels, for the size of point sprites
  resize(heightPx) {
    this.bits.setViewport(heightPx);
  }

  // ------------------------------------------------------------ pointer

  // a finger or mouse went down at screen (x, y): true if a toy used it
  pointerDown(x, y, ev = null) {
    if (!this.on) return false;
    this.down = { id: ev?.pointerId ?? 0, x, y, moved: 0 };
    const gp = this.ground(x, y);
    if (this.bubbles.hit(x, y, 1)) return true;
    if (this.ball.grab(x, y, this.down.id)) return true;
    const hit = this.friends.pick(x, y, this.camera, this.view());
    if (hit) {
      this.pet.down(hit, x, y);
      return true;
    }
    if (gp) return this.groundTap(gp);
    return false;
  }

  pointerMove(x, y, ev = null) {
    if (!this.on) return;
    const d = this.down;
    const pressed = d && (ev?.buttons || ev?.pointerType === 'touch' || ev?.pointerType === 'pen' || !ev);
    if (!d || !pressed) return;
    d.moved += Math.hypot(x - d.x, y - d.y);
    d.x = x;
    d.y = y;
    if (this.ball.aiming) {
      this.ball.aim(x, y);
      return;
    }
    this.bubbles.hit(x, y, 3);
    if (this.pet.active) this.pet.move(x, y);
    else if (d.moved > 10) {
      // a finger dragged over a friend pets it, wherever the drag began
      const hit = this.friends.pick(x, y, this.camera, this.view());
      if (hit) this.pet.begin(hit, x, y);
    }
  }

  pointerUp(x, y) {
    if (!this.on && !this.down) return;
    this.pet.up(x, y);
    this.ball.release(x, y);
    this.down = null;
  }

  // a tap on the lawn with a toy in hand: bubbles, a berry or a puddle where it is
  groundTap(gp) {
    if (this.toy === 'snack') return this.snack.dropAt(gp.x, gp.z);
    if (this.toy === 'paint' && this.mode === 'big') return this.puddles.drop(gp.x, gp.z);
    if (this.toy === 'bubbles') return this.bubbles.puffAt(gp);
    return false;
  }

  // ------------------------------------------------------------ helpers for the toys

  // the point on the lawn under a screen position (y = 3 cm), or null when it is sky
  ground(x, y, out = this.gp) {
    const v = this.view();
    _ndc.set((x / v.w) * 2 - 1, -(y / v.h) * 2 + 1);
    this.ray.setFromCamera(_ndc, this.camera);
    const r = this.ray.ray;
    if (r.direction.y >= -0.01) return null;
    r.at((0.03 - r.origin.y) / r.direction.y, out);
    return out;
  }

  // screen position of a world point in this.px (px, with z 0..1 depth); false if behind the camera
  project(p) {
    const v = this.view();
    _v.copy(p).project(this.camera);
    this.px.x = (_v.x * 0.5 + 0.5) * v.w;
    this.px.y = (-_v.y * 0.5 + 0.5) * v.h;
    this.px.z = _v.z;
    return _v.z < 1;
  }

  // how many screen pixels a metre is at a distance from the camera
  pxPerM(dist) {
    return this.view().h / 2 / Math.tan((this.camera.fov * Math.PI) / 360) / Math.max(0.1, dist);
  }

  // can a toy use this friend now?
  free(e) {
    return !e.leaving && !e.toy && !e.friend.trick && e.state !== 'hello' && e.state !== 'journey' && e.state !== 'trick';
  }

  // friends that walk the lawn and are free for a toy
  freeWalkers() {
    return this.friends.walkers().filter((e) => e.home === 'ground' && this.free(e));
  }

  // send a friend somewhere for a toy; its callbacks only count while this errand is the current one
  go(e, who, to, { pace = 'walk', stopR = 0.05, onArrive = null, onCancel = null } = {}) {
    const tok = ++this.tok;
    e.toy = who;
    e.toyTok = tok;
    const ok = this.friends.send(e, to, {
      pace,
      stopR,
      onArrive: (en) => en.toyTok === tok && onArrive?.(en),
      onCancel: (en) => {
        if (en.toyTok !== tok) return;
        en.toy = null;
        onCancel?.(en);
      },
    });
    if (!ok) e.toy = null;
    return ok;
  }

  // a friend is done with the toy
  done(e) {
    e.toy = null;
    e.toyTok = 0;
  }

  // is this friend still in the garden and still ours?
  mine(e, who) {
    return e.toy === who && !e.leaving && this.friends.list.includes(e);
  }

  // turn a friend towards a point, at a top rate (rad/s), easing in and out (call it
  // every frame; the friend does the turning in its own update)
  face(e, x, z, dt, rate = 4) {
    this.friends.face(e, Math.atan2(x - e.pos.x, z - e.pos.z), rate);
  }

  // hearts floating up from a friend
  hearts(e, n = 1) {
    if (this.bits.max < 40) return;
    const f = e.friend;
    f.worldCenter(_c);
    const r = f.restRadius * e.scale;
    if (REDUCED_MOTION.matches) n = Math.max(1, n >> 1);
    for (let i = 0; i < n; i++) {
      const col = PINKS[(Math.random() * PINKS.length) | 0];
      this.bits.emit(_c.x + rand(-0.35, 0.35) * r, _c.y + r * rand(0.55, 0.8), _c.z + rand(-0.35, 0.35) * r, rand(-0.05, 0.05), rand(0.26, 0.4), rand(-0.05, 0.05), col, rand(0.13, 0.19), rand(1.4, 1.9), SHAPE.heart, {
        gravity: 0.03,
        drag: 0.55,
        sway: 0.04,
      });
    }
    this.snd.heart();
  }

  // the friend's head: a point above its middle
  head(e, out, lift = 0.6) {
    e.friend.worldCenter(out);
    out.y += e.friend.restRadius * e.scale * lift;
    return out;
  }

  // a scale for how many particles to spend
  amount(n) {
    const s = 1 - this.strain() * 0.6;
    return Math.max(1, Math.round(n * s * (REDUCED_MOTION.matches ? 0.45 : 1)));
  }

  later(sec, fn) {
    this.friends.after(sec, fn);
  }

  // ------------------------------------------------------------ the frame

  update(dt, t) {
    this.time = t;
    this.clock += dt;
    // toys forget friends that have left
    this.pet.update(dt);
    this.bubbles.update(dt);
    this.ball.update(dt);
    this.snack.update(dt);
    this.call.update(dt);
    this.puddles.update(dt);
    this.welcome.update(dt);
    this.bits.update(dt, t);
  }

  // a new friend has arrived in the garden: a little celebration
  onFriendArrived(e) {
    this.welcome.celebrate(e);
  }

  dispose() {
    for (const [el, fn] of this.onClick) el.removeEventListener('click', fn);
    this.onClick = [];
    this.pet.dispose?.();
    this.bubbles.dispose();
    this.ball.dispose();
    this.snack.dispose();
    this.call.dispose?.();
    this.welcome.dispose();
    this.puddles.dispose();
    this.bits.dispose();
  }
}

