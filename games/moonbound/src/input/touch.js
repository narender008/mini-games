// Touch controls: a floating stick on the left half moves Maelis; on the
// right, an aim stick that attacks while held (twin-stick style), and buttons
// for Special, Dash, Cast and Pause. Shown only once a finger touches the
// game (or with ?touch); every control is a pointer-event element, so the
// browser never scrolls or zooms.
import { QUERY, SIN_E } from '../config.js';
import { icon } from '../ui/icons.js';

export class Touch {
  constructor(app) {
    this.app = app;
    const input = app.input;
    this.input = input;
    const root = document.createElement('div');
    root.id = 'touch';
    root.hidden = true;
    root.innerHTML = `
      <div class="stick" data-s="move" hidden><i></i></div>
      <div class="stick" data-s="aim" hidden><i></i></div>
      <div class="tbtn big" data-b="attack" style="right:70px;bottom:70px;left:auto;top:auto;margin:0">${icon('attack', 40)}</div>
      <div class="tbtn" data-b="special" style="right:178px;bottom:58px;left:auto;top:auto;margin:0">${icon('special', 28)}</div>
      <div class="tbtn" data-b="dash" style="right:160px;bottom:150px;left:auto;top:auto;margin:0">${icon('dash', 28)}</div>
      <div class="tbtn" data-b="cast" style="right:80px;bottom:184px;left:auto;top:auto;margin:0">${icon('rune', 28)}</div>`;
    document.querySelector('#ui').append(root);
    this.root = root;
    this.moveStick = root.querySelector('[data-s="move"]');
    this.aimStick = root.querySelector('[data-s="aim"]');
    this.move = null; // {id, x0, y0}
    this.aim = null; // {id, x0, y0, btn}
    this.autoT = 0;
    this.active = false;
    const canvas = app.canvas;
    canvas.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
    // a finger anywhere (the title's buttons too) means this is a touch device: the controls appear once play starts
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this.active) return;
      this.active = true;
      input.setDevice('touch');
    }, true);
    window.addEventListener('pointermove', (e) => this.moveEv(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    for (const b of root.querySelectorAll('[data-b]')) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.show();
        const a = b.dataset.b;
        b.classList.add('on');
        b.setPointerCapture?.(e.pointerId);
        if (a === 'attack' || a === 'special') {
          // these buttons double as aim sticks: drag to aim
          this.aim = { id: e.pointerId, x0: e.clientX, y0: e.clientY, btn: a, el: b };
          input.touchAim.on = false;
        }
        input.touchButton(a, true);
      });
      const off = (e) => {
        b.classList.remove('on');
        if (this.aim && this.aim.id === e.pointerId) {
          this.aim = null;
          input.touchAim.on = false;
        }
        input.touchButton(b.dataset.b, false);
      };
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
    }
    if (QUERY.has('touch')) this.show();
  }

  // once a finger has touched the game, the controls stay on whenever play is (hidden under menus)
  show() {
    this.active = true;
    this.root.hidden = this.app.state !== 'play';
    this.input.setDevice('touch');
  }

  down(e) {
    if (e.pointerType !== 'touch') return;
    if (this.app.ui.blocking() || this.app.state !== 'play') return;
    e.preventDefault();
    this.show();
    if (e.clientX < innerWidth * 0.5 && !this.move) {
      this.move = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      this.place(this.moveStick, e.clientX, e.clientY, 0, 0);
      this.moveStick.hidden = false;
    } else if (!this.aim) {
      // a free aim stick anywhere on the right that attacks while held
      this.aim = { id: e.pointerId, x0: e.clientX, y0: e.clientY, btn: 'attack', free: true };
      this.place(this.aimStick, e.clientX, e.clientY, 0, 0);
      this.aimStick.hidden = false;
      this.input.touchButton('attack', true);
    }
  }

  moveEv(e) {
    if (e.pointerType !== 'touch') return;
    const R = 56;
    if (this.move && e.pointerId === this.move.id) {
      e.preventDefault();
      let dx = e.clientX - this.move.x0;
      let dy = e.clientY - this.move.y0;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        // the stick follows a finger that runs away
        this.move.x0 += (dx / l) * (l - R);
        this.move.y0 += (dy / l) * (l - R);
        dx = (dx / l) * R;
        dy = (dy / l) * R;
        this.place(this.moveStick, this.move.x0, this.move.y0, dx, dy);
      } else this.place(this.moveStick, this.move.x0, this.move.y0, dx, dy);
      const k = Math.min(1, Math.hypot(dx, dy) / R);
      if (k < 0.15) {
        this.input.touchMove.on = false;
      } else {
        // screen direction -> ground direction (the ground is squashed on screen)
        const gx = dx;
        const gy = dy / SIN_E;
        const gl = Math.hypot(gx, gy);
        this.input.touchMove.x = (gx / gl) * k;
        this.input.touchMove.y = (gy / gl) * k;
        this.input.touchMove.on = true;
      }
    }
    if (this.aim && e.pointerId === this.aim.id) {
      e.preventDefault();
      const dx = e.clientX - this.aim.x0;
      const dy = e.clientY - this.aim.y0;
      const l = Math.hypot(dx, dy);
      if (this.aim.free) this.place(this.aimStick, this.aim.x0, this.aim.y0, Math.min(R, l) * (dx / (l || 1)), Math.min(R, l) * (dy / (l || 1)));
      if (l > 14) {
        this.input.touchAim.x = dx;
        this.input.touchAim.y = dy / SIN_E;
        this.input.touchAim.on = true;
      }
    }
  }

  up(e) {
    if (this.move && e.pointerId === this.move.id) {
      this.move = null;
      this.moveStick.hidden = true;
      this.input.touchMove.on = false;
    }
    if (this.aim && e.pointerId === this.aim.id) {
      if (this.aim.free) {
        this.aimStick.hidden = true;
        this.input.touchButton('attack', false);
      }
      this.aim = null;
      this.input.touchAim.on = false;
    }
  }

  // per frame: holding the attack stick keeps attacking
  update(dt) {
    if (this.aim && this.aim.btn === 'attack') {
      this.autoT -= dt;
      if (this.autoT <= 0) {
        this.autoT = 0.16;
        this.input.touchButton('attack', false);
        this.input.touchButton('attack', true);
      }
    }
    const hide = !this.active || this.app.state !== 'play' || this.app.ui.blocking();
    if (this.root.hidden !== hide) this.root.hidden = hide;
  }

  place(stick, x, y, dx, dy) {
    stick.style.left = x + 'px';
    stick.style.top = y + 'px';
    stick.firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
