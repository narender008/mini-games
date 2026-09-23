// Rewards for popping fast: a streak of pops that each come within a short
// window of the last, an escalating score multiplier, bonuses for very quick
// follow-ups and for catching several balloons with one pellet or stone,
// and a named callout at each milestone.
export const STREAK_WINDOW = 1.8; // seconds allowed between pops in a streak

// the streak length at which each multiplier step (×1, ×2, ...) begins
const MULT_STEPS = [1, 2, 4, 7, 11, 16];
const CHAIN_NAMES = ['', '', 'Double!', 'Triple!', 'Quadruple!'];
const MILESTONE_NAMES = ['Fantastic!', 'Amazing!', 'Incredible!', 'Unstoppable!', 'Legendary!'];
const SHOT_NAMES = ['', '', 'Double shot!', 'Triple shot!', 'Quad shot!'];

export function multiplierFor(streak) {
  let m = 0;
  for (const s of MULT_STEPS) if (streak >= s) m++;
  return Math.max(1, m);
}

export class Streak {
  constructor() {
    this.reset();
  }

  reset() {
    this.count = 0;
    this.best = 0;
    this.last = -Infinity;
    this.shots = new Map(); // shot id -> balloons it has popped
  }

  // 0..1: how much of the window is left before the streak lapses.
  remaining(now) {
    if (this.count === 0) return 0;
    return Math.max(0, 1 - (now - this.last) / STREAK_WINDOW);
  }

  live(now) {
    return this.remaining(now) > 0 ? this.count : 0;
  }

  get multiplier() {
    return multiplierFor(this.count);
  }

  // Register a pop at real time `now`, from shot `shot` (the pin and dart
  // pass none). Returns what to show and award.
  pop(now, shot = 0) {
    const gap = now - this.last;
    this.count = gap < STREAK_WINDOW ? this.count + 1 : 1;
    this.last = now;
    this.best = Math.max(this.best, this.count);
    const n = this.count;
    const out = {
      streak: n,
      mult: multiplierFor(n),
      multUp: n > 1 && multiplierFor(n) > multiplierFor(n - 1),
      callout: '',
      milestone: 0,
      bonus: 0,
      tags: [],
    };
    if (n % 5 === 0) {
      out.milestone = n / 5;
      out.callout = n <= 25 ? MILESTONE_NAMES[n / 5 - 1] : `${n} streak!`;
      out.bonus += n * 10;
    } else if (n < CHAIN_NAMES.length) {
      out.callout = CHAIN_NAMES[n];
    }
    if (n > 1 && gap < 0.3) {
      out.tags.push('Lightning');
      out.bonus += 40;
    } else if (n > 1 && gap < 0.55) {
      out.tags.push('Quick');
      out.bonus += 20;
    }
    if (shot) {
      const k = (this.shots.get(shot) || 0) + 1;
      this.shots.set(shot, k);
      if (this.shots.size > 32) this.shots.delete(this.shots.keys().next().value);
      if (k > 1) {
        out.shot = k;
        out.shotCallout = SHOT_NAMES[Math.min(k, SHOT_NAMES.length - 1)];
        out.bonus += 50 * (k - 1);
      }
    }
    return out;
  }
}
