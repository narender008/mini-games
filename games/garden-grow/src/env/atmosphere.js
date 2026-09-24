// The physics behind the sky: a thin shell of air round a round Earth, with
// Rayleigh scattering (the blue), Mie scattering from haze (the white glow
// round the sun and the pale horizon) and ozone (which keeps the twilight
// sky blue instead of grey). Light is marched along each view ray in a few
// steps; the sunlight reaching each step uses Schüler's closed form of the
// Chapman function, so it stays cheap enough to run per vertex of the dome.
//
// The same model runs in GLSL (ATMOSPHERE_GLSL, used by sky/dome.js) and in
// JavaScript (scatter, transmittance, skyRadiance), so the sun colour, fog,
// fill light and cloud light always match the sky you see.

const EARTH_R = 6360e3;
const TOP_R = 6460e3;
const VIEW_R = EARTH_R + 60; // the garden sits a little above sea level
const H_R = 8000; // scale heights (m)
const H_M = 1200;
const BETA_R = [5.802e-6, 13.558e-6, 33.1e-6]; // per metre, for 680 / 550 / 440 nm
const BETA_M = 3.996e-6; // haze scattering at turbidity 1
const MIE_EXT = 1.11; // haze extinction / scattering
const OZONE = 1.8; // ozone column relative to the Rayleigh column
const BETA_O = [0.65e-6 * OZONE, 1.881e-6 * OZONE, 0.085e-6 * OZONE];
const STEPS = 16;
const HALF_PI = Math.PI / 2;

export const CLOUD_ALT = 1600; // cumulus base (m)
export const CIRRUS_ALT = 8000;

const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const v3 = (a) => `vec3(${a.map(f).join(', ')})`;

export const ATMOSPHERE_GLSL = /* glsl */ `
#define A_EARTH ${f(EARTH_R)}
#define A_TOP ${f(TOP_R)}
#define A_VIEW ${f(VIEW_R)}
#define A_HR ${f(H_R)}
#define A_HM ${f(H_M)}
#define A_MIE_EXT ${f(MIE_EXT)}
#define A_STEPS ${STEPS}
const vec3 A_BETA_R = ${v3(BETA_R)};
const vec3 A_BETA_RO = ${v3(BETA_R.map((b, i) => b + BETA_O[i]))};
const float A_BETA_M = ${f(BETA_M)};

// Air column (metres at ground density) from radius r along a direction
// with cosine mu to the local zenith, for a layer of scale height H.
float aColumn(float r, float mu, float H) {
  float x = r / H;
  float e = exp((A_EARTH - r) / H);
  float c = sqrt(${f(HALF_PI)} * x);
  if (mu >= 0.0) return H * e * c / ((c - 1.0) * mu + 1.0);
  float s = sqrt(max(0.0, 1.0 - mu * mu));
  return H * (2.0 * exp(min(0.0, (A_EARTH - r * s) / H)) * sqrt(${f(HALF_PI)} * x * s) - e * c / ((c - 1.0) * -mu + 1.0));
}
// 0 inside the Earth's shadow, with a soft edge (the sun is a disc).
float aLit(float r, float mu) {
  if (mu >= 0.0) return 1.0;
  return smoothstep(-2500.0, 1500.0, r * sqrt(max(0.0, 1.0 - mu * mu)) - A_EARTH);
}
// In-scattered light towards the viewer along direction d (y >= 0), per unit
// of sun (rs, ms) and moon (rm, mm) irradiance, without the phase functions,
// and the transmittance of the whole path (tv).
void aScatter(vec3 d, vec3 sunDir, vec3 moonDir, float turb, bool moon,
    out vec3 rs, out vec3 ms, out vec3 rm, out vec3 mm, out vec3 tv) {
  float mu = d.y;
  float r0 = A_VIEW;
  float tMax = -r0 * mu + sqrt(r0 * r0 * mu * mu + (A_TOP - r0) * (A_TOP + r0));
  float bm = A_BETA_M * turb * A_MIE_EXT;
  float odR = 0.0;
  float odM = 0.0;
  float ds = dot(d, sunDir);
  float dm = dot(d, moonDir);
  rs = vec3(0.0); ms = vec3(0.0); rm = vec3(0.0); mm = vec3(0.0);
  for (int i = 0; i < A_STEPS; i++) {
    float s0 = float(i) / float(A_STEPS);
    float s1 = float(i + 1) / float(A_STEPS);
    float t0 = tMax * s0 * s0;
    float t1 = tMax * s1 * s1;
    float dt = t1 - t0;
    float t = 0.5 * (t0 + t1);
    float r = sqrt(r0 * r0 + t * t + 2.0 * r0 * t * mu);
    float pR = exp((A_EARTH - r) / A_HR);
    float pM = exp((A_EARTH - r) / A_HM);
    float vR = odR + pR * dt * 0.5;
    float vM = odM + pM * dt * 0.5;
    odR += pR * dt;
    odM += pM * dt;
    float muS = (r0 * sunDir.y + t * ds) / r;
    vec3 T = exp(-(A_BETA_RO * (vR + aColumn(r, muS, A_HR)) + bm * (vM + aColumn(r, muS, A_HM)))) * aLit(r, muS);
    rs += pR * T * dt;
    ms += pM * T * dt;
    if (moon) {
      float muM = (r0 * moonDir.y + t * dm) / r;
      vec3 Tm = exp(-(A_BETA_RO * (vR + aColumn(r, muM, A_HR)) + bm * (vM + aColumn(r, muM, A_HM)))) * aLit(r, muM);
      rm += pR * Tm * dt;
      mm += pM * Tm * dt;
    }
  }
  rs *= A_BETA_R;
  rm *= A_BETA_R;
  ms *= A_BETA_M * turb;
  mm *= A_BETA_M * turb;
  tv = exp(-(A_BETA_RO * odR + bm * odM));
}
`;

