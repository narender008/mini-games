// Every sound is synthesised with Web Audio; there are no sound files. The
// palette is soft and warm: sine and triangle tones through a low-pass,
// pentatonic notes, filtered noise for brush swishes, water and page turns.
// The context starts on the first touch, and is suspended with the tab.
const KEY = 'magic-brush:muted';
const VOL = 0.55;
const PENTA = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

let ac = null, out = null, noise = null, muted = false, brush = null;
try { muted = localStorage.getItem(KEY) === '1'; } catch {}
if (new URLSearchParams(location.search).has('mute')) muted = true;

export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch { return; }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    out = ac.createGain(); out.gain.value = muted ? 0 : VOL;
    out.connect(lp); lp.connect(comp); comp.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
}
export const audioContext = () => ac;
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch {}
  if (out) out.gain.setTargetAtTime(m ? 0 : VOL, ac.currentTime, 0.03);
}
export function suspend(yes) { if (!ac) return; if (yes) ac.suspend().catch(() => {}); else ac.resume().catch(() => {}); }
const ok = () => ac && !muted && ac.state === 'running';

function tone({ type = 'sine', f0, f1 = f0, t = 0, dur = 0.2, vol = 0.25, attack = 0.008, lp = 0, vib = 0, vibDepth = 0.03 }) {
  const now = ac.currentTime + t;
  const o = ac.createOscillator(); o.type = type;
  f0 = Math.min(f0, 6000); f1 = Math.min(f1, 6000);
  o.frequency.setValueAtTime(f0, now);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + attack + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + dur);
  let node = o;
  if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
  if (vib) { const l = ac.createOscillator(), dg = ac.createGain(); l.frequency.value = vib; dg.gain.value = f0 * vibDepth; l.connect(dg); dg.connect(o.frequency); l.start(now); l.stop(now + attack + dur + 0.05); }
  node.connect(g); g.connect(out);
  o.start(now); o.stop(now + attack + dur + 0.05);
}
function hiss({ t = 0, dur = 0.3, vol = 0.12, f0 = 1200, f1 = f0, q = 0.8, type = 'bandpass', attack = 0.02 }) {
  const now = ac.currentTime + t;
  const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, now); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), now + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vol, now + attack); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(now, Math.random()); s.stop(now + dur + 0.05);
}

