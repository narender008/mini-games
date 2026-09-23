// The cakes. Each tier lists its layers from the bottom up (kind, thickness in
// metres, main colour, second colour), then the coat on its side and top.
// Colours are sRGB hex. The shaders understand the kinds in LAYER and COAT.

export const LAYER = {
  sponge: 0,
  cream: 1,
  jam: 2,
  ganache: 3,
  cheese: 4,
  crust: 5,
  icecream: 6,
  crunch: 7,
  cherrycream: 8,
  mousse: 9,
  fondant: 10,
  berrycream: 11,
  caramel: 12,
  curd: 13,
};

export const COAT = {
  buttercream: 0,
  ganache: 1,
  whipped: 2,
  fondant: 3,
  glaze: 4,
  baked: 5,
  shavings: 6,
  naked: 7,
};

const CHOC = ['#56301f', '#2a150c'];
const VANILLA = ['#f0d49a', '#c89a52'];

export const CAKES = [
  {
    id: 'drip',
    name: 'Chocolate drip',
    blurb: 'Dark chocolate sponge, ganache and salted caramel, pink buttercream and a glossy drip.',
    tiers: [
      {
        r: 0.1,
        layers: [
          ['sponge', 0.026, ...CHOC],
          ['ganache', 0.005, '#2a130a'],
          ['sponge', 0.026, ...CHOC],
          ['caramel', 0.005, '#c67a2e'],
          ['sponge', 0.026, ...CHOC],
        ],
        side: { kind: 'buttercream', color: '#f3c3cd', t: 0.005 },
        top: { kind: 'ganache', color: '#2c140b', t: 0.003, under: '#f3c3cd', underT: 0.004 },
        drip: { color: '#2c140b', len: 0.034 },
      },
    ],
    frost: 'side',
    frosting: '#f3c3cd',
    toppings: ['shards', 'macarons', 'strawberries', 'goldsprinkles'],
    candles: 'regular',
  },
  {
    id: 'strawberry',
    name: 'Strawberry cream',
    blurb: 'Vanilla sponge, fresh strawberries and whipped cream, semi-naked sides.',
    tiers: [
      {
        r: 0.105,
        layers: [
          ['sponge', 0.024, ...VANILLA],
          ['jam', 0.003, '#a3121e'],
          ['berrycream', 0.013, '#fbf4e8', '#d8242e'],
          ['sponge', 0.024, ...VANILLA],
          ['berrycream', 0.013, '#fbf4e8', '#d8242e'],
          ['sponge', 0.023, ...VANILLA],
        ],
        side: { kind: 'naked', color: '#fbf4ea', t: 0.0015 },
        top: { kind: 'whipped', color: '#fbf4ea', t: 0.007 },
      },
    ],
    frost: null,
    frosting: '#fbf4ea',
    toppings: ['strawberries', 'rosettes', 'blueberries'],
    candles: 'regular',
  },
  {
    id: 'rainbow',
    name: 'Rainbow layers',
    blurb: 'Six colours of vanilla sponge in white buttercream, with rainbow sprinkles.',
    tiers: [
      {
        r: 0.1,
        layers: [
          ['sponge', 0.0135, '#b44fd0', '#6c2a86'],
          ['cream', 0.003, '#fbf5ec'],
          ['sponge', 0.0135, '#3f86e0', '#1f4f94'],
          ['cream', 0.003, '#fbf5ec'],
          ['sponge', 0.0135, '#4fbf55', '#27782c'],
          ['cream', 0.003, '#fbf5ec'],
          ['sponge', 0.0135, '#f7d33c', '#b8901c'],
          ['cream', 0.003, '#fbf5ec'],
          ['sponge', 0.0135, '#f98b2e', '#b85314'],
          ['cream', 0.003, '#fbf5ec'],
          ['sponge', 0.0135, '#ea3f45', '#9c1a22'],
        ],
        side: { kind: 'buttercream', color: '#fbf6ee', t: 0.005 },
        top: { kind: 'buttercream', color: '#fbf6ee', t: 0.005 },
      },
    ],
    frost: 'all',
    frosting: '#fbf6ee',
    toppings: ['sprinkles', 'rosettes'],
    candles: 'number',
  },
  {
    id: 'blackforest',
    name: 'Black forest',
    blurb: 'Cherry-soaked chocolate sponge, whipped cream and cherries, chocolate shavings.',
    tiers: [
      {
        r: 0.105,
        layers: [
          ['sponge', 0.024, '#4a2416', '#1f0d07'],
          ['cherrycream', 0.014, '#fbf3ea', '#5c0612'],
          ['sponge', 0.024, '#4a2416', '#1f0d07'],
          ['cherrycream', 0.014, '#fbf3ea', '#5c0612'],
          ['sponge', 0.022, '#4a2416', '#1f0d07'],
        ],
        side: { kind: 'shavings', color: '#fbf3ea', t: 0.006 },
        top: { kind: 'whipped', color: '#fbf3ea', t: 0.007 },
      },
    ],
    frost: null,
    frosting: '#fbf3ea',
    toppings: ['rosettes', 'cherries', 'curls'],
    candles: 'regular',
  },
  {
    id: 'celebration',
    name: 'Two-tier celebration',
    blurb: 'Vanilla and raspberry below, lemon curd above, smooth fondant, satin ribbons and sugar pearls.',
    tiers: [
      {
        r: 0.115,
        layers: [
          ['sponge', 0.024, ...VANILLA],
          ['jam', 0.004, '#b3172f'],
          ['cream', 0.004, '#fbf1dd'],
          ['sponge', 0.024, ...VANILLA],
          ['jam', 0.004, '#b3172f'],
          ['cream', 0.004, '#fbf1dd'],
          ['sponge', 0.022, ...VANILLA],
        ],
        side: { kind: 'fondant', color: '#f8f1f4', t: 0.0035, under: '#fbf1dd', underT: 0.003 },
        top: { kind: 'fondant', color: '#f8f1f4', t: 0.0035, under: '#fbf1dd', underT: 0.003 },
        band: { color: '#c9a6e0', h: 0.014 },
      },
      {
        r: 0.075,
        layers: [
          ['sponge', 0.022, '#f3dc8e', '#c9a04a'],
          ['curd', 0.005, '#f2c83a'],
          ['sponge', 0.022, '#f3dc8e', '#c9a04a'],
          ['curd', 0.005, '#f2c83a'],
          ['sponge', 0.02, '#f3dc8e', '#c9a04a'],
        ],
        side: { kind: 'fondant', color: '#f8f1f4', t: 0.0035, under: '#fbf1dd', underT: 0.003 },
        top: { kind: 'fondant', color: '#f8f1f4', t: 0.0035, under: '#fbf1dd', underT: 0.003 },
        band: { color: '#c9a6e0', h: 0.012 },
      },
    ],
    frost: 'all',
    frosting: '#f8f1f4',
    toppings: ['pearls', 'macarons'],
    candles: 'number',
  },
  {
    id: 'cheesecake',
    name: 'New York cheesecake',
    blurb: 'Buttery biscuit base, baked vanilla cheesecake and a glossy strawberry glaze.',
    tiers: [
      {
        r: 0.1,
        layers: [
          ['crust', 0.012, '#b07a3e', '#6e4219'],
          ['cheese', 0.05, '#f6e5bd', '#c98f45'],
        ],
        side: { kind: 'baked', color: '#d9a55c', t: 0.0 },
        top: { kind: 'glaze', color: '#b3101f', t: 0.004 },
      },
    ],
    frost: null,
    frosting: '#fbf3ea',
    toppings: ['strawberries', 'blueberries', 'raspberries'],
    candles: 'regular',
  },
  {
    id: 'icecream',
    name: 'Ice-cream cake',
    blurb: 'Cookie crumb base, vanilla and strawberry ice cream, fudge crunch, whipped topping.',
    tiers: [
      {
        r: 0.1,
        layers: [
          ['crunch', 0.012, '#2e1a12', '#130906'],
          ['icecream', 0.028, '#f8ecd0', '#f8ecd0'],
          ['ganache', 0.004, '#3a1d10'],
          ['crunch', 0.006, '#3a1f12', '#150a06'],
          ['icecream', 0.028, '#f5b8c4', '#c3122a'],
        ],
        side: { kind: 'whipped', color: '#fdf7f0', t: 0.006 },
        top: { kind: 'whipped', color: '#fdf7f0', t: 0.007 },
      },
    ],
    frost: 'all',
    frosting: '#fdf7f0',
    toppings: ['sprinkles', 'cherries', 'rosettes'],
    candles: 'regular',
  },
  {
    id: 'checker',
    name: 'Checkerboard',
    blurb: 'Rings of vanilla and chocolate sponge that make a checkerboard when you cut it.',
    pattern: 'checker',
    tiers: [
      {
        r: 0.1,
        layers: [
          ['sponge', 0.028, '#f0d49a', '#4c2819'],
          ['cream', 0.003, '#6b3a22'],
          ['sponge', 0.028, '#f0d49a', '#4c2819'],
          ['cream', 0.003, '#6b3a22'],
          ['sponge', 0.028, '#f0d49a', '#4c2819'],
        ],
        side: { kind: 'buttercream', color: '#6b3a22', t: 0.005 },
        top: { kind: 'buttercream', color: '#6b3a22', t: 0.005 },
      },
    ],
    frost: 'all',
    frosting: '#6b3a22',
    toppings: ['shards', 'pearls'],
    candles: 'regular',
  },
];

