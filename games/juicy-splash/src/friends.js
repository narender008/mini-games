// The friends and treats of Juicy Splash: kawaii faces for the fruit, the
// bunny who peeks from her bush and munches slices, the chick who catches
// juice in his beak, soap bubbles, candies, lollipops, party balloons and
// music notes. All painted with Canvas 2D paths into the context set by
// use() (draw.js); sizes are radii in CSS pixels.
import { ctx, TAU, rng, mix, rgba, rr, blob, sparkle } from './draw.js';


// Extra candy gloss on top of a fruit: big soft sheen + rim light + sparkle.
export function candyGloss(x, y, r, rot = 0) {
  const g = ctx; g.save(); g.translate(x, y); g.rotate(rot);
  g.save(); g.beginPath(); g.arc(0, 0, r * 0.98, 0, TAU); g.clip();
  const sh = g.createLinearGradient(-r, -r, r * 0.2, r * 0.2); sh.addColorStop(0, 'rgba(255,255,255,0.55)'); sh.addColorStop(0.45, 'rgba(255,255,255,0.08)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sh; g.beginPath(); g.ellipse(-r * 0.25, -r * 0.35, r * 0.75, r * 0.5, -0.6, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = r * 0.07; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, r * 0.84, 0.35, 1.25); g.stroke();
  g.restore();
  g.restore();
  sparkle(x - r * 0.35, y - r * 0.55, r * 0.16, 0.95);
}
// Kawaii face on a fruit. mood: happy | wow | giggle | sleepy | yum | wink
export function face(x, y, r, mood = 'happy', look = [0, 0], rot = 0) {
  const g = ctx; g.save(); g.translate(x, y); g.rotate(rot); g.lineCap = 'round'; g.lineJoin = 'round';
  const ex = r * 0.3, ey = -r * 0.02, er = r * 0.17, ink = '#2a0d1e';
  // blush
  g.fillStyle = 'rgba(255,90,130,0.5)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * r * 0.52, r * 0.2, r * 0.15, r * 0.09, 0, 0, TAU); g.fill(); }
  const closed = mood === 'giggle' || mood === 'sleepy';
  for (const s of [-1, 1]) {
    if (closed || (mood === 'wink' && s > 0)) {
      g.strokeStyle = ink; g.lineWidth = r * 0.07; g.beginPath();
      if (mood === 'sleepy') g.arc(s * ex, ey, er * 0.75, 0.15 * Math.PI, 0.85 * Math.PI); else g.arc(s * ex, ey + er * 0.3, er * 0.75, 1.15 * Math.PI, 1.85 * Math.PI);
      g.stroke(); continue;
    }
    const big = mood === 'wow' ? 1.2 : 1;
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(s * ex, ey, er * big, er * 1.2 * big, 0, 0, TAU); g.fill(); g.lineWidth = r * 0.035; g.strokeStyle = ink; g.stroke();
    const pg = g.createRadialGradient(s * ex + look[0] * er * 0.3, ey + look[1] * er * 0.3, 0, s * ex + look[0] * er * 0.3, ey + look[1] * er * 0.3, er * 0.85 * big);
    pg.addColorStop(0, '#5a2a6a'); pg.addColorStop(0.6, '#1e0a22'); pg.addColorStop(1, '#0a0410');
    g.fillStyle = pg; g.beginPath(); g.ellipse(s * ex + look[0] * er * 0.3, ey + look[1] * er * 0.3 + er * 0.1, er * 0.78 * big, er * 0.92 * big, 0, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(s * ex - er * 0.25, ey - er * 0.35, er * 0.32 * big, 0, TAU); g.fill();
    g.beginPath(); g.arc(s * ex + er * 0.3, ey + er * 0.35, er * 0.13 * big, 0, TAU); g.fill();
  }
  const my = r * 0.3;
  g.strokeStyle = ink; g.fillStyle = '#7a1028'; g.lineWidth = r * 0.06;
  if (mood === 'wow') { g.beginPath(); g.ellipse(0, my + r * 0.04, r * 0.11, r * 0.14, 0, 0, TAU); g.fill(); g.stroke(); }
  else if (mood === 'sleepy') { g.beginPath(); g.ellipse(0, my, r * 0.06, r * 0.05, 0, 0, TAU); g.fill(); }
  else if (mood === 'happy' || mood === 'wink') { g.beginPath(); g.arc(0, my - r * 0.1, r * 0.14, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke(); }
  else { // giggle / yum: open D mouth with tongue
    g.beginPath(); g.moveTo(-r * 0.2, my - r * 0.06); g.quadraticCurveTo(0, my + r * 0.36, r * 0.2, my - r * 0.06); g.closePath(); g.fill(); g.stroke();
    g.save(); g.clip(); g.fillStyle = '#ff6f8f'; g.beginPath(); g.ellipse(0, my + r * 0.2, r * 0.13, r * 0.09, 0, 0, TAU); g.fill(); g.restore();
    if (mood === 'yum') { g.fillStyle = '#ff6f8f'; g.strokeStyle = ink; g.lineWidth = r * 0.04; g.beginPath(); g.ellipse(r * 0.12, my + r * 0.04, r * 0.07, r * 0.09, -0.4, 0, Math.PI); g.fill(); }
  }
  g.restore();
}
// floating notes and hearts for giggles
export function note(x, y, s, col = '#ff5c9a', rot = 0) {
  const g = ctx; g.save(); g.translate(x, y); g.rotate(rot); g.lineJoin = 'round';
  const path = () => { g.beginPath(); g.ellipse(-s * 0.3, s * 0.5, s * 0.32, s * 0.24, -0.4, 0, TAU); g.rect(-s * 0.04, -s * 0.6, s * 0.14, s * 1.1); g.moveTo(s * 0.1, -s * 0.6); g.quadraticCurveTo(s * 0.6, -s * 0.4, s * 0.5, s * 0.05); g.quadraticCurveTo(s * 0.4, -s * 0.25, s * 0.1, -s * 0.25); };
  path(); g.lineWidth = s * 0.18; g.strokeStyle = '#fff'; g.stroke(); g.fillStyle = col; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(-s * 0.38, s * 0.42, s * 0.1, s * 0.06, -0.4, 0, TAU); g.fill();
  g.restore();
}
// Soap bubble with an iridescent rim and something inside.
export function bubble(x, y, r, inside) {
  const g = ctx; g.save();
  if (inside) inside(x, y, r * 0.62);
  const b = g.createRadialGradient(x, y, r * 0.6, x, y, r);
  b.addColorStop(0, 'rgba(255,255,255,0.04)'); b.addColorStop(0.8, 'rgba(180,230,255,0.22)'); b.addColorStop(1, 'rgba(255,255,255,0.6)');
  g.fillStyle = b; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  const cols = ['#ff7ad0', '#ffd860', '#7affd8', '#7ab8ff', '#c08aff'];
  g.lineWidth = r * 0.045; g.lineCap = 'round';
  cols.forEach((c, i) => { g.strokeStyle = rgba(c, 0.75); g.beginPath(); g.arc(x, y, r * 0.965, 0.2 + i * 0.32, 0.2 + (i + 1) * 0.32); g.stroke(); });
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = r * 0.025; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(x - r * 0.42, y - r * 0.45, r * 0.22, r * 0.11, -0.75, 0, TAU); g.fill();
  g.beginPath(); g.arc(x + r * 0.5, y + r * 0.42, r * 0.06, 0, TAU); g.fill();
  g.restore();
}
// Wrapped candy and lollipop treats.
export function candy(x, y, r, col, rot = 0) {
  const g = ctx; g.save(); g.translate(x, y); g.rotate(rot); g.lineJoin = 'round';
  g.shadowColor = 'rgba(40,20,60,0.25)'; g.shadowBlur = r * 0.4; g.shadowOffsetY = r * 0.2;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * r * 0.8, 0); g.lineTo(s * r * 1.7, -r * 0.6); g.quadraticCurveTo(s * r * 1.5, 0, s * r * 1.7, r * 0.6); g.closePath(); g.fillStyle = mix(col, '#ffffff', 0.35); g.fill(); g.lineWidth = r * 0.12; g.strokeStyle = mix(col, '#000000', 0.45); g.stroke(); }
  g.shadowColor = 'transparent';
  g.beginPath(); g.ellipse(0, 0, r, r * 0.8, 0, 0, TAU); g.lineWidth = r * 0.14; g.strokeStyle = mix(col, '#000000', 0.45); g.stroke();
  const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r); gr.addColorStop(0, mix(col, '#ffffff', 0.6)); gr.addColorStop(0.5, col); gr.addColorStop(1, mix(col, '#000000', 0.2)); g.fillStyle = gr; g.fill();
  g.save(); g.clip(); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = r * 0.22; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * r * 0.6 - r, -r); g.lineTo(i * r * 0.6 + r, r); g.stroke(); } g.restore();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(-r * 0.4, -r * 0.35, r * 0.25, r * 0.12, -0.6, 0, TAU); g.fill();
  g.restore();
}
export function lolly(x, y, r, rot = 0) {
  const g = ctx; g.save(); g.translate(x, y); g.rotate(rot);
  rr(g, -r * 0.09, 0, r * 0.18, r * 2.1, r * 0.08); g.fillStyle = '#fff'; g.fill(); g.lineWidth = r * 0.06; g.strokeStyle = '#c8a8b8'; g.stroke();
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.lineWidth = r * 0.12; g.strokeStyle = '#8a1050'; g.stroke();
  const cols = ['#ff4f9a', '#ffd23a', '#4fc8ff', '#7ae04a'];
  const sw = g.createRadialGradient(0, 0, 0, 0, 0, r); sw.addColorStop(0, '#fff6fa'); sw.addColorStop(1, '#ff9ac4'); g.fillStyle = sw; g.fill();
  g.save(); g.clip(); for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, 0); for (let t = 0; t <= 1.001; t += 0.05) { const a = i * TAU / 8 + t * 4, rr2 = r * t; g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } for (let t = 1; t >= 0; t -= 0.05) { const a = i * TAU / 8 + 0.38 + t * 4, rr2 = r * t; g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } g.fillStyle = cols[i % 4]; g.fill(); }
  const sh = g.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r); sh.addColorStop(0, 'rgba(255,255,255,0.35)'); sh.addColorStop(1, 'rgba(0,0,0,0.15)'); g.fillStyle = sh; g.fillRect(-r, -r, r * 2, r * 2); g.restore();
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(-r * 0.4, -r * 0.42, r * 0.28, r * 0.13, -0.7, 0, TAU); g.fill();
  g.restore();
}
// Glossy body fill helper
export function glossFill(g, x, y, r, c0, c1, c2) { const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.05, x, y, r * 1.15); gr.addColorStop(0, c0); gr.addColorStop(0.45, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fill(); }
// Bunny friend. mood: happy | munch | cheer | peek. hold: a callback to draw something in its paws.
export function bunny(x, y, s, mood = 'happy', o = {}) {
  const g = ctx, ink = '#4a2a3a'; g.save(); g.translate(x, y); g.rotate(o.rot || 0); g.scale(o.sx || 1, o.sy || 1); g.lineJoin = 'round'; g.lineCap = 'round';
  g.save(); g.shadowColor = 'rgba(40,20,60,0.25)'; g.shadowBlur = s * 0.25; g.shadowOffsetY = s * 0.12;
  // ears
  const ear = (sx, rot) => { g.save(); g.translate(sx * s * 0.35, -s * 0.75); g.rotate(rot); g.beginPath(); g.ellipse(0, -s * 0.5, s * 0.2, s * 0.58, 0, 0, TAU); g.lineWidth = s * 0.06; g.strokeStyle = ink; g.stroke(); glossFill(g, -s * 0.05, -s * 0.6, s * 0.6, '#ffffff', '#f6eef6', '#d8c8dc'); g.beginPath(); g.ellipse(0, -s * 0.45, s * 0.1, s * 0.42, 0, 0, TAU); const pg = g.createLinearGradient(0, -s, 0, 0); pg.addColorStop(0, '#ffb0cc'); pg.addColorStop(1, '#ff7aa8'); g.fillStyle = pg; g.fill(); g.restore(); };
  ear(-1, -0.25 + (o.ear || 0)); ear(1, 0.3 - (o.ear || 0) * 1.5);
  // body
  if (!o.noBody) { g.beginPath(); g.ellipse(0, s * 0.85, s * 0.72, s * 0.62, 0, 0, TAU); g.lineWidth = s * 0.06; g.strokeStyle = ink; g.stroke(); glossFill(g, 0, s * 0.85, s * 0.72, '#ffffff', '#f7f0f8', '#d6c4dc'); g.beginPath(); g.ellipse(0, s * 0.95, s * 0.42, s * 0.38, 0, 0, TAU); g.fillStyle = '#fff8fb'; g.fill(); }
  // head
  g.beginPath(); g.ellipse(0, 0, s * 0.82, s * 0.72, 0, 0, TAU); g.lineWidth = s * 0.06; g.strokeStyle = ink; g.stroke(); glossFill(g, 0, 0, s * 0.82, '#ffffff', '#f8f2f9', '#d8c6de');
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(-s * 0.38, -s * 0.38, s * 0.2, s * 0.09, -0.6, 0, TAU); g.fill();
  // face
  g.fillStyle = 'rgba(255,110,150,0.55)'; for (const k of [-1, 1]) { g.beginPath(); g.ellipse(k * s * 0.5, s * 0.18, s * 0.14, s * 0.09, 0, 0, TAU); g.fill(); }
  for (const k of [-1, 1]) {
    if (mood === 'cheer' || mood === 'munch' || mood === 'chew') { g.strokeStyle = ink; g.lineWidth = s * 0.07; g.beginPath(); g.arc(k * s * 0.28, -s * 0.02, s * 0.11, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); continue; }
    g.fillStyle = '#1e0a22'; g.beginPath(); g.ellipse(k * s * 0.28 + (o.look || 0) * s * 0.05, -s * 0.04, s * 0.11, s * 0.14, 0, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(k * s * 0.28 - s * 0.03, -s * 0.09, s * 0.045, 0, TAU); g.fill(); g.beginPath(); g.arc(k * s * 0.28 + s * 0.04, s * 0.02, s * 0.02, 0, TAU); g.fill();
  }
  g.fillStyle = '#ff6f9a'; g.beginPath(); g.ellipse(0, s * 0.12, s * 0.08, s * 0.055, 0, 0, TAU); g.fill();
  g.strokeStyle = ink; g.lineWidth = s * 0.045;
  if (mood === 'cheer' || mood === 'munch' || mood === 'wow') { g.beginPath(); g.moveTo(-s * 0.16, s * 0.2); g.quadraticCurveTo(0, s * 0.52, s * 0.16, s * 0.2); g.closePath(); g.fillStyle = '#7a1028'; g.fill(); g.stroke(); g.fillStyle = '#fff'; g.fillRect(-s * 0.06, s * 0.2, s * 0.12, s * 0.07); }
  else { g.beginPath(); g.moveTo(0, s * 0.17); g.lineTo(0, s * 0.24); g.arc(-s * 0.07, s * 0.24, s * 0.07, 0, Math.PI * 0.9); g.moveTo(0, s * 0.24); g.arc(s * 0.07, s * 0.24, s * 0.07, Math.PI, Math.PI * 0.1, true); g.stroke(); }
  if (o.hold) o.hold();
  // paws
  if (o.paws !== false) for (const k of [-1, 1]) { g.beginPath(); g.ellipse(k * s * (o.pawX || 0.3), s * (o.pawY || 0.55), s * 0.16, s * 0.13, 0, 0, TAU); g.lineWidth = s * 0.05; g.strokeStyle = ink; g.stroke(); glossFill(g, k * s * 0.3, s * 0.55, s * 0.16, '#fff', '#f6eef6', '#dccbe0'); }
  g.restore();
}
// Fluffy chick friend.
export function chick(x, y, s, mood = 'happy', o = {}) {
  const g = ctx, ink = '#6a3a00'; g.save(); g.translate(x, y); g.rotate(o.rot || 0); g.scale(o.sx || 1, o.sy || 1); g.lineJoin = 'round'; g.lineCap = 'round';
  g.save(); g.shadowColor = 'rgba(80,50,0,0.3)'; g.shadowBlur = s * 0.3; g.shadowOffsetY = s * 0.15;
  // feet
  g.fillStyle = '#ff9a1a'; for (const k of [-1, 1]) { g.beginPath(); g.ellipse(k * s * 0.3, s * 0.9, s * 0.2, s * 0.08, 0, 0, TAU); g.fill(); }
  blob(g, 0, 0, s, 11, 9, 0.04); g.lineWidth = s * 0.07; g.strokeStyle = ink; g.stroke(); glossFill(g, 0, 0, s, '#fffbd0', '#ffe03a', '#ffb000');
  g.restore();
  // tuft
  g.fillStyle = '#ffd23a'; g.strokeStyle = ink; g.lineWidth = s * 0.05; for (const a of [-0.35, 0, 0.35]) { g.save(); g.translate(0, -s * 0.95); g.rotate(a); g.beginPath(); g.ellipse(0, -s * 0.15, s * 0.08, s * 0.2, 0, 0, TAU); g.fill(); g.stroke(); g.restore(); }
  // wings
  for (const k of [-1, 1]) { g.save(); g.translate(k * s * 0.92, s * 0.15); g.rotate(k * (o.flap ? -0.9 : 0.25)); g.beginPath(); g.ellipse(0, 0, s * 0.22, s * 0.38, 0, 0, TAU); g.fillStyle = '#ffc81a'; g.fill(); g.lineWidth = s * 0.05; g.strokeStyle = ink; g.stroke(); g.restore(); }
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(-s * 0.4, -s * 0.5, s * 0.25, s * 0.12, -0.6, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,110,90,0.5)'; for (const k of [-1, 1]) { g.beginPath(); g.ellipse(k * s * 0.5, s * 0.15, s * 0.14, s * 0.08, 0, 0, TAU); g.fill(); }
  for (const k of [-1, 1]) {
    if (mood === 'cheer') { g.strokeStyle = '#2a1000'; g.lineWidth = s * 0.07; g.beginPath(); g.arc(k * s * 0.3, -s * 0.12, s * 0.11, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); continue; }
    g.fillStyle = '#1e0a00'; g.beginPath(); g.ellipse(k * s * 0.3, -s * 0.14, s * 0.1, s * 0.13, 0, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(k * s * 0.3 - s * 0.03, -s * 0.19, s * 0.04, 0, TAU); g.fill();
  }
  // beak
  const open = mood === 'cheer' || mood === 'open';
  g.fillStyle = '#ff8a1a'; g.strokeStyle = '#9a4000'; g.lineWidth = s * 0.04;
  g.beginPath(); g.moveTo(-s * 0.14, s * 0.06); g.quadraticCurveTo(0, -s * 0.04, s * 0.14, s * 0.06); g.lineTo(0, s * (open ? 0.14 : 0.2)); g.closePath(); g.fill(); g.stroke();
  if (open) { g.beginPath(); g.moveTo(-s * 0.12, s * 0.17); g.lineTo(s * 0.12, s * 0.17); g.lineTo(0, s * 0.32); g.closePath(); g.fill(); g.stroke(); }
  g.restore();
}
// A glossy round bush that friends peek out from.
export function bush(x, y, s, seed = 1) {
  const g = ctx; g.save();
  g.fillStyle = 'rgba(20,60,10,0.3)'; g.beginPath(); g.ellipse(x, y + s * 0.05, s * 1.2, s * 0.18, 0, 0, TAU); g.fill();
  const R = rng(seed);
  for (let i = 0; i < 5; i++) { const bx = x + (i - 2) * s * 0.45, by = y - s * (0.35 + (i % 2) * 0.15 + R() * 0.1), br = s * (0.48 + R() * 0.12);
    g.beginPath(); g.arc(bx, by, br, 0, TAU); g.lineWidth = s * 0.05; g.strokeStyle = '#1e5a14'; g.stroke(); glossFill(g, bx, by, br, '#c8ff8a', '#58c83a', '#2a8a22');
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(bx - br * 0.35, by - br * 0.45, br * 0.25, br * 0.1, -0.6, 0, TAU); g.fill(); }
  // tiny flowers
  for (let i = 0; i < 4; i++) { const fx = x + (R() - 0.5) * s * 1.8, fy = y - s * (0.3 + R() * 0.5); for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; g.fillStyle = '#fff'; g.beginPath(); g.arc(fx + Math.cos(a) * s * 0.06, fy + Math.sin(a) * s * 0.06, s * 0.05, 0, TAU); g.fill(); } g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(fx, fy, s * 0.045, 0, TAU); g.fill(); }
  g.restore();
}
// Balloon (party).
export function balloon(x, y, r, col) {
  const g = ctx; g.save();
  g.strokeStyle = 'rgba(80,60,80,0.6)'; g.lineWidth = r * 0.04; g.beginPath(); g.moveTo(x, y + r * 1.15); g.bezierCurveTo(x - r * 0.3, y + r * 1.8, x + r * 0.3, y + r * 2.3, x, y + r * 3); g.stroke();
  g.beginPath(); g.ellipse(x, y, r * 0.88, r * 1.05, 0, 0, TAU); g.lineWidth = r * 0.07; g.strokeStyle = mix(col, '#000000', 0.45); g.stroke(); glossFill(g, x, y, r, mix(col, '#ffffff', 0.6), col, mix(col, '#000000', 0.3));
  g.beginPath(); g.moveTo(x - r * 0.12, y + r * 1.15); g.lineTo(x + r * 0.12, y + r * 1.15); g.lineTo(x, y + r * 1.02); g.fillStyle = mix(col, '#000000', 0.2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(x - r * 0.35, y - r * 0.45, r * 0.22, r * 0.12, -0.7, 0, TAU); g.fill();
  g.restore();
}
