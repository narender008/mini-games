// Everything in a room that stands up from the floor and must depth-sort with characters, planned per
// tile row: ruined walls (a slab-paved, overgrown top raised WALL_H above the footprint and a front face
// of dressed blocks in courses, with banners, lanterns, ivy, moss and damp streaks), the stone arch
// over each north door, bushes along the jungle's edge, and low pool rims and rubble. Each element has
// bounds in world units and a base line; the view groups a row's elements into strip textures.
import { TILE, WALL_H } from '../../config';
import type { Zone } from '../../sim/level/rooms';
import { bevel, blobPath, css, lin, mix, rad, rng, roundPoly, shade, slab, TAU, type Ctx } from '../paint';
import { ivy, leaf, putStamp, type FoliageKit } from './foliage';
import { LOOKS, type EnvLook } from './look';
import { isWallCh, type RoomMap } from './map';

export interface TallEl { x0: number; y0: number; x1: number; y1: number; draw: (g: Ctx, e: Ctx) => void }

/** Plan the tall elements of tile row ty (drawn back to front in this order). */
export function planRow(M: RoomMap, zone: Zone, ty: number, seed: number, kit: FoliageKit): TallEl[] {
  const L = LOOKS[zone];
  const out: TallEl[] = [];
  const { ch } = M;
  const w = M.room.w;
  const R = rng(seed * 131 + ty * 977 + 5);
  const baseY = (ty + 1) * TILE;
  const capTop = ty * TILE - WALL_H;
  // ---- walls ----------------------------------------------------------------------------------------
  for (let tx = 0; tx < w;) {
    if (!isWallCh(ch(tx, ty))) { tx++; continue; }
    let t1 = tx;
    while (t1 + 1 < w && isWallCh(ch(t1 + 1, ty))) t1++;
    const a = tx, b = t1, sd = Math.floor(R() * 1e9);
    out.push({ x0: a * TILE - 3, y0: capTop - 12, x1: (b + 1) * TILE + 3, y1: baseY + 3, draw: (g, e) => wallRun(g, e, L, M, kit, a, b, ty, sd) });
    tx = t1 + 1;
  }
  // ---- door arches -------------------------------------------------------------------------------------
  for (const d of M.room.doors) {
    if (d.side !== 'n') continue;
    const maxY = Math.max(...d.cells.map((c) => c.ty));
    if (maxY !== ty) continue;
    const minX = Math.min(...d.cells.map((c) => c.tx)), maxX = Math.max(...d.cells.map((c) => c.tx));
    const x0 = minX * TILE, x1 = (maxX + 1) * TILE, sd = Math.floor(R() * 1e9);
    out.push({ x0: x0 - 10, y0: baseY - 66, x1: x1 + 10, y1: baseY + 2, draw: (g, e) => arch(g, e, L, x0, x1, baseY, sd) });
  }
  // ---- rims and rubble -----------------------------------------------------------------------------
  for (let tx = 0; tx < w; tx++) {
    const c = ch(tx, ty);
    if (c !== 'r' && c !== 'x') continue;
    const sd = Math.floor(R() * 1e9);
    out.push({ x0: tx * TILE - 4, y0: ty * TILE - 10, x1: (tx + 1) * TILE + 4, y1: baseY + 3, draw: (g) => (c === 'r' ? rim(g, L, M, tx, ty, sd) : rubble(g, L, kit, tx, ty, sd)) });
  }
  // ---- jungle edge -------------------------------------------------------------------------------
  const bushes: { x: number; y: number; s: number; v: number; flip: boolean; sc: number }[] = [];
  for (let tx = 0; tx < w; tx++) {
    if (!M.isTallF(tx, ty)) continue;
    const openBelow = M.distAt(tx, ty + 1) === 0, openAbove = M.distAt(tx, ty - 1) === 0 || M.distAt(tx, ty - 2) === 0;
    const n = 1 + (R() < 0.55 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      // Bushes facing open ground below are a little smaller so the border stays clean.
      const size = openBelow ? (R() < 0.6 ? 1 : 0) : openAbove ? (R() < 0.5 ? 2 : 1) : 2;
      bushes.push({ x: (tx + 0.5) * TILE + (R() - 0.5) * 11, y: baseY - 3 + (R() - 0.5) * 5, s: size, v: Math.floor(R() * 100), flip: R() < 0.5, sc: 0.88 + R() * 0.3 });
    }
  }
  bushes.sort((p, q) => p.y - q.y);
  for (const bsh of bushes) {
    const st = kit.bush[bsh.s][bsh.v % kit.bush[bsh.s].length];
    out.push({ x0: bsh.x - st.w * bsh.sc, y0: bsh.y - st.h * bsh.sc, x1: bsh.x + st.w * bsh.sc, y1: bsh.y + 6, draw: (g, e) => putStamp(g, e, st, bsh.x, bsh.y, { flip: bsh.flip, scale: bsh.sc }) });
  }
  return out;
}

