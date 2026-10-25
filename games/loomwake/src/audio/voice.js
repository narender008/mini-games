// Dialogue voices: "Animal Crossing / Hades whisper" blips. A line is spoken
// by ONE oscillator, two formant filters and a breath-noise source whose pitch,
// vowel and level are automated syllable by syllable, so a whole line costs
// about eight nodes. Each character has a timbre, register, pace and pitch
// contour; the same word always gets the same pitch (letters are hashed), so a
// character's way of saying "little thread" becomes recognisable.
import { mtof, clamp, driveCurve } from './core.js';
import { LEVELS } from './levels.js';

// base: MIDI centre; range: semitones of melody; rate: letters per second;
// wave; lp: brightness; breath: noise mix; fm: [ratio, index] metallic shimmer;
// oct: add an octave voice; ring: ring-mod rate (Sable's black thread);
// drop: how far a sentence falls; wob: random pitch wobble; vib: [rate, cents]
export const VOICES = {
  iri:       { base: 64, range: 6, rate: 16, wave: 'triangle', lp: 3200, breath: 0.05, drop: 2, gain: 1 },
  orrin:     { base: 50, range: 4, rate: 12, wave: 'sawtooth', lp: 1500, breath: 0.32, drop: 3, gain: 0.9, vib: [4, 12] },
  thimbleby: { base: 66, range: 8, rate: 19, wave: 'square', lp: 2600, breath: 0.02, fm: [3.5, 0.6], drop: 1, gain: 0.7 },
  pell:      { base: 57, range: 7, rate: 15, wave: 'sawtooth', lp: 2000, breath: 0.1, glide: 0.05, drop: 2, gain: 0.85 },
  nell:      { base: 71, range: 4, rate: 13, wave: 'sine', lp: 4000, breath: 0.35, fade: 0.25, drop: 2, gain: 1.1 },
  weaver:    { base: 45, range: 3, rate: 7, wave: 'sine', lp: 1800, breath: 0.4, oct: true, drop: 2, gain: 1.1, vib: [3, 18] },
  sable:     { base: 45, range: 3, rate: 11, wave: 'sawtooth', lp: 1100, breath: 0.16, ring: 31, drop: 3, gain: 0.95 },
  veyl:      { base: 70, range: 5, rate: 12, wave: 'sine', lp: 5000, breath: 0.06, fm: [3.01, 1.2], drop: 3, gain: 1 },
  morrow:    { base: 43, range: 4, rate: 9, wave: 'sawtooth', lp: 1200, breath: 0.12, vib: [5, 22], oct: true, drop: 2, gain: 0.95 },
  aurum:     { base: 38, range: 3, rate: 8, wave: 'sawtooth', lp: 800, breath: 0.08, fm: [2.02, 0.4], drop: 2, gain: 1 },
  solenne:   { base: 67, range: 5, rate: 14, wave: 'triangle', lp: 4200, breath: 0.04, drop: 3, gain: 0.95 },
  maru:      { base: 60, range: 6, rate: 13, wave: 'sine', lp: 2800, breath: 0.12, glide: 0.06, drop: 2, gain: 1.1, vib: [5, 10] },
  veyra:     { base: 69, range: 9, rate: 20, wave: 'square', lp: 3600, breath: 0.08, wob: 1.5, drop: 1, gain: 0.7 },
  ossian:    { base: 40, range: 2, rate: 7, wave: 'triangle', lp: 900, breath: 0.1, drop: 1, gain: 1.15 },
  ilu:       { base: 58, range: 5, rate: 12, wave: 'sine', lp: 2400, breath: 0.55, drop: 2, gain: 1.1 },
  kestrel:   { base: 72, range: 7, rate: 19, wave: 'triangle', lp: 4400, breath: 0.15, drop: 1, gain: 0.95 },
  echo:      { base: 64, range: 6, rate: 16, wave: 'triangle', lp: 1800, breath: 0.1, ring: 23, drop: 2, gain: 0.8 },
  hob:       { base: 47, range: 5, rate: 13, wave: 'triangle', lp: 1400, breath: 0.22, glide: 0.04, drop: 2, gain: 1.05, vib: [3.5, 8] },
  lisle:     { base: 74, range: 4, rate: 12, wave: 'sine', lp: 3800, breath: 0.6, fade: 0.3, drop: 1, gain: 1.15 },
  gilt:      { base: 68, range: 9, rate: 21, wave: 'square', lp: 3000, breath: 0.03, fm: [4.02, 0.35], drop: 1, gain: 0.7 },
  ash:       { base: 52, range: 2, rate: 10, wave: 'sine', lp: 1300, breath: 0.5, fade: 0.35, drop: 2, gain: 1.15 },
  sable_bare:{ base: 47, range: 4, rate: 11, wave: 'triangle', lp: 1700, breath: 0.2, drop: 3, gain: 1.0, vib: [4, 6] },
  narrator:  { base: 52, range: 4, rate: 12, wave: 'triangle', lp: 1800, breath: 0.2, drop: 2, gain: 0.9 },
  default:   { base: 55, range: 5, rate: 14, wave: 'triangle', lp: 2200, breath: 0.12, drop: 2, gain: 0.9 },
};
const ALIAS = { thimble: 'thimbleby', moth: 'orrin', fox: 'pell', unweaver: 'sable', queen: 'veyl', cantor: 'morrow', colossus: 'aurum', mother: 'weaver', halfspun: 'nell', dawn: 'solenne', tide: 'maru', storm: 'veyra', stone: 'ossian', shade: 'ilu', wind: 'kestrel', hero: 'iri', player: 'iri' };
export function voiceKey(speaker) {
  const s = String(speaker || '').toLowerCase();
  if (VOICES[s]) return s;
  for (const k in VOICES) if (k !== 'default' && s.includes(k)) return k;
  for (const k in ALIAS) if (s.includes(k)) return ALIAS[k];
  return 'default';
}

