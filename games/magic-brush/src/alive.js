// The magic moment: a painting comes alive, as one continuous shot.
//
// 1. Glow (0.9 s): the finished painting shimmers and the camera eases in.
//    The friend is swapped in for the painting, pressed flat onto the canvas so
//    it looks exactly like the paint, and the paint on the canvas underneath
//    lifts away with it. Flecks of colour begin to rise off the strokes.
// 2. Emerge (2.5 s): starting at its head, the friend turns from paint into
//    fur, scales or feathers along a glowing, sparkling seam that sweeps to
//    its tail, while the living part pushes out of the canvas and turns to look
//    at us. Vertices part way along the seam are stretched between the canvas
//    and the body, so the paint visibly pulls off the canvas in streaks; flecks
//    of the painted colours stream from the strokes still on the canvas into
//    the seam, and wet droplets fly off it and splat on the rug. The camera
//    drifts round the canvas so the body's volume shows.
// 3. Crouch (0.4 s): free of the canvas, it gathers itself, squashed low.
// 4. Leap (0.95 s): it springs out over the rug in a high arc, stretched
//    along its flight, trailing sparkles and paint, while the camera pulls back
//    and tracks it.
// 5. Landing: it lands with a squash, a thump of the camera, a splash of the
//    paint colours, and says hello.
import * as THREE from 'three';
import { clamp, smoothstep, easeInOut, rand, REDUCED_MOTION } from './config.js';
import { CANVAS_W, CANVAS_H } from './creatures/friend.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _n = new THREE.Vector3();
const _u = new THREE.Vector3();
const _c = new THREE.Vector3();
const _look = new THREE.Vector3();
const _shot = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };

export class ComeAlive {
  constructor({ easel, fx, audio, groundAt, rig }) {
    this.easel = easel;
    this.fx = fx;
    this.audio = audio;
    this.groundAt = groundAt;
    this.rig = rig;
    this.active = null;
    this.onLand = null;
  }

