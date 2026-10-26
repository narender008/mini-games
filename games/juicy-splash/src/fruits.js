// The fourteen fruits, whole and cut. Each is drawn in unit space (radius 1)
// after translate/rotate/scale, then baked once per screen size into sprites
// (whole, cut half, and a soft shadow for each), which are what the game
// draws every frame. See makeSprites.
import { KIND_SIZE } from './kinds.js';
import { ctx, use, TAU, rng, mix, rgba, sym, starPath, blob, sparkle, glow, additive } from './draw.js';

const ell = (rx, ry, rot = 0) => g => { g.beginPath(); g.ellipse(0, 0, rx, ry, rot, 0, TAU); };
export const FRUIT = {
  watermelon: { skin: ['#b6f07a', '#3fb43c', '#17732a'], line: '#0f4a1c', juice: '#ff3d63', juice2: '#ffb0c0', shape: ell(1.12, 0.94) },
  orange: { skin: ['#ffe29a', '#ff9f1c', '#e2620a'], line: '#8a3a05', juice: '#ff9a1a', juice2: '#ffe0a0', top: -0.94, shape: g => { g.beginPath(); g.arc(0, 0, 1, 0, TAU); } },
  lemon: { skin: ['#fffbc0', '#ffe23a', '#e8b400'], line: '#8a6500', juice: '#ffe23a', juice2: '#fff8c8', top: -0.86,
    shape: g => sym(g, [0, -0.86], [[0.55, -0.9, 1.0, -0.5, 1.12, -0.12], [1.22, -0.02, 1.22, 0.1, 1.1, 0.16], [0.95, 0.65, 0.5, 0.88, 0, 0.88]]) },
  apple: { skin: ['#ff9a8a', '#f2283a', '#b0101e'], line: '#6a0a14', juice: '#ffd860', juice2: '#fff4c8', top: -0.62,
    shape: g => sym(g, [0, -0.66], [[0.3, -0.98, 1.05, -0.95, 1.02, -0.12], [1.0, 0.62, 0.62, 1.02, 0.28, 0.96], [0.15, 0.94, 0.08, 0.86, 0, 0.88]]) },
  strawberry: { skin: ['#ff8a9a', '#ff1f47', '#b8082a'], line: '#6a0418', juice: '#ff2a55', juice2: '#ffb3c4',
    shape: g => sym(g, [0, -0.8], [[0.45, -0.98, 1.02, -0.86, 0.98, -0.22], [0.95, 0.35, 0.4, 0.98, 0, 1.08]]) },
  kiwi: { skin: ['#d9b27a', '#9a6a36', '#5e3a18'], line: '#3a2208', juice: '#8fd94a', juice2: '#e4ffc0', top: -0.86, shape: ell(1.08, 0.9) },
  peach: { skin: ['#ffe0a8', '#ffa166', '#f05a4a'], line: '#7a2a16', juice: '#ffa84a', juice2: '#ffe0b0', top: -0.86,
    shape: g => sym(g, [0, -0.86], [[0.55, -1.02, 1.04, -0.6, 1.0, 0.02], [0.98, 0.62, 0.5, 0.98, 0, 0.98]]) },
  pear: { skin: ['#f4ffa8', '#b0dc40', '#6c9a1a'], line: '#3a560a', juice: '#d2ec6a', juice2: '#f8ffd0', top: -0.95,
    shape: g => sym(g, [0, -0.95], [[0.25, -0.98, 0.42, -0.62, 0.5, -0.3], [0.6, 0.0, 1.0, 0.25, 0.94, 0.62], [0.86, 0.98, 0.36, 1.04, 0, 1.02]]) },
  plum: { skin: ['#e0b0ff', '#8a3ad8', '#4a1490'], line: '#2a0858', juice: '#b84ae0', juice2: '#f0c8ff', top: -0.92, shape: ell(0.98, 0.94) },
  pineapple: { skin: ['#ffe48a', '#f2aa22', '#b06a10'], line: '#5a3008', juice: '#ffd23a', juice2: '#fff4b0', shape: ell(0.84, 1.0) },
  banana: { skin: ['#fff8b0', '#ffd83a', '#d8a010'], line: '#6a4a00', juice: '#fff07a', juice2: '#fffbe0',
    shape: g => { g.save(); g.rotate(-0.25); sym(g, [0, 0.1], [[0.42, 0.1, 0.8, -0.12, 0.98, -0.52], [1.06, -0.64, 1.14, -0.5, 1.1, -0.38], [1.0, 0.22, 0.52, 0.66, 0, 0.64]]); g.restore(); } },
  mango: { skin: ['#ffe066', '#ff8a2a', '#d83a2a'], line: '#7a2a0a', juice: '#ffb020', juice2: '#ffe8a0', top: -0.86, shape: ell(1.08, 0.86, -0.35) },
  dragonfruit: { skin: ['#ffb0e0', '#ff3aa0', '#c0106a'], line: '#6a0838', juice: '#ff4ab0', juice2: '#ffd0ec', shape: ell(0.92, 1.04) },
  pomegranate: { skin: ['#ffa090', '#e01c30', '#8a0a14'], line: '#4a0408', juice: '#e8103e', juice2: '#ff9ab0', shape: g => { g.beginPath(); g.arc(0, 0.04, 0.98, 0, TAU); } },
};
export const KINDS = Object.keys(FRUIT);

