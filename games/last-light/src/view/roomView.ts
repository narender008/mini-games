// Turns a parsed room and its baked environment (src/view/bake/: vector art painted at the screen's
// density, usually in a worker) into display objects: floor chunks, one depth-sorted strip per tile row
// for everything tall (walls, arches, bushes, rims), a sprite per prop, emissive twins drawn additively
// after the light map, then door seals, the room's static lights and drifting fireflies.
import Phaser from 'phaser';
import { TILE } from '../config';
import type { Prop } from '../sim/types';
import type { RoomData, Zone } from '../sim/level/rooms';
import type { Light } from './lighting';
import { rng } from '../art/paint';
import { roomMap } from '../art/env/map';
import { LOOKS } from '../art/env/look';
import type { BakedRoom, ImageSrc } from './bake/bakeRoom';
import { release } from './bake/client';

export const DEPTH = { floor: 0, decal: 2, telegraph: 5, world: 1000, light: 50000, glow: 50001, fx: 50002, ui: 60000 };
export const ySort = (y: number) => DEPTH.world + y;

export interface WaterPatch { x: number; y: number; w: number; h: number }

interface Firefly { img: Phaser.GameObjects.Image; x: number; y: number; ph: number; sp: number; r: number }

export class RoomView {
  objects: Phaser.GameObjects.GameObject[] = [];
  textureKeys: string[] = [];
  lights: Light[] = [];
  water: WaterPatch[] = [];
  doorSeals: { door: number; img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }[] = [];
  flickers: { light: Light; base: number; ph: number; glow?: Phaser.GameObjects.Image }[] = [];
  /** How long the bake took (ms, in the worker when there is one) and the texture upload (main thread). */
  bakeMs = 0;
  uploadMs = 0;
  private shimmer: Phaser.GameObjects.Image[] = [];
  private propLights: { prop: Prop; light: Light; glow: Phaser.GameObjects.Image | null; emit: Phaser.GameObjects.Image | null; base: number }[] = [];
  private flies: Firefly[] = [];

  constructor(private scene: Phaser.Scene, public room: RoomData, public zone: Zone, private seed: number, readonly baked: BakedRoom) {
    const t0 = performance.now();
    this.build();
    this.bakeMs = baked.ms;
    this.uploadMs = performance.now() - t0;
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T { this.objects.push(o); return o; }

  /** Upload a baked image as a texture (or reuse it, when the previous view had the same bake) and
   *  place it at world (x, y) (top-left) drawn at 1/d scale. */
  private image(c: ImageSrc, i: number, d: number, x: number, y: number, depth: number, additive = false) {
    const key = `room:${this.baked.key}:${i}`;
    if (!this.scene.textures.exists(key)) this.scene.textures.addImage(key, c as unknown as HTMLImageElement);
    this.textureKeys.push(key);
    const img = this.scene.add.image(x, y, key).setOrigin(0).setScale(1 / d).setDepth(depth);
    if (additive) img.setBlendMode(Phaser.BlendModes.ADD);
    return this.add(img);
  }

  private build() {
    const s = this.scene, r = this.room, b = this.baked;
    const propEmit = new Map<number, Phaser.GameObjects.Image>();
    for (let i = 0; i < b.images.length; i++) {
      const im = b.images[i];
      const depth = im.emissive ? DEPTH.glow : im.kind === 'floor' ? DEPTH.floor : ySort(im.sortY);
      const img = this.image(im.src, i, im.d, im.x, im.y, depth, im.emissive);
      if (im.emissive && im.propId !== undefined) propEmit.set(im.propId, img);
    }
    for (const bl of b.lights) {
      const p = r.props.find((q) => q.id === bl.propId);
      if (!p) continue;
      const l: Light = { x: bl.x, y: bl.y, r: bl.r, color: bl.color, i: bl.i };
      this.lights.push(l);
      if (p.kind === 'L') {
        const g = this.add(s.add.image(l.x, l.y, 'glow').setDisplaySize(18, 18).setTint(l.color).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow));
        this.flickers.push({ light: l, base: l.i, ph: Math.random() * 10, glow: g });
      } else if ('WVUHCKB'.includes(p.kind)) {
        const g = p.kind === 'K' ? this.add(s.add.image(l.x, l.y, 'glow').setDisplaySize(30, 30).setTint(l.color).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow)) : null;
        this.propLights.push({ prop: p, light: l, glow: g, emit: propEmit.get(p.id) ?? null, base: l.i });
      }
    }
    const M = roomMap(r, this.seed);

