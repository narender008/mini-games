// Big Kid combo streaks: hits that come within a short window of each other
// build a streak; the streak lifts a score multiplier step by step, quick
// follow-ups and multi-hits earn bonuses, and milestones get a named
// callout, a fanfare and fireworks.
export const COMBO_WINDOW = 1.7; // seconds allowed between hits

// streak length at which each multiplier step (×1, ×2, ...) begins
const MULT_STEPS = [1, 3, 6, 10, 15, 21, 28, 36];
const MILESTONES = [
  [10, 'Awesome!'],
  [20, 'Amazing!'],
  [30, 'Super star!'],
  [50, 'Unstoppable!'],
  [75, 'Legendary!'],
  [100, 'Rocket master!'],
];
const MULTI_NAMES = ['', '', 'Double!', 'Triple!', 'Quad!', 'Mega multi!'];

export function multiplierFor(n) {
  let m = 0;
  for (const s of MULT_STEPS) if (n >= s) m++;
  return Math.max(1, m);
}

export class Combo {
  constructor() {
    this.reset();
  }

  reset() {
    this.count = 0;
    this.best = 0;
    this.last = -Infinity;
    this.shots = new Map(); // shot id -> hits
  }

  remaining(now) {
    if (this.count === 0) return 0;
    return Math.max(0, 1 - (now - this.last) / COMBO_WINDOW);
  }

  live(now) {
    return this.remaining(now) > 0 ? this.count : 0;
  }

  // Returns the streak that just ended (0 if none) when the window lapses.
  lapse(now) {
    if (this.count > 0 && now - this.last >= COMBO_WINDOW) {
      const n = this.count;
      this.count = 0;
      return n;
    }
    return 0;
  }

  get multiplier() {
    return multiplierFor(this.count);
  }

  // Register a hit at real time `now` from shot `shot` (0 for none).
  hit(now, shot = 0) {
    const gap = now - this.last;
    this.count = gap < COMBO_WINDOW ? this.count + 1 : 1;
    this.last = now;
    this.best = Math.max(this.best, this.count);
    const n = this.count;
    const out = { count: n, mult: multiplierFor(n), multUp: n > 1 && multiplierFor(n) > multiplierFor(n - 1), bonus: 0, tag: '', milestone: '', level: 0, multi: 0 };
    const ms = MILESTONES.findIndex(([at]) => at === n);
    if (ms >= 0) {
      out.milestone = MILESTONES[ms][1];
      out.level = ms + 1;
      out.bonus += n * 10;
    } else if (n > 100 && n % 25 === 0) {
      out.milestone = `${n} combo!`;
      out.level = MILESTONES.length;
      out.bonus += n * 10;
    }
    if (n > 1 && gap < 0.22) {
      out.tag = 'Quick!';
      out.bonus += 5;
    }
    if (shot) {
      const k = (this.shots.get(shot) || 0) + 1;
      this.shots.set(shot, k);
      if (this.shots.size > 64) this.shots.delete(this.shots.keys().next().value);
      if (k > 1) {
        out.multi = k;
        out.tag = MULTI_NAMES[Math.min(k, MULTI_NAMES.length - 1)];
        out.bonus += 25 * (k - 1);
      }
    }
    return out;
  }
}
