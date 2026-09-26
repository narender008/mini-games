// Coconut palms: a leaning, curving trunk ringed with old leaf scars (bark
// colour and relief painted in code) that swells into a bulb at its foot, a
// fibrous boot under the crown, and a crown of feathery fronds. Each frond
// is a rachis with rows of leaflets hanging down either side (an alpha-
// tested leaflet painting on a folded strip, so the leaflets droop in 3D),
// young fronds standing up, old ones arching over, dead brown ones hanging
// against the trunk, with a cluster of coconuts. Sunlight glows through the
// leaflets seen against the sky. A few variants are built once and
// scattered as instances; the fronds sway in the breeze.
import * as THREE from 'three';
import { rng } from '../config.js';
import { canvasTexture, instances, normalFromHeight } from './common.js';
import { texSize, qualityTier, addTranslucency, crownNormals, mergeIndexed, gridGeometry, vertexAttr } from './foliage.js';

let shared = null;

// atlas regions (u): green frond centred on 0.25, dead frond on 0.75; solid
// patches along the bottom edge (v < 0.02) for coconuts and the leaf boot
const GREEN = 0.25;
const DEAD = 0.75;
const NUT_GREEN = [0.03, 0.01];
const NUT_BROWN = [0.08, 0.01];
const FIBRE = [0.44, 0.01];

function frondAtlas() {
  const S = texSize(1024);
  return canvasTexture(S, S, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save();
    g.scale(w / 1024, h / 1024);
    const r = rng(7);
    const W = 1024;
    const H = 1024;
    // solid patches
    const patch = ([u], col) => {
      g.fillStyle = col;
      g.fillRect(u * W - 18, H - 18, 36, 18);
    };
    patch(NUT_GREEN, '#6f7a2e');
    patch(NUT_BROWN, '#6a4a2a');
    patch(FIBRE, '#5a4632');

    const half = (cu, dead) => {
      const cx = cu * W;
      const reach = 238;
      // leaflets up both sides of the rachis, slanting towards the tip
      const n = 88;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const y = H * (1 - (0.075 + t * 0.9));
        for (const s of [-1, 1]) {
          if (r() < (dead ? 0.16 : 0.04)) continue; // a missing leaflet
          const tip = t > 0.82 ? 1 - (t - 0.82) * 2.6 : 1;
          const base = t < 0.08 ? 0.55 + t * 5.6 : 1;
          let len = reach * tip * base * (0.8 + r() * 0.2);
          const torn = r() < (dead ? 0.3 : 0.1);
          if (torn) len *= 0.55 + r() * 0.3;
          const slant = (dead ? 0.55 : 0.32) + t * 0.35 + (r() - 0.5) * 0.12;
          const ex = cx + s * len * Math.cos(slant);
          const ey = y - len * Math.sin(slant);
          const bw = (dead ? 6 : 8) + r() * 3;
          // the blade: widest a third of the way out, curving slightly
          const mx = cx + s * len * 0.4 * Math.cos(slant - 0.08);
          const my = y - len * 0.4 * Math.sin(slant - 0.08);
          let hue;
          let sat;
          let light;
          if (dead) {
            hue = 26 + r() * 14;
            sat = 28 + r() * 18;
            light = 28 + r() * 14;
          } else {
            hue = 74 + r() * 20 - t * 6;
            sat = 42 + r() * 20;
            light = 25 + r() * 10 + (1 - t) * 3;
          }
          g.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
          g.beginPath();
          g.moveTo(cx + s * 3, y + bw * 0.5);
          g.quadraticCurveTo(mx, my + bw * 0.6, ex, ey);
          g.quadraticCurveTo(mx, my - bw * 0.6, cx + s * 3, y - bw * 0.5);
          g.closePath();
          g.fill();
          // midrib catching the light
          g.strokeStyle = dead ? 'rgba(200, 170, 120, 0.3)' : 'rgba(215, 225, 140, 0.35)';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(cx + s * 3, y);
          g.quadraticCurveTo(mx, my, ex, ey);
          g.stroke();
          // dry, yellow-brown tips here and there
          if (!dead && r() < 0.14) {
            g.strokeStyle = `hsl(${38 + r() * 12}, 45%, ${36 + r() * 10}%)`;
            g.lineWidth = bw * 0.5;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(cx + s * len * 0.8 * Math.cos(slant), y - len * 0.8 * Math.sin(slant));
            g.lineTo(ex, ey);
            g.stroke();
            g.lineCap = 'butt';
          }
          // a split end
          if (torn && r() < 0.5) {
            g.strokeStyle = g.fillStyle;
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(ex, ey);
            g.lineTo(ex + s * 18 * Math.cos(slant + 0.3), ey - 18 * Math.sin(slant + 0.3));
            g.stroke();
          }
        }
      }
      // the rachis, thick at the base and tapering to the tip
      const col = dead ? ['#8a6a44', '#6a5034'] : ['#a6a260', '#7c8440'];
      g.fillStyle = col[1];
      g.beginPath();
      g.moveTo(cx - 9, H);
      g.lineTo(cx - 2, H * 0.02);
      g.lineTo(cx + 2, H * 0.02);
      g.lineTo(cx + 9, H);
      g.fill();
      g.fillStyle = col[0];
      g.beginPath();
      g.moveTo(cx - 4, H);
      g.lineTo(cx - 0.8, H * 0.02);
      g.lineTo(cx + 1, H * 0.02);
      g.lineTo(cx + 3, H);
      g.fill();
    };
    half(GREEN, false);
    half(DEAD, true);
    g.restore();
  });
}

