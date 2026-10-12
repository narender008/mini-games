// GLSL for every pass. The lit passes share the Frame uniform block: the
// camera, the moon key light, hemispheric ambient, rim light, fog and up to
// MAX_LIGHTS point lights (braziers, candles, soul fire, spells), which light
// floors, cliffs and sprites alike in true 3D.
//
// Space: world metres, x east, y SOUTH, z up. Screen-metres: (x, y*sinE - z*cosE),
// y down the screen. A sprite pixel's height is recovered from how far above
// its ground pivot it sits on screen, so a brazier lights a skeleton's legs
// more than its skull. Sprite normals are stored in camera space (x right,
// y up the screen, z toward the camera) and turned into world space here.

export const MAX_LIGHTS = 24;

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
layout(std140) uniform Frame {
  vec4 uView;   // camera centre (screen-metres x, y); clip units per screen-metre x, y
  vec4 uMisc;   // time, screen-metres per pixel, light count, darkness (0..1, the eclipse)
  vec4 uKey;    // direction toward the moon (world), unused
  vec4 uKeyCol; // moon colour
  vec4 uAmbTop; // ambient from above
  vec4 uAmbBot; // ambient from below
  vec4 uRim;    // rim colour, strength
  vec4 uFog;    // fog colour, density
  vec4 uL[${MAX_LIGHTS * 2}];
};
const float SIN_E = ${Math.sin((50 * Math.PI) / 180).toFixed(6)};
const float COS_E = ${Math.cos((50 * Math.PI) / 180).toFixed(6)};
const vec3 VIEW_DIR = vec3(0.0, COS_E, SIN_E); // toward the camera
`;

const VIEW = `
vec2 screenOf(vec3 w) { return vec2(w.x, w.y * SIN_E - w.z * COS_E); }
vec4 toClip(vec2 s) {
  vec2 d = s - uView.xy;
  return vec4(d.x * uView.z, -d.y * uView.w, 0.0, 1.0);
}
vec2 clipToScreen(vec2 c) { return uView.xy + vec2(c.x / uView.z, -c.y / uView.w); }
`;

const HASH = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
`;

// lighting: n = world normal, p = world position, gloss 0..1, wrap softens the terminator
const LIGHT = `
vec3 camNormal(vec3 c) {
  return normalize(vec3(c.x, -c.y * SIN_E + c.z * COS_E, c.y * COS_E + c.z * SIN_E));
}
vec3 shade(vec3 alb, vec3 n, vec3 p, float gloss, float wrap, out vec3 spec) {
  vec3 amb = mix(uAmbBot.rgb, uAmbTop.rgb, n.z * 0.5 + 0.5);
  float kd = (dot(n, uKey.xyz) + wrap) / (1.0 + wrap);
  vec3 diff = amb + uKeyCol.rgb * max(kd, 0.0);
  float sp = 0.0;
  vec3 hk = normalize(uKey.xyz + VIEW_DIR);
  float shin = mix(10.0, 70.0, gloss);
  spec = uKeyCol.rgb * pow(max(dot(n, hk), 0.0), shin) * gloss * 0.6;
  int nl = int(uMisc.z);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= nl) break;
    vec4 lp = uL[i * 2];
    vec3 L = lp.xyz - p;
    float d2 = dot(L, L);
    if (d2 > lp.w * lp.w) continue;
    float d = sqrt(d2);
    vec3 Ld = L / max(d, 1e-4);
    float att = 1.0 - d / lp.w;
    att *= att;
    vec3 col = uL[i * 2 + 1].rgb * att;
    float ndl = (dot(n, Ld) + wrap) / (1.0 + wrap);
    diff += col * max(ndl, 0.0);
    vec3 h = normalize(Ld + VIEW_DIR);
    spec += col * pow(max(dot(n, h), 0.0), shin) * gloss;
  }
  return alb * diff;
}
`;

const FULL_VS = `${HEAD}${VIEW}
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUV;
out vec2 vScreen;
void main() {
  vec2 p = P[gl_VertexID];
  vUV = p * 0.5 + 0.5;
  vScreen = clipToScreen(p);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// ---------------------------------------------------------------- floor bake
// A room's floor is drawn once into a texture covering its ground rectangle:
// colour (sRGB) and height (alpha: 0 = void, otherwise 0.02..1 relief), from
// the room's cell mask (uMask: R floor kind, G edge distance, B decal id,
// A occlusion from walls and props) and the region's floor function:
//   void floorX(vec2 w, vec4 m, out vec3 col, out float h)
// reading its palette from uC[8] and numbers from uP[4].
export function floorBake(src, fn) {
  return {
    vs: `${HEAD}
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
uniform vec4 uRect;
out vec2 vW;
void main() {
  vec2 p = P[gl_VertexID];
  vW = uRect.xy + (p * 0.5 + 0.5) * uRect.zw;
  gl_Position = vec4(p, 0.0, 1.0);
}`,
    fs: `${HEAD}${HASH}
in vec2 vW;
uniform sampler2D uNoise;
uniform sampler2D uMask;   // one texel per mask cell, linear filtered
uniform vec4 uMaskRect;    // world rect of the mask
uniform vec3 uC[8];
uniform vec4 uP[4];
uniform vec4 uDecal[32];   // rune circles and marks: x, y, radius, kind
uniform int uDecals;
out vec4 o;
float n1(vec2 p) { return texture(uNoise, p).r; }
float n2(vec2 p) { return texture(uNoise, p).g; }
float n3(vec2 p) { return texture(uNoise, p).b; }
float cells(vec2 p) { return texture(uNoise, p).a; }
float fbm(vec2 p) { return n1(p) * 0.5 + n2(p * 2.03) * 0.3 + n3(p * 4.1) * 0.2; }
vec4 maskAt(vec2 w) { return texture(uMask, (w - uMaskRect.xy) / uMaskRect.zw); }
${src}
void main() {
  vec4 m = maskAt(vW);
  vec3 col;
  float h;
  ${fn}(vW, m, col, h);
  o = vec4(max(col, vec3(0.0)), clamp(h, 0.0, 1.0));
}`,
  };
}

// ---------------------------------------------------------------- floor
// The baked floor, lit. Alpha 0 is the void (discarded: the backdrop shows).
export const FLOOR = {
  vs: `${HEAD}${VIEW}
