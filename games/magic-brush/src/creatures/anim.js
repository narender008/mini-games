// Small animation helpers: springs for follow-through, a blink scheduler,
// gait phases and easing for tricks. Bones in a friend's skeleton have no
// rest rotation, so a bone's rotation is always its pose relative to rest.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
// a bump that rises and falls over [a, b] of t
export const bump = (t, a, b) => {
  if (t <= a || t >= b) return 0;
  return Math.sin(((t - a) / (b - a)) * Math.PI);
};
// 0 before a, 1 after b, smooth between
export const ramp = (t, a, b) => smooth((t - a) / (b - a));
export const easeOutBack = (t, s = 1.8) => {
  t = clamp(t, 0, 1) - 1;
  return t * t * ((s + 1) * t + s) + 1;
};
// damped wobble after an event at t=0: amplitude 1, settles over ~dur
export const wobble = (t, freq = 3, dur = 0.8) => (t < 0 ? 0 : Math.sin(t * freq * TAU) * Math.exp((-t * 4.6) / dur));

// A critically damped (or springy, with zeta < 1) spring for one number.
export class Spring {
  constructor(value = 0, freq = 3, zeta = 0.6) {
    this.x = value;
    this.v = 0;
    this.freq = freq;
    this.zeta = zeta;
  }

