// Set-piece painters shared by several bosses: spike lanes (thorn / molten /
// void), expanding rings (song water, forge shockwave, undertow), burning
// pools, delayed bursts, Sable's slashing threads and snare tether, and the
// fallback for boss projectiles. Ground shapes are drawn exactly at their hit
// size (circles are circles in world space) so what you see is what hits.
import { TAU, clamp, lerp, hexA, srng, glow, shadow, spr, put } from './kit.js';

const T = {
  thorn: { core: '#e2fffa', mid: '#7ff0e0', deep: '#4b2f9a' },
  water: { core: '#eaffff', mid: '#6fd8ff', deep: '#1c4f9a' },
  molten: { core: '#fff3c0', mid: '#ff9a2a', deep: '#a3260a' },
  tide: { core: '#b8d8ff', mid: '#3f6fd8', deep: '#0b1440' },
  void: { core: '#f0dcff', mid: '#b06bff', deep: '#1a0830' },
  dawn: { core: '#fff0c8', mid: '#ff9f3a', deep: '#4a1a10' },
  storm: { core: '#ffffff', mid: '#a6f6ff', deep: '#20304a' },
  shade: { core: '#e8d8ff', mid: '#9a6cff', deep: '#120a24' },
};
export const THEMES = T;

export function thorn(g, x, y, ang, L, w, c, hi) {
  const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L;
  const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
  g.fillStyle = c;
  g.beginPath(); g.moveTo(x + nx, y + ny); g.quadraticCurveTo(x + Math.cos(ang) * L * 0.6 + nx * 0.4, y + Math.sin(ang) * L * 0.6 + ny * 0.4, ex, ey); g.lineTo(x - nx, y - ny); g.closePath(); g.fill();
  if (hi) { g.strokeStyle = hi; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x + nx * 0.6, y + ny * 0.6); g.lineTo(ex, ey); g.stroke(); }
}

export function spikeSprite(theme, i) {
  return spr('spike.' + theme + i, 64, 116, 32, 104, 2, (g) => {
    const R = srng(i * 13 + theme.length * 7 + 3);
    const n = 3 + Math.floor(R() * 2);
    const order = [];
    for (let j = 0; j < n; j++) order.push({ x: (R() - 0.5) * 32, h: 46 + R() * 50, w: 5 + R() * 5, lean: (R() - 0.5) * 0.5 });
    order.sort((a, b) => a.h - b.h).reverse();
    for (const { x, h, w, lean } of order) {
      const gr = g.createLinearGradient(x, 0, x + lean * h, -h);
      if (theme === 'thorn') { gr.addColorStop(0, '#0b0920'); gr.addColorStop(0.45, '#4b2f9a'); gr.addColorStop(1, '#e2fffa'); }
      else if (theme === 'molten') { gr.addColorStop(0, '#1a0804'); gr.addColorStop(0.35, '#7a1e08'); gr.addColorStop(0.7, '#f06414'); gr.addColorStop(1, '#fff1b0'); }
      else { gr.addColorStop(0, '#05040c'); gr.addColorStop(0.55, '#2a1450'); gr.addColorStop(1, '#e0c4ff'); }
      g.fillStyle = gr;
      if (theme === 'molten') {
        // molten: a jagged slab of cooling crust split by glowing cracks
        g.beginPath(); g.moveTo(x - w * 1.2, 0); g.lineTo(x - w * 0.8 + lean * h * 0.3, -h * 0.55); g.lineTo(x + lean * h, -h); g.lineTo(x + w * 0.9 + lean * h * 0.4, -h * 0.45); g.lineTo(x + w * 1.2, 0); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,230,150,0.9)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, -2); g.lineTo(x + lean * h * 0.4 + 2, -h * 0.4); g.lineTo(x + lean * h * 0.8, -h * 0.85); g.stroke();
      } else {
        g.beginPath(); g.moveTo(x - w, 0); g.quadraticCurveTo(x - w * 0.3 + lean * h * 0.5, -h * 0.6, x + lean * h, -h); g.quadraticCurveTo(x + w * 0.4 + lean * h * 0.5, -h * 0.5, x + w, 0); g.closePath(); g.fill();
        g.strokeStyle = theme === 'void' ? 'rgba(230,200,255,0.7)' : 'rgba(230,255,250,0.8)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x - w * 0.6, -2); g.quadraticCurveTo(x - w * 0.2 + lean * h * 0.5, -h * 0.6, x + lean * h, -h); g.stroke();
      }
    }
  });
}

