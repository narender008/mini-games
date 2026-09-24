// GLSL shared by the ground materials: hashing and value noise, periodic
// noise and cells for baking tileable maps, the wet map lookup, and the
// planting-hole profile (kept in step with holeHeight() in soil.js).

// Runtime noise (world space).
export const NOISE_GLSL = /* glsl */ `
float gHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 gHash3(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float gNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float gFbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * gNoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.13;
    a *= 0.5;
  }
  return s;
}
`;

// Periodic noise for baking tileable maps: every function repeats with
// period p (in lattice cells), so a map baked over uv 0..1 tiles seamlessly.
export const BAKE_GLSL = /* glsl */ `
float hp(vec2 i, float p) {
  i = mod(i, p);
  vec3 p3 = fract(vec3(i.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hp3(vec2 i, float p) {
  i = mod(i, p);
  vec3 p3 = fract(vec3(i.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float vnP(vec2 x, float p) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hp(i, p), hp(i + vec2(1.0, 0.0), p), u.x), mix(hp(i + vec2(0.0, 1.0), p), hp(i + vec2(1.0, 1.0), p), u.x), u.y);
}
float fbmP(vec2 x, float p, int oct) {
  float s = 0.0;
  float a = 0.5;
  float n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * vnP(x, p);
    n += a;
    x *= 2.0;
    p *= 2.0;
    a *= 0.5;
  }
  return s / n;
}
// Cellular noise: distance to the nearest and second nearest feature point,
// the nearest cell's lattice id and the offset to its feature point.
struct Cell { float f1; float f2; vec2 id; vec2 d; };
Cell cellP(vec2 x, float p, float jitter) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  Cell c;
  c.f1 = 9.0;
  c.f2 = 9.0;
  c.id = vec2(0.0);
  c.d = vec2(0.0);
  for (int y = -1; y <= 1; y++)
    for (int k = -1; k <= 1; k++) {
      vec2 o = vec2(float(k), float(y));
      vec3 r = hp3(i + o, p);
      vec2 d = o + 0.5 + (r.xy - 0.5) * jitter - f;
      float l = length(d);
      if (l < c.f1) {
        c.f2 = c.f1;
        c.f1 = l;
        c.id = mod(i + o, p);
        c.d = d;
      } else if (l < c.f2) c.f2 = l;
    }
  return c;
}
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
vec3 s2l(vec3 c) { return pow(c, vec3(2.2)); }
`;

// The wet map: R is how damp the ground is (dries over a couple of
// minutes), G is standing surface water that glistens (soaks in faster).
export const WET_GLSL = /* glsl */ `
uniform sampler2D uWetMap;
uniform vec4 uWetBox;
uniform vec2 uWetAll;
vec2 wetAt(vec2 xz) {
  vec2 uv = (xz - uWetBox.xy) * uWetBox.zw;
  vec2 w = texture2D(uWetMap, clamp(uv, 0.0, 1.0)).rg;
  vec2 e = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return max(w * e.x * e.y, uWetAll);
}
`;

// Planting holes: a soft bowl with a low rim of loosened soil around it.
// x, z, radius, depth (metres; depth 0 = unused slot).
export const MAX_HOLES = 24;
export const HOLES_GLSL = /* glsl */ `
#define MAX_HOLES ${MAX_HOLES}
uniform vec4 uHoles[MAX_HOLES];
float holeProfile(float r) {
  float b = max(0.0, 1.0 - r * r);
  float q = (r - 1.12) / 0.3;
  return -b * b + 0.38 * exp(-q * q);
}
float holeSlope(float r) {
  float b = max(0.0, 1.0 - r * r);
  float q = (r - 1.12) / 0.3;
  return 4.0 * r * b - 0.38 * exp(-q * q) * 2.0 * q / 0.3;
}
float holeHeight(vec2 xz) {
  float h = 0.0;
  for (int i = 0; i < MAX_HOLES; i++) {
    vec4 H = uHoles[i];
    if (H.w <= 0.0) continue;
    float r = length(xz - H.xy) / H.z;
    if (r < 2.0) h += holeProfile(r) * H.w;
  }
  return h;
}
// xz slope of the holes (dh/dx, dh/dz), how far inside a hole (0..1) and
// how much on its loosened rim (0..1).
vec4 holeInfo(vec2 xz) {
  vec4 o = vec4(0.0);
  for (int i = 0; i < MAX_HOLES; i++) {
    vec4 H = uHoles[i];
    if (H.w <= 0.0) continue;
    vec2 d = xz - H.xy;
    float l = length(d);
    float r = l / H.z;
    if (r >= 2.0) continue;
    o.xy += holeSlope(r) * H.w / H.z * d / max(l, 1e-5);
    float k = H.w / 0.012;
    o.z = max(o.z, smoothstep(1.0, 0.55, r) * k);
    o.w = max(o.w, smoothstep(0.7, 1.0, r) * smoothstep(1.7, 1.15, r) * k);
  }
  return o;
}
`;
