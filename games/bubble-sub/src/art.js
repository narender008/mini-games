// Bubble Sub: the submarine, its pilot and every sea friend, ported from the
// approved concept. Each draws around (0,0) through place() so squash and
// stretch is just a scale.
import { ctx, u, W, H, TAU, rng, lerp, clamp, rgba, mix, rr, glow, blob, starPath, heartPath, sticker, sparkle } from './draw.js';
import { gloss, bubble, shadow, caustics } from './paint.js';

export function place(x, y, o = {}, fn) {
  const g = ctx; g.save(); g.translate(x, y); g.rotate(o.rot || 0);
  g.scale((o.flip ? -1 : 1) * (o.sx || 1), o.sy || 1); fn(g); g.restore();
}

export function eye(g, x, y, r, lx = 0.2, ly = 0, blink = 0, happy = false) {
  g.save();
  if (happy) { // closed happy arc
    g.strokeStyle = '#1a1030'; g.lineWidth = r * 0.42; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y + r * 0.25, r * 0.75, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); g.restore(); return;
  }
  g.beginPath(); g.ellipse(x, y, r, r * (1.1 - blink), 0, 0, TAU);
  g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = r * 0.16; g.strokeStyle = '#1a1030'; g.stroke();
  const px = x + lx * r * 0.45, py = y + ly * r * 0.45;
  const pg = g.createRadialGradient(px, py - r * 0.2, r * 0.05, px, py, r * 0.68);
  pg.addColorStop(0, '#3a2a6a'); pg.addColorStop(1, '#0d0820');
  g.fillStyle = pg; g.beginPath(); g.arc(px, py, r * 0.64, 0, TAU); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(px - r * 0.22, py - r * 0.26, r * 0.24, 0, TAU); g.fill();
  g.beginPath(); g.arc(px + r * 0.22, py + r * 0.2, r * 0.1, 0, TAU); g.fill();
  g.restore();
}

