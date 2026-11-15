// The Choked Star's view: its sprite (state -> animation), the star's glows and lights, the boss-only
// hazards (sweeping beams, nova rings with their safe opening, root spikes, falling stars), dressing on
// its ground telegraphs (rune sigils with diamond marks), the phase-2 thorn walls, and the big moments
// (vent, phase change, death) as particles through the shared Fx pool. It reads the simulation only:
// state changes are detected by watching the boss brain, not through fx events.
import Phaser from 'phaser';
import { TILE } from '../config';
import { lerp } from '../core/math';
import type { Enemy, Hazard, Telegraph } from '../sim/types';
import type { World } from '../sim/world';
import { BOSS_DEATH_T } from '../sim/world';
import { getBossBrain, type BossBrain } from '../sim/boss';
import { BOSS_CORE } from '../art/boss';
import { ATLAS } from './textures';
import { DEPTH, ySort } from './roomView';
import type { Light } from './lighting';
import type { Fx } from './fx';

const AMBER = 0xffb347, WARM = 0xffd98a, HOT = 0xfff1c8, MAGENTA = 0xe04bb0, MAGENTA_L = 0xff9be0;

interface Body {
  id: number;
  spr: Phaser.GameObjects.Sprite;
  emit: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  ground: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  hot: Phaser.GameObjects.Image;
  corrupt: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  coreL: Light;
  magL: Light;
  groundL: Light;
  mode: string;
  phase: number;
  ventPulse: number;
  dieT: number;
  burst: boolean;
}

/** Loose view of the scene for the shared effects pool and the HUD flash (avoids an import cycle). */
type SceneBits = { fx?: Fx; hud?: { flash(s: number): void } | null; settings?: { flashes?: boolean } };

export class BossView {
  private body: Body | null = null;
  private beamG: Phaser.GameObjects.Graphics;
  private groundG: Phaser.GameObjects.Graphics;
  private thorns = new Map<number, Phaser.GameObjects.Sprite>();
  private sigils = new Map<number, Phaser.GameObjects.Image>();
  private streaks = new Map<number, Phaser.GameObjects.Image>();
  private walls: Phaser.GameObjects.Sprite[] = [];
  private seenHaz = new Set<number>();
  private beamLights = new Map<number, Light[]>();
  private sparkT = 0;
  lights: Light[] = [];

  constructor(private scene: Phaser.Scene) {
    this.beamG = scene.add.graphics().setDepth(DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD);
    this.groundG = scene.add.graphics().setDepth(DEPTH.telegraph + 2).setBlendMode(Phaser.BlendModes.ADD);
  }

  private get fx() { return (this.scene as unknown as SceneBits).fx; }

  sync(w: World, a: number, t: number, dt: number, out: Light[]) {
    const e = w.enemies.find((o) => o.kind === 'boss');
    const brain = e ? getBossBrain(e) : undefined;
    if (e && brain) this.syncBody(e, brain, a, t, dt);
    else if (this.body) this.dropBody();
    this.syncHazards(w, brain, t, dt);
    this.syncTelegraphs(w, t);
    this.syncWalls(brain);
    for (const L of this.lights) if (!out.includes(L)) out.push(L);
    for (let i = out.length - 1; i >= 0; i--) if ((out[i] as Light & { boss?: boolean }).boss && !this.lights.includes(out[i])) out.splice(i, 1);
  }

  private light(x: number, y: number, r: number, color: number, i: number): Light {
    const L = { x, y, r, color, i, boss: true } as Light & { boss: boolean };
    this.lights.push(L);
    return L;
  }
  private unlight(L: Light) { const i = this.lights.indexOf(L); if (i >= 0) this.lights.splice(i, 1); }

  // ---- the boss itself ----------------------------------------------------------------------------

