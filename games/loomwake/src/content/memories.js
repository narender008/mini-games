// Memory Threads: twelve illustrated vignettes of the Weaver's past. Each is 3-4 painted panels with narration.
// One may appear in a region's fountain chamber each run (sim/story.js memoryFor / pickMemory decides which);
// all seen ones can be rewatched in Orrin's archive.
//
// MEMORIES = [{ id, n (chronological number), title, region, gate(S) -> bool, panels: [{ text, lines, paint(ctx, w, h, t) }] }]
//   text  : the panel's caption (first narration line), lines: [{ speaker, text, mood }] in full.
//   paint : draws the whole panel into ctx at w x h; t is seconds since the panel appeared (slow drift, shimmer).
// paintMemoryPanel(id, i, w, h, t) -> a canvas (cached per size when t is 0).
// VK is the vignette kit: shadow-puppet silhouettes with rim light against luminous painted skies, glowing
// gold thread, and a woven-cloth texture over everything, as if each memory were a scrap of the tapestry.
// The endings (content/dialogue/endings.js) are painted with the same kit.
// Data module: nothing here touches the DOM at import time.
import { parseLine } from './dialogue/_lib.js';

const TAU = Math.PI * 2;
const DW = 1600, DH = 900; // design space of every panel

// ------------------------------------------------------------------ small helpers
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function mk(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  c.getContext('2d', { willReadFrequently: true }); return c;
}
// smooth closed (or open) curve through points (Catmull-Rom as Beziers)
function smooth(ctx, pts, closed = true, k = 0.5) {
  const n = pts.length; if (n < 2) return;
  const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  ctx.moveTo(pts[0][0], pts[0][1]);
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k / 3, p1[1] + (p2[1] - p0[1]) * k / 3, p2[0] - (p3[0] - p1[0]) * k / 3, p2[1] - (p3[1] - p1[1]) * k / 3, p2[0], p2[1]);
  }
  if (closed) ctx.closePath();
}

