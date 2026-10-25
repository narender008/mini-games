// 3. Paint: the friend's chunky dotted outline on taped paper. Ten pots
// below, Undo on the left, the magic wand (GO) on the right, five stars on
// a cloud at the top that fill as the inside of the outline is covered.
// Paint goes anywhere (outside the lines is kept). GO glows from 30 %
// coverage; with almost nothing painted it only wiggles and sparkles round
// the outline. Every finger paints its own stroke. The painting is new each
// time this screen opens, and GO captures it (with its golden fill) on the
// spot, so the friend that comes alive is always the one on the easel.
import { Screen } from './base.js';
import { easelLayout, paintEaselBg, drawTape } from './easel-art.js';
import { Painting, POTS, PW, PH } from '../paint.js';
import { FRIEND_IDS, partsOf } from '../friends.js';
import { drawDottedOutline } from '../rig.js';
import { paintPot, meterCloud, meterStar, brushTool } from '../art.js';
import { buttonSprite, glowPulse } from '../ui.js';
import { KID, RAINBOW, layer, clamp, glow, sparkle } from '../lib.js';
import { sfx } from '../audio.js';

const POT_NAMES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'rainbow', 'glitter'];

export class EaselScreen extends Screen {
  constructor(app) { super(app, 'paint'); this.painting = null; this.kind = 'dragon'; }
  orient() { const { W, H } = this.app; return H > W * 1.05 ? 'p' : 'l'; }
  bgKey() { return 'easel-' + this.orient(); }
  paintBg(g, W, H) { paintEaselBg(g, W, H, easelLayout(W, H, this.app.btnR, this.app.phone)); }

  enter(opts) {
    const kind = FRIEND_IDS.includes(opts.kind) || opts.kind === 'blank' ? opts.kind : 'dragon';
    this.kind = kind;
    this.painting = new Painting(kind); // never carries paint over
    this.busy = false; this.prepared = null;
    this.pot = kind === 'blank' ? 4 : 0;
    this.lastStars = 0; this.starPop = [0, 0, 0, 0, 0];
    this.hint = null; this.pointers = new Map(); this.hover = null; this.overlay = null;
    this.home = this.button({ id: 'home', label: 'Home', icon: 'home', col: '#4b8ef0', seed: 4, once: true, onTap: () => { if (!this.busy) { this.busy = true; this.painting.endAll(); sfx.tap(); this.app.go('title'); } } });
    this.undoB = this.button({ id: 'undo', label: 'Undo', icon: 'undo', col: '#ff9a3d', seed: 6, cooldown: 0.15, onTap: () => this.undo() });
    this.goB = this.button({ id: 'go', label: 'Make it come alive', icon: 'wand', col: '#9b6ff0', seed: 9, iconScale: 0.62, cooldown: 0.3, onTap: () => this.pressGo() });
    this.pots = POTS.map((c, i) => this.button({ id: 'pot-' + POT_NAMES[i], label: POT_NAMES[i] + ' paint', rect: true, onTap: () => this.choosePot(i), drawFn: (g, b, t) => this.drawPot(g, b, t, i) }));
    this.pots.forEach((b, i) => b.el.setAttribute('aria-pressed', String(i === this.pot)));
  }
  exit() { if (this.painting) this.painting.endAll(); sfx.brush(0); super.exit(); }

