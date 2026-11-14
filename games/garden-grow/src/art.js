// Every picture in the garden, painted in code and baked into sprites. Art is
// drawn in "units" around an anchor at (0, 0); setScale() says how many device
// pixels a unit is, and the cache is rebuilt when that changes (a resize).
// blit() draws a sprite at CSS-pixel coordinates on a context whose base
// transform is the device pixel ratio.
import { TAU, ctx, use, layer, mix, rng, gloss, circ, ell, face, heartPath, starPath, sticker, glow, rr } from './draw.js';

let M = 1, PS = 1;
const cache = new Map();
export function setScale(ps, dpr) { const m = ps * dpr; if (Math.abs(m - M) > 1e-6 || PS !== ps) { M = m; PS = ps; cache.clear(); } }
export function sprite(key, box, fn) {
  let s = cache.get(key);
  if (!s) {
    const [x0, y0, x1, y1] = box;
    const c = layer((x1 - x0) * M, (y1 - y0) * M), g = c.getContext('2d');
    g.setTransform(M, 0, 0, M, -x0 * M, -y0 * M);
    const prev = ctx; use(g); fn(g); use(prev);
    s = { c, x0, y0, w: x1 - x0, h: y1 - y0 };
    cache.set(key, s);
  }
  return s;
}
export function blit(g, s, x, y, scale = 1, rot = 0, sx = 1, sy = 1, alpha = 1) {
  if (alpha <= 0 || scale <= 0) return;
  g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.scale(scale * sx * PS, scale * sy * PS);
  if (alpha < 1) g.globalAlpha *= alpha;
  g.drawImage(s.c, s.x0, s.y0, s.w, s.h);
  g.restore();
}

export const PET = { pink: '#ff5fa8', red: '#ff3d4f', purple: '#a55bff', orange: '#ff8a1f', blue: '#3fa9ff', yellow: '#ffd21f', white: '#fff4fb' };
export const HEAD_R = 46;

// ---------- plants ----------
export function head(kind, color) {
  const col = PET[color] || color, r = HEAD_R;
  return sprite(`head:${kind}:${color}`, [-118, -118, 118, 118], () => {
    if (kind === 'sunflower') {
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + 0.1, px = Math.cos(a) * r * 1.45, py = Math.sin(a) * r * 1.45; gloss(ell(px, py, r * 0.62, r * 0.27, a), px, py, r * 0.55, '#ffcc12', { shadow: false, spec: false, line: '#e07a00' }); }
      gloss(circ(0, 0, r * 1.05), 0, 0, r * 1.05, '#9a4d1a', { line: '#4a200a' });
      const R = rng(4); ctx.fillStyle = 'rgba(60,20,0,0.35)'; for (let i = 0; i < 26; i++) { const a = R() * TAU, d = R() * r * 0.95; ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2.2, 0, TAU); ctx.fill(); }
    } else if (kind === 'tulip') {
      const pw = r * 1.2;
      const p = g => { g.beginPath(); g.moveTo(-pw, -pw * 0.9); g.lineTo(-pw * 0.5, -pw * 0.35); g.lineTo(0, -pw * 1.1); g.lineTo(pw * 0.5, -pw * 0.35); g.lineTo(pw, -pw * 0.9); g.quadraticCurveTo(pw * 1.15, pw * 0.9, 0, pw * 0.85); g.quadraticCurveTo(-pw * 1.15, pw * 0.9, -pw, -pw * 0.9); g.closePath(); };
      gloss(p, 0, 0, pw, col);
    } else if (kind === 'puff') {
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, px = Math.cos(a) * r * 0.95, py = Math.sin(a) * r * 0.95; gloss(circ(px, py, r * 0.55), px, py, r * 0.55, col, { shadow: false }); }
      gloss(circ(0, 0, r * 0.95), 0, 0, r * 0.95, mix(col, '#ffffff', 0.25));
    } else { // daisy
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, px = Math.cos(a) * r * 1.12, py = Math.sin(a) * r * 1.12; gloss(ell(px, py, r * 0.72, r * 0.44, a), px, py, r * 0.62, col, { shadow: i === 0 }); }
      gloss(circ(0, 0, r * 0.78), 0, 0, r * 0.78, '#ffd21f', { line: '#c97400' });
    }
  });
}
// where the face sits on each head, and how big (in units)
export const FACE_AT = { daisy: [0, 0, 33], tulip: [0, 8, 39], puff: [0, 0, 37], sunflower: [0, 0, 41], carrot: [0, 26, 26] };
export function faceSprite(mood) { return sprite(`face:${mood}`, [-46, -46, 46, 46], () => face(0, 0, 40, mood)); }
export function drawFace(g, x, y, r, mood, rot = 0) { blit(g, faceSprite(mood), x, y, r / 40, rot); }

