// Every sound in the garden is made here with the Web Audio API: there are no
// sound files. Browsers only allow sound after a touch, so the context is made
// on the first pointerdown (unlock) and the music starts then: an original,
// bouncy music-box and pizzicato tune in C major over soft pads, on its own
// quieter bus so the effects sit on top. Each flower colour has its own bell
// note, so tickling the flowers plays a little tune.
const KEY = 'garden-grow:muted';
const MASTER = 0.9, MUSIC = 0.28;
const C4 = 261.63;
const SCALE = [0, 2, 4, 7, 9].flatMap((s) => [0, 1, 2, 3].map(o => s + 12 * o)).sort((a, b) => a - b).map(s => C4 * 2 ** (s / 12));
// degrees into SCALE (C4 D4 E4 G4 A4 C5 D5 E5 G5 A5 C6 ...), eighths, -1 rests
const TUNE = [
  [7, -1, 5, 7, 8, -1, 7, -1], [5, -1, 4, -1, 2, -1, -1, -1], [4, -1, 5, 4, 3, -1, 2, 3], [4, -1, -1, -1, 5, -1, -1, -1],
  [7, -1, 8, 9, 10, -1, 9, -1], [8, -1, 7, -1, 5, -1, 7, -1], [8, 7, 5, -1, 4, -1, 3, -1], [5, -1, -1, -1, -1, -1, 4, 3],
];
const CHORDS = [[261.63, 329.63, 392], [174.61, 220, 261.63], [220, 261.63, 329.63], [196, 246.94, 293.66], [261.63, 329.63, 392], [174.61, 220, 261.63], [196, 246.94, 293.66], [261.63, 329.63, 392]];
const ROOTS = [130.81, 87.31, 110, 98, 130.81, 87.31, 98, 130.81];
const EIGHTH = 60 / 104 / 2;
export const COLOR_NOTE = { pink: 5, red: 6, purple: 7, orange: 8, blue: 9, yellow: 10, white: 11 };

let ac = null, out = null, musicBus = null, sfxBus = null, noiseBuf = null;
let muted = false, timer = 0, nextTime = 0, stepNo = 0, notes = 0, musicOn = false, lastGiggle = -9, sfxCount = 0;
try { muted = localStorage.getItem(KEY) === '1'; } catch {}

export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    out = ac.createGain(); out.gain.value = muted ? 0 : MASTER;
    musicBus = ac.createGain(); musicBus.gain.value = MUSIC; musicBus.connect(out);
    sfxBus = ac.createGain(); sfxBus.gain.value = 1; sfxBus.connect(out);
    out.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
  startMusic();
}
export const audioContext = () => ac;
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch {}
  if (out) out.gain.setTargetAtTime(m ? 0 : MASTER, ac.currentTime, 0.03);
}
export function suspend(yes) { if (!ac) return; if (yes) ac.suspend(); else ac.resume(); }
export function state() { return { context: ac ? ac.state : 'none', music: musicOn, notes, muted, step: stepNo, sfx: sfxCount }; }

// ---------- building blocks ----------
function env(g, t, attack, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
}
function osc(type, f, t, dur, vol, bus, { f1, attack = 0.005, filter, q = 0.7, ftype = 'lowpass' } = {}) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
  const g = ac.createGain(); env(g, t, attack, vol, dur);
  let node = o;
  if (filter) { const fl = ac.createBiquadFilter(); fl.type = ftype; fl.frequency.value = filter; fl.Q.value = q; o.connect(fl); node = fl; }
  node.connect(g); g.connect(bus);
  o.start(t); o.stop(t + attack + dur + 0.05);
  return o;
}
function noise(t, dur, vol, bus, { type = 'bandpass', f = 2000, f1, q = 1, attack = 0.005 } = {}) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain(); env(g, t, attack, vol, dur);
  s.connect(fl); fl.connect(g); g.connect(bus);
  s.start(t, Math.random() * 0.5); s.stop(t + attack + dur + 0.05);
}