  layout(W, H) {
    const L = (this.L = easelLayout(W, H, this.app.btnR, this.app.phone));
    this.home.place(...L.home);
    this.undoB.place(...L.undo);
    this.goB.place(...L.go);
    this.pots.forEach((b, i) => { const p = L.pots[i]; b.place(p.x, p.y, null, p.w, p.h); b.potS = p.s; });
    this.overlay = null;
  }
  buildOverlay() {
    const p = this.L.page, dpr = this.app.dpr, sc = p.w / PW;
    const c = layer(p.w * dpr, p.h * dpr), g = c.getContext('2d');
    if (this.kind !== 'blank') {
      const pl = this.painting.place;
      g.scale(dpr, dpr);
      drawDottedOutline(g, this.kind, pl.x * sc, pl.y * sc, pl.s * sc, { ink: Math.max(3, p.h * 0.011) });
    }
    // outline points for the hint sparkles
    const pts = [];
    if (this.kind !== 'blank') {
      const pl = this.painting.place;
      for (const part of partsOf(this.kind)) for (let i = 0; i < part.pts.length; i += 9) pts.push([p.x + (pl.x + part.pts[i][0] * pl.s) * sc, p.y + (pl.y + part.pts[i][1] * pl.s) * sc]);
    } else for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push([p.x + p.w / 2 + Math.cos(a) * p.w * 0.3, p.y + p.h / 2 + Math.sin(a) * p.h * 0.3]); }
    this.overlay = { canvas: c, w: p.w, h: p.h, dpr, pts };
  }

  choosePot(i) {
    if (this.busy) return;
    this.pot = i;
    this.pots.forEach((b, k) => b.el.setAttribute('aria-pressed', String(k === i)));
    sfx.pot(i);
    const b = this.pots[i];
    this.app.fx.burstSparkles(b.x, b.y - b.h * 0.4, 5, b.w, { size: b.w * 0.25, col: i < 8 ? POTS[i] : '#fff3b0' });
  }
  get color() { return POTS[this.pot]; }
  undo() {
    if (this.busy || !this.painting) return false;
    const ok = this.painting.undo();
    if (ok) { sfx.undo(); this.app.fx.burstSparkles(this.undoB.x, this.undoB.y, 5, 80, { size: 16 }); }
    else { this.undoB.wiggle = 1; sfx.nope(); }
    this.lastStars = Math.min(this.lastStars, this.painting.stars);
    return ok;
  }
  pressGo(force) {
    if (this.busy || !this.painting) return false;
    const P = this.painting;
    P.endAll();
    if (P.tooLittle) {
      this.goB.wiggle = 1; sfx.hint();
      this.hint = { t: 0, n: 0 };
      return false;
    }
    if (!force && !this.app.inputReady()) return false;
    // capture the friend on the easel right now: its paint, golden fill and texture
    const { filled, info } = P.goldenFill();
    const prepared = { painting: P, kind: P.kind, filled, info, stars: Math.max(1, P.stars), coverage: P.coverage };
    if (P.blank) { const d = P.doodleTexture(); prepared.tex = d.tex; prepared.eyes = d.eyes; prepared.place = d.place; }
    else prepared.tex = P.textureFrom(filled);
    if (!this.app.go('alive', { prepared })) return false;
    this.busy = true; this.goB.fired = true;
    sfx.magic();
    this.app.fx.burstSparkles(this.goB.x, this.goB.y, 14, this.goB.r * 3, { size: 26 });
    return true;
  }

  toPage(x, y) { const p = this.L.page; return [((x - p.x) / p.w) * PW, ((y - p.y) / p.h) * PH]; }
  inPage(x, y, pad = 0) { const p = this.L.page; return x >= p.x - pad && x <= p.x + p.w + pad && y >= p.y - pad && y <= p.y + p.h + pad; }

  pointer(type, e) {
    if (this.busy) return;
    const P = this.painting, app = this.app;
    if (type === 'down') {
      if (!this.inPage(e.x, e.y, 6)) { app.fx.burstSparkles(e.x, e.y, 3, 70, { size: 14 }); return; }
      const [u, v] = this.toPage(e.x, e.y);
      P.begin(e.id, u, v, this.color, app.t);
      this.pointers.set(e.id, { x: e.x, y: e.y, t: e.t, speed: 0 });
      this.hover = { x: e.x, y: e.y, type: e.type };
    } else if (type === 'move') {
      if (e.type === 'mouse') this.hover = this.inPage(e.x, e.y, 30) ? { x: e.x, y: e.y, type: 'mouse' } : null;
      const st = this.pointers.get(e.id);
      if (!st) return;
      const [u, v] = this.toPage(e.x, e.y);
      P.move(e.id, u, v, app.t);
      const dt = Math.max(0.008, e.t - st.t), d = Math.hypot(e.x - st.x, e.y - st.y);
      st.speed = st.speed * 0.7 + (d / dt) * 0.3; st.x = e.x; st.y = e.y; st.t = e.t;
      sfx.brush(st.speed);
      this.hover = { x: e.x, y: e.y, type: e.type };
    } else if (type === 'up' || type === 'cancel') {
      if (this.pointers.has(e.id)) { P.end(e.id); this.pointers.delete(e.id); if (!this.pointers.size) sfx.brush(0); }
      if (e.type !== 'mouse') this.hover = null;
    } else if (type === 'leave') { this.hover = null; }
  }

  update(dt) {
    super.update(dt);
    const P = this.painting, app = this.app;
    if (!P) return;
    // stars
    const st = P.stars;
    if (st > this.lastStars) {
      for (let i = this.lastStars; i < st; i++) { this.starPop[i] = 1; const [x, y] = this.starPos(i); app.fx.burstSparkles(x, y, 8, 140, { size: 20 }); }
      sfx.star(st);
      if (st >= 1 && this.lastStars < 1 && !P.goReady) {}
    }
    this.lastStars = Math.max(this.lastStars, st);
    if (st < this.lastStars) this.lastStars = st;
    for (let i = 0; i < 5; i++) this.starPop[i] = Math.max(0, this.starPop[i] - dt * 2.5);
    // GO glows from 30 %
    this.goB.glow = P.goReady && !this.busy ? 1 : 0;
    if (P.goReady && app.rand() < dt * 3) { const a = app.rand() * 6.28; app.fx.sparkle(this.goB.x + Math.cos(a) * this.goB.r * 1.2, this.goB.y + Math.sin(a) * this.goB.r * 1.2, 10 + app.rand() * 14); }
    // the hint: sparkles running round the outline
    if (this.hint && this.overlay) {
      this.hint.t += dt;
      const pts = this.overlay.pts, want = Math.floor(this.hint.t * pts.length * 1.2);
      while (this.hint.n < Math.min(want, pts.length)) { const q = pts[this.hint.n++]; app.fx.sparkle(q[0], q[1], 16 + app.rand() * 12, { col: '#ffe680' }); }
      if (this.hint.t > 1.4) this.hint = null;
    }
  }
  starPos(i) { const m = this.L.meter, gap = m.r * 2.5; return [m.x + (i - 2) * gap, m.y]; }

  drawPot(g, b, t, i) {
    const sel = i === this.pot, s = b.potS;
    const lift = sel ? -b.h * 0.12 + Math.sin(t * 3) * b.h * 0.015 : 0;
    g.translate(0, lift);
    if (sel) { glowPulse(g, b.w * 0.45, t, 0.8); }
    const size = 150 * s;
    const sp = buttonSprite('pot' + i, size, this.app.dpr, (sg, cx, cy) => paintPot(sg, cx, cy + 20 * s, POTS[i], s));
    g.drawImage(sp.c, -size / 2, -size / 2 - 20 * s + b.h * 0.08, size, size);
    if (sel) {
      g.save(); g.strokeStyle = '#fffaf0'; g.lineWidth = Math.max(3, 6 * s); g.setLineDash([1, 13 * s]); g.lineCap = 'round';
      g.beginPath(); g.ellipse(0, -10 * s + b.h * 0.08, 62 * s, 70 * s, 0, t * 0.6, t * 0.6 + 6.283); g.stroke(); g.restore();
    }
  }

  draw(g) {
    const app = this.app, t = app.t, P = this.painting, p = this.L.page;
    this.drawBg(g);
    // the painting
    g.save(); g.beginPath(); g.rect(p.x, p.y, p.w, p.h); g.clip();
    g.drawImage(P.canvas, p.x, p.y, p.w, p.h);
    if (P.painting) { g.globalAlpha = 0.92; g.drawImage(P.live, p.x, p.y, p.w, p.h); g.globalAlpha = 1; }
    g.restore();
    if (!this.overlay || this.overlay.dpr !== app.dpr || Math.abs(this.overlay.w - p.w) > 0.5) this.buildOverlay();
    const pulse = this.hint ? 0.7 + 0.3 * Math.sin(this.hint.t * 20) : 1;
    g.save(); g.globalAlpha = pulse; g.drawImage(this.overlay.canvas, p.x, p.y, p.w, p.h); g.restore();
    drawTape(g, p);
    // star meter
    if (!app.cover || true) {
      const m = this.L.meter;
      const cs = m.r * 15;
      const cl = buttonSprite('meter', cs, app.dpr, (sg, cx, cy) => meterCloud(sg, cx, cy, m.r));
      g.drawImage(cl.c, m.x - cs / 2, m.y - cs / 2, cs, cs);
      const fill = P.starFill;
      for (let i = 0; i < 5; i++) {
        const [x, y] = this.starPos(i), f = clamp(fill - i, 0, 1), pop = this.starPop[i];
        g.save(); g.translate(x, y); const sc = 1 + Math.sin(pop * Math.PI) * 0.45; g.scale(sc, sc);
        meterStar(g, 0, 0, m.r, f >= 1 ? 1 : f, (i - 2) * 0.08 + Math.sin(t * 2 + i) * (f >= 1 ? 0.06 : 0));
        g.restore();
      }
    }
    this.drawButtons(g);
    app.fx.draw(g, 0);
    // the brush: under the finger while painting, resting on the page otherwise
    if (!app.cover || true) {
      const col = this.color, len = clamp(p.h * 0.5, 90, 330), w = len * 0.13;
      const h = this.hover;
      if (h && (h.type === 'mouse' || P.painting)) brushTool(g, h.x, h.y, -0.42, len, col, { w, shadow: w * 0.3 });
      else if (!this.busy) {
        // resting on the easel's ledge, inviting a hand
        const bx = p.x + p.w * 0.5, by = p.y + p.h + p.h * 0.012 + Math.sin(t * 2) * 2;
        brushTool(g, bx, by, -0.06 + Math.sin(t * 1.3) * 0.02, len * 0.85, col, { w: w * 0.9, shadow: w * 0.25 });
      }
    }
  }

  // ------------------------------------------------------------ debug
  debugPaint(points, color) {
    if (!this.painting || this.busy) return false;
    const c = color == null ? this.color : POT_NAMES.includes(color) ? POTS[POT_NAMES.indexOf(color)] : color;
    this.painting.strokeThrough(points.map(([u, v]) => [u * PW, v * PH]), c);
    return this.painting.coverage;
  }
  debugColourIn(colors) {
    if (!this.painting || this.busy) return false;
    const cols = colors && colors.map((c) => (POT_NAMES.includes(c) ? POTS[POT_NAMES.indexOf(c)] : c));
    this.painting.colourIn(cols);
    return this.painting.coverage;
  }
  debugState() {
    const P = this.painting;
    return { friend: this.kind, coverage: P ? Math.round(P.coverage * 1000) / 1000 : 0, stars: P ? P.stars : 0, goReady: P ? P.goReady : false, pot: POT_NAMES[this.pot] };
  }
}
