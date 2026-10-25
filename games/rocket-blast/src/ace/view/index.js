// AceView: draws the Ace Pilot sim state with three.js. It reads S every
// frame (sync) and never changes it; the controller forwards sim events to
// onEvent for explosions, sparks and flashes.
//
//   new AceView({ scene, glow, smoke, noise, atlas, quality })
//     glow / smoke are the app's shared SpriteBatches (additive / alpha)
//   sync(S, dt, t)    create / move / hide models for S (dt 0 while paused)
//   onEvent(ev, S)    effects for one sim event
//   setVisible(on), clear(), dispose()
//
// Pieces: fighter.js (the player's ship, shield, drones), enemies.js (all
// enemy types, instanced), bosses.js (the five bosses and their parts),
// pickups.js, fx.js (explosions, debris, rings), bolts.js (one batched quad
// shader for bullets, shots, beams, telegraphs, shield arcs and glows) and
// kit.js (materials, geometry builder, palette).
//
// Beam telegraphs come from S.teles (every live one); enemy/part .tele lines
// of kind 'beam' are skipped there, other teles (diver dive, jaw drop) are
// drawn by their owners. Boss parts sit at the sim's world p.x, p.y.
//
// Draw order: models (opaque, lit) < smoke (app, 4) < glow sprites (app, 20)
// < `under` bolts (22: player shots, engine glows, telegraphs, rings) <
// `over` bolts (40: enemy bullets and beams, always on top so they read).
import * as THREE from 'three';
import { Bolts, SHAPE } from './bolts.js';
import { Fighter } from './fighter.js';
import { EnemyLayer, enemyColor } from './enemies.js';
import { BossView, lightning } from './bosses.js';
import { Pickups } from './pickups.js';
import { AceFX } from './fx.js';
import { colorOf } from './kit.js';


// player shots by kind: [shape, half length, radius, r, g, b]
const SHOT = {
  cannon: [SHAPE.BOLT, 0.3, 0.045, 0.2, 0.85, 1.6],
  pierce: [SHAPE.BOLT, 0.42, 0.06, 0.8, 0.4, 1.8],
  spread: [SHAPE.BOLT, 0.2, 0.045, 0.25, 1.2, 1.2],
  drone: [SHAPE.BOLT, 0.18, 0.04, 0.45, 0.9, 1.5],
  missile: [SHAPE.MISSILE, 0.22, 0.08, 1.0, 0.45, 0.15],
};
const FIRE_COLOR = { orb: 'magenta', needle: 'orange', ball: 'red', beam: 'red', dive: 'red' };

export class AceView {
  constructor({ scene, glow, smoke, noise, atlas, quality }) {
    this.scene = scene;
    this.glow = glow;
    this.smoke = smoke;
    this.atlas = atlas;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'ace-view';
    scene.add(this.group);
    this.under = new Bolts({ capacity: 1400, renderOrder: 22, z: 0.5 });
    this.over = new Bolts({ capacity: 1100, renderOrder: 40, z: 1.0 });
    this.group.add(this.under.mesh, this.over.mesh);
    this.fighter = new Fighter({ noise });
    this.fighter.attach(this.group);
    this.enemies = new EnemyLayer(this.group);
    this.boss = new BossView(this.group);
    this.pickups = new Pickups(this.group);
    this.fx = new AceFX({ group: this.group, glow, smoke, quality });
    this.missileT = 0;
    this.time = 0;
  }

  sync(S, dt, t) {
    if (!S) return;
    this.time = t;
    const under = this.under;
    const over = this.over;
    under.begin(t);
    over.begin(t);
    this.fighter.update(S.player, dt, t, under);
    this.enemies.update(S.enemies || [], t, under);
    this.boss.update(S, dt, t, under, this.fx);
    this.pickups.update(S.pickups, t, under);
    this.teles(S.teles || [], under);
    this.shots(S.shots || [], dt, under);
    this.bullets(S.bullets || [], over);
    this.fx.update(dt, t, under);
    under.end();
    over.end();
  }

