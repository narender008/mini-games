// The Gilded Summoner, chapter 2's boss: a golden, floating demon with four arms and a staff. It floats down
// over the horde, drifts side to side, and cycles through four attacks, faster and angrier as it is hurt:
//   cast     - raises the staff, the orb gathers light, then fans of slow golden orbs fly at the hero
//              (below 30% health it adds homing skulls)
//   summon   - spreads its arms and opens 2-4 portals on the field; after a second each spits imps and
//              exploders (and armoured knights in the later phases)
//   teleport - fades out, marks where it will stand with a ring, and steps back in with a golden flash
//   nova     - (below 60%) gathers light, then a ring of orbs rolls out of it with ONE gap; a pale lane on
//              the road shows the gap while it charges (below 30% a second ring follows with a new gap)
// Each time its health crosses 66% and 33% it drops a treasure chest in a beam of light, and each phase
// change (60% and 30%) is a laugh and a flare. Nothing here allocates per frame: the portals live in typed
// arrays, every fx call is a plain number call, anchors are read once.
//
// The lead reads `fade` (0..1 visible: draw it as alpha) and `glow` (0..1 extra brightness).
import { ARENA, FIELD, clamp, rand, rnd, randi, chance, TAU, smooth } from '../../config.js';
import { GLOW, UNDER, HOT } from '../../fx/particles.js';

const HOME_Y = 560; // the ground point under it; the sprite floats above that and the staff orb reaches higher still
const MAX_PORTALS = 8;
const PORTAL_R = 66;
const OPEN = 1.05; // seconds the portals glow before they spit
const MARGIN = 170; // the sprite is about 430 units wide: keep it mostly on the field

// HDR colours (the particle shader adds them, so values above 1 bloom)
const GOLD = [2.7, 1.9, 0.5];
const HOT_GOLD = [3.2, 2.6, 1.2];
const PORTAL = [2.4, 1.2, 0.35];
const LANE = [0.45, 0.85, 1.0];

export class Demon {
  constructor(run, slot) {
    this.run = run;
    this.i = slot;
    this.name = 'THE GILDED SUMMONER';
    this.state = 'enter';
    this.t = 0; // time left in the state
    this.u = 0; // time spent in the state
    this.anim = 0; // frame clock for the hover loop
    this.fade = 1; // 0..1 visible (teleport)
    this.glow = 0; // 0..1 extra brightness (the lead draws it)
    this.glowT = 0.3;
    this.vx = 0;
    this.tx = ARENA.w / 2;
    this.tick = 0;
    this.lastAttack = '';
    this.summonCool = 4;
    this.chests = 0;
    this.lastPhase = 1;
    this.afterTp = false;
    this.bannered = false;
    this.poseOut = ['demon_float', 0];
    // cast
    this.volleys = 0;
    this.wind = 0.7;
    this.nextShot = 0;
    this.gap = 0.6;
    this.shots = 0;
    // teleport
    this.dest = 0;
    // nova
    this.gapA = 0;
    this.gapHalf = 0.2;
    this.gapX = 0;
    this.rings = 0;
    this.nextRing = 0;
    // portals
    this.np = 0;
    this.knights = 0;
    this.pxs = new Float32Array(MAX_PORTALS);
    this.pys = new Float32Array(MAX_PORTALS);
    this.pleft = new Uint8Array(MAX_PORTALS);
    this.pnext = new Float32Array(MAX_PORTALS);
    // where the staff orb and the chest are on each pose, from the atlas (offsets from the boss's ground point)
    const o = (name, x, y) => run.anchor('orb', name, [x, y]);
    const a2 = o('demon', 165, -404);
    const a0 = o('demon_c0', 120, -330);
    const a1 = o('demon_c1', 150, -380);
    const a3 = o('demon_c3', 130, -360);
    const af = o('demon_float', 130, -330);
    const as = o('demon_summon', 190, -350);
    const core = run.anchor('core', 'demon', [0, -200]);
    this.orb = new Float32Array([a0[0], a0[1], a1[0], a1[1], a2[0], a2[1], a3[0], a3[1], af[0], af[1], as[0], as[1]]);
    this.core = new Float32Array([core[0], core[1]]);
  }

