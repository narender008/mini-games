// Every sound in Bubble Sub is made here with the Web Audio API: there are no
// sound files. Browsers only allow sound after a touch, so the context is
// created by the first pointerdown (unlock), and the music starts then.
//
// Buses: the sub's engine (a hum and a bubbly burble that follow its speed),
// effects (horn, sonar ping, pearls, the animals' voices) and two music beds
// that crossfade with depth: a bouncy marimba tune on the sunny reef and a
// slow, dreamy music-box tune in the Glow Cave. Both tunes are original.
const KEY = 'bubble-sub:muted';
const MASTER = 0.9, MUSIC = 0.26;
const C4 = 261.63;
const st = s => C4 * 2 ** (s / 12);
// G major pentatonic-ish degrees, in semitones from C4
const SCALE = [-5, -3, -1, 2, 4, 7, 9, 11, 14, 16, 19, 21, 23, 26];
// Reef tune: eight bars of eighths, -1 rests (indices into SCALE)
const REEF = [
  [5, -1, 6, 5, 4, -1, 2, -1], [3, -1, 4, -1, 5, -1, -1, -1], [6, -1, 7, 6, 5, -1, 4, -1], [5, -1, 3, -1, 4, -1, -1, -1],
  [7, -1, 8, -1, 9, 8, 7, -1], [6, -1, 5, -1, 4, 5, 6, -1], [8, 7, 6, -1, 5, -1, 4, -1], [3, -1, 2, -1, 5, -1, -1, -1],
];
const REEF_CHORDS = [[-5, -1, 2], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2], [-3, 0, 4], [-8, -5, -1], [-7, -3, 0], [-5, -1, 2]];
// Cave tune: slower, two notes a bar, with a bell echo
const CAVE = [[9, -1, -1, -1, 7, -1, -1, -1], [8, -1, -1, -1, 5, -1, -1, -1], [6, -1, -1, -1, 7, -1, 8, -1], [5, -1, -1, -1, -1, -1, -1, -1]];
const EIGHTH = 60 / 104 / 2;

let ac = null, out = null, sfx = null, engineBus = null, reefBus = null, caveBus = null, noiseBuf = null, echo = null;
let muted = false, timer = 0, nextTime = 0, stepNo = 0, notes = 0, musicOn = false, depth = 0, partyOn = false;
let hum = null, humGain = null, burbleGain = null, burbleFilter = null, lastVoice = {};
try { muted = localStorage.getItem(KEY) === '1'; } catch {}

export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    out = ac.createGain(); out.gain.value = muted ? 0 : MASTER;
    out.connect(comp); comp.connect(ac.destination);
    sfx = ac.createGain(); sfx.gain.value = 1; sfx.connect(out);
    engineBus = ac.createGain(); engineBus.gain.value = 1; engineBus.connect(out);
    reefBus = ac.createGain(); reefBus.gain.value = MUSIC; reefBus.connect(out);
    caveBus = ac.createGain(); caveBus.gain.value = 0; caveBus.connect(out);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // a soft echo for the sonar ping and the cave bells
    echo = ac.createDelay(1); echo.delayTime.value = 0.32;
    const fb = ac.createGain(); fb.gain.value = 0.38; const ef = ac.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 2400;
    echo.connect(ef); ef.connect(fb); fb.connect(echo); ef.connect(out);
    startEngine();
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
export function state() { return { context: ac ? ac.state : 'none', music: musicOn, notes, muted, step: stepNo, depth }; }

// ---------- building blocks ----------
function env(g, t, attack, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
}
function osc(type, f, t, dur, vol, bus, { f1, attack = 0.005, filter, q = 0.7, ftype = 'lowpass', vib = 0, vibRate = 6 } = {}) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
  const g = ac.createGain(); env(g, t, attack, vol, dur);
  let node = o;
  if (filter) { const fl = ac.createBiquadFilter(); fl.type = ftype; fl.frequency.value = filter; fl.Q.value = q; o.connect(fl); node = fl; }
  if (vib) { const l = ac.createOscillator(), dg = ac.createGain(); l.frequency.value = vibRate; dg.gain.value = f * vib; l.connect(dg); dg.connect(o.frequency); l.start(t); l.stop(t + attack + dur + 0.05); }
  node.connect(g); g.connect(bus);
  o.start(t); o.stop(t + attack + dur + 0.05);
  return g;
}
function noise(t, dur, vol, bus, { type = 'bandpass', f = 2000, f1, q = 1, attack = 0.005 } = {}) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
  const g = ac.createGain(); env(g, t, attack, vol, dur);
  s.connect(fl); fl.connect(g); g.connect(bus);
  s.start(t, Math.random()); s.stop(t + attack + dur + 0.05);
}
const ok = () => ac && ac.state === 'running';
// Voices of the same kind don't stack up when a child taps very fast.
function gate(name, gap) { const t = ac.currentTime; if (t - (lastVoice[name] || -9) < gap) return false; lastVoice[name] = t; return true; }

