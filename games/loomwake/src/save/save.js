// Loomwake saves: three profiles, each kept in two rotating slots (A and B)
// with a sequence number and a checksum, versioned with a migration chain,
// plus settings in their own key so a bad game save never resets them.
//
// Keys (localStorage):
//   loomwake.p<0..2>.a / loomwake.p<0..2>.b   slot  { v, seq, sum, at, meta, run }
//   loomwake.settings                          { v, ...settings }
//   loomwake.lastProfile                       "0" | "1" | "2"
//
// sum = checksum({ meta, run }) (FNV-1a over the JSON, 8 hex digits).
// Loading a profile: parse both slots; a slot is valid when it parses, has a
// numeric v <= VERSION and its sum matches. The valid slot with the highest seq
// wins and is migrated up to VERSION. A corrupt A falls back to B and vice
// versa; both corrupt gives a fresh profile (flagged `recovered`), never a
// throw. A slot whose v is newer than VERSION was written by a newer build: the
// profile is marked read-only with a message and its keys are never written.
// Writes go to the slot that does not hold the newest valid save, so a crash
// mid-write always leaves the previous checkpoint intact.
//
// Under ?debug writes go to an in-memory store unless ?save=1.
//
// ---------------------------------------------------------------------------
// Meta schema (v3), one per profile. run.js, story.js, boons/tapestry and the
// UI all read these fields; freshMeta() is the authoritative default.
//   createdAt, playTime (s)
//   currency  { lumen, keys, shards }           Lumen -> Tapestry, Silk Keys -> weapons/rows, Dream Shards -> gifts/Pell
//   tapestry  { nodeId: rank }                   content/tapestry.js purchases; tapestryOpen [ids] rows opened with Silk Keys
//   unlocks   { weapons: ['blade', ...], keepsakes: [ids], aspects: [ids], pacts: bool }
//   loadout   { weapon, keepsake, aspect }       chosen in the hub, used by the next run (keepsake ids 'keepsake.<key>')
//   keepsakeXp { key: chambers cleared carrying it } (ranks in content/keepsakes.js)
//   pacts     { pactId: rank }                   active Fraying pacts (after first clear)
//   assist    { gentle: bool, level: n }         Gentle mode; level grows by one per death while on (cap 10)
//   stats     { started (runs begun), runs (runs finished: death or win), deaths, wins (Sable beaten), clears, quits, kills, chambers, deepest, fastest (s|null), streak,
//               bossWins {id:n}, bossLosses {id:n}, bossMeets {id:n}, deathsBy {kind:n},
//               weaponRuns {id:n}, patronPicks {id:n}, braids [ids], regionsReached {id:n},
//               lastRun { result, region, chamber, depth, killer, boss, weapon, time } | null }
//   flags     { name: true|number }              story flags (sim/story.js)
//   seen      { lineId: times }                  dialogue lines shown
//   reveals   [ids]                              story reveals unlocked ('sable', 'sleep', 'halves')
//   memories  [ids]                              Memory Threads found (12 in content/memories.js)
//   affinity  { npcId: n }                       relationship points
//   gifts     { npcId: n }                       gifts given
//   ending    null | 'first' | 'true'            best ending reached
//   codex     { foes: {kind: n}, boons: {id: n} }
// Run checkpoint (null in the hub) is written by sim/run.js: see snapshotRun().
// ---------------------------------------------------------------------------
// Schema history (fixtures below build a valid save of each):
//   v1  meta flat: { lumen, keys, runs, deaths, wins, weapons:[ids], seen:[ids], flags }
//       run { seed, rng (one uint32), region (index), chamber, hp, boons:[ids] }
//   v2  meta { currency{lumen,keys,shards}, stats{runs,deaths,wins}, story{seen:[ids],flags},
//              unlocks{weapons}, tapestry{} }
//       run { seed, rng (one uint32), region (id), chamber, hp, maxHp, boons:[{id,rarity}] }
//   v3  current (above); run.rng is { run, ai, combat } states, boons carry level.

export const VERSION = 3;
export const PROFILES = 3;
export const PREFIX = 'loomwake';
export const KEYS = {
  slot: (p, s) => `${PREFIX}.p${p}.${s}`,
  settings: `${PREFIX}.settings`,
  lastProfile: `${PREFIX}.lastProfile`,
};
const SLOTS = ['a', 'b'];

