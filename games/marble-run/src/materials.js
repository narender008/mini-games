// Surface materials for the marble run: solid woods, lacquered paint, toy
// plastic, clear and glowing glass, cut crystal, brass, gold, chrome, glazed
// ceramic, polished marble, asteroid rock, storybook stone and glazed roof
// tiles.
//
// Every material is a MeshPhysicalMaterial patched in onBeforeCompile, so
// shadows, lights and the scene's PMREM environment work as usual. Patterns
// are worked out in the mesh's own space (a block looks cut from a piece of
// wood, not wallpapered) or along a track's metre-scaled uv. Each mesh gets
// its own random seed from where it stands (its world translation in whole
// centimetres, read in the vertex shader), so twenty identical blocks share
// one material and one program yet each shows its own grain, chips and veins.
// Equal options return the very same material instance.
//
// Noise comes from one small texture: 3D value noise costs a single texture
// read (the green channel holds the red channel of the next z slice, offset
// by (37, 17) texels, after Inigo Quilez), several times cheaper than hashing
// eight lattice corners per octave.
//
// Glass (acrylic, glowing track glass, crystal) is alpha blended, never
// three.js transmission, so marbles inside and behind stay visible. It is
// written premultiplied: reflections are added at full strength and only the
// body's own coverage hides what is behind.
import * as THREE from 'three';

// ------------------------------------------------------------ constants

// Species, in sRGB as they look oiled. k: ring spacing (m), ring contrast,
// ray amount, pore amount. m: figure, end-grain darkening, roughness, ray
// size. r: where in each ring the late wood starts, how much of the ring
// shows as a thin boundary line instead, pore size, streak strength.
const SPECIES = {
  maple: {
    early: '#efd9ad', late: '#d8b27c', ray: '#d0a874', pore: '#b08b5c',
    k: [0.0022, 0.55, 0.3, 0.12], m: [0.07, 0.28, 0.5, 0.8], r: [0.7, 0.55, 0.8, 0.5],
  },
  beech: {
    early: '#e8bf98', late: '#d39e77', ray: '#a8674a', pore: '#b0825e',
    k: [0.0027, 0.5, 0.45, 0.1], m: [0.07, 0.3, 0.52, 1.0], r: [0.72, 0.45, 0.8, 0.45],
  },
  birch: {
    early: '#efdcb9', late: '#dcc196', ray: '#d6bb92', pore: '#bba077',
    k: [0.0024, 0.35, 0.25, 0.08], m: [0.12, 0.25, 0.5, 0.7], r: [0.78, 0.6, 0.7, 0.55],
  },
  oak: {
    early: '#d9b580', late: '#b9894f', ray: '#e6c792', pore: '#6e5130',
    k: [0.0034, 0.75, 1.0, 1.0], m: [0.06, 0.32, 0.55, 2.4], r: [0.42, 0.2, 1.6, 0.6],
  },
  walnut: {
    early: '#6c4e3e', late: '#4f3629', ray: '#654838', pore: '#1f140e',
    k: [0.0032, 0.3, 0.1, 1.0], m: [0.15, 0.22, 0.46, 0.8], r: [0.35, 0.2, 1.3, 1.0],
  },
  pine: {
    early: '#f0d4a0', late: '#c88c4e', ray: '#e3c08e', pore: '#c0894f',
    k: [0.0042, 0.95, 0.08, 0.0], m: [0.05, 0.3, 0.55, 0.8], r: [0.55, 0.12, 0.5, 0.35],
  },
};

// tone, saturation, roughness offset; clearcoat and its roughness. Oil and
// lacquer wet the wood (deeper, richer), raw wood is dry, pale and matte.
const FINISH = {
  oiled: { tone: 1.0, sat: 1.04, rough: 0.0, cc: 0.2, ccRough: 0.36 },
  lacquer: { tone: 0.92, sat: 1.1, rough: -0.1, cc: 0.9, ccRough: 0.09 },
  raw: { tone: 1.06, sat: 0.88, rough: 0.16, cc: 0, ccRough: 0 },
};

// object space -> grain frame (z along the grain), for each grain axis
const GRAIN = {
  x: new THREE.Matrix3().set(0, 1, 0, 0, 0, 1, 1, 0, 0),
  y: new THREE.Matrix3().set(0, 0, 1, 1, 0, 0, 0, 1, 0),
  z: new THREE.Matrix3().set(1, 0, 0, 0, 1, 0, 0, 0, 1),
};

const col = (c) => new THREE.Color(c); // CSS hex in, linear out
const hexKey = (c) => new THREE.Color(c).getHexString();

// ------------------------------------------------------------ GLSL

const VERT_PARS = /* glsl */ `
varying vec3 vMrPos;
varying vec3 vMrNrm;
varying vec4 vMrSeed;
#ifdef MR_UVMAP
varying vec2 vMrUv;
#endif
#ifdef MR_AXES
varying vec3 vMrAy;
#endif
#if defined( MR_WOOD ) && !defined( MR_UVMAP )
uniform mat3 uGrain;
uniform vec4 uWoodF;
varying vec3 vMrLog;
#endif
vec4 mrH44(vec4 p) {
  p = fract(p * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p += dot(p, p.wzxy + 33.33);
  return fract((p.xxyz + p.yzzw) * p.zywx);
}
`;

const VERT_MAIN = /* glsl */ `
vMrPos = position;
vMrNrm = normal;
{
  // the piece's place on the table, in whole centimetres, seeds its look
  vec3 mrO = modelMatrix[3].xyz;
  #ifdef USE_INSTANCING
  mrO = ( modelMatrix * vec4( instanceMatrix[3].xyz, 1.0 ) ).xyz;
  #endif
  vec3 mrC = floor( mrO * 100.0 + 0.5 );
  vMrSeed = mrH44( vec4( mrC, mrC.x - mrC.y + mrC.z * 1.7 ) + 0.37 );
}
#ifdef MR_UVMAP
vMrUv = uv;
#endif
#ifdef MR_AXES
{
  mat3 mrIm = mat3( 1.0 );
  #ifdef USE_INSTANCING
  mrIm = mat3( instanceMatrix );
  #endif
  vMrAy = normalMatrix * ( mrIm * vec3( 0.0, 1.0, 0.0 ) );
}
#endif
#if defined( MR_WOOD ) && !defined( MR_UVMAP )
{
  // a log frame per block: sawn from a board, so usually one pair of long
  // faces is flat-sawn and the other quarter-sawn; the log leans a few
  // degrees off the block's axis; the pith sits 3-18 cm away
  vec4 s = vMrSeed;
  vec3 q = uGrain * ( position / uWoodF.w );
  float roll = s.x < 0.7 ? floor( s.y * 4.0 ) * 1.5707963 + ( s.z - 0.5 ) * 0.7 : s.y * 6.2831853;
  float cr = cos( roll );
  float sr = sin( roll );
  q.xy = mat2( cr, sr, -sr, cr ) * q.xy;
  float t1 = ( s.w - 0.5 ) * 0.14;
  float t2 = ( fract( s.x * 7.13 + s.w * 3.1 ) - 0.5 ) * 0.14;
  q.yz = mat2( cos( t1 ), sin( t1 ), -sin( t1 ), cos( t1 ) ) * q.yz;
  q.xz = mat2( cos( t2 ), sin( t2 ), -sin( t2 ), cos( t2 ) ) * q.xz;
  vMrLog = q + vec3( 0.032 + 0.15 * s.y * s.z, 0.0, ( s.z - 0.5 ) * 2.0 );
}
#endif
`;

