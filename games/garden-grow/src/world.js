// The still parts of the garden, painted once per screen size into layers:
// the sky, the hills, the trees, the picket fence, the pond and the soil
// patches (backdrop), and the rainbow that fades in after rain.
import { TAU, ctx, mix, rng, gloss, circ, ell, rr, glow } from './draw.js';
import * as Art from './art.js';

function sky(L) {
  const g = ctx, gr = g.createLinearGradient(0, 0, 0, L.H);
  gr.addColorStop(0, '#4fbdff'); gr.addColorStop(0.45, '#bfeaff'); gr.addColorStop(0.62, '#e6f8ff'); gr.addColorStop(1, '#fff6d8');
  g.fillStyle = gr; g.fillRect(0, 0, L.W, L.H);
  glow(L.sun.x, L.sun.y, L.sun.r * 4, '#fff6b0', 0.65);
}
function hillPath(L, y0, amp, freq, ph) {
  const g = ctx; g.beginPath(); g.moveTo(0, L.H);
  for (let i = 0; i <= 96; i++) { const x = i / 96 * L.W; g.lineTo(x, y0 - Math.sin(x / L.W * freq * TAU + ph) * amp - Math.sin(x / L.W * freq * 2.3 * TAU + ph * 2) * amp * 0.3); }
  g.lineTo(L.W, L.H); g.closePath();
}
function hill(L, y0, amp, freq, ph, c1, c2, seed, tufts = true) {
  const g = ctx, ps = L.ps; g.save();
  hillPath(L, y0, amp, freq, ph);
  const gr = g.createLinearGradient(0, y0 - amp, 0, y0 + L.H * 0.3); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.shadowColor = 'rgba(20,80,30,0.3)'; g.shadowBlur = 30 * ps; g.shadowOffsetY = -6 * ps;
  g.fillStyle = gr; g.fill(); g.shadowColor = 'transparent';
  g.clip();
  g.beginPath();
  for (let i = 0; i <= 96; i++) { const x = i / 96 * L.W, y = y0 - Math.sin(x / L.W * freq * TAU + ph) * amp - Math.sin(x / L.W * freq * 2.3 * TAU + ph * 2) * amp * 0.3; i ? g.lineTo(x, y + 9 * ps) : g.moveTo(x, y + 9 * ps); }
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 9 * ps; g.lineCap = 'round'; g.stroke();
  if (tufts) {
    const R = rng(seed);
    for (let i = 0; i < 60; i++) { const x = R() * L.W, y = y0 + R() * L.H * 0.5; g.fillStyle = 'rgba(255,255,255,0.13)'; g.beginPath(); g.ellipse(x, y, 15 * ps, 6 * ps, 0, 0, TAU); g.fill(); }
    // little blades of grass
    g.strokeStyle = 'rgba(30,120,40,0.35)'; g.lineWidth = 3 * ps; g.lineCap = 'round';
    for (let i = 0; i < 70; i++) { const x = R() * L.W, y = y0 + 20 * ps + R() * L.H * 0.5; g.beginPath(); g.moveTo(x - 5 * ps, y); g.quadraticCurveTo(x - 6 * ps, y - 8 * ps, x - 9 * ps, y - 13 * ps); g.moveTo(x, y); g.lineTo(x + 1 * ps, y - 15 * ps); g.moveTo(x + 5 * ps, y); g.quadraticCurveTo(x + 7 * ps, y - 8 * ps, x + 10 * ps, y - 12 * ps); g.stroke(); }
  }
  g.restore();
}
export function tree(x, y, s) {
  const g = ctx;
  g.save();
  const tg = g.createLinearGradient(x - 16 * s, 0, x + 16 * s, 0); tg.addColorStop(0, '#a8602e'); tg.addColorStop(1, '#6a3414');
  g.fillStyle = tg; rr(g, x - 15 * s, y - 130 * s, 30 * s, 136 * s, 12 * s); g.fill(); g.lineWidth = 3 * s; g.strokeStyle = '#4a2408'; g.stroke();
  g.restore();
  for (const [dx, dy, r] of [[-64, -142, 62], [64, -142, 62], [0, -196, 86]]) gloss(circ(x + dx * s, y + dy * s, r * s), x + dx * s, y + dy * s, r * s, '#3fbf4a', { line: '#1a6a2a' });
}
function fence(L) {
  const g = ctx, s = 0.95 * L.ps, y = L.horizon - 2 * s;
  g.save();
  for (const yy of [y + 22 * s, y + 60 * s]) { const gr = g.createLinearGradient(0, yy, 0, yy + 14 * s); gr.addColorStop(0, '#fffaf2'); gr.addColorStop(1, '#ead2ba'); g.fillStyle = gr; rr(g, -10, yy, L.W + 20, 14 * s, 6 * s); g.fill(); g.lineWidth = 2.5 * s; g.strokeStyle = '#c99a78'; g.stroke(); }
  for (let x = -10; x < L.W + 40; x += 66 * s) {
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 17 * s, y - 18 * s); g.lineTo(x + 34 * s, y); g.lineTo(x + 34 * s, y + 92 * s); g.lineTo(x, y + 92 * s); g.closePath();
    const gr = g.createLinearGradient(x, 0, x + 34 * s, 0); gr.addColorStop(0, '#fffdf8'); gr.addColorStop(1, '#efd9c2');
    g.fillStyle = gr; g.fill(); g.lineWidth = 2.5 * s; g.strokeStyle = '#c99a78'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x + 5 * s, y + 4 * s, 4 * s, 70 * s);
  }
  g.restore();
}
function pond(L) {
  const g = ctx, p = L.pond, ps = L.ps;
  g.save();
  g.shadowColor = 'rgba(20,60,30,0.35)'; g.shadowBlur = 16 * ps; g.shadowOffsetY = 4 * ps;
  g.beginPath(); g.ellipse(p.x, p.y, p.rx * 1.08, p.ry * 1.2, 0, 0, TAU); g.fillStyle = '#8a8a96'; g.fill(); g.shadowColor = 'transparent';
  const R = rng(3);
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, x = p.x + Math.cos(a) * p.rx * 1.08, y = p.y + Math.sin(a) * p.ry * 1.18, r = (9 + R() * 5) * ps; gloss(circ(x, y, r), x, y, r, i % 3 ? '#b8b4c4' : '#d6d0de', { shadow: false, lw: 1.5 }); }
  const gr = g.createRadialGradient(p.x - p.rx * 0.3, p.y - p.ry * 0.4, 2, p.x, p.y, p.rx);
  gr.addColorStop(0, '#9fe8ff'); gr.addColorStop(0.6, '#3fb6f0'); gr.addColorStop(1, '#1a78c0');
  g.beginPath(); g.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, TAU); g.fillStyle = gr; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(p.x - p.rx * 0.35, p.y - p.ry * 0.45, p.rx * 0.32, p.ry * 0.14, -0.1, 0, TAU); g.fill();
  for (const l of L.lily) {
    const rx = Math.min(p.rx * 0.32, 34 * ps), ry = rx * 0.45;
    g.beginPath(); g.ellipse(l.x, l.y, rx, ry, 0, 0.25, TAU - 0.25); g.lineTo(l.x, l.y); g.closePath();
    const lg = g.createLinearGradient(0, l.y - ry, 0, l.y + ry); lg.addColorStop(0, '#7ae86a'); lg.addColorStop(1, '#2a9a3a');
    g.fillStyle = lg; g.fill(); g.lineWidth = 2 * ps; g.strokeStyle = '#1a6a2a'; g.stroke();
  }
  // a pink water lily
  const fx = p.x + p.rx * 0.05, fy = p.y + p.ry * 0.55;
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; gloss(ell(fx + Math.cos(a) * 7 * ps, fy + Math.sin(a) * 4 * ps, 8 * ps, 4 * ps, a), fx, fy, 8 * ps, '#ff9fd0', { shadow: false, lw: 1 }); }
  g.restore();
}
function cattails(L) {
  const g = ctx, p = L.pond, ps = L.ps;
  for (let i = 0; i < 3; i++) {
    const x = p.x + p.rx * (0.7 + i * 0.12), y = p.y - p.ry * 0.2 + i * 3 * ps, h = (60 + i * 12) * ps;
    g.strokeStyle = '#3a8a2a'; g.lineWidth = 4 * ps; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - 4 * ps, y - h * 0.5, x - 2 * ps, y - h); g.stroke();
    gloss(g2 => rr(g2, x - 7 * ps, y - h - 6 * ps, 12 * ps, 30 * ps, 6 * ps), x, y - h + 8 * ps, 14 * ps, '#8a4a22', { shadow: false, lw: 1.5 });
  }
}

