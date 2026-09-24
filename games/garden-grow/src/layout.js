// The three garden styles, laid out in metres. y is up, the garden's centre
// is the origin and the camera looks from +z towards -z.
//
// `zones` are the soil you can plant in. Each has a shape in the ground
// plane, the height of its soil surface (y) and the container it sits in:
//   ellipse { cx, cz, rx, rz }      rect { cx, cz, w, d }      circle { cx, cz, r }
// Sizes are the soil surface itself; containers (borders, planter walls, pot
// rims) are built around it. `max` limits how many plants fit (pots).
//
// `camera` frames the scene: the camera sits at `pos` looking at `target`;
// main.js pulls it back, keeping the direction, until the `fit` box
// (half-width and half-depth around the target, in metres) is on screen.
export const LAYOUTS = {
  cottage: {
    name: 'Cottage garden',
    ground: 'lawn',
    lawn: { x0: -9, x1: 9, z0: -7, z1: 5 },
    camera: { pos: [0, 1.22, 2.5], target: [0, 0.2, -0.36], fov: 36, fit: { hw: 1.5, hd: 0.95 } },
    zones: [
      { id: 'bed', shape: 'ellipse', cx: 0, cz: -0.34, rx: 1.34, rz: 0.6, y: 0.035, container: 'border' },
      // a long cottage border along the foot of the fence
      { id: 'border', shape: 'ellipse', cx: 0, cz: -2.2, rx: 2.9, rz: 0.3, y: 0.03, container: 'border' },
      { id: 'pot-left', shape: 'circle', cx: -1.62, cz: 0.32, r: 0.14, y: 0.27, container: 'pot', max: 1 },
      { id: 'pot-right', shape: 'circle', cx: 1.72, cz: -0.62, r: 0.12, y: 0.23, container: 'pot', max: 1 },
    ],
    // decorative only; props.js decides the fine detail
    stones: [
      [0.95, 1.55],
      [1.18, 1.05],
      [1.0, 0.62],
    ],
    fence: { z: -2.7, x0: -6, x1: 6, kind: 'picket' },
    // a few plants already in bloom along the back when a garden starts
    starters: [
      ['sunflower', -0.72, -0.66],
      ['lavender', 0.18, -0.74],
      ['sunflower', 0.72, -0.62],
      ['daisy', -1.62, 0.32],
      ['lavender', 1.72, -0.62],
      ['rose', -2.45, -2.22],
      ['lavender', -1.95, -2.3],
      ['poppy', -1.55, -2.12],
      ['sunflower', -1.15, -2.3],
      ['daisy', -0.75, -2.1],
      ['rose', -0.3, -2.28],
      ['tulip', 0.1, -2.08],
      ['lavender', 0.5, -2.26],
      ['poppy', 0.92, -2.12],
      ['sunflower', 1.32, -2.3],
      ['daisy', 1.72, -2.12],
      ['lavender', 2.12, -2.28],
      ['rose', 2.52, -2.2],
    ],
    canRest: [1.36, 0, 0.44],
    basket: [-1.2, 0, 0.66],
    pumpkins: [[0.32, -0.03], [0.58, 0.03], [0.22, 0.22]], // picked pumpkins sit on the ground by the basket (offsets)
    vase: [1.62, 0, 0.12],
  },
  planters: {
    name: 'Raised planters',
    ground: 'lawn',
    lawn: { x0: -9, x1: 9, z0: -7, z1: 5 },
    gravel: { x0: -2.1, x1: 2.1, z0: -1.55, z1: 0.95 },
    camera: { pos: [0, 1.4, 2.4], target: [0, 0.36, -0.52], fov: 36, fit: { hw: 1.5, hd: 0.95 } },
    zones: [
      { id: 'left', shape: 'rect', cx: -0.82, cz: -0.12, w: 1.0, d: 0.5, y: 0.34, container: 'planter' },
      { id: 'right', shape: 'rect', cx: 0.82, cz: -0.12, w: 1.0, d: 0.5, y: 0.34, container: 'planter' },
      { id: 'back', shape: 'rect', cx: 0, cz: -1.02, w: 1.5, d: 0.42, y: 0.5, container: 'planter' },
    ],
    fence: { z: -2.2, x0: -6, x1: 6, kind: 'panel' },
    starters: [
      ['sunflower', -0.5, -1.02],
      ['lavender', 0.12, -1.04],
      ['sunflower', 0.55, -1.0],
      ['strawberry', 1.1, -0.12],
    ],
    canRest: [0, 0, 0.62, 0.55], // x, y, z and spout direction: side-on, not end-on to the camera
    basket: [-1.35, 0, 0.72],
    pumpkins: [[0.32, -0.03], [0.58, 0.03], [0.22, 0.22]],
    vase: [1.4, 0, 0.78],
  },
  balcony: {
    name: 'Balcony pots',
    ground: 'deck',
    deck: { x0: -2.4, x1: 2.4, z0: -1.45, z1: 7.5 }, // deep enough for tall phones, where the camera pulls back
    camera: { pos: [0, 1.42, 2.55], target: [0, 0.34, -0.45], fov: 36, fit: { hw: 1.62, hd: 0.95 } },
    zones: [
      { id: 'window-box', shape: 'rect', cx: 0, cz: -1.12, w: 1.7, d: 0.24, y: 0.42, container: 'windowbox' },
      { id: 'big-pot', shape: 'circle', cx: -1.35, cz: -0.5, r: 0.21, y: 0.38, container: 'pot', max: 3 },
      { id: 'tall-pot', shape: 'circle', cx: 1.38, cz: -0.62, r: 0.17, y: 0.33, container: 'pot', max: 2 },
      { id: 'pot-a', shape: 'circle', cx: -0.62, cz: -0.28, r: 0.13, y: 0.24, container: 'pot', max: 1 },
      { id: 'pot-b', shape: 'circle', cx: 0.52, cz: -0.36, r: 0.15, y: 0.27, container: 'pot', max: 2 },
      { id: 'pot-c', shape: 'circle', cx: -0.05, cz: 0.12, r: 0.11, y: 0.2, container: 'pot', max: 1 },
      { id: 'pot-d', shape: 'circle', cx: 1.02, cz: 0.18, r: 0.1, y: 0.18, container: 'pot', max: 1 },
    ],
    railing: { z: -1.4, x0: -2.4, x1: 2.4, height: 1.0 },
    wall: { x: -2.4 },
    starters: [
      ['lavender', -0.55, -1.12],
      ['daisy', 0.1, -1.12],
      ['tulip', 0.55, -1.12],
      ['rose', -1.35, -0.5],
      ['sunflower', 1.38, -0.62],
    ],
    canRest: [-0.72, 0, 0.62],
    basket: [-1.3, 0, 0.62],
    pumpkins: [[-0.3, -0.02], [0.27, 0.2], [-0.24, 0.26]],
    vase: [1.4, 0, 0.68],
  },
};

