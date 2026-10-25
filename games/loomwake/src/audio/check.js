// Offline audio checks: render every sound effect, a few seconds of every
// track (at low and high intensity, and boss phase 2), and every voice through
// an OfflineAudioContext with the real mixing chain, then measure the buffer.
// Used by dev/audio.html (button and ?check) and dev/audio-check.cjs.
import { createEngine, setRoom } from './core.js';
import { playSfx, SFX } from './sfx.js';
import { createMusic } from './music.js';
import { TRACKS } from './tracks.js';
import { speak, VOICES } from './voice.js';

export function analyse(buf) {
  let peak = 0, sum = 0, nan = 0, clip = 0, last = 0, first = -1, dc = 0;
  const n = buf.length, ch = buf.numberOfChannels;
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const x = d[i];
      if (x !== x || x === Infinity || x === -Infinity) { nan++; continue; }
      const a = x < 0 ? -x : x;
      if (a > peak) peak = a;
      if (a >= 0.999) clip++;
      sum += x * x; dc += x;
      if (a > 0.002) { if (first < 0 || i < first) first = i; if (i > last) last = i; }
    }
  }
  const rms = Math.sqrt(sum / (n * ch));
  return {
    peak: +peak.toFixed(4), rms: +rms.toFixed(5), rmsDb: rms > 0 ? +(20 * Math.log10(rms)).toFixed(1) : -Infinity,
    peakDb: peak > 0 ? +(20 * Math.log10(peak)).toFixed(1) : -Infinity, nan, clip,
    start: first < 0 ? null : +(first / buf.sampleRate).toFixed(3), end: +(last / buf.sampleRate).toFixed(3), dc: +(dc / (n * ch)).toFixed(5),
  };
}

const verdict = (a, minRms = 1e-4) => (a.nan === 0 && a.peak < 1 && a.peak > 0.003 && a.rms > minRms ? 'ok' : 'FAIL');

async function render(seconds, fn, sr = 44100, room = 'hub', raw = false) {
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  const E = createEngine(ctx, { offline: true, room, raw });
  const t0 = performance.now();
  fn(E);
  const buf = await ctx.startRendering();
  const ms = performance.now() - t0;
  return { a: analyse(buf), ms, buf, E };
}

export async function checkSfx(name, opts = {}) {
  const d = SFX[name];
  const secs = Math.min(7, (d ? d.d : 1) + (opts.dur || 0) + (opts.delay || 0) + 1.5);
  const { a, ms, E } = await render(secs, (E) => playSfx(E, name, { dur: 0.6, ...opts }));
  return { name, secs, ...a, ms: Math.round(ms), voices: E.stats.made, verdict: verdict(a) };
}

export async function checkTrack(id, { seconds = 6, intensity = 0.5, phase = 1 } = {}) {
  const T = TRACKS[id];
  const { a, ms } = await render(seconds, (E) => {
    const M = createMusic(E);
    M.set(id, { intensity, phase, fadeIn: 0.05 });
    M.tick(seconds);
  }, 44100, T && T.room);
  return { name: id, intensity, phase, secs: seconds, ...a, ms: Math.round(ms), rt: +(seconds * 1000 / ms).toFixed(1), verdict: verdict(a, 0.002) };
}

export async function checkVoice(speaker, text) {
  const { a, ms } = await render(5, (E) => speak(E, speaker, text));
  return { name: speaker, ...a, ms: Math.round(ms), verdict: verdict(a) };
}

// Worst case: 40 hits, 6 crits, 4 unravels and a call in the same instant over boss music.
export async function checkStress() {
  const { a, ms, E } = await render(5, (E) => {
    const M = createMusic(E); M.set('boss_aurum', { intensity: 1, phase: 2, fadeIn: 0.05 }); M.tick(5);
    for (let i = 0; i < 40; i++) playSfx(E, ['hit_thread', 'hit_armor', 'hit_glass', 'hit_stone'][i % 4], { vel: 1.3, pan: (i % 9) / 4 - 1 });
    for (let i = 0; i < 6; i++) playSfx(E, 'crit', { vel: 1.3 });
    for (let i = 0; i < 4; i++) playSfx(E, 'unravel', { vel: 1.3 });
    playSfx(E, 'call_storm', { vel: 1.3 }); playSfx(E, 'armor_break', { vel: 1.3 }); playSfx(E, 'aurum_hammer', { vel: 1.3 });
  });
  return { name: 'stress (stacked hits over boss music)', ...a, ms: Math.round(ms), made: E.stats.made, dropped: E.stats.dropped + E.stats.stacked, verdict: a.nan === 0 && a.peak < 1 ? 'ok' : 'FAIL' };
}

