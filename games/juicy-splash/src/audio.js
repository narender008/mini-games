// Every sound is made here with the Web Audio API: there are no sound files.
// Browsers only allow sound after a touch, so the context is created by the
// first pointerdown (unlock), and the background music starts then. The
// music is an original bouncy marimba tune over soft pads, scheduled a
// little ahead of time on its own quieter bus so effects sit on top.
const KEY = 'juicy-splash:muted';
const MASTER = 0.9, MUSIC = 0.3;
const C4 = 261.63;
const PENTA = [0, 2, 4, 7, 9].flatMap((s, i, a) => [0, 1, 2].map(o => s + 12 * o)).sort((a, b) => a - b).map(s => C4 * 2 ** (s / 12));
// degrees into PENTA (C4 D4 E4 G4 A4 C5 D5 E5 G5 A5 ...), one bar of eighths per row
const TUNE = [
  [5, -1, 7, -1, 6, 5, -1, -1], [4, -1, 5, -1, 7, -1, -1, -1], [5, -1, 4, -1, 3, 4, -1, -1], [6, -1, -1, 5, 6, -1, 7, -1],
  [7, -1, 8, -1, 7, 5, -1, -1], [4, 5, 7, -1, 9, -1, 7, -1], [8, -1, 7, -1, 5, -1, 4, -1], [3, -1, 4, -1, 5, -1, -1, -1],
];
const CHORDS = [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]];
const ROOTS = [130.81, 110, 87.31, 98];
const EIGHTH = 60 / 100 / 2;