const FORMANT = { a: [800, 1200], e: [450, 1900], i: [320, 2300], o: [500, 900], u: [350, 750], y: [320, 2100] };
const isV = (ch) => 'aeiouy'.includes(ch);
const STEPS = [0, 2, 4, 7, 9, 12, 14];

// Break text into timed syllables: [{ at, len, vowel, hash, stress }] plus pauses.
function syllables(text, rate) {
  const out = [];
  const s = String(text || '').replace(/\{[^}]*\}|<[^>]*>|\*/g, '');
  const cps = 1 / rate;
  let t = 0, i = 0, word = 0, sentence = [];
  const flush = (kind) => { if (sentence.length) { sentence[sentence.length - 1].end = kind; out.push(...sentence); sentence = []; } };
  while (i < s.length) {
    const ch = s[i], lo = ch.toLowerCase();
    if (/[a-zÀ-ɏ]/i.test(ch)) {
      if (isV(lo) && (i === 0 || !isV(s[i - 1].toLowerCase()))) {
        // hash the word around this vowel for a stable pitch
        let h = 2166136261;
        for (let k = Math.max(0, i - 2); k < Math.min(s.length, i + 3); k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; }
        sentence.push({ at: t, vowel: lo, hash: h, stress: ch !== lo, word });
      }
      t += cps;
    } else if (ch === ' ') { t += cps * 0.8; word++; }
    else if (ch === ',' || ch === ';' || ch === ':') { t += 0.14; }
    else if (ch === '.' || ch === '!' || ch === '?') {
      // an ellipsis is a long pause
      if (s.slice(i, i + 3) === '...') { t += 0.36; i += 2; flush('.'); }
      else { flush(ch); t += ch === '?' ? 0.24 : 0.22; }
    } else if (ch === '…') { flush('.'); t += 0.36; }
    else if (ch === '—' || ch === '-') t += 0.1;
    else t += cps * 0.5;
    i++;
  }
  flush('.');
  return { syl: out, total: t };
}

