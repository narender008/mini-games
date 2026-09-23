// The popping tools the player holds: a pearl-headed steel pin that follows
// the pointer and jabs, a steel-tipped dart that is thrown at the target, a
// fairground air rifle that fires pellets, and a slingshot that lets fly a
// stone. Pellets and stones carry on through what they hit, so one shot can
// catch two balloons in a line.
import * as THREE from 'three';
import { LAYER_NO_REFLECT } from './sea.js';
import { buildRifle } from './rifle.js';
import { SlingshotModel, createStoneGeometry, stoneMaterial } from './slingshot.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

function steel() {
  return new THREE.MeshPhysicalMaterial({ color: 0xe4e7eb, metalness: 1, roughness: 0.14 });
}

// The tools sit right in front of the lens, where reflecting the dark sea
// would turn polished steel black. They get their own little studio instead:
// the dusk sky's colours with a few soft boxes (warm towards the sun, cool
// overhead and behind the viewer) so the steel and the pearl head read.
function createToolEnvironment(renderer) {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: /* glsl */ `
varying vec3 vDir;
float box(vec3 d, vec3 c, vec2 size) {
  vec3 z = normalize(c);
  vec3 x = normalize(cross(abs(z.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0), z));
  vec3 y = cross(z, x);
  float f = dot(d, z);
  if (f <= 0.0) return 0.0;
  vec2 p = vec2(dot(d, x), dot(d, y)) / f;
  vec2 q = abs(p) / size;
  return (1.0 - smoothstep(0.7, 1.0, q.x)) * (1.0 - smoothstep(0.7, 1.0, q.y));
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(vec3(0.12, 0.11, 0.17), vec3(0.30, 0.32, 0.52), smoothstep(-0.4, 0.7, h));
  col = mix(col, vec3(0.62, 0.46, 0.44), exp(-abs(h) * 6.0) * 0.7);
  col += vec3(2.2, 1.45, 0.85) * box(d, vec3(0.74, 0.25, -0.67), vec2(0.5, 0.25));
  col += vec3(0.8, 0.85, 1.1) * box(d, vec3(-0.2, 1.0, 0.3), vec2(0.9, 0.4));
  col += vec3(1.1, 1.05, 1.15) * box(d, vec3(-0.55, 0.35, 0.75), vec2(0.35, 0.6));
  col += vec3(0.7, 0.6, 0.85) * box(d, vec3(0.6, -0.1, 0.8), vec2(0.35, 0.45));
  col += vec3(0.6, 0.45, 0.75) * box(d, vec3(-1.0, 0.05, -0.2), vec2(0.15, 0.8));
  gl_FragColor = vec4(col, 1.0);
}`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.01, 0.1, 100);
  pmrem.dispose();
  mat.dispose();
  return rt.texture;
}

// Pin: built along +Y with the point at the origin.
function buildPin() {
  const g = new THREE.Group();
  const L = 0.38;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, L - 0.035, 12), steel());
  shaft.position.y = 0.035 + (L - 0.035) / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0042, 0.035, 12), steel());
  tip.rotation.x = Math.PI;
  tip.position.y = 0.0175;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 32, 20),
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#e3212b'),
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.2,
    }),
  );
  head.position.y = L + 0.022;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.0045, 0.012, 12), steel());
  collar.position.y = L - 0.004;
  g.add(shaft, tip, head, collar);
  g.userData.length = L + 0.05;
  return g;
}

function flightTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d');
  const grad = x.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, '#1d1030');
  grad.addColorStop(0.35, '#7b35f0');
  grad.addColorStop(0.7, '#f3871f');
  grad.addColorStop(1, '#ffd24a');
  x.fillStyle = grad;
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(0,0,0,0.6)';
  x.lineWidth = 6;
  x.strokeRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Dart: point at the origin, flights towards +Y.