// ------------------------------------------------------------------ the vignette kit
const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color); if (c) return c;
  c = mk(128, 128); const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, hexA(color, 1)); gr.addColorStop(0.2, hexA(color, 0.5)); gr.addColorStop(0.55, hexA(color, 0.13)); gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); glowCache.set(color, c); return c;
}
const weaveCache = new Map();
function weaveTexture(w, h) {
  const key = `${w}x${h}`; let c = weaveCache.get(key); if (c) return c;
  c = mk(w, h); const g = c.getContext('2d'); const r = prng(77);
  const step = Math.max(3, Math.round(Math.min(w, h) / 220));
  for (let y = 0; y < h; y += step) { g.fillStyle = `rgba(255,240,210,${0.03 + r() * 0.03})`; g.fillRect(0, y, w, 1); }
  for (let x = 0; x < w; x += step) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`; g.fillRect(x, 0, 1, h); }
  for (let i = 0; i < (w * h) / 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,230,190,0.05)' : 'rgba(0,0,0,0.08)'; g.fillRect(r() * w, r() * h, step * (1 + r() * 3), 1); }
  weaveCache.set(key, c); return c;
}

export const VK = {
  hexA, smooth, prng,
  glow(ctx, x, y, r, color, a = 1) { if (a <= 0.01) return; const o = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = o; },
  sky(ctx, stops, angle = Math.PI / 2) {
    const dx = Math.cos(angle) * DH, dy = Math.sin(angle) * DH;
    const g = ctx.createLinearGradient(DW / 2 - dx / 2, DH / 2 - dy / 2, DW / 2 + dx / 2, DH / 2 + dy / 2);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    ctx.fillStyle = g; ctx.fillRect(-400, -400, DW + 800, DH + 800);
  },
  bloom(ctx, x, y, r, color, a = 0.8) { // a big soft light in the sky
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(color, a)); g.addColorStop(0.4, hexA(color, a * 0.35)); g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  },
  stars(ctx, seed, n, t, color = '#fff6dc', area = [0, 0, DW, DH * 0.7]) {
    const r = prng(seed);
    for (let i = 0; i < n; i++) {
      const x = area[0] + r() * area[2], y = area[1] + r() * area[3], s = 0.6 + r() * 1.8, ph = r() * TAU;
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.8 + r() * 1.5) + ph));
      ctx.fillStyle = hexA(color, a * 0.9); ctx.fillRect(x - s / 2, y - s / 2, s, s);
      if (s > 2) VK.glow(ctx, x, y, s * 7, color, a * 0.35);
    }
  },
  motes(ctx, seed, n, t, color = '#ffd27a', rise = 18) {
    const r = prng(seed);
    for (let i = 0; i < n; i++) {
      const x0 = r() * DW, y0 = r() * DH, sp = 0.4 + r(), ph = r() * TAU;
      const y = ((y0 - t * rise * sp) % DH + DH) % DH, x = x0 + Math.sin(t * 0.6 + ph) * 18;
      VK.glow(ctx, x, y, 6 + r() * 10, color, 0.25 + 0.25 * Math.sin(t * 2 + ph));
    }
  },
  ground(ctx, y, color, bump = 18, seed = 1, rim = null) {
    const r = prng(seed); const pts = [[-200, DH + 200], [-200, y]];
    for (let x = -200; x <= DW + 200; x += 120) pts.push([x, y + (r() - 0.5) * bump * 2]);
    pts.push([DW + 200, DH + 200]);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 1; i < pts.length - 1; i++) (i === 1 ? ctx.moveTo : ctx.lineTo).call(ctx, pts[i][0], pts[i][1]); ctx.stroke(); }
  },
  // a silhouette: build(ctx) makes the path; filled dark, with an inner rim of light on the side facing (lx, ly)
  sil(ctx, build, o = {}) {
    const fill = o.fill ?? '#0b0816', rim = o.rim ?? '#ffd27a', rw = o.rimW ?? 5, lx = o.lx ?? -1, ly = o.ly ?? -0.4;
    ctx.save(); ctx.beginPath(); build(ctx); ctx.fillStyle = fill; ctx.fill();
    if (rim) {
      ctx.clip(); ctx.translate(-lx * rw * 0.9, -ly * rw * 0.9);
      ctx.beginPath(); build(ctx); ctx.strokeStyle = rim; ctx.lineWidth = rw; ctx.globalAlpha = o.rimA ?? 0.85; ctx.stroke();
    }
    ctx.restore();
  },
  // glowing thread through points, with a shimmer travelling along it
  thread(ctx, pts, color = '#ffc35a', w = 3, t = 0, glow = 1) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(color, 0.18 * glow); ctx.lineWidth = w * 6; ctx.beginPath(); smooth(ctx, pts, false); ctx.stroke();
    ctx.strokeStyle = hexA(color, 0.45 * glow); ctx.lineWidth = w * 2.4; ctx.beginPath(); smooth(ctx, pts, false); ctx.stroke();
    ctx.strokeStyle = hexA(color, 1); ctx.lineWidth = w; ctx.beginPath(); smooth(ctx, pts, false); ctx.stroke();
    ctx.setLineDash([w * 4, w * 26]); ctx.lineDashOffset = -t * 120; ctx.strokeStyle = 'rgba(255,255,240,0.9)'; ctx.lineWidth = w * 0.9; ctx.beginPath(); smooth(ctx, pts, false); ctx.stroke();
    ctx.restore();
  },
  // many loose threads flowing from a point (hair, unravelling)
  strands(ctx, x, y, n, len, ang, spread, color, t, seed = 3, w = 1.6, glow = 0.7) {
    const r = prng(seed);
    for (let i = 0; i < n; i++) {
      const a = ang + (r() - 0.5) * spread, L = len * (0.6 + r() * 0.6), ph = r() * TAU;
      const pts = []; for (let k = 0; k <= 5; k++) { const f = k / 5; pts.push([x + Math.cos(a) * L * f + Math.sin(t * 1.3 + ph + f * 4) * 14 * f, y + Math.sin(a) * L * f + Math.cos(t * 1.1 + ph + f * 3) * 10 * f]); }
      VK.thread(ctx, pts, color, w * (0.6 + r() * 0.8), t + ph, glow);
    }
  },
  // ---------------------------------------------------------------- figures (origin at the feet, height ~ 520*s for the Weaver)
  weaver(ctx, x, y, s = 1, o = {}) {
    const pose = o.pose ?? 'stand', t = o.t ?? 0, rim = o.rim ?? '#ffe0a0';
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (o.flip ? -1 : 1), s);
    if (pose === 'sleep') { ctx.translate(0, 0); ctx.scale(1, 0.62); }
    if (pose === 'kneel') ctx.scale(1, 0.72);
    const bow = pose === 'sleep' ? 26 : pose === 'kneel' ? 14 : 0;
    // hair of threads behind
    if (o.hair !== false) VK.strands(ctx, -30, -470, 9, 260, Math.PI * 0.62, 0.5, o.hairColor ?? '#ffcf7a', t, 11, 1.4, 0.6);
    const body = (c) => smooth(c, [[0 + bow, -528], [32 + bow, -514], [50 + bow * 0.8, -480], [50, -442], [80, -402], [96, -330], [106, -228], [124, -120], [152, -24], [168, 0], [-168, 0], [-150, -24], [-120, -120], [-100, -230], [-90, -330], [-74, -402], [-48, -442], [-50 + bow * 0.6, -484], [-30 + bow, -514]]);
    VK.sil(ctx, body, { rim, lx: o.lx ?? -1, ly: -0.3, rimW: 7 });
    // arms
    const arm = (sx, sy, hx, hy) => { ctx.strokeStyle = '#0b0816'; ctx.lineCap = 'round'; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + hx) / 2, Math.min(sy, hy) - 10, hx, hy); ctx.stroke(); ctx.strokeStyle = hexA(rim, 0.6); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, sy - 12); ctx.quadraticCurveTo((sx + hx) / 2, Math.min(sy, hy) - 22, hx, hy - 10); ctx.stroke(); };
    if (pose === 'weave') { arm(60, -400, 230, -350); arm(-40, -400, 180, -300); }
    else if (pose === 'hold') { arm(56, -400, 120, -300); arm(-50, -400, 60, -290); }
    else if (pose === 'reach') { arm(60, -400, 260, -470); }
    else if (pose === 'cradle') { arm(56, -400, 40, -300); arm(-50, -400, 10, -290); }
    // face: a pale crescent inside the hood
    ctx.fillStyle = hexA(o.face ?? '#f6e7c1', pose === 'sleep' ? 0.35 : 0.55);
    ctx.beginPath(); ctx.ellipse(16 + bow, -476, 13, 20, 0.15, -1.2, 1.9); ctx.fill();
    if (pose === 'sleep' || o.eyesClosed) { ctx.strokeStyle = 'rgba(40,30,50,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(22 + bow, -480, 5, 0.2, Math.PI - 0.2); ctx.stroke(); }
    ctx.restore();
  },
  child(ctx, x, y, s = 1, o = {}) { // young Sable: small, black thread hair
    const t = o.t ?? 0;
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (o.flip ? -1 : 1), s);
    VK.strands(ctx, 0, -190, 6, 70, -Math.PI * 0.6, 1.2, o.hair ?? '#8a7cff', t, 21, 1.2, 0.45);
    VK.sil(ctx, (c) => { smooth(c, [[0, -214], [24, -204], [30, -180], [22, -158], [44, -120], [54, -40], [60, 0], [-60, 0], [-54, -40], [-44, -120], [-22, -158], [-30, -180], [-24, -204]]); }, { rim: o.rim ?? '#c9b8ff', rimW: 4 });
    if (o.knot) { VK.glow(ctx, 6, -110, 40, '#8a7cff', 0.6); ctx.strokeStyle = '#1a1030'; ctx.lineWidth = 4; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(6, -110, 14 - i * 2, 9 + i * 2, i, 0, TAU); ctx.stroke(); } }
    ctx.restore();
  },
  baby(ctx, x, y, s = 1, o = {}) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    VK.glow(ctx, 0, 0, 70, o.glow ?? '#ffd9a0', 0.5);
    VK.sil(ctx, (c) => { c.ellipse(0, 0, 46, 28, -0.2, 0, TAU); }, { rim: '#ffe7c0', rimW: 4 });
    VK.strands(ctx, -30, -10, 4, 90, Math.PI * 0.85, 0.6, '#8a7cff', o.t ?? 0, 5, 1.2, 0.5);
    ctx.restore();
  },
  moth(ctx, x, y, s = 1, o = {}) { // Orrin
    const t = o.t ?? 0, f = Math.sin(t * 1.4) * 0.05;
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (o.flip ? -1 : 1), s);
    for (const sd of [-1, 1]) VK.sil(ctx, (c) => { c.save(); c.scale(sd * (1 + f), 1); smooth(c, [[10, -330], [120, -420], [210, -380], [190, -270], [120, -230], [170, -170], [120, -90], [40, -150]]); c.restore(); }, { fill: '#130d1f', rim: o.rim ?? '#e8c890', rimW: 5 });
    VK.sil(ctx, (c) => smooth(c, [[0, -360], [26, -346], [34, -310], [56, -240], [70, -120], [84, 0], [-84, 0], [-70, -120], [-56, -240], [-34, -310], [-26, -346]]), { rim: o.rim ?? '#e8c890', rimW: 6 });
    // antennae and spectacles glint
    ctx.strokeStyle = '#130d1f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-8, -356); ctx.quadraticCurveTo(-40, -420, -80, -420); ctx.moveTo(8, -356); ctx.quadraticCurveTo(40, -420, 80, -420); ctx.stroke();
    VK.glow(ctx, -11, -330, 14, '#fff3c0', 0.8); VK.glow(ctx, 11, -330, 14, '#fff3c0', 0.8);
    if (o.ink) { ctx.fillStyle = 'rgba(30,20,60,0.9)'; ctx.beginPath(); ctx.arc(60, -200, 10, 0, TAU); ctx.fill(); }
    ctx.restore();
  },
  knight(ctx, x, y, s = 1, o = {}) { // Sir Thimbleby
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (o.flip ? -1 : 1), s);
    for (let i = 0; i < 4; i++) VK.sil(ctx, (c) => { const w = 34 - i * 4, y0 = -i * 34; c.moveTo(-w, y0); c.lineTo(-w + 5, y0 - 34); c.lineTo(w - 5, y0 - 34); c.lineTo(w, y0); c.closePath(); }, { rim: o.rim ?? '#e8eef8', rimW: 4 });
    ctx.strokeStyle = '#0b0816'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(40, -40); ctx.lineTo(70, -220); ctx.stroke();
    VK.glow(ctx, 70, -220, 12, '#ffffff', 0.7);
    ctx.fillStyle = '#c0283a'; ctx.beginPath(); smooth(ctx, [[0, -136], [30, -170], [60, -160], [40, -142]]); ctx.fill();
    ctx.restore();
  },
  giant(ctx, x, y, s = 1, o = {}) { // Aurum
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (o.flip ? -1 : 1), s);
    VK.sil(ctx, (c) => smooth(c, [[0, -560], [60, -540], [80, -480], [180, -440], [220, -330], [190, -200], [150, -100], [160, 0], [-160, 0], [-150, -100], [-190, -200], [-220, -330], [-180, -440], [-80, -480], [-60, -540]]), { fill: '#120a08', rim: o.rim ?? '#ffb347', rimW: 8 });
    ctx.strokeStyle = 'rgba(255,170,60,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-100, -420); ctx.lineTo(-60, -300); ctx.lineTo(-90, -180); ctx.moveTo(90, -420); ctx.lineTo(50, -320); ctx.moveTo(-20, -250); ctx.lineTo(30, -140); ctx.stroke();
    VK.glow(ctx, 0, -500, 30, '#ffb347', 0.9);
    if (o.hammer !== false) { ctx.fillStyle = '#120a08'; ctx.save(); ctx.translate(220, -300); ctx.rotate(o.hammerA ?? 0.4); ctx.fillRect(-8, 0, 16, 200); ctx.fillRect(-60, 180, 120, 70); ctx.restore(); }
    ctx.restore();
  },
  queen(ctx, x, y, s = 1, o = {}) { // Veyl
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (o.flip ? -1 : 1), s);
    VK.sil(ctx, (c) => smooth(c, [[0, -470], [26, -456], [34, -420], [70, -380], [90, -260], [130, -120], [190, 0], [-190, 0], [-130, -120], [-90, -260], [-70, -380], [-34, -420], [-26, -456]]), { fill: '#06121a', rim: o.rim ?? '#9ff0e0', rimW: 6 });
    ctx.strokeStyle = '#06121a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 12, -462); ctx.quadraticCurveTo(sd * 40, -540, sd * 80, -560); ctx.moveTo(sd * 30, -510); ctx.lineTo(sd * 60, -520); ctx.moveTo(sd * 50, -540); ctx.lineTo(sd * 54, -590); ctx.stroke(); }
    VK.glow(ctx, 0, -320, 40, '#9ff0e0', 0.8);
    ctx.restore();
  },
  cantor(ctx, x, y, s = 1, o = {}) { // Morrow
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (o.flip ? -1 : 1), s);
    VK.sil(ctx, (c) => smooth(c, [[0, -440], [28, -426], [36, -392], [70, -340], [86, -200], [104, -60], [130, 0], [-130, 0], [-104, -60], [-86, -200], [-70, -340], [-36, -392], [-28, -426]]), { fill: '#060c1c', rim: o.rim ?? '#9cc8ff', rimW: 6 });
    ctx.strokeStyle = '#060c1c'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(110, 0); ctx.lineTo(120, -520); ctx.stroke();
    VK.glow(ctx, 120, -540, 40, '#bfe0ff', 0.9);
    VK.glow(ctx, -10, -410, 8, '#e8f0ff', 0.9); VK.glow(ctx, 12, -410, 8, '#e8f0ff', 0.9);
    ctx.restore();
  },
  iri(ctx, x, y, s = 1, o = {}) {
    const t = o.t ?? 0;
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (o.flip ? -1 : 1), s);
    const scarf = []; for (let k = 0; k <= 6; k++) scarf.push([-6 - k * 26, -150 + k * 6 + Math.sin(t * 3 + k * 0.9) * 8 * (k / 6)]);
    VK.thread(ctx, scarf, '#ffc35a', 6, t, 1);
    VK.sil(ctx, (c) => smooth(c, [[0, -190], [22, -180], [28, -156], [40, -110], [52, -30], [58, 0], [-58, 0], [-52, -30], [-40, -110], [-28, -156], [-22, -180]]), { fill: '#2a0a16', rim: '#ff9f9f', rimW: 4 });
    ctx.restore();
  },
  sableKnight(ctx, x, y, s = 1, o = {}) {
    const t = o.t ?? 0;
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (o.flip ? -1 : 1), s);
    VK.strands(ctx, -20, -300, 10, 220, Math.PI * 0.75, 0.9, '#8a7cff', t, 41, 1.4, 0.5);
    VK.sil(ctx, (c) => smooth(c, [[0, -380], [30, -366], [38, -330], [70, -300], [86, -180], [100, -40], [120, 0], [-120, 0], [-100, -40], [-86, -180], [-70, -300], [-38, -330], [-30, -366]]), { fill: '#05030c', rim: o.rim ?? '#b3a8ff', rimW: 5 });
    if (o.mask !== false) { ctx.fillStyle = '#d8d4f0'; ctx.beginPath(); ctx.ellipse(10, -345, 16, 22, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#05030c'; ctx.fillRect(2, -350, 7, 3); ctx.fillRect(14, -350, 7, 3); }
    if (o.sword !== false) { ctx.strokeStyle = '#d8d4f0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(70, -200); ctx.lineTo(230, -40); ctx.stroke(); VK.glow(ctx, 230, -40, 14, '#b3a8ff', 0.8); }
    ctx.restore();
  },
  shears(ctx, x, y, s = 1, open = 0.4, angle = 0, color = '#ffd27a') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(s, s);
    for (const sd of [-1, 1]) {
      ctx.save(); ctx.rotate(sd * open * 0.5);
      ctx.fillStyle = '#0b0816'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(220, -2); ctx.lineTo(230, 4); ctx.lineTo(0, 8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, -4); ctx.lineTo(222, -1); ctx.stroke();
      ctx.lineWidth = 9; ctx.strokeStyle = '#0b0816'; ctx.beginPath(); ctx.ellipse(-46, sd * 20, 30, 18, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
      ctx.restore();
    }
    VK.glow(ctx, 0, 0, 20, color, 0.8);
    ctx.restore();
  },
  loom(ctx, x, y, s = 1, o = {}) {
    const t = o.t ?? 0;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    // warp threads
    const n = 22;
    for (let i = 0; i < n; i++) { const xx = -180 + (360 * i) / (n - 1); ctx.strokeStyle = hexA(o.warp ?? '#ffe0a0', 0.35 + 0.2 * Math.sin(t * 2 + i)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(xx, -470); ctx.lineTo(xx, -60); ctx.stroke(); }
    // woven part
    if (o.cloth) { const g = ctx.createLinearGradient(0, -260, 0, -60); g.addColorStop(0, hexA(o.cloth, 0.2)); g.addColorStop(1, hexA(o.cloth, 0.85)); ctx.fillStyle = g; ctx.fillRect(-180, -260, 360, 200); }
    VK.sil(ctx, (c) => { c.rect(-210, -500, 26, 500); c.rect(184, -500, 26, 500); c.rect(-230, -520, 460, 30); c.rect(-220, -70, 440, 22); c.rect(-240, -10, 70, 10); c.rect(170, -10, 70, 10); }, { rim: o.rim ?? '#ffd27a', rimW: 4 });
    ctx.restore();
  },
  tapestry(ctx, x, y, w, h, t = 0, o = {}) {
    ctx.save(); ctx.translate(x, y);
    const r = prng(o.seed ?? 9);
    const rows = Math.floor(h / 14);
    for (let i = 0; i < rows; i++) {
      const hue = o.colors ? o.colors[i % o.colors.length] : ['#c0405a', '#e0a040', '#4070c0', '#40a080', '#9050c0'][i % 5];
      ctx.fillStyle = hexA(hue, 0.55 + r() * 0.3); ctx.fillRect(0, i * 14, w, 12);
      for (let j = 0; j < w / 30; j++) if (r() < 0.4) { ctx.fillStyle = hexA('#ffe7b0', 0.25 + 0.2 * Math.sin(t + i + j)); ctx.fillRect(j * 30 + r() * 10, i * 14 + 3, 12, 5); }
    }
    if (o.hole) { ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); smooth(ctx, o.hole); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    ctx.strokeStyle = hexA('#ffd27a', 0.7); ctx.lineWidth = 3; ctx.strokeRect(0, 0, w, h);
    ctx.restore();
  },
  glassTree(ctx, x, y, s = 1, color = '#8ff0e0', seed = 1) {
    const r = prng(seed);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const branch = (len, a, d) => { if (d > 4) return; ctx.save(); ctx.rotate(a); ctx.strokeStyle = hexA(color, 0.5 + d * 0.08); ctx.lineWidth = 9 - d * 1.8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len); ctx.stroke(); ctx.translate(0, -len); if (d >= 3) VK.glow(ctx, 0, 0, 16, color, 0.6); branch(len * 0.72, -0.45 - r() * 0.3, d + 1); branch(len * 0.72, 0.45 + r() * 0.3, d + 1); ctx.restore(); };
    branch(120, 0, 0);
    ctx.restore();
  },
  rose(ctx, x, y, s = 1, color = '#ff6d86') {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = '#0b1a14'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(8, 30, 0, 60); ctx.stroke();
    for (let i = 0; i < 5; i++) { ctx.fillStyle = hexA(color, 0.75 - i * 0.1); ctx.beginPath(); ctx.ellipse(0, -2, 16 - i * 3, 12 - i * 2, i * 0.9, 0, TAU); ctx.fill(); }
    VK.glow(ctx, 0, 0, 30, color, 0.5);
    ctx.restore();
  },
  orb(ctx, x, y, r, color, t = 0) { VK.glow(ctx, x, y, r * 3.2, color, 0.7 + 0.15 * Math.sin(t * 2 + x)); VK.glow(ctx, x, y, r, '#ffffff', 0.7); },
  veil(ctx, x0, x1, top, bottom, t, color = '#f6e7c1', a = 0.25) {
    for (let i = 0; i < 9; i++) {
      const f = i / 8, xx = x0 + (x1 - x0) * f;
      const g = ctx.createLinearGradient(xx, top, xx, bottom); g.addColorStop(0, hexA(color, a)); g.addColorStop(1, hexA(color, a * 0.2));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(xx - 40, top);
      ctx.quadraticCurveTo(xx + Math.sin(t * 0.7 + i) * 30, (top + bottom) / 2, xx - 40 + Math.sin(t * 0.5 + i * 2) * 20, bottom);
      ctx.lineTo(xx + 50 + Math.sin(t * 0.5 + i * 2) * 20, bottom); ctx.quadraticCurveTo(xx + 90 + Math.sin(t * 0.7 + i) * 30, (top + bottom) / 2, xx + 50, top); ctx.closePath(); ctx.fill();
    }
  },
  water(ctx, y, color, t, a = 0.6) {
    const g = ctx.createLinearGradient(0, y, 0, DH); g.addColorStop(0, hexA(color, a * 0.6)); g.addColorStop(1, hexA(color, a)); ctx.fillStyle = g; ctx.fillRect(-200, y, DW + 400, DH - y + 200);
    ctx.strokeStyle = hexA('#e0f0ff', 0.25); ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) { const yy = y + 12 + i * i * 6; ctx.beginPath(); for (let x = -40; x <= DW + 40; x += 40) { const v = yy + Math.sin(x * 0.01 + t * 1.2 + i) * 3; x === -40 ? ctx.moveTo(x, v) : ctx.lineTo(x, v); } ctx.stroke(); }
  },
  pillars(ctx, color, rim, n = 5, top = 120, seed = 4) {
    const r = prng(seed);
    for (let i = 0; i < n; i++) { const x = 80 + (i * (DW - 160)) / (n - 1) + (r() - 0.5) * 40, w = 60 + r() * 30; VK.sil(ctx, (c) => { c.rect(x - w / 2, top + r() * 40, w, DH); c.moveTo(x - w / 2 - 10, top); c.arc(x, top, w / 2 + 10, Math.PI, 0); }, { fill: color, rim, rimW: 3 }); }
  },
  // ---------------------------------------------------------------- finishing: cloth texture, vignette, border
  finish(ctx, w, h, o = {}) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(weaveTexture(Math.ceil(w), Math.ceil(h)), 0, 0);
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(4,3,12,${o.vignette ?? 0.72})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    if (o.border !== false) { const b = Math.max(2, Math.round(Math.min(w, h) / 150)); ctx.strokeStyle = 'rgba(242,196,107,0.55)'; ctx.lineWidth = b; ctx.strokeRect(b * 3, b * 3, w - b * 6, h - b * 6); ctx.strokeStyle = 'rgba(242,196,107,0.22)'; ctx.lineWidth = 1; ctx.strokeRect(b * 5, b * 5, w - b * 10, h - b * 10); }
    ctx.restore();
  },
};

// wrap a scene painter: fit design space to (w, h) with cover scaling, slow push-in over time, then finish
export function scene(fn, o = {}) {
  return function paint(ctx, w, h, t = 0) {
    ctx.save();
    const s = Math.max(w / DW, h / DH) * (1 + Math.min(t, 20) * (o.push ?? 0.004));
    ctx.translate(w / 2, h / 2); ctx.scale(s, s); ctx.translate(-DW / 2 + (o.panX ?? 0) * Math.min(t, 20), -DH / 2);
    fn(ctx, t);
    ctx.restore();
    VK.finish(ctx, w, h, o);
  };
}

// ------------------------------------------------------------------ the twelve memories
const N = (t) => `@narrator ${t}`;
function mem(id, n, title, region, gate, panels) {
  return { id, n, title, region, gate, panels: panels.map((p) => { const lines = p.lines.map((l) => parseLine(l, 'narrator')); return { paint: p.paint, lines, text: lines[0]?.text ?? '' }; }) };
}

const dawnSky = ['#2a1840', '#a0507a', '#f0a868', '#ffe2a8'];
const nightSky = ['#05040e', '#141038', '#2a2060', '#3a2a70'];

export const MEMORIES = [
  mem('weaving', 1, 'The First Weaving', 'glasswood', () => true, [
    { paint: scene((c, t) => { VK.sky(c, nightSky); VK.stars(c, 1, 260, t); VK.bloom(c, 800, 380, 520, '#ffd9a0', 0.35); VK.loom(c, 800, 780, 1, { t, rim: '#fff0c0' }); VK.ground(c, 780, '#07060f'); }), lines: [N('Before the world, there was a loom of starlight, and nothing on it.')] },
    { paint: scene((c, t) => { VK.sky(c, nightSky); VK.stars(c, 2, 200, t); VK.bloom(c, 900, 420, 560, '#ffd9a0', 0.45); VK.loom(c, 1000, 780, 0.9, { t, cloth: '#e0a040' }); VK.weaver(c, 640, 780, 1, { pose: 'weave', t }); VK.ground(c, 780, '#07060f'); VK.thread(c, [[870, 470], [920, 520], [980, 560]], '#ffd27a', 3, t); }), lines: [N('Then came the Weaver. She drew one thread out of the dark, and it was warm, and it was a life.'), N('She drew another. And another. And she did not stop.')] },
    { paint: scene((c, t) => { VK.sky(c, dawnSky); VK.bloom(c, 800, 900, 900, '#fff2c8', 0.6); VK.tapestry(c, 300, 140, 1000, 520, t, { seed: 3 }); VK.weaver(c, 800, 900, 0.62, { pose: 'reach', t }); VK.motes(c, 4, 40, t); }), lines: [N('Each thread a life. Each life woven beside the next, so that every fate held up the one beside it.'), N('She called it the tapestry. She called it home.')] },
  ]),
  mem('garden', 2, 'The Garden Given', 'glasswood', (S) => S.started >= 2, [
    { paint: scene((c, t) => { VK.sky(c, ['#103040', '#3a8090', '#a0e0d0', '#f0fff0']); VK.bloom(c, 1200, 200, 500, '#ffffff', 0.5); for (let i = 0; i < 7; i++) VK.glassTree(c, 120 + i * 230, 760, 1.1 + (i % 3) * 0.3, '#bff8ee', i + 1); VK.ground(c, 760, '#06141a', 14, 2, 'rgba(160,240,220,0.5)'); }), lines: [N('At the edge of the tapestry she planted a garden of glass, so that the light of every life would have somewhere to rest.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#103040', '#3a8090', '#a0e0d0', '#f0fff0']); VK.glassTree(c, 300, 760, 1.5, '#bff8ee', 3); VK.weaver(c, 620, 770, 0.95, { pose: 'hold', t }); VK.queen(c, 1020, 770, 0.8, { rim: '#ffffff' }); VK.rose(c, 790, 480, 1.4); VK.ground(c, 760, '#06141a', 14, 2); }), lines: [N('She gave the garden to her gardener, Veyl, who wore no crown then, only dirt beneath her nails.'), '@weaver #warm Keep it for me. Keep it gentle.'] },
    { paint: scene((c, t) => { VK.sky(c, ['#0a2030', '#205060', '#60a0a0']); VK.queen(c, 800, 780, 1.05, { rim: '#ffffff' }); for (let i = 0; i < 9; i++) VK.rose(c, 300 + i * 120, 700 - (i % 2) * 40, 1); VK.ground(c, 760, '#06141a', 14, 2); VK.motes(c, 6, 30, t, '#bff8ee'); }), lines: [N('Veyl pruned the roses by hand, so that the shears would not frighten them.'), N('For an age, nothing in the garden had thorns.')] },
  ]),
  mem('child', 3, 'A Child of Black Thread', 'glasswood', (S) => S.kills('veyl') >= 1, [
    { paint: scene((c, t) => { VK.sky(c, ['#1a1030', '#503060', '#c08070', '#f0c890']); VK.bloom(c, 800, 500, 500, '#ffd9a0', 0.5); VK.weaver(c, 760, 800, 1, { pose: 'cradle', t }); VK.baby(c, 800, 500, 1.1, { t }); VK.ground(c, 800, '#0b0816'); }), lines: [N('One thread she did not draw from the dark. She spun it from her own heart, and it came out black, and it cried.'), '@weaver #happy Sable. My first. My own.'] },
    { paint: scene((c, t) => { VK.sky(c, ['#2a1840', '#7a4070', '#e09070']); VK.loom(c, 1050, 800, 0.9, { t, cloth: '#c0405a' }); VK.child(c, 600, 800, 1.3, { t }); VK.moth(c, 330, 800, 0.85, { t }); c.fillStyle = '#0b0816'; c.beginPath(); c.ellipse(820, 790, 90, 30, 0, 0, TAU); c.fill(); VK.strands(c, 820, 770, 8, 60, -Math.PI / 2, 1.6, '#ffcf7a', t, 8, 1.2, 0.5); VK.ground(c, 800, '#0b0816'); }), lines: [N('He grew up beneath the loom, tangled in the spare yarn. He slept in the basket of loose ends.'), '@orrin #warm We could never find him. We never minded.'] },
    { paint: scene((c, t) => { VK.sky(c, dawnSky); VK.child(c, 700, 800, 1.6, { t }); VK.knight(c, 960, 800, 1.2); VK.ground(c, 800, '#0b0816'); VK.motes(c, 9, 40, t); }), lines: [N('He cheated at draughts. He set Veyra’s clouds on fire. He sat on Ossian for an entire afternoon.'), N('Everyone in the Loomhall loved him. That made what came next so much worse.')] },
  ]),
  mem('names', 5, 'The Song of Names', 'choir', () => true, [
    { paint: scene((c, t) => { VK.sky(c, ['#0a1430', '#2040a0', '#80a0e0', '#f0e0b0']); VK.pillars(c, '#08102a', '#a0c0ff', 6, 140); VK.cantor(c, 800, 790, 1, { rim: '#ffe7b0' }); VK.ground(c, 790, '#060c1c'); VK.motes(c, 12, 50, t, '#ffe7b0', 30); }), lines: [N('The Weaver’s choir sang each new name into the tapestry as it was woven. That was their whole joy.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#0a1430', '#2040a0', '#80a0e0']); for (let i = 0; i < 7; i++) VK.cantor(c, 200 + i * 200, 800, 0.55 + (i === 3 ? 0.3 : 0), { rim: '#ffe7b0' }); for (let i = 0; i < 6; i++) VK.thread(c, [[200 + i * 230, 420], [400 + i * 200, 260 + Math.sin(t + i) * 30], [700 + i * 150, 140]], '#ffe7b0', 2, t + i); VK.ground(c, 800, '#060c1c'); }), lines: [N('Every name a note. Every note a thread pulled tight and true.'), '@morrow #happy Sing it clear, children. Somebody is being born.'] },
    { paint: scene((c, t) => { VK.sky(c, ['#020818', '#0a2050', '#1a4070']); VK.pillars(c, '#030818', '#5080c0', 6, 140); VK.water(c, 420, '#1a4a8a', t, 0.8); VK.cantor(c, 800, 640, 0.9, { rim: '#80b0ff' }); VK.stars(c, 13, 120, t, '#bfe0ff', [0, 420, DW, 480]); }), lines: [N('After the cutting, the sea came in. The choir drowned still singing.'), N('And Cantor Morrow began to sing the names back out again, one by one, so that nothing could find them.')] },
  ]),
  mem('knot', 4, 'The Knot', 'choir', (S) => S.rev('sable'), [
    { paint: scene((c, t) => { VK.sky(c, ['#140a24', '#3a1a50', '#7a3a70']); VK.tapestry(c, 300, 120, 1000, 560, t, { seed: 5 }); VK.child(c, 800, 820, 1.7, { t, knot: true }); VK.ground(c, 820, '#0b0816'); }), lines: [N('As Sable grew, his thread grew knots. Not one or two. Hundreds. A thread that would not lie straight.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#140a24', '#3a1a50', '#7a3a70']); VK.tapestry(c, 200, 100, 1200, 640, t, { seed: 6, hole: [[640, 300], [900, 260], [1000, 420], [820, 560], [620, 480]] }); for (let i = 0; i < 12; i++) VK.thread(c, [[800 + Math.cos(i) * 60, 420 + Math.sin(i) * 60], [800 + Math.cos(i) * 200, 420 + Math.sin(i * 1.3) * 160], [800 + Math.cos(i) * 360, 420 + Math.sin(i) * 300]], '#8a7cff', 2, t + i, 0.8); }), lines: [N('Wherever he was woven, the threads beside him tangled. Fates snarled. Lives that should have met went past each other in the dark.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#0a0614', '#1a1030', '#3a2050']); VK.weaver(c, 700, 800, 1, { pose: 'kneel', t }); VK.child(c, 960, 800, 1.3, { t, knot: true }); VK.ground(c, 800, '#0b0816'); }), lines: [N('She tried to untie him. For a hundred years she tried, with the finest needle she had.'), '@weaver #sad Hold still, love. Just one more. Just this one.', N('The knots only drew tighter.')] },
  ]),
  mem('quarrel', 6, 'The Patrons’ Quarrel', 'forge', (S) => S.rev('sleep'), [
    { paint: scene((c, t) => { VK.sky(c, nightSky); VK.stars(c, 21, 120, t); const cols = ['#ffc35a', '#5ec8ff', '#a6f6ff', '#c8a27a', '#b07cff', '#8ff5b0']; cols.forEach((col, i) => { const a = (i / 6) * TAU - Math.PI / 2; VK.orb(c, 800 + Math.cos(a) * 320, 450 + Math.sin(a) * 220, 26, col, t); }); VK.weaver(c, 800, 800, 0.7, { pose: 'kneel', t }); }), lines: [N('The six Threads of the Weaver gathered in a ring to decide what was to be done about her son.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#2a1a08', '#806020', '#f0c060']); VK.orb(c, 520, 380, 50, '#ffc35a', t); VK.orb(c, 1080, 380, 50, '#b07cff', t); VK.thread(c, [[560, 400], [800, 440 + Math.sin(t * 3) * 20], [1040, 400]], '#ffffff', 2, t, 0.6); }), lines: ['@solenne #angry Burn the knot out of the tapestry before it tangles all of it.', '@ilu #sad He is a child. He is her child. Leave him be.'] },
    { paint: scene((c, t) => { VK.sky(c, ['#100818', '#301838', '#603050']); const cols = ['#5ec8ff', '#a6f6ff', '#c8a27a', '#8ff5b0']; cols.forEach((col, i) => VK.orb(c, 380 + i * 280, 300 + (i % 2) * 60, 30, col, t)); VK.weaver(c, 800, 820, 1, { pose: 'stand', t, eyesClosed: true }); VK.ground(c, 820, '#0b0816'); }), lines: ['@maru #sad Let her choose, love. It is her thread.', '@ossian #grave ...Cut.', N('In the end it was Ossian, who never says anything, who said the word. And she did not argue.')] },
  ]),
  mem('shears', 7, 'The Making of the Shears', 'forge', () => true, [
    { paint: scene((c, t) => { VK.sky(c, ['#200806', '#802010', '#f06020', '#ffc060']); VK.bloom(c, 800, 700, 600, '#ff9030', 0.6); VK.giant(c, 800, 820, 1, { hammerA: -0.9 + Math.sin(t * 2) * 0.1 }); VK.ground(c, 820, '#120a08'); VK.motes(c, 31, 60, t, '#ffb347', 60); }), lines: [N('She went down to the forge, to Aurum, who made all her needles, and asked him for something that could cut a thread for ever.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#200806', '#802010', '#f06020']); VK.bloom(c, 800, 500, 500, '#ffd080', 0.8); VK.shears(c, 800, 500, 2.2, 0.15 + Math.sin(t) * 0.04, 0.1, '#fff0a0'); VK.motes(c, 32, 70, t, '#ffd080', 80); }), lines: ['@aurum #sad I wept into the quench. The steel came out cold anyway.', N('He made them in a single night. The finest edge he ever forged.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#100404', '#401008', '#802010']); VK.giant(c, 1100, 820, 0.9, { hammer: false }); VK.weaver(c, 560, 820, 0.95, { pose: 'hold', t }); VK.shears(c, 680, 560, 0.9, 0.05, -1.2); VK.ground(c, 820, '#120a08'); }), lines: [N('She took them from his hands. Hers were shaking so badly that she nearly dropped them.'), '@aurum #grave I will be making amends for these until the stars go out.'] },
  ]),
  mem('cutting', 8, 'The Night of the Cutting', 'forge', (S) => S.rev('halves'), [
    { paint: scene((c, t) => { VK.sky(c, ['#030208', '#0c0820', '#1a1040']); VK.stars(c, 41, 90, t); VK.tapestry(c, 260, 120, 1080, 560, t, { seed: 8, colors: ['#603050', '#304070', '#405040', '#504030'] }); VK.child(c, 800, 600, 1.2, { t, knot: true, rim: '#8a7cff' }); }), lines: [N('It was done at night, so that the tapestry would be asleep and would not feel it.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#030208', '#0c0820', '#1a1040']); VK.weaver(c, 400, 820, 0.95, { pose: 'kneel', t, eyesClosed: true }); VK.shears(c, 900, 470, 1.5, 0.7, -0.3); c.save(); c.globalAlpha = 0.85; VK.moth(c, 1080, 900, 0.95, { t, ink: true, rim: '#605070' }); c.restore(); c.fillStyle = 'rgba(20,10,50,0.9)'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(820 + i * 22, 520 + (i % 2) * 12, 7, 0, TAU); c.fill(); } VK.ground(c, 820, '#05040c'); }), lines: [N('Her hands would not close the blades. So someone else’s did.'), N('The hands that held the shears were steady, and stained with ink. Behind them, in the lamplight, a shadow of great soft wings.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#000000', '#100620', '#2a1040']); VK.bloom(c, 800, 400, 400, '#8a7cff', 0.4); VK.thread(c, [[400, 300], [700, 420], [790, 430]], '#8a7cff', 4, t); VK.thread(c, [[820, 440], [900, 520 + t * 8], [980, 700 + t * 14]], '#8a7cff', 4, t); VK.glow(c, 805, 435, 60, '#ffffff', 0.9); VK.child(c, 1000, 760 + Math.min(t, 6) * 12, 0.9, { t, flip: true }); }), lines: [N('Snip.'), N('Sable fell out of the tapestry and into the dark beneath it, and the hole where he had been never quite closed.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#05040c', '#120a24', '#2a1840']); VK.weaver(c, 800, 820, 1.05, { pose: 'kneel', t, eyesClosed: true }); VK.glow(c, 860, 500, 50 + Math.sin(t * 2) * 6, '#ffc35a', 0.9); VK.thread(c, [[830, 520], [860, 500], [890, 520]], '#ffc35a', 3, t); VK.ground(c, 820, '#05040c'); }), lines: [N('She wept until morning. And in her hands she held the piece that had been cut away.')] },
  ]),
  mem('dark', 9, 'Outside the Tapestry', 'unwoven', () => true, [
    { paint: scene((c, t) => { VK.sky(c, ['#0c0c12', '#1a1a24', '#2a2a36']); for (let i = 0; i < 40; i++) VK.thread(c, [[(i * 97) % DW, 0], [(i * 131) % DW + Math.sin(t + i) * 40, 450], [(i * 71) % DW, DH]], '#6a6a80', 1, t + i, 0.3); VK.child(c, 800, 700, 1.4, { t, rim: '#9090a8' }); }), lines: [N('Beneath the tapestry there is no colour and no name. Sable lay there a long time, cut and alone, and nobody came.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#0c0c12', '#1a1a24', '#2a2a36']); VK.orb(c, 600, 400, 30, '#b07cff', t); VK.child(c, 800, 720, 1.5, { t, rim: '#b07cff' }); }), lines: [N('Only Ilu came, the Thread of Shade, and sat with him in the dark, and said nothing, which was the kindest thing anyone could have said.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#0a0810', '#1a1424', '#302440']); VK.sableKnight(c, 800, 820, 1.3, { t, mask: false, sword: false }); for (let i = 0; i < 8; i++) VK.thread(c, [[860, 520], [1000 + i * 40, 300 + i * 30], [1300 + i * 30, 120 + i * 60]], '#c9c9d6', 1.5, t + i, 0.5); VK.ground(c, 820, '#05040c'); }), lines: [N('He grew up in the dark. He learned to pull at the loose ends that hung down from above.'), '@sable_bare #grave If they can cut me out, I can cut them free. Every one of them. Every fate she fixed.', N('That night, in the waking world, the first person vanished. Nobody remembered them.')] },
  ]),
  mem('sleep', 10, 'The Choice to Sleep', 'choir', (S) => S.rev('sleep'), [
    { paint: scene((c, t) => { VK.sky(c, nightSky); VK.stars(c, 51, 160, t); VK.loom(c, 1000, 800, 1, { t, cloth: '#7a3a70' }); VK.weaver(c, 700, 800, 1, { pose: 'stand', t }); VK.knight(c, 300, 800, 1.1); VK.ground(c, 800, '#07060f'); }), lines: [N('Years later, the threads were going dark faster than she could weave them. She knew whose hand was in it.'), N('Sir Thimbleby stood guard at her door, as he did every night.')] },
    { paint: scene((c, t) => { VK.sky(c, nightSky); VK.stars(c, 52, 160, t); VK.weaver(c, 900, 800, 1, { pose: 'hold', t }); VK.knight(c, 600, 800, 1.1, { flip: true }); VK.ground(c, 800, '#07060f'); }), lines: ['@weaver #warm Thimbleby, dear. Will you step away? Just for a little while. I need to be alone with the loom.', '@thimbleby #neutral Of course, my lady.'] },
    { paint: scene((c, t) => { VK.sky(c, ['#05040e', '#141038', '#3a2060']); VK.bloom(c, 800, 600, 700, '#c9b8ff', 0.3 + Math.sin(t) * 0.05); VK.loom(c, 1000, 800, 1, { t, cloth: '#7a3a70' }); VK.weaver(c, 760, 800, 1, { pose: 'sleep', t }); VK.ground(c, 800, '#07060f'); for (let i = 0; i < 10; i++) VK.thread(c, [[760, 600], [500 + i * 60, 820], [200 + i * 120, 900]], '#c9b8ff', 1.5, t + i, 0.6); }), lines: [N('She could not untie him and she could not bear to cut him again. So she lay her head on the loom and dreamed a prison around him, deep as the world.'), '@weaver #sad Hold him, dream. Hold him gently. Until someone can do what I could not.'] },
  ]),
  mem('gold', 11, 'The Gold Beneath the Knot', 'unwoven', (S) => S.rev('halves'), [
    { paint: scene((c, t) => { VK.sky(c, ['#0a0614', '#2a1840', '#6a3a40']); VK.bloom(c, 800, 450, 400, '#ffc35a', 0.6); VK.glow(c, 800, 450, 70, '#ffe8a0', 1); VK.thread(c, [[740, 470], [800, 430], [860, 470]], '#ffc35a', 4, t); VK.motes(c, 61, 30, t); }), lines: [N('The piece she had cut away was not black at all. The knot was black. Beneath it, the thread was gold.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#0a0614', '#2a1840', '#6a3a40']); VK.weaver(c, 800, 820, 1.05, { pose: 'cradle', t }); VK.glow(c, 820, 520, 60, '#ffc35a', 0.9); VK.ground(c, 820, '#0b0816'); }), lines: ['@weaver #sad The best of you, love. The part that laughed. The part that slept in the yarn.', N('She kept it in her lap for an age, and could not bring herself to weave it into anything.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#100808', '#401010', '#a04020']); VK.giant(c, 1150, 820, 0.8, { hammer: false }); VK.weaver(c, 600, 820, 0.95, { pose: 'hold', t }); VK.glow(c, 720, 520, 40, '#ffc35a', 0.9); VK.ground(c, 820, '#120a08'); }), lines: ['@aurum #grave She showed it to me once. Gold. I had never seen gold like it, and I had seen it all.'] },
  ]),
  mem('golden', 12, 'The Last Golden Thread', 'unwoven', (S) => S.f('confession'), [
    { paint: scene((c, t) => { VK.sky(c, ['#05040e', '#141038', '#3a2060']); VK.loom(c, 800, 800, 1, { t, cloth: '#e0a040' }); VK.weaver(c, 520, 800, 1, { pose: 'weave', t, eyesClosed: true }); VK.ground(c, 800, '#07060f'); VK.thread(c, [[760, 470], [800, 520], [830, 560]], '#ffc35a', 4, t); }), lines: [N('On the night she chose to sleep, before she lay her head down, she took the gold from her lap and spun it into one last thread.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#1a0a20', '#50306a', '#c08070']); VK.bloom(c, 800, 500, 500, '#ffd9a0', 0.6); c.fillStyle = '#0b0816'; c.beginPath(); c.ellipse(800, 640, 120, 40, 0, 0, TAU); c.fill(); VK.strands(c, 800, 610, 12, 80, -Math.PI / 2, 2.4, '#ffc35a', t, 13, 2, 1); VK.glow(c, 800, 600, 90, '#ffc35a', 0.8); }), lines: [N('She laid it in a basket in the Loomhall, the old yarn basket, where a black-threaded child used to sleep.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#05040e', '#141038', '#3a2060']); VK.weaver(c, 800, 820, 1, { pose: 'sleep', t }); VK.glow(c, 860, 560, 40, '#ffc35a', 0.7); VK.ground(c, 820, '#07060f'); }), lines: ['@weaver #warm Wake when you are ready, little thread. Go down into my dream.', '@weaver #warm Find him. Don’t cut him. Find him.', N('Then she slept. And a long time later, a golden thread woke up in a basket, and someone called it Iri.')] },
  ]),
];

export const MEMORY_IDS = MEMORIES.map((m) => m.id);
export const memoryById = (id) => MEMORIES.find((m) => m.id === id) ?? null;
// fountain order per region: memoryFor (story.js) offers the first unseen one whose gate passes
export const REGION_MEMORIES = {
  glasswood: ['weaving', 'garden', 'child'],
  choir: ['names', 'knot', 'sleep'],
  forge: ['shears', 'quarrel', 'cutting'],
  unwoven: ['dark', 'gold', 'golden'],
};

const panelCache = new Map();
export function paintMemoryPanel(id, i, w, h, t = 0, out = null) {
  const m = memoryById(id); const p = m?.panels[i]; if (!p) return null;
  const key = `${id}:${i}:${w}x${h}`;
  if (!t && !out && panelCache.has(key)) return panelCache.get(key);
  const c = out ?? mk(w, h); const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); p.paint(g, w, h, t);
  if (!t && !out) { if (panelCache.size > 24) panelCache.delete(panelCache.keys().next().value); panelCache.set(key, c); }
  return c;
}
