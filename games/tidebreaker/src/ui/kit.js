// Tidebreaker interface kit: the concept's glass panels, bars, coin, pill
// buttons and ability icons, shared by hud.js, cards.js and screens.js.
import { W, H, SERIF } from '../config.js';
import { rr, text, glow, layer } from '../gfx.js';
import { rgba } from '../util.js';

export const GOLD = '#ffd36a', CREAM = '#ffe6a8', INK = '#2a1a05';
export const sans = (o = {}) => ({ font: 'sans', weight: '800', ...o });

// Dark navy glass with a gold double border.
export function panel(g, x, y, w, h, a = 0.62, r = 12) {
  rr(g, x, y, w, h, r); g.fillStyle = `rgba(12,16,40,${a})`; g.fill();
  g.strokeStyle = 'rgba(255,214,120,0.75)'; g.lineWidth = 2; g.stroke();
  rr(g, x + 4, y + 4, w - 8, h - 8, Math.max(2, r - 3)); g.strokeStyle = 'rgba(255,214,120,0.18)'; g.lineWidth = 1; g.stroke();
}

export function bar(g, x, y, w, h, v, c0, c1, label, ghost) {
  v = Math.max(0, Math.min(1, v));
  rr(g, x, y, w, h, h / 2); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill();
  if (ghost != null && ghost > v) { // recent damage trails behind in pale
    rr(g, x + 2, y + 2, Math.max(h - 4, (w - 4) * Math.min(1, ghost)), h - 4, (h - 4) / 2); g.fillStyle = 'rgba(255,240,220,0.35)'; g.fill();
  }
  if (v > 0) {
    const gr = g.createLinearGradient(x, y, x + w, y); gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    const bw = Math.max(h - 4, (w - 4) * v);
    rr(g, x + 2, y + 2, bw, h - 4, (h - 4) / 2); g.fillStyle = gr; g.fill();
    rr(g, x + 2, y + 2, bw, (h - 4) / 2, (h - 4) / 4); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fill();
  }
  if (label) text(g, label, x + w / 2, y + h / 2 + 1, h * 0.62, '#fff', sans({ align: 'center', base: 'middle', stroke: 'rgba(0,0,0,0.6)', sw: 3 }));
}

export function coin(g, x, y, r) {
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  gr.addColorStop(0, '#fff3a8'); gr.addColorStop(0.6, '#ffc21f'); gr.addColorStop(1, '#b87400');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.strokeStyle = '#8a5500'; g.lineWidth = 1.5; g.stroke();
  text(g, '$', x, y + 1, r * 1.2, '#8a5500', sans({ align: 'center', base: 'middle', weight: '900' }));
}

// A renown star (the meta currency).
export function star(g, x, y, r, col = '#ffd36a') {
  g.save(); g.translate(x, y);
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
  g.closePath();
  const gr = g.createLinearGradient(0, -r, 0, r); gr.addColorStop(0, '#fffbe0'); gr.addColorStop(1, col);
  g.fillStyle = gr; g.fill(); g.strokeStyle = '#8a5500'; g.lineWidth = 1.2; g.stroke(); g.restore();
}

// Pill button. kind: 'gold' (the main action) | 'glass'. state: { hover, disabled }
export function pill(g, x, y, w, h, label, kind = 'glass', st = {}, size = 20) {
  g.save();
  const lift = st.hover && !st.disabled ? -2 : 0;
  g.translate(0, lift);
  rr(g, x, y, w, h, h / 2);
  if (kind === 'gold') {
    const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#ffd34a'); gr.addColorStop(1, '#ff7a3a');
    g.fillStyle = gr; g.shadowColor = 'rgba(255,140,60,0.8)'; g.shadowBlur = st.hover ? 34 : 24; g.fill(); g.shadowBlur = 0;
    if (st.hover) { g.strokeStyle = 'rgba(255,255,230,0.9)'; g.lineWidth = 2; g.stroke(); }
  } else {
    g.fillStyle = st.hover && !st.disabled ? 'rgba(40,26,90,0.78)' : 'rgba(16,10,50,0.6)'; g.fill();
    g.strokeStyle = st.hover && !st.disabled ? 'rgba(255,214,120,0.95)' : 'rgba(255,214,120,0.5)'; g.lineWidth = st.hover ? 2 : 1.5; g.stroke();
  }
  const col = kind === 'gold' ? '#2a0a20' : st.disabled ? 'rgba(255,232,200,0.4)' : '#ffe8c8';
  text(g, label, x + w / 2, y + h / 2 + 1, size, col, sans({ align: 'center', base: 'middle', weight: '900', spacing: 3 }));
  g.restore();
}

// Big serif title with a glow and a dark outline (BLESSINGS OF THE TIDE style).
export function title(g, s, x, y, size, col = '#ffe08a', glowCol = 'rgba(255,140,60,0.9)', spacing = 4) {
  text(g, s, x, y, size, col, { align: 'center', spacing, stroke: '#2a0a20', sw: Math.max(4, size * 0.17), shadow: glowCol, blur: 22, oy: 0 });
}
// Gold rule with a bead in the middle (title screen).
export function rule(g, cx, y, half, gap = 40) {
  g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath();
  g.moveTo(cx - half, y); g.lineTo(cx - gap, y); g.moveTo(cx + gap, y); g.lineTo(cx + half, y); g.stroke();
  g.beginPath(); g.arc(cx, y, 7, 0, 7); g.fillStyle = GOLD; g.fill();
}

