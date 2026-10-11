// The ground of a track: a polyline from left to right (x always rising, a
// cliff is a nearly vertical step) built as one static Planck chain, plus a
// height table sampled every 0.1 m so particles and the camera can ask "how
// high is the ground here?" without a physics query.
import { pl, CAT } from './physics.js';

const RES = 10; // samples per metre

export class Terrain {
  constructor(points, mat) {
    this.points = points;
    this.mat = mat;
    this.x0 = points[0][0];
    this.x1 = points[points.length - 1][0];
    const n = Math.ceil((this.x1 - this.x0) * RES) + 1;
    this.h = new Float32Array(n);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const x = this.x0 + i / RES;
      while (k < points.length - 2 && points[k + 1][0] < x) k++;
      const [ax, ay] = points[k];
      const [bx, by] = points[k + 1];
      const t = bx > ax ? Math.min(1, Math.max(0, (x - ax) / (bx - ax))) : 1;
      // across a cliff step keep the higher side, so nothing sinks into the face
      this.h[i] = bx - ax < 0.05 ? Math.max(ay, by) : ay + (by - ay) * t;
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points) {
      lo = Math.min(lo, p[1]);
      hi = Math.max(hi, p[1]);
    }
    this.lo = lo;
    this.hi = hi;
  }

  build(phys) {
    const body = phys.body({ type: 'static' });
    this.owner = { kind: 'ground', mat: this.mat, pre: false, touch: -1 };
    const verts = this.points.map((p) => pl.Vec2(p[0], p[1]));
    body.createFixture(pl.Chain(verts, false), { friction: 0.75, restitution: 0.05, filterCategoryBits: CAT.WORLD, filterMaskBits: 0xffff, userData: this.owner });
    this.body = body;
  }

  at(x) {
    const f = (x - this.x0) * RES;
    if (f <= 0) return this.h[0];
    const n = this.h.length - 1;
    if (f >= n) return this.h[n];
    const i = f | 0;
    const t = f - i;
    return this.h[i] + (this.h[i + 1] - this.h[i]) * t;
  }

  // the ground's slope angle at x (radians, positive rising to the right)
  slope(x) {
    return Math.atan2(this.at(x + 0.25) - this.at(x - 0.25), 0.5);
  }
}
