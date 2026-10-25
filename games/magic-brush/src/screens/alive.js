// 4. Alive: about four seconds of magic that taps cannot interrupt.
//   0.0 s  a golden sweep crosses the page; behind it the bare parts fill
//          with colours taken from the child's own paint
//   1.1 s  the friend wakes on the paper (its bitmaps are cut from that very
//          page, so it wears the child's painting, brush strokes and all)
//   1.5 s  it peels off toward us, a stretchy ribbon of wet paint still tying
//          it to the page until it snaps, drips falling as it goes
//   2.6 s  it lands with a squash, paint-drop confetti and a fanfare
//   3.4 s  it trots off into the meadow
// The friend is saved here, once, under the id it is given now.
import { Screen } from './base.js';
import { easelLayout, paintEaselBg, drawTape } from './easel-art.js';
import { PW, PH } from '../paint.js';
import { Actor } from '../actor.js';
import { FRIENDS, friendBox } from '../friends.js';
import { buildRig, buildDoodleRig, makeDoodleDef, drawRig, drawDottedOutline, friendUnionPath } from '../rig.js';
import { canvasBlob } from '../store.js';
import { layer, clamp, lerp, smooth, easeInOut, easeOut, spath, wob, shade, rgba, INK, TAU } from '../lib.js';
import { sfx } from '../audio.js';
import { PAINT_COLS } from '../fx.js';

let RAYS = null;
function raysSprite() {
  if (RAYS) return RAYS;
  const S = 512, c = layer(S, S), g = c.getContext('2d'), cx = S / 2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, gr = g.createLinearGradient(cx, cx, cx + Math.cos(a) * cx, cx + Math.sin(a) * cx);
    gr.addColorStop(0, 'rgba(255,240,170,0.5)'); gr.addColorStop(1, 'rgba(255,240,170,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(cx, cx); g.arc(cx, cx, cx, a - 0.07, a + 0.07); g.closePath(); g.fill();
  }
  const gl = g.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.6); gl.addColorStop(0, 'rgba(255,241,176,0.75)'); gl.addColorStop(1, 'rgba(255,241,176,0)');
  g.fillStyle = gl; g.fillRect(0, 0, S, S);
  RAYS = c; return c;
}

export class AliveScreen extends Screen {
  constructor(app) { super(app, 'alive'); this.prep = null; }
  orient() { const { W, H } = this.app; return H > W * 1.05 ? 'p' : 'l'; }
  bgKey() { return 'alive-' + this.orient(); }
  paintBg(g, W, H) { paintEaselBg(g, W, H, easelLayout(W, H, this.app.btnR, this.app.phone), { shelf: false }); }

  enter(opts) {
    const app = this.app;
    this.busy = true;
    let prep = opts.prepared;
    if (!prep && opts.painting) {
      const P = opts.painting, { filled, info } = P.goldenFill();
      prep = { painting: P, kind: P.kind, filled, info, stars: Math.max(1, P.stars), coverage: P.coverage };
      if (P.blank) { const d = P.doodleTexture(); prep.tex = d.tex; prep.eyes = d.eyes; prep.place = d.place; } else prep.tex = P.textureFrom(filled);
    }
    this.prep = prep;
    const P = prep.painting, blank = prep.kind === 'blank';
    this.place = blank ? prep.place : P.place;
    this.def = blank ? makeDoodleDef(prep.tex, prep.eyes) : FRIENDS[prep.kind];
    // save once
    if (!P.savedId) {
      const id = app.store.newId();
      P.savedId = id;
      const tex = prep.tex;
      const meta = { id, kind: prep.kind, stars: prep.stars, t: Date.now(), ox: tex.ox, oy: tex.oy, k: tex.k, col: blank ? prep.eyes.color : (prep.info && prep.info.main) || this.def.pal[0] };
      if (blank) meta.eyes = prep.eyes;
      app.store.addFriend(meta, canvasBlob(tex.canvas));
      this.gone = app.store.toMeadow(id);
      app.store.primeTexture(id, tex);
    }
    this.id = P.savedId;
    // the page once the friend has lifted off: its own paint gone, a soft hollow left
    const after = layer(PW, PH), ag = after.getContext('2d');
    if (blank) { ag.globalAlpha = 0.12; ag.drawImage(prep.filled, 0, 0); ag.globalAlpha = 1; }
    else {
      ag.drawImage(prep.filled, 0, 0);
      const u = friendUnionPath(prep.kind, P.place.x, P.place.y, P.place.s);
      ag.save(); ag.globalCompositeOperation = 'destination-out'; ag.fill(u); ag.restore();
      ag.fillStyle = 'rgba(150,120,190,0.16)'; ag.fill(u);
    }
    this.after = after;
    this.T = 0; this.flags = {};
    this.actor = null; this.rigS = 0; this.overlay = null;
    const anchorBox = blank ? this.def.box : friendBox(prep.kind);
    this.anchor = [anchorBox.x + 16, anchorBox.y + anchorBox.h * 0.6];
    const tint = blank ? prep.eyes.color : (prep.info && prep.info.pick[0]) || this.def.pal[0];
    this.tint = tint === 'rainbow' ? '#ffd23f' : tint === 'glitter' ? '#d4c4ff' : tint;
    this.cols = [this.tint, ...((prep.info && prep.info.used) || []).slice(0, 3)];
  }

