// Turns a parsed room into display objects: the baked floor, one depth-sorted strip per tile row of
// tall scenery, prop sprites, door arches and seals, animated water, and the room's static lights.
import Phaser from 'phaser';
import { ART_SCALE, TILE, WALL_H } from '../config';
import type { Prop } from '../sim/types';
import { makeCanvas, Pix } from '../art/pix';
import { bakeFloor, bakeProp, bakeRowStrip, STRIP_H } from '../art/env';
import type { RoomData, Zone } from '../sim/level/rooms';
import type { Light } from './lighting';

export const DEPTH = { floor: 0, decal: 2, telegraph: 5, world: 1000, light: 50000, glow: 50001, fx: 50002, ui: 60000 };
export const ySort = (y: number) => DEPTH.world + y;

function pixTexture(scene: Phaser.Scene, key: string, pix: Pix) {
  const c = makeCanvas(pix.w * ART_SCALE, pix.h * ART_SCALE);
  pix.drawTo(c.getContext('2d')!, 0, 0);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
}

function alphaBox(p: Pix, x0: number, y0: number, w: number, h: number) {
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (p.d[(y * p.w + x) * 4 + 3] === 0) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function cropPix(p: Pix, x0: number, y0: number, w: number, h: number): Pix {
  const out = new Pix(w, h);
  for (let y = 0; y < h; y++) out.d.set(p.d.subarray(((y0 + y) * p.w + x0) * 4, ((y0 + y) * p.w + x0 + w) * 4), y * w * 4);
  return out;
}

export interface WaterPatch { x: number; y: number; w: number; h: number }

export class RoomView {
  objects: Phaser.GameObjects.GameObject[] = [];
  textureKeys: string[] = [];
  lights: Light[] = [];
  water: WaterPatch[] = [];
  doorSeals: { door: number; img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }[] = [];
  flickers: { light: Light; base: number; ph: number }[] = [];
  private shimmer: Phaser.GameObjects.Image[] = [];
  private propLights: { prop: Prop; light: Light; glow: Phaser.GameObjects.Image; base: number }[] = [];

  constructor(private scene: Phaser.Scene, public room: RoomData, public zone: Zone, private seed: number) {
    this.build();
  }

  private tex(key: string, pix: Pix) {
    pixTexture(this.scene, key, pix);
    this.textureKeys.push(key);
  }
  private add<T extends Phaser.GameObjects.GameObject>(o: T): T { this.objects.push(o); return o; }

  private build() {
    const s = this.scene, r = this.room;
    const inv = 1 / ART_SCALE;
    const tag = `room${Math.floor(Math.random() * 1e9)}`;
    // Floor.
    const floor = bakeFloor(r, this.zone, this.seed);
    this.tex(`${tag}_floor`, floor);
    this.add(s.add.image(0, 0, `${tag}_floor`).setOrigin(0).setScale(inv).setDepth(DEPTH.floor));
    // Tall rows.
    for (let ty = 0; ty < r.h; ty++) {
      const strip = bakeRowStrip(r, this.zone, ty, this.seed);
      if (!strip) continue;
      // Split each row into 256 px chunks cropped to what they hold: far less texture memory and overdraw.
      const baseY = (ty + 1) * TILE;
      for (let cx0 = 0; cx0 < strip.w; cx0 += 256) {
        const box = alphaBox(strip, cx0, 0, Math.min(256, strip.w - cx0), strip.h);
        if (!box) continue;
        const key = `${tag}_row${ty}_${cx0}`;
        this.tex(key, cropPix(strip, box.x, box.y, box.w, box.h));
        this.add(s.add.image(box.x, baseY - STRIP_H + box.y, key).setOrigin(0).setScale(inv).setDepth(ySort(baseY)));
      }
    }
    // Props.
    for (const p of r.props) {
      const art = bakeProp(p.kind, p.tw, p.th, this.zone, this.seed + p.id * 13);
      const key = `${tag}_prop${p.id}`;
      this.tex(key, art.pix);
      const footY = (p.ty + p.th) * TILE;
      const x = p.tx * TILE - art.ox, y = footY - art.oy - 1;
      this.add(s.add.image(x, y, key).setOrigin(0).setScale(inv).setDepth(ySort(footY - 2)));
      if (p.kind === 'L') this.lamp(p.tx * TILE + 8, footY - 27, 0xff9a3a, 100, 0.8);
      if (p.kind === 'O') this.lights.push({ x: (p.tx + p.tw / 2) * TILE, y: footY - 40, r: 60, color: 0xd9a650, i: 0.35 });
      if (p.kind === 's') this.lights.push({ x: p.tx * TILE + 18, y: footY - 20, r: 30, color: 0xffb04a, i: 0.3 });
      const cx = p.tx * TILE + 8;
      const glowFor: Record<string, [number, number, number, number]> = {
        // y offset above the foot, light radius, colour, intensity
        W: [24, 60, 0xffb050, 0.8], V: [26, 60, 0xffe0a0, 0.7], U: [30, 80, 0xff9a40, 0.9], H: [14, 70, 0xff6a8a, 0.8],
        C: [10, 56, 0x60e0ff, 0.7], K: [31, 70, 0xffa040, 0.9], B: [16, 84, 0xff7a2a, 1.0],
      };
      const gf = glowFor[p.kind];
      if (gf) {
        const l: Light = { x: cx, y: footY - gf[0], r: gf[1], color: gf[2], i: gf[3] };
        this.lights.push(l);
        const g = this.add(s.add.image(cx, footY - gf[0], 'glow').setDisplaySize(30, 30).setTint(gf[2]).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow));
        this.propLights.push({ prop: p, light: l, glow: g, base: gf[3] });
      }
    }
    // Lights from the map.
    for (let ty = 0; ty < r.h; ty++) for (let tx = 0; tx < r.w; tx++) {
      const c = r.ch(tx, ty);
      const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
      if (c === 'l') this.lamp(tx * TILE + 8.5, (ty + 1) * TILE - WALL_H + 9, 0xff9a3a, 100, 0.85);
      if (c === '*') this.lights.push({ x: cx, y: cy, r: 26, color: 0x5fe0d0, i: 0.45 });
      if (c === 'R') this.lights.push({ x: cx, y: cy, r: 50, color: 0xd99a40, i: 0.35 });
      if (c === '_' && this.zone === 'foundry' && (tx + ty) % 2 === 0) {
        const l: Light = { x: cx, y: cy, r: 48, color: 0xff6a20, i: 0.75 };
        this.lights.push(l);
        this.flickers.push({ light: l, base: 0.75, ph: tx * 1.7 + ty });
        this.add(s.add.image(cx, cy, 'glow').setDisplaySize(40, 34).setTint(0xff5a10).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow));
      }
      if (c === '~' && r.ch(tx - 1, ty) !== '~' && r.ch(tx, ty - 1) !== '~') {
        // One light and one shimmer patch per pool (top-left corner of each pool).
        let w = 0, h = 0;
        while (r.ch(tx + w, ty) === '~') w++;
        while (r.ch(tx, ty + h) === '~') h++;
        this.lights.push({ x: (tx + w / 2) * TILE, y: (ty + h / 2) * TILE, r: 40 + Math.max(w, h) * 12, color: 0x30d0c8, i: 0.8 });
        this.water.push({ x: tx * TILE, y: ty * TILE, w: w * TILE, h: h * TILE });
      }
    }
    for (const wp of this.water) {
      const img = this.add(s.add.image(wp.x + wp.w / 2, wp.y + wp.h / 2, 'glow').setDisplaySize(wp.w * 1.3, wp.h * 1.3).setTint(0x2ab8b0).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow));
      this.shimmer.push(img);
    }
    // Doors: an arch over each, and a seal of light while locked.
    r.doors.forEach((d, i) => {
      const minX = Math.min(...d.cells.map((c) => c.tx)), maxX = Math.max(...d.cells.map((c) => c.tx));
      const maxY = Math.max(...d.cells.map((c) => c.ty));
      const w = (maxX - minX + 1) * TILE;
      if (d.side === 'n') {
        const key = `${tag}_arch${i}`;
        this.tex(key, archPix(w));
        const baseY = (maxY + 1) * TILE;
        this.add(s.add.image(minX * TILE - 6, baseY - 54 - 4, key).setOrigin(0).setScale(inv).setDepth(ySort(baseY - 1)));
        this.lights.push({ x: d.x, y: baseY - 10, r: 46, color: 0x6c7cff, i: 0.2 });
      }
      const sealY = (maxY + 1) * TILE - 6;
      const seal = this.add(s.add.image(d.x, sealY, 'white').setDisplaySize(w, 4).setTint(0xffb050).setBlendMode(Phaser.BlendModes.ADD).setDepth(ySort(sealY + 1)));
      const glow = this.add(s.add.image(d.x, sealY - 8, 'glow').setDisplaySize(w * 1.4, 26).setTint(0xff9a3a).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow));
      this.doorSeals.push({ door: i, img: seal, glow });
    });
  }

  private lamp(x: number, y: number, color: number, r: number, i: number) {
    const l: Light = { x, y, r, color, i };
    this.lights.push(l);
    this.flickers.push({ light: l, base: i, ph: Math.random() * 10 });
    const g = this.add(this.scene.add.image(x, y, 'glow').setDisplaySize(26, 26).setTint(color).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow));
    (l as Light & { glow?: Phaser.GameObjects.Image }).glow = g;
  }

  update(t: number, doorsOpen: boolean[]) {
    for (const f of this.flickers) {
      const k = 0.92 + Math.sin(t * 7.3 + f.ph) * 0.04 + Math.sin(t * 13.1 + f.ph * 2) * 0.03;
      f.light.i = f.base * k;
      const g = (f.light as Light & { glow?: Phaser.GameObjects.Image }).glow;
      if (g) g.setAlpha(0.45 * k);
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
      pl.glow.setAlpha(0.5 * (pl.light.i / pl.base));
    }
    this.shimmer.forEach((img, i) => img.setAlpha(0.3 + Math.sin(t * 1.3 + i) * 0.06));
    for (const s of this.doorSeals) {
      const open = doorsOpen[s.door];
      const target = open ? 0 : 1;
      const a = s.img.alpha + (target - s.img.alpha) * 0.08;
      s.img.setAlpha(a * (0.8 + Math.sin(t * 6) * 0.2));
      s.glow.setAlpha(a * 0.5);
    }
  }

  destroy() {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    for (const k of this.textureKeys) if (this.scene.textures.exists(k)) this.scene.textures.remove(k);
    this.textureKeys = [];
    this.lights = [];
  }
}