export function leaf() {
  return sprite('leaf', [-4, -32, 76, 32], () => {
    const len = 70;
    const p = g => { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0); g.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0); g.closePath(); };
    gloss(p, len * 0.5, 0, len * 0.45, '#3cc84a', { shadow: false });
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = len * 0.04; ctx.beginPath(); ctx.moveTo(len * 0.1, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.05, len * 0.85, 0); ctx.stroke();
  });
}
export function sproutHead() {
  return sprite('sprout', [-76, -48, 76, 36], () => {
    for (const s of [-1, 1]) { ctx.save(); ctx.rotate(s < 0 ? Math.PI + 0.55 : -0.55); ctx.drawImage(leaf().c, -4, -32, 80, 64); ctx.restore(); }
    gloss(circ(0, 0, 27), 0, 0, 27, '#6fe36a');
  });
}
export function bud(color) {
  const col = PET[color] || color;
  return sprite(`bud:${color}`, [-44, -70, 44, 34], () => {
    const p = g => { g.beginPath(); g.moveTo(0, -62); g.bezierCurveTo(26, -42, 34, -10, 26, 6); g.quadraticCurveTo(0, 22, -26, 6); g.bezierCurveTo(-34, -10, -26, -42, 0, -62); g.closePath(); };
    gloss(p, 0, -22, 36, col);
    for (const s of [-1, 1]) gloss(ell(s * 16, 10, 20, 10, s * 0.6), s * 16, 10, 18, '#3cc84a', { shadow: false, spec: false });
    gloss(circ(0, 16, 12), 0, 16, 12, '#4bd458', { shadow: false, spec: false });
  });
}
export function carrot() {
  return sprite('carrot', [-40, -10, 40, 120], () => {
    const p = g => { g.beginPath(); g.moveTo(-34, 4); g.quadraticCurveTo(-36, -6, -20, -6); g.lineTo(20, -6); g.quadraticCurveTo(36, -6, 34, 4); g.quadraticCurveTo(26, 70, 4, 112); g.quadraticCurveTo(0, 116, -4, 112); g.quadraticCurveTo(-26, 70, -34, 4); g.closePath(); };
    gloss(p, 0, 34, 50, '#ff8a1f', { line: '#a84800' });
    ctx.strokeStyle = 'rgba(150,60,0,0.55)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const [y, w] of [[54, 12], [74, 9], [92, 6]]) { ctx.beginPath(); ctx.moveTo(-w - 8, y); ctx.lineTo(-8, y + 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(w + 4, y - 8); ctx.lineTo(4, y - 6); ctx.stroke(); }
  });
}
export function carrotTop() {
  return sprite('carrotTop', [-60, -96, 60, 4], () => {
    for (const [a, l] of [[-2.1, 80], [-1.57, 92], [-1.0, 80], [-2.5, 60], [-0.65, 60]]) { ctx.save(); ctx.rotate(a); ctx.drawImage(leaf().c, -4, -24, l * 1.08, 48); ctx.restore(); }
  });
}
export function seed() { return sprite('seed', [-22, -28, 22, 28], () => gloss(ell(0, 0, 16, 22), 0, 0, 20, '#c9822e', { shadow: false })); }
export function drop() {
  return sprite('drop', [-20, -28, 20, 28], () => {
    const p = g => { g.beginPath(); g.moveTo(0, -24); g.bezierCurveTo(4, -14, 16, -2, 16, 8); g.arc(0, 8, 16, 0, Math.PI); g.bezierCurveTo(-16, -2, -4, -14, 0, -24); g.closePath(); };
    gloss(p, 0, 2, 18, '#3fb6ff', { shadow: false, line: '#1468b8' });
  });
}
export function soil(rx, ry) {
  return sprite(`soil:${rx}:${ry}`, [-rx - 8, -ry - 8, rx + 8, ry + 16], () => {
    gloss(ell(0, 0, rx, ry), 0, 0, Math.max(rx, ry), '#8a4b26', { line: '#4a2210', spec: false });
    ctx.fillStyle = 'rgba(255,220,180,0.35)'; ctx.beginPath(); ctx.ellipse(-rx * 0.35, -ry * 0.45, rx * 0.3, ry * 0.12, -0.1, 0, TAU); ctx.fill();
    const R = rng(rx * 7 | 0); for (let i = 0; i < 9; i++) { ctx.fillStyle = 'rgba(60,25,8,0.35)'; ctx.beginPath(); ctx.arc((R() - 0.5) * rx * 1.4, (R() - 0.3) * ry * 0.8, 3 + R() * 4, 0, TAU); ctx.fill(); }
  });
}
export function hole() { return sprite('hole', [-34, -14, 34, 14], () => { ctx.fillStyle = '#3a1806'; ctx.beginPath(); ctx.ellipse(0, 0, 30, 10, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,200,150,0.25)'; ctx.beginPath(); ctx.ellipse(0, 6, 26, 4, 0, 0, Math.PI); ctx.fill(); }); }
export function wildflower(col) {
  return sprite(`wild:${col}`, [-20, -20, 20, 20], () => {
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU, x = Math.cos(a) * 9, y = Math.sin(a) * 9; gloss(circ(x, y, 7.5), x, y, 7.5, col, { shadow: false, lw: 1.4 }); }
    gloss(circ(0, 0, 6), 0, 0, 6, '#ffd21f', { shadow: false, line: '#c97400', lw: 1.2 });
  });
}
export function partyHat(col = '#ff5fa8') {
  return sprite(`hat:${col}`, [-48, -104, 48, 26], () => {
    gloss(g => { g.beginPath(); g.moveTo(0, -84); g.lineTo(40, 18); g.quadraticCurveTo(0, 28, -40, 18); g.closePath(); }, 0, -18, 50, col);
    ctx.save(); ctx.beginPath(); ctx.moveTo(0, -84); ctx.lineTo(40, 18); ctx.lineTo(-40, 18); ctx.closePath(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; for (const y of [-40, -6]) { ctx.beginPath(); ctx.arc(-6, y, 7, 0, TAU); ctx.arc(14, y + 14, 6, 0, TAU); ctx.fill(); }
    ctx.restore();
    gloss(circ(0, -88, 14), 0, -88, 14, '#ffd21f', { shadow: false });
  });
}

// ---------- sky ----------
export function sunRays() {
  return sprite('sunRays', [-128, -128, 128, 128], () => {
    const r = 70;
    for (let i = 0; i < 12; i++) {
      ctx.save(); ctx.rotate(i / 12 * TAU);
      ctx.beginPath(); ctx.moveTo(-r * 0.22, -r * 1.05); ctx.quadraticCurveTo(0, -r * 1.75, r * 0.22, -r * 1.05); ctx.closePath();
      const gr = ctx.createLinearGradient(0, -r, 0, -r * 1.7); gr.addColorStop(0, '#ffb000'); gr.addColorStop(1, '#ffe46a');
      ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = r * 0.05; ctx.strokeStyle = '#e08000'; ctx.stroke(); ctx.restore();
    }
  });
}
export function sunBody() { return sprite('sunBody', [-84, -84, 84, 90], () => gloss(circ(0, 0, 70), 0, 0, 70, '#ffc61a', { line: '#d97800' })); }
export function cloud(withFace) {
  return sprite(`cloud:${withFace ? 1 : 0}`, [-100, -78, 100, 70], () => {
    const r = 50, parts = [[0, 0, 1], [-0.9, 0.25, 0.7], [0.95, 0.2, 0.75], [-0.4, -0.3, 0.75], [0.45, -0.35, 0.7]];
    const path = g => { g.beginPath(); for (const [dx, dy, s] of parts) { g.moveTo(dx * r + s * r, dy * r); g.arc(dx * r, dy * r, s * r, 0, TAU); } };
    ctx.save(); ctx.shadowColor = 'rgba(60,110,180,0.25)'; ctx.shadowBlur = r * 0.4; ctx.shadowOffsetY = r * 0.15;
    const gr = ctx.createLinearGradient(0, -r, 0, r); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#cfe6ff');
    path(ctx); ctx.fillStyle = gr; ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(-r * 0.5, -r * 0.55, r * 0.35, r * 0.13, -0.3, 0, TAU); ctx.fill();
  });
}
export function rainCloud() {
  return sprite('rainCloud', [-100, -78, 100, 70], () => {
    const r = 50, parts = [[0, 0, 1], [-0.9, 0.25, 0.7], [0.95, 0.2, 0.75], [-0.4, -0.3, 0.75], [0.45, -0.35, 0.7]];
    const path = g => { g.beginPath(); for (const [dx, dy, s] of parts) { g.moveTo(dx * r + s * r, dy * r); g.arc(dx * r, dy * r, s * r, 0, TAU); } };
    ctx.save(); ctx.shadowColor = 'rgba(40,60,120,0.3)'; ctx.shadowBlur = r * 0.4; ctx.shadowOffsetY = r * 0.15;
    const gr = ctx.createLinearGradient(0, -r, 0, r); gr.addColorStop(0, '#e8f0ff'); gr.addColorStop(1, '#9fb4dc');
    path(ctx); ctx.fillStyle = gr; ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-r * 0.5, -r * 0.55, r * 0.35, r * 0.13, -0.3, 0, TAU); ctx.fill();
  });
}
export function balloon() {
  return sprite('balloon', [-90, -110, 90, 150], () => {
    // ropes
    ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 3;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 40, 44); ctx.lineTo(s * 24, 100); ctx.stroke(); }
    // envelope with stripes
    const env = g => { g.beginPath(); g.moveTo(0, 70); g.bezierCurveTo(-30, 54, -82, 10, -80, -30); g.bezierCurveTo(-78, -86, -36, -104, 0, -104); g.bezierCurveTo(36, -104, 78, -86, 80, -30); g.bezierCurveTo(82, 10, 30, 54, 0, 70); g.closePath(); };
    gloss(env, 0, -30, 82, '#ff5f8f');
    ctx.save(); env(ctx); ctx.clip();
    const cols = ['#ffd21f', '#3fa9ff', '#4bd458'];
    for (let i = -2; i <= 2; i++) { if (i % 2 === 0) continue; ctx.fillStyle = cols[(i + 3) % 3]; ctx.beginPath(); ctx.ellipse(i * 34, -20, 15, 100, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-90, -110, 180, 50);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(-36, -70, 22, 10, -0.6, 0, TAU); ctx.fill();
    env(ctx); ctx.lineWidth = 5; ctx.strokeStyle = '#a0204e'; ctx.stroke();
    // teddy in the basket
    gloss(circ(-28, 86, 11), -28, 86, 11, '#c98a4a', { shadow: false });
    gloss(circ(-6, 86, 11), -6, 86, 11, '#c98a4a', { shadow: false });
    gloss(circ(-17, 96, 20), -17, 96, 20, '#c98a4a', { shadow: false });
    face(-17, 98, 16, 'happy');
    gloss(g => rr(g, -34, 104, 68, 40, 10), 0, 124, 36, '#c8792e', { line: '#6a3a10' });
    ctx.strokeStyle = 'rgba(90,40,0,0.5)'; ctx.lineWidth = 3; for (let x = -24; x <= 24; x += 12) { ctx.beginPath(); ctx.moveTo(x, 106); ctx.lineTo(x, 142); ctx.stroke(); }
  });
}
export function apple() { return sprite('apple', [-24, -30, 24, 24], () => { gloss(circ(0, 0, 17), 0, 0, 17, '#ff3b4a', { shadow: false }); ctx.strokeStyle = '#6a3a10'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(3, -24); ctx.stroke(); gloss(ell(10, -20, 8, 4, -0.4), 10, -20, 7, '#3cc84a', { shadow: false, spec: false, lw: 1.5 }); }); }

// ---------- visitors ----------
export function wing(c1, c2) {
  return sprite(`wing:${c1}:${c2}`, [-4, -60, 76, 52], () => {
    gloss(ell(34, -22, 36, 30, -0.4), 34, -22, 34, c1, { shadow: false });
    gloss(ell(26, 22, 24, 20, 0.5), 26, 22, 22, c2, { shadow: false });
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(40, -20, 9, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(28, 24, 5, 0, TAU); ctx.fill();
  });
}
export function bflyBody() {
  return sprite('bflyBody', [-28, -64, 28, 40], () => {
    ctx.strokeStyle = '#2a0f3e'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 4, -30); ctx.quadraticCurveTo(sd * 16, -54, sd * 22, -56); ctx.stroke(); ctx.fillStyle = '#2a0f3e'; ctx.beginPath(); ctx.arc(sd * 22, -56, 4, 0, TAU); ctx.fill(); }
    gloss(ell(0, 0, 11, 34), 0, 0, 22, '#4a2a6a', { shadow: false });
    face(0, -18, 13, 'happy');
  });
}
export function beeBody() {
  return sprite('beeBody', [-56, -44, 56, 44], () => {
    const body = ell(0, 0, 46, 34);
    gloss(body, 0, 0, 44, '#ffd21f', { line: '#8a5a00' });
    ctx.save(); body(ctx); ctx.clip(); ctx.fillStyle = '#3a2410'; for (const xx of [-2, 22]) ctx.fillRect(xx, -40, 11, 80); ctx.restore();
    body(ctx); ctx.lineWidth = 4; ctx.strokeStyle = '#8a5a00'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-14, -18, 14, 6, -0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2410'; ctx.beginPath(); ctx.moveTo(44, -4); ctx.lineTo(56, 0); ctx.lineTo(44, 4); ctx.fill();
    face(-20, 2, 19, 'happy');
  });
}
export function beeWing() { return sprite('beeWing', [-22, -32, 22, 4], () => { ctx.globalAlpha = 0.8; gloss(ell(0, -14, 17, 15), 0, -14, 17, '#e4f6ff', { shadow: false, line: '#7ab7d9' }); }); }
export function ladybug(open = false) {
  return sprite(`ladybug:${open ? 1 : 0}`, [-56, -50, 56, 42], () => {
    if (open) for (const s of [-1, 1]) { ctx.globalAlpha = 0.7; gloss(ell(s * 30, -6, 26, 14, s * -0.5), s * 30, -6, 24, '#e4f6ff', { shadow: false, line: '#7ab7d9' }); ctx.globalAlpha = 1; }
    gloss(circ(0, -26, 20), 0, -26, 20, '#3a2a3a', { shadow: false });
    gloss(ell(0, 6, 34, 30), 0, 6, 34, '#ff2f3f', { line: '#7a0010' });
    ctx.strokeStyle = '#3a0010'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, 36); ctx.stroke();
    ctx.fillStyle = '#2a0a14'; for (const [dx, dy] of [[-15, 0], [15, 0], [-12, 20], [12, 20]]) { ctx.beginPath(); ctx.arc(dx, dy, 6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(-12, -8, 9, 4, -0.5, 0, TAU); ctx.fill();
    face(0, -26, 15, 'happy');
  });
}
export function snailBody() {
  return sprite('snailBody', [-90, -86, 56, 14], () => {
    ctx.strokeStyle = '#b87a4a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const dx of [-60, -48]) { ctx.beginPath(); ctx.moveTo(dx, -64); ctx.lineTo(dx - 6, -82); ctx.stroke(); ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.arc(dx - 6, -82, 4, 0, TAU); ctx.fill(); }
    const body = g => { g.beginPath(); g.moveTo(-70, 0); g.quadraticCurveTo(-80, -40, -55, -70); g.quadraticCurveTo(-38, -78, -40, -30); g.lineTo(40, -8); g.quadraticCurveTo(60, 0, 40, 6); g.closePath(); };
    gloss(body, -20, -20, 50, '#ffd2a8', { line: '#b87a4a' });
    face(-56, -48, 16, 'happy');
  });
}
export function snailShell() {
  return sprite('snailShell', [-52, -52, 52, 56], () => {
    gloss(circ(0, 0, 46), 0, 0, 46, '#ff8a1f', { line: '#9a3e00' });
    ctx.strokeStyle = 'rgba(120,40,0,0.6)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < 60; i++) { const a = i / 60 * TAU * 2.2, q = 34 * (1 - i / 70); ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); } ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-16, -26, 12, 6, -0.6, 0, TAU); ctx.fill();
  });
}
export function birdBody(col = '#3fa9ff') {
  return sprite(`bird:${col}`, [-56, -52, 60, 40], () => {
    ctx.strokeStyle = '#e07a00'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (const dx of [-8, 8]) { ctx.beginPath(); ctx.moveTo(dx, 26); ctx.lineTo(dx, 38); ctx.lineTo(dx + 7, 38); ctx.stroke(); }
    gloss(g => { g.beginPath(); g.moveTo(-40, 0); g.lineTo(-56, -14); g.lineTo(-52, 6); g.closePath(); }, -48, -2, 12, mix(col, '#000000', 0.15), { shadow: false, spec: false });
    gloss(ell(0, 0, 40, 32), 0, 0, 40, col);
    gloss(ell(4, 12, 24, 16), 4, 12, 22, '#fff1d6', { shadow: false, line: null, spec: false });
    gloss(g => { g.beginPath(); g.moveTo(34, -10); g.lineTo(56, -2); g.lineTo(34, 6); g.closePath(); }, 42, -2, 12, '#ffb21f', { shadow: false, spec: false });
    face(16, -10, 18, 'happy');
    gloss(circ(-4, -34, 8), -4, -34, 8, mix(col, '#ffffff', 0.2), { shadow: false, spec: false });
  });
}
export function birdWing(col = '#3fa9ff') { return sprite(`birdWing:${col}`, [-36, -16, 8, 16], () => gloss(ell(-14, 0, 22, 12, 0.2), -14, 0, 20, mix(col, '#000000', 0.12), { shadow: false })); }
export function bunny() {
  return sprite('bunny', [-62, -150, 62, 10], () => {
    const col = '#f4ecf6';
    for (const s of [-1, 1]) { gloss(ell(s * 18, -112, 13, 36, s * 0.15), s * 18, -112, 30, col, { shadow: false, line: '#a08aa8' }); ctx.fillStyle = '#ffb0c8'; ctx.beginPath(); ctx.ellipse(s * 18, -108, 6, 24, s * 0.15, 0, TAU); ctx.fill(); }
    gloss(ell(0, -28, 46, 30), 0, -28, 44, col, { line: '#a08aa8' });
    gloss(circ(-40, -24, 12), -40, -24, 12, '#ffffff', { shadow: false, line: '#a08aa8', spec: false });
    gloss(circ(0, -70, 36), 0, -70, 36, col, { line: '#a08aa8' });
    for (const s of [-1, 1]) gloss(ell(s * 22, -4, 14, 8), s * 22, -4, 13, col, { shadow: false, line: '#a08aa8', spec: false });
    face(0, -68, 30, 'happy');
    ctx.fillStyle = '#ff7fa8'; ctx.beginPath(); ctx.ellipse(0, -66, 5, 3.5, 0, 0, TAU); ctx.fill();
  });
}
export function frog() {
  return sprite('frog', [-60, -84, 60, 14], () => {
    const col = '#5ad04e';
    for (const s of [-1, 1]) gloss(ell(s * 32, -6, 22, 12), s * 32, -6, 20, col, { shadow: false, spec: false });
    gloss(ell(0, -30, 46, 32), 0, -30, 46, col, { line: '#1f6a1a' });
    for (const s of [-1, 1]) { gloss(circ(s * 22, -62, 17), s * 22, -62, 17, col, { line: '#1f6a1a', spec: false }); gloss(circ(s * 22, -63, 11), s * 22, -63, 11, '#ffffff', { shadow: false, line: '#2a3a2a', lw: 1.5, spec: false }); ctx.fillStyle = '#1a1a2a'; ctx.beginPath(); ctx.arc(s * 22 + 2, -62, 6.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * 22, -65, 2.5, 0, TAU); ctx.fill(); }
    for (const s of [-1, 1]) glow(s * 30, -26, 12, '#ff5f8f', 0.6);
    ctx.strokeStyle = '#1f4a1a'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-20, -30); ctx.quadraticCurveTo(0, -14, 20, -30); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(-20, -46, 12, 5, -0.4, 0, TAU); ctx.fill();
  });
}
export function wormHead() { return sprite('wormHead', [-24, -24, 24, 24], () => { gloss(circ(0, 0, 19), 0, 0, 19, '#ff9fb8', { shadow: false, line: '#b8506e' }); face(0, 2, 16, 'happy'); }); }
export function wormSeg() { return sprite('wormSeg', [-20, -20, 20, 20], () => gloss(circ(0, 0, 15), 0, 0, 15, '#ff8fae', { shadow: false, line: '#b8506e', spec: false })); }
export function bubble() {
  return sprite('bubble', [-52, -52, 52, 52], () => {
    const r = 48;
    const gr = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r); gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.8, 'rgba(180,230,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0.6)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5; ctx.stroke();
    const rb = ctx.createLinearGradient(-r, r, r, -r); rb.addColorStop(0, 'rgba(255,120,200,0.35)'); rb.addColorStop(0.5, 'rgba(120,255,220,0.3)'); rb.addColorStop(1, 'rgba(255,240,120,0.35)');
    ctx.strokeStyle = rb; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, r - 4, 0.3, 2.6); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.2, r * 0.1, -0.7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.35, r * 0.4, r * 0.06, 0, TAU); ctx.fill();
  });
}
export function mushroom() {
  return sprite('mushroom', [-56, -86, 56, 8], () => {
    gloss(g => rr(g, -18, -44, 36, 46, 14), 0, -20, 26, '#fff4e4', { line: '#b89a7a' });
    const cap = g => { g.beginPath(); g.moveTo(-52, -36); g.bezierCurveTo(-52, -92, 52, -92, 52, -36); g.quadraticCurveTo(0, -24, -52, -36); g.closePath(); };
    gloss(cap, 0, -56, 50, '#ff3d4f');
    ctx.fillStyle = '#ffffff'; for (const [x, y, r] of [[-26, -54, 8], [4, -70, 10], [28, -50, 7], [-4, -46, 5]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    face(0, -14, 13, 'happy');
  });
}
export function bush() {
  return sprite('bush', [-110, -110, 110, 14], () => {
    for (const [x, y, r] of [[-60, -40, 48], [60, -38, 50], [0, -66, 60], [-30, -24, 46], [34, -22, 46]]) gloss(circ(x, y, r), x, y, r, '#33b24a', { line: '#1a6a2a' });
    const R = rng(9); for (let i = 0; i < 6; i++) { const x = (R() - 0.5) * 150, y = -20 - R() * 80; gloss(circ(x, y, 7), x, y, 7, i % 2 ? '#ff5fa8' : '#ffffff', { shadow: false, lw: 1.4 }); }
  });
}
export function can(col = '#3fa9ff') {
  return sprite(`can:${col}`, [-112, -116, 196, 92], () => {
    ctx.save(); ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(150, -50); ctx.lineTo(158, -36); ctx.lineTo(60, 40); ctx.closePath();
    const sg = ctx.createLinearGradient(0, -50, 0, 40); sg.addColorStop(0, mix(col, '#ffffff', 0.4)); sg.addColorStop(1, mix(col, '#003060', 0.3));
    ctx.fillStyle = sg; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = mix(col, '#001020', 0.55); ctx.stroke(); ctx.restore();
    gloss(ell(160, -46, 18, 26, -0.9), 160, -46, 24, '#ffd21f', { shadow: false });
    ctx.lineWidth = 18; ctx.strokeStyle = mix(col, '#001020', 0.55); ctx.beginPath(); ctx.arc(-10, -40, 62, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.lineWidth = 11; ctx.strokeStyle = col; ctx.stroke();
    gloss(g => rr(g, -80, -45, 150, 120, 40), -5, 15, 85, col);
    heartPath(ctx, -5, 18, 26); ctx.fillStyle = '#fff'; ctx.fill();
  });
}
export const SPOUT = [160, -46]; // where the water comes out, in can units

// ---------- interface ----------
export function button(kind, active) {
  return sprite(`btn:${kind}:${active ? 1 : 0}`, [-64, -64, 64, 70], () => {
    gloss(circ(0, 0, 54), 0, 0, 54, active ? '#ffe14a' : '#ffffff', { line: active ? '#d98a00' : '#b9a6d6', lw: 5 });
    if (kind === 'seed') {
      gloss(g => rr(g, -26, -22, 52, 54, 10), 0, 4, 32, '#ffb35a', { shadow: false, line: '#a8641a' });
      gloss(circ(0, 6, 15), 0, 6, 15, '#ff5fa8', { shadow: false, spec: false, lw: 2 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; gloss(circ(Math.cos(a) * 12, 6 + Math.sin(a) * 12, 6), Math.cos(a) * 12, 6 + Math.sin(a) * 12, 6, '#ff5fa8', { shadow: false, spec: false, lw: 1.5 }); }
      gloss(circ(0, 6, 6), 0, 6, 6, '#ffd21f', { shadow: false, spec: false, lw: 1.5 });
      for (const [x, y, a] of [[-14, -34, -0.5], [2, -40, 0.1], [17, -32, 0.6]]) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(0.5, 0.5); ctx.drawImage(seed().c, -22, -28, 44, 56); ctx.restore(); }
    } else {
      ctx.save(); ctx.scale(0.3, 0.3); ctx.translate(-30, 30); ctx.drawImage(can().c, -112, -116, 308, 208); ctx.restore();
      for (const [x, y] of [[30, 22], [38, 36]]) { ctx.save(); ctx.translate(x, y); ctx.scale(0.35, 0.35); ctx.drawImage(drop().c, -20, -28, 40, 56); ctx.restore(); }
    }
  });
}
export function playButton() {
  return sprite('play', [-150, -220, 150, 150], () => {
    gloss(circ(0, 0, 112), 0, 0, 112, '#4bd458', { line: '#1d7a2a', lw: 9 });
    ctx.save(); ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,60,0,0.4)'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(-32, -48); ctx.lineTo(54, 0); ctx.lineTo(-32, 48); ctx.closePath(); ctx.lineJoin = 'round'; ctx.lineWidth = 16; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.fill(); ctx.restore();
  });
}
export function hand() {
  return sprite('hand', [-48, -14, 48, 116], () => {
    gloss(g => rr(g, -16, -10, 32, 70, 16), 0, 20, 36, '#ffd9b8', { line: '#c98a5a' });
    gloss(g => rr(g, -34, 40, 68, 70, 30), 0, 70, 44, '#ffd9b8', { line: '#c98a5a', spec: false });
    gloss(g => rr(g, -16, -10, 32, 70, 16), 0, 20, 36, '#ffd9b8', { line: '#c98a5a', shadow: false });
  });
}
// ---------- little things for the effects ----------
export function heart(col) { return sprite(`heart:${col || ''}`, [-28, -28, 28, 28], () => sticker('heart', 0, 0, 20, 0, col)); }
export function star(col) { return sprite(`star:${col || ''}`, [-28, -28, 28, 28], () => sticker('star', 0, 0, 22, 0, col)); }
export function note(col) {
  return sprite(`note:${col}`, [-24, -40, 24, 24], () => {
    ctx.lineWidth = 5; ctx.strokeStyle = mix(col, '#200020', 0.5); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(8, -32); ctx.quadraticCurveTo(14, -22, 22, -20); ctx.stroke();
    gloss(ell(-2, 10, 12, 9, -0.4), -2, 10, 12, col, { shadow: false, lw: 2.5 });
  });
}
export function fluff() {
  return sprite('fluff', [-26, -30, 26, 30], () => {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.28; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(Math.cos(a) * 22, -4 + Math.sin(a) * 22); ctx.stroke(); }
    ctx.strokeStyle = '#d8c8a8'; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 22); ctx.stroke();
    gloss(ell(0, 24, 3, 5), 0, 24, 5, '#a07a4a', { shadow: false, spec: false, lw: 1 });
  });
}
export function petal(col) { return sprite(`petal:${col}`, [-22, -14, 22, 14], () => gloss(ell(0, 0, 18, 10), 0, 0, 16, PET[col] || col, { shadow: false, lw: 2 })); }
export function glossDot(col) { return sprite(`dot:${col}`, [-14, -14, 14, 14], () => gloss(circ(0, 0, 10), 0, 0, 10, col, { shadow: false, lw: 2 })); }
export function starShape(col) { return sprite(`starShape:${col}`, [-24, -24, 24, 24], () => { starPath(ctx, 0, 0, 20, 0, 5, 0.5); ctx.fillStyle = col; ctx.fill(); }); }
