// The cutting tools, modelled in code: a chef's knife, a serrated cake knife,
// a cake wire, a celebration cake sword with a ribbon, and a cake server.
// Knife blades lie in their local XY plane with the edge along +X at y = 0
// and the tip at +X; the origin is the tip. The wire's origin is the middle
// of the wire; the server's is the middle of its blade.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

export const TOOLS = ['chef', 'serrated', 'wire', 'sword', 'server'];

// Brushed steel that can carry a smear of frosting and a few crumbs.
function bladeSteel({ roughness = 0.33, colour = '#c8cdd3' } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colour),
    metalness: 1,
    roughness,
    envMapIntensity: 0.8,
    anisotropy: 0.4,
    anisotropyRotation: 0,
  });
  const u = {
    uSmear: { value: 0 },
    uSmearCol: { value: new THREE.Color('#f3c3cd') },
    uCrumbCol: { value: new THREE.Color('#5a2e1b') },
  };
  m.userData.smear = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBlade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlade = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vBlade;\nuniform float uSmear;\nuniform vec3 uSmearCol;\nuniform vec3 uCrumbCol;\n${NOISE}\nfloat bSmear;\nfloat bCrumb;`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
#include <map_fragment>
{
  // smears build up from the edge, streaked along the blade
  float band = smoothstep(0.05, 0.004, vBlade.y);
  float n = vnoise(vec3(vBlade.x * 90.0, vBlade.y * 420.0, 1.0)) * 0.65 + vnoise(vec3(vBlade.x * 520.0, vBlade.y * 900.0, 4.0)) * 0.35;
  bSmear = smoothstep(1.0 - uSmear * band * 0.9, 1.05 - uSmear * band * 0.9, n);
  vec3 w = worley(vBlade * 700.0);
  bCrumb = smoothstep(0.22, 0.12, w.x) * step(0.8, w.z) * band * min(1.0, uSmear * 1.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, uSmearCol, bSmear);
  diffuseColor.rgb = mix(diffuseColor.rgb, uCrumbCol, bCrumb);
}`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, max(bSmear, bCrumb));')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - max(bSmear, bCrumb);');
  };
  m.customProgramCacheKey = () => 'blade-steel';
  return m;
}

function wood(colour = '#7a4a2a', roughness = 0.45) {
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colour), roughness, clearcoat: 0.4, clearcoatRoughness: 0.3 });
}

const goldMat = () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#e7bd6a'), metalness: 1, roughness: 0.2 });
const steelMat = () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#d8dce2'), metalness: 1, roughness: 0.18 });