function skinFill(g, f, kind) {
  const gr = g.createRadialGradient(-0.38, -0.45, 0.05, -0.1, -0.1, 1.3);
  gr.addColorStop(0, f.skin[0]); gr.addColorStop(0.45, f.skin[1]); gr.addColorStop(1, f.skin[2]);
  g.fillStyle = gr; g.fill();
  const tint = (x, y, r, c) => { const b = g.createRadialGradient(x, y, 0, x, y, r); b.addColorStop(0, rgba(c, 0.6)); b.addColorStop(1, rgba(c, 0)); g.fillStyle = b; g.fill(); };
  if (kind === 'peach') tint(0.45, 0.25, 0.8, '#f03c46');
  if (kind === 'mango') tint(-0.55, -0.4, 0.9, '#9ad03a');
  if (kind === 'pear') tint(0.4, 0.4, 0.7, '#ffb03a');
}
// surface detail, drawn clipped inside the skin
function skinDeco(g, kind, seed) {
  const R = rng(seed);
  if (kind === 'watermelon') {
    g.strokeStyle = 'rgba(14,80,30,0.85)'; g.lineWidth = 0.13; g.lineCap = 'round';
    for (let i = -3; i <= 3; i++) { g.beginPath(); for (let t = -1; t <= 1.001; t += 0.05) { const x = i * 0.32 + Math.sin(t * 9 + i) * 0.05 + t * i * 0.08, y = t * 1.0; t === -1 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); }
  } else if (kind === 'orange' || kind === 'lemon') {
    g.fillStyle = 'rgba(160,60,0,0.16)';
    for (let i = 0; i < 70; i++) { const a = R() * TAU, d = Math.sqrt(R()) * 0.95; g.beginPath(); g.arc(Math.cos(a) * d * 1.1, Math.sin(a) * d, 0.022, 0, TAU); g.fill(); }
  } else if (kind === 'strawberry') {
    for (let row = 0; row < 6; row++) for (let c = -4; c <= 4; c++) {
      const y = -0.5 + row * 0.26, x = c * 0.24 + (row % 2) * 0.12; if (Math.abs(x) > 0.95 - row * 0.12) continue;
      g.fillStyle = '#8a0418'; g.beginPath(); g.ellipse(x, y + 0.02, 0.05, 0.075, 0, 0, TAU); g.fill();
      g.fillStyle = '#ffe866'; g.beginPath(); g.ellipse(x, y, 0.035, 0.06, 0, 0, TAU); g.fill();
    }
  } else if (kind === 'kiwi') {
    g.strokeStyle = 'rgba(70,40,10,0.35)'; g.lineWidth = 0.02;
    for (let i = 0; i < 160; i++) { const a = R() * TAU, d = Math.sqrt(R()), x = Math.cos(a) * d * 1.08, y = Math.sin(a) * d * 0.9; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 0.08, y + 0.06); g.stroke(); }
  } else if (kind === 'peach' || kind === 'plum') {
    g.strokeStyle = kind === 'plum' ? 'rgba(40,0,80,0.4)' : 'rgba(150,40,30,0.35)'; g.lineWidth = 0.05; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0.1, -0.8); g.bezierCurveTo(0.42, -0.3, 0.38, 0.3, 0.12, 0.85); g.stroke();
    if (kind === 'plum') { g.fillStyle = 'rgba(230,220,255,0.18)'; for (let i = 0; i < 40; i++) { const a = R() * TAU, d = Math.sqrt(R()) * 0.9; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 0.04 + R() * 0.05, 0, TAU); g.fill(); } }
  } else if (kind === 'apple') {
    g.strokeStyle = 'rgba(255,220,180,0.25)'; g.lineWidth = 0.03;
    for (let i = 0; i < 9; i++) { const x = -0.7 + i * 0.17; g.beginPath(); g.moveTo(x, -0.6); g.quadraticCurveTo(x * 1.2, 0.1, x * 0.8, 0.8); g.stroke(); }
  } else if (kind === 'pear') {
    g.fillStyle = 'rgba(120,90,20,0.25)'; for (let i = 0; i < 50; i++) { const a = R() * TAU, d = Math.sqrt(R()); g.beginPath(); g.arc(Math.cos(a) * d * 0.8, 0.3 + Math.sin(a) * d * 0.6, 0.018, 0, TAU); g.fill(); }
  } else if (kind === 'pineapple') {
    g.strokeStyle = 'rgba(120,60,0,0.55)'; g.lineWidth = 0.05;
    for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(i * 0.28 - 1.2, -1.2); g.lineTo(i * 0.28 + 1.2, 1.2); g.stroke(); g.beginPath(); g.moveTo(i * 0.28 + 1.2, -1.2); g.lineTo(i * 0.28 - 1.2, 1.2); g.stroke(); }
    for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) { const x = i * 0.28 + (j % 2 ? 0.14 : 0), y = j * 0.28; g.fillStyle = 'rgba(110,70,10,0.6)'; g.beginPath(); g.arc(x, y, 0.035, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,240,160,0.5)'; g.beginPath(); g.arc(x - 0.05, y - 0.08, 0.035, 0, TAU); g.fill(); }
  } else if (kind === 'banana') {
    g.strokeStyle = 'rgba(160,110,0,0.35)'; g.lineWidth = 0.04;
    for (const k of [0.3, 0.55]) { g.beginPath(); g.save(); g.rotate(-0.25); g.moveTo(-1.0, -0.48 + k * 0.2); g.quadraticCurveTo(0, 0.25 + k * 0.5, 1.0, -0.48 + k * 0.2); g.restore(); g.stroke(); }
    g.save(); g.rotate(-0.25); g.fillStyle = '#5a3a10'; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 1.06, -0.46, 0.08, 0, TAU); g.fill(); } g.restore();
  } else if (kind === 'mango') {
    g.fillStyle = 'rgba(255,255,200,0.3)'; for (let i = 0; i < 30; i++) { const a = R() * TAU, d = Math.sqrt(R()) * 0.85; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d * 0.8, 0.018, 0, TAU); g.fill(); }
  } else if (kind === 'pomegranate') {
    g.strokeStyle = 'rgba(255,200,180,0.25)'; g.lineWidth = 0.04;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(0, -1.6, 1.3 + i * 0.25, 1.2, 1.95); g.stroke(); }
  }
}
export function leaf(g, x, y, len, rot, col = '#4cc23a', line = '#17501a') {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(len * 0.3, -len * 0.42, len * 0.8, -len * 0.38, len, 0); g.bezierCurveTo(len * 0.8, len * 0.38, len * 0.3, len * 0.42, 0, 0); g.closePath();
  g.lineWidth = len * 0.16; g.strokeStyle = line; g.lineJoin = 'round'; g.stroke();
  const gr = g.createLinearGradient(0, -len * 0.4, 0, len * 0.4); gr.addColorStop(0, mix(col, '#ffffff', 0.35)); gr.addColorStop(1, mix(col, '#000000', 0.15));
  g.fillStyle = gr; g.fill();
  g.strokeStyle = rgba('#ffffff', 0.5); g.lineWidth = len * 0.05; g.beginPath(); g.moveTo(len * 0.12, 0); g.lineTo(len * 0.85, 0); g.stroke();
  g.restore();
}
function spike(g, x, y, len, rot, base, tip, line) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath(); g.moveTo(-len * 0.32, 0); g.quadraticCurveTo(-len * 0.1, -len * 0.6, len * 0.12, -len); g.quadraticCurveTo(len * 0.15, -len * 0.5, len * 0.32, 0); g.closePath();
  g.lineJoin = 'round'; g.lineWidth = 0.08; g.strokeStyle = line; g.stroke();
  const gr = g.createLinearGradient(0, 0, 0, -len); gr.addColorStop(0, base); gr.addColorStop(1, tip); g.fillStyle = gr; g.fill();
  g.restore();
}
function topper(g, kind) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  if (kind === 'strawberry') {
    g.beginPath();
    for (let i = 0; i < 12; i++) { const a = Math.PI + (i / 11) * Math.PI, r = i % 2 ? 0.22 : 0.52; g.lineTo(Math.cos(a) * r, -0.7 + Math.sin(a) * r * 0.45); }
    g.closePath(); g.lineWidth = 0.1; g.strokeStyle = '#17501a'; g.stroke(); g.fillStyle = '#46c03a'; g.fill();
    g.lineWidth = 0.14; g.strokeStyle = '#17501a'; g.beginPath(); g.moveTo(0, -0.9); g.lineTo(0.05, -1.12); g.stroke();
    g.lineWidth = 0.07; g.strokeStyle = '#5fd04a'; g.stroke(); return;
  }
  if (kind === 'pineapple') {
    for (const [a, l] of [[-0.75, 0.55], [0.75, 0.55], [-0.4, 0.75], [0.4, 0.75], [0, 0.9]]) spike(g, a * 0.25, -0.92, l, a, '#2f8a2a', '#9be060', '#17501a');
    return;
  }
  if (kind === 'dragonfruit') {
    const pts = [[-0.9, 0.1, -1.5], [0.9, -0.1, 1.5], [-0.75, -0.6, -0.9], [0.72, 0.55, 1.9], [-0.55, 0.75, -2.3], [0.1, -1.0, 0.1], [0.5, -0.85, 0.6], [-0.3, 0.05, -0.4], [0.35, 0.25, 0.7]];
    for (const [x, y, r] of pts) spike(g, x, y, 0.42, r, '#ff3aa0', '#8ae04a', '#6a0838');
    return;
  }
  if (kind === 'pomegranate') {
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = Math.PI + (i / 9) * Math.PI, r = i % 2 ? 0.14 : 0.3; g.lineTo(Math.cos(a) * r, -0.92 + Math.sin(a) * r * 0.9); } g.lineTo(0.22, -0.82); g.lineTo(-0.22, -0.82); g.closePath();
    g.lineWidth = 0.1; g.strokeStyle = '#4a0408'; g.stroke(); g.fillStyle = '#b8142a'; g.fill(); return;
  }
  if (kind === 'watermelon') return;
  if (kind === 'banana') { g.save(); g.rotate(-0.25); g.lineWidth = 0.18; g.strokeStyle = '#5a3a10'; g.beginPath(); g.moveTo(-1.02, -0.42); g.lineTo(-1.2, -0.62); g.stroke(); g.lineWidth = 0.08; g.strokeStyle = '#a88a30'; g.stroke(); g.restore(); return; }
  const top = FRUIT[kind].top ?? -0.94;
  if (kind === 'lemon') { g.beginPath(); g.ellipse(1.1, 0.02, 0.1, 0.08, 0, 0, TAU); g.fillStyle = '#e8b400'; g.fill(); }
  g.lineWidth = 0.15; g.strokeStyle = '#3a2208';
  g.beginPath(); g.moveTo(0, top + 0.08); g.quadraticCurveTo(0.02, top - 0.15, 0.12, top - 0.28); g.stroke();
  g.lineWidth = 0.07; g.strokeStyle = '#8a5a2a'; g.stroke();
  if (kind !== 'kiwi') leaf(g, 0.08, top - 0.12, 0.62, -0.5);
}
function highlight(g, kind) {
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(-0.42, -0.42, 0.26, 0.14, -0.75, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(-0.2, -0.62, 0.07, 0.05, -0.6, 0, TAU); g.fill();
  if (kind === 'kiwi') return;
  g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 0.06; g.lineCap = 'round';
  g.beginPath(); g.arc(0, 0, 0.8, 0.25, 1.05); g.stroke();
}

// Whole fruit at (x, y), radius r.
export function drawFruit(kind, x, y, r, rot = 0, seed = 7) {
  const f = FRUIT[kind], g = ctx; g.save(); g.translate(x, y); g.rotate(rot); g.scale(r, r);
  g.lineJoin = 'round';
  f.shape(g); g.lineWidth = 0.16; g.strokeStyle = f.line; g.stroke(); g.fillStyle = f.line; g.fill();
  if (kind === 'dragonfruit') topper(g, kind);
  f.shape(g); skinFill(g, f, kind);
  g.save(); f.shape(g); g.clip(); skinDeco(g, kind, seed);
  const rim = g.createRadialGradient(0.1, 0.1, 0.6, 0, 0, 1.15); rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, rgba(f.line, 0.35)); g.fillStyle = rim; g.fillRect(-2, -2, 4, 4);
  highlight(g, kind); g.restore();
  if (kind !== 'dragonfruit') topper(g, kind);
  g.restore();
}

