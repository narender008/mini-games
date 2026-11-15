// The one Phaser scene. It owns the simulation (World) and every view of it, runs the fixed-step loop
// with render interpolation, turns simulation events into effects and sound, and drives the camera.
// Menus and flow live in ui/app.ts, which calls the methods here.
import Phaser from 'phaser';
import { MAX_FRAME_DT, SIM_DT, VIEW_MIN_H, VIEW_MIN_W } from '../config';
import { clamp, damp, lerp } from '../core/math';
import { Input } from '../core/input';
import { World } from '../sim/world';
import { emptyInput, type Fx as FxEvent, type InputFrame, type WeaponId } from '../sim/types';
import type { RoomDef, Zone } from '../sim/level/rooms';
import { makeTextures } from '../view/textures';
import { RoomView, DEPTH } from '../view/roomView';
import { bakeKey, envSeed, type BakedRoom } from '../view/bake/bakeRoom';
import { keepOnly, prefetch, release, take } from '../view/bake/client';
import { DENSITY } from '../view/density';
import { EMISSIVE_SCALE } from '../art/sprite';
import { EntityViews } from '../view/entities';
import { Fx } from '../view/fx';
import { Lighting, type Light } from '../view/lighting';
import { audio, type Sfx } from '../audio/audio';
import type { Hud } from '../ui/hud';
import type { Settings } from '../persist';

export interface SceneHooks {
  onEvent?: (e: FxEvent) => void;
  onExit?: (door: number) => void;
  onFrame?: (dt: number) => void;
}

const AMBIENT: Record<Zone, number> = { sanctum: 0x7186b0, causeway: 0x6c82ac, aqueduct: 0x6284ac, foundry: 0x82729a, heart: 0x685e90 };

export class GameScene extends Phaser.Scene {
  world!: World;
  roomView: RoomView | null = null;
  ents!: EntityViews;
  fx!: Fx;
  lighting!: Lighting;
  input2!: Input;
  hud: Hud | null = null;
  hooks: SceneHooks = {};
  settings!: Settings;
  running = false; // simulation steps only while true
  private acc = 0;
  private alpha = 0;
  private camX = 0;
  private camY = 0;
  private shakeT = 0;
  private shakeAmt = 0;
  private realT = 0;
  private dpr = 1;
  private pendingInput: InputFrame = emptyInput();
  private chainG!: Phaser.GameObjects.Graphics;
  private chains: { pts: number[]; t: number }[] = [];
  frameTimes: number[] = [];
  /** Attract mode: the camera drifts slowly over the room behind the title screen. */
  attract = false;
  ready = false;

  constructor() { super('game'); }

  create() {
    makeTextures(this, new URLSearchParams(location.search).get('quality'));
    this.fx = new Fx(this);
    this.lighting = new Lighting(this);
    this.ents = new EntityViews(this);
    this.chainG = this.add.graphics().setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
    this.input2 = new Input(this.game.canvas);
    this.cameras.main.setBackgroundColor('#04060c');
    this.scale.on('resize', () => this.applyZoom());
    this.events.once('shutdown', () => this.cleanup());
    this.events.once('destroy', () => this.cleanup());
    this.ready = true;
    this.game.events.emit('scene-ready', this);
  }

  setDpr(d: number) { this.dpr = d; this.applyZoom(); }

  /** Zoom so at least VIEW_MIN_W x VIEW_MIN_H art pixels are visible, at a consistent scale. */
  applyZoom() {
    const cam = this.cameras.main;
    const w = this.scale.width, h = this.scale.height;
    cam.setSize(w, h);
    const z = Math.min(w / VIEW_MIN_W, h / VIEW_MIN_H);
    cam.setZoom(Math.max(0.5, z));
  }

  /** Start a fresh world in a room. */
  newWorld(seed: number, weapon: WeaponId) {
    this.world = new World(seed, weapon);
    this.acc = 0;
  }

  private loadToken = 0;
  /** Bake density for room art (texels per world unit) and its emissive twin. */
  private get envD() { return DENSITY.env; }
  private get envDe() { return Math.max(1, DENSITY.env * EMISSIVE_SCALE); }

