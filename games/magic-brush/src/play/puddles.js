// Paint puddles (Big kids): pick a colour and a shiny puddle of it lands on
// the lawn or deck, with a splat of little drops. Friends run to jump in a
// fresh puddle, and any friend that walks through one carries the paint on
// its feet and leaves coloured tracks (a paw, a foot, a hoof, a tyre, a star,
// depending on the friend) that fade after about ten seconds, so the garden
// fills with colourful trails. The puddles dry up after a while.
//
// A puddle is a glossy raised blob of paint, a plane with a blobby alpha
// shape and a domed normal map on a clear-coated physical material, so it
// catches the sky and the sun like wet paint; friends' shadows fall on it. The
// prints are flat decals from pooled instanced meshes, one per print shape,
// with a per-print fade.
import * as THREE from 'three';
import { COLORS } from '../paint/tools.js';
import { rand, clamp, easeBack, TAU, REDUCED_MOTION } from '../config.js';

const MAX_PUDDLES = 5;
const MAX_PRINTS = 72;
const PRINT_LIFE = 10;
const DRY_AFTER = 45;
const PRINT_OF = { dragon: 'paw', unicorn: 'round', fox: 'paw', elephant: 'round', whale: 'round', butterfly: 'star', car: 'tyre', rocket: 'star', teddy: 'foot', bunny: 'paw', kitten: 'paw', puppy: 'paw', penguin: 'foot', turtle: 'round' };
const KINDS = ['paw', 'foot', 'round', 'tyre', 'star'];
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _vel = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------ pictures

const canvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

function tex(c, srgb = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// the blob outline: a wobbly circle
const blobR = (a) => 0.8 + 0.06 * Math.sin(3 * a + 0.7) + 0.045 * Math.sin(5 * a + 2.1) + 0.03 * Math.sin(8 * a + 4);

// alpha (in green), a domed normal map, and a colour map with a darker rim and a few light streaks
function puddleMaps() {
  const S = 256;
  const alpha = canvas(S, S);
  const normal = canvas(S, S);
  const color = canvas(S, S);
  const ga = alpha.getContext('2d').createImageData(S, S);
  const gn = normal.getContext('2d').createImageData(S, S);
  const gc = color.getContext('2d').createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const ux = (x + 0.5) / S * 2 - 1;
      const uy = 1 - (y + 0.5) / S * 2;
      const r = Math.hypot(ux, uy);
      const edge = blobR(Math.atan2(uy, ux));
      const k = r / edge; // 1 at the outline
      const i = (y * S + x) * 4;
      const a = clamp((1 - k) / 0.06, 0, 1);
      ga.data[i] = ga.data[i + 1] = ga.data[i + 2] = a * 255;
      ga.data[i + 3] = 255;
      // a flat top and a curved rim, tilting away from the middle
      const sl = Math.min(1, Math.max(0, (k - 0.5) / 0.45)) ** 1.5 * 0.9;
      const nx = (ux / (r || 1)) * sl;
      const ny = (uy / (r || 1)) * sl;
      const nl = Math.hypot(nx, ny, 1);
      gn.data[i] = (nx / nl * 0.5 + 0.5) * 255;
      gn.data[i + 1] = (ny / nl * 0.5 + 0.5) * 255;
      gn.data[i + 2] = (1 / nl * 0.5 + 0.5) * 255;
      gn.data[i + 3] = 255;
      // a little darker and richer at the rim, lighter in a soft swirl inside
      const rim = 1 - 0.28 * Math.min(1, Math.max(0, (k - 0.6) / 0.4)) ** 2;
      const sw = 0.06 * Math.sin(ux * 7 + Math.sin(uy * 5) * 2) * (1 - k);
      const v = clamp(rim + sw, 0, 1) * 255;
      gc.data[i] = gc.data[i + 1] = gc.data[i + 2] = v;
      gc.data[i + 3] = 255;
    }
  }
  alpha.getContext('2d').putImageData(ga, 0, 0);
  normal.getContext('2d').putImageData(gn, 0, 0);
  color.getContext('2d').putImageData(gc, 0, 0);
  return { alpha: tex(alpha), normal: tex(normal), color: tex(color, true) };
}

