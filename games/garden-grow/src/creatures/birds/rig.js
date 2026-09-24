// A bird's body as a light joint hierarchy: root (feet on the ground,
// heading) -> body (hip) -> head (neck), tail, two wings; the bare legs run
// from the feet on the root to the ankles on the body, re-aimed each frame.
// SpeciesAssets builds the shared geometry and materials once per species;
// BirdRig is one bird, posed by writing its `pose` fields then apply().
import * as THREE from 'three';
import { birdFields, sculptMesh, surfacePoint, mandible, eyesPiece, toGeometry, tarsusGeometry, footGeometry } from './sculpt.js';
import { buildWing, buildTail } from './feathers.js';
import { plumageMaterial, featherMaterial, beakMaterial, eyeMaterial, legMaterial } from './materials.js';

const MM = 0.001;
const D2R = Math.PI / 180;
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]).multiplyScalar(MM);

export class SpeciesAssets {
  constructor(sp) {
    this.sp = sp;
    const fields = birdFields(sp);
    this.fields = fields;
    this.hip = v3(sp.hip);
    this.neck = v3(sp.neck);
    this.posture = sp.posture * D2R;

    this.body = sculptMesh({ fields, part: 'body', center: sp.bodyCenter, axis: sp.bodyAxis, up: [0, sp.bodyAxis[2], -sp.bodyAxis[1]], segU: 72, segV: 56, repeat: [7, 4], pivot: sp.hip });
    this.head = sculptMesh({ fields, part: 'head', center: sp.headCenter, axis: sp.headAxis, up: [0, 1, 0], segU: 56, segV: 44, repeat: [5, 3], pivot: sp.neck });

    // eyes on the head surface, slightly sunk in
    const eyes = [];
    const hc = sp.headCenter;
    for (const side of [1, -1]) {
      const d = [sp.eye.dir[0] * side, sp.eye.dir[1], sp.eye.dir[2]];
      const { p, n } = surfacePoint(fields.head, hc, d);
      const r = sp.eye.r * MM;
      const c = p.clone().addScaledVector(n, -r * sp.eye.embed).sub(this.neck);
      eyes.push({ p: c, n: n.clone() });
    }
    this.eyeSpots = eyes;
    this.eyes = toGeometry(eyesPiece(eyes, sp.eye.r * MM, sp.eye.ring, sp.eye.iris));

    // beak: base on the face, pointing along `dir` pitched a little down
    const bd = sp.beak;
    const { p: bp } = surfacePoint(fields.head, hc, bd.dir);
    const dir = new THREE.Vector3(...bd.dir).normalize();
    this.beakBase = bp.clone().addScaledVector(dir, -bd.embed * MM).sub(this.neck);
    this.beakQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.beakQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -bd.pitch * D2R));
    this.beakUpper = toGeometry(mandible({ len: bd.len, w: bd.w, h: bd.h, curve: bd.curve, hook: bd.hook, upper: true, base: bd.base, tip: bd.tip, mouth: bd.mouth }));
    this.beakLower = toGeometry(mandible({ len: bd.len * 0.95, w: bd.w * 0.96, h: bd.h, curve: bd.curve * 0.6, upper: false, base: bd.lowerBase, tip: bd.tip, mouth: bd.mouth }));

    this.wing = buildWing(sp, fields);
    this.tail = buildTail(sp);
    this.shoulder = v3(sp.wing.shoulder);
    this.tailBase = v3(sp.tail.base);
    this.tailRest = sp.tail.pitch * D2R;

    const lg = sp.legs;
    this.tarsus = tarsusGeometry(lg.r[0], lg.r[1], lg.color, lg.scale);
    this.foot = footGeometry({ toe: lg.toe, hallux: lg.hallux, r: lg.r[0] * 0.95, color: lg.color, claw: lg.claw });
    this.footRest = v3(lg.foot);
    this.ankleRest = v3(lg.ankle);

    this.mats = {
      plumage: plumageMaterial(sp),
      feathers: featherMaterial(sp),
      beak: beakMaterial(),
      eye: eyeMaterial(),
      leg: legMaterial(),
    };
    // centre of the body in rest space, for picking and sound
    this.center = v3(sp.bodyCenter);
    this.headTop = v3(sp.headCenter).y + 0.012;
  }
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _f = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();

export class BirdRig {
  constructor(assets, { shadows = true } = {}) {
    this.assets = assets;
    const A = assets;
    const M = A.mats;
    const mesh = (geo, mat, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadows && cast;
      m.receiveShadow = shadows;
      return m;
    };
    this.root = new THREE.Group();
    this.root.name = `bird-${A.sp.id}`;
    this.body = new THREE.Group();
    this.body.position.copy(A.hip);
    this.root.add(this.body);
    this.bodyMesh = mesh(A.body, M.plumage);
    this.body.add(this.bodyMesh);

    this.head = new THREE.Group();
    this.head.position.copy(A.neck).sub(A.hip);
    this.body.add(this.head);
    this.headMesh = mesh(A.head, M.plumage);
    this.head.add(this.headMesh);
    this.eyes = mesh(A.eyes, M.eye, false);
    this.eyes.receiveShadow = false;
    this.head.add(this.eyes);
    this.beak = new THREE.Group();
    this.beak.position.copy(A.beakBase);
    this.beak.quaternion.copy(A.beakQuat);
    this.head.add(this.beak);
    this.beakUpper = mesh(A.beakUpper, M.beak);
    this.beakLower = mesh(A.beakLower, M.beak);
    this.beak.add(this.beakUpper, this.beakLower);

    this.tailPivot = new THREE.Group();
    this.tailPivot.position.copy(A.tailBase).sub(A.hip);
    this.body.add(this.tailPivot);
    this.tail = mesh(A.tail, M.feathers);
    this.tail.morphTargetInfluences = [0];
    this.tailPivot.add(this.tail);

    this.wings = [];
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(A.shoulder.x * side, A.shoulder.y, A.shoulder.z).sub(A.hip);
      pivot.rotation.x = -A.posture;
      pivot.scale.x = side;
      const w = mesh(A.wing, M.feathers);
      w.morphTargetInfluences = [0];
      pivot.add(w);
      this.body.add(pivot);
      this.wings.push(w);
    }

