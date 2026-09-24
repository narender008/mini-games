// Little things growing in the lawn: patches of white clover (three
// heart-shaped leaflets with a pale chevron) and a scatter of tiny lawn
// daisies (white rays tipped pink round a yellow button) standing just
// above the grass. Both sway with the shared breeze and glow when the low
// sun shines through them.
import * as THREE from 'three';
import { mulberry32 } from '../config.js';
import { wind, WIND_GLSL } from '../shared.js';
import { WET_GLSL } from './groundglsl.js';
import { lawnDensity, lawnClearance, cloverPatches, TRANSLUCENT } from './grass.js';

const CLOVER_H = 0.045; // stalk height before instance scale
const DAISY_H = 0.1;

// ------------------------------------------------------------ geometry

// Collects triangles with a per-vertex part tag: aBit = (across, along, part)
// part: 0 stalk, 1 leaflet / ray, 2 daisy disc.
class Builder {
  constructor() {
    this.pos = [];
    this.bit = [];
  }

  tri(a, b, c, ba, bb, bc) {
    this.pos.push(...a, ...b, ...c);
    this.bit.push(...ba, ...bb, ...bc);
  }

  quad(a, b, c, d, ba, bb, bc, bd) {
    this.tri(a, b, c, ba, bb, bc);
    this.tri(a, c, d, ba, bc, bd);
  }

  // a thin stalk: two crossed ribbons, curving a little
  stalk(h, w, lean) {
    const segs = 4;
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
    ]) {
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        const c0 = [lean * t0 * t0, h * t0, 0];
        const c1 = [lean * t1 * t1, h * t1, 0];
        const off = [(dx * w) / 2, 0, (dz * w) / 2];
        this.quad(
          [c0[0] - off[0], c0[1], c0[2] - off[2]],
          [c0[0] + off[0], c0[1], c0[2] + off[2]],
          [c1[0] + off[0], c1[1], c1[2] + off[2]],
          [c1[0] - off[0], c1[1], c1[2] - off[2]],
          [-1, t0, 0],
          [1, t0, 0],
          [1, t1, 0],
          [-1, t1, 0],
        );
      }
    }
  }

  geometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('aBit', new THREE.Float32BufferAttribute(this.bit, 3));
    geo.computeVertexNormals();
    // leaflets and petals: soften the facets towards the sky, keeping which
    // side faces up
    const n = geo.attributes.normal;
    for (let i = 0; i < n.count; i++) {
      if (this.bit[i * 3 + 2] < 0.5) continue;
      const s = Math.sign(n.getY(i)) || 1;
      const v = new THREE.Vector3(n.getX(i) * 0.35, n.getY(i) * 0.35 + s * 0.65, n.getZ(i) * 0.35).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeBoundingSphere();
    return geo;
  }
}

// Outline of one clover leaflet (x across, y along; length 1): broad and
// notched at the tip, narrow at the base.
const LEAFLET = [
  [0, 0],
  [0.17, 0.14],
  [0.32, 0.36],
  [0.41, 0.6],
  [0.4, 0.8],
  [0.3, 0.95],
  [0.14, 1.0],
  [0, 0.92],
];

function cloverGeometry() {
  const b = new Builder();
  b.stalk(CLOVER_H, 0.0012, 0.004);
  const len = 0.0105;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // leaflets lift a little and fold along the midrib
    const place = (x, y) => {
      const lx = x * len;
      const ly = y * len;
      const up = ly * 0.22 + Math.abs(lx) * 0.25 - (y > 0.7 ? (y - 0.7) * len * 0.25 : 0);
      return [0.004 + ly * ca - lx * sa, CLOVER_H + up, ly * sa + lx * ca];
    };
    const ring = [...LEAFLET.map(([x, y]) => [-x, y]), ...LEAFLET.slice(1, -1).reverse().map(([x, y]) => [x, y])];
    const c = [0, 0.55];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % ring.length];
      b.tri(place(...c), place(...q), place(...p), [0, c[1], 1], [q[0] / 0.42, q[1], 1], [p[0] / 0.42, p[1], 1]);
    }
  }
  return b.geometry();
}

