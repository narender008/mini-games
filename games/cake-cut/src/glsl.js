// GLSL shared by the cake shaders: hashing, value and cellular noise, the
// bump-to-normal step, and the slit test that opens the frosting along a cut.

export const MAX_SLITS = 16;

export const NOISE = /* glsl */ `
float h31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 h33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h31(i);
  float b = h31(i + vec3(1.0, 0.0, 0.0));
  float c = h31(i + vec3(0.0, 1.0, 0.0));
  float d = h31(i + vec3(1.0, 1.0, 0.0));
  float e = h31(i + vec3(0.0, 0.0, 1.0));
  float g = h31(i + vec3(1.0, 0.0, 1.0));
  float h = h31(i + vec3(0.0, 1.0, 1.0));
  float k = h31(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += vnoise(p) * a;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
// nearest and second-nearest feature distance, and the nearest cell's random
vec3 worley(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;
  for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 r = h33(i + o);
        vec3 d = o + r - f;
        float l = dot(d, d);
        if (l < f1) {
          f2 = f1;
          f1 = l;
          id = r.x + r.y * 0.37;
        } else if (l < f2) f2 = l;
      }
  return vec3(sqrt(f1), sqrt(f2), fract(id * 7.13));
}
`;

// Mikkelsen's bump mapping with unnormalised screen derivatives, so heights
// are in metres whatever the resolution.
export const PERTURB = /* glsl */ `
vec3 cakeBump(vec3 surfPos, vec3 surfNorm, float height, float faceDir) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec2 dh = vec2(dFdx(height), dFdy(height));
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

export const SLIT = /* glsl */ `
uniform vec4 uSlitSeg[${MAX_SLITS}];
uniform vec4 uSlitInfo[${MAX_SLITS}]; // half width, bottom y, free start, free end
uniform int uSlitCount;
float slitHalfWidth(vec4 f, float t, float len) {
  float w = f.x;
  if (f.z > 0.5) w *= clamp(t * len / 0.012, 0.0, 1.0);
  if (f.w > 0.5) w *= clamp((1.0 - t) * len / 0.012, 0.0, 1.0);
  return w;
}
void slitDiscard(vec3 p) {
  for (int i = 0; i < ${MAX_SLITS}; i++) {
    if (i >= uSlitCount) break;
    vec4 s = uSlitSeg[i];
    vec4 f = uSlitInfo[i];
    if (p.y < f.y) continue;
    vec2 ab = s.zw - s.xy;
    float l2 = max(dot(ab, ab), 1e-12);
    float t = clamp(dot(p.xz - s.xy, ab) / l2, 0.0, 1.0);
    float d = length(p.xz - (s.xy + ab * t));
    if (d < slitHalfWidth(f, t, sqrt(l2))) discard;
  }
}
`;

// Signed distance to the tier outline: round, or a square with rounded
// corners. uShape = (kind, radius or half side, corner radius, unused).
export const SHAPE = /* glsl */ `
uniform vec4 uShape;
float shapeSdf(vec2 p) {
  if (uShape.x < 0.5) return length(p) - uShape.y;
  vec2 q = abs(p) - vec2(uShape.y - uShape.z);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uShape.z;
}
`;