// Is the ground-plane point (x, z) inside a zone? `pad` shrinks the zone so
// plants keep clear of its edge.
export function inZone(zone, x, z, pad = 0) {
  const dx = x - zone.cx;
  const dz = z - zone.cz;
  if (zone.shape === 'circle') return Math.hypot(dx, dz) <= zone.r - pad;
  if (zone.shape === 'rect') return Math.abs(dx) <= zone.w / 2 - pad && Math.abs(dz) <= zone.d / 2 - pad;
  const rx = zone.rx - pad;
  const rz = zone.rz - pad;
  return rx > 0 && rz > 0 && (dx * dx) / (rx * rx) + (dz * dz) / (rz * rz) <= 1;
}

// The soil surface height inside a zone. The cottage bed is a gentle mound,
// highest in the middle; containers are level.
export function soilHeight(zone, x, z) {
  if (zone.container !== 'border') return zone.y;
  const dx = (x - zone.cx) / zone.rx;
  const dz = (z - zone.cz) / zone.rz;
  const r2 = Math.min(1, dx * dx + dz * dz);
  return zone.y * (1 - r2 * r2) + 0.012;
}

// Closest point inside a zone (pulled `pad` metres in from the edge).
export function clampToZone(zone, x, z, pad = 0) {
  const dx = x - zone.cx;
  const dz = z - zone.cz;
  if (zone.shape === 'circle') {
    const r = Math.max(0, zone.r - pad);
    const l = Math.hypot(dx, dz);
    if (l <= r) return [x, z];
    return l < 1e-6 ? [zone.cx, zone.cz] : [zone.cx + (dx / l) * r, zone.cz + (dz / l) * r];
  }
  if (zone.shape === 'rect') {
    const hw = Math.max(0, zone.w / 2 - pad);
    const hd = Math.max(0, zone.d / 2 - pad);
    return [zone.cx + Math.max(-hw, Math.min(hw, dx)), zone.cz + Math.max(-hd, Math.min(hd, dz))];
  }
  const rx = Math.max(0.01, zone.rx - pad);
  const rz = Math.max(0.01, zone.rz - pad);
  const k = Math.hypot(dx / rx, dz / rz);
  if (k <= 1) return [x, z];
  return [zone.cx + dx / k, zone.cz + dz / k];
}
