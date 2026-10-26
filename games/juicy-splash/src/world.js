// The sunny orchard picnic: sky, sun friend, clouds, hills, fruit trees,
// gingham blanket, picnic basket, the juice jar, the swipe trail and party
// pieces. Positions are in CSS pixels for the layout set by setLayout().
import { ctx, use, TAU, rng, lerp, mix, rgba, rr, glow, additive, blob, sparkle, starPath } from './draw.js';
import { drawFruit, flesh, leaf, FRUIT } from './fruits.js';

let W = 1, H = 1, u = 1, HZ = 1, BT = 1, PORTRAIT = false;
export function setLayout(w, h) {
  W = w; H = h; PORTRAIT = h > w * 1.05; u = Math.min(w, h) / 900;
  if (PORTRAIT) u = Math.min(w / 900 * 1.2, h / 1600);
  HZ = h * 0.6; BT = PORTRAIT ? h * 0.8 : h * 0.79;
  return { W, H, u, HZ, BT, portrait: PORTRAIT };
}
export const jarBox = () => PORTRAIT
  ? { x: W * 0.8, y: H - 40 * u, w: 190 * u, h: 290 * u }
  : { x: W * 0.895, y: H - 34 * u, w: 170 * u, h: 260 * u };
export const sunPos = () => ({ x: PORTRAIT ? W * 0.2 : W * 0.15, y: PORTRAIT ? H * 0.14 : H * 0.21, r: 64 * u });
export const basketPos = () => ({ x: PORTRAIT ? W * 0.18 : W * 0.11, y: H - 95 * u, s: 95 * u });
export const clouds = () => [[0.4, PORTRAIT ? 0.09 : 0.14, 80], [0.74, PORTRAIT ? 0.2 : 0.11, 95], [0.9, PORTRAIT ? 0.36 : 0.27, 60], ...(PORTRAIT ? [[0.25, 0.3, 70]] : [])].map(([x, y, s], i) => ({ x: x * W, y: y * H, s: s * u, seed: i + 1 }));
export function sky(warm = 0) {
  const g = ctx, gr = g.createLinearGradient(0, 0, 0, HZ);
  gr.addColorStop(0, mix('#3fb0ff', '#7a7cff', warm * 0.3)); gr.addColorStop(0.55, mix('#9edcff', '#ffc8f0', warm * 0.5)); gr.addColorStop(1, mix('#fff2cc', '#ffe0b0', warm));
  g.fillStyle = gr; g.fillRect(0, 0, W, HZ + 40 * u);
  // soft painterly bands
  const R = rng(4);
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.ellipse(R() * W, HZ * (0.2 + R() * 0.6), W * 0.4, 30 * u, 0, 0, TAU); g.fill(); }
}
export function sunRays(x, y, r, rot, a = 1) {
  const g = ctx; g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = a;
  for (let i = 0; i < 12; i++) {
    g.rotate(TAU / 12);
    g.beginPath(); g.moveTo(-r * 0.22, -r * 1.12); g.quadraticCurveTo(0, -r * 1.75, r * 0.22, -r * 1.12); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = r * 0.1; g.strokeStyle = '#ff9a00'; g.stroke(); g.fillStyle = i % 2 ? '#ffd23a' : '#ffe680'; g.fill();
  }
  g.restore();
}
// mood: smile | laugh | wow | grin
export function sunFriend(x, y, r, mood = 'smile', rot = 0.1) {
  const g = ctx;
  additive(() => glow(x, y, r * 4, '#fff2a0', 0.55));
  sunRays(x, y, r, rot);
  g.save(); g.translate(x, y);
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.lineWidth = r * 0.12; g.strokeStyle = '#e07a00'; g.stroke();
  const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1); gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.45, '#ffe04a'); gr.addColorStop(1, '#ffb000'); g.fillStyle = gr; g.fill();
  g.fillStyle = 'rgba(255,120,100,0.45)'; g.beginPath(); g.ellipse(-r * 0.55, r * 0.2, r * 0.18, r * 0.11, 0, 0, TAU); g.ellipse(r * 0.55, r * 0.2, r * 0.18, r * 0.11, 0, 0, TAU); g.fill();
  g.strokeStyle = '#5a2a00'; g.fillStyle = '#5a2a00'; g.lineCap = 'round'; g.lineWidth = r * 0.09;
  if (mood === 'laugh' || mood === 'grin') {
    for (const s of [-1, 1]) { g.beginPath(); g.arc(s * r * 0.34, -r * 0.12, r * 0.14, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  } else {
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * r * 0.32, -r * 0.15, r * 0.1, r * 0.15, 0, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(s * r * 0.32 - r * 0.03, -r * 0.21, r * 0.04, 0, TAU); g.fill(); g.fillStyle = '#5a2a00'; }
  }
  if (mood === 'wow') { g.beginPath(); g.ellipse(0, r * 0.35, r * 0.13, r * 0.17, 0, 0, TAU); g.fillStyle = '#7a1a10'; g.fill(); }
  else {
    const big = mood !== 'smile';
    g.beginPath(); g.moveTo(-r * 0.38, r * 0.18); g.quadraticCurveTo(0, r * (big ? 0.85 : 0.55), r * 0.38, r * 0.18); g.closePath();
    g.fillStyle = '#7a1a10'; g.fill(); g.lineWidth = r * 0.07; g.lineJoin = 'round'; g.stroke();
    if (big) { g.save(); g.clip(); g.fillStyle = '#ff6a7a'; g.beginPath(); g.ellipse(0, r * 0.6, r * 0.22, r * 0.14, 0, 0, TAU); g.fill(); g.restore(); }
  }
  g.restore();
}
export function cloud(x, y, s, seed) {
  const g = ctx, R = rng(seed), puffs = [];
  for (let i = 0; i < 6; i++) { const t = i / 5 - 0.5; puffs.push([x + t * s * 2.2 + (R() - 0.5) * s * 0.2, y - Math.cos(t * 2.6) * s * 0.45 - R() * s * 0.15, s * (0.38 + Math.cos(t * 2.2) * 0.25 + R() * 0.1)]); }
  const path = () => { g.beginPath(); for (const p of puffs) { g.moveTo(p[0] + p[2], p[1]); g.arc(p[0], p[1], p[2], 0, TAU); } g.rect(x - s * 1.15, y - s * 0.2, s * 2.3, s * 0.32); };
  g.save(); path(); g.lineWidth = s * 0.08; g.strokeStyle = 'rgba(110,170,230,0.55)'; g.stroke(); g.fillStyle = '#ffffff'; g.fill(); g.clip();
  const gr = g.createLinearGradient(0, y - s * 0.8, 0, y + s * 0.15); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.65, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(170,210,245,0.85)');
  g.fillStyle = gr; g.fillRect(x - s * 2, y - s * 2, s * 4, s * 3); g.restore();
}
export function hill(y0, amp, freq, phase, c1, c2, seed) {
  const g = ctx; g.beginPath(); g.moveTo(-10, H);
  for (let x = -10; x <= W + 10; x += 8) g.lineTo(x, y0 - Math.sin(x / W * freq + phase) * amp - Math.sin(x / W * freq * 2.3 + phase * 2) * amp * 0.35);
  g.lineTo(W + 10, H); g.closePath();
  const gr = g.createLinearGradient(0, y0 - amp, 0, y0 + 120 * u); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fill();
  g.save(); g.clip(); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 6 * u; g.beginPath();
  for (let x = -10; x <= W + 10; x += 8) g.lineTo(x, y0 + 4 * u - Math.sin(x / W * freq + phase) * amp - Math.sin(x / W * freq * 2.3 + phase * 2) * amp * 0.35); g.stroke(); g.restore();
}
export function tree(x, y, s, seed, fruitCol) {
  const g = ctx, R = rng(seed);
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  g.fillStyle = 'rgba(30,90,30,0.25)'; g.beginPath(); g.ellipse(x, y + s * 0.05, s * 0.7, s * 0.12, 0, 0, TAU); g.fill();
  g.strokeStyle = '#4a2a10'; g.lineWidth = s * 0.26; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 0.7); g.stroke();
  g.strokeStyle = '#9a6030'; g.lineWidth = s * 0.16; g.stroke();
  const puffs = []; for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; puffs.push([x + Math.cos(a) * s * 0.5, y - s * 1.15 + Math.sin(a) * s * 0.38, s * (0.42 + R() * 0.12)]); }
  puffs.push([x, y - s * 1.2, s * 0.6]);
  const path = () => { g.beginPath(); for (const p of puffs) { g.moveTo(p[0] + p[2], p[1]); g.arc(p[0], p[1], p[2], 0, TAU); } };
  path(); g.lineWidth = s * 0.08; g.strokeStyle = '#1e6a24'; g.stroke();
  const gr = g.createRadialGradient(x - s * 0.4, y - s * 1.6, s * 0.1, x, y - s * 1.1, s * 1.2); gr.addColorStop(0, '#b8f070'); gr.addColorStop(0.5, '#5cc444'); gr.addColorStop(1, '#2c8a34');
  g.fillStyle = gr; g.fill();
  g.save(); path(); g.clip(); g.fillStyle = 'rgba(255,255,255,0.18)'; for (const p of puffs) { g.beginPath(); g.arc(p[0] - p[2] * 0.3, p[1] - p[2] * 0.35, p[2] * 0.45, 0, TAU); g.fill(); } g.restore();
  for (let i = 0; i < 6; i++) { const a = R() * TAU, d = R() * s * 0.75; const fx = x + Math.cos(a) * d, fy = y - s * 1.15 + Math.sin(a) * d * 0.6, fr = s * 0.1; g.beginPath(); g.arc(fx, fy, fr, 0, TAU); g.fillStyle = mix(fruitCol, '#000000', 0.35); g.fill(); g.beginPath(); g.arc(fx, fy, fr * 0.8, 0, TAU); g.fillStyle = fruitCol; g.fill(); g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(fx - fr * 0.3, fy - fr * 0.3, fr * 0.25, 0, TAU); g.fill(); }
  g.restore();
}
export function flower(x, y, s, col) {
  const g = ctx; g.save(); g.strokeStyle = '#2f8a2a'; g.lineWidth = s * 0.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y + s * 1.4); g.quadraticCurveTo(x + s * 0.3, y + s * 0.6, x, y); g.stroke();
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; g.beginPath(); g.arc(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.48, 0, TAU); g.fillStyle = col; g.fill(); }
  g.beginPath(); g.arc(x, y, s * 0.36, 0, TAU); g.fillStyle = '#ffd23a'; g.fill(); g.restore();
}
export function meadow() {
  const g = ctx;
  hill(HZ - 70 * u, 40 * u, 5, 0.6, '#b6e6a8', '#8fd08a', 1);
  // distant orchard rows
  const R = rng(11), cols = ['#ff5a4a', '#ffa030', '#ffd23a', '#ff6aa0'];
  for (let i = 0; i < Math.ceil(W / (110 * u)) + 2; i++) tree(i * 110 * u - 40 * u + R() * 30 * u, HZ - 20 * u + R() * 10 * u, 48 * u, 100 + i, cols[i % 4]);
  hill(HZ + 10 * u, 30 * u, 3.4, 2.1, '#8cd860', '#5cbc3c', 2);
  const gr = g.createLinearGradient(0, HZ, 0, H); gr.addColorStop(0, '#7ccf4c'); gr.addColorStop(1, '#3f9a2c');
  g.fillStyle = gr; g.fillRect(0, HZ + 30 * u, W, H);
  // big near trees at the edges frame the play field
  tree(PORTRAIT ? W * 0.08 : W * 0.04, HZ + 120 * u, 150 * u, 7, '#ff4a3a');
  tree(PORTRAIT ? W * 0.95 : W * 0.97, HZ + 110 * u, 135 * u, 9, '#ffa030');
  // grass tufts and flowers
  const R2 = rng(21);
  g.strokeStyle = 'rgba(40,120,30,0.35)'; g.lineWidth = 3 * u; g.lineCap = 'round';
  for (let i = 0; i < 70; i++) { const x = R2() * W, y = HZ + 40 * u + R2() * (H - HZ); g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4 * u, y - 12 * u); g.moveTo(x, y); g.lineTo(x + 5 * u, y - 14 * u); g.stroke(); }
  const fc = ['#ffffff', '#ff8ac0', '#ffd23a', '#b48aff'];
  for (let i = 0; i < 26; i++) flower(R2() * W, HZ + 50 * u + R2() * (BT - HZ - 60 * u), (5 + R2() * 4) * u, fc[i % 4]);
}
// Gingham blanket in perspective.
export function blanket() {
  const g = ctx, top = BT, bot = H + 60 * u, cx = W / 2, tw = PORTRAIT ? W * 0.9 : W * 0.72, bw = PORTRAIT ? W * 1.5 : W * 1.25;
  const pt = (i, j, nc, nr) => { const t = Math.pow(j / nr, 1.35), y = lerp(top, bot, t), w = lerp(tw, bw, t); return [cx - w / 2 + w * i / nc, y]; };
  const nc = 14, nr = 6;
  g.save();
  g.fillStyle = 'rgba(20,60,10,0.35)'; g.beginPath(); const s0 = pt(0, 0, nc, nr), s1 = pt(nc, 0, nc, nr); g.moveTo(s0[0] - 10 * u, s0[1] + 14 * u); g.lineTo(s1[0] + 10 * u, s1[1] + 14 * u); g.lineTo(cx + bw, bot); g.lineTo(cx - bw, bot); g.fill();
  for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++) {
    const a = pt(i, j, nc, nr), b = pt(i + 1, j, nc, nr), c = pt(i + 1, j + 1, nc, nr), d = pt(i, j + 1, nc, nr);
    const k = (i % 2) + (j % 2);
    g.fillStyle = k === 2 ? '#e8384a' : k === 1 ? '#f59aa2' : '#fff6ee';
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
  }
  // weave lines, light falloff and a scalloped hem
  const L = g.createLinearGradient(0, top, 0, bot); L.addColorStop(0, 'rgba(255,240,200,0.18)'); L.addColorStop(1, 'rgba(80,0,20,0.12)'); g.fillStyle = L;
  g.beginPath(); const c0 = pt(0, 0, nc, nr), c1 = pt(nc, 0, nc, nr), c2 = pt(nc, nr, nc, nr), c3 = pt(0, nr, nc, nr); g.moveTo(c0[0], c0[1]); g.lineTo(c1[0], c1[1]); g.lineTo(c2[0], c2[1]); g.lineTo(c3[0], c3[1]); g.fill();
  g.fillStyle = '#c8203a'; for (let i = 0; i < nc * 2; i++) { const p = pt(i / 2, 0, nc, nr); g.beginPath(); g.arc(p[0] + tw / nc / 4, top, tw / nc / 4.5, Math.PI, 0); g.fill(); }
  g.restore();
}
export function basket(x, y, s) {
  const g = ctx; g.save(); g.lineJoin = 'round';
  g.fillStyle = 'rgba(60,10,10,0.3)'; g.beginPath(); g.ellipse(x, y + s * 0.5, s * 1.1, s * 0.18, 0, 0, TAU); g.fill();
  // handle
  g.lineCap = 'round'; g.strokeStyle = '#5a2e0c'; g.lineWidth = s * 0.2; g.beginPath(); g.ellipse(x, y - s * 0.2, s * 0.75, s * 0.85, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.strokeStyle = '#d08a40'; g.lineWidth = s * 0.11; g.stroke();
  // fruit peeking out
  drawFruit('apple', x - s * 0.45, y - s * 0.3, s * 0.38, -0.3);
  drawFruit('orange', x + s * 0.1, y - s * 0.38, s * 0.36, 0.2);
  drawFruit('lemon', x + s * 0.6, y - s * 0.22, s * 0.32, 0.5);
  g.beginPath(); g.moveTo(x - s, y - s * 0.15); g.lineTo(x + s, y - s * 0.15); g.lineTo(x + s * 0.8, y + s * 0.55); g.quadraticCurveTo(x, y + s * 0.68, x - s * 0.8, y + s * 0.55); g.closePath();
  g.lineWidth = s * 0.08; g.strokeStyle = '#5a2e0c'; g.stroke();
  const gr = g.createLinearGradient(0, y - s * 0.2, 0, y + s * 0.6); gr.addColorStop(0, '#f0b060'); gr.addColorStop(1, '#b06a28'); g.fillStyle = gr; g.fill();
  g.save(); g.clip(); g.strokeStyle = 'rgba(90,46,12,0.45)'; g.lineWidth = s * 0.035;
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x - s, y + i * s * 0.18); g.lineTo(x + s, y + i * s * 0.18); g.stroke(); }
  for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(x + i * s * 0.16, y - s * 0.2); g.lineTo(x + i * s * 0.13, y + s * 0.7); g.stroke(); }
  g.restore();
  rr(g, x - s * 1.06, y - s * 0.24, s * 2.12, s * 0.2, s * 0.1); g.fillStyle = '#c87a34'; g.fill(); g.stroke();
  g.restore();
}

