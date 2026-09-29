// The toy tanks: the roster, the model loader and TankView, one tank in the scene.
//
// The models are glossy plastic toys built in Blender (games/toy-tanks/blender/) and exported as compressed GLB.
// Node contract: tank > hull > (turret > barrel > muzzle, wheel_L0.., wheel_R0.., track_L, track_R). The `paint` material
// is the body colour and is tinted here; rubber, hub, star and metal are fixed. Facing +x, +y up, tracks' bottom at y = 0.
//
// TankView adds everything that makes the toy feel alive: springy recoil, jelly wobbles, driving (wheels spin and the
// tread really travels round the track), a happy hop, and splats (confetti, mud, snow, paint) that stick to the plastic
// and fade after a while. Splats and the orange-peel of the lacquer are shader patches (onBeforeCompile) on the materials.
import * as THREE from 'three';
import { GLTFLoader } from 'three-gltf/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three-gltf/libs/meshopt_decoder.module.js';

// chooser order: id, model, default colour (sRGB hex), stars needed to unlock
export const TANKS = [
  { id: 'buddy', model: 'classic', color: 0x1fb3b0, stars: 0 }, // teal
  { id: 'sunny', model: 'classic', color: 0xffc21f, stars: 0 }, // yellow
  { id: 'rosie', model: 'chunky', color: 0xe8392f, stars: 0 }, // red
  { id: 'pip', model: 'mini', color: 0x7ccf2e, stars: 3 }, // lime
  { id: 'blue', model: 'dome', color: 0x2f7fe0, stars: 6 }, // blue
  { id: 'plum', model: 'twin', color: 0x8a4fd6, stars: 10 }, // purple
  { id: 'zip', model: 'long', color: 0xff8a1f, stars: 15 }, // orange
  { id: 'mint', model: 'dome', color: 0x39c47a, stars: 20 }, // green
];

const MODEL_URL = (model) => new URL(`../assets/models/tank-${model}.glb`, import.meta.url).href;
// the rim of sky light round a glossy toy seen into the light: a Fresnel glow
// on the tanks alone (a real back light would also wash over the hills)
export const TANK_RIM = { value: new THREE.Color(0, 0, 0) };
const MAX_SPLATS = 8;
const SPLAT_LIFE = 12; // seconds until a splat has faded away
const SPLAT_KINDS = { confetti: 0, star: 1, mud: 2, snow: 3, jelly: 4, paint: 5 };
const SPLAT_DEFAULT = { confetti: 0xffffff, star: 0xffd23f, mud: 0x5a3b22, snow: 0xf2f6ff, jelly: 0xff4fa3, paint: 0x3fa9ff };
const TRACK_TABLE = 384; // samples of the track's centre line (position and tangent) the shader walks along

// ----------------------------------------------------------------------------------------------- loading

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

export async function loadTankModel(model) {
  let p = cache.get(model);
  if (!p) {
    p = loader.loadAsync(MODEL_URL(model)).then((gltf) => buildTemplate(model, gltf));
    p.catch(() => cache.delete(model)); // let a later call try again
    cache.set(model, p);
  }
  return p;
}

function nameOf(root, name) {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`tank model is missing the node "${name}"`);
  return o;
}

