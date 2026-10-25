// Shared painting helpers for the renderer, ported from the concept
// prototype (concept/prototype/render.js): glows, flames, crystals,
// mushrooms, vines, chains, slabs and the ability glyphs. Every function takes
// the 2D context g first. Glows are drawn from cached radial sprites (one per
// colour), so a glow costs one drawImage instead of a new gradient.
import { rng, rgba, mixHex, lerp } from '../util.js';

export const TAU = Math.PI * 2;
export const ABILITY_COLORS = {
  'twin-leap': '#7ad8ff', 'ember-dash': '#6ef2ff', 'root-grip': '#9cff6a', 'chain-hook': '#ffd36a', 'fire-form': '#ff6a2a',
};

export function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
export function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// string -> 32-bit seed
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// smooth 1D value noise and a 3-octave sum (0..1)
export function noise1(seed) {
  const r = rng(seed), v = Array.from({ length: 512 }, r);
  return (x) => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return lerp(v[i & 511], v[(i + 1) & 511], s); };
}
export function fbm(seed) {
  const n = [noise1(seed), noise1(seed + 7), noise1(seed + 13)];
  return (x) => n[0](x) * 0.6 + n[1](x * 2.3) * 0.28 + n[2](x * 5.1) * 0.12;
}

// ------------------------------------------------------------ cached sprites
const glowCache = new Map();
// The prototype's glow: colour at the centre, 40% at 0.3 r, gone at r.
export function glowSprite(c) {
  let s = glowCache.get(c);
  if (!s) {
    s = layer(128, 128); const g = s.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, rgba(c, 1)); gr.addColorStop(0.3, rgba(c, 0.4)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    glowCache.set(c, s);
  }
  return s;
}
export function glow(g, x, y, r, c, a = 1) {
  if (r <= 0 || a <= 0) return;
  const ga = g.globalAlpha;
  g.globalAlpha = ga * Math.min(1, a);
  g.drawImage(glowSprite(c), x - r, y - r, r * 2, r * 2);
  g.globalAlpha = ga;
}
export function additive(g, fn) { const o = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter'; fn(); g.globalCompositeOperation = o; }

// ------------------------------------------------------------ fire
export function flamePath(g, x, y, s, lean = 0) {
  g.beginPath();
  g.moveTo(x, y);
  g.bezierCurveTo(x - s * 0.7, y - s * 0.2, x - s * 0.5 + lean, y - s * 1.1, x + lean * 1.6, y - s * 1.9);
  g.bezierCurveTo(x + s * 0.2 + lean, y - s * 1.2, x + s * 0.75, y - s * 0.6, x + s * 0.5, y - s * 0.1);
  g.quadraticCurveTo(x + s * 0.2, y + s * 0.25, x, y);
  g.closePath();
}
export function flame(g, x, y, s, c, a = 1, lean = 0) {
  if (s <= 0) return;
  const gr = g.createLinearGradient(0, y, 0, y - s * 1.9);
  gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; flamePath(g, x, y, s, lean); g.fill();
}
// A living flame at (x, y) (its base), size s, time t: three layers that sway.
export function liveFlame(g, x, y, s, t, { outer = '#ff6a1a', mid = '#ffd27a', core = '#ffffff', seed = 0 } = {}) {
  const k = 1 + Math.sin(t * 13 + seed) * 0.08 + Math.sin(t * 7.3 + seed * 2) * 0.06;
  const lean = Math.sin(t * 3.1 + seed) * s * 0.18;
  additive(g, () => {
    flame(g, x, y, s * k, outer, 0.95, lean);
    flame(g, x, y, s * 0.6 * k, mid, 1, lean * 0.7);
    flame(g, x, y - 1, s * 0.3, core, 1, lean * 0.4);
  });
}

// ------------------------------------------------------------ props
export function crystal(g, x, y, s, c, ang = 0, glowA = 0.7, emit = null) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const gr = g.createLinearGradient(-s * 0.3, 0, s * 0.3, -s);
  gr.addColorStop(0, mixHex(c, '#000000', 0.3)); gr.addColorStop(0.5, c); gr.addColorStop(1, '#ffffff');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(-s * 0.22, 0); g.lineTo(-s * 0.26, -s * 0.7); g.lineTo(0, -s); g.lineTo(s * 0.26, -s * 0.72); g.lineTo(s * 0.2, 0); g.closePath(); g.fill();
  g.fillStyle = rgba('#ffffff', 0.35); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -s); g.lineTo(s * 0.26, -s * 0.72); g.lineTo(s * 0.2, 0); g.closePath(); g.fill();
  g.restore();
  const tgt = emit || g;
  additive(tgt, () => glow(tgt, x + Math.sin(ang) * s * 0.5, y - Math.cos(ang) * s * 0.5, s * 1.8, c, glowA * 0.5));
  if (emit) { // a crisp copy in the glow layer so it shows through the dark
    emit.save(); emit.globalAlpha = 0.55; emit.translate(x, y); emit.rotate(ang); emit.fillStyle = c;
    emit.beginPath(); emit.moveTo(-s * 0.22, 0); emit.lineTo(-s * 0.26, -s * 0.7); emit.lineTo(0, -s); emit.lineTo(s * 0.26, -s * 0.72); emit.lineTo(s * 0.2, 0); emit.closePath(); emit.fill();
    emit.restore();
  }
}
export function mushroom(g, x, y, h, capW, { cap = '#ff3fb4', stem = '#e8d4ff', spots = '#ffffff', glowC = cap, lean = 0, a = 1, emit = null } = {}) {
  g.save(); g.globalAlpha *= a;
  const tx = x + lean, ty = y - h;
  const sg = g.createLinearGradient(x - 8, 0, x + 8, 0);
  sg.addColorStop(0, mixHex(stem, '#000000', 0.45)); sg.addColorStop(0.5, stem); sg.addColorStop(1, mixHex(stem, '#000000', 0.6));
  g.fillStyle = sg;
  const sw = Math.max(1.5, capW * 0.12);
  g.beginPath(); g.moveTo(x - sw * 1.3, y); g.quadraticCurveTo(x - sw + lean * 0.3, y - h * 0.5, tx - sw * 0.8, ty); g.lineTo(tx + sw * 0.8, ty); g.quadraticCurveTo(x + sw + lean * 0.3, y - h * 0.5, x + sw * 1.3, y); g.closePath(); g.fill();
  const tgt = emit || g;
  additive(tgt, () => glow(tgt, tx, ty + 4, capW * 1.2, glowC, 0.45 * a));
  g.fillStyle = mixHex(glowC, '#ffffff', 0.4);
  g.beginPath(); g.ellipse(tx, ty + 2, capW * 0.5, capW * 0.1, 0, 0, TAU); g.fill();
  const cg = g.createRadialGradient(tx - capW * 0.15, ty - capW * 0.3, 1, tx, ty, capW * 0.7);
  cg.addColorStop(0, mixHex(cap, '#ffffff', 0.45)); cg.addColorStop(0.6, cap); cg.addColorStop(1, mixHex(cap, '#000000', 0.35));
  g.fillStyle = cg;
  const capPath = (c) => {
    c.beginPath(); c.moveTo(tx - capW * 0.55, ty + 2);
    c.bezierCurveTo(tx - capW * 0.6, ty - capW * 0.45, tx + capW * 0.6, ty - capW * 0.45, tx + capW * 0.55, ty + 2);
    c.quadraticCurveTo(tx, ty - capW * 0.06, tx - capW * 0.55, ty + 2);
  };
  capPath(g); g.fill();
  const r = rng(Math.floor(x * 7 + y));
  g.fillStyle = rgba(spots, 0.85);
  for (let i = 0; i < 5; i++) { const a2 = -Math.PI * (0.15 + r() * 0.7); g.beginPath(); g.ellipse(tx + Math.cos(a2) * capW * 0.33, ty + Math.sin(a2) * capW * 0.24, 1 + r() * capW * 0.05, 0.8 + r() * capW * 0.03, 0, 0, TAU); g.fill(); }
  g.restore();
  if (emit) { emit.save(); emit.globalAlpha = (capW > 40 ? 0.2 : 0.4) * a; emit.fillStyle = cap; capPath(emit); emit.fill(); emit.restore(); }
}
// A hanging vine from (x, y) down len px; glowing beads go to emit (or g).
export function vine(g, x, y, len, c, seed, glowC, emit = null, width = 2) {
  const r = rng(seed);
  g.strokeStyle = c; g.lineWidth = width; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, y);
  let cx = x, cy = y; const pts = [];
  for (let i = 0; i < 10; i++) { cx += (r() - 0.5) * 10; cy += len / 10; g.lineTo(cx, cy); pts.push([cx, cy]); }
  g.stroke();
  if (glowC) {
    const t = emit || g;
    additive(t, () => { for (const [px, py] of pts) if (r() < 0.45) { glow(t, px, py, 10, glowC, 0.7); t.fillStyle = '#ffffff'; t.fillRect(px - 1, py - 1, 2, 2); } });
  }
  return pts;
}
export function chain(g, x, y, len, c = '#3a3036') {
  g.strokeStyle = c; g.lineWidth = 3;
  for (let i = 0; i < len; i += 10) { g.beginPath(); g.ellipse(x, y + i, 3, 6, 0, 0, TAU); g.stroke(); }
}
// Chain between two points (links alternate face-on and edge-on).
export function chainLine(g, x0, y0, x1, y1, c = '#5a4a3a', hi = '#c8a070') {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(d / 9)), a = Math.atan2(y1 - y0, x1 - x0);
  g.save(); g.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    g.strokeStyle = i % 2 ? c : hi;
    g.beginPath(); g.ellipse(x, y, 5.5, i % 2 ? 1.5 : 3, a, 0, TAU); g.stroke();
  }
  g.restore();
}
// Floating stone slab (prototype slab): top edge at y, w wide, h thick.
export function slab(g, x, y, w, h, { top, bot, rim, seed = 5 }) {
  const r = rng(seed), pts = [];
  const n = Math.max(3, Math.round(w / 20));
  for (let i = 0; i <= n; i++) pts.push([x + w * i / n, y + (i && i < n ? (r() - 0.5) * 3 : 0)]);
  g.save();
  g.beginPath(); g.moveTo(x, y);
  for (const p of pts) g.lineTo(p[0], p[1]);
  g.lineTo(x + w - 4, y + h * 0.7); g.lineTo(x + w * 0.7, y + h); g.lineTo(x + w * 0.45, y + h * 1.25); g.lineTo(x + w * 0.2, y + h * 0.9); g.lineTo(x + 4, y + h * 0.6); g.closePath();
  const gr = g.createLinearGradient(0, y, 0, y + h * 1.25); gr.addColorStop(0, top); gr.addColorStop(1, bot);
  g.fillStyle = gr; g.fill();
  g.clip();
  for (let i = 0; i < w / 18; i++) { g.fillStyle = rgba('#000000', 0.1 + r() * 0.1); g.fillRect(x + r() * w, y + 5 + r() * h, 6 + r() * 24, 2 + r() * 4); }
  g.restore();
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = rgba(rim, 0.35); g.lineWidth = 6; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
  g.strokeStyle = rim; g.lineWidth = 2; g.stroke();
}

