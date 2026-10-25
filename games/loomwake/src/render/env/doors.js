// Door geometry shared by every region: the arch frame is painted into the floor canvas
// by the region painter; index.js drawDoor animates the portal inside the same arch.
export const DOOR_GEOM = { hw: 75, h: 220 };

// door-local space: x right, y up negative, origin at the edge point; side doors are skewed
// so they read as set into a side wall.
export function doorXform(d) {
  if (!d.side) return [1, 0, 0, 1, d.ex, d.ey + 6];
  const s = Math.cos(d.angle) > 0 ? 1 : -1;
  return [0.5, -0.32 * s, 0, 1, d.ex - s * 10, d.ey + 10];
}
export function archPath(g, hw, h) {
  g.beginPath(); g.moveTo(-hw, 0); g.lineTo(-hw, -h * 0.55); g.quadraticCurveTo(-hw, -h * 0.95, 0, -h); g.quadraticCurveTo(hw, -h * 0.95, hw, -h * 0.55); g.lineTo(hw, 0); g.closePath();
}
