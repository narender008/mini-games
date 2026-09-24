// Baked maps for tilled garden soil, one tile = SOIL_TILE metres.
// Map A (sRGB): albedo, alpha = height. Map B (linear): normal x/y (the
// height slope), roughness, cavity occlusion. The soil is built up from
// clods, crumbs at three sizes, grit and sand grains, a few small stones,
// bits of straw and bark, and the odd fragment of dry leaf.
import { bakeTexture } from './bake.js';
import { BAKE_GLSL } from './groundglsl.js';

export const SOIL_TILE = 0.6;

const SOIL_GLSL = /* glsl */ `
${BAKE_GLSL}
// heights are in tile units (1 = ${SOIL_TILE} m)
struct Soil { float h; vec3 col; float rough; float cav; };

float dome(float d, float r) {
  float k = clamp(d / r, 0.0, 1.0);
  return sqrt(1.0 - k * k);
}

// Scattered lumps with ragged outlines, stacked: the highest lump at a point
// wins. N cells per tile, on the share of cells holding a lump, radii in
// cells, k the height. Returns the height; id the winning lump's random.
float lumps(vec2 uv, float N, float on, float rmin, float rmax, float k, out float id) {
  vec2 g = uv * N;
  vec2 gi = floor(g);
  float best = 0.0;
  id = 0.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 c = gi + vec2(float(x), float(y));
      vec3 r = hp3(c, N);
      if (r.z > on) continue;
      vec3 q = hp3(c + 71.0, N);
      float rad = mix(rmin, rmax, q.x);
      float a = q.y * 6.283;
      vec2 d = mat2(cos(a), sin(a), -sin(a), cos(a)) * (g - c - r.xy);
      d.x *= mix(0.72, 1.3, q.z);
      float l = length(d) / rad + (vnP(g * 3.0 + q.xy * 17.0, N * 3.0) - 0.5) * 0.7 + (vnP(g * 8.0 + q.yz * 9.0, N * 8.0) - 0.5) * 0.3;
      if (l >= 1.0) continue;
      float h = pow(1.0 - l * l, 0.35) * k * mix(0.55, 1.0, q.x) + d.x / rad * k * (q.z - 0.5) * 0.4;
      if (h > best) {
        best = h;
        id = fract(q.z * 13.7 + q.y);
      }
    }
  return best;
}

Soil soil(vec2 uv) {
  Soil s;
  float und = fbmP(uv * 3.0, 3.0, 4);
  float ground = und * 0.012;
  float n1 = vnP(uv * 220.0, 220.0) - 0.5;
  float n2 = vnP(uv * 640.0, 640.0) - 0.5;
  // a continuous spread of sizes: a few clods, many lumps, crumbs, fine tilth
  float i1, i2, i3, i4;
  float h1 = lumps(uv, 9.0, 0.28, 0.24, 0.46, 0.016, i1);
  float h2 = lumps(uv + 0.31, 26.0, 0.6, 0.3, 0.55, 0.0085, i2);
  float h3 = lumps(uv + 0.17, 64.0, 0.85, 0.3, 0.6, 0.0042, i3);
  float h4 = lumps(uv + 0.07, 160.0, 1.0, 0.36, 0.62, 0.0018, i4);
  float n3 = vnP(uv * 1500.0, 1500.0) - 0.5;
  Cell c4 = cellP(uv * 380.0, 380.0, 1.0);
  vec3 r4 = hp3(c4.id + 5.0, 380.0);
  float grit = step(0.45, r4.x) * dome(c4.f1, 0.45) * 0.0008;
  float hC = h1 > 0.0 ? ground + 0.002 + h1 + n1 * 0.0016 : 0.0;
  float hA = h2 > 0.0 ? ground + 0.001 + h2 + n1 * 0.0008 : 0.0;
  float hB = ground + h3;
  float hF = ground + h4 * 0.5;
  float onC = step(max(max(hA, hB), hF), hC);
  float onA = (1.0 - onC) * step(max(hB, hF), hA);
  float onB = (1.0 - onC - onA) * step(hF, hB);
  float onF = 1.0 - onC - onA - onB;
  // every surface is itself made of fine crumbs and grains
  s.h = max(max(hC, hA), max(hB, hF)) + h4 * 0.7 + grit + n2 * 0.0006 + n3 * 0.0003;

  vec3 cBase = s2l(vec3(0.245, 0.19, 0.145));
  vec3 cRed = s2l(vec3(0.28, 0.2, 0.14));
  vec3 cGrey = s2l(vec3(0.27, 0.24, 0.21));
  vec3 cDark = s2l(vec3(0.075, 0.055, 0.042));
  float patchA = vnP(uv * 7.0, 7.0);
  float patchB = vnP(uv * 13.0 + 3.1, 13.0);
  vec3 col = mix(cBase, cRed, smoothstep(0.55, 0.95, patchA) * 0.55);
  col = mix(col, cGrey, smoothstep(0.6, 0.9, patchB) * 0.4);
  float tint = onC * i1 + onA * i2 + onB * i3 + onF * i4;
  col *= 0.84 + 0.32 * tint;
  col *= 0.88 + 0.24 * i4 * step(0.0002, h4);
  col *= 0.92 + 0.16 * (n1 + 0.5);
  // exposed tops dry paler; the gaps between pieces stay dark and damp
  float rel = s.h - ground;
  col *= 0.92 + 0.32 * smoothstep(0.003, 0.016, rel);
  float cav = smoothstep(0.0, 0.004, rel);
  col = mix(cDark, col, 0.25 + 0.75 * cav);
  float rough = 0.9 + 0.06 * onC;
  // grains: sand, quartz and dark mineral specks
  float gm = onF * step(0.0001, grit) * step(0.72, r4.z);
  vec3 gc = r4.y < 0.6 ? s2l(vec3(0.52, 0.46, 0.38)) : (r4.y < 0.75 ? s2l(vec3(0.7, 0.67, 0.62)) : s2l(vec3(0.08, 0.07, 0.06)));
  col = mix(col, gc, gm * 0.75);
  rough = mix(rough, 0.6, gm * step(0.55, r4.y) * step(r4.y, 0.82));

  // small stones, half sunk in the soil
  Cell cs = cellP(uv * 36.0 + 0.5, 36.0, 0.8);
  vec3 rs = hp3(cs.id + 13.0, 36.0);
  float sr = mix(0.1, 0.26, rs.y);
  float hs = ground + 0.003 + step(0.88, rs.x) * dome(cs.f1, sr) * sr / 36.0 * 0.75;
  float stone = step(0.88, rs.x) * step(s.h, hs) * smoothstep(sr, sr * 0.8, cs.f1);
  vec3 stoneCol = rs.z < 0.35 ? s2l(vec3(0.56, 0.52, 0.47)) : (rs.z < 0.7 ? s2l(vec3(0.63, 0.55, 0.43)) : s2l(vec3(0.42, 0.4, 0.38)));
  stoneCol *= 0.8 + 0.35 * vnP(uv * 900.0, 900.0);
  stoneCol = mix(stoneCol * 0.6, stoneCol, smoothstep(sr, sr * 0.4, cs.f1));
  s.h = mix(s.h, hs, stone);
  col = mix(col, stoneCol, stone);
  rough = mix(rough, 0.55, stone);

  // straw: thin pale stalk pieces lying on top
  vec2 g = uv * 8.0;
  vec2 gi = floor(g);
  float straw = 0.0;
  float along = 0.0;
  float rnd = 0.0;
  for (int y = -1; y <= 1; y++)
    for (int k = -1; k <= 1; k++) {
      vec2 o = vec2(float(k), float(y));
      vec3 rr = hp3(gi + o + 41.0, 8.0);
      if (rr.x < 0.84) continue;
      vec2 c = gi + o + 0.5 + (rr.yz - 0.5) * 0.8;
      float a = rr.y * 6.283 + rr.z * 3.1;
      vec2 dir = vec2(cos(a), sin(a));
      float len = mix(0.1, 0.26, fract(rr.x * 13.1));
      float d = segDist(g, c - dir * len, c + dir * len);
      float wid = mix(0.009, 0.015, fract(rr.z * 7.7));
      float m = smoothstep(wid, wid * 0.6, d);
      if (m > straw) {
        straw = m;
        along = dot(g - c, dir);
        rnd = sqrt(max(0.0, 1.0 - (d / wid) * (d / wid)));
      }
    }
  vec3 strawCol = s2l(vec3(0.76, 0.66, 0.44)) * (0.85 + 0.2 * sin(along * 900.0) * 0.5 + 0.15 * rnd);
  s.h = mix(s.h, max(s.h, ground + 0.004 + rnd * 0.0015), straw);
  col = mix(col, strawCol, straw);
  rough = mix(rough, 0.7, straw);

  // bark chips
  Cell cb = cellP(uv * 14.0 + 0.21, 14.0, 0.9);
  vec3 rb = hp3(cb.id + 57.0, 14.0);
  float ba = rb.y * 6.283;
  vec2 bp = mat2(cos(ba), sin(ba), -sin(ba), cos(ba)) * cb.d;
  vec2 bs = vec2(mix(0.1, 0.2, rb.z), mix(0.05, 0.1, rb.y));
  vec2 bq = abs(bp) - bs;
  float bd = length(max(bq, 0.0)) + min(max(bq.x, bq.y), 0.0) - 0.02;
  float bark = step(0.9, rb.x) * smoothstep(0.0, -0.015, bd + (vnP(uv * 400.0, 400.0) - 0.5) * 0.04);
  vec3 barkCol = s2l(vec3(0.34, 0.21, 0.13)) * (0.75 + 0.4 * vnP(vec2(bp.x * 40.0, bp.y * 400.0) + rb.xy * 50.0, 1e4));
  s.h = mix(s.h, max(s.h, ground + 0.006), bark);
  col = mix(col, barkCol, bark);
  rough = mix(rough, 0.82, bark);

  // the odd fragment of dry leaf
  Cell cl = cellP(uv * 5.0 + 0.63, 5.0, 0.9);
  vec3 rl = hp3(cl.id + 91.0, 5.0);
  float lr = mix(0.05, 0.09, rl.y) * (1.0 + (vnP(uv * 60.0, 60.0) - 0.5) * 1.1 + (vnP(uv * 170.0, 170.0) - 0.5) * 0.5);
  float leaf = step(0.86, rl.x) * smoothstep(lr, lr * 0.9, length(cl.d * vec2(1.0, 1.7)));
  float la = rl.z * 6.283;
  vec2 ld = vec2(cos(la), sin(la));
  float vein = smoothstep(0.004, 0.0, abs(dot(cl.d, vec2(-ld.y, ld.x))));
  vein = max(vein, smoothstep(0.003, 0.0, abs(sin(dot(cl.d, ld) * 90.0 + dot(cl.d, vec2(-ld.y, ld.x)) * 60.0))) * 0.3);
  vec3 leafCol = mix(s2l(vec3(0.42, 0.3, 0.17)), s2l(vec3(0.3, 0.2, 0.11)), vnP(uv * 150.0, 150.0)) * (1.0 + vein * 0.3);
  s.h = mix(s.h, max(s.h, ground + 0.007 + cl.f1 * 0.02), leaf);
  col = mix(col, leafCol, leaf);
  rough = mix(rough, 0.72, leaf);

  s.col = col;
  s.rough = rough;
  s.cav = mix(0.35, 1.0, cav);
  return s;
}
`;

const ALBEDO = /* glsl */ `
${SOIL_GLSL}
vec4 bake(vec2 uv, float texel) {
  Soil s = soil(uv);
  return vec4(s.col, clamp(s.h / 0.045, 0.0, 1.0));
}
`;

const DETAIL = /* glsl */ `
${SOIL_GLSL}
vec4 bake(vec2 uv, float texel) {
  Soil s = soil(uv);
  float hl = soil(uv - vec2(texel, 0.0)).h;
  float hr = soil(uv + vec2(texel, 0.0)).h;
  float hd = soil(uv - vec2(0.0, texel)).h;
  float hu = soil(uv + vec2(0.0, texel)).h;
  vec3 n = normalize(vec3((hl - hr) / (2.0 * texel), (hd - hu) / (2.0 * texel), 1.0));
  return vec4(n.xy * 0.5 + 0.5, s.rough, s.cav);
}
`;

const cache = new WeakMap();

export function soilMaps(renderer, size) {
  let maps = cache.get(renderer);
  if (!maps) {
    maps = {
      a: bakeTexture(renderer, size, ALBEDO, { srgb: true }),
      b: bakeTexture(renderer, size, DETAIL),
    };
    cache.set(renderer, maps);
  }
  return maps;
}
