// Ace Pilot music: a driving, dark synthwave / industrial loop per sector,
// played by a sixteenth-note step sequencer on synthesised instruments (no
// files). Each sector is a variation by key, tempo, groove and instruments:
//
//   belt         A minor, 116 bpm  rolling saw bass, square arp, wide pad
//   storm        D minor, 124 bpm  echoing arp, airy pad, distant thunder
//   foundry      E phrygian, 128   driven bass, metal clangs, hard groove
//   hive         C# minor, 110     half-time, wobbling bass, eerie pad
//   dreadnought  C minor, 138      everything, toms, metal, big pad
//
// Layers (drums, bass, pad, arp, boss) have their own gains, all set from one
// intensity value 0..1 (setIntensity): ~0.3 is the calm upgrade screen (pad
// and soft bass behind a closed low-pass), ~0.75 a wave (full band), 1 a
// boss (adds the boss layer: stabs an octave up, a high lead arp and tom
// fills). Bass, pad and arp pump against the kick (a side-chain duck).
//
// Timing: start() runs a 25 ms look-ahead timer like ../music.js. For offline
// renders (dev/ace-audio.html) call start(id, { timer: false }) and then
// scheduleUntil(seconds) on an OfflineAudioContext.

// sector -> sound. prog: one chord per bar as [semitones above the key, 'm'
// or 'M']. Patterns are 16 steps: kick/snare 'x'; hat 'x' closed, 'o' open;
// bass 'r' root, 'o' octave, 'f' fifth; arp digits index the chord tones
// (0 root, 1 third, 2 fifth, 3 octave, ...); metal 'x'. trim evens out the
// loudness between sectors (the driven basses are denser).
const SECTORS = {
  belt: {
    bpm: 116, root: 33, // A1
    prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M'], [0, 'm'], [8, 'M'], [10, 'M'], [7, 'm']],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xo',
    bass: 'r.rrr.ror.rrr.ro', arp: '0120312031203123', metal: '................',
    bassWave: 'sawtooth', bassCut: 560, drive: 0, arpWave: 'square', arpCut: 2200, padCut: 1200,
    padWave: 'sawtooth', echo: 3, thunder: false, wobble: 0,
  },
  storm: {
    bpm: 124, root: 38, // D2
    prog: [[0, 'm'], [10, 'M'], [5, 'm'], [7, 'M'], [0, 'm'], [10, 'M'], [3, 'M'], [7, 'M']],
    kick: 'x...x...x...x..x', snare: '....x.......x...', hat: '.xx..xx..xx..xxo',
    bass: 'rrorrrorrrorrror', arp: '3.2.1.0.4.3.2.1.', metal: '................',
    bassWave: 'sawtooth', bassCut: 480, drive: 0, arpWave: 'triangle', arpCut: 3200, padCut: 1600,
    padWave: 'sawtooth', echo: 3, thunder: true, wobble: 0,
  },
  foundry: {
    bpm: 128, root: 28, // E1
    prog: [[0, 'm'], [1, 'M'], [0, 'm'], [10, 'M'], [0, 'm'], [1, 'M'], [3, 'M'], [1, 'M']],
    kick: 'x...x..xx...x...', snare: '....x.......x..x', hat: 'xxoxxxoxxxoxxxox',
    bass: 'rr.rro.rrr.rrfo.', arp: '0.0.3.0.2.0.3.1.', metal: '..x.....x.x...x.',
    bassWave: 'sawtooth', bassCut: 700, drive: 1, arpWave: 'square', arpCut: 1600, padCut: 900,
    padWave: 'square', echo: 2, thunder: false, wobble: 0, trim: 0.62,
  },
  hive: {
    bpm: 110, root: 37, // C#2
    prog: [[0, 'm'], [8, 'M'], [5, 'm'], [7, 'M'], [0, 'm'], [8, 'M'], [3, 'M'], [7, 'M']],
    kick: 'x.........x..x..', snare: '........x.......', hat: 'x.xxx.xxx.xxx.xo',
    bass: 'r..r..r.o..r..f.', arp: '0.2.4.2.1.3.5.3.', metal: '......x.......x.',
    bassWave: 'sawtooth', bassCut: 420, drive: 0.5, arpWave: 'sine', arpCut: 2600, padCut: 800,
    padWave: 'sawtooth', echo: 3, thunder: false, wobble: 1,
  },
  dreadnought: {
    bpm: 138, root: 36, // C2
    prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M'], [0, 'm'], [8, 'M'], [10, 'M'], [7, 'M']],
    kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'xxoxxxoxxxoxxxoo',
    bass: 'rrorrrorrrorrfor', arp: '0123432101234321', metal: '..x...x...x...xx',
    bassWave: 'sawtooth', bassCut: 640, drive: 1, arpWave: 'sawtooth', arpCut: 2000, padCut: 1400,
    padWave: 'sawtooth', echo: 3, thunder: true, wobble: 0, trim: 0.7,
  },
};
const ORDER = ['belt', 'storm', 'foundry', 'hive', 'dreadnought'];

