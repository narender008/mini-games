// Shapes and sizes shared by the physics and the art, in metres. Physics
// coordinates: x forward (to the right), y UP, angles counter-clockwise.
// Every vehicle and launcher faces right. A body's origin is the centre of
// the box its numbers describe unless a note says otherwise. The art paints
// these same outlines (see src/art/), so changing a number here changes both.

// ------------------------------------------------------------- the stuntman
// Twelve parts and eleven joints. Sizes are of the standing pose, facing
// right; each part's long axis is vertical in that pose, and `y` is the part
// centre's height above the soles. F parts are on the near side (drawn in
// front of the torso), B parts on the far side (drawn behind it).
export const PARTS = {
  head: { r: 0.14, y: 1.72, mult: 3 },
  neck: { w: 0.1, h: 0.13, y: 1.545, mult: 2.5 },
  chest: { w: 0.36, h: 0.4, y: 1.3, mult: 1.2 },
  pelvis: { w: 0.32, h: 0.26, y: 0.99, mult: 1.4 },
  uarm: { w: 0.1, h: 0.32, y: 1.3, mult: 0.8 },
  larm: { w: 0.09, h: 0.34, y: 0.98, mult: 0.7 },
  uleg: { w: 0.14, h: 0.44, y: 0.68, mult: 0.9 },
  lleg: { w: 0.12, h: 0.46, y: 0.23, mult: 0.8 },
};
// part id -> shape key and side ('' for the middle line)
export const BODY_PARTS = [
  { id: 'llegB', shape: 'lleg', side: 'B', label: 'Left shin' },
  { id: 'ulegB', shape: 'uleg', side: 'B', label: 'Left thigh' },
  { id: 'larmB', shape: 'larm', side: 'B', label: 'Left forearm' },
  { id: 'uarmB', shape: 'uarm', side: 'B', label: 'Left arm' },
  { id: 'pelvis', shape: 'pelvis', side: '', label: 'Pelvis' },
  { id: 'chest', shape: 'chest', side: '', label: 'Ribs' },
  { id: 'neck', shape: 'neck', side: '', label: 'Neck' },
  { id: 'head', shape: 'head', side: '', label: 'Skull' },
  { id: 'ulegF', shape: 'uleg', side: 'F', label: 'Right thigh' },
  { id: 'llegF', shape: 'lleg', side: 'F', label: 'Right shin' },
  { id: 'uarmF', shape: 'uarm', side: 'F', label: 'Right arm' },
  { id: 'larmF', shape: 'larm', side: 'F', label: 'Right forearm' },
];
// Joints: anchor height in the standing pose (x = 0), and the limits of
// child angle minus parent angle (radians, counter-clockwise positive; with
// the figure facing right, a knee bends with a negative angle and a hip
// lifts the thigh forward with a positive one). `brk` scales how hard a hit
// must be to tear the joint apart (1 = the base threshold in ragdoll.js).
export const JOINTS = [
  { a: 'pelvis', b: 'chest', y: 1.12, lo: -1.0, hi: 0.45, brk: 3 },
  { a: 'chest', b: 'neck', y: 1.49, lo: -0.55, hi: 0.5, brk: 1.6 },
  { a: 'neck', b: 'head', y: 1.6, lo: -0.5, hi: 0.5, brk: 1.25 },
  { a: 'chest', b: 'uarmB', y: 1.45, lo: -2.9, hi: 2.9, brk: 1 },
  { a: 'uarmB', b: 'larmB', y: 1.14, lo: -0.05, hi: 2.5, brk: 0.9 },
  { a: 'chest', b: 'uarmF', y: 1.45, lo: -2.9, hi: 2.9, brk: 1 },
  { a: 'uarmF', b: 'larmF', y: 1.14, lo: -0.05, hi: 2.5, brk: 0.9 },
  { a: 'pelvis', b: 'ulegB', y: 0.9, lo: -0.6, hi: 2.2, brk: 1.3 },
  { a: 'ulegB', b: 'llegB', y: 0.46, lo: -2.4, hi: 0.05, brk: 1.1 },
  { a: 'pelvis', b: 'ulegF', y: 0.9, lo: -0.6, hi: 2.2, brk: 1.3 },
  { a: 'ulegF', b: 'llegF', y: 0.46, lo: -2.4, hi: 0.05, brk: 1.1 },
];