// A blade from its edge and spine curves (y as a function of x from heel,
// 0, to tip, L) and a half-thickness at the spine. Returned in tip-origin
// coordinates.
function bladeGeometry({ L, edge, spine, half, nx = 64, nv = 10 }) {
  const pos = [];
  const uv = [];
  const idx = [];
  const rowLen = nv + 1;
  const put = (side) => {
    const base = pos.length / 3;
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx) * L;
      const e = edge(x);
      const s = spine(x);
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        const y = e + (s - e) * v;
        // a flat grind: thin at the edge, full thickness from mid-blade up
        const taper = 1 - 0.55 * Math.pow(x / L, 2);
        const t = half * taper * Math.min(1, Math.pow(v * 1.6, 0.75)) * side;
        pos.push(x - L, y, t);
        uv.push(x / L, v);
      }
    }
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nv; j++) {
        const a = base + i * rowLen + j;
        const b = a + rowLen;
        if (side > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
        else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  };
  put(1);
  put(-1);
  // spine strip
  const sBase = pos.length / 3;
  for (let i = 0; i <= nx; i++) {
    const x = (i / nx) * L;
    const s = spine(x);
    const taper = (1 - 0.55 * Math.pow(x / L, 2)) * half;
    pos.push(x - L, s, taper, x - L, s, -taper);
    uv.push(x / L, 1, x / L, 1);
  }
  for (let i = 0; i < nx; i++) {
    const a = sBase + i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  // heel face
  const hBase = pos.length / 3;
  const e0 = edge(0);
  const s0 = spine(0);
  pos.push(-L, e0, 0, -L, s0, half, -L, s0, -half);
  uv.push(0, 0, 0, 1, 0, 1);
  idx.push(hBase, hBase + 1, hBase + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A rounded handle along -X starting at x0, centred on y = cy.
function handleGeometry(length, height, thick, bevel = 0.004) {
  const shape = new THREE.Shape();
  const r = height / 2;
  shape.moveTo(0, -r * 0.85);
  shape.lineTo(-length + r, -r);
  shape.quadraticCurveTo(-length - r * 0.2, -r, -length - r * 0.2, 0);
  shape.quadraticCurveTo(-length - r * 0.2, r * 1.05, -length + r, r * 1.05);
  shape.bezierCurveTo(-length * 0.6, r * 0.9, -length * 0.3, r * 1.1, 0, r);
  shape.lineTo(0, -r * 0.85);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thick - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: 4,
    curveSegments: 16,
  });
  g.translate(0, 0, -(thick - bevel * 2) / 2);
  return g;
}

function rivets(group, xs, y, thick) {
  const geo = new THREE.CylinderGeometry(0.0025, 0.0025, thick + 0.0008, 16);
  geo.rotateX(Math.PI / 2);
  const m = steelMat();
  for (const x of xs) {
    const r = new THREE.Mesh(geo, m);
    r.position.set(x, y, 0);
    group.add(r);
  }
}

// ------------------------------------------------------------ chef's knife

function buildChef() {
  const g = new THREE.Group();
  const L = 0.2;
  const blade = new THREE.Mesh(
    bladeGeometry({
      L,
      edge: (x) => (x < 0.105 ? 0 : 0.013 * Math.pow((x - 0.105) / (L - 0.105), 2)),
      spine: (x) => (x < 0.07 ? 0.046 : 0.046 - 0.033 * Math.pow((x - 0.07) / (L - 0.07), 1.5)),
      half: 0.0011,
    }),
    bladeSteel(),
  );
  g.add(blade);
  const bolster = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.042, 0.011, 2, 2, 2), steelMat());
  bolster.position.set(-L - 0.005, 0.024, 0);
  g.add(bolster);
  const handle = new THREE.Mesh(handleGeometry(0.118, 0.027, 0.02), new THREE.MeshPhysicalMaterial({ color: 0x141414, roughness: 0.38, clearcoat: 0.5 }));
  handle.position.set(-L - 0.011, 0.03, 0);
  g.add(handle);
  rivets(g, [-L - 0.035, -L - 0.07, -L - 0.105], 0.031, 0.02);
  g.userData = { length: L, blade: blade.material, reach: 0.15, heelY: 0.0 };
  return g;
}

// ------------------------------------------------------------ serrated knife

function buildSerrated() {
  const g = new THREE.Group();
  const L = 0.26;
  const pitch = 0.0045;
  const blade = new THREE.Mesh(
    bladeGeometry({
      L,
      edge: (x) => 0.0014 * Math.abs(Math.sin((x / pitch) * Math.PI)) + (x > L - 0.03 ? 0.012 * Math.pow((x - (L - 0.03)) / 0.03, 2) : 0),
      spine: (x) => (x > L - 0.03 ? 0.03 - 0.018 * Math.sqrt(Math.max(0, (x - (L - 0.03)) / 0.03)) : 0.03),
      half: 0.0009,
      nx: 260,
      nv: 6,
    }),
    bladeSteel({ roughness: 0.3 }),
  );
  g.add(blade);
  const handle = new THREE.Mesh(handleGeometry(0.12, 0.024, 0.019), wood('#b07b4c', 0.42));
  handle.position.set(-L - 0.002, 0.02, 0);
  g.add(handle);
  rivets(g, [-L - 0.03, -L - 0.09], 0.021, 0.019);
  g.userData = { length: L, blade: blade.material, reach: 0.2 };
  return g;
}