uniform vec4 uRect; // ground rect x, y, w, h
out vec2 vW;
const vec2 P[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
void main() {
  vec2 p = P[gl_VertexID];
  vW = uRect.xy + p * uRect.zw;
  gl_Position = toClip(screenOf(vec3(vW, 0.0)));
}`,
  fs: `${HEAD}${HASH}${LIGHT}
in vec2 vW;
uniform sampler2D uBase;
uniform sampler2D uNoise;
uniform vec4 uRect;
uniform vec2 uTexel;
uniform vec4 uGlow;   // glow colour of the floor's inlays (gold runes), strength
out vec4 o;
void main() {
  vec2 uv = (vW - uRect.xy) / uRect.zw;
  vec4 b = texture(uBase, uv);
  if (b.a < 0.01) discard;
  float hx = texture(uBase, uv + vec2(uTexel.x, 0.0)).a - texture(uBase, uv - vec2(uTexel.x, 0.0)).a;
  float hy = texture(uBase, uv + vec2(0.0, uTexel.y)).a - texture(uBase, uv - vec2(0.0, uTexel.y)).a;
  // fine detail beyond the bake's resolution
  vec4 dn = texture(uNoise, vW * 0.9);
  float det = (dn.b - 0.5) * 0.06;
  vec3 n = normalize(vec3(-hx * 5.0 + det, -hy * 5.0 - det, 1.0));
  vec3 col = b.rgb * (0.94 + dn.g * 0.12);
  vec3 p = vec3(vW, (b.a - 0.5) * 0.04);
  vec3 spec;
  // wet stone: gloss from the height (low = puddle) and the colour's darkness
  float gloss = clamp((0.42 - b.a) * 2.2, 0.0, 0.9) * 0.8 + 0.06;
  vec3 c = shade(col, n, p, gloss, 0.15, spec);
  c += spec * (0.25 + gloss * 0.45);
  // gold inlay glints: bright, slightly yellow parts of the floor catch the light
  float gold = smoothstep(0.08, 0.2, b.r - b.b) * smoothstep(0.18, 0.4, b.r);
  c += gold * spec * 2.0 + gold * uGlow.rgb * uGlow.a * (0.7 + 0.3 * sin(uMisc.x * 1.3 + vW.x * 0.4));
  o = vec4(c, 1.0);
}`,
};

// ---------------------------------------------------------------- cliffs
// The faces of the platform hanging below its south edges, down into the fog:
// a course of big rim stones, rough rock and hanging roots, fading out.
// Instance: aA = x0, x1, y (ground), depth (m); aB = seed, style, unused, unused
export const CLIFF = {
  vs: `${HEAD}${VIEW}
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
const vec2 P[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
out vec2 vUV;    // x along (metres), depth below the floor (metres)
out vec3 vW;
flat out vec4 vB;
flat out vec4 vA;
void main() {
  vec2 p = P[gl_VertexID];
  float x = mix(aA.x, aA.y, p.x);
  float z = -p.y * aA.w;
  vUV = vec2(x, -z);
  vW = vec3(x, aA.z, z);
  vB = aB;
  vA = aA;
  gl_Position = toClip(screenOf(vW));
}`,
  fs: `${HEAD}${HASH}${LIGHT}
in vec2 vUV;
in vec3 vW;
flat in vec4 vB;
flat in vec4 vA;
uniform sampler2D uNoise;
uniform vec3 uC[4];   // rim stone, rock, root, deep colour
out vec4 o;
void main() {
  float d = vUV.y;
  float depth = vA.w;
  float x0 = vA.x, x1 = vA.y;
  // the underside of a floating rock narrows as it goes down, jagged, like an upturned mountain
  float span = x1 - x0;
  float kd = d / depth;
  float jag = texture(uNoise, vec2(d * 0.09 + vB.x, 0.21)).r;
  float jag2 = texture(uNoise, vec2(d * 0.11 + vB.x * 1.3, 0.63)).g;
  float inset = kd * kd * span * 0.48 + (jag - 0.5) * 1.4 * kd + kd * 0.6;
  float inset2 = kd * kd * span * 0.48 + (jag2 - 0.5) * 1.4 * kd + kd * 0.6;
  float l = vUV.x - x0 - inset;
  float r = x1 - inset2 - vUV.x;
  if (l < 0.0 || r < 0.0) discard;
  float bottom = depth * (0.62 + 0.38 * texture(uNoise, vec2(vUV.x * 0.07 + vB.x, 0.3)).r);
  float a = 1.0 - smoothstep(bottom - 1.6, bottom, d);
  if (a < 0.01) discard;
  vec4 nz = texture(uNoise, vUV * vec2(0.16, 0.1) + vB.x);
  vec4 nz2 = texture(uNoise, vUV * vec2(0.45, 0.3) + vB.x * 1.7);
  // facets: the rock turns toward the sides near its edges
  float side = smoothstep(1.2, 0.0, min(l, r)) * sign(r - l);
  vec3 n;
  vec3 col;
  float rimH = 0.7 * vB.y; // aB.y: 1 a cut stone lip, 0 raw rock (the Hollow's roots)
  if (d < rimH) {
    // the lip: the floor's own stones seen edge-on
    float bx = fract(vUV.x / 0.9 + vB.x);
    float joint = smoothstep(0.0, 0.05, bx) * smoothstep(1.0, 0.95, bx);
    col = uC[0] * (0.7 + 0.5 * nz.g) * mix(0.4, 1.0, joint);
    n = normalize(vec3((nz2.r - 0.5) * 0.6 + side * 0.5, 1.0, 0.35 - d / rimH * 0.5));
  } else {
    float strata = sin(d * 2.7 + nz.r * 5.0) * 0.5 + 0.5;
    float crack = smoothstep(0.47, 0.5, abs(fract(vUV.x * 0.6 + nz.b * 1.5) - 0.5));
    col = uC[1] * (0.55 + 0.7 * nz.b) * (0.7 + 0.3 * strata) * (1.0 - crack * 0.5);
    float root = smoothstep(0.84, 0.95, texture(uNoise, vec2(vUV.x * 0.3 + vB.x, d * 0.03)).g) * (1.0 - kd);
    col = mix(col, uC[2], root * 0.9);
    n = normalize(vec3((nz.r - 0.5) * 1.4 + side * 1.2, 1.0, (nz.g - 0.5) * 0.9 + strata * 0.25 - 0.2));
  }
  vec3 spec;
  vec3 c = shade(col, n, vW, 0.04, 0.4, spec);
  // the lip catches light from above
  c += uRim.rgb * uRim.a * 0.25 * smoothstep(0.25, 0.0, d);
  // fog swallows the depths
  float fog = smoothstep(0.3, depth * 0.85, d);
  c = mix(c, uFog.rgb * 0.7, fog * 0.9);
  c = mix(c, uC[3], smoothstep(0.55, 1.0, kd) * 0.85);
  o = vec4(c * a, a);
}`,
};

// ---------------------------------------------------------------- backdrop
// The Undervoid: deep fog with drifting banks (parallax), the glow of the
// moon, distant light from below, and slow motes. uLook: palette per area.
export const BACKDROP = {
  vs: FULL_VS,
  fs: `${HEAD}${HASH}
in vec2 vUV;
in vec2 vScreen;
uniform sampler2D uNoise;
uniform vec3 uSky[6];  // top, bottom, fog bank, glow A, glow B, motes
uniform vec4 uGlowA;   // screen-uv x, y, radius, strength (a glow from the depths)
uniform vec4 uGlowB;
out vec4 o;
void main() {
  float t = uMisc.x;
  vec2 s = vScreen;
  vec3 c = mix(uSky[1], uSky[0], smoothstep(0.0, 1.0, vUV.y));
  // fog banks at three depths, each moving at its own parallax
  for (int i = 0; i < 3; i++) {
    float k = float(i);
    float par = 0.25 + k * 0.22;
    vec2 q = (s - uView.xy * (1.0 - par)) * (0.012 + k * 0.01) + vec2(t * (0.004 + k * 0.003), k * 0.37);
    float f = texture(uNoise, q).r * 0.6 + texture(uNoise, q * 2.3 + 0.17).g * 0.4;
    f = smoothstep(0.42, 0.85, f);
    c = mix(c, uSky[2] * (0.7 + 0.25 * k), f * (0.35 + 0.15 * k));
  }
  // glows rising from the depths
  vec2 a = vUV - uGlowA.xy;
  c += uSky[3] * uGlowA.w * exp(-dot(a, a) / (uGlowA.z * uGlowA.z));
  vec2 b = vUV - uGlowB.xy;
  c += uSky[4] * uGlowB.w * exp(-dot(b, b) / (uGlowB.z * uGlowB.z));
  // motes drifting up
  vec2 g = (s - uView.xy * 0.6) * 0.5 + vec2(0.0, t * 0.08);
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 r = hash22(cell);
  float m = smoothstep(0.06, 0.0, length(f - (r - 0.5) * 0.7)) * step(0.82, hash12(cell + 7.1));
  c += uSky[5] * m * (0.5 + 0.5 * sin(t * 2.0 + r.x * 30.0));
  o = vec4(c, 1.0);
}`,
};

// ---------------------------------------------------------------- sprites
// Instance: aA = x, screen y of the pivot, w, h (screen metres; negative w flips);
// aB = uv rect; aC = left-top offset from the pivot (x, y), atlas layer, ground y;
// aD = white flash, dissolve 0..1, alpha, seed; aE = tint rgb, tint amount
// (> 0: an aura glow in that colour; < 0: an afterimage drawn as light).
const SPRITE_VS = `${HEAD}${VIEW}
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in vec4 aC;
layout(location = 3) in vec4 aD;
layout(location = 4) in vec4 aE;
const vec2 P[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
out vec2 vUV;
out vec2 vScreen;
out vec2 vLocal;
flat out vec4 vC;
flat out vec4 vD;
flat out vec4 vE;
flat out float vFlip;
flat out float vPivotY;
void main() {
  vec2 p = P[gl_VertexID];
  float flip = sign(aA.z);
  vec2 local = vec2(aC.x * flip + p.x * aA.z, aC.y + p.y * aA.w);
  // a flipped sprite mirrors around the pivot: its left offset becomes a right offset
  if (flip < 0.0) local.x = -aC.x - p.x * abs(aA.z);
  vec2 s = aA.xy + local;
  vScreen = s;
  vLocal = p;
  vUV = vec2(mix(aB.x, aB.z, p.x), mix(aB.y, aB.w, p.y));
  vC = aC;
  vD = aD;
  vE = aE;
  vFlip = flip;
  vPivotY = aA.y;
  gl_Position = toClip(s);
}`;

export const SPRITE = {
  vs: SPRITE_VS,
  fs: `${HEAD}${HASH}${LIGHT}
in vec2 vUV;
in vec2 vScreen;
in vec2 vLocal;
flat in vec4 vC;
flat in vec4 vD;
flat in vec4 vE;
flat in float vFlip;
flat in float vPivotY;
uniform sampler2DArray uAlbedo;
uniform sampler2DArray uNormal;
uniform sampler2D uNoise;
out vec4 o;
void main() {
  vec4 al = texture(uAlbedo, vec3(vUV, vC.z));
  float a = al.a * vD.z;
  if (a < 0.008) discard;
  vec4 nm = texture(uNormal, vec3(vUV, vC.z));
  vec2 nxy = nm.rg * 2.0 - 1.0;
  nxy.x *= vFlip;
  vec3 nc = vec3(nxy, sqrt(max(1.0 - dot(nxy, nxy), 0.0)));
  vec3 n = camNormal(nc);
  // the pixel's place in the world: on the sprite's ground row, as high as it sits above the pivot
  float gy = vC.w;
  vec3 p = vec3(vScreen.x, gy, (gy * SIN_E - vScreen.y) / COS_E);
  vec3 spec;
  vec3 c = shade(al.rgb, n, p, nm.b, 0.25, spec);
  c += spec;
  // rim: edges turned away from the camera catch the moon from behind
  float facing = clamp(nc.z, 0.0, 1.0);
  float rim = pow(1.0 - facing, 2.2) * smoothstep(-0.2, 0.6, nc.y);
  c += (al.rgb * 0.6 + 0.4) * uRim.rgb * rim * uRim.a;
  // glowing parts
  c = mix(c, al.rgb * 2.4 + al.rgb * al.rgb * 1.5, nm.a);
  // hit flash
  // hit flash: a brief pale wash, kept under the bloom threshold so the shape still reads
  c = mix(c, vec3(0.92, 0.94, 1.02), vD.x * 0.75);
  // aura (elites, buffs): coloured rim glow
  if (vE.w > 0.0) {
    c += vE.rgb * (rim * 2.5 + 0.15) * vE.w;
  }
  // dissolve into light (deaths): noise threshold with a glowing edge
  if (vD.y > 0.0) {
    float nz = texture(uNoise, vLocal * vec2(0.9, 1.6) + vD.w).r * 0.75 + texture(uNoise, vLocal * 3.1 + vD.w).g * 0.25;
    // dissolve from the top down a little faster, as if blown away
    float th = vD.y * 1.25 - (1.0 - vLocal.y) * 0.2;
    if (nz < th) discard;
    float edge = 1.0 - smoothstep(0.0, 0.09, nz - th);
    c = mix(c, vec3(1.6, 2.6, 3.0), edge);
    a = mix(a, 1.0, edge * 0.5);
  }
  if (vE.w < 0.0) {
    // afterimage: the silhouette as pure light, no cover
    float k = -vE.w;
    o = vec4(vE.rgb * al.a * k * (0.5 + 0.5 * nm.a), 0.0);
    return;
  }
  o = vec4(c * a, a);
}`,
};

// shadows: each standing sprite's silhouette sheared onto the ground away from
// the moon, soft (a blurred mip), plus a contact blob. Same instance layout.
export const SPRITE_SHADOW = {
  vs: `${HEAD}${VIEW}
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in vec4 aC;
layout(location = 3) in vec4 aD;
layout(location = 4) in vec4 aE;
const vec2 P[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
uniform vec2 uShear; // ground offset per metre of height (x, y)
out vec2 vUV;
flat out float vLayer;
flat out float vAlpha;
void main() {
  vec2 p = P[gl_VertexID];
  float flip = sign(aA.z);
  vec2 local = vec2(aC.x + p.x * abs(aA.z), aC.y + p.y * aA.w);
  if (flip < 0.0) local.x = -aC.x - p.x * abs(aA.z);
  // height of this corner above the pivot, then laid flat along the shadow direction
  float z = -local.y / COS_E;
  vec2 g = vec2(aA.x + local.x + z * uShear.x, aC.w + z * uShear.y);
  vUV = vec2(mix(aB.x, aB.z, p.x), mix(aB.y, aB.w, p.y));
  vLayer = aC.z;
  vAlpha = aD.z * (1.0 - aD.y);
  gl_Position = toClip(vec2(g.x, g.y * SIN_E));
}`,
  fs: `${HEAD}
in vec2 vUV;
flat in float vLayer;
flat in float vAlpha;
uniform sampler2DArray uAlbedo;
uniform float uStrength;
out vec4 o;
void main() {
  float a = texture(uAlbedo, vec3(vUV, vLayer), 2.5).a;
  a = smoothstep(0.15, 0.85, a) * uStrength * vAlpha;
  if (a < 0.004) discard;
  o = vec4(0.0, 0.0, 0.0, a);
}`,
};

// soft contact blobs under everything that stands: aA = x, y (ground), radius, strength
export const BLOB = {
  vs: `${HEAD}${VIEW}
layout(location = 0) in vec4 aA;
const vec2 P[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
out vec2 vP;
flat out float vK;
void main() {
  vec2 p = P[gl_VertexID];
  vP = p;
  vK = aA.w;
  gl_Position = toClip(screenOf(vec3(aA.xy + p * aA.z, 0.0)));
}`,
  fs: `${HEAD}
in vec2 vP;
flat in float vK;
out vec4 o;
void main() {
  float r = length(vP);
  float a = vK * (1.0 - smoothstep(0.2, 1.0, r));
  if (a < 0.004) discard;
  o = vec4(0.0, 0.0, 0.0, a);
}`,
};

// far ruins in the void: albedo darkened and hazed toward the fog, windows glowing.
// Same instance layout as sprites; aE.w = haze 0..1.
export const FAR = {
  vs: SPRITE_VS,
  fs: `${HEAD}
in vec2 vUV;
in vec2 vScreen;
in vec2 vLocal;
flat in vec4 vC;
flat in vec4 vD;
flat in vec4 vE;
flat in float vFlip;
flat in float vPivotY;
uniform sampler2DArray uAlbedo;
uniform sampler2DArray uNormal;
out vec4 o;
void main() {
  vec4 al = texture(uAlbedo, vec3(vUV, vC.z));
  float a = al.a * vD.z;
  if (a < 0.01) discard;
  vec4 nm = texture(uNormal, vec3(vUV, vC.z));
  vec2 nxy = nm.rg * 2.0 - 1.0;
  nxy.x *= vFlip;
  float lit = 0.35 + 0.65 * max(dot(normalize(vec3(nxy, 0.6)), normalize(vec3(-0.5, 0.6, 0.6))), 0.0);
  vec3 c = al.rgb * uKeyCol.rgb * lit * 0.7;
  float rim = pow(1.0 - clamp(sqrt(max(1.0 - dot(nxy, nxy), 0.0)), 0.0, 1.0), 2.0);
  c += uRim.rgb * rim * 0.35;
  c = mix(c, uFog.rgb, vE.w);
  c += al.rgb * nm.a * 2.0 * (1.0 - vE.w * 0.6);
  o = vec4(c * a, a);
}`,
};

// ---------------------------------------------------------------- ground effects
// Shapes painted on the ground in the ground plane (so they squash like the
// floor): telegraphs, rune circles, rings, glow pools, crescent waves.
// Instance: aA = x, y, size x, size y (half extents, m); aB = colour rgba;
// aC = kind, progress 0..1, rotation, seed; aD = params (per kind).
export const GROUND_FX = {
  vs: `${HEAD}${VIEW}
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in vec4 aC;
layout(location = 3) in vec4 aD;
const vec2 P[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
out vec2 vP;
flat out vec4 vB;
flat out vec4 vC;
flat out vec4 vD;
void main() {
  vec2 p = P[gl_VertexID];
  vP = p;
  vB = aB;
  vC = aC;
  vD = aD;
  float c = cos(aC.z), s = sin(aC.z);
  vec2 q = p * aA.zw;
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  gl_Position = toClip(screenOf(vec3(aA.xy + q, 0.0)));
}`,
  fs: `${HEAD}${HASH}
in vec2 vP;
flat in vec4 vB;
flat in vec4 vC;
flat in vec4 vD;
uniform sampler2D uNoise;
out vec4 o;
const float PI = 3.14159265;
// a rune ring: glyph-like ticks and crescents between two circles
float runes(vec2 p, float r0, float r1, float seed, float turn) {
  float r = length(p);
  float ang = atan(p.y, p.x) + turn;
  float band = step(r0, r) * step(r, r1);
  float u = ang / (2.0 * PI) * 28.0;
  float cell = floor(u);
  float fu = fract(u);
  float h = hash11(cell + seed * 13.0);
  float v = (r - r0) / (r1 - r0);
  float glyph = 0.0;
  glyph += step(abs(fu - 0.5), 0.06) * step(0.2, v) * step(v, 0.8) * step(0.3, h);
  glyph += step(abs(v - 0.5), 0.07) * step(0.2, fu) * step(fu, 0.8) * step(h, 0.7);
  glyph += (1.0 - smoothstep(0.08, 0.14, length(vec2(fu - 0.5, (v - 0.5) * 0.6)))) * step(0.85, h);
  return glyph * band;
}
void main() {
  int kind = int(vC.x + 0.5);
  float t = vC.y;
  float r = length(vP);
  float a = 0.0;
  vec3 col = vB.rgb;
  float time = uMisc.x;
  if (kind == 0) {
    // telegraph circle: fill grows to the edge over the wind-up, edge brightens
    if (r > 1.0) discard;
    float fill = step(r, t) * (0.25 + 0.2 * smoothstep(t - 0.15, t, r));
    float edge = smoothstep(0.92, 0.97, r) * (1.0 - smoothstep(0.98, 1.0, r));
    a = fill * 0.6 + edge * (0.5 + t * 0.5);
  } else if (kind == 1) {
    // telegraph cone: vD.x = half angle; local +x is the aim direction
    if (r > 1.0) discard;
    float ang = abs(atan(vP.y, vP.x));
    float inside = 1.0 - smoothstep(vD.x - 0.02, vD.x, ang);
    float fill = step(r, t) * (0.25 + 0.2 * smoothstep(t - 0.15, t, r));
    float edge = max(smoothstep(0.93, 0.98, r) * (1.0 - smoothstep(0.99, 1.0, r)), (1.0 - smoothstep(0.0, 0.025, abs(ang - vD.x) * r)) * step(ang, vD.x + 0.03));
    a = (fill * 0.6 + edge * (0.5 + t * 0.5)) * inside + edge * (1.0 - inside) * step(ang, vD.x + 0.05);
  } else if (kind == 2) {
    // telegraph line (rectangle along +x from -1 to 1): fill sweeps forward
    float u = vP.x * 0.5 + 0.5;
    float fill = step(u, t) * (0.16 + 0.22 * smoothstep(t - 0.12, t, u));
    float edge = smoothstep(0.9, 0.97, abs(vP.y)) + smoothstep(0.97, 0.995, abs(vP.x)) * 0.8;
    a = fill + clamp(edge, 0.0, 1.0) * (0.45 + 0.5 * t);
  } else if (kind == 3) {
    // telegraph ring (donut): vD.x = inner radius 0..1
    if (r > 1.0) discard;
    float inr = step(vD.x, r);
    float fill = inr * 0.3 * smoothstep(0.0, 1.0, t);
    float edge = (smoothstep(vD.x - 0.03, vD.x, r) * (1.0 - smoothstep(vD.x, vD.x + 0.03, r))) + smoothstep(0.94, 0.98, r) * (1.0 - smoothstep(0.98, 1.0, r));
    a = fill + edge * (0.5 + 0.5 * t);
  } else if (kind == 4) {
    // the moon rune (Maelis's cast): two turning rune rings and a crescent, charging up
    if (r > 1.0) discard;
    float turn = time * 0.7;
    float g = runes(vP, 0.66, 0.84, vC.w, turn) + runes(vP, 0.38, 0.5, vC.w + 3.0, -turn * 1.6) * 0.8;
    float rings = exp(-pow((r - 0.9) / 0.025, 2.0)) + exp(-pow((r - 0.6) / 0.018, 2.0)) * 0.8 + exp(-pow((r - 0.34) / 0.016, 2.0)) * 0.6;
    vec2 q = vP;
    float cres = smoothstep(0.24, 0.21, length(q)) * smoothstep(0.17, 0.2, length(q - vec2(0.08, 0.04)));
    float charge = 0.4 + 0.6 * t;
    a = (g * 0.9 + rings + cres * 1.2) * charge + (1.0 - smoothstep(0.0, 0.9, r)) * 0.12 * t;
  } else if (kind == 5) {
    // shockwave ring expanding: t = 0..1
    float w = 0.12 * (1.0 - t * 0.6);
    float d = (r - t) / w;
    float band = exp(-d * d * 2.0);
    float u = atan(vP.y, vP.x);
    float broken = 0.6 + 0.6 * texture(uNoise, vec2(u * 0.4, vC.w + t * 0.3)).r;
    a = band * broken * (1.0 - t) * 1.4;
  } else if (kind == 6) {
    // soft glow pool (light on the floor)
    a = exp(-r * r * 3.0) * (1.0 - smoothstep(0.9, 1.0, r));
  } else if (kind == 7) {
    // decorative rune circle on the floor (doors, fountains, reward pedestals), slowly turning
    if (r > 1.0) discard;
    float g = runes(vP, 0.72, 0.9, vC.w, time * 0.15);
    float rings = exp(-pow((r - 0.95) / 0.02, 2.0)) + exp(-pow((r - 0.68) / 0.015, 2.0));
    a = (g + rings) * (0.55 + 0.45 * sin(time * 1.4 + vC.w * 5.0));
  } else if (kind == 8) {
    // spawn sigil: a soul-light circle where something is about to rise
    if (r > 1.0) discard;
    float rings = exp(-pow((r - 0.85 * t) / 0.05, 2.0));
    float core = (1.0 - smoothstep(0.0, 0.7, r)) * t * 0.6;
    float g = runes(vP, 0.55, 0.75, vC.w, time * 1.5) * t;
    a = rings + core + g * 0.8;
  } else {
    // dash/footstep frost or scorch mark: noisy blot fading out (t = age)
    if (r > 1.0) discard;
    float nz = texture(uNoise, vP * 0.3 + vC.w).r;
    a = (1.0 - smoothstep(0.3, 1.0, r + (nz - 0.5) * 0.5)) * (1.0 - t);
  }
  a *= vB.a;
  if (a < 0.003) discard;
  o = vec4(col * a, 0.0);
}`,
};

// ---------------------------------------------------------------- GPU bursts
// A burst is one instance record; the vertex shader animates COUNT particles
// from it analytically (no per-particle CPU work). Each instance below is one
// particle: the burst attributes advance once per COUNT instances (divisor).
// aA = x, y, z, start time; aB = colour rgba; aC = kind, count, seed, scale;
// aD = direction x, y, z (velocity bias), spread.
export const BURST_COUNT = 24;
export const BURST = {
  vs: `${HEAD}${VIEW}${HASH}
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in vec4 aC;
layout(location = 3) in vec4 aD;
const vec2 P[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
out vec2 vP;
out vec4 vCol;
flat out float vKind;
flat out float vLife;
void main() {
  int i = gl_InstanceID % ${BURST_COUNT};
  vec2 corner = P[gl_VertexID];
  vP = corner;
  float kind = aC.x;
  vKind = kind;
  float seed = aC.z + float(i) * 7.31;
  float age = uMisc.x - aA.w;
  if (float(i) >= aC.y || age < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vLife = 1.0; vCol = vec4(0.0); return; }
  vec3 h = vec3(hash11(seed), hash11(seed + 1.7), hash11(seed + 3.1));
  vec3 h2 = vec3(hash11(seed + 5.3), hash11(seed + 8.9), hash11(seed + 11.3));
  float sc = aC.w;
  vec3 pos = aA.xyz;
  float life = 1.0;
  float size = 0.06 * sc;
  float stretch = 0.0;
  vec2 vel2 = vec2(0.0);
  vec4 col = aB;
  if (kind < 0.5) {
    // shatter into light: shards of soul light thrown out and up, falling, fading
    float L = 0.55 + 0.6 * h.x;
    life = age / L;
    float ang = h.y * 6.2832;
    float sp = (1.5 + 3.5 * h.z) * sc;
    vec3 v = vec3(cos(ang) * sp, sin(ang) * sp * 0.8, 2.0 + 3.5 * h2.x) + aD.xyz * aD.w;
    pos += v * age + vec3(0.0, 0.0, -6.0) * age * age * 0.5;
    pos.z = max(pos.z, 0.02);
    size = (0.035 + 0.05 * h2.y) * sc * (1.0 - life * 0.6);
    vel2 = vec2(v.x, v.y * SIN_E - (v.z - 6.0 * age) * COS_E);
    stretch = 0.5;
  } else if (kind < 1.5) {
    // soul wisps: rise slowly, swaying, glowing
    float L = 1.2 + 1.2 * h.x;
    life = age / L;
    float ang = h.y * 6.2832;
    float rad = (0.2 + 0.7 * h.z) * sc;
    pos += vec3(cos(ang) * rad * (0.4 + life), sin(ang) * rad * (0.4 + life) * 0.6, 0.3 + age * (0.8 + 1.0 * h2.x));
    pos.x += sin(age * 3.0 + h2.y * 6.0) * 0.15 * sc;
    size = (0.05 + 0.08 * h2.z) * sc * (1.0 - life * 0.5);
  } else if (kind < 2.5) {
    // bone dust and grit: low, spreading along the ground, settling
    float L = 0.8 + 0.8 * h.x;
    life = age / L;
    float ang = h.y * 6.2832;
    float sp = (0.8 + 2.4 * h.z) * sc;
    float k = 1.0 - exp(-age * 4.0);
    pos += vec3(cos(ang) * sp, sin(ang) * sp * 0.8, 0.0) * k * 0.4 + vec3(0.0, 0.0, 0.1 + 0.5 * h2.x * k * (1.0 - life));
    size = (0.08 + 0.12 * h2.y) * sc * (0.6 + life);
  } else if (kind < 3.5) {
    // sparks: fast streaks with gravity
    float L = 0.25 + 0.3 * h.x;
    life = age / L;
    float ang = h.y * 6.2832;
    float sp = (4.0 + 7.0 * h.z) * sc;
    vec3 v = vec3(cos(ang) * sp, sin(ang) * sp, 1.0 + 4.0 * h2.x) + aD.xyz * aD.w;
    pos += v * age + vec3(0.0, 0.0, -9.0) * age * age * 0.5;
    pos.z = max(pos.z, 0.01);
    size = 0.025 * sc;
    vel2 = vec2(v.x, v.y * SIN_E - (v.z - 9.0 * age) * COS_E);
    stretch = 1.6;
  } else if (kind < 4.5) {
    // embers rising from a flame
    float L = 0.9 + 0.9 * h.x;
    life = age / L;
    pos += vec3((h.y - 0.5) * 0.3 * sc + sin(age * 4.0 + h.z * 6.0) * 0.08, (h2.x - 0.5) * 0.2, age * (0.7 + 0.8 * h2.y));
    size = (0.018 + 0.02 * h.z) * sc;
  } else if (kind < 5.5) {
    // magic motes: a ring of light points flung outward from a cast, slowing
    float L = 0.5 + 0.5 * h.x;
    life = age / L;
    float ang = (float(i) + h.y * 0.5) / aC.y * 6.2832;
    float k = 1.0 - exp(-age * 5.0);
    float rad = (1.0 + 2.0 * h.z) * sc * k;
    pos += vec3(cos(ang) * rad, sin(ang) * rad, 0.15 + h2.x * 1.2 * k);
    size = (0.03 + 0.04 * h2.y) * sc;
  } else {
    // smoke puff (dark, slow)
    float L = 1.4 + 1.0 * h.x;
    life = age / L;
    pos += vec3((h.y - 0.5) * 0.6, (h.z - 0.5) * 0.4, 0.2 + age * 0.6) * sc;
    size = (0.2 + 0.25 * h2.x) * sc * (0.6 + life);
  }
  if (life >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vLife = 1.0; vCol = vec4(0.0); return; }
  vLife = life;
  vCol = col;
  vec2 s = screenOf(pos);
  vec2 q = corner * size;
  if (stretch > 0.0 && dot(vel2, vel2) > 0.01) {
    vec2 d = normalize(vel2);
    float len = size * (1.0 + stretch * length(vel2) * 0.05);
    q = d * corner.x * len + vec2(-d.y, d.x) * corner.y * size;
  }
  gl_Position = toClip(s + vec2(q.x, q.y));
}`,
  fs: `${HEAD}
in vec2 vP;
in vec4 vCol;
flat in float vKind;
flat in float vLife;
out vec4 o;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float fade = 1.0 - vLife;
  if (vKind > 5.5) {
    float a = (1.0 - smoothstep(0.3, 1.0, r)) * fade * vCol.a * 0.5;
    o = vec4(vCol.rgb * a, a);
    return;
  }
  if (vKind > 1.5 && vKind < 2.5) {
    // dust covers a little
    float a = (1.0 - smoothstep(0.2, 1.0, r)) * fade * fade * vCol.a * 0.55;
    o = vec4(vCol.rgb * a, a * 0.6);
    return;
  }
  float core = exp(-r * r * 6.0);
  float a = core * fade * vCol.a;
  o = vec4(vCol.rgb * a * 1.6, 0.0);
}`,
};

// ---------------------------------------------------------------- arcs
// Crescent slashes and waves: a ribbon along an arc at some height, lying in a
// plane parallel to the ground (so it squashes like the floor, as a blade's
// sweep would). gl_VertexID walks the ribbon; one instance per arc.
// aA = centre x, y, z, radius; aB = colour rgba; aC = start angle, sweep (signed), width, progress 0..1;
// aD = kind (0 blade slash, 1 crescent wave, 2 whirl ring), seed, fade, unused.
export const ARC_SEGMENTS = 32;
export const ARC = {
  vs: `${HEAD}${VIEW}
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in vec4 aC;
layout(location = 3) in vec4 aD;
out vec2 vT; // along 0..1, across -1..1
flat out vec4 vB;
flat out vec4 vC;
flat out vec4 vD;
void main() {
  int seg = gl_VertexID / 2;
  float side = float(gl_VertexID % 2) * 2.0 - 1.0;
  float u = float(seg) / float(${ARC_SEGMENTS});
  float ang = aC.x + aC.y * u;
  // the ribbon is widest in its middle and tapers to points
  float w = aC.z * (0.25 + 0.75 * sin(3.14159 * u));
  float rad = aA.w + side * w * 0.5;
  vec3 p = vec3(aA.x + cos(ang) * rad, aA.y + sin(ang) * rad, aA.z);
  vT = vec2(u, side);
  vB = aB;
  vC = aC;
  vD = aD;
  gl_Position = toClip(screenOf(p));
}`,
  fs: `${HEAD}
in vec2 vT;
flat in vec4 vB;
flat in vec4 vC;
flat in vec4 vD;
uniform sampler2D uNoise;
out vec4 o;
void main() {
  float u = vT.x;
  float t = vC.w;
  // the lit part: a head that sweeps along the arc with a fading tail behind it
  float head = t * 1.25;
  float tail = head - 0.75;
  float k = smoothstep(tail, head, u) * (1.0 - smoothstep(head, head + 0.06, u));
  if (vD.x > 0.5) k = 0.85 + 0.15 * sin(u * 3.14159); // a crescent wave: lit all along
  float across = 1.0 - abs(vT.y);
  float edge = pow(across, 0.6);
  float streak = 0.75 + 0.5 * texture(uNoise, vec2(u * 3.0 + vD.y, vT.y * 0.2 + vD.y)).r;
  float bright = k * edge * streak;
  // a hot white leading edge on the outer side
  float lead = smoothstep(0.2, 1.0, vT.y) * k;
  vec3 c = vB.rgb * bright + vec3(1.4, 1.5, 1.7) * lead * k * 0.9;
  float a = bright * vB.a * (1.0 - vD.z);
  if (a < 0.003) discard;
  o = vec4(c * vB.a * (1.0 - vD.z), 0.0);
}`,
};

// ---------------------------------------------------------------- glows
// Screen-facing glowing things in the air: projectiles, flames, orbs, beams.
// aA = x, y, z, size; aB = colour rgba; aC = kind, seed, stretch, rotation (screen);
// aD = params. Kinds: 0 glow, 1 soul orb (enemy), 2 moon bolt, 3 flame (candle/brazier),
// 4 soul flame (cyan brazier), 5 pillar of light, 6 blessing orb, 7 lens flare star.
export const GLOW = {
  vs: `${HEAD}${VIEW}
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in vec4 aC;
layout(location = 3) in vec4 aD;
const vec2 P[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
out vec2 vP;
flat out vec4 vB;
flat out vec4 vC;
flat out vec4 vD;
void main() {
  vec2 p = P[gl_VertexID];
  vP = p;
  vB = aB;
  vC = aC;
  vD = aD;
  int kind = int(aC.x + 0.5);
  vec2 q = p * aA.w;
  if (kind == 3 || kind == 4) q.y = (p.y - 0.6) * aA.w * 1.9; // flames are tall, anchored at their base
  if (kind == 5) q = vec2(p.x * aA.w, (p.y - 1.0) * aD.x);    // a pillar rising from the point
  q.x *= 1.0 + aC.z;
  float c = cos(aC.w), s = sin(aC.w);
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  gl_Position = toClip(screenOf(aA.xyz) + q);
}`,
  fs: `${HEAD}${HASH}
in vec2 vP;
flat in vec4 vB;
flat in vec4 vC;
flat in vec4 vD;
uniform sampler2D uNoise;
out vec4 o;
void main() {
  int kind = int(vC.x + 0.5);
  float r = length(vP);
  float t = uMisc.x;
  vec3 c = vec3(0.0);
  float cover = 0.0;
  if (kind == 0) {
    c = vB.rgb * exp(-r * r * 4.0);
  } else if (kind == 1) {
    // enemy soul orb: a dark heart in a sickly teal halo, flickering
    float core = 1.0 - smoothstep(0.22, 0.32, r);
    float ring = smoothstep(0.25, 0.35, r) * (1.0 - smoothstep(0.38, 0.55, r));
    float halo = exp(-r * r * 3.5) * (0.85 + 0.15 * sin(t * 20.0 + vC.y * 40.0));
    c = vB.rgb * (halo * 1.5 + ring * 2.0) + vec3(0.04, 0.02, 0.06) * core;
    cover = core * 0.85;
  } else if (kind == 2) {
    // moon bolt: white-hot core with a cyan comet glow
    float core = exp(-r * r * 30.0);
    float glow = exp(-r * r * 4.0);
    c = vB.rgb * glow * 1.3 + vec3(1.8, 2.0, 2.2) * core;
  } else if (kind == 3 || kind == 4) {
    // flame: teardrop of turbulent fire, hot at the base
    vec2 q = vP;
    float y = 0.5 - q.y * 0.5; // 0 bottom .. 1 top (screen y runs down)
    vec4 nz = texture(uNoise, vec2(q.x * 0.25 + vC.y, y * 0.4 - t * 0.9));
    float w = mix(0.75, 0.05, pow(y, 0.8)) + (nz.r - 0.5) * 0.35;
    float body = 1.0 - smoothstep(w * 0.6, w, abs(q.x + (nz.g - 0.5) * 0.4 * y));
    body *= smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.7, 1.0, y + (nz.b - 0.5) * 0.3));
    vec3 hot = kind == 3 ? vec3(3.2, 1.6, 0.5) : vec3(1.4, 3.0, 3.4);
    vec3 cool = vB.rgb;
    c = mix(cool, hot, smoothstep(0.55, 0.0, y) * smoothstep(0.6, 0.0, abs(q.x))) * body * 1.2;
    c += vB.rgb * exp(-dot(q, q) * 1.5) * 0.25;
  } else if (kind == 5) {
    // pillar of light rising (blessing altars, exits): soft vertical beam with rising streaks
    float x = abs(vP.x);
    float y = 0.5 - vP.y * 0.5; // 0 at the base .. 1 at the top
    float beam = exp(-x * x * 6.0) * smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(0.45, 1.0, y));
    float streak = texture(uNoise, vec2(vP.x * 0.4 + vC.y, y * 0.6 - t * 0.25)).g;
    c = vB.rgb * beam * (0.6 + 0.8 * streak);
  } else if (kind == 6) {
    // blessing orb: a sphere of light with the patron's colour and a turning sigil
    float body = 1.0 - smoothstep(0.42, 0.5, r);
    float rim = smoothstep(0.3, 0.5, r) * body;
    float halo = exp(-r * r * 3.0);
    float ang = atan(vP.y, vP.x) + t * 0.8;
    float sig = step(0.88, sin(ang * 4.0) * 0.5 + 0.5) * step(abs(r - 0.32), 0.04);
    c = vB.rgb * (halo * 1.2 + rim * 1.5 + sig * 2.0) + vec3(1.5) * exp(-r * r * 40.0) * 0.8;
    cover = body * 0.4;
  } else if (kind == 8) {
    // arrow in flight (local +x is its heading): a dark shaft, a hot head and a fading trail
    vec2 q = vP;
    float shaft = (1.0 - smoothstep(0.03, 0.07, abs(q.y))) * step(-0.55, q.x) * step(q.x, 0.55);
    float head = 1.0 - smoothstep(0.08, 0.22, length(vec2((q.x - 0.62) * 1.4, q.y)));
    float trail = (1.0 - smoothstep(0.0, 0.25, abs(q.y))) * smoothstep(-1.0, 0.4, q.x) * step(q.x, 0.4);
    c = vB.rgb * (head * 2.4 + trail * 0.6);
    cover = shaft * 0.9;
  } else {
    // star flare: cross streaks
    float a = exp(-abs(vP.x) * 18.0) * exp(-abs(vP.y) * 2.5) + exp(-abs(vP.y) * 18.0) * exp(-abs(vP.x) * 2.5);
    c = vB.rgb * (a + exp(-r * r * 20.0));
  }
  // every kind fades to nothing at its quad's edge, so no glow ever shows a box (bloom would find it)
  c *= vB.a * (1.0 - smoothstep(0.82, 1.0, max(abs(vP.x), abs(vP.y))));
  o = vec4(c, cover * vB.a);
}`,
};

// damage numbers and pop-up text: glyphs from a canvas-drawn sheet.
// aA = x, y (screen metres), size, unused; aB = colour; aC = glyph index, unused, unused, width scale
export const TEXT = {
  vs: `${HEAD}${VIEW}
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in vec4 aC;
const vec2 P[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
uniform vec2 uGrid;
out vec2 vUV;
out vec4 vCol;
void main() {
  vec2 p = P[gl_VertexID];
  float g = aC.x;
  vec2 cell = vec2(mod(g, uGrid.x), floor(g / uGrid.x));
  vUV = (cell + p * 0.5 + 0.5) / uGrid;
  vCol = aB;
  gl_Position = toClip(aA.xy + p * aA.z * vec2(0.5 * aC.w, 0.5));
}`,
  fs: `${HEAD}
in vec2 vUV;
in vec4 vCol;
uniform sampler2D uGlyphs;
out vec4 o;
void main() {
  vec4 g = texture(uGlyphs, vUV);
  vec3 c = vCol.rgb * g.r * 1.5;
  float a = g.a * vCol.a;
  if (a < 0.01) discard;
  o = vec4(c * vCol.a, a);
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
  for (int i = 0; i < 4; i++) {
    vec2 d = vec2(i == 0 || i == 2 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0) * uTexel;
    vec3 s = texture(uScene, vUV + d).rgb;
    float l = max(max(s.r, s.g), s.b);
    c += s * max(l - uThreshold, 0.0) / max(l, 1e-4) / (1.0 + l * 0.15);
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
  o = vec4(c / 16.0, 1.0);
}`,
};

// tone map, grade and finish: filmic curve, lift/gamma/gain split-toned per
// area, saturation, contrast, a slow drifting mist, vignette, low-health
// edge, flashes, chromatic aberration on big hits, and dither.
export const COMPOSITE = {
  vs: FULL_VS,
  fs: `${HEAD}${HASH}
in vec2 vUV;
in vec2 vScreen;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uNoise;
uniform vec4 uPost;   // exposure, bloom strength, chromatic aberration, saturation
uniform vec4 uFlash;  // flash colour, amount
uniform vec4 uGrade;  // contrast, vignette, low-health edge, desaturate
uniform vec3 uLift;   // shadows tint
uniform vec3 uGain;   // highlights tint
uniform vec4 uMist;   // mist colour, amount
out vec4 o;
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec2 dc = vUV - 0.5;
  float ca = uPost.z * dot(dc, dc);
  vec3 c;
  c.r = texture(uScene, vUV + dc * ca).r;
  c.g = texture(uScene, vUV).g;
  c.b = texture(uScene, vUV - dc * ca).b;
  c += texture(uBloom, vUV).rgb * uPost.y;
  // drifting mist, thicker low on the screen
  vec2 mq = vScreen * 0.035 + vec2(uMisc.x * 0.01, uMisc.x * 0.004);
  float m = texture(uNoise, mq).r * 0.6 + texture(uNoise, mq * 2.7 + 0.3).g * 0.4;
  c = mix(c, uMist.rgb, smoothstep(0.45, 0.9, m) * uMist.a);
  c *= uPost.x;
  c += uFlash.rgb * uFlash.a;
  c = aces(max(c, 0.0) * 0.9);
  // split tone: lift the shadows toward one colour, tint the highlights another
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = c + uLift * (1.0 - smoothstep(0.0, 0.5, l)) * 0.06;
  c = c * mix(vec3(1.0), uGain, smoothstep(0.3, 1.0, l));
  vec3 g = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  float lg = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(lg), g, uPost.w * (1.0 - uGrade.w));
  g = (g - 0.5) * uGrade.x + 0.5;
  float v = length(dc * vec2(1.0, 0.85));
  g *= 1.0 - uGrade.y * smoothstep(0.32, 0.85, v);
  g = mix(g, vec3(0.42, 0.04, 0.12), uGrade.z * smoothstep(0.28, 0.75, v));
  g += (hash12(vUV * 1931.0 + fract(uMisc.x * 7.0) * 91.0) - 0.5) / 255.0;
  o = vec4(clamp(g, 0.0, 1.0), 1.0);
}`,
};
