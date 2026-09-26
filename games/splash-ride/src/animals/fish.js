// Schools of little fish under the surface.
//
// A few schools roam the water 0.5-2.5 m down, each fish keeping a loose
// place in its school, swirling round and matching its mates (a light boids
// rule set), tails beating faster the faster they go. When the boat comes
// close the school darts off as one. Now and then a fish near the boat
// jumps with a little plop. Schools left far behind come back ahead of the
// boat, out of sight.
//
// Kinds: 'tropical' (blue chromis, yellow tangs, striped sergeant majors),
// 'lake' (silvery perch-like fish with orange fins) and 'glow' (small dark
// fish with softly glowing blue-green spots, for the night bay).
//
// One small lofted fish (body, dorsal and anal fins, a forked tail) at unit
// length, scaled per instance to each species' length and build, drawn as
// one InstancedMesh. The tail wiggle is a side-to-side wave in the vertex
// shader; colours and patterns come from the fragment shader per species.
import * as THREE from 'three';
import { TAU, clamp, damp, rand, angleDiff } from '../config.js';
import { MeshBuilder, profiles, animalMaterial, glslColor, instanced, instanceAttr, placeScaled, hide, awayFromLand, boatFrame, keepClearOfBoat, HULL, tierOf } from './shared.js';

const Z0 = -0.45; // snout, unit fish
const BODY = profiles(
  ['up', 'dn', 'w', 'y'],
  [
    [0.0, 0.014, 0.012, 0.012, -0.006],
    [0.07, 0.062, 0.056, 0.042, -0.004],
    [0.2, 0.11, 0.1, 0.062, 0.0],
    [0.36, 0.128, 0.118, 0.064, 0.0],
    [0.56, 0.112, 0.102, 0.054, 0.0],
    [0.76, 0.068, 0.062, 0.034, 0.0],
    [0.9, 0.04, 0.037, 0.02, 0.0],
    [1.0, 0.034, 0.032, 0.016, 0.0],
  ],
);
const BODY_LEN = 0.78;
const backAt = (z) => {
  const t = clamp((z - Z0) / BODY_LEN, 0, 1);
  return BODY.y(t) + BODY.up(t);
};
const bellyAt = (z) => {
  const t = clamp((z - Z0) / BODY_LEN, 0, 1);
  return BODY.y(t) - BODY.dn(t);
};

// Species: length range (m), width and height factors, and paint id.
const SPECIES = {
  tang: { id: 0, len: [0.15, 0.2], sx: 0.72, sy: 1.75 },
  chromis: { id: 1, len: [0.075, 0.1], sx: 0.95, sy: 1.02 },
  sergeant: { id: 2, len: [0.12, 0.16], sx: 0.85, sy: 1.35 },
  perch: { id: 3, len: [0.12, 0.19], sx: 0.9, sy: 0.98 },
  glow: { id: 4, len: [0.065, 0.095], sx: 0.9, sy: 0.92 },
};
const KINDS = {
  tropical: ['chromis', 'tang', 'sergeant', 'chromis'],
  lake: ['perch', 'perch', 'perch'],
  glow: ['glow', 'glow', 'glow', 'glow'],
};

