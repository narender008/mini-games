// Emberfall: The Last Light, audio layer. Everything is synthesized at runtime with Web Audio:
// no files, no network, no dependencies.
//
//   sfx voices ─┬──────────────────────────────► sfxVol ──┐
//               └► sfx reverb (1.4 s, procedural) ┘        │
//   music notes ─┬─────────────────────────────┐           ├► master ► compressor ► soft clip ► out
//   ambience ────┼► music reverb (2.8 s) ───────┴► pause LP ► duck ► musicVol ┘
//
// Files:  types.ts (public types)  limiter.ts (pure voice / mote bookkeeping, tested in Node)
//         dsp.ts (Group voice builder, noise, impulses)  sfx.ts (the synth table)
//         music.ts (generative moods on a lookahead scheduler)  ambience.ts (zone beds)
//
// Nothing touches window or AudioContext until unlock(); every public method is wrapped so a missing
// or broken Web Audio implementation can never throw into the game. Ambience rides the music volume.

import type { AudioSettings, MusicMood, PlayOpts, Sfx, Zone } from './types';
import { Group, live, makeImpulse, makeNoise, makeSoftClip } from './dsp';
import { MoteSequencer, VoiceLimiter } from './limiter';
import { SFX, SFX_NAMES } from './sfx';
import { MusicSystem, type MusicCore } from './music';
import { Ambience } from './ambience';

export type { AudioSettings, MusicMood, PlayOpts, Sfx, Zone } from './types';
export { SFX_NAMES } from './sfx';

const GLOBAL_VOICES = 32;
const TICK_MS = 25;
const MUSIC_LOOKAHEAD = 0.15;
const AMB_LOOKAHEAD = 0.3;

/** Slider (0..1) to gain: squared, so the middle of the slider sounds like the middle. */
const vol = (v: number): number => { const x = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0)); return x * x; };

interface Graph {
  ctx: AudioContext;
  noise: AudioBuffer;
  sfxIn: GainNode; sfxRev: ConvolverNode; sfxVol: GainNode;
  musicIn: GainNode; musicRev: ConvolverNode; pauseLp: BiquadFilterNode; duck: GainNode; musicVol: GainNode;
  master: GainNode;
  music: MusicSystem; amb: Ambience; core: MusicCore;
}

export class GameAudio {
  private g: Graph | null = null;
  private failed = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private limiter = new VoiceLimiter(GLOBAL_VOICES);
  private motes = new MoteSequencer();
  private voices = new Map<number, Group>();
  private played: Record<string, number> = {};
  private mood: MusicMood = 'none';
  private zone: Zone = 'sanctum';
  private intensity = 0;
  private appliedIntensity = -1;
  private settings: AudioSettings = { master: 0.8, music: 0.7, sfx: 0.8, muted: false };
  private paused = false;
  private hidden = false;

  constructor() {
    // Intentionally empty of browser access: this module is imported by Node tests.
  }

  unlock(): void {
    try {
      if (this.g) {
        if (!this.hidden && this.g.ctx.state !== 'running' && this.g.ctx.state !== 'closed') void this.g.ctx.resume().catch(() => {});
        return;
      }
      if (this.failed) return;
      const AC: typeof AudioContext | undefined = typeof window !== 'undefined'
        ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
      if (!AC) { this.failed = true; return; }
      this.g = this.build(new AC({ latencyHint: 'interactive' }));
      if (this.g.ctx.state !== 'running' && !this.hidden) void this.g.ctx.resume().catch(() => {});
      if (this.hidden) void this.g.ctx.suspend().catch(() => {});
      this.timer = setInterval(() => this.tick(), TICK_MS);
    } catch {
      this.failed = true;
      this.g = null;
    }
  }

  private build(ctx: AudioContext): Graph {
    const now = ctx.currentTime;
    const gain = (v: number): GainNode => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const noise = makeNoise(ctx, 2);

    const master = gain(vol(this.settings.master));
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.22;
    const clip = ctx.createWaveShaper();
    clip.curve = makeSoftClip(0.6, 0.97);
    master.connect(comp); comp.connect(clip); clip.connect(ctx.destination);

    const sfxVol = gain(vol(this.settings.sfx)); sfxVol.connect(master);
    const sfxIn = gain(1); sfxIn.connect(sfxVol);
    const sfxRev = ctx.createConvolver(); sfxRev.buffer = makeImpulse(ctx, 1.4, 0.008, 0.7);
    const sfxRevOut = gain(0.55); sfxRev.connect(sfxRevOut); sfxRevOut.connect(sfxVol);

    const musicVol = gain(vol(this.settings.music)); musicVol.connect(master);
    const duck = gain(1); duck.connect(musicVol);
    const pauseLp = ctx.createBiquadFilter(); pauseLp.type = 'lowpass'; pauseLp.frequency.value = 20000; pauseLp.Q.value = 0.5;
    pauseLp.connect(duck);
    const musicIn = gain(0.8); musicIn.connect(pauseLp);
    const musicRev = ctx.createConvolver(); musicRev.buffer = makeImpulse(ctx, 2.8, 0.02, 0.5);
    const musicRevOut = gain(0.6); musicRev.connect(musicRevOut); musicRevOut.connect(pauseLp);
    const ambIn = gain(0.9); ambIn.connect(pauseLp);

    if (this.settings.muted) master.gain.value = 0;
    const core: MusicCore = { ctx, noise, rev: musicRev, zone: this.zone, intensity: this.intensity };
    const music = new MusicSystem(core, musicIn);
    const amb = new Ambience({ ctx, noise, rev: musicRev }, ambIn);
    const g: Graph = { ctx, noise, sfxIn, sfxRev, sfxVol, musicIn, musicRev, pauseLp, duck, musicVol, master, music, amb, core };
    // Apply what the game asked for before the unlock.
    music.setMood(this.mood, now);
    amb.setZone(this.zone, now);
    this.appliedIntensity = this.intensity;
    if (this.paused) this.applyPause(g, true);
    return g;
  }