// ------------------------------------------------------------ cake wire

// A stainless U-frame with a taut wire across its open end and a wooden
// grip across the top. It is pushed straight down, so it cuts one clean
// plane right across the cake.
function buildWire() {
  const g = new THREE.Group();
  const span = 0.32;
  const tall = 0.17;
  const steel = steelMat();
  // thicker than a real cake wire (about 0.4 mm) so it still reads on a
  // phone screen, and polished bright
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.00075, 0.00075, span, 8), new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#f2f4f7'), metalness: 1, roughness: 0.12 }));
  wire.rotation.z = Math.PI / 2;
  g.add(wire);
  const path = new THREE.CurvePath();
  const pts = [
    new THREE.Vector3(-span / 2, 0, 0),
    new THREE.Vector3(-span / 2, tall - 0.02, 0),
    new THREE.Vector3(-span / 2 + 0.02, tall, 0),
    new THREE.Vector3(span / 2 - 0.02, tall, 0),
    new THREE.Vector3(span / 2, tall - 0.02, 0),
    new THREE.Vector3(span / 2, 0, 0),
  ];
  for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
  const frame = new THREE.Mesh(new THREE.TubeGeometry(path, 160, 0.0028, 12, false), steel);
  g.add(frame);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.13, 24), wood('#8c5a35', 0.5));
  grip.rotation.z = Math.PI / 2;
  grip.position.y = tall + 0.012;
  g.add(grip);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.004, 12, 8), steel);
    cap.position.set((s * span) / 2, 0, 0);
    g.add(cap);
  }
  g.userData = { length: span, blade: null, reach: 0 };
  return g;
}

// ------------------------------------------------------------ cake sword

// A ceremonial cake sword: long bright blade, gold guard and pommel, a
// white wrapped grip and a satin bow whose tails flutter.
function buildSword() {
  const g = new THREE.Group();
  const L = 0.3;
  const blade = new THREE.Mesh(
    bladeGeometry({
      L,
      edge: (x) => (x > L - 0.05 ? 0.018 * Math.pow((x - (L - 0.05)) / 0.05, 1.3) : 0),
      spine: (x) => (x > L - 0.05 ? 0.036 - 0.018 * Math.pow((x - (L - 0.05)) / 0.05, 0.8) : 0.036),
      half: 0.0016,
      nx: 80,
    }),
    bladeSteel({ roughness: 0.3, colour: '#e4e8ed' }),
  );
  g.add(blade);
  // fuller: a gold line engraved along the blade
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(L * 0.72, 0.003, 0.0036), goldMat());
  fuller.position.set(-L * 0.55, 0.021, 0);
  g.add(fuller);
  const guard = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.06, 6, 16), goldMat());
  bar.position.set(-L - 0.004, 0.018, 0);
  guard.add(bar);
  for (const s of [-1, 1]) {
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.003, 10, 24, Math.PI * 1.4), goldMat());
    curl.position.set(-L - 0.004, 0.018 + s * 0.036, 0);
    curl.rotation.set(0, Math.PI / 2, s > 0 ? 0 : Math.PI);
    guard.add(curl);
  }
  g.add(guard);
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0095, 0.011, 0.1, 24, 20),
    new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#f6efe6'), roughness: 0.5, sheen: 1, sheenColor: new THREE.Color('#ffffff') }),
  );
  const gp = grip.geometry.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const y = gp.getY(i);
    const a = Math.atan2(gp.getZ(i), gp.getX(i));
    const k = 1 + 0.08 * Math.abs(Math.sin(y * 260 + a));
    gp.setXYZ(i, gp.getX(i) * k, y, gp.getZ(i) * k);
  }
  grip.geometry.computeVertexNormals();
  grip.rotation.z = Math.PI / 2;
  grip.position.set(-L - 0.06, 0.018, 0);
  g.add(grip);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.013, 24, 16), goldMat());
  pommel.position.set(-L - 0.115, 0.018, 0);
  g.add(pommel);
  // the bow
  const satin = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#e58aa6'),
    roughness: 0.35,
    sheen: 1,
    sheenColor: new THREE.Color('#ffd0de'),
    side: THREE.DoubleSide,
  });
  const bow = new THREE.Group();
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0035, 8, 24), satin);
    loop.scale.set(1, 0.55, 0.4);
    loop.position.set(0, 0, s * 0.012);
    loop.rotation.y = (s * Math.PI) / 2.6;
    bow.add(loop);
  }
  const tails = [];
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.07, 1, 12), satin);
    tail.geometry.translate(0, -0.035, 0);
    tail.position.set(0, 0, s * 0.006);
    tail.rotation.set(0.2 * s, 0, 0.3 * s);
    tail.userData.base = tail.geometry.attributes.position.array.slice();
    tail.userData.side = s;
    bow.add(tail);
    tails.push(tail);
  }
  bow.position.set(-L - 0.02, 0.018, 0);
  g.add(bow);
  g.userData = { length: L, blade: blade.material, reach: 0.22, tails };
  return g;
}

