// The camera frames the action like a director: your tank and its target
// while aiming, the shell in flight with the ground it is falling towards,
// a beat on each blast, a close look at every kill. The player can zoom
// (wheel or pinch) and pan (drag with two fingers or the right mouse
// button); that holds until the next shot.
import { WORLD, clamp, damp, REDUCED_MOTION } from './config.js';

export class Camera {
  constructor(renderer) {
    this.r = renderer;
    this.x = WORLD.width / 2;
    this.y = 60;
    this.viewW = WORLD.width;
    this.tx = this.x;
    this.ty = this.y;
    this.tw = this.viewW;
    this.zoom = 1; // player's zoom on top of the framing
    this.panX = 0;
    this.panY = 0;
    this.manual = false;
    this.rate = 3;
    this.t = 0;
    this.hold = null;
  }

  aspect() {
    return this.r.cssW / Math.max(1, this.r.cssH);
  }

  minW() {
    return this.aspect() < 1 ? 46 : 70;
  }

  // Fit a set of points (with their ground) into view.
  frame(pts, terrain, padTop = 24, padSide = 18, padBottom = 10) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
      const g = terrain ? terrain.groundBelow(p.x, p.y + 2) : p.y;
      y0 = Math.min(y0, g, p.y);
    }
    const w = x1 - x0 + padSide * 2;
    const h = y1 - y0 + padTop + padBottom;
    const a = this.aspect();
    this.tw = clamp(Math.max(w, h * a), this.minW(), WORLD.width + 60);
    const vh = this.tw / a;
    this.tx = (x0 + x1) / 2;
    // keep the ground in the lower part of the picture
    this.ty = y0 - padBottom + vh / 2;
    this.ty = Math.min(this.ty, (y1 + y0 - padBottom + padTop) / 2 + vh * 0.1);
  }

  look(x, y, w) {
    this.tx = x;
    this.ty = y;
    this.tw = w;
  }

  release() {
    this.manual = false;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  update(dt, battle, fx) {
    this.t += dt;
    const b = battle;
    if (b) this.direct(b, dt);
    const w = clamp(this.tw * this.zoom, this.minW() * 0.8, WORLD.width + 80);
    const tx = this.tx + this.panX;
    const ty = this.ty + this.panY;
    this.viewW = damp(this.viewW, w, this.rate * 0.8, dt);
    this.x = damp(this.x, tx, this.rate, dt);
    this.y = damp(this.y, ty, this.rate, dt);
    // keep inside the battlefield
    const half = this.viewW / 2;
    const vh = this.viewW / this.aspect();
    if (this.viewW < WORLD.width + 40) this.x = clamp(this.x, half - 20, WORLD.width + 20 - half);
    else this.x = WORLD.width / 2;
    this.y = Math.max(this.y, vh / 2 - 6);
    // shake: trauma squared, smooth noise
    const c = this.r.cam;
    const tr = fx ? fx.trauma : 0;
    const s = tr * tr * (REDUCED_MOTION ? 0.3 : 1);
    const n = (k) => Math.sin(this.t * 31 * k + k * 7) * 0.6 + Math.sin(this.t * 53 * k + k) * 0.4;
    c.x = this.x + n(1.1) * s * this.viewW * 0.03;
    c.y = this.y + n(1.7) * s * this.viewW * 0.022;
    c.roll = n(2.3) * s * 0.025;
    c.viewW = this.viewW;
  }

  // What should be in shot right now.
  direct(b, dt) {
    const T = b.terrain;
    const cur = b.current();
    this.rate = 3;
    if (b.focus) {
      const f = b.focus;
      f.t += dt;
      this.look(f.x, f.y + 4, this.aspect() < 1 ? 44 : 64);
      this.rate = 4;
      if (f.t > 2.2) b.focus = null;
      return;
    }
    if (this.manual) return;
    if (b.phase === 'intro') {
      const k = Math.min(1, b.phaseT / 2.2);
      this.look(WORLD.width * (0.8 - 0.4 * k), 70, WORLD.width * (1 - 0.3 * k));
      this.rate = 1.2;
      return;
    }
    if (b.phase === 'aim' && cur) {
      const foes = b.enemies(cur);
      const pts = [{ x: cur.x, y: cur.y + 6 }];
      if (foes.length) {
        foes.sort((a, c) => Math.abs(a.x - cur.x) - Math.abs(c.x - cur.x));
        pts.push({ x: foes[0].x, y: foes[0].y + 4 });
      }
      this.frame(pts, T, 30, 16, 12);
      // keep tanks a readable size: past this the far tank is off to the side
      const maxW = this.aspect() < 1 ? 110 : 190;
      if (this.tw > maxW) {
        this.tw = maxW;
        const dir = pts.length > 1 ? Math.sign(pts[1].x - pts[0].x) : 1;
        this.tx = cur.x + dir * maxW * 0.28;
        this.ty = T.groundBelow(cur.x, cur.y + 3) - 12 + (maxW / this.aspect()) / 2;
      }
      this.rate = 2.2;
      return;
    }
    if (b.phase === 'flight' && b.projectiles.list.length) {
      const p = b.projectiles.list[0];
      const owner = p.owner;
      const foes = owner ? b.enemies(owner) : [];
      const pts = [{ x: p.x, y: p.y }];
      // look ahead to where it is heading
      pts.push({ x: p.x + p.vx * 0.8, y: Math.max(T.groundBelow(p.x + p.vx * 0.8, p.y), p.y + p.vy * 0.5) });
      if (foes.length && p.vy < 0) {
        foes.sort((a, c) => Math.abs(a.x - p.x) - Math.abs(c.x - p.x));
        if (Math.abs(foes[0].x - p.x) < 90) pts.push({ x: foes[0].x, y: foes[0].y + 3 });
      }
      this.frame(pts, T, 14, 22, 8);
      this.rate = 4;
      return;
    }
    if ((b.phase === 'settle' || b.phase === 'flight') && b.lastBlast) {
      const L = b.lastBlast;
      this.look(L.x, L.y + 12, Math.max(this.minW() * 1.25, 90 + L.power * 20));
      this.rate = 2.5;
      return;
    }
    if (b.phase === 'over') {
      const t = b.result === 'win' ? b.player : b.player;
      this.look(t.x, t.y + 8, this.minW() * 1.1);
      this.rate = 0.8;
    }
  }
}