  private tick(): void {
    const g = this.g;
    if (!g) return;
    try {
      if (g.ctx.state !== 'running') return;
      const now = g.ctx.currentTime;
      if (Math.abs(this.intensity - this.appliedIntensity) > 0.01) {
        this.appliedIntensity = this.intensity;
        g.music.setIntensity(this.intensity, now);
      }
      g.music.tick(now, MUSIC_LOOKAHEAD);
      g.amb.tick(now, AMB_LOOKAHEAD);
    } catch { /* never let the scheduler throw */ }
  }

  play(name: Sfx, opts?: PlayOpts): void {
    const g = this.g;
    if (!g) return;
    try {
      if (g.ctx.state !== 'running') return;
      const d = SFX[name];
      if (!d) return;
      const now = g.ctx.currentTime;
      const adm = this.limiter.admit(name, now, d, d.len);
      if (!adm.ok) return;
      if (adm.evict !== null) this.voices.get(adm.evict)?.kill(now);
      const ctx = g.ctx;
      let dest: AudioNode = g.sfxIn;
      let panner: StereoPannerNode | null = null;
      const pan = opts?.pan;
      if (pan !== undefined && Number.isFinite(pan) && pan !== 0 && typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan)) * 0.8; // never hard-panned
        panner.connect(g.sfxIn);
        dest = panner;
      }
      const v = new Group(ctx, now, dest, g.noise, g.sfxRev, d.wet);
      if (panner) v.node(panner);
      const pitch = opts?.pitch !== undefined && Number.isFinite(opts.pitch) ? opts.pitch : 1;
      v.p = Math.max(0.25, Math.min(4, pitch * (1 + (Math.random() * 2 - 1) * d.vary)));
      const volume = opts?.volume !== undefined && Number.isFinite(opts.volume) ? Math.max(0, Math.min(4, opts.volume)) : 1;
      v.out.gain.value = d.vol * volume;
      const id = adm.id;
      v.onDone = () => { this.voices.delete(id); this.limiter.release(id); };
      d.fn(v, { now, mote: this.motes });
      this.voices.set(id, v);
      this.played[name] = (this.played[name] ?? 0) + 1;
    } catch { /* a sound effect must never break the game */ }
  }

  setMood(mood: MusicMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    try { if (this.g) this.g.music.setMood(mood, this.g.ctx.currentTime); } catch { /* ignore */ }
  }

  setZone(zone: Zone): void {
    if (zone === this.zone) return;
    this.zone = zone;
    try {
      if (!this.g) return;
      this.g.core.zone = zone; // music picks up the new colour from its next note
      this.g.amb.setZone(zone, this.g.ctx.currentTime);
    } catch { /* ignore */ }
  }

  setIntensity(x: number): void {
    this.intensity = Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; // applied by the tick
  }

  setSettings(s: AudioSettings): void {
    this.settings = { master: s.master, music: s.music, sfx: s.sfx, muted: !!s.muted };
    const g = this.g;
    if (!g) return;
    try {
      const now = g.ctx.currentTime;
      g.master.gain.setTargetAtTime(this.settings.muted ? 0 : vol(s.master), now, 0.04);
      g.musicVol.gain.setTargetAtTime(vol(s.music), now, 0.04);
      g.sfxVol.gain.setTargetAtTime(vol(s.sfx), now, 0.04);
    } catch { /* ignore */ }
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    try { if (this.g) this.applyPause(this.g, paused); } catch { /* ignore */ }
  }

  private applyPause(g: Graph, paused: boolean): void {
    const now = g.ctx.currentTime;
    g.duck.gain.setTargetAtTime(paused ? 0.35 : 1, now, 0.12);
    g.pauseLp.frequency.setTargetAtTime(paused ? 650 : 20000, now, paused ? 0.1 : 0.25);
    if (paused) {
      // Cut the tails of everything sounding; menu sounds played after this still play.
      for (const v of this.voices.values()) v.kill(now, 0.08);
    }
  }

  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    const g = this.g;
    if (!g) return;
    try {
      if (hidden) void g.ctx.suspend().catch(() => {});
      else void g.ctx.resume().catch(() => {});
    } catch { /* ignore */ }
  }

  debugState(): { unlocked: boolean; state: string; mood: MusicMood; zone: Zone; voices: number; played: Record<string, number> } {
    const g = this.g;
    let state = this.failed ? 'unavailable' : 'locked';
    let voices = 0;
    try {
      if (g) { state = g.ctx.state; voices = this.limiter.count(g.ctx.currentTime); }
    } catch { /* ignore */ }
    return { unlocked: !!g, state, mood: this.mood, zone: this.zone, voices, played: { ...this.played } };
  }

  /** Extra counters for leak checks in test harnesses (not part of the game contract). */
  debugCounters(): { sources: number; groups: number; tracked: number; musicPlayers: number } {
    return { sources: live.sources, groups: live.groups, tracked: this.voices.size, musicPlayers: this.g?.music.players() ?? 0 };
  }

  /** Stop everything and release the context (tests, hot reload). */
  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const g = this.g;
    this.g = null;
    this.voices.clear();
    this.limiter.clear();
    if (g) { try { void g.ctx.close().catch(() => {}); } catch { /* ignore */ } }
  }
}

/** Every sound the synth table can make, for tools and tests. */
export const ALL_SFX: readonly Sfx[] = SFX_NAMES;

export const audio = new GameAudio();
