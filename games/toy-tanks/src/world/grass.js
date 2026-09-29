// Grass: tens of thousands of real-sized blades (two to five centimetres, a
// couple of millimetres wide) in little clumps around the lane, so the toy
// tanks sit in a real lawn. One instanced mesh; each blade is bent, swayed
// by the wind (gusts roll along the lane), pushed flat by a blast's
// shockwave, laid down or dug away where craters are, parted under the
// tanks, and follows the crater map's height so it never floats over a hole.
// Beyond the blades, the ground texture carries on.
import * as THREE from 'three';
import { CRATER_GLSL } from '../terrain.js';
import { rng } from '../config.js';

const SEGMENTS = 4;

function bladeGeometry() {
  // a strip up the blade: y = 0..1 along it, x = -0.5..0.5 across
  const pos = [];
  const idx = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const w = i === SEGMENTS ? 0 : 1 - t * t * 0.7;
    pos.push(-0.5 * w, t, 0, 0.5 * w, t, 0);
    if (i < SEGMENTS) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Grass {
  // spec: { density, height: [min, max], color: [root, tip], area: [x0, x1, z0, z1] }
  constructor({ terrain, quality, spec, seed = 7, keepOut = null }) {
    this.terrain = terrain;
    const R = rng(seed);
    const k = (spec.density ?? 1) * quality.grass;
    const count = Math.round(85000 * k);
    const [x0, x1, z0, z1] = spec.area ?? [-2.9, 2.9, -1.4, 1.1];
    const [hMin, hMax] = spec.height ?? [0.018, 0.05];
    const root = new Float32Array(count * 4);
    const shape = new Float32Array(count * 4);
    let n = 0;
    let guard = 0;
    while (n < count && guard++ < count * 4) {
      // clumps: a centre, then a few blades around it
      const cx = x0 + R() * (x1 - x0);
      const cz = z0 + R() * (z1 - z0);
      // most blades near the lane, where the camera is focused
      const dz = Math.abs(cz);
      const keep = dz < 0.55 ? 1 : dz < 1.1 ? 0.6 : 0.35;
      if (R() > keep) continue;
      // fade out towards the edge of the patch, into the ground's texture
      const edge = Math.min((cx - x0) / 0.5, (x1 - cx) / 0.5, (cz - z0) / 0.5, (z1 - cz) / 0.35, 1);
      if (R() > edge) continue;
      if (keepOut && keepOut(cx, cz)) continue;
      const blades = 5 + Math.floor(R() * 8);
      const tall = (hMin + (hMax - hMin) * Math.pow(R(), 1.6)) * (0.45 + 0.55 * Math.min(1, edge * 1.5));
      for (let b = 0; b < blades && n < count; b++) {
        const a = R() * Math.PI * 2;
        const r = Math.sqrt(R()) * 0.016;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        root[n * 4] = x;
        root[n * 4 + 1] = terrain.baseAt(x, z);
        root[n * 4 + 2] = z;
        root[n * 4 + 3] = R() * Math.PI * 2;
        shape[n * 4] = tall * (0.65 + R() * 0.5);
        shape[n * 4 + 1] = 0.0016 + R() * 0.0018;
        // lean: outwards from the clump's centre, more for longer blades
        shape[n * 4 + 2] = 0.25 + R() * 0.75;
        shape[n * 4 + 3] = R();
        n++;
      }
    }
    const blade = bladeGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = blade.index;
    geo.setAttribute('position', blade.getAttribute('position'));
    geo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(root.subarray(0, n * 4), 4));
    geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape.subarray(0, n * 4), 4));
    geo.instanceCount = n;
    this.count = n;
    const c0 = new THREE.Color(spec.color?.[0] ?? 0x3f6a1c);
    const c1 = new THREE.Color(spec.color?.[1] ?? 0x86b23a);
    const dry = new THREE.Color(spec.dry ?? 0xb8a655);
    this.uniforms = {
      ...terrain.uniforms,
      uTime: { value: 0 },
      uWind: { value: 0 },
      uRootColor: { value: c0 },
      uTipColor: { value: c1 },
      uDryColor: { value: dry },
      uTanks: { value: [new THREE.Vector4(99, 0, 0.08, 0.06), new THREE.Vector4(99, 0, 0.08, 0.06)] },
      uShock: { value: new THREE.Vector4(0, 0, -99, 0) },
    };
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
${CRATER_GLSL}
attribute vec4 aRoot;
attribute vec4 aShape;
uniform float uTime;
uniform float uWind;
uniform vec3 uRootColor;
uniform vec3 uTipColor;
uniform vec3 uDryColor;
uniform vec4 uTanks[2];
uniform vec4 uShock;
varying vec3 vBladeColor;
varying float vT;`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `vec3 objectNormal = vec3(0.0, 1.0, 0.0);`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec2 xz = aRoot.xz;
vec4 dm = texture2D(tDeform, deformUv(xz));
float t = position.y;
float h = aShape.x;
// dug-up ground has no grass; parted under the tanks
float gone = smoothstep(0.35, 0.7, dm.g);
for (int i = 0; i < 2; i++) {
  vec2 d = abs(xz - uTanks[i].xy) - uTanks[i].zw;
  gone = max(gone, 1.0 - smoothstep(-0.004, 0.01, max(d.x, d.y)));
}
h *= 1.0 - gone;
// lean: its own, flattened by blasts, and the wind (gusts roll along x)
float yaw = aRoot.w;
vec2 dir = vec2(cos(yaw), sin(yaw));
float lean = aShape.z * (1.0 + dm.a * 2.2);
float gust = sin(uTime * 1.3 + xz.x * 2.1 + xz.y * 0.7) * 0.5 + 0.5;
float sway = uWind * (0.6 + 0.8 * gust) + sin(uTime * 2.7 + aShape.w * 20.0) * 0.08;
vec2 push = dir * lean + vec2(sway * 1.4, 0.0);
// the shockwave: a ring racing outwards that throws blades flat for a moment
float st = uTime - uShock.z;
if (st > 0.0 && st < 1.2) {
  vec2 away = xz - uShock.xy;
  float dist = length(away);
  float ring = exp(-pow((dist - st * 0.9) / 0.05, 2.0)) * uShock.w * (1.0 - st / 1.2);
  push += normalize(away + 1e-5) * ring * 2.5;
}
float bend = length(push);
vec2 bdir = bend > 1e-4 ? push / bend : dir;
bend = min(bend, 1.4);
// a curved blade: angle grows along it
float ang = bend * t * 1.1;
float along = sin(ang) / max(bend * 1.1, 1e-3);
float up = (1.0 - cos(ang)) / max(bend * 1.1, 1e-3);
float lenT = t;
vec3 side = vec3(-dir.y, 0.0, dir.x);
vec3 transformed = vec3(xz.x, aRoot.y + deformHeight(xz), xz.y);
vec3 bent = vec3(bdir.x * up, bend < 1e-3 ? lenT : along, bdir.y * up);
transformed += bent * h + side * position.x * aShape.y * (1.0 - gone);
// a normal that is mostly up, like a lawn seen from afar, tilted with the blade
objectNormal = normalize(vec3(bdir.x * 0.35, 1.0, bdir.y * 0.35) + side * position.x * 0.8);
vT = t;
float v = aShape.w;
vBladeColor = mix(uRootColor, uTipColor, t * (0.7 + 0.5 * v));
vBladeColor = mix(vBladeColor, uDryColor, step(0.86, v) * t * 0.7);
vBladeColor *= 0.8 + 0.4 * fract(v * 7.31);`,
        )
        .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vBladeColor;