// The juice jar fills with a stripe for every fruit sliced. layers: colours
// bottom up; fill: 0..1. face adds a happy face (the payoff screen).
export function jar(x, y, w, h, layers, opt = {}) {
  const g = ctx, fill = opt.fill ?? 0.5;
  g.save(); g.lineJoin = 'round';
  g.fillStyle = 'rgba(30,60,20,0.3)'; g.beginPath(); g.ellipse(x, y + h * 0.02, w * 0.62, w * 0.12, 0, 0, TAU); g.fill();
  if (opt.glow) additive(() => glow(x, y - h * 0.5, w * 1.6, '#fff0a0', 0.7));
  const body = () => { g.beginPath(); g.moveTo(x - w * 0.36, y - h * 0.92); g.bezierCurveTo(x - w * 0.6, y - h * 0.8, x - w * 0.52, y - h * 0.15, x - w * 0.44, y - h * 0.04); g.quadraticCurveTo(x - w * 0.4, y, x - w * 0.3, y); g.lineTo(x + w * 0.3, y); g.quadraticCurveTo(x + w * 0.4, y, x + w * 0.44, y - h * 0.04); g.bezierCurveTo(x + w * 0.52, y - h * 0.15, x + w * 0.6, y - h * 0.8, x + w * 0.36, y - h * 0.92); g.closePath(); };
  // straw behind front glass
  g.save(); g.translate(x + w * 0.12, y - h * 0.5); g.rotate(0.28);
  rr(g, -w * 0.05, -h * 0.85, w * 0.1, h * 0.95, w * 0.04); g.lineWidth = w * 0.03; g.strokeStyle = '#7a1040'; g.stroke(); g.fillStyle = '#ffffff'; g.fill();
  g.save(); g.clip(); g.fillStyle = '#ff4f9a'; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(-w, -h * 0.85 + i * h * 0.09); g.lineTo(w, -h * 0.85 + i * h * 0.09 - w * 0.12); g.lineTo(w, -h * 0.85 + i * h * 0.09 - w * 0.06); g.lineTo(-w, -h * 0.85 + i * h * 0.09 + w * 0.06); g.fill(); } g.restore();
  g.restore();
  body(); g.fillStyle = 'rgba(210,240,255,0.35)'; g.fill();
  g.save(); body(); g.clip();
  const top = y - h * 0.9 * fill, n = layers.length;
  for (let i = 0; i < n; i++) {
    const y1 = lerp(y, top, i / n), y0 = lerp(y, top, (i + 1) / n), c = layers[i];
    const gr = g.createLinearGradient(x - w * 0.5, 0, x + w * 0.5, 0); gr.addColorStop(0, mix(c, '#000000', 0.12)); gr.addColorStop(0.4, mix(c, '#ffffff', 0.2)); gr.addColorStop(1, mix(c, '#000000', 0.2));
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - w, y1 + 2);
    for (let xx = -w; xx <= w; xx += w / 20) g.lineTo(x + xx, y0 + Math.sin(xx / w * 9 + i) * h * 0.012);
    g.lineTo(x + w, y1 + 2); g.closePath(); g.fill();
  }
  // surface, bubbles, floating fruit bits
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(x, top, w * 0.45, h * 0.025, 0, 0, TAU); g.fill();
  const R = rng(5); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = w * 0.012;
  for (let i = 0; i < 14; i++) { const by = lerp(y, top, R()), bx = x + (R() - 0.5) * w * 0.7; g.beginPath(); g.arc(bx, by, w * (0.012 + R() * 0.02), 0, TAU); g.stroke(); }
  g.restore();
  if (opt.face) {
    const fy = y - h * 0.45;
    for (const s of [-1, 1]) { g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x + s * w * 0.15, fy, w * 0.1, w * 0.12, 0, 0, TAU); g.fill(); g.lineWidth = w * 0.02; g.strokeStyle = '#3a1030'; g.stroke(); g.fillStyle = '#2a0a20'; g.beginPath(); g.arc(x + s * w * 0.15 + w * 0.02, fy + w * 0.02, w * 0.065, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + s * w * 0.15, fy - w * 0.015, w * 0.025, 0, TAU); g.fill(); }
    g.beginPath(); g.moveTo(x - w * 0.14, fy + w * 0.14); g.quadraticCurveTo(x, fy + w * 0.36, x + w * 0.14, fy + w * 0.14); g.closePath(); g.fillStyle = '#6a0a2a'; g.fill(); g.strokeStyle = '#3a1030'; g.stroke();
    g.fillStyle = 'rgba(255,80,120,0.5)'; g.beginPath(); g.ellipse(x - w * 0.3, fy + w * 0.12, w * 0.06, w * 0.035, 0, 0, TAU); g.ellipse(x + w * 0.3, fy + w * 0.12, w * 0.06, w * 0.035, 0, 0, TAU); g.fill();
  }
  // glass: outline, shine, rim
  body(); g.lineWidth = w * 0.035; g.strokeStyle = '#2c5a7a'; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = w * 0.05; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - w * 0.36, y - h * 0.75); g.quadraticCurveTo(x - w * 0.46, y - h * 0.4, x - w * 0.36, y - h * 0.12); g.stroke();
  g.lineWidth = w * 0.025; g.beginPath(); g.moveTo(x + w * 0.38, y - h * 0.6); g.quadraticCurveTo(x + w * 0.44, y - h * 0.45, x + w * 0.4, y - h * 0.3); g.stroke();
  g.beginPath(); g.ellipse(x, y - h * 0.92, w * 0.4, h * 0.05, 0, 0, TAU); g.lineWidth = w * 0.04; g.strokeStyle = '#2c5a7a'; g.stroke(); g.fillStyle = 'rgba(230,248,255,0.6)'; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = w * 0.015; g.beginPath(); g.ellipse(x, y - h * 0.925, w * 0.36, h * 0.035, 0, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
  // an orange wheel on the rim
  g.save(); g.translate(x - w * 0.3, y - h * 0.95); g.rotate(-0.4); g.scale(w * 0.17, w * 0.17);
  g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.lineWidth = 0.16; g.strokeStyle = '#8a3a05'; g.stroke(); flesh(g, 'orange', FRUIT.orange); g.restore();
  if (opt.cream) {
    const cy = y - h * 0.98;
    for (let i = 0; i < 4; i++) { const s = w * (0.36 - i * 0.08); blob(g, x, cy - i * s * 0.55, s, 30 + i, 6, 0.12, 0.55); g.fillStyle = '#c8b8c8'; g.fill(); blob(g, x, cy - i * s * 0.55 - s * 0.05, s * 0.94, 30 + i, 6, 0.12, 0.5); g.fillStyle = '#fffaf4'; g.fill(); }
    const ty = cy - w * 0.3; g.beginPath(); g.arc(x + w * 0.03, ty, w * 0.1, 0, TAU); g.fillStyle = '#d0102a'; g.fill(); g.lineWidth = w * 0.02; g.strokeStyle = '#6a0418'; g.stroke(); g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x, ty - w * 0.03, w * 0.03, 0, TAU); g.fill();
    g.strokeStyle = '#3a6a10'; g.lineWidth = w * 0.02; g.beginPath(); g.moveTo(x + w * 0.05, ty - w * 0.09); g.quadraticCurveTo(x + w * 0.1, ty - w * 0.25, x + w * 0.2, ty - w * 0.28); g.stroke();
  }
  g.restore();
}
// Rainbow swipe ribbon along a polyline (oldest point first), tapered.
export function trail(pts, width, seed = 1) {
  if (pts.length < 2) return;
  const g = ctx, n = pts.length, L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const t = i / (n - 1), w = width * Math.pow(t, 0.7) * (i === n - 1 ? 0.6 : 1);
    L.push([pts[i][0] - dy / l * w, pts[i][1] + dx / l * w]); Rr.push([pts[i][0] + dy / l * w, pts[i][1] - dx / l * w]);
  }
  const path = (k) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 0; i < n; i++) g.lineTo(lerp(pts[i][0], L[i][0], k), lerp(pts[i][1], L[i][1], k)); for (let i = n - 1; i >= 0; i--) g.lineTo(lerp(pts[i][0], Rr[i][0], k), lerp(pts[i][1], Rr[i][1], k)); g.closePath(); };
  g.save();
  additive(() => { path(2.6); g.fillStyle = 'rgba(255,220,140,0.12)'; g.fill(); path(1.7); g.fillStyle = 'rgba(255,230,170,0.18)'; g.fill(); });
  const lg = g.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
  ['#ff4f6d', '#ff9f1c', '#ffe23a', '#5fd84a', '#3fb8ff', '#b06aff'].forEach((c, i) => lg.addColorStop(i / 5, c));
  path(1); g.fillStyle = lg; g.fill();
  path(0.45); g.fillStyle = 'rgba(255,255,255,0.92)'; g.fill();
  g.restore();
  const R = rng(seed);
  for (let i = 2; i < n; i += 3) { const p = pts[i]; sparkle(p[0] + (R() - 0.5) * width * 3, p[1] + (R() - 0.5) * width * 3, width * (0.4 + R() * 0.6), 0.9 * i / n); }
  const tip = pts[n - 1]; additive(() => { glow(tip[0], tip[1], width * 3, '#ffffff', 0.8); }); sparkle(tip[0], tip[1], width * 1.4, 1);
}
export function curve(p0, p1, p2, n = 24) { const out = []; for (let i = 0; i <= n; i++) { const t = i / n; out.push([(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]]); } return out; }