function fishGeometry(tier) {
  const mb = new MeshBuilder();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const X = V(1, 0, 0);
  mb.loft({
    rings: tier === 'low' ? 7 : 9,
    segs: tier === 'low' ? 6 : 8,
    part: 0,
    cluster: 0.5,
    at: (t, o) => {
      o.y = BODY.y(t);
      o.z = Z0 + BODY_LEN * t;
      o.w = BODY.w(t);
      o.up = BODY.up(t);
      o.dn = BODY.dn(t);
      o.e = 2;
      o.s = t;
    },
  });
  const sOf = (x, y, z) => (z - Z0) / 1.0;
  // dorsal fin along the back
  const dorsal = [
    [-0.15, -0.14, 0.22],
    [0.35, -0.08, 0.21],
    [0.75, -0.01, 0.17],
    [1.0, 0.05, 0.12],
  ].map(([h, le, te]) => ({ le: V(0, backAt(le) + h * 0.075, le), te: V(0, backAt(te) + h * 0.06, te), th: 0.07, side: X }));
  mb.fin({ sections: dorsal, part: 1, chord: 2, sOf });
  // anal fin underneath
  const anal = [
    [-0.15, 0.04, 0.24],
    [0.5, 0.08, 0.23],
    [1.0, 0.14, 0.2],
  ].map(([h, le, te]) => ({ le: V(0, bellyAt(le) - h * 0.055, le), te: V(0, bellyAt(te) - h * 0.045, te), th: 0.07, side: X }));
  mb.fin({ sections: anal, part: 2, chord: 2, sOf });
  // forked tail: two lobes from the tail stock
  for (const sg of [1, -1]) {
    const lobe = [
      [0.0, 0.29, 0.43],
      [0.45, 0.33, 0.47],
      [0.85, 0.4, 0.53],
      [1.0, 0.45, 0.555],
    ].map(([u, le, te]) => ({ le: V(0, sg * u * 0.14, le), te: V(0, sg * u * 0.14, te), th: 0.06, side: X }));
    mb.fin({ sections: lobe, part: 3, chord: 2, sOf });
  }
  return mb.build();
}

