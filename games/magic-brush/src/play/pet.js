// Petting and tickling. Dragging a finger over a friend (or holding it there)
// makes the friend stop, lean into the hand with its eyes shut, and hearts
// float up as the hand strokes; a fast scribble tickles it into a giggle.
// A quick press and lift is just a tap (the friend's trick), handed back to
// main.js. Friends never shy away from a finger.
import { REDUCED_MOTION, rand } from '../config.js';

// a hold this long on a friend, without moving, is a cuddle
const HOLD = 0.4;
// how far (px) a finger must travel before a press becomes a stroke
const SLOP = 14;

export class Pet {
  constructor(T) {
    this.T = T;
    this.p = null;
  }

  // a press or a stroke is in progress
  get active() {
    return !!this.p;
  }

  // a finger came down on a friend: a tap or the start of a stroke, not yet known
  down(e, x, y) {
    this.up();
    this.p = this.make(e, x, y);
  }

  // a finger dragged over a friend: it is petting from the first moment
  begin(e, x, y) {
    if (e.state === 'hello') return;
    this.up();
    this.p = this.make(e, x, y);
    this.start();
  }

  make(e, x, y) {
    return { e, x, y, t: 0, path: 0, petting: false, acc: 0, lastHeart: -9, ux: 0, uy: 0, seg: 0, revs: [0, 0, 0, 0], ri: 0, lastTickle: -9, nextNuzzle: 0, framed: -9 };
  }

  start() {
    const p = this.p;
    const { T } = this;
    const e = p.e;
    if (e.state === 'hello' || e.state === 'journey') return;
    p.petting = true;
    T.friends.cancelTask(e);
    if (e.friend.trick && e.friend.trick.name !== 'hello') e.friend.trick = null;
    e.state = 'idle';
    e.faceCamera = false;
    e.toy = 'pet';
    p.nextNuzzle = T.clock;
    T.hearts(e, 2);
  }

  // the finger moved to (x, y)
  move(x, y) {
    const p = this.p;
    if (!p) return;
    const dx = x - p.x;
    const dy = y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    p.x = x;
    p.y = y;
    p.path += d;
    if (!p.petting) {
      if (p.path > SLOP) this.start();
      if (!p.petting) return;
    }
    const { T } = this;
    // stroking sends up hearts, a few a second at most
    p.acc += d;
    if (p.acc > 70 && T.clock - p.lastHeart > 0.35) {
      p.acc = 0;
      p.lastHeart = T.clock;
      T.hearts(p.e, 1);
    }
    // scribbling (the finger turning back on itself, quickly and often) tickles
    if (d > 4) {
      const ux = dx / d;
      const uy = dy / d;
      const dot = p.ux * ux + p.uy * uy;
      p.seg += d;
      if (dot < -0.25 && p.seg > 24) {
        p.revs[p.ri++ & 3] = T.clock;
        p.seg = 0;
        p.ux = ux;
        p.uy = uy;
      } else {
        p.ux = p.ux * 0.7 + ux * 0.3;
        p.uy = p.uy * 0.7 + uy * 0.3;
        const l = Math.hypot(p.ux, p.uy) || 1;
        p.ux /= l;
        p.uy /= l;
      }
      let recent = 0;
      for (let i = 0; i < 4; i++) if (T.clock - p.revs[i] < 0.9) recent++;
      if (recent >= 3 && T.clock - p.lastTickle > 1.6) this.tickle();
    }
  }

  // giggle and wiggle
  tickle() {
    const p = this.p;
    const { T } = this;
    const e = p.e;
    p.lastTickle = T.clock;
    p.revs.fill(0);
    T.friends.emote(e, 'giggle', 1.2);
    if (!REDUCED_MOTION.matches) e.squash = 0.1;
    p.nextNuzzle = T.clock + 1.3;
    T.hearts(e, 3);
    T.snd.tickle();
    const c = T.head(e, T.tmp, 0.3);
    T.fx.sparkles.burst(c, T.amount(14), { colors: [[1.8, 1.4, 0.9], [1.6, 0.8, 1.2]], speed: 0.5, up: 0.4, size: 0.016, life: 0.9 });
  }

  // the finger lifted: a stroke ends, or a quick press was a tap
  up(cancel = false) {
    const p = this.p;
    if (!p) return;
    this.p = null;
    const { T } = this;
    const e = p.e;
    if (p.petting) {
      if (e.toy === 'pet') T.done(e);
      T.friends.lookAt(e, null, 0);
      T.friends.release(e);
    } else if (!cancel && p.t < 0.5 && p.path <= SLOP && T.friends.list.includes(e)) T.onTapFriend(e);
  }

  // the pet button: the friend nearest the middle of the garden nuzzles the child
  hint() {
    const { T } = this;
    const e = T.friends.nearest(T.gcam.center, (o) => T.free(o));
    if (!e) return;
    T.friends.lookAt(e, T.camera.position, 2);
    T.friends.emote(e, 'nuzzle');
    T.hearts(e, 3);
    T.snd.purr();
    T.direct(e, 'close', 2.6);
  }

  update(dt) {
    const p = this.p;
    if (!p) return;
    const { T } = this;
    const e = p.e;
    if (e.leaving || !T.friends.list.includes(e)) {
      this.p = null;
      return;
    }
    p.t += dt;
    // held still on a friend: a cuddle
    if (!p.petting) {
      if (p.t > HOLD && p.path <= SLOP) this.start();
      return;
    }
    const f = e.friend;
    // a petted friend stays put and does not wander off
    e.busy = Math.max(e.busy, 0.35);
    e.timer = Math.max(e.timer, 1);
    if (e.state === 'go') e.state = 'idle';
    const ptr = T.friends.pointer;
    if (e.home === 'ground' && ptr && Math.hypot(ptr.x - e.pos.x, ptr.z - e.pos.z) > 0.25) T.face(e, ptr.x, ptr.z, dt, 3);
    T.friends.lookAt(e, ptr || T.camera.position, 0.5);
    if (!f.emoting && !f.trick && T.clock >= p.nextNuzzle) {
      T.friends.emote(e, 'nuzzle');
      p.nextNuzzle = T.clock + rand(1.2, 1.5);
      T.snd.purr();
      T.hearts(e, 1);
    }
    // the camera comes close, and stays for as long as the petting goes on
    if (T.clock - p.framed > 2.2) {
      p.framed = T.clock;
      T.direct(e, 'close', 3);
    }
  }

  dispose() {
    this.p = null;
  }
}
