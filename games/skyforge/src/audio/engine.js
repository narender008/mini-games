// The audio graph, independent of the game so it can run in an
// OfflineAudioContext for level checks:
//   music bus ─┐                       ┌─> reverb (generated hall) ─┐
//   sfx bus ───┼─> (sends) ────────────┘                             │
//   amb bus ───┴──────────────> master ─> limiter ─> trim ─> destination
import { buildSamples } from './samples.js';
import { createVoices } from './voices.js';
import { createMusic } from './music.js';
import { createSfx } from './sfx.js';
import { createAmbience } from './ambience.js';

function hallIR(ctx, sec = 2.8) {
  const n = Math.round(sec * ctx.sampleRate), b = ctx.createBuffer(2, n, ctx.sampleRate);
  let s = 12345;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 * 2 - 1; };
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate;
      const a = 1 - Math.exp(-2 * Math.PI * (7000 * Math.exp(-t / 0.9) + 400) / ctx.sampleRate);   // darker as it decays
      lp += (r() - lp) * a;
      d[i] = lp * Math.exp(-t / 0.7) * (t < 0.012 ? t / 0.012 : 1);
    }
  }
  return b;
}

export function createEngine(ctx) {
  const S = buildSamples(ctx);
  const V = createVoices(ctx, S);
  const master = ctx.createGain(); master.gain.value = 0.8;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -9; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.25;
  const trim = ctx.createGain(); trim.gain.value = 0.92;
  const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
  master.connect(limiter); limiter.connect(trim); trim.connect(ctx.destination); trim.connect(analyser);

  const reverb = ctx.createConvolver(); reverb.buffer = hallIR(ctx);
  const ret = ctx.createGain(); ret.gain.value = 0.5; reverb.connect(ret); ret.connect(master);

  const bus = (v, send) => { const g = ctx.createGain(); g.gain.value = v; g.connect(master); if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(reverb); } return g; };
  const musicBus = bus(0.6), sfxBus = bus(0.8, 0.14), ambBus = bus(0.7, 0.06);
  const musicSend = ctx.createGain(); musicSend.gain.value = 0.42; musicBus.connect(musicSend); musicSend.connect(reverb);   // post-fader

  const music = createMusic(ctx, V, musicBus, null);
  const sfx = createSfx(ctx, V, S, sfxBus);
  const amb = createAmbience(ctx, V, S, ambBus);

  const curve = (v) => Math.max(0, Math.min(1, v)) ** 1.6;     // sliders feel even in loudness
  function setVolumes({ master: m = 0.8, music: mu = 0.6, sfx: sf = 0.8, ambience: am = 0.7, muted = false } = {}, tc = 0.08, duck = {}) {
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(muted ? 0 : curve(m) * 1.1, now, tc);
    musicBus.gain.setTargetAtTime(curve(mu) * 1.15 * (duck.music ?? 1), now, tc);
    sfxBus.gain.setTargetAtTime(curve(sf) * 1.1, now, tc);
    ambBus.gain.setTargetAtTime(curve(am) * 1.2 * (duck.amb ?? 1), now, tc);
  }

  // peak and RMS of the output over the analyser window (dBFS)
  const buf = new Float32Array(analyser.fftSize);
  function meter() {
    analyser.getFloatTimeDomainData(buf);
    let pk = 0, sum = 0; for (const v of buf) { const a = Math.abs(v); if (a > pk) pk = a; sum += v * v; }
    const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
    return { peak: pk, peakDb: db(pk), rmsDb: db(Math.sqrt(sum / buf.length)), reduction: limiter.reduction };
  }

  return { ctx, S, V, music, sfx, amb, master, limiter, analyser, buses: { music: musicBus, sfx: sfxBus, amb: ambBus }, setVolumes, meter };
}