function fishMaterial() {
  return animalMaterial({
    name: 'fish',
    physical: { roughness: 0.35, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.2, specularIntensity: 0.6 },
    vertex: /* glsl */ `
attribute vec4 aFish; // tail phase, wiggle amplitude, species, seed
varying vec2 vFish;
float fWave(float s) {
  float env = 0.12 + 0.88 * pow(smoothstep(0.08, 1.0, s), 1.5);
  return aFish.y * env * sin(aFish.x - 5.5 * s);
}
`,
    deform: /* glsl */ `
// a yellow tang's tall sail fins
if (aFish.z < 0.5 && aPart > 0.5 && aPart < 2.5) p.y += sign(p.y) * max(0.0, abs(p.y) - 0.1) * 1.6;
float s = p.z + 0.45;
float x0 = fWave(s);
float sx = (fWave(s + 0.01) - fWave(s - 0.01)) / 0.02;
float l = sqrt(1.0 + sx * sx);
p = vec3(x0 + p.x / l, p.y, p.z - p.x * sx / l);
n = vec3((n.z * sx + n.x) / l, n.y, (n.z - n.x * sx) / l);
`,
    vertexMain: 'vFish = aFish.zw;',
    fragment: /* glsl */ `
varying vec2 vFish;
const vec3 F_EYE = vec3(0.05, 0.03, -0.335);
`,
    paint: /* glsl */ `
vec3 p = vRest;
float q = vSurf.y;
int sp = int(vFish.x + 0.5);
float n1 = anNoise(p * 40.0 + vFish.y * 9.0);
float fin = step(0.5, vPart);
float up = smoothstep(-0.3, 0.6, q);
float along = p.z + 0.45;
vec3 col;
float metal = 0.0;
vec3 emis = vec3(0.0);
if (sp == 0) {
  // yellow tang, with the little white spine by the tail
  col = ${glslColor('#f4c400')} * (0.95 + 0.1 * n1);
  col = mix(col, ${glslColor('#d9a409')}, fin * 0.5);
  float spine = (1.0 - smoothstep(0.012, 0.02, length(vec2(p.y - 0.0, (p.z - 0.26) * 0.45)))) * (1.0 - fin);
  col = mix(col, vec3(0.8), spine);
} else if (sp == 1) {
  // blue chromis: blue-green, darker back, pale belly, dark-edged tail
  col = mix(${glslColor('#8fc6d8')}, ${glslColor('#2f86b5')}, up);
  col = mix(col, ${glslColor('#1c4f7a')}, smoothstep(0.55, 1.0, q) * (1.0 - fin));
  col = mix(col, ${glslColor('#2d7fae')}, fin);
  col = mix(col, ${glslColor('#18324d')}, fin * smoothstep(0.1, 0.13, abs(p.y)) * step(2.5, vPart));
  metal = 0.25;
} else if (sp == 2) {
  // sergeant major: yellow back, silver-white sides, five black bars
  col = mix(${glslColor('#dfe3df')}, ${glslColor('#cbb94a')}, smoothstep(0.1, 0.8, q));
  float bars = 0.0;
  for (int i = 0; i < 5; i++) {
    float bz = -0.2 + float(i) * 0.12;
    bars = max(bars, 1.0 - smoothstep(0.022, 0.03, abs(p.z - bz + p.y * 0.12)));
  }
  col = mix(col, ${glslColor('#1d2124')}, bars * (1.0 - fin) * step(-0.85, q));
  col = mix(col, ${glslColor('#9a9c8a')}, fin);
  metal = 0.35 * (1.0 - fin);
} else if (sp == 3) {
  // lake fish: olive back, silver sides, faint bars, orange lower fins
  col = mix(${glslColor('#e6e6e0')}, ${glslColor('#b9bfb7')}, smoothstep(-0.7, 0.2, q));
  col = mix(col, ${glslColor('#46512f')}, smoothstep(0.35, 0.85, q));
  float bars = 0.0;
  for (int i = 0; i < 6; i++) bars = max(bars, 1.0 - smoothstep(0.018, 0.03, abs(p.z + 0.2 - float(i) * 0.085)));
  col *= 1.0 - 0.25 * bars * smoothstep(-0.2, 0.4, q) * (1.0 - fin);
  metal = 0.65 * (1.0 - fin) * (1.0 - smoothstep(0.4, 0.8, q));
  col = mix(col, vPart > 1.5 ? ${glslColor('#c0582a')} : ${glslColor('#6d6a58')}, fin);
  if (vPart > 2.5) col = mix(col, ${glslColor('#c0582a')}, step(p.y, 0.0) * 0.8);
} else {
  // glow fish: a soft blue-green glow, brightest along the belly, and a
  // row of little round lights down each side
  col = mix(${glslColor('#2c4c58')}, ${glslColor('#16262f')}, up);
  float cz = (fract(p.z * 15.0) - 0.5) / 15.0;
  float dots = (1.0 - smoothstep(0.009, 0.016, length(vec2(cz, p.y + 0.05)))) * step(-0.3, p.z) * step(p.z, 0.2) * (1.0 - fin);
  emis = ${glslColor('#4be3cf')} * (dots * 2.2 + 0.18 + 0.3 * (1.0 - up) + 0.35 * fin);
  col = mix(col, ${glslColor('#9ff2e6')}, dots * 0.4);
}
// eye: dark, glassy, with a thin light ring
float de = length(vec3(abs(p.x), p.y, p.z) - F_EYE);
float eye = (1.0 - smoothstep(0.022, 0.028, de)) * (1.0 - fin);
float ring = (1.0 - smoothstep(0.028, 0.034, de)) * (1.0 - fin) - eye;
col = mix(col, vec3(0.85, 0.75, 0.5), clamp(ring, 0.0, 1.0) * 0.6);
col = mix(col, vec3(0.01), eye);
diffuseColor.rgb = col;
anMetal = metal * (1.0 - eye);
anRough = fin > 0.5 ? 0.5 : mix(0.33, 0.08, eye);
anEmis = emis;
`,
  });
}

// ------------------------------------------------------------ behaviour

const _g = { x: 0, z: 0 };
const _v = new THREE.Vector3();
const _fr = { along: 0, across: 0 };