  layout(W, H) {
    const app = this.app, L = (this.L = easelLayout(W, H, app.btnR, app.phone)), p = L.page, sc = p.w / PW;
    const pl = this.place;
    this.s0 = pl.s * sc;
    this.x0 = p.x + pl.x * sc; this.y0 = p.y + pl.y * sc;
    const maxS = (H * (L.por ? 0.36 : 0.55)) / 230;
    this.s1 = Math.min(this.s0 * 1.3, maxS);
    this.x1 = L.por ? W * 0.55 : Math.min(W - 160 * this.s1, p.x + p.w * 0.78);
    this.y1 = H - Math.max(14, H * 0.035);
    const kpx = Math.max(this.s0, this.s1) * app.dpr * 1.1;
    if (!this.actor || Math.abs(this.rigS - kpx) / kpx > 0.15) {
      const rig = this.prep.kind === 'blank' ? buildDoodleRig(this.prep.tex, this.def, kpx, { dpr: app.dpr }) : buildRig(this.prep.kind, this.prep.tex, kpx, { dpr: app.dpr });
      this.rigS = kpx;
      if (!this.actor) { this.actor = new Actor(this.prep.kind === 'blank' ? 'doodle' : this.prep.kind, this.def, rig, { mood: 'sleep' }); this.actor.fx = app.fx; this.actor.mood = 'sleep'; }
      else this.actor.rig = rig;
    }
    // the dotted outline left behind on the page
    const c = layer(p.w * app.dpr, p.h * app.dpr), g = c.getContext('2d');
    if (this.prep.kind !== 'blank') { g.scale(app.dpr, app.dpr); drawDottedOutline(g, this.prep.kind, pl.x * sc, pl.y * sc, pl.s * sc, { ink: Math.max(3, p.h * 0.011), col: '#8a7aa0', face: false }); }
    this.overlay = c;
    this.placeActor();
  }

  placeActor() {
    const a = this.actor, T = this.T;
    if (!a) return;
    if (T < 1.5) { a.x = this.x0; a.y = this.y0; a.s = this.s0; a.rot = 0; return; }
    const q = clamp((T - 1.5) / 1.1, 0, 1), e = easeInOut(q);
    if (T < 2.6) {
      a.x = lerp(this.x0, this.x1, e); a.y = lerp(this.y0, this.y1, e) - Math.sin(q * Math.PI) * this.app.H * 0.1;
      a.s = lerp(this.s0, this.s1, e); a.rot = Math.sin(q * Math.PI * 3) * 0.07 * (1 - q);
    } else if (!this.walking) { a.x = this.x1; a.y = this.y1; a.s = this.s1; a.rot = 0; }
  }

