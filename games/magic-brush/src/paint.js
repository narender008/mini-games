// The easel page: a fixed 1200 x 900 paint canvas plus a 128 x 96 grid that
// tracks where paint is, what colour it is and how wet it is.
//
// A brush stroke is drawn in small steps along a smoothed path onto a live
// layer: a solid core, a darker wet rim tucked underneath (destination-over,
// so joints never show), bristle streaks along the stroke and, for glitter,
// a sprinkle of sparkles. The live layer is composited at 92 % onto the page
// when the last finger lifts, so colours show through each other a little.
// Wet colours blend: a brush passing over paint that is still wet picks a
// little of it up and carries it along.
//
// Coverage is counted on the grid as cells are first painted inside the
// outline (no pixel reads). Undo replays the recorded strokes. At GO the
// golden fill paints any bare parts under the child's paint in colours taken
// from what they used, and the friend's texture is cropped from that page.
import { RAINBOW, GLITTER, KID, rng, clamp, lerp, mix, shade, hex, toHex, toHsl, fromHsl, layer, circ, star4, spath } from './lib.js';
import { FRIENDS, partsOf, friendBox } from './friends.js';
import { kidFill, texFrame, TEX_K, sprinkleGlitter } from './rig.js';

export const PW = 1200, PH = 900, GW = 128, GH = 96;
const CW = PW / GW, CH = PH / GH;
export const BRUSH_W = 46;
export const POTS = [KID.red, KID.orange, KID.yellow, KID.green, KID.blue, KID.purple, KID.pink, KID.brown, 'rainbow', 'glitter'];
const WET = 2.5; // seconds paint stays wet

export function placeFor(kind) {
  if (kind === 'blank') return { x: PW / 2, y: PH / 2, s: 1 };
  const b = friendBox(kind), s = Math.min((0.8 * PW) / b.w, (0.8 * PH) / b.h);
  return { x: PW / 2 - b.cx * s, y: PH / 2 - b.cy * s + 8, s };
}

const MASKS = new Map();
// which part (top-most) owns each grid cell; -1 outside the friend
function ownerGrid(kind) {
  if (MASKS.has(kind)) return MASKS.get(kind);
  const owner = new Int8Array(GW * GH).fill(-1);
  if (kind !== 'blank') {
    const c = layer(GW, GH), g = c.getContext('2d', { willReadFrequently: true }), pl = placeFor(kind);
    partsOf(kind).forEach((part, i) => {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, GW, GH);
      g.setTransform(pl.s / CW, 0, 0, pl.s / CH, pl.x / CW, pl.y / CH);
      g.fillStyle = '#fff'; g.fill(spath(part.pts));
      const d = g.getImageData(0, 0, GW, GH).data;
      for (let k = 0; k < GW * GH; k++) if (d[k * 4 + 3] > 110) owner[k] = i;
    });
  }
  MASKS.set(kind, owner);
  return owner;
}

