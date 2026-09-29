// Progress kept on this device only: stars collected, the best stars for
// each target-practice level, and which tanks and balls are unlocked (by the
// stars collected so far).
import { load, save, BALLS } from './config.js';

export class Store {
  constructor() {
    this.stars = load('stars', 0);
    this.levels = load('levels', {});
    this.seen = load('seen', []);
  }

  add(n) {
    if (n <= 0) return;
    this.stars += n;
    save('stars', this.stars);
  }

  // best stars for a target level; returns how many new stars that adds
  level(id, stars) {
    const old = this.levels[id] ?? 0;
    if (stars <= old) return 0;
    this.levels[id] = stars;
    save('levels', this.levels);
    this.add(stars - old);
    return stars - old;
  }

  levelStars(id) {
    return this.levels[id] ?? 0;
  }

  tankOpen(spec) {
    return this.stars >= (spec.stars ?? 0);
  }

  ballOpen(kind) {
    return this.stars >= (BALLS[kind]?.stars ?? 0);
  }

  // things that have just become available (for a "new!" shimmer), once each
  fresh(ids) {
    const out = ids.filter((id) => !this.seen.includes(id));
    if (out.length) {
      this.seen.push(...out);
      save('seen', this.seen);
    }
    return out;
  }
}
