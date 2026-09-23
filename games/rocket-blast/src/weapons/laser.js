// Laser: rapid, chunky, white-hot bolts with a warm glow and a short trail.
// Bolts lean gently towards the nearest toy ahead, and anything they pass
// close to counts as hit.
import * as THREE from 'three';
import { SPRITE } from '../textures.js';
import { rand } from '../config.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

export class Laser {
  constructor(sys) {
    this.sys = sys;
    this.bolts = [];
    const geo = new THREE.CapsuleGeometry(0.15, 0.62, 6, 14);
    // white-hot core fading to saturated gold at the rim, so a bolt reads
    // on the brightest sky as well as the darkest
    const mat = new THREE.ShaderMaterial({
      uniforms: { uCore: { value: new THREE.Color(2.4, 1.9, 0.7) }, uRim: { value: new THREE.Color(2.2, 0.62, 0.03) } },
      vertexShader: /* glsl */ `
varying float vFacing;
void main() {
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: /* glsl */ `
uniform vec3 uCore;
uniform vec3 uRim;
varying float vFacing;
void main() {
  float k = smoothstep(0.55, 1.0, vFacing);
  gl_FragColor = vec4(mix(uRim, uCore, k), 1.0);
}`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, 160);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 8;
    sys.scene.add(this.mesh);
  }

  interval(mega) {
    return mega ? 0.085 : 0.14;
  }

  fire(ctx, { mega = false, volley = false } = {}) {
    const m = ctx.muzzle;
    const angles = volley ? [-0.5, -0.32, -0.16, 0, 0.16, 0.32, 0.5] : mega ? [-0.2, 0, 0.2] : [0];
    const size = mega || volley ? 1.35 : 1;
    for (const a of angles) {
      const sp = 24;
      this.bolts.push({ id: ctx.nextShot(), x: m.x + a * 0.6, y: m.y, vx: Math.sin(a) * sp, vy: Math.cos(a) * sp, size, age: 0, hitIds: new Set(), pierce: mega ? 2 : volley ? 2 : 1 });
    }
    // muzzle flash
    this.sys.glow.add({ x: m.x, y: m.y + 0.1, z: 0.4, size: 1.3 * size, life: 0.08, frame: SPRITE.GLOW, r: 3, g: 2.4, b: 1, a: 1 });
    this.sys.audio?.laser(mega || volley);
    ctx.rocket.kick(0.6);
  }

  update(dt, t, ctx) {
    const b = ctx.bounds;
    let n = 0;
    for (const bolt of this.bolts) {
      bolt.age += dt;
      // gentle homing: lean towards the closest toy ahead
      if (ctx.assist > 0) {
        let best = null;
        let bd = 3.2;
        for (const e of ctx.enemies) {
          if (!e.alive || e.y < bolt.y) continue;
          const dx = e.x - bolt.x;
          if (Math.abs(dx) < bd && e.y - bolt.y < 9) {
            bd = Math.abs(dx);
            best = e;
          }
        }
        if (best) bolt.vx += (best.x - bolt.x) * 30 * ctx.assist * dt;
        bolt.vx *= Math.exp(-dt * 2);
      }
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      // hit anything nearby
      const reach = 0.72 * bolt.size;
      for (const e of ctx.enemies) {
        if (!e.alive || bolt.hitIds.has(e.id)) continue;
        const r = reach + 0.5 * e.size;
        const dx = e.x - bolt.x;
        const dy = e.y - bolt.y;
        if (dx * dx + dy * dy < r * r || (Math.abs(dx) < r && dy < 0 && dy > -bolt.vy * dt - r)) {
          bolt.hitIds.add(e.id);
          ctx.hit(e, bolt.x, bolt.y + 0.3, { weapon: 'laser', shot: bolt.id });
          bolt.pierce--;
          if (bolt.pierce <= 0) {
            bolt.dead = true;
            break;
          }
        }
      }
      if (bolt.dead || bolt.y > b.maxY + 2) continue;
      const ang = Math.atan2(bolt.vx, bolt.vy);
      tmpQ.setFromAxisAngle(Z, -ang);
      tmpS.set(bolt.size, bolt.size, bolt.size);
      tmpP.set(bolt.x, bolt.y, 0.2);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(n, tmpM);
      this.bolts[n++] = bolt;
      this.sys.glow.add({ x: bolt.x, y: bolt.y, z: 0.1, size: 0.95 * bolt.size, life: 0, frame: SPRITE.GLOW, r: 1.3, g: 0.6, b: 0.08, a: 0.45 });
      this.sys.glow.add({ x: bolt.x - bolt.vx * 0.035, y: bolt.y - bolt.vy * 0.035, z: 0.1, vx: bolt.vx * 0.001, vy: bolt.vy * 0.001, size: 1.1 * bolt.size, w: 1.4, h: 0.3, align: true, life: 0, frame: SPRITE.STREAK, r: 1.4, g: 0.7, b: 0.12, a: 0.6 });
      if (Math.random() < 0.15) this.sys.glow.add({ x: bolt.x + rand(-0.1, 0.1), y: bolt.y - 0.5, z: 0.2, vx: rand(-0.8, 0.8), vy: -1, size: rand(0.08, 0.13), life: 0.25, frame: SPRITE.DOT, r: 3, g: 1.8, b: 0.5 });
    }
    this.bolts.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.bolts.length = 0;
    this.mesh.count = 0;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }
}
