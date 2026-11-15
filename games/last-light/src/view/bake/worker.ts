// The room bake worker: paints environments on OffscreenCanvas off the main thread, so entering a room
// never stalls a frame, and hands the images back as transferable ImageBitmaps.
import { bakeRoom } from './bakeRoom';
import type { RoomDef } from '../../sim/level/rooms';

interface Job { id: number; def: RoomDef; seed: number; d: number; de: number }

const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(msg, transfer);

self.onmessage = (ev: MessageEvent<Job>) => {
  const { id, def, seed, d, de } = ev.data;
  try {
    const r = bakeRoom(def, seed, d, de, (c) => (c as unknown as OffscreenCanvas).transferToImageBitmap());
    post({ id, r }, r.images.map((im) => im.src as ImageBitmap));
  } catch (e) {
    post({ id, err: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) });
  }
};