// ---------- music ----------
function box(f, t, vol) { // music box: a bright sine with a glassy overtone
  osc('sine', f * 2, t, 0.7, vol, musicBus, { attack: 0.003 });
  osc('sine', f * 8.1, t, 0.09, vol * 0.25, musicBus, { attack: 0.002 });
  osc('triangle', f * 4, t, 0.2, vol * 0.12, musicBus, { attack: 0.003 });
  notes++;
}
function pluck(f, t, vol) { osc('triangle', f, t, 0.18, vol, musicBus, { attack: 0.004, filter: 1400 }); }
function pad(chord, t, dur) { for (const f of chord) { osc('triangle', f, t, dur, 0.045, musicBus, { attack: 0.4, filter: 800 }); osc('sine', f * 1.004, t, dur, 0.028, musicBus, { attack: 0.45 }); } }
function scheduleStep(t) {
  const bar = Math.floor(stepNo / 8) % 8, e = stepNo % 8;
  if (e === 0) pad(CHORDS[bar], t, EIGHTH * 7.6);
  if (e === 0 || e === 4) { osc('sine', ROOTS[bar], t, 0.32, 0.15, musicBus, { attack: 0.01 }); osc('sine', 120, t, 0.1, 0.12, musicBus, { f1: 50 }); }
  if (e === 2 || e === 6) { for (const f of CHORDS[bar]) pluck(f, t, 0.035); noise(t, 0.05, 0.03, musicBus, { type: 'bandpass', f: 2600, q: 2 }); }
  noise(t, 0.03, e % 2 ? 0.035 : 0.02, musicBus, { type: 'highpass', f: 8000 });
  const d = TUNE[bar][e];
  if (d >= 0) box(SCALE[d], t, 0.16);
  stepNo++;
}
function tick() {
  if (!ac || ac.state !== 'running') return;
  if (nextTime < ac.currentTime - 0.2) nextTime = ac.currentTime + 0.05;
  while (nextTime < ac.currentTime + 0.3) { scheduleStep(nextTime); nextTime += EIGHTH; }
}
function startMusic() {
  if (musicOn || !ac) return;
  musicOn = true; nextTime = ac.currentTime + 0.1;
  timer = setInterval(tick, 60); tick();
}
export function duck(on) { if (musicBus) musicBus.gain.setTargetAtTime(on ? MUSIC * 0.45 : MUSIC, ac.currentTime, 0.2); }