  update(dt) {
    super.update(dt);
    const app = this.app, a = this.actor, f = this.flags;
    this.T += dt;
    const T = this.T, p = this.L.page;
    if (!f.magic && T > 0.02) { f.magic = true; }
    // sparkles riding the sweep
    if (T < 1.15) {
      const q = easeInOut(T / 1.1), d = p.h * 0.45, lx = p.x - d + q * (p.w + 2 * d);
      for (let i = 0; i < 2; i++) { const yy = p.y + app.rand() * p.h, xx = lx + d * (1 - (yy - p.y) / p.h); if (xx > p.x && xx < p.x + p.w) app.fx.sparkle(xx, yy, 12 + app.rand() * 20, { col: '#ffe680' }); }
    }
    if (T > 1.1 && !f.wake) { f.wake = true; sfx.sparkle(); }
    if (T > 1.45 && !f.eyes) { f.eyes = true; a.mood = a.baseMood = 'happy'; a.blink = 1; a.kick(-2); sfx.happy(this.def.voice || 1); }
    if (T > 1.5 && !f.peel) { f.peel = true; sfx.whoosh(true); }
    if (T > 1.5 && T < 2.6 && app.rand() < dt * 14) { const [x, y] = a.local((app.rand() - 0.5) * 140, -app.rand() * 120); app.fx.add({ type: 'drop', col: this.cols[(app.rand() * this.cols.length) | 0] || this.tint, x, y, vy: 60, grav: 900, life: 1, size: 16 * Math.max(0.6, a.s), align: true }); }
    if (T > 2.33 && !f.snap) {
      f.snap = true; sfx.pop(0.8);
      const [ax, ay] = this.pageAnchor();
      app.fx.confetti(ax, ay, 10, 260, [this.tint], { size: 22 });
    }
    if (T > 2.6 && !f.land) {
      f.land = true; a.kick(3.2); sfx.thud(); sfx.fanfare();
      a.setMood('joy', 1.4); sfx.giggle(this.def.voice || 1);
      const [cx, cy] = a.local(0, -110);
      app.fx.confetti(cx, cy, 70, Math.max(app.W, app.H) * 0.55, PAINT_COLS, { size: 30, arc: 6.2, wide: 1.3 });
      app.fx.burstSparkles(cx, cy, 16, 380, { size: 30 });
    }
    if (T > 3.0 && !f.hop) { f.hop = true; a.jump(46, 0.45); a.setMood('open', 0.6); }
    if (T > 3.5 && !f.walk) { f.walk = true; this.walking = true; a.facing = 1; a.walk = 1; a.setMood('happy', 0); }
    if (this.walking) a.x += Math.max(220, app.W * 0.45) * dt;
    if (T > 4.05 && !f.leave) { f.leave = true; app.go('meadow', { arrive: this.id, gone: this.gone }); }
    if (a) { this.placeActor(); a.update(dt); }
  }

  pageAnchor() {
    const p = this.L.page, sc = p.w / PW, pl = this.place;
    return [p.x + (pl.x + this.anchor[0] * pl.s) * sc, p.y + (pl.y + this.anchor[1] * pl.s) * sc];
  }

  draw(g) {
    const app = this.app, T = this.T, p = this.L.page, a = this.actor;
    this.drawBg(g);
    const prep = this.prep;
    // the page
    g.save(); g.beginPath(); g.rect(p.x, p.y, p.w, p.h); g.clip();
    if (T < 1.5) {
      g.drawImage(prep.painting.canvas, p.x, p.y, p.w, p.h);
      const q = easeInOut(T / 1.1), d = p.h * 0.45, lx = p.x - d + q * (p.w + 2 * d);
      g.save(); g.beginPath(); g.moveTo(p.x - d - 20, p.y); g.lineTo(lx + d, p.y); g.lineTo(lx, p.y + p.h); g.lineTo(p.x - d - 20, p.y + p.h); g.closePath(); g.clip();
      g.drawImage(prep.filled, p.x, p.y, p.w, p.h); g.restore();
      if (T < 1.2) {
        // the golden band
        const nx = p.h, ny = d, nl = Math.hypot(nx, ny), ux = nx / nl, uy = ny / nl, bw = p.h * 0.28;
        const cx = lx + d / 2, cy = p.y + p.h / 2;
        const gr = g.createLinearGradient(cx - ux * bw, cy - uy * bw, cx + ux * bw, cy + uy * bw);
        gr.addColorStop(0, 'rgba(255,214,90,0)'); gr.addColorStop(0.42, 'rgba(255,214,90,0.32)'); gr.addColorStop(0.5, 'rgba(255,200,70,0.5)'); gr.addColorStop(0.58, 'rgba(255,214,90,0.32)'); gr.addColorStop(1, 'rgba(255,214,90,0)');
        g.fillStyle = gr; g.fillRect(p.x, p.y, p.w, p.h);
        g.lineCap = 'round';
        for (const [o, w, al] of [[-p.h * 0.1, p.h * 0.03, 0.35], [0, p.h * 0.016, 0.6], [p.h * 0.08, p.h * 0.009, 0.5]]) { g.strokeStyle = `rgba(255,190,60,${al})`; g.lineWidth = w; g.beginPath(); g.moveTo(lx + o, p.y + p.h + 10); g.lineTo(lx + d + o, p.y - 10); g.stroke(); }
      }
    } else {
      g.drawImage(this.after, p.x, p.y, p.w, p.h);
      g.globalAlpha = 0.7; g.drawImage(this.overlay, p.x, p.y, p.w, p.h); g.globalAlpha = 1;
    }
    if (T < 1.5) { g.globalAlpha = clamp(1 - (T - 0.9) / 0.5, 0, 1); g.drawImage(this.overlay, p.x, p.y, p.w, p.h); g.globalAlpha = 1; }
    g.restore();
    drawTape(g, p);
    if (!a) return;
    // light behind the friend as it lands
    const rays = clamp((T - 2.3) / 0.4, 0, 1) * (1 - clamp((T - 3.6) / 0.5, 0, 1));
    if (rays > 0) {
      const [cx, cy] = a.local(0, -110), R = Math.max(app.W, app.H) * 0.55;
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = rays * 0.65; g.translate(cx, cy); g.rotate(T * 0.25); g.drawImage(raysSprite(), -R, -R, R * 2, R * 2); g.restore();
    }
    // the stretchy ribbon of wet paint
    if (T > 1.5 && T < 2.4) this.drawRibbon(g, clamp((T - 1.5) / 0.85, 0, 1));
    if (T > 1.1) {
      a.alpha = clamp((T - 1.1) / 0.35, 0, 1);
      if (T > 1.5 && T < 2.6) { const sh = a.local(0, 0); g.save(); g.globalAlpha = 0.25 * a.alpha; g.fillStyle = '#3a2050'; g.beginPath(); g.ellipse(sh[0], Math.min(app.H - 6, a.y + a.lift + 10), 70 * a.s, 12 * a.s, 0, 0, TAU); g.fill(); g.restore(); }
      drawRig(g, a.rig, a.makePose());
    }
    app.fx.draw(g, 0);
  }