// Heights and total volume, worked out once.
for (const cake of CAKES) {
  let base = 0;
  for (const t of cake.tiers) {
    let y = 0;
    t.tops = t.layers.map((l) => (y += l[1]));
    t.h = y + t.top.t + (t.top.underT || 0);
    t.base = base;
    base += t.h;
  }
  cake.height = base;
}

export function cakeById(id) {
  return CAKES.find((c) => c.id === id) || CAKES[0];
}

// Frosting colours offered when decorating.
export const FROSTINGS = [
  { id: 'vanilla', name: 'Vanilla', color: '#fbf6ee' },
  { id: 'pink', name: 'Strawberry pink', color: '#f3c3cd' },
  { id: 'lavender', name: 'Lavender', color: '#cdb8e8' },
  { id: 'mint', name: 'Mint', color: '#bfe5d2' },
  { id: 'lemon', name: 'Lemon', color: '#f7e7a3' },
  { id: 'sky', name: 'Sky blue', color: '#b8d8f2' },
  { id: 'peach', name: 'Peach', color: '#f8cfae' },
  { id: 'chocolate', name: 'Chocolate', color: '#6b3a22' },
];

export const TOPPINGS = [
  { id: 'sprinkles', name: 'Sprinkles' },
  { id: 'goldsprinkles', name: 'Gold sprinkles' },
  { id: 'strawberries', name: 'Strawberries' },
  { id: 'blueberries', name: 'Blueberries' },
  { id: 'raspberries', name: 'Raspberries' },
  { id: 'cherries', name: 'Cherries' },
  { id: 'shards', name: 'Chocolate shards' },
  { id: 'curls', name: 'Chocolate curls' },
  { id: 'macarons', name: 'Macarons' },
  { id: 'rosettes', name: 'Cream rosettes' },
  { id: 'pearls', name: 'Sugar pearls' },
];