// ---- wall ------------------------------------------------------------------------------------------

function wallRun(g: Ctx, e: Ctx, L: EnvLook, M: RoomMap, kit: FoliageKit, a: number, b: number, ty: number, sd: number) {
  const { ch } = M;
  const R = rng(sd);
  const x0 = a * TILE, x1 = (b + 1) * TILE;
  const capTop = ty * TILE - WALL_H, faceTop = capTop + TILE, baseY = (ty + 1) * TILE;
  const openL = !isWallCh(ch(a - 1, ty)), openR = !isWallCh(ch(b + 1, ty));
  // ---- front face, course by course (only where the tile below is not wall) ----
  const faceTiles: boolean[] = [];
  for (let tx = a; tx <= b; tx++) faceTiles.push(!isWallCh(ch(tx, ty + 1)));
  const anyFace = faceTiles.some(Boolean);
  if (anyFace) {
    g.save();
    // Clip to the tiles that show a face.
    g.beginPath();
    for (let i = 0; i < faceTiles.length; i++) if (faceTiles[i]) g.rect((a + i) * TILE - (i === 0 ? 0.5 : 0), faceTop - 1, TILE + (i === faceTiles.length - 1 ? 0.5 : 0.02), WALL_H + 1);
    g.clip();
    g.fillStyle = css(shade(L.grout, 0.05));
    g.fillRect(x0 - 1, faceTop, x1 - x0 + 2, WALL_H);
    const courses = [8.8, 9.4, 9.8];
    let y = faceTop;
    courses.forEach((chH, ci) => {
      let x = x0 - R() * 10;
      while (x < x1) {
        const bw = 11 + R() * 10;
        const pts = [x + 0.4 + (R() - 0.5) * 0.5, y + 0.4 + (R() - 0.5) * 0.4, x + bw - 0.4 + (R() - 0.5) * 0.5, y + 0.4 + (R() - 0.5) * 0.4, x + bw - 0.4 + (R() - 0.5) * 0.4, y + chH - 0.4, x + 0.4 + (R() - 0.5) * 0.4, y + chH - 0.4];
        const t = R();
        if (t < 0.04 && ci > 0) {
          // A missing block: a dark recess with a lit lower lip.
          roundPoly(g, pts, 0.8);
          g.fillStyle = lin(g, 0, y, 0, y + chH, [[0, css(0x05060a)], [0.8, css(shade(L.wall[0], -0.5))], [1, css(L.wall[1])]]);
          g.fill();
        } else {
          let col = mix(L.wall[1], L.wall[3], t);
          if (R() < 0.12) col = mix(col, L.moss, 0.2);
          if (R() < 0.08) col = mix(col, 0x6e5a48, 0.15);
          slab(g, pts, 1.1, lin(g, x, y, x + bw * 0.3, y + chH, [[0, css(shade(col, 0.1))], [0.5, css(col)], [1, css(shade(col, -0.18))]]), css(shade(col, 0.22)), css(shade(col, -0.42)), 0.4, 0.5);
          if (R() < 0.1) {
            // Crack.
            const cx = x + bw * (0.3 + R() * 0.4);
            g.beginPath(); g.moveTo(cx, y + 0.6); g.lineTo(cx + (R() - 0.5) * 2, y + chH * 0.5); g.lineTo(cx + (R() - 0.5) * 3, y + chH - 0.6);
            g.lineWidth = 0.35; g.strokeStyle = css(shade(col, -0.6), 0.85); g.stroke();
          }
          for (let k = 0; k < 2; k++) {
            g.beginPath(); g.ellipse(x + 1.5 + R() * (bw - 3), y + 1.2 + R() * (chH - 2.4), 0.3 + R() * 0.4, 0.25 + R() * 0.3, 0, 0, TAU);
            g.fillStyle = css(shade(col, -0.4), 0.6); g.fill();
          }
        }
        // Moss in the joints, more near the top and the ground.
        if ((ci === 0 || ci === 2) && R() < 0.35) {
          blobPath(g, x + bw, y + (ci === 0 ? 0.6 : chH - 0.6), 1.2 + R() * 1.5, 0.8 + R() * 0.8, R, 6, 0.35);
          g.fillStyle = css(R() < 0.5 ? L.moss : L.mossL, 0.9); g.fill();
        }
        x += bw;
      }
      y += chH;
    });
    // Damp streaks running down from the cap.
    for (let i = 0; i < (x1 - x0) / 9; i++) {
      if (R() < 0.45) continue;
      const sx = x0 + R() * (x1 - x0), sw = 1.5 + R() * 3, sl = 6 + R() * 18;
      g.fillStyle = lin(g, 0, faceTop, 0, faceTop + sl, [[0, css(0x101820, 0.4)], [1, css(0x101820, 0)]]);
      g.fillRect(sx, faceTop, sw, sl);
    }
    // Darker toward the ground (occlusion) and a hint of the floor's bounce light at the very foot.
    g.fillStyle = lin(g, 0, baseY - 9, 0, baseY, [[0, css(0x04050a, 0)], [0.85, css(0x04050a, 0.5)], [1, css(0x04050a, 0.35)]]);
    g.fillRect(x0 - 1, baseY - 9, x1 - x0 + 2, 9);
    // The lit side edge where the wall ends on the left, the shaded one on the right.
    if (openL) { g.fillStyle = lin(g, x0, 0, x0 + 2.5, 0, [[0, css(shade(L.wall[3], 0.2), 0.7)], [1, css(L.wall[3], 0)]]); g.fillRect(x0, faceTop, 2.5, WALL_H); }
    if (openR) { g.fillStyle = lin(g, x1, 0, x1 - 3, 0, [[0, css(0x05060a, 0.6)], [1, css(0x05060a, 0)]]); g.fillRect(x1 - 3, faceTop, 3, WALL_H); }
    // Shadow under the cap's overhanging lip.
    g.fillStyle = lin(g, 0, faceTop, 0, faceTop + 3, [[0, css(0x05060a, 0.65)], [1, css(0x05060a, 0)]]);
    g.fillRect(x0, faceTop, x1 - x0, 3);
    g.restore();
  }
  // ---- top surface (cap) ----
  const backOpen = (tx: number) => !isWallCh(ch(tx, ty - 1));
  g.save();
  for (let tx = a; tx <= b; tx++) {
    const cx0 = tx * TILE;
    // Broken back edge where nothing tall is behind.
    const top = backOpen(tx) ? capTop + 1 + R() * 2 : capTop - 0.5;
    const n = R() < 0.75 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const sx = cx0 + (i * TILE) / n, sw = TILE / n;
      const pts = [sx + 0.4, top + (R() - 0.5) * (backOpen(tx) ? 2 : 0.3), sx + sw - 0.4, top + (R() - 0.5) * (backOpen(tx) ? 2 : 0.3), sx + sw - 0.4, faceTop + 0.4, sx + 0.4, faceTop + 0.4];
      // Wall tops sit a little darker than the floor, weathered and mossy, so the stage reads first.
      const col = shade(mix(L.cap[0], L.cap[2], R() * 0.8), -0.08);
      slab(g, pts, 1.2, lin(g, sx, top, sx + sw * 0.5, faceTop, [[0, css(shade(col, 0.06))], [1, css(shade(col, -0.12))]]), css(shade(col, 0.2)), css(shade(col, -0.3)), 0.4, 0.5);
    }
    // Moss and weeds on the top.
    for (let i = 0; i < 4; i++) {
      if (R() < 0.3) continue;
      blobPath(g, cx0 + R() * TILE, top + 2 + R() * (faceTop - top - 3), 2 + R() * 3.5, 1.5 + R() * 2.2, R, 7, 0.3);
      g.fillStyle = css(R() < 0.5 ? L.moss : L.mossL, 0.8); g.fill();
    }
  }
  // Lit front lip of the cap and the lit left end.
  g.fillStyle = css(shade(L.cap[3], 0.18), 0.85);
  g.fillRect(x0, faceTop - 0.2, x1 - x0, 0.7);
  if (openL) { g.fillStyle = css(shade(L.cap[3], 0.2), 0.7); g.fillRect(x0, capTop, 0.7, TILE); }
  if (openR) { g.fillStyle = css(0x05060a, 0.55); g.fillRect(x1 - 0.8, capTop, 0.8, TILE + 0.5); }
  g.restore();
  // ---- overgrowth spilling over the top and down the face ----
  // Growth gathers in clumps along a wall (a smooth wave decides how thick it is), with bare stretches.
  const ph = R() * 10;
  const clump = (tx: number) => 0.5 + 0.3 * Math.sin(tx * 0.83 + ph) + 0.22 * Math.sin(tx * 0.37 + ph * 1.7);
  for (let tx = a; tx <= b; tx++) {
    const cx0 = tx * TILE;
    const hasFace = !isWallCh(ch(tx, ty + 1));
    const c = clump(tx);
    const nb = R() < c - 0.12 ? (c > 0.72 && R() < 0.6 ? 2 : 1) : 0;
    for (let k = 0; k < nb; k++) {
      const pick = c > 0.68 && k === 0 ? kit.bush[1] : kit.bush[0];
      const s = pick[Math.floor(R() * pick.length)];
      putStamp(g, e, s, cx0 + 2 + R() * 12, (hasFace ? faceTop + 1 : faceTop + 4) - R() * 5, { flip: R() < 0.5, scale: (pick === kit.bush[1] ? 0.6 : 0.7) + R() * 0.35 });
    }
    if (R() < 0.35) {
      for (let k = 0; k < 4; k++) leaf(g, L, cx0 + R() * TILE, capTop + 4 + R() * 10, -Math.PI / 2 + (R() - 0.5) * 2.2, 3 + R() * 2, 1.2, 0.3 + R() * 0.5, (R() - 0.5));
    }
    if (hasFace && R() < 0.4) ivy(g, e, L, cx0 + 2 + R() * 12, faceTop - 0.5, 6 + R() * (WALL_H - 8), Math.floor(R() * 1e6));
  }
  // ---- banners and lanterns ----
  for (let tx = a; tx <= b; tx++) {
    const c = ch(tx, ty);
    if (!isWallCh(ch(tx, ty + 1)) || (c !== 'b' && c !== 'l')) continue;
    if (c === 'b') banner(g, e, L, tx * TILE + 8, faceTop - 3);
    else wallLantern(g, e, tx * TILE + 8, faceTop + 6);
  }
}

