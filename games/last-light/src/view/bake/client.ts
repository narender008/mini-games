// Main-thread side of room baking. Rooms are baked in a worker when the browser can paint on an
// OffscreenCanvas there (all current browsers), else on the main thread while the screen is faded out.
// With a worker, the rooms behind the current room's doors are requested ahead of time (while this one is
// played), so the next room is usually ready the moment the keeper walks through the door.
import type { RoomDef } from '../../sim/level/rooms';
import { bakeKey, bakeRoom, type BakedRoom } from './bakeRoom';

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, { resolve: (r: BakedRoom) => void; reject: (e: Error) => void }>();
interface Entry { p: Promise<BakedRoom>; value: BakedRoom | null }
const cache = new Map<string, Entry>();

function canUseWorker() {
  if (workerBroken || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return false;
  try {
    const c = new OffscreenCanvas(1, 1);
    return !!c.getContext('2d') && typeof c.transferToImageBitmap === 'function';
  } catch { return false; }
}

function getWorker(): Worker | null {
  if (worker || !canUseWorker()) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<{ id: number; r?: BakedRoom; err?: string }>) => {
      const job = pending.get(ev.data.id);
      if (!job) return;
      pending.delete(ev.data.id);
      if (ev.data.r) job.resolve(ev.data.r); else job.reject(new Error(ev.data.err ?? 'bake failed'));
    };
    worker.onerror = (e) => {
      // A worker that cannot start (old browser, blocked module workers) falls back to main-thread bakes.
      e.preventDefault();
      workerBroken = true;
      worker?.terminate();
      worker = null;
      for (const [, job] of pending) job.reject(new Error('bake worker failed'));
      pending.clear();
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

/** Whether bakes run off the main thread (only then is prefetching free). */
export const bakesInWorker = () => !!getWorker();

function start(def: RoomDef, seed: number, d: number, de: number): Entry {
  const entry: Entry = { p: null as unknown as Promise<BakedRoom>, value: null };
  const w = getWorker();
  entry.p = (w
    ? new Promise<BakedRoom>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      w.postMessage({ id, def: { id: def.id, zone: def.zone, name: def.name, map: def.map, waves: [] }, seed, d, de });
    })
    : new Promise<BakedRoom>((resolve) => setTimeout(() => resolve(bakeRoom(def, seed, d, de)), 0)))
    .then((r) => { entry.value = r; return r; });
  return entry;
}

/** Ask for a room's bake ahead of time (worker only); it waits in the cache for take(). */
export function prefetch(def: RoomDef, seed: number, d: number, de: number) {
  if (!bakesInWorker()) return;
  const key = bakeKey(def, seed, d);
  if (cache.has(key)) return;
  const entry = start(def, seed, d, de);
  entry.p.catch(() => { if (cache.get(key) === entry) cache.delete(key); });
  cache.set(key, entry);
}

/** The bake for this room, now if it is ready (prefetched), else a promise. The caller owns the result. */
export function take(def: RoomDef, seed: number, d: number, de: number): BakedRoom | Promise<BakedRoom> {
  const key = bakeKey(def, seed, d);
  const entry = cache.get(key) ?? start(def, seed, d, de);
  cache.delete(key);
  if (entry.value) return entry.value;
  // A worker that fails (or dies) mid-bake: bake here instead, while the screen is still faded out.
  return entry.p.catch(() => bakeRoom(def, seed, d, de));
}

/** Drop prefetched bakes other than these keys (rooms no longer reachable), releasing their images. */
export function keepOnly(keys: string[]) {
  for (const [k, v] of [...cache]) {
    if (keys.includes(k)) continue;
    cache.delete(k);
    v.p.then((r) => release(r)).catch(() => {});
  }
}

/** Free a bake's bitmaps (after their textures are gone, or when the bake is never used). */
export function release(r: BakedRoom) {
  for (const im of r.images) if (typeof ImageBitmap !== 'undefined' && im.src instanceof ImageBitmap) im.src.close();
}
