// Lanes: the paths a marble's centre follows through a piece of track.
//
// A lane is a smooth 3D curve resampled every couple of millimetres by arc
// length, with a frame at every sample: T along the lane, U the "up" of the
// channel's floor (world up for an ordinary trough, the loop's centre inside
// a loop, tilted inwards on a banked bend) and S = T x U to the side, plus
// the curvature vector dT/ds that the marble feels as centrifugal force.
// The channel is round in cross-section: its axis runs (rc - r) above the
// lane along U, so a marble resting at the bottom sits exactly on the lane
// and a marble going fast round a bend rides up the outside wall.
//
// Curves are described as a list of parametric segments (lines, arcs,
// Hermite blends, helices, loops) in the piece's own frame; the builder
// chains them, resamples by arc length and fills in the frames.
import * as THREE from 'three';
import { R_MARBLE } from '../config.js';

export const DS = 0.002; // sample spacing along a lane, metres
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Channel profiles. rc: inner radius of the round bottom; hw: how far the
// straight side walls rise above the channel's axis (an open trough is a U:
// a round bottom with upright sides); a tube is round all the way.
export const CHANNELS = {
  trough: { rc: 0.0155, hw: 0.003, tube: false },
  deep: { rc: 0.0155, hw: 0.01, tube: false },
  tube: { rc: 0.0128, hw: 0, tube: true },
  // an open channel with a clear guard over it (loops): behaves as a tube
  guard: { rc: 0.0155, hw: 0.004, tube: true },
};

export class Lane {
  // pts: Vector3[] evenly spaced by DS; ups: Vector3[] (optional hints)
  constructor(pts, ups, opts = {}) {
    const n = pts.length;
    this.n = n;
    this.length = (n - 1) * DS;
    this.channel = CHANNELS[opts.channel || 'trough'];
    this.rc = opts.rc ?? this.channel.rc;
    this.hw = opts.hw ?? this.channel.hw;
    this.tube = opts.tube ?? this.channel.tube;
    this.surface = opts.surface || 'wood';
    this.rr = opts.rr ?? 0.012; // rolling resistance coefficient
    this.e = opts.e ?? 0.32; // restitution against the walls
    this.piece = opts.piece || null;
    this.name = opts.name || '';
    this.events = opts.events || []; // [{ s, type, ... }] sorted by s
    this.kinematic = opts.kinematic || null; // lifts: { speed }
    this.intoBowl = opts.intoBowl || null; // the lane ends at a funnel's rim
    // what lies beyond each end: { type: 'wall' } | { type: 'open' } |
    // { type: 'link', lane, atEnd } | { type: 'switch', ... }
    this.start = { type: 'wall' };
    this.end = { type: 'open' };
    this.pos = new Float32Array(n * 3);
    this.tan = new Float32Array(n * 3);
    this.up = new Float32Array(n * 3);
    this.side = new Float32Array(n * 3);
    this.curv = new Float32Array(n * 3);
    const t = new THREE.Vector3();
    const u = new THREE.Vector3();
    const w = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      pts[i].toArray(this.pos, i * 3);
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      t.subVectors(b, a).normalize();
      t.toArray(this.tan, i * 3);
    }
    // ups: given per sample, carried along the curve without twisting
    // (a rotation-minimising frame: drops and elbows, where "up" must turn
    // with the track), or world up by default
    const prev = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      t.fromArray(this.tan, i * 3);
      if (opts.rmf && i > 0) u.copy(prev);
      else if (opts.rmf && opts.up0) u.copy(opts.up0);
      else u.copy(ups ? ups[i] : WORLD_UP);
      u.addScaledVector(t, -u.dot(t));
      if (u.lengthSq() < 1e-8) u.set(1, 0, 0).addScaledVector(t, -t.x);
      u.normalize();
      prev.copy(u);
      w.crossVectors(t, u).normalize();
      u.crossVectors(w, t).normalize();
      u.toArray(this.up, i * 3);
      w.toArray(this.side, i * 3);
    }
    // curvature from tangents two samples apart, for a smooth reading
    const ta = new THREE.Vector3();
    const tb = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 2);
      const i1 = Math.min(n - 1, i + 2);
      if (i1 === i0) continue;
      ta.fromArray(this.tan, i0 * 3);
      tb.fromArray(this.tan, i1 * 3);
      tb.sub(ta).multiplyScalar(1 / ((i1 - i0) * DS));
      tb.toArray(this.curv, i * 3);
    }
    this.box = new THREE.Box3().setFromArray(this.pos);
    this.box.expandByScalar(this.rc + 0.012);
  }

  // Interpolated frame at arc length s (clamped to the lane).
  frame(s, f) {
    const x = Math.max(0, Math.min(this.length, s)) / DS;
    let i = Math.floor(x);
    if (i >= this.n - 1) i = this.n - 2;
    const k = x - i;
    const a = i * 3;
    const b = a + 3;
    lerp3(this.pos, a, b, k, f.p);
    lerp3(this.tan, a, b, k, f.t).normalize();
    lerp3(this.up, a, b, k, f.u);
    f.u.addScaledVector(f.t, -f.u.dot(f.t)).normalize();
    f.w.crossVectors(f.t, f.u);
    lerp3(this.curv, a, b, k, f.k);
    return f;
  }

  point(s, out) {
    const x = Math.max(0, Math.min(this.length, s)) / DS;
    let i = Math.floor(x);
    if (i >= this.n - 1) i = this.n - 2;
    return lerp3(this.pos, i * 3, i * 3 + 3, x - i, out);
  }

  // Where the marble centre is for a given cross-section offset q (from the
  // channel axis, along S and U).
  centre(s, qs, qu, out, f = this._f || (this._f = makeFrame())) {
    this.frame(s, f);
    const axis = this.rc - R_MARBLE;
    return out.copy(f.p).addScaledVector(f.u, axis + qu).addScaledVector(f.w, qs);
  }

  // Nearest sample to a world point (brute force over a window, or all).
  nearest(p, from = 0, to = this.n - 1) {
    let best = -1;
    let bd = Infinity;
    const P = this.pos;
    for (let i = from; i <= to; i++) {
      const dx = P[i * 3] - p.x;
      const dy = P[i * 3 + 1] - p.y;
      const dz = P[i * 3 + 2] - p.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return { i: best, d2: bd };
  }
}

