// Input while playing. Drag anywhere and pull back like a slingshot: the
// ball goes the opposite way to the pull, and the further the pull, the
// harder the shot (the dotted arc shows where it will go); let go to fire.
// Little ones just tap where the ball should land. Keys for big kids: up and
// down for the angle, left and right for the power, A and D to drive, space
// to fire.
import * as THREE from 'three';
import { clamp } from './config.js';

export class Aim {
  constructor(app) {
    this.app = app;
    this.canvas = app.canvas;
    this.drag = null;
    this.keys = new Set();
    this.band = document.getElementById('band');
    this.line = this.band.querySelector('.band-line');
    this.knob = this.band.querySelector('.band-knob');
    this.ray = new THREE.Raycaster();
    this._v = new THREE.Vector3();
    this._ndc = new THREE.Vector2();
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e, true));
    c.addEventListener('pointercancel', (e) => this.up(e, false));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    addEventListener('blur', () => this.keys.clear());
  }

  get game() {
    return this.app.game;
  }

  canAim() {
    const g = this.game;
    return this.app.state === 'playing' && g.phase === 'aim' && g.side?.human;
  }

  // the lane point (z = 0) under a screen point
  lanePoint(x, y) {
    const v = this.app.view;
    this._ndc.set((x / v.w) * 2 - 1, -(y / v.h) * 2 + 1);
    this.ray.setFromCamera(this._ndc, this.app.camera);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    if (Math.abs(d.z) < 1e-4) return null;
    const t = -o.z / d.z;
    return t > 0 ? this._v.copy(o).addScaledVector(d, t) : null;
  }

  down(e) {
    this.app.audio.unlock();
    if (!this.canAim()) return;
    if (this.game.mode === 'little') {
      const p = this.lanePoint(e.clientX, e.clientY);
      if (p) this.game.lobTo(p.x);
      return;
    }
    if (this.drag) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    const s = this.game.side;
    this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, angle: s.angle, power: s.power, moved: false };
  }

  move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (!this.canAim()) return;
    const sx = d.x0 - d.x;
    const sy = d.y - d.y0;
    const len = Math.hypot(sx, sy);
    if (len < 14 && !d.moved) return;
    d.moved = true;
    const s = this.game.side;
    const reach = this.reach();
    // the pull, turned round, points where the ball will go
    const angle = Math.atan2(sy, sx * s.facing);
    this.game.setAim(clamp(angle, 0.12, 1.4), clamp(len / reach, 0, 1));
    this.app.audio.aimStretch(clamp(len / reach, 0, 1));
  }

  up(e, release) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    this.app.audio.aimStretch(0);
    if (release && d.moved && this.canAim() && Math.hypot(d.x - d.x0, d.y - d.y0) > 24) this.game.fire();
  }

  // how far a full-power pull is, in screen pixels
  reach() {
    const v = this.app.view;
    return clamp(Math.min(v.w, v.h) * 0.32, 110, 260);
  }

  key(e, on) {
    if (e.target.closest?.('input, textarea') && e.key !== ' ') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (on && !e.repeat) {
      if (k === 'f') this.app.toggleFullscreen();
      else if (k === 'm') this.app.toggleMute();
      else if ((k === ' ' || k === 'Enter') && this.canAim() && this.game.mode !== 'little') {
        e.preventDefault();
        this.game.fire();
      }
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'a', 'd'].includes(k)) {
      if (this.app.state === 'playing') e.preventDefault();
      if (on) this.keys.add(k);
      else this.keys.delete(k);
    }
  }

  update(dt) {
    const g = this.game;
    if (this.canAim() && g.mode !== 'little') {
      const K = this.keys;
      const da = (K.has('ArrowUp') ? 1 : 0) - (K.has('ArrowDown') ? 1 : 0);
      const dp = (K.has('ArrowRight') ? 1 : 0) - (K.has('ArrowLeft') ? 1 : 0);
      if (da || dp) g.nudgeAim(da * dt * 0.5, dp * dt * 0.35);
      const dr = (K.has('d') ? 1 : 0) - (K.has('a') ? 1 : 0);
      if (dr || this.keyDriving) {
        g.drive(dr);
        this.keyDriving = !!dr;
      }
    }
    this.drawBand();
  }

  // the rubber band from the barrel along the pull
  drawBand() {
    const d = this.drag;
    const on = !!(d && d.moved && this.canAim());
    this.band.classList.toggle('on', on);
    if (!on) return;
    const s = this.game.side;
    s.view.muzzleWorld(this._v);
    this._v.project(this.app.camera);
    const v = this.app.view;
    const mx = (this._v.x * 0.5 + 0.5) * v.w;
    const my = (-this._v.y * 0.5 + 0.5) * v.h;
    let px = d.x - d.x0;
    let py = d.y - d.y0;
    const len = Math.hypot(px, py);
    const reach = this.reach();
    if (len > reach) {
      px *= reach / len;
      py *= reach / len;
    }
    this.line.setAttribute('x1', mx);
    this.line.setAttribute('y1', my);
    this.line.setAttribute('x2', mx + px);
    this.line.setAttribute('y2', my + py);
    this.knob.setAttribute('cx', mx + px);
    this.knob.setAttribute('cy', my + py);
  }
}
