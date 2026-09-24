// Baked lawn map, one tile = LAWN_TILE metres: a dense mat of short grass
// blades seen from above, over darker thatch. It is the lawn's surface in
// the distance and the shade between blades up close. Alpha holds how high
// each texel's blade stands (for height blending two scales).
import { bakeTexture } from './bake.js';
import { BAKE_GLSL } from './groundglsl.js';

export const LAWN_TILE = 0.5;

const LAWN = /* glsl */ `
${BAKE_GLSL}
vec4 bake(vec2 uv, float texel) {
  float n1 = vnP(uv * 12.0, 12.0);
  float n2 = vnP(uv * 60.0, 60.0);
  vec3 thatch = mix(s2l(vec3(0.2, 0.19, 0.09)), s2l(vec3(0.3, 0.26, 0.14)), n1);
  thatch = mix(thatch, s2l(vec3(0.16, 0.22, 0.07)), n2 * 0.6);
  vec3 col = thatch * (0.55 + 0.45 * vnP(uv * 240.0, 240.0));
  float top = 0.0;
  const float N = 40.0;
  vec2 g = uv * N;
  vec2 gi = floor(g);
  for (int y = -1; y <= 1; y++)
    for (int k = -1; k <= 1; k++)
      for (int b = 0; b < 5; b++) {
        vec2 c = gi + vec2(float(k), float(y));
        vec3 r = hp3(c + float(b) * 17.0, N);
        vec3 q = hp3(c + float(b) * 17.0 + 5.0, N);
        vec2 root = c + r.xy;
        float a = r.z * 6.283;
        vec2 dir = vec2(cos(a), sin(a));
        float len = mix(0.55, 1.15, q.x);
        vec2 pa = g - root;
        float t = clamp(dot(pa, dir) / len, 0.0, 1.0);
        float d = length(pa - dir * len * t);
        float w = mix(0.1, 0.17, q.y) * (1.0 - t * 0.85);
        float depth = q.z * 0.6 + t * 0.4;
        if (d < w && depth > top) {
          top = depth;
          float s = d / w;
          vec3 young = s2l(vec3(0.36, 0.56, 0.17));
          vec3 old = s2l(vec3(0.5, 0.56, 0.22));
          vec3 bc = mix(young, old, smoothstep(0.3, 0.95, fract(q.z * 7.3)));
          bc = mix(bc, s2l(vec3(0.62, 0.56, 0.36)), step(0.95, fract(q.x * 13.7)) * t);
          col = bc * (0.55 + 0.45 * depth) * (1.0 - 0.25 * s * s);
        }
      }
  return vec4(col, top);
}
`;

const cache = new WeakMap();

export function lawnMap(renderer, size) {
  let tex = cache.get(renderer);
  if (!tex) {
    tex = bakeTexture(renderer, size, LAWN, { srgb: true });
    cache.set(renderer, tex);
  }
  return tex;
}
