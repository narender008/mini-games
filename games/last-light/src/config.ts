// Shared tuning and constants. World units are "art pixels": every sprite is drawn on a 1x pixel grid and
// upscaled by ART_SCALE into its texture, so 1 world unit = 1 art pixel on screen at camera zoom 1.
export const TILE = 16;
export const ART_SCALE = 3; // texels per art pixel in generated textures
export const WALL_H = 28; // how far a wall's cap is raised above its footprint (3/4 overhead view)
export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;
export const MAX_FRAME_DT = 0.1; // never simulate more than this per rendered frame (tab return, hitches)

/** Minimum visible area in art pixels; the camera zooms so at least this fits, keeping scale consistent. */
export const VIEW_MIN_W = 600;
export const VIEW_MIN_H = 340;

export const PLAYER = {
  radius: 5,
  hurtRadius: 6,
  speed: 98,
  accel: 900,
  friction: 1100,
  dashSpeed: 340,
  dashTime: 0.16,
  dashIframes: 0.24,
  dashCooldown: 0.72,
  hurtIframes: 1.0,
  baseHp: 8,
  radianceMax: 100,
  sunburstRadius: 78,
  sunburstDamage: 34,
  pickupRadius: 46,
};

/** Primary weapons. Windup / active / recovery phases are in seconds before attack-speed scaling. */
export const WEAPONS = {
  lantern: {
    name: 'Lantern Arc',
    combo: [
      { windup: 0.07, active: 0.09, recovery: 0.17, range: 30, half: 1.1, dmg: 10, knock: 120, lunge: 70, heavy: false },
      { windup: 0.06, active: 0.09, recovery: 0.17, range: 30, half: 1.1, dmg: 10, knock: 120, lunge: 70, heavy: false },
      { windup: 0.13, active: 0.11, recovery: 0.3, range: 36, half: 1.65, dmg: 22, knock: 260, lunge: 110, heavy: true },
    ],
    comboWindow: 0.32,
  },
  sunlance: {
    name: 'Sunlance',
    interval: 0.19,
    speed: 300,
    dmg: 6,
    range: 260,
    spread: 0.05,
    knock: 40,
  },
} as const;

export const COLORS = {
  amber: 0xffb347,
  amberDeep: 0xe07a1f,
  warm: 0xffd98a,
  cyan: 0x5fe0d0,
  teal: 0x2f8f86,
  magenta: 0xe04bb0,
  danger: 0xff4a3d,
  dangerHot: 0xffd0a0,
  navy: 0x0d1220,
  ambient: 0x5b6890,
};
