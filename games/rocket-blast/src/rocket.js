// The player's rocket: glossy white painted metal with red nose, fins and
// band, a chrome porthole with a happy blue pilot inside, and a real-looking
// engine flame that throws smoke and sparks behind it.
import * as THREE from 'three';
import { paintMaterial, chromeMaterial, glassMaterial, vinylMaterial } from './materials.js';
import { SPRITE } from './textures.js';
import { clamp, rand } from './config.js';

const flameVertex = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec3 p = position;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

// A fat teardrop of fire on a camera-facing plane: white-hot at the nozzle,
// through yellow and orange, with flickering tongues from scrolling noise.
const flameFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform float uPower;
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uCool;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;               // x across, y from nozzle (1) to tip (0)
  float along = 1.0 - uv.y;    // 0 at nozzle, 1 at the tip
  float x = (uv.x - 0.5) * 2.0;
  float n = texture2D(uNoise, vec2(uv.x * 0.8 + uTime * 0.13, along * 0.9 + uTime * 2.3)).r;
  float n2 = texture2D(uNoise, vec2(uv.x * 1.7 - uTime * 0.21, along * 1.6 + uTime * 3.7)).b;
  float width = mix(0.95, 0.12, pow(along, 0.8)) * (0.85 + 0.3 * n);
  float body = smoothstep(width, width * 0.35, abs(x + (n2 - 0.5) * 0.35 * along));
  float tip = smoothstep(1.0, 0.45 + 0.25 * n, along / max(0.3, uPower));
  float a = body * tip;
  float core = smoothstep(0.55, 0.0, along / max(0.3, uPower)) * smoothstep(width * 0.8, 0.0, abs(x));
  vec3 col = mix(uCool, uMid, smoothstep(0.0, 0.6, a));
  col = mix(col, uHot, core);
  gl_FragColor = vec4(col * (1.0 + core * 1.6), a);
}`;

export class Rocket {
  constructor({ noise, sprites, smoke }) {
    this.sprites = sprites; // additive batch
    this.smoke = smoke; // alpha batch
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.pos = new THREE.Vector3(0, -3, 0);
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3(0, -3, 0);
    this.recoil = 0;
    this.time = 0;
    this.emit = 0;
    this.gold = 0;
    this.visible = true;
    this.build(noise);
  }

  build(noise) {
    const white = paintMaterial('#fbfaf7', { roughness: 0.2, metalness: 0.05 });
    const red = paintMaterial('#e3262c', { roughness: 0.26, metalness: 0.12 });
    this.white = white;
    this.red = red;
    const chrome = chromeMaterial(0xe8ecf2, 0.14);
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3d45, roughness: 0.35, metalness: 0.9 });
    const lathe = (pts, mat, seg = 48) => {
      const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
      this.body.add(m);
      return m;
    };
    // hull: fat bullet shape
    lathe(
      [
        [0.001, -0.86],
        [0.36, -0.86],
        [0.47, -0.72],
        [0.55, -0.42],
        [0.585, -0.05],
        [0.57, 0.3],
        [0.52, 0.56],
        [0.47, 0.66],
      ],
      white,
    );
    // nose cone
    lathe(
      [
        [0.47, 0.64],
        [0.44, 0.76],
        [0.36, 0.94],
        [0.24, 1.1],
        [0.12, 1.2],
        [0.001, 1.24],
      ],
      red,
    );
    // red belly band and a thin chrome trim ring
    lathe(
      [
        [0.47, -0.74],
        [0.5, -0.74],
        [0.54, -0.5],
        [0.53, -0.5],
      ],
      red,
    );
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.022, 10, 48), chrome);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.65;
    this.body.add(trim);
    // fine panel seams in the paint
    const seam = new THREE.MeshStandardMaterial({ color: 0x9aa3ae, roughness: 0.5, metalness: 0.3 });
    for (const [y, r] of [
      [0.42, 0.553],
      [-0.28, 0.567],
    ]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 6, 64), seam);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      this.body.add(ring);
    }
    // engine bell
    lathe(
      [
        [0.2, -0.84],
        [0.24, -0.92],
        [0.33, -1.04],
        [0.31, -1.05],
        [0.21, -0.95],
        [0.16, -0.86],
      ],
      dark,
    );
    // fins: two swept forward to the sides and one at the back
    const fin = new THREE.Shape();
    fin.moveTo(0, 0.35);
    fin.bezierCurveTo(0.2, 0.2, 0.46, -0.05, 0.5, -0.45);
    fin.quadraticCurveTo(0.52, -0.62, 0.36, -0.6);
    fin.lineTo(0, -0.42);
    fin.closePath();
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 3, curveSegments: 10 });
    finGeo.translate(0, 0, -0.03);
    finGeo.computeVertexNormals();
    for (const a of [Math.PI, Math.PI / 3, -Math.PI / 3]) {
      const f = new THREE.Mesh(finGeo, red);
      const pivot = new THREE.Group();
      pivot.rotation.y = a - Math.PI / 2;
      f.position.set(0.42, -0.42, 0);
      f.rotation.y = 0;
      pivot.add(f);
      this.body.add(pivot);
    }
    // porthole: chrome rim, a happy blue pilot, and a glass dome
    // the porthole bulges out of the hull so its rim sits proud of the paint
    const port = new THREE.Group();
    port.position.set(0, 0.12, 0.585);
    this.body.add(port);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 16, 48), chrome);
    port.add(rim);
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshStandardMaterial({ color: 0x0e2a55, roughness: 0.6 }));
    back.position.z = 0.004;
    port.add(back);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 24), vinylMaterial({ color: '#43a6ff', roughness: 0.35, sss: 0.35 }));
    face.scale.set(1, 1, 0.6);
    face.position.z = -0.02;
    port.add(face);
    const eyeWhite = vinylMaterial({ color: 0xffffff, roughness: 0.15, sss: 0.04, sheen: 0 });
    const pupilMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0b12, roughness: 0.1, clearcoat: 1 });
    const glint = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2) });
    this.eyes = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.09, 0.05, 0.09);
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), eyeWhite);
      w.scale.z = 0.6;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 10), pupilMat);
      p.scale.z = 0.5;
      p.position.set(0, -0.005, 0.035);
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), glint);
      g.position.set(0.014, 0.016, 0.055);
      eye.add(w, p, g);
      port.add(eye);
      this.eyes.push({ group: eye, pupil: p, glint: g });
    }
    // open smile
    const smile = new THREE.Shape();
    smile.moveTo(-0.08, 0);
    smile.quadraticCurveTo(0, -0.012, 0.08, 0);
    smile.absarc(0, 0, 0.08, 0, -Math.PI, true);
    const mouth = new THREE.Mesh(
      new THREE.ExtrudeGeometry(smile, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 12 }),
      new THREE.MeshPhysicalMaterial({ color: '#5c0d1c', roughness: 0.4 }),
    );
    mouth.position.set(0, -0.06, 0.1);
    port.add(mouth);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), vinylMaterial({ color: '#ff6f8e', sss: 0.2 }));
    tongue.scale.set(1, 0.5, 0.4);
    tongue.position.set(0, -0.11, 0.105);
    port.add(tongue);
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({ color: '#ff7aa0', transparent: true, opacity: 0.5, depthWrite: false }));
      cheek.position.set(side * 0.16, -0.04, 0.1);
      port.add(cheek);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.29, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glassMaterial());
    dome.rotation.x = Math.PI / 2;
    dome.scale.set(1, 0.45, 1);
    dome.position.z = 0.0;
    dome.renderOrder = 5;
    port.add(dome);
    this.port = port;

    // flame
    this.flameMat = new THREE.ShaderMaterial({
      uniforms: {
        uNoise: { value: noise },
        uTime: { value: 0 },
        uPower: { value: 1 },
        uHot: { value: new THREE.Color(1, 0.97, 0.85) },
        uMid: { value: new THREE.Color(1, 0.62, 0.12) },
        uCool: { value: new THREE.Color(1, 0.22, 0.05) },
      },
      vertexShader: flameVertex,
      fragmentShader: flameFragment,
      transparent: true,
      depthWrite: false,
    });
    const flameGeo = new THREE.PlaneGeometry(0.62, 1.5);
    flameGeo.translate(0, -0.75, 0);
    this.flame = new THREE.Mesh(flameGeo, this.flameMat);
    this.flame.position.set(0, -0.98, 0.05);
    this.flame.renderOrder = 6;
    this.root.add(this.flame);
    this.root.position.copy(this.pos);
  }

  // Point the rocket towards a world position (already offset for fingers).
  setTarget(x, y) {
    this.target.set(x, y, 0);
  }

  // where shots leave from
  muzzle(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.25 - this.recoil * 0.2, 0.1);
  }

  kick(amount = 1) {
    this.recoil = Math.min(1, this.recoil + 0.35 * amount);
  }

  update(dt, t, bounds) {
    this.time = t;
    // critically damped chase of the target
    const k = 90;
    const c = 2 * Math.sqrt(k);
    const ax = (this.target.x - this.pos.x) * k - this.vel.x * c;
    const ay = (this.target.y - this.pos.y) * k - this.vel.y * c;
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    if (bounds) {
      this.pos.x = clamp(this.pos.x, bounds.minX, bounds.maxX);
      this.pos.y = clamp(this.pos.y, bounds.minY, bounds.maxY);
    }
    this.recoil = Math.max(0, this.recoil - dt * 6);
    const bob = Math.sin(t * 3.1) * 0.05;
    this.root.position.set(this.pos.x, this.pos.y + bob - this.recoil * 0.12, 0);
    const bank = clamp(-this.vel.x * 0.035, -0.45, 0.45);
    this.body.rotation.set(Math.sin(t * 1.7) * 0.03 + clamp(this.vel.y * 0.01, -0.1, 0.1), clamp(this.vel.x * 0.05, -0.6, 0.6) + Math.sin(t * 0.9) * 0.08, bank * 0.6);
    this.flame.rotation.z = bank * 0.6;

    // the pilot looks where it is going and blinks now and then
    const blink = (t % 3.7) < 0.12 ? 0.1 : 1;
    for (const e of this.eyes) {
      e.group.scale.y = blink;
      e.pupil.position.x = clamp(this.vel.x * 0.004, -0.02, 0.02);
      e.pupil.position.y = clamp(this.vel.y * 0.004, -0.02, 0.025) - 0.005;
    }

    // flame: longer when climbing, shorter when dropping
    const power = clamp(1 + this.vel.y * 0.06, 0.6, 1.6) * (0.92 + Math.sin(t * 37) * 0.05 + Math.sin(t * 23) * 0.05);
    this.flameMat.uniforms.uTime.value = t;
    this.flameMat.uniforms.uPower.value = power;
    this.flame.scale.set(1 + this.gold * 0.3, power, 1);
    if (this.gold > 0) {
      this.flameMat.uniforms.uMid.value.setRGB(1, 0.8, 0.2);
      this.flameMat.uniforms.uCool.value.setRGB(1, 0.35, 0.8);
    } else {
      this.flameMat.uniforms.uMid.value.setRGB(1, 0.62, 0.12);
      this.flameMat.uniforms.uCool.value.setRGB(1, 0.22, 0.05);
    }

    // smoke and sparks from the nozzle
    if (!this.visible) return;
    this.emit += dt;
    const nx = this.root.position.x + Math.sin(bank) * 1.0;
    const ny = this.root.position.y - 1.1;
    while (this.emit > 0.022) {
      this.emit -= 0.022;
      const s = rand(0.35, 0.6);
      const shade = rand(0.82, 1);
      this.smoke.add({
        x: nx + rand(-0.08, 0.08),
        y: ny - rand(0.2, 0.6) * power,
        z: rand(-0.3, -0.05),
        vx: rand(-0.35, 0.35) + this.vel.x * -0.05,
        vy: -rand(2.2, 3.4) - Math.max(0, this.vel.y) * 0.2,
        vz: 0,
        drag: 1.2,
        size: s,
        grow: 2.4,
        rot: rand(0, 6.28),
        spin: rand(-1, 1),
        life: rand(0.9, 1.4),
        frame: Math.random() < 0.5 ? SPRITE.PUFF : SPRITE.PUFF2,
        r: shade,
        g: shade * 0.98,
        b: shade * 0.96,
        a: 0.55,
        fadeIn: 0.08,
      });
      if (Math.random() < 0.35) {
        this.sprites.add({
          x: nx + rand(-0.12, 0.12),
          y: ny - rand(0.3, 0.8),
          z: 0.2,
          vx: rand(-1.2, 1.2),
          vy: -rand(3, 6),
          drag: 1.5,
          size: rand(0.05, 0.1),
          life: rand(0.25, 0.5),
          frame: SPRITE.DOT,
          r: 4,
          g: 2.2,
          b: 0.6,
          a: 1,
        });
      }
    }
    // warm glow round the nozzle
    this.sprites.add({ x: nx, y: ny + 0.05, z: 0.3, size: 1.4 + this.gold * 0.8, life: 0, frame: SPRITE.GLOW, r: 1.4, g: 0.6, b: 0.15, a: 0.5 });
  }
}