  // 1 above 60% health, 2 below, 3 below 30%
  get phase() {
    const E = this.run.enemies;
    const f = E.hp[this.i] / E.maxHp[this.i];
    return f < 0.3 ? 3 : f < 0.6 ? 2 : 1;
  }

  // what to draw: anim prefix and frame index
  pose() {
    const u = this.u;
    const p = this.poseOut; // one array, reused: drawn every frame
    switch (this.state) {
      case 'cast':
        p[0] = 'demon_cast';
        p[1] = this.volleys === 0 && this.shots > 0 ? 3 : u < 0.3 ? 0 : u < 0.6 ? 1 : 2;
        break;
      case 'summon':
        p[0] = 'demon_summon';
        p[1] = u < 0.25 ? 0 : u < 0.6 ? 1 : this.t < 0.35 ? 3 : 2;
        break;
      case 'nova':
        p[0] = 'demon_summon';
        p[1] = u < 0.3 ? 0 : u < 0.65 ? 1 : this.t < 0.4 ? 3 : 2;
        break;
      default:
        p[0] = 'demon_float';
        p[1] = Math.floor(this.anim * 6) % 6;
    }
    return p;
  }

  // index into this.orb of the staff orb on the current pose
  orbAt() {
    const u = this.u;
    switch (this.state) {
      case 'cast':
        return this.volleys === 0 && this.shots > 0 ? 6 : u < 0.3 ? 0 : u < 0.6 ? 2 : 4;
      case 'summon':
      case 'nova':
        return 10;
      default:
        return 8;
    }
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
    this.glow += (this.glowT - this.glow) * Math.min(1, 7 * dt);
    this.summonCool -= dt;
    this.milestones(ph);

    switch (this.state) {
      case 'enter': {
        // floats down from above the field, slowing as it settles
        const d = HOME_Y - E.y[i];
        E.y[i] += Math.min(Math.max(d, 0), clamp(d * 1.1, 45, 190) * dt);
        this.glowT = 0.45;
        if (d < 1) {
          E.y[i] = HOME_Y;
          if (!this.bannered) {
            this.bannered = true;
            run.sound.demonLaugh?.();
            run.shake(0.5);
            run.events.banner?.(this.name, 'Bow to the gold');
            run.fx.ring(E.x[i], E.y[i], 30, 330, GOLD[0], GOLD[1], GOLD[2], 0.6);
          }
          this.toIdle(1.4);
        }
        break;
      }
      case 'idle': {
        this.patrol(dt, fast);
        this.glowT = 0.18 + 0.1 * Math.sin(this.anim * 3);
        if (this.t <= 0) this.choose();
        break;
      }
      case 'cast':
        this.updateCast(dt, ph, fast);
        break;
      case 'summon':
        this.updateSummon(dt, ph);
        break;
      case 'tp_out':
        this.updateTeleportOut(dt);
        break;
      case 'tp_in': {
        this.stand(dt);
        this.fade = smooth(clamp(this.u / 0.32, 0, 1));
        if (this.t <= 0) {
          this.fade = 1;
          this.afterTp = true;
          this.toIdle(0.35);
        }
        break;
      }
      case 'nova':
        this.updateNova(dt, ph);
        break;
    }
    E.x[i] = clamp(E.x[i], 120, ARENA.w - 120);
  }

  // ---------------------------------------------------------------- movement

  // drifts side to side above the horde toward a wandering target, easing its speed
  patrol(dt, fast) {
    const E = this.run.enemies;
    const i = this.i;
    const lo = MARGIN;
    const hi = ARENA.w - MARGIN;
    const x = E.x[i];
    if (Math.abs(this.tx - x) < 24 || this.tx < lo || this.tx > hi) {
      let nx = rand(lo, hi);
      if (Math.abs(nx - x) < 140) nx = rand(lo, hi); // one reroll if it would barely move
      this.tx = nx;
    }
    const want = clamp(this.tx - x, -1, 1) * 95 * fast * FIELD.s;
    this.vx += (want - this.vx) * Math.min(1, 2.2 * dt);
    E.x[i] += this.vx * dt;
    E.y[i] += (HOME_Y + 10 * Math.sin(this.anim * 1.3) - E.y[i]) * Math.min(1, 2 * dt);
  }

  // hovers in place during an attack (coasts to a stop)
  stand(dt) {
    const E = this.run.enemies;
    const i = this.i;
    this.vx *= Math.exp(-4 * dt);
    E.x[i] += this.vx * dt;
    E.y[i] += (HOME_Y - E.y[i]) * Math.min(1, 3 * dt);
  }

