// The paint box: colours, brush types and sizes for each mode. Radii and
// paint loads are in painting texels at 1024 across (the engine scales).
export const COLORS = {
  red: 0xe53935,
  orange: 0xfb8c1a,
  yellow: 0xfdd835,
  green: 0x43b649,
  blue: 0x1e88e5,
  purple: 0x8e44d0,
  pink: 0xf06ab0,
  white: 0xfbfaf6,
  // big kids get more
  sky: 0x6ec6f5,
  navy: 0x283f9c,
  teal: 0x1fb5a8,
  lime: 0xa5d63a,
  brown: 0x8a5a36,
  peach: 0xf8b98c,
  grey: 0x9e9e9e,
  black: 0x24222a,
};

export const LITTLE_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'white'];
export const BIG_COLORS = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'sky', 'blue', 'navy', 'purple', 'pink', 'peach', 'brown', 'grey', 'black', 'white'];

// brush types: which engine tool, radius, paint load before it runs dry
export const BRUSHES = {
  little: {
    brush: { tool: 'brush', radius: 30, load: 2600, bristles: 30 },
    water: { tool: 'water', radius: 30, load: 2200 },
    glitter: { tool: 'glitter', radius: 26, load: 3000, bristles: 26 },
    sponge: { tool: 'sponge', radius: 44 },
  },
  big: {
    brush: { tool: 'brush', radius: 16, load: 1500, bristles: 24 },
    water: { tool: 'water', radius: 20, load: 1500 },
    glitter: { tool: 'glitter', radius: 16, load: 2000, bristles: 22 },
    sponge: { tool: 'sponge', radius: 34 },
  },
};

export const SIZES = { small: 0.45, medium: 1, large: 1.8 };
