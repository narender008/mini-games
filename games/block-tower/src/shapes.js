// The toy block shapes, in metres, shared by the models (blocks.js) and the
// physics (physics.js). Every block's origin is the centre of its bounding
// box, with +y up in its resting pose. `size` is the full bounding box
// [x, y, z]; `colliders` are its physics parts in the same local frame (a
// part that overlaps others has `fill`, the share of its volume it adds, for
// the mass).
//
// Sizes follow real wooden toy blocks: a 4 cm cube is the unit, the others
// are halves and doubles of it.

export const U = 0.04; // the unit cube's edge
export const EDGE = 0.0022; // radius of the eased edges on every block
export const DENSITY = 680; // kg/m^3, beech and maple; walnut is close

// Half-round: half a 4 cm disc, flat side down, 4 cm deep along z.
function halfRoundPoints(r, depth, seg = 12) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r - r / 2; // flat face at -r/2, top at +r/2
    pts.push(x, y, -depth / 2, x, y, depth / 2);
  }
  return pts;
}

// Triangle roof: an isosceles prism, 8 cm base, 4 cm tall, 4 cm deep.
function roofPoints(w, h, d) {
  const pts = [];
  for (const z of [-d / 2, d / 2]) pts.push(-w / 2, -h / 2, z, w / 2, -h / 2, z, 0, h / 2, z);
  return pts;
}

// One fillet of the arch: the corner between a leg, the crown and the
// half-round opening (radius U/2, centred on the bottom middle). The wood
// there is concave, so no single convex piece can follow the curve: it is
// six slabs, each facing the opening with the chord of a 15 degree step of
// the curve (the half-round block's own facets, so one sits flush in the
// opening) and reaching back into the leg and crown. Past each join a slab
// runs on by the edge radius, so the rounded slabs meet without a notch.
// The slabs overlap each other and the leg and crown, so each carries only
// its share of the fillet's true mass.
function filletParts(side) {
  const r = U / 2;
  const steps = 6;
  const depth = 0.006;
  const parts = [];
  let area = 0;
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    const b = ((k + 1) / steps) * (Math.PI / 2);
    const m = (a + b) / 2;
    const nx = Math.cos(m); // away from the opening
    const ny = Math.sin(m);
    const lap = k ? EDGE : 0; // the foot is on the floor line: nothing below it
    const x0 = r * Math.cos(a) + ny * lap;
    const y0 = -r + r * Math.sin(a) - nx * lap;
    const x1 = r * Math.cos(b) - ny * EDGE;
    const y1 = -r + r * Math.sin(b) + nx * EDGE;
    const outline = [
      [x0, y0],
      [x1, y1],
      [x1 + nx * depth, y1 + ny * depth],
      [x0 + nx * depth, y0 + ny * depth],
    ];
    area += Math.hypot(x1 - x0, y1 - y0) * depth;
    const pts = [];
    for (const z of [-U / 2, U / 2]) for (const [x, y] of outline) pts.push(side * x, y, z);
    parts.push({ type: 'hull', points: pts });
  }
  const fill = (r * r * (1 - Math.PI / 4)) / area;
  for (const p of parts) p.fill = fill;
  return parts;
}

export const SHAPES = {
  cube: {
    size: [U, U, U],
    colliders: [{ type: 'cuboid', half: [U / 2, U / 2, U / 2] }],
  },
  brick: {
    size: [2 * U, U, U],
    colliders: [{ type: 'cuboid', half: [U, U / 2, U / 2] }],
  },
  plank: {
    size: [3 * U, U / 2, U],
    colliders: [{ type: 'cuboid', half: [1.5 * U, U / 4, U / 2] }],
  },
  pillar: {
    size: [0.025, 2 * U, 0.025],
    colliders: [{ type: 'cuboid', half: [0.0125, U, 0.0125] }],
  },
  cylinder: {
    // upright round column, axis along y
    size: [U, U, U],
    colliders: [{ type: 'cylinder', radius: U / 2, halfHeight: U / 2 }],
  },
  arch: {
    // 8 x 4 x 4 cm with a half-round opening 4 cm wide and 2 cm high:
    // two 2 cm legs under a 2 cm crown, and the curved fillets beside the
    // opening as six slabs each (chords under 0.2 mm inside the curve).
    // Without the fillets the opening would be a 4 x 2 cm slot that saddles
    // a 4 cm cube exactly and wedges on it.
    size: [2 * U, U, U],
    colliders: [
      { type: 'cuboid', half: [U, U / 4, U / 2], offset: [0, U / 4, 0] },
      { type: 'cuboid', half: [U / 4, U / 4, U / 2], offset: [-0.75 * U, -U / 4, 0] },
      { type: 'cuboid', half: [U / 4, U / 4, U / 2], offset: [0.75 * U, -U / 4, 0] },
      ...filletParts(1),
      ...filletParts(-1),
    ],
    opening: { radius: U / 2, centre: [0, -U / 2, 0] }, // for the model
  },
  roof: {
    size: [2 * U, U, U],
    colliders: [{ type: 'hull', points: roofPoints(2 * U, U, U) }],
  },
  halfround: {
    size: [U, U / 2, U],
    colliders: [{ type: 'hull', points: halfRoundPoints(U / 2, U) }],
  },
};

export const SHAPE_IDS = Object.keys(SHAPES);

// Which shapes each block set offers. Letters are cubes with a letter or
// number on every face; the set adds a few plain wooden shapes to build with.
export const SET_SHAPES = {
  wood: SHAPE_IDS,
  rainbow: SHAPE_IDS,
  letters: ['cube', 'brick', 'plank', 'pillar', 'cylinder', 'arch', 'roof', 'halfround'],
};