  update(target, dt) {
    const w = this.freq * TAU;
    // semi-implicit Euler in small steps keeps it stable at 30 fps
    const n = Math.ceil(dt / (1 / 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = w * w * (target - this.x) - 2 * this.zeta * w * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }

  kick(v) {
    this.v += v;
  }
}

export class Spring3 {
  constructor(freq = 3, zeta = 0.6) {
    this.s = [new Spring(0, freq, zeta), new Spring(0, freq, zeta), new Spring(0, freq, zeta)];
    this.value = new THREE.Vector3();
  }

  update(target, dt) {
    this.value.set(this.s[0].update(target.x, dt), this.s[1].update(target.y, dt), this.s[2].update(target.z, dt));
    return this.value;
  }

  set(v) {
    for (let i = 0; i < 3; i++) {
      this.s[i].x = v.getComponent(i);
      this.s[i].v = 0;
    }
    this.value.copy(v);
  }
}

// An input that others write in steps (a speed that drops to nothing when a
// trick starts, the come-alive's `air` that jumps from the crouch to the
// leap) but that a pose must never see stepping. It follows what was written
// through a rate limit (a smooth ramp passes untouched, a step becomes a short
// ramp) and then a critically damped filter that rounds the ramp's corners,
// so no pose built from it can pop. `rate` is in units/s, `freq` in Hz.
export class Eased {
  constructor(rate, freq = 5, min = -Infinity, max = Infinity) {
    this.raw = 0;
    this.limited = 0;
    this.value = 0;
    this.rate = rate;
    this.min = min; // (a spring never overshoots its range: air stays 0..1)
    this.max = max;
    this.spring = new Spring(0, freq, 1);
    this.primed = false;
  }

  step(dt) {
    if (!this.primed) {
      // the first frame starts where the input is, not from zero
      this.primed = true;
      this.limited = this.raw;
      this.spring.x = this.raw;
      this.value = this.raw;
      return this.value;
    }
    const lim = this.rate * dt;
    this.limited += clamp(this.raw - this.limited, -lim, lim);
    let x = this.spring.update(this.limited, dt);
    // arrive: a spring only creeps up on its target, and a tail of 1e-9 must not
    // read as "still in the air" or "still moving" to the code that tests > 0
    if (Math.abs(x - this.limited) < 1e-4 && Math.abs(this.spring.v) < 1e-3) {
      x = this.spring.x = this.limited;
      this.spring.v = 0;
    }
    if (x < this.min) x = this.spring.x = this.min;
    else if (x > this.max) x = this.spring.x = this.max;
    this.value = x;
    return x;
  }
}

// Pops caught after the pose is made. Whatever built a friend's pose (a
// trick starting, a state that flipped, a foot that changed its mind), a bone
// whose rotation or position jumps between two frames by far more than its own
// motion would explain is caught here and cross-faded instead ("inertial
// blending"): the pose carries on from where the bone was heading, and the
// difference to where the animation now says it should be dies away as a
// critically damped spring, so the joint arrives smoothly over about a
// quarter of a second. Smooth motion is never touched (no lag), only what
// the bone's own past says cannot be continuous.
//   bones: the skeleton's bones; skip: bones left alone (eyes and lids blink
//   fast on purpose); rotW, posW: how fast the difference dies away (rad/s);
//   rotMin (rad), posMin (m): the smallest jump that counts; ratio: how many
//   times the bone's usual frame-to-frame error a jump must be.
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _qd = new THREE.Quaternion();
const _qe = new THREE.Quaternion();
const _qf = new THREE.Quaternion();
const _qg = new THREE.Quaternion();
const _qh = new THREE.Quaternion();
const _qi = new THREE.Quaternion();

// a rotation vector (axis * angle) into a quaternion, and back
function fromVec(a, o, q) {
  const x = a[o], y = a[o + 1], z = a[o + 2];
  const ang = Math.hypot(x, y, z);
  if (ang < 1e-9) return q.set(0, 0, 0, 1);
  const s = Math.sin(ang * 0.5) / ang;
  return q.set(x * s, y * s, z * s, Math.cos(ang * 0.5));
}
function toVec(q, a, o) {
  const s = Math.hypot(q.x, q.y, q.z);
  const sign = q.w < 0 ? -1 : 1; // the short way round
  const ang = 2 * Math.atan2(s, Math.abs(q.w));
  const k = s > 1e-9 ? (sign * ang) / s : 2 * sign;
  a[o] = q.x * k;
  a[o + 1] = q.y * k;
  a[o + 2] = q.z * k;
}
const _sv = new Float64Array(3);
function scaleStep(q, r) {
  if (r === 1) return q;
  toVec(q, _sv, 0);
  _sv[0] *= r;
  _sv[1] *= r;
  _sv[2] *= r;
  return fromVec(_sv, 0, q);
}

export class Inertia {
  constructor(bones, { skip = /^(eye|lid|shut|joy)/, rotW = 11, posW = 12, rotMin = 0.04, posMin = 0.006, ratio = 5 } = {}) {
    this.list = bones.filter((b) => !skip.test(b.name));
    const n = this.list.length;
    this.aq = new Float64Array(n * 4); // last frame's animated rotation
    this.aq2 = new Float64Array(n * 4); // and the one before
    this.rr = new Float64Array(n * 3); // rotation offset (rotation vector) and its speed
    this.rv = new Float64Array(n * 3);
    this.ap = new Float64Array(n * 3);
    this.ap2 = new Float64Array(n * 3);
    this.pp = new Float64Array(n * 3);
    this.pv = new Float64Array(n * 3);
    this.aqr = new Float64Array(n * 4); // the frame before a jump, as it was (see apply)
    this.apr = new Float64Array(n * 3);
    this.popR = new Uint8Array(n); // 1: this bone jumped last frame
    this.popP = new Uint8Array(n);
    this.rAvg = new Float64Array(n); // each bone's usual error, so fast wiggles are not mistaken for jumps
    this.pAvg = new Float64Array(n);
    this.rotW = rotW;
    this.posW = posW;
    this.rotMin = rotMin;
    this.posMin = posMin;
    this.ratio = ratio;
    this.ready = false;
    this.dtPrev = 1 / 60;
    this.caught = 0; // how many jumps were caught (for tests)
  }

  // call after the frame's pose is complete
  apply(dt) {
    if (dt <= 0) return;
    const list = this.list;
    const { aq, aq2, aqr, apr, popR, popP, rr, rv, ap, ap2, pp, pv, rAvg, pAvg } = this;
    const seed = !this.ready || dt > 0.25; // first frame or a long gap: start over
    // a coarser frame rate makes fast motion less predictable: be looser
    const loose = clamp(dt * 60, 1, 4);
    const kAvg = Math.min(1, dt / 0.5);
    const r = seed ? 1 : clamp(dt / this.dtPrev, 0.25, 4);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const q = b.quaternion;
      const p = b.position;
      const o4 = i * 4;
      const o3 = i * 3;
      if (seed) {
        aq[o4] = aq2[o4] = q.x; aq[o4 + 1] = aq2[o4 + 1] = q.y; aq[o4 + 2] = aq2[o4 + 2] = q.z; aq[o4 + 3] = aq2[o4 + 3] = q.w;
        ap[o3] = ap2[o3] = p.x; ap[o3 + 1] = ap2[o3 + 1] = p.y; ap[o3 + 2] = ap2[o3 + 2] = p.z;
        for (let k = 0; k < 3; k++) rr[o3 + k] = rv[o3 + k] = pp[o3 + k] = pv[o3 + k] = 0;
        rAvg[i] = pAvg[i] = 0;
        popR[i] = popP[i] = 0;
        continue;
      }
      // ---- rotation: where the bone was heading, against where it is
      _qa.set(aq[o4], aq[o4 + 1], aq[o4 + 2], aq[o4 + 3]);
      _qb.set(aq2[o4], aq2[o4 + 1], aq2[o4 + 2], aq2[o4 + 3]);
      scaleStep(_qc.copy(_qb).invert().premultiply(_qa), r); // the last step
      _qg.copy(_qc);
      _qd.copy(_qa).premultiply(_qc); // carried on once more
      _qe.copy(_qd).invert().premultiply(q); // what the animation did instead
      let err = 2 * Math.atan2(Math.hypot(_qe.x, _qe.y, _qe.z), Math.abs(_qe.w));
      if (popR[i]) {
        // the frame after a jump has two readings: the jump was a step and the
        // old pace goes on (guess above), or the jump began a new pace (this one)
        popR[i] = 0;
        scaleStep(_qh.set(aqr[o4], aqr[o4 + 1], aqr[o4 + 2], aqr[o4 + 3]).invert().premultiply(_qa), r);
        _qi.copy(_qa).premultiply(_qh);
        _qe.copy(_qi).invert().premultiply(q);
        const errB = 2 * Math.atan2(Math.hypot(_qe.x, _qe.y, _qe.z), Math.abs(_qe.w));
        if (errB < err) {
          err = errB;
          _qd.copy(_qi);
          _qg.copy(_qh);
        }
      }
      const rCaught = err > Math.max(this.rotMin * loose, rAvg[i] * this.ratio);
      rAvg[i] += (err - rAvg[i]) * kAvg;
      if (rCaught) {
        // carry on from the old pose: the new offset is (old offset) * pred * animated^-1
        fromVec(rr, o3, _qf);
        _qc.copy(q).invert().premultiply(_qd).premultiply(_qf);
        toVec(_qc, rr, o3);
        this.caught++;
        // the jump is not a pace: the next guess carries on at the old one
        aqr[o4] = _qa.x; aqr[o4 + 1] = _qa.y; aqr[o4 + 2] = _qa.z; aqr[o4 + 3] = _qa.w;
        popR[i] = 1;
        _qb.copy(_qg).invert().multiply(q);
        aq[o4] = _qb.x; aq[o4 + 1] = _qb.y; aq[o4 + 2] = _qb.z; aq[o4 + 3] = _qb.w;
      }
      aq2[o4] = aq[o4]; aq2[o4 + 1] = aq[o4 + 1]; aq2[o4 + 2] = aq[o4 + 2]; aq2[o4 + 3] = aq[o4 + 3];
      aq[o4] = q.x; aq[o4 + 1] = q.y; aq[o4 + 2] = q.z; aq[o4 + 3] = q.w;
      // (the offset dies away as a critically damped spring)
      let live = false;
      {
        const w = this.rotW;
        const e = Math.exp(-w * dt);
        for (let k = 0; k < 3; k++) {
          const x = rr[o3 + k];
          const v = rv[o3 + k];
          const t = v + w * x;
          rr[o3 + k] = (x + t * dt) * e;
          rv[o3 + k] = (v - w * t * dt) * e;
        }
        live = Math.abs(rr[o3]) + Math.abs(rr[o3 + 1]) + Math.abs(rr[o3 + 2]) + 0.05 * (Math.abs(rv[o3]) + Math.abs(rv[o3 + 1]) + Math.abs(rv[o3 + 2])) > 1e-5;
        if (!live) rr[o3] = rr[o3 + 1] = rr[o3 + 2] = rv[o3] = rv[o3 + 1] = rv[o3 + 2] = 0;
      }
      if (live) q.premultiply(fromVec(rr, o3, _qf));
      // ---- position
      let vx = (ap[o3] - ap2[o3]) * r, vy = (ap[o3 + 1] - ap2[o3 + 1]) * r, vz = (ap[o3 + 2] - ap2[o3 + 2]) * r;
      let ex = p.x - (ap[o3] + vx), ey = p.y - (ap[o3 + 1] + vy), ez = p.z - (ap[o3 + 2] + vz);
      let perr = Math.hypot(ex, ey, ez);
      if (popP[i]) {
        popP[i] = 0;
        const bx = (ap[o3] - apr[o3]) * r, by = (ap[o3 + 1] - apr[o3 + 1]) * r, bz = (ap[o3 + 2] - apr[o3 + 2]) * r;
        const fx = p.x - (ap[o3] + bx), fy = p.y - (ap[o3 + 1] + by), fz = p.z - (ap[o3 + 2] + bz);
        const errB = Math.hypot(fx, fy, fz);
        if (errB < perr) {
          perr = errB; ex = fx; ey = fy; ez = fz; vx = bx; vy = by; vz = bz;
        }
      }
      const pCaught = perr > Math.max(this.posMin * loose, pAvg[i] * this.ratio);
      pAvg[i] += (perr - pAvg[i]) * kAvg;
      if (pCaught) {
        pp[o3] -= ex;
        pp[o3 + 1] -= ey;
        pp[o3 + 2] -= ez;
        this.caught++;
        // (as for rotation: after a jump the old pace goes on)
        apr[o3] = ap[o3]; apr[o3 + 1] = ap[o3 + 1]; apr[o3 + 2] = ap[o3 + 2];
        popP[i] = 1;
        ap[o3] = p.x - vx;
        ap[o3 + 1] = p.y - vy;
        ap[o3 + 2] = p.z - vz;
      }
      ap2[o3] = ap[o3]; ap2[o3 + 1] = ap[o3 + 1]; ap2[o3 + 2] = ap[o3 + 2];
      ap[o3] = p.x; ap[o3 + 1] = p.y; ap[o3 + 2] = p.z;
      {
        const w = this.posW;
        const e = Math.exp(-w * dt);
        for (let k = 0; k < 3; k++) {
          const x = pp[o3 + k];
          const v = pv[o3 + k];
          const t = v + w * x;
          pp[o3 + k] = (x + t * dt) * e;
          pv[o3 + k] = (v - w * t * dt) * e;
        }
        if (Math.abs(pp[o3]) + Math.abs(pp[o3 + 1]) + Math.abs(pp[o3 + 2]) + 0.05 * (Math.abs(pv[o3]) + Math.abs(pv[o3 + 1]) + Math.abs(pv[o3 + 2])) > 1e-6) p.set(p.x + pp[o3], p.y + pp[o3 + 1], p.z + pp[o3 + 2]);
        else pp[o3] = pp[o3 + 1] = pp[o3 + 2] = pv[o3] = pv[o3 + 1] = pv[o3 + 2] = 0;
      }
    }
    this.ready = true;
    this.dtPrev = dt;
  }
}

// Blinks every few seconds (sometimes twice), each blink quick to close and
// a little slower to open, like a real one.
export class Blinker {
  constructor() {
    this.timer = 1 + Math.random() * 3;
    this.t = -1;
    this.double = false;
    this.hold = 0; // >0 keeps the eyes closed (sleepy, happy squint)
  }

