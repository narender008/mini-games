// Moonbound audio: the room the sound lives in. One master chain every sound passes through, the
// buses (effects, score, stingers) and one shared reverb, a cold stone hall.
//
//   effects  ->  sfxBus  --\                       /-> reverb (high-passed, convolver) --\
//   score    ->  musicVol --+-> master: high-pass -> bus compressor -> volume -> limiter -> soft ceiling -> out
//   stingers ->  stingBus -/
//
// The compressor is a gentle glue (the sounds are already balanced by number, see bank.js); the
// limiter and the soft ceiling after it make clipping impossible however many hits stack.
import { reverbIR, seeded, clamp } from './dsp.js';

// a soft ceiling: untouched up to 0.8, eased towards 0.985, which it never passes
function ceilingCurve() {
  const n = 4096;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.8 ? a : 0.8 + 0.185 * Math.tanh((a - 0.8) / 0.185));
  }
  return c;
}

export const taper = (v) => Math.pow(clamp(+v || 0, 0, 1), 1.6);

// Fixed trims. The whole mix is balanced by measurement for sliders at 1.0 (music about -17 dBFS RMS in a
// fight, hits peaking about -3 dBFS); the stingers sit a little under the score's own level.
const MASTER_TRIM = 0.7;
const MENU_DIP = 0.45; // the score's level under a menu (about -7 dB)
const STING_TRIM = 0.75;
const SFX_TRIM = 0.85;

export class Space {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    this._g = g;
    this.vols = { master: opts.master ?? 1, music: opts.music ?? 1, sfx: opts.sfx ?? 1, muted: !!opts.muted };

    // the master chain
    this.mix = g(1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 30;
    hp.Q.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.006;
    comp.release.value = 0.2;
    this.master = g(this._masterGain());
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.09;
    const ceil = ctx.createWaveShaper();
    ceil.curve = ceilingCurve();
    this.mix.connect(hp);
    hp.connect(comp);
    comp.connect(this.master);
    this.master.connect(lim);
    lim.connect(ceil);
    ceil.connect(ctx.destination);
    this.comp = comp;
    this.lim = lim;

    // buses
    this.sfxBus = g(taper(this.vols.sfx) * SFX_TRIM);
    this.sfxBus.connect(this.mix);
    this.musicVol = g(taper(this.vols.music));
    this.musicVol.connect(this.mix);
    this.musicIn = g(1); // theme layers (dry)
    this.musicIn.connect(this.musicVol);
    this.stingBus = g(taper(this.vols.music) * STING_TRIM);
    this.stingBus.connect(this.mix);

    // the reverb: sends -> high-pass -> convolver -> return
    this.revIn = g(1);
    const rhp = ctx.createBiquadFilter();
    rhp.type = 'highpass';
    rhp.frequency.value = 170;
    rhp.Q.value = 0.6;
    this.conv = ctx.createConvolver();
    const ir = reverbIR(ctx.sampleRate, { rt: opts.rt ?? 2.4 }, seeded(77));
    const buf = ctx.createBuffer(2, ir[0].length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      if (buf.copyToChannel) buf.copyToChannel(ir[c], c);
      else buf.getChannelData(c).set(ir[c]);
    }
    this.conv.buffer = buf;
    this.conv.normalize = true;
    this.revOut = g(0.55);
    this.revIn.connect(rhp);
    rhp.connect(this.conv);
    this.conv.connect(this.revOut);
    this.revOut.connect(this.mix);
    this.sfxSend = g(taper(this.vols.sfx) * SFX_TRIM);
    this.sfxSend.connect(this.revIn);
    // music reverb: scaled with the music volume and the duck so it never outlasts a fade
    this.musicSend = g(taper(this.vols.music));
    this.musicSend.connect(this.revIn);
    // the stingers' reverb follows the music volume but is not ducked
    this.stingSend = g(taper(this.vols.music) * STING_TRIM);
    this.stingSend.connect(this.revIn);
  }

  _masterGain() {
    return this.vols.muted ? 0 : taper(this.vols.master) * MASTER_TRIM;
  }

  setVolumes(v) {
    const t = this.ctx.currentTime;
    if (v.master !== undefined) this.vols.master = v.master;
    if (v.music !== undefined) this.vols.music = v.music;
    if (v.sfx !== undefined) this.vols.sfx = v.sfx;
    if (v.muted !== undefined) this.vols.muted = !!v.muted;
    this.master.gain.setTargetAtTime(this._masterGain(), t, 0.03);
    this.sfxBus.gain.setTargetAtTime(taper(this.vols.sfx) * SFX_TRIM, t, 0.03);
    this._music(t, 0.03);
    this.sfxSend.gain.setTargetAtTime(taper(this.vols.sfx) * SFX_TRIM, t, 0.03);
    this.stingBus.gain.setTargetAtTime(taper(this.vols.music) * STING_TRIM, t, 0.03);
    this.stingSend.gain.setTargetAtTime(taper(this.vols.music) * STING_TRIM, t, 0.03);
  }

  // the score sits lower while a menu is open
  setMenu(on) {
    this.menu = on ? MENU_DIP : 1;
    this._music(this.ctx.currentTime, 0.12);
  }

  _music(t, tc) {
    const m = taper(this.vols.music) * (this.menu ?? 1);
    this.musicVol.gain.setTargetAtTime(m, t, tc);
    this.musicSend.gain.setTargetAtTime(m, t, tc);
  }

  // dip the score to `depth` (0 = silent, 1 = untouched) for `hold` seconds, then ease back
  duck(depth, hold) {
    const t = this.ctx.currentTime;
    const m = taper(this.vols.music) * (this.menu ?? 1);
    for (const p of [this.musicVol.gain, this.musicSend.gain]) {
      p.cancelScheduledValues(t);
      p.setTargetAtTime(m * clamp(depth, 0, 1), t, 0.025);
      p.setTargetAtTime(m, t + Math.max(0.03, hold), 0.3);
    }
  }
}