  // friend: built, skinned and projected; land: {x, z, yaw, scale} where it lands
  start(friend, land, colors, onDone) {
    const reduced = REDUCED_MOTION.matches;
    const plane = this.easel.plane.clone();
    const startM = plane.clone().multiply(friend.canvasPose());
    startM.decompose(_p, _q, _s);
    const from = { pos: _p.clone(), quat: _q.clone(), scale: _s.x };
    const to = {
      pos: new THREE.Vector3(land.x, this.groundAt(land.x, land.z), land.z),
      quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), land.yaw),
      scale: land.scale ?? 1,
    };
    const u = friend.shared;
    u.uAliveOn.value = 1;
    u.uFront.value = 1.2;
    u.uFrontW.value = 0.09;
    friend.object.position.copy(from.pos);
    friend.object.quaternion.copy(from.quat);
    friend.object.scale.setScalar(from.scale);
    friend.motion.air = 0;
    const n = _n.set(plane.elements[8], plane.elements[9], plane.elements[10]).normalize().clone();
    this.active = {
      friend,
      from,
      to,
      n,
      t: 0,
      colors: colors.length ? colors : [new THREE.Color(1, 0.8, 0.5)],
      onDone,
      glow: reduced ? 0.3 : 0.9,
      emerge: reduced ? 1.0 : 2.5,
      crouch: reduced ? 0.1 : 0.4,
      leap: reduced ? 0.7 : 0.95,
      settle: reduced ? 0.5 : 0.9,
      landed: false,
      dropAcc: 0,
      peelAcc: 0,
      gatherAcc: 0,
      trailAcc: 0,
      reduced,
      camPhase: 0,
      launch: null,
    };
    this.easel.uniforms.uLift.value = 0;
    this.audio.magic?.('gather');
    // the camera eases in on the canvas
    this.rig.go(this.gatherShot(), reduced ? 0.3 : 1.1, 0.02);
  }

  get busy() {
    return !!this.active;
  }

  // the moment's progress 0..1
  get progress() {
    const a = this.active;
    if (!a) return 1;
    return clamp(a.t / (a.glow + a.emerge + a.crouch + a.leap + a.settle), 0, 1);
  }

  // ------------------------------------------------------------ camera

  frameOf(plane) {
    const e = plane.elements;
    return {
      c: new THREE.Vector3(e[12], e[13], e[14]),
      right: new THREE.Vector3(e[0], e[1], e[2]).normalize(),
      up: new THREE.Vector3(e[4], e[5], e[6]).normalize(),
      n: new THREE.Vector3(e[8], e[9], e[10]).normalize(),
    };
  }

  // a little closer than the painting shot, square on
  gatherShot() {
    const F = this.frameOf(this.easel.plane);
    const tall = this.rig.camera.aspect < 0.8;
    const d = tall ? 1.55 : 0.98;
    return {
      pos: F.c.clone().addScaledVector(F.n, d).addScaledVector(F.right, 0.03).addScaledVector(F.up, tall ? -0.16 : -0.02),
      look: F.c.clone().addScaledVector(F.up, tall ? -0.1 : -0.02),
      fov: tall ? 48 : 38,
    };
  }

  // drifting round to the side and a little lower, looking at where the body pushes out
  emergeShot() {
    const F = this.frameOf(this.easel.plane);
    const tall = this.rig.camera.aspect < 0.8;
    const d = tall ? 1.7 : 1.12;
    const yaw = 0.42; // radians round the canvas, to the viewer's right
    const dir = F.n.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(F.right, Math.sin(yaw));
    return {
      pos: F.c.clone().addScaledVector(dir, d).addScaledVector(F.up, tall ? -0.14 : -0.06),
      look: F.c.clone().addScaledVector(F.n, 0.14).addScaledVector(F.up, -0.02),
      fov: tall ? 50 : 38,
    };
  }

  // the tracking shot of the leap: a camera that pulls back and follows the friend
  followLeap(a) {
    const tall = this.rig.camera.aspect < 0.8;
    const to = a.to.pos;
    const size = Math.max(0.3, a.friend.restRadius * a.to.scale);
    const home = new THREE.Vector3(to.x * 0.4 + 0.5, tall ? 1.05 : 0.9, to.z + (tall ? 2.0 : 1.55) + Math.max(0, size - 0.4) * 2.2);
    this.rig.follow(
      () => {
        const c = a.friend.worldCenter(_c);
        _look.copy(c);
        _look.y = c.y * 0.85 + 0.1;
        _shot.pos.copy(home);
        _shot.look.copy(_look);
        _shot.fov = tall ? 52 : 40;
        return _shot;
      },
      { smooth: 0.75, lookSmooth: 0.16 },
    );
  }

  // ------------------------------------------------------------ the frame

  update(dt) {
    const a = this.active;
    if (!a) return;
    a.t += dt;
    const f = a.friend;
    const u = f.shared;
    const t = a.t;
    const tE = t - a.glow; // emerging time
    const tC = tE - a.emerge; // crouching time
    const tL = tC - a.crouch; // leaping time
    const easelU = this.easel.uniforms;
    // the paint under the friend lifts away as soon as it takes over
    easelU.uLift.value = smoothstep(0.0, 0.15, t);
    easelU.uGlow.value = Math.max(0, 1 - t / a.glow) * 0.8;

    // the seam sweeps from head to tail
    const e = clamp(tE / a.emerge, 0, 1);
    u.uFront.value = 1.2 - easeInOut(e) * 1.45;
    if (tE > 0 && !a.whoosh) {
      a.whoosh = true;
      this.audio.magic?.('emerge');
      if (!a.reduced) this.rig.go(this.emergeShot(), a.emerge * 0.95, 0.02);
    }
    if (tC >= 0 && !a.wind) {
      a.wind = true;
      this.audio.magic?.('wind');
    }
    if (tL >= 0 && !a.leapCam) {
      a.leapCam = true;
      this.followLeap(a);
      this.audio.magic?.('leap');
    }

    const n = a.n;
    const s = clamp(tL / a.leap, 0, 1);
    // where the friend is: pushed out from the canvas while it emerges and crouches, then leaping
    const push = smoothstep(0, 1, e) * 0.3;
    _p.copy(a.from.pos).addScaledVector(n, push);
    if (!a.launch && tL >= 0) a.launch = _p.clone();
    if (tL >= 0) {
      // horizontal at an even pace, height a smooth fall from the canvas plus a high arc
      _p.copy(a.launch);
      _p.x += (a.to.pos.x - a.launch.x) * s;
      _p.z += (a.to.pos.z - a.launch.z) * s;
      _p.y = a.launch.y + (a.to.pos.y - a.launch.y) * s + 4 * 0.42 * s * (1 - s);
    } else {
      // a slow breath in the air as it gathers itself
      _p.y += Math.sin(t * 5) * 0.004 * e;
    }
    f.object.position.copy(_p);
    // it turns from lying along the canvas to facing us
    const turn = smoothstep(0.15, 1, e) * 0.5 + (tL > 0 ? smoothstep(0, 0.7, s) * 0.5 : 0);
    _q.copy(a.from.quat).slerp(a.to.quat, turn);
    f.object.quaternion.copy(_q);
    // its size settles gradually, never jumping
    const grow = clamp(0.6 * smoothstep(0, 1, e) + 0.4 * smoothstep(0, 1, s), 0, 1);
    const sc = a.from.scale + (a.to.scale - a.from.scale) * grow;
    // squash and stretch: low before the spring, long in flight
    let sy = 1;
    let sxz = 1;
    if (tC > 0 && tL < 0) {
      const ck = smoothstep(0, 1, tC / a.crouch);
      sy = 1 - 0.17 * ck;
      sxz = 1 + 0.09 * ck;
    } else if (tL >= 0 && !a.landed) {
      const st = Math.sin(clamp(s * 1.6, 0, 1) * Math.PI); // the take-off stretch
      sy = 1 + 0.13 * st;
      sxz = 1 - 0.06 * st;
    }
    f.object.scale.set(sc * sxz, sc * sy, sc * sxz);
    // the flat, not-yet-alive part stays exactly on the canvas
    f.object.updateMatrixWorld(true);
    _m.copy(f.object.matrixWorld).invert();
    const plane = this.easel.plane;
    u.uCanvasLocal.value.copy(_m).multiply(plane).multiply(f.restToPlane);
    u.uCanvasN.value.copy(n).transformDirection(_m);
    // pose: reaching out of the canvas, gathered for the spring, stretched in flight, tucked to land
    f.motion.air = tL >= 0 ? (s < 1 ? 1 - smoothstep(0.78, 1, s) : 0) : tC > 0 ? 0.35 : smoothstep(0.2, 0.8, e);
    f.motion.speed = 0;

    // wet droplets and sparkles fly off the seam, colour gathers into it
    if (e > 0 && e < 1) {
      a.dropAcc += dt * (a.reduced ? 12 : 100);
      while (a.dropAcc > 1) {
        a.dropAcc -= 1;
        this.seamParticle(a);
      }
      a.gatherAcc += dt * (a.reduced ? 10 : 140);
      while (a.gatherAcc > 1) {
        a.gatherAcc -= 1;
        this.gatherParticle(a);
      }
    }
    // and the paint still on the canvas starts to lift: glitter and flecks of
    // paint peel off the strokes, most of all near the seam
    if (e < 0.97) {
      a.peelAcc += dt * (a.reduced ? 10 : 130) * (t < a.glow ? t / a.glow : 1);
      while (a.peelAcc > 1) {
        a.peelAcc -= 1;
        this.peelParticle(a);
      }
    }
    // in flight: a trail of paint-coloured sparkles and the odd drop
    if (tL >= 0 && s < 1 && !a.landed) {
      a.trailAcc += dt * (a.reduced ? 20 : 150);
      while (a.trailAcc > 1) {
        a.trailAcc -= 1;
        this.trailParticle(a);
      }
    }
    if (tL >= a.leap && !a.landed) {
      a.landed = true;
      f.object.position.copy(a.to.pos);
      u.uAliveOn.value = 0;
      f.happy.kick(4);
      this.land(a);
      this.onLand?.(f);
    }
    if (a.landed) {
      // a landing squash that springs back with a bounce
      const ls = tL - a.leap;
      const k = Math.min(1, ls / 0.55);
      const sq = Math.sin(k * Math.PI * 1.5) * Math.exp(-ls * 4) * 0.2;
      f.object.scale.set(a.to.scale * (1 + sq * 0.5), a.to.scale * (1 - sq), a.to.scale * (1 + sq * 0.5));
      f.object.quaternion.copy(a.to.quat);
      if (ls > a.settle) {
        f.object.scale.setScalar(a.to.scale);
        const done = a.onDone;
        this.active = null;
        easelU.uLift.value = 0;
        easelU.uGlow.value = 0;
        done?.(f);
      }
    }
  }

  // touch-down: paint and stars splash out round its feet, the camera thumps
  land(a) {
    const p = a.to.pos;
    this.fx.sparkles.burst(_p.copy(p).setY(p.y + 0.05), a.reduced ? 14 : 60, { colors: [[1.8, 1.4, 0.7], [1.2, 1.2, 1.8]], speed: 1.3, size: 0.022, up: 0.9 });
    const n = a.reduced ? 6 : 26;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
      const sp = rand(0.5, 1.5);
      const c = a.colors[i % a.colors.length];
      this.fx.droplets.throw(_v.set(p.x + Math.sin(ang) * 0.05, p.y + 0.04, p.z + Math.cos(ang) * 0.05), _w.set(Math.sin(ang) * sp, rand(0.9, 2.2), Math.cos(ang) * sp), c, rand(0.005, 0.014));
    }
    this.audio.land?.();
    this.rig.kick(0.018);
  }

  // a sparkle or paint drop shed along the flight
  trailParticle(a) {
    const f = a.friend;
    f.worldCenter(_v);
    const c = a.colors[Math.floor(Math.random() * a.colors.length)];
    const r = 0.12 * a.to.scale;
    _v.x += rand(-r, r);
    _v.y += rand(-r, r) * 0.8;
    _v.z += rand(-r, r);
    const gold = Math.random() < 0.4;
    const sc = gold ? [2.2, 1.8, 1.0] : [c.r * 2.2 + 0.3, c.g * 2.2 + 0.3, c.b * 2.2 + 0.3];
    this.fx.sparkles.emit(_v.x, _v.y, _v.z, rand(-0.15, 0.15), rand(-0.05, 0.25), rand(-0.15, 0.15), sc, rand(0.012, 0.03), rand(0.5, 1.1), { drag: 2.5, gravity: -0.15 });
    if (Math.random() < 0.18) this.fx.droplets.throw(_v, _w.set(rand(-0.4, 0.4), rand(0.1, 0.8), rand(-0.3, 0.3)), c, rand(0.004, 0.01));
  }

  // colour streaming from the strokes still on the canvas into the seam
  gatherParticle(a) {
    const f = a.friend;
    const front = f.shared.uFront.value;
    const plane = this.easel.plane;
    // a point on the still-flat part of the painting, behind the seam
    const uu = front - rand(0.02, 0.5);
    if (uu < -0.05) return;
    const vv = rand(0.2, 0.8);
    _v.set((uu - 0.5) * CANVAS_W, (vv - 0.5) * CANVAS_H, 0.012).applyMatrix4(plane);
    _w.set((front - 0.5) * CANVAS_W, (rand(0.35, 0.65) - 0.5) * CANVAS_H, 0.05).applyMatrix4(plane);
    const c = a.colors[Math.floor(Math.random() * a.colors.length)];
    const sc = [c.r * 2.4 + 0.3, c.g * 2.4 + 0.3, c.b * 2.4 + 0.3];
    _u.copy(a.n).multiplyScalar(rand(0.05, 0.25));
    this.fx.sparkles.emit(_v.x, _v.y, _v.z, _u.x, _u.y + rand(0.05, 0.3), _u.z, sc, rand(0.01, 0.022), rand(0.7, 1.3), { drag: 1.8, gravity: 0, target: _w, pull: 2.6 });
  }

  // a fleck of glitter or paint lifting off the part of the painting that is
  // still paint (lying flat on the canvas)
  peelParticle(a) {
    const f = a.friend;
    const pos = f.body.geometry.attributes.position;
    const front = f.shared.uFront.value;
    let uv = null;
    for (let tries = 0; tries < 12; tries++) {
      _v.fromBufferAttribute(pos, Math.floor(Math.random() * pos.count));
      const w = f.paintUv(_v);
      // favour the paint close behind the seam
      if (w[0] < front - 0.01 && Math.random() < Math.exp(-(front - w[0]) * 4)) {
        uv = w;
        break;
      }
    }
    if (!uv) return;
    const plane = this.easel.plane;
    _v.set((uv[0] - 0.5) * CANVAS_W + rand(-0.006, 0.006), (uv[1] - 0.5) * CANVAS_H + rand(-0.006, 0.006), 0.012).applyMatrix4(plane);
    const n = plane.elements;
    _n.set(n[8], n[9], n[10]).normalize();
    const c = a.colors[Math.floor(Math.random() * a.colors.length)];
    const out = rand(0.08, 0.35);
    if (Math.random() < 0.5) {
      // a wet fleck that pops off and falls
      _w.copy(_n).multiplyScalar(out * 2.6).add(_u.set(rand(-0.3, 0.3), rand(0.15, 0.9), rand(-0.3, 0.3)));
      this.fx.droplets.throw(_v, _w, c, rand(0.003, 0.008));
    } else {
      // glitter: the paint's colour, or gold
      const g = Math.random() < 0.45;
      const sc = g ? [2.2, 1.8, 1.0] : [c.r * 2.2 + 0.3, c.g * 2.2 + 0.3, c.b * 2.2 + 0.3];
      this.fx.sparkles.emit(_v.x, _v.y, _v.z, _n.x * out + rand(-0.08, 0.08), _n.y * out + rand(0.05, 0.3), _n.z * out + rand(-0.08, 0.08), sc, rand(0.01, 0.024), rand(0.8, 1.8), { drag: 2.2, gravity: 0.05 });
    }
  }

  // a droplet or sparkle from somewhere along the seam
  seamParticle(a) {
    const f = a.friend;
    const g = f.body.geometry;
    const pos = g.attributes.position;
    // find a vertex near the seam
    const front = f.shared.uFront.value;
    let tries = 0;
    let idx = -1;
    while (tries++ < 24) {
      const i = Math.floor(Math.random() * pos.count);
      _v.fromBufferAttribute(pos, i);
      const uv = f.paintUv(_v);
      if (Math.abs(uv[0] - front) < 0.06) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    // its place in the world (skinned)
    f.body.getVertexPosition(idx, _v);
    _v.applyMatrix4(f.body.matrixWorld);
    const c = a.colors[Math.floor(Math.random() * a.colors.length)];
    const out = _n.copy(a.n);
    if (Math.random() < 0.6) {
      const vel = _w.copy(out).multiplyScalar(rand(0.4, 1.4)).add(_u.set(rand(-0.6, 0.6), rand(0.2, 1.5), rand(-0.3, 0.3)));
      this.fx.droplets.throw(_v, vel, c, rand(0.005, 0.016));
    }
    const sc = [c.r * 2 + 0.4, c.g * 2 + 0.4, c.b * 2 + 0.4];
    this.fx.sparkles.emit(_v.x, _v.y, _v.z, rand(-0.3, 0.3) + out.x * 0.3, rand(0, 0.5), rand(-0.3, 0.3) + out.z * 0.3, Math.random() < 0.5 ? sc : [2, 1.7, 1], rand(0.012, 0.03), rand(0.6, 1.4));
  }
}
