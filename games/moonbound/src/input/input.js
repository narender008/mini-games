// One input layer for keyboard and mouse, a standard gamepad and touch.
// The game reads actions, never devices:
//   move (a vector, length 0..1), aim (an angle, plus a ground point for the mouse),
//   and buttons attack, special, dash, cast, interact, pause.
// Presses are buffered: `take(action, window)` is true if the button went down
// within the last `window` seconds (and consumes the press), so an attack
// pressed a moment before the previous swing ends still comes out.
// Whichever device was touched last decides the glyphs the prompts show.
// Bindings are rebindable (Settings); defaults follow the usual conventions.
import { clamp, SIN_E } from '../config.js';

export const ACTIONS = ['attack', 'special', 'dash', 'cast', 'interact', 'pause'];
export const ACTION_NAMES = { attack: 'Attack', special: 'Special', dash: 'Dash', cast: 'Cast', interact: 'Interact', pause: 'Pause' };

// keyboard: KeyboardEvent.code; mouse buttons: 'Mouse0' (left), 'Mouse2' (right), 'Mouse1' (middle)
export const DEFAULT_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  attack: ['Mouse0', 'KeyJ'],
  special: ['Mouse2', 'KeyK'],
  dash: ['Space', 'ShiftLeft'],
  cast: ['KeyQ', 'KeyL'],
  interact: ['KeyE'],
  pause: ['Escape', 'KeyP'],
};
// standard gamepad mapping indices: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start
export const DEFAULT_PAD = {
  attack: [2, 7],
  special: [3, 6],
  dash: [0],
  cast: [1, 4],
  interact: [5],
  pause: [9, 8],
};

const MOVE_DEAD = 0.18;