let ac = null, out = null, musicBus = null, sfxBus = null, noiseBuf = null;
let muted = false, timer = 0, nextTime = 0, stepNo = 0, notes = 0, musicOn = false, lastGiggle = -9;
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
export function state() { return { context: ac ? ac.state : 'none', music: musicOn, notes, muted, step: stepNo }; }

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
function marimba(f, t, vol) {
  osc('sine', f, t, 0.55, vol, musicBus, { attack: 0.004 });
  osc('sine', f * 4, t, 0.08, vol * 0.35, musicBus, { attack: 0.002 });
  osc('triangle', f * 2, t, 0.18, vol * 0.15, musicBus, { attack: 0.003 });
  notes++;
}
function pad(chord, t, dur) { for (const f of chord) { osc('triangle', f, t, dur, 0.05, musicBus, { attack: 0.35, filter: 900 }); osc('sine', f * 1.003, t, dur, 0.03, musicBus, { attack: 0.4 }); } }
function scheduleStep(t) {
  const bar = Math.floor(stepNo / 8) % 8, e = stepNo % 8, chord = bar % 4;
  if (e === 0) { pad(CHORDS[chord], t, EIGHTH * 7.5); }
  if (e === 0 || e === 4) { osc('sine', ROOTS[chord], t, 0.35, 0.16, musicBus, { attack: 0.01 }); osc('triangle', ROOTS[chord] * 2, t, 0.2, 0.04, musicBus); osc('sine', 140, t, 0.12, 0.14, musicBus, { f1: 50 }); }
  if (e === 7) osc('sine', ROOTS[chord] * 1.5, t, 0.2, 0.08, musicBus, { attack: 0.01 });
  noise(t, 0.04, e % 2 ? 0.05 : 0.025, musicBus, { type: 'highpass', f: 7000 });
  const d = TUNE[bar][e];
  if (d >= 0) marimba(PENTA[d], t, 0.22);
  // a twinkle now and then on the last bar of each half
  if ((bar === 3 || bar === 7) && e === 6) osc('sine', PENTA[12], t, 0.9, 0.04, musicBus, { attack: 0.01 });
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
// soften the music under the celebration fanfare
export function duck(on) { if (musicBus) musicBus.gain.setTargetAtTime(on ? MUSIC * 0.45 : MUSIC, ac.currentTime, 0.2); }

// ---------- effects ----------
const ok = () => ac && ac.state === 'running';
export function swish(speed = 1) {
  if (!ok()) return; const t = ac.currentTime;
  noise(t, 0.16, 0.22 * Math.min(1.3, speed), sfxBus, { f: 900, f1: 3800, q: 1.4, attack: 0.02 });
}
export function splat(size = 1, sparkle = false) {
  if (!ok()) return; const t = ac.currentTime;
  noise(t, 0.18, 0.5, sfxBus, { type: 'lowpass', f: 1800, f1: 400, attack: 0.003 });
  osc('sine', 190 / size, t, 0.16, 0.5, sfxBus, { f1: 60 });
  for (let i = 0; i < 4; i++) osc('sine', 700 + Math.random() * 900, t + 0.05 + i * 0.045, 0.06, 0.12, sfxBus, { f1: 1500 + Math.random() * 800 });
  if (sparkle) for (let i = 0; i < 6; i++) osc('sine', PENTA[8 + i], t + 0.08 + i * 0.06, 0.35, 0.08, sfxBus);
}
export function pop() {
  if (!ok()) return; const t = ac.currentTime;
  osc('sine', 620, t, 0.12, 0.35, sfxBus, { f1: 220 });
  noise(t, 0.05, 0.15, sfxBus, { f: 3000 });
}
export function giggle(force = false) {
  if (!ok()) return; const t = ac.currentTime;
  if (!force && t - lastGiggle < 1.4) return; lastGiggle = t;
  const base = 620 + Math.random() * 140;
  for (let i = 0; i < 4; i++) {
    const st = t + i * 0.11, f = base * (1 - i * 0.06);
    const o = osc('triangle', f, st, 0.08, 0.16, sfxBus, { f1: f * 1.25, filter: 1600, ftype: 'bandpass', q: 1.2, attack: 0.01 });
    const lfo = ac.createOscillator(), dep = ac.createGain(); lfo.frequency.value = 28; dep.gain.value = f * 0.06; lfo.connect(dep); dep.connect(o.frequency); lfo.start(st); lfo.stop(st + 0.12);
  }
}
export function plink(n) {
  if (!ok()) return; const t = ac.currentTime, f = PENTA[Math.min(PENTA.length - 1, 4 + n)];
  osc('sine', f, t, 0.5, 0.18, sfxBus); osc('sine', f * 2.76, t, 0.2, 0.05, sfxBus);
  noise(t, 0.08, 0.06, sfxBus, { f: 5000, q: 3 });
}
export function launch() {
  if (!ok()) return; const t = ac.currentTime;
  osc('sine', 180, t, 0.22, 0.08, sfxBus, { f1: 420, attack: 0.03 });
}
export function boop(x = 0.5) {
  if (!ok()) return; const t = ac.currentTime;
  osc('sine', 400 + x * 400, t, 0.1, 0.1, sfxBus, { f1: 300 + x * 300 });
}
export function fanfare() {
  if (!ok()) return; const t = ac.currentTime;
  [0, 4, 7, 12, 16].forEach((s, i) => { const f = C4 * 2 ** (s / 12); osc('triangle', f, t + i * 0.12, 0.3, 0.16, sfxBus, { filter: 3000 }); osc('sine', f * 2, t + i * 0.12, 0.25, 0.06, sfxBus); });
  [0, 4, 7].forEach(s => osc('triangle', C4 * 2 * 2 ** (s / 12), t + 0.65, 1.1, 0.12, sfxBus, { attack: 0.02, filter: 3500 }));
  cheer(t + 0.3);
}
function cheer(t) {
  // a crowd of tiny voices: band noise swelling with a fast wobble
  for (let i = 0; i < 3; i++) noise(t + i * 0.05, 1.3, 0.09, sfxBus, { f: 1200 + i * 500, q: 2.5, attack: 0.25 });
  for (let i = 0; i < 7; i++) { const st = t + 0.1 + Math.random() * 0.9, f = 500 + Math.random() * 500; osc('triangle', f, st, 0.2, 0.06, sfxBus, { f1: f * 1.4, filter: 1800, ftype: 'bandpass' }); }
}
export function firework() {
  if (!ok()) return; const t = ac.currentTime;
  osc('sine', 300, t, 0.25, 0.08, sfxBus, { f1: 1200, attack: 0.02 });
  noise(t + 0.25, 0.35, 0.35, sfxBus, { type: 'lowpass', f: 3000, f1: 300 });
  for (let i = 0; i < 6; i++) noise(t + 0.3 + Math.random() * 0.4, 0.03, 0.12, sfxBus, { type: 'highpass', f: 5000 });
}
export function slurp() {
  if (!ok()) return; const t = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 6; fl.frequency.setValueAtTime(1400, t); fl.frequency.exponentialRampToValueAtTime(350, t + 1.0);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.1); g.gain.setValueAtTime(0.4, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  const lfo = ac.createOscillator(), dep = ac.createGain(); lfo.frequency.value = 9; dep.gain.value = 0.25; lfo.connect(dep); dep.connect(g.gain);
  s.connect(fl); fl.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + 1.2); lfo.start(t); lfo.stop(t + 1.2);
  osc('sine', 300, t + 1.15, 0.15, 0.2, sfxBus, { f1: 900 });   // "ahh" pop at the end
}
