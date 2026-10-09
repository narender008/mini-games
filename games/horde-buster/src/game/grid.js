// A uniform spatial grid over the road, rebuilt every step with a counting
// sort (no allocation): `start[c]..start[c + 1]` indexes `items` for cell c.
// Used for bullet hits, explosions, separation between enemies and lightning.
export class Grid {
  constructor(x0, y0, x1, y1, cell, cap) {
    this.x0 = x0;
    this.y0 = y0;
    this.cell = cell;
    this.cols = Math.ceil((x1 - x0) / cell);
    this.rows = Math.ceil((y1 - y0) / cell);
    const n = this.cols * this.rows;
    this.start = new Int32Array(n + 1);
    this.fill = new Int32Array(n);
    this.items = new Int32Array(cap);
    this.cellOf = new Int32Array(cap);
  }

  cx(x) {
    const c = Math.floor((x - this.x0) / this.cell);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }
  cy(y) {
    const c = Math.floor((y - this.y0) / this.cell);
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  // ids = active slots (count n), xs / ys = their positions
  build(ids, n, xs, ys) {
    const { start, fill, cellOf, items } = this;
    start.fill(0);
    for (let k = 0; k < n; k++) {
      const i = ids[k];
      const c = this.cy(ys[i]) * this.cols + this.cx(xs[i]);
      cellOf[k] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < this.cols * this.rows; c++) start[c + 1] += start[c];
    fill.set(start.subarray(0, fill.length));
    for (let k = 0; k < n; k++) items[fill[cellOf[k]]++] = ids[k];
  }
}
