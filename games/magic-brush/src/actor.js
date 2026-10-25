// A living friend: wraps a rig and turns a handful of animation channels
// into a pose every frame. Channels: breathing, a squash-and-stretch spring
// (kicked by hops, landings, taps), blinking, idle wiggles (ear flicks, tail
// wags, looking around), a gait (four legs, hopping, waddling, flying,
// swimming) driven by walk speed, giggles and one trick per friend:
//   dragon: sparkly rainbow breath   unicorn: rears up, rainbow from the horn
//   puppy: spins chasing its tail   kitten: crouch and pounce
//   bunny: super hop with a flip     fox: dives nose first into the grass
//   elephant: trunk fountain         turtle: hides in its shell and spins
//   whale: big spout                 butterfly: loop-the-loop
//   penguin: belly slide             teddy: waves and sends a big heart
//   doodle buddy: jelly dance
import { TAU, clamp, lerp, smooth, easeOut } from './lib.js';
import { sfx } from './audio.js';
import { PAINT_COLS } from './fx.js';

const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
const RB = ['#f0544f', '#ff9a3d', '#ffd23f', '#5cc28a', '#4b8ef0', '#9b6ff0'];

export const TRICK_DUR = { flame: 1.6, rainbow: 1.6, spin: 1.3, pounce: 1.3, superhop: 1.3, dive: 1.5, spray: 1.7, shell: 1.8, spout: 1.6, loop: 1.5, slide: 1.8, wave: 1.6, jelly: 1.5 };

export class Actor {
  constructor(kind, def, rig = null, o = {}) {
    this.kind = kind; this.def = def; this.rig = rig;
    this.x = 0; this.y = 0; this.s = 1; this.facing = 1;
    this.t = Math.random() * 10; this.seed = Math.random() * 100;
    this.blink = 0; this.blinkIn = 1 + Math.random() * 3;
    this.mood = o.mood || 'happy'; this.baseMood = this.mood; this.moodT = 0;
    this.sq = 0; this.sqv = 0;
    this.hop = null; this.lift = 0; this.extraLift = 0;
    this.walk = 0; this.phase = 0;
    this.trick = null; this.giggleT = 0;
    this.idle = null; this.idleIn = 2 + Math.random() * 3;
    this.look = [0, 0]; this.lookTo = [0, 0]; this.lookIn = 1;
    this.rot = 0; this.alpha = 1; this.spin = 0;
    this.pet = 0; this.sleep = false; this.wade = 0; this.eat = 0;
    this.pose = { g: {} };
    this.fx = null;
  }
  get height() { return 220 * this.s; }
  local(ux, uy) { return [this.x + ux * this.s * this.facing, this.y - this.lift + uy * this.s]; }
  kick(a) { this.sqv += a; }
  setMood(m, dur) { this.mood = m; this.moodT = dur; }
  jump(h, dur = 0.5, o = {}) {
    if (this.hop && !o.force) return;
    this.hop = { t: 0, dur, h, spin: o.spin || 0, dx: o.dx || 0, nose: o.nose || 0 };
    this.kick(-2.2);
  }
  giggle() {
    if (this.trick) return;
    this.setMood('joy', 1);
    this.giggleT = 0.8;
    this.jump(28, 0.42);
    sfx.giggle(this.def.voice);
    if (this.fx) { const [x, y] = this.local(0, -210); this.fx.notes(x, y, 2, 18 * Math.max(0.6, this.s)); }
  }
  doTrick() {
    if (this.trick || this.sleep) return false;
    const name = this.def.trick;
    this.trick = { name, t: 0, dur: TRICK_DUR[name] || 1.5, emit: 0 };
    this.setMood('open', this.trick.dur);
    sfx.trick(this.def.voice);
    return true;
  }
  wake() { if (this.sleep) { this.sleep = false; this.mood = this.baseMood = 'happy'; this.kick(-1.5); } }