// ringed palm bark: grey-brown, fine vertical cracks, a leaf-scar ring
// every 9 cm or so with a pale lip above it; plus the matching relief
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
    const r = rng(3);
    g.fillStyle = '#857a6c';
    g.fillRect(0, 0, 256, 512);
    hg.fillStyle = '#808080';
    hg.fillRect(0, 0, 256, 512);
    // weathering blotches and cracks
    for (let i = 0; i < 900; i++) {
      const x = r() * 256;
      const y = r() * 512;
      const l = 40 + r() * 40;
      g.fillStyle = `rgba(${l + 30}, ${l + 20}, ${l + 8}, ${0.08 + r() * 0.14})`;
      g.fillRect(x, y, 2 + r() * 6, 3 + r() * 14);
    }
    for (let i = 0; i < 220; i++) {
      const x = r() * 256;
      const y = r() * 512;
      const len = 6 + r() * 26;
      g.fillStyle = `rgba(50, 42, 34, ${0.25 + r() * 0.3})`;
      g.fillRect(x, y, 1, len);
      hg.fillStyle = 'rgba(40, 40, 40, 0.5)';
      hg.fillRect(x, y, 1.2, len);
    }
    // pale lichen patches
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(190, 186, 170, ${0.08 + r() * 0.12})`;
      g.beginPath();
      g.ellipse(r() * 256, r() * 512, 4 + r() * 10, 3 + r() * 6, 0, 0, Math.PI * 2);
      g.fill();
    }
    // leaf-scar rings (18 per tile so the tile repeats seamlessly)
    const rings = 18;
    for (let j = 0; j < rings; j++) {
      const y0 = ((j + 0.5 + (r() - 0.5) * 0.3) * 512) / rings;
      const k = 1 + Math.floor(r() * 2);
      const amp = 1.5 + r() * 2.5;
      const ph = r() * 6.28;
      const ring = (ctx, dy, col, wid) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = wid;
        ctx.beginPath();
        for (let x = 0; x <= 256; x += 8) {
          const y = y0 + dy + Math.sin((x / 256) * Math.PI * 2 * k + ph) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      ring(g, 0, `rgba(48, 40, 32, ${0.55 + r() * 0.25})`, 2.2 + r() * 1.5);
      ring(g, -3, 'rgba(200, 188, 165, 0.35)', 2);
      ring(g, 4, 'rgba(60, 50, 40, 0.15)', 5);
      ring(hg, 0, '#202020', 4);
      ring(hg, -4, '#c8c8c8', 4);
    }
    g.restore();
    hg.restore();
  }, { repeat: true });
  const normal = normalFromHeight(hc, 3);
  return { map, normal };
}

function materials() {
  if (shared) return shared;
  const time = { value: 0 };
  const frond = new THREE.MeshStandardMaterial({
    map: frondAtlas(),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.55,
    metalness: 0,
  });
  // sway: frond tips move most, each palm with its own phase
  frond.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float sway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
#else
  float ph = 0.0;
#endif
  float gust = 0.6 + 0.4 * sin(uTime * 0.31 + ph * 0.5);
  transformed.x += sin(uTime * 1.35 + ph + position.y * 0.4) * 0.14 * sway * gust;
  transformed.z += cos(uTime * 1.05 + ph * 1.3) * 0.1 * sway * gust;
  transformed.y += sin(uTime * 2.1 + ph + position.x * 1.7 + position.z) * 0.06 * sway * sway;`,
      );
    addTranslucency(sh, 0.75);
  };
  frond.customProgramCacheKey = () => 'palm-frond-2';
  const { map, normal } = barkTextures();
  const bark = new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(1.4, 1.4), vertexColors: true, roughness: 0.92, metalness: 0 });
  shared = { frond, bark, time };
  return shared;
}

