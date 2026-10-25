// 1. Title: a storybook cover. The meadow, a rainbow being painted by a big
// brush, the bobbing logo and a few friends in their default paint, who
// blink, wiggle and giggle when touched. One big play button in the middle,
// sound on/off top right, and a small "all games" button bottom left, away
// from every in-game button (Home sits top left on the other screens).
import { Screen } from './base.js';
import { Actor } from '../actor.js';
import { FRIENDS } from '../friends.js';
import { buildRig, defaultTexture, friendBox } from '../rig.js';
import { meadow, tree, bush, scatter, rainbowTrail, brushTool, coverFrame, logoLetters, bigButton, ICONS } from '../art.js';
import { buttonSprite, glowPulse } from '../ui.js';
import { clamp, KID, sparkle } from '../lib.js';
import { isMuted, setMuted, sfx } from '../audio.js';

const CAST = [
  { kind: 'dragon', part: { hornB: KID.orange, hornF: KID.orange, tip: KID.orange, spk1: KID.orange, spk2: KID.orange } },
  { kind: 'bunny' }, { kind: 'unicorn', flip: true }, { kind: 'puppy', flip: true }, { kind: 'butterfly' },
];

export class TitleScreen extends Screen {
  constructor(app) { super(app, 'title'); this.actors = []; this.letters = null; this.nextFun = 3; }

  orient() { const { W, H } = this.app; return H > W * 1.05 ? 'portrait' : 'landscape'; }
  bgKey() { return 'title-' + this.orient(); }

  enter() {
    const app = this.app;
    this.busy = false;
    this.play = this.button({ id: 'play', label: 'Play', icon: 'play', col: '#ff9a3d', seed: 8, iconScale: 0.6, once: true, glow: 1, onTap: () => this.start() });
    this.sound = this.button({ id: 'sound', label: isMuted() ? 'Sound off' : 'Sound on', pressedState: !isMuted(), onTap: () => this.toggleSound(), drawFn: (g, b) => this.drawSound(g, b), cooldown: 0.25 });
    this.games = this.button({ id: 'games', label: 'Back to all games', href: '../../index.html', drawFn: (g, b) => this.drawGames(g, b) });
    if (!this.actors.length) {
      for (const c of CAST) {
        const def = FRIENDS[c.kind];
        const a = new Actor(c.kind, def, null);
        a.facing = c.flip ? -1 : 1; a.cast = c;
        this.actors.push(a);
      }
    }
    for (const a of this.actors) a.fx = app.fx;
  }
  start() {
    if (this.busy) return;
    this.busy = true;
    sfx.magic();
    this.app.go(this.app.store.roster().length ? 'meadow' : 'pick');
  }
  toggleSound() {
    const m = !isMuted(); setMuted(m);
    this.sound.setLabel(m ? 'Sound off' : 'Sound on'); this.sound.el.setAttribute('aria-pressed', String(!m));
    if (!m) { this.app.unlockAudio(); sfx.tap(); }
  }
  drawSound(g, b) {
    const size = b.r * 2.6, m = isMuted();
    const s = buttonSprite('sound' + m, size, this.app.dpr, (sg, cx, cy) => bigButton(sg, cx, cy, b.r, '#4b8ef0', m ? 'soundOff' : 'soundOn', { seed: 5, iconScale: 0.55 }));
    g.drawImage(s.c, -size / 2, -size / 2, size, size);
  }
  drawGames(g, b) {
    const size = b.r * 2.6;
    const s = buttonSprite('games', size, this.app.dpr, (sg, cx, cy) => bigButton(sg, cx, cy, b.r, '#9b6ff0', 'games', { seed: 2, iconScale: 0.5 }));
    g.drawImage(s.c, -size / 2, -size / 2, size, size);
  }