// The face of a cut half: rings of rind and flesh, seeds.
export function flesh(g, kind, f = FRUIT[kind]) {
  const ring = (s, c) => { g.save(); g.scale(s, s); f.shape(g); g.fillStyle = c; g.fill(); g.restore(); };
  const rad = (s, a, b, c) => { g.save(); g.scale(s, s); f.shape(g); const gr = g.createRadialGradient(0, -0.1, 0, 0, 0, 1); gr.addColorStop(0, a); gr.addColorStop(0.6, b); gr.addColorStop(1, c); g.fillStyle = gr; g.fill(); g.restore(); };
  const seedDrop = (x, y, a, w, h, c) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = c; g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, TAU); g.fill(); g.restore(); };
  if (kind === 'watermelon') {
    ring(1, '#1d8a30'); ring(0.92, '#8fe07a'); ring(0.86, '#f4ffe0');
    rad(0.8, '#ff8fa0', '#ff3d5e', '#e8203f');
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + 0.2, d = i % 2 ? 0.42 : 0.58; seedDrop(Math.cos(a) * d * 1.1, Math.sin(a) * d * 0.94, a + Math.PI / 2, 0.045, 0.085, '#2a1410'); }
  } else if (kind === 'orange' || kind === 'lemon') {
    const L = kind === 'lemon';
    ring(1, L ? '#f0c000' : '#f07a10'); ring(0.9, L ? '#fffbe0' : '#fff2d6');
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU + 0.04, a1 = (i + 1) / n * TAU - 0.04;
      g.save(); g.scale(L ? 1.08 : 1, L ? 0.82 : 1);
      g.beginPath(); g.moveTo(Math.cos((a0 + a1) / 2) * 0.1, Math.sin((a0 + a1) / 2) * 0.1); g.arc(0, 0, 0.8, a0, a1); g.closePath();
      const gr = g.createRadialGradient(0, 0, 0.1, 0, 0, 0.8); gr.addColorStop(0, L ? '#fffcc0' : '#ffd07a'); gr.addColorStop(0.5, L ? '#ffef6a' : '#ffa62a'); gr.addColorStop(1, L ? '#ffe030' : '#ff8a10');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.025; g.beginPath(); g.arc(0, 0, 0.6, a0 + 0.12, a1 - 0.12); g.stroke();
      g.restore();
    }
    ring(0.1, L ? '#fffbe0' : '#fff2d6');
  } else if (kind === 'apple' || kind === 'pear') {
    const A = kind === 'apple';
    ring(1, A ? '#d0182a' : '#8ab82a'); rad(0.93, '#fffbe8', A ? '#fff1c4' : '#f8f6c8', A ? '#f6dd96' : '#e8e8a0');
    if (A) {
      g.fillStyle = '#f2d48a'; starPath(g, 0, 0, 0.32, 0, 5, 0.5); g.fill();
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i / 5 * TAU; seedDrop(Math.cos(a) * 0.17, Math.sin(a) * 0.17, a + Math.PI / 2, 0.05, 0.09, '#5a2a0e'); }
    } else {
      g.fillStyle = '#eee0a0'; g.beginPath(); g.ellipse(0, 0.32, 0.2, 0.34, 0, 0, TAU); g.fill();
      seedDrop(-0.07, 0.34, 0.3, 0.045, 0.09, '#5a2a0e'); seedDrop(0.07, 0.34, -0.3, 0.045, 0.09, '#5a2a0e');
      g.strokeStyle = '#e6d890'; g.lineWidth = 0.04; g.beginPath(); g.moveTo(0, -0.9); g.lineTo(0, 0); g.stroke();
    }
  } else if (kind === 'kiwi') {
    ring(1, '#6a4420'); rad(0.92, '#eaffc8', '#9be04a', '#5cb820');
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 0.02;
    for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 0.28, Math.sin(a) * 0.24); g.lineTo(Math.cos(a) * 0.85, Math.sin(a) * 0.72); g.stroke(); }
    g.fillStyle = '#fbfff0'; g.beginPath(); g.ellipse(0, 0, 0.26, 0.2, 0, 0, TAU); g.fill();
    for (let i = 0; i < 30; i++) { const a = i / 30 * TAU, d = 0.34 + (i % 3) * 0.04; seedDrop(Math.cos(a) * d * 1.1, Math.sin(a) * d * 0.92, a, 0.04, 0.022, '#1a1208'); }
  } else if (kind === 'strawberry') {
    ring(1, '#e0102e'); rad(0.9, '#ffe8ee', '#ff6a86', '#f01e48');
    g.fillStyle = '#fff0f3'; g.save(); g.scale(0.4, 0.5); f.shape(g); g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,240,245,0.7)'; g.lineWidth = 0.025; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.35); g.lineTo(Math.cos(a) * 0.75, Math.sin(a) * 0.8); g.stroke(); }
  } else if (kind === 'peach' || kind === 'plum') {
    const Pm = kind === 'plum';
    ring(1, Pm ? '#5a1a9a' : '#f06a4a'); rad(0.93, Pm ? '#fff6b0' : '#fff0b0', Pm ? '#ffd04a' : '#ffc24d', Pm ? '#e88a30' : '#ff9a30');
    const pg = g.createRadialGradient(0, 0, 0.1, 0, 0, 0.5); pg.addColorStop(0, 'rgba(220,60,40,0.7)'); pg.addColorStop(1, 'rgba(220,60,40,0)'); g.fillStyle = pg; g.beginPath(); g.arc(0, 0, 0.5, 0, TAU); g.fill();
    g.fillStyle = Pm ? '#a86a30' : '#7a3a18'; g.beginPath(); g.ellipse(0, 0.02, Pm ? 0.22 : 0.3, Pm ? 0.3 : 0.36, 0, 0, TAU); g.fill();
    g.strokeStyle = '#4a200a'; g.lineWidth = 0.03; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 0.08, -0.26); g.quadraticCurveTo(i * 0.13, 0, i * 0.08, 0.28); g.stroke(); }
  } else if (kind === 'pineapple') {
    ring(1, '#c08018'); rad(0.9, '#fffbd8', '#ffe880', '#ffd040');
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.025; for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 0.25, Math.sin(a) * 0.3); g.lineTo(Math.cos(a) * 0.7, Math.sin(a) * 0.85); g.stroke(); }
    g.fillStyle = '#fff4c0'; g.beginPath(); g.ellipse(0, 0, 0.2, 0.24, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(150,90,10,0.55)'; for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; g.beginPath(); g.arc(Math.cos(a) * 0.68, Math.sin(a) * 0.82, 0.035, 0, TAU); g.fill(); }
  } else if (kind === 'banana') {
    ring(1, '#e8b820'); rad(0.86, '#fffdf0', '#fff6d0', '#f4e4a0');
    g.save(); g.rotate(-0.25); g.fillStyle = 'rgba(120,80,20,0.6)'; for (let i = -4; i <= 4; i++) { const x = i * 0.18; g.beginPath(); g.arc(x, -0.12 + x * x * 0.32 + 0.22, 0.025, 0, TAU); g.fill(); } g.restore();
  } else if (kind === 'mango') {
    ring(1, '#e06a20'); rad(0.92, '#ffeea0', '#ffc030', '#ff9a18');
    g.save(); g.rotate(-0.35); g.fillStyle = '#fff6d8'; g.beginPath(); g.ellipse(0, 0, 0.62, 0.26, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(230,180,90,0.8)'; g.lineWidth = 0.025; for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(i * 0.12, -0.2); g.lineTo(i * 0.13, 0.2); g.stroke(); } g.restore();
  } else if (kind === 'dragonfruit') {
    ring(1, '#ff3aa0'); rad(0.9, '#ffffff', '#fbf6fa', '#efe4ee');
    const R = rng(4); for (let i = 0; i < 110; i++) { const a = R() * TAU, d = Math.sqrt(R()) * 0.78; seedDrop(Math.cos(a) * d * 0.9, Math.sin(a) * d * 1.02, a, 0.03, 0.022, '#1a1018'); }
  } else if (kind === 'pomegranate') {
    ring(1, '#a8101e'); ring(0.9, '#fff0d8');
    const R = rng(9);
    for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) {
      const x = i * 0.13 + (j % 2 ? 0.065 : 0), y = j * 0.115 + 0.04; if (x * x + (y - 0.04) * (y - 0.04) > 0.72) continue;
      if (Math.abs(x) < 0.03 || Math.abs(y - 0.04) < 0.03) continue;
      g.fillStyle = mix('#ff1a40', '#c00830', R()); g.beginPath(); g.ellipse(x, y, 0.06, 0.055, R(), 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(x - 0.02, y - 0.02, 0.015, 0, TAU); g.fill();
    }
  }
  // wet sheen on the cut
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-0.25, -0.45, 0.3, 0.08, -0.3, 0, TAU); g.fill();
}

