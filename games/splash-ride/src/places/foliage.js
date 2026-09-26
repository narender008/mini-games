// Shared foliage tools for the tree modules (palms, pines, the bay's trees):
// the quality tier's texture scale, a leaf translucency term for the
// standard material (sunlight glowing through leaves seen against the
// light), soft "crown" normals that make a mass of cards shade like one
// rounded canopy, and distant conifer woods drawn as painted impostors that
// turn to face the camera, so the far hills read as real forest, not cones.
import * as THREE from 'three';
import { rng } from '../config.js';
import { detectQuality } from '../quality.js';
import { canvasTexture } from './common.js';

let tierCache = null;

// The device's quality tier (the same pick the game makes at start).
export function qualityTier() {
  if (!tierCache) tierCache = detectQuality().tier;
  return tierCache;
}

// Canvas size for a texture: full size on high and medium, half on low.
export function texSize(n) {
  return qualityTier() === 'low' ? n / 2 : n;
}

// ------------------------------------------------------------ translucency

const RE_DIRECT = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';

// Call from a material's onBeforeCompile: light reaching the far side of a
// leaf shows through it, tinted warmer and yellower, strongest when looking
// towards the light. Uses each light's own (shadowed) colour. spec scales
// the specular sheen: a mass of needles is far less glossy than a smooth
// card, whose grazing sky reflection would read as a flat pale plane.
export function addTranslucency(sh, amount = 0.6, tint = 'vec3(1.05, 1.15, 0.5)', spec = 1) {
  const chunk = THREE.ShaderChunk.lights_fragment_begin.replaceAll(
    RE_DIRECT,
    `${RE_DIRECT}
    {
      float leafBack = saturate(-dot(geometryNormal, directLight.direction));
      float leafFwd = pow(saturate(-dot(geometryViewDir, directLight.direction)), 4.0);
      reflectedLight.directDiffuse += directLight.color * material.diffuseColor * ${tint} * (${amount.toFixed(3)} * (leafBack * 0.55 + leafFwd * 0.75));
    }`,
  );
  sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', chunk);
  if (spec !== 1) {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
  material.specularColor *= ${spec.toFixed(3)};
  material.specularColorBlended *= ${spec.toFixed(3)};
  material.specularF90 *= ${spec.toFixed(3)};`,
    );
  }
}

// Bend a geometry's normals towards "outwards from the crown": a card lit
// by its own flat normal flashes bright or black as it turns; a crown whose
// normals point away from its middle shades softly, like a rounded mass.
// centre(v, out) gives the crown's middle for a vertex; k = how much to bend.
// outward = true: both faces share one outward normal (use with
// volumeNormals) for dense clumps that shade as a mass, not as thin leaves.
export function crownNormals(geo, centre, k = 0.6, lift = 0.25, outward = false) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  const o = new THREE.Vector3();
  const f = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    centre(v, c);
    o.subVectors(v, c);
    o.y += lift * o.length();
    o.normalize();
    f.fromBufferAttribute(n, i);
    // bend within the face's own side, so a double-sided card still turns
    // its lit side to whoever looks at it
    if (f.dot(o) < 0) {
      if (outward) f.negate();
      else o.negate();
    }
    f.lerp(o, k).normalize();
    n.setXYZ(i, f.x, f.y, f.z);
  }
  n.needsUpdate = true;
  return geo;
}

// Merge indexed geometries that share the same attributes, keeping them
// indexed (so each vertex is shaded once, not once per triangle).
export function mergeIndexed(geos) {
  const names = Object.keys(geos[0].attributes);
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const size = geos[0].attributes[n].itemSize;
    let len = 0;
    for (const g of geos) len += g.attributes[n].count * size;
    const arr = new Float32Array(len);
    let o = 0;
    for (const g of geos) {
      arr.set(g.attributes[n].array, o);
      o += g.attributes[n].count * size;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  let total = 0;
  for (const g of geos) total += g.index ? g.index.count : g.attributes.position.count;
  const idx = new Uint32Array(total);
  let o = 0;
  let base = 0;
  for (const g of geos) {
    const cnt = g.attributes.position.count;
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[o++] = g.index.array[i] + base;
    else for (let i = 0; i < cnt; i++) idx[o++] = i + base;
    base += cnt;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// A grid of vertices (rows x cols) filled in by at(i, j, out) -> { pos, uv },
// indexed into quads. Used for fronds, sprays and bark tubes.
export function gridGeometry(rows, cols, at, wrap = false) {
  const pos = [];
  const uv = [];
  const cell = { p: new THREE.Vector3(), u: 0, v: 0 };
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      at(i, j, cell);
      pos.push(cell.p.x, cell.p.y, cell.p.z);
      uv.push(cell.u, cell.v);
    }
  }
  const idx = [];
  const cw = wrap ? cols : cols - 1;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cw; j++) {
      const a = i * cols + j;
      const b = i * cols + ((j + 1) % cols);
      const c = a + cols;
      const d = b + cols;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Add a per-vertex attribute computed from each vertex: fn(position, i) -> value(s).
export function vertexAttr(geo, name, size, fn) {
  const p = geo.attributes.position;
  const a = new Float32Array(p.count * size);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const r = fn(v, i);
    if (size === 1) a[i] = r;
    else for (let k = 0; k < size; k++) a[i * size + k] = r[k];
  }
  geo.setAttribute(name, new THREE.BufferAttribute(a, size));
  return geo;
}

// Call from onBeforeCompile of a double-sided material whose normals were
// bent with crownNormals(..., outward = true): keep the outward normal on
// both faces, so the side of a crown away from the sun stays in shade
// instead of half its cards turning their faces to the light.
export function volumeNormals(sh) {
  sh.fragmentShader = sh.fragmentShader.replace(
    '#include <normal_fragment_begin>',
    THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''),
  );
}

// ------------------------------------------------------------ conifer impostors

// Paint one conifer into the box (x, y, w, h) of a canvas, trunk foot at
// the bottom middle. kind: 'spruce' (drooping tiers to the ground), 'fir'
// (narrow, neat, upturned tiers), 'pine' (bare trunk, a head of clumps),
// 'broad' (a wide old spruce with hanging boughs).
function paintConifer(g, x, y, w, h, kind, r) {
  const cx = x + w / 2;
  const foot = y + h;
  const hsl = (hu, s, l) => `hsl(${hu}, ${s}%, ${l}%)`;
  const needleEdge = (x0, y0, x1, y1, n, len, light, hue) => {
    // short needle strokes fringing the line x0,y0 -> x1,y1
    for (let i = 0; i < n; i++) {
      const t = r();
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      const a = -Math.PI / 2 + (r() - 0.5) * 2.6;
      const l = len * (0.5 + r() * 0.7);
      g.strokeStyle = hsl(hue + r() * 20, 22 + r() * 16, light + r() * 8);
      g.lineWidth = 0.8 + r() * 0.8;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
      g.stroke();
    }
  };
  // one bough: a drooping, tapering mass out to (ex, ey), lit along its top
  const bough = (sx, sy, ex, ey, thick, lift, dark, lit) => {
    const mx = (sx + ex) / 2;
    const my = Math.min(sy, ey) - lift;
    g.fillStyle = hsl(108 + r() * 20, 24 + r() * 12, dark + r() * 3);
    g.beginPath();
    g.moveTo(sx, sy - thick * 0.4);
    g.quadraticCurveTo(mx, my - thick * 0.3, ex, ey);
    // ragged underside with hanging tufts
    const steps = 5;
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const bx = sx + (ex - sx) * t;
      const by = sy + (ey - sy) * t + thick * (1 - t * 0.6) * (0.7 + r() * 0.6);
      g.lineTo(bx, by);
    }
    g.closePath();
    g.fill();
    // the sunny top of the bough and its fresh tip
    g.strokeStyle = hsl(92 + r() * 18, 26 + r() * 12, lit + r() * 6);
    g.lineWidth = Math.max(1.2, thick * 0.35);
    g.beginPath();
    g.moveTo(sx + (ex - sx) * 0.25, sy + (ey - sy) * 0.25 - thick * 0.35);
    g.quadraticCurveTo(mx, my - thick * 0.2, ex, ey);
    g.stroke();
    needleEdge(sx + (ex - sx) * 0.2, sy - thick * 0.4, ex, ey, Math.ceil(Math.abs(ex - sx) * 0.5), thick * 0.9, lit - 2, 85);
    g.fillStyle = hsl(80 + r() * 16, 30 + r() * 10, lit + 6 + r() * 6);
    g.beginPath();
    g.ellipse(ex, ey, thick * 0.45, thick * 0.3, 0, 0, Math.PI * 2);
    g.fill();
  };
  // a round clump of needles (pine heads)
  const clump = (px, py, rx, ry, dark, lit) => {
    g.fillStyle = hsl(100 + r() * 20, 22 + r() * 12, dark + r() * 3);
    g.beginPath();
    for (let k = 0; k <= 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const rr = 0.75 + r() * 0.35;
      g.lineTo(px + Math.cos(a) * rx * rr, py + Math.sin(a) * ry * rr);
    }
    g.fill();
    needleEdge(px - rx, py - ry * 0.4, px + rx, py - ry * 0.6, Math.ceil(rx * 1.2), ry * 0.8, lit, 88);
    g.fillStyle = hsl(90 + r() * 16, 26 + r() * 12, lit + r() * 5);
    g.beginPath();
    g.ellipse(px - rx * 0.15, py - ry * 0.35, rx * 0.55, ry * 0.3, 0, 0, Math.PI * 2);
    g.fill();
  };
  const trunk = (top, wid, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx - wid, foot);
    g.lineTo(cx - wid * 0.3, top);
    g.lineTo(cx + wid * 0.3, top);
    g.lineTo(cx + wid, foot);
    g.fill();
  };

  if (kind === 'pine') {
    // Scots pine: a tall bare trunk, a few dead stubs, a broad flat-topped head
    trunk(y + h * 0.22, w * 0.035, '#4a3426');
    g.strokeStyle = '#3a2a1e';
    g.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const sy = foot - h * (0.25 + r() * 0.3);
      const s = r() < 0.5 ? -1 : 1;
      g.beginPath();
      g.moveTo(cx, sy);
      g.lineTo(cx + s * w * (0.05 + r() * 0.08), sy - h * 0.02);
      g.stroke();
    }
    // limbs up into the head
    g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const s = i % 2 ? 1 : -1;
      const sy = y + h * (0.3 + r() * 0.2);
      g.beginPath();
      g.moveTo(cx, sy);
      g.quadraticCurveTo(cx + s * w * 0.15, sy - h * 0.04, cx + s * w * (0.22 + r() * 0.15), sy - h * (0.08 + r() * 0.08));
      g.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI;
      const d = Math.sqrt(r());
      const px = cx + Math.cos(a) * d * w * 0.4;
      const py = y + h * 0.2 - Math.sin(a) * d * h * 0.14 + r() * h * 0.2;
      clump(px, py, w * (0.08 + r() * 0.06), h * (0.03 + r() * 0.02), 15, 28);
    }
    return;
  }

  const spec = {
    spruce: { width: 0.44, bottom: 0.97, layers: 34, droop: 0.32, lift: 0.02, top: 0.012 },
    fir: { width: 0.3, bottom: 0.93, layers: 30, droop: 0.1, lift: 0.05, top: 0.01 },
    broad: { width: 0.5, bottom: 0.99, layers: 38, droop: 0.5, lift: 0.0, top: 0.03 },
  }[kind];
  trunk(y + h * 0.1, w * 0.03, '#3a2b20');
  const H = h * spec.bottom;
  for (let i = 0; i < spec.layers; i++) {
    const t = (i + r() * 0.6) / spec.layers;
    const by = y + h * spec.top + t * (H - h * spec.top);
    // crown profile: narrow spire, widest near the foot, with odd long and short boughs
    const prof = Math.pow(t, kind === 'fir' ? 1 : 0.85) * (0.72 + r() * 0.5) + 0.04;
    const hw = Math.min(0.5, spec.width * prof) * w;
    const thick = h * (0.018 + 0.03 * t) * (0.8 + r() * 0.4);
    const dark = 15 + (1 - t) * 3;
    const lit = 26 + (1 - t) * 8;
    for (const s of [-1, 1]) {
      const reach = hw * (0.8 + r() * 0.25);
      const ex = cx + s * reach;
      const ey = by + reach * spec.droop * (0.7 + r() * 0.6) - (kind === 'fir' ? reach * 0.08 : 0);
      bough(cx - s * w * 0.01, by, ex, ey, thick, h * spec.lift * r(), dark, lit);
    }
    // boughs pointing towards and away from us fill the middle
    if (r() < 0.75) clump(cx + (r() - 0.5) * hw * 0.8, by + thick * 0.4, hw * 0.35, thick * 0.6, dark + 1, lit - 2);
  }
  // the leader at the very top
  g.strokeStyle = hsl(95, 26, 16);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx, y + h * spec.top + h * 0.03);
  g.lineTo(cx, y);
  g.stroke();
}

let atlasCache = null;

// Four conifers side by side: spruce, fir, pine, broad spruce. The shading
// deepens towards the trunk and the foot, like the shade inside a real crown.
function coniferAtlas() {
  if (atlasCache) return atlasCache;
  const W = texSize(1024);
  const H = texSize(512);
  atlasCache = canvasTexture(W, H, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const s = w / 1024;
    g.save();
    g.scale(s, s);
    const r = rng(41);
    ['spruce', 'fir', 'pine', 'broad'].forEach((kind, i) => {
      g.save();
      g.beginPath();
      g.rect(i * 256, 0, 256, 512);
      g.clip();
      paintConifer(g, i * 256 + 6, 6, 244, 506, kind, r);
      // inner shade, on the painted pixels only
      g.globalCompositeOperation = 'source-atop';
      const gx = g.createLinearGradient(i * 256, 0, i * 256 + 256, 0);
      gx.addColorStop(0, 'rgba(0,0,0,0)');
      gx.addColorStop(0.5, 'rgba(0,0,0,0.26)');
      gx.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gx;
      g.fillRect(i * 256, 0, 256, 512);
      const gy = g.createLinearGradient(0, 0, 0, 512);
      gy.addColorStop(0, 'rgba(0,0,0,0)');
      gy.addColorStop(0.6, 'rgba(0,0,0,0.1)');
      gy.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = gy;
      g.fillRect(i * 256, 0, 256, 512);
      g.restore();
    });
    g.restore();
  });
  return atlasCache;
}

let woodsMat = null;

// One material for every impostor forest: each tree is a single quad that
// turns about its own upright axis to face the camera (conifers look the
// same from every side), with normals bent into a rounded crown.
function woodsMaterial() {
  if (woodsMat) return woodsMat;
  const mat = new THREE.MeshStandardMaterial({ map: coniferAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float variant;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_INSTANCING
  mat4 bbM = modelMatrix * instanceMatrix;
  vec3 bbC = bbM[3].xyz;
  vec3 bbX = normalize(bbM[0].xyz);
  vec3 bbZ = normalize(bbM[2].xyz);
  vec2 bbD = cameraPosition.xz - bbC.xz;
  bbD /= max(length(bbD), 1e-3);
  vec3 bbF = vec3(dot(vec3(bbD.x, 0.0, bbD.y), bbX), 0.0, dot(vec3(bbD.x, 0.0, bbD.y), bbZ));
  vec3 bbR = vec3(bbF.z, 0.0, -bbF.x);
  float bbSx = length(bbM[0].xyz);
  float bbSy = length(bbM[1].xyz);
  // mirror every other tree's painting so neighbours differ
  float bbFlip = fract(bbC.x * 0.1234 + bbC.z * 0.3717) > 0.5 ? 1.0 : -1.0;
  vMapUv.x = (variant + 0.5 + (vMapUv.x - 0.5) * bbFlip) * 0.25;
#endif`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#ifdef USE_INSTANCING
  vec3 bbN = bbF * 0.55 + bbR * position.x * 1.4 + vec3(0.0, 0.25 + 0.4 * position.y, 0.0);
  vec3 objectNormal = normalize(vec3(bbN.x * bbSx, bbN.y * bbSy, bbN.z * bbSx));
#else
  vec3 objectNormal = vec3(normal);
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
#ifdef USE_INSTANCING
  transformed = bbR * position.x + vec3(0.0, position.y, 0.0);
#endif`,
      );
    addTranslucency(sh, 0.08, 'vec3(0.9, 1.1, 0.5)', 0.3);
  };
  mat.customProgramCacheKey = () => 'conifer-impostor';
  woodsMat = mat;
  return mat;
}

