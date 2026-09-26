// Steering. Everything ends up as one number from -1 (hard left) to +1
// (hard right), smoothed by the boat itself.
//
// Little ones: hold the left or right side of the screen (anywhere), or
// drag sideways; tapping the boat itself sounds the horn. Tilt steering,
// when chosen in the settings, turns the tablet or phone into a steering
// wheel (iPhone and iPad ask permission for it on a tap).
// Big kid: drag anywhere, turn the on-screen wheel, or use the arrow keys or
// A/D; boost with the button or Space, horn with the button or H.
import { clamp } from './config.js';

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
      if (e.target.closest?.('input, textarea')) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key) && !e.target.closest?.('button, a')) e.preventDefault();
      if (e.key === ' ' && e.target.closest?.('button, a')) return;
      this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      this.onAnyInput();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
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

  // --- read once per frame: { steer, active, boost }

  read() {
    let s = 0;
    let active = false;
    const k = this.keys;
    const kl = k.has('ArrowLeft') || k.has('a');
    const kr = k.has('ArrowRight') || k.has('d');
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
    return { steer: this.enabled ? clamp(s, -1, 1) : 0, active: this.enabled && active, boost: this.enabled && (this.boostButton || k.has(' ')) };
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
      this.start = at(e) - this.angle;
      controls.wheelHeld = true;
      controls.onAnyInput();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.id) return;
      let a = at(e) - this.start;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      this.angle = clamp(a, -2.1, 2.1);
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
