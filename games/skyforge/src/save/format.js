// Skyforge save format: checksums, slot envelopes, versions and migrations.
// Pure functions, no DOM: node imports this for tests and dev runners.
//
// Slot value (localStorage `skyforge.p<0..2>.<a|b>`):
//   { v, seq, sum, at, play, data }
//     v     schema version (VERSION in src/config.js)
//     seq   write counter for the profile; the newest valid slot wins
//     sum   checksum(data): FNV-1a over JSON.stringify(data), 8 hex digits
//     at    real wall-clock ms when written (drives offline catch-up)
//     play  real seconds played on this colony (not covered by sum)
//     data  snapshot(G) from src/state.js
//
// Schema history (fixture(v) builds a valid save of each version):
//   v0  (synthetic, proves the migration path) envelope { v:0, seq, sum, at, game }
//       with sum = checksum(game). Inside: coin and insight in `treasury`, the
//       calendar in `clock { t, day, tod }`, the chapter 0-based as goals.ch,
//       and no `difficulty` (every v0 colony was 'standard').
//   v1  current: the G of src/state.js, coin/insight on G.colony.
import { VERSION } from '../config.js';

export { VERSION };
export const PREFIX = 'skyforge';
export const PROFILES = 3;
export const SLOTS = ['a', 'b'];
export const KEYS = {
  slot: (p, s) => `${PREFIX}.p${p}.${s}`,
  settings: `${PREFIX}.settings`,
  last: `${PREFIX}.last`,
};

// ---------- checksum ----------
export function checksum(obj) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj === undefined ? null : obj);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const payloadOf = (s) => (s.v >= 1 ? s.data : s.game);

// ---------- migrations ----------
// MIGRATIONS[v](envelope of version v) -> envelope of version v + 1.
export const MIGRATIONS = {
  0: (s) => {
    const g = { ...(s.game || {}) };
    const tr = isObj(g.treasury) ? g.treasury : {};
    g.colony = { ...(g.colony || {}), coin: +tr.coin || 0, insight: +tr.insight || 0 };
    delete g.treasury;
    const clock = isObj(g.clock) ? g.clock : {};
    g.t = +clock.t || 0; g.day = +clock.day || 1; g.tod = clock.tod ?? 0.3;
    delete g.clock;
    if (isObj(g.goals)) {
      const { ch, ...rest } = g.goals;
      g.goals = { ...rest, chapter: (ch | 0) + 1 };
    }
    if (!g.difficulty) g.difficulty = 'standard';
    g.v = 1;
    const { game, ...env } = s;
    return { ...env, v: 1, data: g, sum: checksum(g) };
  },
};
export const migrationList = Object.keys(MIGRATIONS).map(Number).sort((a, b) => a - b);

// Upgrade an envelope to VERSION. Throws on a missing step or a bad result.
export function migrate(env) {
  let s = { ...env };
  let guard = 0;
  while (s.v < VERSION) {
    const f = MIGRATIONS[s.v];
    if (!f || guard++ > 50) throw new Error(`no migration from v${s.v}`);
    s = f(s);
  }
  const why = validateData(s.data);
  if (why) throw new Error(why);
  s.data.v = VERSION;
  return s;
}

// Minimal shape check of a migrated data object; returns an error string or null.
export function validateData(d) {
  if (!isObj(d)) return 'no colony data';
  if (!Number.isFinite(d.seed)) return 'no seed';
  if (!Number.isFinite(d.t) || d.t < 0) return 'bad clock';
  if (!Array.isArray(d.islands) || !Array.isArray(d.buildings)) return 'no islands';
  if (!isObj(d.colony) || !isObj(d.pools) || !isObj(d.goals) || !isObj(d.research)) return 'missing sections';
  return null;
}

// ---------- slot parsing ----------
// -> { status: 'empty'|'ok'|'corrupt'|'future', env?, v?, seq?, error? }
export function parseSlot(raw) {
  if (raw === null || raw === undefined || raw === '') return { status: 'empty' };
  let s;
  try { s = JSON.parse(raw); } catch { return { status: 'corrupt', error: 'unreadable' }; }
  if (!isObj(s)) return { status: 'corrupt', error: 'not an object' };
  const v = s.v;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return { status: 'corrupt', error: 'no version' };
  const seq = Number.isFinite(s.seq) ? s.seq : 0;
  if (v > VERSION) return { status: 'future', v, seq, at: +s.at || 0 };
  if (!Number.isFinite(s.seq)) return { status: 'corrupt', error: 'no sequence', v };
  const p = payloadOf(s);
  if (!isObj(p)) return { status: 'corrupt', error: 'no data', v, seq };
  if (s.sum !== checksum(p)) return { status: 'corrupt', error: 'checksum mismatch', v, seq };
  return { status: 'ok', env: s, v, seq };
}

// Short summary for a profile card, from (migrated) data.
export function summarize(d, env = {}) {
  const coin = d.colony?.coin ?? d.pools?.colony?.res?.coin ?? 0;
  return {
    name: d.colony?.name || 'Colony',
    day: d.day | 0, pop: Math.round(d.colony?.pop || 0), chapter: d.goals?.chapter | 0,
    coin: Math.floor(coin), insight: Math.floor(d.colony?.insight || 0),
    islands: (d.islands || []).filter((i) => i.owned).length,
    buildings: (d.buildings || []).length,
    won: !!d.goals?.won, difficulty: d.difficulty || 'standard', seed: d.seed,
    time: d.t || 0, playtime: Math.round(+env.play || 0), at: +env.at || 0,
  };
}
