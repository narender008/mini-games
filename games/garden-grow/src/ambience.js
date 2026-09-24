// The garden's ambience, all soft and real: the quiet air of outdoors and a
// light breeze through leaves (filtered noise with slow gusts and a leafy
// flutter), distant birdsong by day from a few resident birds, gentle rain
// (a soft hiss, drops ticking on leaves, patter on soil and the odd drip; no
// thunder), a warm hum of bees near the flowers and, at night, a few
// crickets chirping slowly. No owls.
//
// main.js calls setAmbience() every frame, which only sets targets. The
// audio's own timer calls tick(): it eases the levels, moves the gusts and
// schedules the birds and drips. Loops are started once and faded, never
// rebuilt; the heavier ones are only rendered when first needed.

// resident birds, each singing from its own spot (distance 0 near .. 1 far)
const RESIDENTS = [
  { kind: 'robin', pan: -0.6, dist: 0.6 },
  { kind: 'blue-tit', pan: 0.55, dist: 0.7 },
  { kind: 'goldfinch', pan: 0.2, dist: 0.9 },
  { kind: 'robin', pan: 0.75, dist: 1 },
];

// full-scale levels of each layer
const K = { air: 0.08, wind: 0.1, leaves: 0.05, rain: 0.23, bees: 0.04, crickets: 0.056, bird: 0.042, drip: 0.06 };

export class Ambience {
  constructor(audio) {
    const ctx = audio.ctx;
    this.a = audio;
    this.ctx = ctx;
    this.target = audio.amb;
    this.level = { night: 0, rain: 0, wind: 0, bees: 0, birds: 0 };
    this.out = ctx.createGain();
    this.out.connect(audio.master);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.3;
    this.wet.connect(audio.send);
    this.gains = [];
    this.last = null;
    this.gust = 0.6;
    this.gustNext = 0;
    this.birdNext = 0;
    this.bout = null;
    this.dripNext = 0;

    // the air of outdoors: a very soft low rumble of the world far away
    this.airG = this.gain(this.chain(audio.pink, [['highpass', 70, 0.6], ['lowpass', 320, 0.6]]));
    // the breeze itself, and leaves stirring in it on either side
    this.windG = this.gain(this.chain(audio.pink, [['bandpass', 380, 0.6]]));
    this.leafG = this.gain(null);
    for (const pan of [-0.6, 0.6]) {
      const leaves = this.chain(audio.noise, [['highpass', 1300, 0.6], ['lowpass', 5000, 0.6]]);
      // the flutter: a slow random signal modulating the leaves' level
      const flutter = ctx.createGain();
      flutter.gain.value = 0.6;
      const mod = ctx.createBufferSource();
      mod.buffer = audio.bank.buffer('flutter', 0);
      mod.loop = true;
      const depth = ctx.createGain();
      depth.gain.value = 0.4;
      mod.connect(depth).connect(flutter.gain);
      mod.start(ctx.currentTime, Math.random() * mod.buffer.duration);
      mod.playbackRate.value = pan < 0 ? 1 : 1.13;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      leaves.connect(flutter).connect(p).connect(this.leafG.node);
    }
    this.rainG = this.gain(null, 0.15);
    this.beeG = this.gain(null);
    this.cricketG = this.gain(null, 0.35);
    this.birdBus = ctx.createBiquadFilter();
    this.birdBus.type = 'lowpass';
    this.birdBus.frequency.value = 5200;
    this.birdBus.Q.value = 0.5;
    this.birdBus.connect(this.out);
    const bw = ctx.createGain();
    bw.gain.value = 0.5;
    this.birdBus.connect(bw).connect(this.wet);
  }

