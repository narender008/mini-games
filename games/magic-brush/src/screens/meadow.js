// 5. Meadow: where painted friends live, up to six at a time (older ones go
// back to the book). They wander, hop, nap under the tree, splash in the pond
// (the whale lives there; the turtle and penguin pop in for a swim), chase
// bubbles and the ball, and answer a tap with a giggle or their own trick.
// Toys sit on a tray at the bottom: bubbles, a ball (drag and flick it), a
// snack (an apple to drag to a friend) and a petting hand (stroke a friend
// for hearts; stroking works without it too). Home is top left, "paint a new
// friend" top right and the sticker book top centre, well apart.
import { Screen } from './base.js';
import { Actor } from '../actor.js';
import { FRIENDS } from '../friends.js';
import { buildRig, buildDoodleRig, makeDoodleDef, drawRig, defaultTexture } from '../rig.js';
import { meadow, tree, pond, lily, reeds, scatter, mushroom, bfly, cloudSprite, ICONS, bush } from '../art.js';
import { buttonSprite } from '../ui.js';
import { bubbleSprite } from '../fx.js';
import { INK, KID, rgba, clamp, lerp, rrect, wash, inkLine, softShadow, ell, TAU } from '../lib.js';
import { sfx } from '../audio.js';
import { hitActor } from './title.js';

function meadowLayout(W, H, br) {
  const por = H > W * 1.05;
  const k = por ? Math.min(W / 900, H / 1500) : Math.min(W / 1600, H / 900);
  const m = br * 0.35;
  const L = { por, k, m, br };
  L.horizon = por ? H * 0.47 : H * 0.6;
  const tr = Math.max(28, br * (por ? 0.95 : 1.05)), gap = tr * 0.5;
  L.toyR = tr;
  L.tray = { w: 4 * tr * 2 + 5 * gap, h: tr * 2 + m * 1.6 };
  L.tray.x = W / 2 - L.tray.w / 2; L.tray.y = H - L.tray.h - m * 0.3;
  L.toys = [0, 1, 2, 3].map((i) => [L.tray.x + gap + tr + i * (tr * 2 + gap), L.tray.y + L.tray.h / 2]);
  L.band = { y0: L.horizon + (por ? 30 : 40) * k, y1: H - m - 10 * k };
  L.tree = por ? { x: W * 0.2, y: L.horizon + 30 * k, s: 1.1 * k } : { x: W * 0.155, y: L.horizon + 10 * k, s: 1.45 * k };
  L.pond = por ? { x: W * 0.62, y: L.horizon + (H - L.horizon) * 0.42, rx: W * 0.3, ry: H * 0.055 } : { x: W * 0.74, y: H * 0.77, rx: 250 * k, ry: 66 * k };
  L.nap = [L.tree.x + 70 * L.tree.s, L.tree.y + 30 * k];
  L.baseS = por ? Math.min(W / 900 * 0.9, H / 1500 * 1.1) : k * 0.9;
  return L;
}

const TOYS = ['bubbles', 'ball', 'snack', 'pet'];
const TOY_COL = { bubbles: '#8fd3ff', ball: '#ffd23f', snack: '#5cc28a', pet: '#ff86b8' };
const TOY_LABEL = { bubbles: 'Blow bubbles', ball: 'Throw the ball', snack: 'Give a snack', pet: 'Petting hand' };
const BUGS = [['#ff86b8', '#ffd23f'], ['#8fd3ff', '#9b6ff0'], ['#ffd23f', '#ff9a3d']];

export class MeadowScreen extends Screen {
  constructor(app) { super(app, 'meadow'); this.ents = []; this.mem = new Map(); }
  orient() { const { W, H } = this.app; return H > W * 1.05 ? 'p' : 'l'; }
  bgKey() { return 'meadow-' + this.orient(); }

  paintBg(g, W, H) {
    const L = meadowLayout(W, H, this.app.btnR), k = L.k;
    const sunX = L.por ? W * 0.8 : W * 0.74, sunY = L.por ? H * 0.17 : 102 * k + L.m;
    meadow(g, W, H, L.por ? W / 900 : k, { sunX, sunY, sunR: 48 * (L.por ? W / 900 : k), clouds: [], ground: L.horizon, far: L.horizon - 90 * k, skyTo: L.horizon + 40 * k });
    const P = L.pond;
    pond(g, P.x, P.y, P.rx, P.ry, Math.max(0.5, P.ry / 66));
    const ks = P.ry / 66;
    lily(g, P.x - P.rx * 0.6, P.y + P.ry * 0.15, 1.1 * ks, '#ff86b8'); lily(g, P.x + P.rx * 0.64, P.y - P.ry * 0.2, 0.9 * ks); lily(g, P.x + P.rx * 0.48, P.y + P.ry * 0.5, 1 * ks, '#fffaf0');
    reeds(g, P.x + P.rx * 0.96, P.y + P.ry * 0.15, 1 * ks); reeds(g, P.x - P.rx * 0.96, P.y - P.ry * 0.2, 0.8 * ks);
    scatter(g, W, L.horizon + 10 * k, H, Math.round((W * (H - L.horizon)) / 9000), 31, [[P.x, P.y, P.rx + 40 * k, P.ry + 30 * k], [W / 2, H, L.tray.w * 0.6, L.tray.h * 1.2]], L.por ? W / 900 : k);
    tree(g, L.tree.x, L.tree.y, L.tree.s, { seed: 5 });
    mushroom(g, L.tree.x + 170 * L.tree.s, L.tree.y + 50 * k, 1 * L.tree.s / 1.45 * (L.por ? 1.3 : 1)); mushroom(g, L.tree.x + 190 * L.tree.s, L.tree.y + 62 * k, 0.7 * L.tree.s / 1.45 * (L.por ? 1.3 : 1));
    if (!L.por) bush(g, W * 0.96, L.horizon + 30 * k, 0.8 * k, '#5cb86a', 6, '#ff86b8');
    const t = L.tray, tp = rrect(t.x, t.y, t.w, t.h + 80, Math.min(70, t.h * 0.45));
    wash(g, tp, '#fff3dc', 2, { fill: '#fff6e6', top: '#ffffff', edge: 0.25, k: t.h / 160, wob: 3 });
    inkLine(g, tp, 3.5, 2, { col: rgba(INK, 0.6) });
  }