// ---------- checksum ----------
export function checksum(obj) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj === undefined ? null : obj);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const sumOf = (meta, run) => checksum({ meta: meta ?? null, run: run ?? null });

// ---------- defaults ----------
export function freshMeta(now = 0) {
  return {
    createdAt: now, playTime: 0,
    currency: { lumen: 0, keys: 0, shards: 0 },
    tapestry: {}, tapestryOpen: [],
    unlocks: { weapons: ['blade'], keepsakes: [], aspects: [], pacts: false },
    loadout: { weapon: 'blade', keepsake: null, aspect: null },
    keepsakeXp: {},
    pacts: {},
    assist: { gentle: false, level: 0 },
    stats: {
      started: 0, runs: 0, deaths: 0, wins: 0, clears: 0, quits: 0, kills: 0, chambers: 0, deepest: 0, fastest: null, streak: 0,
      bossWins: {}, bossLosses: {}, bossMeets: {}, deathsBy: {}, weaponRuns: {}, patronPicks: {},
      braids: [], regionsReached: {}, lastRun: null,
    },
    flags: {}, seen: {}, reveals: [], memories: [], affinity: {}, gifts: {},
    ending: null,
    // story's per-run and per-hub-visit scratch (src/sim/story.js ensureStoryMeta)
    storyRun: { active: false, patrons: {}, region: null, chambers: 0, barked: false, winsAtStart: 0, lastBarkT: -99, talked: {}, weapon: null },
    storyHub: { visit: 0, talked: {} },
    codex: { foes: {}, boons: {} },
  };
}

export function defaultSettings() {
  return {
    v: 1,
    volume: { master: 0.8, music: 0.7, sfx: 0.9, voice: 0.8 },
    quality: 'auto', shake: 1, flashes: true, colorblind: false, textSpeed: 1,
    aimAssist: 0.5, touch: 'auto', damageNumbers: true, showFps: false,
    bindings: {},
  };
}

// Fill missing fields of a (possibly older or hand-edited) meta from the defaults,
// keeping every value that is present and of a compatible type.
export function normalizeMeta(m) {
  const d = freshMeta(m && m.createdAt || 0);
  return fill(d, m && typeof m === 'object' ? m : {});
}
function fill(d, m) {
  if (Array.isArray(d)) return Array.isArray(m) ? m : d;
  if (d && typeof d === 'object') {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return d;
    const out = { ...m };
    for (const k of Object.keys(d)) out[k] = k in m ? fill(d[k], m[k]) : d[k];
    return out;
  }
  if (d === null) return m === undefined ? null : m;
  return typeof m === typeof d ? m : d;
}

// ---------- migrations ----------
// migrations[v] upgrades a save envelope of version v to v + 1.
const MIG = {
  1: (s) => {
    const m = s.meta || {};
    const seen = Array.isArray(m.seen) ? m.seen : [];
    const meta = {
      currency: { lumen: m.lumen | 0, keys: m.keys | 0, shards: 0 },
      stats: { runs: m.runs | 0, deaths: m.deaths | 0, wins: m.wins | 0 },
      story: { seen, flags: m.flags && typeof m.flags === 'object' ? m.flags : {} },
      unlocks: { weapons: Array.isArray(m.weapons) && m.weapons.length ? m.weapons : ['blade'] },
      tapestry: {},
    };
    const R = ['glasswood', 'choir', 'forge', 'unwoven'];
    const r = s.run;
    const run = r ? {
      seed: r.seed >>> 0, rng: r.rng >>> 0, region: R[r.region | 0] || 'glasswood', chamber: r.chamber | 0,
      hp: r.hp ?? 100, maxHp: 100, boons: (r.boons || []).map((id) => ({ id, rarity: 'common' })),
    } : null;
    return { ...s, v: 2, meta, run };
  },
  2: (s) => {
    const m = s.meta || {};
    const meta = freshMeta(s.at || 0);
    meta.currency = { ...meta.currency, ...(m.currency || {}) };
    Object.assign(meta.stats, m.stats || {});
    meta.unlocks.weapons = (m.unlocks && m.unlocks.weapons) || ['blade'];
    meta.tapestry = m.tapestry || {};
    const st = m.story || {};
    for (const id of st.seen || []) meta.seen[id] = 1;
    meta.flags = st.flags || {};
    const r = s.run;
    let run = null;
    if (r) {
      const seed = r.seed >>> 0;
      run = {
        v: 3, seed, rng: { run: r.rng >>> 0, ai: (seed ^ 0xa1) >>> 0, combat: (seed ^ 0xc0) >>> 0 },
        region: r.region || 'glasswood', regionIndex: Math.max(0, ['glasswood', 'choir', 'forge', 'unwoven'].indexOf(r.region)),
        chamber: r.chamber | 0, depth: r.chamber | 0, weapon: 'blade', keepsake: null,
        hp: r.hp ?? 100, maxHp: r.maxHp ?? 100, deathDefiance: 0, rerolls: 0, currency: 0,
        boons: (r.boons || []).map((b) => ({ id: b.id, rarity: b.rarity || 'common', level: 1 })),
        path: [], stats: { kills: 0, damageTaken: 0, time: 0, chambers: 0 }, migrated: 2,
      };
    }
    return { ...s, v: 3, meta, run };
  },
};
export const migrations = MIG;
export const migrationList = Object.keys(MIG).map(Number).sort((a, b) => a - b);

