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

// Envelope palettes: five colours per palette, laid round the balloon on
// alternating gores. Palette 0 is the reference balloon: red, orange,
// violet, orange, electric blue.
export const PALETTES = [
  ['#d8281f', '#f3871f', '#8540f2', '#f3871f', '#2f7bff'],
  ['#ffbf2e', '#ff6d18', '#e2301f', '#d62f76', '#ff8f1f'],
  ['#2a6bff', '#7a36ff', '#1eb8ff', '#b534ff', '#3f8cff'],
  ['#8540f2', '#2f7bff', '#ffc22e', '#d8281f', '#f3871f'],
  ['#f3871f', '#ffc22e', '#f3871f', '#d8281f', '#ffc22e'],
];
export const PALETTE_SIZE = 5;

// Envelope patterns understood by the envelope shader.
export const PATTERN = {
  PILLS: 0, // the reference: rounded pills in two bands on alternate gores
  RIBBONS: 1, // long tapered ribbons from mouth to crown
  DIAMONDS: 2, // a band of diamonds round the equator
  GOLD: 3, // the rare golden bonus balloon
};

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
