// Life in the garden: everything that makes the place feel lived in rather
// than painted. Songbirds that fly in, perch, hop, sing and startle
// (birds.js); butterflies among the flowers and dragonflies over the pond
// (insects.js); lily pads that bob, a frog that hops between them and koi
// that swim under the water and now and then leap (pond.js); the grass and
// flowers that lean away from friends and fingers and ripple with gusts of
// wind (the WIND block in foliage.js, driven from here); soft cloud shadows
// drifting over the lawn; fireflies and petals stirred up as friends run
// through the flowers; lanterns and fairy lights that flicker warmly; and
// the sound of all of it (sound/ambient.js), made when the audio is ready.
//
//   life = new GardenLife({ scene, quality, groundAt, walkable, world, audio })
//   life.update(dt, t, { camera, friends: [{ pos, radius, speed }], pointer, state })
//   life.setViewport(pixelHeight)   // for the glints (point sprites)
//   life.dispose()
import * as THREE from 'three';
import { rand, clamp, smoothstep, REDUCED_MOTION } from '../config.js';
import { WIND, MAX_PUSH } from './foliage.js';
import { POND } from './world.js';
import { Birds } from './birds.js';
import { Insects } from './insects.js';
import { PondLife } from './pond.js';
import { Glints } from './glints.js';
import { Ambient } from '../sound/ambient.js';

const _c = new THREE.Color();

export class GardenLife {
  constructor({ scene, quality, groundAt, walkable, world, audio }) {
    this.scene = scene;
    this.q = quality;
    this.groundAt = groundAt;
    this.walkable = walkable;
    this.world = world;
    this.audio = audio;
    this.sound = null;
    this.time = 0;
    this.calm = REDUCED_MOTION.matches;
    // gusts of wind: a crest that sweeps across the lawn now and then
    this.gust = { age: 99, next: rand(3, 6), k: 0 };
    const sound = () => this.sound;
    this.birds = new Birds({ scene, quality, world, sound });
    this.pond = new PondLife({ scene, quality, sound });
    this.insects = new Insects({ scene, quality, world, pond: this.pond, sound });
    this.glints = new Glints({ scene, quality, world, groundAt });
    // lantern lights flicker: remember how bright each one is
    this.lamps = (world.lights || []).map((l) => ({ light: l, base: l.intensity, ph: Math.random() * 6.28 }));
    // the little bulbs twinkle one by one
    this.strings = [world.fairy?.mesh, world.stringBulbs].filter(Boolean);
    for (const m of this.strings) {
      for (let i = 0; i < m.count; i++) m.setColorAt(i, _c.setRGB(1, 1, 1));
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.twinkle = 0;
    this._inp = { camera: null, friends: null, pointer: null, state: 'menu' }; // reused every frame
  }

  setViewport(px) {
    this.glints.setViewport(px);
  }

  // ------------------------------------------------------------ every frame

  update(dt, t, { camera, friends, pointer, state }) {
    this.time = t;
    this.audioStep(dt, camera, state);
    this.windStep(dt, t, friends, pointer);
    const inp = this._inp;
    inp.camera = camera;
    inp.friends = friends;
    inp.pointer = pointer;
    inp.state = state;
    this.birds.update(dt, t, inp);
    this.insects.update(dt, t, inp);
    this.pond.update(dt, t);
    this.glints.update(dt, t, inp);
    this.lightStep(dt, t);
  }

  // the sound is built the first time the audio is unlocked
  audioStep(dt, camera, state) {
    const a = this.audio;
    if (!this.sound && a?.ready) {
      this.sound = new Ambient(a);
      a.synced = true; // the garden's own birds replace the random ones
    }
    const s = this.sound;
    if (!s) return;
    s.setState(state);
    s.listen(camera, POND);
    s.setWind(this.gust.k);
    s.update(dt);
  }

  // ------------------------------------------------------------ wind and plants

  windStep(dt, t, friends, pointer) {
    const g = this.gust;
    g.age += dt;
    g.next -= dt;
    if (g.next <= 0) {
      g.age = 0;
      g.next = rand(8, 15);
      const a = rand(-0.5, 0.9);
      WIND.uGustDir.value.set(Math.cos(a), Math.sin(a) * 0.9 - 0.3).normalize();
    }
    // rises over a second or so, holds, then dies away
    g.k = smoothstep(0, 1.3, g.age) * (1 - smoothstep(1.8, 5, g.age)) * (this.calm ? 0.5 : 1);
    WIND.uGust.value = g.k;
    WIND.uWindStrength.value = 1 + 0.15 * Math.sin(t * 0.31) + 0.1 * Math.sin(t * 0.77 + 1);
    // whatever pushes the grass aside: friends first, then the finger
    const P = WIND.uPush.value;
    let n = 0;
    for (const f of friends) {
      if (n >= MAX_PUSH - 1) break;
      if (f.pos.y > 0.35) continue;
      P[n++].set(f.pos.x, f.pos.z, (f.radius || 0.15) * 0.9 + 0.12, 0.6 + clamp((f.speed || 0) * 0.7, 0, 0.4));
    }
    if (pointer && n < MAX_PUSH) P[n++].set(pointer.x, pointer.z, 0.26, 0.7);
    for (let i = n; i < MAX_PUSH; i++) P[i].z = 0;
  }

  // ------------------------------------------------------------ light

  lightStep(dt, t) {
    for (const l of this.lamps) {
      const f = 1 + Math.sin(t * 9.1 + l.ph) * 0.03 + Math.sin(t * 5.3 + l.ph * 2) * 0.045 + Math.sin(t * 2.1 + l.ph) * 0.03;
      l.light.intensity = l.base * f;
    }
    // bulbs twinkle, a few at a time (every other frame is plenty)
    if ((this.twinkle++ & 1) === 0) return;
    for (const m of this.strings) {
      const n = m.count;
      for (let i = 0; i < n; i++) {
        const k = 0.8 + 0.2 * Math.sin(t * (1.1 + (i % 5) * 0.23) + i * 1.7) + 0.06 * Math.sin(t * 7 + i * 3.1);
        m.instanceColor.setXYZ(i, k, k * 0.97, k * 0.92);
      }
      m.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    this.birds.dispose();
    this.insects.dispose();
    this.pond.dispose();
    this.glints.dispose();
    this.sound?.dispose();
    const P = WIND.uPush.value;
    for (const p of P) p.set(0, 0, 0, 0);
    WIND.uGust.value = 0;
  }
}