// One half of a cut fruit. The curved side faces -y in the half's own frame;
// a sliver of skin shows behind the face for thickness.
export function drawHalf(kind, x, y, r, rot) {
  const f = FRUIT[kind], g = ctx; g.save(); g.translate(x, y); g.rotate(rot); g.scale(r, r); g.lineJoin = 'round';
  const half = (y0) => { g.beginPath(); g.rect(-3, -3, 6, 3 + y0); };
  const back = [0, -0.16];
  g.save(); half(0.07); g.clip();
  for (const o of [back, [0, 0]]) { g.save(); g.translate(o[0], o[1]); f.shape(g); g.lineWidth = 0.16; g.strokeStyle = f.line; g.stroke(); g.fillStyle = f.line; g.fill(); g.restore(); }
  g.restore();
  g.save(); half(0); g.clip();
  g.save(); g.translate(back[0], back[1]); f.shape(g); skinFill(g, f, kind); g.save(); f.shape(g); g.clip(); skinDeco(g, kind, 3); g.restore(); g.restore();
  g.save(); f.shape(g); g.clip(); flesh(g, kind, f); g.restore();
  g.restore();
  g.strokeStyle = rgba(f.juice2, 0.8); g.lineWidth = 0.05; g.lineCap = 'round'; g.beginPath(); g.moveTo(-0.75, -0.06); g.lineTo(0.75, -0.06); g.stroke();
  g.restore();
}

