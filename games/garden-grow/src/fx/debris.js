// Things that fall and settle: flower petals and crumbs of soil. Each is one
// instanced mesh with a fixed pool, so a burst allocates nothing.
//
// Petals are small curved, veined blades that let the sun through from
// behind. They pop up, then fall like leaves do: slowly, rocking side to side
// and drifting with the breeze, settle on the ground and fade after a while.
// Soil crumbs pop up, fall, bounce once and sink back into the bed.
import * as THREE from 'three';
import { canvasTexture } from '../shared.js';
import { wind } from '../shared.js';
import { lumpGeometry } from './geom.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpC = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// A petal one unit long lying in the xz plane (length along +z from its
// base at the origin), cupped upwards, with its tip curling a little.
function petalGeometry() {
  const nu = 6;
  const nv = 10;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    // narrow claw at the base, broad in the middle, a round tip
    const w = 0.5 * (0.18 + 0.82 * Math.pow(Math.sin(Math.PI * (0.06 + v * 0.9)), 0.75)) * (0.55 + 0.45 * Math.sqrt(v));
    for (let i = 0; i <= nu; i++) {
      const u = i / nu - 0.5;
      const x = u * 2 * w;
      const cup = 0.2 * (u * 2) * (u * 2) * w;
      const curl = 0.12 * v * v * v;
      pos.push(x, cup + curl, v * (1 - 0.08 * v * v));
      uv.push(i / nu, v);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + nu + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // centre it on its middle so it tumbles about its own centre
  g.translate(0, 0, -0.5);
  return g;
}

// Veins fanning from the base, a paler rim and a deeper throat; white, so
// each petal's own colour tints it.
function petalTexture() {
  return canvasTexture(
    64,
    128,
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        const v = 1 - y / h; // 0 at the base
        for (let x = 0; x < w; x++) {
          const u = (x / w) * 2 - 1;
          // veins run from the base outwards
          const ang = u / Math.max(0.15, v + 0.1);
          const vein = Math.pow(Math.abs(Math.sin(ang * 9)), 18) * 0.12 * (1 - v * 0.5);
          const mid = Math.exp(-u * u * 90) * 0.1 * (1 - v);
          const throat = (1 - Math.min(1, v * 4)) * 0.22;
          const rim = Math.max(0, Math.abs(u) - 0.75) * 0.3 + Math.max(0, v - 0.85) * 0.4;
          const c = Math.min(1, 0.93 - vein - mid - throat + rim);
          const i = (y * w + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * c;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    { srgb: true, repeat: false },
  );
}

// Standard material, plus sunlight coming through the petal from behind.
function petalMaterial() {
  const m = new THREE.MeshStandardMaterial({ map: petalTexture(), side: THREE.DoubleSide, roughness: 0.52, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
      {
        vec3 L = directionalLights[0].direction;
        float through = max(dot(-normal, L), 0.0);
        float glow = 0.6 + 0.8 * pow(max(dot(-geometryViewDir, L), 0.0), 3.0);
        reflectedLight.directDiffuse += diffuseColor.rgb * diffuseColor.rgb * directionalLights[0].color * through * glow * 0.55 * RECIPROCAL_PI;
      }
#endif`,
    );
  };
  return m;
}

export class Petals {
  constructor(scene, capacity, floorAt) {
    this.capacity = capacity;
    this.floorAt = floorAt;
    this.mesh = new THREE.InstancedMesh(petalGeometry(), petalMaterial(), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, ZERO);
      this.mesh.setColorAt(i, tmpC.set(1, 1, 1));
    }
    this.items = [];
    for (let i = 0; i < capacity; i++) {
      this.items.push({ on: false, aspect: 0.7, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, spin: 0, rx: 0, rz: 0, tx: 0, tz: 0, tvx: 0, tvz: 0, phase: 0, freq: 5, amp: 0.1, size: 0.02, floor: 0, rest: false, restFor: 4, age: 0, restAge: 0 });
    }
    this.next = 0;
    this.live = 0;
    scene.add(this.mesh);
  }

  // pos: where the flower is; colors: CSS colours or THREE.Colors
  burst(pos, colors, count, { floor = null, gentle = false, size = 0.022 } = {}) {
    const speed = gentle ? 0.6 : 1;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.capacity;
      const p = this.items[i];
      p.on = true;
      p.rest = false;
      p.age = 0;
      p.restAge = 0;
      const a = Math.random() * Math.PI * 2;
      const out = (0.25 + Math.random() * 0.55) * speed;
      p.x = pos.x + Math.cos(a) * 0.02;
      p.y = pos.y + (Math.random() - 0.3) * 0.02;
      p.z = pos.z + Math.sin(a) * 0.02;
      p.vx = Math.cos(a) * out;
      p.vz = Math.sin(a) * out;
      p.vy = (0.55 + Math.random() * 0.8) * speed;
      p.yaw = Math.random() * Math.PI * 2;
      p.spin = (Math.random() - 0.5) * 9 * speed;
      // tumbling at first, then settling into a leaf's rocking fall
      p.tx = Math.random() * 6;
      p.tz = Math.random() * 6;
      p.tvx = (Math.random() - 0.5) * 16 * speed;
      p.tvz = (Math.random() - 0.5) * 16 * speed;
      p.phase = Math.random() * 6.3;
      p.freq = 3 + Math.random() * 2.5;
      p.amp = (0.12 + Math.random() * 0.14) * speed;
      p.size = size * (0.6 + Math.random() * 0.7);
      p.aspect = 0.55 + Math.random() * 0.35; // some slim, some broad
      p.floor = floor;
      p.restFor = 3.5 + Math.random() * 3;
      const c = colors[(Math.random() * colors.length) | 0];
      tmpC.set(c);
      // petals of one flower still differ a little
      tmpC.offsetHSL((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08);
      this.mesh.setColorAt(i, tmpC);
      if (i + 1 > this.mesh.count) this.mesh.count = i + 1;
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.live += count;
  }

  update(dt) {
    if (this.live <= 0) return;
    let live = 0;
    const wd = wind.uWindDir.value;
    const ws = wind.uWindStrength.value;
    for (let i = 0; i < this.mesh.count; i++) {
      const p = this.items[i];
      if (!p.on) continue;
      p.age += dt;
      let scale = p.size;
      if (!p.rest) {
        // air holds a petal up: little drag rising, a lot falling
        const kv = p.vy > 0 ? 3 : 30;
        p.vy += (-9.81 - kv * p.vy) * dt;
        const kh = Math.exp(-2.4 * dt);
        p.vx *= kh;
        p.vz *= kh;
        p.phase += p.freq * dt;
        const falling = p.vy < 0 ? 1 : 0.2;
        const sway = Math.sin(p.phase) * p.amp * falling;
        p.x += (p.vx + wd.x * 0.05 * ws + Math.cos(p.yaw) * sway) * dt;
        p.z += (p.vz + wd.y * 0.05 * ws - Math.sin(p.yaw) * sway) * dt;
        p.y += p.vy * dt;
        p.yaw += p.spin * dt;
        p.spin *= Math.exp(-1.2 * dt);
        const damp = Math.exp(-2.5 * dt);
        p.tvx *= damp;
        p.tvz *= damp;
        p.tx += p.tvx * dt;
        p.tz += p.tvz * dt;
        // pull the tumble back towards flat, rocking with the sway
        const settle = 1 - Math.exp(-1.5 * p.age);
        p.rx = p.tx * (1 - settle) + (Math.round(p.tx / Math.PI) * Math.PI + Math.cos(p.phase) * 0.55) * settle;
        p.rz = p.tz * (1 - settle) + (Math.round(p.tz / Math.PI) * Math.PI + Math.sin(p.phase * 0.7) * 0.3) * settle;
        const floor = (p.floor ?? this.floorAt(p.x, p.z)) + 0.0015;
        if (p.y <= floor && p.vy < 0) {
          p.y = floor;
          p.rest = true;
          p.rx = Math.round(p.rx / Math.PI) * Math.PI + (Math.random() - 0.5) * 0.25;
          p.rz = Math.round(p.rz / Math.PI) * Math.PI + (Math.random() - 0.5) * 0.25;
        }
      } else {
        p.restAge += dt;
        if (p.restAge > p.restFor) {
          const k = (p.restAge - p.restFor) / 1.2;
          if (k >= 1) {
            p.on = false;
            this.mesh.setMatrixAt(i, ZERO);
            continue;
          }
          scale *= 1 - k * k;
        }
      }
      live++;
      tmpE.set(p.rx, p.yaw, p.rz, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpS.set(scale * p.aspect, scale, scale);
      tmpP.set(p.x, p.y, p.z);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.live = live;
    if (!live) this.mesh.count = 0;
  }
}

export class Clods {
  constructor(scene, capacity, floorAt) {
    this.capacity = capacity;
    this.floorAt = floorAt;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0, flatShading: true });
    this.mesh = new THREE.InstancedMesh(lumpGeometry(3), mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, ZERO);
      this.mesh.setColorAt(i, tmpC.set(1, 1, 1));
    }
    this.items = [];
    for (let i = 0; i < capacity; i++) this.items.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, size: 0.003, floor: 0, rest: false, bounced: false, restAge: 0, restFor: 2 });
    this.next = 0;
    this.live = 0;
    scene.add(this.mesh);
  }

  puff(pos, count, { floor = null, gentle = false } = {}) {
    const speed = gentle ? 0.65 : 1;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.capacity;
      const c = this.items[i];
      const a = Math.random() * Math.PI * 2;
      const out = (0.08 + Math.random() * 0.32) * speed;
      c.on = true;
      c.rest = false;
      c.bounced = false;
      c.restAge = 0;
      c.restFor = 1.2 + Math.random() * 1.8;
      c.x = pos.x + Math.cos(a) * 0.012;
      c.y = pos.y + 0.004;
      c.z = pos.z + Math.sin(a) * 0.012;
      c.vx = Math.cos(a) * out;
      c.vz = Math.sin(a) * out;
      c.vy = (0.45 + Math.random() * 0.75) * speed;
      c.rx = Math.random() * 6;
      c.ry = Math.random() * 6;
      c.rz = Math.random() * 6;
      c.sx = (Math.random() - 0.5) * 24;
      c.sy = (Math.random() - 0.5) * 24;
      c.sz = (Math.random() - 0.5) * 24;
      // mostly small crumbs, a few bigger lumps
      c.size = 0.0016 + Math.pow(Math.random(), 2.2) * 0.0042;
      c.floor = floor;
      // dry crumbs are paler, damp ones darker
      const d = Math.random();
      tmpC.setRGB(0.2 + d * 0.16, 0.13 + d * 0.1, 0.08 + d * 0.06).convertSRGBToLinear();
      this.mesh.setColorAt(i, tmpC);
      if (i + 1 > this.mesh.count) this.mesh.count = i + 1;
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.live += count;
  }

  update(dt) {
    if (this.live <= 0) return;
    let live = 0;
    for (let i = 0; i < this.mesh.count; i++) {
      const c = this.items[i];
      if (!c.on) continue;
      let sink = 0;
      if (!c.rest) {
        c.vy -= 9.81 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        c.rx += c.sx * dt;
        c.ry += c.sy * dt;
        c.rz += c.sz * dt;
        const floor = (c.floor ?? this.floorAt(c.x, c.z)) + c.size * 0.6;
        if (c.y < floor && c.vy < 0) {
          c.y = floor;
          if (!c.bounced && c.vy < -0.6) {
            // one small bounce, then it stays
            c.bounced = true;
            c.vy *= -0.22;
            c.vx *= 0.4;
            c.vz *= 0.4;
            c.sx *= 0.3;
            c.sy *= 0.3;
            c.sz *= 0.3;
          } else c.rest = true;
        }
      } else {
        c.restAge += dt;
        if (c.restAge > c.restFor) {
          // settles back into the soil
          const k = (c.restAge - c.restFor) / 0.9;
          if (k >= 1) {
            c.on = false;
            this.mesh.setMatrixAt(i, ZERO);
            continue;
          }
          sink = k * c.size * 1.4;
        }
      }
      live++;
      tmpE.set(c.rx, c.ry, c.rz, 'XYZ');
      tmpQ.setFromEuler(tmpE);
      tmpS.setScalar(c.size);
      tmpP.set(c.x, c.y - sink, c.z);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.live = live;
    if (!live) this.mesh.count = 0;
  }
}
