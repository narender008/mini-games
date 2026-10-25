// 6. Book: a scrapbook of every painted friend, newest first. Each portrait
// sits in a painted frame with washi tape and its stars; the last frame on
// every page is an empty dotted one that starts a new painting. Arrows turn
// the pages. Tapping a friend sends it to the meadow (where it walks in).
// Portraits are built only for the page on screen, from lazily loaded
// textures, and cached.
import { Screen } from './base.js';
import { FRIENDS, friendBox } from '../friends.js';
import { buildRig, buildDoodleRig, makeDoodleDef, drawRig, defaultTexture } from '../rig.js';
import { Actor } from '../actor.js';
import { buttonSprite } from '../ui.js';
import { brushTool, flower } from '../art.js';
import { INK, KID, rgba, mix, shade, vgrad, rrect, wob, spath, bl, wash, inkLine, inkFill, starPts, ell, softShadow, sparkle, heartPath, layer, lerp, clamp, rng } from '../lib.js';
import { sfx } from '../audio.js';

const FRAME_COLS = ['#ff86b8', '#ffd23f', '#5cc28a', '#4b8ef0', '#9b6ff0', '#ff9a3d', '#3cc0c0', '#f0544f'];
const BGS = ['#bfe3f2', '#ffe0ef', '#fff1c4', '#e3dcff', '#d9f2cf', '#cfeeff', '#ffe7d1'];
const TAPES = ['#ffd23f', '#8fd3ff', '#ff86b8', '#5cc28a'];

function bookLayout(W, H, br) {
  const m = br * 0.35, por = H > W * 1.05, L = { m, por };
  L.home = [m + br, m + br, br];
  const ar = br * 1.05;
  if (!por) {
    const side = m + ar * 2 + m;
    const top = m * 2 + br * 2 - br * 0.6, bottom = H - m * 1.2;
    let bw = W - side * 2, bh = bottom - top;
    const spread = bw / bh > 1.0;
    L.cols = spread ? 4 : 2; L.rows = 2; L.spread = spread;
    const aspect = spread ? 1.75 : 0.95;
    if (bw / bh > aspect) bw = bh * aspect; else bh = bw / aspect;
    L.book = { x: W / 2 - bw / 2, y: top + (bottom - top - bh) / 2, w: bw, h: bh };
    L.prev = [Math.max(m + ar, L.book.x - m - ar), L.book.y + bh / 2, ar];
    L.next = [Math.min(W - m - ar, L.book.x + bw + m + ar), L.book.y + bh / 2, ar];
  } else {
    const top = m * 2 + br * 2, bottom = H - m * 2 - ar * 2;
    let bw = W - m * 2, bh = bottom - top;
    L.cols = 2; L.rows = 3; L.spread = false;
    if (bw / bh > 0.72) bw = bh * 0.72; else bh = bw / 0.72;
    L.book = { x: W / 2 - bw / 2, y: top + (bottom - top - bh) / 2, w: bw, h: bh };
    L.prev = [m + ar + m, H - m - ar, ar];
    L.next = [W - m - ar - m, H - m - ar, ar];
  }
  // slot rects
  const b = L.book, pad = b.w * 0.035, slots = [];
  if (L.spread) {
    for (let side = 0; side < 2; side++) for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      const pw = b.w / 2, px = b.x + side * pw, cw = (pw - pad * 2) / 2, rh = (b.h - pad * 2) / 2;
      slots.push({ x: px + pad + (c + 0.5) * cw, y: b.y + pad + (r + 0.5) * rh, size: Math.min(cw * 0.86, rh * 0.8) });
    }
  } else {
    const cw = (b.w - pad * 2) / L.cols, rh = (b.h - pad * 2) / L.rows;
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) slots.push({ x: b.x + pad + (c + 0.5) * cw, y: b.y + pad + (r + 0.5) * rh, size: Math.min(cw * 0.86, rh * 0.8) });
  }
  L.slots = slots;
  return L;
}

export class BookScreen extends Screen {
  constructor(app) { super(app, 'book'); this.page = 0; this.portraits = new Map(); }
  orient() { const { W, H } = this.app; return H > W * 1.05 ? 'p' : 'l'; }
  bgKey() { const L = bookLayout(this.app.W, this.app.H, this.app.btnR); return 'book-' + this.orient() + (L.spread ? 's' : '1'); }

