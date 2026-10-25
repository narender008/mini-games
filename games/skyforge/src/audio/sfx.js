// Sound effects: named recipes built from the voices and the sample library.
// play(name, { pan, vol, at, size, rate }) is rate-limited per name, and a
// global budget keeps a burst of events (a long __sf.step) from piling up.
const LIMIT = { shieldHit: 0.12, hammer: 0.11, res: 0.22, coins: 0.18, info: 0.2, good: 0.2, warn: 0.25, bad: 0.3, harpoon: 0.035, flak: 0.03, boom: 0.04, click: 0.03, thunder: 0.25, hit: 0.05 };

export function createSfx(ctx, V, S, dest) {
  const last = new Map();
  let windowT = 0, windowN = 0;

  const env = (g, t, peak, a, d) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  function tone(out, t, f0, f1, dur, vol, type = 'sine') {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, vol, 0.004, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function filtered(out, t, buffer, { type = 'lowpass', f = 1000, f1 = null, q = 0.7, vol = 0.5, dur = null, rate = 1, a = 0.005, offset = 0 } = {}) {
    const src = ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = rate; if (dur) src.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + (dur || buffer.duration / rate)); fl.Q.value = q;
    const g = ctx.createGain();
    if (dur) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
    else g.gain.value = vol;
    src.connect(fl); fl.connect(g); g.connect(out); src.start(t, offset); if (dur) src.stop(t + dur + 0.05);
  }
  const pick = (a) => a[(Math.random() * a.length) | 0];

  // recipes: (out, t, o) -> void; volumes are pre-mix (the sfx bus sets the overall level)
  const R = {
    click: (out, t) => { tone(out, t, 2200, 1100, 0.035, 0.08); V.sample(out, t, S.hammer[0], { vel: 0.05, rate: 2.2 }); },
    open: (out, t) => V.sample(out, t, S.swish, { vel: 0.18, rate: 1.2 }),
    close: (out, t) => V.sample(out, t, S.swish, { vel: 0.14, rate: 0.9 }),
    denied: (out, t) => { tone(out, t, 233, 233, 0.09, 0.09, 'triangle'); tone(out, t + 0.1, 196, 196, 0.16, 0.09, 'triangle'); },
    tick: (out, t) => V.celesta(out, t, 96, 0.06),
    thunk: (out, t) => { tone(out, t, 150, 52, 0.16, 0.45); V.drum(out, t, 'frame', 0.35, { rate: 0.8 }); V.sample(out, t + 0.01, pick(S.hammer), { vel: 0.18, rate: 0.6 }); },
    hammer: (out, t, o) => V.sample(out, t, pick(S.hammer), { vel: 0.22 * (o.vol ?? 1), rate: 0.85 + Math.random() * 0.4, pan: o.pan }),
    saw: (out, t) => filtered(out, t, S.white, { type: 'bandpass', f: 1800, q: 3, vol: 0.12, dur: 0.5 }),
    chime: (out, t) => { [72, 76, 79].forEach((m, i) => V.bell(out, t + i * 0.09, m, 0.16)); V.celesta(out, t + 0.3, 84, 0.12); },
    upgrade: (out, t) => { [76, 79, 84, 88].forEach((m, i) => V.celesta(out, t + i * 0.07, m, 0.14)); V.bell(out, t + 0.28, 72, 0.12); V.sample(out, t, S.whoosh, { vel: 0.1, rate: 1.5 }); },
    demolish: (out, t) => { V.sample(out, t, S.boom[0], { vel: 0.3, rate: 1.3 }); filtered(out, t + 0.05, S.brown, { f: 600, vol: 0.4, dur: 0.9 }); [0, 0.12, 0.3].forEach((d) => V.drum(out, t + d, 'tom', 0.15, { rate: 0.6 })); },
    damaged: (out, t, o) => { V.sample(out, t, S.boom[0], { vel: 0.25, rate: 1.6, pan: o.pan }); V.sample(out, t, pick(S.hammer), { vel: 0.2, rate: 0.5, pan: o.pan }); },
    coins: (out, t, o) => V.sample(out, t, S.coins, { vel: 0.22 * (o.vol ?? 1), rate: 0.95 + Math.random() * 0.1, pan: o.pan }),
    res: (out, t, o) => V.pluck(out, t, pick([79, 81, 84, 86, 88, 91]), 0.05 * (o.vol ?? 1), { pan: o.pan }),
    fanfare: (out, t) => { V.brass(out, t, [67], 0.14, 0.12); V.brass(out, t + 0.16, [72], 0.14, 0.12); V.brass(out, t + 0.32, [67, 72, 76, 79], 1.1, 0.1); V.drum(out, t + 0.32, 'timpani', 0.3); V.drum(out, t + 0.32, 'cymbal', 0.07); },
    smallFanfare: (out, t) => { V.brass(out, t, [69], 0.12, 0.1); V.brass(out, t + 0.14, [69, 74, 78], 0.7, 0.09); V.drum(out, t + 0.14, 'timpani', 0.18, { rate: 1.1 }); },
    bigFanfare: (out, t) => { [62, 66, 69, 74].forEach((m, i) => V.brass(out, t + i * 0.13, [m], 0.13, 0.11)); V.brass(out, t + 0.55, [62, 66, 69, 74, 78], 1.8, 0.11); V.drum(out, t + 0.55, 'timpani', 0.4); V.drum(out, t + 0.55, 'cymbal', 0.12); [0.14, 0.28, 0.42].forEach((d) => V.drum(out, t + d, 'snare', 0.08)); },
    info: (out, t) => { V.celesta(out, t, 84, 0.1); V.celesta(out, t + 0.08, 88, 0.09); },
    good: (out, t) => { V.celesta(out, t, 79, 0.11); V.celesta(out, t + 0.08, 84, 0.11); V.bell(out, t + 0.16, 88, 0.07); },
    warn: (out, t) => { V.pluck(out, t, 76, 0.18); V.pluck(out, t + 0.12, 72, 0.18); V.pluck(out, t + 0.3, 76, 0.14); V.pluck(out, t + 0.42, 72, 0.14); },
    bad: (out, t) => { V.bell(out, t, 64, 0.14); V.bell(out, t + 0.18, 61, 0.14); tone(out, t, 110, 98, 0.6, 0.1, 'triangle'); },
    horn: (out, t) => { // the Crimson Gale's horn: low, minor, far away
      V.brass(out, t, [38, 45], 1.1, 0.16, { bright: 0.6 }); V.brass(out, t + 1.2, [37, 44], 1.7, 0.16, { bright: 0.55 });
      V.drum(out, t + 1.2, 'taiko', 0.35); V.drum(out, t + 2.2, 'taiko', 0.3, { rate: 0.9 });
    },
    raidStart: (out, t) => { [0, 0.28, 0.56].forEach((d, i) => V.drum(out, t + d, 'taiko', 0.4 - i * 0.05)); V.brass(out, t + 0.56, [50, 57, 62], 0.9, 0.12); },
    relief: (out, t) => { V.brass(out, t, [62, 66, 69], 1.6, 0.07, { bright: 0.6 }); V.bell(out, t + 0.2, 74, 0.1); },
    harpoon: (out, t, o) => { V.pluck(out, t, 40 + Math.random() * 3, 0.45, { pan: o.pan }); V.sample(out, t, S.whoosh, { vel: 0.18, rate: 1.8, pan: o.pan }); tone(out, t, 90, 50, 0.12, 0.25); },
    flak: (out, t, o) => { V.sample(out, t, S.boom[0], { vel: 0.26 * (o.vol ?? 1), rate: 2.4 + Math.random() * 0.4, pan: o.pan }); V.drum(out, t, 'snare', 0.08, { rate: 0.7, pan: o.pan }); },
    whistle: (out, t, o) => { const g = ctx.createGain(); g.gain.value = 0.05 * (o.vol ?? 1); g.connect(out); tone(g, t, 1500, 420, 0.9, 1); },
    cannon: (out, t, o) => { V.sample(out, t, S.boom[0], { vel: 0.3 * (o.vol ?? 1), rate: 1.5, pan: o.pan }); },
    boom: (out, t, o) => { const big = (o.size || 1) >= 1.8; V.sample(out, t, S.boom[big ? 1 : 0], { vel: Math.min(0.75, 0.32 + 0.14 * (o.size || 1)) * (o.vol ?? 1), rate: big ? 0.9 : 1.15 - Math.min(0.3, (o.size || 1) * 0.1), pan: o.pan }); },
    ignite: (out, t, o) => { V.sample(out, t, S.whoosh, { vel: 0.2, rate: 0.6, pan: o.pan }); filtered(out, t, S.crackle, { type: 'highpass', f: 400, vol: 0.4, dur: 1.4, pan: o.pan }); },
    hiss: (out, t, o) => filtered(out, t, S.white, { type: 'highpass', f: 2500, f1: 6000, vol: 0.16, dur: 1.1 }),
    shieldUp: (out, t) => { V.sample(out, t, S.whoosh, { vel: 0.2, rate: 0.8 }); tone(out, t, 110, 220, 0.9, 0.12, 'triangle'); V.bell(out, t + 0.3, 69, 0.1); V.celesta(out, t + 0.45, 93, 0.07); },
    shieldHit: (out, t, o) => { tone(out, t, 320, 140, 0.35, 0.12, 'triangle'); V.sample(out, t, S.zap, { vel: 0.12, rate: 0.6, pan: o.pan }); V.bell(out, t, 81, 0.05, { pan: o.pan }); },
    zap: (out, t, o) => { V.sample(out, t, S.zap, { vel: 0.38 * (o.vol ?? 1), rate: 0.9 + Math.random() * 0.2, pan: o.pan }); },
    lash: (out, t) => { V.sample(out, t, S.zap, { vel: 0.45 }); V.sample(out, t + 0.05, S.thunder[2], { vel: 0.35, rate: 1.4, dur: 1.3, fade: 0.5 }); },
    militia: (out, t) => { V.brass(out, t, [62, 69], 0.3, 0.12); V.brass(out, t + 0.32, [62, 69, 74], 0.8, 0.12); V.sample(out, t, S.prop, { vel: 0.25, dur: 1.5, fade: 0.8 }); },
    volley: (out, t) => { for (let i = 0; i < 4; i++) R.harpoon(out, t + i * 0.09, { pan: (i - 1.5) * 0.3 }); },
    thunder: (out, t, o) => {
      const d = o.distance ?? 0.5;   // 0 near .. 1 far
      const src = ctx.createBufferSource(); src.buffer = pick(S.thunder); src.playbackRate.value = 1 - d * 0.25;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600 - d * 2100;
      const g = ctx.createGain(); g.gain.value = (0.75 - d * 0.4) * (o.vol ?? 1);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      src.connect(lp); lp.connect(g); if (p) { p.pan.value = o.pan || 0; g.connect(p); p.connect(out); } else g.connect(out);
      src.start(t);
    },
    horn1: (out, t) => { V.brass(out, t, [57, 64], 0.35, 0.09, { bright: 0.7 }); V.brass(out, t + 0.4, [57, 64], 0.7, 0.09, { bright: 0.7 }); },
    depart: (out, t, o) => { V.brass(out, t, [55, 62], 0.9, 0.07, { bright: 0.6, pan: o.pan }); V.sample(out, t, S.whoosh, { vel: 0.1, rate: 0.7, pan: o.pan }); },
    arrive: (out, t, o) => V.bell(out, t, 79, 0.12, { pan: o.pan }),
    snap: (out, t, o) => { V.pluck(out, t, 36, 0.5, { pan: o.pan }); V.sample(out, t, S.boom[0], { vel: 0.2, rate: 1.8, pan: o.pan }); V.sample(out, t + 0.05, S.creak[1], { vel: 0.3, rate: 0.8, pan: o.pan }); },
    shimmer: (out, t) => { [84, 88, 91, 96, 100].forEach((m, i) => V.celesta(out, t + i * 0.06, m, 0.09)); },
    paper: (out, t) => { V.sample(out, t, S.swish, { vel: 0.14, rate: 1.6 }); V.celesta(out, t + 0.1, 86, 0.07); },
    morning: (out, t) => { V.bell(out, t, 67, 0.08); V.bell(out, t + 0.5, 74, 0.07); V.bell(out, t + 1.0, 79, 0.06); },
    evening: (out, t) => { V.bell(out, t, 64, 0.06); V.bell(out, t + 0.7, 57, 0.06); },
    arrivePop: (out, t) => { V.pluck(out, t, 74, 0.08); V.pluck(out, t + 0.09, 79, 0.08); },
    leave: (out, t) => { V.pluck(out, t, 69, 0.07); V.pluck(out, t + 0.1, 64, 0.07); },
    clank: (out, t, o) => { V.bell(out, t, 90 + Math.random() * 4, 0.1, { pan: o.pan, dur: 0.12, fade: 0.08 }); V.sample(out, t, pick(S.hammer), { vel: 0.25, rate: 0.7, pan: o.pan }); },
    down: (out, t, o) => { R.boom(out, t, { ...o, size: 2.2 }); V.sample(out, t + 0.2, S.creak[1], { vel: 0.35, rate: 0.6, pan: o.pan }); tone(out, t + 0.1, 900, 120, 1.6, 0.05, 'triangle'); },
    stormSwell: (out, t) => { filtered(out, t, S.brown, { f: 200, f1: 700, vol: 0.4, dur: 3.5, a: 1.5 }); R.thunder(out, t + 1.2, { distance: 0.8 }); },
  };

  function play(name, o = {}) {
    const fn = R[name]; if (!fn) return false;
    if (ctx.state !== 'running' && !(ctx instanceof (globalThis.OfflineAudioContext || Object))) return false;
    const now = ctx.currentTime;
    const lim = LIMIT[name] ?? 0.05;
    if (!o.force && now - (last.get(name) ?? -1) < lim) return false;
    if (now - windowT > 0.1) { windowT = now; windowN = 0; }
    if (++windowN > 14 && !o.force) return false;
    last.set(name, now);
    const t = Math.max(now + 0.005, o.at ?? now + 0.005);
    let out = dest;
    if (o.pan && name !== 'thunder' && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); p.connect(dest); out = p; }
    if (o.vol != null && o.vol !== 1 && !['hammer', 'coins', 'res', 'flak', 'whistle', 'cannon', 'boom', 'zap', 'thunder'].includes(name)) { const g = ctx.createGain(); g.gain.value = o.vol; g.connect(out); out = g; }
    try { fn(out, t, { ...o, pan: name === 'thunder' ? (o.pan || 0) : 0 }); } catch (e) { console.error(e); }
    return true;
  }

  return { play, names: Object.keys(R) };
}