export function confetti(n, seed, y0 = 0, y1 = H) {
  const g = ctx, R = rng(seed), cols = ['#ff4f6d', '#ffd23a', '#3fb8ff', '#5fd84a', '#ff8ac0', '#b06aff', '#ff9f1c'];
  for (let i = 0; i < n; i++) {
    const x = R() * W, y = lerp(y0, y1, R()), s = (8 + R() * 10) * u, c = cols[i % cols.length], k = R();
    g.save(); g.translate(x, y); g.rotate(R() * TAU); g.fillStyle = c;
    if (k < 0.5) { g.scale(1, 0.3 + R() * 0.7); g.fillRect(-s / 2, -s / 3, s, s * 0.66); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-s / 2, -s / 3, s, s * 0.2); }
    else if (k < 0.75) { g.beginPath(); g.arc(0, 0, s * 0.4, 0, TAU); g.fill(); }
    else { g.strokeStyle = c; g.lineWidth = s * 0.28; g.lineCap = 'round'; g.beginPath(); g.moveTo(-s, 0); g.bezierCurveTo(-s * 0.5, -s, 0, s, s * 0.5, 0); g.stroke(); }
    g.restore();
  }
}
export function rainbow(x, y, r, w) {
  const g = ctx; g.save(); g.lineCap = 'round';
  ['#ff4f6d', '#ff9f1c', '#ffe23a', '#5fd84a', '#3fb8ff', '#8a6aff'].forEach((c, i) => { g.beginPath(); g.arc(x, y, r - i * w, Math.PI, 0); g.lineWidth = w + 1; g.strokeStyle = rgba(c, 0.85); g.stroke(); });
  g.restore();
  for (const s of [-1, 1]) cloud(x + s * (r - w * 2.5), y + 10 * u, w * 3, 70 + s);
}
// A cartoon hand pointing up-left, finger tip at (x, y).
export function hand(x, y, s, rot = -0.5) {
  const g = ctx; g.save(); g.translate(x, y); g.rotate(rot); g.lineJoin = 'round'; g.lineCap = 'round';
  const path = () => {
    g.beginPath(); g.moveTo(-s * 0.16, s * 0.1); g.lineTo(-s * 0.16, s * 0.75);
    g.bezierCurveTo(-s * 0.5, s * 0.62, -s * 0.62, s * 0.82, -s * 0.42, s * 1.0);
    g.bezierCurveTo(-s * 0.35, s * 1.35, -s * 0.2, s * 1.6, s * 0.2, s * 1.62);
    g.bezierCurveTo(s * 0.6, s * 1.62, s * 0.72, s * 1.3, s * 0.7, s * 0.95);
    g.bezierCurveTo(s * 0.72, s * 0.75, s * 0.55, s * 0.62, s * 0.42, s * 0.7);
    g.bezierCurveTo(s * 0.4, s * 0.55, s * 0.22, s * 0.5, s * 0.14, s * 0.6);
    g.lineTo(s * 0.16, s * 0.1); g.arc(0, s * 0.1, s * 0.16, 0, Math.PI, true); g.closePath();
  };
  path(); g.lineWidth = s * 0.1; g.strokeStyle = '#8a4a2a'; g.stroke();
  const gr = g.createLinearGradient(-s * 0.5, 0, s * 0.7, 0); gr.addColorStop(0, '#ffe0c8'); gr.addColorStop(1, '#f0a880'); g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(138,74,42,0.6)'; g.lineWidth = s * 0.05; g.beginPath(); g.moveTo(s * 0.14, s * 0.62); g.lineTo(s * 0.14, s * 0.85); g.moveTo(s * 0.42, s * 0.72); g.lineTo(s * 0.42, s * 0.9); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(-s * 0.04, s * 0.05, s * 0.05, s * 0.09, 0, 0, TAU); g.fill();
  g.restore();
}
export function ripple(x, y, r) { const g = ctx; g.save(); for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x, y, r * (0.5 + i * 0.35), 0, TAU); g.lineWidth = r * 0.08 * (1 - i * 0.25); g.strokeStyle = `rgba(255,255,255,${0.9 - i * 0.28})`; g.stroke(); } g.restore(); }