  paintBg(g, W, H) {
    const L = bookLayout(W, H, this.app.btnR), b = L.book, k = Math.min(W / 1600, H / 900);
    g.fillStyle = vgrad(g, 0, H, [[0, '#f6dcc8'], [0.7, '#f1cfb9'], [1, '#d9a77a']]); g.fillRect(0, 0, W, H);
    const R = rng(3); for (let i = 0; i < 30; i++) { const x = R() * W, y = R() * H, r = (60 + R() * 200) * Math.max(0.5, k), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(R() < 0.5 ? '#ffffff' : '#e7a98a', 0.12)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    const dy = b.y + b.h * 0.85, desk = rrect(-40, dy, W + 80, H - dy + 200, 20);
    wash(g, desk, '#c98a52', 5, { top: '#e8b57e', edge: 0.3, raw: true, k: Math.max(0.5, k) });
    g.strokeStyle = rgba('#8a5a36', 0.35); g.lineWidth = 3; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, dy + 40 * k + i * 28 * k); g.bezierCurveTo(W * 0.25, dy + 30 * k + i * 30 * k, W * 0.56, dy + 60 * k + i * 26 * k, W, dy + 44 * k + i * 28 * k); g.stroke(); }
    softShadow(g, W / 2, b.y + b.h + 16, b.w * 0.58, 40 * Math.max(0.5, k), 0.4);
    const s = b.h / 672;
    const cover = rrect(b.x - 18 * s, b.y - 14 * s, b.w + 36 * s, b.h + 30 * s, 26 * s);
    wash(g, cover, '#4a6fc0', 3, { top: '#7a9be0', edge: 0.4, raw: true, k: s }); inkLine(g, cover, Math.max(2, 5 * s), 2);
    const pages = L.spread ? 2 : 1;
    for (let side = 0; side < pages; side++) {
      const pw = b.w / pages, x0 = b.x + side * pw, x1 = x0 + pw, inner = L.spread ? (side ? x0 : x1) : null, pg = [];
      for (let i = 0; i <= 20; i++) { const t = i / 20, x = lerp(x0, x1, t), c = inner == null ? 0 : Math.sin((side ? 1 - t : t) * Math.PI * 0.9); pg.push([x, b.y + 14 * s - c * 16 * s]); }
      pg.push([x1, b.y + b.h - 4 * s]);
      for (let i = 20; i >= 0; i--) { const t = i / 20, x = lerp(x0, x1, t), c = inner == null ? 0 : Math.sin((side ? 1 - t : t) * Math.PI * 0.9); pg.push([x, b.y + b.h + 4 * s - c * 10 * s]); }
      const path = new Path2D(); pg.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y))); path.closePath();
      g.fillStyle = '#fffaf0'; g.fill(path);
      if (inner != null) { g.save(); g.clip(path); const gr = g.createLinearGradient(inner, 0, inner + (side ? 80 : -80) * s, 0); gr.addColorStop(0, 'rgba(120,80,60,0.28)'); gr.addColorStop(1, 'rgba(120,80,60,0)'); g.fillStyle = gr; g.fillRect(b.x, b.y - 10, b.w, b.h + 20); g.restore(); }
      g.save(); g.strokeStyle = rgba(INK, 0.75); g.lineWidth = Math.max(2, 4 * s); g.lineJoin = 'round'; g.stroke(path); g.restore();
    }
    if (L.spread) {
      const cx = b.x + b.w / 2, hs = 22 * s;
      inkFill(g, heartPath(cx - 6 * s, b.y + b.h * 0.42, hs), '#ff6f9a', 3.5);
      flower(g, cx, b.y + b.h * 0.86, 1.5 * s, '#9b6ff0', { stem: false });
      inkFill(g, spath(starPts(cx + 4 * s, b.y + b.h * 0.14, 18 * s, 0.2)), '#8fd3ff', 3.5);
    }
  }

  enter() {
    this.busy = false; this.turn = null;
    this.list = [...this.app.store.friends()].reverse();
    this.home = this.button({ id: 'home', label: 'Home', icon: 'home', col: '#4b8ef0', seed: 4, once: true, onTap: () => { if (!this.busy) { this.busy = true; sfx.tap(); this.app.go('title'); } } });
    this.prevB = this.button({ id: 'prev', label: 'Previous page', icon: 'arrowL', col: '#ff9a3d', seed: 12, cooldown: 0.4, onTap: () => this.flip(-1) });
    this.nextB = this.button({ id: 'next', label: 'Next page', icon: 'arrowR', col: '#ff9a3d', seed: 13, cooldown: 0.4, onTap: () => this.flip(1) });
    this.slotB = [];
  }
  get perPage() { return this.L.slots.length - 1; }
  get pages() { return Math.max(1, Math.ceil(this.list.length / this.perPage)); }
  layout(W, H) {
    const L = (this.L = bookLayout(W, H, this.app.btnR));
    this.home.place(...L.home);
    this.prevB.place(...L.prev); this.nextB.place(...L.next);
    // one button per slot
    while (this.slotB.length < L.slots.length) {
      const i = this.slotB.length;
      this.slotB.push(this.button({ id: 'book-slot-' + i, label: 'Book page slot', rect: true, onTap: () => this.tapSlot(i), drawFn: (g, b, t) => this.drawSlot(g, b, t, i) }));
    }
    while (this.slotB.length > L.slots.length) { const b = this.slotB.pop(); b.remove(); this.buttons.splice(this.buttons.indexOf(b), 1); }
    this.page = clamp(this.page, 0, this.pages - 1);
    L.slots.forEach((s, i) => this.slotB[i].place(s.x, s.y, null, s.size * 1.12, s.size * 1.12));
    this.refreshSlots();
  }
  slotItem(i, page = this.page) {
    const per = this.perPage;
    if (i === this.L.slots.length - 1) return { empty: true };
    const idx = page * per + i;
    const meta = this.list[idx];
    return meta ? { meta } : null;
  }
  refreshSlots() {
    this.slotB.forEach((b, i) => {
      const it = this.slotItem(i);
      b.setHidden(!it);
      if (it) b.setLabel(it.empty ? 'Paint a new friend' : 'Bring the ' + (it.meta.kind === 'blank' ? 'doodle buddy' : it.meta.kind) + ' to the meadow');
      b.item = it;
      if (it && it.meta) this.ensurePortrait(it.meta, this.L.slots[i].size);
    });
    this.prevB.setHidden(this.page <= 0);
    this.nextB.setHidden(this.page >= this.pages - 1);
  }
  flip(d) {
    if (this.busy || this.turn) return;
    const np = this.page + d;
    if (np < 0 || np >= this.pages) return;
    this.turn = { from: this.page, d, t: 0 };
    this.page = np;
    sfx.page();
    this.refreshSlots();
  }
  tapSlot(i) {
    if (this.busy || this.turn) return;
    const it = this.slotItem(i);
    if (!it) return;
    this.busy = true;
    const b = this.slotB[i];
    b.pop = 1;
    this.app.fx.burstSparkles(b.x, b.y, 10, b.w, { size: 22 });
    if (it.empty) { sfx.magic(); this.app.go('pick'); return; }
    sfx.happy(1);
    const gone = this.app.store.toMeadow(it.meta.id);
    const p = this.portraits.get(it.meta.id);
    if (p && p.actor) p.actor.giggle();
    this.sendT = 0.35; this.sendTo = { arrive: it.meta.id, gone };
  }
  ensurePortrait(meta, size) {
    const dpr = this.app.dpr, key = meta.id;
    let p = this.portraits.get(key);
    if (p && Math.abs(p.size - size) < 2 && p.dpr === dpr) return p;
    p = { size, dpr, sprite: null, loading: true, actor: null };
    this.portraits.set(key, p);
    if (this.portraits.size > 40) this.portraits.delete(this.portraits.keys().next().value);
    this.app.store.loadTexture(meta.id).then((tex) => {
      const t = tex || defaultTexture(meta.kind === 'blank' ? 'bunny' : meta.kind, null, 5);
      const def = meta.kind === 'blank' ? makeDoodleDef(t, meta.eyes || { ex: 0, ey: -150, ew: 80, mouthY: -120, color: meta.col }) : FRIENDS[meta.kind];
      const box = meta.kind === 'blank' ? def.box : friendBox(meta.kind);
      const s = (size * 0.8) / Math.max(box.w, box.h * 1.1);
      const rig = meta.kind === 'blank' ? buildDoodleRig(t, def, s * dpr, { dpr }) : buildRig(meta.kind, t, s * dpr, { dpr });
      const a = new Actor(meta.kind === 'blank' ? 'doodle' : meta.kind, def, rig);
      a.s = s; a.fx = this.app.fx;
      p.actor = a; p.box = box; p.loading = false;
    });
    return p;
  }
  frameSprite(meta, size, i) {
    const col = FRAME_COLS[(meta ? hashId(meta.id) : i) % FRAME_COLS.length], bg = BGS[(meta ? hashId(meta.id) >>> 3 : 0) % BGS.length];
    const S = size * 1.35;
    return buttonSprite('frame-' + (meta ? meta.id : 'empty') + '-' + col, S, this.app.dpr, (g, cx, cy) => {
      const fw = size * 0.86, s = size / 236;
      if (!meta) {
        const P = wob(rrect(cx - fw / 2, cy - fw / 2, fw, fw, 26 * s), 1.5 * s, 4);
        g.save(); g.setLineDash([2, 18 * s]); g.lineCap = 'round'; g.lineWidth = Math.max(4, 9 * s); g.strokeStyle = rgba(INK, 0.35); g.stroke(spath(P)); g.restore();
        brushTool(g, cx - 40 * s, cy + 40 * s, -0.8, 130 * s, KID.pink, { w: 22 * s }); sparkle(g, cx + 40 * s, cy - 40 * s, 14 * s);
        return;
      }
      softShadow(g, cx + 6 * s, cy + fw / 2 + 10 * s, fw * 0.55, 12 * s, 0.3);
      const fr = wob(rrect(cx - fw / 2 - 16 * s, cy - fw / 2 - 16 * s, fw + 32 * s, fw + 32 * s, 30 * s), 2 * s, hashId(meta.id) % 9 + 2);
      wash(g, fr, col, 5, { top: shade(col, 0.4), edge: 0.35, k: s, wob: 3 * s }); inkLine(g, fr, Math.max(2, 4.5 * s), 3);
      const inner = rrect(cx - fw / 2, cy - fw / 2, fw, fw, 20 * s), ip = spath(inner);
      g.save(); g.clip(ip); g.fillStyle = vgrad(g, cy - fw / 2, cy + fw / 2, [[0, bg], [1, mix(bg, '#ffffff', 0.5)]]); g.fillRect(cx - fw, cy - fw, 2 * fw, 2 * fw);
      const gnd = bl(cx - fw, cy + fw * 0.28, cx, cy + fw * 0.2, cx + fw, cy + fw * 0.3, cx + fw, cy + fw, cx - fw, cy + fw); g.fillStyle = '#a9dc8f'; g.fill(spath(gnd)); g.restore();
      g.save(); g.lineWidth = Math.max(2, 4 * s); g.strokeStyle = INK; g.stroke(ip); g.restore();
    });
  }
  update(dt) {
    super.update(dt);
    if (this.turn) { this.turn.t += dt / 0.4; if (this.turn.t >= 1) this.turn = null; }
    for (const [, p] of this.portraits) if (p.actor) p.actor.update(dt);
    if (this.sendTo) { this.sendT -= dt; if (this.sendT <= 0) { const o = this.sendTo; this.sendTo = null; this.app.go('meadow', o); } }
  }
  drawSlot(g, b, t, i) {
    const it = b.item; if (!it) return;
    const s = this.L.slots[i], size = s.size;
    if (this.turn) { const q = this.turn.t, d = this.turn.d; g.translate((1 - easeO(q)) * d * size * 0.9, 0); g.globalAlpha *= Math.min(1, q * 1.6); }
    const rot = it.meta ? ((hashId(it.meta.id) % 7) - 3) * 0.018 : 0.01;
    g.rotate(rot);
    const fs = this.frameSprite(it.meta, size, i), S = size * 1.35;
    g.drawImage(fs.c, -S / 2, -S / 2, S, S);
    if (!it.meta) return;
    const p = this.portraits.get(it.meta.id);
    if (p && p.actor) {
      const a = p.actor, box = p.box, fw = size * 0.86;
      g.save(); g.beginPath(); g.roundRect(-fw / 2, -fw / 2, fw, fw, 20 * size / 236); g.clip();
      a.x = -box.cx * a.s; a.y = -box.cy * a.s + fw * 0.05;
      const pose = a.makePose();
      softShadow(g, 0, a.y, fw * 0.3, fw * 0.05, 0.25);
      drawRig(g, a.rig, pose);
      g.restore();
    }
    // washi tape and stars
    const k = size / 236, h = hashId(it.meta.id);
    g.save(); g.translate(0, -size * 0.43 - 14 * k); g.rotate(-0.08 + (h % 2) * 0.16);
    g.fillStyle = rgba(TAPES[h % 4], 0.82); g.fillRect(-48 * k, -14 * k, 96 * k, 28 * k);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; for (let x = -40; x < 48; x += 14) { g.beginPath(); g.moveTo(x * k, -14 * k); g.lineTo((x + 8) * k, 14 * k); g.stroke(); }
    g.restore();
    const n = clamp(it.meta.stars || 1, 1, 5);
    const ss = buttonSprite('bookstar', 56 * k, this.app.dpr, (sg, cx, cy) => { inkFill(sg, spath(starPts(cx, cy, 20 * k, 0.1, 0.5)), '#ffd23f', Math.max(2, 3.5 * k)); sg.fillStyle = 'rgba(255,255,255,0.7)'; ell(sg, cx - 6 * k, cy - 6 * k, 5 * k, 3 * k, -0.6); sg.fill(); });
    for (let j = 0; j < n; j++) { const sx = size * 0.43 - 4 * k - j * 34 * k, sy = size * 0.43 + 4 * k; g.drawImage(ss.c, sx - 28 * k, sy - 28 * k, 56 * k, 56 * k); }
  }
  draw(g) {
    this.drawBg(g);
    if (this.app.cover) for (const b of this.slotB) b.draw(g, this.app.t);
    this.drawButtons(g);
    this.app.fx.draw(g, 0);
  }
  pointer(type, p) { if (type === 'down') this.app.fx.burstSparkles(p.x, p.y, 3, 70, { size: 14 }); }
  debugState() { return { page: this.page, pages: this.pages }; }
}
const easeO = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
function hashId(id) { let h = 7; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; }