// ---------- effects ----------
const ok = () => { if (ac && ac.state === 'running') { sfxCount++; return true; } return false; };
const now = () => ac.currentTime;
export function pop() { if (!ok()) return; const t = now(); osc('sine', 640, t, 0.12, 0.32, sfxBus, { f1: 220 }); noise(t, 0.05, 0.14, sfxBus, { f: 3000 }); }
export function plop() { if (!ok()) return; const t = now(); osc('sine', 300, t, 0.1, 0.3, sfxBus, { f1: 120 }); noise(t, 0.08, 0.12, sfxBus, { type: 'lowpass', f: 900 }); }
export function sprout() { if (!ok()) return; const t = now(); osc('sine', 260, t, 0.28, 0.24, sfxBus, { f1: 900, attack: 0.02 }); osc('triangle', 520, t + 0.05, 0.22, 0.06, sfxBus, { f1: 1500 }); }
export function boing() { if (!ok()) return; const t = now(); const o = osc('triangle', 180, t, 0.45, 0.28, sfxBus, { f1: 420, filter: 1800 }); const l = ac.createOscillator(), dg = ac.createGain(); l.frequency.value = 14; dg.gain.value = 50; l.connect(dg); dg.connect(o.frequency); l.start(t); l.stop(t + 0.5); }
export function pour(dur = 0.8) { if (!ok()) return; const t = now(); noise(t, dur, 0.16, sfxBus, { type: 'bandpass', f: 1800, f1: 1200, q: 0.8, attack: 0.08 }); for (let i = 0; i < 5; i++) osc('sine', 900 + Math.random() * 900, t + 0.1 + i * dur / 6, 0.05, 0.05, sfxBus, { f1: 1800 }); }
export function grow() { if (!ok()) return; const t = now(); [0, 2, 4].forEach((d, i) => osc('sine', SCALE[5 + d], t + i * 0.07, 0.25, 0.1, sfxBus)); }
export function bloom(color) {
  if (!ok()) return; const t = now(), base = COLOR_NOTE[color] ?? 7;
  noise(t, 0.12, 0.16, sfxBus, { type: 'lowpass', f: 2000, f1: 500 });
  osc('sine', 200, t, 0.14, 0.3, sfxBus, { f1: 520 });
  for (let i = 0; i < 5; i++) { const f = SCALE[Math.min(SCALE.length - 1, base - 2 + i * 2)]; osc('sine', f, t + 0.06 + i * 0.06, 0.5, 0.09, sfxBus); osc('sine', f * 2.76, t + 0.06 + i * 0.06, 0.15, 0.025, sfxBus); }
}
export function bell(color, oct = 1) { if (!ok()) return; const t = now(), f = SCALE[COLOR_NOTE[color] ?? 7] * oct; osc('sine', f, t, 0.9, 0.17, sfxBus); osc('sine', f * 2.76, t, 0.25, 0.05, sfxBus); osc('sine', f * 5.4, t, 0.08, 0.02, sfxBus); }
export function giggle(force = false) {
  if (!ok()) return; const t = now();
  if (!force && t - lastGiggle < 0.9) return; lastGiggle = t;
  const base = 600 + Math.random() * 180;
  for (let i = 0; i < 4; i++) {
    const st = t + i * 0.1, f = base * (1 - i * 0.06);
    const o = osc('triangle', f, st, 0.07, 0.13, sfxBus, { f1: f * 1.25, filter: 1600, ftype: 'bandpass', q: 1.2, attack: 0.01 });
    const lfo = ac.createOscillator(), dep = ac.createGain(); lfo.frequency.value = 28; dep.gain.value = f * 0.06; lfo.connect(dep); dep.connect(o.frequency); lfo.start(st); lfo.stop(st + 0.12);
  }
}
export function buzz() { if (!ok()) return; const t = now(); const o = osc('sawtooth', 190, t, 0.6, 0.07, sfxBus, { filter: 900, attack: 0.04 }); const l = ac.createOscillator(), dg = ac.createGain(); l.frequency.value = 9; dg.gain.value = 25; l.connect(dg); dg.connect(o.frequency); l.start(t); l.stop(t + 0.7); }
export function flutter() { if (!ok()) return; const t = now(); for (let i = 0; i < 6; i++) noise(t + i * 0.06, 0.04, 0.06, sfxBus, { f: 2400, q: 2 }); [9, 11, 12].forEach((d, i) => osc('sine', SCALE[d], t + 0.1 + i * 0.08, 0.3, 0.06, sfxBus)); }
export function chirp(loud = false) { if (!ok()) return; const t = now(), n = loud ? 4 : 2 + (Math.random() * 2 | 0); for (let i = 0; i < n; i++) { const f = 2200 + Math.random() * 900; osc('sine', f, t + i * 0.12, 0.07, loud ? 0.11 : 0.07, sfxBus, { f1: f * 1.4, attack: 0.005 }); osc('sine', f * 1.3, t + i * 0.12 + 0.05, 0.05, loud ? 0.07 : 0.05, sfxBus, { f1: f * 0.9 }); } }
export function ribbit() { if (!ok()) return; const t = now(); for (let i = 0; i < 2; i++) { const o = osc('square', 150, t + i * 0.16, 0.12, 0.08, sfxBus, { filter: 700, f1: 120 }); const l = ac.createOscillator(), dg = ac.createGain(); l.frequency.value = 40; dg.gain.value = 30; l.connect(dg); dg.connect(o.frequency); l.start(t + i * 0.16); l.stop(t + i * 0.16 + 0.15); } }
export function splash() { if (!ok()) return; const t = now(); noise(t, 0.35, 0.3, sfxBus, { type: 'lowpass', f: 2500, f1: 500 }); for (let i = 0; i < 5; i++) osc('sine', 800 + Math.random() * 1000, t + 0.05 + i * 0.05, 0.06, 0.08, sfxBus, { f1: 1600 }); }
export function bubblePop() { if (!ok()) return; const t = now(), f = 700 + Math.random() * 500; osc('sine', f, t, 0.08, 0.22, sfxBus, { f1: f * 2.2 }); }
export function thud() { if (!ok()) return; const t = now(); osc('sine', 140, t, 0.15, 0.3, sfxBus, { f1: 60 }); noise(t, 0.06, 0.12, sfxBus, { type: 'lowpass', f: 600 }); }
export function squeak() { if (!ok()) return; const t = now(); osc('sine', 900, t, 0.12, 0.12, sfxBus, { f1: 1400 }); osc('sine', 1400, t + 0.12, 0.1, 0.08, sfxBus, { f1: 900 }); }
export function sunGiggle() { giggle(true); if (!ok()) return; const t = now(); [0, 4, 7, 12].forEach((s, i) => osc('sine', C4 * 2 * 2 ** (s / 12), t + 0.05 + i * 0.07, 0.4, 0.07, sfxBus)); }
export function twinkle(x = 0.5) { if (!ok()) return; const t = now(), d = 8 + Math.round(x * 6); osc('sine', SCALE[d], t, 0.6, 0.09, sfxBus); osc('sine', SCALE[d] * 2, t + 0.08, 0.4, 0.04, sfxBus); }
export function rain() { if (!ok()) return; const t = now(); noise(t, 3.0, 0.12, sfxBus, { type: 'highpass', f: 3000, attack: 0.5 }); for (let i = 0; i < 24; i++) osc('sine', 1200 + Math.random() * 1600, t + 0.3 + Math.random() * 2.6, 0.04, 0.04, sfxBus, { f1: 2400 }); }
export function rainbow() { if (!ok()) return; const t = now(); for (let i = 0; i < 10; i++) osc('sine', SCALE[4 + i], t + i * 0.06, 0.6, 0.06, sfxBus); }
export function whoosh() { if (!ok()) return; const t = now(); noise(t, 0.5, 0.14, sfxBus, { f: 500, f1: 2400, q: 1.2, attack: 0.15 }); }
export function gift() { if (!ok()) return; const t = now(); [0, 4, 7, 12, 16].forEach((s, i) => osc('triangle', C4 * 2 * 2 ** (s / 12), t + i * 0.08, 0.35, 0.1, sfxBus, { filter: 3000 })); whoosh(); }
export function fanfare() {
  if (!ok()) return; const t = now();
  [0, 4, 7, 12, 16].forEach((s, i) => { const f = C4 * 2 ** (s / 12); osc('triangle', f, t + i * 0.12, 0.3, 0.15, sfxBus, { filter: 3000 }); osc('sine', f * 2, t + i * 0.12, 0.25, 0.06, sfxBus); });
  [0, 4, 7].forEach(s => osc('triangle', C4 * 2 * 2 ** (s / 12), t + 0.65, 1.1, 0.11, sfxBus, { attack: 0.02, filter: 3500 }));
  for (let i = 0; i < 3; i++) noise(t + 0.3 + i * 0.05, 1.3, 0.08, sfxBus, { f: 1200 + i * 500, q: 2.5, attack: 0.25 });
}
export function firework() { if (!ok()) return; const t = now(); osc('sine', 300, t, 0.25, 0.07, sfxBus, { f1: 1200, attack: 0.02 }); noise(t + 0.25, 0.35, 0.3, sfxBus, { type: 'lowpass', f: 3000, f1: 300 }); for (let i = 0; i < 6; i++) noise(t + 0.3 + Math.random() * 0.4, 0.03, 0.1, sfxBus, { type: 'highpass', f: 5000 }); }
export function puff() { if (!ok()) return; const t = now(); noise(t, 0.6, 0.18, sfxBus, { f: 3000, f1: 800, q: 0.7, attack: 0.05 }); for (let i = 0; i < 6; i++) osc('sine', SCALE[14 - i], t + i * 0.07, 0.4, 0.05, sfxBus); }