// Shared fragment library: hashes, texture value noise, bump, curvature.
const LIB = /* glsl */ `
uniform sampler2D mrNoiseTex;
varying vec3 vMrPos;
varying vec3 vMrNrm;
varying vec4 vMrSeed;
#ifdef MR_UVMAP
varying vec2 vMrUv;
#endif
#ifdef MR_AXES
varying vec3 vMrAy;
#endif
float mrH11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float mrH21(vec2 p) { vec3 q = fract(p.xyx * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float mrH31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 mrH33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// two independent 3D value noises from one read
vec2 mrNoiseV(vec3 x) {
  vec3 p = floor(x);
  vec3 f = x - p;
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = mod(p.xy + vec2(37.0, 17.0) * p.z, 256.0) + f.xy;
  vec4 t = textureLod(mrNoiseTex, (uv + 0.5) / 256.0, 0.0);
  return mix(t.xz, t.yw, f.z);
}
float mrNoise(vec3 x) { return mrNoiseV(x).x; }
float mrFbm(vec3 p, int oct) {
  float s = 0.0;
  float a = 0.5;
  float n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * mrNoise(p);
    n += a;
    p = p * 2.03 + 11.7;
    a *= 0.5;
  }
  return s / n;
}
// 1 while a feature is several pixels across, 0 once it is below one
float mrSharp(float perPixel, float size) { return 1.0 - smoothstep(0.35, 1.0, perPixel / size); }
// Mikkelsen's bump mapping with screen derivatives; height in metres
vec3 mrBump(vec3 surfPos, vec3 surfNorm, float height, float faceDir) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec2 dh = vec2(dFdx(height), dFdy(height));
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
// Signed curvature (1/m, convex > 0) from how fast the normal turns across
// the pixel: rounded edges of bevelled blocks light up, flat faces are 0.
float mrCurv(vec3 n, vec3 p) {
  vec3 dnx = dFdx(n);
  vec3 dny = dFdy(n);
  vec3 dpx = dFdx(p);
  vec3 dpy = dFdy(p);
  float k = dot(dnx, dpx) / max(dot(dpx, dpx), 1e-14) + dot(dny, dpy) / max(dot(dpy, dpy), 1e-14);
  return clamp(k, -2000.0, 2000.0);
}
struct MrSurf {
  vec3 alb;
  float rough;
  float metal;
  float h;         // bump height (m)
  float coat;      // clearcoat multiplier
  float coatRough; // added clearcoat roughness
  float follow;    // how much the clearcoat follows the bump
  float ccH;       // extra relief in the clearcoat only (glaze ripple)
};
`;

// Env lookups for the glass passes; placed after three's envmap chunks.
const LATE = /* glsl */ `
vec3 mrEnv(vec3 dirView, float rough) {
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  vec3 d = transformDirectionByInverseViewMatrix(dirView, viewMatrix);
  return textureCubeUV(envMap, envMapRotation * d, rough).rgb * envMapIntensity;
#else
  return vec3(0.0);
#endif
}
`;