  // a looped noise source through a chain of filters
  chain(buffer, filters) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.start(ctx.currentTime, Math.random() * buffer.duration);
    let node = s;
    for (const [type, f, q] of filters) {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      node = node.connect(b);
    }
    return node;
  }

  // a level control (starting silent), optionally sending to the reverb
  gain(input, wet = 0) {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    if (input) input.connect(g);
    g.connect(this.out);
    if (wet) {
      const w = this.ctx.createGain();
      w.gain.value = wet;
      g.connect(w).connect(this.wet);
    }
    const layer = { node: g, v: 0 };
    this.gains.push(layer);
    return layer;
  }

  // a rendered loop, started (silently) the first time it is needed
  loop(layer, name, pan = 0, level = 1) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.a.bank.buffer(name, 0);
    s.loop = true;
    const g = ctx.createGain();
    g.gain.value = level;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(g).connect(p).connect(layer.node);
    s.start(ctx.currentTime, Math.random() * s.buffer.duration);
  }

  set(layer, v, now, tc = 0.4) {
    if (Math.abs(v - layer.v) < 0.0004) return;
    layer.v = v;
    layer.node.gain.setTargetAtTime(v, now, tc);
  }

  setCalm(v) {
    this.out.gain.setTargetAtTime(1 - 0.25 * v, this.ctx.currentTime, 0.6);
  }

  tick(now, muted) {
    const dt = this.last === null ? 0.1 : Math.min(0.5, Math.max(0, now - this.last));
    this.last = now;
    const k = 1 - Math.exp(-dt * 0.9);
    const L = this.level;
    const T = this.target;
    for (const key in L) L[key] += (Math.max(0, Math.min(1, T[key] || 0)) - L[key]) * k;

    // gusts come and go every few seconds
    if (now >= this.gustNext) {
      this.gust = 0.3 + 0.7 * Math.random() ** 0.7;
      this.gustNext = now + 1.5 + Math.random() * 4.5;
    }
    const day = 1 - L.night;
    // the outdoor air is there whenever any of the garden is
    const outdoors = Math.min(1, 10 * Math.max(L.wind, L.rain, L.night, L.bees, L.birds));
    this.set(this.airG, K.air * outdoors * (0.8 + 0.2 * L.wind), now, 0.8);
    this.set(this.windG, K.wind * (0.15 * outdoors + 0.85 * L.wind) * (0.45 + 0.55 * this.gust), now, 1.2);
    this.set(this.leafG, K.leaves * L.wind * (0.25 + 0.75 * this.gust), now, 0.9);

    if (L.rain > 0.002 && !this.rainOn) {
      this.rainOn = true;
      this.loop(this.rainG, 'rain');
    }
    if (this.rainOn) this.set(this.rainG, K.rain * Math.pow(L.rain, 0.9), now);

    const bees = L.bees * day * (1 - 0.8 * L.rain);
    if (bees > 0.002 && !this.beesOn) {
      this.beesOn = true;
      this.loop(this.beeG, 'bees');
    }
    if (this.beesOn) this.set(this.beeG, K.bees * bees, now, 0.8);

    const crickets = Math.pow(L.night, 1.5) * (1 - 0.7 * L.rain);
    if (crickets > 0.002 && !this.cricketsOn) {
      this.cricketsOn = true;
      this.loop(this.cricketG, 'cricketA', -0.55, 0.9);
      this.loop(this.cricketG, 'cricketB', 0.5, 0.6);
      this.loop(this.cricketG, 'cricketC', 0.1, 0.4);
    }
    if (this.cricketsOn) this.set(this.cricketG, K.crickets * crickets, now, 0.8);

    if (muted) return;
    this.birds(now, L.birds * day * (1 - 0.7 * L.rain));
    // a drop now and then from a leaf or the fence
    if (L.rain > 0.15 && now >= this.dripNext) {
      if (this.dripNext > 0) {
        this.a.playBuffer(this.a.bank.get('drip'), {
          t: now + 0.05,
          pan: Math.random() * 1.6 - 0.8,
          gain: K.drip * L.rain * (0.4 + 0.6 * Math.random()),
          rate: 0.85 + Math.random() * 0.3,
          wet: 0.2,
          dest: this.out,
        });
      }
      this.dripNext = now + (0.3 + Math.random() * 1.6) / L.rain;
    }
  }

  // Birds sing in bouts: one bird sings a few phrases with little pauses,
  // then the garden is quiet for a while before another answers.
  birds(now, activity) {
    if (activity < 0.03) {
      this.birdNext = Math.max(this.birdNext, now + 2);
      return;
    }
    if (now < this.birdNext) return;
    if (!this.bout || this.bout.left <= 0) {
      this.bout = { who: RESIDENTS[Math.floor(Math.random() * RESIDENTS.length)], left: 1 + Math.floor(Math.random() * 3) };
    }
    const b = this.bout;
    const buf = this.a.birdBuffer(b.who.kind);
    this.a.playBuffer(buf, {
      t: now + 0.05,
      pan: b.who.pan + (Math.random() - 0.5) * 0.1,
      gain: K.bird * (0.6 + 0.4 * activity) * (1.15 - 0.6 * b.who.dist),
      rate: 0.97 + Math.random() * 0.06,
      wet: 0,
      dest: this.birdBus,
    });
    b.left--;
    this.birdNext = now + buf.duration + (b.left > 0 ? 1.4 + Math.random() * 2.4 : (4 + Math.random() * 9) / (0.4 + activity));
  }
}