// One frond from the origin along -z: a rachis that rises at elevation a0
// and bends down at kb rad/m, with leaflets hanging theta0..theta1 below the
// horizontal on either side. uc picks the green or dead painting.
function frondGeometry({ length, span, a0, kb, theta0, theta1, twist, uc, shade, swayK }) {
  // one segment fewer below high keeps medium and low phones lighter
  const segs = qualityTier() === 'high' ? 7 : 6;
  const rows = [];
  const p = new THREE.Vector3();
  let a = a0;
  const ds = length / segs;
  for (let i = 0; i <= segs; i++) {
    rows.push({ p: p.clone(), a });
    p.y += Math.sin(a) * ds;
    p.z -= Math.cos(a) * ds;
    a = Math.max(-1.45, a - kb * ds);
  }
  const X = new THREE.Vector3(1, 0, 0);
  const D = new THREE.Vector3();
  const d1 = new THREE.Vector3();
  const d2 = new THREE.Vector3();
  const geo = gridGeometry(segs + 1, 5, (i, j, out) => {
    const t = i / segs;
    const row = rows[i];
    // "down" across the rachis, pulled towards gravity
    D.set(0, -Math.cos(row.a), -Math.sin(row.a)).add(new THREE.Vector3(0, -0.6, 0)).normalize();
    const k = j - 2;
    const s = Math.sign(k);
    const gw = span * (0.4 + 0.6 * Math.sqrt(Math.sin(Math.min(1, t * 1.08 + 0.04) * Math.PI))) * (t < 0.06 ? 0.4 : 1);
    const th = theta0 + (theta1 - theta0) * t + s * twist * t;
    d1.copy(X).multiplyScalar(s * Math.cos(th)).addScaledVector(D, Math.sin(th));
    d2.copy(X).multiplyScalar(s * Math.cos(th + 0.45)).addScaledVector(D, Math.sin(th + 0.45));
    out.p.copy(row.p);
    if (k !== 0) out.p.addScaledVector(d1, gw * 0.5);
    if (Math.abs(k) === 2) out.p.addScaledVector(d2, gw * 0.5);
    out.u = uc + k * 0.119;
    out.v = 0.03 + t * 0.96;
  });
  // shade: darker near the crown's heart
  vertexAttr(geo, 'color', 3, (v, i) => {
    const t = Math.floor(i / 5) / segs;
    const c = shade * (0.55 + 0.45 * Math.min(1, t * 2.2));
    return [c, c, c];
  });
  vertexAttr(geo, 'sway', 1, (v, i) => {
    const t = Math.floor(i / 5) / segs;
    return t * t * swayK;
  });
  return geo;
}

// a solid-coloured part (coconut, fibre boot) from one texel of the atlas
function solid(geo, uv, shade) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) a.set(uv, i * 2);
  geo.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(shade), 3));
  geo.setAttribute('sway', new THREE.BufferAttribute(new Float32Array(n), 1));
  if (!geo.index) {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return geo;
}