  layout(W, H) {
    const app = this.app, por = this.orient() === 'portrait';
    const k = por ? Math.min(W / 900, H / 1500) : Math.min(W / 1600, H / 900);
    this.k = k;
    const frameT = Math.max(10, 22 * k * (por ? 1.6 : 1));
    this.frameT = frameT;
    const br = app.btnR, m = frameT + br * 0.35;
    const P = titleSpots(W, H, br);
    this.P = P;
    this.play.place(P.play[0], P.play[1], P.play[2]);
    const sr = Math.max(28, br * 0.85);
    this.sound.place(W - m - sr, m + sr, sr);
    this.games.place(m + sr, H - m - sr, sr);
    // friends
    const sk = por ? W / 900 : k;
    this.actors.forEach((a, i) => {
      const c = P.cast[i];
      a.x = c[0] * W; a.y = c[1] * H; a.s = c[2] * sk;
      if (a.kind === 'butterfly') { a.homeX = a.x; a.homeY = a.y; }
      const kpx = a.s * app.dpr * 1.15;
      if (!a.rig || Math.abs(a.rig.kpx - kpx) / kpx > 0.2) {
        const def = FRIENDS[a.kind], pal = def.pal.slice();
        if (a.kind === 'dragon') pal[3] = KID.orange;
        a.rig = buildRig(a.kind, defaultTexture(a.kind, pal, 3 + i), kpx, { dpr: app.dpr });
      }
    });
    // logo letters
    const size = Math.round(P.logoSize);
    if (!this.letters || this.letters.size !== size || this.letters.dpr !== app.dpr) this.letters = { size, dpr: app.dpr, list: logoLetters('Magic Brush', size, app.dpr) };
  }

  paintBg(g, W, H) {
    const por = H > W * 1.05, k = por ? Math.min(W / 900, H / 1500) : Math.min(W / 1600, H / 900), t = Math.max(10, 22 * k * (por ? 1.6 : 1));
    if (por) {
      const kk = W / 900;
      meadow(g, W, H, kk, { sunX: W * 0.8, sunY: H * 0.29, sunR: 38 * kk, clouds: [[W * 0.25, H * 0.3, 0.6 * kk, 1], [W * 0.7, H * 0.06, 0.5 * kk, 2]], far: H * 0.5, ground: H * 0.62, skyTo: H * 0.66 });
      tree(g, W * 0.1, H * 0.66, 0.85 * kk, { seed: 3 });
      bush(g, W * 0.9, H * 0.68, 0.8 * kk, '#5cb86a', 4, '#ffd23f');
      scatter(g, W, H * 0.66, H * 0.99, 70, 12, [[W * 0.5, H * 0.53, W * 0.2, H * 0.08]], kk);
      const pts = [[0.04, 0.47], [0.2, 0.46], [0.38, 0.42], [0.55, 0.38], [0.7, 0.37], [0.82, 0.33]].map(([x, y]) => [x * W, y * H]);
      rainbowTrail(g, pts, 70 * kk, { seed: 4 });
      brushTool(g, pts[5][0] + 4, pts[5][1] - 2, -0.78, 240 * kk, 'rainbow', { w: 34 * kk, shadow: 8 * kk });
    } else {
      meadow(g, W, H, k, { sunX: W * 0.835, sunY: H * 0.15, sunR: 42 * k, clouds: [[W * 0.144, H * 0.167, 0.9 * k, 1], [W * 0.66, H * 0.12, 0.75 * k, 2], [W * 0.4, H * 0.078, 0.55 * k, 4]], ground: H * 0.655, far: H * 0.52, skyTo: H * 0.67, peaks: [[W * 0.1, 110 * k, W * 0.19], [W * 0.9, 90 * k, W * 0.16]] });
      tree(g, W * 0.106, H * 0.678, 1.15 * k, { seed: 3 });
      bush(g, W * 0.9125, H * 0.71, 1.1 * k, '#5cb86a', 4, '#ffd23f');
      scatter(g, W, H * 0.667, H * 0.98, 90, 12, [[W * 0.525, H * 0.75, W * 0.14, H * 0.12]], k);
      const pts = [[300, 548], [470, 560], [640, 500], [860, 440], [1080, 470], [1250, 470], [1352, 418]].map(([x, y]) => [(x / 1600) * W, (y / 900) * H]);
      rainbowTrail(g, pts, 88 * k, { seed: 4 });
      brushTool(g, pts[6][0] + 2 * k, pts[6][1] - 2 * k, -0.78, 270 * k, 'rainbow', { w: 38 * k, shadow: 10 * k });
    }
    coverFrame(g, W, H, t);
  }