export const PHASE_GLSL = /* glsl */ `
float aPhaseR(float mu) { return 0.0596831 * (1.0 + mu * mu); }
float aPhaseM(float mu, float g) {
  float g2 = g * g;
  return 0.1193662 * (1.0 - g2) * (1.0 + mu * mu) / ((2.0 + g2) * pow(max(1e-4, 1.0 + g2 - 2.0 * g * mu), 1.5));
}
// Henyey-Greenstein, scaled so an even spread is 1 (for cloud light).
float aHG(float mu, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1e-4, 1.0 + g2 - 2.0 * g * mu), 1.5);
}
`;

// ------------------------------------------------------------ JavaScript twin

function column(r, mu, H) {
  const x = r / H;
  const e = Math.exp((EARTH_R - r) / H);
  const c = Math.sqrt(HALF_PI * x);
  if (mu >= 0) return (H * e * c) / ((c - 1) * mu + 1);
  const s = Math.sqrt(Math.max(0, 1 - mu * mu));
  return H * (2 * Math.exp(Math.min(0, (EARTH_R - r * s) / H)) * Math.sqrt(HALF_PI * x * s) - (e * c) / ((c - 1) * -mu + 1));
}

function smoothstep(a, b, v) {
  const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

function lit(r, mu) {
  if (mu >= 0) return 1;
  return smoothstep(-2500, 1500, r * Math.sqrt(Math.max(0, 1 - mu * mu)) - EARTH_R);
}

export function phaseR(mu) {
  return 0.0596831 * (1 + mu * mu);
}

export function phaseM(mu, g) {
  const g2 = g * g;
  return (0.1193662 * (1 - g2) * (1 + mu * mu)) / ((2 + g2) * Math.pow(Math.max(1e-4, 1 + g2 - 2 * g * mu), 1.5));
}

// Transmittance of sunlight arriving at `alt` metres from a direction whose
// cosine to the zenith is `mu` (writes rgb into out[0..2]).
export function transmittance(alt, mu, turb, out) {
  const r = EARTH_R + alt;
  const cR = column(r, mu, H_R);
  const cM = column(r, mu, H_M);
  const vis = lit(r, mu);
  const bm = BETA_M * turb * MIE_EXT;
  for (let c = 0; c < 3; c++) out[c] = Math.exp(-((BETA_R[c] + BETA_O[c]) * cR + bm * cM)) * vis;
  return out;
}

const _acc = { rs: [0, 0, 0], ms: [0, 0, 0], rm: [0, 0, 0], mm: [0, 0, 0] };

// JavaScript twin of aScatter. d, sun, moon are {x, y, z} unit vectors.
// Fewer `steps` is a little less exact but quicker (fill-light averages).
export function scatter(d, sun, moon, turb, withMoon, out, steps = STEPS) {
  const mu = d.y;
  const r0 = VIEW_R;
  const tMax = -r0 * mu + Math.sqrt(r0 * r0 * mu * mu + (TOP_R - r0) * (TOP_R + r0));
  const bm = BETA_M * turb * MIE_EXT;
  let odR = 0;
  let odM = 0;
  const ds = d.x * sun.x + d.y * sun.y + d.z * sun.z;
  const dm = d.x * moon.x + d.y * moon.y + d.z * moon.z;
  const { rs, ms, rm, mm } = _acc;
  rs.fill(0);
  ms.fill(0);
  rm.fill(0);
  mm.fill(0);
  for (let i = 0; i < steps; i++) {
    const s0 = i / steps;
    const s1 = (i + 1) / steps;
    const t0 = tMax * s0 * s0;
    const t1 = tMax * s1 * s1;
    const dt = t1 - t0;
    const t = 0.5 * (t0 + t1);
    const r = Math.sqrt(r0 * r0 + t * t + 2 * r0 * t * mu);
    const pR = Math.exp((EARTH_R - r) / H_R);
    const pM = Math.exp((EARTH_R - r) / H_M);
    const vR = odR + pR * dt * 0.5;
    const vM = odM + pM * dt * 0.5;
    odR += pR * dt;
    odM += pM * dt;
    const muS = (r0 * sun.y + t * ds) / r;
    let cR = column(r, muS, H_R);
    let cM = column(r, muS, H_M);
    let vis = lit(r, muS);
    for (let c = 0; c < 3; c++) {
      const T = Math.exp(-((BETA_R[c] + BETA_O[c]) * (vR + cR) + bm * (vM + cM))) * vis;
      rs[c] += pR * T * dt;
      ms[c] += pM * T * dt;
    }
    if (withMoon) {
      const muM = (r0 * moon.y + t * dm) / r;
      cR = column(r, muM, H_R);
      cM = column(r, muM, H_M);
      vis = lit(r, muM);
      for (let c = 0; c < 3; c++) {
        const T = Math.exp(-((BETA_R[c] + BETA_O[c]) * (vR + cR) + bm * (vM + cM))) * vis;
        rm[c] += pR * T * dt;
        mm[c] += pM * T * dt;
      }
    }
  }
  for (let c = 0; c < 3; c++) {
    out.rs[c] = rs[c] * BETA_R[c];
    out.ms[c] = ms[c] * BETA_M * turb;
    out.rm[c] = rm[c] * BETA_R[c];
    out.mm[c] = mm[c] * BETA_M * turb;
    out.tv[c] = Math.exp(-((BETA_R[c] + BETA_O[c]) * odR + bm * odM));
  }
  return out;
}
