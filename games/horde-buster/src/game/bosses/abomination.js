// The Abomination, chapter 3's boss: a stitched colossus of fused corpses with faces moaning in its chest, a glowing bile
// gut, a meat hook on a chain for a right arm and a butcher's cleaver for a left. It lumbers down from the top, then
// settles between a home line and a line nearer the band, slower than the Ogre, and picks from four attacks:
//   hook  - winds up, marks a line from its hand to the hero (it follows him, then locks for the last third of a
//           second), and throws the hook down it. The hook skewers and flings the horde in its path. If it catches
//           the hero it bites him and hauls him toward the boss; a raised shield turns it away
//   bile  - rears back with its gut glowing, then vomits a fan of acid globs that arc over and land as pools
//           that burn for six seconds. A ring on the ground marks every landing spot while the glob is in the air
//   slam  - raises the cleaver, marks a lane straight down from where the blade will bite, and brings it down:
//           a shockwave runs down the lane, hurting the hero in it and blasting the horde
//   burst - (below 60% health) the gut swells and tears open, pouring spiders and exploders out
// Below 60% it is quicker and bursts; below 30% it rests less and chains attacks. A hero it hooked gets the cleaver next.
// Nothing here allocates per frame: globs live in typed arrays, anchors are read once, pose() reuses one array.
//
// The lead draws, from this object:
//   pose()                      -> [anim prefix, frame index], draw it like the Ogre (never flipped: the hook is on screen right)
//   hookOut                     true while the hook is off the arm (hook frames 1..3 have no hook head and no chain)
//   hookX, hookY                the hook head, screen units. Draw the `abom_hook` sprite there (its eye ring is at the top)
//                               turned by hookAng + PI / 2, and the chain as links along handX, handY -> hookX, hookY
//   handX, handY                where the chain leaves the arm (the `hook.abom` anchors of the current pose)
//   hookAng                     angle (radians) of the direction from the hook toward the hand
//   gibs                        sprite names for its death, run.js reads it
import { ARENA, BAND, FIELD, clamp, rand, rnd, chance, TAU } from '../../config.js';
import { BEAM, GLOW, UNDER, HOT } from '../../fx/particles.js';

const HOME_Y = 540; // the ground point under it on its home line
const NEAR_Y = 700; // the nearest it lumbers toward the band
const MARGIN = 200; // the sprite is about 620 units wide with the cleaver out to the left: keep it mostly on the field
const EDGE_R = 70; // ...but it may step further right to swing the cleaver (it hangs 132 units left of the body) at a hero out there
const MAX_GLOBS = 16;

const HOOK_SPEED = 1750; // units a second (times FIELD.r: a wide field has further to go)
const HOOK_R = 52; // the hook head and the hero's chest closer than this and he is caught
const HOOK_HALF = 48; // half width of the marked lane: what is drawn is what hits
const SLAM_HALF = 52;
const WAVE_SPEED = 1250;

const DMG_HOOK = 22;
const DMG_WAVE = 28;
const DMG_SLAM = 30;

// HDR colours (the particle shader adds them, so values above 1 bloom)
const LANE = [1.5, 0.12, 0.06];
const LANE_LOCK = [2.4, 0.55, 0.22];
const BILE = [0.5, 2.1, 0.25];
const ACID = [0.12, 0.5, 0.05]; // paint colour of acid droplets (not HDR)

// indices into this.A: anchor offsets from the ground point, pairs of x, y
const A_MOUTH = 0;
const A_HOOK = 2; // frames 1, 2, 3 of abom_hook at 2, 4, 6
const A_CLEAVER = 8;
const A_BELLY = 10;

