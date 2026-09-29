// Sea shells for the beach: ribbed scallops in cream, pink, lilac and apricot,
// little spiral whelks and the odd starfish, all real geometry (no cut-out
// textures) so they catch the sun and cast their own tiny shadows. Each kind
// is one InstancedMesh (three draw calls for the lot), sized in metres:
// a scallop is 3 to 5 cm across, as big as a tank's wheel.
import * as THREE from 'three';
import { mergeVertices } from 'three-gltf/utils/BufferGeometryUtils.js';
import { fbm3, rng, smoothstep } from '../config.js';

// a scallop of radius 1: the hinge at the origin, the fan opening towards +z
// and the domed side up. Ribs run out from the hinge and scallop the rim.
function scallopGeometry() {
  const ROWS = 14;
  const COLS = 44;
  const A = 1.08; // half the fan's angle
  const RIBS = 9;
  const pos = [];
  const col = [];
  const idx = [];
  for (let side = 0; side < 2; side++) {
    const base = pos.length / 3;
    for (let i = 0; i <= ROWS; i++) {
      const r = i / ROWS;
      for (let j = 0; j <= COLS; j++) {
        const u = j / COLS * 2 - 1;
        const a = u * A;
        const rib = Math.cos(u * RIBS * Math.PI);
        // the rim is scalloped: it bulges where a rib ends
        const rr = r * (1 + 0.035 * (rib - 1) * smoothstep(0.7, 1, r));
        // a shallow dome, steeper towards the hinge, with a rib on it
        const dome = 0.34 * Math.sin(Math.min(1, r * 1.15) * Math.PI * 0.62) * (1 - 0.55 * u * u);
        const ridge = 0.05 * rr * rib * smoothstep(0.1, 0.5, r);
        const y = dome + ridge - side * 0.045;
        // the hinge end is squared off, with the two little "ears"
        const x = Math.sin(a) * rr;
        const z = Math.cos(a) * rr * 0.98 + 0.03 * (1 - rr);
        pos.push(x, y, z);
        // growth lines and darker valleys between the ribs; a bit warmer towards the hinge
        const growth = 0.93 + 0.07 * Math.sin(r * 46);
        const v = (0.86 + 0.14 * (rib * 0.5 + 0.5)) * growth * (side ? 0.8 : 1);
        col.push(v, v * (0.97 + 0.03 * r), v * (0.94 + 0.06 * r));
      }
    }
    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < COLS; j++) {
        const a = base + i * (COLS + 1) + j;
        const b = a + 1;
        const c = a + COLS + 1;
        const d = c + 1;
        if (side === 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a spiral shell of length 1 lying along +x, apex at x = 1, the opening at x = 0
function spiralGeometry() {
  const ROWS = 34;
  const COLS = 20;
  const pos = [];
  const col = [];
  const idx = [];
  for (let i = 0; i <= ROWS; i++) {
    const t = i / ROWS;
    // fat body whorl at the opening, tapering to a point: a rounded cone
    const body = Math.pow(1 - t, 0.85) * (0.34 + 0.16 * Math.sin(Math.min(1, t * 5) * Math.PI * 0.5));
    for (let j = 0; j <= COLS; j++) {
      const a = (j / COLS) * Math.PI * 2;
      // the whorls: a spiral ridge winding round the shell
      const ridge = 0.075 * Math.sin(a * 1 - t * Math.PI * 2 * 4.5) * (1 - t * 0.6);
      const rad = Math.max(0.002, body * (1 + ridge));
      // the opening flares and is hollow at the very start
      const x = t + (t < 0.03 ? -0.02 : 0);
      pos.push(x, Math.sin(a) * rad, Math.cos(a) * rad);
      const s = 0.86 + 0.14 * Math.sin(a * 1 - t * Math.PI * 2 * 4.5);
      col.push(s, s * 0.98, s * 0.95);
    }
  }
  for (let i = 0; i < ROWS; i++) {
    for (let j = 0; j < COLS; j++) {
      const a = i * (COLS + 1) + j;
      const b = a + 1;
      const c = a + COLS + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a starfish of radius 1, lying flat, arms towards the rim
function starGeometry() {
  const RINGS = 9;
  const COLS = 80;
  const pos = [];
  const col = [];
  const idx = [];
  pos.push(0, 0.22, 0);
  col.push(1, 1, 1);
  for (let i = 1; i <= RINGS; i++) {
    const r = i / RINGS;
    for (let j = 0; j < COLS; j++) {
      const a = (j / COLS) * Math.PI * 2;
      // five arms that narrow to rounded tips
      const arm = Math.pow(Math.abs(Math.cos(a * 2.5)), 1.5);
      const reach = 0.36 + 0.64 * arm;
      const rr = r * reach;
      const spine = Math.pow(Math.abs(Math.cos(a * 2.5)), 6);
      const y = 0.2 * Math.pow(Math.max(0, 1 - r * r), 0.7) * (0.55 + 0.45 * spine) + 0.02;
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
      // bumpy dots along each arm
      const dots = 0.5 + 0.5 * Math.sin(r * 30 + a * 0) * spine;
      const k = 0.88 + 0.12 * dots;
      col.push(k, k * (0.95 + 0.05 * r), k * 0.92);
    }
  }
  for (let j = 0; j < COLS; j++) idx.push(0, 1 + ((j + 1) % COLS), 1 + j);
  for (let i = 1; i < RINGS; i++) {
    for (let j = 0; j < COLS; j++) {
      const a = 1 + (i - 1) * COLS + j;
      const b = 1 + (i - 1) * COLS + ((j + 1) % COLS);
      const c = a + COLS;
      const d = b + COLS;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a piece of sea glass of radius 1: a worn, flattened pebble
function glassGeometry() {
  let g = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = 1 + 0.22 * fbm3(x * 1.7 + 3, y * 1.7, z * 1.7, 2, 5);
    p.setXYZ(i, x * n * 1.15, y * n * 0.5, z * n * 0.85);
  }
  g.computeVertexNormals();
  return g;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

// items: [{ kind: 'scallop' | 'spiral' | 'star', x, z, size, yaw, tilt, sink, color }]
// (size: radius or length in metres; tilt: rad about the shell's own axes; sink: how far
// it is pressed into the sand, as a fraction of its size)
export function buildShells({ items, heightAt }) {
  const kinds = {
    scallop: { geo: scallopGeometry(), rough: 0.42, clear: 0.55 },
    spiral: { geo: spiralGeometry(), rough: 0.5, clear: 0.4 },
    star: { geo: starGeometry(), rough: 0.7, clear: 0 },
    glass: { geo: glassGeometry(), rough: 0.32, clear: 0.6, glass: true },
  };
  const group = new THREE.Group();
  const meshes = [];
  for (const [kind, K] of Object.entries(kinds)) {
    const list = items.filter((it) => it.kind === kind);
    if (!list.length) continue;
    const mat = new THREE.MeshPhysicalMaterial({ vertexColors: !K.glass, roughness: K.rough, clearcoat: K.clear, clearcoatRoughness: 0.35, sheen: K.glass ? 0 : 0.4, sheenColor: new THREE.Color(0xffe8d8), side: K.glass ? THREE.FrontSide : THREE.DoubleSide });
    // frosted glass is lit from within a little, as light passes through it
    if (K.glass) mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.22;'); };
    if (K.glass) mat.customProgramCacheKey = () => 'sea-glass';
    const mesh = new THREE.InstancedMesh(K.geo, mat, list.length);
    list.forEach((it, i) => {
      const ground = heightAt(it.x, it.z);
      const tilt = it.tilt ?? 0.15;
      _e.set(tilt * Math.cos(it.yaw * 3), it.yaw, tilt * Math.sin(it.yaw * 3), 'YXZ');
      _q.setFromEuler(_e);
      const sz = it.size;
      _m.compose(_p.set(it.x, ground + sz * (0.02 - (it.sink ?? 0.1) * 0.5), it.z), _q, _s.set(sz, sz, sz));
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.set(it.color ?? 0xffffff));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `shells-${kind}`;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
  }
  return {
    group,
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        m.material.dispose();
        m.dispose();
      }
    },
  };
}

const SHELL_COLORS = [0xfff1e2, 0xffe3d0, 0xf6c7bd, 0xd6a4d0, 0xffc79a, 0xfff8ee];
const SPIRAL_COLORS = [0xf3e2cc, 0x8fd6d0, 0xe8b790, 0xffffff];
const STAR_COLORS = [0xff8a3d, 0xff6f5a, 0xffb347];
export const GLASS_COLORS = [0x55d9a6, 0x7cc4ff, 0xf4fbff, 0xffb45e, 0x9be7d8];

// A scatter of shells, mostly in the foreground and around the knolls: a few
// big ones near the camera (they melt into the blur) and small ones farther in.
// area: [x0, x1, z0, z1]; keepOut(x, z) true where none may lie.
export function scatterShells({ area, count, seed = 3, keepOut, heightAt, hero = [] }) {
  const R = rng(seed);
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 30) {
    const x = area[0] + R() * (area[1] - area[0]);
    const z = area[2] + R() * (area[3] - area[2]);
    if (keepOut && keepOut(x, z)) continue;
    const roll = R();
    const kind = roll < 0.58 ? 'scallop' : roll < 0.8 ? 'spiral' : roll < 0.9 ? 'glass' : 'star';
    const size = kind === 'scallop' ? 0.018 + R() * 0.02 : kind === 'spiral' ? 0.022 + R() * 0.02 : kind === 'glass' ? 0.006 + R() * 0.006 : 0.03 + R() * 0.015;
    const palette = kind === 'scallop' ? SHELL_COLORS : kind === 'spiral' ? SPIRAL_COLORS : kind === 'glass' ? GLASS_COLORS : STAR_COLORS;
    out.push({ kind, x, z, size, yaw: R() * Math.PI * 2, tilt: 0.05 + R() * (kind === 'scallop' && R() < 0.3 ? 0.9 : 0.3), sink: 0.05 + R() * 0.3, color: palette[Math.floor(R() * palette.length)] });
  }
  // hand-placed big scallops for the front of the picture
  for (const h of hero) out.push({ kind: 'scallop', tilt: 0.25, sink: 0.12, color: SHELL_COLORS[0], yaw: R() * Math.PI * 2, ...h });
  return out;
}
