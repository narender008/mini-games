// Room props painted in vectors: pillars, lantern posts, the orrery, statues, fallen blocks and the
// interactive pieces (weapon pedestals, upgrade shrine, heartbloom, light cache, lore lantern,
// brazier). Each is a painter on a w x h unit canvas whose footprint's bottom-left sits at (ox, oy),
// plus where its light is (relative to the footprint's bottom-left), if it has one.
import { TILE } from '../../config';
import type { Zone } from '../../sim/level/rooms';
import { blobPath, css, figure, lin, mix, rad, rng, roundPoly, shade, slab, TAU, type Ctx } from '../paint';
import { bush, ivy, leaf, starFlower } from './foliage';
import { LOOKS, type EnvLook } from './look';
import { block, lanternBody } from './walls';

export interface PropArt {
  w: number; h: number; ox: number; oy: number;
  paint: (g: Ctx, e: Ctx) => void;
  /** Light position on the prop's canvas (units from its top-left), radius, colour, intensity. */
  light?: { x: number; y: number; r: number; color: number; i: number };
}

const INK = 0x07080d;
const fig = { ink: INK, inkW: 0.45, rim: 0xc8d4f0, rimW: 0.5, rimA: 0.35, shadeW: 0.7, shadeA: 0.25 };

/** A stepped stone plinth: top at y, width w, height h (front face), centred on cx. */
function plinth(g: Ctx, L: EnvLook, cx: number, y: number, w: number, d: number, h: number, R: () => number) {
  const x = cx - w / 2;
  const topPts = [x, y, x + w, y, x + w, y + d, x, y + d];
  const col = mix(L.cap[1], L.cap[3], 0.3 + R() * 0.4);
  roundPoly(g, [x, y + d, x + w, y + d, x + w, y + d + h, x, y + d + h], 0.6);
  g.fillStyle = lin(g, x, 0, x + w, 0, [[0, css(shade(L.wall[2], 0.08))], [0.6, css(L.wall[1])], [1, css(shade(L.wall[0], -0.1))]]);
  g.fill();
  g.fillStyle = lin(g, 0, y + d + h - 2.5, 0, y + d + h, [[0, css(0x04050a, 0)], [1, css(0x04050a, 0.45)]]);
  g.fillRect(x, y + d + h - 2.5, w, 2.5);
  slab(g, topPts, 0.9, lin(g, x, y, x + w * 0.4, y + d, [[0, css(shade(col, 0.1))], [1, css(shade(col, -0.1))]]), css(shade(col, 0.28)), css(shade(col, -0.27)), 0.38, 0.4);
}