export function dim(g, a = 0.5, col = '5,2,26') {
  g.fillStyle = `rgba(${col},${a})`; g.fillRect(0, 0, W, H);
}
let vig = null;
export function vignette(g, a = 0.6) {
  if (!vig) {
    vig = layer(W / 4, H / 4); const v = vig.getContext('2d');
    const gr = v.createRadialGradient(W / 8, H / 8, H / 16, W / 8, H / 8, W / 6.5);
    gr.addColorStop(0, 'rgba(5,2,26,0)'); gr.addColorStop(1, 'rgba(5,2,26,1)');
    v.fillStyle = gr; v.fillRect(0, 0, W / 4, H / 4);
  }
  g.save(); g.globalAlpha = a; g.drawImage(vig, 0, 0, W, H); g.restore();
}

// Ability icons (ports of the concept ICON set), centred at x, y, size s.
export const ICON = {
  cannon(g, x, y, s) { g.fillStyle = '#d8dce8'; g.save(); g.translate(x, y); g.rotate(-0.5); rr(g, -s, -s * 0.3, s * 1.8, s * 0.6, s * 0.3); g.fill(); g.restore(); g.fillStyle = '#8a5a2a'; g.beginPath(); g.arc(x - s * 0.3, y + s * 0.4, s * 0.4, 0, 7); g.fill(); },
  chain(g, x, y, s) { g.fillStyle = '#d8dce8'; g.beginPath(); g.arc(x - s * 0.6, y, s * 0.4, 0, 7); g.arc(x + s * 0.6, y, s * 0.4, 0, 7); g.fill(); g.strokeStyle = '#d8dce8'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - s * 0.6, y); g.quadraticCurveTo(x, y - s * 0.6, x + s * 0.6, y); g.stroke(); },
  fire(g, x, y, s) { g.fillStyle = '#ff7a1f'; g.beginPath(); g.moveTo(x, y - s * 1.1); g.quadraticCurveTo(x + s, y, x + s * 0.5, y + s * 0.8); g.lineTo(x - s * 0.5, y + s * 0.8); g.quadraticCurveTo(x - s, y, x, y - s * 1.1); g.fill(); g.fillStyle = '#ffe07a'; g.beginPath(); g.arc(x, y + s * 0.35, s * 0.4, 0, 7); g.fill(); },
  bolt(g, x, y, s) { g.fillStyle = '#7fe0ff'; g.beginPath(); g.moveTo(x + s * 0.2, y - s); g.lineTo(x - s * 0.6, y + s * 0.15); g.lineTo(x - s * 0.05, y + s * 0.15); g.lineTo(x - s * 0.25, y + s); g.lineTo(x + s * 0.6, y - s * 0.2); g.lineTo(x + s * 0.05, y - s * 0.2); g.closePath(); g.fill(); },
  kraken(g, x, y, s) { g.strokeStyle = '#ff6ad5'; g.lineWidth = s * 0.35; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - s * 0.5, y + s); g.quadraticCurveTo(x - s * 0.8, y - s * 0.4, x + s * 0.2, y - s * 0.8); g.quadraticCurveTo(x + s * 0.9, y - s * 0.8, x + s * 0.5, y - s * 0.1); g.stroke(); g.lineCap = 'butt'; },
  lock(g, x, y, s) {
    g.strokeStyle = '#e8e0d0'; g.lineWidth = s * 0.22; g.beginPath(); g.arc(x, y - s * 0.2, s * 0.38, Math.PI, 0); g.stroke();
    rr(g, x - s * 0.55, y - s * 0.2, s * 1.1, s * 0.85, s * 0.15); g.fillStyle = '#e8e0d0'; g.fill();
    g.fillStyle = '#2a2040'; g.beginPath(); g.arc(x, y + s * 0.15, s * 0.12, 0, 7); g.fill();
  },
  pause(g, x, y, s) { g.fillStyle = '#ffe8c8'; rr(g, x - s * 0.45, y - s * 0.5, s * 0.3, s, 2); g.fill(); rr(g, x + s * 0.15, y - s * 0.5, s * 0.3, s, 2); g.fill(); },
  sound(g, x, y, s, muted) {
    g.fillStyle = '#ffe8c8'; g.beginPath(); g.moveTo(x - s * 0.6, y - s * 0.22); g.lineTo(x - s * 0.3, y - s * 0.22); g.lineTo(x + s * 0.05, y - s * 0.55);
    g.lineTo(x + s * 0.05, y + s * 0.55); g.lineTo(x - s * 0.3, y + s * 0.22); g.lineTo(x - s * 0.6, y + s * 0.22); g.closePath(); g.fill();
    g.strokeStyle = '#ffe8c8'; g.lineWidth = 2; g.lineCap = 'round';
    if (muted) { g.beginPath(); g.moveTo(x + s * 0.25, y - s * 0.25); g.lineTo(x + s * 0.65, y + s * 0.25); g.moveTo(x + s * 0.65, y - s * 0.25); g.lineTo(x + s * 0.25, y + s * 0.25); g.stroke(); }
    else { g.beginPath(); g.arc(x + s * 0.05, y, s * 0.35, -0.8, 0.8); g.stroke(); g.beginPath(); g.arc(x + s * 0.05, y, s * 0.6, -0.8, 0.8); g.stroke(); }
    g.lineCap = 'butt';
  },
};

// Small serif caps heading.
export function heading(g, s, x, y, size, col = '#ffd9f0', glowCol = '#ff3fa8', opt = {}) {
  text(g, s, x, y, size, col, { align: 'center', spacing: 4, shadow: glowCol, blur: 12, oy: 0, font: SERIF, ...opt });
}

export function fmtTime(t) {
  t = Math.max(0, Math.round(t || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
export const fmtNum = (n) => Math.round(n || 0).toLocaleString('en-US');

export { rgba, glow, text, rr };