// ------------------------------------------------------------------ rides
// `profile` is the side outline (counter-clockwise, y up) the art paints and
// `hull` the convex physics pieces. `seat` is where the stuntman's pelvis
// sits, `grip` where his hands hold on (if anywhere), `glass` the windscreen
// as a line from its bottom to its top (cars), `nozzle` where a rocket's
// flame comes out. `top` is the top speed in m/s before upgrades.
export const RIDES = {
  // --- cars: drive at a chosen speed into the obstacle, out through the windscreen
  hatchback: {
    kind: 'car',
    name: 'Hatchback',
    blurb: 'A tired family estate. Crumples nicely.',
    cost: 0,
    top: 33,
    mass: 1100,
    profile: [[-2.15, -0.5], [2.1, -0.5], [2.2, -0.15], [2.15, 0.2], [0.9, 0.32], [0.1, 0.95], [-1.8, 0.95], [-2.15, 0.55]],
    hull: [
      [[-2.15, -0.5], [2.1, -0.5], [2.2, -0.15], [2.15, 0.2], [0.9, 0.32], [-2.15, 0.32]],
      [[-2.15, 0.32], [0.9, 0.32], [0.1, 0.95], [-1.8, 0.95], [-2.15, 0.55]],
    ],
    wheels: [{ x: -1.4, y: -0.5, r: 0.38 }, { x: 1.4, y: -0.5, r: 0.38 }],
    glass: [[0.9, 0.32], [0.1, 0.95]],
    seat: [-0.5, -0.12],
    grip: [0.35, 0.22],
    colour: '#2f8f8a',
  },
  muscle: {
    kind: 'car',
    name: 'Muscle Car',
    blurb: 'Big engine, small brain. Faster.',
    cost: 40000,
    top: 44,
    mass: 1400,
    profile: [[-2.4, -0.45], [2.35, -0.45], [2.45, -0.1], [2.4, 0.15], [0.75, 0.28], [0.0, 0.82], [-1.3, 0.82], [-2.4, 0.35]],
    hull: [
      [[-2.4, -0.45], [2.35, -0.45], [2.45, -0.1], [2.4, 0.15], [0.75, 0.28], [-2.4, 0.28]],
      [[-2.4, 0.28], [0.75, 0.28], [0.0, 0.82], [-1.3, 0.82], [-2.4, 0.35]],
    ],
    wheels: [{ x: -1.55, y: -0.45, r: 0.4 }, { x: 1.55, y: -0.45, r: 0.4 }],
    glass: [[0.75, 0.28], [0.0, 0.82]],
    seat: [-0.55, -0.1],
    grip: [0.25, 0.2],
    colour: '#d8332b',
  },
  pickup: {
    kind: 'car',
    name: 'Monster Pickup',
    blurb: 'Huge wheels, sits high. Launches you higher.',
    cost: 120000,
    top: 39,
    mass: 2200,
    profile: [[-2.6, -0.35], [2.5, -0.35], [2.6, 0.1], [2.5, 0.55], [1.0, 0.65], [0.35, 1.35], [-0.9, 1.35], [-1.0, 0.65], [-2.6, 0.65]],
    hull: [
      [[-2.6, -0.35], [2.5, -0.35], [2.6, 0.1], [2.5, 0.55], [1.0, 0.65], [-2.6, 0.65]],
      [[-1.0, 0.65], [1.0, 0.65], [0.35, 1.35], [-0.9, 1.35]],
    ],
    wheels: [{ x: -1.7, y: -0.35, r: 0.6 }, { x: 1.7, y: -0.35, r: 0.6 }],
    glass: [[1.0, 0.65], [0.35, 1.35]],
    seat: [-0.35, 0.36],
    grip: [0.55, 0.85],
    colour: '#f2a516',
  },
  rocket: {
    kind: 'car',
    name: 'Rocket Car',
    blurb: 'A jet engine with a seat bolted on.',
    cost: 300000,
    top: 64,
    mass: 1300,
    profile: [[-2.6, -0.35], [2.9, -0.35], [3.0, -0.2], [0.9, 0.25], [0.2, 0.6], [-0.6, 0.6], [-1.6, 0.3], [-2.6, 0.5]],
    hull: [
      [[-2.6, -0.35], [2.9, -0.35], [3.0, -0.2], [0.9, 0.25], [-1.6, 0.3], [-2.6, 0.5]],
      [[-1.6, 0.3], [0.9, 0.25], [0.2, 0.6], [-0.6, 0.6]],
    ],
    wheels: [{ x: -1.8, y: -0.35, r: 0.5 }, { x: 2.2, y: -0.35, r: 0.3 }],
    glass: [[0.9, 0.25], [0.2, 0.6]],
    seat: [-0.3, -0.05],
    grip: [0.45, 0.15],
    nozzle: [-2.6, 0.08],
    colour: '#3a62d6',
  },

  // --- ramp rides: pushed off down the slope, off the lip; tap to bail
  cart: {
    kind: 'ramp',
    name: 'Shopping Cart',
    blurb: 'One wonky wheel. Rattles all the way down.',
    cost: 0,
    top: 22,
    mass: 30,
    profile: [[-0.55, -0.25], [0.55, -0.25], [0.7, 0.55], [-0.6, 0.55]],
    // floor, front wall, back wall: the stuntman sits inside
    hull: [
      [[-0.55, -0.25], [0.55, -0.25], [0.56, -0.17], [-0.56, -0.17]],
      [[0.55, -0.25], [0.6, -0.25], [0.72, 0.55], [0.66, 0.55]],
      [[-0.6, -0.25], [-0.55, -0.25], [-0.62, 0.55], [-0.67, 0.55]],
    ],
    wheels: [{ x: -0.45, y: -0.55, r: 0.09 }, { x: 0.45, y: -0.55, r: 0.09 }],
    seat: [0.0, 0.0],
    grip: [0.62, 0.5],
    colour: '#c9ced6',
  },
  bike: {
    kind: 'ramp',
    name: 'Dirt Bike',
    blurb: 'A motor helps it up to speed. Hold on tight.',
    cost: 30000,
    top: 30,
    mass: 110,
    profile: [[-0.6, -0.2], [0.55, -0.2], [0.65, 0.3], [0.2, 0.4], [-0.4, 0.45], [-0.75, 0.3]],
    hull: [[[-0.6, -0.2], [0.55, -0.2], [0.65, 0.3], [0.2, 0.4], [-0.4, 0.45], [-0.75, 0.3]]],
    wheels: [{ x: -0.72, y: -0.28, r: 0.34 }, { x: 0.78, y: -0.28, r: 0.34 }],
    seat: [-0.2, 0.62],
    grip: [0.5, 0.85],
    colour: '#f07a1a',
  },
  tub: {
    kind: 'ramp',
    name: 'Bathtub',
    blurb: 'Cast iron on roller-skate wheels. Heavy, so it keeps going.',
    cost: 90000,
    top: 27,
    mass: 260,
    profile: [[-0.85, -0.2], [0.85, -0.2], [0.98, 0.42], [-0.98, 0.46]],
    hull: [
      [[-0.85, -0.2], [0.85, -0.2], [0.86, -0.1], [-0.86, -0.1]],
      [[0.8, -0.2], [0.88, -0.2], [1.0, 0.42], [0.92, 0.42]],
      [[-0.88, -0.2], [-0.8, -0.2], [-0.92, 0.46], [-1.0, 0.46]],
    ],
    wheels: [{ x: -0.65, y: -0.42, r: 0.12 }, { x: 0.65, y: -0.42, r: 0.12 }],
    seat: [-0.1, 0.05],
    grip: [0.85, 0.4],
    colour: '#f4f1ea',
  },
  sled: {
    kind: 'ramp',
    name: 'Rocket Sled',
    blurb: 'Rides on skids with a rocket strapped on the back.',
    cost: 250000,
    top: 40,
    mass: 140,
    profile: [[-1.2, -0.15], [1.3, -0.15], [1.5, 0.1], [1.1, 0.35], [-1.2, 0.35]],
    hull: [[[-1.2, -0.15], [1.3, -0.15], [1.5, 0.1], [1.1, 0.35], [-1.2, 0.35]]],
    wheels: [],
    // the skids along the bottom (low friction)
    skids: [[-1.15, -0.3], [1.4, -0.3]],
    seat: [-0.15, 0.48],
    grip: [0.75, 0.62],
    nozzle: [-1.2, 0.1],
    colour: '#2fb5c8',
  },

  // --- launchers: aim and power, the stuntman flies from the muzzle
  // A barrel turns about its pivot (local origin); `muzzle` is how far along
  // +x the stuntman leaves it. `base` is the stand, drawn unturned, with its
  // origin at the pivot too; `ground` is how far the pivot is above the
  // ground. The slingshot has fork tips instead of a barrel.
  circus: {
    kind: 'cannon',
    name: 'Circus Cannon',
    blurb: 'Red and gold, and loaded with a little too much powder.',
    cost: 0,
    top: 34,
    barrel: { x0: -0.7, x1: 2.6, r0: 0.5, r1: 0.42 },
    muzzle: 2.5,
    ground: 1.25,
    colour: '#d8332b',
  },
  sling: {
    kind: 'cannon',
    name: 'Giant Slingshot',
    blurb: 'Two telegraph poles and a lot of rubber. Drag right back.',
    cost: 60000,
    top: 40,
    forks: [[-1.0, 4.2], [1.0, 4.2]],
    ground: 0,
    colour: '#8a5a2b',
  },
  mega: {
    kind: 'cannon',
    name: 'Mega Cannon',
    blurb: 'Army surplus. Nobody asked what it was for.',
    cost: 200000,
    top: 50,
    barrel: { x0: -1.0, x1: 3.8, r0: 0.7, r1: 0.55 },
    muzzle: 3.7,
    ground: 1.6,
    colour: '#56663a',
  },
};
export const RIDE_KINDS = { car: ['hatchback', 'muscle', 'pickup', 'rocket'], ramp: ['cart', 'bike', 'tub', 'sled'], cannon: ['circus', 'sling', 'mega'] };