// ---------------------------------------------------------------- wood
const WOOD = /* glsl */ `
uniform vec3 uWoodA;
uniform vec3 uWoodB;
uniform vec3 uWoodRay;
uniform vec3 uWoodPore;
uniform vec4 uWoodK;
uniform vec4 uWoodM;
uniform vec4 uWoodR;
uniform vec4 uWoodF;  // finish tone, saturation, roughness offset, pattern scale
uniform mat3 uGrain;
#ifdef MR_PAINT
uniform vec3 uPaint;
uniform vec4 uPaintK; // wear, brush marks, roughness, edge thinning
#endif
#ifndef MR_UVMAP
varying vec3 vMrLog;
#endif
float mrRingH = 0.0;

// Rays: thin plates in the radial-longitudinal plane: fine dashes on
// flat-sawn faces, flecks on quarter-sawn faces.
float mrRays(vec3 q, float r, float s, float seed, float size) {
  vec2 g = vec2(s / (0.0012 * size), q.z / (0.0034 * size));
  vec2 ci = floor(g);
  vec2 cf = g - ci - 0.5;
  float seg = floor(r / (0.0014 * size) + mrH21(ci + seed));
  vec3 h = mrH33(vec3(ci, seg + seed * 7.0));
  vec2 c = (h.xy - 0.5) * vec2(0.5, 0.25);
  float w = mix(0.035, 0.09, h.z);
  float ht = mix(0.14, 0.38, fract(h.x * 7.3 + h.y));
  vec2 d = (cf - c) / vec2(w, ht);
  d.x /= max(1.0 - 0.55 * d.y * d.y, 0.2);
  float e = length(d);
  vec2 fw = fwidth(g);
  float aa = fw.x / w * 0.7 + 0.08;
  float m = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, e)) * step(0.38, h.y) * step(0.45, fract(h.z * 17.3 + seg * 0.61));
  return mix(0.02, m, mrSharp(fw.x, 0.12));
}

// Pores: fine vessels along the grain, bigger in the early wood.
float mrPores(vec3 q, float r, float s, float ringF, float seed, float size) {
  vec2 g = vec2(s, r) / 0.00034;
  vec2 ci = floor(g);
  vec2 cf = g - ci - 0.5;
  float z = q.z / 0.0055 + mrH21(ci + seed * 3.0) * 7.0;
  float zi = floor(z);
  float zf = z - zi;
  vec3 h = mrH33(vec3(ci + 17.0, zi + seed));
  float rad = size * mix(0.16, 0.3, h.z) * mix(1.3, 0.6, smoothstep(0.1, 0.7, ringF));
  rad *= smoothstep(0.0, 0.25, zf) * smoothstep(1.0, 0.7, zf);
  vec2 c = (h.xy - 0.5) * 0.3;
  float e = length(cf - c) / max(rad, 1e-3);
  vec2 fw = fwidth(g);
  float aa = max(fw.x, fw.y) / max(rad, 0.05) * 0.7 + 0.1;
  float m = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, e)) * step(0.3, fract(h.x * 13.1));
  return mix(0.08, m, mrSharp(max(fw.x, fw.y), 0.5));
}

void mrSurface(inout MrSurf S) {
  vec4 sd = vMrSeed;
  float seed = sd.x * 7.0 + sd.y * 3.0;
  vec3 n = normalize(vMrNrm);
  vec3 p = vMrPos;
  float edge = smoothstep(90.0, 320.0, mrCurv(n, p));
#ifdef MR_UVMAP
  // a track trough cut from a flat-sawn board: the pith runs along u a few
  // centimetres below, drifting in depth, which draws the cathedral arches
  vec2 uvm = vMrUv / uWoodF.w;
  float depth = 0.02 + 0.09 * sd.y * sd.y + 0.008 * sin(uvm.x * (0.9 + 1.7 * sd.z) + sd.w * 6.2832) + 0.004 * sin(uvm.x * 3.3 + sd.x * 6.2832);
  vec3 q = vec3(uvm.y - (sd.x - 0.5) * 0.05, depth, uvm.x + sd.w * 5.0);
  float R0 = depth;
  // end grain where u stops changing (the cut ends)
  vec2 du = vec2(dFdx(vMrUv.x), dFdy(vMrUv.x));
  vec2 dp = vec2(length(dFdx(p)), length(dFdy(p)));
  float gu = max(abs(du.x) / max(dp.x, 1e-7), abs(du.y) / max(dp.y, 1e-7));
  float endF = 1.0 - smoothstep(0.08, 0.3, gu);
#else
  vec3 q = vMrLog;
  float R0 = 0.032 + 0.15 * sd.y * sd.z;
  vec3 axis = vec3(uGrain[0][2], uGrain[1][2], uGrain[2][2]);
  float endF = smoothstep(0.55, 0.95, abs(dot(n, axis)));
#endif
  float spacing = uWoodK.x * (0.8 + 0.5 * sd.z);
  // the rings wander mostly along the grain (arches on flat-sawn faces)
  float w1 = mrNoise(vec3(q.xy * 14.0, q.z * 6.0) + seed * 1.31) - 0.5;
  float w2 = mrNoise(vec3(q.xy * 34.0, q.z * 19.0) + seed * 0.53 + 40.0) - 0.5;
  float r = length(q.xy) + w1 * 0.006 + w2 * 0.0013;
  float ph = r / spacing;
  ph += 1.3 * (mrNoise(vec3(ph * 0.21, seed * 5.0, 3.7)) - 0.5);
  float ring = floor(ph);
  float f = ph - ring;
  float fwR = fwidth(ph);
  float ringSharp = mrSharp(fwR, 0.9);
  float ramp = smoothstep(uWoodR.x, 0.975, f) * (1.0 - smoothstep(0.975, 1.0, f));
  float line = smoothstep(0.9, 0.975, f) * (1.0 - smoothstep(0.975, 1.0, f));
  float yearTone = mrH11(ring * 1.37 + seed * 31.0) - 0.5;
  float lt = mix(ramp, line, uWoodR.y) * (0.45 + 1.1 * mrH11(ring * 3.17 + seed * 7.0));
  float ltMean = mix(0.5 * (0.975 - uWoodR.x), 0.05, uWoodR.y);
  float late = mix(ltMean, lt, ringSharp);
  mrRingH = (0.5 - 0.5 * cos(6.2831853 * (f - 0.15))) * mrSharp(fwR, 0.45);
  float s = atan(q.y, q.x) * R0;

  float mott = mrNoise(vec3(q.xy * 60.0, q.z * 7.0) + seed * 3.3) - 0.5;
  float streak = mrNoise(vec3(q.xy * 240.0, q.z * 4.0) + seed * 1.7) - 0.5;
  float band = mrNoise(vec3(q.xy * 90.0, q.z * 2.5) + seed * 8.1) - 0.5;
  vec3 c = mix(uWoodA, uWoodB, clamp(late * uWoodK.y, 0.0, 1.0));
  c *= 1.0 + uWoodM.x * (mott * 1.2 + streak * 0.5) + band * 0.12 * uWoodR.w + yearTone * 0.05 * uWoodK.y;
  c *= vec3(1.0 - 0.03 * mott, 1.0, 1.0 + 0.05 * mott);
  float hh = mrRingH * 0.000008;
  float roughV = uWoodM.z;

#if MR_DETAIL > 0
  vec3 fq = vec3(s * 2300.0, r * 2300.0, q.z * 70.0);
  float fib = mrNoise(fq + seed) - 0.5;
  float fibS = mrSharp(length(fwidth(fq.xy)), 1.2);
  c *= 1.0 + fib * 0.1 * fibS;
  hh += fib * 0.000006 * fibS;
  float ray = mrRays(q, r, s, seed, uWoodM.w) * uWoodK.z;
  c = mix(c, uWoodRay, clamp(ray, 0.0, 1.0) * 0.6);
  hh += ray * 0.000004;
  roughV -= ray * 0.06;
#endif
#if MR_DETAIL > 1
  float pore = mrPores(q, r, s, f, seed, uWoodR.z) * uWoodK.w;
  c = mix(c, uWoodPore, clamp(pore, 0.0, 1.0) * 0.8);
  hh -= pore * 0.00003;
  roughV += pore * 0.15;
#endif

  // end grain drinks more oil: darker, rougher
  c *= 1.0 - uWoodM.y * endF;
  roughV = mix(roughV, 0.72, endF);
  // handled edges: a little darker and polished
  float wear = edge * smoothstep(0.3, 0.7, mrNoise(p * 420.0 + seed * 9.0));
  c *= 1.0 - 0.12 * wear;
  roughV -= 0.1 * wear;
  // tiny dents from a life of being dropped, more of them on the edges
  vec3 dq = p / 0.007 + seed * 17.0;
  vec3 di = floor(dq);
  vec3 dh = mrH33(di);
  float dr = mix(0.06, 0.16, dh.z);
  vec3 dc = (dh - 0.5) * (1.0 - 2.0 * dr);
  float dd = length(dq - di - 0.5 - dc) / dr;
  float dent = dd < 1.0 ? (1.0 - dd * dd) * (1.0 - dd * dd) : 0.0;
  dent *= step(0.93 - 0.3 * edge, mrH31(di + 3.1));
  hh -= dent * 0.00004;
  // each piece a touch lighter or warmer than the next
  c *= (0.94 + 0.12 * sd.w) * vec3(1.0 + (sd.z - 0.5) * 0.05, 1.0, 1.0 - (sd.z - 0.5) * 0.05);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(lum), c, uWoodF.y), 0.0) * uWoodF.x;
  roughV += uWoodF.z;
  S.alb = c;
  S.rough = roughV;
  S.h = hh;
  S.coat = 1.0 - 0.6 * endF;

#ifdef MR_PAINT
  // lacquer over wood: faint brush marks along the grain, the grain
  // telegraphing through, paint thinning on edges and a few chips
  vec3 wood = c;
  vec3 sq = endF > 0.5 ? vec3(q.y * 1300.0, q.z * 1300.0, q.x * 45.0) : vec3(q.x * 1300.0, q.y * 1300.0, q.z * 45.0);
  float stroke = mrNoise(sq + seed * 5.0) * 0.65 + mrNoise(sq * vec3(2.3, 2.3, 1.9) + 3.1) * 0.35 - 0.5;
  float strokeS = mrSharp(length(fwidth(sq.xy)), 1.0);
  float broad = mrNoise(p * 90.0 + seed * 2.0) - 0.5;
  vec3 pq = p * 1400.0 + seed * 4.0;
  float peel = mrNoise(pq) - 0.5;
  float peelS = mrSharp(length(fwidth(pq)), 1.0);
  vec3 pc = uPaint * (1.0 + 0.05 * broad + 0.03 * stroke * strokeS - 0.035 * late) * (1.0 + (sd.y - 0.5) * 0.04);
  pc *= 1.0 - 0.06 * edge * uPaintK.w;
  // edges rubbed thin with play: pale wood ghosts through in patches
  float rub = edge * uPaintK.x * smoothstep(0.45, 0.8, mrNoise(p * 260.0 + seed * 3.0));
  pc = mix(pc, wood * 0.95, rub * 0.35);
  // chips: ragged spots in 6 mm cells; only those on an edge break the paint
  vec3 cq = p / 0.006 + seed * 11.0;
  vec3 ci = floor(cq);
  vec3 ch = mrH33(ci + 7.7);
  float cr = mix(0.1, 0.24, ch.z);
  vec3 cc = (ch - 0.5) * (1.0 - 2.0 * cr);
  float ragged = (mrNoise(p * 2600.0 + seed) - 0.5) * 0.55 + (mrNoise(p * 900.0 + seed * 2.0) - 0.5) * 0.35;
  float cd = length(cq - ci - 0.5 - cc) / cr + ragged;
  float live = step(1.0 - 0.4 * uPaintK.x, mrH31(ci + 1.3)) * smoothstep(0.35, 0.75, edge);
  float fwc = fwidth(cd);
  float chip = (1.0 - smoothstep(1.0 - fwc, 1.0 + fwc, cd)) * live;
  float lip = (1.0 - smoothstep(1.12 - fwc, 1.12 + fwc, cd)) * live - chip;
  S.alb = mix(pc, wood * 0.92, chip);
  S.alb = mix(S.alb, pc * 1.12, lip * 0.6);
  S.rough = mix(uPaintK.z + stroke * 0.05 * strokeS, 0.72, chip);
  float relief = mrRingH * 0.000004 + stroke * 0.000006 * uPaintK.y * strokeS + peel * 0.000005 * peelS + broad * 0.00002 - dent * 0.00003;
  S.h = mix(relief, hh, chip) - chip * 0.00006;
  S.coat = 1.0 - chip;
  S.coatRough = stroke * 0.03 * strokeS;
  S.follow = 0.7;
#endif
}
`;