  enter(opts = {}) {
    const app = this.app, store = app.store;
    this.busy = false; this.petMode = false; this.hand = null;
    this.bubbles = []; this.ball = null; this.apple = null; this.drags = new Map(); this.napper = null;
    this.home = this.button({ id: 'home', label: 'Home', icon: 'home', col: '#4b8ef0', seed: 4, once: true, onTap: () => this.leave('title') });
    this.brush = this.button({ id: 'paint', label: 'Paint a new friend', icon: 'brush', col: '#ff86b8', seed: 7, paint: KID.yellow, iconScale: 0.6, once: true, onTap: () => this.leave('pick') });
    this.bookB = this.button({ id: 'book', label: 'Sticker book', icon: 'book', col: '#ffd23f', seed: 11, iconScale: 0.6, once: true, onTap: () => this.leave('book') });
    this.toyB = TOYS.map((name, i) => this.button({ id: 'toy-' + name, label: TOY_LABEL[name], icon: name, col: TOY_COL[name], seed: 20 + i, iconScale: 0.62, cooldown: 0.25, onTap: () => this.useToy(name) }));
    this.toyB[3].el.setAttribute('aria-pressed', 'false');
    // friends
    const ids = store.roster();
    this.ents = [];
    this.L = meadowLayout(app.W, app.H, app.btnR);
    for (const id of ids) this.addEnt(id, opts.arrive === id ? 'arrive' : null);
    for (const id of opts.gone || []) { const meta = store.getMeta(id); if (meta) this.addEnt(id, 'leave'); }
    // sky life
    this.clouds = [0, 1, 2].map((i) => ({ u: [0.2, 0.55, 0.88][i], v: [0.3, 0.12, 0.55][i], s: [0.9, 0.6, 0.55][i], speed: 0.006 + i * 0.002, sp: null }));
    this.bugs = BUGS.map((c, i) => ({ x: 0, y: 0, u: 0.2 + i * 0.3, v: 0.3 + i * 0.15, c, ph: i * 2, tu: 0.5, tv: 0.3 }));
  }
  leave(to) {
    if (this.busy) return;
    this.busy = true; sfx.tap();
    this.app.go(to);
  }

  addEnt(id, mode) {
    const app = this.app, meta = app.store.getMeta(id);
    if (!meta) return;
    const e = { id, meta, kind: meta.kind, actor: null, state: 'idle', timer: 0.5 + app.rand() * 2, u: 0, v: 0, tu: 0, tv: 0, inPond: false, taps: 0, awake: 0, mode };
    const remembered = this.mem.get(id);
    if (mode === 'arrive') { e.state = 'arrive'; [e.tu, e.tv] = this.L ? this.spawnSpot() : [0.3, 0.5]; e.tu = Math.min(e.tu, 0.42); e.u = -0.12; e.v = e.tv; }
    else if (remembered) { e.u = clamp(remembered[0], 0.1, 0.9); e.v = clamp(remembered[1], 0, 1); }
    else if (this.L) { [e.u, e.v] = this.spawnSpot(); }
    else { e.u = 0.1 + app.rand() * 0.8; e.v = 0.2 + app.rand() * 0.7; }
    if (mode === 'leave') { e.state = 'leave'; e.timer = 0; }
    this.ents.push(e);
    app.store.loadTexture(id).then((tex) => {
      if (!this.ents.includes(e)) return;
      const t = tex || defaultTexture(e.kind === 'blank' ? 'bunny' : e.kind, null, 5);
      e.tex = t;
      e.def = e.kind === 'blank' ? makeDoodleDef(t, meta.eyes || { ex: 0, ey: -150, ew: 80, mouthY: -120, color: meta.col }) : FRIENDS[e.kind];
      e.actor = new Actor(e.kind === 'blank' ? 'doodle' : e.kind, e.def, null);
      e.actor.fx = app.fx;
      this.buildRig(e);
      if (e.kind === 'whale' && mode !== 'arrive' && mode !== 'leave') { const p = this.L.pond; this.toScreenSet(e, p.x, p.y); e.inPond = true; }
      if (mode === 'arrive') { e.actor.giggle(); }
      this.place(e);
    });
  }
  buildRig(e) {
    if (!e.tex || !this.L) return;
    const kpx = this.L.baseS * 1.25 * this.app.dpr;
    if (e.actor.rig && Math.abs(e.rigK - kpx) / kpx < 0.2) return;
    e.rigK = kpx;
    e.actor.rig = e.kind === 'blank' ? buildDoodleRig(e.tex, e.def, kpx, { dpr: this.app.dpr }) : buildRig(e.kind, e.tex, kpx, { dpr: this.app.dpr });
  }