function pillar(L: EnvLook, seed: number): PropArt {
  const W = 24, H = 58;
  const R0 = rng(seed);
  const broken = R0() < 0.4;
  return {
    w: W, h: H, ox: 4, oy: H - 2,
    paint: (g, e) => figure(g, W, H, (f) => {
      const R = rng(seed);
      R();
      const cx = 12;
      plinth(f, L, cx, H - 13, 20, 5, 6, R);
      plinth(f, L, cx, H - 18, 16, 4, 4, R);
      const top = broken ? 14 + R() * 6 : 9;
      // Shaft: a lit cylinder with flutes.
      const sx = cx - 6, sw = 12, sy = top + 3, sh = H - 18 - sy;
      f.save();
      if (broken) {
        f.beginPath();
        f.moveTo(sx, sy + 3);
        for (let i = 0; i <= 6; i++) f.lineTo(sx + (i / 6) * sw, sy + R() * 5 - (i === 3 ? 2 : 0));
        f.lineTo(sx + sw, sy + sh); f.lineTo(sx, sy + sh); f.closePath();
      } else { f.beginPath(); f.rect(sx, sy, sw, sh); }
      f.clip();
      f.fillStyle = lin(f, sx, 0, sx + sw, 0, [[0, css(shade(L.wall[3], 0.1))], [0.3, css(L.wall[3])], [0.7, css(L.wall[1])], [1, css(shade(L.wall[0], -0.2))]]);
      f.fillRect(sx, sy - 6, sw, sh + 6);
      for (let i = 1; i < 6; i++) {
        const fx = sx + (i / 6) * sw;
        f.fillStyle = css(0x05060a, 0.28); f.fillRect(fx - 0.35, sy - 6, 0.7, sh + 6);
        f.fillStyle = css(0xffffff, 0.08); f.fillRect(fx + 0.35, sy - 6, 0.5, sh + 6);
      }
      // Drum joints.
      for (let y = sy + 8 + R() * 3; y < sy + sh - 2; y += 9 + R() * 3) { f.fillStyle = css(0x05060a, 0.45); f.fillRect(sx, y, sw, 0.55); }
      if (broken) { f.fillStyle = css(L.cap[3], 0.9); f.fillRect(sx, sy - 6, sw, 0.1); }
      f.restore();
      if (broken) {
        // The broken top catches the light.
        f.beginPath(); f.ellipse(cx, sy + 2, sw / 2, 1.8, 0, 0, TAU);
        f.fillStyle = css(mix(L.cap[2], L.cap[3], 0.5), 0.75); f.fill();
      } else {
        // Capital.
        plinth(f, L, cx, top - 3, 18, 4, 3.5, R);
        plinth(f, L, cx, top - 6, 14, 3, 2, R);
      }
      // Ivy and moss.
      for (let i = 0; i < 2; i++) ivy(f, e, L, sx + 2 + R() * (sw - 4), sy + 2 + R() * 8, 10 + R() * 14, Math.floor(R() * 1e6));
      for (let i = 0; i < 5; i++) leaf(f, L, sx + R() * sw, H - 19 - R() * 6, -Math.PI / 2 + (R() - 0.5) * 2.4, 2.5 + R() * 2, 1, 0.2 + R() * 0.5, R() - 0.5);
    }, fig),
  };
}

function lanternPost(L: EnvLook): PropArt {
  const W = 20, H = 52;
  return {
    w: W, h: H, ox: 2, oy: H - 2,
    light: { x: 13.5, y: 16.6, r: 100, color: 0xff9a3a, i: 0.85 },
    paint: (g, e) => {
      figure(g, W, H, (f) => {
        const R = rng(17);
        plinth(f, L, 10, H - 9, 10, 4, 3.5, R);
        // Iron post with collars.
        f.fillStyle = lin(f, 8.8, 0, 11.2, 0, [[0, css(0x4a4446)], [0.4, css(0x2a2628)], [1, css(0x141214)]]);
        f.fillRect(8.8, 9, 2.4, H - 18);
        for (const y of [H - 12, 26, 12]) { roundPoly(f, [8, y, 12, y, 12, y + 1.6, 8, y + 1.6], 0.4); f.fillStyle = css(0x8a6a3a); f.fill(); }
        // Curled arm.
        f.beginPath(); f.moveTo(10, 10); f.quadraticCurveTo(13, 6, 16.5, 8.5); f.lineWidth = 1; f.strokeStyle = css(0x2a2628); f.stroke();
        f.beginPath(); f.arc(16.5, 10, 1.3, -Math.PI / 2, Math.PI * 0.8); f.lineWidth = 0.6; f.stroke();
        f.beginPath(); f.moveTo(10, 9); f.quadraticCurveTo(7.5, 6.5, 6.5, 8.5); f.lineWidth = 0.8; f.stroke();
        f.beginPath(); f.arc(10, 7.6, 1.1, 0, TAU); f.fillStyle = css(0xc49a52); f.fill();
      }, fig);
      lanternBody(g, e, 13.5, 10.5, 1.05);
    },
  };
}