// ------------------------------------------------------------------ props
// Default sizes; a track may override w and h. `mat` picks the hit sound and
// spark colour. Every prop's origin is its centre.
export const PROPS = {
  wall: { w: 1.2, h: 1.6, mat: 'concrete', note: 'concrete crash barrier; variants: concrete (hazard stripes and a stencil), brick, jersey (a low sloped highway barrier)' },
  drum: { w: 0.58, h: 0.88, mat: 'metal', note: 'oil drum; variants: coolant (yellow), waste (green), lube (red, explodes), water (blue)' },
  crate: { w: 0.9, h: 0.9, mat: 'wood', note: 'wooden crate that breaks into planks; variants: wood, tnt (explodes), ice (breaks into ice)' },
  plank: { w: 0.9, h: 0.14, mat: 'wood', note: 'a broken crate plank (debris)' },
  glass: { w: 0.08, h: 2.4, mat: 'glass', note: 'a free-standing pane in a thin frame; variant window (no frame, in a building)' },
  pole: { w: 0.16, h: 6, mat: 'metal', note: 'lamppost; variants: lamp, sign (a road sign on top), pine (a pine tree, the trunk is the body), torch (tiki torch, 2.2 tall)' },
  trampoline: { w: 2.6, h: 0.7, mat: 'rubber', note: 'the body is the whole frame; the mat is the top 0.1' },
  spikes: { w: 3, h: 0.55, mat: 'metal', note: 'a strip of steel spikes on a base' },
  sedan: { w: 4.4, h: 1.45, mat: 'metal', note: 'traffic car; variants: sedan, taxi, police; wheels drawn in, r 0.36 at x ±1.4, bottom of body' },
  truck: { w: 9, h: 3.4, mat: 'metal', note: 'lorry, cab on the right; wheels drawn in' },
  bus: { w: 11, h: 3.2, mat: 'metal', note: 'city bus; wheels drawn in' },
  forklift: { w: 2.8, h: 2.4, mat: 'metal', note: 'harbour forklift, forks on the right' },
  tyres: { w: 0.95, h: 0.32, mat: 'rubber', note: 'one tyre lying flat (seen edge-on); stacked by the track' },
  haybale: { w: 1.3, h: 0.9, mat: 'hay', note: 'round-cornered straw bale' },
  cone: { w: 0.36, h: 0.55, mat: 'rubber', note: 'traffic cone' },
  billboard: { w: 8, h: 4, mat: 'wood', note: 'the board only (the poles are drawn below it, down to h/2 + 3)' },
  plankdeck: { w: 3, h: 0.14, mat: 'wood', note: 'a scaffold plank / platform; variant girder (red steel)' },
  beam: { w: 5, h: 0.35, mat: 'metal', note: 'steel I-beam' },
  wreckingball: { w: 1.5, h: 1.5, mat: 'metal', note: 'circle r 0.75; the chain is drawn by the renderer' },
  bumper: { w: 1, h: 1, mat: 'rubber', note: 'circus pinball bumper, circle r 0.5' },
  hoop: { w: 0.4, h: 2.8, mat: 'none', note: 'ring of fire seen edge-on: a ring 2.8 across, drawn as a thin upright ellipse; the flames are particles' },
  target: { w: 3, h: 0.3, mat: 'wood', note: 'bullseye mat lying on the ground (seen nearly edge-on, a squashed ellipse)' },
  container: { w: 6.1, h: 2.6, mat: 'metal', note: 'shipping container; variants: red, blue, green, orange' },
  snowman: { w: 0.9, h: 1.7, mat: 'snow', note: 'three snowballs r 0.45 / 0.33 / 0.24 stacked, carrot nose to the left (facing the player)' },
  iceblock: { w: 1, h: 1, mat: 'glass', note: 'block of ice' },
  acunit: { w: 1.2, h: 0.9, mat: 'metal', note: 'rooftop air-conditioning unit' },
  watertower: { w: 3, h: 5, mat: 'wood', note: 'rooftop water tank on legs; the body is the tank (top 3 m)' },
  junkcar: { w: 4.2, h: 1.3, mat: 'metal', note: 'rusty wreck with no wheels' },
  log: { w: 3.2, h: 0.5, mat: 'wood', note: 'a log swinging on ropes (ropes drawn by the renderer)' },
  lavarock: { w: 2.4, h: 1.4, mat: 'concrete', note: 'a craggy black boulder with glowing cracks' },
  ramp: { w: 4, h: 1.5, mat: 'wood', note: 'a kicker ramp: right triangle, the slope rising to the right, the tall side on the right; variants: wood, steel' },
  platform: { w: 4, h: 0.4, mat: 'concrete', note: 'a flat slab or rooftop ledge; variants: concrete, steel, wood' },
};

// Materials: hit-sound family, spark colour, and whether blood shows on them.
export const MATS = {
  flesh: { sound: 'flesh' },
  concrete: { sound: 'concrete', spark: '#ffd27a' },
  metal: { sound: 'metal', spark: '#fff1a8' },
  wood: { sound: 'wood', spark: null },
  glass: { sound: 'glass', spark: '#cdefff' },
  rubber: { sound: 'rubber', spark: null },
  hay: { sound: 'dirt', spark: null },
  snow: { sound: 'snow', spark: null },
  dirt: { sound: 'dirt', spark: null },
  none: { sound: null, spark: null },
};
