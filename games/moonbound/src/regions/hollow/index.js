// The Hollow, Maelis's refuge (the home base). Same shape as a region module
// so the room builder and renderer treat it alike; hollow.js runs it.
import { LOOK, FLOOR } from './look.js';
import { HOLLOW_LAYOUT } from './layout.js';

export const HOLLOW = {
  id: 'hollow',
  name: 'The Hollow',
  subtitle: 'Beneath the Elder Yew',
  music: 'hollow',
  cliffInset: 0.85, // hidden under the floor's crumbling edge
  cliffLip: 0,
  sets: ['hollow'],
  look: LOOK,
  floor: { floorSrc: FLOOR.src, floorFn: FLOOR.fn, colors: FLOOR.colors, params: new Float32Array(FLOOR.params.flat()) },
  kit: {
    far: null,
    gateClosed: 'ho_gate_closed',
    gateOpen: 'ho_gate_open',
  },
  lights: {
    cauldron: { c: [0.9, 2.2, 1.1], r: 9, z: 1.3, flicker: 0.25 },
    lantern: { c: [2.0, 1.2, 0.5], r: 6.5, z: 2.0, flicker: 0.35 },
    candles: { c: [2.6, 1.4, 0.5], r: 6, z: 0.6, flicker: 0.8, flame: 3, fs: 0.07 },
    candle: { c: [2.0, 1.1, 0.4], r: 4.5, z: 1.1, flicker: 0.8, flame: 3, fs: 0.06 },
    hearth: { c: [2.4, 1.0, 0.35], r: 6.5, z: 0.6, flicker: 0.7 },
    lectern: { c: [1.6, 1.2, 0.7], r: 4.5, z: 1.3, flicker: 0.5 },
    potions: { c: [0.6, 0.9, 1.2], r: 3, z: 1.2, flicker: 0.15 },
    fungiTeal: { c: [0.2, 1.0, 0.8], r: 2.8, z: 0.3, flicker: 0.1 },
    fungiViolet: { c: [0.8, 0.4, 1.2], r: 2.8, z: 0.3, flicker: 0.1 },
  },
  layout: HOLLOW_LAYOUT,
};
