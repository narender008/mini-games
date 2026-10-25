// Seeded random numbers. Sim code uses only rng streams from here (never
// Math.random), so a seed plus the same inputs gives the same run.
// A stream's whole state is one uint32 (`r.state`), so it saves and restores.
export function rng(seed = 1) {
  const r = () => {
    r.state = (r.state + 0x6d2b79f5) >>> 0;
    let t = r.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.state = seed >>> 0;
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1)); // inclusive
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  r.weighted = (items, w = (x) => x.weight ?? 1) => { let s = 0; for (const it of items) s += w(it); let k = r() * s; for (const it of items) { k -= w(it); if (k <= 0) return it; } return items[items.length - 1]; };
  return r;
}

// Hash a string or numbers into a seed.
export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x9e37; h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Cosmetic randomness for render/audio only (not deterministic, never in sim).
export const FX = rng((Date.now() ^ 0x5bd1e995) >>> 0);