export function drawSpikeLine(ctx, z, G) {
  const theme = z.theme === 'molten' ? 'molten' : z.theme === 'void' ? 'void' : 'thorn';
  const th = T[theme];
  const c = Math.cos(z.ang), s = Math.sin(z.ang);
  const step = 32;
  const n = Math.floor(z.len / step);
  if (z.wait > 0) {
    // cracks gathering before the line erupts
    ctx.strokeStyle = hexA(th.mid, 0.25 + (1 - z.wait / 0.6) * 0.5); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(z.x + c * z.len * (1 - z.wait / 0.6), z.y + s * z.len * (1 - z.wait / 0.6)); ctx.stroke();
    return;
  }
  const drop = z.front >= z.len ? clamp(1 + z.hold / 0.35, 0, 1) : 1;
  for (let i = 0; i < n; i++) {
    const d = i * step + 12;
    if (d > z.front) break;
    const since = (z.front - d) / (z.speed || 1000);
    const rise = clamp(since / 0.07, 0, 1) * drop;
    if (rise <= 0.02) continue;
    const j = (i * 7 + (z.seed | 0)) % 6;
    const x = z.x + c * d + ((j % 3) - 1) * 4, y = z.y + s * d;
    ctx.fillStyle = 'rgba(4,3,14,0.55)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 22, 8, 0, 0, TAU); ctx.fill();
    if (theme === 'molten') glow(ctx, x, y, 30, th.mid, 0.5 * rise);
    put(ctx, spikeSprite(theme, j), x, y + 4, 0, 0.85 + (i % 3) * 0.08, rise * (0.8 + ((i * 5) % 3) * 0.1));
    if (since < 0.14) glow(ctx, x, y - 24, 54, th.mid, (1 - since / 0.14) * 0.85);
  }
  if (z.front < z.len) { const x = z.x + c * z.front, y = z.y + s * z.front; glow(ctx, x, y - 12, 80, th.mid, 0.9); glow(ctx, x, y - 12, 24, th.core, 0.9); }
}

