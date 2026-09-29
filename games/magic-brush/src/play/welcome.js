// A welcome for a friend that has just arrived in the garden, over in about
// two seconds: a soft shower of confetti and stars, a bright chime, and a
// glowing star that lifts off the friend, flies across the screen into the
// friends-shelf button (which bounces as it lands). The star is a small piece
// of the page, moved every frame with the game's own clock, and it leaves a
// trail of sparkles in the scene as it goes.
import * as THREE from 'three';
import { rand, REDUCED_MOTION } from '../config.js';
import { SHAPE } from './bits.js';

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const FLY = 1.15; // seconds in the air
const GOLD = [[1.9, 1.5, 0.5], [1.6, 1.2, 0.35]];
const MIX = [[1.5, 0.35, 0.45], [1.7, 1.35, 0.3], [0.45, 1.05, 1.6], [0.5, 1.5, 0.6], [1.35, 0.55, 1.5], [1.6, 0.8, 0.35]];

const lin = (n) => {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [f(((n >> 16) & 255) / 255) * 1.25, f(((n >> 8) & 255) / 255) * 1.25, f((n & 255) / 255) * 1.25];
};

export class Welcome {
  constructor(T) {
    this.T = T;
    this.el = null;
    this.fly = null;
    this.bumpT = 0;
    this.button = null;
  }

  celebrate(e) {
    const { T } = this;
    T.snd.chime('welcome');
    const f = e.friend;
    f.worldCenter(_c);
    const r = Math.max(0.3, f.restRadius * e.scale);
    // a shower of confetti and stars from above the friend, in its own colours and a few more
    const palette = (f.info.palette || []).map(lin);
    const colors = palette.concat(MIX);
    const k = T.amount(80);
    for (let i = 0; i < k; i++) {
      const star = Math.random() < 0.22;
      const a = rand(0, Math.PI * 2);
      const d = Math.sqrt(Math.random()) * (r + 0.55);
      T.bits.emit(_c.x + Math.sin(a) * d, _c.y + r + rand(0.35, 1.0), _c.z + Math.cos(a) * d, rand(-0.08, 0.08), rand(-0.6, -0.25), rand(-0.08, 0.08), star ? GOLD[(Math.random() * 2) | 0] : colors[(Math.random() * colors.length) | 0], star ? rand(0.12, 0.17) : rand(0.08, 0.12), rand(1.8, 2.5), star ? SHAPE.star : SHAPE.confetti, {
        gravity: -0.15,
        drag: 1.6,
        sway: 0.16,
        spin: 3,
      });
    }
    T.fx.sparkles.burst(_c, T.amount(40), { colors: [[1.8, 1.4, 0.8], [1.4, 1.2, 1.9], [1.9, 1.0, 1.2]], speed: 0.9, up: 0.5, size: 0.02, life: 1.4 });
    T.hearts(e, 2);
    // the star lifts off a moment later
    T.later(0.35, () => this.launch(e));
  }

  // the star that flies to the shelf
  launch(e) {
    const { T } = this;
    const btn = (this.button = document.querySelector('#play-hud .shelf-btn'));
    if (!btn || !btn.offsetWidth) return;
    if (this.fly) this.land(true);
    const to = btn.getBoundingClientRect();
    T.head(e, _v, 0.7);
    if (!T.project(_v)) return;
    if (REDUCED_MOTION.matches) {
      // no flight: the button just bounces
      this.bump();
      T.snd.arrive();
      return;
    }
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'fly-star';
      this.el.setAttribute('aria-hidden', 'true');
      this.el.innerHTML = '<svg viewBox="0 0 24 24"><use href="#i-star" /></svg>';
      document.body.appendChild(this.el);
    }
    const view = T.view();
    this.fly = { t: 0, x0: T.px.x, y0: T.px.y, x1: to.left + to.width / 2, y1: to.top + to.height / 2, cx: 0, cy: 0 };
    const f = this.fly;
    // the arc first rises, then curves in to the button
    f.cx = (f.x0 + f.x1) / 2 + (f.x1 > view.w / 2 ? -1 : 1) * view.w * 0.06;
    f.cy = Math.min(f.y0, f.y1) - view.h * 0.14;
    this.el.style.display = 'block';
    this.place(0);
  }

  // the star at fraction k of its flight
  place(k) {
    const f = this.fly;
    const t = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
    const u = 1 - t;
    const x = u * u * f.x0 + 2 * u * t * f.cx + t * t * f.x1;
    const y = u * u * f.y0 + 2 * u * t * f.cy + t * t * f.y1;
    const s = 1.5 - 0.7 * k + 0.25 * Math.sin(k * Math.PI);
    this.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(k * 360).toFixed(0)}deg) scale(${s.toFixed(2)})`;
    this.el.style.opacity = String(Math.min(1, k * 8));
    return { x, y };
  }

  // a world point close to the camera that is under the screen position (x, y)
  unproject(x, y, depth = 0.9) {
    const { T } = this;
    const v = T.view();
    _v.set((x / v.w) * 2 - 1, -(y / v.h) * 2 + 1, 0.5).unproject(T.camera);
    _v.sub(T.camera.position).normalize().multiplyScalar(depth).add(T.camera.position);
    return _v;
  }

  land(quiet = false) {
    const { T } = this;
    const f = this.fly;
    this.fly = null;
    if (this.el) this.el.style.display = 'none';
    if (quiet || !f) return;
    this.bump();
    T.snd.arrive();
    T.fx.sparkles.burst(this.unproject(f.x1, f.y1), T.amount(18), { colors: GOLD, speed: 0.25, up: 0, size: 0.012, life: 0.8, gravity: 0 });
  }

  bump() {
    const b = this.button;
    if (!b) return;
    b.classList.remove('bump');
    void b.offsetWidth;
    b.classList.add('bump');
    this.bumpT = 0.8;
  }

  update(dt) {
    if (this.bumpT > 0 && (this.bumpT -= dt) <= 0) this.button?.classList.remove('bump');
    const f = this.fly;
    if (!f) return;
    f.t += dt;
    const k = Math.min(1, f.t / FLY);
    const at = this.place(k);
    // a trail of sparkles behind the star
    const { T } = this;
    if (k < 1) {
      const p = this.unproject(at.x, at.y);
      for (let i = 0; i < 2; i++) T.fx.sparkles.emit(p.x + rand(-0.012, 0.012), p.y + rand(-0.012, 0.012), p.z + rand(-0.012, 0.012), rand(-0.05, 0.05), rand(-0.12, 0.02), rand(-0.05, 0.05), GOLD[i & 1], rand(0.008, 0.02), rand(0.45, 0.8), { gravity: -0.2 });
    } else this.land();
  }

  dispose() {
    this.el?.remove();
    this.el = null;
    this.fly = null;
    this.button?.classList.remove('bump');
  }
}

