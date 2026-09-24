// Butterfly and moth species at real size, and their shared models: a furry
// body, legs, antennae and proboscis, and four painted wings. Everything is
// built once per species (on first use) and shared by every individual.
import * as THREE from 'three';
import { lathe, ellipsoid, tube, curve, merge, paint, mirrorX } from './geo.js';
import { furGeometry, furMaterial } from './fur.js';
import { buildAtlas, wingGeometry, wingMaterial } from './wings.js';
import { WING_SPECS } from './patterns.js';
import { LUNA_WINGS, LUNA } from './moth.js';

// span: wingspan in metres. flap: wing beats per second in flight. glide:
// how often it glides. speed: cruising m/s. erratic: how fluttery the path
// is. bask: how far it opens its wings while perched (0 closed, 1 flat).
export const BUTTERFLY_KINDS = {
  monarch: {
    span: 0.095,
    flap: 8,
    glide: 0.55,
    speed: 0.5,
    erratic: 0.45,
    bask: 0.85,
    body: { hair: '#1c1714', spots: '#f3efe6', spot: 'monarch', antenna: '#15110f', club: '#15110f', legs: '#1a1512', eye: '#2a2a22' },
  },
  peacock: {
    span: 0.062,
    flap: 10,
    glide: 0.25,
    speed: 0.48,
    erratic: 0.7,
    bask: 1,
    body: { hair: '#2e211b', hair2: '#4a342a', antenna: '#1c1512', club: '#d9d0c0', legs: '#2a1f1a', eye: '#2c2620' },
  },
  'red-admiral': {
    span: 0.064,
    flap: 10,
    glide: 0.35,
    speed: 0.52,
    erratic: 0.6,
    bask: 0.95,
    body: { hair: '#231c17', hair2: '#4a3e30', antenna: '#1a1512', club: '#ece6d8', legs: '#2a221c', eye: '#302a22' },
  },
  'common-blue': {
    span: 0.032,
    flap: 13,
    glide: 0.05,
    speed: 0.36,
    erratic: 1,
    bask: 0.8,
    body: { hair: '#6c78a8', hair2: '#b8bed4', antenna: '#1c1c1c', ring: '#f0f0ea', club: '#c47a3a', legs: '#d8d8d0', eye: '#2a2a2c' },
  },
  brimstone: {
    span: 0.06,
    flap: 9,
    glide: 0.25,
    speed: 0.5,
    erratic: 0.6,
    bask: 0.2,
    body: { hair: '#c8c49a', hair2: '#e8e4c2', antenna: '#b24a5c', club: '#a8404e', legs: '#c86070', eye: '#4a5030' },
  },
  'cabbage-white': {
    span: 0.05,
    flap: 11,
    glide: 0.1,
    speed: 0.46,
    erratic: 0.9,
    bask: 0.5,
    body: { hair: '#3a3a38', hair2: '#d8d8d0', antenna: '#1e1e1c', ring: '#f2f2ec', club: '#2a2a28', legs: '#cfcfc8', eye: '#3a4028' },
  },
  swallowtail: {
    span: 0.085,
    flap: 8,
    glide: 0.5,
    speed: 0.58,
    erratic: 0.5,
    bask: 0.9,
    body: { hair: '#1c1a14', stripes: '#e9c94c', antenna: '#1a1814', club: '#1a1814', legs: '#1c1a14', eye: '#2a2a22' },
  },
  'luna-moth': LUNA,
};

const WINGS = { ...WING_SPECS, 'luna-moth': LUNA_WINGS };

const cache = new Map();

function tierOf(quality) {
  return quality?.tier || 'high';
}

// ------------------------------------------------------------------ body

