// GLSL for every pass. The lit passes share the Frame uniform block: the
// camera, a key light, sky and ground ambient, a rim light, and up to 32
// point lights (muzzle flashes, rockets, fireballs, lightning), so a blast
// lights the road, the blood on it and every creature near it alike.
//
// Space: world units, x right and y DOWN. Normal maps and light maths work in
// screen space (x right, y UP, z toward the viewer), so world y is negated
// there.

export const MAX_LIGHTS = 32;

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
layout(std140) uniform Frame {
  vec4 uView;   // camera centre x,y; clip units per world unit x,y
  vec4 uMisc;   // time, world units per pixel, light count, camera roll
  vec4 uKey;    // key light direction (screen space), unused
  vec4 uKeyCol; // key light colour
  vec4 uAmbTop; // ambient from above
  vec4 uAmbBot; // ambient from below
  vec4 uRim;    // rim light colour, strength
  vec4 uFog;    // haze colour toward the top of the road, amount
  vec4 uL[${MAX_LIGHTS * 2}];
};
`;

const VIEW = `
vec4 toClip(vec2 w) {
  vec2 d = w - uView.xy;
  float c = cos(uMisc.w), s = sin(uMisc.w);
  d = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
  return vec4(d.x * uView.z, -d.y * uView.w, 0.0, 1.0);
}
vec2 toWorld(vec2 clip) {
  vec2 d = vec2(clip.x / uView.z, -clip.y / uView.w);
  float c = cos(uMisc.w), s = sin(uMisc.w);
  d = vec2(d.x * c + d.y * s, -d.x * s + d.y * c);
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

// point lights: position in world (x, y), height z, radius; colour
const LIGHTS = `
vec3 pointLights(vec3 n, vec2 wp, float wrap) {
  vec3 c = vec3(0.0);
  int nl = int(uMisc.z);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= nl) break;
    vec4 p = uL[i * 2];
    vec2 d2 = p.xy - wp;
    float dd = dot(d2, d2);
    if (dd > p.w * p.w) continue;
    vec3 L = vec3(d2.x, -d2.y, p.z);
    float dist = length(L);
    float att = 1.0 - sqrt(dd) / p.w;
    att *= att;
    float ndl = (dot(n, L / dist) + wrap) / (1.0 + wrap);
    c += uL[i * 2 + 1].rgb * att * max(ndl, 0.0);
  }
  return c;
}
`;

const FULL_VS = `${HEAD}${VIEW}
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vWorld;
out vec2 vUV;
void main() {
  vec2 p = P[gl_VertexID];
  vWorld = toWorld(p);
  vUV = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// ---------------------------------------------------------------- ground bake
// Draws a chapter's ground once into a texture: colour (sRGB) and a height in
// alpha for the bump. uRect = world rectangle the texture covers. The layout
// numbers (road edges, kerbs, verges) come in uP / uQ; uKind picks the theme.
export const GROUND_BAKE = {
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
uniform int uKind;
uniform vec4 uRoad;     // road x0, x1, kerb width, sidewalk width
uniform vec4 uVerge;    // verge width, plaza start, seed, lane dash
uniform vec3 uAsphalt;
uniform vec3 uAsphalt2;
uniform vec3 uKerb;
uniform vec3 uWalk;
uniform vec3 uGrass;
uniform vec3 uDirt;
uniform vec3 uPlaza;
uniform vec3 uLine;
out vec4 o;
float n1(vec2 p) { return texture(uNoise, p).r; }
float n2(vec2 p) { return texture(uNoise, p).g; }
float n3(vec2 p) { return texture(uNoise, p).b; }
float cells(vec2 p) { return texture(uNoise, p).a; }
float fbm(vec2 p) { return n1(p) * 0.5 + n2(p * 2.03) * 0.3 + n3(p * 4.1) * 0.2; }
// distance to the nearest crack: thin dark lines along noise ridges
float crack(vec2 p, float sc) {
  float a = abs(n1(p * sc) - 0.5);
  float b = abs(n2(p * sc * 1.7 + 0.31) - 0.5);
  return min(a * 2.2, b * 3.0);
}
void main() {
  vec2 w = vW;
  float seed = uVerge.z;
  vec2 q = w / 512.0 + seed;
  float x0 = uRoad.x, x1 = uRoad.y, kerb = uRoad.z, walk = uRoad.w;
  float dl = x0 - w.x;            // distance outside the left road edge
  float dr = w.x - x1;            // ... right
  float side = max(dl, dr);       // > 0 off the road
  float sx = dl > dr ? -1.0 : 1.0;
  vec3 col;
  float h = 0.5;
  float big = fbm(q * 0.6);
  float fine = n3(w / 37.0 + seed);
  if (side <= 0.0) {
    // ---- asphalt: two tones of patching, grain, cracks, lane paint, manholes, oil
    col = mix(uAsphalt, uAsphalt2, smoothstep(0.42, 0.62, big));
    col *= 0.88 + 0.24 * fine;
    float grain = hash12(floor(w * 0.9));
    col *= 0.92 + 0.12 * grain;
    h = 0.45 + 0.1 * fine + 0.06 * grain;
    // patched rectangles of newer, darker asphalt
    vec2 pc = floor(w / vec2(170.0, 230.0));
    float pr = hash12(pc + seed * 3.0);
    vec2 pf = fract(w / vec2(170.0, 230.0));
    if (pr > 0.78 && pf.x > 0.12 && pf.x < 0.88 && pf.y > 0.1 && pf.y < 0.75) { col *= 0.78; h += 0.03; }
    // lane lines: dashed centre and two faded lane dividers
    float lanes = 3.0;
    for (int i = 1; i < 3; i++) {
      float lx = x0 + (x1 - x0) * float(i) / lanes;
      float d = abs(w.x - lx);
      float dash = step(0.42, fract(w.y / uVerge.w));
      float wear = smoothstep(0.25, 0.6, n2(w / 90.0 + float(i)));
      float m = (1.0 - smoothstep(5.0, 7.0, d)) * dash * wear;
      col = mix(col, uLine, m * 0.8);
      h += m * 0.05;
    }
    // edge lines
    float de = min(abs(w.x - (x0 + 22.0)), abs(w.x - (x1 - 22.0)));
    float em = (1.0 - smoothstep(3.5, 5.5, de)) * smoothstep(0.3, 0.55, n2(w / 120.0 + 7.0));
    col = mix(col, uLine * vec3(1.0, 0.92, 0.6), em * 0.7);
    // cracks
    float cr = crack(w / 900.0 + seed, 1.0);
    float cm = 1.0 - smoothstep(0.012, 0.03, cr);
    cm *= smoothstep(0.35, 0.6, n3(w / 260.0 + 3.0));
    col *= 1.0 - cm * 0.6;
    h -= cm * 0.25;
    // potholes from the cells channel
    float ph = cells(w / 700.0 + seed * 0.5);
    float pm = smoothstep(0.82, 0.9, ph) * step(0.5, n1(w / 300.0 + 9.0));
    col = mix(col, uAsphalt * 0.45, pm);
    h -= pm * 0.3;
    // oil stains
    float oil = smoothstep(0.66, 0.8, n2(w / 160.0 + 13.0)) * 0.35;
    col *= 1.0 - oil;
    // manholes
    vec2 mc = vec2(x0 + (x1 - x0) * 0.68, 0.0);
    for (int i = 0; i < 3; i++) {
      vec2 c = vec2(mc.x + float(i - 1) * 190.0 * (i == 1 ? 0.0 : 1.0), 260.0 + float(i) * 410.0);
      float d = length(w - c);
      if (d < 30.0) {
        float rim = smoothstep(26.0, 28.0, d);
        float grid = step(0.5, fract((w.x - c.x) / 7.0)) * step(0.5, fract((w.y - c.y) / 7.0));
        col = mix(vec3(0.17, 0.17, 0.19) * (0.8 + 0.4 * grid), uKerb * 0.55, rim);
        h = 0.5 + 0.1 * grid - rim * 0.05;
      }
    }
  } else if (side < kerb) {
    // ---- kerb stone: raised, pale, chipped; red-white paint near crossings
    col = uKerb * (0.85 + 0.25 * fine);
    float seg = floor(w.y / 64.0);
    col *= 0.92 + 0.12 * hash12(vec2(seg, sx));
    if (fract(w.y / 64.0) < 0.04) col *= 0.7;
    float paint = step(0.5, fract(w.y / 128.0)) * step(0.55, n1(w / 700.0 + 4.0));
    col = mix(col, vec3(0.75, 0.12, 0.1), paint * 0.75);
    h = 0.75 + 0.05 * fine - (side / kerb) * 0.05;
    if (side < 4.0) { col *= 0.65; h = 0.55; }
  } else if (side < kerb + walk) {
    // ---- sidewalk slabs with dark joints, a few cracked or missing
    vec2 tw = vec2(side - kerb, w.y);
    vec2 cell = floor(tw / 48.0);
    vec2 f = fract(tw / 48.0);
    float r = hash12(cell + sx * 17.0 + seed);
    col = uWalk * (0.86 + 0.18 * r) * (0.9 + 0.2 * fine);
    float joint = 1.0 - smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    col *= 1.0 - joint * 0.45;
    h = 0.66 - joint * 0.1 + 0.03 * fine;
    if (r > 0.93) { col *= 0.7; h -= 0.05; }
    float cm = 1.0 - smoothstep(0.01, 0.03, crack(w / 400.0 + 2.0, 1.0));
    col *= 1.0 - cm * 0.5 * step(0.6, r);
    // weeds in the joints
    col = mix(col, uGrass * 0.7, joint * smoothstep(0.62, 0.75, n2(w / 80.0)) * 0.8);
  } else if (side < kerb + walk + uVerge.x) {
    // ---- grass verge with dirt patches and tyre ruts
    float g = fbm(w / 220.0 + seed);
    col = mix(uGrass * 0.82, uGrass * 1.12, smoothstep(0.3, 0.7, g));
    col *= 0.85 + 0.3 * n3(w / 23.0);
    float dirt = smoothstep(0.58, 0.72, n1(w / 330.0 + 5.0));
    col = mix(col, uDirt, dirt);
    float blades = hash12(floor(w / 3.0));
    col *= 0.9 + 0.2 * blades;
    h = 0.55 + 0.15 * blades + 0.1 * g - dirt * 0.05;
  } else {
    // ---- plaza / parking: big concrete squares, painted bays, drains
    vec2 tw = vec2(side, w.y);
    vec2 cell = floor(tw / 96.0);
    vec2 f = fract(tw / 96.0);
    float r = hash12(cell + seed * 7.0 + sx);
    col = uPlaza * (0.88 + 0.14 * r) * (0.9 + 0.2 * fine);
    float joint = 1.0 - smoothstep(0.0, 0.02, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    col *= 1.0 - joint * 0.35;
    float bay = (1.0 - smoothstep(2.0, 4.0, abs(fract(w.y / 110.0) - 0.5) * 110.0)) * step(uVerge.y, side) * step(side, uVerge.y + 220.0);
    col = mix(col, vec3(0.9, 0.88, 0.8), bay * 0.6);
    h = 0.5 - joint * 0.08 + 0.04 * fine;
    col *= 1.0 - smoothstep(0.6, 0.8, n2(w / 200.0 + 8.0)) * 0.25;
  }
  // a little grime everywhere so nothing is perfectly clean
  col *= 0.9 + 0.1 * smoothstep(0.2, 0.8, big);
  o = vec4(col, clamp(h, 0.0, 1.0));
}`,
};