/** A long cloth banner with a brass rod and a sun emblem, hanging from the wall top. */
export function banner(g: Ctx, e: Ctx, L: EnvLook, cx: number, y0: number) {
  const w = 11, h = 31;
  const x = cx - w / 2;
  // Shadow on the wall.
  g.fillStyle = css(0x04050a, 0.45);
  roundPoly(g, [x + 1.4, y0 + 2, x + w + 1.4, y0 + 2, x + w + 1.4, y0 + h - 2, cx + 1.4, y0 + h + 3, x + 1.4, y0 + h - 2], 0.6); g.fill();
  // Cloth with soft vertical folds.
  const cloth = () => roundPoly(g, [x, y0 + 1, x + w, y0 + 1, x + w, y0 + h - 4, cx, y0 + h, x, y0 + h - 4], 0.5);
  cloth();
  g.fillStyle = lin(g, x, 0, x + w, 0, [[0, css(0x2c3558)], [0.25, css(0x1f2645)], [0.5, css(0x283158)], [0.75, css(0x1c2240)], [1, css(0x141a33)]]);
  g.fill();
  g.save(); cloth(); g.clip();
  g.fillStyle = lin(g, 0, y0, 0, y0 + h, [[0, css(0x000000, 0)], [1, css(0x000000, 0.35)]]);
  g.fillRect(x, y0, w, h);
  g.restore();
  // Gold trim.
  g.lineWidth = 0.55; g.strokeStyle = css(0xb08a4a);
  g.beginPath(); g.moveTo(x + 1, y0 + 2); g.lineTo(x + 1, y0 + h - 4.5); g.lineTo(cx, y0 + h - 1.2); g.lineTo(x + w - 1, y0 + h - 4.5); g.lineTo(x + w - 1, y0 + 2); g.stroke();
  // Sun emblem.
  const ey = y0 + 12;
  g.save(); g.translate(cx, ey);
  for (let i = 0; i < 8; i++) {
    g.rotate(TAU / 8);
    g.beginPath(); g.moveTo(-0.55, -2.4); g.lineTo(0, i % 2 ? -3.6 : -4.4); g.lineTo(0.55, -2.4); g.closePath();
    g.fillStyle = css(0xd0a456); g.fill();
  }
  g.beginPath(); g.arc(0, 0, 2.1, 0, TAU); g.fillStyle = css(0xe8c47a); g.fill();
  g.beginPath(); g.arc(0, 0, 1.1, 0, TAU); g.fillStyle = css(0x1f2645); g.fill();
  g.restore();
  // Rod.
  g.fillStyle = lin(g, 0, y0 - 0.6, 0, y0 + 1.4, [[0, css(0xe8c47a)], [1, css(0x6a4a1e)]]);
  roundPoly(g, [x - 1.5, y0 - 0.4, x + w + 1.5, y0 - 0.4, x + w + 1.5, y0 + 1.3, x - 1.5, y0 + 1.3], 0.6); g.fill();
  for (const ex of [x - 1.5, x + w + 1.5]) { g.beginPath(); g.arc(ex, y0 + 0.45, 0.9, 0, TAU); g.fillStyle = css(0xd0a456); g.fill(); }
  e.save(); e.globalCompositeOperation = 'lighter';
  e.beginPath(); e.arc(cx, ey, 2.2, 0, TAU); e.fillStyle = css(L.accent, 0.18); e.fill();
  e.restore();
}