// Arcs of a ring minus its gaps.
function ringArcs(z) {
  if (!z.gaps || !z.gaps.length) return [[0, TAU]];
  const gs = z.gaps.map((g) => [g.a - g.arc / 2, g.a + g.arc / 2]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (let i = 0; i < gs.length; i++) { const a0 = gs[i][1], a1 = (i + 1 < gs.length ? gs[i + 1][0] : gs[0][0] + TAU); if (a1 > a0) out.push([a0, a1]); }
  return out;
}
export function drawWave(ctx, z, G) {
  const th = T[z.theme] || T.water;
  const fade = clamp((z.maxR - z.r) / 160, 0, 1) * clamp(z.r / 60, 0, 1);
  if (fade <= 0) return;
  const arcs = ringArcs(z);
  const grace = z.grace && z.age < z.grace;
  const stroke = (w, col, a) => { ctx.strokeStyle = hexA(col, a * fade); ctx.lineWidth = w; for (const [a0, a1] of arcs) { ctx.beginPath(); ctx.arc(z.x, z.y, z.r, a0, a1); ctx.stroke(); } };
  ctx.lineCap = 'round';
  // dark trough behind the crest, then the crest, then the hot core
  stroke(z.w * 2.2, th.deep, 0.35);
  ctx.globalCompositeOperation = 'lighter';
  stroke(z.w * 1.3, th.mid, grace ? 0.25 : 0.55);
  stroke(z.w * 0.45, th.core, grace ? 0.3 : 0.9);
  ctx.globalCompositeOperation = 'source-over';
  // foam / embers riding the crest
  const n = Math.min(64, Math.floor(z.r / 14));
  const R = srng((z.seed | 0) + 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.1;
    if (z.gaps && z.gaps.some((g) => Math.abs(((a - g.a + Math.PI * 3) % TAU) - Math.PI) < g.arc / 2)) continue;
    const rr = z.r + (R() - 0.5) * z.w;
    ctx.fillStyle = hexA(th.core, 0.6 * fade);
    ctx.fillRect(z.x + Math.cos(a) * rr - 1.5, z.y + Math.sin(a) * rr - 1.5 - (z.theme === 'molten' ? R() * 10 : 0), 3, 3);
  }
  // the edges of each gap glow so the way through reads at a glance
  if (z.gaps && z.gaps.length) for (const g of z.gaps) for (const s of [-1, 1]) { const a = g.a + s * g.arc / 2; glow(ctx, z.x + Math.cos(a) * z.r, z.y + Math.sin(a) * z.r, 26, th.core, 0.7 * fade); }
}

export function drawPool(ctx, z, G) {
  const molten = z.theme === 'aurum';
  const th = molten ? T.molten : T.water;
  const grow = clamp(z.age / 0.3, 0, 1), fade = clamp(z.life / 0.8, 0, 1);
  const r = z.r * (0.4 + grow * 0.6);
  const R = srng(z.seed | 0);
  ctx.save();
  ctx.globalAlpha = fade;
  // irregular blob
  ctx.fillStyle = molten ? '#3a0f04' : '#0b2040';
  ctx.beginPath();
  for (let i = 0; i <= 14; i++) { const a = (i / 14) * TAU, q = r * (0.82 + R() * 0.25); i ? ctx.lineTo(z.x + Math.cos(a) * q, z.y + Math.sin(a) * q) : ctx.moveTo(z.x + Math.cos(a) * q, z.y + Math.sin(a) * q); }
  ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.75 + 0.25 * Math.sin(G.t * 4 + (z.seed | 0));
  const gr = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, r);
  gr.addColorStop(0, hexA(th.core, 0.85 * pulse)); gr.addColorStop(0.5, hexA(th.mid, 0.6 * pulse)); gr.addColorStop(1, hexA(th.deep, 0));
  ctx.fillStyle = gr; ctx.fill();
  // crust cracks / bubbles
  ctx.strokeStyle = hexA(th.core, 0.5); ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) { const a = R() * TAU, q = R() * r * 0.7; const bx = z.x + Math.cos(a) * q, by = z.y + Math.sin(a) * q; const b = (G.t * 1.5 + i * 0.37) % 1; ctx.globalAlpha = fade * (1 - b); ctx.beginPath(); ctx.arc(bx, by, 2 + b * 6, 0, TAU); ctx.stroke(); }
  ctx.restore();
  if (molten) glow(ctx, z.x, z.y, r * 1.3, th.mid, 0.35 * fade);
}

export function drawBurst(ctx, z, G) {
  const th = T[z.theme] || T.void;
  if (!z.done) {
    const k = clamp(z.age / z.warn, 0, 1);
    // a dark sigil tightening to the strike
    ctx.strokeStyle = hexA(th.mid, 0.3 + k * 0.6); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (1.4 - k * 0.4), 0, TAU); ctx.stroke();
    ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(G.t * (z.theme === 'storm' ? 4 : 1.5));
    ctx.strokeStyle = hexA(th.core, 0.2 + k * 0.5); ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * z.r * 0.3, Math.sin(a) * z.r * 0.3); ctx.lineTo(Math.cos(a + 0.5) * z.r * (1 - k * 0.3), Math.sin(a + 0.5) * z.r * (1 - k * 0.3)); ctx.stroke(); }
    ctx.restore();
    if (z.theme === 'storm' && k > 0.6) glow(ctx, z.x, z.y - 300, 60, th.mid, (k - 0.6));
    return;
  }
  const f = 1 - clamp(z.life / 0.5, 0, 1);
  if (z.theme === 'storm') {
    // a bolt down from above
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(th.core, 1 - f); ctx.lineWidth = 4 * (1 - f) + 1;
    ctx.beginPath(); let x = z.x, y = z.y - 420; ctx.moveTo(x, y);
    const R = srng((z.x * 3 + z.y) | 0);
    for (let i = 0; i < 8; i++) { x = z.x + (R() - 0.5) * 50 * (1 - i / 8); y += 420 / 8; ctx.lineTo(x, y); }
    ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(th.mid, (1 - f) * 0.9); ctx.lineWidth = 10 * (1 - f) + 2;
  ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.6 + f * 0.6), 0, TAU); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = hexA(th.deep, (1 - f) * 0.6); ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.8 + f * 0.3), 0, TAU); ctx.fill();
  glow(ctx, z.x, z.y, z.r * 1.6, th.mid, (1 - f) * 0.9);
}