export function blush(g, x, y, r, a = 0.5) { g.save(); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,90,140,${a})`); gr.addColorStop(1, 'rgba(255,90,140,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.65, 0, 0, TAU); g.fill(); g.restore(); }

export function smile(g, x, y, r, open = false) {
  g.save(); g.strokeStyle = '#1a1030'; g.lineWidth = r * 0.22; g.lineCap = 'round';
  if (open) { g.beginPath(); g.moveTo(x - r, y); g.quadraticCurveTo(x, y + r * 1.6, x + r, y); g.closePath(); g.fillStyle = '#7a1838'; g.fill(); g.stroke();
    g.save(); g.clip(); g.fillStyle = '#ff7a9a'; g.beginPath(); g.ellipse(x, y + r * 0.95, r * 0.55, r * 0.35, 0, 0, TAU); g.fill(); g.restore(); }
  else { g.beginPath(); g.arc(x, y - r * 0.4, r, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke(); }
  g.restore();
}

export function sub(x, y, r, o = {}) {
  place(x, y, o, g => {
    const body = o.col || '#ffc928';
    // headlight cone
    if (o.light) { g.save(); g.globalCompositeOperation = 'lighter';
      const L = r * (o.lightLen || 6), gr = g.createRadialGradient(r * 1.2, r * 0.1, r * 0.1, r * 1.2, r * 0.1, L);
      gr.addColorStop(0, 'rgba(255,250,200,0.55)'); gr.addColorStop(0.5, 'rgba(255,240,180,0.18)'); gr.addColorStop(1, 'rgba(255,240,180,0)');
      g.fillStyle = gr; g.filter = `blur(${6 * u}px)`; g.beginPath(); g.moveTo(r * 1.2, r * 0.1); g.lineTo(L, -L * 0.42); g.lineTo(L, L * 0.55); g.fill(); g.restore(); }
    if (o.under) o.under(g, r);
    // propeller
    g.save(); g.translate(-r * 1.38, r * 0.08);
    g.fillStyle = '#9a6a10'; rr(g, -r * 0.05, -r * 0.08, r * 0.2, r * 0.16, r * 0.05); g.fill();
    for (const [a, s] of [[-1, 1], [1, 0.75]]) { g.beginPath(); g.ellipse(-r * 0.08, a * r * 0.22 * s, r * 0.1, r * 0.26 * s, a * 0.25, 0, TAU); gloss(g, -r * 0.08, a * r * 0.2, r * 0.25, '#ff6a3d', { spec: false }); }
    g.beginPath(); g.arc(-r * 0.06, 0, r * 0.08, 0, TAU); gloss(g, -r * 0.06, 0, r * 0.08, '#ffd65a', { spec: false });
    g.restore();
    // tail fins
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-r * 0.95, s * r * 0.2); g.quadraticCurveTo(-r * 1.35, s * r * 0.45, -r * 1.3, s * r * 0.72); g.quadraticCurveTo(-r * 1.05, s * r * 0.6, -r * 0.8, s * r * 0.42); g.closePath(); gloss(g, -r * 1.1, s * r * 0.5, r * 0.3, '#ff5a3a'); }
    // periscope
    g.beginPath(); rr(g, -r * 0.42, -r * 1.25, r * 0.16, r * 0.55, r * 0.07); gloss(g, -r * 0.34, -r * 1.0, r * 0.3, mix(body, '#ff8a00', 0.4), { spec: false });
    g.beginPath(); rr(g, -r * 0.42, -r * 1.33, r * 0.36, r * 0.17, r * 0.08); gloss(g, -r * 0.25, -r * 1.25, r * 0.22, mix(body, '#ff8a00', 0.4), { spec: false });
    g.beginPath(); g.ellipse(-r * 0.06, -r * 1.245, r * 0.04, r * 0.06, 0, 0, TAU); g.fillStyle = '#9ff4ff'; g.fill();
    // hull
    g.beginPath(); g.ellipse(0, 0, r * 1.28, r * 0.84, 0, 0, TAU);
    gloss(g, 0, 0, r * 1.1, body, { lw: 0.075, light: '#fffbe0', dark: '#d97a00', bounce: '#80fff0' });
    // red stripe band (clipped to hull)
    g.save(); g.beginPath(); g.ellipse(0, 0, r * 1.28, r * 0.84, 0, 0, TAU); g.clip();
    const sg = g.createLinearGradient(0, r * 0.2, 0, r * 0.55); sg.addColorStop(0, '#ff6b5a'); sg.addColorStop(1, '#d8283a');
    g.fillStyle = sg; g.beginPath(); g.moveTo(-r * 1.4, r * 0.3); g.quadraticCurveTo(0, r * 0.42, r * 1.4, r * 0.3); g.lineTo(r * 1.4, r * 0.5); g.quadraticCurveTo(0, r * 0.62, -r * 1.4, r * 0.5); g.fill();
    // hull shine stripe
    g.globalCompositeOperation = 'lighter'; const hs = g.createLinearGradient(0, -r * 0.8, 0, -r * 0.3); hs.addColorStop(0, 'rgba(255,255,255,0.0)'); hs.addColorStop(0.5, 'rgba(255,255,240,0.45)'); hs.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hs; g.beginPath(); g.ellipse(-r * 0.15, -r * 0.5, r * 0.95, r * 0.16, -0.05, 0, TAU); g.fill();
    g.restore();
    // rivets
    for (let i = -3; i <= 3; i++) { const a = i * 0.32, px = Math.sin(a) * r * 1.0, py = r * 0.12 + Math.cos(a) * r * 0.05; g.fillStyle = '#e89a10'; g.beginPath(); g.arc(px, py - r * 0.12, r * 0.035, 0, TAU); g.fill(); g.fillStyle = '#fff6c0'; g.beginPath(); g.arc(px - r * 0.01, py - r * 0.13, r * 0.014, 0, TAU); g.fill(); }
    // side porthole
    g.beginPath(); g.arc(-r * 0.62, r * 0.02, r * 0.17, 0, TAU); gloss(g, -r * 0.62, 0, r * 0.17, '#ff9a20', { spec: false });
    g.beginPath(); g.arc(-r * 0.62, r * 0.02, r * 0.11, 0, TAU); const pw = g.createRadialGradient(-r * 0.66, -r * 0.02, 0, -r * 0.62, r * 0.02, r * 0.12); pw.addColorStop(0, '#d9ffff'); pw.addColorStop(1, '#2bb8e0'); g.fillStyle = pw; g.fill();
    // headlight lamp on the nose
    g.beginPath(); g.arc(r * 1.18, r * 0.1, r * 0.15, 0, TAU); gloss(g, r * 1.18, r * 0.1, r * 0.15, '#ff9a20', { spec: false });
    g.beginPath(); g.arc(r * 1.2, r * 0.1, r * 0.1, 0, TAU); g.fillStyle = '#fffbe0'; g.fill();
    if (o.light) { g.save(); g.globalCompositeOperation = 'lighter'; glow(r * 1.2, r * 0.1, r * 0.6, '#fff4b0', 0.9, g); g.restore(); }
    // glass dome with pilot
    const dx = r * 0.28, dy = -r * 0.55, dr = r * 0.62;
    g.save(); g.beginPath(); g.arc(dx, dy, dr, 0, TAU); g.clip();
    const dg = g.createRadialGradient(dx - dr * 0.2, dy - dr * 0.3, dr * 0.1, dx, dy, dr); dg.addColorStop(0, '#c8fbff'); dg.addColorStop(1, '#3fbfe6'); g.fillStyle = dg; g.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
    pilot(g, dx + dr * 0.05, dy + dr * 0.22, dr * 0.62, o);
    g.restore();
    // dome rim + glass shine
    g.beginPath(); g.arc(dx, dy, dr, 0, TAU); g.lineWidth = r * 0.1; g.strokeStyle = '#ff9a20'; g.stroke(); g.lineWidth = r * 0.03; g.strokeStyle = '#9a4a00'; g.beginPath(); g.arc(dx, dy, dr + r * 0.055, 0, TAU); g.stroke();
    g.save(); g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(dx - dr * 0.42, dy - dr * 0.38, dr * 0.32, dr * 0.13, -0.8, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = dr * 0.06; g.beginPath(); g.arc(dx, dy, dr * 0.84, -2.7, -1.9); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(dx + dr * 0.45, dy + dr * 0.42, dr * 0.05, 0, TAU); g.fill();
    g.restore();
    // caustic flicker on the hull
    g.save(); g.beginPath(); g.ellipse(0, 0, r * 1.28, r * 0.84, 0, 0, TAU); g.clip(); caustics(7, -r * 1.4, -r * 0.9, r * 2.8, r * 0.9, 0.16, r / u * 0.4); g.restore();
    if (o.extra) o.extra(g, r);
  });
}

export function pilot(g, x, y, r, o) {
  // little bear with a sailor hat
  g.save();
  for (const s of [-1, 1]) { g.beginPath(); g.arc(x + s * r * 0.62, y - r * 0.62, r * 0.28, 0, TAU); gloss(g, x + s * r * 0.62, y - r * 0.62, r * 0.28, '#c9813f', { spec: false, lw: 0.14 }); g.beginPath(); g.arc(x + s * r * 0.62, y - r * 0.62, r * 0.14, 0, TAU); g.fillStyle = '#ffb0a0'; g.fill(); }
  g.beginPath(); g.ellipse(x, y, r * 0.9, r * 0.82, 0, 0, TAU); gloss(g, x, y, r * 0.9, '#d8914a', { lw: 0.08, light: '#ffe0b0' });
  g.beginPath(); g.ellipse(x + r * 0.12, y + r * 0.3, r * 0.42, r * 0.3, 0, 0, TAU); g.fillStyle = '#fbe1c0'; g.fill();
  g.fillStyle = '#3a1a10'; g.beginPath(); g.ellipse(x + r * 0.12, y + r * 0.17, r * 0.13, r * 0.09, 0, 0, TAU); g.fill();
  eye(g, x - r * 0.22, y - r * 0.12, r * 0.17, 0.5, 0, 0, o.pilotHappy);
  eye(g, x + r * 0.42, y - r * 0.12, r * 0.17, 0.5, 0, 0, o.pilotHappy);
  smile(g, x + r * 0.12, y + r * 0.42, r * 0.16, o.pilotOpen);
  blush(g, x - r * 0.42, y + r * 0.22, r * 0.2, 0.6); blush(g, x + r * 0.64, y + r * 0.22, r * 0.2, 0.6);
  // sailor hat
  g.beginPath(); g.ellipse(x - r * 0.05, y - r * 0.72, r * 0.6, r * 0.2, -0.1, Math.PI, TAU); g.closePath(); gloss(g, x, y - r * 0.8, r * 0.5, '#ffffff', { lw: 0.08, line: '#3a5aa0', dark: '#c6d8f5' });
  g.fillStyle = '#2f6df0'; g.fillRect(x - r * 0.62, y - r * 0.74, r * 1.15, r * 0.09);
  g.restore();
}

export function fish(x, y, r, col, o = {}) {
  place(x, y, o, g => {
    const stripe = o.stripe || '#ffffff';
    g.beginPath(); g.moveTo(-r * 0.8, 0); g.quadraticCurveTo(-r * 1.5, -r * 0.75, -r * 1.55, -r * 0.6); g.quadraticCurveTo(-r * 1.3, 0, -r * 1.55, r * 0.6); g.quadraticCurveTo(-r * 1.5, r * 0.75, -r * 0.8, 0);
    gloss(g, -r * 1.2, 0, r * 0.5, mix(col, '#ff3060', 0.25));
    g.beginPath(); g.moveTo(-r * 0.3, -r * 0.65); g.quadraticCurveTo(0, -r * 1.25, r * 0.4, -r * 0.7); g.closePath(); gloss(g, 0, -r * 0.8, r * 0.4, mix(col, '#ff3060', 0.25), { spec: false });
    g.beginPath(); g.ellipse(0, 0, r, r * 0.78, 0, 0, TAU); gloss(g, 0, 0, r, col);
    g.save(); g.beginPath(); g.ellipse(0, 0, r, r * 0.78, 0, 0, TAU); g.clip();
    if (o.stripes) for (const sx of [-0.35, 0.15]) { g.fillStyle = stripe; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(sx * r, 0, r * 0.13, r * 0.9, 0, 0, TAU); g.fill(); g.globalAlpha = 1; g.strokeStyle = '#1a1030'; g.lineWidth = r * 0.05; g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(-r * 0.3, -r * 0.48, r * 0.36, r * 0.13, -0.3, 0, TAU); g.fill();
    g.restore();
    g.beginPath(); g.ellipse(-r * 0.05, r * 0.25, r * 0.22, r * 0.12, 0.5, 0, TAU); gloss(g, -r * 0.05, r * 0.25, r * 0.22, mix(col, '#ffffff', 0.25), { spec: false, lw: 0.15 });
    eye(g, r * 0.45, -r * 0.12, r * 0.3, o.lx ?? 0.6, o.ly ?? 0, 0, o.happy);
    smile(g, r * 0.72, r * 0.3, r * 0.14, o.open);
    blush(g, r * 0.3, r * 0.28, r * 0.18, 0.55);
  });
}

export function puffer(x, y, r, o = {}) {
  place(x, y, o, g => {
    g.beginPath(); g.moveTo(-r * 0.9, 0); g.lineTo(-r * 1.35, -r * 0.4); g.quadraticCurveTo(-r * 1.2, 0, -r * 1.35, r * 0.4); g.closePath(); gloss(g, -r * 1.15, 0, r * 0.35, '#ff9a2a');
    // spikes
    for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; g.beginPath(); g.moveTo(Math.cos(a - 0.12) * r * 0.92, Math.sin(a - 0.12) * r * 0.92); g.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2); g.lineTo(Math.cos(a + 0.12) * r * 0.92, Math.sin(a + 0.12) * r * 0.92); g.fillStyle = '#e08a10'; g.fill(); g.strokeStyle = '#7a3a00'; g.lineWidth = r * 0.04; g.stroke(); }
    g.beginPath(); g.arc(0, 0, r, 0, TAU); gloss(g, 0, 0, r, '#ffd23a', { light: '#fffbe0' });
    g.save(); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip(); g.fillStyle = 'rgba(255,255,240,0.8)'; g.beginPath(); g.ellipse(0, r * 0.7, r * 0.9, r * 0.5, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(200,120,0,0.35)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(-r * 0.5 + (i % 3) * r * 0.3, -r * 0.35 + ((i / 3) | 0) * r * 0.25, r * 0.05, 0, TAU); g.fill(); } g.restore();
    eye(g, -r * 0.05, -r * 0.18, r * 0.3, 0.3, 0, 0, o.happy); eye(g, r * 0.55, -r * 0.18, r * 0.27, 0.3, 0, 0, o.happy);
    g.beginPath(); g.ellipse(r * 0.35, r * 0.32, r * 0.14, r * 0.12, 0, 0, TAU); g.fillStyle = '#a0283a'; g.fill(); g.strokeStyle = '#1a1030'; g.lineWidth = r * 0.05; g.stroke();
    blush(g, -r * 0.3, r * 0.2, r * 0.2); blush(g, r * 0.8, r * 0.2, r * 0.17);
  });
}

export function octopus(x, y, r, o = {}) {
  const col = o.col || '#ff6aa8';
  place(x, y, o, g => {
    const wave = o.wave || 0;
    for (let i = 0; i < 8; i++) {
      const bx = (i - 3.5) * r * 0.24, curl = (i % 2 ? 1 : -1) * (0.6 + (i * 37 % 5) * 0.1) + wave * Math.sin(i);
      const ex = bx * 1.9 + curl * r * 0.35, ey = r * (1.25 + (i % 3) * 0.12);
      g.lineCap = 'round';
      for (const [c, w] of [[mix(col, '#3a0828', 0.6), r * 0.3], [col, r * 0.22], [rgba(mix(col, '#ffffff', 0.5), 0.6), r * 0.06]]) {
        g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(bx, r * 0.3); g.bezierCurveTo(bx * 1.4, r * 0.8, ex - curl * r * 0.5, ey, ex, ey - r * 0.12); g.stroke();
      }
      g.fillStyle = mix(col, '#ffffff', 0.55); for (let k = 1; k < 4; k++) { const t = k / 4; g.beginPath(); g.arc(lerp(bx, ex, t) + (curl * r * 0.1), lerp(r * 0.4, ey, t), r * 0.035, 0, TAU); g.fill(); }
    }
    g.beginPath(); g.ellipse(0, -r * 0.1, r * 0.9, r * 0.82, 0, 0, TAU); gloss(g, 0, -r * 0.15, r * 0.9, col);
    g.save(); g.beginPath(); g.ellipse(0, -r * 0.1, r * 0.9, r * 0.82, 0, 0, TAU); g.clip(); g.fillStyle = rgba(mix(col, '#6a0a40', 0.4), 0.35);
    for (const [sx, sy, sr] of [[-0.5, -0.5, 0.1], [0.45, -0.6, 0.08], [0.6, -0.2, 0.06], [-0.6, -0.15, 0.07]]) { g.beginPath(); g.arc(sx * r, sy * r, sr * r, 0, TAU); g.fill(); } g.restore();
    eye(g, -r * 0.3, -r * 0.05, r * 0.24, 0.1, 0.2, 0, o.happy); eye(g, r * 0.3, -r * 0.05, r * 0.24, -0.1, 0.2, 0, o.happy);
    smile(g, 0, r * 0.35, r * 0.18, o.open); blush(g, -r * 0.55, r * 0.25, r * 0.2, 0.6); blush(g, r * 0.55, r * 0.25, r * 0.2, 0.6);
  });
}

export function jelly(x, y, r, col = '#c77bff', o = {}) {
  place(x, y, o, g => {
    g.save(); g.globalCompositeOperation = 'lighter'; glow(0, 0, r * 2.6, col, o.glow ?? 0.5, g); g.restore();
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) { const bx = (i - 2.5) * r * 0.3; g.strokeStyle = rgba(mix(col, '#ffffff', 0.4), 0.7); g.lineWidth = r * 0.09;
      g.beginPath(); g.moveTo(bx, r * 0.3); for (let k = 1; k <= 8; k++) g.lineTo(bx + Math.sin(k * 0.9 + i) * r * 0.16, r * 0.3 + k * r * 0.24); g.stroke(); }
    for (let i = 0; i < 4; i++) { const bx = (i - 1.5) * r * 0.25; g.strokeStyle = rgba(col, 0.8); g.lineWidth = r * 0.16; g.beginPath(); g.moveTo(bx, r * 0.3); g.bezierCurveTo(bx + r * 0.2, r * 0.8, bx - r * 0.2, r * 1.1, bx + r * 0.1, r * 1.5); g.stroke(); }
    g.beginPath(); g.moveTo(-r, r * 0.3); g.bezierCurveTo(-r * 1.05, -r * 0.9, r * 1.05, -r * 0.9, r, r * 0.3);
    for (let k = 0; k < 6; k++) g.quadraticCurveTo(r - (k + 0.5) * r / 3, r * 0.5, r - (k + 1) * r / 3, r * 0.3);
    g.closePath();
    const jg = g.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.05, 0, 0, r * 1.1); jg.addColorStop(0, 'rgba(255,255,255,0.95)'); jg.addColorStop(0.4, rgba(mix(col, '#ffffff', 0.35), 0.8)); jg.addColorStop(1, rgba(col, 0.55));
    g.fillStyle = jg; g.fill(); g.lineWidth = r * 0.06; g.strokeStyle = rgba(mix(col, '#ffffff', 0.6), 0.9); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(-r * 0.4, -r * 0.35, r * 0.25, r * 0.1, -0.6, 0, TAU); g.fill();
    eye(g, -r * 0.3, 0, r * 0.15, 0, 0.3, 0, o.happy); eye(g, r * 0.3, 0, r * 0.15, 0, 0.3, 0, o.happy);
    smile(g, 0, r * 0.18, r * 0.12); blush(g, -r * 0.55, r * 0.12, r * 0.13); blush(g, r * 0.55, r * 0.12, r * 0.13);
  });
}

export function turtle(x, y, r, o = {}) {
  place(x, y, o, g => {
    const skin = '#7ee08a';
    for (const [fx, fy, a] of [[-0.55, 0.5, 0.9], [0.55, 0.5, -0.9], [-0.65, -0.35, 2.4], [0.7, -0.4, -2.2]]) { g.beginPath(); g.ellipse(fx * r, fy * r, r * 0.42, r * 0.16, a, 0, TAU); gloss(g, fx * r, fy * r, r * 0.35, skin, { spec: false }); }
    g.beginPath(); g.arc(r * 1.05, -r * 0.1, r * 0.4, 0, TAU); gloss(g, r * 1.05, -r * 0.1, r * 0.4, skin);
    eye(g, r * 1.18, -r * 0.22, r * 0.15, 0.6, 0, 0, o.happy); smile(g, r * 1.25, r * 0.05, r * 0.1); blush(g, r * 1.02, r * 0.05, r * 0.12);
    g.beginPath(); g.ellipse(0, 0, r, r * 0.72, 0, 0, TAU); gloss(g, 0, 0, r, '#3fb874', { dark: '#0e6a40' });
    g.save(); g.beginPath(); g.ellipse(0, 0, r, r * 0.72, 0, 0, TAU); g.clip();
    for (const [sx, sy, sr] of [[0, -0.05, 0.3], [-0.55, -0.15, 0.24], [0.55, -0.15, 0.24], [-0.3, 0.45, 0.2], [0.3, 0.45, 0.2], [-0.3, -0.55, 0.18], [0.3, -0.55, 0.18]]) {
      g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.lineTo(sx * r + Math.cos(a) * sr * r, sy * r + Math.sin(a) * sr * r * 0.85); } g.closePath(); gloss(g, sx * r, sy * r, sr * r, '#ffd34a', { lw: 0.2, line: '#0e6a40', dark: '#e09a20' }); }
    g.restore();
  });
}

export function whale(x, y, r, o = {}) {
  place(x, y, o, g => {
    const col = '#4f8ff5';
    g.beginPath(); g.moveTo(-r * 0.9, -r * 0.05); g.quadraticCurveTo(-r * 1.4, -r * 0.1, -r * 1.65, -r * 0.55); g.quadraticCurveTo(-r * 1.55, -r * 0.2, -r * 1.85, -r * 0.05); g.quadraticCurveTo(-r * 1.4, r * 0.05, -r * 0.9, r * 0.25); gloss(g, -r * 1.4, -r * 0.15, r * 0.4, col);
    g.beginPath(); g.moveTo(-r * 1.0, r * 0.1); g.bezierCurveTo(-r * 1.0, -r * 0.85, r * 0.4, -r * 0.95, r * 1.05, -r * 0.3); g.bezierCurveTo(r * 1.3, r * 0.05, r * 1.1, r * 0.6, r * 0.3, r * 0.65); g.bezierCurveTo(-r * 0.4, r * 0.7, -r * 0.95, r * 0.5, -r * 1.0, r * 0.1);
    gloss(g, 0, -r * 0.1, r * 1.05, col, { light: '#b8dcff' });
    g.save(); g.clip(); g.beginPath(); g.moveTo(-r, r * 0.2); g.bezierCurveTo(-r * 0.3, r * 0.15, r * 0.6, r * 0.2, r * 1.25, r * 0.0); g.lineTo(r * 1.3, r); g.lineTo(-r, r); g.fillStyle = '#e8f4ff'; g.fill();
    g.strokeStyle = 'rgba(120,160,220,0.6)'; g.lineWidth = r * 0.03; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-r * 0.2 + i * r * 0.2, r * 0.25); g.lineTo(-r * 0.3 + i * r * 0.22, r * 0.62); g.stroke(); } g.restore();
    g.beginPath(); g.ellipse(-r * 0.05, r * 0.4, r * 0.32, r * 0.12, 0.6, 0, TAU); gloss(g, -r * 0.05, r * 0.4, r * 0.3, col, { spec: false });
    eye(g, r * 0.55, -r * 0.1, r * 0.16, 0.4, 0, 0, o.happy); smile(g, r * 0.82, r * 0.12, r * 0.12, o.open); blush(g, r * 0.4, r * 0.12, r * 0.16, 0.6);
    if (o.spout) { g.save(); for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.28; bubble(r * 0.1 + Math.cos(a) * r * 0.5, -r * 0.75 + Math.sin(a) * r * 0.55, r * (0.08 + (i % 3) * 0.03)); }
      const sg = g.createLinearGradient(0, -r * 1.3, 0, -r * 0.6); sg.addColorStop(0, 'rgba(220,255,255,0)'); sg.addColorStop(1, 'rgba(220,255,255,0.7)'); g.fillStyle = sg;
      g.beginPath(); g.moveTo(r * 0.05, -r * 0.62); g.quadraticCurveTo(-r * 0.15, -r * 1.0, -r * 0.5, -r * 1.2); g.quadraticCurveTo(r * 0.1, -r * 1.1, r * 0.15, -r * 0.62); g.quadraticCurveTo(r * 0.2, -r * 1.1, r * 0.7, -r * 1.2); g.quadraticCurveTo(r * 0.3, -r * 1.0, r * 0.15, -r * 0.62); g.fill(); g.restore(); }
  });
}

export function crab(x, y, r, o = {}) {
  place(x, y, o, g => {
    const col = '#ff5a4a'; g.lineCap = 'round';
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { g.strokeStyle = '#a0201a'; g.lineWidth = r * 0.18; g.beginPath(); g.moveTo(s * r * 0.5, r * 0.15 + i * r * 0.12); g.quadraticCurveTo(s * r * 1.0, r * 0.1 + i * r * 0.15, s * r * 1.05, r * 0.55 + i * r * 0.1); g.stroke(); g.strokeStyle = col; g.lineWidth = r * 0.1; g.stroke(); }
    for (const s of [-1, 1]) { g.strokeStyle = '#a0201a'; g.lineWidth = r * 0.2; g.beginPath(); g.moveTo(s * r * 0.6, -r * 0.1); g.quadraticCurveTo(s * r * 1.0, -r * 0.5, s * r * 0.95, -r * (0.8 + (o.wave && s > 0 ? 0.35 : 0))); g.stroke();
      const cx = s * r * 0.95, cy = -r * (1.0 + (o.wave && s > 0 ? 0.35 : 0)); g.beginPath(); g.arc(cx, cy, r * 0.32, 0.3, TAU - 0.3); g.lineTo(cx + r * 0.05, cy); g.closePath(); gloss(g, cx, cy, r * 0.32, col); }
    for (const s of [-1, 1]) { g.strokeStyle = '#a0201a'; g.lineWidth = r * 0.09; g.beginPath(); g.moveTo(s * r * 0.22, -r * 0.4); g.lineTo(s * r * 0.3, -r * 0.75); g.stroke(); eye(g, s * r * 0.3, -r * 0.85, r * 0.17, 0, 0.2, 0, o.happy); }
    g.beginPath(); g.ellipse(0, 0, r * 0.8, r * 0.5, 0, 0, TAU); gloss(g, 0, 0, r * 0.8, col);
    smile(g, 0, r * 0.1, r * 0.16, o.open); blush(g, -r * 0.45, r * 0.05, r * 0.15); blush(g, r * 0.45, r * 0.05, r * 0.15);
  });
}

export function starfish(x, y, r, col = '#ffa53a', o = {}) {
  place(x, y, o, g => {
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.5 : r; g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } g.closePath();
    g.lineJoin = 'round'; gloss(g, 0, 0, r * 0.9, col, { lw: 0.14 });
    g.fillStyle = rgba(mix(col, '#ffffff', 0.6), 0.9); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; for (let k = 1; k < 3; k++) { g.beginPath(); g.arc(Math.cos(a) * r * 0.3 * k, Math.sin(a) * r * 0.3 * k, r * 0.04, 0, TAU); g.fill(); } }
    eye(g, -r * 0.16, -r * 0.05, r * 0.11, 0, 0.2, 0, o.happy); eye(g, r * 0.16, -r * 0.05, r * 0.11, 0, 0.2, 0, o.happy); smile(g, 0, r * 0.12, r * 0.08);
  });
}

export function seahorse(x, y, r, o = {}) {
  place(x, y, o, g => {
    const col = o.col || '#ffd23a';
    g.lineCap = 'round'; g.strokeStyle = mix(col, '#5a2a00', 0.5); g.lineWidth = r * 0.34; g.beginPath(); g.moveTo(0, r * 0.4); g.bezierCurveTo(-r * 0.1, r * 1.1, r * 0.5, r * 1.2, r * 0.4, r * 0.8); g.stroke(); g.strokeStyle = col; g.lineWidth = r * 0.24; g.stroke();
    g.beginPath(); g.ellipse(0, 0, r * 0.38, r * 0.6, 0.1, 0, TAU); gloss(g, 0, 0, r * 0.45, col);
    g.beginPath(); g.moveTo(-r * 0.3, -r * 0.2); g.quadraticCurveTo(-r * 0.7, -r * 0.1, -r * 0.4, r * 0.25); gloss(g, -r * 0.45, 0, r * 0.2, '#ff8ac8', { spec: false });
    g.beginPath(); g.ellipse(r * 0.1, -r * 0.65, r * 0.32, r * 0.3, 0, 0, TAU); gloss(g, r * 0.1, -r * 0.65, r * 0.32, col);
    g.beginPath(); rr(g, r * 0.25, -r * 0.72, r * 0.42, r * 0.18, r * 0.09); gloss(g, r * 0.45, -r * 0.63, r * 0.2, col, { spec: false });
    eye(g, r * 0.15, -r * 0.72, r * 0.11, 0.5, 0, 0, o.happy); blush(g, r * 0.2, -r * 0.52, r * 0.1);
  });
}

export function tapRing(x, y, r) {
  const g = ctx; g.save(); g.globalCompositeOperation = 'lighter';
  for (const [k, a] of [[1, 0.8], [1.5, 0.45], [2.1, 0.2]]) { g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 6 * u / k; g.beginPath(); g.arc(x, y, r * k, 0, TAU); g.stroke(); }
  glow(x, y, r * 1.2, '#ffffff', 0.5); g.restore();
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; sparkle(x + Math.cos(a) * r * 1.8, y + Math.sin(a) * r * 1.8, (10 + (i % 2) * 8) * u, 0.95, i % 2 ? '#fff6a0' : '#ffffff'); }
}

export function subUnder(opt = {}) {
  return (g, r) => {
    // propeller wash: motion rings and churned bubbles
    if (opt.wash !== false) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) { g.strokeStyle = `rgba(220,255,255,${0.35 - i * 0.07})`; g.lineWidth = r * (0.05 - i * 0.008); g.beginPath(); g.ellipse(-r * (1.62 + i * 0.22), r * 0.08, r * (0.12 + i * 0.03), r * (0.36 + i * 0.1), 0, 0, TAU); g.stroke(); }
    g.restore();
    const R = rng(77); for (let i = 0; i < 26; i++) { const t = R(); bubble(-r * (1.7 + t * 2.6), r * 0.08 + (R() - 0.5) * r * (0.3 + t * 1.2), r * (0.03 + R() * 0.09) * (1.2 - t * 0.6), 0.9 - t * 0.5); }
    }
    // claw arm under the belly
    if (opt.claw !== false) {
      const j0 = [r * 0.35, r * 0.7], j1 = [r * 0.8, r * 1.05], j2 = [r * 1.15, r * (opt.clawDown ? 1.45 : 0.95)];
      g.lineCap = 'round';
      for (const [c, w] of [['#5a3a10', r * 0.17], ['#b8c4d8', r * 0.12], ['rgba(255,255,255,0.7)', r * 0.03]]) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(...j0); g.lineTo(...j1); g.lineTo(...j2); g.stroke(); }
      for (const [x, y] of [j0, j1]) { g.beginPath(); g.arc(x, y, r * 0.1, 0, TAU); gloss(g, x, y, r * 0.1, '#ff9a20', { spec: false }); }
      const [cx, cy] = j2;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + r * 0.25, cy + s * r * 0.22, cx + r * 0.32, cy + s * r * 0.05); g.lineWidth = r * 0.09; g.strokeStyle = '#5a3a10'; g.stroke(); g.lineWidth = r * 0.06; g.strokeStyle = '#d8e0f0'; g.stroke(); }
      if (opt.hold) opt.hold(cx + r * 0.3, cy);
    }
  };
}

export function subExtra(opt = {}) {
  return (g, r) => {
    // string of glowing bulbs along the red band
    const cols = ['#ff5f8f', '#ffe14a', '#4fe08a', '#3fc8ff', '#b57bff'];
    for (let i = 0; i < 9; i++) {
      const t = i / 8, x = -r * 0.95 + t * r * 1.9, y = r * 0.4 + Math.sin(t * Math.PI) * r * 0.1;
      g.save(); g.globalCompositeOperation = 'lighter'; glow(x, y, r * 0.16, cols[i % 5], 0.8, g); g.restore();
      g.beginPath(); g.arc(x, y, r * 0.045, 0, TAU); g.fillStyle = mix(cols[i % 5], '#ffffff', 0.5); g.fill();
    }
    // antenna with a blinking ball
    g.lineWidth = r * 0.03; g.strokeStyle = '#5a3a10'; g.beginPath(); g.moveTo(-r * 0.75, -r * 0.6); g.quadraticCurveTo(-r * 0.85, -r * 1.0, -r * 0.7, -r * 1.25); g.stroke();
    g.save(); g.globalCompositeOperation = 'lighter'; glow(-r * 0.7, -r * 1.28, r * 0.35, '#ff4a6a', 0.9, g); g.restore();
    g.beginPath(); g.arc(-r * 0.7, -r * 1.28, r * 0.08, 0, TAU); gloss(g, -r * 0.7, -r * 1.28, r * 0.08, '#ff4a6a');
    // brass horn on the front top
    g.save(); g.translate(r * 0.92, -r * 0.48); g.rotate(-0.5);
    g.beginPath(); g.moveTo(-r * 0.08, -r * 0.05); g.lineTo(r * 0.22, -r * 0.05); g.quadraticCurveTo(r * 0.32, -r * 0.2, r * 0.38, -r * 0.24); g.lineTo(r * 0.38, r * 0.24); g.quadraticCurveTo(r * 0.32, r * 0.2, r * 0.22, r * 0.05); g.lineTo(-r * 0.08, r * 0.05); g.closePath();
    gloss(g, r * 0.2, 0, r * 0.26, '#ffb52a', { light: '#fff6c0', dark: '#b86a00' });
    g.beginPath(); g.ellipse(r * 0.38, 0, r * 0.06, r * 0.24, 0, 0, TAU); g.fillStyle = '#7a4000'; g.fill();
    if (opt.honk) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 4; i++) { g.strokeStyle = `rgba(255,255,220,${0.75 - i * 0.14})`; g.lineWidth = r * 0.05; g.beginPath(); g.arc(r * 0.38, 0, r * (0.2 + i * 0.22), -0.7, 0.7); g.stroke(); }
      g.restore();
    }
    g.restore();
    // hull number plate
    g.beginPath(); rr(g, -r * 0.35, r * 0.05, r * 0.42, r * 0.2, r * 0.08); gloss(g, -r * 0.14, r * 0.15, r * 0.2, '#ffffff', { spec: false, line: '#9a4a00', dark: '#e8eef8' });
    g.save(); g.beginPath(); g.arc(-r * 0.14, r * 0.15, r * 0.06, 0, TAU); g.fillStyle = '#3fa0ff'; g.fill(); g.beginPath(); g.ellipse(-r * 0.27, r * 0.15, r * 0.04, r * 0.06, 0, 0, TAU); g.fillStyle = '#ff5f8f'; g.fill(); g.restore();
  };
}

export function shark(x, y, r, o = {}) {
  place(x, y, o, g => {
    const col = '#7fa6c8';
    g.beginPath(); g.moveTo(-r * 1.1, 0); g.quadraticCurveTo(-r * 1.6, -r * 0.3, -r * 1.85, -r * 0.75); g.quadraticCurveTo(-r * 1.65, -r * 0.1, -r * 1.75, r * 0.45); g.quadraticCurveTo(-r * 1.5, r * 0.15, -r * 1.1, r * 0.15); gloss(g, -r * 1.5, -r * 0.1, r * 0.45, col);
    g.beginPath(); g.moveTo(-r * 0.25, -r * 0.45); g.quadraticCurveTo(-r * 0.2, -r * 1.05, -r * 0.55, -r * 1.05); g.quadraticCurveTo(-r * 0.4, -r * 0.7, -r * 0.65, -r * 0.4); gloss(g, -r * 0.4, -r * 0.7, r * 0.35, col);
    g.beginPath(); g.moveTo(-r * 1.15, 0); g.bezierCurveTo(-r * 0.8, -r * 0.65, r * 0.6, -r * 0.7, r * 1.15, -r * 0.08); g.bezierCurveTo(r * 1.25, r * 0.15, r * 0.9, r * 0.5, r * 0.2, r * 0.5); g.bezierCurveTo(-r * 0.5, r * 0.5, -r * 1.0, r * 0.25, -r * 1.15, 0);
    gloss(g, 0, -r * 0.1, r * 1.1, col, { light: '#e0f0ff' });
    g.save(); g.clip(); g.beginPath(); g.moveTo(-r * 1.2, r * 0.1); g.bezierCurveTo(-r * 0.2, r * 0.0, r * 0.6, r * 0.1, r * 1.3, -r * 0.05); g.lineTo(r * 1.3, r); g.lineTo(-r * 1.2, r); g.fillStyle = '#f2f8ff'; g.fill();
    g.strokeStyle = 'rgba(70,100,140,0.5)'; g.lineWidth = r * 0.025; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(r * 0.15 - i * r * 0.1, -r * 0.05, r * 0.2, -0.6, 0.6); g.stroke(); } g.restore();
    g.beginPath(); g.moveTo(r * 0.05, r * 0.35); g.quadraticCurveTo(-r * 0.1, r * 0.75, -r * 0.4, r * 0.8); g.quadraticCurveTo(-r * 0.2, r * 0.5, -r * 0.3, r * 0.35); gloss(g, -r * 0.15, r * 0.55, r * 0.3, col, { spec: false });
    eye(g, r * 0.62, -r * 0.18, r * 0.14, 0.5, 0, 0, o.happy);
    // big friendly grin with soft round teeth
    g.beginPath(); g.moveTo(r * 0.55, r * 0.12); g.quadraticCurveTo(r * 0.85, r * 0.35, r * 1.1, r * 0.08); g.quadraticCurveTo(r * 0.85, r * 0.2, r * 0.55, r * 0.12); g.fillStyle = '#7a1838'; g.fill(); g.strokeStyle = '#1a1030'; g.lineWidth = r * 0.03; g.stroke();
    g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(r * (0.68 + i * 0.1), r * 0.17, r * 0.025, 0, Math.PI); g.fill(); }
    blush(g, r * 0.6, r * 0.12, r * 0.12, 0.6);
  });
}

export function manta(x, y, r, o = {}) {
  place(x, y, o, g => {
    const col = o.col || '#3a5fa8';
    g.lineCap = 'round'; g.strokeStyle = mix(col, '#000', 0.3); g.lineWidth = r * 0.05; g.beginPath(); g.moveTo(-r * 0.3, 0); g.quadraticCurveTo(-r * 1.0, r * 0.1, -r * 1.6, -r * 0.1); g.stroke();
    g.beginPath(); g.moveTo(r * 0.55, 0);
    g.bezierCurveTo(r * 0.4, -r * 0.4, r * 0.0, -r * 0.6, -r * 0.2, -r * 1.25);
    g.bezierCurveTo(-r * 0.35, -r * 0.6, -r * 0.5, -r * 0.15, -r * 0.5, 0);
    g.bezierCurveTo(-r * 0.5, r * 0.15, -r * 0.35, r * 0.6, -r * 0.1, r * 1.0);
    g.bezierCurveTo(r * 0.0, r * 0.5, r * 0.4, r * 0.4, r * 0.55, 0);
    gloss(g, 0, -r * 0.2, r * 0.9, col, { light: '#a8c8ff' });
    g.save(); g.clip(); g.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(-r * 0.25 + (i % 3) * r * 0.15, -r * 0.5 + i * r * 0.18, r * 0.04, 0, TAU); g.fill(); } g.restore();
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(r * 0.6, s * r * 0.15, r * 0.14, r * 0.05, s * 0.4, 0, TAU); gloss(g, r * 0.6, s * r * 0.15, r * 0.1, col, { spec: false }); }
    eye(g, r * 0.38, -r * 0.18, r * 0.09, 0.5, 0, 0, o.happy); smile(g, r * 0.5, r * 0.05, r * 0.07);
  });
}

export function dolphin(x, y, r, o = {}) {
  place(x, y, o, g => {
    const col = '#6ab4f0';
    g.beginPath(); g.moveTo(-r * 1.0, -r * 0.05); g.quadraticCurveTo(-r * 1.35, -r * 0.2, -r * 1.55, -r * 0.55); g.quadraticCurveTo(-r * 1.4, -r * 0.1, -r * 1.6, r * 0.3); g.quadraticCurveTo(-r * 1.3, r * 0.05, -r * 1.0, r * 0.1); gloss(g, -r * 1.3, -r * 0.05, r * 0.35, col);
    g.beginPath(); g.moveTo(-r * 0.1, -r * 0.5); g.quadraticCurveTo(-r * 0.15, -r * 0.95, -r * 0.45, -r * 0.95); g.quadraticCurveTo(-r * 0.3, -r * 0.7, -r * 0.45, -r * 0.45); gloss(g, -r * 0.3, -r * 0.7, r * 0.25, col, { spec: false });
    g.beginPath(); g.moveTo(-r * 1.05, 0); g.bezierCurveTo(-r * 0.7, -r * 0.6, r * 0.5, -r * 0.65, r * 0.85, -r * 0.15); g.quadraticCurveTo(r * 1.35, -r * 0.05, r * 1.35, r * 0.08); g.quadraticCurveTo(r * 1.0, r * 0.22, r * 0.7, r * 0.25); g.bezierCurveTo(r * 0.2, r * 0.45, -r * 0.7, r * 0.35, -r * 1.05, 0);
    gloss(g, 0, -r * 0.1, r * 1.0, col, { light: '#d8f0ff' });
    g.save(); g.clip(); g.beginPath(); g.moveTo(-r, r * 0.15); g.quadraticCurveTo(r * 0.2, r * 0.05, r * 1.4, r * 0.1); g.lineTo(r * 1.4, r); g.lineTo(-r, r); g.fillStyle = '#eef8ff'; g.fill(); g.restore();
    g.beginPath(); g.ellipse(r * 0.05, r * 0.35, r * 0.25, r * 0.08, 0.7, 0, TAU); gloss(g, 0, r * 0.35, r * 0.2, col, { spec: false });
    eye(g, r * 0.62, -r * 0.12, r * 0.12, 0.6, 0, 0, o.happy); smile(g, r * 1.0, r * 0.12, r * 0.12, o.open); blush(g, r * 0.6, r * 0.12, r * 0.1);
  });
}

export function angelfish(x, y, r, o = {}) {
  place(x, y, o, g => {
    const col = o.col || '#ffd23a', fin = mix(col, '#ff8a00', 0.3);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(r * 0.3, s * r * 0.5); g.quadraticCurveTo(-r * 0.1, s * r * 1.5, -r * 0.75, s * r * 1.35); g.quadraticCurveTo(-r * 0.35, s * r * 0.8, -r * 0.45, s * r * 0.3); g.closePath(); gloss(g, -r * 0.2, s * r * 0.85, r * 0.5, fin, { spec: false }); }
    g.beginPath(); g.moveTo(-r * 0.55, 0); g.lineTo(-r * 1.0, -r * 0.35); g.quadraticCurveTo(-r * 0.85, 0, -r * 1.0, r * 0.35); g.closePath(); gloss(g, -r * 0.8, 0, r * 0.3, fin, { spec: false });
    g.beginPath(); g.ellipse(0, 0, r * 0.68, r * 0.62, 0, 0, TAU); gloss(g, 0, 0, r * 0.68, col);
    g.save(); g.beginPath(); g.ellipse(0, 0, r * 0.68, r * 0.62, 0, 0, TAU); g.clip(); for (const sx of [-0.32, 0.05]) { g.fillStyle = o.stripe || '#1a3a8a'; g.beginPath(); g.ellipse(sx * r, 0, r * 0.08, r * 0.8, 0, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(-r * 0.15, -r * 0.4, r * 0.3, r * 0.1, -0.3, 0, TAU); g.fill(); g.restore();
    eye(g, r * 0.32, -r * 0.1, r * 0.17, 0.5, 0, 0, o.happy); smile(g, r * 0.56, r * 0.2, r * 0.08); blush(g, r * 0.25, r * 0.18, r * 0.1);
  });
}

export function pearl(x, y, r, col = '#ffffff') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y, r * 3, col, 0.5); ctx.restore(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); gloss(ctx, x, y, r, col, { lw: 0.12, line: '#3a5aa0' }); sparkle(x + r, y - r, r * 0.8, 1); }


export function chest(x, y, r, open = true) {
  const g = ctx; g.save();
  g.save(); g.globalCompositeOperation = 'lighter'; glow(x, y - r * 0.5, r * 2.4, '#ffe680', 0.6); g.restore();
  shadow(x, y + r * 0.05, r * 1.2, r * 0.25, 0.4);
  if (!open) {
    g.beginPath(); rr(g, x - r * 0.95, y - r * 0.8, r * 1.9, r * 0.85, r * 0.15); gloss(g, x, y - r * 0.4, r, '#c86a2e');
    g.beginPath(); g.moveTo(x - r * 1.0, y - r * 0.78); g.quadraticCurveTo(x, y - r * 1.45, x + r * 1.0, y - r * 0.78); g.closePath(); gloss(g, x, y - r * 1.0, r, '#c0602a');
    for (const sx of [-0.55, 0.55]) { g.beginPath(); rr(g, x + sx * r - r * 0.09, y - r * 1.1, r * 0.18, r * 1.15, r * 0.05); gloss(g, x + sx * r, y - r * 0.5, r * 0.3, '#ffcf3a', { spec: false }); }
    g.beginPath(); rr(g, x - r * 0.14, y - r * 0.9, r * 0.28, r * 0.3, r * 0.06); gloss(g, x, y - r * 0.75, r * 0.2, '#ffd65a');
    g.restore(); return;
  }
  // lid (open, tilted back)
  g.beginPath(); rr(g, x - r * 0.95, y - r * 1.55, r * 1.9, r * 0.6, r * 0.3); gloss(g, x, y - r * 1.3, r, '#c0602a', { spec: false });
  g.beginPath(); rr(g, x - r * 0.95, y - r * 0.8, r * 1.9, r * 0.85, r * 0.15); gloss(g, x, y - r * 0.4, r, '#c86a2e');
  for (const sx of [-0.55, 0.55]) { g.beginPath(); rr(g, x + sx * r - r * 0.09, y - r * 0.8, r * 0.18, r * 0.85, r * 0.05); gloss(g, x + sx * r, y - r * 0.4, r * 0.3, '#ffcf3a', { spec: false }); }
  // pearls & gems spilling
  const R = rng(4); for (let i = 0; i < 14; i++) { const px = x + (R() - 0.5) * r * 1.6, py = y - r * 0.85 - R() * r * 0.25; g.beginPath(); g.arc(px, py, r * (0.11 + R() * 0.06), 0, TAU); gloss(g, px, py, r * 0.14, ['#ffffff', '#ff7ab8', '#7af0ff', '#ffe680'][i % 4], { lw: 0.15 }); }
  for (let i = 0; i < 4; i++) sparkle(x + (R() - 0.5) * r * 2, y - r * (1 + R()), (12 + R() * 14) * u, 1, '#fff6c0');
  g.restore();
}

export function note(x, y, s, col = '#ffffff') {
  const g = ctx; g.save(); g.translate(x, y); g.rotate(-0.15); g.fillStyle = col; g.strokeStyle = '#0b2a6a'; g.lineWidth = 4 * s;
  g.beginPath(); g.ellipse(0, 0, 14 * s, 10 * s, -0.4, 0, TAU); g.fill(); g.stroke(); g.fillRect(10 * s, -46 * s, 5 * s, 46 * s); g.strokeRect(10 * s, -46 * s, 5 * s, 46 * s);
  g.beginPath(); g.moveTo(15 * s, -46 * s); g.quadraticCurveTo(34 * s, -36 * s, 28 * s, -18 * s); g.lineWidth = 6 * s; g.strokeStyle = col; g.stroke(); g.restore();
}

export function hearts(x, y, n, s, seed) { const R = rng(seed); for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (R() - 0.5) * 2.4, d = (60 + R() * 90) * s; sticker(R() < 0.6 ? 'heart' : 'star', x + Math.cos(a) * d, y + Math.sin(a) * d, (16 + R() * 16) * s, (R() - 0.5) * 0.6, R() < 0.5 ? '#ff5c9a' : undefined); } }
