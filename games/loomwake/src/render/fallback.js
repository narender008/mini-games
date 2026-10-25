// Fallback painters used until (or when) a sibling module is missing:
//   paintFallbackChamber(chamber, quality) -> env object (same contract as render/env/index.js paintChamber):
//     the motion test's Glasswood island, generalised to any chamber.shape polygon
//   drawFallbackFoe(ctx, e, G, P)  a hooded Hollow silhouette (never insects)
//   drawFallbackDoor(ctx, door, chamber, t, P)
//   drawFallbackPickup(ctx, p, G, P)
import { TAU, lerp, hexA, clamp } from '../core/math.js';
import { rng } from '../core/rng.js';
import { drawGlow } from './light.js';

function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); c.getContext('2d', { willReadFrequently: true }); return c; }

// ---------------------------------------------------------------- background (void, aurora, islands)
let BG = null, BGsize = '';
function background(w, h) {
  const key = w + 'x' + h;
  if (BG && BGsize === key) return BG;
  const c = mk(w * 1.4, h * 1.4), g = c.getContext('2d'), W2 = c.width, H2 = c.height;
  const gr = g.createLinearGradient(0, 0, 0, H2); gr.addColorStop(0, '#05061a'); gr.addColorStop(0.5, '#120f3a'); gr.addColorStop(1, '#1d0f36');
  g.fillStyle = gr; g.fillRect(0, 0, W2, H2);
  const r = rng(7);
  for (let i = 0; i < 9; i++) { const x = r() * W2, y = r() * H2, rr = r.range(200, 520); const cg = g.createRadialGradient(x, y, 0, x, y, rr); const col = r.pick(['#3a2a8a', '#1a4a7a', '#5a2a6a', '#174a5a']); cg.addColorStop(0, hexA(col, 0.5)); cg.addColorStop(1, hexA(col, 0)); g.fillStyle = cg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) { const y0 = H2 * (0.15 + k * 0.12); for (let i = 0; i < 60; i++) { const x = (i / 60) * W2, y = y0 + Math.sin(i * 0.25 + k * 2) * 40; const lg = g.createLinearGradient(x, y - 90, x, y + 20); const col = ['#3fe0c5', '#8a6cff', '#3fb0ff'][k]; lg.addColorStop(0, hexA(col, 0)); lg.addColorStop(0.8, hexA(col, 0.05)); lg.addColorStop(1, hexA(col, 0)); g.fillStyle = lg; g.fillRect(x, y - 90, W2 / 60 + 1, 110); } }
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.8})`; const s = r() < 0.95 ? 1 : 2; g.fillRect(r() * W2, r() * H2, s, s); }
  for (let i = 0; i < 16; i++) {
    const x = r() * W2, y = r.range(H2 * 0.3, H2), s = r.range(0.4, 1.4);
    g.fillStyle = '#100c2a'; g.beginPath(); g.moveTo(x - 60 * s, y); g.lineTo(x + 60 * s, y); g.lineTo(x + 10 * s, y + 90 * s); g.lineTo(x - 5 * s, y + 110 * s); g.closePath(); g.fill();
    g.fillStyle = '#2a2560'; g.fillRect(x - 60 * s, y - 6 * s, 120 * s, 8 * s);
  }
  BG = c; BGsize = key;
  return c;
}

// ---------------------------------------------------------------- prop sprites
function crystalSprite(seed, scale, cols) {
  const r = rng(seed), w = 160 * scale, h = 220 * scale, c = mk(w, h), g = c.getContext('2d');
  g.translate(w / 2, h - 20 * scale);
  g.fillStyle = '#16122e'; g.beginPath(); g.ellipse(0, 0, 50 * scale, 16 * scale, 0, 0, TAU); g.fill();
  const shards = [], n = 4 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) shards.push({ x: r.range(-38, 38) * scale, hgt: r.range(50, 170) * scale, wd: r.range(12, 24) * scale, lean: r.range(-0.35, 0.35), col: r.pick(cols) });
  shards.sort((a, b) => b.hgt - a.hgt);
  for (const s of shards) {
    const tx = s.x + Math.sin(s.lean) * s.hgt, ty = -s.hgt, L = [s.x - s.wd, -4], M = [s.x, 4], Rr = [s.x + s.wd, -4];
    g.beginPath(); g.moveTo(...L); g.lineTo(tx, ty); g.lineTo(...M); g.closePath();
    const g1 = g.createLinearGradient(tx, ty, s.x, 0); g1.addColorStop(0, '#ffffff'); g1.addColorStop(0.25, s.col); g1.addColorStop(1, hexA(s.col, 0.55)); g.fillStyle = g1; g.fill();
    g.beginPath(); g.moveTo(...M); g.lineTo(tx, ty); g.lineTo(...Rr); g.closePath();
    const g2 = g.createLinearGradient(tx, ty, s.x, 0); g2.addColorStop(0, hexA(s.col, 0.9)); g2.addColorStop(1, '#1a1440'); g.fillStyle = g2; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.5 * scale; g.beginPath(); g.moveTo(...L); g.lineTo(tx, ty); g.stroke();
  }
  return { img: c, ox: w / 2, oy: h - 20 * scale, w, h };
}
function treeSprite(seed, scale) {
  const r = rng(seed), w = 420 * scale, h = 520 * scale, c = mk(w, h), g = c.getContext('2d');
  g.translate(w / 2, h - 30 * scale);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0, 0, 70 * scale, 20 * scale, 0, 0, TAU); g.fill();
  const pts = [[0, 0]]; let x = 0;
  for (let i = 1; i <= 6; i++) { x += r.range(-22, 22) * scale; pts.push([x, -i * 55 * scale]); }
  for (let pass = 0; pass < 2; pass++) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) { const p = pts[i - 1], q = pts[i]; g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
    g.strokeStyle = pass ? 'rgba(160,140,255,0.5)' : '#1f1938'; g.lineWidth = pass ? 3 * scale : 26 * scale; g.lineCap = 'round';
    if (pass) g.translate(-8 * scale, 0); g.stroke(); if (pass) g.translate(8 * scale, 0);
  }
  for (let i = 0; i < 6; i++) { const p = pts[3 + (i % 3)]; g.strokeStyle = '#1f1938'; g.lineWidth = 8 * scale; g.beginPath(); g.moveTo(p[0], p[1]); g.quadraticCurveTo(p[0] + (i % 2 ? 60 : -60) * scale, p[1] - 30 * scale, p[0] + (i % 2 ? 110 : -110) * scale * r.range(0.6, 1), p[1] - r.range(40, 90) * scale); g.stroke(); }
  const top = pts[pts.length - 1], cols = ['#87f5ff', '#c9a6ff', '#ff9fe0', '#6ad8ff'];
  for (let i = 0; i < 260; i++) {
    const a = r() * TAU, rr = Math.sqrt(r()) * 150 * scale, lx = top[0] + Math.cos(a) * rr, ly = top[1] + 30 * scale + Math.sin(a) * rr * 0.6, s = r.range(6, 13) * scale;
    g.fillStyle = hexA(r.pick(cols), r.range(0.55, 0.95)); g.beginPath(); g.moveTo(lx, ly - s); g.lineTo(lx + s * 0.55, ly); g.lineTo(lx, ly + s); g.lineTo(lx - s * 0.55, ly); g.closePath(); g.fill();
    if (r() < 0.3) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(lx - 1, ly - s * 0.6, 2, s * 0.5); }
  }
  return { img: c, ox: w / 2, oy: h - 30 * scale, w, h };
}
function lanternSprite(color) {
  const c = mk(40, 130), g = c.getContext('2d');
  g.translate(20, 124);
  g.fillStyle = '#1c1830'; g.fillRect(-6, -70, 12, 70); g.fillStyle = '#2c2850'; g.fillRect(-10, -76, 20, 8); g.fillRect(-12, -4, 24, 6);
  g.fillStyle = color; g.beginPath(); g.moveTo(0, -112); g.lineTo(8, -96); g.lineTo(0, -80); g.lineTo(-8, -96); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -108); g.lineTo(3, -96); g.lineTo(0, -90); g.fill();
  return { img: c, ox: 20, oy: 124, w: 40, h: 130 };
}

// ---------------------------------------------------------------- floor
export function paintFallbackChamber(ch, quality = 1) {
  const S = ch.shape && ch.shape.length > 2 ? ch.shape : [[-1000, -600], [1000, -600], [1000, 600], [-1000, 600]];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of S) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const PAD = 200, ox = x0 - PAD, oy = y0 - PAD, w = x1 - x0 + PAD * 2, h = y1 - y0 + PAD * 2 + 160;
  const FS = clamp(quality, 0.4, 1);
  const c = mk(w * FS, h * FS), e = mk(w * FS, h * FS), g = c.getContext('2d'), ge = e.getContext('2d');
  g.scale(FS, FS); ge.scale(FS, FS); g.translate(-ox, -oy); ge.translate(-ox, -oy);
  const r = rng(ch.seed ?? 99);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const path = (dy = 0, k = 1) => { g.beginPath(); S.forEach(([x, y], i) => { const px = cx + (x - cx) * k, py = cy + (y - cy) * k + dy; i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath(); };
  for (let d = 150; d > 0; d -= 6) { path(d, 1 - d * 0.0006); const t = d / 150; g.fillStyle = `rgb(${18 + 10 * (1 - t)},${16 + 10 * (1 - t)},${44 + 24 * (1 - t)})`; g.fill(); }
  for (let i = 0; i < 220; i++) {
    const k = Math.floor(r() * S.length), [x, y] = S[k]; if (y < cy) continue;
    const dy = r.range(10, 140);
    g.strokeStyle = r() < 0.15 ? hexA(r.pick(['#5ff0dc', '#b69bff']), 0.7) : 'rgba(120,110,200,0.12)'; g.lineWidth = r.range(1, 3);
    g.beginPath(); g.moveTo(x, y + dy); g.lineTo(x + r.range(-6, 6), y + dy + r.range(10, 40)); g.stroke();
  }
  path();
  const base = g.createRadialGradient(cx, cy, 100, cx, cy, Math.max(x1 - x0, y1 - y0) * 0.55); base.addColorStop(0, '#34407c'); base.addColorStop(1, '#232a5a');
  g.fillStyle = base; g.fill();
  g.save(); path(); g.clip();
  ge.save(); ge.beginPath(); S.forEach(([x, y], i) => (i ? ge.lineTo(x, y) : ge.moveTo(x, y))); ge.closePath(); ge.clip();
  const cw = 104, chh = 70, nx = Math.ceil((x1 - x0) / cw) + 3, ny = Math.ceil((y1 - y0) / chh) + 3;
  const V = [];
  for (let j = 0; j <= ny; j++) { V[j] = []; for (let i = 0; i <= nx; i++) V[j][i] = [x0 - cw + i * cw + (j % 2) * cw * 0.5 + r.range(-26, 26), y0 - chh + j * chh + r.range(-16, 16)]; }
  const slab = ['#3b4688', '#34407e', '#2e3872', '#414c92', '#384284', '#2b3468'];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = [V[j][i], V[j][i + 1], V[j + 1][i + 1], V[j + 1][i]];
    const qx = (p[0][0] + p[2][0]) / 2, qy = (p[0][1] + p[2][1]) / 2;
    const ip = p.map((q) => [lerp(q[0], qx, 0.07), lerp(q[1], qy, 0.09)]);
    g.beginPath(); ip.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    g.fillStyle = r.pick(slab); g.fill();
    const lg = g.createLinearGradient(qx - 40, qy - 30, qx + 40, qy + 30); lg.addColorStop(0, 'rgba(190,210,255,0.16)'); lg.addColorStop(0.45, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(0,0,20,0.28)');
    g.fillStyle = lg; g.fill();
    g.strokeStyle = 'rgba(10,10,30,0.55)'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(170,190,255,0.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(ip[3][0], ip[3][1]); g.lineTo(ip[0][0], ip[0][1]); g.lineTo(ip[1][0], ip[1][1]); g.stroke();
    if (r() < 0.16) { ge.strokeStyle = r() < 0.7 ? '#5ff0dc' : '#b69bff'; ge.lineWidth = r.range(1.5, 3); ge.lineCap = 'round'; ge.beginPath(); let x = qx + r.range(-20, 20), y = qy + r.range(-12, 12); ge.moveTo(x, y); for (let k = 0; k < 4; k++) { x += r.range(-22, 22); y += r.range(-12, 12); ge.lineTo(x, y); } ge.stroke(); }
  }
  const area = (x1 - x0) * (y1 - y0);
  for (let i = 0; i < area / 300; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(200,220,255,0.05)'; g.fillRect(r.range(x0, x1), r.range(y0, y1), r.range(1, 3), r.range(1, 2)); }
  for (let i = 0; i < 40; i++) {
    const x = r.range(x0, x1), y = r.range(y0, y1), rr = r.range(40, 140), col = r.pick(['#3fe0c5', '#8a6cff', '#ff7ad0', '#3fb0ff']);
    const cg = ge.createRadialGradient(x, y, 0, x, y, rr); cg.addColorStop(0, hexA(col, 0.22)); cg.addColorStop(1, hexA(col, 0)); ge.fillStyle = cg; ge.fillRect(x - rr, y - rr * 0.7, rr * 2, rr * 1.4);
    for (let k = 0; k < 6; k++) { const sx = x + r.range(-rr * 0.6, rr * 0.6), sy = y + r.range(-rr * 0.35, rr * 0.35), sh = r.range(6, 16); g.fillStyle = hexA(col, 0.85); g.beginPath(); g.moveTo(sx - 3, sy); g.lineTo(sx, sy - sh); g.lineTo(sx + 3, sy); g.closePath(); g.fill(); ge.fillStyle = hexA(col, 0.6); ge.beginPath(); ge.moveTo(sx - 2, sy); ge.lineTo(sx, sy - sh); ge.lineTo(sx + 2, sy); ge.fill(); }
  }
  ge.strokeStyle = '#ffd27a'; ge.lineWidth = 3;
  for (let k = 0; k < 3; k++) { ge.beginPath(); ge.ellipse(cx, cy, 150 + k * 26, (150 + k * 26) * 0.62, 0, 0, TAU); ge.globalAlpha = 0.55 - k * 0.14; ge.stroke(); }
  ge.globalAlpha = 0.7; ge.lineWidth = 2;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ge.beginPath(); ge.moveTo(cx + Math.cos(a) * 150, cy + Math.sin(a) * 93); ge.quadraticCurveTo(cx + Math.cos(a + 0.6) * 70, cy + Math.sin(a + 0.6) * 43, cx + Math.cos(a + 1.3) * 150, cy + Math.sin(a + 1.3) * 93); ge.stroke(); }
  ge.globalAlpha = 1;
  // hazards painted into the floor
  for (const z of ch.hazards || []) {
    if (z.type === 'pit' || z.type === 'void') { g.fillStyle = '#04030c'; g.beginPath(); g.ellipse(z.x, z.y, z.r, z.r, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(160,190,255,0.3)'; g.lineWidth = 3; g.stroke(); }
    else { g.fillStyle = z.type === 'molten' ? 'rgba(255,110,40,0.35)' : 'rgba(120,20,60,0.35)'; g.beginPath(); g.arc(z.x, z.y, z.r, 0, TAU); g.fill(); }
  }
  g.restore(); ge.restore();
  path(); g.strokeStyle = 'rgba(160,190,255,0.35)'; g.lineWidth = 4; g.stroke();
  path(4); g.strokeStyle = 'rgba(0,0,20,0.5)'; g.lineWidth = 4; g.stroke();
  // props: decoration plus obstacles
  const props = [];
  for (const p of ch.props || []) {
    if (p.type === 'tree') { const s = treeSprite(p.seed ?? 1, p.s ?? 1); props.push({ x: p.x, y: p.y, sortY: p.y, ...s }); }
    else if (p.type === 'crystal') { const s = crystalSprite(p.seed ?? 1, p.s ?? 1, [['#5ff0dc', '#b69bff'], ['#b69bff', '#ff9fe0'], ['#6ad8ff', '#5ff0dc']][Math.abs(p.seed ?? 0) % 3]); props.push({ x: p.x, y: p.y, sortY: p.y, ...s }); }
  }
  for (const o of ch.obstacles || []) {
    const s = o.type === 'lantern' ? lanternSprite('#8ff3ff') : crystalSprite(o.seed ?? Math.round(o.x * 7 + o.y), (o.r || 40) / 40, ['#5ff0dc', '#b69bff', '#ff9fe0']);
    props.push({ x: o.x, y: o.y, sortY: o.y, solid: true, ...s });
  }
  let rain = null;
  return {
    floor: c, glow: e, origin: { x: ox, y: oy }, w, h,
    glowPulse: (t) => 0.75 + Math.sin(t * 1.6) * 0.2,
    props,
    back(ctx, cam) { const bg = background(cam.w, cam.h); ctx.drawImage(bg, -cam.w * 0.2 - cam.x * 0.08 * cam.scale, -cam.h * 0.2 - cam.y * 0.08 * cam.scale); },
    ambient() {},
    front(ctx, cam, t, dt = 1 / 60) {
      if (!rain || rain.w !== cam.w) { rain = { w: cam.w, d: [] }; for (let i = 0; i < 260; i++) rain.d.push({ x: Math.random() * cam.w, y: Math.random() * cam.h, l: 10 + Math.random() * 18, s: 0.7 + Math.random() * 0.6 }); }
      const k = cam.h / 720;
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(160,200,255,0.16)'; ctx.lineWidth = 1.2 * k; ctx.beginPath();
      for (const d of rain.d) { d.y += 900 * d.s * dt * k; d.x -= 200 * d.s * dt * k; if (d.y > cam.h) { d.y = -20; d.x = Math.random() * cam.w * 1.2; } ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.25 * k, d.y + d.l * k); }
      ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
    },
    dark: { color: '#04051a', a: 0.8 }, tint: null,
    fallback: true,
  };
}

// ---------------------------------------------------------------- a hooded Hollow (placeholder foe)
export function drawFallbackFoe(ctx, e, G, P) {
  const t = P.t, s = (e.r || 22) / 22;
  const rise = e.state === 'spawn' ? clamp(e.st / 0.6, 0, 1) : 1;
  const dying = e.dead ? clamp((e.deadT || 0) / 0.9, 0, 1) : 0;
  if (dying >= 1) return;
  const fx = Math.cos(e.facing || 0), side = fx >= 0 ? 1 : -1;
  const wind = e.state === 'windup' ? clamp(e.st / 0.45, 0, 1) : 0, lunge = e.state === 'lunge';
  P.shadow(ctx, 0, 0, 24 * s, 8 * s, 0.45 * (1 - dying));
  ctx.save();
  ctx.globalAlpha = 1 - dying;
  ctx.scale(s * rise, s * (rise * (1 - dying * 0.4)));
  const shake = wind > 0.6 ? Math.sin(t * 90) * 1.5 : 0;
  ctx.translate(shake, 0);
  const hunch = lunge ? 0.35 : 0.12 + Math.sin(t * 3 + e.id) * 0.03 - wind * 0.1;
  ctx.transform(1, 0, -hunch * side, 1, 0, 0);
  const ink = '#0b0716', body = '#2a2a48', hi = '#4a4a78';
  // trailing threads
  ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
  for (let i = 0; i < 5; i++) { const x = -14 + i * 7, sw = Math.sin(t * 4 + i * 1.3 + e.id) * 6; ctx.beginPath(); ctx.moveTo(x, -6); ctx.quadraticCurveTo(x - side * 8 + sw, 2, x - side * 16 + sw, 4 + i % 2 * 3); ctx.stroke(); }
  // shroud
  ctx.beginPath(); ctx.moveTo(-6, -64); ctx.quadraticCurveTo(-22, -40, -20, -4);
  for (let i = 0; i < 6; i++) ctx.lineTo(-20 + i * 8 + 4, i % 2 ? -10 : -1);
  ctx.quadraticCurveTo(22, -40, 8, -64); ctx.closePath();
  ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.stroke();
  const g = ctx.createLinearGradient(-20, -64, 20, 0); g.addColorStop(0, hi); g.addColorStop(1, body); ctx.fillStyle = g; ctx.fill();
  // long arms with hooked claws, raised during the wind-up
  const armA = wind > 0 ? -1.4 * wind : lunge ? 0.3 : 0.9 + Math.sin(t * 3 + e.id) * 0.1;
  for (const k of [-1, 1]) {
    const sx = k * 12, sy = -46, ex = sx + Math.cos(armA * k * 0 + (k > 0 ? -0.2 : Math.PI + 0.2)) * 4 + k * 10, ey = sy + 30 + armA * 22;
    ctx.strokeStyle = ink; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + k * 10, (sy + ey) / 2, ex, ey); ctx.stroke();
    ctx.strokeStyle = body; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.strokeStyle = '#c8c8e8'; ctx.lineWidth = 1.6;
    for (let c = -1; c <= 1; c++) { ctx.beginPath(); ctx.moveTo(ex, ey); ctx.quadraticCurveTo(ex + k * 6 + c * 3, ey + 6, ex + k * 3 + c * 5, ey + 11); ctx.stroke(); }
  }
  // hood with one cold eye-slit
  ctx.beginPath(); ctx.moveTo(-12, -58); ctx.quadraticCurveTo(-14, -84, 2 + side * 6, -88); ctx.quadraticCurveTo(14, -80, 12, -58); ctx.closePath();
  ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.stroke(); ctx.fillStyle = '#34345a'; ctx.fill();
  ctx.fillStyle = '#05030c'; ctx.beginPath(); ctx.ellipse(side * 2, -68, 8, 7, 0, 0, TAU); ctx.fill();
  const eye = e.elite ? '#ff3d7a' : '#5ff0dc';
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = eye; ctx.fillRect(side * 2 - 5, -69, 10, 2.2);
  P.glow(ctx, side * 2, -68, 16 + wind * 20, eye, 0.7 + wind * 0.3);
  ctx.globalCompositeOperation = 'source-over';
  if (e.flash > 0) { ctx.globalAlpha = (e.flash / 0.1) * 0.85; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, -40, 20, 44, 0, 0, TAU); ctx.fill(); }
  ctx.restore(); ctx.globalAlpha = 1;
  e.light = { r: 90, color: eye, i: 0.5, y: -66 };
}

export function drawFallbackDoor(ctx, d, ch, t, P) {
  const open = !!d.open;
  ctx.save(); ctx.translate(d.x, d.y);
  ctx.fillStyle = '#1a1438'; ctx.beginPath(); ctx.ellipse(0, 0, 60, 20, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = open ? '#ffd27a' : '#5a5080'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-44, 0); ctx.lineTo(-44, -90); ctx.quadraticCurveTo(0, -140, 44, -90); ctx.lineTo(44, 0); ctx.stroke();
  if (open) { ctx.globalCompositeOperation = 'lighter'; P.glow(ctx, 0, -60, 90 + Math.sin(t * 3) * 8, '#ffd27a', 0.7); ctx.globalCompositeOperation = 'source-over'; }
  ctx.restore();
}

export function drawFallbackPickup(ctx, p, G, P) {
  const t = P.t, bob = Math.sin(t * 3 + (p.x || 0)) * 4;
  const col = p.color || { boon: '#ffd27a', heal: '#8ff5b0', run: '#ffe27a', lumen: '#bfe8ff', key: '#f2c46b', shard: '#c9a6ff', knot: '#ff9a6a', memory: '#ffe6a0' }[p.kind] || '#ffffff';
  P.shadow(ctx, p.x, p.y, 14, 5, 0.35);
  ctx.save(); ctx.translate(p.x, p.y - 34 + bob);
  ctx.globalCompositeOperation = 'lighter'; P.glow(ctx, 0, 0, 40, col, 0.8); ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = col; ctx.strokeStyle = '#120a1a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(9, 0); ctx.lineTo(0, 12); ctx.lineTo(-9, 0); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -8, 2, 6);
  ctx.restore();
}
