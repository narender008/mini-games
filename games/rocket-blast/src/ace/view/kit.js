// Ace Pilot view kit: the shared look of the grown-up mode. Machine
// materials (painted white, gunmetal, dark steel, charred plate, glowing
// cores), a panel-seam texture projected straight down onto hulls so every
// plate reads as a riveted panel from the top-down camera, a per-instance
// emissive hook for instanced enemies (hit flash and blinking lights), a
// geometry builder that merges a model's pieces into one mesh per material,
// and the bullet / core colour palette.
//
// Everything here is built once and shared: materials are cached by key, so
// the whole Ace cast compiles to a handful of shader programs.
import * as THREE from 'three';
import { mulberry32 } from '../../textures.js';

// HDR colours (linear, may exceed 1 so bloom picks them up)
export const COLORS = {
  magenta: [1.0, 0.16, 0.78],
  orange: [1.0, 0.48, 0.1],
  red: [1.0, 0.16, 0.1],
  cyan: [0.22, 0.86, 1.0],
  green: [0.35, 1.0, 0.32],
  yellow: [1.0, 0.82, 0.2],
  violet: [0.66, 0.32, 1.0],
  amber: [1.0, 0.66, 0.16],
  white: [1, 1, 1],
};

export const colorOf = (name) => COLORS[name] || COLORS.magenta;

// ------------------------------------------------------------ textures