function buildDart() {
  const g = new THREE.Group();
  const point = new THREE.Mesh(new THREE.ConeGeometry(0.0055, 0.07, 12), steel());
  point.rotation.x = Math.PI;
  point.position.y = 0.035;
  // knurled tungsten barrel from a lathe profile
  const prof = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const base = 0.0075 + Math.sin(t * Math.PI) * 0.0045;
    const knurl = i % 2 === 0 ? 0.0009 : 0;
    prof.push(new THREE.Vector2(base + knurl, 0.07 + t * 0.075));
  }
  const barrel = new THREE.Mesh(
    new THREE.LatheGeometry(prof, 24),
    new THREE.MeshPhysicalMaterial({ color: 0x8b9096, metalness: 1, roughness: 0.32, envMapIntensity: 1.3 }),
  );
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.07, 10),
    new THREE.MeshPhysicalMaterial({ color: 0x151515, roughness: 0.35, clearcoat: 0.6 }),
  );
  shaft.position.y = 0.18;
  const fm = new THREE.MeshPhysicalMaterial({
    map: flightTexture(),
    side: THREE.DoubleSide,
    roughness: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
  });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.034, 0.03);
  shape.lineTo(0.034, 0.07);
  shape.lineTo(0, 0.075);
  shape.lineTo(0, 0);
  const fg = new THREE.ShapeGeometry(shape);
  const uv = fg.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.034, uv.getY(i) / 0.075);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(fg, fm);
    f.position.y = 0.16;
    f.rotation.y = (i * Math.PI) / 2;
    g.add(f);
  }
  g.add(point, barrel, shaft);
  g.userData.length = 0.24;
  return g;
}

function prepare(obj, envMap) {
  obj.traverse((o) => {
    o.layers.set(LAYER_NO_REFLECT);
    if (o.material) o.material.envMap = envMap;
  });
}

export const TOOLS = ['pin', 'dart', 'rifle', 'sling'];

// A glowing streak drawn behind a fast pellet (or, faintly, a stone): a quad
// that lies along the flight path and turns to face the camera.
function createTracer(color, strength) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(-0.5, 0, 0); // head at x = 0, tail towards -x
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(strength) }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float along = pow(vUv.x, 1.6);
  float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
  float a = along * across * across * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 22;
  return m;
}

const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const ax = new THREE.Vector3();
const ay = new THREE.Vector3();
const az = new THREE.Vector3();

