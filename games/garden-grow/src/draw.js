// Drawing helpers shared by the art, the backdrop and the effects. Every
// helper paints on the "current" context set with use(), so the same code can
// bake a sprite into an off-screen canvas or paint straight onto the screen.
export const TAU = Math.PI * 2;
export let ctx = null;
export function use(g) { ctx = g; }

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hexCache = new Map();
export function hex(c) { let v = hexCache.get(c); if (!v) { const n = parseInt(c.slice(1), 16); v = [n >> 16 & 255, n >> 8 & 255, n & 255]; hexCache.set(c, v); } return v; }
export function rgba(c, a) { const A = hex(c); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }
export function mix(a, b, t) { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); }
export function rng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function layer(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

// Soft round glow, baked once per colour (radial gradients every frame are
// slow on software canvases).
const glowCache = new Map();
function glowSprite(c) {
  let cv = glowCache.get(c);
  if (!cv) {
    cv = layer(128, 128);
    const gg = cv.getContext('2d'), gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, rgba(c, 1)); gr.addColorStop(0.35, rgba(c, 0.35)); gr.addColorStop(1, rgba(c, 0));
    gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128); glowCache.set(c, cv);
  }
  return cv;
}
export function glow(x, y, r, c, a = 1, g = ctx) {
  if (a <= 0 || r <= 0) return;
  const pa = g.globalAlpha; g.globalAlpha = pa * Math.min(1, a);
  g.drawImage(glowSprite(c), x - r, y - r, r * 2, r * 2);
  g.globalAlpha = pa;
}

// Shape paths, as functions of a context so gloss() can stroke and clip them.
export const circ = (x, y, r) => g => { g.beginPath(); g.arc(x, y, r, 0, TAU); };
export const ell = (x, y, rx, ry, rot = 0) => g => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); };
export function starPath(g, x, y, r, rot = 0, pts = 5, inner = 0.48) {
  g.beginPath();
  for (let i = 0; i < pts * 2; i++) { const a = rot - Math.PI / 2 + i * Math.PI / pts, q = i % 2 ? r * inner : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  g.closePath();
}
export function heartPath(g, x, y, r) {
  g.beginPath(); g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.3, y, x - r * 0.9, y - r * 1.0, x, y - r * 0.45);
  g.bezierCurveTo(x + r * 0.9, y - r * 1.0, x + r * 1.3, y, x, y + r * 0.9); g.closePath();
}

// The candy look: a shape filled with a lit radial gradient, a dark outline
// of its own hue, a soft drop shadow, a light rim at the bottom and a bright
// specular streak at the top left.
export function gloss(path, x, y, r, base, opts = {}) {
  const g = ctx; g.save();
  path(g);
  if (opts.shadow !== false) { g.shadowColor = 'rgba(40,20,60,0.28)'; g.shadowBlur = r * 0.35; g.shadowOffsetY = r * 0.14; }
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.05, x, y, r * 1.25);
  gr.addColorStop(0, mix(base, '#ffffff', 0.55)); gr.addColorStop(0.35, base); gr.addColorStop(1, mix(base, '#2a0838', 0.38));
  g.fillStyle = gr; g.fill(); g.shadowColor = 'transparent';
  if (opts.line !== null) { g.lineJoin = 'round'; g.lineWidth = opts.lw || Math.max(1.5, r * 0.09); g.strokeStyle = opts.line || mix(base, '#1a0420', 0.55); g.stroke(); }
  g.save(); path(g); g.clip();
  const rim = g.createLinearGradient(x, y + r * 0.4, x, y + r * 1.1); rim.addColorStop(0, 'rgba(255,255,255,0)'); rim.addColorStop(1, 'rgba(255,255,255,0.28)');
  g.fillStyle = rim; g.fill();
  g.restore();
  if (opts.spec !== false) {
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(x - r * 0.32, y - r * 0.42, r * 0.28, r * 0.14, -0.55, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x + r * 0.05, y - r * 0.6, r * 0.06, 0, TAU); g.fill();
  }
  g.restore();
}

