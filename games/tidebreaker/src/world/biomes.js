// The five seas: every colour and setting the world painters read. Values for
// sunset, storm, fog and night are taken from the concept renderer; dawn is a
// soft rose and aqua sunrise in the same style.
//   hz: horizon y; sky: gradient stops down to the horizon; stars [n, alpha, seed];
//   sun: { x, y, r, core, halo, a, sink (px it sinks over a leg) } or null;
//   clouds: lit cloud strips (see sky.js), speed = parallax factor;
//   far: distant ridge strip; mid: island set pieces (islands.js); sea: distant bands;
//   lane: the play swell; fore: foreground swells; light: what other painters use;
//   post: bloom and vignette; wx: weather amounts 0..1; dusk: the drift inside a leg.
import { mixHex } from '../util.js';

export const BIOMES = {
  dawn: {
    hz: 360,
    sky: [[0, '#3b3f8f'], [0.3, '#8a6cc4'], [0.58, '#f39ac0'], [0.8, '#ffc0a0'], [1, '#fff0c4']],
    stars: [60, 0.45, 14],
    sun: { x: 380, y: 322, r: 58, core: '#fff8dc', halo: '#ffa8a0', a: 0.95, sink: -26 },
    clouds: [
      { seed: 81, n: 9, y0: 70, y1: 160, size: 70, sy: 0.25, stretch: 1.8, top: '#6a5ab0', bot: '#ff9ab8', edge: '#ffe0b0', alpha: 0.85, speed: 0.06 },
      { seed: 82, n: 10, y0: 240, y1: 305, size: 40, sy: 0.18, stretch: 2.4, top: '#b88ad0', bot: '#ffc8a8', edge: '#fff4c8', alpha: 0.9, speed: 0.12 },
    ],
    gulls: { col: 'rgba(60,40,90,0.75)', list: [[300, 190, 9, 0], [330, 205, 7, 1], [880, 140, 10, 2], [910, 160, 7, 3], [700, 120, 6, 4], [1100, 200, 8, 5]] },
    far: { cols: [mixHex('#7a6aa8', '#ffb8a8', 0.45), mixHex('#7a6aa8', '#ffb8a8', 0.55)], h: [40, 70], rough: 0.6, seed: 91 },
    mid: { col: '#4e3a80', lit: '#ffe2a0', beam: '#fff2c8', kinds: ['isle', 'light', 'isle', 'fort'], first: 'light', lights: 0.15 },
    sea: { top: '#ffc8b4', deep: '#2a6a9a', crest: '#fff4e4', amp0: 0.5, amp1: 13, glint: '#fff0c8', glintA: 0.9, n: 18, y1: 472, sp: 0.8, seed: 21 },
    lane: { amp: 8, ph: 0.9, sp: 0.85, col: '#2e78a8', crest: '#a8f0ff', deep: '#122a5c', foam: '#ffffff', refl: '#ffd0b0', reflA: 0.12 },
    fore: { y0: 600, top: '#1f5a8f', deep: '#0c1a44', crest: '#a8f4ff', amp0: 9, amp1: 20, glint: '#ffd0c0', glintA: 0.45, sp: 1.1, seed: 25 },
    light: { rim: '#ffb8a0', sailLit: '#ffc8a8', glint: '#fff0c8', dark: 0.05, fog: 0.1 },
    post: { bloom: 0.28, vig: 0.38, vigCol: '#140a30' },
    wx: { rain: 0, lightning: 0, fog: 0.12, spores: 0 },
    dusk: { col: '#ffe8c0', a: 0.08 },
  },
  sunset: {
    hz: 352,
    sky: [[0, '#1d0f45'], [0.3, '#5a1a72'], [0.58, '#c83a78'], [0.8, '#ff7a3d'], [1, '#ffcf6b']],
    stars: [90, 0.6, 4],
    sun: { x: 800, y: 318, r: 64, core: '#fff0a6', halo: '#ff8a3a', a: 1, sink: 30 },
    clouds: [
      { seed: 11, n: 9, y0: 60, y1: 150, size: 70, sy: 0.25, stretch: 1.8, top: '#3a1660', bot: '#c2407a', edge: '#ffb36b', alpha: 0.9, speed: 0.06 },
      { seed: 12, n: 10, y0: 230, y1: 300, size: 40, sy: 0.18, stretch: 2.4, top: '#8a2c78', bot: '#ff8a52', edge: '#ffe08a', alpha: 0.95, speed: 0.12 },
    ],
    gulls: { col: 'rgba(40,10,40,0.8)', list: [[560, 150, 9, 0], [590, 170, 7, 1], [1050, 120, 10, 2], [1080, 140, 7, 3], [620, 135, 6, 4]] },
    far: { cols: [mixHex('#7a2f6e', '#ff8a5a', 0.35), mixHex('#7a2f6e', '#ff8a5a', 0.45)], h: [45, 75], rough: 0.65, seed: 3, volcano: mixHex('#5a1f5a', '#ff8a5a', 0.25) },
    mid: { col: '#3a1748', lit: '#ffcf6a', beam: '#fff2b0', kinds: ['fort', 'isle', 'light', 'isle'], first: 'fort', lights: 0.75 },
    sea: { top: '#ff9a6a', deep: '#41207a', crest: '#ffd6a0', amp0: 0.5, amp1: 14, glint: '#ffe6a0', glintA: 1, n: 18, y1: 470, sp: 1, seed: 3 },
    lane: { amp: 12, ph: 0.4, sp: 1, col: '#5b2a8f', crest: '#ff9fb0', deep: '#1a0f45', foam: '#ffe0f0', refl: '#ffb36b', reflA: 0.12 },
    fore: { y0: 600, top: '#3a1f7a', deep: '#120a33', crest: '#ff9fc8', amp0: 10, amp1: 22, glint: '#ffb38a', glintA: 0.5, sp: 1.3, seed: 5 },
    light: { rim: '#ff9a4a', sailLit: '#ff7a3a', glint: '#ffe6a0', dark: 0.2, fog: 0 },
    post: { bloom: 0.32, vig: 0.45, vigCol: '#0a0420' },
    wx: { rain: 0, lightning: 0, fog: 0, spores: 0 },
    dusk: { col: '#120630', a: 0.28 },
  },
  storm: {
    hz: 360,
    sky: [[0, '#070a1f'], [0.45, '#1a1f4f'], [0.8, '#30447a'], [1, '#4f7aa0']],
    stars: null,
    sun: null,
    glowAt: { x: 760, y: 160, r: 420, col: '#b9a8ff', a: 0.42 }, // light behind the clouds
    clouds: [
      { seed: 21, n: 14, y0: 30, y1: 210, size: 90, sy: 0.4, stretch: 1.3, top: '#1a1d40', bot: '#3a3f78', edge: '#9a7aff', alpha: 1, speed: 0.1 },
      { seed: 22, n: 10, y0: 140, y1: 270, size: 70, sy: 0.3, stretch: 1.6, top: '#232a5a', bot: '#4a4a8a', edge: '#e0d0ff', alpha: 0.95, speed: 0.2, glowFirst: true },
    ],
    gulls: null,
    far: { cols: ['#1f2a55', '#18234a'], h: [55, 85], rough: 0.9, seed: 41 },
    mid: { col: '#141d42', lit: '#ffd27a', beam: '#fff2c0', kinds: ['light', 'stacks', 'isle', 'fort'], first: 'light', lights: 0.8 },
    sea: { top: '#3f7f9a', deep: '#0a2a4a', crest: '#aef6ff', amp0: 1, amp1: 22, glint: '#d8ccff', glintA: 0.8, glintX: 760, n: 18, y1: 470, sp: 1.6, seed: 9 },
    lane: { amp: 26, ph: 1.2, sp: 1.4, col: '#156a7a', crest: '#8ff0ff', deep: '#04172e', foam: '#e0ffff', refl: '#b9a8ff', reflA: 0.06 },
    fore: { y0: 605, top: '#0f4f66', deep: '#020a1c', crest: '#9ff4ff', amp0: 16, amp1: 34, glint: '#cbb8ff', glintA: 0, sp: 1.6, seed: 8 },
    light: { rim: '#b9a8ff', sailLit: '#7fbaff', glint: '#d8ccff', dark: 0.45, fog: 0.1 },
    post: { bloom: 0.38, vig: 0.6, vigCol: '#020414' },
    wx: { rain: 1, lightning: 1, fog: 0, spores: 0 },
    dusk: { col: '#02030f', a: 0.25 },
  },
  fog: {
    hz: 370,
    sky: [[0, '#4bb3c4'], [0.5, '#a6e3d6'], [0.85, '#ffe3b8'], [1, '#ffd0a0']],
    stars: null,
    sun: { x: 980, y: 230, r: 48, core: '#fffbe8', halo: '#ffe2a8', a: 0.7, sink: 40 },
    clouds: [
      { seed: 31, n: 8, y0: 70, y1: 180, size: 80, sy: 0.25, stretch: 2, top: '#d8fff4', bot: '#9ad8d0', alpha: 0.7, speed: 0.06 },
    ],
    gulls: { col: 'rgba(30,70,80,0.55)', list: [[420, 160, 8, 0], [450, 178, 6, 1], [760, 130, 7, 2]] },
    far: { cols: [mixHex('#3f8f8f', '#cfeee0', 0.6), mixHex('#3f8f8f', '#cfeee0', 0.7)], h: [80, 125], rough: 0.9, seed: 51 },
    mid: { col: mixHex('#2a6f72', '#cfeee0', 0.35), lit: '#fff0b0', beam: '#fffbe0', kinds: ['stacks', 'stacks', 'light', 'stacks'], first: 'stacks', lights: 0.3 },
    sea: { top: '#bfeee0', deep: '#1f7f86', crest: '#ffffff', amp0: 0.6, amp1: 12, glint: '#fff6d8', glintA: 0.6, n: 18, y1: 480, sp: 0.7, seed: 13 },
    lane: { amp: 7, ph: 2.2, sp: 0.8, col: '#1f8f8f', crest: '#b8fff0', deep: '#0b3f52', foam: '#ffffff', refl: '#fff6d8', reflA: 0.08 },
    fore: { y0: 615, top: '#1f8f8f', deep: '#07303f', crest: '#d8fff4', amp0: 10, amp1: 22, glint: '#fff6d8', glintA: 0, sp: 0.8, seed: 14 },
    light: { rim: '#fff0c8', sailLit: '#ffe6b8', glint: '#fff6d8', dark: 0, fog: 0.75 },
    post: { bloom: 0.22, vig: 0.35, vigCol: '#0a2a30' },
    wx: { rain: 0, lightning: 0, fog: 1, spores: 0 },
    fogBands: [
      { y: 340, h: 60, col: '#effff8', a: 0.7, seed: 3, n: 22, speed: 0.2, z: 'back' },
      { y: 440, h: 60, col: '#e8fff6', a: 0.55, seed: 4, n: 20, speed: 0.55, z: 'mid' },
      { y: 610, h: 80, col: '#f2fffa', a: 0.45, seed: 7, n: 18, speed: 1.2, z: 'front' },
      { y: 700, h: 60, col: '#ffffff', a: 0.3, seed: 8, n: 12, speed: 1.5, z: 'front' },
    ],
    dusk: { col: '#2a5a6a', a: 0.12 },
  },
  night: {
    hz: 380,
    sky: [[0, '#0a0624'], [0.4, '#2a0d52'], [0.75, '#8a1a6a'], [1, '#ff4a6a']],
    stars: [220, 0.9, 7],
    aurora: true,
    sun: { x: 1060, y: 150, r: 70, core: '#ffb8a0', halo: '#ff3a5a', a: 0.9, sink: -24, moon: true },
    clouds: [
      { seed: 61, n: 10, y0: 180, y1: 300, size: 60, sy: 0.2, stretch: 2.2, top: '#2a0d4a', bot: '#a01f5a', edge: '#ff7a8a', alpha: 0.9, speed: 0.08, fadeTop: 0.7 },
    ],
    gulls: null,
    far: { cols: ['#2a0e44', '#3a1250'], h: [25, 45], rough: 0.8, seed: 71 },
    mid: { col: '#1c0a30', lit: '#ff6a8a', beam: '#ff9ab0', kinds: ['stacks', 'none', 'stacks', 'none', 'none'], first: 'none', lights: 1, scale: 0.55 },
    sea: { top: '#ff5a7a', deep: '#1a0a40', crest: '#ffb0c8', amp0: 1, amp1: 16, glint: '#ffb0a0', glintA: 0.8, n: 16, y1: 480, sp: 1.2, seed: 61 },
    lane: { amp: 14, ph: 0.2, sp: 1.2, col: '#3a1a7a', crest: '#ff7ab8', deep: '#0a0628', foam: '#ffd0f0', refl: '#ff7a9a', reflA: 0.1 },
    fore: { y0: 625, top: '#2a1260', deep: '#05031a', crest: '#ff8ac8', amp0: 12, amp1: 26, glint: '#ffb0a0', glintA: 0.3, sp: 1.3, seed: 66 },
    light: { rim: '#ff5a8a', sailLit: '#ff6a9a', glint: '#3affe0', dark: 0.55, fog: 0.05 },
    post: { bloom: 0.4, vig: 0.55, vigCol: '#05021a' },
    wx: { rain: 0, lightning: 0, fog: 0, spores: 1 },
    dusk: { col: '#05021a', a: 0.15 },
  },
};
export const BIOME_IDS = Object.keys(BIOMES);
