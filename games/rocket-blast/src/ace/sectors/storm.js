// Sector 2, the Ion Storm: flying high over a dark storm system, looking
// down through stacked cloud decks that stream past below. Lightning flashes
// light the clouds from inside (strongest in the deck it fires in, spilling
// onto the others), and now and then a forked bolt crackles between decks
// at the side of the screen. Ion sparks and rain streaks race past.
//
// Layers, far to near (all scroll down at one world speed; perspective
// gives the parallax):
//   floor    an opaque, very dark cloud floor far below
//   decks    three transparent cloud planes; billowy domain-warped noise,
//            shaded from its own slope by a cold moon, thinning to the sides
//            the nearer they are so the middle stays open and dark
//   bolt     a jagged additive ribbon with branches, rebuilt per strike
//   sparks   cyan ion motes and faint rain streaks
// `flash` (0..1) is the current strike brightness, for the screen wash and
// for anything else that wants to flicker with it (main.js reads it).
// Strikes come from a seeded timeline, so a frame at a given t is fixed.
import * as THREE from 'three';
import { Plane, Motes, envDome, slot, visibleAt } from './common.js';
import { mulberry32 } from '../../textures.js';

const SPEED = 3.2;

const cloudFragment = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShadow;
uniform vec3 uFlashCol;
uniform vec4 uFlash;     // world xyz of the strike, brightness
uniform float uFlashR;   // reach of the glow (world units)
uniform float uCover;    // density threshold: higher = more open sky
uniform float uSide;     // 0 everywhere .. 1 only at the sides
uniform float uScale;
uniform vec2 uSeed;
uniform float uOpaque;
uniform float uCalm;

float dens(vec2 p) {
  vec2 w = p + (vec2(nz(p * 0.31 + uSeed).r, nz(p * 0.31 + uSeed + 0.5).r) - 0.5) * 0.2;
  // big soft masses from the smooth channel, rounded billows from the
  // cellular one (squared so each cell domes up)
  float big = nz(w * 0.45 + 0.21).r;
  float b1 = nz(w).g;
  float b2 = nz(w * 2.3 + 0.7).g;
  float billow = b1 * b1 * 0.7 + b2 * b2 * 0.3;
  return big * 0.5 + billow * 0.6 * smoothstep(0.2, 0.6, big) + nz(w * 4.3 + 0.3).b * 0.04;
}