  // every live beam telegraph (S.teles): a faint corridor of the beam's width
  // and a dashed line that turns solid and pulses just before it fires
  teles(list, bolts) {
    for (let i = 0; i < list.length; i++) {
      const tl = list[i];
      const k = Math.max(0, Math.min(1, tl.k ?? 0));
      const w = tl.w || 0.3;
      bolts.ray(SHAPE.BEAM, tl.x0, tl.y0, tl.x1, tl.y1, w * 2, w * (0.4 + 0.6 * k), 0.05 + 0.12 * k, 1.2, 0.15, 0.12);
      bolts.ray(SHAPE.LINE, tl.x0, tl.y0, tl.x1, tl.y1, 0.14, k, 0.03, 1.0, 0.1, 0.12);
      bolts.glow(tl.x0, tl.y0, 0.4 + 0.9 * k, 0.9 * k, 0.12 * k, 0.1 * k);
    }
  }

  shots(list, dt, bolts) {
    this.missileT += dt;
    const trail = this.missileT > 0.03;
    if (trail) this.missileT = 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const d = SHOT[s.kind] || SHOT.cannon;
      const a = Math.atan2(s.vy || 1, s.vx || 0);
      bolts.push(d[0], s.x, s.y, a, d[1] + d[2] * 3, d[2] * 3, d[1], d[2], d[3], d[4], d[5], 0);
      if (s.kind === 'missile') {
        bolts.glow(s.x - Math.cos(a) * 0.3, s.y - Math.sin(a) * 0.3, 0.35, 1.2, 0.5, 0.15);
        if (trail && dt > 0) this.smoke.add({ x: s.x - Math.cos(a) * 0.35, y: s.y - Math.sin(a) * 0.35, z: -0.1, size: 0.22, grow: 2.2, life: 0.6, rot: s.x * 7, frame: 4, r: 0.55, g: 0.55, b: 0.58, a: 0.45 });
      }
    }
  }

  bullets(list, bolts) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const [r, g, bb] = colorOf(b.color);
      const R = b.r || 0.2;
      if (b.kind === 'needle') {
        const a = Math.atan2(b.vy, b.vx);
        const half = R * 1.6;
        bolts.push(SHAPE.NEEDLE, b.x, b.y, a, half + R * 2.6, R * 2.6, half, R, r, g, bb, 0);
      } else if (b.kind === 'ball') {
        bolts.push(SHAPE.BALL, b.x, b.y, 0, R * 2.8, R * 2.8, R * 1.05, b.id || i, r, g, bb, 0);
      } else if (b.kind === 'beam' && b.link) {
        // a standing lightning link between two parts
        lightning(bolts, b.x, b.y, b.x1, b.y1, this.time, i, R * 0.5);
      } else if (b.kind === 'beam') {
        const life = b.life || 0.35;
        const k = (b.t || 0) / life;
        const s = Math.min(1, (b.t || 0) / 0.04) * (k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1);
        const w = R * (0.7 + 0.5 * s);
        bolts.ray(SHAPE.BEAM, b.x, b.y, b.x1 ?? b.x, b.y1 ?? b.y - 30, w * 3, w, s, r, g, bb);
        bolts.glow(b.x, b.y, 1.4 * s + 0.3, r, g, bb);
      } else {
        bolts.push(SHAPE.ORB, b.x, b.y, 0, R * 2.6, R * 2.6, R * 1.1, 0, r, g, bb, 0);
      }
    }
  }

  onEvent(ev, S) {
    const fx = this.fx;
    const x = ev.x ?? 0;
    const y = ev.y ?? 0;
    switch (ev.type) {
      case 'fire':
        if (ev.kind === 'missile') fx.muzzle(x, y, [1, 0.5, 0.2], 0.5);
        else fx.muzzle(x, y + 0.1, [0.3, 0.85, 1], 0.55);
        break;
      case 'enemyFire':
        if (ev.enemy === 'boss') this.boss.partFired(x, y);
        fx.muzzle(x, y, colorOf(ev.color || FIRE_COLOR[ev.kind] || 'magenta'), ev.kind === 'beam' ? 1.6 : 0.8);
        break;
      case 'hit':
        if (ev.blocked) fx.sparks(x, y, 5, 5, 2.4, 2.0, 1.6, 0.07); // deflected off armour or a shield
        else fx.hitSpark(x, y);
        break;
      case 'shieldBreak':
        // a bulwark's energy shield shatters
        fx.ring(x, y, 0.6, 2.6, 0.35, [0.5, 1.3, 1.9], 0.07);
        fx.sparks(x, y, 18, 7, 0.6, 1.6, 2.4, 0.09);
        fx.flash(x, y, 2.4, 0.8, 1.8, 2.6, 0.16);
        break;
      case 'upgrade':
        if (S && S.player) {
          fx.ring(S.player.x, S.player.y, 0.5, 2.4, 0.45, [1.6, 1.3, 0.5], 0.07);
          fx.sparks(S.player.x, S.player.y, 14, 4, 2, 1.6, 0.6, 0.08);
        }
        break;
      case 'kill': {
        const size = { gunship: 0.9, bulwark: 1, minelayer: 0.85, splitter: 0.8, turret: 0.8, sniper: 0.6, diver: 0.55, dart: 0.5, mine: 0.4, shard: 0.35 }[ev.enemy] ?? 0.6;
        fx.explode(x, y, size, enemyColor(ev.enemy), !!ev.big);
        if (ev.how === 'emp') fx.sparks(x, y, 6, 6, 0.8, 2.2, 3, 0.1);
        break;
      }
      case 'partDestroyed':
        fx.explode(x, y, 1.2, colorOf(ev.color || 'orange'), true);
        fx.scrap(x, y, 8, 8, 0.35, 1.2);
        break;
      case 'playerHit':
        fx.sparks(x, y, 22, 9, 4, 1.6, 0.6, 0.13);
        fx.flash(x, y, 3, 3.5, 1, 0.8, 0.18);
        fx.scrap(x, y, 5, 5, 0.12, 1);
        fx.ring(x, y, 0.4, 2.2, 0.3, [2.4, 0.6, 0.5], 0.06);
        break;
      case 'shieldHit':
        this.fighter.hitShield();
        fx.shieldPop(x, y);
        break;
      case 'shieldUp':
        fx.ring(x, y, 1.6, 0.9, 0.3, [0.4, 1.2, 1.8], 0.05);
        break;
      case 'dash':
        fx.ring(x, y, 0.5, 1.6, 0.25, [0.4, 1.0, 1.6], 0.05);
        break;
      case 'graze':
        fx.graze(x, y);
        break;
      case 'pickup':
        fx.pickup(x, y, this.pickups.colorOf(ev.kind));
        break;
      case 'emp':
        fx.emp(x, y, S && S.field ? Math.hypot(S.field.halfW, S.field.halfH) * 2.1 : 34);
        break;
      case 'spawn':
        if (S && S.field && y < S.field.halfH - 0.5) fx.spawn(x, y, enemyColor(ev.enemy));
        break;
      case 'telegraph':
        if (ev.kind === 'mine') fx.ring(x, y, 0.3, 2.2, 0.35, [1.6, 0.25, 0.2], 0.04);
        else if (ev.kind === 'diver') fx.ring(x, y, 1.4, 0.4, 0.3, [1.8, 0.3, 0.2], 0.04);
        else if (ev.boss) fx.ring(x, y, 2.4, 0.6, 0.45, [1.8, 0.4, 0.25], 0.06);
        break;
      case 'slam':
        // a jaw hits the bottom of its stroke
        fx.sparks(x, y - 0.8, 18, 9, 4, 2.2, 0.7, 0.13, Math.PI / 2, 1.4);
        fx.smokePuffs(x, y - 0.8, 1.2, 5, 0.16);
        fx.ring(x, y - 0.8, 0.5, 3.2, 0.35, [1.8, 1.1, 0.6], 0.07);
        break;
      case 'bossPhase':
        if (S && S.boss) {
          fx.flash(S.boss.x, S.boss.y, 12, 2, 1.6, 1.2, 0.25);
          fx.ring(S.boss.x, S.boss.y, 1, 10, 0.6, [2, 1.4, 0.9], 0.15);
        }
        break;
      case 'bossDead': {
        const B = S && S.boss;
        const [w, h] = this.boss.size();
        fx.bossDeath(B ? B.x : x, B ? B.y : y, w, h);
        this.boss.die();
        break;
      }
      case 'dead':
        fx.playerDead(x, y);
        break;
    }
  }

  setVisible(on) {
    this.group.visible = on;
  }

  clear() {
    this.fx.clear();
    this.boss.clear();
    this.enemies.clear();
    this.pickups.update([], 0, null);
    this.under.begin(0);
    this.under.end();
    this.over.begin(0);
    this.over.end();
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
    this.enemies.dispose();
    this.fx.dispose();
    this.under.dispose();
    this.over.dispose();
  }
}