function palmVariant(seed) {
  const r = rng(seed);
  const height = 6.2 + r() * 3.8;
  const lean = 0.8 + r() * 2.2;
  const wob = (r() - 0.5) * 0.6;
  // trunk centreline: leaning hard at the foot, straightening towards the crown
  const centre = (t, out) => out.set(lean * (1.7 * t - 0.7 * t * t), -0.4 + t * (height + 0.4), wob * Math.sin(t * Math.PI));
  const rad = (t) => 0.15 * (1 - 0.28 * t) * (1 + 0.75 * Math.exp(-t * 16)) + 0.02 * Math.exp(-(1 - t) * 14);
  const sides = 8;
  const rows = 15;
  const c = new THREE.Vector3();
  const c2 = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const nx = new THREE.Vector3();
  const nz = new THREE.Vector3();
  // arc length for the bark rings
  const arc = [0];
  for (let i = 1; i < rows; i++) {
    centre((i - 1) / (rows - 1), c);
    centre(i / (rows - 1), c2);
    arc.push(arc[i - 1] + c.distanceTo(c2));
  }
  const trunk = gridGeometry(rows, sides + 1, (i, j, out) => {
    const t = i / (rows - 1);
    centre(t, c);
    centre(Math.min(1, t + 0.02), c2);
    centre(Math.max(0, t - 0.02), tan);
    tan.subVectors(c2, tan).normalize();
    nx.set(1, 0, 0).addScaledVector(tan, -tan.x).normalize();
    nz.crossVectors(nx, tan).normalize();
    const a = (j / sides) * Math.PI * 2;
    const rr = rad(t) * (1 + (i === 0 ? 0.25 : 0));
    out.p.copy(c).addScaledVector(nx, Math.cos(a) * rr).addScaledVector(nz, Math.sin(a) * rr);
    out.u = j / sides;
    out.v = arc[i] / 1.6;
  });
  vertexAttr(trunk, 'color', 3, (v) => {
    const t = (v.y + 0.4) / (height + 0.4);
    const k = 0.82 + 0.18 * Math.min(1, t * 6) - 0.3 * Math.max(0, (t - 0.9) * 10);
    return [k, k * 0.98, k * 0.95];
  });
  const top = centre(1, new THREE.Vector3());
  const parts = [];
  // fibrous boot of old leaf bases under the crown
  const boot = new THREE.CylinderGeometry(0.2, 0.15, 0.8, 8, 1, true);
  boot.translate(top.x, top.y - 0.25, top.z);
  parts.push(solid(boot, FIBRE, 0.7));
  // fronds: a few young ones standing up, a full ring arching over, old ones
  // bowed low, and dead brown ones hanging against the trunk
  const tiers = [
    { n: 4, len: [2.2, 2.8], a0: [0.9, 1.25], kb: [0.08, 0.16], th: [0.1, 0.35], shade: 1, drop: 0 },
    { n: 8, len: [3.3, 4.2], a0: [0.35, 0.7], kb: [0.3, 0.42], th: [0.35, 0.85], shade: 0.95, drop: 0.08 },
    { n: 5, len: [3.2, 4.0], a0: [-0.05, 0.25], kb: [0.32, 0.45], th: [0.55, 1.05], shade: 0.8, drop: 0.2 },
    { n: 3, len: [2.5, 3.1], a0: [-1.25, -0.95], kb: [0.02, 0.1], th: [1.0, 1.3], shade: 0.75, drop: 0.35, dead: true },
  ];
  let k = 0;
  for (const tier of tiers) {
    for (let i = 0; i < tier.n; i++, k++) {
      const pick = ([lo, hi]) => lo + r() * (hi - lo);
      const f = frondGeometry({
        length: pick(tier.len),
        span: tier.dead ? 0.55 : 0.85 + r() * 0.2,
        a0: pick(tier.a0),
        kb: pick(tier.kb),
        theta0: tier.th[0],
        theta1: tier.th[1],
        twist: (r() - 0.5) * 0.5,
        uc: tier.dead ? DEAD : GREEN,
        shade: tier.shade * (0.9 + r() * 0.1),
        swayK: tier.dead ? 0.35 : 1,
      });
      const az = k * 2.39996 + (r() - 0.5) * 0.35;
      f.rotateY(az);
      f.translate(top.x - Math.sin(az) * 0.14, top.y + 0.05 - tier.drop, top.z - Math.cos(az) * 0.14);
      parts.push(f);
    }
  }
  // coconuts clustered under the crown
  const nuts = 4 + Math.floor(r() * 4);
  for (let i = 0; i < nuts; i++) {
    const s = new THREE.IcosahedronGeometry(0.12 + r() * 0.03, 0);
    s.scale(1, 1.18, 1);
    const pa = s.attributes.position;
    const nn = s.attributes.normal;
    for (let v = 0; v < pa.count; v++) {
      c.fromBufferAttribute(pa, v).normalize();
      nn.setXYZ(v, c.x, c.y, c.z);
    }
    const a = (i / nuts) * Math.PI * 2 + r() * 0.6;
    const d = 0.2 + r() * 0.08;
    s.rotateZ((r() - 0.5) * 0.8);
    s.translate(top.x + Math.cos(a) * d, top.y - 0.3 - r() * 0.22, top.z + Math.sin(a) * d);
    parts.push(solid(s, r() < 0.7 ? NUT_GREEN : NUT_BROWN, 0.85));
  }
  // bend the crown's normals outwards so it shades as one rounded mass
  const crown = mergeIndexed(parts.map((g) => {
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'sway'].includes(n)) g.deleteAttribute(n);
    return g;
  }));
  crownNormals(crown, (v, out) => out.set(top.x, top.y - 0.6, top.z), 0.35, 0.1);
  return { trunk, crown, height };
}

// Plant palms at the given spots: [{ x, y, z, ry, s }]
export function makePalms(spots, seed = 1) {
  const mats = materials();
  const group = new THREE.Group();
  group.name = 'palms';
  const variants = [palmVariant(seed * 11 + 1), palmVariant(seed * 11 + 2), palmVariant(seed * 11 + 3)];
  variants.forEach((v, k) => {
    const mine = spots.filter((_, i) => i % variants.length === k);
    if (!mine.length) return;
    group.add(instances(v.trunk, mats.bark, mine));
    group.add(instances(v.crown, mats.frond, mine));
  });
  group.userData.update = (t) => {
    mats.time.value = t;
  };
  return group;
}