  /** Load a room into the world now; its view appears once its art is baked (resolves then). The world
   *  does not advance until the view exists, and the screen stays faded out meanwhile. */
  loadRoom(def: RoomDef, opts: { combat: boolean } = { combat: true }): Promise<void> {
    for (const o of this.doorLabels) o.destroy();
    this.doorLabels = [];
    this.ents.clearRoom();
    this.fx.clear();
    this.world.loadRoom(def, opts);
    this.lighting.ambient = AMBIENT[def.zone];
    audio.setZone(def.zone);
    const token = ++this.loadToken;
    const seed = envSeed(def, this.world.run.seed), d = this.envD, de = this.envDe;
    const prev = this.roomView;
    this.roomView = null;
    // Nothing is drawn while the room bakes (the screen is faded out): the bake gets the whole machine.
    this.sys.setVisible(false);
    const show = (baked: BakedRoom, reuse: boolean) => {
      if (token !== this.loadToken) { if (!reuse) release(baked); return; }
      this.sys.setVisible(true);
      this.roomView = new RoomView(this, this.world.room, def.zone, seed, baked);
      const p = this.world.player;
      this.camX = p.x; this.camY = p.y - 10;
      this.cameras.main.setBounds(0, 0, this.world.room.w * 16, this.world.room.h * 16);
      this.applyZoom();
      this.placeCamera(0);
    };
    // The same art as the room on screen (the title's sanctum becoming the run's): keep its textures.
    if (prev && prev.baked.key === bakeKey(def, seed, d)) {
      prev.destroy(true);
      show(prev.baked, true);
      return Promise.resolve();
    }
    prev?.destroy();
    const b = take(def, seed, d, de);
    if (!(b instanceof Promise)) { show(b, false); return Promise.resolve(); }
    return b.then((r) => show(r, false));
  }

  /** Bake the rooms that may come next while this one is played (only when bakes run in a worker). */
  prefetchRooms(defs: RoomDef[]) {
    if (!this.world) return;
    const d = this.envD, de = this.envDe, keys: string[] = [];
    for (const def of defs) {
      const seed = envSeed(def, this.world.run.seed);
      keys.push(bakeKey(def, seed, d));
      prefetch(def, seed, d, de);
    }
    keepOnly(keys);
  }

  /** Whether the current room's view is built. */
  get roomReady() { return !!this.roomView; }

  update(_time: number, delta: number) {
    if (!this.world || !this.roomView) return;
    const t0 = performance.now();
    const rdt = Math.min(delta / 1000, MAX_FRAME_DT);
    this.realT += rdt;
    if (this.running) {
      if (!this.frozen) this.acc += rdt;
      let first = true;
      while (this.acc >= SIM_DT) {
        const inp = this.readInput(first);
        first = false;
        this.world.tick(inp, SIM_DT);
        this.acc -= SIM_DT;
      }
      this.alpha = this.acc / SIM_DT;
      this.drainEvents();
      if (this.world.exitRequest && this.hooks.onExit) {
        const d = this.world.exitRequest.door;
        this.world.exitRequest = null;
        this.world.roomState = 'transition';
        this.hooks.onExit(d);
      }
    } else {
      this.alpha = 1;
      this.world.fx.length = 0;
    }
    this.renderFrame(rdt);
    this.hooks.onFrame?.(rdt);
    this.frameTimes.push(performance.now() - t0);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
  }