export class Abomination {
  constructor(run, slot) {
    this.run = run;
    this.i = slot;
    this.name = 'THE ABOMINATION';
    this.state = 'enter';
    this.t = 0; // time left in the state
    this.u = 0; // time spent in the state
    this.anim = 0; // frame clock for the lumbering walk
    this.step = 0;
    this.lastAttack = '';
    this.lastPhase = 1;
    this.goalY = HOME_Y;
    this.bannered = false;
    this.burstCool = 6;
    this.forceBurst = false;
    this.followSlam = false;
    this.cue = false;
    this.wind = 0.8;
    this.lightT = 0;
    this._pose = ['abom_walk', 0];
    this.gibs = ['abom_head', 'abom_arm', 'abom_arm', 'abom_leg', 'abom_leg', 'abom_torso', 'abom_face', 'abom_face', 'abom_hook', 'abom_cleaver'];
    // the hook
    this.hookOut = false;
    this.hookX = 0;
    this.hookY = 0;
    this.hookAng = 0;
    this.handX = 0;
    this.handY = 0;
    this.hdx = 0; // unit direction of the throw
    this.hdy = 1;
    this.hlen = 0; // how far the hook may fly
    this.hdone = 0;
    this.aimX = 0;
    this.aimY = 0;
    this.laneT = 0;
    this.locked = false;
    this.hframe = 1;
    this.trailT = 0;
    // bile
    this.total = 0;
    this.globsLeft = 0;
    this.nextGlob = 0;
    this.spewDur = 1;
    this.spread = 1;
    this.poolR = 62;
    this.aimAng = 0;
    this.aimD = 0;
    this.ox = 0; // where the globs start (ground)
    this.oy = 0;
    this.oz = 170; // and how high the mouth is
    this.gn = 0;
    this.gx0 = new Float32Array(MAX_GLOBS);
    this.gy0 = new Float32Array(MAX_GLOBS);
    this.gx1 = new Float32Array(MAX_GLOBS);
    this.gy1 = new Float32Array(MAX_GLOBS);
    this.gu = new Float32Array(MAX_GLOBS);
    this.gdur = new Float32Array(MAX_GLOBS);
    this.gr = new Float32Array(MAX_GLOBS);
    this.gt = new Float32Array(MAX_GLOBS);
    // slam
    this.slamX = 0;
    this.slamY = 0;
    this.waveOn = false;
    this.waveY = 0;
    this.waveHit = false;
    this.waveBlast = 0;
    this.waveFx = 0;
    // belly burst
    this.spawnN = 0;
    this.spawnK = 0;
    this.spawnT = 0;
    // where the mouth, the hook hand, the blade's edge and the belly are on each pose, from the atlas (offsets from the ground point)
    const mouth = run.anchor('mouth', 'abom', [0, -190]);
    const h1 = run.anchor('hook', 'abom', [56, -58]);
    const h2 = run.anchor('hook', 'abom_2', [37, -32]);
    const h3 = run.anchor('hook', 'abom_3', [110, -175]);
    const cl = run.anchor('cleaver', 'abom', [-132, 113]);
    const belly = run.anchor('belly', 'abom', [39, -118]);
    this.A = new Float32Array([mouth[0], mouth[1], h1[0], h1[1], h2[0], h2[1], h3[0], h3[1], cl[0], cl[1], belly[0], belly[1]]);
  }

  // 1 above 60% health, 2 below, 3 below 30%
  get phase() {
    const E = this.run.enemies;
    const f = E.hp[this.i] / E.maxHp[this.i];
    return f < 0.3 ? 3 : f < 0.6 ? 2 : 1;
  }

  // what to draw: anim prefix and frame index (one shared array, read it at once)
  pose() {
    const P = this._pose;
    let a = 'abom_walk';
    let f = 0;
    switch (this.state) {
      case 'hook_wind':
        a = 'abom_hook';
        break;
      case 'hook_fly':
        a = 'abom_hook';
        f = this.hframe;
        break;
      case 'hook_yank':
      case 'hook_back':
      case 'hook_end':
        a = 'abom_hook';
        f = 3;
        break;
      case 'bile_wind':
        a = 'abom_vomit';
        f = this.u < this.wind * 0.5 ? 0 : 1;
        break;
      case 'bile_spew':
        a = 'abom_vomit';
        f = 2;
        break;
      case 'bile_end':
        a = 'abom_vomit';
        f = 3;
        break;
      case 'slam_wind':
        a = 'abom_slam';
        f = this.t > 0.14 ? 0 : 1;
        break;
      case 'slam_hit':
        a = 'abom_slam';
        f = 2;
        break;
      case 'slam_rec':
        a = 'abom_slam';
        f = 3;
        break;
      case 'burst_wind':
        a = 'abom_burst';
        break;
      case 'burst':
      case 'burst_end':
        a = 'abom_burst';
        f = 1;
        break;
      default:
        f = Math.floor(this.anim * 4) % 6;
    }
    P[0] = a;
    P[1] = f;
    return P;
  }