export const sfx = {
  tap() { if (!ok()) return; tone({ f0: 520, f1: 780, dur: 0.09, vol: 0.18, type: 'triangle', lp: 2500 }); },
  soft() { if (!ok()) return; tone({ f0: 440, f1: 560, dur: 0.08, vol: 0.12, type: 'sine' }); },
  pot(i) { if (!ok()) return; const f = PENTA[(i % 10) + 2]; tone({ f0: f, dur: 0.16, vol: 0.2, type: 'triangle', lp: 3000 }); tone({ f0: f * 2, t: 0.04, dur: 0.12, vol: 0.06 }); hiss({ dur: 0.12, vol: 0.05, f0: 900, f1: 400, q: 2 }); },
  undo() { if (!ok()) return; tone({ f0: 660, f1: 330, dur: 0.18, vol: 0.16, type: 'triangle', lp: 2000 }); },
  nope() { if (!ok()) return; tone({ f0: 300, dur: 0.1, vol: 0.12, type: 'triangle' }); tone({ f0: 300, t: 0.14, dur: 0.1, vol: 0.12, type: 'triangle' }); },
  star(n) { if (!ok()) return; const base = 5 + n; [0, 2, 4].forEach((k, i) => tone({ f0: PENTA[Math.min(12, base + k - 2)], t: i * 0.07, dur: 0.35, vol: 0.13, type: 'sine' })); },
  hint() { if (!ok()) return; [7, 9, 7].forEach((k, i) => tone({ f0: PENTA[k], t: i * 0.11, dur: 0.16, vol: 0.12, type: 'sine', vib: 8 })); hiss({ dur: 0.4, vol: 0.04, f0: 4000, f1: 6000, q: 3 }); },
  magic() {
    if (!ok()) return;
    for (let i = 0; i < 12; i++) tone({ f0: PENTA[i % 13], t: i * 0.075, dur: 0.5, vol: 0.09, type: 'sine', vib: 5 });
    hiss({ dur: 1.2, vol: 0.07, f0: 2000, f1: 6000, q: 1.5, attack: 0.3 });
  },
  whoosh(up = true) { if (!ok()) return; hiss({ dur: 0.45, vol: 0.1, f0: up ? 400 : 2400, f1: up ? 2400 : 400, q: 1.2, attack: 0.12 }); },
  pop(p = 1) { if (!ok()) return; tone({ f0: 900 * p, f1: 300 * p, dur: 0.07, vol: 0.14, type: 'sine' }); },
  bubble() { if (!ok()) return; const p = 0.8 + Math.random() * 0.6; tone({ f0: 700 * p, f1: 1500 * p, dur: 0.06, vol: 0.13 }); },
  boing() { if (!ok()) return; tone({ f0: 180, f1: 420, dur: 0.18, vol: 0.18, type: 'triangle', vib: 18, vibDepth: 0.08, lp: 1500 }); },
  thud() { if (!ok()) return; tone({ f0: 140, f1: 70, dur: 0.12, vol: 0.2, type: 'sine' }); },
  munch() { if (!ok()) return; for (let i = 0; i < 3; i++) hiss({ t: i * 0.13, dur: 0.08, vol: 0.12, f0: 1800, f1: 900, q: 1.5, attack: 0.005 }); },
  heart() { if (!ok()) return; tone({ f0: PENTA[7], dur: 0.25, vol: 0.09, vib: 6 }); tone({ f0: PENTA[9], t: 0.08, dur: 0.3, vol: 0.08, vib: 6 }); },
  splash() { if (!ok()) return; hiss({ dur: 0.5, vol: 0.14, f0: 2500, f1: 500, q: 0.7, type: 'lowpass', attack: 0.01 }); tone({ f0: 300, f1: 900, dur: 0.1, vol: 0.06 }); },
  page() { if (!ok()) return; hiss({ dur: 0.35, vol: 0.09, f0: 3000, f1: 1200, q: 0.9, attack: 0.05 }); },
  sparkle() { if (!ok()) return; for (let i = 0; i < 4; i++) tone({ f0: PENTA[8 + (i % 5)], t: i * 0.05, dur: 0.2, vol: 0.06 }); },
  fanfare() { if (!ok()) return; [[4, 0], [6, 0.12], [8, 0.24], [10, 0.38]].forEach(([k, t]) => { tone({ f0: PENTA[k], t, dur: 0.32, vol: 0.12, type: 'triangle', lp: 3000 }); tone({ f0: PENTA[k] / 2, t, dur: 0.3, vol: 0.06 }); }); },
  // a friend's little voice: chirpy "hee-hee" around its own pitch
  giggle(v = 1) {
    if (!ok()) return;
    for (let i = 0; i < 4; i++) { const f = 420 * v * (1.25 - i * 0.07); tone({ f0: f * 1.15, f1: f, t: i * 0.1, dur: 0.07, vol: 0.12, type: 'triangle', lp: 2600, vib: 30, vibDepth: 0.05 }); }
  },
  happy(v = 1) { if (!ok()) return; tone({ f0: 380 * v, f1: 560 * v, dur: 0.16, vol: 0.13, type: 'triangle', lp: 2400 }); tone({ f0: 560 * v, f1: 760 * v, t: 0.15, dur: 0.18, vol: 0.12, type: 'triangle', lp: 2400 }); },
  yawn(v = 1) { if (!ok()) return; tone({ f0: 300 * v, f1: 200 * v, dur: 0.6, vol: 0.08, type: 'triangle', lp: 900, attack: 0.15 }); },
  trick(v = 1) { if (!ok()) return; tone({ f0: 300 * v, f1: 900 * v, dur: 0.3, vol: 0.12, type: 'triangle', lp: 2500 }); for (let i = 0; i < 3; i++) tone({ f0: PENTA[9 + i], t: 0.2 + i * 0.07, dur: 0.2, vol: 0.06 }); },
  // the brush swish: a soft noise that follows how fast the brush moves
  brush(speed) {
    if (!ac || muted || ac.state !== 'running') { if (brush) brush.g.gain.value = 0; return; }
    if (!brush) {
      const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.value = 900;
      const g = ac.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(out); s.start();
      brush = { s, f, g };
    }
    const v = Math.min(1, speed / 1600);
    brush.g.gain.setTargetAtTime(v * 0.09, ac.currentTime, 0.04);
    brush.f.frequency.setTargetAtTime(600 + v * 900, ac.currentTime, 0.05);
  },
};