  update(dt) {
    super.update(dt);
    const app = this.app;
    for (const a of this.actors) {
      a.update(dt);
      if (a.kind === 'butterfly') { a.x = a.homeX + Math.sin(a.t * 0.7) * 60 * this.k; a.y = a.homeY + Math.sin(a.t * 1.3) * 18 * this.k; a.facing = Math.cos(a.t * 0.7) >= 0 ? 1 : -1; a.walk = 0.5; }
    }
    // now and then a friend does something on its own
    this.nextFun -= dt;
    if (this.nextFun <= 0) {
      this.nextFun = 3 + app.rand() * 3;
      const a = this.actors[(app.rand() * this.actors.length) | 0];
      if (app.rand() < 0.5) a.giggle(); else if (a.kind !== 'butterfly' && a.kind !== 'puppy') a.doTrick(); else a.giggle();
    }
    // sparkles riding the rainbow
    if (app.rand() < dt * 5) {
      const { W, H } = app, por = this.orient() === 'portrait';
      const x = W * (por ? 0.1 + app.rand() * 0.7 : 0.2 + app.rand() * 0.62), y = H * (por ? 0.36 + app.rand() * 0.12 : 0.47 + app.rand() * 0.15);
      app.fx.sparkle(x, y, (10 + app.rand() * 16) * Math.max(0.6, this.k));
    }
  }

  draw(g) {
    const app = this.app, { W, H } = app, t = app.t;
    this.drawBg(g);
    // logo
    const L = this.letters, P = this.P;
    if (L) {
      const lines = P.twoLines ? [L.list.slice(0, 5), L.list.slice(6)] : [L.list];
      lines.forEach((line, li) => {
        const track = -L.size * 0.02, total = line.reduce((s, it) => s + it.w + track, 0);
        let x = P.logo[0] - total / 2;
        const y0 = P.logo[1] + li * L.size * 1.05;
        line.forEach((it, i) => {
          const gi = li * 6 + i;
          if (it.canvas) {
            const bob = Math.sin(t * 2.2 + gi * 0.7) * L.size * 0.035, r = Math.sin(gi * 1.7 + 0.5) * 0.08 + Math.sin(t * 1.6 + gi) * 0.03;
            g.save(); g.translate(x + it.w / 2, y0 + Math.sin(gi * 0.9) * L.size * 0.06 + bob); g.rotate(r);
            g.drawImage(it.canvas, -it.S / 2, -it.S / 2, it.S, it.S); g.restore();
          }
          x += it.w + track;
        });
      });
    }
    app.fx.draw(g, 0);
    const list = [...this.actors].sort((a, b) => a.y - b.y);
    for (const a of list) if (a.rig) drawActor(g, a);
    this.drawButtons(g);
  }

  pointer(type, p) {
    if (type !== 'down') return;
    for (const a of [...this.actors].sort((a, b) => b.y - a.y)) {
      if (hitActor(a, p.x, p.y)) { a.wake(); if (Math.random() < 0.35) a.doTrick(); else a.giggle(); return; }
    }
    this.app.fx.burstSparkles(p.x, p.y, 5, 120, { size: 18 });
    sfx.sparkle();
  }
}

// where the title's pieces go; exported so the pick screen can keep the spot
// under the Play button free of bubbles
export function titleSpots(W, H, br) {
  const por = H > W * 1.05;
  const k = por ? Math.min(W / 900, H / 1500) : Math.min(W / 1600, H / 900);
  return por
    ? { play: [0.5 * W, 0.53 * H, Math.max(br * 1.5, W * 0.15)], logo: [0.5 * W, 0.13 * H], logoSize: Math.min(W * 0.21, H * 0.11), twoLines: true,
      cast: [[0.3, 0.955, 1.05], [0.56, 0.985, 0.62], [0.78, 0.95, 0.85], [0.93, 0.995, 0.66], [0.17, 0.42, 0.5]] }
    : { play: [0.525 * W, 0.75 * H, Math.max(br * 1.55, 100 * k)], logo: [0.475 * W, 0.255 * H], logoSize: Math.min(168 * k, W * 0.105),
      cast: [[0.2375, 0.968, 1.32], [0.3875, 1.005, 0.7], [0.78, 0.955, 1.12], [0.915, 0.978, 0.9], [0.105, 0.367, 0.5]] };
}

import { drawRig } from '../rig.js';
export function drawActor(g, a) { drawRig(g, a.rig, a.makePose()); }
export function hitActor(a, x, y) {
  const b = a.def.doodle ? a.def.box : friendBox(a.kind);
  const f = a.facing;
  const x0 = a.x + (f > 0 ? b.x : -(b.x + b.w)) * a.s, x1 = x0 + b.w * a.s;
  const y0 = a.y - a.lift + b.y * a.s, y1 = a.y - a.lift + (b.y + b.h) * a.s;
  const pad = 10;
  return x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
}