  update(dt) {
    this.timer -= dt;
    if (this.t < 0 && this.timer <= 0) {
      this.t = 0;
      this.double = Math.random() < 0.2;
    }
    let c = 0;
    if (this.t >= 0) {
      this.t += dt;
      const d = 0.16;
      c = this.t < d * 0.4 ? this.t / (d * 0.4) : 1 - (this.t - d * 0.4) / (d * 0.6);
      if (this.t >= d) {
        if (this.double) {
          this.double = false;
          this.t = 0;
        } else {
          this.t = -1;
          this.timer = 2 + Math.random() * 4;
        }
      }
    }
    return Math.max(clamp(c, 0, 1), this.hold);
  }
}

// set a bone's pose from Euler angles (radians)
export function pose(bone, x = 0, y = 0, z = 0) {
  if (bone) bone.rotation.set(x, y, z);
}

// add to a bone's pose
export function addPose(bone, x = 0, y = 0, z = 0) {
  if (!bone) return;
  bone.rotation.x += x;
  bone.rotation.y += y;
  bone.rotation.z += z;
}

// Rotate a bone about an axis given in the friend's rest space (for lids and
// eyes set at an angle), after its Euler pose.
const _q = new THREE.Quaternion();
export function axisPose(bone, axis, angle) {
  if (!bone) return;
  _q.setFromAxisAngle(axis, angle);
  bone.quaternion.premultiply(_q);
}

// Two-bone planar IK in a bone chain's own side plane (y-z), for legs: given
// the hip-to-foot distance wanted, returns the hip and knee bend angles
// (in `out`, a two-element array, when given, to avoid an allocation).
// A straight leg is a singular pose: near full stretch a hair's change of
// distance swings the knee by many degrees, so a foot target that wobbles
// twitches the leg. `soft` (a fraction of the leg's length, 0 = off) rounds
// the stretch off: past (1 - soft) of the reach the distance is compressed
// smoothly towards the full length, so the knee always keeps a little bend
// and its angle changes smoothly with the target.
export function twoBone(l1, l2, dist, out = [0, 0], soft = 0) {
  const full = l1 + l2;
  let d = dist;
  if (soft > 0) {
    const d0 = full * (1 - soft);
    if (d > d0) d = d0 + (full - d0) * (1 - Math.exp(-(d - d0) / (full - d0)));
  }
  d = clamp(d, Math.abs(l1 - l2) + 1e-4, full - 1e-4);
  const a1 = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const a2 = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  out[0] = a1;
  out[1] = Math.PI - a2;
  return out;
}

// A leg's knee (or elbow) as it is asked to bend by two-bone IK jumps about
// when the foot lifts or lands near a straight leg (a small change of reach is
// a big change of bend). Bend eases that: the knee follows the asked bend with
// a critically damped spring, and the hip is worked out again for the knee it
// really has, so the foot still goes the right way (a hair short of the
// target's reach for a few frames, never a snap). out = [hip, bend] as
// twoBone gives them; it is corrected in place.
export class Bend {
  constructor(freq = 8) {
    this.spring = new Spring(0, freq, 1);
    this.primed = false;
  }

  apply(l1, l2, out, dt) {
    if (!this.primed || dt <= 0 || dt > 0.25) {
      this.primed = true;
      this.spring.x = out[1];
      this.spring.v = 0;
      return out;
    }
    const b = clamp(this.spring.update(out[1], dt), 0, Math.PI - 0.05);
    const d = Math.sqrt(Math.max(1e-8, l1 * l1 + l2 * l2 + 2 * l1 * l2 * Math.cos(b)));
    out[0] = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    out[1] = b;
    return out;
  }
}
