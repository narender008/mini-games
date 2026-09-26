// Steering. Everything ends up as one number from -1 (hard left) to +1
// (hard right), smoothed by the boat itself.
//
// Little ones: hold the left or right side of the screen (anywhere), or
// drag sideways; tapping the boat itself sounds the horn. Tilt steering,
// when chosen in the settings, turns the tablet or phone into a steering
// wheel (iPhone and iPad ask permission for it on a tap).
// Big kid: drag anywhere, turn the on-screen wheel, or use the arrow keys or
// A/D; boost with the button, Space, Up or W, ease off with Down or S, horn
// with the button or H. The keys work in both modes, and every way of
// steering agrees: left is left on screen, right is right.
import { clamp } from './config.js';

// Keys by what they do. Both the character and the physical key count, so
// the letters work on any keyboard layout (A/D sit where Q/D are on AZERTY).
const KEYS = {
  left: ['ArrowLeft', 'a', 'KeyA'],
  right: ['ArrowRight', 'd', 'KeyD'],
  faster: [' ', 'Space', 'ArrowUp', 'w', 'KeyW'],
  slower: ['ArrowDown', 's', 'KeyS'],
};
const GAME_KEYS = new Set(Object.values(KEYS).flat());

const TILT_RANGE = 24; // degrees of tilt for a full turn
const TILT_DEAD = 2.5;

export class Controls {
  constructor(canvas, { onHorn, isBoatAt, onAnyInput }) {
    this.canvas = canvas;
    this.onHorn = onHorn;
    this.isBoatAt = isBoatAt;
    this.onAnyInput = onAnyInput || (() => {});
    this.mode = 'little';
    this.pointers = new Map();
    this.keys = new Set();
    this.wheel = 0; // on-screen wheel, -1..1
    this.wheelHeld = false;
    this.boostButton = false;
    this.tiltOn = false;
    this.tilt = null; // latest tilt angle (degrees)
    this.tiltZero = 0;
    this.enabled = true;
    this.bind();
  }

  bind() {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.onAnyInput();
      el.setPointerCapture?.(e.pointerId);
      const tapBoat = this.isBoatAt(e.clientX, e.clientY);
      this.pointers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, t0: performance.now(), drag: false, boat: tapBoat, held: 0 });
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      if (Math.abs(p.x - p.x0) > 14) p.drag = true;
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (!p) return;
      // a quick tap on the boat is a toot of the horn
      if (p.boat && !p.drag && performance.now() - p.t0 < 450) this.onHorn();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!GAME_KEYS.has(key) && !GAME_KEYS.has(e.code)) return;
      // the start screen and settings keep their own keyboard use (Space or
      // arrows on a focused card); the round buttons over the game do not
      // steal the driving keys
      const control = e.target.closest?.('button, a, [role="slider"]');
      if (control && !control.closest('#hud, [hidden]')) return;
      // (on the start screen the arrows may still scroll a short menu)
      if (document.body.dataset.state === 'playing') e.preventDefault();
      this.keys.add(key);
      this.keys.add(e.code);
      this.onAnyInput();
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      this.keys.delete(e.code);
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.pointers.clear();
    });
    addEventListener('deviceorientation', (e) => this.onOrientation(e));
  }

  // --- tilt

  static tiltNeedsPermission() {
    return typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
  }

  static tiltAvailable() {
    return typeof DeviceOrientationEvent !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  }

  // must be called inside a tap on iPhone and iPad
  async enableTilt() {
    if (Controls.tiltNeedsPermission()) {
      try {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return false;
      } catch {
        return false;
      }
    }
    this.tiltOn = true;
    this.recentre();
    return true;
  }

  disableTilt() {
    this.tiltOn = false;
  }

  // the way it is held now counts as straight ahead
  recentre() {
    this.tiltZero = this.tilt ?? 0;
    this.needZero = this.tilt === null;
  }

  onOrientation(e) {
    if (e.beta === null || e.gamma === null) return;
    // sideways tilt relative to the screen, whichever way up it is held
    const angle = (screen.orientation?.angle ?? window.orientation ?? 0) | 0;
    let a;
    if (angle === 90) a = e.beta;
    else if (angle === -90 || angle === 270) a = -e.beta;
    else if (angle === 180) a = -e.gamma;
    else a = e.gamma;
    this.tilt = a;
    if (this.needZero) {
      this.tiltZero = a;
      this.needZero = false;
    }
  }

  held(what) {
    for (const key of KEYS[what]) if (this.keys.has(key)) return true;
    return false;
  }

  // --- read once per frame: { steer, active, boost, slow }

  read() {
    let s = 0;
    let active = false;
    const kl = this.held('left');
    const kr = this.held('right');
    if (kl || kr) {
      s += (kr ? 1 : 0) - (kl ? 1 : 0);
      active = true;
    }
    const w = innerWidth;
    for (const p of this.pointers.values()) {
      if (p.boat && !p.drag && performance.now() - p.t0 < 250) continue;
      if (p.drag) s += clamp((p.x - p.x0) / (w * (this.mode === 'big' ? 0.14 : 0.18)), -1, 1);
      else if (this.mode === 'little') s += p.x < w / 2 ? -1 : 1;
      active = true;
    }
    if (this.wheelHeld || Math.abs(this.wheel) > 0.02) {
      s += this.wheel;
      active = true;
    }
    if (this.tiltOn && this.tilt !== null) {
      let d = this.tilt - this.tiltZero;
      if (Math.abs(d) < TILT_DEAD) d = 0;
      else d -= Math.sign(d) * TILT_DEAD;
      const t = clamp(d / TILT_RANGE, -1, 1);
      if (t !== 0) active = true;
      s += t;
    }
    // ?debug can hold the steering as if a finger were on it
    if (this.forced !== null && this.forced !== undefined) {
      s = this.forced;
      active = true;
    }
    const faster = this.boostButton || this.held('faster');
    return {
      steer: this.enabled ? clamp(s, -1, 1) : 0,
      active: this.enabled && active,
      boost: this.enabled && faster,
      slow: this.enabled && !faster && this.held('slower'),
    };
  }

  reset() {
    this.pointers.clear();
    this.keys.clear();
    this.wheel = 0;
    this.boostButton = false;
  }
}

// The on-screen steering wheel for big kids: turn it by dragging round its
// centre; it springs back to straight when let go.
export class WheelControl {
  constructor(el, controls) {
    this.el = el;
    this.c = controls;
    this.angle = 0;
    this.id = null;
    const knob = el.querySelector('.wheel-rim');
    const at = (e) => {
      const r = el.getBoundingClientRect();
      return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      this.id = e.pointerId;
      this.last = at(e);
      controls.wheelHeld = true;
      controls.onAnyInput();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.id) return;
      const a = at(e);
      const d = a - this.last;
      this.last = a;
      this.angle = clamp(this.angle + Math.atan2(Math.sin(d), Math.cos(d)), -2.1, 2.1);
    });
    const up = (e) => {
      if (e.pointerId !== this.id) return;
      this.id = null;
      controls.wheelHeld = false;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    this.knob = knob;
  }

  update(dt) {
    if (this.id === null) this.angle *= Math.exp(-dt * 7);
    this.c.wheel = clamp(this.angle / 1.9, -1, 1);
    this.knob.style.transform = `rotate(${this.angle}rad)`;
  }
}