export class Fish {
  constructor({ root, quality, world, events }, kind) {
    this.world = world;
    this.events = events;
    this.kind = KINDS[kind] ? kind : 'tropical';
    const tier = tierOf(quality);
    const species = KINDS[this.kind];
    const nSchools = tier === 'low' ? 2 : species.length === 4 && tier === 'high' ? 4 : 3;
    const per = tier === 'high' ? 24 : tier === 'medium' ? 18 : 14;
    this.schools = [];
    let n = 0;
    for (let s = 0; s < nSchools; s++) {
      const sp = SPECIES[species[s % species.length]];
      const count = sp.id === 0 ? Math.round(per * 0.6) : sp.id === 1 ? Math.round(per * 1.2) : per;
      this.schools.push({ sp, start: n, count, x: 0, z: 0, y: -1.2, vx: 0, vz: 0, tx: 0, tz: 0, speed: 0.5, dart: 0, radius: 1.2 + count * 0.04, spin: rand(-0.35, 0.35), active: false });
      n += count;
    }
    this.n = n;
    const geo = fishGeometry(tier);
    this.attr = instanceAttr(geo, 'aFish', n, 4);
    this.mat = fishMaterial();
    this.mesh = instanced(geo, this.mat, n, { shadows: quality?.shadows !== false && tier === 'high', name: 'fish' });
    root.add(this.mesh);
    const F = (k) => new Float32Array(n * k);
    this.p = F(3);
    this.v = F(3);
    this.off = F(3);
    this.len = F(1);
    this.phase = F(1);
    this.amp = F(1);
    this.yaw = F(1);
    this.pitch = F(1);
    this.jump = { i: -1, t: 0, vy: 0, stage: 0, x: 0, y: 0, z: 0, dx: 0, dz: 0 };
    this.jumpT = this.nextJump();
    const a = this.attr.array;
    for (const sc of this.schools) {
      for (let k = 0; k < sc.count; k++) {
        const i = sc.start + k;
        this.len[i] = rand(sc.sp.len[0], sc.sp.len[1]);
        // a loose place in the school: flattened ellipsoid
        const r = Math.cbrt(Math.random()) * sc.radius;
        const th = Math.random() * TAU;
        this.off[i * 3] = Math.cos(th) * r;
        this.off[i * 3 + 1] = (Math.random() - 0.5) * sc.radius * 0.5;
        this.off[i * 3 + 2] = Math.sin(th) * r;
        this.phase[i] = Math.random() * TAU;
        a[i * 4 + 2] = sc.sp.id;
        a[i * 4 + 3] = Math.random();
      }
      this.scatter(sc);
    }
  }

  nextJump() {
    return this.kind === 'lake' ? rand(6, 14) : this.kind === 'glow' ? rand(14, 26) : rand(15, 30);
  }

  ok(x, z) {
    return this.world.depthAt(x, z) > 1.8 && this.world.landDistance(x, z) > 3;
  }

  // Put a school down somewhere valid; around (cx, cz) if given.
  scatter(sc, cx, cz, rMin = 0, rMax = 0, heading = 0, spread = Math.PI, keep = false) {
    const b = this.world.bounds;
    for (let k = 0; k < 40; k++) {
      let x;
      let z;
      if (cx === undefined) {
        x = rand(b.minX, b.maxX);
        z = rand(b.minZ, b.maxZ);
      } else {
        const a = heading + rand(-spread, spread);
        const r = rand(rMin, rMax);
        x = cx - Math.sin(a) * r;
        z = cz - Math.cos(a) * r;
      }
      if (!this.ok(x, z)) continue;
      const dx = x - sc.x;
      const dz = z - sc.z;
      sc.x = x;
      sc.z = z;
      sc.tx = x;
      sc.tz = z;
      sc.y = -Math.min(rand(0.8, 1.8), this.world.depthAt(x, z) - 0.6);
      sc.active = true;
      for (let i = sc.start; i < sc.start + sc.count; i++) {
        if (!keep) {
          this.p[i * 3] = x + this.off[i * 3];
          this.p[i * 3 + 1] = sc.y + this.off[i * 3 + 1];
          this.p[i * 3 + 2] = z + this.off[i * 3 + 2];
        } else {
          this.p[i * 3] += dx;
          this.p[i * 3 + 2] += dz;
        }
      }
      return true;
    }
    return false;
  }