let quadGeo = null;
function quad() {
  if (quadGeo) return quadGeo;
  const g = new THREE.PlaneGeometry(1, 1);
  g.translate(0, 0.5, 0);
  quadGeo = g;
  return g;
}

export const CONIFER = { spruce: 0, fir: 1, pine: 2, broad: 3 };

// Plant impostor conifers at spots [{ x, y, z, ry, s }]. kind(spot, i) picks
// the painted tree (CONIFER.*); size(spot) gives [height, width] in metres;
// tint(color, i) sets each tree's colour (a multiplier on the painting).
// One draw per quarter of the map, so the quarters out of view are skipped.
export function makeImpostorWoods(spots, { kind, size, tint, name = 'woods', centre = [0, 0] }) {
  const mat = woodsMaterial();
  const group = new THREE.Group();
  group.name = name;
  const quarters = [[], [], [], []];
  for (const s of spots) quarters[(s.x > centre[0] ? 1 : 0) + (s.z > centre[1] ? 2 : 0)].push(s);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  let n = 0;
  for (const list of quarters) {
    if (!list.length) continue;
    const g = quad().clone();
    const variant = new Float32Array(list.length);
    const mesh = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((s, i) => {
      variant[i] = kind(s, n);
      const [hgt, wid] = size(s, variant[i]);
      q.setFromAxisAngle(up, s.ry ?? 0);
      p.set(s.x, s.y, s.z);
      sc.set(wid, hgt, wid);
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
      tint(c, n++);
      mesh.setColorAt(i, c);
    });
    g.setAttribute('variant', new THREE.InstancedBufferAttribute(variant, 1));
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
