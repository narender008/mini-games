// Mouse, touch and keys, turned into a few calls on the app: press(x, y,
// button), drag(x, y), release(x, y, button) in CSS pixels on the canvas, and
// key(code, down). The canvas eats its own right-click menu (the right button
// flips forward), and a press on the HUD never reaches it (the UI stops those
// events). Pointer capture keeps a drag going when it leaves the canvas.
export class Input {
  constructor(app, canvas) {
    this.app = app;
    this.x = 0;
    this.y = 0;
    this.down = false;
    this.button = 0;
    this.id = -1;
    this.touch = false;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.down && e.pointerId !== this.id) return;
      e.preventDefault();
      this.touch = e.pointerType === 'touch';
      this.down = true;
      this.id = e.pointerId;
      this.button = e.button === 2 ? 2 : 0;
      this.x = e.clientX;
      this.y = e.clientY;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety */
      }
      app.press(this.x, this.y, this.button);
    });
    canvas.addEventListener('pointermove', (e) => {
      this.x = e.clientX;
      this.y = e.clientY;
      if (this.down && e.pointerId !== this.id) return;
      app.drag(this.x, this.y, this.down);
    });
    const up = (e) => {
      if (!this.down || e.pointerId !== this.id) return;
      this.down = false;
      this.id = -1;
      app.release(e.clientX, e.clientY, this.button);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') && (e.code === 'Space' || e.code === 'Enter')) return;
      if (app.key(e.code, true, e.repeat)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      if (app.key(e.code, false, false)) e.preventDefault();
    });
    window.addEventListener('blur', () => {
      if (this.down) {
        this.down = false;
        app.release(this.x, this.y, this.button);
      }
      app.key('Blur', false, false);
    });
  }
}
