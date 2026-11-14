// Pure bookkeeping for sound-effect voices: no Web Audio here, so it runs (and is tested) in Node.
//
// VoiceLimiter decides whether a new voice may start, given
//   - a per-name minimum gap between starts (identical sounds fired on the same frame collapse into one),
//   - a per-name cap on simultaneous voices,
//   - a global cap, where a new voice may steal the oldest voice of equal or lower priority.
// Voices end on their own at their scheduled end time (so a missed `onended` can never leak a slot),
// or earlier through release().
//
// MoteSequencer picks pitches for rapid pickups: a run of motes climbs a pentatonic scale (a pleasant
// glissando rather than the same plink thirty times), wraps back down, and softens as the run gets dense.

export interface LimitRule {
  /** Most voices of this name sounding at once. */
  max: number;
  /** Minimum seconds between two starts of this name. */
  gap: number;
  /** 0 = expendable (footsteps), 1 = normal, 2 = important (UI, boss, player hurt). */
  prio: number;
}

export interface LiveVoice { id: number; name: string; start: number; end: number; prio: number }

export type Admit =
  | { ok: true; id: number; evict: number | null }
  | { ok: false; reason: 'gap' | 'max' | 'global' };

export class VoiceLimiter {
  private voices: LiveVoice[] = [];
  private lastStart = new Map<string, number>();
  private nextId = 1;

  constructor(public globalMax = 32) {}

  /** Try to start `name` at time `now` lasting `duration` seconds. */
  admit(name: string, now: number, rule: LimitRule, duration: number): Admit {
    this.prune(now);
    const last = this.lastStart.get(name);
    if (last !== undefined && now - last < rule.gap) return { ok: false, reason: 'gap' };
    let same = 0;
    for (const v of this.voices) if (v.name === name) same++;
    if (same >= rule.max) return { ok: false, reason: 'max' };
    let evict: number | null = null;
    if (this.voices.length >= this.globalMax) {
      // Steal the oldest voice whose priority is not above ours.
      let victim = -1;
      for (let i = 0; i < this.voices.length; i++) {
        const v = this.voices[i]!;
        if (v.prio <= rule.prio && (victim < 0 || v.start < this.voices[victim]!.start)) victim = i;
      }
      if (victim < 0) return { ok: false, reason: 'global' };
      evict = this.voices[victim]!.id;
      this.voices.splice(victim, 1);
    }
    const id = this.nextId++;
    this.voices.push({ id, name, start: now, end: now + Math.max(0, duration), prio: rule.prio });
    this.lastStart.set(name, now);
    return { ok: true, id, evict };
  }

  /** A voice finished early (or was stopped). Unknown ids are ignored. */
  release(id: number): void {
    const i = this.voices.findIndex((v) => v.id === id);
    if (i >= 0) this.voices.splice(i, 1);
  }

  /** Drop every voice (used when sfx tails are silenced). Gap memory is kept. */
  clear(): void { this.voices.length = 0; }

  count(now: number, name?: string): number {
    this.prune(now);
    if (name === undefined) return this.voices.length;
    let n = 0;
    for (const v of this.voices) if (v.name === name) n++;
    return n;
  }

  ids(now: number): number[] { this.prune(now); return this.voices.map((v) => v.id); }

  private prune(now: number): void {
    // Keep the array small; this is called on every admit so it never grows past the caps.
    let w = 0;
    for (let r = 0; r < this.voices.length; r++) {
      const v = this.voices[r]!;
      if (v.end > now) this.voices[w++] = v;
    }
    this.voices.length = w;
  }
}

/** D major pentatonic (D E G A B), which sits inside D dorian, so motes always agree with the music. */
export const MOTE_SCALE = [0, 2, 7, 9, 11];

export class MoteSequencer {
  private degree = 0;
  private lastAt = -Infinity;
  private run = 0;

  /** Seconds of silence after which a run starts again from the bottom. */
  constructor(private resetAfter = 0.6, private span = 9, private rand: () => number = Math.random) {}

  /**
   * Next mote: `semis` above the base note (D6 in the synth) and a gain multiplier.
   * Runs climb one scale degree per mote (occasionally two), wrapping within `span` degrees.
   */
  next(now: number): { semis: number; gain: number } {
    if (now - this.lastAt > this.resetAfter) { this.degree = Math.floor(this.rand() * 2); this.run = 0; }
    else { this.degree += this.rand() < 0.2 ? 2 : 1; this.run++; }
    if (this.degree >= this.span) this.degree -= this.span - 2; // wrap down, but not all the way
    this.lastAt = now;
    const oct = Math.floor(this.degree / MOTE_SCALE.length);
    const semis = MOTE_SCALE[this.degree % MOTE_SCALE.length]! + 12 * oct;
    // Long runs get quieter so a shower of motes stays a sparkle, never a wall.
    const gain = Math.max(0.45, 1 / (1 + this.run * 0.06));
    return { semis, gain };
  }
}