export const VOICE_LINES = {
  iri: 'I can still feel the thread pulling. Is that normal?',
  orrin: 'You came back with frost on your scarf again. Shall I write this one down as a victory?',
  thimbleby: 'A blade is only a needle that has decided to be brave!',
  pell: 'Lost things find their way to me. Mostly. Eventually.',
  nell: 'I had a name before this. I am nearly sure it started with an N...',
  weaver: '...little thread... not yet...',
  sable: 'Hello again, little thread.',
  veyl: 'Another thief in my garden.',
  morrow: 'Every name I sing is a name the world forgets.',
  aurum: 'I made the shears. I have been making amends ever since.',
  solenne: 'Cut him loose, and do not look back.',
  maru: 'Oh, sweet thing, you are soaked through. Take this.',
  veyra: 'Ha! Let us make some noise, shall we?',
  ossian: 'Stand. Breathe. Again.',
  ilu: 'He was cut for being different. Remember that before you cut him again.',
  kestrel: 'Faster! Do you want to win or not?',
  echo: 'You are me. I am you. Which of us is the copy?',
  narrator: 'Long ago, a weaver sat down at her loom and dreamed.',
};

export async function runAll(log = () => {}) {
  const out = { sfx: [], tracks: [], voices: [], stress: null, when: new Date().toISOString() };
  for (const name of Object.keys(SFX)) { const r = await checkSfx(name, { rarity: 'epic' }); out.sfx.push(r); log(r); }
  for (const id of Object.keys(TRACKS)) {
    for (const [intensity, phase] of id.startsWith('boss_') ? [[0.8, 1], [1, 2]] : [[0.2, 1], [1, 1]]) {
      const r = await checkTrack(id, { seconds: id === 'unwoven' || id === 'memory' || id === 'title' ? 8 : 6, intensity, phase }); out.tracks.push(r); log(r);
    }
  }
  for (const k of Object.keys(VOICES)) { if (k === 'default') continue; const r = await checkVoice(k, VOICE_LINES[k] || 'Hello there, little thread.'); out.voices.push(r); log(r); }
  out.stress = await checkStress(); log(out.stress);
  out.fail = [...out.sfx, ...out.tracks, ...out.voices, out.stress].filter((r) => r.verdict !== 'ok').map((r) => r.name);
  return out;
}

// Encode a rendered buffer as a WAV data URL (dev page: "render to file", for
// listening offline without the page; not used by the game).
export function toWav(buf) {
  const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate;
  const dv = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true);
  dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const x = Math.max(-1, Math.min(1, chans[c][i])); dv.setInt16(o, x * 32767, true); o += 2; }
  return new Blob([dv], { type: 'audio/wav' });
}
export { render };

// ---------------------------------------------------------------- calibration
// K-weighting (BS.1770 shelf + high-pass, RBJ biquads), then loudness:
// sfx = loudest 100 ms window; music = mean over the render after 1 s.
function biquad(type, f0, sr, q, gainDb = 0) {
  const A = Math.pow(10, gainDb / 40), w = 2 * Math.PI * f0 / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'hs') { const sq = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sq); a0 = (A + 1) - (A - 1) * cs + sq; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sq; }
  else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function kweight(d, sr) {
  let x = d;
  for (const [b0, b1, b2, a1, a2] of [biquad('hs', 1681.97, sr, 0.7071, 4), biquad('hp', 38.13, sr, 0.5003)]) {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = x[i], o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o; }
    x = y;
  }
  return x;
}
export function loudness(buf, mode = 'max', skip = 0) {
  const sr = buf.sampleRate, chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(kweight(buf.getChannelData(c), sr));
  const n = buf.length, win = Math.floor(sr * 0.1), hop = Math.floor(sr * 0.025);
  if (mode === 'mean') {
    let s = 0, k = 0; for (const d of chans) for (let i = Math.floor(skip * sr); i < n; i++) { s += d[i] * d[i]; k++; }
    return 10 * Math.log10(s / Math.max(1, k / chans.length) + 1e-12);
  }
  let best = 0;
  for (let i = 0; i + win <= n; i += hop) { let s = 0; for (const d of chans) for (let j = i; j < i + win; j++) s += d[j] * d[j]; best = Math.max(best, s / win); }
  return 10 * Math.log10(best + 1e-12);
}