export class ToolRig {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.envMap = createToolEnvironment(renderer);
    this.pin = buildPin();
    this.dartHeld = buildDart();
    this.rifle = buildRifle();
    this.sling = new SlingshotModel();
    for (const o of [this.pin, this.dartHeld, this.rifle.group, this.sling.group]) {
      prepare(o, this.envMap);
      o.visible = false;
      scene.add(o);
    }
    this.stoneGeometries = [0, 1, 2].map(() => createStoneGeometry(0.0125));
    this.stoneMaterial = stoneMaterial();
    this.stoneMaterial.envMap = this.envMap;
    this.pelletGeometry = new THREE.SphereGeometry(0.0028, 8, 6);
    this.flying = [];
    this.projectiles = [];
    this.tool = 'pin';
    this.ndc = new THREE.Vector2(0.35, -0.35);
    this.targetNdc = this.ndc.clone();
    this.visible = true;
    this.fade = 1;
    this.jab = 0; // 0..1 jab phase, <0 idle
    this.jabTime = -1;
    this.reload = 1;
    this.raycaster = new THREE.Raycaster();
    this.restTimer = 0;
    this.pointerType = 'mouse';
    // rifle: recoil spring and the cocking stroke after each shot
    this.recoil = 0;
    this.recoilVel = 0;
    this.cock = 1;
    // slingshot: the draw, and the bands' spring after a release
    this.drawing = null;
    this.pull = 0;
    this.wobble = 0;
    this.wobbleVel = 0;
    this.slingReload = 1;
    this.shotId = 0;
    // where each is held, in camera space (metres, before hand scaling)
    this.rifleHold = new THREE.Vector3(0.2, -0.2, -0.5);
    this.slingHold = new THREE.Vector3(0.12, -0.165, -0.46);
    // hooks set by the game
    this.aimProvider = null; // (ndc) => { point, target }
    this.hitTest = null; // (from, to, exclude) => hits nearest first
    this.onHit = null; // (hit, shot) => void
    this.onSplash = null; // (point, size) => void
    this.onPuff = null; // (position, direction) => void
    this.audio = null;
  }

  setTool(name) {
    this.tool = TOOLS.includes(name) ? name : 'pin';
    this.drawing = null;
    this.pull = 0;
  }

  // The rifle and slingshot are held at the bottom of the view and aimed at
  // a reticle, rather than carried to the pointer like the pin and dart.
  get aimed() {
    return this.tool === 'rifle' || this.tool === 'sling';
  }

  canFire() {
    if (this.tool === 'dart') return this.reload >= 1;
    if (this.tool === 'rifle') return this.cock >= 1;
    if (this.tool === 'sling') return !this.drawing && this.slingReload >= 1;
    return true;
  }

  setPointer(ndc, type) {
    this.targetNdc.copy(ndc);
    this.pointerType = type;
    if (type !== 'mouse') this.ndc.copy(ndc);
    this.visible = true;
    this.restTimer = 0;
  }

  // a narrow portrait screen shows less of the scene, so the hand-held tool
  // shrinks a little to keep from covering the balloons
  handScale() {
    return Math.min(1, Math.max(0.72, this.camera.aspect));
  }

  hide() {
    this.visible = false;
    this.drawing = null;
  }

  // Bring out every tool and one of each shot so the renderer can compile
  // their shaders while loading. Returns a function that puts them away.
  warmUp() {
    const models = [this.pin, this.dartHeld, this.rifle.group, this.sling.group];
    const shots = [
      new THREE.Mesh(this.pelletGeometry, this.pelletMaterial()),
      new THREE.Mesh(this.stoneGeometries[0], this.stoneMaterial),
      createTracer('#ffe2b8', 7),
    ];
    for (const o of models) o.visible = true;
    for (const o of shots) this.scene.add(o);
    return () => {
      for (const o of models) o.visible = false;
      for (const o of shots) o.removeFromParent();
    };
  }

  ray(ndc) {
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray;
  }

  // Place a tool so its point sits on the pointer ray at `dist`.
  pose(obj, ndc, dist, tilt = 1) {
    const cam = this.camera;
    const ray = this.ray(ndc);
    const tipPos = tmp.copy(ray.origin).addScaledVector(ray.direction, dist);
    const right = tmp2.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    // tail comes back towards the viewer, down and to the right
    const tail = new THREE.Vector3()
      .copy(ray.direction)
      .multiplyScalar(-0.62)
      .addScaledVector(right, 0.52 * tilt)
      .addScaledVector(up, -0.58);
    tail.normalize();
    obj.position.copy(tipPos);
    obj.quaternion.setFromUnitVectors(Y, tail);
  }

  // Hold a tool at a fixed place in front of the camera and point its +Z at
  // `target`, upright with the camera.
  holdAt(obj, offset, target) {
    const cam = this.camera;
    obj.position.copy(offset).applyMatrix4(cam.matrixWorld);
    obj.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    obj.lookAt(target);
  }

  // Where the held rifle or slingshot points: along the pointer ray, far
  // enough out that the barrel looks aimed at the reticle.
  aimPointFor(ndc, out = new THREE.Vector3()) {
    const ray = this.ray(ndc);
    const d = ray.direction;
    const t = d.y < -0.01 ? Math.min(34, -ray.origin.y / d.y) : 34;
    return out.copy(ray.origin).addScaledVector(d, t);
  }

  // Where the held rifle or slingshot points. Straight at the reticle near
  // the middle of the view, but a target high on a tall phone screen would
  // stand the rifle on end, so beyond ~18° the model turns less than the aim.
  // The shot itself still flies from the muzzle to the reticle.
  heldAim(ndc) {
    const cam = this.camera;
    const d = this.ray(ndc).direction.clone().transformDirection(cam.matrixWorldInverse);
    const angle = Math.acos(Math.min(1, -d.z));
    const cap = 0.31;
    if (angle > cap) {
      const a = cap + (angle - cap) * 0.4;
      const side = Math.hypot(d.x, d.y) || 1;
      d.set((d.x / side) * Math.sin(a), (d.y / side) * Math.sin(a), -Math.cos(a));
    }
    return d.multiplyScalar(34).applyMatrix4(cam.matrixWorld);
  }

  // Show the held tool, as at the start of play.
  show() {
    this.visible = true;
    this.restTimer = 0;
  }

  // Start a pin jab or throw a dart. `onContact` fires when the point meets
  // the target.
  strike(ndc, target, onContact) {
    this.ndc.copy(ndc);
    this.targetNdc.copy(ndc);
    this.visible = true;
    this.restTimer = 0;
    if (this.tool === 'pin') {
      this.jabTime = 0;
      this.jabContact = onContact;
      return 0.07;
    }
    if (this.reload < 1) return -1;
    // throw a dart from the hand to the target point
    const dart = this.dartHeld.clone();
    dart.visible = true;
    this.pose(dart, ndc, 1.4);
    this.scene.add(dart);
    const from = dart.position.clone();
    const ray = this.ray(ndc);
    let to;
    let hit = !!target;
    if (target) {
      to = target.worldPoint.clone();
    } else {
      // miss: aim far along the ray, or where it meets the sea
      const t = ray.direction.y < -0.01 ? Math.min(90, -ray.origin.y / ray.direction.y) : 90;
      to = ray.origin.clone().addScaledVector(ray.direction, t);
    }
    const dist = from.distanceTo(to);
    this.flying.push({
      obj: dart,
      from,
      to,
      target,
      hit,
      t: 0,
      duration: Math.min(0.55, Math.max(0.16, dist / 70)),
      spin: 0,
      onContact,
      state: 'flight',
      vel: new THREE.Vector3(),
    });
    this.reload = 0;
    return -1;
  }

  // Fire the air rifle at the pointer. Returns the shot id, or -1 while it
  // is still being cocked.
  fire(ndc) {
    this.ndc.copy(ndc);
    this.targetNdc.copy(ndc);
    this.visible = true;
    this.restTimer = 0;
    if (this.tool !== 'rifle' || this.cock < 1) return -1;
    this.updateHeld(0); // make sure the muzzle is where the rifle is drawn
    const muzzle = this.rifle.muzzle.getWorldPosition(new THREE.Vector3());
    const aim = this.aimProvider ? this.aimProvider(ndc) : { point: this.aimPointFor(ndc), target: null };
    const shot = ++this.shotId;
    const pellet = new THREE.Mesh(this.pelletGeometry, this.pelletMaterial());
    pellet.layers.set(LAYER_NO_REFLECT);
    this.scene.add(pellet);
    const tracer = createTracer('#ffe2b8', 7);
    tracer.layers.set(LAYER_NO_REFLECT);
    this.scene.add(tracer);
    const dist = muzzle.distanceTo(aim.point);
    this.launch({
      kind: 'pellet',
      shot,
      obj: pellet,
      tracer,
      from: muzzle,
      aim,
      duration: Math.max(0.02, dist / 150),
      arc: 0,
      speed: 150,
      gravity: 0.6,
    });
    this.recoilVel += 3.4;
    this.cock = 0;
    this.cockClicks = 0;
    const dir = aim.point.clone().sub(muzzle).normalize();
    if (this.onPuff) this.onPuff(muzzle, dir);
    if (this.audio) this.audio.rifle();
    return shot;
  }

  pelletMaterial() {
    if (!this._pellet) {
      this._pellet = new THREE.MeshPhysicalMaterial({ color: 0x8e9296, metalness: 1, roughness: 0.3 });
      this._pellet.envMap = this.envMap;
    }
    return this._pellet;
  }

  // Slingshot: press to draw, release to let go. A quick tap still shows a
  // short draw before the stone flies.
  beginDraw(ndc) {
    this.ndc.copy(ndc);
    this.targetNdc.copy(ndc);
    this.visible = true;
    this.restTimer = 0;
    if (this.tool !== 'sling' || !this.canFire()) return false;
    this.drawing = { t: 0, release: false };
    if (this.audio) this.audio.slingDraw();
    return true;
  }

  releaseDraw(ndc) {
    if (!this.drawing) return;
    if (ndc) this.targetNdc.copy(ndc);
    this.drawing.release = true;
  }

  launchStone() {
    const ndc = this.targetNdc.clone();
    const from = this.sling.stoneWorldPosition(new THREE.Vector3());
    const aim = this.aimProvider ? this.aimProvider(ndc) : { point: this.aimPointFor(ndc), target: null };
    const shot = ++this.shotId;
    const stone = new THREE.Mesh(this.stoneGeometries[shot % 3], this.stoneMaterial);
    stone.layers.set(LAYER_NO_REFLECT);
    stone.quaternion.copy(this.sling.stone.getWorldQuaternion(tmpQ));
    this.scene.add(stone);
    const tracer = createTracer('#e8e0f0', 0.5);
    tracer.layers.set(LAYER_NO_REFLECT);
    this.scene.add(tracer);
    const power = 0.65 + 0.35 * this.pull;
    const dist = from.distanceTo(aim.point);
    const speed = 30 + 18 * power;
    this.launch({
      kind: 'stone',
      shot,
      obj: stone,
      tracer,
      from,
      aim,
      duration: Math.max(0.12, dist / speed),
      arc: Math.min(3, 0.35 + dist * 0.045),
      speed,
      gravity: 9.8,
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(40),
    });
    // the pouch snaps forward past the fork and the bands shiver
    this.wobble = -this.pull * 0.24;
    this.wobbleVel = 0;
    this.pull = 0;
    this.drawing = null;
    this.slingReload = 0;
    if (this.audio) this.audio.slingRelease(power);
    return shot;
  }

  launch(p) {
    p.pos = p.from.clone();
    p.prev = p.from.clone();
    p.vel = new THREE.Vector3();
    p.t = 0;
    p.age = 0;
    p.travelled = 0;
    p.state = 'aimed';
    p.hit = new Set();
    this.projectiles.push(p);
  }

  // Where a projectile is heading now: the locked balloon moves, so follow it.
  aimNow(p, out) {
    const tg = p.aim.target;
    if (tg && tg.balloon.state === 'flying') return out.copy(tg.localPoint).applyMatrix4(tg.balloon.envelope.matrixWorld);
    return out.copy(p.aim.point);
  }

  updateProjectiles(dt) {
    const cam = this.camera;
    const aimNow = new THREE.Vector3();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      p.prev.copy(p.pos);
      let done = false;
      if (p.state === 'aimed') {
        p.t += dt / p.duration;
        const k = Math.min(1, p.t);
        this.aimNow(p, aimNow);
        p.pos.lerpVectors(p.from, aimNow, k);
        p.pos.y += p.arc * 4 * k * (1 - k);
        this.sweep(p, p.aim.target ? p.aim.target.balloon : null);
        if (k >= 1) {
          const tg = p.aim.target;
          if (tg && tg.balloon.state === 'flying' && !p.hit.has(tg.balloon)) {
            p.hit.add(tg.balloon);
            if (this.onHit) this.onHit({ balloon: tg.balloon, localPoint: tg.localPoint, worldPoint: aimNow.clone() }, p.shot);
          }
          // carry on through: fabric barely slows a pellet or a stone
          p.state = 'free';
          p.vel.subVectors(p.pos, p.prev).divideScalar(Math.max(dt, 1e-4));
          if (p.vel.lengthSq() < 1) p.vel.subVectors(aimNow, p.from).normalize().multiplyScalar(p.speed);
          p.vel.multiplyScalar(p.kind === 'stone' ? 0.85 : 0.95);
        }
      } else {
        p.vel.y -= p.gravity * dt;
        p.vel.multiplyScalar(Math.exp(-dt * (p.kind === 'stone' ? 0.08 : 0.02)));
        p.pos.addScaledVector(p.vel, dt);
        this.sweep(p, null);
        if (p.pos.y <= 0.02) {
          if (this.onSplash) this.onSplash(p.pos.clone(), p.kind === 'stone' ? 0.3 : 0.12);
          done = true;
        }
        if (p.age > 4) done = true;
      }
      const step = p.pos.distanceTo(p.prev);
      p.travelled += step;
      const camDist = p.pos.distanceTo(cam.position);
      p.obj.position.copy(p.pos);
      if (p.kind === 'stone') {
        p.obj.rotation.x += p.spin.x * dt;
        p.obj.rotation.y += p.spin.y * dt;
        p.obj.rotation.z += p.spin.z * dt;
        // a toy's licence: the stone stays readable as it flies away
        p.obj.scale.setScalar(1 + camDist * 0.05);
      } else {
        p.obj.scale.setScalar(1 + camDist * 0.08);
      }
      if (p.tracer) this.orientTracer(p, step, camDist);
      if (done) {
        p.obj.removeFromParent();
        if (p.tracer) {
          p.tracer.removeFromParent();
          p.tracer.material.dispose();
          p.tracer.geometry.dispose();
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  // Test the path just flown for balloons, nearest first; `skip` is the
  // locked target, which is struck exactly when the shot arrives.
  sweep(p, skip) {
    if (!this.hitTest || p.pos.distanceToSquared(p.prev) < 1e-10) return;
    const exclude = p.hit;
    if (skip) exclude.add(skip);
    const hits = this.hitTest(p.prev, p.pos, exclude);
    if (skip) exclude.delete(skip);
    for (const h of hits) {
      p.hit.add(h.balloon);
      if (this.onHit) this.onHit(h, p.shot);
    }
  }

  orientTracer(p, step, camDist) {
    const t = p.tracer;
    if (step < 1e-5) {
      t.visible = false;
      return;
    }
    t.visible = true;
    ax.subVectors(p.pos, p.prev).normalize();
    az.subVectors(this.camera.position, p.pos).normalize();
    ay.crossVectors(ax, az).normalize();
    az.crossVectors(ax, ay);
    tmpM.makeBasis(ax, ay, az);
    t.quaternion.setFromRotationMatrix(tmpM);
    t.position.copy(p.pos);
    const len = Math.min(p.travelled, (p.kind === 'pellet' ? 1.5 : 0.8) + camDist * (p.kind === 'pellet' ? 0.07 : 0.03));
    const width = (p.kind === 'pellet' ? 0.005 : 0.012) + camDist * (p.kind === 'pellet' ? 0.0045 : 0.003);
    t.scale.set(len, width, 1);
    t.material.uniforms.uAlpha.value = p.kind === 'pellet' ? Math.min(1, p.age * 30) : 0.5;
  }

  // The rifle and slingshot, held in front of the camera.
  updateHeld(realDt) {
    const s = this.handScale();
    const fade = Math.max(0.001, this.fade);
    const aim = this.heldAim(this.ndc);
    // posed even while faded out, so a first tap on touch fires from the muzzle
    const rifleOn = this.tool === 'rifle';
    this.rifle.group.visible = rifleOn && this.fade > 0.02;
    if (rifleOn) {
      // recoil: a stiff spring that kicks the rifle back and the muzzle up
      this.recoilVel += (-this.recoil * 420 - this.recoilVel * 26) * realDt;
      this.recoil += this.recoilVel * realDt;
      const h = this.rifleHold;
      const offset = tmp.set(h.x * s, h.y - (1 - fade) * 0.2 + this.recoil * 0.05, h.z + this.recoil * 0.3);
      this.holdAt(this.rifle.group, offset, aim);
      this.rifle.group.rotateX(-this.recoil * 0.9);
      this.rifle.group.rotateZ(this.recoil * 0.25);
      this.rifle.group.scale.setScalar(s);
      // cocking stroke: the knob slides back, then home
      if (this.cock < 1) {
        const before = this.cock;
        this.cock = Math.min(1, this.cock + realDt / 0.42);
        const c = this.cock;
        const back = c < 0.25 ? 0 : c < 0.55 ? (c - 0.25) / 0.3 : c < 0.85 ? 1 - (c - 0.55) / 0.3 : 0;
        this.rifle.bolt.position.z = this.rifle.boltRest - back * 0.055;
        if (this.audio && before < 0.5 && c >= 0.5) this.audio.cock(0);
        if (this.audio && before < 0.85 && c >= 0.85) this.audio.cock(1);
      }
    }
    const slingOn = this.tool === 'sling';
    this.sling.group.visible = slingOn && this.fade > 0.02;
    this.slingReload = Math.min(1, this.slingReload + realDt / 0.45);
    if (this.drawing) {
      const d = this.drawing;
      d.t += realDt;
      const k = Math.min(1, d.t / 0.24);
      this.pull = 1 - (1 - k) * (1 - k);
      if (d.release && d.t >= 0.14) this.launchStone();
    }
    // bands: an underdamped spring, so the pouch overshoots and shivers
    this.wobbleVel += (-this.wobble * 900 - this.wobbleVel * 9) * realDt;
    this.wobble += this.wobbleVel * realDt;
    if (slingOn) {
      const h = this.slingHold;
      const offset = tmp.set(h.x * s, h.y - (1 - fade) * 0.2, h.z);
      this.holdAt(this.sling.group, offset, aim);
      this.sling.group.rotateZ(-0.12);
      this.sling.group.scale.setScalar(s);
      this.sling.setDraw(this.pull, this.wobble, this.slingReload >= 1 || !!this.drawing);
    }
  }

  update(realDt, dt, onDartSplash) {
    // mouse: the tool trails the pointer slightly for weight
    const follow = this.pointerType === 'mouse' ? 1 - Math.exp(-realDt * 28) : 1;
    this.ndc.lerp(this.targetNdc, follow);
    // with touch there is no hover: show the pin or dart for the strike, then
    // put it away. The rifle and slingshot stay in hand.
    if (this.pointerType !== 'mouse' && !this.aimed) {
      this.restTimer += realDt;
      if (this.restTimer > 0.9 && this.jabTime < 0) this.visible = false;
    }
    this.fade += ((this.visible ? 1 : 0) - this.fade) * (1 - Math.exp(-realDt * 12));

    // pin jab: fast thrust along the ray, then a softer pull back
    let dist = 1.55;
    if (this.jabTime >= 0) {
      this.jabTime += realDt;
      const t = this.jabTime;
      const inT = 0.07;
      const outT = 0.2;
      if (t < inT) dist += 0.55 * (t / inT) ** 2;
      else if (t < inT + outT) dist += 0.55 * (1 - (t - inT) / outT) ** 2;
      else this.jabTime = -1;
      if (t >= inT && this.jabContact) {
        const c = this.jabContact;
        this.jabContact = null;
        c();
      }
    }
    const pinOn = this.tool === 'pin';
    this.pin.visible = pinOn && this.fade > 0.02;
    if (this.pin.visible) {
      this.pose(this.pin, this.ndc, dist);
      this.pin.scale.setScalar(Math.max(0.001, this.fade) * this.handScale());
    }
    this.reload = Math.min(1, this.reload + realDt / 0.35);
    this.dartHeld.visible = this.tool === 'dart' && this.fade > 0.02;
    if (this.dartHeld.visible) {
      const slide = 1 - this.reload;
      const n = this.ndc.clone();
      n.y -= slide * slide * 0.9;
      this.pose(this.dartHeld, n, 1.4, 0.8);
      this.dartHeld.scale.setScalar(Math.max(0.001, this.fade) * 1.9 * this.handScale());
    }
    this.updateHeld(realDt);
    // like the dart, shots fly in real time so slow motion never stalls a streak
    this.updateProjectiles(realDt);

    // darts in flight
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const d = this.flying[i];
      if (d.state === 'flight') {
        d.t += realDt / d.duration;
        if (d.target && d.target.balloon.state === 'flying') {
          // follow the balloon so the point lands where it was aimed
          d.to.copy(d.target.localPoint).applyMatrix4(d.target.balloon.envelope.matrixWorld);
        }
        const k = Math.min(1, d.t);
        const e = 1 - (1 - k) * (1 - k) * 0.35 - 0.65 * (1 - k); // mostly linear, slight ease
        const p = new THREE.Vector3().lerpVectors(d.from, d.to, e);
        const arc = Math.sin(Math.PI * k) * d.from.distanceTo(d.to) * 0.035;
        p.y += arc;
        const prev = d.obj.position.clone();
        d.obj.position.copy(p);
        const dir = p.clone().sub(prev);
        if (dir.lengthSq() > 1e-8) {
          d.vel.copy(dir).divideScalar(Math.max(1e-4, realDt));
          d.obj.quaternion.setFromUnitVectors(Y, dir.normalize().negate());
        }
        d.spin += realDt * 18;
        d.obj.rotateY(d.spin);
        const travelled = d.from.distanceTo(p);
        d.obj.scale.setScalar(1.9 * (1 + travelled * 0.07));
        if (k >= 1) {
          if (d.hit && d.onContact) d.onContact();
          d.state = 'fall';
          d.vel.multiplyScalar(d.hit ? 0.35 : 0.6);
        }
      } else {
        // after the pop (or a miss) the dart drops into the sea
        d.vel.y -= 9.8 * dt;
        d.obj.position.addScaledVector(d.vel, dt);
        const dir = d.vel.clone().normalize().negate();
        d.obj.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(Y, dir), 1 - Math.exp(-dt * 4));
        if (d.obj.position.y < 0) {
          if (onDartSplash) onDartSplash(d.obj.position);
          d.obj.removeFromParent();
          this.flying.splice(i, 1);
        }
      }
    }
  }
}