// ---------------------------------------------------------------- ground
// The baked ground plus the paint layer (blood, gibs, scorch, frost), lit by
// the key light and every point light. Fresh blood is glossy.
export const GROUND = {
  vs: FULL_VS,
  fs: `${HEAD}${LIGHTS}${HASH}
in vec2 vWorld;
in vec2 vUV;
uniform sampler2D uBase;
uniform sampler2D uPaint;
uniform vec4 uBaseRect;   // world rect of the base texture
uniform vec4 uPaintRect;  // world rect of the paint texture
uniform vec2 uBaseTexel;
out vec4 o;
void main() {
  vec2 buv = (vWorld - uBaseRect.xy) / uBaseRect.zw;
  vec4 b = texture(uBase, buv);
  float hx = texture(uBase, buv + vec2(uBaseTexel.x, 0.0)).a - texture(uBase, buv - vec2(uBaseTexel.x, 0.0)).a;
  float hy = texture(uBase, buv + vec2(0.0, uBaseTexel.y)).a - texture(uBase, buv - vec2(0.0, uBaseTexel.y)).a;
  vec3 n = normalize(vec3(-hx * 3.0, hy * 3.0, 1.0));
  vec3 col = b.rgb;
  vec2 puv = (vWorld - uPaintRect.xy) / uPaintRect.zw;
  vec4 p = vec4(0.0);
  if (puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) p = texture(uPaint, puv);
  col = col * (1.0 - p.a) + p.rgb;
  // paint that is mostly red and dark reads as wet blood: shiny, a little raised
  float wet = p.a * smoothstep(0.02, 0.12, p.r - p.g * 1.5) * (1.0 - smoothstep(0.25, 0.6, p.r + p.g + p.b));
  n = normalize(mix(n, vec3(0.0, 0.0, 1.0), p.a * 0.5));
  vec3 amb = mix(uAmbBot.rgb, uAmbTop.rgb, 0.65);
  float kd = max(dot(n, uKey.xyz), 0.0);
  vec3 c = col * (amb + uKeyCol.rgb * (0.35 + 0.65 * kd));
  c += col * pointLights(n, vWorld, 0.2) * 1.15;
  // specular on wet blood from the key light and the brightest light nearby
  vec3 h = normalize(uKey.xyz + vec3(0.0, 0.0, 1.0));
  float sp = pow(max(dot(n, h), 0.0), 40.0);
  c += wet * (uKeyCol.rgb * sp * 0.35 + pointLights(vec3(0.0, 0.0, 1.0), vWorld, 0.0) * 0.12);
  // haze toward the top of the view (far up the road)
  float fog = uFog.a * smoothstep(0.55, 1.0, vUV.y);
  c = mix(c, uFog.rgb, fog);
  o = vec4(c, 1.0);
}`,
};

