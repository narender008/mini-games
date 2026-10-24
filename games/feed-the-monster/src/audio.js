// Every sound is made here with the Web Audio API: there are no sound files.
// The context is created on the first touch (browsers require a gesture).
const KEY = 'feed-the-monster:muted';
const VOLUME = 0.9;
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

let ac = null;
let out = null;
let noiseBuf = null;
let muted = false;
try {
  muted = localStorage.getItem(KEY) === '1';
} catch {}

export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    out = ac.createGain();
    out.gain.value = muted ? 0 : VOLUME;
    out.connect(comp);
    comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
}

export const audioContext = () => ac;
export const isMuted = () => muted;

export function setMuted(m) {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? '1' : '0');
  } catch {}
  if (out) out.gain.setTargetAtTime(m ? 0 : VOLUME, ac.currentTime, 0.02);
}

export function suspend(yes) {
  if (!ac) return;
  if (yes) ac.suspend();
  else ac.resume();
}

function env(g, t, attack, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
}

function tone({ type = 'sine', f0, f1 = f0, t = 0, dur = 0.2, vol = 0.3, attack = 0.005, filter = 0, vib = 0 }) {
  const now = ac.currentTime + t;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, now);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, now + attack + dur);
  const g = ac.createGain();
  env(g, now, attack, vol, dur);
  let node = o;
  if (filter) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    o.connect(f);
    node = f;
  }
  if (vib) {
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = vib;
    depth.gain.value = f0 * 0.03;
    lfo.connect(depth);
    depth.connect(o.frequency);
    lfo.start(now);
    lfo.stop(now + attack + dur + 0.05);
  }
  node.connect(g);
  g.connect(out);
  o.start(now);
  o.stop(now + attack + dur + 0.05);
}

function noise({ t = 0, dur = 0.1, vol = 0.3, type = 'bandpass', f = 1500, f1 = 0, q = 1 }) {
  const now = ac.currentTime + t;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const flt = ac.createBiquadFilter();
  flt.type = type;
  flt.frequency.setValueAtTime(f, now);
  if (f1) flt.frequency.exponentialRampToValueAtTime(f1, now + dur);
  flt.Q.value = q;
  const g = ac.createGain();
  env(g, now, 0.003, vol, dur);
  s.connect(flt);
  flt.connect(g);
  g.connect(out);
  s.start(now, Math.random() * 0.5);
  s.stop(now + dur + 0.05);
}

const on = (fn) => (...a) => {
  if (ac && out) fn(...a);
};

export const sfx = {
  pickup: on(() => tone({ f0: 520, f1: 800, dur: 0.09, vol: 0.16 })),
  pop: on(() => tone({ f0: 320, f1: 760, dur: 0.08, vol: 0.12 })),
  whoosh: on(() => noise({ dur: 0.32, vol: 0.12, f: 500, f1: 2200, q: 0.8 })),
  chomp: on(() => {
    noise({ dur: 0.07, vol: 0.55, f: 1900, q: 0.8 });
    noise({ t: 0.07, dur: 0.08, vol: 0.4, f: 1200, q: 0.9 });
    tone({ f0: 170, f1: 60, dur: 0.13, vol: 0.5 });
    for (let i = 0; i < 3; i++) noise({ t: 0.12 + i * 0.045, dur: 0.025, vol: 0.18, type: 'highpass', f: 3000 });
  }),
  nom: on((i = 0) => {
    tone({ type: 'triangle', f0: 230 - i * 15, f1: 160, dur: 0.1, vol: 0.16, filter: 900 });
    noise({ dur: 0.05, vol: 0.12, type: 'lowpass', f: 700 });
  }),
  // "mm-yum": two rising hums with a little wobble
  yum: on(() => {
    tone({ type: 'triangle', f0: 250, f1: 320, dur: 0.18, vol: 0.22, attack: 0.03, filter: 1300, vib: 7 });
    tone({ type: 'triangle', f0: 300, f1: 420, dur: 0.32, t: 0.22, vol: 0.24, attack: 0.03, filter: 1500, vib: 6 });
    tone({ f0: 600, f1: 840, dur: 0.3, t: 0.22, vol: 0.06, attack: 0.03 });
  }),
  giggle: on(() => {
    for (let i = 0; i < 5; i++) {
      const f = 720 + Math.sin(i * 1.7) * 120 + Math.random() * 60;
      tone({ type: 'triangle', f0: f, f1: f * 0.8, t: i * 0.085, dur: 0.065, vol: 0.16, filter: 2600, vib: 18 });
    }
  }),
  sparkle: on(() => {
    for (let i = 0; i < 3; i++) {
      const f = PENTA[3 + Math.floor(Math.random() * 5)];
      tone({ type: 'triangle', f0: f, t: i * 0.05, dur: 0.2, vol: 0.08 });
    }
  }),
  // one note higher for every fruit in the row of stars
  star: on((n) => {
    const f = PENTA[Math.min(PENTA.length - 1, n)];
    tone({ f0: f, dur: 0.4, vol: 0.18 });
    tone({ type: 'triangle', f0: f * 2, dur: 0.25, vol: 0.05 });
  }),
  hungry: on(() => {
    tone({ f0: 75, f1: 55, dur: 0.5, vol: 0.28, vib: 9 });
    tone({ type: 'triangle', f0: 260, f1: 390, t: 0.15, dur: 0.35, vol: 0.14, attack: 0.04, filter: 1200, vib: 5 });
  }),
  fanfare: on(() => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone({ type: 'triangle', f0: f, t: i * 0.12, dur: 0.22, vol: 0.18 });
    });
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone({ f0: f, t: 0.5, dur: 0.9, vol: 0.09, attack: 0.02 }));
    for (let i = 0; i < 6; i++) tone({ type: 'triangle', f0: PENTA[2 + (i % 6)], t: 0.6 + i * 0.07, dur: 0.15, vol: 0.06 });
  }),
  burp: on(() => {
    const now = ac.currentTime;
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(115, now);
    o.frequency.exponentialRampToValueAtTime(68, now + 0.45);
    const lfo = ac.createOscillator();
    const lg = ac.createGain();
    lfo.frequency.value = 28;
    lg.gain.value = 0.5;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 520;
    f.Q.value = 3;
    const g = ac.createGain();
    env(g, now, 0.02, 0.4, 0.45);
    const am = ac.createGain();
    am.gain.value = 0.5;
    lfo.connect(lg);
    lg.connect(am.gain);
    o.connect(f);
    f.connect(am);
    am.connect(g);
    g.connect(out);
    o.start(now);
    lfo.start(now);
    o.stop(now + 0.55);
    lfo.stop(now + 0.55);
  }),
  poof: on(() => {
    noise({ dur: 0.35, vol: 0.2, type: 'lowpass', f: 2400, f1: 300 });
    tone({ f0: 420, f1: 1100, dur: 0.22, vol: 0.12 });
  }),
};
