// Settings and best-run records in localStorage. Every read is validated: missing, malformed or
// out-of-range values fall back to defaults, and storage errors (private mode, quota) are ignored.
export interface Settings {
  master: number; music: number; sfx: number; muted: boolean;
  shake: 'full' | 'reduced' | 'off';
  flashes: boolean; // false = reduced flashes
  damageNumbers: boolean;
  aimAssist: boolean;
  textScale: number; // 1 or 1.15 or 1.3
}
export interface Records { runs: number; wins: number; bestTime: number | null; bestDepth: number; mostKills: number; lastWeapon: 'lantern' | 'sunlance' }

export const DEFAULT_SETTINGS: Settings = { master: 0.8, music: 0.6, sfx: 0.85, muted: false, shake: 'full', flashes: true, damageNumbers: true, aimAssist: false, textScale: 1 };
export const DEFAULT_RECORDS: Records = { runs: 0, wins: 0, bestTime: null, bestDepth: 0, mostKills: 0, lastWeapon: 'lantern' };

const KEY_S = 'emberfall-last-light.settings.v1';
const KEY_R = 'emberfall-last-light.records.v1';

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : d);

function read(key: string): Record<string, unknown> {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
function write(key: string, v: unknown) { try { globalThis.localStorage?.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }

export function sanitizeSettings(o: Record<string, unknown>): Settings {
  const d = DEFAULT_SETTINGS;
  return {
    master: num(o.master, 0, 1, d.master), music: num(o.music, 0, 1, d.music), sfx: num(o.sfx, 0, 1, d.sfx),
    muted: bool(o.muted, d.muted), shake: oneOf(o.shake, ['full', 'reduced', 'off'] as const, d.shake),
    flashes: bool(o.flashes, d.flashes), damageNumbers: bool(o.damageNumbers, d.damageNumbers),
    aimAssist: bool(o.aimAssist, d.aimAssist), textScale: num(o.textScale, 1, 1.3, d.textScale),
  };
}
export function sanitizeRecords(o: Record<string, unknown>): Records {
  const d = DEFAULT_RECORDS;
  const bt = o.bestTime;
  return {
    runs: Math.floor(num(o.runs, 0, 1e7, d.runs)), wins: Math.floor(num(o.wins, 0, 1e7, d.wins)),
    bestTime: typeof bt === 'number' && Number.isFinite(bt) && bt > 0 ? bt : null,
    bestDepth: Math.floor(num(o.bestDepth, 0, 99, d.bestDepth)), mostKills: Math.floor(num(o.mostKills, 0, 1e6, d.mostKills)),
    lastWeapon: oneOf(o.lastWeapon, ['lantern', 'sunlance'] as const, d.lastWeapon),
  };
}

export const loadSettings = () => sanitizeSettings(read(KEY_S));
export const saveSettings = (s: Settings) => write(KEY_S, s);
export const loadRecords = () => sanitizeRecords(read(KEY_R));
export const saveRecords = (r: Records) => write(KEY_R, r);

/** Fold a finished run into the records. Returns which records were beaten. */
export function recordRun(r: Records, run: { won: boolean; time: number; depth: number; kills: number; weapon: 'lantern' | 'sunlance' }) {
  const beat = { time: false, depth: false, kills: false };
  r.runs++;
  if (run.won) {
    r.wins++;
    if (r.bestTime === null || run.time < r.bestTime) { r.bestTime = run.time; beat.time = true; }
  }
  if (run.depth > r.bestDepth) { r.bestDepth = run.depth; beat.depth = true; }
  if (run.kills > r.mostKills) { r.mostKills = run.kills; beat.kills = true; }
  r.lastWeapon = run.weapon;
  return beat;
}