// Bake sprites for every fruit at radius r (device pixels). Each sprite is a
// square canvas of side 2*pad*r with the fruit's centre in the middle.
const PAD = 1.95;
function canvas(w, h) { const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas'); c.width = w; c.height = h; return c; }
function shadowOf(src, blur) {
  const c = canvas(src.width, src.height), g = c.getContext('2d'), far = src.width * 4;
  g.shadowColor = 'rgba(40,30,80,0.3)'; g.shadowBlur = blur; g.shadowOffsetX = far;
  g.drawImage(src, -far, 0);
  return c;
}
export function makeSprites(r) {
  const prev = ctx, out = {}, side = Math.ceil(2 * PAD * r);
  for (const kind of KINDS) {
    const rr = r * (KIND_SIZE[kind] || 1);
    const s = Math.ceil(2 * PAD * rr);
    const whole = canvas(s, s); use(whole.getContext('2d')); drawFruit(kind, s / 2, s / 2, rr, 0);
    const half = canvas(s, s); use(half.getContext('2d')); drawHalf(kind, s / 2, s / 2, rr, 0);
    out[kind] = { r: rr, size: s, whole, half, wholeShadow: shadowOf(whole, rr * 0.3), halfShadow: shadowOf(half, rr * 0.3) };
  }
  use(prev); out.side = side;
  return out;
}

// Juice: a splash burst where the blade passed, with flying drops (used by
// title art and the hint card; live splashes are particles, see fx.js).
export function splash(x, y, s, col, col2, dir, seed, flash = true) {
  const g = ctx, R = rng(seed); g.save(); g.lineJoin = 'round';
  for (let i = 0; i < 16; i++) {
    const a = dir + (R() - 0.5) * 2.6 + (i % 2 ? Math.PI : 0), d = s * (0.7 + R() * 1.4), len = s * (0.3 + R() * 0.5), w = s * (0.06 + R() * 0.08);
    drop(g, x + Math.cos(a) * d, y + Math.sin(a) * d, a, len, w, col);
  }
  for (let i = 0; i < 18; i++) { const a = R() * TAU, d = s * (0.5 + R() * 1.6), rr2 = s * (0.03 + R() * 0.06); g.fillStyle = R() < 0.3 ? col2 : col; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr2, 0, TAU); g.fill(); }
  blob(g, x, y, s * 0.55, seed, 6, 0.32); g.fillStyle = col; g.fill();
  blob(g, x - s * 0.08, y - s * 0.08, s * 0.32, seed + 1, 5, 0.3); g.fillStyle = col2; g.fill();
  g.restore();
  if (flash) { additive(() => glow(x, y, s * 0.9, '#ffffff', 0.3)); sparkle(x, y, s * 0.38, 0.95); }
}
// A teardrop of juice pointing along angle a (head at x, y).
export function drop(g, x, y, a, len, w, col) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.beginPath(); g.moveTo(-len, 0); g.quadraticCurveTo(-len * 0.3, -w, 0, -w); g.arc(0, 0, w, -Math.PI / 2, Math.PI / 2); g.quadraticCurveTo(-len * 0.3, w, -len, 0); g.closePath();
  g.fillStyle = col; g.fill(); g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(w * 0.1, -w * 0.35, w * 0.35, 0, TAU); g.fill();
  g.restore();
}
// Juice stain on the blanket or grass, squashed by perspective.
export function stain(x, y, s, col, seed, a = 0.85) {
  const g = ctx, R = rng(seed); g.save(); g.globalAlpha = a;
  blob(g, x, y, s, seed, 7, 0.28, 0.45); g.fillStyle = mix(col, '#000000', 0.15); g.fill();
  blob(g, x, y - s * 0.04, s * 0.88, seed, 7, 0.28, 0.42); g.fillStyle = col; g.fill();
  for (let i = 0; i < 9; i++) { const a2 = R() * TAU, d = s * (1.1 + R() * 0.6); g.beginPath(); g.ellipse(x + Math.cos(a2) * d, y + Math.sin(a2) * d * 0.45, s * (0.05 + R() * 0.1), s * (0.03 + R() * 0.05), 0, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(x - s * 0.3, y - s * 0.12, s * 0.28, s * 0.06, 0, 0, TAU); g.fill();
  g.restore();
}
