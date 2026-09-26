// The friendly animals of Splash Ride: a pod of dolphins that races the boat
// now and then, mallard families paddling near the shore, green turtles
// cruising under the surface, schools of little fish, and birds overhead.
// Each place picks its own (see `kinds`). Nothing ever threatens or touches
// the boat: every animal keeps a calm distance and slips out of its way.
//
// Usage:
//   const animals = new Animals({ scene, quality, world, kinds, events });
//   animals.update(dt, time, boat); // every frame
//
// world:  { heightAt(x, z), depthAt(x, z), landDistance(x, z), bounds }
// kinds:  { dolphins: bool, turtles: n, fish: 'tropical'|'lake'|'glow'|null,
//           birds: 'gull'|'swallow'|'pigeon'|null, ducks: n families }
// events: { splash(pos, strength01), sound(kind, pos), ripple(x, z, strength01),
//           blow?(pos) } - blow (a dolphin's breath) is optional and falls back
//           to a tiny splash. Ripples are rationed to about 1.2 rings a
//           second in all, so they never crowd out the boat's own.
// boat:   { pos: Vector3, heading, speed, vel: Vector3 }
//
// Every kind is one InstancedMesh (one draw call, plus one shadow pass where
// shadows are on), bent and painted in its own shaders.
import * as THREE from 'three';
import { safeEvents } from './shared.js';
import { Dolphins } from './dolphins.js';
import { Ducks } from './ducks.js';
import { Turtles } from './turtles.js';
import { Fish } from './fish.js';
import { Birds } from './birds.js';

export class Animals {
  constructor({ scene, quality, world, kinds = {}, events }) {
    this.root = new THREE.Group();
    this.root.name = 'animals';
    scene.add(this.root);
    this.events = safeEvents(events);
    const ctx = { root: this.root, quality, world, events: this.events };
    this.dolphins = kinds.dolphins ? new Dolphins(ctx) : null;
    this.turtles = kinds.turtles > 0 ? new Turtles(ctx, kinds.turtles) : null;
    this.fish = kinds.fish ? new Fish(ctx, kinds.fish) : null;
    this.ducks = kinds.ducks > 0 ? new Ducks(ctx, kinds.ducks) : null;
    this.birds = kinds.birds ? new Birds(ctx, kinds.birds) : null;
    this.parts = [this.dolphins, this.turtles, this.fish, this.ducks, this.birds].filter(Boolean);
  }

  update(dt, time, boat) {
    if (!this.root.visible) return;
    const step = Math.min(Math.max(dt, 0), 0.1);
    this.events.tick(step);
    for (const p of this.parts) p.update(step, time, boat);
  }

  setVisible(on) {
    this.root.visible = !!on;
  }

  dispose() {
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    this.root.removeFromParent();
  }
}
