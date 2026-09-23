// The popping tools the player holds: a pearl-headed steel pin that follows
// the pointer and jabs, and a steel-tipped dart that is thrown at the target.
import * as THREE from 'three';
import { LAYER_NO_REFLECT } from './sea.js';

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

export class ToolRig {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.envMap = createToolEnvironment(renderer);
    this.pin = buildPin();
    this.dartHeld = buildDart();
    prepare(this.pin, this.envMap);
    prepare(this.dartHeld, this.envMap);
    scene.add(this.pin, this.dartHeld);
    this.flying = [];
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
  }

  setTool(name) {
    this.tool = name;
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

  // Start a strike. `onContact` fires when the point meets the target.
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

  update(realDt, dt, onDartSplash) {
    const cam = this.camera;
    // mouse: the tool trails the pointer slightly for weight
    const follow = this.pointerType === 'mouse' ? 1 - Math.exp(-realDt * 28) : 1;
    this.ndc.lerp(this.targetNdc, follow);
    // with touch there is no hover: show the tool for the strike, then put it away
    if (this.pointerType !== 'mouse') {
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
    this.dartHeld.visible = !pinOn && this.fade > 0.02;
    if (this.dartHeld.visible) {
      const slide = 1 - this.reload;
      const n = this.ndc.clone();
      n.y -= slide * slide * 0.9;
      this.pose(this.dartHeld, n, 1.4, 0.8);
      this.dartHeld.scale.setScalar(Math.max(0.001, this.fade) * 1.9 * this.handScale());
    }

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