  private doorLabels: Phaser.GameObjects.GameObject[] = [];
  /** Floating labels over the room's doors (reward offers); null leaves a door unlabelled. */
  setDoorLabels(labels: ({ text: string; color: string } | null)[]) {
    for (const o of this.doorLabels) o.destroy();
    this.doorLabels = [];
    this.world.room.doors.forEach((d, i) => {
      const l = labels[i];
      if (!l) return;
      const top = Math.min(...d.cells.map((c) => c.ty)) * 16;
      const y = Math.max(top + 10, Math.max(...d.cells.map((c) => c.ty)) * 16 - 40);
      const t = this.add.text(d.x, y, l.text.toUpperCase(), {
        fontFamily: 'Cinzel, Georgia, serif', fontSize: '40px', fontStyle: '700', color: l.color, stroke: '#05070d', strokeThickness: 10,
      }).setOrigin(0.5).setScale(0.2).setDepth(DEPTH.fx + 1);
      const g = this.add.image(d.x, y, 'glow').setDisplaySize(70, 30).setTint(Phaser.Display.Color.HexStringToColor(l.color).color).setAlpha(0.35)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx);
      this.doorLabels.push(t, g);
    });
  }

  /** Debug/test: hold these input fields on every step (null lets the real input through). */
  debugInput: Partial<InputFrame> | null = null;
  /** Debug/test: when frozen, real time no longer advances the simulation; use step(). */
  frozen = false;
  /** Debug/test: advance the simulation by ms in fixed steps, deterministically, then drain events. */
  step(ms: number) {
    const n = Math.max(1, Math.round(ms / 1000 / SIM_DT));
    for (let k = 0; k < n; k++) {
      this.world.tick(this.readInput(k === 0), SIM_DT);
      this.drainEvents();
      if (this.world.exitRequest && this.hooks.onExit) {
        const d = this.world.exitRequest.door;
        this.world.exitRequest = null;
        this.world.roomState = 'transition';
        this.hooks.onExit(d);
      }
    }
  }

  /** Build this step's input. Presses are delivered on the first step of a frame only. */
  private readInput(first: boolean): InputFrame {
    const i = this.input2, p = this.world.player;
    const mv = i.moveVector();
    const f = this.pendingInput;
    f.moveX = mv.x; f.moveY = mv.y;
    const aim = this.screenToWorld(i.mouseX, i.mouseY);
    if (i.mouseIn || i.lastDevice === 'mouse') { f.aimX = aim.x; f.aimY = aim.y; }
    else { f.aimX = p.x + Math.cos(p.facing) * 40; f.aimY = p.y - 8 + Math.sin(p.facing) * 40; }
    f.attack = i.lmb || i.held('attack');
    f.aimAssist = this.settings?.aimAssist ?? false;
    if (first) {
      f.attackPressed = i.take('attack');
      f.dashPressed = i.take('dash');
      f.specialPressed = i.take('special');
      f.interactPressed = i.take('interact');
    } else {
      f.attackPressed = f.dashPressed = f.specialPressed = f.interactPressed = false;
    }
    if (this.debugInput) Object.assign(f, this.debugInput);
    return f;
  }

  screenToWorld(cssX: number, cssY: number) {
    const cam = this.cameras.main;
    return { x: cam.worldView.x + (cssX * this.dpr) / cam.zoom, y: cam.worldView.y + (cssY * this.dpr) / cam.zoom };
  }
  worldToScreen(x: number, y: number) {
    const cam = this.cameras.main;
    return { x: ((x - cam.worldView.x) * cam.zoom) / this.dpr, y: ((y - cam.worldView.y) * cam.zoom) / this.dpr };
  }

  private placeCamera(dt: number) {
    const cam = this.cameras.main, w = this.world, p = w.player;
    const px = lerp(p.px, p.x, this.alpha), py = lerp(p.py, p.y, this.alpha) - 10;
    let tx = px, ty = py;
    if (this.attract) {
      tx = w.room.w * 8 + Math.sin(this.realT * 0.07) * w.room.w * 3;
      ty = w.room.h * 8 + Math.cos(this.realT * 0.05) * w.room.h * 2;
    } else if (this.running && p.state !== 'dead') {
      // Keep a living boss in frame: lean the camera toward it.
      const boss = w.enemies.find((e) => e.kind === 'boss' && !e.dead);
      if (boss) { tx += clamp((boss.x - px) * 0.35, -120, 120); ty += clamp((boss.y - 40 - py) * 0.35, -110, 110); }
      // Look a little toward the aim.
      const aim = this.screenToWorld(this.input2.mouseX, this.input2.mouseY);
      if (this.input2.mouseIn) {
        tx += clamp((aim.x - px) * 0.12, -26, 26);
        ty += clamp((aim.y - py) * 0.12, -18, 18);
      }
    }
    if (dt <= 0) { this.camX = tx; this.camY = ty; }
    else { const k = damp(this.attract ? 1 : 7, dt); this.camX += (tx - this.camX) * k; this.camY += (ty - this.camY) * k; }
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      const m = this.settings?.shake === 'off' ? 0 : this.settings?.shake === 'reduced' ? 0.35 : 1;
      const a = this.shakeAmt * m * Math.min(1, this.shakeT * 6);
      sx = (Math.random() - 0.5) * 2 * a; sy = (Math.random() - 0.5) * 2 * a;
    }
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const rw = w.room.w * 16, rh = w.room.h * 16;
    // Clamp to the room; centre the room if it is smaller than the view.
    const cx = rw <= vw ? rw / 2 : clamp(this.camX, vw / 2, rw - vw / 2);
    const cy = rh <= vh ? rh / 2 : clamp(this.camY, vh / 2, rh - vh / 2);
    cam.setBounds(-vw, -vh, rw + vw * 2, rh + vh * 2);
    cam.centerOn(cx + sx, cy + sy);
  }

  private renderFrame(dt: number) {
    const w = this.world;
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.fx.reduced = !(this.settings?.flashes ?? true);
    this.ents.sync(w, this.alpha, this.realT, dt);
    this.placeCamera(dt);
    this.fx.update(dt);
    this.updateChains(dt);
    this.roomView!.update(this.realT, w.room.doors.map((d) => d.open));
    const lights: Light[] = [...this.roomView!.lights, ...this.ents.lights, ...this.fx.lights, ...this.extraLights];
    this.lighting.render(this.cameras.main, lights);
    this.cameras.main.preRender();
  }

  extraLights: Light[] = [];

  shake(amt: number, dur: number) { this.shakeAmt = Math.max(this.shakeT > 0 ? this.shakeAmt : 0, amt); this.shakeT = Math.max(this.shakeT, dur); }

  private pan(x: number) {
    const v = this.cameras.main.worldView;
    return clamp((x - v.centerX) / (v.width / 2), -1, 1) * 0.7;
  }
  sfx(name: Sfx, x?: number, volume = 1, pitch = 1) {
    audio.play(name, { pan: x === undefined ? 0 : this.pan(x), volume, pitch });
  }

  private drainEvents() {
    const evs = this.world.fx;
    if (!evs.length) return;
    for (const e of evs) { this.react(e); this.hooks.onEvent?.(e); }
    evs.length = 0;
  }

  /** Turn one simulation event into particles, effects and sound. */
  private react(e: FxEvent) {
    const fx = this.fx;
    switch (e.type) {
      case 'swing': {
        const heavy = e.combo === 2;
        const key = heavy ? 'slashHeavy' : 'slash';
        const flip = e.combo === 1;
        const size = (e.range + 12) * (heavy ? 2.0 : 1.9);
        const tint = e.empowered ? 0x9ff0ff : 0xffffff;
        const sweep = heavy ? 0.9 : 0.6;
        fx.effect(key, e.x, e.y, heavy ? 0.24 : 0.17, (k, img) => {
          const ek = 1 - (1 - k) ** 3;
          img.setRotation(e.ang + (ek - 0.55) * sweep * (flip ? -1 : 1)).setFlipY(flip)
            .setDisplaySize(size * (0.86 + 0.18 * ek), size * (0.86 + 0.18 * ek)).setAlpha(k < 0.35 ? 1 : (1 - (k - 0.35) / 0.65) ** 1.3).setTint(tint);
        });
        fx.effect('glow', e.x + Math.cos(e.ang) * e.range * 0.55, e.y + Math.sin(e.ang) * e.range * 0.55, 0.16, (k, img) =>
          img.setDisplaySize(size * 0.9, size * 0.9).setTint(e.empowered ? 0x60d0ff : 0xff9a30).setAlpha(0.35 * (1 - k)));
        this.flashLight(e.x + Math.cos(e.ang) * e.range * 0.6, e.y + Math.sin(e.ang) * e.range * 0.6, heavy ? 70 : 50, 0xff9a40, heavy ? 0.8 : 0.5, 0.12);
        fx.burst({ x: e.x + Math.cos(e.ang) * e.range * 0.7, y: e.y + Math.sin(e.ang) * e.range * 0.7, n: heavy ? 10 : 5, color: [0xffc860, 0xffe2a8], speed: [40, 110], life: [0.15, 0.35], dir: e.ang, spread: 1.4, size: [1, 0], drag: 5 });
        this.sfx(heavy ? 'swingHeavy' : 'swing', e.x, 1, 1 + e.combo * 0.06);
        break;
      }
      case 'hit': {
        const col = e.shielded ? 0x7ff0e0 : 0xffd27a;
        fx.burst({ x: e.x, y: e.y, n: e.heavy ? 14 : 8, color: [col, 0xffffff], speed: [60, 170], life: [0.12, 0.3], dir: e.ang, spread: 1.6, size: [1.2, 0], tex: 'spark', stretch: true, drag: 6 });
        fx.burst({ x: e.x, y: e.y, n: 1, color: col, speed: [0, 0], life: [0.12, 0.12], size: [e.heavy ? 26 : 16, e.heavy ? 40 : 26], tex: 'glow', light: e.heavy ? 40 : 24 });
        if ((this.settings?.damageNumbers ?? true) && (e.dmg > 0 || e.shielded)) fx.number(e.x, e.y - 6, String(Math.max(1, Math.round(e.dmg))), e.crit ? '#9ff0ff' : e.shielded ? '#7ff0e0' : e.heavy ? '#ffd27a' : '#f2e6d0', e.heavy || e.crit);
        this.sfx(e.shielded ? 'shieldUp' : e.heavy ? 'hitHeavy' : 'hit', e.x, e.shielded ? 0.5 : 1);
        if (e.heavy) this.shake(1.5, 0.12);
        break;
      }
      case 'kill': {
        const eliteCol = 0xe04bb0;
        const accent = e.kind === 'stalker' ? 0x5fe0d0 : e.kind === 'sentinel' ? 0xe04bb0 : e.kind === 'warden' ? 0x5fe0d0 : e.kind === 'colossus' ? 0xffb347 : 0xbfd0ff;
        fx.burst({ x: e.x, y: e.y - 8, n: e.big ? 26 : 14, color: [0x0b0e1a, 0x161c30, 0x222a46], speed: [20, 80], life: [0.4, 0.9], size: [2.5, 0], add: false, up: 30, drag: 3, grav: -20 });
        fx.burst({ x: e.x, y: e.y - 8, n: e.big ? 18 : 9, color: [accent, e.big ? eliteCol : accent, 0xffffff], speed: [20, 90], life: [0.4, 1.0], size: [1, 0], up: 40, drag: 2.5, grav: -30, light: e.big ? 20 : 0 });
        fx.effect('ringSoft', e.x, e.y - 6, 0.3, (k, img) => img.setDisplaySize(10 + 40 * k, (10 + 40 * k) * 0.6).setAlpha(0.6 * (1 - k)).setTint(accent));
        this.sfx(e.big ? 'killBig' : 'kill', e.x);
        break;
      }
      case 'shot': {
        if (e.team === 'player') {
          fx.burst({ x: e.x, y: e.y, n: 1, color: 0xffc860, speed: [0, 0], life: [0.06, 0.06], size: [e.kind === 'lance' ? 20 : 12, 4], tex: 'glow', light: 30 });
          fx.burst({ x: e.x, y: e.y, n: 3, color: 0xffe2a8, speed: [40, 100], life: [0.08, 0.18], dir: e.ang, spread: 0.7, tex: 'spark', stretch: true });
          this.sfx('boltFire', e.x, e.kind === 'lance' ? 1.1 : 0.8, e.kind === 'lance' ? 0.8 : 1);
        } else {
          fx.burst({ x: e.x, y: e.y, n: 4, color: [0xe04bb0, 0xff9be0], speed: [20, 60], life: [0.15, 0.3], dir: e.ang, spread: 1, size: [1, 0] });
          this.sfx('enemyShot', e.x, 0.8);
        }
        break;
      }
      case 'impact': {
        const col = e.team === 'enemy' ? 0xff7ad9 : 0xffd27a;
        fx.burst({ x: e.x, y: e.y, n: 6, color: [col, 0xffffff], speed: [30, 90], life: [0.1, 0.25], size: [1, 0], tex: 'spark', stretch: true });
        if (e.team === 'player') this.sfx('boltHit', e.x, 0.5);
        break;
      }
      case 'dash': {
        fx.burst({ x: e.x, y: e.y, n: 8, color: [0x3a4462, 0x556080], speed: [20, 50], life: [0.25, 0.45], size: [1.5, 0], add: false, drag: 4 });
        fx.burst({ x: e.x, y: e.y - 8, n: 6, color: 0x9ff0ff, speed: [30, 80], life: [0.15, 0.3], dir: e.ang + Math.PI, spread: 1, tex: 'spark', stretch: true });
        this.sfx('dash', e.x);
        break;
      }
      case 'dashReady': this.sfx('dashReady', undefined, 0.5); break;
      case 'dodge': {
        fx.effect('ringSoft', e.x, e.y - 8, 0.35, (k, img) => img.setDisplaySize(10 + 50 * k, 10 + 50 * k).setAlpha(0.8 * (1 - k)).setTint(0x9ff0ff));
        this.sfx('perfectDodge', e.x);
        break;
      }
      case 'hurt': {
        fx.burst({ x: e.x, y: e.y - 8, n: 12, color: [0xff4a3d, 0xffd0a0], speed: [40, 120], life: [0.2, 0.4], size: [1.2, 0], tex: 'spark', stretch: true });
        this.hud?.hurt();
        this.sfx('hurt', e.x);
        break;
      }
      case 'mote': this.sfx('mote', e.x, 0.6); break;
      case 'heal': {
        fx.burst({ x: e.x, y: e.y, n: 10, color: [0xff8a8a, 0xffe2a8], speed: [10, 40], life: [0.5, 0.9], up: 40, grav: -20, size: [1, 0] });
        this.sfx('heal', e.x);
        break;
      }
      case 'levelUp': this.sfx('levelUp'); break;
      case 'deny': this.hud?.deny(e.what); this.sfx('deny'); break;
      case 'castStart': {
        fx.burst({ x: e.x, y: e.y - 10, n: 16, color: [0xffd27a, 0xffffff], speed: [40, 70], life: [0.2, 0.25], size: [1, 0], drag: -2 });
        this.sfx('sunburstCharge', e.x);
        break;
      }
      case 'sunburst': {
        fx.effect('ringSoft', e.x, e.y, 0.45, (k, img) => img.setDisplaySize(e.r * 2.3 * (0.2 + 0.8 * Math.sqrt(k)), e.r * 2.3 * (0.2 + 0.8 * Math.sqrt(k))).setAlpha(1 - k).setTint(0xffd27a));
        fx.effect('glow', e.x, e.y, 0.5, (k, img) => img.setDisplaySize(e.r * 3, e.r * 3).setAlpha(0.8 * (1 - k)).setTint(0xffb347));
        fx.burst({ x: e.x, y: e.y, n: 40, color: [0xffd27a, 0xffffff, 0xffb347], speed: [80, 220], life: [0.3, 0.6], size: [1.4, 0], tex: 'spark', stretch: true, drag: 3, light: 0 });
        this.flashLight(e.x, e.y, e.r * 2.5, 0xffd27a, 1.6, 0.5);
        if (this.settings?.flashes ?? true) this.hud?.flash(0.35);
        this.sfx('sunburst', e.x);
        break;
      }
      case 'shieldUp': this.sfx('shieldUp', undefined, 0.8); break;
      case 'shieldBreak': {
        fx.burst({ x: e.x, y: e.y, n: 14, color: [0x7ff0e0, 0xffffff], speed: [40, 120], life: [0.2, 0.4], tex: 'spark', stretch: true });
        this.sfx('shieldBreak', e.x);
        break;
      }
      case 'chain': this.chains.push({ pts: e.pts, t: 0.18 }); this.sfx('chain', e.pts[0]); break;
      case 'burnTick': fx.burst({ x: e.x, y: e.y, n: 3, color: [0xff8a30, 0xffd27a], speed: [5, 25], life: [0.3, 0.6], up: 30, grav: -30, size: [1, 0] }); break;
      case 'spawn': {
        fx.burst({ x: e.x, y: e.y - 4, n: 14, color: [0xb04ae0, 0xe04bb0, 0x2a1840], speed: [10, 50], life: [0.4, 0.8], up: 40, grav: -40, size: [1.3, 0] });
        this.sfx('spawn', e.x, 0.7);
        break;
      }
      case 'enemyCue': {
        const map: Record<string, Sfx> = { enemyWindup: 'enemyWindup', enemyLunge: 'enemyLunge', chargeWindup: 'chargeWindup', slamWindup: 'slamWindup', blink: 'blink', blinkIn: 'blink',
          // The Choked Star (src/sim/boss.ts).
          bossRoar: 'bossRoar', bossBeamCharge: 'bossBeamCharge', bossBeam: 'bossBeam', bossVolley: 'bossVolley', bossVolleyCharge: 'enemyWindup',
          bossRootWindup: 'slamWindup', bossStarfall: 'sunburstCharge', bossNovaCharge: 'bossBeamCharge', bossNova: 'sunburst', bossCharge: 'enemyLunge',
          bossVent: 'shieldBreak', bossBurst: 'sunburst' };
        const s = map[e.cue];
        if (s) this.sfx(s, e.x, e.cue === 'blinkIn' ? 0.6 : 1);
        if (e.cue === 'blink' || e.cue === 'blinkIn') fx.burst({ x: e.x, y: e.y - 8, n: 12, color: [0x5fe0d0, 0x1d4a4e], speed: [20, 60], life: [0.3, 0.5], size: [1.4, 0] });
        break;
      }
      case 'slam': {
        fx.effect('ringSoft', e.x, e.y, 0.35, (k, img) => img.setDisplaySize(e.r * 2.4 * (0.3 + 0.7 * k), e.r * 2.4 * 0.6 * (0.3 + 0.7 * k)).setAlpha(0.9 * (1 - k)).setTint(0xff8a5a));
        fx.burst({ x: e.x, y: e.y, n: 22, color: [0x3a4462, 0x556080, 0x2a3048], speed: [30, 110], life: [0.3, 0.7], size: [2, 0], add: false, drag: 4 });
        fx.burst({ x: e.x, y: e.y, n: 10, color: [0xffb347, 0xe04bb0], speed: [40, 120], life: [0.2, 0.4], tex: 'spark', stretch: true });
        this.flashLight(e.x, e.y, e.r * 2, 0xff8a5a, 1, 0.3);
        this.sfx('slam', e.x);
        break;
      }
      case 'shake': this.shake(e.amt, e.dur); break;
      case 'death': this.sfx('death', e.x); break;
      case 'roomClear': this.sfx('roomClear'); break;
      case 'doorOpen': this.sfx('doorOpen'); break;
      case 'lanternLit': {
        fx.burst({ x: e.x, y: e.y, n: 20, color: [0xffd27a, 0xffffff], speed: [20, 70], life: [0.4, 0.8], up: 20, size: [1.2, 0] });
        this.sfx('lanternLit', e.x);
        break;
      }
      case 'text': fx.number(e.x, e.y, e.text, e.tone === 'good' ? '#ffe2a8' : e.tone === 'warn' ? '#ff8a7a' : '#e9e1cf', true); break;
      case 'wallBonk': {
        fx.burst({ x: e.x, y: e.y, n: 14, color: [0x3a4462, 0x556080], speed: [30, 90], life: [0.3, 0.6], size: [1.6, 0], add: false });
        fx.burst({ x: e.x, y: e.y - 6, n: 6, color: 0xffe2a8, speed: [30, 80], life: [0.2, 0.4], tex: 'spark', stretch: true });
        this.sfx('wallBonk', e.x);
        break;
      }
      case 'step': this.sfx('footstep', e.x, 0.6); break;
      case 'bossPhase': this.sfx('bossPhase'); break;
      case 'bossDeath': this.sfx('bossDeath', e.x); break;
    }
  }

  private flashLight(x: number, y: number, r: number, color: number, i: number, dur: number) {
    const L: Light = { x, y, r, color, i };
    this.extraLights.push(L);
    this.tweens.addCounter({ from: i, to: 0, duration: dur * 1000, onUpdate: (tw) => { L.i = tw.getValue() ?? 0; }, onComplete: () => this.extraLights.splice(this.extraLights.indexOf(L), 1) });
  }

  private updateChains(dt: number) {
    const g = this.chainG;
    g.clear();
    for (const c of this.chains) {
      c.t -= dt;
      const a = Math.max(0, c.t / 0.18);
      for (let pass = 0; pass < 2; pass++) {
        g.lineStyle(pass ? 1 : 2.5, pass ? 0xffffff : 0x62e6d6, a);
        g.beginPath();
        g.moveTo(c.pts[0], c.pts[1]);
        for (let i = 2; i < c.pts.length; i += 2) {
          const x0 = c.pts[i - 2], y0 = c.pts[i - 1], x1 = c.pts[i], y1 = c.pts[i + 1];
          for (let s = 1; s <= 4; s++) {
            const t = s / 4;
            const j = s < 4 ? (Math.random() - 0.5) * 8 : 0;
            g.lineTo(lerp(x0, x1, t) + j, lerp(y0, y1, t) + j);
          }
        }
        g.strokePath();
      }
    }
    this.chains = this.chains.filter((c) => c.t > 0);
  }

  private cleanup() {
    this.loadToken++; // a bake still in flight is dropped when it lands
    this.input2?.destroy();
    this.roomView?.destroy();
    this.fx?.destroy();
    this.ents?.destroy();
    this.lighting?.destroy();
  }

}