/** A ruined stone arch spanning a north door. */
function archPix(innerW: number): Pix {
  // Imported lazily to keep this file about display objects.
  return makeArch(innerW);
}

import { Pix as PixC, shade } from '../art/pix';
import { P } from '../art/palette';
function makeArch(innerW: number): PixC {
  const W = innerW + 12, H = 58;
  const p = new PixC(W, H);
  const st = [P.stoneD, P.stone, P.stoneM, P.stoneL, P.stoneH];
  // Two piers.
  for (const x0 of [0, W - 7]) {
    for (let y = 16; y < H; y++) for (let x = 0; x < 7; x++) {
      let c = x < 2 ? st[3] : x < 5 ? st[2] : st[1];
      if (y % 6 === 0) c = P.grout;
      p.set(x0 + x, y, c);
    }
  }
  // The arch: voussoirs around a semicircle.
  const cx = W / 2, cy = 26, R = W / 2, r = innerW / 2;
  for (let y = 0; y < cy + 1; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.25);
    if (d > R || d < r) continue;
    const a = Math.atan2(y - cy, x - cx);
    const seg = Math.floor((a + Math.PI) * 4);
    let c = (seg % 2 ? st[2] : st[3]);
    if (Math.abs(((a + Math.PI) * 4) % 1) < 0.08) c = P.grout;
    if (d > R - 1.2) c = shade(c, 0.15);
    p.set(x, y, c);
  }
  // Keystone with a sun mark.
  p.rect(cx - 3, 0, 6, 8, st[3]);
  p.set(cx - 0.5, 3, P.brass); p.set(cx + 0.5, 3, P.brass);
  // Ivy.
  for (let k = 0; k < 26; k++) p.set(2 + ((k * 5) % (W - 4)), 10 + ((k * 7) % 20), k % 2 ? P.leafM : P.leafL);
  p.outline(P.ink2);
  return p;
}