/** A brass lantern on an iron bracket, its glass lit (the glow goes on the emissive layer). */
export function wallLantern(g: Ctx, e: Ctx, cx: number, y: number) {
  // Bracket.
  g.lineWidth = 0.8; g.strokeStyle = css(0x1c1a1c);
  g.beginPath(); g.moveTo(cx - 3.5, y - 3); g.lineTo(cx, y - 3); g.lineTo(cx, y - 1); g.stroke();
  g.beginPath(); g.arc(cx - 3.5, y - 3, 0.8, 0, TAU); g.fillStyle = css(0x2a2626); g.fill();
  lanternBody(g, e, cx, y, 1);
}

/** A hanging lantern body whose top ring is at (cx, y); scale s (1 = 6.5 units wide). */
export function lanternBody(g: Ctx, e: Ctx, cx: number, y: number, s: number, lit = 1) {
  const brass = 0xc49a52, brassD = 0x6a4a1e, brassL = 0xf0d08a;
  g.save(); g.translate(cx, y); g.scale(s, s);
  // Ring and cap.
  g.beginPath(); g.arc(0, 0, 0.9, 0, TAU); g.lineWidth = 0.35; g.strokeStyle = css(brass); g.stroke();
  roundPoly(g, [-2.6, 2.2, 0, 0.8, 2.6, 2.2, 2.9, 3.0, -2.9, 3.0], 0.4);
  g.fillStyle = lin(g, -3, 0, 3, 0, [[0, css(brassL)], [0.5, css(brass)], [1, css(brassD)]]); g.fill();
  // Glass.
  const glass = () => roundPoly(g, [-2.5, 3.0, 2.5, 3.0, 2.2, 8.6, -2.2, 8.6], 0.5);
  glass();
  g.fillStyle = lit > 0 ? rad(g, -0.3, 5.6, 0, 3.6, [[0, css(0xfff6dc)], [0.45, css(0xffd27a)], [1, css(0xd98a32)]]) : css(0x2a2420);
  g.fill();
  // Frame bars.
  g.lineWidth = 0.4; g.strokeStyle = css(brassD);
  for (const bx of [-2.4, 0, 2.4]) { g.beginPath(); g.moveTo(bx * 0.98, 3); g.lineTo(bx * 0.9, 8.6); g.stroke(); }
  roundPoly(g, [-2.9, 8.4, 2.9, 8.4, 2.4, 9.8, -2.4, 9.8], 0.4);
  g.fillStyle = lin(g, -3, 0, 3, 0, [[0, css(brassL)], [0.5, css(brass)], [1, css(brassD)]]); g.fill();
  g.restore();
  if (lit > 0) {
    e.save(); e.globalCompositeOperation = 'lighter';
    e.translate(cx, y); e.scale(s, s);
    e.fillStyle = rad(e, 0, 5.8, 0, 9, [[0, css(0xffd27a, 0.6 * lit)], [0.3, css(0xffa040, 0.25 * lit)], [1, css(0xff8a30, 0)]]);
    e.fillRect(-9, -3.2, 18, 18);
    glassE(e, lit);
    e.restore();
  }
  function glassE(ee: Ctx, k: number) {
    roundPoly(ee, [-2.5, 3.0, 2.5, 3.0, 2.2, 8.6, -2.2, 8.6], 0.5);
    ee.fillStyle = rad(ee, -0.3, 5.6, 0, 3.6, [[0, css(0xffffff, k)], [0.5, css(0xffd27a, 0.9 * k)], [1, css(0xff9a40, 0.6 * k)]]);
    ee.fill();
  }
}