void main() {
  float side = mix(1.0, sideMask(vNdc, 0.15, 0.85), uSide);
  if (uOpaque < 0.5 && side < 0.003) discard;
  vec2 p = vec2(vWorld.x, vWorld.y + uScroll) / uScale + uSeed;
  float n = dens(p);
  // slope from screen-space derivatives: one density lookup per pixel
  // instead of three (the decks face the camera, so a pixel's footprint
  // in p is the same everywhere on a deck)
  float fp = max(abs(dFdx(p.x)), 1e-5);
  vec3 N = normalize(vec3(-dFdx(n) / fp, -dFdy(n) / fp, 7.0 + uOpaque * 9.0));
  vec3 L = normalize(vec3(-0.45, 0.65, 0.55));
  float diff = clamp(dot(N, L) * 0.9 + 0.25, 0.0, 1.0);
  float a = smoothstep(uCover, uCover + 0.22, n) * side;
  float h = smoothstep(uCover, uCover + 0.35, n);
  vec3 col = mix(uShadow, uLit, diff * (0.35 + 0.65 * h));
  // silver lining where the cloud thins out on its moonward side
  float thin = a * (1.0 - h) * 2.0;
  col += uLit * thin * clamp(dot(N.xy, L.xy) * 3.0 + 0.3, 0.0, 1.0) * 0.6;
  // lightning inside: brightest in the thick middle of the cloud
  vec3 fd = vWorld - uFlash.xyz;
  fd.z *= 0.35;
  float fl = uFlash.w * exp(-dot(fd, fd) / (uFlashR * uFlashR));
  col += uFlashCol * fl * (0.25 + 1.4 * h) * (0.6 + 0.6 * nz(p * 3.0).g);
  // calmer and darker in the middle of the screen
  col *= mix(uCalm, 1.0, sideMask(vNdc, 0.05, 0.75));
  if (uOpaque > 0.5) {
    gl_FragColor = vec4(mix(uShadow * 0.5, col, 0.4 + 0.6 * h), 1.0);
  } else {
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * a, a);
  }
}`;

// The bolt: a ribbon whose vertices are written on the CPU for each strike.
const boltVertex = /* glsl */ `
attribute float aAcross;   // -1..1 across the ribbon
attribute float aAlong;    // 0..1 along the bolt
attribute float aWidth;
varying float vAcross;
varying float vAlong;
varying float vWidth;
void main() {
  vAcross = aAcross;
  vAlong = aAlong;
  vWidth = aWidth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const boltFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uBright;
uniform float uGrow;      // how far the leader has travelled (0..1)
varying float vAcross;
varying float vAlong;
varying float vWidth;
void main() {
  if (vAlong > uGrow) discard;
  float core = exp(-vAcross * vAcross * 40.0);
  float halo = exp(-vAcross * vAcross * 4.0) * 0.3;
  vec3 col = mix(uColor, vec3(1.0), core * 0.8) * (core * 3.0 + halo) * uBright * vWidth;
  gl_FragColor = vec4(col, 1.0);
}`;

const BOLT_SEGS = 160;

export function create(ctx) {
  const group = new THREE.Group();
  const q = ctx.quality;
  const flashCol = new THREE.Color('#b4c2ff');
  const flashU = { value: new THREE.Vector4(0, 0, -100, 0) };

  const deck = (z, o) =>
    new Plane({
      z,
      speed: SPEED,
      noise: ctx.noise,
      fragment: cloudFragment,
      transparent: !o.opaque,
      depthWrite: false,
      blending: o.opaque ? THREE.NormalBlending : THREE.CustomBlending,
      renderOrder: o.order,
      uniforms: {
        uLit: { value: new THREE.Color(o.lit) },
        uShadow: { value: new THREE.Color(o.shadow) },
        uFlashCol: { value: flashCol },
        uFlash: flashU,
        uFlashR: { value: o.reach },
        uCover: { value: o.cover },
        uSide: { value: o.side },
        uScale: { value: o.scale },
        uSeed: { value: new THREE.Vector2(o.seed, o.seed * 1.7) },
        uOpaque: { value: o.opaque ? 1 : 0 },
        uCalm: { value: o.calm },
      },
    });
  const decks = [
    deck(-460, { opaque: true, order: -10, lit: '#161b38', shadow: '#030409', reach: 60, cover: 0.3, side: 0, scale: 300, seed: 0.13, calm: 0.6 }),
    deck(-200, { order: -9, lit: '#29315c', shadow: '#05060f', reach: 40, cover: 0.5, side: 0.2, scale: 150, seed: 0.41, calm: 0.5 }),
    deck(-85, { order: -8, lit: '#3a4478', shadow: '#070818', reach: 20, cover: 0.55, side: 0.55, scale: 80, seed: 0.77, calm: 0.45 }),
    deck(-26, { order: -7, lit: '#4a5591', shadow: '#090a1e', reach: 9, cover: 0.58, side: 0.95, scale: 34, seed: 0.29, calm: 0.4 }),
  ];
  for (const d of decks) {
    // premultiplied alpha for the transparent decks
    d.material.blendSrc = THREE.OneFactor;
    d.material.blendDst = THREE.OneMinusSrcAlphaFactor;
    group.add(d.mesh);
  }

  // the bolt ribbon
  const boltPos = new Float32Array(BOLT_SEGS * 6 * 3);
  const boltAcross = new Float32Array(BOLT_SEGS * 6);
  const boltAlong = new Float32Array(BOLT_SEGS * 6);
  const boltWidth = new Float32Array(BOLT_SEGS * 6);
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3).setUsage(THREE.DynamicDrawUsage));
  boltGeo.setAttribute('aAcross', new THREE.BufferAttribute(boltAcross, 1));
  boltGeo.setAttribute('aAlong', new THREE.BufferAttribute(boltAlong, 1).setUsage(THREE.DynamicDrawUsage));
  boltGeo.setAttribute('aWidth', new THREE.BufferAttribute(boltWidth, 1).setUsage(THREE.DynamicDrawUsage));
  for (let i = 0; i < BOLT_SEGS; i++) boltAcross.set([-1, 1, 1, -1, 1, -1], i * 6);
  boltGeo.setDrawRange(0, 0);
  const boltU = { uColor: { value: new THREE.Color('#9fb4ff') }, uBright: { value: 0 }, uGrow: { value: 1 } };
  const boltMat = new THREE.ShaderMaterial({ uniforms: boltU, vertexShader: boltVertex, fragmentShader: boltFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const bolt = new THREE.Mesh(boltGeo, boltMat);
  bolt.frustumCulled = false;
  bolt.renderOrder = -6.5; // over the decks: a strike punches through the thin near clouds
  group.add(bolt);

  // writes one strike's ribbon: a main channel with jagged midpoint
  // displacement and a few branches
  let segs = 0;
  const addPath = (pts, w0, w1, along0, along1, z) => {
    for (let i = 0; i < pts.length - 1 && segs < BOLT_SEGS; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const k0 = i / (pts.length - 1);
      const k1 = (i + 1) / (pts.length - 1);
      const wa = w0 + (w1 - w0) * k0;
      const wb = w0 + (w1 - w0) * k1;
      const nx = -dy / l;
      const ny = dx / l;
      const v = [
        [a[0] - nx * wa, a[1] - ny * wa],
        [a[0] + nx * wa, a[1] + ny * wa],
        [b[0] + nx * wb, b[1] + ny * wb],
        [a[0] - nx * wa, a[1] - ny * wa],
        [b[0] + nx * wb, b[1] + ny * wb],
        [b[0] - nx * wb, b[1] - ny * wb],
      ];
      const al = [k0, k0, k1, k0, k1, k1].map((k) => along0 + (along1 - along0) * k);
      const wd = [wa, wa, wb, wa, wb, wb].map((w) => Math.min(1, w / w0 + 0.25));
      for (let j = 0; j < 6; j++) {
        const o = segs * 6 + j;
        boltPos.set([v[j][0], v[j][1], z], o * 3);
        boltAlong[o] = al[j];
        boltWidth[o] = wd[j];
      }
      segs++;
    }
  };
  const jag = (r, x0, y0, x1, y1, depth, rough) => {
    let pts = [[x0, y0], [x1, y1]];
    let amp = Math.hypot(x1 - x0, y1 - y0) * rough;
    for (let d = 0; d < depth; d++) {
      const next = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const l = Math.hypot(dx, dy) || 1;
        const off = (r() - 0.5) * amp;
        next.push([(a[0] + b[0]) / 2 - (dy / l) * off, (a[1] + b[1]) / 2 + (dx / l) * off], b);
      }
      pts = next;
      amp *= 0.55;
    }
    return pts;
  };
  let builtFor = -1;
  const buildBolt = (s, x, y, z, len) => {
    const r = s.r;
    segs = 0;
    const ang = (r() - 0.5) * 1.6;
    const x1 = x + Math.sin(ang) * len;
    const y1 = y - Math.cos(ang) * len;
    const w = len * 0.04;
    const main = jag(r, x, y, x1, y1, 6, 0.28);
    addPath(main, w, w * 0.5, 0, 1, z);
    for (let b = 0; b < 4; b++) {
      const i = Math.floor((0.15 + r() * 0.6) * (main.length - 1));
      const p = main[i];
      const bl = len * (0.2 + r() * 0.3);
      const ba = ang + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.7);
      const pts = jag(r, p[0], p[1], p[0] + Math.sin(ba) * bl, p[1] - Math.cos(ba) * bl, 4, 0.3);
      const k = i / (main.length - 1);
      addPath(pts, w * 0.45, w * 0.1, k, k + 0.35, z);
    }
    boltGeo.setDrawRange(0, segs * 6);
    boltGeo.attributes.position.needsUpdate = true;
    boltGeo.attributes.aAlong.needsUpdate = true;
    boltGeo.attributes.aWidth.needsUpdate = true;
  };

  const sparks = new Motes({
    count: Math.round(520 * q.clouds),
    rand: mulberry32(21),
    calm: 0.3,
    flicker: 0.6,
    colA: '#7fe6ff',
    colB: '#b3a6ff',
    renderOrder: -2,
    gen: (r) => {
      const rain = r() < 0.55;
      return { x: r(), y: r(), z: -3 - r() * 40, speed: SPEED * (rain ? 3.2 : 1.2), size: rain ? 1.5 + r() : 1.2 + r() * 2, bright: rain ? 0.08 + r() * 0.08 : 0.3 + r() * 0.6, mix: r(), stretch: rain ? 6 + r() * 6 : 1 };
    },
  });
  group.add(sparks.points);

  const env = envDome({
    base: '#05060d',
    up: '#262d4d',
    down: '#030308',
    lobes: [
      { dir: [-0.45, 0.65, 0.6], color: '#cdd6ff', power: 1.4, sharp: 7 },
      { dir: [0.6, -0.3, 0.5], color: '#5a4fd0', power: 0.6, sharp: 3 },
      { dir: [0, 0, 1], color: '#2b3456', power: 0.5, sharp: 2 },
    ],
  });

  let view0 = null;
  const layout = (view) => {
    view0 = view;
    for (const d of decks) d.layout(view);
  };

  // strike timeline: one strike per slot; which deck, where, how bright
  const DECK_Z = [-200, -85, -26];
  const strike = (t) => {
    const s = slot(t, 3.4, 5);
    if (s.age < 0 || s.age > 1.3) return null;
    const r = s.r;
    const which = r() < 0.45 ? 1 : r() < 0.6 ? 2 : 0;
    const z = DECK_Z[which];
    const v = visibleAt(view0.camera, view0.dist, z);
    const sideX = (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.5);
    const x = sideX * v.halfW;
    const y = (r() * 1.2 - 0.6) * v.halfH;
    // flicker: a main stroke and one or two return strokes
    const a = s.age;
    const p = (t0, k) => (a < t0 ? 0 : Math.exp(-(a - t0) * 9) * k);
    const f = Math.max(p(0, 1), p(0.11 + r() * 0.05, 0.75), r() < 0.6 ? p(0.32 + r() * 0.1, 0.55) : 0);
    const boltOn = r() < 0.7;
    const len = v.halfH * (0.45 + r() * 0.35);
    // scroll with the clouds
    const yy = y - a * SPEED;
    return { s, f, x, y0: y, y: yy, z, which, boltOn, len, ion: r() < 0.25 };
  };

  const world = {
    id: 'storm',
    accent: '#9fb4ff',
    group,
    envScene: env.scene,
    flash: 0,
    edges: () => null,
    light: {
      sunDir: new THREE.Vector3(-0.45, 0.65, 0.6),
      sunColor: new THREE.Color('#d6deff'),
      sunIntensity: 2.4,
      skyColor: new THREE.Color('#47558a'),
      groundColor: new THREE.Color('#0b0c1c'),
      hemiIntensity: 0.5,
      envIntensity: 0.95,
      exposure: 1.0,
      rimColor: new THREE.Color('#9a8cff'),
      rimIntensity: 1.6,
      bloom: 0.6,
    },
    layout,
    update(dt, t, view) {
      for (const d of decks) d.update(t);
      sparks.update(t, view, ctx.renderer.getPixelRatio());
      const k = strike(t);
      if (k && k.f > 0.002) {
        flashU.value.set(k.x, k.y, k.z, k.f * (k.which === 0 ? 1.6 : 2.2));
        flashCol.set(k.ion ? '#8fe9ff' : '#b4c2ff');
        if (k.boltOn) {
          if (builtFor !== k.s.i) {
            builtFor = k.s.i;
            buildBolt(k.s, k.x, k.y0 + k.len * 0.5, k.z + 1, k.len);
          }
          bolt.position.y = -k.s.age * SPEED;
          boltU.uBright.value = k.f * (k.which === 0 ? 1.2 : 2.2);
          boltU.uGrow.value = Math.min(1, k.s.age / 0.06);
          boltU.uColor.value.copy(flashCol);
        } else boltU.uBright.value = 0;
        world.flash = Math.min(0.4, k.f * (k.which === 2 ? 0.4 : 0.25));
      } else {
        flashU.value.w = 0;
        boltU.uBright.value = 0;
        world.flash = 0;
      }
    },
    dispose() {
      group.removeFromParent();
      for (const d of decks) d.dispose();
      boltGeo.dispose();
      boltMat.dispose();
      sparks.dispose();
      env.dispose();
    },
  };
  return world;
}