    this.legs = [];
    for (const side of [1, -1]) {
      const tarsus = mesh(A.tarsus, M.leg);
      const foot = mesh(A.foot, M.leg);
      if (side < 0) foot.scale.x = -1;
      this.root.add(tarsus, foot);
      this.legs.push({ side, tarsus, foot, footPos: new THREE.Vector3(A.footRest.x * side, A.footRest.y, A.footRest.z) });
    }

    // the pose, written by the behaviour each frame (radians and metres)
    this.pose = {
      pitch: 0, // body lean forward (+) from the standing pose
      roll: 0,
      yaw: 0,
      lift: 0, // body height offset (crouch < 0)
      fluff: 0,
      headYaw: 0,
      headPitch: 0, // nose down (+)
      headRoll: 0,
      beak: 0, // 0 closed .. 1 open
      tailCock: 0, // up (+) from rest
      tailSpread: 0,
      tailYaw: 0,
      wingSpread: 0,
      wingElev: 0, // up (+)
      wingSweep: 0, // forward (+)
      wingTwist: 0,
      wingDroop: 0, // folded wings let down a little (flicks)
      tuck: 0, // legs tucked for flight
      feetDown: 0, // feet reaching forward to land
    };
  }

  apply() {
    const A = this.assets;
    const p = this.pose;
    // body
    _e.set(p.pitch, p.yaw, p.roll, 'YXZ');
    this.body.quaternion.setFromEuler(_e);
    this.body.position.set(A.hip.x, A.hip.y + p.lift, A.hip.z);
    const s = 1 + p.fluff * 0.07;
    this.body.scale.set(s, s * (1 - p.fluff * 0.01), s);
    // head: aimed in root space, so it stays level while the body tilts
    _e.set(p.headPitch, p.headYaw, p.headRoll, 'YXZ');
    _q.setFromEuler(_e);
    _q2.copy(this.body.quaternion).invert();
    this.head.quaternion.copy(_q2).multiply(_q);
    const hs = 1 / s;
    this.head.scale.set(hs * (1 + p.fluff * 0.04), hs * (1 + p.fluff * 0.04), hs * (1 + p.fluff * 0.04));
    // beak
    this.beakLower.rotation.x = p.beak * 0.42;
    this.beakUpper.rotation.x = -p.beak * 0.1;
    // tail
    this.tailPivot.rotation.set(A.tailRest + p.tailCock, p.tailYaw, 0, 'YXZ');
    this.tail.morphTargetInfluences[0] = p.tailSpread;
    // wings
    for (const w of this.wings) {
      w.morphTargetInfluences[0] = p.wingSpread;
      // flapping moves the wing in the flight frame at the shoulder
      w.rotation.set(p.wingTwist, p.wingSweep, p.wingElev - p.wingDroop, 'XYZ');
    }
    // legs: from the feet to the ankles under the body
    this.body.updateMatrix();
    for (const leg of this.legs) {
      _a.set(A.ankleRest.x * leg.side, A.ankleRest.y, A.ankleRest.z).sub(A.hip).applyMatrix4(this.body.matrix);
      // tucked: the foot folds back under the belly
      _f.copy(leg.footPos);
      if (p.tuck > 0) {
        _v.set(0, -0.004, -0.017).applyQuaternion(this.body.quaternion).add(_a);
        _f.lerp(_v, p.tuck);
      }
      if (p.feetDown > 0) {
        _v.set(0, -0.022, 0.012).applyQuaternion(_q.setFromAxisAngle(_up, p.yaw)).add(_a);
        _f.lerp(_v, p.feetDown);
      }
      _v.subVectors(_a, _f);
      const len = Math.max(0.004, _v.length());
      leg.tarsus.position.copy(_f);
      leg.tarsus.quaternion.setFromUnitVectors(_up, _v.multiplyScalar(1 / len));
      leg.tarsus.scale.set(1, len, 1);
      leg.foot.position.copy(_f);
      const toeOut = leg.side * 0.12;
      if (p.tuck > 0.01) {
        // toes curl back along the tarsus
        _e.set(-p.tuck * 1.9 + p.pitch * p.tuck, p.yaw + toeOut, 0, 'YXZ');
      } else _e.set(-p.feetDown * 0.5, toeOut, 0, 'YXZ');
      leg.foot.quaternion.setFromEuler(_e);
    }
  }

  // world position of the body centre (for picking and sound)
  centre(out) {
    return out.copy(this.assets.center).sub(this.assets.hip).applyMatrix4(this.body.matrixWorld);
  }
}