function daisyGeometry() {
  const b = new Builder();
  b.stalk(DAISY_H, 0.0015, 0.008);
  const top = [0.008, DAISY_H, 0];
  const rays = 34;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + (i % 2) * 0.05;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const r0 = 0.0024;
    const r1 = 0.0078 + (i % 3) * 0.0004;
    const w = 0.00065;
    const lift = (i % 2) * 0.0007;
    const P = (r, s, y) => [top[0] + ca * r - sa * s, top[1] + y, top[2] + sa * r + ca * s];
    const base0 = P(r0, -w * 0.6, 0.0004 + lift * 0.3);
    const base1 = P(r0, w * 0.6, 0.0004 + lift * 0.3);
    const tip0 = P(r1, -w, 0.0012 + lift);
    const tip1 = P(r1, w, 0.0012 + lift);
    const end = P(r1 + 0.0007, 0, 0.0011 + lift);
    b.quad(base0, base1, tip1, tip0, [-1, 0, 1], [1, 0, 1], [1, 0.9, 1], [-1, 0.9, 1]);
    b.tri(tip0, tip1, end, [-1, 0.9, 1], [1, 0.9, 1], [0, 1, 1]);
  }
  // the yellow button, a low dome
  const seg = 12;
  const apex = [top[0], top[1] + 0.0022, top[2]];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const r = 0.0028;
    const p0 = [top[0] + Math.cos(a0) * r, top[1] + 0.0008, top[2] + Math.sin(a0) * r];
    const p1 = [top[0] + Math.cos(a1) * r, top[1] + 0.0008, top[2] + Math.sin(a1) * r];
    b.tri(apex, p1, p0, [0, 0, 2], [1, 1, 2], [1, 1, 2]);
  }
  return b.geometry();
}

// ------------------------------------------------------------ material

const BIT_VERT_DECL = /* glsl */ `
${WIND_GLSL}
attribute vec3 aBit;
uniform float uBitH;
uniform float uBitFlex;
varying vec3 vBit;
varying vec3 vBitW;
`;

const BIT_VERT = /* glsl */ `
#include <begin_vertex>
vBit = aBit;
float bk = clamp(position.y / uBitH, 0.0, 1.0);
vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
vec2 bSw = windSway(iPos + vec3(0.0, uBitH, 0.0), 1.0) * uBitFlex * bk * bk;
mat3 bIm = mat3(instanceMatrix);
transformed += transpose(bIm) * vec3(bSw.x, 0.0, bSw.y) / dot(bIm[0], bIm[0]);
vBitW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
`;

const BIT_FRAG_DECL = /* glsl */ `
${WET_GLSL}
varying vec3 vBit;
varying vec3 vBitW;
float gAO;
float gRough;
`;

// vColor carries per-instance data: r = chevron / pink tips, g = shade.
const CLOVER_FRAG = /* glsl */ `
vec3 bc;
if (vBit.z < 0.5) {
  bc = vec3(0.09, 0.16, 0.045);
  gAO = mix(0.3, 1.0, vBit.y);
} else {
  bc = vec3(0.024, 0.075, 0.018) * (0.75 + 0.5 * vColor.g);
  float chev = smoothstep(0.07, 0.025, abs(vBit.y - 0.3 - abs(vBit.x) * 0.28)) * step(abs(vBit.x), 0.8);
  bc = mix(bc, vec3(0.14, 0.2, 0.11), chev * 0.55 * vColor.r);
  bc *= 0.82 + 0.18 * smoothstep(1.0, 0.3, abs(vBit.x));
  bc *= 1.0 + 0.12 * smoothstep(0.08, 0.0, abs(vBit.x)) * step(0.1, vBit.y);
  gAO = 1.0;
}
bc *= 1.0 - 0.25 * wetAt(vBitW.xz).x;
diffuseColor.rgb = bc;
gTrans = bc * vec3(0.9, 1.2, 0.45);
gRough = 0.66;
`;

const DAISY_FRAG = /* glsl */ `
vec3 bc;
if (vBit.z < 0.5) {
  bc = vec3(0.1, 0.18, 0.05);
  gAO = mix(0.35, 1.0, vBit.y);
  gRough = 0.5;
  gTrans = bc * vec3(0.9, 1.2, 0.45);
} else if (vBit.z < 1.5) {
  bc = vec3(0.86, 0.86, 0.8) * (0.9 + 0.1 * vColor.g);
  bc = mix(bc, vec3(0.8, 0.32, 0.48), smoothstep(0.55, 1.0, vBit.y) * vColor.r);
  bc *= mix(0.7, 1.0, smoothstep(0.0, 0.3, vBit.y));
  gAO = 1.0;
  gRough = 0.55;
  gTrans = bc * 0.55;
} else {
  bc = vec3(0.95, 0.55, 0.03) * (0.85 + 0.15 * vBit.y);
  gAO = 1.0;
  gRough = 0.6;
  gTrans = bc * 0.3;
}
diffuseColor.rgb = bc;
`;

