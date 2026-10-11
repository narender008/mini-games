// The ground, pre-painted into square chunks (the world's ground painter
// runs once per chunk that the surface passes through), so a frame draws a
// handful of images. Blood splats and scorch marks are stamped into the
// chunks with source-atop, so they stick to the ground and never to the sky
// above it, and stay there for the rest of the set. Everything far below the
// surface is the world's plain deep colour.
import { makeCanvas } from './sprites.js';
import { rng } from '../config.js';

const C = 12; // chunk size in metres

export class Ground {
  constructor(terrain, world, ppm) {
    this.T = terrain;
    this.world = world;
    this.ppm = Math.round(ppm);
    this.chunks = []; // { x0, yb, canvas, ctx }
    this.cols = []; // per column: the height below which it is all deep colour
    this.x0 = Math.floor(terrain.x0 / C) * C;
    this.build();
  }

  build() {
    const T = this.T;
    const pts = T.points;
    // the solid in metres with y down, closed far below the lowest point
    const solid = new Path2D();
    const deepY = -(T.lo - 400);
    solid.moveTo(pts[0][0] - 40, deepY);
    solid.lineTo(pts[0][0] - 40, -pts[0][1]);
    for (const [x, y] of pts) solid.lineTo(x, -y);
    solid.lineTo(pts[pts.length - 1][0] + 40, -pts[pts.length - 1][1]);
    solid.lineTo(pts[pts.length - 1][0] + 40, deepY);
    solid.closePath();
    const surface = [[pts[0][0] - 40, -pts[0][1]], ...pts.map(([x, y]) => [x, -y]), [pts[pts.length - 1][0] + 40, -pts[pts.length - 1][1]]];
    this.chunks.length = 0;
    this.cols.length = 0;
    const x1 = T.x1 + 40;
    for (let cx = this.x0 - 48; cx < x1; cx += C) {
      // the surface's range of heights over this column
      let lo = Infinity;
      let hi = -Infinity;
      for (let x = cx; x <= cx + C; x += 0.25) {
        const h = T.at(x);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      for (const [px, py] of pts) {
        if (px >= cx && px <= cx + C) {
          lo = Math.min(lo, py);
          hi = Math.max(hi, py);
        }
      }
      const r0 = Math.floor((lo - 7) / C);
      const r1 = Math.floor((hi + 1.5) / C);
      this.cols.push({ x0: cx, deep: r0 * C });
      for (let r = r0; r <= r1; r++) {
        const yb = r * C;
        const canvas = makeCanvas(C * this.ppm, C * this.ppm);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(this.ppm, 0, 0, this.ppm, -cx * this.ppm, (yb + C) * this.ppm);
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx, -(yb + C), C, C);
        ctx.clip();
        try {
          this.world.ground.paint(ctx, solid, surface, { x0: cx, y0: -(yb + C), x1: cx + C, y1: -yb }, rng(((cx * 73856093) ^ (r * 19349663)) >>> 0));
        } catch (e) {
          console.warn('ground paint failed', e);
          ctx.fillStyle = this.world.ground.deep;
          ctx.fill(solid);
        }
        ctx.restore();
        this.chunks.push({ x0: cx, yb, canvas, ctx });
      }
    }
  }

  // Draws the chunks in view (the context is in world metres, y down).
  draw(ctx, vx0, vx1, vy0, vy1) {
    const deep = this.world.ground.deep;
    ctx.fillStyle = deep;
    for (const c of this.cols) {
      if (c.x0 + C < vx0 || c.x0 > vx1) continue;
      if (c.deep > vy0) {
        // y down: from the deep line to the bottom of the view
        ctx.fillRect(c.x0 - 0.02, -c.deep - 0.02, C + 0.04, Math.max(0, -vy0 + c.deep) + 0.04);
      }
    }
    for (const c of this.chunks) {
      if (c.x0 + C < vx0 || c.x0 > vx1 || c.yb + C < vy0 || c.yb > vy1) continue;
      ctx.drawImage(c.canvas, c.x0 - 0.01, -(c.yb + C) - 0.01, C + 0.02, C + 0.02);
    }
  }

  // A stamp (sprite s, centred at world x, y, `size` metres across, turned a) into every chunk it touches.
  stamp(s, x, y, size, a, alpha = 1, mode = 'source-atop') {
    const r = size * 0.75;
    for (const c of this.chunks) {
      if (x + r < c.x0 || x - r > c.x0 + C || y + r < c.yb || y - r > c.yb + C) continue;
      const ctx = c.ctx;
      ctx.save();
      ctx.globalCompositeOperation = mode;
      ctx.globalAlpha = alpha;
      ctx.translate(x, -y);
      ctx.rotate(a);
      const k = size / Math.max(s.w, s.h);
      ctx.drawImage(s.canvas, s.x0 * k, s.y0 * k, s.w * k, s.h * k);
      ctx.restore();
    }
  }
}
