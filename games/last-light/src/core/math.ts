// Small math helpers shared by the simulation and the view. Pure, no Phaser.
export const TAU = Math.PI * 2;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a), 0, 1);
export const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt(dist2(ax, ay, bx, by));
export const angleTo = (ax: number, ay: number, bx: number, by: number) => Math.atan2(by - ay, bx - ax);
/** Smallest signed difference b - a between two angles, in -PI..PI. */
export const angleDiff = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);
/** Frame-rate independent exponential smoothing factor for a rate in 1/s. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