  toIdle(wait) {
    this.state = 'idle';
    this.u = 0;
    const ph = this.phase;
    this.t = wait ?? rand(1.3, 2.3) / (ph === 1 ? 1 : ph === 2 ? 1.3 : 1.7);
    this.glowT = 0.2;
  }

  // ---------------------------------------------------------------- milestones: chests and phase changes

  milestones(ph) {
    const run = this.run;
    const E = run.enemies;
    const i = this.i;
    const f = E.hp[i] / E.maxHp[i];
    if ((this.chests === 0 && f < 0.66) || (this.chests === 1 && f < 0.33)) {
      this.chests++;
      this.dropChest();
    }
    if (ph !== this.lastPhase) {
      this.lastPhase = ph;
      // it laughs, flares, and does not wait to strike again
      run.sound.demonLaugh?.();
      run.shake(0.45);
      this.glow = 1;
      const x = E.x[i];
      const y = E.y[i] - 200;
      run.fx.flash(x, y, 40, 300, HOT_GOLD[0], HOT_GOLD[1], HOT_GOLD[2], 0.3);
      run.fx.ring(x, y, 40, 380, GOLD[0], GOLD[1], GOLD[2], 0.6);
      run.fx.light(x, y, 80, 600, 3, 2.2, 0.8, 0.5);
      if (this.state === 'idle') this.t = Math.min(this.t, 0.5);
    }
  }

  // a treasure chest drops from the boss in a column of golden light
  dropChest() {
    const run = this.run;
    const E = run.enemies;
    const i = this.i;
    const x = E.x[i];
    // chests drift down slowly: let it fall from a little below the boss so it reaches the hero's band soon
    const y = Math.min(E.y[i] + 130, 780);
    run.dropPickup?.('chest', x, y);
    run.fx.beam(x, run.top() - 40, x, y, 30, GOLD[0], GOLD[1], GOLD[2], 1.0, 0.3);
    run.fx.beam(x, run.top() - 40, x, y, 12, HOT_GOLD[0], HOT_GOLD[1], HOT_GOLD[2], 1.0, 0);
    run.fx.flash(x, y - 20, 30, 260, HOT_GOLD[0], HOT_GOLD[1], HOT_GOLD[2], 0.4);
    run.fx.ring(x, y, 20, 220, GOLD[0], GOLD[1], GOLD[2], 0.55);
    run.fx.sparks(x, y, 20, 26, GOLD[0], GOLD[1], GOLD[2], 520, 0, -1, TAU);
    run.fx.light(x, y - 30, 70, 480, 3, 2.2, 0.8, 0.7);
    run.shake(0.3);
    this.glow = 1;
  }

  // ---------------------------------------------------------------- choosing

  choose() {
    const run = this.run;
    const E = run.enemies;
    const ph = this.phase;
    // weights by phase; the last attack is less likely again; summons are rationed and wait for a thinner field
    let wCast = ph === 1 ? 0.5 : ph === 2 ? 0.3 : 0.28;
    let wSum = ph === 1 ? 0.3 : ph === 2 ? 0.3 : 0.27;
    let wTele = ph === 1 ? 0.2 : ph === 2 ? 0.15 : 0.1;
    let wNova = ph === 1 ? 0 : ph === 2 ? 0.25 : 0.35;
    // (a crowded field gets no more: the horde would bury the fight)
    if (this.summonCool > 0) wSum *= 0.1;
    if (E.n > 45 * FIELD.c || E.nFree < 150) wSum = 0;
    // a teleport straight after a teleport is pointless
    if (this.afterTp) wTele = 0;
    this.afterTp = false;
    const la = this.lastAttack;
    if (la === 'cast') wCast *= 0.35;
    else if (la === 'summon') wSum *= 0.35;
    else if (la === 'tele') wTele *= 0.35;
    else if (la === 'nova') wNova *= 0.35;
    let r = rnd() * (wCast + wSum + wTele + wNova);
    if ((r -= wCast) < 0) this.startCast(ph);
    else if ((r -= wSum) < 0) this.startSummon(ph);
    else if ((r -= wTele) < 0) this.startTeleport();
    else this.startNova(ph);
  }

