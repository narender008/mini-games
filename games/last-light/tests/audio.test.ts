import { describe, expect, it } from 'vitest';
import { audio, GameAudio, SFX_NAMES, type Sfx, type MusicMood, type Zone } from '../src/audio/audio';
import { SFX } from '../src/audio/sfx';
import { MOTE_SCALE, MoteSequencer, VoiceLimiter, type LimitRule } from '../src/audio/limiter';

// Every member of the Sfx union. Record<Sfx, true> makes tsc fail if a name is added to or removed from
// the union without updating this list, so comparing it with the synth table checks real coverage.
const EVERY_SFX: Record<Sfx, true> = {
  swing: true, swingHeavy: true, hit: true, hitHeavy: true, kill: true, killBig: true, boltFire: true, boltHit: true,
  dash: true, dashReady: true, perfectDodge: true, hurt: true, death: true, mote: true, levelUp: true,
  uiMove: true, uiSelect: true, uiBack: true, deny: true, sunburstCharge: true, sunburst: true,
  shieldUp: true, shieldBreak: true, enemyWindup: true, enemyShot: true, enemyLunge: true,
  chargeWindup: true, chargeImpact: true, slamWindup: true, slam: true, spawn: true, blink: true,
  doorOpen: true, roomClear: true, interact: true, heal: true, burn: true, chain: true, shard: true,
  bossRoar: true, bossBeamCharge: true, bossBeam: true, bossPhase: true, bossDeath: true, bossVolley: true,
  victory: true, pickupBig: true, wallBonk: true, reflect: true, lanternLit: true, footstep: true,
};

describe('audio module in Node', () => {
  it('imports without a window or AudioContext and starts locked', () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
    const s = new GameAudio().debugState();
    expect(s.unlocked).toBe(false);
    expect(s.voices).toBe(0);
    expect(audio).toBeInstanceOf(GameAudio);
  });

  it('has a recipe with sane voice rules for exactly the names in the Sfx union', () => {
    expect([...SFX_NAMES].sort()).toEqual(Object.keys(EVERY_SFX).sort());
    for (const name of SFX_NAMES) {
      const d = SFX[name];
      expect(typeof d.fn, name).toBe('function');
      expect(d.max, name).toBeGreaterThanOrEqual(1);
      expect(d.len, name).toBeGreaterThan(0);
      expect(d.vol, name).toBeGreaterThan(0);
      expect(d.vol, name).toBeLessThanOrEqual(2);
    }
    // The often-called sounds must be the expendable, quiet ones.
    expect(SFX.footstep.prio).toBe(0);
    expect(SFX.footstep.vol).toBeLessThan(SFX.hit.vol);
  });

  it('is a safe no-op before unlock and remembers requested state', () => {
    const a = new GameAudio();
    expect(() => {
      for (const name of SFX_NAMES) a.play(name, { pan: 2, volume: -1, pitch: NaN });
      a.setMood('combat'); a.setMood('combat');
      a.setZone('foundry');
      a.setIntensity(5); a.setIntensity(NaN);
      a.setSettings({ master: 0.5, music: 0.2, sfx: 1, muted: true });
      a.setPaused(true); a.setPaused(false);
      a.setHidden(true); a.setHidden(false);
    }).not.toThrow();
    const s = a.debugState();
    expect(s.mood).toBe('combat');
    expect(s.zone).toBe('foundry');
    expect(Object.keys(s.played)).toHaveLength(0);
  });

  it('unlock without Web Audio does nothing and never throws', () => {
    const a = new GameAudio();
    expect(() => { a.unlock(); a.unlock(); a.play('hit'); }).not.toThrow();
    expect(a.debugState().unlocked).toBe(false);
    expect(a.debugState().state).toBe('unavailable');
    const moods: MusicMood[] = ['title', 'explore', 'combat', 'boss', 'victory', 'defeat', 'none'];
    const zones: Zone[] = ['sanctum', 'causeway', 'aqueduct', 'foundry', 'heart'];
    for (const m of moods) a.setMood(m);
    for (const z of zones) a.setZone(z);
    expect(a.debugState().mood).toBe('none');
    expect(a.debugState().zone).toBe('heart');
  });
});

