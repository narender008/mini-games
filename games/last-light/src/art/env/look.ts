// Each zone's environment palette, as albedo colours (0xRRGGBB) before the light map multiplies them.
// The ambient light is a cool blue at about half strength, so albedos sit in the mid range and lean a
// little warm; bright colours that must stay bright at night (flowers, water, runes, flames) also go on
// the emissive layer, which is added after the light map.
import type { Zone } from '../../sim/level/rooms';

export interface EnvLook {
  /** Flagstone ramp, dark to light. */
  stone: number[];
  grout: number;
  soil: number;
  moss: number; mossL: number;
  /** Foliage ramp, dark to light. */
  leaf: number[];
  /** Bioluminescent tint for leaf tips and veins (emissive). */
  lume: number;
  /** Flower petals (albedo) and their glow (emissive). */
  flower: number; flowerGlow: number;
  /** Second, rarer flower colour. */
  flower2: number; flower2Glow: number;
  /** Pool water: deep, mid, shallow rim, caustic glow (emissive). */
  water: number[];
  /** Wall face ramp and cap (top surface) ramp, dark to light. */
  wall: number[];
  cap: number[];
  /** Inlays, rune glow. */
  accent: number;
  /** Large stains multiplied over the floor (damp, soot). */
  stain: number;
  /** Fireflies drifting over the foliage. */
  firefly: number;
}

const base: EnvLook = {
  stone: [0x4a4c56, 0x60626c, 0x71737c, 0x83858d, 0xa0a1a7],
  grout: 0x1d1f27,
  soil: 0x2a2b2c,
  moss: 0x355847, mossL: 0x4f7a5c,
  leaf: [0x0f2a2c, 0x1a4544, 0x26605b, 0x357d72, 0x52a08e],
  lume: 0x5fe8d4,
  flower: 0xbff8ef, flowerGlow: 0x62e6d6,
  flower2: 0xd8c4ff, flower2Glow: 0x9c86ff,
  water: [0x0b3a48, 0x17707a, 0x3fb7b0, 0x7ff5e6],
  wall: [0x3e4049, 0x575963, 0x686a74, 0x7b7d86],
  cap: [0x5d5f69, 0x777982, 0x8a8c94, 0xa6a7ad],
  accent: 0xffb347,
  stain: 0x6b7a78,
  firefly: 0xffc66a,
};

export const LOOKS: Record<Zone, EnvLook> = {
  sanctum: { ...base },
  causeway: { ...base, accent: 0xffc060 },
  aqueduct: {
    ...base,
    stone: [0x464e56, 0x5b646c, 0x6b757c, 0x7d878d, 0x9aa3a7],
    wall: [0x3a434a, 0x525c63, 0x636d74, 0x768086],
    cap: [0x58626a, 0x717b82, 0x848e94, 0xa0a8ac],
    moss: 0x2f5e4c, mossL: 0x4a8566,
    leaf: [0x0c2b2f, 0x16494a, 0x206662, 0x2e857b, 0x4aa898],
    stain: 0x5f7676,
  },
  foundry: {
    ...base,
    stone: [0x4d4847, 0x645d5a, 0x766d68, 0x887e77, 0xa59a91],
    grout: 0x1f1a1a,
    soil: 0x2e2522,
    wall: [0x433d3b, 0x5b5350, 0x6c635f, 0x7f7570],
    cap: [0x635a56, 0x7c726c, 0x8f847d, 0xaaa098],
    moss: 0x4d4a33, mossL: 0x6b6440,
    leaf: [0x2a2015, 0x45331d, 0x5f4524, 0x7d5a2c, 0x9e7638],
    lume: 0xff9a4a,
    flower: 0xffd9a8, flowerGlow: 0xff8a3a,
    flower2: 0xffc8a0, flower2Glow: 0xff6a2a,
    accent: 0xff9a40,
    stain: 0x5a4a44,
    firefly: 0xff9a4a,
  },
  heart: {
    ...base,
    stone: [0x4b4858, 0x615d70, 0x726e80, 0x858193, 0xa29eae],
    wall: [0x403c4c, 0x585466, 0x696577, 0x7c788a],
    cap: [0x5f5b6d, 0x787487, 0x8b879a, 0xa6a2b3],
    leaf: [0x1c1a30, 0x2c2a4c, 0x3c3a66, 0x4e4e80, 0x6c6ea0],
    lume: 0xe04bb0,
    flower: 0xffd2f0, flowerGlow: 0xe04bb0,
    flower2: 0xc4fff5, flower2Glow: 0x62e6d6,
    accent: 0xe04bb0,
    stain: 0x6a6078,
    firefly: 0xff8ad0,
  },
};
