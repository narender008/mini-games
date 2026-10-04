// GLSL for every pass. All lit passes share the Frame uniform block: the
// camera, the sun and sky light, haze, and up to 32 point lights (muzzle
// flashes, fireballs, burning wrecks, napalm), so a blast lights the ground,
// the tanks and the smoke around it alike.

export const MAX_LIGHTS = 32;

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(std140) uniform Frame {
  vec4 uView;   // camera centre x,y; clip units per metre x,y
  vec4 uRotT;   // camera roll cos,sin; time; metres per pixel
  vec4 uSun;    // direction towards the sun (xyz), sun height in the sky 0..1
  vec4 uSunCol; // sun colour * intensity
  vec4 uSky;    // ambient from above
  vec4 uGround; // ambient from below (bounce)
  vec4 uFog;    // haze colour, density
  vec4 uWorld;  // world width, height, texels per metre, light count
  vec4 uL[${MAX_LIGHTS * 2}];
};
`;

// world <-> clip, with the camera's shake roll
const VIEW = `
vec4 toClip(vec2 w) {
  vec2 d = w - uView.xy;
  d = vec2(d.x * uRotT.x - d.y * uRotT.y, d.x * uRotT.y + d.y * uRotT.x);
  return vec4(d * uView.zw, 0.0, 1.0);
}
vec2 toWorld(vec2 clip) {
  vec2 d = clip / uView.zw;
  d = vec2(d.x * uRotT.x + d.y * uRotT.y, -d.x * uRotT.y + d.y * uRotT.x);
  return uView.xy + d;
}
`;

const HASH = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

const LIGHT = `
vec3 shade(vec3 alb, vec3 n, vec2 wp, float sunVis, float lightBoost) {
  float up = n.y * 0.5 + 0.5;
  vec3 c = alb * mix(uGround.rgb, uSky.rgb, up) * (0.62 + 0.38 * n.z);
  c += alb * uSunCol.rgb * max(dot(n, uSun.xyz), 0.0) * sunVis;
  int nl = int(uWorld.w);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= nl) break;
    vec4 p = uL[i * 2];
    vec3 d = vec3(p.xy - wp, p.z);
    float d2 = dot(d, d);
    if (d2 > p.w * p.w) continue;
    vec4 col = uL[i * 2 + 1];
    float dist = sqrt(d2);
    float att = 1.0 - dist / p.w;
    att *= att;
    float ndl = (dot(n, d / dist) + col.w) / (1.0 + col.w);
    c += alb * col.rgb * att * max(ndl, 0.0) * lightBoost;
  }
  return c;
}
${HASH}`;

const FULL_VS = `${HEAD}${VIEW}
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vClip;
out vec2 vWorld;
out vec2 vUV;
void main() {
  vec2 p = P[gl_VertexID];
  vClip = p;
  vWorld = toWorld(p);
  vUV = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// ---------------------------------------------------------------- sky
// Gradient from a bright horizon band to the zenith, the sun or a moon with
// craters, stars and a faint milky way at night, two cloud decks (cumulus,
// cirrus) and an optional overcast that greys the whole sky.
export const SKY = {
  vs: FULL_VS,
  fs: `${HEAD}${HASH}
in vec2 vClip;
in vec2 vWorld;
uniform sampler2D uNoise;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
uniform vec2 uSunPos;   // sun position in sky space (x across, y up), aspect corrected
uniform vec4 uCloud;    // cover 0..1, darkness, speed, scale
uniform vec3 uCloudCol;
uniform float uStars;
uniform float uAspect;
uniform vec4 uSkyA;     // disc radius, 1 = moon, overcast 0..1, horizon band
uniform vec4 uSkyB;     // cirrus 0..1, star brightness, milky way, sun rays
out vec4 o;
float fbm4(vec2 p) {
  float a = 0.0, w = 0.5;
  for (int i = 0; i < 4; i++) {
    a += w * texture(uNoise, p).r;
    p = p * 2.03 + vec2(0.17, 0.31);
    w *= 0.5;
  }
  return a / 0.9375;
}
void main() {
  // sky space: mostly fixed to the screen, drifting a little with the camera
  vec2 s = vec2(vClip.x * uAspect, vClip.y) + vec2(uView.x * 0.0015, (uView.y - 40.0) * 0.004);
  float hh = clamp((s.y + 0.2) / 1.3, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, pow(hh, 0.62));
  c += uHorizon * uSkyA.w * exp(-hh * 5.5);
  vec2 ds = s - uSunPos;
  float sd = length(ds);
  float moon = step(0.5, uSkyA.y);
  // glow around the sun or moon, with rays when the sun is low
  c += uSunGlow * (exp(-sd * 3.2) * 0.55 + exp(-sd * 14.0) * 1.3);
  if (uSkyB.w > 0.0) {
    float ang = atan(ds.y, ds.x) * 0.15915494 + 0.5;
    float ray = texture(uNoise, vec2(ang * 3.0, 0.31)).g * texture(uNoise, vec2(ang * 7.0, 0.62)).b;
    c += uSunGlow * ray * exp(-sd * 1.6) * uSkyB.w * 0.9;
  }
  // stars, milky way
  if (uStars > 0.0) {
    vec2 g = floor(s * 260.0);
    vec2 f = fract(s * 260.0);
    float st = hash12(g);
    vec2 sp = vec2(0.2 + 0.6 * hash12(g + 3.7), 0.2 + 0.6 * hash12(g + 9.1));
    float tw = 0.65 + 0.35 * sin(uRotT.z * (1.5 + 3.0 * st) + st * 40.0);
    float br = smoothstep(0.9955, 1.0, st);
    float star = smoothstep(0.34, 0.0, length(f - sp)) * br * tw;
    float vis = uStars * smoothstep(0.08, 0.5, hh);
    c += vec3(0.8, 0.86, 1.0) * star * vis * (1.3 + 3.0 * hash12(g + 1.3)) * uSkyB.y;
    // the milky way: a faint slanted band
    float band = exp(-pow((s.y - s.x * 0.5 - 0.35) * 2.4, 2.0));
    float mw = band * (0.3 + 0.9 * texture(uNoise, s * 0.7 + 0.3).g) * (0.5 + texture(uNoise, s * 1.3).r);
    c += vec3(0.5, 0.58, 0.8) * mw * 0.06 * uSkyB.z * vis;
  }
  // the disc
  if (uSkyA.x > 0.0) {
    float disc = smoothstep(uSkyA.x, uSkyA.x * 0.93, sd);
    if (moon > 0.5) {
      vec2 md = ds / uSkyA.x;
      float z = sqrt(max(1.0 - dot(md, md), 0.0));
      vec3 nm = vec3(md, z);
      float ph = clamp(dot(nm, normalize(vec3(-0.5, 0.3, 0.8))) * 1.3 + 0.28, 0.0, 1.0);
      vec4 mn = texture(uNoise, md * 0.28 + 0.5);
      vec4 mn2 = texture(uNoise, md * 0.9 + 0.2);
      float maria = smoothstep(0.46, 0.62, mn.r) * 0.5;
      float crat = smoothstep(0.55, 0.9, mn2.a) * 0.22 * (0.5 + 0.5 * mn2.g);
      vec3 mc = vec3(0.88, 0.92, 1.0) * (0.4 + 0.6 * ph) * (1.0 - maria - crat) * 2.6;
      c = mix(c, mc, disc);
    } else {
      c += uSunGlow * disc * 14.0;
    }
  }
  // cirrus: thin streaks stretched across
  vec2 cp = s * uCloud.w + vec2(uRotT.z * uCloud.z, 0.0);
  if (uSkyB.x > 0.0) {
    vec2 q = vec2(cp.x * 0.18, cp.y * 0.9);
    float ci = texture(uNoise, q).g * 0.6 + texture(uNoise, q * vec2(2.3, 3.1) + 0.4).b * 0.4;
    float cm = smoothstep(0.52, 0.8, ci) * uSkyB.x * smoothstep(0.15, 0.7, hh);
    c = mix(c, uCloudCol * 1.1 + uSunGlow * exp(-sd * 2.5) * 0.4, cm * 0.5);
  }
  // cumulus, lit from the sun side
  float cloudCov = 0.0;
  if (uCloud.x > 0.0) {
    vec2 cq = cp;
    cq.y *= 2.4;
    float d = fbm4(cq * 0.25);
    float cov = smoothstep(1.0 - uCloud.x, 1.0 - uCloud.x + 0.3, d);
    float lit = clamp(0.5 + (fbm4(cq * 0.25 + normalize(uSunPos - s) * 0.02) - d) * -6.0, 0.0, 1.0);
    vec3 cc = uCloudCol * mix(1.0 - uCloud.y, 1.0, lit) + uSunGlow * exp(-sd * 4.0) * 0.6 * lit;
    float cv = cov * smoothstep(-0.2, 0.4, hh);
    c = mix(c, cc, cv);
    cloudCov = cv;
  }
  // overcast: a low flat deck that greys everything and thickens up high
  if (uSkyA.z > 0.0) {
    float od = texture(uNoise, cp * 0.07 + 0.2).r * 0.65 + texture(uNoise, cp * 0.23).g * 0.35;
    vec3 oc = uCloudCol * (0.78 + 0.45 * od) + uSunGlow * exp(-sd * 2.2) * 0.35;
    c = mix(c, oc, uSkyA.z * (0.72 + 0.28 * smoothstep(0.1, 0.8, hh)));
  }
  o = vec4(c, 1.0);
}`,
};

// ---------------------------------------------------------------- backdrop
// (the layers are baked by gl/bake.js)
// Each layer is lit by the sky, sinks into haze towards its ground line (and
// below it), and bright texels (lit windows, fires, flares) glow on their own.
export const BACKDROP = {
  vs: `${HEAD}
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
uniform vec4 uLayer;   // parallax, zoom factor, layer width, layer height (m)
uniform vec2 uAnchor;  // layer-space y of the world's y = 0, x offset
out vec2 vL;
out vec2 vClip;
void main() {
  vec2 p = P[gl_VertexID];
  vClip = p;
  // layer camera: moves and zooms only partly with the world camera
  vec2 half_ = vec2(1.0 / uView.z, 1.0 / uView.w);
  float k = uLayer.y;
  vec2 c = vec2(uView.x * uLayer.x + uAnchor.y, uAnchor.x + (uView.y) * uLayer.x);
  vL = c + p * half_ * k;
  gl_Position = vec4(p, 0.0, 1.0);
}`,
  fs: `${HEAD}${HASH}
in vec2 vL;
in vec2 vClip;
uniform sampler2D uTex;
uniform vec4 uLayer;
uniform vec4 uHaze;    // haze colour, amount
uniform float uLightK; // how much nearby blasts light this layer
uniform vec4 uMist;    // ground line (v), height falloff, extra haze at the ground line, sinking into haze below it
uniform vec4 uEmit;    // glow scale (0 = none), flicker, heat shimmer, unused
out vec4 o;
vec2 toWorldApprox(vec2 clip) { return uView.xy + clip / uView.zw; }
void main() {
  vec2 uv = vec2(vL.x / uLayer.z, vL.y / uLayer.w);
  float hv = uv.y - uMist.x;
  if (uEmit.z > 0.0) {
    // heat shimmer: the horizon wobbles
    float env = exp(-abs(hv) * 14.0);
    uv.x += uEmit.z * env * (sin(vL.y * 3.1 + uRotT.z * 1.9 + vL.x * 0.05) + 0.6 * sin(vL.y * 7.3 - uRotT.z * 2.7)) / uLayer.z;
    uv.y += uEmit.z * env * 0.5 * sin(vL.x * 0.35 + uRotT.z * 1.3) / uLayer.w;
  }
  vec4 t = texture(uTex, uv);
  // below the painted strip (tall portrait views): the layer's own ground carries
  // on, taken from a blurred level so its bottom row does not smear into streaks
  if (uv.y < 0.0) t = vec4(textureLod(uTex, vec2(uv.x, 0.03), 5.0).rgb, 1.0);
  vec3 c = t.rgb * (uSky.rgb * 0.9 + uSunCol.rgb * 0.25);
  // texels brighter than any painted body glow by themselves
  float mx = max(t.r, max(t.g, t.b));
  float em = uEmit.x > 0.0 ? smoothstep(0.62, 0.92, mx) : 0.0;
  if (em > 0.0) {
    vec2 cell = floor(vL * 0.9);
    float hh = hash12(cell);
    float fl = 1.0 + uEmit.y * sin(uRotT.z * (5.0 + 9.0 * hh) + hh * 60.0) * (0.35 + 0.65 * hash12(cell + 7.0));
    c = mix(c, t.rgb * uEmit.x * fl, em);
  }
  // blasts light the nearer layers a little
  int nl = int(uWorld.w);
  vec2 wp = toWorldApprox(vClip);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= nl) break;
    vec4 p = uL[i * 2];
    float r = p.w * 1.6;
    float d = length(p.xy - wp);
    if (d > r) continue;
    float att = 1.0 - d / r;
    c += t.rgb * uL[i * 2 + 1].rgb * att * att * uLightK;
  }
  float mist = uMist.z * exp(-max(hv, 0.0) * uMist.y);
  float sink = uMist.w * smoothstep(0.0, -0.2, hv);
  float hz = clamp(uHaze.a + mist + sink, 0.0, 1.0) * (1.0 - 0.7 * em);
  // and sinks a little further into the haze the deeper it goes
  hz = mix(hz, min(1.0, hz + 0.3), smoothstep(0.0, -0.3, uv.y));
  c = mix(c, uHaze.rgb, hz);
  o = vec4(c * t.a, t.a);
}`,
};

// ---------------------------------------------------------------- terrain
// The ground is a cross-section of real material. The mask carries the shape
// (every blast carves it); the field texture carries depth below the surface,
// sun visibility and occlusion; the decal texture carries scorch, blood and
// hot glow; the surface texture remembers where the ground was before the
// first shot, so a crater wall shows the layers that were underneath (and
// fresh, damp earth) instead of a new turf. Five material models, picked by
// uMat.x: 0 earth (turf, humus, clay, weathered rock), 1 sandstone under sand,
// 2 frozen ground under snow, 3 rubble (asphalt, brick, concrete) and
// 4 columnar basalt.
export const TERRAIN = {
  vs: `${HEAD}${VIEW}
const vec2 P[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
out vec2 vWorld;
void main() {
  vec2 p = P[gl_VertexID];
  // a little beyond the world on each side so the edges are never seen
  vWorld = vec2(mix(-60.0, uWorld.x + 60.0, p.x), mix(-40.0, uWorld.y, p.y));
  gl_Position = toClip(vWorld);
}`,
  fs: `${HEAD}${LIGHT}
in vec2 vWorld;
uniform sampler2D uMask;
uniform sampler2D uOrig;
uniform sampler2D uField;
uniform sampler2D uDecal;
uniform sampler2D uNoise;
uniform sampler2D uSurf;   // height of the ground before the first shot, per column (m)
uniform vec4 uTop;    // top layer colour, thickness (m)
uniform vec4 uSoil;   // topsoil colour, thickness
uniform vec4 uDeep;   // subsoil colour, strata contrast
uniform vec4 uRock;   // rock colour, rock amount
uniform vec4 uGrass;  // blade colour, height (m)
uniform vec4 uMat;    // model, moisture, bedding relief, wet sheen
uniform vec4 uMat2;   // small stones, boulders, cracks, roots / frost / dust
uniform vec3 uAcc;    // accent: roots, iron-stained band, ice, brick
uniform vec3 uAcc2;   // second accent: concrete, shale, frost, lichen
uniform float uWind;
out vec4 o;
float mask(vec2 w) {
  vec2 uv = w / uWorld.xy;
  return texture(uMask, uv).r;
}
float hash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
// a thin line where x crosses a whole number (wd: its width as a share of the period)
float line(float x, float wd) { return smoothstep(1.0 - wd, 1.0 - wd * 0.3, abs(fract(x) - 0.5) * 2.0); }
// Oriented slabs of brick and concrete in cells of cs metres: coverage, which
// kind (0..1) and a top-lit bevel.
float chunks(vec2 p, float cs, float fill, out float kind, out float lit, out float brickRow, out float edge) {
  // warp the lattice so the slabs do not sit on a grid
  p += cs * 0.22 * vec2(sin(p.y / cs * 1.9 + 1.3), cos(p.x / cs * 1.6));
  vec2 g = floor(p / cs);
  vec2 f = fract(p / cs) - 0.5;
  float h1 = hash12(g + 3.1);
  float h2 = hash12(g + 17.3);
  float h3 = hash12(g + 41.7);
  float h4 = hash12(g + 77.9);
  float h5 = hash12(g + 5.7);
  float ca = cos(h1 * 6.2832), sa = sin(h1 * 6.2832);
  vec2 df = f - (vec2(h2, h3) - 0.5) * 0.3;
  vec2 q = vec2(ca * df.x + sa * df.y, -sa * df.x + ca * df.y);
  vec2 hs = vec2(0.08 + 0.22 * h2 * h3 + 0.04, 0.05 + 0.13 * h3);
  vec2 d = abs(q) - hs;
  float k = max(d.x, d.y);
  float inside = (1.0 - smoothstep(-0.035, 0.015, k)) * step(1.0 - fill, h4);
  kind = h5;
  lit = clamp(df.y / (hs.y + 0.05), -1.0, 1.0);
  edge = smoothstep(-0.12, 0.0, k);
  brickRow = q.y * cs / 0.14;
  return inside;
}
vec3 matAt(vec2 w, float depth, float depthC, vec4 nz, out float stone, out vec2 bump, out float gloss) {
  vec4 C = texture(uNoise, w * 0.55);
  vec2 wB = w + (C.gb - 0.5) * 0.1;
  vec4 B = texture(uNoise, wB * 0.09 + 0.3);
  vec2 wA = w + (B.gb - 0.5) * 0.5;
  vec4 A = texture(uNoise, wA * 0.012);
  vec4 S = texture(uNoise, w * vec2(0.02, 0.5) + vec2(0.31, 0.77));
  float big = A.r;
  float mid = B.g;
  float fine = C.b;
  float mode = uMat.x;
  float top = uTop.w * (0.6 + 0.8 * nz.r);
  float soilEnd = top + uSoil.w * (0.7 + 0.6 * big);
  vec3 c;
  bump = vec2(0.0);
  gloss = 0.0;
  float stoneOK = 1.0;
  if (mode < 0.5) {
    // ---- earth: turf and roots, dark humus, clayey subsoil, weathered rock
    float inTop = 1.0 - smoothstep(top - 0.05, top + 0.05, depth);
    vec3 crust = uTop.rgb * (0.7 + 0.55 * mid) * (0.85 + 0.3 * fine);
    float t = smoothstep(soilEnd - 0.3, soilEnd + 1.6, depth);
    vec3 sub = mix(uSoil.rgb * (0.8 + 0.4 * mid), uDeep.rgb, t);
    // clay and sand pockets, and bands of gravel
    float pocket = smoothstep(0.6, 0.72, S.r) * (1.0 - smoothstep(0.72, 0.8, S.r));
    sub = mix(sub, uAcc2 * 0.9, pocket * 0.3 * t);
    float band = sin(w.y * 2.6 + big * 7.0 + w.x * 0.015) * 0.5 + 0.5;
    float band2 = sin(w.y * 0.45 + mid * 3.0 - w.x * 0.01) * 0.5 + 0.5;
    sub *= mix(1.0, mix(0.8, 1.18, band) * mix(0.9, 1.08, band2), uDeep.w * t);
    c = mix(sub, crust, inTop);
    // roots hanging from the turf into the humus
    float rcell = floor(w.x * 8.0);
    float rf = fract(w.x * 8.0 + (fine - 0.5) * 0.35);
    float rlen = (0.25 + 0.9 * hash12(vec2(rcell, 1.7))) * uMat2.w;
    float root = (1.0 - smoothstep(0.015, 0.07, abs(rf - 0.5 + (mid - 0.5) * 0.18 * depth))) * (1.0 - smoothstep(top + rlen * 0.6, top + rlen, depth)) * step(0.4, hash12(vec2(rcell, 4.1)));
    c = mix(c, uAcc * (0.75 + 0.5 * fine), root * 0.85);
    // weathered rock below: layered, cracked, paler than the soil
    float rockK = smoothstep(soilEnd + 0.8, soilEnd + 3.5, depth) * uRock.w;
    float yy = w.y * 0.6 + big * 4.0 + w.x * 0.008 + S.g * 0.3 + 0.9 * sin(w.y * 0.31 + big * 5.0);
    float rb = floor(yy);
    float rfr = fract(yy);
    vec3 rcol = uRock.rgb * (0.74 + 0.4 * hash(rb * 3.7)) * (0.85 + 0.3 * fine) * mix(vec3(1.0), vec3(1.12, 1.0, 0.82), step(0.5, hash(rb * 5.1)));
    rcol *= mix(0.82, 1.0, smoothstep(0.0, 0.1, rfr));
    float crack = line(w.x * 0.16 + big * 3.0 + hash(rb) * 7.0 + sin(w.y * 1.1 + rb) * 0.12, 0.035) * step(0.55, hash(rb * 1.7 + 3.0));
    rcol *= 1.0 - 0.5 * crack * uMat2.z;
    bump.y += (0.5 - rfr) * uMat.z * rockK;
    c = mix(c, rcol, rockK);
  } else if (mode < 1.5) {
    // ---- sandstone under blown sand
    float inTop = 1.0 - smoothstep(top - 0.08, top + 0.08, depth + (mid - 0.5) * 0.3);
    float lam = sin((w.y * 6.0 + w.x * 1.4 + big * 9.0)) * 0.5 + 0.5;
    vec3 sand = uTop.rgb * (0.86 + 0.14 * lam) * (0.88 + 0.24 * fine);
    float yy = w.y * 0.5 + big * 4.5 + w.x * 0.012 + S.g * 0.2 + S.r * 0.15;
    float bi = floor(yy);
    float fr = fract(yy);
    float hb = hash(bi * 3.13);
    // buff, pale, iron-stained and shale bands, each with its own grain
    vec3 bc = mix(uSoil.rgb, uDeep.rgb, smoothstep(0.3, 0.55, hb));
    bc = mix(bc, uAcc, smoothstep(0.72, 0.8, hb) * (1.0 - smoothstep(0.86, 0.9, hb)));
    bc = mix(bc, uRock.rgb, smoothstep(0.9, 0.94, hb));
    bc *= 0.88 + 0.24 * hash(bi * 7.7);
    bc *= 0.9 + 0.2 * S.b + 0.14 * (fine - 0.5);
    // dark bedding planes with a pale hard lip above
    bc *= mix(0.74, 1.0, smoothstep(0.0, 0.1, fr));
    bc += uDeep.rgb * 0.16 * smoothstep(0.86, 0.97, fr);
    // cross-bedding in the thicker bands
    float xb = sin((w.y * 9.0 - w.x * 2.2) + hb * 40.0) * 0.5 + 0.5;
    bc *= 1.0 + 0.07 * (xb - 0.5) * step(0.4, hb);
    float t = smoothstep(top, top + 0.6, depth);
    c = mix(sand, bc, t);
    bump.y += (0.5 - fr) * uMat.z * t;
    // vertical joints in the harder rock
    float jt = line(w.x * 0.07 + hb * 5.0 + big * 2.0, 0.035) * step(0.6, hash(bi * 2.3 + 1.0));
    c *= 1.0 - 0.35 * jt * uMat2.z * t;
    // a pebbly band
    float peb = smoothstep(0.78, 0.82, hb) * (1.0 - smoothstep(0.82, 0.84, hb));
    stoneOK = 0.12 + peb * 1.4;
  } else if (mode < 2.5) {
    // ---- frozen ground under snow
    float drift = top * (0.85 + 0.5 * (A.g - 0.5));
    float inTop = 1.0 - smoothstep(drift - 0.07, drift + 0.07, depth);
    float ln = smoothstep(0.55, 0.62, sin(w.y * 7.0 + big * 6.0 + S.g * 3.0) * 0.5 + 0.5);
    vec3 snow = uTop.rgb * (0.93 + 0.1 * mid) * (1.0 - 0.07 * ln);
    snow *= mix(0.88, 1.0, smoothstep(0.0, 0.5, drift - depth));
    snow += vec3(0.95, 0.98, 1.0) * step(0.9, C.a) * step(0.5, fine) * 0.25;
    // frozen soil: grey-brown, with ice lenses and frost crystals
    float t = smoothstep(drift, drift + 0.8, depth);
    vec3 soil = mix(uSoil.rgb * (0.78 + 0.4 * mid), uDeep.rgb * (0.85 + 0.3 * big), smoothstep(soilEnd - 0.4, soilEnd + 1.5, depth));
    float lens = smoothstep(0.76, 0.86, S.g + 0.12 * (mid - 0.5)) * (1.0 - smoothstep(0.86, 0.96, S.g)) * smoothstep(0.5, 0.62, A.g);
    float frost = step(0.86, fine) * smoothstep(0.1, 0.5, depth - drift);
    soil = mix(soil, uAcc, lens * 0.7);
    soil = mix(soil, uAcc2, frost * 0.55);
    gloss = lens;
    // rock below
    float rockK = smoothstep(soilEnd + 1.2, soilEnd + 4.0, depth) * uRock.w;
    float yy = w.y * 0.6 + big * 4.0 + w.x * 0.008 + S.g * 0.3 + 0.9 * sin(w.y * 0.31 + big * 5.0);
    float rb = floor(yy);
    vec3 rcol = uRock.rgb * (0.68 + 0.5 * hash(rb * 3.7)) * (0.85 + 0.3 * fine) * mix(vec3(1.0), vec3(1.14, 1.0, 0.86), step(0.55, hash(rb * 5.1)));
    rcol *= mix(0.8, 1.0, smoothstep(0.0, 0.12, fract(yy)));
    float crack = line(w.x * 0.16 + big * 3.0 + hash(rb) * 7.0 + sin(w.y * 1.1 + rb) * 0.12, 0.035) * step(0.55, hash(rb * 1.7 + 3.0));
    rcol *= 1.0 - 0.5 * crack * uMat2.z;
    soil = mix(soil, rcol, rockK);
    c = mix(soil, snow, inTop);
    stoneOK = 1.0 - inTop;
  } else if (mode < 3.5) {
    // ---- rubble: asphalt, crushed fill with brick and concrete, clay below
    float inTop = 1.0 - smoothstep(top - 0.04, top + 0.04, depth);
    vec3 asph = uTop.rgb * (0.7 + 0.6 * fine) * (0.85 + 0.3 * mid);
    float crackA = line(w.x * 0.9 + big * 5.0, 0.05);
    asph *= 1.0 - 0.5 * crackA * (1.0 - smoothstep(0.0, top, depth));
    float fillK = 1.0 - smoothstep(soilEnd + 1.5, soilEnd + 5.5, depth);
    vec3 fillc = mix(uSoil.rgb * (0.7 + 0.5 * mid), uDeep.rgb * (0.8 + 0.4 * mid), smoothstep(0.0, 4.0, depth - top));
    float grav = smoothstep(0.12, 0.3, C.a);
    fillc = mix(fillc, uAcc2 * (0.5 + 0.5 * fine), grav * 0.35);
    float yb = w.y * 0.55 + big * 4.0 + 0.9 * sin(w.y * 0.31 + big * 5.0);
    float rbk = floor(yb);
    fillc *= mix(1.0, (0.84 + 0.36 * hash(rbk * 3.7)) * mix(0.94, 1.06, step(0.5, hash(rbk * 5.1))), smoothstep(0.0, 3.0, depth - top));
    // slabs of brick (kind < 0.55), concrete (< 0.88) and charred timber
    float k1, l1, r1, e1;
    float cov1 = chunks(w, 1.3, 0.5 * fillK, k1, l1, r1, e1);
    float k2, l2, r2, e2;
    float cov2 = chunks(w + 7.3, 0.62, 0.62 * fillK, k2, l2, r2, e2);
    vec3 bcol1 = k1 < 0.5 ? uAcc : (k1 < 0.86 ? uAcc2 : uRock.rgb);
    vec3 bcol2 = k2 < 0.55 ? uAcc : (k2 < 0.86 ? uAcc2 : uRock.rgb);
    bcol1 *= (0.7 + 0.55 * hash12(floor(w / 1.3) + 2.2)) * (0.8 + 0.4 * fine);
    bcol2 *= (0.7 + 0.55 * hash12(floor((w + 7.3) / 0.62) + 2.2)) * (0.8 + 0.4 * fine);
    float mort1 = line(r1, 0.2) * step(k1, 0.5);
    float mort2 = line(r2, 0.2) * step(k2, 0.55);
    bcol1 = mix(bcol1, uAcc2 * 0.5, mort1 * 0.6);
    bcol2 = mix(bcol2, uAcc2 * 0.5, mort2 * 0.6);
    bcol1 *= 1.0 + 0.3 * l1 - 0.35 * e1;
    bcol2 *= 1.0 + 0.3 * l2 - 0.35 * e2;
    vec3 rub = fillc;
    rub = mix(rub, bcol2, cov2);
    rub = mix(rub, bcol1, cov1);
    float shadowGap = max(cov1, cov2);
    c = mix(rub, asph, inTop);
    gloss = inTop * 0.9 + shadowGap * 0.35;
    stoneOK = 0.7 * (1.0 - inTop);
    stone = 0.0;
    bump.y += (cov1 * (l1 * 0.25 - e1 * 0.2));
  } else {
    // ---- columnar basalt: dust and lichen on top, jointed dark rock below
    float inTop = 1.0 - smoothstep(top - 0.05, top + 0.05, depth);
    vec3 dust = uTop.rgb * (0.75 + 0.5 * mid) * (0.85 + 0.3 * fine);
    float lichen = smoothstep(0.62, 0.75, A.b) * smoothstep(0.55, 0.7, B.r);
    dust = mix(dust, uAcc2 * (0.8 + 0.4 * fine), lichen * 0.6);
    float cx = w.x * 0.8 + (mid - 0.5) * 0.25 + (big - 0.5) * 1.6;
    float cid = floor(cx);
    float cf = fract(cx);
    float hc = hash(cid * 3.31);
    float zone = smoothstep(0.42, 0.58, A.g);
    float joint = (1.0 - smoothstep(0.0, 0.05, min(cf, 1.0 - cf))) * zone;
    vec3 rock = mix(uRock.rgb, uDeep.rgb, smoothstep(0.3, 0.7, hc) * 0.6) * (0.88 + 0.22 * hc) * (0.82 + 0.3 * fine) * (0.9 + 0.2 * S.b);
    float cj = fract((w.y + hc * 7.0) * 0.38 + (mid - 0.5) * 0.2);
    float cross_ = (1.0 - smoothstep(0.0, 0.05, min(cj, 1.0 - cj))) * zone * step(0.75, hc);
    rock *= 1.0 - 0.55 * max(joint, cross_) * uMat2.z;
    // rust-brown weathering near the top, vesicles
    rock = mix(rock, uAcc * (0.7 + 0.5 * mid), smoothstep(2.5, 0.2, depth) * 0.3 * (0.4 + A.g));
    float vesicle = step(0.9, C.a) * 0.5;
    rock *= 1.0 - vesicle * 0.5;
    c = mix(rock, dust, inTop);
    bump.x += (cf - 0.5) * 0.35 * uMat.z * zone * (1.0 - inTop);
    bump.y += (0.5 - cj) * 0.15 * uMat.z * (1.0 - inTop);
    gloss = 0.25 * (1.0 - inTop);
  }
  // large and small stones bedded in the earth, lit from the sun's side
  vec2 L = normalize(uSun.xy + vec2(0.0001, 0.0));
  float deepK = smoothstep(0.3, 2.5, depth);
  float aEdge = A.a + (C.b - 0.5) * 0.08 + (B.g - 0.5) * 0.06;
  float stBig = smoothstep(0.05, 0.08, aEdge) * smoothstep(0.52, 0.68, A.g) * uMat2.y * smoothstep(1.2, 3.5, depth) * stoneOK;
  float stSm = smoothstep(0.1, 0.3, B.a) * smoothstep(0.42, 0.6, A.b) * uMat2.x * smoothstep(0.05, 0.6, depth) * (1.0 - 0.75 * smoothstep(2.0, 6.0, depth)) * stoneOK;
  if (mode > 2.5 && mode < 3.5) { stBig = 0.0; stSm = 0.0; }
  vec4 Bs = texture(uNoise, (wB + L * 0.07) * 0.09 + 0.3);
  vec4 As = texture(uNoise, (wA + L * 0.3) * 0.012);
  float dB = (Bs.a - B.a) / 0.07;
  float dA = (As.a - A.a) / 0.3;
  vec3 rc = uRock.rgb * (0.62 + 0.75 * B.b) * (0.85 + 0.3 * fine);
  vec3 rcb = uRock.rgb * (0.9 + 0.5 * B.b) * (0.82 + 0.36 * fine) * mix(0.5, 1.0, smoothstep(0.08, 0.2, aEdge));
  c = mix(c, rc, stSm);
  c = mix(c, rcb, stBig);
  stone = max(stSm, stBig);
  bump -= L * (dB * 0.14 * stSm + dA * 0.22 * stBig);
  // large mottling, then medium, then fine grain
  c *= 0.78 + 0.34 * big + 0.2 * (mid - 0.5) + 0.16 * (fine - 0.5);
  return c;
}
void main() {
  vec2 w = vWorld;
  vec2 uv = w / uWorld.xy;
  float m = mask(w);
  float fw = max(fwidth(m), 1e-4);
  float a = clamp((m - 0.5) / fw + 0.5, 0.0, 1.0);
  if (w.y < 0.0) a = 1.0;
  vec4 field = texture(uField, uv);
  vec4 nz = texture(uNoise, w * 0.045);
  vec4 dec = texture(uDecal, uv);
  vec3 col = vec3(0.0);
  float alpha = 0.0;

  // ---- air: grass blades above the surface, or the dark far wall of a crater
  if (a < 1.0) {
    vec3 airCol = vec3(0.0);
    float airA = 0.0;
    // air below where the ground stood before the first shot: a crater or a cave,
    // with the shadowed far wall of earth behind it (darker the deeper in it is)
    float surfA = texture(uSurf, vec2(uv.x, 0.5)).r;
    float inside = smoothstep(0.0, 0.5, surfA - 0.1 - w.y);
    if (inside > 0.0) {
      // the same ground as around it, seen as the far wall of the hole: the layers continue
      // behind it, darker, warmer and damper, shadowed toward the rim and charred near a blast
      float dd = surfA - w.y;
      float stB;
      vec2 bumpB;
      float glossB;
      vec3 alb = matAt(w, dd, dd, nz, stB, bumpB, glossB);
      alb *= vec3(0.96, 0.86, 0.76) * (0.66 + 0.1 * nz.g);
      alb *= mix(1.0, 0.72, smoothstep(1.2, 14.0, dd));
      // rim shadow: the nearer the solid ground on every side, the darker
      float ring = 0.0;
      for (int i = 0; i < 8; i++) {
        float ang = float(i) * 0.7853982;
        vec2 dir = vec2(cos(ang), sin(ang));
        ring += mask(w + dir * 1.3) + 0.6 * mask(w + dir * 3.4);
      }
      ring *= 0.125 / 1.6;
      alb *= mix(1.0, 0.6, smoothstep(0.35, 0.95, ring));
      alb *= mix(1.0, 0.85, smoothstep(0.2, 0.8, field.b));
      float scB = clamp(dec.r * 1.1, 0.0, 1.0);
      alb = mix(alb, alb * 0.5 + vec3(0.012, 0.01, 0.009) * (0.7 + 0.6 * nz.b), scB * 0.35);
      vec3 nB = normalize(vec3((nz.rg - 0.5) * 0.25 + bumpB * 0.7, 1.0));
      airCol = shade(alb, nB, w, 0.45, 1.0);
      airA = inside;
    }
    if (uGrass.w > 0.0) {
      // find the surface below: coarse steps, then a few halvings
      float d = -1.0;
      float prev = 0.0;
      for (int i = 1; i <= 6; i++) {
        float st = float(i) * 0.14;
        if (mask(w - vec2(0.0, st)) > 0.5) { d = st; break; }
        prev = st;
      }
      if (d > 0.0) {
        float lo = prev, hi = d;
        for (int k = 0; k < 4; k++) {
          float mid = 0.5 * (lo + hi);
          if (mask(w - vec2(0.0, mid)) > 0.5) hi = mid; else lo = mid;
        }
        d = hi;
        vec2 base = w - vec2(0.0, d);
        float burnt = texture(uDecal, base / uWorld.xy).r;
        float wildH = uGrass.w * (0.45 + 0.9 * texture(uNoise, vec2(w.x * 0.011, 0.71)).g);
        wildH *= 1.0 - smoothstep(0.2, 0.55, burnt);
        // three layers of thin, pointed blades leaning with the wind
        float cover = 0.0;
        float shadeK = 0.0;
        for (int L = 0; L < 3; L++) {
          float dens = 7.0 + float(L) * 5.0;
          float lean = (uWind * 0.35 + sin(uRotT.z * 1.6 + w.x * 0.7 + float(L)) * 0.08) * d;
          float x = (w.x - lean) * dens + float(L) * 0.37;
          float id = floor(x);
          float h = wildH * (0.35 + 0.75 * hash12(vec2(id, float(L) * 7.1)));
          float t = d / max(h, 0.001);
          if (t < 1.0) {
            float half_ = 0.32 * (1.0 - t) + 0.04;
            float f = abs(fract(x) - 0.5 - (hash12(vec2(id, 3.3)) - 0.5) * 0.3);
            if (f < half_) { cover = 1.0; shadeK = max(shadeK, 0.5 + 0.5 * t); }
          }
        }
        if (cover > 0.0) {
          vec3 alb = uGrass.rgb * (0.45 + 0.7 * shadeK) * (0.85 + 0.3 * texture(uNoise, vec2(w.x * 0.37, 0.2)).r);
          float sv = texture(uField, base / uWorld.xy).g;
          airCol = shade(alb, normalize(vec3(0.0, 0.35, 0.94)), w, sv, 1.0);
          airA = 1.0;
        }
      }
    }
    col = airCol;
    alpha = airA;
  }

  // ---- solid ground
  if (a > 0.0) {
    float depthC = field.r * 8.0;
    // depth below where the surface was before any shot: the layers
    float surfY = texture(uSurf, vec2(uv.x, 0.5)).r;
    float depth = max(surfY - w.y, 0.0);
    float cutK = clamp((depth - depthC) * 0.7, 0.0, 1.0);
    float stone;
    vec2 bump;
    float gloss;
    vec3 alb = matAt(w, depth, depthC, nz, stone, bump, gloss);
    // damp, freshly exposed earth where ground has been blown away
    float fresh = cutK * (1.0 - smoothstep(0.0, 0.9, depthC));
    alb *= 1.0 - 0.34 * fresh * (0.7 + 0.6 * nz.g);
    // moisture darkens the upper ground
    alb *= 1.0 - uMat.y * 0.35 * (1.0 - smoothstep(0.0, 5.0, depth));
    // the deeper, the darker (the cross-section falls away from the light)
    alb *= mix(1.0, 0.55, smoothstep(1.2, 14.0, depth));
    // crevices and the floors of craters
    alb *= mix(1.0, 0.72, smoothstep(0.6, 0.95, field.b) * (1.0 - smoothstep(0.8, 3.0, depthC)));
    // normal from the mask's slope at the edge, plus a little grit and the material's own relief
    float e = 1.0 / uWorld.z;
    float gx = mask(w + vec2(e, 0.0)) - mask(w - vec2(e, 0.0));
    float gy = mask(w + vec2(0.0, e)) - mask(w - vec2(0.0, e));
    vec2 g2 = -vec2(gx, gy);
    float edge = clamp(1.0 - depthC / 0.6, 0.0, 1.0);
    vec3 n = normalize(vec3(g2 * 1.5 * edge + (nz.rg - 0.5) * 0.3 + bump, 1.0));
    // scorch (charred soil keeps its texture), blood
    float sc = clamp(dec.r * 1.15, 0.0, 1.0);
    alb = mix(alb, alb * 0.2 + vec3(0.012, 0.01, 0.009) * (0.7 + 0.6 * nz.b), sc);
    float blood = dec.g * smoothstep(0.35, 0.55, dec.g + (nz.a - 0.5) * 0.5);
    alb = mix(alb, vec3(0.055, 0.006, 0.004) * (0.6 + 0.6 * dec.b), clamp(blood * 1.3, 0.0, 0.9));
    vec3 c = shade(alb, n, w, field.g, 1.0);
    // wet sheen: the sky in damp stone and asphalt
    float sheen = uMat.w * gloss * (0.3 + 0.7 * smoothstep(0.1, 0.9, n.y)) * (1.0 - sc * 0.7);
    c += (uSky.rgb * 0.8 + uSunCol.rgb * 0.12 * pow(max(dot(n, normalize(uSun.xyz + vec3(0.0, 0.0, 1.0))), 0.0), 8.0)) * sheen * (0.4 + 0.6 * field.g);
    // a glint on wet blood
    c += blood * dec.b * pow(max(dot(n, normalize(uSun.xyz + vec3(0.0, 0.0, 1.0))), 0.0), 24.0) * uSunCol.rgb * 0.4;
    // hot glowing ground in a fresh crater
    // (only a thin rim right at the cut edge, not the whole wall)
    if (dec.a > 0.01) {
      float airN = 1.0 - min(min(mask(w + vec2(0.3, 0.0)), mask(w - vec2(0.3, 0.0))), min(mask(w + vec2(0.0, 0.3)), mask(w - vec2(0.0, 0.3))));
      float airF = 1.0 - min(min(mask(w + vec2(0.9, 0.0)), mask(w - vec2(0.9, 0.0))), min(mask(w + vec2(0.0, 0.9)), mask(w - vec2(0.0, 0.9))));
      float rim = clamp(airN + 0.22 * airF, 0.0, 1.0);
      float glow = dec.a * rim * (0.75 + 0.35 * sin(uRotT.z * 3.0 + nz.r * 30.0 + w.x * 0.8));
      c += vec3(5.0, 1.4, 0.3) * glow * glow;
    }
    col = mix(col, c, a);
    alpha = max(alpha, a);
  }
  o = vec4(col * alpha, alpha);
}`,
};

// Depth below the surface, sun visibility and occlusion, worked out from the
// mask whenever it changes (only the changed rectangle is redone).
export const FIELD = {
  vs: `${HEAD}
uniform vec4 uRect; // x0,y0,x1,y1 in world metres
const vec2 P[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
out vec2 vWorld;
void main() {
  vec2 p = P[gl_VertexID];
  vWorld = mix(uRect.xy, uRect.zw, p);
  gl_Position = vec4(vWorld / uWorld.xy * 2.0 - 1.0, 0.0, 1.0);
}`,
  fs: `${HEAD}
in vec2 vWorld;
uniform sampler2D uMask;
out vec4 o;
float m(vec2 w) { return texture(uMask, w / uWorld.xy).r; }
void main() {
  vec2 w = vWorld;
  float depth = 8.0;
  for (int i = 1; i <= 24; i++) {
    float s = float(i) * 0.34;
    if (m(w + vec2(0.0, s)) < 0.5) { depth = s - 0.17; break; }
  }
  if (m(w) < 0.5) depth = 0.0;
  // soft sun shadow from the ground in the sun's direction, measured from
  // the surface above this point (the cross-section itself faces us)
  vec2 sd = normalize(uSun.xy + vec2(0.0, 0.0001));
  vec2 from = w + vec2(0.0, depth + 0.15);
  float occ = 0.0;
  for (int i = 0; i < 28; i++) {
    float s = 0.6 + float(i) * float(i) * 0.075;
    occ += step(0.5, m(from + sd * s)) * (1.0 - float(i) / 32.0);
    if (from.y + sd.y * s > uWorld.y) break;
  }
  float sun = 1.0 - clamp(occ / 2.5, 0.0, 1.0);
  // deep in the cross-section the surface's shadow no longer applies
  sun = mix(sun, 0.85, smoothstep(1.0, 6.0, depth));
  // ambient occlusion: how much ground surrounds this point
  float ao = 0.0;
  for (int i = 0; i < 8; i++) {
    float an = float(i) * 0.785398;
    vec2 d = vec2(cos(an), sin(an));
    ao += m(w + d * 1.1) + m(w + d * 2.6);
  }
  ao /= 16.0;
  o = vec4(clamp(depth / 8.0, 0.0, 1.0), sun, ao, 1.0);
}`,
};

// ---------------------------------------------------------------- decals
// Scorch (R), blood (G), wetness (B) and glow (A), painted straight into a
// texture laid over the battlefield.
export const DECAL = {
  vs: `${HEAD}
layout(location = 0) in vec4 aA; // x, y, radius, kind
layout(location = 1) in vec4 aB; // strength r,g,b,a
layout(location = 2) in vec4 aC; // seed, angle, stretch, unused
const vec2 P[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
out vec2 vP;
out vec4 vB;
out vec4 vC;
flat out float vKind;
void main() {
  vec2 p = P[gl_VertexID];
  vP = p;
  vB = aB;
  vC = aC;
  vKind = aA.w;
  float c = cos(aC.y), s = sin(aC.y);
  vec2 q = p * aA.z * vec2(aC.z, 1.0);
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  vec2 w = aA.xy + q;
  gl_Position = vec4(w / uWorld.xy * 2.0 - 1.0, 0.0, 1.0);
}`,
  fs: `${HEAD}
in vec2 vP;
in vec4 vB;
in vec4 vC;
flat in float vKind;
uniform sampler2D uNoise;
out vec4 o;
void main() {
  float r = length(vP);
  float n = texture(uNoise, vP * 0.35 + vC.x).r;
  float a;
  if (vKind < 0.5) {
    // scorch: soft ragged disc
    a = smoothstep(1.0, 0.45, r + (n - 0.5) * 0.5);
  } else {
    // blood: a ragged splat with droplets around it
    float core = smoothstep(0.55, 0.3, r + (n - 0.5) * 0.6);
    float drops = step(0.78, texture(uNoise, vP * 1.7 + vC.x * 3.0).g) * smoothstep(1.0, 0.5, r);
    a = max(core, drops);
  }
  if (a <= 0.0) discard;
  o = vB * a;
}`,
};

// ---------------------------------------------------------------- sprites
export const SPRITE = {
  vs: `${HEAD}${VIEW}
layout(location = 0) in vec4 aA; // x, y, rotation, flip
layout(location = 1) in vec4 aB; // w, h, offset x, offset y (bottom-left corner from the pivot, metres)
layout(location = 2) in vec4 aC; // uv rect
layout(location = 3) in vec4 aD; // tint rgb, paint amount
layout(location = 4) in vec4 aE; // alpha, char, blood, emissive
const vec2 P[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
out vec2 vUV;
out vec2 vLocal;
out vec2 vWorld;
out vec4 vTint;
out vec4 vFx;
out vec3 vRot; // cos, sin, flip
void main() {
  vec2 p = P[gl_VertexID];
  vec2 local = aB.zw + p * aB.xy;
  local.x *= aA.w;
  float c = cos(aA.z), s = sin(aA.z);
  vec2 w = aA.xy + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vWorld = w;
  vLocal = p;
  vUV = vec2(mix(aC.x, aC.z, p.x), mix(aC.w, aC.y, p.y));
  vTint = aD;
  vFx = aE;
  vRot = vec3(c, s, aA.w);
  gl_Position = toClip(w);
}`,
  fs: `${HEAD}${LIGHT}
in vec2 vUV;
in vec2 vLocal;
in vec2 vWorld;
in vec4 vTint;
in vec4 vFx;
in vec3 vRot;
uniform sampler2D uAlbedo;
uniform sampler2D uNormal;
uniform sampler2D uField;
uniform sampler2D uNoise;
out vec4 o;
void main() {
  vec4 al = texture(uAlbedo, vUV);
  float a = al.a * vFx.x;
  if (a < 0.004) discard;
  vec4 nm = texture(uNormal, vUV);
  vec3 n = nm.rgb * 2.0 - 1.0;
  n.x *= vRot.z;
  n.xy = vec2(n.x * vRot.x - n.y * vRot.y, n.x * vRot.y + n.y * vRot.x);
  n = normalize(n);
  vec3 alb = al.rgb;
  float lum = dot(alb, vec3(0.299, 0.587, 0.114));
  alb = mix(alb, vTint.rgb * lum * 2.4, nm.a * vTint.a);
  vec4 nz = texture(uNoise, vLocal * vec2(3.0, 1.4) + vTint.a * 0.0);
  // burnt: soot and char
  float ch = vFx.y * smoothstep(0.25, 0.65, nz.r + vFx.y * 0.5);
  alb = mix(alb, vec3(0.025, 0.022, 0.02) * (0.6 + 0.8 * nz.g), ch);
  // blood spatter
  // sparse dark splashes, mostly on the upper hull and turret
  float bn = texture(uNoise, vLocal * vec2(5.0, 2.5) + 0.37).b;
  float bl = step(0.001, vFx.z) * smoothstep(0.74 - vFx.z * 0.1, 0.8 - vFx.z * 0.1, bn) * smoothstep(0.25, 0.75, vLocal.y);
  alb = mix(alb, vec3(0.07, 0.004, 0.003), bl * 0.85);
  vec2 fuv = vWorld / uWorld.xy;
  float sun = (fuv.x < 0.0 || fuv.x > 1.0 || fuv.y > 1.0) ? 1.0 : texture(uField, fuv).g;
  vec3 c = shade(alb, n, vWorld, sun, 1.0);
  // specular glint on metal (unpainted, smooth parts) from the sun
  c += uSunCol.rgb * pow(max(dot(reflect(-uSun.xyz, n), vec3(0.0, 0.0, 1.0)), 0.0), 18.0) * 0.08 * (1.0 - vFx.y) * sun;
  // glowing hot metal
  c += vec3(4.0, 1.2, 0.25) * vFx.w * smoothstep(0.55, 0.85, nz.b) * al.a;
  o = vec4(c * a, a);
}`,
};

// ---------------------------------------------------------------- particles
// One instanced quad per particle. Lit kinds (smoke, dust, dirt, blood) use
// alpha blending and the shared lights; hot kinds (fire, sparks, flashes,
// embers) are added on top.
const PARTICLE_VS = `${HEAD}${VIEW}
layout(location = 0) in vec4 aA; // x, y, size, rotation
layout(location = 1) in vec4 aB; // colour rgba
layout(location = 2) in vec4 aC; // kind, life 0..1, seed, stretch
const vec2 P[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
out vec2 vP;
out vec4 vCol;
out vec4 vC;
out vec2 vWorld;
void main() {
  vec2 p = P[gl_VertexID];
  vP = p;
  vCol = aB;
  vC = aC;
  vec2 q = p * aA.z;
  q.x *= 1.0 + aC.w;
  float c = cos(aA.w), s = sin(aA.w);
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  vWorld = aA.xy + q;
  gl_Position = toClip(vWorld);
}`;

export const PARTICLE_LIT = {
  vs: PARTICLE_VS,
  fs: `${HEAD}${LIGHT}
in vec2 vP;
in vec4 vCol;
in vec4 vC;
in vec2 vWorld;
uniform sampler2D uNoise;
uniform sampler2D uField;
out vec4 o;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float kind = vC.x;
  float life = vC.y;
  vec4 nz = texture(uNoise, vP * 0.22 + vC.z);
  float a;
  vec3 n;
  vec3 emit = vec3(0.0);
  if (kind < 0.5 || kind > 2.5) {
    // smoke and dust: a billowing puff with a lumpy surface, so the sun and
    // the fire pick out the billows. kind 3 + h glows from inside (hot smoke)
    vec4 nz2 = texture(uNoise, vP * 0.6 + vC.z * 2.3);
    float edge = r + (nz.r - 0.5) * 0.9 + (nz.g - 0.5) * 0.35 + (nz2.b - 0.5) * 0.2;
    a = smoothstep(1.0, 0.25, edge) * smoothstep(1.0, 0.65, r);
    n = normalize(vec3(vP * 0.5 + (nz.gb - 0.5) * 0.7 + (nz2.rg - 0.5) * 0.3, 1.0));
    if (kind > 2.5) {
      float h = kind - 3.0;
      float core = smoothstep(0.95, 0.05, edge);
      vec3 ramp = mix(vec3(1.1, 0.14, 0.01), vec3(3.4, 1.1, 0.2), smoothstep(0.15, 0.85, h));
      emit = ramp * h * core * (0.5 + 0.9 * nz2.r);
    }
  } else if (kind < 1.5) {
    // a clod of earth or a stone
    float edge = r + (nz.r - 0.5) * 0.7;
    a = step(edge, 0.72);
    n = normalize(vec3(vP * 1.2 + (nz.ba - 0.5), 0.6));
  } else {
    // a droplet of blood
    a = smoothstep(1.0, 0.6, r + (nz.r - 0.5) * 0.3);
    n = normalize(vec3(vP, 0.7));
  }
  a *= vCol.a;
  if (a < 0.003) discard;
  vec2 fuv = vWorld / uWorld.xy;
  float sun = (fuv.x < 0.0 || fuv.x > 1.0 || fuv.y > 1.0 || fuv.y < 0.0) ? 1.0 : texture(uField, fuv).g;
  vec3 c = shade(vCol.rgb, n, vWorld, mix(1.0, sun, 0.7), (kind < 0.5 || kind > 2.5) ? 1.4 : 1.0);
  if (kind > 1.5 && kind < 2.5) c += uSunCol.rgb * pow(max(dot(n, normalize(uSun.xyz + vec3(0, 0, 1))), 0.0), 30.0) * 0.12;
  o = vec4((c + emit) * a, a);
}`,
};

export const PARTICLE_HOT = {
  vs: PARTICLE_VS,
  fs: `${HEAD}
in vec2 vP;
in vec4 vCol;
in vec4 vC;
in vec2 vWorld;
uniform sampler2D uNoise;
out vec4 o;
vec3 fire(float t) {
  // black-body-ish ramp: deep red, orange, yellow, white-hot
  return mix(mix(vec3(0.35, 0.03, 0.0), vec3(2.6, 0.62, 0.06), smoothstep(0.0, 0.5, t)), vec3(5.0, 3.4, 1.5), smoothstep(0.7, 1.0, t));
}
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float kind = vC.x;
  float life = vC.y;
  vec3 c;
  float cover = 0.0;
  if (kind < 3.5) {
    // fire: turbulent flame that partly hides what is behind it (so piled-up
    // flames stay orange instead of adding up to white), cooling with age
    vec4 nz = texture(uNoise, vP * 0.3 + vC.z + vec2(0.0, -life * 0.6));
    vec4 nz2 = texture(uNoise, vP * 0.8 + vC.z * 1.7 + vec2(life * 0.3, -life));
    float edge = r + (nz.r - 0.5) * 0.9 + (nz2.g - 0.5) * 0.35;
    float a = smoothstep(1.0, 0.15, edge) * smoothstep(1.0, 0.7, r);
    float heat = clamp((1.0 - life) * (1.0 - life) * 1.05 - r * 0.45 + (nz2.b - 0.5) * 0.7, 0.0, 1.0) * vCol.a;
    c = fire(heat) * a * vCol.rgb;
    cover = a * 0.75 * vCol.a;
  } else if (kind < 4.5) {
    // spark or tracer: bright streak, hotter in the middle
    float a = smoothstep(1.0, 0.0, abs(vP.y) * 1.0) * smoothstep(1.0, 0.3, abs(vP.x));
    c = vCol.rgb * a * a * vCol.a;
  } else if (kind < 5.5) {
    // flash or glow: a soft radial falloff
    float a = exp(-r * r * 4.0) - 0.018;
    c = vCol.rgb * max(a, 0.0) * vCol.a;
  } else if (kind < 6.5) {
    // ember: a tiny flickering point
    float a = smoothstep(1.0, 0.0, r);
    float fl = 0.55 + 0.45 * sin(uRotT.z * 23.0 + vC.z * 60.0);
    c = vCol.rgb * a * a * fl * vCol.a;
  } else if (kind < 7.5) {
    // fireball billow: a lumpy ball, white-hot at its heart when young, then
    // orange, then sooty smoke rim-lit by what still burns inside it.
    // vCol.r = starting heat, vCol.g = how black the smoke ends up.
    vec4 n1 = texture(uNoise, vP * 0.2 + vC.z * 3.7);
    vec4 n2 = texture(uNoise, vP * 0.5 + vC.z * 1.3 + vec2(life * 0.12, -life * 0.3));
    float edge = r + (n1.r - 0.5) * 0.8 + (n2.g - 0.5) * 0.4 + (n2.b - 0.5) * 0.16;
    float body = smoothstep(1.0, 0.32, edge) * smoothstep(1.0, 0.8, r);
    float cool = pow(1.0 - life, 1.4);
    float core = clamp(1.0 - edge * 1.05, 0.0, 1.0);
    float T = vCol.r * cool * (0.3 + 0.95 * core) * (0.7 + 0.55 * n2.r);
    vec3 hot = fire(clamp(T, 0.0, 1.0));
    // the soot: dark brown-grey, lighter where the noise lumps toward us, lit
    // from below by the fire under it
    float lump = 0.45 + 0.9 * n1.g;
    vec3 soot = vec3(0.055, 0.047, 0.04) * lump * (1.0 - 0.55 * vCol.g);
    float under = clamp(0.55 - 0.5 * vP.y, 0.0, 1.0);
    soot += vec3(0.7, 0.2, 0.03) * under * under * vCol.r * cool * (0.4 + 0.6 * core);
    float m = smoothstep(0.1, 0.5, T);
    c = mix(soot, hot, m) * body * vCol.a;
    cover = body * vCol.a * mix(0.97, 0.72, m);
  } else {
    // shock ring: a thin bright front of dust and vapour, broken up by noise.
    // kind 9 is a half ring (above the ground only)
    float w = 0.17;
    float d = (r - (1.0 - w * 0.7)) / (w * 0.7);
    float band = exp(-d * d * 1.6) * smoothstep(1.0, 0.93, r);
    float u = atan(vP.y, vP.x) * (4.0 / 6.2831853);
    float broken = 0.45 + 0.7 * texture(uNoise, vec2(u, vC.z * 7.0)).r;
    if (kind > 8.5) band *= smoothstep(-0.02, 0.1, vP.y);
    c = vCol.rgb * band * broken * vCol.a;
  }
  o = vec4(c, cover);
}`,
};

// ---------------------------------------------------------------- weather
export const WEATHER = {
  vs: PARTICLE_VS,
  fs: `${HEAD}
in vec2 vP;
in vec4 vCol;
in vec4 vC;
uniform sampler2D uNoise;
out vec4 o;
void main() {
  float shape = vC.x;   // 0 rain streak, 1 snow flake, 2 ash flake, 3 ember, 4 dust veil, 5 sand grain
  float r = length(vP);
  vec3 lightC = uSky.rgb * 1.5 + uSunCol.rgb * 0.15;
  vec3 c = vCol.rgb * lightC;
  float a;
  if (shape < 0.5) {
    a = smoothstep(1.0, 0.0, abs(vP.y)) * smoothstep(1.0, 0.6, abs(vP.x)) * smoothstep(-1.0, 0.7, vP.x);
  } else if (shape < 1.5) {
    // snow: crisp when far, a soft blur when near the lens
    a = smoothstep(1.0, mix(0.5, 0.0, vC.y), r);
  } else if (shape < 2.5) {
    // ash: a ragged, tumbling flake
    vec2 q = vP * vec2(1.0, 1.0 + 1.3 * fract(vC.z * 7.13));
    float rr = length(q) + 0.2 * sin(atan(q.y, q.x) * 3.0 + vC.z * 17.0) + 0.1 * sin(atan(q.y, q.x) * 5.0 + vC.z * 5.0);
    a = smoothstep(1.0, 0.72, rr);
    c *= 0.8 + 0.4 * smoothstep(-1.0, 1.0, vP.x * 0.8 + vP.y * 0.4);
  } else if (shape < 3.5) {
    // ember: a flickering point of heat
    float fl = 0.55 + 0.45 * sin(uRotT.z * 19.0 + vC.z * 60.0);
    a = smoothstep(1.0, 0.0, r);
    a *= a;
    o = vec4(vCol.rgb * a * fl, a * 0.5);
    return;
  } else if (shape < 4.5) {
    // blown dust: a big soft veil with ragged edges, lit by the sky and sun
    vec4 nz = texture(uNoise, vP * 0.3 + vC.z);
    a = smoothstep(1.0, 0.1, r + (nz.r - 0.5) * 0.9) * (0.55 + 0.7 * nz.g);
    c = vCol.rgb * (uSky.rgb * 1.2 + uSunCol.rgb * 0.32);
  } else {
    // sand grain: a short bright streak
    a = smoothstep(1.0, 0.0, abs(vP.y)) * smoothstep(1.0, 0.5, abs(vP.x));
    c = vCol.rgb * (uSky.rgb * 1.2 + uSunCol.rgb * 0.4);
  }
  a *= vCol.a;
  o = vec4(c * a, a);
}`,
};

// ---------------------------------------------------------------- distortion
// Heat shimmer over fires and the shock ring of every blast, drawn into a
// small offset texture that the final pass reads.
export const DISTORT = {
  vs: PARTICLE_VS,
  fs: `${HEAD}
in vec2 vP;
in vec4 vCol;
in vec4 vC;
uniform sampler2D uNoise;
out vec4 o;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  vec2 off;
  if (vC.x < 0.5) {
    // shock ring: air pushed outwards in a band behind the front (kind -1 is
    // a half ring, above its centre only)
    float s = (1.0 - r) / 0.2;
    float prof = s > 1.0 ? 0.0 : sin(s * 3.14159) * (1.0 - 0.3 * s);
    if (vC.x < -0.5) prof *= smoothstep(-0.03, 0.12, vP.y);
    off = normalize(vP + 1e-4) * prof * vCol.a;
  } else {
    // heat: rising wobble
    vec4 nz = texture(uNoise, vP * 0.4 + vec2(vC.z, -uRotT.z * 0.9));
    off = (nz.rg - 0.5) * smoothstep(1.0, 0.2, r) * vCol.a;
  }
  // the same push in pixels along both axes
  off *= vec2(1.0, uView.w / uView.z);
  o = vec4(off * 0.5, 0.0, 0.0);
}`,
};

// ---------------------------------------------------------------- post
export const BRIGHT = {
  vs: FULL_VS,
  fs: `${HEAD}
in vec2 vUV;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uThreshold;
out vec4 o;
void main() {
  vec3 c = vec3(0.0);
  // 4-tap box with a Karis-style weight so single bright pixels do not sparkle
  for (int i = 0; i < 4; i++) {
    vec2 d = vec2(i == 0 || i == 2 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0) * uTexel;
    vec3 s = texture(uScene, vUV + d).rgb;
    float l = max(max(s.r, s.g), s.b);
    c += s * max(l - uThreshold, 0.0) / max(l, 1e-4) / (1.0 + l * 0.25);
  }
  o = vec4(c * 0.25, 1.0);
}`,
};

export const DOWN = {
  vs: FULL_VS,
  fs: `${HEAD}
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 o;
void main() {
  vec3 c = texture(uTex, vUV).rgb * 0.5;
  c += texture(uTex, vUV + vec2(-1.0, -1.0) * uTexel).rgb * 0.125;
  c += texture(uTex, vUV + vec2(1.0, -1.0) * uTexel).rgb * 0.125;
  c += texture(uTex, vUV + vec2(-1.0, 1.0) * uTexel).rgb * 0.125;
  c += texture(uTex, vUV + vec2(1.0, 1.0) * uTexel).rgb * 0.125;
  o = vec4(c, 1.0);
}`,
};

export const UP = {
  vs: FULL_VS,
  fs: `${HEAD}
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uWeight;
out vec4 o;
void main() {
  vec3 c = vec3(0.0);
  c += texture(uTex, vUV + vec2(-1.0, -1.0) * uTexel).rgb;
  c += texture(uTex, vUV + vec2(0.0, -1.0) * uTexel).rgb * 2.0;
  c += texture(uTex, vUV + vec2(1.0, -1.0) * uTexel).rgb;
  c += texture(uTex, vUV + vec2(-1.0, 0.0) * uTexel).rgb * 2.0;
  c += texture(uTex, vUV).rgb * 4.0;
  c += texture(uTex, vUV + vec2(1.0, 0.0) * uTexel).rgb * 2.0;
  c += texture(uTex, vUV + vec2(-1.0, 1.0) * uTexel).rgb;
  c += texture(uTex, vUV + vec2(0.0, 1.0) * uTexel).rgb * 2.0;
  c += texture(uTex, vUV + vec2(1.0, 1.0) * uTexel).rgb;
  o = vec4(c / 16.0 * uWeight, 1.0);
}`,
};

export const COMPOSITE = {
  vs: FULL_VS,
  fs: `${HEAD}
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uDistort;
uniform vec4 uPost;    // exposure, bloom strength, chromatic aberration, grain
uniform vec4 uFlash;   // flash colour, amount
uniform vec4 uGrade;   // saturation, contrast, vignette, warmth
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uHdrScale;
out vec4 o;
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec2 off = texture(uDistort, vUV).rg * 0.06;
  vec2 uv = vUV + off;
  vec2 dc = (vUV - 0.5);
  float ca = uPost.z * dot(dc, dc);
  vec3 c;
  c.r = texture(uScene, uv + dc * ca).r;
  c.g = texture(uScene, uv).g;
  c.b = texture(uScene, uv - dc * ca).b;
  c *= uHdrScale;
  c += texture(uBloom, uv).rgb * uPost.y * uHdrScale;
  c *= uPost.x;
  c += uFlash.rgb * uFlash.a;
  c = aces(c);
  // grade
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uGrade.x);
  c = (c - 0.5) * uGrade.y + 0.5;
  c = clamp(c, 0.0, 1.0);
  c = uLift + c * (uGain - uLift);
  c *= mix(vec3(1.0), vec3(1.04, 1.0, 0.94), uGrade.w);
  // vignette
  c *= 1.0 - uGrade.z * smoothstep(0.25, 1.1, length(dc * vec2(1.25, 1.0)) * 1.4);
  // film grain: faint, added after the gamma curve so shadows don't fizz
  vec3 sc = pow(max(c, 0.0), vec3(1.0 / 2.2));
  float g = hash(vUV * vec2(1931.0, 1777.0) + fract(uRotT.z * 13.0) * 100.0) - 0.5;
  sc += g * uPost.w * 0.3 * (0.35 + 0.65 * smoothstep(0.0, 0.5, dot(sc, vec3(0.333))));
  o = vec4(sc, 1.0);
}`.replace('out vec4 o;', `out vec4 o;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`),
};

// a flat colour over the whole target (used to fade the decal overlay)
export const SOLID = {
  vs: FULL_VS,
  fs: `${HEAD}
uniform vec4 uColor;
out vec4 o;
void main() { o = uColor; }`,
};

// Soft contact shadows under tanks, wrecks and props: a dark ellipse laid
// only on the ground's skin, nudged away from the sun.
export const BLOB = {
  vs: `${HEAD}${VIEW}
layout(location = 0) in vec4 aA; // x, y (ground under the middle), half width, strength
const vec2 P[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
out vec2 vL;
out vec2 vWorld;
out float vK;
void main() {
  vec2 p = P[gl_VertexID];
  vL = vec2(p.x * 2.0 - 1.0, p.y * 2.0 - 1.0);
  float hw = aA.z * 1.3;
  float hh = 0.9 + aA.z * 0.12;
  vec2 c = aA.xy + vec2(-uSun.x * 0.9, -0.15);
  vWorld = c + vL * vec2(hw, hh);
  vK = aA.w;
  gl_Position = toClip(vWorld);
}`,
  fs: `${HEAD}
in vec2 vL;
in vec2 vWorld;
in float vK;
uniform sampler2D uMask;
uniform sampler2D uField;
out vec4 o;
void main() {
  vec2 uv = vWorld / uWorld.xy;
  float solid = step(0.5, texture(uMask, uv).r);
  float depth = texture(uField, uv).r;
  float r = length(vL);
  float a = vK * (1.0 - smoothstep(0.25, 1.0, r)) * solid * (1.0 - smoothstep(0.0, 0.2, depth));
  if (a < 0.003) discard;
  o = vec4(0.0, 0.0, 0.0, a);
}`,
};

// solid colour quads (overlays, aim line) in world space
export const LINE = {
  vs: `${HEAD}${VIEW}
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 aCol;
out vec4 vCol;
void main() { vCol = aCol; gl_Position = toClip(aPos); }`,
  fs: `${HEAD}
in vec4 vCol;
out vec4 o;
void main() { o = vec4(vCol.rgb * vCol.a, vCol.a); }`,
};
