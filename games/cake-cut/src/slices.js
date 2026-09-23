// Easy slices: one tap or swipe makes one slice. The game completes a
// standard wedge (an eighth of the cake) centred on where the cut was, fitted
// into the cake that is left so no thin slivers are ever made. Angles are in
// cake space: atan2(z, x) about the centre of the cake.
const TAU = Math.PI * 2;
export const WEDGES = 8;
const W = TAU / WEDGES;

const wrap = (a) => ((a % TAU) + TAU) % TAU;

export class EasySlices {
  constructor() {
    this.taken = []; // [{ a0, len }] arcs already sliced
  }

  reset() {
    this.taken = [];
  }

  // The uncut arcs, as [{ a0, len }].
  free() {
    if (!this.taken.length) return [{ a0: 0, len: TAU, whole: true }];
    const arcs = this.taken.map((t) => ({ a0: wrap(t.a0), len: t.len })).sort((x, y) => x.a0 - y.a0);
    const out = [];
    for (let i = 0; i < arcs.length; i++) {
      const end = arcs[i].a0 + arcs[i].len;
      const next = i + 1 < arcs.length ? arcs[i + 1].a0 : arcs[0].a0 + TAU;
      const gap = next - end;
      if (gap > 0.02) out.push({ a0: wrap(end), len: gap });
    }
    return out;
  }

  // The wedge for a cut at angle `at`: { a0, len, mid, cuts: [angles to cut] },
  // or null when the whole cake is already sliced.
  pick(at) {
    at = wrap(at);
    const free = this.free();
    if (!free.length) return null;
    let arc = free.find((f) => f.whole || wrap(at - f.a0) < f.len);
    if (!arc) {
      // a cut where the cake is already sliced: use the nearest uncut part,
      // from its nearer end
      let best = Infinity;
      for (const f of free) {
        const dStart = angleDist(at, f.a0);
        const dEnd = angleDist(at, f.a0 + f.len);
        if (Math.min(dStart, dEnd) < best) {
          best = Math.min(dStart, dEnd);
          arc = f;
          at = wrap(dStart <= dEnd ? f.a0 + W / 2 : f.a0 + f.len - W / 2);
        }
      }
    }
    let a0;
    let len;
    if (arc.whole) {
      a0 = at - W / 2;
      len = W;
    } else if (arc.len <= W * 1.5) {
      // what is left here is about a slice: take it all
      a0 = arc.a0;
      len = arc.len;
    } else {
      const off = Math.min(Math.max(wrap(at - arc.a0) - W / 2, 0), arc.len - W);
      // never leave less than half a slice beside the new one
      let o = off;
      if (o < W * 0.5) o = 0;
      if (arc.len - (o + W) < W * 0.5) o = arc.len - W;
      a0 = arc.a0 + o;
      len = W;
    }
    a0 = wrap(a0);
    const cuts = [];
    if (arc.whole) cuts.push(a0, wrap(a0 + len));
    else {
      if (angleDist(a0, arc.a0) > 1e-6) cuts.push(a0);
      const end = wrap(a0 + len);
      const arcEnd = wrap(arc.a0 + arc.len);
      if (angleDist(end, arcEnd) > 1e-6) cuts.push(end);
    }
    return { a0, len, mid: wrap(a0 + len / 2), cuts };
  }

  take(wedge) {
    this.taken.push({ a0: wedge.a0, len: wedge.len });
  }

  get done() {
    return this.free().length === 0;
  }
}

function angleDist(a, b) {
  const d = wrap(a - b);
  return Math.min(d, TAU - d);
}