  layout(W, H) {
    const app = this.app, L = (this.L = meadowLayout(W, H, app.btnR)), br = app.btnR, m = L.m;
    this.home.place(m + br, m + br, br);
    this.brush.place(W - m - br, m + br, br);
    this.bookB.place(W / 2, m + br, br);
    this.toyB.forEach((b, i) => b.place(L.toys[i][0], L.toys[i][1], L.toyR));
    for (const e of this.ents) { if (e.actor) { this.buildRig(e); this.place(e); } }
    for (const c of this.clouds) c.sp = null;
  }
  // world (u, v) <-> screen
  toX(u) { return u * this.app.W; }
  toY(v) { const b = this.L.band; return lerp(b.y0, b.y1, v); }
  toScreenSet(e, x, y) { const b = this.L.band; e.u = x / this.app.W; e.v = clamp((y - b.y0) / (b.y1 - b.y0), -0.3, 1.05); }
  scaleAt(v) { return this.L.baseS * lerp(0.72, 1.06, clamp(v, 0, 1)); }
  place(e) {
    const a = e.actor; if (!a) return;
    a.x = this.toX(e.u); a.y = this.toY(e.v); a.s = this.scaleAt(e.v);
  }
  inPond(x, y, pad = 0) { const p = this.L.pond; return ((x - p.x) / (p.rx + pad)) ** 2 + ((y - p.y) / (p.ry + pad * 0.5)) ** 2 < 1; }
  inTray(x, y, pad = 0) { const t = this.L.tray; return x > t.x - pad && x < t.x + t.w + pad && y > t.y - pad * 2; }
  crossesPond(x0, y0, x1, y1) { for (let i = 1; i < 8; i++) { const t = i / 8; if (this.inPond(lerp(x0, x1, t), lerp(y0, y1, t), 30)) return true; } return false; }
  randomSpot(e) {
    const app = this.app;
    for (let i = 0; i < 12; i++) {
      const u = 0.12 + app.rand() * 0.76, v = app.rand();
      const x = this.toX(u), y = this.toY(v);
      if (this.inPond(x, y, 40) || this.inTray(x, y, 30)) continue;
      if (e && e.actor && this.crossesPond(e.actor.x, e.actor.y, x, y)) continue;
      return [u, v];
    }
    return [0.2 + app.rand() * 0.2, 0.5];
  }
  // a free spot for a friend already in the meadow: off the pond and the toy
  // tray, as far as possible from the others
  spawnSpot() {
    const app = this.app;
    let best = null, bd = -1;
    for (let i = 0; i < 16; i++) {
      const u = 0.12 + app.rand() * 0.76, v = 0.15 + app.rand() * 0.8, x = this.toX(u), y = this.toY(v);
      if (this.inPond(x, y, 50) || this.inTray(x, y, 40)) continue;
      let d = 9;
      for (const o of this.ents) d = Math.min(d, Math.hypot(o.u - u, (o.v - v) * 0.5));
      if (d > bd) { bd = d; best = [u, v]; }
    }
    return best || [0.2 + app.rand() * 0.2, 0.5];
  }
  pondSpot() { const p = this.L.pond, a = this.app.rand() * TAU, r = Math.sqrt(this.app.rand()) * 0.6; return [p.x + Math.cos(a) * p.rx * r, p.y + Math.sin(a) * p.ry * r * 0.7]; }

