// Bubble Sub: reef pieces for the baked backdrops.
import { ctx, u, W, H, TAU, rng, lerp, clamp, rgba, mix, rr, glow, blob, starPath, heartPath, sticker, sparkle } from './draw.js';
import { gloss, bubble, shadow, caustics } from './paint.js';
import { fish } from './art.js';

export function farReef(seed, baseY, col, a = 1, amp = 90, blur = 4) {
  const R = rng(seed), g = ctx; g.save(); g.globalAlpha = a; g.filter = `blur(${blur * u}px)`; g.fillStyle = col;
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W + 40; x += 40 * u) g.lineTo(x, baseY - (Math.sin(x / (170 * u) + seed) * 0.5 + 0.5) * amp * u - R() * amp * 0.4 * u);
  g.lineTo(W, H); g.fill();
  // coral fans and tall kelp shapes on the far reef
  for (let i = 0; i < 14; i++) {
    const x = R() * W, h = (60 + R() * 150) * u, y = baseY - R() * amp * 0.6 * u;
    if (R() < 0.5) { g.beginPath(); g.ellipse(x, y - h * 0.4, h * 0.35, h * 0.45, 0, 0, TAU); g.fill(); }
    else { g.lineWidth = 10 * u; g.strokeStyle = col; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 30 * u, y - h * 0.4, x - 30 * u, y - h * 0.7, x + 10 * u, y - h * 1.3); g.stroke(); }
  }
  g.restore();
}

export function seabed(y, seed = 1, sand = '#ffd99a', sandDark = '#d79a62') {
  const g = ctx, R = rng(seed);
  g.save();
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W + 20; x += 20) g.lineTo(x, y + Math.sin(x / (210 * u) + seed) * 22 * u + Math.sin(x / (90 * u)) * 8 * u);
  g.lineTo(W, H); g.closePath();
  const gr = g.createLinearGradient(0, y - 30 * u, 0, H);
  gr.addColorStop(0, mix(sand, '#9ff4ff', 0.35)); gr.addColorStop(0.25, sand); gr.addColorStop(1, sandDark);
  g.fillStyle = gr; g.fill(); g.clip();
  // ripples
  g.strokeStyle = 'rgba(160,100,50,0.18)'; g.lineWidth = 3 * u;
  for (let i = 0; i < 26; i++) { const yy = y + 20 * u + R() * (H - y), xx = R() * W, w = (60 + R() * 140) * u; g.beginPath(); g.moveTo(xx - w, yy); g.quadraticCurveTo(xx, yy - 10 * u, xx + w, yy); g.stroke(); }
  caustics(seed + 9, 0, y - 20 * u, W, H - y + 20 * u, 0.13, 70);
  // haze at the far edge of the sand
  const hz = g.createLinearGradient(0, y - 30 * u, 0, y + 70 * u); hz.addColorStop(0, 'rgba(120,230,255,0.55)'); hz.addColorStop(1, 'rgba(120,230,255,0)');
  g.fillStyle = hz; g.fillRect(0, y - 40 * u, W, 120 * u);
  g.restore();
}

export function coralBranch(x, y, h, col, seed, spread = 0.5) {
  const g = ctx, R = rng(seed);
  const segs = [];
  (function br(x0, y0, ang, len, w, d) {
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
    segs.push([x0, y0, x1, y1, w]);
    if (d < 4) { br(x1, y1, ang - spread * (0.5 + R() * 0.6), len * (0.62 + R() * 0.15), w * 0.72, d + 1); br(x1, y1, ang + spread * (0.5 + R() * 0.6), len * (0.62 + R() * 0.15), w * 0.72, d + 1); }
  })(x, y, -Math.PI / 2 + (R() - 0.5) * 0.3, h * 0.38, h * 0.17, 0);
  g.save(); g.lineCap = 'round';
  const line = mix(col, '#300a40', 0.6);
  for (const pass of [0, 1, 2]) for (const [x0, y0, x1, y1, w] of segs) {
    g.strokeStyle = pass === 0 ? line : pass === 1 ? col : rgba(mix(col, '#ffffff', 0.6), 0.8);
    g.lineWidth = pass === 0 ? w + 5 * u : pass === 1 ? w : w * 0.28;
    g.beginPath();
    if (pass === 2) { g.moveTo(x0 - w * 0.22, y0); g.lineTo(x1 - w * 0.22, y1); } else { g.moveTo(x0, y0); g.lineTo(x1, y1); }
    g.stroke();
  }
  // glowing tips
  for (const [, , x1, y1, w] of segs.slice(-16)) { g.fillStyle = mix(col, '#ffffff', 0.5); g.beginPath(); g.arc(x1, y1, w * 0.55, 0, TAU); g.fill(); }
  g.restore();
}