// the print shapes: white on black, toes at the top (the front)
function printAlpha(kind) {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  const oval = (x, y, rx, ry, rot = 0) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, TAU);
    g.fill();
  };
  if (kind === 'paw') {
    oval(32, 42, 14, 11);
    oval(14, 26, 5.5, 7, -0.45);
    oval(25, 15, 5.5, 7.5, -0.15);
    oval(39, 15, 5.5, 7.5, 0.15);
    oval(50, 26, 5.5, 7, 0.45);
  } else if (kind === 'foot') {
    oval(32, 44, 13, 12);
    oval(14, 24, 5, 8, -0.4);
    oval(32, 13, 5.5, 9);
    oval(50, 24, 5, 8, 0.4);
  } else if (kind === 'round') {
    oval(32, 38, 21, 19);
    oval(12, 15, 4.5, 5.5, -0.3);
    oval(24, 9, 4.5, 5.5);
    oval(40, 9, 4.5, 5.5);
    oval(52, 15, 4.5, 5.5, 0.3);
  } else if (kind === 'tyre') {
    g.beginPath();
    g.roundRect(20, 3, 24, 58, 7);
    g.fill();
    g.fillStyle = '#000';
    for (let y = 10; y < 60; y += 9) g.fillRect(20, y, 24, 3);
  } else {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 12 : 27;
      g[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * r, 34 + Math.sin(a) * r);
    }
    g.closePath();
    g.lineJoin = 'round';
    g.lineWidth = 6;
    g.strokeStyle = '#fff';
    g.stroke();
    g.fill();
  }
  return tex(c);
}

// a physical material whose opacity is also scaled by a per-instance fade
function fadeMaterial(params) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vFade;');
  };
  return m;
}