// ------------------------------------------------------------ glyphs
// Ability glyphs from the prototype, drawn centred at (x, y), size s.
export function abilityGlyph(g, id, x, y, s, c, lit = true) {
  const kind = { 'twin-leap': 'jump', 'ember-dash': 'dash', 'root-grip': 'climb', 'chain-hook': 'hook', 'fire-form': 'fire' }[id] || id;
  const off = 'rgba(200,190,220,0.3)';
  g.save(); g.translate(x, y);
  g.strokeStyle = lit ? c : off; g.fillStyle = g.strokeStyle; g.lineWidth = s * 0.12; g.lineCap = 'round'; g.lineJoin = 'round';
  const k = s / 2;
  if (kind === 'jump') { for (const o of [-0.35, 0.25]) { g.beginPath(); g.moveTo(-k * 0.55, k * o + k * 0.25); g.lineTo(0, k * o - k * 0.25); g.lineTo(k * 0.55, k * o + k * 0.25); g.stroke(); } }
  if (kind === 'dash') { g.beginPath(); g.moveTo(k * 0.1, -k * 0.45); g.lineTo(k * 0.6, 0); g.lineTo(k * 0.1, k * 0.45); g.stroke(); for (const o of [-0.25, 0, 0.25]) { g.beginPath(); g.moveTo(-k * 0.65, k * o); g.lineTo(k * 0.2 - Math.abs(o) * k, k * o); g.stroke(); } }
  if (kind === 'climb') { g.beginPath(); g.moveTo(-k * 0.5, -k * 0.6); g.lineTo(-k * 0.5, k * 0.6); g.stroke(); for (const o of [-0.4, 0, 0.4]) { g.beginPath(); g.moveTo(-k * 0.3, k * o); g.quadraticCurveTo(k * 0.2, k * o - k * 0.25, k * 0.55, k * o + k * 0.1); g.stroke(); } }
  if (kind === 'hook') { g.beginPath(); g.arc(0, k * 0.15, k * 0.38, 0, Math.PI * 1.1); g.stroke(); g.beginPath(); g.moveTo(k * 0.38, k * 0.15); g.lineTo(k * 0.38, -k * 0.6); g.stroke(); g.beginPath(); g.moveTo(-k * 0.38, k * 0.1); g.lineTo(-k * 0.55, -k * 0.12); g.stroke(); g.beginPath(); g.arc(k * 0.38, -k * 0.65, k * 0.12, 0, TAU); g.stroke(); }
  g.restore();
  if (kind === 'fire') {
    if (lit) additive(g, () => { flame(g, x, y + k * 0.6, k * 0.62, c, 1); flame(g, x, y + k * 0.6, k * 0.35, '#ffd27a', 1); });
    else { g.save(); g.strokeStyle = off; g.lineWidth = s * 0.08; flamePath(g, x, y + k * 0.6, k * 0.62); g.stroke(); g.restore(); }
    return;
  }
  if (lit) additive(g, () => glow(g, x, y, s * 0.9, c, 0.25));
}
// A rune for lore tablets: a few strokes from a seed, centred at (x, y), size s.
export function rune(g, x, y, s, seed) {
  const r = rng(seed);
  g.beginPath(); g.moveTo(x, y - s / 2); g.lineTo(x, y + s / 2);
  const n = 2 + ((r() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const yy = y - s / 2 + r() * s, d = r() < 0.5 ? -1 : 1;
    g.moveTo(x, yy); g.lineTo(x + d * s * 0.35, yy + (r() - 0.5) * s * 0.6);
  }
  g.stroke();
}