function orrery(L: EnvLook, tw: number, th: number): PropArt {
  const W = tw * TILE + 12, H = th * TILE + 50;
  const cx = W / 2, by = H - 2;
  const R = 21;
  const ringY = by - 48;
  return {
    w: W, h: H, ox: 6, oy: H - 2,
    light: { x: cx, y: ringY, r: 70, color: 0xd9a650, i: 0.45 },
    paint: (g, e) => {
      const brass = 0xc49a52, brassD = 0x6a4a1e, brassL = 0xf0d08a;
      const ring = (gg: Ctx, rx: number, ry: number, tilt: number, w: number, front: boolean | null, col: number) => {
        gg.save(); gg.translate(cx, ringY); gg.rotate(tilt);
        gg.beginPath();
        if (front === null) gg.ellipse(0, 0, rx, ry, 0, 0, TAU);
        else if (front) gg.ellipse(0, 0, rx, ry, 0, 0, Math.PI); else gg.ellipse(0, 0, rx, ry, 0, Math.PI, TAU);
        gg.lineWidth = w + 0.7; gg.strokeStyle = css(shade(col, -0.6)); gg.stroke();
        gg.lineWidth = w; gg.strokeStyle = css(col); gg.stroke();
        gg.translate(-0.25, -0.3); gg.lineWidth = w * 0.35; gg.strokeStyle = css(brassL, 0.7); gg.stroke();
        gg.restore();
      };
      figure(g, W, H, (f) => {
        const Rr = rng(5);
        // Dais: two round steps.
        for (let s = 0; s < 2; s++) {
          const rx = W / 2 - 1 - s * 7, ry = rx * 0.42, y = by - 7 - s * 6;
          f.beginPath(); f.ellipse(cx, y + 5, rx, ry, 0, 0, Math.PI); f.lineTo(cx - rx, y); f.ellipse(cx, y, rx, ry, 0, Math.PI, 0, true); f.closePath();
          f.fillStyle = lin(f, cx - rx, 0, cx + rx, 0, [[0, css(L.wall[2])], [1, css(L.wall[0])]]); f.fill();
          f.beginPath(); f.ellipse(cx, y, rx, ry, 0, 0, TAU);
          const col = mix(L.cap[1], L.cap[2], s * 0.6);
          f.fillStyle = rad(f, cx - rx * 0.3, y - ry * 0.4, 0, rx * 1.1, [[0, css(shade(col, 0.12))], [1, css(shade(col, -0.15))]]); f.fill();
          f.lineWidth = 0.4; f.strokeStyle = css(shade(col, 0.4), 0.6); f.stroke();
          // Inlaid brass circle on the top step.
          if (s === 1) { f.beginPath(); f.ellipse(cx, y, rx * 0.75, ry * 0.75, 0, 0, TAU); f.lineWidth = 0.5; f.strokeStyle = css(brass, 0.8); f.stroke(); }
        }
        // Pedestal column.
        const py = by - 20;
        f.fillStyle = lin(f, cx - 3, 0, cx + 3, 0, [[0, css(L.wall[3])], [1, css(L.wall[0])]]);
        f.fillRect(cx - 3, ringY + 4, 6, py - ringY - 4);
        roundPoly(f, [cx - 5, ringY + 4, cx + 5, ringY + 4, cx + 4, ringY + 7, cx - 4, ringY + 7], 0.6);
        f.fillStyle = css(brass); f.fill();
        // Back halves of the rings, the core globe, then the front halves.
        ring(f, R, R * 0.36, 0.32, 1.4, false, brassD);
        ring(f, R * 0.86, R * 0.86, 0, 1.2, false, brassD);
        ring(f, R * 0.62, R * 0.24, -0.75, 0.9, false, brassD);
        f.beginPath(); f.arc(cx, ringY, 6.2, 0, TAU);
        f.fillStyle = rad(f, cx - 2, ringY - 2.5, 0, 7.5, [[0, css(0xfff0c8)], [0.35, css(0xe0a850)], [1, css(0x5a3a14)]]); f.fill();
        ring(f, R, R * 0.36, 0.32, 1.4, true, brass);
        ring(f, R * 0.86, R * 0.86, 0, 1.2, true, brass);
        ring(f, R * 0.62, R * 0.24, -0.75, 0.9, true, brassL);
        // Meridian arc and pole.
        f.beginPath(); f.moveTo(cx, ringY - R * 0.95); f.lineTo(cx, ringY + R * 0.4); f.lineWidth = 0.8; f.strokeStyle = css(brassD); f.stroke();
        // Small planets on the rings.
        for (const [a, r, ry, tilt, c, s] of [[0.4, R, 0.36, 0.32, 0x7fe8e0, 1.8], [2.6, R * 0.86, 1, 0, 0xffb347, 1.4], [4.4, R * 0.62, 0.24, -0.75, 0xd8c4ff, 1.2]] as const) {
          const x = Math.cos(a) * r, y = Math.sin(a) * r * ry;
          const X = cx + x * Math.cos(tilt) - y * Math.sin(tilt), Y = ringY + x * Math.sin(tilt) + y * Math.cos(tilt);
          f.beginPath(); f.arc(X, Y, s, 0, TAU);
          f.fillStyle = rad(f, X - s * 0.4, Y - s * 0.4, 0, s * 1.3, [[0, css(shade(c, 0.5))], [1, css(shade(c, -0.4))]]); f.fill();
        }
        // Growth around the dais.
        for (let i = 0; i < 9; i++) leaf(f, L, cx + (Rr() - 0.5) * (W - 8), by - 2 - Rr() * 6, -Math.PI / 2 + (Rr() - 0.5) * 2.4, 3 + Rr() * 2.5, 1.2, Rr() * 0.6, Rr() - 0.5);
        ivy(f, null, L, cx - W * 0.3, by - 14, 8, 77);
      }, fig);
      // Core glow and planets on the emissive layer.
      e.save(); e.globalCompositeOperation = 'lighter';
      e.fillStyle = rad(e, cx, ringY, 0, 16, [[0, css(0xffe0a0, 0.75)], [0.3, css(0xffb347, 0.3)], [1, css(0xff9a40, 0)]]);
      e.fillRect(cx - 16, ringY - 16, 32, 32);
      e.restore();
    },
  };
}