// a stick with a dead zone, rescaled so it reaches 1 at the rim; writes into out
function stick(x, y, dead, out) {
  const l = Math.hypot(x, y);
  if (l < dead) {
    out.x = out.y = 0;
    return out;
  }
  const k = clamp((l - dead) / (1 - dead), 0, 1) / l;
  out.x = x * k;
  out.y = y * k;
  return out;
}
const AIM_DEAD = 0.32;

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.keysDown = new Set();
    this.time = 0; // real seconds, advanced by update()
    this.device = 'kbm'; // kbm | pad | touch
    this.onDevice = null;
    this.move = { x: 0, y: 0 };
    this.aim = { angle: Math.PI / 2, x: 0, y: 0, active: false, fromMouse: false, stick: false };
    this.mouse = { cssX: 0, cssY: 0, inside: false, moved: false };
    this.btn = {};
    for (const a of ACTIONS) this.btn[a] = { down: false, pressedAt: -1e9, padDown: false, touchDown: false, keyDown: false };
    this.touchMove = { x: 0, y: 0, on: false };
    this.touchAim = { x: 0, y: 0, on: false };
    this.pad = null;
    this.padIndex = -1;
    this.rumbleOn = true;
    this.capture = null; // rebinding: a function that receives the next key / button
    this.blocked = false; // menus open: the game ignores actions
    this.loadBindings();
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.releaseAll());
    canvas.addEventListener('pointerdown', (e) => this.pointer(e, true));
    window.addEventListener('pointerup', (e) => this.pointer(e, false));
    window.addEventListener('pointermove', (e) => this.pointerMove(e), { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('gamepadconnected', (e) => {
      this.padIndex = e.gamepad.index;
    });
  }

  loadBindings() {
    const b = this.settings.bindings;
    this.keys = structuredClone(DEFAULT_KEYS);
    this.padMap = structuredClone(DEFAULT_PAD);
    if (b?.keys) for (const [k, v] of Object.entries(b.keys)) if (Array.isArray(v)) this.keys[k] = v.slice(0, 3);
    if (b?.pad) for (const [k, v] of Object.entries(b.pad)) if (Array.isArray(v)) this.padMap[k] = v.slice(0, 3);
    this.reverse();
  }

  // code -> [actions]
  reverse() {
    this.codeTo = new Map();
    for (const [act, codes] of Object.entries(this.keys)) {
      for (const c of codes) {
        if (!this.codeTo.has(c)) this.codeTo.set(c, []);
        this.codeTo.get(c).push(act);
      }
    }
  }

  saveBindings() {
    this.settings.bindings = { keys: this.keys, pad: this.padMap };
  }

  // rebinding: replace the first binding of `action` on that device
  bindKey(action, code) {
    for (const [a, codes] of Object.entries(this.keys)) {
      if (a !== action) this.keys[a] = codes.filter((c) => c !== code);
    }
    const list = this.keys[action] || [];
    this.keys[action] = [code, ...list.filter((c) => c !== code)].slice(0, 2);
    this.reverse();
    this.saveBindings();
  }
  bindPad(action, index) {
    for (const [a, list] of Object.entries(this.padMap)) {
      if (a !== action) this.padMap[a] = list.filter((i) => i !== index);
    }
    const list = this.padMap[action] || [];
    this.padMap[action] = [index, ...list.filter((i) => i !== index)].slice(0, 2);
    this.saveBindings();
  }
  resetBindings() {
    this.settings.bindings = null;
    this.loadBindings();
  }

  setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    this.onDevice?.(d);
  }

  key(e, down) {
    if (this.capture && down) {
      e.preventDefault();
      const c = this.capture;
      this.capture = null;
      c({ kind: 'key', code: e.code });
      return;
    }
    const acts = this.codeTo.get(e.code);
    if (!acts) return;
    if (e.metaKey || e.ctrlKey) return;
    // keep the page from scrolling or the browser from acting on game keys
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    if (e.repeat) return;
    this.setDevice('kbm');
    if (down) this.keysDown.add(e.code);
    else this.keysDown.delete(e.code);
    for (const a of acts) this.setButton(a, 'keyDown', this.anyKeyDown(a));
  }

  anyKeyDown(action) {
    const codes = this.keys[action];
    if (!codes) return false;
    for (const c of codes) if (this.keysDown.has(c)) return true;
    return false;
  }

  setButton(a, src, on) {
    const b = this.btn[a];
    if (!b) return;
    const was = b.down;
    b[src] = on;
    b.down = b.keyDown || b.padDown || b.touchDown;
    if (b.down && !was) b.pressedAt = this.time;
  }

  // touch overlay buttons call this
  touchButton(a, on) {
    this.setDevice('touch');
    this.setButton(a, 'touchDown', on);
  }

  pointer(e, down) {
    if (e.pointerType === 'touch') return; // the touch overlay handles fingers
    const code = 'Mouse' + e.button;
    if (this.capture && down) {
      e.preventDefault();
      const c = this.capture;
      this.capture = null;
      c({ kind: 'key', code });
      return;
    }
    if (down) {
      this.setDevice('kbm');
      this.mouse.cssX = e.clientX;
      this.mouse.cssY = e.clientY;
      this.mouse.inside = true;
      this.keysDown.add(code);
    } else this.keysDown.delete(code);
    const acts = this.codeTo.get(code);
    if (acts) for (const a of acts) this.setButton(a, 'keyDown', this.anyKeyDown(a));
  }

  pointerMove(e) {
    if (e.pointerType === 'touch') return;
    this.mouse.cssX = e.clientX;
    this.mouse.cssY = e.clientY;
    this.mouse.inside = true;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) {
      this.mouse.moved = true;
      if (this.device === 'pad') this.setDevice('kbm');
    }
  }

  releaseAll() {
    this.keysDown.clear();
    for (const a of ACTIONS) {
      const b = this.btn[a];
      b.keyDown = b.padDown = b.touchDown = b.down = false;
    }
  }

  // was the button pressed within `window` seconds? consumes the press
  take(action, window = 0.18) {
    const b = this.btn[action];
    if (this.blocked || !b) return false;
    if (this.time - b.pressedAt <= window) {
      b.pressedAt = -1e9;
      return true;
    }
    return false;
  }
  held(action) {
    return !this.blocked && !!this.btn[action]?.down;
  }
  // clear buffered presses (a menu opened over the game)
  flush() {
    for (const a of ACTIONS) this.btn[a].pressedAt = -1e9;
  }

  rumble(strong, weak, ms) {
    if (!this.rumbleOn || this.device !== 'pad') return;
    const p = navigator.getGamepads?.()[this.padIndex];
    const act = p?.vibrationActuator;
    if (act?.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }

  // once per frame: poll the gamepad, combine move vectors, work out the aim
  // heroX/heroY: the heroine (ground metres); toGround(cssX, cssY, out) maps the cursor to the ground
  update(dt, heroX, heroY, toGround) {
    this.time += dt;
    this.pollPad();
    // movement
    let mx = 0;
    let my = 0;
    if (this.anyKeyDown('left')) mx -= 1;
    if (this.anyKeyDown('right')) mx += 1;
    if (this.anyKeyDown('up')) my -= 1;
    if (this.anyKeyDown('down')) my += 1;
    const kl = Math.hypot(mx, my);
    if (kl > 0) {
      mx /= kl;
      my /= kl;
    }
    if (this.padMove && (this.padMove.x || this.padMove.y)) {
      mx = this.padMove.x;
      my = this.padMove.y;
    }
    if (this.touchMove.on) {
      mx = this.touchMove.x;
      my = this.touchMove.y;
    }
    this.move.x = mx;
    this.move.y = my;
    // aim
    const a = this.aim;
    a.stick = false;
    a.fromMouse = false;
    if (this.device === 'kbm' && this.mouse.inside && toGround) {
      toGround(this.mouse.cssX, this.mouse.cssY, a);
      a.angle = Math.atan2(a.y - heroY, a.x - heroX);
      a.fromMouse = true;
      a.active = true;
    } else if (this.device === 'pad' && this.padAim && (this.padAim.x || this.padAim.y)) {
      a.angle = Math.atan2(this.padAim.y, this.padAim.x);
      a.stick = true;
      a.active = true;
    } else if (this.device === 'touch' && this.touchAim.on) {
      a.angle = Math.atan2(this.touchAim.y, this.touchAim.x);
      a.stick = true;
      a.active = true;
    } else {
      // aim follows movement (gamepad without the right stick, touch without the aim stick)
      a.active = false;
      if (mx || my) a.angle = Math.atan2(my, mx);
    }
  }

  pollPad() {
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    let p = pads[this.padIndex];
    if (!p) {
      for (const q of pads) if (q && q.connected) p = q;
      if (p) this.padIndex = p.index;
    }
    this.pad = p || null;
    this.padMove = null;
    this.padAim = null;
    if (!p) return;
    const ax = p.axes;
    const mv = stick(ax[0] || 0, ax[1] || 0, MOVE_DEAD, this.mvS || (this.mvS = { x: 0, y: 0 }));
    const am = stick(ax[2] || 0, ax[3] || 0, AIM_DEAD, this.amS || (this.amS = { x: 0, y: 0 }));
    // y down the screen is south: the stick's y already points that way; the ground is squashed on screen,
    // so a stick pushed diagonally should move diagonally on screen: stretch the ground y back out
    const PM = this.pm || (this.pm = { x: 0, y: 0 });
    if (mv.x || mv.y) {
      const gy = mv.y / SIN_E;
      const l = Math.hypot(mv.x, gy);
      const m = Math.min(1, Math.hypot(mv.x, mv.y));
      PM.x = (mv.x / l) * m;
      PM.y = (gy / l) * m;
    } else PM.x = PM.y = 0;
    this.padMove = PM;
    const PA = this.pa || (this.pa = { x: 0, y: 0 });
    PA.x = am.x;
    PA.y = am.y / SIN_E;
    this.padAim = PA;
    let any = (mv.x || mv.y || am.x || am.y) !== 0;
    if (this.capture) {
      for (let i = 0; i < p.buttons.length; i++) {
        if (p.buttons[i].pressed && !this.padPrev?.[i]) {
          const c = this.capture;
          this.capture = null;
          c({ kind: 'pad', index: i });
          break;
        }
      }
    }
    for (const act of ACTIONS) {
      const idx = this.padMap[act] || [];
      let on = false;
      for (const i of idx) if (p.buttons[i]?.pressed || (p.buttons[i]?.value || 0) > 0.5) on = true;
      if (on) any = true;
      if (on !== this.btn[act].padDown) this.setButton(act, 'padDown', on);
    }
    const prev = this.padPrev || (this.padPrev = []);
    for (let i = 0; i < p.buttons.length; i++) prev[i] = p.buttons[i].pressed;
    if (any) this.setDevice('pad');
  }
}