let panelTex = null;
// Hull plating seen from above: R is an albedo multiplier (seams, vents and
// rivets darker, plate edges catching light), G a roughness offset (worn
// plates rougher, fresh ones glossier). Tileable.
export function panelTexture() {
  if (panelTex) return panelTex;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = mulberry32(911);
  g.fillStyle = 'rgb(200,128,0)';
  g.fillRect(0, 0, S, S);
  // plates: a recursive split of the square, each with its own tone
  const plates = [];
  const split = (x, y, w, h, depth) => {
    if (depth > 3 || (depth > 1 && rnd() < 0.3) || w < 60 || h < 60) {
      plates.push([x, y, w, h]);
      return;
    }
    if (w > h ? rnd() < 0.8 : rnd() < 0.2) {
      const k = Math.round((0.3 + rnd() * 0.4) * w);
      split(x, y, k, h, depth + 1);
      split(x + k, y, w - k, h, depth + 1);
    } else {
      const k = Math.round((0.3 + rnd() * 0.4) * h);
      split(x, y, w, k, depth + 1);
      split(x, y + k, w, h - k, depth + 1);
    }
  };
  split(0, 0, S, S, 0);
  for (const [x, y, w, h] of plates) {
    const tone = 185 + rnd() * 50;
    const rough = 100 + rnd() * 70;
    g.fillStyle = `rgb(${tone | 0},${rough | 0},0)`;
    g.fillRect(x, y, w, h);
    // light top-left edge, dark seam bottom-right
    g.fillStyle = 'rgb(245,110,0)';
    g.fillRect(x, y, w, 2);
    g.fillRect(x, y, 2, h);
    g.fillStyle = 'rgb(70,180,0)';
    g.fillRect(x, y + h - 3, w, 3);
    g.fillRect(x + w - 3, y, 3, h);
    // rivets along some edges
    if (rnd() < 0.6) {
      g.fillStyle = 'rgb(120,150,0)';
      for (let i = 10; i < w - 8; i += 14) {
        g.fillRect(x + i, y + 6, 3, 3);
        g.fillRect(x + i, y + h - 10, 3, 3);
      }
    }
    // vents
    if (rnd() < 0.25 && w > 80 && h > 50) {
      g.fillStyle = 'rgb(60,200,0)';
      const vx = x + w * 0.2;
      const vw = w * 0.6;
      for (let i = 0; i < 5; i++) g.fillRect(vx, y + h * 0.3 + i * 7, vw, 3);
    }
    // grime streaks
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(90,200,0,${0.08 + rnd() * 0.1})`;
      g.fillRect(x + rnd() * w, y, 2 + rnd() * 6, h * rnd());
    }
  }
  panelTex = new THREE.CanvasTexture(c);
  panelTex.colorSpace = THREE.NoColorSpace;
  panelTex.wrapS = panelTex.wrapT = THREE.RepeatWrapping;
  panelTex.anisotropy = 4;
  return panelTex;
}

let hazardTex = null;
// Yellow and black chevron stripes for boss edges (sRGB colour map).
export function hazardTexture() {
  if (hazardTex) return hazardTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1a1c';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#e8a21c';
  for (let i = -S; i < S * 2; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 16, 0);
    g.lineTo(i + 16 + S, S);
    g.lineTo(i + S, S);
    g.fill();
  }
  hazardTex = new THREE.CanvasTexture(c);
  hazardTex.colorSpace = THREE.SRGBColorSpace;
  hazardTex.wrapS = hazardTex.wrapT = THREE.RepeatWrapping;
  return hazardTex;
}

// ------------------------------------------------------------ materials

const cache = new Map();

// A lit machine material. Options:
//   panel      0..1 strength of the projected panel texture
//   panelScale panels per world unit (the texture repeats every 1/scale)
//   inst       true: reads a per-instance `aEmit` (rgb added to emission,
//              a darkens the paint) for instanced meshes
//   map        a colour texture (uses the mesh uvs)
export function machine(key, { color = 0x5a6270, metalness = 0.8, roughness = 0.4, clearcoat = 0, emissive = 0x000000, emissiveIntensity = 1, panel = 0, panelScale = 1.6, inst = false, map = null, envMapIntensity = 1 } = {}) {
  const id = `${key}|${inst ? 'i' : 'm'}`;
  if (cache.has(id)) return cache.get(id);
  const m = new THREE.MeshPhysicalMaterial({ color, metalness, roughness, clearcoat, clearcoatRoughness: 0.15, emissive, emissiveIntensity, map, envMapIntensity });
  extend(m, { panel, panelScale, inst });
  cache.set(id, m);
  return m;
}

// A glowing core or light strip: dark glass that emits its colour.
export function core(name, intensity = 3, inst = false) {
  const [r, g, b] = colorOf(name);
  const id = `core-${name}-${intensity}|${inst ? 'i' : 'm'}`;
  if (cache.has(id)) return cache.get(id);
  const m = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.25, metalness: 0, emissive: new THREE.Color(r, g, b), emissiveIntensity: intensity });
  extend(m, { inst });
  cache.set(id, m);
  return m;
}

// Common paints, cached.
export const MAT = {
  white: (inst) => machine('white', { color: 0xe8ecf1, metalness: 0.1, roughness: 0.28, clearcoat: 1, panel: 0.35, panelScale: 2.2, inst }),
  gunmetal: (inst) => machine('gunmetal', { color: 0x58606e, metalness: 0.85, roughness: 0.36, panel: 0.6, inst }),
  steel: (inst) => machine('steel', { color: 0x8a92a0, metalness: 0.9, roughness: 0.3, panel: 0.45, panelScale: 2.4, inst }),
  dark: (inst) => machine('dark', { color: 0x23272e, metalness: 0.75, roughness: 0.5, panel: 0.3, inst }),
  red: (inst) => machine('red', { color: 0xc8202a, metalness: 0.2, roughness: 0.3, clearcoat: 1, inst }),
  lilac: (inst) => machine('lilac', { color: 0x9c98ae, metalness: 0.7, roughness: 0.32, panel: 0.4, panelScale: 2.5, inst }),
  olive: (inst) => machine('olive', { color: 0x8c8466, metalness: 0.7, roughness: 0.42, panel: 0.5, panelScale: 2.5, inst }),
  rust: (inst) => machine('rust', { color: 0x9a5a34, metalness: 0.6, roughness: 0.5, panel: 0.55, inst }),
  plum: (inst) => machine('plum', { color: 0x5a4068, metalness: 0.6, roughness: 0.4, clearcoat: 0.2, panel: 0.4, inst }),
  char: () => machine('char', { color: 0x37312c, metalness: 0.4, roughness: 0.85, panel: 0.8, emissive: 0x160500 }),
  hazard: () => machine('hazard', { color: 0xffffff, metalness: 0.3, roughness: 0.5, map: hazardTexture() }),
  glass: () => {
    if (!cache.has('glass')) cache.set('glass', new THREE.MeshPhysicalMaterial({ color: 0x0b2232, metalness: 0.3, roughness: 0.06, clearcoat: 1, emissive: new THREE.Color(0.02, 0.14, 0.2), envMapIntensity: 1.6 }));
    return cache.get('glass');
  },
};

function extend(m, { panel = 0, panelScale = 1.6, inst = false }) {
  const uniforms = { uPanel: { value: panel ? panelTexture() : null }, uPanelAmt: { value: panel }, uPanelScale: { value: panelScale } };
  m.userData.panel = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    const vHead = [];
    const fHead = [];
    const vBody = [];
    if (panel) {
      vHead.push('varying vec2 vPanelUv;', 'uniform float uPanelScale;');
      fHead.push('varying vec2 vPanelUv;', 'uniform sampler2D uPanel;', 'uniform float uPanelAmt;');
      vBody.push('vPanelUv = position.xy * uPanelScale;');
      fs = fs
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
  vec4 pnl = texture2D(uPanel, vPanelUv);
  diffuseColor.rgb *= mix(1.0, pnl.r * 1.22, uPanelAmt);`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor + (pnl.g - 0.55) * uPanelAmt * 0.7, 0.05, 1.0);');
    }
    if (inst) {
      vHead.push('attribute vec4 aEmit;', 'varying vec4 vEmit;');
      fHead.push('varying vec4 vEmit;');
      vBody.push('vEmit = aEmit;');
      fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vEmit.rgb;\n  diffuseColor.rgb *= 1.0 - vEmit.a;');
    }
    vs = vs.replace('#include <common>', `#include <common>\n${vHead.join('\n')}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${vBody.join('\n')}`);
    fs = fs.replace('#include <common>', `#include <common>\n${fHead.join('\n')}`);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `ace-${m.type}-${panel ? 'p' : ''}${inst ? 'i' : ''}`;
}

