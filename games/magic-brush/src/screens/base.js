// Shared screen plumbing: buttons, baked backgrounds (cached per size, kept
// for the last few screens so going back and forth costs nothing), and the
// hand-off of pointer events.
import { Button } from '../ui.js';
import { layer, paperOver } from '../lib.js';

const BG = new Map();
export function bakeCached(key, W, H, dpr, paint) {
  const k = `${key}|${W}|${H}|${dpr}`;
  let c = BG.get(k);
  if (c) { BG.delete(k); BG.set(k, c); return c; }
  const cv = layer(W * dpr, H * dpr), g = cv.getContext('2d');
  g.scale(dpr, dpr);
  paint(g, W, H);
  paperOver(g, 0, 0, W, H, 1, 1);
  c = { canvas: cv, W, H, dpr, key };
  BG.set(k, c);
  while (BG.size > 5) BG.delete(BG.keys().next().value);
  return c;
}

export class Screen {
  constructor(app, name) { this.app = app; this.name = name; this.buttons = []; this.bg = null; this.busy = false; }
  button(o) { const b = new Button(this.app, o); this.buttons.push(b); return b; }
  enter() {}
  exit() { for (const b of this.buttons) b.remove(); this.buttons = []; }
  layout() {}
  bgKey() { return this.name; }
  paintBg() {}
  prebake() { const { W, H, dpr } = this.app; bakeCached(this.bgKey(), W, H, dpr, (g, w, h) => this.paintBg(g, w, h)); }
  ensureBg() {
    const { W, H, dpr } = this.app;
    const stale = !this.bg || this.bg.W !== W || this.bg.H !== H || this.bg.dpr !== dpr || this.bg.key !== this.bgKey();
    if (stale && (!this.bg || this.app.bakeOk() || this.bg.key !== this.bgKey())) this.bg = bakeCached(this.bgKey(), W, H, dpr, (g, w, h) => this.paintBg(g, w, h));
  }
  drawBg(g) { this.ensureBg(); g.drawImage(this.bg.canvas, 0, 0, this.app.W, this.app.H); }
  update(dt) { for (const b of this.buttons) b.update(dt); }
  drawButtons(g) { if (this.app.cover) return; const t = this.app.t; for (const b of this.buttons) b.draw(g, t); }
  pointer() {}
}