function statue(L: EnvLook): PropArt {
  const W = 24, H = 58;
  return {
    w: W, h: H, ox: 4, oy: H - 2,
    light: { x: 16.3, y: 28.5, r: 30, color: 0xffb04a, i: 0.3 },
    paint: (g, e) => {
      figure(g, W, H, (f) => {
        const R = rng(3);
        plinth(f, L, 12, H - 13, 20, 5, 6, R);
        const st = (k: number) => mix(L.wall[1], L.cap[3], k);
        // Robe: a hooded figure in weathered stone.
        roundPoly(f, [12, 10, 17.5, 16, 19.5, 40, 20.5, H - 13, 3.5, H - 13, 4.5, 40, 6.5, 16], 3);
        f.fillStyle = lin(f, 4, 0, 20, 0, [[0, css(st(0.75))], [0.45, css(st(0.5))], [1, css(st(0.05))]]); f.fill();
        // Folds.
        for (const [x0, x1] of [[9, 7.5], [12.5, 12], [16, 17.5]]) { f.beginPath(); f.moveTo(x0, 22); f.quadraticCurveTo((x0 + x1) / 2 + 0.8, 34, x1, H - 14); f.lineWidth = 0.5; f.strokeStyle = css(shade(st(0.2), -0.35), 0.7); f.stroke(); }
        // Hood and the dark face.
        f.beginPath(); f.ellipse(12, 13, 6.2, 7, 0, 0, TAU);
        f.fillStyle = rad(f, 10, 10, 0, 8, [[0, css(st(0.85))], [1, css(st(0.2))]]); f.fill();
        f.beginPath(); f.ellipse(12.4, 15, 3.6, 3.8, 0, 0, TAU); f.fillStyle = css(0x0a0b10); f.fill();
        // Arms holding a stone lantern.
        roundPoly(f, [7, 22, 15, 26, 16, 30, 8, 28], 1.5); f.fillStyle = css(st(0.55)); f.fill();
        roundPoly(f, [13.5, 24, 19, 24, 18.5, 33, 14, 33], 0.8); f.fillStyle = css(st(0.35)); f.fill();
        roundPoly(f, [14.6, 25.5, 17.9, 25.5, 17.6, 31.5, 14.9, 31.5], 0.5); f.fillStyle = css(0x3a2c20); f.fill();
        // Weathering: moss on the shoulders, lichen spots.
        for (let i = 0; i < 6; i++) { blobPath(f, 6 + R() * 12, 16 + R() * 30, 1 + R() * 1.6, 0.8 + R(), R, 6, 0.3); f.fillStyle = css(R() < 0.6 ? L.moss : 0x8a8a6a, 0.6); f.fill(); }
        ivy(f, null, L, 5.5, 20, 16, 9);
      }, fig);
      e.save(); e.globalCompositeOperation = 'lighter';
      e.fillStyle = rad(e, 16.3, 28.5, 0, 4, [[0, css(0xffc070, 0.55)], [1, css(0xff9a40, 0)]]); e.fillRect(12, 24, 9, 9);
      e.restore();
    },
  };
}

