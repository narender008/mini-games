// Background music: 'day' (calm pastoral garden music composed as it plays,
// sound/daysong.js) and 'bedtime' (music-box lullabies, sound/lullaby.js),
// crossfaded into each other, or 'off'. A lookahead scheduler places notes a
// moment ahead on the audio clock. The music sits well under the effects.
import { DaySong } from './sound/daysong.js';
import { Lullaby } from './sound/lullaby.js';

const LEVEL = 0.4;
const LAYER = { day: 1, bedtime: 0.75 };
const FADE = 1.1; // crossfade time constant, seconds

export class Music {
  constructor(audio) {
    const ctx = audio.ctx;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = LEVEL;
    this.bus.connect(audio.master);
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    this.bus.connect(wet).connect(audio.send);
    this.layers = { day: new DaySong(audio, this.bus), bedtime: new Lullaby(audio, this.bus) };
    this.kind = 'off';
    this.held = false;
  }

  // 'day' | 'bedtime' | 'off'
  set(kind) {
    if (!this.layers[kind]) kind = 'off';
    if (kind === this.kind) return;
    this.kind = kind;
    const t = this.ctx.currentTime;
    for (const [id, layer] of Object.entries(this.layers)) {
      const on = id === kind;
      // a silent layer comes back in at the start of a fresh section
      if (on && !layer.live) {
        layer.reset(t + 0.12);
        layer.live = true;
      }
      if (!on) layer.offAt = t;
      layer.out.gain.cancelScheduledValues(t);
      layer.out.gain.setTargetAtTime(on ? LAYER[id] : 0, t, FADE);
    }
  }

  setCalm(v) {
    this.bus.gain.setTargetAtTime(LEVEL * (1 - 0.3 * v), this.ctx.currentTime, 0.6);
  }

  // Schedule notes up to `until` (audio clock). While muted nothing is
  // scheduled; the music picks up again at a fresh section.
  pump(now, until, muted) {
    for (const [id, layer] of Object.entries(this.layers)) {
      if (!layer.live) continue;
      if (id !== this.kind && now > layer.offAt + FADE * 5) {
        layer.live = false;
        continue;
      }
      if (muted) {
        layer.reset(now + 0.12);
        continue;
      }
      layer.pump(until);
    }
  }
}
