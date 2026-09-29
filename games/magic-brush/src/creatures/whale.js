// Wave, a chubby baby whale who lives in a floating ball of clear water: a
// big round head with a wide smile, friendly eyes, a blowhole, little
// flippers and a broad fluke, glossy skin in the child's colours and a
// pale, ribbed belly. The bubble bobs just above the ground and shimmers
// like a soap film; tiny air bubbles rise inside it; Wave swims slow
// circles in it, beating his fluke, and faces forward when he drifts off
// somewhere or does a trick.
//
// Tricks: 'spout' (rises to the top and blows a spout of water and
// sparkles up out of the bubble), 'flip' (a somersault inside the bubble)
// and 'bounce' (the bubble bounces on the grass like a ball, squashing,
// with Wave jostling inside).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { bindTo } from './parts.js';
import { mergeGeometries } from './sculpt.js';
import { pose, addPose, bump, ramp, smooth, TAU, clamp, lerp } from './anim.js';
import { SoftSpring } from './soft.js';
import { Tracker } from './pal-kit.js';
import { glide, puff } from '../sound/calls.js';
import { rand } from '../config.js';

const SKIN = 0x3a8ee0;
const BELLY = 0xdff3ff;
const MOUTH = 0x23324f;
const BLUSH = 0xf59ac0;

const C = [0, 0.172, 0]; // the bubble's centre, and Wave's
const R = 0.142; // the bubble's radius
const EYE = [0.036, 0.184, 0.059];
const BLOWHOLE = [0, 0.219, 0.024];
const SMALL = 7; // tiny air bubbles
// in the garden he is this much bigger than on the easel (friends on the
// ground keep the size they came alive at, so he grows as his bubble forms)
// and his bubble floats this much higher
const SIZE = 1.35;
const LIFT = 0.016;
const AIR = Array.from({ length: SMALL }, (_, i) => 'air' + i);
// 'bounce': each hop's start, landing and height
const BOUNCES = [[0.25, 0.85, 0.09], [0.85, 1.35, 0.055], [1.35, 1.75, 0.03]];

// the head: a big round ellipsoid (centre, radii)
const HC = [0, 0.178, 0.036];
const HR = [0.052, 0.049, 0.052];
// a point on the head's surface at height y, an angle phi round from the front
function onHead(y, phi, side = 1) {
  const k = Math.sqrt(Math.max(0, 1 - ((y - HC[1]) / HR[1]) ** 2));
  return [side * HR[0] * k * Math.sin(phi), y, HC[2] + HR[2] * k * Math.cos(phi)];
}

