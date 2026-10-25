// Ambience: looping beds (wind, rain, waterfall, fire, shield hum, propellers)
// whose levels follow the world every frame, plus scattered one-shots (birds,
// crickets, cable-car creaks). update(dt, p) with p levels 0..1:
//   { wind, gust, rain, waterfall, wfPan, fire, firePan, shield, prop, propPan,
//     pirate, piratePan, birds, crickets, creak, creakPan }
export function createAmbience(ctx, V, S, dest) {
  const loops = {};
  let t = 0;
  const pick = (a) => a[(Math.random() * a.length) | 0];

  function bed(name, buffer, chain, rate = 1) {
    const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    let head = src;
    for (const n of chain) { head.connect(n); head = n; }
    head.connect(g); if (p) { g.connect(p); p.connect(dest); } else g.connect(dest);
    src.start(ctx.currentTime, Math.random() * buffer.duration * 0.9);
    return (loops[name] = { src, g, p, chain, level: 0 });
  }
  const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

  function ensure() {
    if (loops.wind) return;
    bed('wind', S.brown, [filt('bandpass', 420, 0.6)]);
    bed('whistle', S.pink, [filt('bandpass', 1400, 4)], 0.9);
    bed('rain', S.pink, [filt('highpass', 700), filt('lowpass', 9000)]);
    bed('patter', S.crackle, [filt('highpass', 1800)], 2.2);
    bed('waterfall', S.pink, [filt('bandpass', 650, 0.45)], 0.8);
    bed('wfLow', S.brown, [filt('lowpass', 260)], 1);
    bed('fire', S.crackle, [filt('highpass', 120)], 1);
    bed('prop', S.prop, [filt('lowpass', 700)], 1);
    bed('pirate', S.prop, [filt('bandpass', 520, 0.8)], 1.4);
  }

  let hum = null;
  function shieldHum(level) {
    if (!hum && level <= 0.001) return;
    if (!hum) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(dest);
      const am = ctx.createGain(); am.gain.value = 0.7; am.connect(g);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.6; const lg = ctx.createGain(); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(am.gain); lfo.start();
      const oscs = [55, 110.4, 165.2, 331].map((f, i) => { const o = ctx.createOscillator(); o.type = i === 3 ? 'triangle' : 'sine'; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = [0.5, 0.35, 0.18, 0.05][i]; o.connect(og); og.connect(am); o.start(); return o; });
      hum = { g, oscs, lfo };
    }
    hum.g.gain.setTargetAtTime(Number.isFinite(level) ? Math.min(1, level) * 0.16 : 0, ctx.currentTime, 0.4);
  }

  function setLevel(name, v, tc = 0.5) {
    const L = loops[name]; if (!L) return;
    v = Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 0;
    if (Math.abs(v - L.level) < 0.002) return;
    L.level = v; L.g.gain.setTargetAtTime(v, ctx.currentTime, tc);
  }
  const setPan = (name, v) => { const L = loops[name]; if (L?.p && Number.isFinite(v)) L.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, v)), ctx.currentTime, 0.3); };

  function update(dt, p) {
    ensure();
    t += dt;
    // wind: a slow gusting envelope and a wandering band
    const gust = 0.65 + 0.35 * Math.sin(t * 0.37) * Math.sin(t * 0.13 + 1) + (p.gust || 0) * 0.3 * Math.sin(t * 1.7);
    setLevel('wind', p.wind * 0.55 * gust, 0.8);
    const wf = loops.wind.chain[0].frequency; wf.setTargetAtTime(300 + 380 * gust + p.gust * 300, ctx.currentTime, 0.8);
    setLevel('whistle', p.wind * p.wind * 0.05 * Math.max(0, gust - 0.5) + (p.gust || 0) * 0.04, 0.6);
    setPan('wind', Math.sin(t * 0.21) * 0.4); setPan('whistle', Math.sin(t * 0.17 + 2) * 0.6);
    setLevel('rain', p.rain * 0.3); setLevel('patter', p.rain * 0.12);
    setLevel('waterfall', p.waterfall * 0.22); setLevel('wfLow', p.waterfall * 0.18); setPan('waterfall', p.wfPan); setPan('wfLow', p.wfPan);
    setLevel('fire', p.fire * 0.4, 0.3); setPan('fire', p.firePan);
    setLevel('prop', p.prop * 0.16, 0.4); setPan('prop', p.propPan);
    setLevel('pirate', p.pirate * 0.2, 0.4); setPan('pirate', p.piratePan);
    shieldHum(p.shield || 0);
    // scattered life
    const now = ctx.currentTime;
    if (p.birds > 0 && Math.random() < p.birds * 0.55 * dt) {
      const n = Math.random() < 0.3 ? 2 : 1, pan = (Math.random() - 0.5) * 1.6;
      for (let i = 0; i < n; i++) V.sample(dest, now + 0.02 + i * (0.4 + Math.random() * 0.5), pick(S.chirp), { vel: (0.05 + Math.random() * 0.07) * p.birds, rate: 0.85 + Math.random() * 0.35, pan });
    }
    if (p.crickets > 0 && Math.random() < p.crickets * 2.2 * dt) {
      const pan = (Math.random() - 0.5) * 1.8, rate = 0.95 + Math.random() * 0.12;
      const reps = 1 + (Math.random() * 3 | 0);
      for (let i = 0; i < reps; i++) V.sample(dest, now + 0.02 + i * 0.32, pick(S.cricket), { vel: (0.02 + Math.random() * 0.03) * p.crickets, rate, pan });
    }
    if (p.creak > 0 && Math.random() < p.creak * 0.25 * dt) V.sample(dest, now + 0.02, pick(S.creak), { vel: 0.1 * Math.min(1, p.creak), rate: 0.8 + Math.random() * 0.4, pan: p.creakPan || 0 });
  }

  return { update, loops };
}