// ---- door arch ---------------------------------------------------------------------------------------

function arch(g: Ctx, e: Ctx, L: EnvLook, x0: number, x1: number, baseY: number, sd: number) {
  const R = rng(sd);
  const iw = x1 - x0, cx = (x0 + x1) / 2;
  const pierW = 7;
  const springY = baseY - 36; // where the arch starts to curve
  const rIn = iw / 2, rOut = iw / 2 + 6.5;
  // Piers: stacked blocks.
  for (const [px, dir] of [[x0 - pierW + 1, -1], [x1 - 1, 1]] as const) {
    for (let y = baseY, i = 0; y > springY - 2; i++) {
      const bh = 5.5 + R() * 2.5;
      const pts = [px - 0.2 + (R() - 0.5) * 0.5, y - bh + 0.3, px + pierW + 0.2 + (R() - 0.5) * 0.5, y - bh + 0.3, px + pierW + 0.2, y - 0.3, px - 0.2, y - 0.3];
      const col = mix(L.wall[2], L.cap[2], R() * 0.6);
      slab(g, pts, 1, lin(g, px, 0, px + pierW, 0, [[0, css(shade(col, dir < 0 ? 0.12 : 0.05))], [1, css(shade(col, dir < 0 ? -0.08 : -0.2))]]), css(shade(col, 0.22)), css(shade(col, -0.4)), 0.4, 0.5);
      y -= bh;
    }
  }
  // Voussoirs around the arch.
  const n = 9;
  const ry = 0.85;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI + (i / n) * Math.PI, a1 = Math.PI + ((i + 1) / n) * Math.PI;
    const P = (a: number, r: number) => [cx + Math.cos(a) * r, springY + Math.sin(a) * r * ry];
    const g0 = 0.012;
    const pts = [...P(a0 + g0, rIn), ...P(a0 + g0, rOut), ...P((a0 + a1) / 2, rOut + 0.3), ...P(a1 - g0, rOut), ...P(a1 - g0, rIn), ...P((a0 + a1) / 2, rIn - 0.2)];
    const key = i === Math.floor(n / 2);
    const col = key ? L.cap[3] : mix(L.wall[2], L.cap[2], R() * 0.7);
    const path = () => roundPoly(g, key ? [...P(a0, rIn - 1), ...P(a0 - 0.05, rOut + 2.2), ...P(a1 + 0.05, rOut + 2.2), ...P(a1, rIn - 1)] : pts, 0.8);
    path();
    const mid = (a0 + a1) / 2;
    g.fillStyle = lin(g, cx + Math.cos(mid) * rIn, springY + Math.sin(mid) * rIn * ry, cx + Math.cos(mid) * rOut, springY + Math.sin(mid) * rOut * ry, [[0, css(shade(col, -0.2))], [1, css(shade(col, 0.1))]]);
    g.fill();
    bevel(g, path, css(shade(col, 0.35), 0.6), css(shade(col, -0.55), 0.7), 0.5, 0.4);
    if (key) {
      // Sun mark on the keystone.
      const [kx, ky] = P(mid, (rIn + rOut) / 2 + 0.5);
      g.beginPath(); g.arc(kx, ky, 1.5, 0, TAU); g.fillStyle = css(0xd0a456); g.fill();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; g.beginPath(); g.moveTo(kx + Math.cos(a) * 1.9, ky + Math.sin(a) * 1.9); g.lineTo(kx + Math.cos(a) * 2.7, ky + Math.sin(a) * 2.7); g.lineWidth = 0.4; g.strokeStyle = css(0xb08a4a); g.stroke(); }
      e.save(); e.globalCompositeOperation = 'lighter';
      e.fillStyle = rad(e, kx, ky, 0, 4, [[0, css(L.accent, 0.5)], [1, css(L.accent, 0)]]); e.fillRect(kx - 4, ky - 4, 8, 8);
      e.restore();
    }
  }
  // Shadow inside the arch's soffit.
  g.save();
  g.beginPath(); g.ellipse(cx, springY, rIn, rIn * ry, 0, Math.PI, TAU); g.lineTo(x1, baseY - 20); g.lineTo(x0, baseY - 20); g.closePath(); g.clip();
  g.fillStyle = lin(g, 0, springY - rIn * ry, 0, springY + 4, [[0, css(0x04050a, 0.85)], [1, css(0x04050a, 0)]]);
  g.fillRect(x0, springY - rIn, iw, rIn + 6);
  g.restore();
  // Ivy over the arch.
  for (let i = 0; i < 3; i++) ivy(g, e, L, cx + (R() - 0.5) * (rOut * 2), springY - rOut * ry * (0.5 + R() * 0.4), 6 + R() * 12, Math.floor(R() * 1e6));
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (1.1 + R() * 0.8);
    leaf(g, L, cx + Math.cos(a) * rOut, springY + Math.sin(a) * rOut * ry, a + (R() - 0.5), 3 + R() * 2, 1.2, 0.3 + R() * 0.5, R() - 0.5);
  }
}

