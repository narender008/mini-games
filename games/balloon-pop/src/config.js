// Shared constants for the scene. Colours are written as sRGB hex values
// (as sampled from the dusk-over-the-sea reference) and converted to linear
// light where the shaders need them.
import * as THREE from 'three';

// Direction towards the setting sun: low, to the right and slightly ahead.
export const SUN_DIR = new THREE.Vector3(0.74, 0.035, -0.67).normalize();

// Direction the key light shines from. A touch higher than the visible sun so
// the envelopes get a readable warm rim instead of a pure grazing light.
export const KEY_LIGHT_DIR = new THREE.Vector3(0.7, 0.2, -0.62).normalize();

// Wind blows gently towards +x; balloons drift with it.
export const WIND = new THREE.Vector2(1, 0);

export const WATER_LEVEL = 0;

// Envelope palettes: five colours per palette. Palette 0 is the reference
// balloon (red, orange, violet, orange, electric blue); 1-4 are its vivid
// cousins. Jewel palettes put the gem first and a cream or gold trim second,
// so the same palette also serves two-tone chevrons and swirls. Pastels run
// from the warm mouth to the cool crown like the sunset itself.
export const PALETTES = [
  ['#d8281f', '#f3871f', '#8540f2', '#f3871f', '#2f7bff'],
  ['#ffbf2e', '#ff6d18', '#e2301f', '#d62f76', '#ff8f1f'],
  ['#2a6bff', '#7a36ff', '#1eb8ff', '#b534ff', '#3f8cff'],
  ['#8540f2', '#2f7bff', '#ffc22e', '#d8281f', '#f3871f'],
  ['#f3871f', '#ffc22e', '#f3871f', '#d8281f', '#ffc22e'],
  ['#0e8a5f', '#f3e6c4', '#0a6e4c', '#f7c98c', '#12a070'], // 5 emerald
  ['#1d44c4', '#f7c98c', '#15349c', '#ffe7b0', '#2a55e0'], // 6 sapphire
  ['#b3102d', '#f6efe6', '#8a0b22', '#f7c98c', '#d01d3d'], // 7 ruby
  ['#6424c4', '#ffd98c', '#4c1a98', '#f7c98c', '#7a35de'], // 8 amethyst
  ['#0e8e9a', '#fff1d6', '#0a7480', '#f3871f', '#14a7b3'], // 9 teal
  ['#ffbe94', '#ff98a8', '#e2a2d6', '#b8a4ff', '#9cc4ff'], // 10 pastel sunset
  ['#ffd3a0', '#ffadc0', '#cdb2ff', '#a8dcff', '#fff0b8'], // 11 pastel candy
  ['#f3871f', '#1c2463', '#d8281f', '#ffc22e', '#2f7bff'], // 12 ember and indigo
  ['#e0262f', '#f6efe6', '#b01a22', '#ffc22e', '#2f7bff'], // 13 circus red
];
export const PALETTE_SIZE = 5;

// Envelope patterns understood by the envelope shader.
export const PATTERN = {
  PILLS: 0, // the reference: rounded pills in two bands on alternate gores
  RIBBONS: 1, // long tapered ribbons from mouth to crown
  DIAMONDS: 2, // a band of diamonds round the equator
  GOLD: 3, // the rare golden bonus balloon
  JEWEL: 4, // solid gem-coloured gores in two shades, with trim bands
  RAINBOW: 5, // every gore a step round the colour wheel
  CHEVRON: 6, // two-tone zigzags
  SUNSET: 7, // pastel gradient from mouth to crown
  SWIRL: 8, // candy-stripe spiral round the envelope
};

// Colourways the sky is filled with, by weight. The black signature balloon
// from the reference stays the most common.
export const COLOURWAYS = [
  { name: 'signature', weight: 40, patterns: [0, 0, 1, 2], palettes: [0, 0, 1, 2, 3, 4] },
  { name: 'jewel', weight: 13, patterns: [4], palettes: [5, 6, 7, 8, 9] },
  { name: 'rainbow', weight: 10, patterns: [5], palettes: [0] },
  { name: 'chevron', weight: 13, patterns: [6], palettes: [5, 6, 7, 8, 9, 12, 13] },
  { name: 'sunset', weight: 12, patterns: [7], palettes: [10, 11] },
  { name: 'swirl', weight: 12, patterns: [8], palettes: [5, 6, 7, 8, 9, 12, 13] },
];

export function pickColourway(random = Math.random) {
  const total = COLOURWAYS.reduce((n, c) => n + c.weight, 0);
  let r = random() * total;
  let way = COLOURWAYS[0];
  for (const c of COLOURWAYS) {
    way = c;
    if ((r -= c.weight) < 0) break;
  }
  const pick = (list) => list[Math.floor(random() * list.length)];
  return { name: way.name, pattern: pick(way.patterns), palette: pick(way.palettes) };
}

export function linearColor(hex) {
  return new THREE.Color(hex); // THREE.Color converts sRGB hex to linear
}

export function glslVec3(hex, scale = 1) {
  const c = linearColor(hex);
  const f = (v) => (v * scale).toFixed(5);
  return `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`;
}

export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');
