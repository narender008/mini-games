// What did a big kid paint? A free painting is compared with every friend
// on three things, all on the device:
//  - shape: the painted area, cropped to its bounds and squeezed into a
//    small grid, against each friend's own silhouette seen along its canvas
//    view (shapes.js, made from the real 3D friends) squeezed the same way,
//    scored by overlap;
//  - proportions: how wide the painting is for its height;
//  - colours: how close the colours used are to the friend's own (a yellow
//    round thing is more likely a sun than a whale).
// The answer is a ranked list with a confidence: when one friend clearly
// wins the game offers just that one picture, otherwise the best three.
import { SUBJECTS } from './creatures/catalog.js';
import { SHAPES, SHAPE_W, SHAPE_H } from './creatures/shapes.js';

// the painted map (1 = paint), w x h, cropped to its bounds and squeezed to SHAPE_W x SHAPE_H
export function squeeze(map, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!map[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  if (x1 < 0) return null;
  const out = new Float32Array(SHAPE_W * SHAPE_H);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  for (let y = 0; y < SHAPE_H; y++)
    for (let x = 0; x < SHAPE_W; x++) {
      // average the source cells that fall in this one
      const sx0 = x0 + (x / SHAPE_W) * bw;
      const sx1 = x0 + ((x + 1) / SHAPE_W) * bw;
      const sy0 = y0 + (y / SHAPE_H) * bh;
      const sy1 = y0 + ((y + 1) / SHAPE_H) * bh;
      let s = 0;
      let n = 0;
      for (let yy = Math.floor(sy0); yy < Math.max(Math.floor(sy0) + 1, Math.ceil(sy1)); yy++)
        for (let xx = Math.floor(sx0); xx < Math.max(Math.floor(sx0) + 1, Math.ceil(sx1)); xx++) {
          s += map[yy * w + xx] || 0;
          n++;
        }
      out[y * SHAPE_W + x] = s / n;
    }
  return { grid: out, aspect: bw / bh };
}

// a friend's stored silhouette (base64 bits) as a grid
const cache = {};
function shapeOf(id) {
  if (cache[id]) return cache[id];
  const s = SHAPES[id];
  if (!s) return null;
  const bytes = Uint8Array.from(atob(s.bits), (c) => c.charCodeAt(0));
  const grid = new Float32Array(SHAPE_W * SHAPE_H);
  for (let i = 0; i < grid.length; i++) grid[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  // soften it a little, as a painting's edges are never exact
  const soft = new Float32Array(grid.length);
  for (let y = 0; y < SHAPE_H; y++)
    for (let x = 0; x < SHAPE_W; x++) {
      let a = 0;
      let n = 0;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const xx = x + i;
          const yy = y + j;
          if (xx < 0 || yy < 0 || xx >= SHAPE_W || yy >= SHAPE_H) continue;
          a += grid[yy * SHAPE_W + xx] * (i || j ? 1 : 3);
          n += i || j ? 1 : 3;
        }
      soft[y * SHAPE_W + x] = a / n;
    }
  return (cache[id] = { grid: soft, aspect: s.aspect });
}

function overlap(a, b) {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    inter += Math.min(a[i], b[i]);
    union += Math.max(a[i], b[i]);
  }
  return union > 0 ? inter / union : 0;
}

function rgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

// a rough perceptual distance between two sRGB colours (0 same .. ~1 far)
function colourDistance(a, b) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm) * dr * dr + 4 * dg * dg + (3 - rm) * db * db) / 3;
}

// colours: [[hex, weight], ...] as painted
function colourScore(colours, palette) {
  let tot = 0;
  let s = 0;
  for (const [c, w] of colours) {
    let best = Infinity;
    for (const p of palette) best = Math.min(best, colourDistance(c, p));
    s += w * Math.max(0, 1 - best * 1.6);
    tot += w;
  }
  return tot > 0 ? s / tot : 0.5;
}

// map: painted cells (Uint8Array w*h); colours: [[hex, weight]]
// returns { ranked: [{ id, score }], sure }
export function guess(map, w, h, colours) {
  const painted = squeeze(map, w, h);
  const out = [];
  for (const s of SUBJECTS) {
    const shape = shapeOf(s.id);
    const aspect = shape?.aspect ?? s.aspect ?? 1.3;
    let score = 0;
    if (painted) {
      const a = Math.abs(Math.log(painted.aspect / aspect));
      const prop = Math.exp(-a * a * 3);
      const sh = shape ? overlap(painted.grid, shape.grid) : 0.35;
      score = sh * 0.55 + prop * 0.2 + colourScore(colours, s.palette) * 0.25;
    }
    out.push({ id: s.id, score });
  }
  out.sort((a, b) => b.score - a.score);
  const sure = out.length > 1 && out[0].score > 0.45 && out[0].score - out[1].score > 0.08;
  return { ranked: out, sure };
}
