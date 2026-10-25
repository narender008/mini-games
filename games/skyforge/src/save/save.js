// Skyforge saves: three profiles, each in two alternating slots (A and B) with
// a sequence number and a checksum, versioned with a migration chain, plus
// settings and the last-used profile in their own keys.
//
// Keys (localStorage):
//   skyforge.p<0..2>.a / .b   slot { v, seq, sum, at, play, data } (see format.js)
//   skyforge.settings         { v, master, music, sfx, ambience, mute, quality, uiScale, tutorial,
//                               edgePan, colorBlind, reducedMotion, tooltips }
//   skyforge.last             "0" | "1" | "2"
//
// Loading a profile parses both slots. A slot is valid when it parses, has an
// integer v <= VERSION, a numeric seq and a matching sum, and migrates to a
// sane colony. The valid slot with the highest seq wins; a corrupt newest slot
// falls back to the other. Garbage in every key gives an empty profile, never
// a throw. A slot with v > VERSION was written by a newer build: the profile
// is reported (`future`, `message`) and its keys are never written.
// Writes go to the slot NOT holding the newest valid save, so a crash or a
// failed write always leaves the previous checkpoint intact.
//
// Storage: localStorage, except under ?debug without ?save=1, where an
// in-memory store is used (nothing touches localStorage).
//
// Offline catch-up (catchup.js): load() of a save older than a couple of
// minutes runs the colony forward headlessly (no raids/storms) and attaches
// non-enumerable `awaySeconds` and `awaySummary` to the returned data; the
// saver also emits app.ev 'away' { away, summary } right after main's 'loaded'.
// Off under ?debug (so save/load keeps the same hash()) unless ?away is given
// or __sf.save.away(seconds) asks for it.
//
// API (build brief addendum): createSaver(app) -> { list(), load(i), save(G, i,
// reason), wipe(i), settings{get,set}, exportProfile(i), importProfile(str, i),
// keyFor(i), last, lastProfile(), debug() } and createSaves({ store, now }) for
// node (same manager without the app glue).
import { snapshot } from '../state.js';
import { CFG } from '../config.js';
import { VERSION, PREFIX, PROFILES, SLOTS, KEYS, checksum, parseSlot, migrate, migrationList, summarize, validateData } from './format.js';
import { fixture } from './fixtures.js';
import { catchUp } from './catchup.js';

export { VERSION, KEYS, checksum, parseSlot, migrate, fixture };

