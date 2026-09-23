// The burst. The skin dimples under the point, a tear races out from the
// puncture with fingers running ahead of it, and the envelope comes apart
// into ragged pieces of its own fabric: small tatters round the hole, long
// panel strips further away. The pieces are flung out, caught by the air,
// then flutter and tumble down into the sea.
import * as THREE from 'three';
import {
  GORES,
  ENVELOPE_CENTER,
  envelopeFrame,
  goreWidthAt,
  PROFILE_LENGTH,
  patchEnvelopeMaterial,
  createEnvelopeMaterial,
} from './envelope.js';
import { TEAR_SPEED } from './balloon.js';
import { ParticleSystem } from './particles.js';
import { REDUCED_MOTION } from './config.js';

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function tearFingers(phi, seed) {
  return Math.abs(Math.sin(phi * 2.5 + seed)) ** 5 * 0.55 + Math.abs(Math.sin(phi * 5 + seed * 2.3)) ** 9 * 0.35;
}

// Instanced shreds: one draw call for every piece of every burst.
class ShredField {
  constructor({ capacity, ripstop, gold, noise }) {
    this.capacity = capacity;
    const geo = new THREE.PlaneGeometry(1, 1, 4, 12);
    this.uvRect = new Float32Array(capacity * 4);
    this.shred = new Float32Array(capacity * 4);
    this.shred2 = new Float32Array(capacity * 2);
    this.uvRectAttr = new THREE.InstancedBufferAttribute(this.uvRect, 4);
    this.shredAttr = new THREE.InstancedBufferAttribute(this.shred, 4).setUsage(THREE.DynamicDrawUsage);
    this.shred2Attr = new THREE.InstancedBufferAttribute(this.shred2, 2);
    geo.setAttribute('aUvRect', this.uvRectAttr);
    geo.setAttribute('aShred', this.shredAttr);
    geo.setAttribute('aShred2', this.shred2Attr);
    const material = createEnvelopeMaterial({ ripstop, gold });
    material.flatShading = true;
    material.normalMap = null;
    this.uniforms = { uGlow: { value: 0.8 }, uTime: { value: 0 } };
    patchEnvelopeMaterial(material, this.uniforms, { shred: true });
    this.mesh = new THREE.InstancedMesh(geo, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.name = gold ? 'shreds-gold' : 'shreds';
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, zero);
    this.items = Array.from({ length: capacity }, () => ({
      state: 0, // 0 free, 1 waiting for the tear, 2 flying, 3 floating
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      spin: new THREE.Vector3(),
      w: 1,
      h: 1,
      shrink: 1,
      delay: 0,
      age: 0,
      curl: 0,
      curlTarget: 0.6,
      flutter: 0,
      tumble: new THREE.Vector3(),
      fall: 3,
      floatAge: 0,
      balloon: null,
      local: new THREE.Vector3(),
      localN: new THREE.Vector3(),
      localTu: new THREE.Vector3(),
      outward: 0,
    }));
    this.next = 0;
  }

  alloc() {
    for (let n = 0; n < this.capacity; n++) {
      const i = (this.next + n) % this.capacity;
      if (this.items[i].state === 0) {
        this.next = (i + 1) % this.capacity;
        return i;
      }
    }
    // steal the oldest floating one
    const i = this.next;
    this.next = (i + 1) % this.capacity;
    return i;
  }
}

