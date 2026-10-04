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
out vec4 o;
float fbm(vec2 p) {
  float a = 0.0, w = 0.5;
  for (int i = 0; i < 5; i++) {
    a += w * texture(uNoise, p).r;
    p = p * 2.03 + vec2(0.17, 0.31);
    w *= 0.5;
  }
  return a;
}
void main() {
  // sky space: mostly fixed to the screen, drifting a little with the camera
  vec2 s = vec2(vClip.x * uAspect, vClip.y) + vec2(uView.x * 0.0015, (uView.y - 40.0) * 0.004);
  float h = clamp(s.y * 0.5 + 0.55, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, pow(h, 0.75));
  vec2 ds = s - uSunPos;
  float sd = length(ds);
  c += uSunGlow * (exp(-sd * 3.2) * 0.55 + exp(-sd * 14.0) * 1.3);
  c += uSunGlow * smoothstep(0.045, 0.035, sd) * 14.0;
  // stars at night
  if (uStars > 0.0) {
    vec2 g = floor(s * 220.0);
    float st = hash12(g);
    float tw = 0.6 + 0.4 * sin(uRotT.z * 2.0 + st * 40.0);
    c += vec3(0.8, 0.85, 1.0) * step(0.9965, st) * tw * uStars * h * 1.8;
  }
  // clouds, lit from the sun side
  vec2 cp = s * uCloud.w + vec2(uRotT.z * uCloud.z, 0.0);
  cp.y *= 2.4;
  float d = fbm(cp * 0.25);
  float cov = smoothstep(1.0 - uCloud.x, 1.0 - uCloud.x + 0.32, d);
  float lit = clamp(0.5 + (fbm(cp * 0.25 + normalize(uSunPos - s) * 0.02) - d) * -6.0, 0.0, 1.0);
  vec3 cc = uCloudCol * mix(1.0 - uCloud.y, 1.0, lit) + uSunGlow * exp(-sd * 4.0) * 0.6 * lit;
  c = mix(c, cc, cov * smoothstep(-0.2, 0.4, h));
  o = vec4(c, 1.0);
}`,
};

// ---------------------------------------------------------------- backdrop
// (the layers are baked by gl/bake.js)
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
  fs: `${HEAD}
in vec2 vL;
in vec2 vClip;
uniform sampler2D uTex;
uniform vec4 uLayer;
uniform vec4 uHaze;    // haze colour, amount
uniform float uLightK; // how much nearby blasts light this layer
out vec4 o;
void main() {
  vec2 uv = vec2(vL.x / uLayer.z, vL.y / uLayer.w);
  vec4 t = texture(uTex, uv);
  if (uv.y < 0.0) t = vec4(texture(uTex, vec2(uv.x, 0.001)).rgb, 1.0);
  vec3 c = t.rgb * (uSky.rgb * 0.9 + uSunCol.rgb * 0.25);
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
  c = mix(c, uHaze.rgb, uHaze.a);
  o = vec4(c * t.a, t.a);
}`.replace(
    'out vec4 o;',
    `out vec4 o;