  update(dt) {
    const run = this.run;
    const E = run.enemies;
    const i = this.i;
    if (!E.alive[i]) return;
    const ph = this.phase;
    const fast = ph === 1 ? 1 : ph === 2 ? 1.2 : 1.4;
    const frozen = E.frozen[i] > 0;
    const k = frozen ? 0.35 : 1;
    dt *= k;
    this.t -= dt;
    this.u += dt;
    this.anim += dt;
    E.px[i] = E.x[i];
    E.py[i] = E.y[i];
    if (E.flash[i] > 0) E.flash[i] = Math.max(0, E.flash[i] - dt * 7);
    if (E.frozen[i] > 0) E.frozen[i] -= dt / k;
    this.burstCool -= dt;
    this.milestones(ph);
    if (this.gn > 0) this.updateGlobs(dt);
    if (this.waveOn) this.updateWave(dt);
    // the glowing gut lights the ground around it
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = 0.22;
      const sw = this.state === 'burst_wind' ? 2 : this.state === 'burst' ? 3 : 1;
      run.fx.light(this.ax(A_BELLY), this.ay(A_BELLY), 50, 150 * sw, 0.22 * sw, 0.95 * sw, 0.1 * sw, 0.3);
    }
    switch (this.state) {
      case 'enter': {
        if (!this.bannered) {
          this.bannered = true;
          run.sound.abomRoar?.();
          run.events.banner?.(this.name, 'Stitched from the fallen');
          run.shake(0.3);
        }
        E.y[i] += 125 * dt;
        this.footfall(0.16);
        if (E.y[i] >= HOME_Y) {
          E.y[i] = HOME_Y;
          run.shake(0.6);
          run.fx.ring(E.x[i], E.y[i], 30, 300, BILE[0], BILE[1], BILE[2], 0.5, UNDER);
          this.toIdle(1.3);
        }
        break;
      }
      case 'idle':
        this.lumber(dt, fast);
        if (this.t <= 0) this.choose(ph);
        break;
      case 'hook_wind':
        this.updateHookWind(dt);
        break;
      case 'hook_fly':
        this.updateHookFly(dt);
        break;
      case 'hook_yank':
        this.updateHookYank(dt);
        break;
      case 'hook_back':
        this.updateHookBack(dt);
        break;
      case 'hook_end':
        if (this.t <= 0) this.toIdle();
        break;
      case 'bile_wind':
        this.updateBileWind(dt);
        break;
      case 'bile_spew':
        this.updateSpew(dt);
        break;
      case 'bile_end':
        if (this.t <= 0) this.toIdle();
        break;
      case 'slam_wind':
        this.updateSlamWind(dt);
        break;
      case 'slam_hit':
        if (this.t <= 0) {
          this.state = 'slam_rec';
          this.u = 0;
          this.t = 0.55;
        }
        break;
      case 'slam_rec':
        if (this.t <= 0) this.toIdle();
        break;
      case 'burst_wind':
        this.updateBurstWind(dt);
        break;
      case 'burst':
        this.updateBurst(dt);
        break;
      case 'burst_end':
        if (this.t <= 0) this.toIdle(0.9);
        break;
    }
    E.x[i] = clamp(E.x[i], MARGIN, ARENA.w - EDGE_R);
  }

  // anchor positions on screen: the ground point plus the pose's offset
  ax(k) {
    const E = this.run.enemies;
    return E.x[this.i] + this.A[k] * E.scale[this.i];
  }

  ay(k) {
    const E = this.run.enemies;
    return E.y[this.i] + this.A[k + 1] * E.scale[this.i];
  }

  // a line on the road, drawn under the creatures: a beam from (x0, y0) to (x1, y1), half width `half`
  lane(x0, y0, x1, y1, half, c, a, life) {
    const fx = this.run.fx;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const k = fx.add(BEAM, UNDER, (x0 + x1) / 2, (y0 + y1) / 2, 0, 0, 0, 0, life, half, half, c[0], c[1], c[2], a, 0, 0, len / (2 * half) - 1);
    fx.rot[k] = Math.atan2(dy, dx);
  }

  // ---------------------------------------------------------------- moving

  // lumbers after the hero's x and between its home line and the band
  lumber(dt, fast) {
    const run = this.run;
    const E = run.enemies;
    const i = this.i;
    const x = E.x[i];
    const y = E.y[i];
    const tx = clamp(run.hero.x, MARGIN, ARENA.w - MARGIN);
    E.x[i] += clamp(tx - x, -1, 1) * Math.min(Math.abs(tx - x), 70 * fast * FIELD.s * dt);
    E.y[i] += clamp(this.goalY - y, -1, 1) * Math.min(Math.abs(this.goalY - y), 48 * fast * dt);
    this.footfall(0.1);
  }

  // a stomp every third frame of the walk (twice a cycle)
  footfall(k) {
    const f = Math.floor(this.anim * 4);
    if (f === this.step) return;
    this.step = f;
    if (f % 3 !== 0) return;
    const run = this.run;
    const E = run.enemies;
    run.shake(k);
    run.fx.smoke(E.x[this.i] + rand(-60, 60), E.y[this.i] + 6, 4, 30, 2, 0.3);
  }

  toIdle(wait) {
    this.state = 'idle';
    this.u = 0;
    const ph = this.phase;
    this.t = wait ?? rand(1.5, 2.5) / (ph === 1 ? 1 : ph === 2 ? 1.3 : 1.9);
    // below 30% it sometimes goes straight into the next attack
    if (wait === undefined && ph === 3 && chance(0.3)) this.t = 0.2;
    // and lumbers nearer the band the angrier it is
    this.goalY = HOME_Y + (NEAR_Y - HOME_Y) * (ph === 1 ? rnd() * 0.3 : ph === 2 ? rnd() * 0.7 : 0.4 + rnd() * 0.6);
  }

  // ---------------------------------------------------------------- phase changes

  milestones(ph) {
    if (ph === this.lastPhase) return;
    this.lastPhase = ph;
    const run = this.run;
    // it roars, flares and does not wait; the first time it is hurt this badly its gut tears open
    run.sound.abomRoar?.();
    run.shake(0.5);
    const bx = this.ax(A_BELLY);
    const by = this.ay(A_BELLY);
    run.fx.flash(bx, by, 40, 260, BILE[0] * 1.5, BILE[1] * 1.5, BILE[2] * 1.5, 0.3);
    run.fx.ring(bx, by, 40, 360, BILE[0], BILE[1], BILE[2], 0.55);
    run.fx.light(bx, by, 60, 520, 0.6, 2.4, 0.3, 0.5);
    if (ph === 2) {
      this.forceBurst = true;
      this.burstCool = 0;
    }
    if (this.state === 'idle') this.t = Math.min(this.t, 0.6);
  }

  // ---------------------------------------------------------------- choosing

  choose(ph) {
    const E = this.run.enemies;
    if (this.forceBurst && ph >= 2) {
      this.forceBurst = false;
      this.startBurst(ph);
      return;
    }
    let wHook = ph === 1 ? 0.36 : ph === 2 ? 0.28 : 0.26;
    let wBile = ph === 1 ? 0.32 : ph === 2 ? 0.24 : 0.24;
    let wSlam = ph === 1 ? 0.32 : ph === 2 ? 0.26 : 0.24;
    let wBurst = 0;
    // the belly is rationed: a cooldown, and it waits for a thinner field
    if (ph >= 2 && this.burstCool <= 0 && E.n < 170 * FIELD.c && E.nFree > 100) wBurst = ph === 2 ? 0.24 : 0.28;
    // a hero it hooked gets the cleaver (with its full warning)
    if (this.followSlam) {
      wSlam += 0.9;
      this.followSlam = false;
    }
    const la = this.lastAttack;
    if (la === 'hook') wHook *= 0.3;
    else if (la === 'bile') wBile *= 0.3;
    else if (la === 'slam') wSlam *= 0.3;
    else if (la === 'burst') wBurst *= 0.3;
    let r = rnd() * (wHook + wBile + wSlam + wBurst);
    if ((r -= wHook) < 0) this.startHook(ph);
    else if ((r -= wBile) < 0) this.startBile(ph);
    else if ((r -= wSlam) < 0) this.startSlam(ph);
    else this.startBurst(ph);
  }

  // ---------------------------------------------------------------- hook

  startHook(ph) {
    this.lastAttack = 'hook';
    this.state = 'hook_wind';
    this.u = 0;
    this.wind = ph === 1 ? 0.85 : ph === 2 ? 0.75 : 0.66; // never under 0.6 s of warning
    this.t = this.wind;
    this.locked = false;
    this.laneT = 0;
    this.hookOut = false;
    this.aimX = this.run.hero.x;
    this.aimY = this.run.hero.y - 34;
  }

  setHand(frame) {
    const k = A_HOOK + (frame - 1) * 2;
    this.handX = this.ax(k);
    this.handY = this.ay(k);
  }

  updateHookWind(dt) {
    const run = this.run;
    const hero = run.hero;
    const ox = this.ax(A_HOOK);
    const oy = this.ay(A_HOOK);
    // the aim follows the hero, then locks for the last third of a second so a moving hero slips it
    if (this.t > 0.34) {
      this.aimX = hero.x;
      this.aimY = hero.y - 34;
    } else if (!this.locked) {
      this.locked = true;
      run.sound.abomHook?.(); // its crack comes 0.34 s in: the throw
      run.fx.flash(ox, oy, 40, 160, 3, 1.4, 0.6, 0.2);
      run.fx.light(ox, oy, 50, 300, 2, 0.8, 0.3, 0.3);
    }
    let dx = this.aimX - ox;
    let dy = this.aimY - oy;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    this.hdx = dx;
    this.hdy = dy;
    this.hlen = Math.min(d + 280, 2300 * FIELD.r); // it overshoots a little
    this.laneT -= dt;
    if (this.laneT <= 0) {
      this.laneT += 0.07;
      const c = this.locked ? LANE_LOCK : LANE;
      this.lane(ox, oy, ox + dx * this.hlen, oy + dy * this.hlen, HOOK_HALF, c, this.locked ? 0.6 : 0.32, 0.12);
    }
    if (this.t <= 0) {
      this.state = 'hook_fly';
      this.u = 0;
      this.t = 4;
      this.hookOut = true;
      this.hookX = ox;
      this.hookY = oy;
      this.hdone = 0;
      this.hframe = 1;
      this.trailT = 0;
      this.setHand(1);
      run.shake(0.25);
      run.fx.flash(ox, oy, 40, 120, 3, 1.6, 0.8, 0.14);
    }
  }

  updateHookFly(dt) {
    const run = this.run;
    const hero = run.hero;
    this.hframe = this.u < 0.14 ? 1 : 2;
    this.setHand(this.hframe);
    // in two half steps when it is fast, so it cannot skip over the hero
    const total = HOOK_SPEED * FIELD.r * dt;
    const n = total > 36 ? 2 : 1;
    const step = total / n;
    for (let s = 0; s < n; s++) {
      this.hookX += this.hdx * step;
      this.hookY += this.hdy * step;
      this.hdone += step;
      // it skewers and flings what is in its path
      run.trample(this.hookX, this.hookY + 40, 58);
      if (hero.alive) {
        const dx = hero.x - this.hookX;
        const dy = hero.y - 34 - this.hookY;
        if (dx * dx + dy * dy < HOOK_R * HOOK_R) {
          this.catchHero();
          return;
        }
      }
    }
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.04;
      run.fx.sparks(this.hookX, this.hookY, 30, 2, 2.2, 1.0, 0.5, 220, -this.hdx, -this.hdy, 1.2);
    }
    this.hookAng = Math.atan2(this.handY - this.hookY, this.handX - this.hookX);
    if (this.hdone >= this.hlen || this.hookY > BAND.y1 + 140 || this.hookX < -80 || this.hookX > ARENA.w + 80) {
      this.state = 'hook_back';
      this.u = 0;
    }
  }

  catchHero() {
    const run = this.run;
    const hero = run.hero;
    const shielded = hero.shield > 0;
    run.hitHero(DMG_HOOK, this.hookX, this.hookY);
    this.hookAng = Math.atan2(this.handY - this.hookY, this.handX - this.hookX);
    if (shielded) {
      // the shield turns it: it recoils back to the hand
      run.fx.sparks(this.hookX, this.hookY, 30, 8, 1.6, 1.8, 2.4, 420, -this.hdx, -this.hdy, 2);
      this.state = 'hook_back';
      this.u = 0;
      return;
    }
    run.sound.abomCatch?.();
    run.shake(0.45);
    run.hitstop(0.05);
    run.fx.flash(this.hookX, this.hookY, 30, 140, 3, 1.2, 0.6, 0.16);
    this.state = 'hook_yank';
    this.u = 0;
    this.t = 0.6;
    if (this.phase >= 2 && chance(0.6)) this.followSlam = true;
  }

  // the hook is in him: it hauls him toward the boss, up to the top of the band
  updateHookYank(dt) {
    const run = this.run;
    const E = run.enemies;
    const hero = run.hero;
    this.hframe = 3;
    this.setHand(3);
    if (!hero.alive) {
      this.state = 'hook_back';
      this.u = 0;
      return;
    }
    this.hookX = hero.x;
    this.hookY = hero.y - 34;
    const tx = clamp(E.x[this.i], BAND.x0, BAND.x1);
    const ty = BAND.y0 + 10;
    const dx = tx - hero.x;
    const dy = ty - hero.y;
    const d = Math.hypot(dx, dy);
    if (d > 50) {
      // updateHero already ran this step: this velocity is what it integrates next, less what it lets him claw back
      hero.vx = (dx / d) * 1500;
      hero.vy = (dy / d) * 1500;
    }
    this.hookAng = Math.atan2(this.handY - this.hookY, this.handX - this.hookX);
    if (this.t <= 0 || d <= 50) {
      this.state = 'hook_back';
      this.u = 0;
    }
  }

  // the hook lets go and flies home to the hand
  updateHookBack(dt) {
    this.hframe = 3;
    this.setHand(3);
    const dx = this.handX - this.hookX;
    const dy = this.handY - this.hookY;
    const d = Math.hypot(dx, dy) || 1;
    const step = 2600 * dt;
    this.hookAng = Math.atan2(dy, dx);
    if (d <= step + 24) {
      this.hookOut = false;
      this.state = 'hook_end';
      this.u = 0;
      this.t = 0.4;
      this.run.shake(0.12);
      return;
    }
    this.hookX += (dx / d) * step;
    this.hookY += (dy / d) * step;
  }

  // ---------------------------------------------------------------- bile

  startBile(ph) {
    this.lastAttack = 'bile';
    this.state = 'bile_wind';
    this.u = 0;
    this.wind = ph === 1 ? 0.95 : ph === 2 ? 0.85 : 0.75; // the gut glows for this long before anything flies
    this.t = this.wind;
    this.cue = false;
    this.total = ph === 1 ? 7 : ph === 2 ? 9 : 11;
    this.spewDur = ph === 1 ? 1.0 : ph === 2 ? 0.9 : 0.8;
    this.spread = ph === 1 ? 0.9 : ph === 2 ? 1.05 : 1.2;
    this.poolR = ph === 1 ? 62 : ph === 2 ? 66 : 70;
  }

  updateBileWind(dt) {
    const run = this.run;
    const E = run.enemies;
    const mx = this.ax(A_MOUTH);
    const my = this.ay(A_MOUTH);
    const f = clamp(this.u / this.wind, 0, 1);
    // a green glow gathers in the mouth, and the gut churns
    this.laneT -= dt;
    if (this.laneT <= 0) {
      this.laneT += 0.09;
      run.fx.flash(mx, my, 30, 50 + 130 * f, BILE[0] * (0.5 + f), BILE[1] * (0.5 + f), BILE[2] * (0.5 + f), 0.12);
      run.fx.light(mx, my, 40, 120 + 260 * f, 0.3 * (0.5 + f), 1.3 * (0.5 + f), 0.15, 0.2);
      run.fx.sparks(mx, my, 30, 1, BILE[0], BILE[1], BILE[2], 140, rand(-1, 1), 1, 1.5);
      run.shake(0.03 + 0.05 * f);
    }
    if (!this.cue && this.t <= 0.32) {
      this.cue = true;
      run.sound.abomVomit?.(); // its retch is 0.32 s long before the gush
    }
    if (this.t <= 0) {
      this.state = 'bile_spew';
      this.u = 0;
      this.t = this.spewDur;
      this.globsLeft = this.total;
      this.nextGlob = 0;
      // aim the fan at the hero's feet now; the globs fly from the mouth, the landings are measured on the ground
      const hero = run.hero;
      this.ox = mx;
      this.oy = E.y[this.i] + 30;
      this.oz = this.oy - my;
      const dx = hero.x - this.ox;
      const dy = hero.y - this.oy;
      this.aimAng = clamp(Math.atan2(dy, dx), 0.5, Math.PI - 0.5); // always down the road, never back over its shoulder
      this.aimD = clamp(Math.hypot(dx, dy), 260, 1500 * FIELD.r);
      run.shake(0.3);
    }
  }

  updateSpew(dt) {
    const run = this.run;
    const mx = this.ax(A_MOUTH);
    const my = this.ay(A_MOUTH);
    this.laneT -= dt;
    if (this.laneT <= 0) {
      this.laneT += 0.06;
      run.fx.flash(mx, my, 30, 150, BILE[0] * 1.3, BILE[1] * 1.3, BILE[2] * 1.3, 0.1);
      run.fx.blood(mx, my, 20, rand(-0.6, 0.6), 1, 3, 260, ACID, 1.3);
    }
    run.shake(0.06);
    this.nextGlob -= dt;
    while (this.nextGlob <= 0 && this.globsLeft > 0) {
      this.launchGlob();
      this.globsLeft--;
      this.nextGlob += this.spewDur / this.total;
    }
    if (this.t <= 0) {
      this.state = 'bile_end';
      this.u = 0;
      this.t = 0.5;
    }
  }

  launchGlob() {
    if (this.gn >= MAX_GLOBS) return;
    const a = this.aimAng + (rnd() - 0.5) * this.spread;
    const d = this.aimD * rand(0.55, 1.2);
    const g = this.gn++;
    this.gx0[g] = this.ox;
    this.gy0[g] = this.oy;
    this.gx1[g] = clamp(this.ox + Math.cos(a) * d, 50, ARENA.w - 50);
    this.gy1[g] = clamp(this.oy + Math.sin(a) * d * 0.9, this.oy + 100, BAND.y1 + 10);
    this.gu[g] = 0;
    this.gdur[g] = rand(0.68, 0.8); // in the air long enough to read where it is going
    this.gr[g] = this.poolR * rand(0.9, 1.1);
    this.gt[g] = 0;
  }

  updateGlobs(dt) {
    const run = this.run;
    const fx = run.fx;
    for (let g = 0; g < this.gn; g++) {
      const u = (this.gu[g] += dt / this.gdur[g]);
      if (u >= 1) {
        this.land(g);
        // swap-remove
        const last = --this.gn;
        if (g !== last) {
          this.gx0[g] = this.gx0[last];
          this.gy0[g] = this.gy0[last];
          this.gx1[g] = this.gx1[last];
          this.gy1[g] = this.gy1[last];
          this.gu[g] = this.gu[last];
          this.gdur[g] = this.gdur[last];
          this.gr[g] = this.gr[last];
          this.gt[g] = this.gt[last];
        }
        g--;
        continue;
      }
      const x = this.gx0[g] + (this.gx1[g] - this.gx0[g]) * u;
      const y = this.gy0[g] + (this.gy1[g] - this.gy0[g]) * u;
      const z = this.oz * (1 - u) + 130 * Math.sin(Math.PI * u);
      fx.add(GLOW, HOT, x, y, z, 0, 0, 0, 0.14, 30, 10, BILE[0], BILE[1], BILE[2], 0.9);
      // the landing spot pulses on the ground
      this.gt[g] -= dt;
      if (this.gt[g] <= 0) {
        this.gt[g] += 0.11;
        fx.ring(this.gx1[g], this.gy1[g], this.gr[g] * 0.3, this.gr[g], 0.3, 1.5, 0.1, 0.16, UNDER);
      }
    }
  }

  land(g) {
    const run = this.run;
    const x = this.gx1[g];
    const y = this.gy1[g];
    const r = this.gr[g];
    run.hazard?.(x, y, r, 6, 'acid');
    run.fx.blood(x, y, 8, 0, -1, 10, 340, ACID, 3.14);
    run.fx.ring(x, y, r * 0.2, r * 1.1, 0.3, 1.8, 0.1, 0.35);
    run.fx.light(x, y, 20, r * 2.2, 0.3, 1.4, 0.1, 0.3);
  }

  // ---------------------------------------------------------------- slam

  startSlam(ph) {
    this.lastAttack = 'slam';
    this.state = 'slam_wind';
    this.u = 0;
    this.wind = ph === 1 ? 0.95 : ph === 2 ? 0.85 : 0.75;
    this.t = this.wind;
    this.locked = false;
    this.laneT = 0;
  }

  updateSlamWind(dt) {
    const run = this.run;
    const E = run.enemies;
    const i = this.i;
    // it lines the blade up with the hero, then plants its feet for the last 0.42 s
    if (this.t > 0.42) {
      const tx = clamp(run.hero.x - this.A[A_CLEAVER] * E.scale[i], MARGIN, ARENA.w - EDGE_R);
      E.x[i] += clamp(tx - E.x[i], -1, 1) * Math.min(Math.abs(tx - E.x[i]), 240 * FIELD.s * dt);
    } else if (!this.locked) {
      this.locked = true;
      run.shake(0.2);
    }
    const ix = this.ax(A_CLEAVER);
    const iy = this.ay(A_CLEAVER);
    this.slamX = ix;
    this.slamY = iy;
    // the marked lane straight down from the impact and a circle where the blade bites
    this.laneT -= dt;
    if (this.laneT <= 0) {
      this.laneT += 0.07;
      const c = this.locked ? LANE_LOCK : LANE;
      this.lane(ix, iy, ix, ARENA.h + 60, SLAM_HALF, c, this.locked ? 0.6 : 0.32, 0.12);
      run.fx.ring(ix, iy, 120, 128, c[0], c[1], c[2], 0.12, UNDER);
    }
    if (this.t <= 0) this.impact();
  }

  impact() {
    const run = this.run;
    const hero = run.hero;
    const x = this.slamX;
    const y = this.slamY;
    this.state = 'slam_hit';
    this.u = 0;
    this.t = 0.5;
    run.sound.abomSlam?.();
    run.shake(1);
    run.hitstop(0.07);
    run.fx.ring(x, y, 40, 280, 2.4, 1.6, 1.0, 0.45);
    run.fx.ring(x, y, 20, 190, 1.4, 0.8, 0.5, 0.35, UNDER);
    for (let k = 0; k < 10; k++) run.fx.smoke(x + rand(-130, 130), y + rand(-50, 50), 6, 50, 1, 0.34);
    run.fx.flash(x, y, 20, 240, 3, 1.8, 0.8, 0.2);
    run.fx.sparks(x, y, 20, 14, 3, 1.6, 0.5, 600, 0, -1, TAU);
    run.fx.splat(x, y, 140, 0.06, 0.05, 0.045, 0.6, 2);
    run.fx.light(x, y, 60, 600, 3, 1.8, 0.8, 0.4);
    // the horde at the blade is flung (the boss itself is skipped by the 'slam' source), the hero too if he stayed
    run.blast(x, y, 170, 90, 900, 'slam');
    const dx = hero.x - x;
    const dy = hero.y - y;
    if (dx * dx + dy * dy < 120 * 120) run.hitHero(DMG_SLAM, x, y);
    // and a shockwave runs down the lane
    this.waveOn = true;
    this.waveY = y;
    this.waveHit = false;
    this.waveBlast = 0;
    this.waveFx = 0;
  }

  updateWave(dt) {
    const run = this.run;
    const hero = run.hero;
    const x = this.slamX;
    this.waveY += WAVE_SPEED * dt;
    const y = this.waveY;
    // creatures on the line are blasted off it
    this.waveBlast -= dt;
    if (this.waveBlast <= 0) {
      this.waveBlast += 0.05;
      run.blast(x, y, 70, 70, 800, 'slam');
    }
    this.waveFx -= dt;
    run.fx.flash(x, y, 18, 120, 2.2, 0.9, 0.3, 0.1);
    if (this.waveFx <= 0) {
      this.waveFx += 0.05;
      run.fx.sparks(x + rand(-40, 40), y, 10, 3, 3, 1.6, 0.5, 420, 0, -1, 2);
      run.fx.smoke(x + rand(-40, 40), y, 6, 40, 1, 0.3);
      run.fx.splat(x + rand(-20, 20), y, 46, 0.05, 0.04, 0.04, 0.5, 2);
    }
    if (!this.waveHit && hero.alive && Math.abs(hero.x - x) < SLAM_HALF + 12 && Math.abs(hero.y - y) < 55) {
      this.waveHit = true;
      run.hitHero(DMG_WAVE, x, y - 30);
    }
    if (y > ARENA.h + 80) this.waveOn = false;
  }

  // ---------------------------------------------------------------- belly burst

  startBurst(ph) {
    this.lastAttack = 'burst';
    this.state = 'burst_wind';
    this.u = 0;
    this.wind = ph === 2 ? 1.0 : 0.9;
    this.t = this.wind;
    this.cue = false;
    this.laneT = 0;
    this.burstCool = ph === 2 ? 14 : 10;
    this.spawnN = ph === 2 ? 10 : 15;
  }

  updateBurstWind(dt) {
    const run = this.run;
    const bx = this.ax(A_BELLY);
    const by = this.ay(A_BELLY);
    const f = clamp(this.u / this.wind, 0, 1);
    // the gut swells and glows, rings close on it, the stitches pop
    this.laneT -= dt;
    if (this.laneT <= 0) {
      this.laneT += 0.12;
      run.fx.ring(bx, by, 230 - 120 * f, 40, BILE[0], BILE[1], BILE[2], 0.35);
      run.fx.flash(bx, by, 40, 80 + 120 * f, BILE[0] * (0.5 + f), BILE[1] * (0.5 + f), BILE[2] * (0.5 + f), 0.14);
      run.fx.sparks(bx + rand(-30, 30), by + rand(-40, 40), 30, 2, 2.4, 2.4, 0.8, 300, 0, -1, 3);
    }
    run.shake(0.04 + 0.1 * f);
    if (!this.cue && this.t <= 0.45) {
      this.cue = true;
      run.sound.abomBurst?.(); // its rip is 0.45 s long before the burst
    }
    if (this.t <= 0) {
      this.state = 'burst';
      this.u = 0;
      this.t = 1.0;
      this.spawnK = 0;
      this.spawnT = 0;
      run.shake(0.9);
      run.hitstop(0.05);
      run.fx.flash(bx, by, 40, 340, BILE[0] * 2, BILE[1] * 2, BILE[2] * 2, 0.3);
      run.fx.ring(bx, by, 30, 300, BILE[0], BILE[1], BILE[2], 0.5);
      run.fx.light(bx, by, 50, 650, 0.8, 3, 0.4, 0.5);
      run.fx.blood(bx, by, 30, 0, 1, 50, 520, ACID, 2.2);
      run.fx.splat(bx, this.run.enemies.y[this.i] + 30, 150, 0.1, 0.42, 0.04, 0.7, 0);
    }
  }

  // spiders and exploders pour out of the belly over a second
  updateBurst(dt) {
    const run = this.run;
    const E = run.enemies;
    this.spawnT -= dt;
    while (this.spawnT <= 0 && this.spawnK < this.spawnN) {
      this.spawnT += 0.06;
      this.spawnK++;
      if (E.nFree < 40) continue;
      const a = Math.PI / 2 + (rnd() - 0.5) * 2.4; // a fan down the road
      const s = rand(550, 1100);
      const x = this.ax(A_BELLY) + rand(-30, 30);
      const y = E.y[this.i] + 30;
      run.spawnAt(this.spawnK % 4 === 0 ? 'exploder' : 'spider', x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s });
      run.fx.blood(x, y - 40, 20, Math.cos(a), Math.sin(a), 4, 300, ACID, 1.2);
    }
    if (this.t <= 0 && this.spawnK >= this.spawnN) {
      this.state = 'burst_end';
      this.u = 0;
      this.t = 0.5;
    }
  }

  // for the test pilot (src/bot.js): how dangerous standing at x (on the hero's line y) is right now, 0..1
  danger(x, y) {
    const st = this.state;
    if (st === 'hook_wind' || st === 'hook_fly') {
      // distance from the hero's chest at x to the marked hook line
      const ox = this.ax(A_HOOK);
      const oy = this.ay(A_HOOK);
      const px = x - ox;
      const py = y - 34 - oy;
      const t = clamp(px * this.hdx + py * this.hdy, 0, this.hlen);
      return Math.hypot(px - this.hdx * t, py - this.hdy * t) < HOOK_HALF + 46 ? 1 : 0;
    }
    if (st === 'slam_wind' || this.waveOn) return Math.abs(x - this.slamX) < SLAM_HALF + 46 ? 1 : 0;
    return 0;
  }

  // drawn by draw.js after the bullets: the flying hook on its chain, above the horde
  draw(d) {
    if (!this.hookOut) return;
    const A = d.A;
    this.fHook ||= A.get('abom_hook');
    this.fChain ||= A.get('abom_chain');
    const S = d.sprites;
    const x0 = this.handX;
    const y0 = this.handY;
    const dx = this.hookX - x0;
    const dy = this.hookY - y0;
    const len = Math.hypot(dx, dy);
    const rot = Math.atan2(dy, dx) + Math.PI / 2;
    const depth = ARENA.h + 200;
    if (this.fChain && len > 1) {
      const step = this.chainStep || (this.chainStep = this.run.anchor('size', 'abom_chain', 44) || 44);
      const n = Math.min(80, Math.floor(len / step));
      for (let k = 1; k <= n; k++) {
        const f = k / (n + 1);
        S.put(this.fChain, x0 + dx * f, y0 + dy * f, depth, 1, rot, 1);
      }
    }
    if (this.fHook) S.put(this.fHook, this.hookX, this.hookY, depth + 1, 1, this.hookAng + Math.PI / 2, 1);
  }

  // called by the run when it dies: nothing of it stays out
  onDeath() {
    this.hookOut = false;
    this.gn = 0;
    this.waveOn = false;
  }
}