// ---------------------------------------------------------------- plastic
const PLASTIC = /* glsl */ `
uniform vec3 uCol;
uniform vec4 uK; // roughness, unused...
void mrSurface(inout MrSurf S) {
  vec3 p = vMrPos;
  float seed = vMrSeed.x * 17.0;
  // broad flow marks and sink waviness from the mould, and its fine texture
  vec2 fl = mrNoiseV(p * 55.0 + seed);
  vec3 fp = p * 700.0 + seed;
  float fine = mrNoise(fp);
  float fineS = mrSharp(length(fwidth(fp)), 1.0);
  S.alb = uCol * (1.0 + 0.05 * (fl.y - 0.5));
  S.rough = uK.x + 0.05 * (fl.x - 0.5) + 0.03 * (fine - 0.5) * fineS;
  S.h = (fl.x - 0.5) * 0.00003 + (fine - 0.5) * 0.0000008 * fineS;
  S.follow = 1.0;
}
`;

// ---------------------------------------------------------------- metals
const METAL = /* glsl */ `
uniform vec3 uCol;      // F0, linear
uniform vec4 uK;        // roughness, polishing marks, age, waviness
uniform vec3 uTarnish;
void mrSurface(inout MrSurf S) {
  vec3 p = vMrPos;
  vec3 n = normalize(vMrNrm);
  float seed = vMrSeed.x * 13.0;
#ifdef MR_TURNED
  // lathe-turned: fine polishing rings round the local y axis
  vec3 mq = vec3(p.y * 2600.0 + length(p.xz) * 1400.0, length(p.xz) * 300.0, seed);
#else
  // drawn or plated: fine marks along whichever way, very short
  vec3 mq = p * vec3(2200.0, 260.0, 2200.0) + seed;
#endif
  float marks = mrNoise(mq) - 0.5;
  float marksS = mrSharp(length(fwidth(mq.xy)), 1.2);
  vec2 wv = mrNoiseV(p * 70.0 + seed);
  float curv = mrCurv(n, p);
  // tarnish gathers in hollows and in blotches
  float cav = smoothstep(-20.0, -220.0, curv);
  float blot = smoothstep(0.55, 0.85, mrNoise(p * 45.0 + seed * 2.0));
  float tarn = uK.z * clamp(cav * 0.9 + blot * 0.6 + 0.12, 0.0, 1.0);
  S.alb = mix(uCol * (1.0 + 0.04 * (wv.y - 0.5)), uTarnish, tarn * 0.75);
  S.rough = uK.x + marks * 0.06 * uK.y * marksS + tarn * 0.3;
  S.metal = 1.0;
  S.h = marks * 0.0000006 * uK.y * marksS + (wv.x - 0.5) * 0.00002 * uK.w;
}
`;

// ---------------------------------------------------------------- ceramic
const CERAMIC = /* glsl */ `
uniform vec3 uCol;
uniform vec4 uK; // ripple, specks
void mrSurface(inout MrSurf S) {
  vec3 p = vMrPos;
  float seed = vMrSeed.x * 11.0;
  vec3 n = normalize(vMrNrm);
  vec2 rp = mrNoiseV(p * 140.0 + seed);
  float rp2 = mrNoise(p * 420.0 + seed * 2.0);
  S.alb = uCol * (1.0 - 0.02 * (rp.y - 0.5));
  // the glaze pools a touch deeper in hollows
  float pool = smoothstep(-15.0, -150.0, mrCurv(n, p));
  S.alb *= mix(vec3(1.0), vec3(0.92, 0.94, 0.97), pool);
  // rare iron specks
  vec3 cq = p / 0.004 + seed;
  vec3 ci = floor(cq);
  vec3 ch = mrH33(ci);
  float dd = length(cq - ci - 0.5 - (ch - 0.5) * 0.6) / 0.07;
  float speck = (1.0 - smoothstep(0.5, 1.0, dd)) * step(0.985, mrH31(ci + 2.7)) * uK.y;
  S.alb *= 1.0 - 0.5 * speck;
  S.rough = 0.45;
  S.ccH = (rp.x - 0.5) * 0.000014 * uK.x + (rp2 - 0.5) * 0.000002;
  S.follow = 0.0;
}
`;

// ---------------------------------------------------------------- marble
const MARBLE = /* glsl */ `
uniform vec3 uCol;
uniform vec3 uVein;
uniform vec4 uK; // vein strength
void mrSurface(inout MrSurf S) {
  vec3 p = vMrPos * 7.0 + vMrSeed.xyz * 9.0;
  int oct = MR_DETAIL > 0 ? 5 : 3;
  // stretch the noise along one direction so the veins flow, as in a block
  vec3 pf = vec3(p.x * 0.55 + p.z * 0.3, p.y, p.z * 0.8 - p.x * 0.2);
  float t = mrFbm(pf, oct);
  float t2 = mrFbm(pf * 2.1 + 7.0, 3);
  // veins are isolines of warped noise: a meandering, branching network,
  // with a soft grey feather either side
  float iso = abs(t - 0.5 + 0.18 * (t2 - 0.5));
  float fi = fwidth(iso) + 1e-4;
  float vein = 1.0 - smoothstep(0.003, 0.014 + fi, iso);
  float halo = 1.0 - smoothstep(0.0, 0.07, iso);
  float iso2 = abs(t2 - 0.5);
  float hair = (1.0 - smoothstep(0.0, 0.008 + fwidth(iso2), iso2)) * smoothstep(0.35, 0.6, t);
  float cloud = mrNoise(p * 0.8 + 3.0);
  vec3 c = uCol * (0.96 + 0.07 * (cloud - 0.5));
  c = mix(c, mix(uCol, uVein, 0.3), smoothstep(0.5, 0.75, t) * 0.3 * uK.x);
  c = mix(c, mix(uCol, uVein, 0.45), halo * 0.35 * uK.x);
  c = mix(c, uVein, vein * 0.75 * uK.x);
  c = mix(c, mix(uCol, uVein, 0.6), hair * 0.4 * uK.x);
  S.alb = c;
  S.rough = 0.1 + 0.06 * vein;
  S.h = (cloud - 0.5) * 0.000004;
  S.follow = 1.0;
}
`;

