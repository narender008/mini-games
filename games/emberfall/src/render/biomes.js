// Per-biome palettes for the painters, taken from the concept screens:
// Hollow Caves warm amber rims on violet rock, Lumen Thicket magenta and
// teal bioluminescence, Drowned Cloister teal water light on brick, Ember
// Core basalt over red-orange lava.
export const PAL = {
  hollow: {
    sky: ['#140e22', '#1e1426', '#2a1828'], far: '#36243f', mid: '#22162c', near: '#120a18',
    glows: [['#ff9a4a', 0.14], ['#7a9aff', 0.14]],
    rock: '#4a3044', rockBot: '#120a14', crack: '#000000', rim: '#ffb57a', rimSide: '#c88a7a', rimCeil: '#a87a9a',
    moss: '#3a5e36', mossHi: '#557f44', vine: '#2f4a3a', vineGlow: '#9cff6a',
    slab: { top: '#4a3044', bot: '#160c16', rim: '#ffb57a' },
    spike: ['#2a2030', '#e8d8c8'], crystal: ['#5ae8ff', '#9a7aff'],
    water: ['#1a4a6a', '#04101c'], waterHi: '#9ad8ff',
    ambient: '#04020a', shaft: '#9ab8ff', mote: '#c8d8ff', fog: '#6a4a7a', vignette: '#000000', hang: '#030206',
  },
  thicket: {
    sky: ['#0a0620', '#1a0a3a', '#0a1a2a'], far: '#22124a', mid: '#1a0e30', near: '#0c0820',
    glows: [['#a03aff', 0.35], ['#1ad6c0', 0.3]],
    rock: '#2a2050', rockBot: '#08061a', crack: '#000000', rim: '#7affd6', rimSide: '#7a6ad0', rimCeil: '#c07aff',
    moss: '#3aa07a', mossHi: '#7affd6', vine: '#3a2a6a', vineGlow: '#7affd6', vineGlow2: '#ff8ae0',
    slab: { top: '#3a2a60', bot: '#0c0820', rim: '#7affd6' },
    spike: ['#1a1030', '#d68aff'], crystal: ['#c05aff', '#3affd6'],
    caps: ['#ff3fb4', '#3affd6', '#c05aff', '#ffd36a'],
    water: ['#1a3a6a', '#060a1c'], waterHi: '#9affea',
    ambient: '#040210', shaft: '#3affd6', mote: '#9affea', fog: '#6a3aff', vignette: '#05020f', hang: '#05030f',
  },
  cloister: {
    sky: ['#04141e', '#08283a', '#0d3a44'], far: '#0f3440', mid: '#0c2830', near: '#06161c',
    glows: [['#2ac6c0', 0.18], ['#bfffe8', 0.08]],
    rock: '#1e4048', rockBot: '#03090c', crack: '#020608', rim: '#7affea', rimSide: '#4aa8a0', rimCeil: '#5ac8b8',
    moss: '#2a7a5a', mossHi: '#5ac88a', vine: '#2a7a5a', vineGlow: '#9cff6a',
    slab: { top: '#2a6a6a', bot: '#0a2028', rim: '#a8fff0' },
    spike: ['#1a2a30', '#a8e8e0'], crystal: ['#ffd36a', '#5ae8ff'],
    water: ['#0a4a56', '#020c14'], waterHi: '#a0fff0',
    ambient: '#01060a', shaft: '#bfffe8', mote: '#e0fff4', fog: '#2ac6c0', vignette: '#00060a', hang: '#010406',
  },
  core: {
    sky: ['#1a0408', '#4a0c0c', '#a0240a'], far: '#3a0a10', mid: '#22060a', near: '#120304',
    glows: [['#ff4a1a', 0.45], ['#ff8a2a', 0.2]],
    rock: '#3a1210', rockBot: '#0e0304', crack: '#000000', rim: '#ffb36a', rimSide: '#c0603a', rimCeil: '#a04a2a',
    moss: null, vine: '#2a0a08', vineGlow: '#ff6a1a',
    slab: { top: '#3a1210', bot: '#120406', rim: '#ffb36a' },
    spike: ['#1a0608', '#ff8a3a'], crystal: ['#ff8a2a', '#ffd36a'],
    water: ['#3a2a2a', '#0a0404'], waterHi: '#ffb36a',
    ambient: '#0a0002', shaft: '#ff8a2a', mote: '#ffb347', fog: '#ff6a2a', vignette: '#1a0000', hang: '#080102',
  },
};
export const pal = (b) => PAL[b] || PAL.hollow;