export class PopFX {
  constructor({ scene, assets, noise, quality, sea, audio, onKick, onShock, flashTexture }) {
    this.scene = scene;
    this.sea = sea;
    this.audio = audio;
    this.onKick = onKick;
    this.onShock = onShock;
    this.quality = quality;
    this.fabric = new ShredField({ capacity: quality.shreds, ripstop: assets.ripstop, gold: false, noise });
    this.gold = new ShredField({ capacity: Math.round(quality.shreds * 0.4), ripstop: assets.ripstop, gold: true, noise });
    scene.add(this.fabric.mesh, this.gold.mesh);

    this.dust = new ParticleSystem({ capacity: quality.tier === 'low' ? 400 : 900, softness: 2.2, name: 'dust' });
    this.sparks = new ParticleSystem({ capacity: 500, additive: true, softness: 1.2, name: 'sparks' });
    this.spray = new ParticleSystem({ capacity: quality.tier === 'low' ? 600 : 1400, softness: 1.4, name: 'spray' });
    scene.add(this.dust.points, this.sparks.points, this.spray.points);

    // Flash sprites (HDR so bloom picks them up). The shock wave itself is a
    // screen-space distortion in post.js.
    this.flashes = [];
    for (let i = 0; i < 4; i++) {
      const flash = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: flashTexture,
          color: new THREE.Color(1, 0.9, 0.75),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          fog: false,
        }),
      );
      flash.visible = false;
      flash.renderOrder = 20;
      scene.add(flash);
      this.flashes.push({ flash, age: -1, size: 1 });
    }
    this.flashIndex = 0;
    this.light = new THREE.PointLight(0xffe2c0, 0, 40, 2);
    scene.add(this.light);
    this.lightAge = -1;
    this.lightPower = 0;
    this.pending = []; // balloons being torn
    this.landings = [];
    this.splashBudget = 0;
    this.time = 0;
  }

  setPixelScale(s) {
    this.dust.setPixelScale(s);
    this.sparks.setPixelScale(s);
    this.spray.setPixelScale(s);
  }

  // Called when the tool's point touches the skin (the moment of rupture).
  burst(balloon, localPoint, { special = false } = {}) {
    balloon.beginPop(localPoint);
    const S = balloon.size;
    const field = balloon.golden ? this.gold : this.fabric;
    balloon.envelope.updateWorldMatrix(true, false);
    const world = balloon.envelope.matrixWorld;
    const center = balloon.center();
    const puncture = localPoint.clone().applyMatrix4(world);
    const tearDir = balloon.tearDir;
    const seed = balloon.uniforms.uTearSeed.value;
    const ax = tearDir;
    const t1 = new THREE.Vector3().crossVectors(ax, Math.abs(ax.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
    const t2 = new THREE.Vector3().crossVectors(ax, t1);

    // Carve the envelope along its panels: small tatters near the puncture
    // where the fabric shatters, long strips on the far side.
    const low = this.quality.tier === 'low';
    const nearRows = low ? 7 : 11;
    const farRows = low ? 2.5 : 3;
    const bodyScale = balloon.body.scale;
    const angleTo = (u, v) => {
      const fr = envelopeFrame(u, v);
      const dirP = tmpV.copy(fr.p).sub(ENVELOPE_CENTER).normalize();
      return { fr, dirP, ang: Math.acos(Math.max(-1, Math.min(1, dirP.dot(ax)))) };
    };
    for (let g = 0; g < GORES; g++) {
      let v0 = 0.02;
      while (v0 < 0.985) {
        const near = 1 - angleTo((g + 0.5) / GORES, v0).ang / Math.PI;
        const rows = farRows + (nearRows - farRows) * near ** 2.2;
        const dv = (0.6 + Math.random() * 0.8) / rows;
        const v1 = v0 + dv > 0.93 ? 0.99 : v0 + dv;
        const split = near > 0.72 && Math.random() < 0.7 ? 2 : 1;
        const du = 1 / GORES / split;
        for (let s = 0; s < split; s++) {
          const u0 = g / GORES + s * du;
          const uc = u0 + du * 0.5;
          const vc = (v0 + v1) * 0.5;
          const { fr, dirP, ang } = angleTo(uc, vc);
          const phi = Math.atan2(dirP.dot(t2), dirP.dot(t1));
          const reach = 1 + tearFingers(phi, seed) * Math.sqrt(Math.sin(ang));
          const i = field.alloc();
          const it = field.items[i];
          it.state = 1;
          it.balloon = balloon;
          it.delay = ang / (TEAR_SPEED * reach);
          it.age = 0;
          it.local.copy(fr.p);
          it.localN.copy(fr.n);
          it.localTu.copy(fr.tu);
          const gw = goreWidthAt(vc);
          it.w = Math.max(0.012, gw / split) * 1.06;
          it.h = (v1 - v0) * PROFILE_LENGTH * 1.04;
          it.curl = 0;
          // long strips roll less and flap more; small tatters crumple
          const long = Math.min(1, it.h / it.w / 5);
          it.curlTarget = (0.35 + Math.random() * 0.7) * (1 - long * 0.5);
          it.flutter = Math.random() * 10;
          it.fall = 2.6 + Math.random() * 1.6 - long * 0.6;
          it.tumble.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4 + (1 - long) * 5);
          it.floatAge = 0;
          it.ang = ang;
          field.uvRect.set([u0, v0, du, v1 - v0], i * 4);
          field.shred.set([balloon.palette, balloon.pattern, Math.random(), 0], i * 4);
          field.shred2.set([gw, long], i * 2);
        }
        v0 = v1;
      }
    }
    field.uvRectAttr.needsUpdate = true;
    field.shred2Attr.needsUpdate = true;
    this.pending.push({ balloon, field, center, world: world.clone(), scale: bodyScale.clone() });

    // Flash of the rupture.
    const slot = this.flashes[this.flashIndex];
    this.flashIndex = (this.flashIndex + 1) % this.flashes.length;
    slot.age = 0;
    slot.size = S;
    slot.special = special;
    slot.flash.position.copy(puncture);
    slot.flash.visible = true;
    slot.gold = balloon.golden;
    this.light.position.copy(puncture).addScaledVector(tmpV.copy(puncture).sub(center).normalize(), S * 0.35);
    this.lightAge = 0;
    this.lightPower = balloon.golden ? 20 : 11;

    // A puff of warm air and lint from the rupture.
    const col = new THREE.Color();
    const n = low ? 30 : 60;
    for (let k = 0; k < n; k++) {
      const dir = tmpV2.copy(tearDir).applyQuaternion(balloon.envelope.getWorldQuaternion(tmpQ));
      dir.x += (Math.random() - 0.5) * 1.4;
      dir.y += (Math.random() - 0.5) * 1.4;
      dir.z += (Math.random() - 0.5) * 1.4;
      dir.normalize();
      const sp = (2 + Math.random() * 6) * S * 0.35;
      col.setRGB(1.0, 0.86, 0.76).multiplyScalar(0.6 + Math.random() * 0.3);
      this.dust.emit(puncture, dir.multiplyScalar(sp), {
        life: 0.5 + Math.random() * 0.7,
        size0: 0.05 * S,
        size1: (0.18 + Math.random() * 0.25) * S,
        color: col,
        alpha: 0.035,
        drag: 3.5,
        gravity: -0.15,
      });
    }
    if (balloon.golden || special) {
      for (let k = 0; k < 140; k++) {
        const dir = tmpV2.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const p = tmpV.copy(center).addScaledVector(dir, S * 0.45 * Math.random());
        col.setRGB(4, 2.6, 1.0).multiplyScalar(0.5 + Math.random());
        this.sparks.emit(p, dir.multiplyScalar(S * (1.5 + Math.random() * 3)), {
          life: 0.8 + Math.random() * 1.2,
          size0: 0.05 * S,
          size1: 0.01 * S,
          color: col,
          alpha: 1,
          drag: 2.2,
          gravity: 2.5,
        });
      }
    }

    // screen-space shock + camera kick + sound
    if (this.onShock) this.onShock(center, S, special);
    if (this.onKick && !REDUCED_MOTION.matches) this.onKick(center, S);
    if (this.audio) this.audio.pop({ size: S, position: center, golden: balloon.golden, special });
  }

  splash(x, z, strength, time) {
    this.sea.addRipple(x, z, strength, time);
    const n = Math.round(8 + strength * 60);
    const col = new THREE.Color(0.8, 0.78, 0.85);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      const up = (1.2 + Math.random() * 2.8) * (0.4 + strength * 1.8);
      const out = (0.3 + r * 1.2) * (0.3 + strength * 1.5);
      this.spray.emit(
        tmpV.set(x + Math.cos(a) * r * 0.2, 0.02, z + Math.sin(a) * r * 0.2),
        tmpV2.set(Math.cos(a) * out, up, Math.sin(a) * out),
        {
          life: 1.2,
          size0: 0.03 + strength * 0.06,
          size1: 0.02,
          color: col,
          alpha: 0.85,
          drag: 0.6,
          gravity: 9.8,
        },
      );
    }
  }

  // realDt drives the flash, which stays a split-second flash in slow motion.
  update(dt, time, wind, realDt = dt) {
    this.time = time;
    // tear progress releases shreds as the front passes them
    for (let p = this.pending.length - 1; p >= 0; p--) {
      const job = this.pending[p];
      const b = job.balloon;
      if (b.state !== 'popping') continue;
      b.envelope.updateWorldMatrix(true, false);
      job.world.copy(b.envelope.matrixWorld);
      if (b.popTime > 0.4) this.pending.splice(p, 1);
    }
    this.updateField(this.fabric, dt, time, wind);
    this.updateField(this.gold, dt, time, wind);

    // flashes
    for (const f of this.flashes) {
      if (f.age < 0) continue;
      f.age += realDt;
      const S = f.size;
      const fa = f.age;
      const flashLife = 0.06;
      if (fa < flashLife) {
        const k = 1 - fa / flashLife;
        f.flash.visible = true;
        f.flash.scale.setScalar(S * (0.12 + fa * 5));
        f.flash.material.opacity = 1;
        const g = f.gold ? 1.4 : 1;
        f.flash.material.color.setRGB(5 * k * k * g, 4 * k * k * g, 3 * k * k);
      } else f.flash.visible = false;
      if (fa > flashLife) f.age = -1;
    }
    if (this.lightAge >= 0) {
      this.lightAge += realDt;
      const k = Math.max(0, 1 - this.lightAge / 0.16);
      this.light.intensity = this.lightPower * k * k;
      this.sea.uniforms.uFlash.value.set(this.light.position.x, this.light.position.y, this.light.position.z, 3 * k * k);
      if (k <= 0) {
        this.lightAge = -1;
        this.light.intensity = 0;
        this.sea.uniforms.uFlash.value.w = 0;
      }
    }

    this.landings.length = 0;
    this.dust.update(dt);
    this.sparks.update(dt);
    this.spray.update(dt, null);
  }

  updateField(field, dt, time, wind) {
    const mesh = field.mesh;
    field.uniforms.uTime.value = time;
    let dirty = false;
    let splashes = 0;
    for (let i = 0; i < field.capacity; i++) {
      const it = field.items[i];
      if (it.state === 0) continue;
      dirty = true;
      const b = it.balloon;
      if (it.state === 1) {
        // attached until the tear front reaches it
        if (b.popTime >= it.delay) {
          const world = b.envelope.matrixWorld;
          it.pos.copy(it.local).applyMatrix4(world);
          const n = tmpV.copy(it.localN).transformDirection(world);
          const tu = tmpV2.copy(it.localTu).transformDirection(world);
          // orientation: x along the gore, z out of the skin
          const y = new THREE.Vector3().crossVectors(n, tu).normalize();
          tmpM.makeBasis(tu, y, n);
          it.quat.setFromRotationMatrix(tmpM);
          // skin snaps back away from the tear and is blown outward
          const S = b.size;
          const away = new THREE.Vector3().copy(it.local).sub(ENVELOPE_CENTER).normalize()
            .sub(b.tearDir).normalize().transformDirection(world);
          const out = (4 + Math.random() * 9) * S * 0.32;
          const snap = (3 + Math.random() * 6) * S * 0.3;
          it.vel.copy(n).multiplyScalar(out).addScaledVector(away, snap).add(b.vel);
          it.vel.x += (Math.random() - 0.5) * S * 0.5;
          it.vel.y += (Math.random() - 0.2) * S * 0.5;
          it.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
          it.state = 2;
          it.age = 0;
          it.scaleW = it.w * S;
          it.scaleH = it.h * S;
        } else {
          mesh.setMatrixAt(i, ZERO);
          continue;
        }
      }
      if (it.state === 2) {
        it.age += dt;
        // the air catches a light sheet almost at once; afterwards it falls
        // at a gentle terminal speed, rocking and sliding like a leaf
        const k = it.age < 0.14 ? 5.5 : 9.8 / it.fall;
        it.vel.multiplyScalar(Math.exp(-dt * k));
        it.vel.y -= 9.8 * dt;
        const rock = Math.sin(time * 2.6 + it.flutter);
        it.vel.x += (wind.x - it.vel.x) * dt * 0.3 + rock * 2.4 * dt;
        it.vel.z += Math.cos(time * 2.1 + it.flutter * 1.7) * 1.6 * dt;
        it.pos.addScaledVector(it.vel, dt);
        it.spin.lerp(it.tumble, 1 - Math.exp(-dt * 1.4));
        tmpQ.setFromEuler(new THREE.Euler(it.spin.x * dt, it.spin.y * dt, it.spin.z * dt));
        it.quat.multiply(tmpQ);
        // released tension: the edges curl and the fabric gathers a little
        const c = 1 - Math.exp(-it.age * 14);
        it.curl = it.curlTarget * c;
        tmpS.set(it.scaleW * (1 - 0.12 * c), it.scaleH * (1 - 0.06 * c), it.scaleW);
        if (it.pos.y <= 0.02) {
          it.state = 3;
          it.floatAge = 0;
          it.pos.y = 0.02;
          if (splashes < 3 && this.splashBudget < 12) {
            this.splash(it.pos.x, it.pos.z, Math.min(0.5, 0.1 + it.scaleW * 0.25), time);
            splashes++;
            this.splashBudget++;
            if (this.audio) this.audio.splash({ size: it.scaleW, position: it.pos });
          }
        }
      }
      if (it.state === 3) {
        it.floatAge += dt;
        // lie flat on the water, drift, then sink out of sight
        tmpM.makeRotationX(-Math.PI / 2);
        tmpQ.setFromRotationMatrix(tmpM);
        it.quat.slerp(tmpQ, 1 - Math.exp(-dt * 4));
        it.curl += (0.15 - it.curl) * (1 - Math.exp(-dt * 2));
        it.pos.x += wind.x * 0.2 * dt;
        it.pos.y = 0.02 + Math.sin(time * 2 + it.flutter) * 0.02 - Math.max(0, it.floatAge - 2.5) * 0.12;
        tmpS.set(it.scaleW * 0.8, it.scaleH * 0.9, it.scaleW);
        if (it.floatAge > 4.5) {
          it.state = 0;
          mesh.setMatrixAt(i, ZERO);
          continue;
        }
      }
      field.shred[i * 4 + 3] = it.curl;
      tmpM.compose(it.pos, it.quat, tmpS);
      mesh.setMatrixAt(i, tmpM);
    }
    if (dirty) {
      mesh.instanceMatrix.needsUpdate = true;
      field.shredAttr.needsUpdate = true;
    }
    this.splashBudget = Math.max(0, this.splashBudget - dt * 30);
  }
}