  update(dt, time, boat) {
    const w = this.world;
    const P = this.p;
    const Vv = this.v;
    for (const sc of this.schools) {
      // far behind the boat: come back ahead of it
      const bx = sc.x - boat.pos.x;
      const bz = sc.z - boat.pos.z;
      const bd = Math.hypot(bx, bz);
      if (bd > 95) this.scatter(sc, boat.pos.x, boat.pos.z, 40, 75, boat.heading, 1.1, true);
      this.steerSchool(sc, dt, time, boat, bd, bx, bz);
      const maxDepth = Math.max(0.5, w.depthAt(sc.x, sc.z) - 0.35);
      for (let i = sc.start; i < sc.start + sc.count; i++) {
        if (i === this.jump.i) continue;
        this.swim(sc, i, dt, time, boat, maxDepth);
      }
    }
    this.updateJump(dt, boat);
    // write instances
    const a = this.attr.array;
    for (const sc of this.schools) {
      const sp = sc.sp;
      for (let i = sc.start; i < sc.start + sc.count; i++) {
        const vx = Vv[i * 3];
        const vy = Vv[i * 3 + 1];
        const vz = Vv[i * 3 + 2];
        const vh = Math.hypot(vx, vz);
        const speed = Math.hypot(vh, vy);
        const L = this.len[i];
        // turn to face the way it swims (held steady when nearly still)
        if (vh > 0.03) this.yaw[i] += angleDiff(this.yaw[i], Math.atan2(-vx, -vz)) * Math.min(1, 8 * dt);
        this.pitch[i] = damp(this.pitch[i], clamp(Math.atan2(vy, Math.max(vh, 0.1)), -0.8, 0.8), 6, dt);
        const yaw = this.yaw[i];
        const pitch = this.pitch[i];
        // tail beat: faster with speed (in body lengths a second)
        const bl = speed / L;
        this.phase[i] = (this.phase[i] + TAU * clamp(1.8 + bl * 0.9, 2, 13) * dt) % (TAU * 1000);
        this.amp[i] = damp(this.amp[i], 0.045 + 0.05 * Math.min(1, bl / 12), 4, dt);
        a[i * 4] = this.phase[i];
        a[i * 4 + 1] = this.amp[i];
        if (!sc.active) hide(this.mesh, i);
        else placeScaled(this.mesh, i, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], yaw, pitch, 0, L * sp.sx, L * sp.sy, L);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.attr.needsUpdate = true;
  }

  steerSchool(sc, dt, time, boat, bd, bx, bz) {
    const w = this.world;
    sc.dart -= dt;
    if (bd < 14 && sc.dart <= 0 && bd > 1e-3) {
      // dart away from the boat, off to the side it is already on
      const ax = bx / bd;
      const az = bz / bd;
      const tx = sc.x + ax * 16;
      const tz = sc.z + az * 16;
      if (this.ok(tx, tz)) {
        sc.tx = tx;
        sc.tz = tz;
      } else {
        awayFromLand(w, sc.x, sc.z, _g);
        sc.tx = sc.x + (ax + _g.x) * 8;
        sc.tz = sc.z + (az + _g.z) * 8;
      }
      sc.dart = 2.5;
    }
    let dx = sc.tx - sc.x;
    let dz = sc.tz - sc.z;
    let d = Math.hypot(dx, dz);
    if (d < 1.5 && sc.dart <= 0) {
      // a new spot to wander to
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * TAU;
        const r = rand(6, 22);
        const x = sc.x + Math.cos(a) * r;
        const z = sc.z + Math.sin(a) * r;
        if (this.ok(x, z)) {
          sc.tx = x;
          sc.tz = z;
          break;
        }
      }
      dx = sc.tx - sc.x;
      dz = sc.tz - sc.z;
      d = Math.hypot(dx, dz);
    }
    const sp = sc.dart > 0 ? 2.6 : 0.45 + 0.15 * Math.sin(time * 0.3 + sc.start);
    sc.speed = damp(sc.speed, sp, sc.dart > 0 ? 6 : 1, dt);
    const k = d > 1e-3 ? Math.min(1, d / 2) / d : 0;
    sc.vx = damp(sc.vx, dx * k * sc.speed, 3, dt);
    sc.vz = damp(sc.vz, dz * k * sc.speed, 3, dt);
    const nx = sc.x + sc.vx * dt;
    const nz = sc.z + sc.vz * dt;
    if (this.world.depthAt(nx, nz) > 1.2) {
      sc.x = nx;
      sc.z = nz;
    } else {
      sc.tx = sc.x;
      sc.tz = sc.z;
    }
    const want = -Math.min(0.8 + 0.7 * (0.5 + 0.5 * Math.sin(time * 0.07 + sc.start)), Math.max(0.5, this.world.depthAt(sc.x, sc.z) - 0.6));
    sc.y = damp(sc.y, sc.dart > 0 ? want - 0.5 : want, 0.5, dt);
  }