    // ---- lights from the map ----
    for (let ty = 0; ty < r.h; ty++) for (let tx = 0; tx < r.w; tx++) {
      const c = r.ch(tx, ty);
      const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
      if (c === 'l' && r.ch(tx, ty + 1) !== 'l' && !'#bl'.includes(r.ch(tx, ty + 1))) this.lamp(tx * TILE + 8, (ty + 1) * TILE - 16, 0xff9a3a, 100, 0.85);
      if (c === '*') this.lights.push({ x: cx, y: cy, r: 26, color: LOOKS[this.zone].flowerGlow, i: 0.4 });
      if (c === 'R') this.lights.push({ x: cx, y: cy, r: 50, color: 0xd99a40, i: 0.35 });
      if (c === '_' && this.zone === 'foundry' && (tx + ty) % 2 === 0) {
        const l: Light = { x: cx, y: cy, r: 48, color: 0xff6a20, i: 0.75 };
        this.lights.push(l);
        this.flickers.push({ light: l, base: 0.75, ph: tx * 1.7 + ty });
      }
      if (c === '~' && r.ch(tx - 1, ty) !== '~' && r.ch(tx, ty - 1) !== '~') {
        let w = 0, h = 0;
        while (r.ch(tx + w, ty) === '~') w++;
        while (r.ch(tx, ty + h) === '~') h++;
        this.lights.push({ x: (tx + w / 2) * TILE, y: (ty + h / 2) * TILE, r: 40 + Math.max(w, h) * 12, color: 0x30d0c8, i: 0.8 });
        this.water.push({ x: tx * TILE, y: ty * TILE, w: w * TILE, h: h * TILE });
      }
    }
    for (const wp of this.water) {
      const img = this.add(s.add.image(wp.x + wp.w / 2, wp.y + wp.h / 2, 'glow').setDisplaySize(wp.w * 1.2, wp.h * 1.2).setTint(0x2ab8b0).setAlpha(0.12).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow));
      this.shimmer.push(img);
    }

    // ---- doors: a seal of light while locked ----
    r.doors.forEach((dr, i) => {
      const minX = Math.min(...dr.cells.map((c) => c.tx)), maxX = Math.max(...dr.cells.map((c) => c.tx));
      const maxY = Math.max(...dr.cells.map((c) => c.ty));
      const w = (maxX - minX + 1) * TILE;
      if (dr.side === 'n') this.lights.push({ x: dr.x, y: (maxY + 1) * TILE - 10, r: 46, color: 0x6c7cff, i: 0.2 });
      const sealY = (maxY + 1) * TILE - 6;
      const seal = this.add(s.add.image(dr.x, sealY, 'white').setDisplaySize(w, 3).setTint(0xffb050).setBlendMode(Phaser.BlendModes.ADD).setDepth(ySort(sealY + 1)));
      const glow = this.add(s.add.image(dr.x, sealY - 8, 'glow').setDisplaySize(w * 1.4, 26).setTint(0xff9a3a).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow));
      this.doorSeals.push({ door: i, img: seal, glow });
    });

    // ---- fireflies over the growth ----
    const R = rng(this.seed + 77);
    const spots: [number, number][] = [];
    for (let ty = 0; ty < r.h; ty++) for (let tx = 0; tx < r.w; tx++) {
      const c = r.ch(tx, ty);
      if ((c === 'F' && M.distAt(tx, ty) <= 2) || c === '"' || c === '*') spots.push([tx, ty]);
    }
    const nFlies = Math.min(48, Math.floor(spots.length * 0.12));
    const col = LOOKS[this.zone].firefly;
    for (let i = 0; i < nFlies && spots.length; i++) {
      const [tx, ty] = spots[Math.floor(R() * spots.length)];
      const img = this.add(s.add.image(0, 0, 'glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow));
      this.flies.push({ img, x: (tx + R()) * TILE, y: (ty + R()) * TILE - 10, ph: R() * 100, sp: 0.4 + R() * 0.8, r: 2.2 + R() * 1.6 });
    }
  }

  private lamp(x: number, y: number, color: number, r: number, i: number) {
    const l: Light = { x, y, r, color, i };
    this.lights.push(l);
    const g = this.add(this.scene.add.image(x, y, 'glow').setDisplaySize(18, 18).setTint(color).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow));
    this.flickers.push({ light: l, base: i, ph: Math.random() * 10, glow: g });
  }

  update(t: number, doorsOpen: boolean[]) {
    for (const f of this.flickers) {
      const k = 0.92 + Math.sin(t * 7.3 + f.ph) * 0.04 + Math.sin(t * 13.1 + f.ph * 2) * 0.03;
      f.light.i = f.base * k;
      f.glow?.setAlpha(0.32 * k);
    }
    for (const pl of this.propLights) {
      // Lore lanterns light up when kindled; spent rewards dim; braziers flicker.
      const k = pl.prop.kind;
      let on = 1;
      if (k === 'K') on = pl.prop.lit ? 1 : 0;
      else if ((k === 'U' || k === 'H' || k === 'C') && pl.prop.used) on = 0.25;
      else if ((k === 'U' || k === 'H' || k === 'C') && !pl.prop.interact) on = 0.45;
      const fl = k === 'B' ? 0.85 + Math.sin(t * 11 + pl.light.x) * 0.08 + Math.sin(t * 23) * 0.05 : 0.95 + Math.sin(t * 2 + pl.light.x) * 0.05;
      pl.light.i += (pl.base * on * fl - pl.light.i) * 0.1;
      const a = pl.light.i / pl.base;
      pl.glow?.setAlpha(0.55 * a);
      pl.emit?.setAlpha(Math.min(1, 0.35 + 0.65 * a));
    }
    this.shimmer.forEach((img, i) => img.setAlpha(0.1 + Math.sin(t * 1.3 + i) * 0.04));
    for (const f of this.flies) {
      const k = t * f.sp + f.ph;
      const x = f.x + Math.sin(k * 0.7) * 9 + Math.sin(k * 1.9) * 3, y = f.y + Math.cos(k * 0.53) * 6 + Math.sin(k * 2.3) * 2;
      const blink = Math.max(0, Math.sin(k * 1.7) * 0.6 + Math.sin(k * 4.1) * 0.25 + 0.35);
      f.img.setPosition(x, y).setDisplaySize(f.r * 2, f.r * 2).setAlpha(Math.min(1, blink));
    }
    for (const s of this.doorSeals) {
      const open = doorsOpen[s.door];
      const target = open ? 0 : 1;
      const a = s.img.alpha + (target - s.img.alpha) * 0.08;
      s.img.setAlpha(a * (0.8 + Math.sin(t * 6) * 0.2));
      s.glow.setAlpha(a * 0.5);
    }
  }

  /** Remove the view; keepTextures leaves the baked textures for a new view of the same bake. */
  destroy(keepTextures = false) {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    if (!keepTextures) {
      for (const k of this.textureKeys) if (this.scene.textures.exists(k)) this.scene.textures.remove(k);
      release(this.baked);
    }
    this.textureKeys = [];
    this.lights = [];
    this.flies = [];
  }
}