export function drawSlash(ctx, z, G) {
  const th = T[z.theme] || T.void;
  const dx = z.x2 - z.x, dy = z.y2 - z.y;
  if (z.age < z.warn) {
    const k = z.age / z.warn;
    // a loose black thread pulled taut across the arena, trembling
    ctx.strokeStyle = hexA('#05030a', 0.35 + k * 0.5); ctx.lineWidth = 2 + k * 2;
    const R = srng((z.x * 7 + z.y) | 0);
    const sag = (1 - k) * 40;
    ctx.beginPath(); ctx.moveTo(z.x, z.y);
    ctx.quadraticCurveTo((z.x + z.x2) / 2 + Math.sin(G.t * 30) * (1 - k) * 4, (z.y + z.y2) / 2 + sag, z.x2, z.y2); ctx.stroke();
    ctx.strokeStyle = hexA(th.mid, 0.15 + k * 0.5); ctx.lineWidth = 1; ctx.stroke();
    if (z.shadow) { const p = 0.5 - (1 - k) * 0.5; glow(ctx, z.x + dx * p * 0.2, z.y + dy * p * 0.2, 40, th.mid, k * 0.5); }
    return;
  }
  const f = clamp((z.age - z.warn) / 0.45, 0, 1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = hexA(th.mid, (1 - f) * 0.9); ctx.lineWidth = z.w * (1 - f * 0.7);
  ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(z.x2, z.y2); ctx.stroke();
  ctx.strokeStyle = hexA(th.core, 1 - f); ctx.lineWidth = Math.max(1, z.w * 0.25 * (1 - f));
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  // severed thread ends curling away
  ctx.strokeStyle = hexA('#05030a', 1 - f); ctx.lineWidth = 2;
  for (const [x, y, s] of [[z.x + dx * 0.1, z.y + dy * 0.1, 1], [z.x2 - dx * 0.1, z.y2 - dy * 0.1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + s * 30, y - 40 * f, x + s * 10, y - 70 * f); ctx.stroke();
  }
}

export function drawTether(ctx, z, G) {
  const bound = z.bound;
  const mx = (z.x + z.hx) / 2, my = (z.y + z.hy) / 2 - 50 - (bound ? 0 : 20);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#06040c'; ctx.lineWidth = bound ? 4 : 3;
  ctx.beginPath(); ctx.moveTo(z.x, z.y - 60); ctx.quadraticCurveTo(mx, my + (bound ? 30 : 0), z.hx, z.hy - 30); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA('#c86bff', bound ? 0.8 : 0.4); ctx.lineWidth = 1.4; ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  glow(ctx, z.hx, z.hy - 30, bound ? 40 : 20, '#c86bff', 0.8);
}

export function drawImpactFallback(ctx, z, G) {
  // anvils (Aurum) and anything else falling from above
  const k = clamp(z.age / z.fall, 0, 1);
  if (z.landed) {
    const f = 1 - clamp(z.life / 0.7, 0, 1);
    glow(ctx, z.x, z.y, z.r * 1.6, '#ff9a2a', (1 - f) * 0.9);
    return;
  }
  shadow(ctx, z.r * (0.25 + k * 0.6), z.r * 0.3 * (0.25 + k * 0.6), 0.55 * k, z.x, z.y);
}

export function drawShared(ctx, z, G, P) {
  switch (z.kind) {
    case 'boss:spikeLine': return drawSpikeLine(ctx, z, G);
    case 'boss:wave': return drawWave(ctx, z, G);
    case 'boss:pool': return drawPool(ctx, z, G);
    case 'boss:burst': return drawBurst(ctx, z, G);
    case 'boss:slash': return drawSlash(ctx, z, G);
    case 'boss:tether': return drawTether(ctx, z, G);
    case 'boss:impact': return drawImpactFallback(ctx, z, G);
  }
}

export function drawSharedProjectile(ctx, p, G) {
  const z = p.z ?? 40;
  shadow(ctx, p.r, p.r * 0.4, 0.4, p.x, p.y);
  const col = p.kind === 'boss:spark' ? '#ffb347' : p.kind === 'boss:gust' ? '#8ff5b0' : '#c86bff';
  glow(ctx, p.x, p.y - z, p.r * 2.6, col, 0.8);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x, p.y - z, p.r * 0.45, 0, TAU); ctx.fill();
}

export function drawSharedOverlay(ctx, G, P) {}