// A cute face: shiny eyes, rosy cheeks and a mouth. Moods: happy, giggle
// (eyes squeezed shut), wow (round mouth), sing (open oval), sleep (closed),
// blink (eyes shut, smiling).
export function face(x, y, r, mood = 'happy') {
  const g = ctx; g.save();
  const ex = r * 0.36, ey = -r * 0.08, er = r * 0.17;
  for (const s of [-1, 1]) glow(x + s * r * 0.58, y + r * 0.22, r * 0.32, '#ff5f8f', 0.55);
  g.lineCap = 'round';
  if (mood === 'giggle' || mood === 'blink' || mood === 'sleep') {
    g.strokeStyle = '#2a0f1e'; g.lineWidth = r * 0.09;
    for (const s of [-1, 1]) {
      g.beginPath();
      if (mood === 'giggle') g.arc(x + s * ex, y + ey + er * 0.4, er * 0.9, Math.PI * 1.1, Math.PI * 1.9);
      else g.arc(x + s * ex, y + ey - er * 0.2, er * 0.8, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
    }
  } else {
    for (const s of [-1, 1]) {
      g.fillStyle = '#2a0f1e'; g.beginPath(); g.ellipse(x + s * ex, y + ey, er * 0.82, er * (mood === 'wow' ? 1.25 : 1.1), 0, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x + s * ex - er * 0.25, y + ey - er * 0.4, er * 0.36, 0, TAU); g.fill();
      g.beginPath(); g.arc(x + s * ex + er * 0.3, y + ey + er * 0.35, er * 0.15, 0, TAU); g.fill();
    }
  }
  g.fillStyle = '#7a1030'; g.strokeStyle = '#2a0f1e'; g.lineWidth = r * 0.07;
  if (mood === 'wow' || mood === 'sing') {
    const h = mood === 'sing' ? 0.2 : 0.17, w = mood === 'sing' ? 0.17 : 0.14;
    g.beginPath(); g.ellipse(x, y + r * 0.3, r * w, r * h, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#ff7f9f'; g.beginPath(); g.ellipse(x, y + r * 0.38, r * w * 0.6, r * 0.06, 0, 0, TAU); g.fill();
  } else if (mood === 'sleep') { g.beginPath(); g.arc(x, y + r * 0.22, r * 0.1, 0.2, Math.PI - 0.2); g.stroke(); }
  else {
    const w = mood === 'giggle' ? r * 0.3 : r * 0.24;
    g.beginPath(); g.moveTo(x - w, y + r * 0.18); g.quadraticCurveTo(x, y + r * 0.62, x + w, y + r * 0.18); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ff7f9f'; g.beginPath(); g.ellipse(x, y + r * 0.36, w * 0.45, r * 0.07, 0, 0, TAU); g.fill();
  }
  g.restore();
}

export function sparkle(x, y, r, a = 1, col = '#ffffff', g = ctx) {
  if (a <= 0) return;
  const pa = g.globalAlpha; g.globalAlpha = pa * a; g.fillStyle = col;
  g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill();
  g.globalAlpha = pa;
}
// A chunky glossy star or heart sticker.
export function sticker(kind, x, y, r, rot = 0, col) {
  const g = ctx; g.save();
  if (kind === 'star') starPath(g, x, y, r, rot, 5, 0.5); else heartPath(g, x, y, r);
  g.lineJoin = 'round'; g.lineWidth = r * 0.3; g.strokeStyle = kind === 'star' ? '#b85a00' : '#a01848'; g.stroke();
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  if (kind === 'star') { gr.addColorStop(0, '#fffbd0'); gr.addColorStop(0.4, col || '#ffd93a'); gr.addColorStop(1, '#ff9e00'); }
  else { gr.addColorStop(0, '#ffd0e4'); gr.addColorStop(0.4, col || '#ff5c9a'); gr.addColorStop(1, '#e0206a'); }
  g.fillStyle = gr; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(x - r * 0.28, y - r * 0.3, r * 0.2, r * 0.11, -0.6, 0, TAU); g.fill();
  g.restore();
}