varying float vT;`,
        )
        .replace(
          '#include <map_fragment>',
          `diffuseColor.rgb *= vBladeColor;`,
        )
        .replace(
          '#include <aomap_fragment>',
          `#include <aomap_fragment>
// deep in the lawn it is darker; light shines through the tips
float occ = mix(0.35, 1.0, smoothstep(0.0, 0.9, vT));
reflectedLight.indirectDiffuse *= occ;
reflectedLight.directDiffuse *= mix(0.55, 1.0, vT);
totalEmissiveRadiance += vBladeColor * vT * vT * 0.06;`,
        );
    };
    mat.customProgramCacheKey = () => 'grass';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'grass';
  }

  // tanks: [{x, facing}] (parts the grass under them)
  update(dt, time, world, tanks) {
    const U = this.uniforms;
    U.uTime.value = time;
    U.uWind.value += ((world.wind ?? 0) * 1.4 - U.uWind.value) * Math.min(1, dt * 2);
    if (tanks) {
      for (let i = 0; i < 2; i++) {
        const t = tanks[i];
        if (t) U.uTanks.value[i].set(t.object.visible ? t.object.position.x : 99, t.object.position.z, t.dims.length * 0.47, t.dims.width * 0.45);
      }
    }
  }

  shockwave(x, z, strength, time) {
    this.uniforms.uShock.value.set(x, z, time, strength);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