// ---------------------------------------------------------------- sprites
// Instance: aA = x, y, w, h (negative w flips); aB = uv rect; aC = offset of
// the top-left corner from the pivot (units), rotation, atlas layer;
// aD = white flash, freeze, alpha, gold.
const SPRITE_VS = `${HEAD}${VIEW}
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in vec4 aC;
layout(location = 3) in vec4 aD;
const vec2 P[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
out vec2 vUV;
out vec2 vWorld;
out vec4 vFx;
flat out float vLayer;
flat out vec3 vRot; // cos, sin, flip
void main() {
  vec2 p = P[gl_VertexID];
  float flip = sign(aA.z);
  vec2 local = aC.xy + p * vec2(abs(aA.z), aA.w);
  local.x *= flip;
  float c = cos(aC.z), s = sin(aC.z);
  vec2 w = aA.xy + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vWorld = w;
  vUV = vec2(mix(aB.x, aB.z, p.x), mix(aB.y, aB.w, p.y));
  vFx = aD;
  vLayer = aC.w;
  vRot = vec3(c, s, flip);
  gl_Position = toClip(w);
}`;

export const SPRITE = {
  vs: SPRITE_VS,
  fs: `${HEAD}${LIGHTS}
in vec2 vUV;
in vec2 vWorld;
in vec4 vFx;
flat in float vLayer;
flat in vec3 vRot;
uniform sampler2DArray uAlbedo;
uniform sampler2DArray uNormal;
out vec4 o;
void main() {
  vec4 al = texture(uAlbedo, vec3(vUV, vLayer));
  float a = al.a * vFx.z;
  if (a < 0.01) discard;
  vec4 nm = texture(uNormal, vec3(vUV, vLayer));
  vec3 n = nm.rgb * 2.0 - 1.0;
  n.x *= vRot.z;
  // world rotation is clockwise on screen for positive angles (y down)
  n.xy = vec2(n.x * vRot.x + n.y * vRot.y, -n.x * vRot.y + n.y * vRot.x);
  n = normalize(n);
  vec3 alb = al.rgb;
  float lum = dot(alb, vec3(0.299, 0.587, 0.114));
  float fr = vFx.y;
  alb = mix(alb, vec3(0.45, 0.78, 1.0) * (0.35 + lum * 1.6), fr * 0.85);
  alb = mix(alb, vec3(1.0, 0.72, 0.18) * (0.25 + lum * 1.8), vFx.w * 0.8);
  // toon key light: three flat bands with narrow soft steps
  float d = dot(n, uKey.xyz);
  float band = 0.28 + 0.36 * smoothstep(0.02, 0.1, d) + 0.36 * smoothstep(0.5, 0.58, d);
  vec3 amb = mix(uAmbBot.rgb, uAmbTop.rgb, n.y * 0.5 + 0.5);
  vec3 c = alb * (amb + uKeyCol.rgb * band);
  // rim light along the top and side edges
  float rim = pow(clamp(1.0 - n.z, 0.0, 1.0), 2.5) * smoothstep(-0.3, 0.5, n.y);
  c += alb * uRim.rgb * rim * uRim.a + uRim.rgb * rim * 0.06;
  c += alb * pointLights(n, vWorld, 0.35) * 1.3;
  // ice: glassy highlights and a cold rim
  if (fr > 0.0) {
    float sp = pow(max(dot(reflect(-uKey.xyz, n), vec3(0.0, 0.0, 1.0)), 0.0), 16.0);
    c += fr * (vec3(0.7, 0.9, 1.0) * sp * 0.9 + vec3(0.3, 0.6, 1.0) * rim * 0.8);
  }
  if (vFx.w > 0.0) c += vFx.w * vec3(1.0, 0.75, 0.25) * (rim * 1.2 + 0.15);
  // glowing parts (eyes, energy cells, lamps)
  c = mix(c, alb * 2.6, nm.a);
  c = mix(c, vec3(2.2, 2.1, 2.0), vFx.x);
  o = vec4(c * a, a);
}`,
};

