// Friends and kept paintings live on this device only, in IndexedDB (with
// localStorage as a fallback where IndexedDB is unavailable). A friend is a
// small record: its kind, the painted skin it came alive with (a JPEG data
// URL), a portrait for the shelf and when it was made.
const DB = 'mini-games.magic-brush';
const LS = 'mini-games.magic-brush.store.';

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('friends')) db.createObjectStore('friends', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('paintings')) db.createObjectStore('paintings', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class Store {
  constructor() {
    this.db = null;
    this.ready = open()
      .then((db) => (this.db = db))
      .catch(() => (this.db = null));
  }

  async all(kind) {
    await this.ready;
    if (!this.db) {
      try {
        return JSON.parse(localStorage.getItem(LS + kind) || '[]');
      } catch {
        return [];
      }
    }
    return new Promise((resolve) => {
      const tx = this.db.transaction(kind, 'readonly');
      const req = tx.objectStore(kind).getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => a.made - b.made));
      req.onerror = () => resolve([]);
    });
  }

  async put(kind, rec) {
    await this.ready;
    if (!this.db) {
      try {
        const list = JSON.parse(localStorage.getItem(LS + kind) || '[]').filter((r) => r.id !== rec.id);
        list.push(rec);
        // keep within storage limits: drop the oldest first
        while (list.length) {
          try {
            localStorage.setItem(LS + kind, JSON.stringify(list));
            break;
          } catch {
            list.shift();
          }
        }
      } catch {
        /* storage unavailable */
      }
      return;
    }
    return new Promise((resolve) => {
      const tx = this.db.transaction(kind, 'readwrite');
      tx.objectStore(kind).put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async remove(kind, id) {
    await this.ready;
    if (!this.db) {
      try {
        const list = JSON.parse(localStorage.getItem(LS + kind) || '[]').filter((r) => r.id !== id);
        localStorage.setItem(LS + kind, JSON.stringify(list));
      } catch {
        /* storage unavailable */
      }
      return;
    }
    return new Promise((resolve) => {
      const tx = this.db.transaction(kind, 'readwrite');
      tx.objectStore(kind).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