// Upgrade an envelope { v, meta, run, ... } to VERSION. Throws on a bad shape;
// callers catch. A save already at VERSION is normalized only.
export function migrate(save) {
  let s = { ...save };
  let guard = 0;
  while (s.v < VERSION) {
    const f = MIG[s.v];
    if (!f || guard++ > 20) throw new Error(`no migration from v${s.v}`);
    s = f(s);
  }
  s.meta = normalizeMeta(s.meta);
  if (s.run !== null && (typeof s.run !== 'object' || Array.isArray(s.run))) s.run = null;
  return s;
}

// A valid save of an old version v (for tests: every migration step from a fixture).
export function fixture(v = VERSION, opts = {}) {
  const at = opts.at ?? 1760000000000;
  const seq = opts.seq ?? 1;
  let meta, run;
  if (v === 1) {
    meta = { lumen: 120, keys: 2, runs: 4, deaths: 3, wins: 1, weapons: ['blade', 'spear'], seen: ['orrin.intro.1', 'sable.firstDeath'], flags: { metOrrin: true } };
    run = { seed: 4242, rng: 987654321, region: 1, chamber: 3, hp: 61, boons: ['solenne.attack', 'maru.dash'] };
  } else if (v === 2) {
    meta = {
      currency: { lumen: 300, keys: 3, shards: 5 }, stats: { runs: 7, deaths: 5, wins: 2 },
      story: { seen: ['orrin.intro.1', 'veyl.reveal'], flags: { metOrrin: true, reveal1: true } },
      unlocks: { weapons: ['blade', 'bow'] }, tapestry: { vigor: 2 },
    };
    run = { seed: 777, rng: 123456789, region: 'forge', chamber: 5, hp: 80, maxHp: 120, boons: [{ id: 'veyra.attack', rarity: 'rare' }] };
  } else if (v === VERSION) {
    meta = freshMeta(at);
    meta.currency.lumen = 50; meta.stats.runs = 1;
    run = null;
  } else {
    throw new Error(`no fixture for v${v}`);
  }
  if (opts.noRun) run = null;
  return { v, seq, sum: sumOf(meta, run), at, meta, run };
}

// ---------- storage ----------
// A store is { getItem, setItem, removeItem, keys() }. memoryStore keeps data in a Map.
export function memoryStore(init) {
  const m = new Map(init ? Object.entries(init) : []);
  return {
    kind: 'memory',
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    keys: () => [...m.keys()],
    map: m,
  };
}
export function wrapStorage(ls) {
  return {
    kind: 'local',
    getItem: (k) => { try { return ls.getItem(k); } catch { return null; } },
    setItem: (k, v) => { ls.setItem(k, v); },
    removeItem: (k) => { try { ls.removeItem(k); } catch { /* ignore */ } },
    keys: () => { const out = []; try { for (let i = 0; i < ls.length; i++) out.push(ls.key(i)); } catch { /* ignore */ } return out; },
  };
}
// Pick the store for this page: memory under ?debug unless ?save=1, else localStorage
// (falling back to memory if it is unavailable, e.g. blocked site data).
export function pickStore(search = '') {
  const q = new URLSearchParams(search || '');
  const debug = q.has('debug');
  const real = !debug || q.get('save') === '1';
  if (real) {
    try {
      const ls = globalThis.localStorage;
      const probe = `${PREFIX}.__probe`;
      ls.setItem(probe, '1'); ls.removeItem(probe);
      return wrapStorage(ls);
    } catch { /* fall through */ }
  }
  return memoryStore();
}