  swim(sc, i, dt, time, boat, maxDepth) {
    const P = this.p;
    const Vv = this.v;
    const i3 = i * 3;
    // the fish's place: its offset in the school, turning slowly round the centre
    const ang = time * sc.spin;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const ox = this.off[i3] * ca - this.off[i3 + 2] * sa;
    const oz = this.off[i3] * sa + this.off[i3 + 2] * ca;
    const tx = sc.x + ox;
    const ty = sc.y + this.off[i3 + 1];
    const tz = sc.z + oz;
    let ax = (tx - P[i3]) * 1.2 + (sc.vx - Vv[i3]) * 1.5;
    let ay = (ty - P[i3 + 1]) * 1.2 - Vv[i3 + 1] * 1.5;
    let az = (tz - P[i3 + 2]) * 1.2 + (sc.vz - Vv[i3 + 2]) * 1.5;
    // keep a little apart from a few school mates
    for (let k = 1; k <= 3; k++) {
      const j = sc.start + ((i - sc.start + k * 5) % sc.count);
      if (j === i) continue;
      const dx = P[i3] - P[j * 3];
      const dy = P[i3 + 1] - P[j * 3 + 1];
      const dz = P[i3 + 2] - P[j * 3 + 2];
      const dd = dx * dx + dy * dy + dz * dz;
      const r = this.len[i] * 2.2;
      if (dd < r * r && dd > 1e-8) {
        const f = (r - Math.sqrt(dd)) * 12;
        ax += dx * f;
        ay += dy * f;
        az += dz * f;
      }
    }
    // startle away from the hull
    const hx = P[i3] - boat.pos.x;
    const hz = P[i3 + 2] - boat.pos.z;
    const hd = hx * hx + hz * hz;
    if (hd < 36 && hd > 1e-6) {
      const f = (6 - Math.sqrt(hd)) * 3 / Math.sqrt(hd);
      ax += hx * f;
      az += hz * f;
      ay -= 2;
    }
    // a lively wobble so no two fish move the same
    const wob = Math.sin(time * 1.7 + i * 1.37);
    ax += wob * 0.25;
    az += Math.cos(time * 1.3 + i * 2.1) * 0.25;
    Vv[i3] += ax * dt;
    Vv[i3 + 1] += ay * dt;
    Vv[i3 + 2] += az * dt;
    const vmax = sc.dart > 0 ? 3.2 : 1.1;
    const sp = Math.hypot(Vv[i3], Vv[i3 + 1], Vv[i3 + 2]);
    if (sp > vmax) {
      const f = vmax / sp;
      Vv[i3] *= f;
      Vv[i3 + 1] *= f;
      Vv[i3 + 2] *= f;
    }
    Vv[i3 + 1] *= 0.98;
    P[i3] += Vv[i3] * dt;
    P[i3 + 1] = clamp(P[i3 + 1] + Vv[i3 + 1] * dt, -maxDepth, -0.35);
    P[i3 + 2] += Vv[i3 + 2] * dt;
    // never in the hull's way: near the boat a fish keeps well below the keel,
    // or slips aside where the water is too shallow for that
    boatFrame(boat, P[i3], P[i3 + 2], _fr);
    const out = Math.max(Math.abs(_fr.along) - HULL.half, Math.abs(_fr.across) - HULL.beam);
    if (out < 1.5) {
      if (maxDepth >= 1.4) {
        const ceil = -0.35 - 0.95 * Math.min(1, (1.5 - out) / 1.5);
        if (P[i3 + 1] > ceil) {
          P[i3 + 1] = ceil;
          Vv[i3 + 1] = Math.min(Vv[i3 + 1], 0);
        }
      } else {
        _v.set(P[i3], 0, P[i3 + 2]);
        if (keepClearOfBoat(boat, _v, 0.5)) {
          P[i3] = _v.x;
          P[i3 + 2] = _v.z;
        }
      }
    }
  }