function fallenBlock(L: EnvLook, seed: number): PropArt {
  const W = 24, H = 24;
  return {
    w: W, h: H, ox: 4, oy: H - 2,
    paint: (g) => figure(g, W, H, (f) => {
      const R = rng(seed);
      block(f, L, 2, 7, 19, 9, 6, R, 0.9);
      if (R() < 0.6) block(f, L, 13 + R() * 3, 3 + R() * 3, 6, 5, 3, R, 0.5);
      for (let i = 0; i < 5; i++) leaf(f, L, 3 + R() * 18, 21 - R() * 3, -Math.PI / 2 + (R() - 0.5) * 2.4, 2.5 + R() * 2, 1, R() * 0.6, R() - 0.5);
    }, { ...fig, rimA: 0.2 }),
  };
}

function pedestal(L: EnvLook, kind: 'lantern' | 'lance'): PropArt {
  const W = 24, H = 48;
  return {
    w: W, h: H, ox: 4, oy: H - 2,
    light: kind === 'lantern' ? { x: 12, y: 16.8, r: 60, color: 0xffb050, i: 0.8 } : { x: 12, y: 9, r: 60, color: 0xffe0a0, i: 0.7 },
    paint: (g, e) => {
      figure(g, W, H, (f) => {
        const R = rng(kind === 'lantern' ? 41 : 43);
        plinth(f, L, 12, H - 14, 20, 5, 7, R);
        plinth(f, L, 12, H - 19, 15, 4, 3, R);
        // Brass inlay band.
        f.fillStyle = css(0x8a6a3a); f.fillRect(4, H - 7.5, 16, 0.8);
        for (let i = 0; i < 4; i++) leaf(f, L, 3 + R() * 18, H - 3, -Math.PI / 2 + (R() - 0.5) * 2, 2.5 + R() * 1.5, 1, R() * 0.5, R() - 0.5);
      }, fig);
      if (kind === 'lantern') {
        lanternBody(g, e, 12, 9, 1.35);
      } else {
        // The Sunlance: a slim spear of brass and light, point up, floating.
        g.save();
        g.fillStyle = lin(g, 11, 0, 13, 0, [[0, css(0xf0d08a)], [1, css(0x8a6a3a)]]);
        roundPoly(g, [11.3, 12, 12.7, 12, 12.6, 30, 11.4, 30], 0.4); g.fill();
        roundPoly(g, [12, 3, 14.6, 10.5, 12, 13.5, 9.4, 10.5], 0.4);
        g.fillStyle = lin(g, 9, 0, 15, 0, [[0, css(0xfff6dc)], [1, css(0xffc060)]]); g.fill();
        roundPoly(g, [9.5, 13, 14.5, 13, 14, 14.4, 10, 14.4], 0.3); g.fillStyle = css(0xd0a456); g.fill();
        g.restore();
        e.save(); e.globalCompositeOperation = 'lighter';
        e.fillStyle = rad(e, 12, 9, 0, 9, [[0, css(0xfff0c0, 0.85)], [0.4, css(0xffc060, 0.35)], [1, css(0xffa040, 0)]]); e.fillRect(3, 0, 18, 18);
        roundPoly(e, [12, 3, 14.6, 10.5, 12, 13.5, 9.4, 10.5], 0.4); e.fillStyle = css(0xffffff, 0.9); e.fill();
        e.fillStyle = css(0xffe0a0, 0.5); e.fillRect(11.6, 13, 0.8, 16);
        e.restore();
      }
    },
  };
}