// Category targets (LUFS-like, dB). Order matters: first match wins.
export const TARGETS = [
  [/^(call_(dawn|tide|storm|stone|shade|wind)|boss_(intro|phase|defeat)|victory|death_sting|sable_unmask|aurum_heat)$/, -11],
  [/^(special|armor_break|slam|explode|aurum_(hammer|anvil)|veyl_(claw|thorns|summon)|morrow_(flood|choir|summon)|fire_breath|unravel_elite|door_open|wave_start|death_defy|chamber_clear|boon_take|pickup_memory|sable_thread)$/, -15],
  [/^(hit_|crit$|snare_hit|hero_hurt|unravel$|sable_|veyl_shatter|morrow_(ring|lantern)|aurum_hiss|shockwave|pull|song_ring|thorn_burst|heal|pickup_heal|card|chain|heartbeat|swing3)/, -18],
  [/^(swing|spear|bow|punch|chakram|dash|snare_|bind|call_ready|shield|cloak|teleport|leap|claw|stagger|veyl_(volley|ring)|proc_storm)/, -20],
  [/^tell/, -21],
  [/^(proc_|needle|orb|hammer_throw|sizzle|projectile|censer|growl|clank|rasp|spawn|aurum_step|thorn_warn|pickup|reroll|purchase|save|fountain|door_|offer|dialogue_open|ui_(upgrade|open|close|confirm))/, -24],
  [/^(ui_(click|back|error)|dialogue_next|arrow)$/, -28],
  [/^(ui_(hover|tick|slider)|footstep)$/, -33],
];
export const MUSIC_TARGETS = [[/^boss_/, -21], [/^(glasswood|choir|forge|unwoven)$/, -22.5], [/^(hub|ending|ending_true)$/, -24], [/./, -25.5]];
export const VOICE_TARGET = -21;
const tgt = (list, name) => { for (const [re, v] of list) if (re.test(name)) return v; return null; };

export async function calibrate(log = () => {}) {
  const out = { sfx: {}, music: {}, voice: {} };
  for (const name of Object.keys(SFX)) {
    const T = tgt(TARGETS, name); if (T == null) continue;
    const d = SFX[name], secs = Math.min(7, d.d + 1.6);
    const { buf } = await render(secs, (E) => playSfx(E, name, { dur: 0.6, rarity: 'rare' }), 44100, 'hub', true);
    const L = loudness(buf, 'max');
    out.sfx[name] = +Math.min(10, Math.max(0.15, Math.pow(10, (T - L) / 20))).toFixed(3);
    log({ name, L: +L.toFixed(1), T, g: out.sfx[name] });
  }
  for (const id of Object.keys(TRACKS)) {
    const T = tgt(MUSIC_TARGETS, id);
    const boss = id.startsWith('boss_');
    const { buf } = await render(9, (E) => { const M = createMusic(E); M.set(id, { intensity: boss ? 0.9 : 1, phase: 1, fadeIn: 0.05 }); M.tick(9); }, 44100, TRACKS[id].room, true);
    const L = loudness(buf, 'mean', 1);
    out.music[id] = +Math.min(4, Math.max(0.25, Math.pow(10, (T - L) / 20))).toFixed(3);
    log({ name: id, L: +L.toFixed(1), T, g: out.music[id] });
  }
  for (const k of Object.keys(VOICES)) {
    if (k === 'default') continue;
    const { buf } = await render(5, (E) => speak(E, k, VOICE_LINES[k] || 'Hello there, little thread.'), 44100, 'hub', true);
    const L = loudness(buf, 'max');
    out.voice[k] = +Math.min(4, Math.max(0.25, Math.pow(10, (VOICE_TARGET - L) / 20))).toFixed(3);
    log({ name: k, L: +L.toFixed(1), T: VOICE_TARGET, g: out.voice[k] });
  }
  return out;
}
