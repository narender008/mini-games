// The sea: turquoise water from the shore out to the horizon, with a swell of
// long low waves, a line of surf rolling in and a lace of foam along the
// waterline. One big flat sheet at the water level (the terrain dips under it,
// so the shore is wherever the sand meets it) and everything else is done in
// the fragment shader from the world position, so it costs almost nothing:
//  * colour: pale sandy turquoise in the shallows, deeper blue-green farther
//    out, darker towards the horizon;
//  * waves: a few wave trains bend the normal, so the sky and the sun glitter
//    in it; they fade with distance so they never shimmer;
//  * surf: three foam lines roll shorewards one after another, breaking into
//    streaks, and a soft foamy edge pulses up and down the sand.
// shoreZ(x) is where the waterline lies at each x; the beach's height
// function uses the same curve, so foam and sand always agree.
import * as THREE from 'three';

// the waterline: z of the water's edge along the beach (a gently wavy line)
export function shoreZ(x, base = -9) {
  return base - 0.9 * Math.sin(x * 0.31 + 1.3) - 0.5 * Math.sin(x * 0.83 + 0.4) - 0.22 * Math.sin(x * 2.1 + 2.0);
}

const SHORE_GLSL = /* glsl */ `
float seaShore(float x) {
  return uShoreBase - 0.9 * sin(x * 0.31 + 1.3) - 0.5 * sin(x * 0.83 + 0.4) - 0.22 * sin(x * 2.1 + 2.0);
}`;

