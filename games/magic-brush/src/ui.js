// Buttons. Each one is painted on the canvas (a cached sprite blitted with a
// squash when pressed) and mirrored by a transparent DOM <button> with a
// stable id and an aria-label, which does the hit testing, focus and
// keyboard access. A tap only counts when its press started after the
// screen appeared and the screen's quiet time (400 ms) has passed, and each
// button can be made one-shot so a double tap cannot fire twice.
import { layer, glow, clamp } from './lib.js';
import { bigButton } from './art.js';

const SPRITES = new Map();
export function buttonSprite(key, size, dpr, draw) {
  const k = key + '|' + size.toFixed(1) + '|' + dpr;
  let s = SPRITES.get(k);
  if (!s) {
    const c = layer(size * dpr, size * dpr), g = c.getContext('2d');
    g.scale(dpr, dpr); draw(g, size / 2, size / 2);
    s = { c, size };
    SPRITES.set(k, s);
    if (SPRITES.size > 160) SPRITES.delete(SPRITES.keys().next().value);
  }
  return s;
}

export class Button {
  constructor(app, o) {
    this.app = app;
    Object.assign(this, { x: 0, y: 0, r: 40, w: 0, h: 0, hidden: false, pressed: false, pop: 0, wiggle: 0, once: false, fired: false, scale: 1, z: 0 }, o);
    const el = document.createElement(o.href ? 'a' : 'button');
    if (o.href) el.href = o.href; else el.type = 'button';
    el.id = o.id; el.className = 'hit' + (o.rect ? ' rect' : '');
    el.setAttribute('aria-label', o.label);
    if (o.pressedState != null) el.setAttribute('aria-pressed', String(!!o.pressedState));
    this.el = el;
    this.downAt = -1;
    el.addEventListener('pointerdown', (e) => {
      this.downAt = app.clock();
      app.unlockAudio();
      if (!app.inputReady()) return;
      this.pressed = true;
      e.stopPropagation();
    });
    // a press fires on release, not on the browser's click: a click can be held
    // back or swallowed after a quick paint stroke (double-tap detection)
    const up = () => {
      if (!this.pressed) return;
      this.pressed = false; this.pop = 1;
      if (o.href) return;
      this.upAt = app.clock();
      if (this.downAt >= app.screenAt) this.tap();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', () => { this.pressed = false; });
    el.addEventListener('pointercancel', () => { this.pressed = false; });
    el.addEventListener('click', (e) => {
      const keyboard = e.detail === 0;
      if (o.href) {
        // the back-to-games link: only a deliberate tap on the title screen
        if (!app.inputReady() || (!keyboard && this.downAt < app.screenAt)) { e.preventDefault(); return; }
        return;
      }
      e.preventDefault();
      if (!keyboard && app.clock() - (this.upAt || -9) < 1) return; // already handled on release
      if (!keyboard && this.downAt < app.screenAt) return;
      this.tap();
    });
    app.ui.appendChild(el);
  }
  tap() {
    const app = this.app;
    if (!app.inputReady() || this.hidden) return false;
    if (this.once && this.fired) return false;
    if (this.cooldown && app.clock() - (this.lastTap || -9) < this.cooldown) return false;
    // the spot a finger just left: a button there on the next screen stays
    // inert a little longer (see app.landing), so a mashed tap cannot carry over
    if (app.landingGuard && app.landingGuard(this)) return false;
    this.lastTap = app.clock();
    app.lastTapSpot = { x: this.x, y: this.y, r: this.rect ? Math.max(this.w, this.h) / 2 : this.r, t: app.clock(), W: app.W, H: app.H };
    if (this.once) this.fired = true;
    this.pop = 1;
    app.unlockAudio();
    this.onTap && this.onTap(this);
    return true;
  }
  place(x, y, r, w, h) {
    this.x = x; this.y = y; if (r != null) this.r = r; if (w != null) { this.w = w; this.h = h; }
    const s = this.el.style;
    if (this.rect) { s.left = `${x - this.w / 2}px`; s.top = `${y - this.h / 2}px`; s.width = `${this.w}px`; s.height = `${this.h}px`; }
    else { const hr = this.r * (this.hitScale || 1.08); s.left = `${x - hr}px`; s.top = `${y - hr}px`; s.width = `${hr * 2}px`; s.height = `${hr * 2}px`; }
    s.display = this.hidden ? 'none' : '';
  }
  setHidden(h) { this.hidden = h; this.el.style.display = h ? 'none' : ''; }
  setLabel(l) { this.el.setAttribute('aria-label', l); }
  remove() { this.el.remove(); }
  update(dt) {
    this.pop = Math.max(0, this.pop - dt * 3.2);
    this.wiggle = Math.max(0, this.wiggle - dt * 1.4);
    const target = this.pressed ? 0.88 : 1;
    this.scale += (target - this.scale) * Math.min(1, dt * 22);
  }
  // squash on press, a springy pop on release, a wiggle when asked
  transform(g, t) {
    const pop = this.pop > 0 ? Math.sin((1 - this.pop) * Math.PI * 2.2) * this.pop * 0.12 : 0;
    const wig = this.wiggle > 0 ? Math.sin(t * 28) * this.wiggle * 0.22 : 0;
    g.translate(this.x, this.y);
    if (wig) g.rotate(wig);
    const sx = this.scale * (1 + pop), sy = this.scale * (1 - pop * 0.6);
    g.scale(sx, sy);
  }
  draw(g, t) {
    if (this.hidden) return;
    g.save();
    this.transform(g, t);
    if (this.drawFn) this.drawFn(g, this, t);
    else {
      const size = this.r * 2.6, dpr = this.app.dpr;
      if (this.glow) glowPulse(g, this.r, t, this.glow);
      const s = buttonSprite(`${this.icon}|${this.col}|${this.seed || 3}|${this.paint || ''}|${this.iconScale || 0}`, size, dpr, (sg, cx, cy) => bigButton(sg, cx, cy, this.r, this.col, this.icon, { seed: this.seed, iconScale: this.iconScale, paint: this.paint }));
      g.drawImage(s.c, -size / 2, -size / 2, size, size);
      if (this.active) { g.strokeStyle = '#fffaf0'; g.lineWidth = Math.max(3, this.r * 0.1); g.setLineDash([2, this.r * 0.22]); g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, this.r * 1.18, t * 0.8, t * 0.8 + Math.PI * 2); g.stroke(); g.setLineDash([]); }
    }
    g.restore();
  }
}

let GLOW = null;
export function glowPulse(g, r, t, amt = 1) {
  if (!GLOW) { GLOW = layer(128, 128); glow(GLOW.getContext('2d'), 64, 64, 64, '#fff1a0', 0.8, 'source-over'); }
  const k = (1.9 + 0.25 * Math.sin(t * 4)) * r;
  g.save(); g.globalAlpha = clamp(amt, 0, 1); g.globalCompositeOperation = 'lighter'; g.drawImage(GLOW, -k, -k, k * 2, k * 2); g.restore();
}
