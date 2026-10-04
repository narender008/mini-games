// Mouse, touch and keyboard. On your turn, press anywhere on the battlefield
// and drag: the gun points at your finger and the distance sets the power.
// The on-screen buttons and the keys give exact control (hold to repeat,
// Shift for fine steps). Two fingers or the right mouse button pan, pinch or
// the wheel zoom.
import { clamp, DEG } from './config.js';

const $ = (id) => document.getElementById(id);

export class Input {
  constructor(app) {
    this.app = app;
    this.canvas = app.renderer.canvas;
    this.pointers = new Map();
    this.aiming = null;
    this.pan = null;
    this.keys = new Set();
    this.held = new Map(); // button id -> seconds held
    this.w = { x: 0, y: 0 };
    this.bind();
  }

  battle() {
    const b = this.app.battle;
    return b && !this.app.paused && b.isPlayerTurn() ? b : null;
  }

  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.up(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.app.battle) return;
      const cam = this.app.camera;
      cam.manual = true;
      cam.zoom = clamp(cam.zoom * Math.exp(e.deltaY * 0.0012), 0.25, 3);
    }, { passive: false });
    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    addEventListener('blur', () => {
      this.keys.clear();
      this.held.clear();
    });
    // hold-to-repeat buttons
    for (const id of ['drive-l', 'drive-r', 'angle-dn', 'angle-up', 'power-dn', 'power-up']) {
      const el = $(id);
      const start = (e) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        this.held.set(id, 0);
        el.classList.add('held');
        this.nudge(id, true);
      };
      const stop = () => {
        this.held.delete(id);
        el.classList.remove('held');
      };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', stop);
      el.addEventListener('pointercancel', stop);
      el.addEventListener('lostpointercapture', stop);
    }
    $('fire-btn').addEventListener('click', () => this.app.fire());
  }

  // a single step for a tap
  nudge(id, first) {
    const b = this.battle();
    if (!b) return;
    const t = b.player;
    if (id === 'angle-up') this.setElev(t, t.elevation() + 1 * DEG);
    if (id === 'angle-dn') this.setElev(t, t.elevation() - 1 * DEG);
    if (id === 'power-up') t.power = clamp(Math.round(t.power * 100 + 1) / 100, 0, 1);
    if (id === 'power-dn') t.power = clamp(Math.round(t.power * 100 - 1) / 100, 0, 1);
  }

  setElev(t, e) {
    t.setAim(t.facing > 0 ? e : Math.PI - e);
  }

  // Seconds-held to rate: slow at first for precision, then faster.
  rate(s, fine) {
    if (fine) return 0.25;
    return s < 0.35 ? 0 : Math.min(4, 1 + (s - 0.35) * 3);
  }

  update(dt) {
    const b = this.battle();
    for (const [id, s] of this.held) this.held.set(id, s + dt);
    if (!b) {
      if (this.app.battle) this.app.battle.player.driving = 0;
      return;
    }
    const t = b.player;
    const k = this.keys;
    const fine = k.has('ShiftLeft') || k.has('ShiftRight');
    let drive = 0;
    if (k.has('KeyA') || this.held.has('drive-l')) drive -= 1;
    if (k.has('KeyD') || this.held.has('drive-r')) drive += 1;
    t.driving = t.fuel > 0 ? drive : 0;
    if (drive) this.app.camera.release();
    // Left/right swing the gun anticlockwise/clockwise (so past straight
    // up it turns the turret round); up/down change the power. The angle
    // buttons raise and lower the gun.
    let dw = 0;
    let de = 0;
    let dp = 0;
    const hk = (key) => (k.has(key) ? this.keyHeld(key) : -1);
    const hb = (id) => (this.held.has(id) ? this.held.get(id) : -1);
    if (hk('ArrowLeft') >= 0) dw += this.rate(hk('ArrowLeft'), fine);
    if (hk('ArrowRight') >= 0) dw -= this.rate(hk('ArrowRight'), fine);
    if (hk('ArrowUp') >= 0) dp += this.rate(hk('ArrowUp'), fine);
    if (hk('ArrowDown') >= 0) dp -= this.rate(hk('ArrowDown'), fine);
    if (hb('angle-up') >= 0) de += this.rate(hb('angle-up'), false);
    if (hb('angle-dn') >= 0) de -= this.rate(hb('angle-dn'), false);
    if (hb('power-up') >= 0) dp += this.rate(hb('power-up'), false);
    if (hb('power-dn') >= 0) dp -= this.rate(hb('power-dn'), false);
    const turn = 22 * DEG * dt * (fine ? 0.5 : 1);
    if (dw) t.setAim(t.aim + dw * turn);
    if (de) this.setElev(t, t.elevation() + de * turn);
    if (dp) t.power = clamp(t.power + dp * 0.25 * dt, 0, 1);
  }

  keyHeld(code) {
    return this.keyT?.get(code) ?? 0;
  }

  key(e, down) {
    const app = this.app;
    if (down && e.repeat && (e.code === 'Space' || e.code === 'Enter')) return;
    if (!this.keyT) this.keyT = new Map();
    if (down) {
      if (!this.keys.has(e.code)) {
        this.keyT.set(e.code, 0);
        this.keyStart(e.code, e.shiftKey);
      }
      this.keys.add(e.code);
    } else {
      this.keys.delete(e.code);
      this.keyT.delete(e.code);
    }
    if (!down) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    switch (e.code) {
      case 'KeyF':
        app.toggleFullscreen();
        break;
      case 'KeyM':
        app.toggleMute();
        break;
      case 'Escape':
      case 'KeyP':
        if (app.battle) app.togglePause();
        break;
      case 'Space':
      case 'Enter':
        if (this.battle() && document.activeElement?.tagName !== 'BUTTON') {
          e.preventDefault();
          app.fire();
        }
        break;
      case 'KeyQ':
        app.cycleWeapon(-1);
        break;
      case 'KeyE':
        app.cycleWeapon(1);
        break;
      case 'Tab':
        if (app.battle) {
          e.preventDefault();
          const cam = app.camera;
          if (cam.manual && cam.zoom > 1.5) cam.release();
          else {
            cam.manual = true;
            cam.zoom = 3;
          }
        }
        break;
      default:
        if (/^Digit[1-9]$/.test(e.code)) app.weaponSlot(Number(e.code.slice(5)) - 1);
        if (e.code.startsWith('Arrow') && this.battle()) e.preventDefault();
    }
  }

  // the first press of an arrow is one exact step
  keyStart(code, shift) {
    const b = this.battle();
    if (!b) return;
    const t = b.player;
    const step = shift ? 0.1 : 1;
    if (code === 'ArrowLeft') t.setAim(t.aim + step * DEG);
    if (code === 'ArrowRight') t.setAim(t.aim - step * DEG);
    if (code === 'ArrowUp') t.power = clamp(t.power + (shift ? 0.001 : 0.01), 0, 1);
    if (code === 'ArrowDown') t.power = clamp(t.power - (shift ? 0.001 : 0.01), 0, 1);
  }

  tick(dt) {
    if (this.keyT) for (const [k, v] of this.keyT) this.keyT.set(k, v + dt);
    this.update(dt);
  }

  // ---- pointers on the battlefield
  down(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    this.app.hud?.toggleArsenal(false);
    this.app.sound.unlock?.();
    if (this.pointers.size === 2) {
      this.aiming = null;
      this.startPan();
      return;
    }
    if (e.button === 2 || e.button === 1) {
      this.startPan();
      return;
    }
    if (this.battle()) {
      this.aiming = e.pointerId;
      this.aimAt(e.clientX, e.clientY);
    }
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pan) this.updatePan();
    else if (this.aiming === e.pointerId && this.battle()) this.aimAt(e.clientX, e.clientY);
  }

  up(e) {
    this.pointers.delete(e.pointerId);
    if (this.aiming === e.pointerId) this.aiming = null;
    if (this.pan && this.pointers.size === 0) this.pan = null;
    else if (this.pan) this.startPan();
  }

  aimAt(sx, sy) {
    const b = this.battle();
    const t = b.player;
    const R = this.app.renderer;
    const g = R.toScreen(t.gunX, t.gunY, {});
    const dx = sx - g.x;
    const dy = g.y - sy;
    const d = Math.hypot(dx, dy);
    if (d < 6) return;
    t.setAim(Math.atan2(Math.max(dy, -d * 0.1), dx));
    const span = 0.38 * Math.min(R.cssW, R.cssH);
    t.power = clamp(d / span, 0.03, 1);
  }

  startPan() {
    const pts = [...this.pointers.values()];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    const cam = this.app.camera;
    this.pan = { cx, cy, dist, panX: cam.panX, panY: cam.panY, zoom: cam.zoom };
  }

  updatePan() {
    const pts = [...this.pointers.values()];
    if (!pts.length) return;
    const cam = this.app.camera;
    const R = this.app.renderer;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const mpp = cam.viewW / R.cssW;
    cam.manual = true;
    cam.panX = this.pan.panX - (cx - this.pan.cx) * mpp;
    cam.panY = this.pan.panY + (cy - this.pan.cy) * mpp;
    if (pts.length > 1 && this.pan.dist > 10) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      cam.zoom = clamp((this.pan.zoom * this.pan.dist) / Math.max(10, dist), 0.25, 3);
    }
  }
}