function shrine(L: EnvLook): PropArt {
  const W = 32, H = 58;
  return {
    w: W, h: H, ox: 8, oy: H - 2,
    light: { x: 16, y: 22, r: 80, color: 0xff9a40, i: 0.9 },
    paint: (g, e) => {
      const cx = 16, dy = 22;
      figure(g, W, H, (f) => {
        const R = rng(61);
        plinth(f, L, cx, H - 13, 30, 5, 6, R);
        plinth(f, L, cx, H - 19, 23, 4, 4, R);
        // The stele, round-topped.
        const sx = cx - 7.5, sw = 15, top = 8, bot = H - 19;
        f.beginPath(); f.moveTo(sx, bot); f.lineTo(sx, top + 7); f.ellipse(cx, top + 7, sw / 2, 7, 0, Math.PI, TAU); f.lineTo(sx + sw, bot); f.closePath();
        f.fillStyle = lin(f, sx, 0, sx + sw, 0, [[0, css(L.cap[3])], [0.35, css(L.wall[3])], [1, css(L.wall[0])]]); f.fill();
        f.save(); f.clip();
        f.fillStyle = lin(f, 0, top, 0, top + 5, [[0, css(0xffffff, 0.12)], [1, css(0xffffff, 0)]]); f.fillRect(sx, top, sw, 5);
        f.restore();
        // Sun disc.
        f.beginPath(); f.arc(cx, dy, 5.6, 0, TAU); f.fillStyle = css(0x5a3e18); f.fill();
        f.beginPath(); f.arc(cx, dy, 4.6, 0, TAU); f.lineWidth = 0.8; f.strokeStyle = css(0xd0a456); f.stroke();
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; f.beginPath(); f.moveTo(cx + Math.cos(a) * 5.8, dy + Math.sin(a) * 5.8); f.lineTo(cx + Math.cos(a) * (i % 2 ? 7 : 7.8), dy + Math.sin(a) * (i % 2 ? 7 : 7.8)); f.lineWidth = 0.6; f.strokeStyle = css(0xb08a4a); f.stroke(); }
        f.beginPath(); f.arc(cx, dy, 2.6, 0, TAU); f.fillStyle = rad(f, cx - 0.8, dy - 0.8, 0, 3, [[0, css(0xfff6dc)], [1, css(0xe08a30)]]); f.fill();
        // Inscription lines.
        for (let i = 0; i < 4; i++) { f.fillStyle = css(0x05060a, 0.4); f.fillRect(cx - 4.5 + (i % 2), 32 + i * 2.6, 9 - (i % 2) * 2, 0.5); }
        ivy(f, null, L, sx + 1.5, top + 8, 14, 31);
        for (let i = 0; i < 6; i++) leaf(f, L, 3 + R() * 26, H - 4, -Math.PI / 2 + (R() - 0.5) * 2.4, 2.5 + R() * 2, 1, R() * 0.6, R() - 0.5);
      }, fig);
      e.save(); e.globalCompositeOperation = 'lighter';
      e.fillStyle = rad(e, cx, dy, 0, 12, [[0, css(0xfff0c0, 0.9)], [0.25, css(0xffa040, 0.45)], [1, css(0xff8a30, 0)]]); e.fillRect(cx - 12, dy - 12, 24, 24);
      e.restore();
    },
  };
}