export function paintBackdrop(L) {
  sky(L);
  hill(L, L.horizon - 70 * L.ps, 34 * L.ps, 0.8, 2.6, '#b4ee8a', '#6cc85a', 11, false);
  for (const t of L.trees) tree(t.x, t.y, t.s);
  hill(L, L.horizon + 4 * L.ps, 22 * L.ps, 1.2, 0.8, '#8ee86a', '#4cbf4a', 3, false);
  fence(L);
  hill(L, L.horizon + 70 * L.ps, 16 * L.ps, 0.7, 2.2, '#7ce056', '#2f9e36', 5);
  pond(L);
  cattails(L);
  // the soil patches
  for (const p of L.patches) Art.blit(ctx, Art.soil(98, 34), p.x, p.y);
}

export function paintRainbow(L) {
  const g = ctx, x = L.W * 0.5, y = L.portrait ? L.horizon + 30 * L.ps : L.horizon + 40 * L.ps, r = L.portrait ? L.W * 0.48 : Math.min(L.W * 0.4, L.H * 0.66), w = r * 0.075;
  const cols = ['#ff3d4f', '#ff8a1f', '#ffd21f', '#4bd458', '#3fa9ff', '#a55bff'];
  g.save(); g.lineCap = 'butt';
  cols.forEach((c, i) => { g.strokeStyle = c; g.lineWidth = w + 1; g.beginPath(); g.arc(x, y, r - i * w, Math.PI, 0); g.stroke(); });
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = w * 0.4; g.beginPath(); g.arc(x, y, r + w * 0.1, Math.PI, 0); g.stroke();
  g.restore();
  return { x, y, r, w };
}