// Everything that never moves, painted once per resize into a cached layer.
export function paintBackdrop() { sky(); meadow(); blanket(); const b = basketPos(); basket(b.x, b.y, b.s); }

export function logo(cx, cy, size, t = 0) {
  const g = ctx, text = 'Juicy Splash', cols = ['#ff3d63', '#ff9f1c', '#ffd23a', '#4cc23a', '#3fb8ff', null, '#ff3d63', '#ff9f1c', '#ffd23a', '#4cc23a', '#3fb8ff', '#b06aff'];
  g.save(); g.font = `900 ${size}px 'Arial Rounded MT Bold', 'Nunito', 'Trebuchet MS', 'Inter', system-ui, sans-serif`; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.textAlign = 'center';
  const ws = [...text].map(c => g.measureText(c).width * 0.96), total = ws.reduce((a, b) => a + b, 0);
  if (total > W * 0.92) { g.restore(); return logo(cx, cy, size * W * 0.92 / total, t); }
  let x = cx - total / 2;
  const glyphs = [...text].map((c, i) => { const gl = { c, x: x + ws[i] / 2, y: cy + Math.sin(i * 1.3 + t * 3) * size * 0.06, rot: Math.sin(i * 2.1 + t * 2) * 0.08, col: cols[i] }; x += ws[i]; return gl; });
  const each = fn => glyphs.forEach(gl => { if (gl.c === ' ') return; g.save(); g.translate(gl.x, gl.y); g.rotate(gl.rot); fn(gl); g.restore(); });
  each(gl => { g.lineWidth = size * 0.3; g.strokeStyle = '#5a1438'; g.strokeText(gl.c, size * 0.02, size * 0.07); g.strokeText(gl.c, 0, 0); });
  each(gl => { g.lineWidth = size * 0.16; g.strokeStyle = '#ffffff'; g.strokeText(gl.c, 0, 0); });
  each(gl => { const gr = g.createLinearGradient(0, -size * 0.4, 0, size * 0.4); gr.addColorStop(0, mix(gl.col, '#ffffff', 0.45)); gr.addColorStop(0.5, gl.col); gr.addColorStop(1, mix(gl.col, '#000000', 0.25)); g.fillStyle = gr; g.fillText(gl.c, 0, 0); });
  each(gl => { g.save(); g.beginPath(); g.rect(-size, -size, size * 2, size * 0.78); g.clip(); g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillText(gl.c, 0, 0); g.restore(); g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(-size * 0.12, -size * 0.25, size * 0.06, size * 0.03, -0.5, 0, TAU); g.fill(); });
  g.restore();
}
export function playButton(x, y, r, pulse = 0) {
  const g = ctx; r *= 1 + pulse * 0.06; additive(() => glow(x, y, r * 2.2, '#fff6b0', 0.6));
  g.save(); g.beginPath(); g.arc(x, y + r * 0.1, r, 0, TAU); g.fillStyle = 'rgba(20,70,10,0.3)'; g.fill(); g.restore();
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = '#1e6a1a'; g.fill();
  g.beginPath(); g.arc(x, y - r * 0.04, r * 0.9, 0, TAU); const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r); gr.addColorStop(0, '#c8ff8a'); gr.addColorStop(0.5, '#5fd84a'); gr.addColorStop(1, '#2fa03a'); g.fillStyle = gr; g.fill();
  g.beginPath(); g.moveTo(x - r * 0.28, y - r * 0.42); g.lineTo(x + r * 0.46, y - r * 0.02); g.lineTo(x - r * 0.28, y + r * 0.38); g.closePath(); g.lineJoin = 'round'; g.lineWidth = r * 0.14; g.strokeStyle = '#ffffff'; g.stroke(); g.fillStyle = '#ffffff'; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(x - r * 0.4, y - r * 0.5, r * 0.22, r * 0.1, -0.7, 0, TAU); g.fill();
  leaf(g, x + r * 0.1, y - r * 0.88, r * 0.55, -0.6);
}