// ---- low stones ---------------------------------------------------------------------------------------

/** A stone block seen from above at 3/4: a lit top and a short shaded front face of height fh. */
export function block(g: Ctx, L: EnvLook, x: number, y: number, w: number, d: number, fh: number, R: () => number, moss = 0.3) {
  const J = () => (R() - 0.5) * 0.9;
  const top = [x + J(), y + J(), x + w + J(), y + J(), x + w + J(), y + d + J() * 0.5, x + J(), y + d + J() * 0.5];
  const col = mix(L.cap[0], L.cap[3], 0.25 + R() * 0.6);
  // Contact shadow.
  g.beginPath(); g.ellipse(x + w / 2 + 1, y + d + fh - 0.5, w * 0.6, 2.2, 0, 0, TAU);
  g.fillStyle = css(0x04060a, 0.45); g.fill();
  // Front face.
  const face = [top[6], top[7], top[4], top[5], top[4] + 0.2, top[5] + fh, top[6] - 0.2, top[7] + fh];
  roundPoly(g, face, 1);
  g.fillStyle = lin(g, 0, top[7], 0, top[7] + fh, [[0, css(shade(mix(L.wall[1], L.wall[3], R()), 0))], [1, css(shade(L.wall[0], -0.3))]]);
  g.fill();
  g.lineWidth = 0.3; g.strokeStyle = css(0x05060a, 0.6); g.stroke();
  // Top.
  slab(g, top, 1.6, lin(g, x, y, x + w * 0.4, y + d, [[0, css(shade(col, 0.1))], [1, css(shade(col, -0.1))]]), css(shade(col, 0.26)), css(shade(col, -0.28)), 0.42, 0.5);
  if (R() < moss) {
    blobPath(g, x + w * (0.2 + R() * 0.6), y + d * (0.2 + R() * 0.4), 1.5 + R() * 2, 1 + R() * 1.4, R, 6, 0.3);
    g.fillStyle = css(R() < 0.5 ? L.moss : L.mossL, 0.85); g.fill();
  }
}