  // ---------------------------------------------------------------- cast: fans of golden orbs

  startCast(ph) {
    this.lastAttack = 'cast';
    this.state = 'cast';
    this.u = 0;
    this.tick = 0;
    this.shots = 0;
    this.volleys = ph === 1 ? 3 : ph === 2 ? 4 : 5;
    this.wind = ph === 1 ? 0.78 : ph === 2 ? 0.7 : 0.64; // never under 0.6 s of warning
    const gap = ph === 1 ? 0.62 : ph === 2 ? 0.56 : 0.5;
    this.gap = gap;
    this.nextShot = this.wind;
    this.t = this.wind + (this.volleys - 1) * gap + 0.55;
    this.run.sound.demonCast?.();
  }

  updateCast(dt, ph, fast) {
    const run = this.run;
    const E = run.enemies;
    const i = this.i;
    this.stand(dt);
    const oi = this.orbAt();
    const ox = E.x[i] + this.orb[oi];
    const oy = E.y[i] + this.orb[oi + 1];
    if (this.u < this.wind) {
      // the orb gathers light: rings close in on it and it swells
      this.glowT = 0.35 + 0.5 * (this.u / this.wind);
      this.tick -= dt;
      if (this.tick <= 0) {
        this.tick += 0.11;
        const p = this.u / this.wind;
        run.fx.ring(ox, oy, 90 - 40 * p, 14, GOLD[0], GOLD[1], GOLD[2], 0.22);
        run.fx.sparks(ox, oy, 0, 2, GOLD[0], GOLD[1], GOLD[2], 140, 0, -1, TAU);
        run.fx.light(ox, oy, 60, 160 + 160 * p, 2.0, 1.4, 0.4, 0.14);
      }
    } else {
      this.glowT = 0.6;
    }
    if (this.volleys > 0 && this.u >= this.nextShot) {
      this.nextShot += this.gap;
      this.volleys--;
      this.shots++;
      this.fan(ox, oy, ph);
    }
    if (this.t <= 0) this.toIdle();
  }

  // one volley: a fan of slow orbs toward the hero, alternate volleys offset by half a step; skulls home in below 30% health
  fan(ox, oy, ph) {
    const run = this.run;
    const hero = run.hero;
    // orbs a fixed angle apart, so the gaps stay wide enough to slip through (a wide field gets a wider fan, not a denser one)
    const n = Math.max(3, Math.round((ph === 1 ? 7 : ph === 2 ? 8 : 9) * Math.sqrt(FIELD.r)));
    const spread = n * (ph === 1 ? 0.25 : ph === 2 ? 0.23 : 0.21);
    const sp = 200 + ph * 20;
    const aim = Math.atan2(hero.y - 34 - oy, hero.x - ox);
    // even volleys: n orbs; odd ones: n - 1 orbs between them, so a fan's holes are covered by the next
    const between = this.shots % 2 === 0;
    const m = between ? n - 1 : n;
    for (let s = 0; s < m; s++) {
      const a = aim + ((between ? s + 1 : s + 0.5) / n - 0.5) * spread;
      run.shoot(ox, oy, Math.cos(a) * sp, Math.sin(a) * sp, 2);
    }
    if (ph === 3) {
      // two homing skulls peel off either side of the fan
      for (let s = -1; s <= 1; s += 2) {
        const a = aim + s * 0.55;
        run.shoot(ox, oy, Math.cos(a) * 150, Math.sin(a) * 150, 3);
      }
    }
    run.fx.flash(ox, oy, 30, 130, HOT_GOLD[0], HOT_GOLD[1], HOT_GOLD[2], 0.14);
    run.fx.ring(ox, oy, 10, 90, GOLD[0], GOLD[1], GOLD[2], 0.25);
    run.fx.light(ox, oy, 60, 340, 2.6, 1.8, 0.5, 0.22);
    run.sound.enemyShot?.(run.pan(ox));
    run.shake(0.1);
  }

  // ---------------------------------------------------------------- summon: portals

