// 2. Pick: twelve friends as grey line drawings in big soap bubbles, plus a
// blank page for free painting. Friends painted before wear a gold star.
// A tap makes the bubble bounce and sparkle, then the easel opens with that
// friend (the choice is fixed at the tap; the screen then ignores taps).
import { Screen } from './base.js';
import { FRIEND_IDS, friendBox } from '../friends.js';
import { drawLineArt } from '../rig.js';
import { sky, hillPts, cloud, bfly, scatter, bigButton, brushTool, blobCircle } from '../art.js';
import { buttonSprite } from '../ui.js';
import { titleSpots } from './title.js';
import { RAINBOW, INK, KID, rgba, mix, vgrad, spath, inkLine, inkFill, starPts, ell, glow, softShadow, wash, sparkle, star4, rrect, wob } from '../lib.js';
import { sfx } from '../audio.js';

const RING = ['#ff86b8', '#ffd23f', '#5cc28a', '#4b8ef0', '#9b6ff0', '#ff9a3d', '#3cc0c0', '#f0544f', '#4b8ef0', '#ff86b8', '#5cc28a', '#ffd23f', '#9b6ff0'];

function bubbleArt(g, x, y, r, id, i) {
  softShadow(g, x, y + r * 1.12, r * 0.8, r * 0.13, 0.28);
  const P = blobCircle(x, y, r, i + 2, 0.025), path = spath(P);
  g.save(); g.clip(path);
  g.fillStyle = vgrad(g, y - r, y + r, [[0, '#ffffff'], [1, mix(RING[i], '#ffffff', 0.78)]]); g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
  if (id === 'blank') {
    // a blank page with a brush ready on it
    const pw = r * 0.95, ph = r * 1.15, pp = wob(rrect(x - pw / 2, y - ph / 2, pw, ph, r * 0.06), r * 0.012, 4);
    g.save(); g.translate(0, 0); g.rotate(0); g.fillStyle = '#fffcf3'; g.fill(spath(pp)); g.restore();
    inkLine(g, pp, Math.max(2, r * 0.04), 4, { col: rgba(INK, 0.55), second: 0.25 });
    g.save(); g.lineCap = 'round'; g.lineWidth = r * 0.1; RAINBOW.forEach((c, k) => { g.strokeStyle = c; g.beginPath(); g.arc(x, y + r * 0.35, r * (0.55 - k * 0.07), Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }); g.restore();
    brushTool(g, x + r * 0.15, y + r * 0.1, -0.7, r * 1.05, KID.pink, { w: r * 0.17 });
    star4(g, x - r * 0.3, y - r * 0.32, r * 0.13, '#ffd23f'); star4(g, x + r * 0.35, y - r * 0.4, r * 0.09, '#ffd23f');
  } else {
    const b = friendBox(id), s = (r * 1.5) / Math.max(b.w, b.h * 1.05);
    drawLineArt(g, id, x - b.cx * s, y + 4 - b.cy * s, s, { fill: '#f7f4f1', lineCol: '#958d9f', ink: Math.max(2.4, r * 0.045) });
  }
  g.save(); g.lineWidth = Math.max(5, r * 0.12); g.strokeStyle = RING[i]; g.stroke(path); g.restore();
  inkLine(g, P, Math.max(2.4, r * 0.045), i + 3);
  g.save(); g.strokeStyle = rgba('#ffffff', 0.95); g.lineWidth = Math.max(3, r * 0.06); g.lineCap = 'round'; g.beginPath(); g.arc(x, y, r * 0.8, 1.1 * Math.PI, 1.38 * Math.PI); g.stroke(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + Math.cos(1.47 * Math.PI) * r * 0.8, y + Math.sin(1.47 * Math.PI) * r * 0.8, r * 0.04, 0, 7); g.fill(); g.restore();
}
function starSticker(g, x, y, r) {
  inkFill(g, spath(starPts(x, y, r, 0.2)), '#ffd23f', Math.max(2.5, r * 0.17));
  g.fillStyle = 'rgba(255,255,255,0.7)'; ell(g, x - r * 0.25, y - r * 0.25, r * 0.2, r * 0.12, -0.6); g.fill();
}

export class PickScreen extends Screen {
  constructor(app) { super(app, 'pick'); this.items = []; }

  enter() {
    this.busy = false; this.chosen = -1; this.chosenT = 0;
    const painted = this.app.store.paintedKinds();
    this.home = this.button({ id: 'home', label: 'Home', icon: 'home', col: '#4b8ef0', seed: 4, once: true, onTap: () => { if (!this.busy) { this.busy = true; sfx.tap(); this.app.go('title'); } } });
    const ids = [...FRIEND_IDS, 'blank'];
    this.items = ids.map((id, i) => {
      const b = this.button({ id: 'pick-' + id, label: id === 'blank' ? 'Blank page' : 'Paint the ' + id, hitScale: 1, onTap: () => this.choose(i), drawFn: (g, bt, t) => this.drawBubble(g, bt, t) });
      b.kind = id; b.idx = i; b.star = painted.has(id); b.phase = i * 0.7;
      return b;
    });
  }
  choose(i) {
    if (this.busy) return;
    this.busy = true; this.chosen = i; this.chosenT = 0;
    const b = this.items[i];
    b.pop = 1;
    sfx.pot(i); sfx.sparkle();
    this.app.fx.burstSparkles(b.x, b.y - b.r * 0.6, 10, b.r * 2.2, { size: b.r * 0.35 });
    for (let k = 0; k < 3; k++) this.app.fx.add({ type: 'ring', col: RAINBOW[k * 2], x: b.x, y: b.y, size: b.r * 0.9, grow: 1.4 + k * 0.5, life: 0.5 + k * 0.1 });
    this.sent = false;
  }
  layout(W, H) {
    const app = this.app, br = app.btnR, m = br * 0.35;
    this.home.place(m + br, m + br, br);
    // the best grid for 13 bubbles in the space under the home button. Cells
    // under the title's Play button and under the button that brought us here
    // stay empty, so the second tap of a double tap lands on nothing.
    const top = m + br * 2 + m * 0.4, ah = H - top - m * 1.5, aw = W - m * 2;
    const avoid = [titleSpots(W, H, br).play];
    const ld = app.landing;
    if (ld && ld.W === W && ld.H === H) avoid.push([ld.x, ld.y, ld.r]);
    let best = null;
    for (let cols = 2; cols <= 8; cols++) for (let extra = 0; extra <= 1; extra++) {
      const rows = Math.ceil(13 / cols) + extra, cw = aw / cols, rh = ah / rows;
      const r = Math.min(cw * 0.42, rh * 0.4, 130), gy0 = top + (ah - rows * rh) / 2;
      const cells = [];
      for (let row = 0; row < rows; row++) {
        const free = [];
        for (let col = 0; col < cols; col++) {
          const x = W / 2 - (cols * cw) / 2 + (col + 0.5) * cw, y = gy0 + (row + 0.5) * rh - r * 0.05;
          if (!avoid.some(([ax, ay, ar]) => Math.hypot(x - ax, y - ay) < r * 1.05 + ar)) free.push([x, y]);
        }
        cells.push(free);
      }
      const n = cells.reduce((a, c) => a + c.length, 0);
      if (n < 13) continue;
      // a full grid beats one with holes when the bubbles are about as big
      const score = r * (n - 13 > cols ? 0.9 : 1);
      if (!best || score > best.score) best = { score, r, cells, cols, cw };
    }
    const { r, cells, cw } = best;
    const spots = [];
    for (const row of cells) {
      const take = row.slice(0, 13 - spots.length);
      // centre a short last row when nothing in it was skipped
      if (take.length < row.length && spots.length + take.length === 13 && take.length) {
        const span = (take.length - 1) * cw, x0 = W / 2 - span / 2, y = take[0][1];
        const centred = take.map((_, i) => [x0 + i * cw, y]);
        if (!centred.some(([x, y2]) => avoid.some(([ax, ay, ar]) => Math.hypot(x - ax, y2 - ay) < r * 1.05 + ar))) { spots.push(...centred); continue; }
      }
      spots.push(...take);
      if (spots.length >= 13) break;
    }
    this.items.forEach((b, i) => b.place(spots[i][0], spots[i][1], r));
    this.R = r;
  }
  paintBg(g, W, H) {
    const k = Math.min(W / 1600, H / 900), kk = Math.max(k, W / 1200);
    sky(g, W, H, { top: '#bfe3f2', mid: '#e6f2f0', low: '#fbeccc', seed: 5, k: kk });
    const gy = H * 0.88;
    wash(g, hillPts(-60, W + 60, gy, [[W * 0.19, 30 * kk, W * 0.25], [W * 0.81, 40 * kk, W * 0.19]], 4, H), '#9ad48a', 3, { raw: true, top: '#d4f0b0', edge: 0.3, k: kk });
    g.save(); g.globalAlpha = 0.2; g.lineCap = 'butt';
    const R = Math.min(W * 0.48, H * 0.85);
    RAINBOW.forEach((c, i) => { g.strokeStyle = c; g.lineWidth = R * 0.028; g.beginPath(); g.arc(W / 2, H, R - i * R * 0.027, Math.PI * 1.08, Math.PI * 1.92); g.stroke(); });
    g.restore();
    for (const [x, y, s, sd] of [[0.16, 0.12, 0.7, 1], [0.86, 0.1, 0.6, 2], [0.51, 0.06, 0.45, 3]]) cloud(g, x * W, y * H, s * kk, sd);
    bfly(g, W * 0.94, H * 0.27, 0.9 * kk, '#ff86b8', '#ffd23f', 0.3); bfly(g, W * 0.06, H * 0.55, 0.7 * kk, '#8fd3ff', '#9b6ff0', -0.2);
    scatter(g, W, gy + 10 * kk, H, Math.round(W / 30), 3, [], kk);
  }
  update(dt) {
    super.update(dt);
    if (this.chosen >= 0) {
      this.chosenT += dt;
      if (!this.sent && this.chosenT > 0.42) { this.sent = true; this.app.go('paint', { kind: this.items[this.chosen].kind }); }
    }
  }
  drawBubble(g, b, t) {
    const r = b.r, on = b.idx === this.chosen, dim = this.chosen >= 0 && !on;
    const bob = Math.sin(t * 1.6 + b.phase) * r * 0.04;
    const lift = on ? -Math.min(1, this.chosenT * 5) * r * 0.2 : 0;
    g.translate(0, bob + lift);
    if (on) { g.scale(1 + 0.12 * Math.min(1, this.chosenT * 6), 1 + 0.12 * Math.min(1, this.chosenT * 6)); glow(g, 0, 0, r * 2, '#fff2a0', 0.8); }
    if (dim) g.globalAlpha = Math.max(0.55, 1 - this.chosenT * 2);
    const size = r * 2.7;
    const s = buttonSprite('bubble-' + b.kind + '-' + b.idx, size, this.app.dpr, (sg, cx, cy) => bubbleArt(sg, cx, cy, r, b.kind, b.idx));
    g.drawImage(s.c, -size / 2, -size / 2, size, size);
    if (on) {
      g.save(); g.lineWidth = r * 0.16; const cg = g.createConicGradient(t * 3, 0, 0); RAINBOW.concat([RAINBOW[0]]).forEach((c, k) => cg.addColorStop(k / 6, c)); g.strokeStyle = cg; g.beginPath(); g.arc(0, 0, r * 1.02, 0, 7); g.stroke(); g.restore();
    }
    if (b.star) {
      const sr = Math.max(14, r * 0.22);
      const ss = buttonSprite('pickstar', sr * 2.6, this.app.dpr, (sg, cx, cy) => starSticker(sg, cx, cy, sr));
      g.save(); g.translate(r * 0.72, -r * 0.72); g.rotate(Math.sin(t * 2 + b.phase) * 0.12); g.drawImage(ss.c, -sr * 1.3, -sr * 1.3, sr * 2.6, sr * 2.6); g.restore();
    }
  }
  draw(g) {
    this.drawBg(g);
    if (this.app.cover) { for (const b of this.items) b.draw(g, this.app.t); }
    this.drawButtons(g);
    this.app.fx.draw(g, 0);
  }
  pointer(type, p) {
    if (type === 'down') { this.app.fx.burstSparkles(p.x, p.y, 4, 90, { size: 16 }); }
  }
  debugState() { return { friend: null }; }
}