export function coralDome(x, y, r, col, seed) {
  const g = ctx; g.save();
  blob(g, x, y - r * 0.55, r, seed, 6, 0.06, 0.62);
  gloss(g, x, y - r * 0.6, r, col);
  // groove pattern
  g.clip(); g.strokeStyle = rgba(mix(col, '#300a40', 0.5), 0.35); g.lineWidth = r * 0.06; const R = rng(seed);
  for (let i = 0; i < 9; i++) { const yy = y - r * 0.9 + i * r * 0.13; g.beginPath(); for (let k = 0; k <= 20; k++) { const xx = x - r + k * r * 0.1; g.lineTo(xx, yy + Math.sin(k * 1.3 + i + R()) * r * 0.04); } g.stroke(); }
  g.restore();
}

export function anemone(x, y, r, col, tip, seed) {
  const g = ctx, R = rng(seed); g.save(); g.lineCap = 'round';
  for (let i = 0; i < 17; i++) {
    const a = -Math.PI / 2 + (i / 16 - 0.5) * 2.4, len = r * (0.9 + R() * 0.4), bend = (R() - 0.5) * r * 0.5;
    const x1 = x + Math.cos(a) * len + bend, y1 = y + Math.sin(a) * len;
    for (const [c, w] of [[mix(col, '#300a40', 0.55), r * 0.2], [col, r * 0.14]]) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + bend * 1.6, y - len * 0.5, x1, y1); g.stroke(); }
    g.fillStyle = tip; g.beginPath(); g.arc(x1, y1, r * 0.1, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x1 - r * 0.03, y1 - r * 0.03, r * 0.035, 0, TAU); g.fill();
  }
  g.beginPath(); g.ellipse(x, y + r * 0.08, r * 0.38, r * 0.2, 0, 0, TAU); gloss(g, x, y + r * 0.05, r * 0.38, mix(col, '#300a40', 0.25), { spec: false });
  g.restore();
}

export function kelp(x, y, h, seed, col = '#2fc26a') {
  const g = ctx, R = rng(seed); g.save(); g.lineCap = 'round';
  const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([x + Math.sin(t * 5 + seed) * 26 * u * t, y - h * t]); }
  const line = mix(col, '#032a20', 0.6);
  for (const [c, w] of [[line, 22 * u], [col, 15 * u], [rgba(mix(col, '#ffffff', 0.5), 0.7), 4 * u]]) {
    g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px - (w < 5 * u ? 4 * u : 0), py) : g.moveTo(px, py)); g.stroke();
  }
  for (let i = 2; i < 12; i += 1) {
    const [px, py] = pts[i], s = i % 2 ? 1 : -1, l = (34 + R() * 26) * u * (1 - i / 16);
    g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + s * l, py - l * 0.9, px + s * l * 1.4, py - l * 0.2); g.quadraticCurveTo(px + s * l * 0.6, py + l * 0.2, px, py);
    gloss(g, px + s * l * 0.6, py - l * 0.3, l * 0.6, col, { lw: 0.12 });
  }
  g.restore();
}

export function rock(x, y, r, seed, col = '#6a7fb8') {
  const g = ctx; g.save(); blob(g, x, y - r * 0.4, r, seed, 3, 0.12, 0.6); gloss(g, x, y - r * 0.5, r, col, { spec: false }); g.restore();
}

export function seaweedTuft(x, y, s, seed, col = '#46d48a') { for (let i = 0; i < 3; i++) kelp(x + (i - 1) * 16 * s, y, (70 + i * 25) * s, seed + i, col); }