export class Painting {
  constructor(kind) {
    this.kind = kind;
    this.blank = kind === 'blank';
    this.place = placeFor(kind);
    this.canvas = layer(PW, PH);
    this.g = this.canvas.getContext('2d');
    this.live = layer(PW, PH);
    this.lg = this.live.getContext('2d');
    this.owner = ownerGrid(kind);
    this.inside = 0;
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] >= 0) this.inside++;
    this.reset();
    this.history = []; // groups of stroke records
    this.active = new Map();
    this.group = [];
    this.version = 0;
    this.seq = 1;
  }
  reset() {
    this.g.clearRect(0, 0, PW, PH);
    this.lg.clearRect(0, 0, PW, PH);
    this.painted = new Uint8Array(GW * GH);
    this.cr = new Uint8Array(GW * GH); this.cg = new Uint8Array(GW * GH); this.cb = new Uint8Array(GW * GH);
    this.wet = new Float32Array(GW * GH).fill(-99);
    this.sid = new Int32Array(GW * GH);
    this.paintedIn = 0;
    this.paintedAll = 0;
    this.liveDirty = false;
  }
  get coverage() {
    if (this.blank) return clamp(this.paintedAll / (GW * GH * 0.22), 0, 1);
    return this.inside ? this.paintedIn / this.inside : 0;
  }
  get stars() { return clamp(Math.floor((this.coverage / 0.8) * 5 + 1e-6), 0, 5); }
  get starFill() { return clamp((this.coverage / 0.8) * 5, 0, 5); }
  get goReady() { return this.coverage >= 0.3; }
  // "almost nothing": GO only hints
  get tooLittle() { return this.blank ? this.paintedAll < GW * GH * 0.012 : this.coverage < 0.04; }
  get painting() { return this.active.size > 0; }

  // ------------------------------------------------------------ strokes
  begin(id, x, y, color, now) {
    if (this.active.has(id)) this.end(id);
    const seed = this.seq++;
    const base = color === 'rainbow' ? '#ffd23f' : color === 'glitter' ? GLITTER : color;
    const rec = { color, w: BRUSH_W, seed, pts: [] };
    const st = { rec, R: rng(seed * 7919), cur: base, base, px: x, py: y, mx: x, my: y, n: 0, lx: x, ly: y, nx: 0, ny: 1, sid: seed };
    this.active.set(id, st);
    this.group.push(rec);
    this._sample(st, x, y, now, true);
    return st;
  }
  move(id, x, y, now) {
    const st = this.active.get(id);
    if (!st) return;
    if (Math.hypot(x - st.px, y - st.py) < 2) return;
    // quadratic smoothing through the midpoints
    const mx = (st.px + x) / 2, my = (st.py + y) / 2;
    const ax = st.mx, ay = st.my, cx = st.px, cy = st.py;
    const len = Math.hypot(cx - ax, cy - ay) + Math.hypot(mx - cx, my - cy);
    const n = Math.max(1, Math.ceil(len / 6));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this._sample(st, u * u * ax + 2 * u * t * cx + t * t * mx, u * u * ay + 2 * u * t * cy + t * t * my, now);
    }
    st.mx = mx; st.my = my; st.px = x; st.py = y;
  }
  end(id) {
    const st = this.active.get(id);
    if (!st) return;
    this._sample(st, st.px, st.py, 0, false, true);
    this.active.delete(id);
    if (this.active.size === 0) this._commit();
  }
  endAll() { for (const id of [...this.active.keys()]) this.end(id); }
  _commit() {
    if (!this.group.length) return;
    this.g.save(); this.g.globalAlpha = 0.92; this.g.drawImage(this.live, 0, 0); this.g.restore();
    this.lg.clearRect(0, 0, PW, PH);
    this.liveDirty = false;
    this.history.push(this.group);
    if (this.history.length > 200) this.history.shift();
    this.group = [];
    this.version++;
  }
  _sample(st, x, y, now, first = false, last = false) {
    const rec = st.rec;
    if (!first && !last) {
      const dx = x - st.lx, dy = y - st.ly, l = Math.hypot(dx, dy);
      if (l < 0.5) return;
      st.nx = -dy / l; st.ny = dx / l;
    }
    // colour pickup from wet paint
    let col = st.cur;
    if (rec.color !== 'rainbow' && rec.color !== 'glitter' && now > 0) {
      const ci = this._cell(x, y);
      if (ci >= 0 && this.painted[ci] && this.sid[ci] !== st.sid && now - this.wet[ci] < WET) {
        col = mix(col, toHex(this.cr[ci], this.cg[ci], this.cb[ci]), 0.07);
      } else col = mix(col, st.base, 0.04);
      st.cur = col;
    }
    const p = [Math.round(x * 10) / 10, Math.round(y * 10) / 10, col];
    rec.pts.push(p);
    this._drawStep(this.lg, rec, st, rec.pts.length - 1);
    this._mark(rec, st, x, y, col, now);
    st.lx = x; st.ly = y; st.n++;
    this.liveDirty = true;
  }
  _cell(x, y) {
    const cx = Math.floor(x / CW), cy = Math.floor(y / CH);
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return -1;
    return cy * GW + cx;
  }
  _mark(rec, st, x, y, col, now) {
    const r = rec.w * 0.5;
    const x0 = Math.max(0, Math.floor((x - r) / CW)), x1 = Math.min(GW - 1, Math.floor((x + r) / CW));
    const y0 = Math.max(0, Math.floor((y - r) / CH)), y1 = Math.min(GH - 1, Math.floor((y + r) / CH));
    const rainbow = rec.color === 'rainbow';
    const A = hex(rec.color === 'glitter' ? GLITTER : col);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const px = (cx + 0.5) * CW - x, py = (cy + 0.5) * CH - y;
      if (px * px + py * py > r * r) continue;
      const i = cy * GW + cx;
      if (!this.painted[i]) { this.painted[i] = 1; this.paintedAll++; if (this.owner[i] >= 0) this.paintedIn++; }
      let c = A;
      if (rainbow) { const off = px * st.nx + py * st.ny, band = clamp(Math.floor((off / rec.w + 0.5) * 6), 0, 5); c = hex(RAINBOW[band]); }
      this.cr[i] = c[0]; this.cg[i] = c[1]; this.cb[i] = c[2];
      this.wet[i] = now; this.sid[i] = st.sid;
    }
  }
  // draw the step ending at sample k (deterministic, so replay matches)
  _drawStep(g, rec, st, k) {
    const pts = rec.pts, p1 = pts[k], p0 = k > 0 ? pts[k - 1] : [p1[0] - 0.1, p1[1], p1[2]];
    const w = rec.w, col = p1[2], R = rng(rec.seed * 131 + k);
    let dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    if (rec.color === 'rainbow') {
      for (let b = 0; b < 6; b++) {
        const off = (b - 2.5) * (w / 6);
        g.strokeStyle = RAINBOW[b]; g.lineWidth = w / 6 + 2.2;
        g.beginPath(); g.moveTo(p0[0] + nx * off, p0[1] + ny * off); g.lineTo(p1[0] + nx * off, p1[1] + ny * off); g.stroke();
      }
    } else {
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
    }
    // bristle streaks along the stroke, with a couple of dry-brush gaps
    g.lineCap = 'butt';
    const bcol = rec.color === 'rainbow' ? null : col;
    for (let b = -4; b <= 4; b++) {
      const off = b * w * 0.1 + (((rec.seed * 37 + b * 13) % 7) - 3) * 0.7;
      const dry = (rec.seed + b * 5) % 7 === 0;
      g.strokeStyle = dry ? 'rgba(255,250,240,1)' : bcol ? shade(bcol, b % 2 ? 0.34 : -0.2) : 'rgba(255,255,255,0.8)';
      g.globalAlpha = dry ? 0.45 : bcol ? 0.42 : 0.25; g.lineWidth = Math.max(1.2, w * (dry ? 0.04 : 0.055));
      g.beginPath(); g.moveTo(p0[0] + nx * off, p0[1] + ny * off); g.lineTo(p1[0] + nx * off, p1[1] + ny * off); g.stroke();
    }
    g.globalAlpha = 1;
    // the wet rim, tucked under what is already there
    g.globalCompositeOperation = 'destination-over'; g.lineCap = 'round';
    g.strokeStyle = rec.color === 'rainbow' ? 'rgba(120,80,150,0.55)' : shade(col, -0.22); g.lineWidth = w + 4;
    g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
    g.globalCompositeOperation = 'source-over';
    if (rec.color === 'glitter') {
      const n = Math.max(1, Math.round(l / 5));
      for (let i = 0; i < n; i++) {
        const t = R(), o = (R() - 0.5) * w * 0.85, x = lerp(p0[0], p1[0], t) + nx * o, y = lerp(p0[1], p1[1], t) + ny * o;
        if (R() < 0.18) star4(g, x, y, 3 + R() * 4, '#ffffff');
        else { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.95)' : 'rgba(255,214,90,0.95)'; circ(g, x, y, 1 + R() * 1.6); g.fill(); }
      }
    }
    g.restore();
  }

  undo() {
    if (this.painting) return false;
    if (!this.history.length) return false;
    this.history.pop();
    this._replay();
    this.version++;
    return true;
  }
  _replay() {
    this.reset();
    for (const grp of this.history) {
      for (const rec of grp) {
        const st = { rec, nx: 0, ny: 1, sid: rec.seed };
        for (let k = 0; k < rec.pts.length; k++) {
          const p = rec.pts[k];
          if (k > 0) { const q = rec.pts[k - 1], dx = p[0] - q[0], dy = p[1] - q[1], l = Math.hypot(dx, dy); if (l > 0.5) { st.nx = -dy / l; st.ny = dx / l; } }
          this._drawStep(this.lg, rec, st, k);
          this._mark(rec, st, p[0], p[1], p[2], -99);
        }
      }
      this.g.save(); this.g.globalAlpha = 0.92; this.g.drawImage(this.live, 0, 0); this.g.restore();
      this.lg.clearRect(0, 0, PW, PH);
    }
  }

  // a scripted stroke through page points (debug and colourIn)
  strokeThrough(points, color, id = 'script') {
    if (!points.length) return;
    this.begin(id, points[0][0], points[0][1], color, 0);
    for (let i = 1; i < points.length; i++) this.move(id, points[i][0], points[i][1], 0);
    this.end(id);
  }
  // scribble inside every part, like a child colouring in
  colourIn(colors) {
    if (this.blank) {
      const pts = []; let dir = 1;
      for (let y = PH * 0.28; y < PH * 0.75; y += BRUSH_W * 0.7) { pts.push([dir > 0 ? PW * 0.3 : PW * 0.7, y]); pts.push([dir > 0 ? PW * 0.7 : PW * 0.3, y + BRUSH_W * 0.35]); dir = -dir; }
      this.strokeThrough(pts, (colors && colors[0]) || KID.purple);
      return;
    }
    const F = FRIENDS[this.kind], pl = this.place;
    partsOf(this.kind).forEach((part) => {
      const col = (colors && colors[part.slot % colors.length]) || F.pal[part.slot];
      const P = part.pts.map(([x, y]) => [pl.x + x * pl.s, pl.y + y * pl.s]);
      let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, y] of P) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
      const step = BRUSH_W * 0.6, pts = []; let dir = 1;
      const inset = Math.min(BRUSH_W * 0.3, (c - a) * 0.2);
      for (let y = b + step * 0.4; y <= d - step * 0.2 || pts.length < 2; y += step) {
        const y2 = Math.min(y, d);
        pts.push([dir > 0 ? a + inset : c - inset, y2]); pts.push([dir > 0 ? c - inset : a + inset, y2]);
        dir = -dir;
        if (y > d) break;
      }
      this.strokeThrough(pts, col === 'rainbow' || col === 'glitter' ? col : col, 'ci');
    });
  }

  // ------------------------------------------------------------ the golden fill
  // colours used, most painted first
  usedColours() {
    const counts = new Map();
    for (let i = 0; i < this.painted.length; i++) if (this.painted[i]) {
      const key = toHex(this.cr[i] & 0xf0 | 8, this.cg[i] & 0xf0 | 8, this.cb[i] & 0xf0 | 8);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  }
  partColours() {
    const parts = partsOf(this.kind), n = parts.length, F = FRIENDS[this.kind];
    const owned = new Array(n).fill(0), pc = new Array(n).fill(0), cols = parts.map(() => new Map());
    for (let i = 0; i < this.owner.length; i++) {
      const o = this.owner[i]; if (o < 0) continue;
      owned[o]++;
      if (this.painted[i]) { pc[o]++; const key = toHex(this.cr[i] & 0xf0 | 8, this.cg[i] & 0xf0 | 8, this.cb[i] & 0xf0 | 8); cols[o].set(key, (cols[o].get(key) || 0) + 1); }
    }
    const used = this.usedColours();
    const main = used[0] || F.pal[0];
    const bySlot = {};
    const pick = new Array(n).fill(null), frac = new Array(n).fill(0);
    parts.forEach((p, i) => {
      frac[i] = owned[i] ? pc[i] / owned[i] : 0;
      if (frac[i] >= 0.12) { const best = [...cols[i].entries()].sort((a, b) => b[1] - a[1])[0]; pick[i] = best ? best[0] : main; if (!bySlot[p.slot]) bySlot[p.slot] = pick[i]; }
    });
    const [h, s, l] = toHsl(main);
    const harmonised = {
      0: main,
      1: mix(main, '#fffaf0', 0.62),
      2: used[1] || fromHsl(h + 0.08, clamp(s, 0.5, 0.85), clamp(l + 0.08, 0.55, 0.72)),
      3: used[2] || used[1] || fromHsl(h - 0.1, clamp(s, 0.55, 0.85), clamp(l + 0.12, 0.6, 0.75)),
    };
    parts.forEach((p, i) => { if (!pick[i]) pick[i] = bySlot[p.slot] || harmonised[p.slot] || main; });
    return { pick, frac, used, main };
  }
  // returns { filled: canvas with bare parts painted under the child's paint, colours }
  goldenFill() {
    const filled = layer(PW, PH), fg = filled.getContext('2d');
    let info = null;
    if (!this.blank) {
      info = this.partColours();
      const pl = this.place;
      fg.save(); fg.setTransform(pl.s, 0, 0, pl.s, pl.x, pl.y);
      partsOf(this.kind).forEach((part, i) => kidFill(fg, part.pts, info.pick[i], i * 3.17 + 11, { noFleck: true }));
      fg.restore();
    }
    fg.drawImage(this.canvas, 0, 0);
    return { filled, info };
  }
  // the friend's texture in friend units, cropped from a page canvas
  textureFrom(page) {
    const fr = texFrame(this.kind), pl = this.place, k = TEX_K;
    const c = layer(fr.w * k, fr.h * k), g = c.getContext('2d');
    g.drawImage(page, pl.x + fr.ox * pl.s, pl.y + fr.oy * pl.s, fr.w * pl.s, fr.h * pl.s, 0, 0, c.width, c.height);
    return { canvas: c, ox: fr.ox, oy: fr.oy, k };
  }
  // bounds of everything painted, in page px (blank page)
  paintBounds() {
    let a = GW, b = GH, c = -1, d = -1;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (this.painted[y * GW + x]) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
    if (c < 0) return null;
    return { x: Math.max(0, (a - 1) * CW), y: Math.max(0, (b - 1) * CH), w: Math.min(PW, (c + 2) * CW) - Math.max(0, (a - 1) * CW), h: Math.min(PH, (d + 2) * CH) - Math.max(0, (b - 1) * CH) };
  }
  // the doodle buddy's texture: the painted shape scaled to about 190 units tall
  doodleTexture() {
    const b = this.paintBounds() || { x: PW * 0.4, y: PH * 0.4, w: PW * 0.2, h: PH * 0.2 };
    const s = Math.min(190 / b.h, 300 / b.w, 2.2), wu = b.w * s, hu = b.h * s, k = TEX_K;
    const c = layer(wu * k, hu * k), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(this.canvas, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
    const tex = { canvas: c, ox: -wu / 2, oy: -10 - hu, k };
    // find a good place for the eyes: the widest run of paint about a third of the way down
    const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    const runAt = (row) => {
      let best = null, start = -1;
      for (let x = 0; x <= W; x++) {
        const on = x < W && d[(row * W + x) * 4 + 3] > 90;
        if (on && start < 0) start = x;
        if (!on && start >= 0) { if (!best || x - start > best[1] - best[0]) best = [start, x]; start = -1; }
      }
      return best;
    };
    let eye = null, ey = 0;
    for (const f of [0.32, 0.25, 0.4, 0.5, 0.2, 0.6]) { const row = Math.floor(H * f), r = runAt(row); if (r && (!eye || r[1] - r[0] > (eye[1] - eye[0]) * 1.3)) { eye = r; ey = row; } }
    if (!eye) { eye = [W * 0.3, W * 0.7]; ey = H * 0.3; }
    const ex = tex.ox + ((eye[0] + eye[1]) / 2) / k, ew = Math.max(50, (eye[1] - eye[0]) / k), eyU = tex.oy + ey / k;
    let mouthY = eyU + clamp(ew * 0.3, 22, 40);
    const used = this.usedColours();
    // where unit (0, 0) sits on the page, and page px per unit
    const place = { x: b.x + b.w / 2, y: b.y + b.h + 10 / s, s: 1 / s };
    return { tex, place, eyes: { ex, ey: eyU, ew, mouthY, color: used[0] || KID.purple } };
  }
}