export class Sea {
  // y: water level; shoreBase: mean z of the waterline; the sheet reaches from just
  // behind the waterline out to `reach` metres
  constructor({ y, shoreBase = -9, reach = 3000, shallow = 0x3fd3c4, deep = 0x0a68a0, far = 0x1b78b0, foam = 0xffffff, wetSand = 0xa88a5c, ripple = 1 }) {
    const geo = new THREE.PlaneGeometry(reach * 2, reach, 1, 1);
    geo.rotateX(-Math.PI / 2);
    // starts 6 m in front of the waterline (under the sand) and runs out to the horizon
    const z0 = shoreBase + 6;
    geo.translate(0, y, z0 - reach / 2);
    this.uniforms = {
      uTime: { value: 0 },
      uRipple: { value: ripple },
      uShoreBase: { value: shoreBase },
      uShallow: { value: new THREE.Color(shallow) },
      uDeep: { value: new THREE.Color(deep) },
      uFar: { value: new THREE.Color(far) },
      uFoam: { value: new THREE.Color(foam) },
      uWetSand: { value: new THREE.Color(wetSand) },
    };
    // the sea's own colour is seen through the surface, and the sky only glazes it: a modest specular keeps the water blue at grazing angles
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, ior: 1.33, specularIntensity: 0.42, envMapIntensity: 0.65 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vWaterPos;
uniform float uTime;
uniform float uRipple;
uniform float uShoreBase;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFar;
uniform vec3 uFoam;
uniform vec3 uWetSand;
${SHORE_GLSL}
float swHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float swNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(swHash(i), swHash(i + vec2(1, 0)), u.x), mix(swHash(i + vec2(0, 1)), swHash(i + vec2(1, 1)), u.x), u.y);
}
// slope of the water: a long swell rolling in, with shorter, choppier trains on it
vec2 swGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float a = -1.5708 + (fi - 2.5) * 0.42 + sin(fi * 5.1) * 0.2;
    vec2 d = vec2(cos(a), sin(a));
    float k = 0.55 * pow(1.62, fi);
    float amp = 0.05 / pow(k, 0.85);
    float ph = dot(d, p) * k + t * sqrt(9.8 * k) * 0.55 + fi * 1.7;
    // a wave train finer than a pixel would only shimmer: fade it out
    amp *= 1.0 - smoothstep(0.5, 2.2, fwidth(ph));
    g += d * cos(ph) * amp * k;
  }
  return g;
}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
float swDist = length(vViewPosition);
vec2 swP = vWaterPos.xz;
// metres out to sea from the waterline (negative on the sand side)
float swOut = seaShore(swP.x) - swP.y;
float swT = uTime;
// colour: shallows, then the deep, then the far haze
float swShal = exp(-max(swOut, 0.0) / 7.0);
vec3 swCol = mix(uDeep, uShallow, swShal * 0.85);
swCol = mix(swCol, uFar, smoothstep(30.0, 500.0, swDist));
// over the last metre of water, the sand shows through
swCol = mix(uWetSand, swCol, smoothstep(0.0, 1.6, swOut + 0.35 * swNoise(swP * 3.0)));
// foam: three lines of surf roll in, each one ragged: it arrives earlier in some places than others,
// swells and thins along its length, breaks into gaps that widen as the wave dies, and fades out.
// (Seen from a low camera the sea is squeezed into a few pixels of depth but stays sharp along x, so
// the irregularity has to run along x; the fine streaks across the line only show where they resolve.)
float swFoam = 0.0;
float swAA = 1.0 - smoothstep(0.35, 1.0, fwidth(swOut) * 2.6);
float swAX = 1.0 - smoothstep(0.03, 0.2, fwidth(swP.x));
for (int i = 0; i < 3; i++) {
  float fi = float(i);
  float lag = 0.16 * (swNoise(vec2(swP.x * 0.2 + fi * 7.3, fi * 1.9)) - 0.5);
  float ph = fract(swT * 0.075 + fi / 3.0 + lag + 0.09 * sin(swP.x * 0.07 + fi * 2.0));
  float crest = mix(13.0, 0.5, ph) + 0.7 * (swNoise(vec2(swP.x * 0.45 + fi * 3.1, 4.0 + fi)) - 0.5);
  // thicker in places, thin in others
  float wv = 0.4 + 1.1 * swNoise(vec2(swP.x * 0.75 + fi * 4.1, 1.7 + fi));
  float w = (0.3 + 1.0 * (1.0 - ph)) * wv;
  float band = exp(-pow((swOut - crest) / w, 2.0));
  // the wash behind the crest, towards the shore
  float wash = smoothstep(crest - 1.6, crest, swOut) * (1.0 - smoothstep(crest, crest + 0.25, swOut)) * 0.5 * (0.5 + wv * 0.5);
  // gaps along the line, at three scales; more of them as the wave ages
  float br = swNoise(vec2(swP.x * 0.9 + fi * 13.7, fi * 2.3)) * 0.5 + swNoise(vec2(swP.x * 3.3 + fi * 5.3, 9.0 + fi)) * 0.3 + swNoise(vec2(swP.x * 10.0 + fi * 2.1, 3.0 + fi)) * 0.2;
  br = mix(0.5, br, swAX);
  float gate = smoothstep(mix(0.34, 0.62, ph), mix(0.34, 0.62, ph) + 0.12, br + 0.1 * band);
  // fine streaks across the line (only where they can be seen)
  float st = swNoise(vec2(swP.x * 3.1 + fi * 5.3, swOut * 7.0)) * 0.6 + swNoise(vec2(swP.x * 0.9 + fi * 13.7, swOut * 2.6)) * 0.4;
  st = mix(0.62, st, swAA);
  float life = smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.7, 1.0, ph));
  swFoam += (band + wash) * gate * smoothstep(0.25, 0.65, st + 0.2 * band) * life;
}
// the swash: a lacy edge that pulses up and down the sand
float swPulse = 0.5 + 0.5 * sin(swT * 0.9 + swP.x * 0.35);
float swLace = swNoise(vec2(swP.x * 4.0, swT * 0.25 + swOut * 2.0));
float swEdge = smoothstep(0.35 + 0.5 * swPulse + 0.35 * swLace, 0.0, swOut);
float swBreak = swNoise(vec2(swP.x * 1.7, swT * 0.12)) * 0.6 + swNoise(vec2(swP.x * 6.0, swT * 0.2 + 3.0)) * 0.4;
swFoam += swEdge * (0.55 + 0.45 * swLace) * smoothstep(0.28, 0.6, mix(0.5, swBreak, swAX));
// far away, small white caps streak the swell
float swCapAA = 1.0 - smoothstep(0.3, 0.9, fwidth(swP.y) * 0.9);
float swCaps = smoothstep(0.66, 0.92, swNoise(vec2(swP.x * 0.16, swP.y * 0.9 + swT * 0.2)) * 0.6 + swNoise(vec2(swP.x * 0.5, swP.y * 0.9 + swT * 0.3)) * 0.4);
swFoam += swCaps * swCapAA * smoothstep(12.0, 50.0, swDist) * (1.0 - smoothstep(250.0, 900.0, swDist)) * 0.45;
swFoam = clamp(swFoam, 0.0, 1.0);
diffuseColor.rgb = mix(swCol, uFoam * 0.97, swFoam);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = mix(roughness, 0.85, swFoam);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
// light scattered back out of the water: keeps the colour rich in any light
totalEmissiveRadiance += swCol * (1.0 - swFoam) * 0.3;`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `{
  // ripples fade with distance so they never shimmer
  float fade = uRipple / (1.0 + swDist * 0.05);
  vec2 g = swGrad(swP, swT) * fade;
  // foam is flat and matte
  g *= 1.0 - 0.7 * swFoam;
  vec3 wn = normalize(vec3(-g.x, 1.0, -g.y));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`,
        );
    };
    mat.customProgramCacheKey = () => 'sea';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sea';
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