// Speak a line. Returns { dur } (seconds of voice).
// Mood tags from the dialogue ('#sad', '#happy', ...) bend pitch, pace, range and breath.
const MOODS = {
  happy: { pitch: 1.5, rate: 1.08, range: 1.25 }, warm: { pitch: -0.5, rate: 0.94, range: 0.9, breath: 1.2 },
  sad: { pitch: -1.5, rate: 0.84, range: 0.7, breath: 1.4, drop: 1 }, grave: { pitch: -2, rate: 0.86, range: 0.6, drop: 1 },
  wry: { pitch: 0, rate: 1.02, range: 1.15 }, angry: { pitch: 0.5, rate: 1.12, range: 1.1, drop: 1.5 },
  surprised: { pitch: 3, rate: 1.1, range: 1.4 }, afraid: { pitch: 2, rate: 1.16, range: 0.9, wob: 0.8, breath: 1.3 },
  whisper: { pitch: -1, rate: 0.9, range: 0.6, breath: 3, quiet: 0.6 }, neutral: {},
};
export function speak(E, speaker, text, o = {}) {
  stopVoice(E, 0.03);
  text = String(text || '');
  let mood = o.mood;
  const tag = /^\s*#([a-z]+)\s*/i.exec(text); if (tag) { mood = mood || tag[1].toLowerCase(); text = text.slice(tag[0].length); }
  text = text.replace(/^\s*@[a-z_]+\s*/i, '');
  if (/\((whisper|whispering)\)/i.test(text)) mood = 'whisper';
  text = text.replace(/\([^)]*\)/g, ' ');
  const key = voiceKey(speaker), M = MOODS[String(mood || '').toLowerCase()] || {}, P0 = VOICES[key];
  const P = { ...P0, base: P0.base + (M.pitch || 0), range: P0.range * (M.range ?? 1), drop: (P0.drop ?? 2) + (M.drop || 0),
    breath: Math.min(0.9, P0.breath * (M.breath ?? 1)), wob: (P0.wob || 0) + (M.wob || 0) || undefined, gain: P0.gain * (M.quiet ?? 1) };
  const rate = P.rate * (o.rate ?? 1) * (M.rate ?? 1);
  const { syl } = syllables(text, rate);
  if (!syl.length) return { dur: 0 };
  const MAX = o.max ?? 44;
  const list = syl.slice(0, MAX);
  const c = E.ctx, t0 = E.now() + 0.03 + (o.delay || 0);

  const line = c.createGain(); line.gain.value = (o.vol ?? 1) * P.gain * 0.5 * (E.raw ? 1 : (LEVELS.voice[key] ?? 1)); line.connect(E.voice);
  const vca = c.createGain(); vca.gain.value = 0;
  // formants in parallel with a little dry signal
  const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), dry = c.createGain(), f1g = c.createGain(), f2g = c.createGain();
  f1.type = f2.type = 'bandpass'; f1.Q.value = 5; f2.Q.value = 8; dry.gain.value = 0.18; f1g.gain.value = 1.5; f2g.gain.value = 1.0;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = P.lp; lp.Q.value = 0.5;
  const osc = c.createOscillator(); osc.type = P.wave;
  osc.connect(f1); osc.connect(f2); osc.connect(dry);
  f1.connect(f1g); f2.connect(f2g); f1g.connect(lp); f2g.connect(lp); dry.connect(lp);
  lp.connect(vca);
  let tail = vca;
  if (P.ring) { // Sable: ring-modulated, faintly distorted
    const rm = c.createGain(); rm.gain.value = 0.55;
    const ro = c.createOscillator(), rg = c.createGain(); ro.frequency.value = P.ring; rg.gain.value = 0.45; ro.connect(rg); rg.connect(rm.gain);
    const ws = c.createWaveShaper(); ws.curve = driveCurve(1.8);
    vca.connect(ws); ws.connect(rm); tail = rm; E.voiceNodes = [ro];
  } else E.voiceNodes = [];
  tail.connect(line);
  const srcs = E.voiceNodes; srcs.push(osc);
  let mod = null, octO = null;
  if (P.fm) { mod = c.createOscillator(); const mg = c.createGain(); mod.connect(mg); mg.connect(osc.frequency); mod.mg = mg; srcs.push(mod); }
  if (P.oct) { octO = c.createOscillator(); octO.type = 'sine'; const og = c.createGain(); og.gain.value = 0.35; octO.connect(og); og.connect(lp); srcs.push(octO); }
  if (P.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = P.vib[0]; lg.gain.value = P.vib[1]; l.connect(lg); lg.connect(osc.detune); if (octO) lg.connect(octO.detune); srcs.push(l); }
  // breath
  const br = c.createBufferSource(); br.buffer = E.noise; br.loop = true;
  const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 2600; bf.Q.value = 1.2;
  const bg = c.createGain(); bg.gain.value = 0;
  br.connect(bf); bf.connect(bg); bg.connect(line); srcs.push(br);

  // schedule syllables
  const sentenceStart = [];
  for (let k = 0; k < list.length; k++) if (k === 0 || list[k - 1].end) sentenceStart.push(k);
  let sIdx = 0, last = t0;
  for (let k = 0; k < list.length; k++) {
    const sy = list[k];
    if (sIdx + 1 < sentenceStart.length && k >= sentenceStart[sIdx + 1]) sIdx++;
    const sStart = sentenceStart[sIdx], sEnd = (sentenceStart[sIdx + 1] ?? list.length) - 1;
    const prog = sEnd > sStart ? (k - sStart) / (sEnd - sStart) : 0;
    const endMark = list[sEnd]?.end;
    const ts = t0 + sy.at;
    const next = k + 1 < list.length ? t0 + list[k + 1].at : ts + 0.14;
    const len = clamp((next - ts) * 0.78, 0.045, 0.16);
    // pitch: hashed melody step, sentence contour, question lift, stress
    let semi = STEPS[sy.hash % Math.min(STEPS.length, 2 + Math.round(P.range / 2))] * (P.range / 12);
    semi += (0.5 - prog) * (P.drop ?? 2);
    if (endMark === '?' && k >= sEnd - 1) semi += 4 + (k - (sEnd - 1)) * 3;
    if (endMark === '!' && k >= sEnd - 1) semi += 2;
    if (sy.stress) semi += 2;
    if (P.wob) semi += (Math.random() - 0.5) * P.wob * 2;
    const f = mtof(P.base + semi);
    if (P.glide) osc.frequency.linearRampToValueAtTime(f, ts + P.glide); else osc.frequency.setValueAtTime(f, ts);
    if (octO) octO.frequency.setValueAtTime(f * 2, ts);
    if (mod) { mod.frequency.setValueAtTime(f * P.fm[0], ts); mod.mg.gain.setValueAtTime(f * P.fm[1], ts); }
    const fv = FORMANT[sy.vowel] || FORMANT.a;
    f1.frequency.setValueAtTime(fv[0], ts); f2.frequency.setValueAtTime(fv[1], ts);
    let amp = (sy.stress || endMark === '!' && k >= sEnd - 1) ? 1 : 0.8;
    if (P.fade && Math.random() < P.fade) amp *= 0.3; // Nell's thread frays mid-word
    vca.gain.setValueAtTime(0, ts);
    vca.gain.linearRampToValueAtTime(amp, ts + 0.012);
    vca.gain.setValueAtTime(amp, ts + len * 0.6);
    vca.gain.linearRampToValueAtTime(0, ts + len);
    if (P.breath) { bg.gain.setValueAtTime(0, ts); bg.gain.linearRampToValueAtTime(P.breath * 0.35, ts + 0.01); bg.gain.linearRampToValueAtTime(0, ts + len); }
    last = ts + len;
  }
  const stopAt = last + 0.15;
  for (const s of srcs) { try { s.start(t0); } catch (e) {} s.stop(stopAt); }
  E.voiceLine = { line, until: stopAt, srcs };
  return { dur: stopAt - t0, speaker: key };
}

export function stopVoice(E, fade = 0.05) {
  const v = E && E.voiceLine;
  if (!v) return;
  const now = E.now();
  if (v.until > now) {
    v.line.gain.cancelScheduledValues(now); v.line.gain.setValueAtTime(v.line.gain.value, now);
    v.line.gain.linearRampToValueAtTime(0, now + fade);
    for (const s of v.srcs) { try { s.stop(now + fade + 0.02); } catch (e) {} }
  }
  E.voiceLine = null;
}

export const VOICE_IDS = () => Object.keys(VOICES).filter((k) => k !== 'default');