// ------------------------------------------- stone, slate, asteroid (procedural)
const ROCKS = /* glsl */ `
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform vec4 uK;
// triplanar weights from the object normal
vec3 mrTriW(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }

#ifdef MR_CASTLE
// dressed stone: courses 6 mm high, stones 9-16 mm long, 0.8 mm joints
float mrAshlar(vec2 g, float seed, out float mortar, out float tone) {
  float cw = 0.0125;
  float chh = 0.006;
  float row = floor(g.y / chh);
  float ly = g.y / chh - row;
  float xs = g.x / cw + mrH11(row * 7.13 + seed);
  float k0 = floor(xs);
  float b0 = k0 + (mrH21(vec2(k0, row)) - 0.5) * 0.5;
  float k = xs < b0 ? k0 - 1.0 : k0;
  float bL = k + (mrH21(vec2(k, row)) - 0.5) * 0.5;
  float bR = k + 1.0 + (mrH21(vec2(k + 1.0, row)) - 0.5) * 0.5;
  float ed = min(min(xs - bL, bR - xs) * cw, min(ly, 1.0 - ly) * chh);
  ed += (mrNoise(vec3(g * 900.0, seed)) - 0.5) * 0.0006;
  float jw = 0.0004;
  float aa = fwidth(ed) + 1e-5;
  mortar = 1.0 - smoothstep(jw - aa, jw + aa, ed);
  tone = mrH21(vec2(k, row) + 3.7);
  float face = smoothstep(jw, jw + 0.0012, ed);
  float chisel = mrNoise(vec3(g * 450.0, tone * 20.0)) - 0.5;
  return face * (0.0004 + chisel * 0.00012 + (tone - 0.5) * 0.00012) - mortar * 0.0001;
}
#endif

#ifdef MR_COBBLE
float mrCobble(vec2 g, float seed, out float gap, out float tone) {
  vec2 x = g / 0.011;
  vec2 i = floor(x);
  vec2 f = x - i;
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int yy = -1; yy <= 1; yy++) {
    for (int xx = -1; xx <= 1; xx++) {
      vec2 o = vec2(float(xx), float(yy));
      vec2 r = o + 0.15 + 0.7 * vec2(mrH21(i + o + seed), mrH21(i + o + seed + 5.1)) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = mrH21(i + o + 17.0); } else if (d < d2) { d2 = d; }
    }
  }
  float ed = (sqrt(d2) - sqrt(d1)) * 0.5 * 0.011;
  float aa = fwidth(ed) + 1e-5;
  gap = 1.0 - smoothstep(0.0004 - aa, 0.0004 + aa, ed);
  tone = id;
  return sqrt(clamp(ed / 0.004, 0.0, 1.0)) * 0.002 + (mrNoise(vec3(g * 300.0, id * 30.0)) - 0.5) * 0.0002;
}
#endif

#ifdef MR_SLATE
// fish-scale roof tiles, 7 mm, rows along the object's y
float mrScales(vec2 g, float seed, out float cav, out float tone) {
  vec2 x = g / 0.007;
  float row = floor(x.y);
  float off = mod(row, 2.0) * 0.5;
  float cx = floor(x.x - off) + 0.5 + off;
  float dx = x.x - cx;
  float bot = row + 0.5 - 0.5 * sqrt(max(0.0, 1.0 - 4.0 * dx * dx));
  float own = x.y >= bot ? row : row - 1.0;
  float offO = mod(own, 2.0) * 0.5;
  float cxO = floor(x.x - offO) + 0.5 + offO;
  float dxO = x.x - cxO;
  float botO = own + 0.5 - 0.5 * sqrt(max(0.0, 1.0 - 4.0 * dxO * dxO));
  float up = x.y - botO;                        // height above its own lip
  float below = x.y >= bot ? 1.0 : bot - x.y;   // distance under the lip of the row above
  float lipR = smoothstep(0.0, 0.08, up);
  float h = (0.7 + 0.3 * lipR) * (1.0 - clamp(up / 1.5, 0.0, 1.0)) * 0.0011;
  float side = smoothstep(0.46, 0.5, abs(dxO));
  h -= side * 0.0002;
  cav = smoothstep(0.0, 0.22, below) * (1.0 - 0.5 * side);
  tone = mrH21(vec2(cxO, own) + seed);
  return h;
}
#endif

void mrSurface(inout MrSurf S) {
  vec3 p = vMrPos;
  vec3 n = normalize(vMrNrm);
  float seed = vMrSeed.x * 37.0;
  vec3 w = mrTriW(n);
  float h = 0.0;
  float m = 0.0;
  float tone = 0.0;
#if defined( MR_CASTLE ) || defined( MR_COBBLE )
  // three projections, courses horizontal on the walls
  vec2 gx = p.zy + vMrSeed.xy;
  vec2 gy = p.xz + vMrSeed.yz;
  vec2 gz = p.xy + vMrSeed.zw;
  float m1; float t1; float m2; float t2; float m3; float t3;
  #ifdef MR_CASTLE
  float h1 = mrAshlar(gx, seed, m1, t1);
  float h2 = w.y > 0.02 ? mrAshlar(gy, seed + 3.0, m2, t2) : 0.0;
  float h3 = mrAshlar(gz, seed + 5.0, m3, t3);
  #else
  float h1 = mrCobble(gx, seed, m1, t1);
  float h2 = w.y > 0.02 ? mrCobble(gy, seed + 3.0, m2, t2) : 0.0;
  float h3 = mrCobble(gz, seed + 5.0, m3, t3);
  #endif
  if (w.y <= 0.02) { m2 = 0.0; t2 = 0.0; }
  h = h1 * w.x + h2 * w.y + h3 * w.z;
  m = m1 * w.x + m2 * w.y + m3 * w.z;
  tone = t1 * w.x + t2 * w.y + t3 * w.z;
  float grit = mrNoise(p * 1500.0 + seed);
  float gritS = mrSharp(length(fwidth(p * 1500.0)), 1.0);
  vec3 c = mix(uColA, uColB, tone) * (1.0 + (grit - 0.5) * 0.18 * gritS);
  c *= 0.92 + 0.16 * mrNoise(p * 30.0 + seed);
  S.alb = mix(c, uColC, m);
  S.rough = mix(0.82, 0.95, m);
  S.h = h + (grit - 0.5) * 0.00002 * gritS;
#elif defined( MR_SLATE )
  // side-planar: rows follow y on every side of a roof
  vec2 wz = pow(abs(n.xz), vec2(4.0));
  wz /= max(wz.x + wz.y, 1e-4);
  float c1; float t1; float c2; float t2;
  float h1 = mrScales(vec2(p.z, p.y) + vMrSeed.xy * 0.1, seed, c1, t1);
  float h2 = mrScales(vec2(p.x, p.y) + vMrSeed.zw * 0.1, seed + 1.0, c2, t2);
  h = h1 * wz.x + h2 * wz.y;
  float cav = c1 * wz.x + c2 * wz.y;
  tone = t1 * wz.x + t2 * wz.y;
  vec3 c = uColA * (0.86 + 0.24 * tone) * mix(0.45, 1.0, cav);
  S.alb = c;
  S.rough = 0.3;
  S.h = h;
  S.follow = 1.0;
#else
  // asteroid: craters in 3D cells of three sizes, pits, lumps and grit
  float cavity = 1.0;
  for (int L = 0; L < 3; L++) {
    float cs = L == 0 ? 0.022 : (L == 1 ? 0.009 : 0.0038);
    vec3 x = p / cs + seed * float(L + 1);
    vec3 i = floor(x);
    vec3 f = x - i;
    // nearest crater centre among the 8 cells around the point
    for (int k = 0; k < 8; k++) {
      vec3 o = vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1)) - step(vec3(0.5), 1.0 - f);
      vec3 hc = mrH33(i + o + 0.5);
      if (hc.z > 0.55) continue;
      vec3 ctr = o + 0.2 + 0.6 * hc - f;
      float R = mix(0.3, 0.5, fract(hc.x * 7.1 + hc.y));
      float d = length(ctr) / R;
      float size = R * cs;
      bool hole = fract(hc.y * 13.7) < 0.22;
      if (d < 1.0) {
        if (hole) { h -= size * 0.9 * (1.0 - smoothstep(0.6, 1.0, d)); cavity *= mix(0.25, 1.0, smoothstep(0.55, 1.0, d)); }
        else { h += size * 0.35 * (d * d - 1.0); cavity *= mix(0.72, 1.0, d); }
      }
      h += size * 0.1 * exp(-pow((d - 1.0) / 0.22, 2.0));
    }
  }
  float lump = mrFbm(p * 60.0 + seed, MR_DETAIL > 0 ? 4 : 2);
  h += (lump - 0.5) * 0.003;
  float grit = mrNoise(p * 1800.0 + seed);
  float gritS = mrSharp(length(fwidth(p * 1800.0)), 1.0);
  h += (grit - 0.5) * 0.00006 * gritS;
  tone = mrNoise(p * 25.0 + seed * 3.0);
  vec3 c = mix(uColA, uColB, tone * 0.7 + 0.3 * lump) * mix(0.3, 1.0, cavity);
  c *= 1.0 + (grit - 0.5) * 0.35 * gritS;
  S.alb = c;
  S.rough = 0.9 - 0.08 * tone;
  S.h = h;
#endif
}
`;

