// A hot-air balloon: gored envelope, glowing skirt and burner, cables and an
// empty wicker basket. Handles drifting on the wind, bobbing, swaying, a
// squash when touched, and hands its tear state to the pop effect.
import * as THREE from 'three';
import {
  createEnvelopeGeometry,
  createEnvelopeMaterial,
  patchEnvelopeMaterial,
  ENVELOPE_CENTER,
} from './envelope.js';
import { createWickerTexture, createRipstopNormal } from './noise.js';
import { PATTERN, PALETTES } from './config.js';

export const TEAR_SPEED = 24; // radians of envelope per second of game time

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,230,190,0.85)');
  grad.addColorStop(0.45, 'rgba(255,170,90,0.25)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBalloonAssets(quality) {
  const ripstop = createRipstopNormal();
  ripstop.repeat.set(20 * 6, 44);
  const wicker = createWickerTexture();
  wicker.repeat.set(2, 1.4);
  const hi = quality.tier !== 'low';
  const envelopeGeometry = createEnvelopeGeometry(hi ? 6 : 4, hi ? 72 : 44);

  // Skirt (scoop) below the mouth: bright fire-proof fabric.
  const skirtGeometry = new THREE.CylinderGeometry(0.098, 0.121, 0.075, 40, 1, true);
  skirtGeometry.translate(0, -0.0375, 0);
  const skirtMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d0371f'),
    roughness: 0.6,
    side: THREE.DoubleSide,
    emissive: new THREE.Color('#ff5a1a'),
    emissiveIntensity: 0.6,
  });

  // Basket: wicker walls with a leather-padded rim, open top.
  const basketGeometry = new THREE.BoxGeometry(0.1, 0.07, 0.1);
  basketGeometry.translate(0, -0.175, 0);
  const basketMaterial = new THREE.MeshStandardMaterial({ map: wicker, roughness: 0.85, metalness: 0 });
  const rimGeometry = new THREE.TorusGeometry(0.07, 0.006, 6, 4);
  rimGeometry.rotateX(Math.PI / 2);
  rimGeometry.rotateY(Math.PI / 4);
  rimGeometry.translate(0, -0.14, 0);
  const rimMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a1a12'), roughness: 0.55 });

  // Burner frame and the load cables down to the basket corners.
  const burnerGeometry = new THREE.CylinderGeometry(0.022, 0.026, 0.028, 12);
  burnerGeometry.translate(0, -0.1, 0);
  const burnerMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 1, roughness: 0.35 });
  const cablePts = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    cablePts.push(new THREE.Vector3(Math.sin(a) * 0.098, -0.075, Math.cos(a) * 0.098));
    cablePts.push(new THREE.Vector3(Math.sin(a) * 0.066, -0.14, Math.cos(a) * 0.066));
    cablePts.push(new THREE.Vector3(Math.sin(a) * 0.098, -0.075, Math.cos(a) * 0.098));
    cablePts.push(new THREE.Vector3(0, -0.095, 0));
  }
  const cableGeometry = new THREE.BufferGeometry().setFromPoints(cablePts);
  const cableMaterial = new THREE.LineBasicMaterial({ color: 0x1a1414 });

  return {
    ripstop,
    envelopeGeometry,
    skirtGeometry,
    skirtMaterial,
    basketGeometry,
    basketMaterial,
    rimGeometry,
    rimMaterial,
    burnerGeometry,
    burnerMaterial,
    cableGeometry,
    cableMaterial,
    flameTexture: glowTexture(),
  };
}

let nextId = 1;