// The same sprites stamped flat into the paint layer (settled gibs and
// corpses): unlit colour, a little darker and redder, so the road keeps them.
export const STAMP = {
  vs: SPRITE_VS.replace('gl_Position = toClip(w);', 'gl_Position = vec4((w - uPaint.xy) / uPaint.zw * 2.0 - 1.0, 0.0, 1.0);').replace(
    'out vec2 vUV;',
    'uniform vec4 uPaint;\nout vec2 vUV;',
  ),
  fs: `${HEAD}
in vec2 vUV;
in vec2 vWorld;
in vec4 vFx;
flat in float vLayer;
flat in vec3 vRot;
uniform sampler2DArray uAlbedo;
uniform sampler2DArray uNormal;
out vec4 o;
void main() {
  vec4 al = texture(uAlbedo, vec3(vUV, vLayer));
  float a = al.a * vFx.z;
  if (a < 0.02) discard;
  vec3 n = texture(uNormal, vec3(vUV, vLayer)).rgb * 2.0 - 1.0;
  // bake a little of the toon shading in, so a stamped chunk still has form
  float d = dot(normalize(n), normalize(vec3(-0.4, 0.6, 0.7)));
  vec3 c = al.rgb * (0.55 + 0.45 * smoothstep(0.0, 0.5, d));
  c = mix(c, vec3(0.45, 0.78, 1.0) * (0.3 + dot(c, vec3(0.33)) * 1.5), vFx.y * 0.8);
  // settled gore sinks into the road: darker and redder, so live creatures stand out
  // (ice stays pale)
  vec3 sunk = mix(c * vec3(0.62, 0.5, 0.5), vec3(0.2, 0.025, 0.03), 0.22);
  c = mix(sunk, c, vFx.y);
  a *= 0.88;
  o = vec4(c * a, a);
}`,
};

