// The camera: follows the action with a lead in the direction of travel,
// pulls out when things go fast or high (so the ground stays in shot) and
// punches in on the biggest hit. The base scale comes from the screen's area,
// so a wide laptop sees a wide stretch of track, a phone held upright a tall
// one, and everything is in proportion. Shake is "trauma": hits add to it, it
// decays, and the offset is its square times smooth noise.
import { clamp, damp, PREFS } from '../config.js';

const VIEW_AREA = 24 * 13.5; // square metres of track in view at zoom 1

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 3;
    this.zoom = 1;
    this.S0 = 40;
    this.W = 1;
    this.H = 1;
    this.trauma = 0;
    this.punch = 0; // 0..1 punch-in amount
    this.punchT = 0;
    this.fx = 0; // punch focus
    this.fy = 0;
    this.ox = 0; // shake offset (m)
    this.oy = 0;
    this.roll = 0;
    this.t = 0;
    this.locked = false; // a debug view holds it still
  }

  fit(w, h) {
    this.W = w;
    this.H = h;
    this.S0 = Math.sqrt((w * h) / VIEW_AREA);
  }

  // pixels per metre (CSS pixels)
  get S() {
    return this.S0 * this.zoom * (1 + this.punch * 0.75);
  }

  // half the view in metres
  get hw() {
    return this.W / 2 / this.S;
  }

  get hh() {
    return this.H / 2 / this.S;
  }

  // Follows (tx, ty) moving at (vx, vy), with the ground `g` metres below
  // the target; `zoomOut` is an extra pull-out (0 = none).
  follow(dt, tx, ty, vx, vy, g, zoomOut = 0, snap = false) {
    if (this.locked) return;
    const sp = Math.hypot(vx, vy);
    const lx = clamp(vx * 0.35, -5, 10);
    const ly = clamp(vy * 0.18, -4, 4);
    // zoom: out with speed and with height above the ground
    const base = this.H / 2 / this.S0; // half-height in metres at zoom 1
    let z = 1 / (1 + sp / 55 + zoomOut);
    // high up, frame him and the ground beneath him together
    const h = Math.max(0, ty - g);
    z = Math.min(z, base / (h * 0.5 + 3));
    z = clamp(z, 0.28, 1.3);
    const aimY = ty - h * 0.5 + 1.5 + ly;
    if (snap) {
      this.x = tx + lx;
      this.y = aimY;
      this.zoom = z;
    } else {
      this.x = damp(this.x, tx + lx, 4.5, dt);
      this.y = damp(this.y, aimY, 3.5, dt);
      this.zoom = damp(this.zoom, z, z < this.zoom ? 3 : 1.6, dt);
    }
  }

  // the biggest hit: zoom in on (x, y) for a moment
  punchIn(x, y, k = 1) {
    this.fx = x;
    this.fy = y;
    this.punchT = 0.9 * k;
    this.punch = Math.max(this.punch, 0.2);
  }

  shake(s) {
    this.trauma = Math.min(1, this.trauma + s);
  }

  update(dt) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    if (this.punchT > 0) {
      this.punchT -= dt;
      this.punch = damp(this.punch, 1, 9, dt);
    } else this.punch = damp(this.punch, 0, 3, dt);
    const k = PREFS.shake === 'off' ? 0 : PREFS.shake === 'reduced' ? 0.35 : 1;
    const tr = this.trauma * this.trauma * k;
    const t = this.t * 30;
    this.ox = (Math.sin(t * 1.3) + Math.sin(t * 2.9) * 0.5) * 0.55 * tr;
    this.oy = (Math.sin(t * 1.7 + 2) + Math.sin(t * 3.3) * 0.5) * 0.55 * tr;
    this.roll = Math.sin(t * 0.9) * 0.025 * tr;
  }

  // the centre actually drawn: the follow point pulled toward the punch focus, plus shake
  get cx() {
    return this.x + (this.fx - this.x) * this.punch * 0.7 + this.ox;
  }

  get cy() {
    return this.y + (this.fy - this.y) * this.punch * 0.7 + this.oy;
  }

  toWorld(sx, sy, out) {
    const S = this.S;
    out.x = this.cx + (sx - this.W / 2) / S;
    out.y = this.cy - (sy - this.H / 2) / S;
    return out;
  }

  toScreen(x, y, out) {
    const S = this.S;
    out.x = (x - this.cx) * S + this.W / 2;
    out.y = (this.cy - y) * S + this.H / 2;
    return out;
  }
}
