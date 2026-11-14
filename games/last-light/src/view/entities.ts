// Keeps sprites in step with the simulation: the keeper, enemies (with health bars, shields, spawn
// emergence and death fades), projectiles, motes, telegraphs and lingering hazards. Positions are
// interpolated between the last two simulation steps by `alpha`.
import Phaser from 'phaser';
import { ART_SCALE, PLAYER } from '../config';
import { lerp } from '../core/math';
import type { Enemy, Hazard, Pickup, Projectile, Telegraph } from '../sim/types';
import type { World } from '../sim/world';
import { wardTargets } from '../sim/enemies';
import { ATLAS, keeperLantern } from './textures';
import { DEPTH, ySort } from './roomView';
import type { Light } from './lighting';
import { BossView } from './bossView';

const INV = 1 / ART_SCALE;

interface EnemyView {
  e: Enemy;
  spr: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
  shield: Phaser.GameObjects.Image;
  light: Light;
  key: string;
  barShown: number;
  lastHp: number;
}

const SHADOW_W: Record<string, number> = { stalker: 26, sentinel: 18, charger: 38, warden: 18, colossus: 58, boss: 80, dummy: 16 };

export class EntityViews {
  player: { spr: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; light: Light; ghosts: Phaser.GameObjects.Image[]; ghostT: number; ward: Phaser.GameObjects.Image; pool: Phaser.GameObjects.Image };
  enemies = new Map<number, EnemyView>();
  projs = new Map<number, { img: Phaser.GameObjects.Image; core: Phaser.GameObjects.Image; light: Light }>();
  picks = new Map<number, { img: Phaser.GameObjects.Image; light: Light }>();
  hazardG: Phaser.GameObjects.Graphics;
  teleG: Phaser.GameObjects.Graphics;
  sigils = new Map<number, Phaser.GameObjects.Image>();
  wisps: { img: Phaser.GameObjects.Image; light: Light }[] = [];
  lights: Light[] = [];
  private teleLights = new Map<number, Light>();
  private hazardLights = new Map<number, Light>();
  tetherG: Phaser.GameObjects.Graphics;
  /** The final boss has its own view (src/view/bossView.ts). */
  boss: BossView;

