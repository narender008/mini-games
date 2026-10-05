// The ground as a mask: one byte per texel (0 air .. 255 solid, with soft
// edges), four texels per metre. Every blast carves it; tanks, shells and
// debris ask it where the ground is. Row 0 is the bottom of the world.
import { WORLD, clamp } from '../config.js';

export const BEDROCK = 3; // metres of ground at the bottom nothing can dig through

export class Terrain {
  constructor() {
    this.res = WORLD.res;
    this.cols = WORLD.width * this.res;
    this.rows = WORLD.height * this.res;
    this.mask = new Uint8Array(this.cols * this.rows);
    this.orig = new Uint8Array(this.cols * this.rows);
    this.dirty = null;
    this.version = 0;
  }

  // Fills the mask from a height function (metres) and optional extra shapes.
  fromHeights(heightAt) {
    const { cols, rows, res, mask } = this;
    for (let i = 0; i < cols; i++) {
      const h = heightAt((i + 0.5) / res);
      for (let j = 0; j < rows; j++) {
        const y = (j + 0.5) / res;
        const v = clamp((h - y) * res + 0.5, 0, 1);
        mask[j * cols + i] = v * 255;
      }
    }
  }

  commit() {
    this.orig.set(this.mask);
    this.dirty = { x0: 0, y0: 0, x1: this.cols, y1: this.rows };
    this.version++;
  }

  // Is there ground at this point?
  solid(x, y) {
    if (y < 0) return true;
    const i = Math.floor(x * this.res);
    const j = Math.floor(y * this.res);
    if (j >= this.rows) return false;
    const ii = i < 0 ? 0 : i >= this.cols ? this.cols - 1 : i;
    return this.mask[j * this.cols + ii] > 127;
  }

  // The top of the ground below (x, fromY): the first solid texel going down.
  groundBelow(x, fromY) {
    const { res, cols, rows, mask } = this;
    let i = Math.floor(x * res);
    i = i < 0 ? 0 : i >= cols ? cols - 1 : i;
    let j = Math.min(rows - 1, Math.floor(fromY * res));
    if (j < 0) return 0;
    for (; j >= 0; j--) {
      const v = mask[j * cols + i];
      if (v > 127) {
        // sub-texel: the soft edge says where the surface sits
        const above = j + 1 < rows ? mask[(j + 1) * cols + i] : 0;
        return (j + v / 255 + above / 255) / res;
      }
    }
    return 0;
  }

  // Highest ground in a column (for spawning and the computer's look at the map).
  top(x) {
    return this.groundBelow(x, WORLD.height);
  }

  // Removes a disc of ground. Returns how much ground (in square metres) went.
  carve(x, y, r) {
    const { res, cols, rows, mask } = this;
    const i0 = Math.max(0, Math.floor((x - r - 1) * res));
    const i1 = Math.min(cols - 1, Math.ceil((x + r + 1) * res));
    const j0 = Math.max(Math.ceil(BEDROCK * res), Math.floor((y - r - 1) * res));
    const j1 = Math.min(rows - 1, Math.ceil((y + r + 1) * res));
    if (i1 < i0 || j1 < j0) return 0;
    let removed = 0;
    const rr = r * res;
    const cx = x * res;
    const cy = y * res;
    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - cy;
      const row = j * cols;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - cx;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > rr + 1) continue;
        const v = clamp(d - rr + 0.5, 0, 1) * 255;
        const k = row + i;
        if (v < mask[k]) {
          removed += mask[k] - v;
          mask[k] = v;
        }
      }
    }
    this.mark(i0, j0, i1 + 1, j1 + 1);
    this.version++;
    return removed / 255 / (res * res);
  }

  // Adds ground (dirt thrown up, napalm-melted slag). Not used by every blast.
  fill(x, y, r) {
    const { res, cols, rows, mask } = this;
    const i0 = Math.max(0, Math.floor((x - r - 1) * res));
    const i1 = Math.min(cols - 1, Math.ceil((x + r + 1) * res));
    const j0 = Math.max(0, Math.floor((y - r - 1) * res));
    const j1 = Math.min(rows - 1, Math.ceil((y + r + 1) * res));
    const rr = r * res;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i + 0.5 - x * res, j + 0.5 - y * res);
        const v = clamp(rr - d + 0.5, 0, 1) * 255;
        const k = j * cols + i;
        if (v > mask[k]) mask[k] = v;
      }
    }
    this.mark(i0, j0, i1 + 1, j1 + 1);
    this.version++;
  }

  mark(x0, y0, x1, y1) {
    const d = this.dirty;
    if (!d) this.dirty = { x0, y0, x1, y1 };
    else {
      d.x0 = Math.min(d.x0, x0);
      d.y0 = Math.min(d.y0, y0);
      d.x1 = Math.max(d.x1, x1);
      d.y1 = Math.max(d.y1, y1);
    }
  }

  // Walks a segment and returns the fraction along it where it first meets
  // ground, or -1.
  hitSegment(x0, y0, x1, y1) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / 0.2));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (this.solid(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return t;
    }
    return -1;
  }

  // Outward surface normal near a point, from the mask's slope.
  normal(x, y, out) {
    const e = 0.75;
    const s = (a, b) => (this.solid(a, b) ? 1 : 0);
    let nx = 0;
    let ny = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const v = s(x + dx * e, y + dy * e) + s(x + dx * e * 2, y + dy * e * 2);
      nx -= dx * v;
      ny -= dy * v;
    }
    const l = Math.hypot(nx, ny);
    if (l < 1e-3) {
      out.x = 0;
      out.y = 1;
    } else {
      out.x = nx / l;
      out.y = ny / l;
    }
    return out;
  }
}