export class Balloon {
  constructor(assets, opts) {
    this.id = nextId++;
    this.size = opts.size;
    this.golden = !!opts.golden;
    this.pattern = this.golden ? PATTERN.GOLD : opts.pattern;
    this.palette = opts.palette % PALETTES.length;
    this.phase = Math.random() * 100;
    this.state = 'flying';
    this.vel = opts.velocity.clone();
    this.windSpeed = opts.velocity.x;
    this.climb = opts.velocity.y;
    this.bobAmp = 0.12 + Math.random() * 0.12;
    this.bobFreq = 0.35 + Math.random() * 0.25;
    this.yawSpeed = (Math.random() - 0.5) * 0.18;
    this.burn = 0.35;
    this.burnTimer = 2 + Math.random() * 6;
    this.flare = 0;
    this.squash = 0;
    this.squashVel = 0;
    this.touchAmount = 0;
    this.popTime = 0;
    this.points = opts.points || 10;
    this.age = 0;

    this.uniforms = {
      uPalette: { value: this.palette },
      uPattern: { value: this.pattern },
      uGlow: { value: 1 },
      uBurn: { value: this.burn },
      uTear: { value: new THREE.Vector4(0, 1, 0, -1) },
      uTearSeed: { value: Math.random() * 10 },
      uDent: { value: new THREE.Vector4(0, 0, 0, 0) },
    };
    this.material = createEnvelopeMaterial({ ripstop: assets.ripstop, gold: this.golden });
    patchEnvelopeMaterial(this.material, this.uniforms);

    this.root = new THREE.Group();
    this.root.position.copy(opts.position);
    this.root.rotation.y = Math.random() * Math.PI * 2;
    this.tilt = new THREE.Group();
    this.root.add(this.tilt);
    this.body = new THREE.Group();
    this.body.scale.setScalar(this.size);
    this.tilt.add(this.body);

    this.envelope = new THREE.Mesh(assets.envelopeGeometry, this.material);
    this.envelope.castShadow = true;
    this.envelope.receiveShadow = true;
    this.envelope.userData.balloon = this;
    this.body.add(this.envelope);

    this.gondola = new THREE.Group();
    this.body.add(this.gondola);
    this.skirt = new THREE.Mesh(assets.skirtGeometry, assets.skirtMaterial.clone());
    this.gondola.add(this.skirt);
    const basket = new THREE.Mesh(assets.basketGeometry, assets.basketMaterial);
    basket.castShadow = true;
    basket.receiveShadow = true;
    this.gondola.add(basket);
    this.gondola.add(new THREE.Mesh(assets.rimGeometry, assets.rimMaterial));
    this.gondola.add(new THREE.Mesh(assets.burnerGeometry, assets.burnerMaterial));
    this.gondola.add(new THREE.LineSegments(assets.cableGeometry, assets.cableMaterial));
    this.flame = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: assets.flameTexture,
        color: new THREE.Color(3, 1.6, 0.6),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false,
      }),
    );
    this.flame.position.set(0, -0.045, 0);
    this.flame.scale.setScalar(0.16);
    this.gondola.add(this.flame);
    this.gondolaSwing = new THREE.Vector2();
    this.gondolaSwingVel = new THREE.Vector2();
    this.fallVel = new THREE.Vector3();
    this.fallSpin = new THREE.Vector3();
    this.floatTime = 0;
  }

  get radius() {
    return this.size * 0.5;
  }

  // World-space centre of the envelope.
  center(out = new THREE.Vector3()) {
    return out.copy(ENVELOPE_CENTER).applyMatrix4(this.envelope.matrixWorld);
  }

  touch(localPoint, strength = 0.04) {
    this.uniforms.uDent.value.set(localPoint.x, localPoint.y, localPoint.z, strength);
    this.squashVel -= 1.6;
  }

  bump(amount) {
    this.squashVel -= amount;
  }

  beginPop(localPoint) {
    this.state = 'popping';
    this.popTime = 0;
    const dir = localPoint.clone().sub(ENVELOPE_CENTER).normalize();
    this.uniforms.uTear.value.set(dir.x, dir.y, dir.z, 0.001);
    this.tearDir = dir;
    this.uniforms.uDent.value.w = 0;
  }

  tearRadius() {
    return this.state === 'popping' ? this.uniforms.uTear.value.w : 0;
  }

  update(dt, t) {
    this.age += dt;
    if (this.state === 'flying' || this.state === 'popping') {
      const gust = Math.sin(t * 0.37 + this.phase) * 0.3 + Math.sin(t * 0.91 + this.phase * 2.0) * 0.15;
      const targetVx = this.windSpeed * (1 + gust * 0.3);
      this.vel.x += (targetVx - this.vel.x) * (1 - Math.exp(-dt * 0.8));
      const lift = this.climb + this.flare * 0.35;
      this.vel.y += (lift - this.vel.y) * (1 - Math.exp(-dt * 0.6));
      this.root.position.addScaledVector(this.vel, dt);
      this.root.rotation.y += this.yawSpeed * dt;
      const bob = Math.sin(t * this.bobFreq + this.phase) * this.bobAmp;
      this.tilt.position.y = bob;
      this.tilt.rotation.z = -(this.vel.x - this.windSpeed) * 0.05 + Math.sin(t * 0.6 + this.phase) * 0.025;
      this.tilt.rotation.x = Math.sin(t * 0.45 + this.phase * 1.3) * 0.02;

      // squash spring (touches, bumps)
      const k = 180;
      const c = 9;
      this.squashVel += (-k * this.squash - c * this.squashVel) * dt;
      this.squash += this.squashVel * dt;
      const s = Math.max(-0.2, Math.min(0.2, this.squash * 0.04));
      this.body.scale.set(this.size * (1 - s * 0.5), this.size * (1 + s), this.size * (1 - s * 0.5));
      const dent = this.uniforms.uDent.value;
      dent.w *= Math.exp(-dt * 6);

      // gondola hangs like a pendulum under the envelope
      const g = this.gondolaSwing;
      const gv = this.gondolaSwingVel;
      gv.x += (-g.x * 6 - gv.x * 1.5 - this.tilt.rotation.z * 4) * dt;
      gv.y += (-g.y * 6 - gv.y * 1.5 - this.tilt.rotation.x * 4) * dt;
      g.addScaledVector(gv, dt);
      this.gondola.rotation.z = g.x * 0.3;
      this.gondola.rotation.x = g.y * 0.3;

      // burner: periodic flares warm the envelope and add lift
      this.burnTimer -= dt;
      if (this.burnTimer <= 0) {
        if (this.flare > 0) {
          this.flare = 0;
          this.burnTimer = 3 + Math.random() * 7;
        } else {
          this.flare = 1;
          this.burnTimer = 0.9 + Math.random() * 1.4;
        }
      }
      const flicker = 0.85 + Math.sin(t * 37 + this.phase) * 0.08 + Math.sin(t * 23.7) * 0.07;
      this.burn += ((0.32 + this.flare * 0.95) - this.burn) * (1 - Math.exp(-dt * 6));
      this.uniforms.uBurn.value = this.burn * flicker;
      this.flame.material.opacity = Math.min(1, 0.35 + this.burn * 0.8) * flicker;
      this.flame.scale.setScalar(0.12 + this.burn * 0.09 * flicker);
      this.skirt.material.emissiveIntensity = 0.35 + this.burn * 0.9 * flicker;
    }
    if (this.state === 'popping') {
      this.popTime += dt;
      this.uniforms.uTear.value.w = 0.001 + this.popTime * TEAR_SPEED;
      if (this.uniforms.uTear.value.w > Math.PI * 1.15) this.envelope.visible = false;
    }
  }

  // Detach the gondola so it falls to the sea on its own.
  detachGondola(scene) {
    const g = this.gondola;
    g.updateWorldMatrix(true, false);
    const m = g.matrixWorld.clone();
    scene.add(g);
    m.decompose(g.position, g.quaternion, g.scale);
    this.fallVel.copy(this.vel).multiplyScalar(0.8);
    this.fallVel.y = Math.min(this.vel.y, 0) - 0.5;
    this.fallSpin.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2.0, (Math.random() - 0.5) * 1.2);
    this.gondolaFalling = true;
    this.flameFade = 1;
  }

  // Returns true when the gondola has just hit the water.
  updateFalling(dt, t) {
    const g = this.gondola;
    if (!this.gondolaFalling) return false;
    let splashed = false;
    this.flameFade = Math.max(0, this.flameFade - dt * 2.5);
    this.flame.material.opacity = this.flameFade;
    this.skirt.material.emissiveIntensity = 0.2 + this.flameFade;
    if (this.floatTime === 0) {
      this.fallVel.y -= 9.8 * dt;
      this.fallVel.multiplyScalar(Math.exp(-dt * 0.15));
      g.position.addScaledVector(this.fallVel, dt);
      g.rotation.x += this.fallSpin.x * dt;
      g.rotation.y += this.fallSpin.y * dt;
      g.rotation.z += this.fallSpin.z * dt;
      const basketBottom = g.position.y - 0.21 * this.size;
      if (basketBottom < 0) {
        this.floatTime = 0.0001;
        this.impactSpeed = -this.fallVel.y;
        splashed = true;
      }
    } else {
      // bob in the water, settle upright-ish, then slowly sink
      this.floatTime += dt;
      const sink = Math.max(0, this.floatTime - 3.5) * 0.35 * this.size;
      const bob = Math.sin(t * 2.1 + this.phase) * 0.03 * this.size;
      g.position.y += ((0.17 * this.size - sink + bob) - g.position.y) * (1 - Math.exp(-dt * 3));
      g.position.x += this.fallVel.x * 0.15 * dt;
      g.rotation.x *= Math.exp(-dt * 1.5);
      g.rotation.z *= Math.exp(-dt * 1.5);
      if (this.floatTime > 9) this.gondolaDone = true;
    }
    return splashed;
  }

  dispose(scene) {
    this.root.removeFromParent();
    this.gondola.removeFromParent();
    this.material.dispose();
    this.skirt.material.dispose();
    this.flame.material.dispose();
  }
}