// ---------------------------------------------------------------- paint
// Splats painted into the persistent ground layer. Instance: aA = x, y, size,
// rotation; aB = colour (premultiplied by its own alpha in the shader);
// aC = kind, seed, stretch, unused. Kinds: 0 blood splat, 1 droplet,
// 2 scorch, 3 frost, 4 smear (stretched along its rotation), 5 goo.
export const PAINT = {
  vs: `${HEAD}
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in vec4 aC;
const vec2 P[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
uniform vec4 uPaint;
out vec2 vP;
out vec4 vCol;
out vec4 vC;
void main() {
  vec2 p = P[gl_VertexID];
  vP = p;
  vCol = aB;
  vC = aC;
  vec2 q = p * aA.z * vec2(1.0 + aC.z, 1.0);
  float c = cos(aA.w), s = sin(aA.w);
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  vec2 w = aA.xy + q;
  gl_Position = vec4((w - uPaint.xy) / uPaint.zw * 2.0 - 1.0, 0.0, 1.0);
}`,
  fs: `${HEAD}
in vec2 vP;
in vec4 vCol;
in vec4 vC;
uniform sampler2D uNoise;
out vec4 o;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float kind = vC.x;
  vec4 nz = texture(uNoise, vP * 0.3 + vC.y);
  vec4 nz2 = texture(uNoise, vP * 0.9 + vC.y * 3.1);
  float a;
  vec3 col = vCol.rgb;
  if (kind < 0.5 || kind > 4.5) {
    // splat: ragged blob, darker in the middle, with spikes and droplets around it
    float ang = atan(vP.y, vP.x);
    float spikes = pow(texture(uNoise, vec2(ang * 0.6, vC.y)).r, 3.0) * 0.55;
    float edge = r - (nz.r - 0.5) * 0.45 - spikes * smoothstep(0.2, 0.9, r);
    float core = 1.0 - smoothstep(0.38, 0.5, edge);
    float drops = step(0.83, nz2.g) * (1.0 - smoothstep(0.75, 1.0, r));
    a = max(core, drops);
    col *= 0.75 + 0.5 * nz2.b - 0.25 * (1.0 - r);
  } else if (kind < 1.5) {
    a = 1.0 - smoothstep(0.55, 0.9, r + (nz.r - 0.5) * 0.3);
  } else if (kind < 2.5) {
    // scorch: sooty ring with a darker centre
    a = (1.0 - smoothstep(0.5, 1.0, r + (nz.r - 0.5) * 0.4)) * (0.6 + 0.4 * nz2.g);
  } else if (kind < 3.5) {
    // frost: pale crystals in a ring
    float rays = pow(abs(sin(atan(vP.y, vP.x) * 6.0 + vC.y * 10.0)), 6.0);
    a = (1.0 - smoothstep(0.5, 1.0, r)) * (0.35 + 0.65 * max(rays, nz.g));
  } else {
    // smear: a streak, thick at the start, thinning with ragged edges
    float t = vP.x * 0.5 + 0.5;
    float w = mix(0.9, 0.25, t) * (0.8 + 0.4 * nz.r);
    a = (1.0 - smoothstep(w * 0.7, w, abs(vP.y))) * (1.0 - smoothstep(0.8, 1.0, abs(vP.x)));
  }
  a *= vCol.a;
  if (a < 0.004) discard;
  o = vec4(col * a, a);
}`,
};

