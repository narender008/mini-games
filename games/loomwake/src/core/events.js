// A tiny event bus. The sim emits; render, audio and UI listen. The sim never
// imports render, audio or UI code, so it can run headless for tests and bots.
export function createBus() {
  const subs = new Map();
  return {
    on(type, fn) { if (!subs.has(type)) subs.set(type, new Set()); subs.get(type).add(fn); return () => subs.get(type).delete(fn); },
    emit(type, payload) {
      const s = subs.get(type); if (s) for (const fn of s) fn(payload);
      const any = subs.get('*'); if (any) for (const fn of any) fn(type, payload);
    },
  };
}