// ---------- slot parsing ----------
// -> { status: 'empty'|'ok'|'corrupt'|'future', save?, v?, seq?, error? }
export function parseSlot(raw) {
  if (raw === null || raw === undefined || raw === '') return { status: 'empty' };
  let s;
  try { s = JSON.parse(raw); } catch { return { status: 'corrupt', error: 'unreadable' }; }
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { status: 'corrupt', error: 'not an object' };
  const v = s.v;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 1 || Math.floor(v) !== v) return { status: 'corrupt', error: 'no version' };
  if (v > VERSION) return { status: 'future', v, seq: Number(s.seq) || 0 };
  if (typeof s.seq !== 'number' || !Number.isFinite(s.seq)) return { status: 'corrupt', error: 'no sequence' };
  if (!('meta' in s) || !s.meta || typeof s.meta !== 'object') return { status: 'corrupt', error: 'no meta' };
  if (s.sum !== sumOf(s.meta, s.run)) return { status: 'corrupt', error: 'checksum mismatch', v, seq: s.seq };
  return { status: 'ok', save: s, v, seq: s.seq };
}

// ---------- the save manager ----------
export function createSaves({ store, now = () => Date.now() } = {}) {
  store = store || memoryStore();
  const prof = []; // per profile: { slot (newest valid), seq, readOnly, message, recovered }

  function info(p) { return prof[p] || (prof[p] = { slot: null, seq: 0, readOnly: false, message: '', recovered: false, loaded: false }); }

  // Read what the loader would pick for profile p. Never throws.
  function load(p) {
    const st = info(p);
    const out = { profile: p, empty: true, ok: false, slot: null, seq: 0, v: VERSION, meta: null, run: null, readOnly: false, message: '', recovered: false, at: 0 };
    try {
      const slots = SLOTS.map((s) => ({ s, ...parseSlot(store.getItem(KEYS.slot(p, s))) }));
      const future = slots.filter((x) => x.status === 'future');
      const ok = slots.filter((x) => x.status === 'ok').sort((a, b) => b.seq - a.seq);
      const corrupt = slots.filter((x) => x.status === 'corrupt');
      st.seq = Math.max(0, ...slots.map((x) => Number(x.seq) || 0));
      if (future.length) {
        st.readOnly = true;
        st.message = `This profile was saved by a newer version of Loomwake (v${Math.max(...future.map((f) => f.v))}). It is kept safe and will not be changed here.`;
        Object.assign(out, { empty: false, readOnly: true, message: st.message, v: future[0].v, seq: st.seq, meta: freshMeta(now()) });
        st.slot = null; st.loaded = true;
        return out;
      }
      st.readOnly = false; st.message = '';
      for (const c of ok) {
        try {
          const m = migrate(c.save);
          st.slot = c.s; st.recovered = corrupt.length > 0;
          Object.assign(out, { empty: false, ok: true, slot: c.s, seq: c.seq, v: c.v, meta: m.meta, run: m.run || null, at: c.save.at || 0, recovered: st.recovered, migratedFrom: c.v < VERSION ? c.v : undefined });
          if (st.recovered) out.message = st.message = 'One save slot was damaged; the other copy was used.';
          st.loaded = true;
          return out;
        } catch { /* migration failed: treat as corrupt and try the next */ }
      }
      st.slot = null;
      st.recovered = corrupt.length > 0 || ok.length > 0;
      out.meta = freshMeta(now());
      out.recovered = st.recovered;
      if (st.recovered) out.message = st.message = 'The save for this profile was damaged and could not be read. A fresh start is ready.';
    } catch (err) {
      out.meta = freshMeta(now());
      out.recovered = true;
      out.message = st.message = 'Saves could not be read on this device.';
    }
    st.loaded = true;
    return out;
  }

  // Write { meta, run } for profile p into the slot not holding the newest save.
  function write(p, meta, run = null) {
    const st = info(p);
    if (!st.loaded) load(p);
    if (st.readOnly) return { ok: false, error: 'read-only', readOnly: true };
    const slot = st.slot === 'a' ? 'b' : 'a';
    const seq = st.seq + 1;
    const env = { v: VERSION, seq, sum: sumOf(meta, run), at: now(), meta, run: run ?? null };
    try {
      store.setItem(KEYS.slot(p, slot), JSON.stringify(env));
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }
    st.slot = slot; st.seq = seq; st.recovered = false; st.message = '';
    return { ok: true, slot, seq, at: env.at, key: KEYS.slot(p, slot) };
  }

  // Summaries for the title screen's three profile cards.
  function profiles() {
    const out = [];
    for (let i = 0; i < PROFILES; i++) {
      const r = load(i);
      const m = r.meta || freshMeta();
      const st = m.stats || {};
      out.push({
        i, empty: r.empty, readOnly: r.readOnly, message: r.message, recovered: r.recovered,
        runs: st.runs | 0, wins: st.wins | 0, deaths: st.deaths | 0, clears: st.clears | 0,
        lumen: (m.currency && m.currency.lumen) | 0, playTime: m.playTime || 0,
        region: r.run ? r.run.region : null, chamber: r.run ? r.run.chamber : null, hasRun: !!r.run,
        ending: m.ending || null, at: r.at || 0, name: m.name || null,
        best: ['veyl', 'morrow', 'aurum', 'sable'].filter((id) => ((st.bossWins || {})[id] | 0) > 0).length,
        deepest: st.deepest | 0, keys: (m.currency && m.currency.keys) | 0, shards: (m.currency && m.currency.shards) | 0,
      });
    }
    return out;
  }

  function wipe(p) {
    const list = p === undefined || p === null ? [...Array(PROFILES).keys()] : [p];
    for (const i of list) {
      for (const s of SLOTS) store.removeItem(KEYS.slot(i, s));
      prof[i] = null;
    }
    if (p === undefined || p === null) { store.removeItem(KEYS.settings); store.removeItem(KEYS.lastProfile); }
  }

  // ---- settings ----
  function loadSettings() {
    const d = defaultSettings();
    try {
      const raw = store.getItem(KEYS.settings);
      if (!raw) return d;
      const s = JSON.parse(raw);
      if (!s || typeof s !== 'object' || Array.isArray(s)) return d;
      return fill(d, s);
    } catch { return d; }
  }
  function saveSettings(s) {
    try { store.setItem(KEYS.settings, JSON.stringify({ ...s, v: 1 })); return true; } catch { return false; }
  }
  function lastProfile() {
    try { const n = parseInt(store.getItem(KEYS.lastProfile), 10); return n >= 0 && n < PROFILES ? n : 0; } catch { return 0; }
  }
  function setLastProfile(p) { try { store.setItem(KEYS.lastProfile, String(p | 0)); } catch { /* ignore */ } }

  // ---- export / import ----
  function exportProfile(p, meta, run) {
    let m = meta, r = run;
    if (m === undefined) { const l = load(p); m = l.meta; r = l.run; }
    const doc = { game: 'loomwake', kind: 'profile', v: VERSION, at: now(), profile: p, meta: m, run: r ?? null };
    doc.sum = sumOf(doc.meta, doc.run);
    return JSON.stringify(doc, null, 1);
  }
  // Validate an exported string and write it into profile p (as the newest slot).
  // -> { ok, error?, meta?, run? }
  function importProfile(p, str) {
    let doc;
    try { doc = typeof str === 'string' ? JSON.parse(str) : str; } catch { return { ok: false, error: 'That file is not a Loomwake save (unreadable).' }; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, error: 'That file is not a Loomwake save.' };
    if (doc.game !== undefined && doc.game !== 'loomwake') return { ok: false, error: 'That file is a save for another game.' };
    if (typeof doc.v !== 'number' || doc.v < 1) return { ok: false, error: 'That save has no version.' };
    if (doc.v > VERSION) return { ok: false, error: `That save is from a newer version of Loomwake (v${doc.v}).` };
    if (!doc.meta || typeof doc.meta !== 'object') return { ok: false, error: 'That save has no profile data.' };
    if (doc.sum !== sumOf(doc.meta, doc.run)) return { ok: false, error: 'That save is damaged (checksum mismatch).' };
    let m;
    try { m = migrate({ v: doc.v, meta: doc.meta, run: doc.run ?? null }); } catch (e) { return { ok: false, error: 'That save could not be upgraded.' }; }
    const st = info(p);
    if (!st.loaded) load(p);
    if (st.readOnly) return { ok: false, error: 'This profile was saved by a newer version and is read-only.' };
    const w = write(p, m.meta, m.run);
    if (!w.ok) return { ok: false, error: `Could not write the save (${w.error}).` };
    return { ok: true, meta: m.meta, run: m.run, slot: w.slot, seq: w.seq };
  }

  function keys() {
    return store.keys().filter((k) => k === KEYS.settings || k === KEYS.lastProfile || k.startsWith(`${PREFIX}.p`)).sort();
  }

  return {
    store, load, write, profiles, wipe, keys,
    loadSettings, saveSettings, lastProfile, setLastProfile,
    exportProfile, importProfile,
    status: (p) => ({ ...info(p) }),
    key: (p) => KEYS.slot(p, info(p).slot || 'a'),
    lastWrite: null,
  };
}