export class Puddles {
  constructor(T) {
    this.T = T;
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    // puddles
    const maps = puddleMaps();
    this.maps = maps;
    this.mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: maps.color,
      alphaMap: maps.alpha,
      normalMap: maps.normal,
      normalScale: new THREE.Vector2(1, 1),
      roughness: 0.07,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.InstancedMesh(plane, this.mat, MAX_PUDDLES);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = -2;
    this.mesh.count = MAX_PUDDLES;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.list = [];
    for (let i = 0; i < MAX_PUDDLES; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, _c.set(1, 1, 1));
      this.list.push({ on: false, x: 0, z: 0, r: 0.3, age: 0, rot: 0, sx: 1, sz: 1, color: new THREE.Color(), jiggle: 0, y: 0, dry: -1 });
    }
    T.scene.add(this.mesh);
    // prints
    this.kinds = {};
    for (const kind of KINDS) {
      const fade = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PRINTS), 1);
      fade.setUsage(THREE.DynamicDrawUsage);
      const geo = plane.clone().rotateY(Math.PI);
      geo.setAttribute('aFade', fade);
      const alphaMap = printAlpha(kind);
      const mat = fadeMaterial({ color: 0xffffff, alphaMap, roughness: 0.42, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const mesh = new THREE.InstancedMesh(geo, mat, MAX_PRINTS);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.renderOrder = -1;
      for (let i = 0; i < MAX_PRINTS; i++) {
        mesh.setMatrixAt(i, zero);
        mesh.setColorAt(i, _c.set(1, 1, 1));
      }
      T.scene.add(mesh);
      this.kinds[kind] = { mesh, fade, alphaMap, mat, geo, next: 0, age: new Float32Array(MAX_PRINTS).fill(-1), a0: new Float32Array(MAX_PRINTS), live: 0 };
    }
    this.state = new WeakMap(); // per friend: { lx, lz, dist, side, amt, color }
    this.baseGeo = plane;
  }

  // ------------------------------------------------------------ making puddles

  // a puddle of the chosen colour lands on (x, z); false if there is no room
  drop(x, z, colorName = this.T.color) {
    const { T } = this;
    const nav = T.friends.nav;
    if (!nav.free(x, z, 0.12)) {
      const near = nav.nearestFree(x, z, 0.16);
      if (!near || Math.hypot(near.x - x, near.z - z) > 1.0) return false;
      x = near.x;
      z = near.z;
    }
    let p = this.list.find((o) => !o.on);
    if (!p) {
      // the oldest dries up at once
      p = this.list.reduce((a, b) => (a.age > b.age ? a : b));
    }
    p.on = true;
    p.x = x;
    p.z = z;
    p.y = T.groundAt(x, z) + 0.014;
    p.r = rand(0.27, 0.34);
    p.age = 0;
    p.rot = rand(0, TAU);
    p.sx = rand(0.92, 1.1);
    p.sz = rand(0.92, 1.1);
    p.jiggle = 1;
    p.dry = -1;
    p.color.setHex(COLORS[colorName] ?? COLORS.pink);
    // the splat: drops of paint fly up and land around it
    const n = T.amount(18);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(0.4, 1.3);
      T.fx.droplets.throw(_v.set(x, p.y + 0.03, z), _vel.set(Math.cos(a) * sp, rand(1.4, 2.6), Math.sin(a) * sp), p.color, rand(0.005, 0.011), false);
    }
    T.fx.sparkles.burst(_v.set(x, p.y + 0.05, z), T.amount(14), { colors: [[1.8, 1.4, 0.8], [1.5, 1.2, 1.9]], speed: 0.5, up: 0.5, size: 0.016, life: 0.9 });
    T.snd.drop();
    T.snd.splash();
    this.invite(p);
    return true;
  }

  // the palette button: a puddle a little way in front of a friend
  dropNear() {
    const { T } = this;
    const list = T.friends.list.filter((e) => !e.leaving && e.home === 'ground' && e.friend.walkSpeed > 0 && e.state !== 'journey');
    const who = list.length ? list[(Math.random() * list.length) | 0] : null;
    if (who) {
      const rr = who.friend.restRadius * who.scale;
      for (let i = 0; i < 14; i++) {
        const a = who.heading + rand(-1.1, 1.1);
        const d = rr + rand(0.55, 1.0);
        const x = who.pos.x + Math.sin(a) * d;
        const z = who.pos.z + Math.cos(a) * d;
        if (T.friends.nav.free(x, z, 0.35) && !this.list.some((o) => o.on && Math.hypot(o.x - x, o.z - z) < 0.6) && this.drop(x, z)) return;
      }
    }
    const s = T.friends.stageSpot(null, 0.7);
    this.drop(s.x, s.z);
  }

  // friends run to jump in a fresh puddle: up to two of the nearest
  invite(p) {
    const { T } = this;
    const near = T.freeWalkers()
      .map((e) => ({ e, d: Math.hypot(e.pos.x - p.x, e.pos.z - p.z) }))
      .filter((o) => o.d < 5)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    near.forEach(({ e, d }, i) => {
      T.later(i * 0.35, () => {
        if (!T.free(e) || !p.on) return;
        T.go(e, 'paint', { x: p.x + rand(-0.06, 0.06), z: p.z + rand(-0.06, 0.06) }, { pace: d > 1 ? 'run' : 'walk', stopR: 0.02, onArrive: (en) => this.jumpIn(en, p) });
      });
    });
  }

  jumpIn(e, p) {
    const { T } = this;
    if (!T.mine(e, 'paint')) return;
    T.friends.emote(e, 'hop', 0.95);
    this.dip(e, p);
    T.later(0.4, () => this.splash(e, p));
    T.later(0.85, () => this.splash(e, p));
    T.later(1.15, () => {
      if (!T.mine(e, 'paint')) return;
      T.done(e);
      // and off across the lawn, leaving tracks
      const s = T.friends.stageSpot(e.pos, 1.2);
      T.friends.send(e, s, { pace: 'walk' });
    });
  }

  // a splash as a friend lands in the paint
  splash(e, p) {
    const { T } = this;
    if (!T.friends.list.includes(e) || e.leaving) return;
    p.jiggle = 1;
    const n = T.amount(10);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(0.3, 1.0);
      T.fx.droplets.throw(_v.set(e.pos.x, p.y + 0.04, e.pos.z), _vel.set(Math.cos(a) * sp, rand(1.2, 2.2), Math.sin(a) * sp), p.color, rand(0.005, 0.009), false);
    }
    T.snd.splash();
    this.dip(e, p);
    // a couple of prints where it landed
    const s = this.state.get(e);
    if (s) {
      this.stamp(e, s, -1, 0);
      this.stamp(e, s, 1, 0);
    }
  }

  // the friend's feet are wet with this paint
  dip(e, p) {
    let s = this.state.get(e);
    if (!s) {
      s = { lx: e.pos.x, lz: e.pos.z, dist: 0, side: 1, amt: 0, color: new THREE.Color() };
      this.state.set(e, s);
    }
    s.amt = 1;
    s.color.copy(p.color);
  }

  // ------------------------------------------------------------ prints

  kindOf(e) {
    return PRINT_OF[e.friend.info.id] || 'paw';
  }

  // one print (or a pair, for a car) beside the friend
  stamp(e, s, side, along) {
    const kind = this.kindOf(e);
    const K = this.kinds[kind];
    const rr = e.friend.restRadius * e.scale;
    const size = clamp(0.05 + 0.11 * rr, 0.06, 0.17);
    const h = e.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const lat = kind === 'tyre' ? clamp(rr * 0.32, 0.06, 0.16) : rr * 0.14 + size * 0.3;
    const sides = kind === 'tyre' ? [-1, 1] : [side];
    for (const sd of sides) {
      const x = e.pos.x + fz * sd * lat + fx * along;
      const z = e.pos.z - fx * sd * lat + fz * along;
      const i = K.next;
      K.next = (K.next + 1) % MAX_PRINTS;
      const y = this.T.groundAt(x, z) + 0.018;
      const w = kind === 'tyre' ? size * 0.55 : size;
      const l = kind === 'tyre' ? size * 1.4 : size;
      _m.compose(_v.set(x, y, z), _q.setFromAxisAngle(UP, h + rand(-0.12, 0.12)), _s.set(w, 1, l));
      K.mesh.setMatrixAt(i, _m);
      K.mesh.setColorAt(i, s.color);
      K.age[i] = 0;
      K.a0[i] = clamp(0.35 + 0.65 * s.amt, 0.3, 1);
      K.fade.array[i] = K.a0[i];
      K.live++;
      K.dirty = true;
    }
  }

  // the frame's tracks: friends dip in puddles, walk, and leave prints
  tracks(dt) {
    const { T } = this;
    let any = false;
    for (const p of this.list) if (p.on && p.dry < 0) any = true;
    for (const e of T.friends.list) {
      if (e.leaving || e.home !== 'ground' || e.state === 'journey') continue;
      let s = this.state.get(e);
      if (!s) {
        if (!any) continue;
        s = { lx: e.pos.x, lz: e.pos.z, dist: 0, side: 1, amt: 0, color: new THREE.Color() };
        this.state.set(e, s);
      }
      // wading into a puddle wets the feet
      if (any) {
        for (const p of this.list) {
          if (!p.on || p.dry >= 0) continue;
          if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < p.r * 0.85) {
            s.amt = 1;
            s.color.copy(p.color);
          }
        }
      }
      const dx = e.pos.x - s.lx;
      const dz = e.pos.z - s.lz;
      const step = Math.hypot(dx, dz);
      s.lx = e.pos.x;
      s.lz = e.pos.z;
      if (s.amt <= 0 || step > 0.4 || step < 1e-5) continue;
      s.dist += step;
      const rr = e.friend.restRadius * e.scale;
      const stride = clamp(0.1 + 0.28 * rr, 0.12, 0.3);
      while (s.dist >= stride) {
        s.dist -= stride;
        s.side = -s.side;
        this.stamp(e, s, s.side, s.side * stride * 0.25);
        s.amt -= 0.042;
        if (s.amt <= 0) break;
      }
    }
  }

  // ------------------------------------------------------------ the frame

  update(dt) {
    this.tracks(dt);
    // puddles: a springy landing, a wobble when jumped in, drying up after a while
    let anyP = false;
    for (let i = 0; i < MAX_PUDDLES; i++) {
      const p = this.list[i];
      if (!p.on) continue;
      anyP = true;
      p.age += dt;
      if (p.dry < 0 && p.age > DRY_AFTER) p.dry = 0;
      let grow = easeBack(clamp(p.age / 0.45, 0, 1), 1.9);
      if (p.dry >= 0) {
        p.dry += dt;
        grow *= Math.max(0, 1 - p.dry / 2.2);
        if (p.dry >= 2.2) {
          p.on = false;
          this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
          continue;
        }
      }
      p.jiggle = Math.max(0, p.jiggle - dt * 1.6);
      const wob = REDUCED_MOTION.matches ? 0 : Math.sin(p.age * 24) * 0.05 * p.jiggle * p.jiggle;
      const d = p.r * 2 * Math.max(0.001, grow);
      _m.compose(_v.set(p.x, p.y, p.z), _q.setFromAxisAngle(UP, p.rot), _s.set(d * p.sx * (1 + wob), 1, d * p.sz * (1 - wob)));
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, p.color);
    }
    if (anyP || this.wasP) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    this.wasP = anyP;
    // prints age and fade
    for (const kind of KINDS) {
      const K = this.kinds[kind];
      if (K.live > 0) {
        for (let i = 0; i < MAX_PRINTS; i++) {
          if (K.age[i] < 0) continue;
          K.age[i] += dt;
          const left = PRINT_LIFE - K.age[i];
          if (left <= 0) {
            K.age[i] = -1;
            K.live--;
            K.fade.array[i] = 0;
            K.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
            K.dirty = true;
            continue;
          }
          K.fade.array[i] = K.a0[i] * Math.min(1, left / 3.5);
        }
        K.fade.needsUpdate = true;
      }
      if (K.dirty) {
        K.mesh.instanceMatrix.needsUpdate = true;
        if (K.mesh.instanceColor) K.mesh.instanceColor.needsUpdate = true;
        K.dirty = false;
      }
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mat.dispose();
    for (const t of Object.values(this.maps)) t.dispose();
    this.mesh.dispose();
    for (const K of Object.values(this.kinds)) {
      K.mesh.removeFromParent();
      K.geo.dispose();
      K.mat.dispose();
      K.alphaMap.dispose();
      K.mesh.dispose();
    }
    this.baseGeo.dispose();
  }
}