function bitMaterial(frag, key, height, flex) {
  const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, wind, m.userData.shared, { uBitH: { value: height }, uBitFlex: { value: flex } });
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${BIT_VERT_DECL}`).replace('#include <begin_vertex>', BIT_VERT);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${BIT_FRAG_DECL}`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${TRANSLUCENT}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${frag}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      // leaves have a soft waxy sheen, not a mirror glare at grazing angles
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.specularF90 = 0.3;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= gAO;\nreflectedLight.indirectSpecular *= 0.35 * gAO;');
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// ------------------------------------------------------------ the bits

const COUNTS = {
  high: { clover: 1100, daisy: 70 },
  medium: { clover: 700, daisy: 50 },
  low: { clover: 350, daisy: 30 },
};

export class LawnBits {
  constructor({ quality, uniforms }) {
    this.counts = COUNTS[quality.tier] ?? COUNTS.high;
    this.group = new THREE.Group();
    this.cloverGeo = cloverGeometry();
    this.daisyGeo = daisyGeometry();
    this.cloverMat = bitMaterial(CLOVER_FRAG, 'gg-clover', CLOVER_H, 0.35);
    this.daisyMat = bitMaterial(DAISY_FRAG, 'gg-daisy', DAISY_H, 1.1);
    this.cloverMat.userData.shared = this.daisyMat.userData.shared = uniforms;
  }

  build(layout) {
    this.clear();
    const rnd = mulberry32(layout.name.length * 313 + 11);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    // clover, gathered in patches, densest in the middle of each
    const patches = cloverPatches(layout);
    if (patches.length) {
      const n = this.counts.clover;
      const mesh = new THREE.InstancedMesh(this.cloverGeo, this.cloverMat, n);
      let count = 0;
      for (let tries = 0; count < n && tries < n * 6; tries++) {
        const pt = patches[Math.floor(rnd() * patches.length)];
        const a = rnd() * Math.PI * 2;
        const r = pt.r * Math.sqrt(rnd()) * (0.7 + 0.5 * rnd());
        const x = pt.x + Math.cos(a) * r;
        const z = pt.z + Math.sin(a) * r;
        if (lawnClearance(layout, x, z) < 1) continue;
        const s = 0.75 + rnd() * 0.6;
        e.set((rnd() - 0.5) * 0.3, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.3);
        m.compose(p.set(x, 0, z), q.setFromEuler(e), sc.set(s, s * (0.8 + rnd() * 0.5), s));
        mesh.setMatrixAt(count, m);
        mesh.setColorAt(count, col.setRGB(rnd() < 0.8 ? 0.6 + rnd() * 0.4 : 0.1, rnd(), 0));
        count++;
      }
      mesh.count = count;
      this.finish(mesh);
    }
    // daisies: loose little groups and a few on their own
    const nd = this.counts.daisy;
    const dm = new THREE.InstancedMesh(this.daisyGeo, this.daisyMat, nd);
    const groups = [];
    for (let tries = 0; groups.length < 9 && tries < 400; tries++) {
      const x = -2.8 + rnd() * 5.6;
      const z = -2.4 + rnd() * 4;
      if (lawnDensity(layout, x, z) > 0.6 && lawnClearance(layout, x, z) >= 1) groups.push([x, z]);
    }
    let count = 0;
    for (let tries = 0; groups.length && count < nd && tries < nd * 20; tries++) {
      const g = groups[Math.floor(rnd() * groups.length)];
      const lone = rnd() < 0.2;
      const x = lone ? -2.8 + rnd() * 5.6 : g[0] + (rnd() - 0.5) * 0.5;
      const z = lone ? -2.4 + rnd() * 4 : g[1] + (rnd() - 0.5) * 0.5;
      if (lawnDensity(layout, x, z) < 0.5 || lawnClearance(layout, x, z) < 1) continue;
      const s = 0.8 + rnd() * 0.45;
      e.set((rnd() - 0.5) * 0.35, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.35);
      m.compose(p.set(x, 0, z), q.setFromEuler(e), sc.set(s, 0.75 + rnd() * 0.45, s));
      dm.setMatrixAt(count, m);
      dm.setColorAt(count, col.setRGB(rnd() < 0.6 ? 0.25 + rnd() * 0.6 : 0, rnd(), 0));
      count++;
    }
    dm.count = count;
    this.finish(dm);
  }

  finish(mesh) {
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
  }

  setDensity() {}

  clear() {
    for (const obj of [...this.group.children]) {
      this.group.remove(obj);
      obj.dispose();
    }
  }

  dispose() {
    this.clear();
    this.cloverGeo.dispose();
    this.daisyGeo.dispose();
    this.cloverMat.dispose();
    this.daisyMat.dispose();
  }
}
