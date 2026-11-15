// The floor of a room, painted in vectors: irregular flagstones in running bond (each with a convex
// gradient, a bevel, chips and the odd crack), small setts along paths, dark earth and moss where the
// ruin is overgrown, deep jungle canopy around the edges, glowing pools, pits (magma in the foundry),
// rune circles, stairs into the dark beyond north doors, and soft contact shadows under walls,
// foliage and props. The room is planned once as a list of drawing ops with bounds, then painted
// chunk by chunk (each chunk becomes one texture) by replaying the ops that touch it.
import { TILE } from '../../config';
import type { Prop } from '../../sim/types';
import type { Zone } from '../../sim/level/rooms';
import { blobPath, css, grain, lin, mix, rad, rng, roundPoly, shade, slab, TAU, type Ctx } from '../paint';
import { foliageKit, putStamp, type FoliageKit } from './foliage';
import { LOOKS, type EnvLook } from './look';
import { isWallCh, type RoomMap } from './map';

interface Op { x0: number; y0: number; x1: number; y1: number; draw: (g: Ctx, e: Ctx) => void; k?: string }
export interface FloorPlan { base: Op[]; over: Op[]; L: EnvLook; seed: number }

const op = (x0: number, y0: number, x1: number, y1: number, draw: Op['draw'], k?: string): Op => ({ x0, y0, x1, y1, draw, k });

interface Stone { x: number; y: number; w: number; h: number; pts: number[]; tone: number; hue: number; crack: number; worn: number; drawn: boolean }

