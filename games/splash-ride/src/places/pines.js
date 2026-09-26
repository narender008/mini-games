// Conifers: tall pines and spruces with tapered, plated trunks and crowns
// of needle-covered branch sprays (alpha-tested cards painted in code,
// folded along their stem so they have body from every side). Branches
// spiral up the trunk at irregular heights, longer and shorter, darker near
// the trunk and lighter at the fresh tips, with a few dead grey twigs low
// down; the crown's normals are bent outwards so it shades like one rounded
// mass. A few variants are built once and scattered as instances, with a
// gentle sway in the tops.
import * as THREE from 'three';
import { rng } from '../config.js';
import { canvasTexture, instances, normalFromHeight } from './common.js';
import { makeImpostorWoods, CONIFER, texSize, addTranslucency, crownNormals, volumeNormals, mergeIndexed, gridGeometry, vertexAttr } from './foliage.js';

let shared = null;

const LIVE = 0.25;
const DEAD = 0.75;

// Branch sprays: a live one (left half) and a dead one (right half), each
// with its stem up the middle from the trunk (bottom) to the tip (top).
function branchAtlas() {
  const S = texSize(512);
  return canvasTexture(S, S, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.save();
    g.scale(w / 512, w / 512);
    const r = rng(17);
    const hsl = (h, s, l) => `hsl(${h}, ${s}%, ${l}%)`;
    // live spray: side shoots slanting towards the tip, each a dense
    // bottle-brush of needles, fresh light-green growth at the ends
    const cx = 128;
    g.strokeStyle = '#3e3022';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(cx, 512);
    g.lineTo(cx + 4, 30);
    g.stroke();
    const shoots = [];
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const y = 500 - t * 460 + (r() - 0.5) * 10;
      const len = (Math.sin(Math.min(1, t * 1.25 + 0.15) * Math.PI) * 0.8 + 0.2) * 112 * (0.75 + r() * 0.35);
      for (const s of [-1, 1]) {
        const a = (0.55 + r() * 0.35) * (1 - t * 0.3);
        shoots.push({ x: cx + t * 4, y, ex: cx + s * len * Math.cos(a) + t * 4, ey: y - len * Math.sin(a) * 1.1, t });
      }
    }
    shoots.push({ x: cx + 4, y: 90, ex: cx + 4, ey: 8, t: 1 });
    const brush = (x0, y0, x1, y1, n, len, l0, l1, wid) => {
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        const base = Math.atan2(y1 - y0, x1 - x0);
        for (const s of [-1, 1]) {
          const a = base + s * (0.7 + r() * 0.6);
          const l = len * (0.7 + r() * 0.5) * (1 - t * 0.35);
          g.strokeStyle = hsl(118 + r() * 34, 22 + r() * 16, l0 + (l1 - l0) * t + r() * 4);
          g.lineWidth = wid;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
          g.stroke();
        }
      }
    };
    // the dense dark body first, then the needles, then the fresh tips
    for (const sh of shoots) {
      g.strokeStyle = hsl(128 + r() * 16, 26, 8 + r() * 3);
      g.lineWidth = 10 + r() * 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(sh.x, sh.y);
      g.lineTo(sh.ex, sh.ey);
      g.stroke();
    }
    g.lineCap = 'butt';
    for (const sh of shoots) {
      const n = Math.hypot(sh.ex - sh.x, sh.ey - sh.y) * 0.7;
      brush(sh.x, sh.y, sh.ex, sh.ey, n, 16, 9, 16, 1.5);
    }
    for (const sh of shoots) {
      const fx = sh.x + (sh.ex - sh.x) * 0.72;
      const fy = sh.y + (sh.ey - sh.y) * 0.72;
      brush(fx, fy, sh.ex + (sh.ex - sh.x) * 0.08, sh.ey + (sh.ey - sh.y) * 0.08, 10, 11, 17, 24, 1.3);
    }
    // dead spray: bare grey twigs with a few rusty needles
    const dx = 384;
    g.strokeStyle = '#6a5c4c';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(dx, 512);
    g.lineTo(dx + 6, 60);
    g.stroke();
    for (let i = 0; i < 16; i++) {
      const t = i / 16;
      const y = 490 - t * 420;
      const len = (1 - t * 0.6) * 90 * (0.6 + r() * 0.5);
      const s = i % 2 ? 1 : -1;
      const ex = dx + s * len * 0.8;
      const ey = y - len * 0.7;
      g.strokeStyle = `rgba(${95 + r() * 30}, ${85 + r() * 20}, ${70 + r() * 15}, 1)`;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(dx + t * 6, y);
      g.lineTo(ex, ey);
      g.stroke();
      for (let k = 0; k < 6; k++) {
        const tt = r();
        const px = dx + (ex - dx) * tt;
        const py = y + (ey - y) * tt;
        g.strokeStyle = hsl(22 + r() * 12, 40, 26 + r() * 12);
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + (r() - 0.5) * 14, py + 4 + r() * 8);
        g.stroke();
      }
    }
    g.restore();
  });
}