describe('VoiceLimiter', () => {
  const rule = (o: Partial<LimitRule> = {}): LimitRule => ({ max: 2, gap: 0.05, prio: 1, ...o });

  it('rejects identical sounds closer than the gap, accepts them after', () => {
    const l = new VoiceLimiter(32);
    expect(l.admit('hit', 0, rule(), 1).ok).toBe(true);
    const again = l.admit('hit', 0.01, rule(), 1);
    expect(again).toEqual({ ok: false, reason: 'gap' });
    expect(l.admit('hit', 0.06, rule(), 1).ok).toBe(true);
    // a different name is not affected by the hit's gap
    expect(l.admit('swing', 0.061, rule(), 1).ok).toBe(true);
  });

  it('caps simultaneous voices per name and frees slots when voices end', () => {
    const l = new VoiceLimiter(32);
    l.admit('mote', 0, rule(), 0.5);
    l.admit('mote', 0.1, rule(), 0.5);
    expect(l.admit('mote', 0.2, rule(), 0.5)).toEqual({ ok: false, reason: 'max' });
    expect(l.count(0.2, 'mote')).toBe(2);
    // the first ends at 0.5
    expect(l.admit('mote', 0.55, rule(), 0.5).ok).toBe(true);
    expect(l.count(0.55, 'mote')).toBe(2);
    expect(l.count(10)).toBe(0);
  });

  it('release() frees a slot early and ignores unknown ids', () => {
    const l = new VoiceLimiter(32);
    const a = l.admit('x', 0, rule({ max: 1, gap: 0 }), 5);
    expect(a.ok).toBe(true);
    expect(l.admit('x', 0.1, rule({ max: 1, gap: 0 }), 5).ok).toBe(false);
    if (a.ok) l.release(a.id);
    l.release(9999);
    expect(l.admit('x', 0.2, rule({ max: 1, gap: 0 }), 5).ok).toBe(true);
  });

  it('when the global cap is full, steals the oldest voice of equal or lower priority', () => {
    const l = new VoiceLimiter(3);
    const steps = ['a', 'b', 'c'].map((n, i) => l.admit(n, i * 0.1, rule({ prio: n === 'a' ? 2 : 0 }), 10));
    const ids = steps.map((s) => (s.ok ? s.id : -1));
    // normal priority: may steal 'b' (prio 0, oldest of the stealable ones), not 'a' (prio 2)
    const d = l.admit('d', 0.5, rule({ prio: 1 }), 10);
    expect(d.ok && d.evict).toBe(ids[1]);
    expect(l.count(0.5)).toBe(3);
    // an expendable sound may only steal another expendable one
    const e = l.admit('e', 0.6, rule({ prio: 0 }), 10);
    expect(e.ok && e.evict).toBe(ids[2]);
    expect(l.ids(0.6)).not.toContain(ids[1]);
    expect(l.ids(0.6)).toContain(ids[0]);
    // nothing at or below its priority: rejected
    const full = new VoiceLimiter(2);
    full.admit('boss', 0, rule({ prio: 2 }), 10);
    full.admit('ui', 0, rule({ prio: 2 }), 10);
    expect(full.admit('step', 0.1, rule({ prio: 0 }), 10)).toEqual({ ok: false, reason: 'global' });
    expect(full.count(0.1)).toBe(2);
  });

  it('stays bounded over a long burst of requests', () => {
    const l = new VoiceLimiter(16);
    let t = 0;
    for (let i = 0; i < 20000; i++) {
      t += 0.004;
      l.admit(['hit', 'mote', 'swing', 'footstep'][i % 4]!, t, rule({ max: 4, gap: 0.03 }), 0.3);
      expect(l.count(t)).toBeLessThanOrEqual(16);
    }
  });
});

describe('MoteSequencer', () => {
  it('climbs the pentatonic scale during a run and softens it, then resets after a pause', () => {
    let seed = 1;
    const rand = (): number => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const m = new MoteSequencer(0.6, 9, rand);
    const run = Array.from({ length: 30 }, (_, i) => m.next(i * 0.05));
    for (const n of run) expect(MOTE_SCALE).toContain(((n.semis % 12) + 12) % 12);
    // mostly rising within the run (wraps are the exceptions)
    let rises = 0;
    for (let i = 1; i < run.length; i++) if (run[i]!.semis > run[i - 1]!.semis) rises++;
    expect(rises).toBeGreaterThan(20);
    // never more than ~2 octaves of spread, and later motes are quieter than the first
    expect(Math.max(...run.map((n) => n.semis))).toBeLessThanOrEqual(24);
    expect(run[29]!.gain).toBeLessThan(run[0]!.gain);
    expect(run[29]!.gain).toBeGreaterThanOrEqual(0.45);
    // after silence, back at the bottom with full gain
    const fresh = m.next(30 * 0.05 + 2);
    expect(fresh.semis).toBeLessThanOrEqual(2);
    expect(fresh.gain).toBe(1);
  });
});