export function makeFrame() {
  return { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), w: new THREE.Vector3(), k: new THREE.Vector3() };
}

function lerp3(arr, a, b, k, out) {
  out.x = arr[a] + (arr[b] - arr[a]) * k;
  out.y = arr[a + 1] + (arr[b + 1] - arr[a + 1]) * k;
  out.z = arr[a + 2] + (arr[b + 2] - arr[a + 2]) * k;
  return out;
}

// ------------------------------------------------------------ building curves

// A chain of parametric segments. Each segment is { f(u) -> Vector3,
// up?(u, p) -> Vector3 } over u in [0, 1]; segments are sampled densely,
// joined end to end and resampled evenly by arc length.
export class CurveBuilder {
  constructor() {
    this.segs = [];
  }

  add(f, up = null, steps = 64) {
    this.segs.push({ f, up, steps });
    return this;
  }

  // Dense points with their ups, then an even resample every DS.
  build() {
    const raw = [];
    const rawUp = [];
    for (const seg of this.segs) {
      for (let i = raw.length ? 1 : 0; i <= seg.steps; i++) {
        const u = i / seg.steps;
        const p = seg.f(u);
        raw.push(p);
        rawUp.push(seg.up ? seg.up(u, p) : null);
      }
    }
    // drop duplicates where segments meet
    const P = [raw[0]];
    const Uh = [rawUp[0]];
    for (let i = 1; i < raw.length; i++) {
      if (raw[i].distanceToSquared(P[P.length - 1]) > 1e-12) {
        P.push(raw[i]);
        Uh.push(rawUp[i]);
      }
    }
    const cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
    const L = cum[cum.length - 1];
    const n = Math.max(2, Math.round(L / DS) + 1);
    const pts = [];
    const ups = [];
    let j = 0;
    const hasUp = Uh.some(Boolean);
    for (let i = 0; i < n; i++) {
      const s = (i / (n - 1)) * L;
      while (j < P.length - 2 && cum[j + 1] < s) j++;
      const seg = cum[j + 1] - cum[j] || 1;
      const k = Math.min(1, Math.max(0, (s - cum[j]) / seg));
      pts.push(new THREE.Vector3().lerpVectors(P[j], P[j + 1], k));
      if (hasUp) {
        const a = Uh[j] || WORLD_UP;
        const b = Uh[j + 1] || WORLD_UP;
        ups.push(new THREE.Vector3().lerpVectors(a, b, k).normalize());
      }
    }
    return { pts, ups: hasUp ? ups : null, length: (n - 1) * DS };
  }
}