// ------------------------------------------------------------ cake server

// A pie-and-cake server: a flat triangular blade with one serrated side,
// an offset neck and a pearl handle. Built lying flat, pointing along +X.
function buildServer() {
  const g = new THREE.Group();
  const len = 0.12;
  const back = 0.032;
  const shape = new THREE.Shape();
  shape.moveTo(0, -back);
  const teeth = 18;
  for (let i = 1; i <= teeth; i++) {
    const t = i / teeth;
    const x = t * (len - 0.01);
    const y = -back * (1 - t) - 0.003 * (1 - t) * Math.sin(t * Math.PI);
    shape.lineTo(x - 0.002, y + (i % 2 ? 0.0012 : 0));
  }
  shape.quadraticCurveTo(len + 0.004, 0, len - 0.01, 0.006);
  shape.quadraticCurveTo(len * 0.5, back * 0.75, 0, back);
  shape.lineTo(0, -back);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.0012, bevelEnabled: true, bevelThickness: 0.0003, bevelSize: 0.0004, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(-len / 2, 0, 0);
  const blade = new THREE.Mesh(geo, bladeSteel({ roughness: 0.18 }));
  g.add(blade);
  const neckPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-len / 2 + 0.004, 0.001, 0),
    new THREE.Vector3(-len / 2 - 0.012, 0.006, 0),
    new THREE.Vector3(-len / 2 - 0.028, 0.026, 0),
    new THREE.Vector3(-len / 2 - 0.05, 0.036, 0),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(neckPath, 24, 0.0035, 10, false), steelMat()));
  const handle = new THREE.Mesh(
    handleGeometry(0.11, 0.02, 0.016),
    new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#f4eee4'), roughness: 0.25, clearcoat: 1, iridescence: 0.25 }),
  );
  handle.rotation.z = 0.12;
  handle.position.set(-len / 2 - 0.048, 0.037, 0);
  g.add(handle);
  g.userData = { length: len, blade: blade.material, reach: 0 };
  return g;
}

export function buildTools() {
  const tools = {
    chef: buildChef(),
    serrated: buildSerrated(),
    wire: buildWire(),
    sword: buildSword(),
    server: buildServer(),
  };
  for (const t of Object.values(tools)) {
    t.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    t.visible = false;
  }
  return tools;
}

// Flutter the sword's ribbon tails.
export function flutterRibbon(sword, time, speed) {
  for (const tail of sword.userData.tails) {
    const p = tail.geometry.attributes.position;
    const base = tail.userData.base;
    for (let i = 0; i < p.count; i++) {
      const y = base[i * 3 + 1];
      const k = -y / 0.07;
      p.setZ(i, base[i * 3 + 2] + Math.sin(time * (6 + speed * 20) + k * 5 + tail.userData.side) * 0.006 * k * (0.4 + speed));
      p.setX(i, base[i * 3] + Math.sin(time * 4 + k * 3) * 0.003 * k);
    }
    p.needsUpdate = true;
    tail.geometry.computeVertexNormals();
  }
}