// ---------------------------------------------------------------- particles
// Instance: aA = x, y, size, rotation; aB = colour rgba; aC = kind, life 0..1,
// seed, stretch. Premultiplied output: alpha-blended kinds cover what is
// behind; glowing kinds add (alpha 0).
const PARTICLE_VS = `${HEAD}${VIEW}
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in vec4 aC;
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

export const PARTICLE = {
  vs: PARTICLE_VS,
  fs: `${HEAD}${LIGHTS}
in vec2 vP;
in vec4 vCol;
in vec4 vC;
in vec2 vWorld;
uniform sampler2D uNoise;
out vec4 o;
vec3 fire(float t) {
  return mix(mix(vec3(0.5, 0.05, 0.0), vec3(3.2, 0.9, 0.12), smoothstep(0.0, 0.5, t)), vec3(6.0, 4.4, 2.0), smoothstep(0.72, 1.0, t));
}
void main() {
  float r = length(vP);
  int kind = int(vC.x + 0.5);
  float life = vC.y;
  vec3 c = vec3(0.0);
  float cover = 0.0;
  if (kind == 0) {
    // blood / goo droplet: glossy ball
    if (r > 1.0) discard;
    float a = 1.0 - smoothstep(0.75, 1.0, r);
    vec3 n = normalize(vec3(vP * vec2(1.0, -1.0), 0.6));
    float d = max(dot(n, uKey.xyz), 0.0);
    c = vCol.rgb * (0.45 + 0.7 * d) + pow(d, 24.0) * 0.6;
    c += vCol.rgb * pointLights(n, vWorld, 0.3);
    c *= a * vCol.a;
    cover = a * vCol.a;
  } else if (kind == 1 || kind == 2) {
    // blood mist (1) or smoke (2): lumpy puff, lit from above
    if (r > 1.0) discard;
    vec4 nz = texture(uNoise, vP * 0.25 + vC.z);
    vec4 nz2 = texture(uNoise, vP * 0.6 + vC.z * 2.3 + life * 0.15);
    float edge = r + (nz.r - 0.5) * 0.8 + (nz2.g - 0.5) * 0.35;
    float a = smoothstep(1.0, 0.3, edge) * smoothstep(1.0, 0.7, r) * vCol.a;
    vec3 n = normalize(vec3(vP * vec2(0.6, -0.6) + (nz.gb - 0.5) * 0.8, 1.0));
    vec3 lit = mix(uAmbBot.rgb, uAmbTop.rgb, n.y * 0.5 + 0.5) + uKeyCol.rgb * max(dot(n, uKey.xyz), 0.0) * 0.6;
    c = vCol.rgb * (lit + pointLights(n, vWorld, 0.5) * 1.4) * a;
    cover = a;
  } else if (kind == 3) {
    // fire: turbulent flame, cooling with age; hides a little of what is behind
    if (r > 1.0) discard;
    vec4 nz = texture(uNoise, vP * 0.3 + vC.z + vec2(0.0, life * 0.6));
    vec4 nz2 = texture(uNoise, vP * 0.8 + vC.z * 1.7 + vec2(life * 0.3, life));
    float edge = r + (nz.r - 0.5) * 0.9 + (nz2.g - 0.5) * 0.35;
    float a = smoothstep(1.0, 0.15, edge) * smoothstep(1.0, 0.7, r);
    float heat = clamp((1.0 - life) * (1.0 - life) * 1.1 - r * 0.4 + (nz2.b - 0.5) * 0.7, 0.0, 1.0) * vCol.a;
    c = fire(heat) * a * vCol.rgb;
    cover = a * 0.55 * vCol.a * (1.0 - life);
  } else if (kind == 4) {
    // spark or streak: bright core along x
    float a = (1.0 - smoothstep(0.0, 1.0, abs(vP.y))) * (1.0 - smoothstep(0.3, 1.0, abs(vP.x)));
    c = vCol.rgb * a * a * vCol.a;
  } else if (kind == 5) {
    // glow or flash: soft radial
    float a = max(exp(-r * r * 4.0) - 0.018, 0.0);
    c = vCol.rgb * a * vCol.a;
  } else if (kind == 6) {
    // shock ring: thin bright front broken by noise
    float w = 0.14;
    float d = (r - (1.0 - w)) / w;
    float band = exp(-d * d * 2.0) * (1.0 - smoothstep(0.96, 1.0, r));
    float u = atan(vP.y, vP.x) * 0.6366;
    float broken = 0.5 + 0.7 * texture(uNoise, vec2(u, vC.z * 7.0)).r;
    c = vCol.rgb * band * broken * vCol.a;
  } else if (kind == 7) {
    // energy bolt: capsule with a white-hot core and a coloured glow
    float dx = max(abs(vP.x) - 0.55, 0.0) / 0.45;
    float d = length(vec2(dx, vP.y));
    float core = 1.0 - smoothstep(0.12, 0.35, d);
    float glow = exp(-d * d * 3.5);
    c = (vCol.rgb * glow * 1.2 + vec3(1.6, 1.8, 2.0) * core) * vCol.a;
  } else if (kind == 8) {
    // enemy orb: red-hot ball with a dark rim and a pulsing halo
    float pulse = 0.85 + 0.15 * sin(uMisc.x * 18.0 + vC.z * 40.0);
    float core = 1.0 - smoothstep(0.3, 0.42, r);
    float ring = smoothstep(0.32, 0.45, r) * (1.0 - smoothstep(0.45, 0.55, r));
    float halo = exp(-r * r * 3.0) * pulse;
    c = (vec3(2.4, 1.6, 1.2) * core + vCol.rgb * halo * 1.6) * vCol.a;
    cover = (core + ring) * 0.9 * vCol.a;
    c = mix(c, vec3(0.25, 0.0, 0.02), ring * 0.8);
  } else if (kind == 9) {
    // beam (rail, lightning): long core along x, jitter for lightning (seed > 0.5)
    float jit = vC.z > 0.5 ? (texture(uNoise, vec2(vP.x * 0.8 + uMisc.x * 3.0, vC.z)).r - 0.5) * 0.9 : 0.0;
    float y = abs(vP.y - jit);
    float core = 1.0 - smoothstep(0.05, 0.18, y);
    float glow = exp(-y * y * 6.0);
    float ends = 1.0 - smoothstep(0.92, 1.0, abs(vP.x));
    c = (vCol.rgb * glow * 1.3 + vec3(2.0) * core) * vCol.a * ends;
  } else if (kind == 10) {
    // the hero's ground ring: glowing double circle that slowly turns
    float ring = exp(-pow((r - 0.82) / 0.07, 2.0)) + 0.5 * exp(-pow((r - 0.62) / 0.04, 2.0));
    float ang = atan(vP.y, vP.x) + uMisc.x * 1.5;
    float ticks = 0.6 + 0.4 * step(0.0, sin(ang * 6.0));
    float fill = (1.0 - smoothstep(0.0, 0.85, r)) * 0.25;
    c = vCol.rgb * (ring * ticks + fill) * vCol.a;
  } else if (kind == 11) {
    // shield bubble: fresnel rim, hex shimmer
    if (r > 1.0) discard;
    float rim = pow(r, 6.0);
    float hex = texture(uNoise, vP * 0.5 + uMisc.x * 0.05).a;
    float sh = smoothstep(0.55, 0.9, hex) * 0.3;
    c = vCol.rgb * (rim * 1.4 + 0.08 + sh * r) * vCol.a;
    cover = (rim * 0.25 + 0.05) * vCol.a;
  } else if (kind == 12) {
    // reticle: ring with four ticks
    float ring = exp(-pow((r - 0.62) / 0.06, 2.0));
    float tick = (1.0 - smoothstep(0.05, 0.11, min(abs(vP.x), abs(vP.y)))) * step(0.75, r) * (1.0 - step(1.0, r));
    float dot0 = 1.0 - smoothstep(0.06, 0.12, r);
    float a = max(max(ring, tick), dot0);
    c = vCol.rgb * a * vCol.a;
    cover = a * 0.4 * vCol.a;
  } else if (kind == 13) {
    // chip / debris fleck: small solid shard, lit
    if (r > 1.0) discard;
    float a = 1.0 - smoothstep(0.7, 0.95, r + (texture(uNoise, vP * 0.4 + vC.z).r - 0.5) * 0.6);
    c = vCol.rgb * (0.5 + 0.5 * uKeyCol.rgb) * a * vCol.a;
    cover = a * vCol.a;
  } else if (kind == 14) {
    // pickup bubble: glassy sphere with a coloured glow
    if (r > 1.0) discard;
    float rim = pow(r, 4.0);
    float spec = exp(-dot(vP - vec2(-0.35, 0.4), vP - vec2(-0.35, 0.4)) * 30.0);
    c = (vCol.rgb * (0.25 + rim * 1.2) + vec3(1.5) * spec) * vCol.a;
    cover = (0.18 + rim * 0.4) * vCol.a;
  } else {
    // ice shard: pale glint
    if (r > 1.0) discard;
    float a = 1.0 - smoothstep(0.5, 0.9, max(abs(vP.x) * 1.8, abs(vP.y)));
    c = vCol.rgb * (0.8 + 0.6 * vP.y) * a * vCol.a;
    cover = a * vCol.a * 0.9;
  }
  o = vec4(c, cover);
}`,
};

// soft shadows under everything that stands on the road: aA = x, y, radius x, strength
export const SHADOW = {
  vs: `${HEAD}${VIEW}