// ---------- the sub's engine ----------
function startEngine() {
  const t = ac.currentTime;
  // low hum: two detuned sines through a gentle lowpass, wobbling slowly
  humGain = ac.createGain(); humGain.gain.value = 0.0001;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
  hum = [ac.createOscillator(), ac.createOscillator(), ac.createOscillator()];
  hum[0].type = 'sine'; hum[0].frequency.value = 58; hum[1].type = 'triangle'; hum[1].frequency.value = 87.5; hum[2].type = 'sine'; hum[2].frequency.value = 116.8;
  const wob = ac.createOscillator(), wd = ac.createGain(); wob.frequency.value = 7; wd.gain.value = 0.25; wob.connect(wd); wd.connect(humGain.gain);
  for (const o of hum) { o.connect(lp); o.start(t); }
  wob.start(t); lp.connect(humGain); humGain.connect(engineBus);
  // burble: bandpassed noise chopped by a fast LFO, like bubbles from the propeller
  const n = ac.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  burbleFilter = ac.createBiquadFilter(); burbleFilter.type = 'bandpass'; burbleFilter.frequency.value = 500; burbleFilter.Q.value = 2.5;
  burbleGain = ac.createGain(); burbleGain.gain.value = 0.0001;
  const chop = ac.createGain(); chop.gain.value = 0.5; const cl = ac.createOscillator(), cd = ac.createGain(); cl.type = 'square'; cl.frequency.value = 11; cd.gain.value = 0.5; cl.connect(cd); cd.connect(chop.gain);
  n.connect(burbleFilter); burbleFilter.connect(chop); chop.connect(burbleGain); burbleGain.connect(engineBus);
  n.start(t); cl.start(t);
}
// Called every frame with the sub's speed (0..1) and how dark the sea is.
export function engine(speed, dark, party = false) {
  if (!ok() || !hum) return;
  const t = ac.currentTime, k = Math.max(0, Math.min(1, speed));
  humGain.gain.setTargetAtTime(0.05 + k * 0.13, t, 0.15);
  for (let i = 0; i < 3; i++) hum[i].frequency.setTargetAtTime([58, 87.5, 116.8][i] * (1 + k * 0.45), t, 0.2);
  burbleGain.gain.setTargetAtTime(0.002 + k * 0.12, t, 0.12);
  burbleFilter.frequency.setTargetAtTime(380 + k * 900, t, 0.2);
  // music beds crossfade with depth
  depth = dark;
  const duckK = party ? 0.4 : 1;
  reefBus.gain.setTargetAtTime(MUSIC * (1 - dark) * duckK, t, 0.6);
  caveBus.gain.setTargetAtTime(MUSIC * 1.1 * dark * duckK, t, 0.6);
}