// Head, thorax and abdomen along +z (head forward), hinge of the wings at
// the origin. Units are metres; F is the forewing length.
function bodyPieces(spec, F) {
  const b = spec.body;
  const moth = !!spec.moth;
  const k = moth ? 1.35 : 1; // moths are stouter and furrier
  const hairC = new THREE.Color(b.hair);
  const hair2 = new THREE.Color(b.hair2 || b.hair);
  const spotC = new THREE.Color(b.spots || '#ffffff');
  const stripeC = new THREE.Color(b.stripes || b.hair);
  const colorFn = (x, y, z, out) => {
    const fx = x / F;
    const fy = y / F;
    const fz = z / F;
    out.copy(hairC);
    // paler, silkier hair on the thorax top and sides
    if (fz > -0.09 && fz < 0.14) out.lerp(hair2, THREE.MathUtils.smoothstep(fy, -0.06, 0.02) * 0.8);
    // faint segment rings on the abdomen
    if (fz < -0.08) {
      const ring = (((-fz - 0.08) / 0.062) % 1 + 1) % 1;
      out.multiplyScalar(0.82 + 0.18 * THREE.MathUtils.smoothstep(ring, 0.0, 0.35));
      if (b.stripes) out.lerp(stripeC, THREE.MathUtils.smoothstep(Math.abs(fx) / (Math.abs(fy + 0.035) + 1e-3), 0.9, 1.6) * 0.9);
    }
    if (b.stripes && fz > -0.09 && fz < 0.14 && Math.abs(fx) > 0.04 && fy < 0.0) out.lerp(stripeC, 0.8);
    if (b.spot === 'monarch') {
      // white dots on the head and the sides of the thorax
      const dots = [
        [0.03, -0.01, 0.17],
        [-0.03, -0.01, 0.17],
        [0.045, -0.02, 0.06],
        [-0.045, -0.02, 0.06],
        [0.05, -0.05, 0.0],
        [-0.05, -0.05, 0.0],
        [0.03, -0.075, 0.08],
        [-0.03, -0.075, 0.08],
        [0.0, -0.08, 0.14],
      ];
      for (const d of dots) {
        const dd = (fx - d[0]) ** 2 + (fy - d[1]) ** 2 + (fz - d[2]) ** 2;
        if (dd < 0.00012) out.lerp(spotC, 0.85);
      }
      if (fz < -0.1 && fy < -0.06) out.lerp(spotC, 0.35);
    }
    return out;
  };
  const cy = -0.035 * F;
  const head = lathe({ z0: 0.118 * F, z1: 0.195 * F, radius: (t) => Math.sqrt(Math.max(0, Math.sin(Math.PI * t))) * 0.042 * F * k, ry: 0.95, y: cy - 0.004 * F, segs: 14, rings: 10 });
  const thorax = lathe({ z0: -0.085 * F, z1: 0.135 * F, radius: (t) => Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.62) * 0.06 * F * k, ry: 1.02, y: cy, segs: 18, rings: 14 });
  const abL = moth ? 0.44 : 0.46;
  const abdomen = lathe({
    z0: -(0.06 + abL) * F,
    z1: -0.06 * F,
    radius: (t) => 0.043 * F * k * Math.pow(t, 0.42) * (1 - Math.pow(t, 7) * 0.62),
    ry: 0.94,
    sag: (t) => -0.03 * F * (1 - t) * (1 - t),
    y: cy - 0.008 * F,
    segs: 16,
    rings: 18,
  });
  // hairy palps jutting forward under the head
  const palpL = lathe({ z0: 0.17 * F, z1: 0.235 * F, radius: (t) => Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)) * 0.011 * F, x: 0.011 * F, y: cy - 0.03 * F, segs: 8, rings: 6 });
  const palpR = mirrorX(palpL);
  const hairM = moth ? 2.4 : 1;
  const pieces = [
    Object.assign(paint(head, colorFn), { hair: 0.011 * F * hairM, circ: 0.26 * F, len: 0.08 * F, droop: 0.3 }),
    Object.assign(paint(thorax, colorFn), { hair: 0.022 * F * hairM, circ: 0.37 * F, len: 0.22 * F, droop: 0.7 }),
    Object.assign(paint(abdomen, colorFn), { hair: 0.007 * F * hairM * (moth ? 1.6 : 1), circ: 0.26 * F, len: abL * F, droop: 0.8 }),
    Object.assign(paint(palpL, colorFn), { hair: 0.008 * F * hairM, circ: 0.07 * F, len: 0.06 * F, droop: 0.2 }),
    Object.assign(paint(palpR, colorFn), { hair: 0.008 * F * hairM, circ: 0.07 * F, len: 0.06 * F, droop: 0.2 }),
  ];
  const spacing = Math.max(0.00006, F * 0.0026);
  for (const p of pieces) p.spacing = spacing;
  return pieces;
}