  private syncBody(e: Enemy, b: BossBrain, a: number, t: number, dt: number) {
    const s = this.scene;
    if (this.body && this.body.id !== e.id) this.dropBody();
    if (!this.body) {
      const at = ATLAS.boss;
      const add = (key: string, tint: number) => s.add.image(0, 0, key).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setDepth(DEPTH.glow);
      this.body = {
        id: e.id,
        spr: s.add.sprite(0, 0, 'boss', 'idle_0').setScale(1 / at.d).setOrigin(0.5, at.footY / at.h),
        emit: s.add.sprite(0, 0, 'boss_e', 'idle_0').setScale(1 / at.de).setOrigin(0.5, at.footY / at.h).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow),
        shadow: s.add.image(0, 0, 'shadow').setDepth(DEPTH.decal).setAlpha(0.9),
        ground: add('glow', 0xff8a30),
        halo: add('glow', AMBER),
        hot: add('glow', HOT),
        corrupt: add('glow', MAGENTA).setVisible(false),
        ring: add('ringSoft', WARM).setVisible(false),
        coreL: this.light(0, 0, 200, 0xffa04a, 0.8),
        magL: this.light(0, 0, 150, MAGENTA, 0),
        groundL: this.light(0, 0, 90, 0xff8a30, 0.6),
        mode: b.mode, phase: b.phase, ventPulse: 0, dieT: 0, burst: false,
      };
    }
    const v = this.body;
    const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a);
    const p2 = b.phase === 2 || b.mode === 'transition';
    const sfx = b.phase === 2 ? '2' : '';
    const A = ATLAS.boss.anims;
    const pick = (name: string, fps: number) => `${name}_${Math.floor(t * fps) % (A[name] ?? 1)}`;

    // State -> animation.
    let frame: string;
    const windup = b.mode === 'attack' && b.clock < b.windupUntil;
    if (b.mode === 'dying') frame = `dying_${Math.min(7, Math.floor((e.deathT / (BOSS_DEATH_T * 0.92)) * 8))}`;
    else if (b.mode === 'transition') frame = pick('roar', 9);
    else if (b.mode === 'vent') frame = pick('vent' + sfx, 6);
    else if (e.flash > 0.085) frame = `hurt${sfx}_0`;
    else if (b.charge || windup) frame = pick('windup' + sfx, b.charge ? 14 : 9);
    else if (b.mode === 'attack') frame = pick('cast' + sfx, 8);
    else frame = pick('idle' + sfx, 6);
    v.spr.setFrame(frame);

    // Emergence, hit flash, death fade.
    let alpha = 1;
    if (e.spawnT > 0) alpha = 1 - e.spawnT / 0.6;
    if (b.mode === 'dying' && e.deathT > 2.25) alpha = Math.max(0, 1 - (e.deathT - 2.25) / 0.3);
    if (e.flash > 0.07 && b.mode !== 'dying') v.spr.setTintFill(0xfff4dc);
    else if (b.mode === 'transition' && Math.floor(t * 14) % 2 === 0) v.spr.setTint(0xffc0ec);
    else v.spr.clearTint();
    const shiver = windup || b.mode === 'transition' ? Math.sin(t * 55) * 0.6 : b.mode === 'dying' ? Math.sin(t * 70) * 1.2 * (1 - e.deathT / BOSS_DEATH_T) : 0;
    v.spr.setPosition(x + shiver, y).setAlpha(alpha).setDepth(ySort(y));
    v.emit.setFrame(frame).setPosition(x + shiver, y).setAlpha(alpha).setVisible(!(e.flash > 0.07 && b.mode !== 'dying'));
    v.shadow.setPosition(x, y + 1).setDisplaySize(92, 30).setAlpha(0.8 * alpha);

    // The star's glow and light: breathing, brighter when winding up or venting, magenta in phase 2.
    const cx = x + BOSS_CORE.x, cy = y + BOSS_CORE.y + (b.mode === 'dying' ? -e.deathT * 2.5 : 0);
    const breath = 0.5 + 0.5 * Math.sin(t * 3.1);
    let power = 1 + breath * 0.15;
    if (windup) power += 0.35 + 0.2 * Math.sin(t * 30);
    if (b.mode === 'vent') power += 0.55 + 0.15 * Math.sin(t * 9);
    if (b.mode === 'transition') power += 0.4 + 0.4 * Math.sin(t * 22);
    if (b.mode === 'dying') power = (1 + e.deathT * 0.9) * (e.deathT > 2.25 ? Math.max(0, 1 - (e.deathT - 2.25) / 0.3) : 1);
    power *= alpha;
    v.halo.setPosition(cx, cy).setDisplaySize(64 * power, 64 * power).setAlpha(Math.min(1, 0.38 * power));
    v.hot.setPosition(cx, cy).setDisplaySize(26 * power, 26 * power).setAlpha(Math.min(1, 0.7 * power));
    v.ground.setPosition(x, y - 3).setDisplaySize(120 * power, 38 * power).setAlpha(0.35 * alpha);
    v.corrupt.setVisible(p2 && b.mode !== 'dying').setPosition(cx, cy + 4).setDisplaySize(140 + breath * 20, 120 + breath * 20).setAlpha(0.22 + 0.1 * Math.sin(t * 4.3));
    v.coreL.x = cx; v.coreL.y = cy + 26; v.coreL.i = 0.8 * power; v.coreL.r = 190 + (b.mode === 'vent' ? 40 : 0) + (b.mode === 'dying' ? e.deathT * 80 : 0);
    v.magL.x = cx; v.magL.y = cy + 20; v.magL.i = p2 && b.mode !== 'dying' ? 0.55 + 0.15 * breath : 0;
    v.groundL.x = x; v.groundL.y = y; v.groundL.i = 0.6 * alpha;

    // Vent: the opened cage throbs with rings of light.
    const fx = this.fx;
    if (b.mode === 'vent') {
      v.ventPulse -= dt;
      const k = 1 - Math.max(0, v.ventPulse) / 0.55;
      v.ring.setVisible(true).setPosition(cx, cy).setDisplaySize(30 + 60 * k, 30 + 60 * k).setAlpha(0.7 * (1 - k)).setTint(p2 ? MAGENTA_L : WARM);
      if (v.ventPulse <= 0) {
        v.ventPulse = 0.55;
        fx?.burst({ x: cx, y: cy + 8, n: 6, color: [WARM, AMBER, HOT], speed: [10, 40], life: [0.5, 0.9], grav: 60, size: [1.2, 0], up: 10 });
      }
    } else v.ring.setVisible(false);

    // Moments: entering a mode.
    if (b.mode !== v.mode) {
      this.onMode(v, b, e, cx, cy, x, y);
      v.mode = b.mode;
    }
    if (b.mode === 'dying') this.dyingFx(v, e, cx, cy, x, y, dt);
    // Embers always drift up off the star (sparse).
    this.sparkT -= dt;
    if (fx && this.sparkT <= 0 && b.mode !== 'dying' && e.spawnT <= 0) {
      this.sparkT = p2 ? 0.07 : 0.11;
      fx.burst({ x: cx + (Math.random() - 0.5) * 24, y: cy + (Math.random() - 0.5) * 16, n: 1, color: p2 && Math.random() < 0.4 ? [MAGENTA_L] : [WARM, AMBER], speed: [4, 14], life: [0.8, 1.5], up: 18, grav: -8, size: [1, 0], drag: 1 });
    }
  }

  private onMode(v: Body, b: BossBrain, _e: Enemy, cx: number, cy: number, x: number, y: number) {
    const fx = this.fx;
    if (!fx) return;
    if (b.mode === 'vent') {
      fx.burst({ x: cx, y: cy, n: 26, color: [WARM, AMBER, HOT], speed: [50, 140], life: [0.3, 0.7], tex: 'spark', stretch: true, drag: 3, light: 0 });
      fx.effect('ringSoft', cx, cy, 0.5, (k, img) => img.setDisplaySize(30 + 120 * k, 30 + 120 * k).setAlpha(0.8 * (1 - k)).setTint(WARM));
      v.ventPulse = 0.2;
    }
    if (b.mode === 'transition') {
      fx.effect('ringSoft', cx, cy, 0.9, (k, img) => img.setDisplaySize(40 + 420 * k, 40 + 420 * k).setAlpha(0.9 * (1 - k)).setTint(MAGENTA));
      fx.effect('glow', cx, cy, 0.7, (k, img) => img.setDisplaySize(260, 260).setAlpha(0.8 * (1 - k)).setTint(MAGENTA_L));
      fx.burst({ x: cx, y: cy, n: 50, color: [MAGENTA, MAGENTA_L, WARM], speed: [60, 220], life: [0.4, 0.9], tex: 'spark', stretch: true, drag: 2.5 });
      fx.burst({ x, y: y - 4, n: 30, color: [0x1d1820, 0x2e252a, 0x46373a], speed: [30, 110], life: [0.5, 1.0], size: [2.2, 0], add: false, drag: 3, up: 30, grav: 80 });
      this.flash(0.35);
    }
    if (b.mode === 'dying') {
      v.dieT = 0;
      fx.effect('glow', cx, cy, 0.5, (k, img) => img.setDisplaySize(200, 200).setAlpha(1 - k).setTint(HOT));
      this.flash(0.5);
    }
  }

  /** The death: the star swells and spits light for ~2.2 s, then bursts (white flash, shockwave, shards). */
  private dyingFx(v: Body, e: Enemy, cx: number, cy: number, x: number, y: number, dt: number) {
    const fx = this.fx;
    if (!fx) return;
    v.dieT -= dt;
    const k = Math.min(1, e.deathT / 2.2);
    if (e.deathT < 2.2 && v.dieT <= 0) {
      v.dieT = 0.09 - k * 0.05;
      const ang = Math.random() * Math.PI * 2;
      const len = 60 + Math.random() * 90 * (0.4 + k);
      fx.effect('streak', cx, cy, 0.35, (q, img) => img.setOrigin(0, 0.5).setRotation(ang).setDisplaySize(len * (0.3 + 0.7 * q), 5 + 6 * k).setAlpha(0.9 * (1 - q)).setTint(Math.random() < 0.3 ? MAGENTA_L : HOT));
      fx.burst({ x: cx, y: cy, n: 4 + Math.floor(k * 8), color: [HOT, WARM, AMBER], speed: [60, 200], life: [0.25, 0.6], dir: ang, spread: 0.6, tex: 'spark', stretch: true, drag: 2.5 });
      if (Math.random() < 0.4) fx.burst({ x: x + (Math.random() - 0.5) * 60, y: y - Math.random() * 20, n: 5, color: [0x1d1820, 0x2e252a, 0x46373a], speed: [20, 70], life: [0.4, 0.8], size: [2, 0], add: false, up: 40, grav: 120 });
    }
    if (!v.burst && e.deathT >= 2.2) {
      v.burst = true;
      fx.effect('glow', cx, cy, 0.9, (q, img) => img.setDisplaySize(160 + 520 * q, 160 + 520 * q).setAlpha(1 - q).setTint(HOT));
      fx.effect('ringSoft', cx, cy + 20, 0.8, (q, img) => img.setDisplaySize(40 + 560 * q, (40 + 560 * q) * 0.6).setAlpha(1 - q).setTint(WARM));
      fx.effect('ringSoft', cx, cy, 1.1, (q, img) => img.setDisplaySize(30 + 360 * q, 30 + 360 * q).setAlpha(0.7 * (1 - q)).setTint(AMBER));
      fx.burst({ x: cx, y: cy, n: 90, color: [HOT, WARM, AMBER, MAGENTA_L], speed: [80, 320], life: [0.5, 1.3], tex: 'spark', stretch: true, drag: 2, light: 0 });
      fx.burst({ x: cx, y: cy, n: 12, color: [HOT, WARM], speed: [30, 120], life: [1.0, 1.8], size: [10, 0], tex: 'glow', drag: 2, light: 40 });
      fx.burst({ x, y: y - 6, n: 40, color: [0x232838, 0x363e52, 0x465066, 0x1d1820], speed: [40, 160], life: [0.6, 1.2], size: [2.6, 0], add: false, up: 60, grav: 160, drag: 2 });
      this.flash(0.8);
    }
  }

  private flash(s: number) {
    const sc = this.scene as unknown as SceneBits;
    if (sc.settings?.flashes === false) return;
    sc.hud?.flash(s);
  }

  private dropBody() {
    const v = this.body;
    if (!v) return;
    for (const o of [v.spr, v.emit, v.shadow, v.ground, v.halo, v.hot, v.corrupt, v.ring]) o.destroy();
    for (const L of [v.coreL, v.magL, v.groundL]) this.unlight(L);
    this.body = null;
  }

  // ---- hazards ----------------------------------------------------------------------------------

  private syncHazards(w: World, b: BossBrain | undefined, t: number, dt: number) {
    const g = this.beamG, gg = this.groundG;
    g.clear(); gg.clear();
    const fx = this.fx;
    const p2 = (b?.phase ?? 1) === 2;
    const seen = new Set<number>();
    const boss = w.enemies.find((o) => o.kind === 'boss');
    for (const h of w.hazards) {
      if (h.team !== 'enemy' || h.t < h.delay) continue;
      seen.add(h.id);
      const first = !this.seenHaz.has(h.id);
      this.seenHaz.add(h.id);
      const k = Math.min(1, (h.t - h.delay) / h.dur);
      switch (h.kind) {
        case 'beam': this.drawBeam(h, boss, k, t, p2, first); break;
        case 'nova': this.drawNova(h, t, p2); break;
        case 'root': {
          let s = this.thorns.get(h.id);
          if (!s) {
            s = this.scene.add.sprite(h.x, h.y, 'bossThorn', 'rise_0').setScale(1 / ATLAS.bossThorn.d).setOrigin(0.5, ATLAS.bossThorn.footY / ATLAS.bossThorn.h).setDepth(ySort(h.y));
            this.thorns.set(h.id, s);
            fx?.burst({ x: h.x, y: h.y, n: 16, color: [0x1d1820, 0x2e252a, 0x465066], speed: [30, 100], life: [0.3, 0.7], size: [2, 0], add: false, up: 50, grav: 160 });
            fx?.burst({ x: h.x, y: h.y - 6, n: 10, color: p2 ? [MAGENTA, MAGENTA_L] : [AMBER, WARM], speed: [30, 90], life: [0.2, 0.5], tex: 'spark', stretch: true, up: 40 });
          }
          const idx = Math.min(4, Math.floor(Math.min(0.999, k) * 5));
          s.setFrame(`${p2 ? 'rise2' : 'rise'}_${idx}`);
          break;
        }
        case 'star': if (first && fx) {
          fx.effect('glow', h.x, h.y - 4, 0.35, (q, img) => img.setDisplaySize(h.r * 4, h.r * 2.4).setAlpha(1 - q).setTint(HOT));
          fx.burst({ x: h.x, y: h.y - 2, n: 24, color: [HOT, WARM, AMBER], speed: [60, 180], life: [0.25, 0.6], tex: 'spark', stretch: true, drag: 3 });
          fx.burst({ x: h.x, y: h.y - 2, n: 6, color: [WARM], speed: [5, 25], life: [0.8, 1.4], up: 20, grav: -10, size: [1.4, 0], light: 26 });
        } break;
        case 'pool': {
          // Phase-2 corrupted pools: a slow churn of magenta motes over the existing pool drawing.
          if (fx && Math.random() < dt * 6) fx.burst({ x: h.x + (Math.random() - 0.5) * h.r * 1.4, y: h.y + (Math.random() - 0.5) * h.r * 0.9, n: 1, color: [MAGENTA, MAGENTA_L], speed: [2, 8], life: [0.8, 1.4], up: 14, grav: -6, size: [1.2, 0] });
          break;
        }
        default: break;
      }
    }
    for (const [id, s] of this.thorns) if (!seen.has(id)) {
      fx?.burst({ x: s.x, y: s.y - 6, n: 10, color: [0x1d1820, 0x2e252a], speed: [10, 40], life: [0.3, 0.6], size: [1.6, 0], add: false, grav: 80 });
      s.destroy(); this.thorns.delete(id);
    }
    for (const [id, Ls] of this.beamLights) if (!seen.has(id)) { for (const L of Ls) this.unlight(L); this.beamLights.delete(id); }
    for (const id of this.seenHaz) if (!seen.has(id)) this.seenHaz.delete(id);
  }

  private drawBeam(h: Hazard, boss: Enemy | undefined, k: number, t: number, p2: boolean, first: boolean) {
    const g = this.beamG;
    const c = Math.cos(h.ang), s = Math.sin(h.ang);
    const sx = h.x, sy = h.y, ex = h.x + c * h.len, ey = h.y + s * h.len;
    const coreX = boss ? boss.x + BOSS_CORE.x : sx, coreY = boss ? boss.y + BOSS_CORE.y : sy - 34;
    const fade = Math.min(1, k * 8) * Math.min(1, (1 - k) * 6);
    const flick = 0.85 + Math.sin(t * 60) * 0.15;
    const outer = p2 ? MAGENTA : AMBER;
    // From the star down to the ground, then along the floor.
    for (const [wd, col, al] of [[20, outer, 0.22], [11, outer, 0.45], [6, WARM, 0.8], [2.5, HOT, 1]] as const) {
      g.lineStyle(wd * flick, col, al * fade);
      g.beginPath(); g.moveTo(coreX, coreY); g.lineTo(sx, sy); g.lineTo(ex, ey); g.strokePath();
    }
    // Hot end where it strikes stone.
    g.fillStyle(HOT, 0.9 * fade); g.fillCircle(ex, ey, 4 * flick);
    g.fillStyle(outer, 0.35 * fade); g.fillCircle(ex, ey, 10 * flick);
    // Scorch trail on the ground.
    this.groundG.lineStyle(14, outer, 0.12 * fade); this.groundG.lineBetween(sx, sy, ex, ey);
    let Ls = this.beamLights.get(h.id);
    if (!Ls) { Ls = [this.light(0, 0, 70, outer, 0), this.light(0, 0, 60, WARM, 0), this.light(0, 0, 60, WARM, 0)]; this.beamLights.set(h.id, Ls); }
    const pts = [[ex, ey], [sx + c * h.len * 0.5, sy + s * h.len * 0.5], [sx + c * h.len * 0.2, sy + s * h.len * 0.2]];
    Ls.forEach((L, i) => { L.x = pts[i][0]; L.y = pts[i][1]; L.i = 0.9 * fade; });
    const fx = this.fx;
    if (fx && Math.random() < 0.6) fx.burst({ x: ex, y: ey, n: 2, color: [HOT, WARM, p2 ? MAGENTA_L : AMBER], speed: [40, 120], life: [0.15, 0.35], tex: 'spark', stretch: true, drag: 3 });
    if (first && fx) fx.effect('glow', coreX, coreY, 0.25, (q, img) => img.setDisplaySize(90, 90).setAlpha(1 - q).setTint(HOT));
  }

  private drawNova(h: Hazard, t: number, p2: boolean) {
    const g = this.beamG;
    const gap = h.gap ?? 0, gw = h.gapW ?? 0;
    const mid = (h.r + h.r2) / 2, thick = h.r - h.r2;
    const a0 = gap + gw, a1 = gap + Math.PI * 2 - gw;
    const fade = Math.min(1, h.r2 > 300 ? (380 - h.r2) / 80 : 1);
    const col = p2 ? MAGENTA : AMBER;
    for (const [wd, c, al] of [[thick * 1.8, col, 0.18], [thick, col, 0.5], [thick * 0.45, WARM, 0.85], [1.5, HOT, 1]] as const) {
      g.lineStyle(wd, c, al * fade);
      g.beginPath(); g.arc(h.x, h.y, mid, a0, a1, false); g.strokePath();
    }
    // Bright caps at the opening so the safe gap reads at a glance.
    for (const a of [a0, a1]) {
      g.fillStyle(HOT, 0.9 * fade); g.fillCircle(h.x + Math.cos(a) * mid, h.y + Math.sin(a) * mid, thick * 0.45 + Math.sin(t * 20) * 0.5);
    }
    this.groundG.lineStyle(thick * 2.2, col, 0.1 * fade);
    this.groundG.beginPath(); this.groundG.arc(h.x, h.y, mid, a0, a1, false); this.groundG.strokePath();
  }

  // ---- telegraph dressing -------------------------------------------------------------------------

  private syncTelegraphs(w: World, t: number) {
    const seen = new Set<number>();
    for (const tg of w.telegraphs) {
      if (!tg.boss) continue;
      seen.add(tg.id);
      const k = Math.min(1, tg.t / tg.dur);
      if (tg.kind === 'circle' || tg.kind === 'ring') this.sigil(tg, k, t);
      if (tg.tag === 'star') this.streak(tg, k);
      if (tg.tag === 'nova') {
        // Diamonds marching outward along the safe opening.
        const g = this.groundG;
        for (let d = 50; d < 200; d += 16) {
          const ph = ((d / 16 - t * 4) % 3 + 3) % 3;
          const x = tg.x + Math.cos(tg.ang) * d, y = tg.y + Math.sin(tg.ang) * d;
          g.fillStyle(0x9ff0ff, (ph < 1 ? 0.85 : 0.35) * (0.4 + 0.6 * k));
          g.fillPoints([{ x, y: y - 3 }, { x: x + 3, y }, { x, y: y + 3 }, { x: x - 3, y }], true);
        }
      }
    }
    for (const [id, img] of this.sigils) if (!seen.has(id)) { img.destroy(); this.sigils.delete(id); }
    for (const [id, img] of this.streaks) if (!seen.has(id)) { img.destroy(); this.streaks.delete(id); }
  }

  private sigil(tg: Telegraph, k: number, t: number) {
    let img = this.sigils.get(tg.id);
    if (!img) {
      img = this.scene.add.image(tg.x, tg.y, 'sigil').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.telegraph + 1);
      this.sigils.set(tg.id, img);
    }
    const hot = k > 0.8;
    const col = tg.tag === 'pool' || tg.tag === 'wall' ? MAGENTA : hot ? 0xffd0a0 : 0xff7a2a;
    const r = tg.r * 1.12;
    img.setPosition(tg.x, tg.y).setDisplaySize(r * 2, r * 2).setRotation(t * 0.6 * (tg.id % 2 ? 1 : -1)).setTint(col).setAlpha(0.35 + 0.55 * k);
  }

  private streak(tg: Telegraph, k: number) {
    let img = this.streaks.get(tg.id);
    if (!img) {
      img = this.scene.add.image(tg.x, tg.y, 'streak').setBlendMode(Phaser.BlendModes.ADD).setTint(HOT).setRotation(Math.PI / 2 + 0.25).setDepth(DEPTH.fx).setVisible(false);
      this.streaks.set(tg.id, img);
    }
    const q = (k - 0.62) / 0.38;
    if (q <= 0) { img.setVisible(false); return; }
    const fall = 1 - q;
    img.setVisible(true).setPosition(tg.x - Math.sin(0.25) * 160 * fall * -1, tg.y - 170 * fall).setDisplaySize(46, 9).setAlpha(0.4 + 0.6 * q);
  }

  // ---- phase-2 thorn walls ----------------------------------------------------------------------

  private syncWalls(b: BossBrain | undefined) {
    const want = b && b.wallsUp ? b.walls : [];
    if (want.length === this.walls.length) return;
    const fx = this.fx;
    for (const s of this.walls) {
      fx?.burst({ x: s.x, y: s.y - 10, n: 18, color: [0x1d1820, 0x2e252a, 0x46373a, MAGENTA], speed: [20, 80], life: [0.4, 0.9], size: [2, 0], add: false, up: 30, grav: 100 });
      s.destroy();
    }
    this.walls = [];
    for (const tl of want) {
      const x = (tl.tx + 0.5) * TILE, y = (tl.ty + 1) * TILE - 2;
      const s = this.scene.add.sprite(x, y, 'bossWall', `idle_${(tl.tx + tl.ty) % 2}`).setScale(1 / ATLAS.bossWall.d).setOrigin(0.5, ATLAS.bossWall.footY / ATLAS.bossWall.h).setDepth(ySort(y));
      this.walls.push(s);
      fx?.burst({ x, y: y - 4, n: 14, color: [0x232838, 0x363e52, 0x1d1820], speed: [30, 110], life: [0.4, 0.8], size: [2.2, 0], add: false, up: 60, grav: 160 });
      fx?.burst({ x, y: y - 10, n: 8, color: [MAGENTA, MAGENTA_L], speed: [20, 70], life: [0.3, 0.7], tex: 'spark', stretch: true, up: 30 });
    }
  }

  clear() {
    this.dropBody();
    for (const s of this.thorns.values()) s.destroy();
    this.thorns.clear();
    for (const s of this.sigils.values()) s.destroy();
    this.sigils.clear();
    for (const s of this.streaks.values()) s.destroy();
    this.streaks.clear();
    for (const s of this.walls) s.destroy();
    this.walls = [];
    this.seenHaz.clear();
    this.beamLights.clear();
    this.lights = [];
    this.beamG.clear(); this.groundG.clear();
  }

  destroy() {
    this.clear();
    this.beamG.destroy(); this.groundG.destroy();
  }
}