// the glyph a prompt shows for an action on the current device
const XBOX = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'Up', 'Down', 'Left', 'Right'];
const SONY = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right'];

// the printed name of a standard-mapping gamepad button (Xbox letters, or PlayStation symbols for a Sony pad)
export function padName(input, i) {
  if (i == null) return '-';
  const sony = /054c|playstation|dualsense|dualshock/i.test(input.pad?.id || '');
  return (sony ? SONY : XBOX)[i] ?? `B${i}`;
}

export function glyph(input, action) {
  if (input.device === 'pad') {
    const i = (input.padMap[action] || [])[0];
    return { kind: 'pad', text: padName(input, i), index: i };
  }
  if (input.device === 'touch') return { kind: 'touch', text: '' };
  const code = (input.keys[action] || [])[0];
  return { kind: 'key', text: keyName(code), code };
}

export function keyName(code) {
  if (!code) return '—';
  if (code === 'Mouse0') return 'LMB';
  if (code === 'Mouse2') return 'RMB';
  if (code === 'Mouse1') return 'MMB';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names = { Space: 'Space', Escape: 'Esc', ShiftLeft: 'Shift', ShiftRight: 'Shift', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Tab: 'Tab', ControlLeft: 'Ctrl', AltLeft: 'Alt' };
  return names[code] || code;
}