// Legs, antennae, eyes and proboscis. pose 'perch' stands on its legs with
// the proboscis down; 'fly' tucks the legs and coils the proboscis.
function appendagePieces(spec, F, pose) {
  const b = spec.body;
  const cy = -0.035 * F;
  const pieces = [];
  const V = (x, y, z) => new THREE.Vector3(x * F, y * F, z * F);
  const colored = (piece, hex) => paint(piece, (x, y, z, out) => out.set(hex));
  // eyes: large, dark, softly glossy compound eyes
  const eye = ellipsoid(0.03 * F, cy + 0.002 * F, 0.168 * F, 0.024 * F, 0.028 * F, 0.024 * F, 12, 8);
  pieces.push(colored(eye, b.eye), colored(mirrorX(eye), b.eye));
  // antennae
  const antLen = spec.moth ? 0.42 : 0.5;
  const antPts = curve(
    [
      [0.012, 0.0, 0.18],
      [0.05, 0.06, 0.18 + antLen * 0.35],
      [0.09, 0.11, 0.18 + antLen * 0.7],
      [0.12, 0.14, 0.18 + antLen],
    ].map((p) => V(p[0], p[1] + cy / F, p[2])),
    14,
  );
  if (spec.moth) {
    // feathery (bipectinate) antenna: a flat, leaf-shaped comb
    const rib = featherRibbon(antPts, 0.06 * F);
    pieces.push(colored(rib, b.antenna), colored(mirrorX(rib), b.antenna));
  } else {
    const ant = tube(antPts, (t) => (t > 0.78 ? 0.0055 + 0.0065 * Math.sin(Math.min(1, (t - 0.78) / 0.17) * Math.PI * 0.5) * (t > 0.96 ? (1 - t) / 0.04 : 1) : 0.0055 - t * 0.001) * F, 5);
    const ringC = new THREE.Color(b.ring || b.antenna);
    const antC = new THREE.Color(b.antenna);
    const clubC = new THREE.Color(b.club || b.antenna);
    paint(ant, (x, y, z, out) => {
      // ringed shafts (blues and whites), coloured clubs
      const along = (z / F - 0.18) / antLen;
      if (along > 0.82) out.copy(clubC);
      else out.copy(b.ring && Math.floor(along * 26) % 2 ? ringC : antC);
      return out;
    });
    pieces.push(ant, mirrorX(ant));
  }
  // legs: walking legs (mid, hind) and the small folded forelegs
  const legC = b.legs;
  const leg = (pts, r) => colored(tube(curve(pts.map((p) => V(p[0], p[1], p[2])), 10), (t) => r * F * (1 - t * 0.45), 4), legC);
  const add = (piece) => pieces.push(piece, mirrorX(piece));
  if (pose === 'perch') {
    add(leg([[0.02, -0.08, 0.1], [0.045, -0.1, 0.14], [0.04, -0.12, 0.17]], 0.007));
    add(leg([[0.025, -0.085, 0.035], [0.085, -0.07, 0.075], [0.11, -0.14, 0.11], [0.12, -0.2, 0.14]], 0.0075));
    add(leg([[0.025, -0.085, -0.03], [0.085, -0.07, -0.055], [0.11, -0.14, -0.095], [0.12, -0.2, -0.14]], 0.0075));
  } else {
    add(leg([[0.02, -0.08, 0.1], [0.04, -0.1, 0.13], [0.03, -0.11, 0.16]], 0.007));
    add(leg([[0.025, -0.085, 0.035], [0.06, -0.11, 0.0], [0.05, -0.12, -0.08]], 0.007));
    add(leg([[0.025, -0.085, -0.03], [0.055, -0.1, -0.08], [0.04, -0.1, -0.17]], 0.007));
  }
  // proboscis: coiled like a watch spring in flight, reaching down to sip
  if (!spec.moth) {
    const pc = '#3a2a1c';
    if (pose === 'perch') {
      pieces.push(colored(tube(curve([V(0, -0.075, 0.2), V(0, -0.12, 0.23), V(0, -0.17, 0.235), V(0, -0.205, 0.225)], 10), 0.0035 * F, 4), pc));
    } else {
      const coil = [];
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 3.2;
        const r = 0.022 * (1 - k / 30);
        coil.push(V(0, -0.075 - r + r * Math.cos(a), 0.2 + r * Math.sin(a)));
      }
      pieces.push(colored(tube(coil, 0.0035 * F, 4), pc));
    }
  }
  return pieces;
}

