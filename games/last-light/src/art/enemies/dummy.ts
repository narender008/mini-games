// Training husk in the sanctum: a stuffed burlap sack lashed to a wooden post with a crossbar for
// arms, standing in a chipped stone base. Rope bindings at the neck, chest and waist; a sewn-on patch,
// a split seam with straw poking out, rag-wrapped arm ends; a target ring painted in amber on the
// chest (worn and flaking: it is paint, so nothing here glows). One idle frame.
import type { SpriteSet } from '../sprite';
import { type Ctx, TAU, css, figure, lin, noiseTexture, polyline, rad, rng, roundPoly, taper } from '../paint';

const W = 28, H = 40, FY = 37;
const CX = 14;
const INK = 0x0a0b12;
const SACK = { deep: 0x3c2817, dark: 0x664a2c, mid: 0x9c7848, light: 0xc79e66, high: 0xe2c08a };
const WOOD = { deep: 0x2e1d10, dark: 0x4a301a, mid: 0x74502e, light: 0x9c7044 };
const ROPE = { dark: 0x7a5e34, mid: 0xb08e56, light: 0xdcc08a };
const STONE = { deep: 0x2b2d36, dark: 0x454853, mid: 0x5f626d, light: 0x7d7f89, high: 0xa4a5ad };
const PAINT = { deep: 0xb05a14, mid: 0xf0a13c, light: 0xffd88a };
const STRAW = [0xd8b860, 0xb8963e, 0xe8d290];

/** Woven burlap texture inside the current clip: fine warp and weft threads plus soft noise. */
function weave(c: Ctx, x0: number, y0: number, x1: number, y1: number) {
  let k = 0;
  for (let y = y0; y < y1; y += 0.62, k++) polyline(c, [x0, y, x1, y + 0.15], k % 4 ? 0.12 : 0.22, css(SACK.deep, k % 4 ? 0.12 : 0.2));
  k = 0;
  for (let x = x0; x < x1; x += 0.62, k++) polyline(c, [x, y0, x + 0.1, y1], k % 3 ? 0.1 : 0.18, css(SACK.high, k % 3 ? 0.07 : 0.12));
  const p = c.createPattern(noiseTexture(128, 16, 61, 3, 1.4), 'repeat')!;
  p.setTransform(new DOMMatrix([6 / 128, 0, 0, 6 / 128, 0, 0]));
  c.globalCompositeOperation = 'overlay';
  c.globalAlpha = 0.2;
  c.fillStyle = p;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
}

/** A band of twisted rope across (x0, y0)-(x1, y1), slightly sagging. */
function rope(c: Ctx, x0: number, y0: number, x1: number, y1: number, sag = 0.4, w = 1.1) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag;
  const pts = [x0, y0, mx, my, x1, y1];
  polyline(c, pts, w + 0.5, css(INK, 0.9));
  polyline(c, pts, w, css(ROPE.mid));
  polyline(c, pts.map((v, i) => v - (i % 2 ? w * 0.22 : 0)), w * 0.35, css(ROPE.light, 0.8));
  // The twist: short diagonal strokes along the rope.
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(L / 0.75);
  for (let i = 1; i < n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * x0 + 2 * u * t * mx + t * t * x1, y = u * u * y0 + 2 * u * t * my + t * t * y1;
    polyline(c, [x - 0.25, y - w * 0.45, x + 0.2, y + w * 0.45], 0.18, css(ROPE.dark, 0.85));
  }
}

function straw(c: Ctx, x: number, y: number, a0: number, spread: number, n: number, len: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = a0 + (r() - 0.5) * spread, l = len * (0.6 + r() * 0.6);
    const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
    polyline(c, [x, y, (x + ex) / 2 + (r() - 0.5) * 0.4, (y + ey) / 2, ex, ey], 0.5, css(INK, 0.8));
    polyline(c, [x, y, (x + ex) / 2 + (r() - 0.5) * 0.4, (y + ey) / 2, ex, ey], 0.24, css(STRAW[i % 3]));
  }
}

