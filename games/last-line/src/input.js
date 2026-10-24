// Last Line: keyboard, mouse and touch, turned into one input per frame.
//   Mouse: move with WASD or the arrows, aim with the mouse, hold the left
//   button to fire, right-click or E drops a barricade where you point,
//   Q or Space calls an airstrike down the lane you point at.
//   Touch: drag anywhere to move (the soldier follows your finger's motion),
//   the gun fires on its own at the worst threat while a finger is down; tap
//   a deploy button, then tap the field to place it.
import { ZONE, clamp } from './config.js';

export class Input {
  constructor(cv, toWorld) {
    this.cv = cv;
    this.toWorld = toWorld;
    this.keys = new Set();
    this.mouse = { x: 360, y: 600, down: false, seen: false };
    this.touch = null; // { id, ax, ay, px, py }
    this.touchMode = false;
    this.placing = null; // 'barrier' | 'air' while waiting for a tap
    this.queued = { barrier: null, air: null };
    this.enabled = true;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (!this.enabled) return;
      if (k === 'e') this.queued.barrier = { x: this.mouse.x, y: this.mouse.y };
      if (k === 'q' || k === ' ') {
        this.queued.air = { x: this.mouse.x };
        e.preventDefault();
      }
      if (k.startsWith('arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
      this.touch = null;
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    cv.addEventListener('pointerdown', (e) => {
      const w = this.toWorld(e.clientX, e.clientY);
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        this.touchMode = true;
        if (!this.enabled) return;
        if (this.placing) {
          this.place(w);
          return;
        }
        if (!this.touch) this.touch = { id: e.pointerId, ax: w.x, ay: w.y, px: 0, py: 0, start: true };
        return;
      }
      this.touchMode = false;
      this.mouse.x = w.x;
      this.mouse.y = w.y;
      this.mouse.seen = true;
      if (!this.enabled) return;
      if (this.placing && e.button === 0) {
        this.place(w);
        return;
      }
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.queued.barrier = { x: w.x, y: w.y };
    });
    addEventListener('pointermove', (e) => {
      const w = this.toWorld(e.clientX, e.clientY);
      if (this.touch && e.pointerId === this.touch.id) {
        this.touch.cx = w.x;
        this.touch.cy = w.y;
      } else if (e.pointerType === 'mouse') {
        this.mouse.x = w.x;
        this.mouse.y = w.y;
        this.mouse.seen = true;
        this.touchMode = false;
      }
    });
    const up = (e) => {
      if (this.touch && e.pointerId === this.touch.id) this.touch = null;
      if (e.pointerType === 'mouse' && e.button === 0) this.mouse.down = false;
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }

  place(w) {
    if (this.placing === 'barrier') this.queued.barrier = { x: w.x, y: w.y };
    else if (this.placing === 'air') this.queued.air = { x: w.x };
    this.placing = null;
  }

  // read once per frame
  read(game, assist) {
    const k = this.keys;
    const p = game.player;
    const out = {
      move: { x: (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0), y: (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0) },
      moveTo: null,
      aim: { x: this.mouse.x, y: this.mouse.y },
      fire: this.mouse.down,
      assist,
      autoAim: false,
      barrier: this.queued.barrier,
      air: this.queued.air,
    };
    this.queued.barrier = null;
    this.queued.air = null;
    if (this.touch) {
      const t = this.touch;
      if (t.start) {
        t.start = false;
        t.px = p.x;
        t.py = p.y;
        t.cx = t.ax;
        t.cy = t.ay;
      }
      out.moveTo = { x: clamp(t.px + (t.cx - t.ax) * 1.25, ZONE.x0, ZONE.x1), y: clamp(t.py + (t.cy - t.ay) * 1.25, ZONE.y0, ZONE.y1) };
      out.fire = true;
      out.autoAim = true;
      out.aim = { x: p.x, y: p.y - 400 };
    } else if (this.touchMode) {
      out.aim = { x: p.x + Math.cos(p.aim) * 400, y: p.y + Math.sin(p.aim) * 400 };
    }
    if (!this.enabled) {
      out.fire = false;
      out.move = { x: 0, y: 0 };
      out.moveTo = null;
    }
    return out;
  }
}
