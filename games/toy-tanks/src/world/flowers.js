// Wild flowers: daisies, buttercups and little pink and violet cups, real
// sized (a couple of centimetres across) on thin stems among the grass,
// thickest in front of the camera and around the knolls. Instanced: one
// mesh for all the stems and one per kind of flower head. They nod in the
// wind, and a crater digs them away like the grass.
import * as THREE from 'three';
import { mergeGeometries } from 'three-gltf/utils/BufferGeometryUtils.js';
import { CRATER_GLSL } from '../terrain.js';
import { BLAST_GLSL, blastUniforms } from './react.js';
import { rng } from '../config.js';

// a flower head, radius 1, facing up (+y), centred on the origin.
// Petals are real geometry (no cut-out textures), so they stay crisp.
function headGeometry({ petals = 5, len = 1, width = 0.5, cup = 0.3, droop = 0, centre = 0.25, centreColor = 0xf2c230, layers = 1 }) {
  const pos = [];
  const col = [];
  const tint = []; // 1 on petals (take the flower's own colour), 0 elsewhere
  const idx = [];
  const cc = new THREE.Color(centreColor);
  const SEG = 4;
  // layers: rings of petals, the inner ones shorter, more cupped and stood higher (zinnias, dahlias)
  for (let layer = 0; layer < layers; layer++) {
    const lk = 1 - 0.5 * (layer / layers);
    const lift = layer * 0.14 * (cup + 0.2);
    const cupL = cup * (1 + layer * 0.5);
    for (let p = 0; p < petals; p++) {
      const a = (p / petals) * Math.PI * 2 + (p % 2) * 0.08 + layer * (Math.PI / petals);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const base = pos.length / 3;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        const r = centre * 0.6 + t * len * lk * (1 - centre * 0.6);
        // cupped up near the centre, drooping at the tip
        const y = Math.sin(t * Math.PI * 0.5) * cupL - t * t * droop * (1 - 0.5 * (layer / layers)) + lift;
        const w = (i === SEG ? 0.15 : Math.sin(Math.min(1, t * 1.2 + 0.15) * Math.PI) * 0.5 + 0.05) * width * (Math.PI * 2 * r / petals) * 0.9;
        for (const s of [-1, 1]) {
          pos.push(ca * r - sa * w * s, y + (s > 0 ? 0.002 : 0), sa * r + ca * w * s);
          // petals are paler at the base, like real ones (and darker deeper in the bloom)
          const k = (0.82 + 0.18 * t) * (1 - 0.1 * layer / layers);
          col.push(k, k, k);
          tint.push(1);
        }
        if (i < SEG) {
          const v = base + i * 2;
          idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        }
      }
    }
  }
  // the centre: a little dome
  const dome = new THREE.SphereGeometry(centre, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const dp = dome.attributes.position;
  const base = pos.length / 3;
  for (let i = 0; i < dp.count; i++) {
    pos.push(dp.getX(i), dp.getY(i) * 0.6 + cup * 0.25 + (layers - 1) * 0.1, dp.getZ(i));
    col.push(cc.r, cc.g, cc.b);
    tint.push(0);
  }
  for (let i = 0; i < dome.index.count; i++) idx.push(base + dome.index.getX(i));
  dome.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a stem, 1 tall, bending a little, with a leaf near the bottom
function stemGeometry() {
  const pos = [];
  const idx = [];
  const SEG = 5;
  const SIDES = 4;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const r = 0.5 * (1 - t * 0.35);
    const bx = Math.sin(t * 1.4) * 0.06;
    for (let s = 0; s < SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2;
      pos.push(bx + Math.cos(a) * r, t, Math.sin(a) * r);
    }
    if (i < SEG) {
      for (let s = 0; s < SIDES; s++) {
        const a = i * SIDES + s;
        const b = i * SIDES + ((s + 1) % SIDES);
        idx.push(a, b, a + SIDES, b, b + SIDES, a + SIDES);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a globe of little florets (allium, hydrangea, agapanthus): a ball of small
// open flowers, each facing outwards; radius 1, centred on the origin
function globeGeometry({ florets = 30, floret = 0.26, spread = 0.9 }) {
  const R = rng(97);
  const parts = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3();
  for (let i = 0; i < florets; i++) {
    // Fibonacci spiral over the sphere, the underside left out
    const f = (i + 0.5) / florets;
    const y = 1 - f * (1 + spread);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.39996;
    n.set(Math.cos(a) * r, y, Math.sin(a) * r).normalize();
    q.setFromUnitVectors(up, n);
    const g = headGeometry({ petals: 5, len: 1, width: 0.85, cup: 0.35, droop: 0.05, centre: 0.2, centreColor: 0xf7e9a0 });
    const s = floret * (0.85 + R() * 0.3);
    m.compose(n.clone().multiplyScalar(0.8), q, new THREE.Vector3(s, s, s));
    g.applyMatrix4(m);
    parts.push(g);
  }
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
}

export const FLOWER_KINDS = {
  daisy: { petals: 14, len: 1, width: 0.55, cup: 0.12, droop: 0.08, centre: 0.3, centreColor: 0xf5b82a, rough: 0.55 },
  buttercup: { petals: 5, len: 1, width: 1.05, cup: 0.42, droop: 0, centre: 0.24, centreColor: 0xd9a820, rough: 0.22 },
  cup: { petals: 6, len: 1, width: 0.9, cup: 0.55, droop: -0.05, centre: 0.18, centreColor: 0xfff1b0, rough: 0.5 },
  star: { petals: 5, len: 1, width: 0.7, cup: 0.1, droop: 0.1, centre: 0.2, centreColor: 0xffe066, rough: 0.5 },
  // a three-leaved clover head, low in the grass
  clover: { petals: 3, len: 1, width: 1.7, cup: 0.12, droop: 0.12, centre: 0.06, centreColor: 0x3d7424, rough: 0.6 },
  // big garden blooms: a layered zinnia or dahlia, a lily, and a globe of florets
  zinnia: { petals: 11, len: 1, width: 1.05, cup: 0.25, droop: 0.16, centre: 0.2, centreColor: 0xd9a020, rough: 0.4, layers: 3 },
  lily: { petals: 6, len: 1, width: 0.75, cup: 0.85, droop: 0.25, centre: 0.1, centreColor: 0xffe08a, rough: 0.4 },
  globe: { globe: true, florets: 30, rough: 0.45 },
};

// spec: { count, area: [x0, x1, z0, z1], mix: [{ kind, colors: [hex...], weight, size: [r0, r1], height: [h0, h1] }],
//         near(x, z) -> 0..1 extra density (e.g. around the knolls), density(x, z) -> 0..1 (replaces the default), keepOut(x, z) }
export class Flowers {
  constructor({ terrain, quality, spec, seed = 11 }) {
    const R = rng(seed);
    const total = Math.round((spec.count ?? 1400) * quality.grass);
    const [x0, x1, z0, z1] = spec.area ?? [-2.4, 2.4, -2.5, 1.1];
    const mix = spec.mix;
    const wsum = mix.reduce((s, m) => s + m.weight, 0);
    // pick every flower's spot first: clusters, denser in front and near knolls
    const spots = mix.map(() => []);
    let guard = 0;
    let n = 0;
    while (n < total && guard++ < total * 30) {
      const cx = x0 + R() * (x1 - x0);
      const cz = z0 + R() * (z1 - z0);
      const front = cz > 0.1 ? 1 : cz > -0.6 ? 0.35 : 0.2;
      const d = spec.density ? spec.density(cx, cz) : Math.min(1, front + (spec.near ? spec.near(cx, cz) : 0));
      if (R() > d) continue;
      if (spec.keepOut && spec.keepOut(cx, cz)) continue;
      let w = R() * wsum;
      let k = 0;
      while (k < mix.length - 1 && (w -= mix[k].weight) > 0) k++;
      const m = mix[k];
      const color = m.colors[Math.floor(R() * m.colors.length)];
      // a patch of the same flower
      const many = 2 + Math.floor(R() * 6);
      for (let i = 0; i < many && n < total; i++) {
        const a = R() * Math.PI * 2;
        const r = Math.sqrt(R()) * 0.05;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        if (spec.keepOut && spec.keepOut(x, z)) continue;
        spots[k].push({ x, z, color, m, r: R(), s: R(), a: R() });
        n++;
      }
    }
    this.uniforms = { ...terrain.uniforms, ...blastUniforms, uTime: { value: 0 }, uWind: { value: 0 } };
    this.meshes = [];
    const stemMat = this.material({ color: 0x5c8a2e, roughness: 0.6 }, 'flower-stem', false);
    const stem = new THREE.InstancedMesh(stemGeometry(), stemMat, n);
    stem.name = 'flower-stems';
    const heads = mix.map((m, k) => {
      const kind = FLOWER_KINDS[m.kind];
      const mesh = new THREE.InstancedMesh(kind.globe ? globeGeometry(kind) : headGeometry(kind), this.material({ roughness: kind.rough, side: THREE.DoubleSide, vertexColors: true }, 'flower-head', true), Math.max(1, spots[k].length));
      mesh.name = `flowers-${m.kind}`;
      mesh.count = spots[k].length;
      // how high the head sits on its stem, so it swings with the stem
      mesh.geometry.setAttribute('aLift', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, spots[k].length)), 1));
      return mesh;
    });
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const c = new THREE.Color();
    let si = 0;
    spots.forEach((list, k) => {
      list.forEach((f, i) => {
        const [h0, h1] = f.m.height ?? [0.03, 0.08];
        const [r0, r1] = f.m.size ?? [0.007, 0.012];
        const h = h0 + (h1 - h0) * f.r;
        const rad = r0 + (r1 - r0) * f.s;
        const y = terrain.baseAt(f.x, f.z);
        const yaw = f.a * Math.PI * 2;
        // stem: leans a little, head sits on its tip
        const lean = 0.12 + f.s * 0.18;
        e.set(0, yaw, lean);
        q.setFromEuler(e);
        m4.compose(p.set(f.x, y - 0.004, f.z), q, sc.set(0.0026 + rad * 0.08, h, 0.0026 + rad * 0.08));
        stem.setMatrixAt(si++, m4);
        const tip = p.set(0, 1, 0).applyQuaternion(q).multiplyScalar(h).add(sc.set(f.x, y - 0.004, f.z));
        // heads face up and a little towards the camera and the sun
        e.set(-0.25 - f.r * 0.35 - (f.m.tilt ?? 0), yaw * 0.2, (f.s - 0.5) * 0.5);
        q.setFromEuler(e);
        m4.compose(tip, q, sc.set(rad, rad, rad));
        heads[k].setMatrixAt(i, m4);
        heads[k].geometry.attributes.aLift.array[i] = tip.y - (y - 0.004);
        heads[k].setColorAt(i, c.set(f.color).multiplyScalar(0.92 + f.r * 0.16));
      });
    });
    stem.count = si;
    for (const m of [stem, ...heads]) {
      m.frustumCulled = false;
      m.receiveShadow = true;
      m.castShadow = false;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.meshes.push(m);
    }
    this.group = new THREE.Group();
    this.group.add(...this.meshes);
    this.count = si;
  }

  material(params, key, head) {
    const mat = new THREE.MeshStandardMaterial({ metalness: 0, ...params });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
${CRATER_GLSL}
${BLAST_GLSL}
uniform float uTime;
uniform float uWind;
${head ? 'attribute float aTint;\nattribute float aLift;' : ''}`,
        )
        .replace(
          '#include <color_vertex>',
          head
            ? `vColor = vec4(1.0);
#ifdef USE_COLOR
vColor.rgb *= color.rgb;
#endif
#ifdef USE_INSTANCING_COLOR
vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, aTint);
#endif`
            : '#include <color_vertex>',
        )
        .replace(
          '#include <project_vertex>',
          `vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
{
  vec3 root = instanceMatrix[3].xyz;
  vec4 dm = texture2D(tDeform, deformUv(root.xz));
  float gone = smoothstep(0.35, 0.7, dm.g);
  // nod in the wind: the higher up, the more it moves
  float lift = max(mvPosition.y - root.y, 0.0)${head ? ' + aLift' : ''};
  float up = lift / 0.08;
  float sway = (uWind * 0.6 + sin(uTime * 2.3 + root.x * 17.0 + root.z * 11.0) * 0.12) * up * up * 0.012;
  mvPosition.x += sway;
  mvPosition.z += sin(uTime * 1.9 + root.x * 23.0) * up * up * 0.0015;
  // knocked flat by a burst nearby and swinging back upright
  vec2 kick = blastSway(root.xz, uTime, 2.4, 1.7) * lift * min(up, 1.4) * 0.4;
  mvPosition.xz += kick;
  mvPosition.y -= dot(kick, kick) * 6.0;
  mvPosition.xyz = root + (mvPosition.xyz - root) * (1.0 - gone);
  mvPosition.y += deformHeight(root.xz);
}
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
        );
      if (head) {
        // thin petals glow a little when the sun is behind them
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * 0.06;`,
        );
      }
    };
    mat.customProgramCacheKey = () => key;
    return mat;
  }

  update(dt, time, world) {
    const U = this.uniforms;
    U.uTime.value = time;
    U.uWind.value += ((world.wind ?? 0) - U.uWind.value) * Math.min(1, dt * 2);
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.material.dispose();
      m.dispose?.();
    }
  }
}