function paint(f: Ctx) {
  const r = rng(17);
  // Stone base: a squat chipped drum, top face lit.
  const by = 32.4;
  roundPoly(f, [CX - 7.6, by, CX + 7.6, by, CX + 7.2, FY + 0.2, CX - 7.2, FY + 0.4], 1.2);
  f.fillStyle = lin(f, CX - 7, 0, CX + 7, 0, [[0, css(STONE.light)], [0.45, css(STONE.mid)], [1, css(STONE.deep)]]);
  f.fill();
  f.lineWidth = 0.5; f.strokeStyle = css(INK); f.stroke();
  f.beginPath(); f.ellipse(CX, by, 7.6, 2.3, 0, 0, TAU);
  f.fillStyle = rad(f, CX - 3, by - 1.2, 0.5, 9, [[0, css(STONE.high)], [0.5, css(STONE.light)], [1, css(STONE.mid)]]);
  f.fill();
  f.lineWidth = 0.5; f.strokeStyle = css(INK); f.stroke();
  // Chips, cracks and a lit lip on the base.
  polyline(f, [CX - 7.3, by + 0.5, CX - 3, by + 2.2, CX + 3, by + 2.2, CX + 7.3, by + 0.5], 0.35, css(STONE.high, 0.55));
  polyline(f, [CX + 3.5, by + 2.6, CX + 4.2, by + 3.8, CX + 3.8, FY - 0.4], 0.3, css(STONE.deep, 0.9));
  polyline(f, [CX - 5, by + 2.8, CX - 5.6, by + 4.2], 0.3, css(STONE.deep, 0.9));
  f.beginPath(); f.moveTo(CX + 7.4, by + 1.2); f.lineTo(CX + 5.8, by + 2.2); f.lineTo(CX + 7.2, by + 3.2); f.closePath();
  f.fillStyle = css(STONE.deep); f.fill();
  // A bit of moss at the foot of the base.
  for (let i = 0; i < 5; i++) {
    f.beginPath(); f.ellipse(CX - 6.4 + i * 0.9, FY - 0.3 - (i % 2) * 0.4, 0.9, 0.55, 0, 0, TAU);
    f.fillStyle = css(i % 2 ? 0x2f6a52 : 0x4f8a6a); f.fill();
  }

  // Post: rough-hewn wood with grain, sunk into the base.
  const px0 = CX - 1.3, px1 = CX + 1.3;
  roundPoly(f, [px0, 9, px1, 9, px1 + 0.1, by + 0.6, px0 - 0.1, by + 0.6], 0.4);
  f.fillStyle = lin(f, px0, 0, px1, 0, [[0, css(WOOD.light)], [0.4, css(WOOD.mid)], [1, css(WOOD.deep)]]);
  f.fill();
  f.lineWidth = 0.45; f.strokeStyle = css(INK); f.stroke();
  for (let i = 0; i < 4; i++) polyline(f, [px0 + 0.5 + i * 0.5, 26, px0 + 0.4 + i * 0.5 + (r() - 0.5) * 0.3, by], 0.15, css(WOOD.deep, 0.7));
  f.beginPath(); f.ellipse(CX - 0.2, 29.5, 0.45, 0.8, 0, 0, TAU); f.fillStyle = css(WOOD.deep); f.fill(); // knot
  f.beginPath(); f.ellipse(CX, by + 0.4, 2.4, 0.8, 0, 0, TAU); f.fillStyle = css(STONE.deep, 0.7); f.fill(); // socket shadow

  // Crossbar arms with rag-wrapped ends.
  const ay = 14.2;
  roundPoly(f, [2.4, ay - 1.2, W - 2.4, ay - 1.4, W - 2.2, ay + 1.1, 2.2, ay + 1.3], 0.5);
  f.fillStyle = lin(f, 0, ay - 1.4, 0, ay + 1.3, [[0, css(WOOD.light)], [0.5, css(WOOD.mid)], [1, css(WOOD.deep)]]);
  f.fill();
  f.lineWidth = 0.45; f.strokeStyle = css(INK); f.stroke();
  polyline(f, [3, ay - 0.6, W - 3, ay - 0.8], 0.15, css(WOOD.deep, 0.6));
  polyline(f, [3, ay + 0.3, W - 3, ay + 0.2], 0.15, css(WOOD.deep, 0.6));
  for (const [x0, x1] of [[1.6, 5.2], [W - 5.2, W - 1.6]]) {
    roundPoly(f, [x0, ay - 1.9, x1, ay - 1.7, x1 + 0.2, ay + 1.6, x0 - 0.2, ay + 1.9], 0.8);
    f.fillStyle = lin(f, 0, ay - 2, 0, ay + 2, [[0, css(0xc4ad84)], [0.55, css(0x9a8462)], [1, css(0x5e4c36)]]);
    f.fill();
    f.lineWidth = 0.45; f.strokeStyle = css(INK); f.stroke();
    for (let k = 0; k < 3; k++) polyline(f, [x0 + 0.6 + k * 1.1, ay - 1.8, x0 + 1.4 + k * 1.1, ay + 1.8], 0.22, css(0x4a3a28, 0.8));
    // A loose tail of rag hanging down.
    taper(f, [x0 + (x0 < CX ? 0.6 : 2.6), ay + 1.6, x0 + (x0 < CX ? 0.3 : 2.9), ay + 3.6, x0 + (x0 < CX ? 0.8 : 2.4), ay + 5], 1.1, 0.5, css(0x8c7656));
  }

  // The sack body: stuffed burlap, rounded, lit from the upper left.
  const sack: number[] = [
    CX - 5.8, 13.4, CX - 2, 12.4, CX + 2.4, 12.5, CX + 6, 13.6, CX + 7.3, 15.4, CX + 6.9, 16.9, // shoulders, chest rope
    CX + 8.1, 19.6, CX + 8, 23.6, CX + 6.8, 26.6, // belly, waist rope
    CX + 7.1, 28.2, CX + 5.4, 30, CX, 30.8, CX - 5.4, 29.8, CX - 7.1, 28, // hem
    CX - 6.8, 26.4, CX - 8, 23.2, CX - 8.1, 19.4, CX - 6.9, 16.7, CX - 7.2, 15.2];
  roundPoly(f, sack, 1.6);
  f.lineWidth = 0.9; f.strokeStyle = css(INK); f.stroke();
  f.fillStyle = rad(f, CX - 3, 17, 1, 13, [[0, css(SACK.high)], [0.3, css(SACK.light)], [0.65, css(SACK.mid)], [1, css(SACK.dark)]]);
  f.fill();
  f.save();
  roundPoly(f, sack, 1.6);
  f.clip();
  weave(f, CX - 8, 12, CX + 8, 31);
  // Folds where the stuffing bunches under the ropes.
  for (const [x, y, l] of [[CX - 4.5, 15.5, 2.4], [CX + 4, 16, 2], [CX - 5, 27, 2], [CX + 3.6, 27.6, 2.2], [CX + 5.6, 21.5, 2.6]] as const) {
    polyline(f, [x, y, x + 0.4, y + l * 0.5, x + 0.1, y + l], 0.4, css(SACK.deep, 0.5));
    polyline(f, [x - 0.4, y, x, y + l * 0.5, x - 0.3, y + l], 0.25, css(SACK.high, 0.4));
  }
  // Shade on the right and toward the hem.
  f.fillStyle = lin(f, CX - 2, 0, CX + 8, 0, [[0, 'rgba(20,12,6,0)'], [1, 'rgba(20,12,6,0.4)']]);
  f.fillRect(CX - 8, 12, 16, 20);
  // A sewn-on patch with cross stitches.
  roundPoly(f, [CX + 2.2, 23.4, CX + 5.8, 23, CX + 6, 26.6, CX + 2.4, 26.8], 0.4);
  f.fillStyle = lin(f, CX + 2, 23, CX + 6, 27, [[0, css(0x8c6a52)], [1, css(0x5a4232)]]); f.fill();
  f.lineWidth = 0.3; f.strokeStyle = css(SACK.deep); f.stroke();
  for (let i = 0; i < 4; i++) {
    const x = CX + 2.6 + i * 0.95;
    polyline(f, [x - 0.3, 22.7, x + 0.3, 23.5], 0.2, css(0x2a1c10));
    polyline(f, [x + 0.3, 22.7, x - 0.3, 23.5], 0.2, css(0x2a1c10));
  }
  // The painted target: worn amber rings with flaked spots.
  const tx = CX - 0.6, ty = 20.4;
  f.beginPath(); f.arc(tx, ty, 4.1, 0, TAU); f.lineWidth = 1.05; f.strokeStyle = css(PAINT.mid); f.stroke();
  f.beginPath(); f.arc(tx, ty, 4.1, Math.PI * 0.9, Math.PI * 1.6); f.lineWidth = 0.4; f.strokeStyle = css(PAINT.light, 0.8); f.stroke();
  f.beginPath(); f.arc(tx, ty, 2.2, 0, TAU); f.lineWidth = 0.75; f.strokeStyle = css(PAINT.deep); f.stroke();
  f.beginPath(); f.arc(tx, ty, 1, 0, TAU); f.fillStyle = css(PAINT.mid); f.fill();
  f.beginPath(); f.arc(tx - 0.3, ty - 0.3, 0.4, 0, TAU); f.fillStyle = css(PAINT.light); f.fill();
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU, rr = 3.6 + r() * 1;
    f.beginPath(); f.ellipse(tx + Math.cos(a) * rr, ty + Math.sin(a) * rr, 0.35 + r() * 0.3, 0.25, a, 0, TAU);
    f.fillStyle = css(SACK.mid, 0.9); f.fill();
  }
  // Paint drips under the ring.
  for (const dx of [-1.6, 1.4]) taper(f, [tx + dx, ty + 3.6, tx + dx + 0.1, ty + 5.4], 0.5, 0.3, css(PAINT.mid, 0.85));
  f.restore();
  // A split seam on the left with straw spilling out.
  polyline(f, [CX - 6.6, 22, CX - 5.4, 24.4], 0.7, css(SACK.deep));
  straw(f, CX - 6, 23.2, Math.PI * 1.05, 1.2, 6, 2.6, 4);
  // The stuffing bulges between the ropes: a soft shadow tucked under each binding.
  f.save();
  roundPoly(f, sack, 1.6);
  f.clip();
  for (const y of [17.9, 27.6]) polyline(f, [CX - 8, y, CX, y + 0.8, CX + 8, y + 0.1], 1.4, 'rgba(30,18,8,0.28)');
  f.restore();
  // Rope bindings round the chest and waist, and a knot.
  rope(f, CX - 7.4, 16.6, CX + 7.6, 16.8, 0.8, 1);
  rope(f, CX - 7.2, 26.4, CX + 7.2, 26.6, 0.9, 1.1);
  f.beginPath(); f.ellipse(CX + 3.2, 27.4, 1, 0.8, 0.3, 0, TAU);
  f.fillStyle = css(ROPE.mid); f.fill(); f.lineWidth = 0.4; f.strokeStyle = css(INK); f.stroke();
  taper(f, [CX + 3.4, 28, CX + 3.8, 29.8, CX + 3.4, 31], 0.7, 0.35, css(ROPE.mid));
  taper(f, [CX + 3, 28, CX + 2.6, 29.6], 0.6, 0.3, css(ROPE.dark));

  // Head: a smaller tied sack with straw bursting from the top and a stitched face.
  const hy = 7.4;
  f.beginPath(); f.ellipse(CX + 0.2, hy, 4.7, 4.5, 0, 0, TAU);
  f.lineWidth = 0.9; f.strokeStyle = css(INK); f.stroke();
  f.fillStyle = rad(f, CX - 1.6, hy - 1.8, 0.5, 6.4, [[0, css(SACK.high)], [0.4, css(SACK.light)], [0.8, css(SACK.mid)], [1, css(SACK.dark)]]);
  f.fill();
  f.save();
  f.beginPath(); f.ellipse(CX + 0.2, hy, 4.7, 4.5, 0, 0, TAU);
  f.clip();
  weave(f, CX - 5, hy - 5, CX + 5, hy + 5);
  f.fillStyle = lin(f, CX - 1, 0, CX + 5, 0, [[0, 'rgba(20,12,6,0)'], [1, 'rgba(20,12,6,0.4)']]);
  f.fillRect(CX - 5, hy - 5, 10, 10);
  // Stitched X eyes and a running-stitch mouth.
  for (const ex of [CX - 1.4, CX + 1.9]) {
    polyline(f, [ex - 0.7, hy - 0.4, ex + 0.7, hy + 0.9], 0.38, css(0x22140a));
    polyline(f, [ex + 0.7, hy - 0.4, ex - 0.7, hy + 0.9], 0.38, css(0x22140a));
  }
  for (let i = 0; i < 4; i++) polyline(f, [CX - 1.3 + i * 0.9, hy + 2.4 + (i % 2) * 0.15, CX - 0.8 + i * 0.9, hy + 2.5], 0.25, css(0x22140a));
  f.restore();
  straw(f, CX + 0.4, hy - 3.8, -Math.PI / 2, 1.6, 8, 2.8, 9);
  // Neck tie.
  rope(f, CX - 3, 11.6, CX + 3.2, 11.6, 0.4, 1.2);
  // Pins of light on the rope and crossbar edges (moon side).
  polyline(f, [CX - 6, 13.2, CX - 2, 12.5], 0.3, css(SACK.high, 0.5));
}

export function dummySprites(): SpriteSet {
  return {
    w: W, h: H, footY: FY,
    anims: {
      idle: [(g) => {
        if (g.canvas.width <= 8 && g.canvas.height <= 8) return; // the emissive pass: nothing here glows
        figure(g, W, H, paint, { ink: INK, inkW: 0.55, rim: 0xb9c6ea, rimW: 0.6, rimA: 0.5, shadeW: 0.9, shadeA: 0.25 });
      }],
    },
  };
}