// accepts 1..5, '1'..'5', or a name (also 'asteroid', 'ion', 'scrap', ...)
export function sectorKey(id) {
  if (typeof id === 'number' || /^\d+$/.test(String(id))) return ORDER[(Math.max(1, Math.min(5, Number(id))) - 1)];
  const s = String(id || '').toLowerCase();
  if (SECTORS[s]) return s;
  if (/aster|belt|quarry/.test(s)) return 'belt';
  if (/ion|storm|tempest/.test(s)) return 'storm';
  if (/scrap|foundry|crusher/.test(s)) return 'foundry';
  if (/hive|nebula|brood/.test(s)) return 'hive';
  if (/dread|mother|core/.test(s)) return 'dreadnought';
  return 'belt';
}

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const ss = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const BUS = 0.24;

export class AceMusic {
  constructor(ctx, master, verb, noise) {
    this.ctx = ctx;
    this.noise = noise;
    this.sec = SECTORS.belt;
    this.k = 0.75;
    this.step = 0;
    this.next = 0;
    this.timer = null;
    this.playing = false;

    // layer gains -> pump (side-chain) / lp (intensity tone) -> duck -> bus
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(master);
    const send = ctx.createGain();
    send.gain.value = 0.22;
    this.bus.connect(send).connect(verb);
    this.duckG = ctx.createGain();
    this.duckG.connect(this.bus);
    this.lvl = ctx.createGain(); // overall level by intensity
    this.lvl.connect(this.duckG);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.6;
    this.lp.frequency.value = 20000;
    this.lp.connect(this.lvl);
    this.pump = ctx.createGain();
    this.pump.connect(this.lp);
    const layer = (to) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(to);
      return g;
    };
    this.L = {
      drums: layer(this.lp),
      bass: layer(this.pump),
      pad: layer(this.pump),
      arp: layer(this.pump),
      boss: layer(this.lp),
    };
    // feedback echo for the arp and lead
    this.delay = ctx.createDelay(1.5);
    this.fb = ctx.createGain();
    this.fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2600;
    this.delay.connect(dlp).connect(this.fb).connect(this.delay);
    this.echoOut = ctx.createGain();
    this.echoOut.gain.value = 0.3;
    dlp.connect(this.echoOut).connect(this.lp);
    // soft clip for the industrial bass
    this.shaper = ctx.createWaveShaper();
    const c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1;
      c[i] = Math.tanh(x * 3) / Math.tanh(3);
    }
    this.shaper.curve = c;
    this.shaper.connect(this.L.bass);
  }

  // id: sector 1..5 or name. opts.timer false: no look-ahead timer (offline)
  start(id = 1, { timer = true, at } = {}) {
    this.sec = SECTORS[sectorKey(id)];
    this.stepLen = 60 / this.sec.bpm / 4;
    this.delay.delayTime.value = this.stepLen * this.sec.echo;
    const t = at ?? this.ctx.currentTime;
    this.step = 0;
    this.next = t + 0.08;
    this.playing = true;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.setTargetAtTime(BUS * (this.sec.trim || 1), t, 0.25);
    this.setIntensity(this.k, t, 0.01);
    if (timer && !this.timer) this.timer = setInterval(() => this.tick(), 25);
  }

  stop(fade = 0.6) {
    clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.setTargetAtTime(0, t, fade / 4);
  }

  // 0 silent-ish, 0.3 calm, 0.75 wave, 1 boss
  setIntensity(k, at = this.ctx.currentTime, tc = 0.5) {
    this.k = Math.max(0, Math.min(1, k));
    k = this.k;
    const set = (p, v) => {
      p.cancelScheduledValues(at);
      p.setTargetAtTime(v, at, tc);
    };
    set(this.L.drums.gain, 0.95 * ss(0.3, 0.6, k));
    set(this.L.bass.gain, 0.35 + 0.65 * ss(0.2, 0.6, k));
    set(this.L.pad.gain, 1 - 0.45 * ss(0.5, 1, k));
    set(this.lvl.gain, 0.5 + 0.5 * ss(0.2, 0.75, k));
    set(this.L.arp.gain, ss(0.4, 0.75, k));
    set(this.L.boss.gain, ss(0.82, 1, k));
    set(this.lp.frequency, Math.min(20000, 650 * 2 ** (5 * ss(0, 0.65, k))));
    this.target = {
      drums: ss(0.3, 0.6, k), bass: 1, pad: 1, arp: ss(0.4, 0.75, k), boss: ss(0.82, 1, k), hats: k > 0.5,
    };
  }

  // duck the music (under a stinger or a big hit) for a moment
  duck(amount = 0.4, time = 1.2) {
    const g = this.duckG.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(amount, t, 0.04);
    g.setTargetAtTime(1, t + time, 0.35);
  }

  tick() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') {
      this.next = ctx.currentTime + 0.1;
      return;
    }
    // a throttled timer (background tab) must not schedule a backlog
    if (this.next < ctx.currentTime - 0.2) this.next = ctx.currentTime + 0.05;
    this.scheduleUntil(ctx.currentTime + 0.15);
  }

  scheduleUntil(tEnd) {
    if (!this.playing) return;
    while (this.next < tEnd) {
      this.play(this.step, this.next);
      this.step = (this.step + 1) % 128;
      this.next += this.stepLen;
    }
  }

  // ------------------------------------------------------------ sequencer

  play(step, t) {
    const S = this.sec;
    const T = this.target;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const [off, q] = S.prog[bar];
    const tones = q === 'm' ? [0, 3, 7] : [0, 4, 7];
    const bassOff = off > 6 ? off - 12 : off;
    const root = S.root + bassOff;

    if (T.drums > 0.02) {
      if (S.kick[s] === 'x') this.kick(t);
      if (S.snare[s] === 'x') this.snare(t);
      if (T.hats && S.hat[s] !== '.') this.hat(t, S.hat[s] === 'o', s % 4 === 0 ? 1 : 0.7);
      if (S.metal[s] === 'x') this.metal(t, mtof(root + 48));
    } else if (s === 0 && bar % 2 === 0) this.kick(t, 0.5); // a soft heartbeat when calm

    const b = S.bass[s];
    if (b !== '.') {
      let len = 1;
      while (s + len < 16 && S.bass[s + len] === '.' && len < 2) len++;
      const m = root + (b === 'o' ? 12 : b === 'f' ? 7 : 0);
      this.bass(mtof(m), t, this.stepLen * len * 0.92, s % 4 === 0);
    }

    if (s === 0) this.pad(tones.map((x) => mtof(S.root + 24 + off + x - (off > 6 ? 12 : 0))), t, this.stepLen * 16);

    const ext = [...tones, ...tones.map((x) => x + 12), ...tones.map((x) => x + 24)];
    const a = S.arp[s];
    if (T.arp > 0.02 && a !== '.') {
      const m = S.root + 36 + bassOff + ext[Number(a)];
      this.arp(mtof(m), t, this.stepLen * 0.9, s % 4 === 0 ? 1 : 0.75);
    }

    if (T.boss > 0.02) {
      if (s % 4 === 2) this.stab(tones.map((x) => mtof(root + 24 + x)), t);
      const a2 = S.arp[15 - s];
      if (a2 !== '.' && s % 2 === 0) this.lead(mtof(S.root + 48 + bassOff + ext[Number(a2)]), t);
      if ((bar === 3 || bar === 7) && s >= 12) this.tom(t, 150 - (s - 12) * 22);
    }

    if (S.thunder && step === 0) this.thunder(t);
  }

  // ------------------------------------------------------------ instruments

  env(g, t, a, peak, d, hold = 0) {
    g.gain.value = 0; // silent before t (a looping source can start early)
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (hold > 0) g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
  }

  osc(type, f, t, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    return o;
  }

  noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  kick(t, k = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    const g = ctx.createGain();
    this.env(g, t, 0.002, 0.45 * k, 0.26);
    o.connect(g).connect(this.L.drums);
    o.start(t);
    o.stop(t + 0.32);
    // click
    const c = this.noiseSrc(t, 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const cg = ctx.createGain();
    this.env(cg, t, 0.001, 0.08 * k, 0.015);
    c.connect(hp).connect(cg).connect(this.L.drums);
    // side-chain pump
    const p = this.pump.gain;
    p.setValueAtTime(0.35, t);
    p.setTargetAtTime(1, t + 0.02, 0.07);
  }

  snare(t) {
    const ctx = this.ctx;
    const n = this.noiseSrc(t, 0.22);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    this.env(g, t, 0.002, 0.22, 0.18);
    n.connect(bp).connect(g).connect(this.L.drums);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const og = ctx.createGain();
    this.env(og, t, 0.002, 0.16, 0.09);
    o.connect(og).connect(this.L.drums);
    o.start(t);
    o.stop(t + 0.15);
  }

  hat(t, open, k) {
    const ctx = this.ctx;
    const d = open ? 0.16 : 0.035;
    const n = this.noiseSrc(t, d);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const g = ctx.createGain();
    this.env(g, t, 0.001, (open ? 0.07 : 0.06) * k, d);
    n.connect(hp).connect(g).connect(this.L.drums);
  }

  // industrial clang: inharmonic square partials through a band-pass
  metal(t, f) {
    const ctx = this.ctx;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    this.env(g, t, 0.001, 0.06, 0.12);
    bp.connect(g).connect(this.L.drums);
    for (const r of [1, 1.47, 1.98, 2.53]) {
      const o = this.osc('square', f * r * 2, t, bp);
      o.stop(t + 0.16);
    }
  }

  tom(t, f) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.18);
    const g = ctx.createGain();
    this.env(g, t, 0.002, 0.35, 0.22);
    o.connect(g).connect(this.L.boss);
    o.start(t);
    o.stop(t + 0.28);
  }

  thunder(t) {
    const ctx = this.ctx;
    const n = this.noiseSrc(t, 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 2.8);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    n.connect(lp).connect(g).connect(this.L.pad);
  }

  bass(f, t, len, accent) {
    const ctx = this.ctx;
    const S = this.sec;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    const cut = S.bassCut * (accent ? 1.5 : 1);
    lp.frequency.setValueAtTime(cut * 2.4, t);
    lp.frequency.exponentialRampToValueAtTime(cut * 0.6, t + len);
    if (S.wobble) {
      // hive: a slow growl across the bar
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 1 / (this.stepLen * 3);
      const lg = ctx.createGain();
      lg.gain.value = cut * 0.5;
      lfo.connect(lg).connect(lp.frequency);
      lfo.start(t);
      lfo.stop(t + len + 0.05);
    }
    const g = ctx.createGain();
    this.env(g, t, 0.004, 0.22 * (S.drive ? 0.9 : 1), len * 0.9);
    const o1 = this.osc(S.bassWave, f, t, lp, -7);
    const o2 = this.osc(S.bassWave, f, t, lp, 7);
    const subG = this.ctx.createGain();
    subG.gain.value = 0.45;
    subG.connect(g);
    const sub = this.osc('sine', f, t, subG);
    lp.connect(g);
    if (S.drive) {
      const dg = ctx.createGain();
      dg.gain.value = S.drive * 0.6;
      g.connect(dg).connect(this.shaper);
      const clean = ctx.createGain();
      clean.gain.value = 1 - S.drive * 0.4;
      g.connect(clean).connect(this.L.bass);
    } else g.connect(this.L.bass);
    for (const o of [o1, o2, sub]) o.stop(t + len + 0.05);
  }

  pad(freqs, t, len) {
    const ctx = this.ctx;
    const S = this.sec;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(S.padCut * 0.6, t);
    lp.frequency.linearRampToValueAtTime(S.padCut, t + len * 0.5);
    lp.frequency.linearRampToValueAtTime(S.padCut * 0.7, t + len);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.35);
    g.gain.setValueAtTime(0.05, t + len - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.5);
    lp.connect(g).connect(this.L.pad);
    for (const f of freqs) {
      for (const dt of [-11, 11]) {
        const o = this.osc(S.padWave, f, t, lp, dt + (S.wobble ? Math.sin(f) * 9 : 0));
        o.stop(t + len + 0.6);
      }
    }
  }

  arp(f, t, len, k) {
    const ctx = this.ctx;
    const S = this.sec;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(S.arpCut * 1.6, t);
    lp.frequency.exponentialRampToValueAtTime(S.arpCut * 0.5, t + len);
    const g = ctx.createGain();
    this.env(g, t, 0.003, 0.07 * k, len);
    const o = this.osc(S.arpWave, f, t, lp);
    o.stop(t + len + 0.05);
    lp.connect(g).connect(this.L.arp);
    g.connect(this.delay);
  }

  stab(freqs, t) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.14);
    const g = ctx.createGain();
    this.env(g, t, 0.003, 0.07, 0.14);
    lp.connect(g).connect(this.L.boss);
    for (const f of freqs) {
      const o = this.osc('sawtooth', f, t, lp, 6);
      o.stop(t + 0.2);
    }
  }

  lead(f, t) {
    const ctx = this.ctx;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(6000, f * 2);
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    this.env(g, t, 0.004, 0.075, this.stepLen * 1.6);
    const o = this.osc('square', f, t, bp);
    o.stop(t + this.stepLen * 1.7 + 0.05);
    bp.connect(g).connect(this.L.boss);
    g.connect(this.delay);
  }
}
