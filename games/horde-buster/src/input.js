// Mouse first: the hero glides toward the cursor, left click throws a bomb at
// it, right click raises the shield (no context menu). Those are the only two
// powers; lightning and freeze are pickups that fire when grabbed. P or Esc
// pauses, F toggles full screen, arrow keys or WASD steer too. Touch: drag
// anywhere to steer (relative, like a trackpad, so the finger never hides the
// hero); the two HUD buttons fire the powers.
export class Input {
  constructor(app) {
    this.app = app;
    this.world = { x: 360, y: 1100 };
    this.css = { x: 0, y: 0 };
    this.showReticle = false;
    this.keys = new Set();
    this.touch = null; // {id, sx, sy, tx, ty}
    this.usedTouch = false;
    const canvas = app.canvas;
    window.addEventListener('pointermove', (e) => this.move(e), { passive: true });
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      app.autoPause?.();
    });
  }

  toWorld(cx, cy) {
    this.app.renderer.toWorld(cx, cy, this.world);
  }

  move(e) {
    const app = this.app;
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      this.css.x = e.clientX;
      this.css.y = e.clientY;
      this.toWorld(e.clientX, e.clientY);
      this.showReticle = true;
      if (app.run && app.state === 'play') {
        app.run.target.x = this.world.x;
        app.run.target.y = this.world.y;
      }
    } else if (this.touch && e.pointerId === this.touch.id && app.run) {
      const z = app.renderer.cam.zoom;
      app.run.target.x = this.touch.tx + ((e.clientX - this.touch.sx) / z) * 1.5;
      app.run.target.y = this.touch.ty + ((e.clientY - this.touch.sy) / z) * 1.5;
    }
  }

  down(e) {
    const app = this.app;
    app.sound.unlock();
    if (app.state !== 'play' || !app.run) return;
    if (e.pointerType === 'touch') {
      this.usedTouch = true;
      this.showReticle = false;
      if (!this.touch) {
        const h = app.run.hero;
        this.touch = { id: e.pointerId, sx: e.clientX, sy: e.clientY, tx: h.x, ty: h.y };
        app.run.target.x = h.x;
        app.run.target.y = h.y;
      }
      return;
    }
    e.preventDefault();
    this.move(e);
    if (e.button === 0) app.ability('bomb', this.world.x, this.world.y);
    else if (e.button === 2) app.ability('shield');
  }

  up(e) {
    if (this.touch && e.pointerId === this.touch.id) this.touch = null;
  }

  key(e, on) {
    const app = this.app;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (on) app.sound.unlock();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd'].includes(k)) {
      if (on) this.keys.add(k);
      else this.keys.delete(k);
      if (app.state === 'play') e.preventDefault();
      return;
    }
    if (!on || e.repeat) return;
    if (k === 'f') {
      app.toggleFullscreen();
      return;
    }
    if (app.ui.isBlocking() && app.state !== 'paused') return;
    if (k === 'p' || k === 'Escape') {
      if (app.state === 'play') app.pause();
      else if (app.state === 'paused') app.resume();
      return;
    }
  }

  // keyboard steering: nudges the target each frame
  update() {
    const app = this.app;
    if (!this.keys.size || !app.run || app.state !== 'play') return;
    const K = this.keys;
    const dx = (K.has('ArrowRight') || K.has('arrowright') || K.has('d') ? 1 : 0) - (K.has('ArrowLeft') || K.has('arrowleft') || K.has('a') ? 1 : 0);
    const dy = (K.has('ArrowDown') || K.has('arrowdown') || K.has('s') ? 1 : 0) - (K.has('ArrowUp') || K.has('arrowup') || K.has('w') ? 1 : 0);
    const h = app.run.hero;
    app.run.target.x = h.x + dx * 140;
    app.run.target.y = h.y + dy * 140;
    this.world.x = app.run.target.x;
    this.world.y = h.y - 300;
    this.showReticle = false;
  }
}