// ---------- stores ----------
// A store is { kind, getItem, setItem, removeItem, keys() }.
export function memoryStore(init) {
  const m = new Map(init ? Object.entries(init) : []);
  return {
    kind: 'memory', map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    keys: () => [...m.keys()],
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
export function pickStore({ debug = false, save = false } = {}) {
  if (!debug || save) {
    try {
      const ls = globalThis.localStorage;
      const probe = `${PREFIX}.__probe`;
      ls.setItem(probe, '1'); ls.removeItem(probe);
      return wrapStorage(ls);
    } catch { /* blocked storage: fall back to memory */ }
  }
  return memoryStore();
}

// ---------- settings ----------
// Flat keys, as the UI, AUDIO, INPUT and RENDERER read them from app.settings.
const RANGE = { master: [0, 1], music: [0, 1], sfx: [0, 1], ambience: [0, 1], uiScale: [0.75, 1.5] };
const QUALITY = ['auto', 'high', 'medium', 'low'];
export function defaultSettings() {
  let reduced = false;
  try { reduced = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { /* node */ }
  return {
    v: 1,
    master: 0.8, music: 0.6, sfx: 0.8, ambience: 0.6,   // volumes 0..1
    mute: false,
    quality: 'auto',           // auto | high | medium | low
    edgePan: true,             // pan when the pointer rests at the screen edge (mouse only)
    colorBlind: false,         // colour-blind-safe palette for overlays, ranges and charts
    reducedMotion: reduced,    // fewer particles, no camera shake, gentler transitions
    tooltips: true,
    uiScale: 1,
    tutorial: true,
  };
}
// Keep known keys of the right type (numbers clamped to their range), defaults for the rest.
const clampSettings = (s) => {
  const d = defaultSettings();
  if (!s || typeof s !== 'object' || Array.isArray(s)) return d;
  const src = s.volume && typeof s.volume === 'object' ? { ...s.volume, ...s } : s;   // tolerate a nested volume block
  for (const k of Object.keys(d)) {
    if (k === 'v' || !(k in src)) continue;
    const m = src[k];
    if (typeof d[k] === 'number') { if (typeof m === 'number' && Number.isFinite(m)) { const [a, b] = RANGE[k] || [-Infinity, Infinity]; d[k] = Math.max(a, Math.min(b, m)); } }
    else if (k === 'quality') { if (QUALITY.includes(m)) d[k] = m; }
    else if (typeof m === typeof d[k]) d[k] = m;
  }
  return d;
};

// ---------- the save manager (no app, node-friendly) ----------
export function createSaves({ store = memoryStore(), now = () => Date.now() } = {}) {
  const prof = [];
  const info = (p) => prof[p] || (prof[p] = { slot: null, seq: 0, future: false, message: '', recovered: false, loaded: false });
  const okProfile = (p) => Number.isInteger(p) && p >= 0 && p < PROFILES;

  // Inspect profile p: what a load would pick. Never throws.
  function inspect(p) {
    const st = info(p);
    const out = { profile: p, empty: true, ok: false, slot: null, seq: 0, v: VERSION, env: null, future: false, recovered: false, message: '', slots: {} };
    try {
      const slots = SLOTS.map((s) => ({ s, ...parseSlot(store.getItem(KEYS.slot(p, s))) }));
      for (const x of slots) out.slots[x.s] = { status: x.status, seq: x.seq ?? null, v: x.v ?? null, error: x.error };
      st.seq = Math.max(0, ...slots.map((x) => Number(x.seq) || 0));
      const future = slots.filter((x) => x.status === 'future');
      if (future.length) {
        const fv = Math.max(...future.map((f) => f.v));
        st.future = true; st.slot = null;
        st.message = `Saved by a newer version of Skyforge Tycoon (save v${fv}, this game reads up to v${VERSION}). It is kept safe and will not be changed here.`;
        Object.assign(out, { empty: false, future: true, v: fv, seq: st.seq, message: st.message, at: Math.max(...future.map((f) => f.at || 0)) });
        st.loaded = true;
        return out;
      }
      st.future = false; st.message = '';
      const ok = slots.filter((x) => x.status === 'ok').sort((a, b) => b.seq - a.seq);
      const bad = slots.filter((x) => x.status === 'corrupt');
      for (const c of ok) {
        try {
          const env = migrate(c.env);
          const recovered = bad.length > 0 || c !== ok[0] || bad.some((b) => (b.seq || 0) > c.seq);
          st.slot = c.s; st.recovered = recovered;
          Object.assign(out, { empty: false, ok: true, slot: c.s, seq: c.seq, v: c.v, env, recovered, at: +env.at || 0, migratedFrom: c.v < VERSION ? c.v : undefined });
          if (recovered) out.message = st.message = 'One save copy was damaged; the other copy was used.';
          st.loaded = true;
          return out;
        } catch (e) { out.slots[c.s].status = 'corrupt'; out.slots[c.s].error = String(e.message || e); bad.push(c); }
      }
      st.slot = null;
      st.recovered = bad.length > 0;
      if (st.recovered) Object.assign(out, { recovered: true, message: (st.message = 'The save for this profile was damaged and could not be read. A fresh colony is ready.') });
    } catch {
      Object.assign(out, { recovered: true, message: (st.message = 'Saves could not be read on this device.') });
    }
    st.loaded = true;
    return out;
  }

  // Write data for profile p into the slot not holding the newest valid save.
  function write(p, data, { play = 0, at = now() } = {}) {
    if (!okProfile(p)) return { ok: false, error: 'no such profile' };
    const st = info(p);
    inspect(p); // re-read every time: another tab, a test or a crash may have changed the keys
    if (st.future) return { ok: false, error: 'newer', message: st.message, future: true };
    const slot = st.slot === 'a' ? 'b' : 'a';
    const seq = st.seq + 1;
    const body = JSON.stringify(data);
    const sum = checksum(body);
    const raw = `{"v":${VERSION},"seq":${seq},"sum":"${sum}","at":${Math.round(at)},"play":${Math.round(play) || 0},"data":${body}}`;
    try { store.setItem(KEYS.slot(p, slot), raw); }
    catch (err) { return { ok: false, error: /quota/i.test(String(err && err.name || err)) ? 'storage full' : String(err && err.message || err) }; }
    st.slot = slot; st.seq = seq; st.recovered = false; st.message = '';
    return { ok: true, profile: p, slot, seq, at: Math.round(at), bytes: raw.length, key: KEYS.slot(p, slot) };
  }

  function list() {
    const out = [];
    for (let i = 0; i < PROFILES; i++) {
      const r = inspect(i);
      const row = { i, exists: !r.empty, empty: r.empty, ok: r.ok, future: r.future, newer: r.future, recovered: r.recovered, corrupt: !r.ok && !r.future && r.recovered, message: r.message, slot: r.slot, seq: r.seq, v: r.v, at: r.at || 0 };
      if (r.ok) Object.assign(row, summarize(r.env.data, r.env));
      out.push(row);
    }
    return out;
  }

  function wipe(p) {
    if (p === undefined || p === null) {
      for (const k of store.keys()) if (k && k.startsWith(PREFIX + '.')) store.removeItem(k);
      prof.length = 0;
      return { ok: true };
    }
    for (const s of SLOTS) store.removeItem(KEYS.slot(p, s));
    prof[p] = null;
    return { ok: true };
  }

  function getSettings() {
    try { const raw = store.getItem(KEYS.settings); return raw ? clampSettings(JSON.parse(raw)) : defaultSettings(); }
    catch { return defaultSettings(); }
  }
  function putSettings(s) { try { store.setItem(KEYS.settings, JSON.stringify(clampSettings(s))); return true; } catch { return false; } }
  function lastProfile() {
    try { const n = parseInt(store.getItem(KEYS.last), 10); return okProfile(n) ? n : 0; } catch { return 0; }
  }
  function setLastProfile(p) { if (okProfile(p)) try { store.setItem(KEYS.last, String(p)); } catch { /* ignore */ } }

  // Export the newest valid save of profile p as a portable string.
  function exportProfile(p) {
    const r = inspect(p);
    if (!r.ok) return null;
    const { data, play } = r.env;
    const s = summarize(data, r.env);
    const body = JSON.stringify(data);
    return `{"game":"skyforge","kind":"colony","v":${VERSION},"at":${Math.round(now())},"name":${JSON.stringify(s.name)},"day":${s.day},"play":${Math.round(+play || 0)},"sum":"${checksum(body)}","data":${body}}`;
  }

  // Validate an exported string (or a raw slot value) -> { ok, error?, env? }.
  function validateImport(str) {
    let doc;
    try { doc = typeof str === 'string' ? JSON.parse(str.trim()) : str; } catch { return { ok: false, error: 'That file is not a Skyforge save (it could not be read).' }; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, error: 'That file is not a Skyforge save.' };
    if (typeof doc.game === 'string' && doc.game !== 'skyforge') return { ok: false, error: 'That save belongs to another game.' };
    if (!Number.isInteger(doc.v) || doc.v < 0) return { ok: false, error: 'That file is not a Skyforge save (no version).' };
    if (doc.v > VERSION) return { ok: false, error: `That save was made by a newer version of Skyforge Tycoon (v${doc.v}). Update the game to load it.`, future: true };
    const body = doc.v >= 1 ? doc.data : doc.game;
    if (!body || typeof body !== 'object') return { ok: false, error: 'That save has no colony in it.' };
    if (doc.sum !== checksum(body)) return { ok: false, error: 'That save is damaged (checksum mismatch).' };
    let env;
    try { env = migrate({ v: doc.v, seq: 0, sum: doc.sum, at: doc.at, play: doc.play, [doc.v >= 1 ? 'data' : 'game']: body }); }
    catch (e) { return { ok: false, error: doc.v === VERSION ? `That save is incomplete (${e.message}).` : `That save could not be upgraded: ${e.message}` }; }
    const why = validateData(env.data);
    if (why) return { ok: false, error: `That save is incomplete (${why}).` };
    return { ok: true, env };
  }
  function importProfile(str, p) {
    if (!okProfile(p)) return { ok: false, error: 'no such profile' };
    const r = validateImport(str);
    if (!r.ok) return r;
    const w = write(p, r.env.data, { play: r.env.play || 0, at: now() });
    if (!w.ok) return { ok: false, error: w.future ? 'This profile holds a save from a newer version and is kept untouched. Choose another profile.' : `Could not store the save: ${w.error}` };
    return { ok: true, profile: p, slot: w.slot, seq: w.seq, summary: summarize(r.env.data, r.env) };
  }

  return { store, now, inspect, write, list, wipe, getSettings, putSettings, lastProfile, setLastProfile, exportProfile, validateImport, importProfile, info };
}

// ---------- the app saver ----------
export function createSaver(app, { store, now = () => Date.now(), realNow } = {}) {
  const flags = app.flags || {};
  const q = (() => { try { return new URLSearchParams(globalThis.location?.search || ''); } catch { return new URLSearchParams(''); } })();
  const S = createSaves({ store: store || pickStore({ debug: !!flags.debug, save: !!flags.save }), now });
  const rnow = realNow || (() => (globalThis.performance?.now ? performance.now() : Date.now()));
  let catchupOn = !flags.debug || q.has('away');
  let forceAway = null;            // __sf.save.away(s): pretend this much time passed on the next load
  let play = { base: 0, start: rnow(), pending: null };
  const settings = S.getSettings();

  if (Number.isInteger(app.profile) && app.profile === 0) app.profile = S.lastProfile();

  // play-time bookkeeping: a loaded colony resumes its counter, a new one starts at 0
  app.ev?.on?.('game', ({ G }) => { play = { base: G ? (play.pending ?? 0) : 0, start: rnow(), pending: null }; });
  app.ev?.on?.('newgame', () => { play = { base: 0, start: rnow(), pending: null }; });
  app.ev?.on?.('loaded', () => {
    if (saver.away) { const a = saver.away; setTimeout(() => app.ev.emit('away', a), 0); }
  });
  const playNow = () => play.base + (rnow() - play.start) / 1000;

  const saver = {
    store: S.store, last: null, away: null,
    get persistent() { return S.store.kind === 'local'; },
    keyFor: (i) => {
      const st = S.info(i);
      if (!st.loaded) S.inspect(i);
      return KEYS.slot(i, st.slot || 'a');
    },
    list: () => S.list(),
    lastProfile: () => S.lastProfile(),
    inspect: (i) => S.inspect(i),

    // -> snapshot data (migrated, caught up) or null
    load(i) {
      const r = S.inspect(i);
      saver.away = null;
      if (!r.ok) return null;
      let data = r.env.data;
      const realAway = Math.max(0, (now() - (+r.env.at || now())) / 1000);
      const away = forceAway ?? realAway;
      let summary = null;
      if (catchupOn || forceAway != null) {
        try { ({ data, summary } = catchUp(data, away)); } catch (e) { console.error('catch-up failed', e); summary = null; }
      }
      forceAway = null;
      play.pending = +r.env.play || 0;
      S.setLastProfile(i);
      if (summary) saver.away = { away: summary.away, summary };
      Object.defineProperty(data, 'awaySeconds', { value: summary ? summary.away : Math.round(away), enumerable: false, configurable: true });
      Object.defineProperty(data, 'awaySummary', { value: summary, enumerable: false, configurable: true });
      saver.last = { profile: i, slot: r.slot, seq: r.seq, at: r.at, reason: 'load', ok: true, migratedFrom: r.migratedFrom ?? null, recovered: r.recovered };
      return data;
    },

    save(G, i = app.profile, reason = 'auto') {
      if (!G) return { ok: false, error: 'no game' };
      const t0 = rnow();
      let data;
      try { data = snapshot(G); } catch (e) { return { ok: false, error: 'snapshot failed: ' + e.message }; }
      const w = S.write(i, data, { play: playNow() });
      const ms = rnow() - t0;
      if (w.ok) {
        S.setLastProfile(i);
        saver.last = { profile: i, slot: w.slot, seq: w.seq, at: w.at, reason, ok: true, bytes: w.bytes, ms: Math.round(ms * 10) / 10 };
      } else {
        saver.last = { ...(saver.last || {}), profile: i, reason, ok: false, error: w.error, message: w.message };
      }
      app.ev?.emit?.('saved', { ...saver.last });
      return w.ok ? { ok: true, ...saver.last } : { ok: false, error: w.error, message: w.message };
    },

    wipe(i) { const r = S.wipe(i); if (i == null) saver.last = null; return r; },

    settings: {
      get: () => settings,
      set(patch = {}) {
        const next = clampSettings({ ...settings, ...(patch || {}) });
        for (const k of Object.keys(settings)) delete settings[k];
        Object.assign(settings, next);
        app.settings = settings;
        const ok = S.putSettings(settings);
        try { app.audio?.apply?.(settings); } catch (e) { console.error(e); }
        app.ev?.emit?.('settings', settings);
        if (app.G) app.save?.('settings');
        return { ok, settings };
      },
      reset() { return saver.settings.set(defaultSettings()); },
      defaults: defaultSettings,
    },

    exportProfile(i = app.profile) {
      if (app.G && i === app.profile) saver.save(app.G, i, 'export');
      return S.exportProfile(i);
    },
    // A file name and text for the Settings export button.
    exportFile(i = app.profile) {
      const text = saver.exportProfile(i);
      if (!text) return null;
      const s = S.list()[i];
      const slug = String(s.name || 'colony').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'colony';
      return { name: `skyforge-${slug}-day${s.day || 1}.json`, text, type: 'application/json' };
    },
    // Browser only: hand the export to the player as a file download.
    download(i = app.profile) {
      const f = saver.exportFile(i);
      if (!f || typeof document === 'undefined') return { ok: false, error: f ? 'no document' : 'nothing saved yet' };
      const url = URL.createObjectURL(new Blob([f.text], { type: f.type }));
      const a = document.createElement('a');
      a.href = url; a.download = f.name; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true, name: f.name };
    },
    // Validate and store an export into profile i. If that profile is being
    // played right now the imported colony replaces it on screen.
    importProfile(str, i = app.profile) {
      const r = S.importProfile(str, i);
      if (r.ok) {
        saver.last = { profile: i, slot: r.slot, seq: r.seq, at: now(), reason: 'import', ok: true };
        if (app.G && i === app.profile && app.continueGame) app.continueGame(i);
        app.ev?.emit?.('imported', { profile: i, summary: r.summary });
      }
      return r;
    },
    // Read a File from an <input type=file> and import it. -> Promise<{ok, error?}>
    async importFile(file, i = app.profile) {
      if (!file) return { ok: false, error: 'No file chosen.' };
      if (file.size > 20e6) return { ok: false, error: 'That file is far too big to be a Skyforge save.' };
      let text;
      try { text = await file.text(); } catch { return { ok: false, error: 'That file could not be read.' }; }
      return saver.importProfile(text, i);
    },

    // window.__sf.save (debug hook)
    debug() {
      return {
        version: VERSION, migrations: migrationList.slice(), persistent: saver.persistent,
        keys: () => S.store.keys().filter((k) => k && k.startsWith(PREFIX + '.')).sort(),
        now: (reason = 'debug') => saver.save(app.G, app.profile, reason),
        read: (p = app.profile) => {
          const r = S.inspect(p);
          return { profile: p, ok: r.ok, slot: r.slot, seq: r.seq, v: r.v, at: r.at || 0, future: r.future, recovered: r.recovered, message: r.message, slots: r.slots, key: r.slot ? KEYS.slot(p, r.slot) : null };
        },
        export: (p = app.profile) => saver.exportProfile(p),
        import: (str, p = app.profile) => saver.importProfile(str, p),
        fixture: (v = VERSION, opts) => fixture(v, opts),
        checksum,
        wipe: (p) => saver.wipe(p),
        list: () => S.list(),
        settings: () => ({ ...settings }),
        // Reload the current profile as if `seconds` of real time had passed (runs catch-up).
        away(seconds = 3600, p = app.profile) {
          if (app.G) saver.save(app.G, p, 'away');
          forceAway = seconds;
          const ok = app.continueGame ? app.continueGame(p) : false;
          return { ok: !!ok, away: saver.away };
        },
        catchup(on = true) { catchupOn = !!on; return { ok: true, on: catchupOn }; },
      };
    },
  };
  app.settings = settings;
  return saver;
}