// ---------- music ----------
function marimba(f, t, vol, bus) {
  osc('sine', f, t, 0.5, vol, bus, { attack: 0.004 });
  osc('sine', f * 4, t, 0.07, vol * 0.3, bus, { attack: 0.002 });
  osc('triangle', f * 2, t, 0.16, vol * 0.14, bus, { attack: 0.003 });
}
function bell(f, t, vol, bus) {
  osc('sine', f, t, 1.6, vol, bus, { attack: 0.004 });
  osc('sine', f * 2.76, t, 0.6, vol * 0.25, bus, { attack: 0.002 });
  const g = osc('sine', f * 2, t, 0.9, vol * 0.2, bus, { attack: 0.003 }); g.connect(echo);
}
function scheduleStep(t) {
  const bar = Math.floor(stepNo / 8) % 8, e = stepNo % 8;
  // reef bed
  const ch = REEF_CHORDS[bar];
  if (e === 0) for (const s of ch) { osc('triangle', st(s), t, EIGHTH * 7.5, 0.045, reefBus, { attack: 0.3, filter: 900 }); }
  if (e === 0 || e === 4) { osc('sine', st(ch[0] - 12), t, 0.32, 0.16, reefBus, { attack: 0.01 }); osc('sine', 130, t, 0.1, 0.1, reefBus, { f1: 50 }); }
  if (e === 2 || e === 6) noise(t, 0.05, 0.03, reefBus, { type: 'highpass', f: 6500 });
  if (e % 2 === 1) osc('sine', 900 + (e * 97) % 400, t, 0.05, 0.03, reefBus, { f1: 1400 }); // little bubble ticks
  const d = REEF[bar][e];
  if (d >= 0) { marimba(st(SCALE[d]), t, 0.2, reefBus); notes++; }
  // cave bed
  const cb = bar % 4, cd = CAVE[cb][e];
  if (e === 0) { osc('sine', st(REEF_CHORDS[cb * 2][0] - 12), t, EIGHTH * 7.8, 0.08, caveBus, { attack: 0.6 }); for (const s of REEF_CHORDS[cb * 2]) osc('sine', st(s + 12), t, EIGHTH * 7.6, 0.025, caveBus, { attack: 0.8 }); }
  if (cd >= 0) bell(st(SCALE[cd] + 12), t, 0.09, caveBus);
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

// ---------- the sub ----------
export function horn() {
  if (!ok() || !gate('horn', 0.35)) return; const t = ac.currentTime;
  for (const [dt, f] of [[0, 392], [0.22, 494]]) {
    osc('sawtooth', f, t + dt, 0.17, 0.16, sfx, { attack: 0.02, filter: 1300, q: 2, vib: 0.012, vibRate: 7 });
    osc('square', f / 2, t + dt, 0.17, 0.05, sfx, { attack: 0.02, filter: 700 });
  }
}
export function ping() {
  if (!ok() || !gate('ping', 1.5)) return; const t = ac.currentTime;
  const g = osc('sine', 1180, t, 0.5, 0.12, sfx, { attack: 0.003 }); g.connect(echo);
}
export function steerBlip() {
  if (!ok() || !gate('steer', 0.12)) return; const t = ac.currentTime;
  osc('sine', 520, t, 0.09, 0.07, sfx, { f1: 780 });
  noise(t, 0.08, 0.05, sfx, { f: 1800, q: 3 });
}
export function bubblePop(x = 0.5) {
  if (!ok()) return; const t = ac.currentTime, f = 600 + x * 900 + Math.random() * 300;
  osc('sine', f, t, 0.06, 0.05, sfx, { f1: f * 1.8 });
}
export function pearl(n) {
  if (!ok()) return; const t = ac.currentTime, f = st(SCALE[5 + (n % 8)] + 12);
  osc('sine', f, t, 0.45, 0.16, sfx); osc('sine', f * 2.01, t + 0.04, 0.3, 0.06, sfx);
  noise(t, 0.08, 0.05, sfx, { f: 6000, q: 4 });
}
export function chest() {
  if (!ok()) return; const t = ac.currentTime;
  osc('sawtooth', 160, t, 0.25, 0.08, sfx, { filter: 600, f1: 110 }); // creak
  for (let i = 0; i < 9; i++) bell(st(SCALE[4 + i] + 12), t + 0.25 + i * 0.07, 0.06, sfx);
}
export function newFriend(count) {
  if (!ok()) return; const t = ac.currentTime + 0.25;
  for (let i = 0; i < 4; i++) osc('triangle', st(SCALE[3 + i * 2 + (count % 3)] + 12), t + i * 0.07, 0.25, 0.08, sfx, { filter: 4000 });
  noise(t, 0.3, 0.04, sfx, { type: 'highpass', f: 7000, attack: 0.05 });
}
export function party() {
  if (!ok()) return; const t = ac.currentTime; partyOn = true;
  [0, 4, 7, 12, 16, 19].forEach((s, i) => { osc('triangle', st(s), t + i * 0.11, 0.3, 0.14, sfx, { filter: 3000 }); osc('sine', st(s + 12), t + i * 0.11, 0.22, 0.05, sfx); });
  [0, 4, 7, 12].forEach(s => osc('triangle', st(s + 12), t + 0.7, 1.4, 0.1, sfx, { attack: 0.03, filter: 3500, vib: 0.006 }));
  for (let i = 0; i < 3; i++) noise(t + 0.3 + i * 0.05, 1.4, 0.07, sfx, { f: 1200 + i * 500, q: 2.5, attack: 0.25 });
  whale(true);
}
export function partyEnd() { partyOn = false; }

// ---------- the animals ----------
export function voice(kind) {
  if (!ok() || !gate(kind, 0.25)) return;
  const t = ac.currentTime, R = Math.random;
  switch (kind) {
    case 'clown': case 'fish': case 'angel': {      // bloop-bloop
      const f = 500 + R() * 200;
      osc('sine', f, t, 0.09, 0.16, sfx, { f1: f * 1.9 }); osc('sine', f * 1.2, t + 0.12, 0.09, 0.13, sfx, { f1: f * 2.3 });
      break;
    }
    case 'octopus': {                                 // a wobbly giggle
      const base = 560 + R() * 120;
      for (let i = 0; i < 5; i++) osc('triangle', base * (1 - i * 0.05), t + i * 0.1, 0.07, 0.13, sfx, { f1: base * 1.3, filter: 1700, ftype: 'bandpass', q: 1.3, attack: 0.01, vib: 0.07, vibRate: 26 });
      break;
    }
    case 'puffer':                                    // boing as it puffs up
      osc('sine', 140, t, 0.5, 0.25, sfx, { f1: 520, attack: 0.01, vib: 0.08, vibRate: 14 });
      osc('triangle', 280, t, 0.35, 0.06, sfx, { f1: 900, attack: 0.01 });
      break;
    case 'turtle':                                    // a slow happy "hmm-mm"
      osc('triangle', 196, t, 0.35, 0.14, sfx, { f1: 247, attack: 0.06, filter: 900, vib: 0.02 });
      osc('triangle', 247, t + 0.38, 0.4, 0.12, sfx, { f1: 220, attack: 0.05, filter: 900, vib: 0.02 });
      break;
    case 'crab':                                      // click-clack
      for (let i = 0; i < 4; i++) noise(t + i * 0.09, 0.03, 0.22, sfx, { type: 'bandpass', f: 2600 + (i % 2) * 900, q: 6, attack: 0.001 });
      break;
    case 'starfish': case 'seahorse':                 // twinkly whistle
      osc('sine', 1400, t, 0.18, 0.08, sfx, { f1: 2100, vib: 0.03 }); osc('sine', 1760, t + 0.2, 0.22, 0.07, sfx, { f1: 2400 });
      break;
    case 'jelly':                                     // soft chime
      bell(st(SCALE[7 + ((R() * 5) | 0)] + 12), t, 0.1, sfx); break;
    case 'dolphin': {                                 // chatter and whistle
      for (let i = 0; i < 6; i++) noise(t + i * 0.035, 0.02, 0.12, sfx, { f: 3500, q: 8, attack: 0.001 });
      osc('sine', 1800, t + 0.22, 0.32, 0.1, sfx, { f1: 3200, attack: 0.02, vib: 0.05, vibRate: 11 });
      break;
    }
    case 'shark':                                     // a silly friendly tuba "bom-bom-ba-dum"
      [110, 110, 147, 165].forEach((f, i) => osc('sawtooth', f, t + i * 0.13, 0.11, 0.12, sfx, { filter: 500, attack: 0.01 }));
      break;
    case 'manta':                                     // a soft whoosh
      noise(t, 0.6, 0.12, sfx, { type: 'bandpass', f: 400, f1: 1400, q: 1.5, attack: 0.2 }); break;
    case 'whale': whale(false); break;
  }
}
function whale(big) {
  const t = ac.currentTime;
  osc('sine', 150, t, 1.4, big ? 0.16 : 0.2, sfx, { f1: 260, attack: 0.25, vib: 0.02, vibRate: 3 });
  osc('triangle', 300, t + 0.1, 1.2, 0.05, sfx, { f1: 420, attack: 0.3, filter: 900 });
  osc('sine', 230, t + 1.3, 0.9, 0.14, sfx, { f1: 170, attack: 0.15, vib: 0.02, vibRate: 3 });
}