// ---------------------------------------------------------------- glass
const GLASS = /* glsl */ `
uniform vec4 uGlassK;  // base coverage, wall-band cos, band coverage, reflection boost
uniform vec3 uGlow;    // emission colour x glow (linear HDR)
uniform vec3 uGlow2;   // rim hue
void mrSurface(inout MrSurf S) {
  S.follow = 1.0;
}
`;

// replaces <opaque_fragment> for the glass family
const GLASS_OUT = /* glsl */ `
{
  vec3 V = geometryViewDir;
  vec3 N = normal;
  float nv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - nv, 5.0);
  float fwn = fwidth(nv) + 0.004;
  float a = uGlassK.x;
  vec3 extra = vec3(0.0);
  vec3 tint = diffuseColor.rgb;
  float front = gl_FrontFacing ? 1.0 : 0.6;
#ifndef MR_CRYSTAL
  // Where the view grazes the wall of a tube or rounded rail the ray runs
  // through solid glass: a denser, tinted band with the world bent inside
  // it, and a bright line along the inner wall's edge.
  float band = (1.0 - smoothstep(uGlassK.y - fwn, uGlassK.y + fwn, nv)) * front;
  float edgeLine = exp(-pow((nv - uGlassK.y) / (fwn * 1.5), 2.0)) * front;
  vec3 bent = mrEnv(refract(-V, N, 0.67), 0.12);
  extra += band * tint * tint * bent * 0.35;
  extra += edgeLine * mrEnv(reflect(-V, N), 0.05) * 0.5;
  a = mix(a, uGlassK.z, band);
  a += edgeLine * 0.15;
#endif
#ifdef MR_GLOW
  // edge-lit glass: light piped inside escapes at edges, rims and grazing
  // angles, so they glow; the flat body only faintly
  float edgeG = smoothstep(80.0, 380.0, abs(mrCurv(normalize(vMrNrm), vMrPos)));
  float st = mrNoise(vMrPos * 45.0 + vMrSeed.xyz * 10.0);
  float streak = pow(1.0 - abs(2.0 * st - 1.0), 14.0);
  vec3 glowC = mix(uGlow, uGlow2, clamp(fres * 1.5 + 0.35 * streak, 0.0, 0.6));
  extra += glowC * (0.1 + 1.4 * edgeG + 0.9 * fres + 0.6 * band + 0.35 * streak) * front;
#endif
#ifdef MR_CRYSTAL
  // cut crystal: each facet (its flat normal in object space) throws back a
  // different bit of the world through the stone, split into colours
  vec3 nf = normalize(cross(dFdx(vMrPos), dFdy(vMrPos)));
  vec3 fh = mrH33(floor(abs(nf) * 23.0 + 0.5) + 3.1 + vMrSeed.xyz * 7.0);
  vec3 exitN = normalize(N + (fh - 0.5) * 1.3);
  vec3 dR = reflect(refract(-V, N, 1.0 / 2.30), exitN);
  vec3 dG = reflect(refract(-V, N, 1.0 / 2.40), exitN);
  vec3 dB = reflect(refract(-V, N, 1.0 / 2.52), exitN);
  vec3 fire = vec3(mrEnv(dR, 0.03).r, mrEnv(dG, 0.03).g, mrEnv(dB, 0.03).b);
  extra += tint * fire * (0.35 + 0.5 * fh.x) * front;
  extra += uGlow * (0.04 + 0.7 * fres + 0.9 * pow(fh.y, 4.0)) * front;
  a += 0.3 * fres;
#endif
  a = clamp(a + fres * 0.1, 0.0, 1.0);
  gl_FragColor = vec4(totalDiffuse * a + totalSpecular * uGlassK.w + extra, a);
}
`;

// ------------------------------------------------------------ patching

const MAIN = /* glsl */ `
MrSurf mrS;
mrS.alb = diffuseColor.rgb;
mrS.rough = roughness;
mrS.metal = metalness;
mrS.h = 0.0;
mrS.coat = 1.0;
mrS.coatRough = 0.0;
mrS.follow = 0.0;
mrS.ccH = 0.0;
mrSurface(mrS);
diffuseColor.rgb = mrS.alb;
`;

// wrapped diffuse: light creeps a little past the terminator, tinted deeper,
// the way it does in plastic, glaze and marble that let light in
const WRAP_FROM = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
const WRAP_TO = `${WRAP_FROM}
	{
		float mrNL = dot( geometryNormal, directLight.direction );
		float mrW = saturate( ( mrNL + mrWrap.w ) / ( 1.0 + mrWrap.w ) ) - dotNL;
		reflectedLight.directDiffuse += max( mrW, 0.0 ) * directLight.color * mrWrap.rgb * BRDF_Lambert( material.diffuseContribution );
	}`;

const ANISO = /* glsl */ `
#ifdef USE_ANISOTROPY
{
  // turned brass: highlights stretch along the profile, across the rings
  vec3 mrCirc = cross(normalize(vMrAy), normal);
  float mrCl = length(mrCirc);
  if (mrCl > 1e-3) {
    mrCirc /= mrCl;
    material.anisotropyT = normalize(cross(normal, mrCirc));
    material.anisotropyB = mrCirc;
  } else {
    material.anisotropy = 0.0;
    material.alphaT = pow2(material.roughness);
  }
}
#endif
`;