function rim(g: Ctx, L: EnvLook, M: RoomMap, tx: number, ty: number, sd: number) {
  const R = rng(sd);
  const x0 = tx * TILE, y0 = ty * TILE;
  const below = M.ch(tx, ty + 1) === 'r', above = M.ch(tx, ty - 1) === 'r';
  void above;
  if (below) {
    // A side of the rim running north-south: two blocks one above the other.
    block(g, L, x0 + 1.5 + R() * 1.5, y0 - 4, 12, 7, 4, R);
    block(g, L, x0 + 1 + R() * 2, y0 + 4, 12.5, 7, 4.5, R);
  } else {
    block(g, L, x0 - 1 + R() * 1.5, y0 + 1 + R() * 2, 8.5 + R() * 1.5, 8, 5, R);
    block(g, L, x0 + 7.5 + R() * 1, y0 + 1.5 + R() * 2, 9 + R() * 1.5, 8, 5.2, R);
  }
}

function rubble(g: Ctx, L: EnvLook, kit: FoliageKit, tx: number, ty: number, sd: number) {
  const R = rng(sd);
  const x0 = tx * TILE, y0 = ty * TILE;
  const bits: [number, number, number, number][] = [];
  for (let i = 0; i < 4; i++) bits.push([x0 + R() * 11, y0 + R() * 9, 4 + R() * 5, 3 + R() * 3.5]);
  bits.sort((a, b) => a[1] - b[1]);
  for (const [x, y, w, d] of bits) block(g, L, x, y, w, d, 2.5 + R() * 2, R, 0.5);
  if (R() < 0.6) putStamp(g, null, kit.sprig[Math.floor(R() * kit.sprig.length)], x0 + 3 + R() * 10, y0 + 13, { flip: R() < 0.5, scale: 0.7 });
  for (let i = 0; i < 4; i++) {
    const px = x0 + R() * 16, py = y0 + 10 + R() * 5, s = 0.5 + R() * 0.7;
    g.beginPath(); g.ellipse(px, py, s, s * 0.75, 0, 0, TAU);
    g.fillStyle = rad(g, px - s * 0.3, py - s * 0.3, 0, s * 1.2, [[0, css(L.cap[3])], [1, css(L.wall[0])]]); g.fill();
  }
}