// The template holds the parsed model, plus everything worked out once: the wheels and their radii, the track tables,
// the size facts. Views clone it (geometry is shared, materials are per view).
function buildTemplate(model, gltf) {
  const root = nameOf(gltf.scene, 'tank');
  root.removeFromParent();
  root.updateMatrixWorld(true);
  const ud = root.userData || {};
  for (const n of ['hull', 'turret', 'barrel', 'muzzle']) nameOf(root, n);

  const wheels = [];
  const tracks = [];
  root.traverse((o) => {
    if (/^wheel_[LR]\d+$/.test(o.name)) {
      const box = new THREE.Box3().setFromObject(o);
      // the wheel's axle sits at the node origin; the radius is stored by the exporter, or measured as a fallback
      const r = o.userData.radius || Math.max(box.max.y - o.getWorldPosition(new THREE.Vector3()).y, 0.008);
      wheels.push({ name: o.name, r, kind: o.userData.kind || 'road' });
    } else if (/^track_[LR]$/.test(o.name)) {
      tracks.push(o);
    }
  });
  wheels.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  // track: bake the meshes into plain float geometry in the track's own frame, and work out where each vertex sits along the loop
  let trackTable = null;
  let trackLength = 0.3;
  for (const t of tracks) {
    const path = t.userData.path;
    if (!path || path.length < 12) continue;
    trackLength = t.userData.length || trackLength;
    if (!trackTable) trackTable = makeTrackTable(path);
    bakeTrack(t, trackTable);
  }

  const dims = {
    length: ud.dims ? ud.dims[0] : 0.14,
    width: ud.dims ? ud.dims[1] : 0.1,
    height: ud.dims ? ud.dims[2] : 0.078,
    muzzleHeight: ud.muzzleHeight || 0.062,
    contacts: ud.contacts ? [ud.contacts[0], ud.contacts[1]] : [0.034, -0.037],
    muzzleX: ud.muzzleX || 0.065,
  };
  return { model, root, dims, wheels, trackTable, trackLength };
}

// Closed Catmull-Rom curve through the exporter's centre line, sampled evenly. Each texel: x, y, tangent x, tangent y.
function makeTrackTable(path) {
  const m = path.length / 2;
  const P = (i) => {
    const k = ((i % m) + m) % m;
    return [path[k * 2], path[k * 2 + 1]];
  };
  const data = new Float32Array(TRACK_TABLE * 4);
  for (let s = 0; s < TRACK_TABLE; s++) {
    const f = (s / TRACK_TABLE) * m;
    const i = Math.floor(f);
    const u = f - i;
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const u2 = u * u;
    const u3 = u2 * u;
    for (let a = 0; a < 2; a++) {
      data[s * 4 + a] = 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * u + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * u2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * u3);
      data[s * 4 + 2 + a] = 0.5 * (-p0[a] + p2[a] + (4 * p0[a] - 10 * p1[a] + 8 * p2[a] - 2 * p3[a]) * u + (-3 * p0[a] + 9 * p1[a] - 9 * p2[a] + 3 * p3[a]) * u2);
    }
    const l = Math.hypot(data[s * 4 + 2], data[s * 4 + 3]) || 1;
    data[s * 4 + 2] /= l;
    data[s * 4 + 3] /= l;
  }
  const tex = new THREE.DataTexture(data, TRACK_TABLE, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { data, tex };
}