layout(location = 0) in vec4 aA;
const vec2 P[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
out vec2 vP;
out float vK;
void main() {
  vec2 p = P[gl_VertexID];
  vP = p;
  vK = aA.w;
  gl_Position = toClip(aA.xy + p * vec2(aA.z, aA.z * 0.42));
}`,
  fs: `${HEAD}
in vec2 vP;
in float vK;
out vec4 o;
void main() {
  float r = length(vP);
  float a = vK * (1.0 - smoothstep(0.35, 1.0, r));
  if (a < 0.004) discard;
  o = vec4(0.0, 0.0, 0.0, a);
}`,
};

// damage numbers and pop-up text: glyphs from a canvas-drawn sheet.
// aA = x, y, size, unused; aB = colour; aC = glyph index, unused, unused, width scale
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
  // world y runs down the screen, as do the glyph rows
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
  // red channel: fill, alpha: fill + outline
  vec3 c = vCol.rgb * g.r * 1.6;
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
    c += s * max(l - uThreshold, 0.0) / max(l, 1e-4) / (1.0 + l * 0.2);
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

export const COMPOSITE = {
  vs: FULL_VS,
  fs: `${HEAD}${HASH}
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec4 uPost;   // exposure, bloom strength, chromatic aberration, saturation
uniform vec4 uFlash;  // flash colour, amount
uniform vec4 uGrade;  // contrast, vignette, low-health red edge, desaturate
out vec4 o;
// soft shoulder: linear up to 0.75, then eases into 1 (bright cartoon colours stay bright)
vec3 shoulder(vec3 x) {
  vec3 k = 0.75 + 0.25 * (1.0 - exp(-(x - 0.75) / 0.25));
  return mix(x, k, step(0.75, x));
}
void main() {
  vec2 dc = vUV - 0.5;
  float ca = uPost.z * dot(dc, dc);
  vec3 c;
  c.r = texture(uScene, vUV + dc * ca).r;
  c.g = texture(uScene, vUV).g;
  c.b = texture(uScene, vUV - dc * ca).b;
  c += texture(uBloom, vUV).rgb * uPost.y;
  c *= uPost.x;
  c += uFlash.rgb * uFlash.a;
  c = shoulder(max(c, 0.0));
  c = clamp(c, 0.0, 1.0);
  vec3 g = pow(c, vec3(1.0 / 2.2));
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, uPost.w * (1.0 - uGrade.w));
  g = (g - 0.5) * uGrade.x + 0.5;
  float v = length(dc * vec2(1.0, 0.8));
  g *= 1.0 - uGrade.y * smoothstep(0.35, 0.85, v);
  g = mix(g, vec3(0.55, 0.0, 0.02), uGrade.z * smoothstep(0.3, 0.75, v));
  g += (hash12(vUV * 1931.0 + fract(uMisc.x * 7.0) * 91.0) - 0.5) / 255.0;
  o = vec4(clamp(g, 0.0, 1.0), 1.0);
}`,
};

export const SOLID = {
  vs: FULL_VS,
  fs: `${HEAD}
uniform vec4 uColor;
out vec4 o;
void main() { o = uColor; }`,
};