export function shell(x, y, r, col = '#ffb3c8') {
  const g = ctx; g.save(); g.beginPath(); g.moveTo(x - r, y); g.quadraticCurveTo(x - r, y - r * 1.3, x, y - r * 1.2); g.quadraticCurveTo(x + r, y - r * 1.3, x + r, y); g.closePath();
  gloss(g, x, y - r * 0.6, r, col); g.strokeStyle = rgba(mix(col, '#300a40', 0.5), 0.5); g.lineWidth = r * 0.08;
  for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x, y + r * 0.05); g.lineTo(x + i * r * 0.42, y - r * 1.05 + Math.abs(i) * r * 0.25); g.stroke(); }
  g.restore();
}

export function farWhale(x, y, r, a = 0.3) { ctx.save(); ctx.globalAlpha = a; ctx.filter = `blur(${3 * u}px)`; ctx.fillStyle = '#0c4c8c';
  const g = ctx; g.beginPath(); g.moveTo(x - r * 1.0, y); g.bezierCurveTo(x - r, y - r * 0.7, x + r * 0.5, y - r * 0.8, x + r * 1.05, y - r * 0.2); g.bezierCurveTo(x + r * 1.2, y + r * 0.3, x + r * 0.5, y + r * 0.6, x, y + r * 0.5); g.quadraticCurveTo(x - r * 0.6, y + r * 0.4, x - r * 1.0, y); g.fill();
  g.beginPath(); g.moveTo(x - r * 0.95, y); g.quadraticCurveTo(x - r * 1.5, y - r * 0.1, x - r * 1.8, y - r * 0.5); g.quadraticCurveTo(x - r * 1.6, y, x - r * 1.85, y + r * 0.2); g.quadraticCurveTo(x - r * 1.4, y + r * 0.1, x - r * 0.95, y + r * 0.25); g.fill();
  g.beginPath(); g.ellipse(x, y + r * 0.45, r * 0.4, r * 0.1, 0.5, 0, TAU); g.fill(); ctx.restore(); }

export function farSchool(seed, x, y, w, h, n, a = 0.35) {
  const R = rng(seed), g = ctx; g.save(); g.globalAlpha = a; g.fillStyle = '#0d5a98';
  for (let i = 0; i < n; i++) { const t = R(), cx = x + t * w, cy = y + Math.sin(t * 5 + seed) * h * 0.4 + (R() - 0.5) * h * 0.5, s = (4 + R() * 4) * u;
    g.beginPath(); g.ellipse(cx, cy, s * 1.4, s * 0.7, 0, 0, TAU); g.moveTo(cx - s * 1.2, cy); g.lineTo(cx - s * 2.2, cy - s * 0.7); g.lineTo(cx - s * 2.2, cy + s * 0.7); g.fill(); }
  g.restore();
}

export function wreck(x, y, s, a = 0.55, col = '#0d4a86') {
  const g = ctx; g.save(); g.globalAlpha = a; g.filter = `blur(${2.5 * u}px)`; g.fillStyle = col; g.translate(x, y); g.rotate(-0.12);
  g.beginPath(); g.moveTo(-260 * s, -40 * s); g.lineTo(240 * s, -60 * s); g.quadraticCurveTo(300 * s, -60 * s, 270 * s, 20 * s); g.lineTo(-200 * s, 60 * s); g.quadraticCurveTo(-270 * s, 40 * s, -260 * s, -40 * s); g.fill();
  g.fillRect(-120 * s, -110 * s, 120 * s, 70 * s); g.fillRect(-30 * s, -260 * s, 14 * s, 210 * s); g.fillRect(120 * s, -200 * s, 12 * s, 150 * s);
  g.fillRect(-90 * s, -230 * s, 140 * s, 8 * s);
  g.fillStyle = rgba('#7ff0ff', 0.35); for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(-150 * s + i * 70 * s, -10 * s, 12 * s, 0, TAU); g.fill(); }
  g.restore();
}

// Clownfish peeking out of a big anemone home.
export function clownHome(x, y, r) { anemone(x, y, r, '#c77bff', '#ffe8ff', 31); fish(x - r * 0.25, y - r * 0.85, r * 0.32, '#ff7a3a', { stripes: true }); fish(x + r * 0.35, y - r * 0.6, r * 0.24, '#ff8a3a', { stripes: true, flip: true }); }