vec2 toWorldApprox(vec2 clip) { return uView.xy + clip / uView.zw; }`,
  ),
};

// ---------------------------------------------------------------- terrain
// The ground is a cross-section: grass or sand on top, soil, then deeper
// strata and rock. The mask carries the shape (every blast carves it); the
// field texture carries depth below the surface, sun visibility and occlusion;
// the decal texture carries scorch, blood and hot glow.
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
uniform vec4 uTop;    // top layer colour, thickness (m)
uniform vec4 uSoil;   // topsoil colour, thickness
uniform vec4 uDeep;   // subsoil colour, strata contrast
uniform vec4 uRock;   // rock colour, rock amount
uniform vec4 uGrass;  // blade colour, height (m)
uniform float uWind;
out vec4 o;
float mask(vec2 w) {
  vec2 uv = w / uWorld.xy;
  // outside the world: solid below the edge height, so the sides look continuous
  return texture(uMask, uv).r;
}
vec3 matAt(vec2 w, float depth, vec4 nz, out float stone) {
  // large mottling, then medium, then fine grain
  float big = texture(uNoise, w * 0.012).r;
  float mid = texture(uNoise, w * 0.09 + 0.3).g;
  float fine = texture(uNoise, w * 0.55).b;
  float top = uTop.w * (0.6 + 0.8 * nz.r);
  float soilEnd = top + uSoil.w * (0.7 + 0.6 * big);
  vec3 c;
  if (depth < top) {
    c = uTop.rgb * (0.75 + 0.5 * mid);
  } else {
    // dark topsoil fading into lighter subsoil, with sandy and gravel bands
    float t = smoothstep(soilEnd - 0.3, soilEnd + 1.2, depth);
    c = mix(uSoil.rgb, uDeep.rgb, t);
    float band = sin(w.y * 2.6 + big * 7.0 + w.x * 0.015) * 0.5 + 0.5;
    float band2 = sin(w.y * 0.45 + mid * 3.0 - w.x * 0.01) * 0.5 + 0.5;
    c *= mix(1.0, mix(0.78, 1.18, band) * mix(0.9, 1.08, band2), uDeep.w * t);
  }
  c *= 0.72 + 0.4 * big + 0.22 * (mid - 0.5) + 0.18 * (fine - 0.5);
  // stones bedded in the earth, bigger and more of them deeper down
  float cells = texture(uNoise, w * vec2(0.04, 0.06) + vec2(0.13, 0.71)).a;
  float small = texture(uNoise, w * vec2(0.15, 0.22) + vec2(0.5, 0.2)).a;
  float deep = smoothstep(0.4, 3.0, depth);
  // stones come in patches
  float patch_ = smoothstep(0.52, 0.66, texture(uNoise, w * 0.008 + 0.5).g);
  stone = max(smoothstep(0.02, 0.14, cells) * deep * uRock.w * patch_, smoothstep(0.25, 0.4, small) * 0.7 * smoothstep(0.1, 0.6, depth) * smoothstep(0.55, 0.7, mid));
  vec3 rc = uRock.rgb * (0.65 + 0.7 * fine) * (0.8 + 0.4 * big);
  c = mix(c, rc, stone);
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
    float orig = texture(uOrig, uv).r;
    if (orig > 0.5) {
      // the far wall of a crater or tunnel: shadowed earth, lit by fire
      vec3 alb = uDeep.rgb * 0.5 * (0.8 + 0.4 * nz.g);
      float occl = field.b;
      alb *= mix(1.0, 0.45, occl);
      airCol = shade(alb, vec3(0.0, 0.0, 1.0), w, 0.0, 0.8) * 0.75;
      airCol = mix(airCol, airCol * 0.4 + vec3(0.02, 0.012, 0.008), dec.r * 0.6);
      airA = smoothstep(0.5, 0.6, orig);
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
    float depth = field.r * 8.0;
    float stone;
    vec3 alb = matAt(w, depth, nz, stone);
    // the deeper, the darker (the cross-section falls away from the light)
    alb *= mix(1.0, 0.5, smoothstep(1.2, 8.0, depth));
    // crevices and the floors of craters
    alb *= mix(1.0, 0.6, smoothstep(0.6, 0.95, field.b) * (1.0 - smoothstep(0.8, 3.0, depth)));
    // normal from the mask's slope at the edge, plus a little grit
    float e = 1.0 / uWorld.z;
    float gx = mask(w + vec2(e, 0.0)) - mask(w - vec2(e, 0.0));
    float gy = mask(w + vec2(0.0, e)) - mask(w - vec2(0.0, e));
    vec2 g2 = -vec2(gx, gy);
    float edge = clamp(1.0 - depth / 0.6, 0.0, 1.0);
    // stones bulge: slope of the cell field
    float cA = texture(uNoise, (w + vec2(0.1, 0.0)) * vec2(0.04, 0.06) + vec2(0.13, 0.71)).a;
    float cB = texture(uNoise, (w + vec2(0.0, 0.1)) * vec2(0.04, 0.06) + vec2(0.13, 0.71)).a;
    float c0 = texture(uNoise, w * vec2(0.04, 0.06) + vec2(0.13, 0.71)).a;
    vec2 sb = -vec2(cA - c0, cB - c0) * 4.0 * stone;
    vec3 n = normalize(vec3(g2 * 2.2 * edge + (nz.rg - 0.5) * 0.3 + sb, 1.0));
    // scorch, blood
    alb = mix(alb, vec3(0.03, 0.026, 0.022) * (0.7 + 0.6 * nz.b), clamp(dec.r * 1.15, 0.0, 1.0));
    float blood = dec.g * smoothstep(0.35, 0.55, dec.g + (nz.a - 0.5) * 0.5);
    alb = mix(alb, vec3(0.055, 0.006, 0.004) * (0.6 + 0.6 * dec.b), clamp(blood * 1.3, 0.0, 0.9));
    vec3 c = shade(alb, n, w, field.g, 1.0);
    // a glint on wet blood
    c += blood * dec.b * pow(max(dot(n, normalize(uSun.xyz + vec3(0.0, 0.0, 1.0))), 0.0), 24.0) * uSunCol.rgb * 0.4;
    // hot glowing ground in a fresh crater
    float glow = dec.a * (0.6 + 0.6 * texture(uNoise, w * 0.3 + vec2(0.0, uRotT.z * 0.2)).r);
    c += vec3(5.0, 1.4, 0.3) * glow * glow;
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
  float bl = vFx.z * step(0.62, texture(uNoise, vLocal * vec2(5.0, 2.5) + 0.37).b + vFx.z * 0.25);
  alb = mix(alb, vec3(0.13, 0.006, 0.004), bl * 0.9);
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
  if (kind < 0.5) {
    // smoke and dust: a billowing puff
    float edge = r + (nz.r - 0.5) * 0.9 + (nz.g - 0.5) * 0.35;
    a = smoothstep(1.0, 0.25, edge) * smoothstep(1.0, 0.65, r);
    n = normalize(vec3(vP * 0.75 + (nz.gb - 0.5) * 0.7, 0.8));
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
  vec3 c = shade(vCol.rgb, n, vWorld, mix(1.0, sun, 0.7), kind < 0.5 ? 1.4 : 1.0);
  if (kind > 1.5) c += uSunCol.rgb * pow(max(dot(n, normalize(uSun.xyz + vec3(0, 0, 1))), 0.0), 30.0) * 0.3;
  o = vec4(c * a, a);
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
  } else {
    // ember: a tiny flickering point
    float a = smoothstep(1.0, 0.0, r);
    float fl = 0.55 + 0.45 * sin(uRotT.z * 23.0 + vC.z * 60.0);
    c = vCol.rgb * a * a * fl * vCol.a;
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
out vec4 o;
void main() {
  float a = vC.x < 0.5 ? smoothstep(1.0, 0.0, abs(vP.y)) * smoothstep(1.0, 0.6, abs(vP.x)) : smoothstep(1.0, 0.2, length(vP));
  a *= vCol.a;
  vec3 c = vCol.rgb * (uSky.rgb * 1.5 + uSunCol.rgb * 0.15);
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
    // shock ring: push outwards in a thin band
    float band = 0.22;
    float k = smoothstep(band, 0.0, abs(r - (1.0 - band)));
    off = normalize(vP + 1e-4) * k * vCol.a;
  } else {
    // heat: rising wobble
    vec4 nz = texture(uNoise, vP * 0.4 + vec2(vC.z, -uRotT.z * 0.9));
    off = (nz.rg - 0.5) * smoothstep(1.0, 0.2, r) * vCol.a;
  }
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
  // film grain
  float g = hash(vUV * vec2(1931.0, 1777.0) + fract(uRotT.z * 13.0) * 100.0) - 0.5;
  c += g * uPost.w;
  o = vec4(pow(max(c, 0.0), vec3(1.0 / 2.2)), 1.0);
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