  // One fish near the boat leaps with a plop now and then.
  updateJump(dt, boat) {
    const J = this.jump;
    const P = this.p;
    const Vv = this.v;
    const w = this.world;
    if (J.i < 0) {
      this.jumpT -= dt;
      if (this.jumpT > 0) return;
      this.jumpT = this.nextJump();
      const sc = this.schools[Math.floor(Math.random() * this.schools.length)];
      const d = Math.hypot(sc.x - boat.pos.x, sc.z - boat.pos.z);
      if (!sc.active || d > 60 || d < 9 || sc.dart > 0) return;
      J.i = sc.start + Math.floor(Math.random() * sc.count);
      J.stage = 0;
      J.t = 0;
      const a = Math.random() * TAU;
      J.dx = Math.cos(a);
      J.dz = Math.sin(a);
      J.vy = rand(2.4, 3.1);
      return;
    }
    const i3 = J.i * 3;
    const surf = w.heightAt(P[i3], P[i3 + 2]);
    if (J.stage === 0) {
      // race up to the surface
      Vv[i3] = J.dx * 1.2;
      Vv[i3 + 2] = J.dz * 1.2;
      Vv[i3 + 1] = damp(Vv[i3 + 1], 3, 6, dt);
      P[i3] += Vv[i3] * dt;
      P[i3 + 2] += Vv[i3 + 2] * dt;
      P[i3 + 1] += Vv[i3 + 1] * dt;
      if (P[i3 + 1] >= surf) {
        J.stage = 1;
        Vv[i3 + 1] = J.vy;
        this.events.splash(_v.set(P[i3], surf, P[i3 + 2]), 0.15);
        this.events.sound('splashfish', _v);
      }
    } else if (J.stage === 1) {
      Vv[i3 + 1] -= 9.81 * dt;
      P[i3] += Vv[i3] * dt;
      P[i3 + 2] += Vv[i3 + 2] * dt;
      P[i3 + 1] += Vv[i3 + 1] * dt;
      if (P[i3 + 1] < surf && Vv[i3 + 1] < 0) {
        J.stage = 2;
        J.t = 0;
        this.events.splash(_v.set(P[i3], surf, P[i3 + 2]), 0.22);
        this.events.ripple(P[i3], P[i3 + 2], 0.3);
      }
    } else {
      J.t += dt;
      Vv[i3 + 1] = damp(Vv[i3 + 1], -0.5, 4, dt);
      P[i3] += Vv[i3] * dt;
      P[i3 + 2] += Vv[i3 + 2] * dt;
      P[i3 + 1] += Vv[i3 + 1] * dt;
      if (J.t > 0.6) J.i = -1;
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.material.dispose();
    this.mat.depth.dispose();
    this.mesh.dispose();
  }
}