  drawRibbon(g, q) {
    const a = this.actor, [px, py] = this.pageAnchor();
    const [fx, fy] = a.local(this.anchor[0] + 10, this.anchor[1]);
    const dist = Math.hypot(px - fx, py - fy);
    if (dist < 30 * a.s) return;
    const sag = Math.min(90 * a.s, dist * 0.35) * (1 - q * 0.6);
    const c1 = [lerp(fx, px, 0.33), lerp(fy, py, 0.33) + sag], c2 = [lerp(fx, px, 0.66), lerp(fy, py, 0.66) + sag * 0.8];
    const N = 20, Lp = [], Rp = [];
    const w0 = 34 * a.s * (1 - q * 0.7), w1 = 22 * this.s0 * (1 - q * 0.8);
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const x = u * u * u * fx + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * px, y = u * u * u * fy + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * py;
      const dx = -3 * u * u * fx + 3 * (u * u - 2 * u * t) * c1[0] + 3 * (2 * u * t - t * t) * c2[0] + 3 * t * t * px, dy = -3 * u * u * fy + 3 * (u * u - 2 * u * t) * c1[1] + 3 * (2 * u * t - t * t) * c2[1] + 3 * t * t * py;
      const l = Math.hypot(dx, dy) || 1, w = lerp(w0, w1, t) * (1 - Math.sin(t * Math.PI) * (0.55 + 0.35 * q)); // pinched in the middle, like stretched toffee
      Lp.push([x - (dy / l) * w, y + (dx / l) * w]); Rp.unshift([x + (dy / l) * w, y - (dx / l) * w]);
    }
    const rp = spath(Lp.concat(Rp));
    g.save(); g.globalAlpha = 1 - clamp((q - 0.7) / 0.3, 0, 1);
    g.fillStyle = this.tint; g.fill(rp);
    g.save(); g.strokeStyle = rgba(INK, 0.55); g.lineWidth = Math.max(1.5, 3 * a.s); g.lineJoin = 'round'; g.stroke(rp); g.restore();
    g.clip(rp); g.lineCap = 'round';
    for (let k = -5; k <= 5; k++) {
      const pts = Lp.map((qq, i) => { const r2 = Rp[Rp.length - 1 - i], t = (k + 6) / 12; return [lerp(qq[0], r2[0], t), lerp(qq[1], r2[1], t)]; });
      g.strokeStyle = k % 2 ? shade(this.tint, 0.3) : shade(this.tint, -0.2); g.globalAlpha *= 1; g.lineWidth = 2 + Math.abs(k % 3);
      g.stroke(spath(pts, false));
    }
    g.restore();
  }

  pointer() { /* nothing can interrupt the magic */ }
  debugState() { return { friend: this.prep ? this.prep.kind : null, busy: true }; }
}
