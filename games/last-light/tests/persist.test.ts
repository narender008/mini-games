// Settings and records survive anything localStorage can hand back: malformed JSON, hostile values,
// wrong types, a throwing or missing storage. And recordRun keeps the right bests.
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_RECORDS, DEFAULT_SETTINGS, loadRecords, loadSettings, recordRun, sanitizeRecords, sanitizeSettings,
  saveRecords, saveSettings, type Records,
} from '../src/persist';

const KEY_S = 'emberfall-last-light.settings.v1';
const KEY_R = 'emberfall-last-light.records.v1';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as { localStorage?: unknown };
afterEach(() => { delete g.localStorage; });

describe('sanitizeSettings', () => {
  it('keeps valid values', () => {
    const s = { master: 0.3, music: 0, sfx: 1, muted: true, shake: 'off', flashes: false, damageNumbers: false, aimAssist: true, textScale: 1.15 };
    expect(sanitizeSettings(s)).toEqual(s);
  });

  it('falls back to defaults for wrong types, NaN and Infinity', () => {
    const s = sanitizeSettings({
      master: '0.5', music: NaN, sfx: Infinity, muted: 'true', shake: 'extreme', flashes: 1, damageNumbers: null,
      aimAssist: {}, textScale: [1.3],
    });
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps out-of-range numbers into range', () => {
    const s = sanitizeSettings({ master: 1e308, music: -5, sfx: -0.0001, textScale: 99 });
    expect(s.master).toBe(1);
    expect(s.music).toBe(0);
    expect(s.sfx).toBe(0);
    expect(s.textScale).toBe(1.3);
    expect(sanitizeSettings({ textScale: 0.2 }).textScale).toBe(1);
  });

  it('ignores unknown keys and never lets a __proto__ key leak in', () => {
    const o = JSON.parse('{"__proto__": {"muted": true, "master": 0}, "evil": "<script>", "master": 0.4}');
    const s = sanitizeSettings(o);
    expect(s.muted).toBe(false);
    expect(s.master).toBe(0.4);
    expect(Object.keys(s).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    expect(({} as { muted?: boolean }).muted).toBeUndefined();
  });
});

describe('sanitizeRecords', () => {
  it('floors counts, clamps them and rejects non-positive or non-finite best times', () => {
    const r = sanitizeRecords({ runs: 3.9, wins: -2, bestTime: -10, bestDepth: 1000, mostKills: 1e300, lastWeapon: 'sunlance' });
    expect(r).toEqual({ runs: 3, wins: 0, bestTime: null, bestDepth: 99, mostKills: 1e6, lastWeapon: 'sunlance' });
    expect(sanitizeRecords({ bestTime: 0 }).bestTime).toBeNull();
    expect(sanitizeRecords({ bestTime: NaN }).bestTime).toBeNull();
    expect(sanitizeRecords({ bestTime: Infinity }).bestTime).toBeNull();
    expect(sanitizeRecords({ bestTime: '300' }).bestTime).toBeNull();
    expect(sanitizeRecords({ bestTime: 312.5 }).bestTime).toBe(312.5);
  });

  it('defaults an unknown weapon and wrong types', () => {
    expect(sanitizeRecords({ lastWeapon: 'bazooka', runs: '7', wins: true })).toEqual(DEFAULT_RECORDS);
  });
});

describe('load / save through localStorage', () => {
  it('round-trips settings and records', () => {
    g.localStorage = new MemStorage();
    const s = { ...DEFAULT_SETTINGS, muted: true, master: 0.25, shake: 'reduced' as const };
    saveSettings(s);
    expect(loadSettings()).toEqual(s);
    const r: Records = { ...DEFAULT_RECORDS, runs: 4, wins: 1, bestTime: 900, lastWeapon: 'sunlance' };
    saveRecords(r);
    expect(loadRecords()).toEqual(r);
  });

  it('returns defaults for malformed or hostile stored text', () => {
    const st = new MemStorage();
    g.localStorage = st;
    for (const raw of ['{', 'null', '[1,2,3]', '"a string"', '42', 'true', 'undefined', '{"master":', '\u0000\u0001', '{"master": 1e999}']) {
      st.setItem(KEY_S, raw);
      st.setItem(KEY_R, raw);
      expect(loadSettings(), raw).toEqual(DEFAULT_SETTINGS);
      expect(loadRecords(), raw).toEqual(DEFAULT_RECORDS);
    }
    // Partially valid: keep what is good.
    st.setItem(KEY_S, JSON.stringify({ muted: true, master: 'loud' }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, muted: true });
  });

  it('survives a missing storage and a storage that throws on every call', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    g.localStorage = {
      getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('QuotaExceededError'); },
    };
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadRecords()).toEqual(DEFAULT_RECORDS);
    expect(() => saveSettings({ ...DEFAULT_SETTINGS, muted: true })).not.toThrow();
    expect(() => saveRecords(DEFAULT_RECORDS)).not.toThrow();
  });
});

describe('recordRun', () => {
  const fresh = (): Records => ({ ...DEFAULT_RECORDS });

  it('counts runs and wins and keeps the fastest winning time only', () => {
    const r = fresh();
    expect(recordRun(r, { won: false, time: 100, depth: 3, kills: 20, weapon: 'lantern' })).toEqual({ time: false, depth: true, kills: true });
    expect(r.bestTime).toBeNull(); // a loss never sets a best time, however quick
    expect(recordRun(r, { won: true, time: 900, depth: 8, kills: 100, weapon: 'sunlance' })).toEqual({ time: true, depth: true, kills: true });
    expect(recordRun(r, { won: true, time: 1000, depth: 8, kills: 50, weapon: 'lantern' })).toEqual({ time: false, depth: false, kills: false });
    expect(recordRun(r, { won: true, time: 800, depth: 8, kills: 101, weapon: 'lantern' })).toEqual({ time: true, depth: false, kills: true });
    expect(r).toEqual({ runs: 4, wins: 3, bestTime: 800, bestDepth: 8, mostKills: 101, lastWeapon: 'lantern' });
  });

  it('a tie does not count as a new best', () => {
    const r = { ...fresh(), bestDepth: 5, mostKills: 40 };
    expect(recordRun(r, { won: false, time: 1, depth: 5, kills: 40, weapon: 'lantern' })).toEqual({ time: false, depth: false, kills: false });
  });
});
