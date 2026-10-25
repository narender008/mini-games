// STUB by lead: SAVE replaces this. See the build brief for the saver API.
export function createSaver(app) {
  return { last: null, list: () => [0, 1, 2].map((i) => ({ i, exists: false })), load: () => null, save: () => ({ ok: false }), settings: { get: () => ({}), set() {} }, keyFor: (i) => `skyforge.p${i}.a` };
}