export class Whale extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.hideOpts = { clearcoat: 1, sheen: 0.25 };
    this.shared.uSplat.value = 0.2;
    this.walkSpeed = 0.1;
    this.turnRate = 1.2;
    this.hopScale = 0.8;
    this.sparkleColors = [[0.8, 1.5, 2.0], [1.6, 1.9, 2.0], [1.2, 1.2, 2.0]];
    this.track = new Tracker();
    this.theta = Math.random() * TAU; // where he is on his circle
    this.focus = new SoftSpring(0, 1.0, 1.0); // 1: facing forward, centred
    this.swimPh = 0;
    this.bubbleScale = new SoftSpring(0, 2.2, 0.35);
    this.size = new SoftSpring(0, 1.1, 1); // how far he has grown to garden size (steady: the bubble's own pop overshoots)
    this.portraitRadius = R * 1.4; // the shelf picture shows the whole bubble
    this.jelly = new SoftSpring(0, 2.6, 0.18);
    this.lagX = new SoftSpring(0, 1.4, 0.5);
    this.lagY = new SoftSpring(0, 1.4, 0.5);
    this.lagZ = new SoftSpring(0, 1.4, 0.5);
    this.headYaw = new SoftSpring(0, 1.2, 0.8);
    this.small = Array.from({ length: SMALL }, (_, i) => ({ y: i / SMALL, x: rand(-0.07, 0.07), z: rand(-0.07, 0.07), sp: rand(0.045, 0.085), ph: rand(0, TAU), w: rand(2.2, 3.6) }));
    this.sizeK = 1;
  }

  get tricks() {
    return ['spout', 'flip', 'bounce'];
  }

  dispose() {
    if (this.pool) {
      this.pool.geometry.dispose();
      this.pool.material.map.dispose();
      this.pool.material.dispose();
    }
    super.dispose();
  }

  sculpt(s) {
    s.bone('root', null, C);
    s.bone('bubble', 'root', C);
    s.bone('swim', 'root', C);
    s.bone('body', 'swim', C);
    s.bone('head', 'body', [0, 0.174, 0.036]);
    this.eyeBones(s, EYE);
    s.bone('tail0', 'body', [0, 0.172, -0.042]);
    s.bone('tail1', 'tail0', [0, 0.18, -0.088]);
    s.bones2('fin', 'body', [0.042, 0.152, 0.026]);
    for (let i = 0; i < SMALL; i++) s.bone(AIR[i], 'root', C);

    const skin = { paint: 1, fur: 0, rough: 0.3, pat: 0, tint: SKIN };
    const belly = { paint: 0.22, rough: 0.38, tint: BELLY };
    s.setLook(skin);
    // a chubby body and a big round head
    s.ellipsoid([0, 0.17, -0.004], [0.049, 0.046, 0.066], { bone: 'body', k: 0.035 });
    s.ellipsoid(HC, HR, { bone: 'head', k: 0.03 });
    // the pale belly and chin
    s.ellipsoid([0, 0.147, 0.012], [0.046, 0.032, 0.064], { bone: 'body', k: 0.02, ...belly });
    // the tail stock sweeping up to a broad fluke
    s.cone([0, 0.168, -0.046], [0, 0.178, -0.09], 0.032, 0.0115, { bone: 'tail0', k: 0.03 });
    s.cone([0, 0.178, -0.09], [0, 0.186, -0.1], 0.0115, 0.009, { bone: 'tail1', k: 0.01 });
    s.ellipsoid([0.022, 0.188, -0.108], [0.026, 0.0052, 0.013], { bone: 'tail1', k: 0.012, sym: true, rot: [0.15, -0.5, 0] });
    // flippers
    s.ellipsoid([0.049, 0.148, 0.024], [0.024, 0.005, 0.012], { bone: 'finL', k: 0.012, sym: true, rot: [0, -0.45, -0.55] });
    // blowhole
    s.ellipsoid(BLOWHOLE, [0.0065, 0.004, 0.0035], { bone: 'head', sub: true, k: 0.004, tint: 0x1f3c66, paint: 0.4 });
    // cheeks with a rosy blush
    s.sphere(onHead(0.17, 1.0), 0.012, { bone: 'head', k: 0.016, sym: true, tint: BLUSH, paint: 0.5 });
    // the belly's pleats: grooves running along the pale underside
    for (let i = -2; i <= 2; i++) {
      const x = i * 0.012;
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const z = lerp(0.06, -0.03, k / 4);
        const b = (x / 0.046) ** 2 + ((z - 0.012) / 0.064) ** 2;
        const y = 0.147 - 0.032 * Math.sqrt(Math.max(0, 1 - b)) + 0.0004;
        pts.push([x, y, z]);
      }
      for (let k = 0; k < 4; k++) s.cone(pts[k], pts[k + 1], 0.0015, 0.0015, { bone: 'body', sub: true, k: 0.002, tint: 0xa9c9e0, paint: 0.2 });
    }
    // a wide smile round the front of the head, curling up at the corners
    for (const side of [1, -1])
      for (let k = 0; k < 6; k++) {
        const u0 = k / 6, u1 = (k + 1) / 6;
        const pa = onHead(0.162 + 0.02 * u0 * u0 * u0, u0 * 1.45, side);
        const pb = onHead(0.162 + 0.02 * u1 * u1 * u1, u1 * 1.45, side);
        s.cone(pa, pb, 0.0024, 0.0022 - u1 * 0.0006, { bone: 'head', sub: true, k: 0.002, tint: MOUTH, paint: 0, rough: 0.5 });
      }
    // eye sockets
    s.sphere(EYE, 0.016, { bone: 'head', k: 0.005, sym: true });
  }

  parts(s) {
    const I = s.index;
    this.addEyes(s, {
      c: EYE,
      r: 0.019,
      dir: [0.66, 0.12, 0.74],
      iris: 0x4a9ee8,
      iris2: 0x1e3f8a,
      irisSize: 0.92,
      pupil: 0.46,
      lid: { tint: SKIN, paint: 1, rough: 0.35, open: -0.35, closed: 1.5 },
    });

    // the bubble: a ball of clear water. It refracts the garden behind it
    // (ior 1.33), with a bright rim where it turns away, a soft caustic
    // glow on the side away from the sun, the sun's sharp glint and only a
    // hint of soap-film colour
    const g = new THREE.SphereGeometry(R, 64, 40);
    g.translate(C[0], C[1], C[2]);
    g.deleteAttribute('uv');
    bindTo(g, I.bubble);
    const bm = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.03,
      metalness: 0,
      transmission: 1,
      thickness: 0.1,
      ior: 1.33,
      attenuationColor: new THREE.Color(0.74, 0.92, 1.0),
      attenuationDistance: 0.7,
      specularIntensity: 1,
      iridescence: 0.22,
      iridescenceIOR: 1.33,
      iridescenceThicknessRange: [260, 560],
      envMapIntensity: 1.2,
    });
    bm.depthWrite = false; // the air bubbles inside draw over it
    const time = this.shared.uTime;
    bm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <opaque_fragment>',
        `{
          vec3 wN = normalize(normal);
          vec3 wV = normalize(vViewPosition);
          float wF = 1.0 - clamp(dot(wN, wV), 0.0, 1.0);
          outgoingLight += vec3(0.8, 0.93, 1.0) * (pow(wF, 3.0) * 0.55 + pow(wF, 8.0) * 0.6);
          #if NUM_DIR_LIGHTS > 0
            float wC = smoothstep(0.45, 0.95, dot(wN, -directionalLights[0].direction)) * (1.0 - wF * 0.5);
            float wS = 0.7 + 0.3 * sin(uTime * 1.6 + wN.x * 8.0 + wN.y * 6.0);
            outgoingLight += directionalLights[0].color * vec3(1.0, 0.95, 0.8) * wC * wS * 0.09;
          #endif
        }
        #include <opaque_fragment>`
      );
    };
    bm.customProgramCacheKey = () => 'mb-whale-water';
    const bubble = this.addMesh(g, bm, { shadow: false });
    bubble.userData.noProject = true;
    bubble.renderOrder = 2;
    this.bubbleMesh = bubble;

    // tiny air bubbles rising inside: see-through, with a silvery rim
    const list = [];
    for (let i = 0; i < SMALL; i++) {
      const r = 0.0035 + (i % 3) * 0.002;
      const b = new THREE.SphereGeometry(r, 14, 10);
      b.translate(C[0], C[1], C[2]);
      b.deleteAttribute('uv');
      bindTo(b, I[AIR[i]]);
      list.push(b);
    }
    const am = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transparent: true, depthWrite: false, envMapIntensity: 1.5 });
    am.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float aF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        outgoingLight += vec3(0.9, 0.97, 1.0) * pow(aF, 2.0) * 0.8;
        diffuseColor.a = clamp(0.12 + pow(aF, 1.5) * 0.9, 0.0, 1.0);
        #include <opaque_fragment>`
      );
    };
    am.customProgramCacheKey = () => 'mb-whale-air';
    const air = this.addMesh(mergeGeometries(list), am, { shadow: false });
    air.userData.noProject = true;
    air.renderOrder = 3;

    // under the bubble: a soft shadow ring with light focused in the middle
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,250,225,0.55)');
    gr.addColorStop(0.3, 'rgba(235,248,255,0.25)');
    gr.addColorStop(0.55, 'rgba(20,45,70,0.16)');
    gr.addColorStop(0.8, 'rgba(20,45,70,0.07)');
    gr.addColorStop(1, 'rgba(20,45,70,0)');
    cx.fillStyle = gr;
    cx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pg = new THREE.PlaneGeometry(R * 2.1, R * 2.1);
    pg.rotateX(-Math.PI / 2);
    this.pool = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    this.pool.position.set(C[0], 0.003, C[2]);
    this.pool.renderOrder = 1;
    this.object.add(this.pool);
  }

  // ------------------------------------------------------------ motion

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const m = this.motion;
    const u = this.shared;
    const tr = this.track.update(this.object, dt);
    const speed = m.speed;
    const moving = clamp(speed / 0.06, 0, 1);

    // the bubble: forms once he is fully alive (while he comes out of the
    // painting it would only get in the way), pops into shape, bobs, wobbles
    const painting = u.uAliveOn.value > 0.5 && u.uFront.value > -0.2;
    const bs = this.bubbleScale.update(painting ? 0 : 1, dt);
    const jel = this.jelly.update(0, dt);
    const bob = Math.sin(t * 1.3) * 0.008 + Math.sin(t * 0.47) * 0.004;
    const grown = smooth(clamp(this.size.update(painting ? 0 : 1, dt), 0, 1));
    B.root.position.y += bob + LIFT * grown;
    // grow to garden size with the bubble: whoever places him sets his scale
    // each frame (friends.js, alive.js) or once (a portrait, a test page), so
    // scale on top of theirs, or swap the last factor for the new one
    const k = lerp(1, SIZE, grown);
    const os = this.object.scale;
    os.multiplyScalar(this.sizeX !== undefined && Math.abs(os.x - this.sizeX) < 1e-7 ? k / this.sizeK : k);
    this.sizeK = k;
    this.sizeX = os.x;
    if (this.pool) {
      this.pool.material.opacity = clamp(bs, 0, 1) * (1 - clamp((B.root.position.y - C[1]) * 6, 0, 0.6));
      this.pool.visible = bs > 0.01;
    }
    const sq = jel + (this.squash || 0);
    B.bubble.scale.set(Math.max(0.001, bs * (1 + sq * 0.6)), Math.max(0.001, bs * (1 - sq)), Math.max(0.001, bs * (1 + sq * 0.6)));
    this.squash = 0;

    // swimming: slow circles when idle, facing forward when drifting or
    // doing a trick; the fluke beats faster when he means to go somewhere
    const wantFocus = this.trick || moving > 0.1 || m.air > 0 || painting ? 1 : 0;
    const focus = clamp(this.focus.update(wantFocus, dt), 0, 1);
    const circling = 1 - focus;
    // theta stays within half a turn of zero, so settling back to face
    // forward always takes the short way round (and the head's look is right)
    this.theta += dt * 0.55 * circling;
    this.theta -= Math.round(this.theta / TAU) * TAU;
    if (focus > 0.01) this.theta *= Math.exp(-dt * 2.5 * focus);
    const rc = 0.024 * circling;
    B.swim.rotation.y = this.theta;
    // the body lags behind the bubble's own movement, like water sloshing
    const lx = this.lagX.update(clamp(-tr.acc.x * 0.004, -0.02, 0.02), dt);
    const ly = this.lagY.update(clamp(-tr.acc.y * 0.004, -0.02, 0.02), dt);
    const lz = this.lagZ.update(clamp(-tr.acc.z * 0.004, -0.02, 0.02), dt);
    B.body.position.x += -rc + lx;
    B.body.position.y += ly + Math.sin(t * 0.9 + 1) * 0.006 * circling;
    B.body.position.z += lz;
    // banking into the turn, a gentle pitch with each stroke
    const beatRate = lerp(2.2, 4.2, Math.max(moving, focus * 0.4));
    this.swimPh += dt * beatRate;
    const beat = Math.sin(this.swimPh);
    B.body.rotation.z = 0.18 * circling + Math.sin(t * 0.7) * 0.04;
    B.body.rotation.x = beat * 0.04 - 0.06 * m.air;
    B.body.rotation.y = Math.sin(this.swimPh - 0.5) * 0.04;
    pose(B.tail0, beat * 0.28 + 0.1 * m.air, 0, 0);
    pose(B.tail1, Math.sin(this.swimPh - 1.1) * 0.45 + 0.2 * m.air, 0, 0);
    pose(B.finL, 0, Math.sin(this.swimPh * 0.5) * 0.15, -0.1 + Math.sin(this.swimPh + 0.6) * 0.3);
    pose(B.finR, 0, -Math.sin(this.swimPh * 0.5) * 0.15, 0.1 - Math.sin(this.swimPh + 0.6) * 0.3);
    // head: a curious turn towards what he looks at
    let yaw = Math.sin(t * 0.37) * 0.12;
    if (this.lookLocal) {
      // the head turns within the swimming frame, which is turned by theta
      let d = Math.atan2(this.lookLocal.x, this.lookLocal.z) - this.theta;
      d -= Math.round(d / TAU) * TAU;
      yaw = clamp(d, -0.3, 0.3);
    }
    pose(B.head, Math.sin(t * 0.8) * 0.04, this.headYaw.update(yaw * 0.6, dt), 0);

    // tiny air bubbles float up, wobbling, and start again at the bottom
    for (let i = 0; i < SMALL; i++) {
      const b = this.small[i];
      b.y += dt * b.sp;
      if (b.y > 1) {
        b.y -= 1;
        b.x = rand(-0.07, 0.07);
        b.z = rand(-0.07, 0.07);
      }
      const y = lerp(-R * 0.75, R * 0.75, b.y);
      const lim = Math.sqrt(Math.max(0, R * R * 0.72 - y * y));
      const bone = B[AIR[i]];
      bone.position.x = clamp(b.x + Math.sin(t * b.w + b.ph) * 0.006, -lim, lim);
      bone.position.y = y;
      bone.position.z = clamp(b.z + Math.cos(t * b.w * 0.8 + b.ph) * 0.004, -lim, lim);
      const sc = bs * Math.min(1, b.y * 8, (1 - b.y) * 8);
      bone.scale.setScalar(Math.max(0.001, sc));
    }

    if (this.trick) this.trickPose(this.trick, dt);
  }

  trickPose(tr, dt) {
    const B = this.bones;
    const t = tr.t;
    if (tr.name === 'spout') {
      // swims up to the top, takes a breath, and blows a spout up out of the bubble
      const rise = ramp(t, 0.1, 0.8) * (1 - ramp(t, 2.0, 2.6));
      const breath = bump(t, 0.6, 1.05);
      const blow = bump(t, 1.0, 1.9);
      B.body.position.y += 0.045 * rise;
      B.body.rotation.x += -0.15 * rise + 0.12 * blow;
      B.body.scale.set(1 + breath * 0.06, 1 + breath * 0.08, 1 + breath * 0.04);
      addPose(B.tail0, 0.2 * blow, 0, 0);
      if (!tr.fired && t > 1.02) {
        tr.fired = true;
        this.jelly.kick(1.2);
        this.emit('sound', { name: 'spout' });
      }
      tr.next ??= 1.02;
      if (t > tr.next && t < 1.8) {
        tr.next += 0.08;
        const at = this.bonePoint('root', [0, R + 0.005, 0]);
        this.emit('splash', { at, count: 16, up: 1.3, color: new THREE.Color(0.78, 0.92, 1.0) });
        if (!tr.sp) {
          tr.sp = true;
          this.emit('puff', { at, dir: this.bonePoint('root', [0, R + 0.5, 0]), colors: [[0.8, 1.5, 2.0], [1.7, 1.9, 2.0], [1.3, 1.3, 2.0]], count: 80, speed: 1.2, push: 1.3 });
        }
      }
      if (!tr.s2 && t > 2.0) {
        tr.s2 = true;
        this.emit('sound', { name: 'happy' });
      }
    } else if (tr.name === 'flip') {
      // a somersault: tucks, rolls right over inside the bubble, fluke flicking
      const k = smooth((t - 0.35) / 1.3);
      const tuck = bump(t, 0.2, 1.8);
      B.body.rotation.x += -k * TAU;
      B.body.position.y += Math.sin(k * Math.PI) * 0.02;
      addPose(B.tail0, -0.35 * tuck, 0, 0);
      addPose(B.tail1, -0.3 * tuck, 0, 0);
      addPose(B.finL, 0, 0, -0.5 * tuck);
      addPose(B.finR, 0, 0, 0.5 * tuck);
      if (!tr.s1 && t > 0.3) {
        tr.s1 = true;
        this.emit('sound', { name: 'flip' });
        this.jelly.kick(0.6);
      }
      if (!tr.sp && t > 1.0) {
        tr.sp = true;
        this.emit('sparkle', { at: this.bonePoint('root'), count: 30, colors: [[0.9, 1.5, 2.0], [1.8, 1.8, 2.0]], speed: 0.4, up: 0.3, size: 0.016 });
      }
      if (!tr.s2 && t > 1.8) {
        tr.s2 = true;
        this.emit('sound', { name: 'happy' });
      }
    } else if (tr.name === 'bounce') {
      // the bubble bounces like a ball: three hops, squashing on each landing
      let y = 0;
      let squash = 0;
      for (let i = 0; i < BOUNCES.length; i++) {
        const [a, b, h] = BOUNCES[i];
        if (t > a && t < b) y = Math.sin(((t - a) / (b - a)) * Math.PI) * h;
        squash += bump(t, b - 0.06, b + 0.08) * h * 2.2;
      }
      squash += bump(t, 0.05, 0.28) * 0.12;
      B.root.position.y += y - squash * 0.15;
      this.squash = squash;
      // Wave jostles inside, a moment behind the bubble
      B.body.position.y += -y * 0.25 + squash * 0.02;
      B.body.rotation.z += Math.sin(t * 9) * 0.1 * bump(t, 0.2, 2.1);
      if (!tr.s1 && t > 0.2) {
        tr.s1 = true;
        this.emit('sound', { name: 'bounce' });
      }
      tr.landings ??= 0;
      if (tr.landings < BOUNCES.length && t > BOUNCES[tr.landings][1]) {
        tr.landings++;
        this.jelly.kick(1.4);
        this.emit('land', { at: this.bonePoint('root', [0, -R, 0]) });
      }
      if (!tr.s2 && t > 1.9) {
        tr.s2 = true;
        this.emit('sound', { name: 'happy' });
      }
    }
  }

  trickLength(name) {
    return { spout: 2.8, flip: 2.3, bounce: 2.4 }[name] || 2;
  }
}

