// The far landscape: mountain ranges, headlands, wooded hills, seen crisply
// under blue aerial haze (the lens leaves the distance sharp, so it has to
// hold up). The terrain's own grid grows coarse with distance (tens of metres
// a cell a kilometre out), which turns mountains into smooth lumps; this mesh
// takes over beyond `from` metres and is laid out the way the eye sees it,
// as a wedge of constant angular resolution (a column every ~0.1 degree, rows
// growing geometrically with distance), so every ridge stays jagged and
// sharp at any range.
//
// The land is painted per pixel, from its slope, height and a few octaves of
// noise that fade with distance: snow (or sand) on gentle ground and high up,
// bare rock with strata on the steep faces, dark forest wherever the stage
// says it is wooded. The sun, the sky and the fog light it like the rest of
// the scene, so faces turned to the low sun glow and the others sink into
// the sky's colour.
import * as THREE from 'three';

const VERT_PARS = `
varying vec3 vWPos;
varying vec3 vWNormal;
varying float vCover;
attribute float aCover;`;

const FRAG_PARS = `
varying vec3 vWPos;
varying vec3 vWNormal;
varying float vCover;
uniform vec3 uTop;
uniform vec3 uRock;
uniform vec3 uRock2;
uniform vec3 uForest;
uniform vec4 uLine;     // x: height where the top material (snow) is complete, y: how gradually, z: slope where rock shows, w: how gradually
uniform vec2 uDetail;   // strength of the lit bump, and of the colour breakup
float flHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float flNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(flHash(i), flHash(i + vec2(1.0, 0.0)), f.x), mix(flHash(i + vec2(0.0, 1.0)), flHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float flRock;
float flForest;
vec2 flP;
float flFade;`;

