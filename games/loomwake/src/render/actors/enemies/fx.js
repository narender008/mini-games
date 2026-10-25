// Foe effects that live outside one foe's body: shockwave and song rings,
// lobbed molten hammers, the Unspooler's snare thread, and foe projectiles
// (needles, thorns, glass shards). World space (ctx at world scale, no
// per-foe translate). The renderer calls drawFoeFx once per frame after the
// ground decals, adds foeFxLights to its light list, and may hand foe
// projectiles of FOE_PROJECTILES kinds to drawFoeProjectile.
import { glow, rgba, sprite, mk, PAL, TAU, clamp, lerp } from './kit.js';

const hammerSpr = () => sprite('fx|hammer', 44, 44, 22, 22, (g) => {
  g.rotate(-0.4);
  g.fillStyle = '#2a1712'; g.fillRect(-2.5, -4, 5, 22);
  g.fillStyle = '#3a2a2a'; g.fillRect(-11, -14, 22, 12);
  g.fillStyle = '#ff9a3a'; g.fillRect(-11, -6, 22, 3);
  g.fillStyle = '#ffd48a'; g.fillRect(-9, -13, 4, 10);
  g.strokeStyle = '#ffcf7a'; g.lineWidth = 1; g.strokeRect(-11, -14, 22, 12);
});

export function drawFoeFx(ctx, G, P) {
  const L = G.foeFx; if (!L || !L.length) return;
  const t = G.t;
  for (const f of L) {
    if (f.delay > 0) continue;
    if (f.kind === 'shock') {
      const a = clamp(1 - f.r / f.r1, 0, 1);
      ctx.save();
      ctx.lineWidth = f.w; ctx.strokeStyle = rgba('#1a0610', 0.55 * a);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = f.w * 0.55; ctx.strokeStyle = rgba(f.color || '#ff6a8a', 0.55 * a + 0.15);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,240,240,' + (0.9 * a + 0.1) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r + f.w * 0.3, 0, TAU); ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'song') {
      const a = clamp(1 - f.r / f.r1, 0, 1) * 0.8 + 0.2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // drowning water: a blue band with a bright crest and pale notes riding it
      ctx.lineWidth = f.w; ctx.strokeStyle = rgba(f.color || '#7fd0ff', 0.28 * a);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = rgba('#e8fbff', 0.85 * a);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r + f.w * 0.35, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = rgba('#ff7a9a', 0.6 * a);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r - f.w * 0.4, 0, TAU); ctx.stroke();
      const n = Math.max(6, Math.floor(f.r / 30));
      ctx.fillStyle = rgba('#fff2c0', 0.8 * a);
      for (let i = 0; i < n; i++) {
        const an = (i / n) * TAU + f.t * 0.6, x = f.x + Math.cos(an) * f.r, y = f.y + Math.sin(an) * f.r - 6 - Math.sin(t * 6 + i) * 4;
        ctx.beginPath(); ctx.ellipse(x, y, 3, 2.2, -0.4, 0, TAU); ctx.fill(); ctx.fillRect(x + 2, y - 9, 1.2, 9);
      }
      ctx.restore();
    } else if (f.kind === 'lob') {
      // shadow on the floor grows as it falls
      const k = clamp(f.t / f.dur, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.25 + k * 0.35) + ')';
      ctx.beginPath(); ctx.ellipse(f.x, f.y, 10 + k * 10, 4 + k * 4, 0, 0, TAU); ctx.fill();
      glow(ctx, f.x, f.y - f.z, 34, '#ff8a2a', 0.8);
      // ember trail
      for (let i = 1; i < 5; i++) {
        const kk = clamp(k - i * 0.04, 0, 1);
        const x = lerp(f.x0, f.tx, kk), y = lerp(f.y0, f.ty, kk), z = lerp(f.z0, 0, kk) + Math.sin(kk * Math.PI) * 170;
        glow(ctx, x, y - z, 14 - i * 2, '#ffb04a', 0.5 - i * 0.08);
      }
      const s = hammerSpr();
      ctx.save(); ctx.translate(f.x, f.y - f.z); ctx.rotate(f.spin || 0); ctx.drawImage(s.c, -s.ax, -s.ay); ctx.restore();
    } else if (f.kind === 'snare') {
      const s = f.src; if (!s) continue;
      const hx = s.x + Math.cos(f.a) * 16, hy = s.y - (s.z || 0) - 50 - (s.float || 0);
      let tx = f.x, ty = f.y;
      const taut = f.state === 'hold';
      const snap = f.state === 'snap' ? clamp((f.snapT || 0) / 0.3, 0, 1) : 0;
      const mx = (hx + tx) / 2 + (taut ? 0 : Math.sin(f.t * 30) * 8), my = (hy + ty) / 2 + (taut ? -4 : 14 + snap * 30);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 1 - snap;
      ctx.strokeStyle = '#05040c'; ctx.lineWidth = taut ? 4 : 3;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#b8a0ff', taut ? 0.8 + Math.sin(t * 30) * 0.2 : 0.5); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
      ctx.restore();
      glow(ctx, tx, ty, taut ? 34 : 22, '#9a7cff', 0.8 * (1 - snap));
      if (taut) glow(ctx, tx, ty, 60, '#ff2d6a', 0.25);
    }
  }
}

export function foeFxLights(G) {
  const out = [];
  const L = G.foeFx; if (!L) return out;
  for (const f of L) {
    if (f.delay > 0) continue;
    if (f.kind === 'lob') out.push({ x: f.x, y: f.y - f.z, r: 140, color: '#ff8a2a', i: 0.8 });
    else if (f.kind === 'song') out.push({ x: f.x, y: f.y, r: f.r + 60, color: '#7fd0ff', i: 0.35 * (1 - f.r / f.r1) });
    else if (f.kind === 'shock') out.push({ x: f.x, y: f.y, r: f.r + 40, color: '#ff6a8a', i: 0.35 * (1 - f.r / f.r1) });
    else if (f.kind === 'snare') out.push({ x: f.x, y: f.y, r: 90, color: '#9a7cff', i: 0.6 });
  }
  return out;
}

// ---------- foe projectiles ----------
export const FOE_PROJECTILES = ['needle', 'thorn', 'glassShard'];
export function drawFoeProjectile(ctx, p, G) {
  const a = p.angle ?? Math.atan2(p.vy, p.vx);
  const x = p.x, y = p.y - (p.z || 0);
  const col = p.color || '#a8f6ff';
  // floor shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 6, 2.4, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  if (p.kind === 'needle') {
    glow(ctx, -6, 0, 22, col, 0.7);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, 0.45); ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(0, 0); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05040c';
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-14, -2.2); ctx.lineTo(-16, 0); ctx.lineTo(-14, 2.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-12, -1.2); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-15, 0, 1.6, 0, TAU); ctx.fill();
  } else if (p.kind === 'thorn' || p.kind === 'glassShard') {
    glow(ctx, 0, 0, 20, col, 0.6);
    ctx.fillStyle = p.kind === 'thorn' ? '#ff9ad8' : '#b8f8ff';
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-6, -4); ctx.lineTo(-9, 0); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-4, -2); ctx.lineTo(-2, 0); ctx.fill();
  }
  ctx.restore();
}
export function foeProjectileLight(p) { return { x: p.x, y: p.y - (p.z || 0), r: 70, color: p.color || '#a8f6ff', i: 0.5 }; }