// ------------------------------------------------------------ sounds

// a bubble's bloop: a quick rising sine
function bloop(a, t, f = 500, v = 0.05) {
  const ctx = a.ctx;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.07);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  o.connect(g).connect(a.sfx);
  o.start(t);
  o.stop(t + 0.12);
}

// a baby whale's song: a soft, round, wavering "woo"
function woo(a, t, { v = 0.08, f = 1, dur = 0.7 } = {}) {
  glide(a, t, [[0, 330 * f], [dur * 0.35, 520 * f], [dur, 430 * f]], { v, type: 'sine', formant: 700, q: 0.8, vibrato: 12, breath: 0.15, attack: 0.05 });
}

export const calls = {
  happy(a, t) {
    woo(a, t, { v: 0.08, f: 1.2, dur: 0.55 });
    bloop(a, t + 0.5, 520);
    bloop(a, t + 0.62, 700);
  },
  spout(a, t) {
    puff(a, t, { v: 0.1, from: 700, to: 3800, dur: 0.8 });
    for (let i = 0; i < 7; i++) a.bell(rand(1800, 3600), 0.025, t + 0.2 + i * 0.08, 0.5);
    woo(a, t + 0.7, { v: 0.05, f: 1.4, dur: 0.4 });
  },
  flip(a, t) {
    puff(a, t, { v: 0.05, from: 400, to: 1400, dur: 1.0 });
    for (let i = 0; i < 5; i++) bloop(a, t + 0.2 + i * 0.16, 420 + i * 90, 0.045);
  },
  bounce(a, t) {
    for (const [d, f, v] of [[0.8, 1, 0.08], [1.33, 1.2, 0.06], [1.72, 1.4, 0.05]]) {
      glide(a, t + d - 0.2, [[0, 170 * f], [0.12, 340 * f], [0.25, 300 * f]], { v, type: 'sine', formant: 500, q: 0.7, vibrato: 20 });
      bloop(a, t + d - 0.18, 380 * f, 0.04);
    }
  },
};