// nearest point of the sampled loop, as a 0..1 position along it
function projectToLoop(x, y, data) {
  let best = 1e9;
  let bs = 0;
  for (let s = 0; s < TRACK_TABLE; s++) {
    const ax = data[s * 4];
    const ay = data[s * 4 + 1];
    const n = (s + 1) % TRACK_TABLE;
    const bx = data[n * 4];
    const by = data[n * 4 + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy || 1e-12;
    let u = ((x - ax) * dx + (y - ay) * dy) / l2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = ax + dx * u - x;
    const ey = ay + dy * u - y;
    const d = ex * ex + ey * ey;
    if (d < best) {
      best = d;
      bs = s + u;
    }
  }
  return bs / TRACK_TABLE;
}

// Turns the track's meshes into float geometry in the track node's frame and gives every vertex `aTrackS`: where it sits along
// the loop. The belt is one continuous piece (each vertex is placed by its own position); each lug and pin is a separate small piece
// and moves as a rigid one (all its vertices share the piece's centre).
function bakeTrack(trackNode, table) {
  trackNode.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(trackNode.matrixWorld).invert();
  const meshes = [];
  trackNode.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  const v = new THREE.Vector3();
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const rel = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const n = pos.count;
    const P = new Float32Array(n * 3);
    const N = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(rel);
      P[i * 3] = v.x;
      P[i * 3 + 1] = v.y;
      P[i * 3 + 2] = v.z;
      v.fromBufferAttribute(nor, i).normalize();
      N[i * 3] = v.x;
      N[i * 3 + 1] = v.y;
      N[i * 3 + 2] = v.z;
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(P, 3));
    ng.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    ng.setIndex(g.index ? new THREE.BufferAttribute(g.index.array.slice(), 1) : null);
    // connected pieces (welded by position, since normals may have split vertices)
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (a) => {
      while (parent[a] !== a) {
        parent[a] = parent[parent[a]];
        a = parent[a];
      }
      return a;
    };
    const keyed = new Map();
    for (let i = 0; i < n; i++) {
      const key = `${Math.round(P[i * 3] * 2e5)},${Math.round(P[i * 3 + 1] * 2e5)},${Math.round(P[i * 3 + 2] * 2e5)}`;
      const j = keyed.get(key);
      if (j === undefined) keyed.set(key, i);
      else parent[find(i)] = find(j);
    }
    const idx = ng.index ? ng.index.array : null;
    if (idx) for (let i = 0; i < idx.length; i += 3) {
      parent[find(idx[i + 1])] = find(idx[i]);
      parent[find(idx[i + 2])] = find(idx[i]);
    }
    const count = new Map();
    const sum = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      count.set(r, (count.get(r) || 0) + 1);
      const s = sum.get(r) || [0, 0];
      s[0] += P[i * 3];
      s[1] += P[i * 3 + 1];
      sum.set(r, s);
    }
    const S = new Float32Array(n);
    const pieceS = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (count.get(r) > 1500) {
        S[i] = projectToLoop(P[i * 3], P[i * 3 + 1], table.data); // the belt: every vertex on its own
      } else {
        let s = pieceS.get(r);
        if (s === undefined) {
          const c = sum.get(r);
          s = projectToLoop(c[0] / count.get(r), c[1] / count.get(r), table.data);
          pieceS.set(r, s);
        }
        S[i] = s;
      }
    }
    ng.setAttribute('aTrackS', new THREE.BufferAttribute(S, 1));
    ng.computeBoundingSphere();
    ng.computeBoundingBox();
    mesh.geometry = ng;
    if (mesh.parent !== trackNode) trackNode.add(mesh);
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrix();
  }
  // drop the now-empty intermediate groups
  trackNode.children.filter((c) => !c.isMesh).forEach((c) => trackNode.remove(c));
}

// ----------------------------------------------------------------------------------------------- shader patches

const GLSL_NOISE = /* glsl */ `
float tkHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float tkNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(tkHash(i), tkHash(i + vec3(1, 0, 0)), f.x), mix(tkHash(i + vec3(0, 1, 0)), tkHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(tkHash(i + vec3(0, 0, 1)), tkHash(i + vec3(1, 0, 1)), f.x), mix(tkHash(i + vec3(0, 1, 1)), tkHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 tkHue(float h) {
  return clamp(abs(fract(h + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}
`;