function heartbloom(L: EnvLook): PropArt {
  const W = 36, H = 34;
  return {
    w: W, h: H, ox: 10, oy: H - 2,
    light: { x: 18, y: 15, r: 70, color: 0xff6a8a, i: 0.8 },
    paint: (g, e) => {
      bush(g, null, L, 18, 22, 12.5, 401, { flowers: 0, lume: 0 });
      // Big glowing rose-red blossoms.
      for (const [x, y, r] of [[18, 13, 4.6], [10, 18.5, 3.4], [26, 18, 3.6], [15, 23, 2.6]] as const) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU + (k % 2) * 0.2;
          const rr = r * (k % 2 ? 0.95 : 1.05);
          g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.38, rr * 0.55, rr * 0.42, a, 0, TAU);
          g.fillStyle = css(k < 4 ? 0xff9ab4 : 0xe0587a); g.fill();
        }
        g.beginPath(); g.arc(x, y, r * 0.45, 0, TAU); g.fillStyle = rad(g, x - r * 0.15, y - r * 0.15, 0, r * 0.5, [[0, css(0xfff1f4)], [1, css(0xff7a9a)]]); g.fill();
        e.save(); e.globalCompositeOperation = 'lighter';
        e.fillStyle = rad(e, x, y, 0, r * 2.4, [[0, css(0xffc2d2, 0.75)], [0.4, css(0xff6a8a, 0.3)], [1, css(0xff6a8a, 0)]]); e.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
        e.restore();
      }
    },
  };
}

function cache(L: EnvLook): PropArt {
  const W = 26, H = 26;
  return {
    w: W, h: H, ox: 5, oy: H - 2,
    light: { x: 13, y: 12, r: 56, color: 0x60e0ff, i: 0.7 },
    paint: (g, e) => {
      figure(g, W, H, (f) => {
        const wood = 0x5a4232, woodD = 0x2e2018;
        // Chest body.
        roundPoly(f, [3, 11, 23, 11, 23, 23, 3, 23], 1);
        f.fillStyle = lin(f, 3, 0, 23, 0, [[0, css(wood)], [1, css(woodD)]]); f.fill();
        // Domed lid.
        f.beginPath(); f.moveTo(3, 12); f.lineTo(3, 9); f.quadraticCurveTo(13, 2, 23, 9); f.lineTo(23, 12); f.closePath();
        f.fillStyle = lin(f, 0, 4, 0, 12, [[0, css(shade(wood, 0.25))], [1, css(wood)]]); f.fill();
        // Brass bands and lock.
        for (const x of [3.5, 12, 20.5]) { roundPoly(f, [x, 5, x + 2, 5, x + 2, 23, x, 23], 0.3); f.fillStyle = lin(f, x, 0, x + 2, 0, [[0, css(0xf0d08a)], [1, css(0x8a6a3a)]]); f.fill(); }
        roundPoly(f, [11, 13.5, 15, 13.5, 15, 17.5, 11, 17.5], 0.5); f.fillStyle = css(0xc49a52); f.fill();
        // Light leaking from the seam.
        f.fillStyle = css(0x9ff5ff); f.fillRect(3.2, 11.6, 19.6, 0.7);
        f.fillStyle = css(0x0a0b10); f.fillRect(12.6, 15, 0.8, 1.6);
        for (let i = 0; i < 4; i++) leaf(f, L, 2 + i * 6, 24, -Math.PI / 2 + (i - 1.5) * 0.6, 2.5, 1, 0.3, 0);
      }, fig);
      e.save(); e.globalCompositeOperation = 'lighter';
      e.fillStyle = lin(e, 0, 9, 0, 15, [[0, css(0x60e0ff, 0)], [0.5, css(0x9ff5ff, 0.85)], [1, css(0x60e0ff, 0)]]); e.fillRect(2, 9, 22, 6);
      e.fillStyle = rad(e, 13, 12, 0, 10, [[0, css(0x9ff5ff, 0.5)], [1, css(0x60e0ff, 0)]]); e.fillRect(3, 2, 20, 20);
      e.restore();
    },
  };
}

function loreLantern(L: EnvLook): PropArt {
  const W = 20, H = 48;
  return {
    w: W, h: H, ox: 2, oy: H - 2,
    light: { x: 10, y: 11.3, r: 70, color: 0xffa040, i: 0.9 },
    paint: (g, e) => {
      figure(g, W, H, (f) => {
        const R = rng(81);
        plinth(f, L, 10, H - 10, 14, 4, 4, R);
        // Stone post.
        f.fillStyle = lin(f, 7.5, 0, 12.5, 0, [[0, css(L.wall[3])], [1, css(L.wall[0])]]);
        f.fillRect(7.5, 18, 5, H - 28);
        roundPoly(f, [6, 16, 14, 16, 13.5, 18.5, 6.5, 18.5], 0.5); f.fillStyle = css(L.cap[2]); f.fill();
        ivy(f, null, L, 8, 20, 12, 5);
      }, fig);
      // The lantern stays dark until kindled; the view lights it.
      lanternBody(g, e, 10, 4, 1.25, 0);
    },
  };
}