// Ask the browser to keep site data (Safari evicts after weeks otherwise).
export function requestPersist() {
  try {
    const s = globalThis.navigator && navigator.storage;
    if (s && s.persist) return s.persisted().then((was) => (was ? true : s.persist())).catch(() => false);
  } catch { /* ignore */ }
  return Promise.resolve(false);
}

// Save a checkpoint when the page is hidden or closed. `fn` is called (guarded).
export function onLeave(fn) {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {};
  const hide = () => { try { fn('pagehide'); } catch (e) { console.warn('[loomwake] save on leave failed', e); } };
  const vis = () => { if (document.visibilityState === 'hidden') { try { fn('hidden'); } catch (e) { console.warn('[loomwake] save on hide failed', e); } } };
  window.addEventListener('pagehide', hide);
  document.addEventListener('visibilitychange', vis);
  return () => { window.removeEventListener('pagehide', hide); document.removeEventListener('visibilitychange', vis); };
}

// The `__lw.save` debug API. `G.saves` is the manager created by run.js boot();
// `G.flow` holds run.js callbacks { checkpoint(G), reloadProfile(G), snapshot(G) }.
export function saveApi(G) {
  const mgr = () => G.saves;
  return {
    version: VERSION,
    migrations: migrationList.slice(),
    keys: () => (mgr() ? mgr().keys() : []),
    now: () => (G.flow && G.flow.checkpoint ? G.flow.checkpoint(G, 'debug') : { ok: false, error: 'no game' }),
    read: () => {
      if (!mgr()) return { ok: false };
      const r = mgr().load(G.profile | 0);
      return { slot: r.slot, seq: r.seq, v: r.v, ok: r.ok, empty: r.empty, readOnly: r.readOnly, recovered: r.recovered, message: r.message, hasRun: !!r.run, at: r.at };
    },
    export: () => {
      if (!mgr()) return '';
      const snap = G.flow && G.flow.snapshot ? G.flow.snapshot(G) : null;
      return snap ? mgr().exportProfile(G.profile | 0, snap.meta, snap.run) : mgr().exportProfile(G.profile | 0);
    },
    import: (str) => {
      if (!mgr()) return { ok: false, error: 'no game' };
      const r = mgr().importProfile(G.profile | 0, str);
      if (r.ok && G.flow && G.flow.reloadProfile) G.flow.reloadProfile(G);
      return { ok: r.ok, error: r.error };
    },
    fixture: (v) => fixture(v),
    checksum: (obj) => checksum(obj),
    wipe: (p) => { if (mgr()) mgr().wipe(p); if (G.flow && G.flow.reloadProfile) G.flow.reloadProfile(G); return true; },
    raw: (k) => (mgr() ? mgr().store.getItem(k) : null),
    write: (k, v) => { if (mgr()) mgr().store.setItem(k, v); },
  };
}