// Bump a normal from a height (metres) using the screen-space derivatives (Mikkelsen's unparametrised bump mapping).
const GLSL_BUMP = /* glsl */ `
vec3 tkBump(vec3 surfPos, vec3 surfNorm, float h, float faceDirection) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

const SPLAT_PARS = /* glsl */ `
uniform vec4 uSplatA[${MAX_SPLATS}]; // xyz: centre in the hull's space (m), w: radius (m), 0 = unused
uniform vec4 uSplatB[${MAX_SPLATS}]; // x: age 0..1, y: seed, z: kind, w: pop-in 0..1
uniform vec4 uSplatC[${MAX_SPLATS}]; // rgb: colour (linear)
varying vec3 vHullPos;
${GLSL_NOISE}
${GLSL_BUMP}
`;

// Everything the splats add, computed once per fragment. Results: sMask (how covered), sCol, sRough, sCoat, sBumpH, sGlow.
const SPLAT_COMPUTE = /* glsl */ `
  float sMask = 0.0; vec3 sCol = vec3(0.0); float sRough = 0.5; float sCoat = 0.0; float sBumpH = 0.0; float sGlow = 0.0;
  for (int si = 0; si < ${MAX_SPLATS}; si++) {
    vec4 A = uSplatA[si];
    if (A.w <= 0.0) continue;
    vec4 B = uSplatB[si];
    vec3 dv = vHullPos - A.xyz;
    float d = length(dv);
    float R = A.w * (0.5 + 0.5 * smoothstep(0.0, 1.0, B.w));
    if (d > R * 1.7) continue;
    int kind = int(B.z + 0.5);
    float seed = B.y;
    vec3 q = vHullPos / R;
    float n1 = tkNoise(q * 2.3 + seed);
    float n2 = tkNoise(q * 7.0 + seed * 1.7);
    float field = 1.0 - d / R + ((n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.22);
    float dissolve = smoothstep(0.55, 1.0, B.x);
    float m = smoothstep(0.0, 0.09, field - dissolve * 0.95);
    vec3 col = uSplatC[si].rgb;
    float rough = 0.5; float coat = 0.0; float bump = 0.0; float glow = 0.0;
    if (kind == 0 || kind == 1) {
      // confetti and stars: little coloured pieces scattered over the area
      float cell = R * (kind == 0 ? 0.30 : 0.36);
      vec3 cp = vHullPos / cell + seed;
      vec3 ci = floor(cp);
      float hh = tkHash(ci);
      float dd = length(fract(cp) - 0.5);
      float piece = smoothstep(0.44, 0.30, dd) * step(0.28, hh);
      vec3 pc = kind == 0 ? tkHue(tkHash(ci + 3.7)) * 0.9 + 0.1 : mix(vec3(1.0, 0.78, 0.18), tkHue(tkHash(ci + 3.7)), 0.55);
      pc = pow(pc, vec3(2.2));
      m *= piece;
      col = pc;
      rough = kind == 0 ? 0.45 : 0.18;
      coat = kind == 0 ? 0.0 : 0.9;
      glow = kind == 1 ? 0.35 * step(0.7, hh) : 0.0;
    } else if (kind == 2) {
      // mud: dark, wet, lumpy, with flecks thrown past the edge
      float fleck = smoothstep(0.80, 0.86, tkNoise(q * 9.0 + seed)) * step(-0.35, field) * step(field, 0.1);
      m = max(m, fleck * (1.0 - dissolve));
      col = mix(col * 0.55, col * 1.15, n2);
      rough = 0.16; coat = 0.85;
      bump = (n1 * 0.6 + n2 * 0.4) * R * 0.02;
    } else if (kind == 3) {
      // snow: powdery, matt, soft lumps
      col = mix(col, vec3(0.86, 0.9, 0.98), 0.25 * (1.0 - n2)) * 1.05;
      rough = 1.0; coat = 0.0;
      bump = (n1 * 0.5 + n2 * 0.5) * R * 0.012;
    } else if (kind == 4) {
      // jelly: bright, very glossy, a soft inner glow
      col = mix(col * 0.75, col * 1.2, smoothstep(0.0, 0.8, field));
      rough = 0.05; coat = 1.0; glow = 0.10;
      bump = smoothstep(0.0, 0.5, field) * R * 0.02;
    } else {
      // paint: glossy and wet, with a few droplets beyond the edge
      float drop = smoothstep(0.78, 0.83, tkNoise(q * 8.0 + seed * 2.0)) * step(-0.4, field) * step(field, 0.08);
      m = max(m, drop * (1.0 - dissolve));
      rough = 0.10; coat = 0.9;
      bump = smoothstep(0.0, 0.4, field) * R * 0.01;
    }
    sCol = mix(sCol, col, m);
    sRough = mix(sRough, rough, m);
    sCoat = mix(sCoat, coat, m);
    sBumpH = mix(sBumpH, bump, m);
    sGlow = mix(sGlow, glow, m);
    sMask = max(sMask, m);
  }
`;

// The paint's own micro-texture: a faint orange-peel wobble in the lacquer and a touch of roughness variation.
const PEEL_HEIGHT = /* glsl */ `
  float peelH = 0.0; float peelR = 0.0;
  #ifdef TK_PEEL
    float pn1 = tkNoise(vHullPos * 330.0);
    float pn2 = tkNoise(vHullPos * 900.0 + 7.0);
    float fw = length(fwidth(vHullPos)) * 900.0;
    peelH = 0.000022 * (pn1 - 0.5) + 0.000009 * (pn2 - 0.5) * (1.0 - smoothstep(0.35, 1.2, fw));
    peelR = (pn1 - 0.5) * 0.10 + (tkNoise(vHullPos * 60.0) - 0.5) * 0.06;
  #endif
`;

function patchMaterial(material, view, opts) {
  const { peel = false, splats = true, track = false } = opts;
  const u = view.uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uHullInv: u.uHullInv, uSplatA: u.uSplatA, uSplatB: u.uSplatB, uSplatC: u.uSplatC, uRim: TANK_RIM });
    if (track) Object.assign(shader.uniforms, { uTrackTab: view.template.trackTable ? { value: view.template.trackTable.tex } : { value: null }, uTrackShift: u.uTrackShift, uTrackN: { value: TRACK_TABLE } });
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    vs = vs.replace('#include <common>', `#include <common>
      uniform mat4 uHullInv;
      varying vec3 vHullPos;
      ${track ? `
      attribute float aTrackS;
      uniform sampler2D uTrackTab;
      uniform float uTrackShift;
      uniform float uTrackN;
      vec4 tkTrackAt(float s) {
        s = fract(s);
        float f = s * uTrackN;
        float i0 = floor(f);
        float a = f - i0;
        int n = int(uTrackN + 0.5);
        int j0 = int(i0) % n;
        int j1 = (j0 + 1) % n;
        vec4 A = texelFetch(uTrackTab, ivec2(j0, 0), 0);
        vec4 B = texelFetch(uTrackTab, ivec2(j1, 0), 0);
        return vec4(mix(A.xy, B.xy, a), normalize(mix(A.zw, B.zw, a)));
      }` : ''}`);
    if (track) {
      // the tread travels round the loop: each vertex keeps its offset in the loop's local frame while the frame moves on
      vs = vs.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec4 tkF0 = tkTrackAt(aTrackS);
        vec4 tkF1 = tkTrackAt(aTrackS + uTrackShift);
        vec2 tkN0 = vec2(-tkF0.w, tkF0.z);
        vec2 tkN1 = vec2(-tkF1.w, tkF1.z);
        {
          vec2 nl = vec2(dot(objectNormal.xy, tkF0.zw), dot(objectNormal.xy, tkN0));
          objectNormal.xy = tkF1.zw * nl.x + tkN1 * nl.y;
        }`);
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec2 dp = transformed.xy - tkF0.xy;
          vec2 al = vec2(dot(dp, tkF0.zw), dot(dp, tkN0));
          transformed.xy = tkF1.xy + tkF1.zw * al.x + tkN1 * al.y;
        }`);
    }
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
      vHullPos = (uHullInv * modelMatrix * vec4(transformed, 1.0)).xyz;`);
    fs = fs.replace('#include <common>', `#include <common>
      uniform vec3 uRim;
      ${SPLAT_PARS}
      ${peel ? '#define TK_PEEL' : ''}`);
    fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
      ${splats ? SPLAT_COMPUTE : 'float sMask = 0.0; vec3 sCol = vec3(0.0); float sRough = 0.5; float sCoat = 0.0; float sBumpH = 0.0; float sGlow = 0.0;'}
      ${PEEL_HEIGHT}
      diffuseColor.rgb = mix(diffuseColor.rgb, sCol, sMask);`);
    fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(mix(roughnessFactor * (1.0 + peelR), sRough, sMask), 0.04, 1.0);`);
    fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = tkBump(-vViewPosition, normal, peelH + sBumpH * sMask, faceDirection);`);
    fs = fs.replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>
      #ifdef USE_CLEARCOAT
        clearcoatNormal = tkBump(-vViewPosition, clearcoatNormal, peelH * 1.6 + sBumpH * sMask, faceDirection);
      #endif`);
    fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += sCol * sGlow * sMask;
      {
        // brightest on the upper edges, where the sky is behind them
        float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
        totalEmissiveRadiance += uRim * rimF * clamp(0.35 + 0.65 * normal.y, 0.0, 1.0) * (1.0 - sMask);
      }`);
    fs = fs.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      #ifdef USE_CLEARCOAT
        material.clearcoat = mix(material.clearcoat, sCoat, sMask);
        material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.03, sMask * sCoat);
      #endif`);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => `tank-${peel ? 'p' : ''}${splats ? 's' : ''}${track ? 't' : ''}`;
}