function brazier(L: EnvLook): PropArt {
  const W = 24, H = 32;
  return {
    w: W, h: H, ox: 4, oy: H - 2,
    light: { x: 12, y: 9, r: 84, color: 0xff7a2a, i: 1.0 },
    paint: (g, e) => {
      figure(g, W, H, (f) => {
        // Three iron legs.
        f.lineCap = 'round';
        for (const [x0, x1] of [[6, 3.5], [12, 12], [18, 20.5]]) { f.beginPath(); f.moveTo(x0, 15); f.lineTo(x1, H - 3); f.lineWidth = 1.2; f.strokeStyle = css(0x2a2426); f.stroke(); }
        // Bowl.
        f.beginPath(); f.moveTo(3, 12); f.quadraticCurveTo(12, 24, 21, 12); f.closePath();
        f.fillStyle = lin(f, 3, 0, 21, 0, [[0, css(0x5a4e4a)], [1, css(0x1e1a1a)]]); f.fill();
        f.beginPath(); f.ellipse(12, 12, 9, 3, 0, 0, TAU); f.fillStyle = css(0x3a3230); f.fill();
        // Embers.
        f.beginPath(); f.ellipse(12, 11.4, 7.8, 2.4, 0, 0, TAU);
        f.fillStyle = rad(f, 12, 11, 0, 8, [[0, css(0xffe0a0)], [0.4, css(0xff8a2a)], [1, css(0x8a2a10)]]); f.fill();
        for (let i = 0; i < 7; i++) { const x = 6 + i * 2, y = 10 + (i % 3) * 0.6; f.beginPath(); f.ellipse(x, y, 1, 0.6, 0, 0, TAU); f.fillStyle = css(i % 2 ? 0x2a1a14 : 0xffd27a); f.fill(); }
        f.beginPath(); f.moveTo(3, 12); f.quadraticCurveTo(12, 14.5, 21, 12); f.lineWidth = 0.6; f.strokeStyle = css(0x7a6a64); f.stroke();
        void L;
      }, fig);
      e.save(); e.globalCompositeOperation = 'lighter';
      e.fillStyle = rad(e, 12, 10, 0, 12, [[0, css(0xffe0a0, 0.9)], [0.3, css(0xff8a2a, 0.45)], [1, css(0xff5a14, 0)]]); e.fillRect(0, -2, 24, 24);
      // Static flame tongues (the view adds flicker and sparks).
      for (const [x, h] of [[9, 7], [12, 10], [15, 6.5]] as const) {
        e.beginPath(); e.moveTo(x - 2, 11); e.quadraticCurveTo(x - 1.5, 11 - h * 0.6, x, 11 - h); e.quadraticCurveTo(x + 1.5, 11 - h * 0.6, x + 2, 11); e.closePath();
        e.fillStyle = lin(e, 0, 11 - h, 0, 11, [[0, css(0xff8a2a, 0)], [0.5, css(0xffb347, 0.7)], [1, css(0xfff0c0, 0.95)]]); e.fill();
      }
      e.restore();
    },
  };
}

export function propArt(kind: string, tw: number, th: number, zone: Zone, seed: number): PropArt {
  const L = LOOKS[zone];
  switch (kind) {
    case 'o': return pillar(L, seed);
    case 'L': return lanternPost(L);
    case 'O': return orrery(L, tw, th);
    case 's': return statue(L);
    case 'c': return fallenBlock(L, seed);
    case 'W': return pedestal(L, 'lantern');
    case 'V': return pedestal(L, 'lance');
    case 'U': return shrine(L);
    case 'H': return heartbloom(L);
    case 'C': return cache(L);
    case 'K': return loreLantern(L);
    case 'B': return brazier(L);
    default: return { w: 16, h: 16, ox: 0, oy: 16, paint: () => {} };
  }
}

export { starFlower };
