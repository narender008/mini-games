// The looks for each time of day. Every value here blends smoothly into the
// next preset (setTime eases all of them together), so a change of time is
// a gentle time-lapse, never a cut.
//
// Directions are [azimuth, elevation] in degrees; azimuth 0 is straight
// behind the garden (-z, away from the camera), positive towards +x (right).
import * as THREE from 'three';

// A colour (sRGB hex) as linear rgb times k.
const _c = new THREE.Color();
function rgb(hex, k = 1) {
  _c.set(hex);
  return [_c.r * k, _c.g * k, _c.b * k];
}

const DAY = {
  moon: [40, 38],
  turb: 1.4, // haze: 1 is very clear
  mieG: 0.78, // how tightly the haze glows round the sun
  sky: 3.2, // sky brightness (scattering strength) relative to the sun
  sat: 1.3, // sky saturation
  ms: 0, // extra even glow from light scattered many times
  tint: [1, 1, 1],
  glow: [0, 0, 0], // twilight glow towards the sun
  belt: [0, 0, 0], // pink band opposite the sun
  nightZen: [0, 0, 0],
  nightHor: [0, 0, 0],
  sunDisc: 14,
  moonE: 0, // moonlight in the sky (scattering)
  moonDisc: 0,
  moonGlow: 0,
  stars: 0,
  night: 0,
  moonKey: 0, // 0: the key light is the sun, 1: the moon
  key: 1, // sun key light scale
  keyMinEl: 6, // lowest the key light goes (shadows need a light above the ground)
  keySat: 0.85, // colour of the key light: < 1 whiter, > 1 warmer than the physical sun
  moonKeyI: 0,
  env: 0.5, // environment (sky) light
  hemi: 0.15, // hemisphere fill, as a fraction of the sky's own light
  exposure: 1,
  bloom: 0.25,
  clouds: 0.42,
  cloudOpacity: 0.95,
  cirrus: 0.35,
  cloudLit: 1, // sunlight on clouds
  cloudSat: 1, // warmth of that light (1 = physical)
  cloudAmb: 0.75, // skylight on clouds
  fog: 0.008,
  fogGain: 0.4,
  fogSky: 0.35, // how far the haze leans from the horizon's colour to the whole sky's
  shadowRadius: 1.6,
  shadowIntensity: 1,
};

export const PRESETS = {
  // fresh and clear: sun front-right, crisp shadows running back-left
  morning: {
    ...DAY,
    sun: [128, 30],
    turb: 1.25,
    tint: [0.97, 1, 1.04],
    key: 0.92,
    keySat: 0.7,
    exposure: 1.5,
    bloom: 0.18,
    clouds: 0.38,
    fog: 0.008,
    shadowRadius: 1.2,
  },
  // the hero look: low warm sun behind-left, backlit flowers, long shadows
  // running towards the camera, a cool blue sky filling the shadows
  golden: {
    ...DAY,
    sun: [-34.5, 12.75],
    turb: 1.45,
    mieG: 0.84,
    tint: [1.04, 0.98, 0.95],
    glow: rgb('#ffb06a', 0.3), // warm haze low towards the sun
    key: 1.07,
    keySat: 1.25,
    exposure: 2,
    bloom: 0.32,
    clouds: 0.4,
    cirrus: 0.45,
    cloudLit: 0.85,
    cloudSat: 1.7,
    cloudAmb: 0.5,
    fog: 0.009,
    fogGain: 0.38,
    env: 0.62,
    shadowRadius: 2,
  },
  // the sun has just set: apricot horizon, violet-blue above, very soft light
  dusk: {
    ...DAY,
    sun: [-44, -2.4],
    moon: [48, 14],
    turb: 2,
    mieG: 0.78,
    sky: 12,
    tint: [0.92, 0.9, 1.32],
    glow: rgb('#ffa56b', 0.2),
    belt: rgb('#f0a6c0', 0.07),
    nightZen: rgb('#2a44a8', 0.07),
    nightHor: rgb('#4a3f78', 0.06),
    sunDisc: 0,
    moonDisc: 0.45,
    moonGlow: 0.01,
    stars: 0.08,
    night: 0.45,
    key: 0.26,
    keyMinEl: 4,
    keySat: 0.45,
    env: 2.2,
    hemi: 0.4,
    exposure: 1.8,
    bloom: 0.4,
    clouds: 0.1,
    cloudOpacity: 0.85,
    cirrus: 0.75,
    cloudLit: 2.5,
    cloudSat: 1.3,
    cloudAmb: 1.8,
    fog: 0.01,
    fogGain: 0.42,
    fogSky: 0.75,
    shadowRadius: 3,
    shadowIntensity: 0.55,
  },
  // calm moonlit night: deep blue sky, stars, a bright moon, cool key light
  night: {
    ...DAY,
    sun: [-60, -28],
    moon: [40, 38],
    turb: 1.5,
    sky: 0,
    ms: 0.06,
    tint: [0.9, 0.95, 1.1],
    nightZen: rgb('#0e1c4a', 0.07),
    nightHor: rgb('#27406e', 0.06),
    sunDisc: 0,
    moonE: 0.6,
    moonDisc: 1,
    moonGlow: 0.012,
    stars: 1,
    night: 1,
    moonKey: 1,
    key: 0,
    moonKeyI: 0.7,
    env: 2.4,
    hemi: 0.6,
    exposure: 1.75,
    bloom: 0.6,
    clouds: 0.22,
    cloudOpacity: 0.75,
    cirrus: 0.2,
    cloudLit: 1,
    cloudAmb: 1.6,
    fog: 0.011,
    fogGain: 0.9,
    shadowRadius: 2.6,
    shadowIntensity: 0.7,
  },
};

export const TIME_IDS = Object.keys(PRESETS);

// Copies preset `p` into the flat working set `out` (angles as numbers).
export function flatten(p, out = {}) {
  for (const [k, v] of Object.entries(p)) {
    if (k === 'sun' || k === 'moon') {
      out[k + 'Az'] = v[0];
      out[k + 'El'] = v[1];
    } else out[k] = Array.isArray(v) ? v.slice() : v;
  }
  return out;
}

// Values that stand in for the sun once it has gone: going towards night
// they arrive early, going towards day they leave late, so a blend never
// dips darker than either end.
const NIGHTISH = new Set(['nightZen', 'nightHor', 'moonE', 'moonKeyI', 'moonDisc', 'moonGlow', 'env', 'hemi', 'exposure', 'cloudAmb', 'fogGain']);

// out = a + (b - a) * k for every value; azimuths go the short way round.
export function blend(a, b, k, out) {
  const kn = b.night > a.night ? 1 - (1 - k) * (1 - k) : b.night < a.night ? k * k : k;
  for (const key of Object.keys(b)) {
    const va = a[key];
    const vb = b[key];
    const kk = NIGHTISH.has(key) ? kn : k;
    if (Array.isArray(vb)) {
      if (!out[key]) out[key] = vb.slice();
      for (let i = 0; i < vb.length; i++) out[key][i] = va[i] + (vb[i] - va[i]) * kk;
    } else if (key.endsWith('Az')) {
      let d = vb - va;
      d -= Math.round(d / 360) * 360;
      out[key] = va + d * kk;
    } else out[key] = va + (vb - va) * kk;
  }
  return out;
}

export function copyFlat(src, out = {}) {
  for (const [k, v] of Object.entries(src)) out[k] = Array.isArray(v) ? v.slice() : v;
  return out;
}