export class FarLand {
  // height(x, b): metres, b = distance behind the lane (z = -b); cover(x, b, y): 0..1 how wooded;
  // look: { top, rock, rock2, forest (hex), line: [height, spread, rockSlope, rockSoft] }
  constructor({ height, cover, from = 260, to = 2900, halfAngle = 62, columns = 1500, growth = 1.021, sink = 0.6, look = {} }) {
    const L = { top: 0xf1f2ff, rock: 0x4a4342, rock2: 0x7b6a63, forest: 0x1f3d31, line: [150, 60, 0.3, 0.22], detail: [1, 1], ...look };
    const rows = [];
    for (let r = from; r <= to; r *= growth) rows.push(r);
    const nx = columns + 1;
    const nz = rows.length;
    const pos = new Float32Array(nx * nz * 3);
    const cov = new Float32Array(nx * nz);
    const ha = (halfAngle * Math.PI) / 180;
    for (let j = 0; j < nz; j++) {
      const r = rows[j];
      // just under the terrain's last rows, so the two never fight over the seam
      const dip = sink * (1 - THREE.MathUtils.smoothstep(r, from, from + 70));
      for (let i = 0; i < nx; i++) {
        const a = -ha + (2 * ha * i) / columns;
        const x = Math.sin(a) * r;
        const b = Math.cos(a) * r;
        const y = height(x, b);
        const k = j * nx + i;
        pos[k * 3] = x;
        pos[k * 3 + 1] = y - dip;
        pos[k * 3 + 2] = -b;
        cov[k] = cover ? cover(x, b, y) : 0;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let o = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        // (rows run away from the camera: wound to face up)
        if ((i + j) & 1) {
          idx[o++] = a; idx[o++] = b; idx[o++] = c;
          idx[o++] = b; idx[o++] = d; idx[o++] = c;
        } else {
          idx[o++] = a; idx[o++] = b; idx[o++] = d;
          idx[o++] = a; idx[o++] = d; idx[o++] = c;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCover', new THREE.BufferAttribute(cov, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    this.uniforms = {
      uTop: { value: new THREE.Color(L.top) },
      uRock: { value: new THREE.Color(L.rock) },
      uRock2: { value: new THREE.Color(L.rock2) },
      uForest: { value: new THREE.Color(L.forest) },
      uLine: { value: new THREE.Vector4(...L.line) },
      uDetail: { value: new THREE.Vector2(...L.detail) },
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>${VERT_PARS}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = position;\nvWNormal = normal;\nvCover = aCover;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>${FRAG_PARS}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{
  vec3 P = vWPos;
  vec3 N = normalize(vWNormal);
  float slope = 1.0 - N.y;
  float dist = length(vViewPosition);
  // noise that is finer up close and gives way to its average far away, so nothing shimmers
  flFade = 1.0 - smoothstep(500.0, 1700.0, dist);
  float steep = clamp(slope * 2.2, 0.0, 1.0);
  // on cliffs the noise follows the face (up and along), on flat ground it lies on the map
  flP = mix(P.xz, vec2(P.x * 0.7 + P.z * 0.7, P.y * 1.7), steep);
  float n1 = flNoise(flP * 0.012);
  float n2 = flNoise(flP * 0.05 + 3.0);
  float n3 = mix(0.5, flNoise(flP * 0.19 + 7.0), flFade);
  float n4 = mix(0.5, flNoise(flP * 0.62 + 11.0), flFade * flFade);
  float strata = 0.5 + 0.5 * sin(P.y * 0.3 + n1 * 9.0 + n2 * 2.5);
  // steep faces show rock, in ragged patches; gentle ground and high ground keep the top material
  flRock = smoothstep(uLine.z, uLine.z + uLine.w, slope + (n2 - 0.5) * 0.22 * uDetail.y + (n3 - 0.5) * 0.14 * uDetail.y + (strata - 0.5) * 0.05);
  vec3 col = uTop * (0.95 + 0.1 * (n3 - 0.5) * uDetail.y + 0.06 * (n2 - 0.5));
  vec3 rockCol = mix(uRock, uRock2, clamp(strata * 0.55 + n2 * 0.5, 0.0, 1.0)) * (0.7 + 0.55 * n3 + 0.2 * n4);
  col = mix(col, rockCol, flRock);
  flForest = smoothstep(0.42, 0.62, vCover + (n2 - 0.5) * 0.4 + (n3 - 0.5) * 0.16) * (1.0 - flRock * 0.85);
  vec3 forestCol = uForest * (0.5 + 0.9 * n3 + 0.3 * n4) * (0.8 + 0.4 * n2);
  col = mix(col, forestCol, flForest);
  diffuseColor.rgb *= col;
}`,
        )
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.55, 0.95, max(flRock, flForest));')
        .replace(
          '#include <normal_fragment_maps>',
          `{
  // ridges, gullies and strata: the world normal leans by the gradient of a couple of octaves of noise
  vec2 g = vec2(flNoise(flP * 0.09 + vec2(0.06, 0.0)) - flNoise(flP * 0.09 - vec2(0.06, 0.0)), flNoise(flP * 0.09 + vec2(0.0, 0.06)) - flNoise(flP * 0.09 - vec2(0.0, 0.06)));
  vec2 g2 = vec2(flNoise(flP * 0.35 + vec2(0.06, 0.0)) - flNoise(flP * 0.35 - vec2(0.06, 0.0)), flNoise(flP * 0.35 + vec2(0.0, 0.06)) - flNoise(flP * 0.35 - vec2(0.0, 0.06)));
  float k = uDetail.x * (0.35 + 1.1 * flRock + 0.3 * flForest);
  vec3 wn = normalize(normalize(vWNormal) + vec3(g.x + g2.x * flFade, 0.0, g.y + g2.y * flFade) * k * 0.9);
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`,
        );
    };
    mat.customProgramCacheKey = () => 'farland';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'farland';
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    this.from = from;
  }

  // Stop the terrain drawing beyond `b` metres behind the lane: the rows of its grid that are
  // farther away are simply left out of the draw (its geometry is untouched).
  static trimTerrain(terrain, b) {
    const geo = terrain.mesh.geometry;
    const p = geo.attributes.position;
    // row 0 is the farthest; every vertex of a row has the same z
    const z0 = p.getZ(0);
    let nx = 1;
    while (nx < p.count && p.getZ(nx) === z0) nx++;
    const nz = p.count / nx;
    let j0 = 0;
    while (j0 < nz - 1 && -p.getZ(j0 * nx) > b) j0++;
    const start = j0 * (nx - 1) * 6;
    geo.setDrawRange(start, (nz - 1 - j0) * (nx - 1) * 6 );
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