// grey-brown bark in scaly plates with dark furrows, and its relief
function barkTextures() {
  const W = texSize(256);
  const H = texSize(512);
  const hc = document.createElement('canvas');
  hc.width = W / 2;
  hc.height = H / 2;
  const hg = hc.getContext('2d');
  const map = canvasTexture(W, H, (g) => {
    g.save();
    g.scale(W / 256, H / 512);
    hg.save();
    hg.scale(W / 512, H / 1024);
    const r = rng(9);
    g.fillStyle = '#3e3129';
    g.fillRect(0, 0, 256, 512);
    hg.fillStyle = '#303030';
    hg.fillRect(0, 0, 256, 512);
    // plates between furrows, wrapped so the tile repeats
    for (let i = 0; i < 340; i++) {
      const x = r() * 256;
      const y = r() * 512;
      const pw = 10 + r() * 22;
      const ph = 16 + r() * 40;
      const warm = r();
      const l = 60 + r() * 45;
      g.fillStyle = `rgb(${l + warm * 16}, ${l * 0.84 + warm * 4}, ${l * 0.72})`;
      hg.fillStyle = `rgb(${120 + r() * 100}, ${120 + r() * 100}, ${120 + r() * 100})`;
      for (const ox of [-256, 0, 256]) {
        for (const oy of [-512, 0, 512]) {
          g.beginPath();
          g.ellipse(x + ox, y + oy, pw / 2, ph / 2, (r() - 0.5) * 0.2, 0, Math.PI * 2);
          g.fill();
          hg.beginPath();
          hg.ellipse(x + ox, y + oy, pw / 2 - 1, ph / 2 - 1, 0, 0, Math.PI * 2);
          hg.fill();
        }
      }
    }
    // grey lichen
    for (let i = 0; i < 50; i++) {
      g.fillStyle = `rgba(150, 155, 140, ${0.1 + r() * 0.15})`;
      g.beginPath();
      g.ellipse(r() * 256, r() * 512, 3 + r() * 8, 2 + r() * 5, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    hg.restore();
  }, { repeat: true });
  return { map, normal: normalFromHeight(hc, 2.5) };
}

function materials() {
  if (shared) return shared;
  const time = { value: 0 };
  const needles = new THREE.MeshStandardMaterial({ map: branchAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.9 });
  needles.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float sway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.23 + instanceMatrix[3].z * 0.31;
#else
  float ph = 0.0;
#endif
  transformed.x += sin(uTime * 0.9 + ph) * 0.18 * sway;
  transformed.z += cos(uTime * 0.7 + ph * 1.3) * 0.12 * sway;`,
      );
    addTranslucency(sh, 0.12, 'vec3(0.8, 1.1, 0.5)', 0.25);
    volumeNormals(sh);
  };
  needles.customProgramCacheKey = () => 'pine-needles-3';
  const { map, normal } = barkTextures();
  const bark = new THREE.MeshStandardMaterial({ map, normalMap: normal, roughness: 0.93 });
  const core = new THREE.MeshStandardMaterial({ color: 0x0b130a, roughness: 1 });
  shared = { needles, bark, core, time };
  return shared;
}

// One branch spray from the trunk out along +x: folded along its stem like
// a shallow roof, drooping (and for spruce, lifting again at the tip).
function sprayCard(len, width, droop, lift, uc) {
  const segs = 3;
  return gridGeometry(segs + 1, 3, (i, j, out) => {
    const t = i / segs;
    const k = j - 1;
    const w = width * 0.5 * (0.55 + 0.45 * Math.sin(Math.min(1, t * 1.2 + 0.2) * Math.PI));
    const y = -droop * t * t * len + lift * Math.max(0, t - 0.6) * len;
    out.p.set(t * len, y - Math.abs(k) * w * 0.35, k * w);
    out.u = uc + k * 0.24;
    out.v = 0.01 + t * 0.98;
  });
}

function pineVariant(seed, kind) {
  const r = rng(seed);
  const spruce = kind === 'spruce';
  const height = spruce ? 13 + r() * 7 : 15 + r() * 8;
  const trunkR = height * 0.018;
  const trunk = new THREE.CylinderGeometry(trunkR * 0.25, trunkR, height, 7, 4);
  trunk.translate(0, height / 2 - 0.3, 0);
  const uvs = trunk.attributes.uv;
  for (let i = 0; i < uvs.count; i++) uvs.setY(i, uvs.getY(i) * height * 0.3);
  const parts = [];
  // a spruce is branched to the ground; a pine has a bare lower trunk
  const base = spruce ? height * 0.1 : height * 0.42;
  const count = spruce ? 92 : 58;
  const add = (g, y, az, t) => {
    g.rotateY(az);
    g.translate(0, y, 0);
    vertexAttr(g, 'sway', 1, (v) => (v.y / height) ** 2 * Math.min(1, Math.hypot(v.x, v.z) / 2 + 0.3));
    // each spray its own shade of green, darker in towards the trunk
    const k = 0.78 + r() * 0.3;
    const blue = 0.94 + r() * 0.14;
    vertexAttr(g, 'color', 3, (v) => {
      const out = Math.min(1, Math.hypot(v.x, v.z) / (0.3 + (1 - t) * height * 0.2));
      const c = (0.38 + 0.62 * out ** 0.8) * (0.72 + 0.28 * t) * k;
      return [c * 0.92, c, c * blue];
    });
    parts.push(g);
  };
  for (let k = 0; k < count; k++) {
    // spiral up the trunk at uneven spacing, never in tidy whorls
    const t = Math.min(1, (k + r() * 0.9) / count);
    const y = base + (height - base) * t;
    const profile = spruce ? (1 - t) * 0.24 + 0.02 : Math.sin(Math.min(1, (1 - t) * 1.3) * Math.PI * 0.6) * 0.2 + 0.03;
    const reach = (profile * height + 0.3) * (0.7 + r() * 0.5);
    const b = sprayCard(reach, reach * 0.85 + 0.45, spruce ? 0.28 + r() * 0.15 : 0.12 + r() * 0.12, spruce ? 0.25 : 0.1, LIVE);
    b.rotateX((r() - 0.5) * 0.7);
    b.rotateZ(spruce ? -0.1 - r() * 0.15 + t * 0.2 : 0.05 + r() * 0.2);
    add(b, y, k * 2.39996 + (r() - 0.5) * 0.6, t);
  }
  // a tuft at the leader
  for (let k = 0; k < 3; k++) {
    const b = sprayCard(1.1, 0.8, -0.1, 0, LIVE);
    b.rotateZ(1.2 + r() * 0.2);
    add(b, height - 1.1, k * 2.1, 1);
  }
  // dead grey twigs low on the trunk, in the shade
  const dead = spruce ? 5 : 8;
  for (let k = 0; k < dead; k++) {
    const y = spruce ? height * (0.04 + r() * 0.1) : height * (0.18 + r() * 0.24);
    const len = 0.7 + r() * 1.1;
    const b = sprayCard(len, len * 0.8, 0.05, 0, DEAD);
    b.rotateZ(-0.15 - r() * 0.35);
    add(b, y, r() * Math.PI * 2, 0.5);
  }
  const crown = mergeIndexed(parts);
  crownNormals(crown, (v, out) => out.set(0, Math.max(base, v.y - 0.5), 0), 0.7, 0.2, true);
  // a dark inner cone behind the sprays so the crown reads dense, not see-through
  const coreH = height - base;
  const core = new THREE.ConeGeometry(spruce ? height * 0.075 : height * 0.06, coreH * 0.85, 9, 1, true);
  core.translate(0, base + coreH * 0.47, 0);
  return { trunk, crown, core, height };
}

// Plant conifers at spots [{ x, y, z, ry, s }]
export function makePines(spots, seed = 1) {
  const mats = materials();
  const group = new THREE.Group();
  group.name = 'pines';
  const variants = [pineVariant(seed * 7 + 1, 'pine'), pineVariant(seed * 7 + 2, 'spruce'), pineVariant(seed * 7 + 3, 'pine'), pineVariant(seed * 7 + 4, 'spruce')];
  variants.forEach((v, k) => {
    const mine = spots.filter((_, i) => i % variants.length === k);
    if (!mine.length) return;
    group.add(instances(v.trunk, mats.bark, mine));
    group.add(instances(v.crown, mats.needles, mine));
    group.add(instances(v.core, mats.core, mine, { shadow: false }));
  });
  group.userData.update = (t) => {
    mats.time.value = t;
  };
  return group;
}

// Distant forest: thousands of painted conifer impostors (spruce, fir, pine
// and old broad spruce) that turn to face the camera, with varied greens,
// for the hillsides behind the shore where the detailed pines would cost too
// much. One draw per quarter of the map, no shadows.
export function makeForest(spots, seed = 1) {
  const r = rng(seed * 13 + 5);
  const kinds = spots.map(() => {
    const k = r();
    return k < 0.36 ? CONIFER.spruce : k < 0.6 ? CONIFER.fir : k < 0.85 ? CONIFER.pine : CONIFER.broad;
  });
  const group = makeImpostorWoods(spots, {
    name: 'forest',
    kind: (s, i) => kinds[i],
    size: (s, kind) => {
      const h = 16.5 * (s.s ?? 1) * (s.sy ?? 1) * (kind === CONIFER.fir ? 0.92 : 1);
      return [h, h * 0.5];
    },
    tint: (c) => c.setHSL(0.2 + r() * 0.1, 0.2 + r() * 0.25, 0.62 + r() * 0.3),
  });
  return group;
}