  update(dt) {
    this.t += dt;
    // squash spring
    this.sqv += (-170 * this.sq - 11 * this.sqv) * dt;
    this.sq = clamp(this.sq + this.sqv * dt, -0.35, 0.35);
    // blink
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) { this.blink = 1; this.blinkIn = 2 + Math.random() * 3.5; if (Math.random() < 0.18) this.blinkIn = 0.25; }
    this.blink = Math.max(0, this.blink - dt * 7);
    // mood timer
    if (this.moodT > 0) { this.moodT -= dt; if (this.moodT <= 0) this.mood = this.sleep ? 'sleep' : this.baseMood; }
    this.giggleT = Math.max(0, this.giggleT - dt);
    this.pet = Math.max(0, this.pet - dt);
    // looking around
    this.lookIn -= dt;
    if (this.lookIn <= 0) { this.lookIn = 1 + Math.random() * 2.5; this.lookTo = Math.random() < 0.4 ? [0, 0] : [Math.random() * 2 - 1, Math.random() - 0.6]; }
    this.look[0] += (this.lookTo[0] - this.look[0]) * Math.min(1, dt * 8);
    this.look[1] += (this.lookTo[1] - this.look[1]) * Math.min(1, dt * 8);
    // hop
    if (this.hop) {
      const h = this.hop; h.t += dt;
      const p = clamp(h.t / h.dur, 0, 1);
      this.lift = h.h * 4 * p * (1 - p) * this.s;
      if (h.dx) this.x += (h.dx * this.s * this.facing * dt) / h.dur;
      if (p >= 1) { this.hop = null; this.lift = 0; this.kick(2.6); if (h.big) sfx.thud(); }
    }
    // gait phase
    const g = this.def.gait;
    if (this.walk > 0.01) this.phase += dt * this.walk * (g === 'waddle' ? 9 : g === 'quad' ? 9 : g === 'fly' ? 6 : 8);
    if ((g === 'hop' || g === 'bunny') && this.walk > 0.05 && !this.hop && !this.trick) this.jump(g === 'bunny' ? 34 : 16, g === 'bunny' ? 0.36 : 0.26);
    // idle wiggles
    if (!this.idle) { this.idleIn -= dt; if (this.idleIn <= 0 && !this.trick && !this.sleep) { this.idle = { kind: ['ears', 'tail', 'wiggle', 'stretch', 'peek'][(Math.random() * 5) | 0], t: 0 }; this.idleIn = 2.5 + Math.random() * 4; } }
    else { this.idle.t += dt; if (this.idle.t > 1.1) this.idle = null; }
    // tricks
    if (this.trick) this.updateTrick(dt);
  }

  updateTrick(dt) {
    const k = this.trick, fx = this.fx, s = this.s;
    k.t += dt; k.emit -= dt;
    const tt = k.t / k.dur, f = this.facing;
    const emit = (iv) => { if (k.emit <= 0) { k.emit = iv; return true; } return false; };
    switch (k.name) {
      case 'flame':
        if (tt > 0.25 && tt < 0.75 && fx && emit(0.035)) { const [x, y] = this.local(this.def.mouthAt[0] + 10, this.def.mouthAt[1]); fx.puff(x, y, f * (260 + Math.random() * 160) * s, (Math.random() - 0.6) * 80 * s, RB[(Math.random() * 6) | 0], 40 * s); }
        break;
      case 'rainbow':
        if (tt > 0.3 && tt < 0.8 && fx && emit(0.04)) { const [x, y] = this.local(98, -245); fx.sparkle(x, y, 26 * s, { vx: f * (120 + Math.random() * 160) * s, vy: -260 * s, grav: 520 * s, drag: 0.5, col: RB[(Math.random() * 6) | 0] }); }
        break;
      case 'spin':
        if (k.t > 0.1 && k.t < 1.0 && emit(0.14)) { this.facing *= -1; if (fx) { const [x, y] = this.local(0, -200); fx.notes(x, y, 1, 18 * s); } }
        if (k.t < 0.05 && !this.hop) this.jump(20, 0.3);
        break;
      case 'pounce':
        if (k.t > 0.45 && !k.leapt) { k.leapt = true; this.jump(70, 0.55, { dx: 90, force: true }); }
        break;
      case 'superhop':
        if (!k.leapt) { k.leapt = true; this.jump(190, 0.95, { spin: TAU, force: true }); this.hop.big = true; }
        if (tt > 0.3 && tt < 0.8 && fx && emit(0.05)) { const [x, y] = this.local(0, -100); fx.sparkle(x, y, 22 * s); }
        break;
      case 'dive':
        if (!k.leapt) { k.leapt = true; this.jump(110, 0.7, { dx: 70, force: true, nose: 1 }); }
        if (k.t > 0.7 && !k.landed) { k.landed = true; this.kick(3.5); if (fx) { const [x, y] = this.local(110, -10); fx.confetti(x, y, 8, 220 * s, ['#7cc46c', '#c8eb9a', '#ffd23f'], { size: 18 * s }); } sfx.thud(); }
        break;
      case 'spray':
        if (tt > 0.3 && tt < 0.8 && fx && emit(0.03)) { const [x, y] = this.local(150, -235); fx.add({ type: 'drop', col: '#a6e4ff', x, y, vx: f * (40 + Math.random() * 140) * s, vy: -(300 + Math.random() * 200) * s, grav: 900 * s, life: 1, size: 20 * s, align: true }); }
        if (tt > 0.3 && !k.snd) { k.snd = true; sfx.splash(); }
        break;
      case 'shell':
        if (tt > 0.78 && !k.leapt) { k.leapt = true; this.jump(40, 0.35, { force: true }); }
        break;
      case 'spout':
        if (tt > 0.2 && tt < 0.8 && fx && emit(0.03)) { const sp = this.def.spout || [0, -140]; const [x, y] = this.local(sp[0], sp[1]); fx.add({ type: 'drop', col: '#a6e4ff', x, y, vx: (Math.random() - 0.5) * 160 * s, vy: -(420 + Math.random() * 180) * s, grav: 900 * s, life: 1.1, size: 22 * s, align: true }); }
        if (tt > 0.2 && !k.snd) { k.snd = true; sfx.splash(); }
        break;
      case 'loop':
        if (fx && emit(0.05)) { const [x, y] = this.local(0, -100); fx.sparkle(x, y, 22 * s, { col: RB[(Math.random() * 6) | 0] }); }
        break;
      case 'slide':
        if (tt > 0.2 && tt < 0.75) this.x += f * 260 * s * dt;
        if (tt > 0.2 && tt < 0.75 && fx && emit(0.06)) { const [x, y] = this.local(-60, -10); fx.sparkle(x, y, 18 * s, { col: '#bfeaf5' }); }
        break;
      case 'wave':
        if (tt > 0.65 && !k.heart && fx) { k.heart = true; const [x, y] = this.local(40, -200); fx.hearts(x, y, 4, 34 * s); sfx.heart(); }
        break;
      case 'jelly':
        if (fx && emit(0.07)) { const [x, y] = this.local((Math.random() - 0.5) * 160, -60 - Math.random() * 140); fx.sparkle(x, y, 24 * s, { col: PAINT_COLS[(Math.random() * 7) | 0] }); }
        break;
    }
    if (k.t >= k.dur) { this.trick = null; this.mood = this.baseMood; this.moodT = 0; this.kick(1.5); }
  }

  // ------------------------------------------------------------ pose
  makePose() {
    const P = this.pose, G = P.g, d = this.def, t = this.t, gait = d.gait, w = this.walk, ph = this.phase;
    for (const k in G) G[k] = null;
    const set = (name, r = 0, dx = 0, dy = 0, sx = 0, sy = 0) => { const o = G[name] || (G[name] = {}); o.r = r; o.dx = dx; o.dy = dy; o.sx = sx; o.sy = sy; return o; };
    const has = (name) => d.groups && d.groups[name];
    let rot = this.rot, lift = this.lift + this.extraLift, sx = 1, sy = 1, xOff = 0;
    const sleeping = this.sleep;
    // breathing + squash spring
    const br = Math.sin(t * (sleeping ? 1.4 : 2.3)) * (sleeping ? 0.035 : 0.022);
    sy *= 1 + br - this.sq; sx *= 1 - br * 0.5 + this.sq * 0.8;
    if (this.hop) { const p = this.hop.t / this.hop.dur; sy *= 1 + 0.12 * bump(p, 0, 0.6); sx *= 1 - 0.06 * bump(p, 0, 0.6); if (this.hop.spin) rot += this.hop.spin * easeOut(p) * this.facing; if (this.hop.nose) rot += this.facing * 1.2 * smooth((p - 0.35) / 0.5) * (1 - smooth((p - 0.9) / 0.1)); }
    let bodyR = 0, bodyDy = 0, headR = Math.sin(t * 1.3 + this.seed) * 0.04, tailR = Math.sin(t * (this.mood === 'joy' ? 14 : 4)) * (this.mood === 'joy' ? 0.35 : 0.14);
    let earR = Math.sin(t * 2.6 + 1) * 0.06, wingR = Math.sin(t * 2.4) * 0.08, armR = Math.sin(t * 1.8) * 0.08;
    // gait
    const swing = Math.sin(ph) * 0.42 * Math.min(1, w * 1.5);
    if (gait === 'quad') {
      set('legF', swing); set('legB2', swing * 0.9); set('legB', -swing); set('legF2', -swing * 0.9);
      bodyDy = -Math.abs(Math.sin(ph)) * 5 * Math.min(1, w);
      headR += Math.sin(ph * 2) * 0.04 * w;
    } else if (gait === 'waddle') {
      rot += Math.sin(ph) * 0.12 * Math.min(1, w * 1.4);
      set('footL', 0, 0, -Math.max(0, Math.sin(ph)) * 10 * w); set('footR', 0, 0, -Math.max(0, -Math.sin(ph)) * 10 * w);
      armR += Math.sin(ph) * 0.3 * w;
    } else if (gait === 'fly') {
      lift += (40 + Math.sin(t * 3) * 10) * this.s;
      const fl = Math.abs(Math.sin(t * (w > 0.1 ? 16 : 9)));
      set('wingL', 0, 0, 0, 0.35 + 0.65 * fl, 1); set('wingR', 0, 0, 0, 0.35 + 0.65 * fl, 1);
      rot += Math.sin(t * 2) * 0.06;
    } else if (gait === 'swim') {
      bodyDy = Math.sin(t * 2) * 4; rot += Math.sin(t * 1.6) * 0.04;
      tailR = Math.sin(t * 3.5) * 0.22; set('fin', Math.sin(t * 3) * 0.3);
    }
    // idle wiggles
    const id = this.idle;
    if (id) {
      const b = bump(id.t, 0, 1.1);
      if (id.kind === 'ears') earR += Math.sin(id.t * 24) * 0.25 * b;
      else if (id.kind === 'tail') tailR += Math.sin(id.t * 18) * 0.35 * b;
      else if (id.kind === 'wiggle') bodyR += Math.sin(id.t * 16) * 0.06 * b;
      else if (id.kind === 'stretch') { sy *= 1 + 0.07 * b; sx *= 1 - 0.04 * b; }
      else if (id.kind === 'peek') headR += 0.14 * b;
    }
    if (this.giggleT > 0) { headR += Math.sin(this.giggleT * 40) * 0.12 * this.giggleT; tailR += Math.sin(t * 20) * 0.3; earR += Math.sin(t * 22) * 0.2; }
    if (this.pet > 0) { headR += 0.12 * Math.min(1, this.pet * 3); earR -= 0.15; }
    if (sleeping) { headR += 0.12; earR += 0.1; tailR *= 0.3; }
    if (this.eat > 0) headR += 0.1 + Math.sin(t * 14) * 0.05;
    // tricks
    const k = this.trick;
    if (k) {
      const tt = k.t / k.dur;
      switch (k.name) {
        case 'flame': headR += -0.3 * bump(tt, 0, 0.3) + 0.15 * bump(tt, 0.25, 0.8); wingR = Math.sin(t * 22) * 0.4; break;
        case 'rainbow': rot -= 0.38 * bump(tt, 0.05, 0.95) * this.facing; headR -= 0.2 * bump(tt, 0.1, 0.9); set('legF', -0.8 * bump(tt, 0.1, 0.9)); set('legF2', -0.6 * bump(tt, 0.1, 0.9)); tailR += Math.sin(t * 16) * 0.4; break;
        case 'spin': tailR += Math.sin(t * 30) * 0.5; break;
        case 'pounce': if (tt < 0.35) { const c = smooth(tt / 0.3); sy *= 1 - 0.22 * c; sx *= 1 + 0.15 * c; tailR += Math.sin(t * 30) * 0.3 * c; headR += 0.12 * c; } break;
        case 'superhop': earR -= 0.4 * bump(tt, 0.1, 0.8); break;
        case 'dive': tailR += Math.sin(t * 20) * 0.4; break;
        case 'spray': { const up = bump(tt, 0.05, 0.95); set('trunk', -1.55 * up); headR -= 0.15 * up; set('ear', Math.sin(t * 14) * 0.3 * up); break; }
        case 'shell': {
          const hide = smooth(tt / 0.15) * (1 - smooth((tt - 0.75) / 0.1));
          set('head', 0, -60 * hide, 18 * hide, 1 - 0.85 * hide, 1 - 0.85 * hide);
          for (const lg of ['legB', 'legB2', 'legF', 'legF2']) set(lg, 0, 0, -12 * hide, 1 - 0.8 * hide, 1 - 0.8 * hide);
          set('tail', 0, 10 * hide, 0, 1 - hide, 1 - hide);
          const sp = smooth((tt - 0.15) / 0.6) * TAU * 2; sx *= Math.cos(sp) * 0.25 + 0.75; xOff = Math.sin(sp) * 6;
          break;
        }
        case 'spout': bodyDy += -10 * bump(tt, 0.1, 0.9); tailR += Math.sin(t * 12) * 0.3; break;
        case 'loop': { const a = smooth(tt) * TAU; lift += (1 - Math.cos(a)) * 70 * this.s; xOff = Math.sin(a) * 70; rot -= a * this.facing; break; }
        case 'slide': { const lay = smooth(tt / 0.2) * (1 - smooth((tt - 0.78) / 0.18)); rot += this.facing * 1.35 * lay; lift -= 0; set('flipL', -1.2 * lay); set('flipR', -1.2 * lay); break; }
        case 'wave': set('armR', -2.3 * bump(tt, 0, 1) + Math.sin(t * 14) * 0.35 * bump(tt, 0.1, 0.9)); headR -= 0.1 * bump(tt, 0, 1); break;
        case 'jelly': { const a = bump(tt, 0, 1); sx *= 1 + Math.sin(t * 19) * 0.18 * a; sy *= 1 - Math.sin(t * 19) * 0.18 * a; bodyR += Math.sin(t * 9) * 0.12 * a; break; }
      }
    }
    // assemble groups
    set('body', bodyR, 0, bodyDy);
    if (has('head') && !G.head) set('head', headR);
    else if (G.head) G.head.r += headR;
    if (has('tail') && !G.tail) set('tail', tailR);
    for (const e of ['earL', 'earR']) if (has(e)) set(e, e === 'earL' ? earR : -earR);
    if (has('ear') && !G.ear) set('ear', earR * 1.5);
    if (has('wing')) set('wing', wingR);
    if (has('arm')) set('arm', armR);
    if (has('armL')) set('armL', -armR);
    if (has('armR') && !G.armR) set('armR', armR);
    if (has('flipL') && !G.flipL) set('flipL', -Math.abs(Math.sin(t * (this.mood === 'joy' ? 18 : 2))) * (this.mood === 'joy' ? 0.6 : 0.1));
    if (has('flipR') && !G.flipR) set('flipR', -Math.abs(Math.sin(t * (this.mood === 'joy' ? 18 : 2) + 1)) * (this.mood === 'joy' ? 0.6 : 0.1));
    if (has('trunk') && !G.trunk) set('trunk', Math.sin(t * 1.7) * 0.08);
    if (gait !== 'fly' && has('wingL')) { set('wingL', 0, 0, 0, 0.85 + 0.15 * Math.sin(t * 3), 1); set('wingR', 0, 0, 0, 0.85 + 0.15 * Math.sin(t * 3), 1); }
    if (d.doodle) { const jig = Math.sin(t * 5) * 0.03; sx *= 1 + jig; sy *= 1 - jig; bodyR += Math.sin(t * 2.3) * 0.03; G.body.r = bodyR; }
    P.x = this.x + xOff * this.s * this.facing; P.y = this.y; P.s = this.s; P.flip = this.facing < 0;
    P.rot = rot; P.sx = sx; P.sy = sy; P.lift = lift; P.alpha = this.alpha;
    P.mood = this.mood; P.blink = sleeping ? 1 : this.blink; P.look = this.look; P.time = t; P.jiggle = d.doodle ? (this.trick || this.hop ? 0.25 : 0.06) : 0;
    return P;
  }
}
