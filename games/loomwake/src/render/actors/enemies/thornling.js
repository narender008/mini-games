// Thornling: a Hollow overgrown with glass briars. Crystal thorns crowd its
// back and shoulders; when it dies the briars glow hot pink for half a second
// (the warning), then burst outward.
import { begin, end, glow, rgba, sprite, drawSprite, clamp, TAU } from './kit.js';
import { drawHollowBody } from './hollow.js';

const THORN_COLS = ['#ff9fe0', '#9ff4ff', '#c9a6ff'];
function thornSprite(i) {
  return sprite('thorn|' + i, 16, 34, 8, 32, (g) => {
    const c = THORN_COLS[i % 3];
    g.beginPath(); g.moveTo(-5, 0); g.lineTo(0, -30); g.lineTo(1, 0); g.closePath(); g.fillStyle = c; g.fill();
    g.beginPath(); g.moveTo(1, 0); g.lineTo(0, -30); g.lineTo(5, 0); g.closePath(); g.fillStyle = 'rgba(40,20,80,0.75)'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-4, -1); g.lineTo(0, -29); g.stroke();
  });
}
// spikes on the back: [x, y, angle, scale, colour]
const SPIKES = [[-16, -58, -0.9, 0.9, 0], [-10, -66, -0.45, 1.1, 1], [-2, -66, -0.1, 0.8, 2], [-20, -46, -1.2, 0.8, 1], [-18, -32, -1.5, 0.6, 0], [6, -60, 0.3, 0.6, 0], [-6, -56, -0.7, 0.55, 2]];

function over(ctx, S) {
  const t = S.t, p = S.pose;
  // briar vines wound around the shroud
  ctx.strokeStyle = S.c('#3a1a48'); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-22, -20); ctx.bezierCurveTo(-8, -26, -18, -42, -4, -46); ctx.bezierCurveTo(4, -50, -6, -58, 6, -60); ctx.stroke();
  ctx.strokeStyle = rgba('#ff9fe0', 0.6 * (1 - S.dying)); ctx.lineWidth = 0.8; ctx.stroke();
  for (let i = 0; i < 6; i++) { const u = i / 5; const x = -22 + u * 28, y = -20 - u * 40; ctx.fillStyle = S.c(THORN_COLS[i % 3]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 5); ctx.lineTo(x + 1.5, y - 1); ctx.fill(); }
  const pulse = 0.5 + Math.sin(t * 3 + S.e.seed) * 0.2 + p.wind * 0.5;
  for (const [x, y, a, s, c] of SPIKES) {
    drawSprite(ctx, S, thornSprite(c), x, y, a + Math.sin(t * 2 + x) * 0.03, s, s);
    glow(ctx, x + Math.sin(a) * 14 * s, y - Math.cos(a) * 14 * s, 10 * s, THORN_COLS[c], 0.35 * pulse);
  }
}

export default function draw(ctx, e, G, P) {
  const S = begin(ctx, e, G, P);
  if (!S) return;
  drawHollowBody(ctx, S, { over });
  end(ctx, S);
  // the death warning: briars swell and glow before they burst
  if (e.state === 'dying') {
    const k = clamp(e.st / 0.5, 0, 1);
    if (k < 1) {
      glow(ctx, 0, -40, 50 + k * 70, '#ff4f9a', 0.4 + k * 0.6);
      glow(ctx, 0, -40, 24 + k * 30, '#ffffff', 0.3 * k + Math.sin(S.t * 40) * 0.15 * k);
    }
  }
}
