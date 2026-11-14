// A tiny pixel-art painter. Art is drawn at 1x on an RGBA buffer ("art pixels"), then post-processed
// (outlines, rim light) and upscaled by ART_SCALE with nearest-neighbour into the canvas a texture uses.
import { ART_SCALE } from '../config';

export type RGBA = [number, number, number, number];

export function hex(c: string | number, a = 255): RGBA {
  const n = typeof c === 'number' ? c : parseInt(c.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}
export const mix = (a: RGBA, b: RGBA, t: number): RGBA => [
  Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t), Math.round(a[3] + (b[3] - a[3]) * t),
];
export const shade = (c: RGBA, k: number): RGBA => k >= 0 ? mix(c, [255, 255, 255, c[3]], k) : mix(c, [0, 0, 0, c[3]], -k);
export const withA = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], a];

export class Pix {
  readonly w: number;
  readonly h: number;
  readonly d: Uint8ClampedArray;
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  inb(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number): RGBA {
    x |= 0; y |= 0;
    if (!this.inb(x, y)) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  alpha(x: number, y: number) { x |= 0; y |= 0; return this.inb(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0; }
  /** Set a pixel; partial alpha blends over what is there. */
  set(x: number, y: number, c: RGBA) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inb(x, y) || c[3] <= 0) return;
    const i = (y * this.w + x) * 4;
    if (c[3] >= 255 || this.d[i + 3] === 0) {
      this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
      this.d[i + 3] = c[3] >= 255 ? 255 : Math.max(this.d[i + 3], c[3]);
      if (c[3] < 255 && this.d[i + 3] === c[3]) return;
      return;
    }
    const a = c[3] / 255;
    this.d[i] += (c[0] - this.d[i]) * a;
    this.d[i + 1] += (c[1] - this.d[i + 1]) * a;
    this.d[i + 2] += (c[2] - this.d[i + 2]) * a;
    this.d[i + 3] = Math.min(255, this.d[i + 3] + c[3] * (1 - this.d[i + 3] / 255));
  }
  /** Overwrite only already-painted pixels (shading inside a silhouette). */
  tint(x: number, y: number, c: RGBA) { if (this.alpha(x, y) > 0) this.set(x, y, c); }
  clear(x: number, y: number) { x |= 0; y |= 0; if (this.inb(x, y)) this.d.fill(0, (y * this.w + x) * 4, (y * this.w + x) * 4 + 4); }
  rect(x: number, y: number, w: number, h: number, c: RGBA) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  /** Filled ellipse centred on (cx, cy) with radii rx, ry (pixel-centre sampling). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA | ((x: number, y: number, u: number, v: number) => RGBA | null)) {
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v <= 1) {
        const col = typeof c === 'function' ? c(x, y, u, v) : c;
        if (col) this.set(x, y, col);
      }
    }
  }
  /** Filled polygon (even-odd), points as flat [x0,y0,x1,y1,...]. */
  poly(pts: number[], c: RGBA | ((x: number, y: number) => RGBA | null)) {
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < pts.length; i += 2) { minY = Math.min(minY, pts[i]); maxY = Math.max(maxY, pts[i]); }
    const n = pts.length / 2;
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        const ax = pts[i * 2], ay = pts[i * 2 + 1];
        const bx = pts[((i + 1) % n) * 2], by = pts[((i + 1) % n) * 2 + 1];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) {
          const col = typeof c === 'function' ? c(x, y) : c;
          if (col) this.set(x, y, col);
        }
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGBA, w = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (w <= 1) this.set(x0, y0, c);
      else this.rect(x0 - ((w - 1) >> 1), y0 - ((w - 1) >> 1), w, w, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Thick tapered stroke through points (for limbs, tails, vines). */
  stroke(pts: number[], w0: number, w1: number, c: RGBA) {
    const n = pts.length / 2;
    for (let i = 0; i < n - 1; i++) {
      const ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[i * 2 + 2], by = pts[i * 2 + 3];
      const len = Math.max(1, Math.hypot(bx - ax, by - ay));
      for (let s = 0; s <= len; s += 0.5) {
        const t = (i + s / len) / (n - 1);
        const r = (w0 + (w1 - w0) * t) / 2;
        const x = ax + ((bx - ax) * s) / len, y = ay + ((by - ay) * s) / len;
        if (r <= 0.5) this.set(x, y, c);
        else this.ellipse(x, y, r, r, c);
      }
    }
  }
  /** Add a 1 px outline outside the silhouette. `diag` also fills diagonal neighbours. */
  outline(c: RGBA, diag = false) {
    const src = new Uint8ClampedArray(this.d);
    const a = (x: number, y: number) => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[(y * this.w + x) * 4 + 3] : 0);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (a(x, y) > 0) continue;
      let n = a(x - 1, y) > 100 || a(x + 1, y) > 100 || a(x, y - 1) > 100 || a(x, y + 1) > 100;
      if (!n && diag) n = a(x - 1, y - 1) > 100 || a(x + 1, y - 1) > 100 || a(x - 1, y + 1) > 100 || a(x + 1, y + 1) > 100;
      if (n) this.set(x, y, c);
    }
  }
  /** Light the edges of the silhouette that face direction (dx, dy) (e.g. -1,-1 for a top-left moon). */
  rim(dx: number, dy: number, c: RGBA, onlyIfDarkerThan = 999) {
    const src = new Uint8ClampedArray(this.d);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = (y * this.w + x) * 4;
      if (src[i + 3] < 200) continue;
      const nx = x + dx, ny = y + dy;
      const na = nx >= 0 && ny >= 0 && nx < this.w && ny < this.h ? src[(ny * this.w + nx) * 4 + 3] : 0;
      if (na > 0) continue;
      if (src[i] + src[i + 1] + src[i + 2] > onlyIfDarkerThan) continue;
      this.set(x, y, c);
    }
  }
  /** Snap partial alpha to 0 or 255 so edges stay crisp. */
  crisp(th = 110) {
    for (let i = 3; i < this.d.length; i += 4) this.d[i] = this.d[i] >= th ? 255 : 0;
  }
  /** Paste another Pix at (ox, oy), optionally mirrored. */
  blit(src: Pix, ox: number, oy: number, flip = false) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      if (src.d[i + 3] === 0) continue;
      this.set(ox + (flip ? src.w - 1 - x : x), oy + y, [src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]]);
    }
  }
  /** Draw into a canvas region scaled by `s` (nearest neighbour). */
  drawTo(ctx: CanvasRenderingContext2D, ox: number, oy: number, s = ART_SCALE) {
    const img = ctx.createImageData(this.w * s, this.h * s);
    const o = img.data;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = (y * this.w + x) * 4;
      if (this.d[i + 3] === 0) continue;
      for (let j = 0; j < s; j++) {
        let k = (((y * s + j) * this.w * s) + x * s) * 4;
        for (let q = 0; q < s; q++, k += 4) { o[k] = this.d[i]; o[k + 1] = this.d[i + 1]; o[k + 2] = this.d[i + 2]; o[k + 3] = this.d[i + 3]; }
      }
    }
    ctx.putImageData(img, ox, oy);
  }
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Smooth 2D value noise in 0..1 (seeded, tileable-free). */
export function valueNoise(seed: number) {
  const hsh = (x: number, y: number) => {
    let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = sm(x - xi), yf = sm(y - yi);
    const a = hsh(xi, yi), b = hsh(xi + 1, yi), c = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}
export function fbm(n: (x: number, y: number) => number, x: number, y: number, oct = 3) {
  let s = 0, a = 0.5, f = 1, t = 0;
  for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * a; t += a; a *= 0.5; f *= 2; }
  return s / t;
}
/** 4x4 Bayer threshold in 0..1 for ordered dithering. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