// flat comb for a moth's feathery antenna
function featherRibbon(pts, width) {
  const p = [];
  const n = [];
  const uv = [];
  const i = [];
  const count = pts.length;
  for (let k = 0; k < count; k++) {
    const t = k / (count - 1);
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.02)), 0.8) * 0.5;
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(count - 1, k + 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const sx = -dz / l;
    const sz = dx / l;
    p.push(pts[k].x + sx * w, pts[k].y, pts[k].z + sz * w, pts[k].x - sx * w, pts[k].y, pts[k].z - sz * w);
    n.push(0, 1, 0, 0, 1, 0);
    uv.push(0, t, 1, t);
    if (k < count - 1) {
      const o = k * 2;
      i.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  }
  return { p, n, uv, i };
}

// ------------------------------------------------------------------ assets

// The shared model parts of one species, built on first use.
export function butterflyAssets(kind, quality) {
  if (cache.has(kind)) return cache.get(kind);
  const spec = BUTTERFLY_KINDS[kind];
  const ws = WINGS[kind];
  const tier = tierOf(quality);
  const F = spec.span / 2.03;
  const atlas = buildAtlas(ws, tier === 'high' ? 1024 : 512);
  const wingMat = wingMaterial(atlas, { roughness: spec.wingRough ?? 0.7, translucency: spec.translucency ?? 1, sheen: spec.sheen ?? 0.04 });
  const shells = spec.moth ? (tier === 'low' ? 5 : 9) : tier === 'low' ? 3 : 6;
  const body = merge(furGeometry(bodyPieces(spec, F), shells));
  const bodyMat = furMaterial({ roughness: 0.85, rootDark: 0.72, tipLight: spec.moth ? 0.12 : 0.04, sheen: spec.moth ? 0.5 : 0.2 });
  const appMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: spec.moth ? 0.85 : 0.55, metalness: 0, side: spec.moth ? THREE.DoubleSide : THREE.FrontSide });
  const a = {
    F,
    atlas,
    wingMat,
    fore: wingGeometry(ws, 'fore', F),
    hind: wingGeometry(ws, 'hind', F),
    body,
    bodyMat,
    appPerch: merge(appendagePieces(spec, F, 'perch')),
    appFly: merge(appendagePieces(spec, F, 'fly')),
    appMat,
    hingeX: 0.03 * F,
    stand: 0.2 * F, // hinge height above the surface when perched
    radius: spec.span * 0.6,
  };
  cache.set(kind, a);
  return a;
}

// Builds a species' assets ahead of time (texture painting takes a moment).
export function prewarmButterfly(kind, quality) {
  butterflyAssets(kind, quality);
}
