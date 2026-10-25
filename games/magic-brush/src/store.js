// Saved friends. A small index lives in localStorage (who, which kind, how
// many stars, which colours, who is in the meadow); each friend's painted
// texture is an image Blob in IndexedDB, loaded only when that friend is
// shown (meadow, or the visible book page) and kept in a small cache. Only
// the newest 60 friends are kept. Every painting is saved exactly once, by
// the id it was given at GO. If storage is unavailable (a private window)
// everything still works for the session from memory.
const KEY = 'magic-brush:v2';
const MAX = 60;
export const MEADOW_MAX = 6;

let idx = { friends: [], roster: [], seq: 0 };
let db = null, dbFailed = false;
const mem = new Map(); // id -> Blob (fallback and write-through)
const cache = new Map(); // id -> Promise<texture>

try {
  const raw = localStorage.getItem(KEY);
  if (raw) { const v = JSON.parse(raw); if (v && Array.isArray(v.friends)) idx = Object.assign({ roster: [], seq: 0 }, v); }
} catch {}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(idx)); } catch {} }

function openDb() {
  if (db || dbFailed) return Promise.resolve(db);
  return new Promise((res) => {
    try {
      const rq = indexedDB.open('magic-brush', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('tex');
      rq.onsuccess = () => { db = rq.result; res(db); };
      rq.onerror = () => { dbFailed = true; res(null); };
      rq.onblocked = () => { dbFailed = true; res(null); };
    } catch { dbFailed = true; res(null); }
  });
}
function idb(mode, fn) {
  return openDb().then((d) => new Promise((res) => {
    if (!d) { res(null); return; }
    try {
      const tx = d.transaction('tex', mode), st = tx.objectStore('tex'), rq = fn(st);
      tx.oncomplete = () => res(rq ? rq.result : null);
      tx.onerror = () => res(null); tx.onabort = () => res(null);
    } catch { res(null); }
  }));
}

export const friends = () => idx.friends;
export const roster = () => idx.roster.filter((id) => idx.friends.some((f) => f.id === id));
export const getMeta = (id) => idx.friends.find((f) => f.id === id) || null;
export const count = () => idx.friends.length;
export const paintedKinds = () => { const s = new Set(); for (const f of idx.friends) s.add(f.kind); return s; };

export function newId() { idx.seq = (idx.seq || 0) + 1; return 'f' + Date.now().toString(36) + '-' + idx.seq; }

// add a friend (meta first, synchronously; the image follows)
export function addFriend(meta, blobPromise) {
  if (idx.friends.some((f) => f.id === meta.id)) return; // saved once
  idx.friends.push(meta);
  while (idx.friends.length > MAX) {
    const old = idx.friends.shift();
    idx.roster = idx.roster.filter((r) => r !== old.id);
    mem.delete(old.id); cache.delete(old.id);
    idb('readwrite', (st) => st.delete(old.id));
  }
  persist();
  Promise.resolve(blobPromise).then((blob) => {
    if (!blob || !getMeta(meta.id)) return;
    mem.set(meta.id, blob);
    idb('readwrite', (st) => st.put(blob, meta.id)).then(() => { if (mem.size > 8) mem.delete(meta.id); });
  });
}

// bring a friend to the meadow (front of the list); returns ids that had to leave
export function toMeadow(id) {
  idx.roster = idx.roster.filter((r) => r !== id && getMeta(r));
  idx.roster.push(id);
  const gone = [];
  while (idx.roster.length > MEADOW_MAX) gone.push(idx.roster.shift());
  persist();
  return gone;
}

// the painted texture for a friend, as { canvas: ImageBitmap, ox, oy, k }
export function loadTexture(id, preset) {
  if (cache.has(id)) return cache.get(id);
  const meta = getMeta(id);
  const p = (async () => {
    if (preset) return preset;
    let blob = mem.get(id) || null;
    if (!blob) blob = await idb('readonly', (st) => st.get(id));
    if (!blob || !meta) return null;
    let bmp = null;
    try { bmp = await createImageBitmap(blob); } catch {
      bmp = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = URL.createObjectURL(blob); });
    }
    if (!bmp) return null;
    return { canvas: bmp, ox: meta.ox, oy: meta.oy, k: meta.k };
  })();
  cache.set(id, p);
  if (cache.size > 24) { const first = cache.keys().next().value; if (first !== id) cache.delete(first); }
  p.then((t) => { if (!t) cache.delete(id); });
  return p;
}
export function primeTexture(id, tex) { cache.set(id, Promise.resolve(tex)); }

export function clearSave() {
  idx = { friends: [], roster: [], seq: 0 };
  mem.clear(); cache.clear();
  try { localStorage.removeItem(KEY); } catch {}
  return idb('readwrite', (st) => st.clear());
}

export function canvasBlob(c) {
  return new Promise((res) => {
    try {
      c.toBlob((b) => {
        if (b && b.type === 'image/webp') res(b);
        else c.toBlob((b2) => res(b2), 'image/png');
      }, 'image/webp', 0.9);
    } catch { res(null); }
  });
}