  constructor(private scene: Phaser.Scene) {
    const s = scene;
    const spr = s.add.sprite(0, 0, 'keeper', 'down_idle_0').setScale(INV).setOrigin(0.5, ATLAS.keeper.footY / ATLAS.keeper.h);
    const shadow = s.add.image(0, 0, 'shadow').setDisplaySize(16, 6).setDepth(DEPTH.decal).setAlpha(0.8);
    const glow = s.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa040).setDisplaySize(36, 36).setAlpha(0.35).setDepth(DEPTH.glow);
    const light: Light = { x: 0, y: 0, r: 120, color: 0xff9a40, i: 0.8 };
    const pool = s.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xff8a30).setDisplaySize(150, 110).setAlpha(0.1).setDepth(DEPTH.glow);
    const ward = s.add.image(0, 0, 'ringSoft').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd27a).setDisplaySize(30, 30).setDepth(DEPTH.glow).setVisible(false);
    this.player = { spr, shadow, glow, light, ghosts: [], ghostT: 0, ward, pool };
    this.lights.push(light);
    this.hazardG = s.add.graphics().setDepth(DEPTH.telegraph);
    this.teleG = s.add.graphics().setDepth(DEPTH.telegraph + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.tetherG = s.add.graphics().setDepth(DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD);
    this.boss = new BossView(scene);
  }

  sync(w: World, a: number, t: number, dt: number) {
    this.syncPlayer(w, a, t, dt);
    this.syncEnemies(w, a, t, dt);
    this.syncProjectiles(w, a, t);
    this.syncPickups(w, a, t);
    this.syncTelegraphs(w, t);
    this.syncHazards(w, t);
    this.syncWisps(w, a);
    this.boss.sync(w, a, t, dt, this.lights); // boss
  }

  private syncPlayer(w: World, a: number, t: number, dt: number) {
    const p = w.player, v = this.player;
    const x = lerp(p.px, p.x, a), y = lerp(p.py, p.y, a);
    // Facing: 4 directions from the facing angle.
    const ang = p.facing;
    const cx = Math.cos(ang), cy = Math.sin(ang);
    let dir: 'down' | 'up' | 'side' = Math.abs(cx) > Math.abs(cy) * 0.9 ? 'side' : cy > 0 ? 'down' : 'up';
    let anim: string, frame = 0;
    switch (p.state) {
      case 'attack': anim = p.phase === 'windup' ? 'atk0' : 'atk1'; break;
      case 'dash': anim = 'dash'; break;
      case 'cast': anim = 'cast'; frame = p.st > 0.15 ? 1 : 0; dir = 'down'; break;
      case 'dead': anim = 'dead'; frame = Math.min(3, Math.floor(p.st / 0.18)); dir = 'down'; break;
      default:
        if (p.moving && Math.hypot(p.vx, p.vy) > 20) { anim = 'run'; frame = Math.floor(p.stepDist / 7) % 6; }
        else { anim = 'idle'; frame = Math.floor(t * 3.2) % 4; }
    }
    const name = `${dir}_${anim}_${frame}`;
    v.spr.setFrame(name).setPosition(x, y).setDepth(ySort(y)).setFlipX(dir === 'side' && cx < 0);
    // Hurt flicker and dash translucency.
    const inv = p.iframes > 0 && p.state !== 'dead';
    if (p.hurtFlash > 0.12) v.spr.setTintFill(0xffffff);
    else if (p.state === 'dash') v.spr.setTint(0x9ff0ff);
    else v.spr.clearTint();
    v.spr.setAlpha(p.state === 'dash' ? 0.75 : inv && Math.floor(t * 20) % 2 === 0 ? 0.45 : 1);
    v.shadow.setPosition(x, y + 0.5);
    // Lantern light at the lantern itself.
    const lo = keeperLantern.get(name) ?? { x: 4, y: -12 };
    const lx = x + (v.spr.flipX ? -lo.x : lo.x), ly = y + lo.y;
    const flick = 0.94 + Math.sin(t * 9.1) * 0.03 + Math.sin(t * 23.7) * 0.025;
    const dead = p.state === 'dead' ? Math.max(0, 1 - p.st / 1.2) : 1;
    v.light.x = lx; v.light.y = ly;
    v.light.i = (0.8 + (p.radiance >= 100 ? 0.12 : 0)) * flick * (0.25 + 0.75 * dead);
    v.pool.setPosition(lx, ly + 10).setAlpha(0.11 * flick * dead);
    v.light.r = 118 * (0.6 + 0.4 * dead);
    v.glow.setPosition(lx, ly).setAlpha(0.42 * flick * dead).setDisplaySize(30, 30);
    // Dash afterimages.
    v.ghostT -= dt;
    if (p.state === 'dash' && v.ghostT <= 0) {
      v.ghostT = 0.025;
      const g = this.scene.add.image(x, y, 'keeper', name).setScale(INV).setOrigin(0.5, ATLAS.keeper.footY / ATLAS.keeper.h)
        .setFlipX(v.spr.flipX).setTintFill(0x5fe0d0).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(ySort(y) - 1);
      v.ghosts.push(g);
    }
    for (let i = v.ghosts.length - 1; i >= 0; i--) {
      const g = v.ghosts[i];
      g.setAlpha(g.alpha - dt * 2.4);
      if (g.alpha <= 0) { g.destroy(); v.ghosts.splice(i, 1); }
    }
    v.ward.setVisible(w.run.ward > 0).setPosition(x, y - 9).setAlpha(0.5 + Math.sin(t * 6) * 0.15);
  }

  private enemyKey(e: Enemy) {
    if (e.kind === 'stalker' && e.elite) return 'stalkerElite';
    if (e.kind === 'colossus' && e.elite) return 'colossusElite';
    return e.kind;
  }

  private enemyAnim(e: Enemy, t: number): string {
    const A = ATLAS[this.enemyKey(e)]?.anims ?? {};
    const pick = (name: string, fps: number, fallback = 'idle') => {
      const n = A[name] ?? 0;
      if (!n) return `${fallback}_${Math.floor(t * 4) % (A[fallback] ?? 1)}`;
      return `${name}_${Math.floor((t + e.id * 0.37) * fps) % n}`;
    };
    const moving = Math.hypot(e.vx, e.vy) > 8;
    switch (e.kind) {
      case 'stalker':
        if (e.state === 'windup') return pick('windup', 8);
        if (e.state === 'lunge') return 'lunge_0';
        if (e.state === 'recover' || e.state === 'stunned') return 'recover_0';
        return moving ? pick('run', 12) : pick('idle', 5);
      case 'sentinel':
        if (e.state === 'aim') return pick('windup', 6);
        if (e.state === 'fire') return 'fire_0';
        return moving ? pick('run', 6) : pick('idle', 4);
      case 'charger':
        if (e.state === 'plant') return pick('windup', 10);
        if (e.state === 'charge') return pick('charge', 14);
        if (e.state === 'crashed' || e.state === 'stunned') return 'stunned_0';
        return moving ? pick('run', 8) : pick('idle', 2);
      case 'warden':
        if (e.state === 'channel') return pick('windup', 6);
        return moving ? pick('run', 8) : pick('idle', 4);
      case 'colossus':
        if (e.state === 'slamWind' || e.state === 'stompWind') return pick('windup', 3);
        if (e.state === 'recover' && e.st < 0.5) return 'slam_0';
        return moving ? pick('run', 4) : pick('idle', 2);
      default: return 'idle_0';
    }
  }

  private syncEnemies(w: World, a: number, t: number, dt: number) {
    const seen = new Set<number>();
    this.tetherG.clear();
    for (const e of w.enemies) {
      if (e.kind === 'boss') continue; // the boss has its own view
      seen.add(e.id);
      let v = this.enemies.get(e.id);
      const key = this.enemyKey(e);
      if (!v) {
        const at = ATLAS[key];
        const spr = this.scene.add.sprite(0, 0, key, 'idle_0').setScale(INV).setOrigin(0.5, at.footY / at.h);
        const shadow = this.scene.add.image(0, 0, 'shadow').setDepth(DEPTH.decal).setDisplaySize(SHADOW_W[e.kind] ?? 16, (SHADOW_W[e.kind] ?? 16) * 0.38).setAlpha(0.85);
        const bar = this.scene.add.graphics().setDepth(DEPTH.ui - 1);
        const shield = this.scene.add.image(0, 0, 'ringSoft').setBlendMode(Phaser.BlendModes.ADD).setTint(0x5fe0d0).setVisible(false).setDepth(DEPTH.glow);
        const light: Light = { x: 0, y: 0, r: 26, color: e.elite ? 0xc04090 : 0x3a5a9a, i: 0.25 };
        this.lights.push(light);
        v = { e, spr, shadow, bar, shield, light, key, barShown: 0, lastHp: e.hp };
        this.enemies.set(e.id, v);
      }
      v.e = e;
      const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a);
      v.spr.setFrame(this.enemyAnim(e, t));
      const faceLeft = Math.cos(e.face) < 0;
      v.spr.setFlipX(faceLeft);
      let alpha = 1, yo = 0;
      if (e.spawnT > 0) { const k = 1 - e.spawnT / 0.5; alpha = k; yo = (1 - k) * 6; v.spr.setTintFill(0x9f4fd0); }
      else if (e.dead) { const k = Math.min(1, e.deathT / 0.45); alpha = 1 - k; v.spr.setTintFill(k < 0.25 ? 0xffffff : 0x1a1f33); }
      else if (e.flash > 0) v.spr.setTintFill(0xffffff);
      else if (e.burn > 0 && Math.floor(t * 10) % 2 === 0) v.spr.setTint(0xffb080);
      else if (e.vulnerable > 1) v.spr.setTint(0xffe0a0);
      else v.spr.clearTint();
      // Windup shiver.
      const shiver = (e.state === 'windup' || e.state === 'plant' || e.state === 'slamWind' || e.state === 'stompWind') ? Math.sin(t * 60) * 0.5 : 0;
      v.spr.setPosition(x + shiver, y + yo).setAlpha(alpha).setDepth(ySort(y));
      v.shadow.setPosition(x, y + 0.5).setAlpha(0.85 * alpha);
      v.light.x = x; v.light.y = y - 8; v.light.i = e.dead ? 0 : 0.25;
      // Shield bubble.
      if (e.shield && !e.dead) {
        const h = ATLAS[key].h * 0.8;
        v.shield.setVisible(true).setPosition(x, y - h * 0.45).setDisplaySize(h * 1.05, h * 1.05).setAlpha(0.35 + 0.25 * (e.shield.hp / e.shield.max) + Math.sin(t * 5) * 0.05);
      } else v.shield.setVisible(false);
      // Health bar: shown once hurt, near the head.
      v.bar.clear();
      if (e.hp < v.lastHp) v.barShown = 3;
      v.lastHp = e.hp;
      v.barShown -= dt;
      if (!e.dead && e.kind !== 'dummy' && (v.barShown > 0 || e.elite || e.kind === 'colossus') && e.spawnT <= 0) {
        const bw = e.kind === 'colossus' ? 36 : e.kind === 'charger' ? 24 : 20, bx = x - bw / 2, by = y - ATLAS[key].footY - 3;
        v.bar.fillStyle(0x05060b, 0.85).fillRect(bx - 1, by - 1, bw + 2, 4);
        v.bar.fillStyle(0x3a1414, 1).fillRect(bx, by, bw, 2);
        v.bar.fillStyle(e.elite ? 0xe04bb0 : 0xd8402f, 1).fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 2);
        if (e.shield) v.bar.fillStyle(0x7ff0e0, 1).fillRect(bx, by - 2, bw * (e.shield.hp / e.shield.max), 1);
      }
      // Warden tethers while channelling.
      if (e.kind === 'warden' && e.state === 'channel' && !e.dead) {
        const k = Math.min(1, e.st / 0.9);
        for (const o of wardTargets(w, e)) {
          this.tetherG.lineStyle(1.2, 0x5fe0d0, 0.3 + 0.6 * k);
          this.tetherG.lineBetween(x, y - 14, lerp(o.px, o.x, a), lerp(o.py, o.y, a) - o.r - 4);
        }
      }
    }
    for (const [id, v] of this.enemies) {
      if (seen.has(id)) continue;
      v.spr.destroy(); v.shadow.destroy(); v.bar.destroy(); v.shield.destroy();
      v.light.i = 0;
      this.lights.splice(this.lights.indexOf(v.light), 1);
      this.enemies.delete(id);
    }
  }

  private syncProjectiles(w: World, a: number, t: number) {
    const seen = new Set<number>();
    for (const p of w.projectiles) {
      seen.add(p.id);
      let v = this.projs.get(p.id);
      if (!v) v = this.makeProj(p);
      const x = lerp(p.px, p.x, a), y = lerp(p.py, p.y, a);
      const ang = Math.atan2(p.vy, p.vx);
      v.img.setPosition(x, y).setRotation(ang);
      v.core.setPosition(x, y).setRotation(ang);
      if (p.kind === 'orb' || p.kind === 'bossOrb') {
        const pulse = 1 + Math.sin(t * 20 + p.id) * 0.12;
        v.img.setDisplaySize(p.r * 6 * pulse, p.r * 6 * pulse);
      }
      v.light.x = x; v.light.y = y;
    }
    for (const [id, v] of this.projs) {
      if (seen.has(id)) continue;
      v.img.destroy(); v.core.destroy();
      this.lights.splice(this.lights.indexOf(v.light), 1);
      this.projs.delete(id);
    }
  }

  private makeProj(p: Projectile) {
    const s = this.scene;
    let img: Phaser.GameObjects.Image, core: Phaser.GameObjects.Image, light: Light;
    if (p.team === 'enemy') {
      const col = p.kind === 'bossOrb' ? 0xff5ac8 : 0xe04bb0;
      img = s.add.image(0, 0, 'glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(p.r * 6, p.r * 6).setDepth(DEPTH.glow);
      // A dark rim around the bright core keeps enemy shots readable on bright ground.
      core = s.add.image(0, 0, 'orb').setTint(0xffd6f2).setDisplaySize(p.r * 2.6, p.r * 2.6).setDepth(DEPTH.fx);
      light = { x: 0, y: 0, r: 34, color: col, i: 0.7 };
    } else if (p.kind === 'shard') {
      img = s.add.image(0, 0, 'streak').setTint(0xffc860).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(12, 4).setDepth(DEPTH.fx);
      core = s.add.image(0, 0, 'px').setTint(0xffffff).setScale(INV).setDepth(DEPTH.fx);
      light = { x: 0, y: 0, r: 18, color: 0xffb040, i: 0.5 };
    } else if (p.kind === 'lance') {
      const crescent = p.r >= 8;
      img = s.add.image(0, 0, crescent ? 'slash' : 'streak').setTint(0xffc860).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx);
      if (crescent) img.setDisplaySize(34, 34); else img.setDisplaySize(26, 7);
      core = s.add.image(0, 0, 'streak').setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(crescent ? 2 : 16, crescent ? 2 : 3).setDepth(DEPTH.fx);
      light = { x: 0, y: 0, r: 46, color: 0xffb040, i: 0.8 };
    } else {
      img = s.add.image(0, 0, 'streak').setTint(0xffb040).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(18, 5).setDepth(DEPTH.fx);
      core = s.add.image(0, 0, 'streak').setTint(0xfff4d0).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(10, 2).setDepth(DEPTH.fx);
      light = { x: 0, y: 0, r: 30, color: 0xffa040, i: 0.6 };
    }
    this.lights.push(light);
    const v = { img, core, light };
    this.projs.set(p.id, v);
    return v;
  }

  private syncPickups(w: World, a: number, t: number) {
    const seen = new Set<number>();
    for (const p of w.pickups) {
      seen.add(p.id);
      let v = this.picks.get(p.id);
      if (!v) v = this.makePick(p);
      const x = lerp(p.px, p.x, a), y = lerp(p.py, p.y, a) - 3 + Math.sin(t * 5 + p.id) * 1.2;
      const s = 1 + Math.sin(t * 9 + p.id * 2) * 0.15;
      v.img.setPosition(x, y).setScale((p.kind === 'heart' ? 0.7 : 0.42) * s).setRotation(t * 0.8 + p.id);
      v.light.x = x; v.light.y = y;
    }
    for (const [id, v] of this.picks) {
      if (seen.has(id)) continue;
      v.img.destroy();
      this.lights.splice(this.lights.indexOf(v.light), 1);
      this.picks.delete(id);
    }
  }

  private makePick(p: Pickup) {
    const col = p.kind === 'heart' ? 0xff6a6a : 0xffc860;
    const img = this.scene.add.image(0, 0, 'mote').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx);
    const light: Light = { x: 0, y: 0, r: p.kind === 'heart' ? 30 : 16, color: col, i: 0.45 };
    this.lights.push(light);
    const v = { img, light };
    this.picks.set(p.id, v);
    return v;
  }

  private syncTelegraphs(w: World, t: number) {
    const g = this.teleG;
    g.clear();
    const seen = new Set<number>();
    for (const tg of w.telegraphs) {
      seen.add(tg.id);
      const k = Math.min(1, tg.t / tg.dur);
      const hot = k > 0.8;
      const col = tg.kind === 'spawn' ? 0xb04ae0 : hot ? 0xffd0a0 : tg.boss ? 0xff8a3a : 0xff4a3d;
      const pulse = 0.75 + Math.sin(t * (hot ? 40 : 14)) * 0.25;
      let lx = tg.x, ly = tg.y, lr = 30;
      switch (tg.kind) {
        case 'circle': case 'ring': {
          g.fillStyle(col, 0.12 + 0.12 * k);
          g.fillCircle(tg.x, tg.y, tg.r);
          g.fillStyle(col, 0.35 * pulse);
          g.fillCircle(tg.x, tg.y, tg.r * k); // fills inward-out: when full, it lands
          g.lineStyle(1.5, col, 0.9);
          g.strokeCircle(tg.x, tg.y, tg.r);
          // Rune ticks around the edge (shape, not only colour).
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + t * 0.6;
            g.lineBetween(tg.x + Math.cos(a) * (tg.r - 3), tg.y + Math.sin(a) * (tg.r - 3), tg.x + Math.cos(a) * (tg.r + 2), tg.y + Math.sin(a) * (tg.r + 2));
          }
          lr = tg.r * 1.4;
          break;
        }
        case 'lane': {
          const c = Math.cos(tg.ang), s = Math.sin(tg.ang);
          const hw = tg.r / 2;
          const quad = (l0: number, l1: number) => [
            tg.x + c * l0 - s * hw, tg.y + s * l0 + c * hw, tg.x + c * l1 - s * hw, tg.y + s * l1 + c * hw,
            tg.x + c * l1 + s * hw, tg.y + s * l1 - c * hw, tg.x + c * l0 + s * hw, tg.y + s * l0 - c * hw,
          ];
          const q = quad(0, tg.len);
          g.fillStyle(col, 0.12);
          g.fillPoints(pts(q), true);
          const q2 = quad(0, tg.len * k);
          g.fillStyle(col, 0.3 * pulse);
          g.fillPoints(pts(q2), true);
          g.lineStyle(1.2, col, 0.9);
          g.strokePoints(pts(q), true);
          // Chevrons pointing along the charge.
          for (let d = 12; d < tg.len - 4; d += 14) {
            const mx = tg.x + c * d, my = tg.y + s * d;
            g.lineBetween(mx - c * 4 - s * hw * 0.6, my - s * 4 + c * hw * 0.6, mx, my);
            g.lineBetween(mx - c * 4 + s * hw * 0.6, my - s * 4 - c * hw * 0.6, mx, my);
          }
          lx = tg.x + c * tg.len * 0.5; ly = tg.y + s * tg.len * 0.5; lr = tg.len * 0.6;
          break;
        }
        case 'cone': {
          const half = tg.len;
          g.fillStyle(col, 0.14 + 0.2 * k);
          g.slice(tg.x, tg.y, tg.r, tg.ang - half, tg.ang + half, false);
          g.fillPath();
          g.lineStyle(1.2, col, 0.85 * pulse);
          g.beginPath();
          g.arc(tg.x, tg.y, tg.r * (0.5 + 0.5 * k), tg.ang - half, tg.ang + half, false);
          g.strokePath();
          lr = tg.r;
          break;
        }
        case 'line': {
          const c = Math.cos(tg.ang), s = Math.sin(tg.ang);
          const wdt = hot ? 2.5 : 1;
          // Dashed aim line.
          g.lineStyle(wdt, col, 0.5 + 0.4 * k);
          for (let d = 0; d < tg.len; d += 8) {
            const d1 = Math.min(tg.len, d + 5);
            g.lineBetween(tg.x + c * d, tg.y + s * d, tg.x + c * d1, tg.y + s * d1);
          }
          lr = 18;
          break;
        }
        case 'spawn': {
          let img = this.sigils.get(tg.id);
          if (!img) {
            img = this.scene.add.image(tg.x, tg.y, 'sigil').setBlendMode(Phaser.BlendModes.ADD).setTint(0xc060ff).setDepth(DEPTH.telegraph);
            this.sigils.set(tg.id, img);
          }
          img.setPosition(tg.x, tg.y).setDisplaySize(tg.r * 2.6 * (0.6 + 0.4 * k), tg.r * 2.6 * 0.55 * (0.6 + 0.4 * k)).setRotation(0).setAlpha(0.4 + 0.5 * k);
          lr = tg.r * 2.5;
          break;
        }
      }
      let L = this.teleLights.get(tg.id);
      if (!L) { L = { x: lx, y: ly, r: lr, color: col, i: 0 }; this.teleLights.set(tg.id, L); this.lights.push(L); }
      L.x = lx; L.y = ly; L.r = lr; L.color = col; L.i = 0.25 + 0.45 * k;
    }
    for (const [id, img] of this.sigils) if (!seen.has(id)) { img.destroy(); this.sigils.delete(id); }
    for (const [id, L] of this.teleLights) if (!seen.has(id)) { this.lights.splice(this.lights.indexOf(L), 1); this.teleLights.delete(id); }
  }

  private syncHazards(w: World, t: number) {
    const g = this.hazardG;
    g.clear();
    const seen = new Set<number>();
    for (const h of w.hazards) {
      if (h.t < h.delay) continue;
      seen.add(h.id);
      const k = (h.t - h.delay) / h.dur;
      let L = this.hazardLights.get(h.id);
      if (!L) { L = { x: h.x, y: h.y, r: h.r * 2, color: h.team === 'enemy' ? 0xc0408a : 0xff8a30, i: 0 }; this.hazardLights.set(h.id, L); this.lights.push(L); }
      L.x = h.x; L.y = h.y;
      if (h.kind === 'pool') {
        const a = Math.min(1, (1 - k) * 4) * (0.8 + Math.sin(t * 7 + h.id) * 0.2);
        g.fillStyle(0x7a1f62, 0.45 * a); g.fillCircle(h.x, h.y, h.r);
        g.fillStyle(0xe04bb0, 0.25 * a); g.fillCircle(h.x, h.y, h.r * 0.7);
        g.lineStyle(1, 0xff9be0, 0.6 * a); g.strokeCircle(h.x, h.y, h.r);
        L.i = 0.5 * a; L.r = h.r * 2.2;
      } else if (h.kind === 'fire') {
        L.i = 0.35 * (1 - k); L.r = h.r * 2.5;
      } else L.i = 0;
    }
    for (const [id, L] of this.hazardLights) if (!seen.has(id)) { this.lights.splice(this.lights.indexOf(L), 1); this.hazardLights.delete(id); }
  }

  private syncWisps(w: World, _a: number) {
    const pos = w.wispPositions();
    while (this.wisps.length < pos.length) {
      const img = this.scene.add.image(0, 0, 'glow').setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(12, 12).setDepth(DEPTH.fx);
      const light: Light = { x: 0, y: 0, r: 36, color: 0xffc060, i: 0.6 };
      this.lights.push(light);
      this.wisps.push({ img, light });
    }
    this.wisps.forEach((v, i) => {
      const p = pos[i];
      v.img.setVisible(!!p);
      v.light.i = p ? 0.6 : 0;
      if (p) { v.img.setPosition(p.x, p.y); v.light.x = p.x; v.light.y = p.y; }
    });
  }

  /** Remove everything that belongs to a room (keeps the keeper). */
  clearRoom() {
    this.boss.clear(); // boss
    for (const [, v] of this.enemies) { v.spr.destroy(); v.shadow.destroy(); v.bar.destroy(); v.shield.destroy(); }
    this.enemies.clear();
    for (const [, v] of this.projs) { v.img.destroy(); v.core.destroy(); }
    this.projs.clear();
    for (const [, v] of this.picks) v.img.destroy();
    this.picks.clear();
    for (const [, img] of this.sigils) img.destroy();
    this.sigils.clear();
    this.teleLights.clear();
    this.hazardLights.clear();
    this.lights = [this.player.light, ...this.wisps.map((w) => w.light)];
    this.hazardG.clear(); this.teleG.clear(); this.tetherG.clear();
  }

  destroy() {
    this.clearRoom();
    this.boss.destroy(); // boss
    const p = this.player;
    p.spr.destroy(); p.shadow.destroy(); p.glow.destroy(); p.ward.destroy(); p.pool.destroy();
    for (const g of p.ghosts) g.destroy();
    for (const v of this.wisps) v.img.destroy();
    this.wisps = [];
    this.hazardG.destroy(); this.teleG.destroy(); this.tetherG.destroy();
  }
}

function pts(a: number[]) {
  const out: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < a.length; i += 2) out.push({ x: a[i], y: a[i + 1] });
  return out;
}

export type { Hazard, Telegraph };
export const PLAYER_HURT_R = PLAYER.hurtRadius;