export function planFloor(M: RoomMap, zone: Zone, seed: number, kit: FoliageKit, props: Prop[]): FloorPlan {
  const L = LOOKS[zone];
  const R = rng(seed * 7 + 3);
  const base: Op[] = [], over: Op[] = [];
  const { W, H, ch } = M;
  const ruinN = (() => { const r2 = rng(seed + 5); const ph = r2() * 100; return (x: number, y: number) => 0.5 + 0.25 * Math.sin(x / 61 + ph) * Math.cos(y / 47 - ph) + 0.25 * Math.sin((x + y) / 29 + ph * 2); })();

  // ---- flagstones: random ashlar, rectangles of many sizes packed on a 6-unit grid ----------------
  const C = 6;
  const cw = Math.ceil(W / C) + 2, chh = Math.ceil(H / C) + 2;
  const cellId = new Int32Array(cw * chh).fill(-1);
  const stones: Stone[] = [];
  for (let gy = 0; gy < chh; gy++) for (let gx = 0; gx < cw; gx++) {
    if (cellId[gy * cw + gx] >= 0) continue;
    const big = R() < 0.07;
    let sw = big ? 5 + Math.floor(R() * 2) : 2 + Math.floor(R() * 3.6);
    let sh = big ? 3 : 2 + (R() < 0.3 ? 1 : 0);
    const free = (i: number, j: number) => gx + i < cw && gy + j < chh && cellId[(gy + j) * cw + gx + i] < 0;
    while (sw > 1 && ![...Array(sw).keys()].every((i) => free(i, 0))) sw--;
    while (sh > 1 && ![...Array(sw).keys()].every((i) => free(i, sh - 1))) sh--;
    const k = stones.length;
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) cellId[(gy + j) * cw + gx + i] = k;
    const x = (gx - 1) * C, y = (gy - 1) * C, w = sw * C, h = sh * C;
    const gap = 0.5;
    const J = () => (R() - 0.5) * 1.4;
    const pts = [x + gap + J(), y + gap + J() * 0.7, x + w - gap + J(), y + gap + J() * 0.7, x + w - gap + J(), y + h - gap + J() * 0.7, x + gap + J(), y + h - gap + J() * 0.7];
    stones.push({ x, y, w, h, pts, tone: R(), hue: R(), crack: R(), worn: R(), drawn: false });
  }
  const stoneAt = (x: number, y: number): Stone | null => {
    const gx = Math.floor(x / C) + 1, gy = Math.floor(y / C) + 1;
    if (gx < 0 || gy < 0 || gx >= cw || gy >= chh) return null;
    const k = cellId[gy * cw + gx];
    return k >= 0 ? stones[k] : null;
  };
  const rows = [{ stones }];
  const stoneCol = (s: Stone, ruin: number) => {
    const t = 0.35 + s.tone * 2.3 - ruin * 0.35;
    const i = Math.max(0, Math.min(L.stone.length - 2, Math.floor(t)));
    let c = mix(L.stone[i], L.stone[i + 1], Math.max(0, Math.min(1, t - i)));
    if (s.hue < 0.16) c = mix(c, L.moss, 0.16);
    else if (s.hue > 0.86) c = mix(c, 0x6e5a48, 0.16);
    else if (s.hue > 0.7) c = mix(c, 0x5c6a86, 0.1);
    return c;
  };
  for (const r of rows) for (const s of r.stones) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const m = M.matAt(cx, cy);
    if (m === 'grass' || m === 'canopy') {
      // Now and then a stone half-sunk in the growth.
      if (m === 'grass' && R() < 0.22) {
        s.drawn = true;
        base.push(op(s.x, s.y, s.x + s.w, s.y + s.h, (g) => drawStone(g, s, mix(stoneCol(s, 0.6), L.moss, 0.3), true), 'sunk'));
      }
      continue;
    }
    if (m !== 'flag' && m !== 'shallow') continue;
    s.drawn = true;
    const ruin = ruinN(cx, cy);
    // In the most ruined stretches whole stones are gone; earth and weeds fill the hole.
    if (ruin > 0.78 && s.worn < (ruin - 0.78) * 4 && m === 'flag') {
      s.drawn = false;
      const sx = s.x, sy = s.y, sw = s.w, sh = s.h, sd = Math.floor(R() * 1e6);
      base.push(op(sx, sy, sx + sw, sy + sh, (g) => {
        roundPoly(g, s.pts, 2);
        g.fillStyle = rad(g, sx + sw / 2, sy + sh / 2, 0, Math.max(sw, sh) * 0.7, [[0, css(mix(L.soil, L.moss, 0.35))], [1, css(shade(L.soil, -0.3))]]);
        g.fill();
        const r2 = rng(sd);
        for (let k = 0; k < 2 + Math.floor(sw * sh / 70); k++) putStamp(g, null, kit.sprig[Math.floor(r2() * kit.sprig.length)], sx + 3 + r2() * (sw - 6), sy + 4 + r2() * (sh - 4), { flip: r2() < 0.5, scale: 0.75 + r2() * 0.4 });
      }, 'hole'));
      continue;
    }
    const col = stoneCol(s, ruin);
    base.push(op(s.x - 1, s.y - 1, s.x + s.w + 1, s.y + s.h + 1, (g) => drawStone(g, s, col, false, ruin), 'stone'));
  }

  function drawStone(g: Ctx, s: Stone, col: number, sunk: boolean, ruin = 0) {
    const body = rad(g, s.x + s.w * 0.4, s.y + s.h * 0.36, 0, Math.max(s.w, s.h) * 0.78, [[0, css(shade(col, 0.09))], [0.55, css(col)], [1, css(shade(col, -0.17))]]);
    slab(g, s.pts, s.worn > 0.6 ? 2.6 : 1.7, body, css(shade(col, sunk ? 0.08 : 0.2)), css(shade(col, sunk ? -0.2 : -0.36)), 0.42, 0.55);
    const r = rng(Math.floor(s.x * 31 + s.y * 17));
    // Chipped corners.
    if (s.worn > 0.55) {
      const k = Math.floor(r() * 4);
      const px = s.pts[k * 2], py = s.pts[k * 2 + 1];
      blobPath(g, px + (k === 1 || k === 2 ? -1 : 1) * 0.6, py + (k >= 2 ? -1 : 1) * 0.5, 1.4 + r() * 1.2, 1.1 + r() * 0.9, r, 6, 0.3);
      g.fillStyle = css(shade(L.grout, 0.05)); g.fill();
    }
    // Pits and flecks.
    for (let i = 0; i < 3 + Math.floor(s.w * s.h / 160); i++) {
      const fx = s.x + 2 + r() * (s.w - 4), fy = s.y + 2 + r() * (s.h - 4);
      g.beginPath(); g.ellipse(fx, fy, 0.35 + r() * 0.5, 0.25 + r() * 0.35, 0, 0, TAU);
      g.fillStyle = css(i ? shade(col, -0.35) : shade(col, 0.25), 0.55); g.fill();
    }
    // A crack, a dark groove with its lower lip catching the light.
    if (s.crack > 0.86 - ruin * 0.2) {
      const fromTop = r() < 0.5;
      const pts: number[] = [];
      let x = fromTop ? s.x + s.w * (0.2 + r() * 0.6) : s.x + 1, y = fromTop ? s.y + 1 : s.y + s.h * (0.25 + r() * 0.5);
      const steps = 4 + Math.floor(r() * 3);
      const tx = fromTop ? s.x + s.w * (0.15 + r() * 0.7) : s.x + s.w - 1, ty = fromTop ? s.y + s.h - 1 : s.y + s.h * (0.2 + r() * 0.6);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        pts.push(x + (tx - x) * t + (i && i < steps ? (r() - 0.5) * 2.2 : 0), y + (ty - y) * t + (i && i < steps ? (r() - 0.5) * 1.6 : 0));
      }
      const line = (dx: number, dy: number, w: number, c: string) => {
        g.beginPath(); g.moveTo(pts[0] + dx, pts[1] + dy);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] + dx, pts[i + 1] + dy);
        g.lineWidth = w; g.strokeStyle = c; g.stroke();
      };
      line(0.28, 0.3, 0.32, css(shade(col, 0.3), 0.5));
      line(0, 0, 0.42, css(shade(col, -0.55), 0.9));
    }
  }

  // ---- broad damp stains and worn patches, so no stretch of floor reads as one repeating tile -------
  {
    const r2 = rng(seed * 3 + 11);
    const n = Math.round(W * H / 5000);
    for (let i = 0; i < n; i++) {
      const x = r2() * W, y = r2() * H, rx = 16 + r2() * 48, ry = rx * (0.45 + r2() * 0.35);
      const dark = r2() < 0.7;
      const a = dark ? 0.16 + r2() * 0.24 : 0.07 + r2() * 0.08;
      const col = dark ? (r2() < 0.4 ? mix(L.grout, L.moss, 0.45) : L.grout) : L.stone[4];
      base.push(op(x - rx, y - ry, x + rx, y + ry, (g) => {
        g.save();
        g.translate(x, y); g.scale(1, ry / rx);
        g.fillStyle = rad(g, 0, 0, 0, rx, [[0, css(col, a)], [0.5, css(col, a * 0.65)], [1, css(col, 0)]]);
        g.fillRect(-rx, -rx, rx * 2, rx * 2);
        g.restore();
      }, 'stain'));
    }
  }

  // ---- setts along paths -------------------------------------------------------------------------
  for (let y = 0; y < H; y += 5.2) {
    const rowOff = (Math.floor(y / 5.2) % 2) * 3.1;
    for (let x = -rowOff; x < W; x += 6.2) {
      const cx = x + 3.1, cy = y + 2.6;
      if (M.matAt(cx, cy) !== 'cobble') continue;
      const under = stoneAt(cx, cy);
      if (under && under.drawn) continue;
      const sd = R();
      const pts = [x + 0.4 + (R() - 0.5) * 0.6, y + 0.35, x + 5.8 + (R() - 0.5) * 0.6, y + 0.35 + (R() - 0.5) * 0.4, x + 5.8 + (R() - 0.5) * 0.6, y + 4.85, x + 0.4 + (R() - 0.5) * 0.6, y + 4.85 + (R() - 0.5) * 0.4];
      const col = mix(L.stone[1], L.stone[3], sd * 0.9);
      base.push(op(x, y, x + 6.2, y + 5.2, (g) => {
        roundPoly(g, pts, 1.6);
        g.fillStyle = rad(g, cx - 1.2, cy - 1.1, 0, 4.2, [[0, css(shade(col, 0.16))], [0.6, css(col)], [1, css(shade(col, -0.3))]]);
        g.fill();
        g.lineWidth = 0.3; g.strokeStyle = css(shade(col, -0.55), 0.6); g.stroke();
      }, 'sett'));
    }
  }

  // ---- pools, pits and stairs (over the stones) ----------------------------------------------------
  const pools: { x: number; y: number; w: number; h: number }[] = [];
  const pits: { x: number; y: number; w: number; h: number }[] = [];
  for (let ty = 0; ty < M.room.h; ty++) for (let tx = 0; tx < M.room.w; tx++) {
    for (const [c, list] of [['~', pools], ['_', pits]] as const) {
      if (ch(tx, ty) !== c || ch(tx - 1, ty) === c || ch(tx, ty - 1) === c) continue;
      let w = 0, h = 0;
      while (ch(tx + w, ty) === c) w++;
      while (ch(tx, ty + h) === c) h++;
      list.push({ x: tx * TILE, y: ty * TILE, w: w * TILE, h: h * TILE });
    }
  }
  for (const p of pools) base.push(op(p.x - 4, p.y - 4, p.x + p.w + 4, p.y + p.h + 4, (g, e) => pool(g, e, p.x, p.y, p.w, p.h, Math.floor(p.x * 13 + p.y)), 'pool'));
  for (const p of pits) base.push(op(p.x - 2, p.y - 2, p.x + p.w + 2, p.y + p.h + 2, (g, e) => (zone === 'foundry' ? magma(g, e, p.x, p.y, p.w, p.h, Math.floor(p.x + p.y * 7)) : chasm(g, p.x, p.y, p.w, p.h)), 'pit'));
  for (const d of M.room.doors) {
    if (d.side !== 'n') continue;
    const minX = Math.min(...d.cells.map((c) => c.tx)), maxX = Math.max(...d.cells.map((c) => c.tx)), maxY = Math.max(...d.cells.map((c) => c.ty));
    const x0 = minX * TILE, x1 = (maxX + 1) * TILE, y1 = (maxY + 1) * TILE;
    base.push(op(x0 - 2, 0, x1 + 2, y1 + 2, (g) => stairs(g, x0, x1, y1), 'stairs'));
  }

  function pool(g: Ctx, e: Ctx, x: number, y: number, w: number, h: number, sd: number) {
    const r = rng(sd);
    const path = (gg: Ctx) => { roundPoly(gg, [x - 2, y - 2, x + w + 2, y - 2, x + w + 2, y + h + 2, x - 2, y + h + 2], 5); };
    path(g);
    g.fillStyle = rad(g, x + w * 0.55, y + h * 0.6, 0, Math.max(w, h) * 0.75, [[0, css(L.water[1])], [0.7, css(mix(L.water[0], L.water[1], 0.5))], [1, css(L.water[0])]]);
    g.fill();
    g.save();
    path(g); g.clip();
    // Sunken stones on the bottom.
    for (let i = 0; i < (w * h) / 60; i++) {
      blobPath(g, x + r() * w, y + r() * h, 2 + r() * 3.5, 1.5 + r() * 2.5, r, 7, 0.25);
      g.fillStyle = css(L.water[0], 0.45); g.fill();
    }
    caustics(g, x - 2, y - 2, w + 4, h + 4, r, css(L.water[2], 0.55), 0.38);
    // The rim's shadow on the water (top and left).
    g.fillStyle = lin(g, x, y - 2, x, y + 7, [[0, css(0x021015, 0.75)], [1, css(0x021015, 0)]]);
    g.fillRect(x - 2, y - 2, w + 4, 9);
    g.fillStyle = lin(g, x - 2, y, x + 5, y, [[0, css(0x021015, 0.5)], [1, css(0x021015, 0)]]);
    g.fillRect(x - 2, y - 2, 7, h + 4);
    g.restore();
    // Glow.
    e.save();
    path(e); e.clip();
    e.globalCompositeOperation = 'lighter';
    e.fillStyle = rad(e, x + w * 0.5, y + h * 0.55, 0, Math.max(w, h) * 0.7, [[0, css(L.water[2], 0.42)], [1, css(L.water[1], 0.22)]]);
    e.fillRect(x - 2, y - 2, w + 4, h + 4);
    caustics(e, x - 2, y - 2, w + 4, h + 4, rng(sd), css(L.water[3], 0.5), 0.38);
    e.restore();
  }

  function caustics(g: Ctx, x: number, y: number, w: number, h: number, r: () => number, style: string, lw: number) {
    g.lineWidth = lw; g.strokeStyle = style;
    const s = 4.2;
    for (let yy = y; yy < y + h + s; yy += s) for (let xx = x - s; xx < x + w + s; xx += s) {
      blobPath(g, xx + (r() - 0.5) * 2, yy + (r() - 0.5) * 2, 2.2 + r() * 0.9, 1.8 + r() * 0.8, r, 6, 0.3);
      g.stroke();
    }
  }

  function chasm(g: Ctx, x: number, y: number, w: number, h: number) {
    g.fillStyle = css(0x04050a);
    g.fillRect(x, y, w, h);
    // The far (north) wall of the pit seen from above, dropping into the dark.
    g.fillStyle = lin(g, x, y, x, y + 10, [[0, css(L.wall[1])], [0.35, css(shade(L.wall[0], -0.4))], [1, css(0x04050a)]]);
    g.fillRect(x, y, w, 10);
    g.fillStyle = lin(g, x, y, x + 4, y, [[0, css(0x000000, 0.6)], [1, css(0x000000, 0)]]);
    g.fillRect(x, y, 4, h);
  }

  function magma(g: Ctx, e: Ctx, x: number, y: number, w: number, h: number, sd: number) {
    const r = rng(sd);
    // Molten bed.
    g.fillStyle = lin(g, x, y, x, y + h, [[0, css(0x7a2410)], [1, css(0xc24a16)]]);
    g.fillRect(x, y, w, h);
    e.save(); e.globalCompositeOperation = 'lighter';
    e.fillStyle = rad(e, x + w / 2, y + h / 2, 0, Math.max(w, h) * 0.7, [[0, css(0xffb050, 0.95)], [1, css(0xff5a14, 0.7)]]);
    e.fillRect(x, y, w, h);
    e.restore();
    // Floating crust plates; the light stays only in the cracks between them.
    for (let i = 0; i < (w * h) / 40; i++) {
      const px = x + r() * w, py = y + 3 + r() * (h - 3), rx = 3 + r() * 4, ry = 2.5 + r() * 3;
      const sdd = r() * 1e6;
      blobPath(g, px, py, rx, ry, rng(sdd), 7, 0.3);
      g.fillStyle = rad(g, px - rx * 0.3, py - ry * 0.4, 0, rx * 1.3, [[0, css(0x4a3430)], [1, css(0x1c1414)]]);
      g.fill();
      g.lineWidth = 0.35; g.strokeStyle = css(0xff9a40, 0.7); g.stroke();
      blobPath(e, px, py, rx * 0.92, ry * 0.92, rng(sdd), 7, 0.3);
      e.save(); e.globalCompositeOperation = 'destination-out'; e.fillStyle = '#000'; e.fill(); e.restore();
    }
    // Lip of the pit.
    g.fillStyle = lin(g, x, y, x, y + 5, [[0, css(shade(L.wall[0], -0.3))], [1, css(0x2a1410, 0)]]);
    g.fillRect(x, y, w, 5);
  }

  function stairs(g: Ctx, x0: number, x1: number, yMouth: number) {
    // Worn steps climbing north from the mouth of the passage, fading into the dark.
    const depth = yMouth;
    g.fillStyle = css(0x05060b);
    g.fillRect(x0, 0, x1 - x0, yMouth);
    const r = rng(Math.floor(x0 * 7));
    for (let y = yMouth, i = 0; y > 0; y -= 6, i++) {
      const t = (yMouth - y) / depth;
      const lum = Math.max(0, 1 - t * 1.35);
      if (lum <= 0) break;
      const tread = shade(mix(L.stone[2], L.stone[3], r()), -0.15);
      const pts = [x0 + 2, y - 6, x1 - 2, y - 6, x1 - 2, y, x0 + 2, y];
      roundPoly(g, pts, 0.8);
      g.fillStyle = lin(g, 0, y - 6, 0, y, [[0, css(shade(tread, -1 + lum))], [0.75, css(shade(tread, -1 + lum * 0.85))], [0.76, css(shade(L.stone[0], -1 + lum * 0.7))], [1, css(shade(L.stone[0], -1 + lum * 0.6))]]);
      g.fill();
      g.fillStyle = css(shade(tread, 0.3), 0.35 * lum);
      g.fillRect(x0 + 2, y - 6, x1 - x0 - 4, 0.6);
      if (r() < 0.3) { blobPath(g, x0 + 4 + r() * (x1 - x0 - 8), y - 1.5, 2, 1.2, r, 6, 0.3); g.fillStyle = css(L.moss, 0.6 * lum); g.fill(); }
    }
    // Passage side walls.
    for (const [sx, dir] of [[x0, 1], [x1, -1]] as const) {
      g.fillStyle = lin(g, sx, 0, sx + dir * 4, 0, [[0, css(shade(L.wall[0], -0.35))], [1, css(shade(L.wall[0], -0.6), 0)]]);
      g.fillRect(Math.min(sx, sx + dir * 4), 0, 4, yMouth);
    }
    g.fillStyle = lin(g, 0, 0, 0, yMouth, [[0, css(0x04050a, 1)], [0.55, css(0x04050a, 0.55)], [1, css(0x04050a, 0)]]);
    g.fillRect(x0, 0, x1 - x0, yMouth);
  }

  // ---- overgrowth: earth, moss and ground cover -----------------------------------------------------
  const grassTiles: [number, number][] = [];
  const tallBase: [number, number][] = [];
  for (let ty = 0; ty < M.room.h; ty++) for (let tx = 0; tx < M.room.w; tx++) {
    const c = ch(tx, ty);
    if (c === '"' || c === '*') grassTiles.push([tx, ty]);
    if (c === 'F') tallBase.push([tx, ty]);
  }
  // Earth and moss under growth and canopy, with soft, lumpy edges that spill onto the stones.
  for (const [tx, ty] of [...grassTiles, ...tallBase]) {
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    const sd = R() * 1e6;
    const canopy = ch(tx, ty) === 'F';
    over.push(op(cx - 16, cy - 16, cx + 16, cy + 16, (g) => {
      const r = rng(sd);
      if (canopy) {
        blobPath(g, cx, cy, 12.5, 12, r, 9, 0.22);
        g.fillStyle = css(shade(L.leaf[0], -0.2), 0.55); g.fill();
        blobPath(g, cx, cy, 10.5, 10, r, 9, 0.2);
        g.fillStyle = css(shade(L.leaf[0], -0.3)); g.fill();
        return;
      }
      // Damp earth and moss: a soft-edged patch, mottled.
      blobPath(g, cx, cy, 11.5, 11, r, 9, 0.25);
      g.fillStyle = css(mix(L.soil, L.moss, 0.45), 0.6); g.fill();
      blobPath(g, cx, cy, 9.5, 9, r, 9, 0.22);
      g.fillStyle = css(mix(L.soil, L.moss, 0.5), 0.85); g.fill();
      for (let i = 0; i < 6; i++) {
        blobPath(g, cx + (r() - 0.5) * 16, cy + (r() - 0.5) * 16, 2.5 + r() * 4, 2 + r() * 3, r, 7, 0.3);
        g.fillStyle = css(r() < 0.5 ? L.moss : L.mossL, 0.55 + r() * 0.35); g.fill();
      }
    }, 'earth'));
  }
  // Moss creeping into the joints of stones that border growth.
  for (const r0 of rows) for (const s of r0.stones) {
    if (!s.drawn) continue;
    const tx = Math.floor((s.x + s.w / 2) / TILE), ty = Math.floor((s.y + s.h / 2) / TILE);
    let near = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = ch(tx + dx, ty + dy); if (c === '"' || c === '*' || c === 'F') near++; }
    const ruin = ruinN(s.x, s.y);
    if (near === 0 && ruin < 0.66) continue;
    const sd = R() * 1e6;
    over.push(op(s.x - 3, s.y - 3, s.x + s.w + 3, s.y + s.h + 3, (g) => {
      const r = rng(sd);
      const n = Math.min(4, near + (ruin > 0.66 ? 1 : 0));
      for (let i = 0; i < n; i++) {
        const k = Math.floor(r() * 4);
        const px = s.pts[k * 2], py = s.pts[k * 2 + 1];
        blobPath(g, px, py, 1.6 + r() * 1.8, 1.2 + r() * 1.2, r, 6, 0.35);
        g.fillStyle = css(r() < 0.5 ? L.moss : L.mossL, 0.85); g.fill();
        if (r() < 0.45) putStamp(g, null, kit.sprig[Math.floor(r() * kit.sprig.length)], px, py + 1, { flip: r() < 0.5, scale: 0.55 + r() * 0.3 });
      }
    }, 'jointmoss'));
  }
  // Ground cover on growth tiles and scattered litter on open stone.
  const cover: { y: number; o: Op }[] = [];
  for (const [tx, ty] of grassTiles) {
    const x0 = tx * TILE, y0 = ty * TILE;
    const n = 4 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const x = x0 + 1 + R() * 14, y = y0 + 3 + R() * 13, t = R(), flip = R() < 0.5, sc = 0.8 + R() * 0.4;
      const pickFrom = t < 0.22 ? kit.fern : t < 0.42 ? kit.tuft : t < 0.62 ? kit.bush[0] : kit.sprig;
      const s = pickFrom[Math.floor(R() * pickFrom.length)];
      cover.push({ y, o: op(x - s.ax * sc - 1, y - s.ay * sc - 1, x + s.w * sc, y + 3, (g, e) => putStamp(g, e, s, x, y, { flip, scale: sc * (pickFrom === kit.fern ? 0.75 : pickFrom === kit.bush[0] ? 0.62 : 1) }), 'cover') });
    }
    if (ch(tx, ty) === '*') {
      const s = kit.flowers[Math.floor(R() * kit.flowers.length)], x = x0 + 8 + (R() - 0.5) * 4, y = y0 + 11, flip = R() < 0.5;
      cover.push({ y: y + 0.5, o: op(x - 12, y - 14, x + 12, y + 4, (g, e) => putStamp(g, e, s, x, y, { flip }), 'flowers') });
    }
  }
  for (let ty = 0; ty < M.room.h; ty++) for (let tx = 0; tx < M.room.w; tx++) {
    const c = ch(tx, ty);
    if (c !== '.' && c !== ',' && c !== 'P' && c !== 'T') continue;
    const r = R();
    const x = tx * TILE + 2 + R() * 12, y = ty * TILE + 2 + R() * 12;
    if (r < 0.07) {
      // Pebbles.
      const sd = R() * 1e6;
      cover.push({ y, o: op(x - 3, y - 3, x + 3, y + 3, (g) => {
        const rr = rng(sd);
        for (let i = 0; i < 3; i++) {
          const px = x + (rr() - 0.5) * 4, py = y + (rr() - 0.5) * 3, s = 0.5 + rr() * 0.6;
          g.beginPath(); g.ellipse(px + 0.25, py + 0.3, s, s * 0.7, 0, 0, TAU); g.fillStyle = css(0x000000, 0.4); g.fill();
          g.beginPath(); g.ellipse(px, py, s, s * 0.75, 0, 0, TAU);
          g.fillStyle = rad(g, px - s * 0.3, py - s * 0.3, 0, s * 1.2, [[0, css(L.stone[4])], [1, css(L.stone[1])]]); g.fill();
        }
      }) });
    } else if (r < 0.11) {
      const s = kit.sprig[Math.floor(R() * kit.sprig.length)], flip = R() < 0.5, sc = 0.6 + R() * 0.3;
      cover.push({ y, o: op(x - 8, y - 8, x + 8, y + 3, (g) => putStamp(g, null, s, x, y, { flip, scale: sc }), 'sprig') });
    } else if (r < 0.15) {
      // A fallen leaf.
      const a = R() * TAU, sd = R() * 1e6;
      cover.push({ y, o: op(x - 4, y - 4, x + 4, y + 4, (g) => {
        g.save(); g.translate(x, y); g.rotate(a);
        const rr = rng(sd);
        g.beginPath(); g.ellipse(0, 0, 1.9, 0.8, 0, 0, TAU);
        g.fillStyle = css(rr() < 0.5 ? mix(L.leaf[2], 0x8a6a3a, 0.5) : L.leaf[2], 0.9); g.fill();
        g.beginPath(); g.moveTo(-1.6, 0); g.lineTo(1.6, 0); g.lineWidth = 0.15; g.strokeStyle = css(L.leaf[4], 0.5); g.stroke();
        g.restore();
      }) });
    }
  }
  cover.sort((a, b) => a.y - b.y);
  for (const c of cover) over.push(c.o);

  // ---- rune circles ------------------------------------------------------------------------------
  for (let ty = 0; ty < M.room.h; ty++) for (let tx = 0; tx < M.room.w; tx++) {
    if (ch(tx, ty) !== 'R') continue;
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    over.push(op(cx - 26, cy - 26, cx + 26, cy + 26, (g, e) => rune(g, e, cx, cy, 22), 'rune'));
  }
  function rune(g: Ctx, e: Ctx, cx: number, cy: number, Rr: number) {
    const brass = 0xb08a4a, brassL = 0xe8c47a;
    const ring = (gg: Ctx, r: number, w: number, style: string) => { gg.beginPath(); gg.arc(cx, cy, r, 0, TAU); gg.lineWidth = w; gg.strokeStyle = style; gg.stroke(); };
    // Engraved grooves (dark), then the brass inlay slightly up-left so the groove shows below it.
    for (const [r, w] of [[Rr, 1.5], [Rr - 4.2, 0.9], [6.5, 0.9]] as const) {
      ring(g, r, w + 0.5, css(0x0c0e14, 0.75));
      g.save(); g.translate(-0.2, -0.25); ring(g, r, w * 0.6, css(brass)); g.restore();
      ring(g, r - w * 0.2, w * 0.2, css(brassL, 0.55));
    }
    // Glyph ticks and a star.
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const r0 = Rr - 3.4, r1 = Rr - 1.0;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.lineWidth = i % 3 ? 0.35 : 0.7; g.strokeStyle = css(i % 3 ? brass : brassL, 0.85); g.stroke();
    }
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU - Math.PI / 2, r = i % 2 ? 7.5 : Rr - 5.5;
      if (i === 0) g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
    g.lineWidth = 0.5; g.strokeStyle = css(brass, 0.85); g.stroke();
    g.beginPath(); g.arc(cx, cy, 2.2, 0, TAU); g.fillStyle = css(brassL); g.fill();
    // Faint glow in the inlay.
    e.save(); e.globalCompositeOperation = 'lighter';
    ring(e, Rr, 1.4, css(L.accent, 0.35));
    ring(e, Rr - 4.2, 0.9, css(L.accent, 0.25));
    e.fillStyle = rad(e, cx, cy, 0, 9, [[0, css(L.accent, 0.5)], [1, css(L.accent, 0)]]);
    e.fillRect(cx - 9, cy - 9, 18, 18);
    e.restore();
  }

  // ---- deep canopy -------------------------------------------------------------------------------
  const canopy: { y: number; o: Op }[] = [];
  for (const [tx, ty] of tallBase) {
    if (M.isTallF(tx, ty)) continue;
    const dd = M.distAt(tx, ty);
    const n = 1 + (R() < 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      // Mostly big bushes, now and then a fern frond or a small bush, so the jungle has no repeat.
      const t = R();
      const pick = t < 0.12 ? kit.fern : t < 0.3 ? kit.bush[1] : kit.bush[2];
      const s = pick[Math.floor(R() * pick.length)];
      const x = (tx + 0.5) * TILE + (R() - 0.5) * 13, y = (ty + 1) * TILE - 2 + (R() - 0.5) * 9, flip = R() < 0.5;
      const sc = pick === kit.fern ? 1.25 + R() * 0.4 : 0.85 + R() * 0.45;
      // Deep in the jungle only a few blooms glow; the glow gathers along the edges of the stage.
      const glow = dd <= 2 || R() < 0.14;
      canopy.push({ y, o: op(x - s.w * sc, y - s.h * sc, x + s.w * sc, y + 6, (g, e) => putStamp(g, glow ? e : null, s, x, y, { flip, scale: sc }), 'canopy') });
    }
  }
  canopy.sort((a, b) => a.y - b.y);
  for (const c of canopy) over.push(c.o);
  // Darken the jungle with depth, so the playable ground is the lit stage.
  for (const [tx, ty] of tallBase) {
    const dd = M.distAt(tx, ty);
    if (dd < 1 || (dd < 2 && R() < 0.5)) continue;
    // Off-centre and uneven, so the shade reads as gaps between bushes rather than a grid.
    const cx = (tx + 0.5) * TILE + (R() - 0.5) * 10, cy = (ty + 0.5) * TILE + (R() - 0.5) * 10;
    const a = Math.min(0.75, 0.12 + (dd - 1) * 0.2) * (0.6 + R() * 0.6);
    over.push(op(cx - 18, cy - 18, cx + 18, cy + 18, (g) => {
      g.fillStyle = rad(g, cx, cy, 0, 18, [[0, css(0x03060a, a)], [0.6, css(0x03060a, a * 0.7)], [1, css(0x03060a, 0)]]);
      g.fillRect(cx - 18, cy - 18, 36, 36);
    }, 'darken'));
  }

  // ---- contact shadows ----------------------------------------------------------------------------
  for (let ty = 0; ty < M.room.h; ty++) for (let tx = 0; tx < M.room.w; tx++) {
    const c = ch(tx, ty);
    if (c === 'F' || isWallCh(c) || c === 'D') continue;
    const x0 = tx * TILE, y0 = ty * TILE;
    const n = ch(tx, ty - 1);
    if (isWallCh(n)) {
      over.push(op(x0, y0, x0 + TILE, y0 + 14, (g) => {
        g.fillStyle = lin(g, 0, y0, 0, y0 + 13, [[0, css(0x05060a, 0.62)], [0.35, css(0x05060a, 0.3)], [1, css(0x05060a, 0)]]);
        g.fillRect(x0, y0, TILE, 13);
      }, 'shadow'));
    }
    for (const dx of [-1, 1]) {
      if (!isWallCh(ch(tx + dx, ty))) continue;
      const ex = dx < 0 ? x0 : x0 + TILE;
      over.push(op(x0, y0, x0 + TILE, y0 + TILE, (g) => {
        g.fillStyle = lin(g, ex, 0, ex - dx * 6, 0, [[0, css(0x05060a, 0.45)], [1, css(0x05060a, 0)]]);
        g.fillRect(Math.min(ex, ex - dx * 6), y0, 6, TILE);
      }, 'shadow'));
    }
    if (n === 'F' || n === 'r' || n === 'x') {
      const sd = R() * 1e6, depth = n === 'F' ? 9 : 5, a = n === 'F' ? 0.5 : 0.4;
      over.push(op(x0 - 4, y0 - 4, x0 + TILE + 4, y0 + depth + 4, (g) => {
        const r = rng(sd);
        g.save();
        g.beginPath(); g.rect(x0 - 4, y0, TILE + 8, depth + 4); g.clip();
        for (let i = 0; i < 3; i++) {
          blobPath(g, x0 + 3 + i * 5, y0, 5 + r() * 2, depth * (0.6 + r() * 0.5), r, 7, 0.25);
          g.fillStyle = css(0x04070a, a * 0.55); g.fill();
        }
        g.restore();
      }, 'shadow'));
    }
  }
  for (const p of props) {
    const cx = (p.tx + p.tw / 2) * TILE + 2, cy = (p.ty + p.th) * TILE - 2, rx = p.tw * TILE * 0.62 + 3, ry = Math.max(4, p.th * TILE * 0.32);
    over.push(op(cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2, (g) => {
      g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
      g.fillStyle = rad(g, 0, 0, 0, rx, [[0, css(0x04060a, 0.6)], [0.55, css(0x04060a, 0.35)], [1, css(0x04060a, 0)]]);
      g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
      g.restore();
    }, 'propshadow'));
  }
  return { base, over, L, seed };
}

/** Paint the part of the floor inside the world rect (x0, y0, w, h); g and e map world units already. */
export function paintFloor(plan: FloorPlan, g: Ctx, e: Ctx, x0: number, y0: number, w: number, h: number) {
  const hit = (o: Op) => o.x1 > x0 && o.x0 < x0 + w && o.y1 > y0 && o.y0 < y0 + h;
  g.fillStyle = css(plan.L.grout);
  g.fillRect(x0, y0, w, h);
  for (const o of plan.base) if (hit(o)) o.draw(g, e);
  // Stone texture: soft light and dark patches, damp stains and a fine grain over everything so far.
  grain(g, x0, y0, w, h, { coarse: 0.14, stain: 0.2, fine: 0.09, seed: plan.seed % 997, fineScale: 40, coarseScale: 190 });
  for (const o of plan.over) if (hit(o)) o.draw(g, e);
}

export { foliageKit };