  // ------------------------------------------------------------ toys
  useToy(name, x, y) {
    const app = this.app, L = this.L;
    if (this.busy) return false;
    const btn = this.toyB[TOYS.indexOf(name)];
    if (name !== 'pet' && this.petMode) this.setPet(false);
    if (name === 'bubbles') {
      sfx.bubble();
      const ox = x ?? btn.x, oy = y ?? btn.y - btn.r;
      for (let i = 0; i < 8; i++) this.bubbles.push({ x: ox + (app.rand() - 0.5) * 30, y: oy - i * 6, vx: (app.rand() - 0.5) * 140, vy: -(50 + app.rand() * 60), r: (16 + app.rand() * 18) * Math.max(0.6, L.baseS), t: -i * 0.12, life: 7 + app.rand() * 3, ph: app.rand() * 6 });
      if (this.bubbles.length > 40) this.bubbles.splice(0, this.bubbles.length - 40);
      for (const e of this.ents) if (e.actor && !e.actor.sleep && e.state !== 'leave' && e.kind !== 'whale' && app.rand() < 0.7) this.setState(e, 'chase', 4 + app.rand() * 2);
      return true;
    }
    if (name === 'ball') {
      const r = 26 * Math.max(0.7, L.baseS * 1.1);
      if (!this.ball) this.ball = { x: x ?? btn.x, y: y ?? btn.y - btn.r * 1.6, z: x != null ? 0 : 60, vx: x != null ? 0 : (app.rand() - 0.5) * 300, vy: x != null ? 0 : -260, vz: x != null ? 120 : 420, spin: 0, r, held: null };
      else { const b = this.ball; b.vz = 520; b.vx += (app.rand() - 0.5) * 200; if (x != null) { b.x = x; b.y = clamp(y, L.band.y0, L.band.y1); } }
      sfx.boing();
      for (const e of this.ents) if (e.actor && !e.actor.sleep && e.state !== 'leave' && !e.inPond && e.kind !== 'whale' && app.rand() < 0.6) this.setState(e, 'ball', 5);
      return true;
    }
    if (name === 'snack') {
      sfx.pop(1.2);
      const r = 30 * Math.max(0.7, L.baseS * 1.1);
      if (x != null) { this.apple = { x, y: clamp(y, L.band.y0, L.band.y1), z: 30, vz: 0, r, held: null, idle: 0, landed: false }; this.callToApple(); }
      else this.apple = { x: btn.x, y: btn.y - btn.r * 2.2, z: 0, vz: 260, r, held: null, idle: 0, landed: false, tray: true };
      return true;
    }
    if (name === 'pet') {
      if (x != null) return this.petAt(x, y, true);
      this.setPet(!this.petMode);
      return true;
    }
    return false;
  }
  setPet(on) { this.petMode = on; const b = this.toyB[3]; b.active = on; b.el.setAttribute('aria-pressed', String(on)); if (on) sfx.heart(); if (!on) this.hand = null; }
  petAt(x, y, burst) {
    const e = this.entAt(x, y);
    if (!e) return false;
    const a = e.actor;
    if (a.sleep && !burst) { a.pet = 0.4; return true; }
    a.wake(); a.pet = 0.6; a.setMood('love', 0.8);
    e.petAcc = (e.petAcc || 0) + (burst ? 1 : 0.2);
    if (e.petAcc >= 1 || burst) { e.petAcc = 0; const [hx, hy] = a.local(0, -200); this.app.fx.hearts(hx, hy, burst ? 3 : 1, 26 * Math.max(0.6, a.s)); sfx.heart(); }
    if (e.state !== 'petted') this.setState(e, 'petted', 1.2); else e.timer = Math.max(e.timer, 0.8);
    return true;
  }
  callToApple() {
    const ap = this.apple; if (!ap) return;
    let best = null, bd = 1e9;
    for (const e of this.ents) { if (!e.actor || e.state === 'leave' || e.kind === 'whale' || e.state === 'eat') continue; const d = Math.hypot(e.actor.x - ap.x, e.actor.y - ap.y); if (d < bd) { bd = d; best = e; } }
    if (best) { best.actor.wake(); this.setState(best, 'apple', 8); }
  }
  feed(e) {
    const ap = this.apple; if (!ap) return;
    this.apple = null;
    e.actor.wake();
    this.setState(e, 'eat', 1.8);
    e.actor.setMood('munch', 1.6); e.actor.eat = 1.6;
    sfx.munch();
    const [hx, hy] = e.actor.local(0, -190);
    setTimeout(() => {}, 0);
    this.app.fx.hearts(hx, hy, 3, 28 * Math.max(0.6, e.actor.s));
    this.app.fx.confetti(ap.x, ap.y - ap.z - ap.r, 6, 160, ['#f0544f', '#fff3dc'], { size: 14 });
  }

  // ------------------------------------------------------------ friends' minds
  setState(e, s, dur = 2) {
    const a = e.actor, app = this.app;
    e.state = s; e.timer = dur;
    if (!a) return;
    if (s === 'wander') { const [u, v] = this.randomSpot(e); e.tu = u; e.tv = v; }
    if (s === 'nap') { this.napper = e; const [x, y] = this.L.nap; this.toTarget(e, x, y); }
    if (s === 'swim') { const [x, y] = this.pondSpot(); this.toTarget(e, x, y); }
    if (s === 'unswim') { const p = this.L.pond, side = a.x < p.x ? -1 : 1; this.toTarget(e, p.x + side * (p.rx + 50), p.y + (app.rand() - 0.3) * 40); }
    if (s === 'idle') { a.walk = 0; if (app.rand() < 0.12 && !a.sleep) a.doTrick(); }
  }
  toTarget(e, x, y) { const b = this.L.band; e.tu = x / this.app.W; e.tv = (y - b.y0) / (b.y1 - b.y0); }
  think(e) {
    const app = this.app, a = e.actor, r = app.rand();
    if (e.kind === 'whale') { if (!e.inPond) { const [x, y] = this.pondSpot(); this.toTarget(e, x, y); e.state = 'swim'; e.timer = 20; } else { this.setState(e, r < 0.5 ? 'swim' : 'idle', 3 + app.rand() * 3); if (r < 0.15) a.doTrick(); } return; }
    if (e.inPond) { this.setState(e, r < 0.35 ? 'unswim' : 'swim', 3 + app.rand() * 3); return; }
    if (!this.napper && e.awake > 14 && r < 0.15 && e.kind !== 'butterfly') { this.setState(e, 'nap', 12); return; }
    if (FRIENDS[e.kind] && FRIENDS[e.kind].swims && r < 0.25) { this.setState(e, 'swim', 8); return; }
    if (r < 0.6) this.setState(e, 'wander', 6);
    else this.setState(e, 'idle', 1.5 + app.rand() * 2.5);
  }
  walkToward(e, dt, speedK = 1) {
    const a = e.actor, tx = this.toX(e.tu), ty = this.toY(e.tv), dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    const sp = (e.kind === 'bunny' || e.kind === 'butterfly' ? 160 : e.kind === 'turtle' ? 60 : 110) * a.s * speedK;
    if (d < 6) { a.walk = Math.max(0, a.walk - dt * 4); return true; }
    if (a.trick && a.trick.name !== 'spin') { a.walk = 0; return false; }
    const step = Math.min(d, sp * dt);
    const nx = a.x + (dx / d) * step, ny = a.y + (dy / d) * step;
    this.toScreenSet(e, nx, ny);
    if (Math.abs(dx) > 4) a.facing = dx > 0 ? 1 : -1;
    a.walk = Math.min(1, a.walk + dt * 4) * speedK;
    return false;
  }