// ----------------------------------------------------------------------------------------------- materials

function makeMaterials(view, color, quality) {
  const low = quality && quality.tier === 'low';
  const c = new THREE.Color(color);
  const paint = new THREE.MeshPhysicalMaterial({
    name: 'paint', color: c, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: low ? 0.07 : 0.035, envMapIntensity: 1.3,
    sheen: 0, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff).lerp(c, 0.7), ior: 1.5,
  });
  const rubber = new THREE.MeshPhysicalMaterial({
    name: 'rubber', color: 0x0d0d0f, roughness: 0.76, metalness: 0, clearcoat: 0.001, sheen: low ? 0 : 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x4a4a50),
  });
  const hub = new THREE.MeshPhysicalMaterial({ name: 'hub', color: 0x2a2c32, roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.2 });
  const star = new THREE.MeshPhysicalMaterial({ name: 'star', color: 0xf3f1e8, roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.1 });
  const metal = new THREE.MeshStandardMaterial({ name: 'metal', color: 0xc9ccd2, roughness: 0.28, metalness: 1 });
  const m = { paint, rubber, hub, star, metal };
  patchMaterial(paint, view, { peel: !low });
  patchMaterial(rubber, view, {});
  patchMaterial(hub, view, {});
  patchMaterial(star, view, {});
  return m;
}

