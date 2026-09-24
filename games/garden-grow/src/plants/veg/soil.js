// The first moments of every vegetable: the seed in its dug hole, soil
// crumbs raked back over it into a little mound, the mound bulging and
// cracking into irregular plates as the shoot pushes up, the plates tipping
// apart as it breaks through, then settling into loose soil round the stem.
import * as THREE from 'three';
import { smooth, lerp, mulberry32 } from '../../config.js';
import { crumbGeometry } from './geom.js';
import { soilTextures, holeTexture, once } from './tex.js';

const CRUMBS = 36;
const WALL = -0.5; // how deep a plate's broken edge goes, in mound heights
const NR = 6;

function materials() {
  return once('soil-mats', () => {
    const { map, normalMap } = soilTextures();
    const plate = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.96, vertexColors: true, side: THREE.DoubleSide, color: 0xa89888 });
    const crumb = new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.95 });
    const hole = new THREE.MeshStandardMaterial({ map: holeTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return { plate, crumb, hole };
  });
}

const crumbGeo = () => once('soil-crumb', () => crumbGeometry(3));
const holeGeo = () => once('soil-hole', () => new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2));
const dome = (r) => Math.pow(Math.max(0, 1 - r * r), 1.7);

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _n3 = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// radius: mound radius in metres (the hole is a little wider).
// height: mound dome height once covered.
export class SeedBed {
  constructor({ seed = 1, radius = 0.025, height = 0.009, shadows = true }) {
    const rng = mulberry32(seed * 7 + 3);
    this.R = radius;
    this.H = height;
    this.g = -1;
    this.lift = 0; // extra heave from below (a carrot being pulled)
    const mats = materials();
    this.object = new THREE.Group();
    this.object.name = 'seedbed';

    this.hole = new THREE.Mesh(holeGeo(), mats.hole);
    this.hole.scale.setScalar(radius * 1.2);
    this.hole.position.y = 0.0003;
    this.hole.renderOrder = -1;
    this.object.add(this.hole);

    // irregular plates: 4 or 5 cracks at uneven angles, each crack a
    // wandering line shared by the plates on either side of it
    const n = rng() < 0.5 ? 4 : 5;
    const spin = rng() * Math.PI * 2;
    const cuts = [];
    let acc = 0;
    const spans = [];
    for (let i = 0; i < n; i++) spans.push(0.7 + rng() * 0.6);
    const total = spans.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) {
      cuts.push({ a: spin + (acc / total) * Math.PI * 2, f1: 9 + rng() * 14, f2: 25 + rng() * 25, p1: rng() * 6, p2: rng() * 6, amp: 0.05 + rng() * 0.07 });
      acc += spans[i];
    }
    const cutAngle = (k, r) => {
      const c = cuts[k % n];
      const wrap = k >= n ? Math.PI * 2 : 0;
      return c.a + wrap + (Math.sin(r * c.f1 + c.p1) * 0.6 + Math.sin(r * c.f2 + c.p2) * 0.4) * c.amp * (0.3 + r);
    };
    const pos = [];
    const col = [];
    const uv = [];
    const owner = [];
    this.plateInfo = [];
    for (let k = 0; k < n; k++) {
      const a0 = cuts[k].a;
      const a1 = k + 1 < n ? cuts[k + 1].a : cuts[0].a + Math.PI * 2;
      const mid = (a0 + a1) / 2;
      const NA = Math.max(4, Math.round(((a1 - a0) / (Math.PI * 2)) * 30));
      const pts = [];
      for (let i = 0; i <= NR; i++) {
        const r = Math.max(0.03, i / NR);
        const lo = cutAngle(k, r);
        const hi = cutAngle(k + 1, r);
        const row = [];
        for (let j = 0; j <= NA; j++) {
          const a = lo + (hi - lo) * (j / NA);
          const x = Math.cos(a) * r;
          const z = -Math.sin(a) * r;
          const bump = 1 + 0.14 * Math.sin(x * 23 + z * 7 + seed) * Math.sin(z * 19 - x * 5);
          row.push(new THREE.Vector3(x, dome(r) * bump, z));
        }
        pts.push(row);
      }
      const tri = (a, b, c, shade) => {
        for (const p of [a, b, c]) {
          pos.push(p.x, p.y, p.z);
          col.push(shade, shade, shade);
          // walls take their texture side-on so it does not streak
          if (shade < 1) uv.push((p.x - p.z) * 0.4 + 0.5, p.y * 0.4 + 0.5);
          else uv.push(p.x * 0.55 + 0.5, p.z * 0.55 + 0.5);
          owner.push(k);
        }
      };
      for (let i = 0; i < NR; i++) {
        for (let j = 0; j < NA; j++) {
          tri(pts[i][j], pts[i][j + 1], pts[i + 1][j], 1);
          tri(pts[i][j + 1], pts[i + 1][j + 1], pts[i + 1][j], 1);
        }
      }
      // broken edges along both cracks and the outer rim: damp, darker
      const down = (p) => new THREE.Vector3(p.x * 0.97, WALL, p.z * 0.97);
      for (let i = 0; i < NR; i++) {
        for (const j of [0, NA]) {
          const a = pts[i][j];
          const b = pts[i + 1][j];
          tri(a, b, down(a), 0.42);
          tri(b, down(b), down(a), 0.42);
        }
      }
      for (let j = 0; j < NA; j++) {
        const a = pts[NR][j];
        const b = pts[NR][j + 1];
        tri(a, down(a), b, 0.6);
        tri(b, down(a), down(b), 0.6);
      }
      tri(pts[0][0], down(pts[0][0]), pts[0][NA], 0.45);
      tri(pts[0][NA], down(pts[0][0]), down(pts[0][NA]), 0.45);
      this.plateInfo.push({
        a0,
        a1,
        dir: new THREE.Vector3(Math.cos(mid), 0, -Math.sin(mid)),
        tilt: 0.7 + rng() * 0.6,
        push: 0.7 + rng() * 0.6,
        m: new THREE.Matrix4(),
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    this.basePos = geo.attributes.position.array.slice();
    this.baseNor = geo.attributes.normal.array.slice();
    this.owner = Uint8Array.from(owner);
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geo.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    this.plates = new THREE.Mesh(geo, mats.plate);
    this.plates.castShadow = shadows;
    this.plates.receiveShadow = true;
    this.object.add(this.plates);

    // crumbs: first heaped round the rim of the hole, then raked over the
    // seed, riding on the plates, some rolling off as the shoot breaks out
    this.crumbs = new THREE.InstancedMesh(crumbGeo(), mats.crumb, CRUMBS);
    this.crumbs.castShadow = shadows;
    this.crumbs.receiveShadow = true;
    this.crumbInfo = [];
    for (let i = 0; i < CRUMBS; i++) {
      const size = radius * (0.045 + rng() * rng() * 0.11);
      const ra = rng() * Math.PI * 2;
      const rr = radius * (0.98 + rng() * rng() * 0.5);
      const plate = i % n;
      const info = this.plateInfo[plate];
      const pa = info.a0 + (info.a1 - info.a0) * (0.15 + rng() * 0.7);
      const pr = 0.2 + rng() * 0.72;
      const oa = rng() * Math.PI * 2;
      const or = radius * (1.05 + rng() * 0.6);
      this.crumbInfo.push({
        size,
        rim: new THREE.Vector3(Math.cos(ra) * rr, size * 0.3, Math.sin(ra) * rr),
        plate,
        local: new THREE.Vector3(Math.cos(pa) * pr, dome(pr), -Math.sin(pa) * pr),
        tCover: 0.028 + rng() * 0.045,
        roll: rng() < 0.4,
        tRoll: 0.17 + rng() * 0.12,
        out: new THREE.Vector3(Math.cos(oa) * or, size * 0.3, Math.sin(oa) * or),
        rot: new THREE.Euler(rng() * 6, rng() * 6, rng() * 6),
      });
      _col.setHSL(0.07 + rng() * 0.03, 0.2 + rng() * 0.15, 0.62 + rng() * 0.25);
      this.crumbs.setColorAt(i, _col);
    }
    this.object.add(this.crumbs);
    this.set(0);
  }

  // Mound state along the timeline: [height scale, crack gap, tilt].
  shape(g) {
    const cover = smooth(0.035, 0.078, g);
    const bulge = smooth(0.07, 0.11, g) * (1 - smooth(0.2, 0.3, g));
    const crack = smooth(0.08, 0.13, g);
    const burst = smooth(0.13, 0.2, g);
    const settle = smooth(0.22, 0.5, g);
    const h = cover * (1 + 0.5 * bulge) * lerp(1, 0.45, settle);
    const gap = crack * 0.02 + burst * 0.04 + settle * 0.015;
    const tilt = (burst * 0.2 - settle * 0.13 + crack * 0.04) * (1 - smooth(0.6, 0.9, g) * 0.4);
    return [h, gap, Math.max(0, tilt)];
  }

  set(g) {
    if (g === this.g) return;
    this.g = g;
    const { R, H } = this;
    const [h, gap, tilt] = this.shape(g);
    this.hole.visible = g < 0.2 || this.lift > 0;
    const heave = this.lift;
    const hs = Math.max(1e-4, H * h * (1 + heave * 0.8));
    for (const p of this.plateInfo) {
      // scale the unit mound, tip the plate about its outer rim so its
      // inner point lifts, and push it out along the cracks
      _m.makeScale(R, hs, R);
      const t = tilt * p.tilt + heave * 0.25 * p.tilt;
      _axis.crossVectors(UP, p.dir).normalize();
      _q.setFromAxisAngle(_axis, t);
      _v.copy(p.dir).multiplyScalar(R);
      _m2.makeTranslation(-_v.x, 0, -_v.z);
      _m.premultiply(_m2);
      _m2.makeRotationFromQuaternion(_q);
      _m.premultiply(_m2);
      const out = R * (gap + heave * 0.05) * p.push;
      _m2.makeTranslation(_v.x + p.dir.x * out, 0, _v.z + p.dir.z * out);
      _m.premultiply(_m2);
      p.m.copy(_m);
    }
    this.plates.visible = h > 0.004;
    if (this.plates.visible) {
      const pa = this.plates.geometry.attributes.position;
      const na = this.plates.geometry.attributes.normal;
      const P = pa.array;
      const N = na.array;
      const bp = this.basePos;
      const bn = this.baseNor;
      let last = -1;
      let e = null;
      let ne = null;
      for (let i = 0, c = this.owner.length; i < c; i++) {
        const k = this.owner[i];
        if (k !== last) {
          last = k;
          e = this.plateInfo[k].m.elements;
          ne = _n3.getNormalMatrix(this.plateInfo[k].m).elements;
        }
        const x = bp[i * 3];
        const y = bp[i * 3 + 1];
        const z = bp[i * 3 + 2];
        P[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        P[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        P[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const nx = bn[i * 3];
        const ny = bn[i * 3 + 1];
        const nz = bn[i * 3 + 2];
        let ox = ne[0] * nx + ne[3] * ny + ne[6] * nz;
        let oy = ne[1] * nx + ne[4] * ny + ne[7] * nz;
        let oz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
        const l = Math.hypot(ox, oy, oz) || 1;
        N[i * 3] = ox / l;
        N[i * 3 + 1] = oy / l;
        N[i * 3 + 2] = oz / l;
      }
      pa.needsUpdate = true;
      na.needsUpdate = true;
      this.plates.geometry.computeBoundingSphere();
    }

    for (let i = 0; i < CRUMBS; i++) {
      const c = this.crumbInfo[i];
      // where the crumb sits on its plate, in bed space
      const onPlate = _v.copy(c.local).applyMatrix4(this.plateInfo[c.plate].m);
      onPlate.y += c.size * 0.45;
      const k = smooth(c.tCover, c.tCover + 0.012, g);
      const pos = _p.copy(c.rim).lerp(onPlate, k);
      pos.y += Math.sin(k * Math.PI) * R * 0.25;
      if (c.roll) {
        const r = smooth(c.tRoll, c.tRoll + 0.05, g);
        pos.lerp(c.out, r);
        pos.y += Math.sin(r * Math.PI) * R * 0.12;
      }
      _q.setFromEuler(c.rot);
      _s.setScalar(c.size);
      _m.compose(pos, _q, _s);
      this.crumbs.setMatrixAt(i, _m);
    }
    this.crumbs.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.plates.geometry.dispose();
    this.crumbs.dispose();
  }
}