// ------------------------------------------------------------ geometry

// Extrude a flat outline (x, y points, in the play plane) to `depth`
// along z, centred on z = 0, with a soft bevel.
export function slab(points, depth = 0.1, bevel = 0.03, curve = 6) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curve });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Mirror a half outline (x >= 0, from the top down) into a symmetric one.
export function sym(half) {
  const out = half.slice();
  for (let i = half.length - 1; i >= 0; i--) if (half[i][0] !== 0) out.push([-half[i][0], half[i][1]]);
  return out;
}

// A regular polygon outline.
export function ngon(n, r, rot = 0, sx = 1, sy = 1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r * sx, Math.sin(a) * r * sy]);
  }
  return pts;
}

// A body of revolution round the y axis from [radius, y] pairs.
export function lathe(pts, seg = 24) {
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

// Collects a model's pieces, each placed with position / rotation / scale,
// and merges them into one geometry per material.
export class Builder {
  constructor() {
    this.byMat = new Map();
  }

  // o: { p: [x, y, z], r: [rx, ry, rz], s: number | [sx, sy, sz] }
  add(geo, mat, o = {}) {
    const p = o.p || [0, 0, 0];
    const r = o.r || [0, 0, 0];
    const s = typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s || [1, 1, 1];
    tmpM.compose(tmpP.set(p[0], p[1], p[2]), tmpQ.setFromEuler(tmpE.set(r[0], r[1], r[2])), tmpS.set(s[0], s[1], s[2]));
    if (o.m) tmpM.premultiply(o.m);
    const g = geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(tmpM);
    const list = this.byMat.get(mat) || [];
    list.push({ g, flip: tmpM.determinant() < 0 });
    this.byMat.set(mat, list);
    return this;
  }

  // add the piece and its mirror image across x = 0
  mirror(geo, mat, o = {}) {
    this.add(geo, mat, o);
    const p = o.p || [0, 0, 0];
    const r = o.r || [0, 0, 0];
    const s = typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s || [1, 1, 1];
    // reflect: x -> -x, which flips rotations about y and z
    this.add(geo, mat, { p: [-p[0], p[1], p[2]], r: [r[0], -r[1], -r[2]], s: [-s[0], s[1], s[2]], m: o.m });
    return this;
  }

  geometry(mat) {
    return mergeList(this.byMat.get(mat) || []);
  }

  materials() {
    return [...this.byMat.keys()];
  }

  // one Mesh per material in a Group
  group() {
    const out = new THREE.Group();
    for (const mat of this.byMat.keys()) out.add(new THREE.Mesh(this.geometry(mat), mat));
    return out;
  }
}

function mergeList(items) {
  let nv = 0;
  let ni = 0;
  for (const { g } of items) {
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const idx = new Uint32Array(ni);
  let vo = 0;
  let io = 0;
  for (const { g, flip } of items) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), vo * 3);
    nor.set(g.attributes.normal.array.subarray(0, n * 3), vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, n * 2), vo * 2);
    const count = g.index ? g.index.count : n;
    for (let i = 0; i < count; i += 3) {
      const a = g.index ? g.index.array[i] : i;
      const b = g.index ? g.index.array[i + 1] : i + 1;
      const c = g.index ? g.index.array[i + 2] : i + 2;
      idx[io + i] = a + vo;
      idx[io + i + 1] = (flip ? c : b) + vo;
      idx[io + i + 2] = (flip ? b : c) + vo;
    }
    vo += n;
    io += count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// Shared primitive geometries (unit sized; scale them when adding).
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 16),
  sphere: new THREE.SphereGeometry(0.5, 24, 16),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  torus: new THREE.TorusGeometry(0.5, 0.08, 10, 40),
  disc: new THREE.CylinderGeometry(0.5, 0.5, 0.04, 28),
};
