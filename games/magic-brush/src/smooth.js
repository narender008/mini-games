// Smoothing helpers shared by the camera, the garden director, the friends'
// steering and the come-alive shot. Everything here is time based (dt in
// seconds), keeps its own velocity so a change of goal never jumps the value or
// its speed, and does not depend on the frame rate.
import { angleDiff } from './config.js';

// 0..1 with zero speed AND zero acceleration at both ends (a quintic): a move
// that starts and stops with no jerk. dsmoother is its slope.
export const smoother = (x) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export const dsmoother = (x) => (x <= 0 || x >= 1 ? 0 : 30 * x * x * (1 - x) * (1 - x));

// critically damped follow of a number (Unity's SmoothDamp): frame-rate
// independent, no overshoot. state.v is its speed; returns the new value.
export function smoothDamp(cur, target, state, smoothTime, dt) {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * e;
  return target + (change + temp) * e;
}

// the same for a vector; vel is a Vector3 that holds its speed
const AXES = ['x', 'y', 'z'];
export function smoothDampV(cur, target, vel, smoothTime, dt) {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  for (const a of AXES) {
    const change = cur[a] - target[a];
    const temp = (vel[a] + omega * change) * dt;
    vel[a] = (vel[a] - omega * temp) * e;
    cur[a] = target[a] + (change + temp) * e;
  }
}

// an angle that follows another the short way round
export function smoothDampAngle(cur, target, state, smoothTime, dt) {
  return smoothDamp(cur, cur + angleDiff(cur, target), state, smoothTime, dt);
}

// Steering a heading like a body turns: `o` holds { heading, turnVel, turnAcc }.
// It aims for an angular speed proportional to the angle left (capped at
// `rate`), reaches it through a limited acceleration that itself comes on
// gradually, so a turn eases in, never starts or stops with a jerk, and
// settles onto the target without overshoot.
export function steer(o, desired, dt, rate) {
  const aMax = rate * 4.2;
  const jMax = aMax * 12;
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const err = angleDiff(o.heading, desired);
    // (the speed to aim for is also capped by what it can still brake from)
    const wT = Math.sign(err) * Math.min(rate, Math.abs(err) * 6, Math.sqrt(aMax * 0.5 * Math.abs(err)));
    const aT = Math.max(-aMax, Math.min(aMax, (wT - o.turnVel) * 24));
    o.turnAcc += Math.max(-jMax * h, Math.min(jMax * h, aT - o.turnAcc));
    o.turnVel += o.turnAcc * h;
    o.heading += o.turnVel * h;
  }
}

// The same idea for a speed along a line: aim for `want`, accelerate at most
// `accel` (or brake at most `decel`) with the acceleration coming on gradually.
// `o` holds { speed, acc }.
export function accelerate(o, want, dt, accel, decel) {
  const jMax = Math.max(accel, decel) * 2.8;
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    // (and never faster than it can still ease its acceleration out before it gets there)
    const lim = Math.sqrt(1.3 * jMax * Math.abs(want - o.speed));
    const aT = Math.max(-Math.min(decel, lim), Math.min(accel, lim, (want - o.speed) * 8));
    o.acc += Math.max(-jMax * h, Math.min(jMax * h, aT - o.acc));
    o.speed += o.acc * h;
    if (o.speed < 0) {
      o.speed = 0;
      o.acc = Math.max(0, o.acc);
    }
  }
}