function patch(mat, { kind, detail, pars, uniforms, bump = true, ccBump = false, wrap = false, glass = false, aniso = false }) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}`);
    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', `#include <common>\n#define MR_DETAIL ${detail}\n${wrap ? 'uniform vec4 mrWrap;' : ''}\n${LIB}\n${pars}`);
    let phys = THREE.ShaderChunk.lights_physical_pars_fragment;
    if (wrap) {
      if (phys.includes(WRAP_FROM)) phys = phys.replace(WRAP_FROM, WRAP_TO);
      else console.warn('materials: wrap hook not found');
    }
    fs = fs.replace('#include <lights_physical_pars_fragment>', `${phys}\n${LATE}`);
    fs = fs.replace('#include <map_fragment>', MAIN);
    fs = fs.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp( mrS.rough, 0.02, 1.0 );');
    fs = fs.replace('#include <metalnessmap_fragment>', 'float metalnessFactor = mrS.metal;');
    if (bump) fs = fs.replace('#include <normal_fragment_maps>', 'normal = mrBump( - vViewPosition, normal, mrS.h, faceDirection );');
    fs = fs.replace(
      '#include <clearcoat_normal_fragment_maps>',
      `#ifdef USE_CLEARCOAT
clearcoatNormal = normalize( mix( nonPerturbedNormal, normal, mrS.follow ) );
${ccBump ? 'clearcoatNormal = mrBump( - vViewPosition, clearcoatNormal, mrS.ccH, faceDirection );' : ''}
#endif`,
    );
    fs = fs.replace(
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat *= mrS.coat;
material.clearcoatRoughness = clamp( material.clearcoatRoughness + mrS.coatRough, 0.0525, 1.0 );
#endif
${aniso ? ANISO : ''}`,
    );
    if (glass) fs = fs.replace('#include <opaque_fragment>', GLASS_OUT);
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `mr-${kind}-${detail}`;
  return mat;
}

// 3D value noise lattice in a 256 x 256 RGBA texture: R and B are two
// independent random fields, G and A the same fields shifted by (37, 17),
// which is where the next z slice is looked up.
function noiseTexture() {
  const N = 256;
  let s = 0x9e3779b9;
  const rand = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const a = new Uint8Array(N * N);
  const b = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    a[i] = Math.floor(rand() * 256);
    b[i] = Math.floor(rand() * 256);
  }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const j = ((y + 17) & 255) * N + ((x + 37) & 255);
      data[i] = a[y * N + x];
      data[i + 1] = a[j];
      data[i + 2] = b[y * N + x];
      data[i + 3] = b[j];
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------ the library

export class Materials {
  constructor({ renderer, quality } = {}) {
    this.renderer = renderer;
    this.quality = quality || { tier: 'high', texSize: 1024 };
    const tier = this.quality.tier || 'high';
    this.detail = tier === 'high' ? 2 : tier === 'medium' ? 1 : 0;
    this.cache = new Map();
    this.noise = null;
  }

  // Bakes the shared noise lattice; everything else is procedural in the
  // shaders, so there is nothing more to prepare. progress(0..1).
  async warm(progress) {
    this.noiseUniform();
    if (progress) progress(1);
  }

  noiseUniform() {
    if (!this.noise) this.noise = { value: noiseTexture() };
    return this.noise;
  }

  cached(kind, opts, make) {
    const key = `${kind}|${JSON.stringify(opts)}`;
    let m = this.cache.get(key);
    if (!m) {
      m = make();
      m.name = `mr-${kind}`;
      m.userData.mrKey = key;
      this.cache.set(key, m);
    }
    return m;
  }

  base(params, defines) {
    const m = new THREE.MeshPhysicalMaterial(params);
    m.defines = { ...(m.defines || {}), ...defines };
    return m;
  }

  wood({ species = 'beech', mapping = 'object', finish = 'oiled', grain = 'x', scale = 1 } = {}) {
    if (!SPECIES[species]) species = 'beech';
    if (!FINISH[finish]) finish = 'oiled';
    if (!GRAIN[grain]) grain = 'x';
    mapping = mapping === 'uv' ? 'uv' : 'object';
    return this.cached('wood', { species, mapping, finish, grain, scale }, () => this.makeWood({ species, mapping, finish, grain, scale }));
  }

  paint({ color = '#c3272a', mapping = 'object', wear = 0.35, gloss = 0.6 } = {}) {
    mapping = mapping === 'uv' ? 'uv' : 'object';
    const c = hexKey(color);
    return this.cached('paint', { c, mapping, wear, gloss }, () =>
      this.makeWood({ species: 'beech', mapping, finish: 'oiled', grain: 'x', scale: 1, paint: { color, wear, gloss } }),
    );
  }

  makeWood({ species, mapping, finish, grain, scale, paint }) {
    const w = SPECIES[species];
    const f = FINISH[finish];
    const defines = { MR_WOOD: '' };
    if (mapping === 'uv') defines.MR_UVMAP = '';
    if (paint) defines.MR_PAINT = '';
    const g = Math.max(0, Math.min(1, paint ? paint.gloss : 0));
    const m = this.base(
      {
        color: 0xffffff,
        roughness: 0.5,
        metalness: 0,
        clearcoat: paint ? 0.55 + 0.45 * g : f.cc,
        clearcoatRoughness: paint ? 0.35 - 0.29 * g : f.ccRough,
      },
      defines,
    );
    const uniforms = {
      mrNoiseTex: this.noiseUniform(),
      uWoodA: { value: col(w.early) },
      uWoodB: { value: col(w.late) },
      uWoodRay: { value: col(w.ray) },
      uWoodPore: { value: col(w.pore) },
      uWoodK: { value: new THREE.Vector4(...w.k) },
      uWoodM: { value: new THREE.Vector4(...w.m) },
      uWoodR: { value: new THREE.Vector4(...w.r) },
      uWoodF: { value: new THREE.Vector4(f.tone, f.sat, f.rough, Math.max(0.05, scale)) },
      uGrain: { value: GRAIN[grain].clone() },
    };
    if (paint) {
      uniforms.uPaint = { value: col(paint.color) };
      uniforms.uPaintK = { value: new THREE.Vector4(Math.max(0, Math.min(1, paint.wear)), 1, 0.42 - 0.14 * g, 0.5) };
    }
    return patch(m, { kind: paint ? 'paint' : 'wood', detail: this.detail, pars: WOOD, uniforms });
  }

  plastic({ color = '#e8741c', gloss = 0.85 } = {}) {
    const c = hexKey(color);
    return this.cached('plastic', { c, gloss }, () => {
      const g = Math.max(0, Math.min(1, gloss));
      const m = this.base({ color: 0xffffff, roughness: 0.3, metalness: 0, ior: 1.49, clearcoat: 0.35 * g, clearcoatRoughness: 0.04 }, { MR_PLASTIC: '' });
      const lc = col(color);
      const mx = Math.max(lc.r, lc.g, lc.b, 1e-4);
      const tint = new THREE.Vector4(Math.pow(lc.r / mx, 1.6) * 0.6, Math.pow(lc.g / mx, 1.6) * 0.6, Math.pow(lc.b / mx, 1.6) * 0.6, 0.45);
      const uniforms = {
        mrNoiseTex: this.noiseUniform(),
        uCol: { value: lc },
        uK: { value: new THREE.Vector4(0.5 - 0.36 * g, 0, 0, 0) },
        mrWrap: { value: tint },
      };
      return patch(m, { kind: 'plastic', detail: this.detail, pars: PLASTIC, uniforms, wrap: true });
    });
  }

  glassBase(kind, defines, { color, roughness, ior, k, glow = '#000000', glow2 = '#000000', glowK = 0, flat = false }) {
    const m = this.base({ color: col(color), roughness, metalness: 0, ior, transparent: true, depthWrite: false, side: THREE.DoubleSide, flatShading: flat }, defines);
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor;
    m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    const uniforms = {
      mrNoiseTex: this.noiseUniform(),
      uGlassK: { value: new THREE.Vector4(...k) },
      uGlow: { value: col(glow).multiplyScalar(glowK) },
      uGlow2: { value: col(glow2).multiplyScalar(glowK) },
    };
    return patch(m, { kind, detail: this.detail, pars: GLASS, uniforms, glass: true, bump: false });
  }

  acrylic({ tint = '#ffffff', frost = 0 } = {}) {
    const t = hexKey(tint);
    return this.cached('acrylic', { t, frost }, () => {
      const fr = Math.max(0, Math.min(1, frost));
      return this.glassBase('acrylic', { MR_ACRYLIC: '' }, {
        color: tint,
        roughness: 0.03 + 0.45 * fr,
        ior: 1.49,
        k: [0.02 + 0.4 * fr, 0.44, 0.26, 1.0],
      });
    });
  }

  glowGlass({ color = '#46e0ff', glow = 1 } = {}) {
    const c = hexKey(color);
    return this.cached('glowGlass', { c, glow }, () => {
      // the rim leans a little towards violet: a hint of dispersion
      const rim = col(color).lerp(new THREE.Color('#b56cff'), 0.45).getHexString();
      return this.glassBase('glow', { MR_GLOW: '' }, {
        color,
        roughness: 0.04,
        ior: 1.5,
        k: [0.12, 0.4, 0.5, 1.0],
        glow: color,
        glow2: `#${rim}`,
        glowK: Math.max(0, glow),
      });
    });
  }

  crystal({ tint = '#bfe6ff', glow = 0.3 } = {}) {
    const t = hexKey(tint);
    return this.cached('crystal', { t, glow }, () =>
      this.glassBase('crystal', { MR_CRYSTAL: '' }, {
        color: tint,
        roughness: 0.02,
        ior: 2.0,
        k: [0.04, 0.0, 0.0, 1.3],
        glow: tint,
        glowK: Math.max(0, glow),
        flat: true,
      }),
    );
  }

  metal(kind, { f0, rough, marks, age, wavy, tarnish, turned, aniso }) {
    const defines = { MR_METAL: '', MR_AXES: '' };
    if (turned) defines.MR_TURNED = '';
    const m = this.base({ color: 0xffffff, roughness: rough, metalness: 1, anisotropy: aniso }, defines);
    const uniforms = {
      mrNoiseTex: this.noiseUniform(),
      uCol: { value: new THREE.Color(...f0) },
      uK: { value: new THREE.Vector4(rough, marks, age, wavy) },
      uTarnish: { value: new THREE.Color(...tarnish) },
    };
    return patch(m, { kind, detail: this.detail, pars: METAL, uniforms, aniso: aniso > 0 });
  }

  brass({ polish = 0.8, age = 0.2 } = {}) {
    return this.cached('brass', { polish, age }, () => {
      const p = Math.max(0, Math.min(1, polish));
      return this.metal('brass', {
        f0: [0.93, 0.7, 0.3],
        rough: 0.34 - 0.27 * p,
        marks: 0.4 + 0.6 * p,
        age: Math.max(0, Math.min(1, age)),
        wavy: 1 - 0.6 * p,
        tarnish: [0.2, 0.14, 0.065],
        turned: true,
        aniso: 0.45,
      });
    });
  }

  gold({ polish = 0.9 } = {}) {
    return this.cached('gold', { polish }, () => {
      const p = Math.max(0, Math.min(1, polish));
      return this.metal('gold', { f0: [1.0, 0.77, 0.36], rough: 0.3 - 0.23 * p, marks: 0.5, age: 0, wavy: 0.4, tarnish: [0, 0, 0], turned: false, aniso: 0 });
    });
  }

  chrome() {
    return this.cached('chrome', {}, () =>
      this.metal('chrome', { f0: [0.55, 0.556, 0.56], rough: 0.035, marks: 0.25, age: 0, wavy: 0.25, tarnish: [0, 0, 0], turned: false, aniso: 0 }),
    );
  }

  ceramic({ color = '#f7f5f0' } = {}) {
    const c = hexKey(color);
    return this.cached('ceramic', { c }, () => {
      const m = this.base({ color: 0xffffff, roughness: 0.45, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.025 }, { MR_CERAMIC: '' });
      const uniforms = {
        mrNoiseTex: this.noiseUniform(),
        uCol: { value: col(color).multiplyScalar(0.88) },
        uK: { value: new THREE.Vector4(1, 1, 0, 0) },
        mrWrap: { value: new THREE.Vector4(0.34, 0.24, 0.16, 0.6) },
      };
      return patch(m, { kind: 'ceramic', detail: this.detail, pars: CERAMIC, uniforms, wrap: true, bump: false, ccBump: true });
    });
  }

  marbleStone({ color = '#eeeae6', veins = '#8d8a88' } = {}) {
    const c = hexKey(color);
    const v = hexKey(veins);
    return this.cached('marbleStone', { c, v }, () => {
      const m = this.base({ color: 0xffffff, roughness: 0.12, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.04 }, { MR_MARBLE: '' });
      const uniforms = {
        mrNoiseTex: this.noiseUniform(),
        uCol: { value: col(color).multiplyScalar(0.9) },
        uVein: { value: col(veins) },
        uK: { value: new THREE.Vector4(1, 0, 0, 0) },
        mrWrap: { value: new THREE.Vector4(0.3, 0.27, 0.24, 0.5) },
      };
      return patch(m, { kind: 'marble', detail: this.detail, pars: MARBLE, uniforms, wrap: true });
    });
  }

  rock(kind, defines, { a, b, c, rough, cc = 0, ccRough = 0.05 }) {
    const m = this.base({ color: 0xffffff, roughness: rough, metalness: 0, clearcoat: cc, clearcoatRoughness: ccRough }, defines);
    const uniforms = {
      mrNoiseTex: this.noiseUniform(),
      uColA: { value: col(a) },
      uColB: { value: col(b) },
      uColC: { value: col(c) },
      uK: { value: new THREE.Vector4(1, 0, 0, 0) },
    };
    return patch(m, { kind, detail: this.detail, pars: ROCKS, uniforms });
  }

  asteroid() {
    return this.cached('asteroid', {}, () => this.rock('asteroid', { MR_ASTEROID: '' }, { a: '#4a4744', b: '#a9a39b', c: '#000000', rough: 0.9 }));
  }

  stone({ kind = 'castle' } = {}) {
    kind = kind === 'cobble' ? 'cobble' : 'castle';
    return this.cached('stone', { kind }, () =>
      kind === 'cobble'
        ? this.rock('cobble', { MR_COBBLE: '' }, { a: '#8f8a80', b: '#6d6a66', c: '#3b372f', rough: 0.85 })
        : this.rock('castle', { MR_CASTLE: '' }, { a: '#cbc6bc', b: '#a9a49b', c: '#8d887f', rough: 0.82 }),
    );
  }

  slate({ color = '#3b5ea8' } = {}) {
    const c = hexKey(color);
    return this.cached('slate', { c }, () => this.rock('slate', { MR_SLATE: '' }, { a: color, b: color, c: color, rough: 0.3, cc: 1, ccRough: 0.04 }));
  }

  dispose() {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
    if (this.noise) this.noise.value.dispose();
    this.noise = null;
  }
}