  startSummon(ph) {
    const run = this.run;
    this.lastAttack = 'summon';
    this.state = 'summon';
    this.u = 0;
    this.tick = 0;
    this.knights = 0;
    this.summonCool = ph === 1 ? 9 : ph === 2 ? 8 : 7;
    // 2-4 portals on the field (a wide field gets a few more), kept apart
    let n = ph === 1 ? randi(2, 3) : ph === 2 ? randi(2, 4) : randi(3, 4);
    n = Math.min(MAX_PORTALS, n + Math.floor((FIELD.s - 1) * 1.3));
    const W = ARENA.w;
    const apart = 190 * FIELD.r;
    let made = 0;
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 10; tries++) {
        const x = rand(90, W - 90);
        const y = rand(250, 720);
        let ok = true;
        for (let j = 0; j < made; j++) {
          const dx = x - this.pxs[j];
          const dy = (y - this.pys[j]) * 1.4;
          if (dx * dx + dy * dy < apart * apart) ok = false;
        }
        if (ok || tries === 9) {
          this.pxs[made] = x;
          this.pys[made] = y;
          this.pleft[made] = ph === 1 ? randi(3, 5) : randi(3, 6);
          this.pnext[made] = OPEN + k * 0.07;
          made++;
          break;
        }
      }
    }
    this.np = made;
    this.t = OPEN + 0.14 * made + 0.115 * 6 + 0.55;
    run.sound.demonSummon?.();
  }

  updateSummon(dt, ph) {
    const run = this.run;
    const E = run.enemies;
    this.stand(dt);
    const u = this.u;
    const open = u < OPEN;
    this.glowT = open ? 0.35 + 0.45 * (u / OPEN) : 0.8;
    // the portals swell and spin up for a second, then stay lit while they spit
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick += 0.07;
      const p = open ? smooth(u / OPEN) : 1;
      const R = PORTAL_R * (0.25 + 0.75 * p);
      for (let k = 0; k < this.np; k++) {
        if (!open && this.pleft[k] === 0) continue;
        const x = this.pxs[k];
        const y = this.pys[k];
        run.fx.add(GLOW, UNDER, x, y, 0, 0, 0, 0, 0.2, R * 2.1, R * 2.3, PORTAL[0] * 0.6, PORTAL[1] * 0.6, PORTAL[2] * 0.6, 0.9);
        run.fx.ring(x, y, R * 1.25, R * 0.95, PORTAL[0], PORTAL[1], PORTAL[2], 0.2, HOT);
        if (open) run.fx.ring(x, y, R * 2.0, R * 0.6, PORTAL[0] * 0.7, PORTAL[1] * 0.7, PORTAL[2] * 0.7, 0.3, UNDER);
        run.fx.sparks(x, y - 6, 6, 1, GOLD[0], GOLD[1], GOLD[2], 190, 0, -1, 1.2);
        if (k < 3) run.fx.light(x, y - 20, 40, 230, PORTAL[0] * 0.5, PORTAL[1] * 0.5, PORTAL[2] * 0.5, 0.12);
      }
    }
    if (!open) {
      for (let k = 0; k < this.np; k++) {
        if (this.pleft[k] === 0 || u < this.pnext[k]) continue;
        this.spit(k, ph);
        this.pleft[k]--;
        this.pnext[k] = u + 0.11 + rnd() * 0.05;
        if (this.pleft[k] === 0) {
          // the portal slams shut
          const x = this.pxs[k];
          const y = this.pys[k];
          run.fx.ring(x, y, PORTAL_R * 1.1, 10, PORTAL[0], PORTAL[1], PORTAL[2], 0.3, HOT);
          run.fx.flash(x, y, 20, PORTAL_R * 1.4, HOT_GOLD[0], HOT_GOLD[1], HOT_GOLD[2], 0.15);
        }
      }
    }
    if (this.t <= 0) this.toIdle();
  }

  // one creature out of portal k
  spit(k, ph) {
    const run = this.run;
    if (run.enemies.nFree < 80) return;
    const r = rnd();
    let type = 'imp';
    if (ph === 1) type = r < 0.55 ? 'imp' : 'exploder';
    else {
      type = r < 0.35 ? 'imp' : r < 0.65 ? 'exploder' : 'knight';
      if (type === 'knight' && (this.knights >= (ph === 2 ? 2 : 3) || run.count?.('knight') >= 3 * FIELD.r)) type = 'exploder';
    }
    if (type === 'knight') this.knights++;
    const x = this.pxs[k] + rand(-24, 24);
    const y = this.pys[k] + rand(-12, 12);
    run.spawnAt?.(type, x, y, { vx: rand(-110, 110), vy: rand(60, 170) });
    run.fx.flash(x, y - 20, 20, 70, HOT_GOLD[0], HOT_GOLD[1], HOT_GOLD[2], 0.1);
    run.fx.sparks(x, y - 10, 10, 4, GOLD[0], GOLD[1], GOLD[2], 260, 0, -1, 2.4);
  }

  // ---------------------------------------------------------------- teleport

  startTeleport() {
    const run = this.run;
    const E = run.enemies;
    const i = this.i;
    this.lastAttack = 'tele';
    this.state = 'tp_out';
    this.u = 0;
    this.tick = 0;
    this.t = 0.66;
    // somewhere it is not now: far enough to be a real move
    const lo = MARGIN;
    const hi = ARENA.w - MARGIN;
    const far = Math.min(160, (hi - lo) * 0.4);
    let d = rand(lo, hi);
    for (let tries = 0; tries < 6 && Math.abs(d - E.x[i]) < far; tries++) d = rand(lo, hi);
    this.dest = d;
    run.sound.demonTeleport?.();
    const x = E.x[i];
    const y = E.y[i] - 200;
    run.fx.ring(x, E.y[i], 30, 150, GOLD[0], GOLD[1], GOLD[2], 0.4, UNDER);
    run.fx.flash(x, y, 40, 200, HOT_GOLD[0], HOT_GOLD[1], HOT_GOLD[2], 0.2);
  }

  updateTeleportOut(dt) {
    const run = this.run;
    const E = run.enemies;
    const i = this.i;
    this.stand(dt);
    // fades over 0.45 s; the ground ring shows where it will stand
    this.fade = 1 - smooth(clamp(this.u / 0.45, 0, 1));
    this.glowT = 0.9;
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick += 0.09;
      const p = this.u / 0.66;
      run.fx.ring(this.dest, HOME_Y, 130 - 60 * p, 54, GOLD[0], GOLD[1], GOLD[2], 0.22, UNDER);
      run.fx.add(GLOW, UNDER, this.dest, HOME_Y, 0, 0, 0, 0, 0.2, 110 + 50 * p, 120 + 50 * p, GOLD[0] * 0.5, GOLD[1] * 0.5, GOLD[2] * 0.5, 0.8);
      run.fx.light(this.dest, HOME_Y - 40, 40, 200, 1.6, 1.1, 0.3, 0.12);
    }
    if (this.t <= 0) {
      // gone: step to the new place and fade back in with a golden flash
      this.fade = 0;
      E.x[i] = this.dest;
      E.y[i] = HOME_Y;
      E.px[i] = E.x[i];
      E.py[i] = E.y[i];
      this.vx = 0;
      this.tx = this.dest;
      this.state = 'tp_in';
      this.u = 0;
      this.t = 0.32;
      this.glow = 1;
      const x = E.x[i];
      const y = E.y[i] - 200;
      run.fx.flash(x, y, 40, 340, HOT_GOLD[0], HOT_GOLD[1], HOT_GOLD[2], 0.3);
      run.fx.ring(x, E.y[i], 20, 260, GOLD[0], GOLD[1], GOLD[2], 0.45);
      run.fx.sparks(x, y, 30, 20, GOLD[0], GOLD[1], GOLD[2], 460, 0, -1, TAU);
      run.fx.light(x, y, 70, 520, 3, 2.2, 0.8, 0.45);
      run.shake(0.2);
    }
  }

  // ---------------------------------------------------------------- nova: a ring of orbs with a gap

  startNova(ph) {
    const run = this.run;
    const E = run.enemies;
    const i = this.i;
    const hero = run.hero;
    this.lastAttack = 'nova';
    this.state = 'nova';
    this.u = 0;
    this.tick = 0;
    this.wind = ph === 2 ? 0.95 : 0.85; // the lane is up for at least this long before the ring leaves
    this.rings = ph === 3 ? 2 : 1;
    this.nextRing = this.wind;
    this.t = this.wind + (ph === 3 ? 0.85 : 0) + 0.6;
    // the gap: a lane that starts a little to one side of the hero and stays where it is, so he can walk into it
    const W = ARENA.w;
    let side = chance(0.5) ? 1 : -1;
    let gx = hero.x + side * rand(150, 250) * FIELD.r;
    if (gx < 70 || gx > W - 70) {
      side = -side;
      gx = hero.x + side * rand(150, 250) * FIELD.r;
    }
    this.gapX = clamp(gx, 70, W - 70);
    const cx = E.x[i] + this.core[0];
    const cy = E.y[i] + this.core[1];
    this.gapA = Math.atan2(hero.y - cy, this.gapX - cx);
    const dist = Math.hypot(this.gapX - cx, hero.y - cy);
    this.gapHalf = Math.max(0.17, Math.atan(88 / dist)) * (ph === 3 ? 0.92 : 1);
    run.sound.demonCast?.();
  }

  updateNova(dt, ph) {
    const run = this.run;
    const E = run.enemies;
    const i = this.i;
    this.stand(dt);
    const cx = E.x[i] + this.core[0];
    const cy = E.y[i] + this.core[1];
    const u = this.u;
    if (u < this.wind) {
      this.glowT = 0.4 + 0.6 * (u / this.wind);
      this.tick -= dt;
      if (this.tick <= 0) {
        this.tick += 0.1;
        const p = u / this.wind;
        // light gathers into the chest, and a pale lane marks where the gap will be
        run.fx.ring(cx, cy, 170 - 90 * p, 24, GOLD[0], GOLD[1], GOLD[2], 0.25);
        run.fx.sparks(cx, cy, 0, 2, GOLD[0], GOLD[1], GOLD[2], 170, 0, -1, TAU);
        run.fx.light(cx, cy, 60, 200 + 200 * p, 2.2, 1.5, 0.4, 0.14);
        const dx = Math.cos(this.gapA);
        const dy = Math.sin(this.gapA);
        const len = Math.min(1700, Math.max(300, (run.hero.y + 140 - cy) / Math.max(0.2, dy)));
        const w = 7 + 5 * p;
        run.fx.beam(cx + dx * 60, cy + dy * 60, cx + dx * len, cy + dy * len, w, LANE[0], LANE[1], LANE[2], 0.16, 0);
        run.fx.ring(this.gapX, run.hero.y, 70, 50, LANE[0], LANE[1], LANE[2], 0.16, UNDER);
      }
    } else {
      this.glowT = 0.7;
    }
    if (this.rings > 0 && u >= this.nextRing) {
      this.ringOut(cx, cy, ph);
      this.rings--;
      this.nextRing += 0.85;
      if (this.rings > 0) {
        // the second ring's gap lands a little off the first, toward the middle of the field
        const W = ARENA.w;
        const toward = this.gapX < W / 2 ? 1 : -1;
        this.gapX = clamp(this.gapX + toward * rand(90, 160) * FIELD.r, 70, W - 70);
        this.gapA = Math.atan2(run.hero.y - cy, this.gapX - cx);
        const dist = Math.hypot(this.gapX - cx, run.hero.y - cy);
        this.gapHalf = Math.max(0.17, Math.atan(88 / dist)) * 0.92;
      }
    }
    if (this.t <= 0) this.toIdle();
  }

  // for the test pilot (src/bot.js): how dangerous standing at x is right now, 0..1 (a coming nova: all but its gap)
  danger(x) {
    if (this.state !== 'nova' || this.rings <= 0) return 0;
    return Math.abs(x - this.gapX) < 60 ? 0 : 1;
  }

  // the ring itself: orbs all round except the gap
  ringOut(cx, cy, ph) {
    const run = this.run;
    const n = ph === 2 ? 48 : 56;
    const sp = ph === 2 ? 175 : 195;
    const off = rnd() * (TAU / n);
    for (let s = 0; s < n; s++) {
      const a = off + (s / n) * TAU;
      let d = a - this.gapA;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (d < this.gapHalf && d > -this.gapHalf) continue;
      run.shoot(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp, 2);
    }
    run.fx.flash(cx, cy, 40, 340, HOT_GOLD[0], HOT_GOLD[1], HOT_GOLD[2], 0.25);
    run.fx.ring(cx, cy, 20, 280, GOLD[0], GOLD[1], GOLD[2], 0.5);
    run.fx.ring(cx, cy, 10, 170, HOT_GOLD[0], HOT_GOLD[1], HOT_GOLD[2], 0.3);
    run.fx.light(cx, cy, 70, 560, 3, 2.2, 0.8, 0.4);
    run.sound.demonNova?.();
    run.shake(0.5);
  }
}