  update(dt) {
    super.update(dt);
    const app = this.app, L = this.L;
    if (!L) return;
    // friends
    for (const e of this.ents) {
      const a = e.actor;
      if (!a) continue;
      e.timer -= dt; e.awake += dt;
      a.eat = Math.max(0, a.eat - dt);
      switch (e.state) {
        case 'arrive': if (this.walkToward(e, dt, 1.6)) this.setState(e, 'idle', 1); break;
        case 'leave': {
          const side = a.x < app.W / 2 ? -0.2 : 1.2; e.tu = side;
          if (e.timer < -0.2 && !e.waved) { e.waved = true; a.giggle(); }
          if (e.timer < -0.7) this.walkToward(e, dt, 1.4);
          if (a.x < -200 || a.x > app.W + 200) { e.dead = true; }
          break;
        }
        case 'wander': if (this.walkToward(e, dt) || e.timer < 0) this.setState(e, 'idle', 1 + app.rand() * 2); break;
        case 'idle': a.walk = Math.max(0, a.walk - dt * 4); if (e.timer < 0) this.think(e); break;
        case 'nap':
          if (!a.sleep) { if (this.walkToward(e, dt)) { a.sleep = true; a.mood = a.baseMood = 'sleep'; sfx.yawn(a.def.voice); e.timer = 9 + app.rand() * 5; e.moonT = 1; } }
          else { a.walk = 0; e.moonT -= dt; if (e.moonT < 0) { e.moonT = 2.2; const [x, y] = a.local(30, -200); app.fx.moon(x, y, 28 * Math.max(0.6, a.s)); } if (e.timer < 0) { a.wake(); this.napper = null; e.awake = 0; a.jump(20, 0.3); this.setState(e, 'wander', 5); } }
          break;
        case 'swim': if (this.walkToward(e, dt, 0.7) && e.timer < 0) this.think(e); else if (e.timer < -6) this.think(e); break;
        case 'unswim': if (this.walkToward(e, dt, 0.8)) this.setState(e, 'idle', 1); break;
        case 'chase': {
          let best = null, bd = 1e9;
          for (const b of this.bubbles) { if (b.t < 0) continue; const d = Math.abs(b.x - a.x) + Math.abs(b.y - (a.y - 150 * a.s)) * 0.3; if (d < bd) { bd = d; best = b; } }
          if (!best || e.timer < 0) { this.setState(e, 'idle', 1); break; }
          const ty = clamp(best.y + 200 * a.s, L.band.y0, L.band.y1);
          if (!this.inPond(best.x, ty, 30)) this.toTarget(e, best.x, ty);
          this.walkToward(e, dt, 1.3);
          const reach = a.y - 260 * a.s;
          if (Math.abs(best.x - a.x) < 60 * a.s && best.y > reach - 40 && !a.hop) a.jump(70, 0.5);
          if (a.hop && Math.hypot(best.x - a.x, best.y - (a.y - a.lift - 150 * a.s)) < best.r + 70 * a.s) this.popBubble(best, true);
          break;
        }
        case 'ball': {
          const b = this.ball;
          if (!b || e.timer < 0) { this.setState(e, 'idle', 1); break; }
          if (!b.held) this.toTarget(e, b.x - (b.x > a.x ? 50 : -50) * a.s, clamp(b.y, L.band.y0, L.band.y1));
          this.walkToward(e, dt, 1.5);
          if (!b.held && Math.hypot(b.x - a.x, b.y - a.y) < 70 * a.s && b.z < 60 * a.s && !e.kickCd) {
            e.kickCd = 1.2; const dir = b.x >= a.x ? 1 : -1;
            b.vx = dir * (220 + app.rand() * 200); b.vy = (app.rand() - 0.5) * 160; b.vz = 300 + app.rand() * 200;
            sfx.boing(); a.setMood('joy', 0.8); a.jump(24, 0.3); app.fx.burstSparkles(b.x, b.y - b.z, 4, 100, { size: 16 });
          }
          break;
        }
        case 'apple': {
          const ap = this.apple;
          if (!ap || ap.held || e.timer < 0) { this.setState(e, 'idle', 1); break; }
          this.toTarget(e, ap.x - (ap.x > a.x ? 60 : -60) * a.s, clamp(ap.y, L.band.y0, L.band.y1));
          if (this.walkToward(e, dt, 1.3) || Math.hypot(ap.x - a.x, ap.y - a.y) < 80 * a.s) this.feed(e);
          break;
        }
        case 'eat': a.walk = 0; if (e.timer < 0) { a.giggle(); this.setState(e, 'idle', 1.5); } break;
        case 'petted': a.walk = 0; if (e.timer < 0) this.setState(e, 'idle', 1); break;
      }
      if (e.kickCd) e.kickCd = Math.max(0, e.kickCd - dt);
      // pond: who is in the water
      const wasIn = e.inPond;
      e.inPond = e.kind !== 'butterfly' && this.inPond(a.x, a.y, -8);
      if (e.inPond !== wasIn && e.kind !== 'butterfly') { sfx.splash(); app.fx.splash(a.x, a.y - 10 * a.s, 10, 14 * Math.max(0.6, a.s)); }
      if (e.inPond && e.kind !== 'whale' && !(FRIENDS[e.kind] && FRIENDS[e.kind].swims) && e.state !== 'unswim') this.setState(e, 'unswim', 3);
      this.place(e);
      if (e.kind === 'butterfly') a.y = this.toY(e.v) - 30 * a.s;
      a.update(dt);
    }
    this.ents = this.ents.filter((e) => !e.dead);
    // keep friends from standing inside each other
    for (let i = 0; i < this.ents.length; i++) for (let j = i + 1; j < this.ents.length; j++) {
      const A = this.ents[i], B = this.ents[j]; if (!A.actor || !B.actor || A.state === 'leave' || B.state === 'leave') continue;
      const dx = B.actor.x - A.actor.x, dy = B.actor.y - A.actor.y, minX = 150 * (A.actor.s + B.actor.s) * 0.5;
      if (Math.abs(dx) < minX && Math.abs(dy) < 60 * A.actor.s) { const push = (minX - Math.abs(dx)) * 0.5 * Math.min(1, dt * 6) * (dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx)); if (A.state !== 'nap') A.u -= push / app.W; if (B.state !== 'nap') B.u += push / app.W; }
    }
    // and out from behind the toy tray: anyone walking under it is nudged up the meadow
    const T = L.tray;
    for (const e of this.ents) {
      const a = e.actor; if (!a || e.state === 'leave' || e.state === 'arrive') continue;
      if (a.x > T.x - 40 * a.s && a.x < T.x + T.w + 40 * a.s && a.y > T.y - 12) { const ty = T.y - 12, b = L.band; e.v = Math.max((ty - b.y0) / (b.y1 - b.y0), e.v - Math.min(1, dt * 4) * (e.v - (ty - b.y0) / (b.y1 - b.y0))); }
    }
    this.updateToys(dt);
    // sky
    for (const c of this.clouds) { c.u += c.speed * dt; if (c.u > 1.25) c.u = -0.25; }
    for (const b of this.bugs) {
      b.ph += dt;
      if (Math.hypot(b.tu - b.u, b.tv - b.v) < 0.02 || app.rand() < dt * 0.2) { b.tu = 0.05 + app.rand() * 0.9; b.tv = 0.1 + app.rand() * 0.75; }
      b.u += (b.tu - b.u) * dt * 0.35 + Math.sin(b.ph * 2.1) * dt * 0.02; b.v += (b.tv - b.v) * dt * 0.35 + Math.cos(b.ph * 3.3) * dt * 0.03;
    }
    // pond sparkle
    if (app.rand() < dt * 0.6) { const p = L.pond, a = app.rand() * TAU; app.fx.ring(p.x + Math.cos(a) * p.rx * 0.6, p.y + Math.sin(a) * p.ry * 0.5, 14 * L.k, 'rgba(255,255,255,0.7)'); }
  }
  popBubble(b, byFriend) {
    const i = this.bubbles.indexOf(b); if (i < 0) return;
    this.bubbles.splice(i, 1);
    sfx.bubble();
    this.app.fx.ring(b.x, b.y, b.r * 1.6, 'rgba(160,210,255,0.9)');
    this.app.fx.burstSparkles(b.x, b.y, 4, 90, { size: 14 });
  }
  updateToys(dt) {
    const L = this.L, app = this.app;
    for (const b of [...this.bubbles]) {
      b.t += dt;
      if (b.t < 0) continue;
      b.vx += Math.sin(b.t * 2 + b.ph) * 30 * dt; b.vx *= Math.exp(-0.6 * dt);
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.t > b.life || b.y < -60) this.popBubble(b);
    }
    const ball = this.ball;
    if (ball && !ball.held) {
      ball.vz -= 1100 * dt; ball.z += ball.vz * dt;
      if (ball.z <= 0) { ball.z = 0; if (ball.vz < -90) { ball.vz = -ball.vz * 0.58; sfx.boing(); } else ball.vz = 0; }
      const fr = ball.z <= 0 ? 1.4 : 0.15;
      ball.vx *= Math.exp(-fr * dt); ball.vy *= Math.exp(-fr * dt);
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      ball.spin += (ball.vx / Math.max(10, ball.r)) * dt;
      if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx) * 0.6; }
      if (ball.x > app.W - ball.r) { ball.x = app.W - ball.r; ball.vx = -Math.abs(ball.vx) * 0.6; }
      if (ball.y < L.band.y0) { ball.y = L.band.y0; ball.vy = Math.abs(ball.vy) * 0.5; }
      if (ball.y > L.band.y1) { ball.y = L.band.y1; ball.vy = -Math.abs(ball.vy) * 0.5; }
      if (this.inPond(ball.x, ball.y, -10) && ball.z < 5) { ball.vy += (ball.y > L.pond.y ? 1 : -1) * 300 * dt; ball.vx += (ball.x > L.pond.x ? 1 : -1) * 300 * dt; ball.bob = (ball.bob || 0) + dt; }
    }
    const ap = this.apple;
    if (ap && !ap.held) {
      ap.vz -= 1200 * dt; ap.z += ap.vz * dt;
      if (ap.z <= 0) { ap.z = 0; if (ap.vz < -120) { ap.vz = -ap.vz * 0.4; sfx.thud(); } else ap.vz = 0; if (!ap.landed && ap.vz === 0) { ap.landed = true; } }
      if (ap.tray && ap.z === 0 && ap.vz === 0) { ap.idle += dt; if (ap.idle > 3.5) { ap.tray = false; ap.x = clamp(ap.x + (app.rand() - 0.5) * 100, 60, app.W - 60); ap.y = L.band.y0 + (L.band.y1 - L.band.y0) * 0.6; ap.z = 40; ap.vz = 200; this.callToApple(); } }
    }
  }

  // ------------------------------------------------------------ input
  entAt(x, y) {
    let best = null;
    for (const e of this.ents) { if (!e.actor || !e.actor.rig || e.state === 'leave') continue; if (hitActor(e.actor, x, y) && (!best || e.actor.y > best.actor.y)) best = e; }
    return best;
  }
  pointer(type, p) {
    const app = this.app;
    if (this.busy) return;
    if (type === 'down') {
      // bubbles first
      for (const b of this.bubbles) if (b.t >= 0 && Math.hypot(b.x - p.x, b.y - p.y) < b.r * 1.3) { this.popBubble(b); return; }
      const ball = this.ball;
      if (ball && Math.hypot(ball.x - p.x, ball.y - ball.z - ball.r - p.y) < ball.r * 1.8) { ball.held = { id: p.id, hist: [[p.x, p.y, p.t]] }; sfx.soft(); return; }
      const ap = this.apple;
      if (ap && Math.hypot(ap.x - p.x, ap.y - ap.z - ap.r - p.y) < ap.r * 2) { ap.held = { id: p.id }; ap.tray = false; sfx.soft(); return; }
      const e = this.entAt(p.x, p.y);
      this.drags.set(p.id, { x0: p.x, y0: p.y, x: p.x, y: p.y, e, moved: 0, t0: p.t });
      if (this.petMode) { this.hand = { x: p.x, y: p.y }; if (e) this.petAt(p.x, p.y, true); }
      return;
    }
    if (type === 'move') {
      if (this.petMode && (p.type === 'mouse' || this.drags.has(p.id))) this.hand = { x: p.x, y: p.y };
      const ball = this.ball;
      if (ball && ball.held && ball.held.id === p.id) {
        ball.x = p.x; ball.y = clamp(p.y + 40, this.L.band.y0, this.L.band.y1); ball.z = Math.max(0, ball.y - p.y - ball.r);
        ball.held.hist.push([p.x, p.y, p.t]); if (ball.held.hist.length > 6) ball.held.hist.shift();
        return;
      }
      const ap = this.apple;
      if (ap && ap.held && ap.held.id === p.id) { ap.x = p.x; ap.y = clamp(p.y + 30, this.L.band.y0, this.L.band.y1); ap.z = Math.max(0, ap.y - p.y - ap.r); return; }
      const d = this.drags.get(p.id);
      if (!d) return;
      d.moved += Math.hypot(p.x - d.x, p.y - d.y); d.x = p.x; d.y = p.y;
      // stroking a friend pets it
      if (d.moved > 18) { const e = this.entAt(p.x, p.y); if (e) { this.petAt(p.x, p.y, false); if (!this.petMode) this.hand = { x: p.x, y: p.y, auto: 0.4 }; } }
      return;
    }
    if (type === 'up' || type === 'cancel') {
      const ball = this.ball;
      if (ball && ball.held && ball.held.id === p.id) {
        const h = ball.held.hist, a = h[0], b = h[h.length - 1], dt = Math.max(0.016, b[2] - a[2]);
        const vx = (b[0] - a[0]) / dt, vy = (b[1] - a[1]) / dt;
        ball.held = null; ball.vx = clamp(vx, -1400, 1400); ball.vy = clamp(vy * 0.3, -500, 500); ball.vz = clamp(-vy * 0.8, 0, 1100) + 120;
        sfx.boing();
        for (const e of this.ents) if (e.actor && !e.actor.sleep && e.state !== 'leave' && !e.inPond && e.kind !== 'whale' && app.rand() < 0.5) this.setState(e, 'ball', 5);
        return;
      }
      const ap = this.apple;
      if (ap && ap.held && ap.held.id === p.id) {
        ap.held = null;
        const e = this.entAt(p.x, p.y);
        if (e && e.kind !== 'whale' || (e && e.inPond)) this.feed(e); else { ap.vz = 60; this.callToApple(); }
        return;
      }
      const d = this.drags.get(p.id);
      this.drags.delete(p.id);
      if (!d || type === 'cancel') return;
      if (d.moved < 18 && app.clock() - d.t0 < 0.6) this.tapAt(p.x, p.y, d.e);
      if (!this.petMode) this.hand = null;
    }
    if (type === 'leave' && this.petMode) this.hand = null;
  }
  tapAt(x, y, e0) {
    const app = this.app;
    const e = e0 || this.entAt(x, y);
    if (this.petMode) { if (e) this.petAt(x, y, true); return; }
    if (e) { this.tapEnt(e); return; }
    app.fx.burstSparkles(x, y, 5, 110, { size: 18 });
    sfx.sparkle();
    for (const f of this.ents) if (f.actor && Math.abs(f.actor.x - x) < app.W * 0.3) { const dx = x - f.actor.x; f.actor.lookTo = [clamp((dx / 200) * f.actor.facing, -1, 1), -0.3]; f.actor.lookIn = 1.5; }
  }
  tapEnt(e) {
    const a = e.actor; if (!a) return false;
    if (a.sleep) { a.wake(); this.napper = null; e.awake = 0; sfx.yawn(a.def.voice); a.giggle(); this.setState(e, 'idle', 1.5); return true; }
    e.taps++;
    if (e.taps % 2 === 0) a.doTrick(); else a.giggle();
    if (e.state === 'wander') this.setState(e, 'idle', 1.6);
    return true;
  }
  tapFriend(i) { const e = this.ents[i]; return e ? this.tapEnt(e) : false; }

  // ------------------------------------------------------------ drawing
  draw(g) {
    const app = this.app, L = this.L, t = app.t, { W, H } = app;
    this.drawBg(g);
    // clouds
    const ck = L.por ? W / 900 : L.k;
    for (const c of this.clouds) {
      if (!c.sp) c.sp = cloudSprite(c.s * ck, (c.s * 10) | 0, app.dpr);
      g.drawImage(c.sp.canvas, c.u * W - c.sp.w / 2, c.v * (L.horizon - 90 * L.k) * 0.6 + 20 * ck, c.sp.w, c.sp.h);
    }
    // butterflies
    for (const b of this.bugs) { const x = b.u * W, y = lerp(L.band.y0 * 0.25, L.band.y1, b.v); bfly(g, x, y, 0.8 * ck, b.c[0], b.c[1], Math.sin(b.ph * 2) * 0.3, Math.abs(Math.sin(b.ph * 14))); }
    // pond shimmer
    const P = L.pond;
    g.save(); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const ph = (t * 0.4 + i / 3) % 1; g.globalAlpha = 0.6 * (1 - ph); g.beginPath(); g.ellipse(P.x, P.y, P.rx * (0.3 + ph * 0.6), P.ry * (0.3 + ph * 0.6), 0, 0, TAU); g.stroke(); }
    g.restore();
    // everything standing on the ground, back to front
    const items = [];
    for (const e of this.ents) if (e.actor && e.actor.rig) items.push({ y: e.actor.y + (e.inPond ? -2 : 0), e });
    if (this.ball) items.push({ y: this.ball.y, ball: this.ball });
    if (this.apple) items.push({ y: this.apple.y, apple: this.apple });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.e) this.drawEnt(g, it.e);
      else if (it.ball) this.drawBall(g, it.ball);
      else this.drawApple(g, it.apple);
    }
    // bubbles float above
    const bs = bubbleSprite();
    for (const b of this.bubbles) { if (b.t < 0) continue; const wob = 1 + Math.sin(b.t * 6 + b.ph) * 0.06; g.drawImage(bs.c, b.x - b.r * 1.19 * wob, b.y - b.r * 1.19 / wob, b.r * 2.38 * wob, b.r * 2.38 / wob); }
    app.fx.draw(g, 0);
    this.drawButtons(g);
    if (this.hand) this.drawHand(g, this.hand);
  }
  drawEnt(g, e) {
    const a = e.actor, pose = a.makePose();
    if (e.inPond) {
      const depth = (e.kind === 'whale' ? 46 : e.kind === 'turtle' ? 30 : 40) * a.s;
      const wl = a.y - depth + Math.sin(a.t * 2) * 2;
      g.save(); g.beginPath(); g.rect(0, 0, this.app.W, wl); g.clip();
      pose.y = a.y + (e.kind === 'whale' ? 6 * a.s : 0);
      drawRig(g, a.rig, pose); g.restore();
      g.save(); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = Math.max(2, 3 * a.s);
      for (const k of [0, 1]) { const ph = (a.t * 0.8 + k * 0.5) % 1; g.globalAlpha = 0.9 * (1 - ph); g.beginPath(); g.ellipse(a.x, wl + 2, (90 + ph * 60) * a.s, (10 + ph * 6) * a.s, 0, 0, TAU); g.stroke(); }
      g.restore();
      return;
    }
    if (e.kind !== 'butterfly') softShadow(g, a.x, a.y + 2, 80 * a.s * (1 - Math.min(0.5, a.lift / (300 * a.s))), 13 * a.s, 0.26);
    else softShadow(g, a.x, a.y + 30 * a.s, 40 * a.s, 8 * a.s, 0.15);
    drawRig(g, a.rig, pose);
  }
  drawBall(g, b) {
    const s = b.r * 2.6, sp = buttonSprite('meadowball', s, this.app.dpr, (sg, cx, cy) => ICONS.ball(sg, cx, cy, b.r / 0.78));
    softShadow(g, b.x, b.y + 2, b.r * (1.2 - Math.min(0.6, b.z / 400)), b.r * 0.3, 0.3);
    const inP = this.inPond(b.x, b.y, -10) && b.z < 5;
    g.save(); g.translate(b.x, b.y - b.z - b.r + (inP ? b.r * 0.35 + Math.sin(this.app.t * 3) * 3 : 0)); g.rotate(b.spin);
    g.drawImage(sp.c, -s / 2, -s / 2, s, s); g.restore();
  }
  drawApple(g, ap) {
    const s = ap.r * 2.8, sp = buttonSprite('meadowapple', s, this.app.dpr, (sg, cx, cy) => ICONS.snack(sg, cx, cy, ap.r));
    softShadow(g, ap.x, ap.y + 2, ap.r * 1.1, ap.r * 0.28, 0.3);
    g.save(); g.translate(ap.x, ap.y - ap.z - ap.r); g.rotate(Math.sin(this.app.t * 3) * 0.08);
    g.drawImage(sp.c, -s / 2, -s / 2, s, s); g.restore();
  }
  drawHand(g, h) {
    const r = this.L.toyR * 0.9, s = r * 2.6;
    const sp = buttonSprite('hand', s, this.app.dpr, (sg, cx, cy) => ICONS.pet(sg, cx, cy, r));
    g.save(); g.translate(h.x + r * 0.2, h.y - r * 0.5); g.rotate(Math.sin(this.app.t * 6) * 0.1); g.drawImage(sp.c, -s / 2, -s / 2, s, s); g.restore();
  }

  exit() {
    for (const e of this.ents) if (e.state !== 'leave') this.mem.set(e.id, e.state === 'arrive' ? [e.tu, e.tv] : [e.u, e.v]);
    super.exit();
  }
  debugState() {
    return { meadow: this.ents.filter((e) => e.actor).map((e) => ({ id: e.id, kind: e.kind, x: Math.round(e.actor.x), y: Math.round(e.actor.y), state: e.actor.sleep ? 'nap' : e.actor.trick ? 'trick' : e.state })), toys: { bubbles: this.bubbles.length, ball: !!this.ball, apple: !!this.apple, pet: this.petMode } };
  }
}