// ----------------------------------------------------------------------------------------------- springs

// small damped springs stepped with fixed sub-steps; state lives in plain objects so nothing is allocated per frame
function makeSpring(freqHz, damping) {
  return { x: 0, v: 0, w: 2 * Math.PI * freqHz, z: damping };
}
function stepSpring(s, dt) {
  // semi-implicit Euler, split so a slow frame cannot blow the spring up
  const n = Math.min(8, Math.ceil(dt / 0.004));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (-s.w * s.w * s.x - 2 * s.z * s.w * s.v) * h;
    s.x += s.v * h;
  }
}

const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _mat = new THREE.Matrix4();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ----------------------------------------------------------------------------------------------- the view

export class TankView {
  constructor(template, { color = 0x1fb3b0, quality = null } = {}) {
    this.template = template;
    this.quality = quality;
    this.dims = template.dims;
    this.k = template.dims.length / 0.14; // the motions were tuned on a 14 cm tank; bigger toys move a little more
    this.object = template.root.clone(true);
    this.object.name = 'tank';
    const o = this.object;
    this.hull = o.getObjectByName('hull');
    this.turret = o.getObjectByName('turret');
    this.barrel = o.getObjectByName('barrel');
    this.muzzle = o.getObjectByName('muzzle');
    this.barrelX = this.barrel.position.x;
    this.wheels = [];
    template.wheels.forEach((w) => this.wheels.push({ node: o.getObjectByName(w.name), r: w.r + 0.0016, angle: 0 }));
    this.hasTracks = !!template.trackTable;

    this.uniforms = {
      uHullInv: { value: new THREE.Matrix4() },
      uSplatA: { value: Array.from({ length: MAX_SPLATS }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uSplatB: { value: Array.from({ length: MAX_SPLATS }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uSplatC: { value: Array.from({ length: MAX_SPLATS }, () => new THREE.Vector4(1, 1, 1, 0)) },
      uTrackShift: { value: 0 },
    };
    this.materials = makeMaterials(this, color, quality);
    // the tracks get their own copies of rubber and hub with the tread-scrolling patch
    if (this.hasTracks) {
      this.trackMats = {
        rubber: this.materials.rubber.clone(),
        hub: this.materials.hub.clone(),
      };
      patchMaterial(this.trackMats.rubber, this, { track: true });
      patchMaterial(this.trackMats.hub, this, { track: true });
    }
    this.object.traverse((n) => {
      if (!n.isMesh) return;
      const role = n.material && n.material.name;
      const inTrack = this.hasTracks && n.parent && /^track_[LR]$/.test(n.parent.name);
      n.material = (inTrack && this.trackMats[role]) || this.materials[role] || this.materials.paint;
      n.castShadow = true;
      n.receiveShadow = true;
      // the splats live in the hull's space, so hand the shaders the hull's inverse world matrix right before drawing (once per frame)
      n.onBeforeRender = (renderer) => {
        const f = renderer.info.render.frame;
        if (this._frame === f) return;
        this._frame = f;
        this.uniforms.uHullInv.value.copy(this.hull.matrixWorld).invert();
      };
    });

    // animation state
    this.aim = 0;
    this.speed = 0;
    this.trackPhase = 0;
    this.bobPhase = 0;
    this.time = 0;
    this.sp = {
      recoil: makeSpring(7.5, 0.32), // barrel slides back and returns
      rock: makeSpring(4.6, 0.26), // hull nose lifts when firing
      fsq: makeSpring(6.0, 0.30), // a tiny squash when firing
      hitSq: makeSpring(4.2, 0.10), // jelly squash and stretch
      hitRock: makeSpring(3.0, 0.13), // rocking about the feet
      jig: makeSpring(5.5, 0.16), // small hop after a hit
    };
    this.celebrating = false;
    this.celebW = 0;
    this.celebPhase = 0;
    this.celebFinish = false;
    this.splats = Array.from({ length: MAX_SPLATS }, () => ({ on: false, age: 0, pop: 0 }));
    this.bobAmp = 0;
    this._frame = -1;
    this.setAim(0);
  }

  setColor(color) {
    this.materials.paint.color.set(color);
    this.materials.paint.sheenColor.set(0xffffff).lerp(this.materials.paint.color, 0.7);
  }

  setAim(elevation) {
    this.aim = Math.max(-0.35, Math.min(1.55, elevation));
    this.barrel.rotation.z = this.aim;
  }

  muzzleWorld(out) {
    return this.muzzle.getWorldPosition(out);
  }

  fire(power = 0.6) {
    const p = Math.max(0.15, Math.min(1.2, power));
    const s = this.sp;
    s.recoil.v -= (0.20 + 0.28 * p) * this.k;
    s.rock.v += (0.55 + 0.9 * p);
    s.fsq.v -= 0.5 + 0.7 * p;
  }

  drive(speed) {
    this.speed = speed;
  }

  hit(strength = 0.7, dirX = 1) {
    const k = Math.max(0.15, Math.min(1.5, strength));
    const s = this.sp;
    s.hitSq.v -= 2.2 * k;
    s.hitRock.v += -Math.sign(dirX || 1) * 1.5 * k;
    s.jig.v += 0.12 * k * this.k;
  }

  celebrate(on) {
    if (on) {
      this.celebrating = true;
      this.celebFinish = false;
    } else if (this.celebrating) {
      this.celebFinish = true; // finish the spin in progress, so the tank ends up facing the same way
    }
  }

  splat(worldPos, radius, color, kind = 'paint') {
    const k = SPLAT_KINDS[kind] ?? 5;
    let slot = this.splats.findIndex((s) => !s.on);
    if (slot < 0) {
      let oldest = -1;
      slot = 0;
      this.splats.forEach((s, i) => {
        if (s.age > oldest) {
          oldest = s.age;
          slot = i;
        }
      });
    }
    this.hull.updateWorldMatrix(true, false);
    _v.copy(worldPos);
    this.hull.worldToLocal(_v);
    _c.set(color === undefined || color === null ? SPLAT_DEFAULT[kind] ?? 0xffffff : color);
    const S = this.splats[slot];
    S.on = true;
    S.age = 0;
    S.pop = 0;
    this.uniforms.uSplatA.value[slot].set(_v.x, _v.y, _v.z, radius);
    this.uniforms.uSplatB.value[slot].set(0, Math.random() * 40 + 1, k, 0);
    this.uniforms.uSplatC.value[slot].set(_c.r, _c.g, _c.b, 0);
  }

  update(dt, t) {
    dt = Math.min(dt, 0.1);
    this.time = t;
    const s = this.sp;
    stepSpring(s.recoil, dt);
    stepSpring(s.rock, dt);
    stepSpring(s.fsq, dt);
    stepSpring(s.hitSq, dt);
    stepSpring(s.hitRock, dt);
    stepSpring(s.jig, dt);

    // driving: wheels roll, the tread travels along the loop, the body bobs a little
    const sp = this.speed;
    if (sp !== 0 || this.bobAmp > 0.001) {
      for (const w of this.wheels) w.node.rotation.z -= (sp * dt) / w.r;
      this.trackPhase = (this.trackPhase + (sp * dt) / this.template.trackLength) % 1;
      if (this.trackPhase < 0) this.trackPhase += 1;
      this.uniforms.uTrackShift.value = this.trackPhase;
    }
    const moving = Math.min(1, Math.abs(sp) / 0.06);
    // (the bob's rhythm follows distance, not time)
    this.bobAmp += (moving - this.bobAmp) * Math.min(1, dt * 8);
    this.bobPhase += Math.abs(sp) * dt * 240;
    const bobY = this.bobAmp * 0.00045 * this.k * (0.5 + 0.5 * Math.sin(this.bobPhase));
    const bobPitch = this.bobAmp * 0.010 * Math.sin(this.bobPhase * 0.5 + 1.0);

    // celebration: hop, and a full turn every second hop
    let hop = 0;
    let spin = 0;
    if (this.celebrating) {
      this.celebPhase += dt / 0.6;
      this.celebW += (1 - this.celebW) * Math.min(1, dt * 10);
      const cyc = this.celebPhase / 2;
      const f = cyc - Math.floor(cyc);
      spin = Math.PI * 2 * ease(f);
      hop = Math.abs(Math.sin(this.celebPhase * Math.PI)) * 0.016 * this.k * this.celebW;
      if (this.celebFinish && Math.floor(cyc) > Math.floor((this.celebPhase - dt / 0.6) / 2)) {
        this.celebrating = false;
        this.celebFinish = false;
        this.celebPhase = 0;
        spin = 0;
        hop = 0;
      }
    } else {
      this.celebW += (0 - this.celebW) * Math.min(1, dt * 10);
    }

    // barrel recoil, squash, rock about the leading foot
    this.barrel.position.x = this.barrelX + s.recoil.x;
    const squash = s.fsq.x * 0.05 + s.hitSq.x * 0.06;
    const sy = 1 + squash;
    const sxz = 1 - squash * 0.55;
    const rock = s.rock.x * 0.05 + s.hitRock.x * 0.08 + bobPitch;
    const pivot = rock >= 0 ? this.dims.contacts[1] : this.dims.contacts[0];
    const c = Math.cos(rock);
    const sn = Math.sin(rock);
    this.hull.scale.set(sxz, sy, sxz);
    this.hull.rotation.set(0, spin, rock);
    this.hull.position.set(pivot * (1 - c), -pivot * sn + bobY + hop + Math.max(0, s.jig.x), 0);

    // splats: pop in, then fade over their life
    const A = this.uniforms.uSplatA.value;
    const B = this.uniforms.uSplatB.value;
    for (let i = 0; i < MAX_SPLATS; i++) {
      const S = this.splats[i];
      if (!S.on) continue;
      S.age += dt / SPLAT_LIFE;
      S.pop = Math.min(1, S.pop + dt / 0.22);
      if (S.age >= 1) {
        S.on = false;
        A[i].w = 0;
        continue;
      }
      B[i].x = S.age;
      B[i].w = S.pop;
    }
  }

  dispose() {
    for (const m of Object.values(this.materials)) m.dispose();
    if (this.trackMats) for (const m of Object.values(this.trackMats)) m.dispose();
  }
}
